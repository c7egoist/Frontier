/*==========================================================================================================================================
                                            ATMOSPHERE INSPECTOR PANEL
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
void DrawAtmosphereInspectorPanel(GlobalInspectorPresentationContext& Context)
{

auto* Atmosphere = static_cast<AtmosphereRecord*>(Context.Descriptor->PayloadAddress);
Atmosphere->SynchronizeAtmosphereParameters(false);
float Y = Context.BodyTop;
Context.PresentSection(Y, "01 / OPTICAL WORKBENCH", "Overview · molecular and aerosol medium");
const ImVec2 SkyMin(Context.Left + 2.0f, Y);
const float SkyW = Context.Width - 4.0f;
const float SkyH = 72.0f;
Context.Ink->AddRectFilled(SkyMin, ImVec2(SkyMin.x + SkyW, SkyMin.y + SkyH), Context.Theme.Surface2, 8.0f);
std::array<double, 32> SkyLuminance{};
double MaximumSkyLuminance = 1.0e-9;
for (int32_t Index = 0; Index < 32; ++Index)
{
    const double Azimuth = (double(Index) / 31.0) * 6.283185307179586;
    const SpectrumRgb Radiance = Atmosphere->SampleSkyPanorama(
        Azimuth, 0.10, Context.ReferenceSunElevationDegrees, Context.ReferenceSunAzimuthDegrees);
    SkyLuminance[static_cast<size_t>(Index)] =
        std::max(0.0, Radiance.R * 0.2126 + Radiance.G * 0.7152 + Radiance.B * 0.0722);
    MaximumSkyLuminance = std::max(MaximumSkyLuminance, SkyLuminance[static_cast<size_t>(Index)]);
}
std::vector<ImVec2> SkyPoints;
SkyPoints.reserve(SkyLuminance.size());
for (size_t Index = 0; Index < SkyLuminance.size(); ++Index)
{
    const double RelativeRadiance = SkyLuminance[Index] / MaximumSkyLuminance;
    const float NormalizedLuminance = float(std::log1p(8.0 * RelativeRadiance) / std::log1p(8.0));
    const float X = SkyMin.x + 8.0f + float(Index) / 31.0f * (SkyW - 16.0f);
    const float Z = SkyMin.y + SkyH - 10.0f - NormalizedLuminance * (SkyH - 20.0f);
    SkyPoints.emplace_back(X, Z);
}
Context.Ink->AddPolyline(SkyPoints.data(), static_cast<int>(SkyPoints.size()), Context.Accent, ImDrawFlags_None, 1.8f);
Context.PresentText(SkyMin.x + 8.0f, SkyMin.y + SkyH - 15.0f, 8.5f, Context.Theme.Muted, "CPU ATMOSPHERE MODEL REFERENCE · NOT GPU LUT READBACK");
Y += SkyH + 8.0f;
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Atmosphere enabled", &Atmosphere->AtmosphereEnabled);
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "02 / MEDIUM", "Rayleigh molecules · Mie aerosols · ozone");
Context.PositionControls(Y);
(void)Context.PresentScalar("Rayleigh multiplier", &Atmosphere->RayleighMultiplier, 0.0, 3.0, "%.2f×");
(void)Context.PresentScalar("Mie multiplier", &Atmosphere->MieMultiplier, 0.0, 6.0, "%.2f×");
(void)Context.PresentScalar("Ozone multiplier", &Atmosphere->OzoneMultiplier, 0.0, 4.0, "%.2f×");
(void)Context.PresentScalar("Rayleigh scale height", &Atmosphere->RayleighScaleHeightMetres, 1000.0, 16000.0, "%.0f m");
(void)Context.PresentScalar("Mie scale height", &Atmosphere->MieScaleHeightMetres, 500.0, 8000.0, "%.0f m");
(void)Context.PresentScalar("Mie anisotropy g", &Atmosphere->MieAnisotropyG, -0.95, 0.95, "%.2f");
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "03 / LIGHT RESPONSE", "Solar transmittance · ground and twilight");
const SpectrumRgb Transmission = Atmosphere->EvaluateSolarTransmittance(
    Context.ReferenceSunElevationDegrees, Context.ReferenceSunAzimuthDegrees);
const float StripTop = Y + 3.0f;
const ImU32 StripColours[] = {KitInkHex(0xff8a70), KitInkHex(0x9fe89a), KitInkHex(0x83b9ff)};
const double StripValues[] = {Transmission.R, Transmission.G, Transmission.B};
for (int32_t Index = 0; Index < 3; ++Index)
{
    const float StripY = StripTop + Index * 7.0f;
    Context.Ink->AddRectFilled(ImVec2(Context.Left + 2.0f, StripY), ImVec2(Context.Right - 2.0f, StripY + 4.0f), Context.Theme.Surface2, 2.0f);
    Context.Ink->AddRectFilled(ImVec2(Context.Left + 2.0f, StripY),
                       ImVec2(Context.Left + 2.0f + (Context.Width - 4.0f) * float(std::clamp(StripValues[Index], 0.0, 1.0)),
                              StripY + 4.0f), StripColours[Index], 2.0f);
}
Y = StripTop + 28.0f;
Context.PositionControls(Y);
(void)Context.PresentCheckbox("Multiple scattering approximation", &Atmosphere->MultipleScatteringEnabled);
(void)Context.PresentCheckbox("Spherical air-mass integration", &Atmosphere->AirMassEnabled);
(void)Context.PresentCheckbox("Civil twilight line", &Atmosphere->CivilTwilightLineEnabled);
(void)Context.PresentScalar("Ground albedo", &Atmosphere->GroundAlbedoScalar, 0.0, 1.0, "%.2f");
(void)Context.PresentScalar("Horizon glow", &Atmosphere->HorizonGlow, 0.0, 3.0, "%.2f×");
double Samples = Atmosphere->SkySampleBudget;
if (Context.PresentScalar("Sky sample budget", &Samples, 8.0, 64.0, "%.0f")) Atmosphere->SkySampleBudget = int32_t(std::round(Samples));
Y = ImGui::GetCursorScreenPos().y + 5.0f;
Context.PresentSection(Y, "04 / BAKING", "Transmittance lookup table");
Context.PositionControls(Y);
char LutStatus[64] = {};
std::snprintf(LutStatus, sizeof(LutStatus), "%s · revision %u",
              Atmosphere->OpticalDepthLut.Baked() ? "BAKED / 96 × 24" : "NOT BAKED", Atmosphere->LutRevision);
Context.PresentText(Context.Left + 2.0f, Y, 10.0f, Context.Accent, LutStatus, Context.Faces.Medium);
ImGui::SameLine();
if (ImGui::Button("Bake transmittance LUT")) Atmosphere->SynchronizeAtmosphereParameters(true);
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
