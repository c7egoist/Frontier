//============================================================================================================================================
//                                                  SURFACECACHESTRUCTURE.CPP
//============================================================================================================================================
// 📦 2D Surface Cache atlas storing parameterised surface irradiance, direct illuminant caching, and multi-bounce radiance.

#include "SurfaceCacheStructure.h"
#include <cmath>
#include <algorithm>

#if defined(_OPENMP)
    #include <omp.h>
#endif

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
    BakeState.TotalTexels = AtlasWidth * AtlasHeight;
}

//------------------------------------------------------------------------------------------------------------------------
//                                              SURFACE CARD REGISTRATION
//------------------------------------------------------------------------------------------------------------------------

uint32_t SurfaceCacheStructure::RegisterShaderBallCard(uint32_t InstanceId,
                                                      Vector3 Center,
                                                      float Radius,
                                                      Vector3 BaseAlbedo) noexcept
{
    uint32_t CardId = static_cast<uint32_t>(Cards.size());
    SurfaceCard Card{};
    Card.CardId = CardId;
    Card.InstanceId = InstanceId;
    Card.Center = Center;
    Card.Radius = Radius;
    Card.BaseAlbedo = BaseAlbedo;

    // Grid layout: 2x2 cards (128x128 each) in 256x256, or 4x4 cards in 512x512
    uint32_t TilesPerRow = AtlasWidth / 128u;
    if (TilesPerRow == 0u) TilesPerRow = 1u;

    Card.TileWidth  = 128u;
    Card.TileHeight = 128u;
    Card.AtlasOffsetX = (CardId % TilesPerRow) * Card.TileWidth;
    Card.AtlasOffsetY = (CardId / TilesPerRow) * Card.TileHeight;
    Card.IsDirty = true;

    // Parameterize texels inside this card's tile
    for (uint32_t LocalY = 0u; LocalY < Card.TileHeight; ++LocalY)
    {
        uint32_t AtlasY = Card.AtlasOffsetY + LocalY;
        if (AtlasY >= AtlasHeight) continue;

        const float V = (static_cast<float>(LocalY) + 0.5f) / static_cast<float>(Card.TileHeight);
        const float Latitude = (V - 0.5f) * kPi;

        for (uint32_t LocalX = 0u; LocalX < Card.TileWidth; ++LocalX)
        {
            uint32_t AtlasX = Card.AtlasOffsetX + LocalX;
            if (AtlasX >= AtlasWidth) continue;

            const float U = (static_cast<float>(LocalX) + 0.5f) / static_cast<float>(Card.TileWidth);
            const float Longitude = U * 2.0f * kPi;

            SurfaceCacheTexel& Texel = GetMutableTexel(AtlasX, AtlasY);
            Texel.IsAllocated = true;
            Texel.IsDirty     = true;
            Texel.CardIndex   = CardId;

            const float CosLat = std::cos(Latitude);
            const float SinLat = std::sin(Latitude);
            const float CosLon = std::cos(Longitude);
            const float SinLon = std::sin(Longitude);

            Texel.SurfaceNormal = Vector3{ CosLat * CosLon, CosLat * SinLon, SinLat }.Normalized();

            float RadialFactor = Radius;
            if (SinLat < -0.1f)
            {
                RadialFactor *= 1.15f; // cushion base
            }
            else if (CosLon > 0.3f && SinLat > -0.2f && SinLat < 0.6f)
            {
                RadialFactor *= 0.82f; // cavity
            }

            Texel.WorldPosition    = Center + Texel.SurfaceNormal * RadialFactor;
            Texel.AlbedoColour     = BaseAlbedo;
            Texel.DirectRadiance   = Vector3{ 0.0f, 0.0f, 0.0f };
            Texel.IrradianceBounce = Vector3{ 0.05f, 0.05f, 0.05f };
        }
    }

    Cards.push_back(Card);
    return CardId;
}

void SurfaceCacheStructure::UpdateCardTransform(uint32_t CardId, Vector3 NewCenter) noexcept
{
    if (CardId >= Cards.size()) return;
    SurfaceCard& Card = Cards[CardId];
    Card.Center = NewCenter;
    Card.IsDirty = true;

    for (uint32_t LocalY = 0u; LocalY < Card.TileHeight; ++LocalY)
    {
        uint32_t AtlasY = Card.AtlasOffsetY + LocalY;
        if (AtlasY >= AtlasHeight) continue;

        const float V = (static_cast<float>(LocalY) + 0.5f) / static_cast<float>(Card.TileHeight);
        const float Latitude = (V - 0.5f) * kPi;

        for (uint32_t LocalX = 0u; LocalX < Card.TileWidth; ++LocalX)
        {
            uint32_t AtlasX = Card.AtlasOffsetX + LocalX;
            if (AtlasX >= AtlasWidth) continue;

            const float U = (static_cast<float>(LocalX) + 0.5f) / static_cast<float>(Card.TileWidth);
            const float Longitude = U * 2.0f * kPi;

            SurfaceCacheTexel& Texel = GetMutableTexel(AtlasX, AtlasY);
            Texel.IsDirty = true;

            const float CosLat = std::cos(Latitude);
            const float SinLat = std::sin(Latitude);
            const float CosLon = std::cos(Longitude);
            const float SinLon = std::sin(Longitude);

            Texel.SurfaceNormal = Vector3{ CosLat * CosLon, CosLat * SinLon, SinLat }.Normalized();

            float RadialFactor = Card.Radius;
            if (SinLat < -0.1f) RadialFactor *= 1.15f;
            else if (CosLon > 0.3f && SinLat > -0.2f && SinLat < 0.6f) RadialFactor *= 0.82f;

            Texel.WorldPosition = NewCenter + Texel.SurfaceNormal * RadialFactor;
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                           LEGACY HERO PARAMETERIZATION
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::ParameterizeShaderBall(Vector3 Center, float Radius, Vector3 BaseAlbedo) noexcept
{
    Cards.clear();
    RegisterShaderBallCard(0u, Center, Radius, BaseAlbedo);
}

//------------------------------------------------------------------------------------------------------------------------
//                                         ASYNC / TIME-SLICED DIRECT BAKE
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::QueueAsyncDirectBake(Vector3 IlluminantDirection,
                                                 Vector3 IlluminantRadiance,
                                                 float LightAngularSize) noexcept
{
    BakeState.IlluminantDirection = IlluminantDirection.Normalized();
    BakeState.IlluminantRadiance  = IlluminantRadiance;
    BakeState.LightAngularSize    = LightAngularSize;
    BakeState.CurrentTexelCursor  = 0u;
    BakeState.TotalTexels         = static_cast<uint32_t>(TexelAtlas.size());
    BakeState.IsBakingActive      = true;
    BakeState.IsCompleted         = false;
}

bool SurfaceCacheStructure::StepAsyncDirectBake(const GlobalDistanceFieldSpace& DistanceField,
                                                uint32_t TexelBudget) noexcept
{
    if (!BakeState.IsBakingActive || BakeState.IsCompleted) return true;

    uint32_t StartIdx = BakeState.CurrentTexelCursor;
    uint32_t EndIdx = std::min(StartIdx + TexelBudget, BakeState.TotalTexels);

    Vector3 SunDir = BakeState.IlluminantDirection;
    Vector3 SunRad = BakeState.IlluminantRadiance;
    float AngularSize = BakeState.LightAngularSize;

#if defined(_OPENMP)
    #pragma omp parallel for schedule(static)
#endif
    for (int32_t Index = static_cast<int32_t>(StartIdx); Index < static_cast<int32_t>(EndIdx); ++Index)
    {
        SurfaceCacheTexel& Texel = TexelAtlas[Index];
        if (!Texel.IsAllocated) continue;

        const float NDotL = std::max(0.0f, Dot(Texel.SurfaceNormal, SunDir));
        if (NDotL <= 1e-4f)
        {
            Texel.DirectRadiance = Vector3{ 0.0f, 0.0f, 0.0f };
            Texel.IsDirty = false;
            continue;
        }

        // Distance field soft shadow march from texel position
        const Vector3 RayOrigin = Texel.WorldPosition + Texel.SurfaceNormal * 0.015f;
        const float ShadowFactor = DistanceField.MarchSceneSoftShadow(RayOrigin,
                                                                      SunDir,
                                                                      0.02f,
                                                                      5.0f,
                                                                      AngularSize,
                                                                      24u,
                                                                      Texel.CardIndex);

        Texel.DirectRadiance = SunRad * (NDotL * ShadowFactor);
        Texel.IsDirty = false;
    }

    BakeState.CurrentTexelCursor = EndIdx;
    if (BakeState.CurrentTexelCursor >= BakeState.TotalTexels)
    {
        BakeState.IsCompleted = true;
        BakeState.IsBakingActive = false;
        BakeState.BakedPassCounter++;
        return true;
    }
    return false;
}

//------------------------------------------------------------------------------------------------------------------------
//                                    MULTITHREADED SYNCHRONOUS DIRECT BAKE
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::BakeDirectLightingMultithreaded(Vector3 IlluminantDirection,
                                                            Vector3 IlluminantRadiance,
                                                            const GlobalDistanceFieldSpace& DistanceField,
                                                            float LightAngularSize) noexcept
{
    const Vector3 SunDir = IlluminantDirection.Normalized();
    const size_t TexelCount = TexelAtlas.size();

#if defined(_OPENMP)
    #pragma omp parallel for schedule(dynamic, 64)
#endif
    for (int32_t Index = 0; Index < static_cast<int32_t>(TexelCount); ++Index)
    {
        SurfaceCacheTexel& Texel = TexelAtlas[Index];
        if (!Texel.IsAllocated) continue;

        const float NDotL = std::max(0.0f, Dot(Texel.SurfaceNormal, SunDir));
        if (NDotL <= 1e-4f)
        {
            Texel.DirectRadiance = Vector3{ 0.0f, 0.0f, 0.0f };
            Texel.IsDirty = false;
            continue;
        }

        const Vector3 RayOrigin = Texel.WorldPosition + Texel.SurfaceNormal * 0.015f;
        const float ShadowFactor = DistanceField.MarchSceneSoftShadow(RayOrigin,
                                                                      SunDir,
                                                                      0.02f,
                                                                      5.0f,
                                                                      LightAngularSize,
                                                                      24u,
                                                                      Texel.CardIndex);

        Texel.DirectRadiance = IlluminantRadiance * (NDotL * ShadowFactor);
        Texel.IsDirty = false;
    }

    BakeState.BakedPassCounter++;
    BakeState.IsCompleted = true;
    BakeState.IsBakingActive = false;
}

void SurfaceCacheStructure::UpdateDirectLighting(Vector3 IlluminantDirection,
                                                 Vector3 IlluminantRadiance,
                                                 const GlobalDistanceFieldSpace& DistanceField,
                                                 float LightAngularSize) noexcept
{
    BakeDirectLightingMultithreaded(IlluminantDirection, IlluminantRadiance, DistanceField, LightAngularSize);
}

//------------------------------------------------------------------------------------------------------------------------
//                                           INDIRECT IRRADIANCE PROPAGATION
//------------------------------------------------------------------------------------------------------------------------

void SurfaceCacheStructure::PropagateIndirectIrradiance(const GlobalDistanceFieldSpace& DistanceField,
                                                        uint32_t RaysPerTexel) noexcept
{
    std::vector<Vector3> NextIrradiance(TexelAtlas.size(), Vector3{ 0.0f, 0.0f, 0.0f });

#if defined(_OPENMP)
    #pragma omp parallel for schedule(dynamic, 32)
#endif
    for (int32_t Index = 0; Index < static_cast<int32_t>(TexelAtlas.size()); ++Index)
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
                const Vector3 HitRadiance = SampleRadianceFromWorld(Hit.HitPosition, Hit.SurfaceNormal, Hit.InstanceIdentity);
                AccumulatedIrradiance += HitRadiance;
            }
            else
            {
                const float SkyGradient = std::max(0.0f, RayDirection.z) * 0.5f + 0.5f;
                const Vector3 SkyRadiance = Vector3{ 0.35f, 0.50f, 0.75f } * (SkyGradient * 0.4f);
                AccumulatedIrradiance += SkyRadiance;
            }
        }

        NextIrradiance[Index] = AccumulatedIrradiance / static_cast<float>(RaysPerTexel);
    }

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

Vector3 SurfaceCacheStructure::SampleRadianceFromWorld(Vector3 WorldPosition,
                                                      Vector3 SurfaceNormal,
                                                      uint32_t InstanceId) const noexcept
{
    // Ground plane hit
    if (WorldPosition.z <= 0.015f)
    {
        const Vector3 GroundAlbedo = { 0.35f, 0.36f, 0.40f };
        const Vector3 GroundLight  = { 0.95f, 0.95f, 0.95f };
        return GroundAlbedo * GroundLight;
    }

    // Identify card corresponding to InstanceId
    const SurfaceCard* TargetCard = nullptr;
    if (InstanceId < Cards.size())
    {
        TargetCard = &Cards[InstanceId];
    }
    else if (!Cards.empty())
    {
        TargetCard = &Cards[0];
    }

    if (!TargetCard)
    {
        return Vector3{ 0.5f, 0.5f, 0.5f };
    }

    // Spherical projection from surface normal into tile UV
    const float Longitude = std::atan2(SurfaceNormal.y, SurfaceNormal.x);
    const float LocalU = (Longitude < 0.0f ? (Longitude + 2.0f * kPi) : Longitude) / (2.0f * kPi);
    const float LocalV = std::clamp(SurfaceNormal.z * 0.5f + 0.5f, 0.0f, 1.0f);

    // Map local tile UV into global atlas UV
    const float GlobalU = (static_cast<float>(TargetCard->AtlasOffsetX) + LocalU * static_cast<float>(TargetCard->TileWidth - 1u)) / static_cast<float>(AtlasWidth);
    const float GlobalV = (static_cast<float>(TargetCard->AtlasOffsetY) + LocalV * static_cast<float>(TargetCard->TileHeight - 1u)) / static_cast<float>(AtlasHeight);

    return SampleRadiance(WorldPosition, SurfaceNormal, GlobalU, GlobalV);
}

} // namespace Frontier
