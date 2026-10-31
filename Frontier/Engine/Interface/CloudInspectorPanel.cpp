/*==========================================================================================================================================
                                            CLOUDS INSPECTOR PANEL
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
void DrawCloudInspectorPanel(GlobalInspectorPresentationContext& Context)
{

auto* Clouds = static_cast<CloudLayerRecord*>(Context.Descriptor->PayloadAddress);
Clouds->SynchronizeCloudParameters();
float Y = Context.BodyTop;
Context.PresentSection(Y, "01 / CLOUD OBSERVATORY", "Overview · density field");
const ImVec2 Min(Context.Left + 2.0f, Y);
const float AtlasW = Context.Width - 4.0f;
const float AtlasH = 76.0f;
Context.Ink->AddRectFilled(Min, ImVec2(Min.x + AtlasW, Min.y + AtlasH), Context.Theme.Surface2, 8.0f);
for (int32_t Index = 0; Index < 5; ++Index)
{
    const float X = Min.x + 12.0f + float(Index) / 4.0f * (AtlasW - 24.0f);
    Context.Ink->AddLine(ImVec2(X, Min.y + 8.0f), ImVec2(X, Min.y + AtlasH - 8.0f), Context.Theme.LineSoft, 1.0f);
}
for (int32_t Index = 0; Index < 4; ++Index)
{
    const float Z = Min.y + 12.0f + float(Index) / 3.0f * (AtlasH - 24.0f);
    Context.Ink->AddLine(ImVec2(Min.x + 8.0f, Z), ImVec2(Min.x + AtlasW - 8.0f, Z), Context.Theme.LineSoft, 1.0f);
}
constexpr int32_t GridWidth = 36;
constexpr int32_t GridHeight = 10;
const float CellWidth = (AtlasW - 16.0f) / GridWidth;
const float CellHeight = (AtlasH - 20.0f) / GridHeight;
const double SampleHeight = Clouds->BaseAltitudeMetres + Clouds->QueryRenderedDepthMetres() * 0.48;
for (int32_t Row = 0; Row < GridHeight; ++Row)
{
    for (int32_t Column = 0; Column < GridWidth; ++Column)
    {
        const SpatialVector SamplePoint{
            20000.0 * (double(Column) / (GridWidth - 1)),
            20000.0 * (double(Row) / (GridHeight - 1)),
            SampleHeight};
        const double Density = CloudDensity(Clouds->Parameters, SamplePoint);
        if (Density <= 0.005) continue;
        const float NormalizedDensity = float(std::clamp(Density / 1.5, 0.0, 1.0));
        const ImU32 CellInk = KitInkWithAlpha(Context.Accent, 0.12f + NormalizedDensity * 0.62f);
        const ImVec2 CellMin(Min.x + 8.0f + Column * CellWidth,
                             Min.y + 8.0f + Row * CellHeight);
        Context.Ink->AddRectFilled(CellMin, ImVec2(CellMin.x + CellWidth - 1.2f, CellMin.y + CellHeight - 1.0f),
                           CellInk, 2.0f);
    }
}
Context.PresentText(Min.x + 10.0f, Min.y + AtlasH - 15.0f, 8.5f, Context.Theme.Muted,
         "XY / CPU FBM DENSITY SAMPLE · NOT A LIT SKY");
Y += AtlasH + 9.0f;
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Global clouds enabled", &Clouds->CloudLayerEnabled);
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "02 / SHAPE & COVERAGE", "Formation and altitude");
Context.PositionControls(Y);
(void)Context.PresentScalar("Coverage", &Clouds->CoverageFraction, 0.0, 1.0, "%.2f");
(void)Context.PresentScalar("Density multiplier", &Clouds->DensityMultiplier, 0.0, 4.0, "%.2f×");
double Formation = Clouds->FormationIndex;
if (Context.PresentScalar("Formation index (0–5)", &Formation, 0.0, 5.0, "%.0f")) Clouds->FormationIndex = int32_t(std::round(Formation));
(void)Context.PresentScalar("Layer base", &Clouds->BaseAltitudeMetres, 100.0, 20000.0, "%.0f m");
(void)Context.PresentScalar("Layer thickness", &Clouds->LayerThicknessMetres, 100.0, 6000.0, "%.0f m");
(void)Context.PresentScalar("Ceiling", &Clouds->CeilingAltitudeMetres, 4000.0, 20000.0, "%.0f m");
Clouds->SynchronizeCloudParameters();
Y = ImGui::GetCursorScreenPos().y + 5.0f;
const ImVec2 ProfileMin(Context.Left + 2.0f, Y);
const float ProfileWidth = Context.Width - 4.0f;
const float ProfileHeight = 48.0f;
Context.Ink->AddRectFilled(ProfileMin, ImVec2(ProfileMin.x + ProfileWidth, ProfileMin.y + ProfileHeight),
                   Context.Theme.Surface2, 7.0f);
std::array<ImVec2, 41> EnvelopePoints{};
for (size_t Index = 0; Index < EnvelopePoints.size(); ++Index)
{
    const double HeightFraction = double(Index) / double(EnvelopePoints.size() - 1);
    const float X = ProfileMin.x + 8.0f + float(HeightFraction) * (ProfileWidth - 16.0f);
    const float Z = ProfileMin.y + ProfileHeight - 7.0f -
                    float(Clouds->EvaluateVerticalEnvelope(HeightFraction)) * (ProfileHeight - 14.0f);
    EnvelopePoints[Index] = ImVec2(X, Z);
}
Context.Ink->AddPolyline(EnvelopePoints.data(), static_cast<int>(EnvelopePoints.size()), Context.Accent, ImDrawFlags_None, 1.8f);
Context.PresentText(ProfileMin.x + 8.0f, ProfileMin.y + ProfileHeight - 14.0f, 8.0f, Context.Theme.Muted,
         "FORMATION / NORMALISED VERTICAL DENSITY ENVELOPE");
Y += ProfileHeight + 8.0f;
Context.PresentSection(Y, "03 / CLOUD RENDERING", "Trace budget and ground shadow");
Context.PositionControls(Y);
char Summary[96] = {};
std::snprintf(Summary, sizeof(Summary), "%s · %.0f m rendered · %d primary samples",
              CloudLayerRecord::FormationLabel(Clouds->FormationIndex), Clouds->QueryRenderedDepthMetres(),
              Clouds->QuerySkyMarchBudget());
Context.PresentText(Context.Left + 2.0f, Y, 10.0f, Context.Accent, Summary, Context.Faces.Medium);
Y += 17.0f;
double TargetResolution = Clouds->TargetResolutionPercent;
if (Context.PresentScalar("Target resolution", &TargetResolution, 25.0, 100.0, "%.0f%%"))
{
    Clouds->TargetResolutionPercent = int32_t(std::round(TargetResolution));
}
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Projected ground shadows", &Clouds->GroundShadowsEnabled);
(void)Context.PresentScalar("Shadow softness", &Clouds->ShadowSoftnessMetres, 0.0, 200.0, "%.0f m");
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "04 / WEATHER COUPLING", "Shared wind & receivers");
Context.PositionControls(Y);
Context.PresentCheckbox("Follow shared wind", &Clouds->FollowSharedWindEnabled);
Context.PresentCheckbox("Storm lightning", &Clouds->StormLightningEnabled);
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
