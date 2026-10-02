//============================================================================================================================================
//                                                   DISTANCEFIELDSPACE.CPP
//============================================================================================================================================
// 📦 3D Signed Distance Field voxel representation for geometric query, ray marching, and soft shadow evaluation.

#include "DistanceFieldSpace.h"
#include <fstream>
#include <algorithm>
#include <cmath>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

DistanceFieldSpace::DistanceFieldSpace(uint32_t InResolutionX,
                                       uint32_t InResolutionY,
                                       uint32_t InResolutionZ,
                                       Vector3 InBoundingMinimum,
                                       Vector3 InBoundingMaximum) noexcept
    : ResolutionX(InResolutionX)
    , ResolutionY(InResolutionY)
    , ResolutionZ(InResolutionZ)
    , BoundingMinimum(InBoundingMinimum)
    , BoundingMaximum(InBoundingMaximum)
{
    VoxelSpacing.x = (ResolutionX > 0u) ? ((BoundingMaximum.x - BoundingMinimum.x) / static_cast<float>(ResolutionX)) : 0.0f;
    VoxelSpacing.y = (ResolutionY > 0u) ? ((BoundingMaximum.y - BoundingMinimum.y) / static_cast<float>(ResolutionY)) : 0.0f;
    VoxelSpacing.z = (ResolutionZ > 0u) ? ((BoundingMaximum.z - BoundingMinimum.z) / static_cast<float>(ResolutionZ)) : 0.0f;
    DistanceSamples.resize(static_cast<size_t>(ResolutionX) * ResolutionY * ResolutionZ, 1e6f);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 TRILINEAR SAMPLING
//------------------------------------------------------------------------------------------------------------------------

float DistanceFieldSpace::SampleDistance(Vector3 SpatialPosition) const noexcept
{
    if (ResolutionX == 0u || ResolutionY == 0u || ResolutionZ == 0u || DistanceSamples.empty())
        return 1e6f;

    const float SpanX = BoundingMaximum.x - BoundingMinimum.x;
    const float SpanY = BoundingMaximum.y - BoundingMinimum.y;
    const float SpanZ = BoundingMaximum.z - BoundingMinimum.z;

    if (SpanX <= 1e-6f || SpanY <= 1e-6f || SpanZ <= 1e-6f)
        return 1e6f;

    // Fractional voxel coordinates with half-cell centering
    const float CoordX = (SpatialPosition.x - BoundingMinimum.x) / SpanX * static_cast<float>(ResolutionX) - 0.5f;
    const float CoordY = (SpatialPosition.y - BoundingMinimum.y) / SpanY * static_cast<float>(ResolutionY) - 0.5f;
    const float CoordZ = (SpatialPosition.z - BoundingMinimum.z) / SpanZ * static_cast<float>(ResolutionZ) - 0.5f;

    // Integer cell index clamped to interior span
    const int32_t IndexX = std::clamp(static_cast<int32_t>(std::floor(CoordX)), 0, static_cast<int32_t>(ResolutionX) - 2);
    const int32_t IndexY = std::clamp(static_cast<int32_t>(std::floor(CoordY)), 0, static_cast<int32_t>(ResolutionY) - 2);
    const int32_t IndexZ = std::clamp(static_cast<int32_t>(std::floor(CoordZ)), 0, static_cast<int32_t>(ResolutionZ) - 2);

    // Trilinear interpolation weights
    const float FractionX = std::clamp(CoordX - static_cast<float>(IndexX), 0.0f, 1.0f);
    const float FractionY = std::clamp(CoordY - static_cast<float>(IndexY), 0.0f, 1.0f);
    const float FractionZ = std::clamp(CoordZ - static_cast<float>(IndexZ), 0.0f, 1.0f);

    const auto ReadVoxel = [this](int32_t X, int32_t Y, int32_t Z) noexcept -> float
    {
        const size_t LinearIndex = static_cast<size_t>(Z) * ResolutionY * ResolutionX +
                                   static_cast<size_t>(Y) * ResolutionX +
                                   static_cast<size_t>(X);
        return DistanceSamples[LinearIndex];
    };

    const float Sample000 = ReadVoxel(IndexX,     IndexY,     IndexZ);
    const float Sample100 = ReadVoxel(IndexX + 1, IndexY,     IndexZ);
    const float Sample010 = ReadVoxel(IndexX,     IndexY + 1, IndexZ);
    const float Sample110 = ReadVoxel(IndexX + 1, IndexY + 1, IndexZ);
    const float Sample001 = ReadVoxel(IndexX,     IndexY,     IndexZ + 1);
    const float Sample101 = ReadVoxel(IndexX + 1, IndexY,     IndexZ + 1);
    const float Sample011 = ReadVoxel(IndexX,     IndexY + 1, IndexZ + 1);
    const float Sample111 = ReadVoxel(IndexX + 1, IndexY + 1, IndexZ + 1);

    const float Interp00 = Sample000 * (1.0f - FractionX) + Sample100 * FractionX;
    const float Interp10 = Sample010 * (1.0f - FractionX) + Sample110 * FractionX;
    const float Interp01 = Sample001 * (1.0f - FractionX) + Sample101 * FractionX;
    const float Interp11 = Sample011 * (1.0f - FractionX) + Sample111 * FractionX;

    const float Interp0  = Interp00  * (1.0f - FractionY) + Interp10  * FractionY;
    const float Interp1  = Interp01  * (1.0f - FractionY) + Interp11  * FractionY;

    return Interp0 * (1.0f - FractionZ) + Interp1 * FractionZ;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SURFACE NORMAL
//------------------------------------------------------------------------------------------------------------------------

Vector3 DistanceFieldSpace::SampleNormal(Vector3 SpatialPosition) const noexcept
{
    const float OffsetEpsilon = std::max(1e-4f, std::min({ VoxelSpacing.x, VoxelSpacing.y, VoxelSpacing.z }) * 0.45f);

    const float DeltaX = SampleDistance(Vector3{ SpatialPosition.x + OffsetEpsilon, SpatialPosition.y, SpatialPosition.z }) -
                         SampleDistance(Vector3{ SpatialPosition.x - OffsetEpsilon, SpatialPosition.y, SpatialPosition.z });
    const float DeltaY = SampleDistance(Vector3{ SpatialPosition.x, SpatialPosition.y + OffsetEpsilon, SpatialPosition.z }) -
                         SampleDistance(Vector3{ SpatialPosition.x, SpatialPosition.y - OffsetEpsilon, SpatialPosition.z });
    const float DeltaZ = SampleDistance(Vector3{ SpatialPosition.x, SpatialPosition.y, SpatialPosition.z + OffsetEpsilon }) -
                         SampleDistance(Vector3{ SpatialPosition.x, SpatialPosition.y, SpatialPosition.z - OffsetEpsilon });

    const Vector3 Gradient = { DeltaX, DeltaY, DeltaZ };
    const float GradientLength = Gradient.Length();
    return (GradientLength > 1e-7f) ? (Gradient / GradientLength) : Vector3{ 0.0f, 0.0f, 1.0f };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    RAY MARCHING
//------------------------------------------------------------------------------------------------------------------------

DistanceFieldHitRecord DistanceFieldSpace::MarchRay(Vector3 RayOrigin,
                                                    Vector3 RayDirection,
                                                    float MinimumDistance,
                                                    float MaximumDistance,
                                                    float SurfaceThreshold,
                                                    uint32_t MaximumSteps,
                                                    float StepRelaxation) const noexcept
{
    DistanceFieldHitRecord HitRecord{};
    HitRecord.TravelDistance = MinimumDistance;
    HitRecord.StepCount      = 0u;
    HitRecord.HasHit         = false;

    // Ray bounding box slab intersection test
    float BoxEntryDistance = MinimumDistance;
    float BoxExitDistance  = MaximumDistance;

    const auto IntersectSlab = [&](float OriginComponent, float DirectionComponent, float MinBound, float MaxBound) noexcept -> bool
    {
        if (std::abs(DirectionComponent) > 1e-7f)
        {
            float Near = (MinBound - OriginComponent) / DirectionComponent;
            float Far  = (MaxBound - OriginComponent) / DirectionComponent;
            if (Near > Far) std::swap(Near, Far);
            BoxEntryDistance = std::max(BoxEntryDistance, Near);
            BoxExitDistance  = std::min(BoxExitDistance,  Far);
            return BoxEntryDistance <= BoxExitDistance;
        }
        return (OriginComponent >= MinBound && OriginComponent <= MaxBound);
    };

    if (!IntersectSlab(RayOrigin.x, RayDirection.x, BoundingMinimum.x, BoundingMaximum.x) ||
        !IntersectSlab(RayOrigin.y, RayDirection.y, BoundingMinimum.y, BoundingMaximum.y) ||
        !IntersectSlab(RayOrigin.z, RayDirection.z, BoundingMinimum.z, BoundingMaximum.z))
    {
        return HitRecord;
    }

    float CurrentDistance = std::max(MinimumDistance, BoxEntryDistance);

    for (uint32_t Step = 0u; Step < MaximumSteps && CurrentDistance < BoxExitDistance; ++Step)
    {
        HitRecord.StepCount++;
        const Vector3 SamplePosition = RayOrigin + RayDirection * CurrentDistance;
        const float EvaluatedDistance = SampleDistance(SamplePosition);

        if (EvaluatedDistance <= SurfaceThreshold)
        {
            HitRecord.HasHit         = true;
            HitRecord.TravelDistance = CurrentDistance;
            HitRecord.HitPosition    = SamplePosition;
            HitRecord.SurfaceNormal  = SampleNormal(SamplePosition);
            return HitRecord;
        }

        const float SafeAdvance = std::max(EvaluatedDistance * StepRelaxation, SurfaceThreshold * 0.5f);
        CurrentDistance += SafeAdvance;
    }

    return HitRecord;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SOFT SHADOWS
//------------------------------------------------------------------------------------------------------------------------

float DistanceFieldSpace::MarchSoftShadow(Vector3 ShadingPosition,
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

        // Outside bounding box early out
        if (SamplePosition.x < BoundingMinimum.x || SamplePosition.x > BoundingMaximum.x ||
            SamplePosition.y < BoundingMinimum.y || SamplePosition.y > BoundingMaximum.y ||
            SamplePosition.z < BoundingMinimum.z || SamplePosition.z > BoundingMaximum.z)
        {
            CurrentDistance += 0.05f;
            continue;
        }

        const float EvaluatedDistance = SampleDistance(SamplePosition);
        if (EvaluatedDistance <= 0.001f)
            return 0.0f;

        const float StepPenumbra = PenumbraScale * EvaluatedDistance / CurrentDistance;
        ShadowPenumbra = std::min(ShadowPenumbra, StepPenumbra);

        const float StepAdvance = std::max(EvaluatedDistance * 0.85f, 0.004f);
        CurrentDistance += StepAdvance;
    }

    return std::clamp(ShadowPenumbra, 0.0f, 1.0f);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SERIALIZATION
//------------------------------------------------------------------------------------------------------------------------

bool DistanceFieldSpace::WriteToStream(std::ostream& Stream) const noexcept
{
    if (!Stream.good()) return false;

    Stream.write(reinterpret_cast<const char*>(&kDistanceFieldMagic), sizeof(uint32_t));
    Stream.write(reinterpret_cast<const char*>(&ResolutionX), sizeof(uint32_t));
    Stream.write(reinterpret_cast<const char*>(&ResolutionY), sizeof(uint32_t));
    Stream.write(reinterpret_cast<const char*>(&ResolutionZ), sizeof(uint32_t));

    Stream.write(reinterpret_cast<const char*>(&BoundingMinimum), sizeof(Vector3));
    Stream.write(reinterpret_cast<const char*>(&BoundingMaximum), sizeof(Vector3));
    Stream.write(reinterpret_cast<const char*>(&VoxelSpacing),    sizeof(Vector3));

    const uint64_t PayloadBytes = static_cast<uint64_t>(DistanceSamples.size()) * sizeof(float);
    Stream.write(reinterpret_cast<const char*>(DistanceSamples.data()), static_cast<std::streamsize>(PayloadBytes));

    return Stream.good();
}

bool DistanceFieldSpace::ReadFromStream(std::istream& Stream, std::string* OutError) noexcept
{
    if (!Stream.good())
    {
        if (OutError) *OutError = "stream is not readable";
        return false;
    }

    uint32_t ReadMagic = 0u;
    Stream.read(reinterpret_cast<char*>(&ReadMagic), sizeof(uint32_t));
    if (ReadMagic != kDistanceFieldMagic)
    {
        if (OutError) *OutError = "invalid distance field magic";
        return false;
    }

    Stream.read(reinterpret_cast<char*>(&ResolutionX), sizeof(uint32_t));
    Stream.read(reinterpret_cast<char*>(&ResolutionY), sizeof(uint32_t));
    Stream.read(reinterpret_cast<char*>(&ResolutionZ), sizeof(uint32_t));

    Stream.read(reinterpret_cast<char*>(&BoundingMinimum), sizeof(Vector3));
    Stream.read(reinterpret_cast<char*>(&BoundingMaximum), sizeof(Vector3));
    Stream.read(reinterpret_cast<char*>(&VoxelSpacing),    sizeof(Vector3));

    const size_t TotalSamples = static_cast<size_t>(ResolutionX) * ResolutionY * ResolutionZ;
    DistanceSamples.resize(TotalSamples);

    const uint64_t PayloadBytes = static_cast<uint64_t>(TotalSamples) * sizeof(float);
    Stream.read(reinterpret_cast<char*>(DistanceSamples.data()), static_cast<std::streamsize>(PayloadBytes));

    if (!Stream.good())
    {
        if (OutError) *OutError = "stream truncated while reading sample payload";
        return false;
    }

    return true;
}

bool DistanceFieldSpace::SaveToFile(const std::string& FilePath) const noexcept
{
    std::ofstream OutputStream(FilePath, std::ios::binary);
    if (!OutputStream.is_open()) return false;
    return WriteToStream(OutputStream);
}

bool DistanceFieldSpace::LoadFromFile(const std::string& FilePath, std::string* OutError) noexcept
{
    std::ifstream InputStream(FilePath, std::ios::binary);
    if (!InputStream.is_open())
    {
        if (OutError) *OutError = "cannot open file: " + FilePath;
        return false;
    }
    return ReadFromStream(InputStream, OutError);
}

} // namespace Frontier
