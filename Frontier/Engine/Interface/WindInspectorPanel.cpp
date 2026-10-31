/*==========================================================================================================================================
                                            WIND INSPECTOR PANEL
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
void DrawWindInspectorPanel(GlobalInspectorPresentationContext& Context)
{

auto* Wind = static_cast<WindFieldRecord*>(Context.Descriptor->PayloadAddress);
float Y = Context.BodyTop;
Context.PresentSection(Y, "01 / SHARED FORCE FIELD", "Flow · source bearing & velocity");
const ImVec2 CompassCentre(Context.Left + Context.Width * 0.5f, Y + 59.0f);
const float CompassRadius = std::min(Context.Width * 0.28f, 54.0f);
ImGui::SetCursorScreenPos(ImVec2(Context.Left, Y));
ImGui::InvisibleButton("##WindCompassRose", ImVec2(Context.Width, CompassRadius * 2.0f + 22.0f));
if (ImGui::IsItemActive())
{
    const ImVec2 Pointer = ImGui::GetIO().MousePos;
    const double DeltaX = Pointer.x - CompassCentre.x;
    const double DeltaY = CompassCentre.y - Pointer.y;
    double Bearing = std::atan2(DeltaX, DeltaY) * 57.29577951308232;
    if (Bearing < 0.0) Bearing += 360.0;
    Wind->TravelBearingDegrees = Bearing;
}
Context.Ink->AddCircle(CompassCentre, CompassRadius, Context.Theme.Line, 64, 1.2f);
Context.Ink->AddCircle(CompassCentre, CompassRadius * 0.62f, Context.Theme.LineSoft, 64, 1.0f);
Context.Ink->AddLine(ImVec2(CompassCentre.x - CompassRadius, CompassCentre.y),
             ImVec2(CompassCentre.x + CompassRadius, CompassCentre.y), Context.Theme.LineSoft, 1.0f);
Context.Ink->AddLine(ImVec2(CompassCentre.x, CompassCentre.y - CompassRadius),
             ImVec2(CompassCentre.x, CompassCentre.y + CompassRadius), Context.Theme.LineSoft, 1.0f);
const double Direction = Wind->TravelBearingDegrees * 0.017453292519943295;
const ImVec2 VectorEnd(CompassCentre.x + std::sin(Direction) * CompassRadius * 0.78f,
                      CompassCentre.y - std::cos(Direction) * CompassRadius * 0.78f);
Context.Ink->AddLine(CompassCentre, VectorEnd, Context.Accent, 2.5f);
Context.Ink->AddCircleFilled(VectorEnd, 4.0f, Context.Accent);
Context.PresentText(CompassCentre.x - 4.0f, CompassCentre.y - CompassRadius - 14.0f, 8.0f, Context.Theme.Faint, "N");
char WindSpeed[32] = {};
std::snprintf(WindSpeed, sizeof(WindSpeed), "%.1f m/s", Wind->BaseSpeedMps);
Context.PresentMetric(Context.Left + Context.Width * 0.69f, Y + 27.0f, "BASE FLOW", WindSpeed, "steady", Context.Accent);
Y += CompassRadius * 2.0f + 22.0f;
Context.PresentText(Context.Left + 2.0f, Y, 10.0f, Context.Theme.Muted, "Meteorological source bearing · direction wind comes FROM");
Y += 17.0f;
char SourceBearing[32] = {};
std::snprintf(SourceBearing, sizeof(SourceBearing), "FROM %.0f°", Wind->QueryMeteorologicalSourceDegrees());
Context.PresentText(Context.Left + 2.0f, Y, 12.0f, Context.Accent, SourceBearing, Context.Faces.Medium);
Y += 22.0f;
Context.PresentSection(Y, "02 / FLOW", "Bearing and base speed");
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Shared wind enabled", &Wind->WindFieldEnabled);
(void)Context.PresentScalar("Travel bearing", &Wind->TravelBearingDegrees, 0.0, 360.0, "%.0f°");
(void)Context.PresentScalar("Speed at sea level", &Wind->BaseSpeedMps, 0.0, 40.0, "%.1f m/s");
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "03 / VARIABILITY", "Two-sine gust and turbulence");
Context.PositionControls(Y);
(void)Context.PresentScalar("Gust strength", &Wind->GustStrength, 0.0, 1.0, "%.2f");
(void)Context.PresentScalar("Turbulence amplitude", &Wind->TurbulenceAmplitude, 0.0, 1.0, "%.2f");
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "04 / ALTITUDE & RECEIVERS", "Steady shear · directional veer");
Context.PositionControls(Y);
(void)Context.PresentScalar("Speed gain per km", &Wind->AltitudeShearPerKm, 0.0, 2.0, "%.2f×/km");
(void)Context.PresentScalar("Bearing veer per km", &Wind->AltitudeVeerDegreesPerKm, -60.0, 60.0, "%.1f°/km");
Y = ImGui::GetCursorScreenPos().y + 4.0f;
const ImVec2 PlotMin(Context.Left + 2.0f, Y);
const float PlotW = Context.Width - 4.0f;
const float PlotH = 62.0f;
Context.Ink->AddRectFilled(PlotMin, ImVec2(PlotMin.x + PlotW, PlotMin.y + PlotH), Context.Theme.Surface2, 7.0f);
for (int32_t Index = 0; Index < 6; ++Index)
{
    const double Altitude = Index * 600.0;
    double Speed = 0.0, Bearing = 0.0;
    Wind->EvaluateAltitudeVector(Altitude, Speed, Bearing);
    const float X = PlotMin.x + 20.0f + float(Index) / 5.0f * (PlotW - 40.0f);
    const float CY = PlotMin.y + PlotH * 0.5f;
    const float Length = 8.0f + float(std::min(Speed, 30.0) / 30.0) * 16.0f;
    const double Angle = Bearing * 0.017453292519943295;
    const ImVec2 End(X + float(std::sin(Angle)) * Length, CY - float(std::cos(Angle)) * Length);
    Context.Ink->AddLine(ImVec2(X, CY), End, Context.Accent, 1.8f);
    Context.Ink->AddCircleFilled(End, 2.1f, Context.Accent);
}
Y += PlotH + 12.0f;
Context.PositionControls(Y);
Context.PresentCheckbox("Clouds follow shared wind", &Wind->CloudsFollowEnabled);
Context.PresentCheckbox("Local clouds follow shared wind", &Wind->LocalCloudFollowEnabled);
Context.PresentCheckbox("Local fog follows shared wind", &Wind->LocalFogFollowEnabled);
Context.PresentCheckbox("Precipitation follows shared wind", &Wind->PrecipitationFollowEnabled);
(void)Context.PresentScalar("Precipitation drift", &Wind->PrecipitationDrift, 0.0, 1.0, "%.2f");
if (ImGui::Button("Reset reference flow · 7 m/s north-source")) Wind->ResetReferenceFlow();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
