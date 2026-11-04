/*==========================================================================================================================================
                                                      DRIVETRAIN SIMULATION — FIXED TIMESTEP
                                     ------------------------------------------------------------------
              Longitudinal dynamics with crank inertia and honest torque curves. Never frame-tied.
==========================================================================================================================================*/

// 🧩 Drivetrain simulation: longitudinal dynamics with crank inertia, honest torque curves and time-based induction.

#pragma once

#include "Engine/Audio/ForcedInductionModel.h"
#include "Engine/Audio/VehicleAudioSpecification.h"
#include "Engine/Audio/VehicleAudioTypes.h"

#include <cstdint>
#include <vector>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                   SNAPSHOT
//------------------------------------------------------------------------------------------------------------------------

struct DrivetrainSnapshot
{
    float Rpm           = 0;   // [rev/min]
    float VehicleSpeed  = 0;   // [m/s]
    float SpeedKmh      = 0;   // [km/h]
    float SpeedMph      = 0;   // [mph]
    uint32_t Gear       = 0;   // [-] 0=N
    float Throttle01    = 0;   // [0..1]
    float Brake01       = 0;   // [0..1]
    float BoostBar      = 0;   // [bar]
    float BoostPsi      = 0;   // [psi]
    float TurboRpm      = 0;   // [rev/min]
    float Load01        = 0;   // [0..1.15]
    bool  Shifting      = false;
    bool  Limiter       = false;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                DRIVETRAIN SIMULATION
//------------------------------------------------------------------------------------------------------------------------

class DrivetrainSimulation
{
  public:
    explicit DrivetrainSimulation(const VehicleAudioSpecification* Spec = nullptr) noexcept;

    void Attach(const VehicleAudioSpecification* Spec) noexcept;
    void Reset() noexcept;

    void SetInputs(float Throttle01, float Brake01) noexcept;
    bool ShiftUp() noexcept;
    bool ShiftDown() noexcept;
    void ToggleNeutral() noexcept;

    // Fixed-step advance: call at 240 Hz off wall-clock time, irrespective of render frames.
    // Returns secondary audio events for this step (shift, limiter, pops, BOV).
    std::vector<SecondaryEvent> Advance(float Δτ) noexcept;

    [[nodiscard]] DrivetrainSnapshot QuerySnapshot() const noexcept;
    [[nodiscard]] const VehicleAudioSpecification* QuerySpec() const noexcept { return BoundSpec; }
    [[nodiscard]] bool IsShifting() const noexcept { return ShiftTimer > 0; }

  private:
    void IntegrateVehicle(float Δτ, float DriveForceN) noexcept;

    const VehicleAudioSpecification* BoundSpec = nullptr;
    ForcedInductionModel             Induction;

    // State
    float    Rpm             = 900;  // [rev/min]
    float    VehicleSpeed    = 0;    // [m/s]
    float    WheelAngVel     = 0;    // [rad/s]
    float    EngineAngVel    = 0;    // [rad/s]
    uint32_t Gear            = 1;    // [-] 0=N
    float    Throttle01      = 0;    // [0..1] filtered
    float    Brake01         = 0;    // [0..1] filtered
    float    ThrottleTarget  = 0;    // [0..1] raw pedal
    float    BrakeTarget     = 0;    // [0..1] raw pedal
    float    PrevThrottle    = 0;    // [0..1]
    float    ShiftTimer      = 0;    // [s]
    float    BlipTimer       = 0;    // [s]
    float    LimiterTimer    = 0;    // [s]
    float    CrackleCooldown = 0;    // [s]
    bool     LimiterActive   = false;
    float    Load01          = 0;    // [0..1.15]

    ForcedInductionState ForcedState;
};

} // namespace Frontier
