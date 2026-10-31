/*==========================================================================================================================================
                                            ATMOSPHERE INSPECTOR PANEL
==========================================================================================================================================*/
// Source-mapped native implementation of VehicleHMI/AtmosphereInspectorDashboard.js,
// AtmosphereMediumLight.js and AtmosphereColumnInstrument.js. GPU bake output is never fabricated.

#include "Engine/Interface/GlobalInspectorPresentationContext.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"

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
constexpr float AtmPi = 3.14159265358979323846f;
constexpr ImU32 AtmInk = IM_COL32(232, 234, 224, 255);
constexpr ImU32 AtmMuted = IM_COL32(152, 158, 143, 255);
constexpr ImU32 AtmAccent = IM_COL32(214, 227, 166, 255);

void AtmText(GlobalInspectorPresentationContext& Context, ImVec2 At, float Size, ImU32 Colour,
             const char* Text, ImFont* Font = nullptr)
{
    ImGui::GetWindowDrawList()->AddText(Font ? Font : Context.Faces.Regular, Size, At, Colour, Text);
}

void AtmCard(GlobalInspectorPresentationContext& Context, const char* Id, const char* Title,
             const char* Subtitle, float Height, bool OpticalBench = false)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Id);
    ImGui::BeginChild("##atmosphere_card", ImVec2(Width, Height), false,
                      ImGuiWindowFlags_NoScrollbar);
    ForwardGlobalInspectorCardWheelToParent();
    const ImVec2 Min = ImGui::GetWindowPos();
    const ImVec2 Max(Min.x + ImGui::GetWindowSize().x, Min.y + ImGui::GetWindowSize().y);
    ImGui::GetWindowDrawList()->AddRectFilled(Min, Max,
        Context.Theme.LightSurface ? Context.Theme.Surface : (OpticalBench ? IM_COL32(32, 37, 30, 255) : IM_COL32(35, 39, 32, 255)), 23.0f);
    if (OpticalBench || Context.Theme.LightSurface)
        ImGui::GetWindowDrawList()->AddRect(Min, Max,
            Context.Theme.LightSurface ? Context.Theme.Line : IM_COL32(201, 213, 180, 20), 23.0f);
    const float SubtitleWidth = KitTextWidth(Context.Faces.Medium, 8.0f, Subtitle);
    AtmText(Context, ImVec2(Min.x + 18.0f, Min.y + 18.0f), 12.0f, AtmInk, Title, Context.Faces.Regular);
    AtmText(Context, ImVec2(Max.x - SubtitleWidth - 18.0f, Min.y + 20.0f), 8.0f, AtmMuted, Subtitle, Context.Faces.Medium);
    ImGui::SetCursorScreenPos(ImVec2(Min.x + 18.0f, Min.y + 50.0f));
}

void AtmEndCard()
{
    ImGui::EndChild();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 15.0f));
}

bool AtmField(GlobalInspectorPresentationContext& Context, const char* Label, double* Value,
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
    AtmText(Context, At, 11.0f, AtmMuted, Label);

    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(ImVec2(CapsuleX, At.y - 1.0f), ImVec2(At.x + Width, At.y + 23.0f),
                        IM_COL32(8, 8, 8, 255), 12.0f);
    ImGui::SetCursorScreenPos(ImVec2(CapsuleX + 9.0f, At.y + 3.0f));
    ImGui::SetNextItemWidth(CapsuleWidth - UnitWidth - 24.0f);
    double DisplayValue = *Value * Scale;
    const double DisplayStep = Step * Scale;
    const double DisplayFastStep = DisplayStep * 10.0;
    char NumberId[128]{}; std::snprintf(NumberId, sizeof(NumberId), "##at_value_%s", Label);
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(224, 224, 216, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(0.0f, 2.0f));
    const bool InputChanged = ImGui::InputScalar(NumberId, ImGuiDataType_Double, &DisplayValue,
                                                  &DisplayStep, &DisplayFastStep, NumericFormat.c_str());
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(4);
    if (!Unit.empty()) AtmText(Context, ImVec2(At.x + Width - KitTextWidth(Context.Faces.Regular, 10.0f, Unit.c_str()) - 8.0f, At.y + 6.0f),
                               10.0f, IM_COL32(178, 178, 170, 255), Unit.c_str());
    if (InputChanged)
    {
        const double Raw = std::clamp(DisplayValue / Scale, Minimum, Maximum);
        *Value = Minimum + std::round((Raw - Minimum) / Step) * Step;
    }

    const ImVec2 TrackAt(At.x, At.y + 36.0f);
    const float TrackWidth = Width;
    ImGui::SetCursorScreenPos(TrackAt);
    ImGui::PushID(Label);
    ImGui::InvisibleButton("##at_track", ImVec2(TrackWidth, 22.0f));
    const bool Active = ImGui::IsItemActive();
    const bool Hovered = ImGui::IsItemHovered();
    if (Active && ImGui::IsMouseDown(ImGuiMouseButton_Left))
    {
        const double T = std::clamp((double(ImGui::GetIO().MousePos.x) - TrackAt.x) / TrackWidth, 0.0, 1.0);
        *Value = Minimum + T * (Maximum - Minimum);
    }
    if (Active)
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) *Value = Minimum;
        if (ImGui::IsKeyPressed(ImGuiKey_End)) *Value = Maximum;
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow) || ImGui::IsKeyPressed(ImGuiKey_DownArrow)) *Value = std::max(Minimum, *Value - Step);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow) || ImGui::IsKeyPressed(ImGuiKey_UpArrow)) *Value = std::min(Maximum, *Value + Step);
        *Value = std::clamp(Minimum + std::round((*Value - Minimum) / Step) * Step, Minimum, Maximum);
    }
    const double T = std::clamp((*Value - Minimum) / std::max(1.0e-12, Maximum - Minimum), 0.0, 1.0);
    const ImVec2 TrackMin(TrackAt.x, TrackAt.y + 1.0f), TrackMax(TrackAt.x + TrackWidth, TrackAt.y + 23.0f);
    Draw->AddRectFilled(TrackMin, TrackMax, IM_COL32(23, 24, 24, 255), 11.0f);
    if (T > 0.0) Draw->AddRectFilled(TrackMin, ImVec2(TrackAt.x + TrackWidth * float(T), TrackMax.y), IM_COL32(85, 86, 80, 255), 11.0f);
    Draw->AddCircleFilled(ImVec2(TrackAt.x + TrackWidth * float(T), TrackAt.y + 12.0f), 10.0f, IM_COL32(226, 228, 216, 255), 24);
    if (Hovered) ImGui::SetMouseCursor(ImGuiMouseCursor_ResizeEW);
    ImGui::PopID();
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 78.0f));
    ImGui::Dummy(ImVec2(Width, 1.0f));
    return InputChanged || std::abs(*Value - OriginalValue) > 1.0e-12;
}

void AtmNote(GlobalInspectorPresentationContext& Context, const char* Text, float Height = 60.0f)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::Dummy(ImVec2(Width, Height));
    ImGui::GetWindowDrawList()->AddText(Context.Faces.Regular, 9.5f, At, AtmMuted, Text, nullptr, Width - 7.0f);
}

void AtmPlot(const char* Id, float Height, ImVec2& Origin, float& Width)
{
    Width = ImGui::GetContentRegionAvail().x;
    Origin = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton(Id, ImVec2(Width, Height));
}

void AtmToggle(GlobalInspectorPresentationContext& Context, const char* Label, bool* Value)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Label);
    const bool Clicked = ImGui::InvisibleButton("##at_toggle", ImVec2(Width, 34.0f));
    const bool Hovered = ImGui::IsItemHovered();
    if (Clicked) *Value = !*Value;
    const ImU32 Fill = Hovered ? IM_COL32(42, 49, 36, 255) : IM_COL32(23, 29, 20, 255);
    ImGui::GetWindowDrawList()->AddRectFilled(At, ImVec2(At.x + Width, At.y + 36), Fill, 12.0f);
    ImGui::GetWindowDrawList()->AddRect(At, ImVec2(At.x + Width, At.y + 36), IM_COL32(214, 227, 166, 21), 12.0f);
    AtmText(Context, ImVec2(At.x + 11, At.y + 10), 9.0f, AtmInk, Label);
    const char* State = *Value ? "On ↗" : "Off";
    const float StateWidth = KitTextWidth(Context.Faces.Regular, 8.5f, State);
    AtmText(Context, ImVec2(At.x + Width - StateWidth - 11, At.y + 11), 8.5f, *Value ? AtmAccent : AtmMuted, State);
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 12.0f));
}

double AtmDensity(const AtmosphereRecord& Atmosphere, double Altitude)
{
    const double Height = std::max(0.0, Altitude);
    return std::exp(-Height / std::max(1.0, Atmosphere.RayleighScaleHeightMetres));
}

double AtmAerosolDensity(const AtmosphereRecord& Atmosphere, double Altitude)
{
    const double Height = std::max(0.0, Altitude);
    return std::exp(-Height / std::max(1.0, Atmosphere.MieScaleHeightMetres));
}

void AtmosphereColumn(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    const float AvailableWidth = ImGui::GetContentRegionAvail().x;
    const float ExpectedPlotWidth = std::max(1.0f, AvailableWidth - 36.0f);
    const float ScanHeight = 176.0f + ExpectedPlotWidth * (520.0f / 640.0f);
    AtmCard(Context, "at_column", "Atmospheric column", "01 / DENSITY SCAN", ScanHeight);
    const ImVec2 Header = ImGui::GetCursorScreenPos();
    char Ray[32]{}, Mie[32]{}, Probe[32]{};
    const double RayleighDensity = AtmDensity(A, A.ProbeAltitudeMetres) * 100.0;
    const double AerosolDensity = AtmAerosolDensity(A, A.ProbeAltitudeMetres) * 100.0;
    std::snprintf(Ray, sizeof(Ray), "%.1f", RayleighDensity);
    std::snprintf(Mie, sizeof(Mie), "%.2f%%", AerosolDensity);
    std::snprintf(Probe, sizeof(Probe), "↗ %.1f km probe", A.ProbeAltitudeMetres / 1000.0);
    AtmText(Context, ImVec2(Header.x, Header.y + 6.0f), 9.0f, AtmMuted, "Relative molecular density");
    AtmText(Context, ImVec2(Header.x, Header.y + 20.0f), 43.0f, AtmInk, Ray, Context.Faces.Light);
    AtmText(Context, ImVec2(Header.x, Header.y + 68.0f), 9.0f, AtmMuted, "% of sea level");
    const float Width = ImGui::GetContentRegionAvail().x;
    const ImVec2 ProbeMin(Header.x + Width - 145.0f, Header.y + 11.0f);
    const ImVec2 ProbeMax(ProbeMin.x + 130.0f, ProbeMin.y + 30.0f);
    ImGui::GetWindowDrawList()->AddRectFilled(ProbeMin, ProbeMax, IM_COL32(46, 58, 38, 180), 15.0f);
    ImGui::GetWindowDrawList()->AddRect(ProbeMin, ProbeMax, IM_COL32(214, 227, 166, 38), 15.0f);
    AtmText(Context, ImVec2(ProbeMin.x + 9.0f, ProbeMin.y + 8.0f), 10.0f, AtmAccent, Probe);

    const float CardTop = Header.y - 50.0f;
    const ImVec2 AerosolMin(Header.x + Width - 124.0f, CardTop + ScanHeight * 0.57f);
    const ImVec2 AerosolMax(AerosolMin.x + 111.0f, AerosolMin.y + 62.0f);
    ImGui::GetWindowDrawList()->AddRectFilled(AerosolMin, AerosolMax, IM_COL32(37, 45, 34, 232), 15.0f);
    ImGui::GetWindowDrawList()->AddRect(AerosolMin, AerosolMax, IM_COL32(214, 227, 166, 24), 15.0f);
    AtmText(Context, ImVec2(AerosolMin.x + 12.0f, AerosolMin.y + 10.0f), 9.0f, AtmMuted, "Aerosol density");
    AtmText(Context, ImVec2(AerosolMin.x + 12.0f, AerosolMin.y + 28.0f), 22.0f, AtmInk, Mie, Context.Faces.Light);
    ImGui::SetCursorScreenPos(ImVec2(Header.x, CardTop + 34.0f));

    ImVec2 Origin; float PlotWidth = 0.0f;
    const float Height = ImGui::GetContentRegionAvail().x * (520.0f / 640.0f);
    AtmPlot("##at_column_diagram", Height, Origin, PlotWidth);
    const float SX = PlotWidth / 640.0f, SY = Height / 520.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + Height), true);
    const ImVec2 Centre = P(320, 453);
    const float Radius = 240.0f * SX;
    for (int32_t Sample = 60; Sample >= 0; --Sample)
    {
        const double Km = Sample * 0.5;
        const double RayleighDensity = AtmDensity(A, Km * 1000.0);
        const double MieDensity = AtmAerosolDensity(A, Km * 1000.0);
        const double Alpha = std::min(0.6, 0.025 + RayleighDensity * A.RayleighMultiplier * 0.19 + MieDensity * A.MieMultiplier * 0.08);
        Draw->AddCircle(Centre, Radius + float(Km) * 4.0f * SX,
                        IM_COL32(173, 207, 175, int(Alpha * 255.0)), 48, 1.0f * SX);
    }
    for (const float Km : {0.0f, 5.0f, 10.0f, 20.0f, 30.0f})
    {
        const float R = Radius + Km * 4.0f * SX;
        std::array<ImVec2, 65> Arc{};
        for (int32_t I = 0; I < 65; ++I)
        {
            const float Angle = -AtmPi + I / 64.0f * AtmPi;
            Arc[size_t(I)] = ImVec2(Centre.x + std::cos(Angle) * R, Centre.y + std::sin(Angle) * R);
        }
        for (int32_t I = 0; I < 64; I += 9)
        {
            const int32_t End = std::min(I + 2, 64);
            Draw->AddLine(Arc[size_t(I)], Arc[size_t(End)], IM_COL32(217, 228, 193, 42), 1.0f * SX);
        }
    }
    for (int32_t I = 63; I >= 0; --I)
    {
        const float T = I / 63.0f;
        const float Blend = T >= 0.5f ? (T - 0.5f) * 2.0f : T * 2.0f;
        const ImVec4 Inner(59.0f / 255.0f, 66.0f / 255.0f, 57.0f / 255.0f, 1.0f);
        const ImVec4 Middle(35.0f / 255.0f, 41.0f / 255.0f, 34.0f / 255.0f, 1.0f);
        const ImVec4 Outer(16.0f / 255.0f, 21.0f / 255.0f, 17.0f / 255.0f, 1.0f);
        const ImVec4 From = T >= 0.5f ? Middle : Inner;
        const ImVec4 To = T >= 0.5f ? Outer : Middle;
        const ImVec4 Colour(From.x + (To.x - From.x) * Blend, From.y + (To.y - From.y) * Blend,
                            From.z + (To.z - From.z) * Blend, 1.0f);
        Draw->AddCircleFilled(Centre, Radius * T,
                              IM_COL32(int(Colour.x * 255.0f), int(Colour.y * 255.0f), int(Colour.z * 255.0f), 255), 64);
    }
    Draw->AddCircle(Centre, Radius, IM_COL32(180, 197, 153, 86), 64, 1.0f * SX);
    for (const float R : {65.0f, 120.0f, 180.0f})
        Draw->AddEllipse(Centre, ImVec2(R * SX, Radius), IM_COL32(172, 186, 152, 21), 0.0f, 64, 1.0f * SX);
    for (const float R : {70.0f, 140.0f, 210.0f})
        Draw->AddEllipse(Centre, ImVec2(Radius, R * SY), IM_COL32(172, 186, 152, 21), 0.0f, 64, 1.0f * SX);
    const float ProbeRadius = Radius + float(A.ProbeAltitudeMetres / 1000.0) * 4.0f * SX;
    const ImVec2 Point(Centre.x + std::cos(-1.17f) * ProbeRadius, Centre.y + std::sin(-1.17f) * ProbeRadius);
    std::array<ImVec2, 65> ProbeArc{};
    for (int32_t I = 0; I < 65; ++I)
    {
        const float Angle = -2.4f + I / 64.0f * 1.8f;
        ProbeArc[size_t(I)] = ImVec2(Centre.x + std::cos(Angle) * ProbeRadius,
                                     Centre.y + std::sin(Angle) * ProbeRadius);
    }
    Draw->AddPolyline(ProbeArc.data(), int(ProbeArc.size()), IM_COL32(212, 233, 155, 153), ImDrawFlags_None, 1.5f * SX);
    Draw->AddLine(Point, ImVec2(Origin.x + 555 * SX, Point.y - 40 * SY), IM_COL32(212, 233, 155, 145), 1.2f * SX);
    Draw->AddLine(ImVec2(Origin.x + 555 * SX, Point.y - 40 * SY), ImVec2(Origin.x + 595 * SX, Point.y - 40 * SY), IM_COL32(212, 233, 155, 145), 1.2f * SX);
    Draw->AddCircle(Point, 17 * SX, IM_COL32(212, 233, 155, 90), 32, 1.1f * SX);
    Draw->AddCircleFilled(Point, 5 * SX, IM_COL32(227, 239, 197, 255), 24);
    Draw->AddLine(ImVec2(Point.x - 25 * SX, Point.y), ImVec2(Point.x + 25 * SX, Point.y), IM_COL32(212, 233, 155, 85), 1.0f * SX);
    Draw->AddLine(ImVec2(Point.x, Point.y - 25 * SY), ImVec2(Point.x, Point.y + 25 * SY), IM_COL32(212, 233, 155, 85), 1.0f * SX);
    char Altitude[32]{}; std::snprintf(Altitude, sizeof(Altitude), "%.1f km", A.ProbeAltitudeMetres / 1000.0);
    const float AltitudeFontSize = 21.0f * SX;
    AtmText(Context, ImVec2(Origin.x + 595 * SX - KitTextWidth(Context.Faces.Regular, AltitudeFontSize, Altitude),
                            Origin.y + (Point.y - Origin.y) - 52 * SY), AltitudeFontSize, AtmInk, Altitude);
    AtmText(Context, P(36, 480), 19.0f * SX, AtmMuted, "GROUND / Z = 0");
    Draw->PopClipRect();
    if (ImGui::IsItemActive())
    {
        const ImVec2 Mouse = ImGui::GetIO().MousePos;
        const double Value = (std::hypot((Mouse.x - Centre.x) / SX, (Mouse.y - Centre.y) / SY) - 240.0) / 4.0 * 1000.0;
        A.ProbeAltitudeMetres = std::clamp(std::round(Value / 500.0) * 500.0, 0.0, 30000.0);
    }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) A.ProbeAltitudeMetres = 0.0;
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow) || ImGui::IsKeyPressed(ImGuiKey_RightArrow)) A.ProbeAltitudeMetres = std::min(30000.0, A.ProbeAltitudeMetres + 500.0);
        if (ImGui::IsKeyPressed(ImGuiKey_DownArrow) || ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) A.ProbeAltitudeMetres = std::max(0.0, A.ProbeAltitudeMetres - 500.0);
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Atmosphere altitude probe · drag shell or use arrow keys");
    double Alt = A.ProbeAltitudeMetres;
    if (AtmField(Context, "Probe altitude", &Alt, 0.0, 30000.0, "%.4f km", 0.5, 0.001)) A.ProbeAltitudeMetres = Alt;
    AtmNote(Context, "Exaggerated shell diagram · relative density, not a rendered planet. Probe changes this diagnostic only.", 37.0f);
    AtmEndCard();
}

void AtmosphereRecipe(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const ImVec2 Start = ImGui::GetCursorScreenPos();
    ImGui::GetWindowDrawList()->AddLine(Start, ImVec2(Start.x + Width, Start.y), IM_COL32(214, 227, 166, 26), 1.0f);
    AtmText(Context, ImVec2(Start.x, Start.y + 19.0f), 14.0f, AtmInk, "Medium recipe", Context.Faces.Regular);
    const char* Subtitle = "LIVE COEFFICIENTS";
    AtmText(Context, ImVec2(Start.x + Width - KitTextWidth(Context.Faces.Medium, 8.0f, Subtitle), Start.y + 22.0f),
            8.0f, AtmMuted, Subtitle, Context.Faces.Medium);
    ImGui::SetCursorScreenPos(ImVec2(Start.x, Start.y + 54.0f));
    const std::array<const char*, 3> Marks{"R", "M", "O₃"};
    const std::array<const char*, 3> Labels{"Molecular scattering", "Aerosol haze", "Ozone absorption"};
    const std::array<const char*, 3> Notes{"Air molecules", "Suspended particles", "Selective absorption"};
    const std::array<ImU32, 3> Tints{IM_COL32(146, 187, 163, 38), IM_COL32(212, 183, 127, 38), IM_COL32(183, 162, 204, 38)};
    const std::array<ImU32, 3> Inks{IM_COL32(184, 211, 189, 255), IM_COL32(222, 207, 168, 255), IM_COL32(207, 192, 223, 255)};
    std::array<double*, 3> Values{&A.RayleighMultiplier, &A.MieMultiplier, &A.OzoneMultiplier};
    const std::array<double, 3> Maxima{3.0, 6.0, 4.0};
    const std::array<double, 3> Steps{0.01, 0.01, 0.01};
    for (size_t I = 0; I < Labels.size(); ++I)
    {
        const ImVec2 Row = ImGui::GetCursorScreenPos();
        ImGui::GetWindowDrawList()->AddRectFilled(Row, ImVec2(Row.x + 33.0f, Row.y + 45.0f), Tints[I], 20.0f);
        AtmText(Context, ImVec2(Row.x + 10.0f, Row.y + 13.0f), 15.0f, Inks[I], Marks[I], Context.Faces.Medium);
        ImGui::SetCursorScreenPos(ImVec2(Row.x + 49.0f, Row.y));
        char FieldLabel[64]{}; std::snprintf(FieldLabel, sizeof(FieldLabel), "%s", Labels[I]);
        AtmField(Context, FieldLabel, Values[I], 0.0, Maxima[I], "%.2f×", Steps[I]);
        AtmText(Context, ImVec2(Row.x + 49.0f, Row.y + 60.0f), 9.0f, AtmMuted, Notes[I]);
        ImGui::SetCursorScreenPos(ImVec2(Row.x, Row.y + 99.0f));
    }
    ImGui::Dummy(ImVec2(Width, 24.0f));
}

void AtmosphereOverview(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    AtmosphereColumn(Context, A);
    AtmosphereRecipe(Context, A);
    const float Width = ImGui::GetContentRegionAvail().x, Gap = 7.0f, Cell = (Width - 2.0f * Gap) / 3.0f;
    const ImVec2 Start = ImGui::GetCursorScreenPos();
    const std::array<const char*, 3> Labels{"Rayleigh", "Mie", "Ozone"};
    const std::array<double, 3> Values{A.RayleighMultiplier, A.MieMultiplier, A.OzoneMultiplier};
    const std::array<const char*, 3> Units{"× molecules", "× aerosols", "× absorption"};
    for (int32_t I = 0; I < 3; ++I)
    {
        const ImVec2 Min(Start.x + I * (Cell + Gap), Start.y), Max(Min.x + Cell, Min.y + 71.0f);
        ImGui::GetWindowDrawList()->AddRectFilled(Min, Max, IM_COL32(39, 44, 38, 255), 11.0f);
        char V[24]{}; std::snprintf(V, sizeof(V), "%.2f", Values[size_t(I)]);
        AtmText(Context, ImVec2(Min.x + 9, Min.y + 10), 7.5f, AtmMuted, Labels[size_t(I)]);
        AtmText(Context, ImVec2(Min.x + 9, Min.y + 26), 18.0f, AtmInk, V, Context.Faces.Light);
        AtmText(Context, ImVec2(Min.x + 9, Min.y + 54), 7.0f, AtmMuted, Units[size_t(I)]);
    }
    ImGui::Dummy(ImVec2(Width, 83.0f));
    const float SkyPlotWidth = std::max(1.0f, ImGui::GetContentRegionAvail().x - 36.0f);
    const float SkyCardHeight = 153.0f + SkyPlotWidth * (340.0f / 640.0f);
    AtmCard(Context, "at_sky_capture", "Sky-view capture", "GPU / SCATTERING", SkyCardHeight);
    const float PlotWidth = ImGui::GetContentRegionAvail().x;
    const ImVec2 At = ImGui::GetCursorScreenPos();
    char Revision[32]{}; std::snprintf(Revision, sizeof(Revision), "%u", A.LutRevision);
    AtmText(Context, At, 9.0f, AtmMuted, "Lookup revision");
    AtmText(Context, ImVec2(At.x + 82.0f, At.y - 1.0f), 13.0f, AtmInk, Revision, Context.Faces.Medium);
    AtmText(Context, ImVec2(At.x + PlotWidth - KitTextWidth(Context.Faces.Medium, 8.0f, "GPU / RGBA16F"), At.y + 1.0f),
            8.0f, AtmAccent, "GPU / RGBA16F", Context.Faces.Medium);
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 25.0f));
    const ImVec2 PreviewAt = ImGui::GetCursorScreenPos();
    const float PreviewHeight = PlotWidth * (340.0f / 640.0f);
    ImGui::InvisibleButton("##at_sky_capture_placeholder", ImVec2(PlotWidth, PreviewHeight));
    ImGui::GetWindowDrawList()->AddRectFilled(PreviewAt, ImVec2(PreviewAt.x + PlotWidth, PreviewAt.y + PreviewHeight), IM_COL32(12, 15, 18, 255), 10.0f);
    ImGui::GetWindowDrawList()->AddRect(PreviewAt, ImVec2(PreviewAt.x + PlotWidth, PreviewAt.y + PreviewHeight), IM_COL32(186, 202, 181, 28), 10.0f);
    const char* Placeholder = A.OpticalDepthLut.Baked()
                                  ? "No baked GPU image · analytic sky remains active"
                                  : "Bake the atmosphere to see the actual HDR image here. No substitute illustration.";
    const float TextWidth = KitTextWidth(Context.Faces.Regular, 9.5f, Placeholder);
    AtmText(Context, ImVec2(PreviewAt.x + std::max(12.0f, (PlotWidth - TextWidth) * 0.5f), PreviewAt.y + PreviewHeight * 0.5f - 6.0f),
            9.5f, AtmMuted, Placeholder);
    ImGui::Dummy(ImVec2(PlotWidth, 8.0f));
    AtmNote(Context, "Decoded sky-view GPU pixels · tone-mapped diagnostic, not a scene camera. Sun disc, stars, Moon and fog are excluded.", 46.0f);
    AtmEndCard();
}

void AtmosphereMedium(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    const float FalloffPlotWidth = std::max(1.0f, ImGui::GetContentRegionAvail().x - 36.0f);
    const float FalloffPlotHeight = FalloffPlotWidth * (430.0f / 640.0f);
    AtmCard(Context, "at_falloff", "How the air thins", "SCALE-HEIGHT COMPARATOR", 300.0f + FalloffPlotHeight);
    const float Width = ImGui::GetContentRegionAvail().x;
    ImVec2 Origin; float PlotWidth = 0.0f;
    const float Height = Width * (430.0f / 640.0f);
    AtmPlot("##at_scale_comparison", Height, Origin, PlotWidth);
    const float SX = PlotWidth / 640.0f, SY = Height / 430.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + Height), true);
    Draw->AddRectFilledMultiColor(Origin, ImVec2(Origin.x + PlotWidth, Origin.y + Height),
                                  IM_COL32(146, 187, 163, 8), IM_COL32(0, 0, 0, 0),
                                  IM_COL32(212, 183, 127, 8), IM_COL32(0, 0, 0, 0));
    for (int32_t Km = 0; Km <= 20; Km += 5)
    {
        const float Y = 350.0f - Km / 20.0f * 295.0f;
        Draw->AddLine(P(28, Y), P(280, Y), IM_COL32(176, 198, 170, 24), 1.0f * SX);
        Draw->AddLine(P(360, Y), P(612, Y), IM_COL32(176, 198, 170, 24), 1.0f * SX);
        char Label[12]{}; std::snprintf(Label, sizeof(Label), "%d", Km);
        AtmText(Context, P(320, Y + 4), 20.0f * SX, AtmMuted, Label);
    }
    AtmText(Context, P(320, 25), 20.0f * SX, AtmMuted, "km");
    const std::array<double, 2> Heights{A.RayleighScaleHeightMetres, A.MieScaleHeightMetres};
    const std::array<ImU32, 2> Colours{IM_COL32(184, 211, 189, 255), IM_COL32(222, 207, 168, 255)};
    const std::array<ImU32, 2> Fills{IM_COL32(146, 187, 163, 36), IM_COL32(212, 183, 127, 32)};
    for (int32_t Medium = 0; Medium < 2; ++Medium)
    {
        const float CenterX = Medium == 0 ? 280.0f : 360.0f;
        const float Sign = Medium == 0 ? -1.0f : 1.0f;
        std::array<ImVec2, 101> Points{};
        std::array<ImVec2, 103> FillPoints{};
        FillPoints[0] = P(CenterX, 350.0f);
        for (int32_t I = 0; I <= 100; ++I)
        {
            const double Altitude = I / 100.0 * 20000.0;
            const double Density = std::exp(-Altitude / Heights[size_t(Medium)]);
            Points[size_t(I)] = P(CenterX + Sign * float(Density) * 235.0f, 350.0f - float(Altitude / 20000.0 * 295.0));
            FillPoints[size_t(I + 1)] = Points[size_t(I)];
        }
        FillPoints.back() = P(CenterX, 55.0f);
        Draw->AddConvexPolyFilled(FillPoints.data(), int(FillPoints.size()), Fills[size_t(Medium)]);
        Draw->AddPolyline(Points.data(), int(Points.size()), Colours[size_t(Medium)], ImDrawFlags_None, 2.5f * SX);
        Draw->AddLine(P(CenterX, 55), P(CenterX, 350), IM_COL32(176, 198, 170, 52), 1.0f * SX);
        const float MarkerY = 350.0f - float(Heights[size_t(Medium)] / 20000.0 * 295.0);
        const float MarkerX = CenterX + Sign * 0.367879441f * 235.0f;
        Draw->AddLine(P(CenterX, MarkerY), P(MarkerX, MarkerY), Colours[size_t(Medium)], 1.0f * SX);
        Draw->AddCircleFilled(P(MarkerX, MarkerY), 12.0f * SX, IM_COL32(20, 27, 18, 255), 24);
        Draw->AddCircle(P(MarkerX, MarkerY), 12.0f * SX, Colours[size_t(Medium)], 24, 1.0f * SX);
        Draw->AddCircleFilled(P(MarkerX, MarkerY), 4.0f * SX, Colours[size_t(Medium)], 24);
        char H[24]{}; std::snprintf(H, sizeof(H), "%.1f km", Heights[size_t(Medium)] / 1000.0);
        AtmText(Context, Medium == 0 ? P(40, 402) : P(600 - KitTextWidth(Context.Faces.Regular, 30.0f * SX, H) / SX, 402),
                30.0f * SX, Colours[size_t(Medium)], H);
    }
    AtmText(Context, P(254, 402), 17.0f * SX, AtmMuted, "1/e HEIGHT");
    Draw->PopClipRect();
    static constexpr ImGuiID SelectedMediumId = 0x41544d31u;
    ImGuiStorage* MediumStorage = ImGui::GetStateStorage();
    bool SelectedMie = MediumStorage->GetBool(SelectedMediumId, false);
    if (ImGui::IsItemActive())
    {
        const ImVec2 Mouse = ImGui::GetIO().MousePos;
        const float X = (Mouse.x - Origin.x) / SX, Y = (Mouse.y - Origin.y) / SY;
        SelectedMie = X >= 320.0f;
        MediumStorage->SetBool(SelectedMediumId, SelectedMie);
        const double RawHeight = (350.0 - Y) / 295.0 * 20000.0;
        const double SnappedHeight = std::round(RawHeight / 100.0) * 100.0;
        if (SelectedMie) A.MieScaleHeightMetres = std::clamp(SnappedHeight, 500.0, 8000.0);
        else A.RayleighScaleHeightMetres = std::clamp(SnappedHeight, 1000.0, 16000.0);
    }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) { SelectedMie = false; MediumStorage->SetBool(SelectedMediumId, false); }
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) { SelectedMie = true; MediumStorage->SetBool(SelectedMediumId, true); }
        double& SelectedHeight = SelectedMie ? A.MieScaleHeightMetres : A.RayleighScaleHeightMetres;
        const double MinimumHeight = SelectedMie ? 500.0 : 1000.0;
        const double MaximumHeight = SelectedMie ? 8000.0 : 16000.0;
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) SelectedHeight = SelectedMie ? 1200.0 : 8000.0;
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow)) SelectedHeight = std::min(MaximumHeight, SelectedHeight + 100.0);
        if (ImGui::IsKeyPressed(ImGuiKey_DownArrow)) SelectedHeight = std::max(MinimumHeight, SelectedHeight - 100.0);
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Scale height comparator · drag left for Rayleigh or right for Mie");
    double RayH = A.RayleighScaleHeightMetres;
    if (AtmField(Context, "Rayleigh scale height", &RayH, 1000.0, 16000.0, "%.0f m", 100.0)) A.RayleighScaleHeightMetres = RayH;
    double MieH = A.MieScaleHeightMetres;
    if (AtmField(Context, "Mie scale height", &MieH, 500.0, 8000.0, "%.0f m", 100.0)) A.MieScaleHeightMetres = MieH;
    AtmNote(Context, "Drag either ribbon to edit its scale height. Markers sit at 36.8% of sea-level density. Each ribbon is normalised separately.", 54.0f);
    AtmEndCard();

    AtmCard(Context, "at_constituents", "Constituents", "SEA-LEVEL MULTIPLIERS", 320.0f);
    double Ray = A.RayleighMultiplier;
    if (AtmField(Context, "Rayleigh multiplier", &Ray, 0.0, 3.0, "%.2f×")) A.RayleighMultiplier = Ray;
    double Mie = A.MieMultiplier;
    if (AtmField(Context, "Mie multiplier", &Mie, 0.0, 6.0, "%.2f×")) A.MieMultiplier = Mie;
    double Ozone = A.OzoneMultiplier;
    if (AtmField(Context, "Ozone multiplier", &Ozone, 0.0, 4.0, "%.2f×")) A.OzoneMultiplier = Ozone;
    AtmEndCard();

    const float PhasePlotWidth = std::max(1.0f, ImGui::GetContentRegionAvail().x - 36.0f);
    const float PhaseCardHeight = 212.0f + PhasePlotWidth * (340.0f / 640.0f);
    AtmCard(Context, "at_phase", "Where light scatters", "DIRECTIONAL RESPONSE", PhaseCardHeight);
    ImVec2 PhaseOrigin; float PhaseWidth = 0.0f;
    const float PhaseHeight = ImGui::GetContentRegionAvail().x * (340.0f / 640.0f);
    AtmPlot("##at_phase_shape", PhaseHeight, PhaseOrigin, PhaseWidth);
    const float PSX = PhaseWidth / 640.0f, PSY = PhaseHeight / 340.0f;
    const ImVec2 Center(PhaseOrigin.x + 320.0f * PSX, PhaseOrigin.y + 165.0f * PSY);
    ImDrawList* PhaseDraw = ImGui::GetWindowDrawList();
    PhaseDraw->PushClipRect(PhaseOrigin, ImVec2(PhaseOrigin.x + PhaseWidth, PhaseOrigin.y + PhaseHeight), true);
    PhaseDraw->AddRectFilled(PhaseOrigin, ImVec2(PhaseOrigin.x + PhaseWidth, PhaseOrigin.y + PhaseHeight), IM_COL32(22, 27, 22, 255), 10.0f);
    for (const float R : {45.0f, 90.0f, 135.0f}) PhaseDraw->AddCircle(Center, R * PSX, IM_COL32(174, 188, 152, 26), 48, 1.0f);
    PhaseDraw->AddLine(ImVec2(PhaseOrigin.x + 40 * PSX, Center.y), ImVec2(PhaseOrigin.x + 600 * PSX, Center.y), IM_COL32(174, 188, 152, 48), 1.0f);
    const double G = std::clamp(A.MieAnisotropyG, -0.95, 0.95);
    std::array<ImVec2, 361> Phase{};
    for (int32_t I = 0; I <= 360; ++I)
    {
        const double Angle = I / 360.0 * 2.0 * double(AtmPi);
        const double Denom = 1.0 + G * G - 2.0 * G * std::cos(Angle);
        const double Radius = std::sqrt(std::pow((1.0 - std::abs(G)) * (1.0 - std::abs(G)) / Denom, 1.5)) * 135.0;
        Phase[size_t(I)] = ImVec2(Center.x + std::cos(Angle) * float(Radius) * PSX,
                                  Center.y + std::sin(Angle) * float(Radius) * PSY);
    }
    Draw->AddPolyline(Phase.data(), int(Phase.size()), AtmAccent, ImDrawFlags_None, 2.0f);
    AtmText(Context, ImVec2(PhaseOrigin.x + 40 * PSX, PhaseOrigin.y + 320 * PSY), 8.0f, AtmMuted, "INCIDENT LIGHT →");
    const char* Forward = "FORWARD →";
    AtmText(Context, ImVec2(PhaseOrigin.x + 600 * PSX - KitTextWidth(Context.Faces.Regular, 8.0f, Forward), PhaseOrigin.y + 320 * PSY), 8.0f, AtmMuted, Forward);
    PhaseDraw->PopClipRect();
    double Anisotropy = A.MieAnisotropyG;
    if (AtmField(Context, "Mie anisotropy", &Anisotropy, -0.95, 0.95, "%.2f g")) A.MieAnisotropyG = Anisotropy;
    AtmNote(Context, "Normalised phase reference, not radiance. Squared plot radius represents relative phase strength; positive g favours forward scattering.", 52.0f);
    AtmEndCard();
}

void AtmOpticalSwitch(GlobalInspectorPresentationContext& Context, const char* Label, bool* Value)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Label);
    const bool Clicked = ImGui::InvisibleButton("##at_optical_switch", ImVec2(Width, 43.0f));
    if (Clicked) *Value = !*Value;
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddLine(At, ImVec2(At.x + Width, At.y), IM_COL32(214, 227, 166, 11), 1.0f);
    AtmText(Context, ImVec2(At.x, At.y + 15.0f), 10.0f, AtmMuted, Label);
    const ImVec2 SwitchMin(At.x + Width - 30.0f, At.y + 13.0f);
    const ImVec2 SwitchMax(SwitchMin.x + 30.0f, SwitchMin.y + 17.0f);
    Draw->AddRectFilled(SwitchMin, SwitchMax, *Value ? IM_COL32(202, 219, 162, 255) : IM_COL32(66, 75, 56, 255), 9.0f);
    Draw->AddCircleFilled(ImVec2(SwitchMin.x + (*Value ? 22.0f : 8.0f), SwitchMin.y + 8.5f),
                          5.5f, *Value ? IM_COL32(57, 67, 44, 255) : IM_COL32(171, 182, 155, 255), 20);
    ImGui::PopID();
}

void AtmColorWell(GlobalInspectorPresentationContext& Context, const char* Label,
                  std::array<double, 3>& Value, const char* Subtitle, float Width, float Height)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    ImGui::PushID(Label);
    const bool Clicked = ImGui::InvisibleButton("##color_well", ImVec2(Width, Height));
    const bool Hovered = ImGui::IsItemHovered();
    if (Clicked) ImGui::OpenPopup("##color_picker");
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(At, ImVec2(At.x + Width, At.y + Height), IM_COL32(37, 43, 34, 255), 20.0f);
    Draw->AddRect(At, ImVec2(At.x + Width, At.y + Height), IM_COL32(214, 227, 166, 12), 20.0f);
    const ImU32 Swatch = IM_COL32(int(std::pow(Value[0], 1.0 / 2.2) * 255), int(std::pow(Value[1], 1.0 / 2.2) * 255), int(std::pow(Value[2], 1.0 / 2.2) * 255), 255);
    Draw->AddCircleFilled(ImVec2(At.x + 39.0f, At.y + 40.0f), 22.5f, Swatch, 40);
    Draw->AddCircle(ImVec2(At.x + 39.0f, At.y + 40.0f), 29.0f, IM_COL32(255, 255, 255, 12), 40, 1.0f);
    AtmText(Context, ImVec2(At.x + 16.0f, At.y + 76.0f), 11.0f, AtmInk, Label);
    AtmText(Context, ImVec2(At.x + 16.0f, At.y + 95.0f), 9.0f, AtmMuted, Subtitle);
    char Hex[16]{}; std::snprintf(Hex, sizeof(Hex), "#%02X%02X%02X", int(std::clamp(Value[0],0.0,1.0)*255), int(std::clamp(Value[1],0.0,1.0)*255), int(std::clamp(Value[2],0.0,1.0)*255));
    AtmText(Context, ImVec2(At.x + 16.0f, At.y + Height - 23.0f), 10.0f, AtmMuted, Hex, Context.Faces.Medium);
    if (Hovered) ImGui::SetTooltip("%s", Label);
    if (ImGui::BeginPopup("##color_picker"))
    {
        float RGB[3]{float(std::pow(Value[0], 1.0 / 2.2)), float(std::pow(Value[1], 1.0 / 2.2)), float(std::pow(Value[2], 1.0 / 2.2))};
        if (ImGui::ColorPicker3(Label, RGB, ImGuiColorEditFlags_DisplayRGB | ImGuiColorEditFlags_Float))
        {
            for (size_t I = 0; I < 3; ++I) Value[I] = std::pow(std::clamp(double(RGB[I]), 0.0, 1.0), 2.2);
        }
        ImGui::EndPopup();
    }
    ImGui::PopID();
}

void AtmosphereLight(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    const float TransmissionPlotWidth = std::max(1.0f, ImGui::GetContentRegionAvail().x - 36.0f);
    const float TransmissionPlotHeight = TransmissionPlotWidth * (330.0f / 640.0f);
    AtmCard(Context, "at_transmission", "Light through air", "TRANSMISSION", 320.0f + TransmissionPlotHeight, true);
    const char* Status = !A.AtmosphereEnabled ? "Atmosphere off · reference only" : !A.AirMassEnabled ? "Attenuation bypassed · reference only" : "Direct sunlight · linked";
    AtmText(Context, ImGui::GetCursorScreenPos(), 8.5f, AtmMuted, Status);
    ImGui::Dummy(ImVec2(0.0f, 19.0f));
    ImVec2 Origin; float Width = 0.0f;
    const float Height = ImGui::GetContentRegionAvail().x * (330.0f / 640.0f);
    AtmPlot("##at_transmission_dial", Height, Origin, Width);
    const float SX = Width / 640.0f, SY = Height / 330.0f;
    const SpectrumRgb T = A.EvaluateSolarTransmittance(Context.ReferenceSunElevationDegrees, Context.ReferenceSunAzimuthDegrees);
    const std::array<double,3> Channels{T.R,T.G,T.B};
    const std::array<ImU32,3> Colours{IM_COL32(210,164,155,255),IM_COL32(182,204,156,255),IM_COL32(164,198,215,255)};
    const ImVec2 Center(Origin.x + 320*SX, Origin.y + 250*SY);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->PushClipRect(Origin, ImVec2(Origin.x + Width, Origin.y + Height), true);
    for (int32_t I = 0; I < 3; ++I)
    {
        const float Radius = (209.0f - I * 31.0f) * SX;
        std::array<ImVec2, 97> Arc{};
        for (int32_t J = 0; J < 97; ++J)
        {
            const float F = J / 96.0f;
            const float Angle = AtmPi + F * AtmPi;
            Arc[size_t(J)] = ImVec2(Center.x + std::cos(Angle)*Radius, Center.y + std::sin(Angle)*Radius);
        }
        Draw->AddPolyline(Arc.data(), int(Arc.size()), IM_COL32(197,207,188,19), ImDrawFlags_None, 8.0f*SX);
        const int Count = std::clamp(int(Channels[size_t(I)] * 96), 0, 96);
        if (Count > 0) Draw->AddPolyline(Arc.data(), Count + 1, Colours[size_t(I)], ImDrawFlags_None, 8.0f*SX);
        if (Channels[size_t(I)] > 0.0 && Count < 96) Draw->AddCircleFilled(Arc[size_t(Count)], 5.0f*SX, Colours[size_t(I)], 16);
    }
    AtmText(Context, ImVec2(Origin.x+96*SX,Origin.y+290*SY),20.0f*SX,AtmMuted,"0%");
    AtmText(Context, ImVec2(Origin.x+544*SX,Origin.y+290*SY),20.0f*SX,AtmMuted,"100%");
    const double Neutral = Channels[0]*0.2126+Channels[1]*0.7152+Channels[2]*0.0722;
    char NeutralText[24]{}; std::snprintf(NeutralText,sizeof(NeutralText),"%.1f%%",Neutral*100.0);
    const float NeutralFontSize = 38.0f * SX;
    const float NVWidth = KitTextWidth(Context.Faces.Light,NeutralFontSize,NeutralText);
    AtmText(Context,ImVec2(Center.x-NVWidth*.5f,Center.y-8.0f*SY),NeutralFontSize,AtmInk,NeutralText,Context.Faces.Light);
    AtmText(Context,ImVec2(Center.x-62.0f*SX,Center.y+35.0f*SY),9.0f*SX,AtmMuted,"neutral-light transmission");
    Draw->PopClipRect();

    const ImVec2 OutputsAt = ImGui::GetCursorScreenPos();
    Draw->AddLine(OutputsAt, ImVec2(OutputsAt.x + Width, OutputsAt.y), IM_COL32(214, 227, 166, 16), 1.0f);
    const std::array<const char*,3> Names{"Red","Green","Blue"};
    for (int32_t I = 0; I < 3; ++I)
    {
        const float CellX = OutputsAt.x + Width * (I / 3.0f);
        if (I > 0) Draw->AddLine(ImVec2(CellX, OutputsAt.y + 9.0f), ImVec2(CellX, OutputsAt.y + 58.0f), IM_COL32(255,255,255,18), 1.0f);
        char ChannelValue[24]{}; std::snprintf(ChannelValue,sizeof(ChannelValue),"%.1f%%",Channels[size_t(I)]*100.0);
        AtmText(Context,ImVec2(CellX + 2.0f,OutputsAt.y + 11.0f),10.0f,AtmMuted,Names[size_t(I)]);
        AtmText(Context,ImVec2(CellX + 2.0f,OutputsAt.y + 29.0f),20.0f,Colours[size_t(I)],ChannelValue,Context.Faces.Light);
    }
    ImGui::Dummy(ImVec2(Width, 67.0f));
    Draw->AddLine(ImGui::GetCursorScreenPos(), ImVec2(OutputsAt.x + Width, ImGui::GetCursorScreenPos().y), IM_COL32(214, 227, 166, 16), 1.0f);
    char Observer[48]{};std::snprintf(Observer,sizeof(Observer),"Sun / %.1f°",Context.ReferenceSunElevationDegrees);
    const ImVec2 ObserverAt=ImGui::GetCursorScreenPos();
    AtmText(Context,ObserverAt,9.0f,AtmMuted,Observer);
    const char* ObserverHeight="Observer / 100 m";
    AtmText(Context,ImVec2(ObserverAt.x+Width-KitTextWidth(Context.Faces.Regular,9.0f,ObserverHeight),ObserverAt.y),9.0f,AtmMuted,ObserverHeight);
    ImGui::Dummy(ImVec2(Width, 14.0f));
    AtmNote(Context,"Isolated atmosphere, neutral RGB source. Centre value is luminance-weighted transmission; excludes clouds and source tint.",42.0f);
    AtmOpticalSwitch(Context,"Apply air-mass attenuation",&A.AirMassEnabled);
    AtmOpticalSwitch(Context,"Multiple scattering",&A.MultipleScatteringEnabled);
    AtmEndCard();

    AtmCard(Context,"at_finish","Sky & surface","LINEAR RGB TINTS",385.0f);
    const float WellWidth = (ImGui::GetContentRegionAvail().x - 10.0f) * 0.5f;
    const ImVec2 WellsAt = ImGui::GetCursorScreenPos();
    ImGui::SetCursorScreenPos(ImVec2(WellsAt.x, WellsAt.y + 19.0f));
    AtmColorWell(Context,"Sky Tint",A.SkyTintRgb,"Scattered sky",WellWidth,152.0f);
    ImGui::SetCursorScreenPos(ImVec2(WellsAt.x + WellWidth + 10.0f, WellsAt.y + 19.0f));
    AtmColorWell(Context,"Ground Albedo",A.GroundAlbedoRgb,"Ground bounce",WellWidth,152.0f);
    ImGui::SetCursorScreenPos(ImVec2(WellsAt.x, WellsAt.y + 188.0f));
    double Brightness=A.SkyBrightnessScale;
    if(AtmField(Context,"Sky brightness",&Brightness,0.0,3.0,"%.2f×"))A.SkyBrightnessScale=Brightness;
    AtmNote(Context,"Ground albedo feeds the existing multiple-scattering closure; these wells are source colours, not a camera preview.",40.0f);
    AtmEndCard();

    const ImVec2 HorizonAt = ImGui::GetCursorScreenPos();
    const float HorizonWidth = ImGui::GetContentRegionAvail().x;
    const ImGuiID HorizonId = ImGui::GetID("at_horizon_drawer");
    ImGuiStorage* Storage = ImGui::GetStateStorage();
    bool HorizonOpen = Storage->GetBool(HorizonId, false);
    ImGui::GetWindowDrawList()->AddLine(HorizonAt, ImVec2(HorizonAt.x + HorizonWidth, HorizonAt.y), IM_COL32(214, 227, 166, 26), 1.0f);
    if (ImGui::InvisibleButton("##at_horizon_drawer", ImVec2(HorizonWidth, 45.0f)))
    {
        HorizonOpen = !HorizonOpen;
        Storage->SetBool(HorizonId, HorizonOpen);
    }
    AtmText(Context, ImVec2(HorizonAt.x, HorizonAt.y + 15.0f), 12.0f,
            HorizonOpen ? AtmInk : AtmMuted, HorizonOpen ? "Horizon shaping  ↘" : "Horizon shaping  ↗", Context.Faces.Regular);
    ImGui::GetWindowDrawList()->AddLine(ImVec2(HorizonAt.x, HorizonAt.y + 44.0f),
                                        ImVec2(HorizonAt.x + HorizonWidth, HorizonAt.y + 44.0f),
                                        IM_COL32(214, 227, 166, 26), 1.0f);
    if (HorizonOpen)
    {
        ImGui::Dummy(ImVec2(HorizonWidth, 12.0f));
        double Horizon=A.HorizonGlow;if(AtmField(Context,"Horizon glow",&Horizon,0.0,3.0,"%.2f×"))A.HorizonGlow=Horizon;
        double White=A.WhiteLine;if(AtmField(Context,"White line",&White,0.0,3.0,"%.2f×"))A.WhiteLine=White;
        AtmToggle(Context,"Civil twilight only",&A.CivilTwilightLineEnabled);
    }

    ImGui::Dummy(ImVec2(0.0f, 18.0f));
    AtmCard(Context,"at_integration","Integration","GPU LOOKUP QUALITY",160.0f);
    double Samples=A.SkySampleBudget;if(AtmField(Context,"Sky LUT samples",&Samples,8.0,64.0,"%.0f samples"))A.SkySampleBudget=int32_t(std::round(Samples));
    AtmEndCard();
}

void AtmosphereBaking(GlobalInspectorPresentationContext& Context, AtmosphereRecord& A)
{
    AtmCard(Context,"at_bake","Atmosphere bake","",225.0f);
    const ImVec2 BakeAt = ImGui::GetCursorScreenPos();
    const float BakeWidth = ImGui::GetContentRegionAvail().x;
    const float TileWidth = std::min(120.0f, std::max(96.0f, BakeWidth * 0.24f));
    const float ActionWidth = std::min(158.0f, std::max(112.0f, BakeWidth - TileWidth - 14.0f));
    ImGui::PushID("at_bake_toggle");
    const bool ToggleClicked = ImGui::InvisibleButton("##use_baked_tile", ImVec2(TileWidth, 92.0f));
    const bool ToggleHovered = ImGui::IsItemHovered();
    if (ToggleClicked) A.UseBakedAtmosphere = !A.UseBakedAtmosphere;
    const ImU32 TileFill = ToggleHovered ? IM_COL32(47, 48, 42, 255) : IM_COL32(32, 34, 30, 255);
    ImGui::GetWindowDrawList()->AddRectFilled(BakeAt, ImVec2(BakeAt.x + TileWidth, BakeAt.y + 92.0f), TileFill, 15.0f);
    ImGui::GetWindowDrawList()->AddRect(BakeAt, ImVec2(BakeAt.x + TileWidth, BakeAt.y + 92.0f),
        A.UseBakedAtmosphere ? IM_COL32(214, 227, 166, 90) : IM_COL32(255, 255, 255, 25), 15.0f);
    const ImU32 StateColour = A.UseBakedAtmosphere ? AtmAccent : AtmMuted;
    ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(BakeAt.x + TileWidth * 0.5f, BakeAt.y + 25.0f), 8.0f, StateColour, 24);
    const char* TileLabel = "Use baked image";
    const float TileLabelWidth = KitTextWidth(Context.Faces.Regular, 8.0f, TileLabel);
    AtmText(Context, ImVec2(BakeAt.x + (TileWidth - TileLabelWidth) * 0.5f, BakeAt.y + 49.0f),
            8.0f, AtmInk, TileLabel);
    const char* TileState = A.UseBakedAtmosphere ? "ON" : "OFF";
    const float TileStateWidth = KitTextWidth(Context.Faces.Medium, 8.0f, TileState);
    AtmText(Context, ImVec2(BakeAt.x + (TileWidth - TileStateWidth) * 0.5f, BakeAt.y + 70.0f),
            8.0f, StateColour, TileState, Context.Faces.Medium);
    ImGui::PopID();
    ImGui::SameLine(0.0f, 12.0f);
    if (ImGui::Button("Bake atmosphere", ImVec2(ActionWidth, 34.0f))) ++A.BakeRequestRevision;
    const ImVec2 StatusAt(BakeAt.x + TileWidth + 12.0f, BakeAt.y + 47.0f);
    const float StatusWidth = std::max(80.0f, BakeWidth - TileWidth - ActionWidth - 26.0f);
    const char* Status = A.BakeRequestRevision > 0 ? "Bake requested · waiting for renderer" :
        (A.UseBakedAtmosphere ? "No baked GPU image · analytic sky active" : "Analytic sky selected");
    ImGui::GetWindowDrawList()->AddText(Context.Faces.Regular, 8.0f, StatusAt, AtmMuted, Status, nullptr, StatusWidth);
    ImGui::SetCursorScreenPos(ImVec2(BakeAt.x, BakeAt.y + 99.0f));
    ImGui::Dummy(ImVec2(BakeWidth, 21.0f));
    AtmText(Context, ImGui::GetCursorScreenPos(), 8.0f, AtmMuted,
            "RGBA16F · transmittance + multiple scattering + sky view");
    AtmEndCard();

    AtmCard(Context,"at_baked_image","Baked atmosphere","",365.0f);
    const std::array<const char*,4> Views{"Air","Sky","Transmit","Sphere"};
    const std::array<const char*,4> Names{"Profile","Panorama","Transmittance","Full sphere"};
    for(int32_t I=0;I<4;++I)
    {
        if(I>0)ImGui::SameLine(0.0f,5.0f);
        if(ImGui::Selectable(Views[size_t(I)],A.BakeViewIndex==I,0,ImVec2(std::max(45.0f,ImGui::GetContentRegionAvail().x/4.1f),26.0f)))A.BakeViewIndex=I;
    }
    ImVec2 At=ImGui::GetCursorScreenPos();const float Width=ImGui::GetContentRegionAvail().x;
    ImGui::InvisibleButton("##at_baked_placeholder",ImVec2(Width,190.0f));
    ImGui::GetWindowDrawList()->AddRectFilled(At,ImVec2(At.x+Width,At.y+190),IM_COL32(16,19,23,255),12.0f);
    ImGui::GetWindowDrawList()->AddRect(At,ImVec2(At.x+Width,At.y+190),IM_COL32(180,192,177,38),12.0f);
    const char* Placeholder=A.OpticalDepthLut.Baked()?"No GPU HDR readback · current CPU transmittance LUT is separate":"Bake the atmosphere to see the actual HDR image here. No substitute illustration.";
    const float TWidth=KitTextWidth(Context.Faces.Regular,9.0f,Placeholder);
    AtmText(Context,ImVec2(At.x+std::max(12.0f,(Width-TWidth)*.5f),At.y+85.0f),9.0f,AtmMuted,Placeholder);
    ImGui::Dummy(ImVec2(Width,8.0f));
    AtmNote(Context,A.BakeViewIndex==0?"Altitude profile · sampled opposite the baked Sun · zenith above, horizon below":A.BakeViewIndex==3?"Full sphere · zenith / horizon / nadir; black below ground is expected":"360° sky panorama · zenith at top, horizon below · decoded from the bake",42.0f);
    AtmEndCard();

    AtmCard(Context,"at_lut_diagnostics","GPU lookup tables","",160.0f);
    AtmText(Context,ImGui::GetCursorScreenPos(),9.0f,AtmMuted,"Transmittance · 256 × 64");
    ImGui::Dummy(ImVec2(0.0f,28.0f));
    AtmText(Context,ImGui::GetCursorScreenPos(),9.0f,AtmMuted,"Multiple scattering · 32 × 32");
    AtmEndCard();
}

} // namespace

void DrawAtmosphereInspectorPanel(GlobalInspectorPresentationContext& Context)
{
    auto* Atmosphere=static_cast<AtmosphereRecord*>(Context.Descriptor->PayloadAddress);
    if(Atmosphere==nullptr)return;
    Atmosphere->SynchronizeAtmosphereParameters(false);
    const ImVec2 Window = ImGui::GetWindowPos(), Size = ImGui::GetWindowSize();
    ImDrawList* PanelDraw = ImGui::GetWindowDrawList();
    PanelDraw->AddRectFilled(Window, ImVec2(Window.x + Size.x, Window.y + Size.y),
                              Context.Theme.LightSurface ? Context.Theme.PanelBg : IM_COL32(21, 24, 21, 255));
    if (!Context.Theme.LightSurface)
    {
        for (float Y = Window.y + 6.0f; Y < Window.y + Size.y; Y += 13.0f)
            for (float X = Window.x + 6.0f; X < Window.x + Size.x; X += 13.0f)
                PanelDraw->AddCircleFilled(ImVec2(X, Y), 0.65f, IM_COL32(178, 197, 148, 19), 4);
    }
    const float HeaderY = Context.BodyTop + 2.0f;
    AtmText(Context, ImVec2(Context.Left + 2.0f, HeaderY), 9.0f, AtmMuted,
            "ENVIRONMENT  /  03", Context.Faces.Medium);
    AtmText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 28.0f), 31.0f, AtmInk,
            "Atmosphere", Context.Faces.Light);
    AtmText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 79.0f), 11.0f, AtmMuted,
            "Scattering, density & the visible sky.");
    ImGui::SetCursorScreenPos(ImVec2(Context.Right - 86.0f, HeaderY + 32.0f));
    ImGui::PushStyleColor(ImGuiCol_Button, Atmosphere->AtmosphereEnabled ? IM_COL32(48, 65, 48, 255) : IM_COL32(42, 43, 41, 255));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(63, 82, 59, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, AtmInk);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 22.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 5.0f));
    if (ImGui::SmallButton(Atmosphere->AtmosphereEnabled ? "● Live" : "○ Off"))
        Atmosphere->AtmosphereEnabled = !Atmosphere->AtmosphereEnabled;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Toggle atmosphere");
    ImGui::PopStyleVar(2);
    ImGui::PopStyleColor(3);

    ImGui::PushID(static_cast<int>(Context.Selected.Value & 0x7fffffffu));
    const std::array<const char*, 4> Tabs{"Overview", "Medium", "Light response", "Baking"};
    const float TabsY = HeaderY + 117.0f;
    const float TabGap = 3.0f;
    const float TabWidth = (Context.Right - Context.Left - TabGap * 3.0f) / 4.0f;
    int32_t ActiveSection = std::clamp(Atmosphere->ActiveSectionIndex, 0, 3);
    for (int32_t Index = 0; Index < 4; ++Index)
    {
        const ImVec2 TabAt(Context.Left + Index * (TabWidth + TabGap), TabsY);
        ImGui::SetCursorScreenPos(TabAt);
        const char* TabLabel = Tabs[size_t(Index)];
        const bool Activated = ImGui::InvisibleButton(TabLabel, ImVec2(TabWidth, 31.0f));
        const bool Hovered = ImGui::IsItemHovered();
        const bool Selected = Index == ActiveSection;
        if (Activated) ActiveSection = Index;
        if (ImGui::IsItemFocused())
        {
            if (ImGui::IsKeyPressed(ImGuiKey_Home)) ActiveSection = 0;
            else if (ImGui::IsKeyPressed(ImGuiKey_End)) ActiveSection = 3;
            else if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) ActiveSection = (Index + 3) % 4;
            else if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) ActiveSection = (Index + 1) % 4;
        }
        const ImU32 Fill = Selected ? (Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(52, 58, 44, 255))
                                     : Hovered ? (Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(42, 49, 37, 255))
                                               : IM_COL32(0, 0, 0, 0);
        ImGui::GetWindowDrawList()->AddRectFilled(TabAt, ImVec2(TabAt.x + TabWidth, TabAt.y + 31.0f), Fill, 20.0f);
        const ImU32 LabelColour = Selected ? IM_COL32(224, 233, 205, 255) : AtmMuted;
        const float LabelWidth = KitTextWidth(Context.Faces.Regular, 10.0f, TabLabel);
        AtmText(Context, ImVec2(TabAt.x + (TabWidth - LabelWidth) * 0.5f, TabAt.y + 10.0f), 10.0f, LabelColour, TabLabel);
    }
    Atmosphere->ActiveSectionIndex = ActiveSection;
    ImGui::SetCursorScreenPos(ImVec2(Context.Left, TabsY + 50.0f));
    ImGui::PushStyleColor(ImGuiCol_ChildBg, Context.Theme.PanelBg);
    ImGui::BeginChild("##atmosphere_tab_content", ImVec2(Context.Width, 0.0f), false,
                      ImGuiWindowFlags_AlwaysVerticalScrollbar);
    ImGui::SetCursorPosX(10.0f);
    ImGui::SetCursorPosY(12.0f);
    switch (ActiveSection)
    {
        case 0: AtmosphereOverview(Context, *Atmosphere); break;
        case 1: AtmosphereMedium(Context, *Atmosphere); break;
        case 2: AtmosphereLight(Context, *Atmosphere); break;
        case 3: AtmosphereBaking(Context, *Atmosphere); break;
        default: break;
    }
    Atmosphere->SynchronizeAtmosphereParameters(false);
    ImGui::EndChild();
    ImGui::PopStyleColor();
    ImGui::PopID();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
