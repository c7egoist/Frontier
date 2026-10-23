//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/TyreModel.h — modular tyre force seam
//============================================================================================================================================
//
//    One tyre, any component. This header is the engine-agnostic seam between a wheel/hub kinematic source
//    (chassis solver, a scripted rig, a test harness, …) and a tyre force model. A tyre model consumes the
//    wheel's motion and the ground contact reading and returns the forces and moments the tyre transmits to
//    the rim. No Jolt, no vehicle solver, no powertrain — just Vec3/Quat and the standard library — so any
//    component can instantiate any tyre model through CreateTyreModel.
//
//    Three interchangeable models ship behind the seam (all configurable, none hard-coded to a vehicle):
//
//        • Pacejka         — empirical slip (MF6.1); the validated production default (PacejkaMagicFormula).
//        • XpbdSpring      — position-based-dynamics tyre: sidewall radial compliance, pressure, and a
//                            tangential shear constraint solved by iterative projection (XPBD style).
//        • Fem3d           — 3-D finite-element carcass: a small tetrahedral/hexahedral mesh with
//                            Neo-Hookean/linear-elastic material, internal inflation pressure, penalty ground
//                            contact and semi-implicit integration.
//
//    All three take identical inputs and emit identical outputs, so a component can swap models at build or
//    run time without changing its force-application code. TyreModelKind and the factory live here; the model
//    implementations are XpbdTyreSpring.{h,cpp} and TyreFEMSolver.{h,cpp}.
//
//    Frame conventions (VehicleMath.h): right-handed, +Z up, chassis-local +X forward, +Y left, wheel axle
//    hub-local +Y; positive spin rolls the tyre toward +X. Forces come back in wheel-frame (Fx forward,
//    Fy lateral, Fz down into the road) plus the spin torque about the axle, which the wheel integrator
//    turns into angular acceleration. Vertical load Fz is reported separately from the strut's reaction.

#pragma once

#include "RigidWheel.h"     // TyreSpecification
#include "TraceContactTyre.h" // TraceContactReading, GroundQuery
#include "VehicleMath.h"    // Vec3, Quat, Dot, Cross
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                         WHICH TYRE MODEL A COMPONENT RUNS
//------------------------------------------------------------------------------------------------------------------------
enum class TyreModelKind : uint8_t
{
    Pacejka,      // empirical MF6.1 slip force (existing path; unchanged behaviour)
    XpbdSpring,   // position-based-dynamics tyre spring (configurable stiffness / pressure / damping)
    Fem3d,        // 3-D finite-element carcass (configurable mesh / modulus / pressure)
};

// Human-readable label for telemetry / inspection (matches TyreModelKind order).
[[nodiscard]] inline const char* TyreModelKindLabel(TyreModelKind K) noexcept
{
    switch (K)
    {
        case TyreModelKind::Pacejka:  return "Pacejka MF6.1 slip";
        case TyreModelKind::XpbdSpring: return "XPBD tyre spring";
        case TyreModelKind::Fem3d:    return "3-D FEM carcass";
    }
    return "unknown tyre model";
}

//------------------------------------------------------------------------------------------------------------------------
//                                         INPUTS — what every tyre model needs, once per wheel per step
//------------------------------------------------------------------------------------------------------------------------
struct TyreModelInputs
{
    // Wheel / hub kinematics (world space).
    Vec3     HubPosition{};             // [m]    hub centre
    Quat     HubRotation{};             // [-]    hub frame (steer + camber, never spin)
    Vec3     HubLinearVelocity{};       // [m/s]  hub translation (incl. strut travel)
    Vec3     HubAngularVelocity{};      // [rad/s] chassis angular velocity carried by the hub
    float    SpinRate = 0.0f;           // [rad/s] wheel rotation about hub-local +Y (+ rolls toward +X)

    // Tyre geometry / inflation (shared spec; models may override pressure internally).
    const TyreSpecification* Tyre = nullptr;   // [-] radius, width, pressure, mass, …

    // Ground contact answered by the component's own query (heightfield, collision world, …).
    const TraceContactReading* Contact = nullptr; // [-] deflection, normal, patch centre, hit count

    // Optional per-node ground query (heightfield / collision world). Used by the 3-D FEM model; the XPBD
    //   and Pacejka models read the consolidated Contact reading instead. Empty = no per-node query.
    GroundQuery Ground;

    // Step and surface.
    float    DeltaTau = 0.0f;           // [s]    fixed physics step
    float    RoadFriction = 1.0f;       // [-]    road-surface Coulomb μ at the patch (geometric-mean paired)
    float    CamberRad = 0.0f;          // [rad]  camber (redundant with HubRotation; carried for convenience)
    float    SteerRad = 0.0f;           // [rad]  steer angle applied to this wheel

    // Longitudinal demand the drivetrain applies through the wheel (N·m of spin torque, + = forward drive).
    //   A component that does not model a drivetrain passes 0 and the tyre still responds to slip kinematics.
    float    AppliedSpinTorqueNm = 0.0f;
};

//------------------------------------------------------------------------------------------------------------------------
//                                         OUTPUTS — what every tyre model promises, once per wheel per step
//------------------------------------------------------------------------------------------------------------------------
struct TyreModelOutputs
{
    // Force transmitted to the rim/hub at the contact patch, wheel-frame:
    //   Fx  [N]  longitudinal (drive / brake / rolling resistance)
    //   Fy  [N]  lateral (cornering)
    //   Fz  [N]  vertical load carried at the patch (down into the road, ≥ 0)
    float Fx = 0.0f;
    float Fy = 0.0f;
    float Fz = 0.0f;

    // Moments about the contact patch / hub.
    float SpinTorqueNm = 0.0f;          // [N·m] about hub-local +Y — spins the wheel (drive/brake reaction)
    float SelfAligningTorqueNm = 0.0f;  // [N·m] about the contact normal — steers the kingpin

    // Geometry / telemetry.
    Vec3     ContactPatch{};            // [m]    world-space patch centre
    Vec3     ContactNormal{0, 0, 1};    // [-]    averaged contact normal
    float    Deflection = 0.0f;         // [m]    radial carcass compression along the normal
    float    SlipRatio = 0.0f;          // [-]    longitudinal slip κ
    float    SlipAngleRad = 0.0f;       // [rad]  lateral slip angle α
    uint32_t ContactCount = 0u;         // [-]    contact samples touching ground
    bool     InContact = false;         // [-]    tyre is touching the road this step
};

//------------------------------------------------------------------------------------------------------------------------
//                                         TYRE MODEL — the component-agnostic seam
//------------------------------------------------------------------------------------------------------------------------
class TyreModel
{
public:
    virtual ~TyreModel() = default;

    TyreModel(const TyreModel&) = delete;
    TyreModel& operator=(const TyreModel&) = delete;

    [[nodiscard]] TyreModelKind Kind() const noexcept { return ModelKind; }

    // Configure from a TOML-authored specification bag. Derived classes read the keys they own and ignore
    //    the rest, so a component can author one tyre TOML and reuse it across models.
    virtual void AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept = 0;

    // Advance one wheel by one fixed step. Returns the forces/moments the tyre applies to the rim.
    [[nodiscard]] virtual TyreModelOutputs Step(const TyreModelInputs& Inputs) noexcept = 0;

    // Reset persistent per-tyre state (call when a wheel is removed or the sim restarts).
    virtual void Reset() noexcept = 0;

protected:
    explicit TyreModel(TyreModelKind Kind) noexcept : ModelKind(Kind) {}

    TyreModelKind ModelKind;
};

//------------------------------------------------------------------------------------------------------------------------
//                                         FACTORY — any component can build a tyre model
//------------------------------------------------------------------------------------------------------------------------
// Returns nullptr for an unregistered / unbuildable kind (e.g. FEM when the mesh failed to allocate).
[[nodiscard]] std::unique_ptr<TyreModel> CreateTyreModel(TyreModelKind Kind) noexcept;

} // namespace Frontier::Vehicle
