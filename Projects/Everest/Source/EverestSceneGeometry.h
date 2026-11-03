/*==========================================================================================================================================
                                                          EVERESTSCENEGEOMETRY.H
==========================================================================================================================================*/
// 🧩 Project Everest's scene geometry: binds the level's Geometry records to the proving ground's occupants by name, resolves
//    each record's transform and modifier stack into occupant placements for the viewport, and reports what each resolved to.

#pragma once

#include "Frontier/Engine/Rendering/GlobalIllumination/OccupantRelocation.h"
#include "Frontier/Engine/Rendering/GlobalIllumination/SceneStructure.h"
#include "Frontier/Engine/Scene/GeometryLayout.h"
#include "Frontier/Engine/Scene/SceneWorld.h"

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace Everest
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    TYPES
//------------------------------------------------------------------------------------------------------------------------

using GeometryResolutions = std::unordered_map<uint64_t, Frontier::GeometryConfiguration::Resolution>;

// 📝 Tolerances under which a resolved copy is the archive's own placement (the record still shows the archive exactly).
constexpr double GeometryLinearTolerance = 2.0e-4;   // [-] rotation-scale elements
constexpr double GeometryMetreTolerance  = 2.0e-3;   // [m]

//------------------------------------------------------------------------------------------------------------------------
//                                                    NAMES
//------------------------------------------------------------------------------------------------------------------------

// 📝 The demo's material families (MaterialSpecification.js CourseMaterial), index-aligned; "Family N" past the table.
[[nodiscard]] std::string ResolveFamilyName(uint32_t Family);

// 📝 An occupant name matches a stem alone, the stem and digits ("Tunnel lamp N" + "0"), or the stem, one space and one token
//    that carries a digit or is one capital letter ("Boundary North -58", "Concrete pillar A"; not "Control tower cabin").
[[nodiscard]] bool MatchOccupantStem(std::string_view Name, std::string_view Stem) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                    SCENE GEOMETRY OCCUPANCY
//------------------------------------------------------------------------------------------------------------------------

class SceneGeometryOccupancy
{
  public:
    // 📝 Takes the loaded scene (its occupants' transforms as loaded are the archive's) and the material records; the next
    //    ResolvePlacements binds every record and places all of their occupants. A null scene unbinds everything.
    void Reset(const Frontier::GlobalIllumination::SceneStructure* Scene, std::vector<uint8_t> MaterialProfiles);

    // 📝 The placements of every Geometry record whose configuration changed since the last call (all of them after Reset), and
    //    the archive placements back for the occupants of records that left the level.
    [[nodiscard]] std::vector<Frontier::GlobalIllumination::OccupantPlacement> ResolvePlacements(const Frontier::SceneWorld& World);

    // 📝 What every record resolved to, replaced whenever any record changed (QueryGeneration advances with it).
    [[nodiscard]] std::shared_ptr<const GeometryResolutions> QueryResolutions() const noexcept { return Snapshot_; }
    [[nodiscard]] uint64_t                                   QueryGeneration() const noexcept { return Generation_; }

    // 📝 The archive transform of an occupant as the scene loaded it.
    [[nodiscard]] const Frontier::PlacementMatrix* QueryArchiveTransform(uint32_t Occupant) const noexcept;

  private:
    struct Occupancy
    {
        std::string                            Signature{};          // [-] stems and range it was bound with
        uint64_t                               Revision = ~0ull;     // [-] configuration revision last resolved
        std::vector<std::vector<uint32_t>>     Parts{};              // [-] [part][placement] occupant
        std::vector<Frontier::PlacementMatrix> Anchors{};            // [-] [placement] part 0's archive transform
        std::array<double, 3>                  Extent{};             // [m] part 0's local bounds
        Frontier::GeometryConfiguration::Resolution Resolution{};
        bool                                   Present = false;      // [-] seen in this resolution pass
    };

    void Bind(Occupancy& Entry, const Frontier::GeometryConfiguration& Configuration) const;
    void Resolve(Occupancy& Entry, const Frontier::GeometryConfiguration& Configuration,
                 std::vector<Frontier::GlobalIllumination::OccupantPlacement>& Placements) const;

    const Frontier::GlobalIllumination::SceneStructure* Scene_ = nullptr;
    std::vector<uint8_t>                                Materials_{};
    std::vector<Frontier::PlacementMatrix>              Archive_{};        // [-] every occupant's transform as loaded
    std::vector<std::vector<uint32_t>>                  SetFamilies_{};    // [-] material families of each facet set
    std::unordered_map<uint64_t, Occupancy>             Occupancies_{};
    std::shared_ptr<const GeometryResolutions>          Snapshot_ = std::make_shared<const GeometryResolutions>();
    uint64_t                                            Generation_ = 0;
};

} // namespace Everest
