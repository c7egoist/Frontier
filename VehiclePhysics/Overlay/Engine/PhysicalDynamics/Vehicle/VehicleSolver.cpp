//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/VehicleSolver.cpp — Phase 3 drivable vehicle implementation
//============================================================================================================================================

#include "VehicleSolver.h"

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
void VehicleSolver::Build(const VehicleSolverConfiguration& config, const Hooks& hooks, const ChassisState& initial) noexcept
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

    // ── Production driving layer (PacejkaDrivetrain) setup ───────────────────────────────────────────────────────────
    //   Wire the Phase-1 slip + drivetrain models. The slip integrator holds a const reference to pacejka_, so pacejka_
    //   must be configured (and must outlive slip_) before the first Step. All per-wheel spin/deflection state is zeroed.
    pacejka_.SetParameters(config_.TyrePacejka);
    slip_ = std::make_unique<TyreSlipDynamics>(pacejka_);
    slip_->SetSolver(config_.SlipSolverSelection);

    drivetrain_.SetEngine(config_.Engine);
    drivetrain_.SetTurbo(config_.Turbo);
    drivetrain_.SetTransmission(config_.Transmission);
    drivetrain_.SetClutch(config_.Clutch);
    drivetrain_.SetDifferential(config_.Differential);
    drivetrain_.SetInduction(config_.Induction);
    drivetrain_.SetSupercharger(config_.Supercharger);
    drivetrain_.SetRaceTune(config_.RaceTune);
    drivetrain_.Reset(config_.Engine.IdleRPM);
    braking_.Configure(config_.Wheels.size(), config_.Brakes, config_.Abs);

    gearIndex_  = config_.Transmission.NeutralIndex;       // start in neutral (auto-clutch engages 1st on throttle)
    shiftTimer_ = config_.ShiftCooldownSeconds;
    wheelOmega_.assign(config_.Wheels.size(), 0.0f);
    slipState_.assign(config_.Wheels.size(), SlipState{});

    built_ = !tyres_.empty() && static_cast<bool>(hooks_.ReadChassis) &&
             static_cast<bool>(hooks_.ApplyForceAtPoint) && static_cast<bool>(hooks_.Ground);
}

//------------------------------------------------------------------------------------------------------------------------
void VehicleSolver::Step(float dt) noexcept
{
    if (!built_ || dt <= 0.0f) return;
    if (config_.ActiveLayer == DrivingLayer::PacejkaDrivetrain) StepPacejka(dt);
    else                                                  StepSimple(dt);
}

//------------------------------------------------------------------------------------------------------------------------
// SimpleFrictionCircle — the validated Phase-3 arcade layer (kept as a selectable fallback).
//------------------------------------------------------------------------------------------------------------------------
void VehicleSolver::StepSimple(float dt) noexcept
{
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

//------------------------------------------------------------------------------------------------------------------------
// PacejkaDrivetrain — production layer.
//
//   Same Fz-from-soft-tyre / direct-heightfield-contact path as StepSimple, but the in-plane forces are now the full
//   Magic-Formula combined-slip forces (Phase 1) driven by real per-wheel spin state and a real drivetrain:
//
//       engine → turbo → clutch → gearbox → differential ─┐   (Drivetrain::Step, GT-R defaults)
//                                                          ▼
//       per wheel:   Iw·ω̇ = T_drive − Fx·Reff − T_brake·sign(ω) − T_roll         (wheel spin ODE)
//                    slip κ,α from (Vx, Vsy, ω·Reff)  →  Fx, Fy, Mz              (TyreSlipDynamics + Pacejka)
//                    force  fwd·Fx + left·Fy + up·Fz  applied at the contact patch
//
//   The relaxation-length slip solver keeps this stable through standstill (no velocity-in-denominator singularity), so
//   the vehicle can launch from rest, hold under braking, and settle without the arcade friction-circle clamp.
//------------------------------------------------------------------------------------------------------------------------
void VehicleSolver::StepPacejka(float dt) noexcept
{
    const ChassisState cs = hooks_.ReadChassis();

    const Vec3 forward = cs.Orientation.Rotate({1.0f, 0.0f, 0.0f});
    const Vec3 up      = cs.Orientation.Rotate({0.0f, 0.0f, 1.0f});
    const float speed      = cs.LinearVelocity.Length();
    const float forwardVel = Dot(cs.LinearVelocity, forward);

    // First-order steer smoothing toward the commanded lock.
    const float targetSteer = Clamp(input_.Steer, -1.0f, 1.0f) * config_.MaxSteerAngleRad;
    const float steerBlend  = std::min(1.0f, dt * config_.SteerRatePerSecond);
    steerAngle_ += (targetSteer - steerAngle_) * steerBlend;

    const float Reff = (config_.EffectiveRadius > 0.01f) ? config_.EffectiveRadius : config_.Tyre.Radius;
    const float Iw   = std::max(0.05f, config_.WheelInertia);

    // ── Drivetrain step: gather driven-wheel spin as rpm feedback, split left/right by hub Y sign ────────────────────
    float sumRpm = 0.0f; int nDriven = 0;
    float leftRpm = 0.0f, rightRpm = 0.0f; bool haveL = false, haveR = false;
    for (size_t i = 0; i < config_.Wheels.size(); ++i)
    {
        if (!config_.Wheels[i].Driven) continue;
        const float rpm = wheelOmega_[i] * Drivetrain::kRadToRpm;
        sumRpm += rpm; ++nDriven;
        if (config_.Wheels[i].LocalOffset.y > 0.0f) { leftRpm = rpm; haveL = true; }
        else                                        { rightRpm = rpm; haveR = true; }
    }
    const float drivenAvgRpm = (nDriven > 0) ? sumRpm / static_cast<float>(nDriven) : 0.0f;
    if (!haveL) leftRpm  = drivenAvgRpm;
    if (!haveR) rightRpm = drivenAvgRpm;

    // Auto-clutch: an AMT holds NEUTRAL at a standstill (clutch open) and engages 1st only when the driver asks for
    //    drive. Without this the clutch would transmit full idle-slip torque in gear and the car would creep off with no
    //    throttle. Brakes act directly on the wheels, so they still work in neutral.
    const int neutral   = config_.Transmission.NeutralIndex;
    const int firstGear = neutral + 1;
    const int lastGear  = static_cast<int>(config_.Transmission.GearRatios.size()) - 1;
    const float throttleCmd = Clamp(input_.Throttle, 0.0f, 1.0f);
    if (gearIndex_ == neutral && (throttleCmd > 0.05f || forwardVel > 1.0f))
        gearIndex_ = firstGear;

    DrivetrainInputs di;
    di.Throttle       = throttleCmd;
    di.GearIndex      = gearIndex_;
    di.dt             = dt;
    di.DrivenWheelRPM = drivenAvgRpm;
    di.LeftWheelRPM   = leftRpm;
    di.RightWheelRPM  = rightRpm;
    const DrivetrainOutputs dOut = drivetrain_.Step(di);
    const int gearUsed = di.GearIndex;   // gear the drive torque was produced in — Ieff must match it (below)

    // ── Automatic gearbox (AMT): up/down-shift on engine rpm with a cooldown, drop to neutral once nearly stopped ─────
    shiftTimer_ += dt;
    if (gearIndex_ != neutral)
    {
        if (shiftTimer_ >= config_.ShiftCooldownSeconds)
        {
            if (dOut.EngineRPM > config_.UpshiftRPM && gearIndex_ < lastGear && throttleCmd > 0.1f)
            {
                ++gearIndex_; shiftTimer_ = 0.0f;
            }
            else if (dOut.EngineRPM < config_.DownshiftRPM && gearIndex_ > firstGear)
            {
                --gearIndex_; shiftTimer_ = 0.0f;
            }
        }
        // Declutch once nearly stopped, OR when braking firmly at low speed — otherwise idle creep through the clutch
        //    fights the brake and the car settles at a crawl instead of coming fully to rest (as a real driver would
        //    clutch in / the auto would decouple against the held brake).
        const bool nearlyStopped = speed < 0.5f && throttleCmd < 0.05f;
        const bool brakingToStop = input_.Brake > 0.4f && throttleCmd < 0.05f && speed < 3.0f;
        if (nearlyStopped || brakingToStop) gearIndex_ = neutral;
    }

    telemetry_.Chassis = cs;
    telemetry_.SpeedMetresPerSecond = speed;
    telemetry_.ForwardSpeed = forwardVel;
    telemetry_.TotalVerticalLoad = 0.0f;
    telemetry_.WheelsInContact = 0u;
    telemetry_.EngineRPM = dOut.EngineRPM;
    telemetry_.TurboRPM  = dOut.TurboRPM;
    telemetry_.BoostBar  = dOut.BoostPressure_Bar;
    telemetry_.ParasiticDrag_Nm = dOut.ParasiticDrag_Nm;
    telemetry_.GearIndex = gearIndex_;
    telemetry_.PacejkaActive = true;

    // ── Aerodynamics (GRIT source-only port, physically CLOSED-LOOP) ─────────────────────────────────────────────────
    //   Compute the whole aero package ONCE per step from the chassis state. Drag, side-force and the YAW/ROLL moments
    //   act on the chassis directly. DOWNFORCE is applied as a REAL downward force at each wheel's contact patch (front/
    //   rear share) inside the loop below — so the soft tyre physically compresses, its Fz rises, the car squats, and the
    //   lower ride height feeds back into the ground-effect terms next step. This is the closed loop a compliant tyre
    //   makes possible (no analytic load-transfer solver, no free vertical momentum): grip EMERGES from the higher Fz.
    //   The front/rear split applied at the axles also produces the aero pitch moment via the lever arms, so we do NOT
    //   additionally apply aero.PitchMoment_Nm here (that would double-count it). Ride height comes from the live CoM
    //   height above the sampled ground, so it responds to squat.
    AeroForces aero{};
    int nFrontWheels = 0, nRearWheels = 0;
    for (const WheelMount& w : config_.Wheels) { if (w.LocalOffset.x > 0.0f) ++nFrontWheels; else ++nRearWheels; }
    if (config_.Aero.Enabled)
    {
        const Vec3  right   = cs.Orientation.Rotate({0.0f, 1.0f, 0.0f});
        const float yawRate = Dot(cs.AngularVelocity, up);
        float groundZ = 0.0f; Vec3 groundN{0.0f, 0.0f, 1.0f};
        float rideHeight = config_.Aero.FloorDiffuser.RideHeightOptimum_m;
        if (hooks_.Ground(cs.Position, groundZ, groundN))
            rideHeight = std::max(0.005f, (cs.Position.z - groundZ) - config_.Aero.ComHeightAboveFloor_m);

        aero = ComputeAerodynamicForces(
            config_.Aero, cs.LinearVelocity, rideHeight, forward, right, up,
            Clamp(input_.Brake, 0.0f, 1.0f), input_.Handbrake ? 1.0f : 0.0f, throttleCmd, yawRate);

        // Drag (opposes velocity) + body side-force → chassis at the CoM.
        hooks_.ApplyForceAtPoint(aero.DragForceWorld, cs.Position);
        hooks_.ApplyForceAtPoint(aero.SideForceWorld, cs.Position);
        // Yaw + roll moments about the CoM (roll↦body-X/forward, yaw↦body-Z/up). Pitch is produced by the axle-applied
        // downforce below, so it is intentionally omitted here.
        if (hooks_.ApplyTorque)
            hooks_.ApplyTorque(forward * aero.RollMoment_Nm + up * aero.YawMoment_Nm);
    }
    const float frontDownforcePerWheel = (nFrontWheels > 0) ? std::max(0.0f, aero.FrontDownforce_N) / static_cast<float>(nFrontWheels) : 0.0f;
    const float rearDownforcePerWheel  = (nRearWheels  > 0) ? std::max(0.0f, aero.RearDownforce_N)  / static_cast<float>(nRearWheels)  : 0.0f;
    telemetry_.Aero = aero;

    for (size_t i = 0; i < tyres_.size(); ++i)
    {
        const WheelMount& wheel = config_.Wheels[i];
        XPBDSoftTyre&     tyre  = tyres_[i];

        const Vec3 hub    = cs.Position + cs.Orientation.Rotate(wheel.LocalOffset);
        const Quat steerQ = wheel.Steered ? Quat::AxisAngle(up, steerAngle_) : Quat{0, 0, 0, 1};
        const Quat hubRot = QuatNormalize(QuatMul(steerQ, cs.Orientation));

        const Vec3 r      = hub - cs.Position;
        const Vec3 hubVel = cs.LinearVelocity + Cross(cs.AngularVelocity, r);

        // Vertical load Fz from the soft tyre (direct node-vs-heightfield contact). Present the hub's PLANAR velocity as
        //    the belt velocity so the soft tyre itself contributes no in-plane drag — all traction/cornering comes from
        //    the Pacejka slip forces below, applied on top.
        const Vec3 surfaceVel{hubVel.x, hubVel.y, 0.0f};
        tyre.Step(dt, config_.TyreSubsteps, hub, hubRot, surfaceVel, hooks_.Ground);
        const TyreReaction& reaction = tyre.Reaction();

        const float Fz    = std::max(0.0f, reaction.Force.z);
        const bool  onGnd = reaction.ContactCount > 0u && Fz > 1.0f;
        const Vec3  patch = onGnd ? reaction.PatchCentre : Vec3{hub.x, hub.y, hub.z - config_.Tyre.Radius};

        // Aero downforce for THIS wheel (front axle vs rear axle share). Applied as a REAL downward force at the patch
        //    below (closed loop) — it presses the tyre, the tyre compresses, and its Fz rises over the next steps, so
        //    grip emerges from the genuine load. We therefore feed the MEASURED Fz to the slip model, not an injected one.
        const float aeroDownforce = onGnd ? ((wheel.LocalOffset.x > 0.0f) ? frontDownforcePerWheel : rearDownforcePerWheel) : 0.0f;

        // Wheel planar axes (with steer) and the slip-velocity components in that frame.
        const Vec3  wf  = PlanarNormalized(hubRot.Rotate({1.0f, 0.0f, 0.0f}));
        const Vec3  wl  = PlanarNormalized(hubRot.Rotate({0.0f, 1.0f, 0.0f}));
        const float Vx  = Dot(hubVel, wf);
        // Physical lateral velocity of the hub (+ = toward +wl / chassis-left).
        const float VlatHub = Dot(hubVel, wl);
        // Slip-angle convention: the model uses α = atan(Vsy/Vx) with NO sign inversion and returns Fy with the same
        //    sign as α, so a restoring (grip) force requires Vsy = −(lateral hub velocity) — the standard SAE definition
        //    α = −atan(Vy/Vx). Feed the negated velocity here; the returned Fy is then restoring along +wl.
        const float Vsy = -VlatHub;

        // ── Tyre slip forces (transient Magic-Formula) ──────────────────────────────────────────────────────────────
        float Fx = 0.0f, Fy = 0.0f, kappa = 0.0f, alpha = 0.0f;
        if (onGnd)
        {
            WheelKinematics K;
            K.Vx        = Vx;
            K.Vsy       = Vsy;
            K.OmegaR    = wheelOmega_[i] * Reff;
            K.CamberRad = 0.0f;
            K.Fz_N      = Fz;
            const SlipResult sr = slip_->Step(K, slipState_[i], dt);
            Fx = sr.Forces.Fx; Fy = sr.Forces.Fy; kappa = sr.Kappa; alpha = sr.AlphaRad;

            // Lateral contact damping: viscous carcass damping opposing the lateral slide velocity (physical, +wl frame).
            //    Reacted on the chassis (it is a real tyre force) and faded out with speed so fast cornering stays pure
            //    Pacejka.
            const float fade = 1.0f / (1.0f + (speed / std::max(0.1f, config_.ContactDampingFadeSpeed)) *
                                              (speed / std::max(0.1f, config_.ContactDampingFadeSpeed)));
            Fy -= config_.LateralDampingCoefficient * fade * VlatHub;

            // Numerical safety net only (NOT the arcade clamp): keep the combined force inside a generous friction
            //    circle so a transient slip spike can never inject unbounded energy. Well-behaved slip stays untouched.
            const float grip = config_.GripCoefficient * Fz * 1.3f;
            const float pmag = std::sqrt(Fx * Fx + Fy * Fy);
            if (grip > 0.0f && pmag > grip) { const float s = grip / pmag; Fx *= s; Fy *= s; }

            // ── Low-speed longitudinal STATIC friction (stiction) ──────────────────────────────────────────────────
            //   The transient slip model gives Fx → 0 as slip → 0, and the low-speed spin stabiliser holds the wheel
            //   near free-rolling, so at a crawl the tyre cannot represent the STATIC friction that actually (a) brings
            //   a braked car fully to rest and holds it, and (b) keeps a parked car from sliding down a grade up to
            //   arctan(μ). Blend in a direct arresting force — the reaction that pins this wheel's mass share, capped by
            //   available grip μ·Fz — whenever the car is NOT being driven. It fades out with speed (blend→0 by ~2 m/s),
            //   so launches and all normal driving keep pure Pacejka behaviour. Only engages while braking/coasting.
            if (throttleCmd < 0.05f)
            {
                const float crawl = 2.0f;   // [m/s] below this, stiction takes over from the slip model
                const float blend = 1.0f - std::min(1.0f, speed / crawl);
                if (blend > 0.0f)
                {
                    const float share   = config_.ChassisMass / static_cast<float>(std::max<size_t>(1, tyres_.size()));
                    const float maxHold = config_.GripCoefficient * Fz;         // static friction cap μ·Fz
                    const float hold    = Clamp(-Vx * share / dt, -maxHold, maxHold);
                    Fx = Fx * (1.0f - blend) + hold * blend;
                }
            }
        }

        // Suspension damper (shock absorber) on vertical hub velocity; tyre can only push, so clamp non-negative.
        float verticalForce = Fz;
        if (onGnd) verticalForce = std::max(0.0f, Fz - config_.SuspensionDamping * hubVel.z);

        const Vec3 planar = wf * Fx + wl * Fy;
        // Tyre reaction (world +Z up) + in-plane forces + aero downforce (real, along body −up). The downforce presses
        //    the chassis onto the patch; the tyre reacts by compressing, raising Fz next step — the closed loop.
        const Vec3 aeroDownVec = up * (-aeroDownforce);
        hooks_.ApplyForceAtPoint(Vec3{0.0f, 0.0f, verticalForce} + planar + aeroDownVec, patch);

        // ── Wheel spin ODE:  Iw·ω̇ = T_drive − Fx·Reff − T_brake·sign(ω) − T_roll ───────────────────────────────────
        float driveTq = 0.0f;
        if (wheel.Driven)
            driveTq = (wheel.LocalOffset.y > 0.0f) ? dOut.LeftDriveTorque_Nm : dOut.RightDriveTorque_Nm;

        float brakeTq = 0.0f;
        if (wheel.Braked)
        {
            if (config_.UseBrakeThermalModel)
            {
                // Hydraulic/thermal disk model with ABS. ABS watches this wheel's slip κ (computed above) and, above the
                //    ABS min speed, pulses the line pressure to hold slip near the peak-grip target — the brake torque is
                //    still applied through the anti-reversal cap below, so a modulated wheel decelerates without locking.
                BrakeWheelInput bi;
                bi.PedalCommand = Clamp(input_.Brake, 0.0f, 1.0f);
                bi.WheelOmega   = wheelOmega_[i];
                bi.SlipRatio    = kappa;
                bi.Airspeed     = speed;
                bi.Braked       = true;
                const BrakeWheelOutput bo = braking_.Step(i, bi, dt);
                brakeTq += bo.BrakeTorque_Nm;
                WheelTelemetry& bt = telemetry_.Wheels[std::min<size_t>(i, telemetry_.Wheels.size() - 1)];
                bt.BrakeTorque_Nm   = bo.BrakeTorque_Nm;
                bt.BrakePressure_Pa = bo.Pressure_Pa;
                bt.BrakeTemp_K      = bo.Temperature_K;
                bt.AbsActive        = bo.AbsActive;
            }
            else
            {
                brakeTq += input_.Brake * config_.MaxBrakeTorquePerWheel;
            }
        }
        if (input_.Handbrake && !wheel.Steered) brakeTq += config_.HandbrakeTorque;
        const float rollTq = config_.RollingResistance * Fz * Reff;

        // Effective spin inertia. A driven wheel is rigidly geared to the engine + gearbox through a stiff clutch, so its
        //    effective rotational inertia is the wheel PLUS the drivetrain inertia reflected through (gear·finalDrive)².
        //    This is not just realism: with only the bare wheel inertia the stiff clutch coupling makes explicit Euler at
        //    240 Hz blow up (dt ≫ 2·I/c). The reflected inertia (~40 kg·m² in 1st) keeps the integration stable.
        float Ieff = Iw;
        if (wheel.Driven && nDriven > 0)
        {
            const float g = config_.Transmission.RatioAt(gearUsed) * config_.Transmission.FinalDriveRatio;
            Ieff += config_.Engine.EngineInertia * g * g / static_cast<float>(nDriven);
        }

        // ── Semi-implicit wheel-spin integration with low-speed stabilisation ───────────────────────────────────────
        //   At a standstill the relaxation deflection is a pure integrator and the Magic-Formula force saturates at
        //   ±μ·Fz, so the contact behaves like dry friction (a relay). Coupled to the wheel inertia that is a stick-slip
        //   limit cycle no explicit damping can tame without itself going unstable. So the spin is integrated IMPLICITLY
        //   with a viscous pull toward the kinematic free-rolling speed ω_roll = Vx/Reff:
        //
        //        (Iw/dt + b)·ω¹ = (Iw/dt)·ω⁰ + T_drive − Fx·Reff + b·ω_roll
        //
        //   This is unconditionally stable for any b. b is strong at low speed (kills the relay) and FADES OUT with
        //   speed (fade → 0), so at speed the wheel spins/locks under the full slip dynamics with no artificial pull.
        //   ω_roll → drive still produces slip = (T_drive − Fx·Reff)/b, i.e. genuine wheelspin/launch behaviour.
        const float spinFade = 1.0f / (1.0f + (speed / std::max(0.1f, config_.ContactDampingFadeSpeed)) *
                                              (speed / std::max(0.1f, config_.ContactDampingFadeSpeed)));
        const float b        = onGnd ? config_.SpinDampingCoefficient * spinFade : 0.0f;   // [N·m per rad/s]
        const float omegaRoll = onGnd ? Vx / Reff : wheelOmega_[i];

        const float omega0 = wheelOmega_[i];
        const float invMass = 1.0f / (Ieff / dt + b);
        float omega1 = ((Ieff / dt) * omega0 + driveTq - Fx * Reff + b * omegaRoll) * invMass;

        // Brake + rolling resistance oppose spin but can never drive it through zero (anti-reversal): cap the resistive
        //    torque at exactly what brings ω to rest this step. A locked wheel then stays locked (κ → −1) while the car
        //    is moving, and the vehicle brakes cleanly to a standstill and holds there.
        const float resist = std::min(brakeTq + rollTq, std::fabs(omega1) * Ieff / dt);
        omega1 -= resist * Sign(omega1) * (dt / Ieff);
        wheelOmega_[i] = omega1;

        // Telemetry.
        WheelTelemetry& wt = telemetry_.Wheels[std::min<size_t>(i, telemetry_.Wheels.size() - 1)];
        wt.HubPosition       = hub;
        wt.HubRotation       = hubRot;
        wt.ContactPoint      = patch;
        wt.VerticalLoad      = Fz;
        wt.LongitudinalForce = Fx;
        wt.LateralForce      = Fy;
        wt.SteerAngleRad     = wheel.Steered ? steerAngle_ : 0.0f;
        wt.ContactCount      = reaction.ContactCount;
        wt.InContact         = onGnd;
        wt.WheelOmega        = wheelOmega_[i];
        wt.SlipRatio         = kappa;
        wt.SlipAngleRad      = alpha;
        wt.AeroDownforce     = aeroDownforce;

        telemetry_.TotalVerticalLoad += Fz;
        if (onGnd) ++telemetry_.WheelsInContact;
    }
}

} // namespace Frontier::Vehicle
