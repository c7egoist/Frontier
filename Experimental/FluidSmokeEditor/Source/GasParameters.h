#pragma once
/*==========================================================================================================================================
                                                            GASPARAMETERS.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Experimental/VehicleHmiPrototype/Source/SmokeSequence.js — the GasParameterCatalogue the
//    Smoke & fire editor exposes, ConstructGasParameters(), MapPlumeSettings(), ProjectPlumeTelemetry() and the
//    GasPresets look presets.

#include "PlumeMath.h"
#include "PlumeSourceProjection.h"

#include <array>
#include <string>
#include <vector>

namespace FluidSmoke
{

// 📝 One catalogue entry: the slider the editor draws for the parameter.
struct GasParameterEntry
{
    float Default = 0.0f;
    float Minimum = 0.0f;
    float Maximum = 0.0f;
    float Step = 0.0f;
    const char* Unit = "";
    const char* Label = "";
};

// 📝 GasParameterCatalogue — every transport and optics reading the Smoke & fire editor exposes, at the values
//    the exhibit opens with. Order and defaults are exactly the exhibit's.
enum class GasParameter : int
{
    Emission = 0, Heat, Expansion, Soot, Momentum, TreadEjection,
    Buoyancy, Dissipation, Cooling, Vorticity, Turbulence, TurbulenceScale, WindSpeed, WindHeading, TimeScale, PressureSweeps,
    Density, Albedo, Phase, MultiScatter, Ambient, Detail, DetailScale, Erosion, Warp, Powder,
    FlameIntensity, FlameTemperature, FlameCore, FlameTip, FlameFlicker, FlameLoss, FireLight,
    Count
};

constexpr int GasParameterCount = static_cast<int>(GasParameter::Count);

const std::array<GasParameterEntry, GasParameterCount>& GasParameterCatalogue() noexcept;

// 📝 The editor's gas settings: one float per catalogue entry (ConstructGasParameters()).
using GasParameters = std::array<float, GasParameterCount>;

GasParameters ConstructGasParameters() noexcept;

float QueryGasParameter(const GasParameters& Gas, GasParameter Key) noexcept;
void AssignGasParameter(GasParameters& Gas, GasParameter Key, float Value) noexcept;

// 📝 The plume settings MapPlumeSettings() derives from the gas parameters — the PlumeDefaults field names.
struct PlumeSettings
{
    bool  PlumeEnabled = true;
    int   PlumeGrade = 2;
    float PlumeEmissionRate = 1.0f, PlumeDensity = 1.2f, PlumeHeat = 1.0f, PlumeBuoyancy = 2.4f;
    float PlumeExtinction = 3.6f, PlumeAlbedo = 0.88f, PlumeFire = 1.0f, PlumeSoot = 1.0f, PlumeSootAlbedo = 0.05f;
    float PlumeVorticity = 3.0f, PlumeTurbulence = 0.6f, PlumeTurbulenceScale = 3.7f;
    float PlumeDissipation = 0.10f, PlumeCooling = 0.55f, PlumeFlameDecay = 4.0f;
    float PlumeWindSpeed = 0.8f, PlumeWindDirection = 30.0f;
    float PlumeScattering = 0.75f, PlumeAnisotropy = 0.38f, PlumeAmbient = 1.0f, PlumeFireLight = 1.0f;
    float PlumeDetail = 0.7f, PlumeDetailScale = 2.2f, PlumeFlameCore = 1800.0f, PlumeFlameTip = 1150.0f, PlumeEmbers = 1.0f;
};

PlumeSettings MapPlumeSettings(const GasParameters& Gas, bool Enabled = true) noexcept;

// 📝 ProjectPlumeTelemetry(): the vehicle state plus its wheel readings into plume telemetry.
PlumeTelemetry ProjectPlumeTelemetry(const Vec3& VehiclePosition, const Quat& VehicleOrientation, const Vec3& VehicleVelocity,
                                      const std::vector<WheelTelemetry>& Readings, const std::vector<WheelThermal>& Thermal);

// 📝 GasPresets — the look presets of the Smoke & fire inspector's Presets card.
struct GasPreset
{
    const char* Name;
    std::vector<std::pair<GasParameter, float>> Overrides;
};

const std::vector<GasPreset>& GasPresets() noexcept;
void ApplyGasPreset(GasParameters& Gas, const GasPreset& Preset) noexcept;

} // namespace FluidSmoke
