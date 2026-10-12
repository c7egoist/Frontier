//============================================================================================================================================
//                                                            MATERIALINDEX.H
//============================================================================================================================================
// 📦 Per-material reflectance/emission table, shared by the material resolve, the SDF bake and the debug views.
//    The device packs these into DistanceFieldFacet::Albedo / Emission, with metalness carried in Emission.w.

#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

namespace Frontier
{
/// 📦 One material. Kept as named scalars on the host; the GPU binding (SurfaceResolve.slang) reads metalness out
///    of MaterialRecord.Emissive.w, so the two must stay in step.
struct alignas(16) MaterialRecord
{
    float AlbedoR        = 0.8f, AlbedoG = 0.8f, AlbedoB = 0.8f;
    float RoughnessValue = 0.5f;
    float Metalness      = 0.0f;
    float EmissiveR      = 0.0f, EmissiveG = 0.0f, EmissiveB = 0.0f;
    float Padding        = 0.0f;
};

/// 📦 Flat material table. `QueryRecords` is the read-only view the geometry stages take; the size is compared
///    against the instance material indices during the matching check.
class MaterialIndex
{
public:
    MaterialIndex() = default;
    explicit MaterialIndex(std::vector<MaterialRecord> Records) noexcept : Records_(std::move(Records)) {}

    const std::vector<MaterialRecord>& QueryRecords() const noexcept { return Records_; }
    std::vector<MaterialRecord>&       EditRecords ()       noexcept { return Records_; }

    std::size_t                        Size () const noexcept { return Records_.size(); }
    bool                               Empty() const noexcept { return Records_.empty(); }
    const MaterialRecord&              At   (std::size_t Slot) const noexcept { return Records_[Slot]; }

private:
    std::vector<MaterialRecord> Records_;
};
} // namespace Frontier
