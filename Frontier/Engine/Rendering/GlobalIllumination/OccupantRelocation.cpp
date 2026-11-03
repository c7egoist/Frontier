/*==========================================================================================================================================
                                                          OCCUPANTRELOCATION.CPP
==========================================================================================================================================*/
// 🧩 Editor placements of the scene's occupants, beyond the demo: the level's geometry objects move, hide and re-lay the
//    proving ground's static occupants between refreshes, and every step that reads an occupant follows.

#include "OccupantRelocation.h"

#include "IlluminationHost.h"

#include <algorithm>

namespace Frontier::GlobalIllumination
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    RELOCATION
//------------------------------------------------------------------------------------------------------------------------

uint32_t RelocateOccupants(IlluminationHost& Host, const std::vector<OccupantPlacement>& Placements)
{
    SceneStructure&          Scene = Host.Scene;
    std::vector<WorldBounds> Invalidated;
    std::vector<uint32_t>    Moved;
    bool                     ActivityChanged = false;
    bool                     LampsChanged    = false;
    uint32_t                 Changed         = 0;
    for (const OccupantPlacement& Placement : Placements)
    {
        if (Placement.Occupant >= Scene.Occupants.size()) continue;
        OccupantEntry& Occupant  = Scene.Occupants[Placement.Occupant];
        const bool     Inactive  = !Placement.Active;
        const bool     Relocated = Occupant.Current != Placement.Current;
        if (!Relocated && Occupant.Inactive == Inactive) continue;
        ++Changed;
        // 📝 The distance field holds the occupant where it was unioned: both the old and the new bounds are rebuilt.
        const bool Unioned = (Occupant.Participation & OccupantParticipation::Distance) != 0;
        if (Unioned && !Occupant.Inactive) Invalidated.push_back(Scene.QueryWorldBounds(Placement.Occupant));
        if (Relocated)
        {
            const bool Pending = std::find(Host.RelocatedOccupants.begin(), Host.RelocatedOccupants.end(), Placement.Occupant) !=
                                 Host.RelocatedOccupants.end();
            if (!Pending)
            {
                Occupant.Previous = Occupant.Current;
                Host.RelocatedOccupants.push_back(Placement.Occupant);
            }
            Occupant.Current = Placement.Current;
            if (Occupant.UnionTransform) Occupant.UnionTransform = Placement.Current;
            Moved.push_back(Placement.Occupant);
        }
        if (Occupant.Inactive != Inactive)
        {
            Occupant.Inactive = Inactive;
            ActivityChanged   = true;
            if (std::find(Host.RelocatedOccupants.begin(), Host.RelocatedOccupants.end(), Placement.Occupant) == Host.RelocatedOccupants.end())
                Host.RelocatedOccupants.push_back(Placement.Occupant);
        }
        if (Unioned && !Occupant.Inactive) Invalidated.push_back(Scene.QueryWorldBounds(Placement.Occupant));
        LampsChanged = LampsChanged || Occupant.Name.rfind("Light pole head ", 0) == 0 || Occupant.Name.rfind("Point lamp lantern ", 0) == 0;
    }
    if (Changed == 0) return 0;
    if (ActivityChanged)
    {
        Scene.ConstructDrawRuns();
        if (Host.Cards) Host.Cards->RebuildTileLists(Scene);
    }
    if (Host.Distance && !Invalidated.empty()) Host.Distance->InvalidateBounds(Invalidated);
    if (Host.Cards && !Moved.empty()) Host.Cards->WarmOccupants(Scene, Moved, 3);
    if (LampsChanged) Host.ResolveLampPlacements();
    return Changed;
}

} // namespace Frontier::GlobalIllumination
