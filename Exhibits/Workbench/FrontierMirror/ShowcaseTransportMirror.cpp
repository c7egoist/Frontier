//============================================================================================================================================
//                                                  SHOWCASETRANSPORTMIRROR.CPP
//============================================================================================================================================
// 📦 The Project-Zero showcase grid rendered through the three light-transport paths, over shared topology.
//
/// prose : Renders the 20 x 20 showcase grid — 380 full-resolution ShaderBalls plus the authored emissive row,
///         ground and panel — through the visibility raster, the surfel GI field, and a traced ReSTIR-style
///         estimator. Geometry, materials, camera and sun are identical across the three; only transport moves.
///         That the three evaluate the SAME material model is not claimed here, it is proved separately by
///         VisualProof/MaterialParity.
///
///         ⚠️ The grid is instanced, not flattened. 380 placements of a 67 832-triangle mesh is 25.8 M
///         triangles; at the ~80 bytes a world-space triangle costs that is over 2 GB, which this machine does
///         not have. One BLAS is built over the mesh ONCE and a TLAS indexes 380 transforms into it, which is
///         the same two-level structure the device path uses and the reason the full-resolution asset fits at
///         all. Sharing topology is therefore not a size optimisation here; it is what makes the scene exist.
///
/// in    : --view <name>   a framing from ShowcaseViewpointFor (default, grid400, metals, glass, glints, paint-*)
///         --path <name>   raster | surfel | restir
///         --out <file>    PNG destination
///         --turntable <n> instead of a still, orbit n frames and write an animated GIF
///         --width --height --spp --bounce --gi-frames --rays
/// out   : a PNG, or a GIF when --turntable is given
/// note  : CPU only, deterministic, no Vulkan. The surfel field is Engine/DisplayPresentation/SurfelReference,
///         the engine's own Vulkan-free oracle for SurfelGIStage, driven by this file's ray/light callbacks.
//============================================================================================================================================

#include "ContentInterchange/ShowcaseStructure.h"
#include "ContentInterchange/MaterialIndex.h"
#include "ContentInterchange/UnifiedMaterialEvaluation.h"
#include "DisplayPresentation/SurfelReference.h"
#include "GeometricRaster/GeometryStructure.h"
#include "RasterImageCodec.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using Frontier::MaterialSlabRecord;
using Frontier::ShowcaseStructure;
using Frontier::VertexRecord;

namespace
{

//--------------------------------------------------------------------------------------------------------------------------
//                                                   VECTOR HELPERS
//--------------------------------------------------------------------------------------------------------------------------

struct V3
{
    float x = 0.0f, y = 0.0f, z = 0.0f;
};

V3   operator+(const V3& A, const V3& B) noexcept { return { A.x + B.x, A.y + B.y, A.z + B.z }; }
V3   operator-(const V3& A, const V3& B) noexcept { return { A.x - B.x, A.y - B.y, A.z - B.z }; }
V3   operator*(const V3& A, float S)     noexcept { return { A.x * S, A.y * S, A.z * S }; }
V3   Mul(const V3& A, const V3& B)       noexcept { return { A.x * B.x, A.y * B.y, A.z * B.z }; }
float Dot(const V3& A, const V3& B)      noexcept { return A.x * B.x + A.y * B.y + A.z * B.z; }
V3   Cross(const V3& A, const V3& B)     noexcept { return { A.y * B.z - A.z * B.y, A.z * B.x - A.x * B.z, A.x * B.y - A.y * B.x }; }
V3   Normalise(const V3& A)              noexcept { const float L = std::sqrt(Dot(A, A)); return L > 0.0f ? A * (1.0f / L) : V3{ 0.0f, 0.0f, 1.0f }; }

//--------------------------------------------------------------------------------------------------------------------------
//                                              BOTTOM-LEVEL ACCELERATION
//--------------------------------------------------------------------------------------------------------------------------
// A median-split BVH over one mesh in its own object space. Built once per distinct geometry; every placement of
//    that geometry traverses this same structure through its inverse transform.

struct Triangle
{
    V3       A, B, C;
    V3       Na, Nb, Nc;
    uint32_t Material = 0u;
};

struct Bounds
{
    V3 Low{  1e30f,  1e30f,  1e30f };
    V3 High{ -1e30f, -1e30f, -1e30f };

    void Add(const V3& P) noexcept
    {
        Low.x = std::min(Low.x, P.x);   High.x = std::max(High.x, P.x);
        Low.y = std::min(Low.y, P.y);   High.y = std::max(High.y, P.y);
        Low.z = std::min(Low.z, P.z);   High.z = std::max(High.z, P.z);
    }
    void Add(const Bounds& O) noexcept { Add(O.Low); Add(O.High); }
    [[nodiscard]] V3 Centre() const noexcept { return (Low + High) * 0.5f; }
};

struct Node
{
    Bounds   Box;
    uint32_t Left = 0u, Start = 0u, Count = 0u;
};

struct Hit
{
    float    Distance = 1e30f;
    uint32_t Primitive = 0u;
    float    U = 0.0f, V = 0.0f;
    bool     Valid = false;
};

bool SlabTest(const Bounds& Box, const V3& Origin, const V3& Inverse, float Limit) noexcept
{
    float Near = 0.0f, Far = Limit;
    const float O[3] = { Origin.x, Origin.y, Origin.z };
    const float I[3] = { Inverse.x, Inverse.y, Inverse.z };
    const float L[3] = { Box.Low.x, Box.Low.y, Box.Low.z };
    const float H[3] = { Box.High.x, Box.High.y, Box.High.z };
    for (int K = 0; K < 3; ++K)
    {
        float T0 = (L[K] - O[K]) * I[K];
        float T1 = (H[K] - O[K]) * I[K];
        if (T0 > T1) std::swap(T0, T1);
        Near = std::max(Near, T0);
        Far  = std::min(Far, T1);
        if (Near > Far) return false;
    }
    return true;
}

class MeshAccelerator
{
public:
    std::vector<Triangle> Primitives;
    std::vector<Node>     Nodes;
    std::vector<uint32_t> Order;

    void Build() noexcept
    {
        Order.resize(Primitives.size());
        for (uint32_t I = 0u; I < Order.size(); ++I) Order[I] = I;
        Nodes.clear();
        Nodes.reserve(Primitives.size() * 2u + 1u);
        Nodes.push_back({});
        Split(0u, 0u, static_cast<uint32_t>(Order.size()));
    }

    [[nodiscard]] Bounds RootBounds() const noexcept { return Nodes.empty() ? Bounds{} : Nodes[0].Box; }

    void Intersect(const V3& Origin, const V3& Direction, float Limit, Hit& Result) const noexcept
    {
        if (Nodes.empty()) return;
        const V3 Inverse{ 1.0f / Direction.x, 1.0f / Direction.y, 1.0f / Direction.z };
        uint32_t Stack[64];
        uint32_t Depth = 0u;
        Stack[Depth++] = 0u;
        while (Depth > 0u)
        {
            const Node& N = Nodes[Stack[--Depth]];
            if (!SlabTest(N.Box, Origin, Inverse, Result.Valid ? Result.Distance : Limit)) continue;
            if (N.Count > 0u)
            {
                for (uint32_t I = 0u; I < N.Count; ++I) Probe(Order[N.Start + I], Origin, Direction, Limit, Result);
            }
            else
            {
                Stack[Depth++] = N.Left;
                Stack[Depth++] = N.Left + 1u;
            }
        }
    }

    [[nodiscard]] bool Occluded(const V3& Origin, const V3& Direction, float Limit) const noexcept
    {
        if (Nodes.empty()) return false;
        const V3 Inverse{ 1.0f / Direction.x, 1.0f / Direction.y, 1.0f / Direction.z };
        uint32_t Stack[64];
        uint32_t Depth = 0u;
        Stack[Depth++] = 0u;
        while (Depth > 0u)
        {
            const Node& N = Nodes[Stack[--Depth]];
            if (!SlabTest(N.Box, Origin, Inverse, Limit)) continue;
            if (N.Count > 0u)
            {
                for (uint32_t I = 0u; I < N.Count; ++I)
                {
                    Hit Shadow;
                    Probe(Order[N.Start + I], Origin, Direction, Limit, Shadow);
                    if (Shadow.Valid && Shadow.Distance < Limit) return true;
                }
            }
            else
            {
                Stack[Depth++] = N.Left;
                Stack[Depth++] = N.Left + 1u;
            }
        }
        return false;
    }

private:
    void Probe(uint32_t Index, const V3& Origin, const V3& Direction, float Limit, Hit& Result) const noexcept
    {
        const Triangle& T = Primitives[Index];
        const V3 E1 = T.B - T.A, E2 = T.C - T.A;
        const V3 P = Cross(Direction, E2);
        const float Determinant = Dot(E1, P);
        if (std::fabs(Determinant) < 1e-12f) return;
        const float Inverse = 1.0f / Determinant;
        const V3 S = Origin - T.A;
        const float U = Dot(S, P) * Inverse;
        if (U < -1e-6f || U > 1.000001f) return;
        const V3 Q = Cross(S, E1);
        const float V = Dot(Direction, Q) * Inverse;
        if (V < -1e-6f || U + V > 1.000001f) return;
        const float Distance = Dot(E2, Q) * Inverse;
        if (Distance <= 1e-4f || Distance >= Limit) return;
        if (Result.Valid && Distance >= Result.Distance) return;
        Result.Distance = Distance;
        Result.Primitive = Index;
        Result.U = U;
        Result.V = V;
        Result.Valid = true;
    }

    void Split(uint32_t NodeIndex, uint32_t Start, uint32_t Count) noexcept
    {
        Bounds Box;
        for (uint32_t I = 0u; I < Count; ++I)
        {
            const Triangle& T = Primitives[Order[Start + I]];
            Box.Add(T.A); Box.Add(T.B); Box.Add(T.C);
        }
        Nodes[NodeIndex].Box = Box;
        if (Count <= 4u)
        {
            Nodes[NodeIndex].Start = Start;
            Nodes[NodeIndex].Count = Count;
            return;
        }
        const V3 Span = Box.High - Box.Low;
        const int Axis = (Span.x >= Span.y && Span.x >= Span.z) ? 0 : (Span.y >= Span.z ? 1 : 2);
        const auto Key = [&](uint32_t Index)
        {
            const Triangle& T = Primitives[Index];
            const V3 Centre = (T.A + T.B + T.C) * (1.0f / 3.0f);
            return Axis == 0 ? Centre.x : (Axis == 1 ? Centre.y : Centre.z);
        };
        const uint32_t Half = Count / 2u;
        std::nth_element(Order.begin() + Start, Order.begin() + Start + Half, Order.begin() + Start + Count,
                         [&](uint32_t A, uint32_t B) { return Key(A) < Key(B); });
        const uint32_t Left = static_cast<uint32_t>(Nodes.size());
        Nodes[NodeIndex].Left = Left;
        Nodes[NodeIndex].Count = 0u;
        Nodes.push_back({});
        Nodes.push_back({});
        Split(Left, Start, Half);
        Split(Left + 1u, Start + Half, Count - Half);
    }
};

//--------------------------------------------------------------------------------------------------------------------------
//                                               TOP-LEVEL ACCELERATION
//--------------------------------------------------------------------------------------------------------------------------
// One entry per placement: which BLAS, where it sits, and the material that placement overrides the mesh with.
//    The material is the ONLY thing that differs between the 380 grid placements, which is exactly the condition
//    under which an object may share topology rather than own a copy.

struct Placement
{
    uint32_t Mesh     = 0u;
    uint32_t Material = 0u;
    V3       Offset;                                  // grid placements are pure translation
    Bounds   World;
    bool     OverrideMaterial = true;
};

struct TlasNode
{
    Bounds   Box;
    uint32_t Left = 0u, Start = 0u, Count = 0u;
};

struct SceneHit
{
    bool     Valid = false;
    float    Distance = 1e30f;
    V3       Position;
    V3       Normal;
    uint32_t Material = 0u;
};

class SceneAccelerator
{
public:
    std::vector<MeshAccelerator> Meshes;
    std::vector<Placement>       Placements;
    std::vector<TlasNode>        Nodes;
    std::vector<uint32_t>        Order;

    void Build() noexcept
    {
        for (Placement& P : Placements)
        {
            const Bounds Local = Meshes[P.Mesh].RootBounds();
            P.World = Bounds{};
            P.World.Add(Local.Low + P.Offset);
            P.World.Add(Local.High + P.Offset);
        }
        Order.resize(Placements.size());
        for (uint32_t I = 0u; I < Order.size(); ++I) Order[I] = I;
        Nodes.clear();
        Nodes.push_back({});
        Split(0u, 0u, static_cast<uint32_t>(Order.size()));
    }

    [[nodiscard]] SceneHit Trace(const V3& Origin, const V3& Direction, float Limit) const noexcept
    {
        SceneHit Out;
        if (Nodes.empty()) return Out;
        const V3 Inverse{ 1.0f / Direction.x, 1.0f / Direction.y, 1.0f / Direction.z };
        uint32_t Stack[64];
        uint32_t Depth = 0u;
        Stack[Depth++] = 0u;
        float Closest = Limit;
        while (Depth > 0u)
        {
            const TlasNode& N = Nodes[Stack[--Depth]];
            if (!SlabTest(N.Box, Origin, Inverse, Closest)) continue;
            if (N.Count > 0u)
            {
                for (uint32_t I = 0u; I < N.Count; ++I)
                {
                    const Placement& P = Placements[Order[N.Start + I]];
                    Hit Local;
                    // Pure translation, so the object-space ray is the world ray moved by -Offset and the
                    //    object-space normal is already the world normal. A general affine placement would
                    //    need the inverse matrix here and the inverse-transpose on the normal.
                    Meshes[P.Mesh].Intersect(Origin - P.Offset, Direction, Closest, Local);
                    if (!Local.Valid || Local.Distance >= Closest) continue;
                    Closest = Local.Distance;
                    const Triangle& T = Meshes[P.Mesh].Primitives[Local.Primitive];
                    const float W = 1.0f - Local.U - Local.V;
                    Out.Valid = true;
                    Out.Distance = Local.Distance;
                    Out.Position = Origin + Direction * Local.Distance;
                    Out.Normal = Normalise(T.Na * W + T.Nb * Local.U + T.Nc * Local.V);
                    Out.Material = P.OverrideMaterial ? P.Material : T.Material;
                }
            }
            else
            {
                Stack[Depth++] = N.Left;
                Stack[Depth++] = N.Left + 1u;
            }
        }
        return Out;
    }

    [[nodiscard]] bool Occluded(const V3& Origin, const V3& Direction, float Limit) const noexcept
    {
        if (Nodes.empty()) return false;
        const V3 Inverse{ 1.0f / Direction.x, 1.0f / Direction.y, 1.0f / Direction.z };
        uint32_t Stack[64];
        uint32_t Depth = 0u;
        Stack[Depth++] = 0u;
        while (Depth > 0u)
        {
            const TlasNode& N = Nodes[Stack[--Depth]];
            if (!SlabTest(N.Box, Origin, Inverse, Limit)) continue;
            if (N.Count > 0u)
            {
                for (uint32_t I = 0u; I < N.Count; ++I)
                {
                    const Placement& P = Placements[Order[N.Start + I]];
                    if (Meshes[P.Mesh].Occluded(Origin - P.Offset, Direction, Limit)) return true;
                }
            }
            else
            {
                Stack[Depth++] = N.Left;
                Stack[Depth++] = N.Left + 1u;
            }
        }
        return false;
    }

private:
    void Split(uint32_t NodeIndex, uint32_t Start, uint32_t Count) noexcept
    {
        Bounds Box;
        for (uint32_t I = 0u; I < Count; ++I) Box.Add(Placements[Order[Start + I]].World);
        Nodes[NodeIndex].Box = Box;
        if (Count <= 2u)
        {
            Nodes[NodeIndex].Start = Start;
            Nodes[NodeIndex].Count = Count;
            return;
        }
        const V3 Span = Box.High - Box.Low;
        const int Axis = (Span.x >= Span.y && Span.x >= Span.z) ? 0 : (Span.y >= Span.z ? 1 : 2);
        const auto Key = [&](uint32_t Index)
        {
            const V3 C = Placements[Index].World.Centre();
            return Axis == 0 ? C.x : (Axis == 1 ? C.y : C.z);
        };
        const uint32_t Half = Count / 2u;
        std::nth_element(Order.begin() + Start, Order.begin() + Start + Half, Order.begin() + Start + Count,
                         [&](uint32_t A, uint32_t B) { return Key(A) < Key(B); });
        const uint32_t Left = static_cast<uint32_t>(Nodes.size());
        Nodes[NodeIndex].Left = Left;
        Nodes[NodeIndex].Count = 0u;
        Nodes.push_back({});
        Nodes.push_back({});
        Split(Left, Start, Half);
        Split(Left + 1u, Start + Half, Count - Half);
    }
};

//--------------------------------------------------------------------------------------------------------------------------
//                                                     LIGHTING
//--------------------------------------------------------------------------------------------------------------------------

const V3    kSunDirection = Normalise(V3{ -0.38f, -0.52f, 0.76f });
const V3    kSunRadiance{ 7.2f, 6.9f, 6.3f };
constexpr float kSunAngularRadius = 0.0075f;

// The analytic sky the surfel path falls back to, matching the seam documented for SkyAlongApprox: a horizon
//    gradient plus a sun disc, not an environment cube.
V3 SkyAlong(const V3& Direction) noexcept
{
    const float Up = std::max(0.0f, Direction.z);
    const V3 Horizon{ 0.56f, 0.62f, 0.74f };
    const V3 Zenith { 0.16f, 0.26f, 0.52f };
    V3 Colour = Horizon * (1.0f - Up) + Zenith * Up;
    const float Towards = Dot(Direction, kSunDirection);
    if (Towards > std::cos(kSunAngularRadius * 3.0f))
        Colour = Colour + kSunRadiance * (6.0f * (Towards - std::cos(kSunAngularRadius * 3.0f)));
    return Colour;
}

struct Rng
{
    uint32_t State = 0x9E3779B9u;

    float Next() noexcept
    {
        State ^= State << 13; State ^= State >> 17; State ^= State << 5;
        return static_cast<float>(State & 0x00FFFFFFu) / 16777216.0f;
    }
};

V3 CosineHemisphere(const V3& Normal, float A, float B) noexcept
{
    const float Radius = std::sqrt(A);
    const float Angle  = 6.2831853f * B;
    V3 Tangent = std::fabs(Normal.z) < 0.9f ? Cross(Normal, V3{ 0.0f, 0.0f, 1.0f }) : Cross(Normal, V3{ 1.0f, 0.0f, 0.0f });
    Tangent = Normalise(Tangent);
    const V3 Bitangent = Cross(Normal, Tangent);
    return Normalise(Tangent * (Radius * std::cos(Angle)) + Bitangent * (Radius * std::sin(Angle))
                     + Normal * std::sqrt(std::max(0.0f, 1.0f - A)));
}

} // namespace

//--------------------------------------------------------------------------------------------------------------------------
//                                                   THE RENDERER
//--------------------------------------------------------------------------------------------------------------------------

namespace
{

enum class Transport { Raster, Surfel, Restir };

struct Camera
{
    V3    Eye, Forward, Right, Up;
    float TanHalf = 0.0f;
};

Camera MakeCamera(const V3& Eye, const V3& Target, float FieldOfViewDegrees) noexcept
{
    Camera C;
    C.Eye = Eye;
    C.Forward = Normalise(Target - Eye);
    C.Right = Normalise(Cross(C.Forward, V3{ 0.0f, 0.0f, 1.0f }));
    C.Up = Cross(C.Right, C.Forward);
    C.TanHalf = std::tan(FieldOfViewDegrees * 0.5f * 3.14159265f / 180.0f);
    return C;
}

struct World
{
    SceneAccelerator            Accelerator;
    std::vector<ShadingRecord>  Materials;
    Frontier::SurfelReferenceField Field;
};

const World* g_World = nullptr;

// Direct sun with a shadow ray, through the engine's material model. Shared by every transport, because the
//    thing that must not vary between transports is exactly this.
V3 DirectLight(const World& W, const V3& Position, const V3& Normal, uint32_t Material, const V3& Outgoing) noexcept
{
    const float Facing = Dot(Normal, kSunDirection);
    if (Facing <= 0.0f) return { 0.0f, 0.0f, 0.0f };
    if (W.Accelerator.Occluded(Position + Normal * 0.002f, kSunDirection, 1e4f)) return { 0.0f, 0.0f, 0.0f };
    const ShadingRecord& M = W.Materials[Material < W.Materials.size() ? Material : 0u];
    const vec3 F = Frontier::UnifiedMaterial::EvaluateWorld(
        M, vec3(Normal.x, Normal.y, Normal.z), vec3(Outgoing.x, Outgoing.y, Outgoing.z),
        vec3(kSunDirection.x, kSunDirection.y, kSunDirection.z));
    return Mul(V3{ F.x, F.y, F.z }, kSunRadiance) * Facing;
}

// The hemispherical response of this material to uniform incident light: the factor that turns an irradiance
//    into outgoing radiance. Path-independent by construction, which is why surfel and ReSTIR can share it.
V3 AmbientFactor(const World& W, uint32_t Material, const V3& Normal, const V3& Outgoing) noexcept
{
    const ShadingRecord& M = W.Materials[Material < W.Materials.size() ? Material : 0u];
    const vec3 R = Frontier::UnifiedMaterial::AmbientResponse(M, vec3(Normal.x, Normal.y, Normal.z),
                                                              vec3(Outgoing.x, Outgoing.y, Outgoing.z));
    return { R.x, R.y, R.z };
}

//--------------------------------------------------------------------------------------------------------------------------
//                                                 SURFEL GI FIELD
//--------------------------------------------------------------------------------------------------------------------------
// The field is Engine/DisplayPresentation/SurfelReference — the engine's renderer-independent CPU oracle for
//    SurfelGIStage. It owns placement, the spatial hash, the Jacobi running mean and the gather; this file
//    supplies only the scene-specific measurement, which is what the callback exists for.

struct MeasureContext
{
    const World* Scene = nullptr;
    uint32_t     Rays  = 24u;
    uint32_t     Frame = 0u;
};

void MeasureSurfel(const Frontier::SurfelReferenceSample& Sample, uint32_t Index,
                   void* UserContext, float OutIrradiance[3]) noexcept
{
    const MeasureContext& Context = *static_cast<const MeasureContext*>(UserContext);
    const World& W = *Context.Scene;
    const V3 Position{ Sample.Position[0], Sample.Position[1], Sample.Position[2] };
    const V3 Normal  { Sample.Normal[0],   Sample.Normal[1],   Sample.Normal[2]   };

    Rng Random{ 0x1234567u ^ (Index * 2654435761u) ^ (Context.Frame * 40503u) };
    V3 Sum{ 0.0f, 0.0f, 0.0f };
    for (uint32_t K = 0u; K < Context.Rays; ++K)
    {
        const V3 Direction = CosineHemisphere(Normal, Random.Next(), Random.Next());
        const SceneHit H = W.Accelerator.Trace(Position + Normal * 0.003f, Direction, 1e4f);
        V3 Incoming;
        if (H.Valid)
        {
            V3 N = H.Normal;
            if (Dot(N, Direction) > 0.0f) N = N * -1.0f;
            // Radiance LEAVING the hit surface: its own direct light, plus what the PREVIOUS field already
            //    knows arrives there. That second term is how light propagates past one bounce across frames.
            Incoming = DirectLight(W, H.Position, N, H.Material, Direction * -1.0f);
            float Previous[3] = { 0.0f, 0.0f, 0.0f };
            const float P[3] = { H.Position.x, H.Position.y, H.Position.z };
            const float Q[3] = { N.x, N.y, N.z };
            W.Field.Gather(P, Q, Previous);
            const V3 Response = AmbientFactor(W, H.Material, N, Direction * -1.0f);
            Incoming = Incoming + Mul(V3{ Previous[0], Previous[1], Previous[2] }, Response);
        }
        else
        {
            Incoming = SkyAlong(Direction);
        }
        // Firefly clamp: one ray onto an emissive row-8 sphere otherwise injects a blob the running mean
        //    takes dozens of frames to forget.
        const float Peak = std::max(Incoming.x, std::max(Incoming.y, Incoming.z));
        if (Peak > 8.0f) Incoming = Incoming * (8.0f / Peak);
        Sum = Sum + Incoming;
    }
    // Cosine-weighted sampling already carries the cos/pi, so the estimator is the plain mean times pi.
    const float Scale = 3.14159265f / static_cast<float>(Context.Rays);
    OutIrradiance[0] = Sum.x * Scale;
    OutIrradiance[1] = Sum.y * Scale;
    OutIrradiance[2] = Sum.z * Scale;
}

//--------------------------------------------------------------------------------------------------------------------------
//                                                   SHADE A HIT
//--------------------------------------------------------------------------------------------------------------------------

V3 Shade(const World& W, Transport Which, const V3& Origin, const V3& Direction, int Bounces, Rng& Random) noexcept
{
    const SceneHit H = W.Accelerator.Trace(Origin, Direction, 1e4f);
    if (!H.Valid) return SkyAlong(Direction);

    V3 N = H.Normal;
    if (Dot(N, Direction) > 0.0f) N = N * -1.0f;
    const V3 Outgoing = Direction * -1.0f;
    const ShadingRecord& M = W.Materials[H.Material < W.Materials.size() ? H.Material : 0u];

    V3 Radiance = DirectLight(W, H.Position, N, H.Material, Outgoing);
    Radiance = Radiance + V3{ M.Emission.x, M.Emission.y, M.Emission.z };

    const V3 Response = AmbientFactor(W, H.Material, N, Outgoing);

    switch (Which)
    {
        case Transport::Raster:
        {
            // GI off, reflections off, no ray queries beyond the sun shadow: the sky as a constant ambient
            //    term through the same hemispherical response every other path uses.
            const V3 Ambient = SkyAlong(V3{ 0.0f, 0.0f, 1.0f }) * 0.35f;
            Radiance = Radiance + Mul(Ambient, Response);
            break;
        }
        case Transport::Surfel:
        {
            // GI on, RT off at shade time. The irradiance was accumulated into the persistent field before
            //    the frame started; shading only looks it up.
            float Irradiance[3] = { 0.0f, 0.0f, 0.0f };
            const float P[3] = { H.Position.x, H.Position.y, H.Position.z };
            const float Q[3] = { N.x, N.y, N.z };
            W.Field.Gather(P, Q, Irradiance);
            Radiance = Radiance + Mul(V3{ Irradiance[0], Irradiance[1], Irradiance[2] }, Response);
            break;
        }
        case Transport::Restir:
        {
            // RT on, GI on: the bounce is traced now rather than cached.
            if (Bounces > 0)
            {
                const V3 Next = CosineHemisphere(N, Random.Next(), Random.Next());
                const V3 Incoming = Shade(W, Which, H.Position + N * 0.003f, Next, Bounces - 1, Random);
                Radiance = Radiance + Mul(Incoming, Response);
            }
            else
            {
                const V3 Ambient = SkyAlong(V3{ 0.0f, 0.0f, 1.0f }) * 0.35f;
                Radiance = Radiance + Mul(Ambient, Response);
            }
            break;
        }
    }
    return Radiance;
}

uint8_t ToByte(float Value) noexcept
{
    const float Mapped = Value <= 0.0031308f ? Value * 12.92f : 1.055f * std::pow(std::max(Value, 0.0f), 1.0f / 2.4f) - 0.055f;
    return static_cast<uint8_t>(std::lround(std::min(1.0f, std::max(0.0f, Mapped)) * 255.0f));
}

void Render(const World& W, const Camera& View, Transport Which, uint32_t Width, uint32_t Height,
            uint32_t Spp, int Bounces, std::vector<uint8_t>& Rgb)
{
    Rgb.assign(static_cast<size_t>(Width) * Height * 3u, 0u);
    const float Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    const uint32_t Workers = std::max(1u, std::thread::hardware_concurrency());
    std::atomic<uint32_t> NextRow{ 0u };

    const auto Worker = [&]()
    {
        for (;;)
        {
            const uint32_t Y = NextRow.fetch_add(1u);
            if (Y >= Height) return;
            for (uint32_t X = 0u; X < Width; ++X)
            {
                Rng Random{ 0x85EBCA6Bu ^ (Y * 1973u + X * 9277u) };
                V3 Sum{ 0.0f, 0.0f, 0.0f };
                const uint32_t Samples = (Which == Transport::Restir) ? Spp : 1u;
                for (uint32_t S = 0u; S < Samples; ++S)
                {
                    const float Jx = Samples > 1u ? Random.Next() : 0.5f;
                    const float Jy = Samples > 1u ? Random.Next() : 0.5f;
                    const float Nx = (2.0f * (static_cast<float>(X) + Jx) / static_cast<float>(Width) - 1.0f);
                    const float Ny = (1.0f - 2.0f * (static_cast<float>(Y) + Jy) / static_cast<float>(Height));
                    const V3 Direction = Normalise(View.Forward + View.Right * (Nx * View.TanHalf * Aspect)
                                                                + View.Up * (Ny * View.TanHalf));
                    Sum = Sum + Shade(W, Which, View.Eye, Direction, Bounces, Random);
                }
                const V3 Colour = Sum * (1.0f / static_cast<float>(Samples));
                const size_t Out = (static_cast<size_t>(Y) * Width + X) * 3u;
                Rgb[Out + 0u] = ToByte(Colour.x);
                Rgb[Out + 1u] = ToByte(Colour.y);
                Rgb[Out + 2u] = ToByte(Colour.z);
            }
        }
    };

    std::vector<std::thread> Pool;
    for (uint32_t I = 0u; I < Workers; ++I) Pool.emplace_back(Worker);
    for (std::thread& T : Pool) T.join();
}

//--------------------------------------------------------------------------------------------------------------------------
//                                                  SCENE ASSEMBLY
//--------------------------------------------------------------------------------------------------------------------------

// Verbatim from Projects/Project-Zero/Host/MaterialLevelViewport.cpp's ShowcaseViewpointFor, so a sheet from this
//    mirror is provably the same shot the product opens.
struct Viewpoint { V3 Eye; float PitchDegrees, YawDegrees, FieldOfView; };

Viewpoint ViewpointFor(const std::string& Name)
{
    if (Name == "grid400") return { { 0.0f, -9.00f, 42.00f }, -62.0f, 0.0f, 44.0f };
    if (Name == "metals")  return { { 0.0f, -6.00f,  1.40f },  -6.0f, 0.0f, 50.0f };
    if (Name == "glass")   return { { 0.0f, -4.50f,  1.40f },  -6.0f, 0.0f, 50.0f };
    if (Name == "glints")  return { { -1.0f, 12.70f, 1.60f },  -7.0f, 0.0f, 50.0f };
    const char* PaintViews[5] = { "paint-candy", "paint-glitter", "paint-iridescent", "paint-cobalt", "paint-copper" };
    for (int Family = 0; Family < 5; ++Family)
    {
        const float RowY   = -1.8f + 1.5f * 15.0f;
        const float BlockX = -14.25f + 1.5f * (4.0f * static_cast<float>(Family) + 1.5f);
        if (Name == PaintViews[Family]) return { { BlockX, RowY - 4.60f, 1.55f }, -11.0f, 0.0f, 46.0f };
    }
    return { { 0.0f, -15.00f, 8.00f }, -21.0f, 0.0f, 55.0f };     // the product's entry shot
}

Camera CameraFor(const Viewpoint& Point, float YawOffsetDegrees = 0.0f)
{
    const float Pitch = Point.PitchDegrees * 3.14159265f / 180.0f;
    const float Yaw   = (Point.YawDegrees + YawOffsetDegrees) * 3.14159265f / 180.0f;
    const V3 Forward{ std::sin(Yaw) * std::cos(Pitch), std::cos(Yaw) * std::cos(Pitch), std::sin(Pitch) };
    return MakeCamera(Point.Eye, Point.Eye + Forward, Point.FieldOfView);
}

} // namespace

// ShowcaseStructure::Export reaches the glTF encoder, which this mirror does not link: it renders, it does not
//    export. Defined as a refusal rather than left to the linker so a future caller gets a reason, not a crash.
namespace Frontier {
bool SceneCodec::Encode(const std::string&, const std::vector<TriangleIndex>&,
                        const std::vector<MaterialDescriptor>&, std::string* Error,
                        const SceneEncodeConfiguration&) noexcept
{
    if (Error) *Error = "ShowcaseTransportMirror does not link the glTF encoder";
    return false;
}
} // namespace Frontier

int main(int argc, char** argv)
{
    std::string ViewName = "grid400", PathName = "raster", OutPath = "showcase.png";
    uint32_t Width = 900u, Height = 506u, Spp = 8u, Turntable = 0u, Converge = 0u, GiFrames = 10u, Rays = 24u;
    int Bounces = 2;
    bool Cycle = false;
    for (int I = 1; I < argc; ++I)
    {
        const std::string A = argv[I];
        const auto Next = [&]() { return (I + 1 < argc) ? argv[++I] : ""; };
        if      (A == "--view")      ViewName = Next();
        else if (A == "--path")      PathName = Next();
        else if (A == "--out")       OutPath = Next();
        else if (A == "--width")     Width = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--height")    Height = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--spp")       Spp = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--bounce")    Bounces = std::atoi(Next());
        else if (A == "--turntable") Turntable = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--converge")  Converge = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--cycle")     Cycle = true;
        else if (A == "--gi-frames") GiFrames = static_cast<uint32_t>(std::atoi(Next()));
        else if (A == "--rays")      Rays = static_cast<uint32_t>(std::atoi(Next()));
    }

    Frontier::UnifiedMaterial::EnsureTables();

    ShowcaseStructure Showcase;
    Showcase.Construct();
    const auto& Descriptors = Showcase.QueryMaterials();
    const auto& Placements  = Showcase.QueryGridPlacements();
    const auto& Geometry    = Showcase.QueryGridGeometry();
    const auto& Triangles   = Showcase.QueryTriangles();
    const auto& CornerNormal = Showcase.QueryCornerNormals();

    std::printf("[showcase] revision %u, %zu materials, %zu grid placements over %zu shared geometries\n",
                Frontier::kShowcaseRevision, Descriptors.size(), Placements.size(), Geometry.size());
    if (!Showcase.QueryGridMeshError().empty())
        std::printf("[showcase] ⚠️ mesh: %s\n", Showcase.QueryGridMeshError().c_str());

    World W;

    // Materials: the authored descriptors through the material table, then the ONE shared slab transcription.
    Frontier::MaterialIndex Index;
    for (const auto& D : Descriptors) Index.Register(D);
    Index.Finalise(4096u);
    const auto& Slabs = Index.QuerySlabRecords();
    W.Materials.reserve(Slabs.size());
    for (const auto& S : Slabs) W.Materials.push_back(Frontier::UnifiedMaterial::MakeShadingRecord(S, 0u));

    // BLAS 0: everything the level flattened — ground, the emissive row, the panel, the luminaires.
    // ⚠️ Reserve before taking any reference into this vector: the grid geometries are emplaced below, and a
    //    reallocation would leave `Static` dangling. That bug printed a 1.6e19 triangle count before it was
    //    caught, which is the polite version of what it does to the seeding pass.
    W.Accelerator.Meshes.reserve(1u + Geometry.size());
    W.Accelerator.Meshes.emplace_back();
    MeshAccelerator& Static = W.Accelerator.Meshes[0];
    Static.Primitives.reserve(Triangles.size());
    for (size_t T = 0u; T < Triangles.size(); ++T)
    {
        const auto& I = Triangles[T];
        Triangle P;
        P.A = { I.VertexAlphaX, I.VertexAlphaY, I.VertexAlphaZ };
        P.B = { I.VertexBetaX,  I.VertexBetaY,  I.VertexBetaZ  };
        P.C = { I.VertexGammaX, I.VertexGammaY, I.VertexGammaZ };
        const V3 Face = Normalise(Cross(P.B - P.A, P.C - P.A));
        const size_t Corner = T * 3u;
        P.Na = Corner + 2u < CornerNormal.size() ? V3{ CornerNormal[Corner].x, CornerNormal[Corner].y, CornerNormal[Corner].z } : Face;
        P.Nb = Corner + 2u < CornerNormal.size() ? V3{ CornerNormal[Corner + 1u].x, CornerNormal[Corner + 1u].y, CornerNormal[Corner + 1u].z } : Face;
        P.Nc = Corner + 2u < CornerNormal.size() ? V3{ CornerNormal[Corner + 2u].x, CornerNormal[Corner + 2u].y, CornerNormal[Corner + 2u].z } : Face;
        std::memcpy(&P.Material, &I.MaterialSlot, sizeof(uint32_t));
        Static.Primitives.push_back(P);
    }
    Static.Build();

    // BLAS 1..n: the shared grid geometry, built ONCE however many placements reference it.
    for (const auto& G : Geometry)
    {
        W.Accelerator.Meshes.emplace_back();
        MeshAccelerator& Mesh = W.Accelerator.Meshes.back();
        if (G.Vertices == nullptr || G.Indices == nullptr) continue;
        const auto& Vertices = *G.Vertices;
        const auto& Indices  = *G.Indices;
        Mesh.Primitives.reserve(Indices.size() / 3u);
        for (size_t K = 0u; K + 2u < Indices.size(); K += 3u)
        {
            const VertexRecord& A = Vertices[Indices[K]];
            const VertexRecord& B = Vertices[Indices[K + 1u]];
            const VertexRecord& C = Vertices[Indices[K + 2u]];
            Triangle P;
            P.A = { A.SpatialLocation.x, A.SpatialLocation.y, A.SpatialLocation.z };
            P.B = { B.SpatialLocation.x, B.SpatialLocation.y, B.SpatialLocation.z };
            P.C = { C.SpatialLocation.x, C.SpatialLocation.y, C.SpatialLocation.z };
            P.Na = { A.NormalDirection.x, A.NormalDirection.y, A.NormalDirection.z };
            P.Nb = { B.NormalDirection.x, B.NormalDirection.y, B.NormalDirection.z };
            P.Nc = { C.NormalDirection.x, C.NormalDirection.y, C.NormalDirection.z };
            Mesh.Primitives.push_back(P);
        }
        Mesh.Build();
        std::printf("[showcase] BLAS: %zu triangles, %zu nodes — built once, shared by every placement\n",
                    Mesh.Primitives.size(), Mesh.Nodes.size());
    }

    W.Accelerator.Placements.push_back({ 0u, 0u, V3{ 0.0f, 0.0f, 0.0f }, Bounds{}, false });
    for (const auto& P : Placements)
    {
        Placement Entry;
        Entry.Mesh = 1u + P.Geometry;
        Entry.Material = P.Material;
        Entry.Offset = { P.World[12], P.World[13], P.World[14] };
        Entry.OverrideMaterial = true;
        W.Accelerator.Placements.push_back(Entry);
    }
    W.Accelerator.Build();

    size_t Shared = 0u;
    for (const auto& M : W.Accelerator.Meshes) Shared += M.Primitives.size();
    size_t Flattened = W.Accelerator.Meshes[0].Primitives.size();
    for (const auto& P : Placements) Flattened += W.Accelerator.Meshes[1u + P.Geometry].Primitives.size();
    std::printf("[showcase] TLAS: %zu placements over %zu stored triangles — flattening them would be %zu (%.1f x)\n",
                W.Accelerator.Placements.size(), Shared, Flattened,
                static_cast<double>(Flattened) / static_cast<double>(std::max<size_t>(1u, Shared)));

    // ── the surfel field ────────────────────────────────────────────────────────────────────────────────────
    if (PathName == "surfel" || Cycle)
    {
        Frontier::SurfelReferenceSettings Settings;
        Settings.CellSize = 0.45f;
        Settings.AgeCap = 32.0f;
        Settings.MaximumSurfels = 60000u;
        W.Field.AssignSettings(Settings);

        // Seed from the geometry itself rather than from a G-buffer: off-screen surfaces are exactly the ones
        //    that bounce light into shot, and a camera-only seeding would omit them.
        std::vector<Frontier::SurfelReferenceSample> Samples;
        Rng Random{ 0xC0FFEEu };
        const auto SeedFrom = [&](const MeshAccelerator& Mesh, const V3& Offset, uint32_t Count, uint32_t Material)
        {
            if (Mesh.Primitives.empty()) return;
            for (uint32_t K = 0u; K < Count; ++K)
            {
                const Triangle& T = Mesh.Primitives[static_cast<size_t>(Random.Next() * (Mesh.Primitives.size() - 1u))];
                float A = Random.Next(), B = Random.Next();
                if (A + B > 1.0f) { A = 1.0f - A; B = 1.0f - B; }
                const V3 P = T.A + (T.B - T.A) * A + (T.C - T.A) * B + Offset;
                const V3 N = Normalise(T.Na + T.Nb + T.Nc);
                Frontier::SurfelReferenceSample S;
                S.Position[0] = P.x; S.Position[1] = P.y; S.Position[2] = P.z;
                S.Normal[0] = N.x;   S.Normal[1] = N.y;   S.Normal[2] = N.z;
                const ShadingRecord& M = W.Materials[Material < W.Materials.size() ? Material : 0u];
                S.Albedo[0] = M.BaseColor.x; S.Albedo[1] = M.BaseColor.y; S.Albedo[2] = M.BaseColor.z;
                Samples.push_back(S);
            }
        };
        SeedFrom(Static, V3{ 0.0f, 0.0f, 0.0f }, 24000u, 0u);
        for (const auto& P : W.Accelerator.Placements)
            if (P.OverrideMaterial) SeedFrom(W.Accelerator.Meshes[P.Mesh], P.Offset, 60u, P.Material);
        W.Field.Seed(Samples);
        std::printf("[showcase] surfel field: %u surfels from %zu candidates\n",
                    W.Field.QuerySurfelCount(), Samples.size());

        MeasureContext Context{ &W, Rays, 0u };
        g_World = &W;
        // When converging, the frames ARE the accumulation — stepping here first would skip the interesting part.
        if (Converge == 0u)
        {
            for (uint32_t F = 0u; F < GiFrames; ++F)
            {
                Context.Frame = F;
                W.Field.Step(MeasureSurfel, &Context);
                std::printf("[showcase] surfel GI frame %u/%u\n", F + 1u, GiFrames);
                std::fflush(stdout);
            }
        }
    }

    const Transport Which = PathName == "surfel" ? Transport::Surfel
                          : (PathName == "restir" ? Transport::Restir : Transport::Raster);
    const Viewpoint Point = ViewpointFor(ViewName);

    // ── the transport cycle ────────────────────────────────────────────────────────────────────────────────
    // One shot, one scene, one material set, three transports in sequence. Everything that moves between these
    // frames is light transport; nothing else in the scene is permitted to differ, which is the whole claim.
    if (Cycle)
    {
        const Camera View = CameraFor(Point);
        std::vector<std::vector<uint8_t>> Frames;
        const Transport Order[3] = { Transport::Raster, Transport::Surfel, Transport::Restir };
        const char* Label[3] = { "visibility raster", "surfel GI", "ReSTIR" };
        for (int K = 0; K < 3; ++K)
        {
            std::vector<uint8_t> Rgb;
            Render(W, View, Order[K], Width, Height, Spp, Bounces, Rgb);
            for (int Hold = 0; Hold < 8; ++Hold) Frames.push_back(Rgb);   // ~1 s dwell on each path
            std::printf("[showcase] cycle: %s\n", Label[K]);
            std::fflush(stdout);
        }
        Frontier::RasterImage::WriteGif(OutPath, Width, Height, Frames, 12u);
        std::printf("[showcase] wrote %s (raster -> surfel -> ReSTIR)\n", OutPath.c_str());
        return 0;
    }

    // ── convergence: one rendered frame per surfel step, so the GIF IS the field filling in ────────────────
    // The first frame is the field at zero — direct light only — and each step adds one more propagation of
    // bounce through the cache. This is the thing a still cannot show: surfel GI is temporal by construction.
    if (Converge > 0u && Which == Transport::Surfel)
    {
        MeasureContext Context{ &W, Rays, 0u };
        std::vector<std::vector<uint8_t>> Frames;
        const Camera View = CameraFor(Point);
        for (uint32_t F = 0u; F < Converge; ++F)
        {
            std::vector<uint8_t> Rgb;
            Render(W, View, Which, Width, Height, Spp, Bounces, Rgb);
            Frames.push_back(std::move(Rgb));
            Context.Frame = F;
            W.Field.Step(MeasureSurfel, &Context);
            std::printf("[showcase] converge frame %u/%u\n", F + 1u, Converge);
            std::fflush(stdout);
        }
        // Hold the converged result on screen rather than snapping back to frame zero.
        for (int Hold = 0; Hold < 6; ++Hold) Frames.push_back(Frames.back());
        Frontier::RasterImage::WriteGif(OutPath, Width, Height, Frames, 14u);
        std::printf("[showcase] wrote %s (%zu frames, surfel field converging)\n", OutPath.c_str(), Frames.size());
        return 0;
    }

    if (Turntable > 0u)
    {
        std::vector<std::vector<uint8_t>> Frames;
        for (uint32_t F = 0u; F < Turntable; ++F)
        {
            const float Yaw = 360.0f * static_cast<float>(F) / static_cast<float>(Turntable);
            // Orbit the grid centre rather than spinning in place: the eye rides a circle of the same radius.
            const float Radius = std::sqrt(Point.Eye.x * Point.Eye.x + Point.Eye.y * Point.Eye.y);
            const float Angle = std::atan2(Point.Eye.x, Point.Eye.y) + Yaw * 3.14159265f / 180.0f;
            Viewpoint Orbit = Point;
            Orbit.Eye = { std::sin(Angle) * Radius, std::cos(Angle) * Radius, Point.Eye.z };
            const Camera View = MakeCamera(Orbit.Eye, V3{ 0.0f, 0.0f, 1.0f }, Point.FieldOfView);
            std::vector<uint8_t> Rgb;
            Render(W, View, Which, Width, Height, Spp, Bounces, Rgb);
            Frames.push_back(std::move(Rgb));
            std::printf("[showcase] turntable frame %u/%u\n", F + 1u, Turntable);
            std::fflush(stdout);
        }
        Frontier::RasterImage::WriteGif(OutPath, Width, Height, Frames, 12u);
        std::printf("[showcase] wrote %s (%u frames)\n", OutPath.c_str(), Turntable);
        return 0;
    }

    const Camera View = CameraFor(Point);
    std::vector<uint8_t> Rgb;
    Render(W, View, Which, Width, Height, Spp, Bounces, Rgb);
    Frontier::RasterImage::WritePng(OutPath, Width, Height, Rgb);
    std::printf("[showcase] wrote %s  (%s, %s, %ux%u)\n", OutPath.c_str(), ViewName.c_str(), PathName.c_str(), Width, Height);
    return 0;
}
