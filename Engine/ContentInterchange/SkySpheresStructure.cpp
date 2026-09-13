//============================================================================================================================================
//                                                   SKYSPHERESSTRUCTURE.CPP
//============================================================================================================================================
// See SkySpheresStructure.h. The same three spheres and ground plane used for the images in Renders/, so the
// offline proof and the live renderer show the same scene and any disagreement between them is visible.
//
//    Layout (RH Z-up, metres; camera starts near the origin looking +Y):
//
//        red    r = 1.15  at (−2.7,  9.5, 1.15)      warm matte, the sunlit-albedo reference
//        blue   r = 0.78  at ( 0.2,  7.6, 0.78)      cool matte, shows sky tint most clearly
//        olive  r = 1.55  at ( 3.0, 11.2, 1.55)      the largest, so its shadow is the long one
//        ground 80 × 80 m sand-grey diffuse, centred at the origin
//
//    🔴 NO LUMINAIRE, DELIBERATELY. Every photon comes from the sun and the sky. If the celestial path breaks,
//    this scene goes black — a far more useful failure than a fill light quietly covering for it.

#include "SkySpheresStructure.h"
#include "SceneCodec.h"
#include "../DeviceExchange/OrientationClassifier.h"
#include <cmath>
#include <cstring>

namespace Frontier {

namespace {

constexpr float kPi = 3.14159265358979f;

MaterialDescriptor MakeMaterial(const char* Name)
{
    MaterialDescriptor D; D.Name = Name; D.Slabs.emplace_back(); return D;
}

void SetColor(float* Target, float R, float G, float B) { Target[0] = R; Target[1] = G; Target[2] = B; }

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                        CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

void SkySpheresStructure::Construct() noexcept
{
    Triangles.clear(); CornerNormals.clear(); Materials.clear();

    // ── Materials ───────────────────────────────────────────────────────────────────────────────────────────────────
    //    All four are matte. That is not a limitation being apologised for — a Lambertian surface shows the
    //    COLOUR OF ITS ILLUMINATION honestly, with no specular highlight to hide behind. A chrome sphere under a
    //    broken sky can still look impressive; a matte one cannot.
    {   // 0 — ground
        MaterialDescriptor D = MakeMaterial("ground");
        SetColor(D.Slabs[0].BaseColor, 0.33f, 0.31f, 0.28f);
        D.Slabs[0].SpecularWeight = 0.0f; D.Slabs[0].SpecularRoughness = 1.0f;
        Materials.push_back(D);
    }
    {   // 1 — red
        MaterialDescriptor D = MakeMaterial("sphere_red");
        SetColor(D.Slabs[0].BaseColor, 0.72f, 0.26f, 0.20f);
        D.Slabs[0].SpecularWeight = 0.0f; D.Slabs[0].SpecularRoughness = 1.0f;
        Materials.push_back(D);
    }
    {   // 2 — blue
        MaterialDescriptor D = MakeMaterial("sphere_blue");
        SetColor(D.Slabs[0].BaseColor, 0.30f, 0.52f, 0.72f);
        D.Slabs[0].SpecularWeight = 0.0f; D.Slabs[0].SpecularRoughness = 1.0f;
        Materials.push_back(D);
    }
    {   // 3 — olive
        MaterialDescriptor D = MakeMaterial("sphere_olive");
        SetColor(D.Slabs[0].BaseColor, 0.80f, 0.70f, 0.32f);
        D.Slabs[0].SpecularWeight = 0.0f; D.Slabs[0].SpecularRoughness = 1.0f;
        Materials.push_back(D);
    }

    // ── Ground ──────────────────────────────────────────────────────────────────────────────────────────────────────
    //    80 × 80 m. Large enough that the far edge is well past where the sky's own horizon appears, so the
    //    skyline in frame is the ATMOSPHERE's horizon and not the end of a plane. A 6 m plane like the
    //    shader-ball level would put a visible edge right through the shot.
    AppendQuad(Vector3{ -40.0f, -40.0f, 0.0f }, Vector3{ 40.0f, -40.0f, 0.0f },
               Vector3{  40.0f,  40.0f, 0.0f }, Vector3{ -40.0f, 40.0f, 0.0f }, 0u, 0.25f);

    // ── The three spheres ───────────────────────────────────────────────────────────────────────────────────────────
    //    32 × 64 is finer than the shader-ball grid because these are the subject rather than a swatch: at the
    //    terminator, where the sun's light falls off, a coarse sphere shows its facets as banding.
    AppendSphere(Vector3{ -2.7f,  9.5f, 1.15f }, 1.15f, 1u, 32u, 64u);
    AppendSphere(Vector3{  0.2f,  7.6f, 0.78f }, 0.78f, 2u, 32u, 64u);
    AppendSphere(Vector3{  3.0f, 11.2f, 1.55f }, 1.55f, 3u, 32u, 64u);

    // ⚠️ No emissive quad is appended. The luminaire convention shared by the Cornell and shader-ball levels is
    //    deliberately NOT followed here: the sun is the light, and it arrives through the celestial record and
    //    the reservoir's sun light index rather than as scene geometry.
}

//------------------------------------------------------------------------------------------------------------------------
//                                                         EXPORT
//------------------------------------------------------------------------------------------------------------------------

bool SkySpheresStructure::Export(const std::string& Path, std::string* Error) const noexcept
{
    SceneEncodeConfiguration Configuration;
    Configuration.Name = "SkySpheres";
    Configuration.CornerNormals = &CornerNormals;
    Configuration.WriteTexcoords = true;
    return SceneCodec::Encode(Path, Triangles, Materials, Error, Configuration);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       PRIMITIVES
//------------------------------------------------------------------------------------------------------------------------
// Identical in form to ShaderBallStructure's, so the two levels produce geometry the importer treats the same
// way. Kept local rather than shared because the two structures are otherwise independent and a shared base
// class would couple two levels that have no reason to move together.

void SkySpheresStructure::AppendTriangle(const Vector3 P[3], const Vector3 N[3], const float Uv[3][2], uint32_t Material) noexcept
{
    TriangleIndex T{};
    T.VertexAlphaX = P[0].x; T.VertexAlphaY = P[0].y; T.VertexAlphaZ = P[0].z;
    T.VertexBetaX  = P[1].x; T.VertexBetaY  = P[1].y; T.VertexBetaZ  = P[1].z;
    T.VertexGammaX = P[2].x; T.VertexGammaY = P[2].y; T.VertexGammaZ = P[2].z;
    std::memcpy(&T.MaterialSlot, &Material, sizeof(Material));
    T.TextureAlphaU = Uv[0][0]; T.TextureAlphaV = Uv[0][1];
    T.TextureBetaU  = Uv[1][0]; T.TextureBetaV  = Uv[1][1];
    T.TextureGammaU = Uv[2][0]; T.TextureGammaV = Uv[2][1];
    Triangles.push_back(T);
    CornerNormals.push_back(N[0]); CornerNormals.push_back(N[1]); CornerNormals.push_back(N[2]);
}

void SkySpheresStructure::AppendQuad(const Vector3& A, const Vector3& B, const Vector3& C, const Vector3& D, uint32_t Material, float UvScale) noexcept
{
    const Vector3 Cross = OrientationClassifier::CrossProduct(B - A, C - A);
    const float   Len   = Cross.Length();
    const Vector3 N     = Len > 0.0f ? Cross / Len : Vector3{ 0.0f, 0.0f, 1.0f };
    const Vector3 Ns[3] = { N, N, N };
    const float   SizeU = (B - A).Length() * UvScale, SizeV = (D - A).Length() * UvScale;
    const Vector3 P0[3] = { A, B, C }; const float U0[3][2] = { { 0.0f, 0.0f }, { SizeU, 0.0f }, { SizeU, SizeV } };
    const Vector3 P1[3] = { A, C, D }; const float U1[3][2] = { { 0.0f, 0.0f }, { SizeU, SizeV }, { 0.0f, SizeV } };
    AppendTriangle(P0, Ns, U0, Material);
    AppendTriangle(P1, Ns, U1, Material);
}

void SkySpheresStructure::AppendSphere(const Vector3& Centre, float Radius, uint32_t Material, uint32_t Rings, uint32_t Segments) noexcept
{
    // UV sphere, poles on ±Z, CCW outward winding, u = longitude / 2π, v = latitude from the north pole.
    const auto Point = [&](uint32_t Ring, uint32_t Segment, Vector3& P, Vector3& N, float Uv[2])
    {
        const float V     = static_cast<float>(Ring) / static_cast<float>(Rings);
        const float U     = static_cast<float>(Segment) / static_cast<float>(Segments);
        const float Theta = V * kPi, Phi = U * 2.0f * kPi;
        N  = Vector3{ std::sin(Theta) * std::cos(Phi), std::sin(Theta) * std::sin(Phi), std::cos(Theta) };
        P  = Centre + N * Radius;
        Uv[0] = U; Uv[1] = V;
    };
    for (uint32_t Ring = 0u; Ring < Rings; ++Ring)
        for (uint32_t Segment = 0u; Segment < Segments; ++Segment)
        {
            Vector3 P00, P01, P10, P11, N00, N01, N10, N11; float U00[2], U01[2], U10[2], U11[2];
            Point(Ring,      Segment,      P00, N00, U00);
            Point(Ring,      Segment + 1u, P01, N01, U01);
            Point(Ring + 1u, Segment,      P10, N10, U10);
            Point(Ring + 1u, Segment + 1u, P11, N11, U11);
            if (Ring != 0u)         { const Vector3 P[3] = { P00, P10, P01 }; const Vector3 N[3] = { N00, N10, N01 }; const float Uv[3][2] = { { U00[0], U00[1] }, { U10[0], U10[1] }, { U01[0], U01[1] } }; AppendTriangle(P, N, Uv, Material); }
            if (Ring + 1u != Rings) { const Vector3 P[3] = { P01, P10, P11 }; const Vector3 N[3] = { N01, N10, N11 }; const float Uv[3][2] = { { U01[0], U01[1] }, { U10[0], U10[1] }, { U11[0], U11[1] } }; AppendTriangle(P, N, Uv, Material); }
        }
}

} // namespace Frontier
