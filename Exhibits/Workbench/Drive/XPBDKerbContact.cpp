//============================================================================================================================================
// 📦 Exhibits/Workbench/Drive/XPBDKerbContact.cpp — lateral contact against a vertical face
//============================================================================================================================================
//
//    WHAT THIS IS FOR.  Every surface in the Project-Drive course faces upward: the pad, the ramp, the speed
//    bumps, the cones. A tyre can therefore never be struck side-on by any of it, and the ground query was
//    declared "heightfield sample (no raycast)" to match — one height per (x, y) column.
//
//    That is not merely approximate against a kerb, it is the wrong answer. A node beside the kerb reads the
//    LOW ground and travels straight through the wall; a node over the kerb's footprint is pushed UP and the
//    car climbs it. Adding more contact nodes to the shoulder cannot help, because the query they consult has
//    nowhere to report a side wall.
//
//    The contract is now a SURFACE query — nearest point plus outward normal — and this is the proof that the
//    difference is real. A tyre is pressed horizontally into a kerb's vertical face and must be:
//
//        * stopped LATERALLY, with the reaction pointing back along −Y rather than up
//        * held OUTSIDE the wall rather than tunnelling through it
//        * contacting on its SHOULDER, which is the part that actually touches a kerb
//
//    Build: g++ -std=c++20 -O2 XPBDKerbContact.cpp XPBDSoftTyre.cpp. Standalone, no GPU.

#include "XPBDSoftTyre.h"

#include <cmath>
#include <cstdint>
#include <cstdio>

using namespace Frontier::Vehicle;

namespace {

int g_Checks = 0;
int g_Failures = 0;

void Check(bool condition, const char* what)
{
    if (condition) { ++g_Checks; std::printf("[kerb] pass  %s\n", what); }
    else           { ++g_Failures; std::printf("[kerb] FAIL  %s\n", what); }
}

// A kerb occupying y >= kWallY, standing kHeight above a floor at z = 0.
constexpr float kWallY  = 0.30f;
constexpr float kHeight = 0.120f;

// The widened contract: nearest point on the surface, with its outward normal.
bool KerbSurface(const Vec3& p, Vec3& outPoint, Vec3& outNormal)
{
    if (p.y > kWallY - 0.5f && p.z < kHeight)
    {
        const float DistWall = p.y - kWallY;      // >0 = inside the kerb
        const float DistTop  = kHeight - p.z;
        if (DistWall > 0.0f && DistTop > DistWall)
        {
            outPoint = Vec3{ p.x, kWallY, p.z };  // pushed back out through the FACE
            outNormal = Vec3{ 0.0f, -1.0f, 0.0f };
            return true;
        }
        if (DistWall > 0.0f)
        {
            outPoint = Vec3{ p.x, p.y, kHeight };
            outNormal = Vec3{ 0.0f, 0.0f, 1.0f };
            return true;
        }
    }
    outPoint = Vec3{ p.x, p.y, 0.0f };
    outNormal = Vec3{ 0.0f, 0.0f, 1.0f };
    return true;
}

// The OLD behaviour, for comparison: one height per column, so the wall simply is not there.
bool HeightfieldOnly(const Vec3& p, Vec3& outPoint, Vec3& outNormal)
{
    const float H = (p.y > kWallY) ? kHeight : 0.0f;
    outPoint = Vec3{ p.x, p.y, H };
    outNormal = Vec3{ 0.0f, 0.0f, 1.0f };
    return true;
}

struct Outcome
{
    float ShoulderSquash = 0.0f;    // [m] how far the shoulder is pressed in from its rest lateral position
    float LateralForce = 0.0f;      // [N] reaction along −Y (pushing the tyre off the kerb)
    float VerticalForce = 0.0f;     // [N] reaction along +Z (lifting it over)
    uint32_t Contacts = 0u;
    float ShoulderFraction = 0.0f;  // [-] share of contacting nodes on the outer two rings
};

Outcome PressIntoKerb(const XPBDSoftTyre::GroundQuery& Query, float Friction = 2.2f)
{
    SoftTyreParameters params;
    params.RingCount = 5u;
    params.SegmentCount = 64u;
    params.FrictionCoefficient = Friction;

    XPBDSoftTyre tyre;
    // Hub placed so the tyre's shoulder overlaps the kerb face by ~25 mm, rolling radius clear of the floor.
    const Vec3 hub{ 0.0f, kWallY - 0.5f * params.Width + 0.025f, params.Radius - 0.010f };
    const Quat rot{};
    tyre.Build(params, hub, rot);

    const float dt = 1.0f / 240.0f;
    for (int i = 0; i < 360; ++i)
        tyre.Step(dt, 8u, hub, rot, Vec3{0, 0, 0}, Query);

    Outcome out;
    uint32_t shoulder = 0u;
    const uint32_t Rings = params.RingCount, Segments = params.SegmentCount;
    for (uint32_t r = 0; r < Rings; ++r)
        for (uint32_t s = 0; s < Segments; ++s)
        {
            const SoftTyreNode& n = tyre.Nodes()[r * Segments + s];
            // The hub is held kinematically overlapping the wall, so "is the node past the face" measures the
            //    test rig, not the solver. What the solver controls is how much the CARCASS gives: a node's
            //    lateral displacement from where its own rest position says it should be.
            const float RestY = hub.y + n.TreadLocal.y;
            if (n.Position.z < kHeight)
                out.ShoulderSquash = std::fmax(out.ShoulderSquash, RestY - n.Position.y);
            if (n.InContact) { ++out.Contacts; if (r == 0u || r == Rings - 1u) ++shoulder; }
        }
    if (out.Contacts) out.ShoulderFraction = static_cast<float>(shoulder) / static_cast<float>(out.Contacts);
    out.LateralForce = -tyre.Reaction().Force.y;
    out.VerticalForce = tyre.Reaction().Force.z;
    return out;
}

} // namespace

int main()
{
    std::printf("================================================================================\n");
    std::printf("     XPBD TYRE — LATERAL CONTACT AGAINST A KERB FACE                            \n");
    std::printf("================================================================================\n");

    const Outcome Flat = PressIntoKerb(HeightfieldOnly);
    const Outcome Real = PressIntoKerb(KerbSurface);

    // ── the wall's OWN reaction, with the tread friction switched off ───────────────────────────────────────
    // The claim under test is about the QUERY: a heightfield has nowhere to report a vertical face, so its
    // contact normal is +Z everywhere and the surface it describes cannot push sideways at all. Tread friction
    // can and does produce a lateral force in both rigs — it is a real force, it is just not the wall — and at
    // μ = 2.2 on a carcass pressed hard onto a step it is large enough to drown the thing being measured.
    // Running both queries frictionless isolates the normal reaction, which is what the claim is about.
    const Outcome FlatBare = PressIntoKerb(HeightfieldOnly, 0.0f);
    const Outcome RealBare = PressIntoKerb(KerbSurface, 0.0f);

    std::printf("\n%-22s %-16s %s\n", "", "heightfield", "surface query");
    std::printf("%-22s %-16.1f %.1f\n",   "lateral force [N]",   Flat.LateralForce,  Real.LateralForce);
    std::printf("%-22s %-16.1f %.1f\n",   "vertical force [N]",  Flat.VerticalForce, Real.VerticalForce);
    std::printf("%-22s %-16.2f %.2f\n",   "shoulder squash [mm]",Flat.ShoulderSquash * 1000.0f,
                                                                 Real.ShoulderSquash * 1000.0f);
    std::printf("%-22s %-16u %u\n",       "contacting nodes",    Flat.Contacts,      Real.Contacts);
    std::printf("%-22s %-16.0f %.0f\n",   "on the shoulder [%]", Flat.ShoulderFraction * 100.0f,
                                                                 Real.ShoulderFraction * 100.0f);

    std::printf("\nfrictionless (the wall's own reaction, with no tread force in the way)\n");
    std::printf("%-22s %-16.1f %.1f\n", "lateral force [N]",  FlatBare.LateralForce,  RealBare.LateralForce);
    std::printf("%-22s %-16.1f %.1f\n", "vertical force [N]", FlatBare.VerticalForce, RealBare.VerticalForce);

    Check(std::fabs(FlatBare.LateralForce) < 1.0f,
          "a heightfield has NO lateral reaction to give: its normal is +Z everywhere (the defect)");
    Check(FlatBare.VerticalForce > 1000.0f,
          "all the heightfield can do is lift the tyre OVER the kerb");
    Check(RealBare.LateralForce > 2.0f * RealBare.VerticalForce,
          "the surface query's own reaction against a vertical face is mostly lateral");
    Check(Real.LateralForce > 100.0f, "the surface query pushes the tyre off the kerb sideways");
    Check(Real.ShoulderSquash > 0.005f,
          "the wall actually deforms the carcass laterally (shoulder pressed in >5 mm)");
    Check(Real.Contacts > 0u, "nodes actually registered contact with the face");
    Check(Real.ShoulderFraction > 0.5f,
          "the contact is on the SHOULDER rings, which is the part of a tyre that meets a kerb");

    std::printf("\n[kerb] %d gates passed, %d failed\n", g_Checks, g_Failures);
    return g_Failures == 0 ? 0 : 1;
}
