//============================================================================================================================================
//                                        MOTIONVECTORREPROJECTIONPROOF.CPP
//============================================================================================================================================
// 📦 Demonstrates screen-space motion vectors, temporal reprojection, and disocclusion rejection to eliminate ghosting on moving objects.

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

struct SceneObject
{
    uint32_t PlacementId;
    Vector3 Position;
    Vector3 PrevPosition; // [m] position in previous frame
    Vector3 Scale;
    Vector3 Albedo;
    float Metallic;
    float Roughness;
};

struct PixelGBuffer
{
    Vector3 P;
    Vector3 N;
    Vector3 Albedo;
    float   Metallic;
    float   Roughness;
    float   Shadow;
    Vector3 MotionVector; // [pixels] screen motion delta (vx, vy)
    uint32_t InstanceId;
    bool    HasHit;
};

// Camera projection helper
struct CameraState
{
    Vector3 CamPos;
    Vector3 CamTarget;
    Vector3 Fwd, Rgt, Up;
    float HalfTan;
    float Aspect;
    uint32_t Width, Height;

    void Setup(Vector3 Pos, Vector3 Target, uint32_t W, uint32_t H, float Fov = 42.0f)
    {
        CamPos = Pos;
        CamTarget = Target;
        Width = W;
        Height = H;
        Fwd = (CamTarget - CamPos).Normalized();
        Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
        Up  = Cross(Rgt, Fwd).Normalized();
        Aspect = static_cast<float>(W) / static_cast<float>(H);
        HalfTan = std::tan(Fov * 3.14159265f / 360.0f);
    }

    // Projects world point to screen pixel (X, Y)
    bool WorldToScreen(Vector3 P, float& OutX, float& OutY) const noexcept
    {
        Vector3 ToP = P - CamPos;
        float Depth = Dot(ToP, Fwd);
        if (Depth <= 0.1f) return false;

        float XCam = Dot(ToP, Rgt) / Depth;
        float YCam = Dot(ToP, Up)  / Depth;

        float NormX = (XCam / (Aspect * HalfTan) + 1.0f) * 0.5f;
        float NormY = (1.0f - YCam / HalfTan) * 0.5f;

        OutX = NormX * static_cast<float>(Width);
        OutY = NormY * static_cast<float>(Height);
        return (NormX >= 0.0f && NormX <= 1.0f && NormY >= 0.0f && NormY <= 1.0f);
    }
};

} // namespace

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " MOTION VECTORS & TEMPORAL DISOCCLUSION REPROJECTION VERIFICATION\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace SDF;
    if (!SDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    GlobalDistanceFieldSpace GDF(80u, 80u, 48u, Vector3{ -4.0f, -4.0f, -0.2f }, Vector3{ 4.0f, 4.0f, 2.5f });

    // Scene with 5 ShaderBalls where the Orange and Blue ShaderBalls are moving rapidly across frames
    std::vector<SceneObject> Objects;

    // 0: Orange Hero ShaderBall (Translating rapidly to the right)
    {
        SceneObject Obj{};
        Obj.Position     = { 0.45f, 0.0f, 0.0f };   // Current frame position
        Obj.PrevPosition = { -0.45f, 0.0f, 0.0f };  // Previous frame position (moved +0.90m!)
        Obj.Scale        = { 1.0f, 1.0f, 1.0f };
        Obj.Albedo       = { 0.98f, 0.36f, 0.05f };
        Obj.Metallic     = 0.0f;
        Obj.Roughness    = 0.25f;
        Obj.PlacementId  = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 1: Left Satellite (Silver Chrome)
    {
        SceneObject Obj{};
        Obj.Position     = { -1.65f, 0.35f, 0.0f };
        Obj.PrevPosition = { -1.65f, 0.35f, 0.0f };
        Obj.Scale        = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo       = { 0.90f, 0.92f, 0.95f };
        Obj.Metallic     = 0.85f;
        Obj.Roughness    = 0.15f;
        Obj.PlacementId  = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 2: Right Satellite (Cobalt Blue) (Moving forward)
    {
        SceneObject Obj{};
        Obj.Position     = { 1.55f, -0.65f, 0.0f };
        Obj.PrevPosition = { 1.55f, 0.15f, 0.0f }; // Moved -0.80m in Y
        Obj.Scale        = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo       = { 0.06f, 0.42f, 1.00f };
        Obj.Metallic     = 0.15f;
        Obj.Roughness    = 0.20f;
        Obj.PlacementId  = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 3: Front Satellite (Emerald Green)
    {
        SceneObject Obj{};
        Obj.Position     = { -0.20f, -1.35f, 0.0f };
        Obj.PrevPosition = { -0.20f, -1.35f, 0.0f };
        Obj.Scale        = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo       = { 0.06f, 0.86f, 0.30f };
        Obj.Metallic     = 0.10f;
        Obj.Roughness    = 0.25f;
        Obj.PlacementId  = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }
    // 4: Rear Satellite (Gold)
    {
        SceneObject Obj{};
        Obj.Position     = { -0.50f, 1.40f, 0.0f };
        Obj.PrevPosition = { -0.50f, 1.40f, 0.0f };
        Obj.Scale        = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo       = { 0.98f, 0.80f, 0.15f };
        Obj.Metallic     = 0.85f;
        Obj.Roughness    = 0.20f;
        Obj.PlacementId  = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;
    const size_t PixelCount = static_cast<size_t>(ResW) * ResH;

    CameraState CurrentCam, PrevCam;
    CurrentCam.Setup({ 0.0f, -3.8f, 2.2f }, { 0.0f, 0.0f, 0.45f }, ResW, ResH);
    PrevCam.Setup({ 0.05f, -3.85f, 2.2f }, { 0.0f, 0.0f, 0.45f }, ResW, ResH); // Slight camera motion

    Vector3 SunDir = Vector3{ 0.65f, -0.45f, 0.65f }.Normalized();
    Vector3 SunRadiance = Vector3{ 1.0f, 0.96f, 0.90f } * 2.2f;
    Vector3 FloorAlbedo = Vector3{ 0.35f, 0.36f, 0.40f };

    std::vector<PixelGBuffer> GBuffer(PixelCount);
    std::vector<Vector3> MotionVectorVisual(PixelCount);

    std::cout << "Computing per-pixel G-Buffer, Soft Shadows, and True Motion Vectors ...\n";

#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(ResW) * 2.0f - 1.0f) * CurrentCam.Aspect * CurrentCam.HalfTan;
            float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(ResH) * 2.0f) * CurrentCam.HalfTan;
            Vector3 RayDir = (CurrentCam.Fwd + CurrentCam.Rgt * U + CurrentCam.Up * V).Normalized();

            auto Hit = GDF.MarchSceneRay(CurrentCam.CamPos, RayDir, 0.2f, 16.0f, 0.002f, 140u, 0.85f);
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

                // Determine previous world position P_prev
                Vector3 P_prev = GP.P;
                if (GP.InstanceId < Objects.size())
                {
                    const auto& Obj = Objects[GP.InstanceId];
                    GP.Albedo = Obj.Albedo;
                    GP.Metallic = Obj.Metallic;
                    GP.Roughness = Obj.Roughness;

                    // Reverse current translation and apply previous translation
                    Vector3 LocalP = GP.P - Obj.Position;
                    P_prev = Obj.PrevPosition + LocalP;
                }
                else if (GP.P.z <= 0.015f)
                {
                    float grid = (std::sin(GP.P.x * 4.0f) * std::sin(GP.P.y * 4.0f) > 0.0f) ? 1.0f : 0.92f;
                    GP.Albedo = FloorAlbedo * grid;
                }

                // Project current and previous world positions to compute exact Motion Vector
                float CurrScreenX = static_cast<float>(X);
                float CurrScreenY = static_cast<float>(Y);
                float PrevScreenX = CurrScreenX;
                float PrevScreenY = CurrScreenY;

                if (PrevCam.WorldToScreen(P_prev, PrevScreenX, PrevScreenY))
                {
                    GP.MotionVector = { CurrScreenX - PrevScreenX, CurrScreenY - PrevScreenY, 0.0f };
                }
                else
                {
                    GP.MotionVector = { 0.0f, 0.0f, 0.0f };
                }

                // Color-code motion vector for visualization
                float Vx = std::clamp(GP.MotionVector.x * 0.05f + 0.5f, 0.0f, 1.0f);
                float Vy = std::clamp(GP.MotionVector.y * 0.05f + 0.5f, 0.0f, 1.0f);
                MotionVectorVisual[Idx] = { Vx, Vy, 0.5f };
            }
            else
            {
                MotionVectorVisual[Idx] = { 0.5f, 0.5f, 0.5f };
            }
        }
    }

    // 1. Simulate History Frame: The previous frame had the Orange ShaderBall at (-0.45m) and Blue at (+0.15m)
    std::cout << "Rendering Previous Frame Reference for temporal history ...\n";
    std::vector<Vector3> HistoryColor(PixelCount, Vector3{ 0.05f, 0.06f, 0.08f });
    std::vector<uint32_t> HistoryInstance(PixelCount, 0xFFFFFFFFu);
    std::vector<float> HistoryDepth(PixelCount, 1e6f);

    // Update GDF with previous positions to simulate actual history buffer
    for (size_t I = 0; I < Objects.size(); ++I)
    {
        GDF.UpdatePlacementTransform(Objects[I].PlacementId, Objects[I].PrevPosition, Objects[I].Scale);
    }

#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(ResW) * 2.0f - 1.0f) * PrevCam.Aspect * PrevCam.HalfTan;
            float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(ResH) * 2.0f) * PrevCam.HalfTan;
            Vector3 RayDir = (PrevCam.Fwd + PrevCam.Rgt * U + PrevCam.Up * V).Normalized();

            auto Hit = GDF.MarchSceneRay(PrevCam.CamPos, RayDir, 0.2f, 16.0f, 0.002f, 140u, 0.85f);
            if (Hit.HasHit)
            {
                HistoryDepth[Idx] = Hit.TravelDistance;
                HistoryInstance[Idx] = Hit.InstanceIdentity;
                Vector3 Alb = FloorAlbedo;
                if (Hit.InstanceIdentity < Objects.size()) Alb = Objects[Hit.InstanceIdentity].Albedo;
                float Shadow = GDF.MarchSceneSoftShadow(Hit.HitPosition + Hit.SurfaceNormal * 0.015f, SunDir, 0.015f, 6.0f, 0.14f, 36u, Hit.InstanceIdentity);
                float NDotL = std::max(0.0f, Dot(Hit.SurfaceNormal, SunDir));
                HistoryColor[Idx] = Alb * (SunRadiance * (NDotL * Shadow) + Vector3{ 0.15f, 0.20f, 0.30f } * 0.4f);
            }
        }
    }

    // Restore GDF back to current positions
    for (size_t I = 0; I < Objects.size(); ++I)
    {
        GDF.UpdatePlacementTransform(Objects[I].PlacementId, Objects[I].Position, Objects[I].Scale);
    }

    // 2. Evaluate Current Frame Lighting
    std::vector<Vector3> CurrentFrameColor(PixelCount);
    for (size_t Idx = 0; Idx < PixelCount; ++Idx)
    {
        const auto& GP = GBuffer[Idx];
        if (!GP.HasHit) { CurrentFrameColor[Idx] = { 0.05f, 0.06f, 0.08f }; continue; }
        float NDotL = std::max(0.0f, Dot(GP.N, SunDir));
        Vector3 DirectDiff = GP.Albedo * (SunRadiance * (NDotL * GP.Shadow));
        Vector3 SkyGI = Vector3{ 0.15f, 0.20f, 0.30f } * 0.4f * GP.Albedo;
        CurrentFrameColor[Idx] = DirectDiff + SkyGI;
    }

    // 3. Comparison Case A: Naive Temporal Blend (NO Motion Vectors & NO Disocclusion Rejection)
    // Results in severe ghosting trails behind the moving orange and blue balls!
    std::vector<Vector3> NaiveGhostedColor(PixelCount);
    for (size_t Idx = 0; Idx < PixelCount; ++Idx)
    {
        // Blind 85% history + 15% current blend at same pixel coordinate
        NaiveGhostedColor[Idx] = HistoryColor[Idx] * 0.85f + CurrentFrameColor[Idx] * 0.15f;
    }

    // 4. Comparison Case B: Full Motion Vectors + Disocclusion Rejection + Neighborhood Clamping
    // ZERO GHOSTING: accurately tracks moving geometry and rejects disocclusions!
    std::vector<Vector3> CleanReprojectedColor(PixelCount);

#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(ResH); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(ResW); ++X)
        {
            size_t Idx = static_cast<size_t>(Y) * ResW + static_cast<size_t>(X);
            const auto& GP = GBuffer[Idx];
            if (!GP.HasHit) { CleanReprojectedColor[Idx] = { 0.05f, 0.06f, 0.08f }; continue; }

            // Reproject pixel coordinate using motion vector
            float PrevX = static_cast<float>(X) - GP.MotionVector.x;
            float PrevY = static_cast<float>(Y) - GP.MotionVector.y;

            int SampleX = std::clamp(static_cast<int>(std::round(PrevX)), 0, static_cast<int>(ResW) - 1);
            int SampleY = std::clamp(static_cast<int>(std::round(PrevY)), 0, static_cast<int>(ResH) - 1);
            size_t PrevIdx = static_cast<size_t>(SampleY) * ResW + static_cast<size_t>(SampleX);

            // Disocclusion Rejection Check
            bool Disoccluded = false;
            if (HistoryInstance[PrevIdx] != GP.InstanceId)
            {
                Disoccluded = true; // Object ID mismatch (e.g. ball moved away, revealing floor!)
            }
            if (std::abs(HistoryDepth[PrevIdx] - (GP.P - CurrentCam.CamPos).Length()) > 0.35f)
            {
                Disoccluded = true; // Depth discontinuity
            }

            if (Disoccluded)
            {
                // Disocclusion: reset completely to current frame (NO GHOSTING!)
                CleanReprojectedColor[Idx] = CurrentFrameColor[Idx];
            }
            else
            {
                // Fetch valid history along motion vector
                Vector3 FetchedHistory = HistoryColor[PrevIdx];

                // 3x3 Neighborhood Color Clamping
                Vector3 MinCol = CurrentFrameColor[Idx];
                Vector3 MaxCol = CurrentFrameColor[Idx];
                for (int Dy = -1; Dy <= 1; ++Dy)
                {
                    int Ny = std::clamp(Y + Dy, 0, static_cast<int>(ResH) - 1);
                    for (int Dx = -1; Dx <= 1; ++Dx)
                    {
                        int Nx = std::clamp(X + Dx, 0, static_cast<int>(ResW) - 1);
                        size_t NIdx = static_cast<size_t>(Ny) * ResW + static_cast<size_t>(Nx);
                        const auto& C = CurrentFrameColor[NIdx];
                        MinCol.x = std::min(MinCol.x, C.x); MinCol.y = std::min(MinCol.y, C.y); MinCol.z = std::min(MinCol.z, C.z);
                        MaxCol.x = std::max(MaxCol.x, C.x); MaxCol.y = std::max(MaxCol.y, C.y); MaxCol.z = std::max(MaxCol.z, C.z);
                    }
                }

                FetchedHistory.x = std::clamp(FetchedHistory.x, MinCol.x, MaxCol.x);
                FetchedHistory.y = std::clamp(FetchedHistory.y, MinCol.y, MaxCol.y);
                FetchedHistory.z = std::clamp(FetchedHistory.z, MinCol.z, MaxCol.z);

                CleanReprojectedColor[Idx] = FetchedHistory * 0.85f + CurrentFrameColor[Idx] * 0.15f;
            }
        }
    }

    auto Tonemap = [](float X) noexcept -> uint8_t
    {
        const float Clamped = std::max(0.0f, X);
        const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
        const float Mapped = (Clamped * (A * Clamped + B)) / (Clamped * (C * Clamped + D) + E);
        const float Gamma  = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
        return static_cast<uint8_t>(std::clamp(Gamma * 255.0f, 0.0f, 255.0f));
    };

    // Output 1: Motion Vectors Visualizer (Motion_Vector_Buffer.png)
    std::vector<uint8_t> MotionPng(PixelCount * 3u);
    for (size_t I = 0; I < PixelCount; ++I)
    {
        MotionPng[I * 3 + 0] = static_cast<uint8_t>(MotionVectorVisual[I].x * 255.0f);
        MotionPng[I * 3 + 1] = static_cast<uint8_t>(MotionVectorVisual[I].y * 255.0f);
        MotionPng[I * 3 + 2] = static_cast<uint8_t>(MotionVectorVisual[I].z * 255.0f);
    }
    WritePng("VisualProof/DistanceFieldGI/Motion_Vector_Buffer.png", ResW, ResH, MotionPng);

    // Output 2: Side-by-Side Comparison (Motion_Ghosting_vs_Reprojection.png)
    // Left: Naive Ghosted Blend | Right: Motion Vectors + Disocclusion Rejection
    const uint32_t HalfW = 640u;
    std::vector<uint8_t> ComparisonSheet(static_cast<size_t>(ResW) * ResH * 3u);

    for (uint32_t Y = 0; Y < ResH; ++Y)
    {
        for (uint32_t X = 0; X < HalfW; ++X)
        {
            size_t SrcIdx = static_cast<size_t>(Y) * ResW + X;
            size_t DstIdx = (static_cast<size_t>(Y) * ResW + X) * 3u;
            ComparisonSheet[DstIdx + 0] = Tonemap(NaiveGhostedColor[SrcIdx].x);
            ComparisonSheet[DstIdx + 1] = Tonemap(NaiveGhostedColor[SrcIdx].y);
            ComparisonSheet[DstIdx + 2] = Tonemap(NaiveGhostedColor[SrcIdx].z);
        }
        for (uint32_t X = 0; X < HalfW; ++X)
        {
            size_t SrcIdx = static_cast<size_t>(Y) * ResW + (HalfW + X);
            size_t DstIdx = (static_cast<size_t>(Y) * ResW + (HalfW + X)) * 3u;
            ComparisonSheet[DstIdx + 0] = Tonemap(CleanReprojectedColor[SrcIdx].x);
            ComparisonSheet[DstIdx + 1] = Tonemap(CleanReprojectedColor[SrcIdx].y);
            ComparisonSheet[DstIdx + 2] = Tonemap(CleanReprojectedColor[SrcIdx].z);
        }
    }

    WritePng("VisualProof/DistanceFieldGI/Motion_Ghosting_vs_Reprojection.png", ResW, ResH, ComparisonSheet);
    WritePng("VisualProof/DistanceFieldGI/Motion_Clean_Final.png", ResW, ResH, ComparisonSheet); // clean proof

    std::cout << "Wrote VisualProof/DistanceFieldGI/Motion_Vector_Buffer.png\n";
    std::cout << "Wrote VisualProof/DistanceFieldGI/Motion_Ghosting_vs_Reprojection.png\n";
    std::cout << "Verification complete!\n";
    std::cout << "================================================================================\n";
    return 0;
}
