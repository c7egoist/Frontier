/*==========================================================================================================================================
                                                           GASPARAMETERS.CPP
==========================================================================================================================================*/
// 🧩 Catalogue, presets and mappings copied from SmokeSequence.js / InspectorPages.js / PlumeSpace.js.

#include "Frontier/Engine/VolumetricDynamics/GasParameters.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace Frontier
{

namespace
{

const std::array<GasParameterSpec, static_cast<size_t>(GasParameter::Count)> Catalogue = {{
    { "Emission",         "Emission rate",           "×",      1.0f,  0.0f,  4.0f,  0.05f },
    { "Heat",             "Temperature",             "×",      1.0f,  0.0f,  4.0f,  0.05f },
    { "Expansion",        "Volume expansion",        "×",      1.0f,  0.0f,  3.0f,  0.05f },
    { "Soot",             "Soot yield",              "×",      1.0f,  0.0f,  4.0f,  0.05f },
    { "Momentum",         "Carrier drag",            "1/s",    9.0f,  0.0f,  24.0f, 0.5f  },
    { "TreadEjection",    "Tread ejection",          "×",      1.0f,  0.0f,  3.0f,  0.05f },
    { "Buoyancy",         "Buoyancy",                 "m/s²·K", 2.4f,  0.0f,  8.0f,  0.1f  },
    { "Dissipation",      "Dissipation",             "1/s",    0.10f, 0.0f,  0.9f,  0.01f },
    { "Cooling",          "Cooling",                 "1/s",    0.55f, 0.0f,  0.95f, 0.01f },
    { "Vorticity",        "Vorticity confinement",   "ε",      3.0f,  0.0f,  6.0f,  0.1f  },
    { "Turbulence",       "Turbulence",              "m/s",    0.60f, 0.0f,  2.0f,  0.02f },
    { "TurbulenceScale",  "Turbulence frequency",    "1/m",    3.7f,  0.2f,  4.0f,  0.05f },
    { "WindSpeed",        "Wind speed",              "m/s",    0.8f,  0.0f,  12.0f, 0.1f  },
    { "WindHeading",      "Wind heading",            "°",      30.0f, 0.0f,  360.0f,1.0f  },
    { "TimeScale",        "Time scale",              "×",      1.0f,  0.25f, 2.0f,  0.05f },
    { "PressureSweeps",   "Pressure iterations",     "",       16.0f, 4.0f,  40.0f, 2.0f  },
    { "Density",          "Density",                 "×",      1.0f,  0.2f,  3.0f,  0.05f },
    { "Albedo",           "Albedo",                   "",      0.88f, 0.2f,  0.98f, 0.01f },
    { "Phase",            "Forward scattering",      "g",      0.38f, 0.0f,  0.9f,  0.01f },
    { "MultiScatter",     "Multiple scattering",     "",       0.75f, 0.0f,  1.5f,  0.05f },
    { "Ambient",          "Ambient light",           "×",      1.0f,  0.0f,  3.0f,  0.05f },
    { "Detail",           "Detail",                   "",      0.70f, 0.0f,  1.0f,  0.02f },
    { "DetailScale",      "Detail frequency",        "1/m",    2.2f,  0.2f,  4.0f,  0.05f },
    { "Erosion",          "Edge erosion",            "",       1.0f,  0.0f,  1.5f,  0.05f },
    { "Warp",             "Billow warp",             "",       0.0f,  0.0f,  1.0f,  0.05f },
    { "Powder",           "Powder",                   "",      0.0f,  0.0f,  1.0f,  0.05f },
    { "FlameIntensity",   "Flame intensity",         "×",      1.0f,  0.0f,  4.0f,  0.05f },
    { "FlameTemperature", "Flame temperature",       "×",      1.0f,  0.7f,  1.6f,  0.01f },
    { "FlameCore",        "Flame core",              "K",      1800.f,1300.f,2400.f,10.0f },
    { "FlameTip",         "Flame tip",               "K",      1150.f,900.f, 1600.f,10.0f },
    { "FlameFlicker",     "Flicker",                  "",      0.6f,  0.0f,  1.0f,  0.02f },
    { "FlameLoss",        "Flame decay",             "1/s",    0.96f, 0.5f,  0.995f,0.005f},
    { "FireLight",        "Fire light",              "×",      1.0f,  0.0f,  4.0f,  0.05f },
}};

}

const std::array<GasParameterSpec, static_cast<size_t>(GasParameter::Count)>& QueryGasParameterCatalogue() noexcept
{
    return Catalogue;
}

GasParameter ResolveGasParameter(const char* Key) noexcept
{
    for (size_t Index = 0; Index < Catalogue.size(); ++Index)
        if (std::strcmp(Catalogue[Index].Key, Key) == 0)
            return static_cast<GasParameter>(Index);
    return GasParameter::Count;
}

GasParameters::GasParameters() noexcept
{
    ResetDefaults();
}

float GasParameters::Query(GasParameter Id) const noexcept
{
    const size_t Index = static_cast<size_t>(Id);
    return Index < Values.size() ? Values[Index] : 0.0f;
}

void GasParameters::Assign(GasParameter Id, float Scalar) noexcept
{
    const size_t Index = static_cast<size_t>(Id);
    if (Index >= Values.size()) return;
    const GasParameterSpec& Spec = Catalogue[Index];
    Values[Index] = std::clamp(Scalar, Spec.Minimum, Spec.Maximum);
}

void GasParameters::AssignKey(const char* Key, float Scalar) noexcept
{
    const GasParameter Id = ResolveGasParameter(Key);
    if (Id != GasParameter::Count) Assign(Id, Scalar);
}

void GasParameters::ResetDefaults() noexcept
{
    for (size_t Index = 0; Index < Catalogue.size(); ++Index)
        Values[Index] = Catalogue[Index].Default;
}

void GasParameters::ApplyPreset(const char* Name) noexcept
{
    ResetDefaults();
    for (const GasPreset& Preset : QueryGasPresets())
    {
        if (std::strcmp(Preset.Name, Name) != 0) continue;
        for (const auto& Override : Preset.Overrides)
            AssignKey(Override.first, Override.second);
        return;
    }
}

PlumeSettings QueryPlumeDefaults() noexcept
{
    return PlumeSettings{};
}

PlumeSettings MapPlumeSettings(const GasParameters& Gas, bool Enabled) noexcept
{
    PlumeSettings Settings = QueryPlumeDefaults();
    Settings.PlumeEnabled = Enabled;
    Settings.PlumeEmissionRate = Gas.Query(GasParameter::Emission);
    Settings.PlumeDensity = 1.2f * Gas.Query(GasParameter::Density);
    Settings.PlumeHeat = Gas.Query(GasParameter::Heat);
    Settings.PlumeSoot = Gas.Query(GasParameter::Soot);
    Settings.PlumeBuoyancy = Gas.Query(GasParameter::Buoyancy);
    Settings.PlumeDissipation = Gas.Query(GasParameter::Dissipation);
    Settings.PlumeCooling = Gas.Query(GasParameter::Cooling);
    Settings.PlumeVorticity = Gas.Query(GasParameter::Vorticity);
    Settings.PlumeTurbulence = Gas.Query(GasParameter::Turbulence);
    Settings.PlumeTurbulenceScale = Gas.Query(GasParameter::TurbulenceScale);
    Settings.PlumeWindSpeed = Gas.Query(GasParameter::WindSpeed);
    Settings.PlumeWindDirection = Gas.Query(GasParameter::WindHeading);
    Settings.PlumeAlbedo = Gas.Query(GasParameter::Albedo);
    Settings.PlumeAnisotropy = Gas.Query(GasParameter::Phase);
    Settings.PlumeScattering = Gas.Query(GasParameter::MultiScatter);
    Settings.PlumeAmbient = Gas.Query(GasParameter::Ambient);
    Settings.PlumeDetail = Gas.Query(GasParameter::Detail);
    Settings.PlumeDetailScale = Gas.Query(GasParameter::DetailScale);
    Settings.PlumeFire = Gas.Query(GasParameter::FlameIntensity);
    Settings.PlumeFlameCore = Gas.Query(GasParameter::FlameCore) * Gas.Query(GasParameter::FlameTemperature);
    Settings.PlumeFlameTip = Gas.Query(GasParameter::FlameTip) * Gas.Query(GasParameter::FlameTemperature);
    Settings.PlumeFireLight = Gas.Query(GasParameter::FireLight);
    const float FlameLoss = Gas.Query(GasParameter::FlameLoss);
    Settings.PlumeFlameDecay = -std::log(std::max(0.005f, 1.0f - FlameLoss));
    return Settings;
}

const std::array<GasPreset, 6>& QueryGasPresets() noexcept
{
    static const std::array<GasPreset, 6> Presets = {{
        { "Tyre smoke", {} },
        { "Thick burnout", { { "Emission", 2.2f }, { "Density", 1.6f }, { "Dissipation", 0.12f }, { "Albedo", 0.9f },
                             { "Vorticity", 2.2f }, { "Expansion", 1.4f }, { "MultiScatter", 0.9f } } },
        { "Light haze", { { "Emission", 0.6f }, { "Density", 0.55f }, { "Dissipation", 0.35f }, { "Detail", 0.75f },
                          { "Erosion", 0.9f }, { "Albedo", 0.92f } } },
        { "Inferno", { { "FlameIntensity", 2.4f }, { "FlameTemperature", 1.18f }, { "FlameFlicker", 0.85f },
                       { "Soot", 2.2f }, { "Heat", 1.8f }, { "FireLight", 2.2f }, { "Buoyancy", 3.4f } } },
        { "Crosswind", { { "WindSpeed", 5.5f }, { "WindHeading", 95.0f }, { "Turbulence", 0.7f }, { "Dissipation", 0.28f } } },
        { "Legacy billows", { { "Density", 1.0f }, { "Dissipation", 0.22f }, { "Vorticity", 1.6f }, { "Turbulence", 0.4f },
                              { "TurbulenceScale", 1.1f }, { "Albedo", 0.86f }, { "Phase", 0.45f }, { "MultiScatter", 0.45f },
                              { "Detail", 0.65f }, { "DetailScale", 0.85f }, { "Erosion", 0.75f }, { "Warp", 0.35f },
                              { "Powder", 0.2f }, { "WindSpeed", 0.0f } } },
    }};
    return Presets;
}

const std::array<PlumeGrade, 4>& QueryPlumeGrades() noexcept
{
    static const std::array<PlumeGrade, 4> Grades = {{
        { "Low",    { 64,  64,  20 }, 0.40f,  8, 32 },
        { "Medium", { 96,  96,  24 }, 0.30f, 12, 40 },
        { "High",   { 128, 128, 32 }, 0.25f, 16, 48 },
        { "Ultra",  { 160, 160, 48 }, 0.20f, 20, 64 },
    }};
    return Grades;
}

PlumeVec3 ResolveHelland(float Kelvin) noexcept
{
    const float Hecto = std::clamp(Kelvin, 1000.0f, 6600.0f) / 100.0f;
    const float Green = std::clamp((99.4708025861f * std::log(Hecto) - 161.1195681661f) / 255.0f, 0.0f, 1.0f);
    const float Blue = Hecto <= 19.0f ? 0.0f
        : std::clamp((138.5177312231f * std::log(std::max(Hecto - 10.0f, 1.0f)) - 305.0447927307f) / 255.0f, 0.0f, 1.0f);
    return { 1.0f, std::pow(Green, 2.2f), std::pow(Blue, 2.2f) };
}

PlumeVec3 ResolveBlackbodyColour(float Kelvin) noexcept
{
    return ResolveHelland(Kelvin);
}

PlumeVec3 ResolveBlackbodyRadiance(float Kelvin) noexcept
{
    const float Ratio = Kelvin / 1500.0f;
    return ResolveBlackbodyColour(Kelvin) * (Ratio * Ratio * Ratio * Ratio);
}

} // namespace Frontier
