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
    params_ = params;
    params_.RingCount    = std::max<uint32_t>(2u, params_.RingCount);
    params_.SegmentCount = std::max<uint32_t>(8u, params_.SegmentCount);

    const uint32_t R = params_.RingCount, S = params_.SegmentCount;
    const uint32_t N = R * S;
    nodes_.assign(N, SoftTyreNode{});

    const float perNodeMass = (params_.TotalMass > 0.0f) ? params_.TotalMass / static_cast<float>(N) : 0.0f;
    const float invMass     = (perNodeMass > 0.0f) ? 1.0f / perNodeMass : 0.0f;

    // Circumferential arc length × lateral strip width → per-node surface area (for the pressure body force).
    const float circ = 2.0f * kPi * params_.Radius;
    const float area = (circ / static_cast<float>(S)) * (params_.Width / static_cast<float>(R));

    // Spin axis = +Y (hub-local); ring plane = X/Z. Rings distributed across the width in Y.
    for (uint32_t r = 0u; r < R; ++r)
    {
        const float yOff = (R > 1u)
            ? (-0.5f * params_.Width + params_.Width * (static_cast<float>(r) / static_cast<float>(R - 1u)))
            : 0.0f;
        for (uint32_t s = 0u; s < S; ++s)
        {
            const float ang = (2.0f * kPi * static_cast<float>(s)) / static_cast<float>(S);
            const float c = std::cos(ang), sn = std::sin(ang);
            SoftTyreNode& node = nodes_[Index(r, s)];
            node.TreadLocal = {params_.Radius * c, yOff, params_.Radius * sn};
            node.BeadLocal  = {params_.RimRadius * c, yOff, params_.RimRadius * sn};
            node.Position   = hubPos + hubRot.Rotate(node.TreadLocal);
            node.Previous   = node.Position;
            node.Velocity   = {0, 0, 0};
            node.InverseMass = invMass;
            node.Area = area;
        }
    }

    BuildEdges();
    reaction_ = TyreReaction{};
}

void XPBDSoftTyre::BuildEdges() noexcept
{
    edges_.clear();
    const uint32_t R = params_.RingCount, S = params_.SegmentCount;

    auto restLen = [&](uint32_t a, uint32_t b) { return (nodes_[a].TreadLocal - nodes_[b].TreadLocal).Length(); };

    for (uint32_t r = 0u; r < R; ++r)
        for (uint32_t s = 0u; s < S; ++s)
        {
            const uint32_t i = Index(r, s);
            const uint32_t sn = (s + 1u) % S;

            // Hoop (circumferential, same ring) — always present.
            {
                const uint32_t j = Index(r, sn);
                edges_.push_back({i, j, restLen(i, j), params_.HoopCompliance});
            }
            if (r + 1u < R)
            {
                // Lateral (same segment, next ring).
                const uint32_t j = Index(r + 1u, s);
                edges_.push_back({i, j, restLen(i, j), params_.LateralCompliance});
                // Shear diagonal (next segment, next ring).
                const uint32_t k = Index(r + 1u, sn);
                edges_.push_back({i, k, restLen(i, k), params_.ShearCompliance});
                // Anti-diagonal (this ring's next seg ↔ next ring's this seg) for symmetric shear.
                const uint32_t a = Index(r, sn), b = Index(r + 1u, s);
                edges_.push_back({a, b, restLen(a, b), params_.ShearCompliance});
            }
        }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      STEP
//------------------------------------------------------------------------------------------------------------------------
void XPBDSoftTyre::Step(float dt, uint32_t substeps, const Vec3& hubPos, const Quat& hubRot,
                        const Vec3& surfaceVelocity, const GroundQuery& ground) noexcept
{
    reaction_ = TyreReaction{};
    if (nodes_.empty() || !(dt > 0.0f)) return;

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

    const float alphaContact = params_.ContactCompliance * invH2;

    for (uint32_t sub = 0u; sub < substeps; ++sub)
    {
        // ── predict: gravity + inflation-pressure body force ──────────────────────────────────────────────────────
        for (SoftTyreNode& node : nodes_)
        {
            if (node.InverseMass <= 0.0f) { node.Previous = node.Position; continue; }

            // Outward radial direction from the spin axis through the node.
            const Vec3 rel = node.Position - hubPos;
            const Vec3 along = axisWorld * Dot(rel, axisWorld);
            Vec3 radial = (rel - along);
            const float rl = radial.Length();
            radial = (rl > 1e-6f) ? radial * (1.0f / rl) : Vec3{0, 0, 1};

            const Vec3 pressureForce = radial * (params_.InflationPressure * node.Area);
            const Vec3 accel = params_.Gravity + pressureForce * node.InverseMass;

            node.Velocity += accel * h;
            node.Previous = node.Position;
            node.Position += node.Velocity * h;
        }

        // ── project: spokes (node ↔ rim/bead anchor) ─────────────────────────────────────────────────────────────
        const float alphaSpoke = params_.SpokeCompliance * invH2;
        const float spokeRest = params_.Radius - params_.RimRadius;
        for (SoftTyreNode& node : nodes_)
        {
            if (node.InverseMass <= 0.0f) continue;
            const Vec3 anchor = hubPos + hubRot.Rotate(node.BeadLocal);
            Vec3 d = node.Position - anchor;
            const float dist = d.Length();
            if (dist < 1e-6f) continue;
            const Vec3 dir = d * (1.0f / dist);
            const float C = dist - spokeRest;
            const float dLambda = -C / (node.InverseMass + alphaSpoke);
            node.Position += dir * (dLambda * node.InverseMass);
        }

        // ── project: internal lattice edges (hoop / lateral / shear) ─────────────────────────────────────────────
        for (const Edge& e : edges_)
        {
            SoftTyreNode& A = nodes_[e.a];
            SoftTyreNode& B = nodes_[e.b];
            const float wsum = A.InverseMass + B.InverseMass;
            if (wsum <= 0.0f) continue;
            Vec3 d = B.Position - A.Position;
            const float dist = d.Length();
            if (dist < 1e-6f) continue;
            const Vec3 dir = d * (1.0f / dist);
            const float C = dist - e.rest;
            const float dLambda = -C / (wsum + e.compliance * invH2);
            A.Position -= dir * (dLambda * A.InverseMass);
            B.Position += dir * (dLambda * B.InverseMass);
        }

        // ── project: ground contact (normal) + compliant tread-bristle friction (brush model) ─────────────────────
        if (ground)
        {
            const Vec3 beltDisp = surfaceVelocity * h;   // how far the surface moves this substep
            const float alphaTread = params_.TreadTangentialCompliance;   // NOTE: already α (not /h²); used as force stiffness
            for (SoftTyreNode& node : nodes_)
            {
                if (node.InverseMass <= 0.0f) continue;
                float gz = 0.0f; Vec3 normal{0, 0, 1};
                bool onGround = ground(node.Position, gz, normal);
                normal = onGround ? normal.Normalized() : Vec3{0, 0, 1};

                const Vec3 surfPt{node.Position.x, node.Position.y, gz};
                const float penetration = onGround ? Dot(surfPt - node.Position, normal) : -1.0f;
                if (penetration <= 0.0f) { node.InContact = false; continue; }   // release the bristle

                contactAccum += 1.0f;

                // Normal push-out.
                const float dLambdaN = penetration / (node.InverseMass + alphaContact);
                const Vec3 normalCorr = normal * (dLambdaN * node.InverseMass);
                node.Position += normalCorr;

                const Vec3 normalForce = normal * (dLambdaN * invH2);   // ground → tyre
                const float normalMag = normalForce.Length();
                sumForce += normalForce;
                const Vec3 rvec = surfPt - Vec3{hubPos.x, hubPos.y, gz};
                sumTorqueRef += Cross(rvec, normalForce);
                sumPatch += surfPt; patchN += 1.0f;

                // ── Tread bristle: a compliant tangential spring rooted on the ground, carried by the belt while stuck.
                //    Its stiffness (1/α_tread) sets the slip stiffness; the μ·N cone caps it (sliding).
                const Vec3 footPt{node.Position.x, node.Position.y, gz};
                if (!node.InContact) { node.BristleAnchor = footPt; node.InContact = true; }
                else                 { node.BristleAnchor += beltDisp; node.BristleAnchor.z = gz; }

                Vec3 defl = footPt - node.BristleAnchor;             // tangential deflection
                defl -= normal * Dot(defl, normal);
                const float deflLen = defl.Length();
                if (deflLen > 1e-9f)
                {
                    const Vec3 tdir = defl * (1.0f / deflLen);
                    // Effective tangential force if we hold the bristle: f = C / (w·h² + α_tread).
                    const float denom = node.InverseMass * h2 + alphaTread;
                    const float fStick = deflLen / denom;
                    const float fCone  = params_.FrictionCoefficient * normalMag;

                    if (fStick <= fCone)
                    {
                        // Stick: compliant correction pulls the node back toward the bristle root.
                        const float dLambdaT = -deflLen / (node.InverseMass + alphaTread * invH2);
                        node.Position += tdir * (dLambdaT * node.InverseMass);
                        const Vec3 fricForce = tdir * (-fStick);   // ground → tyre, opposing the deflection
                        sumForce += fricForce;
                        sumTorqueRef += Cross(rvec, fricForce);
                    }
                    else
                    {
                        // Slide: cap force at the cone, let the bristle root slip so the held deflection = fCone·denom.
                        const float Ccap = fCone * denom;
                        node.BristleAnchor = footPt - tdir * Ccap;
                        const Vec3 fricForce = tdir * (-fCone);
                        sumForce += fricForce;
                        sumTorqueRef += Cross(rvec, fricForce);
                    }
                }
            }
        }

        // ── velocity update ──────────────────────────────────────────────────────────────────────────────────────
        for (SoftTyreNode& node : nodes_)
        {
            if (node.InverseMass <= 0.0f) { node.Velocity = {0, 0, 0}; continue; }
            node.Velocity = (node.Position - node.Previous) * (1.0f / h);
        }
    }

    const float inv = 1.0f / static_cast<float>(substeps);
    reaction_.Force = sumForce * inv;
    reaction_.Mz = sumTorqueRef.z * inv;   // vertical component about the hub ground projection
    reaction_.ContactCount = static_cast<uint32_t>(contactAccum * inv + 0.5f);
    reaction_.PatchCentre = (patchN > 0.0f) ? sumPatch * (1.0f / patchN) : hubPos;
}

} // namespace Frontier::Vehicle
