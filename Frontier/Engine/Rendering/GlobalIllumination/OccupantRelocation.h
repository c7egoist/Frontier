/*==========================================================================================================================================
                                                           OCCUPANTRELOCATION.H
==========================================================================================================================================*/
// 🧩 Editor placements of the scene's occupants, beyond the demo: the level's geometry objects move, hide and re-lay the
//    proving ground's static occupants between refreshes, and every step that reads an occupant follows.

#pragma once

#include "TransformProjection.h"

#include <cstdint>
#include <vector>

namespace Frontier::GlobalIllumination
{

class IlluminationHost;

//------------------------------------------------------------------------------------------------------------------------
//                                                    TYPES
//------------------------------------------------------------------------------------------------------------------------

// 📝 One occupant as the editor places it: its world transform, and whether it takes part (drawn, traced, unioned, lit).
struct OccupantPlacement
{
    uint32_t  Occupant = 0;
    Transform Current{};
    bool      Active   = true;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    RELOCATION
//------------------------------------------------------------------------------------------------------------------------

// 📝 Applies placements between refreshes and returns how many occupants changed. A moved occupant keeps the transform it had
//    at the last refresh as its previous one, so the next refresh carries its motion (the refresh after settles it); a changed
//    activity rebuilds the draw runs and the card tile lists; the distance field is invalidated over the old and the new
//    bounds; the moved occupants' cards relight first; the lamps follow their heads and lanterns.
uint32_t RelocateOccupants(IlluminationHost& Host, const std::vector<OccupantPlacement>& Placements);

} // namespace Frontier::GlobalIllumination
