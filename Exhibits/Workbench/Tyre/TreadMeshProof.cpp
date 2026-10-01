//============================================================================================================================================
//                                                             TREADMESHPROOF.CPP
//============================================================================================================================================
// 📦 Phase 1 gate: sweeps the moulded profile through TyreMeshStructure and audits the result for cracks.

#include "../../../Frontier/Engine/ContentInterchange/Tyre/TreadSpecification.h"
#include "../../../Frontier/Engine/ContentInterchange/Tyre/TyreProfileSpecification.h"
#include "../../../Frontier/Engine/ContentInterchange/Tyre/TyreMeshStructure.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace Frontier;

//------------------------------------------------------------------------------------------------------------------------
//                                                         SWEEP
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Sweeps the moulded cross-section into a closed band of quads.
/// in    Mesh         [-]   structure to fill; cleared first
/// in    Specification[-]   carcass parameters
/// in    RadialSteps  [-]   divisions around the circumference
/// in    AcrossSteps  [-]   divisions across the moulded surface
/// in    SeamOffset   [mm]  deliberate error injected into the wrap column; 0 for the real build
/// note  💡 The wrap is closed by welding, not by taking the ring index modulo the step count. That is the
///       point of the proof: θ = 2π and θ = 0 give cosines that differ in the last bits, and the mesh is
///       only watertight if the weld recognises them as one point. Index arithmetic would hide that.
/// tag   proof
static void SweepProfile(TyreMeshStructure&        Mesh,
                         const TreadSpecification& Specification,
                         uint32_t                  RadialSteps,
                         uint32_t                  AcrossSteps,
                         float                     SeamOffset)
{
    constexpr float π = 3.14159265358979323846f;

    Mesh.Clear();
    const TreadDerivedValues Derived = DeriveTreadValues(Specification);
    const float Span = 2.0f * Derived.AcrossHalf;

    std::vector<uint32_t> Grid(static_cast<size_t>(RadialSteps + 1u) * (AcrossSteps + 1u));
    std::vector<TyreCornerRecord> Attribute(Grid.size());

    for (uint32_t Ring = 0; Ring <= RadialSteps; ++Ring)
    {
        const float θ       = 2.0f * π * static_cast<float>(Ring) / static_cast<float>(RadialSteps);
        const float Wrapped = Ring == RadialSteps ? SeamOffset : 0.0f;

        for (uint32_t Across = 0; Across <= AcrossSteps; ++Across)
        {
            const float Lateral = -Derived.AcrossHalf
                                + Span * static_cast<float>(Across) / static_cast<float>(AcrossSteps);
            const TyreProfileSample Sample = EvaluateTyreProfile(Lateral, Specification, Derived);

            const float Radius = Sample.Radius + Wrapped;
            const size_t Slot  = static_cast<size_t>(Ring) * (AcrossSteps + 1u) + Across;

            Grid[Slot] = Mesh.WeldPosition(Sample.Lateral,
                                           Radius * std::cos(θ),
                                           Radius * std::sin(θ));

            TyreCornerRecord Corner;
            Corner.NormalX = Sample.NormalLateral;
            Corner.NormalY = Sample.NormalRadial * std::cos(θ);
            Corner.NormalZ = Sample.NormalRadial * std::sin(θ);
            Corner.U       = static_cast<float>(Ring) / static_cast<float>(RadialSteps);
            Corner.V       = static_cast<float>(Across) / static_cast<float>(AcrossSteps);
            Attribute[Slot] = Corner;
        }
    }

    for (uint32_t Ring = 0; Ring < RadialSteps; ++Ring)
    {
        for (uint32_t Across = 0; Across < AcrossSteps; ++Across)
        {
            const size_t S00 = static_cast<size_t>(Ring) * (AcrossSteps + 1u) + Across;
            const size_t S10 = S00 + (AcrossSteps + 1u);
            const size_t S01 = S00 + 1u;
            const size_t S11 = S10 + 1u;

            Mesh.AddTriangle(Grid[S00], Grid[S10], Grid[S11], Attribute[S00], Attribute[S10], Attribute[S11]);
            Mesh.AddTriangle(Grid[S00], Grid[S11], Grid[S01], Attribute[S00], Attribute[S11], Attribute[S01]);
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                          GATE
//------------------------------------------------------------------------------------------------------------------------

static int Failures = 0;

static void Expect(const std::string& Label, uint32_t Measured, uint32_t Wanted)
{
    const bool Pass = Measured == Wanted;
    if (!Pass)
        ++Failures;
    std::printf("  %-34s %10u  wanted %-10u %s\n", Label.c_str(), Measured, Wanted,
                Pass ? "\xF0\x9F\x9F\xA2" : "\xF0\x9F\x94\xB4");
}

int main()
{
    TreadSpecification Specification;
    Specification.Width         = 285.0f;
    Specification.Aspect        = 70.0f;
    Specification.Rim           = 17.0f;
    Specification.TreadDepth    = 15.0f;
    Specification.TreadFraction = 0.92f;
    Specification.Crown         = 3.0f;
    Specification.Shoulder      = 14.0f;

    const TreadDerivedValues Derived = DeriveTreadValues(Specification);
    std::printf("Grizzly Magnum 285/70 R17 — outer radius %.2f mm, across half %.2f mm, circumference %.1f mm\n\n",
                static_cast<double>(Derived.OuterRadius),
                static_cast<double>(Derived.AcrossHalf),
                static_cast<double>(Derived.Circumference));

    constexpr uint32_t RadialSteps = 360u;
    constexpr uint32_t AcrossSteps = 64u;

    TyreMeshStructure Mesh;

    // 📝 ① Positive control. The wrap column is a recomputation of the first, closed only by welding.
    std::printf("① Swept profile, wrap closed by welding\n");
    SweepProfile(Mesh, Specification, RadialSteps, AcrossSteps, 0.0f);
    TyreMeshMetrics Clean = Mesh.QueryMetrics();

    Expect("positions",         Clean.PositionCount,   RadialSteps * (AcrossSteps + 1u));
    Expect("triangles",         Clean.TriangleCount,   RadialSteps * AcrossSteps * 2u);
    Expect("non-manifold edges", Clean.NonManifoldEdge, 0u);
    Expect("degenerate",        Clean.DegenerateCount, 0u);
    Expect("duplicate faces",   Clean.DuplicateCount,  0u);
    Expect("boundary (two rim openings)", Clean.BoundaryEdge, RadialSteps * 2u);

    // 📝 ② Negative control. Pushing the wrap column ten tolerances out must open the seam. Without this
    //    a ledger that always answered "clean" would pass ① and prove nothing.
    std::printf("\n② Same sweep, wrap column displaced 10× tolerance — the seam must open\n");
    SweepProfile(Mesh, Specification, RadialSteps, AcrossSteps, TyreMeshStructure::WeldTolerance * 10.0f);
    TyreMeshMetrics Torn = Mesh.QueryMetrics();

    const uint32_t Opened = Torn.BoundaryEdge > Clean.BoundaryEdge ? Torn.BoundaryEdge - Clean.BoundaryEdge : 0u;
    std::printf("  %-34s %10u\n", "boundary edges", Torn.BoundaryEdge);
    Expect("seam edges opened", Opened, AcrossSteps * 2u);

    std::printf("\n%s\n", Failures == 0 ? "GATE PASSED" : "GATE FAILED");
    return Failures == 0 ? 0 : 1;
}
