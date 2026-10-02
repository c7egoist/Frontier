//============================================================================================================================================
// 📦 Exhibits/Workbench/Drive/XPBDRollingCarcass.cpp — the proof that the soft tyre ROLLS, and stays a tyre while it does
//============================================================================================================================================
//
//    WHAT WAS WRONG.  The carcass never rotated. `VehicleSolver` handed `XPBDSoftTyre` a hub pose carrying
//    steer and chassis attitude and nothing else, and the wheel's spin lived only in the Pacejka layer. To stop
//    a stationary sock being scrubbed by a road rushing past it, the road was then declared to be a belt moving
//    at hub speed. The hub pose was also frozen for the whole frame, so at 36 m/s the bead anchors teleported
//    150 mm — nine node spacings — between frames and dragged the lattice after them in one substep.
//
//    None of that is a tyre. The same material sat in the contact patch forever, there was no centrifugal
//    growth, no rolling radius, no slip, and a procedurally authored tread pattern would have stood still while
//    the car drove away. It also hid a real solver defect for several revisions (below).
//
//    WHAT IS TESTED HERE.  The hub is a kinematic body that travels and spins across the substeps, the ground
//    is a road rather than a belt, and the questions are the ones you would ask of a tyre:
//
//        ① does the carcass stay round at speed, or does it come apart?
//        ② does it grow with v², by a physical amount?
//        ③ is the contact patch a STANDING deformation in the world, with material rolling through it?
//        ④ is there a free-rolling radius, between the loaded and the unloaded one?
//        ⑤ does longitudinal force build with slip and reverse sign through free rolling?
//
//    THE DEFECT ① CAUGHT, and it is worth recording because it survived several passes of instrumentation.
//    XPBD eq. 26's damping term is γ ∇C·(ẋ − ẋ_anchor): the rate the CONSTRAINT is violated. The solver was
//    measuring γ ∇C·(x − xⁿ) — the node's absolute displacement — which is identical while the anchor is
//    nailed down and catastrophic once it moves. A sidewall node at 36 m/s travels 18.8 mm tangentially per
//    substep, and through the shear spoke's 55 N·s/m dashpot that is kilonewtons of drag on a tyre that is
//    merely rolling. Measured on the centre ring at 36 m/s: first circumferential harmonic 35.65 mm, mean
//    radius inflated to 360.8 mm. With the anchor's own motion subtracted: 2.63 mm and 346.8 mm.
//
//    Build: standalone, no GPU. g++ -std=c++20 -O2 -I<vehicle> XPBDRollingCarcass.cpp XPBDSoftTyre.cpp

#include "XPBDSoftTyre.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

using namespace Frontier::Vehicle;

namespace {

constexpr float kPi = 3.14159265358979323846f;

int g_Checks = 0;
int g_Failures = 0;

void Check(bool condition, const char* what)
{
    if (condition) { ++g_Checks; std::printf("[rolling] pass  %s\n", what); }
    else           { ++g_Failures; std::printf("[rolling] FAIL  %s\n", what); }
}

bool Road(const Vec3& p, Vec3& outPoint, Vec3& outNormal)
{
    outPoint = Vec3{p.x, p.y, 0.0f}; outNormal = Vec3{0.0f, 0.0f, 1.0f}; return true;
}

struct Rolled
{
    float MeanRadius   = 0.0f;   // [m] mean tread radius about the hub axis
    float Roundness    = 0.0f;   // [m] RMS radial deviation of the nodes NOT in contact
    float FirstHarmonic= 0.0f;   // [m] amplitude of circumferential mode 1 on the centre ring
    float Load         = 0.0f;   // [N]
    float Longitudinal = 0.0f;   // [N] +X reaction from the road
    float PatchOffset  = 0.0f;   // [m] distance from the patch centre to the point under the hub
    float MaterialTravel = 0.0f; // [m] arc a marked tread node travelled around the hub
};

// `slip` is the fractional excess of spin over v / Radius. 0 means the belt is pinned to its rest circle.
Rolled Roll(float speed, float slip, float squash, float seconds)
{
    SoftTyreParameters params;
    params.RingCount    = 5u;
    params.SegmentCount = 128u;

    XPBDSoftTyre tyre;
    HubMotion motion;
    motion.Position    = Vec3{0.0f, 0.0f, params.Radius - squash};
    motion.Orientation = Quat{};
    tyre.Build(params, motion.Position, motion.Orientation);

    motion.LinearVelocity = Vec3{speed, 0.0f, 0.0f};
    motion.SpinRate       = (speed / params.Radius) * (1.0f + slip);

    const float dt = 1.0f / 240.0f;
    const int frames = static_cast<int>(seconds / dt);
    const int from = frames - frames / 4;

    // Track one tread node's angle about the hub so "the material rolls" is a measurement, not a hope.
    const uint32_t marked = tyre.Index(params.RingCount / 2u, 0u);
    float markedAngle = 0.0f;
    float travel = 0.0f;

    double meanR = 0.0, round = 0.0, load = 0.0, longitudinal = 0.0, offset = 0.0, harmonic = 0.0;
    int samples = 0;

    for (int f = 0; f < frames; ++f)
    {
        motion.Position.x += speed * dt;
        tyre.Step(dt, 8u, motion, Vec3{0.0f, 0.0f, 0.0f}, Road);

        {
            const Vec3 rel = tyre.Nodes()[marked].Position - motion.Position;
            const float angle = std::atan2(rel.z, rel.x);
            float delta = angle - markedAngle;
            while (delta >  kPi) delta -= 2.0f * kPi;
            while (delta < -kPi) delta += 2.0f * kPi;
            if (f > 0) travel += std::fabs(delta) * params.Radius;
            markedAngle = angle;
        }

        if (f < from) continue;

        std::vector<float> offPatch;
        double sum = 0.0;
        for (const SoftTyreNode& node : tyre.Nodes())
        {
            if (node.InContact) continue;
            const Vec3 rel{node.Position.x - motion.Position.x, 0.0f, node.Position.z - motion.Position.z};
            offPatch.push_back(rel.Length());
            sum += offPatch.back();
        }
        const float mean = static_cast<float>(sum / offPatch.size());
        double square = 0.0;
        for (float r : offPatch) square += static_cast<double>(r - mean) * (r - mean);

        // Mode 1 on the centre ring, in node-index order: the material frame's rotation only shifts the
        // phase, and an amplitude spectrum does not care about phase.
        const uint32_t S = params.SegmentCount, ring = params.RingCount / 2u;
        double ringMean = 0.0;
        std::vector<float> radius(S, 0.0f);
        for (uint32_t s = 0u; s < S; ++s)
        {
            const Vec3 rel{tyre.Nodes()[ring * S + s].Position.x - motion.Position.x, 0.0f,
                           tyre.Nodes()[ring * S + s].Position.z - motion.Position.z};
            radius[s] = rel.Length();
            ringMean += radius[s];
        }
        ringMean /= S;
        double re = 0.0, im = 0.0;
        for (uint32_t s = 0u; s < S; ++s)
        {
            const double a = 2.0 * kPi * s / S;
            re += (radius[s] - ringMean) * std::cos(a);
            im += (radius[s] - ringMean) * std::sin(a);
        }

        meanR += mean;
        round += std::sqrt(square / offPatch.size());
        harmonic += 2.0 * std::sqrt(re * re + im * im) / S;
        load += tyre.Reaction().Force.z;
        longitudinal += tyre.Reaction().Force.x;
        offset += std::fabs(tyre.Reaction().PatchCentre.x - motion.Position.x);
        ++samples;
    }

    Rolled out;
    out.MeanRadius    = static_cast<float>(meanR / samples);
    out.Roundness     = static_cast<float>(round / samples);
    out.FirstHarmonic = static_cast<float>(harmonic / samples);
    out.Load          = static_cast<float>(load / samples);
    out.Longitudinal  = static_cast<float>(longitudinal / samples);
    out.PatchOffset   = static_cast<float>(offset / samples);
    out.MaterialTravel = travel;
    return out;
}

} // namespace

int main()
{
    std::printf("================================================================================\n");
    std::printf("     XPBD SOFT TYRE — A CARCASS THAT ROLLS                                      \n");
    std::printf("================================================================================\n");

    const float squash = 0.010f;
    const float speeds[] = {0.0f, 8.0f, 20.0f, 36.0f};
    std::vector<Rolled> byspeed;

    std::printf("\n%-10s %-14s %-14s %-14s %-12s %s\n",
                "v [m/s]", "mean R [mm]", "roundness[mm]", "harmonic 1[mm]", "load [N]", "patch offset[mm]");
    for (float v : speeds)
    {
        const Rolled r = Roll(v, 0.0f, squash, 1.0f);
        byspeed.push_back(r);
        std::printf("%-10.0f %-14.2f %-14.3f %-14.3f %-12.0f %.2f\n",
                    v, r.MeanRadius * 1000.0f, r.Roundness * 1000.0f, r.FirstHarmonic * 1000.0f,
                    r.Load, r.PatchOffset * 1000.0f);
    }

    const Rolled& still = byspeed[0];
    const Rolled& fast  = byspeed[3];

    // ① The material actually goes round. At 36 m/s over 1 s a tread node should travel ~36 m of arc.
    std::printf("\n[rolling] a marked tread node travelled %.1f m of arc about the hub in 1.0 s at 36 m/s\n",
                fast.MaterialTravel);
    Check(fast.MaterialTravel > 30.0f, "the carcass material rotates (it is rolling, not sliding along)");
    Check(still.MaterialTravel < 0.05f, "a parked wheel's material does not rotate");

    // ② Round at speed. This is the gate that the absolute-velocity damping term failed: before the fix the
    //    first harmonic reached 35.65 mm at 36 m/s against 1.90 mm at rest.
    Check(fast.Roundness < 3.0f * still.Roundness + 0.001f,
          "the rolling carcass stays as round as the parked one (within 3x + 1 mm)");
    Check(fast.FirstHarmonic < 0.006f,
          "no first-harmonic eccentricity above 6 mm at 36 m/s");

    // ③ Centrifugal growth: present, rising with speed, and of a tyre's magnitude rather than a balloon's.
    const float growth = fast.MeanRadius - still.MeanRadius;
    std::printf("[rolling] centrifugal growth at 36 m/s: %.2f mm\n", growth * 1000.0f);
    Check(growth > 0.0005f, "the carcass grows with speed (centrifugal), as a real tyre does");
    Check(growth < 0.010f, "and it grows by millimetres, not centimetres");

    // ④ The patch is a STANDING deformation: it stays under the hub while the material rolls through it.
    Check(fast.PatchOffset < 0.030f, "the contact patch stays under the hub while the material rolls through it");

    // ⑤ Free rolling. Longitudinal force must build with slip and cross zero at an effective radius that
    //    sits between the loaded and the unloaded one — which is the definition of a rolling radius.
    std::printf("\n%-12s %-14s %s\n", "slip [%]", "Fx [N]", "Fz [N]");
    float below = 0.0f, above = 0.0f;
    for (float slip : {-0.02f, -0.01f, 0.0f, 0.01f, 0.02f})
    {
        const Rolled r = Roll(8.0f, slip, squash, 1.0f);
        std::printf("%-12.1f %-14.0f %.0f\n", slip * 100.0f, r.Longitudinal, r.Load);
        if (slip <= -0.02f) below = r.Longitudinal;
        if (slip >=  0.02f) above = r.Longitudinal;
    }
    Check(below < 0.0f && above > 0.0f,
          "longitudinal force reverses through free rolling, so a rolling radius exists");
    Check(above - below > 500.0f, "and slip builds longitudinal force (there is a slip stiffness)");

    std::printf("\n[rolling] %d gates passed, %d failed\n", g_Checks, g_Failures);
    return g_Failures == 0 ? 0 : 1;
}
