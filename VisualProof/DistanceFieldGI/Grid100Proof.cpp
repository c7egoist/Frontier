//============================================================================================================================================
//                                                    GRID100PROOF.CPP
//============================================================================================================================================
// 📦 10x10 Grid of 100 ShaderBalls with variable Albedo, Specular, Metallic, and Emissive materials.
//    Benchmarks CPU render timings and tests multiple sun angles and NO SUN (pure emissive GI).

#include "GeometricRaster/DistanceFieldSpace.h"
#include "GeometricRaster/GlobalDistanceFieldSpace.h"
#include <iostream>
#include <vector>
#include <cmath>
#include <fstream>
#include <algorithm>
#include <string>
#include <chrono>
#include <iomanip>

#if defined(_OPENMP)
    #include <omp.h>
#endif

namespace Frontier {

namespace {

uint32_t Crc32(const uint8_t* Data, size_t Length, uint32_t Seed = 0u) noexcept
{
    static uint32_t Table[256];
    static bool Ready = false;
    if (!Ready)
    {
        for (uint32_t N = 0u; N < 256u; ++N)
        {
            uint32_t C = N;
            for (int K = 0; K < 8; ++K) C = (C & 1u) ? (0xEDB88320u ^ (C >> 1)) : (C >> 1);
            Table[N] = C;
        }
        Ready = true;
    }
    uint32_t C = Seed ^ 0xFFFFFFFFu;
    for (size_t I = 0u; I < Length; ++I) C = Table[(C ^ Data[I]) & 0xFFu] ^ (C >> 8);
    return C ^ 0xFFFFFFFFu;
}

uint32_t Adler32(const uint8_t* Data, size_t Length) noexcept
{
    uint32_t A = 1u, B = 0u;
    for (size_t I = 0u; I < Length; ++I) { A = (A + Data[I]) % 65521u; B = (B + A) % 65521u; }
    return (B << 16) | A;
}

struct BitWriter
{
    std::vector<uint8_t> Bytes;
    uint32_t             Hold  = 0u;
    uint32_t             Count = 0u;

    void Raw(uint32_t Value, uint32_t Width) noexcept
    {
        Hold |= (Value & ((1u << Width) - 1u)) << Count;
        Count += Width;
        while (Count >= 8u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold >>= 8; Count -= 8u; }
    }
    void Code(uint32_t Value, uint32_t Width) noexcept
    {
        for (uint32_t I = 0u; I < Width; ++I) Raw((Value >> (Width - 1u - I)) & 1u, 1u);
    }
    void Flush() noexcept { if (Count > 0u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold = 0u; Count = 0u; } }
};

void EmitLiteral(BitWriter& W, uint32_t Symbol) noexcept
{
    if (Symbol < 144u)      W.Code(0x030u + Symbol,          8u);
    else if (Symbol < 256u) W.Code(0x190u + Symbol - 144u,   9u);
    else if (Symbol < 280u) W.Code(0x000u + Symbol - 256u,   7u);
    else                    W.Code(0x0C0u + Symbol - 280u,   8u);
}

const uint16_t kLengthBase[29]   = { 3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258 };
const uint8_t  kLengthExtra[29]  = { 0,0,0,0,0,0,0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4,  4,  5,  5,  5,  5,  0 };
const uint16_t kDistanceBase[30] = { 1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577 };
const uint8_t  kDistanceExtra[30]= { 0,0,0,0,1,1,2, 2, 3, 3, 4, 4, 5, 5,  6,  6,  7,  7,  8,  8,   9,   9,  10,  10,  11,  11,  12,   12,   13,   13 };

std::vector<uint8_t> Deflate(const std::vector<uint8_t>& Data)
{
    BitWriter W;
    W.Raw(1u, 1u);
    W.Raw(1u, 2u);

    constexpr size_t kWindow = 32768u, kBuckets = 65536u;
    std::vector<int32_t> Head(kBuckets, -1);
    std::vector<int32_t> Prev(Data.size(), -1);
    const auto Hash = [&](size_t I) -> size_t
    {
        return (size_t(Data[I]) * 7u ^ size_t(Data[I + 1u]) * 131u ^ size_t(Data[I + 2u]) * 2179u) & (kBuckets - 1u);
    };

    size_t At = 0u;
    while (At < Data.size())
    {
        size_t BestLength = 0u, BestDistance = 0u;
        if (At + 3u < Data.size())
        {
            const size_t Bucket = Hash(At);
            int32_t Candidate = Head[Bucket];
            for (int Step = 0; Step < 24 && Candidate >= 0; ++Step, Candidate = Prev[Candidate])
            {
                const size_t Distance = At - size_t(Candidate);
                if (Distance == 0u || Distance > kWindow) break;
                size_t Length = 0u;
                const size_t Limit = std::min<size_t>(258u, Data.size() - At);
                while (Length < Limit && Data[size_t(Candidate) + Length] == Data[At + Length]) ++Length;
                if (Length > BestLength) { BestLength = Length; BestDistance = Distance; if (Length >= 258u) break; }
            }
        }

        if (BestLength >= 3u)
        {
            uint32_t L = 28u;
            while (L > 0u && kLengthBase[L] > BestLength) --L;
            EmitLiteral(W, 257u + L);
            W.Raw(uint32_t(BestLength - kLengthBase[L]), kLengthExtra[L]);
            uint32_t D = 29u;
            while (D > 0u && kDistanceBase[D] > BestDistance) --D;
            W.Code(D, 5u);
            W.Raw(uint32_t(BestDistance - kDistanceBase[D]), kDistanceExtra[D]);
            for (size_t K = 0u; K < BestLength; ++K)
            {
                if (At + K + 3u < Data.size()) { const size_t B = Hash(At + K); Prev[At + K] = Head[B]; Head[B] = int32_t(At + K); }
            }
            At += BestLength;
        }
        else
        {
            EmitLiteral(W, Data[At]);
            if (At + 3u < Data.size()) { const size_t B = Hash(At); Prev[At] = Head[B]; Head[B] = int32_t(At); }
            ++At;
        }
    }
    EmitLiteral(W, 256u);
    W.Flush();
    return W.Bytes;
}

void WritePng(const std::string& Path, uint32_t Width, uint32_t Height, const std::vector<uint8_t>& Rgb) noexcept
{
    const size_t Stride = static_cast<size_t>(Width) * 3u;
    std::vector<uint8_t> Raw;
    Raw.reserve(static_cast<size_t>(Height) * (Stride + 1u));

    for (uint32_t Y = 0u; Y < Height; ++Y)
    {
        Raw.push_back(0u);
        const size_t RowStart = static_cast<size_t>(Y) * Stride;
        Raw.insert(Raw.end(), Rgb.begin() + RowStart, Rgb.begin() + RowStart + Stride);
    }

    const std::vector<uint8_t> Compressed = Deflate(Raw);

    std::ofstream Stream(Path, std::ios::binary);
    const uint8_t Signature[8] = { 137, 80, 78, 71, 13, 10, 26, 10 };
    Stream.write(reinterpret_cast<const char*>(Signature), 8);

    auto WriteChunk = [&](const char Type[4], const uint8_t* Data, uint32_t Length)
    {
        const uint32_t BigLength = ((Length >> 24) & 0xFF) | ((Length >> 8) & 0xFF00) |
                                   ((Length << 8) & 0xFF0000) | ((Length << 24) & 0xFF000000);
        Stream.write(reinterpret_cast<const char*>(&BigLength), 4);
        Stream.write(Type, 4);
        if (Length > 0u && Data) Stream.write(reinterpret_cast<const char*>(Data), Length);

        uint32_t ChunkCrc = Crc32(reinterpret_cast<const uint8_t*>(Type), 4u);
        if (Length > 0u && Data) ChunkCrc = Crc32(Data, Length, ChunkCrc);
        const uint32_t BigCrc = ((ChunkCrc >> 24) & 0xFF) | ((ChunkCrc >> 8) & 0xFF00) |
                                ((ChunkCrc << 8) & 0xFF0000) | ((ChunkCrc << 24) & 0xFF000000);
        Stream.write(reinterpret_cast<const char*>(&BigCrc), 4);
    };

    uint8_t Ihdr[13] = {
        static_cast<uint8_t>((Width >> 24) & 0xFF), static_cast<uint8_t>((Width >> 16) & 0xFF),
        static_cast<uint8_t>((Width >> 8) & 0xFF),  static_cast<uint8_t>(Width & 0xFF),
        static_cast<uint8_t>((Height >> 24) & 0xFF), static_cast<uint8_t>((Height >> 16) & 0xFF),
        static_cast<uint8_t>((Height >> 8) & 0xFF),  static_cast<uint8_t>(Height & 0xFF),
        8, 2, 0, 0, 0
    };

    WriteChunk("IHDR", Ihdr, 13u);

    std::vector<uint8_t> Zlib;
    Zlib.reserve(Compressed.size() + 6u);
    Zlib.push_back(0x78);
    Zlib.push_back(0x01);
    Zlib.insert(Zlib.end(), Compressed.begin(), Compressed.end());
    const uint32_t Adler = Adler32(Raw.data(), Raw.size());
    Zlib.push_back(static_cast<uint8_t>((Adler >> 24) & 0xFF));
    Zlib.push_back(static_cast<uint8_t>((Adler >> 16) & 0xFF));
    Zlib.push_back(static_cast<uint8_t>((Adler >> 8)  & 0xFF));
    Zlib.push_back(static_cast<uint8_t>(Adler & 0xFF));

    WriteChunk("IDAT", Zlib.data(), static_cast<uint32_t>(Zlib.size()));
    WriteChunk("IEND", nullptr, 0u);
}

inline float Dot(const Vector3& A, const Vector3& B) noexcept { return A.x * B.x + A.y * B.y + A.z * B.z; }
inline Vector3 Cross(const Vector3& A, const Vector3& B) noexcept {
    return { A.y * B.z - A.z * B.y, A.z * B.x - A.x * B.z, A.x * B.y - A.y * B.x };
}

struct GridShaderBall
{
    Vector3 Position;
    float   Scale;
    Vector3 Albedo;
    float   Metallic;
    float   Roughness;
    Vector3 Emission; // [W/m^2] HDR emissive radiance
    int     GridX;
    int     GridY;
};

// Spatial Acceleration Structure for 10x10 Grid (100 objects)
class Grid100SpatialAcceleration
{
public:
    const DistanceFieldSpace* BaseSDF = nullptr;
    std::vector<GridShaderBall> Balls;
    float CellSize = 1.0f;
    float OriginX = -4.5f;
    float OriginY = -4.5f;

    void Build(const DistanceFieldSpace* InSDF, std::vector<GridShaderBall> InBalls)
    {
        BaseSDF = InSDF;
        Balls = std::move(InBalls);
    }

    // Evaluates distance to the nearest ShaderBall in the grid using 3x3 local neighbor query
    float SampleSceneDistance(Vector3 P, int* OutHitIndex = nullptr) const noexcept
    {
        // Ground plane
        float MinDist = P.z;
        int BestIdx = -1;

        // Map P.xy to grid cell
        int CX = std::clamp(static_cast<int>(std::floor((P.x - OriginX + 0.5f * CellSize) / CellSize)), 0, 9);
        int CY = std::clamp(static_cast<int>(std::floor((P.y - OriginY + 0.5f * CellSize) / CellSize)), 0, 9);

        // Test 3x3 neighbor cells
        for (int DY = -1; DY <= 1; ++DY)
        {
            int GY = CY + DY;
            if (GY < 0 || GY > 9) continue;
            for (int DX = -1; DX <= 1; ++DX)
            {
                int GX = CX + DX;
                if (GX < 0 || GX > 9) continue;

                int Idx = GY * 10 + GX;
                const auto& Ball = Balls[Idx];

                Vector3 LocalP = (P - Ball.Position) * (1.0f / Ball.Scale);
                float D = BaseSDF->SampleDistance(LocalP) * Ball.Scale;
                if (D < MinDist)
                {
                    MinDist = D;
                    BestIdx = Idx;
                }
            }
        }

        if (OutHitIndex) *OutHitIndex = BestIdx;
        return MinDist;
    }

    Vector3 SampleNormal(Vector3 P, int HitIndex) const noexcept
    {
        if (HitIndex < 0 || HitIndex >= static_cast<int>(Balls.size()))
            return Vector3{ 0.0f, 0.0f, 1.0f };

        const auto& Ball = Balls[HitIndex];
        Vector3 LocalP = (P - Ball.Position) * (1.0f / Ball.Scale);
        return BaseSDF->SampleNormal(LocalP).Normalized();
    }

    DistanceFieldHitRecord MarchRay(Vector3 RayOrigin, Vector3 RayDirection, float MinT, float MaxT) const noexcept
    {
        DistanceFieldHitRecord Hit{};
        Hit.TravelDistance = MinT;
        Hit.HasHit = false;
        Hit.InstanceIdentity = 0xFFFFFFFFu;

        float GroundT = MaxT;
        if (std::abs(RayDirection.z) > 1e-6f)
        {
            float T = -RayOrigin.z / RayDirection.z;
            if (T >= MinT && T < MaxT) GroundT = T;
        }

        float T = MinT;
        const float Limit = std::min(MaxT, GroundT);

        for (uint32_t Step = 0u; Step < 140u && T < Limit; ++Step)
        {
            Hit.StepCount++;
            Vector3 P = RayOrigin + RayDirection * T;

            int NearestIdx = -1;
            float D = SampleSceneDistance(P, &NearestIdx);

            if (D <= 0.002f)
            {
                Hit.HasHit = true;
                Hit.TravelDistance = T;
                Hit.HitPosition = P;
                Hit.InstanceIdentity = static_cast<uint32_t>(NearestIdx);
                Hit.SurfaceNormal = SampleNormal(P, NearestIdx);
                return Hit;
            }

            T += std::max(D * 0.82f, 0.002f);
        }

        if (GroundT < MaxT && GroundT >= MinT && RayDirection.z < 0.0f)
        {
            Hit.HasHit = true;
            Hit.TravelDistance = GroundT;
            Hit.HitPosition = RayOrigin + RayDirection * GroundT;
            Hit.SurfaceNormal = Vector3{ 0.0f, 0.0f, 1.0f };
            Hit.InstanceIdentity = 0xFFFFFFFFu;
            return Hit;
        }

        return Hit;
    }

    float MarchSoftShadow(Vector3 ShadingPos, Vector3 LightDir, float MinT, float MaxT, float LightAngle, uint32_t ReceiverId) const noexcept
    {
        if (LightDir.z < 0.0f && ShadingPos.z <= 0.001f) return 0.0f;

        float Penumbra = 1.0f;
        const float K = 1.0f / std::max(0.01f, std::tan(LightAngle));

        // Test balls along the 2D ray path
        for (int Idx = 0; Idx < 100; ++Idx)
        {
            const auto& Ball = Balls[Idx];
            Vector3 Center = Ball.Position + Vector3{ 0.0f, 0.0f, 0.55f * Ball.Scale };
            Vector3 ToCenter = Center - ShadingPos;
            float Proj = Dot(ToCenter, LightDir);
            if (Proj < -0.6f || Proj > MaxT + 0.6f) continue;

            float Perp2 = Dot(ToCenter, ToCenter) - Proj * Proj;
            if (Perp2 > 0.55f * Ball.Scale * 0.55f * Ball.Scale) continue;

            float StartT = (static_cast<uint32_t>(Idx) == ReceiverId) ? std::max(MinT, 0.065f * Ball.Scale) : MinT;
            float T = StartT;

            for (uint32_t Step = 0u; Step < 32u && T < MaxT; ++Step)
            {
                Vector3 P = ShadingPos + LightDir * T;
                Vector3 LocalP = (P - Ball.Position) * (1.0f / Ball.Scale);
                float D = BaseSDF->SampleDistance(LocalP) * Ball.Scale;
                if (D <= 0.001f) return 0.0f;

                Penumbra = std::min(Penumbra, K * D / T);
                T += std::max(D * 0.85f, 0.005f);
            }
        }

        return std::clamp(Penumbra, 0.0f, 1.0f);
    }
};

void BuildHemisphereSamples(const Vector3& N, float RotOffset, Vector3 OutDirs[16], float OutWeights[16]) noexcept
{
    Vector3 Up = (std::abs(N.z) < 0.99f) ? Vector3{ 0.0f, 0.0f, 1.0f } : Vector3{ 1.0f, 0.0f, 0.0f };
    Vector3 Tangent = Cross(Up, N).Normalized();
    Vector3 Bitangent = Cross(N, Tangent).Normalized();

    for (int I = 0; I < 16; ++I)
    {
        float U = (static_cast<float>(I) + 0.5f) / 16.0f;
        float Phi = static_cast<float>(I) * 2.3999632f + RotOffset;
        float CosTheta = std::sqrt(1.0f - U);
        float SinTheta = std::sqrt(U);

        Vector3 LocalDir = {
            std::cos(Phi) * SinTheta,
            std::sin(Phi) * SinTheta,
            CosTheta
        };

        OutDirs[I] = (Tangent * LocalDir.x + Bitangent * LocalDir.y + N * LocalDir.z).Normalized();
        OutWeights[I] = CosTheta;
    }
}

struct RenderTimingStats
{
    double TotalMs = 0.0;
    double RayMarchMs = 0.0;
    double ShadowMs = 0.0;
    double GiMs = 0.0;
    double FilterMs = 0.0;
};

RenderTimingStats RenderGrid100(const Grid100SpatialAcceleration& Grid,
                                Vector3 CamPos,
                                Vector3 CamTarget,
                                Vector3 SunDir,
                                Vector3 SunRadiance,
                                bool EnableSun,
                                uint32_t Width,
                                uint32_t Height,
                                std::vector<uint8_t>& OutRgb,
                                float Fov = 48.0f)
{
    auto StartTotal = std::chrono::high_resolution_clock::now();
    RenderTimingStats Stats;

    OutRgb.resize(static_cast<size_t>(Width) * Height * 3u);

    const Vector3 Fwd = (CamTarget - CamPos).Normalized();
    const Vector3 Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
    const Vector3 Up  = Cross(Rgt, Fwd).Normalized();

    const float Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    const float HalfTan = std::tan(Fov * 3.14159265f / 360.0f);

    const Vector3 FloorAlbedo = Vector3{ 0.35f, 0.36f, 0.40f };

    struct ShadingPoint
    {
        Vector3 P;
        Vector3 N;
        Vector3 Albedo;
        float Metallic;
        float Roughness;
        Vector3 Emission;
        float Shadow;
        uint32_t InstanceId;
        bool HasHit;
    };

    std::vector<ShadingPoint> Points(static_cast<size_t>(Width) * Height);
    std::vector<Vector3> RawGI(static_cast<size_t>(Width) * Height, Vector3{ 0.0f, 0.0f, 0.0f });
    std::vector<Vector3> FilteredGI(static_cast<size_t>(Width) * Height, Vector3{ 0.0f, 0.0f, 0.0f });

    // 1. Primary Rays & Shadows
    auto StartMarch = std::chrono::high_resolution_clock::now();

#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(Height); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(Width); ++X)
        {
            size_t PixelIdx = static_cast<size_t>(Y) * Width + static_cast<size_t>(X);
            float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(Width) * 2.0f - 1.0f) * Aspect * HalfTan;
            float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(Height) * 2.0f) * HalfTan;
            Vector3 RayDir = (Fwd + Rgt * U + Up * V).Normalized();

            auto Hit = Grid.MarchRay(CamPos, RayDir, 0.2f, 25.0f);
            auto& SP = Points[PixelIdx];
            SP.HasHit = Hit.HasHit;

            if (Hit.HasHit)
            {
                SP.P = Hit.HitPosition;
                SP.N = Hit.SurfaceNormal;
                SP.InstanceId = Hit.InstanceIdentity;

                if (EnableSun)
                {
                    SP.Shadow = Grid.MarchSoftShadow(
                        SP.P + SP.N * 0.015f, SunDir, 0.015f, 8.0f, 0.12f, SP.InstanceId
                    );
                }
                else
                {
                    SP.Shadow = 0.0f;
                }

                SP.Albedo = FloorAlbedo;
                SP.Metallic = 0.0f;
                SP.Roughness = 0.40f;
                SP.Emission = { 0.0f, 0.0f, 0.0f };

                if (SP.InstanceId < Grid.Balls.size())
                {
                    const auto& Ball = Grid.Balls[SP.InstanceId];
                    SP.Albedo = Ball.Albedo;
                    SP.Metallic = Ball.Metallic;
                    SP.Roughness = Ball.Roughness;
                    SP.Emission = Ball.Emission;

                    Vector3 LocalP = SP.P - Ball.Position;
                    if ((LocalP - Vector3{0.08f, -0.08f, 0.05f}).Length() < 0.25f * Ball.Scale)
                    {
                        SP.Albedo = { 0.25f, 0.27f, 0.30f };
                        SP.Metallic = 0.85f;
                        SP.Roughness = 0.15f;
                    }
                }
                else if (SP.P.z <= 0.015f)
                {
                    float grid = (std::sin(SP.P.x * 2.0f) * std::sin(SP.P.y * 2.0f) > 0.0f) ? 1.0f : 0.88f;
                    SP.Albedo = FloorAlbedo * grid;
                }

                // Gather 16 diffuse GI probe rays
                float RotOffset = static_cast<float>((X * 131u ^ Y * 313u) & 0xFFu) * (6.2831853f / 256.0f);
                Vector3 ProbeDirs[16];
                float ProbeWeights[16];
                BuildHemisphereSamples(SP.N, RotOffset, ProbeDirs, ProbeWeights);

                Vector3 AccRadiance = { 0.0f, 0.0f, 0.0f };
                float TotalWeight = 0.0f;

                for (int Step = 0; Step < 16; ++Step)
                {
                    Vector3 SampleDir = ProbeDirs[Step];
                    float W = ProbeWeights[Step];
                    TotalWeight += W;

                    auto GiHit = Grid.MarchRay(SP.P + SP.N * 0.020f, SampleDir, 0.02f, 4.5f);
                    if (GiHit.HasHit)
                    {
                        Vector3 HitAlbedo = FloorAlbedo;
                        Vector3 HitEmission = { 0.0f, 0.0f, 0.0f };

                        if (GiHit.InstanceIdentity < Grid.Balls.size())
                        {
                            const auto& HitBall = Grid.Balls[GiHit.InstanceIdentity];
                            HitAlbedo = HitBall.Albedo;
                            HitEmission = HitBall.Emission;
                        }

                        Vector3 HitDirect = { 0.0f, 0.0f, 0.0f };
                        if (EnableSun)
                        {
                            float HitShadow = Grid.MarchSoftShadow(
                                GiHit.HitPosition + GiHit.SurfaceNormal * 0.015f, SunDir, 0.02f, 6.0f, 0.12f, GiHit.InstanceIdentity
                            );
                            float HitNDotL = std::max(0.0f, Dot(GiHit.SurfaceNormal, SunDir));
                            HitDirect = SunRadiance * (HitNDotL * HitShadow);
                        }

                        Vector3 Incoming = HitEmission + HitAlbedo * (HitDirect * 1.25f);
                        AccRadiance = AccRadiance + Incoming * W;
                    }
                    else
                    {
                        if (EnableSun)
                        {
                            float UpFactor = SampleDir.z * 0.5f + 0.5f;
                            Vector3 SkyLight = Vector3{ 0.14f, 0.22f, 0.35f } * (0.6f * UpFactor);
                            AccRadiance = AccRadiance + SkyLight * W;
                        }
                    }
                }

                RawGI[PixelIdx] = (AccRadiance / TotalWeight);
            }
        }
    }
    auto EndMarch = std::chrono::high_resolution_clock::now();
    Stats.RayMarchMs = std::chrono::duration<double, std::milli>(EndMarch - StartMarch).count();

    // 2. Bilateral Filter on GI
    auto StartFilter = std::chrono::high_resolution_clock::now();
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(Height); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(Width); ++X)
        {
            size_t CenterIdx = static_cast<size_t>(Y) * Width + static_cast<size_t>(X);
            const auto& CenterSP = Points[CenterIdx];
            if (!CenterSP.HasHit) continue;

            Vector3 AccCol = { 0.0f, 0.0f, 0.0f };
            float AccW = 0.0f;

            for (int Dy = -2; Dy <= 2; ++Dy)
            {
                int Ny = std::clamp(Y + Dy, 0, static_cast<int32_t>(Height) - 1);
                for (int Dx = -2; Dx <= 2; ++Dx)
                {
                    int Nx = std::clamp(X + Dx, 0, static_cast<int32_t>(Width) - 1);
                    size_t TapIdx = static_cast<size_t>(Ny) * Width + static_cast<size_t>(Nx);
                    const auto& TapSP = Points[TapIdx];
                    if (!TapSP.HasHit) continue;

                    float NormalSim = std::max(0.0f, Dot(CenterSP.N, TapSP.N));
                    float DepthDiff = (CenterSP.P - TapSP.P).Length();
                    float SpatialW = std::exp(-static_cast<float>(Dx * Dx + Dy * Dy) / 6.0f);
                    float Weight = SpatialW * std::pow(NormalSim, 6.0f) * std::exp(-DepthDiff * 6.0f);

                    AccCol = AccCol + RawGI[TapIdx] * Weight;
                    AccW += Weight;
                }
            }

            FilteredGI[CenterIdx] = (AccW > 1e-4f) ? (AccCol / AccW) : RawGI[CenterIdx];
        }
    }
    auto EndFilter = std::chrono::high_resolution_clock::now();
    Stats.FilterMs = std::chrono::duration<double, std::milli>(EndFilter - StartFilter).count();

    // 3. Composite Final Color
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(Height); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(Width); ++X)
        {
            size_t PixelIdx = static_cast<size_t>(Y) * Width + static_cast<size_t>(X);
            const auto& SP = Points[PixelIdx];

            Vector3 Col = EnableSun ? Vector3{ 0.04f, 0.05f, 0.07f } : Vector3{ 0.005f, 0.005f, 0.008f };

            if (SP.HasHit)
            {
                Vector3 DirectDiff = { 0.0f, 0.0f, 0.0f };
                Vector3 DirectSpec = { 0.0f, 0.0f, 0.0f };

                if (EnableSun)
                {
                    float NDotL = std::max(0.0f, Dot(SP.N, SunDir));
                    Vector3 ViewDir = (CamPos - SP.P).Normalized();
                    Vector3 HalfDir = (SunDir + ViewDir).Normalized();
                    float NDotH = std::max(0.0f, Dot(SP.N, HalfDir));

                    float SpecPow = 10.0f + (1.0f - SP.Roughness) * 60.0f;
                    float Spec = std::pow(NDotH, SpecPow) * SP.Shadow * 2.0f;

                    DirectDiff = SP.Albedo * (SunRadiance * (NDotL * SP.Shadow));
                    DirectSpec = (SP.Metallic > 0.5f ? SP.Albedo : Vector3{ 1.0f, 1.0f, 1.0f }) * Spec;
                }

                // Vibrant Distance Field Indirect GI (2.4x) + Direct Emission
                Vector3 IndirectGI = FilteredGI[PixelIdx] * SP.Albedo * (EnableSun ? 2.4f : 3.5f);
                Col = SP.Emission + DirectDiff + DirectSpec * 0.30f + IndirectGI;
            }

            auto Tonemap = [](float X) noexcept -> uint8_t
            {
                const float Clamped = std::max(0.0f, X);
                const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
                const float Mapped = (Clamped * (A * Clamped + B)) / (Clamped * (C * Clamped + D) + E);
                const float Gamma  = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
                return static_cast<uint8_t>(std::clamp(Gamma * 255.0f, 0.0f, 255.0f));
            };

            size_t DstIdx = PixelIdx * 3u;
            OutRgb[DstIdx + 0u] = Tonemap(Col.x);
            OutRgb[DstIdx + 1u] = Tonemap(Col.y);
            OutRgb[DstIdx + 2u] = Tonemap(Col.z);
        }
    }

    auto EndTotal = std::chrono::high_resolution_clock::now();
    Stats.TotalMs = std::chrono::duration<double, std::milli>(EndTotal - StartTotal).count();
    return Stats;
}

} // namespace

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " 10x10 GRID (100 OBJECTS) GLOBAL DISTANCE FIELD GI & LIGHTING BENCHMARK\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace BaseSDF;
    if (!BaseSDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    // Generate 100 ShaderBall instances in a 10x10 grid with diverse PBR materials & emissive neon accents
    std::vector<GridShaderBall> Balls;
    Balls.reserve(100);

    const float Spacing = 0.95f;
    const float StartOffset = -4.275f; // Center grid around (0, 0)

    for (int Y = 0; Y < 10; ++Y)
    {
        for (int X = 0; X < 10; ++X)
        {
            GridShaderBall Ball{};
            Ball.GridX = X;
            Ball.GridY = Y;
            Ball.Position = { StartOffset + static_cast<float>(X) * Spacing, StartOffset + static_cast<float>(Y) * Spacing, 0.0f };
            Ball.Scale = 0.60f;

            // Varied Hue across grid
            float Hue = (static_cast<float>(X * 10 + Y) / 100.0f) * 6.2831853f;
            float R = std::sin(Hue) * 0.45f + 0.50f;
            float G = std::sin(Hue + 2.094f) * 0.45f + 0.50f;
            float B = std::sin(Hue + 4.188f) * 0.45f + 0.50f;
            Ball.Albedo = { R, G, B };

            // Material properties across axes
            Ball.Metallic = (X % 3 == 0) ? 0.85f : ((X % 3 == 1) ? 0.20f : 0.0f);
            Ball.Roughness = 0.08f + 0.06f * static_cast<float>(Y);
            Ball.Emission = { 0.0f, 0.0f, 0.0f };

            // Select key objects to be intensely emissive neon lights
            // (Center, corners, and cross points)
            if ((X == 4 && Y == 4) || (X == 5 && Y == 5))
            {
                Ball.Emission = Vector3{ 1.0f, 0.35f, 0.05f } * 4.5f; // Glowing electric orange core
            }
            else if ((X == 2 && Y == 7) || (X == 7 && Y == 2))
            {
                Ball.Emission = Vector3{ 0.05f, 0.85f, 1.00f } * 4.5f; // Glowing neon cyan
            }
            else if ((X == 2 && Y == 2) || (X == 7 && Y == 7))
            {
                Ball.Emission = Vector3{ 1.00f, 0.05f, 0.75f } * 4.5f; // Glowing hot magenta
            }
            else if ((X == 1 && Y == 5) || (X == 8 && Y == 4))
            {
                Ball.Emission = Vector3{ 0.10f, 1.00f, 0.30f } * 4.5f; // Glowing electric lime
            }

            Balls.push_back(Ball);
        }
    }

    std::cout << "Successfully instantiated 100 ShaderBall objects in 10x10 grid with PBR & emissive cores.\n";

    Grid100SpatialAcceleration Grid;
    Grid.CellSize = Spacing;
    Grid.OriginX = StartOffset;
    Grid.OriginY = StartOffset;
    Grid.Build(&BaseSDF, Balls);

    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;
    std::vector<uint8_t> ImageBuffer;

    Vector3 CamTarget = { 0.0f, 0.0f, 0.35f };
    Vector3 CamPos = { 0.0f, -7.5f, 4.8f }; // Elevated panoramic viewpoint overlooking all 100 objects

    // Lighting Scenario 1: Low Afternoon Sun (18 deg elevation) -> Long dramatic contact-hardening shadows
    std::cout << "\n[1/4] Rendering Low Afternoon Sun (Elevation: 18 deg, Azimuth: 35 deg) ...\n";
    float LowEl = 18.0f * 3.14159265f / 180.0f;
    float LowAz = 35.0f * 3.14159265f / 180.0f;
    Vector3 SunLow = Vector3{ std::cos(LowEl) * std::cos(LowAz), std::cos(LowEl) * std::sin(LowAz), std::sin(LowEl) }.Normalized();
    auto StatsLow = RenderGrid100(Grid, CamPos, CamTarget, SunLow, Vector3{ 1.0f, 0.90f, 0.80f } * 2.2f, true, ResW, ResH, ImageBuffer);
    WritePng("VisualProof/DistanceFieldGI/Grid100_LowSun_Hero.png", ResW, ResH, ImageBuffer);
    std::vector<uint8_t> Quad1 = ImageBuffer;
    std::cout << "   -> Render Time: " << std::fixed << std::setprecision(1) << StatsLow.TotalMs << " ms ("
              << "March: " << StatsLow.RayMarchMs << " ms, Filter: " << StatsLow.FilterMs << " ms)\n";

    // Lighting Scenario 2: High Noon Sun (75 deg elevation) -> Sharp vertical shadows underneath
    std::cout << "\n[2/4] Rendering High Noon Sun (Elevation: 75 deg, Azimuth: 120 deg) ...\n";
    float HighEl = 75.0f * 3.14159265f / 180.0f;
    float HighAz = 120.0f * 3.14159265f / 180.0f;
    Vector3 SunHigh = Vector3{ std::cos(HighEl) * std::cos(HighAz), std::cos(HighEl) * std::sin(HighAz), std::sin(HighEl) }.Normalized();
    auto StatsHigh = RenderGrid100(Grid, CamPos, CamTarget, SunHigh, Vector3{ 1.0f, 0.98f, 0.92f } * 2.4f, true, ResW, ResH, ImageBuffer);
    std::vector<uint8_t> Quad2 = ImageBuffer;
    std::cout << "   -> Render Time: " << StatsHigh.TotalMs << " ms\n";

    // Lighting Scenario 3: Side Rim Sun (32 deg elevation, 210 deg azimuth) -> Rim lighting and cavity specular
    std::cout << "\n[3/4] Rendering Side Rim Sun (Elevation: 32 deg, Azimuth: 210 deg) ...\n";
    float SideEl = 32.0f * 3.14159265f / 180.0f;
    float SideAz = 210.0f * 3.14159265f / 180.0f;
    Vector3 SunSide = Vector3{ std::cos(SideEl) * std::cos(SideAz), std::cos(SideEl) * std::sin(SideAz), std::sin(SideEl) }.Normalized();
    auto StatsSide = RenderGrid100(Grid, CamPos, CamTarget, SunSide, Vector3{ 0.95f, 0.95f, 1.0f } * 2.2f, true, ResW, ResH, ImageBuffer);
    std::vector<uint8_t> Quad3 = ImageBuffer;
    std::cout << "   -> Render Time: " << StatsSide.TotalMs << " ms\n";

    // Lighting Scenario 4: NO SUN (Night / Pure Emissive & Indirect GI) -> Glowing neon cores light up the 100 balls
    std::cout << "\n[4/4] Rendering NO SUN (Pure Emissive & Indirect Distance Field GI) ...\n";
    auto StatsNoSun = RenderGrid100(Grid, CamPos, CamTarget, Vector3{ 0.0f, 0.0f, 1.0f }, Vector3{ 0.0f, 0.0f, 0.0f }, false, ResW, ResH, ImageBuffer);
    WritePng("VisualProof/DistanceFieldGI/Grid100_NoSun_Emissive_GI.png", ResW, ResH, ImageBuffer);
    std::vector<uint8_t> Quad4 = ImageBuffer;
    std::cout << "   -> Render Time: " << StatsNoSun.TotalMs << " ms\n";

    // Build 2x2 Comparison Sheet (Grid100_Lighting_Comparison.png)
    const uint32_t HalfW = 640u;
    const uint32_t HalfH = 360u;
    const uint32_t SheetW = 1280u;
    const uint32_t SheetH = 720u;
    std::vector<uint8_t> Sheet(static_cast<size_t>(SheetW) * SheetH * 3u, 0u);

    auto DownsampleQuad = [&](const std::vector<uint8_t>& Src, uint32_t QuadX, uint32_t QuadY)
    {
        uint32_t DstStartX = QuadX * HalfW;
        uint32_t DstStartY = QuadY * HalfH;

        for (uint32_t Y = 0; Y < HalfH; ++Y)
        {
            for (uint32_t X = 0; X < HalfW; ++X)
            {
                size_t SrcIdx = (static_cast<size_t>(Y * 2) * ResW + (X * 2)) * 3u;
                size_t DstIdx = (static_cast<size_t>(DstStartY + Y) * SheetW + (DstStartX + X)) * 3u;
                Sheet[DstIdx + 0] = Src[SrcIdx + 0];
                Sheet[DstIdx + 1] = Src[SrcIdx + 1];
                Sheet[DstIdx + 2] = Src[SrcIdx + 2];
            }
        }
    };

    DownsampleQuad(Quad1, 0, 0); // Top-Left: Low Afternoon Sun
    DownsampleQuad(Quad2, 1, 0); // Top-Right: High Noon Sun
    DownsampleQuad(Quad3, 0, 1); // Bottom-Left: Side Rim Sun
    DownsampleQuad(Quad4, 1, 1); // Bottom-Right: NO SUN (Pure Emissive GI)

    WritePng("VisualProof/DistanceFieldGI/Grid100_Lighting_Comparison.png", SheetW, SheetH, Sheet);
    std::cout << "Wrote VisualProof/DistanceFieldGI/Grid100_Lighting_Comparison.png\n";

    std::cout << "\n================================================================================\n";
    std::cout << " BENCHMARK SUMMARY (CPU 720p Full HD Render across 100 ShaderBall Placements):\n";
    std::cout << "   Low Sun:   " << StatsLow.TotalMs   << " ms (" << (1000.0 / StatsLow.TotalMs) << " FPS)\n";
    std::cout << "   High Sun:  " << StatsHigh.TotalMs  << " ms (" << (1000.0 / StatsHigh.TotalMs) << " FPS)\n";
    std::cout << "   Side Sun:  " << StatsSide.TotalMs  << " ms (" << (1000.0 / StatsSide.TotalMs) << " FPS)\n";
    std::cout << "   No Sun:    " << StatsNoSun.TotalMs << " ms (" << (1000.0 / StatsNoSun.TotalMs) << " FPS)\n";
    std::cout << "================================================================================\n";
    return 0;
}
