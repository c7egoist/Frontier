/*==========================================================================================================================================
                                                  DRIVETRAIN SIMULATION — INTEGRATION
                                     ------------------------------------------------------------------
                        Longitudinal forces, crank inertia and shift logic stepped at a fixed rate.
==========================================================================================================================================*/

// 🧩 Drivetrain simulation integration: longitudinal forces, crank inertia and shift logic stepped at a fixed rate.

#include "Engine/Audio/DrivetrainSimulation.h"

#include <algorithm>
#include <cmath>
#include <random>

namespace Frontier
{

namespace
{
constexpr float Gravity    = 9.81f;  // [m/s²]
constexpr float AirDensity = 1.225f; // [kg/m³]
} // namespace

DrivetrainSimulation::DrivetrainSimulation(const VehicleAudioSpecification* Spec) noexcept
    : BoundSpec(Spec), Induction(Spec)
{
    Reset();
}

void DrivetrainSimulation::Attach(const VehicleAudioSpecification* Spec) noexcept
{
    const float KeepSpeed = VehicleSpeed;
    const uint32_t KeepGear = Gear;
    BoundSpec = Spec;
    Induction.Attach(Spec);
    if (Spec == nullptr) return;
    // Preserve vehicle motion, re-derive engine speed for the new ratios
    VehicleSpeed = KeepSpeed;
    if (Spec->IsElectric())
    {
        Gear = std::clamp(KeepGear, 1u, static_cast<uint32_t>(Spec->GearRatios.size()));
        if (VehicleSpeed < 0.2f && Rpm > 0) Rpm = 0;
    }
    else
    {
        if (Rpm == 0) Rpm = Spec->IdleRpm + 200.0f;
    }
    ForcedState = {};
    Induction.Reset();
}

void DrivetrainSimulation::Reset() noexcept
{
    if (BoundSpec == nullptr)
    {
        Rpm = 900; VehicleSpeed = 0; WheelAngVel = 0; Gear = 1;
    }
    else if (BoundSpec->IsElectric())
    {
        Rpm = 0; VehicleSpeed = 0; WheelAngVel = 0; Gear = 1;
    }
    else
    {
        Rpm = BoundSpec->IdleRpm; VehicleSpeed = 0; WheelAngVel = 0; Gear = 1;
    }
    EngineAngVel = Rpm * 2.0f * 3.1415926f / 60.0f;
    Throttle01 = 0; Brake01 = 0; ThrottleTarget = 0; BrakeTarget = 0; PrevThrottle = 0;
    ShiftTimer = 0; BlipTimer = 0; LimiterTimer = 0; CrackleCooldown = 0;
    LimiterActive = false; Load01 = 0;
    ForcedState = {}; Induction.Reset();
}

void DrivetrainSimulation::SetInputs(float Throttle, float Brake) noexcept
{
    ThrottleTarget = std::clamp(Throttle, 0.0f, 1.0f);
    BrakeTarget    = std::clamp(Brake, 0.0f, 1.0f);
}

bool DrivetrainSimulation::ShiftUp() noexcept
{
    if (BoundSpec == nullptr) return false;
    if (Gear >= BoundSpec->GearRatios.size()) return false;
    if (ShiftTimer > 0) return false;
    ShiftTimer = 0.22f; // [s]
    ++Gear;
    BlipTimer = 0.12f;
    return true;
}

bool DrivetrainSimulation::ShiftDown() noexcept
{
    if (BoundSpec == nullptr) return false;
    if (Gear == 0) return false;
    if (ShiftTimer > 0) return false;
    if (Gear == 1) { Gear = 0; return true; }
    ShiftTimer = 0.20f;
    --Gear;
    BlipTimer = 0.14f;
    return true;
}

void DrivetrainSimulation::ToggleNeutral() noexcept
{
    if (Gear == 0) Gear = 1;
    else Gear = 0;
}

std::vector<SecondaryEvent> DrivetrainSimulation::Advance(float Δτ) noexcept
{
    std::vector<SecondaryEvent> Events;
    if (BoundSpec == nullptr) return Events;

    const auto& Spec = *BoundSpec;
    const float PrevRpm = Rpm;

    // Pedal slew rates — honest foot speed, not teleports
    {
        const float Up   = 7.0f; // [1/s]
        const float Down = 6.5f;
        float d = ThrottleTarget - Throttle01;
        float m = (d > 0 ? Up : Down) * Δτ;
        if (std::abs(d) > m) d = (d > 0 ? m : -m);
        Throttle01 += d;

        const float BRate = 9.0f;
        float bd = BrakeTarget - Brake01;
        float bm = BRate * Δτ;
        if (std::abs(bd) > bm) bd = (bd > 0 ? bm : -bm);
        Brake01 += bd;
    }

    if (ShiftTimer > 0) { ShiftTimer -= Δτ; if (ShiftTimer < 0) ShiftTimer = 0; }
    if (BlipTimer > 0) { BlipTimer -= Δτ; if (BlipTimer < 0) BlipTimer = 0; }
    if (LimiterTimer > 0) LimiterTimer -= Δτ;
    if (CrackleCooldown > 0) CrackleCooldown -= Δτ;
    PrevThrottle = Throttle01;

    // Forced induction follows wall-clock
    Induction.Advance(Rpm, Throttle01, Δτ, ForcedState);

    const bool IsElectric = Spec.IsElectric();
    float EngineTorqueNm = 0;

    if (IsElectric)
    {
        const float Base = SampleTorque(Spec, Rpm);
        const float Regen = (Brake01 > 0.05f) ? -0.18f * Base * Brake01 : (Throttle01 < 0.08f && VehicleSpeed > 2.0f ? -0.08f * Base : 0.0f);
        EngineTorqueNm = Base * Throttle01 + Regen;

        if (!IsShifting() && Spec.Electric.TwoSpeedShiftRpm > 0)
        {
            const float UpRpm = Spec.Electric.TwoSpeedShiftRpm;
            if (Gear == 1 && Rpm > UpRpm + 300.0f && Throttle01 > 0.35f) ShiftUp();
            else if (Gear == 2 && Rpm < UpRpm - 800.0f && (Throttle01 < 0.50f || Brake01 > 0.20f)) ShiftDown();
        }
    }
    else
    {
        const float BaseTq = SampleTorque(Spec, Rpm);
        float BoostGain = 1.0f;
        if (Spec.Induction.Kind == InductionKind::Turbocharged) BoostGain = 1.0f + ForcedState.BoostBar * 0.74f;
        else if (Spec.Induction.Kind == InductionKind::Supercharged) BoostGain = 1.0f + ForcedState.BoostBar * 0.68f;
        else if (Spec.Induction.Kind == InductionKind::Twincharged) BoostGain = 1.0f + ForcedState.BoostBar * 0.70f;

        float ScLoss = 0;
        if (Spec.Induction.Kind == InductionKind::Supercharged || Spec.Induction.Kind == InductionKind::Twincharged)
            ScLoss = Spec.Induction.SuperchargerLossNm * (Rpm / std::max(1.0f, Spec.RedlineRpm));

        const float ThrottleEff = std::pow(Throttle01, 0.88f) * (0.22f + 0.78f * Throttle01) + (Rpm < 2200.0f ? 0.08f * Throttle01 : 0);
        const float RawEff      = std::min(1.0f, ThrottleEff + (Throttle01 > 0.90f ? 0.06f : 0));
        EngineTorqueNm = BaseTq * BoostGain * RawEff - ScLoss;

        if (Throttle01 < 0.06f)
        {
            const float Pump = (Spec.DisplacementCc / 1000.0f) * 8.5f * (Rpm / 1000.0f) * 0.55f;
            const float Fric = 18.0f + 0.006f * Rpm;
            EngineTorqueNm = -(Pump + Fric);
        }
        if (IsShifting())
        {
            const float Flutter = 0.92f + 0.08f * std::sin(ShiftTimer * 58.0f);
            EngineTorqueNm *= 0.08f * Flutter;
        }
        if (Rpm >= Spec.LimiterRpm) { LimiterActive = true; LimiterTimer = 0.08f; }
        else if (Rpm < Spec.RedlineRpm - 180.0f && LimiterTimer <= 0) LimiterActive = false;
        if (LimiterActive)
        {
            const int Cut = (static_cast<int>(Rpm / 71) % 2 == 0) ? 0 : 1;
            EngineTorqueNm *= (Cut == 0 ? 0.06f : 0.32f);
        }
    }

    // Kinematics
    if (Gear == 0)
    {
        const float Ieng = std::max(0.08f, Spec.EngineInertia);
        float Alpha = EngineTorqueNm / Ieng - EngineAngVel * 0.18f;
        EngineAngVel += Alpha * Δτ;
        EngineAngVel = std::max(0.0f, EngineAngVel);
        Rpm = EngineAngVel * 60.0f / (2.0f * 3.1415926f);
        if (!IsElectric && Throttle01 < 0.04f && Rpm < Spec.IdleRpm)
        {
            const float Err = Spec.IdleRpm - Rpm;
            const float IdleTq = 38.0f + Err * 0.14f;
            EngineAngVel += (IdleTq / Ieng) * Δτ * 0.35f;
            Rpm = EngineAngVel * 60.0f / (2.0f * 3.1415926f);
        }
        if (!IsElectric && Rpm > Spec.LimiterRpm)
        {
            Rpm = Spec.LimiterRpm - static_cast<float>(rand() % 90);
            EngineAngVel = Rpm * 2.0f * 3.1415926f / 60.0f;
        }
        IntegrateVehicle(Δτ, 0);
    }
    else
    {
        const float GearRatio = Spec.GearRatios[Gear - 1];
        const float G         = GearRatio * Spec.FinalDrive;
        const float R         = Spec.WheelRadiusM;

        float DriveForceN = 0;
        if (!IsShifting())
        {
            const float WheelAng = VehicleSpeed / std::max(0.10f, R);
            const float TargetEng = WheelAng * G;
            const float SyncStiff = Throttle01 > 0.20f ? 55.0f : 18.0f;
            const float Sync      = (TargetEng - EngineAngVel) * SyncStiff;
            const float NetTq     = EngineTorqueNm + Sync * Spec.EngineInertia * 0.12f;
            DriveForceN = NetTq * G * 0.94f / R;
        }

        const float WeightN = Spec.MassKg * Gravity;
        const float MuPeak  = 1.25f;
        const float MaxDrive = MuPeak * WeightN * 0.52f;
        if (std::abs(DriveForceN) > MaxDrive)
        {
            DriveForceN = (DriveForceN > 0 ? 1 : -1) * MaxDrive * (0.92f + 0.06f * std::sin(PrevRpm * 0.008f));
            Load01 = 0.82f;
        }
        else
        {
            Load01 = std::min(1.0f, std::abs(DriveForceN / std::max(1.0f, MaxDrive)) * 0.72f + Throttle01 * 0.58f);
        }

        if (!IsShifting() && !IsElectric)
        {
            if (Throttle01 > 0.45f && Rpm > Spec.ShiftUpRpm && Gear < Spec.GearRatios.size()) ShiftUp();
            else if ((Throttle01 < 0.28f && Rpm < Spec.ShiftDownRpm && VehicleSpeed > 4.0f) || (Brake01 > 0.40f && Rpm < 1700.0f && Gear > 1))
                ShiftDown();
        }

        IntegrateVehicle(Δτ, DriveForceN);

        const float WheelAngNow = VehicleSpeed / std::max(0.12f, R);
        const float TargetRpm   = WheelAngNow * G * 60.0f / (2.0f * 3.1415926f);
        if (!IsElectric)
        {
            const float Blend = IsShifting() ? 0.018f : 0.28f;
            Rpm = Rpm * (1 - Blend) + TargetRpm * Blend;
            if (VehicleSpeed < 0.60f && Throttle01 < 0.08f)
            {
                Rpm = std::max(Spec.IdleRpm * 0.92f, std::max(Spec.IdleRpm + (static_cast<float>(rand() % 36) - 18.0f) + Throttle01 * 340.0f, TargetRpm));
                if (Rpm < 520) Rpm = Spec.IdleRpm;
            }
            if (Throttle01 > 0.72f && VehicleSpeed < 6.0f && Rpm < Spec.RedlineRpm * 0.62f)
            {
                const float Boost = (Throttle01 - 0.72f) * 2800.0f;
                Rpm = std::max(Rpm, TargetRpm + Boost * (1.0f - VehicleSpeed / 6.0f));
            }
            if (LimiterActive) Rpm = Spec.LimiterRpm - static_cast<float>(rand() % 140);
            else Rpm = std::min(Rpm, Spec.LimiterRpm);
            EngineAngVel = Rpm * 2.0f * 3.1415926f / 60.0f;
        }
        else
        {
            Rpm = std::max(0.0f, WheelAngNow * G * 60.0f / (2.0f * 3.1415926f));
            if (VehicleSpeed < 0.20f && Throttle01 < 0.02f) Rpm = 0;
            EngineAngVel = Rpm * 2.0f * 3.1415926f / 60.0f;
        }
        WheelAngVel = WheelAngNow;
    }

    if (!IsElectric && Gear != 0)
    {
        const float TAt = SampleTorque(Spec, Rpm);
        Load01 = Throttle01 * (EngineTorqueNm / std::max(1.0f, TAt)) * 0.85f + Brake01 * 0.15f + 0.12f;
        Load01 = std::clamp(Load01, 0.0f, 1.15f);
    }
    else if (IsElectric)
    {
        Load01 = std::min(1.0f, std::abs(EngineTorqueNm) / 800.0f);
    }

    // Secondary events — throttle lift detection uses target pedal (driver intention) vs filtered, so slow pedal slew still triggers BOV/pops.
    const float TargetDrop = ThrottleTarget - Throttle01; // negative when lifting
    // Keep a low-pass for limiter randomness
    if (LimiterActive && (rand() % 100) < 22)
        Events.push_back({SecondaryEventKind::LimiterCut, 0.55f, 0, Gear});
    if (!IsElectric && Throttle01 < 0.12f && ThrottleTarget < 0.08f && PrevRpm > 3200.0f && Rpm > 2800.0f && (rand() % 1000) < 22 && CrackleCooldown <= 0)
    {
        Events.push_back({SecondaryEventKind::OverrunPop, std::min(1.0f, (Rpm - 2800.0f) / 4000.0f), 0, Gear});
        CrackleCooldown = 0.09f + static_cast<float>(rand() % 110) / 1000.0f;
    }
    const bool Lifting = (PrevThrottle > 0.45f && Throttle01 < 0.30f) || (ThrottleTarget < 0.12f && PrevThrottle > 0.40f && TargetDrop < -0.18f);
    if (Lifting)
    {
        if ((Spec.Induction.Kind == InductionKind::Turbocharged || Spec.Induction.Kind == InductionKind::Twincharged) && ForcedState.BoostBar > 0.28f)
            Events.push_back({SecondaryEventKind::BlowOff, 0.7f, ForcedState.BoostBar, Gear});
        else if (Spec.Induction.Kind == InductionKind::Supercharged && ForcedState.BoostBar > 0.22f)
            Events.push_back({SecondaryEventKind::SuperChirp, 0.6f, 0, Gear});
    }

    PrevThrottle = Throttle01;
    return Events;
}

void DrivetrainSimulation::IntegrateVehicle(float Δτ, float DriveForceN) noexcept
{
    const auto& Spec = *BoundSpec;
    const float V      = VehicleSpeed;
    const float Drag   = 0.5f * AirDensity * Spec.DragCd * Spec.FrontalAreaM2 * V * V;
    const float Roll   = Spec.RollingCoeff * Spec.MassKg * Gravity * (1.0f + V * 0.006f);
    const float BrakeF = Brake01 * 13500.0f;
    const float Net    = DriveForceN - Drag - Roll - BrakeF;
    float EffMass = Spec.MassKg;
    if (Gear != 0)
    {
        const float G = Spec.GearRatios[Gear - 1] * Spec.FinalDrive;
        EffMass += Spec.EngineInertia * G * G / (Spec.WheelRadiusM * Spec.WheelRadiusM) * 0.55f;
        EffMass += 4.0f * 1.35f / (Spec.WheelRadiusM * Spec.WheelRadiusM) * 0.22f;
    }
    const float Acc = Net / std::max(420.0f, EffMass);
    VehicleSpeed += Acc * Δτ;
    if (VehicleSpeed < 0) VehicleSpeed = 0;
    if (VehicleSpeed > 105.0f) VehicleSpeed = 105.0f; // [m/s] ~378 km/h cap for the exhibit
    WheelAngVel = VehicleSpeed / std::max(0.12f, Spec.WheelRadiusM);
}

DrivetrainSnapshot DrivetrainSimulation::QuerySnapshot() const noexcept
{
    DrivetrainSnapshot S;
    S.Rpm          = Rpm;
    S.VehicleSpeed = VehicleSpeed;
    S.SpeedKmh     = VehicleSpeed * 3.6f;
    S.SpeedMph     = VehicleSpeed * 2.23694f;
    S.Gear         = Gear;
    S.Throttle01   = Throttle01;
    S.Brake01      = Brake01;
    S.BoostBar     = ForcedState.BoostBar;
    S.BoostPsi     = ForcedState.BoostBar * 14.5038f;
    S.TurboRpm     = ForcedState.TurboRpm;
    S.Load01       = Load01;
    S.Shifting     = ShiftTimer > 0;
    S.Limiter      = LimiterActive;
    return S;
}

} // namespace Frontier
