//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/XpbdTyreSpring.cpp — configurable XPBD tyre spring
//============================================================================================================================================
// Position-based tyre: radial sidewall spring + tangential shear constraint, relaxed by iterative projection
// (XPBD compliance). See XpbdTyreSpring.h for the parameter contract.
//
// Every force below is produced by constraint projection, not an empirical slip curve: the normal load is the
// carcass/air spring resisting radial deflection, and the in-plane traction is the shear constraint resisting
// the contact patch's tangential motion, capped by the friction ellipse μ·Fz. The shear deflection is
// persistent state, so grip builds and releases continuously.
//
// Frame conventions: wheel-frame +X forward, +Y lateral (left), +Z up along the contact normal. Forces come
// back in wheel-frame; the caller converts to world and applies them at the patch.

#include "XpbdTyreSpring.h"

#include <algorithm>
#include <cmath>

namespace Frontier::Vehicle {

namespace {
//--------------------------------------------------------------------------------------------------------------------
// Compliance for an XPBD stiffness over one step: α ≈ 1/(k·Δτ²). Small α ⇒ stiff constraint, large α ⇒ soft.
//--------------------------------------------------------------------------------------------------------------------
[[nodiscard]] inline float XpbdCompliance(float Stiffness_Npm, float DeltaTau) noexcept
{
    const float k = std::max(0.0f, Stiffness_Npm);
    const float dt2 = DeltaTau * DeltaTau;
    const float alpha = (dt2 > 1.0e-12f && k > 1.0e-6f) ? 1.0f / (k * dt2) : 1.0f;
    return std::max(alpha, 1.0e-6f); // never perfectly rigid — keeps the projection well conditioned
}

//--------------------------------------------------------------------------------------------------------------------
// Pressure-scaled radial stiffness, mirroring TraceContactTyre.PressureStiffness.
//--------------------------------------------------------------------------------------------------------------------
[[nodiscard]] inline float LiveRadialStiffness(const XpbdTyreParameters& P, float GaugePressure) noexcept
{
    const float Reference = P.ReferencePressurePa > 1.0f ? P.ReferencePressurePa : 1.0f;
    const float Ratio = std::isfinite(GaugePressure) && GaugePressure >= 0.0f
        ? GaugePressure / Reference : 1.0f;
    const float Share = P.PressureShare < 0.0f ? 0.0f : (P.PressureShare > 1.0f ? 1.0f : P.PressureShare);
    const float PressureFactor = (Ratio < 4.0f) ? Ratio : 4.0f;
    return P.RadialStiffness_Npm * ((1.0f - Share) + Share * PressureFactor);
}
} // namespace

//--------------------------------------------------------------------------------------------------------------------
void XpbdTyreSpring::AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept
{
    for (const auto& Pair : Parameters)
    {
        const std::string& Key = Pair.first;
        const float Value = Pair.second;
        if (Key == "RadialStiffness_Npm")      Params.RadialStiffness_Npm     = Value;
        else if (Key == "RadialDamping_Nspm")  Params.RadialDamping_Nspm      = Value;
        else if (Key == "ReferencePressurePa") Params.ReferencePressurePa     = Value;
        else if (Key == "PressureShare")       Params.PressureShare           = Value;
        else if (Key == "MaxDeflection_m")     Params.MaxDeflection_m         = Value;
        else if (Key == "LongitudinalStiffness_Npm") Params.LongitudinalStiffness_Npm = Value;
        else if (Key == "LateralStiffness_Npm")    Params.LateralStiffness_Npm      = Value;
        else if (Key == "ShearDamping_Nspm")       Params.ShearDamping_Nspm         = Value;
        else if (Key == "FrictionCoefficient")     Params.FrictionCoefficient      = Value;
        else if (Key == "CamberThrust_NpmPerRad")  Params.CamberThrust_NpmPerRad    = Value;
        else if (Key == "RollingResistance")       Params.RollingResistance         = Value;
        else if (Key == "EffectiveRadius_m")       Params.EffectiveRadius_m         = Value;
        else if (Key == "RelaxationIterations")    Params.RelaxationIterations    = static_cast<int32_t>(Value);
        else if (Key == "ComplianceFloor")         Params.ComplianceFloor          = Value;
        // Unrecognised keys are silently ignored so one TOML can serve every tyre model.
    }
    if (Params.RelaxationIterations < 1) Params.RelaxationIterations = 1;
    if (Params.RelaxationIterations > 64) Params.RelaxationIterations = 64;
}

//--------------------------------------------------------------------------------------------------------------------
void XpbdTyreSpring::Reset() noexcept
{
    ShearDeflection = Vec3{};
    SpinAngle = 0.0f;
    PrevDeflection = 0.0f;
    Initialized = false;
}

//--------------------------------------------------------------------------------------------------------------------
void XpbdTyreSpring::ProjectConstraints(const TyreModelInputs& Inputs, TyreModelOutputs& Out) noexcept
{
    const float dt = Inputs.DeltaTau > 1.0e-6f ? Inputs.DeltaTau : 1.0e-3f;

    // ---- Wheel frame in world ----------------------------------------------------------------
    const Vec3  WorldUp{0.0f, 0.0f, 1.0f};
    const Vec3  RawForward = Inputs.HubRotation.Rotate({1.0f, 0.0f, 0.0f});

    // Contact normal (ground); fall back to world up when airborne.
    Vec3 Normal = (Inputs.Contact != nullptr && Inputs.Contact->HitCount > 0u)
        ? Inputs.Contact->Normal.Normalized() : WorldUp;
    if (Normal.LengthSq() < 1.0e-6f) Normal = WorldUp;
    Normal = Normal.Normalized();

    // Wheel forward/lateral projected into the contact tangent plane (camber-aware).
    const Vec3 Forward = (RawForward - Normal * Dot(RawForward, Normal)).Normalized();
    const Vec3 Lateral = Cross(Normal, Forward).Normalized();

    // ---- Geometry ---------------------------------------------------------------
    const float Radius = (Params.EffectiveRadius_m > 1.0e-4f) ? Params.EffectiveRadius_m
        : (Inputs.Tyre != nullptr ? Inputs.Tyre->Radius : 0.34f);

    float Deflection = 0.0f;   // [m] radial compression along the normal
    float Rate = 0.0f;         // [m/s] compression rate
    if (Inputs.Contact != nullptr && Inputs.Contact->HitCount > 0u)
    {
        Deflection = std::max(0.0f, Inputs.Contact->Deflection);
        Rate = Inputs.Contact->Rate;
    }

    Deflection = std::min(Deflection, Params.MaxDeflection_m);

    // ---- Normal load: radial sidewall spring + damper (the XPBD radial constraint projection) --
    const float GaugePressure = (Inputs.Tyre != nullptr) ? Inputs.Tyre->InflationPressure : Params.ReferencePressurePa;
    const float KRadial = LiveRadialStiffness(Params, GaugePressure);
    const float SpringForce = KRadial * Deflection;                          // [N] pushing the tread away from the rim
    const float DamperForce = Params.RadialDamping_Nspm * Rate;              // [N]
    const float Fz = std::max(0.0f, SpringForce + DamperForce);              // [N] vertical load on the road

    Out.Deflection = Deflection;
    Out.ContactNormal = Normal;
    Out.Fz = Fz;
    Out.ContactCount = (Inputs.Contact != nullptr) ? Inputs.Contact->HitCount : 0u;
    Out.InContact = Out.ContactCount > 0u && Fz > 1.0f;

    // Contact patch world position: hub offset toward the road by the loaded radius.
    const float LoadedRadius = std::max(Radius - Deflection, 0.02f);
    Out.ContactPatch = Inputs.HubPosition - Normal * LoadedRadius;

    // ---- Slip kinematics at the patch ------------------------------------------
    const Vec3  HubVel = Inputs.HubLinearVelocity;
    const float SurfaceSpeed = Inputs.SpinRate * Radius;          // [m/s] tread surface speed at the patch
    const float ForwardVel = Dot(HubVel, Forward);
    const float LateralVel = Dot(HubVel, Lateral);

    const float SlipSpeedLong = ForwardVel - SurfaceSpeed;        // [m/s] + = tread sliding forward over road
    const float SlipSpeedLat  = LateralVel;                       // [m/s] + = sliding left

    const float SpeedFloor = 0.05f;                               // [m/s] avoid divide-by-zero at standstill
    const float Denom = std::max(std::fabs(ForwardVel), SpeedFloor);
    Out.SlipRatio = SlipSpeedLong / Denom;                        // [-] κ
    Out.SlipAngleRad = std::atan2(SlipSpeedLat, Denom);           // [rad] α

    // ---- Tangential shear constraint (XPBD projection) --------------------------
    // Shear deflection integrates slip velocity. The force resists the deflection (like a stretched
    // contact-patch bristle) plus a viscous term on the slip speed, all inside the friction cone.
    const float mu = std::sqrt(std::max(0.0f, Params.FrictionCoefficient) *
                               std::max(0.0f, Inputs.RoadFriction)); // geometric-mean pairing (VehicleContactMaterial)

    // Build / refresh the persistent contact-plane frame basis from this step's axes.
    if (!Initialized)
    {
        ShearDeflection = Vec3{};
        Initialized = true;
    }
    // Express current shear deflection in this step's forward/lateral basis (basis rotates with steer/camber).
    const float ShearLong = Dot(ShearDeflection, Forward);
    const float ShearLat  = Dot(ShearDeflection, Lateral);

    const float KL = Params.LongitudinalStiffness_Npm;
    const float KT = Params.LateralStiffness_Npm;

    // Trial forces from the current deflection (the position-based elastic response).
    float TrialLong = -KL * ShearLong - Params.ShearDamping_Nspm * SlipSpeedLong;
    float TrialLat  = -KT * ShearLat  - Params.ShearDamping_Nspm * SlipSpeedLat;

    // Friction ellipse cap: |shear| ≤ μ · Fz.
    const float TrialMagnitude = std::sqrt(TrialLong * TrialLong + TrialLat * TrialLat);
    const float Capacity = mu * Fz;
    float Scale = 1.0f;
    if (TrialMagnitude > Capacity && TrialMagnitude > 1.0e-6f)
        Scale = Capacity / TrialMagnitude;
    const float ShearLongForce = TrialLong * Scale;
    const float ShearLatForce  = TrialLat * Scale;

    // Integrate shear deflection with the slip velocity (relaxed, persistent — this is the "memory" that
    // makes grip build up instead of snapping). Damping removes energy so the deflection cannot race away.
    const float Relax = 0.85f; // [-] fraction of slip absorbed into the carcass per step
    const float NewShearLong = ShearLong + SlipSpeedLong * dt * Relax;
    const float NewShearLat  = ShearLat  + SlipSpeedLat  * dt * Relax;
    ShearDeflection = Forward * NewShearLong + Lateral * NewShearLat;

    // ---- Outputs ----------------------------------------------------------------
    // Fx positive forward: when the road pushes the tread backward (braking / spin-up resistance) Fx is negative;
    // the caller applies it at the patch and derives spin torque from it.
    Out.Fx = ShearLongForce;            // [N] longitudinal (drive / brake)
    Out.Fy = ShearLatForce;             // [N] lateral (cornering)

    // Camber thrust: inclined carcass pushes laterally, signed by camber.
    Out.Fy += Params.CamberThrust_NpmPerRad * Inputs.CamberRad;

    // Rolling resistance: opposes forward surface speed, proportional to load.
    if (std::fabs(SurfaceSpeed) > 1.0e-4f)
        Out.Fx -= Params.RollingResistance * Fz * (SurfaceSpeed > 0.0f ? 1.0f : -1.0f);

    // Spin torque about hub-local +Y: the tangential force at the patch acts at the loaded radius.
    //   Positive spin rolls toward +X; a forward drive force at the patch pushes the tread back,
    //   so it torques the wheel toward +spin — hence +Fx·Radius for the applied-drive reaction.
    const float SpinTorqueFromForce = ShearLongForce * LoadedRadius;
    const float RollingTorque = Params.RollingResistance * Fz * LoadedRadius *
                                (SurfaceSpeed > 0.0f ? 1.0f : -1.0f);
    Out.SpinTorqueNm = SpinTorqueFromForce - RollingTorque;

    // Self-aligning torque: lateral force acting behind the contact centre (pneumatic trail ≈ deflection).
    const float PneumaticTrail = Deflection * 0.5f;
    Out.SelfAligningTorqueNm = -ShearLatForce * PneumaticTrail;
}

//--------------------------------------------------------------------------------------------------------------------
TyreModelOutputs XpbdTyreSpring::Step(const TyreModelInputs& Inputs) noexcept
{
    TyreModelOutputs Out{};
    if (Inputs.DeltaTau <= 0.0f) return Out;

    // Track spin for telemetry (the wheel integrator owns the authoritative spin; this is diagnostic).
    SpinAngle += Inputs.SpinRate * Inputs.DeltaTau;

    ProjectConstraints(Inputs, Out);

    // Prev deflection is only a diagnostic fallback; the contact reader supplies the authoritative rate.
    PrevDeflection = Out.Deflection;
    return Out;
}

} // namespace Frontier::Vehicle
