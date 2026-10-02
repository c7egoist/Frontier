//============================================================================================================================================
//                                                             TREADMESHPROOF.CPP
//============================================================================================================================================
// 📦 Phase 1 gate: sweeps the moulded profile through TyreMeshStructure and audits the result for cracks.

#include "../../../Frontier/Engine/Generators/Tyre/TreadSpecification.h"
#include "../../../Frontier/Engine/Generators/Tyre/TyreProfileSpecification.h"
#include "../../../Frontier/Engine/Generators/Tyre/TyreMeshStructure.h"
#include "../../../Frontier/Engine/Generators/Tyre/TreadRegionSolver.h"
#include "../../../Frontier/Engine/Generators/Tyre/TreadMeshSolver.h"

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
//                                                    OFF-ROAD PRESET
//------------------------------------------------------------------------------------------------------------------------

/// 📦 The "Grizzly Magnum" off-road pattern from the browser prototype, layer for layer.
/// note  Carried over verbatim so the C++ gate and the .mjs audit measure the same tread. It is the busiest
///       preset the generator ships — three zig-zag circumferential grooves, three lateral sets and 56
///       sipes — and it is the one the prototype tore open worst.
/// tag   proof
static TreadPatternSpecification GrizzlyMagnum()
{
    TreadPatternSpecification Pattern;
    Pattern.Name = "Grizzly Magnum";

    auto Circumferential = [](float Seat, float Width, float Zig, float ZigCount)
    {
        TreadLayerSpecification Layer;
        Layer.Kind = TreadLayerKind::Circumferential;
        Layer.Position = Seat;  Layer.Width = Width;  Layer.Zig = Zig;  Layer.ZigCount = ZigCount;
        Layer.DepthFraction = 1.0f;
        return Layer;
    };
    auto Lateral = [](float Count, float Angle, float Width, float From, float To, float Phase)
    {
        TreadLayerSpecification Layer;
        Layer.Kind = TreadLayerKind::Lateral;
        Layer.Count = Count;  Layer.Angle = Angle;  Layer.Width = Width;
        Layer.From  = From;   Layer.To    = To;     Layer.Phase = Phase;
        Layer.DepthFraction = 1.0f;
        return Layer;
    };

    Pattern.Layers.push_back(Circumferential( 0.00f, 12.0f, 6.0f, 28.0f));
    Pattern.Layers.push_back(Circumferential( 0.55f, 11.0f, 5.0f, 28.0f));
    Pattern.Layers.push_back(Circumferential(-0.55f, 11.0f, 5.0f, 28.0f));
    Pattern.Layers.push_back(Lateral(28.0f,  18.0f, 12.0f,  0.3f,  1.3f, 0.00f));
    Pattern.Layers.push_back(Lateral(28.0f, -18.0f, 12.0f, -1.3f, -0.3f, 0.50f));
    Pattern.Layers.push_back(Lateral(28.0f,   0.0f,  9.0f, -0.3f,  0.3f, 0.25f));

    TreadLayerSpecification Sipe;
    Sipe.Kind  = TreadLayerKind::Sipe;
    Sipe.Count = 56.0f;  Sipe.Angle = 12.0f;  Sipe.Width = 1.5f;
    Sipe.From  = -1.3f;  Sipe.To    = 1.3f;   Sipe.Zig   = 2.0f;
    Sipe.DepthFraction = 0.4f;
    Pattern.Layers.push_back(Sipe);

    return Pattern;
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

    // 📝 ③ The boolean stage. Floor pieces must tile the tread exactly once: every square millimetre
    //    covered, none covered twice. The mesh stage reads that as licence to emit each piece independently
    //    and still expect a closed surface, so it is checked before any triangle is built.
    std::printf("\n③ Boolean stage — floor pieces must partition the tread\n");
    const TreadPatternSpecification Pattern = GrizzlyMagnum();
    const TreadRegionResult Regions = SolveTreadRegions(Pattern, Specification, Derived);

    uint32_t ContourCount = 0u;
    for (const TreadFloorPiece& Piece : Regions.Pieces)
        ContourCount += static_cast<uint32_t>(Piece.Contours.size());

    std::printf("  %-34s %10zu\n",      "floor pieces",    Regions.Pieces.size());
    std::printf("  %-34s %10u\n",       "contours",        ContourCount);
    std::printf("  %-34s %10.1f mm\u00b2\n", "domain area",     Regions.DomainArea);
    std::printf("  %-34s %10.1f mm\n",   "contour length",  Regions.BoundaryLength);

    std::printf("  depths [mm]:");
    for (const float Level : Regions.Levels)
        std::printf(" %.2f", static_cast<double>(Level));
    std::printf("\n");

    // \U0001F4DD The tolerance is derived, not chosen. Two pieces meeting along a shared boundary can disagree
    //    by one integer unit of the boolean stage, which is one micrometre, so the worst sliver area the
    //    whole arrangement can produce is its total contour length times that width. Anything under this is
    //    the arithmetic's own resolution; anything over it is a real hole in the tread.
    const double Tolerance = Regions.BoundaryLength * static_cast<double>(TyreMeshStructure::WeldTolerance);

    std::printf("  %-34s %10.4f mm\u00b2  (tolerance %.4f)\n", "gap",     Regions.GapArea,     Tolerance);
    std::printf("  %-34s %10.4f mm\u00b2\n",                   "spill",   Regions.ExcessArea);
    std::printf("  %-34s %10.4f mm\u00b2\n",                   "overlap", Regions.OverlapArea);

    Expect("pieces present",    static_cast<uint32_t>(Regions.Pieces.size() >= 2u), 1u);
    Expect("no gap",            static_cast<uint32_t>(Regions.GapArea     <= Tolerance), 1u);
    Expect("no spill",          static_cast<uint32_t>(Regions.ExcessArea  <= Tolerance), 1u);
    Expect("no overlap",        static_cast<uint32_t>(Regions.OverlapArea <= Tolerance), 1u);

    // \U0001F4DD \u2463 The mesh stage. Floors clipped to the grid, walls extruded from the outlines, all of it
    //    welded into one pool. This is where the prototype's 13 167 interior cracks were, so the number
    //    that matters is the boundary count: it must be the two rim openings and nothing else.
    std::printf("\n\u2463 Mesh stage \u2014 quad-dominant tread, welded\n");

    TreadMeshSettings Settings;
    TyreMeshStructure Tread;
    const TreadMeshMetrics Built = SolveTreadMesh(Regions, Specification, Derived, Settings, Tread);
    const TyreMeshMetrics  Raw    = Tread.QueryMetrics();
    const uint32_t         Splits = Tread.RepairJunctions();
    const TyreMeshMetrics  Audit  = Tread.QueryMetrics();

    std::printf("  %-34s %10u\n",     "floor quads",      Built.FloorQuad);
    std::printf("  %-34s %10u\n",     "wall quads",       Built.WallQuad);
    std::printf("  %-34s %10u\n",     "floor triangles",  Built.FloorTriangle);
    std::printf("  %-34s %9.1f %%\n", "quad fraction",    Built.QuadFraction * 100.0);
    std::printf("  %-34s %10u  %10u\n", "boundary  raw / repaired", Raw.BoundaryEdge, Audit.BoundaryEdge);
    std::printf("  %-34s %10u  %10u\n", "non-manif raw / repaired", Raw.NonManifoldEdge, Audit.NonManifoldEdge);
    std::printf("  %-34s %10u\n",     "T-junctions repaired", Splits);
    std::printf("  %-34s %10u\n",     "positions",        Audit.PositionCount);
    std::printf("  %-34s %10u\n",     "triangles",        Audit.TriangleCount);
    std::printf("  %-34s %10u\n",     "boundary edges",   Audit.BoundaryEdge);
    std::printf("  %-34s %10u\n",     "non-manifold",     Audit.NonManifoldEdge);
    std::printf("  %-34s %10u\n",     "degenerate",       Audit.DegenerateCount);

    // \U0001F4DD \U0001F6A7 Stage \u2463 does not pass yet and must not pretend to. The acceptance criterion is that the
    //    only open edges are the two rim openings where the sidewall will attach. Everything above is
    //    reported so the gap is visible rather than inferred.
    const uint32_t RimOpening = 1206u;
    Expect("tread closed but for the rim", Audit.BoundaryEdge, RimOpening);
    Expect("no non-manifold edges",        Audit.NonManifoldEdge, 0u);

    std::printf("\n%s\n", Failures == 0 ? "GATE PASSED" : "GATE FAILED");
    return Failures == 0 ? 0 : 1;
}
