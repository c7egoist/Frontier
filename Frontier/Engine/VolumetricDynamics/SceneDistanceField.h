#pragma once
/*==========================================================================================================================================
                                                        SCENEDISTANCEFIELD.H
==========================================================================================================================================*/
// 🧩 CPU stand-in for DistanceTraversal.wgsl SampleSceneDistance: analytic course plane unioned with occupant boxes.
//    ResolveSolid in PlumeAdvection.wgsl samples this field; moving occupants donate their point velocity.

#include "Frontier/Engine/VolumetricDynamics/PlumeMath.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeRecords.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

namespace Frontier
{

constexpr uint32_t RoleDynamic = 1u;

struct OccupantRecord
{
    PlumeVec3 Centre{};
    PlumeVec3 HalfExtent{ 2.05f, 0.95f, 0.62f };
    PlumeVec3 Velocity{};
    uint32_t  Roles = RoleDynamic;
    uint32_t  Identity = 0;
};

struct SceneDistanceField
{
    float GroundHeight = 0.0f;
    unsigned ClipCount = 0;
    std::vector<OccupantRecord> Occupants;

    // 📝 Returns (distance, clip-or-occupant identity) matching SampleSceneDistance's vec2f.
    [[nodiscard]] std::array<float, 2> Sample(PlumeVec3 Position) const
    {
        float Distance = Position.Z - GroundHeight;
        float Identity = static_cast<float>(ClipCount);
        for (const OccupantRecord& Occupant : Occupants)
        {
            const PlumeVec3 Local = { std::fabs(Position.X - Occupant.Centre.X) - Occupant.HalfExtent.X,
                                      std::fabs(Position.Y - Occupant.Centre.Y) - Occupant.HalfExtent.Y,
                                      std::fabs(Position.Z - Occupant.Centre.Z) - Occupant.HalfExtent.Z };
            const PlumeVec3 Outside = { std::max(Local.X, 0.0f), std::max(Local.Y, 0.0f), std::max(Local.Z, 0.0f) };
            const float Box = PlumeLength(Outside) + std::min(std::max(Local.X, std::max(Local.Y, Local.Z)), 0.0f);
            if (Box < Distance)
            {
                Distance = Box;
                Identity = static_cast<float>(Occupant.Identity);
            }
        }
        return { Distance, Identity };
    }

    [[nodiscard]] PlumeVec4 ResolveSolid(PlumeVec3 Position, float Edge, float FrameSeconds) const
    {
        constexpr float VelocitySolidReach = 0.0f;
        const std::array<float, 2> Sampled = Sample(Position);
        if (Sampled[0] >= VelocitySolidReach * Edge)
            return { 0.0f, 0.0f, 0.0f, 0.0f };
        PlumeVec3 Velocity{};
        const unsigned Identity = static_cast<unsigned>(Sampled[1] + 0.5f);
        if (Identity < Occupants.size() && FrameSeconds > 0.0f)
        {
            const OccupantRecord& Occupant = Occupants[Identity];
            if ((Occupant.Roles & RoleDynamic) != 0u)
            {
                Velocity = Occupant.Velocity;
                const float Speed = PlumeLength(Velocity);
                if (Speed > PlumeSpeedCeiling)
                    Velocity = Velocity * (PlumeSpeedCeiling / Speed);
            }
        }
        return { Velocity.X, Velocity.Y, Velocity.Z, 1.0f };
    }
};

} // namespace Frontier
