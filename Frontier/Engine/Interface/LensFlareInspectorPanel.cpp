/*==========================================================================================================================================
                                            LENSFLARE INSPECTOR PANEL
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
void DrawLensFlareInspectorPanel(GlobalInspectorPresentationContext& Context)
{

auto* Flare = static_cast<LensFlareRecord*>(Context.Descriptor->PayloadAddress);
float Y = Context.BodyTop;
Context.PresentSection(Y, "01 / CAMERA OPTICS", "Live optical composite");
const float CardHeight = 108.0f;
const ImVec2 Min(Context.Left + 2.0f, Y);
const ImVec2 CardSize(Context.Width - 4.0f, CardHeight);
ImGui::SetCursorScreenPos(Min);
ImGui::InvisibleButton("##LensFlareSourcePreview", CardSize);
if (ImGui::IsItemActive())
{
    const ImVec2 Pointer = ImGui::GetIO().MousePos;
    Flare->PreviewSourceU = std::clamp(double((Pointer.x - Min.x) / CardSize.x), 0.06, 0.94);
    Flare->PreviewSourceV = std::clamp(double((Pointer.y - Min.y) / CardSize.y), 0.08, 0.92);
}
Context.Ink->AddRectFilled(Min, ImVec2(Context.Right - 2.0f, Y + CardHeight), Context.Theme.Surface2, 9.0f);
Context.Ink->AddRect(Min, ImVec2(Context.Right - 2.0f, Y + CardHeight), Context.Theme.Line, 9.0f);
const ImVec2 Source(Min.x + float(Flare->PreviewSourceU) * (Context.Width - 4.0f), Y + float(Flare->PreviewSourceV) * CardHeight);
const ImVec2 OpticalCentre(Min.x + (Context.Width - 4.0f) * 0.5f, Y + CardHeight * 0.5f);
Context.Ink->AddLine(Source, OpticalCentre, KitInkWithAlpha(Context.Accent, 0.35f), 1.0f);
const auto Ghosts = Flare->EvaluateSensorGhostCentres();
for (size_t Index = 0; Index < Ghosts.size(); ++Index)
{
    const float GhostX = Min.x + float(Ghosts[Index].first) * (Context.Width - 4.0f);
    const float GhostY = Y + float(Ghosts[Index].second) * CardHeight;
    if (GhostX < Min.x + 5.0f || GhostX > Context.Right - 7.0f || GhostY < Y + 5.0f || GhostY > Y + CardHeight - 5.0f) continue;
    Context.Ink->AddCircle(ImVec2(GhostX, GhostY), 3.0f + float(Index % 3) * 2.0f, KitInkWithAlpha(Context.Accent, 0.48f), 24, 1.4f);
}
Context.Ink->AddCircleFilled(Source, 4.0f, Context.Accent);
Context.Ink->AddCircle(OpticalCentre, 4.0f, Context.Theme.Muted);
Context.PresentText(Min.x + 8.0f, Y + CardHeight - 16.0f, 8.5f, Context.Theme.Faint, "SOURCE → SENSOR CENTRE → INTERNAL REFLECTIONS");
Y += CardHeight + 11.0f;
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Lens flare enabled in scene", &Flare->FlareEnabled);
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "02 / COMPOSE", "Intensity, optical spread & preset");
Context.PositionControls(Y);
(void)Context.PresentScalar("Global intensity", &Flare->GlobalIntensity, 0.0, 5.0, "%.2f×");
(void)Context.PresentScalar("Optical spread", &Flare->OpticalSpread, 0.25, 2.0, "%.2f×");
(void)Context.PresentScalar("Chromatic separation", &Flare->ChromaticSeparation, 0.0, 1.0, "%.2f");
const char* Presets[] = {"Cinematic", "Anamorphic Prime", "Clean Portrait", "Solar Bloom", "Custom layers"};
const int32_t CurrentPreset = std::clamp(Flare->PresetIndex, 0, 4);
if (ImGui::BeginCombo("Optical preset", Presets[CurrentPreset]))
{
    for (int32_t Index = 0; Index < 5; ++Index)
    {
        if (ImGui::Selectable(Presets[Index], Index == CurrentPreset)) Flare->ApplyOpticalPreset(Index);
    }
    ImGui::EndCombo();
}
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "03 / GHOSTS", "Sensor-plane internal reflections");
Context.PositionControls(Y);
(void)Context.PresentScalar("Ghost spacing", &Flare->GhostSpacing, 0.0, 3.0, "%.2f×");
(void)Context.PresentScalar("Ghost brightness", &Flare->GhostBrightness, 0.0, 2.0, "%.2f×");
double GhostCount = Flare->GhostCount;
if (Context.PresentScalar("Ghost count", &GhostCount, 0.0, 24.0, "%.0f")) Flare->GhostCount = int32_t(std::round(GhostCount));
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "04 / HALO & DIFFRACTION", "Annular response / aperture");
Context.PositionControls(Y);
(void)Context.PresentScalar("Halo radius", &Flare->HaloRadius, 0.01, 0.60, "%.3f");
(void)Context.PresentScalar("Halo width", &Flare->HaloWidth, 0.005, 0.20, "%.3f");
(void)Context.PresentScalar("Halo brightness", &Flare->HaloBrightness, 0.0, 2.0, "%.2f×");
Context.PresentCheckbox("Anamorphic streak", &Flare->AnamorphicStreakEnabled);
Context.PresentCheckbox("Warm streak", &Flare->WarmStreakEnabled);
Context.PresentCheckbox("Aperture starburst", &Flare->StarburstEnabled);
double BladeCount = Flare->ApertureBlades;
if (Context.PresentScalar("Aperture blades", &BladeCount, 2.0, 12.0, "%.0f")) Flare->ApertureBlades = int32_t(std::round(BladeCount));
Context.PresentText(Context.Left + 2.0f, ImGui::GetCursorScreenPos().y, 10.0f, Context.Theme.Muted,
         ("Effective ray pairs · " + std::to_string(Flare->QueryEffectiveRayPairs())).c_str());
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
