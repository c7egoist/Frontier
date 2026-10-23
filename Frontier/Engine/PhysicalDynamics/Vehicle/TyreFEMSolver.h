//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/TyreFEMSolver.h — 3-D finite-element tyre carcass
//============================================================================================================================================
//
//    A real (if small) 3-D finite-element tyre: the carcass is a toroidal hexahedral mesh whose nodes carry
//    mass, position and velocity. Each fixed step the solver assembles internal elastic forces from linear
//    isotropic elasticity (Young's modulus, Poisson's ratio), adds internal inflation pressure as surface
//    traction, applies gravity, resolves penalty contact against the ground at every tread node, and integrates
//    free nodes semi-implicitly. The bead (rim) nodes are kinematically locked to the hub, so the tread and
//    sidewall deform under load while the rim follows the chassis.
//
//    Pure C++/scalar: no Jolt, no vehicle solver. Any component that can supply TyreModelInputs (including a
//    per-node Ground query) can drive it. Output forces/moments match the TyreModel seam, so the FEM tyre can
//    replace Pacejka or XPBD on any wheel without touching the force-application code.
//
//    References: Bathe (1996) "Finite Element Procedures" (hex element, total-Lagrangian force assembly);
//    Belytschko et al. (2014) "Nonlinear Finite Elements" (explicit integration, penalty contact).

#pragma once

#include "TyreModel.h"

#include <cstdint>
#include <vector>

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                         CONFIGURATION — all knobs, none hard-coded to a vehicle
//------------------------------------------------------------------------------------------------------------------------
struct TyreFEMParameters
{
    // ---- Carcass material (linear isotropic) -----------------------------------------------
    float YoungsModulus_Pa      = 8.0e6f;   // [Pa] carcass rubber / cord composite modulus
    float PoissonsRatio         = 0.45f;    // [-]  near-incompressible rubber
    float Density_kgpm3         = 1100.0f;  // [kg/m³] carcass density

    // ---- Inflation -------------------------------------------------------------------------
    float InflationPressurePa   = 110000.0f; // [Pa] cold gauge pressure (outward surface traction)

    // ---- Mesh resolution -------------------------------------------------------------------
    int32_t ThetaSegments       = 12;       // [-]  elements around the circumference
    int32_t PhiSegments         = 8;        // [-]  elements around the tube cross-section
    int32_t RadialLayers        = 3;        // [-]  element layers through the tread thickness

    // ---- Ground contact (penalty) ----------------------------------------------------------
    float ContactStiffness_Npm  = 2.0e6f;   // [N/m] ground penalty stiffness per penetrating node
    float ContactDamping_Nspm   = 5.0e4f;   // [N·s/m] ground penalty damping per penetrating node
    float ContactFriction       = 0.9f;     // [-] tread/road μ for tangential contact damping

    // ---- Integration -----------------------------------------------------------------------
    float VelocityDamping_1ps   = 4.0f;     // [1/s] Rayleigh-style velocity damping (keeps the explicit
                                            //     integrator stable under stiff contact)

    // ---- Rolling radius --------------------------------------------------------------------
    float EffectiveRadius_m     = 0.0f;     // [m] <= 0 ⇒ Tyre::Radius
};

//------------------------------------------------------------------------------------------------------------------------
//                                         MODEL
//------------------------------------------------------------------------------------------------------------------------
// One FEM tyre instance owns its mesh and per-node state. Reconfigurable through AssignSpecification (the mesh
//   is rebuilt when resolution or geometry keys change).
class TyreFEMSolver final : public TyreModel
{
public:
    TyreFEMSolver() noexcept : TyreModel(TyreModelKind::Fem3d) {}

    void AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept override;

    [[nodiscard]] TyreModelOutputs Step(const TyreModelInputs& Inputs) noexcept override;
    void Reset() noexcept override;

    [[nodiscard]] const TyreFEMParameters& QueryParameters() const noexcept { return Params; }
    [[nodiscard]] uint32_t NodeCount() const noexcept { return static_cast<uint32_t>(Position.size()); }
    [[nodiscard]] uint32_t ElementCount() const noexcept { return static_cast<uint32_t>(Elements.size() / 8); }

private:
    struct Element
    {
        int32_t N[8]; // node indices (hexahedron)
    };

    // Build / rebuild the toroidal hex mesh from the live tyre geometry + resolution.
    void BuildMesh(const TyreSpecification& Tyre) noexcept;

    // Assemble internal elastic forces (total-Lagrangian, linear elasticity, 2x2x2 Gauss).
    void AssembleElasticForces() noexcept;
    // Surface traction from inflation pressure on the outer tread/sidewall surface.
    void ApplyPressure() noexcept;
    // Penalty contact + Coulomb-ish friction at every node against Ground.
    void ApplyGroundContact(const TyreModelInputs& Inputs) noexcept;
    // Semi-implicit Euler integration of the free nodes; bead nodes follow the hub.
    void Integrate(float DeltaTau, const TyreModelInputs& Inputs) noexcept;

    // Reduce the deformed mesh to one contact patch / force summary in wheel-frame.
    void CollapseToPatch(const TyreModelInputs& Inputs, TyreModelOutputs& Out) noexcept;

    TyreFEMParameters Params{};

    // Mesh.
    std::vector<Vec3> ReferencePosition{}; // rest pose (bead-local / hub-local at build)
    std::vector<Vec3> Position{};          // current deformed position (world)
    std::vector<Vec3> Velocity{};          // current nodal velocity (world)
    std::vector<Vec3> Force{};             // accumulated nodal force (world)
    std::vector<float> Mass{};             // lumped nodal mass [kg]
    std::vector<Element> Elements{};       // hexahedra
    std::vector<uint8_t> SurfaceNode{};    // 1 = node carries pressure / is eligible for contact
    std::vector<bool> Fixed{};             // bead nodes: kinematically locked to the hub

    bool MeshBuilt = false;
};

} // namespace Frontier::Vehicle
