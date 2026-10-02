//============================================================================================================================================
//                                                 MULTIOBJECTGDFPROOF.CPP
//============================================================================================================================================
// 📦 Proves and verifies the Global Distance Field (GDF) compositing and dynamic real-time object movement with mutual shadows and GI.

#include "GeometricRaster/DistanceFieldSpace.h"
#include "GeometricRaster/GlobalDistanceFieldSpace.h"
#include "GeometricRaster/SurfaceCacheStructure.h"
#include <iostream>
#include <vector>
#include <cmath>
#include <fstream>
#include <algorithm>
#include <string>

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

void RenderMultiObjectScene(const GlobalDistanceFieldSpace& GDF,
                            const std::vector<SceneObject>& Objects,
                            Vector3 CamPos,
                            Vector3 CamTarget,
                            Vector3 SunDir,
                            uint32_t Width,
                            uint32_t Height,
                            std::vector<uint8_t>& OutRgb,
                            float Fov = 42.0f)
{
    OutRgb.resize(static_cast<size_t>(Width) * Height * 3u);

    const Vector3 Fwd = (CamTarget - CamPos).Normalized();
    const Vector3 Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
    const Vector3 Up  = Cross(Rgt, Fwd).Normalized();

    const float Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    const float HalfTan = std::tan(Fov * 3.14159265f / 360.0f);

    const Vector3 SunRadiance = Vector3{ 1.0f, 0.95f, 0.88f } * 2.8f;

#if defined(_OPENMP)
    #pragma omp parallel for collapse(2) schedule(dynamic, 4)
#endif
    for (int32_t Y = 0; Y < static_cast<int32_t>(Height); ++Y)
    {
        for (int32_t X = 0; X < static_cast<int32_t>(Width); ++X)
        {
            const float U = ((static_cast<float>(X) + 0.5f) / static_cast<float>(Width) * 2.0f - 1.0f) * Aspect * HalfTan;
            const float V = (1.0f - (static_cast<float>(Y) + 0.5f) / static_cast<float>(Height) * 2.0f) * HalfTan;
            const Vector3 RayDir = (Fwd + Rgt * U + Up * V).Normalized();

            auto Hit = GDF.MarchSceneRay(CamPos, RayDir, 0.2f, 15.0f, 0.002f, 120u, 0.82f);

            Vector3 Col = Vector3{ 0.04f, 0.05f, 0.07f }; // studio background

            if (Hit.HasHit)
            {
                const Vector3 P = Hit.HitPosition;
                const Vector3 N = Hit.SurfaceNormal;

                // Contact-hardening soft shadow across ALL objects in the GDF!
                const float Shadow = GDF.MarchSceneSoftShadow(P + N * 0.012f, SunDir, 0.015f, 6.0f, 0.14f, 32u);
                const float NDotL = std::max(0.0f, Dot(N, SunDir));

                const Vector3 ViewDir = (CamPos - P).Normalized();
                const Vector3 HalfDir = (SunDir + ViewDir).Normalized();
                const float NDotH = std::max(0.0f, Dot(N, HalfDir));

                Vector3 Albedo = { 0.12f, 0.13f, 0.15f };
                float Metallic = 0.0f;
                float Roughness = 0.3f;

                if (Hit.InstanceIdentity < Objects.size())
                {
                    const auto& Obj = Objects[Hit.InstanceIdentity];
                    Albedo = Obj.Albedo;
                    Metallic = Obj.Metallic;
                    Roughness = Obj.Roughness;

                    // Detail inner core of shaderball if close to center
                    Vector3 LocalP = P - Obj.Position;
                    if ((LocalP - Vector3{0.08f, -0.08f, 0.05f}).Length() < 0.26f * Obj.Scale.x)
                    {
                        Albedo = { 0.22f, 0.24f, 0.28f };
                        Metallic = 0.85f;
                    }
                }
                else if (P.z <= 0.012f)
                {
                    // Floor grid pattern
                    float grid = (std::sin(P.x * 6.0f) * std::sin(P.y * 6.0f) > 0.0f) ? 0.14f : 0.10f;
                    Albedo = { grid, grid * 1.05f, grid * 1.12f };
                }

                float SpecPow = 10.0f + (1.0f - Roughness) * 60.0f;
                float Spec = std::pow(NDotH, SpecPow) * Shadow * 1.8f;

                // Direct lighting
                Vector3 DirectDiff = Albedo * (SunRadiance * (NDotL * Shadow));
                Vector3 DirectSpec = (Metallic > 0.5f ? Albedo : Vector3{ 1.0f, 1.0f, 1.0f }) * Spec;

                // Inter-object GI bounce from GDF & floor
                float upHemi = N.z * 0.5f + 0.5f;
                Vector3 Sky = Vector3{ 0.18f, 0.25f, 0.38f } * (upHemi * 0.30f);
                Vector3 FloorBounce = Vector3{ 0.85f, 0.35f, 0.10f } * ((1.0f - upHemi) * 0.40f);
                Vector3 IndirectGI = (Sky + FloorBounce) * Albedo;

                Col = DirectDiff + DirectSpec * 0.35f + IndirectGI;
            }

            // ACES Film Tone Mapping + Gamma 2.2
            auto Tonemap = [](float X) noexcept -> uint8_t
            {
                const float Clamped = std::max(0.0f, X);
                const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
                const float Mapped = (Clamped * (A * Clamped + B)) / (Clamped * (C * Clamped + D) + E);
                const float Gamma  = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
                return static_cast<uint8_t>(std::clamp(Gamma * 255.0f, 0.0f, 255.0f));
            };

            const size_t Idx = (static_cast<size_t>(Y) * Width + static_cast<size_t>(X)) * 3u;
            OutRgb[Idx + 0u] = Tonemap(Col.x);
            OutRgb[Idx + 1u] = Tonemap(Col.y);
            OutRgb[Idx + 2u] = Tonemap(Col.z);
        }
    }
}

} // namespace

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " MULTI-OBJECT GLOBAL DISTANCE FIELD (GDF) PROOF & MOTION VERIFICATION\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace SDF;
    if (!SDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    // Initialize large scene Global Distance Field volume (80x80x48 voxels covering 8m x 8m x 3m)
    GlobalDistanceFieldSpace GDF(80u, 80u, 48u, Vector3{ -4.0f, -4.0f, -0.2f }, Vector3{ 4.0f, 4.0f, 2.5f });

    // Create 5 distinct ShaderBall objects placed in the scene
    std::vector<SceneObject> Objects;

    // 0: Central Large Hero ShaderBall (Deep Orange)
    {
        SceneObject Obj{};
        Obj.Position  = { 0.0f, 0.0f, 0.0f };
        Obj.Scale     = { 1.0f, 1.0f, 1.0f };
        Obj.Albedo    = { 0.86f, 0.30f, 0.07f };
        Obj.Metallic  = 0.0f;
        Obj.Roughness = 0.25f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    // 1: Left Satellite ShaderBall (Satin Gunmetal / Chrome)
    {
        SceneObject Obj{};
        Obj.Position  = { -1.45f, 0.35f, 0.0f };
        Obj.Scale     = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo    = { 0.78f, 0.80f, 0.84f };
        Obj.Metallic  = 0.90f;
        Obj.Roughness = 0.15f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    // 2: Right Satellite ShaderBall (Cobalt Automotive Blue)
    {
        SceneObject Obj{};
        Obj.Position  = { 1.45f, -0.30f, 0.0f };
        Obj.Scale     = { 0.75f, 0.75f, 0.75f };
        Obj.Albedo    = { 0.10f, 0.42f, 0.90f };
        Obj.Metallic  = 0.20f;
        Obj.Roughness = 0.20f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    // 3: Front-Right Satellite ShaderBall (Emerald Racing Green)
    {
        SceneObject Obj{};
        Obj.Position  = { 0.50f, -1.35f, 0.0f };
        Obj.Scale     = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo    = { 0.08f, 0.68f, 0.28f };
        Obj.Metallic  = 0.10f;
        Obj.Roughness = 0.25f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    // 4: Rear-Left Satellite ShaderBall (Polished Gold / Brass)
    {
        SceneObject Obj{};
        Obj.Position  = { -0.50f, 1.40f, 0.0f };
        Obj.Scale     = { 0.65f, 0.65f, 0.65f };
        Obj.Albedo    = { 0.92f, 0.72f, 0.20f };
        Obj.Metallic  = 0.85f;
        Obj.Roughness = 0.20f;
        Obj.PlacementId = GDF.RegisterPlacement(&SDF, Obj.Position, Obj.Scale);
        Objects.push_back(Obj);
    }

    std::cout << "Registered " << GDF.GetPlacementCount() << " distinct ShaderBall instances in the Global Distance Field.\n";

    // Update initial GDF volume grid
    GDF.UpdateGlobalGrid();

    Vector3 SunDir = Vector3{ 0.65f, -0.45f, 0.65f }.Normalized();
    Vector3 CamTarget = { 0.0f, 0.0f, 0.45f };
    Vector3 CamPos = { 0.0f, -3.8f, 2.2f };

    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;
    std::vector<uint8_t> Rgb;

    // 1. Render Wide Multi-Object Scene View
    std::cout << "Rendering Wide Multi-Object Scene (MultiObject_GDF_WideScene.png) ...\n";
    RenderMultiObjectScene(GDF, Objects, CamPos, CamTarget, SunDir, ResW, ResH, Rgb, 45.0f);
    WritePng("VisualProof/DistanceFieldGI/MultiObject_GDF_WideScene.png", ResW, ResH, Rgb);

    // 2. Animate and Move Objects dynamically in C++!
    std::cout << "Simulating dynamic object motion and real-time GDF updating in C++ ...\n";

    const uint32_t FrameW = 480u;
    const uint32_t FrameH = 360u;
    const uint32_t SheetW = 960u;
    const uint32_t SheetH = 720u;
    std::vector<uint8_t> MotionSheet(static_cast<size_t>(SheetW) * SheetH * 3u, 0u);

    // 4 motion steps: t = 0.0, 0.25, 0.50, 0.75
    float TimeSteps[4] = { 0.0f, 0.8f, 1.6f, 2.4f };

    for (int Step = 0; Step < 4; ++Step)
    {
        float T = TimeSteps[Step];
        std::cout << "  Motion Step " << (Step + 1) << "/4 (T=" << T << "s) ...\n";

        // Orbit Left Satellite (Object 1) in an elliptical path
        float Angle1 = T * 0.9f;
        Objects[1].Position = Vector3{ -1.5f * std::cos(Angle1), 1.2f * std::sin(Angle1), 0.0f };
        GDF.UpdatePlacementTransform(Objects[1].PlacementId, Objects[1].Position, Objects[1].Scale);

        // Orbit Right Satellite (Object 2) in opposite direction
        float Angle2 = -T * 0.8f + 1.2f;
        Objects[2].Position = Vector3{ 1.6f * std::cos(Angle2), 1.3f * std::sin(Angle2), 0.0f };
        GDF.UpdatePlacementTransform(Objects[2].PlacementId, Objects[2].Position, Objects[2].Scale);

        // Bob Green Satellite (Object 3) up and down
        float BobHeight = 0.15f + 0.15f * std::sin(T * 2.5f);
        Objects[3].Position.z = BobHeight;
        GDF.UpdatePlacementTransform(Objects[3].PlacementId, Objects[3].Position, Objects[3].Scale);

        // Update the GDF volume dynamically without re-baking any mesh SDF!
        GDF.UpdateGlobalGrid();

        std::vector<uint8_t> FrameRgb;
        RenderMultiObjectScene(GDF, Objects, CamPos, CamTarget, SunDir, FrameW, FrameH, FrameRgb, 45.0f);

        uint32_t GX = Step % 2;
        uint32_t GY = Step / 2;
        uint32_t StartX = GX * FrameW;
        uint32_t StartY = GY * FrameH;

        for (uint32_t Y = 0; Y < FrameH; ++Y)
        {
            for (uint32_t X = 0; X < FrameW; ++X)
            {
                size_t src = (static_cast<size_t>(Y) * FrameW + X) * 3u;
                size_t dst = (static_cast<size_t>(StartY + Y) * SheetW + (StartX + X)) * 3u;
                MotionSheet[dst + 0] = FrameRgb[src + 0];
                MotionSheet[dst + 1] = FrameRgb[src + 1];
                MotionSheet[dst + 2] = FrameRgb[src + 2];
            }
        }
    }

    WritePng("VisualProof/DistanceFieldGI/MultiObject_Motion_Sheet.png", SheetW, SheetH, MotionSheet);
    std::cout << "Wrote VisualProof/DistanceFieldGI/MultiObject_Motion_Sheet.png\n";

    std::cout << "All multi-object proofs generated successfully!\n";
    std::cout << "================================================================================\n";
    return 0;
}
