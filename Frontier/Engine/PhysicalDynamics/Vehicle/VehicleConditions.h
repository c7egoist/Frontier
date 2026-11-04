/*==========================================================================================================================================
                                                            VEHICLECONDITIONS.H
==========================================================================================================================================*/
// 🧩 The pieces Project Drive left out, added for Frontier (2026-11-04): tyre wear, traction control, fuel, engine coolant and oil,
//    and the supercharger's charge-air temperature. Every specification is off by default, so a configuration that leaves them
//    alone runs exactly as the source does. Parameter names and defaults follow GRIT's component sheets (TireSpecifications.h,
//    FuelSpecifications.h, CoolantSpecifications.h, EngineOilSpecifications.h, SuperchargerSpecifications.h); GRIT's solver is not
//    in its repository, so each law below is stated where it is evaluated (VehicleSolver.cpp, Drivetrain.cpp).

#pragma once

#include <algorithm>
#include <cmath>

namespace Frontier::Vehicle
{

// 📝 Tread wear from the sliding energy the tyre dissipates (GRIT FTireWearProperties): depth grows by BaseWearRate per megajoule,
//    scaled by (load / ReferenceLoad)^(LoadWearExponent − 1) and by ThermalWearMultiplier while the tread is over
//    OverheatTemperature; each worn millimetre takes GripLossPerMM of the grip, down to MinimumGripFactor.
struct TyreWearSpecification
{
    bool  Enabled               = false;
    float InitialTreadDepth_mm  = 8.0f;      // [mm]
    float BaseWearRate_mm_MJ    = 0.0012f;   // [mm/MJ] - sliding energy into worn depth
    float ThermalWearMultiplier = 2.5f;      // [-]     - while the tread is overheated
    float OverheatTemperature_K = 393.15f;   // [K]     - 120 °C
    float LoadWearExponent      = 1.3f;      // [-]     - wear power ∝ Load^n at the same slip speed
    float ReferenceLoad_N       = 3200.0f;   // [N]     - load the base rate is quoted at
    float GripLossPerMM         = 0.08f;     // [1/mm]
    float MinimumGripFactor     = 0.6f;      // [-]
};

// 📝 Traction control: when a driven wheel's slip ratio passes SlipTarget above MinimumSpeed, the throttle is cut in proportion to
//    the overshoot (Gain per unit slip), never below FloorThrottle of the driver's demand, and restored at RecoveryRate.
struct TractionControlSpecification
{
    bool  Enabled       = false;
    float SlipTarget    = 0.12f;   // [-]
    float Gain          = 6.0f;    // [-]   throttle share removed per unit slip over the target
    float MinimumSpeed  = 1.0f;    // [m/s] inactive below (launch from rest)
    float FloorThrottle = 0.15f;   // [-]   share of the demand always kept
    float RecoveryRate  = 3.0f;    // [1/s] how fast a cut throttle returns
};

// 📝 Fuel (GRIT FFuelSpecifications): flow = brake power × SpecificConsumption + IdleFlow; an empty tank stops the engine's torque.
//    The fuel's mass rides in the chassis, so the host lowers the body's mass as it burns.
struct FuelSpecification
{
    bool  Enabled                    = false;
    float CapacityLitres             = 68.0f;    // [L]
    float LoadLitres                 = 60.0f;    // [L]       at the start
    float DensityKgPerLitre          = 0.745f;   // [kg/L]    petrol
    float SpecificConsumption_gPerKWh = 270.0f;  // [g/kWh]   brake-specific fuel consumption
    float IdleFlow_gPerS             = 0.25f;    // [g/s]
};

// 📝 Engine coolant and oil, two lumped heat capacities (GRIT CoolantSpecifications, EngineOilSpecifications): the share of fuel heat
//    that is neither work nor exhaust enters the coolant; the thermostat opens the radiator between ThermostatOpening and
//    ThermostatFull, whose conductance grows with airflow; the oil follows the coolant through OilCoolantConductance and takes the
//    friction heat. Cold oil is thicker: engine friction scales by 1 + ColdFrictionGain × (OilTarget − T) / (OilTarget − Ambient).
struct EngineFluidSpecification
{
    bool  Enabled                = false;
    float AmbientTemperature_K   = 293.15f;   // [K]
    float CoolantCapacity_JK     = 42000.0f;  // [J/K]  ~10 L of 50/50 coolant
    float OilCapacity_JK         = 14000.0f;  // [J/K]  ~7 L of oil
    float ThermalEfficiency      = 0.32f;     // [-]    brake work ÷ fuel heat
    float CoolantHeatShare       = 0.30f;     // [-]    fuel heat into the coolant
    float OilHeatShare           = 0.06f;     // [-]    fuel heat into the oil
    float ThermostatOpening_K    = 357.15f;   // [K]    84 °C
    float ThermostatFull_K       = 365.15f;   // [K]    92 °C
    float RadiatorConductance_WK = 900.0f;    // [W/K]  fully open, in still air
    float RadiatorAirflowGain    = 0.06f;     // [s/m]  conductance × (1 + gain × airspeed)
    float BlockLoss_WK           = 18.0f;     // [W/K]  the block's own loss to ambient
    float OilCoolantConductance  = 160.0f;    // [W/K]
    float OilTarget_K            = 381.15f;   // [K]    108 °C
    float ColdFrictionGain       = 0.6f;      // [-]
};

// 📝 Charge air (GRIT FSuperchargerStateVector::ChargerInletTemp): the compressor outlet after adiabatic compression at
//    CompressorEfficiency, T₂ = T₁ (1 + ((p₂/p₁)^((γ−1)/γ) − 1) / η), less what the intercooler removes, T = T₂ − ε (T₂ − T₁).
//    With DensityCorrection the boost's torque gain scales by ReferenceTemperature / T (warmer charge, thinner air).
struct ChargeAirSpecification
{
    bool  Enabled                  = false;
    float AmbientTemperature_K     = 293.15f;   // [K]
    float AmbientPressure_Bar      = 1.01325f;  // [bar]
    float IntercoolerEffectiveness = 0.75f;     // [-]
    float ReferenceTemperature_K   = 318.15f;   // [K] charge temperature the boost curves were measured at
    bool  DensityCorrection        = false;
};

// 📝 Compressor outlet and intercooled charge temperatures for a gauge boost (bar) at one compressor efficiency.
inline float ResolveChargeTemperature(const ChargeAirSpecification& Charge, float BoostBar, float CompressorEfficiency) noexcept
{
    constexpr float γ        = 1.4f;
    const float     Ratio    = std::max(1.0f, (Charge.AmbientPressure_Bar + std::max(0.0f, BoostBar)) / Charge.AmbientPressure_Bar);
    const float     η        = std::clamp(CompressorEfficiency, 0.2f, 1.0f);
    const float     Outlet   = Charge.AmbientTemperature_K * (1.0f + (std::pow(Ratio, (γ - 1.0f) / γ) - 1.0f) / η);
    const float     Removed  = std::clamp(Charge.IntercoolerEffectiveness, 0.0f, 1.0f) * (Outlet - Charge.AmbientTemperature_K);
    return Outlet - Removed;
}

} // namespace Frontier::Vehicle
