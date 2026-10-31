/*==========================================================================================================================================
                                            WIND INSPECTOR PANEL
==========================================================================================================================================*/
// Source-mapped native implementation of VehicleHMI/NativeWindPanel.js and WindInstruments.css.

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
#include <tuple>
#include <vector>

namespace Frontier
{
namespace
{
constexpr float WindPi = 3.14159265358979323846f;
constexpr ImU32 WindInk = IM_COL32(210, 221, 199, 255);
constexpr ImU32 WindMuted = IM_COL32(149, 166, 139, 255);
constexpr ImU32 WindAccent = IM_COL32(203, 217, 174, 255);
constexpr ImU32 WindLineColor = IM_COL32(182, 204, 153, 34);

float WindWrap(float Degrees)
{
    Degrees = std::fmod(Degrees, 360.0f);
    return Degrees < 0.0f ? Degrees + 360.0f : Degrees;
}

ImVec2 WindPoint(ImVec2 Origin, float Width, float Height, float X, float Y)
{
    return ImVec2(Origin.x + X / 640.0f * Width, Origin.y + Y / 480.0f * Height);
}

void WindText(const GlobalInspectorPresentationContext& Context, ImVec2 Position, float Size, ImU32 Colour,
              const char* Text, ImFont* Font = nullptr)
{
    ImGui::GetWindowDrawList()->AddText(Font ? Font : Context.Faces.Regular, Size, Position, Colour, Text);
}

void WindLine(const GlobalInspectorPresentationContext& Context, ImVec2 Origin, float Width, float Height,
              float X1, float Y1, float X2, float Y2, ImU32 Colour, float Thickness = 1.0f)
{
    ImGui::GetWindowDrawList()->AddLine(WindPoint(Origin, Width, Height, X1, Y1), WindPoint(Origin, Width, Height, X2, Y2),
                         Colour, Thickness);
}

void WindPlotFrame(GlobalInspectorPresentationContext& Context, const char* Id, float Height,
                   ImVec2& Origin, float& Width)
{
    Width = ImGui::GetContentRegionAvail().x;
    Origin = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton(Id, ImVec2(Width, Height));
}

void WindSection(GlobalInspectorPresentationContext& Context, float& Y, const char* Eyebrow, const char* Title)
{
    WindText(Context, ImVec2(Context.Left + 2.0f, Y), 8.5f, WindMuted, Eyebrow, Context.Faces.Medium);
    WindText(Context, ImVec2(Context.Left + 2.0f, Y + 16.0f), 18.0f, WindInk, Title, Context.Faces.Light);
    Y += 45.0f;
}

void WindNote(GlobalInspectorPresentationContext& Context, const char* Text, float Height = 55.0f)
{
    const ImVec2 Position = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::Dummy(ImVec2(Width, Height));
    ImGui::GetWindowDrawList()->AddText(Context.Faces.Regular, 10.5f, Position, WindMuted, Text, nullptr, Width - 8.0f);
}

void WindCard(GlobalInspectorPresentationContext& Context, const char* Id, const char* Eyebrow,
              const char* Title, float Height)
{
    const ImVec2 Position = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Id);
    ImGui::BeginChild("##wind_instrument", ImVec2(Width, Height), ImGuiChildFlags_Borders,
                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    ForwardGlobalInspectorCardWheelToParent();
    const ImVec2 Min = ImGui::GetWindowPos();
    const ImVec2 Max(Min.x + ImGui::GetWindowSize().x, Min.y + ImGui::GetWindowSize().y);
    ImGui::GetWindowDrawList()->AddRectFilled(Min, Max, Context.Theme.LightSurface ? Context.Theme.Surface : IM_COL32(37, 44, 35, 255), 24.0f);
    ImGui::GetWindowDrawList()->AddRect(Min, Max, Context.Theme.LightSurface ? Context.Theme.Line : IM_COL32(182, 206, 155, 33), 24.0f);
    WindText(Context, ImVec2(Min.x + 20.0f, Min.y + 17.0f), 9.0f, WindMuted, Eyebrow, Context.Faces.Medium);
    WindText(Context, ImVec2(Min.x + 20.0f, Min.y + 34.0f), 18.0f, WindInk, Title, Context.Faces.Light);
    ImGui::SetCursorScreenPos(ImVec2(Min.x + 20.0f, Min.y + 64.0f));
    (void)Position;
}

void WindEndCard()
{
    ImGui::EndChild();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 15.0f));
}

bool WindSlider(GlobalInspectorPresentationContext& Context, const char* Label, double* Value,
                double Minimum, double Maximum, const char* Format)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    const float NumberWidth = std::min(82.0f, Width * 0.28f);
    WindText(Context, At, 9.0f, WindMuted, Label);
    ImGui::PushStyleColor(ImGuiCol_FrameBg, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(20, 27, 21, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(31, 40, 31, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(40, 51, 39, 255));
    ImGui::PushStyleColor(ImGuiCol_SliderGrab, WindAccent);
    ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, WindAccent);
    ImGui::PushStyleColor(ImGuiCol_Text, WindInk);
    ImGui::SetCursorScreenPos(ImVec2(At.x + Width - NumberWidth, At.y - 3.0f));
    ImGui::SetNextItemWidth(NumberWidth);
    char NumberId[96]{};
    std::snprintf(NumberId, sizeof(NumberId), "##wind_value_%s", Label);
    bool Changed = ImGui::InputScalar(NumberId, ImGuiDataType_Double, Value, nullptr, nullptr, Format);
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    const double Min = Minimum, Max = Maximum;
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 23.0f));
    ImGui::SetNextItemWidth(Width);
    char TrackId[96]{};
    std::snprintf(TrackId, sizeof(TrackId), "##wind_track_%s", Label);
    Changed = ImGui::SliderScalar(TrackId, ImGuiDataType_Double, Value, &Min, &Max, "") || Changed;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    ImGui::PopStyleColor(6);
    *Value = std::clamp(*Value, Minimum, Maximum);
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 43.0f));
    ImGui::Dummy(ImVec2(Width, 12.0f));
    return Changed;
}

void WindReceiver(GlobalInspectorPresentationContext& Context, const char* Name, const char* Caption,
                  bool* Link, bool Enabled)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::InvisibleButton(Name, ImVec2(Width, 78.0f));
    const bool Hovered = ImGui::IsItemHovered();
    if (Hovered) ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);
    if (ImGui::IsItemClicked() && Link != nullptr) *Link = !*Link;
    ImGui::GetWindowDrawList()->AddLine(At, ImVec2(At.x + Width, At.y), Context.Theme.LightSurface ? Context.Theme.Line : WindLineColor, 1.0f);
    WindText(Context, ImVec2(At.x + 2.0f, At.y + 13.0f), 12.0f, WindInk, Name, Context.Faces.Regular);
    WindText(Context, ImVec2(At.x + 2.0f, At.y + 34.0f), 9.5f, WindMuted, Caption);
    const char* LinkText = Link == nullptr ? "Unavailable" : *Link ? "Linked" : "Unlinked";
    const ImU32 LinkInk = Link != nullptr && *Link ? WindAccent : WindMuted;
    const float LinkWidth = KitTextWidth(Context.Faces.Medium, 9.0f, LinkText);
    WindText(Context, ImVec2(At.x + Width - LinkWidth - 6.0f, At.y + 13.0f), 9.0f, LinkInk, LinkText, Context.Faces.Medium);
    WindText(Context, ImVec2(At.x + 2.0f, At.y + 57.0f), 8.0f, WindMuted,
             Enabled ? "Receiver enabled" : "Receiver off");
    ImGui::Dummy(ImVec2(0.0f, 2.0f));
}

CloudLayerRecord* FindCloudRecord(GlobalInspectorPresentationContext& Context)
{
    if (Context.DirectoryPanel == nullptr) return nullptr;
    for (const SceneDirectoryRow& Row : Context.DirectoryPanel->QueryRows())
    {
        const auto Descriptor = RecordInspectorRegistry::Instance().Query(Row.Token);
        if (Descriptor && Descriptor->Domain == GlobalInspectorDomain::Clouds)
            return static_cast<CloudLayerRecord*>(Descriptor->PayloadAddress);
    }
    return nullptr;
}

void WindFlowPage(GlobalInspectorPresentationContext& Context, WindFieldRecord& Wind)
{
    float Y = ImGui::GetCursorScreenPos().y;
    const float Width = ImGui::GetContentRegionAvail().x;
    WindCard(Context, "wind_flow", "01 / BASE FLOW", "Direction of travel", 940.0f);
    char SpeedText[32]{}, FromText[40]{};
    std::snprintf(SpeedText, sizeof(SpeedText), "%.1f", Wind.BaseSpeedMps);
    std::snprintf(FromText, sizeof(FromText), "FROM %.0f°", Wind.QueryMeteorologicalSourceDegrees());
    WindText(Context, ImVec2(Context.Left + 23.0f, Y + 83.0f), 53.0f, WindInk, SpeedText, Context.Faces.Light);
    const float SpeedWidth = KitTextWidth(Context.Faces.Light, 53.0f, SpeedText);
    WindText(Context, ImVec2(Context.Left + 23.0f + SpeedWidth + 10.0f, Y + 116.0f), 12.0f, WindMuted, "m/s");
    const float FromWidth = KitTextWidth(Context.Faces.Medium, 10.0f, FromText);
    WindText(Context, ImVec2(Context.Right - FromWidth - 24.0f, Y + 104.0f), 10.0f, WindMuted, FromText, Context.Faces.Medium);

    ImGui::SetCursorScreenPos(ImVec2(Context.Left + 20.0f, Y + 126.0f));
    ImVec2 Origin;
    float PlotWidth = 0.0f;
    const float PlotHeight = ImGui::GetContentRegionAvail().x * (480.0f / 640.0f);
    WindPlotFrame(Context, "##wind_compass", PlotHeight, Origin, PlotWidth);
    const float SX = PlotWidth / 640.0f;
    const float SY = PlotHeight / 480.0f;
    const auto P = [&](float X, float Z) { return ImVec2(Origin.x + X * SX, Origin.y + Z * SY); };
    const float CX = 320.0f, CY = 235.0f, Radius = 155.0f;
    ImGui::GetWindowDrawList()->AddCircle(P(CX, CY), Radius * SX, IM_COL32(193, 214, 184, 45), 80, 1.0f);
    ImGui::GetWindowDrawList()->AddCircle(P(CX, CY), Radius * 0.63f * SX, IM_COL32(193, 214, 184, 21), 80, 1.0f);
    for (int32_t I = 0; I < 24; ++I)
    {
        const float A = I / 24.0f * 2.0f * WindPi;
        WindLine(Context, Origin, PlotWidth, PlotHeight, CX + std::sin(A) * 150.0f, CY - std::cos(A) * 150.0f,
                 CX + std::sin(A) * 155.0f, CY - std::cos(A) * 155.0f, IM_COL32(191, 209, 178, 88));
    }
    const float A = float(Wind.TravelBearingDegrees) * WindPi / 180.0f;
    const float UX = std::sin(A), UY = -std::cos(A), VX = -UY, VY = UX;
    const auto Point = [&](float Along, float Across) {
        return P(CX + UX * Along + VX * Across, CY + UY * Along + VY * Across);
    };
    for (int32_t J = -2; J <= 2; ++J)
    {
        const float Across = J * 39.0f;
        const float L = std::sqrt(std::max(0.0f, 135.0f * 135.0f - Across * Across));
        std::array<ImVec2, 37> Points{};
        for (int32_t I = 0; I < static_cast<int32_t>(Points.size()); ++I)
            Points[size_t(I)] = Point(-L + 2.0f * L * I / 36.0f, Across + std::sin(I / 36.0f * WindPi) * J * 3.0f);
        ImGui::GetWindowDrawList()->AddPolyline(Points.data(), int(Points.size()), IM_COL32(185, 201, 161, 42), ImDrawFlags_None, 1.4f);
        if (Wind.BaseSpeedMps > 0.0)
        {
            const ImVec2 Back = Point(L * 0.48f - 12.0f, Across), End = Point(L * 0.48f, Across);
            ImGui::GetWindowDrawList()->AddLine(Back, End, WindAccent, 1.8f);
            ImGui::GetWindowDrawList()->AddLine(Point(L * 0.48f - 9.0f, Across - 5.0f), End, WindAccent, 1.8f);
            ImGui::GetWindowDrawList()->AddLine(End, Point(L * 0.48f - 9.0f, Across + 5.0f), WindAccent, 1.8f);
        }
    }
    const float SourceX = CX - Radius * float(Wind.BaseSpeedMps / 40.0) * UX;
    const float SourceY = CY - Radius * float(Wind.BaseSpeedMps / 40.0) * UY;
    WindLine(Context, Origin, PlotWidth, PlotHeight, CX, CY, SourceX, SourceY, IM_COL32(223, 228, 186, 110), 1.0f);
    ImGui::GetWindowDrawList()->AddCircleFilled(P(SourceX, SourceY), 9.0f * SX, IM_COL32(225, 229, 188, 255));
    ImGui::GetWindowDrawList()->AddCircleFilled(P(CX, CY), 4.0f * SX, IM_COL32(148, 171, 138, 255));
    for (const auto& [PX, PY, Label] : std::array<std::tuple<float, float, const char*>, 4>{{
             {320.0f, 54.0f, "N / +Y"}, {516.0f, 240.0f, "E"}, {320.0f, 433.0f, "S"}, {126.0f, 240.0f, "W"}}})
        WindText(Context, P(PX, PY), 19.0f * SX, WindMuted, Label);
    WindText(Context, P(320.0f, 475.0f), 17.0f * SX, WindMuted, "DOT = WIND FROM / ARROWS = TRAVEL TO");

    const ImVec2 Min = ImGui::GetItemRectMin(), Max = ImGui::GetItemRectMax();
    if (ImGui::IsItemActive())
    {
        const ImVec2 Mouse = ImGui::GetIO().MousePos;
        const float DX = (Mouse.x - Origin.x) / SX - CX;
        const float DY = CY - (Mouse.y - Origin.y) / SY;
        Wind.TravelBearingDegrees = WindWrap(std::atan2(DX, DY) * 180.0f / WindPi + 180.0f);
        Wind.BaseSpeedMps = std::clamp(std::hypot(DX, DY) / 155.0f * 40.0f, 0.0f, 40.0f);
    }
    if (ImGui::IsItemFocused())
    {
        const double Step = ImGui::GetIO().KeyShift ? 10.0 : 1.0;
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) Wind.ResetReferenceFlow();
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow)) Wind.BaseSpeedMps = std::min(40.0, Wind.BaseSpeedMps + 0.1 * Step);
        if (ImGui::IsKeyPressed(ImGuiKey_DownArrow)) Wind.BaseSpeedMps = std::max(0.0, Wind.BaseSpeedMps - 0.1 * Step);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) Wind.TravelBearingDegrees = WindWrap(float(Wind.TravelBearingDegrees + Step));
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) Wind.TravelBearingDegrees = WindWrap(float(Wind.TravelBearingDegrees - Step));
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Wind flow compass · drag source bearing and speed; arrows edit bearing or speed");
    (void)Min; (void)Max;
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    double Speed = Wind.BaseSpeedMps;
    if (WindSlider(Context, "Base speed", &Speed, 0.0, 40.0, "%.1f m/s")) Wind.BaseSpeedMps = Speed;
    double SourceBearing = Wind.QueryMeteorologicalSourceDegrees();
    if (WindSlider(Context, "Bearing from", &SourceBearing, 0.0, 360.0, "%.0f°"))
        Wind.TravelBearingDegrees = WindWrap(float(SourceBearing + 180.0));
    WindNote(Context, "Meteorological bearing is where wind comes FROM; the arrows show where it travels TO. Drag the source dot radially for base speed. Base-only reference: gusts, altitude and turbulence are excluded.", 72.0f);
    WindEndCard();
    const double SourceDegrees = Wind.QueryMeteorologicalSourceDegrees();
    char Live[128]{};
    if (Wind.WindFieldEnabled)
        std::snprintf(Live, sizeof(Live), "LIVE BASE VECTOR · %.2f m/s · current shared gust clock", Wind.BaseSpeedMps);
    else std::snprintf(Live, sizeof(Live), "SCENE WIND OFF · configured references remain visible");
    ImGui::TextColored(ImVec4(0.64f, 0.71f, 0.58f, 1.0f), "%s · FROM %.0f°", Live, SourceDegrees);
}

void WindVariabilityPage(GlobalInspectorPresentationContext& Context, WindFieldRecord& Wind)
{
    WindCard(Context, "wind_gust", "02 / SPEED MODULATION", "The gust envelope", 565.0f);
    ImVec2 Origin; float Width = 0.0f;
    const float PlotHeight = ImGui::GetContentRegionAvail().x * (290.0f / 640.0f);
    WindPlotFrame(Context, "##wind_gust_plot", PlotHeight, Origin, Width);
    const float SX = Width / 640.0f, SY = PlotHeight / 290.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    const double Max = std::max(1.0, Wind.BaseSpeedMps * (1.0 + Wind.GustStrength));
    const auto Y = [&](double V) { return 230.0 - float(V / Max * 180.0); };
    ImGui::GetWindowDrawList()->AddRectFilled(P(45, float(Y(Wind.BaseSpeedMps * (1.0 + Wind.GustStrength)))),
                               P(595, float(Y(Wind.BaseSpeedMps * (1.0 - Wind.GustStrength)))),
                               IM_COL32(185, 209, 161, 17), 8.0f);
    ImGui::GetWindowDrawList()->AddLine(P(45, float(Y(Wind.BaseSpeedMps))), P(595, float(Y(Wind.BaseSpeedMps))), IM_COL32(195, 209, 172, 68), 1.0f);
    std::array<ImVec2, 161> Curve{};
    for (int32_t I = 0; I < 161; ++I)
    {
        const double Phase = I / 160.0 * 40.0 * (0.35 + Wind.GustStrength * 0.4);
        const double Value = Wind.BaseSpeedMps * Wind.EvaluateTwoSineGustFactor(Phase);
        Curve[size_t(I)] = P(45.0f + I / 160.0f * 550.0f, Y(Value));
    }
    ImGui::GetWindowDrawList()->AddPolyline(Curve.data(), int(Curve.size()), WindInk, ImDrawFlags_None, 1.8f);
    WindText(Context, P(45, 27), 18.0f * SX, WindMuted, "SPEED / m/s");
    char Maximum[32]{}; std::snprintf(Maximum, sizeof(Maximum), "%.1f MAX BOUND", double(Max));
    { const float W = KitTextWidth(Context.Faces.Regular, 18.0f * SX, Maximum); WindText(Context, ImVec2(P(595, 27).x - W, P(595, 27).y), 18.0f * SX, WindMuted, Maximum); }
    WindText(Context, P(45, 273), 18.0f * SX, WindMuted, "0 s");
    { const float W = KitTextWidth(Context.Faces.Regular, 18.0f * SX, "40 s"); WindText(Context, ImVec2(P(595, 273).x - W, P(595, 273).y), 18.0f * SX, WindMuted, "40 s"); }
    ImGui::Dummy(ImVec2(0.0f, 4.0f));
    double Gust = Wind.GustStrength;
    if (WindSlider(Context, "Gust strength", &Gust, 0.0, 1.0, "%.2f")) Wind.GustStrength = Gust;
    WindNote(Context, "Exact two-sine speed modulation under fixed settings, starting at phase zero. Shading is the guaranteed ±gust bound, not a measured history or a forecast of the running clock.", 62.0f);
    WindEndCard();

    WindCard(Context, "wind_turbulence", "03 / THREE VELOCITY COMPONENTS", "Cross-flow perturbation", 510.0f);
    ImVec2 TurbOrigin; float TurbWidth = 0.0f;
    const float TurbHeight = ImGui::GetContentRegionAvail().x * (240.0f / 640.0f);
    WindPlotFrame(Context, "##wind_turbulence_plot", TurbHeight, TurbOrigin, TurbWidth);
    const float TSX = TurbWidth / 640.0f, TSY = TurbHeight / 240.0f;
    const auto TP = [&](float X, float Y) { return ImVec2(TurbOrigin.x + X * TSX, TurbOrigin.y + Y * TSY); };
    const double Amplitude = Wind.BaseSpeedMps * Wind.TurbulenceAmplitude;
    const std::array<double, 3> Frequencies{0.31, 0.27, 0.22};
    const std::array<ImU32, 3> Colours{IM_COL32(210, 215, 170, 255), IM_COL32(171, 201, 187, 255), IM_COL32(167, 188, 203, 255)};
    for (int32_t Axis = 0; Axis < 3; ++Axis)
    {
        const float BaseY = 45.0f + Axis * 66.0f;
        ImGui::GetWindowDrawList()->AddLine(TP(95, BaseY), TP(590, BaseY), IM_COL32(185, 203, 160, 32), 1.0f);
        std::array<ImVec2, 81> Points{};
        for (int32_t I = 0; I < 81; ++I)
        {
            const double T = I / 80.0 * 20.0;
            const double Scale = Axis == 2 ? 0.12 : 1.0;
            const double V = std::sin(T * Frequencies[size_t(Axis)]) * Wind.TurbulenceAmplitude *
                             (Wind.BaseSpeedMps > 0.0 ? 24.0 : 0.0) * Scale;
            Points[size_t(I)] = TP(95.0f + I / 80.0f * 495.0f, BaseY - float(V));
        }
        ImGui::GetWindowDrawList()->AddPolyline(Points.data(), int(Points.size()), Colours[size_t(Axis)], ImDrawFlags_None, 1.7f);
        WindText(Context, TP(45, BaseY + 5.0f), 20.0f * TSX, WindMuted, std::array<const char*, 3>{"X", "Y", "Z"}[size_t(Axis)]);
        char Bound[48]{}; std::snprintf(Bound, sizeof(Bound), "%.2f m/s bound", Amplitude * (Axis == 2 ? 0.12 : 1.0));
        const float BoundWidth = KitTextWidth(Context.Faces.Regular, 16.0f * TSX, Bound);
        WindText(Context, ImVec2(TurbOrigin.x + 590.0f * TSX - BoundWidth, TurbOrigin.y + (BaseY + 29.0f) * TSY), 16.0f * TSX, WindMuted, Bound);
    }
    double Turbulence = Wind.TurbulenceAmplitude;
    if (WindSlider(Context, "Turbulence", &Turbulence, 0.0, 1.0, "%.2f")) Wind.TurbulenceAmplitude = Turbulence;
    WindNote(Context, "Normalized sea-level traces at fixed base speed; labels give velocity bounds. X/Y use the existing .31/.27 rad/s oscillations; vertical motion uses .22 rad/s at 12% amplitude. Live gusts scale the actual perturbation.", 67.0f);
    WindEndCard();
}

void WindAltitudePage(GlobalInspectorPresentationContext& Context, WindFieldRecord& Wind)
{
    WindCard(Context, "wind_altitude", "04 / STEADY VECTOR LADDER", "Wind through altitude", 735.0f);
    ImVec2 Origin; float Width = 0.0f;
    const float PlotHeight = ImGui::GetContentRegionAvail().x * (390.0f / 640.0f);
    WindPlotFrame(Context, "##wind_altitude_plot", PlotHeight, Origin, Width);
    const float SX = Width / 640.0f, SY = PlotHeight / 390.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    ImGui::GetWindowDrawList()->AddLine(P(270, 40), P(270, 330), IM_COL32(168, 189, 155, 51), 1.0f);
    const double Scale = std::max(1.0, Wind.BaseSpeedMps * (1.0 + Wind.AltitudeShearPerKm * 3.0));
    for (int32_t I = 0; I < 6; ++I)
    {
        const double Z = I * 600.0;
        const float Y = 330.0f - I * 55.0f;
        double Speed = 0.0, Bearing = 0.0;
        Wind.EvaluateAltitudeVector(Z, Speed, Bearing);
        const double A = Bearing * WindPi / 180.0;
        const float Length = float(Speed / Scale * 120.0);
        const ImVec2 End = P(270.0f + float(std::sin(A)) * Length, Y - float(std::cos(A)) * Length * 0.28f);
        char Height[32]{}; std::snprintf(Height, sizeof(Height), I == 0 ? "0 m" : "%.1f km", Z / 1000.0);
        WindText(Context, P(90, Y + 6), 19.0f * SX, WindMuted, Height);
        ImGui::GetWindowDrawList()->AddLine(P(270, Y), End, WindAccent, 2.0f);
        if (Length > 0.0f) ImGui::GetWindowDrawList()->AddCircleFilled(End, 3.0f, IM_COL32(220, 227, 190, 255));
        char SpeedLabel[32]{}; std::snprintf(SpeedLabel, sizeof(SpeedLabel), "%.1f m/s", Speed);
        const float LabelWidth = KitTextWidth(Context.Faces.Regular, 20.0f * SX, SpeedLabel);
        WindText(Context, ImVec2(Origin.x + 590.0f * SX - LabelWidth, Origin.y + (Y + 6.0f) * SY), 20.0f * SX, WindInk, SpeedLabel);
    }
    WindText(Context, P(45, 380), 18.0f * SX, WindMuted, "PLAN DIRECTIONS / +Y NORTH · 0–3 km");
    double Shear = Wind.AltitudeShearPerKm;
    if (WindSlider(Context, "Speed gain per km", &Shear, 0.0, 2.0, "%.2f×/km")) Wind.AltitudeShearPerKm = Shear;
    double Veer = Wind.AltitudeVeerDegreesPerKm;
    if (WindSlider(Context, "Direction veer per km", &Veer, -60.0, 60.0, "%.0f°/km")) Wind.AltitudeVeerDegreesPerKm = Veer;
    WindNote(Context, "Steady speed = base × (1 + shear × altitude in km). Travel bearing turns by veer × altitude in km. Negative altitude is clamped to sea level. Gusts and turbulence are excluded here; vectors are plan-view glyphs, not vertically tilted air.", 75.0f);
    WindEndCard();
}

void WindReceiversPage(GlobalInspectorPresentationContext& Context, WindFieldRecord& Wind)
{
    WindCard(Context, "wind_receivers", "05 / SHARED ADVECTION ROUTING", "Where the field goes", 565.0f);
    CloudLayerRecord* Clouds = FindCloudRecord(Context);
    if (Clouds != nullptr)
        WindReceiver(Context, "Clouds", "Density travel at cloud-base altitude",
                     &Clouds->FollowSharedWindEnabled, Clouds->CloudLayerEnabled);
    WindReceiver(Context, "Local cloud", "Placed bounds stay fixed; density travels",
                 &Wind.LocalCloudFollowEnabled, Wind.LocalCloudEnabled);
    WindReceiver(Context, "Local fog", "Unlinked uses its own authored drift",
                 &Wind.LocalFogFollowEnabled, Wind.LocalFogEnabled);
    WindReceiver(Context, "Precipitation", "GPU falling particles · shared altitude field",
                 &Wind.PrecipitationFollowEnabled, Wind.PrecipitationEnabled);
    double Drift = Wind.PrecipitationDrift;
    if (WindSlider(Context, "Precipitation wind drift", &Drift, 0.0, 1.0, "%.2f")) Wind.PrecipitationDrift = Drift;
    WindNote(Context, "Linking a receiver does not enable it. Cloud/fog follow switches affect integrated density travel, not placement. Static height fog has no advected density. Tyre smoke/fire retains its separate gas-wind controls; no fake shared-wind binding is shown.", 80.0f);
    WindEndCard();
}

} // namespace

void DrawWindInspectorPanel(GlobalInspectorPresentationContext& Context)
{
    auto* Wind = static_cast<WindFieldRecord*>(Context.Descriptor->PayloadAddress);
    if (Wind == nullptr) return;
    const ImVec2 Window = ImGui::GetWindowPos();
    const ImVec2 WindowSize = ImGui::GetWindowSize();
    ImGui::GetWindowDrawList()->AddRectFilled(Window, ImVec2(Window.x + WindowSize.x, Window.y + WindowSize.y), Context.Theme.PanelBg);

    const float HeaderY = Context.BodyTop + 4.0f;
    WindText(Context, ImVec2(Context.Left + 2.0f, HeaderY), 8.5f, WindMuted, "FORCEFIELD / SHARED WEATHER", Context.Faces.Medium);
    WindText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 17.0f), 31.0f, WindInk, "Wind", Context.Faces.Light);
    WindText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 54.0f), 10.5f, WindMuted,
             "A direction, a pulse, a changing column of air.");
    ImGui::SetCursorScreenPos(ImVec2(Context.Right - 84.0f, HeaderY + 21.0f));
    ImGui::PushStyleColor(ImGuiCol_Button, Wind->WindFieldEnabled ? IM_COL32(52, 67, 47, 255) : IM_COL32(41, 40, 37, 255));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(65, 82, 57, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, WindInk);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 22.0f);
    if (ImGui::SmallButton(Wind->WindFieldEnabled ? "● On" : "○ Off")) Wind->WindFieldEnabled = !Wind->WindFieldEnabled;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Toggle shared wind");
    ImGui::PopStyleVar(); ImGui::PopStyleColor(3);

    ImGui::SetCursorScreenPos(ImVec2(Context.Left, HeaderY + 91.0f));
    ImGui::PushID(static_cast<int>(Context.Selected.Value & 0x7fffffffu));
    ImGui::PushStyleColor(ImGuiCol_Tab, Context.Theme.LightSurface ? Context.Theme.Surface : IM_COL32(36, 42, 34, 255));
    ImGui::PushStyleColor(ImGuiCol_TabHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(58, 72, 51, 255));
    ImGui::PushStyleColor(ImGuiCol_TabActive, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(61, 75, 52, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, WindInk);
    ImGui::PushStyleVar(ImGuiStyleVar_TabRounding, 9.0f);
    if (ImGui::BeginTabBar("##wind_sections", ImGuiTabBarFlags_FittingPolicyScroll))
    {
        const std::array<const char*, 4> Tabs{"Flow", "Variability", "Altitude", "Receivers"};
        for (int32_t Index = 0; Index < int32_t(Tabs.size()); ++Index)
        {
            const ImGuiTabItemFlags Flags = Wind->ActiveSectionIndex == Index ? ImGuiTabItemFlags_SetSelected : ImGuiTabItemFlags_None;
            if (!ImGui::BeginTabItem(Tabs[size_t(Index)], nullptr, Flags)) continue;
            if (ImGui::IsItemActivated()) Wind->ActiveSectionIndex = Index;
            ImGui::PushStyleColor(ImGuiCol_ChildBg, Context.Theme.PanelBg);
            ImGui::BeginChild("##wind_tab_content", ImVec2(0.0f, 0.0f), false, ImGuiWindowFlags_AlwaysVerticalScrollbar);
            ImGui::SetCursorPosX(10.0f);
            ImGui::SetCursorPosY(13.0f);
            switch (Index)
            {
                case 0: WindFlowPage(Context, *Wind); break;
                case 1: WindVariabilityPage(Context, *Wind); break;
                case 2: WindAltitudePage(Context, *Wind); break;
                case 3: WindReceiversPage(Context, *Wind); break;
                default: break;
            }
            ImGui::EndChild();
            ImGui::PopStyleColor();
            ImGui::EndTabItem();
        }
        ImGui::EndTabBar();
    }
    ImGui::PopStyleVar(); ImGui::PopStyleColor(4); ImGui::PopID();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
