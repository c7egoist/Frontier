//============================================================================================================================================
//                                                     CHASECAMERASOLVER.CPP
//============================================================================================================================================
#include "ChaseCameraSolver.h"
#include <cmath>
#include <algorithm>

namespace Frontier {
namespace Drive {

ChaseCameraSolver::ChaseCameraSolver() noexcept
    : CameraProjection(), Config{} {}

ChaseCameraSolver::ChaseCameraSolver(const ChaseCameraConfiguration& InitialConfig) noexcept
    : CameraProjection(), Config(InitialConfig) {}

// Yaw/pitch that make ForwardVector point from the eye at AimPoint. Matches CameraProjection's convention:
//    ForwardVector = { sinYaw·cosPitch, cosYaw·cosPitch, sinPitch } in a +Z-up world (forward default +Y).
void ChaseCameraSolver::OrientToward(const Vector3& AimPoint) noexcept
{
    Vector3 d = AimPoint - SpatialLocation;
    const float len = std::sqrt(d.x*d.x + d.y*d.y + d.z*d.z);
    if (len < 1e-5f) return;
    d = d / len;
    const float pitch = std::asin(std::clamp(d.z, -1.0f, 1.0f));
    const float yaw   = std::atan2(d.x, d.y);
    AssignOrientationEuler(pitch, yaw, 0.0f);   // rebuilds Forward/Right/Up
}

void ChaseCameraSolver::SnapTo(const Vector3& TargetPosition, const Vector3& TargetForward) noexcept
{
    const Vector3 idealEye{
        TargetPosition.x - TargetForward.x * Config.FollowDistance,
        TargetPosition.y - TargetForward.y * Config.FollowDistance,
        TargetPosition.z - TargetForward.z * Config.FollowDistance + Config.FollowHeight };
    AssignSpatialLocation(idealEye);
    Vector3 aim = TargetPosition; aim.z += Config.LookAtHeight;
    OrientToward(aim);
    AssignFieldOfView(Config.BaseFieldOfView);
    Seeded = true;
}

void ChaseCameraSolver::AdvanceChase(const Vector3& TargetPosition, const Vector3& TargetForward,
                                     float SpeedMetresPerSecond, float DeltaSeconds) noexcept
{
    if (!Seeded) { SnapTo(TargetPosition, TargetForward); return; }
    if (DeltaSeconds <= 0.0f) return;

    // Ideal eye: behind the car along its forward, lifted by FollowHeight.
    const Vector3 idealEye{
        TargetPosition.x - TargetForward.x * Config.FollowDistance,
        TargetPosition.y - TargetForward.y * Config.FollowDistance,
        TargetPosition.z - TargetForward.z * Config.FollowDistance + Config.FollowHeight };

    // Critically-damped exponential follow (frame-rate independent).
    const float a = 1.0f - std::exp(-Config.PositionSpring * DeltaSeconds);
    const Vector3 eye{
        SpatialLocation.x + (idealEye.x - SpatialLocation.x) * a,
        SpatialLocation.y + (idealEye.y - SpatialLocation.y) * a,
        SpatialLocation.z + (idealEye.z - SpatialLocation.z) * a };
    AssignSpatialLocation(eye);

    Vector3 aim = TargetPosition; aim.z += Config.LookAtHeight;
    OrientToward(aim);

    // Speed-reactive FOV.
    const float k = std::clamp(SpeedMetresPerSecond / std::max(1.0f, Config.SpeedForFullFov), 0.0f, 1.0f);
    AssignFieldOfView(Config.BaseFieldOfView + Config.SpeedFieldOfView * k);
}

void ChaseCameraSolver::AdvanceProjection(float DeltaSeconds) noexcept { (void)DeltaSeconds; }

} // namespace Drive
} // namespace Frontier
