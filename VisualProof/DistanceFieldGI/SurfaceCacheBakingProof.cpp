//============================================================================================================================================
//                                          SURFACECACHEBAKINGPROOF.CPP
//============================================================================================================================================
// 📦 Verification of asynchronous background direct radiance baking into Surface Cache atlas and O(1) GI sampling speedup.

#include "GeometricRaster/DistanceFieldSpace.h"
#include "GeometricRaster/GlobalDistanceFieldSpace.h"
#include "GeometricRaster/SurfaceCacheStructure.h"
#include <iostream>
#include <vector>
#include <cmath>
#include <fstream>
#include <algorithm>
#include <string>
#include <chrono>

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

struct SceneObject
{
    uint32_t PlacementId;
    Vector3 Position;
    Vector3 Scale;
    Vector3 Albedo;
    float Metallic;
    float Roughness;
};

} // namespace

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " SURFACE CACHE DIRECT RADIANCE BAKING & ACCELERATION VERIFICATION\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace SDF;
    if (!SDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    GlobalDistanceFieldSpace GDF(80u, 80u, 48u, Vector3{ -4.0f, -4.0f, -0.2f }, Vector3{ 4.0f, 4.0f, 2.5f });

    // Scene with 4 ShaderBalls
    std::vector<SceneObject> Objects;
    // 0: Orange Hero
    Objects.push_back({ GDF.RegisterPlacement(&SDF, { 0.0f, 0.0f, 0.0f }, { 1.0f, 1.0f, 1.0f }),
                        { 0.0f, 0.0f, 0.0f }, { 1.0f, 1.0f, 1.0f }, { 0.98f, 0.38f, 0.06f }, 0.0f, 0.25f });
    // 1: Silver Chrome
    Objects.push_back({ GDF.RegisterPlacement(&SDF, { -1.5f, 0.4f, 0.0f }, { 0.75f, 0.75f, 0.75f }),
                        { -1.5f, 0.4f, 0.0f }, { 0.75f, 0.75f, 0.75f }, { 0.92f, 0.92f, 0.95f }, 0.85f, 0.15f });
    // 2: Cobalt Blue
    Objects.push_back({ GDF.RegisterPlacement(&SDF, { 1.5f, -0.2f, 0.0f }, { 0.75f, 0.75f, 0.75f }),
                        { 1.5f, -0.2f, 0.0f }, { 0.75f, 0.75f, 0.75f }, { 0.08f, 0.45f, 1.00f }, 0.15f, 0.20f });
    // 3: Emerald Green
    Objects.push_back({ GDF.RegisterPlacement(&SDF, { -0.3f, -1.4f, 0.0f }, { 0.65f, 0.65f, 0.65f }),
                        { -0.3f, -1.4f, 0.0f }, { 0.65f, 0.65f, 0.65f }, { 0.08f, 0.88f, 0.35f }, 0.10f, 0.25f });

    Vector3 SunDir = Vector3{ 0.65f, -0.45f, 0.65f }.Normalized();
    Vector3 SunRadiance = Vector3{ 1.0f, 0.96f, 0.90f } * 2.2f;

    // 1. Initialize Surface Cache Structure (256x256 atlas = 4 cards of 128x128)
    std::cout << "Initializing 2D Surface Cache Atlas (256x256 texels) ...\n";
    SurfaceCacheStructure SurfaceCache(256u, 256u);

    for (size_t I = 0; I < Objects.size(); ++I)
    {
        uint32_t CardId = SurfaceCache.RegisterShaderBallCard(
            static_cast<uint32_t>(I),
            Objects[I].Position,
            0.55f * Objects[I].Scale.x,
            Objects[I].Albedo
        );
        std::cout << "  Card " << CardId << " registered for Instance " << I << " [Tile: 128x128]\n";
    }

    // 2. Demonstrate Asynchronous Time-Sliced Baking
    std::cout << "\nSimulating Asynchronous Background Atlas Baking across 4 frame slices ...\n";
    SurfaceCache.QueueAsyncDirectBake(SunDir, SunRadiance, 0.175f);

    uint32_t SliceBudget = 16384u; // 16k texels per slice (25% atlas per tick)
    int SliceStep = 0;
    while (!SurfaceCache.GetBakeState().IsCompleted)
    {
        auto T0 = std::chrono::high_resolution_clock::now();
        bool Finished = SurfaceCache.StepAsyncDirectBake(GDF, SliceBudget);
        auto T1 = std::chrono::high_resolution_clock::now();
        double Ms = std::chrono::duration<double, std::milli>(T1 - T0).count();

        std::cout << "  Slice " << SliceStep << ": Processed " << SliceBudget << " texels in "
                  << Ms << " ms (Progress: "
                  << (SurfaceCache.GetBakeState().CurrentTexelCursor * 100 / SurfaceCache.GetBakeState().TotalTexels)
                  << "%)\n";
        SliceStep++;
        if (Finished) break;
    }
    std::cout << "Asynchronous background bake completed successfully!\n";

    // Propagate 1 bounce of indirect irradiance between texels
    std::cout << "Propagating Indirect Irradiance in Surface Cache ...\n";
    SurfaceCache.PropagateIndirectIrradiance(GDF, 4u);

    // 3. Save Atlas Visualization (Surface_Cache_Atlas_Unfolded.png)
    std::cout << "\nExporting 2D Unfolded Surface Cache Atlas Visualization ...\n";
    std::vector<uint8_t> AtlasRgb(256 * 256 * 3u);

    auto Tonemap = [](float X) noexcept -> uint8_t
    {
        const float Clamped = std::max(0.0f, X);
        const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
        const float Mapped = (Clamped * (A * Clamped + B)) / (Clamped * (C * Clamped + D) + E);
        const float Gamma  = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
        return static_cast<uint8_t>(std::clamp(Gamma * 255.0f, 0.0f, 255.0f));
    };

    for (uint32_t Y = 0; Y < 256; ++Y)
    {
        for (uint32_t X = 0; X < 256; ++X)
        {
            const auto& Texel = SurfaceCache.GetTexel(X, Y);
            size_t OutIdx = (static_cast<size_t>(Y) * 256 + X) * 3u;
            Vector3 DisplayColor = (Texel.DirectRadiance + Texel.IrradianceBounce) * Texel.AlbedoColour;
            AtlasRgb[OutIdx + 0] = Tonemap(DisplayColor.x);
            AtlasRgb[OutIdx + 1] = Tonemap(DisplayColor.y);
            AtlasRgb[OutIdx + 2] = Tonemap(DisplayColor.z);
        }
    }
    WritePng("VisualProof/DistanceFieldGI/Surface_Cache_Atlas_Unfolded.png", 256, 256, AtlasRgb);
    std::cout << "Wrote VisualProof/DistanceFieldGI/Surface_Cache_Atlas_Unfolded.png\n";

    // 4. Performance Benchmark: Surface Cache Lookups vs. Per-Ray Shadow Marching
    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;
    const size_t PixelCount = static_cast<size_t>(ResW) * ResH;

    Vector3 CamPos = { 0.0f, -3.8f, 2.2f };
    Vector3 CamTarget = { 0.0f, 0.0f, 0.45f };
    Vector3 Fwd = (CamTarget - CamPos).Normalized();
    Vector3 Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
    Vector3 Up  = Cross(Rgt, Fwd).Normalized();
    float Aspect = static_cast<float>(ResW) / static_cast<float>(ResH);
    float HalfTan = std::tan(42.0f * 3.14159265f / 360.0f);

    std::cout << "\nRunning Performance Benchmark (1280x720) ...\n";

    // Benchmark Mode A: Direct Real-Time Marching (Every probe ray marches 24 shadow steps)
    std::vector<Vector3> ImageDirect(PixelCount);
    auto T_Direct0 = std::chrono::high_resolution_clock::now();
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 8)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(ResW) * 2.0f - 1.0f) * Aspect * HalfTan;
            float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(ResH) * 2.0f) * HalfTan;
            Vector3 RayDir = (Fwd + Rgt * U + Up * V).Normalized();

            auto Hit = GDF.MarchSceneRay(CamPos, RayDir, 0.2f, 16.0f, 0.002f, 140u, 0.85f);
            if (Hit.HasHit)
            {
                float NDotL = std::max(0.0f, Dot(Hit.SurfaceNormal, SunDir));
                float Shadow = GDF.MarchSceneSoftShadow(Hit.HitPosition + Hit.SurfaceNormal * 0.015f, SunDir, 0.015f, 5.0f, 0.175f, 24u, Hit.InstanceIdentity);
                Vector3 Alb = (Hit.InstanceIdentity < Objects.size()) ? Objects[Hit.InstanceIdentity].Albedo : Vector3{ 0.35f, 0.36f, 0.40f };
                ImageDirect[Idx] = Alb * (SunRadiance * (NDotL * Shadow) + Vector3{ 0.15f, 0.20f, 0.30f } * 0.4f);
            }
            else
            {
                ImageDirect[Idx] = { 0.05f, 0.06f, 0.08f };
            }
        }
    }
    auto T_Direct1 = std::chrono::high_resolution_clock::now();
    double MsDirect = std::chrono::duration<double, std::milli>(T_Direct1 - T_Direct0).count();

    // Benchmark Mode B: Accelerated Surface Cache Lookup (O(1) direct radiance query)
    std::vector<Vector3> ImageCache(PixelCount);
    auto T_Cache0 = std::chrono::high_resolution_clock::now();
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 8)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(ResW) * 2.0f - 1.0f) * Aspect * HalfTan;
            float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(ResH) * 2.0f) * HalfTan;
            Vector3 RayDir = (Fwd + Rgt * U + Up * V).Normalized();

            auto Hit = GDF.MarchSceneRay(CamPos, RayDir, 0.2f, 16.0f, 0.002f, 140u, 0.85f);
            if (Hit.HasHit)
            {
                // Instant O(1) Surface Cache Lookup
                Vector3 BakedRadiance = SurfaceCache.SampleRadianceFromWorld(Hit.HitPosition, Hit.SurfaceNormal, Hit.InstanceIdentity);
                Vector3 SkyGI = Vector3{ 0.15f, 0.20f, 0.30f } * 0.3f;
                ImageCache[Idx] = BakedRadiance + SkyGI;
            }
            else
            {
                ImageCache[Idx] = { 0.05f, 0.06f, 0.08f };
            }
        }
    }
    auto T_Cache1 = std::chrono::high_resolution_clock::now();
    double MsCache = std::chrono::duration<double, std::milli>(T_Cache1 - T_Cache0).count();

    double Speedup = MsDirect / MsCache;

    std::cout << "  [Mode A] Real-Time Shadow Ray Marching: " << MsDirect << " ms\n";
    std::cout << "  [Mode B] Surface Cache O(1) Atlas Lookup: " << MsCache << " ms\n";
    std::cout << "  ==> Surface Cache Speedup: " << Speedup << "x FASTER!\n";

    // Export final rendered scene with surface cache
    std::vector<uint8_t> RenderRgb(PixelCount * 3u);
    for (size_t I = 0; I < PixelCount; ++I)
    {
        RenderRgb[I * 3 + 0] = Tonemap(ImageCache[I].x);
        RenderRgb[I * 3 + 1] = Tonemap(ImageCache[I].y);
        RenderRgb[I * 3 + 2] = Tonemap(ImageCache[I].z);
    }
    WritePng("VisualProof/DistanceFieldGI/Surface_Cache_Scene_Render.png", ResW, ResH, RenderRgb);
    std::cout << "Wrote VisualProof/DistanceFieldGI/Surface_Cache_Scene_Render.png\n";

    // Write Benchmark summary
    std::ofstream BenchFile("VisualProof/DistanceFieldGI/Surface_Cache_Speedup_Benchmark.txt");
    BenchFile << "================================================================================\n";
    BenchFile << " SURFACE CACHE DIRECT RADIANCE BAKING BENCHMARK REPORT\n";
    BenchFile << "================================================================================\n";
    BenchFile << "Resolution:                   " << ResW << "x" << ResH << " (921,600 pixels)\n";
    BenchFile << "Atlas Size:                   256x256 (65,536 texels across 4 cards)\n";
    BenchFile << "Async Slice Budget:           16,384 texels/frame (4 frames total)\n";
    BenchFile << "Mode A (Per-Ray Shadow March): " << MsDirect << " ms\n";
    BenchFile << "Mode B (Surface Cache Lookup): " << MsCache << " ms\n";
    BenchFile << "Speedup Factor:               " << Speedup << "x Faster\n";
    BenchFile << "================================================================================\n";
    BenchFile.close();

    std::cout << "Verification complete!\n";
    std::cout << "================================================================================\n";
    return 0;
}
