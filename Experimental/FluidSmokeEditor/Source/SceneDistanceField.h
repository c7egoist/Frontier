#pragma once
/*==========================================================================================================================================
                                                          SCENEDISTANCEFIELD.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of the scene (global) distance field the plume interacts with — the CPU counterpart of
//    Experimental/VehicleHmiPrototype/Source/SceneDistanceSpace.js + DistanceTraversal.wgsl's sampling contract.
//
//    The exhibit's field is four camera-centred toroidal cascades rewritten where invalidated; the C++ port keeps
//    the same contract — SampleSceneDistance(Position) → (distance, cascade level, occupant identity) — evaluated
//    analytically for the Proving Grounds: the course plane and the dynamic occupants (the ControlVehicle and any
//    stress props) as oriented boxes. A moving occupant's point velocity is the displacement of the material point
//    now at Position since the previous frame's transform, over that frame (PlumeAdvection.wgsl ResolveSolid).

#include "PlumeMath.h"

#include <array>
#include <cstdint>
#include <vector>

namespace FluidSmoke
{

constexpr uint32_t RoleDynamic = 1u << 0;   // OccupantRecord.Roles & RoleDynamic — from FacetStructure.js OccupantRole
constexpr uint32_t IdentityCeiling = 64;    // [-] at most one union-list entry per identity

// 📝 OccupantRecord: the world and previous-frame transforms of one scene occupant (an SDF box).
struct OccupantRecord
{
    uint32_t Roles = 0u;
    Quat Orientation       = { 0.0f, 0.0f, 0.0f, 1.0f };   // current local-to-world rotation
    Vec3 Position          = { 0.0f, 0.0f, 0.0f };          // current world centre
    Vec3 HalfExtents       = { 1.0f, 1.0f, 1.0f };          // [m] box half extents in local space
    Quat PreviousOrientation = { 0.0f, 0.0f, 0.0f, 1.0f };  // previous frame's rotation
    Vec3 PreviousPosition    = { 0.0f, 0.0f, 0.0f };       // previous frame's centre
};

struct DistanceSample
{
    float Distance = 0.0f;      // [m] signed distance; >= 0 outside, < 0 inside
    uint32_t Level = 0;         // [-] finest cascade that would hold the sample
    uint32_t Identity = IdentityCeiling;   // [-] occupant the sample is inside, IdentityCeiling in open air
};

// 📝 The Proving Grounds distance field: a course plane at FloorHeight plus oriented-box occupants.
//    Cascade levels follow the exhibit: voxel 0.125 m doubling per level, four clips.
class SceneDistanceField
{
  public:
    explicit SceneDistanceField(float FloorHeight = -0.5f) : Floor(FloorHeight) {}

    void AssignFloorHeight(float FloorHeight) noexcept { Floor = FloorHeight; }
    [[nodiscard]] float QueryFloorHeight() const noexcept { return Floor; }

    void AssignOccupants(std::vector<OccupantRecord> Updated) noexcept { Occupants = std::move(Updated); }
    [[nodiscard]] const std::vector<OccupantRecord>& QueryOccupants() const noexcept { return Occupants; }
    [[nodiscard]] std::vector<OccupantRecord>& AccessOccupants() noexcept { return Occupants; }

    // 📝 SampleSceneDistance: the signed distance, the finest cascade level, and the occupant identity.
    [[nodiscard]] DistanceSample Sample(const Vec3& Position) const noexcept;

    // 📝 ResolveClipIdentity: the occupant a position lies in, IdentityCeiling in open air.
    [[nodiscard]] uint32_t ResolveClipIdentity(const Vec3& Position) const noexcept;

    // 📝 Point velocity of a moving occupant at Position: displacement of the material point now at Position
    //    since the previous frame's transform, over FrameSeconds (clamped to the speed ceiling).
    [[nodiscard]] Vec3 ResolveOccupantVelocity(uint32_t Identity, const Vec3& Position, float FrameSeconds) const noexcept;

    // 📝 TraverseSceneShadow (DistanceTraversal.wgsl): 1 when the segment from Origin toward Direction is lit,
    //    0 when it enters the course plane or an occupant.
    [[nodiscard]] float TraverseShadow(const Vec3& Origin, const Vec3& Direction, float Start, float End) const noexcept;

  private:
    [[nodiscard]] float SampleOccupant(const OccupantRecord& Occupant, const Vec3& Position) const noexcept;

    float Floor = -0.5f;
    std::vector<OccupantRecord> Occupants;
};

} // namespace FluidSmoke
