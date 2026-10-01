//============================================================================================================================================
//                                                           TYREMESHSTRUCTURE.CPP
//============================================================================================================================================
// 📦 Welding, triangle recording and the watertightness ledger behind TyreMeshStructure.

#include "TyreMeshStructure.h"

#include <cmath>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                        WELDING
//------------------------------------------------------------------------------------------------------------------------

uint64_t TyreMeshStructure::CellKey(int64_t Cx, int64_t Cy, int64_t Cz) noexcept
{
    // 📝 Three odd primes mixed into one 64-bit key. Collisions are tolerated: a bucket holds candidates
    //    and every candidate is distance-checked, so a collision costs a comparison, never a wrong weld.
    const uint64_t Hx = static_cast<uint64_t>(Cx) * 0x9E3779B97F4A7C15ull;
    const uint64_t Hy = static_cast<uint64_t>(Cy) * 0xC2B2AE3D27D4EB4Full;
    const uint64_t Hz = static_cast<uint64_t>(Cz) * 0x165667B19E3779F9ull;
    return Hx ^ (Hy + 0x9E3779B97F4A7C15ull + (Hx << 6) + (Hx >> 2))
              ^ (Hz + 0x9E3779B97F4A7C15ull + (Hy << 6) + (Hy >> 2));
}

uint32_t TyreMeshStructure::WeldPosition(float X, float Y, float Z) noexcept
{
    const float   Inverse = 1.0f / WeldTolerance;
    const int64_t Cx      = static_cast<int64_t>(std::floor(X * Inverse));
    const int64_t Cy      = static_cast<int64_t>(std::floor(Y * Inverse));
    const int64_t Cz      = static_cast<int64_t>(std::floor(Z * Inverse));

    // 📝 ① Probe the 3×3×3 neighbourhood. A point just across a cell edge is still within tolerance of
    //    one already stored, and must weld to it rather than open a crack along the cell lattice.
    const float Squared = WeldTolerance * WeldTolerance;
    for (int64_t Dz = -1; Dz <= 1; ++Dz)
    {
        for (int64_t Dy = -1; Dy <= 1; ++Dy)
        {
            for (int64_t Dx = -1; Dx <= 1; ++Dx)
            {
                const auto Found = CellIndex.find(CellKey(Cx + Dx, Cy + Dy, Cz + Dz));
                if (Found == CellIndex.end())
                    continue;

                for (const uint32_t Candidate : Found->second)
                {
                    const TyrePositionRecord& Point = Positions[Candidate];
                    const float Ex = Point.X - X;
                    const float Ey = Point.Y - Y;
                    const float Ez = Point.Z - Z;
                    if (Ex * Ex + Ey * Ey + Ez * Ez <= Squared)
                        return Candidate;
                }
            }
        }
    }

    // 📝 ② Nothing within tolerance, so this is a new point. It is filed only in its own cell; the
    //    27-cell probe above is what makes a one-cell filing sufficient.
    const uint32_t Created = static_cast<uint32_t>(Positions.size());
    Positions.push_back(TyrePositionRecord{ X, Y, Z });
    CellIndex[CellKey(Cx, Cy, Cz)].push_back(Created);
    return Created;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   TRIANGLE RECORDING
//------------------------------------------------------------------------------------------------------------------------

void TyreMeshStructure::AddTriangle(uint32_t                A,
                                    uint32_t                B,
                                    uint32_t                C,
                                    const TyreCornerRecord& CornerA,
                                    const TyreCornerRecord& CornerB,
                                    const TyreCornerRecord& CornerC) noexcept
{
    Indices.push_back(A);
    Indices.push_back(B);
    Indices.push_back(C);
    Corners.push_back(CornerA);
    Corners.push_back(CornerB);
    Corners.push_back(CornerC);
}

void TyreMeshStructure::Reserve(uint32_t PositionCount, uint32_t TriangleCount) noexcept
{
    Positions.reserve(PositionCount);
    Indices.reserve(static_cast<size_t>(TriangleCount) * 3u);
    Corners.reserve(static_cast<size_t>(TriangleCount) * 3u);
}

void TyreMeshStructure::Clear() noexcept
{
    Positions.clear();
    Corners.clear();
    Indices.clear();
    CellIndex.clear();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 WATERTIGHTNESS LEDGER
//------------------------------------------------------------------------------------------------------------------------

TyreMeshMetrics TyreMeshStructure::QueryMetrics() const noexcept
{
    TyreMeshMetrics Metrics;
    Metrics.PositionCount = static_cast<uint32_t>(Positions.size());
    Metrics.TriangleCount = static_cast<uint32_t>(Indices.size() / 3u);

    // 📝 ① Count how many triangles use each undirected edge. An edge is keyed by its two position
    //    indices in ascending order, so the two triangles that share it agree on the key by construction.
    std::unordered_map<uint64_t, uint32_t> EdgeUse;
    EdgeUse.reserve(Indices.size());

    std::unordered_map<uint64_t, uint32_t> FaceUse;
    FaceUse.reserve(Indices.size() / 3u);

    for (size_t Offset = 0; Offset + 2u < Indices.size(); Offset += 3u)
    {
        const uint32_t A = Indices[Offset];
        const uint32_t B = Indices[Offset + 1u];
        const uint32_t C = Indices[Offset + 2u];

        // 📝 ② A repeated index is degenerate by inspection; so is a vanishing cross product. Both are
        //    counted before the edges, because a degenerate triangle's edges would corrupt the ledger.
        if (A == B || B == C || A == C)
        {
            ++Metrics.DegenerateCount;
            continue;
        }

        const TyrePositionRecord& Pa = Positions[A];
        const TyrePositionRecord& Pb = Positions[B];
        const TyrePositionRecord& Pc = Positions[C];

        const float Ux = Pb.X - Pa.X, Uy = Pb.Y - Pa.Y, Uz = Pb.Z - Pa.Z;
        const float Vx = Pc.X - Pa.X, Vy = Pc.Y - Pa.Y, Vz = Pc.Z - Pa.Z;
        const float Cx = Uy * Vz - Uz * Vy;
        const float Cy = Uz * Vx - Ux * Vz;
        const float Cz = Ux * Vy - Uy * Vx;

        // 📐 Twice the area. Compared against the square of the weld tolerance so the threshold for
        //    "no area" is consistent with the threshold for "same point".
        constexpr float AreaFloor = WeldTolerance * WeldTolerance;
        if (Cx * Cx + Cy * Cy + Cz * Cz <= AreaFloor * AreaFloor)
        {
            ++Metrics.DegenerateCount;
            continue;
        }

        uint32_t Sorted[3] = { A, B, C };
        for (int Outer = 0; Outer < 2; ++Outer)
            for (int Inner = 0; Inner < 2 - Outer; ++Inner)
                if (Sorted[Inner] > Sorted[Inner + 1])
                {
                    const uint32_t Swap = Sorted[Inner];
                    Sorted[Inner]       = Sorted[Inner + 1];
                    Sorted[Inner + 1]   = Swap;
                }

        const uint64_t FaceKey = (static_cast<uint64_t>(Sorted[0]) * 0x9E3779B1ull + Sorted[1])
                               * 0x9E3779B1ull + Sorted[2];
        if (++FaceUse[FaceKey] > 1u)
            ++Metrics.DuplicateCount;

        const uint32_t Pairs[3][2] = { { A, B }, { B, C }, { C, A } };
        for (const auto& Pair : Pairs)
        {
            const uint32_t Low  = Pair[0] < Pair[1] ? Pair[0] : Pair[1];
            const uint32_t High = Pair[0] < Pair[1] ? Pair[1] : Pair[0];
            ++EdgeUse[(static_cast<uint64_t>(Low) << 32) | static_cast<uint64_t>(High)];
        }
    }

    // 📝 ③ One use is an open edge, three or more is a non-manifold junction. Exactly two is closed.
    for (const auto& Entry : EdgeUse)
    {
        if (Entry.second == 1u)
            ++Metrics.BoundaryEdge;
        else if (Entry.second > 2u)
            ++Metrics.NonManifoldEdge;
    }

    return Metrics;
}

}   // namespace Frontier
