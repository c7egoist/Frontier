//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/XPBDSoftTyre.h — calibrated multi-ring XPBD soft-body tyre (Phase 2)
//============================================================================================================================================
//
//    Phase-2 evolution of the Phase-0 `XPBDTyreSolver` skeleton (single ring) into a physically-calibrated multi-ring
//    carcass. The tyre is the one deformable element in the vehicle (the user's explicit call: tyres are rigid-XPBD soft
//    bodies, everything else stays rigid in Jolt). Following Müller et al. 2020 "Detailed Rigid Body Simulation with XPBD"
//    and the XPBD small-steps formulation (Macklin et al. 2019), the carcass is a cylindrical lattice of particles held
//    together by compliant distance constraints and inflated by a gauge-pressure body force:
//
//        • radial spokes   node ↔ rim(bead) anchor          — sidewall radial stiffness
//        • hoop            node ↔ next segment (same ring)   — tread-band circumferential stiffness
//        • lateral         node ↔ same segment (next ring)   — carcass lateral stiffness
//        • shear/diagonal  node ↔ next-segment-next-ring     — patch shear stiffness (this is what lets a slip angle
//                                                              build a lateral force and an asymmetric patch → Mz)
//        • inflation       outward radial body force P·A     — the primary vertical load carrier
//        • contact         inequality vs ground + Coulomb friction against a (possibly moving) surface velocity
//
//    Emergent behaviour: a loaded, rolling carcass with contact friction is a physical brush model. Longitudinal/lateral
//    slip deform the sticking contact patch and produce Fx/Fy that rise, peak, and saturate — the Magic-Formula shape —
//    plus a pneumatic-trail self-aligning torque. XPBDTyreValidation.cpp calibrates the handful of constitutive
//    parameters against the Phase-1 Pacejka baseline and reports the residual agreement.
//
//    Pure C++/scalar, self-contained vector math — no Unreal, no Jolt, no threading (like the other Phase-1 modules), so
//    it compiles and is validated headless in the sandbox. In the engine it is driven by the Phase-0 physics thread and
//    reads the same Jolt heightfield the rest of the sim uses (via the GroundQuery hook).

#pragma once

#include <cmath>
#include <cstdint>
#include <functional>
#include <vector>

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                              minimal vector / quaternion
//------------------------------------------------------------------------------------------------------------------------
struct Vec3
{
    float x = 0.0f, y = 0.0f, z = 0.0f;

    Vec3() = default;
    Vec3(float X, float Y, float Z) noexcept : x(X), y(Y), z(Z) {}

    Vec3 operator+(const Vec3& o) const noexcept { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const noexcept { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(float s)       const noexcept { return {x * s, y * s, z * s}; }
    Vec3& operator+=(const Vec3& o) noexcept { x += o.x; y += o.y; z += o.z; return *this; }
    Vec3& operator-=(const Vec3& o) noexcept { x -= o.x; y -= o.y; z -= o.z; return *this; }

    [[nodiscard]] float Length()    const noexcept { return std::sqrt(x * x + y * y + z * z); }
    [[nodiscard]] float LengthSq()  const noexcept { return x * x + y * y + z * z; }
    [[nodiscard]] Vec3  Normalized() const noexcept
    {
        const float l = Length();
        return (l > 1e-12f) ? Vec3{x / l, y / l, z / l} : Vec3{0, 0, 0};
    }
};

[[nodiscard]] inline float Dot(const Vec3& a, const Vec3& b) noexcept { return a.x * b.x + a.y * b.y + a.z * b.z; }
[[nodiscard]] inline Vec3  Cross(const Vec3& a, const Vec3& b) noexcept
{
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

// Quaternion (x,y,z,w). Only rotation-of-vector and axis-angle construction are needed.
struct Quat
{
    float x = 0.0f, y = 0.0f, z = 0.0f, w = 1.0f;

    [[nodiscard]] static Quat AxisAngle(const Vec3& axis, float angleRad) noexcept
    {
        const Vec3 a = axis.Normalized();
        const float h = 0.5f * angleRad, s = std::sin(h);
        return {a.x * s, a.y * s, a.z * s, std::cos(h)};
    }
    [[nodiscard]] Vec3 Rotate(const Vec3& v) const noexcept
    {
        const Vec3 u{x, y, z};
        const Vec3 t = Cross(u, v) * 2.0f;
        return v + (t * w) + Cross(u, t);
    }
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  PARAMETERS
//------------------------------------------------------------------------------------------------------------------------
struct SoftTyreParameters
{
    // Geometry
    float    Radius       = 0.34f;   // [m] unloaded tread radius
    float    RimRadius    = 0.20f;   // [m] bead/rim radius (spoke inner anchor)
    float    Width        = 0.245f;  // [m] section width
    uint32_t RingCount    = 9u;      // [-] rings across the width (≥ 2)
    uint32_t SegmentCount = 128u;    // [-] particles per ring around the circumference (≥ 8)
    float    TotalMass    = 12.0f;   // [kg] carcass mass over all particles

    // Inflation
    float    InflationPressure = 110000.0f;  // [Pa] gauge pressure — primary load carrier (calibrated vs Pacejka)

    // Compliances [m/N]  (α = 1/stiffness). Lower ⇒ stiffer. Values below are the Phase-2 calibration (see
    // XPBDTyreValidation.cpp) that best-matches the Phase-1 Pacejka baseline at ~5 kN load.
    float    SpokeCompliance   = 5.0e-5f;  // sidewall radial (soft enough for a multi-node contact patch)
    // The sidewall also resists TANGENTIAL and AXIAL motion, and until now nothing modelled that. The spoke
    // was a bare distance constraint: it pinned |node − bead| and said nothing about direction, so the whole
    // tread band was free to slide bodily around on its constraint spheres. Measured: the lattice centroid
    // drifted up to 14.6 mm from the hub at speed, and the nodes' radii about the hub then scattered by ~13 mm
    // RMS even though the band itself was still round about its own centroid. A real tyre is soft radially and
    // an order of magnitude stiffer in shear -- that is what a belted carcass IS -- so these are much lower.
    float    SpokeTangentialCompliance = 2.0e-5f;  // belt wind-up about the axle
    float    SpokeLateralCompliance    = 2.0e-5f;  // sidewall lateral (steer/camber path)
    float    SpokeShearDampingRatio    = 0.90f;
    float    HoopCompliance    = 4.0e-7f;  // tread-band circumferential
    float    LateralCompliance = 3.0e-7f;  // carcass lateral
    float    ShearCompliance   = 5.0e-7f;  // diagonal shear (patch)
    float    ContactCompliance = 1.0e-7f;  // ground contact (normal)
    // Tread tangential (bristle) compliance — sets the slip STIFFNESS (initial slope of Fx/κ, Fy/α). This is the
    // rubber-tread shear that lets the contact force build gradually before the cone limit, exactly like a brush model.
    float    TreadTangentialCompliance = 9.0e-7f;

    // ── Rayleigh damping, as DAMPING RATIOS ─────────────────────────────────────────────────────────────────
    // XPBD §5. The elastic solve alone dissipates only what the implicit discretisation happens to lose, which
    // for a 1152-node pressurised lattice is nowhere near enough: the carcass rings, and that ring is visible
    // as the tyre wobbling under a car that is otherwise driving correctly. The paper folds a Rayleigh
    // dissipation potential D = ½ Ċᵀ β Ċ into the same Gauss-Seidel update (eq. 26):
    //
    //     Δλ = (−C − α̃λ − γ ∇C·(x − xⁿ)) / ((1 + γ) Σw|∇C|² + α̃),      γ = α̃ β̃ / Δt,  β̃ = Δt² β
    //
    // so γ reduces to α·β/Δt.
    //
    // These are RATIOS (ζ), not β itself, and β is derived at Build time as β = 2ζ√(k·m) with k = 1/α and m the
    // per-node mass. Authoring β directly was a mistake worth recording: the first attempt hand-picked values
    // like β_hoop = 14 N·s/m and commented them "ζ ≈ 0.9", but the real critical coefficient for that
    // constraint is 2√(k·m) = 2√(2.5e6 × 0.0104) ≈ 322, so the tyre was running at ζ ≈ 0.04 — essentially
    // undamped — and went on ringing. A ratio cannot drift out of step with the stiffness it damps.
    float    SpokeDampingRatio   = 0.70f;   // sidewall radial
    float    HoopDampingRatio    = 0.90f;   // tread-band hoop — this is the visible ringing mode
    float    LateralDampingRatio = 0.90f;   // carcass lateral
    float    ShearDampingRatio   = 0.90f;   // diagonal shear
    float    TreadDampingRatio   = 0.80f;   // tread bristle
    // Contact stays UNDAMPED, as in the paper: XPBD §6 assumes zero compliance in contact and stores no
    // multiplier for it. Damping a near-rigid unilateral constraint mostly fights the push-out, and measurably
    // made the settled load schedule-dependent when tried.
    float    ContactDampingRatio = 0.0f;

    // Friction
    float    FrictionCoefficient = 2.2f;   // Coulomb μ (calibrated so emergent peak ≈ Pacejka D-factor at the ~0.6
                                           // patch-utilisation of this mesh resolution; see the validation report)

    Vec3     Gravity = {0.0f, 0.0f, -9.81f};   // Frontier is +Z up; spin axis is +Y; longitudinal is +X
};

//------------------------------------------------------------------------------------------------------------------------
struct SoftTyreNode
{
    Vec3  Position, Previous, Velocity;
    Vec3  TreadLocal;   // rest tread position in hub-local frame
    Vec3  BeadLocal;    // rim/bead anchor in hub-local frame
    float InverseMass = 0.0f;
    float Area = 0.0f;  // surface area this node represents (for the pressure force)
    // Brush/bristle state for the compliant tread friction.
    Vec3  BristleAnchor{};      // world root of the tread bristle on the ground (carried by the belt while stuck)
    bool  InContact = false;    // was this node in contact on the previous substep (bristle alive)?
    Vec3  ContactNormal{0.0f, 0.0f, 1.0f};   // surface normal where it touched, for the velocity pass

    // ── XPBD Lagrange multipliers ────────────────────────────────────────────────────────────────────────────
    // Macklin et al., "XPBD: Position-Based Simulation of Compliant Constrained Dynamics", eq. 18:
    //
    //     Δλ = (−C − α̃ λ) / (Σ wᵢ|∇Cᵢ|² + α̃)          α̃ = α / Δt²
    //     Δxᵢ = wᵢ ∇Cᵢ Δλ,      λ ← λ + Δλ
    //
    // λ MUST persist across the iterations of a substep and reset at the start of the next one.  Dropping it
    // (and with it the −α̃λ term) degrades XPBD back to PBD: the effective stiffness then depends on iteration
    // and substep count, which is the exact defect XPBD was published to remove.  These are the accumulators.
    float SpokeLambda   = 0.0f;   // sidewall radial constraint
    float SpokeTangentialLambda = 0.0f;   // sidewall tangential (belt wind-up)
    float SpokeLateralLambda    = 0.0f;   // sidewall axial
    float ContactLambda = 0.0f;   // ground non-penetration (unilateral: λ ≥ 0)
    float TreadLambda   = 0.0f;   // tread bristle tangential constraint
};

// Aggregate ground-on-tyre reaction over the last Step (the force the tyre transmits to the car).
struct TyreReaction
{
    Vec3  Force{};        // Fx (long), Fy (lat, along −spin-axis dir), Fz (vertical)
    float Mz = 0.0f;      // self-aligning torque about vertical through the contact centre
    uint32_t ContactCount = 0u;
    Vec3  PatchCentre{};  // world centre of the contact patch
};

//------------------------------------------------------------------------------------------------------------------------
class XPBDSoftTyre
{
public:
    using GroundQuery = std::function<bool(const Vec3& p, float& outGroundZ, Vec3& outNormal)>;

    void Build(const SoftTyreParameters& params, const Vec3& hubPos, const Quat& hubRot) noexcept;

    // Advance by dt using `substeps` XPBD substeps with the hub held kinematic at (hubPos,hubRot).
    // `surfaceVelocity` is the velocity of the ground surface itself (belt/flat-track); pass {0,0,0} for static ground.
    void Step(float dt, uint32_t substeps, const Vec3& hubPos, const Quat& hubRot,
              const Vec3& surfaceVelocity, const GroundQuery& ground) noexcept;

    [[nodiscard]] const std::vector<SoftTyreNode>& Nodes() const noexcept { return NodeRecords; }
    [[nodiscard]] const SoftTyreParameters&        Params() const noexcept { return Parameters; }
    [[nodiscard]] const TyreReaction&              Reaction() const noexcept { return ContactReaction; }
    [[nodiscard]] bool Constructed() const noexcept { return !NodeRecords.empty(); }

    [[nodiscard]] uint32_t Index(uint32_t ring, uint32_t seg) const noexcept { return ring * Parameters.SegmentCount + seg; }

private:
    // `lambda` is the edge's XPBD multiplier, reset at the top of every substep (see SoftTyreNode).
    struct Edge { uint32_t a, b; float rest, compliance, damping; float lambda = 0.0f; };   // damping = β, derived

    void BuildEdges() noexcept;

    // β = 2ζ√(k·m), k = 1/compliance, m = per-node mass. Derived once in Build so the ratio and the stiffness
    //    can never fall out of step.
    [[nodiscard]] float DerivedDamping(float compliance, float ratio) const noexcept;

    float SpokeBeta = 0.0f, ContactBeta = 0.0f, TreadBeta = 0.0f;
    float SpokeTangentialBeta = 0.0f, SpokeLateralBeta = 0.0f;   // the non-edge constraints' derived β

    SoftTyreParameters        Parameters;
    std::vector<SoftTyreNode>  NodeRecords;
    std::vector<Edge>          ConstraintEdges;
    TyreReaction               ContactReaction;
};

} // namespace Frontier::Vehicle
