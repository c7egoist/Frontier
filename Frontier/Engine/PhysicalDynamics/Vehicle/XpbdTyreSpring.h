//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/XpbdTyreSpring.h — configurable XPBD tyre spring
//============================================================================================================================================
//
//    Position-based-dynamics tyre. The tread contact patch is a particle carried by the hub; each fixed step the
//    solver projects two constraints — the sidewall radial spring (normal load) and a tangential shear
//    constraint (traction) — with Extended Position-Based Dynamics compliance. The shear deflection is
//    integrated as persistent state, so the tyre builds up and releases grip continuously instead of snapping
//    to an empirical slip curve.
//
//    Pure C++/scalar: no Jolt, no vehicle solver. Any component that can supply TyreModelInputs can drive it.
//
//    References: position-based dynamics (Müller et al. 2007) extended with compliance (XPBD,
//    Macklin et al. 2016); the radial/pressure split follows TraceContactTyre.h's carcass/air model.

#pragma once

#include "TyreModel.h"

#include <array>
#include <cstdint>

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                         CONFIGURATION — all knobs, none hard-coded to a vehicle
//------------------------------------------------------------------------------------------------------------------------
struct XpbdTyreParameters
{
    // ---- Carcass (normal / radial) -----------------------------------------------------------
    float RadialStiffness_Npm     = 250000.0f;   // [N/m] carcass radial stiffness at ReferencePressure
    float RadialDamping_Nspm      = 1500.0f;     // [N·s/m] carcass radial damping
    float ReferencePressurePa     = 110000.0f;   // [Pa] gauge pressure RadialStiffness was tuned for
    float PressureShare           = 0.75f;       // [-] fraction of stiffness carried by the air
                                                //     k_live = k0 · (1 − share + share · p / p_ref), capped
    float MaxDeflection_m         = 0.10f;       // [m] clamp on radial compression (rim-contact guard)

    // ---- Tangential shear (traction / slip) --------------------------------------------------
    float LongitudinalStiffness_Npm = 800000.0f; // [N/m] shear stiffness along wheel forward
    float LateralStiffness_Npm      = 900000.0f; // [N/m] shear stiffness along wheel lateral
    float ShearDamping_Nspm         = 20000.0f;  // [N·s/m] tangential damping on slip velocity
    float FrictionCoefficient       = 1.0f;      // [-] tread μ; combined with RoadFriction (geometric mean)
                                                //     to cap the shear force at μ · Fz (friction ellipse)
    float CamberThrust_NpmPerRad    = 40000.0f;  // [N/rad] camber thrust (lateral force per rad of camber)

    // ---- Rolling & spin ----------------------------------------------------------------------
    float RollingResistance       = 0.015f;      // [-] fraction of Fz opposing forward surface speed
    float EffectiveRadius_m       = 0.0f;        // [m] rolling radius; <= 0 ⇒ Tyre::Radius

    // ---- Solver ------------------------------------------------------------------------------
    int32_t RelaxationIterations  = 8;           // [-] XPBD projection iterations per step
    float   ComplianceFloor       = 1.0e-6f;     // [-] keeps constraints well conditioned
};

//------------------------------------------------------------------------------------------------------------------------
//                                         MODEL
//------------------------------------------------------------------------------------------------------------------------
// One tyre instance holds persistent per-tyre state (shear deflection, spin, previous deflection).
class XpbdTyreSpring final : public TyreModel
{
public:
    XpbdTyreSpring() noexcept : TyreModel(TyreModelKind::XpbdSpring) {}

    void AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept override;

    [[nodiscard]] TyreModelOutputs Step(const TyreModelInputs& Inputs) noexcept override;
    void Reset() noexcept override;

    [[nodiscard]] const XpbdTyreParameters& QueryParameters() const noexcept { return Params; }

private:
    // One relaxed projection pass over the two constraints (normal + tangential).
    void ProjectConstraints(TyreModelInputs const& Inputs, TyreModelOutputs& Out) noexcept;

    XpbdTyreParameters Params{};

    // Persistent per-tyre state (rebuilt into wheel-frame axes each step).
    Vec3   ShearDeflection{};   // [m] tangential shear deflection in the contact tangent frame
    float  SpinAngle = 0.0f;    // [rad] accumulated wheel spin
    float  PrevDeflection = 0.0f; // [m] radial deflection at the end of the previous step
    bool   Initialized = false; // [-] first step primes the contact particle
};

} // namespace Frontier::Vehicle
