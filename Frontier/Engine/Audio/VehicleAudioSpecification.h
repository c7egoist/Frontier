/*==========================================================================================================================================
                                                VEHICLE AUDIO SPECIFICATION
                                     ------------------------------------------------------------------
              Nine acoustic identities parameterised from crank kinematics, breathing and forced induction.
==========================================================================================================================================*/

// 🧩 Vehicle audio specification: nine acoustic identities parameterised from crank kinematics, breathing and forced induction.

#pragma once

#include "Engine/Audio/VehicleAudioTypes.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                              TORQUE CURVE
//------------------------------------------------------------------------------------------------------------------------

struct TorquePoint
{
    float Rpm = 0;   // [rev/min]
    float TorqueNm = 0;   // [N·m]
};

//------------------------------------------------------------------------------------------------------------------------
//                                            HARMONIC TABLE
//------------------------------------------------------------------------------------------------------------------------

// Orders are crank orders: order 1 = crank rotation (rpm/60), order 4 = V8 firing (4× crank).
// The table is sparse; missing orders are treated as zero. The engine sums sin(2π·order·∫crank dt + φ).
struct HarmonicEntry
{
    float Order  = 0;   // [-] - e.g. 0.5, 1.0, 1.5 … 12.0
    float Weight = 0;   // [-] - linear amplitude before load shaping
};

//------------------------------------------------------------------------------------------------------------------------
//                                        FORCED INDUCTION SPEC
//------------------------------------------------------------------------------------------------------------------------

struct InductionSpecification
{
    InductionKind Kind             = InductionKind::NaturallyAspirated;
    float         PeakBoostBar     = 0;      // [bar] - manifold pressure above ambient
    float         SuperchargerRatio = 0;     // [-] - crank → rotor
    uint32_t      RotorLobes       = 3;      // [-] - for whine frequency
    float         SuperchargerLossNm = 0;    // [N·m] - parasitic at redline
    float         TurboLagTau      = 0;      // [s] - spool up time constant
    float         TurboMaxRpm      = 140000; // [rev/min] - shaft
    uint32_t      TurboBladeCount  = 11;     // [-]
    float         WastegateBar     = 0;      // [bar]
    bool          AntiLag          = false;
    float         CompoundBalance  = 0.55f;  // [-] - SC vs turbo share when twincharged
};

//------------------------------------------------------------------------------------------------------------------------
//                                          VEHICLE SPECIFICATION
//------------------------------------------------------------------------------------------------------------------------

struct VehicleAudioSpecification
{
    std::string Id;                  // [-] - stable key
    std::string DisplayName;         // [-]
    std::string ShortLabel;          // [-]

    uint32_t    Cylinders      = 8;  // [-]
    float       VAngleDeg      = 90; // [deg]
    float       DisplacementCc = 5000; // [cm³]
    float       IdleRpm        = 800; // [rev/min]
    float       RedlineRpm     = 7000; // [rev/min]
    float       LimiterRpm     = 7200; // [rev/min]
    CrankPlaneKind CrankPlane  = CrankPlaneKind::EvenFire;

    std::vector<uint32_t> FiringOrder; // [-] - 1-indexed for documentation only

    // Dynamics
    float       MassKg         = 1650; // [kg]
    float       DragCd         = 0.32; // [-]
    float       FrontalAreaM2  = 2.02f; // [m²]
    float       WheelRadiusM   = 0.340f; // [m]
    float       RollingCoeff   = 0.011f; // [-]
    float       FinalDrive     = 3.55f; // [-]
    std::vector<float> GearRatios; // [-]
    float       ShiftUpRpm     = 6500; // [rev/min]
    float       ShiftDownRpm   = 3000; // [rev/min]

    std::vector<TorquePoint> TorqueCurve; // [N·m] sampled
    float       EngineInertia  = 0.24f; // [kg·m²]

    InductionSpecification Induction;

    std::vector<HarmonicEntry> Harmonics; // [-]

    float       ExhaustResHz   = 80; // [Hz]
    float       IntakeResHz    = 1100; // [Hz]

    struct Character
    {
        float Exhaust   = 1.0f;
        float Intake    = 0.55f;
        float LowRumble = 0.35f;
        float TopScream = 1.0f;
        float TurboHiss = 0.0f;
        float SuperWhine = 0.0f;
        float Burble    = 0.0f;
        float Electric  = 0.0f;
        float HybridWhine = 0.0f;
    } Character;

    // Electric-only extras
    struct ElectricDrive
    {
        uint32_t PolePairs      = 6;     // [-]
        float    BaseCarrierHz  = 8200;  // [Hz]
        float    TwoSpeedShiftRpm = 8500; // [rev/min] motor
    } Electric;

    bool        IsElectric() const noexcept { return Cylinders == 0; }
};

//------------------------------------------------------------------------------------------------------------------------
//                                          PRESET CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

[[nodiscard]] std::vector<VehicleAudioSpecification> BuildVehicleAudioPresets();

// Torque lookup: smoothstep between sampled dyno points — honest to the shape without aliasing the joints.
[[nodiscard]] float SampleTorque(const VehicleAudioSpecification& Spec, float Rpm) noexcept;

// Firing frequency for diagnostics only — the synthesiser uses crank orders, not a single tone.
[[nodiscard]] float FiringFrequencyHz(const VehicleAudioSpecification& Spec, float Rpm) noexcept;

} // namespace Frontier
