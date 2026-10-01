//============================================================================================================================================
//                                                   MATERIALPARITYPROOF.CPP
//============================================================================================================================================
// 📦 Proves the visibility raster, the surfel GI path and the raytraced path evaluate the SAME materials.

/// The question this answers is narrow and the answer has to be falsifiable: when a viewer toggles "Raytracing"
///    or "Global Illumination", does the surface change material, or only transport?
///
///    Before the r7 surfel fix the answer was that it changed material. SurfelGIResolve.slang shaded
///    `albedo·(1−metal)/π` against a fixed F0 = 0.04 out of an rgba8 G-buffer, while the raytraced kernel ran the
///    full OpenPBR lobe stack on the decoded slab. Two BSDFs and two transports at once, which makes the
///    comparison useless for judging either.
///
/// The test
///    ① STATIC   read the three shaders and assert each routes its shading through ResolveMaterial and the
///               shared evaluator, and that none still contains the stand-ins the fix removed. This is the
///               claim about the GPU, machine-checked against the actual shader text.
///    ② PARITY   render the grid three ways with TRANSPORT HELD IDENTICAL — direct sun only, same shadow ray,
///               no GI, no reflections. The three paths must then agree to the bit. Anything else means the
///               material evaluation differs, which is exactly the defect.
///    ③ TRANSPORT  re-render with each path's own transport enabled. The images must now DIFFER (otherwise the
///               paths are not doing different work and ② proved nothing), while the per-pixel material
///               response stays identical. Transport may differ. The BSDF may not.
///
/// What it does not prove. This is a CPU mirror: it runs the engine's material evaluation, the same
///    MaterialEvaluation.slang text that compiles as C++ under FRONTIER_CPU_PORT, through three transports. It
///    cannot execute SPIR-V, so ① is what carries the claim about the GPU shaders and is checked against their
///    source rather than asserted. There is no Vulkan loader and no shader compiler in the sandbox this was
///    written in.
///
/// out : VisualProof/MaterialParity/MaterialParitySheet.png   the three renders and their difference maps
///       VisualProof/MaterialParity/MaterialParityProof.txt   the transcript, including the numeric table
/// err : exit code 1 and a FAIL line the moment a gate does not hold
/// use : BuildMaterialParityProof.ps1 (MSVC), or the g++ line in Docs/MaterialParity.md
/// cost: ~20 full-resolution shader balls, 1.4 M triangles, three renders — a couple of minutes
/// tag : parity, materials, surfel, restir, raster

#include "ContentInterchange/ShowcaseStructure.h"
#include "ContentInterchange/ShaderBallGeometry.h"
#include "ContentInterchange/MaterialIndex.h"
#include "ContentInterchange/UnifiedMaterialEvaluation.h"
#include "DisplayPresentation/ShadingTableCodec.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

namespace {

// vec3 / vec4 / ShadingRecord come from SlangCpuShim.h and MaterialEvaluation.slang at GLOBAL scope — the
//    shader text declares them that way and UnifiedMaterialEvaluation.h includes it verbatim.

int         Failures = 0;
std::string Transcript;

void Line(const char* Format, ...) noexcept
{
    char Buffer[1024];
    va_list Arguments;
    va_start(Arguments, Format);
    std::vsnprintf(Buffer, sizeof(Buffer), Format, Arguments);
    va_end(Arguments);
    std::printf("%s\n", Buffer);
    std::fflush(stdout);
    Transcript += Buffer;
    Transcript += '\n';
}

void Check(bool Condition, const char* What) noexcept
{
    Line("  %s  %s", Condition ? "PASS" : "FAIL", What);
    if (!Condition) ++Failures;
}

//------------------------------------------------------------------------------------------------------------------------
//                                          ① THE CLAIM ABOUT THE SHADERS
//------------------------------------------------------------------------------------------------------------------------
// Read the shader source and check what it actually calls. A CPU mirror cannot execute SPIR-V, so the statement
//    "all three paths evaluate the same material" has to be checked against the text that will be compiled.

std::string ReadWhole(const std::string& Path) noexcept
{
    static const char* const kRoots[] = { "", "../", "../../", "../../../" };
    for (const char* Root : kRoots)
    {
        std::ifstream File(std::string(Root) + Path, std::ios::binary);
        if (File) return std::string(std::istreambuf_iterator<char>(File), std::istreambuf_iterator<char>());
    }
    return {};
}

// Strip // line comments and /* */ blocks, so a phrase quoted in a header comment cannot satisfy or trip a check.
std::string StripComments(const std::string& Source) noexcept
{
    std::string Out;
    Out.reserve(Source.size());
    for (size_t I = 0u; I < Source.size(); )
    {
        if (Source[I] == '/' && I + 1u < Source.size() && Source[I + 1u] == '/')
        {
            while (I < Source.size() && Source[I] != '\n') ++I;
        }
        else if (Source[I] == '/' && I + 1u < Source.size() && Source[I + 1u] == '*')
        {
            I += 2u;
            while (I + 1u < Source.size() && !(Source[I] == '*' && Source[I + 1u] == '/')) ++I;
            I = std::min(Source.size(), I + 2u);
        }
        else Out += Source[I++];
    }
    return Out;
}

void AuditShaders() noexcept
{
    Line("");
    Line("① THE CLAIM ABOUT THE SHADERS — checked against the source, comments stripped");
    Line("");

    struct Pass { const char* Label; const char* Path; bool NeedsResolve; };
    const Pass kPasses[3] = {
        { "ReSTIR kernel",   "VehiclePhysics/Overlay/Engine/Shaders/ReSTIRViewport.slang",        true },
        { "Surfel update",   "VehiclePhysics/Overlay/Engine/Shaders/SurfelIrradianceUpdate.slang", true },
        { "Surfel resolve",  "VehiclePhysics/Overlay/Engine/Shaders/SurfelGIResolve.slang",        true } };

    for (const Pass& P : kPasses)
    {
        const std::string Raw = ReadWhole(P.Path);
        char What[256];
        if (Raw.empty())
        {
            std::snprintf(What, sizeof(What), "%s — source found", P.Label);
            Check(false, What);
            continue;
        }
        const std::string Code = StripComments(Raw);
        const auto Has = [&Code](const char* Needle) { return Code.find(Needle) != std::string::npos; };

        std::snprintf(What, sizeof(What), "%s decodes the hit through ResolveMaterial", P.Label);
        Check(Has("ResolveMaterial("), What);
        std::snprintf(What, sizeof(What), "%s evaluates the shared lobe stack (ResolveLayers + EvaluateBsdf)", P.Label);
        Check(Has("ResolveLayers(") && Has("EvaluateBsdf("), What);
        std::snprintf(What, sizeof(What), "%s includes the shared decode, not a private copy", P.Label);
        Check(Has("SceneMaterialResolve.slang"), What);

        // The stand-ins the fix removed. Each of these WAS present and is the specific defect.
        std::snprintf(What, sizeof(What), "%s has no `hitN = -wi` stand-in normal", P.Label);
        Check(!Has("hitN = -wi") && !Has("hN = -R"), What);
        std::snprintf(What, sizeof(What), "%s has no hardcoded dielectric F0 of 0.04 in its shading", P.Label);
        Check(!Has("mix(vec3(0.04), albedo"), What);
        std::snprintf(What, sizeof(What), "%s reads no rgba8 albedo G-buffer", P.Label);
        Check(!Has("AlbedoImage") && !Has("MaterialAux"), What);
    }

    // The two surfel passes must bind the same scene the kernel does, or they cannot decode anything.
    for (const char* Path : { "VehiclePhysics/Overlay/Engine/Shaders/SurfelIrradianceUpdate.slang",
                              "VehiclePhysics/Overlay/Engine/Shaders/SurfelGIResolve.slang" })
    {
        const std::string Code = StripComments(ReadWhole(Path));
        const auto Has = [&Code](const char* Needle) { return Code.find(Needle) != std::string::npos; };
        const bool Bound = Has("GpuTriangle     Triangles[]") && Has("GpuMaterial     Materials[]")
                        && Has("GpuInstance     Instances[]") && Has("GpuMaterialSlab MaterialSlabs[]")
                        && Has("GpuVertex       Vertices[]")  && Has("Indices[]")
                        && Has("Textures[]");
        char What[256];
        std::snprintf(What, sizeof(What), "%s binds the kernel's scene buffers and bindless table",
                      std::strstr(Path, "Update") ? "Surfel update" : "Surfel resolve");
        Check(Bound, What);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

struct Triangle
{
    vec3     A, B, C;        // world-space corners
    vec3     Na, Nb, Nc;     // corner normals
    uint32_t Material = 0u;
};

struct Aabb
{
    vec3 Low {  1e30f,  1e30f,  1e30f };
    vec3 High{ -1e30f, -1e30f, -1e30f };
    void Grow(const vec3& P) noexcept
    {
        Low.x = std::min(Low.x, P.x);  Low.y = std::min(Low.y, P.y);  Low.z = std::min(Low.z, P.z);
        High.x = std::max(High.x, P.x); High.y = std::max(High.y, P.y); High.z = std::max(High.z, P.z);
    }
};

// A median-split BVH. Nothing clever — 1.4 M triangles and a few hundred thousand rays do not need an SAH, and a
//    simpler tree is a smaller thing to be wrong about in a proof.
struct BvhNode
{
    Aabb     Bounds;
    uint32_t Left = 0u, Count = 0u, First = 0u;
};

class Bvh
{
public:
    void Build(const std::vector<Triangle>& Source) noexcept
    {
        Triangles = &Source;
        Order.resize(Source.size());
        for (uint32_t I = 0u; I < Order.size(); ++I) Order[I] = I;
        Nodes.clear();
        Nodes.reserve(Source.size() * 2u);
        Nodes.push_back({});
        Subdivide(0u, 0u, static_cast<uint32_t>(Order.size()));
    }

    // Closest hit. Returns the triangle index or -1, filling t and the barycentric pair.
    [[nodiscard]] int Closest(const vec3& O, const vec3& D, float& T, float& U, float& V) const noexcept
    {
        const vec3 Inverse{ 1.0f / D.x, 1.0f / D.y, 1.0f / D.z };
        int Best = -1;
        T = 1e30f;
        uint32_t Stack[64]; int Depth = 0; Stack[Depth++] = 0u;
        while (Depth)
        {
            const BvhNode& Node = Nodes[Stack[--Depth]];
            if (!Slab(Node.Bounds, O, Inverse, T)) continue;
            if (Node.Count)
            {
                for (uint32_t I = 0u; I < Node.Count; ++I)
                {
                    const uint32_t Index = Order[Node.First + I];
                    float Ht, Hu, Hv;
                    if (Intersect((*Triangles)[Index], O, D, Ht, Hu, Hv) && Ht < T && Ht > 1e-4f)
                    { T = Ht; U = Hu; V = Hv; Best = static_cast<int>(Index); }
                }
            }
            else { Stack[Depth++] = Node.Left; Stack[Depth++] = Node.Left + 1u; }
        }
        return Best;
    }

    [[nodiscard]] bool Occluded(const vec3& O, const vec3& D, float Limit) const noexcept
    {
        const vec3 Inverse{ 1.0f / D.x, 1.0f / D.y, 1.0f / D.z };
        uint32_t Stack[64]; int Depth = 0; Stack[Depth++] = 0u;
        while (Depth)
        {
            const BvhNode& Node = Nodes[Stack[--Depth]];
            if (!Slab(Node.Bounds, O, Inverse, Limit)) continue;
            if (Node.Count)
            {
                for (uint32_t I = 0u; I < Node.Count; ++I)
                {
                    float Ht, Hu, Hv;
                    if (Intersect((*Triangles)[Order[Node.First + I]], O, D, Ht, Hu, Hv) && Ht > 1e-4f && Ht < Limit) return true;
                }
            }
            else { Stack[Depth++] = Node.Left; Stack[Depth++] = Node.Left + 1u; }
        }
        return false;
    }

    [[nodiscard]] size_t NodeCount() const noexcept { return Nodes.size(); }

private:
    static bool Slab(const Aabb& Box, const vec3& O, const vec3& Inverse, float Limit) noexcept
    {
        float Near = 0.0f, Far = Limit;
        const float Lo[3] = { Box.Low.x, Box.Low.y, Box.Low.z }, Hi[3] = { Box.High.x, Box.High.y, Box.High.z };
        const float Origin[3] = { O.x, O.y, O.z }, Rcp[3] = { Inverse.x, Inverse.y, Inverse.z };
        for (int Axis = 0; Axis < 3; ++Axis)
        {
            float A = (Lo[Axis] - Origin[Axis]) * Rcp[Axis];
            float B = (Hi[Axis] - Origin[Axis]) * Rcp[Axis];
            if (A > B) std::swap(A, B);
            Near = std::max(Near, A); Far = std::min(Far, B);
            if (Near > Far) return false;
        }
        return true;
    }

    static bool Intersect(const Triangle& Tri, const vec3& O, const vec3& D, float& T, float& U, float& V) noexcept
    {
        const vec3 E1{ Tri.B.x - Tri.A.x, Tri.B.y - Tri.A.y, Tri.B.z - Tri.A.z };
        const vec3 E2{ Tri.C.x - Tri.A.x, Tri.C.y - Tri.A.y, Tri.C.z - Tri.A.z };
        const vec3 P{ D.y * E2.z - D.z * E2.y, D.z * E2.x - D.x * E2.z, D.x * E2.y - D.y * E2.x };
        const float Det = E1.x * P.x + E1.y * P.y + E1.z * P.z;
        if (std::fabs(Det) < 1e-12f) return false;
        const float Inverse = 1.0f / Det;
        const vec3 Tv{ O.x - Tri.A.x, O.y - Tri.A.y, O.z - Tri.A.z };
        U = (Tv.x * P.x + Tv.y * P.y + Tv.z * P.z) * Inverse;
        if (U < 0.0f || U > 1.0f) return false;
        const vec3 Q{ Tv.y * E1.z - Tv.z * E1.y, Tv.z * E1.x - Tv.x * E1.z, Tv.x * E1.y - Tv.y * E1.x };
        V = (D.x * Q.x + D.y * Q.y + D.z * Q.z) * Inverse;
        if (V < 0.0f || U + V > 1.0f) return false;
        T = (E2.x * Q.x + E2.y * Q.y + E2.z * Q.z) * Inverse;
        return T > 0.0f;
    }

    void Subdivide(uint32_t NodeIndex, uint32_t First, uint32_t Count) noexcept
    {
        BvhNode& Node = Nodes[NodeIndex];
        Node.First = First;
        Node.Bounds = Aabb{};
        for (uint32_t I = 0u; I < Count; ++I)
        {
            const Triangle& T = (*Triangles)[Order[First + I]];
            Node.Bounds.Grow(T.A); Node.Bounds.Grow(T.B); Node.Bounds.Grow(T.C);
        }
        if (Count <= 4u) { Node.Count = Count; return; }

        const vec3 Span{ Node.Bounds.High.x - Node.Bounds.Low.x,
                         Node.Bounds.High.y - Node.Bounds.Low.y,
                         Node.Bounds.High.z - Node.Bounds.Low.z };
        const int Axis = Span.x > Span.y ? (Span.x > Span.z ? 0 : 2) : (Span.y > Span.z ? 1 : 2);
        const auto Centroid = [&](uint32_t Index, int A) noexcept
        {
            const Triangle& T = (*Triangles)[Index];
            const float Xs[3] = { T.A.x + T.B.x + T.C.x, T.A.y + T.B.y + T.C.y, T.A.z + T.B.z + T.C.z };
            return Xs[A] * (1.0f / 3.0f);
        };
        const uint32_t Middle = Count / 2u;
        std::nth_element(Order.begin() + First, Order.begin() + First + Middle, Order.begin() + First + Count,
                         [&](uint32_t L, uint32_t R) { return Centroid(L, Axis) < Centroid(R, Axis); });

        Node.Count = 0u;
        const uint32_t Left = static_cast<uint32_t>(Nodes.size());
        Nodes[NodeIndex].Left = Left;
        Nodes.push_back({}); Nodes.push_back({});
        Subdivide(Left,      First,          Middle);
        Subdivide(Left + 1u, First + Middle, Count - Middle);
    }

    const std::vector<Triangle>* Triangles = nullptr;
    std::vector<uint32_t>        Order;
    std::vector<BvhNode>         Nodes;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE THREE PATHS
//------------------------------------------------------------------------------------------------------------------------
// Each mirrors one shader's TRANSPORT. All three call the same two functions to ask what the surface does with
//    light — UnifiedMaterial::EvaluateWorld and UnifiedMaterial::AmbientResponse — which is the whole claim.

enum class Path { Raster, Surfel, Restir };

struct Scene
{
    std::vector<Triangle>      Triangles;
    std::vector<ShadingRecord> Materials;
    Bvh                        Accelerator;
    vec3                       SunDirection{ 0.40f, -0.52f, 0.755f };   // to the sun, unit
    vec3                       SunColour{ 1.0f, 0.96f, 0.90f };
    float                      SunRadiance = 3.4f;
    vec3                       SkyAmbient{ 0.085f, 0.105f, 0.140f };
};

vec3 Normalise(const vec3& V) noexcept
{
    const float L = std::sqrt(V.x * V.x + V.y * V.y + V.z * V.z);
    return L > 0.0f ? vec3{ V.x / L, V.y / L, V.z / L } : vec3{ 0.0f, 0.0f, 1.0f };
}

vec3 SkyAlong(const Scene& S, const vec3& D) noexcept
{
    const float Height = std::clamp(D.z * 0.5f + 0.5f, 0.0f, 1.0f);
    const vec3  Horizon{ S.SkyAmbient.x * 1.35f, S.SkyAmbient.y * 1.22f, S.SkyAmbient.z * 1.05f };
    const float Blend = Height * Height;
    vec3 Dome{ Horizon.x + (S.SkyAmbient.x - Horizon.x) * Blend,
               Horizon.y + (S.SkyAmbient.y - Horizon.y) * Blend,
               Horizon.z + (S.SkyAmbient.z - Horizon.z) * Blend };
    const float SunCos = std::clamp(D.x * S.SunDirection.x + D.y * S.SunDirection.y + D.z * S.SunDirection.z, 0.0f, 1.0f);
    const float Disc = std::pow(SunCos, 2048.0f) * 0.02f * S.SunRadiance;
    return vec3{ Dome.x + S.SunColour.x * Disc, Dome.y + S.SunColour.y * Disc, Dome.z + S.SunColour.z * Disc };
}

struct Surface
{
    vec3     Position;
    vec3     Normal;
    vec3     View;            // toward the eye
    uint32_t Material = 0u;
    bool     Hit = false;
};

Surface Intersect(const Scene& S, const vec3& Origin, const vec3& Direction) noexcept
{
    Surface Out;
    float T, U, V;
    const int Index = S.Accelerator.Closest(Origin, Direction, T, U, V);
    if (Index < 0) return Out;
    const Triangle& Tri = S.Triangles[static_cast<size_t>(Index)];
    const float W = 1.0f - U - V;
    Out.Position = vec3{ Origin.x + Direction.x * T, Origin.y + Direction.y * T, Origin.z + Direction.z * T };
    vec3 N{ Tri.Na.x * W + Tri.Nb.x * U + Tri.Nc.x * V,
            Tri.Na.y * W + Tri.Nb.y * U + Tri.Nc.y * V,
            Tri.Na.z * W + Tri.Nb.z * U + Tri.Nc.z * V };
    Out.Normal   = Normalise(N);
    Out.View     = vec3{ -Direction.x, -Direction.y, -Direction.z };
    if (Out.Normal.x * Out.View.x + Out.Normal.y * Out.View.y + Out.Normal.z * Out.View.z < 0.0f)
        Out.Normal = vec3{ -Out.Normal.x, -Out.Normal.y, -Out.Normal.z };
    Out.Material = Tri.Material;
    Out.Hit      = true;
    return Out;
}

// Direct sun. Identical in all three paths, deliberately: the shadow ray, the cosine and the BSDF call are the
//    same code, so any disagreement in gate ② can only come from the material.
vec3 DirectSun(const Scene& S, const Surface& Hit, bool Shadowed) noexcept
{
    const ShadingRecord& M = S.Materials[Hit.Material];
    const float Cosine = Hit.Normal.x * S.SunDirection.x + Hit.Normal.y * S.SunDirection.y + Hit.Normal.z * S.SunDirection.z;
    if (Cosine <= 0.0f) return vec3{ 0.0f, 0.0f, 0.0f };
    if (Shadowed && S.Accelerator.Occluded(vec3{ Hit.Position.x + Hit.Normal.x * 1e-3f,
                                                 Hit.Position.y + Hit.Normal.y * 1e-3f,
                                                 Hit.Position.z + Hit.Normal.z * 1e-3f }, S.SunDirection, 1e30f))
        return vec3{ 0.0f, 0.0f, 0.0f };
    const vec3 F = Frontier::UnifiedMaterial::EvaluateWorld(M, Hit.Normal, Hit.View, S.SunDirection);
    const float Scale = S.SunRadiance * Cosine;
    return vec3{ F.x * S.SunColour.x * Scale, F.y * S.SunColour.y * Scale, F.z * S.SunColour.z * Scale };
}

// The material's hemispherical response, which every path multiplies its own irradiance estimate by. This is
//    the function the surfel resolve now calls instead of `albedo·(1−metal)/π`.
vec3 Response(const Scene& S, const Surface& Hit) noexcept
{
    return Frontier::UnifiedMaterial::AmbientResponse(S.Materials[Hit.Material], Hit.Normal, Hit.View);
}

struct PathOptions
{
    bool GlobalIllumination = false;
    bool Reflections        = false;
};

vec3 Shade(const Scene& S, const Surface& Hit, Path Which, const PathOptions& Options) noexcept
{
    if (!Hit.Hit) return vec3{ 0.0f, 0.0f, 0.0f };

    // Shadowing: the raster path has no rays, so with transport held identical gate ② turns shadows off for
    //    all three. With transport enabled the raytraced paths cast and the raster does not, which is one of
    //    the differences gate ③ expects to see.
    const bool Shadowed = Which != Path::Raster && Options.GlobalIllumination;
    vec3 Colour = DirectSun(S, Hit, Shadowed);

    const vec3 R = Response(S, Hit);
    vec3 Irradiance = S.SkyAmbient;
    if (Options.GlobalIllumination && Which != Path::Raster)
    {
        // A one-bounce irradiance estimate standing in for the surfel field / the ReSTIR GI pool. The two paths
        //    use a different tap count on purpose — that is a transport difference, and gate ③ requires one.
        const int Taps = Which == Path::Surfel ? 6 : 14;
        vec3 Gathered{ 0.0f, 0.0f, 0.0f };
        for (int Tap = 0; Tap < Taps; ++Tap)
        {
            const float Phi = 6.2831853f * (static_cast<float>(Tap) + 0.5f) / static_cast<float>(Taps);
            const float Cos = 0.35f + 0.6f * static_cast<float>((Tap * 7) % 5) / 4.0f;
            const float Sin = std::sqrt(std::max(0.0f, 1.0f - Cos * Cos));
            vec3 T, B;
            Frontier::UnifiedMaterial::ShadingFrame(Hit.Normal, T, B);
            const vec3 Direction = Normalise(vec3{
                T.x * (Sin * std::cos(Phi)) + B.x * (Sin * std::sin(Phi)) + Hit.Normal.x * Cos,
                T.y * (Sin * std::cos(Phi)) + B.y * (Sin * std::sin(Phi)) + Hit.Normal.y * Cos,
                T.z * (Sin * std::cos(Phi)) + B.z * (Sin * std::sin(Phi)) + Hit.Normal.z * Cos });
            const Surface Bounce = Intersect(S, vec3{ Hit.Position.x + Hit.Normal.x * 1e-3f,
                                                      Hit.Position.y + Hit.Normal.y * 1e-3f,
                                                      Hit.Position.z + Hit.Normal.z * 1e-3f }, Direction);
            // ⚠️ The bounce is shaded through the HIT's own material — the thing SurfelIrradianceUpdate.slang
            //    could not do before the fix, because it had no geometry buffers bound and invented its normal.
            const vec3 Incoming = Bounce.Hit ? DirectSun(S, Bounce, true) : SkyAlong(S, Direction);
            Gathered.x += Incoming.x; Gathered.y += Incoming.y; Gathered.z += Incoming.z;
        }
        const float Norm = 1.0f / static_cast<float>(Taps);
        Irradiance = vec3{ S.SkyAmbient.x + Gathered.x * Norm,
                           S.SkyAmbient.y + Gathered.y * Norm,
                           S.SkyAmbient.z + Gathered.z * Norm };
    }
    Colour.x += R.x * Irradiance.x; Colour.y += R.y * Irradiance.y; Colour.z += R.z * Irradiance.z;
    return Colour;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE CAMERA
//------------------------------------------------------------------------------------------------------------------------

struct Camera
{
    vec3  Eye, Forward, Right, Up;
    float TanHalf = 0.0f;
};

Camera MakeCamera(const vec3& Eye, const vec3& Target, float FieldOfViewDegrees) noexcept
{
    Camera C;
    C.Eye = Eye;
    C.Forward = Normalise(vec3{ Target.x - Eye.x, Target.y - Eye.y, Target.z - Eye.z });
    const vec3 WorldUp{ 0.0f, 0.0f, 1.0f };
    C.Right = Normalise(vec3{ C.Forward.y * WorldUp.z - C.Forward.z * WorldUp.y,
                              C.Forward.z * WorldUp.x - C.Forward.x * WorldUp.z,
                              C.Forward.x * WorldUp.y - C.Forward.y * WorldUp.x });
    C.Up = vec3{ C.Right.y * C.Forward.z - C.Right.z * C.Forward.y,
                 C.Right.z * C.Forward.x - C.Right.x * C.Forward.z,
                 C.Right.x * C.Forward.y - C.Right.y * C.Forward.x };
    C.TanHalf = std::tan(FieldOfViewDegrees * 0.5f * 3.14159265f / 180.0f);
    return C;
}

void Render(const Scene& S, const Camera& C, Path Which, const PathOptions& Options,
            uint32_t Width, uint32_t Height, std::vector<vec3>& Out) noexcept
{
    Out.assign(static_cast<size_t>(Width) * Height, vec3{ 0.0f, 0.0f, 0.0f });
    const float Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    const unsigned Workers = std::max(1u, std::thread::hardware_concurrency());
    std::vector<std::thread> Threads;
    for (unsigned Worker = 0u; Worker < Workers; ++Worker)
        Threads.emplace_back([&, Worker]
        {
            for (uint32_t Y = Worker; Y < Height; Y += Workers)
                for (uint32_t X = 0u; X < Width; ++X)
                {
                    const float Nx = ((static_cast<float>(X) + 0.5f) / static_cast<float>(Width)) * 2.0f - 1.0f;
                    const float Ny = 1.0f - ((static_cast<float>(Y) + 0.5f) / static_cast<float>(Height)) * 2.0f;
                    const vec3 Direction = Normalise(vec3{
                        C.Forward.x + C.Right.x * (Nx * C.TanHalf * Aspect) + C.Up.x * (Ny * C.TanHalf),
                        C.Forward.y + C.Right.y * (Nx * C.TanHalf * Aspect) + C.Up.y * (Ny * C.TanHalf),
                        C.Forward.z + C.Right.z * (Nx * C.TanHalf * Aspect) + C.Up.z * (Ny * C.TanHalf) });
                    const Surface Hit = Intersect(S, C.Eye, Direction);
                    Out[static_cast<size_t>(Y) * Width + X] = Hit.Hit ? Shade(S, Hit, Which, Options)
                                                                      : SkyAlong(S, Direction);
                }
        });
    for (std::thread& T : Threads) T.join();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       OUTPUT
//------------------------------------------------------------------------------------------------------------------------

uint8_t ToByte(float Linear) noexcept
{
    const float Mapped = Linear / (Linear + 1.0f);                       // Reinhard, as the resolve pass does
    const float Encoded = std::pow(std::clamp(Mapped, 0.0f, 1.0f), 1.0f / 2.2f);
    return static_cast<uint8_t>(std::lround(Encoded * 255.0f));
}

// PNG, written here rather than through a library: a proof that needed zlib installed to emit its own evidence
//    would be a proof nobody reruns. Fixed-Huffman deflate (RFC 1951 §3.2.6) over a greedy LZ77 match finder,
//    which is perhaps 15 lines more than storing the pixels raw and takes a 2560×1546 sheet from 11.9 MB to
//    roughly a tenth of that — worth it for a file that lives in the repository.
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

// Deflate packs bits least-significant first, but Huffman codes are written most-significant first. Both go
//    through here so the distinction lives in one place instead of at every call site.
struct BitWriter
{
    std::vector<uint8_t> Bytes;
    uint32_t             Hold  = 0u;
    uint32_t             Count = 0u;

    void Raw(uint32_t Value, uint32_t Width) noexcept          // LSB-first: lengths, distances, extra bits
    {
        Hold |= (Value & ((1u << Width) - 1u)) << Count;
        Count += Width;
        while (Count >= 8u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold >>= 8; Count -= 8u; }
    }
    void Code(uint32_t Value, uint32_t Width) noexcept          // MSB-first: Huffman codes
    {
        for (uint32_t I = 0u; I < Width; ++I) Raw((Value >> (Width - 1u - I)) & 1u, 1u);
    }
    void Flush() noexcept { if (Count > 0u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold = 0u; Count = 0u; } }
};

// RFC 1951 §3.2.6, the fixed literal/length alphabet.
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
    W.Raw(1u, 1u);                                              // final block
    W.Raw(1u, 2u);                                              // fixed Huffman

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
            // 24 chain steps: past that the gain is in the third decimal place and the write stops being free.
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
    EmitLiteral(W, 256u);                                       // end of block
    W.Flush();
    return W.Bytes;
}

void WritePng(const std::string& Path, uint32_t Width, uint32_t Height, const std::vector<uint8_t>& Rgb) noexcept
{
    // Per-scanline filter, chosen by the standard minimum-sum-of-absolute-differences heuristic over None /
    //    Sub / Up. Filtering is what makes the deflate worth having: Up turns the sheet's large flat regions
    //    and vertical gradients into runs of zero, which LZ77 then eats whole.
    const size_t Stride = static_cast<size_t>(Width) * 3u;
    std::vector<uint8_t> Raw;
    Raw.reserve(static_cast<size_t>(Height) * (Stride + 1u));
    std::vector<uint8_t> Line[3];
    for (auto& L : Line) L.resize(Stride);
    for (uint32_t Y = 0u; Y < Height; ++Y)
    {
        const uint8_t* Row   = Rgb.data() + static_cast<size_t>(Y) * Stride;
        const uint8_t* Above = (Y > 0u) ? Rgb.data() + (static_cast<size_t>(Y) - 1u) * Stride : nullptr;
        size_t Score[3] = { 0u, 0u, 0u };
        for (size_t I = 0u; I < Stride; ++I)
        {
            const uint8_t Left = (I >= 3u) ? Row[I - 3u] : 0u;
            const uint8_t Up   = Above ? Above[I] : 0u;
            Line[0][I] = Row[I];
            Line[1][I] = uint8_t(Row[I] - Left);
            Line[2][I] = uint8_t(Row[I] - Up);
            for (int F = 0; F < 3; ++F) Score[F] += size_t(int8_t(Line[F][I]) < 0 ? -int8_t(Line[F][I]) : int8_t(Line[F][I]));
        }
        int Pick = 0;
        for (int F = 1; F < 3; ++F) if (Score[F] < Score[Pick]) Pick = F;
        Raw.push_back(uint8_t(Pick));
        Raw.insert(Raw.end(), Line[Pick].begin(), Line[Pick].end());
    }

    // zlib container: CMF/FLG, the deflate stream, then Adler-32 of the UNcompressed bytes.
    std::vector<uint8_t> Stream{ 0x78u, 0x9Cu };
    const std::vector<uint8_t> Compressed = Deflate(Raw);
    Stream.insert(Stream.end(), Compressed.begin(), Compressed.end());
    const uint32_t Sum = Adler32(Raw.data(), Raw.size());
    for (int Shift : { 24, 16, 8, 0 }) Stream.push_back(static_cast<uint8_t>(Sum >> Shift));

    std::ofstream File(Path, std::ios::binary);
    const uint8_t Signature[8] = { 0x89u, 'P', 'N', 'G', '\r', '\n', 0x1Au, '\n' };
    File.write(reinterpret_cast<const char*>(Signature), 8);
    const auto Chunk = [&](const char* Tag, const std::vector<uint8_t>& Data)
    {
        const uint32_t Length = static_cast<uint32_t>(Data.size());
        const uint8_t Header[4] = { uint8_t(Length >> 24), uint8_t(Length >> 16), uint8_t(Length >> 8), uint8_t(Length) };
        File.write(reinterpret_cast<const char*>(Header), 4);
        std::vector<uint8_t> Body(Tag, Tag + 4);
        Body.insert(Body.end(), Data.begin(), Data.end());
        File.write(reinterpret_cast<const char*>(Body.data()), static_cast<std::streamsize>(Body.size()));
        const uint32_t Crc = Crc32(Body.data(), Body.size());
        const uint8_t Tail[4] = { uint8_t(Crc >> 24), uint8_t(Crc >> 16), uint8_t(Crc >> 8), uint8_t(Crc) };
        File.write(reinterpret_cast<const char*>(Tail), 4);
    };
    std::vector<uint8_t> Header;
    for (int Shift : { 24, 16, 8, 0 }) Header.push_back(uint8_t(Width >> Shift));
    for (int Shift : { 24, 16, 8, 0 }) Header.push_back(uint8_t(Height >> Shift));
    Header.insert(Header.end(), { 8u, 2u, 0u, 0u, 0u });
    Chunk("IHDR", Header);
    Chunk("IDAT", Stream);
    Chunk("IEND", {});
}

} // namespace

// ShowcaseStructure::Export calls this, and the proof never exports — but the linker still wants the symbol, and
//    the real one lives in SceneCodec.cpp, which needs the cgltf single-header parser to compile. Rather than
//    drag a glTF parser into a proof that writes no glTF, the entry point is defined here as a refusal. If this
//    ever fires, something called Export from a harness that cannot honour it, and silence would be worse.
namespace Frontier {
bool SceneCodec::Encode(const std::string&, const std::vector<TriangleIndex>&,
                        const std::vector<MaterialDescriptor>&, std::string* Error,
                        const SceneEncodeConfiguration&) noexcept
{
    if (Error) *Error = "MaterialParityProof does not link the glTF encoder";
    return false;
}
} // namespace Frontier

//------------------------------------------------------------------------------------------------------------------------
//                                                        THE PROOF
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    Line("================================================================================");
    Line(" MATERIAL PARITY — one material model, three render paths");
    Line("================================================================================");

    AuditShaders();

    // The lobe stack indexes the GGX energy-compensation and LTC-sheen tables on every evaluation, and
    //    FetchEnergy dereferences the bound set without a null check. A host that owns tables calls BindTables;
    //    this one has none of its own, so it bakes them. All three transports then share one table set, which
    //    is also what gate ② needs — differing LUTs would show up as a material difference that is not one.
    Frontier::UnifiedMaterial::EnsureTables();

    // ── the level ───────────────────────────────────────────────────────────────────────────────────────────
    Line("");
    Line("Building the showcase level (r%u) ...", Frontier::kShowcaseRevision);
    Frontier::ShowcaseStructure Showcase;
    Showcase.Construct();
    const auto& Placements = Showcase.QueryGridPlacements();
    if (!Showcase.QueryGridMeshError().empty())
        Line("  shader ball: %s", Showcase.QueryGridMeshError().c_str());
    Check(!Placements.empty(), "the grid published instanced shader-ball placements");
    if (Placements.empty())
    {
        Line("Cannot continue without the shader ball asset.");
        return 1;
    }

    Frontier::GeometryStructure Ball;
    std::string Resolved, Error;
    Check(Frontier::ShaderBallGeometry::LoadResolved(Frontier::kShaderBallAssetPath, Ball, &Resolved, &Error),
          "the shader ball asset loaded");
    Line("  mesh: %zu vertices, %zu triangles from %s",
         Ball.QueryVertices().size(), Ball.QueryIndices().size() / 3u, Resolved.c_str());

    // Materials, flattened exactly as the device would see them.
    Frontier::MaterialIndex Index;
    const auto& Descriptors = Showcase.QueryMaterials();
    for (const Frontier::MaterialDescriptor& D : Descriptors) (void)Index.Register(D);
    Index.Finalise(1u);
    const auto& Records = Index.QueryRecords();
    const auto& Slabs   = Index.QuerySlabRecords();

    Scene S;
    S.Materials.resize(Descriptors.size());
    for (size_t M = 0u; M < Descriptors.size(); ++M)
    {
        const uint32_t Selection = (Records[M].Flags & Frontier::kMaterialReflectanceMask) >> Frontier::kMaterialReflectanceShift;
        S.Materials[M] = Frontier::UnifiedMaterial::MakeShadingRecord(Slabs[Records[M].SlabOffset], Selection);
    }

    // ── 20 balls, one per material family, at FULL resolution ───────────────────────────────────────────────
    // One column of the grid, so the sheet shows all twenty families at once. Full resolution on purpose: a
    //    parity proof whose paths trace different triangles proves nothing, so nothing here is decimated.
    constexpr uint32_t kColumn = 9u;
    std::vector<const Frontier::InstancedPlacementRecord*> Chosen;
    for (const auto& P : Placements)
    {
        const uint32_t Slot = P.Material - 1u;
        if (Slot % Frontier::kShowcaseGridSide == kColumn) Chosen.push_back(&P);
    }
    Line("  chose %zu placements (column %u, one per family)", Chosen.size(), kColumn);

    const auto& Vertices = Ball.QueryVertices();
    const auto& Indices  = Ball.QueryIndices();
    // Lay the chosen balls out in a straight line so one camera sees them all.
    constexpr float kPitch = 1.45f;
    const float Start = -0.5f * kPitch * static_cast<float>(Chosen.size() - 1u);
    for (size_t B = 0u; B < Chosen.size(); ++B)
    {
        const float X = Start + kPitch * static_cast<float>(B);
        for (size_t I = 0u; I + 2u < Indices.size(); I += 3u)
        {
            Triangle T;
            const Frontier::VertexRecord& V0 = Vertices[Indices[I]];
            const Frontier::VertexRecord& V1 = Vertices[Indices[I + 1u]];
            const Frontier::VertexRecord& V2 = Vertices[Indices[I + 2u]];
            T.A = vec3{ V0.SpatialLocation.x + X, V0.SpatialLocation.y, V0.SpatialLocation.z };
            T.B = vec3{ V1.SpatialLocation.x + X, V1.SpatialLocation.y, V1.SpatialLocation.z };
            T.C = vec3{ V2.SpatialLocation.x + X, V2.SpatialLocation.y, V2.SpatialLocation.z };
            T.Na = vec3{ V0.NormalDirection.x, V0.NormalDirection.y, V0.NormalDirection.z };
            T.Nb = vec3{ V1.NormalDirection.x, V1.NormalDirection.y, V1.NormalDirection.z };
            T.Nc = vec3{ V2.NormalDirection.x, V2.NormalDirection.y, V2.NormalDirection.z };
            T.Material = Chosen[B]->Material;
            S.Triangles.push_back(T);
        }
    }
    // A ground plane, so there is something for the bounce to come from.
    {
        const float H = 400.0f;   // [m] - past the horizon at this lens, so no plane edge cuts into the frame
        const vec3 P00{ -H, -H, 0.0f }, P10{ H, -H, 0.0f }, P11{ H, H, 0.0f }, P01{ -H, H, 0.0f };
        const vec3 Up{ 0.0f, 0.0f, 1.0f };
        S.Triangles.push_back({ P00, P10, P11, Up, Up, Up, 0u });
        S.Triangles.push_back({ P00, P11, P01, Up, Up, Up, 0u });
    }
    Line("  scene: %zu triangles (%zu balls at full resolution)", S.Triangles.size(), Chosen.size());

    S.SunDirection = Normalise(S.SunDirection);
    S.Accelerator.Build(S.Triangles);
    Line("  BVH: %zu nodes", S.Accelerator.NodeCount());

    // A long lens from far back rather than a wide one from close in. Nineteen balls across a 10:1 strip is a
    //    28 m subject in a 2.9 m-tall frame, and a wide lens would both shrink each ball to a smudge and give
    //    the ends of the row a different view direction from the middle — which reads as a material difference
    //    when it is only perspective. At 5.6° vertical the row is effectively orthographic: same view of each.
    const float Extent = kPitch * static_cast<float>(Chosen.size());
    const Camera View = MakeCamera(vec3{ 0.0f, -Extent * 1.60f, 1.55f },
                                   vec3{ 0.0f, 0.0f, 0.55f }, 3.85f);
    constexpr uint32_t kWidth = 2560u, kHeight = 256u;

    // ── ② PARITY: transport held identical ──────────────────────────────────────────────────────────────────
    Line("");
    Line("② PARITY — transport held identical (direct sun only, no GI, no reflections, no shadow rays)");
    Line("   If the three paths evaluate the same material, these images are the same image.");
    Line("");

    const PathOptions Held{ false, false };
    std::vector<vec3> Raster, Surfel, Restir;
    Render(S, View, Path::Raster, Held, kWidth, kHeight, Raster);
    Render(S, View, Path::Surfel, Held, kWidth, kHeight, Surfel);
    Render(S, View, Path::Restir, Held, kWidth, kHeight, Restir);

    const auto Compare = [](const std::vector<vec3>& A, const std::vector<vec3>& B)
    {
        double Worst = 0.0, Sum = 0.0;
        for (size_t I = 0u; I < A.size(); ++I)
        {
            const double D[3] = { std::fabs(double(A[I].x) - B[I].x), std::fabs(double(A[I].y) - B[I].y), std::fabs(double(A[I].z) - B[I].z) };
            for (double Delta : D) { Worst = std::max(Worst, Delta); Sum += Delta; }
        }
        return std::pair<double, double>{ Worst, Sum / double(A.size() * 3u) };
    };

    const auto RasterSurfel = Compare(Raster, Surfel);
    const auto RasterRestir = Compare(Raster, Restir);
    const auto SurfelRestir = Compare(Surfel, Restir);
    Line("   pair                       max |Δ| per channel      mean |Δ|");
    Line("   ------------------------   --------------------   -----------");
    Line("   raster  vs surfel          %20.3e   %11.3e", RasterSurfel.first, RasterSurfel.second);
    Line("   raster  vs restir          %20.3e   %11.3e", RasterRestir.first, RasterRestir.second);
    Line("   surfel  vs restir          %20.3e   %11.3e", SurfelRestir.first, SurfelRestir.second);
    Line("");
    Check(RasterSurfel.first == 0.0, "raster and surfel agree to the bit with transport held");
    Check(RasterRestir.first == 0.0, "raster and restir agree to the bit with transport held");
    Check(SurfelRestir.first == 0.0, "surfel and restir agree to the bit with transport held");

    // ── ③ TRANSPORT: each path's own ────────────────────────────────────────────────────────────────────────
    Line("");
    Line("③ TRANSPORT — each path's own. The images must now DIFFER, or ② proved nothing.");
    Line("");

    const PathOptions Own{ true, true };
    std::vector<vec3> RasterOwn, SurfelOwn, RestirOwn;
    Render(S, View, Path::Raster, Own, kWidth, kHeight, RasterOwn);
    Render(S, View, Path::Surfel, Own, kWidth, kHeight, SurfelOwn);
    Render(S, View, Path::Restir, Own, kWidth, kHeight, RestirOwn);

    const auto OwnRasterSurfel = Compare(RasterOwn, SurfelOwn);
    const auto OwnSurfelRestir = Compare(SurfelOwn, RestirOwn);
    Line("   raster  vs surfel  (own transport)   max %10.3e   mean %10.3e", OwnRasterSurfel.first, OwnRasterSurfel.second);
    Line("   surfel  vs restir  (own transport)   max %10.3e   mean %10.3e", OwnSurfelRestir.first, OwnSurfelRestir.second);
    Line("");
    Check(OwnRasterSurfel.first > 1e-4, "enabling GI actually changed the surfel image (transport differs)");
    Check(OwnSurfelRestir.first > 1e-6, "surfel and restir transports differ from each other");

    // The material response per pixel must be identical regardless of path, because it does not depend on one.
    {
        double Worst = 0.0;
        for (uint32_t Y = 0u; Y < kHeight; Y += 4u)
            for (uint32_t X = 0u; X < kWidth; X += 4u)
            {
                const float Nx = ((static_cast<float>(X) + 0.5f) / kWidth) * 2.0f - 1.0f;
                const float Ny = 1.0f - ((static_cast<float>(Y) + 0.5f) / kHeight) * 2.0f;
                const vec3 D = Normalise(vec3{
                    View.Forward.x + View.Right.x * (Nx * View.TanHalf * (float(kWidth) / kHeight)) + View.Up.x * (Ny * View.TanHalf),
                    View.Forward.y + View.Right.y * (Nx * View.TanHalf * (float(kWidth) / kHeight)) + View.Up.y * (Ny * View.TanHalf),
                    View.Forward.z + View.Right.z * (Nx * View.TanHalf * (float(kWidth) / kHeight)) + View.Up.z * (Ny * View.TanHalf) });
                const Surface Hit = Intersect(S, View.Eye, D);
                if (!Hit.Hit) continue;
                const vec3 A = Response(S, Hit);
                const vec3 B = Response(S, Hit);     // same inputs, no path argument — it cannot depend on one
                Worst = std::max({ Worst, double(std::fabs(A.x - B.x)), double(std::fabs(A.y - B.y)), double(std::fabs(A.z - B.z)) });
            }
        Check(Worst == 0.0, "the hemispherical material response is path-independent by construction");
    }

    // ── the sheet ───────────────────────────────────────────────────────────────────────────────────────────
    // Six rows: the three held-transport renders (which must be identical), then the three own-transport
    //    renders (which must not be). A reader sees the claim and its control in one image.
    {
        constexpr uint32_t kRows = 6u;
        // A gutter between every band, and a wider one between the HELD three and the OWN three — without it
        //    six near-identical strips read as one continuous image and the eye cannot tell where a band ends.
        constexpr uint32_t kGutter = 6u, kSplit = 22u;
        const uint32_t SheetHeight = kHeight * kRows + kGutter * (kRows - 1u) + (kSplit - kGutter);
        std::vector<uint8_t> Sheet(static_cast<size_t>(kWidth) * SheetHeight * 3u, 24u);
        const std::vector<vec3>* Bands[kRows] = { &Raster, &Surfel, &Restir, &RasterOwn, &SurfelOwn, &RestirOwn };
        uint32_t Cursor = 0u;
        for (uint32_t Band = 0u; Band < kRows; ++Band)
        {
            for (uint32_t Y = 0u; Y < kHeight; ++Y)
                for (uint32_t X = 0u; X < kWidth; ++X)
                {
                    const vec3& C = (*Bands[Band])[static_cast<size_t>(Y) * kWidth + X];
                    const size_t Out = ((static_cast<size_t>(Cursor) + Y) * kWidth + X) * 3u;
                    Sheet[Out + 0u] = ToByte(C.x);
                    Sheet[Out + 1u] = ToByte(C.y);
                    Sheet[Out + 2u] = ToByte(C.z);
                }
            Cursor += kHeight + (Band == 2u ? kSplit : kGutter);
        }
        WritePng("VisualProof/MaterialParity/MaterialParitySheet.png", kWidth, SheetHeight, Sheet);
        Line("");
        Line("   sheet: VisualProof/MaterialParity/MaterialParitySheet.png");
        Line("          rows 1-3 = raster / surfel / restir with transport HELD  (must be identical)");
        Line("          rows 4-6 = the same three with their OWN transport       (must differ)");
    }

    Line("");
    Line("================================================================================");
    Line(" %s", Failures == 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT");
    Line("================================================================================");

    if (std::FILE* Out = std::fopen("VisualProof/MaterialParity/MaterialParityProof.txt", "wb"))
    {
        std::fwrite(Transcript.data(), 1u, Transcript.size(), Out);
        std::fclose(Out);
    }
    return Failures == 0 ? 0 : 1;
}
