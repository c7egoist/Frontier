/*==========================================================================================================================================
                                                          RENDERINSPECTIONMODES.H
==========================================================================================================================================*/
// 🧩 The renderer's inspection views and distance-field slices, by the names the Render settings page lists.

#pragma once

#include <cstddef>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    RENDER INSPECTION MODES
//------------------------------------------------------------------------------------------------------------------------

struct RenderInspectionModes
{
    static constexpr size_t  ModeCount                    = 15;
    static const char* const ModeNames[ModeCount];
    static constexpr size_t  DistanceCount                = 3;
    static const char* const DistanceNames[DistanceCount];
};

} // namespace Frontier
