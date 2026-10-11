//============================================================================================================================================
// 📦 Projects/Project-Zero/Source/PathCompareMain.cpp — CPU mirror of the three render paths, side by side
//============================================================================================================================================
//
//    The ReSTIR reference only proves the *integrator*. This tool renders the SAME showcase scene, from the
//    SAME camera, through each of the three paths the engine can actually take, so they can be compared
//    against each other rather than argued about:
//
//        reference   primary ray + exact ray-traced shadow/bounce           (ground truth for the diff metric)
//        sdf         primary ray + SUN SHADOW and SKY OCCLUSION/GI marched
//                    through the BAKED DistanceAtlasSpace volume            (the SDF GI path)
//        raster      z-buffer over the same triangles, lit by sun + moon +
//                    the first N emissive triangles, one COARSE sun shadow
//                    map                                                   (the forward raster path)
//
//    Every path writes a PPM and a timing. The tool also prints RMS / mean|d| of `sdf` and `raster` against
//    `reference`, and bakes a slice image of the distance atlas so the field itself can be looked at.
//
//    Build:  see Projects/Project-Zero/Makefile  (target: PathCompare)

#include "RayTracingSolver.h"
#include "TracingIndex.h"

#include "../../../Engine/GeometricRaster/DistanceAtlasSpace.h"
#include "../../../Engine/GeometricRaster/SceneStructure.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

using namespace Frontier;
using namespace Frontier::ProjectZero;

//============================================================================================================================================
//  Small vector helpers
//============================================================================================================================================
namespace V
{
inline Vector3 Add(Vector3 a, Vector3 b) noexcept { return { a.x + b.x, a.y + b.y, a.z + b.z }; }
inline Vector3 Sub(Vector3 a, Vector3 b) noexcept { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
inline Vector3 Mul(Vector3 a, float s) noexcept { return { a.x * s, a.y * s, a.z * s }; }
inline float   Dot(Vector3 a, Vector3 b) noexcept { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vector3 Mul(Vector3 a, Vector3 b) noexcept { return { a.x * b.x, a.y * b.y, a.z * b.z }; }
inline Vector3 Cross(Vector3 a, Vector3 b) noexcept { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
inline float   Len(Vector3 a) noexcept { return std::sqrt(Dot(a, a)); }
inline Vector3 Norm(Vector3 a) noexcept { const float l = Len(a); return l > 1e-20f ? Mul(a, 1.0f / l) : Vector3{}; }
inline Vector3 Reflect(Vector3 d, Vector3 n) noexcept { return Sub(d, Mul(n, 2.0f * Dot(n, d))); }
} // namespace V

struct Rng
{
    uint32_t s = 0x12345678u;
    float operator()() noexcept { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return static_cast<float>(s) * (1.0f / 4294967296.0f); }
};
static Rng rng;

static Vector3 CosineSample(Vector3 n) noexcept
{
    const float u1 = rng(), u2 = rng();
    const float r = std::sqrt(u1), phi = 6.28318531f * u2;
    const Vector3 t = V::Norm(std::fabs(n.z) < 0.9f ? V::Cross(n, Vector3{ 0, 0, 1 }) : V::Cross(n, Vector3{ 1, 0, 0 }));
    const Vector3 b = V::Cross(n, t);
    return V::Norm(V::Add(V::Add(V::Mul(t, r * std::cos(phi)), V::Mul(b, r * std::sin(phi))), V::Mul(n, std::sqrt(std::max(0.0f, 1.0f - u1)))));
}

//============================================================================================================================================
//  Analytic sky (same shape as the DriveRender reference, so the two tools agree)
//============================================================================================================================================
struct Sky
{
    Vector3 SunDir{ 0, 0, 1 };
    Vector3 SunColour{ 1, 1, 1 };
    float   SunIntensity = 4.0f;
    Vector3 MoonDir{ 0, 0, 1 };
    Vector3 MoonColour{ 0.35f, 0.40f, 0.55f };
    float   MoonIntensity = 0.25f;

    void Place(float sunHour) noexcept
    {
        const float elev = 1.15f * std::cos((sunHour - 12.0f) * (3.14159265f / 12.0f));
        const float azim = (sunHour - 12.0f) * (3.14159265f / 12.0f) - 1.15f;
        const float ce = std::cos(elev), se = std::sin(elev);
        SunDir = V::Norm(Vector3{ -std::sin(azim) * ce, -0.35f * ce, se });
        const float h = std::max(0.0f, SunDir.z);
        const float warm = 1.0f - std::exp(-h * 4.5f);
        SunColour = { 1.0f, 0.55f + 0.42f * warm, 0.22f + 0.75f * warm * warm };
        SunIntensity = 0.25f + 7.5f * warm;
        MoonDir = V::Mul(SunDir, -1.0f);
        MoonIntensity = 0.04f + 0.55f * std::max(0.0f, -std::sin(elev));
    }

    [[nodiscard]] Vector3 Sample(Vector3 d) const noexcept
    {
        const float up = std::max(0.0f, d.z);
        const Vector3 zenith{ 0.16f, 0.30f, 0.66f }, horizon{ 0.62f, 0.68f, 0.78f };
        Vector3 sky = V::Add(V::Mul(horizon, std::pow(1.0f - up, 3.0f)), V::Mul(zenith, std::pow(up, 0.55f)));
        const float sun = std::max(0.0f, V::Dot(d, SunDir));
        sky = V::Add(sky, V::Mul(SunColour, SunIntensity * (std::pow(sun, 1400.0f) * 22.0f + std::pow(sun, 12.0f) * 0.28f)));
        const float moon = std::max(0.0f, V::Dot(d, MoonDir));
        sky = V::Add(sky, V::Mul(MoonColour, MoonIntensity * (std::pow(moon, 4000.0f) * 9.0f + std::pow(moon, 20.0f) * 0.05f)));
        if (d.z < 0.0f) sky = { 0.055f, 0.058f, 0.062f };
        return sky;
    }
};

//============================================================================================================================================
//  Camera
//============================================================================================================================================
struct Camera
{
    Vector3 Eye{}, Target{};
    float   FovYDeg = 60.0f;
    Vector3 Fwd{}, Right{}, Up{};
    void Finish() noexcept
    {
        Fwd = V::Norm(V::Sub(Target, Eye));
        Right = V::Norm(V::Cross(Fwd, Vector3{ 0, 0, 1 }));
        Up = V::Cross(Right, Fwd);
        if (std::fabs(Fwd.z) > 0.999f) { Right = { 0, 1, 0 }; Up = { -Fwd.z, 0, 0 }; }
    }
    [[nodiscard]] Vector3 Ray(float u, float v, float aspect) const noexcept
    {
        const float half = std::tan(0.5f * FovYDeg * (3.14159265f / 180.0f));
        return V::Norm(V::Add(V::Add(Fwd, V::Mul(Right, u * half * aspect)), V::Mul(Up, v * half)));
    }
};

//============================================================================================================================================
//  Uniform grid over the scene: O(1) "which triangle is nearest this point" for SDF-hit albedo lookup
//============================================================================================================================================
class NearestGrid
{
public:
    void Build(const std::vector<TriangleGeometry>& tris, Vector3 lo, Vector3 hi, int res) noexcept
    {
        Lo = lo; Hi = hi; Res = std::max(1, res);
        const Vector3 ext = V::Sub(hi, lo);
        Cell = { ext.x / Res, ext.y / Res, ext.z / Res };
        Cell = { std::max(Cell.x, 1e-4f), std::max(Cell.y, 1e-4f), std::max(Cell.z, 1e-4f) };
        Cells.assign(static_cast<size_t>(Res) * Res * Res, -1);
        Points.assign(static_cast<size_t>(Res) * Res * Res, Vector3{});
        for (size_t t = 0; t < tris.size(); ++t)
        {
            for (int sx = 0; sx <= 1; ++sx) for (int sy = 0; sy <= 1; ++sy) for (int sz = 0; sz <= 1; ++sz)
            {
                // splat the triangle's bounding corners into the cells they cover
                Vector3 a = sx ? Vertex(tris[t], 0) : Vertex(tris[t], 1);
                (void)a;
            }
            const Vector3 va = Vertex(tris[t], 0), vb = Vertex(tris[t], 1), vc = Vertex(tris[t], 2);
            Vector3 mn = { std::min({ va.x, vb.x, vc.x }), std::min({ va.y, vb.y, vc.y }), std::min({ va.z, vb.z, vc.z }) };
            Vector3 mx = { std::max({ va.x, vb.x, vc.x }), std::max({ va.y, vb.y, vc.y }), std::max({ va.z, vb.z, vc.z }) };
            const int x0 = Clamp(static_cast<int>((mn.x - Lo.x) / Cell.x), 0, Res - 1), x1 = Clamp(static_cast<int>((mx.x - Lo.x) / Cell.x), 0, Res - 1);
            const int y0 = Clamp(static_cast<int>((mn.y - Lo.y) / Cell.y), 0, Res - 1), y1 = Clamp(static_cast<int>((mx.y - Lo.y) / Cell.y), 0, Res - 1);
            const int z0 = Clamp(static_cast<int>((mn.z - Lo.z) / Cell.z), 0, Res - 1), z1 = Clamp(static_cast<int>((mx.z - Lo.z) / Cell.z), 0, Res - 1);
            const Vector3 centre = V::Mul(V::Add(va, V::Add(vb, vc)), 1.0f / 3.0f);
            for (int z = z0; z <= z1; ++z) for (int y = y0; y <= y1; ++y) for (int x = x0; x <= x1; ++x)
            {
                const size_t i = Index(x, y, z);
                if (Cells[i] < 0) { Cells[i] = static_cast<int>(t); Points[i] = centre; continue; }
                const Vector3 q = { Lo.x + (x + 0.5f) * Cell.x, Lo.y + (y + 0.5f) * Cell.y, Lo.z + (z + 0.5f) * Cell.z };
                if (V::Len(V::Sub(centre, q)) < V::Len(V::Sub(Points[i], q))) { Cells[i] = static_cast<int>(t); Points[i] = centre; }
            }
        }
    }
    [[nodiscard]] int Lookup(Vector3 p) const noexcept
    {
        const int x = Clamp(static_cast<int>((p.x - Lo.x) / Cell.x), 0, Res - 1);
        const int y = Clamp(static_cast<int>((p.y - Lo.y) / Cell.y), 0, Res - 1);
        const int z = Clamp(static_cast<int>((p.z - Lo.z) / Cell.z), 0, Res - 1);
        return Cells[Index(x, y, z)];
    }
private:
    static Vector3 Vertex(const TriangleGeometry& t, int i) noexcept
    { return i == 0 ? t.VertexAlpha : (i == 1 ? t.VertexBeta : t.VertexGamma); }
    static int Clamp(int v, int a, int b) noexcept { return v < a ? a : (v > b ? b : v); }
    size_t Index(int x, int y, int z) const noexcept
    { return (static_cast<size_t>(z) * Res + y) * static_cast<size_t>(Res) + x; }
    Vector3 Lo{}, Hi{}, Cell{};
    int Res = 1;
    std::vector<int> Cells;
    std::vector<Vector3> Points;
};

//============================================================================================================================================
//  Output
//============================================================================================================================================
struct Image { std::vector<float> Px; int W = 0, H = 0; void Reset(int w, int h) { W = w; H = h; Px.assign(static_cast<size_t>(w) * h * 3, 0.0f); } };

static bool WritePpm(const char* path, const Image& im, float exposure)
{
    FILE* f = std::fopen(path, "wb");
    if (!f) { std::fprintf(stderr, "[PathCompare] cannot write %s\n", path); return false; }
    std::fprintf(f, "P6\n%d %d\n255\n", im.W, im.H);
    std::vector<uint8_t> row(static_cast<size_t>(im.W) * 3);
    for (int y = 0; y < im.H; ++y)
    {
        for (int x = 0; x < im.W; ++x)
        {
            const size_t o = (static_cast<size_t>(y) * im.W + x) * 3;
            for (int c = 0; c < 3; ++c)
            {
                float v = im.Px[o + c] * exposure;
                v = v / (1.0f + v);
                v = std::pow(std::max(0.0f, std::min(1.0f, v)), 1.0f / 2.2f);
                row[static_cast<size_t>(x) * 3 + c] = static_cast<uint8_t>(v * 255.0f + 0.5f);
            }
        }
        std::fwrite(row.data(), 1, row.size(), f);
    }
    std::fclose(f);
    return true;
}

//============================================================================================================================================
//  Statistics
//============================================================================================================================================
struct Counters { long long Samples = 0, Rays = 0; };
static Counters gCounters;

//============================================================================================================================================
//  main
//============================================================================================================================================
int main(int argc, char** argv)
{
    std::string outDir = "Diagnostics/PathCompare";
    int   width = 480, height = 270, spp = 1;
    float sunHour = 17.93f, yaw = 220.0f, pitch = -2.0f;
    int   emissiveLights = 3;             // how many emissive triangles the raster light list may hold
    int   shadowMapRes = 256;             // the raster path's coarse sun shadow map
    float shadowMapSpan = 480.0f;         // metres the shadow map is stretched over (the reported 480 m)
    float voxelSize = 0.0f;               // 0 = let the atlas choose from its budget
    uint32_t atlasBudget = 4u << 20u;
    std::string paths = "raster,sdf,reference";
    std::string scene = "showcase";
    float      focus  = 20.0f;      // [m] only triangles within this radius of the camera enter the SDF volume
    bool  eyeGiven = false, targetGiven = false;
    Vector3 eyeValue{}, targetValue{};

    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        auto f = [&](float def) { return (i + 1 < argc) ? static_cast<float>(std::atof(argv[++i])) : def; };
        if      (a == "--out")     outDir = argv[++i];
        else if (a == "--width")   width = static_cast<int>(f(width));
        else if (a == "--height")  height = static_cast<int>(f(height));
        else if (a == "--spp")     spp = std::max(1, static_cast<int>(f(spp)));
        else if (a == "--sun")     sunHour = f(sunHour);
        else if (a == "--yaw")     yaw = f(yaw);
        else if (a == "--pitch")   pitch = f(pitch);
        else if (a == "--lights")  emissiveLights = std::max(0, static_cast<int>(f(emissiveLights)));
        else if (a == "--shadowres") shadowMapRes = std::max(16, static_cast<int>(f(shadowMapRes)));
        else if (a == "--shadowspan") shadowMapSpan = f(shadowMapSpan);
        else if (a == "--voxel")   voxelSize = f(voxelSize);
        else if (a == "--budget")  atlasBudget = static_cast<uint32_t>(f(static_cast<float>(atlasBudget)));
        else if (a == "--paths")   paths = argv[++i];
        else if (a == "--scene")   scene = argv[++i];
        else if (a == "--focus")   focus = f(focus);
        else if (a == "--eye")     { eyeGiven = true; eyeValue = { f(0), f(0), f(0) }; }
        else if (a == "--target")  { targetGiven = true; targetValue = { f(0), f(0), f(0) }; }
        else std::fprintf(stderr, "[PathCompare] unknown flag %s\n", a.c_str());
    }
    std::filesystem::create_directories(outDir);

    // ---- scene ------------------------------------------------------------------------------------------------
    RayTracingSolver solver;
    auto t0 = std::chrono::steady_clock::now();
    if      (scene == "cornell")  solver.ConstructCornellBoxScene();
    else if (scene == "outdoor")  solver.ConstructOutdoorScene();
    else                          solver.ConstructShowcaseScene();
    const double sceneMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    const auto& tris = solver.QueryTriangles();
    const auto& mats = solver.QueryMaterials();
    std::printf("[PathCompare] showcase scene: %zu triangles, %zu materials, built in %.1f ms\n", tris.size(), mats.size(), sceneMs);

    Vector3 lo{ 1e30f, 1e30f, 1e30f }, hi{ -1e30f, -1e30f, -1e30f };
    for (const TriangleGeometry& t : tris)
        for (const Vector3* p : { &t.VertexAlpha, &t.VertexBeta, &t.VertexGamma })
        {
            lo = { std::min(lo.x, p->x), std::min(lo.y, p->y), std::min(lo.z, p->z) };
            hi = { std::max(hi.x, p->x), std::max(hi.y, p->y), std::max(hi.z, p->z) };
        }
    std::printf("[PathCompare] scene bounds  x[%.1f, %.1f]  y[%.1f, %.1f]  z[%.1f, %.1f]\n", lo.x, hi.x, lo.y, hi.y, lo.z, hi.z);

    // ---- emissive light list (the raster path's budget) -----------------------------------------------------------
    struct Light { Vector3 Pos, Colour; };
    std::vector<Light> allEmissive;
    for (const TriangleGeometry& t : tris)
    {
        const AnalyticalMaterial& m = mats[t.MaterialIndex < mats.size() ? t.MaterialIndex : 0];
        if (m.EmissiveRadiance.x + m.EmissiveRadiance.y + m.EmissiveRadiance.z > 1e-4f)
            allEmissive.push_back({ V::Mul(V::Add(V::Add(t.VertexAlpha, t.VertexBeta), t.VertexGamma), 1.0f / 3.0f), m.EmissiveRadiance });
    }
    std::vector<Light> lightList(allEmissive.begin(), allEmissive.begin() + std::min<size_t>(emissiveLights, allEmissive.size()));
    std::printf("[PathCompare] emissive triangles in scene: %zu   raster light list uses: %zu\n", allEmissive.size(), lightList.size());

    // ---- camera + sky -----------------------------------------------------------------------------------------------
    const float Deg2Rad = 3.14159265f / 180.0f;
    Camera cam;
    if (scene == "cornell")      { cam.Eye = { 0.0f, -1.55f, 1.35f }; cam.Target = { 0.0f, 3.90f, 1.10f }; }
    else if (scene == "outdoor") { cam.Eye = { 0.0f, -14.0f, 2.20f }; }
    else                         { cam.Eye = { 0.0f, -14.0f, 2.20f }; }
    if (eyeGiven)    cam.Eye    = eyeValue;
    if (targetGiven) cam.Target = targetValue;
    else if (scene != "cornell")
    {
        const float cy = std::cos(yaw * Deg2Rad), sy = std::sin(yaw * Deg2Rad);
        const float cp = std::cos(pitch * Deg2Rad), sp = std::sin(pitch * Deg2Rad);
        cam.Target = V::Add(cam.Eye, Vector3{ cp * cy, cp * sy, sp });
    }
    cam.Finish();
    Sky sky; sky.Place(sunHour);
    const float aspect = static_cast<float>(width) / static_cast<float>(height);

    // ---- nearest-triangle grid (albedo lookup for SDF hits) ----------------------------------------------------------
    NearestGrid grid;
    grid.Build(tris, lo, hi, 64);

    // ==============================================================================================================
    //  PATH: reference (exact ray tracing everywhere)
    // ==============================================================================================================
    auto ShadeReference = [&](Vector3 p, Vector3 n, int matIdx) -> Vector3
    {
        const AnalyticalMaterial& m = mats[matIdx < mats.size() ? matIdx : 0];
        Vector3 c = m.EmissiveRadiance;
        const Vector3 o = V::Add(p, V::Mul(n, 2e-3f));
        const float ndl = std::max(0.0f, V::Dot(n, sky.SunDir));
        if (ndl > 0.0f)
        {
            RayStructure r{ o, sky.SunDir, 1e-3f, 1e30f };
            ++gCounters.Rays;
            if (!solver.EvaluateOcclusion(o, V::Add(o, V::Mul(sky.SunDir, 500.0f))))
                c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.SunColour, sky.SunIntensity * ndl)));
        }
        {   // one cosine bounce + sky
            const Vector3 d = CosineSample(n);
            RayStructure r{ o, d, 1e-3f, 1e30f };
            ++gCounters.Rays;
            const HitIntersection h = solver.EvaluateIntersection(r);
            if (h.ValidCondition)
            {
                const AnalyticalMaterial& hm = mats[h.MaterialIndex < mats.size() ? h.MaterialIndex : 0];
                const float hdl = std::max(0.0f, V::Dot(h.SurfaceNormal, sky.SunDir));
                RayStructure sr{ V::Add(h.HitLocation, V::Mul(h.SurfaceNormal, 2e-3f)), sky.SunDir, 1e-3f, 1e30f };
                ++gCounters.Rays;
                const bool lit = !solver.EvaluateOcclusion(sr.SpatialOrigin, V::Add(sr.SpatialOrigin, V::Mul(sky.SunDir, 500.0f)));
                Vector3 bounce = V::Mul(hm.AlbedoColor, lit ? V::Mul(sky.SunColour, sky.SunIntensity * hdl) : Vector3{});
                bounce = V::Add(bounce, V::Mul(hm.AlbedoColor, sky.Sample(d) * 0.8f));
                c = V::Add(c, V::Mul(m.AlbedoColor, bounce));
            }
            else c = V::Add(c, V::Mul(m.AlbedoColor, sky.Sample(d)));
        }
        // a wider sky term so the frame is not dominated by one sample
        for (int k = 0; k < 3; ++k)
        {
            const Vector3 d = CosineSample(n);
            RayStructure r{ o, d, 1e-3f, 1e30f };
            ++gCounters.Rays;
            if (!solver.EvaluateIntersection(r).ValidCondition) c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.Sample(d), 1.0f / 3.0f)));
        }
        return c;
    };

    // ==============================================================================================================
    //  SDF: bake the distance atlas once
    // ==============================================================================================================
    DistanceAtlasSpace atlas;
    DistanceAtlasSettings settings;
    settings.AtlasVoxelBudget = atlasBudget;
    settings.MeshVoxelBudget  = atlasBudget;
    settings.MinimumVoxel     = voxelSize > 0.0f ? voxelSize : 0.02f;
    settings.PaddingVoxels    = 2u;
    settings.ThreadCount      = 0u;

    std::vector<VertexRecord>   verts;
    std::vector<uint32_t>       corners;
    std::vector<InstanceRecord> rows(1);
    verts.reserve(tris.size() * 3);
    corners.reserve(tris.size() * 3);
    uint32_t sdfTriangles = 0u;
    for (const TriangleGeometry& t : tris)
    {
        // The soil plain spans 500 m; baking it at a useful voxel size is impossible. Only geometry near the
        // camera enters the volume, which is exactly the region the SDF GI is asked about.
        const Vector3 c = V::Mul(V::Add(V::Add(t.VertexAlpha, t.VertexBeta), t.VertexGamma), 1.0f / 3.0f);
        if (V::Len(V::Sub(c, cam.Eye)) > focus) continue;
        ++sdfTriangles;
        const uint32_t base = static_cast<uint32_t>(verts.size());
        VertexRecord va{}; va.SpatialLocation = t.VertexAlpha; verts.push_back(va);
        VertexRecord vb{}; vb.SpatialLocation = t.VertexBeta;  verts.push_back(vb);
        VertexRecord vc{}; vc.SpatialLocation = t.VertexGamma; verts.push_back(vc);
        corners.push_back(base); corners.push_back(base + 1u); corners.push_back(base + 2u);
    }
    std::memset(rows[0].World, 0, sizeof(rows[0].World));
    rows[0].World[0] = 1.0f; rows[0].World[5] = 1.0f; rows[0].World[10] = 1.0f; rows[0].World[15] = 1.0f;
    std::memcpy(rows[0].PreviousWorld, rows[0].World, sizeof(rows[0].World));
    rows[0].FirstIndex    = 0u;
    rows[0].TriangleCount = sdfTriangles;
    rows[0].VertexOffset  = 0u;

    t0 = std::chrono::steady_clock::now();
    const bool baked = atlas.Bake(verts, corners, rows, settings);
    const double bakeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    const auto& report = atlas.QueryReport();
    std::printf("[PathCompare] SDF atlas bake: %s  volumes=%u instances=%u voxels=%llu  %.1f ms  voxel[%.3f..%.3f] m\n",
                baked ? "OK" : "FAILED", report.Volumes, report.Instances,
                static_cast<unsigned long long>(report.Voxels), bakeMs, report.FinestVoxel, report.CoarsestVoxel);
    std::printf("[PathCompare] SDF volume input: %u triangles within %.1f m of the camera (of %zu in the scene)\n",
                sdfTriangles, focus, tris.size());
    std::fflush(stdout);

    // Cone-marched visibility through the atlas (this is the SDF GI primitive).
    auto SdfDistance = [&](Vector3 p, float& cell) { float q[3] = { p.x, p.y, p.z }; return atlas.Sample(q, cell); };
    {
        float cell = 1.0f;
        const Vector3 probe{ cam.Eye.x, cam.Eye.y, cam.Eye.z + 1.0f };
        std::printf("[dbg] atlas sample at camera+1m: %.4f (cell %.4f)  placements=%zu atlas=%zu empty=%d\n",
                    SdfDistance(probe, cell), cell, atlas.QueryPlacements().size(), atlas.QueryAtlas().size(), (int)atlas.Empty());
        const auto& pl = atlas.QueryPlacements();
        if (!pl.empty()) std::printf("[dbg] placement0 box[%.2f %.2f %.2f .. %.2f %.2f %.2f] scale=%.3f voxel=%.3f flags=%u dims=%u,%u,%u\n",
            pl[0].BoxMinimum[0], pl[0].BoxMinimum[1], pl[0].BoxMinimum[2],
            pl[0].BoxMaximum[0], pl[0].BoxMaximum[1], pl[0].BoxMaximum[2],
            pl[0].DistanceScale, pl[0].VoxelSize, pl[0].Flags, pl[0].Dimensions[0], pl[0].Dimensions[1], pl[0].Dimensions[2]);
    }

    auto SdfOccluded = [&](Vector3 origin, Vector3 dir, float maxDist, float coneSlope) -> bool
    {
        float t = 0.02f;
        for (int step = 0; step < 96; ++step)
        {
            float cell = 1.0f;
            const float d = SdfDistance(V::Add(origin, V::Mul(dir, t)), cell);
            ++gCounters.Samples;
            const float radius = std::max(cell * 0.5f, coneSlope * t);       // cone widens with distance
            if (d < radius * 0.5f) return true;                              // unshadowed clearance fell inside the cone
            t += std::max(d * 0.85f, cell * 0.5f);
            if (t > maxDist) break;
        }
        return false;
    };

    // SDF GI / sky occlusion: how much of the hemisphere is open, and what does the bounce see
    auto ShadeSdf = [&](Vector3 p, Vector3 n, int matIdx) -> Vector3
    {
        const AnalyticalMaterial& m = mats[matIdx < mats.size() ? matIdx : 0];
        Vector3 c = m.EmissiveRadiance;
        const Vector3 o = V::Add(p, V::Mul(n, 2e-3f));
        const float ndl = std::max(0.0f, V::Dot(n, sky.SunDir));
        if (ndl > 0.0f && !SdfOccluded(o, sky.SunDir, 500.0f, 0.0f))
            c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.SunColour, sky.SunIntensity * ndl)));

        for (int k = 0; k < 4; ++k)
        {
            const Vector3 d = CosineSample(n);
            // march the bounce: does it hit anything, and how far?
            float t = 0.05f; bool hit = false; Vector3 hp{};
            for (int step = 0; step < 64; ++step)
            {
                float cell = 1.0f;
                const float dist = SdfDistance(V::Add(o, V::Mul(d, t)), cell);
                ++gCounters.Samples;
                if (dist < cell * 0.6f) { hit = true; hp = V::Add(o, V::Mul(d, t)); break; }
                t += std::max(dist, cell * 0.5f);
                if (t > 60.0f) break;
            }
            if (hit)
            {
                const int ti = grid.Lookup(hp);
                const AnalyticalMaterial hm = (ti >= 0) ? mats[tris[ti].MaterialIndex < mats.size() ? tris[ti].MaterialIndex : 0] : AnalyticalMaterial{ { 0.5f, 0.5f, 0.5f }, {}, 0.5f, 0.0f, 0u };
                const float hdl = std::max(0.0f, V::Dot(n, sky.SunDir));   // SDF carries no normal: reuse the receiver's
                Vector3 bounce = V::Mul(hm.AlbedoColor, V::Mul(sky.SunColour, sky.SunIntensity * hdl * 0.5f));
                c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(bounce, 0.7f)));
            }
            else c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.Sample(d), 0.7f)));
        }
        return c;
    };

    // ==============================================================================================================
    //  PATH: raster — z-buffer over the same triangles, coarse sun shadow map, short emissive light list
    // ==============================================================================================================
    std::vector<float> shadowDepth;
    {
        // one orthographic shadow map over `shadowMapSpan` metres looking down the sun direction
        shadowDepth.assign(static_cast<size_t>(shadowMapRes) * shadowMapRes, 1e30f);
        const Vector3 fwd = sky.SunDir;
        const Vector3 up0 = V::Norm(std::fabs(fwd.z) < 0.9f ? Vector3{ 0, 0, 1 } : Vector3{ 1, 0, 0 });
        const Vector3 right = V::Norm(V::Cross(fwd, up0));
        const Vector3 up = V::Cross(right, fwd);
        const Vector3 centre = V::Mul(V::Add(lo, hi), 0.5f);
        const float half = shadowMapSpan * 0.5f;
        for (const TriangleGeometry& t : tris)
        {
            const Vector3 P[3] = { t.VertexAlpha, t.VertexBeta, t.VertexGamma };
            float s[3][2]; float d[3];
            for (int i = 0; i < 3; ++i)
            {
                const Vector3 r = V::Sub(P[i], centre);
                s[i][0] = V::Dot(r, right) / half;
                s[i][1] = V::Dot(r, up) / half;
                d[i] = V::Dot(r, fwd);
            }
            const int x0 = std::max(0, static_cast<int>((std::min({ s[0][0], s[1][0], s[2][0] }) * 0.5f + 0.5f) * shadowMapRes));
            const int x1 = std::min(shadowMapRes - 1, static_cast<int>((std::max({ s[0][0], s[1][0], s[2][0] }) * 0.5f + 0.5f) * shadowMapRes));
            const int y0 = std::max(0, static_cast<int>((std::min({ s[0][1], s[1][1], s[2][1] }) * 0.5f + 0.5f) * shadowMapRes));
            const int y1 = std::min(shadowMapRes - 1, static_cast<int>((std::max({ s[0][1], s[1][1], s[2][1] }) * 0.5f + 0.5f) * shadowMapRes));
            for (int y = y0; y <= y1; ++y) for (int x = x0; x <= x1; ++x)
            {
                const float u = (x + 0.5f) / shadowMapRes * 2.0f - 1.0f;
                const float v = (y + 0.5f) / shadowMapRes * 2.0f - 1.0f;
                const float den = (s[1][1] - s[2][1]) * (s[0][0] - s[2][0]) + (s[2][0] - s[1][0]) * (s[0][1] - s[2][1]);
                if (std::fabs(den) < 1e-12f) continue;
                const float w0 = ((s[1][1] - s[2][1]) * (u - s[2][0]) + (s[2][0] - s[1][0]) * (v - s[2][1])) / den;
                const float w1 = ((s[2][1] - s[0][1]) * (u - s[2][0]) + (s[0][0] - s[2][0]) * (v - s[2][1])) / den;
                const float w2 = 1.0f - w0 - w1;
                if (w0 < 0.0f || w1 < 0.0f || w2 < 0.0f) continue;
                const float depth = w0 * d[0] + w1 * d[1] + w2 * d[2];
                float& slot = shadowDepth[static_cast<size_t>(y) * shadowMapRes + x];
                if (depth < slot) slot = depth;
            }
        }
    }

    Image outRaster, outSdf, outRef;
    const bool doRaster = paths.find("raster") != std::string::npos;
    const bool doSdf    = paths.find("sdf") != std::string::npos;
    const bool doRef    = paths.find("reference") != std::string::npos;
    if (doRaster) outRaster.Reset(width, height);
    if (doSdf)    outSdf.Reset(width, height);
    if (doRef)    outRef.Reset(width, height);

    // ---------------- raster pass ---------------------------------------------------------------------------------
    double rasterMs = 0.0;
    if (doRaster)
    {
        t0 = std::chrono::steady_clock::now();
        std::vector<float> depth(static_cast<size_t>(width) * height, 1e30f);
        std::vector<int>   triAt(static_cast<size_t>(width) * height, -1);
        for (const TriangleGeometry& t : tris)
        {
            const Vector3 P[3] = { t.VertexAlpha, t.VertexBeta, t.VertexGamma };
            float sc[3][2]; float dc[3]; bool any = false;
            for (int i = 0; i < 3; ++i)
            {
                const Vector3 r = V::Sub(P[i], cam.Eye);
                dc[i] = V::Dot(r, cam.Fwd);
                if (dc[i] <= 0.02f) { any = true; }
                sc[i][0] = V::Dot(r, cam.Right) / (dc[i] * std::tan(0.5f * cam.FovYDeg * (3.14159265f / 180.0f)) * aspect);
                sc[i][1] = V::Dot(r, cam.Up)    / (dc[i] * std::tan(0.5f * cam.FovYDeg * (3.14159265f / 180.0f)));
            }
            if (any) continue;                       // no near-plane clipping: skip triangles straddling it
            const int x0 = std::max(0, static_cast<int>((std::min({ sc[0][0], sc[1][0], sc[2][0] }) * 0.5f + 0.5f) * width));
            const int x1 = std::min(width - 1,  static_cast<int>((std::max({ sc[0][0], sc[1][0], sc[2][0] }) * 0.5f + 0.5f) * width));
            const int y0 = std::max(0, static_cast<int>((0.5f - std::max({ sc[0][1], sc[1][1], sc[2][1] }) * 0.5f) * height));
            const int y1 = std::min(height - 1, static_cast<int>((0.5f - std::min({ sc[0][1], sc[1][1], sc[2][1] }) * 0.5f) * height));
            for (int y = y0; y <= y1; ++y) for (int x = x0; x <= x1; ++x)
            {
                const float u = (x + 0.5f) / width * 2.0f - 1.0f;
                const float v = 1.0f - (y + 0.5f) / height * 2.0f;
                const float den = (sc[1][1] - sc[2][1]) * (sc[0][0] - sc[2][0]) + (sc[2][0] - sc[1][0]) * (sc[0][1] - sc[2][1]);
                if (std::fabs(den) < 1e-12f) continue;
                const float w0 = ((sc[1][1] - sc[2][1]) * (u - sc[2][0]) + (sc[2][0] - sc[1][0]) * (v - sc[2][1])) / den;
                const float w1 = ((sc[2][1] - sc[0][1]) * (u - sc[2][0]) + (sc[0][0] - sc[2][0]) * (v - sc[2][1])) / den;
                const float w2 = 1.0f - w0 - w1;
                if (w0 < 0.0f || w1 < 0.0f || w2 < 0.0f) continue;
                const float z = w0 * dc[0] + w1 * dc[1] + w2 * dc[2];
                const size_t o = static_cast<size_t>(y) * width + x;
                if (z < depth[o]) { depth[o] = z; triAt[o] = static_cast<int>(t.TriangleIndex); }
            }
        }

        // shade
        const Vector3 centre = V::Mul(V::Add(lo, hi), 0.5f);
        const Vector3 fwd = sky.SunDir;
        const Vector3 up0 = V::Norm(std::fabs(fwd.z) < 0.9f ? Vector3{ 0, 0, 1 } : Vector3{ 1, 0, 0 });
        const Vector3 sRight = V::Norm(V::Cross(fwd, up0));
        const Vector3 sUp = V::Cross(sRight, fwd);
        const float half = shadowMapSpan * 0.5f;
        for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x)
        {
            const size_t o = static_cast<size_t>(y) * width + x;
            const int ti = triAt[o];
            const size_t p = o * 3;
            if (ti < 0) { const Vector3 d = cam.Ray((x + 0.5f) / width * 2.0f - 1.0f, 1.0f - (y + 0.5f) / height * 2.0f, aspect);
                          const Vector3 s = sky.Sample(d); outRaster.Px[p] = s.x; outRaster.Px[p+1] = s.y; outRaster.Px[p+2] = s.z; continue; }
            const TriangleGeometry& t = tris[ti];
            const AnalyticalMaterial& m = mats[t.MaterialIndex < mats.size() ? t.MaterialIndex : 0];
            Vector3 n = t.SurfaceNormal;
            if (V::Dot(n, V::Sub(cam.Eye, t.VertexAlpha)) < 0.0f) n = V::Mul(n, -1.0f);
            const Vector3 hit = V::Add(cam.Eye, V::Mul(cam.Ray((x + 0.5f) / width * 2.0f - 1.0f, 1.0f - (y + 0.5f) / height * 2.0f, aspect), depth[o]));
            Vector3 c = m.EmissiveRadiance;

            // sun + coarse shadow map
            const float ndl = std::max(0.0f, V::Dot(n, sky.SunDir));
            if (ndl > 0.0f)
            {
                const Vector3 r = V::Sub(V::Add(hit, V::Mul(n, 0.02f)), centre);
                const float su = V::Dot(r, sRight) / half, sv = V::Dot(r, sUp) / half, sd = V::Dot(r, fwd);
                const int sx = std::clamp(static_cast<int>((su * 0.5f + 0.5f) * shadowMapRes), 0, shadowMapRes - 1);
                const int sy2 = std::clamp(static_cast<int>((sv * 0.5f + 0.5f) * shadowMapRes), 0, shadowMapRes - 1);
                const float bias = 0.05f;
                if (sd - bias <= shadowDepth[static_cast<size_t>(sy2) * shadowMapRes + sx])
                    c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.SunColour, sky.SunIntensity * ndl)));
            }
            // moon
            const float ndm = std::max(0.0f, V::Dot(n, sky.MoonDir));
            c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(sky.MoonColour, sky.MoonIntensity * ndm)));
            // the short emissive light list — no shadowing, no GI
            for (const Light& L : lightList)
            {
                const Vector3 d = V::Sub(L.Pos, hit);
                const float dist2 = std::max(0.05f, V::Dot(d, d));
                const float lam = std::max(0.0f, V::Dot(n, V::Mul(d, 1.0f / std::sqrt(dist2))));
                c = V::Add(c, V::Mul(m.AlbedoColor, V::Mul(L.Colour, lam / dist2)));
            }
            // flat ambient, because the raster path has no GI
            c = V::Add(c, V::Mul(m.AlbedoColor, Vector3{ 0.055f, 0.075f, 0.11f }));
            outRaster.Px[p] = c.x; outRaster.Px[p+1] = c.y; outRaster.Px[p+2] = c.z;
        }
        rasterMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    }

    // ---------------- the two ray-cast passes ----------------------------------------------------------------------
    auto TracePass = [&](Image& img, bool useSdf, double& outMs)
    {
        t0 = std::chrono::steady_clock::now();
        gCounters = {};
        for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x)
        {
            Vector3 acc{};
            for (int s = 0; s < spp; ++s)
            {
                const float u = (x + (s % 2 ? 0.75f : 0.25f)) / width * 2.0f - 1.0f;
                const float v = 1.0f - (y + (s >= 2 ? 0.75f : 0.25f)) / height * 2.0f;
                const Vector3 d = cam.Ray(u, v, aspect);
                RayStructure r{ cam.Eye, d, 1e-3f, 1e30f };
                const HitIntersection h = solver.EvaluateIntersection(r);
                if (!h.ValidCondition) { Vector3 sv = sky.Sample(d); acc = V::Add(acc, sv); continue; }
                Vector3 n = h.SurfaceNormal;
                if (V::Dot(n, d) > 0.0f) n = V::Mul(n, -1.0f);
                acc = V::Add(acc, useSdf ? ShadeSdf(h.HitLocation, n, static_cast<int>(h.MaterialIndex))
                                         : ShadeReference(h.HitLocation, n, static_cast<int>(h.MaterialIndex)));
            }
            const size_t o = (static_cast<size_t>(y) * width + x) * 3;
            img.Px[o] = acc.x / spp; img.Px[o+1] = acc.y / spp; img.Px[o+2] = acc.z / spp;
        }
        outMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    };

    double sdfMs = 0.0, refMs = 0.0;
    long long sdfSamples = 0;
    if (doSdf) { TracePass(outSdf, true, sdfMs); sdfSamples = gCounters.Samples; }
    if (doRef) TracePass(outRef, false, refMs);

    // ---------------- write + compare ---------------------------------------------------------------------------------
    if (doRaster) WritePpm((outDir + "/raster.ppm").c_str(), outRaster, 1.25f);
    if (doSdf)    WritePpm((outDir + "/sdf.ppm").c_str(), outSdf, 1.25f);
    if (doRef)    WritePpm((outDir + "/reference.ppm").c_str(), outRef, 1.25f);

    auto Diff = [&](const Image& a, const Image& b, const char* name)
    {
        if (a.Px.empty() || b.Px.empty()) return;
        double sum = 0.0, sumAbs = 0.0; double worst = 0.0;
        for (size_t i = 0; i < a.Px.size(); ++i) { const double d = a.Px[i] - b.Px[i]; sum += d * d; sumAbs += std::fabs(d); worst = std::max(worst, std::fabs(d)); }
        const double n = static_cast<double>(a.Px.size());
        std::printf("[PathCompare] %-16s vs reference:  RMS = %.5f   mean|d| = %.5f   max|d| = %.4f\n",
                    name, std::sqrt(sum / n), sumAbs / n, worst);
    };
    if (doSdf)    Diff(outSdf, outRef, "sdf");
    if (doRaster) Diff(outRaster, outRef, "raster");

    // ---------------- an image of the field itself ----------------------------------------------------------------------
    {
        Image slice; slice.Reset(256, 256);
        const auto& pl0 = atlas.QueryPlacements();
        Vector3 slo = lo, shi = hi;
        if (!pl0.empty())
        {
            slo = { pl0[0].BoxMinimum[0], pl0[0].BoxMinimum[1], pl0[0].BoxMinimum[2] };
            shi = { pl0[0].BoxMaximum[0], pl0[0].BoxMaximum[1], pl0[0].BoxMaximum[2] };
        }
        const float z = slo.z + (shi.z - slo.z) * 0.18f;
        float mn = 1e30f, mx = 0.0f;
        std::vector<float> field(256 * 256);
        for (int y = 0; y < 256; ++y) for (int x = 0; x < 256; ++x)
        {
            const Vector3 p{ slo.x + (shi.x - slo.x) * (x + 0.5f) / 256.0f,
                             slo.y + (shi.y - slo.y) * (y + 0.5f) / 256.0f, z };
            float cell = 1.0f;
            const float d = SdfDistance(p, cell);
            field[y * 256 + x] = d;
            mn = std::min(mn, d); mx = std::max(mx, d);
        }
        for (int y = 0; y < 256; ++y) for (int x = 0; x < 256; ++x)
        {
            const float t = (field[y * 256 + x] - mn) / std::max(1e-6f, mx - mn);
            const size_t o = (static_cast<size_t>(y) * 256 + x) * 3;
            float r = 1.0f - t, g = t * 0.8f, b = 0.25f + 0.5f * t;
            slice.Px[o] = r * r; slice.Px[o+1] = g * g; slice.Px[o+2] = b * b;
        }
        WritePpm((outDir + "/sdf_slice_z.ppm").c_str(), slice, 1.0f);
        std::printf("[PathCompare] distance slice at z=%.2f m: distance range [%.3f, %.3f] m\n", z, mn, mx);
    }

    std::printf("[PathCompare] timings @ %dx%d, %d spp  |  raster %.1f ms   sdf %.1f ms (%.2f M samples)   reference %.1f ms   bake %.1f ms\n",
                width, height, spp, rasterMs, sdfMs, sdfSamples / 1e6, refMs, bakeMs);
    std::fflush(stdout);
    return 0;
}
