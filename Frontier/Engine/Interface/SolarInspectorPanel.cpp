/*==========================================================================================================================================
                                                   SOLAR INSPECTOR PANEL
==========================================================================================================================================*/
// 🧩 Source-mapped native implementation of VehicleHMI/SunInspectorDashboard.js and SunInspector.css (parity in progress).

#include "Engine/Interface/GlobalInspectorPresentationContext.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
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
constexpr ImU32 InkMain = IM_COL32(239, 235, 226, 255);
constexpr ImU32 InkMuted = IM_COL32(161, 151, 134, 255);
constexpr ImU32 InkFaint = IM_COL32(128, 119, 101, 255);
constexpr ImU32 InkAccent = IM_COL32(232, 199, 139, 255);
constexpr ImU32 CardBase = IM_COL32(35, 36, 30, 255);
constexpr ImU32 CardRaised = IM_COL32(41, 39, 31, 255);
constexpr ImU32 CardEdge = IM_COL32(232, 199, 139, 28);
constexpr ImU32 SoftLine = IM_COL32(232, 199, 139, 32);
constexpr double Pi = 3.14159265358979323846;

ImU32 WithAlpha(ImU32 Colour, int Alpha)
{
    return (Colour & 0x00ffffffu) | (static_cast<ImU32>(Alpha) << 24);
}

ImU32 ResolveInk(const GlobalInspectorPresentationContext& Context, ImU32 Colour)
{
    if (!Context.Theme.LightSurface) return Colour;
    if (Colour == InkMain) return Context.Theme.Text;
    if (Colour == InkMuted) return Context.Theme.Muted;
    if (Colour == InkFaint) return Context.Theme.Faint;
    return Colour;
}

void DrawText(const GlobalInspectorPresentationContext& Context, ImVec2 Position, float Size, ImU32 Colour,
              const char* Text, ImFont* Font = nullptr)
{
    KitDrawText(ImGui::GetWindowDrawList(), Font != nullptr ? Font : Context.Faces.Regular, Size, Position,
                ResolveInk(Context, Colour), Text);
}

double& ValueFor(SunRecord& Sun, SunInspectorValue Property)
{
    switch (Property)
    {
        case SunInspectorValue::Azimuth:           return Sun.AzimuthDegrees;
        case SunInspectorValue::Elevation:         return Sun.ElevationDegrees;
        case SunInspectorValue::SolarIlluminance:  return Sun.SolarIlluminance;
        case SunInspectorValue::ColourTemperature: return Sun.ColourTemperatureKelvin;
        case SunInspectorValue::SolarRadius:       return Sun.SolarRadiusDegrees;
        case SunInspectorValue::AureoleGlow:       return Sun.AureoleGlow;
        case SunInspectorValue::SolarTime:         return Sun.SolarClockHours;
        case SunInspectorValue::DayDuration:       return Sun.CycleDurationHours;
        case SunInspectorValue::Latitude:          return Sun.LatitudeDegrees;
        case SunInspectorValue::Longitude:         return Sun.LongitudeDegrees;
        case SunInspectorValue::TimeZone:          return Sun.UtcOffsetHours;
    }
    return Sun.AzimuthDegrees;
}

void BeginCard(const GlobalInspectorPresentationContext& Context, const char* Id, const char* Title,
               const char* Index, float Height, ImU32 Background = CardBase, float Radius = 22.0f)
{
    ImGui::BeginChild(Id, ImVec2(0.0f, Height), false,
                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    ForwardGlobalInspectorCardWheelToParent();
    const ImVec2 Min = ImGui::GetWindowPos();
    const ImVec2 Max(Min.x + ImGui::GetWindowSize().x, Min.y + ImGui::GetWindowSize().y);
    const ImU32 Surface = Context.Theme.LightSurface ? Context.Theme.Surface2 : Background;
    const ImU32 Edge = Context.Theme.LightSurface ? Context.Theme.Line : CardEdge;
    ImGui::GetWindowDrawList()->AddRectFilled(Min, Max, Surface, Radius);
    ImGui::GetWindowDrawList()->AddRect(Min, Max, Edge, Radius, 0, 1.0f);
    const ImVec2 Padding(22.0f, 18.0f);
    DrawText(Context, ImVec2(Min.x + Padding.x, Min.y + Padding.y), 11.0f, InkMain, Title, Context.Faces.Medium);
    const float IndexWidth = KitTextWidth(Context.Faces.Regular, 8.5f, Index);
    DrawText(Context, ImVec2(Max.x - Padding.x - IndexWidth, Min.y + Padding.y + 1.0f), 8.5f,
             InkFaint, Index, Context.Faces.Regular);
    ImGui::SetCursorScreenPos(ImVec2(Min.x + Padding.x, Min.y + 43.0f));
}

void EndCard()
{
    ImGui::EndChild();
    ImGui::Dummy(ImVec2(0.0f, 12.0f));
}

void DrawCaption(const GlobalInspectorPresentationContext& Context, const char* Text, float MaxWidth = 0.0f)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = MaxWidth > 0.0f ? MaxWidth : ImGui::GetContentRegionAvail().x;
    const ImVec2 Extent = ImGui::CalcTextSize(Text, nullptr, false, Width);
    ImGui::Dummy(ImVec2(Width, Extent.y + 8.0f));
    DrawText(Context, At, 9.5f, InkMuted, Text);
}

void DrawReadout(const GlobalInspectorPresentationContext& Context, const char* Label, const char* Value,
                 const char* Unit, float ValueSize = 24.0f)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    DrawText(Context, At, 8.0f, InkMuted, Label, Context.Faces.Medium);
    DrawText(Context, ImVec2(At.x, At.y + 14.0f), ValueSize, InkMain, Value, Context.Faces.Light);
    const float ValueWidth = KitTextWidth(Context.Faces.Light, ValueSize, Value);
    if (Unit != nullptr && Unit[0] != '\0')
        DrawText(Context, ImVec2(At.x + ValueWidth + 5.0f, At.y + 24.0f), 8.0f, InkMuted, Unit);
}

void DrawSlider(const GlobalInspectorPresentationContext& Context, SunRecord& Sun, SunInspectorValue Property,
                const char* Label, double Minimum, double Maximum, double Step, const char* Unit = "",
                double DisplayScale = 1.0, const char* Format = "%.2f")
{
    double& Stored = ValueFor(Sun, Property);
    const float Width = ImGui::GetContentRegionAvail().x;
    const ImVec2 LabelAt = ImGui::GetCursorScreenPos();
    double DisplayValue = Stored * DisplayScale;
    double DisplayMin = Minimum * DisplayScale;
    double DisplayMax = Maximum * DisplayScale;
    const float UnitWidth = Unit != nullptr && Unit[0] != '\0'
                                ? KitTextWidth(Context.Faces.Regular, 8.0f, Unit) + 6.0f
                                : 0.0f;
    const float NumberWidth = std::min(74.0f, Width * 0.28f);
    const float NumberX = LabelAt.x + Width - NumberWidth - UnitWidth;
    DrawText(Context, LabelAt, 8.5f, InkMuted, Label, Context.Faces.Regular);

    ImGui::PushStyleColor(ImGuiCol_FrameBg, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(41, 39, 32, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(54, 50, 40, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(60, 54, 42, 255));
    ImGui::PushStyleColor(ImGuiCol_SliderGrab, IM_COL32(215, 197, 158, 255));
    ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, InkAccent);
    ImGui::PushStyleColor(ImGuiCol_Text, InkMain);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10.0f);
    ImGui::SetCursorScreenPos(ImVec2(NumberX, LabelAt.y - 3.0f));
    ImGui::SetNextItemWidth(NumberWidth);
    const std::string NumberId = std::string("##") + Label + "_number";
    bool Changed = ImGui::InputScalar(NumberId.c_str(), ImGuiDataType_Double, &DisplayValue,
                                      nullptr, nullptr, Format);
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    if (UnitWidth > 0.0f)
        DrawText(Context, ImVec2(NumberX + NumberWidth + 5.0f, LabelAt.y + 2.0f),
                 8.0f, InkMuted, Unit);

    ImGui::SetCursorScreenPos(ImVec2(LabelAt.x, LabelAt.y + 23.0f));
    ImGui::SetNextItemWidth(Width);
    const std::string SliderId = std::string("##") + Label + "_track";
    Changed = ImGui::SliderScalar(SliderId.c_str(), ImGuiDataType_Double, &DisplayValue,
                                  &DisplayMin, &DisplayMax, "") || Changed;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(6);
    if (Changed)
    {
        const double Value = DisplayValue / DisplayScale;
        const double Snapped = Minimum + std::round((Value - Minimum) / Step) * Step;
        (void)Sun.SetInspectorValue(Property, Snapped);
    }
    ImGui::SetCursorScreenPos(ImVec2(LabelAt.x, LabelAt.y + 43.0f));
    ImGui::Dummy(ImVec2(Width, 12.0f));
}

std::string SolarClockText(double Hours)
{
    int32_t Minutes = static_cast<int32_t>(std::llround(Hours * 60.0));
    Minutes = ((Minutes % 1440) + 1440) % 1440;
    char Text[8]{};
    std::snprintf(Text, sizeof(Text), "%02d:%02d", Minutes / 60, Minutes % 60);
    return Text;
}

void DrawSolarVector(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const float Height = Width * (420.0f / 640.0f);
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton("##sun_vector_canvas", ImVec2(Width, Height));
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Sun vector editor · drag azimuth and elevation");
    const bool Active = ImGui::IsItemActive();
    ImDrawList* Ink = ImGui::GetWindowDrawList();
    const float SX = Width / 640.0f;
    const float SY = Height / 420.0f;
    const auto Point = [&](float X, float Y) { return ImVec2(Min.x + X * SX, Min.y + Y * SY); };
    const ImVec2 Centre = Point(320.0f, 210.0f);
    for (const float Radius : {45.0f, 90.0f, 135.0f, 180.0f})
        Ink->AddCircle(Centre, Radius * SX, Radius == 90.0f ? IM_COL32(217, 194, 155, 112) : IM_COL32(217, 194, 155, 28), 64, 1.0f);
    for (int32_t Index = 0; Index < 24; ++Index)
    {
        const double Angle = Index / 24.0 * 2.0 * Pi;
        Ink->AddLine(Point(320.0f + std::cos(Angle) * 174.0f, 210.0f + std::sin(Angle) * 174.0f),
                     Point(320.0f + std::cos(Angle) * 180.0f, 210.0f + std::sin(Angle) * 180.0f),
                     IM_COL32(232, 199, 139, 85), 1.0f);
    }
    Ink->AddLine(Point(120, 210), Point(520, 210), IM_COL32(232, 199, 139, 32), 1.0f);
    Ink->AddLine(Point(320, 15), Point(320, 405), IM_COL32(232, 199, 139, 32), 1.0f);
    const double Azimuth = Sun.AzimuthDegrees * Pi / 180.0;
    const double Radius = 90.0 - Sun.ElevationDegrees;
    const ImVec2 Source = Point(320.0f + std::cos(Azimuth) * Radius, 210.0f - std::sin(Azimuth) * Radius);
    const bool Lit = Sun.SunlightEnabled && Sun.ElevationDegrees >= 0.0;
    Ink->AddLine(Centre, Source, Lit ? InkAccent : IM_COL32(135, 147, 139, 255), 1.5f);
    Ink->AddCircleFilled(Centre, 4.0f * SX, IM_COL32(217, 202, 176, 255));
    Ink->AddCircle(Source, 20.0f * SX, Lit ? IM_COL32(232, 199, 139, 22) : IM_COL32(135, 147, 139, 22), 48, 1.0f);
    if (Lit) Ink->AddCircleFilled(Source, 13.0f * SX, IM_COL32(232, 199, 139, 28), 48);
    Ink->AddCircleFilled(Source, 6.0f * SX, Lit ? IM_COL32(240, 214, 159, 255) : IM_COL32(141, 155, 145, 255));

    const auto Label = [&](float X, float Y, const char* Text, ImU32 Colour = IM_COL32(164, 152, 134, 255),
                           ImDrawFlags Align = ImDrawFlags_None) {
        const float TextWidth = KitTextWidth(Context.Faces.Regular, 8.0f, Text);
        float DrawX = X * SX;
        if (Align == ImDrawFlags_RoundCornersLeft) DrawX -= TextWidth;
        DrawText(Context, ImVec2(Min.x + DrawX, Min.y + Y * SY), 8.0f, Colour, Text);
    };
    Label(320, 18, "+Y / N");
    Label(532, 216, "+X / E");
    Label(108, 216, "W", InkMuted, ImDrawFlags_RoundCornersLeft);
    Label(320, 408, "S");
    Label(419, 194, "0° HORIZON");
    Label(24, 389, "DRAG VECTOR");

    if (Active)
    {
        const ImVec2 Mouse = ImGui::GetIO().MousePos;
        const double DX = (Mouse.x - Min.x) / SX - 320.0;
        const double DY = 210.0 - (Mouse.y - Min.y) / SY;
        if (std::hypot(DX, DY) > 1.0)
            (void)Sun.SetInspectorValue(SunInspectorValue::Azimuth, std::atan2(DY, DX) * 180.0 / Pi);
        (void)Sun.SetInspectorValue(SunInspectorValue::Elevation, 90.0 - std::min(180.0, std::hypot(DX, DY)));
    }
    if (ImGui::IsItemFocused())
    {
        const double Step = ImGui::GetIO().KeyShift ? 10.0 : 1.0;
        if (ImGui::IsKeyPressed(ImGuiKey_Home))
        {
            (void)Sun.SetInspectorValue(SunInspectorValue::Azimuth, 145.0);
            (void)Sun.SetInspectorValue(SunInspectorValue::Elevation, 38.0);
        }
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) (void)Sun.SetInspectorValue(SunInspectorValue::Azimuth, Sun.AzimuthDegrees - Step);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) (void)Sun.SetInspectorValue(SunInspectorValue::Azimuth, Sun.AzimuthDegrees + Step);
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow)) (void)Sun.SetInspectorValue(SunInspectorValue::Elevation, Sun.ElevationDegrees + Step);
        if (ImGui::IsKeyPressed(ImGuiKey_DownArrow)) (void)Sun.SetInspectorValue(SunInspectorValue::Elevation, Sun.ElevationDegrees - Step);
    }
}

void DrawQuickTiles(const GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Gap = 9.0f;
    const float TileWidth = (ImGui::GetContentRegionAvail().x - Gap * 2.0f) / 3.0f;
    const std::array<const char*, 3> Names{"Sunlight", "Sun disc", "Day cycle"};
    std::array<bool*, 3> Values{&Sun.SunlightEnabled, &Sun.SolarDiscEnabled, &Sun.DayCycleEnabled};
    for (size_t Index = 0; Index < Names.size(); ++Index)
    {
        if (Index > 0) ImGui::SameLine(0.0f, Gap);
        const bool Enabled = *Values[Index];
        ImGui::PushID(static_cast<int>(Index));
        ImGui::PushStyleColor(ImGuiCol_Button, Context.Theme.LightSurface ? Context.Theme.Surface2 :
                              (Enabled ? IM_COL32(50, 65, 48, 255) : IM_COL32(47, 38, 37, 255)));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 :
                              (Enabled ? IM_COL32(62, 80, 58, 255) : IM_COL32(61, 45, 44, 255)));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(74, 68, 52, 255));
        ImGui::PushStyleColor(ImGuiCol_Border, Enabled ? IM_COL32(105, 164, 115, 100) : IM_COL32(190, 103, 99, 100));
        ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 16.0f);
        ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(3.0f, 8.0f));
        if (ImGui::Button("##tile", ImVec2(TileWidth, 106.0f)))
        {
            *Values[Index] = !*Values[Index];
            if (Index == 0) Sun.SunlightEnabled = *Values[Index];
        }
        const ImVec2 Min = ImGui::GetItemRectMin();
        const ImVec2 Max = ImGui::GetItemRectMax();
        const ImU32 Accent = Enabled ? IM_COL32(105, 200, 132, 255) : IM_COL32(204, 118, 115, 255);
        const float CentreX = (Min.x + Max.x) * 0.5f;
        const float GlyphY = Min.y + 35.0f;
        ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(CentreX, GlyphY), 15.5f, Accent);
        if (Index == 0)
        {
            ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(CentreX, GlyphY), 6.0f, IM_COL32(54, 44, 27, 255));
            for (int32_t Ray = 0; Ray < 8; ++Ray)
            {
                const float Angle = Ray * 0.785398163f;
                ImGui::GetWindowDrawList()->AddLine(ImVec2(CentreX + std::cos(Angle) * 10.0f, GlyphY + std::sin(Angle) * 10.0f),
                                     ImVec2(CentreX + std::cos(Angle) * 13.0f, GlyphY + std::sin(Angle) * 13.0f),
                                     IM_COL32(54, 44, 27, 255), 1.0f);
            }
        }
        else if (Index == 1)
        {
            ImGui::GetWindowDrawList()->AddCircle(ImVec2(CentreX, GlyphY), 8.0f, IM_COL32(54, 44, 27, 255), 24, 1.3f);
        }
        else
        {
            ImGui::GetWindowDrawList()->AddCircle(ImVec2(CentreX, GlyphY), 9.0f, IM_COL32(54, 44, 27, 255), 24, 1.3f);
            ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(CentreX + 8.0f, GlyphY - 5.0f), 2.0f, IM_COL32(54, 44, 27, 255));
        }
        const float NameWidth = KitTextWidth(Context.Faces.Regular, 9.0f, Names[Index]);
        DrawText(Context, ImVec2(CentreX - NameWidth * 0.5f, Min.y + 62.0f), 9.0f, InkMain, Names[Index]);
        const char* Status = Enabled ? "ON" : "OFF";
        const float StatusWidth = KitTextWidth(Context.Faces.Regular, 7.0f, Status);
        DrawText(Context, ImVec2(CentreX - StatusWidth * 0.5f, Min.y + 81.0f), 7.0f, Accent, Status);
        ImGui::PopStyleVar(2);
        ImGui::PopStyleColor(4);
        ImGui::PopID();
    }
}

void DrawOverview(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const float VectorHeight = 70.0f + (Width - 44.0f) * (420.0f / 640.0f) + 42.0f;
    BeginCard(Context, "##solar_vector_card", "Solar vector", "01 / DIRECTION", VectorHeight,
              IM_COL32(38, 36, 28, 255), 28.0f);
    char Elevation[32]{};
    std::snprintf(Elevation, sizeof(Elevation), "%.1f", Sun.ElevationDegrees);
    DrawReadout(Context, "Elevation", Elevation, "°", 31.0f);
    ImGui::SameLine(ImGui::GetWindowWidth() - 150.0f);
    const char* Mode = Sun.AutomaticPlacementEnabled ? "Time linked ↗" : "Manual ↗";
    if (ImGui::SmallButton(Mode))
    {
        Sun.AutomaticPlacementEnabled = !Sun.AutomaticPlacementEnabled;
        if (!Sun.AutomaticPlacementEnabled) Sun.DayCycleEnabled = false;
        else Sun.RecomputeFromEphemeris();
    }
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    DrawSolarVector(Context, Sun);
    const ImVec2 Footer = ImGui::GetCursorScreenPos();
    const SpatialVector Vector = Sun.EvaluateDirectionVector();
    char XYZ[80]{};
    std::snprintf(XYZ, sizeof(XYZ), "%.2f / %.2f / %.2f", Vector.X, Vector.Y, Vector.Z);
    DrawText(Context, Footer, 8.0f, InkMuted, "WORLD XYZ · Z UP");
    const float VectorWidth = KitTextWidth(Context.Faces.Regular, 8.0f, XYZ);
    DrawText(Context, ImVec2(Context.Right - VectorWidth - Footer.x, Footer.y), 8.0f, InkMain, XYZ);
    ImGui::Dummy(ImVec2(0.0f, 17.0f));
    EndCard();

    ImGui::Columns(3, "##sun_overview_metrics", false);
    char Azimuth[32]{}, Tint[32]{}, Intensity[32]{};
    std::snprintf(Azimuth, sizeof(Azimuth), "%.1f", Sun.AzimuthDegrees);
    if (Sun.TemperatureModeEnabled) std::snprintf(Tint, sizeof(Tint), "%.0f K", Sun.ColourTemperatureKelvin);
    else std::snprintf(Tint, sizeof(Tint), "RGB");
    std::snprintf(Intensity, sizeof(Intensity), "%.1f", Sun.SolarIlluminance);
    DrawReadout(Context, "Azimuth", Azimuth, "° / +X east", 20.0f);
    ImGui::NextColumn();
    DrawReadout(Context, "Source tint", Tint, "source setting", 20.0f);
    ImGui::NextColumn();
    DrawReadout(Context, "Sunlight", Intensity, "× multiplier", 20.0f);
    ImGui::Columns(1);
    ImGui::Dummy(ImVec2(0.0f, 13.0f));
    DrawQuickTiles(Context, Sun);
    ImGui::Dummy(ImVec2(0.0f, 13.0f));

    const float AimHeight = 64.0f + 2.0f * 49.0f + 54.0f;
    BeginCard(Context, "##solar_aim_card", "Direction controls", "02 / AIM", AimHeight, IM_COL32(25, 25, 23, 255), 0.0f);
    DrawSlider(Context, Sun, SunInspectorValue::Azimuth, "Azimuth", -180.0, 180.0, 0.1, "°", 1.0, "%.1f");
    DrawSlider(Context, Sun, SunInspectorValue::Elevation, "Elevation", -90.0, 90.0, 0.1, "°", 1.0, "%.1f");
    DrawCaption(Context, "Inner horizon ring: 0°. Centre: zenith. Outer region: below horizon. Editing direction stops the day cycle and switches to manual.");
    EndCard();

    ImGui::Dummy(ImVec2(0.0f, 12.0f));
    const std::array<const char*, 4> Presets{"Noon", "Golden", "Dusk", "Night"};
    const float Gap = 6.0f;
    const float PresetWidth = (ImGui::GetContentRegionAvail().x - Gap * 3.0f) / 4.0f;
    for (int32_t Index = 0; Index < 4; ++Index)
    {
        if (Index > 0) ImGui::SameLine(0.0f, Gap);
        const bool Selected = Sun.LightingPresetIndex == Index;
        ImGui::PushStyleColor(ImGuiCol_Button, Selected ? IM_COL32(78, 62, 35, 255) : IM_COL32(37, 35, 28, 255));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(87, 71, 44, 255));
        ImGui::PushStyleColor(ImGuiCol_Border, Selected ? IM_COL32(232, 199, 139, 95) : SoftLine);
        ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 15.0f);
        if (ImGui::Button(Presets[Index], ImVec2(PresetWidth, 34.0f))) Sun.ApplyLightingPreset(Index);
        ImGui::PopStyleVar();
        ImGui::PopStyleColor(3);
    }
    ImGui::Dummy(ImVec2(0.0f, 12.0f));
}

void DrawDaylightDiagram(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    constexpr float Height = 320.0f;
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton("##sun_day_timeline", ImVec2(Width, Height));
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Solar day timeline · drag local time or use arrow keys");
    const bool Active = ImGui::IsItemActive();
    const float SX = Width / 640.0f;
    const float SY = Height / 320.0f;
    const auto Point = [&](float X, float Y) { return ImVec2(Min.x + X * SX, Min.y + Y * SY); };
    const DailySolarCurveSummary Data = Sun.EvaluateDailyElevationCurve();
    const auto ElevY = [](double Elevation) { return 160.0f - static_cast<float>(Elevation) / 90.0f * 110.0f; };
    for (const double Elevation : {-60.0, 0.0, 60.0})
    {
        const float Y = ElevY(Elevation);
        ImGui::GetWindowDrawList()->AddLine(Point(42, Y), Point(606, Y), Elevation == 0.0 ? IM_COL32(227, 202, 153, 92) : IM_COL32(227, 202, 153, 26), 1.0f);
        char Label[16]{};
        std::snprintf(Label, sizeof(Label), "%.0f°", Elevation);
        const float TextWidth = KitTextWidth(Context.Faces.Regular, 7.5f, Label);
        DrawText(Context, ImVec2(Min.x + 32.0f * SX - TextWidth, Min.y + (Y + 5.0f) * SY), 7.5f, InkMuted, Label);
    }
    std::array<ImVec2, 97> Points{};
    for (size_t Index = 0; Index < Points.size(); ++Index)
    {
        const float Hour = static_cast<float>(Index) / 4.0f;
        Points[Index] = Point(42.0f + Hour / 24.0f * 564.0f, ElevY(Data.ElevationSamplesDegrees[Index]));
    }
    ImGui::GetWindowDrawList()->AddPolyline(Points.data(), static_cast<int>(Points.size()), IM_COL32(159, 153, 122, 155), ImDrawFlags_None, 1.6f);
    std::vector<ImVec2> Daylight;
    for (size_t Index = 0; Index < Points.size(); ++Index)
    {
        if (Data.ElevationSamplesDegrees[Index] >= 0.0) Daylight.push_back(Points[Index]);
        else
        {
            if (Daylight.size() > 1) ImGui::GetWindowDrawList()->AddPolyline(Daylight.data(), static_cast<int>(Daylight.size()), IM_COL32(239, 211, 151, 255), ImDrawFlags_None, 2.6f);
            Daylight.clear();
        }
    }
    if (Daylight.size() > 1) ImGui::GetWindowDrawList()->AddPolyline(Daylight.data(), static_cast<int>(Daylight.size()), IM_COL32(239, 211, 151, 255), ImDrawFlags_None, 2.6f);
    const float TimeX = 42.0f + static_cast<float>(Sun.SolarClockHours / 24.0 * 564.0);
    ImGui::GetWindowDrawList()->AddLine(Point(TimeX, 30), Point(TimeX, 280), IM_COL32(232, 199, 139, 102), 1.0f);
    if (Sun.AutomaticPlacementEnabled)
    {
        const float CurrentY = ElevY(Sun.ElevationDegrees);
        ImGui::GetWindowDrawList()->AddCircleFilled(Point(TimeX, CurrentY), 6.0f, IM_COL32(241, 214, 158, 255));
    }
    for (const int32_t Hour : {0, 6, 12, 18, 24})
    {
        const float X = 42.0f + Hour / 24.0f * 564.0f;
        char Label[8]{};
        std::snprintf(Label, sizeof(Label), "%02d:00", Hour);
        const float TextWidth = KitTextWidth(Context.Faces.Regular, 7.5f, Label);
        DrawText(Context, ImVec2(Min.x + X * SX - TextWidth * 0.5f, Min.y + 304.0f * SY), 7.5f, InkMuted, Label);
    }
    if (Active)
    {
        if (ImGui::GetIO().MouseDown[0])
        {
            const double LocalHour = std::clamp((ImGui::GetIO().MousePos.x - Min.x) / SX - 42.0, 0.0, 564.0) / 564.0 * 24.0;
            (void)Sun.SetInspectorValue(SunInspectorValue::SolarTime, LocalHour);
        }
    }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) (void)Sun.SetInspectorValue(SunInspectorValue::SolarTime, 12.0);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow) || ImGui::IsKeyPressed(ImGuiKey_UpArrow))
            (void)Sun.SetInspectorValue(SunInspectorValue::SolarTime, Sun.SolarClockHours + 0.25);
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow) || ImGui::IsKeyPressed(ImGuiKey_DownArrow))
            (void)Sun.SetInspectorValue(SunInspectorValue::SolarTime, Sun.SolarClockHours - 0.25);
    }
}

void DrawDaylight(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const float ChartHeight = Width * 0.5f;
    BeginCard(Context, "##solar_ephemeris_card", "Solar day", "03 / EPHEMERIS", ChartHeight + 260.0f,
              IM_COL32(34, 33, 29, 255), 22.0f);
    char Clock[16]{};
    const std::string ClockText = SolarClockText(Sun.SolarClockHours);
    std::snprintf(Clock, sizeof(Clock), "%s", ClockText.c_str());
    DrawReadout(Context, "Local time", Clock, "", 24.0f);
    ImGui::SameLine(ImGui::GetWindowWidth() - 155.0f);
    const char* Mode = Sun.DayCycleEnabled ? "Cycle running" : Sun.AutomaticPlacementEnabled ? "Time linked" : "Manual direction";
    ImGui::TextColored(ImVec4(0.91f, 0.78f, 0.54f, 1.0f), "%s", Mode);
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    DrawDaylightDiagram(Context, Sun);
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    const DailySolarCurveSummary Curve = Sun.EvaluateDailyElevationCurve();
    const std::string Rise = Curve.SunriseHour < 0.0 ? "—" : SolarClockText(Curve.SunriseHour);
    const std::string Set = Curve.SunsetHour < 0.0 ? "—" : SolarClockText(Curve.SunsetHour);
    const std::string DayHours = std::to_string(Curve.DaylightSpanHours).substr(0, 3);
    ImGui::Columns(3, "##sun_day_metrics", false);
    DrawReadout(Context, "Horizon rise", Rise.c_str(), "");
    ImGui::NextColumn();
    DrawReadout(Context, "Horizon set", Set.c_str(), "");
    ImGui::NextColumn();
    DrawReadout(Context, "Above horizon", DayHours.c_str(), "h");
    ImGui::Columns(1);
    ImGui::Dummy(ImVec2(0.0f, 16.0f));
    DrawCaption(Context, "Date/location solver · geometric 0° crossings, without refraction or terrain. This path is a reference while direction is manual, not recorded telemetry.");
    DrawSlider(Context, Sun, SunInspectorValue::SolarTime, "Local solar control time", 0.0, 24.0, 0.01, "h", 1.0, "%.2f");
    DrawSlider(Context, Sun, SunInspectorValue::DayDuration, "Full day duration", 0.01, 24.0, 0.01, "real h", 1.0, "%.2f");
    EndCard();

    const float LocationHeight = 100.0f + 5.0f * 48.0f + 44.0f;
    BeginCard(Context, "##solar_coordinates_card", "Time & location", "04 / COORDINATES", LocationHeight,
              IM_COL32(33, 31, 26, 255), 8.0f);
    ImGui::TextColored(ImVec4(0.72f, 0.68f, 0.59f, 1.0f), "Calendar date");
    ImGui::SameLine();
    char Date[16]{};
    std::snprintf(Date, sizeof(Date), "%s", Sun.CalendarDateIso.c_str());
    ImGui::SetNextItemWidth(ImGui::GetContentRegionAvail().x);
    if (ImGui::InputText("##SolarCalendarDate", Date, sizeof(Date))) Sun.SetCalendarDate(Date);
    DrawSlider(Context, Sun, SunInspectorValue::Latitude, "Latitude", -90.0, 90.0, 0.01, "°", 1.0, "%.2f");
    DrawSlider(Context, Sun, SunInspectorValue::Longitude, "Longitude", -180.0, 180.0, 0.01, "°", 1.0, "%.2f");
    DrawSlider(Context, Sun, SunInspectorValue::TimeZone, "UTC offset", -12.0, 14.0, 0.5, "h", 1.0, "%.1f");
    DrawCaption(Context, "Changing time, date or location links the Sun to the existing celestial solver. The day-cycle switch stays in the Overview quick toggles.");
    EndCard();
}

void DrawLight(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float LightHeight = 100.0f + 4.0f * 48.0f + 105.0f;
    BeginCard(Context, "##solar_radiance_card", "Light source", "05 / RADIANCE", LightHeight,
              IM_COL32(35, 34, 28, 255), 20.0f);
    char Intensity[24]{};
    std::snprintf(Intensity, sizeof(Intensity), "%.1f", Sun.SolarIlluminance);
    DrawReadout(Context, "Sunlight intensity", Intensity, "×", 22.0f);
    DrawSlider(Context, Sun, SunInspectorValue::SolarIlluminance, "Sunlight multiplier", 0.0, 60.0, 0.1, "×", 1.0, "%.1f");
    DrawCaption(Context, "Exhibit intensity multiplier, not a measured lux or irradiance value. Atmospheric transmission is applied by the renderer.");

    ImGui::TextColored(ImVec4(0.72f, 0.66f, 0.54f, 1.0f), "Colour source");
    ImGui::SameLine();
    const char* Current = Sun.TemperatureModeEnabled ? "Temperature" : "RGB";
    if (ImGui::BeginCombo("##SunColourSource", Current))
    {
        if (ImGui::Selectable("Temperature", Sun.TemperatureModeEnabled)) Sun.TemperatureModeEnabled = true;
        if (ImGui::Selectable("RGB", !Sun.TemperatureModeEnabled)) Sun.TemperatureModeEnabled = false;
        ImGui::EndCombo();
    }
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    ImGui::TextColored(ImVec4(0.72f, 0.66f, 0.54f, 1.0f), "Sun Tint");
    ImGui::SameLine();
    float Tint[3]{static_cast<float>(std::pow(std::clamp(Sun.CustomTintRed, 0.0, 1.0), 1.0 / 2.2)),
                  static_cast<float>(std::pow(std::clamp(Sun.CustomTintGreen, 0.0, 1.0), 1.0 / 2.2)),
                  static_cast<float>(std::pow(std::clamp(Sun.CustomTintBlue, 0.0, 1.0), 1.0 / 2.2))};
    const int32_t Red = static_cast<int32_t>(Tint[0] * 255.0f + 0.5f);
    const int32_t Green = static_cast<int32_t>(Tint[1] * 255.0f + 0.5f);
    const int32_t Blue = static_cast<int32_t>(Tint[2] * 255.0f + 0.5f);
    char Hex[8]{};
    std::snprintf(Hex, sizeof(Hex), "#%02X%02X%02X", Red, Green, Blue);
    const float TintPillWidth = std::min(172.0f, ImGui::GetContentRegionAvail().x);
    const ImVec2 TintPillAt = ImGui::GetCursorScreenPos();
    if (ImGui::InvisibleButton("##SunTintPill", ImVec2(TintPillWidth, 34.0f))) ImGui::OpenPopup("##SunTintPicker");
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Sun Tint");
    ImGui::GetWindowDrawList()->AddRectFilled(TintPillAt,
        ImVec2(TintPillAt.x + TintPillWidth, TintPillAt.y + 34.0f),
        Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(232, 199, 139, 20), 17.0f);
    ImGui::GetWindowDrawList()->AddRect(TintPillAt,
        ImVec2(TintPillAt.x + TintPillWidth, TintPillAt.y + 34.0f),
        Context.Theme.LightSurface ? Context.Theme.Line : IM_COL32(232, 199, 139, 48), 17.0f, 0, 1.0f);
    ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(TintPillAt.x + 17.0f, TintPillAt.y + 17.0f), 7.0f,
                                                ImGui::ColorConvertFloat4ToU32(ImVec4(Tint[0], Tint[1], Tint[2], 1.0f)));
    DrawText(Context, ImVec2(TintPillAt.x + 33.0f, TintPillAt.y + 11.0f), 8.5f,
             Context.Theme.LightSurface ? Context.Theme.Text : IM_COL32(229, 216, 186, 255), Hex);
    DrawText(Context, ImVec2(TintPillAt.x + TintPillWidth - 20.0f, TintPillAt.y + 10.0f), 9.0f,
             InkMuted, "↗");
    if (ImGui::BeginPopup("##SunTintPicker"))
    {
        if (ImGui::ColorPicker3("Sun Tint", Tint, ImGuiColorEditFlags_NoAlpha))
            Sun.SetCustomTint(std::pow(Tint[0], 2.2), std::pow(Tint[1], 2.2), std::pow(Tint[2], 2.2));
        ImGui::EndPopup();
    }
    DrawSlider(Context, Sun, SunInspectorValue::ColourTemperature, "Colour temperature", 2000.0, 10000.0, 50.0, "K", 1.0, "%.0f");
    EndCard();

    const float SpectrumChartHeight = ImGui::GetContentRegionAvail().x * (280.0f / 640.0f);
    const float SpectrumHeight = SpectrumChartHeight + 205.0f;
    BeginCard(Context, "##solar_spectrum_card", "Source spectrum", "06 / REFERENCE", SpectrumHeight,
              IM_COL32(37, 36, 30, 255), 20.0f);
    char Temperature[24]{};
    std::snprintf(Temperature, sizeof(Temperature), "%.0f", Sun.ColourTemperatureKelvin);
    DrawReadout(Context, "Thermal reference", Temperature, "K", 27.0f);
    ImGui::SameLine(ImGui::GetWindowWidth() - 180.0f);
    const char* ColourMode = Sun.TemperatureModeEnabled ? "Temperature source" : "RGB source · reference only";
    ImGui::TextColored(ImVec4(0.78f, 0.69f, 0.51f, 1.0f), "%s", ColourMode);
    ImGui::Dummy(ImVec2(0.0f, 9.0f));

    const float ChartWidth = ImGui::GetContentRegionAvail().x;
    const float ChartHeightPx = ChartWidth * (280.0f / 640.0f);
    const float SX = ChartWidth / 640.0f;
    const float SY = ChartHeightPx / 280.0f;
    const ImVec2 ChartMin = ImGui::GetCursorScreenPos();
    ImGui::Dummy(ImVec2(ChartWidth, ChartHeightPx));
    const ImVec2 ChartMax(ChartMin.x + ChartWidth, ChartMin.y + ChartHeightPx);
    ImGui::GetWindowDrawList()->AddRectFilled(ChartMin, ChartMax,
                                              Context.Theme.LightSurface ? Context.Theme.Surface : IM_COL32(28, 28, 25, 255), 10.0f);
    constexpr int32_t Bands = 100;
    const std::array<ImU32, 6> Stops{IM_COL32(143, 129, 181, 255), IM_COL32(130, 167, 213, 255),
                                    IM_COL32(145, 189, 172, 255), IM_COL32(214, 199, 126, 255),
                                    IM_COL32(202, 138, 118, 255), IM_COL32(143, 129, 181, 255)};
    for (int32_t Index = 0; Index < Bands; ++Index)
    {
        const float T = static_cast<float>(Index) / (Bands - 1);
        const float Segment = T * 5.0f;
        const size_t Stop = std::min<size_t>(4, static_cast<size_t>(Segment));
        const float Local = Segment - static_cast<float>(Stop);
        const auto Mix = [&](int Shift) {
            const float A = static_cast<float>((Stops[Stop] >> Shift) & 0xffu);
            const float B = static_cast<float>((Stops[Stop + 1] >> Shift) & 0xffu);
            return static_cast<int>((A + (B - A) * Local) + 0.5f);
        };
        const ImU32 Colour = IM_COL32(Mix(0), Mix(8), Mix(16), 255);
        const float X0 = ChartMin.x + T * ChartWidth;
        const float X1 = ChartMin.x + (Index + 1) / static_cast<float>(Bands) * ChartWidth;
        ImGui::GetWindowDrawList()->AddRectFilled(ImVec2(X0, ChartMin.y + ChartHeightPx - 13.0f),
                                   ImVec2(X1 + 1.0f, ChartMin.y + ChartHeightPx - 6.0f), Colour);
    }
    std::array<double, 65> Spectrum{};
    double WienPeak = 0.0;
    Sun.EvaluatePlanckSpectrum(Spectrum, WienPeak);
    std::array<ImVec2, 65> SpectrumPoints{};
    for (size_t Index = 0; Index < Spectrum.size(); ++Index)
    {
        const float X = ChartMin.x + (32.0f + static_cast<float>(Index) / 64.0f * 576.0f) * SX;
        const float Y = ChartMin.y + (204.0f - static_cast<float>(Spectrum[Index]) * 165.0f) * SY;
        SpectrumPoints[Index] = ImVec2(X, Y);
    }
    const std::array<ImU32, 5> SpectrumStops{IM_COL32(143, 129, 181, 255), IM_COL32(130, 167, 213, 255),
                                             IM_COL32(145, 189, 172, 255), IM_COL32(214, 199, 126, 255),
                                             IM_COL32(202, 138, 118, 255)};
    for (size_t Index = 0; Index + 1 < SpectrumPoints.size(); ++Index)
    {
        const float T = static_cast<float>(Index) / 64.0f;
        const float Segment = T * 4.0f;
        const size_t Stop = std::min<size_t>(3, static_cast<size_t>(Segment));
        const float Local = Segment - static_cast<float>(Stop);
        const auto Mix = [&](int Shift) {
            const float A = static_cast<float>((SpectrumStops[Stop] >> Shift) & 0xffu);
            const float B = static_cast<float>((SpectrumStops[Stop + 1] >> Shift) & 0xffu);
            return static_cast<int>(A + (B - A) * Local + 0.5f);
        };
        const ImU32 Fill = IM_COL32(Mix(0), Mix(8), Mix(16), 56);
        const ImVec2 Baseline0(ChartMin.x + (32.0f + static_cast<float>(Index) / 64.0f * 576.0f) * SX,
                               ChartMin.y + 204.0f * SY);
        const ImVec2 Baseline1(ChartMin.x + (32.0f + static_cast<float>(Index + 1) / 64.0f * 576.0f) * SX,
                               ChartMin.y + 204.0f * SY);
        ImGui::GetWindowDrawList()->AddQuadFilled(SpectrumPoints[Index], SpectrumPoints[Index + 1],
                                                  Baseline1, Baseline0, Fill);
    }
    ImGui::GetWindowDrawList()->AddPolyline(SpectrumPoints.data(), static_cast<int>(SpectrumPoints.size()),
                                             ResolveInk(Context, InkMain), ImDrawFlags_None, 2.5f);
    const double PeakPosition = 2897771.955 / Sun.ColourTemperatureKelvin;
    if (PeakPosition >= 380.0 && PeakPosition <= 780.0)
    {
        const float X = (32.0f + static_cast<float>((PeakPosition - 380.0) / 400.0 * 576.0)) * SX;
        ImGui::GetWindowDrawList()->AddLine(ImVec2(ChartMin.x + X, ChartMin.y + 28.0f * SY),
                                            ImVec2(ChartMin.x + X, ChartMin.y + 204.0f * SY),
                                            IM_COL32(238, 214, 166, 112), 1.0f);
        ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(ChartMin.x + X, ChartMin.y + 39.0f * SY),
                                                    5.0f * SX, IM_COL32(240, 212, 157, 255));
        DrawText(Context, ImVec2(ChartMin.x + X - 14.0f * SX, ChartMin.y + 19.0f * SY), 7.0f,
                 InkMuted, "λ MAX");
    }
    for (const float Y : {28.0f, 80.0f, 132.0f, 184.0f})
        ImGui::GetWindowDrawList()->AddLine(ImVec2(ChartMin.x + 32.0f * SX, ChartMin.y + Y * SY),
                                            ImVec2(ChartMin.x + 608.0f * SX, ChartMin.y + Y * SY),
                                            IM_COL32(234, 214, 173, 26), 1.0f);
    for (const int32_t Nanometres : {380, 480, 580, 680, 780})
    {
        const float X = (32.0f + (Nanometres - 380.0f) / 400.0f * 576.0f) * SX;
        const char* Label = nullptr;
        char Value[8]{};
        std::snprintf(Value, sizeof(Value), "%d", Nanometres);
        Label = Value;
        const float TextWidth = KitTextWidth(Context.Faces.Regular, 7.0f, Label);
        DrawText(Context, ImVec2(ChartMin.x + X - TextWidth * 0.5f, ChartMin.y + 252.0f * SY), 7.0f,
                 InkMuted, Label);
    }
    DrawText(Context, ImVec2(ChartMin.x + ChartWidth * 0.5f - 58.0f, ChartMin.y + 272.0f * SY),
             6.5f, InkMuted, "VISIBLE WAVELENGTH / nm");
    ImGui::Dummy(ImVec2(0.0f, 11.0f));
    ImGui::Columns(2, "##sun_spectrum_stats", false);
    char PeakValue[24]{};
    std::snprintf(PeakValue, sizeof(PeakValue), "%.0f", WienPeak);
    DrawReadout(Context, "Blackbody peak", PeakValue, "nm", 21.0f);
    ImGui::NextColumn();
    DrawReadout(Context, "Visible window", "380–780", "nm", 21.0f);
    ImGui::Columns(1);
    DrawCaption(Context, "Normalised thermal reference, not measured radiance. The renderer uses its existing RGB approximation; RGB mode uses your custom tint. The blackbody peak may fall outside the visible window.");
    EndCard();
}

void DrawDiscDiagram(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const float Height = Width * (280.0f / 640.0f);
    const ImVec2 Min = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton("##sun_disc_canvas", ImVec2(Width, Height));
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Solar disc size editor · drag horizontally or use arrow keys");
    const bool Active = ImGui::IsItemActive();
    const float SX = Width / 640.0f;
    const float SY = Height / 280.0f;
    const auto Pt = [&](float X, float Y) { return ImVec2(Min.x + X * SX, Min.y + Y * SY); };
    const ImVec2 Centre = Pt(320.0f, 130.0f);
    for (const float Radius : {45.0f, 85.0f, 118.0f}) ImGui::GetWindowDrawList()->AddCircle(Centre, Radius * SX, IM_COL32(232, 199, 139, 34), 64, 1.0f);
    ImGui::GetWindowDrawList()->AddLine(Pt(180, 130), Pt(460, 130), IM_COL32(232, 199, 139, 42), 1.0f);
    ImGui::GetWindowDrawList()->AddLine(Pt(320, 5), Pt(320, 255), IM_COL32(232, 199, 139, 42), 1.0f);
    const float Radius = 12.0f + static_cast<float>(Sun.SolarRadiusDegrees) / 2.0f * 76.0f;
    const int Segments = 48;
    ImGui::GetWindowDrawList()->AddCircleFilled(Centre, (Radius + 42.0f) * SX,
                                 IM_COL32(232, 199, 139, static_cast<int>(std::clamp(Sun.AureoleGlow * 9.0, 0.0, 40.0))), Segments);
    ImGui::GetWindowDrawList()->AddCircleFilled(Centre, Radius * SX,
                                 Sun.SolarDiscEnabled ? IM_COL32(241, 215, 166, 255) : IM_COL32(119, 110, 91, 255), Segments);
    ImGui::GetWindowDrawList()->AddLine(Pt(320.0f - Radius, 130), Pt(320.0f + Radius, 130), IM_COL32(255, 243, 207, 102), 1.0f);
    DrawText(Context, Pt(24, 261), 7.0f, InkMuted, "ANGULAR SIZE / EXAGGERATED");
    if (Active && ImGui::GetIO().MouseDown[0])
    {
        const float DeltaX = ImGui::GetIO().MouseDelta.x / SX;
        (void)Sun.SetInspectorValue(SunInspectorValue::SolarRadius, Sun.SolarRadiusDegrees + DeltaX * 0.005);
    }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) (void)Sun.SetInspectorValue(SunInspectorValue::SolarRadius, 0.27);
        const double Step = ImGui::GetIO().KeyShift ? 0.1 : 0.01;
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow) || ImGui::IsKeyPressed(ImGuiKey_UpArrow))
            (void)Sun.SetInspectorValue(SunInspectorValue::SolarRadius, Sun.SolarRadiusDegrees + Step);
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow) || ImGui::IsKeyPressed(ImGuiKey_DownArrow))
            (void)Sun.SetInspectorValue(SunInspectorValue::SolarRadius, Sun.SolarRadiusDegrees - Step);
    }
}

void DrawDisc(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    const float CardHeight = 100.0f + Width * (280.0f / 640.0f) + 2.0f * 50.0f + 60.0f;
    BeginCard(Context, "##solar_disc_card", "Apparent solar disc", "07 / ANGULAR SIZE", CardHeight,
              IM_COL32(36, 34, 27, 255), 24.0f);
    char Diameter[24]{};
    std::snprintf(Diameter, sizeof(Diameter), "%.2f", Sun.SolarRadiusDegrees * 2.0);
    DrawReadout(Context, "Angular diameter", Diameter, "°", 23.0f);
    ImGui::Dummy(ImVec2(0.0f, 8.0f));
    DrawDiscDiagram(Context, Sun);
    DrawSlider(Context, Sun, SunInspectorValue::SolarRadius, "Angular diameter", 0.05, 2.0, 0.01, "°", 2.0, "%.2f");
    DrawSlider(Context, Sun, SunInspectorValue::AureoleGlow, "Optical aureole", 0.0, 3.0, 0.01, "×", 1.0, "%.2f");
    DrawCaption(Context, "Disc diagram is exaggerated for editing; the sky uses the actual angular diameter. The Sun disc quick toggle remains in Overview.");
    EndCard();

    BeginCard(Context, "##solar_optics_link", "Connected optics", "08 / SUBCOMPONENT", 146.0f,
              IM_COL32(30, 30, 27, 255), 18.0f);
    DrawCaption(Context, "Lens flare is a separate optical subcomponent. Opening it does not change sunlight or exposure.");
    if (ImGui::Button("Open Lens Flare   ↗") && Context.DirectoryPanel != nullptr && Sun.LinkedLensFlareToken.IsValid())
        Context.DirectoryPanel->Select(Sun.LinkedLensFlareToken);
    EndCard();
}

void DrawHeader(GlobalInspectorPresentationContext& Context, SunRecord& Sun)
{
    const float HeaderTop = Context.BodyTop;
    DrawText(Context, ImVec2(Context.Left, HeaderTop), 8.5f, InkMuted, "ENVIRONMENT  /  02", Context.Faces.Medium);
    DrawText(Context, ImVec2(Context.Left, HeaderTop + 15.0f), 28.0f, InkMain, "Sun", Context.Faces.Light);
    DrawText(Context, ImVec2(Context.Left, HeaderTop + 49.0f), 9.5f, InkMuted,
             "Directional light / position & colour.");
    ImGui::SetCursorScreenPos(ImVec2(Context.Right - 102.0f, HeaderTop + 16.0f));
    ImGui::PushStyleColor(ImGuiCol_Button, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(232, 199, 139, 20));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(232, 199, 139, 42));
    ImGui::PushStyleColor(ImGuiCol_Border, Context.Theme.LightSurface ? Context.Theme.Line : IM_COL32(232, 199, 139, 54));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 20.0f);
    if (ImGui::SmallButton("Reset ↗")) Sun.ResetDefaults();
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Reset Sun settings");
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(3);
    ImGui::SetCursorScreenPos(ImVec2(Context.Left, HeaderTop + 79.0f));
}

} // namespace

void DrawSolarInspectorPanel(GlobalInspectorPresentationContext& Context)
{
    auto* Sun = static_cast<SunRecord*>(Context.Descriptor->PayloadAddress);
    if (Sun == nullptr) return;
    const ImVec2 Window = ImGui::GetWindowPos();
    const ImVec2 WindowSize = ImGui::GetWindowSize();
    ImGui::GetWindowDrawList()->AddRectFilled(Window, ImVec2(Window.x + WindowSize.x, Window.y + WindowSize.y),
                                              Context.Theme.PanelBg);
    ImGui::GetWindowDrawList()->AddRect(Window, ImVec2(Window.x + WindowSize.x, Window.y + WindowSize.y),
                                        Context.Theme.PanelEdge);
    DrawHeader(Context, *Sun);

    ImGui::PushID(static_cast<int>(Context.Selected.Value & 0x7fffffffu));
    ImGui::PushStyleColor(ImGuiCol_Tab, Context.Theme.LightSurface ? Context.Theme.Surface : IM_COL32(37, 36, 30, 255));
    ImGui::PushStyleColor(ImGuiCol_TabHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(53, 49, 38, 255));
    ImGui::PushStyleColor(ImGuiCol_TabActive, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(54, 51, 41, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, InkMain);
    ImGui::PushStyleVar(ImGuiStyleVar_TabRounding, 8.0f);
    if (ImGui::BeginTabBar("##sun_observatory_tabs", ImGuiTabBarFlags_FittingPolicyScroll))
    {
        const std::array<const char*, 4> Tabs{"Overview", "Daylight", "Light & colour", "Disc & optics"};
        for (int32_t Index = 0; Index < static_cast<int32_t>(Tabs.size()); ++Index)
        {
            const ImGuiTabItemFlags Flags = Sun->ActiveSectionIndex == Index ? ImGuiTabItemFlags_SetSelected : ImGuiTabItemFlags_None;
            if (!ImGui::BeginTabItem(Tabs[static_cast<size_t>(Index)], nullptr, Flags)) continue;
            if (ImGui::IsItemActivated()) Sun->ActiveSectionIndex = Index;
            ImGui::PushStyleColor(ImGuiCol_ChildBg, Context.Theme.PanelBg);
            ImGui::BeginChild("##sun_tab_content", ImVec2(0.0f, 0.0f), false, ImGuiWindowFlags_AlwaysVerticalScrollbar);
            ImGui::SetCursorPosX(10.0f);
            ImGui::SetCursorPosY(9.0f);
            switch (Index)
            {
                case 0: DrawOverview(Context, *Sun); break;
                case 1: DrawDaylight(Context, *Sun); break;
                case 2: DrawLight(Context, *Sun); break;
                case 3: DrawDisc(Context, *Sun); break;
                default: break;
            }
            ImGui::EndChild();
            ImGui::PopStyleColor();
            ImGui::EndTabItem();
        }
        ImGui::EndTabBar();
    }
    const ImVec2 FooterMin(Context.Left, Window.y + WindowSize.y - 22.0f);
    ImGui::GetWindowDrawList()->AddLine(FooterMin, ImVec2(Context.Right, FooterMin.y),
                                        Context.Theme.LightSurface ? Context.Theme.LineSoft : IM_COL32(232, 199, 139, 22), 1.0f);
    DrawText(Context, ImVec2(FooterMin.x, FooterMin.y + 6.0f), 7.0f, InkMuted, "DIRECTIONAL LIGHT / Z UP");
    const char* FooterStatus = "Settings apply live ↗";
    const float FooterStatusWidth = KitTextWidth(Context.Faces.Regular, 7.0f, FooterStatus);
    DrawText(Context, ImVec2(Context.Right - FooterStatusWidth, FooterMin.y + 6.0f), 7.0f, InkMuted, FooterStatus);
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(4);
    ImGui::PopID();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
