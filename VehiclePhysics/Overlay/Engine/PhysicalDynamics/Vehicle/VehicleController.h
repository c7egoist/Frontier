//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/VehicleController.h — drivable vehicle: rigid chassis + four XPBD soft tyres (Phase 3)
//============================================================================================================================================
//
//    Phase 3 assembles the pieces built in Phases 0–2 into one drivable vehicle:
//
//        • the chassis is a single rigid box in Jolt (RigidBodySolver);
//        • each corner carries an `XPBDSoftTyre` (Phase 2) whose nodes contact the Jolt heightfield DIRECTLY through the
//          same GroundQuery the rest of the sim uses — no raycast, exactly the user's Phase-3 requirement;
//        • the soft tyre carries the vertical wheel load (it IS the suspension spring — the one deformable element), and
//          its friction coefficient sets the available grip;
//        • a thin driving layer turns throttle / brake / steer into in-plane tractive & cornering forces, bounded by the
//          per-wheel friction circle (μ · Fz from the tyre), applied at the contact patch.
//
//    Like the rest of the vehicle layer this class is ENGINE-AGNOSTIC and header-only-math (it reuses the self-contained
//    Vec3/Quat from XPBDSoftTyre.h). It never mentions Jolt: it reaches the rigid chassis through a small set of `Hooks`
//    (read chassis pose, apply force at a world point, apply torque) and reaches the ground through the tyre's GroundQuery.
//    In the engine `TractrixVehicleScene` binds those hooks to `RigidBodySolver`; the headless `VehicleSceneValidation`
//    binds them to a mock box integrator, so the whole controller compiles and is validated in the sandbox without Jolt.
//
//    Call order per fixed physics step (on the Phase-0 physics thread):
//        controller.SetInput(input);
//        controller.Step(dt);          // reads chassis, steps tyres, applies wheel forces to the chassis
//        solver.StepOnce();            // integrates the chassis with those forces
//
//    Frame conventions (match RigidBodySolver + XPBDSoftTyre): right-handed, +Z up, chassis-local +X forward, +Y left,
//    tyre spin axis +Y.

#pragma once

#include "XPBDSoftTyre.h"

#include <array>
#include <cstdint>
#include <functional>
#include <vector>

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                          quaternion helpers (compose / normalise)
//------------------------------------------------------------------------------------------------------------------------
// XPBDSoftTyre.h's Quat only ships AxisAngle + Rotate; the controller also needs Hamilton product and renormalisation to
//    build a steered hub rotation (yaw ∘ chassis) and to keep the mock chassis quaternion unit.
[[nodiscard]] inline Quat QuatMul(const Quat& a, const Quat& b) noexcept
{
    return {
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}
[[nodiscard]] inline Quat QuatNormalize(const Quat& q) noexcept
{
    const float l = std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return (l > 1e-12f) ? Quat{q.x / l, q.y / l, q.z / l, q.w / l} : Quat{0, 0, 0, 1};
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   STATE / INPUT
//------------------------------------------------------------------------------------------------------------------------
struct ChassisState
{
    Vec3 Position;          // [m]     world-space centre of mass
    Quat Orientation;       // [-]     world-space rotation
    Vec3 LinearVelocity;    // [m/s]   world
    Vec3 AngularVelocity;   // [rad/s] world
};

struct DriverInput
{
    float Throttle = 0.0f;  // [0..1]
    float Brake    = 0.0f;  // [0..1]
    float Steer    = 0.0f;  // [-1..1]  +1 = steer left (+Y)
    bool  Handbrake = false;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    WHEEL LAYOUT
//------------------------------------------------------------------------------------------------------------------------
struct WheelMount
{
    Vec3 LocalOffset;           // [m]  hub rest position in chassis-local frame, relative to the CoM
    bool Steered = false;       //      front wheels steer
    bool Driven  = false;       //      powered wheels get engine force
    bool Braked  = true;        //      wheels the brake acts on
};

struct VehicleControllerConfig
{
    float ChassisMass = 1200.0f;                 // [kg] informational; the solver owns the real mass
    SoftTyreParameters Tyre;                     // shared soft-tyre parameters (Phase-2 calibration by default)
    std::vector<WheelMount> Wheels;              // typically 4

    float    MaxSteerAngleRad   = 0.52f;         // [rad] ~30° lock
    float    SteerRatePerSecond = 6.0f;          // [1/s] first-order steer smoothing
    float    DriveForcePerWheel = 5000.0f;       // [N]   tractive demand at full throttle (before the grip clamp)
    float    BrakeForcePerWheel = 9000.0f;       // [N]   braking demand at full brake
    float    HandbrakeForce     = 12000.0f;      // [N]   rear-axle lock demand
    float    RollingResistance  = 0.015f;        // [-]   fraction of Fz opposing motion
    float    SuspensionDamping  = 6000.0f;        // [N·s/m] shock-absorber rate on vertical hub velocity (kills tyre bounce)
    float    CorneringStiffness = 30000.0f;      // [N per (m/s) of lateral slip, scaled by load fraction]
    float    GripCoefficient    = 1.15f;         // [-]   friction-circle μ for the driving layer (grip = μ·Fz)
    uint32_t TyreSubsteps       = 8u;            // [-]   XPBD substeps per fixed step
    Vec3     Gravity            = {0.0f, 0.0f, -9.81f};
};

//------------------------------------------------------------------------------------------------------------------------
//                                                     TELEMETRY
//------------------------------------------------------------------------------------------------------------------------
struct WheelTelemetry
{
    Vec3     HubPosition;            // [m] world (rest hub, follows chassis)
    Quat     HubRotation;           // [-] world (includes steer yaw)
    Vec3     ContactPoint;          // [m] world contact-patch centre
    float    VerticalLoad = 0.0f;   // [N] Fz from the soft tyre
    float    LongitudinalForce = 0.0f; // [N] applied traction/brake (post-clamp)
    float    LateralForce = 0.0f;   // [N] applied cornering (post-clamp)
    float    SteerAngleRad = 0.0f;  // [rad]
    uint32_t ContactCount = 0u;     // [-] tyre nodes touching ground
    bool     InContact = false;
};

struct VehicleTelemetry
{
    ChassisState Chassis;
    float SpeedMetresPerSecond = 0.0f;
    float ForwardSpeed         = 0.0f;   // [m/s] signed, along chassis +X
    float TotalVerticalLoad    = 0.0f;   // [N] Σ Fz
    uint32_t WheelCount        = 0u;
    uint32_t WheelsInContact   = 0u;
    std::array<WheelTelemetry, 8> Wheels{};
};

//------------------------------------------------------------------------------------------------------------------------
//                                                 VEHICLE CONTROLLER
//------------------------------------------------------------------------------------------------------------------------
class VehicleController
{
public:
    struct Hooks
    {
        std::function<ChassisState()>                                 ReadChassis;        // world chassis pose + velocities
        std::function<void(const Vec3& forceN, const Vec3& worldPt)>  ApplyForceAtPoint;  // accumulate for next step
        std::function<void(const Vec3& torqueNm)>                     ApplyTorque;        // optional (may be null)
        XPBDSoftTyre::GroundQuery                                     Ground;             // heightfield sample (no raycast)
    };

    // Builds one soft tyre per wheel mount at its current world hub. `initial` seeds the hub placement.
    void Build(const VehicleControllerConfig& config, const Hooks& hooks, const ChassisState& initial) noexcept;

    void SetInput(const DriverInput& input) noexcept { input_ = input; }

    // One fixed physics step: read chassis, step every tyre (nodes vs heightfield), apply wheel forces at the patches.
    void Step(float dt) noexcept;

    [[nodiscard]] const VehicleTelemetry& Telemetry() const noexcept { return telemetry_; }
    [[nodiscard]] const std::vector<XPBDSoftTyre>& Tyres() const noexcept { return tyres_; }
    [[nodiscard]] bool IsBuilt() const noexcept { return built_; }

private:
    [[nodiscard]] static float Clamp(float v, float lo, float hi) noexcept { return v < lo ? lo : (v > hi ? hi : v); }

    VehicleControllerConfig    config_;
    Hooks                      hooks_;
    std::vector<XPBDSoftTyre>  tyres_;
    DriverInput                input_;
    VehicleTelemetry           telemetry_;
    float                      steerAngle_ = 0.0f;  // filtered steer (rad)
    bool                       built_ = false;
};

} // namespace Frontier::Vehicle
