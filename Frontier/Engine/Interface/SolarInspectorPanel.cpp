/*==========================================================================================================================================
                                            SUN INSPECTOR PANEL
==========================================================================================================================================*/
// 🧩 Independent global Engine Inspector content module, dispatched by the shared docked Inspector shell.

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
void DrawSolarInspectorPanel(GlobalInspectorPresentationContext& Context)
{

auto* Sun = static_cast<SunRecord*>(Context.Descriptor->PayloadAddress);
float Y = Context.BodyTop;
Context.PresentSection(Y, "01 / SOLAR OBSERVATORY", "Overview · direction & source");
const ImVec2 DiagramMin(Context.Left + 2.0f, Y);
const float DiagramSize = std::min(Context.Width - 4.0f, 124.0f);
const ImVec2 Centre(DiagramMin.x + DiagramSize * 0.5f, DiagramMin.y + DiagramSize * 0.50f);
Context.Ink->AddCircle(Centre, DiagramSize * 0.42f, Context.Theme.Line, 64, 1.0f);
Context.Ink->AddCircle(Centre, DiagramSize * 0.22f, Context.Theme.LineSoft, 64, 1.0f);
Context.Ink->AddLine(ImVec2(DiagramMin.x + 5.0f, Centre.y), ImVec2(DiagramMin.x + DiagramSize - 5.0f, Centre.y), Context.Theme.LineSoft, 1.0f);
Context.Ink->AddLine(ImVec2(Centre.x, DiagramMin.y + 5.0f), ImVec2(Centre.x, DiagramMin.y + DiagramSize - 5.0f), Context.Theme.LineSoft, 1.0f);
const double Azimuth = Sun->AzimuthDegrees * 0.017453292519943295;
const double Elevation = std::clamp(Sun->ElevationDegrees, -90.0, 90.0) * 0.017453292519943295;
const float Radius = DiagramSize * 0.42f;
const ImVec2 SunPoint(Centre.x + float(std::cos(Azimuth) * std::cos(Elevation)) * Radius,
                      Centre.y - float(std::sin(Elevation)) * Radius);
Context.Ink->AddLine(Centre, SunPoint, Context.Accent, 2.0f);
Context.Ink->AddCircleFilled(SunPoint, 5.0f, Context.Accent);
char DirectionValue[64] = {};
std::snprintf(DirectionValue, sizeof(DirectionValue), "%+.0f° / %.0f°", Sun->ElevationDegrees, Sun->AzimuthDegrees);
Context.PresentMetric(DiagramMin.x + DiagramSize + 18.0f, DiagramMin.y + 8.0f, "ALTITUDE / AZIMUTH", DirectionValue, "ELEV / AZIM", Context.Accent);
Y += DiagramSize + 10.0f;
Context.PositionControls(Y);
if (Context.PresentPill("Sunlight", Sun->SunlightEnabled ? "LIVE" : "OFF", Sun->SunlightEnabled, "##SunlightQuick"))
    Sun->SunlightEnabled = !Sun->SunlightEnabled;
if (Context.PresentPill("Sun disc", Sun->SolarDiscEnabled ? "LIVE" : "OFF", Sun->SolarDiscEnabled, "##SolarDiscQuick"))
    Sun->SolarDiscEnabled = !Sun->SolarDiscEnabled;
if (Context.PresentPill("Day cycle", Sun->DayCycleEnabled ? "RUNNING" : "PAUSED", Sun->DayCycleEnabled, "##SolarCycleQuick"))
    Sun->DayCycleEnabled = !Sun->DayCycleEnabled;
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "02 / POSITION & LIGHT", "Solar controls");
Context.PositionControls(Y);
if (Context.PresentScalar("Elevation", &Sun->ElevationDegrees, -90.0, 90.0, "%.1f°"))
{
    Sun->AutomaticPlacementEnabled = false;
    Sun->DayCycleEnabled = false;
}
if (Context.PresentScalar("Azimuth", &Sun->AzimuthDegrees, -180.0, 180.0, "%.1f°"))
{
    Sun->AutomaticPlacementEnabled = false;
    Sun->DayCycleEnabled = false;
}
(void)Context.PresentScalar("Solar illuminance", &Sun->SolarIlluminance, 0.0, 60.0, "%.2f×");
if (Context.PresentPill("Placement", Sun->AutomaticPlacementEnabled ? "AUTOMATIC" : "MANUAL",
             Sun->AutomaticPlacementEnabled, "##SolarPlacementMode"))
{
    Sun->AutomaticPlacementEnabled = !Sun->AutomaticPlacementEnabled;
    if (Sun->AutomaticPlacementEnabled) Sun->RecomputeFromEphemeris();
}
if (Context.PresentPill("Lighting preset", "Noon / Golden / Dusk / Night", false, "##SolarPresets"))
    ImGui::OpenPopup("##SolarPresetMenu");
if (ImGui::BeginPopup("##SolarPresetMenu"))
{
    if (ImGui::Selectable("Noon")) Sun->ApplyLightingPreset(0);
    if (ImGui::Selectable("Golden")) Sun->ApplyLightingPreset(1);
    if (ImGui::Selectable("Dusk")) Sun->ApplyLightingPreset(2);
    if (ImGui::Selectable("Night")) Sun->ApplyLightingPreset(3);
    ImGui::EndPopup();
}
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "03 / DAYLIGHT", "Daily solar path · geometric horizon");
const DailySolarCurveSummary Curve = Sun->EvaluateDailyElevationCurve();
const float PlotTop = Y;
const float PlotHeight = 74.0f;
Context.Ink->AddRectFilled(ImVec2(Context.Left + 2.0f, PlotTop), ImVec2(Context.Right - 2.0f, PlotTop + PlotHeight), Context.Theme.Surface2, 7.0f);
Context.Ink->AddLine(ImVec2(Context.Left + 8.0f, PlotTop + PlotHeight * 0.71f), ImVec2(Context.Right - 8.0f, PlotTop + PlotHeight * 0.71f), Context.Theme.Line, 1.0f);
std::vector<ImVec2> SolarPoints;
SolarPoints.reserve(Curve.ElevationSamplesDegrees.size());
for (size_t Index = 0; Index < Curve.ElevationSamplesDegrees.size(); ++Index)
{
    const float X = Context.Left + 8.0f + float(Index) / 96.0f * (Context.Width - 16.0f);
    const float NormalizedElevation = float((Curve.ElevationSamplesDegrees[Index] + 20.0) / 110.0);
    const float Z = PlotTop + PlotHeight - 8.0f - std::clamp(NormalizedElevation, 0.0f, 1.0f) * (PlotHeight - 16.0f);
    SolarPoints.emplace_back(X, Z);
}
Context.Ink->AddPolyline(SolarPoints.data(), static_cast<int>(SolarPoints.size()), Context.Accent, ImDrawFlags_None, 2.0f);
char Sunrise[48] = {}, Sunset[48] = {}, Daylight[48] = {};
if (Curve.SunriseHour >= 0.0)
{
    std::snprintf(Sunrise, sizeof(Sunrise), "%02.0f:%02.0f", std::floor(Curve.SunriseHour),
                  std::fmod(Curve.SunriseHour, 1.0) * 60.0);
}
else
{
    std::snprintf(Sunrise, sizeof(Sunrise), "Polar");
}
if (Curve.SunsetHour >= 0.0)
{
    std::snprintf(Sunset, sizeof(Sunset), "%02.0f:%02.0f", std::floor(Curve.SunsetHour),
                  std::fmod(Curve.SunsetHour, 1.0) * 60.0);
}
else
{
    std::snprintf(Sunset, sizeof(Sunset), "Polar");
}
std::snprintf(Daylight, sizeof(Daylight), "%.1f h", Curve.DaylightSpanHours);
Context.PresentMetric(Context.Left + 2.0f, PlotTop + PlotHeight + 8.0f, "SUNRISE", Sunrise, "local", Context.Accent);
Context.PresentMetric(Context.Left + Context.Width * 0.40f, PlotTop + PlotHeight + 8.0f, "SUNSET", Sunset, "local", Context.Accent);
Context.PresentMetric(Context.Left + Context.Width * 0.74f, PlotTop + PlotHeight + 8.0f, "DAYLIGHT", Daylight, "today", Context.Accent);
Y = PlotTop + PlotHeight + 58.0f;
Context.PresentSection(Y, "04 / SPECTRUM & OPTICS", "Light, colour & solar disc");
Context.PositionControls(Y);
if (Context.PresentScalar("Colour temperature", &Sun->ColourTemperatureKelvin, 2000.0, 10000.0, "%.0f K"))
    Sun->TemperatureModeEnabled = true;
(void)Context.PresentCheckbox("Planck temperature tint", &Sun->TemperatureModeEnabled);
(void)Context.PresentScalar("Solar angular radius", &Sun->SolarRadiusDegrees, 0.05, 2.0, "%.3f°");
(void)Context.PresentScalar("Aureole glow", &Sun->AureoleGlow, 0.0, 3.0, "%.2f×");
Y = ImGui::GetCursorScreenPos().y + 5.0f;
std::array<double, 65> PlanckSamples{};
double WienPeakNanometres = 0.0;
Sun->EvaluatePlanckSpectrum(PlanckSamples, WienPeakNanometres);
const ImVec2 SpectrumMin(Context.Left + 2.0f, Y);
const float SpectrumWidth = Context.Width - 4.0f;
const float SpectrumHeight = 54.0f;
Context.Ink->AddRectFilled(SpectrumMin, ImVec2(SpectrumMin.x + SpectrumWidth, SpectrumMin.y + SpectrumHeight),
                   Context.Theme.Surface2, 7.0f);
std::array<ImVec2, 65> SpectrumPoints{};
for (size_t Index = 0; Index < PlanckSamples.size(); ++Index)
{
    SpectrumPoints[Index] = ImVec2(
        SpectrumMin.x + 7.0f + float(Index) / 64.0f * (SpectrumWidth - 14.0f),
        SpectrumMin.y + SpectrumHeight - 8.0f - float(PlanckSamples[Index]) * (SpectrumHeight - 18.0f));
}
Context.Ink->AddPolyline(SpectrumPoints.data(), static_cast<int>(SpectrumPoints.size()), Context.Accent, ImDrawFlags_None, 1.8f);
char PeakLabel[48] = {};
std::snprintf(PeakLabel, sizeof(PeakLabel), "PLANCK REFERENCE · WIEN PEAK %.0f nm", WienPeakNanometres);
Context.PresentText(SpectrumMin.x + 8.0f, SpectrumMin.y + SpectrumHeight - 14.0f, 8.0f, Context.Theme.Muted, PeakLabel);
Context.PositionControls(Y + SpectrumHeight + 8.0f);
if (ImGui::Button("Reset Sun settings")) Sun->ResetDefaults();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
