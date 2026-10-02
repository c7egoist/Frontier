//============================================================================================================================================
//                                                GLOBALDISTANCEFIELDSPACE.CPP
//============================================================================================================================================
// 📦 World-space composite distance field volume accelerating scene-wide ray marching and coarse visibility queries.

#include "GlobalDistanceFieldSpace.h"
#include <algorithm>
#include <cmath>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

GlobalDistanceFieldSpace::GlobalDistanceFieldSpace(uint32_t InResolutionX,
                                                   uint32_t InResolutionY,
                                                   uint32_t InResolutionZ,
                                                   Vector3 InWorldBoundingMinimum,
                                                   Vector3 InWorldBoundingMaximum) noexcept
    : GlobalVolume(InResolutionX, InResolutionY, InResolutionZ, InWorldBoundingMinimum, InWorldBoundingMaximum)
    , WorldBoundingMinimum(InWorldBoundingMinimum)
    , WorldBoundingMaximum(InWorldBoundingMaximum)
{
}

//------------------------------------------------------------------------------------------------------------------------
//                                                REGISTRATION & UPDATE
//------------------------------------------------------------------------------------------------------------------------

uint32_t GlobalDistanceFieldSpace::RegisterPlacement(const DistanceFieldSpace* LocalField,
                                                     Vector3 Translation,
                                                     Vector3 Scale) noexcept
{
    if (!LocalField) return 0xFFFFFFFFu;

    DistanceFieldPlacement Placement{};
    Placement.WorldTranslation = Translation;
    Placement.WorldScale       = Scale;
    Placement.LocalField       = LocalField;
    Placement.InstanceIdentity = static_cast<uint32_t>(Placements.size());

    const Vector3 LocalMin = LocalField->GetBoundingMinimum();
    const Vector3 LocalMax = LocalField->GetBoundingMaximum();

    Placement.WorldBoundMin = Translation + Vector3{ LocalMin.x * Scale.x, LocalMin.y * Scale.y, LocalMin.z * Scale.z };
    Placement.WorldBoundMax = Translation + Vector3{ LocalMax.x * Scale.x, LocalMax.y * Scale.y, LocalMax.z * Scale.z };

    Placements.push_back(Placement);
    return Placement.InstanceIdentity;
}

void GlobalDistanceFieldSpace::UpdatePlacementTransform(uint32_t InstanceIdentity,
                                                        Vector3 NewTranslation,
                                                        Vector3 NewScale) noexcept
{
    if (InstanceIdentity >= Placements.size()) return;

    auto& Placement = Placements[InstanceIdentity];
    Placement.WorldTranslation = NewTranslation;
    Placement.WorldScale       = NewScale;

    if (Placement.LocalField)
    {
        const Vector3 LocalMin = Placement.LocalField->GetBoundingMinimum();
        const Vector3 LocalMax = Placement.LocalField->GetBoundingMaximum();
        Placement.WorldBoundMin = NewTranslation + Vector3{ LocalMin.x * NewScale.x, LocalMin.y * NewScale.y, LocalMin.z * NewScale.z };
        Placement.WorldBoundMax = NewTranslation + Vector3{ LocalMax.x * NewScale.x, LocalMax.y * NewScale.y, LocalMax.z * NewScale.z };
    }
}

void GlobalDistanceFieldSpace::UpdateGlobalGrid() noexcept
{
    const uint32_t ResX = GlobalVolume.GetResolutionX();
    const uint32_t ResY = GlobalVolume.GetResolutionY();
    const uint32_t ResZ = GlobalVolume.GetResolutionZ();
    const Vector3 BMin = GlobalVolume.GetBoundingMinimum();
    const Vector3 BMax = GlobalVolume.GetBoundingMaximum();
    const Vector3 Span = BMax - BMin;

    for (uint32_t Z = 0u; Z < ResZ; ++Z)
    {
        const float RatioZ = (static_cast<float>(Z) + 0.5f) / static_cast<float>(ResZ);
        const float WorldZ = BMin.z + RatioZ * Span.z;

        for (uint32_t Y = 0u; Y < ResY; ++Y)
        {
            const float RatioY = (static_cast<float>(Y) + 0.5f) / static_cast<float>(ResY);
            const float WorldY = BMin.y + RatioY * Span.y;

            for (uint32_t X = 0u; X < ResX; ++X)
            {
                const float RatioX = (static_cast<float>(X) + 0.5f) / static_cast<float>(ResX);
                const float WorldX = BMin.x + RatioX * Span.x;

                const Vector3 WorldPosition = { WorldX, WorldY, WorldZ };

                // Distance to ground plane z = 0
                float MinimumSceneDistance = WorldPosition.z;

                for (const auto& Placement : Placements)
                {
                    if (!Placement.LocalField) continue;

                    // Inverse transform world position to local mesh space
                    const Vector3 LocalPosition = {
                        (WorldPosition.x - Placement.WorldTranslation.x) / Placement.WorldScale.x,
                        (WorldPosition.y - Placement.WorldTranslation.y) / Placement.WorldScale.y,
                        (WorldPosition.z - Placement.WorldTranslation.z) / Placement.WorldScale.z
                    };

                    const float LocalDistance = Placement.LocalField->SampleDistance(LocalPosition);
                    const float MinimumScale  = std::min({ Placement.WorldScale.x, Placement.WorldScale.y, Placement.WorldScale.z });
                    const float ScaledDistance = LocalDistance * MinimumScale;

                    if (ScaledDistance < MinimumSceneDistance)
                    {
                        MinimumSceneDistance = ScaledDistance;
                    }
                }

                GlobalVolume.SetVoxelSample(X, Y, Z, MinimumSceneDistance);
            }
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SCENE QUERIES
//------------------------------------------------------------------------------------------------------------------------

float GlobalDistanceFieldSpace::SampleSceneDistance(Vector3 WorldPosition) const noexcept
{
    return GlobalVolume.SampleDistance(WorldPosition);
}

Vector3 GlobalDistanceFieldSpace::SampleSceneNormal(Vector3 WorldPosition) const noexcept
{
    return GlobalVolume.SampleNormal(WorldPosition);
}

//------------------------------------------------------------------------------------------------------------------------
//                                            HIERARCHICAL SCENE RAY MARCH
//------------------------------------------------------------------------------------------------------------------------

DistanceFieldHitRecord GlobalDistanceFieldSpace::MarchSceneRay(Vector3 RayOrigin,
                                                               Vector3 RayDirection,
                                                               float MinimumDistance,
                                                               float MaximumDistance,
                                                               float SurfaceThreshold,
                                                               uint32_t MaximumSteps,
                                                               float StepRelaxation,
                                                               float TransitionDistance) const noexcept
{
    DistanceFieldHitRecord ResultRecord{};
    ResultRecord.TravelDistance   = MinimumDistance;
    ResultRecord.StepCount        = 0u;
    ResultRecord.InstanceIdentity = 0xFFFFFFFFu;
    ResultRecord.HasHit           = false;

    float CurrentDistance = MinimumDistance;

    for (uint32_t Step = 0u; Step < MaximumSteps && CurrentDistance < MaximumDistance; ++Step)
    {
        ResultRecord.StepCount++;
        const Vector3 SamplePosition = RayOrigin + RayDirection * CurrentDistance;

        // Ground plane collision at z = 0
        if (SamplePosition.z <= SurfaceThreshold && RayDirection.z < -1e-4f)
        {
            const float HitT = (0.0f - RayOrigin.z) / RayDirection.z;
            if (HitT >= MinimumDistance && HitT <= MaximumDistance)
            {
                ResultRecord.HasHit           = true;
                ResultRecord.TravelDistance   = HitT;
                ResultRecord.HitPosition      = RayOrigin + RayDirection * HitT;
                ResultRecord.SurfaceNormal    = Vector3{ 0.0f, 0.0f, 1.0f };
                ResultRecord.InstanceIdentity = 0xFFFFFFFFu; // ground
                return ResultRecord;
            }
        }

        // Sample coarse global distance field
        const float CoarseDistance = GlobalVolume.SampleDistance(SamplePosition);

        // When sufficiently far from surfaces, take large accelerated steps via the global field
        if (CoarseDistance > TransitionDistance)
        {
            CurrentDistance += CoarseDistance * StepRelaxation;
            continue;
        }

        // Near surface: refine against the most proximal local mesh field
        float FineDistance = CoarseDistance;
        const DistanceFieldPlacement* NearestPlacement = nullptr;
        Vector3 NearestLocalPosition{};

        for (const auto& Placement : Placements)
        {
            if (!Placement.LocalField) continue;

            const Vector3 LocalPos = {
                (SamplePosition.x - Placement.WorldTranslation.x) / Placement.WorldScale.x,
                (SamplePosition.y - Placement.WorldTranslation.y) / Placement.WorldScale.y,
                (SamplePosition.z - Placement.WorldTranslation.z) / Placement.WorldScale.z
            };

            const float LocalDist = Placement.LocalField->SampleDistance(LocalPos);
            const float MinScale  = std::min({ Placement.WorldScale.x, Placement.WorldScale.y, Placement.WorldScale.z });
            const float ScaledDist = LocalDist * MinScale;

            if (ScaledDist < FineDistance)
            {
                FineDistance = ScaledDist;
                NearestPlacement = &Placement;
                NearestLocalPosition = LocalPos;
            }
        }

        if (FineDistance <= SurfaceThreshold)
        {
            ResultRecord.HasHit           = true;
            ResultRecord.TravelDistance   = CurrentDistance;
            ResultRecord.HitPosition      = SamplePosition;
            ResultRecord.InstanceIdentity = NearestPlacement ? NearestPlacement->InstanceIdentity : 0xFFFFFFFFu;

            if (NearestPlacement && NearestPlacement->LocalField)
            {
                const Vector3 LocalNormal = NearestPlacement->LocalField->SampleNormal(NearestLocalPosition);
                ResultRecord.SurfaceNormal = LocalNormal.Normalized();
            }
            else
            {
                ResultRecord.SurfaceNormal = GlobalVolume.SampleNormal(SamplePosition);
            }

            return ResultRecord;
        }

        const float SafeAdvance = std::max(FineDistance * StepRelaxation, SurfaceThreshold * 0.5f);
        CurrentDistance += SafeAdvance;
    }

    return ResultRecord;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                SCENE SOFT SHADOWS
//------------------------------------------------------------------------------------------------------------------------

float GlobalDistanceFieldSpace::MarchSceneSoftShadow(Vector3 ShadingPosition,
                                                     Vector3 IlluminantDirection,
                                                     float MinimumDistance,
                                                     float MaximumDistance,
                                                     float LightAngularSize,
                                                     uint32_t MaximumSteps) const noexcept
{
    float ShadowPenumbra = 1.0f;
    float CurrentDistance = MinimumDistance;
    const float PenumbraScale = 1.0f / std::max(0.01f, std::tan(LightAngularSize));

    for (uint32_t Step = 0u; Step < MaximumSteps && CurrentDistance < MaximumDistance; ++Step)
    {
        const Vector3 SamplePosition = ShadingPosition + IlluminantDirection * CurrentDistance;

        // Ground plane shadow test
        if (SamplePosition.z <= 0.001f && IlluminantDirection.z < 0.0f)
            return 0.0f;

        const float EvaluatedDistance = GlobalVolume.SampleDistance(SamplePosition);
        if (EvaluatedDistance <= 0.001f)
            return 0.0f;

        const float StepPenumbra = PenumbraScale * EvaluatedDistance / CurrentDistance;
        ShadowPenumbra = std::min(ShadowPenumbra, StepPenumbra);

        const float StepAdvance = std::max(EvaluatedDistance * 0.85f, 0.004f);
        CurrentDistance += StepAdvance;
    }

    return std::clamp(ShadowPenumbra, 0.0f, 1.0f);
}

} // namespace Frontier
