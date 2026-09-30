//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/XPBDSoftTyre.cpp
//============================================================================================================================================

#include "XPBDSoftTyre.h"

#include <algorithm>

namespace Frontier::Vehicle {

namespace { constexpr float kPi = 3.14159265358979323846f; }

//------------------------------------------------------------------------------------------------------------------------
//                                                      BUILD
//------------------------------------------------------------------------------------------------------------------------
void XPBDSoftTyre::Build(const SoftTyreParameters& params, const Vec3& hubPos, const Quat& hubRot) noexcept
{
    Parameters = params;
    Parameters.RingCount    = std::max<uint32_t>(2u, Parameters.RingCount);
    Parameters.SegmentCount = std::max<uint32_t>(8u, Parameters.SegmentCount);

    const uint32_t R = Parameters.RingCount, S = Parameters.SegmentCount;
    const uint32_t N = R * S;
    NodeRecords.assign(N, SoftTyreNode{});

    const float perNodeMass = (Parameters.TotalMass > 0.0f) ? Parameters.TotalMass / static_cast<float>(N) : 0.0f;
    const float invMass     = (perNodeMass > 0.0f) ? 1.0f / perNodeMass : 0.0f;

    // Circumferential arc length × lateral strip width → per-node surface area (for the pressure body force).
    const float circ = 2.0f * kPi * Parameters.Radius;
    const float area = (circ / static_cast<float>(S)) * (Parameters.Width / static_cast<float>(R));

    // Spin axis = +Y (hub-local); ring plane = X/Z. Rings distributed across the width in Y.
    for (uint32_t r = 0u; r < R; ++r)
    {
        const float yOff = (R > 1u)
            ? (-0.5f * Parameters.Width + Parameters.Width * (static_cast<float>(r) / static_cast<float>(R - 1u)))
            : 0.0f;
        for (uint32_t s = 0u; s < S; ++s)
        {
            const float ang = (2.0f * kPi * static_cast<float>(s)) / static_cast<float>(S);
            const float c = std::cos(ang), sn = std::sin(ang);
            SoftTyreNode& node = NodeRecords[Index(r, s)];
            node.TreadLocal = {Parameters.Radius * c, yOff, Parameters.Radius * sn};
            node.BeadLocal  = {Parameters.RimRadius * c, yOff, Parameters.RimRadius * sn};
            node.Position   = hubPos + hubRot.Rotate(node.TreadLocal);
            node.Previous   = node.Position;
            node.Velocity   = {0, 0, 0};
            node.InverseMass = invMass;
            node.Area = area;
        }
    }

    SpokeBeta   = DerivedDamping(Parameters.SpokeCompliance, Parameters.SpokeDampingRatio);
    ContactBeta = DerivedDamping(Parameters.ContactCompliance, Parameters.ContactDampingRatio);
    TreadBeta   = DerivedDamping(Parameters.TreadTangentialCompliance, Parameters.TreadDampingRatio);

    BuildEdges();
    ContactReaction = TyreReaction{};
}

float XPBDSoftTyre::DerivedDamping(float compliance, float ratio) const noexcept
{
    if (!(compliance > 0.0f) || !(ratio > 0.0f) || NodeRecords.empty()) return 0.0f;
    const float perNodeMass = (Parameters.TotalMass > 0.0f)
                            ? Parameters.TotalMass / static_cast<float>(NodeRecords.size()) : 0.0f;
    if (!(perNodeMass > 0.0f)) return 0.0f;
    return 2.0f * ratio * std::sqrt(perNodeMass / compliance);   // 2ζ√(k·m), k = 1/α
}

void XPBDSoftTyre::BuildEdges() noexcept
{
    ConstraintEdges.clear();
    const uint32_t R = Parameters.RingCount, S = Parameters.SegmentCount;

    auto restLen = [&](uint32_t a, uint32_t b) { return (NodeRecords[a].TreadLocal - NodeRecords[b].TreadLocal).Length(); };

    for (uint32_t r = 0u; r < R; ++r)
        for (uint32_t s = 0u; s < S; ++s)
        {
            const uint32_t i = Index(r, s);
            const uint32_t sn = (s + 1u) % S;

            // Hoop (circumferential, same ring) — always present.
            {
                const uint32_t j = Index(r, sn);
                ConstraintEdges.push_back({i, j, restLen(i, j), Parameters.HoopCompliance, DerivedDamping(Parameters.HoopCompliance, Parameters.HoopDampingRatio)});
            }
            if (r + 1u < R)
            {
                // Lateral (same segment, next ring).
                const uint32_t j = Index(r + 1u, s);
                ConstraintEdges.push_back({i, j, restLen(i, j), Parameters.LateralCompliance, DerivedDamping(Parameters.LateralCompliance, Parameters.LateralDampingRatio)});
                // Shear diagonal (next segment, next ring).
                const uint32_t k = Index(r + 1u, sn);
                ConstraintEdges.push_back({i, k, restLen(i, k), Parameters.ShearCompliance, DerivedDamping(Parameters.ShearCompliance, Parameters.ShearDampingRatio)});
                // Anti-diagonal (this ring's next seg ↔ next ring's this seg) for symmetric shear.
                const uint32_t a = Index(r, sn), b = Index(r + 1u, s);
                ConstraintEdges.push_back({a, b, restLen(a, b), Parameters.ShearCompliance, DerivedDamping(Parameters.ShearCompliance, Parameters.ShearDampingRatio)});
            }
        }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      STEP
//------------------------------------------------------------------------------------------------------------------------
void XPBDSoftTyre::Step(float dt, uint32_t substeps, const Vec3& hubPos, const Quat& hubRot,
                        const Vec3& surfaceVelocity, const GroundQuery& ground) noexcept
{
    ContactReaction = TyreReaction{};
    if (NodeRecords.empty() || !(dt > 0.0f)) return;

    substeps = std::max<uint32_t>(1u, substeps);
    const float h = dt / static_cast<float>(substeps);
    const float h2 = h * h;
    const float invH2 = 1.0f / h2;

    const Vec3 axisWorld = hubRot.Rotate({0, 1, 0}).Normalized();   // spin axis in world

    Vec3  sumForce{};
    Vec3  sumTorqueRef{};    // torque of contact forces about hub ground projection (for Mz)
    Vec3  sumPatch{};
    float patchN = 0.0f;
    float contactAccum = 0.0f;

    const float alphaContact = Parameters.ContactCompliance * invH2;
    const float gammaContact = Parameters.ContactCompliance * ContactBeta / h;

    for (uint32_t sub = 0u; sub < substeps; ++sub)
    {
        // ── reset the Lagrange multipliers ───────────────────────────────────────────────────────────────────────
        // XPBD §3.2: λ is zeroed at the START of each substep and accumulated across that substep's iterations.
        // Carrying it between substeps would make the constraint remember a force it has already applied.
        for (SoftTyreNode& node : NodeRecords)
        { node.SpokeLambda = 0.0f; node.ContactLambda = 0.0f; node.TreadLambda = 0.0f; }
        for (Edge& e : ConstraintEdges) e.lambda = 0.0f;

        // ── predict: gravity + inflation-pressure body force ──────────────────────────────────────────────────────
        for (SoftTyreNode& node : NodeRecords)
        {
            if (node.InverseMass <= 0.0f) { node.Previous = node.Position; continue; }

            // Outward radial direction from the spin axis through the node.
            const Vec3 rel = node.Position - hubPos;
            const Vec3 along = axisWorld * Dot(rel, axisWorld);
            Vec3 radial = (rel - along);
            const float rl = radial.Length();
            radial = (rl > 1e-6f) ? radial * (1.0f / rl) : Vec3{0, 0, 1};

            const Vec3 pressureForce = radial * (Parameters.InflationPressure * node.Area);
            const Vec3 accel = Parameters.Gravity + pressureForce * node.InverseMass;

            node.Velocity += accel * h;
            node.Previous = node.Position;
            node.Position += node.Velocity * h;
        }

        // ── project: spokes (node ↔ rim/bead anchor) ─────────────────────────────────────────────────────────────
        // XPBD eq. 18 throughout: Δλ = (−C − α̃λ)/(Σw|∇C|² + α̃), Δx = w ∇C Δλ, λ += Δλ.  |∇C| = 1 for a
        // distance constraint, so the denominator is Σw + α̃.
        const float alphaSpoke = Parameters.SpokeCompliance * invH2;
        const float gammaSpoke = Parameters.SpokeCompliance * SpokeBeta / h;   // γ = α·β/Δt
        const float spokeRest = Parameters.Radius - Parameters.RimRadius;
        for (SoftTyreNode& node : NodeRecords)
        {
            if (node.InverseMass <= 0.0f) continue;
            const Vec3 anchor = hubPos + hubRot.Rotate(node.BeadLocal);
            Vec3 d = node.Position - anchor;
            const float dist = d.Length();
            if (dist < 1e-6f) continue;
            const Vec3 dir = d * (1.0f / dist);
            const float C = dist - spokeRest;
            // eq. 26: the damping term measures how fast the constraint is being violated THIS substep, as
            // ∇C·(x − xⁿ), and resists it. Without it the lattice is a pure spring network and rings.
            const float cDot = Dot(dir, node.Position - node.Previous);
            const float dLambda = (-C - alphaSpoke * node.SpokeLambda - gammaSpoke * cDot)
                                / ((1.0f + gammaSpoke) * node.InverseMass + alphaSpoke);
            node.SpokeLambda += dLambda;
            node.Position += dir * (dLambda * node.InverseMass);
        }

        // ── project: internal lattice edges (hoop / lateral / shear) ─────────────────────────────────────────────
        for (Edge& e : ConstraintEdges)
        {
            SoftTyreNode& A = NodeRecords[e.a];
            SoftTyreNode& B = NodeRecords[e.b];
            const float wsum = A.InverseMass + B.InverseMass;
            if (wsum <= 0.0f) continue;
            Vec3 d = B.Position - A.Position;
            const float dist = d.Length();
            if (dist < 1e-6f) continue;
            const Vec3 dir = d * (1.0f / dist);
            const float C = dist - e.rest;
            const float alpha = e.compliance * invH2;
            const float gamma = e.compliance * e.damping / h;                      // γ = α·β/Δt (eq. 26)
            const float cDot = Dot(dir, (B.Position - B.Previous) - (A.Position - A.Previous));
            const float dLambda = (-C - alpha * e.lambda - gamma * cDot)
                                / ((1.0f + gamma) * wsum + alpha);
            e.lambda += dLambda;
            A.Position -= dir * (dLambda * A.InverseMass);
            B.Position += dir * (dLambda * B.InverseMass);
        }

        // ── project: ground contact (normal) + compliant tread-bristle friction (brush model) ─────────────────────
        if (ground)
        {
            const Vec3 beltDisp = surfaceVelocity * h;   // how far the surface moves this substep
            // ONE compliance convention, everywhere: α is the authored compliance [m/N] and α̃ = α/Δτ² is what
            // enters the solve.  The previous code carried the tread as raw α in the stick/slide test but as
            // α/h² in the position correction two lines later, so the cone threshold and the correction it
            // guarded were computed against different stiffnesses and disagreed by a factor of Δτ².
            const float alphaTread = Parameters.TreadTangentialCompliance * invH2;
            const float gammaTread = Parameters.TreadTangentialCompliance * TreadBeta / h;
            for (SoftTyreNode& node : NodeRecords)
            {
                if (node.InverseMass <= 0.0f) continue;
                float gz = 0.0f; Vec3 normal{0, 0, 1};
                bool onGround = ground(node.Position, gz, normal);
                normal = onGround ? normal.Normalized() : Vec3{0, 0, 1};

                const Vec3 surfPt{node.Position.x, node.Position.y, gz};
                const float penetration = onGround ? Dot(surfPt - node.Position, normal) : -1.0f;
                if (penetration <= 0.0f) { node.InContact = false; continue; }   // release the bristle

                contactAccum += 1.0f;

                // Normal push-out.  C = −penetration (violated while the node is below the surface), and the
                // constraint is UNILATERAL, so the accumulated multiplier is clamped at zero: the ground may
                // push, never pull.  Without the clamp a contact that is separating applies a suction force.
                // Sign care: this numerator is +penetration, i.e. C = −penetration and ∇C = −n. The eq. 26
                //    damping term −γ ∇C·Δx therefore comes out as +γ (n·Δx), not −. Getting it backwards makes
                //    the damper PUMP the contact instead of bleeding it, which is what it did on the first try.
                const float cDotN = Dot(normal, node.Position - node.Previous);
                const float dLambdaN = (penetration - alphaContact * node.ContactLambda + gammaContact * cDotN)
                                     / ((1.0f + gammaContact) * node.InverseMass + alphaContact);
                const float newLambdaN = std::max(0.0f, node.ContactLambda + dLambdaN);
                const float appliedN = newLambdaN - node.ContactLambda;
                node.ContactLambda = newLambdaN;
                node.Position += normal * (appliedN * node.InverseMass);

                // f = λ/Δτ² is the XPBD constraint force. Use the ACCUMULATED λ, not this iteration's delta:
                // the delta is only the increment and under-reports the force whenever the solve has already
                // partly converged.
                const Vec3 normalForce = normal * (node.ContactLambda * invH2);   // ground → tyre
                const float normalMag = normalForce.Length();
                sumForce += normalForce;
                const Vec3 rvec = surfPt - Vec3{hubPos.x, hubPos.y, gz};
                sumTorqueRef += Cross(rvec, normalForce);
                sumPatch += surfPt; patchN += 1.0f;

                // ── Tread bristle: a compliant tangential spring rooted on the ground, carried by the belt while stuck.
                //    Its stiffness (1/α_tread) sets the slip stiffness; the μ·N cone caps it (sliding).
                const Vec3 footPt{node.Position.x, node.Position.y, gz};
                node.ContactNormal = normal;
                if (!node.InContact) { node.BristleAnchor = footPt; node.InContact = true; }
                else                 { node.BristleAnchor += beltDisp; node.BristleAnchor.z = gz; }

                Vec3 defl = footPt - node.BristleAnchor;             // tangential deflection
                defl -= normal * Dot(defl, normal);
                const float deflLen = defl.Length();
                if (deflLen > 1e-9f)
                {
                    const Vec3 tdir = defl * (1.0f / deflLen);
                    // Tangential constraint C = |deflection|, solved with the same eq. 18 as every other
                    // constraint. The resulting force is λ/Δτ², so the stick/slide test and the correction are
                    // now derived from ONE solve rather than two differently-scaled expressions.
                    const float cDotT = Dot(tdir, node.Position - node.Previous);
                    const float dLambdaT = (-deflLen - alphaTread * node.TreadLambda - gammaTread * cDotT)
                                         / ((1.0f + gammaTread) * node.InverseMass + alphaTread);
                    const float lambdaT = node.TreadLambda + dLambdaT;
                    const float fStick = std::fabs(lambdaT) * invH2;
                    const float fCone  = Parameters.FrictionCoefficient * normalMag;

                    if (fStick <= fCone)
                    {
                        // Stick: compliant correction pulls the node back toward the bristle root.
                        node.TreadLambda = lambdaT;
                        node.Position += tdir * (dLambdaT * node.InverseMass);
                        const Vec3 fricForce = tdir * (-fStick);   // ground → tyre, opposing the deflection
                        sumForce += fricForce;
                        sumTorqueRef += Cross(rvec, fricForce);
                    }
                    else
                    {
                        // Slide (Coulomb): the multiplier saturates at the cone, and the bristle root slips so
                        // the held deflection is exactly the one the capped force supports.
                        node.TreadLambda = -fCone * h2;
                        const float heldDefl = fCone * (node.InverseMass + alphaTread) * h2;
                        node.BristleAnchor = footPt - tdir * heldDefl;
                        const Vec3 fricForce = tdir * (-fCone);
                        sumForce += fricForce;
                        sumTorqueRef += Cross(rvec, fricForce);
                    }
                }
            }
        }

        // ── velocity update, then the velocity-level pass ────────────────────────────────────────────────────────
        // PBDBodies (Müller et al., "Detailed Rigid Body Simulation with XPBD") Algorithm 2: the position solve
        //    is followed by SolveVelocities, and for contact that step is not optional.
        //
        //    Deriving velocity as (x − xprev)/h attributes the CONTACT PUSH-OUT to motion. A node that arrives
        //    below the surface — at 36 m/s and 8 substeps it can travel ~19 mm between solves, most of a 25 mm
        //    segment — is pushed back out in one go, and the divide then reports that push-out as tens of m/s
        //    of outward velocity. The node is launched, its neighbours follow through the lattice, and the
        //    carcass goes lumpy. That is exactly what the log showed: at rest the tyre was round to 0.01 mm
        //    away from the patch, but under load the off-patch spread ran to 60–130 mm while NO circumferential
        //    harmonic exceeded ~2 mm. Not a standing wave — individual nodes being flung.
        //
        //    Restitution is zero here: a tyre carcass does not bounce off the road. So any OUTWARD normal
        //    velocity on a node that is in contact is an artefact of the projection and is removed. Inward
        //    motion is left alone, because that is the tyre genuinely being loaded.
        for (SoftTyreNode& node : NodeRecords)
        {
            if (node.InverseMass <= 0.0f) { node.Velocity = {0, 0, 0}; continue; }
            node.Velocity = (node.Position - node.Previous) * (1.0f / h);

            if (node.InContact)
            {
                const float Vn = Dot(node.Velocity, node.ContactNormal);
                if (Vn > 0.0f) node.Velocity -= node.ContactNormal * Vn;   // e = 0, no bounce
            }
        }
    }

    const float inv = 1.0f / static_cast<float>(substeps);
    ContactReaction.Force = sumForce * inv;
    ContactReaction.Mz = sumTorqueRef.z * inv;   // vertical component about the hub ground projection
    ContactReaction.ContactCount = static_cast<uint32_t>(contactAccum * inv + 0.5f);
    ContactReaction.PatchCentre = (patchN > 0.0f) ? sumPatch * (1.0f / patchN) : hubPos;
}

} // namespace Frontier::Vehicle
