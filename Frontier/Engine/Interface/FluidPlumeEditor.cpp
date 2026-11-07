/*==========================================================================================================================================
                                                          FLUIDPLUMEEDITOR.CPP
==========================================================================================================================================*/
// 🧩 Full-window 1:1 Gas & Explosion Fluid Editor (ported from Experimental/Fluid): multi-document tabs, scene outliner, 3D
//    volumetric raymarched viewport with interactive orbit/brush/detonate/collider tools, 3-tab inspector, .fluidspace /
//    .gasscene.toml sidecar persistence, and transparent RGBA flipbook sprite-sheet baker.

#include "Engine/Interface/FluidPlumeEditor.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/FluidEditor/FluidViewportPresentation.h"
#include "Engine/Interface/ControlKit.h"
#include "Engine/Interface/DropdownControls.h"
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "UI/TextureStudio/PanelChrome.h"
#include "Engine/Interface/Inspectors/FluidPlumeInspector.h"
#include "Engine/PhysicalDynamics/FluidDynamics/FluidSceneSpecification.h"
#include "Engine/PhysicalDynamics/FluidDynamics/FluidSpaceCodec.h"
#include "Engine/Scene/SceneDirectory.h"

#include <imgui.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace Frontier
{

namespace
{

//------------------------------------------------------------------------------------------------------------------------
//                                      SELF-CONTAINED RGBA PNG WRITER (FLIPBOOK EXPORT)
//------------------------------------------------------------------------------------------------------------------------

uint32_t ComputeCrc32(const uint8_t* Data, size_t Length) noexcept
{
    uint32_t Crc = 0xFFFFFFFFu;
    for (size_t Index = 0; Index < Length; ++Index)
    {
        Crc ^= Data[Index];
        for (int Bit = 0; Bit < 8; ++Bit)
        {
            Crc = (Crc >> 1u) ^ (0xEDB88320u & (0u - (Crc & 1u)));
        }
    }
    return ~Crc;
}

void AppendBigEndian32(std::vector<uint8_t>& Stream, uint32_t Value)
{
    Stream.push_back(static_cast<uint8_t>((Value >> 24u) & 0xFFu));
    Stream.push_back(static_cast<uint8_t>((Value >> 16u) & 0xFFu));
    Stream.push_back(static_cast<uint8_t>((Value >> 8u) & 0xFFu));
    Stream.push_back(static_cast<uint8_t>(Value & 0xFFu));
}

void AppendPngChunk(std::vector<uint8_t>& Stream, const char Type[4], const uint8_t* Payload, size_t Length)
{
    AppendBigEndian32(Stream, static_cast<uint32_t>(Length));
    const size_t TypeOffset = Stream.size();
    Stream.insert(Stream.end(), Type, Type + 4);
    if (Length > 0u)
    {
        Stream.insert(Stream.end(), Payload, Payload + Length);
    }
    const uint32_t Crc = ComputeCrc32(Stream.data() + TypeOffset, 4u + Length);
    AppendBigEndian32(Stream, Crc);
}

bool WriteUncompressedRgbaPng(const std::filesystem::path& FilePath, uint32_t Width, uint32_t Height,
                              const std::vector<uint8_t>& Rgba)
{
    if (Width == 0u || Height == 0u || Rgba.size() < static_cast<size_t>(Width) * Height * 4u)
    {
        return false;
    }

    std::vector<uint8_t> RawScanlines;
    RawScanlines.reserve(static_cast<size_t>(Height) * (1u + static_cast<size_t>(Width) * 4u));
    for (uint32_t Row = 0u; Row < Height; ++Row)
    {
        RawScanlines.push_back(0u);
        const uint8_t* Src = Rgba.data() + static_cast<size_t>(Row) * Width * 4u;
        RawScanlines.insert(RawScanlines.end(), Src, Src + static_cast<size_t>(Width) * 4u);
    }

    std::vector<uint8_t> ZlibStream;
    ZlibStream.reserve(RawScanlines.size() + (RawScanlines.size() / 65535u + 2u) * 5u + 6u);
    ZlibStream.push_back(0x78u);
    ZlibStream.push_back(0x01u);

    uint32_t AdlerA = 1u;
    uint32_t AdlerB = 0u;
    for (uint8_t Byte : RawScanlines)
    {
        AdlerA = (AdlerA + Byte) % 65521u;
        AdlerB = (AdlerB + AdlerA) % 65521u;
    }

    size_t Offset = 0u;
    while (Offset < RawScanlines.size())
    {
        const size_t Chunk   = std::min<size_t>(65535u, RawScanlines.size() - Offset);
        const bool   IsFinal = (Offset + Chunk) >= RawScanlines.size();
        ZlibStream.push_back(IsFinal ? 0x01u : 0x00u);
        const uint16_t Len  = static_cast<uint16_t>(Chunk);
        const uint16_t NLen = static_cast<uint16_t>(~Len);
        ZlibStream.push_back(static_cast<uint8_t>(Len & 0xFFu));
        ZlibStream.push_back(static_cast<uint8_t>((Len >> 8u) & 0xFFu));
        ZlibStream.push_back(static_cast<uint8_t>(NLen & 0xFFu));
        ZlibStream.push_back(static_cast<uint8_t>((NLen >> 8u) & 0xFFu));
        ZlibStream.insert(ZlibStream.end(), RawScanlines.data() + Offset, RawScanlines.data() + Offset + Chunk);
        Offset += Chunk;
    }
    AppendBigEndian32(ZlibStream, (AdlerB << 16u) | AdlerA);

    std::vector<uint8_t> PngBytes = { 137u, 80u, 78u, 71u, 13u, 10u, 26u, 10u };
    uint8_t              Ihdr[13]{};
    Ihdr[0]  = static_cast<uint8_t>((Width >> 24u) & 0xFFu);
    Ihdr[1]  = static_cast<uint8_t>((Width >> 16u) & 0xFFu);
    Ihdr[2]  = static_cast<uint8_t>((Width >> 8u) & 0xFFu);
    Ihdr[3]  = static_cast<uint8_t>(Width & 0xFFu);
    Ihdr[4]  = static_cast<uint8_t>((Height >> 24u) & 0xFFu);
    Ihdr[5]  = static_cast<uint8_t>((Height >> 16u) & 0xFFu);
    Ihdr[6]  = static_cast<uint8_t>((Height >> 8u) & 0xFFu);
    Ihdr[7]  = static_cast<uint8_t>(Height & 0xFFu);
    Ihdr[8]  = 8u;
    Ihdr[9]  = 6u;
    Ihdr[10] = 0u;
    Ihdr[11] = 0u;
    Ihdr[12] = 0u;
    AppendPngChunk(PngBytes, "IHDR", Ihdr, sizeof(Ihdr));
    AppendPngChunk(PngBytes, "IDAT", ZlibStream.data(), ZlibStream.size());
    AppendPngChunk(PngBytes, "IEND", nullptr, 0u);

    std::error_code Error;
    if (FilePath.has_parent_path())
    {
        std::filesystem::create_directories(FilePath.parent_path(), Error);
    }
    std::ofstream Output(FilePath, std::ios::binary | std::ios::trunc);
    if (!Output) return false;
    Output.write(reinterpret_cast<const char*>(PngBytes.data()), static_cast<std::streamsize>(PngBytes.size()));
    return Output.good();
}

//------------------------------------------------------------------------------------------------------------------------
//                                             DOCUMENT & EDITOR SESSION STATE
//------------------------------------------------------------------------------------------------------------------------

enum class OutlinerNodeId : int
{
    Domain   = 0,
    Source   = 1,
    Collider = 2,
    Sun      = 3
};

struct FluidDocumentTab
{
    std::string                                        Title           = "Untitled.fluidspace";
    std::string                                        PresetIdentity  = "fuel_air_blast";
    std::filesystem::path                              FilePath{};
    FluidDynamics::FluidSceneDocument                  Scene{};
    std::vector<FluidDynamics::FluidSceneDocument>     UndoStack{};
    std::vector<FluidDynamics::FluidSceneDocument>     RedoStack{};
    bool                                               Dirty           = false;
    bool                                               RestartPending  = true;
    bool                                               StepOncePending = false;
    float                                              BrushRadius     = 0.08f;
    std::vector<FluidBlastImpulse>                     PendingBlasts{};
    FluidDynamics::FluidBurstPattern                   BurstPattern    = FluidDynamics::FluidBurstPattern::SingleBurst;
    uint32_t                                           GpuSlot         = 0u;
};

struct FlipbookExportState
{
    bool                  DialogOpen    = false;
    bool                  Recording     = false;
    int                   Columns       = 4;
    int                   Rows          = 4;
    int                   FrameWidth    = 256;
    int                   FrameHeight   = 256;
    float                 DurationSec   = 2.0f;
    bool                  DetonateStart = true;
    int                   Captured      = 0;
    std::vector<uint8_t>  SheetRgba{};
    char                  OutputPath[256] = "FlipbookExplosion_4x4.png";
    std::string           LastMessage{};
};

struct FluidEditorSession
{
    RecordToken                     BoundToken{};
    std::vector<FluidDocumentTab>   Tabs{};
    int                             ActiveTab            = 0;
    int                             ActiveInspector      = 0;   // 0 = Source, 1 = Simulation, 2 = Rendering
    int                             ActiveViewportTool   = 1;   // 0 = Orbit, 1 = Flame Brush, 2 = Blast, 3 = Collider
    OutlinerNodeId                  SelectedNode         = OutlinerNodeId::Source;
    int                             RenamingNode         = -1;
    char                            RenameField[96]      = {};
    char                            OutlinerSearch[96]   = {};
    int                             OutlinerFilter       = 0;
    char                            PresetSearch[96]     = {};
    int                             PresetFilter         = 0;
    char                            ImportPathField[256] = {};
    bool                            ShowImportModal      = false;
    bool                            ShowOutliner         = true;
    bool                            ShowInspector        = true;
    bool                            ShowStatusBar        = true;
    bool                            ShowDomainWire       = true;
    bool                            ShowHudOverlay       = true;

    std::array<float, 3>            PreviousBrushUvw     = { 0.5f, 0.35f, 0.5f };
    bool                            HasPreviousBrush     = false;

    FluidViewportImage              LastImage{};
    FlipbookExportState             Flipbook{};
    std::string                     StatusNotice         = "Ready \xC2\xB7 3D Eulerian Gas & Combustion Solver";
};

FluidEditorSession& AccessSession() noexcept
{
    static FluidEditorSession Session;
    return Session;
}

const char* FluidSliderUnit(const char* Id) noexcept
{
    const std::string_view Key = Id != nullptr ? Id : "";
    if (Key == "##FgBw" || Key == "##FgBh" || Key == "##FsRad" || Key == "##FsHgt" || Key == "##FoRad") return "m";
    if (Key == "##FlSunEl" || Key == "##FlSunAz") return "°";
    if (Key == "##FgTime" || Key == "##FrScale" || Key == "##FgSurge" || Key == "##FsRate" ||
        Key == "##FlTempK" || Key == "##FeLife") return "×";
    return "—";
}

bool FluidSliderRow(const InspectorPalette& Palette, const EditorTypefaces& Faces, const char* Id, const char* Label,
                    float& Value, float Minimum, float Maximum, const char* DisplayFormat)
{
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float Width = std::max(200.0f, ImGui::GetContentRegionAvail().x);
    constexpr float LabelHeight = 16.0f;
    constexpr float GroupGap = 9.0f;
    constexpr float ControlHeight = 30.0f;
    constexpr float ValueWidth = 92.0f;
    constexpr float ValueHeight = 28.0f;
    constexpr float UnitWidth = 34.0f;
    constexpr float ControlGap = 10.0f;
    constexpr float BottomMargin = 17.0f;
    constexpr float RowHeight = LabelHeight + GroupGap + ControlHeight + BottomMargin;
    const float ControlY = Origin.y + LabelHeight + GroupGap;
    const float SliderX = Origin.x + ValueWidth + ControlGap;
    const float SliderWidth = std::max(32.0f, Width - ValueWidth - ControlGap);
    const float ThumbSize = 24.0f;
    const float Fraction = Maximum > Minimum ? std::clamp((Value - Minimum) / (Maximum - Minimum), 0.0f, 1.0f) : 0.0f;
    const float ThumbCentreX = SliderX + ThumbSize * 0.5f + Fraction * std::max(0.0f, SliderWidth - ThumbSize);

    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddText(Faces.Regular, 12.0f, Origin, IM_COL32(162, 162, 162, 255), Label);

    char Number[32]{};
    std::string_view Format = DisplayFormat != nullptr ? DisplayFormat : "%.2f";
    const size_t Start = Format.find('%');
    size_t Conversion = std::string_view::npos;
    if (Start != std::string_view::npos)
    {
        for (size_t Index = Start + 1; Index < Format.size(); ++Index)
        {
            if (std::string_view("fFeEgG").find(Format[Index]) != std::string_view::npos)
            {
                Conversion = Index;
                break;
            }
        }
    }
    if (Conversion != std::string_view::npos)
    {
        const std::string NumericFormat(Format.substr(Start, Conversion - Start + 1));
        std::snprintf(Number, sizeof(Number), NumericFormat.c_str(), static_cast<double>(Value));
    }
    else
    {
        std::snprintf(Number, sizeof(Number), "%.2f", static_cast<double>(Value));
    }

    PixelSpace Surface;
    const ImGuiIO& Io = ImGui::GetIO();
    (void)Surface.Begin(SurfaceLayer::Window, Io.DisplaySize.x, Io.DisplaySize.y, 1.0f);
    const float PillY = ControlY + (ControlHeight - ValueHeight) * 0.5f;
    const PlaneExtent Pill = Spanning(Origin.x, PillY, ValueWidth, ValueHeight);
    const PlaneExtent NumberCell = Spanning(Origin.x, PillY, ValueWidth - UnitWidth, ValueHeight);
    const PlaneExtent UnitCell = Spanning(Origin.x + ValueWidth - UnitWidth, PillY, UnitWidth, ValueHeight);
    Surface.FillRectangle(Pill, ColorQuad{ 0.0f, 0.0f, 0.0f, 1.0f }, ValueHeight * 0.5f);
    const ColorQuad UnitFill{ 0x1A / 255.0f, 0x1A / 255.0f, 0x1A / 255.0f, 1.0f };
    Surface.FillRectangle(UnitCell, UnitFill, ValueHeight * 0.5f);
    Surface.FillRectangle(Spanning(UnitCell.MinimumX, PillY, UnitWidth * 0.5f, ValueHeight), UnitFill);
    Surface.FillRectangle(Spanning(UnitCell.MinimumX, PillY, 1.0f, ValueHeight), ColorQuad{ 1.0f, 1.0f, 1.0f, 0.05f });
    ControlKit::OutlineRounded(Surface, Pill, ColorQuad{ 1.0f, 1.0f, 1.0f, 0.05f }, ValueHeight * 0.5f);
    const ImVec2 NumberSize = ImGui::CalcTextSize(Number);
    Draw->AddText(Faces.Regular, 12.0f,
                  ImVec2(NumberCell.MinimumX + (NumberCell.Width() - NumberSize.x) * 0.5f,
                         PillY + (ValueHeight - NumberSize.y) * 0.5f),
                  IM_COL32(240, 240, 240, 255), Number);
    const char* Unit = FluidSliderUnit(Id);
    const ImVec2 UnitSize = ImGui::CalcTextSize(Unit);
    Draw->AddText(Faces.Regular, 10.0f,
                  ImVec2(UnitCell.MinimumX + (UnitCell.Width() - UnitSize.x) * 0.5f,
                         PillY + (ValueHeight - UnitSize.y) * 0.5f),
                  IM_COL32(117, 117, 117, 255), Unit);

    ImGui::PushID(Id);
    const ImVec2 HitMin(SliderX, ControlY);
    ImGui::SetCursorScreenPos(HitMin);
    ImGui::InvisibleButton("##FluidSlider", ImVec2(SliderWidth, ControlHeight));
    const bool Active = ImGui::IsItemActive();
    const bool Hovered = ImGui::IsItemHovered();
    const float TrackY = ControlY + (ControlHeight - 26.0f) * 0.5f;
    const PlaneExtent Track = Spanning(SliderX, TrackY, SliderWidth, 26.0f);
    const float FillWidth = std::max(24.0f, ThumbSize * 0.5f + std::max(0.0f, SliderWidth - ThumbSize) * Fraction);
    Surface.FillRectangle(Track, ColorQuad{ 0x22 / 255.0f, 0x22 / 255.0f, 0x22 / 255.0f, 1.0f }, 13.0f);
    Surface.FillRectangle(Spanning(Track.MinimumX, Track.MinimumY, std::min(FillWidth, SliderWidth), Track.Height()),
                          ColorQuad{ 0x4A / 255.0f, 0x4A / 255.0f, 0x4A / 255.0f, 1.0f }, 13.0f);
    Surface.FillRectangle(Spanning(ThumbCentreX - ThumbSize * 0.5f, TrackY + 2.0f, ThumbSize, ThumbSize),
                          ColorQuad{ 0.0f, 0.0f, 0.0f, 0.35f }, 12.0f);
    Surface.FillRectangle(Spanning(ThumbCentreX - ThumbSize * 0.5f, TrackY + 1.0f, ThumbSize, ThumbSize),
                          ColorQuad{ 0xE0 / 255.0f, 0xE0 / 255.0f, 0xE0 / 255.0f, 1.0f }, 12.0f);
    if (Active || Hovered)
    {
        Draw->AddRect(ImVec2(ThumbCentreX - ThumbSize * 0.5f, TrackY + 1.0f),
                      ImVec2(ThumbCentreX + ThumbSize * 0.5f, TrackY + 1.0f + ThumbSize),
                      IM_COL32(255, 255, 255, 30), 12.0f);
    }
    ControlPointer Pointer{};
    Pointer.X = Io.MousePos.x;
    Pointer.Y = Io.MousePos.y;
    Pointer.Down = ImGui::IsMouseDown(ImGuiMouseButton_Left);
    Pointer.Pressed = ImGui::IsItemActivated();
    Pointer.Released = ImGui::IsMouseReleased(ImGuiMouseButton_Left);
    Pointer.Enabled = Active || Hovered;
    bool Changed = false;
    if (Active && Pointer.Down && SliderWidth > ThumbSize)
    {
        const float Ratio = std::clamp((Pointer.X - SliderX - ThumbSize * 0.5f) / (SliderWidth - ThumbSize), 0.0f, 1.0f);
        const float Candidate = Minimum + Ratio * (Maximum - Minimum);
        if (std::fabs(Candidate - Value) > 1.0e-6f)
        {
            Value = Candidate;
            Changed = true;
        }
    }
    ImGui::PopID();

    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + RowHeight - ImGui::GetStyle().ItemSpacing.y));
    ImGui::Dummy(ImVec2(Width, 0.0f));
    return Changed;
}

bool FluidSegmentedPropertyRow(const EditorTypefaces& Faces, const char* Id, const char* Label,
                               int& Selected, const char* const* Labels, int Count)
{
    if (Count <= 0) return false;
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float Width = std::max(100.0f, ImGui::GetContentRegionAvail().x);
    constexpr float LabelHeight = 16.0f;
    constexpr float GroupGap = 9.0f;
    constexpr float ControlHeight = 34.0f;
    constexpr float BottomMargin = 17.0f;
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddText(Faces.Regular, 12.0f, Origin, IM_COL32(162, 162, 162, 255), Label);
    const float Y = Origin.y + LabelHeight + GroupGap;
    const float CellWidth = Width / static_cast<float>(Count);
    const PlaneExtent Outer = Spanning(Origin.x, Y, Width, ControlHeight);
    Draw->AddRectFilled(ImVec2(Outer.MinimumX, Outer.MinimumY), ImVec2(Outer.MaximumX, Outer.MaximumY), IM_COL32(8, 8, 8, 255), 17.0f);
    Draw->AddRect(ImVec2(Outer.MinimumX, Outer.MinimumY), ImVec2(Outer.MaximumX, Outer.MaximumY), IM_COL32(255, 255, 255, 18), 17.0f);
    bool Changed = false;
    for (int Index = 0; Index < Count; ++Index)
    {
        const ImVec2 Cell(Origin.x + static_cast<float>(Index) * CellWidth + 3.0f, Y + 3.0f);
        const float CellH = ControlHeight - 6.0f;
        ImGui::PushID(Id);
        ImGui::PushID(Index);
        ImGui::SetCursorScreenPos(Cell);
        const bool Clicked = ImGui::InvisibleButton("##FluidSegment", ImVec2(std::max(1.0f, CellWidth - 6.0f), CellH));
        const bool Hovered = ImGui::IsItemHovered();
        if (Clicked && Selected != Index) { Selected = Index; Changed = true; }
        if (Selected == Index || Hovered)
        {
            Draw->AddRectFilled(Cell, ImVec2(Cell.x + std::max(1.0f, CellWidth - 6.0f), Cell.y + CellH),
                                Selected == Index ? IM_COL32(41, 41, 41, 255) : IM_COL32(255, 255, 255, 10), 14.0f);
        }
        const ImVec2 TextSize = ImGui::CalcTextSize(Labels[Index]);
        Draw->AddText(ImVec2(Cell.x + (CellWidth - TextSize.x) * 0.5f,
                             Cell.y + (CellH - TextSize.y) * 0.5f),
                      Selected == Index ? IM_COL32(239, 239, 239, 255) : IM_COL32(142, 142, 142, 255), Labels[Index]);
        ImGui::PopID();
        ImGui::PopID();
    }
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Y + ControlHeight + BottomMargin - ImGui::GetStyle().ItemSpacing.y));
    ImGui::Dummy(ImVec2(Width, 0.0f));
    return Changed;
}

void FluidPropertyHint(const EditorTypefaces& Faces, const char* Text)
{
    if (Text == nullptr || Text[0] == '\0') return;
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float Width = std::max(100.0f, ImGui::GetContentRegionAvail().x);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddText(Faces.Regular, 10.0f, Origin, IM_COL32(119, 119, 119, 255), Text, nullptr, Width);
    const ImVec2 Size = Faces.Regular != nullptr ? Faces.Regular->CalcTextSizeA(10.0f, Width, 0.0f, Text, nullptr) : ImGui::CalcTextSize(Text, nullptr, false, Width);
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + Size.y + 17.0f - ImGui::GetStyle().ItemSpacing.y));
    ImGui::Dummy(ImVec2(Width, 0.0f));
}

bool SliderIntRow(const InspectorPalette& Palette, const EditorTypefaces& Faces, const char* Id, const char* Label,
                  int& Value, int MinValue, int MaxValue, const char* Suffix = "")
{
    float Temp = static_cast<float>(Value);
    char Format[24]{};
    std::snprintf(Format, sizeof(Format), "%%.0f%s", Suffix != nullptr ? Suffix : "");
    if (FluidSliderRow(Palette, Faces, Id, Label, Temp, static_cast<float>(MinValue), static_cast<float>(MaxValue), Format))
    {
        Value = static_cast<int>(std::lround(Temp));
        return true;
    }
    return false;
}

using FluidSectionCardBounds = std::vector<std::pair<float, float>>;

void CloseFluidSection(FluidSectionCardBounds& Cards, float& CurrentTop, bool& CurrentOpen)
{
    if (CurrentTop < 0.0f) return;
    if (CurrentOpen)
    {
        ImGui::Unindent(12.0f);
        ImGui::Dummy(ImVec2(1.0f, std::max(0.0f, 20.0f - ImGui::GetStyle().ItemSpacing.y)));
    }
    ImGui::Unindent(8.0f);
    const float Bottom = ImGui::GetCursorScreenPos().y;
    Cards.emplace_back(CurrentTop, std::max(CurrentTop + 60.0f, Bottom));
    ImGui::Dummy(ImVec2(1.0f, std::max(0.0f, 10.0f - ImGui::GetStyle().ItemSpacing.y)));
    CurrentTop = -1.0f;
    CurrentOpen = false;
}

bool FluidPropertyGroup(const EditorTypefaces& Faces, const char* Id, const char* Title, const char* Badge,
                        bool DefaultOpen, FluidSectionCardBounds& Cards, float& CurrentTop, bool& CurrentOpen)
{
    CloseFluidSection(Cards, CurrentTop, CurrentOpen);
    static std::unordered_map<std::string, bool> GroupOpen;
    auto [State, Inserted] = GroupOpen.try_emplace(Id != nullptr ? Id : Title, DefaultOpen);
    (void)Inserted;
    CurrentOpen = State->second;
    CurrentTop = ImGui::GetCursorScreenPos().y;
    ImGui::Indent(8.0f);

    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float Width = std::max(100.0f, ImGui::GetContentRegionAvail().x);
    constexpr float HeaderHeight = 60.0f;
    ImGui::PushID(Id != nullptr ? Id : Title);
    ImGui::InvisibleButton("##FluidPropertyGroup", ImVec2(Width, HeaderHeight));
    const bool Hovered = ImGui::IsItemHovered();
    if (ImGui::IsItemClicked(ImGuiMouseButton_Left))
    {
        State->second = !State->second;
        CurrentOpen = State->second;
    }
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    if (Hovered) Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + HeaderHeight), IM_COL32(255, 255, 255, 8), 18.0f);
    Draw->AddText(Faces.Regular, 15.0f, ImVec2(Origin.x + 11.0f, Origin.y + 22.0f), IM_COL32(102, 102, 102, 255), CurrentOpen ? "⌄" : "›");
    Draw->AddText(Faces.Regular, 18.0f, ImVec2(Origin.x + 34.0f, Origin.y + 19.0f), IM_COL32(224, 224, 224, 255), Title);
    if (Badge != nullptr && Badge[0] != '\0')
    {
        const ImVec2 BadgeSize = ImGui::CalcTextSize(Badge);
        Draw->AddText(Faces.Regular, 8.0f,
                      ImVec2(Origin.x + Width - 19.0f - BadgeSize.x, Origin.y + 25.0f),
                      IM_COL32(100, 100, 100, 255), Badge);
    }
    ImGui::PopID();
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + HeaderHeight));
    if (CurrentOpen)
    {
        ImGui::Indent(12.0f);
    }
    return CurrentOpen;
}

// The reference editor uses compact pill selects and switches rather than backend-default ImGui widgets. Keep the
// selection surface on the shared DropdownControls theme, and draw switches with the same neutral track + bright knob.
bool FluidSwitch(const char* Label, bool* Value)
{
    constexpr float RowHeight = 25.0f;
    constexpr float SwitchWidth = 44.0f;
    constexpr float SwitchHeight = 25.0f;
    const ImVec2 RowMin = ImGui::GetCursorScreenPos();
    const float RowWidth = ImGui::GetContentRegionAvail().x;
    const ImVec2 SwitchMin(RowMin.x + std::max(0.0f, RowWidth - SwitchWidth), RowMin.y);
    ImGui::PushID(Label);
    ImGui::SetCursorScreenPos(SwitchMin);
    const bool Pressed = ImGui::InvisibleButton("##FluidSwitch", ImVec2(SwitchWidth, SwitchHeight));
    const bool Hovered = ImGui::IsItemHovered();
    ImGui::PopID();

    PixelSpace Surface;
    (void)Surface.Begin(SurfaceLayer::Window, ImGui::GetIO().DisplaySize.x, ImGui::GetIO().DisplaySize.y, 1.0f);
    const float Alpha = ImGui::GetStyle().Alpha;
    const PlaneExtent SwitchExtent = Spanning(SwitchMin.x, SwitchMin.y, SwitchWidth, SwitchHeight);
    const ColorQuad Track = *Value ? ColorQuad{ 1.0f, 1.0f, 1.0f, Alpha }
                                   : ColorQuad{ 0x22 / 255.0f, 0x22 / 255.0f, 0x22 / 255.0f, Alpha };
    Surface.FillRectangle(SwitchExtent, Track, 12.5f);
    ControlKit::OutlineRounded(Surface, SwitchExtent,
                               *Value ? ColorQuad{ 1.0f, 1.0f, 1.0f, Alpha }
                                      : ColorQuad{ 1.0f, 1.0f, 1.0f, 0.05f * Alpha },
                               12.5f);
    const float KnobX = SwitchMin.x + 2.0f + (*Value ? 19.0f : 0.0f);
    ControlKit::FillCircle(Surface, KnobX + 9.5f, SwitchMin.y + 2.0f + 9.5f, 9.5f,
                           *Value ? ColorQuad{ 0x11 / 255.0f, 0x11 / 255.0f, 0x11 / 255.0f, Alpha }
                                  : ColorQuad{ 0xBD / 255.0f, 0xBD / 255.0f, 0xBD / 255.0f, Alpha });
    if (Hovered)
        ImGui::GetWindowDrawList()->AddRect(ImVec2(SwitchMin.x, SwitchMin.y),
                                             ImVec2(SwitchMin.x + SwitchWidth, SwitchMin.y + SwitchHeight),
                                             IM_COL32(255, 255, 255, 16), 12.5f);
    ImGui::GetWindowDrawList()->AddText(ImGui::GetFont(), 12.0f,
                                       ImVec2(RowMin.x, RowMin.y + (RowHeight - 12.0f) * 0.5f),
                                       ImGui::GetColorU32(ImGuiCol_Text), Label);
    if (Pressed) *Value = !*Value;
    ImGui::SetCursorScreenPos(ImVec2(RowMin.x, RowMin.y + RowHeight + 20.0f));
    return Pressed;
}

bool FluidSelect(const char* Id, const char* Label, int* Value, const char* const* Options, int Count, float Width = 150.0f)
{
    if (Count <= 0) return false;
    *Value = std::clamp(*Value, 0, Count - 1);
    ImGui::PushID(Id);
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float RowWidth = std::max(100.0f, std::min(Width, ImGui::GetContentRegionAvail().x));
    if (Label && *Label)
    {
        ImGui::GetWindowDrawList()->AddText(ImGui::GetFont(), 12.0f, Origin, IM_COL32(162, 162, 162, 255), Label);
    }
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + 25.0f));
    ImGui::SetNextItemWidth(RowWidth);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(12.0f, 10.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 17.0f);
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(11, 11, 11, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(28, 28, 28, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(34, 34, 34, 255));
    ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(255, 255, 255, 18));
    const bool Open = DropdownControlSurface::BeginSelection("##FluidSelect", Options[*Value]);
    bool Changed = false;
    if (Open)
    {
        for (int Index = 0; Index < Count; ++Index)
        {
            if (DropdownControlSurface::Option(Options[Index], Index == *Value))
            {
                *Value = Index;
                Changed = true;
            }
        }
        DropdownControlSurface::EndSelection();
    }
    ImGui::PopStyleColor(4);
    ImGui::PopStyleVar(2);
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + 76.0f - ImGui::GetStyle().ItemSpacing.y));
    ImGui::Dummy(ImVec2(RowWidth, 0.0f));
    ImGui::PopID();
    return Changed;
}

bool FluidSelectableRow(const char* Label, OutlinerNodeId Id, bool Selected, bool Enabled, bool HasEyeToggle,
                        float Width, float Height, bool* DoubleClicked = nullptr, bool* ToggleClicked = nullptr)
{
    ImGui::PushID(Label);
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    const float MainWidth = std::max(24.0f, Width - (HasEyeToggle ? 30.0f : 0.0f));
    const bool Clicked = ImGui::InvisibleButton("##FluidRow", ImVec2(MainWidth, Height));
    const bool Hovered = ImGui::IsItemHovered();
    if (DoubleClicked) *DoubleClicked = Clicked && ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    if (Selected || Hovered)
    {
        Draw->AddRectFilled(Min, ImVec2(Min.x + Width, Min.y + Height),
                            Selected ? IM_COL32(31, 33, 37, 255) : IM_COL32(255, 255, 255, 12), 7.0f);
    }
    if (Selected)
    {
        const ImU32 Accent = Id == OutlinerNodeId::Domain ? IM_COL32(90, 169, 255, 255)
                             : Id == OutlinerNodeId::Source || Id == OutlinerNodeId::Sun ? IM_COL32(255, 180, 84, 255)
                                                                                         : IM_COL32(190, 190, 190, 255);
        Draw->AddRectFilled(ImVec2(Min.x, Min.y + 1.0f), ImVec2(Min.x + 3.0f, Min.y + Height - 1.0f), Accent, 2.0f);
    }

    const ImU32 IconInk = !Enabled ? IM_COL32(100, 100, 100, 150)
                          : Id == OutlinerNodeId::Domain ? IM_COL32(90, 169, 255, 255)
                          : Id == OutlinerNodeId::Source || Id == OutlinerNodeId::Sun ? IM_COL32(255, 180, 84, 255)
                                                                                     : IM_COL32(180, 180, 180, 255);
    Draw->AddText(ImGui::GetFont(), 11.0f, ImVec2(Min.x + 9.0f, Min.y + (Height - 11.0f) * 0.5f), IM_COL32(112, 112, 112, 255), "›");
    const ImVec2 IconOrigin(Min.x + 36.0f, Min.y + (Height - 16.0f) * 0.5f);
    if (Id == OutlinerNodeId::Domain)
        PanelChrome::DrawGlyph("M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9ZM12 3v18m9-13.5-9 4.5-9-4.5", IconOrigin, 16.0f, IconInk, 1.5f);
    else if (Id == OutlinerNodeId::Source)
        PanelChrome::DrawGlyph("M12 22a8 8 0 0 0 8-8c0-3-2-5-4-7-1 3-2 4-4 5-1-3-3-5-5-8-1 4-3 6-3 10a8 8 0 0 0 8 8Z", IconOrigin, 16.0f, IconInk, 1.5f);
    else if (Id == OutlinerNodeId::Collider)
        PanelChrome::DrawGlyph("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z", IconOrigin, 16.0f, IconInk, 1.5f);
    else
        PanelChrome::DrawGlyph("M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z", IconOrigin, 16.0f, IconInk, 1.5f);
    Draw->AddText(ImGui::GetFont(), 13.0f, ImVec2(Min.x + 66.0f, Min.y + (Height - 13.0f) * 0.5f),
                  Enabled ? (Selected ? IM_COL32(240, 240, 240, 255) : IM_COL32(196, 196, 196, 255)) : IM_COL32(98, 98, 98, 255), Label);
    if (Id == OutlinerNodeId::Domain)
        Draw->AddText(ImGui::GetFont(), 8.0f, ImVec2(Min.x + Width - 48.0f, Min.y + (Height - 8.0f) * 0.5f), IM_COL32(104, 104, 104, 255), "VOLUME");

    bool Toggled = false;
    if (HasEyeToggle)
    {
        const ImVec2 EyeMin(Min.x + Width - 28.0f, Min.y + (Height - 24.0f) * 0.5f);
        ImGui::SetCursorScreenPos(EyeMin);
        Toggled = ImGui::InvisibleButton("##EyeToggle", ImVec2(24.0f, 24.0f));
        const bool EyeHovered = ImGui::IsItemHovered();
        if (ToggleClicked) *ToggleClicked = Toggled;
        if (Selected || Hovered || EyeHovered || !Enabled)
        {
            const char* EyePath = Enabled ? "M2 12Q12 0 22 12Q12 24 2 12ZM12 9A3 3 0 1 0 12 15A3 3 0 1 0 12 9Z"
                                          : "M2 12Q12 0 22 12Q12 24 2 12ZM12 9A3 3 0 1 0 12 15A3 3 0 1 0 12 9ZM4 4L20 20";
            PanelChrome::DrawGlyph(EyePath, ImVec2(EyeMin.x + 4.0f, EyeMin.y + 4.0f), 16.0f,
                                   Enabled ? IM_COL32(132, 132, 132, 255) : IM_COL32(244, 72, 66, 255), 1.5f);
        }
    }
    if (ToggleClicked && !HasEyeToggle) *ToggleClicked = false;
    ImGui::SetCursorScreenPos(ImVec2(Min.x, Min.y + Height + 2.0f));
    ImGui::PopID();
    return Clicked;
}

bool FluidChip(const char* Label, bool Active, float Width)
{
    ImGui::PushID(Label);
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    constexpr float Height = 25.0f;
    const bool Clicked = ImGui::InvisibleButton("##FluidChip", ImVec2(Width, Height));
    const bool Hovered = ImGui::IsItemHovered();
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    const ImU32 Fill = Active ? IM_COL32(43, 43, 43, 255) : (Hovered ? IM_COL32(36, 36, 36, 255) : IM_COL32(22, 22, 22, 255));
    Draw->AddRectFilled(Min, ImVec2(Min.x + Width, Min.y + Height), Fill, Height * 0.5f);
    Draw->AddRect(Min, ImVec2(Min.x + Width, Min.y + Height), IM_COL32(255, 255, 255, Active ? 28 : 16), Height * 0.5f);
    const ImVec2 TextSize = ImGui::GetFont()->CalcTextSizeA(10.0f, 200.0f, 0.0f, Label, nullptr);
    Draw->AddText(ImGui::GetFont(), 10.0f,
                  ImVec2(Min.x + (Width - TextSize.x) * 0.5f, Min.y + (Height - TextSize.y) * 0.5f),
                  Active ? IM_COL32(235, 235, 235, 255) : IM_COL32(149, 149, 149, 255), Label);
    ImGui::PopID();
    return Clicked;
}

void FluidInspectorTabStrip(const EditorTypefaces& Faces, int& Active)
{
    static constexpr const char* Labels[3] = { "Source", "Simulation", "Rendering" };
    const ImVec2 Parent = ImGui::GetCursorScreenPos();
    const float Available = ImGui::GetContentRegionAvail().x;
    const float X = Parent.x + 3.0f;
    const float Width = std::max(120.0f, Available - 6.0f);
    constexpr float Height = 39.0f;
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(ImVec2(X, Parent.y), ImVec2(X + Width, Parent.y + Height), IM_COL32(8, 8, 8, 255), 20.0f);
    Draw->AddRect(ImVec2(X, Parent.y), ImVec2(X + Width, Parent.y + Height), IM_COL32(255, 255, 255, 18), 20.0f);
    constexpr float InnerPad = 4.0f;
    constexpr float Gap = 3.0f;
    const float CellWidth = (Width - InnerPad * 2.0f - Gap * 2.0f) / 3.0f;
    for (int Index = 0; Index < 3; ++Index)
    {
        const ImVec2 Cell(X + InnerPad + static_cast<float>(Index) * (CellWidth + Gap), Parent.y + InnerPad);
        ImGui::PushID(Index);
        ImGui::SetCursorScreenPos(Cell);
        const bool Clicked = ImGui::InvisibleButton("##InspectorTab", ImVec2(CellWidth, Height - InnerPad * 2.0f));
        const bool Hovered = ImGui::IsItemHovered();
        if (Clicked) Active = Index;
        const bool Selected = Active == Index;
        if (Selected || Hovered)
        {
            Draw->AddRectFilled(Cell, ImVec2(Cell.x + CellWidth, Cell.y + Height - InnerPad * 2.0f),
                                Selected ? IM_COL32(41, 41, 41, 255) : IM_COL32(255, 255, 255, 10), 16.0f);
            if (Selected) Draw->AddRect(Cell, ImVec2(Cell.x + CellWidth, Cell.y + Height - InnerPad * 2.0f), IM_COL32(255, 255, 255, 15), 16.0f);
        }
        const ImVec2 LabelSize = Faces.Regular ? Faces.Regular->CalcTextSizeA(12.0f, 1000.0f, 0.0f, Labels[Index], nullptr) : ImGui::CalcTextSize(Labels[Index]);
        Draw->AddText(Faces.Regular, 12.0f,
                      ImVec2(Cell.x + (CellWidth - LabelSize.x) * 0.5f,
                             Cell.y + ((Height - InnerPad * 2.0f) - LabelSize.y) * 0.5f),
                      Selected ? IM_COL32(239, 239, 239, 255) : IM_COL32(119, 119, 119, 255), Labels[Index]);
        ImGui::PopID();
    }
    ImGui::SetCursorScreenPos(ImVec2(Parent.x, Parent.y + Height + 14.0f - ImGui::GetStyle().ItemSpacing.y));
    ImGui::Dummy(ImVec2(Available, 0.0f));
}

bool FluidPresetCard(const FluidDynamics::FluidPresetDescriptor& Preset, bool Selected, float Width)
{
    ImGui::PushID(Preset.Identity);
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    constexpr float Height = 62.0f;
    const bool Clicked = ImGui::InvisibleButton("##PresetCard", ImVec2(Width, Height));
    const bool Hovered = ImGui::IsItemHovered();
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    const ImU32 Fill = Selected ? IM_COL32(52, 51, 41, 255) : (Hovered ? IM_COL32(43, 42, 34, 255) : IM_COL32(35, 35, 30, 255));
    Draw->AddRectFilled(Min, ImVec2(Min.x + Width, Min.y + Height), Fill, 18.0f);
    Draw->AddRect(Min, ImVec2(Min.x + Width, Min.y + Height), IM_COL32(232, 199, 139, Selected ? 38 : 15), 18.0f);
    const ImVec2 IconMin(Min.x + 12.0f, Min.y + 10.0f);
    Draw->AddRectFilled(IconMin, ImVec2(IconMin.x + 38.0f, IconMin.y + 42.0f), IM_COL32(45, 44, 36, 255), 12.0f);
    const uint32_t Tint = Preset.Category == FluidDynamics::FluidPresetCategory::Smoke ? 0xA8B0B8u :
                          Preset.Category == FluidDynamics::FluidPresetCategory::Blast ? 0xE8B66Eu : 0xFFB454u;
    const char* FlamePath = "M12 22a8 8 0 0 0 8-8c0-3-2-5-4-7-1 3-2 4-4 5-1-3-3-5-5-8-1 4-3 6-3 10a8 8 0 0 0 8 8Z";
    PanelChrome::DrawGlyph(FlamePath, ImVec2(IconMin.x + 10.0f, IconMin.y + 10.0f), 18.0f, Tint, 1.6f);
    Draw->AddText(ImGui::GetFont(), 12.0f, ImVec2(Min.x + 62.0f, Min.y + 14.0f), IM_COL32(231, 223, 205, 255), Preset.Title);
    Draw->AddText(ImGui::GetFont(), 10.0f, ImVec2(Min.x + 62.0f, Min.y + 36.0f), IM_COL32(163, 151, 126, 255), Preset.Summary);
    Draw->AddText(ImGui::GetFont(), 12.0f, ImVec2(Min.x + Width - 21.0f, Min.y + 24.0f), IM_COL32(161, 150, 125, 255), "\xE2\x86\x97");
    ImGui::PopID();
    return Clicked;
}

ControlKitPalette ResolveFluidControlPalette()
{
    auto C = [](uint32_t Rgb, float Alpha = 1.0f) {
        return ColorQuad{ static_cast<float>((Rgb >> 16u) & 255u) / 255.0f,
                          static_cast<float>((Rgb >> 8u) & 255u) / 255.0f,
                          static_cast<float>(Rgb & 255u) / 255.0f, Alpha };
    };
    ControlKitPalette P{};
    // 📝 Match the Sun inspector/outliner capture: warm charcoal surfaces, muted champagne labels, olive selected states,
    //    and restrained gold controls instead of the detached editor's former neutral gray palette.
    P.TabBackground = C(0x11110F);
    P.Panel = C(0x191917);
    P.Inset = C(0x24231D);
    P.Field = C(0x171612);
    P.Raised = C(0x292820);
    P.Selected = C(0x343329);
    P.Stroke = C(0xE8C78B, 0.08f);
    P.StrokeStrong = C(0x464334);
    P.Divider = C(0xE8C78B, 0.10f);
    P.Card = C(0x23231E);
    P.CardSub = C(0x2A2922);
    P.Text = C(0xE8E7DF);
    P.TextDim = C(0xA19786);
    P.TextFaint = C(0x716D61);
    P.Primary = C(0xD7DBB8);
    P.PrimaryInk = C(0x292E20);
    P.Accent = C(0xE3D2A6);
    P.AccentInk = C(0x292820);
    P.AccentSoft = C(0xE8C78B, 0.12f);
    P.SliderTrack = C(0x34332B);
    P.SliderFill = C(0xE3D2A6);
    P.SliderThumb = C(0xD7DBB8);
    P.SwitchKnobOff = C(0xC6BFAE);
    return P;
}

std::string SanitizeSlug(std::string_view Name)
{
    std::string Result;
    Result.reserve(Name.size());
    for (char Ch : Name)
    {
        if (std::isalnum(static_cast<unsigned char>(Ch)))
        {
            Result.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(Ch))));
        }
        else if (Ch == ' ' || Ch == '-' || Ch == '_')
        {
            if (Result.empty() || Result.back() != '_') Result.push_back('_');
        }
    }
    while (!Result.empty() && Result.back() == '_') Result.pop_back();
    return Result.empty() ? "fluid_plume" : Result;
}

std::filesystem::path ResolveSidecarPath(RecordToken Token, FluidPlumeConfiguration& Config)
{
    const std::filesystem::path& LevelFile = InspectorRuntime::Instance().QueryLevelFile();
    if (LevelFile.empty()) return {};
    if (Config.SpaceFile.empty())
    {
        const std::string RecordName = SceneDirectory::Instance().QueryName(Token);
        Config.SpaceFile             = SanitizeSlug(RecordName) + ".fluidspace";
    }
    return LevelFile.parent_path() / Config.SpaceFile;
}

void PushUndoSnapshot(FluidDocumentTab& Tab)
{
    if (Tab.UndoStack.size() >= 48u)
    {
        Tab.UndoStack.erase(Tab.UndoStack.begin());
    }
    Tab.UndoStack.push_back(Tab.Scene);
    Tab.RedoStack.clear();
    Tab.Dirty = true;
}

void EnqueueBurstPattern(FluidDocumentTab& Tab, FluidDynamics::FluidBurstPattern Pattern,
                         std::array<float, 3> BaseCentre = { 0.5f, 0.24f, 0.5f })
{
    const auto& P = Tab.Scene.Parameters;
    FluidBlastImpulse Base{};
    Base.CentreUvw     = BaseCentre;
    Base.Radius        = P.BlastRadius;
    Base.Strength      = P.BlastStrength;
    Base.Temperature   = P.BlastTemperature;
    Base.Fuel          = P.BlastFuel;
    Base.Smoke         = P.BlastSmoke;
    Base.Lobes         = P.BlastLobes;
    Base.SpawnShrapnel = P.ShrapnelEnabled;

    switch (Pattern)
    {
        case FluidDynamics::FluidBurstPattern::SingleBurst:
            Tab.PendingBlasts.push_back(Base);
            break;

        case FluidDynamics::FluidBurstPattern::Shrapnel:
            Base.SpawnShrapnel = true;
            Base.Strength *= 1.18f;
            Tab.PendingBlasts.push_back(Base);
            break;

        case FluidDynamics::FluidBurstPattern::ClusterSalvo:
            for (int Idx = 0; Idx < 4; ++Idx)
            {
                const float Angle     = static_cast<float>(Idx) * 1.5707963f + 0.35f;
                FluidBlastImpulse Sub = Base;
                Sub.CentreUvw         = {
                    std::clamp(BaseCentre[0] + std::cos(Angle) * 0.14f, 0.14f, 0.86f),
                    std::clamp(BaseCentre[1] + 0.04f * static_cast<float>(Idx % 2), 0.10f, 0.78f),
                    std::clamp(BaseCentre[2] + std::sin(Angle) * 0.14f, 0.14f, 0.86f)
                };
                Sub.Radius   = P.BlastRadius * 0.78f;
                Sub.Strength = P.BlastStrength * 0.88f;
                Tab.PendingBlasts.push_back(Sub);
            }
            break;

        case FluidDynamics::FluidBurstPattern::CollidingWaves:
        {
            FluidBlastImpulse Left    = Base;
            Left.CentreUvw            = { 0.28f, BaseCentre[1], 0.50f };
            Left.HasDirectionalVel    = true;
            Left.DirectionalVelocity  = { P.BlastStrength * 0.85f, P.BlastStrength * 0.18f, 0.0f };
            FluidBlastImpulse Right   = Base;
            Right.CentreUvw           = { 0.72f, BaseCentre[1], 0.50f };
            Right.HasDirectionalVel   = true;
            Right.DirectionalVelocity = { -P.BlastStrength * 0.85f, P.BlastStrength * 0.18f, 0.0f };
            Tab.PendingBlasts.push_back(Left);
            Tab.PendingBlasts.push_back(Right);
            break;
        }

        case FluidDynamics::FluidBurstPattern::MushroomCloud:
        {
            FluidBlastImpulse Stem   = Base;
            Stem.CentreUvw           = { BaseCentre[0], 0.12f, BaseCentre[2] };
            Stem.Radius              = P.BlastRadius * 0.75f;
            Stem.HasDirectionalVel   = true;
            Stem.DirectionalVelocity = { 0.0f, P.BlastStrength * 1.25f, 0.0f };
            FluidBlastImpulse Cap    = Base;
            Cap.CentreUvw            = { BaseCentre[0], 0.32f, BaseCentre[2] };
            Cap.Radius               = P.BlastRadius * 1.28f;
            Cap.Temperature          = P.BlastTemperature * 1.22f;
            Cap.Fuel                 = P.BlastFuel * 1.25f;
            Tab.PendingBlasts.push_back(Stem);
            Tab.PendingBlasts.push_back(Cap);
            break;
        }
    }
}

void SyncDocumentToRecord(const FluidDocumentTab& Tab, RecordToken Token, FluidPlumeConfiguration& Config, bool SaveSidecarFile)
{
    const auto& P               = Tab.Scene.Parameters;
    Config.BuoyancyLift         = P.Buoyancy;
    Config.VorticityConfinement = P.VorticityConfinement;
    Config.DissipationRate      = P.SmokeDissipation;
    Config.FuelInjectionRate    = P.SourceFuel;
    Config.BlackbodyCoreKelvin  = std::clamp(1000.0f + P.TemperatureScale * 1200.0f, 800.0f, 3600.0f);
    Config.CombustionEnabled    = (P.SourceFuel > 0.05f || P.BlastFuel > 0.05f);
    Config.BurstPattern         = static_cast<uint32_t>(Tab.BurstPattern);
    if (!Tab.PresetIdentity.empty())
    {
        Config.PresetIdentity = Tab.PresetIdentity;
    }

    if (SaveSidecarFile)
    {
        const std::filesystem::path Sidecar = ResolveSidecarPath(Token, Config);
        if (!Sidecar.empty())
        {
            (void)FluidDynamics::SaveFluidSpaceFile(Sidecar, Tab.Scene);
        }
    }
    Config.AdvanceRevision();
}

void BindSessionToRecord(FluidEditorSession& Session, RecordToken Token, FluidPlumeConfiguration& Config)
{
    if (Session.BoundToken == Token && !Session.Tabs.empty())
    {
        return;
    }
    Session.BoundToken = Token;
    Session.Tabs.clear();
    Session.ActiveTab  = 0;

    FluidDocumentTab MainTab{};
    MainTab.GpuSlot        = 0u;
    MainTab.PresetIdentity = Config.PresetIdentity.empty() ? "fuel_air_blast" : Config.PresetIdentity;
    MainTab.BurstPattern   = static_cast<FluidDynamics::FluidBurstPattern>(std::clamp<uint32_t>(Config.BurstPattern, 0u, 4u));

    const std::filesystem::path Sidecar = ResolveSidecarPath(Token, Config);
    if (!Sidecar.empty() && std::filesystem::exists(Sidecar) && FluidDynamics::LoadFluidSpaceFile(Sidecar, MainTab.Scene))
    {
        MainTab.FilePath     = Sidecar;
        MainTab.Title        = Sidecar.filename().string();
        Session.StatusNotice = "Loaded sidecar " + MainTab.Title;
    }
    else
    {
        MainTab.Scene.Name       = SceneDirectory::Instance().QueryName(Token);
        MainTab.Scene.Parameters = FluidDynamics::ConstructPresetParameters(MainTab.PresetIdentity);
        MainTab.Scene.Camera.SnapToTarget();
        MainTab.FilePath         = Sidecar;
        MainTab.Title            = Sidecar.empty() ? (MainTab.PresetIdentity + ".fluidspace") : Sidecar.filename().string();
        if (const auto* Preset = FluidDynamics::FindFluidPreset(MainTab.PresetIdentity);
            Preset && Preset->TriggerExplosionOnLoad)
        {
            EnqueueBurstPattern(MainTab, MainTab.BurstPattern);
        }
        Session.StatusNotice = "Initialized from preset '" + MainTab.PresetIdentity + "'";
    }
    MainTab.RestartPending = true;
    Session.Tabs.push_back(std::move(MainTab));
}

} // namespace

//========================================================================================================================
//                                             MAIN FLUID EDITOR CONSTRUCTION
//========================================================================================================================

void FluidPlumeEditor::ConstructInterface(RecordToken Token, FluidPlumeInspector& Inspector)
{
    FluidEditorSession&      Session = AccessSession();
    FluidPlumeConfiguration& Config  = Inspector.AccessParameters();
    BindSessionToRecord(Session, Token, Config);

    const ControlKitPalette PreviousControlPalette = ControlKit::Palette();
    ControlKit::ConfigurePalette(ResolveFluidControlPalette());
    InspectorPalette Palette = InspectorPalette::Resolve();
    Palette.ViewportBg = IM_COL32(25, 25, 23, 255);
    Palette.ColumnBg = IM_COL32(25, 25, 23, 255);
    Palette.StatusBarBg = IM_COL32(20, 20, 18, 255);
    Palette.ViewportBarBg = IM_COL32(22, 22, 20, 255);
    Palette.EdgeBorder = IM_COL32(232, 199, 139, 18);
    Palette.CountCardBg = IM_COL32(38, 39, 32, 255);
    Palette.CountCardBorder = IM_COL32(232, 199, 139, 22);
    Palette.SearchBg = IM_COL32(29, 28, 24, 255);
    Palette.SearchBorder = IM_COL32(232, 199, 139, 24);
    Palette.RowHoverBg = IM_COL32(37, 36, 30, 255);
    Palette.RowSelectedTop = IM_COL32(52, 51, 41, 255);
    Palette.RowSelectedBottom = IM_COL32(41, 41, 34, 255);
    Palette.RowSelectedBorder = IM_COL32(232, 199, 139, 50);
    Palette.InsetFieldBg = IM_COL32(23, 22, 18, 255);
    Palette.InsetFieldBorder = IM_COL32(232, 199, 139, 24);
    Palette.SliderTrackBg = IM_COL32(52, 51, 43, 255);
    Palette.SliderFillBg = IM_COL32(227, 210, 166, 255);
    Palette.SliderThumbBg = IM_COL32(215, 219, 184, 255);
    Palette.ToggleOnBg = IM_COL32(105, 200, 132, 255);
    Palette.ToggleOffBg = IM_COL32(204, 118, 115, 255);
    Palette.SegmentedBg = IM_COL32(26, 25, 21, 255);
    Palette.SegmentedActiveBg = IM_COL32(52, 51, 41, 255);
    Palette.TextPrimary = IM_COL32(232, 231, 223, 255);
    Palette.TextSecondary = IM_COL32(184, 173, 150, 255);
    Palette.TextMuted = IM_COL32(154, 152, 142, 255);
    Palette.TextFaint = IM_COL32(113, 109, 97, 255);
    Palette.ThemeAccent = IM_COL32(227, 210, 166, 255);
    Palette.WarmAmber = IM_COL32(232, 199, 139, 255);
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();
    ImGuiIO&               Io      = ImGui::GetIO();

    FluidDocumentTab& Tab    = Session.Tabs[std::clamp(Session.ActiveTab, 0, static_cast<int>(Session.Tabs.size()) - 1)];
    auto&             Params = Tab.Scene.Parameters;

    InspectorRuntime&    Runtime      = InspectorRuntime::Instance();
    const float          Scale        = Runtime.ResolveInterfaceScale();
    const ImGuiViewport* Main         = ImGui::GetMainViewport();
    const ImVec2         Margin(28.0f * Scale, 24.0f * Scale);
    const ImVec2         Position(Main->WorkPos.x + Margin.x, Main->WorkPos.y + Margin.y);
    const ImVec2         Size(std::max(1100.0f, Main->WorkSize.x - Margin.x * 2.0f), std::max(640.0f, Main->WorkSize.y - Margin.y * 2.0f));

    constexpr const char* WindowName = "##FluidPlumeEditorWindow";
    if (!ImGui::IsPopupOpen(WindowName))
    {
        ImGui::OpenPopup(WindowName);
    }
    ImGui::SetNextWindowPos(Position, ImGuiCond_Always);
    ImGui::SetNextWindowSize(Size, ImGuiCond_Always);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 16.0f * Scale);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
    ImGui::PushStyleColor(ImGuiCol_PopupBg, ImGui::ColorConvertU32ToFloat4(Palette.ViewportBg));
    ImGui::PushStyleColor(ImGuiCol_ModalWindowDimBg, ImVec4(0.02f, 0.02f, 0.03f, 0.58f));
    const bool Shown = ImGui::BeginPopupModal(WindowName, nullptr,
                                              ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings |
                                                  ImGuiWindowFlags_NoScrollWithMouse);
    ImGui::PopStyleColor(2);
    ImGui::PopStyleVar(3);
    if (!Shown)
    {
        ControlKit::ConfigurePalette(PreviousControlPalette);
        return;
    }

    bool ClosingModal = false;

    if (!Io.WantTextInput)
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Escape))
        {
            ClosingModal = true;
        }
        if (ImGui::IsKeyPressed(ImGuiKey_Space))
        {
            Params.Paused = !Params.Paused;
        }
        if (ImGui::IsKeyPressed(ImGuiKey_Period))
        {
            Tab.StepOncePending = true;
        }
        if (ImGui::IsKeyPressed(ImGuiKey_C))
        {
            Tab.RestartPending   = true;
            Session.StatusNotice = "Cleared 3D Eulerian solver grid";
        }
        if (ImGui::IsKeyPressed(ImGuiKey_E) || ImGui::IsKeyPressed(ImGuiKey_D))
        {
            EnqueueBurstPattern(Tab, Tab.BurstPattern);
            ++Config.BurstGeneration;
            Config.AdvanceRevision();
            Session.StatusNotice = "Detonated pyrotechnic burst";
        }
        if (ImGui::IsKeyPressed(ImGuiKey_F))
        {
            Tab.Scene.Camera.Reset();
            Tab.Scene.Camera.SnapToTarget();
            Session.StatusNotice = "Framed simulation domain";
        }
        if (Io.KeyCtrl && ImGui::IsKeyPressed(ImGuiKey_Z) && !Tab.UndoStack.empty())
        {
            Tab.RedoStack.push_back(Tab.Scene);
            Tab.Scene = Tab.UndoStack.back();
            Tab.UndoStack.pop_back();
            Session.StatusNotice = "Undo parameter change";
        }
        if (Io.KeyCtrl && ImGui::IsKeyPressed(ImGuiKey_Y) && !Tab.RedoStack.empty())
        {
            Tab.UndoStack.push_back(Tab.Scene);
            Tab.Scene = Tab.RedoStack.back();
            Tab.RedoStack.pop_back();
            Session.StatusNotice = "Redo parameter change";
        }
    }

    // Modal Studio Header Bar (matching ParticleEditor modal window architecture)
    ImDrawList*  ModalInk = ImGui::GetWindowDrawList();
    const float  HeaderH  = 48.0f * Scale;
    ModalInk->AddRect(Position, ImVec2(Position.x + Size.x, Position.y + Size.y), Palette.EdgeBorder, 16.0f * Scale, 0, 1.5f);
    ModalInk->AddRectFilled(Position, ImVec2(Position.x + Size.x, Position.y + HeaderH), Palette.InspectorTopBg, 16.0f * Scale, ImDrawFlags_RoundCornersTop);
    ModalInk->AddLine(ImVec2(Position.x, Position.y + HeaderH), ImVec2(Position.x + Size.x, Position.y + HeaderH), Palette.EdgeBorder, 1.0f);
    PanelChrome::DrawGlyph("M12 22a8 8 0 0 0 8-8c0-3-2-5-4-7-1 3-2 4-4 5-1-3-3-5-5-8-1 4-3 6-3 10a8 8 0 0 0 8 8Z",
                           ImVec2(Position.x + 16.0f * Scale, Position.y + 16.0f * Scale), 16.0f * Scale,
                           0x34C759u, 1.5f);
    ModalInk->AddText(Faces.Medium, 14.0f * Scale, ImVec2(Position.x + 42.0f * Scale, Position.y + 15.5f * Scale), Palette.TextPrimary,
                      "Frontier \xC2\xB7 Fluid & Pyrotechnic Editor");
    {
        char HeaderReadout[256]{};
        const std::string SidecarLabel = Config.SpaceFile.empty() ? std::string("unsaved.fluidspace") : Config.SpaceFile;
        std::snprintf(HeaderReadout, sizeof(HeaderReadout), "LIVE \xC2\xB7 %s \xC2\xB7 %d\xC2\xB3 EULERIAN GRID \xC2\xB7 %s%s",
                      SceneDirectory::Instance().QueryName(Token).c_str(),
                      Params.GridResolution,
                      SidecarLabel.c_str(),
                      Tab.Dirty ? " \xC2\xB7 UNSAVED" : "");
        ModalInk->AddText(Faces.Monospace, 10.5f * Scale, ImVec2(Position.x + 336.0f * Scale, Position.y + 18.5f * Scale), Palette.LiveGreen, HeaderReadout);
    }
    {
        const float  CloseW = 108.0f * Scale;
        const ImVec2 CloseMin(Position.x + Size.x - CloseW - 14.0f * Scale, Position.y + 9.0f * Scale);
        ImGui::SetCursorScreenPos(CloseMin);
        if (ImGui::InvisibleButton("##CloseFluidPlumeEditorHeader", ImVec2(CloseW, 30.0f * Scale)))
        {
            ClosingModal = true;
        }
        const bool Hovered = ImGui::IsItemHovered();
        ModalInk->AddRectFilled(CloseMin, ImVec2(CloseMin.x + CloseW, CloseMin.y + 30.0f * Scale),
                                Hovered ? Palette.SegmentedActiveBg : Palette.CountCardBg, 9.0f * Scale);
        ModalInk->AddRect(CloseMin, ImVec2(CloseMin.x + CloseW, CloseMin.y + 30.0f * Scale), Palette.InsetFieldBorder, 9.0f * Scale);
        ModalInk->AddText(Faces.Medium, 11.0f * Scale, ImVec2(CloseMin.x + 18.0f * Scale, CloseMin.y + 8.5f * Scale), Palette.TextPrimary, "Close Editor");
    }

    const ImVec2 BodyMin(Position.x + 8.0f * Scale, Position.y + HeaderH + 6.0f * Scale);
    const ImVec2 BodySize(Size.x - 16.0f * Scale, Size.y - HeaderH - 14.0f * Scale);
    ImGui::SetCursorScreenPos(BodyMin);

    ImGui::PushStyleColor(ImGuiCol_ChildBg, ImGui::ColorConvertU32ToFloat4(Palette.ColumnBg));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, ImGui::ColorConvertU32ToFloat4(Palette.InsetFieldBg));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImGui::ColorConvertU32ToFloat4(Palette.SegmentedActiveBg));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ImGui::ColorConvertU32ToFloat4(Palette.SegmentedActiveBg));
    ImGui::PushStyleColor(ImGuiCol_Border, ImGui::ColorConvertU32ToFloat4(Palette.InsetFieldBorder));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(0.0f, 0.0f));

    if (ImGui::BeginChild("##FluidPlumeEditorRoot", BodySize, ImGuiChildFlags_None,
                          ImGuiWindowFlags_NoScrollbar))
    {
        //----------------------------------------------------------------------------------------------------------------
        // 1. COMPACT ACTION MENU STRIP (kept separate from the document tabs)
        //----------------------------------------------------------------------------------------------------------------
        ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 6.0f));
        ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 8.0f);
        ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
        ImGui::PushStyleColor(ImGuiCol_Button, Palette.SegmentedBg);
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, Palette.SegmentedActiveBg);
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, Palette.SegmentedActiveBg);
        ImGui::PushStyleColor(ImGuiCol_Border, Palette.InsetFieldBorder);
        ImGui::PushStyleColor(ImGuiCol_Text, Palette.TextSecondary);
        if (ImGui::Button("File")) ImGui::OpenPopup("File");
        ImGui::SameLine(0.0f, 6.0f);
        if (ImGui::Button("Edit")) ImGui::OpenPopup("Edit");
        ImGui::SameLine(0.0f, 6.0f);
        if (ImGui::Button("View")) ImGui::OpenPopup("View");
        ImGui::SameLine(0.0f, 6.0f);
        if (ImGui::Button("Simulation")) ImGui::OpenPopup("Simulation");
        ImGui::SameLine(0.0f, 10.0f);
        ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Palette.TextMuted), "GPU fluid workspace");
        ImGui::PopStyleColor(5);
        ImGui::PopStyleVar(3);

        ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(8.0f, 6.0f));
        ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(8.0f, 5.0f));

        if (DropdownControlSurface::BeginMenu("File", Scale))
            {
                if (ImGui::MenuItem("New Fluid Document") && Session.Tabs.size() < 4u)
                {
                    FluidDocumentTab Fresh{};
                    Fresh.GpuSlot          = static_cast<uint32_t>(Session.Tabs.size());
                    Fresh.Title            = "Document_" + std::to_string(Session.Tabs.size() + 1u) + ".fluidspace";
                    Fresh.PresetIdentity   = "camp_fire";
                    Fresh.Scene.Name       = "Camp Fire";
                    Fresh.Scene.Parameters = FluidDynamics::ConstructPresetParameters("camp_fire");
                    Fresh.Scene.Camera.SnapToTarget();
                    Fresh.RestartPending   = true;
                    Session.Tabs.push_back(std::move(Fresh));
                    Session.ActiveTab    = static_cast<int>(Session.Tabs.size()) - 1;
                    Session.StatusNotice = "Created new simulation tab";
                }
                if (DropdownControlSurface::BeginMenu("Load Sample Scene", Scale))
                {
                    for (const auto& Sample : FluidDynamics::EnumerateSampleFluidScenes())
                    {
                        if (ImGui::MenuItem(Sample.Name))
                        {
                            PushUndoSnapshot(Tab);
                            Tab.Scene          = FluidDynamics::ConstructSampleFluidScene(Sample.Identity);
                            Tab.PresetIdentity = Sample.PresetKey;
                            Tab.RestartPending = true;
                            if (const auto* Preset = FluidDynamics::FindFluidPreset(Sample.PresetKey);
                                Preset && Preset->TriggerExplosionOnLoad)
                            {
                                EnqueueBurstPattern(Tab, Tab.BurstPattern);
                            }
                            SyncDocumentToRecord(Tab, Token, Config, false);
                            Session.StatusNotice = std::string("Loaded sample: ") + Sample.Name;
                        }
                    }
                    DropdownControlSurface::EndMenu();
                }
                if (ImGui::MenuItem("Open .fluidspace / .gasscene.toml..."))
                {
                    Session.ShowImportModal = true;
                }
                ImGui::Separator();
                if (ImGui::MenuItem("Save Sidecar (.fluidspace)", "Ctrl+S"))
                {
                    SyncDocumentToRecord(Tab, Token, Config, true);
                    Tab.Dirty            = false;
                    Session.StatusNotice = "Saved sidecar to " + Config.SpaceFile;
                }
                if (ImGui::MenuItem("Export .gasscene.toml Beside Level"))
                {
                    const auto Sidecar = ResolveSidecarPath(Token, Config);
                    if (!Sidecar.empty())
                    {
                        auto ExportPath = Sidecar;
                        ExportPath.replace_extension(".gasscene.toml");
                        if (FluidDynamics::SaveFluidSpaceFile(ExportPath, Tab.Scene))
                        {
                            Session.StatusNotice = "Exported " + ExportPath.filename().string();
                        }
                    }
                }
                if (ImGui::MenuItem("Bake Flipbook Sprite Sheet..."))
                {
                    Session.Flipbook.DialogOpen = true;
                }
                ImGui::Separator();
                if (ImGui::MenuItem("Close Fluid Editor", "Esc"))
                {
                    ClosingModal = true;
                }
                DropdownControlSurface::EndMenu();
            }

            if (DropdownControlSurface::BeginMenu("Edit", Scale))
            {
                if (ImGui::MenuItem("Undo", "Ctrl+Z", false, !Tab.UndoStack.empty()))
                {
                    Tab.RedoStack.push_back(Tab.Scene);
                    Tab.Scene = Tab.UndoStack.back();
                    Tab.UndoStack.pop_back();
                }
                if (ImGui::MenuItem("Redo", "Ctrl+Y", false, !Tab.RedoStack.empty()))
                {
                    Tab.UndoStack.push_back(Tab.Scene);
                    Tab.Scene = Tab.RedoStack.back();
                    Tab.RedoStack.pop_back();
                }
                ImGui::Separator();
                if (ImGui::MenuItem("Reset Parameters to Preset"))
                {
                    PushUndoSnapshot(Tab);
                    Tab.Scene.Parameters = FluidDynamics::ConstructPresetParameters(Tab.PresetIdentity);
                    Tab.RestartPending   = true;
                }
                DropdownControlSurface::EndMenu();
            }

            if (DropdownControlSurface::BeginMenu("View", Scale))
            {
                ImGui::MenuItem("Outliner Panel", nullptr, &Session.ShowOutliner);
                ImGui::MenuItem("Inspector Panel", nullptr, &Session.ShowInspector);
                ImGui::MenuItem("Status Bar", nullptr, &Session.ShowStatusBar);
                ImGui::Separator();
                ImGui::MenuItem("Domain Bounds Wireframe", nullptr, &Session.ShowDomainWire);
                ImGui::MenuItem("Viewport Telemetry HUD", nullptr, &Session.ShowHudOverlay);
                ImGui::MenuItem("2D Voxel Atlas Minimap", nullptr, &Params.ShowAtlasMinimap);
                ImGui::MenuItem("Floor Reference Grid", nullptr, &Params.ShowFloorGrid);
                ImGui::MenuItem("Voxel Slice Grid Lines", nullptr, &Params.ShowVoxelGridLines);
                ImGui::MenuItem("Active Voxel Wireframe", nullptr, &Params.ShowActiveVoxelCells);
                ImGui::Separator();
                if (ImGui::MenuItem("Front Camera")) Tab.Scene.Camera.ConfigureViewPreset("front");
                if (ImGui::MenuItem("Side Camera"))  Tab.Scene.Camera.ConfigureViewPreset("side");
                if (ImGui::MenuItem("Top Camera"))   Tab.Scene.Camera.ConfigureViewPreset("top");
                if (ImGui::MenuItem("Reset Camera", "F")) Tab.Scene.Camera.Reset();
                DropdownControlSurface::EndMenu();
            }

            if (DropdownControlSurface::BeginMenu("Simulation", Scale))
            {
                if (ImGui::MenuItem(Params.Paused ? "Resume Simulation" : "Pause Simulation", "Space"))
                {
                    Params.Paused = !Params.Paused;
                }
                if (ImGui::MenuItem("Step Single Frame", "."))
                {
                    Tab.StepOncePending = true;
                }
                if (ImGui::MenuItem("Clear 3D Grid", "C"))
                {
                    Tab.RestartPending = true;
                }
                if (ImGui::MenuItem("Detonate Burst", "E"))
                {
                    EnqueueBurstPattern(Tab, Tab.BurstPattern);
                }
                ImGui::Separator();
                if (ImGui::MenuItem("Sync Wind from Level ForceField"))
                {
                    if (const auto& Flow = InspectorRuntime::Instance().QueryLevelFlowSampler())
                    {
                        const std::array<double, 3> SamplePos = {
                            Config.PositionMetres[0], Config.PositionMetres[1], Config.PositionMetres[2] + 2.0
                        };
                        if (const auto Air = Flow(SamplePos); Air.has_value())
                        {
                            PushUndoSnapshot(Tab);
                            Params.WindX         = std::clamp(static_cast<float>((*Air)[0]) * 0.25f, -4.0f, 4.0f);
                            Params.WindZ         = std::clamp(static_cast<float>((*Air)[1]) * 0.25f, -4.0f, 4.0f);
                            Session.StatusNotice = "Synced wind vector from level ForceField";
                        }
                    }
                }
                if (ImGui::MenuItem("Sync Sun Elevation from Level"))
                {
                    PushUndoSnapshot(Tab);
                    Params.SunElevation  = std::clamp(InspectorRuntime::Instance().QuerySolarElevation(), 2.0f, 88.0f);
                    Session.StatusNotice = "Synced solar elevation from level Sun";
                }
                DropdownControlSurface::EndMenu();
            }

            ImGui::PopStyleVar(2);

        FluidDocumentTab& ActiveDoc = Session.Tabs[std::clamp(Session.ActiveTab, 0, static_cast<int>(Session.Tabs.size()) - 1)];
        auto&             P         = ActiveDoc.Scene.Parameters;

        //----------------------------------------------------------------------------------------------------------------
        // 2. DOCUMENT TAB BAR + TOOLBAR
        //----------------------------------------------------------------------------------------------------------------
        const float TotalWidth = ImGui::GetContentRegionAvail().x;
        ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(10.0f, 5.0f));
        ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(6.0f, 4.0f));
        if (ImGui::BeginChild("##FluidToolbarStrip", ImVec2(TotalWidth, 68.0f), ImGuiChildFlags_None,
                              ImGuiWindowFlags_NoScrollbar))
        {
            ImDrawList*  BarDraw = ImGui::GetWindowDrawList();
            const ImVec2 BarMin  = ImGui::GetWindowPos();
            const ImVec2 BarMax  = ImVec2(BarMin.x + TotalWidth, BarMin.y + 68.0f);
            BarDraw->AddRectFilled(BarMin, BarMax, Palette.ViewportBarBg);
            BarDraw->AddLine(ImVec2(BarMin.x, BarMax.y - 1.0f), ImVec2(BarMax.x, BarMax.y - 1.0f), Palette.EdgeBorder);

            // Row A: Document tabs + Save & Sync + Close
            ImGui::SetCursorPos(ImVec2(10.0f, 5.0f));
            for (int TabIdx = 0; TabIdx < static_cast<int>(Session.Tabs.size()); ++TabIdx)
            {
                ImGui::PushID(TabIdx);
                const bool  Selected = (TabIdx == Session.ActiveTab);
                std::string Label    = Session.Tabs[TabIdx].Title + (Session.Tabs[TabIdx].Dirty ? " *" : "");
                ImGui::PushStyleColor(ImGuiCol_Button, ImGui::ColorConvertU32ToFloat4(Selected ? Palette.SegmentedActiveBg : Palette.InsetFieldBg));
                ImGui::PushStyleColor(ImGuiCol_Text, ImGui::ColorConvertU32ToFloat4(Selected ? Palette.WarmAmber : Palette.TextMuted));
                if (ImGui::Button(Label.c_str(), ImVec2(0.0f, 24.0f)))
                {
                    Session.ActiveTab = TabIdx;
                }
                ImGui::PopStyleColor(2);
                if (Session.Tabs.size() > 1u)
                {
                    ImGui::SameLine(0.0f, 2.0f);
                    if (ImGui::SmallButton("x"))
                    {
                        Session.Tabs.erase(Session.Tabs.begin() + TabIdx);
                        Session.ActiveTab = std::clamp(Session.ActiveTab, 0, static_cast<int>(Session.Tabs.size()) - 1);
                        ImGui::PopID();
                        break;
                    }
                }
                ImGui::SameLine(0.0f, 6.0f);
                ImGui::PopID();
            }
            if (Session.Tabs.size() < 4u)
            {
                if (ImGui::Button("+##AddFluidDoc", ImVec2(24.0f, 24.0f)))
                {
                    FluidDocumentTab Extra{};
                    Extra.GpuSlot          = static_cast<uint32_t>(Session.Tabs.size());
                    Extra.Title            = "Scratch_" + std::to_string(Session.Tabs.size() + 1u) + ".fluidspace";
                    Extra.PresetIdentity   = "fireball_burst";
                    Extra.Scene.Name       = "Fireball Burst";
                    Extra.Scene.Parameters = FluidDynamics::ConstructPresetParameters("fireball_burst");
                    Extra.Scene.Camera.SnapToTarget();
                    Extra.RestartPending   = true;
                    EnqueueBurstPattern(Extra, Extra.BurstPattern);
                    Session.Tabs.push_back(std::move(Extra));
                    Session.ActiveTab = static_cast<int>(Session.Tabs.size()) - 1;
                }
            }

            const float RightCloseX = std::max(360.0f, TotalWidth - 500.0f);
            ImGui::SetCursorPos(ImVec2(RightCloseX, 5.0f));
            if (ImGui::Button("Open scene", ImVec2(72.0f, 24.0f))) Session.ShowImportModal = true;
            ImGui::SameLine(0.0f, 5.0f);
            if (ImGui::Button("Load a sample...", ImVec2(120.0f, 24.0f))) ImGui::OpenPopup("##ToolbarFluidSamples");
            if (DropdownControlSurface::BeginMenu("##ToolbarFluidSamples", Scale))
            {
                for (const auto& Sample : FluidDynamics::EnumerateSampleFluidScenes())
                {
                    if (!ImGui::MenuItem(Sample.Name)) continue;
                    PushUndoSnapshot(ActiveDoc);
                    ActiveDoc.Scene = FluidDynamics::ConstructSampleFluidScene(Sample.Identity);
                    ActiveDoc.PresetIdentity = Sample.PresetKey;
                    ActiveDoc.RestartPending = true;
                    if (const auto* Preset = FluidDynamics::FindFluidPreset(Sample.PresetKey); Preset && Preset->TriggerExplosionOnLoad)
                        EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern);
                    SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                    Session.StatusNotice = std::string("Loaded sample: ") + Sample.Name;
                }
                DropdownControlSurface::EndMenu();
            }
            ImGui::SameLine(0.0f, 5.0f);
            if (ImGui::Button("Save as TOML", ImVec2(90.0f, 24.0f)))
            {
                const auto Sidecar = ResolveSidecarPath(Token, Config);
                if (!Sidecar.empty())
                {
                    auto ExportPath = Sidecar;
                    ExportPath.replace_extension(".gasscene.toml");
                    if (FluidDynamics::SaveFluidSpaceFile(ExportPath, ActiveDoc.Scene))
                        Session.StatusNotice = "Exported " + ExportPath.filename().string();
                }
            }
            ImGui::SameLine(0.0f, 5.0f);
            if (ImGui::Button("Save & Sync", ImVec2(92.0f, 24.0f)))
            {
                SyncDocumentToRecord(ActiveDoc, Token, Config, true);
                ActiveDoc.Dirty      = false;
                Session.StatusNotice = "Synced parameters & saved " + Config.SpaceFile;
            }
            ImGui::SameLine(0.0f, 5.0f);
            if (ImGui::Button("Close [Esc]", ImVec2(80.0f, 24.0f))) ClosingModal = true;

            // Row B: Preset Combo | Burst Pattern + Detonate | Play/Step/Clear | 4 Viewport Tools | Flipbook
            ImGui::SetCursorPos(ImVec2(10.0f, 36.0f));
            ImGui::SetNextItemWidth(175.0f);
            const auto* ActivePreset = FluidDynamics::FindFluidPreset(ActiveDoc.PresetIdentity);
            ImGui::PushID("FluidPresetSelect");
            if (DropdownControlSurface::BeginSelection("##ToolbarPreset", ActivePreset ? ActivePreset->Title : "Custom Preset", Scale))
            {
                for (const auto& Entry : FluidDynamics::EnumerateFluidPresets())
                {
                    const bool IsSel = (ActiveDoc.PresetIdentity == Entry.Identity);
                    if (DropdownControlSurface::Option(Entry.Title, IsSel, Scale))
                    {
                        PushUndoSnapshot(ActiveDoc);
                        ActiveDoc.PresetIdentity   = Entry.Identity;
                        ActiveDoc.Scene.Name       = Entry.Title;
                        ActiveDoc.Scene.Parameters = FluidDynamics::ConstructPresetParameters(Entry.Identity);
                        ActiveDoc.RestartPending   = true;
                        if (Entry.TriggerExplosionOnLoad) EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern);
                        SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                        Session.StatusNotice = std::string("Loaded preset: ") + Entry.Title;
                    }
                }
                DropdownControlSurface::EndSelection();
            }
            ImGui::PopID();

            ImGui::SameLine(0.0f, 8.0f);
            static const char* const BurstNames[5] = {
                "Single Burst", "Shrapnel Burst", "Cluster Salvo", "Colliding Waves", "Mushroom Cloud"
            };
            int PatIdx = static_cast<int>(ActiveDoc.BurstPattern);
            if (FluidSelect("ToolbarBurstPattern", nullptr, &PatIdx, BurstNames, 5, 132.0f))
            {
                ActiveDoc.BurstPattern = static_cast<FluidDynamics::FluidBurstPattern>(PatIdx);
                Config.BurstPattern    = static_cast<uint32_t>(PatIdx);
                Config.AdvanceRevision();
            }

            ImGui::SameLine(0.0f, 6.0f);
            ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.76f, 0.31f, 0.08f, 1.0f));
            ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.88f, 0.39f, 0.12f, 1.0f));
            ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(1.0f, 0.97f, 0.90f, 1.0f));
            if (ImGui::Button("Detonate [D]", ImVec2(98.0f, 24.0f)))
            {
                EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern);
                ++Config.BurstGeneration;
                Config.AdvanceRevision();
                Session.StatusNotice = "Detonated " + std::string(BurstNames[PatIdx]);
            }
            ImGui::PopStyleColor(3);

            ImGui::SameLine(0.0f, 10.0f);
            if (ImGui::Button(P.Paused ? "Play" : "Pause", ImVec2(54.0f, 24.0f)))
            {
                P.Paused = !P.Paused;
            }
            ImGui::SameLine(0.0f, 4.0f);
            if (ImGui::Button("Step", ImVec2(46.0f, 24.0f)))
            {
                ActiveDoc.StepOncePending = true;
            }
            ImGui::SameLine(0.0f, 4.0f);
            if (ImGui::Button("Clear", ImVec2(50.0f, 24.0f)))
            {
                ActiveDoc.RestartPending = true;
            }

            ImGui::SameLine(0.0f, 12.0f);
            static const char* const ToolNames[4] = { "Orbit", "Flame", "Blast", "Collider" };
            for (int ToolIdx = 0; ToolIdx < 4; ++ToolIdx)
            {
                const bool ActiveTool = (Session.ActiveViewportTool == ToolIdx);
                ImGui::PushStyleColor(ImGuiCol_Button, ImGui::ColorConvertU32ToFloat4(ActiveTool ? Palette.WarmAmber : Palette.InsetFieldBg));
                ImGui::PushStyleColor(ImGuiCol_Text, ImGui::ColorConvertU32ToFloat4(ActiveTool ? Palette.ViewportBg : Palette.TextPrimary));
                if (ImGui::Button(ToolNames[ToolIdx], ImVec2(58.0f, 24.0f)))
                {
                    Session.ActiveViewportTool = ToolIdx;
                    if (ToolIdx <= 2)
                    {
                        P.InteractionTool = static_cast<FluidDynamics::FluidInteractionTool>(ToolIdx);
                    }
                }
                ImGui::PopStyleColor(2);
                if (ToolIdx < 3) ImGui::SameLine(0.0f, 3.0f);
            }

            ImGui::SameLine(0.0f, 12.0f);
            if (ImGui::Button("Flipbook...", ImVec2(80.0f, 24.0f)))
            {
                Session.Flipbook.DialogOpen = true;
            }
        }
        ImGui::EndChild();
        ImGui::PopStyleVar(2);

        //----------------------------------------------------------------------------------------------------------------
        // 3. THREE-COLUMN WORKSPACE: OUTLINER | 3D VOLUMETRIC VIEWPORT | 3-TAB INSPECTOR
        //----------------------------------------------------------------------------------------------------------------
        const float StatusHeight   = Session.ShowStatusBar ? 26.0f : 0.0f;
        const float BodyHeight     = std::max(120.0f, ImGui::GetContentRegionAvail().y - StatusHeight);
        constexpr float WorkspacePadding = 16.0f;
        constexpr float ColumnGap = 12.0f;
        const float ColumnGaps = ColumnGap * static_cast<float>((Session.ShowOutliner ? 1 : 0) + (Session.ShowInspector ? 1 : 0));
        const float ColumnAreaWidth = std::max(320.0f, TotalWidth - WorkspacePadding * 2.0f - ColumnGaps);
        const float SideWidthScale = std::min(1.0f, std::max(0.0f, ColumnAreaWidth - 320.0f) / (300.0f + 368.0f));
        const float OutlinerWidth = Session.ShowOutliner ? 300.0f * SideWidthScale : 0.0f;
        const float InspectorWidth = Session.ShowInspector ? 368.0f * SideWidthScale : 0.0f;
        const float ViewportWidth = std::max(160.0f, ColumnAreaWidth - OutlinerWidth - InspectorWidth);
        ImGui::SetCursorPosX(ImGui::GetCursorPosX() + WorkspacePadding);

        // --- LEFT COLUMN: SCENE OUTLINER ---
        if (Session.ShowOutliner)
        {
            ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(14.0f, 16.0f));
            ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(8.0f, 8.0f));
            if (ImGui::BeginChild("##FluidOutlinerColumn", ImVec2(OutlinerWidth, BodyHeight), ImGuiChildFlags_None,
                                  ImGuiWindowFlags_NoBackground))
            {
                ImDrawList* ColDraw = ImGui::GetWindowDrawList();
                const ImVec2 ColMin = ImGui::GetWindowPos();
                const bool ColliderVisible = P.ObstacleCategory != 0 || Session.SelectedNode == OutlinerNodeId::Collider;
                const size_t ObjectCount = 3u + (ColliderVisible ? 1u : 0u);
                const ImVec2 OutlinerHeading = ImGui::GetCursorScreenPos();
                ColDraw->AddText(Faces.Medium, 13.0f, OutlinerHeading, IM_COL32(214, 211, 198, 255), "Outliner");
                char CountText[12]{};
                std::snprintf(CountText, sizeof(CountText), "%zu", ObjectCount);
                const ImVec2 CountSize = ImGui::CalcTextSize(CountText);
                const float CountX = OutlinerHeading.x + 64.0f;
                ColDraw->AddRectFilled(ImVec2(CountX, OutlinerHeading.y - 1.0f), ImVec2(CountX + CountSize.x + 10.0f, OutlinerHeading.y + 17.0f),
                                       IM_COL32(48, 47, 39, 255), 8.0f);
                ColDraw->AddText(Faces.Regular, 10.0f, ImVec2(CountX + 5.0f, OutlinerHeading.y + 2.0f), IM_COL32(161, 156, 139, 255), CountText);
                const ImVec2 AddMin(ColMin.x + OutlinerWidth - 42.0f, OutlinerHeading.y - 4.0f);
                ImGui::SetCursorScreenPos(AddMin);
                ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 7.0f);
                ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(0.0f, 0.0f));
                ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(39, 38, 31, 255));
                ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(60, 57, 44, 255));
                ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(232, 199, 139, 25));
                ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
                const bool AddPressed = ImGui::Button("+##FluidOutlinerAdd", ImVec2(24.0f, 24.0f));
                ImGui::PopStyleVar(3);
                ImGui::PopStyleColor(3);
                if (AddPressed) ImGui::OpenPopup("##FluidOutlinerAddMenu");
                if (ImGui::BeginPopup("##FluidOutlinerAddMenu"))
                {
                    if (ImGui::MenuItem(P.SourceEnabled ? "Hide source" : "Add source"))
                    {
                        PushUndoSnapshot(ActiveDoc);
                        P.SourceEnabled = !P.SourceEnabled;
                        ActiveDoc.Dirty = true;
                        SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                    }
                    if (ImGui::MenuItem(ColliderVisible ? "Remove collider" : "Add collider"))
                    {
                        PushUndoSnapshot(ActiveDoc);
                        P.ObstacleCategory = ColliderVisible ? 0 : 1;
                        ActiveDoc.Dirty = true;
                        SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                    }
                    if (ImGui::MenuItem(P.SunIntensity > 0.0f ? "Hide sunlight" : "Add sunlight"))
                    {
                        PushUndoSnapshot(ActiveDoc);
                        P.SunIntensity = P.SunIntensity > 0.0f ? 0.0f : 2.2f;
                        ActiveDoc.Dirty = true;
                        SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                    }
                    ImGui::EndPopup();
                }
                ImGui::SetCursorScreenPos(ImVec2(OutlinerHeading.x, OutlinerHeading.y + 32.0f));
                ImGui::SetNextItemWidth(OutlinerWidth - 28.0f);
                ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 8.0f));
                ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 8.0f);
                ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(29, 28, 24, 255));
                ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(37, 35, 29, 255));
                ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(232, 199, 139, 18));
                ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
                ImGui::InputTextWithHint("##FluidOutlinerFilter", "Find an object...", Session.OutlinerSearch,
                                         sizeof(Session.OutlinerSearch));
                ImGui::PopStyleVar(3);
                ImGui::PopStyleColor(3);
                ImGui::Dummy(ImVec2(1.0f, 4.0f));
                static constexpr std::array<const char*, 4> OutlinerFilters = { "All", "Gas", "Geometry", "Lights" };
                static constexpr std::array<float, 4> OutlinerFilterWidths = { 36.0f, 38.0f, 66.0f, 48.0f };
                for (int FilterIndex = 0; FilterIndex < static_cast<int>(OutlinerFilters.size()); ++FilterIndex)
                {
                    if (FilterIndex > 0) ImGui::SameLine(0.0f, 4.0f);
                    if (FluidChip(OutlinerFilters[FilterIndex], Session.OutlinerFilter == FilterIndex, OutlinerFilterWidths[FilterIndex]))
                        Session.OutlinerFilter = FilterIndex;
                }

                auto MatchesFilter = [&](const std::string& Name) -> bool {
                    if (Session.OutlinerSearch[0] == '\0') return true;
                    std::string Haystack = Name;
                    std::string Needle   = Session.OutlinerSearch;
                    std::transform(Haystack.begin(), Haystack.end(), Haystack.begin(),
                                   [](unsigned char C) { return static_cast<char>(std::tolower(C)); });
                    std::transform(Needle.begin(), Needle.end(), Needle.begin(),
                                   [](unsigned char C) { return static_cast<char>(std::tolower(C)); });
                    return Haystack.find(Needle) != std::string::npos;
                };

                struct OutlinerEntrySpec
                {
                    OutlinerNodeId Id;
                    std::string*   MutableName;
                    int            TargetInspectorTab;
                    int            Category;
                    bool           HasEyeToggle;
                    bool           IsEnabled;
                };

                auto& Names = ActiveDoc.Scene.Names;
                std::array<OutlinerEntrySpec, 4> Nodes = { {
                    { OutlinerNodeId::Domain,   &Names.Domain,   1, 2, false, true },
                    { OutlinerNodeId::Source,   &Names.Source,   0, 1, true,  P.SourceEnabled },
                    { OutlinerNodeId::Collider, &Names.Collider, 1, 2, true,  P.ObstacleCategory != 0 },
                    { OutlinerNodeId::Sun,      &Names.Sun,      2, 3, true,  P.SunIntensity > 0.0f },
                } };

                ImGui::Dummy(ImVec2(1.0f, 4.0f));
                for (size_t Idx = 0; Idx < Nodes.size(); ++Idx)
                {
                    auto& Node = Nodes[Idx];
                    if (Node.Id == OutlinerNodeId::Collider && !ColliderVisible) continue;
                    if (!MatchesFilter(*Node.MutableName)) continue;
                    if (Session.OutlinerFilter != 0 && Node.Category != Session.OutlinerFilter) continue;

                    ImGui::PushID(static_cast<int>(Idx));
                    const float Indent = (Node.Id == OutlinerNodeId::Domain) ? 0.0f : 12.0f;
                    if (Indent > 0.0f) ImGui::Indent(Indent);

                    if (Session.RenamingNode == static_cast<int>(Idx))
                    {
                        ImGui::SetNextItemWidth(OutlinerWidth - 36.0f - Indent);
                        if (ImGui::InputText("##RenameFluidNode", Session.RenameField, sizeof(Session.RenameField),
                                             ImGuiInputTextFlags_EnterReturnsTrue | ImGuiInputTextFlags_AutoSelectAll))
                        {
                            if (Session.RenameField[0] != '\0') *Node.MutableName = Session.RenameField;
                            Session.RenamingNode = -1;
                            ActiveDoc.Dirty      = true;
                        }
                        if (!ImGui::IsItemActive() && ImGui::IsMouseClicked(ImGuiMouseButton_Left))
                        {
                            Session.RenamingNode = -1;
                        }
                    }
                    else
                    {
                        const bool Selected = (Session.SelectedNode == Node.Id);
                        const float RowW = OutlinerWidth - 22.0f - Indent;
                        bool DoubleClicked = false;
                        bool ToggleClicked = false;
                        if (FluidSelectableRow(Node.MutableName->c_str(), Node.Id, Selected, Node.IsEnabled, Node.HasEyeToggle,
                                               std::max(60.0f, RowW), 39.0f, &DoubleClicked, &ToggleClicked))
                        {
                            Session.SelectedNode = Node.Id;
                            Session.ActiveInspector = Node.TargetInspectorTab;
                            if (DoubleClicked)
                            {
                                Session.RenamingNode = static_cast<int>(Idx);
                                std::snprintf(Session.RenameField, sizeof(Session.RenameField), "%s", Node.MutableName->c_str());
                            }
                        }
                        if (ToggleClicked)
                        {
                            PushUndoSnapshot(ActiveDoc);
                            if (Node.Id == OutlinerNodeId::Source) P.SourceEnabled = !P.SourceEnabled;
                            else if (Node.Id == OutlinerNodeId::Collider) P.ObstacleCategory = (P.ObstacleCategory == 0) ? 1 : 0;
                            else if (Node.Id == OutlinerNodeId::Sun) P.SunIntensity = (P.SunIntensity <= 0.0f) ? 2.2f : 0.0f;
                            ActiveDoc.Dirty = true;
                            SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                        }
                    }
                    if (Indent > 0.0f) ImGui::Unindent(Indent);
                    ImGui::PopID();
                }

                ImGui::Dummy(ImVec2(1.0f, 10.0f));
                InspectorControls::ConstructSectionDivider(Palette, Faces, "PRESET LIBRARY", "18 effects");
                ImGui::SetNextItemWidth(ImGui::GetContentRegionAvail().x);
                ImGui::InputTextWithHint("##FluidPresetFilter", "Find an effect...", Session.PresetSearch, sizeof(Session.PresetSearch));
                static constexpr std::array<const char*, 4> PresetFilters = { "All", "Fire", "Smoke", "Blast" };
                static constexpr std::array<float, 4> PresetFilterWidths = { 38.0f, 46.0f, 54.0f, 48.0f };
                for (int FilterIndex = 0; FilterIndex < static_cast<int>(PresetFilters.size()); ++FilterIndex)
                {
                    if (FilterIndex > 0) ImGui::SameLine(0.0f, 4.0f);
                    if (FluidChip(PresetFilters[FilterIndex], Session.PresetFilter == FilterIndex, PresetFilterWidths[FilterIndex]))
                        Session.PresetFilter = FilterIndex;
                }
                const auto Presets = FluidDynamics::EnumerateFluidPresets();
                std::string Needle = Session.PresetSearch;
                std::transform(Needle.begin(), Needle.end(), Needle.begin(), [](unsigned char Ch) { return static_cast<char>(std::tolower(Ch)); });
                for (const auto& Preset : Presets)
                {
                    if (Session.PresetFilter != 0 && static_cast<int>(Preset.Category) != Session.PresetFilter) continue;
                    std::string Haystack = std::string(Preset.Title) + " " + Preset.Summary + " " + Preset.Description;
                    std::transform(Haystack.begin(), Haystack.end(), Haystack.begin(), [](unsigned char Ch) { return static_cast<char>(std::tolower(Ch)); });
                    if (!Needle.empty() && Haystack.find(Needle) == std::string::npos) continue;
                    if (!FluidPresetCard(Preset, ActiveDoc.PresetIdentity == Preset.Identity, ImGui::GetContentRegionAvail().x)) continue;
                    PushUndoSnapshot(ActiveDoc);
                    ActiveDoc.PresetIdentity   = Preset.Identity;
                    ActiveDoc.Scene.Name       = Preset.Title;
                    ActiveDoc.Scene.Parameters = FluidDynamics::ConstructPresetParameters(Preset.Identity);
                    ActiveDoc.RestartPending   = true;
                    if (Preset.TriggerExplosionOnLoad) EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern);
                    SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                    Session.StatusNotice = std::string("Loaded preset: ") + Preset.Title;
                }
            }
            ImGui::EndChild();
            ImGui::PopStyleVar(2);
            ImGui::SameLine(0.0f, 10.0f);
        }

        // --- CENTER COLUMN: 3D VOLUMETRIC RAYMARCH VIEWPORT ---
        if (ImGui::BeginChild("##FluidViewportColumn", ImVec2(ViewportWidth, BodyHeight), ImGuiChildFlags_None,
                              ImGuiWindowFlags_NoBackground | ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse))
        {
            ImDrawList* VpDraw = ImGui::GetWindowDrawList();
            const ImVec2 ColumnMin = ImGui::GetCursorScreenPos();
            const ImVec2 ViewportPanelMin = ImGui::GetWindowPos();
            VpDraw->AddRectFilled(ViewportPanelMin, ImVec2(ViewportPanelMin.x + ViewportWidth, ViewportPanelMin.y + BodyHeight), IM_COL32(18, 18, 18, 255), 22.0f);
            VpDraw->AddRect(ViewportPanelMin, ImVec2(ViewportPanelMin.x + ViewportWidth, ViewportPanelMin.y + BodyHeight), IM_COL32(255, 255, 255, 13), 22.0f);
            constexpr float ViewBarHeight = 40.0f;
            constexpr float TransportHeight = 52.0f;
            constexpr float TimelineHeight = 76.0f;
            const ImVec2 ViewBarMax(ColumnMin.x + ViewportWidth, ColumnMin.y + ViewBarHeight);
            VpDraw->AddRectFilled(ColumnMin, ViewBarMax, IM_COL32(23, 23, 23, 255));
            VpDraw->AddText(Faces.Medium, 12.0f, ImVec2(ColumnMin.x + 14.0f, ColumnMin.y + 13.0f), IM_COL32(226, 226, 226, 255), "Scene view");
            VpDraw->AddText(Faces.Regular, 11.0f, ImVec2(ColumnMin.x + 100.0f, ColumnMin.y + 14.0f), IM_COL32(136, 136, 136, 255), "Perspective \xE2\x96\xBE");
            VpDraw->AddText(Faces.Regular, 10.5f, ImVec2(ColumnMin.x + ViewportWidth - 248.0f, ColumnMin.y + 14.0f), IM_COL32(180, 180, 180, 255), "Bake     Diagnostics     Lit volume   \xE2\x96\xBE");
            VpDraw->AddLine(ImVec2(ColumnMin.x, ViewBarMax.y), ViewBarMax, IM_COL32(255, 255, 255, 14), 1.0f);

            const ImVec2 CanvasMin(ColumnMin.x, ColumnMin.y + ViewBarHeight);
            const float CanvasHeight = std::max(64.0f, BodyHeight - ViewBarHeight - TransportHeight - TimelineHeight);
            const ImVec2 CanvasSize(std::max(64.0f, ViewportWidth), CanvasHeight);
            ImGui::SetCursorScreenPos(CanvasMin);
            ImGui::InvisibleButton("##Fluid3DCanvasHitbox", CanvasSize,
                                   ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight | ImGuiButtonFlags_MouseButtonMiddle);
            const bool Hovered = ImGui::IsItemHovered();

            ActiveDoc.Scene.Camera.AutoTurntable = P.AutoTurntable;
            ActiveDoc.Scene.Camera.Advance(std::clamp(Io.DeltaTime, 1.0f / 240.0f, 0.05f));

            bool                 BrushActiveNow = false;
            std::array<float, 3> BrushUvw       = { 0.5f, 0.35f, 0.5f };
            std::array<float, 3> BrushVelocity  = { 0.0f, 0.0f, 0.0f };

            const std::array<float, 3> DomainScale = (Session.LastImage.Extent[0] > 0u)
                                                         ? Session.LastImage.DynamicScale
                                                         : std::array<float, 3>{ P.BoundsWidth, P.BoundsHeight, P.BoundsWidth };
            const std::array<float, 3> HalfBox     = { 0.5f * DomainScale[0], 0.5f * DomainScale[1], 0.5f * DomainScale[2] };

            if (Hovered)
            {
                if (std::fabs(Io.MouseWheel) > 1.0e-3f)
                {
                    ActiveDoc.Scene.Camera.Dolly(Io.MouseWheel);
                }

                const bool OrbitGesture = ImGui::IsMouseDown(ImGuiMouseButton_Right) ||
                                          (ImGui::IsMouseDown(ImGuiMouseButton_Left) && (Io.KeyAlt || Session.ActiveViewportTool == 0));
                const bool PanGesture   = ImGui::IsMouseDown(ImGuiMouseButton_Middle) ||
                                          (ImGui::IsMouseDown(ImGuiMouseButton_Right) && Io.KeyShift);

                if (PanGesture)
                {
                    ActiveDoc.Scene.Camera.Pan(Io.MouseDelta.x, Io.MouseDelta.y, CanvasSize.y);
                }
                else if (OrbitGesture)
                {
                    ActiveDoc.Scene.Camera.Orbit(-Io.MouseDelta.x * 0.0075f, -Io.MouseDelta.y * 0.0065f);
                }
                else if (ImGui::IsMouseDown(ImGuiMouseButton_Left))
                {
                    const float NormX  = (Io.MousePos.x - CanvasMin.x) / CanvasSize.x;
                    const float NormY  = (Io.MousePos.y - CanvasMin.y) / CanvasSize.y;
                    const float Aspect = CanvasSize.x / CanvasSize.y;
                    if (const auto Hit = ActiveDoc.Scene.Camera.RaycastVolumeUvw(NormX, NormY, Aspect, HalfBox); Hit.has_value())
                    {
                        BrushUvw          = *Hit;
                        const float InvDt = 1.0f / std::max(Io.DeltaTime, 1.0f / 120.0f);
                        if (Session.HasPreviousBrush)
                        {
                            for (int Axis = 0; Axis < 3; ++Axis)
                            {
                                BrushVelocity[Axis] = std::clamp((BrushUvw[Axis] - Session.PreviousBrushUvw[Axis]) * InvDt * 1.4f,
                                                                 -12.0f, 12.0f);
                            }
                        }
                        Session.PreviousBrushUvw = BrushUvw;
                        Session.HasPreviousBrush = true;

                        if (Session.ActiveViewportTool == 1)
                        {
                            BrushActiveNow = true;
                            BrushVelocity[1] += 2.2f;
                        }
                        else if (Session.ActiveViewportTool == 2 && ImGui::IsMouseClicked(ImGuiMouseButton_Left))
                        {
                            EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern, BrushUvw);
                        }
                        else if (Session.ActiveViewportTool == 3)
                        {
                            if (P.ObstacleCategory == 0) P.ObstacleCategory = 1;
                            P.ObstacleX = BrushUvw[0];
                            P.ObstacleY = BrushUvw[1];
                            P.ObstacleZ = BrushUvw[2];
                        }
                    }
                }
                else
                {
                    Session.HasPreviousBrush = false;
                }
            }
            else
            {
                Session.HasPreviousBrush = false;
            }

            // Issue GPU simulation + volumetric raymarch request
            const auto& Presenter = InspectorRuntime::Instance().QueryFluidViewportPresenter();
            if (Presenter)
            {
                if (Session.Flipbook.Recording)
                {
                    const int TotalFrames = Session.Flipbook.Columns * Session.Flipbook.Rows;
                    FluidViewportRequest BakeReq{};
                    BakeReq.DocumentSlot      = ActiveDoc.GpuSlot;
                    BakeReq.ViewportWidth     = static_cast<uint32_t>(Session.Flipbook.FrameWidth);
                    BakeReq.ViewportHeight    = static_cast<uint32_t>(Session.Flipbook.FrameHeight);
                    BakeReq.DeltaSeconds      = Session.Flipbook.DurationSec / static_cast<float>(std::max(1, TotalFrames));
                    BakeReq.Parameters        = P;
                    BakeReq.Parameters.Paused = false;
                    BakeReq.Camera            = ActiveDoc.Scene.Camera;
                    BakeReq.ExportFlipbook    = true;
                    if (Session.Flipbook.Captured == 0 && Session.Flipbook.DetonateStart)
                    {
                        BakeReq.Restart = true;
                        FluidBlastImpulse InitBlast{};
                        InitBlast.Radius      = P.BlastRadius;
                        InitBlast.Strength    = P.BlastStrength;
                        InitBlast.Temperature = P.BlastTemperature;
                        InitBlast.Fuel        = P.BlastFuel;
                        InitBlast.Smoke       = P.BlastSmoke;
                        InitBlast.Lobes       = P.BlastLobes;
                        BakeReq.Blasts.push_back(InitBlast);
                    }
                    FluidViewportImage Baked = Presenter(BakeReq);
                    if (Baked.ReadbackRgba.size() == static_cast<size_t>(Session.Flipbook.FrameWidth) * Session.Flipbook.FrameHeight * 4u)
                    {
                        const int Col    = Session.Flipbook.Captured % Session.Flipbook.Columns;
                        const int Row    = Session.Flipbook.Captured / Session.Flipbook.Columns;
                        const int SheetW = Session.Flipbook.Columns * Session.Flipbook.FrameWidth;
                        for (int Y = 0; Y < Session.Flipbook.FrameHeight; ++Y)
                        {
                            const size_t DstOff = (static_cast<size_t>(Row * Session.Flipbook.FrameHeight + Y) * SheetW +
                                                   static_cast<size_t>(Col * Session.Flipbook.FrameWidth)) * 4u;
                            const size_t SrcOff = static_cast<size_t>(Y) * Session.Flipbook.FrameWidth * 4u;
                            std::memcpy(Session.Flipbook.SheetRgba.data() + DstOff,
                                        Baked.ReadbackRgba.data() + SrcOff,
                                        static_cast<size_t>(Session.Flipbook.FrameWidth) * 4u);
                        }
                    }
                    ++Session.Flipbook.Captured;
                    if (Session.Flipbook.Captured >= TotalFrames)
                    {
                        Session.Flipbook.Recording = false;
                        const uint32_t SheetW      = static_cast<uint32_t>(Session.Flipbook.Columns * Session.Flipbook.FrameWidth);
                        const uint32_t SheetH      = static_cast<uint32_t>(Session.Flipbook.Rows * Session.Flipbook.FrameHeight);
                        if (WriteUncompressedRgbaPng(Session.Flipbook.OutputPath, SheetW, SheetH, Session.Flipbook.SheetRgba))
                        {
                            Session.Flipbook.LastMessage = std::string("Saved RGBA flipbook: ") + Session.Flipbook.OutputPath;
                            Session.StatusNotice         = Session.Flipbook.LastMessage;
                        }
                        else
                        {
                            Session.Flipbook.LastMessage = "Failed writing flipbook PNG.";
                        }
                    }
                    Session.LastImage = std::move(Baked);
                }
                else
                {
                    FluidViewportRequest Req{};
                    Req.DocumentSlot   = ActiveDoc.GpuSlot;
                    Req.ViewportWidth  = static_cast<uint32_t>(CanvasSize.x);
                    Req.ViewportHeight = static_cast<uint32_t>(CanvasSize.y);
                    Req.DeltaSeconds   = std::clamp(Io.DeltaTime, 1.0f / 240.0f, 1.0f / 20.0f);
                    Req.StepOnce       = ActiveDoc.StepOncePending;
                    Req.Restart        = ActiveDoc.RestartPending;
                    Req.Parameters     = P;
                    Req.Camera         = ActiveDoc.Scene.Camera;
                    Req.BrushActive    = BrushActiveNow;
                    Req.BrushUvw       = BrushUvw;
                    Req.BrushVelocity  = BrushVelocity;
                    Req.BrushRadius    = ActiveDoc.BrushRadius;
                    if (!ActiveDoc.PendingBlasts.empty())
                    {
                        Req.Blasts.push_back(ActiveDoc.PendingBlasts.front());
                        ActiveDoc.PendingBlasts.erase(ActiveDoc.PendingBlasts.begin());
                    }
                    ActiveDoc.StepOncePending = false;
                    ActiveDoc.RestartPending  = false;
                    Session.LastImage         = Presenter(Req);
                }
            }

            const ImVec2 CanvasMax = ImVec2(CanvasMin.x + CanvasSize.x, CanvasMin.y + CanvasSize.y);
            VpDraw->AddRectFilled(CanvasMin, CanvasMax, IM_COL32(10, 12, 16, 255));

            if (Session.LastImage.Texture != 0u)
            {
                VpDraw->AddImage(static_cast<ImTextureID>(Session.LastImage.Texture), CanvasMin, CanvasMax);
            }
            else
            {
                const char* Msg = Session.LastImage.Failure.empty()
                                      ? "FluidViewportPresenter not registered on this host."
                                      : Session.LastImage.Failure.c_str();
                VpDraw->AddText(Faces.Medium, 13.0f, ImVec2(CanvasMin.x + 24.0f, CanvasMin.y + 24.0f),
                                Palette.WarmAmber, Msg);
            }

            if (Session.ShowDomainWire || P.ShowBoundingBox)
            {
                VpDraw->PushClipRect(CanvasMin, CanvasMax, true);
                for (const auto& Seg : ActiveDoc.Scene.Camera.ProjectBoundsSegments(HalfBox, CanvasSize.x, CanvasSize.y))
                {
                    VpDraw->AddLine(ImVec2(CanvasMin.x + Seg[0], CanvasMin.y + Seg[1]),
                                    ImVec2(CanvasMin.x + Seg[2], CanvasMin.y + Seg[3]),
                                    IM_COL32(236, 166, 78, 96), 1.15f);
                }
                VpDraw->PopClipRect();
            }

            if (Session.ShowHudOverlay)
            {
                const ImVec2 HudMin = ImVec2(CanvasMin.x + 12.0f, CanvasMin.y + 12.0f);
                const ImVec2 HudMax = ImVec2(HudMin.x + 292.0f, HudMin.y + 62.0f);
                VpDraw->AddRectFilled(HudMin, HudMax, IM_COL32(12, 14, 19, 196), 5.0f);
                VpDraw->AddRect(HudMin, HudMax, Palette.EdgeBorder, 5.0f);

                char Line1[128]{};
                std::snprintf(Line1, sizeof(Line1), "%d\xC2\xB3 Eulerian Grid  \xC2\xB7  %.2f ms  \xC2\xB7  %u steps",
                              P.GridResolution, Session.LastImage.RefreshMilliseconds, Session.LastImage.EffectiveRaySteps);
                VpDraw->AddText(Faces.Medium, 11.5f, ImVec2(HudMin.x + 10.0f, HudMin.y + 8.0f), Palette.TextPrimary, Line1);

                const auto Channels = FluidDynamics::EnumerateFluidDebugChannels();
                const int  ChanIdx  = std::clamp(P.RenderChannel, 0, static_cast<int>(Channels.size()) - 1);
                char       Line2[128]{};
                std::snprintf(Line2, sizeof(Line2), "%s  \xC2\xB7  Bounds %.2f\xC3\x97%.2fm",
                              Channels[ChanIdx], Session.LastImage.DynamicScale[0], Session.LastImage.DynamicScale[1]);
                VpDraw->AddText(Faces.Regular, 11.0f, ImVec2(HudMin.x + 10.0f, HudMin.y + 26.0f), Palette.WarmAmber, Line2);

                VpDraw->AddText(Faces.Regular, 10.5f, ImVec2(HudMin.x + 10.0f, HudMin.y + 43.0f), Palette.TextMuted,
                                "LMB: Tool  \xC2\xB7  RMB: Orbit  \xC2\xB7  MMB: Pan  \xC2\xB7  D / E: Detonate");
            }
            const float TransportY = CanvasMin.y + CanvasSize.y;
            const ImVec2 TransportMin(ColumnMin.x, TransportY);
            const ImVec2 TransportMax(ColumnMin.x + ViewportWidth, TransportY + TransportHeight);
            VpDraw->AddRectFilled(TransportMin, TransportMax, IM_COL32(22, 22, 22, 255));
            VpDraw->AddLine(TransportMin, ImVec2(TransportMax.x, TransportMin.y), IM_COL32(255, 255, 255, 14), 1.0f);
            auto TransportButton = [&](const char* Id, const char* Label, float X, float Width) {
                ImGui::PushID(Id);
                const ImVec2 Min(X, TransportY + 11.0f);
                ImGui::SetCursorScreenPos(Min);
                const bool Pressed = ImGui::InvisibleButton("##TransportButton", ImVec2(Width, 30.0f));
                const bool Hovered = ImGui::IsItemHovered();
                const bool Primary = std::string_view(Label) == "Play" || std::string_view(Label) == "Pause";
                VpDraw->AddRectFilled(Min, ImVec2(Min.x + Width, Min.y + 30.0f),
                                      Primary ? IM_COL32(224, 224, 224, 255) : (Hovered ? IM_COL32(44, 44, 44, 255) : IM_COL32(31, 31, 31, 255)), 15.0f);
                const ImU32 Ink = Primary ? IM_COL32(20, 20, 20, 255) : IM_COL32(216, 216, 216, 255);
                const ImVec2 TextSize = ImGui::CalcTextSize(Label);
                VpDraw->AddText(ImVec2(Min.x + (Width - TextSize.x) * 0.5f, Min.y + 8.0f), Ink, Label);
                ImGui::PopID();
                return Pressed;
            };
            float TransportX = ColumnMin.x + 12.0f;
            (void)TransportButton("Rewind", "|<", TransportX, 30.0f); TransportX += 34.0f;
            if (TransportButton("TogglePlayback", P.Paused ? "Play" : "Pause", TransportX, 54.0f)) P.Paused = !P.Paused;
            TransportX += 58.0f;
            if (TransportButton("StepSimulation", ">|", TransportX, 30.0f)) ActiveDoc.StepOncePending = true;
            TransportX += 42.0f;
            char ClockText[32]{};
            std::snprintf(ClockText, sizeof(ClockText), "%02d:%02d.%03d", static_cast<int>(Session.LastImage.ElapsedSeconds) / 60,
                          static_cast<int>(Session.LastImage.ElapsedSeconds) % 60,
                          static_cast<int>((Session.LastImage.ElapsedSeconds - std::floor(Session.LastImage.ElapsedSeconds)) * 1000.0f));
            VpDraw->AddText(Faces.Monospace, 10.5f, ImVec2(TransportX, TransportY + 20.0f), IM_COL32(207, 207, 207, 255), ClockText);
            VpDraw->AddText(Faces.Regular, 10.5f, ImVec2(ColumnMin.x + ViewportWidth - 235.0f, TransportY + 20.0f), IM_COL32(136, 136, 136, 255), "1.0x   \xE2\x80\xA2   Live / uncached");
            if (TransportButton("Detonate", "Trigger D", ColumnMin.x + ViewportWidth - 108.0f, 96.0f))
            {
                EnqueueBurstPattern(ActiveDoc, ActiveDoc.BurstPattern);
                ++Config.BurstGeneration;
                Config.AdvanceRevision();
            }

            const float TimelineY = TransportY + TransportHeight;
            const ImVec2 TimelineMin(ColumnMin.x, TimelineY);
            const ImVec2 TimelineMax(ColumnMin.x + ViewportWidth, TimelineY + TimelineHeight);
            VpDraw->AddRectFilled(TimelineMin, TimelineMax, IM_COL32(17, 17, 17, 255));
            VpDraw->AddText(Faces.Medium, 9.0f, ImVec2(TimelineMin.x + 14.0f, TimelineMin.y + 8.0f), IM_COL32(136, 136, 136, 255), "SIMULATION");
            char FrameText[32]{};
            std::snprintf(FrameText, sizeof(FrameText), "FRAME %04llu", static_cast<unsigned long long>(Session.LastImage.StepCount));
            VpDraw->AddText(Faces.Monospace, 9.0f, ImVec2(TimelineMax.x - 90.0f, TimelineMin.y + 8.0f), IM_COL32(136, 136, 136, 255), FrameText);
            const float RulerX = TimelineMin.x + 16.0f;
            const float RulerW = std::max(40.0f, ViewportWidth - 32.0f);
            VpDraw->AddLine(ImVec2(RulerX, TimelineMin.y + 38.0f), ImVec2(RulerX + RulerW, TimelineMin.y + 38.0f), IM_COL32(78, 78, 78, 255), 1.0f);
            for (int Tick = 0; Tick <= 6; ++Tick)
            {
                const float TickX = RulerX + RulerW * (static_cast<float>(Tick) / 6.0f);
                VpDraw->AddLine(ImVec2(TickX, TimelineMin.y + 34.0f), ImVec2(TickX, TimelineMin.y + 42.0f), IM_COL32(102, 102, 102, 255), 1.0f);
                char Mark[12]{};
                std::snprintf(Mark, sizeof(Mark), "%ds", Tick * 5);
                VpDraw->AddText(Faces.Regular, 8.5f, ImVec2(TickX - 5.0f, TimelineMin.y + 44.0f), IM_COL32(112, 112, 112, 255), Mark);
            }
            VpDraw->AddRectFilled(ImVec2(RulerX, TimelineMin.y + 60.0f), ImVec2(RulerX + RulerW, TimelineMin.y + 72.0f), IM_COL32(35, 35, 35, 255), 6.0f);
            VpDraw->AddRectFilled(ImVec2(RulerX, TimelineMin.y + 60.0f), ImVec2(RulerX + std::min(180.0f, RulerW), TimelineMin.y + 72.0f), IM_COL32(67, 67, 67, 255), 6.0f);
        }
        ImGui::EndChild();

        // --- RIGHT COLUMN: 3-TAB INSPECTOR (Source | Simulation | Rendering) ---
        if (Session.ShowInspector)
        {
            ImGui::SameLine(0.0f, 10.0f);
            ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(12.0f, 8.0f));
            ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(6.0f, 5.0f));
            if (ImGui::BeginChild("##FluidInspectorColumn", ImVec2(InspectorWidth, BodyHeight), ImGuiChildFlags_None,
                                  ImGuiWindowFlags_NoBackground))
            {
                ImDrawList* ColDraw = ImGui::GetWindowDrawList();
                const ImVec2 ColMin = ImGui::GetWindowPos();
                ColDraw->AddRectFilled(ColMin, ImVec2(ColMin.x + InspectorWidth, ColMin.y + BodyHeight), IM_COL32(18, 18, 18, 255), 22.0f);
                ColDraw->AddRect(ColMin, ImVec2(ColMin.x + InspectorWidth, ColMin.y + BodyHeight), IM_COL32(255, 255, 255, 13), 22.0f);
                const ImVec2 InspectorHeading = ImGui::GetCursorScreenPos();
                ColDraw->AddText(Faces.Medium, 16.0f, InspectorHeading, IM_COL32(143, 143, 143, 255), "Inspector");
                ImGui::SetCursorScreenPos(ImVec2(InspectorHeading.x + InspectorWidth - 78.0f, InspectorHeading.y - 2.0f));
                ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 12.0f);
                ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
                ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(25, 25, 25, 255));
                ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(38, 38, 38, 255));
                ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(45, 45, 45, 255));
                ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(160, 160, 160, 255));
                ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(255, 255, 255, 14));
                if (ImGui::Button("Reset", ImVec2(58.0f, 25.0f)))
                {
                    PushUndoSnapshot(ActiveDoc);
                    ActiveDoc.Scene.Parameters = FluidDynamics::ConstructPresetParameters(ActiveDoc.PresetIdentity);
                    ActiveDoc.RestartPending = true;
                }
                ImGui::PopStyleColor(5);
                ImGui::PopStyleVar(2);
                ImGui::SetCursorScreenPos(ImVec2(InspectorHeading.x, InspectorHeading.y + 30.0f));
                const ImVec2 ObjectMin = ImGui::GetCursorScreenPos();
                const float ObjectWidth = ImGui::GetContentRegionAvail().x;
                const ImVec2 ObjectMax(ObjectMin.x + ObjectWidth, ObjectMin.y + 78.0f);
                ColDraw->AddRectFilled(ObjectMin, ObjectMax, IM_COL32(26, 26, 26, 255), 16.0f);
                ColDraw->AddRect(ObjectMin, ObjectMax, IM_COL32(255, 255, 255, 14), 16.0f);
                const char* ObjectName = Session.SelectedNode == OutlinerNodeId::Domain ? ActiveDoc.Scene.Names.Domain.c_str() :
                                         Session.SelectedNode == OutlinerNodeId::Collider ? ActiveDoc.Scene.Names.Collider.c_str() :
                                         Session.SelectedNode == OutlinerNodeId::Sun ? ActiveDoc.Scene.Names.Sun.c_str() : ActiveDoc.Scene.Names.Source.c_str();
                const char* ObjectType = Session.SelectedNode == OutlinerNodeId::Domain ? "EULERIAN VOLUME" :
                                         Session.SelectedNode == OutlinerNodeId::Collider ? "SIGNED DISTANCE COLLIDER" :
                                         Session.SelectedNode == OutlinerNodeId::Sun ? "DIRECTIONAL LIGHT" : "CONTINUOUS SOURCE";
                ColDraw->AddRectFilled(ImVec2(ObjectMin.x + 14.0f, ObjectMin.y + 17.0f), ImVec2(ObjectMin.x + 52.0f, ObjectMin.y + 61.0f), IM_COL32(43, 43, 43, 255), 14.0f);
                PanelChrome::DrawGlyph("M12 22a8 8 0 0 0 8-8c0-3-2-5-4-7-1 3-2 4-4 5-1-3-3-5-5-8-1 4-3 6-3 10a8 8 0 0 0 8 8Z",
                                       ImVec2(ObjectMin.x + 23.0f, ObjectMin.y + 30.0f), 18.0f, 0xFFB454u, 1.6f);
                ColDraw->AddText(Faces.Medium, 23.0f, ImVec2(ObjectMin.x + 64.0f, ObjectMin.y + 15.0f), IM_COL32(235, 235, 235, 255), ObjectName);
                ColDraw->AddText(Faces.Regular, 8.0f, ImVec2(ObjectMin.x + 65.0f, ObjectMin.y + 49.0f), IM_COL32(115, 115, 115, 255), ObjectType);
                ImGui::SetCursorScreenPos(ImVec2(ObjectMin.x, ObjectMin.y + 45.0f));
                if (FluidSwitch("", &Config.Enabled)) { Config.AdvanceRevision(); ActiveDoc.Dirty = true; }
                ImGui::SetCursorScreenPos(ImVec2(ObjectMin.x, ObjectMax.y + 12.0f));

                FluidInspectorTabStrip(Faces, Session.ActiveInspector);
                ColDraw->ChannelsSplit(2);
                ColDraw->ChannelsSetCurrent(1);

                FluidSectionCardBounds SectionCards{};
                float SectionCardTop = -1.0f;
                bool CurrentGroupOpen = false;
                bool Edited = false;

                auto DrawColliderGroup = [&](const char* GroupId, bool DefaultOpen)
                {
                    if (!FluidPropertyGroup(Faces, GroupId, "Collider", "SDF", DefaultOpen, SectionCards, SectionCardTop, CurrentGroupOpen)) return;
                    FluidPropertyHint(Faces, "Position is normalized within the domain. The collider changes simulated flow without restarting it.");
                    const auto Labels = FluidDynamics::EnumerateFluidColliderLabels();
                    if (FluidSelect("ColliderShape", "Collider type", &P.ObstacleCategory, Labels.data(), static_cast<int>(Labels.size()), 10000.0f)) Edited = true;
                    Edited |= FluidSliderRow(Palette, Faces, "##FoPx", "Center X", P.ObstacleX, 0.05f, 0.95f, "%.2f");
                    Edited |= FluidSliderRow(Palette, Faces, "##FoPy", "Center Y", P.ObstacleY, 0.03f, 0.95f, "%.2f");
                    Edited |= FluidSliderRow(Palette, Faces, "##FoPz", "Center Z", P.ObstacleZ, 0.05f, 0.95f, "%.2f");
                    Edited |= FluidSliderRow(Palette, Faces, "##FoRad", "Collider radius", P.ObstacleRadius, 0.04f, 0.40f, "%.3f");
                    if (FluidSwitch("Animate orbital motion", &P.ColliderAutoMove)) Edited = true;
                    if (P.ColliderAutoMove) Edited |= FluidSliderRow(Palette, Faces, "##FoSpd", "Orbit speed", P.ColliderSpeed, 0.1f, 5.0f, "%.2f rad/s");
                };

                if (Session.ActiveInspector == 0)
                {
                    const bool ColliderSelected = Session.SelectedNode == OutlinerNodeId::Collider;
                    if (ColliderSelected) DrawColliderGroup("Source.Collider.Selected", true);
                    else
                    {
                        if (FluidPropertyGroup(Faces, "Source.Emission", "Emission", "SOURCE", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                        {
                            FluidPropertyHint(Faces, "A continuous source at the domain’s X/Z centre. Height and radius are live simulation parameters.");
                            if (FluidSwitch("Enable continuous source", &P.SourceEnabled)) Edited = true;
                            Edited |= FluidSliderRow(Palette, Faces, "##FsRate", "Injection rate", P.SourceRate, 0.0f, 6.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FsRad", "Source radius", P.SourceRadius, 0.02f, 0.35f, "%.3f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FsHgt", "Base height", P.SourceHeight, 0.02f, 0.85f, "%.2f");
                        }
                        if (FluidPropertyGroup(Faces, "Source.FuelTemperature", "Fuel & temperature", "INJECTION", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                        {
                            Edited |= FluidSliderRow(Palette, Faces, "##FsTemp", "Core temperature", P.SourceTemperature, 0.0f, 8.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FsFuel", "Fuel feed", P.SourceFuel, 0.0f, 6.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FsSmoke", "Soot / smoke", P.SourceSmoke, 0.0f, 6.0f, "%.2f");
                        }
                        if (FluidPropertyGroup(Faces, "Source.Velocity", "Velocity", "FLOW", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                        {
                            Edited |= FluidSliderRow(Palette, Faces, "##FsUp", "Upward jet", P.SourceUpwardVelocity, -3.0f, 8.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FsSwirl", "Helical swirl", P.SourceSwirl, -6.0f, 6.0f, "%.2f");
                        }
                    }
                    if (FluidPropertyGroup(Faces, "Source.BurstGenerator", "Burst generator", "IMPULSE", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        if (FluidSwitch("Ballistic shrapnel streamers", &P.ShrapnelEnabled)) Edited = true;
                        Edited |= FluidSliderRow(Palette, Faces, "##FbStr", "Shock strength", P.BlastStrength, 0.5f, 22.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FbRad", "Blast radius", P.BlastRadius, 0.05f, 0.42f, "%.3f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FbTmp", "Fireball temp", P.BlastTemperature, 0.0f, 12.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FbFuel", "Blast fuel", P.BlastFuel, 0.0f, 10.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FbSmk", "Blast smoke", P.BlastSmoke, 0.0f, 8.0f, "%.2f");
                        Edited |= SliderIntRow(Palette, Faces, "##FbLobes", "Rayleigh lobes", P.BlastLobes, 0, 14);
                    }
                    if (!ColliderSelected) DrawColliderGroup("Source.Collider", false);
                }
                else if (Session.ActiveInspector == 1)
                {
                    if (FluidPropertyGroup(Faces, "Simulation.Domain", "Domain", "3D", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        Edited |= FluidSliderRow(Palette, Faces, "##FgBw", "Domain width", P.BoundsWidth, 0.8f, 4.5f, "%.2f m");
                        Edited |= FluidSliderRow(Palette, Faces, "##FgBh", "Domain height", P.BoundsHeight, 0.8f, 5.5f, "%.2f m");
                        if (FluidSwitch("Dynamic surge bounds", &P.DynamicBounds)) Edited = true;
                        if (P.DynamicBounds) Edited |= FluidSliderRow(Palette, Faces, "##FgSurge", "Maximum surge scale", P.DynamicBoundsMax, 1.0f, 3.0f, "%.2fx");
                    }
                    if (FluidPropertyGroup(Faces, "Simulation.VoxelGrid", "Voxel grid", "SOLVER", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        FluidPropertyHint(Faces, "Changing voxel resolution rebuilds the grid and restarts the simulation. Other properties update live.");
                        static const std::array<const char*, 6> ResLabels = { "32³", "48³", "64³", "80³", "96³", "128³" };
                        static constexpr int ResValues[6] = { 32, 48, 64, 80, 96, 128 };
                        int ResIdx = 1;
                        for (int Idx = 0; Idx < 6; ++Idx) if (P.GridResolution == ResValues[Idx]) ResIdx = Idx;
                        if (FluidSegmentedPropertyRow(Faces, "##FgRes", "Grid resolution", ResIdx, ResLabels.data(), static_cast<int>(ResLabels.size())))
                        {
                            P.GridResolution = ResValues[ResIdx]; Edited = true;
                        }
                        Edited |= SliderIntRow(Palette, Faces, "##FgJacobi", "Pressure iterations", P.PressureIterations, 4, 56);
                        if (FluidSwitch("MacCormack BFECC advection", &P.MacCormackAdvection)) Edited = true;
                        if (FluidSwitch("Enclosed ceiling and walls", &P.EnclosedBox)) Edited = true;
                        Edited |= FluidSliderRow(Palette, Faces, "##FgTime", "Time scale", P.TimeScale, 0.05f, 2.5f, "%.2fx");
                    }
                    if (FluidPropertyGroup(Faces, "Simulation.Forces", "Forces & turbulence", "FLOW", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        Edited |= FluidSliderRow(Palette, Faces, "##FsVort", "Vorticity confinement", P.VorticityConfinement, 0.0f, 16.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsBuoy", "Thermal buoyancy", P.Buoyancy, -4.0f, 10.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsWgt", "Heavy soot weight", P.SmokeWeight, -2.0f, 4.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsTurb", "Curl turbulence", P.TurbulenceStrength, 0.0f, 8.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsTSc", "Turbulence scale", P.TurbulenceScale, 0.5f, 10.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsWx", "Crosswind X", P.WindX, -4.0f, 4.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsWz", "Crosswind Z", P.WindZ, -4.0f, 4.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FsDmp", "Velocity drag", P.VelocityDamping, 0.0f, 2.0f, "%.2f");
                    }
                    if (FluidPropertyGroup(Faces, "Simulation.Combustion", "Combustion", "REACTION", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        Edited |= FluidSliderRow(Palette, Faces, "##FcBurn", "Burn rate", P.BurnRate, 0.0f, 8.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FcHeat", "Reaction enthalpy", P.BurnHeat, 0.0f, 8.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FcSoot", "Soot yield", P.SootGeneration, 0.0f, 4.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FcExp", "Gas expansion", P.CombustionExpansion, 0.0f, 6.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FcCool", "Radiative cooling", P.CoolingRate, 0.0f, 4.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FcDiss", "Smoke dissipation", P.SmokeDissipation, 0.0f, 2.0f, "%.3f");
                    }
                }
                else
                {
                    const bool SunSelected = Session.SelectedNode == OutlinerNodeId::Sun;
                    auto DrawDirectionalLight = [&]()
                    {
                        if (FluidPropertyGroup(Faces, "Rendering.DirectionalLight", "Directional light", "LIGHT", SunSelected, SectionCards, SectionCardTop, CurrentGroupOpen))
                        {
                            Edited |= FluidSliderRow(Palette, Faces, "##FlSunIn", "Sun intensity", P.SunIntensity, 0.0f, 8.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FlSunAz", "Sun azimuth", P.SunAzimuth, -180.0f, 180.0f, "%.1f°");
                            Edited |= FluidSliderRow(Palette, Faces, "##FlSunEl", "Sun elevation", P.SunElevation, 2.0f, 88.0f, "%.1f°");
                            Edited |= FluidSliderRow(Palette, Faces, "##FlAmb", "Sky ambient", P.AmbientIntensity, 0.0f, 3.0f, "%.2f");
                        }
                    };
                    if (SunSelected) DrawDirectionalLight();
                    if (FluidPropertyGroup(Faces, "Rendering.VolumeShading", "Volume shading", "VOLUME", true, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        const auto Labels = FluidDynamics::EnumerateFluidColorPalettes();
                        if (FluidSelect("ColorPalette", "Color palette", &P.ColorPalette, Labels.data(), static_cast<int>(Labels.size()), 10000.0f)) Edited = true;
                        Edited |= FluidSliderRow(Palette, Faces, "##FlFire", "Blackbody radiance", P.FireIntensity, 0.0f, 12.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlExt", "Density extinction", P.DensityExtinction, 1.0f, 36.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlAlb", "Smoke albedo", P.SmokeAlbedo, 0.02f, 0.98f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlExp", "Exposure", P.Exposure, 0.15f, 4.0f, "%.2f");
                    }
                    if (!SunSelected) DrawDirectionalLight();
                    if (FluidPropertyGroup(Faces, "Rendering.ScatteringGlow", "Scattering & glow", "LIGHT", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        Edited |= FluidSliderRow(Palette, Faces, "##FlBloom", "Fireball bloom", P.BloomIntensity, 0.0f, 2.5f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlRays", "Crepuscular rays", P.GodRaysIntensity, 0.0f, 2.5f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlShock", "Shockwave refraction", P.ShockwaveStrength, 0.0f, 2.5f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlTempK", "Temperature scale", P.TemperatureScale, 0.25f, 3.0f, "%.2fx");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlIntS", "Core glow scatter", P.InternalScattering, 0.0f, 6.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlShDn", "Self-shadowing", P.ShadowDensity, 0.0f, 24.0f, "%.2f");
                        Edited |= FluidSliderRow(Palette, Faces, "##FlAnis", "Phase anisotropy", P.PhaseAnisotropy, -0.5f, 0.85f, "%.2f");
                    }
                    if (FluidPropertyGroup(Faces, "Rendering.Quality", "Render quality", "GPU", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        Edited |= SliderIntRow(Palette, Faces, "##FrSteps", "Raymarch steps", P.RaymarchSteps, 24, 192);
                        Edited |= SliderIntRow(Palette, Faces, "##FrShad", "Shadow steps", P.ShadowSteps, 2, 24);
                        Edited |= FluidSliderRow(Palette, Faces, "##FrScale", "Render scale", P.RenderScale, 0.35f, 1.25f, "%.2fx");
                        if (FluidSwitch("Adaptive GPU governor", &P.AutoGpuGovernor)) Edited = true;
                        if (FluidSwitch("Auto turntable camera", &P.AutoTurntable)) Edited = true;
                        Edited |= FluidSliderRow(Palette, Faces, "##FrVoxQ", "Voxel quantization", P.VoxelQuantization, 0.0f, 1.0f, "%.2f");
                    }
                    if (FluidPropertyGroup(Faces, "Rendering.EmbersAsh", "Embers & ash", "PARTICLES", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        if (FluidSwitch("GPU ballistic embers and ash", &P.ShowEmbers)) Edited = true;
                        if (P.ShowEmbers)
                        {
                            Edited |= SliderIntRow(Palette, Faces, "##FeCnt", "Ember count", P.EmberCount, 16, 1200);
                            Edited |= FluidSliderRow(Palette, Faces, "##FeSz", "Spark size", P.EmberSize, 0.2f, 3.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FeInt", "Spark radiance", P.EmberIntensity, 0.1f, 6.0f, "%.2f");
                            Edited |= FluidSliderRow(Palette, Faces, "##FeLife", "Lifetime", P.EmberLifetime, 0.25f, 4.0f, "%.2f s");
                            Edited |= FluidSliderRow(Palette, Faces, "##FeAsh", "Cooling ashiness", P.EmberAshiness, 0.0f, 1.0f, "%.2f");
                        }
                    }
                    if (FluidPropertyGroup(Faces, "Rendering.Overlays", "Overlays & diagnostics", "DEBUG", false, SectionCards, SectionCardTop, CurrentGroupOpen))
                    {
                        if (FluidSwitch("Bounding box", &P.ShowBoundingBox)) Edited = true;
                        if (FluidSwitch("Voxel grid lines", &P.ShowVoxelGridLines)) Edited = true;
                        if (FluidSwitch("Floor reference grid", &P.ShowFloorGrid)) Edited = true;
                        if (FluidSwitch("Active voxel cell wireframe", &P.ShowActiveVoxelCells)) Edited = true;
                        if (FluidSwitch("2D tiled voxel atlas minimap", &P.ShowAtlasMinimap)) Edited = true;
                        if (P.ShowAtlasMinimap)
                        {
                            const auto Fields = FluidDynamics::EnumerateFluidAtlasFields();
                            if (FluidSelect("AtlasField", "Atlas field", &P.AtlasMinimapField, Fields.data(), static_cast<int>(Fields.size()), 10000.0f)) Edited = true;
                        }
                        const auto Channels = FluidDynamics::EnumerateFluidDebugChannels();
                        if (FluidSelect("RenderChannel", "Render channel", &P.RenderChannel, Channels.data(), static_cast<int>(Channels.size()), 10000.0f)) Edited = true;
                        if (P.RenderChannel == 7)
                        {
                            static const std::array<const char*, 3> Axes = { "X", "Y", "Z" };
                            if (FluidSegmentedPropertyRow(Faces, "##FrSlAx", "Slice axis", P.SliceAxis, Axes.data(), static_cast<int>(Axes.size()))) Edited = true;
                            Edited |= FluidSliderRow(Palette, Faces, "##FrSlPos", "Slice plane", P.SlicePosition, 0.02f, 0.98f, "%.2f");
                        }
                    }
                }

                CloseFluidSection(SectionCards, SectionCardTop, CurrentGroupOpen);
                if (Edited)
                {
                    ActiveDoc.Dirty = true;
                    SyncDocumentToRecord(ActiveDoc, Token, Config, false);
                }
            ColDraw->ChannelsSetCurrent(0);
            for (const auto& [Top, Bottom] : SectionCards)
            {
                if (Bottom <= Top) continue;
                const ImVec2 CardMin(ColMin.x + 18.0f, Top);
                const ImVec2 CardMax(ColMin.x + InspectorWidth - 18.0f, Bottom);
                ColDraw->AddRectFilled(CardMin, CardMax, IM_COL32(35, 35, 30, 255), 20.0f);
                ColDraw->AddRect(CardMin, CardMax, IM_COL32(232, 199, 139, 12), 20.0f);
            }
            ColDraw->ChannelsSetCurrent(1);
            ColDraw->ChannelsMerge();
            }
            ImGui::EndChild();
            ImGui::PopStyleVar(2);
        }

        //----------------------------------------------------------------------------------------------------------------
        // 4. STATUS BAR
        //----------------------------------------------------------------------------------------------------------------
        if (Session.ShowStatusBar)
        {
            if (ImGui::BeginChild("##FluidStatusBar", ImVec2(TotalWidth, StatusHeight), ImGuiChildFlags_None,
                                  ImGuiWindowFlags_NoScrollbar))
            {
                ImDrawList*  StDraw = ImGui::GetWindowDrawList();
                const ImVec2 StMin  = ImGui::GetWindowPos();
                const ImVec2 StMax  = ImVec2(StMin.x + TotalWidth, StMin.y + StatusHeight);
                StDraw->AddRectFilled(StMin, StMax, Palette.StatusBarBg);
                StDraw->AddLine(StMin, ImVec2(StMax.x, StMin.y), Palette.EdgeBorder);

                StDraw->AddText(Faces.Regular, 11.0f, ImVec2(StMin.x + 12.0f, StMin.y + 6.0f),
                                Palette.TextPrimary, Session.StatusNotice.c_str());

                char      RightTelemetry[196]{};
                const int VoxelsK = (P.GridResolution * P.GridResolution * P.GridResolution) / 1000;
                std::snprintf(RightTelemetry, sizeof(RightTelemetry),
                              "Voxels: %dK  |  Step #%llu (%.1fs)  |  Undo: %zu  |  %s",
                              VoxelsK,
                              static_cast<unsigned long long>(Session.LastImage.StepCount),
                              Session.LastImage.ElapsedSeconds,
                              ActiveDoc.UndoStack.size(),
                              Session.LastImage.Adapter.empty() ? "Vulkan Compute" : Session.LastImage.Adapter.c_str());
                const ImVec2 TextSize = ImGui::CalcTextSize(RightTelemetry);
                StDraw->AddText(Faces.Regular, 11.0f,
                                ImVec2(std::max(StMin.x + 320.0f, StMax.x - TextSize.x - 14.0f), StMin.y + 6.0f),
                                Palette.TextMuted, RightTelemetry);
            }
            ImGui::EndChild();
        }
    }
    ImGui::EndChild();
    ImGui::PopStyleVar(2);
    ImGui::PopStyleColor(5);

    //--------------------------------------------------------------------------------------------------------------------
    // 5. MODAL DIALOGS: FLIPBOOK SPRITE SHEET BAKER & .FLUIDSPACE / .GASSCENE.TOML FILE IMPORT
    //--------------------------------------------------------------------------------------------------------------------
    if (Session.Flipbook.DialogOpen)
    {
        ImGui::OpenPopup("Bake Flipbook Sprite Sheet");
    }
    if (ImGui::BeginPopupModal("Bake Flipbook Sprite Sheet", &Session.Flipbook.DialogOpen, ImGuiWindowFlags_AlwaysAutoResize))
    {
        ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(8.0f, 6.0f));
        ImGui::TextUnformatted("Export premultiplied-alpha RGBA sprite sheet from 3D volumetric solver:");
        (void)SliderIntRow(Palette, Faces, "##FlipColumns", "Columns", Session.Flipbook.Columns, 2, 8);
        (void)SliderIntRow(Palette, Faces, "##FlipRows", "Rows", Session.Flipbook.Rows, 2, 8);
        (void)SliderIntRow(Palette, Faces, "##FlipWidth", "Tile Width (px)", Session.Flipbook.FrameWidth, 64, 512);
        (void)SliderIntRow(Palette, Faces, "##FlipHeight", "Tile Height (px)", Session.Flipbook.FrameHeight, 64, 512);
        (void)FluidSliderRow(Palette, Faces, "##FlipDuration", "Total Duration", Session.Flipbook.DurationSec, 0.4f, 6.0f, "%.2f s");
        FluidSwitch("Clear & Detonate Blast on Frame 0", &Session.Flipbook.DetonateStart);
        ImGui::InputText("Output PNG", Session.Flipbook.OutputPath, sizeof(Session.Flipbook.OutputPath));

        if (Session.Flipbook.Recording)
        {
            const int Total = Session.Flipbook.Columns * Session.Flipbook.Rows;
            ImGui::ProgressBar(static_cast<float>(Session.Flipbook.Captured) / static_cast<float>(std::max(1, Total)),
                               ImVec2(320.0f, 20.0f));
        }
        else if (ImGui::Button("Start Flipbook Bake", ImVec2(170.0f, 28.0f)))
        {
            const size_t SheetPixels = static_cast<size_t>(Session.Flipbook.Columns * Session.Flipbook.FrameWidth) *
                                       static_cast<size_t>(Session.Flipbook.Rows * Session.Flipbook.FrameHeight) * 4u;
            Session.Flipbook.SheetRgba.assign(SheetPixels, 0u);
            Session.Flipbook.Captured  = 0;
            Session.Flipbook.Recording = true;
        }
        ImGui::SameLine();
        if (ImGui::Button("Close", ImVec2(90.0f, 28.0f)))
        {
            Session.Flipbook.DialogOpen = false;
            ImGui::CloseCurrentPopup();
        }
        if (!Session.Flipbook.LastMessage.empty())
        {
            ImGui::TextWrapped("%s", Session.Flipbook.LastMessage.c_str());
        }
        ImGui::PopStyleVar();
        ImGui::EndPopup();
    }

    if (Session.ShowImportModal)
    {
        ImGui::OpenPopup("Import Fluid Scene");
    }
    if (ImGui::BeginPopupModal("Import Fluid Scene", &Session.ShowImportModal, ImGuiWindowFlags_AlwaysAutoResize))
    {
        ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(8.0f, 6.0f));
        ImGui::TextUnformatted("Path to .fluidspace or .gasscene.toml:");
        ImGui::SetNextItemWidth(380.0f);
        ImGui::InputText("##ImportFluidPath", Session.ImportPathField, sizeof(Session.ImportPathField));
        if (ImGui::Button("Load File", ImVec2(120.0f, 26.0f)))
        {
            FluidDynamics::FluidSceneDocument Loaded{};
            std::string                       ErrorMsg;
            if (FluidDynamics::LoadFluidSpaceFile(Session.ImportPathField, Loaded, &ErrorMsg))
            {
                FluidDocumentTab& ActiveDoc = Session.Tabs[Session.ActiveTab];
                PushUndoSnapshot(ActiveDoc);
                ActiveDoc.Scene          = std::move(Loaded);
                ActiveDoc.RestartPending = true;
                Session.StatusNotice     = std::string("Imported ") + Session.ImportPathField;
                Session.ShowImportModal  = false;
                ImGui::CloseCurrentPopup();
            }
            else
            {
                Session.StatusNotice = "Import failed: " + ErrorMsg;
            }
        }
        ImGui::SameLine();
        if (ImGui::Button("Cancel", ImVec2(90.0f, 26.0f)))
        {
            Session.ShowImportModal = false;
            ImGui::CloseCurrentPopup();
        }
        ImGui::PopStyleVar();
        ImGui::EndPopup();
    }

    if (ClosingModal)
    {
        FluidDocumentTab& FinalDoc = Session.Tabs[std::clamp(Session.ActiveTab, 0, static_cast<int>(Session.Tabs.size()) - 1)];
        SyncDocumentToRecord(FinalDoc, Token, Config, true);
        ImGui::CloseCurrentPopup();
        Runtime.CloseActiveEditor();
    }
    ImGui::EndPopup();
    ControlKit::ConfigurePalette(PreviousControlPalette);
}

#elif FRONTIER_EDITOR

void FluidPlumeEditor::ConstructInterface(RecordToken, FluidPlumeInspector&) {}

#endif

} // namespace Frontier
