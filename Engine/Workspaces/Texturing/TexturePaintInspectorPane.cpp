/*==========================================================================================================================================
                                                    TEXTUREPAINTINSPECTORPANE.CPP
==========================================================================================================================================*/
// 🎛️ Implementation of TexturePaintInspectorPane: study metrics, active brush summary, layer inspector, 22 PBR channel editor & masks.

#include "Engine/Workspaces/Texturing/TexturePaintInspectorPane.h"

#include "Engine/Components/Controls/ControlAppearance.h"
#include "Engine/Workspaces/Texturing/TexturingPaneAppearance.h"

#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <vector>

namespace Frontier::Workspaces
{

using namespace TexturingAppearance;

namespace
{

void AssignEditText(TextEditBuffer& Buf, std::string_view TextContent) noexcept
{
    const std::size_t CopyLen = std::min(TextContent.size(), static_cast<std::size_t>(TextEditBuffer::Capacity - 1u));
    for (std::size_t I = 0u; I < CopyLen; ++I)
    {
        Buf.Text[I] = TextContent[I];
    }
    Buf.Text[CopyLen]   = '\0';
    Buf.Length          = static_cast<uint32_t>(CopyLen);
    Buf.Caret           = Buf.Length;
    Buf.SelectionAnchor = Buf.Length;
}

[[nodiscard]] const char* QueryMaskGenLabel(PaintMaskGenerator Gen) noexcept
{
    switch (Gen)
    {
        case PaintMaskGenerator::EdgeWear:        return "Edge Wear";
        case PaintMaskGenerator::CreviceDirt:     return "Crevice Dirt";
        case PaintMaskGenerator::TopDust:         return "Top Dust";
        case PaintMaskGenerator::TriplanarGrunge: return "Triplanar Grunge";
        case PaintMaskGenerator::None:
        default:                                  return "None (Manual Paint)";
    }
}

[[nodiscard]] const char* QueryToolTitle(PaintToolCategory Tool) noexcept
{
    switch (Tool)
    {
        case PaintToolCategory::Brush:      return "Paint";
        case PaintToolCategory::Eraser:     return "Eraser";
        case PaintToolCategory::Curve3D:    return "3D Curve";
        case PaintToolCategory::Fill:       return "Fill";
        case PaintToolCategory::Gradient3D: return "3D Gradient";
        case PaintToolCategory::Stamp:      return "Stamp";
        case PaintToolCategory::Text:       return "Text";
        case PaintToolCategory::Sample:     return "Sample";
        case PaintToolCategory::Move:       return "Move";
        default:                            return "Paint";
    }
}

} // namespace

TexturePaintInspectorPane::~TexturePaintInspectorPane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void TexturePaintInspectorPane::AttachSession(TexturePaintSession* TargetSession) noexcept
{
    Session                = TargetSession;
    ScrollOffsetY          = 0.0f;
    ActiveSliderId         = -1;
    SyncedLayerId          = 0u;
    BlendDropdownOpen      = false;
    PartDropdownOpen       = false;
    AddChannelDropdownOpen = false;
    MaskGenDropdownOpen    = false;
}

void TexturePaintInspectorPane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##TexturePaintInspectorCanvas",
        ImVec2(std::max(1.0f, ImGui::GetContentRegionAvail().x), std::max(1.0f, ImGui::GetContentRegionAvail().y)),
        ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight);

    const Rectangle2D ScreenBounds { WinPos.x, TopY, WinSize.x, PaneH };
    const Rectangle2D LogicalBounds{ 0.0f, 0.0f, WinSize.x / SafeScale, PaneH / SafeScale };

    PixelSpace       Surface(ImGui::GetWindowDrawList(), { ScreenBounds.X, ScreenBounds.Y }, SafeScale);
    PaneInputReading Input = WorkspaceAppearance::CaptureImGuiPaneInput(ScreenBounds, SafeScale);
    WorkspaceAppearance::EnforcePanePointerOwnership(this, Input);

    Render(Surface, LogicalBounds, Input, DeltaSeconds);
    WorkspaceAppearance::UpdatePanePointerOwnership(this, ScreenBounds, SafeScale, Input, ActiveSliderId >= 0);
}

void TexturePaintInspectorPane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    if (Session == nullptr || Bounds.Width < 180.0f || Bounds.Height < 180.0f)
    {
        return;
    }

    const TexturingThemeColors Theme   = QueryTexturingThemeColors();
    const Point2D              Cursor  { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed = Input.PrimaryPointer.Pressed;
    const bool                 AnyDropOpen = BlendDropdownOpen || PartDropdownOpen || AddChannelDropdownOpen || MaskGenDropdownOpen;

    if (!Input.PrimaryPointer.Down)
    {
        ActiveSliderId = -1;
    }

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, Theme.PaneBackground, 0.0f);

    // Header & Footer
    constexpr float PadX       = 14.0f;
    constexpr float HeaderTopY = 12.0f;
    const float     InnerW     = std::max(80.0f, Bounds.Width - PadX * 2.0f);
    const float     HeaderH    = ConstructPaneHeadingBar(Surface, Bounds.X + PadX, Bounds.Y + HeaderTopY, InnerW, "Layer Inspector", "19-CH GPU PBR", Theme);

    constexpr float   FooterH = 26.0f;
    const Rectangle2D FooterBounds{ Bounds.X, Bounds.Bottom() - FooterH, Bounds.Width, FooterH };
    ConstructPaneStatusFooter(Surface, FooterBounds, "3D + 2D UV Synchronized", "GPU PBR Stack", Theme);

    // Scrollable region
    const float       ScrollTop = Bounds.Y + HeaderTopY + HeaderH;
    const Rectangle2D ScrollViewport{
        Bounds.X,
        ScrollTop,
        Bounds.Width,
        std::max(1.0f, FooterBounds.Y - ScrollTop),
    };

    if (ScrollViewport.Contains(Cursor) && !AnyDropOpen && std::abs(Input.WheelDeltaY) > 0.01f)
    {
        ScrollOffsetY = std::clamp(ScrollOffsetY - Input.WheelDeltaY * 32.0f, 0.0f, MaxScrollY);
    }

    Surface.PushClip(ScrollViewport);
    const float LeftX = ScrollViewport.X + PadX;
    float       CurY  = ScrollViewport.Y + 8.0f - ScrollOffsetY;

    // 1. Object Heading + 3-KPI Trio
    const PaintStudyDescriptor& StudyDesc = Session->QueryActiveStudyDescriptor();
    char SubMeta[96];
    std::snprintf(SubMeta, sizeof(SubMeta), "%upx · %u PARTS · %u UV ISLANDS", Session->ResolutionPx, StudyDesc.PartCount, StudyDesc.UvIslands);
    CurY += ConstructSubjectHeadingBlock(Surface, LeftX, CurY, InnerW, ControlIcon::BrushTool, Session->DocumentName, SubMeta, Theme) + 10.0f;

    PaintLayerEntry* Layer = Session->AccessSelectedLayer();
    const std::size_t ActiveChCount = (Layer != nullptr) ? Layer->CountActiveChannels() : 4u;

    char ResText[16];
    char PartsText[16];
    char ChRatioText[16];
    std::snprintf(ResText, sizeof(ResText), "%upx", Session->ResolutionPx);
    std::snprintf(PartsText, sizeof(PartsText), "%u", StudyDesc.PartCount);
    std::snprintf(ChRatioText, sizeof(ChRatioText), "%zu/19", ActiveChCount);

    const std::array<MetricTileReading, 3u> Kpis {{
        { "GPU Canvas",   ResText,     "Active",         true  },
        { "Parts",        PartsText,   StudyDesc.Label,  false },
        { "PBR Channels", ChRatioText, "Active",         false },
    }};
    CurY += ConstructMetricTrioTiles(Surface, LeftX, CurY, InnerW, Kpis, Theme) + 12.0f;

    // 2. Active Brush Summary Box + "Brush / Tool" button
    {
        const Rectangle2D BrushBox{ LeftX, CurY, InnerW, 56.0f };
        BeginSectionContainer(Surface, BrushBox, Theme, 16.0f);

        const Point2D SwatchPt{ BrushBox.X + 20.0f, BrushBox.Y + 28.0f };
        Surface.FillCircle(SwatchPt, 11.0f, Session->Brush.InkColor);
        Surface.StrokeCircle(SwatchPt, 11.0f, Theme.BorderStrong, 1.0f);

        char BrushTitle[64];
        std::snprintf(BrushTitle, sizeof(BrushTitle), "%s · %.2fm", QueryToolTitle(Session->ActiveTool), Session->Brush.SizeMeters);

        std::string ChTag{};
        const auto& Registry = TexturePaintSession::QueryChannelRegistry();
        for (std::size_t I = 0u; I < TexturePaintSession::ChannelCount; ++I)
        {
            if (Session->Brush.PaintChannels[I])
            {
                if (!ChTag.empty()) ChTag += " · ";
                ChTag += Registry[I].ShortTag;
                if (ChTag.size() > 20u) break;
            }
        }
        if (ChTag.empty()) ChTag = "No channels";

        const Rectangle2D LaunchRect{ BrushBox.Right() - 114.0f, BrushBox.Y + 14.0f, 102.0f, 28.0f };
        const float       SummaryW = std::max(40.0f, LaunchRect.X - (BrushBox.X + 38.0f) - 8.0f);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::SemiBold, { BrushBox.X + 38.0f, BrushBox.Y + 13.0f }, SummaryW, 11.0f, Theme.TextPrimary, BrushTitle);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { BrushBox.X + 38.0f, BrushBox.Y + 30.0f }, SummaryW, 8.8f, Theme.TextMuted, ChTag);

        if (ConstructCapsuleButtonControl(
                Surface,
                LaunchRect,
                "Brush / Tool",
                Theme,
                Cursor,
                !AnyDropOpen && Pressed,
                false,
                false,
                ControlIcon::SlidersQuality,
                9.2f,
                14.0f,
                OptionalTooltip::FromTitled("Open Brush Inspector (Q)", "Configure brush tips, colour dynamics, response curves & tool settings.")))
        {
            if (OpenBrushInspectorFn)
            {
                OpenBrushInspectorFn();
            }
        }
        CurY += BrushBox.Height + 12.0f;
    }

    auto RenderFloatSlider = [&](int32_t Key, const char* Label, float MinV, float MaxV, const char* Unit, const char* Fmt, float& Scalar)
    {
        float Norm = std::clamp((Scalar - MinV) / std::max(0.0001f, MaxV - MinV), 0.0f, 1.0f);
        bool  Drag = (ActiveSliderId == Key);
        char  NumBuf[32];
        std::snprintf(NumBuf, sizeof(NumBuf), Fmt, Scalar);
        if (ConstructSliderReadoutRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, Label, NumBuf, Unit, Norm, Theme, AnyDropOpen ? ControlPointer{} : Input.PrimaryPointer, Drag))
        {
            Scalar = std::clamp(MinV + Norm * (MaxV - MinV), MinV, MaxV);
        }
        if (Drag) ActiveSliderId = Key;
        CurY += 52.0f;
    };

    const auto& ChRegistry = TexturePaintSession::QueryChannelRegistry();

    // 3. Layer Inspector Section
    if (Layer != nullptr)
    {
        if (SyncedLayerId != Layer->Id)
        {
            SyncedLayerId = Layer->Id;
            AssignEditText(LayerNameBuffer, Layer->Name);
            LayerNameBuffer.Active = false;
        }

        // Precompute active chips & height cleanly
        std::vector<RemovableChipEntry> ActiveChips{};
        std::vector<PaintSurfaceChannel> ActiveKeys{};
        std::vector<PaintSurfaceChannel> AvailableKeys{};
        for (std::size_t I = 0u; I < TexturePaintSession::ChannelCount; ++I)
        {
            if (Layer->ActiveChannels[I])
            {
                const ColorRgba Tint = ChRegistry[I].ColorChannel ? Layer->PrimerTint : ColorRgba{ 158u, 162u, 170u, 255u };
                ActiveChips.push_back(RemovableChipEntry{ ChRegistry[I].Label, Tint, Layer->InspectedChannel == ChRegistry[I].Key });
                ActiveKeys.push_back(ChRegistry[I].Key);
            }
            else
            {
                AvailableKeys.push_back(ChRegistry[I].Key);
            }
        }

        const float ExtraChannelH = (Layer->Category != PaintLayerCategory::Folder) ? 144.0f : 0.0f;
        const float SecBodyH      = LayerSectionOpen ? (38.0f + 54.0f + 72.0f + 54.0f + 52.0f + 54.0f + ExtraChannelH + 14.0f) : 38.0f;
        const Rectangle2D SecRect{ LeftX, CurY, InnerW, SecBodyH };
        BeginSectionContainer(Surface, SecRect, Theme, 18.0f);

        if (ConstructSectionHeaderRow(
                Surface,
                { LeftX + 12.0f, CurY + 10.0f, InnerW - 24.0f, 22.0f },
                ControlIcon::LayersSlabs,
                "Layer Inspector",
                LayerSectionOpen ? "-" : "+",
                LayerSectionOpen,
                Theme,
                Cursor,
                !AnyDropOpen && Pressed))
        {
            LayerSectionOpen = !LayerSectionOpen;
        }
        CurY += 38.0f;

        if (LayerSectionOpen)
        {
            WorkspaceAppearance::ForwardInputToTextBuffer(LayerNameBuffer, Input, DeltaSeconds);
            ConstructTextEditRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Layer Name", LayerNameBuffer, Input, Theme);
            if (LayerNameBuffer.Length > 0u)
            {
                Layer->Name = std::string(LayerNameBuffer.Text);
            }
            CurY += 54.0f;

            ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Layer Visible", Layer->Visible, Theme, AnyDropOpen ? ControlPointer{} : Input.PrimaryPointer);
            CurY += 34.0f;
            ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Lock Layer", Layer->Locked, Theme, AnyDropOpen ? ControlPointer{} : Input.PrimaryPointer);
            CurY += 38.0f;

            const auto& BlendLabels = TexturePaintSession::QueryBlendMethodLabels();
            const char* CurBlend = BlendLabels[std::min<std::size_t>(static_cast<std::size_t>(Layer->BlendMethod), BlendLabels.size() - 1u)];
            if (ConstructDropdownBarRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Blend Mode", CurBlend, BlendDropdownOpen, Theme, AnyDropOpen && !BlendDropdownOpen ? ControlPointer{} : Input.PrimaryPointer, BlendAnchor))
            {
                BlendDropdownOpen      = !BlendDropdownOpen;
                PartDropdownOpen       = false;
                AddChannelDropdownOpen = false;
                MaskGenDropdownOpen    = false;
            }
            CurY += 54.0f;

            RenderFloatSlider(401, "Layer Opacity", 0.0f, 1.0f, "", "%.2f", Layer->Opacity);

            char PartBuf[32];
            if (Layer->PartFilter < 0) std::snprintf(PartBuf, sizeof(PartBuf), "All Mesh Parts");
            else std::snprintf(PartBuf, sizeof(PartBuf), "Part %d", Layer->PartFilter);
            if (ConstructDropdownBarRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Mesh Part Target", PartBuf, PartDropdownOpen, Theme, AnyDropOpen && !PartDropdownOpen ? ControlPointer{} : Input.PrimaryPointer, PartAnchor))
            {
                PartDropdownOpen       = !PartDropdownOpen;
                BlendDropdownOpen      = false;
                AddChannelDropdownOpen = false;
                MaskGenDropdownOpen    = false;
            }
            CurY += 54.0f;

            if (Layer->Category != PaintLayerCategory::Folder)
            {
                WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { LeftX + 12.0f, CurY }, 10.2f, Theme.TextMuted, "Active PBR Channels");
                CurY += 16.0f;

                char AddChBuf[32];
                std::snprintf(AddChBuf, sizeof(AddChBuf), "+ Channel (%zu)", AvailableKeys.size());
                const RemovableChipOutcome ChipsOut = ConstructRemovableChannelChips(
                    Surface,
                    LeftX + 12.0f,
                    CurY,
                    InnerW - 24.0f,
                    ActiveChips,
                    AvailableKeys.empty() ? std::string_view{} : std::string_view(AddChBuf),
                    AddChannelDropdownOpen,
                    Theme,
                    Cursor,
                    (!AnyDropOpen || AddChannelDropdownOpen) && Pressed);
                AddChannelAnchor = ChipsOut.AddTriggerBounds;
                if (ChipsOut.RemovedIndex >= 0 && static_cast<std::size_t>(ChipsOut.RemovedIndex) < ActiveKeys.size())
                {
                    Session->RemoveChannelFromSelectedLayer(ActiveKeys[static_cast<std::size_t>(ChipsOut.RemovedIndex)]);
                }
                else if (ChipsOut.SelectedIndex >= 0 && static_cast<std::size_t>(ChipsOut.SelectedIndex) < ActiveKeys.size())
                {
                    Layer->InspectedChannel = ActiveKeys[static_cast<std::size_t>(ChipsOut.SelectedIndex)];
                }
                else if (ChipsOut.AddTriggerClicked && !AvailableKeys.empty())
                {
                    AddChannelDropdownOpen = !AddChannelDropdownOpen;
                    BlendDropdownOpen      = false;
                    PartDropdownOpen       = false;
                    MaskGenDropdownOpen    = false;
                }
                CurY += ChipsOut.ConsumedHeight + 10.0f;

                const PaintChannelDescriptor& InspDesc = TexturePaintSession::QueryChannelDescriptor(Layer->InspectedChannel);
                if (InspDesc.ColorChannel)
                {
                    char HexBuf[16];
                    FormatHexLower(Layer->PrimerTint, HexBuf, sizeof(HexBuf));
                    Rectangle2D UnusedRow{};
                    ConstructColourSwatchRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, InspDesc.Label, HexBuf, Layer->PrimerTint, Theme, Input.PrimaryPointer, UnusedRow);
                    CurY += 42.0f;
                }
                else
                {
                    const std::size_t ChIdx = static_cast<std::size_t>(Layer->InspectedChannel);
                    RenderFloatSlider(402, InspDesc.Label, InspDesc.DefaultMin, InspDesc.DefaultMax, "", "%.2f", Layer->ChannelScalars[ChIdx]);
                }
            }
            CurY += 12.0f;
        }
        CurY += 12.0f;

        // 4. Category-Specific Controls (Layer Stamps / Wear Gen / Fill)
        if (Layer->Category == PaintLayerCategory::Stamp || Layer->Category == PaintLayerCategory::Text || !Layer->Stamps.empty())
        {
            const float SecH = CategorySectionOpen ? 108.0f : 38.0f;
            BeginSectionContainer(Surface, { LeftX, CurY, InnerW, SecH }, Theme, 18.0f);
            if (ConstructSectionHeaderRow(
                    Surface,
                    { LeftX + 12.0f, CurY + 10.0f, InnerW - 24.0f, 22.0f },
                    Layer->Category == PaintLayerCategory::Text ? ControlIcon::TextType : ControlIcon::StampTool,
                    Layer->Category == PaintLayerCategory::Text ? "Text Placement & Stamps" : "Layer Stamps",
                    CategorySectionOpen ? "-" : "+",
                    CategorySectionOpen,
                    Theme,
                    Cursor,
                    !AnyDropOpen && Pressed))
            {
                CategorySectionOpen = !CategorySectionOpen;
            }
            CurY += 38.0f;
            if (CategorySectionOpen)
            {
                const float HalfBtn = (InnerW - 24.0f - 8.0f) * 0.5f;
                if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f, CurY, HalfBtn, 28.0f }, "Move / Resize (V)", Theme, Cursor, !AnyDropOpen && Pressed, false, true, ControlIcon::MoveArrows, 9.2f, 14.0f))
                {
                    Session->SelectTool(PaintToolCategory::Move);
                }
                if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f + HalfBtn + 8.0f, CurY, HalfBtn, 28.0f }, "+ Add Stamp", Theme, Cursor, !AnyDropOpen && Pressed, false, false, ControlIcon::PlusAdd, 9.2f, 14.0f))
                {
                    Session->AddStampToSelectedLayer(Layer->Category == PaintLayerCategory::Text);
                }
                CurY += 70.0f;
            }
            CurY += 12.0f;
        }

        // 5. Layer Mask Section
        {
            const char* MaskTag = Layer->Mask.Attached ? (Layer->Mask.Enabled ? "ON" : "OFF") : "NONE";
            const float BodyH   = MaskSectionOpen
                ? (Layer->Mask.Attached ? (38.0f + 34.0f * 3.0f + 52.0f * 2.0f + 54.0f + 42.0f) : 86.0f)
                : 38.0f;
            BeginSectionContainer(Surface, { LeftX, CurY, InnerW, BodyH }, Theme, 18.0f);
            if (ConstructSectionHeaderRow(
                    Surface,
                    { LeftX + 12.0f, CurY + 10.0f, InnerW - 24.0f, 22.0f },
                    ControlIcon::MaskCutout,
                    "Layer Mask",
                    MaskTag,
                    MaskSectionOpen,
                    Theme,
                    Cursor,
                    !AnyDropOpen && Pressed))
            {
                MaskSectionOpen = !MaskSectionOpen;
            }
            CurY += 38.0f;

            if (MaskSectionOpen)
            {
                if (!Layer->Mask.Attached)
                {
                    const float HalfW = (InnerW - 24.0f - 8.0f) * 0.5f;
                    if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f, CurY, HalfW, 28.0f }, "Add White Mask", Theme, Cursor, !AnyDropOpen && Pressed, false, true, ControlIcon::Count, 9.5f, 14.0f))
                    {
                        Session->PushUndoSnapshot();
                        Layer->Mask.Attached       = true;
                        Layer->Mask.Enabled        = true;
                        Layer->Mask.EditingMask    = true;
                        Layer->Mask.FillBrightness = 255u;
                    }
                    if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f + HalfW + 8.0f, CurY, HalfW, 28.0f }, "Add Black Mask", Theme, Cursor, !AnyDropOpen && Pressed, false, false, ControlIcon::Count, 9.5f, 14.0f))
                    {
                        Session->PushUndoSnapshot();
                        Layer->Mask.Attached       = true;
                        Layer->Mask.Enabled        = true;
                        Layer->Mask.EditingMask    = true;
                        Layer->Mask.FillBrightness = 0u;
                    }
                    CurY += 48.0f;
                }
                else
                {
                    ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Paint on Mask", Layer->Mask.EditingMask, Theme, Input.PrimaryPointer);
                    CurY += 34.0f;
                    ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Mask Enabled", Layer->Mask.Enabled, Theme, Input.PrimaryPointer);
                    CurY += 34.0f;
                    ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Invert Mask", Layer->Mask.Invert, Theme, Input.PrimaryPointer);
                    CurY += 34.0f;

                    RenderFloatSlider(420, "Mask Opacity", 0.0f, 1.0f, "", "%.2f", Layer->Mask.Opacity);

                    if (ConstructDropdownBarRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Procedural Generator", QueryMaskGenLabel(Layer->Mask.Generator), MaskGenDropdownOpen, Theme, Input.PrimaryPointer, MaskGenAnchor))
                    {
                        MaskGenDropdownOpen    = !MaskGenDropdownOpen;
                        BlendDropdownOpen      = false;
                        PartDropdownOpen       = false;
                        AddChannelDropdownOpen = false;
                    }
                    CurY += 54.0f;

                    float FeatherFloat = static_cast<float>(Layer->Mask.FeatherRadiusPx);
                    RenderFloatSlider(421, "Feather Radius (px)", 0.0f, 16.0f, "px", "%.0f", FeatherFloat);
                    Layer->Mask.FeatherRadiusPx = std::clamp(static_cast<int32_t>(std::round(FeatherFloat)), 0, 16);

                    const float AvailW = InnerW - 24.0f - 12.0f;
                    const float FillW  = std::floor(AvailW * 0.29f);
                    const float RemW   = AvailW - FillW * 2.0f;
                    if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f, CurY, FillW, 26.0f }, "Fill White", Theme, Cursor, !AnyDropOpen && Pressed, false, false, ControlIcon::Count, 9.0f, 13.0f))
                    {
                        Layer->Mask.FillBrightness = 255u;
                    }
                    if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f + FillW + 6.0f, CurY, FillW, 26.0f }, "Fill Black", Theme, Cursor, !AnyDropOpen && Pressed, false, false, ControlIcon::Count, 9.0f, 13.0f))
                    {
                        Layer->Mask.FillBrightness = 0u;
                    }
                    if (ConstructCapsuleButtonControl(Surface, { LeftX + 12.0f + (FillW + 6.0f) * 2.0f, CurY, RemW, 26.0f }, "Remove Mask", Theme, Cursor, !AnyDropOpen && Pressed, false, false, ControlIcon::TrashDelete, 8.8f, 13.0f))
                    {
                        Layer->Mask.Attached    = false;
                        Layer->Mask.EditingMask = false;
                    }
                    CurY += 42.0f;
                }
            }
            CurY += 12.0f;
        }
    }

    // 6. Viewport Options Section
    {
        const float BodyH = ViewportSectionOpen ? 76.0f : 38.0f;
        BeginSectionContainer(Surface, { LeftX, CurY, InnerW, BodyH }, Theme, 18.0f);
        if (ConstructSectionHeaderRow(
                Surface,
                { LeftX + 12.0f, CurY + 10.0f, InnerW - 24.0f, 22.0f },
                ControlIcon::CubeShape,
                "Viewport Options",
                ViewportSectionOpen ? "-" : "+",
                ViewportSectionOpen,
                Theme,
                Cursor,
                !AnyDropOpen && Pressed))
        {
            ViewportSectionOpen = !ViewportSectionOpen;
        }
        CurY += 38.0f;
        if (ViewportSectionOpen)
        {
            ConstructSwitchControlRow(Surface, LeftX + 12.0f, CurY, InnerW - 24.0f, "Mesh Wireframe Overlay", Session->WireframeOverlay, Theme, Input.PrimaryPointer);
            CurY += 38.0f;
        }
        CurY += 12.0f;
    }

    const float ContentBottom = CurY + ScrollOffsetY + 12.0f;
    MaxScrollY                = std::max(0.0f, ContentBottom - ScrollViewport.Bottom());
    ScrollOffsetY             = std::clamp(ScrollOffsetY, 0.0f, MaxScrollY);

    Surface.PopClip();

    // Top-level inspector dropdowns (rendered after scroll clip so never truncated)
    if (Layer != nullptr && BlendDropdownOpen)
    {
        const auto& BlendLabels = TexturePaintSession::QueryBlendMethodLabels();
        RenderFittedDropdownSheet(
            Surface,
            BlendAnchor,
            Bounds,
            BlendLabels.data(),
            static_cast<uint32_t>(BlendLabels.size()),
            static_cast<uint32_t>(Layer->BlendMethod),
            BlendDropdownOpen,
            Input,
            [Layer](uint32_t Picked)
            {
                if (Picked < static_cast<uint32_t>(PaintBlendMethod::Count))
                {
                    Layer->BlendMethod = static_cast<PaintBlendMethod>(Picked);
                }
            },
            &DropdownScrollY);
    }

    if (Layer != nullptr && PartDropdownOpen)
    {
        static constexpr const char* PartOpts[5] { "All Mesh Parts", "Part 0", "Part 1", "Part 2", "Part 3" };
        const uint32_t CurPartIdx = (Layer->PartFilter < 0) ? 0u : static_cast<uint32_t>(std::clamp(Layer->PartFilter + 1, 0, 4));
        RenderFittedDropdownSheet(
            Surface,
            PartAnchor,
            Bounds,
            PartOpts,
            5u,
            CurPartIdx,
            PartDropdownOpen,
            Input,
            [Layer](uint32_t Picked) { Layer->PartFilter = (Picked == 0u) ? -1 : static_cast<int32_t>(Picked - 1u); },
            &DropdownScrollY);
    }

    if (Layer != nullptr && AddChannelDropdownOpen)
    {
        std::vector<const char*>         AvailLabels{};
        std::vector<PaintSurfaceChannel> AvailKeys{};
        for (std::size_t I = 0u; I < TexturePaintSession::ChannelCount; ++I)
        {
            if (!Layer->ActiveChannels[I])
            {
                AvailLabels.push_back(ChRegistry[I].Label);
                AvailKeys.push_back(ChRegistry[I].Key);
            }
        }
        if (!AvailLabels.empty())
        {
            RenderFittedDropdownSheet(
                Surface,
                AddChannelAnchor,
                Bounds,
                AvailLabels.data(),
                static_cast<uint32_t>(AvailLabels.size()),
                99u,
                AddChannelDropdownOpen,
                Input,
                [this, &AvailKeys](uint32_t Picked)
                {
                    if (Picked < AvailKeys.size())
                    {
                        Session->AddChannelToSelectedLayer(AvailKeys[Picked]);
                    }
                },
                &DropdownScrollY);
        }
    }

    if (Layer != nullptr && MaskGenDropdownOpen)
    {
        static constexpr const char* GenOpts[5] {
            "None (Manual Paint)",
            "Edge Wear",
            "Crevice Dirt",
            "Top Dust",
            "Triplanar Grunge",
        };
        RenderFittedDropdownSheet(
            Surface,
            MaskGenAnchor,
            Bounds,
            GenOpts,
            5u,
            static_cast<uint32_t>(Layer->Mask.Generator),
            MaskGenDropdownOpen,
            Input,
            [Layer](uint32_t Picked)
            {
                if (Picked < 5u) Layer->Mask.Generator = static_cast<PaintMaskGenerator>(Picked);
            },
            &DropdownScrollY);
    }

    Surface.PopClip();
}

} // namespace Frontier::Workspaces
