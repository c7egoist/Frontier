//============================================================================================================================================
//                                                          DISTANCEATLASSPACE.CPP
//============================================================================================================================================
// 📦 Bakes per-mesh local distance volumes with a multithreaded exact closest-facet search, and re-places instances without touching them.

#include "DistanceAtlasSpace.h"
#include "SceneStructure.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <limits>
#include <thread>

namespace Frontier
{
namespace
{
struct Facet
{
    float Alpha[3], Beta[3], Gamma[3];
};

struct Node
{
    float    Minimum[3], Maximum[3];
    uint32_t Second;   // [idx] right child; the left child is always the next node
    uint32_t First;    // [idx] first facet of a leaf
    uint32_t Count;    // [cnt] facets in a leaf, 0 for an interior node
};

struct Hierarchy
{
    std::vector<Facet>    Facets;
    std::vector<Node>     Nodes;
    std::vector<uint32_t> Order;
};

float DistanceSquaredToFacet(const float Point[3], const Facet& Triangle) noexcept
{
    float EdgeAlpha[3], EdgeBeta[3], Delta[3];
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
    {
        EdgeAlpha[Axis] = Triangle.Beta[Axis] - Triangle.Alpha[Axis];
        EdgeBeta[Axis]  = Triangle.Gamma[Axis] - Triangle.Alpha[Axis];
        Delta[Axis]     = Point[Axis] - Triangle.Alpha[Axis];
    }
    const auto Dot = [](const float* Left, const float* Right) noexcept { return Left[0] * Right[0] + Left[1] * Right[1] + Left[2] * Right[2]; };
    const auto Length = [&](const float* Vector) noexcept { return Dot(Vector, Vector); };
    const float D1 = Dot(EdgeAlpha, Delta), D2 = Dot(EdgeBeta, Delta);
    if (D1 <= 0.0f && D2 <= 0.0f) return Length(Delta);
    float FromBeta[3] = { Point[0] - Triangle.Beta[0], Point[1] - Triangle.Beta[1], Point[2] - Triangle.Beta[2] };
    const float D3 = Dot(EdgeAlpha, FromBeta), D4 = Dot(EdgeBeta, FromBeta);
    if (D3 >= 0.0f && D4 <= D3) return Length(FromBeta);
    const float AreaGamma = D1 * D4 - D3 * D2;
    if (AreaGamma <= 0.0f && D1 >= 0.0f && D3 <= 0.0f)
    {
        const float Weight = D1 / (D1 - D3);
        float       Offset[3];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Offset[Axis] = Delta[Axis] - EdgeAlpha[Axis] * Weight;
        return Length(Offset);
    }
    float FromGamma[3] = { Point[0] - Triangle.Gamma[0], Point[1] - Triangle.Gamma[1], Point[2] - Triangle.Gamma[2] };
    const float D5 = Dot(EdgeAlpha, FromGamma), D6 = Dot(EdgeBeta, FromGamma);
    if (D6 >= 0.0f && D5 <= D6) return Length(FromGamma);
    const float AreaBeta = D5 * D2 - D1 * D6;
    if (AreaBeta <= 0.0f && D2 >= 0.0f && D6 <= 0.0f)
    {
        const float Weight = D2 / (D2 - D6);
        float       Offset[3];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Offset[Axis] = Delta[Axis] - EdgeBeta[Axis] * Weight;
        return Length(Offset);
    }
    const float AreaAlpha = D3 * D6 - D5 * D4;
    if (AreaAlpha <= 0.0f && D4 - D3 >= 0.0f && D5 - D6 >= 0.0f)
    {
        const float Weight = (D4 - D3) / ((D4 - D3) + (D5 - D6));
        float       Offset[3];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
            Offset[Axis] = FromBeta[Axis] - (Triangle.Gamma[Axis] - Triangle.Beta[Axis]) * Weight;
        return Length(Offset);
    }
    const float Sum    = AreaAlpha + AreaBeta + AreaGamma;
    const float WeightBeta = AreaBeta / Sum, WeightGamma = AreaGamma / Sum;
    float       Offset[3];
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Offset[Axis] = Delta[Axis] - EdgeAlpha[Axis] * WeightBeta - EdgeBeta[Axis] * WeightGamma;
    return Length(Offset);
}

float DistanceSquaredToBox(const float Point[3], const Node& Entry) noexcept
{
    float Sum = 0.0f;
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
    {
        const float Excess = std::max(std::max(Entry.Minimum[Axis] - Point[Axis], Point[Axis] - Entry.Maximum[Axis]), 0.0f);
        Sum += Excess * Excess;
    }
    return Sum;
}

uint32_t Linearize(Hierarchy& Structure, uint32_t First, uint32_t Count)
{
    const uint32_t Slot = static_cast<uint32_t>(Structure.Nodes.size());
    Structure.Nodes.push_back(Node{});
    Node Entry{};
    float CentroidMinimum[3], CentroidMaximum[3];
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
    {
        Entry.Minimum[Axis] = CentroidMinimum[Axis] = std::numeric_limits<float>::max();
        Entry.Maximum[Axis] = CentroidMaximum[Axis] = -std::numeric_limits<float>::max();
    }
    for (uint32_t Index = First; Index < First + Count; ++Index)
    {
        const Facet& Triangle = Structure.Facets[Structure.Order[Index]];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
        {
            const float Low  = std::min({ Triangle.Alpha[Axis], Triangle.Beta[Axis], Triangle.Gamma[Axis] });
            const float High = std::max({ Triangle.Alpha[Axis], Triangle.Beta[Axis], Triangle.Gamma[Axis] });
            const float Centre = (Triangle.Alpha[Axis] + Triangle.Beta[Axis] + Triangle.Gamma[Axis]) / 3.0f;
            Entry.Minimum[Axis]    = std::min(Entry.Minimum[Axis], Low);
            Entry.Maximum[Axis]    = std::max(Entry.Maximum[Axis], High);
            CentroidMinimum[Axis]  = std::min(CentroidMinimum[Axis], Centre);
            CentroidMaximum[Axis]  = std::max(CentroidMaximum[Axis], Centre);
        }
    }
    if (Count <= 4u)
    {
        Entry.First = First;
        Entry.Count = Count;
        Structure.Nodes[Slot] = Entry;
        return Slot;
    }
    uint32_t Widest = 0u;
    for (uint32_t Axis = 1u; Axis < 3u; ++Axis)
        if (CentroidMaximum[Axis] - CentroidMinimum[Axis] > CentroidMaximum[Widest] - CentroidMinimum[Widest]) Widest = Axis;
    const uint32_t Half = Count / 2u;
    std::nth_element(Structure.Order.begin() + First, Structure.Order.begin() + First + Half, Structure.Order.begin() + First + Count,
                     [&](uint32_t Left, uint32_t Right)
                     {
                         const Facet& Alpha = Structure.Facets[Left];
                         const Facet& Beta  = Structure.Facets[Right];
                         return Alpha.Alpha[Widest] + Alpha.Beta[Widest] + Alpha.Gamma[Widest] <
                                Beta.Alpha[Widest] + Beta.Beta[Widest] + Beta.Gamma[Widest];
                     });
    Linearize(Structure, First, Half);
    Entry.Second = Linearize(Structure, First + Half, Count - Half);
    Structure.Nodes[Slot] = Entry;
    return Slot;
}

/// 📝 Branch-and-bound closest facet. `Hint` carries the previous voxel's winner: its distance is an exact upper bound, so the box test
///    rejects almost every node and the walk is short. That coherence is what makes a million voxels cheap.
float ClosestDistanceSquared(const Hierarchy& Structure, const float Point[3], uint32_t& Hint) noexcept
{
    float Best = DistanceSquaredToFacet(Point, Structure.Facets[Structure.Order[Hint]]);
    uint32_t Stack[96];
    uint32_t Depth = 0u;
    Stack[Depth++] = 0u;
    while (Depth)
    {
        const uint32_t Slot  = Stack[--Depth];
        const Node&    Entry = Structure.Nodes[Slot];
        if (DistanceSquaredToBox(Point, Entry) >= Best) continue;
        if (Entry.Count)
        {
            for (uint32_t Index = 0u; Index < Entry.Count; ++Index)
            {
                const float Candidate = DistanceSquaredToFacet(Point, Structure.Facets[Structure.Order[Entry.First + Index]]);
                if (Candidate < Best)
                {
                    Best = Candidate;
                    Hint = Entry.First + Index;
                }
            }
            continue;
        }
        const uint32_t LeftSlot  = Slot + 1u;
        const uint32_t RightSlot = Entry.Second;
        const float    LeftDistance  = DistanceSquaredToBox(Point, Structure.Nodes[LeftSlot]);
        const float    RightDistance = DistanceSquaredToBox(Point, Structure.Nodes[RightSlot]);
        if (LeftDistance <= RightDistance)
        {
            Stack[Depth++] = RightSlot;
            Stack[Depth++] = LeftSlot;
        }
        else
        {
            Stack[Depth++] = LeftSlot;
            Stack[Depth++] = RightSlot;
        }
    }
    return Best;
}

struct Layout
{
    float    VoxelSize;
    uint32_t Dimensions[3];
    uint64_t Voxels;
};

/// 📝 Smallest voxel at or above `MinimumVoxel` whose padded grid fits `Budget`. Thin or huge meshes get a coarser voxel instead of a
///    refusal; the exact BVH still decides every hit, so a coarse volume costs marching efficiency, never correctness.
Layout ChooseLayout(const float Extent[3], uint32_t Budget, float MinimumVoxel, uint32_t Padding) noexcept
{
    const float Longest = std::max({ Extent[0], Extent[1], Extent[2], 1.0e-3f });
    float       Voxel   = std::max(MinimumVoxel, Longest / 256.0f);
    Layout      Result{};
    for (uint32_t Attempt = 0u; Attempt < 96u; ++Attempt)
    {
        Result.Voxels = 1u;
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
        {
            Result.Dimensions[Axis] = std::max(4u, static_cast<uint32_t>(std::ceil(Extent[Axis] / Voxel)) + 2u * Padding);
            Result.Voxels *= Result.Dimensions[Axis];
        }
        Result.VoxelSize = Voxel;
        if (Result.Voxels <= Budget) break;
        Voxel *= 1.08f;
    }
    return Result;
}

double SmallestSingularValue(const float Matrix[3][3]) noexcept
{
    double Gram[3][3];
    for (uint32_t Row = 0u; Row < 3u; ++Row)
        for (uint32_t Column = 0u; Column < 3u; ++Column)
        {
            Gram[Row][Column] = 0.0;
            for (uint32_t Inner = 0u; Inner < 3u; ++Inner) Gram[Row][Column] += double(Matrix[Inner][Row]) * double(Matrix[Inner][Column]);
        }
    const double OffDiagonal = Gram[0][1] * Gram[0][1] + Gram[0][2] * Gram[0][2] + Gram[1][2] * Gram[1][2];
    double       Smallest;
    if (OffDiagonal < 1.0e-24)
        Smallest = std::min({ Gram[0][0], Gram[1][1], Gram[2][2] });
    else
    {
        const double Mean     = (Gram[0][0] + Gram[1][1] + Gram[2][2]) / 3.0;
        const double Spread   = std::sqrt(((Gram[0][0] - Mean) * (Gram[0][0] - Mean) + (Gram[1][1] - Mean) * (Gram[1][1] - Mean) +
                                           (Gram[2][2] - Mean) * (Gram[2][2] - Mean) + 2.0 * OffDiagonal) / 6.0);
        double       Shifted[3][3];
        for (uint32_t Row = 0u; Row < 3u; ++Row)
            for (uint32_t Column = 0u; Column < 3u; ++Column) Shifted[Row][Column] = (Gram[Row][Column] - (Row == Column ? Mean : 0.0)) / Spread;
        const double Determinant = Shifted[0][0] * (Shifted[1][1] * Shifted[2][2] - Shifted[1][2] * Shifted[2][1]) -
                                   Shifted[0][1] * (Shifted[1][0] * Shifted[2][2] - Shifted[1][2] * Shifted[2][0]) +
                                   Shifted[0][2] * (Shifted[1][0] * Shifted[2][1] - Shifted[1][1] * Shifted[2][0]);
        const double Angle = std::acos(std::clamp(Determinant * 0.5, -1.0, 1.0)) / 3.0;
        Smallest = Mean + Spread * 2.0 * std::cos(Angle + 2.0943951023931953);   // the smallest of the three roots
    }
    return std::sqrt(std::max(Smallest, 0.0));
}
} // namespace

uint32_t DistanceAtlasSpace::QueryMovedCount() const noexcept
{
    uint32_t Count = 0u;
    for (const auto& Entry : Placements) Count += (Entry.Flags & DistanceAtlasMoved) ? 1u : 0u;
    return Count;
}

bool DistanceAtlasSpace::Bake(const std::vector<VertexRecord>& Vertices, const std::vector<uint32_t>& Corners,
                              const std::vector<InstanceRecord>& Rows, const DistanceAtlasSettings& Settings) noexcept
{
    try
    {
        const auto Started = std::chrono::steady_clock::now();
        Atlas.clear(); Volumes.clear(); InstanceVolume.assign(Rows.size(), UINT32_MAX); BakedWorld.assign(Rows.size(), {}); Placements.clear();
        Report = {};
        struct Prototype { uint32_t FirstIndex, VertexOffset, TriangleCount, Representative; Hierarchy Structure; float Minimum[3], Maximum[3]; };
        std::vector<Prototype> Prototypes;
        for (uint32_t Slot = 0u; Slot < Rows.size(); ++Slot)
        {
            const InstanceRecord& Row = Rows[Slot];
            std::copy(std::begin(Row.World), std::end(Row.World), BakedWorld[Slot].begin());
            if (!Row.TriangleCount) continue;
            uint32_t Match = UINT32_MAX;
            for (uint32_t Index = 0u; Index < Prototypes.size(); ++Index)
                if (Prototypes[Index].FirstIndex == Row.FirstIndex && Prototypes[Index].VertexOffset == Row.VertexOffset &&
                    Prototypes[Index].TriangleCount == Row.TriangleCount) { Match = Index; break; }
            if (Match == UINT32_MAX)
            {
                Prototype Entry{};
                Entry.FirstIndex = Row.FirstIndex; Entry.VertexOffset = Row.VertexOffset; Entry.TriangleCount = Row.TriangleCount; Entry.Representative = Slot;
                Match = static_cast<uint32_t>(Prototypes.size());
                Prototypes.push_back(std::move(Entry));
            }
            InstanceVolume[Slot] = Match;
        }
        for (Prototype& Entry : Prototypes)
        {
            for (uint32_t Axis = 0u; Axis < 3u; ++Axis) { Entry.Minimum[Axis] = std::numeric_limits<float>::max(); Entry.Maximum[Axis] = -std::numeric_limits<float>::max(); }
            for (uint32_t Primitive = 0u; Primitive < Entry.TriangleCount; ++Primitive)
            {
                Facet Triangle{};
                float* Targets[3] = { Triangle.Alpha, Triangle.Beta, Triangle.Gamma };
                bool   Finite     = true;
                for (uint32_t Corner = 0u; Corner < 3u; ++Corner)
                {
                    const size_t Index = size_t(Entry.FirstIndex) + Primitive * 3u + Corner;
                    if (Index >= Corners.size() || size_t(Corners[Index]) + Entry.VertexOffset >= Vertices.size()) { Finite = false; break; }
                    const Vector3& Position = Vertices[Corners[Index] + Entry.VertexOffset].SpatialLocation;
                    Targets[Corner][0] = Position.x; Targets[Corner][1] = Position.y; Targets[Corner][2] = Position.z;
                    Finite &= std::isfinite(Position.x) && std::isfinite(Position.y) && std::isfinite(Position.z);
                }
                if (!Finite) continue;
                for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
                {
                    Entry.Minimum[Axis] = std::min({ Entry.Minimum[Axis], Triangle.Alpha[Axis], Triangle.Beta[Axis], Triangle.Gamma[Axis] });
                    Entry.Maximum[Axis] = std::max({ Entry.Maximum[Axis], Triangle.Alpha[Axis], Triangle.Beta[Axis], Triangle.Gamma[Axis] });
                }
                Entry.Structure.Facets.push_back(Triangle);
            }
            if (Entry.Structure.Facets.empty()) continue;
            Entry.Structure.Order.resize(Entry.Structure.Facets.size());
            for (uint32_t Index = 0u; Index < Entry.Structure.Order.size(); ++Index) Entry.Structure.Order[Index] = Index;
            Entry.Structure.Nodes.reserve(Entry.Structure.Facets.size());
            Linearize(Entry.Structure, 0u, static_cast<uint32_t>(Entry.Structure.Order.size()));
        }
        // ① size every volume under the per-mesh budget, then shrink them together if the atlas budget is exceeded
        std::vector<Layout> Layouts(Prototypes.size());
        float               Scale = 1.0f;
        for (uint32_t Pass = 0u; Pass < 6u; ++Pass)
        {
            uint64_t Total = 0u;
            for (uint32_t Index = 0u; Index < Prototypes.size(); ++Index)
            {
                if (Prototypes[Index].Structure.Facets.empty()) { Layouts[Index] = {}; continue; }
                float Extent[3];
                for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Extent[Axis] = Prototypes[Index].Maximum[Axis] - Prototypes[Index].Minimum[Axis];
                const uint32_t Budget = std::max<uint32_t>(4096u, static_cast<uint32_t>(double(Settings.MeshVoxelBudget) * Scale));
                Layouts[Index] = ChooseLayout(Extent, Budget, Settings.MinimumVoxel, Settings.PaddingVoxels);
                Total += Layouts[Index].Voxels;
            }
            if (Total <= Settings.AtlasVoxelBudget) break;
            Scale *= static_cast<float>(double(Settings.AtlasVoxelBudget) / double(Total)) * 0.95f;
        }
        uint64_t Offset = 0u;
        Volumes.resize(Prototypes.size());
        for (uint32_t Index = 0u; Index < Prototypes.size(); ++Index)
        {
            Volume& Target = Volumes[Index];
            Target = {};
            if (Prototypes[Index].Structure.Facets.empty()) continue;
            const Layout& Shape = Layouts[Index];
            Target.VoxelSize = Shape.VoxelSize;
            for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
            {
                Target.Dimensions[Axis] = Shape.Dimensions[Axis];
                const float Centre = 0.5f * (Prototypes[Index].Minimum[Axis] + Prototypes[Index].Maximum[Axis]);
                const float Half   = 0.5f * Shape.VoxelSize * float(Shape.Dimensions[Axis]);
                Target.BoxMinimum[Axis] = Centre - Half;
                Target.BoxMaximum[Axis] = Centre + Half;
            }
            Target.Offset = static_cast<uint32_t>(Offset);
            Offset += Shape.Voxels;
        }
        if (Offset == 0u || Offset > std::numeric_limits<uint32_t>::max()) return false;
        Atlas.assign(static_cast<size_t>(Offset), 0.0f);
        // ② fill: one z-slice per work item, each thread carrying its own closest-facet hint
        const uint32_t Hardware = std::max(1u, std::thread::hardware_concurrency());
        const uint32_t Threads  = Settings.ThreadCount ? Settings.ThreadCount : Hardware;
        for (uint32_t Index = 0u; Index < Prototypes.size(); ++Index)
        {
            const Volume& Target = Volumes[Index];
            if (!Target.Dimensions[0]) continue;
            const Hierarchy& Structure = Prototypes[Index].Structure;
            std::atomic<uint32_t> NextSlice{ 0u };
            const auto Work = [&]() noexcept
            {
                uint32_t Hint = 0u;
                for (uint32_t Slice = NextSlice.fetch_add(1u); Slice < Target.Dimensions[2]; Slice = NextSlice.fetch_add(1u))
                    for (uint32_t Row = 0u; Row < Target.Dimensions[1]; ++Row)
                        for (uint32_t Column = 0u; Column < Target.Dimensions[0]; ++Column)
                        {
                            const float Point[3] = { Target.BoxMinimum[0] + (float(Column) + 0.5f) * Target.VoxelSize,
                                                     Target.BoxMinimum[1] + (float(Row) + 0.5f) * Target.VoxelSize,
                                                     Target.BoxMinimum[2] + (float(Slice) + 0.5f) * Target.VoxelSize };
                            const size_t Linear = Target.Offset + (size_t(Slice) * Target.Dimensions[1] + Row) * Target.Dimensions[0] + Column;
                            Atlas[Linear] = std::sqrt(ClosestDistanceSquared(Structure, Point, Hint));
                        }
            };
            std::vector<std::thread> Pool;
            for (uint32_t Worker = 1u; Worker < std::min(Threads, Target.Dimensions[2]); ++Worker) Pool.emplace_back(Work);
            Work();
            for (auto& Worker : Pool) Worker.join();
            ++BakeCount;
        }
        Report.Volumes = static_cast<uint32_t>(Prototypes.size());
        Report.Instances = static_cast<uint32_t>(Rows.size());
        Report.Voxels = Offset;
        Report.FinestVoxel = std::numeric_limits<float>::max();
        for (const Volume& Target : Volumes)
            if (Target.Dimensions[0])
            {
                Report.FinestVoxel = std::min(Report.FinestVoxel, Target.VoxelSize);
                Report.CoarsestVoxel = std::max(Report.CoarsestVoxel, Target.VoxelSize);
            }
        Report.Seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - Started).count();
        Placements.assign(Rows.size(), {});
        return Project(Rows.data(), static_cast<uint32_t>(Rows.size()));
    }
    catch (...)
    {
        Atlas.clear(); Volumes.clear(); Placements.clear();
        return false;
    }
}

bool DistanceAtlasSpace::Project(const InstanceRecord* Rows, uint32_t Count) noexcept
{
    if (!Rows || Count != Placements.size() || Count != InstanceVolume.size()) return false;
    bool Changed = false;
    for (uint32_t Slot = 0u; Slot < Count; ++Slot)
    {
        DistanceAtlasPlacement Next{};
        const uint32_t Index = InstanceVolume[Slot];
        const float*   World = Rows[Slot].World;
        float          Linear[3][3];
        for (uint32_t Row = 0u; Row < 3u; ++Row)
            for (uint32_t Column = 0u; Column < 3u; ++Column) Linear[Row][Column] = World[Column * 4u + Row];
        float Moved = 0.0f;
        for (uint32_t Element = 0u; Element < 16u; ++Element) Moved = std::max(Moved, std::fabs(World[Element] - BakedWorld[Slot][Element]));
        if (Rows[Slot].TriangleCount && Moved > 1.0e-4f) Next.Flags |= DistanceAtlasMoved;
        if (Index != UINT32_MAX && Volumes[Index].Dimensions[0])
        {
            const double Determinant = double(Linear[0][0]) * (double(Linear[1][1]) * Linear[2][2] - double(Linear[1][2]) * Linear[2][1]) -
                                       double(Linear[0][1]) * (double(Linear[1][0]) * Linear[2][2] - double(Linear[1][2]) * Linear[2][0]) +
                                       double(Linear[0][2]) * (double(Linear[1][0]) * Linear[2][1] - double(Linear[1][1]) * Linear[2][0]);
            const double Scale = SmallestSingularValue(Linear);
            if (std::fabs(Determinant) > 1.0e-12 && Scale > 1.0e-6)
            {
                double Inverse[3][3];
                Inverse[0][0] = (double(Linear[1][1]) * Linear[2][2] - double(Linear[1][2]) * Linear[2][1]) / Determinant;
                Inverse[0][1] = (double(Linear[0][2]) * Linear[2][1] - double(Linear[0][1]) * Linear[2][2]) / Determinant;
                Inverse[0][2] = (double(Linear[0][1]) * Linear[1][2] - double(Linear[0][2]) * Linear[1][1]) / Determinant;
                Inverse[1][0] = (double(Linear[1][2]) * Linear[2][0] - double(Linear[1][0]) * Linear[2][2]) / Determinant;
                Inverse[1][1] = (double(Linear[0][0]) * Linear[2][2] - double(Linear[0][2]) * Linear[2][0]) / Determinant;
                Inverse[1][2] = (double(Linear[0][2]) * Linear[1][0] - double(Linear[0][0]) * Linear[1][2]) / Determinant;
                Inverse[2][0] = (double(Linear[1][0]) * Linear[2][1] - double(Linear[1][1]) * Linear[2][0]) / Determinant;
                Inverse[2][1] = (double(Linear[0][1]) * Linear[2][0] - double(Linear[0][0]) * Linear[2][1]) / Determinant;
                Inverse[2][2] = (double(Linear[0][0]) * Linear[1][1] - double(Linear[0][1]) * Linear[1][0]) / Determinant;
                for (uint32_t Row = 0u; Row < 3u; ++Row)
                {
                    double Shift = 0.0;
                    for (uint32_t Column = 0u; Column < 3u; ++Column)
                    {
                        Next.WorldToLocal[Row * 4u + Column] = static_cast<float>(Inverse[Row][Column]);
                        Shift += Inverse[Row][Column] * double(World[12u + Column]);
                    }
                    Next.WorldToLocal[Row * 4u + 3u] = static_cast<float>(-Shift);
                }
                const Volume& Source = Volumes[Index];
                std::copy(std::begin(Source.BoxMinimum), std::end(Source.BoxMinimum), Next.BoxMinimum);
                std::copy(std::begin(Source.BoxMaximum), std::end(Source.BoxMaximum), Next.BoxMaximum);
                std::copy(std::begin(Source.Dimensions), std::end(Source.Dimensions), Next.Dimensions);
                Next.DistanceScale = static_cast<float>(Scale);
                Next.VoxelSize     = Source.VoxelSize;
                Next.Offset        = Source.Offset;
                Next.Flags        |= DistanceAtlasValid;
            }
        }
        if (std::memcmp(&Next, &Placements[Slot], sizeof(Next)) != 0)
        {
            Placements[Slot] = Next;
            Changed          = true;
        }
    }
    if (Changed) ++PlacementRevision;
    return true;
}

float DistanceAtlasSpace::Sample(const float WorldPosition[3], float& Cell) const noexcept
{
    float Best = 1.0e20f;
    Cell = 1.0f;
    for (const DistanceAtlasPlacement& Entry : Placements)
    {
        if (!(Entry.Flags & DistanceAtlasValid)) continue;
        float Local[3];
        for (uint32_t Row = 0u; Row < 3u; ++Row)
            Local[Row] = Entry.WorldToLocal[Row * 4u] * WorldPosition[0] + Entry.WorldToLocal[Row * 4u + 1u] * WorldPosition[1] +
                         Entry.WorldToLocal[Row * 4u + 2u] * WorldPosition[2] + Entry.WorldToLocal[Row * 4u + 3u];
        float Clamped[3], Outside = 0.0f;
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
        {
            Clamped[Axis] = std::clamp(Local[Axis], Entry.BoxMinimum[Axis], Entry.BoxMaximum[Axis]);
            Outside += (Local[Axis] - Clamped[Axis]) * (Local[Axis] - Clamped[Axis]);
        }
        const float BoxDistance = std::sqrt(Outside) * Entry.DistanceScale;
        if (BoxDistance >= Best) continue;
        float    Fraction[3];
        uint32_t Base[3];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
        {
            const float Coordinate = (Clamped[Axis] - Entry.BoxMinimum[Axis]) / Entry.VoxelSize - 0.5f;
            const float Floor      = std::clamp(std::floor(Coordinate), 0.0f, float(Entry.Dimensions[Axis]) - 2.0f);
            Base[Axis]     = static_cast<uint32_t>(Floor);
            Fraction[Axis] = std::clamp(Coordinate - Floor, 0.0f, 1.0f);
        }
        float Distance = 0.0f;
        for (uint32_t Corner = 0u; Corner < 8u; ++Corner)
        {
            const uint32_t Step[3] = { Corner & 1u, (Corner >> 1u) & 1u, (Corner >> 2u) & 1u };
            float          Weight  = 1.0f;
            for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Weight *= Step[Axis] ? Fraction[Axis] : 1.0f - Fraction[Axis];
            const size_t Linear = Entry.Offset + (size_t(Base[2] + Step[2]) * Entry.Dimensions[1] + Base[1] + Step[1]) * Entry.Dimensions[0] + Base[0] + Step[0];
            Distance += Atlas[Linear] * Weight;
        }
        const float Total = BoxDistance + Distance * Entry.DistanceScale;
        if (Total < Best)
        {
            Best = Total;
            Cell = Entry.VoxelSize * Entry.DistanceScale;
        }
    }
    return Best;
}
}
