//============================================================================================================================================
//                                                       IMPACTSPARKLAYOUTS.SLANG
//============================================================================================================================================
// 🧩 CPU/GPU layout for Jolt hard-impact sparks (one 16-byte header and 32 std140-compatible 48-byte records).

#pragma once

static const uint ImpactSparkCapacity = 32u;

struct ImpactSparkRecord
{
    float4 PositionAge;      // xyz [m] impact point, w [s] age
    float4 NormalSpeed;      // xyz outward normal, w [m/s] closing speed
    float4 ColourSize;       // rgb emissive colour, w [m] world-space half size
};

struct ImpactSparkProfile
{
    uint4 Header;            // x active spark count
    ImpactSparkRecord Sparks[ImpactSparkCapacity];
};
