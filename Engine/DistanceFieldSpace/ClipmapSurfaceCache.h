/*============================================================================================================================================
                                                      CLIPMAPSURFACECACHE.H
============================================================================================================================================*/
// Clipmap signed-distance storage with a radiance surface-card cache for a CPU reference implementation.

#pragma once

#include <cstdint>
#include <vector>

namespace Frontier::DistanceFieldSpace
{

struct Vector3
{
    float X = 0.0f; // [m] - Cartesian horizontal coordinate
    float Y = 0.0f; // [m] - Cartesian vertical coordinate
    float Z = 0.0f; // [m] - Cartesian depth coordinate
};

struct Radiance3
{
    float R = 0.0f; // [W/sr/m²] - Linear red radiance
    float G = 0.0f; // [W/sr/m²] - Linear green radiance
    float B = 0.0f; // [W/sr/m²] - Linear blue radiance
};

struct ClipmapLevel
{
    Vector3             Minimum {};      // [m]     - Inclusive world-space lower corner
    float               VoxelSpacing = 0.0f; // [m] - Uniform voxel spacing
    uint32_t            EdgeSamples = 0u;   // [count] - Samples along every cubic edge
    std::vector<float>  SignedDistance {};  // [m] - Float32 signed distance samples

    [[nodiscard]] bool Contains(Vector3 WorldPosition) const noexcept;
    [[nodiscard]] float Sample(Vector3 WorldPosition) const noexcept;
};

class StaticDistanceClipmap
{
public:
    // Bakes the static room into three camera-centred distance levels. Dynamic objects stay out of this storage:
    // their object-local signed-distance function is composed at query time, avoiding a complete clipmap rebuild.
    void Bake(Vector3 Anchor);

    [[nodiscard]] float Sample(Vector3 WorldPosition, uint32_t* OutLevel = nullptr) const noexcept;
    [[nodiscard]] const std::vector<ClipmapLevel>& InspectLevels() const noexcept;

private:
    std::vector<ClipmapLevel> Levels;
};

struct SurfaceCard
{
    Vector3   Centre {};       // [m] - World-space card centre
    Vector3   Normal {};       // [-] - Outward unit normal
    Vector3   AxisU {};        // [-] - Unit tangent defining the first card dimension
    Vector3   AxisV {};        // [-] - Unit tangent defining the second card dimension
    float     HalfWidth = 0.0f;  // [m] - Card half extent on AxisU
    float     HalfHeight = 0.0f; // [m] - Card half extent on AxisV
    Radiance3 Albedo {};       // [0-1] - Diffuse base colour used by cache injection
    Radiance3 Radiance {};     // [W/sr/m²] - Injected outgoing diffuse or emissive radiance
    uint32_t  Identifier = 0u; // [-] - Stable card identifier
    bool      Emissive = false; // [-] - Card emits independently of direct lights
    bool      LocalVehicle = false; // [-] - Card follows an object-local vehicle transform
};

struct IlluminationInput
{
    bool      SunEnabled = false;   // [-] - Directional input contributes to surface-card injection
    bool      PointEnabled = false; // [-] - Point input contributes to surface-card injection
    bool      AreaEnabled = false;  // [-] - Area-emissive card contributes to surface-card injection
    Vector3   SunDirection { -0.15f, 0.35f, -0.92f }; // [-] - Direction from surface toward sun
    Radiance3 SunRadiance { 36.0f, 34.2f, 31.2f };    // [W/sr/m²] - Incident sun radiance proxy
    Vector3   PointPosition { 2.2f, 2.25f, -1.35f };  // [m] - Point emitter centre
    Radiance3 PointIntensity { 800.0f, 400.0f, 180.0f }; // [W] - Isotropic point intensity proxy
    Radiance3 AreaRadiance { 54.0f, 21.0f, 6.6f };    // [W/sr/m²] - Ceiling emitter radiance
};

struct VehiclePlacement
{
    Vector3 Centre { 0.0f, 0.62f, -0.15f }; // [m] - Vehicle object-local origin in world coordinates
    float   YawRadians = 0.0f;               // [rad] - Rotation about the world vertical axis
};

class SurfaceCardCache
{
public:
    void Initialize();
    void Inject(const IlluminationInput& Input, const VehiclePlacement& Vehicle,
                const StaticDistanceClipmap& Clipmap);

    [[nodiscard]] Radiance3 Sample(Vector3 WorldPosition, Vector3 IncomingDirection) const noexcept;
    [[nodiscard]] const std::vector<SurfaceCard>& InspectCards() const noexcept;

private:
    std::vector<SurfaceCard> Cards;
};

[[nodiscard]] Vector3 Add(Vector3 Left, Vector3 Right) noexcept;
[[nodiscard]] Vector3 Subtract(Vector3 Left, Vector3 Right) noexcept;
[[nodiscard]] Vector3 Multiply(Vector3 Value, float Scalar) noexcept;
[[nodiscard]] float   Dot(Vector3 Left, Vector3 Right) noexcept;
[[nodiscard]] float   Length(Vector3 Value) noexcept;
[[nodiscard]] Vector3 Normalize(Vector3 Value) noexcept;
[[nodiscard]] Vector3 Cross(Vector3 Left, Vector3 Right) noexcept;
[[nodiscard]] Radiance3 Add(Radiance3 Left, Radiance3 Right) noexcept;
[[nodiscard]] Radiance3 Multiply(Radiance3 Value, float Scalar) noexcept;
[[nodiscard]] Radiance3 Multiply(Radiance3 Left, Radiance3 Right) noexcept;

[[nodiscard]] float EvaluateStaticDistance(Vector3 WorldPosition) noexcept;
[[nodiscard]] float EvaluateVehicleDistance(Vector3 WorldPosition, const VehiclePlacement& Vehicle) noexcept;
[[nodiscard]] float EvaluateHybridDistance(Vector3 WorldPosition, const StaticDistanceClipmap& Clipmap,
                                           const VehiclePlacement& Vehicle, uint32_t* OutLevel = nullptr) noexcept;
[[nodiscard]] Vector3 EvaluateHybridNormal(Vector3 WorldPosition, const StaticDistanceClipmap& Clipmap,
                                           const VehiclePlacement& Vehicle) noexcept;
[[nodiscard]] Radiance3 EvaluateSurfaceAlbedo(Vector3 WorldPosition, const VehiclePlacement& Vehicle) noexcept;

struct PenumbraTrace
{
    float    Visibility = 1.0f; // [0-1] - SDF-cone estimated visibility
    uint32_t Steps = 0u;        // [count] - Sphere-march iteration count
};

[[nodiscard]] PenumbraTrace TraceSdfPenumbra(Vector3 Origin, Vector3 Direction, float MaximumDistance,
                                             float SourceAngularRadius, const StaticDistanceClipmap& Clipmap,
                                             const VehiclePlacement& Vehicle) noexcept;

} // namespace Frontier::DistanceFieldSpace
