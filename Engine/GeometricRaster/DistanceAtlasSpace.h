//============================================================================================================================================
//                                                           DISTANCEATLASSPACE.H
//============================================================================================================================================
// 📦 Local-space unsigned distance volumes baked once per mesh and re-placed, never rebuilt, when instances move.

#pragma once
#include "GeometryStructure.h"
#include <array>
#include <cstdint>
#include <vector>

namespace Frontier
{
struct InstanceRecord;

/// 📦 One mesh instance as the GPU sees it: the world→local affine map plus the local volume it samples. std430 mirror of `SdfInstance`
///    in DistanceFieldTransport.slang.
struct alignas(16) DistanceAtlasPlacement
{
    float    WorldToLocal[12];   // [-]   rows 0..2 of the affine world→local map, each (R[r][0..2], t[r])
    float    BoxMinimum[3];      // [m]   local-space minimum of the padded volume
    float    DistanceScale;      // [-]   smallest singular value of the local→world map: local distance × this never overestimates
    float    BoxMaximum[3];      // [m]   local-space maximum of the padded volume
    float    VoxelSize;          // [m]   local voxel edge
    uint32_t Offset;             // [idx] first float of this volume inside the atlas
    uint32_t Dimensions[3];      // [cnt] voxels along x, y, z
    uint32_t Flags;              // [bit] DistanceAtlasValid | DistanceAtlasMoved
    uint32_t Reserved[3];        // [-]   keeps the record at seven std430 rows
};
static_assert(sizeof(DistanceAtlasPlacement) == 112u, "DistanceAtlasPlacement must stay seven vec4 rows");

constexpr uint32_t DistanceAtlasValid = 1u;   // [bit] the instance owns a baked volume
constexpr uint32_t DistanceAtlasMoved = 2u;   // [bit] the world transform differs from the pose the volume and facets were baked at

struct DistanceAtlasSettings
{
    uint32_t MeshVoxelBudget  = 1u << 19u;   // [cnt] most voxels one mesh may take
    uint32_t AtlasVoxelBudget = 4u << 20u;   // [cnt] most voxels the whole atlas may take (4 bytes each)
    float    MinimumVoxel     = 0.03f;       // [m]   finest voxel edge, however small the mesh
    uint32_t PaddingVoxels    = 2u;          // [cnt] empty voxels kept around the mesh so the field decays outside it
    uint32_t ThreadCount      = 0u;          // [cnt] 0 selects the hardware thread count
};

struct DistanceAtlasReport
{
    uint32_t Volumes   = 0u;     // [cnt] distinct meshes baked
    uint32_t Instances = 0u;     // [cnt] instances placed
    uint64_t Voxels    = 0u;     // [cnt] voxels across the atlas
    double   Seconds   = 0.0;    // [s]   wall-clock bake time
    float    FinestVoxel = 0.0f; // [m]
    float    CoarsestVoxel = 0.0f;// [m]
};

/// 📦 Local-space unsigned distance volumes, one per distinct mesh, baked once and then only re-placed. Moving an instance rewrites its
///    world→local map; the volume, and the GPU copy of it, never change. This is the mesh-distance-field half of a Lumen/Unreal-style
///    scene representation: the scene field is a composition of transformed local fields rather than a world grid that is rebuilt.
class DistanceAtlasSpace
{
public:
    /// 📦 Bakes one volume per distinct (FirstIndex, VertexOffset, TriangleCount) mesh with a multithreaded exact closest-triangle search.
    /// in    Rows   [-]  instances at their baked pose; their World matrices become the reference pose for DistanceAtlasMoved
    /// err   returns false when no instance owns a finite triangle; never throws
    /// cost  🔴
    bool Bake(const std::vector<VertexRecord>& Vertices, const std::vector<uint32_t>& Corners,
              const std::vector<InstanceRecord>& Rows, const DistanceAtlasSettings& Settings) noexcept;

    /// 📦 Re-places every instance from its current World matrix. Touches no volume data.
    /// err   returns false when Count differs from the baked instance count
    /// cost  ✔️
    bool Project(const InstanceRecord* Rows, uint32_t Count) noexcept;

    /// 📦 CPU mirror of SampleSceneDistance: the smallest transformed local distance over all instances, and the world voxel size there.
    float Sample(const float WorldPosition[3], float& Cell) const noexcept;

    const std::vector<float>&                  QueryAtlas() const noexcept { return Atlas; }
    const std::vector<DistanceAtlasPlacement>& QueryPlacements() const noexcept { return Placements; }
    const DistanceAtlasReport&                 QueryReport() const noexcept { return Report; }
    uint64_t                                   QueryPlacementRevision() const noexcept { return PlacementRevision; }
    uint32_t                                   QueryBakeCount() const noexcept { return BakeCount; }
    uint32_t                                   QueryMovedCount() const noexcept;
    bool                                       Empty() const noexcept { return Placements.empty() || Atlas.empty(); }

private:
    struct Volume
    {
        float    BoxMinimum[3];
        float    BoxMaximum[3];
        float    VoxelSize;
        uint32_t Offset;
        uint32_t Dimensions[3];
    };
    std::vector<float>                  Atlas;                // [m]   unsigned distances, x fastest, then y, then z
    std::vector<Volume>                 Volumes;              // [-]   one per distinct mesh
    std::vector<uint32_t>               InstanceVolume;       // [idx] per instance, UINT32_MAX when it has no finite triangle
    std::vector<std::array<float, 16>>  BakedWorld;           // [-]   per instance, the pose the volume was baked at
    std::vector<DistanceAtlasPlacement> Placements;           // [-]   per instance, rewritten by Project
    DistanceAtlasReport                 Report;
    uint64_t                            PlacementRevision = 0u;   // [-] bumps only when a placement actually changed
    uint32_t                            BakeCount         = 0u;   // [-] volumes baked since construction; Project never raises it
};
}
