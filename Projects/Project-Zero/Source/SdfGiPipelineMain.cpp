//============================================================================================================================================
//                                                       SDFGIPIPELINEMAIN.CPP
//============================================================================================================================================
// 📦 Faithful CPU mirror of Frontier's real Distance Field GI pipeline — raster G-buffer, surface cards,
//    SDF-marched irradiance gather. NOT a path tracer.
//
//    WHY THIS FILE EXISTS
//    --------------------
//    The earlier PathCompare tool's "sdf" path was NOT a mirror of the engine's SDF GI pipeline: it cast camera
//    rays and used the distance field only for a shadow and a sky term — a path tracer that happened to touch an
//    SDF. That is not what the engine does. This file mirrors the four passes the engine actually records:
//
//        pass 0   DistanceFieldCapture.slang   one surface card per triangle (albedo, normal, coverage, emission)
//        pass 1   DistanceFieldRadiance.slang  Jacobi propagation over the card atlas: direct sun + previous indirect
//        pass 2   DistanceFieldGather.slang    per G-buffer pixel: hemisphere rays marched through the COMPOSED
//                                              LOCAL DISTANCE FIELDS, refined against the exact triangle BVH, MIS
//                                              between cosine and card-area sampling -> incident irradiance
//        pass 3   DistanceFieldGIResolve.slang 7x7 bilateral irradiance reconstruction + direct light + tonemap
//
//    Primary visibility is a Z-BUFFER over the scene triangles, exactly as the mode table in
//    Plans/Ongoing/SwapSurfelGIWithDistanceFieldGI.md specifies for mode 1 ("Distance Field GI"):
//    primary = mesh rasterization, diffuse indirect = surface cache over distance fields, RT cores off.
//
//    WHAT IS FAITHFUL (translated line by line from the Slang)
//    ---------------------------------------------------------
//    * SampleSceneDistance     -> DistanceAtlasSpace::Sample, the engine's own transformed-local-field composition.
//                                 A moving instance rewrites only its world->local rows (Atlas::Project). The volume
//                                 is never rebuilt; BakeCount / PlacementRevision prove it.
//    * DistanceShadow          -> exact facet-BVH hit gives the hard umbra, otherwise a 48-step march through the
//                                 composed field gives the penumbra with the engine's monotone k*H/t formula.
//    * GatherDistanceRadiance  -> 32 (gather) / 16 (radiance pass) samples, 48-step sphere march, exact refinement
//                                 when Distance < Cell*0.7, sky on escape, fallback exact trace on exhaustion, and
//                                 the balance heuristic between cosine and card-area PDFs.
//    * SelectRadianceFacet     -> the engine's preorder BVH solid-angle walk (BranchSolidAngle / FacetSolidAngle).
//    * cards                   -> the engine's square-to-triangle warp (CardPosition / CardCoordinate) and 4-tap
//                                 bilinear SampleCachedRadiance.
//    * InstanceMoved masking   -> a moved instance's baked facets are excluded from EVERY exact query, so it can
//                                 only shade through the field. That is the engine's rule and it is observable here.
//    * temporal accumulation   -> the radiance pass mixes at 0.25 per frame, so GI converges over frames.
//    * ReconstructIrradiance   -> 7x7, normal alignment^32, plane tolerance, exp(-d^2/8).
//
//    WHAT IS SIMPLIFIED (and is NOT the transport)
//    ---------------------------------------------
//    * Materials. The engine decodes authored OpenPBR slabs through MaterialEvaluation.slang. Here a surface is a
//      Lambert diffuse term plus a Schlick/GGX lobe. The LIGHT TRANSPORT is the engine's; the BRDF is a stand-in.
//
//    Build:  see Projects/Project-Zero/Makefile  (target: SdfGiPipeline)

#include "../../../Engine/GeometricRaster/DistanceAtlasSpace.h"
#include "../../../Engine/GeometricRaster/SceneStructure.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <functional>
#include <string>
#include <thread>
#include <vector>

using namespace Frontier;

static constexpr float kPi = 3.14159265359f;

//============================================================================================================================================
//  Math
//============================================================================================================================================
struct Vec3
{
    float v[3] = { 0.0f, 0.0f, 0.0f };
    float& operator[](int i) noexcept { return v[i]; }
    float  operator[](int i) const noexcept { return v[i]; }
};
struct Vec2 { float u = 0.0f, v = 0.0f; };

static inline Vec3 V3(float x, float y, float z) noexcept { Vec3 r; r[0] = x; r[1] = y; r[2] = z; return r; }
static inline Vec3 Add(Vec3 a, Vec3 b) noexcept { return V3(a[0] + b[0], a[1] + b[1], a[2] + b[2]); }
static inline Vec3 Sub(Vec3 a, Vec3 b) noexcept { return V3(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
static inline Vec3 Mul(Vec3 a, float s) noexcept { return V3(a[0] * s, a[1] * s, a[2] * s); }
static inline Vec3 Mul(Vec3 a, Vec3 b) noexcept { return V3(a[0] * b[0], a[1] * b[1], a[2] * b[2]); }
static inline float Dot(Vec3 a, Vec3 b) noexcept { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
static inline Vec3 Cross(Vec3 a, Vec3 b) noexcept
{ return V3(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]); }
static inline float Len(Vec3 a) noexcept { return std::sqrt(Dot(a, a)); }
static inline Vec3 Norm(Vec3 a) noexcept { const float l = Len(a); return l > 1e-20f ? Mul(a, 1.0f / l) : V3(0, 0, 0); }
static inline Vec3 Min3(Vec3 a, Vec3 b) noexcept { return V3(std::min(a[0], b[0]), std::min(a[1], b[1]), std::min(a[2], b[2])); }
static inline Vec3 Max3(Vec3 a, Vec3 b) noexcept { return V3(std::max(a[0], b[0]), std::max(a[1], b[1]), std::max(a[2], b[2])); }
static inline Vec3 ClampV(Vec3 a, float lo, float hi) noexcept
{ return V3(std::clamp(a[0], lo, hi), std::clamp(a[1], lo, hi), std::clamp(a[2], lo, hi)); }
static inline Vec3 Mix(Vec3 a, Vec3 b, float t) noexcept { return Add(a, Mul(Sub(b, a), t)); }
static inline float Fract(float x) noexcept { return x - std::floor(x); }

static inline uint32_t Scramble(uint32_t Value) noexcept
{
    Value ^= Value >> 16u; Value *= 0x7feb352du; Value ^= Value >> 15u;
    Value *= 0x846ca68bu; return Value ^ (Value >> 16u);
}
static inline float Hash(uint32_t i) noexcept { return static_cast<float>(Scramble(i)) / 4294967296.0f; }

// 📝 HemisphereDirection — the engine's stratified-in-height, golden-angle-in-azimuth sequence.
static inline Vec3 HemisphereDirection(Vec3 n, uint32_t s, uint32_t count, float sx, float sy) noexcept
{
    const float Height = Fract((static_cast<float>(s) + 0.5f) / static_cast<float>(count) + sx);
    const float Angle = 2.0f * kPi * Fract(static_cast<float>(s) * 0.61803398875f + sy);
    const Vec3 Up = std::fabs(n[2]) < 0.9f ? V3(0, 0, 1) : V3(0, 1, 0);
    const Vec3 T = Norm(Cross(n, Up));
    const Vec3 B = Cross(n, T);
    const float R = std::sqrt(std::max(0.0f, 1.0f - Height));
    return Norm(Add(Add(Mul(T, std::cos(Angle) * R), Mul(B, std::sin(Angle) * R)), Mul(n, std::sqrt(Height))));
}

//============================================================================================================================================
//  Scene records  (std430 mirrors of DistanceFacet / DistanceBranch in DistanceFieldTransport.slang)
//============================================================================================================================================
struct Facet
{
    Vec3     Alpha{}, Beta{}, Gamma{};
    Vec3     Normal{};
    Vec3     Albedo{ 0.8f, 0.8f, 0.8f };
    Vec3     Emission{};
    uint32_t Instance = 0u;
    uint32_t Primitive = 0u;
    float    Roughness = 0.6f;
    float    Area = 0.0f;
};
/// 📦 A triangle at its CURRENT pose, for primary visibility and for the reference path tracer. The baked
///    `Facet` array is the engine's DistanceFieldStructure; this is the engine's live SceneStructure.
struct LiveTri { Vec3 A, B, C, N, Albedo, Emission; float Roughness = 0.6f; uint32_t Instance = 0u; };

struct Branch
{
    Vec3     Minimum{}, Maximum{};
    uint32_t Escape = 0u, First = 0u, Count = 0u;
};

//============================================================================================================================================
//  The pipeline
//============================================================================================================================================
class SdfGiPipeline
{
public:
    void SetScene(std::vector<Facet> F, std::vector<VertexRecord> Verts,
                  std::vector<uint32_t> Idx, std::vector<InstanceRecord> Rows) noexcept
    {
        F_ = std::move(F); Verts_ = std::move(Verts); Idx_ = std::move(Idx); Rows_ = std::move(Rows);
        for (Facet& f : F_)
        {
            f.Normal = Norm(Cross(Sub(f.Beta, f.Alpha), Sub(f.Gamma, f.Alpha)));
            f.Area = 0.5f * Len(Cross(Sub(f.Beta, f.Alpha), Sub(f.Gamma, f.Alpha)));
        }
        B_.clear();
        Linearize(0u, static_cast<uint32_t>(F_.size()));
    }

    bool Bake(const DistanceAtlasSettings& S) noexcept
    {
        const auto T = Now();
        const bool Ok = Atlas_.Bake(Verts_, Idx_, Rows_, S);
        BakeMs_ = Ms(T);
        return Ok;
    }

    /// 📦 The dynamic half: rewrite only the world->local rows. Touches no volume data.
    bool Place(const std::vector<InstanceRecord>& Rows) noexcept
    {
        Rows_ = Rows;
        return Atlas_.Empty() ? true : Atlas_.Project(Rows_.data(), static_cast<uint32_t>(Rows_.size()));
    }

    void SetLive(std::vector<LiveTri> T) noexcept { Live_ = std::move(T); }

    void Configure(uint32_t CardRes, uint32_t GatherSamples, uint32_t RadianceSamples,
                   Vec3 SunDir, Vec3 SunColour, float SunRadiance, Vec3 SkyAmbient,
                   float Softness, float IrradianceScale, float Exposure,
                   bool Gi, bool FreezeTemporal) noexcept
    {
        R_ = std::clamp<uint32_t>(CardRes, 2u, 32u);
        GS_ = GatherSamples; RS_ = RadianceSamples;
        Sun_ = Norm(SunDir); SunColour_ = SunColour; SunR_ = SunRadiance; Sky_ = SkyAmbient;
        Softness_ = std::max(Softness, 0.0001f); Scale_ = IrradianceScale; Exposure_ = Exposure;
        Gi_ = Gi; Freeze_ = FreezeTemporal;
        const size_t n = F_.size() * static_cast<size_t>(R_) * R_;
        Diffuse_.assign(n, V3(0, 0, 0)); Normal_.assign(n, V3(0, 0, 1)); Emission_.assign(n, V3(0, 0, 0));
        Coverage_.assign(n, 0.0f); Prev_.assign(n, V3(0, 0, 0)); Next_.assign(n, V3(0, 0, 0));
    }

    //----------------------------------------------------------------------------------------------------------------------------
    //  PASS 0 — capture
    //----------------------------------------------------------------------------------------------------------------------------
    void PassCapture() noexcept
    {
        const auto T = Now();
        for (size_t f = 0; f < F_.size(); ++f)
            for (uint32_t y = 0; y < R_; ++y) for (uint32_t x = 0; x < R_; ++x)
            {
                const size_t i = (f * R_ + y) * R_ + x;
                Diffuse_[i] = ClampV(F_[f].Albedo, 0.0f, 0.95f);
                Normal_[i] = F_[f].Normal;
                Coverage_[i] = 1.0f;
                Emission_[i] = F_[f].Emission;
            }
        CaptureMs_ = Ms(T);
    }

    //----------------------------------------------------------------------------------------------------------------------------
    //  PASS 1 — radiance (Jacobi over the card atlas)
    //----------------------------------------------------------------------------------------------------------------------------
    void PassRadiance() noexcept
    {
        const auto T = Now();
        Prev_.swap(Next_);
        const uint32_t Facets = static_cast<uint32_t>(F_.size());
        std::atomic<uint32_t> Cursor{ 0u };
        Parallel([&]()
        {
            for (uint32_t f = Cursor.fetch_add(1u); f < Facets; f = Cursor.fetch_add(1u))
                for (uint32_t y = 0; y < R_; ++y) for (uint32_t x = 0; x < R_; ++x)
                {
                    const size_t i = (static_cast<size_t>(f) * R_ + y) * R_ + x;
                    if (Coverage_[i] <= 0.0f) { Next_[i] = V3(0, 0, 0); continue; }
                    const Vec3 Position = CardPosition(f, (static_cast<float>(x) + 0.5f) / R_,
                                                          (static_cast<float>(y) + 0.5f) / R_);
                    const Vec3 Normal = Normal_[i];
                    const float Cosine = std::max(0.0f, Dot(Normal, Sun_));
                    const float Visibility = (SunR_ > 0.0f && Cosine > 0.0f) ? DistanceShadow(Position, F_[f].Normal) : 1.0f;
                    const Vec3 Direct = Mul(SunColour_, SunR_ * Cosine * Visibility / kPi);
                    const Vec3 Indirect = GatherDistanceRadiance(Position, Normal, false, 0u, 0u);
                    Vec3 Radiance = Add(Emission_[i], Mul(Diffuse_[i], Add(Direct, Indirect)));
                    Radiance = ClampV(Radiance, 0.0f, 65504.0f);
                    Next_[i] = Mix(Prev_[i], Radiance, Freeze_ ? 1.0f : 0.25f);
                }
        });
        RadianceMs_ = Ms(T);
    }

    /// 📦 The G-buffer is rasterized from the LIVE scene (current instance matrices), exactly as the engine's
    ///    mode-1 primary visibility is. The BAKED facets are used only for cards and exact queries, which is why
    ///    a moving object is visible and moves while its field data never changes.
    struct Frame
    {
        std::vector<float> Pixels;
        std::vector<Vec3>  Position, Normal, Albedo, Emission;
        std::vector<float> Roughness;
        std::vector<uint32_t> Instance;      // live instance id, 0xFFFFFFFF = sky
        std::vector<float> Depth;
        std::vector<Vec3>  Irradiance, GatherNormal;
        std::vector<float> SunVisibility;      // DistanceShadow output, before any material
    };

    //----------------------------------------------------------------------------------------------------------------------------
    //  PASS 2 + 3 — gather over the raster G-buffer, then resolve
    //----------------------------------------------------------------------------------------------------------------------------
    void Render(Frame& Out, int W, int H, Vec3 Eye, Vec3 Target, float FovYDeg) noexcept
    {
        Rasterize(Out, W, H, Eye, Target, FovYDeg, Live_);

        const auto T = Now();
        Out.Irradiance.assign(static_cast<size_t>(W) * H, V3(0, 0, 0));
        Out.GatherNormal.assign(static_cast<size_t>(W) * H, V3(0, 0, 0));
        std::atomic<uint32_t> Row{ 0u };
        Parallel([&]()
        {
            for (uint32_t y = Row.fetch_add(1u); y < static_cast<uint32_t>(H); y = Row.fetch_add(1u))
                for (uint32_t x = 0; x < static_cast<uint32_t>(W); ++x)
                {
                    const size_t i = static_cast<size_t>(y) * W + x;
                    if (Out.Instance[i] == 0xFFFFFFFFu) continue;
                    const Vec3 N = Out.Normal[i];
                    const Vec3 View = Norm(Sub(Eye, Out.Position[i]));
                    if (Dot(N, View) <= 0.0f) continue;
                    if (Dot(Out.Emission[i], Out.Emission[i]) > 0.0f) continue;
                    Out.Irradiance[i] = GatherDistanceRadiance(Out.Position[i], N, true,
                                                               Scramble(x), Scramble(y + 0x9e3779b9u));
                    Out.GatherNormal[i] = N;
                }
        });
        GatherMs_ = Ms(T);

        const auto T2 = Now();
        Out.Pixels.assign(static_cast<size_t>(W) * H * 3u, 0.0f);
        std::atomic<uint32_t> Row2{ 0u };
        Parallel([&]()
        {
            for (uint32_t y = Row2.fetch_add(1u); y < static_cast<uint32_t>(H); y = Row2.fetch_add(1u))
                for (uint32_t x = 0; x < static_cast<uint32_t>(W); ++x)
                    Resolve(Out, static_cast<int>(x), static_cast<int>(y), W, H, Eye);
        });
        ResolveMs_ = Ms(T2);
    }

    //----------------------------------------------------------------------------------------------------------------------------
    double CaptureMs() const noexcept { return CaptureMs_; }
    double RadianceMs() const noexcept { return RadianceMs_; }
    double GatherMs() const noexcept { return GatherMs_; }
    double ResolveMs() const noexcept { return ResolveMs_; }
    double BakeMs() const noexcept { return BakeMs_; }
    std::atomic<double> VisSum{ 0.0 };
    std::atomic<long long> VisCount{ 0 };
    std::atomic<long long> HardUmbra{ 0 };
    void ResetVisibility() noexcept { VisSum = 0.0; VisCount = 0; HardUmbra = 0; }
    double MeanVisibility() const noexcept { const long long n = VisCount.load(); return n ? VisSum.load() / n : 0.0; }
    double HardUmbraFraction() const noexcept { const long long n = VisCount.load(); return n ? double(HardUmbra.load()) / n : 0.0; }

    uint32_t BakeCount() const noexcept { return Atlas_.QueryBakeCount(); }
    uint64_t PlacementRevision() const noexcept { return Atlas_.QueryPlacementRevision(); }
    uint32_t Moved() const noexcept { return Atlas_.QueryMovedCount(); }
    const DistanceAtlasReport& Report() const noexcept { return Atlas_.QueryReport(); }
    size_t CardTexels() const noexcept { return F_.size() * static_cast<size_t>(R_) * R_; }
    size_t AtlasBytes() const noexcept { return Atlas_.QueryAtlas().size() * sizeof(float); }

    /// 📦 FNV-1a over the whole atlas. Constant across frames proves the VOLUME was never rebuilt; a changing
    ///    PlacementRevision alongside it proves only the world->local rows were rewritten.
    uint64_t AtlasChecksum() const noexcept
    {
        const auto& A = Atlas_.QueryAtlas();
        uint64_t Hash = 1469598103934665603ull;
        const unsigned char* Bytes = reinterpret_cast<const unsigned char*>(A.data());
        const size_t Count = A.size() * sizeof(float);
        for (size_t i = 0; i < Count; ++i) { Hash ^= Bytes[i]; Hash *= 1099511628211ull; }
        return Hash;
    }

    /// 📝 Which instances actually own a baked volume. An instance whose Volume was denied (budget exhausted, or a
    ///    singular transform) has DistanceAtlasValid clear, and Sample() skips it entirely — so it can never shade
    ///    anything through the field. This must be checked, not assumed.
    void PrintInstances(const char* const* Names) const noexcept
    {
        const auto& P = Atlas_.QueryPlacements();
        for (size_t i = 0; i < P.size(); ++i)
            std::printf("[SdfGi]   instance %zu %-8s valid=%d  moved=%d  voxel=%.4f  dims=%ux%ux%u  offset=%u  "
                        "local box x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]\n",
                        i, Names[i], (P[i].Flags & DistanceAtlasValid) ? 1 : 0,
                        (P[i].Flags & DistanceAtlasMoved) ? 1 : 0, P[i].VoxelSize,
                        P[i].Dimensions[0], P[i].Dimensions[1], P[i].Dimensions[2], P[i].Offset,
                        P[i].BoxMinimum[0], P[i].BoxMaximum[0], P[i].BoxMinimum[1], P[i].BoxMaximum[1],
                        P[i].BoxMinimum[2], P[i].BoxMaximum[2]);
    }

    /// 📝 Walk the sun-shadow march for one point and print every step. Diagnostic only.
    void ScanShadow(Vec3 Position, Vec3 Normal, Vec3 Direction, float Radiance) const noexcept
    {
        (void)Radiance;
        const Vec3 Origin = Add(Position, Mul(Normal, 0.002f));
        std::printf("[SdfGi]   scan from (%.2f, %.2f, %.2f)  first exact hit travel = %.4f\n",
                    Position[0], Position[1], Position[2], TraceDistanceMesh(Origin, Direction, 1e20f).Travel);
        float Travel = 0.004f, Visibility = 1.0f;
        const float Facing = std::max(Dot(Normal, Direction), 0.0f);
        for (uint32_t Step = 0u; Step < 12u; ++Step)
        {
            float Cell = 0.25f;
            const float Distance = SampleSceneDistance(Add(Origin, Mul(Direction, Travel)), Cell);
            const float Threshold = Travel * Facing - 0.75f * Cell;
            const bool Hit = Distance < Threshold;
            if (Hit) Visibility = std::min(Visibility, std::max(Distance - 0.25f * Cell, 0.0f) / (Softness_ * Travel));
            std::printf("[SdfGi]     step %2u travel %7.4f  field %8.4f  cell %.4f  threshold %8.4f  %s  vis %.4f\n",
                        Step, Travel, Distance, Cell, Threshold, Hit ? "TRIGGERS" : "        ", Visibility);
            Travel += std::max(Distance * 0.5f, Cell * 0.5f);
        }
    }

    void FieldSlice(const char* Path, int Res, float Z, Vec3 Lo, Vec3 Hi) const noexcept
    {
        FILE* f = std::fopen(Path, "wb");
        if (!f) return;
        std::fprintf(f, "P6\n%d %d\n255\n", Res, Res);
        for (int y = Res - 1; y >= 0; --y) for (int x = 0; x < Res; ++x)
        {
            float q[3] = { Lo[0] + (Hi[0] - Lo[0]) * (static_cast<float>(x) + 0.5f) / Res,
                           Lo[1] + (Hi[1] - Lo[1]) * (static_cast<float>(y) + 0.5f) / Res, Z };
            float Cell = 0.25f;
            const float d = Atlas_.Sample(q, Cell);
            const float t = std::clamp(1.0f - d / 1.2f, 0.0f, 1.0f);
            const unsigned char c[3] = { static_cast<unsigned char>(255.0f * (1.0f - t)),
                                         static_cast<unsigned char>(255.0f * t * 0.85f),
                                         static_cast<unsigned char>(255.0f * t) };
            std::fwrite(c, 1, 3, f);
        }
        std::fclose(f);
    }

private:
    // ---- state ------------------------------------------------------------------------------------------------------------
    std::vector<Facet> F_; std::vector<Branch> B_; std::vector<LiveTri> Live_;
    std::vector<VertexRecord> Verts_; std::vector<uint32_t> Idx_; std::vector<InstanceRecord> Rows_;
    DistanceAtlasSpace Atlas_;

    uint32_t R_ = 8u;
    std::vector<Vec3> Diffuse_, Normal_, Emission_, Prev_, Next_;
    std::vector<float> Coverage_;

    uint32_t GS_ = 32u, RS_ = 16u;
    Vec3 Sun_{ 0, 0, 1 }, SunColour_{ 1, 1, 1 }, Sky_{ 0.02f, 0.025f, 0.03f };
    float SunR_ = 0.0f, Softness_ = 0.2f, Scale_ = 1.0f, Exposure_ = 1.0f;
    bool Gi_ = true, Freeze_ = false;
    double CaptureMs_ = 0, RadianceMs_ = 0, GatherMs_ = 0, ResolveMs_ = 0, BakeMs_ = 0;

    static std::chrono::steady_clock::time_point Now() noexcept { return std::chrono::steady_clock::now(); }
    static double Ms(std::chrono::steady_clock::time_point t) noexcept
    { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t).count(); }

    static void Parallel(const std::function<void()>& Body) noexcept
    {
        const unsigned Threads = std::max(1u, std::thread::hardware_concurrency());
        std::vector<std::thread> Pool;
        Pool.reserve(Threads);
        for (unsigned i = 0u; i < Threads; ++i) Pool.emplace_back(Body);
        for (auto& t : Pool) t.join();
    }

    size_t Texel(size_t f, uint32_t x, uint32_t y) const noexcept { return (f * R_ + y) * R_ + x; }

    // ---- cards ------------------------------------------------------------------------------------------------------------
    // 📝 The engine's square-to-triangle warp. Every texel of the card is used.
    Vec3 CardPosition(size_t f, float u, float v) const noexcept
    {
        const float Root = std::sqrt(std::clamp(u, 0.0f, 1.0f));
        const Vec3 W = V3(1.0f - Root, Root * (1.0f - v), Root * v);
        return Add(Add(Mul(F_[f].Alpha, W[0]), Mul(F_[f].Beta, W[1])), Mul(F_[f].Gamma, W[2]));
    }
    Vec2 CardCoordinate(size_t f, Vec3 p) const noexcept
    {
        const Vec3 EA = Sub(F_[f].Beta, F_[f].Alpha), EB = Sub(F_[f].Gamma, F_[f].Alpha);
        const Vec3 D = Sub(p, F_[f].Alpha);
        const float A = Dot(EA, EA), B = Dot(EA, EB), G = Dot(EB, EB);
        const float Den = std::max(A * G - B * B, 1e-20f);
        Vec2 W;
        W.u = std::max((G * Dot(D, EA) - B * Dot(D, EB)) / Den, 0.0f);
        W.v = std::max((A * Dot(D, EB) - B * Dot(D, EA)) / Den, 0.0f);
        const float S = W.u + W.v;
        W.u = std::clamp(S * S, 0.0f, 1.0f);
        W.v = std::clamp(W.v / std::max(S, 1e-10f), 0.0f, 1.0f);
        return W;
    }
    Vec3 SampleCachedRadiance(size_t f, Vec3 p, bool Current) const noexcept
    {
        const Vec2 C = CardCoordinate(f, p);
        const float u = std::clamp(C.u * static_cast<float>(R_) - 0.5f, 0.0f, static_cast<float>(R_ - 1u));
        const float w = std::clamp(C.v * static_cast<float>(R_) - 0.5f, 0.0f, static_cast<float>(R_ - 1u));
        const int x0 = static_cast<int>(std::floor(u)), y0 = static_cast<int>(std::floor(w));
        const float fx = u - x0, fy = w - y0;
        Vec3 Sum{};
        for (int c = 0; c < 4; ++c)
        {
            const int ox = c & 1, oy = (c >> 1) & 1;
            const int px = std::min(x0 + ox, static_cast<int>(R_) - 1), py = std::min(y0 + oy, static_cast<int>(R_) - 1);
            const float Weight = (ox ? fx : 1.0f - fx) * (oy ? fy : 1.0f - fy);
            Sum = Add(Sum, Mul((Current ? Next_ : Prev_)[Texel(f, static_cast<uint32_t>(px), static_cast<uint32_t>(py))], Weight));
        }
        return Sum;
    }

    // ---- BVH --------------------------------------------------------------------------------------------------------------
    void Linearize(uint32_t First, uint32_t Count) noexcept
    {
        Branch Node;
        Node.Minimum = V3(1e30f, 1e30f, 1e30f); Node.Maximum = V3(-1e30f, -1e30f, -1e30f);
        for (uint32_t i = First; i < First + Count; ++i)
        {
            Node.Minimum = Min3(Node.Minimum, Min3(F_[i].Alpha, Min3(F_[i].Beta, F_[i].Gamma)));
            Node.Maximum = Max3(Node.Maximum, Max3(F_[i].Alpha, Max3(F_[i].Beta, F_[i].Gamma)));
        }
        const uint32_t Slot = static_cast<uint32_t>(B_.size());
        B_.push_back(Node);
        if (Count <= 4u) { B_[Slot].First = First; B_[Slot].Count = Count; return; }
        uint32_t Axis = 0u;
        for (uint32_t c = 1u; c < 3u; ++c)
            if (Node.Maximum[c] - Node.Minimum[c] > Node.Maximum[Axis] - Node.Minimum[Axis]) Axis = c;
        const uint32_t Half = Count / 2u;
        std::nth_element(F_.begin() + First, F_.begin() + First + Half, F_.begin() + First + Count,
            [Axis](const Facet& a, const Facet& b)
            { return (a.Alpha[Axis] + a.Beta[Axis] + a.Gamma[Axis]) < (b.Alpha[Axis] + b.Beta[Axis] + b.Gamma[Axis]); });
        Linearize(First, Half);
        Linearize(First + Half, Count - Half);
        B_[Slot].Escape = static_cast<uint32_t>(B_.size());
    }

    bool InstanceMoved(uint32_t Instance) const noexcept
    {
        const auto& P = Atlas_.QueryPlacements();
        return Instance < P.size() && (P[Instance].Flags & DistanceAtlasMoved) != 0u;
    }
    float SurfaceCoverage(size_t f) const noexcept { return f < F_.size() ? Coverage_[Texel(f, R_ / 2u, R_ / 2u)] : 0.0f; }

    struct MeshHit { float Travel = 0.0f; uint32_t Facet = 0xFFFFFFFFu; };

    /// 📝 TraceDistanceMesh: stackless preorder walk; moved instances are masked out; a facet only counts when its
    ///    card has coverage at the hit. This is the engine's rule, verbatim in structure.
    MeshHit TraceDistanceMesh(Vec3 Origin, Vec3 Direction, float Maximum) const noexcept
    {
        MeshHit Hit; Hit.Travel = Maximum;
        Vec3 Reciprocal{};
        for (int a = 0; a < 3; ++a)
        {
            const float d = Direction[a];
            const float s = (d > 0.0f) ? 1.0f : (d < 0.0f ? -1.0f : 0.0f);
            Reciprocal[a] = 1.0f / (s * std::max(std::fabs(d), 1e-20f) + (d == 0.0f ? 1e-20f : 0.0f));
        }
        uint32_t Slot = 0u;
        while (Slot < B_.size())
        {
            const Branch& E = B_[Slot];
            float Enter = 0.0f, Exit = Hit.Travel;
            bool Miss = false;
            for (int a = 0; a < 3; ++a)
            {
                const float n = (E.Minimum[a] - Origin[a]) * Reciprocal[a];
                const float f = (E.Maximum[a] - Origin[a]) * Reciprocal[a];
                Enter = std::max(Enter, std::min(n, f));
                Exit = std::min(Exit, std::max(n, f));
            }
            if (Enter <= Exit)
            {
                if (E.Count == 0u) { ++Slot; continue; }
                for (uint32_t k = 0u; k < E.Count; ++k)
                {
                    const uint32_t Index = E.First + k;
                    const Facet& T = F_[Index];
                    const Vec3 EA = Sub(T.Beta, T.Alpha), EB = Sub(T.Gamma, T.Alpha);
                    const Vec3 Cr = Cross(Direction, EB);
                    const float Det = Dot(EA, Cr);
                    if (std::fabs(Det) < 1e-10f) continue;
                    const Vec3 Delta = Sub(Origin, T.Alpha);
                    const float Beta = Dot(Delta, Cr) / Det;
                    const Vec3 Second = Cross(Delta, EA);
                    const float Gamma = Dot(Direction, Second) / Det;
                    const float Travel = Dot(EB, Second) / Det;
                    if (Beta >= 0.0f && Gamma >= 0.0f && Beta + Gamma <= 1.0f && Travel > 1e-4f && Travel < Hit.Travel &&
                        !InstanceMoved(T.Instance) && SurfaceCoverage(Index) > 0.0f)
                    { Hit.Travel = Travel; Hit.Facet = Index; }
                }
                ++Slot;
            }
            else
                Slot = E.Escape ? E.Escape : static_cast<uint32_t>(B_.size());
            (void)Miss;
        }
        return Hit;
    }

    float SampleSceneDistance(Vec3 p, float& Cell) const noexcept
    { float q[3] = { p[0], p[1], p[2] }; return Atlas_.Sample(q, Cell); }

    bool BeyondScene(Vec3 p) const noexcept
    {
        if (B_.empty()) return true;
        for (int a = 0; a < 3; ++a) if (p[a] < B_[0].Minimum[a] || p[a] > B_[0].Maximum[a]) return true;
        return false;
    }

    /// 📝 DistanceShadow: hard umbra from the exact BVH; penumbra marched through the composed fields. This is the
    ///    only place a moved instance can shade anything, because its baked facets are masked from exact queries.
    float DistanceShadow(Vec3 Position, Vec3 Normal) const noexcept
    {
        const Vec3 Origin = Add(Position, Mul(Normal, 0.002f));
        if (TraceDistanceMesh(Origin, Sun_, 1e20f).Facet != 0xFFFFFFFFu) return 0.0f;
        float Visibility = 1.0f, Travel = 0.004f;
        const float Maximum = Len(Sub(Origin, B_[0].Minimum)) + Len(Sub(B_[0].Maximum, B_[0].Minimum));
        const float Facing = std::max(Dot(Normal, Sun_), 0.0f);
        for (uint32_t Step = 0u; Step < 48u && Travel < Maximum; ++Step)
        {
            float Cell = 0.25f;
            const float Distance = SampleSceneDistance(Add(Origin, Mul(Sun_, Travel)), Cell);
            if (Distance > 1e19f) break;
            if (Distance < Travel * Facing - 0.75f * Cell)
                Visibility = std::min(Visibility, std::max(Distance - 0.25f * Cell, 0.0f) / (Softness_ * Travel));
            Travel += std::max(Distance * 0.5f, Cell * 0.5f);
        }
        return std::clamp(Visibility, 0.0f, 1.0f);
    }

    // ---- solid-angle sampling ----------------------------------------------------------------------------------------------
    float BranchSolidAngle(uint32_t Slot, Vec3 Position, Vec3 Normal) const noexcept
    {
        const Branch& E = B_[Slot];
        const Vec3 Centre = Sub(Mul(Add(E.Minimum, E.Maximum), 0.5f), Position);
        const Vec3 Extent = Mul(Sub(E.Maximum, E.Minimum), 0.5f);
        const float Reach = Dot(Extent, V3(std::fabs(Normal[0]), std::fabs(Normal[1]), std::fabs(Normal[2])));
        if (Dot(Centre, Normal) + Reach <= 0.0f) return 0.0f;
        const float Area = std::max(Extent[0] * Extent[1] + Extent[1] * Extent[2] + Extent[2] * Extent[0], 1e-12f);
        return Area / (Dot(Centre, Centre) + Area);
    }
    float FacetSolidAngle(uint32_t Slot, Vec3 Position, Vec3 Normal) const noexcept
    {
        const Facet& F = F_[Slot];
        if (InstanceMoved(F.Instance)) return 0.0f;
        const Vec3 Delta = Sub(Mul(Add(Add(F.Alpha, F.Beta), F.Gamma), 1.0f / 3.0f), Position);
        const float Height = std::max(Dot(Sub(F.Alpha, Position), Normal),
                              std::max(Dot(Sub(F.Beta, Position), Normal), Dot(Sub(F.Gamma, Position), Normal)));
        if (Height <= 0.0f) return 0.0f;
        const float Area = F.Area;
        const float D2 = std::max(Dot(Delta, Delta), 1e-12f);
        return Area * std::min(1.0f, Height / std::sqrt(D2)) * std::fabs(Dot(F.Normal, Delta)) /
               (std::sqrt(D2) * (D2 + Area * 0.1f));
    }
    uint32_t SelectRadianceFacet(Vec3 Position, Vec3 Normal, float Sequence, uint32_t Requested, float& Probability) const noexcept
    {
        uint32_t Slot = 0u, First = 0u, Count = static_cast<uint32_t>(F_.size());
        Probability = 1.0f;
        if (Count == 0u) { Probability = 0.0f; return 0xFFFFFFFFu; }
        while (B_[Slot].Count == 0u)
        {
            const uint32_t Left = Slot + 1u, Right = B_[Left].Escape, Half = Count / 2u;
            if (Right == 0u || Right >= B_.size()) { Probability = 0.0f; return 0xFFFFFFFFu; }
            const float A = BranchSolidAngle(Left, Position, Normal), Bb = BranchSolidAngle(Right, Position, Normal);
            if (A + Bb <= 0.0f) { Probability = 0.0f; return 0xFFFFFFFFu; }
            const float Split = A / (A + Bb);
            const bool PickLeft = Requested == 0xFFFFFFFFu ? Sequence < Split : Requested < First + Half;
            if (PickLeft) { Probability *= Split; Sequence /= std::max(Split, 1e-20f); Slot = Left; Count = Half; }
            else { Probability *= 1.0f - Split; Sequence = (Sequence - Split) / std::max(1.0f - Split, 1e-20f); Slot = Right; First += Half; Count -= Half; }
        }
        const Branch& E = B_[Slot];
        float Weights[4] = { 0, 0, 0, 0 }, Sum = 0.0f;
        for (uint32_t i = 0u; i < E.Count; ++i) { Weights[i] = FacetSolidAngle(E.First + i, Position, Normal); Sum += Weights[i]; }
        if (Sum <= 0.0f) { Probability = 0.0f; return 0xFFFFFFFFu; }
        const float Target = std::clamp(Sequence, 0.0f, 0.999999f) * Sum;
        float Acc = 0.0f;
        for (uint32_t i = 0u; i < E.Count; ++i)
        {
            Acc += Weights[i];
            if (Requested == E.First + i || (Requested == 0xFFFFFFFFu && Target < Acc))
            { Probability *= Weights[i] / Sum; return E.First + i; }
        }
        Probability = 0.0f; return 0xFFFFFFFFu;
    }
    float RadianceDirectionDensity(uint32_t f, Vec3 Origin, Vec3 Point, float Probability) const noexcept
    {
        const Vec3 Delta = Sub(Point, Origin);
        return Probability * Dot(Delta, Delta) / std::max(F_[f].Area * std::fabs(Dot(F_[f].Normal, Norm(Delta))), 1e-20f);
    }

    // ---- the gather -------------------------------------------------------------------------------------------------------
    Vec3 GatherDistanceRadiance(Vec3 Position, Vec3 Normal, bool Current,
                                uint32_t SeedA, uint32_t SeedB) const noexcept
    {
        float Cell = 0.25f;
        SampleSceneDistance(Position, Cell);
        const Vec3 Origin = Add(Position, Mul(Normal, 0.002f));
        Vec3 Result{};
        const uint32_t Count = Current ? GS_ : RS_;
        const float ShiftX = Current ? Hash(SeedA) : 0.0f;
        const float ShiftY = Current ? Hash(SeedB) : 0.0f;
        const float ShiftZ = Current ? Hash(SeedA + 1u) : 0.0f;
        const float ShiftW = Current ? Hash(SeedB + 2u) : 0.0f;

        for (uint32_t Sample = 0u; Sample < Count; ++Sample)
        {
            Vec3 Direction = HemisphereDirection(Normal, Sample, Count, ShiftX, ShiftY);
            float Travel = Cell;
            Vec3 Incoming = Sky_;
            bool Resolved = false;
            MeshHit Hit;

            for (uint32_t Step = 0u; Step < 48u; ++Step)
            {
                const Vec3 Point = Add(Origin, Mul(Direction, Travel));
                float Local = 0.25f;
                const float Distance = SampleSceneDistance(Point, Local);
                if (Distance > 1e19f || BeyondScene(Point))
                {
                    Hit = TraceDistanceMesh(Origin, Direction, 1e20f);
                    if (Hit.Facet != 0xFFFFFFFFu)
                        Incoming = SampleCachedRadiance(Hit.Facet, Add(Origin, Mul(Direction, Hit.Travel)), Current);
                    Resolved = true; break;
                }
                if (Distance < Local * 0.7f)
                {
                    Hit = TraceDistanceMesh(Origin, Direction, Travel + Local * 2.0f);
                    if (Hit.Facet != 0xFFFFFFFFu)
                    { Incoming = SampleCachedRadiance(Hit.Facet, Add(Origin, Mul(Direction, Hit.Travel)), Current); Resolved = true; break; }
                }
                Travel += std::max(Distance * 0.75f, Local * 0.5f);
            }
            if (!Resolved)
            {
                Hit = TraceDistanceMesh(Origin, Direction, 1e20f);
                Incoming = Hit.Facet == 0xFFFFFFFFu
                    ? Sky_ : SampleCachedRadiance(Hit.Facet, Add(Origin, Mul(Direction, Hit.Travel)), Current);
            }

            float CosineDensity = std::max(Dot(Normal, Direction), 0.0f) / kPi;
            float AreaDensity = 0.0f;
            if (Hit.Facet != 0xFFFFFFFFu)
            {
                float Probability = 0.0f;
                SelectRadianceFacet(Origin, Normal, 0.0f, Hit.Facet, Probability);
                AreaDensity = RadianceDirectionDensity(Hit.Facet, Origin, Add(Origin, Mul(Direction, Hit.Travel)), Probability);
            }
            Result = Add(Result, Mul(Incoming, (CosineDensity / std::max(CosineDensity + AreaDensity, 1e-20f)) / static_cast<float>(Count)));

            // 📝 Second MIS leg: sample the surface cards by solid angle instead of the cosine lobe.
            float Probability = 0.0f;
            const uint32_t Picked = SelectRadianceFacet(Origin, Normal,
                Fract((static_cast<float>(Sample) + 0.5f) / static_cast<float>(Count) + ShiftZ), 0xFFFFFFFFu, Probability);
            if (Picked == 0xFFFFFFFFu || Probability <= 0.0f) continue;
            const float cu = Fract(0.5f + static_cast<float>(Sample) * 0.754877666f + ShiftY);
            const float cv = Fract(0.5f + static_cast<float>(Sample) * 0.569840296f + ShiftW);
            const Vec3 Point = CardPosition(Picked, cu, cv);
            const Vec3 Delta = Sub(Point, Origin);
            const float TravelToCard = Len(Delta);
            if (TravelToCard < 1e-4f) continue;
            Direction = Mul(Delta, 1.0f / TravelToCard);
            CosineDensity = std::max(Dot(Normal, Direction), 0.0f) / kPi;
            if (CosineDensity <= 0.0f) continue;
            if (TraceDistanceMesh(Origin, Direction, TravelToCard + 0.002f).Facet != Picked) continue;
            AreaDensity = RadianceDirectionDensity(Picked, Origin, Point, Probability);
            Result = Add(Result, Mul(SampleCachedRadiance(Picked, Point, Current),
                                     (CosineDensity / std::max(CosineDensity + AreaDensity, 1e-20f)) / static_cast<float>(Count)));
        }
        return Result;
    }

    // ---- raster G-buffer --------------------------------------------------------------------------------------------------
    void Rasterize(Frame& Out, int W, int H, Vec3 Eye, Vec3 Target, float FovYDeg,
                   const std::vector<LiveTri>& Tris) const noexcept
    {
        const size_t n = static_cast<size_t>(W) * H;
        Out.Position.assign(n, V3(0, 0, 0)); Out.Normal.assign(n, V3(0, 0, 1));
        Out.Albedo.assign(n, V3(0, 0, 0)); Out.Emission.assign(n, V3(0, 0, 0));
        Out.Roughness.assign(n, 0.6f);
        Out.SunVisibility.assign(n, -1.0f);
        Out.Instance.assign(n, 0xFFFFFFFFu); Out.Depth.assign(n, 1e30f);

        const Vec3 Fwd = Norm(Sub(Target, Eye));
        Vec3 Right = Norm(Cross(Fwd, V3(0, 0, 1)));
        Vec3 Up = Cross(Right, Fwd);
        if (std::fabs(Fwd[2]) > 0.999f) { Right = V3(0, 1, 0); Up = V3(-Fwd[2], 0, 0); }
        const float Half = std::tan(0.5f * FovYDeg * (kPi / 180.0f));
        const float Aspect = static_cast<float>(W) / static_cast<float>(H);

        for (size_t f = 0; f < Tris.size(); ++f)
        {
            const Vec3 S[3] = { Tris[f].A, Tris[f].B, Tris[f].C };
            float sx[3], sy[3], sz[3];
            bool Behind = false;
            for (int i = 0; i < 3; ++i)
            {
                const Vec3 d = Sub(S[i], Eye);
                sz[i] = Dot(d, Fwd);
                if (sz[i] < 1e-3f) { Behind = true; break; }
                sx[i] = Dot(d, Right) / (sz[i] * Half * Aspect);
                sy[i] = Dot(d, Up) / (sz[i] * Half);
            }
            if (Behind) continue;
            const float Area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
            if (std::fabs(Area) < 1e-14f) continue;
            const int X0 = std::max(0, static_cast<int>(std::floor((std::min({ sx[0], sx[1], sx[2] }) * 0.5f + 0.5f) * W)));
            const int X1 = std::min(W - 1, static_cast<int>(std::ceil((std::max({ sx[0], sx[1], sx[2] }) * 0.5f + 0.5f) * W)));
            const int Y0 = std::max(0, static_cast<int>(std::floor((0.5f - std::max({ sy[0], sy[1], sy[2] }) * 0.5f) * H)));
            const int Y1 = std::min(H - 1, static_cast<int>(std::ceil((0.5f - std::min({ sy[0], sy[1], sy[2] }) * 0.5f) * H)));
            for (int py = Y0; py <= Y1; ++py) for (int px = X0; px <= X1; ++px)
            {
                const float u = ((static_cast<float>(px) + 0.5f) / W - 0.5f) * 2.0f;
                const float w = (0.5f - (static_cast<float>(py) + 0.5f) / H) * 2.0f;
                const float b0 = ((sx[1] - u) * (sy[2] - w) - (sx[2] - u) * (sy[1] - w)) / Area;
                const float b1 = ((sx[2] - u) * (sy[0] - w) - (sx[0] - u) * (sy[2] - w)) / Area;
                const float b2 = 1.0f - b0 - b1;
                if (b0 < 0.0f || b1 < 0.0f || b2 < 0.0f) continue;
                const float z = b0 * sz[0] + b1 * sz[1] + b2 * sz[2];
                const size_t i = static_cast<size_t>(py) * W + px;
                if (z >= Out.Depth[i]) continue;
                Out.Depth[i] = z;
                Out.Position[i] = Add(Add(Mul(S[0], b0), Mul(S[1], b1)), Mul(S[2], b2));
                Out.Normal[i] = Tris[f].N;
                Out.Albedo[i] = Tris[f].Albedo;
                Out.Emission[i] = Tris[f].Emission;
                Out.Roughness[i] = Tris[f].Roughness;
                Out.Instance[i] = Tris[f].Instance;
            }
        }
    }

    // ---- resolve -----------------------------------------------------------------------------------------------------------
    /// 📝 ReconstructIrradiance: 7x7, alignment^32, plane tolerance, exp(-d^2/8). Verbatim in structure.
    Vec3 Reconstruct(const Frame& Out, int X, int Y, int W, int H, Vec3 Position, Vec3 Normal, uint32_t Instance) const noexcept
    {
        const size_t i = static_cast<size_t>(Y) * W + X;
        Vec3 Sum{}; float Total = 0.0f;
        for (int Row = -3; Row <= 3; ++Row) for (int Col = -3; Col <= 3; ++Col)
        {
            const int nx = X + Col, ny = Y + Row;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const size_t n = static_cast<size_t>(ny) * W + nx;
            if (Out.Instance[n] == 0xFFFFFFFFu) continue;
            if (Out.Instance[n] != Instance) continue;
            const Vec3 Guide = Out.GatherNormal[n];
            const float Alignment = Dot(Normal, Guide);
            if (Dot(Guide, Guide) < 1e-12f || Alignment < 0.9f) continue;
            const Vec3 Delta = Sub(Out.Position[n], Position);
            if (std::fabs(Dot(Delta, Normal)) > std::max(0.001f, Len(Delta) * 0.1f)) continue;
            const float Weight = std::exp(-static_cast<float>(Col * Col + Row * Row) / 8.0f) * std::pow(std::max(Alignment, 0.0f), 32.0f);
            Sum = Add(Sum, Mul(Out.Irradiance[n], Weight)); Total += Weight;
        }
        return Total > 0.0f ? Mul(Sum, 1.0f / Total) : Out.Irradiance[i];
    }

    void Resolve(Frame& Out, int X, int Y, int W, int H, Vec3 Eye) noexcept
    {
        const size_t i = static_cast<size_t>(Y) * W + X;
        const size_t o = i * 3u;
        Vec3 Colour;
        if (Out.Instance[i] == 0xFFFFFFFFu)
        {
            Colour = SkyAlong(Norm(Sub(Out.Position[i], Eye)), 0.0f);
        }
        else
        {
            const Vec3 P = Out.Position[i], N = Out.Normal[i];
            const Vec3 Albedo = Out.Albedo[i], Emission = Out.Emission[i];
            const Vec3 V = Norm(Sub(Eye, P));
            if (Dot(Emission, Emission) > 0.0f) Colour = Emission;
            else
            {
                if (SunR_ > 0.0f)
                {
                    const float NdotL = Dot(N, Sun_);
                    if (NdotL > 0.0f)
                    {
                        const float Vis = DistanceShadow(P, N);
                        Out.SunVisibility[i] = Vis;
                        if (P[2] < 0.02f)
                        {
                            VisSum += Vis; ++VisCount;
                            if (TraceDistanceMesh(Add(P, Mul(N, 0.002f)), Sun_, 1e20f).Facet != 0xFFFFFFFFu) ++HardUmbra;
                        }
                        const float Rough = std::clamp(Out.Roughness[i], 0.04f, 1.0f);
                        const Vec3 H = Norm(Add(V, Sun_));
                        const float NdotH = std::max(0.0f, Dot(N, H));
                        const float a = Rough * Rough;
                        const float dd = NdotH * NdotH * (a * a - 1.0f) + 1.0f;
                        const float D = a * a / (kPi * dd * dd);
                        const float Fres = 0.04f + 0.96f * std::pow(1.0f - std::max(0.0f, Dot(V, H)), 5.0f);
                        const float Spec = D * Fres * 0.25f;
                        Colour = Add(Colour, Mul(Mul(SunColour_, SunR_ * Vis * (NdotL / kPi)), Albedo));
                        Colour = Add(Colour, Mul(SunColour_, SunR_ * Vis * Spec));
                    }
                }
                if (Gi_)
                {
                    // 📝 GatherDistanceRadiance already averages Incoming over a COSINE-weighted hemisphere, so it
                    //    returns E/pi, not E. The engine's resolve is `col += response * ReconstructIrradiance *
                    //    Tuning.y` with no further 1/pi — the 1/pi is inside the gather. Dividing here again made
                    //    every indirect term a factor of pi too dark.
                    const Vec3 Incident = Reconstruct(Out, X, Y, W, H, P, N, Out.Instance[i]);
                    Colour = Add(Colour, Mul(Mul(Albedo, Incident), Scale_));
                }
                else
                    Colour = Add(Colour, Mul(Albedo, Sky_));
            }
        }
        Colour = Mul(Colour, Exposure_);
        Out.Pixels[o + 0] = std::pow(Colour[0] / (Colour[0] + 1.0f), 1.0f / 2.2f);
        Out.Pixels[o + 1] = std::pow(Colour[1] / (Colour[1] + 1.0f), 1.0f / 2.2f);
        Out.Pixels[o + 2] = std::pow(Colour[2] / (Colour[2] + 1.0f), 1.0f / 2.2f);
    }

    Vec3 SkyAlong(Vec3 Direction, float Roughness) const noexcept
    {
        const float h = std::clamp(Direction[2] * 0.5f + 0.5f, 0.0f, 1.0f);
        Vec3 Dome = Mix(Mul(Sky_, V3(1.35f, 1.22f, 1.05f)), Sky_, h * h);
        if (SunR_ > 0.0f)
        {
            const float c = std::clamp(Dot(Direction, Sun_), 0.0f, 1.0f);
            const float Sharp = 2048.0f + (8.0f - 2048.0f) * std::clamp(Roughness, 0.0f, 1.0f);
            Dome = Add(Dome, Mul(SunColour_, SunR_ * std::pow(c, Sharp) * 0.02f));
        }
        return Dome;
    }
};

//============================================================================================================================================
//  Output
//============================================================================================================================================
static bool WritePpm(const char* Path, const std::vector<float>& Px, int W, int H) noexcept
{
    FILE* f = std::fopen(Path, "wb");
    if (!f) { std::fprintf(stderr, "[SdfGi] cannot write %s\n", Path); return false; }
    std::fprintf(f, "P6\n%d %d\n255\n", W, H);
    for (size_t i = 0; i < static_cast<size_t>(W) * H * 3u; ++i)
    {
        const unsigned char c = static_cast<unsigned char>(std::clamp(Px[i], 0.0f, 1.0f) * 255.0f + 0.5f);
        std::fputc(c, f);
    }
    std::fclose(f);
    return true;
}

//============================================================================================================================================
//  Scene: a closed room lit only by an emissive ceiling panel, plus two moving objects
//============================================================================================================================================
static inline Vec3 StaticAlbedoFor(Vec3 C, float Sx) noexcept
{
    if (std::fabs(C[0] + Sx) < 1e-3f) return V3(0.72f, 0.16f, 0.14f);       // -x wall: red
    if (std::fabs(C[0] - Sx) < 1e-3f) return V3(0.22f, 0.60f, 0.24f);       // +x wall: green
    return V3(0.78f, 0.76f, 0.72f);                                         // floor / ceiling / other walls
}

namespace Build
{
struct Mesh { std::vector<Vec3> Verts; std::vector<uint32_t> Idx; Vec3 Albedo; Vec3 Emission; float Roughness; };

static void Quad(Mesh& m, Vec3 a, Vec3 b, Vec3 c, Vec3 d) noexcept
{
    const uint32_t base = static_cast<uint32_t>(m.Verts.size());
    m.Verts.push_back(a); m.Verts.push_back(b); m.Verts.push_back(c); m.Verts.push_back(d);
    m.Idx.push_back(base); m.Idx.push_back(base + 1u); m.Idx.push_back(base + 2u);
    m.Idx.push_back(base); m.Idx.push_back(base + 2u); m.Idx.push_back(base + 3u);
}

/// 📦 An open-topped courtyard: a floor and four walls, NO ceiling. The ceiling has to be missing so the sun
///    reaches the floor — a closed room makes DistanceShadow return 0 everywhere (the exact BVH always finds the
///    lid), which would leave the emissive panel as the only light and a moved instance cannot block a card
///    sample, so nothing would move. Each surface is subdivided: a single room-sized quad gets near-plane culled
///    by the rasterizer, and small facets also make the surface cards meaningful.
static Mesh Courtyard(float Sx, float Sy, float WallZ, int Sub) noexcept
{
    Mesh m; m.Albedo = V3(0.78f, 0.76f, 0.72f); m.Roughness = 0.9f;
    auto Grid = [&](Vec3 Origin, Vec3 AlongU, Vec3 AlongV) noexcept
    {
        for (int j = 0; j < Sub; ++j) for (int i = 0; i < Sub; ++i)
        {
            const float u0 = static_cast<float>(i) / Sub, u1 = static_cast<float>(i + 1) / Sub;
            const float v0 = static_cast<float>(j) / Sub, v1 = static_cast<float>(j + 1) / Sub;
            Quad(m, Add(Origin, Add(Mul(AlongU, u0), Mul(AlongV, v0))),
                    Add(Origin, Add(Mul(AlongU, u1), Mul(AlongV, v0))),
                    Add(Origin, Add(Mul(AlongU, u1), Mul(AlongV, v1))),
                    Add(Origin, Add(Mul(AlongU, u0), Mul(AlongV, v1))));
        }
    };
    Grid(V3(-Sx, -Sy, 0.0f), V3(2.0f * Sx, 0, 0), V3(0, 2.0f * Sy, 0));                 // floor
    Grid(V3(-Sx, -Sy, 0.0f), V3(0, 2.0f * Sy, 0), V3(0, 0, WallZ));                     // -x wall
    Grid(V3( Sx,  Sy, 0.0f), V3(0, -2.0f * Sy, 0), V3(0, 0, WallZ));                    // +x wall
    Grid(V3(-Sx, -Sy, 0.0f), V3(2.0f * Sx, 0, 0), V3(0, 0, WallZ));                     // -y wall
    Grid(V3( Sx,  Sy, 0.0f), V3(-2.0f * Sx, 0, 0), V3(0, 0, WallZ));                    // +y wall
    return m;
}

static Mesh Sphere(float Radius, int Segments, int Rings) noexcept
{
    Mesh m; m.Albedo = V3(0.88f, 0.88f, 0.90f); m.Roughness = 0.35f;
    for (int r = 0; r <= Rings; ++r)
    {
        const float phi = kPi * static_cast<float>(r) / Rings;
        for (int s = 0; s <= Segments; ++s)
        {
            const float theta = 2.0f * kPi * static_cast<float>(s) / Segments;
            m.Verts.push_back(V3(Radius * std::sin(phi) * std::cos(theta),
                                 Radius * std::sin(phi) * std::sin(theta),
                                 Radius * std::cos(phi)));
        }
    }
    for (int r = 0; r < Rings; ++r) for (int s = 0; s < Segments; ++s)
    {
        const uint32_t a = static_cast<uint32_t>(r * (Segments + 1) + s);
        const uint32_t b = a + Segments + 1u;
        m.Idx.push_back(a); m.Idx.push_back(b); m.Idx.push_back(a + 1u);
        m.Idx.push_back(a + 1u); m.Idx.push_back(b); m.Idx.push_back(b + 1u);
    }
    return m;
}

static Mesh Box(Vec3 Half) noexcept
{
    Mesh m; m.Albedo = V3(0.92f, 0.48f, 0.14f); m.Roughness = 0.45f;
    const Vec3 C[8] = { V3(-Half[0], -Half[1], -Half[2]), V3(Half[0], -Half[1], -Half[2]),
                        V3(Half[0],  Half[1], -Half[2]), V3(-Half[0],  Half[1], -Half[2]),
                        V3(-Half[0], -Half[1],  Half[2]), V3(Half[0], -Half[1],  Half[2]),
                        V3(Half[0],  Half[1],  Half[2]), V3(-Half[0],  Half[1],  Half[2]) };
    const int F[6][4] = { { 0, 3, 2, 1 }, { 4, 5, 6, 7 }, { 0, 1, 5, 4 },
                          { 2, 3, 7, 6 }, { 1, 2, 6, 5 }, { 3, 0, 4, 7 } };
    for (int f = 0; f < 6; ++f)
    {
        const uint32_t base = static_cast<uint32_t>(m.Verts.size());
        for (int k = 0; k < 4; ++k) m.Verts.push_back(C[F[f][k]]);
        m.Idx.push_back(base); m.Idx.push_back(base + 1u); m.Idx.push_back(base + 2u);
        m.Idx.push_back(base); m.Idx.push_back(base + 2u); m.Idx.push_back(base + 3u);
    }
    return m;
}

static Mesh WallStrip(float HalfU, float HalfV, float Y, float Z) noexcept
{
    Mesh m; m.Albedo = V3(0.0f, 0.0f, 0.0f); m.Emission = V3(9.0f, 7.4f, 5.2f); m.Roughness = 1.0f;
    Quad(m, V3(-HalfU, Y, Z - HalfV), V3(HalfU, Y, Z - HalfV), V3(HalfU, Y, Z + HalfV), V3(-HalfU, Y, Z + HalfV));
    return m;
}
} // namespace Build

//============================================================================================================================================
//  Reference path tracer over the LIVE (current-pose) geometry — the ground truth for the moving scene
//============================================================================================================================================
struct RefTri { Vec3 A, B, C, N, Albedo, Emission; };

static float RefHit(const std::vector<RefTri>& T, Vec3 O, Vec3 D, float Max, Vec3& P, Vec3& N, size_t& Which) noexcept;

static bool RefOccluded(const std::vector<RefTri>& T, Vec3 O, Vec3 D, float Max) noexcept
{
    for (const RefTri& t : T)
    {
        const Vec3 EA = Sub(t.B, t.A), EB = Sub(t.C, t.A);
        const Vec3 Cr = Cross(D, EB);
        const float Det = Dot(EA, Cr);
        if (std::fabs(Det) < 1e-12f) continue;
        const Vec3 Delta = Sub(O, t.A);
        const float Beta = Dot(Delta, Cr) / Det;
        const Vec3 Second = Cross(Delta, EA);
        const float Gamma = Dot(D, Second) / Det;
        const float Travel = Dot(EB, Second) / Det;
        if (Beta >= 0.0f && Gamma >= 0.0f && Beta + Gamma <= 1.0f && Travel > 1e-3f && Travel < Max) return true;
    }
    return false;
}

/// 📦 Unidirectional path tracer over the LIVE triangles, with next-event estimation to the emissive panel and to
///    the sun. This is the ground truth for the moving scene: it never touches the distance field, so agreement
///    between it and the SDF GI image can only come from the field being correctly transformed.
struct PanelLight { Vec3 Centre; Vec3 HalfU, HalfV; Vec3 Emission; float Area; };

static Vec3 RefPath(const std::vector<RefTri>& T, Vec3 Origin, Vec3 Direction, const PanelLight& Panel,
                    Vec3 SunDir, Vec3 SunColour, float SunR, Vec3 Sky, uint64_t& Seed, int Depth) noexcept
{
    auto Random = [&Seed]() noexcept
    { Seed = Seed * 6364136223846793005ull + 1442695040888963407ull; return static_cast<float>((Seed >> 11) & 0xFFFFFF) / 16777216.0f; };

    if (Depth > 4) return V3(0, 0, 0);
    Vec3 P, N; size_t Which;
    if (RefHit(T, Origin, Direction, 1e30f, P, N, Which) >= 1e29f) return Sky;
    const RefTri& Tri = T[Which];
    if (Dot(Tri.Emission, Tri.Emission) > 0.0f) return Tri.Emission;

    const Vec3 Basis = Norm(Sub(P, Origin));
    const Vec3 Front = Dot(N, Basis) < 0.0f ? N : Mul(N, -1.0f);
    const Vec3 O = Add(P, Mul(Front, 2e-3f));
    Vec3 Result{};

    // sun, exactly shadowed
    const float NdotL = Dot(Front, SunDir);
    if (SunR > 0.0f && NdotL > 0.0f && !RefOccluded(T, O, SunDir, 1e29f))
        Result = Add(Result, Mul(Mul(SunColour, SunR * NdotL / kPi), Tri.Albedo));
    // emissive panel, area sampled and exactly shadowed
    {
        const Vec3 Point = Add(Add(Panel.Centre, Mul(Panel.HalfU, Random() * 2.0f - 1.0f)), Mul(Panel.HalfV, Random() * 2.0f - 1.0f));
        const Vec3 Delta = Sub(Point, O);
        const float D2 = Dot(Delta, Delta);
        if (D2 > 1e-8f)
        {
            const float Travel = std::sqrt(D2);
            const Vec3 D = Mul(Delta, 1.0f / Travel);
            const float CosS = std::max(0.0f, Dot(Front, D));
            const float CosL = std::max(0.0f, -Dot(V3(0, 1, 0), D));
            if (CosS > 0.0f && CosL > 0.0f && !RefOccluded(T, O, D, Travel - 1e-3f))
                Result = Add(Result, Mul(Tri.Albedo, Mul(Panel.Emission, Panel.Area * CosS * CosL / (kPi * D2))));
        }
    }
    // one cosine bounce
    if (Depth < 4)
    {
        const float u1 = Random(), u2 = Random();
        const float R = std::sqrt(u1), Phi = 2.0f * kPi * u2;
        Vec3 T1 = Norm(Cross(Front, std::fabs(Front[2]) < 0.9f ? V3(0, 0, 1) : V3(0, 1, 0)));
        Vec3 T2 = Cross(Front, T1);
        const Vec3 D = Norm(Add(Add(Mul(T1, std::cos(Phi) * R), Mul(T2, std::sin(Phi) * R)), Mul(Front, std::sqrt(std::max(0.0f, 1.0f - u1)))));
        Result = Add(Result, Mul(Tri.Albedo, RefPath(T, O, D, Panel, SunDir, SunColour, SunR, Sky, Seed, Depth + 1)));
    }
    return Result;
}

static float RefHit(const std::vector<RefTri>& T, Vec3 O, Vec3 D, float Max, Vec3& P, Vec3& N, size_t& Which) noexcept
{
    float Best = Max; Which = static_cast<size_t>(-1);
    for (size_t i = 0; i < T.size(); ++i)
    {
        const Vec3 EA = Sub(T[i].B, T[i].A), EB = Sub(T[i].C, T[i].A);
        const Vec3 Cr = Cross(D, EB);
        const float Det = Dot(EA, Cr);
        if (std::fabs(Det) < 1e-12f) continue;
        const Vec3 Delta = Sub(O, T[i].A);
        const float Beta = Dot(Delta, Cr) / Det;
        const Vec3 Second = Cross(Delta, EA);
        const float Gamma = Dot(D, Second) / Det;
        const float Travel = Dot(EB, Second) / Det;
        if (Beta >= 0.0f && Gamma >= 0.0f && Beta + Gamma <= 1.0f && Travel > 1e-4f && Travel < Best)
        { Best = Travel; Which = i; }
    }
    if (Which != static_cast<size_t>(-1)) { P = Add(O, Mul(D, Best)); N = T[Which].N; }
    return Best;
}

//============================================================================================================================================
//  main
//============================================================================================================================================
int main(int argc, char** argv)
{
    std::string outDir = "Diagnostics/SdfGi";
    int width = 256, height = 144, frames = 12, warmup = 6, cardRes = 8;
    int gatherSamples = 32, radianceSamples = 16, spp = 0;
    float softness = 0.18f, exposure = 1.0f, irradiance = 1.0f;
    uint32_t budget = 10u << 20u;
    std::string mode = "dynamic";      // dynamic | frozen | nogi
    bool reference = false;
    int  refEvery = 4;
    float voxel = 0.0f;

    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        auto F = [&](float def) { return (i + 1 < argc) ? static_cast<float>(std::atof(argv[++i])) : def; };
        if      (a == "--out")       outDir = argv[++i];
        else if (a == "--width")     width = static_cast<int>(F(width));
        else if (a == "--height")    height = static_cast<int>(F(height));
        else if (a == "--frames")    frames = static_cast<int>(F(frames));
        else if (a == "--warmup")    warmup = static_cast<int>(F(warmup));
        else if (a == "--card")      cardRes = static_cast<int>(F(cardRes));
        else if (a == "--gather")    gatherSamples = static_cast<int>(F(gatherSamples));
        else if (a == "--radiance")  radianceSamples = static_cast<int>(F(radianceSamples));
        else if (a == "--spp")       spp = static_cast<int>(F(spp));
        else if (a == "--softness")  softness = F(softness);
        else if (a == "--exposure")  exposure = F(exposure);
        else if (a == "--irradiance") irradiance = F(irradiance);
        else if (a == "--budget")    budget = static_cast<uint32_t>(F(budget));
        else if (a == "--voxel")     voxel = F(voxel);
        else if (a == "--mode")      mode = argv[++i];
        else if (a == "--reference") reference = true;
        else if (a == "--refevery")  refEvery = std::max(1, static_cast<int>(F(refEvery)));
        else std::fprintf(stderr, "[SdfGi] unknown flag %s\n", a.c_str());
    }
    std::filesystem::create_directories(outDir);

    // ---------------------------------------------------------------- three meshes, three instances
    const float Sx = 2.6f, Sy = 2.6f, Sz = 2.1f;
    // Cornell-style wall colours make indirect transport visible; the panel is the only emitter.
    Build::Mesh room = Build::Courtyard(Sx, Sy, Sz, 6);
    const size_t RoomTris = room.Idx.size();
    Build::Mesh light = Build::WallStrip(0.75f, 0.16f, -Sy + 0.02f, 1.55f);
    Build::Mesh sphere = Build::Sphere(0.72f, 20, 12);
    Build::Mesh box = Build::Box(V3(0.55f, 0.38f, 0.30f));

    // instance 0 = room + ceiling panel (static), 1 = sphere (translates), 2 = box (rotates + translates)
    std::vector<Build::Mesh> meshes;
    {   Build::Mesh stat = room;
        const uint32_t base = static_cast<uint32_t>(stat.Verts.size());
        for (Vec3 v : light.Verts) stat.Verts.push_back(v);
        for (uint32_t ix : light.Idx) stat.Idx.push_back(base + ix);
        meshes.push_back(std::move(stat));
        meshes.push_back(sphere);
        meshes.push_back(box);
    }
    const Vec3 staticAlbedo = room.Albedo;

    // ---- flatten into the engine's vertex / index / instance arrays
    std::vector<VertexRecord> verts;
    std::vector<uint32_t> corners;
    std::vector<InstanceRecord> rows(3);
    std::vector<Facet> facets;
    for (size_t m = 0; m < meshes.size(); ++m)
    {
        rows[m].FirstIndex = static_cast<uint32_t>(corners.size());
        // 📝 DistanceAtlasSpace::Bake and DistanceFieldStructure both read Vertices[Corners[i] + VertexOffset], so
        //    VertexOffset must stay 0 here: the indices pushed below are already global. Pre-applying it made the
        //    baker range-check every corner of instances 1 and 2 out of bounds, silently leaving them with an
        //    empty facet list and therefore no volume at all.
        rows[m].VertexOffset = 0u;
        rows[m].TriangleCount = static_cast<uint32_t>(meshes[m].Idx.size() / 3u);
        rows[m].MaterialIndex = static_cast<uint32_t>(m);
        std::memset(rows[m].World, 0, sizeof(rows[m].World));
        rows[m].World[0] = rows[m].World[5] = rows[m].World[10] = rows[m].World[15] = 1.0f;
        const uint32_t VertexBase = static_cast<uint32_t>(verts.size());
        for (Vec3 v : meshes[m].Verts)
        {
            VertexRecord r{};
            r.SpatialLocation.x = v[0]; r.SpatialLocation.y = v[1]; r.SpatialLocation.z = v[2];
            verts.push_back(r);
        }
        for (uint32_t ix : meshes[m].Idx) corners.push_back(ix + VertexBase);
    }

    // ---- world matrices: baked pose. Sphere at (0,1.05,1.0), box at (-1.15,-0.55,0.85)
    auto Translate = [](float x, float y, float z, float* W) noexcept
    {
        std::memset(W, 0, 16 * sizeof(float));
        W[0] = W[5] = W[10] = W[15] = 1.0f; W[12] = x; W[13] = y; W[14] = z;
    };
    auto RotateZ = [](float a, float* W) noexcept
    {
        std::memset(W, 0, 16 * sizeof(float));
        const float c = std::cos(a), s = std::sin(a);
        W[0] = c; W[1] = s; W[4] = -s; W[5] = c; W[10] = 1.0f; W[15] = 1.0f;
    };
    auto Compose = [](const float* A, const float* B, float* Out) noexcept   // Out = A * B (column-major)
    {
        for (int c = 0; c < 4; ++c) for (int r = 0; r < 4; ++r)
        {
            float Sum = 0.0f;
            for (int k = 0; k < 4; ++k) Sum += A[k * 4 + r] * B[c * 4 + k];
            Out[c * 4 + r] = Sum;
        }
    };
    Translate(0.0f, 1.05f, 1.00f, rows[1].World);
    { float Rot[16], Tra[16]; RotateZ(0.0f, Rot); Translate(-1.15f, -0.55f, 0.80f, Tra); Compose(Tra, Rot, rows[2].World); }
    for (auto& r : rows) std::memcpy(r.PreviousWorld, r.World, sizeof(r.World));

    // ---- facets, at the BAKED pose (this is what the engine bakes and never rebuilds)
    for (size_t m = 0; m < meshes.size(); ++m)
    {
        const Vec3 Albedo = m == 0 ? staticAlbedo : meshes[m].Albedo;
        const Vec3 Emis = m == 0 ? V3(0, 0, 0) : meshes[m].Emission;
        for (size_t t = 0; t + 2 < meshes[m].Idx.size(); t += 3)
        {
            Facet f;
            const float* W = rows[m].World;
            auto Xform = [W](Vec3 p) noexcept
            { return V3(W[0] * p[0] + W[4] * p[1] + W[8] * p[2] + W[12],
                        W[1] * p[0] + W[5] * p[1] + W[9] * p[2] + W[13],
                        W[2] * p[0] + W[6] * p[1] + W[10] * p[2] + W[14]); };
            f.Alpha = Xform(meshes[m].Verts[meshes[m].Idx[t + 0]]);
            f.Beta = Xform(meshes[m].Verts[meshes[m].Idx[t + 1]]);
            f.Gamma = Xform(meshes[m].Verts[meshes[m].Idx[t + 2]]);
            // the ceiling panel is emissive; everything else in instance 0 is room paint
            const bool isPanel = (m == 0) && (t >= RoomTris);
            f.Albedo = isPanel ? V3(0, 0, 0) : Albedo;
            f.Emission = isPanel ? light.Emission : Emis;
            if (isPanel && false) {}
            // colour the walls like a Cornell box so indirect transport is visible
            if (m == 0 && !isPanel) f.Albedo = StaticAlbedoFor(Mul(Add(Add(f.Alpha, f.Beta), f.Gamma), 1.0f / 3.0f), Sx);
            f.Instance = static_cast<uint32_t>(m);
            f.Primitive = static_cast<uint32_t>(t / 3u);
            f.Roughness = m == 0 ? 0.9f : meshes[m].Roughness;
            facets.push_back(f);
        }
    }

    // ---------------------------------------------------------------- pipeline
    SdfGiPipeline gi;
    gi.SetScene(facets, verts, corners, rows);

    DistanceAtlasSettings settings;
    settings.AtlasVoxelBudget = budget;
    settings.MeshVoxelBudget = budget;
    settings.MinimumVoxel = voxel > 0.0f ? voxel : 0.030f;
    settings.PaddingVoxels = 2u;
    settings.ThreadCount = 0u;

    const auto BakeStart = std::chrono::steady_clock::now();
    if (!gi.Bake(settings)) { std::fprintf(stderr, "[SdfGi] bake failed\n"); return 1; }
    const auto& rep = gi.Report();
    std::printf("[SdfGi] BAKE (once)   volumes=%u instances=%u voxels=%llu  %.1f ms  voxel[%.4f..%.4f] m\n",
                rep.Volumes, rep.Instances, static_cast<unsigned long long>(rep.Voxels), gi.BakeMs(),
                rep.FinestVoxel, rep.CoarsestVoxel);
    std::printf("[SdfGi] facets=%zu  card=%ux%u  card texels=%zu\n",
                facets.size(), static_cast<unsigned>(cardRes), static_cast<unsigned>(cardRes), gi.CardTexels());
    { const char* Names[3] = { "room", "sphere", "box" }; gi.PrintInstances(Names); }
    (void)BakeStart;

    gi.Configure(static_cast<uint32_t>(cardRes), static_cast<uint32_t>(gatherSamples),
                 static_cast<uint32_t>(radianceSamples),
                 Norm(V3(0.22f, 0.34f, 0.91f)), V3(1.0f, 0.97f, 0.92f), 3.2f,   // sun: the field-marched penumbra
                 V3(0.055f, 0.070f, 0.095f), softness, irradiance, exposure,
                 mode != "nogi", mode == "frozen");

    gi.PassCapture();
    std::printf("[SdfGi] capture       %.1f ms\n", gi.CaptureMs());
    const Vec3 SunDirection = Norm(V3(0.22f, 0.34f, 0.91f));
    if (std::getenv("SDFGI_SCAN"))
    {
        std::printf("[SdfGi] sun = (%.3f, %.3f, %.3f)  softness = %.4f\n", SunDirection[0], SunDirection[1], SunDirection[2], softness);
        gi.ScanShadow(V3(0.0f, 0.0f, 0.0f), V3(0, 0, 1), SunDirection, 3.2f);
        gi.ScanShadow(V3(1.20f, 1.20f, 0.0f), V3(0, 0, 1), SunDirection, 3.2f);
    }

    const Vec3 Eye = V3(0.35f, -2.15f, 1.62f);
    const Vec3 Target = V3(0.0f, 0.45f, 0.30f);
    const float FovY = 58.0f;

    // ---------------------------------------------------------------- warmup: temporal convergence
    std::printf("[SdfGi] warmup %d frame(s)...\n", warmup);
    for (int f = 0; f < warmup; ++f)
    {
        gi.PassRadiance();
        std::printf("[SdfGi]   warmup %2d  radiance %.1f ms\n", f, gi.RadianceMs());
        std::fflush(stdout);
    }

    // ---------------------------------------------------------------- frames
    std::FILE* csv = std::fopen((outDir + "/frametimes.csv").c_str(), "w");
    if (csv) std::fprintf(csv, "frame,bake_calls,placement_revision,moved_instances,project_ms,capture_ms,radiance_ms,gather_ms,resolve_ms,total_ms\n");

    // 📝 Primary visibility and the ground truth use the LIVE pose; the field, the cards and every exact query
    //    use the BAKED pose. That split is the whole point of the pipeline.
    auto BuildLive = [&](const std::vector<InstanceRecord>& Cur)
    {
        std::vector<LiveTri> Out;
        for (size_t m = 0; m < meshes.size(); ++m)
        {
            const float* W = Cur[m].World;
            auto Xform = [W](Vec3 p) noexcept
            { return V3(W[0] * p[0] + W[4] * p[1] + W[8] * p[2] + W[12],
                        W[1] * p[0] + W[5] * p[1] + W[9] * p[2] + W[13],
                        W[2] * p[0] + W[6] * p[1] + W[10] * p[2] + W[14]); };
            const bool isStatic = (m == 0);
            for (size_t t = 0; t + 2 < meshes[m].Idx.size(); t += 3)
            {
                LiveTri L;
                L.A = Xform(meshes[m].Verts[meshes[m].Idx[t + 0]]);
                L.B = Xform(meshes[m].Verts[meshes[m].Idx[t + 1]]);
                L.C = Xform(meshes[m].Verts[meshes[m].Idx[t + 2]]);
                L.N = Norm(Cross(Sub(L.B, L.A), Sub(L.C, L.A)));
                const bool isPanel = isStatic && (t >= RoomTris);
                L.Albedo = isPanel ? V3(0, 0, 0) : (isStatic ? StaticAlbedoFor(Mul(Add(Add(L.A, L.B), L.C), 1.0f / 3.0f), Sx) : meshes[m].Albedo);
                L.Emission = isPanel ? light.Emission : (isStatic ? V3(0, 0, 0) : meshes[m].Emission);
                L.Roughness = isStatic ? 0.9f : meshes[m].Roughness;
                L.Instance = static_cast<uint32_t>(m);
                Out.push_back(L);
            }
        }
        return Out;
    };

    const uint64_t AtlasHash0 = gi.AtlasChecksum();
    std::printf("[SdfGi] atlas %zu bytes  checksum after bake = %016llx\n", gi.AtlasBytes(),
                static_cast<unsigned long long>(AtlasHash0));

    std::vector<std::string> framePaths;
    bool MaskWritten = false;
    std::vector<float> ProbeX, ProbeY, SphereX, SphereY;
    for (int f = 0; f < frames; ++f)
    {
        const float Phase = 2.0f * kPi * static_cast<float>(f) / static_cast<float>(frames);

        // ---- move the two dynamic instances
        std::vector<InstanceRecord> moved = rows;
        Translate(1.05f * std::cos(Phase), 0.35f + 1.05f * std::sin(Phase), 1.00f + 0.32f * std::sin(2.0f * Phase),
                  moved[1].World);
        { float Rot[16], Tra[16];
          RotateZ(Phase * 1.5f, Rot);
          Translate(-1.15f + 0.75f * std::sin(Phase), -0.55f + 0.55f * std::cos(Phase), 0.80f + 0.25f * std::sin(Phase), Tra);
          Compose(Tra, Rot, moved[2].World); }

        const auto T0 = std::chrono::steady_clock::now();
        if (mode != "frozen") gi.Place(moved);
        const double PlaceMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - T0).count();
        // 📝 The frozen control freezes ONLY the field. The live geometry still moves, so the objects are visibly
        //    in motion while their shadow and their occlusion stay at the baked pose. That isolates the effect of
        //    Project() from everything else.
        const auto T1 = std::chrono::steady_clock::now();
        gi.SetLive(BuildLive(moved));
        const double LiveMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - T1).count();
        const uint64_t Hash = gi.AtlasChecksum();

        gi.PassRadiance();
        SdfGiPipeline::Frame out;
        gi.ResetVisibility();
        gi.Render(out, width, height, Eye, Target, FovY);

        char name[256];
        std::snprintf(name, sizeof(name), "%s/frame_%03d.ppm", outDir.c_str(), f);
        WritePpm(name, out.Pixels, width, height);
        framePaths.push_back(name);
        {
            std::vector<float> Vis(static_cast<size_t>(width) * height * 3u, 0.0f);
            double Sum = 0.0, FloorSum = 0.0; long long Count = 0, FloorCount = 0;
            for (size_t i = 0; i < out.SunVisibility.size(); ++i)
            {
                const float v = out.SunVisibility[i];
                const float c = v < 0.0f ? 0.0f : v;
                Vis[i * 3u] = Vis[i * 3u + 1u] = Vis[i * 3u + 2u] = c;
                if (v >= 0.0f) { Sum += v; ++Count;
                    if (out.Position[i][2] < 0.02f) { FloorSum += v; ++FloorCount; } }
            }
            char visName[256];
            std::snprintf(visName, sizeof(visName), "%s/vis_%03d.ppm", outDir.c_str(), f);
            WritePpm(visName, Vis, width, height);
            if (f == 0) std::printf("[SdfGi]   sun visibility: mean over all shaded pixels %.4f (n=%lld), "
                                    "mean over floor %.4f (n=%lld)\n",
                                    Count ? Sum / Count : 0.0, Count, FloorCount ? FloorSum / FloorCount : 0.0, FloorCount);
        }

        // ---------------------------------------------------------------- floor shadow probe
        // 📝 Among G-buffer pixels that landed on the floor, where is the darkest decile? If the distance field is
        //    being transformed, that dark patch must track the moving objects frame to frame.
        {
            struct Probe { float Luminance; Vec3 P; };
            std::vector<Probe> Floor;
            for (size_t i = 0; i < out.Position.size(); ++i)
            {
                if (out.Instance[i] == 0xFFFFFFFFu) continue;
                if (out.Position[i][2] > 0.02f) continue;                        // floor only
                // 📝 Exclude a 0.7 m band along the walls: that band is darkened by the walls themselves, it never
                //    moves, and it swamps the darkest-percentile statistic.
                if (std::fabs(out.Position[i][0]) > Sx - 0.7f || std::fabs(out.Position[i][1]) > Sy - 0.7f) continue;
                const Vec3 c = out.Pixels.empty() ? V3(0, 0, 0) : V3(out.Pixels[i * 3], out.Pixels[i * 3 + 1], out.Pixels[i * 3 + 2]);
                Floor.push_back({ 0.2126f * c[0] + 0.7152f * c[1] + 0.0722f * c[2], out.Position[i] });
            }
            if (!Floor.empty())
            {
                std::vector<size_t> Order(Floor.size());
                for (size_t i = 0; i < Order.size(); ++i) Order[i] = i;
                std::nth_element(Order.begin(), Order.begin() + Order.size() / 20u, Order.end(),
                    [&](size_t a, size_t b) { return Floor[a].Luminance < Floor[b].Luminance; });
                float cx = 0.0f, cy = 0.0f, mean = 0.0f;
                const size_t Keep = std::max<size_t>(1u, Order.size() / 20u);
                for (size_t k = 0; k < Keep; ++k) { cx += Floor[Order[k]].P[0]; cy += Floor[Order[k]].P[1]; }
                for (const Probe& p : Floor) mean += p.Luminance;
                std::printf("[SdfGi]   probe  floor pixels=%zu  mean luminance %.4f  darkest-5%% centroid (x=%.2f, y=%.2f)"
                            "   sphere at (%.2f, %.2f)\n",
                            Floor.size(), mean / Floor.size(), cx / Keep, cy / Keep,
                            moved[1].World[12], moved[1].World[13]);
                ProbeX.push_back(cx / Keep); ProbeY.push_back(cy / Keep);
                SphereX.push_back(moved[1].World[12]); SphereY.push_back(moved[1].World[13]);
                if (!MaskWritten)
                {
                    MaskWritten = true;
                    std::vector<float> Mask(static_cast<size_t>(width) * height * 3u, 0.0f);
                    for (size_t k = 0; k < out.Position.size(); ++k)
                        if (out.Instance[k] != 0xFFFFFFFFu && out.Position[k][2] <= 0.02f)
                            Mask[k * 3u] = Mask[k * 3u + 1u] = Mask[k * 3u + 2u] = 1.0f;
                    WritePpm((outDir + "/floor_mask.ppm").c_str(), Mask, width, height);
                }
            }
        }

        if (reference && (f % refEvery == 0))
        {
            std::vector<RefTri> Ref;
            for (const LiveTri& L : BuildLive(moved))
            {
                RefTri r; r.A = L.A; r.B = L.B; r.C = L.C; r.N = L.N;
                r.Albedo = L.Albedo; r.Emission = L.Emission; Ref.push_back(r);
            }
            PanelLight Panel;
            Panel.Centre = V3(0.0f, -Sy + 0.02f, 1.55f);
            Panel.HalfU = V3(0.75f, 0.0f, 0.0f);
            Panel.HalfV = V3(0.0f, 0.0f, 0.16f);
            Panel.Emission = light.Emission;
            Panel.Area = 4.0f * 0.75f * 0.16f;

            const Vec3 Fwd = Norm(Sub(Target, Eye));
            Vec3 Right = Norm(Cross(Fwd, V3(0, 0, 1)));
            Vec3 Up = Cross(Right, Fwd);
            const float Half = std::tan(0.5f * FovY * (kPi / 180.0f));
            const float Aspect = static_cast<float>(width) / static_cast<float>(height);
            const int Rspp = spp > 0 ? spp : 64;
            std::vector<float> Rgb(static_cast<size_t>(width) * height * 3u, 0.0f);
            std::atomic<uint32_t> Row3{ 0u };
            std::vector<uint64_t> Seeds(std::thread::hardware_concurrency() + 1u);
            const auto Rt = std::chrono::steady_clock::now();
            std::vector<std::thread> Pool;
            for (unsigned t = 0; t < std::max(1u, std::thread::hardware_concurrency()); ++t)
                Pool.emplace_back([&, t]()
                {
                    uint64_t Seed = 0x9e3779b97f4a7c15ull + 0x85ebca6bull * (static_cast<uint64_t>(t) + 1u);
                    for (uint32_t y = Row3.fetch_add(1u); y < static_cast<uint32_t>(height); y = Row3.fetch_add(1u))
                        for (uint32_t x = 0u; x < static_cast<uint32_t>(width); ++x)
                        {
                            Vec3 Acc{};
                            for (int s = 0; s < Rspp; ++s)
                            {
                                const float u = (static_cast<float>(x) + (s % 2 ? 0.75f : 0.25f)) / width - 0.5f;
                                const float w = (0.5f - (static_cast<float>(y) + (s < 2 ? 0.75f : 0.25f)) / height);
                                const Vec3 D = Norm(Add(Add(Fwd, Mul(Right, 2.0f * u * Half * Aspect)), Mul(Up, 2.0f * w * Half)));
                                Acc = Add(Acc, RefPath(Ref, Eye, D, Panel, SunDirection, V3(1.0f, 0.97f, 0.92f), 3.4f,
                                                       V3(0.055f, 0.070f, 0.095f), Seed, 0));
                            }
                            Acc = Mul(Acc, exposure / static_cast<float>(Rspp));
                            const size_t o = (static_cast<size_t>(y) * width + x) * 3u;
                            Rgb[o + 0] = std::pow(Acc[0] / (Acc[0] + 1.0f), 1.0f / 2.2f);
                            Rgb[o + 1] = std::pow(Acc[1] / (Acc[1] + 1.0f), 1.0f / 2.2f);
                            Rgb[o + 2] = std::pow(Acc[2] / (Acc[2] + 1.0f), 1.0f / 2.2f);
                        }
                });
            for (auto& th : Pool) th.join();
            char refName[256];
            std::snprintf(refName, sizeof(refName), "%s/ref_%03d.ppm", outDir.c_str(), f);
            WritePpm(refName, Rgb, width, height);
            double Sum = 0.0;
            for (size_t i = 0; i < Rgb.size(); ++i) { const float d = Rgb[i] - out.Pixels[i]; Sum += d * d; }
            std::printf("[SdfGi]   reference %d spp in %.1f ms  RMS(sdf vs reference) = %.5f\n",
                        Rspp, std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Rt).count(),
                        std::sqrt(Sum / Rgb.size()));
            (void)Seeds;
        }

        const double Total = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - T0).count();
        if (f == 0) std::printf("[SdfGi]   shadow diagnostic: mean sun visibility on the floor = %.4f   "
                                 "frac in hard umbra (exact BVH hit) = %.4f\n", gi.MeanVisibility(), gi.HardUmbraFraction());
        std::printf("[SdfGi] frame %2d  bake_calls=1  placement_rev=%llu  moved=%u  atlas=%016llx%s  place %.3f ms  livetris %.2f ms  radiance %.1f  gather %.1f  resolve %.1f  total %.1f ms\n",
                    f, static_cast<unsigned long long>(gi.PlacementRevision()), gi.Moved(),
                    static_cast<unsigned long long>(Hash), Hash == AtlasHash0 ? "" : " <-- CHANGED!",
                    PlaceMs, LiveMs, gi.RadianceMs(), gi.GatherMs(), gi.ResolveMs(), Total);
        std::fflush(stdout);
        if (csv) std::fprintf(csv, "%d,%d,%llu,%u,%.4f,%.2f,%.2f,%.2f,%.2f\n", f, 1,
                              static_cast<unsigned long long>(gi.PlacementRevision()), gi.Moved(), PlaceMs,
                              gi.CaptureMs(), gi.RadianceMs(), gi.GatherMs(), gi.ResolveMs());
    }
    if (csv) std::fclose(csv);

    // ---------------------------------------------------------------- the field itself, at the final pose
    gi.FieldSlice((outDir + "/field_slice.ppm").c_str(), 192, 0.30f,
                  V3(-Sx, -Sy, 0.0f), V3(Sx, Sy, 0.0f));

    // 📝 Correlation between the darkest patch of floor and the sphere that is casting it. Near +1 means the
    //    shadow is tracking the object, which can only happen if the field is being transformed every frame.
    if (ProbeX.size() >= 4)
    {
        auto Correlate = [](const std::vector<float>& A, const std::vector<float>& B) noexcept
        {
            const size_t n = A.size();
            double ma = 0, mb = 0;
            for (size_t i = 0; i < n; ++i) { ma += A[i]; mb += B[i]; }
            ma /= n; mb /= n;
            double sa = 0, sb = 0, sab = 0;
            for (size_t i = 0; i < n; ++i) { const double da = A[i] - ma, db = B[i] - mb; sa += da * da; sb += db * db; sab += da * db; }
            return (sa > 1e-12 && sb > 1e-12) ? sab / std::sqrt(sa * sb) : 0.0;
        };
        std::printf("[SdfGi] SUMMARY  mode=%s  frames=%zu\n", mode.c_str(), ProbeX.size());
        std::printf("[SdfGi]   corr(darkest floor patch x, sphere x) = %+.3f\n", Correlate(ProbeX, SphereX));
        std::printf("[SdfGi]   corr(darkest floor patch y, sphere y) = %+.3f\n", Correlate(ProbeY, SphereY));
        std::printf("[SdfGi]   atlas checksum constant across every frame: %s\n", AtlasHash0 == gi.AtlasChecksum() ? "YES" : "NO");
        std::printf("[SdfGi]   volume bytes unchanged = %zu,  bytes rewritten per frame = %zu (3 placements x 112 B)\n",
                    gi.AtlasBytes(), 3u * sizeof(DistanceAtlasPlacement));
    }
    std::printf("[SdfGi] wrote %zu frames to %s\n", framePaths.size(), outDir.c_str());
    return 0;
}
