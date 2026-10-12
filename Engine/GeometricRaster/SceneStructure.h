//============================================================================================================================================
//                                                            SCENESTRUCTURE.H
//============================================================================================================================================
// 📦 The engine's live scene: vertices, shared index buffer, instance placements and the material table.
//    Consumed by DistanceFieldStructure (exact BVH) and DistanceAtlasSpace (baked local distance volumes).

#pragma once
#include "GeometryStructure.h"
#include "../ContentInterchange/MaterialIndex.h"
#include <cstdint>
#include <vector>

namespace Frontier
{
/// 📦 Read-only view of the resident scene. Every query returns a reference into the owning vectors, so callers
///    must not hold them across a refit.
class SceneStructure
{
public:
    SceneStructure() = default;

    SceneStructure(std::vector<VertexRecord>  Vertices,
                   std::vector<uint32_t>      Indices,
                   std::vector<InstanceRecord> Instances,
                   MaterialIndex              Materials) noexcept
        : Vertices_(std::move(Vertices))
        , Indices_(std::move(Indices))
        , Instances_(std::move(Instances))
        , Materials_(std::move(Materials))
    {}

    const std::vector<VertexRecord>&   QueryVertices () const noexcept { return Vertices_;  }
    const std::vector<uint32_t>&       QueryIndices  () const noexcept { return Indices_;   }
    const std::vector<InstanceRecord>& QueryInstances() const noexcept { return Instances_; }
    const MaterialIndex&               QueryMaterials() const noexcept { return Materials_; }

    std::vector<VertexRecord>&   EditVertices () noexcept { return Vertices_;  }
    std::vector<uint32_t>&       EditIndices  () noexcept { return Indices_;   }
    std::vector<InstanceRecord>& EditInstances() noexcept { return Instances_; }
    MaterialIndex&               EditMaterials() noexcept { return Materials_; }

private:
    std::vector<VertexRecord>    Vertices_;
    std::vector<uint32_t>        Indices_;
    std::vector<InstanceRecord>  Instances_;
    MaterialIndex                Materials_;
};
} // namespace Frontier
