//============================================================================================================================================
//                                                  SURFACECACHESTRUCTURE.CPP
//============================================================================================================================================
// 📦 2D Surface Cache atlas storing parameterised surface irradiance, direct illuminant caching, and multi-bounce radiance.

#include "SurfaceCacheStructure.h"
#include <cmath>
#include <algorithm>

namespace Frontier {

namespace {

constexpr float kPi = 3.14159265358979323846f;

inline float Dot(const Vector3& A, const Vector3& B) noexcept
{
    return A.x * B.x + A.y * B.y + A.z * B.z;
}

inline Vector3 Cross(const Vector3& A, const Vector3& B) noexcept
{
    return {
        A.y * B.z - A.z * B.y,
        A.z * B.x - A.x * B.z,
        A.x * B.y - A.y * B.x
    };
}

// Halton low-discrepancy sequence for hemispherical directions
float HaltonSequence(uint32_t Index, uint32_t Base) noexcept
{
    float Result = 0.0f;
    float Factor = 1.0f / static_cast<float>(Base);
    uint32_t Current = Index;
    while (Current > 0u)
    {
        Result += static_cast<float>(Current % Base) * Factor;
        Current /= Base;
        Factor /= static_cast<float>(Base);
    }
    return Result;
}

Vector3 SampleCosineHemisphere(Vector3 Normal, float U1, float U2) noexcept
{
    const float RadialDistance = std::sqrt(U1);
    const float AzimuthAngle   = 2.0f * kPi * U2;

    const float LocalX = RadialDistance * std::cos(AzimuthAngle);
    const float LocalY = RadialDistance * std::sin(AzimuthAngle);
    const float LocalZ = std::sqrt(std::max(0.0f, 1.0f - U1));

    // Construct orthonormal basis around normal
    Vector3 TangentX = (std::abs(Normal.z) < 0.999f)
        ? Cross(Normal, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized()
        : Cross(Normal, Vector3{ 1.0f, 0.0f, 0.0f }).Normalized();
    Vector3 TangentY = Cross(Normal, TangentX).Normalized();

    return (TangentX * LocalX + TangentY * LocalY + Normal * LocalZ).Normalized();
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

SurfaceCacheStructure::SurfaceCacheStructure(uint32_t InAtlasWidth, uint32_t InAtlasHeight) noexcept
    : AtlasWidth(InAtlasWidth)
    , AtlasHeight(InAtlasHeight)
{
    TexelAtlas.resize(static_cast<size_t>(AtlasWidth) * AtlasHeight);
}

//------------------------------------------------------------------------------------------------------------------------
//                                               SHADERBALL PARAMETERIZATION
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::ParameterizeShaderBall(Vector3 Center, float Radius, Vector3 BaseAlbedo) noexcept
{
    // Divide atlas into cards: Card 0 = Outer Dome & Concave Bowl, Card 1 = Inner Sphere & Cushion Base
    for (uint32_t Y = 0u; Y < AtlasHeight; ++Y)
    {
        const float V = (static_cast<float>(Y) + 0.5f) / static_cast<float>(AtlasHeight);
        const float Latitude = (V - 0.5f) * kPi;

        for (uint32_t X = 0u; X < AtlasWidth; ++X)
        {
            const float U = (static_cast<float>(X) + 0.5f) / static_cast<float>(AtlasWidth);
            const float Longitude = U * 2.0f * kPi;

            SurfaceCacheTexel& Texel = GetMutableTexel(X, Y);
            Texel.IsAllocated = true;

            const float CosLat = std::cos(Latitude);
            const float SinLat = std::sin(Latitude);
            const float CosLon = std::cos(Longitude);
            const float SinLon = std::sin(Longitude);

            Texel.SurfaceNormal = Vector3{ CosLat * CosLon, CosLat * SinLon, SinLat }.Normalized();

            // Shaderball profile: top dome, bottom cushion ring, and recessed cavity
            float RadialFactor = Radius;
            if (SinLat < -0.1f)
            {
                // Flared base cushion
                RadialFactor *= 1.15f;
            }
            else if (CosLon > 0.3f && SinLat > -0.2f && SinLat < 0.6f)
            {
                // Concave viewing scoop
                RadialFactor *= 0.82f;
            }

            Texel.WorldPosition    = Center + Texel.SurfaceNormal * RadialFactor;
            Texel.AlbedoColour     = BaseAlbedo;
            Texel.DirectRadiance   = Vector3{ 0.0f, 0.0f, 0.0f };
            Texel.IrradianceBounce = Vector3{ 0.05f, 0.05f, 0.05f }; // subtle ambient seed
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                               DIRECT ILLUMINANT UPDATE
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::UpdateDirectLighting(Vector3 IlluminantDirection,
                                                 Vector3 IlluminantRadiance,
                                                 const GlobalDistanceFieldSpace& DistanceField,
                                                 float LightAngularSize) noexcept
{
    for (size_t Index = 0u; Index < TexelAtlas.size(); ++Index)
    {
        SurfaceCacheTexel& Texel = TexelAtlas[Index];
        if (!Texel.IsAllocated) continue;

        const float NDotL = std::max(0.0f, Dot(Texel.SurfaceNormal, IlluminantDirection));
        if (NDotL <= 1e-4f)
        {
            Texel.DirectRadiance = Vector3{ 0.0f, 0.0f, 0.0f };
            continue;
        }

        // Distance field soft shadow test from texel world position
        const Vector3 RayOrigin = Texel.WorldPosition + Texel.SurfaceNormal * 0.015f;
        const float ShadowFactor = DistanceField.MarchSceneSoftShadow(RayOrigin,
                                                                      IlluminantDirection,
                                                                      0.02f,
                                                                      4.0f,
                                                                      LightAngularSize,
                                                                      24u);

        Texel.DirectRadiance = IlluminantRadiance * (NDotL * ShadowFactor);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                           INDIRECT IRRADIANCE PROPAGATION
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::PropagateIndirectIrradiance(const GlobalDistanceFieldSpace& DistanceField,
                                                        uint32_t RaysPerTexel) noexcept
{
    std::vector<Vector3> NextIrradiance(TexelAtlas.size(), Vector3{ 0.0f, 0.0f, 0.0f });

    for (size_t Index = 0u; Index < TexelAtlas.size(); ++Index)
    {
        const SurfaceCacheTexel& Texel = TexelAtlas[Index];
        if (!Texel.IsAllocated) continue;

        Vector3 AccumulatedIrradiance{ 0.0f, 0.0f, 0.0f };

        for (uint32_t RayIndex = 0u; RayIndex < RaysPerTexel; ++RayIndex)
        {
            const float U1 = HaltonSequence(RayIndex + 1u, 2u);
            const float U2 = HaltonSequence(RayIndex + 1u, 3u);
            const Vector3 RayDirection = SampleCosineHemisphere(Texel.SurfaceNormal, U1, U2);

            const Vector3 RayOrigin = Texel.WorldPosition + Texel.SurfaceNormal * 0.02f;
            const DistanceFieldHitRecord Hit = DistanceField.MarchSceneRay(RayOrigin,
                                                                           RayDirection,
                                                                           0.025f,
                                                                           3.0f,
                                                                           0.003f,
                                                                           48u,
                                                                           0.85f);

            if (Hit.HasHit)
            {
                // Sample radiance from the hit surface
                const Vector3 HitRadiance = SampleRadianceFromWorld(Hit.HitPosition, Hit.SurfaceNormal);
                AccumulatedIrradiance += HitRadiance;
            }
            else
            {
                // Sky radiance
                const float SkyGradient = std::max(0.0f, RayDirection.z) * 0.5f + 0.5f;
                const Vector3 SkyRadiance = Vector3{ 0.35f, 0.50f, 0.75f } * (SkyGradient * 0.4f);
                AccumulatedIrradiance += SkyRadiance;
            }
        }

        NextIrradiance[Index] = AccumulatedIrradiance / static_cast<float>(RaysPerTexel);
    }

    // Blend into irradiance atlas with temporal accumulation factor
    for (size_t Index = 0u; Index < TexelAtlas.size(); ++Index)
    {
        TexelAtlas[Index].IrradianceBounce = TexelAtlas[Index].IrradianceBounce * 0.2f + NextIrradiance[Index] * 0.8f;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    RADIANCE SAMPLING
//------------------------------------------------------------------------------------------------------------------------

Vector3 SurfaceCacheStructure::SampleRadiance(Vector3 /*WorldPosition*/,
                                              Vector3 /*SurfaceNormal*/,
                                              float TextureCoordinateU,
                                              float TextureCoordinateV) const noexcept
{
    // Bilinear atlas lookup
    const float CoordX = std::clamp(TextureCoordinateU, 0.0f, 1.0f) * static_cast<float>(AtlasWidth - 1u);
    const float CoordY = std::clamp(TextureCoordinateV, 0.0f, 1.0f) * static_cast<float>(AtlasHeight - 1u);

    const uint32_t X0 = static_cast<uint32_t>(std::floor(CoordX));
    const uint32_t Y0 = static_cast<uint32_t>(std::floor(CoordY));
    const uint32_t X1 = std::min(X0 + 1u, AtlasWidth - 1u);
    const uint32_t Y1 = std::min(Y0 + 1u, AtlasHeight - 1u);

    const float FractionX = CoordX - static_cast<float>(X0);
    const float FractionY = CoordY - static_cast<float>(Y0);

    const auto GetTexelRadiance = [this](uint32_t X, uint32_t Y) noexcept -> Vector3
    {
        const SurfaceCacheTexel& T = GetTexel(X, Y);
        return (T.DirectRadiance + T.IrradianceBounce) * T.AlbedoColour;
    };

    const Vector3 Rad00 = GetTexelRadiance(X0, Y0);
    const Vector3 Rad10 = GetTexelRadiance(X1, Y0);
    const Vector3 Rad01 = GetTexelRadiance(X0, Y1);
    const Vector3 Rad11 = GetTexelRadiance(X1, Y1);

    const Vector3 Interp0 = Rad00 * (1.0f - FractionX) + Rad10 * FractionX;
    const Vector3 Interp1 = Rad01 * (1.0f - FractionX) + Rad11 * FractionX;

    return Interp0 * (1.0f - FractionY) + Interp1 * FractionY;
}

Vector3 SurfaceCacheStructure::SampleRadianceFromWorld(Vector3 WorldPosition, Vector3 SurfaceNormal) const noexcept
{
    // Ground plane hit: return ground plane reflectancy
    if (WorldPosition.z <= 0.01f)
    {
        const Vector3 GroundAlbedo = { 0.45f, 0.45f, 0.45f };
        const Vector3 GroundLight  = { 0.8f, 0.8f, 0.8f };
        return GroundAlbedo * GroundLight;
    }

    // Spherical projection from surface normal into atlas UV
    const float Longitude = std::atan2(SurfaceNormal.y, SurfaceNormal.x);
    const float NormalizedU = (Longitude < 0.0f ? (Longitude + 2.0f * kPi) : Longitude) / (2.0f * kPi);
    const float NormalizedV = std::clamp(SurfaceNormal.z * 0.5f + 0.5f, 0.0f, 1.0f);

    return SampleRadiance(WorldPosition, SurfaceNormal, NormalizedU, NormalizedV);
}

} // namespace Frontier
