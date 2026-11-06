#pragma once
/*==========================================================================================================================================
                                                             PLUMERECORDS.H
==========================================================================================================================================*/
// 🧩 PlumeRecord layout, toroidal addressing and source weight from Shader/PlumeRecords.wgsl.

#include "Frontier/Engine/VolumetricDynamics/PlumeMath.h"

#include <array>
#include <cstdint>

namespace Frontier
{

constexpr float PlumeSpeedCeiling = 40.0f;
constexpr int   PlumeRecordWords  = 64;
constexpr int   SourceStride      = 12;
constexpr int   SourceCapacity    = 24;
constexpr int   FireLightLimit    = 4;
constexpr int   RestartOrigin     = 1 << 24;
constexpr float FloorHeight       = -0.5f;
constexpr float FlameScale        = 80.0f;
constexpr float StepSeconds       = 1.0f / 60.0f;
constexpr float StepCeiling       = 1.0f / 30.0f;
constexpr float FadeCeiling       = 12.0f;
constexpr int   DetailExtent      = 32;

struct PlumeRecord
{
    int   VelocityOrigin[4]      = {};
    int   PriorVelocityOrigin[4] = {};
    unsigned VelocityExtent[4]   = {};
    unsigned ThermoExtent[4]     = {};
    float Lattice[4]             = {};
    float Forces[4]              = {};
    float Retention[4]           = {};
    float Wind[4]                = {};
    float SourceMinimum[4]       = {};
    float SourceMaximum[4]       = {};
    float Optical[4]             = {};
    float Sun[4]                 = {};
    float Combustion[4]          = {};
    float Scattering[4]          = {};
    float Detail[4]              = {};
    float Flame[4]               = {};
};

static_assert(sizeof(PlumeRecord) == 256, "PlumeRecord is sixteen vec4 = 256 bytes");

struct PlumeSource
{
    PlumeVec4 PositionRadius;
    PlumeVec4 Velocity;
    PlumeVec4 Rates;
};

struct FireLight
{
    PlumeVec3 Position;
    float     Radius = 0.0f;
    PlumeVec3 Radiance;
};

inline int WrapLatticeAxis(int Cell, int Extent)
{
    return PlumeWrap(Cell, Extent);
}

inline std::array<int, 3> WrapLattice(int X, int Y, int Z, const unsigned Extent[3])
{
    return { WrapLatticeAxis(X, static_cast<int>(Extent[0])),
             WrapLatticeAxis(Y, static_cast<int>(Extent[1])),
             Z };
}

inline std::array<int, 3> ResolveVelocityTexel(const PlumeRecord& Plume, int LX, int LY, int LZ)
{
    return WrapLattice(Plume.VelocityOrigin[0] + LX, Plume.VelocityOrigin[1] + LY, LZ, Plume.VelocityExtent);
}

inline std::array<int, 3> ResolveThermoTexel(const PlumeRecord& Plume, int LX, int LY, int LZ)
{
    return WrapLattice(2 * Plume.VelocityOrigin[0] + LX, 2 * Plume.VelocityOrigin[1] + LY, LZ, Plume.ThermoExtent);
}

inline PlumeVec3 ProjectVelocityWorld(const PlumeRecord& Plume, unsigned LX, unsigned LY, unsigned LZ)
{
    const float CellX = static_cast<float>(Plume.VelocityOrigin[0] + static_cast<int>(LX)) + 0.5f;
    const float CellY = static_cast<float>(Plume.VelocityOrigin[1] + static_cast<int>(LY)) + 0.5f;
    const float CellZ = static_cast<float>(LZ) + 0.5f;
    return { CellX * Plume.Lattice[1], CellY * Plume.Lattice[1], Plume.Lattice[2] + CellZ * Plume.Lattice[1] };
}

inline PlumeVec3 ProjectThermoWorld(const PlumeRecord& Plume, unsigned LX, unsigned LY, unsigned LZ)
{
    const float CellX = static_cast<float>(2 * Plume.VelocityOrigin[0] + static_cast<int>(LX)) + 0.5f;
    const float CellY = static_cast<float>(2 * Plume.VelocityOrigin[1] + static_cast<int>(LY)) + 0.5f;
    const float CellZ = static_cast<float>(LZ) + 0.5f;
    return { CellX * Plume.Lattice[0], CellY * Plume.Lattice[0], Plume.Lattice[2] + CellZ * Plume.Lattice[0] };
}

inline PlumeVec3 ProjectVelocityCoordinates(const PlumeRecord& Plume, PlumeVec3 Position)
{
    const float SpanX = static_cast<float>(Plume.VelocityExtent[0]) * Plume.Lattice[1];
    const float SpanY = static_cast<float>(Plume.VelocityExtent[1]) * Plume.Lattice[1];
    const float SpanZ = static_cast<float>(Plume.VelocityExtent[2]) * Plume.Lattice[1];
    return { Position.X / SpanX, Position.Y / SpanY, (Position.Z - Plume.Lattice[2]) / SpanZ };
}

inline PlumeVec3 ProjectThermoCoordinates(const PlumeRecord& Plume, PlumeVec3 Position)
{
    const float SpanX = static_cast<float>(Plume.ThermoExtent[0]) * Plume.Lattice[0];
    const float SpanY = static_cast<float>(Plume.ThermoExtent[1]) * Plume.Lattice[0];
    const float SpanZ = static_cast<float>(Plume.ThermoExtent[2]) * Plume.Lattice[0];
    return { Position.X / SpanX, Position.Y / SpanY, (Position.Z - Plume.Lattice[2]) / SpanZ };
}

inline bool ClassifyWindowInterior(PlumeVec3 Position, int OriginX, int OriginY, int OriginZ,
                                   const unsigned Extent[3], float Edge, float Floor)
{
    const float LocalX = Position.X / Edge - static_cast<float>(OriginX);
    const float LocalY = Position.Y / Edge - static_cast<float>(OriginY);
    const float LocalZ = (Position.Z - Floor) / Edge;
    (void)OriginZ;
    const float Ex = static_cast<float>(Extent[0]);
    const float Ey = static_cast<float>(Extent[1]);
    const float Ez = static_cast<float>(Extent[2]);
    return LocalX >= 0.5f && LocalY >= 0.5f && LocalZ >= 0.5f
        && LocalX <= Ex - 0.5f && LocalY <= Ey - 0.5f && LocalZ <= Ez - 0.5f;
}

inline bool ClassifyPriorVelocity(const PlumeRecord& Plume, PlumeVec3 Position)
{
    return ClassifyWindowInterior(Position, Plume.PriorVelocityOrigin[0], Plume.PriorVelocityOrigin[1],
                                  Plume.PriorVelocityOrigin[2], Plume.VelocityExtent, Plume.Lattice[1], Plume.Lattice[2]);
}

inline bool ClassifyPriorThermo(const PlumeRecord& Plume, PlumeVec3 Position)
{
    const unsigned Extent[3] = { Plume.ThermoExtent[0], Plume.ThermoExtent[1], Plume.ThermoExtent[2] };
    return ClassifyWindowInterior(Position, 2 * Plume.PriorVelocityOrigin[0], 2 * Plume.PriorVelocityOrigin[1], 0,
                                  Extent, Plume.Lattice[0], Plume.Lattice[2]);
}

inline bool ClassifySourceBounds(const PlumeRecord& Plume, PlumeVec3 Position)
{
    return Plume.PriorVelocityOrigin[3] > 0
        && Position.X >= Plume.SourceMinimum[0] && Position.Y >= Plume.SourceMinimum[1] && Position.Z >= Plume.SourceMinimum[2]
        && Position.X <= Plume.SourceMaximum[0] && Position.Y <= Plume.SourceMaximum[1] && Position.Z <= Plume.SourceMaximum[2];
}

inline float ResolveSourceWeight(const PlumeSource& Source, PlumeVec3 Position, float Edge)
{
    const float Radius = std::max(Source.PositionRadius.W, 0.75f * Edge);
    const PlumeVec3 Offset = (Position - PlumeVec3{ Source.PositionRadius.X, Source.PositionRadius.Y,
                                                    Source.PositionRadius.Z + 0.55f * Edge }) * (1.0f / Radius);
    const float Squared = PlumeDot(Offset, Offset);
    return Squared > 12.25f ? 0.0f : std::exp(-1.7f * Squared);
}

} // namespace Frontier
