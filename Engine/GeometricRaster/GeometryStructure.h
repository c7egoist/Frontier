//============================================================================================================================================
//                                                           GEOMETRYSTRUCTURE.H
//============================================================================================================================================
// 📦 Host-side scene records shared by the raster, BVH and distance-field paths.

#pragma once
#include "../ContentInterchange/MaterialIndex.h"
#include <cstdint>
#include <vector>

namespace Frontier
{
/// 📦 Minimal three-component vector used by the host geometry records. The GPU side packs the same triples into
///    vec4 slots; this stays scalar so the baker's maths reads the way the reference does.
struct Vector3
{
    float x = 0.0f, y = 0.0f, z = 0.0f;
};

/// 📦 One vertex as the host geometry stage sees it.
struct VertexRecord
{
    Vector3 SpatialLocation;    // [m]  rest-pose object-space position
};

/// 📦 One mesh instance. `World` is a column-major 4x4 object→world affine; the distance atlas stores the inverse
///    of rows 0..2 (DistanceAtlasPlacement::WorldToLocal) and re-places the baked volume with it every frame.
///    std430 mirror of the SdfInstance rows the shader reads before it is baked into DistanceAtlasPlacement.
struct alignas(16) InstanceRecord
{
    float    World[16]      = {};   // [-]   column-major object→world; the last row is the implicit (0,0,0,1)
    float    PreviousWorld[16] = {}; // [-]   last published placement; the atlas diff-tests against it to raise
                                     //       DistanceAtlasMoved, so a still instance costs nothing to re-place
    uint32_t FirstIndex     = 0u;   // [idx] first corner of this instance in the shared index buffer
    uint32_t VertexOffset   = 0u;   // [idx] added to every corner; MUST stay 0 when corners are already global
    uint32_t TriangleCount  = 0u;   // [cnt] primitives owned by this instance
    uint32_t MaterialIndex  = 0u;   // [idx] into the material table
    uint32_t Flags          = 0u;   // [bit] DistanceAtlasValid | DistanceAtlasMoved
};

} // namespace Frontier
