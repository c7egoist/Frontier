//============================================================================================================================================
//                                                 GLOBALDISTANCEFIELDSPACE.H
//============================================================================================================================================
// 📦 World-space composite distance field volume accelerating scene-wide ray marching and coarse visibility queries.

#pragma once

#if defined(_MSC_VER)
    #pragma warning(disable: 4324)                              // Disable structure padding alignment warning under /WX
#endif

#include "DistanceFieldSpace.h"
#include <vector>
#include <memory>
#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                           MESH DISTANCE FIELD PLACEMENT
//------------------------------------------------------------------------------------------------------------------------

struct DistanceFieldPlacement
{
    Vector3                 WorldTranslation;                   // [m] world translation coordinate
    Vector3                 WorldScale        = { 1.0f, 1.0f, 1.0f }; // [-] axis-aligned scale factor
    Vector3                 WorldBoundMin;                      // [m] transformed axis-aligned bounding minimum
    Vector3                 WorldBoundMax;                      // [m] transformed axis-aligned bounding maximum
    const DistanceFieldSpace* LocalField      = nullptr;        // [-] reference to local object-space distance field
    uint32_t                InstanceIdentity  = 0u;             // [-] unique placement identifier
};

//------------------------------------------------------------------------------------------------------------------------
//                                           GLOBAL DISTANCE FIELD SPACE
//------------------------------------------------------------------------------------------------------------------------

class GlobalDistanceFieldSpace
{
public:
    GlobalDistanceFieldSpace() noexcept = default;

    GlobalDistanceFieldSpace(uint32_t InResolutionX,
                             uint32_t InResolutionY,
                             uint32_t InResolutionZ,
                             Vector3 InWorldBoundingMinimum,
                             Vector3 InWorldBoundingMaximum) noexcept;

    // Registers a local distance field placement into the global scene collection
    uint32_t RegisterPlacement(const DistanceFieldSpace* LocalField,
                               Vector3 Translation,
                               Vector3 Scale = { 1.0f, 1.0f, 1.0f }) noexcept;

    // Rasterizes registered local placements into the world volume grid
    void UpdateGlobalGrid() noexcept;

    // Continuous distance query sampling the composited global volume
    [[nodiscard]] float SampleSceneDistance(Vector3 WorldPosition) const noexcept;

    // Continuous surface normal query derived by central differences from global volume
    [[nodiscard]] Vector3 SampleSceneNormal(Vector3 WorldPosition) const noexcept;

    // Two-tier hierarchical ray march: coarse steps in global grid, refined in local fields near surfaces
    [[nodiscard]] DistanceFieldHitRecord MarchSceneRay(Vector3 RayOrigin,
                                                       Vector3 RayDirection,
                                                       float MinimumDistance,
                                                       float MaximumDistance,
                                                       float SurfaceThreshold   = 0.002f,
                                                       uint32_t MaximumSteps    = 128u,
                                                       float StepRelaxation     = 0.85f,
                                                       float TransitionDistance = 0.12f) const noexcept;

    // Scene-wide distance field soft shadow with contact hardening
    [[nodiscard]] float MarchSceneSoftShadow(Vector3 ShadingPosition,
                                             Vector3 IlluminantDirection,
                                             float MinimumDistance,
                                             float MaximumDistance,
                                             float LightAngularSize = 0.175f,
                                             uint32_t MaximumSteps  = 32u) const noexcept;

    // Accessors
    [[nodiscard]] uint32_t GetPlacementCount() const noexcept { return static_cast<uint32_t>(Placements.size()); }
    [[nodiscard]] const DistanceFieldPlacement& GetPlacement(uint32_t Index) const noexcept { return Placements[Index]; }
    [[nodiscard]] const DistanceFieldSpace& GetGlobalVolume() const noexcept { return GlobalVolume; }
    [[nodiscard]] DistanceFieldSpace& GetMutableGlobalVolume() noexcept { return GlobalVolume; }

private:
    std::vector<DistanceFieldPlacement> Placements;             // [-] registered scene mesh placements
    DistanceFieldSpace      GlobalVolume;                       // [m] world-space coarse composite volume
    Vector3                 WorldBoundingMinimum = { -5.0f, -5.0f, -0.5f }; // [m] scene bounding minimum
    Vector3                 WorldBoundingMaximum = {  5.0f,  5.0f,  3.5f }; // [m] scene bounding maximum
};

} // namespace Frontier
