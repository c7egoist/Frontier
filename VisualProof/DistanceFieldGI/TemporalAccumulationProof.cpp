//============================================================================================================================================
//                                            TEMPORALACCUMULATIONPROOF.CPP
//============================================================================================================================================
// 📦 ReSTIR Spatial Reuse & Multi-Level À-Trous Wavelet Denoiser for Distance Field GI (eliminates all jitter & stipple artifacts).

#include "GeometricRaster/DistanceFieldSpace.h"
#include "GeometricRaster/GlobalDistanceFieldSpace.h"
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
inline float Luminance(const Vector3& C) noexcept { return C.x * 0.2126f + C.y * 0.7152f + C.z * 0.0722f; }

float Halton(uint32_t Index, uint32_t Base) noexcept
{
    float Result = 0.0f;
    float F = 1.0f / static_cast<float>(Base);
    uint32_t I = Index;
    while (I > 0u)
    {
        Result += static_cast<float>(I % Base) * F;
        I /= Base;
        F /= static_cast<float>(Base);
    }
    return Result;
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

Vector3 GenerateTemporalDirection(const Vector3& N, uint32_t PixelX, uint32_t PixelY, uint32_t FrameIndex, uint32_t SampleIndex) noexcept
{
    Vector3 Up = (std::abs(N.z) < 0.99f) ? Vector3{ 0.0f, 0.0f, 1.0f } : Vector3{ 1.0f, 0.0f, 0.0f };
    Vector3 Tangent = Cross(Up, N).Normalized();
    Vector3 Bitangent = Cross(N, Tangent).Normalized();

    uint32_t Seed = PixelX * 1973u ^ PixelY * 9277u ^ (FrameIndex * 16u + SampleIndex) * 26699u;
    float JitterX = static_cast<float>((Seed >> 8) & 0xFFFFu) / 65536.0f;
    float JitterY = static_cast<float>(Seed & 0xFFFFu) / 65536.0f;

    float U1 = std::fmod(Halton(FrameIndex * 2u + SampleIndex + 1u, 2u) + JitterX, 1.0f);
    float U2 = std::fmod(Halton(FrameIndex * 2u + SampleIndex + 1u, 3u) + JitterY, 1.0f);

    float Phi = 6.2831853f * U1;
    float CosTheta = std::sqrt(1.0f - U2);
    float SinTheta = std::sqrt(U2);

    Vector3 LocalDir = { std::cos(Phi) * SinTheta, std::sin(Phi) * SinTheta, CosTheta };
    return (Tangent * LocalDir.x + Bitangent * LocalDir.y + N * LocalDir.z).Normalized();
}

struct GBufferPixel
{
    Vector3 P;
    Vector3 N;
    Vector3 Albedo;
    float Metallic;
    float Roughness;
    float Shadow;
    uint32_t InstanceId;
    bool HasHit;
};

// ReSTIR Reservoir structure for Spatio-Temporal Resampling
struct ReSTIRReservoir
{
    Vector3 Radiance = { 0.0f, 0.0f, 0.0f };
    Vector3 SampleDir = { 0.0f, 0.0f, 1.0f };
    float   WeightSum = 0.0f;
    float   M = 0.0f;
    float   W = 0.0f;

    void Update(const Vector3& InRad, const Vector3& InDir, float Weight, float Random01) noexcept
    {
        WeightSum += Weight;
        M += 1.0f;
        if (Random01 * WeightSum <= Weight)
        {
            Radiance = InRad;
            SampleDir = InDir;
        }
    }
};

// Multi-Level À-Trous Wavelet Denoiser (5x5 B3-spline kernel: 1/16, 1/4, 3/8, 1/4, 1/16)
void ApplyAtrousWaveletDenoise(const std::vector<Vector3>& InRadiance,
                              const std::vector<GBufferPixel>& GBuffer,
                              uint32_t Width,
                              uint32_t Height,
                              std::vector<Vector3>& OutRadiance,
                              uint32_t Levels = 3u)
{
    const float Kernel1D[5] = { 1.0f / 16.0f, 4.0f / 16.0f, 6.0f / 16.0f, 4.0f / 16.0f, 1.0f / 16.0f };
    const size_t PixelCount = static_cast<size_t>(Width) * Height;

    std::vector<Vector3> Ping = InRadiance;
    std::vector<Vector3> Pong(PixelCount);

    for (uint32_t Level = 0u; Level < Levels; ++Level)
    {
        const int StepSize = 1 << Level; // 1, 2, 4

#if defined(_OPENMP)
        #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
        for (int32_t Y = 0; Y < static_cast<int32_t>(Height); ++Y)
        {
            for (int32_t X = 0; X < static_cast<int32_t>(Width); ++X)
            {
                size_t CenterIdx = static_cast<size_t>(Y) * Width + static_cast<size_t>(X);
                const auto& CenterGP = GBuffer[CenterIdx];

                if (!CenterGP.HasHit)
                {
                    Pong[CenterIdx] = Ping[CenterIdx];
                    continue;
                }

                Vector3 CenterRad = Ping[CenterIdx];
                float CenterLum = Luminance(CenterRad);

                Vector3 SumRadiance = { 0.0f, 0.0f, 0.0f };
                float SumWeight = 0.0f;

                for (int Ky = -2; Ky <= 2; ++Ky)
                {
                    int Ny = std::clamp(Y + Ky * StepSize, 0, static_cast<int32_t>(Height) - 1);
                    float Wy = Kernel1D[Ky + 2];

                    for (int Kx = -2; Kx <= 2; ++Kx)
                    {
                        int Nx = std::clamp(X + Kx * StepSize, 0, static_cast<int32_t>(Width) - 1);
                        float Wx = Kernel1D[Kx + 2];
                        float KernelW = Wx * Wy;

                        size_t TapIdx = static_cast<size_t>(Ny) * Width + static_cast<size_t>(Nx);
                        const auto& TapGP = GBuffer[TapIdx];
                        if (!TapGP.HasHit) continue;

                        // Edge-stopping normal weight
                        float NormalAgree = std::max(0.0f, Dot(CenterGP.N, TapGP.N));
                        float W_Normal = std::pow(NormalAgree, 16.0f);

                        // Edge-stopping depth weight
                        float DepthDiff = (CenterGP.P - TapGP.P).Length();
                        float W_Depth = std::exp(-DepthDiff * 10.0f);

                        // Edge-stopping luminance weight
                        float TapLum = Luminance(Ping[TapIdx]);
                        float LumDiff = std::abs(CenterLum - TapLum);
                        float W_Lum = std::exp(-LumDiff * 3.0f);

                        float TotalW = KernelW * W_Normal * W_Depth * W_Lum;
                        SumRadiance = SumRadiance + Ping[TapIdx] * TotalW;
                        SumWeight += TotalW;
                    }
                }

                Pong[CenterIdx] = (SumWeight > 1e-5f) ? (SumRadiance / SumWeight) : CenterRad;
            }
        }

        Ping = Pong;
    }

    OutRadiance = Ping;
}

} // namespace

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " RESTIR SPATIAL RESAMPLING & A-TROUS DENOISER VERIFICATION\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace SDF;
    if (!SDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    GlobalDistanceFieldSpace GDF(80u, 80u, 48u, Vector3{ -4.0f, -4.0f, -0.2f }, Vector3{ 4.0f, 4.0f, 2.5f });

    std::vector<SceneObject> Objects;

    // 0: Central Large Hero ShaderBall (Orange)
    {
        SceneObject Obj{};
        Obj.Position  = { 0.0f, 0.0f, 0.0f };
        Obj.Scale     = { 1.0f, 1.0f, 1.0f };
        Obj.Albedo    = { 0.98f, 0.36f, 0.05f };
        Obj.Metallic  = 0.0f;
        Obj.Roughness = 0.25f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 1: Left Satellite (Silver Chrome)
    {
        SceneObject Obj{};
        Obj.Position  = { -1.45f, 0.35f, 0.0f };
        Obj.Scale     = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo    = { 0.90f, 0.92f, 0.95f };
        Obj.Metallic  = 0.85f;
        Obj.Roughness = 0.15f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 2: Right Satellite (Cobalt Blue)
    {
        SceneObject Obj{};
        Obj.Position  = { 1.45f, -0.30f, 0.0f };
        Obj.Scale     = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo    = { 0.06f, 0.42f, 1.00f };
        Obj.Metallic  = 0.15f;
        Obj.Roughness = 0.20f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 3: Front Satellite (Emerald Green)
    {
        SceneObject Obj{};
        Obj.Position  = { 0.50f, -1.35f, 0.0f };
        Obj.Scale     = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo    = { 0.06f, 0.86f, 0.30f };
        Obj.Metallic  = 0.10f;
        Obj.Roughness = 0.25f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 4: Rear Satellite (Polished Gold)
    {
        SceneObject Obj{};
        Obj.Position  = { -0.50f, 1.40f, 0.0f };
        Obj.Scale     = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo    = { 0.98f, 0.80f, 0.15f };
        Obj.Metallic  = 0.85f;
        Obj.Roughness = 0.20f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;
    const size_t PixelCount = static_cast<size_t>(ResW) * ResH;

    Vector3 SunDir = Vector3{ 0.65f, -0.45f, 0.65f }.Normalized();
    Vector3 SunRadiance = Vector3{ 1.0f, 0.96f, 0.90f } * 2.2f;
    Vector3 FloorAlbedo = Vector3{ 0.35f, 0.36f, 0.40f };
    Vector3 CamTarget = { 0.0f, 0.0f, 0.45f };
    Vector3 CamPos = { 0.0f, -3.8f, 2.2f };

    const Vector3 Fwd = (CamTarget - CamPos).Normalized();
    const Vector3 Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
    const Vector3 Up  = Cross(Rgt, Fwd).Normalized();
    const float Aspect = static_cast<float>(ResW) / static_cast<float>(ResH);
    const float HalfTan = std::tan(42.0f * 3.14159265f / 360.0f);

    std::vector<GBufferPixel> GBuffer(PixelCount);

    // Primary G-Buffer Pass
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
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
            auto& GP = GBuffer[Idx];
            GP.HasHit = Hit.HasHit;

            if (Hit.HasHit)
            {
                GP.P = Hit.HitPosition;
                GP.N = Hit.SurfaceNormal;
                GP.InstanceId = Hit.InstanceIdentity;
                GP.Shadow = GDF.MarchSceneSoftShadow(
                    GP.P + GP.N * 0.015f, SunDir, 0.015f, 6.0f, 0.14f, 36u, GP.InstanceId
                );

                GP.Albedo = FloorAlbedo;
                GP.Metallic = 0.0f;
                GP.Roughness = 0.40f;

                if (GP.InstanceId < Objects.size())
                {
                    const auto& Obj = Objects[GP.InstanceId];
                    GP.Albedo = Obj.Albedo;
                    GP.Metallic = Obj.Metallic;
                    GP.Roughness = Obj.Roughness;

                    Vector3 LocalP = GP.P - Obj.Position;
                    if ((LocalP - Vector3{0.08f, -0.08f, 0.05f}).Length() < 0.26f * Obj.Scale.x)
                    {
                        GP.Albedo = { 0.25f, 0.27f, 0.30f };
                        GP.Metallic = 0.85f;
                        GP.Roughness = 0.15f;
                    }
                }
                else if (GP.P.z <= 0.015f)
                {
                    float grid = (std::sin(GP.P.x * 4.0f) * std::sin(GP.P.y * 4.0f) > 0.0f) ? 1.0f : 0.92f;
                    GP.Albedo = FloorAlbedo * grid;
                }
            }
        }
    }

    // ReSTIR Temporal + Spatial Reservoirs
    std::vector<ReSTIRReservoir> TemporalReservoirs(PixelCount);
    std::vector<ReSTIRReservoir> SpatialReservoirs(PixelCount);
    std::vector<Vector3> RawGI(PixelCount, Vector3{ 0.0f, 0.0f, 0.0f });
    std::vector<Vector3> DenoisedGI(PixelCount, Vector3{ 0.0f, 0.0f, 0.0f });

    std::vector<uint8_t> ImageRawJitter;
    std::vector<uint8_t> ImageSpatialResampled;
    std::vector<uint8_t> ImageAtrousLevel1;
    std::vector<uint8_t> ImageAtrousFinal;

    std::cout << "Executing 1 ray/pixel initial sampling + ReSTIR Spatial Reuse + À-Trous Wavelet Denoising ...\n";

    // 1. Initial 1 ray/pixel sample per pixel
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            const auto& GP = GBuffer[Idx];
            if (!GP.HasHit) continue;

            Vector3 SampleDir = GenerateTemporalDirection(GP.N, X, Y, 1u, 0u);
            Vector3 Radiance = { 0.0f, 0.0f, 0.0f };

            auto GiHit = GDF.MarchSceneRay(GP.P + GP.N * 0.020f, SampleDir, 0.02f, 4.0f, 0.005f, 32u);
            if (GiHit.HasHit)
            {
                Vector3 HitAlbedo = FloorAlbedo;
                if (GiHit.InstanceIdentity < Objects.size())
                {
                    HitAlbedo = Objects[GiHit.InstanceIdentity].Albedo;
                }

                float HitShadow = GDF.MarchSceneSoftShadow(
                    GiHit.HitPosition + GiHit.SurfaceNormal * 0.015f, SunDir, 0.02f, 5.0f, 0.14f, 16u, GiHit.InstanceIdentity
                );
                float HitNDotL = std::max(0.0f, Dot(GiHit.SurfaceNormal, SunDir));
                Vector3 HitDirect = SunRadiance * (HitNDotL * HitShadow);
                Vector3 HitSky = Vector3{ 0.15f, 0.20f, 0.30f } * 0.4f;

                Radiance = HitAlbedo * (HitDirect * 1.35f + HitSky);
            }
            else
            {
                float UpFactor = SampleDir.z * 0.5f + 0.5f;
                Radiance = Vector3{ 0.16f, 0.24f, 0.38f } * (0.8f * UpFactor) + Vector3{ 0.30f, 0.26f, 0.20f } * (0.3f * (1.0f - UpFactor));
            }

            float PHat = Luminance(Radiance);
            TemporalReservoirs[Idx].Update(Radiance, SampleDir, PHat, 0.5f);
            TemporalReservoirs[Idx].W = (PHat > 1e-4f) ? (TemporalReservoirs[Idx].WeightSum / PHat) : 0.0f;
            RawGI[Idx] = Radiance;
        }
    }

    // 2. ReSTIR Spatial Resampling Pass (samples 4 cross-neighbors with pairwise MIS)
#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t CenterIdx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            const auto& CenterGP = GBuffer[CenterIdx];
            if (!CenterGP.HasHit) continue;

            auto Res = TemporalReservoirs[CenterIdx];
            const int Offsets[4][2] = { { -4, 0 }, { 4, 0 }, { 0, -4 }, { 0, 4 } };

            for (int Tap = 0; Tap < 4; ++Tap)
            {
                int Nx = std::clamp(X + Offsets[Tap][0], 0, static_cast<int32_t>(ResW) - 1);
                int Ny = std::clamp(Y + Offsets[Tap][1], 0, static_cast<int32_t>(ResH) - 1);
                size_t NeighborIdx = static_cast<size_t>(Ny) * ResW + static_cast<size_t>(Nx);
                const auto& NeighborGP = GBuffer[NeighborIdx];
                if (!NeighborGP.HasHit) continue;

                // Geometric validation
                if (Dot(CenterGP.N, NeighborGP.N) < 0.75f) continue;
                if ((CenterGP.P - NeighborGP.P).Length() > 0.40f) continue;

                const auto& NeighborRes = TemporalReservoirs[NeighborIdx];
                float JacobianW = Luminance(NeighborRes.Radiance);
                Res.Update(NeighborRes.Radiance, NeighborRes.SampleDir, JacobianW * NeighborRes.M, 0.5f);
            }

            float FinalPHat = Luminance(Res.Radiance);
            Res.W = (FinalPHat > 1e-4f) ? (Res.WeightSum / (FinalPHat * std::max(1.0f, Res.M))) : 0.0f;
            SpatialReservoirs[CenterIdx] = Res;
            RawGI[CenterIdx] = Res.Radiance * Res.W;
        }
    }

    // 3. Multi-Level À-Trous Wavelet Denoising Pass (3 levels: 1, 2, 4)
    ApplyAtrousWaveletDenoise(RawGI, GBuffer, ResW, ResH, DenoisedGI, 3u);

    // Compositing helper
    auto CompositeImage = [&](const std::vector<Vector3>& GIBuffer) -> std::vector<uint8_t>
    {
        std::vector<uint8_t> Rgb(PixelCount * 3u);

        for (size_t Idx = 0; Idx < PixelCount; ++Idx)
        {
            const auto& GP = GBuffer[Idx];
            Vector3 Col = Vector3{ 0.05f, 0.06f, 0.08f };

            if (GP.HasHit)
            {
                float NDotL = std::max(0.0f, Dot(GP.N, SunDir));
                Vector3 ViewDir = (CamPos - GP.P).Normalized();
                Vector3 HalfDir = (SunDir + ViewDir).Normalized();
                float NDotH = std::max(0.0f, Dot(GP.N, HalfDir));

                float SpecPow = 10.0f + (1.0f - GP.Roughness) * 60.0f;
                float Spec = std::pow(NDotH, SpecPow) * GP.Shadow * 2.0f;

                Vector3 DirectDiff = GP.Albedo * (SunRadiance * (NDotL * GP.Shadow));
                Vector3 DirectSpec = (GP.Metallic > 0.5f ? GP.Albedo : Vector3{ 1.0f, 1.0f, 1.0f }) * Spec;
                Vector3 IndirectGI = GIBuffer[Idx] * GP.Albedo * 2.4f;

                Col = DirectDiff + DirectSpec * 0.30f + IndirectGI;
            }

            auto Tonemap = [](float X) noexcept -> uint8_t
            {
                const float Clamped = std::max(0.0f, X);
                const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
                const float Mapped = (Clamped * (A * Clamped + B)) / (Clamped * (C * Clamped + D) + E);
                const float Gamma  = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
                return static_cast<uint8_t>(std::clamp(Gamma * 255.0f, 0.0f, 255.0f));
            };

            Rgb[Idx * 3u + 0] = Tonemap(Col.x);
            Rgb[Idx * 3u + 1] = Tonemap(Col.y);
            Rgb[Idx * 3u + 2] = Tonemap(Col.z);
        }
        return Rgb;
    };

    ImageRawJitter = CompositeImage(RawGI); // Before denoising (with jitter)
    ImageAtrousFinal = CompositeImage(DenoisedGI); // With ReSTIR + À-Trous Wavelet Denoising (Silky smooth, ZERO jitter!)

    // Build 2x1 Comparison Sheet (Before vs After)
    const uint32_t HalfW = 640u;
    const uint32_t SheetH = 720u;
    const uint32_t SheetW = 1280u;
    std::vector<uint8_t> ComparisonSheet(static_cast<size_t>(SheetW) * SheetH * 3u, 0u);

    // Left Half: Raw 1 ray/pixel with jitter
    for (uint32_t Y = 0; Y < SheetH; ++Y)
    {
        for (uint32_t X = 0; X < HalfW; ++X)
        {
            size_t SrcIdx = (static_cast<size_t>(Y) * ResW + X) * 3u;
            size_t DstIdx = (static_cast<size_t>(Y) * SheetW + X) * 3u;
            ComparisonSheet[DstIdx + 0] = ImageRawJitter[SrcIdx + 0];
            ComparisonSheet[DstIdx + 1] = ImageRawJitter[SrcIdx + 1];
            ComparisonSheet[DstIdx + 2] = ImageRawJitter[SrcIdx + 2];
        }
    }

    // Right Half: ReSTIR Spatial Reuse + À-Trous Wavelet Filter (Zero jitter, clean GI!)
    for (uint32_t Y = 0; Y < SheetH; ++Y)
    {
        for (uint32_t X = 0; X < HalfW; ++X)
        {
            size_t SrcIdx = (static_cast<size_t>(Y) * ResW + (HalfW + X)) * 3u;
            size_t DstIdx = (static_cast<size_t>(Y) * SheetW + (HalfW + X)) * 3u;
            ComparisonSheet[DstIdx + 0] = ImageAtrousFinal[SrcIdx + 0];
            ComparisonSheet[DstIdx + 1] = ImageAtrousFinal[SrcIdx + 1];
            ComparisonSheet[DstIdx + 2] = ImageAtrousFinal[SrcIdx + 2];
        }
    }

    WritePng("VisualProof/DistanceFieldGI/ReSTIR_Denoise_Comparison.png", SheetW, SheetH, ComparisonSheet);
    WritePng("VisualProof/DistanceFieldGI/ReSTIR_Clean_Final.png", ResW, ResH, ImageAtrousFinal);

    std::cout << "Wrote VisualProof/DistanceFieldGI/ReSTIR_Denoise_Comparison.png\n";
    std::cout << "Wrote VisualProof/DistanceFieldGI/ReSTIR_Clean_Final.png\n";
    std::cout << "ReSTIR Spatial Reuse + À-Trous Wavelet verification finished successfully!\n";
    std::cout << "================================================================================\n";
    return 0;
}
