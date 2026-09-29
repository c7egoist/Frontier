//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/VehicleInputController.h — engine-agnostic driver input → DriverInput mapper
//============================================================================================================================================
//
//    Turns raw device input (keyboard keys, gamepad axes, or a racing wheel + pedals) into the normalised
//    `DriverInput` the VehicleController consumes. It is deliberately ENGINE-AGNOSTIC and header-only: the game
//    layer feeds it button/axis state each frame and reads back a `DriverCommand`; it never mentions Unreal, SDL,
//    Jolt or any windowing/input API. In the Frontier engine, `TractrixVehicleScene` (or an APlayerController-style
//    binding) pushes device state in; the headless tests push synthetic state in. This mirrors the role of GRIT's
//    `Controllers/VehicleController` (UE APlayerController + Enhanced Input) but with the engine binding factored out.
//
//    STANDARD KEYBOARD LAYOUT (the default the user asked for):
//        W .............. throttle            S .............. brake / reverse creep
//        A / D .......... steer left / right   Space .......... handbrake
//        Left-Shift ..... sequential up-shift  Left-Ctrl ...... sequential down-shift
//        R .............. reset (exposed as a flag; wired by the scene)
//
//    Keyboard axes are DIGITAL, so throttle/brake ramp in and decay out at configurable rates and steering
//    self-centres when A/D are released — the feel expected from keyboard driving. A gamepad or wheel instead
//    supplies ANALOG axes which bypass the ramps (dead-zone + sensitivity are still applied). Set the active
//    device with SetDevice(); auto-switching on activity is left to the engine layer (see DeviceSwitchThreshold).
//
//    GAMEPAD / WHEEL EXTENSION POINTS (documented, ready for later phases):
//        • Gamepad: call SetThrottleAxis/SetBrakeAxis with the analog triggers, SetSteerAxis with the left stick X.
//          The `SteeringLinearity` exponent shapes stick response (1 = linear, >1 = finer around centre).
//        • Wheel + pedals: same analog setters; `WheelRotationRange_deg` maps the physical wheel angle to full lock,
//          and `FFBStrength` is surfaced for the engine's force-feedback driver (this class computes no FFB itself).
//        • Sequential vs H-pattern: ShiftUp()/ShiftDown() are edge pulses; an H-pattern shifter maps each gear to a
//          direct SelectGear(n) call (provided) instead.

#pragma once

#include "VehicleController.h"   // DriverInput

#include <algorithm>
#include <cmath>

namespace Frontier::Vehicle {

enum class InputDevice { Keyboard, Gamepad, Wheel };

//------------------------------------------------------------------------------------------------------------------------
// Tunables — field names/defaults follow GRIT FVehicleInputConfig where they overlap.
//------------------------------------------------------------------------------------------------------------------------
struct InputConfig
{
    // Sensitivity multipliers (applied after dead-zone, before clamp).
    float SteeringSensitivity = 1.0f;   // [-]
    float ThrottleSensitivity = 1.0f;   // [-]
    float BrakeSensitivity    = 1.0f;   // [-]

    // Dead zones (analog devices).
    float SteeringDeadZone = 0.05f;     // [-]
    float ThrottleDeadZone = 0.02f;     // [-]
    float BrakeDeadZone    = 0.02f;     // [-]

    // Keyboard ramp rates (digital keys → smooth analog), in units-per-second.
    float ThrottleRiseRate = 3.0f;      // [1/s] how fast throttle builds while W held
    float ThrottleFallRate = 6.0f;      // [1/s] how fast it releases
    float BrakeRiseRate    = 4.0f;      // [1/s]
    float BrakeFallRate    = 8.0f;      // [1/s]
    float SteerRate        = 3.5f;      // [1/s] steer build toward ±1 while A/D held
    float SteerReturnRate  = 5.0f;      // [1/s] self-centring rate when neither A nor D held

    // Analog shaping.
    float SteeringLinearity   = 1.0f;   // [-] exponent for analog steer curve (>1 finer near centre)
    float WheelRotationRange_deg = 900.0f; // [deg] physical wheel range mapped to full lock (wheel only)
    float FFBStrength         = 0.7f;   // [0..1] surfaced for the engine FFB driver (not used here)

    // Auto device-switch hint for the engine layer (this class does not switch by itself).
    float DeviceSwitchThreshold = 0.1f; // [-]
};

//------------------------------------------------------------------------------------------------------------------------
// Output: the normalised drive command plus the discrete transmission/utility pulses. `Drive` feeds
// VehicleController::SetInput(); `ShiftUp`/`ShiftDown`/`SelectedGear` are consumed by a manual-gearbox layer (the
// current controller runs an AMT and auto-shifts, so these are latched for the phase that wires manual shifting).
//------------------------------------------------------------------------------------------------------------------------
struct DriverCommand
{
    DriverInput Drive{};
    bool ShiftUp   = false;   // edge pulse this frame
    bool ShiftDown = false;   // edge pulse this frame
    int  SelectedGear = -1;   // >=0 ⇒ H-pattern direct gear select this frame (else -1)
    bool ResetVehicle = false;
};

//------------------------------------------------------------------------------------------------------------------------
class VehicleInputController
{
public:
    explicit VehicleInputController(const InputConfig& cfg = {}) noexcept : cfg_(cfg) {}

    void SetConfig(const InputConfig& cfg) noexcept { cfg_ = cfg; }
    [[nodiscard]] const InputConfig& Config() const noexcept { return cfg_; }
    void SetDevice(InputDevice d) noexcept { device_ = d; }
    [[nodiscard]] InputDevice Device() const noexcept { return device_; }

    //-- Keyboard (digital) --------------------------------------------------------------------------------------------
    void SetThrottleKey(bool down)  noexcept { kThrottle_ = down; }   // W
    void SetBrakeKey(bool down)     noexcept { kBrake_ = down; }      // S
    void SetSteerLeftKey(bool down) noexcept { kLeft_ = down; }       // A
    void SetSteerRightKey(bool down)noexcept { kRight_ = down; }      // D
    void SetHandbrakeKey(bool down) noexcept { kHandbrake_ = down; }  // Space

    //-- Gamepad / wheel (analog) — raw values in [0..1] pedals, [-1..1] steer; +1 steer = LEFT (matches DriverInput) --
    void SetThrottleAxis(float v) noexcept { aThrottle_ = v; haveAnalogPedals_ = true; }
    void SetBrakeAxis(float v)    noexcept { aBrake_ = v;    haveAnalogPedals_ = true; }
    void SetSteerAxis(float v)    noexcept { aSteer_ = v;    haveAnalogSteer_ = true; }
    void SetHandbrakeAxis(float v)noexcept { aHandbrake_ = v; }
    // Racing wheel: pass the physical wheel angle in degrees; mapped through WheelRotationRange_deg to [-1..1].
    void SetWheelAngle(float deg) noexcept { aSteer_ = Clamp(deg / (0.5f * cfg_.WheelRotationRange_deg), -1.0f, 1.0f); haveAnalogSteer_ = true; }

    //-- Transmission / utility pulses ---------------------------------------------------------------------------------
    void ShiftUp()   noexcept { pendingShiftUp_ = true; }     // Left-Shift
    void ShiftDown() noexcept { pendingShiftDown_ = true; }   // Left-Ctrl
    void SelectGear(int gear) noexcept { pendingGear_ = gear; } // H-pattern
    void RequestReset() noexcept { pendingReset_ = true; }    // R

    // Advance the smoothing by dt and produce this frame's command. Call once per frame BEFORE SetInput().
    [[nodiscard]] DriverCommand Update(float dt) noexcept
    {
        dt = std::max(0.0f, dt);
        DriverCommand cmd;

        if (device_ == InputDevice::Keyboard || (!haveAnalogPedals_ && !haveAnalogSteer_))
        {
            // Digital ramps.
            throttle_ = Ramp(throttle_, kThrottle_ ? 1.0f : 0.0f, cfg_.ThrottleRiseRate, cfg_.ThrottleFallRate, dt);
            brake_    = Ramp(brake_,    kBrake_    ? 1.0f : 0.0f, cfg_.BrakeRiseRate,    cfg_.BrakeFallRate,    dt);

            const float steerTarget = (kLeft_ ? 1.0f : 0.0f) - (kRight_ ? 1.0f : 0.0f); // +1 = left
            if (kLeft_ || kRight_) steer_ += (steerTarget - steer_) * std::min(1.0f, dt * cfg_.SteerRate);
            else                   steer_ += (0.0f       - steer_) * std::min(1.0f, dt * cfg_.SteerReturnRate);

            cmd.Drive.Throttle  = Clamp(throttle_ * cfg_.ThrottleSensitivity, 0.0f, 1.0f);
            cmd.Drive.Brake     = Clamp(brake_    * cfg_.BrakeSensitivity,    0.0f, 1.0f);
            cmd.Drive.Steer     = Clamp(steer_    * cfg_.SteeringSensitivity, -1.0f, 1.0f);
            cmd.Drive.Handbrake = kHandbrake_;
        }
        else
        {
            // Analog device: dead-zone → sensitivity → (steer) linearity curve.
            const float th = DeadZone(aThrottle_, cfg_.ThrottleDeadZone);
            const float br = DeadZone(aBrake_,    cfg_.BrakeDeadZone);
            float st = DeadZone(aSteer_, cfg_.SteeringDeadZone);
            if (cfg_.SteeringLinearity != 1.0f)
                st = std::copysign(std::pow(std::fabs(st), cfg_.SteeringLinearity), st);

            throttle_ = th; brake_ = br; steer_ = st; // keep state coherent for a later device switch
            cmd.Drive.Throttle  = Clamp(th * cfg_.ThrottleSensitivity, 0.0f, 1.0f);
            cmd.Drive.Brake     = Clamp(br * cfg_.BrakeSensitivity,    0.0f, 1.0f);
            cmd.Drive.Steer     = Clamp(st * cfg_.SteeringSensitivity, -1.0f, 1.0f);
            cmd.Drive.Handbrake = (aHandbrake_ > 0.5f) || kHandbrake_;
        }

        // Latch discrete pulses (consumed once).
        cmd.ShiftUp = pendingShiftUp_; cmd.ShiftDown = pendingShiftDown_;
        cmd.SelectedGear = pendingGear_; cmd.ResetVehicle = pendingReset_;
        pendingShiftUp_ = pendingShiftDown_ = pendingReset_ = false;
        pendingGear_ = -1;
        return cmd;
    }

    // Convenience: produce the command and push it straight into a controller.
    DriverCommand Apply(VehicleController& controller, float dt) noexcept
    {
        const DriverCommand cmd = Update(dt);
        controller.SetInput(cmd.Drive);
        return cmd;
    }

private:
    [[nodiscard]] static float Clamp(float v, float lo, float hi) noexcept { return v < lo ? lo : (v > hi ? hi : v); }
    [[nodiscard]] static float Ramp(float cur, float target, float rise, float fall, float dt) noexcept
    {
        const float rate = (target > cur) ? rise : fall;
        const float step = rate * dt;
        if (std::fabs(target - cur) <= step) return target;
        return cur + std::copysign(step, target - cur);
    }
    [[nodiscard]] static float DeadZone(float v, float dz) noexcept
    {
        const float a = std::fabs(v);
        if (a <= dz) return 0.0f;
        return std::copysign((a - dz) / (1.0f - dz), v); // rescale so the live band still reaches ±1
    }

    InputConfig cfg_{};
    InputDevice device_ = InputDevice::Keyboard;

    // Keyboard button state.
    bool kThrottle_ = false, kBrake_ = false, kLeft_ = false, kRight_ = false, kHandbrake_ = false;
    // Analog raw state.
    float aThrottle_ = 0.0f, aBrake_ = 0.0f, aSteer_ = 0.0f, aHandbrake_ = 0.0f;
    bool  haveAnalogPedals_ = false, haveAnalogSteer_ = false;
    // Smoothed state.
    float throttle_ = 0.0f, brake_ = 0.0f, steer_ = 0.0f;
    // Discrete pulses.
    bool pendingShiftUp_ = false, pendingShiftDown_ = false, pendingReset_ = false;
    int  pendingGear_ = -1;
};

} // namespace Frontier::Vehicle
