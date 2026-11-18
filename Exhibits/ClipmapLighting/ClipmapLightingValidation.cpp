/*============================================================================================================================================
                                                CLIPMAPLIGHTINGVALIDATION.CPP
============================================================================================================================================*/
// Deterministic 480x270 CPU proof for static SDF clipmaps, local vehicle SDF composition, surface-cache GI, and path tracing.

#include "Engine/DistanceFieldSpace/ClipmapSurfaceCache.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <limits>
#include <string>
#include <vector>

namespace
{
using namespace Frontier::DistanceFieldSpace;

constexpr uint32_t ImageWidth = 480u;
constexpr uint32_t ImageHeight = 270u;
constexpr float Pi = 3.14159265358979323846f;

struct Image
{
    uint32_t Width = 0u;
    uint32_t Height = 0u;
    std::vector<Radiance3> Pixels;

    Image(uint32_t InputWidth, uint32_t InputHeight)
        : Width(InputWidth)
        , Height(InputHeight)
        , Pixels(static_cast<size_t>(InputWidth) * InputHeight)
    {
    }

    Radiance3& At(uint32_t X, uint32_t Y)
    {
        return Pixels[static_cast<size_t>(Y) * Width + X];
    }

    const Radiance3& At(uint32_t X, uint32_t Y) const
    {
        return Pixels[static_cast<size_t>(Y) * Width + X];
    }
};

struct Camera
{
    // Camera stays in the open front of the gallery. The former side-exterior placement visibly clipped the room wall.
    Vector3 Position { 0.0f, 2.25f, -7.20f };
    Vector3 Target { 0.0f, 1.05f, 0.45f };
    float FieldOfViewRadians = 0.66f;
};

struct Hit
{
    bool Confirmed = false;
    Vector3 Position {};
    Vector3 Normal {};
    float Distance = 0.0f;
    uint32_t ClipLevel = 0u;
};

struct PixelStatistics
{
    bool Finite = true;
    uint64_t BlackCount = 0u;
    uint64_t WhiteCount = 0u;
    float Minimum = std::numeric_limits<float>::infinity();
    float Maximum = 0.0f;
    float Mean = 0.0f;
};

struct ProofMetrics
{
    double StaticBakeMilliseconds = 0.0;
    double FullRebakeMilliseconds = 0.0;
    double HybridRefreshMilliseconds = 0.0;
    double CombinedRenderMilliseconds = 0.0;
    double PathTraceMilliseconds = 0.0;
    float HybridMeanAbsoluteError = 0.0f;
    float StaleMeanAbsoluteError = 0.0f;
    uint32_t DeterminismHash = 0u;
    PixelStatistics CombinedStatistics {};
    PixelStatistics PathStatistics {};
};

float Clamp(float Value, float Minimum, float Maximum)
{
    return std::max(Minimum, std::min(Maximum, Value));
}

float Luminance(Radiance3 Value)
{
    return 0.2126f * Value.R + 0.7152f * Value.G + 0.0722f * Value.B;
}

Radiance3 Maximum(Radiance3 Value, float Minimum)
{
    return { std::max(Value.R, Minimum), std::max(Value.G, Minimum), std::max(Value.B, Minimum) };
}

float RadicalInverseBase2(uint32_t Value)
{
    Value = (Value << 16u) | (Value >> 16u);
    Value = ((Value & 0x55555555u) << 1u) | ((Value & 0xAAAAAAAAu) >> 1u);
    Value = ((Value & 0x33333333u) << 2u) | ((Value & 0xCCCCCCCCu) >> 2u);
    Value = ((Value & 0x0F0F0F0Fu) << 4u) | ((Value & 0xF0F0F0F0u) >> 4u);
    Value = ((Value & 0x00FF00FFu) << 8u) | ((Value & 0xFF00FF00u) >> 8u);
    return static_cast<float>(Value) * 2.3283064365386963e-10f;
}

float SobolSecondDimension(uint32_t Index)
{
    // Base-2 Sobol direction numbers for the second dimension. There is intentionally no random rotation.
    static constexpr std::array<uint32_t, 32u> Directions {
        0x80000000u, 0xC0000000u, 0xA0000000u, 0xF0000000u, 0x88000000u, 0xCC000000u, 0xAA000000u, 0xFF000000u,
        0x80800000u, 0xC0C00000u, 0xA0A00000u, 0xF0F00000u, 0x88880000u, 0xCCCC0000u, 0xAAAA0000u, 0xFFFF0000u,
        0x80008000u, 0xC000C000u, 0xA000A000u, 0xF000F000u, 0x88008800u, 0xCC00CC00u, 0xAA00AA00u, 0xFF00FF00u,
        0x80808080u, 0xC0C0C0C0u, 0xA0A0A0A0u, 0xF0F0F0F0u, 0x88888888u, 0xCCCCCCCCu, 0xAAAAAAAAu, 0xFFFFFFFFu,
    };
    uint32_t Result = 0u;
    uint32_t Bit = 0u;
    while (Index != 0u)
    {
        if ((Index & 1u) != 0u)
        {
            Result ^= Directions[Bit];
        }
        Index >>= 1u;
        ++Bit;
    }
    return static_cast<float>(Result) * 2.3283064365386963e-10f;
}

Vector3 SphericalCapSobol(uint32_t SampleIndex, uint32_t SampleCount, float MinimumCosine)
{
    const float U = (static_cast<float>(SampleIndex) + RadicalInverseBase2(SampleIndex + 1u)) /
                    static_cast<float>(SampleCount);
    const float V = SobolSecondDimension(SampleIndex + 1u);
    const float Cosine = 1.0f - U * (1.0f - MinimumCosine);
    const float Sine = std::sqrt(std::max(0.0f, 1.0f - Cosine * Cosine));
    const float Phi = 2.0f * Pi * V;
    return { std::cos(Phi) * Sine, std::sin(Phi) * Sine, Cosine };
}

void ConstructBasis(Vector3 Normal, Vector3& OutTangent, Vector3& OutBitangent)
{
    const Vector3 Helper = std::fabs(Normal.Y) < 0.9f ? Vector3 { 0.0f, 1.0f, 0.0f } : Vector3 { 1.0f, 0.0f, 0.0f };
    OutTangent = Normalize(Cross(Helper, Normal));
    OutBitangent = Cross(Normal, OutTangent);
}

Vector3 CameraRayDirection(const Camera& CurrentCamera, uint32_t X, uint32_t Y, float JitterX = 0.5f, float JitterY = 0.5f)
{
    const Vector3 Forward = Normalize(Subtract(CurrentCamera.Target, CurrentCamera.Position));
    const Vector3 Right = Normalize(Cross(Forward, { 0.0f, 1.0f, 0.0f }));
    const Vector3 Up = Cross(Right, Forward);
    const float Aspect = static_cast<float>(ImageWidth) / static_cast<float>(ImageHeight);
    const float ScreenX = ((static_cast<float>(X) + JitterX) / static_cast<float>(ImageWidth) * 2.0f - 1.0f) *
                          std::tan(CurrentCamera.FieldOfViewRadians * 0.5f) * Aspect;
    const float ScreenY = (1.0f - (static_cast<float>(Y) + JitterY) / static_cast<float>(ImageHeight) * 2.0f) *
                          std::tan(CurrentCamera.FieldOfViewRadians * 0.5f);
    return Normalize(Add(Forward, Add(Multiply(Right, ScreenX), Multiply(Up, ScreenY))));
}

Hit TraceSurface(Vector3 Origin, Vector3 Direction, const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle,
                 float MaximumDistance = 24.0f)
{
    Hit Result;
    float Distance = 0.02f;
    Direction = Normalize(Direction);
    for (uint32_t Step = 0u; Step < 160u && Distance < MaximumDistance; ++Step)
    {
        uint32_t ClipLevel = 0u;
        const Vector3 Position = Add(Origin, Multiply(Direction, Distance));
        const float FieldDistance = EvaluateHybridDistance(Position, Clipmap, Vehicle, &ClipLevel);
        if (FieldDistance < 0.006f)
        {
            Result.Confirmed = true;
            Result.Position = Position;
            Result.Normal = EvaluateHybridNormal(Position, Clipmap, Vehicle);
            Result.Distance = Distance;
            Result.ClipLevel = ClipLevel;
            return Result;
        }
        Distance += std::max(0.008f, std::fabs(FieldDistance) * 0.72f);
    }
    return Result;
}

bool QuerySdfOccluded(Vector3 Origin, Vector3 Direction, float MaximumDistance, const StaticDistanceClipmap& Clipmap,
                      const VehiclePlacement& Vehicle)
{
    float Distance = 0.022f;
    const Vector3 UnitDirection = Normalize(Direction);
    for (uint32_t Step = 0u; Step < 192u && Distance < MaximumDistance; ++Step)
    {
        const float FieldDistance = EvaluateHybridDistance(Add(Origin, Multiply(UnitDirection, Distance)), Clipmap, Vehicle);
        if (FieldDistance < 0.004f)
        {
            return true;
        }
        Distance += std::max(0.008f, std::fabs(FieldDistance) * 0.55f);
    }
    return false;
}

Radiance3 EvaluateDirect(Vector3 Position, Vector3 Normal, const IlluminationInput& Input,
                         const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle)
{
    const Radiance3 Albedo = EvaluateSurfaceAlbedo(Position, Vehicle);
    Radiance3 Accumulated {};
    if (Input.SunEnabled)
    {
        const Vector3 Direction = Normalize(Input.SunDirection);
        const float Cosine = std::max(0.0f, Dot(Normal, Direction));
        if (Cosine > 0.0f)
        {
            const bool Occluded = QuerySdfOccluded(Add(Position, Multiply(Normal, 0.018f)), Direction, 22.0f, Clipmap, Vehicle);
            Accumulated = Add(Accumulated, Multiply(Multiply(Albedo, Input.SunRadiance),
                                                       Cosine * (Occluded ? 0.0f : 1.0f) / Pi));
        }
    }
    if (Input.PointEnabled)
    {
        const Vector3 ToPoint = Subtract(Input.PointPosition, Position);
        const float DistanceSquared = std::max(0.05f, Dot(ToPoint, ToPoint));
        const Vector3 Direction = Multiply(ToPoint, 1.0f / std::sqrt(DistanceSquared));
        const float Cosine = std::max(0.0f, Dot(Normal, Direction));
        if (Cosine > 0.0f)
        {
            const bool Occluded = QuerySdfOccluded(Add(Position, Multiply(Normal, 0.018f)), Direction,
                                                  std::sqrt(DistanceSquared) - 0.035f, Clipmap, Vehicle);
            Accumulated = Add(Accumulated, Multiply(Multiply(Albedo, Input.PointIntensity),
                                                   Cosine * (Occluded ? 0.0f : 1.0f) / (4.0f * Pi * DistanceSquared * Pi)));
        }
    }
    if (Input.AreaEnabled)
    {
        // Four fixed quadrature points on the ceiling panel; deterministic soft direct illumination with no stochastic noise.
        const std::array<Vector3, 4u> Samples {
            Vector3 { -0.55f, 2.94f, -0.52f }, Vector3 { 0.55f, 2.94f, -0.52f },
            Vector3 { -0.55f, 2.94f, 0.12f }, Vector3 { 0.55f, 2.94f, 0.12f },
        };
        for (const Vector3 LightPosition : Samples)
        {
            const Vector3 ToLight = Subtract(LightPosition, Position);
            const float DistanceSquared = std::max(0.05f, Dot(ToLight, ToLight));
            const Vector3 Direction = Multiply(ToLight, 1.0f / std::sqrt(DistanceSquared));
            const float ReceiverCosine = std::max(0.0f, Dot(Normal, Direction));
            const float EmitterCosine = std::max(0.0f, Direction.Y);
            if (ReceiverCosine > 0.0f && EmitterCosine > 0.0f)
            {
                const bool Occluded = QuerySdfOccluded(Add(Position, Multiply(Normal, 0.018f)), Direction,
                                                      std::max(0.02f, std::sqrt(DistanceSquared) - 0.055f), Clipmap, Vehicle);
                const float Weight = (1.10f * 0.62f) / static_cast<float>(Samples.size());
                Accumulated = Add(Accumulated, Multiply(Multiply(Albedo, Input.AreaRadiance),
                                                       ReceiverCosine * EmitterCosine * Weight * (Occluded ? 0.0f : 1.0f) /
                                                       (DistanceSquared * Pi)));
            }
        }
    }
    return Accumulated;
}

Radiance3 EvaluateConeGlobalIllumination(Vector3 Position, Vector3 Normal, const StaticDistanceClipmap& Clipmap,
                                         const VehiclePlacement& Vehicle, const SurfaceCardCache& Cache)
{
    Vector3 Tangent {};
    Vector3 Bitangent {};
    ConstructBasis(Normal, Tangent, Bitangent);
    constexpr uint32_t ConeCount = 16u;
    Radiance3 Accumulated {};
    for (uint32_t Sample = 0u; Sample < ConeCount; ++Sample)
    {
        const Vector3 LocalDirection = SphericalCapSobol(Sample, ConeCount, 0.0f);
        const Vector3 Direction = Normalize(Add(Add(Multiply(Tangent, LocalDirection.X), Multiply(Bitangent, LocalDirection.Y)),
                                                Multiply(Normal, LocalDirection.Z)));
        float Distance = 0.045f;
        for (uint32_t Step = 0u; Step < 48u && Distance < 7.0f; ++Step)
        {
            const Vector3 ProbePosition = Add(Position, Multiply(Direction, Distance));
            const float FieldDistance = EvaluateHybridDistance(ProbePosition, Clipmap, Vehicle);
            const float ConeRadius = 0.05f + Distance * 0.18f;
            if (FieldDistance < ConeRadius)
            {
                const Radiance3 SurfaceRadiance = Cache.Sample(ProbePosition, Direction);
                const float Weight = (2.0f * LocalDirection.Z / static_cast<float>(ConeCount)) *
                                     Clamp(1.0f - Distance / 7.0f, 0.0f, 1.0f);
                Accumulated = Add(Accumulated, Multiply(SurfaceRadiance, Weight));
                break;
            }
            Distance += std::max(0.025f, std::fabs(FieldDistance) * 0.74f);
        }
    }

    // Surface-card gather is the cache half of the hybrid estimator. Cone marching provides the signed-distance
    // occlusion term; cards supply radiance at finite-area surfaces, so a narrow emitter is not missed by a fixed
    // set of hemisphere directions. This remains fully deterministic and has no temporal filter or denoiser.
    const Vector3 Origin = Add(Position, Multiply(Normal, 0.022f));
    for (const SurfaceCard& Card : Cache.InspectCards())
    {
        if (Luminance(Card.Radiance) <= 1.0e-5f)
        {
            continue;
        }
        const Vector3 ToCard = Subtract(Card.Centre, Origin);
        const float DistanceSquared = std::max(0.04f, Dot(ToCard, ToCard));
        const float Distance = std::sqrt(DistanceSquared);
        const Vector3 Direction = Multiply(ToCard, 1.0f / Distance);
        const float ReceiverCosine = std::max(0.0f, Dot(Normal, Direction));
        const float CardCosine = std::max(0.0f, Dot(Card.Normal, Multiply(Direction, -1.0f)));
        if (ReceiverCosine <= 0.0f || CardCosine <= 0.0f)
        {
            continue;
        }
        // The cone loop above resolves low-frequency SDF accessibility. The card gather below uses a conservative
        // SDF sphere trace for binary card visibility: it prevents the visibly stepped penumbra bands produced when
        // a very large card footprint is treated as one expanding cone.
        const bool Occluded = QuerySdfOccluded(Origin, Direction, std::max(0.02f, Distance - 0.055f), Clipmap, Vehicle);
        const float FormFactor = ReceiverCosine * CardCosine * (4.0f * Card.HalfWidth * Card.HalfHeight) /
                                 (Pi * DistanceSquared);
        Accumulated = Add(Accumulated, Multiply(Card.Radiance, FormFactor * (Occluded ? 0.0f : 1.0f)));
    }
    return Accumulated;
}

Radiance3 SurfaceEmission(Vector3 Position, bool AreaEnabled)
{
    const bool UnderPanel = std::fabs(Position.Y - 2.95f) < 0.055f && std::fabs(Position.X) < 1.10f &&
                            std::fabs(Position.Z + 0.20f) < 0.62f;
    return UnderPanel && AreaEnabled ? Radiance3 { 54.0f, 21.0f, 6.6f } : Radiance3 {};
}

Radiance3 TraceDeterministicPath(Vector3 Origin, Vector3 Direction, const IlluminationInput& Input,
                                 const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle)
{
    // This is a two-bounce diffuse path integral evaluated with a fixed 16-direction Sobol hemisphere quadrature.
    // It is deterministic quadrature rather than a low-spp Monte Carlo preview: no PRNG, no temporal accumulation,
    // and no denoiser are involved, so it cannot produce temporal noise or firefly splots.
    const Hit Primary = TraceSurface(Origin, Direction, Clipmap, Vehicle);
    if (!Primary.Confirmed)
    {
        const float Horizon = Clamp(Direction.Y * 0.5f + 0.5f, 0.0f, 1.0f);
        return { 0.025f + 0.05f * Horizon, 0.035f + 0.07f * Horizon, 0.060f + 0.10f * Horizon };
    }

    Radiance3 Accumulated = Add(SurfaceEmission(Primary.Position, Input.AreaEnabled),
                                EvaluateDirect(Primary.Position, Primary.Normal, Input, Clipmap, Vehicle));
    const Radiance3 PrimaryAlbedo = EvaluateSurfaceAlbedo(Primary.Position, Vehicle);
    Vector3 Tangent {};
    Vector3 Bitangent {};
    ConstructBasis(Primary.Normal, Tangent, Bitangent);
    constexpr uint32_t HemisphereDirections = 16u;
    for (uint32_t Sample = 0u; Sample < HemisphereDirections; ++Sample)
    {
        const Vector3 LocalDirection = SphericalCapSobol(Sample, HemisphereDirections, 0.0f);
        const Vector3 BounceDirection = Normalize(Add(Add(Multiply(Tangent, LocalDirection.X), Multiply(Bitangent, LocalDirection.Y)),
                                                        Multiply(Primary.Normal, LocalDirection.Z)));
        const Hit Secondary = TraceSurface(Add(Primary.Position, Multiply(Primary.Normal, 0.018f)), BounceDirection, Clipmap, Vehicle);
        if (!Secondary.Confirmed)
        {
            continue;
        }
        const Radiance3 SecondaryExitance = Add(SurfaceEmission(Secondary.Position, Input.AreaEnabled),
                                                EvaluateDirect(Secondary.Position, Secondary.Normal, Input, Clipmap, Vehicle));
        const float HemisphereWeight = 2.0f * LocalDirection.Z / static_cast<float>(HemisphereDirections);
        Accumulated = Add(Accumulated, Multiply(Multiply(PrimaryAlbedo, SecondaryExitance), HemisphereWeight));
    }
    return Accumulated;
}

Radiance3 ToneMap(Radiance3 Linear)
{
    const auto Aces = [](float Value) {
        const float Numerator = Value * (2.51f * Value + 0.03f);
        const float Denominator = Value * (2.43f * Value + 0.59f) + 0.14f;
        const float Mapped = Clamp(Numerator / std::max(Denominator, 1.0e-5f), 0.0f, 1.0f);
        return Mapped <= 0.0031308f ? Mapped * 12.92f : 1.055f * std::pow(Mapped, 1.0f / 2.4f) - 0.055f;
    };
    return { Aces(Linear.R), Aces(Linear.G), Aces(Linear.B) };
}

void WritePpm(const std::filesystem::path& Path, const Image& Source)
{
    std::ofstream Output(Path, std::ios::binary);
    Output << "P6\n" << Source.Width << " " << Source.Height << "\n255\n";
    for (const Radiance3 Pixel : Source.Pixels)
    {
        const Radiance3 Display = ToneMap(Maximum(Pixel, 0.0f));
        const std::array<unsigned char, 3u> Bytes {
            static_cast<unsigned char>(Clamp(Display.R, 0.0f, 1.0f) * 255.0f + 0.5f),
            static_cast<unsigned char>(Clamp(Display.G, 0.0f, 1.0f) * 255.0f + 0.5f),
            static_cast<unsigned char>(Clamp(Display.B, 0.0f, 1.0f) * 255.0f + 0.5f),
        };
        Output.write(reinterpret_cast<const char*>(Bytes.data()), static_cast<std::streamsize>(Bytes.size()));
    }
}

PixelStatistics Inspect(const Image& Source)
{
    PixelStatistics Result;
    for (const Radiance3 Pixel : Source.Pixels)
    {
        const float CurrentLuminance = Luminance(Pixel);
        Result.Finite = Result.Finite && std::isfinite(Pixel.R) && std::isfinite(Pixel.G) && std::isfinite(Pixel.B);
        Result.Minimum = std::min(Result.Minimum, CurrentLuminance);
        Result.Maximum = std::max(Result.Maximum, CurrentLuminance);
        Result.Mean += CurrentLuminance;
        Result.BlackCount += CurrentLuminance < 1.0e-5f ? 1u : 0u;
        Result.WhiteCount += CurrentLuminance > 64.0f ? 1u : 0u;
    }
    Result.Mean /= static_cast<float>(Source.Pixels.size());
    return Result;
}

uint32_t HashImage(const Image& Source)
{
    uint32_t Hash = 2166136261u;
    for (const Radiance3 Pixel : Source.Pixels)
    {
        const uint32_t Quantized[3] {
            static_cast<uint32_t>(Clamp(Pixel.R, 0.0f, 128.0f) * 65536.0f),
            static_cast<uint32_t>(Clamp(Pixel.G, 0.0f, 128.0f) * 65536.0f),
            static_cast<uint32_t>(Clamp(Pixel.B, 0.0f, 128.0f) * 65536.0f),
        };
        for (const uint32_t Value : Quantized)
        {
            Hash ^= Value;
            Hash *= 16777619u;
        }
    }
    return Hash;
}

Image RenderLighting(const Camera& CurrentCamera, const IlluminationInput& Input, const StaticDistanceClipmap& Clipmap,
                     const VehiclePlacement& Vehicle, const SurfaceCardCache& Cache, bool DirectEnabled, bool GiEnabled,
                     bool ShadowDebug = false)
{
    Image Result(ImageWidth, ImageHeight);
    for (uint32_t Y = 0u; Y < ImageHeight; ++Y)
    {
        for (uint32_t X = 0u; X < ImageWidth; ++X)
        {
            const Vector3 Direction = CameraRayDirection(CurrentCamera, X, Y);
            const Hit Surface = TraceSurface(CurrentCamera.Position, Direction, Clipmap, Vehicle);
            if (!Surface.Confirmed)
            {
                const float SkyFactor = Clamp(Direction.Y * 0.8f + 0.35f, 0.0f, 1.0f);
                Result.At(X, Y) = { 0.012f + 0.035f * SkyFactor, 0.019f + 0.050f * SkyFactor, 0.035f + 0.095f * SkyFactor };
                continue;
            }
            if (ShadowDebug)
            {
                const PenumbraTrace Shadow = TraceSdfPenumbra(Add(Surface.Position, Multiply(Surface.Normal, 0.018f)),
                                                               Normalize(Input.SunDirection), 22.0f, 0.00465f, Clipmap, Vehicle);
                Result.At(X, Y) = { Shadow.Visibility, Shadow.Visibility, Shadow.Visibility };
                continue;
            }
            Radiance3 Value = SurfaceEmission(Surface.Position, Input.AreaEnabled);
            if (DirectEnabled)
            {
                Value = Add(Value, EvaluateDirect(Surface.Position, Surface.Normal, Input, Clipmap, Vehicle));
            }
            if (GiEnabled)
            {
                Value = Add(Value, EvaluateConeGlobalIllumination(Surface.Position, Surface.Normal, Clipmap, Vehicle, Cache));
            }
            Result.At(X, Y) = Value;
        }
    }
    return Result;
}

Image RenderPathReference(const Camera& CurrentCamera, const IlluminationInput& Input, const StaticDistanceClipmap& Clipmap,
                          const VehiclePlacement& Vehicle)
{
    Image Result(ImageWidth, ImageHeight);
    for (uint32_t Y = 0u; Y < ImageHeight; ++Y)
    {
        for (uint32_t X = 0u; X < ImageWidth; ++X)
        {
            const Vector3 Direction = CameraRayDirection(CurrentCamera, X, Y);
            Result.At(X, Y) = TraceDeterministicPath(CurrentCamera.Position, Direction, Input, Clipmap, Vehicle);
        }
    }
    return Result;
}

Image RenderSdfSlice(const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle)
{
    Image Result(ImageWidth, ImageHeight);
    for (uint32_t Y = 0u; Y < ImageHeight; ++Y)
    {
        for (uint32_t X = 0u; X < ImageWidth; ++X)
        {
            const float WorldX = -4.8f + static_cast<float>(X) / static_cast<float>(ImageWidth - 1u) * 9.6f;
            const float WorldZ = -4.4f + static_cast<float>(Y) / static_cast<float>(ImageHeight - 1u) * 8.8f;
            const float Distance = EvaluateHybridDistance({ WorldX, 0.42f, WorldZ }, Clipmap, Vehicle);
            const float Magnitude = Clamp(std::fabs(Distance) * 2.5f, 0.0f, 1.0f);
            Result.At(X, Y) = Distance < 0.0f ? Radiance3 { 0.72f, 0.08f + 0.25f * Magnitude, 0.08f } :
                                                   Radiance3 { 0.04f, 0.25f + 0.65f * Magnitude, 0.88f };
            if (std::fabs(Distance) < 0.025f)
            {
                Result.At(X, Y) = { 2.4f, 2.4f, 2.4f };
            }
        }
    }
    return Result;
}

Image RenderClipmapSelection(const Camera& CurrentCamera, const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle)
{
    Image Result(ImageWidth, ImageHeight);
    static constexpr std::array<Radiance3, 4u> Palette {
        Radiance3 { 0.18f, 0.90f, 1.00f }, Radiance3 { 0.18f, 1.00f, 0.32f },
        Radiance3 { 1.00f, 0.75f, 0.15f }, Radiance3 { 1.00f, 0.12f, 0.12f },
    };
    for (uint32_t Y = 0u; Y < ImageHeight; ++Y)
    {
        for (uint32_t X = 0u; X < ImageWidth; ++X)
        {
            const Hit Surface = TraceSurface(CurrentCamera.Position, CameraRayDirection(CurrentCamera, X, Y), Clipmap, Vehicle);
            if (!Surface.Confirmed)
            {
                Result.At(X, Y) = { 0.008f, 0.010f, 0.016f };
                continue;
            }
            Result.At(X, Y) = Palette[std::min<uint32_t>(Surface.ClipLevel, 3u)];
        }
    }
    return Result;
}

Image RenderSurfaceCards(const SurfaceCardCache& Cache)
{
    Image Result(ImageWidth, ImageHeight);
    for (Radiance3& Pixel : Result.Pixels)
    {
        Pixel = { 0.008f, 0.012f, 0.020f };
    }
    const auto ToPixel = [](Vector3 Position, uint32_t& OutX, uint32_t& OutY) {
        OutX = static_cast<uint32_t>(Clamp((Position.X + 4.8f) / 9.6f * static_cast<float>(ImageWidth - 1u), 0.0f, static_cast<float>(ImageWidth - 1u)));
        OutY = static_cast<uint32_t>(Clamp((Position.Z + 4.4f) / 8.8f * static_cast<float>(ImageHeight - 1u), 0.0f, static_cast<float>(ImageHeight - 1u)));
    };
    for (const SurfaceCard& Card : Cache.InspectCards())
    {
        for (uint32_t V = 0u; V < 96u; ++V)
        {
            for (uint32_t U = 0u; U < 96u; ++U)
            {
                const float LocalU = (static_cast<float>(U) / 95.0f * 2.0f - 1.0f) * Card.HalfWidth;
                const float LocalV = (static_cast<float>(V) / 95.0f * 2.0f - 1.0f) * Card.HalfHeight;
                const Vector3 Point = Add(Card.Centre, Add(Multiply(Card.AxisU, LocalU), Multiply(Card.AxisV, LocalV)));
                uint32_t PixelX = 0u;
                uint32_t PixelY = 0u;
                ToPixel(Point, PixelX, PixelY);
                Result.At(PixelX, PixelY) = Add(Result.At(PixelX, PixelY), Card.Radiance);
            }
        }
    }
    return Result;
}

float BakeFullSceneDiscarded(const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle)
{
    float Sink = 0.0f;
    for (const ClipmapLevel& Level : Clipmap.InspectLevels())
    {
        const uint32_t Edge = Level.EdgeSamples;
        for (uint32_t Z = 0u; Z < Edge; ++Z)
        {
            for (uint32_t Y = 0u; Y < Edge; ++Y)
            {
                for (uint32_t X = 0u; X < Edge; ++X)
                {
                    const Vector3 Position {
                        Level.Minimum.X + static_cast<float>(X) * Level.VoxelSpacing,
                        Level.Minimum.Y + static_cast<float>(Y) * Level.VoxelSpacing,
                        Level.Minimum.Z + static_cast<float>(Z) * Level.VoxelSpacing,
                    };
                    Sink += std::min(EvaluateStaticDistance(Position), EvaluateVehicleDistance(Position, Vehicle));
                }
            }
        }
    }
    return Sink;
}

void WriteMetrics(const std::filesystem::path& Path, const ProofMetrics& Metrics)
{
    std::ofstream Output(Path);
    Output << "{\n";
    Output << "  \"resolution\": \"480x270\",\n";
    Output << "  \"staticBakeMilliseconds\": " << Metrics.StaticBakeMilliseconds << ",\n";
    Output << "  \"fullRebakeMilliseconds\": " << Metrics.FullRebakeMilliseconds << ",\n";
    Output << "  \"hybridRefreshMilliseconds\": " << Metrics.HybridRefreshMilliseconds << ",\n";
    Output << "  \"combinedRenderMilliseconds\": " << Metrics.CombinedRenderMilliseconds << ",\n";
    Output << "  \"pathTraceMilliseconds\": " << Metrics.PathTraceMilliseconds << ",\n";
    Output << "  \"hybridMeanAbsoluteError\": " << Metrics.HybridMeanAbsoluteError << ",\n";
    Output << "  \"staleMeanAbsoluteError\": " << Metrics.StaleMeanAbsoluteError << ",\n";
    Output << "  \"determinismHash\": \"0x" << std::hex << Metrics.DeterminismHash << std::dec << "\",\n";
    Output << "  \"combinedFinite\": " << (Metrics.CombinedStatistics.Finite ? "true" : "false") << ",\n";
    Output << "  \"combinedLuminance\": { \"minimum\": " << Metrics.CombinedStatistics.Minimum
           << ", \"maximum\": " << Metrics.CombinedStatistics.Maximum << ", \"mean\": " << Metrics.CombinedStatistics.Mean
           << ", \"blackPixels\": " << Metrics.CombinedStatistics.BlackCount << ", \"brightPixels\": " << Metrics.CombinedStatistics.WhiteCount << " },\n";
    Output << "  \"pathFinite\": " << (Metrics.PathStatistics.Finite ? "true" : "false") << "\n";
    Output << "}\n";
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    const std::filesystem::path OutputDirectory = ArgumentCount > 1 ? Arguments[1] : "Exhibits/ClipmapLighting/Output";
    std::filesystem::create_directories(OutputDirectory / "Animation");
    std::printf("Clipmap lighting CPU proof: %ux%u\n", ImageWidth, ImageHeight);

    ProofMetrics Metrics;
    const Camera CurrentCamera {};
    const Vector3 ClipmapAnchor { 0.0f, 1.2f, 0.0f };
    VehiclePlacement Vehicle {};
    StaticDistanceClipmap Clipmap;
    const auto BakeStart = std::chrono::steady_clock::now();
    Clipmap.Bake(ClipmapAnchor);
    Metrics.StaticBakeMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - BakeStart).count();

    SurfaceCardCache Cache;
    Cache.Initialize();
    IlluminationInput Combined;
    Combined.SunEnabled = true;
    Combined.PointEnabled = true;
    Combined.AreaEnabled = true;
    Cache.Inject(Combined, Vehicle, Clipmap);
    const Radiance3 DiagnosticGi = EvaluateConeGlobalIllumination({ 2.50f, 0.012f, 0.20f }, { 0.0f, 1.0f, 0.0f }, Clipmap, Vehicle, Cache);
    std::printf("surface cache cards=%zu, unobstructed floor GI=(%.5f, %.5f, %.5f)\n", Cache.InspectCards().size(), DiagnosticGi.R, DiagnosticGi.G, DiagnosticGi.B);

    const auto RenderStart = std::chrono::steady_clock::now();
    const Image CombinedImage = RenderLighting(CurrentCamera, Combined, Clipmap, Vehicle, Cache, true, true);
    Metrics.CombinedRenderMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - RenderStart).count();
    WritePpm(OutputDirectory / "01_combined_lighting.ppm", CombinedImage);
    Metrics.CombinedStatistics = Inspect(CombinedImage);

    const Image CombinedRepeat = RenderLighting(CurrentCamera, Combined, Clipmap, Vehicle, Cache, true, true);
    const uint32_t FirstHash = HashImage(CombinedImage);
    const uint32_t SecondHash = HashImage(CombinedRepeat);
    Metrics.DeterminismHash = FirstHash;
    if (FirstHash != SecondHash)
    {
        std::fprintf(stderr, "FAIL deterministic hash mismatch: 0x%08x != 0x%08x\n", FirstHash, SecondHash);
        return 2;
    }

    IlluminationInput EmissiveOnly {};
    EmissiveOnly.AreaEnabled = true;
    Cache.Inject(EmissiveOnly, Vehicle, Clipmap);
    WritePpm(OutputDirectory / "02_gi_emissive_only.ppm", RenderLighting(CurrentCamera, EmissiveOnly, Clipmap, Vehicle, Cache, false, true));

    IlluminationInput SunOnly {};
    SunOnly.SunEnabled = true;
    Cache.Inject(SunOnly, Vehicle, Clipmap);
    WritePpm(OutputDirectory / "03_gi_sun_only.ppm", RenderLighting(CurrentCamera, SunOnly, Clipmap, Vehicle, Cache, false, true));

    IlluminationInput PointOnly {};
    PointOnly.PointEnabled = true;
    Cache.Inject(PointOnly, Vehicle, Clipmap);
    WritePpm(OutputDirectory / "04_gi_point_only.ppm", RenderLighting(CurrentCamera, PointOnly, Clipmap, Vehicle, Cache, false, true));

    IlluminationInput AreaOnly {};
    AreaOnly.AreaEnabled = true;
    Cache.Inject(AreaOnly, Vehicle, Clipmap);
    WritePpm(OutputDirectory / "05_gi_area_only.ppm", RenderLighting(CurrentCamera, AreaOnly, Clipmap, Vehicle, Cache, false, true));

    Cache.Inject(Combined, Vehicle, Clipmap);
    WritePpm(OutputDirectory / "06_gi_combined.ppm", RenderLighting(CurrentCamera, Combined, Clipmap, Vehicle, Cache, false, true));
    WritePpm(OutputDirectory / "07_sdf_level0_slice.ppm", RenderSdfSlice(Clipmap, Vehicle));
    WritePpm(OutputDirectory / "08_clipmap_selection.ppm", RenderClipmapSelection(CurrentCamera, Clipmap, Vehicle));
    WritePpm(OutputDirectory / "09_surface_cache_radiance.ppm", RenderSurfaceCards(Cache));
    WritePpm(OutputDirectory / "10_sdf_penumbra.ppm", RenderLighting(CurrentCamera, SunOnly, Clipmap, Vehicle, Cache, false, false, true));

    const auto PathStart = std::chrono::steady_clock::now();
    const Image PathReference = RenderPathReference(CurrentCamera, Combined, Clipmap, Vehicle);
    Metrics.PathTraceMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - PathStart).count();
    Metrics.PathStatistics = Inspect(PathReference);
    WritePpm(OutputDirectory / "11_path_reference_16ray_2bounce.ppm", PathReference);

    // A twelve-sample vehicle motion sequence: static clipmaps stay unchanged; only local SDF composition and one card change.
    for (uint32_t Frame = 0u; Frame < 12u; ++Frame)
    {
        const float Phase = static_cast<float>(Frame) / 11.0f;
        Vehicle.Centre = { -1.35f + Phase * 2.70f, 0.62f, -0.35f + 0.70f * std::sin(Phase * Pi) };
        Vehicle.YawRadians = -0.55f + Phase * 1.10f;
        Cache.Inject(Combined, Vehicle, Clipmap);
        char Name[80] = {};
        std::snprintf(Name, sizeof(Name), "Animation/vehicle_%02u.ppm", Frame);
        WritePpm(OutputDirectory / Name, RenderLighting(CurrentCamera, Combined, Clipmap, Vehicle, Cache, true, true));
    }

    // Timed scope is deliberate: it proves animated object distance maintenance, not whole-render GPU performance.
    constexpr uint32_t TimingIterations = 4u;
    float FullRebakeChecksum = 0.0f;
    const auto FullRebakeStart = std::chrono::steady_clock::now();
    for (uint32_t Iteration = 0u; Iteration < TimingIterations; ++Iteration)
    {
        Vehicle.Centre = { -1.2f + static_cast<float>(Iteration) * 0.8f, 0.62f, -0.15f };
        Vehicle.YawRadians = static_cast<float>(Iteration) * 0.23f;
        FullRebakeChecksum += BakeFullSceneDiscarded(Clipmap, Vehicle);
    }
    Metrics.FullRebakeMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - FullRebakeStart).count() /
                                    static_cast<double>(TimingIterations);
    if (!std::isfinite(FullRebakeChecksum))
    {
        std::fprintf(stderr, "FAIL full-rebake checksum is non-finite\n");
        return 4;
    }
    const auto HybridRefreshStart = std::chrono::steady_clock::now();
    for (uint32_t Iteration = 0u; Iteration < TimingIterations; ++Iteration)
    {
        Vehicle.Centre = { -1.2f + static_cast<float>(Iteration) * 0.8f, 0.62f, -0.15f };
        Vehicle.YawRadians = static_cast<float>(Iteration) * 0.23f;
        Cache.Inject(Combined, Vehicle, Clipmap);
    }
    Metrics.HybridRefreshMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - HybridRefreshStart).count() /
                                     static_cast<double>(TimingIterations);

    // Moving-object quality oracle: analytic static+vehicle SDF is the reference. A stale vehicle bake is intentionally
    // compared with the new object-local hybrid composition at 32×16 points around its current destination.
    const VehiclePlacement PreviousVehicle { { -1.2f, 0.62f, -0.15f }, 0.0f };
    const VehiclePlacement CurrentVehicle { { 1.2f, 0.62f, 0.55f }, 0.72f };
    float HybridError = 0.0f;
    float StaleError = 0.0f;
    uint32_t SampleCount = 0u;
    for (uint32_t Z = 0u; Z < 16u; ++Z)
    {
        for (uint32_t X = 0u; X < 32u; ++X)
        {
            const Vector3 Point { -0.55f + static_cast<float>(X) / 31.0f * 3.5f, 0.02f + static_cast<float>(Z) / 15.0f * 1.4f,
                                  -0.85f + static_cast<float>(Z) / 15.0f * 2.6f };
            const float Exact = std::min(EvaluateStaticDistance(Point), EvaluateVehicleDistance(Point, CurrentVehicle));
            const float Hybrid = EvaluateHybridDistance(Point, Clipmap, CurrentVehicle);
            const float Stale = std::min(EvaluateStaticDistance(Point), EvaluateVehicleDistance(Point, PreviousVehicle));
            HybridError += std::fabs(Hybrid - Exact);
            StaleError += std::fabs(Stale - Exact);
            ++SampleCount;
        }
    }
    Metrics.HybridMeanAbsoluteError = HybridError / static_cast<float>(SampleCount);
    Metrics.StaleMeanAbsoluteError = StaleError / static_cast<float>(SampleCount);

    WriteMetrics(OutputDirectory / "metrics.json", Metrics);
    const bool Passed = Metrics.CombinedStatistics.Finite && Metrics.PathStatistics.Finite &&
                        Metrics.CombinedStatistics.Mean > 0.001f && Metrics.CombinedStatistics.Maximum > Metrics.CombinedStatistics.Mean &&
                        Metrics.HybridMeanAbsoluteError < Metrics.StaleMeanAbsoluteError &&
                        Metrics.HybridRefreshMilliseconds < Metrics.FullRebakeMilliseconds;
    std::printf("determinism 0x%08x | hybrid %.4f m vs stale %.4f m | update %.3f ms vs full bake %.3f ms\n",
                Metrics.DeterminismHash, Metrics.HybridMeanAbsoluteError, Metrics.StaleMeanAbsoluteError,
                Metrics.HybridRefreshMilliseconds, Metrics.FullRebakeMilliseconds);
    std::printf("combined %.3f ms | deterministic 16-ray two-bounce path %.3f ms | finite=%s\n", Metrics.CombinedRenderMilliseconds,
                Metrics.PathTraceMilliseconds, Passed ? "PASS" : "FAIL");
    return Passed ? 0 : 3;
}
