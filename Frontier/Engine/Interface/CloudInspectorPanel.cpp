/*==========================================================================================================================================
                                            CLOUDS INSPECTOR PANEL
==========================================================================================================================================*/
// Source-mapped native implementation of VehicleHMI/CloudInspectorDashboard.js and CloudInspector.css.

#include "Engine/Interface/GlobalInspectorPresentationContext.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"
#include "Engine/Scene/RecordInspectorRegistry.h"

#if defined(FRONTIER_WITH_INTERFACE_SDK)
#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace Frontier
{
namespace
{
constexpr ImU32 CloudInk = IM_COL32(236, 238, 232, 255);
constexpr ImU32 CloudMuted = IM_COL32(143, 151, 140, 255);
constexpr ImU32 CloudAccent = IM_COL32(213, 230, 165, 255);
constexpr float CloudPi = 3.14159265358979323846f;

void CloudText(GlobalInspectorPresentationContext& Context, ImVec2 At, float Size, ImU32 Colour,
               const char* Text, ImFont* Font = nullptr)
{
    ImGui::GetWindowDrawList()->AddText(Font ? Font : Context.Faces.Regular, Size, At, Colour, Text);
}

void CloudSection(GlobalInspectorPresentationContext& Context, float& Y, const char* Title, const char* Index)
{
    CloudText(Context, ImVec2(Context.Left + 2.0f, Y), 17.0f, CloudInk, Title, Context.Faces.Light);
    const float W = KitTextWidth(Context.Faces.Medium, 8.0f, Index);
    CloudText(Context, ImVec2(Context.Right - W, Y + 4.0f), 8.0f, CloudMuted, Index, Context.Faces.Medium);
    Y += 28.0f;
}

void CloudNote(GlobalInspectorPresentationContext& Context, const char* Text, float Height = 58.0f)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::Dummy(ImVec2(Width, Height));
    ImGui::GetWindowDrawList()->AddText(Context.Faces.Regular, 9.5f, At, CloudMuted, Text, nullptr, Width - 8.0f);
}

void CloudCard(GlobalInspectorPresentationContext& Context, const char* Id, const char* Title, const char* Index,
               float Height, float Padding = 18.0f, bool AtlasCard = false)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Id);
    ImGui::BeginChild("##cloud_card", ImVec2(Width, Height), false,
                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    ForwardGlobalInspectorCardWheelToParent();
    const ImVec2 Min = ImGui::GetWindowPos();
    const ImVec2 Max(Min.x + ImGui::GetWindowSize().x, Min.y + ImGui::GetWindowSize().y);
    ImGui::GetWindowDrawList()->AddRectFilled(Min, Max,
        Context.Theme.LightSurface ? Context.Theme.Surface : (AtlasCard ? IM_COL32(24, 30, 27, 255) : IM_COL32(35, 39, 34, 255)), 23.0f);
    ImGui::GetWindowDrawList()->AddRect(Min, Max,
        Context.Theme.LightSurface ? Context.Theme.Line : IM_COL32(255, 255, 255, 18), 23.0f);
    const float IndexWidth = KitTextWidth(Context.Faces.Medium, 8.0f, Index);
    CloudText(Context, ImVec2(Min.x + Padding, Min.y + 18.0f), 12.0f, CloudInk, Title, Context.Faces.Regular);
    CloudText(Context, ImVec2(Max.x - Padding - IndexWidth, Min.y + 20.0f), 8.0f, CloudMuted, Index, Context.Faces.Medium);
    ImGui::SetCursorScreenPos(ImVec2(Min.x + Padding, Min.y + 46.0f));
}

void CloudEndCard()
{
    ImGui::EndChild();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 14.0f));
}

bool CloudScalar(GlobalInspectorPresentationContext& Context, const char* Label, double* Value,
                 double Minimum, double Maximum, const char* Format, double Step = 0.01, double Scale = 1.0)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const double OriginalValue = *Value;
    const float Width = ImGui::GetContentRegionAvail().x;
    const std::string FormatText(Format);
    const size_t ConversionEnd = FormatText.find_last_of("fFeEgGaA") + 1;
    const std::string NumericFormat = FormatText.substr(0, ConversionEnd);
    size_t UnitStart = ConversionEnd;
    while (UnitStart < FormatText.size() && FormatText[UnitStart] == ' ') ++UnitStart;
    const std::string Unit = FormatText.substr(UnitStart);
    const float UnitWidth = KitTextWidth(Context.Faces.Regular, 10.0f, Unit.c_str());
    const float CapsuleWidth = std::max(90.0f, UnitWidth + 78.0f);
    const float CapsuleX = At.x + Width - CapsuleWidth;
    CloudText(Context, At, 11.0f, CloudMuted, Label);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(ImVec2(CapsuleX, At.y - 1.0f), ImVec2(At.x + Width, At.y + 23.0f),
                        IM_COL32(8, 8, 8, 255), 12.0f);
    ImGui::SetCursorScreenPos(ImVec2(CapsuleX + 9.0f, At.y + 3.0f));
    ImGui::SetNextItemWidth(CapsuleWidth - UnitWidth - 24.0f);
    double DisplayValue = *Value * Scale;
    const double DisplayStep = Step * Scale, DisplayFastStep = DisplayStep * 10.0;
    char NumberId[128]{}; std::snprintf(NumberId, sizeof(NumberId), "##cloud_value_%s", Label);
    ImGui::PushID(Label);
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(224, 233, 215, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(0.0f, 2.0f));
    const bool InputChanged = ImGui::InputScalar(NumberId, ImGuiDataType_Double, &DisplayValue,
                                                  &DisplayStep, &DisplayFastStep, NumericFormat.c_str());
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(4);
    if (!Unit.empty()) CloudText(Context, ImVec2(At.x + Width - UnitWidth - 8.0f, At.y + 6.0f),
                                 10.0f, IM_COL32(178, 178, 170, 255), Unit.c_str());
    if (InputChanged)
    {
        const double Raw = std::clamp(DisplayValue / Scale, Minimum, Maximum);
        *Value = std::clamp(Minimum + std::round((Raw - Minimum) / Step) * Step, Minimum, Maximum);
    }

    const ImVec2 TrackAt(At.x, At.y + 36.0f);
    ImGui::SetCursorScreenPos(TrackAt);
    ImGui::InvisibleButton("##cloud_track", ImVec2(Width, 22.0f));
    const bool Active = ImGui::IsItemActive(), Hovered = ImGui::IsItemHovered();
    if (Active && ImGui::IsMouseDown(ImGuiMouseButton_Left))
    {
        const double T = std::clamp((double(ImGui::GetIO().MousePos.x) - TrackAt.x) / Width, 0.0, 1.0);
        const double Raw = Minimum + T * (Maximum - Minimum);
        *Value = std::clamp(Minimum + std::round((Raw - Minimum) / Step) * Step, Minimum, Maximum);
    }
    if (Active)
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) *Value = Minimum;
        if (ImGui::IsKeyPressed(ImGuiKey_End)) *Value = Maximum;
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow) || ImGui::IsKeyPressed(ImGuiKey_DownArrow)) *Value = std::max(Minimum, *Value - Step);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow) || ImGui::IsKeyPressed(ImGuiKey_UpArrow)) *Value = std::min(Maximum, *Value + Step);
    }
    const double T = std::clamp((*Value - Minimum) / std::max(1.0e-12, Maximum - Minimum), 0.0, 1.0);
    const ImVec2 TrackMin(TrackAt.x, TrackAt.y + 1.0f), TrackMax(TrackAt.x + Width, TrackAt.y + 23.0f);
    Draw->AddRectFilled(TrackMin, TrackMax, IM_COL32(23, 24, 24, 255), 11.0f);
    if (T > 0.0) Draw->AddRectFilled(TrackMin, ImVec2(TrackAt.x + Width * float(T), TrackMax.y), IM_COL32(85, 86, 80, 255), 11.0f);
    Draw->AddCircleFilled(ImVec2(TrackAt.x + Width * float(T), TrackAt.y + 12.0f), 10.0f, IM_COL32(226, 228, 216, 255), 24);
    if (Hovered) ImGui::SetMouseCursor(ImGuiMouseCursor_ResizeEW);
    ImGui::PopID();
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 78.0f));
    ImGui::Dummy(ImVec2(Width, 1.0f));
    return InputChanged || std::abs(*Value - OriginalValue) > 1.0e-12;
}

bool CloudToggle(GlobalInspectorPresentationContext& Context, const char* Label, bool* Value)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Label);
    const bool Clicked = ImGui::InvisibleButton("##cloud_toggle", ImVec2(Width, 36.0f));
    const bool Hovered = ImGui::IsItemHovered();
    if (Clicked) *Value = !*Value;
    const ImU32 Fill = *Value ? IM_COL32(44, 60, 42, 255) : IM_COL32(36, 39, 35, 255);
    const ImU32 Edge = *Value ? IM_COL32(187, 216, 154, 92) : IM_COL32(176, 195, 160, 34);
    ImGui::GetWindowDrawList()->AddRectFilled(At, ImVec2(At.x + Width, At.y + 36.0f),
                                              Hovered ? IM_COL32(54, 70, 50, 255) : Fill, 16.0f);
    ImGui::GetWindowDrawList()->AddRect(At, ImVec2(At.x + Width, At.y + 36.0f), Edge, 16.0f);
    CloudText(Context, ImVec2(At.x + 13.0f, At.y + 11.0f), 9.5f, CloudInk, Label);
    const char* Status = *Value ? "On ↗" : "Off";
    const float StatusWidth = KitTextWidth(Context.Faces.Regular, 9.0f, Status);
    CloudText(Context, ImVec2(At.x + Width - StatusWidth - 13.0f, At.y + 12.0f), 9.0f,
              *Value ? CloudAccent : CloudMuted, Status);
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    return Clicked;
}

void CloudDiagramFrame(GlobalInspectorPresentationContext& Context, const char* Id, float Height,
                       ImVec2& Origin, float& Width)
{
    Width = ImGui::GetContentRegionAvail().x;
    Origin = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton(Id, ImVec2(Width, Height));
}

constexpr int32_t SourceCloudFieldSize = 64;
using SourceCloudField = std::array<uint8_t, SourceCloudFieldSize * SourceCloudFieldSize * SourceCloudFieldSize>;

const SourceCloudField& BuildSourceCloudField()
{
    static const SourceCloudField Field = [] {
        uint32_t State = 0x31a59e27u;
        const auto Random = [&State]() {
            State ^= State << 13u;
            State ^= State >> 17u;
            State ^= State << 5u;
            return double(State) / 4294967296.0;
        };
        std::array<std::vector<float>, 3> Grids;
        const std::array<int32_t, 3> Sizes{8, 16, 32};
        for (size_t O = 0; O < Sizes.size(); ++O)
        {
            const size_t Count = size_t(Sizes[O]) * Sizes[O] * Sizes[O];
            Grids[O].resize(Count);
            for (float& Value : Grids[O]) Value = Random(); // Float32Array source rounding.
        }
        SourceCloudField Result{};
        const auto Smooth = [](double T) { return T * T * (3.0 - 2.0 * T); };
        for (int32_t Z = 0; Z < SourceCloudFieldSize; ++Z)
            for (int32_t Y = 0; Y < SourceCloudFieldSize; ++Y)
                for (int32_t X = 0; X < SourceCloudFieldSize; ++X)
                {
                    double Sum = 0.0, Weight = 0.0;
                    for (int32_t O = 0; O < 3; ++O)
                    {
                        const int32_t N = Sizes[size_t(O)];
                        const double Scale = double(N) / SourceCloudFieldSize;
                        const double PX = X * Scale, PY = Y * Scale, PZ = Z * Scale;
                        const int32_t IX = int32_t(std::floor(PX)), IY = int32_t(std::floor(PY)), IZ = int32_t(std::floor(PZ));
                        const double FX = Smooth(PX - IX), FY = Smooth(PY - IY), FZ = Smooth(PZ - IZ);
                        double Interpolated = 0.0;
                        for (int32_t K = 0; K < 2; ++K)
                            for (int32_t J = 0; J < 2; ++J)
                                for (int32_t I = 0; I < 2; ++I)
                                {
                                    const int32_t CX = (IX + I) % N, CY = (IY + J) % N, CZ = (IZ + K) % N;
                                    const size_t Index = (size_t(CZ) * N + CY) * N + CX;
                                    Interpolated += Grids[size_t(O)][Index] * (I ? FX : 1.0f - FX) *
                                                    (J ? FY : 1.0f - FY) * (K ? FZ : 1.0f - FZ);
                                }
                        const double OctaveWeight = 1.0 / double(1 << O);
                        Sum += Interpolated * OctaveWeight;
                        Weight += OctaveWeight;
                    }
                    const double Value = Sum / Weight * 255.0;
                    Result[(size_t(Z) * SourceCloudFieldSize + Y) * SourceCloudFieldSize + X] =
                        uint8_t(std::clamp(Value, 0.0, 255.0));
                }
        return Result;
    }();
    return Field;
}

double SourceCloudFieldSample(const SourceCloudField& Field, const std::array<double, 3>& Point)
{
    std::array<int32_t, 3> Index{};
    std::array<double, 3> Fraction{};
    for (size_t Axis = 0; Axis < 3; ++Axis)
    {
        const double Coordinate = Point[Axis] * SourceCloudFieldSize - 0.5;
        Index[Axis] = int32_t(std::floor(Coordinate));
        Fraction[Axis] = Coordinate - Index[Axis];
    }
    const auto Wrap = [](int32_t V) { return (V % SourceCloudFieldSize + SourceCloudFieldSize) % SourceCloudFieldSize; };
    double Sum = 0.0;
    for (int32_t Z = 0; Z < 2; ++Z)
        for (int32_t Y = 0; Y < 2; ++Y)
            for (int32_t X = 0; X < 2; ++X)
            {
                const int32_t CX = Wrap(Index[0] + X), CY = Wrap(Index[1] + Y), CZ = Wrap(Index[2] + Z);
                const size_t At = (size_t(CZ) * SourceCloudFieldSize + CY) * SourceCloudFieldSize + CX;
                Sum += Field[At] / 255.0 * (X ? Fraction[0] : 1.0 - Fraction[0]) *
                       (Y ? Fraction[1] : 1.0 - Fraction[1]) * (Z ? Fraction[2] : 1.0 - Fraction[2]);
            }
    return Sum;
}

double SourceCloudProfile(double Height, const CloudLayerRecord& Clouds)
{
    const auto Clamp = [](double V) { return std::clamp(V, 0.0, 1.0); };
    if (Height <= 0.0 || Height >= 1.0) return 0.0;
    double Profile = Clamp(Height * 8.0) * Clamp((1.0 - Height) * 3.0);
    if (Clouds.FormationIndex < 1.5) Profile = Clamp(Height * 12.0) * Clamp((1.0 - Height) * 8.0);
    if (Clouds.FormationIndex > 2.5 && Clouds.FormationIndex < 3.5)
        Profile *= 1.0 + Clouds.AnvilShaping * Height * 0.5;
    if (Clouds.FormationIndex > 3.5) Profile *= std::max(0.0, 1.0 - std::pow(Height * 2.0 - 1.0, 2.0));
    return Profile;
}

double SourceCloudDensity(const SourceCloudField& Field, const CloudLayerRecord& Clouds, double X, double Y, double Z)
{
    const double Top = std::min(Clouds.CeilingAltitudeMetres, Clouds.BaseAltitudeMetres + Clouds.LayerThicknessMetres);
    const double Height = (Z - Clouds.BaseAltitudeMetres) / std::max(1.0, Top - Clouds.BaseAltitudeMetres);
    if (!Clouds.CloudLayerEnabled || Top <= Clouds.BaseAltitudeMetres || Height <= 0.0 || Height >= 1.0) return 0.0;
    const double Scale = std::max(7200.0 * Clouds.FeatureScale, 1.0);
    const std::array<double, 3> UV{X / Scale, Y / Scale, Z / Scale};
    const double Base = SourceCloudFieldSample(Field, UV);
    const std::array<double, 3> DetailUV{UV[0] * 4.1 + 0.21, UV[1] * 4.1 + 0.47, UV[2] * 4.1 + 0.13};
    const double Shape = Base - Clouds.EdgeErosion * (1.0 - SourceCloudFieldSample(Field, DetailUV)) * 0.22;
    const double Eroded = std::clamp((Shape - (1.0 - Clouds.CoverageFraction)) /
                                     std::max(0.08, Clouds.CoverageFraction * 0.65), 0.0, 1.0);
    return Eroded * Eroded * (3.0 - 2.0 * Eroded) * SourceCloudProfile(Height, Clouds) * Clouds.DensityMultiplier;
}

ImU32 CloudAtlasCssPixel(double Red, double Green, double Blue)
{
    std::array<double, 3> Colour{Red / 255.0, Green / 255.0, Blue / 255.0};
    const std::array<double, 3> Original = Colour;
    const std::array<double, 3> Sepia{
        0.393 * Original[0] + 0.769 * Original[1] + 0.189 * Original[2],
        0.349 * Original[0] + 0.686 * Original[1] + 0.168 * Original[2],
        0.272 * Original[0] + 0.534 * Original[1] + 0.131 * Original[2]};
    for (size_t I = 0; I < 3; ++I) Colour[I] = Original[I] * 0.78 + Sepia[I] * 0.22;
    constexpr double Angle = 48.0 * 3.14159265358979323846 / 180.0;
    const double Cosine = std::cos(Angle), Sine = std::sin(Angle);
    const std::array<double, 3> Hue{
        (0.213 + Cosine * 0.787 - Sine * 0.213) * Colour[0] + (0.715 - Cosine * 0.715 - Sine * 0.715) * Colour[1] + (0.072 - Cosine * 0.072 + Sine * 0.928) * Colour[2],
        (0.213 - Cosine * 0.213 + Sine * 0.143) * Colour[0] + (0.715 + Cosine * 0.285 + Sine * 0.140) * Colour[1] + (0.072 - Cosine * 0.072 - Sine * 0.283) * Colour[2],
        (0.213 - Cosine * 0.213 - Sine * 0.787) * Colour[0] + (0.715 - Cosine * 0.715 + Sine * 0.715) * Colour[1] + (0.072 + Cosine * 0.928 + Sine * 0.072) * Colour[2]};
    constexpr double Saturation = 0.7;
    const double Grey = Hue[0] * 0.213 + Hue[1] * 0.715 + Hue[2] * 0.072;
    const std::array<double, 3> Filtered{
        Grey * (1.0 - Saturation) + Hue[0] * Saturation,
        Grey * (1.0 - Saturation) + Hue[1] * Saturation,
        Grey * (1.0 - Saturation) + Hue[2] * Saturation};
    constexpr double Opacity = 0.9;
    const std::array<double, 3> Background{24.0 / 255.0, 30.0 / 255.0, 27.0 / 255.0};
    const auto Composite = [&](size_t I) {
        const double Source = std::clamp(Filtered[I], 0.0, 1.0) * Opacity;
        return uint8_t(std::clamp(std::nearbyint((Background[I] + Source - Background[I] * Source) * 255.0), 0.0, 255.0));
    };
    return IM_COL32(Composite(0), Composite(1), Composite(2), 255);
}

void CloudDrawDensityAtlas(GlobalInspectorPresentationContext& Context, CloudLayerRecord& Clouds)
{
    const float ExpectedPlotWidth = std::max(1.0f, ImGui::GetContentRegionAvail().x - 36.0f);
    const float AtlasCardHeight = 190.0f + ExpectedPlotWidth * (440.0f / 640.0f);
    CloudCard(Context, "density_atlas", "Density atlas", "01 / FIELD", AtlasCardHeight, 18.0f, true);
    const float Width = ImGui::GetContentRegionAvail().x;
    const ImVec2 Header = ImGui::GetCursorScreenPos();
    char Coverage[32]{};
    std::snprintf(Coverage, sizeof(Coverage), "%.0f", Clouds.CoverageFraction * 100.0);
    CloudText(Context, Header, 9.0f, CloudMuted, "Coverage setting");
    CloudText(Context, ImVec2(Header.x, Header.y + 11.0f), 55.0f, CloudInk, Coverage, Context.Faces.Light);
    const float CoverageWidth = KitTextWidth(Context.Faces.Light, 55.0f, Coverage);
    CloudText(Context, ImVec2(Header.x + CoverageWidth + 5.0f, Header.y + 45.0f), 17.0f, CloudMuted, "%");
    const char* Formation = CloudLayerRecord::FormationLabel(Clouds.FormationIndex);
    const float TypeWidth = KitTextWidth(Context.Faces.Medium, 9.0f, Formation);
    ImGui::GetWindowDrawList()->AddRectFilled(ImVec2(Header.x + Width - TypeWidth - 20.0f, Header.y + 7.0f),
                                               ImVec2(Header.x + Width, Header.y + 31.0f), IM_COL32(204, 225, 162, 18), 12.0f);
    CloudText(Context, ImVec2(Header.x + Width - TypeWidth - 10.0f, Header.y + 14.0f), 9.0f, CloudAccent, Formation, Context.Faces.Medium);
    ImGui::Dummy(ImVec2(Width, 92.0f));

    constexpr int32_t ImageWidth = 192, ImageHeight = 96;
    static const SourceCloudField& Field = BuildSourceCloudField();
    static std::array<double, 10> LastSettings{};
    static bool HasImage = false;
    static std::array<ImU32, ImageWidth * ImageHeight> Pixels{};
    const std::array<double, 10> Settings{Clouds.CloudLayerEnabled ? 1.0 : 0.0, Clouds.CoverageFraction,
        Clouds.DensityMultiplier, Clouds.FeatureScale, double(Clouds.FormationIndex), Clouds.AnvilShaping,
        Clouds.EdgeErosion, Clouds.BaseAltitudeMetres, Clouds.LayerThicknessMetres, Clouds.CeilingAltitudeMetres};
    if (!HasImage || Settings != LastSettings)
    {
        LastSettings = Settings;
        HasImage = true;
        const double Aspect = 640.0 / 440.0;
        const double Low = Clouds.BaseAltitudeMetres;
        const double High = std::min(Clouds.CeilingAltitudeMetres, Clouds.BaseAltitudeMetres + Clouds.LayerThicknessMetres);
        for (int32_t Y = 0; Y < ImageHeight; ++Y)
            for (int32_t X = 0; X < ImageWidth; ++X)
            {
                const double U = (X + 0.5) / ImageWidth, V = (Y + 0.5) / ImageHeight;
                const double PX = (U - 0.5) * 6000.0, PY = (0.5 - V) * 6000.0 / Aspect;
                double Density = 0.0;
                for (int32_t K = 0; K < 8; ++K)
                    Density += SourceCloudDensity(Field, Clouds, PX, PY, Low + (K + 0.5) / 8.0 * (High - Low));
                Density /= 8.0;
                const double Coverage = 1.0 - std::exp(-std::max(0.0, Density) * 3.0);
                const auto Channel = [Coverage](double V0, double Span) {
                    return uint8_t(std::clamp(std::nearbyint(V0 + Coverage * Span), 0.0, 255.0));
                };
                Pixels[size_t(Y * ImageWidth + X)] = CloudAtlasCssPixel(Channel(26.0, 180.0),
                                                                            Channel(35.0, 181.0),
                                                                            Channel(47.0, 182.0));
            }
    }

    ImVec2 Origin; float PlotWidth = 0.0f;
    const float PlotHeight = ImGui::GetContentRegionAvail().x * (440.0f / 640.0f);
    CloudDiagramFrame(Context, "##cloud_density_atlas", PlotHeight, Origin, PlotWidth);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + PlotHeight), true);
    for (int32_t Y = 0; Y < ImageHeight; ++Y)
        for (int32_t X = 0; X < ImageWidth; ++X)
        {
            const ImVec2 A(Origin.x + PlotWidth * X / ImageWidth, Origin.y + PlotHeight * Y / ImageHeight);
            const ImVec2 B(Origin.x + PlotWidth * (X + 1) / ImageWidth + 0.25f,
                           Origin.y + PlotHeight * (Y + 1) / ImageHeight + 0.25f);
            Draw->AddRectFilled(A, B, Pixels[size_t(Y * ImageWidth + X)]);
        }

    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * PlotWidth / 640.0f, Origin.y + Y * PlotHeight / 440.0f); };
    const float DashScale = PlotWidth / 640.0f;
    for (int32_t I = 0; I < 7; ++I)
    {
        const float X = 30.0f + I * 96.0f;
        for (float Y = 18.0f; Y < 420.0f; Y += 8.0f)
            Draw->AddLine(P(X, Y), P(X, std::min(Y + 2.0f, 420.0f)), IM_COL32(187, 215, 197, 36), 1.0f * DashScale);
    }
    for (const float Y : {80.0f, 180.0f, 280.0f, 380.0f})
        for (float X = 18.0f; X < 622.0f; X += 8.0f)
            Draw->AddLine(P(X, Y), P(std::min(X + 2.0f, 622.0f), Y), IM_COL32(187, 215, 197, 36), 1.0f * DashScale);
    Draw->AddLine(P(320.0f, 190.0f), P(320.0f, 250.0f), IM_COL32(228, 235, 215, 170), 1.0f);
    Draw->AddLine(P(290.0f, 220.0f), P(350.0f, 220.0f), IM_COL32(228, 235, 215, 170), 1.0f);
    Draw->AddCircle(P(320.0f, 220.0f), 28.0f * PlotWidth / 640.0f, IM_COL32(212, 230, 168, 128), 48, 1.0f);
    Draw->AddCircleFilled(P(320.0f, 220.0f), 4.0f * PlotWidth / 640.0f, IM_COL32(220, 234, 180, 255), 24);
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Cloud density atlas · static top-down density diagnostic");
    CloudText(Context, P(28.0f, 410.0f), 20.0f * PlotWidth / 640.0f, IM_COL32(216, 228, 219, 255), "XY / WORLD FIELD");
    const char* RightText = "DENSITY →";
    const float RightWidth = KitTextWidth(Context.Faces.Regular, 20.0f * PlotWidth / 640.0f, RightText);
    CloudText(Context, ImVec2(Origin.x + 612.0f * PlotWidth / 640.0f - RightWidth, Origin.y + 410.0f * PlotHeight / 440.0f),
              20.0f * PlotWidth / 640.0f, IM_COL32(216, 228, 219, 255), RightText);
    Draw->PopClipRect();
    ImGui::Dummy(ImVec2(Width, 2.0f));
    const ImVec2 FooterAt = ImGui::GetCursorScreenPos();
    Draw->AddLine(FooterAt, ImVec2(FooterAt.x + Width, FooterAt.y), IM_COL32(255, 255, 255, 11), 1.0f);
    CloudText(Context, ImVec2(FooterAt.x, FooterAt.y + 11.0f), 8.0f, CloudMuted, "Density diagnostic");
    const char* Footer = "Not a lit sky render ↗";
    CloudText(Context, ImVec2(FooterAt.x + Width - KitTextWidth(Context.Faces.Regular, 8.0f, Footer), FooterAt.y + 11.0f),
              8.0f, CloudMuted, Footer);
    ImGui::Dummy(ImVec2(Width, 28.0f));
    CloudEndCard();
}

void CloudOverview(GlobalInspectorPresentationContext& Context, CloudLayerRecord& Clouds)
{
    CloudDrawDensityAtlas(Context, Clouds);
    const ImVec2 MetricStart = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x, Gap = 8.0f, W = (Width - Gap * 2.0f) / 3.0f;
    const std::array<std::pair<const char*, std::string>, 3> Metrics{{
        {"Layer base", std::to_string(Clouds.BaseAltitudeMetres / 1000.0).substr(0, 4) + " km"},
        {"Effective top", std::to_string(Clouds.QueryEffectiveTopMetres() / 1000.0).substr(0, 4) + " km"},
        {"GPU cloud pass", "— ms"}}};
    for (size_t I = 0; I < Metrics.size(); ++I)
    {
        const ImVec2 Min(MetricStart.x + I * (W + Gap), MetricStart.y), Max(Min.x + W, Min.y + 72.0f);
        ImGui::GetWindowDrawList()->AddRectFilled(Min, Max, I == 2 ? IM_COL32(204, 225, 162, 255) : IM_COL32(38, 43, 37, 255), 12.0f);
        CloudText(Context, ImVec2(Min.x + 10.0f, Min.y + 13.0f), 8.0f,
                  I == 2 ? IM_COL32(91, 103, 74, 255) : CloudMuted, Metrics[I].first);
        CloudText(Context, ImVec2(Min.x + 10.0f, Min.y + 37.0f), 18.0f,
                  I == 2 ? IM_COL32(36, 44, 32, 255) : CloudInk, Metrics[I].second.c_str(), Context.Faces.Light);
    }
    ImGui::Dummy(ImVec2(Width, 84.0f));

    CloudCard(Context, "cloud_mix", "Shape the field", "02 / MIX", 530.0f);
    CloudText(Context, ImGui::GetCursorScreenPos(), 9.5f, CloudMuted,
              "Coverage × density · drag the point or use arrow keys");
    ImGui::Dummy(ImVec2(0.0f, 24.0f));
    ImVec2 Origin; float PlotWidth = 0.0f;
    const float PlotHeight = std::min(210.0f, std::max(145.0f, ImGui::GetContentRegionAvail().x * 0.38f));
    CloudDiagramFrame(Context, "##cloud_mix_plot", PlotHeight, Origin, PlotWidth);
    const float SX = PlotWidth / 640.0f, SY = PlotHeight / 230.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + PlotHeight), true);
    Draw->AddRectFilled(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + PlotHeight), IM_COL32(25, 29, 27, 255), 10.0f);
    for (int32_t I = 0; I < 5; ++I)
        Draw->AddLine(P(32, 30.0f + I * 40.0f), P(608, 30.0f + I * 40.0f), IM_COL32(170, 182, 161, 35), 1.0f);
    for (int32_t I = 0; I < 7; ++I)
        Draw->AddLine(P(32.0f + I * 96.0f, 30), P(32.0f + I * 96.0f, 190), IM_COL32(170, 182, 161, 25), 1.0f);
    const float PX = 32.0f + float(Clouds.CoverageFraction) * 576.0f;
    const float PY = 190.0f - float(Clouds.DensityMultiplier) / 4.0f * 160.0f;
    Draw->AddRectFilled(P(32, PY), P(PX, 190), IM_COL32(199, 221, 150, 22), 3.0f);
    Draw->AddLine(P(32, PY), P(PX, PY), IM_COL32(206, 222, 170, 130), 1.0f);
    Draw->AddLine(P(PX, PY), P(PX, 190), IM_COL32(206, 222, 170, 130), 1.0f);
    Draw->AddCircle(P(PX, PY), 13.0f * SX, IM_COL32(204, 225, 162, 140), 32, 1.2f);
    Draw->AddCircleFilled(P(PX, PY), 5.0f * SX, CloudAccent);
    CloudText(Context, P(32, 218), 8.0f, CloudMuted, "CLEAR");
    const float OvercastW = KitTextWidth(Context.Faces.Regular, 8.0f, "OVERCAST");
    CloudText(Context, ImVec2(Origin.x + 608.0f * SX - OvercastW, Origin.y + 218.0f * SY), 8.0f, CloudMuted, "OVERCAST");
    CloudText(Context, P(32, 19), 8.0f, CloudMuted, "DENSER ↑");
    Draw->PopClipRect();
    if (ImGui::IsItemActive())
    {
        const ImVec2 Mouse = ImGui::GetIO().MousePos;
        Clouds.CoverageFraction = std::clamp(double((Mouse.x - Origin.x) / SX - 32.0) / 576.0, 0.0, 1.0);
        Clouds.DensityMultiplier = std::clamp(double(190.0 - (Mouse.y - Origin.y) / SY) / 160.0 * 4.0, 0.0, 4.0);
    }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) { Clouds.CoverageFraction = 0.55; Clouds.DensityMultiplier = 1.0; }
        const double Direction = ImGui::IsKeyPressed(ImGuiKey_UpArrow) || ImGui::IsKeyPressed(ImGuiKey_RightArrow) ? 1.0 : -1.0;
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow) || ImGui::IsKeyPressed(ImGuiKey_RightArrow))
            Clouds.CoverageFraction = std::clamp(Clouds.CoverageFraction + Direction * 0.01, 0.0, 1.0);
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow) || ImGui::IsKeyPressed(ImGuiKey_DownArrow))
            Clouds.DensityMultiplier = std::clamp(Clouds.DensityMultiplier + Direction * 0.05, 0.0, 4.0);
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Coverage and density editor");
    ImGui::Dummy(ImVec2(Width, 8.0f));
    double Coverage = Clouds.CoverageFraction;
    if (CloudScalar(Context, "Coverage", &Coverage, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.CoverageFraction = Coverage;
    double Density = Clouds.DensityMultiplier;
    if (CloudScalar(Context, "Density multiplier", &Density, 0.0, 4.0, "%.2f×", 0.05)) Clouds.DensityMultiplier = Density;
    if (ImGui::Button("Formation & altitude   ↗", ImVec2(-1.0f, 34.0f))) Clouds.ActiveSectionIndex = 1;
    CloudEndCard();
}

void CloudFormation(GlobalInspectorPresentationContext& Context, CloudLayerRecord& Clouds)
{
    CloudCard(Context, "cloud_profile", "Layer anatomy", "03 / PROFILE", 850.0f);
    const char* FormationNames[] = {"Stratus", "Stratocumulus", "Cumulus", "Cumulonimbus", "Altostratus", "Cirrus"};
    const int32_t Selected = std::clamp(Clouds.FormationIndex, 0, 5);
    if (ImGui::BeginCombo("Formation", FormationNames[Selected]))
    {
        for (int32_t I = 0; I < 6; ++I)
            if (ImGui::Selectable(FormationNames[I], I == Clouds.FormationIndex)) Clouds.FormationIndex = I;
        ImGui::EndCombo();
    }
    ImGui::SetItemTooltip("Cloud formation");
    ImVec2 Origin; float Width = 0.0f;
    const float PlotHeight = std::min(195.0f, std::max(145.0f, ImGui::GetContentRegionAvail().x * 0.37f));
    CloudDiagramFrame(Context, "##cloud_profile_plot", PlotHeight, Origin, Width);
    const float SX = Width / 640.0f, SY = PlotHeight / 330.0f;
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + Width, Origin.y + PlotHeight), true);
    Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + PlotHeight), IM_COL32(24, 29, 30, 255), 10.0f);
    for (int32_t I = 0; I < 5; ++I)
    {
        const float Y = 40.0f + I * 58.0f;
        Draw->AddLine(ImVec2(Origin.x + 65.0f * SX, Origin.y + Y * SY), ImVec2(Origin.x + 575.0f * SX, Origin.y + Y * SY), IM_COL32(211, 223, 211, 34), 1.0f);
    }
    std::array<ImVec2, 65> Points{};
    for (int32_t I = 0; I < int32_t(Points.size()); ++I)
    {
        const double T = double(I) / 64.0;
        const double Profile = Clouds.EvaluateVerticalEnvelope(1.0 - T);
        Points[size_t(I)] = ImVec2(Origin.x + (100.0f + float(Profile) * 340.0f) * SX,
                                    Origin.y + (40.0f + float(T) * 232.0f) * SY);
    }
    Draw->AddPolyline(Points.data(), int(Points.size()), CloudAccent, ImDrawFlags_None, 2.1f);
    CloudText(Context, ImVec2(Origin.x + 100.0f * SX, Origin.y + 310.0f * SY), 8.0f, CloudMuted,
              "NORMALISED DENSITY PROFILE");
    const char* TopLabel = Clouds.QueryCeilingClipped() ? "CEILING LIMITED" : "WORLD Z / km";
    const float TopWidth = KitTextWidth(Context.Faces.Regular, 8.0f, TopLabel);
    CloudText(Context, ImVec2(Origin.x + Width - TopWidth - 12.0f, Origin.y + 30.0f * SY), 8.0f, CloudAccent, TopLabel);
    Draw->PopClipRect();
    ImGui::Dummy(ImVec2(Width, 5.0f));
    double Base = Clouds.BaseAltitudeMetres;
    if (CloudScalar(Context, "Base altitude", &Base, 100.0, 20000.0, "%.0f m", 100.0)) Clouds.BaseAltitudeMetres = Base;
    double Thickness = Clouds.LayerThicknessMetres;
    if (CloudScalar(Context, "Layer thickness", &Thickness, 100.0, 6000.0, "%.0f m", 100.0)) Clouds.LayerThicknessMetres = Thickness;
    double Ceiling = Clouds.CeilingAltitudeMetres;
    if (CloudScalar(Context, "Ceiling limit", &Ceiling, 4000.0, 20000.0, "%.0f m", 100.0)) Clouds.CeilingAltitudeMetres = Ceiling;
    double Scale = Clouds.FeatureScale;
    if (CloudScalar(Context, "Feature scale", &Scale, 0.2, 3.0, "%.2f×", 0.05)) Clouds.FeatureScale = Scale;
    double Anvil = Clouds.AnvilShaping;
    if (CloudScalar(Context, "Anvil shaping", &Anvil, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.AnvilShaping = Anvil;
    double Erosion = Clouds.EdgeErosion;
    if (CloudScalar(Context, "Edge erosion", &Erosion, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.EdgeErosion = Erosion;
    char ClipText[160]{};
    if (Clouds.QueryCeilingClipped())
        std::snprintf(ClipText, sizeof(ClipText), "%.0f m rendered · %.0f m clipped by the ceiling.",
                      Clouds.QueryRenderedDepthMetres(), Clouds.LayerThicknessMetres - Clouds.QueryRenderedDepthMetres());
    else std::snprintf(ClipText, sizeof(ClipText), "Altitude is world Z, not height above terrain. Profile is a density envelope, not a lit render.");
    CloudNote(Context, ClipText, 44.0f);
    CloudEndCard();

    CloudCard(Context, "cloud_scatter", "Light response", "04 / SCATTER", 410.0f);
    double G = Clouds.ForwardAnisotropy;
    if (CloudScalar(Context, "Forward scattering", &G, -0.8, 0.8, "%.2f g", 0.01)) Clouds.ForwardAnisotropy = G;
    double Absorption = Clouds.LightAbsorption;
    if (CloudScalar(Context, "Light absorption", &Absorption, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.LightAbsorption = Absorption;
    double Powder = Clouds.PowderResponse;
    if (CloudScalar(Context, "Powder response", &Powder, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.PowderResponse = Powder;
    double Taps = Clouds.SunShadowTaps;
    if (CloudScalar(Context, "Sun-shadow taps", &Taps, 0.0, 4.0, "%.0f taps", 1.0)) Clouds.SunShadowTaps = int32_t(std::round(Taps));
    CloudEndCard();
}

void CloudRendering(GlobalInspectorPresentationContext& Context, CloudLayerRecord& Clouds)
{
    CloudCard(Context, "cloud_budget", "Render footprint", "05 / BUDGET", 540.0f);
    const double PixelShare = Clouds.QueryPixelShareFraction() * 100.0;
    char Share[24]{}, Samples[24]{};
    std::snprintf(Share, sizeof(Share), "%.1f%%", PixelShare);
    std::snprintf(Samples, sizeof(Samples), "%d", Clouds.QuerySkyMarchBudget());
    CloudText(Context, ImGui::GetCursorScreenPos(), 23.0f, CloudInk, Share, Context.Faces.Light);
    CloudText(Context, ImVec2(ImGui::GetCursorScreenPos().x + 118.0f, ImGui::GetCursorScreenPos().y + 7.0f), 8.0f, CloudMuted, "FULL-FRAME PIXEL SHARE");
    ImGui::Dummy(ImVec2(0.0f, 34.0f));
    const float Width = ImGui::GetContentRegionAvail().x;
    const ImVec2 Foot = ImGui::GetCursorScreenPos();
    ImGui::GetWindowDrawList()->AddRectFilled(Foot, ImVec2(Foot.x + Width, Foot.y + 110.0f), IM_COL32(25, 30, 28, 255), 8.0f);
    const float Percent = std::clamp(float(Clouds.TargetResolutionPercent) / 100.0f, 0.0f, 1.0f);
    ImGui::GetWindowDrawList()->AddRectFilled(Foot, ImVec2(Foot.x + Width * Percent, Foot.y + 110.0f), IM_COL32(198, 221, 150, 70), 8.0f);
    ImGui::GetWindowDrawList()->AddRect(Foot, ImVec2(Foot.x + Width, Foot.y + 110.0f), IM_COL32(182, 204, 153, 65), 8.0f);
    char Axis[32]{}; std::snprintf(Axis, sizeof(Axis), "%d%% / axis", Clouds.TargetResolutionPercent);
    const float AxisWidth = KitTextWidth(Context.Faces.Medium, 13.0f, Axis);
    CloudText(Context, ImVec2(Foot.x + Width * Percent - AxisWidth - 8.0f, Foot.y + 46.0f), 13.0f, CloudInk, Axis, Context.Faces.Medium);
    ImGui::Dummy(ImVec2(Width, 120.0f));
    ImGui::SetNextItemWidth(Width);
    double Resolution = Clouds.TargetResolutionPercent;
    if (CloudScalar(Context, "Cloud resolution", &Resolution, 25.0, 100.0, "%.0f % / axis", 1.0)) Clouds.TargetResolutionPercent = int32_t(std::round(Resolution));
    double Steps = Clouds.PrimaryMarchSteps;
    if (CloudScalar(Context, "Sky base samples", &Steps, 8.0, 64.0, "%.0f samples", 1.0)) Clouds.PrimaryMarchSteps = int32_t(std::round(Steps));
    double LocalSteps = Clouds.LocalMarchSteps;
    if (CloudScalar(Context, "Local base samples", &LocalSteps, 8.0, 64.0, "%.0f samples", 1.0)) Clouds.LocalMarchSteps = int32_t(std::round(LocalSteps));
    CloudNote(Context, "Thickness-aware sky rays use up to 96 samples. Pixel share is calculated from resolution, not a performance prediction. No temporal cloud history or lighting cache.", 60.0f);
    CloudEndCard();

    CloudCard(Context, "cloud_shadows", "Ground shadow field", "06 / OCCLUSION", 490.0f);
    CloudToggle(Context, "Cloud shadows", &Clouds.GroundShadowsEnabled);
    double Strength = Clouds.ShadowStrength;
    if (CloudScalar(Context, "Shadow strength", &Strength, 0.0, 1.0, "%.0f %", 0.01, 100.0)) Clouds.ShadowStrength = Strength;
    double Softness = Clouds.ShadowSoftnessMetres;
    if (CloudScalar(Context, "Shadow softness", &Softness, 0.0, 200.0, "%.0f m", 1.0)) Clouds.ShadowSoftnessMetres = Softness;
    double Distance = Clouds.ShadowDistanceMetres;
    if (CloudScalar(Context, "Field span", &Distance, 1000.0, 16000.0, "%.0f m", 100.0)) Clouds.ShadowDistanceMetres = Distance;
    double ShadowSamples = Clouds.GroundShadowSamples;
    if (CloudScalar(Context, "Shadow samples", &ShadowSamples, 4.0, 12.0, "%.0f / medium", 1.0)) Clouds.GroundShadowSamples = int32_t(std::round(ShadowSamples));
    char Status[128]{};
    std::snprintf(Status, sizeof(Status), "128 × 128 projected field · %s · wind updates at most 8 Hz. Direct sunlight only.",
                  Clouds.GroundShadowsEnabled ? "active" : "inactive");
    CloudNote(Context, Status, 42.0f);
    CloudEndCard();
}

void CloudWeather(GlobalInspectorPresentationContext& Context, CloudLayerRecord& Clouds)
{
    CloudCard(Context, "cloud_weather", "Connected atmosphere", "07 / FORCEFIELD", 290.0f);
    CloudToggle(Context, "Follow shared wind", &Clouds.FollowSharedWindEnabled);
    if (Context.DirectoryPanel != nullptr)
    {
        const auto& Rows = Context.DirectoryPanel->QueryRows();
        for (const SceneDirectoryRow& Row : Rows)
        {
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(Row.Token);
            if (Descriptor && Descriptor->Domain == GlobalInspectorDomain::Wind)
            {
                if (ImGui::Button("Open Wind ForceField   ↗", ImVec2(-1.0f, 34.0f)))
                    Context.DirectoryPanel->Select(Row.Token);
                break;
            }
        }
    }
    CloudNote(Context, "Wind is shared with precipitation and local media. This layer keeps its own follow switch.", 48.0f);
    CloudEndCard();
}

} // namespace

void DrawCloudInspectorPanel(GlobalInspectorPresentationContext& Context)
{
    auto* Clouds = static_cast<CloudLayerRecord*>(Context.Descriptor->PayloadAddress);
    if (Clouds == nullptr) return;
    Clouds->SynchronizeCloudParameters();
    const ImVec2 Window = ImGui::GetWindowPos(), Size = ImGui::GetWindowSize();
    ImDrawList* PanelDraw = ImGui::GetWindowDrawList();
    PanelDraw->AddRectFilled(Window, ImVec2(Window.x + Size.x, Window.y + Size.y),
                             Context.Theme.LightSurface ? Context.Theme.PanelBg : IM_COL32(17, 20, 18, 255));

    const float HeaderY = Context.BodyTop + 2.0f;
    CloudText(Context, ImVec2(Context.Left + 2.0f, HeaderY), 9.0f, CloudMuted,
              "ENVIRONMENT  /  01", Context.Faces.Medium);
    CloudText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 33.0f), 40.0f, CloudInk,
              "Clouds", Context.Faces.Light);
    CloudText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 89.0f), 10.0f, CloudMuted,
              "Density field / shape & illumination.");

    const ImVec2 PowerAt(Context.Right - 85.0f, HeaderY + 37.0f);
    ImGui::SetCursorScreenPos(PowerAt);
    const bool PowerClicked = ImGui::InvisibleButton("##cloud_power", ImVec2(78.0f, 29.0f));
    const bool PowerHovered = ImGui::IsItemHovered();
    if (PowerClicked) Clouds->CloudLayerEnabled = !Clouds->CloudLayerEnabled;
    const ImU32 PowerFill = !Clouds->CloudLayerEnabled ? IM_COL32(34, 37, 31, 255)
                              : PowerHovered ? IM_COL32(56, 73, 45, 255) : IM_COL32(213, 230, 165, 20);
    PanelDraw->AddRectFilled(PowerAt, ImVec2(PowerAt.x + 78.0f, PowerAt.y + 29.0f), PowerFill, 20.0f);
    PanelDraw->AddRect(PowerAt, ImVec2(PowerAt.x + 78.0f, PowerAt.y + 29.0f), IM_COL32(213, 230, 165, 38), 20.0f);
    const char* PowerText = Clouds->CloudLayerEnabled ? "● Live" : "○ Off";
    const float PowerTextWidth = KitTextWidth(Context.Faces.Regular, 10.0f, PowerText);
    CloudText(Context, ImVec2(PowerAt.x + (78.0f - PowerTextWidth) * 0.5f, PowerAt.y + 9.0f),
              10.0f, Clouds->CloudLayerEnabled ? CloudAccent : CloudMuted, PowerText);
    if (PowerHovered) ImGui::SetTooltip("Toggle global clouds");

    ImGui::PushID(static_cast<int>(Context.Selected.Value & 0x7fffffffu));
    const std::array<const char*, 4> Tabs{"Overview", "Formation", "Rendering", "Weather"};
    const float TabsY = HeaderY + 130.0f;
    const float NavWidth = Context.Right - Context.Left;
    PanelDraw->AddRectFilled(ImVec2(Context.Left, TabsY), ImVec2(Context.Right, TabsY + 39.0f), IM_COL32(28, 32, 28, 255), 30.0f);
    PanelDraw->AddRect(ImVec2(Context.Left, TabsY), ImVec2(Context.Right, TabsY + 39.0f), IM_COL32(255, 255, 255, 7), 30.0f);
    const float TabGap = 3.0f, TabWidth = (NavWidth - 8.0f - 3.0f * TabGap) / 4.0f;
    int32_t ActiveSection = std::clamp(Clouds->ActiveSectionIndex, 0, 3);
    for (int32_t Index = 0; Index < int32_t(Tabs.size()); ++Index)
    {
        const ImVec2 TabAt(Context.Left + 4.0f + Index * (TabWidth + TabGap), TabsY + 4.0f);
        ImGui::SetCursorScreenPos(TabAt);
        const char* TabLabel = Tabs[size_t(Index)];
        const bool Activated = ImGui::InvisibleButton(TabLabel, ImVec2(TabWidth, 31.0f));
        const bool Hovered = ImGui::IsItemHovered();
        if (Activated) ActiveSection = Index;
        if (ImGui::IsItemFocused())
        {
            if (ImGui::IsKeyPressed(ImGuiKey_Home)) ActiveSection = 0;
            else if (ImGui::IsKeyPressed(ImGuiKey_End)) ActiveSection = 3;
            else if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) ActiveSection = (Index + 3) % 4;
            else if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) ActiveSection = (Index + 1) % 4;
        }
        const bool Selected = Index == ActiveSection;
        if (Selected || Hovered)
        {
            const ImU32 Fill = Selected ? (Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(48, 56, 45, 255))
                                        : (Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(44, 51, 41, 255));
            PanelDraw->AddRectFilled(TabAt, ImVec2(TabAt.x + TabWidth, TabAt.y + 31.0f), Fill, 24.0f);
        }
        const float LabelWidth = KitTextWidth(Context.Faces.Regular, 10.0f, TabLabel);
        CloudText(Context, ImVec2(TabAt.x + (TabWidth - LabelWidth) * 0.5f, TabAt.y + 10.0f),
                  10.0f, Selected ? IM_COL32(224, 233, 205, 255) : CloudMuted, TabLabel);
    }
    Clouds->ActiveSectionIndex = ActiveSection;
    ImGui::SetCursorScreenPos(ImVec2(Context.Left, TabsY + 58.0f));
    ImGui::PushStyleColor(ImGuiCol_ChildBg, Context.Theme.PanelBg);
    ImGui::BeginChild("##cloud_tab_content", ImVec2(Context.Width, 0.0f), false,
                      ImGuiWindowFlags_AlwaysVerticalScrollbar);
    ImGui::SetCursorPosX(10.0f);
    ImGui::SetCursorPosY(12.0f);
    switch (ActiveSection)
    {
        case 0: CloudOverview(Context, *Clouds); break;
        case 1: CloudFormation(Context, *Clouds); break;
        case 2: CloudRendering(Context, *Clouds); break;
        case 3: CloudWeather(Context, *Clouds); break;
        default: break;
    }
    Clouds->SynchronizeCloudParameters();
    ImGui::EndChild();
    ImGui::PopStyleColor();
    ImGui::PopID();
    ImGui::GetWindowDrawList()->AddLine(ImVec2(Context.Left, Window.y + Size.y - 22.0f),
                                        ImVec2(Context.Right, Window.y + Size.y - 22.0f),
                                        Context.Theme.LineSoft, 1.0f);
    CloudText(Context, ImVec2(Context.Left, Window.y + Size.y - 16.0f), 7.5f, CloudMuted, "GPU VOLUMETRIC FIELD");
    const char* Footer = "Settings apply live ↗";
    CloudText(Context, ImVec2(Context.Right - KitTextWidth(Context.Faces.Regular, 7.5f, Footer), Window.y + Size.y - 16.0f),
              7.5f, CloudMuted, Footer);
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
