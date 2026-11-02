/*==========================================================================================================================================
                                                               METRICTILES.H
==========================================================================================================================================*/
// 🧩 .co-kpis: equal metric tiles (label, figure, caption), the last one lit.

#pragma once

#include <string>

namespace Frontier
{

class ControlColumn;

//------------------------------------------------------------------------------------------------------------------------
//                                                    METRIC TILES
//------------------------------------------------------------------------------------------------------------------------

struct MetricTile
{
    std::string Label{};
    std::string Figure{};
    std::string Unit{};
};

class MetricTiles
{
  public:
    static void Construct(ControlColumn& Column, const MetricTile* Metrics, int Count);
};

} // namespace Frontier
