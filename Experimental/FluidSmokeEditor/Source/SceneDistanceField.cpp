/*==========================================================================================================================================
                                                          SCENEDISTANCEFIELD.CPP
==========================================================================================================================================*/

#include "SceneDistanceField.h"
#include "PlumeRecords.h"

#include <algorithm>
#include <cmath>

namespace FluidSmoke
{

namespace
{

// 📝 Signed distance of a world point to an oriented box (centre + yaw/pitch/roll quaternion + half extents).
float BoxSdf(const Vec3& Centre, const Quat& Orientation, const Vec3& HalfExtents, const Vec3& Position)
{
    // world → local: rotate by the inverse (conjugate) of the orientation quaternion
    const Quat Conj = { -Orientation[0], -Orientation[1], -Orientation[2], Orientation[3] };
    const Vec3 Local = RotateVector(Conj, SubtractVector(Position, Centre));
    const Vec3 Q = { std::abs(Local[0]) - HalfExtents[0], std::abs(Local[1]) - HalfExtents[1], std::abs(Local[2]) - HalfExtents[2] };
    const float Outside = Length({ std::max(Q[0], 0.0f), std::max(Q[1], 0.0f), std::max(Q[2], 0.0f) });
    const float Inside = std::min(std::max(Q[0], std::max(Q[1], Q[2])), 0.0f);
    return Outside + Inside;
}

} // namespace

float SceneDistanceField::SampleOccupant(const OccupantRecord& Occupant, const Vec3& Position) const noexcept
{
    return BoxSdf(Occupant.Position, Occupant.Orientation, Occupant.HalfExtents, Position);
}

DistanceSample SceneDistanceField::Sample(const Vec3& Position) const noexcept
{
    DistanceSample Sampled{};
    Sampled.Distance = Position[2] - Floor;   // the course plane
    Sampled.Level = 0;
    Sampled.Identity = IdentityCeiling;
    float Best = Sampled.Distance;
    for (uint32_t Index = 0; Index < Occupants.size() && Index < IdentityCeiling; ++Index)
    {
        const float D = SampleOccupant(Occupants[Index], Position);
        if (D < Best)
        {
            Best = D;
            Sampled.Identity = Index;
        }
    }
    Sampled.Distance = Best;
    // 📝 The finest cascade that holds the sample: 0.125 m voxels doubling per level, four clips.
    const float Voxel = 0.125f;
    uint32_t Level = 0;
    for (; Level < 3; ++Level)
        if (std::abs(Best) < 8.0f * Voxel * (1u << Level))
            break;
    Sampled.Level = Level;
    return Sampled;
}

uint32_t SceneDistanceField::ResolveClipIdentity(const Vec3& Position) const noexcept
{
    for (uint32_t Index = 0; Index < Occupants.size() && Index < IdentityCeiling; ++Index)
        if (SampleOccupant(Occupants[Index], Position) < 0.0f)
            return Index;
    return IdentityCeiling;
}

Vec3 SceneDistanceField::ResolveOccupantVelocity(uint32_t Identity, const Vec3& Position, float FrameSeconds) const noexcept
{
    if (Identity >= Occupants.size() || FrameSeconds <= 0.0f)
        return { 0.0f, 0.0f, 0.0f };
    const OccupantRecord& Occupant = Occupants[Identity];
    // 📝 The material point now at Position, expressed in the previous frame's local space, then moved back to
    //    world by the previous transform: its displacement over the frame is the point velocity.
    const Quat Conj = { -Occupant.Orientation[0], -Occupant.Orientation[1], -Occupant.Orientation[2], Occupant.Orientation[3] };
    const Vec3 Local = RotateVector(Conj, SubtractVector(Position, Occupant.Position));
    const Vec3 Prior = AddVector(Occupant.PreviousPosition, RotateVector(Occupant.PreviousOrientation, Local));
    Vec3 Velocity = ScaleVector(SubtractVector(Position, Prior), 1.0f / FrameSeconds);
    const float Speed = Length(Velocity);
    if (Speed > PlumeSpeedCeiling)
        Velocity = ScaleVector(Velocity, PlumeSpeedCeiling / Speed);
    return Velocity;
}

float SceneDistanceField::TraverseShadow(const Vec3& Origin, const Vec3& Direction, float Start, float End) const noexcept
{
    // 📝 Coarse sphere-traced segment test against the plane and the occupants.
    const float Step = 0.05f;
    for (float T = Start; T < End; T += Step)
    {
        const Vec3 P = AddVector(Origin, ScaleVector(Direction, T));
        if (Sample(P).Distance < 0.0f)
            return 0.0f;
    }
    return 1.0f;
}

} // namespace FluidSmoke
