//============================================================================================================================================
//                                                       DRIVEWHEELMESH.H
//============================================================================================================================================
// 📦 The ControlVehicle wheel, as one surface, emitted from a tread lattice the caller supplies.
//
//    There is exactly ONE wheel topology in Project-Drive, and this is it. The point of routing both callers through
//    the same emitter is that the deformation is then the ONLY difference between them:
//
//        DriveSceneAuthor   fills the lattice from the rest cylinder          -> the undeformed export wheel
//        DriveSceneMirror   fills the lattice from XPBDSoftTyre::Nodes()      -> the wheel the solver just deformed
//
//    Same ring/segment counts, same spokes, same materials. So when a rendered tyre squashes against the pad, flexes
//    over the ramp crest or bulges under a 6 kN corner load, that is the carcass the physics actually resolved and not
//    a cylinder with a scale applied to it. Nothing here simulates anything; it only skins what it is handed.
//
//    Frame: hub-local, axle along +Y, +Z up, metres. The caller applies the hub's world transform.
//
//    Geometry (all four numbers measured from ControlVehicle.blend — see VehicleGeometry.h):
//        tread radius 0.5086 m · rim radius 0.3446 m · section width 0.3958 m · 5 mag spokes

#pragma once

#include <cmath>
#include <cstdint>

namespace Frontier {
namespace Drive {

// Tessellation shared by the export wheel and the simulated wheel. The ring and segment counts deliberately equal
//    SoftTyreParameters' defaults, so XPBDSoftTyre::Nodes() drops into the lattice one-for-one with no resampling.
inline constexpr uint32_t kDriveWheelRingCount    = 5u;
inline constexpr uint32_t kDriveWheelSegmentCount = 64u;
inline constexpr uint32_t kDriveWheelSpokeCount   = 5u;

//------------------------------------------------------------------------------------------------------------------------ the lattice
// A ring x segment grid of tread points in hub-local space. Ring 0 is the +Y (left/outboard) shoulder, ring
//    RingCount-1 the -Y shoulder; segment 0 is at local +X and winds toward +Z. This is XPBDSoftTyre's own node
//    layout, which is why a live carcass can be handed over with nothing but a frame change.
struct WheelTreadLattice
{
    uint32_t RingCount    = 5u;
    uint32_t SegmentCount = 64u;
    // Tread[ring * SegmentCount + segment] = {x, y, z} in hub-local metres. Must hold RingCount*SegmentCount entries.
    const float* Tread    = nullptr;
    float RimRadius       = 0.3446f;   // [m] bead circle the sidewall closes onto
    float HalfWidth       = 0.1979f;   // [m] half the section width (bead half-width is derived from it)
    uint32_t SpokeCount   = 5u;        // [-] mag spokes per face

    [[nodiscard]] uint32_t Index(uint32_t Ring, uint32_t Segment) const noexcept
    { return Ring * SegmentCount + (Segment % SegmentCount); }
};

//------------------------------------------------------------------------------------------------------------------------ rest lattice
// Fills Out (RingCount*SegmentCount*3 floats) with the undeformed cylinder, so a caller that has no tyre solver
//    still emits the identical surface. This is the shape XPBDSoftTyre itself starts from.
inline void FillRestTreadLattice(float* Out, uint32_t RingCount, uint32_t SegmentCount,
                                 float Radius, float HalfWidth) noexcept
{
    constexpr float kTwoPi = 6.28318530718f;
    for (uint32_t Ring = 0; Ring < RingCount; ++Ring)
    {
        const float Across = (RingCount > 1u) ? static_cast<float>(Ring) / static_cast<float>(RingCount - 1u) : 0.5f;
        const float Y = HalfWidth - 2.0f * HalfWidth * Across;
        for (uint32_t Segment = 0; Segment < SegmentCount; ++Segment)
        {
            const float Angle = kTwoPi * static_cast<float>(Segment) / static_cast<float>(SegmentCount);
            float* P = Out + (static_cast<size_t>(Ring) * SegmentCount + Segment) * 3u;
            P[0] = Radius * std::cos(Angle);
            P[1] = Y;
            P[2] = Radius * std::sin(Angle);
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------ emitter
// Emit calls back with three positions and a material slot; the caller owns normals (flat faces) and winding.
//    Materials are the CourseMaterial slots: rubber for the carcass, hub for the mag face, brake for the disc.
template <typename Face>
void EmitWheelSurface(const WheelTreadLattice& Lattice, uint32_t MaterialTyre, uint32_t MaterialHub,
                      uint32_t MaterialBrake, Face&& Emit) noexcept
{
    if (Lattice.Tread == nullptr || Lattice.RingCount < 2u || Lattice.SegmentCount < 8u) return;
    constexpr float kTwoPi = 6.28318530718f;
    const uint32_t Rings = Lattice.RingCount, Segments = Lattice.SegmentCount;

    auto At = [&](uint32_t Ring, uint32_t Segment, float Out[3]) noexcept
    {
        const float* P = Lattice.Tread + static_cast<size_t>(Lattice.Index(Ring, Segment)) * 3u;
        Out[0] = P[0]; Out[1] = P[1]; Out[2] = P[2];
    };
    auto Quad = [&](const float A[3], const float B[3], const float C[3], const float D[3], uint32_t Slot) noexcept
    { Emit(A, B, C, Slot); Emit(A, C, D, Slot); };

    // ── tread band: the deformable surface. Every quad here is four solver nodes. ─────────────────────────────────
    for (uint32_t Ring = 0; Ring + 1u < Rings; ++Ring)
        for (uint32_t Segment = 0; Segment < Segments; ++Segment)
        {
            float A[3], B[3], C[3], D[3];
            At(Ring,      Segment,      A);
            At(Ring,      Segment + 1u, B);
            At(Ring + 1u, Segment + 1u, C);
            At(Ring + 1u, Segment,      D);
            Quad(A, B, C, D, MaterialTyre);
        }

    // ── sidewalls: each shoulder ring closes onto its bead circle, so a squashed tread drags its sidewall with it ──
    const float BeadHalfWidth = Lattice.HalfWidth * 0.74f;   // the bead sits inboard of the tread shoulder
    auto Bead = [&](uint32_t Segment, float Sign, float Out[3]) noexcept
    {
        const float Angle = kTwoPi * static_cast<float>(Segment % Segments) / static_cast<float>(Segments);
        Out[0] = Lattice.RimRadius * std::cos(Angle);
        Out[1] = Sign * BeadHalfWidth;
        Out[2] = Lattice.RimRadius * std::sin(Angle);
    };
    for (uint32_t Segment = 0; Segment < Segments; ++Segment)
    {
        float S0[3], S1[3], B0[3], B1[3];
        At(0u, Segment, S0); At(0u, Segment + 1u, S1);
        Bead(Segment, +1.0f, B0); Bead(Segment + 1u, +1.0f, B1);
        Quad(B0, B1, S1, S0, MaterialTyre);                              // outboard sidewall

        At(Rings - 1u, Segment, S0); At(Rings - 1u, Segment + 1u, S1);
        Bead(Segment, -1.0f, B0); Bead(Segment + 1u, -1.0f, B1);
        Quad(S0, S1, B1, B0, MaterialTyre);                              // inboard sidewall
    }

    // ── mags: a spoked rim face per side. Spokes are solid; the windows between them expose the brake disc. ───────
    const float HubRadius  = Lattice.RimRadius * 0.26f;                  // centre cap
    const float DiscRadius = Lattice.RimRadius * 0.74f;                  // brake disc, visible through the windows
    const uint32_t Spokes  = Lattice.SpokeCount < 3u ? 3u : Lattice.SpokeCount;
    const float SpokeSpan  = (kTwoPi / static_cast<float>(Spokes)) * 0.46f;   // half-angle of one spoke

    for (int Side = 0; Side < 2; ++Side)
    {
        const float Sign = (Side == 0) ? +1.0f : -1.0f;
        const float FaceY = Sign * BeadHalfWidth;
        auto Ring = [&](float Radius, float Angle, float Push, float Out[3]) noexcept
        {
            Out[0] = Radius * std::cos(Angle);
            Out[1] = FaceY + Sign * Push;
            Out[2] = Radius * std::sin(Angle);
        };

        for (uint32_t S = 0; S < Spokes; ++S)
        {
            const float Centre = kTwoPi * static_cast<float>(S) / static_cast<float>(Spokes);
            float A[3], B[3], C[3], D[3];
            Ring(HubRadius,         Centre - SpokeSpan * 0.55f, 0.012f, A);
            Ring(HubRadius,         Centre + SpokeSpan * 0.55f, 0.012f, B);
            Ring(Lattice.RimRadius, Centre + SpokeSpan,         0.004f, C);
            Ring(Lattice.RimRadius, Centre - SpokeSpan,         0.004f, D);
            Quad(Sign > 0.0f ? A : D, Sign > 0.0f ? B : C,
                 Sign > 0.0f ? C : B, Sign > 0.0f ? D : A, MaterialHub);

            // the rim lip between this spoke and the next, so the mag reads as a dish rather than five loose blades
            const float Next = kTwoPi * static_cast<float>(S + 1u) / static_cast<float>(Spokes);
            float L0[3], L1[3], L2[3], L3[3];
            Ring(Lattice.RimRadius,         Centre + SpokeSpan, 0.004f, L0);
            Ring(Lattice.RimRadius,         Next   - SpokeSpan, 0.004f, L1);
            Ring(Lattice.RimRadius * 0.90f, Next   - SpokeSpan, 0.000f, L2);
            Ring(Lattice.RimRadius * 0.90f, Centre + SpokeSpan, 0.000f, L3);
            Quad(Sign > 0.0f ? L0 : L3, Sign > 0.0f ? L1 : L2,
                 Sign > 0.0f ? L2 : L1, Sign > 0.0f ? L3 : L0, MaterialHub);
        }

        // centre cap
        for (uint32_t S = 0; S < Segments; S += 4u)
        {
            const float A0 = kTwoPi * static_cast<float>(S)        / static_cast<float>(Segments);
            const float A1 = kTwoPi * static_cast<float>(S + 4u)   / static_cast<float>(Segments);
            float Centre[3], P0[3], P1[3];
            Ring(0.0f, 0.0f, 0.016f, Centre);
            Ring(HubRadius, A0, 0.012f, P0);
            Ring(HubRadius, A1, 0.012f, P1);
            Emit(Centre, Sign > 0.0f ? P0 : P1, Sign > 0.0f ? P1 : P0, MaterialHub);
        }

        // brake disc, set inboard of the mag face so it sits behind the windows
        for (uint32_t S = 0; S < Segments; S += 2u)
        {
            const float A0 = kTwoPi * static_cast<float>(S)      / static_cast<float>(Segments);
            const float A1 = kTwoPi * static_cast<float>(S + 2u) / static_cast<float>(Segments);
            float Centre[3], P0[3], P1[3];
            Ring(0.0f, 0.0f, -0.030f, Centre);
            Ring(DiscRadius, A0, -0.030f, P0);
            Ring(DiscRadius, A1, -0.030f, P1);
            Emit(Centre, Sign > 0.0f ? P0 : P1, Sign > 0.0f ? P1 : P0, MaterialBrake);
        }
    }
}

} // namespace Drive
} // namespace Frontier
