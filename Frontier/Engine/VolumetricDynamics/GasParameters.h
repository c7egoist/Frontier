#pragma once
/*==========================================================================================================================================
                                                            GASPARAMETERS.H
==========================================================================================================================================*/
// 🧩 Exact port of GasParameterCatalogue, ConstructGasParameters, MapPlumeSettings (SmokeSequence.js) and
//    GasPresets / IgnitionOptions (InspectorPages.js). Numbers are the exhibit's; do not restyle them.

#include "Frontier/Engine/VolumetricDynamics/PlumeMath.h"

#include <array>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace Frontier
{

struct GasParameterSpec
{
    const char* Key       = "";
    const char* Label     = "";
    const char* Unit      = "";
    float       Default   = 0.0f;
    float       Minimum   = 0.0f;
    float       Maximum   = 1.0f;
    float       Step      = 0.01f;
};

enum class GasParameter : uint8_t
{
    Emission, Heat, Expansion, Soot, Momentum, TreadEjection,
    Buoyancy, Dissipation, Cooling, Vorticity, Turbulence, TurbulenceScale,
    WindSpeed, WindHeading, TimeScale, PressureSweeps,
    Density, Albedo, Phase, MultiScatter, Ambient, Detail, DetailScale, Erosion, Warp, Powder,
    FlameIntensity, FlameTemperature, FlameCore, FlameTip, FlameFlicker, FlameLoss, FireLight,
    Count
};

[[nodiscard]] const std::array<GasParameterSpec, static_cast<size_t>(GasParameter::Count)>& QueryGasParameterCatalogue() noexcept;
[[nodiscard]] GasParameter ResolveGasParameter(const char* Key) noexcept;

struct GasParameters
{
    std::array<float, static_cast<size_t>(GasParameter::Count)> Values{};

    GasParameters() noexcept;
    [[nodiscard]] float  Query(GasParameter Id) const noexcept;
    void                 Assign(GasParameter Id, float Scalar) noexcept;
    void                 AssignKey(const char* Key, float Scalar) noexcept;
    void                 ResetDefaults() noexcept;
    void                 ApplyPreset(const char* Name) noexcept;
};

struct PlumeSettings
{
    bool  PlumeEnabled        = true;
    int   PlumeGrade          = 2;
    float PlumeEmissionRate   = 1.0f;
    float PlumeDensity        = 1.2f;
    float PlumeHeat           = 1.0f;
    float PlumeBuoyancy       = 2.4f;
    float PlumeExtinction     = 3.6f;
    float PlumeAlbedo         = 0.88f;
    float PlumeFire           = 1.0f;
    float PlumeSoot           = 1.0f;
    float PlumeSootAlbedo     = 0.05f;
    float PlumeVorticity      = 3.0f;
    float PlumeTurbulence     = 0.6f;
    float PlumeTurbulenceScale= 3.7f;
    float PlumeDissipation    = 0.10f;
    float PlumeCooling        = 0.55f;
    float PlumeFlameDecay     = 4.0f;
    float PlumeWindSpeed      = 0.8f;
    float PlumeWindDirection  = 30.0f;
    float PlumeScattering     = 0.75f;
    float PlumeAnisotropy     = 0.38f;
    float PlumeAmbient        = 1.0f;
    float PlumeFireLight      = 1.0f;
    float PlumeDetail         = 0.7f;
    float PlumeDetailScale    = 2.2f;
    float PlumeFlameCore      = 1800.0f;
    float PlumeFlameTip       = 1150.0f;
    float PlumeEmbers         = 1.0f;
    int   Inspection          = 0;
};

[[nodiscard]] PlumeSettings MapPlumeSettings(const GasParameters& Gas, bool Enabled = true) noexcept;
[[nodiscard]] PlumeSettings QueryPlumeDefaults() noexcept;

struct GasPreset
{
    const char* Name = "";
    std::vector<std::pair<const char*, float>> Overrides;
};

[[nodiscard]] const std::array<GasPreset, 6>& QueryGasPresets() noexcept;

struct PlumeGrade
{
    const char*          Name = "High";
    std::array<int, 3>   Extent{ 128, 128, 32 };
    float                CellExtent = 0.25f;
    int                  PressureSweeps = 16;
    int                  MarchSamples = 48;
};

[[nodiscard]] const std::array<PlumeGrade, 4>& QueryPlumeGrades() noexcept;

// 📝 InspectorPages.js ResolveHelland / ResolveBlackbodyColour (PlumeRecords.wgsl).
[[nodiscard]] PlumeVec3 ResolveHelland(float Kelvin) noexcept;
[[nodiscard]] PlumeVec3 ResolveBlackbodyColour(float Kelvin) noexcept;
[[nodiscard]] PlumeVec3 ResolveBlackbodyRadiance(float Kelvin) noexcept;

} // namespace Frontier
