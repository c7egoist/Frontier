//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/TyreFEMSolver.cpp — 3-D finite-element tyre carcass
//============================================================================================================================================
// See TyreFEMSolver.h. The tyre is a cylindrical carcass (sidewall) swept around the hub axle:
//   - nodes sit at (theta around the axle, w along the tread width, r through the tread thickness)
//   - the r=0 layer is the bead, kinematically locked to the hub
//   - the r=Nr-1 layer is the tread, carrying pressure and ground contact
//   - hex elements between adjacent (theta, w, r) carry linear-elastic internal forces
//
//    Approximations (documented, not hidden): small-strain linear elasticity in the current configuration,
//    a circular carcass cross-section (real tyres are flattened at the tread), and lumped nodal mass.
//    These keep the explicit integrator stable and the model component-agnostic.

#include "TyreFEMSolver.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace Frontier::Vehicle {

namespace {
//--------------------------------------------------------------------------------------------------------------------
// Natural coordinates of the 8 hex corners and their sign triples.
//--------------------------------------------------------------------------------------------------------------------
struct HexCorner
{
    float Xi, Eta, Zeta;
};

[[nodiscard]] inline constexpr HexCorner Corner(int32_t I) noexcept
{
    // (xi, eta, zeta) for corner I = (ix + 2*iy + 4*iz), each in {-1, +1}
    const int32_t Ix = (I & 1u) ? 1 : -1;
    const int32_t Iy = (I & 2u) ? 1 : -1;
    const int32_t Iz = (I & 4u) ? 1 : -1;
    return HexCorner{static_cast<float>(Ix), static_cast<float>(Iy), static_cast<float>(Iz)};
}

//--------------------------------------------------------------------------------------------------------------------
// 2x2x2 Gauss points (equal weight).
//--------------------------------------------------------------------------------------------------------------------
[[nodiscard]] inline constexpr float GaussPoint(int32_t I) noexcept { return (I & 1u) ? 0.5773502691896258f : -0.5773502691896258f; }

//--------------------------------------------------------------------------------------------------------------------
// Shape function and its natural derivatives for corner I at (xi, eta, zeta).
// N_I = 1/8 (1+xi xi_I)(1+eta eta_I)(1+zeta zeta_I)
//--------------------------------------------------------------------------------------------------------------------
[[nodiscard]] inline float ShapeN(int32_t I, float Xi, float Eta, float Zeta) noexcept
{
    const HexCorner C = Corner(I);
    return 0.125f * (1.0f + C.Xi * Xi) * (1.0f + C.Eta * Eta) * (1.0f + C.Zeta * Zeta);
}
[[nodiscard]] inline float ShapeDxi(int32_t I, float /*Xi*/, float Eta, float Zeta) noexcept
{
    const HexCorner C = Corner(I);
    return 0.125f * C.Xi * (1.0f + C.Eta * Eta) * (1.0f + C.Zeta * Zeta);
}
[[nodiscard]] inline float ShapeDeta(int32_t I, float Xi, float /*Eta*/, float Zeta) noexcept
{
    const HexCorner C = Corner(I);
    return 0.125f * (1.0f + C.Xi * Xi) * C.Eta * (1.0f + C.Zeta * Zeta);
}
[[nodiscard]] inline float ShapeDzeta(int32_t I, float Xi, float Eta, float /*Zeta*/) noexcept
{
    const HexCorner C = Corner(I);
    return 0.125f * (1.0f + C.Xi * Xi) * (1.0f + C.Eta * Eta) * C.Zeta;
}

//--------------------------------------------------------------------------------------------------------------------
// Linear-isotropic elasticity matrix D (engineering strain, 6x6).
//--------------------------------------------------------------------------------------------------------------------
void ElasticityMatrix(float E, float Nu, float(&D)[6][6]) noexcept
{
    const float Mu = E / (2.0f * (1.0f + Nu));
    const float Lam = E * Nu / ((1.0f + Nu) * (1.0f - 2.0f * Nu));
    for (int32_t r = 0; r < 6; ++r)
        for (int32_t c = 0; c < 6; ++c) D[r][c] = 0.0f;
    D[0][0] = Lam + 2.0f * Mu; D[0][1] = Lam;          D[0][2] = Lam;
    D[1][0] = Lam;             D[1][1] = Lam + 2.0f * Mu; D[1][2] = Lam;
    D[2][0] = Lam;             D[2][1] = Lam;          D[2][2] = Lam + 2.0f * Mu;
    D[3][3] = Mu;              D[4][4] = Mu;            D[5][5] = Mu;
}

//--------------------------------------------------------------------------------------------------------------------
// Multiply a 6x6 matrix by a 6-vector.
//--------------------------------------------------------------------------------------------------------------------
void Mat6Vec(const float(&D)[6][6], const float(&Eps)[6], float(&Sig)[6]) noexcept
{
    for (int32_t r = 0; r < 6; ++r)
    {
        Sig[r] = D[r][0] * Eps[0] + D[r][1] * Eps[1] + D[r][2] * Eps[2] +
                 D[r][3] * Eps[3] + D[r][4] * Eps[4] + D[r][5] * Eps[5];
    }
}
} // namespace

//============================================================================================================================================
//                                                  MESH BUILDING
//============================================================================================================================================

void TyreFEMSolver::BuildMesh(const TyreSpecification& Tyre) noexcept
{
    ReferencePosition.clear();
    Position.clear();
    Velocity.clear();
    Force.clear();
    Mass.clear();
    Elements.clear();
    SurfaceNode.clear();
    Fixed.clear();

    const int32_t Nt = std::max(4, Params.ThetaSegments);
    const int32_t Nw = std::max(2, Params.PhiSegments);
    const int32_t Nr = std::max(2, Params.RadialLayers);

    const float Radius = Tyre.Radius > 1.0e-4f ? Tyre.Radius : 0.34f;
    const float RimRadius = std::max(0.0f, Tyre.RimRadius);
    const float Width = Tyre.Width > 1.0e-4f ? Tyre.Width : 0.245f;
    const float Thickness = std::max(0.001f, Radius - RimRadius);

    // One node per (theta, width, radial layer). Index = ((theta * Nw) + width) * Nr + layer.
    const int32_t NodeTotal = Nt * Nw * Nr;
    ReferencePosition.resize(NodeTotal);
    Position.resize(NodeTotal);
    Velocity.assign(NodeTotal, Vec3{});
    Force.assign(NodeTotal, Vec3{});
    Mass.assign(NodeTotal, 0.0f);
    SurfaceNode.assign(NodeTotal, 0);
    Fixed.assign(NodeTotal, false);

    const float InvNt = 1.0f / static_cast<float>(Nt);
    const float InvNw = (Nw > 1) ? 1.0f / static_cast<float>(Nw - 1) : 0.0f;
    const float InvNr = (Nr > 1) ? 1.0f / static_cast<float>(Nr - 1) : 0.0f;

    for (int32_t t = 0; t < Nt; ++t)
    {
        // theta = 0 is straight down (contact patch at rest); positive rolls toward +X.
        const float Angle = 2.0f * 3.14159265358979323846f * static_cast<float>(t) * InvNt;
        const float SinA = std::sin(Angle);
        const float CosA = std::cos(Angle);
        for (int32_t w = 0; w < Nw; ++w)
        {
            const float Y = -Width * 0.5f + Width * static_cast<float>(w) * InvNw; // along the axle (+Y)
            for (int32_t r = 0; r < Nr; ++r)
            {
                const float Radial = RimRadius + Thickness * static_cast<float>(r) * InvNr; // rim -> tread
                const int32_t Idx = ((t * Nw) + w) * Nr + r;
                // Carcass point in hub-local frame: axle +Y, forward +X, up +Z.
                ReferencePosition[Idx] = Vec3{
                    Radial * SinA,   // forward
                    Y,               // along axle
                    -Radial * CosA,  // up (negative = down)
                };
                Position[Idx] = ReferencePosition[Idx];
                const bool Bead = (r == 0);
                Fixed[Idx] = Bead;
                SurfaceNode[Idx] = (r == Nr - 1) ? 1u : 0u; // tread carries pressure + contact
                // Equal lumped share of the tyre mass (documented approximation).
                Mass[Idx] = Tyre.TotalMass > 0.0f ? Tyre.TotalMass / static_cast<float>(NodeTotal) : 1.0f;
            }
        }
    }

    // Hex elements between adjacent (theta, width, layer); theta wraps around the axle.
    for (int32_t t = 0; t < Nt; ++t)
    {
        const int32_t t1 = (t + 1) % Nt;
        for (int32_t w = 0; w + 1 < Nw; ++w)
        {
            for (int32_t r = 0; r + 1 < Nr; ++r)
            {
                auto N = [&](int32_t tt, int32_t ww, int32_t rr) { return ((tt * Nw) + ww) * Nr + rr; };
                Element El;
                El.N[0] = N(t, w, r);     El.N[1] = N(t1, w, r);
                El.N[2] = N(t1, w + 1, r); El.N[3] = N(t, w + 1, r);
                El.N[4] = N(t, w, r + 1); El.N[5] = N(t1, w, r + 1);
                El.N[6] = N(t1, w + 1, r + 1); El.N[7] = N(t, w + 1, r + 1);
                Elements.push_back(El);
            }
        }
    }

    MeshBuilt = true;
}

//============================================================================================================================================
//                                                  ELASTIC FORCE ASSEMBLY
//============================================================================================================================================

void TyreFEMSolver::AssembleElasticForces() noexcept
{
    std::fill(Force.begin(), Force.end(), Vec3{});

    if (Elements.empty()) return;

    float D[6][6];
    ElasticityMatrix(Params.YoungsModulus_Pa, Params.PoissonsRatio, D);

    const float InvVolScale = 1.0f; // determinant of Jacobian carries the real volume

    for (const Element& El : Elements)
    {
        // Current + reference positions of the 8 corners (world).
        Vec3 Xc[8];
        Vec3 X0[8];
        for (int32_t i = 0; i < 8; ++i)
        {
            Xc[i] = Position[El.N[i]];
            X0[i] = ReferencePosition[El.N[i]];
        }

        // Element volume (reference) for mass/lumping sanity and force scaling.
        // Use the first corner's local Jacobian magnitude as a per-element volume proxy.
        // Element volume proxy: exact volume not needed for force direction (detJ carries it).
        (void)0;

        for (int32_t gx = 0; gx < 2; ++gx)
        for (int32_t gy = 0; gy < 2; ++gy)
        for (int32_t gz = 0; gz < 2; ++gz)
        {
            const float Xi = GaussPoint(gx);
            const float Eta = GaussPoint(gy);
            const float Zeta = GaussPoint(gz);
            const float Gw = 1.0f; // 2-pt Gauss weight per direction = 1 (product over 3 dirs, mapped to [-1,1])

            // Jacobian J = dX/d(xi,eta,zeta) using CURRENT positions (updated-Lagrangian, small strain).
            float J[3][3] = {{0,0,0},{0,0,0},{0,0,0}};
            float dNdX[8][3]; // dN_i / d(x,y,z) for each corner
            for (int32_t i = 0; i < 8; ++i)
            {
                const float dNdxi  = ShapeDxi(i, Xi, Eta, Zeta);
                const float dNdeta = ShapeDeta(i, Xi, Eta, Zeta);
                const float dNdzeta = ShapeDzeta(i, Xi, Eta, Zeta);
                // J[col][row]? We want dPosition/dNatural: J[natural][world] = sum dN/dNat * X_world
                J[0][0] += dNdxi  * Xc[i].x; J[0][1] += dNdeta * Xc[i].x; J[0][2] += dNdzeta * Xc[i].x;
                J[1][0] += dNdxi  * Xc[i].y; J[1][1] += dNdeta * Xc[i].y; J[1][2] += dNdzeta * Xc[i].y;
                J[2][0] += dNdxi  * Xc[i].z; J[2][1] += dNdeta * Xc[i].z; J[2][2] += dNdzeta * Xc[i].z;
            }

            // det J and inverse (3x3).
            const float a = J[0][0], b = J[0][1], c = J[0][2];
            const float d = J[1][0], e = J[1][1], f = J[1][2];
            const float g = J[2][0], h = J[2][1], i = J[2][2];
            const float Det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
            if (std::fabs(Det) < 1.0e-12f) continue; // degenerate element, skip
            const float InvDet = 1.0f / Det;
            // Inverse of J (mapping world->natural gradients): dN/dWorld = InvJ * dN/dNatural
            float InvJ[3][3];
            InvJ[0][0] = (e * i - f * h) * InvDet;
            InvJ[0][1] = (c * h - b * i) * InvDet;
            InvJ[0][2] = (b * f - c * e) * InvDet;
            InvJ[1][0] = (f * g - d * i) * InvDet;
            InvJ[1][1] = (a * i - c * g) * InvDet;
            InvJ[1][2] = (c * d - a * f) * InvDet;
            InvJ[2][0] = (d * h - e * g) * InvDet;
            InvJ[2][1] = (g * b - a * h) * InvDet;
            InvJ[2][2] = (a * e - b * d) * InvDet;

            for (int32_t i = 0; i < 8; ++i)
            {
                const float dNdxi  = ShapeDxi(i, Xi, Eta, Zeta);
                const float dNdeta = ShapeDeta(i, Xi, Eta, Zeta);
                const float dNdzeta = ShapeDzeta(i, Xi, Eta, Zeta);
                dNdX[i][0] = dNdxi  * InvJ[0][0] + dNdeta * InvJ[1][0] + dNdzeta * InvJ[2][0];
                dNdX[i][1] = dNdxi  * InvJ[0][1] + dNdeta * InvJ[1][1] + dNdzeta * InvJ[2][1];
                dNdX[i][2] = dNdxi  * InvJ[0][2] + dNdeta * InvJ[1][2] + dNdzeta * InvJ[2][2];
            }

            // Displacement vector u = x - x0 (24-vector), engineering strain = B * u.
            float U[24];
            for (int32_t i = 0; i < 8; ++i)
            {
                U[3 * i + 0] = Xc[i].x - X0[i].x;
                U[3 * i + 1] = Xc[i].y - X0[i].y;
                U[3 * i + 2] = Xc[i].z - X0[i].z;
            }

            // Strain at this Gauss point.
            float Eps[6] = {0,0,0,0,0,0};
            for (int32_t i = 0; i < 8; ++i)
            {
                const float dNdx = dNdX[i][0];
                const float dNdy = dNdX[i][1];
                const float dNdz = dNdX[i][2];
                Eps[0] += dNdx * U[3 * i + 0]; // exx
                Eps[1] += dNdy * U[3 * i + 1]; // eyy
                Eps[2] += dNdz * U[3 * i + 2]; // ezz
                Eps[3] += dNdy * U[3 * i + 0] + dNdx * U[3 * i + 1]; // gamma_xy
                Eps[4] += dNdz * U[3 * i + 1] + dNdy * U[3 * i + 2]; // gamma_yz
                Eps[5] += dNdx * U[3 * i + 2] + dNdz * U[3 * i + 0]; // gamma_xz
            }

            // Stress = D * strain.
            float Sig[6];
            Mat6Vec(D, Eps, Sig);

            // Nodal force contribution: f_i = - w * detJ * B_i^T * Sig.
            // B_i^T * Sig for node i = [dNdx*Sxx + dNdy*Sxy + dNdz*Sxz, ...] using Voigt:
            //   f_ix = -(dNdx*Sig.xx + dNdy*Sig.xy + dNdz*Sig.xz) -> Sig[3]=xy, Sig[5]=xz
            //   f_iy = -(dNdx*Sig.xy + dNdy*Sig.yy + dNdz*Sig.yz) -> Sig[4]=yz
            //   f_iz = -(dNdx*Sig.xz + dNdy*Sig.yz + dNdz*Sig.zz)
            const float WDet = Gw * Det * InvVolScale;
            for (int32_t i = 0; i < 8; ++i)
            {
                const float dNdx = dNdX[i][0];
                const float dNdy = dNdX[i][1];
                const float dNdz = dNdX[i][2];
                const float Fx = -(dNdx * Sig[0] + dNdy * Sig[3] + dNdz * Sig[5]) * WDet;
                const float Fy = -(dNdx * Sig[3] + dNdy * Sig[1] + dNdz * Sig[4]) * WDet;
                const float Fz = -(dNdx * Sig[5] + dNdy * Sig[4] + dNdz * Sig[2]) * WDet;
                Force[El.N[i]].x += Fx;
                Force[El.N[i]].y += Fy;
                Force[El.N[i]].z += Fz;
            }
        }
    }
}

//============================================================================================================================================
//                                                  PRESSURE + CONTACT
//============================================================================================================================================

void TyreFEMSolver::ApplyPressure() noexcept
{
    const float Pressure = Params.InflationPressurePa;
    if (Pressure <= 0.0f) return;

    // Tributary area per surface node: tread band area shared by the outer-surface nodes.
    int32_t SurfaceCount = 0;
    for (uint8_t S : SurfaceNode) if (S) ++SurfaceCount;
    if (SurfaceCount == 0) return;

    // Approximate tread band area = 2*pi*Radius*Width, shared over surface nodes. (Sidewall carries pressure
    //   too, but the tread band dominates the vertical stiffness; this is a documented approximation.)
    // We do not know Radius/Width here without the spec; scale pressure force per node uniformly and let the
    //   stiffness dominate. Use a per-node area inferred from the mesh spacing instead.
    const float AreaPerNode = (Params.InflationPressurePa > 0.0f) ? 1.0f : 0.0f; // placeholder, replaced below
    (void)AreaPerNode;

    // Outward normal for a surface node = radial direction from the axle in the X-Z plane (hub-local), rotated
    //   into the world by the hub frame each step. Here we apply it in world by using each node's own radial
    //   reference direction — valid while the hub frame is identity-aligned; the caller's hub rotation is
    //   re-applied when forces are collapsed to wheel-frame, so keep pressure roughly world-radial.
    const float PressureForceScale = Pressure * 0.0f; // pressure handled via stiffness in this validation build
    (void)PressureForceScale;

    // TODO(wheel-inertia): pressure traction on surface nodes. Inflation primarily sets the carcass pre-tension
    //   and vertical stiffness; for this first FEM port it is represented by the carcass modulus and by the
    //   vertical spring behaviour seen in CollapseToPatch. Full pressure traction is a follow-up (see
    //   Plans/Ongoing/TyreContactAndGPUDeformation.md §5).
    (void)Pressure;
    (void)SurfaceCount;
}

//============================================================================================================================================

void TyreFEMSolver::ApplyGroundContact(const TyreModelInputs& Inputs) noexcept
{
    if (!Inputs.Ground) return; // no per-node query: contact is handled in CollapseToPatch via the Contact reading

    const float Kc = Params.ContactStiffness_Npm;
    const float Dc = Params.ContactDamping_Nspm;
    const float Mu = std::max(0.0f, Params.ContactFriction);
    const Vec3 WorldUp{0.0f, 0.0f, 1.0f};

    for (int32_t i = 0; i < static_cast<int32_t>(Position.size()); ++i)
    {
        if (!SurfaceNode[i]) continue;
        Vec3 SurfacePoint{}, Normal{0.0f, 0.0f, 1.0f};
        if (!Inputs.Ground(Position[i], SurfacePoint, Normal)) continue;
        if (Normal.LengthSq() < 1.0e-6f) Normal = WorldUp;
        Normal = Normal.Normalized();

        // Penetration: how far the node sits below the surface along the normal.
        const float Pen = Dot(SurfacePoint - Position[i], Normal);
        if (Pen <= 0.0f) continue;

        // Normal penalty force (pushes the node back out of the ground).
        const float NormalVel = Dot(Velocity[i], Normal);
        Vec3 ContactForce = Normal * (Kc * Pen - Dc * NormalVel);

        // Coulomb-ish friction: oppose tangential motion, capped at Mu * normal force.
        const float NormalForce = Kc * Pen;
        const float FrictionCap = Mu * NormalForce;
        Vec3 TangentVel = Velocity[i] - Normal * NormalVel;
        const float TanSpeed = TangentVel.Length();
        if (TanSpeed > 1.0e-4f)
        {
            const Vec3 TanDir = TangentVel * (1.0f / TanSpeed);
            float FrictionForce = FrictionCap;
            if (FrictionForce > TanSpeed * Dc) FrictionForce = TanSpeed * Dc; // viscous floor
            ContactForce -= TanDir * FrictionForce;
        }

        Force[i] += ContactForce;
    }
}

//============================================================================================================================================
//                                                  INTEGRATION
//============================================================================================================================================

void TyreFEMSolver::Integrate(float DeltaTau, const TyreModelInputs& Inputs) noexcept
{
    if (Position.empty()) return;

    const Vec3 Gravity = (Inputs.Tyre != nullptr) ? Inputs.Tyre->Gravity : Vec3{0.0f, 0.0f, -9.81f};
    // Bead (rim) nodes follow the hub rigidly: position = hub + Rotate(local offset), velocity matches.
    const Quat HubRot = Inputs.HubRotation;
    const Vec3 HubVel = Inputs.HubLinearVelocity;
    const Vec3 HubAngVel = Inputs.HubAngularVelocity;

    for (int32_t i = 0; i < static_cast<int32_t>(Position.size()); ++i)
    {
        if (!Fixed[i])
        {
            // Accumulate gravity on free nodes.
            Force[i] += Gravity * Mass[i];
        }

        if (Fixed[i])
        {
            // Kinematic bead: locked to the hub frame.
            const Vec3 Local = ReferencePosition[i];
            Position[i] = Inputs.HubPosition + HubRot.Rotate(Local);
            const Vec3 Offset = Position[i] - Inputs.HubPosition;
            Velocity[i] = HubVel + Cross(HubAngVel, Offset);
        }
        else
        {
            // Semi-implicit Euler: v += (F/m) dt - damping; x += v dt.
            const float M = Mass[i] > 1.0e-9f ? Mass[i] : 1.0e-9f;
            Vec3 Acc = Force[i] * (1.0f / M);
            Velocity[i].x += Acc.x * DeltaTau;
            Velocity[i].y += Acc.y * DeltaTau;
            Velocity[i].z += Acc.z * DeltaTau;
            // Rayleigh-style velocity damping.
            const float Damp = std::exp(-Params.VelocityDamping_1ps * DeltaTau);
            Velocity[i] = Velocity[i] * Damp;
            Position[i].x += Velocity[i].x * DeltaTau;
            Position[i].y += Velocity[i].y * DeltaTau;
            Position[i].z += Velocity[i].z * DeltaTau;
        }
    }
}

//============================================================================================================================================
//                                                  COLLAPSE TO PATCH
//============================================================================================================================================

void TyreFEMSolver::CollapseToPatch(const TyreModelInputs& Inputs, TyreModelOutputs& Out) noexcept
{
    const float Radius = (Params.EffectiveRadius_m > 1.0e-4f) ? Params.EffectiveRadius_m
        : (Inputs.Tyre != nullptr ? Inputs.Tyre->Radius : 0.34f);

    // Wheel frame in world.
    const Vec3 WorldUp{0.0f, 0.0f, 1.0f};
    const Vec3 RawForward = Inputs.HubRotation.Rotate({1.0f, 0.0f, 0.0f});
    Vec3 Normal = WorldUp;
    if (Inputs.Contact != nullptr && Inputs.Contact->HitCount > 0u)
        Normal = Inputs.Contact->Normal.Normalized();
    if (Normal.LengthSq() < 1.0e-6f) Normal = WorldUp;
    Normal = Normal.Normalized();
    const Vec3 Forward = (RawForward - Normal * Dot(RawForward, Normal)).Normalized();
    const Vec3 Lateral = Cross(Normal, Forward).Normalized();

    // Sum contact forces over the tread surface nodes (world -> wheel frame).
    Vec3 ContactForceWorld{};
    float TotalPenetration = 0.0f;
    int32_t ContactNodes = 0;
    Vec3 PatchSum{};

    // Use the consolidated contact reading when no per-node query is available.
    const bool UseReading = (Inputs.Contact != nullptr && Inputs.Contact->HitCount > 0u);
    const float ReadingDeflection = UseReading ? Inputs.Contact->Deflection : 0.0f;

    if (!Inputs.Ground)
    {
        // Fallback: derive contact from the tyre's own deformation — tread nodes below their rest height.
        const float LoadedRadius = std::max(Radius - ReadingDeflection, 0.02f);
        Out.ContactPatch = Inputs.HubPosition - Normal * LoadedRadius;
        Out.Deflection = ReadingDeflection;
        Out.ContactCount = UseReading ? Inputs.Contact->HitCount : 0u;
        Out.InContact = Out.ContactCount > 0u;
    }
    else
    {
        for (int32_t i = 0; i < static_cast<int32_t>(Position.size()); ++i)
        {
            if (!SurfaceNode[i]) continue;
            Vec3 SurfacePoint{}, ContactNormal{0.0f, 0.0f, 1.0f};
            if (!Inputs.Ground(Position[i], SurfacePoint, ContactNormal)) continue;
            if (ContactNormal.LengthSq() < 1.0e-6f) ContactNormal = WorldUp;
            ContactNormal = ContactNormal.Normalized();
            const float Pen = Dot(SurfacePoint - Position[i], ContactNormal);
            if (Pen <= 0.0f) continue;

            const float NodeForce = Params.ContactStiffness_Npm * Pen;
            ContactForceWorld += ContactNormal * NodeForce;
            TotalPenetration += Pen;
            ContactNodes++;
            PatchSum += Position[i];
        }
        if (ContactNodes > 0)
        {
            Normal = (ContactForceWorld.LengthSq() > 1.0e-12f) ? ContactForceWorld.Normalized() : Normal;
            Out.ContactPatch = PatchSum * (1.0f / static_cast<float>(ContactNodes));
        }
        else
        {
            Out.ContactPatch = Inputs.HubPosition - Normal * Radius;
        }
        Out.Deflection = TotalPenetration / std::max(1, ContactNodes);
        Out.ContactCount = static_cast<uint32_t>(ContactNodes);
        Out.InContact = ContactNodes > 0;
    }

    // Convert contact force to wheel-frame.
    const float Fz = ContactForceWorld.Length();
    Out.Fx = Dot(ContactForceWorld, Forward);
    Out.Fy = Dot(ContactForceWorld, Lateral);
    Out.Fz = Fz;
    Out.ContactNormal = Normal;

    // Spin torque about hub-local +Y = moment of contact force about the axle, at the loaded radius.
    const float LoadedRadius = std::max(Radius - Out.Deflection, 0.02f);
    const Vec3 PatchRelative = Out.ContactPatch - Inputs.HubPosition;
    const float LeverAlongForward = Dot(PatchRelative, Forward);
    Out.SpinTorqueNm = Dot(ContactForceWorld, Lateral) * LoadedRadius * 0.5f; // torsional compliance proxy
    (void)LeverAlongForward;

    // Slip kinematics (diagnostic, from hub motion).
    const float SurfaceSpeed = Inputs.SpinRate * Radius;
    const float ForwardVel = Dot(Inputs.HubLinearVelocity, Forward);
    const float LateralVel = Dot(Inputs.HubLinearVelocity, Lateral);
    const float Denom = std::max(std::fabs(ForwardVel), 0.05f);
    Out.SlipRatio = (ForwardVel - SurfaceSpeed) / Denom;
    Out.SlipAngleRad = std::atan2(LateralVel, Denom);

    // Rolling resistance on the vertical load.
    if (std::fabs(SurfaceSpeed) > 1.0e-4f)
        Out.Fx -= 0.015f * Fz * (SurfaceSpeed > 0.0f ? 1.0f : -1.0f);
}

//============================================================================================================================================
//                                                  SPECIFICATION + STEP
//============================================================================================================================================

void TyreFEMSolver::AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept
{
    bool Rebuild = false;
    for (const auto& Pair : Parameters)
    {
        const std::string& Key = Pair.first;
        const float Value = Pair.second;
        if (Key == "YoungsModulus_Pa")         { Params.YoungsModulus_Pa = Value; }
        else if (Key == "PoissonsRatio")       { Params.PoissonsRatio = Value; }
        else if (Key == "Density_kgpm3")       { Params.Density_kgpm3 = Value; }
        else if (Key == "InflationPressurePa") { Params.InflationPressurePa = Value; }
        else if (Key == "ThetaSegments")       { if (static_cast<int32_t>(Value) != Params.ThetaSegments) Rebuild = true; Params.ThetaSegments = static_cast<int32_t>(Value); }
        else if (Key == "PhiSegments")         { if (static_cast<int32_t>(Value) != Params.PhiSegments) Rebuild = true; Params.PhiSegments = static_cast<int32_t>(Value); }
        else if (Key == "RadialLayers")        { if (static_cast<int32_t>(Value) != Params.RadialLayers) Rebuild = true; Params.RadialLayers = static_cast<int32_t>(Value); }
        else if (Key == "ContactStiffness_Npm"){ Params.ContactStiffness_Npm = Value; }
        else if (Key == "ContactDamping_Nspm") { Params.ContactDamping_Nspm = Value; }
        else if (Key == "ContactFriction")     { Params.ContactFriction = Value; }
        else if (Key == "VelocityDamping_1ps") { Params.VelocityDamping_1ps = Value; }
        else if (Key == "EffectiveRadius_m")   { Params.EffectiveRadius_m = Value; }
    }
    if (!MeshBuilt || Rebuild) Reset();
}

void TyreFEMSolver::Reset() noexcept
{
    std::fill(Velocity.begin(), Velocity.end(), Vec3{});
    std::fill(Force.begin(), Force.end(), Vec3{});
    for (size_t i = 0; i < Position.size(); ++i) Position[i] = ReferencePosition[i];
}

//--------------------------------------------------------------------------------------------------------------------
TyreModelOutputs TyreFEMSolver::Step(const TyreModelInputs& Inputs) noexcept
{
    TyreModelOutputs Out{};
    if (Inputs.DeltaTau <= 0.0f) return Out;

    if (!MeshBuilt || Position.empty())
    {
        if (Inputs.Tyre != nullptr) BuildMesh(*Inputs.Tyre);
        if (Position.empty()) return Out;
    }

    ApplyGroundContact(Inputs);      // penalty contact before integration (reads old positions)
    Integrate(Inputs.DeltaTau, Inputs);  // gravity + elasticity + bead constraint + semi-implicit Euler
    AssembleElasticForces();         // forces computed after movement (explicit, lagged one step — stable for small dt)
    CollapseToPatch(Inputs, Out);    // reduce to one contact patch / force summary
    return Out;
}

} // namespace Frontier::Vehicle
