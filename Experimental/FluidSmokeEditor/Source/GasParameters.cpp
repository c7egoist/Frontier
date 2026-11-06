/*==========================================================================================================================================
                                                           GASPARAMETERS.CPP
==========================================================================================================================================*/

#include "GasParameters.h"

#include <cmath>

namespace FluidSmoke
{

const std::array<GasParameterEntry, GasParameterCount>& GasParameterCatalogue() noexcept
{
    // 📝 Order, defaults, ranges, steps, units and labels exactly as SmokeSequence.js GasParameterCatalogue.
    static const std::array<GasParameterEntry, GasParameterCount> Catalogue = { {
        // source — multipliers on the tyre model's own rates, which stay the physical port
        { 1.0f,  0.0f,  4.0f, 0.05f, "×",     "Emission rate" },
        { 1.0f,  0.0f,  4.0f, 0.05f, "×",     "Temperature" },
        { 1.0f,  0.0f,  3.0f, 0.05f, "×",     "Volume expansion" },
        { 1.0f,  0.0f,  4.0f, 0.05f, "×",     "Soot yield" },
        { 9.0f,  0.0f, 24.0f, 0.5f,  "1/s",   "Carrier drag" },
        { 1.0f,  0.0f,  3.0f, 0.05f, "×",     "Tread ejection" },
        // simulation
        { 2.4f,  0.0f,  8.0f, 0.1f,  "m/s²·K","Buoyancy" },
        { 0.10f, 0.0f,  0.9f, 0.01f, "1/s",   "Dissipation" },
        { 0.55f, 0.0f,  0.95f,0.01f, "1/s",   "Cooling" },
        { 3.0f,  0.0f,  6.0f, 0.1f,  "ε",     "Vorticity confinement" },
        { 0.60f, 0.0f,  2.0f, 0.02f, "m/s",   "Turbulence" },
        { 3.7f,  0.2f,  4.0f, 0.05f, "1/m",   "Turbulence frequency" },
        { 0.8f,  0.0f, 12.0f, 0.1f,  "m/s",   "Wind speed" },
        { 30.0f, 0.0f, 360.0f,1.0f,  "°",     "Wind heading" },
        { 1.0f,  0.25f, 2.0f, 0.05f, "×",     "Time scale" },
        { 16.0f, 4.0f, 40.0f, 2.0f,  "",      "Pressure iterations" },
        // appearance
        { 1.0f,  0.2f,  3.0f, 0.05f, "×",     "Density" },
        { 0.88f, 0.2f,  0.98f,0.01f, "",      "Albedo" },
        { 0.38f, 0.0f,  0.9f, 0.01f, "g",     "Forward scattering" },
        { 0.75f, 0.0f,  1.5f, 0.05f, "",      "Multiple scattering" },
        { 1.0f,  0.0f,  3.0f, 0.05f, "×",     "Ambient light" },
        { 0.70f, 0.0f,  1.0f, 0.02f, "",      "Detail" },
        { 2.2f,  0.2f,  4.0f, 0.05f, "1/m",   "Detail frequency" },
        { 1.0f,  0.0f,  1.5f, 0.05f, "",      "Edge erosion" },
        { 0.0f,  0.0f,  1.0f, 0.05f, "",      "Billow warp" },
        { 0.0f,  0.0f,  1.0f, 0.05f, "",      "Powder" },
        // fire
        { 1.0f,  0.0f,  4.0f, 0.05f, "×",     "Flame intensity" },
        { 1.0f,  0.7f,  1.6f, 0.01f, "×",     "Flame temperature" },
        { 1800.0f, 1300.0f, 2400.0f, 10.0f, "K", "Flame core" },
        { 1150.0f, 900.0f, 1600.0f, 10.0f, "K", "Flame tip" },
        { 0.6f,  0.0f,  1.0f, 0.02f, "",      "Flicker" },
        { 0.96f, 0.5f,  0.995f, 0.005f, "1/s", "Flame decay" },
        { 1.0f,  0.0f,  4.0f, 0.05f, "×",     "Fire light" },
    } };
    return Catalogue;
}

GasParameters ConstructGasParameters() noexcept
{
    GasParameters Gas{};
    const auto& Catalogue = GasParameterCatalogue();
    for (int Index = 0; Index < GasParameterCount; ++Index)
        Gas[Index] = Catalogue[Index].Default;
    return Gas;
}

float QueryGasParameter(const GasParameters& Gas, GasParameter Key) noexcept
{
    return Gas[static_cast<int>(Key)];
}

void AssignGasParameter(GasParameters& Gas, GasParameter Key, float Value) noexcept
{
    const GasParameterEntry& Entry = GasParameterCatalogue()[static_cast<int>(Key)];
    Gas[static_cast<int>(Key)] = std::min(Entry.Maximum, std::max(Entry.Minimum, Value));
}

PlumeSettings MapPlumeSettings(const GasParameters& Gas, bool Enabled) noexcept
{
    const auto G = [&](GasParameter Key) { return QueryGasParameter(Gas, Key); };
    PlumeSettings Settings;
    Settings.PlumeEnabled = Enabled;
    Settings.PlumeEmissionRate = G(GasParameter::Emission);
    Settings.PlumeDensity = 1.2f * G(GasParameter::Density);
    Settings.PlumeHeat = G(GasParameter::Heat);
    Settings.PlumeSoot = G(GasParameter::Soot);
    Settings.PlumeBuoyancy = G(GasParameter::Buoyancy);
    Settings.PlumeDissipation = G(GasParameter::Dissipation);
    Settings.PlumeCooling = G(GasParameter::Cooling);
    Settings.PlumeVorticity = G(GasParameter::Vorticity);
    Settings.PlumeTurbulence = G(GasParameter::Turbulence);
    Settings.PlumeTurbulenceScale = G(GasParameter::TurbulenceScale);
    Settings.PlumeWindSpeed = G(GasParameter::WindSpeed);
    Settings.PlumeWindDirection = G(GasParameter::WindHeading);
    Settings.PlumeAlbedo = G(GasParameter::Albedo);
    Settings.PlumeAnisotropy = G(GasParameter::Phase);
    Settings.PlumeScattering = G(GasParameter::MultiScatter);
    Settings.PlumeAmbient = G(GasParameter::Ambient);
    Settings.PlumeDetail = G(GasParameter::Detail);
    Settings.PlumeDetailScale = G(GasParameter::DetailScale);
    Settings.PlumeFire = G(GasParameter::FlameIntensity);
    Settings.PlumeFlameCore = G(GasParameter::FlameCore) * G(GasParameter::FlameTemperature);
    Settings.PlumeFlameTip = G(GasParameter::FlameTip) * G(GasParameter::FlameTemperature);
    Settings.PlumeFireLight = G(GasParameter::FireLight);
    Settings.PlumeFlameDecay = -std::log(std::max(0.005f, 1.0f - G(GasParameter::FlameLoss)));
    return Settings;
}

PlumeTelemetry ProjectPlumeTelemetry(const Vec3& VehiclePosition, const Quat& VehicleOrientation, const Vec3& VehicleVelocity,
                                      const std::vector<WheelTelemetry>& Readings, const std::vector<WheelThermal>& Thermal)
{
    PlumeTelemetry Telemetry;
    Telemetry.Position = VehiclePosition;
    Telemetry.Velocity = VehicleVelocity;
    Telemetry.AfterfireSeconds = 0.0f;
    for (size_t Index = 0; Index < Readings.size(); ++Index)
    {
        WheelTelemetry Wheel = Readings[Index];
        const WheelThermal Heat = Index < Thermal.size() ? Thermal[Index] : WheelThermal{};
        const Vec3 Heading = RotateVector(MultiplyQuaternion(VehicleOrientation, ConstructAxisQuaternion({ 0, 0, 1 }, Wheel.Steer)), { 1, 0, 0 });
        Wheel.InContact = Wheel.ContactFraction > 0.5f && !Wheel.OnDebris;
        // Bare rims have no tyre rubber to vaporise.
        if (Wheel.Shredded)
            Wheel.SlidingPower = 0.0f;
        Wheel.Thermal.Ignited = !Wheel.Shredded && Heat.Ignited;
        Wheel.Thermal.CombustionPower = Heat.CombustionPower;
        Wheel.Thermal.Surface = Heat.Surface;
        Wheel.Burst = Wheel.Burst || Heat.Ignited;   // Heat.Burst in the exhibit rides on the thermal reading
        Wheel.Longitudinal = Heading;
        Telemetry.Wheels.push_back(Wheel);
    }
    return Telemetry;
}

const std::vector<GasPreset>& GasPresets() noexcept
{
    static const std::vector<GasPreset> Presets = {
        { "Tyre smoke", {} },
        { "Thick burnout", { { GasParameter::Emission, 2.2f }, { GasParameter::Density, 1.6f }, { GasParameter::Dissipation, 0.12f },
                             { GasParameter::Albedo, 0.9f }, { GasParameter::Vorticity, 2.2f }, { GasParameter::Expansion, 1.4f },
                             { GasParameter::MultiScatter, 0.9f } } },
        { "Light haze", { { GasParameter::Emission, 0.6f }, { GasParameter::Density, 0.55f }, { GasParameter::Dissipation, 0.35f },
                          { GasParameter::Detail, 0.75f }, { GasParameter::Erosion, 0.9f }, { GasParameter::Albedo, 0.92f } } },
        { "Inferno", { { GasParameter::FlameIntensity, 2.4f }, { GasParameter::FlameTemperature, 1.18f }, { GasParameter::FlameFlicker, 0.85f },
                       { GasParameter::Soot, 2.2f }, { GasParameter::Heat, 1.8f }, { GasParameter::FireLight, 2.2f }, { GasParameter::Buoyancy, 3.4f } } },
        { "Crosswind", { { GasParameter::WindSpeed, 5.5f }, { GasParameter::WindHeading, 95.0f }, { GasParameter::Turbulence, 0.7f },
                         { GasParameter::Dissipation, 0.28f } } },
        { "Legacy billows", { { GasParameter::Density, 1.0f }, { GasParameter::Dissipation, 0.22f }, { GasParameter::Vorticity, 1.6f },
                              { GasParameter::Turbulence, 0.4f }, { GasParameter::TurbulenceScale, 1.1f }, { GasParameter::Albedo, 0.86f },
                              { GasParameter::Phase, 0.45f }, { GasParameter::MultiScatter, 0.45f }, { GasParameter::Detail, 0.65f },
                              { GasParameter::DetailScale, 0.85f }, { GasParameter::Erosion, 0.75f }, { GasParameter::Warp, 0.35f },
                              { GasParameter::Powder, 0.2f }, { GasParameter::WindSpeed, 0.0f } } },
    };
    return Presets;
}

void ApplyGasPreset(GasParameters& Gas, const GasPreset& Preset) noexcept
{
    Gas = ConstructGasParameters();
    for (const auto& Override : Preset.Overrides)
        AssignGasParameter(Gas, Override.first, Override.second);
}

} // namespace FluidSmoke
