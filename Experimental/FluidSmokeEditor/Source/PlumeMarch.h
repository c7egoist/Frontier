#pragma once
/*==========================================================================================================================================
                                                             PLUMEMARCH.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Shaders/PlumeMarch.wgsl (MarchPlume) and Shaders/FireIllumination.wgsl (ResolveFireArrival):
//    the scattering quadrature of the smoke-and-fire lattice at trace resolution — sun, sky, fire light, flame
//    emission and transmittance — plus the fire light that lands on the SDF world's surfaces.

#include "PlumeSpace.h"
#include "SceneDistanceField.h"

#include <cstdint>
#include <vector>

namespace FluidSmoke
{

// 📝 The camera ray source for MarchPlume (the exhibit's FrameDescriptor camera).
struct MarchCamera
{
    Vec3 Position = { 0, 0, 2 };
    Vec3 Forward  = { 1, 0, 0 };
    Vec3 Right    = { 0, 1, 0 };
    Vec3 Up       = { 0, 0, 1 };
    float TanHalfFov = 0.52f;
    float Aspect = 1.6f;
};

// 📝 The environment the march reads (FrameDescriptor's sun/sky terms).
struct MarchEnvironment
{
    Vec3  SunDirection = { 0.3f, 0.2f, 0.93f };
    float SunIlluminance = 12.0f;
    Vec3  SkyZenithRadiance = { 0.35f, 0.45f, 0.65f };
    Vec3  SkyHorizonRadiance = { 0.25f, 0.28f, 0.38f };
    float SkyScale = 1.0f;
    Vec3  NightSkyRadiance = { 0, 0, 0 };
};

// 📝 Premultiplied result per trace pixel: rgb radiance, a transmittance (composited before antialiasing by the
//    recombination in the exhibit; here composited over the software frame directly).
struct PlumeMarchResult
{
    int Width = 0, Height = 0;
    std::vector<Vec4> Pixels;   // [Width*Height] premultiplied radiance + transmittance
};

// 📝 MarchPlume: per trace pixel, the camera ray is clipped to the coverage box the transport wrote and to the
//    opaque surface (the course plane), then marched at about one sample per cell.
[[nodiscard]] PlumeMarchResult MarchPlume(const PlumeSpace& Space, const MarchCamera& Camera,
                                          const MarchEnvironment& Environment,
                                          const SceneDistanceField* Field,
                                          int Width, int Height, uint32_t FrameIndex) noexcept;

// 📝 FireIllumination.wgsl ResolveFireArrival: a burning tyre as a point light on the scene — inverse-square,
//    windowed to its reach, shadowed through the scene distance field.
struct FireArrival
{
    Vec3 Direction = { 0, 0, 1 };   // [-]  toward the fire
    Vec3 Illuminance = { 0, 0, 0 }; // [-]  arriving at normal incidence, shadowed and windowed
};

[[nodiscard]] FireArrival ResolveFireArrival(const SceneDistanceField& Field, const Vec3& Position, const Vec3& Normal,
                                             const Vec3& FirePosition, float FireIntensity, const Vec3& FireColour,
                                             float FireReach) noexcept;

} // namespace FluidSmoke
