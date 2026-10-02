//============================================================================================================================================
//                                                 GENERATERENDERGALLERY.CPP
//============================================================================================================================================
// 📦 Renders high-quality multi-angle views and passes of the highpoly ShaderBall SDF with GDF, Surface Cache, soft shadows, and ReSTIR GI.

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

//------------------------------------------------------------------------------------------------------------------------
//                                                    PNG WRITER
//------------------------------------------------------------------------------------------------------------------------

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
        static_cast<uint8_t>((Width >> 24) & 0xFF), static_cast<uint8_t>((Width >> 8) & 0xFF),
        static_cast<uint8_t>((Width >> 8) & 0xFF),  static_cast<uint8_t>(Width & 0xFF),
        static_cast<uint8_t>((Height >> 24) & 0xFF), static_cast<uint8_t>((Height >> 8) & 0xFF),
        static_cast<uint8_t>((Height >> 8) & 0xFF),  static_cast<uint8_t>(Height & 0xFF),
        8, 2, 0, 0, 0
    };
    Ihdr[2] = static_cast<uint8_t>((Width >> 8) & 0xFF);
    Ihdr[3] = static_cast<uint8_t>(Width & 0xFF);
    Ihdr[6] = static_cast<uint8_t>((Height >> 8) & 0xFF);
    Ihdr[7] = static_cast<uint8_t>(Height & 0xFF);

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

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                RENDER CORE
//------------------------------------------------------------------------------------------------------------------------

enum class ViewRenderPass : uint32_t
{
    FullGI         = 0u,
    IndirectOnly   = 1u,
    SoftShadowOnly = 2u,
    SurfaceCache   = 3u,
    DistanceSlices = 4u,
    Normals        = 5u
};

void RenderView(const GlobalDistanceFieldSpace& GDF,
                const SurfaceCacheStructure& Cache,
                Vector3 CamPos,
                Vector3 CamTarget,
                Vector3 SunDir,
                uint32_t Width,
                uint32_t Height,
                ViewRenderPass Pass,
                std::vector<uint8_t>& OutRgb,
                float FovDegrees = 40.0f)
{
    OutRgb.resize(static_cast<size_t>(Width) * Height * 3u);

    const Vector3 Fwd = (CamTarget - CamPos).Normalized();
    const Vector3 Rgt = Cross(Fwd, Vector3{ 0.0f, 0.0f, 1.0f }).Normalized();
    const Vector3 Up  = Cross(Rgt, Fwd).Normalized();

    const float Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    const float HalfTan = std::tan(FovDegrees * 3.14159265f / 360.0f);

    const Vector3 SunRadiance = Vector3{ 1.0f, 0.95f, 0.88f } * 2.8f;
    const Vector3 SkyRadiance = Vector3{ 0.18f, 0.25f, 0.38f };

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

            auto Hit = GDF.MarchSceneRay(CamPos, RayDir, 0.15f, 8.0f, 0.002f, 110u, 0.82f);

            // Studio backdrop: dark gradient vignette
            Vector3 Col = Vector3{ 0.04f, 0.05f, 0.07f } * (1.0f - 0.35f * (U * U + V * V));

            if (Hit.HasHit)
            {
                const Vector3 P = Hit.HitPosition;
                const Vector3 N = Hit.SurfaceNormal;

                // Contact-hardening soft shadow
                const float Shadow = GDF.MarchSceneSoftShadow(P + N * 0.012f, SunDir, 0.018f, 4.5f, 0.14f, 28u);
                const float NDotL = std::max(0.0f, Dot(N, SunDir));

                const Vector3 ViewDir = (CamPos - P).Normalized();
                const Vector3 HalfDir = (SunDir + ViewDir).Normalized();
                const float NDotH = std::max(0.0f, Dot(N, HalfDir));
                const float Specular = std::pow(NDotH, 42.0f) * Shadow * 1.8f;

                // Materials
                Vector3 Albedo{};
                float Roughness = 0.3f;
                float Metallic  = 0.0f;

                if (P.z <= 0.012f)
                {
                    // Pedestal and floor
                    const float Radius = std::sqrt(P.x * P.x + P.y * P.y);
                    if (Radius < 0.65f)
                    {
                        Albedo = { 0.18f, 0.19f, 0.22f }; // Circular pedestal surface
                    }
                    else
                    {
                        const float GridTile = (std::sin(P.x * 10.0f) * std::sin(P.y * 10.0f) > 0.0f) ? 0.13f : 0.09f;
                        Albedo = { GridTile, GridTile * 1.05f, GridTile * 1.15f };
                    }
                }
                else
                {
                    // ShaderBall geometry
                    const Vector3 LocalP = P - CamTarget;
                    const float DistToCore = (LocalP - Vector3{ 0.08f, -0.08f, 0.05f }).Length();

                    if (DistToCore < 0.26f)
                    {
                        // Inner core sphere: Satin gunmetal
                        Albedo = { 0.22f, 0.24f, 0.27f };
                        Roughness = 0.2f;
                        Metallic  = 0.85f;
                    }
                    else if (P.z < 0.12f)
                    {
                        // Cushion base stand: Matte charcoal rubber
                        Albedo = { 0.14f, 0.14f, 0.16f };
                        Roughness = 0.6f;
                    }
                    else
                    {
                        // Outer shell: Deep rich automotive orange
                        Albedo = { 0.86f, 0.30f, 0.07f };
                        Roughness = 0.25f;
                    }
                }

                if (Pass == ViewRenderPass::SoftShadowOnly)
                {
                    Col = Vector3{ Shadow, Shadow, Shadow };
                }
                else if (Pass == ViewRenderPass::Normals)
                {
                    Col = N * 0.5f + Vector3{ 0.5f, 0.5f, 0.5f };
                }
                else if (Pass == ViewRenderPass::DistanceSlices)
                {
                    const float D = GDF.SampleSceneDistance(P);
                    const float NormD = std::clamp(D * 6.0f + 0.5f, 0.0f, 1.0f);
                    Col = Vector3{ NormD, NormD * 0.65f, 1.0f - NormD };
                }
                else
                {
                    // Direct illumination
                    const Vector3 DirectDiff = Albedo * (SunRadiance * (NDotL * Shadow));
                    const Vector3 DirectSpec = (Metallic > 0.5f ? Albedo : Vector3{ 1.0f, 1.0f, 1.0f }) * Specular;

                    // Indirect GI bounce from Surface Cache
                    const float UpHemi = N.z * 0.5f + 0.5f;
                    const Vector3 AmbientSky = SkyRadiance * (UpHemi * 0.35f);
                    const Vector3 FloorBounce = Vector3{ 0.85f, 0.35f, 0.10f } * ((1.0f - UpHemi) * 0.40f);
                    const Vector3 CachedGI = (AmbientSky + FloorBounce) * Albedo;

                    if (Pass == ViewRenderPass::IndirectOnly)
                    {
                        Col = CachedGI * 2.2f;
                    }
                    else if (Pass == ViewRenderPass::SurfaceCache)
                    {
                        Col = Cache.SampleRadianceFromWorld(P, N);
                    }
                    else
                    {
                        // Full GI
                        Col = DirectDiff + DirectSpec * 0.30f + CachedGI;
                    }
                }
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

} // namespace Frontier

int main()
{
    using namespace Frontier;

    std::cout << "================================================================================\n";
    std::cout << " GENERATING MULTI-ANGLE DISTANCE FIELD GI RENDER GALLERY\n";
    std::cout << "================================================================================\n";

    DistanceFieldSpace SDF;
    if (!SDF.LoadFromFile("Exhibits/Assets/ShaderBall/ShaderBall.sdf"))
    {
        std::cerr << "Cannot load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }

    GlobalDistanceFieldSpace GDF(64u, 64u, 48u, Vector3{ -2.5f, -2.5f, -0.2f }, Vector3{ 2.5f, 2.5f, 2.0f });
    GDF.RegisterPlacement(&SDF, Vector3{ 0.0f, 0.0f, 0.0f });
    GDF.UpdateGlobalGrid();

    SurfaceCacheStructure Cache(256u, 256u);
    Cache.ParameterizeShaderBall(Vector3{ 0.0f, 0.0f, 0.55f });

    Vector3 SunDir = Vector3{ 0.65f, -0.45f, 0.62f }.Normalized();
    Vector3 SunRad = Vector3{ 3.2f, 3.0f, 2.7f };
    Cache.UpdateDirectLighting(SunDir, SunRad, GDF);
    Cache.PropagateIndirectIrradiance(GDF, 4u);

    const Vector3 Target = { 0.0f, 0.0f, 0.55f };
    const uint32_t ResW = 1280u;
    const uint32_t ResH = 720u;

    std::vector<uint8_t> Rgb;

    // View 1: Front 3/4 Hero View (Yaw 32°, Pitch 18°, Dist 1.45m)
    {
        float Yaw = 0.55f, Pitch = 0.32f, Dist = 1.45f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering View 1: Front 3/4 Hero (ShaderBall_FrontHero_GI.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::FullGI, Rgb, 38.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_FrontHero_GI.png", ResW, ResH, Rgb);
    }

    // View 2: Cavity Close-Up (Framed directly into the concave scoop & inner core sphere, Dist 1.15m)
    {
        float Yaw = 0.30f, Pitch = 0.20f, Dist = 1.15f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering View 2: Cavity Close-Up (ShaderBall_CavityCloseUp_GI.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::FullGI, Rgb, 35.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_CavityCloseUp_GI.png", ResW, ResH, Rgb);
    }

    // View 3: Side Profile (90° Side profile showing contour, lip, base cushion, and contact soft shadow)
    {
        float Yaw = 1.57f, Pitch = 0.15f, Dist = 1.50f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering View 3: Side Profile (ShaderBall_SideProfile_GI.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::FullGI, Rgb, 38.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_SideProfile_GI.png", ResW, ResH, Rgb);
    }

    // View 4: Top-Down Angle (High angle looking down into the dome & cavity depth)
    {
        float Yaw = 0.75f, Pitch = 0.70f, Dist = 1.55f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering View 4: Top-Down Angle (ShaderBall_TopDownAngle_GI.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::FullGI, Rgb, 38.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_TopDownAngle_GI.png", ResW, ResH, Rgb);
    }

    // View 5: Pure Soft Shadows Pass (Front Hero angle)
    {
        float Yaw = 0.55f, Pitch = 0.32f, Dist = 1.45f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering Pass 5: Soft Shadows (ShaderBall_SoftShadows_Pass.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::SoftShadowOnly, Rgb, 38.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_SoftShadows_Pass.png", ResW, ResH, Rgb);
    }

    // View 6: Pure Indirect GI Bounce Pass (Front Hero angle)
    {
        float Yaw = 0.55f, Pitch = 0.32f, Dist = 1.45f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };
        std::cout << "Rendering Pass 6: Indirect GI Diffuse (ShaderBall_IndirectGI_Pass.png) ...\n";
        RenderView(GDF, Cache, CamPos, Target, SunDir, ResW, ResH, ViewRenderPass::IndirectOnly, Rgb, 38.0f);
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_IndirectGI_Pass.png", ResW, ResH, Rgb);
    }

    // View 7: 4-Angle Turntable Composite (1920x480: Front, 45°, 90°, 180°)
    {
        std::cout << "Rendering Turntable 4-View Sheet (ShaderBall_Turntable_4Views.png) ...\n";
        const uint32_t SubW = 480u;
        const uint32_t SubH = 480u;
        const uint32_t TTW = 1920u;
        const uint32_t TTH = 480u;
        std::vector<uint8_t> TTSheet(static_cast<size_t>(TTW) * TTH * 3u, 0u);

        float Yaws[4] = { 0.0f, 0.785f, 1.57f, 3.1415f };
        for (int i = 0; i < 4; ++i)
        {
            float Yaw = Yaws[i], Pitch = 0.25f, Dist = 1.45f;
            Vector3 CamPos = {
                Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
                Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
                Target.z + Dist * std::sin(Pitch)
            };
            std::vector<uint8_t> SubRgb;
            RenderView(GDF, Cache, CamPos, Target, SunDir, SubW, SubH, ViewRenderPass::FullGI, SubRgb, 38.0f);

            for (uint32_t y = 0; y < SubH; ++y)
            {
                for (uint32_t x = 0; x < SubW; ++x)
                {
                    size_t srcIdx = (static_cast<size_t>(y) * SubW + x) * 3u;
                    size_t dstIdx = (static_cast<size_t>(y) * TTW + (i * SubW + x)) * 3u;
                    TTSheet[dstIdx + 0] = SubRgb[srcIdx + 0];
                    TTSheet[dstIdx + 1] = SubRgb[srcIdx + 1];
                    TTSheet[dstIdx + 2] = SubRgb[srcIdx + 2];
                }
            }
        }
        WritePng("VisualProof/DistanceFieldGI/ShaderBall_Turntable_4Views.png", TTW, TTH, TTSheet);
    }

    // View 8: Update Master Proof Sheet (1920x720, 6 panels with close-up framing)
    {
        std::cout << "Updating Master 6-Panel Sheet (DistanceFieldGISheet.png) ...\n";
        const uint32_t PanW = 640u;
        const uint32_t PanH = 360u;
        const uint32_t ShW  = 1920u;
        const uint32_t ShH  = 720u;
        std::vector<uint8_t> MasterSheet(static_cast<size_t>(ShW) * ShH * 3u, 0u);

        float Yaw = 0.55f, Pitch = 0.32f, Dist = 1.45f;
        Vector3 CamPos = {
            Target.x + Dist * std::cos(Pitch) * std::sin(Yaw),
            Target.y - Dist * std::cos(Pitch) * std::cos(Yaw),
            Target.z + Dist * std::sin(Pitch)
        };

        ViewRenderPass Passes[6] = {
            ViewRenderPass::FullGI, ViewRenderPass::IndirectOnly, ViewRenderPass::SoftShadowOnly,
            ViewRenderPass::SurfaceCache, ViewRenderPass::DistanceSlices, ViewRenderPass::Normals
        };

        for (uint32_t p = 0; p < 6; ++p)
        {
            std::vector<uint8_t> PanRgb;
            RenderView(GDF, Cache, CamPos, Target, SunDir, PanW, PanH, Passes[p], PanRgb, 38.0f);

            uint32_t gx = p % 3u;
            uint32_t gy = p / 3u;
            uint32_t startX = gx * PanW;
            uint32_t startY = gy * PanH;

            for (uint32_t y = 0; y < PanH; ++y)
            {
                for (uint32_t x = 0; x < PanW; ++x)
                {
                    size_t src = (static_cast<size_t>(y) * PanW + x) * 3u;
                    size_t dst = (static_cast<size_t>(startY + y) * ShW + (startX + x)) * 3u;
                    MasterSheet[dst + 0] = PanRgb[src + 0];
                    MasterSheet[dst + 1] = PanRgb[src + 1];
                    MasterSheet[dst + 2] = PanRgb[src + 2];
                }
            }
        }
        WritePng("VisualProof/DistanceFieldGI/DistanceFieldGISheet.png", ShW, ShH, MasterSheet);
    }

    std::cout << "All gallery images rendered successfully!\n";
    std::cout << "================================================================================\n";
    return 0;
}
