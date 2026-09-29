//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/VehicleController.cpp — Phase 3 drivable vehicle implementation
//============================================================================================================================================

#include "VehicleController.h"

#include <algorithm>
#include <cmath>

namespace Frontier::Vehicle {

namespace {
[[nodiscard]] inline float Sign(float v) noexcept { return v > 0.0f ? 1.0f : (v < 0.0f ? -1.0f : 0.0f); }
[[nodiscard]] inline Vec3  PlanarNormalized(const Vec3& v) noexcept
{
    Vec3 p{v.x, v.y, 0.0f};
    const float l = p.Length();
    return (l > 1e-6f) ? Vec3{p.x / l, p.y / l, 0.0f} : Vec3{0, 0, 0};
}
} // namespace

//------------------------------------------------------------------------------------------------------------------------
void VehicleController::Build(const VehicleControllerConfig& config, const Hooks& hooks, const ChassisState& initial) noexcept
{
    config_ = config;
    hooks_  = hooks;
    input_  = {};
    steerAngle_ = 0.0f;
    telemetry_ = {};

    tyres_.clear();
    tyres_.resize(config_.Wheels.size());
    for (size_t i = 0; i < config_.Wheels.size(); ++i)
    {
        const WheelMount& w = config_.Wheels[i];
        const Vec3 hub = initial.Position + initial.Orientation.Rotate(w.LocalOffset);
        tyres_[i].Build(config_.Tyre, hub, initial.Orientation);
    }
    telemetry_.WheelCount = static_cast<uint32_t>(tyres_.size());
    built_ = !tyres_.empty() && static_cast<bool>(hooks_.ReadChassis) &&
             static_cast<bool>(hooks_.ApplyForceAtPoint) && static_cast<bool>(hooks_.Ground);
}

//------------------------------------------------------------------------------------------------------------------------
void VehicleController::Step(float dt) noexcept
{
    if (!built_ || dt <= 0.0f) return;

    const ChassisState cs = hooks_.ReadChassis();

    // Chassis basis in world.
    const Vec3 forward = cs.Orientation.Rotate({1.0f, 0.0f, 0.0f});
    const Vec3 up      = cs.Orientation.Rotate({0.0f, 0.0f, 1.0f});
    const float speed      = cs.LinearVelocity.Length();
    const float forwardVel = Dot(cs.LinearVelocity, forward);

    // First-order steer smoothing toward the commanded lock.
    const float targetSteer = Clamp(input_.Steer, -1.0f, 1.0f) * config_.MaxSteerAngleRad;
    const float alpha = std::min(1.0f, dt * config_.SteerRatePerSecond);
    steerAngle_ += (targetSteer - steerAngle_) * alpha;

    telemetry_.Chassis = cs;
    telemetry_.SpeedMetresPerSecond = speed;
    telemetry_.ForwardSpeed = forwardVel;
    telemetry_.TotalVerticalLoad = 0.0f;
    telemetry_.WheelsInContact = 0u;

    const float mu = config_.GripCoefficient;

    for (size_t i = 0; i < tyres_.size(); ++i)
    {
        const WheelMount& wheel = config_.Wheels[i];
        XPBDSoftTyre&     tyre  = tyres_[i];

        // Rest hub world transform (the tyre models the compliance; the hub follows the chassis rigidly).
        const Vec3 armLocal = wheel.LocalOffset;
        const Vec3 hub = cs.Position + cs.Orientation.Rotate(armLocal);
        const Quat steerQ  = wheel.Steered ? Quat::AxisAngle(up, steerAngle_) : Quat{0, 0, 0, 1};
        const Quat hubRot  = QuatNormalize(QuatMul(steerQ, cs.Orientation));

        // Hub velocity from rigid-body kinematics (v + ω × r).
        const Vec3 r      = hub - cs.Position;
        const Vec3 hubVel = cs.LinearVelocity + Cross(cs.AngularVelocity, r);

        // Free-rolling reference: present the hub's PLANAR velocity as the belt/surface velocity so the loaded tyre does
        //    not manufacture spurious drag from the hub simply translating (this tyre models no wheel spin). It then
        //    reports the vertical load Fz through direct node-vs-heightfield contact; the in-plane forces are the driving
        //    layer below, bounded by that load. Vertical (Z) slip is left untouched so contact still resolves normally.
        const Vec3 surfaceVel{hubVel.x, hubVel.y, 0.0f};
        tyre.Step(dt, config_.TyreSubsteps, hub, hubRot, surfaceVel, hooks_.Ground);
        const TyreReaction& reaction = tyre.Reaction();

        const float Fz    = std::max(0.0f, reaction.Force.z);
        const bool  onGnd = reaction.ContactCount > 0u && Fz > 1.0f;
        const Vec3  patch = onGnd ? reaction.PatchCentre : Vec3{hub.x, hub.y, hub.z - config_.Tyre.Radius};

        // Wheel planar axes (with steer).
        const Vec3 wf = PlanarNormalized(hubRot.Rotate({1.0f, 0.0f, 0.0f}));
        const Vec3 wl = PlanarNormalized(hubRot.Rotate({0.0f, 1.0f, 0.0f}));
        const float vLong = Dot(hubVel, wf);
        const float vLat  = Dot(hubVel, wl);

        // Longitudinal demand: engine (driven) minus a braking magnitude that always OPPOSES motion and can never
        //    reverse the car — the braking force is clamped to at most what brings this wheel's share to a standstill
        //    this step (mass·|v|/dt / wheels), so brakes + rolling resistance decelerate cleanly to zero and hold.
        const float engine = wheel.Driven ? input_.Throttle * config_.DriveForcePerWheel : 0.0f;
        float brakeMag = 0.0f;
        if (wheel.Braked)                        brakeMag += input_.Brake * config_.BrakeForcePerWheel;
        if (input_.Handbrake && !wheel.Steered)  brakeMag += config_.HandbrakeForce;
        brakeMag += config_.RollingResistance * Fz;
        const float wheelCount = static_cast<float>(std::max<size_t>(1, tyres_.size()));
        const float maxStopForce = std::fabs(vLong) * config_.ChassisMass / (dt * wheelCount);
        const float brakeApplied = std::min(brakeMag, maxStopForce);
        float longDemand = engine - brakeApplied * Sign(vLong);

        // Lateral demand: a load-scaled linear cornering force opposing side-slip velocity (damped, so it settles).
        const float loadFraction = (config_.ChassisMass > 1.0f)
                                 ? Fz / (config_.ChassisMass * 9.81f / std::max<size_t>(1, tyres_.size()))
                                 : 1.0f;
        float latDemand = -config_.CorneringStiffness * loadFraction * vLat;

        // Friction circle: clamp the combined in-plane force to μ·Fz.
        Vec3 planar = wf * longDemand + wl * latDemand;
        const float grip = mu * Fz;
        const float mag  = planar.Length();
        if (grip > 0.0f && mag > grip) planar = planar * (grip / mag);
        else if (grip <= 0.0f)          planar = {0, 0, 0};   // airborne wheel: no in-plane force

        // Suspension damper: resist vertical hub velocity so the soft tyre does not bounce (a shock absorber). The tyre
        //    can only push, so the damped vertical force is clamped non-negative.
        float verticalForce = Fz;
        if (onGnd)
        {
            const float vVert = hubVel.z;
            verticalForce = std::max(0.0f, Fz - config_.SuspensionDamping * vVert);
        }

        // Apply the tyre's vertical reaction (plus damper) and the driving force at the contact patch.
        const Vec3 wheelForce = Vec3{0.0f, 0.0f, verticalForce} + planar;
        hooks_.ApplyForceAtPoint(wheelForce, patch);

        // Telemetry.
        WheelTelemetry& wt = telemetry_.Wheels[std::min<size_t>(i, telemetry_.Wheels.size() - 1)];
        wt.HubPosition       = hub;
        wt.HubRotation       = hubRot;
        wt.ContactPoint      = patch;
        wt.VerticalLoad      = Fz;
        wt.LongitudinalForce = Dot(planar, wf);
        wt.LateralForce      = Dot(planar, wl);
        wt.SteerAngleRad     = wheel.Steered ? steerAngle_ : 0.0f;
        wt.ContactCount      = reaction.ContactCount;
        wt.InContact         = onGnd;

        telemetry_.TotalVerticalLoad += Fz;
        if (onGnd) ++telemetry_.WheelsInContact;
    }
}

} // namespace Frontier::Vehicle
