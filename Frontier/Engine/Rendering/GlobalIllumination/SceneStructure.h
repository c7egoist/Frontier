/*==========================================================================================================================================
                                                           SCENESTRUCTURE.H
==========================================================================================================================================*/
// 🧩 Scene topology runtime — facet sets, occupants, draw runs, the distance list and their device encodings (FacetStructure.js).

#pragma once

#include "TransformProjection.h"

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>

namespace Frontier::GlobalIllumination
{

// 📝 What an occupant takes part in (the demo's OccupantRole; "Role" is barred by SKILL-Naming.md).
namespace OccupantParticipation
{
constexpr uint32_t Raster   = 1u;    // [-] - drawn into the surface projection and the shadow depth
constexpr uint32_t Distance = 2u;    // [-] - unioned into the scene distance field from its own distance volume
constexpr uint32_t Cards    = 4u;    // [-] - owns surface cards in the card depot
constexpr uint32_t Dynamic  = 8u;    // [-] - transform may change every refresh
constexpr uint32_t Fallback = 16u;   // [-] - card-less: a traced hit shades from the packed albedo (FirstCard)
constexpr uint32_t Shredded = 32u;   // [-] - wheel whose tyre rubber is shredded
} // namespace OccupantParticipation

constexpr uint32_t VertexStride    = 32u;     // [B] - position.xyz, family (u32), normal.xyz, occupant offset (u32)
constexpr uint32_t OccupantStride  = 336u;    // [B] - OccupantProfile
constexpr uint32_t IdentityCeiling = 2044u;   // [-] - occupant identities travel through half floats, exact up to 2048

// 📝 The ground tiling the card depot uses for the course plane (GroundLayout in FacetStructure.js).
struct GroundLayoutSpecification
{
    double   PadMinimumX  = -60.0;   // [m]
    double   PadMinimumY  = -60.0;   // [m]
    double   TileExtent   = 12.0;    // [m]
    uint32_t TileCountX   = 18;      // [-]
    uint32_t TileCountY   = 10;      // [-]
    double   OuterExtent  = 240.0;   // [m]
    double   PadDensity   = 6.0;     // [texel/m]
    double   StripDensity = 0.5;     // [texel/m]
};
inline constexpr GroundLayoutSpecification GroundLayout{};

struct FacetEntry
{
    std::array<Vector3, 3> Corners{};          // [m]
    uint32_t               Family         = 0; // [-] material family
    uint32_t               OccupantOffset = 0; // [-] fragmented sets: fragment offset from the anchor
    bool                   NormalsAuthored = false;
    std::array<Vector3, 3> Normals{};
};

struct FacetSet
{
    std::string             Name{};
    std::vector<FacetEntry> Facets{};
    double                  DistanceVoxel  = 0.0;   // [m]
    double                  CardDensity    = 0.0;   // [texel/m]
    Vector3                 LocalMinimum{};         // [m]
    Vector3                 LocalMaximum{};         // [m]
    uint32_t                FirstVertex    = 0;     // [-]
    uint32_t                VertexCount    = 0;     // [-]
    uint32_t                VertexCapacity = 0;     // [-] reserved vertices of a fragmented set
    bool                    Fragmented     = false;   // [-] the demo's fragment-set flag (bit 0)
    int32_t                 VolumeIndex    = -1;    // [-] OccupantDistanceSpace volume, -1 when none
};

// 📝 Placement of one occupant's distance volume inside the occupant distance space (OccupantDistanceSpace volumes).
struct OccupantVolume
{
    uint32_t                FacetSet    = 0;
    double                  VoxelExtent = 0.0;   // [m]
    std::array<uint32_t, 3> Resolution{};        // [texel]
    Vector3                 Minimum{};           // [m] local corner of texel (0,0,0)
    std::array<uint32_t, 3> TexelOrigin{};       // [texel]
};

struct OccupantEntry
{
    std::string Name{};
    uint32_t    FacetSet         = 0;
    uint32_t    Participation    = 0;
    int32_t     MaterialOverride = -1;
    Transform   Current{};
    Transform   Previous{};
    Vector3     CardMinimum{};
    Vector3     CardMaximum{};
    double      CardDensity      = 0.0;
    uint32_t    FirstCard        = 0;
    uint32_t    CardCount        = 0;
    bool        Inactive         = false;
    bool        Fragment         = false;
    bool        Obstacle         = false;
    bool        Breakable        = false;
    std::optional<bool> Moving{};                 // [-] undefined in the demo unless cones/fragments set it
    std::optional<Vector3> LocalMinimum{};        // [m] fragments carry their own bounds
    std::optional<Vector3> LocalMaximum{};
    std::optional<uint32_t> FallbackAlbedo{};
    int32_t     Cone             = -1;
    int32_t     StressSlot       = -1;
    std::optional<Transform> UnionTransform{};    // [-] transform the scene field last unioned (ResolveMovedBounds)
    std::optional<OccupantVolume> Volume{};       // [-] fragment pool volume
};

struct DrawRun
{
    uint32_t FacetSet = 0;
    uint32_t First    = 0;
    uint32_t Count    = 0;
};

class SceneStructure
{
  public:
    // 📝 Loads the scene topology exported from the demo (Scene.facetspace, 'FSP1'); every scalar is float64 on disk.
    bool LoadFacetSpace(const std::filesystem::path& Path, std::string* OutDiagnostic = nullptr);

    void     ConstructDrawRuns();
    bool     ConstructDistanceList();
    [[nodiscard]] uint32_t QueryUnionCount() const noexcept { return static_cast<uint32_t>(DistanceList.size()); }

    [[nodiscard]] std::vector<uint8_t> EncodeVertexStream();
    [[nodiscard]] WorldBounds          QueryWorldBounds(uint32_t Occupant) const;
    [[nodiscard]] std::vector<WorldBounds> QueryObstacleBounds() const;
    void AdvanceOccupantTransform(uint32_t Occupant, const Transform& Next);
    void RetainOccupantTransform(uint32_t Occupant);

    // 📝 336-byte OccupantProfile records for occupants [First, First + Count), volumes from the distance space.
    [[nodiscard]] std::vector<uint8_t> EncodeOccupantRange(const std::vector<OccupantVolume>* Volumes, uint32_t First, uint32_t Count) const;
    [[nodiscard]] std::vector<uint8_t> EncodeOccupantProfiles(const std::vector<OccupantVolume>* Volumes, uint32_t Count) const
    {
        return EncodeOccupantRange(Volumes, 0, Count);
    }

    std::vector<FacetSet>      FacetSets{};
    std::vector<OccupantEntry> Occupants{};
    int32_t                    VehicleBody = -1;
    std::array<int32_t, 4>     VehicleWheels{-1, -1, -1, -1};
    int32_t                    GroundOccupant = -1;
    int32_t                    GroundTilesFirst = -1;
    std::array<int32_t, 4>     GroundStrips{-1, -1, -1, -1};
    uint32_t                   DistanceCount = 0;
    uint32_t                   BaseDistanceCount = 0;
    uint32_t                   DynamicCount = 0;
    uint32_t                   VehicleBodySet = 0;
    uint32_t                   StressFirst = 0;
    uint32_t                   StressCapacity = 0;
    uint32_t                   ConeFirst = 0;
    uint32_t                   ConeCount = 0;
    std::vector<uint32_t>      DistanceList{};
    std::vector<DrawRun>       DrawRuns{};
    std::vector<DrawRun>       ShadowRuns{};
};

} // namespace Frontier::GlobalIllumination
