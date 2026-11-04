/*==========================================================================================================================================
                                                      VEHICLE AUDIO TYPES
                                     ------------------------------------------------------------------
                                 Shared enumerations and small value types for the time-based audio division.
==========================================================================================================================================*/

// 🧩 Vehicle audio types: shared enumerations and small value types for the time-based audio division.

#pragma once

#include <cstdint>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                   FORCED INDUCTION
//------------------------------------------------------------------------------------------------------------------------

enum class InductionKind : uint8_t
{
    NaturallyAspirated = 0,
    Turbocharged       = 1,
    Supercharged       = 2,
    Twincharged        = 3,
    ElectricDrive      = 4,
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  CRANK GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

enum class CrankPlaneKind : uint8_t
{
    EvenFire      = 0,   // geometrically even (flat-plane, 120° V6, V12)
    CrossPlane    = 1,   // irregular firing intervals for burble
    OddFire       = 2,   // V10 72°-ish: half-order warble
    Electric      = 3,   // no crank, inverter carrier instead
};

//------------------------------------------------------------------------------------------------------------------------
//                                                   AUDIO EVENTS
//------------------------------------------------------------------------------------------------------------------------

enum class SecondaryEventKind : uint8_t
{
    GearShift   = 0,
    LimiterCut  = 1,
    OverrunPop  = 2,
    BlowOff     = 3,
    SuperChirp  = 4,
};

struct SecondaryEvent
{
    SecondaryEventKind Kind      = SecondaryEventKind::GearShift;
    float              Intensity = 0;   // [0..1]
    float              BoostBar  = 0;   // [bar] - for BOV
    uint32_t           Gear      = 0;   // [-]
};

} // namespace Frontier
