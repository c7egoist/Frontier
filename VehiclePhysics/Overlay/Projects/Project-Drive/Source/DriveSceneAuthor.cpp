//============================================================================================================================================
// 📦 Projects/Project-Drive/Source/DriveSceneAuthor.cpp — builds the `--scene drive` level: course, ControlVehicle, wheels
//============================================================================================================================================
#include "DriveSceneAuthor.h"
#include "DriveWheelMesh.h"
#include "../../../Engine/ContentInterchange/AutomotiveShowcasePresets.h"
#include "../../../Engine/ContentInterchange/SceneCodec.h"
#include "DriveCourse.h"
#include "ControlVehicleMesh.inl"

#include <cmath>
#include <cstring>
#include <fstream>

namespace Frontier {
namespace Drive {

namespace {
constexpr float kPi = 3.14159265358979f;

Vector3 Sub(const Vector3& a, const Vector3& b) noexcept { return { a.x-b.x, a.y-b.y, a.z-b.z }; }
Vector3 Cross(const Vector3& a, const Vector3& b) noexcept
{ return { a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x }; }
Vector3 Normalize(const Vector3& v) noexcept
{ const float l = std::sqrt(v.x*v.x + v.y*v.y + v.z*v.z); return l > 0.0f ? Vector3{ v.x/l, v.y/l, v.z/l } : Vector3{0,0,1}; }

// One OpenPBR slab wrapped in a named material.
MaterialDescriptor MakeMaterial(const char* Name, const MaterialSlabDescriptor& Slab) noexcept
{ MaterialDescriptor m; m.Name = Name; m.Slabs.push_back(Slab); return m; }

} // namespace

//------------------------------------------------------------------------------------------------------------------------ span bookkeeping (verbatim ShowcaseStructure pattern)
DriveSceneAuthor::SpanScope::~SpanScope() noexcept
{
    if (Spans == nullptr || Triangles == nullptr || Span >= Spans->size()) return;
    TriangleSpanRecord& S = (*Spans)[Span];
    const uint32_t Now = static_cast<uint32_t>(Triangles->size());
    S.TriangleCount = Now >= S.FirstTriangle ? Now - S.FirstTriangle : 0u;
}

DriveSceneAuthor::SpanScope DriveSceneAuthor::OpenSpan(const char* Name, bool Dynamic) noexcept
{
    TriangleSpanRecord S;
    S.FirstTriangle = static_cast<uint32_t>(Triangles.size());
    if (Name != nullptr) S.Name = Name;
    S.Dynamic = Dynamic;
    Spans.push_back(std::move(S));
    SpanScope Scope; Scope.Spans = &Spans; Scope.Triangles = &Triangles;
    Scope.Span = static_cast<uint32_t>(Spans.size()) - 1u;
    return Scope;
}

//------------------------------------------------------------------------------------------------------------------------ triangle emit
void DriveSceneAuthor::AppendTriangle(const Vector3 P[3], const Vector3 N[3], const float Uv[3][2], uint32_t Material) noexcept
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

void DriveSceneAuthor::AppendFace(const Vector3& A, const Vector3& B, const Vector3& C, uint32_t Material) noexcept
{
    const Vector3 N = Normalize(Cross(Sub(B, A), Sub(C, A)));
    const Vector3 P[3] = { A, B, C }; const Vector3 Ns[3] = { N, N, N };
    const float Uv[3][2] = { { 0.0f, 0.0f }, { 1.0f, 0.0f }, { 0.0f, 1.0f } };
    AppendTriangle(P, Ns, Uv, Material);
}

//------------------------------------------------------------------------------------------------------------------------ vehicle body (ControlVehicleMesh, shifted so local origin = centre of mass)
void DriveSceneAuthor::AppendVehicleBody(float ComHeight, uint32_t Material) noexcept
{
    (void)Material; // the authored per-triangle family in kTriangleMaterial is authoritative.
    using namespace Frontier::Drive::ControlVehicleMesh;
    auto Raw = [&](uint32_t i)
    { return Vector3{ kPositions[i*3+0], kPositions[i*3+1], kPositions[i*3+2] }; };
    // 🔴 Rebase model vertices onto the CoM, NOT onto ComHeight directly. The model origin sits 0.41715 m above
    //    the ground (axle socket +0.0914 less the 0.50855 tyre radius), so subtracting the ground-referenced CoM
    //    height buried the whole body by exactly that offset — the car looked dragged along the floor.
    Frontier::Vehicle::VehicleGeometry Geometry;
    Geometry.CoMHeight = ComHeight;
    const float Rebase = Geometry.CoMModelZ();
    auto Local = [&](const Vector3& P) { return Vector3{P.x, P.y, P.z - Rebase}; };
    // 🔴 Use the AUTHORED corner normals and texture coordinates, not AppendFace's flat-normal/degenerate-UV
    //    fallback.  AppendFace writes { N, N, N } and a constant { (0,0), (1,0), (0,1) } per triangle, which
    //    costs two visible things: the shell renders faceted rather than Smooth-by-Angle (the banding that
    //    reads as overlapping geometry), and every triangle shares one UV triangle, so the finite-flake lobe
    //    -- which is placed through the UV parameterisation via SlateGlintUvScale -- repeats identically per
    //    triangle and reads as blotching instead of metallic sparkle.  Both streams are in the .blend.
    for (uint32_t t = 0; t < kTriangleCount; ++t)
    {
        const Vector3 P[3] = { Local(Raw(kTriangles[t*3+0])),
                               Local(Raw(kTriangles[t*3+1])),
                               Local(Raw(kTriangles[t*3+2])) };
        const Vector3 Ns[3] = {
            Vector3{ kCornerNormals[t*9+0], kCornerNormals[t*9+1], kCornerNormals[t*9+2] },
            Vector3{ kCornerNormals[t*9+3], kCornerNormals[t*9+4], kCornerNormals[t*9+5] },
            Vector3{ kCornerNormals[t*9+6], kCornerNormals[t*9+7], kCornerNormals[t*9+8] } };
        const float Uv[3][2] = { { kTexcoords[t*6+0], kTexcoords[t*6+1] },
                                 { kTexcoords[t*6+2], kTexcoords[t*6+3] },
                                 { kTexcoords[t*6+4], kTexcoords[t*6+5] } };
        AppendTriangle(P, Ns, Uv, kTriangleMaterial[t]);
    }
}

//------------------------------------------------------------------------------------------------------------------------ wheel (axle along +Y) — rest pose of the shared DriveWheelMesh surface
// Emits the SAME surface DriveSceneMirror draws per frame; the only difference is that this lattice is the
//    undeformed cylinder while the mirror's is XPBDSoftTyre's live node set. Rings/segments/spokes/materials all
//    come from DriveWheelMesh.h, so an exported wheel and a simulated wheel can never drift apart in topology.
void DriveSceneAuthor::AppendWheel(const Vector3& C, float Radius, float HalfWidth, uint32_t Segments, uint32_t Material) noexcept
{
    (void)Material;
    Frontier::Vehicle::VehicleGeometry geo;
    WheelTreadLattice lattice;
    lattice.RingCount    = kDriveWheelRingCount;
    lattice.SegmentCount = (Segments < 8u) ? 8u : Segments;
    lattice.RimRadius    = geo.TyreRimRadius;
    lattice.HalfWidth    = HalfWidth;
    lattice.SpokeCount   = kDriveWheelSpokeCount;

    std::vector<float> tread(static_cast<size_t>(lattice.RingCount) * lattice.SegmentCount * 3u, 0.0f);
    FillRestTreadLattice(tread.data(), lattice.RingCount, lattice.SegmentCount, Radius, HalfWidth);
    lattice.Tread = tread.data();

    EmitWheelSurface(lattice, MatTyre, MatHub, MatBrake,
        [&](const float A[3], const float B[3], const float D[3],
            const float NA[3], const float NB[3], const float ND[3], uint32_t Slot)
        {
            const Vector3 P[3] = { Vector3{C.x + A[0], C.y + A[1], C.z + A[2]},
                                   Vector3{C.x + B[0], C.y + B[1], C.z + B[2]},
                                   Vector3{C.x + D[0], C.y + D[1], C.z + D[2]} };
            const Vector3 N[3] = { Vector3{NA[0], NA[1], NA[2]},
                                   Vector3{NB[0], NB[1], NB[2]},
                                   Vector3{ND[0], ND[1], ND[2]} };
            const float Uv[3][2] = { {0.0f, 0.0f}, {1.0f, 0.0f}, {1.0f, 1.0f} };
            AppendTriangle(P, N, Uv, Slot);
        });
}

//------------------------------------------------------------------------------------------------------------------------ static course (world space; reuses the shared DriveCourse geometry)
void DriveSceneAuthor::AppendCourse() noexcept
{
    EmitCourseTriangles([&](float ax,float ay,float az, float bx,float by,float bz,
                            float cx,float cy,float cz, uint32_t m)
    { AppendFace(Vector3{ax,ay,az}, Vector3{bx,by,bz}, Vector3{cx,cy,cz}, m); });
}

//------------------------------------------------------------------------------------------------------------------------ materials (index-aligned with DriveCourse.h Materials enum)
void DriveSceneAuthor::AuthorMaterials() noexcept
{
    Materials.clear();
    auto Dielectric = [](float r, float g, float b, float rough) {
        MaterialSlabDescriptor s; s.BaseColor[0]=r; s.BaseColor[1]=g; s.BaseColor[2]=b;
        s.BaseMetalness=0.0f; s.SpecularRoughness=rough; s.SpecularIor=1.5f; return s; };

    Materials.push_back(MakeMaterial("Checker light", Dielectric(0.82f,0.82f,0.84f, 0.35f))); // 0
    Materials.push_back(MakeMaterial("Checker dark",  Dielectric(0.05f,0.05f,0.06f, 0.35f))); // 1
    Materials.push_back(MakeMaterial("Surround",      Dielectric(0.35f,0.36f,0.38f, 0.55f))); // 2
    Materials.push_back(MakeMaterial("Ramp",          Dielectric(0.42f,0.43f,0.45f, 0.40f))); // 3
    Materials.push_back(MakeMaterial("Speed bump",    Dielectric(0.90f,0.72f,0.08f, 0.45f))); // 4
    Materials.push_back(MakeMaterial("Cone",          Dielectric(0.95f,0.35f,0.05f, 0.40f))); // 5

    // ── 6..16: the eleven families ControlVehicle.blend authors ────────────────────────────────────────────
    // Every constant below is the value read out of the Principled BSDF node tree by ExtractVehicle.py.  The
    // legacy Material.r/g/b fields in the .blend are all 0.8 placeholders and are deliberately NOT used.

    // 6 — MetalicCoat.  A real automotive finish: metallic flake basecoat under a dielectric clearcoat.  The
    // engine already models this exactly (Engine/ContentInterchange/AutomotiveShowcasePresets.h), so drive it
    // through the engine's own authoring rather than hand-rolling a look.  Profile 4 is the plain metallic
    // flake family — no candy dye (1), no glitter (2), no thin-film iridescence (3) — which is the right
    // carrier for an opaque coloured basecoat.  The preset then gets the ONE thing it cannot know: the hue the
    // artist chose, base (0.68, 0.80, 0.00) linear.  Coat Weight 1.0 and Coat Roughness 0.03 are likewise the
    // authored values and override the preset's roughness sweep.
    MaterialSlabDescriptor paint;
    AuthorAutomotiveShowcase(paint, 4u /* Metallic Cobalt = plain metallic flake */, 0.50f);
    // Take the preset VERBATIM and override exactly one thing: the hue.  How the preset gets its depth matters
    // and is easy to get wrong -- its saturation comes from a DARK, saturated base at high metalness
    // (cobalt is 0.014, 0.045, 0.13), not from a bright pigment.  Handing it the authored 0.68/0.80/0.00
    // directly, at either metalness 0 or 0.85, renders a pale washed sage: measured saturation 0.29 against the
    // authored 1.00, because a bright base under a full clearcoat is mostly sky reflection.  So carry the
    // artist's HUE at the preset's own value instead, which is the same ratio the cobalt entry uses.
    paint.BaseColor[0] = 0.5100f; paint.BaseColor[1] = 0.6000f; paint.BaseColor[2] = 0.0150f;
    // The preset's F82 tint is BLUISH (0.72, 0.77, 0.82) because its family is cobalt.  Left alone it tints
    // every flake highlight blue, and against this level's bright open sky that beat the pigment outright --
    // measured green-minus-blue went NEGATIVE (-0.038), i.e. the yellow-green car rendered blue-grey.  A
    // metal's specular tint has to share the metal's hue.
    paint.SpecularColor[0] = 0.86f; paint.SpecularColor[1] = 0.95f; paint.SpecularColor[2] = 0.34f;
    paint.BaseMetalness  = 1.0f;         // the flakes are the reflector; the pigment rides in the coat
    paint.CoatRoughness  = 0.03f;        // authored Coat Roughness -- a harder clear than the preset's sweep
    // The preset's UV scale of 1 is tuned for the showcase's ~1 m spheres.  The car is 6.2 m long, so at scale 1
    // each flake smears across whole panels and reads as blotchy noise rather than sparkle.
    paint.SlateGlintUvScale = 8.0f;
    Materials.push_back(MakeMaterial("MetalicCoat — metallic-flake basecoat under clearcoat", paint));  // 6

    // 7 — Glass.  The .blend expresses the glazing as Alpha 0.087 over a black base, which is an EEVEE alpha
    // dodge rather than a transmissive material; carried over literally it renders as opaque black.  Author it
    // the way Project-Zero's material library authors transmissive glass (ShowcaseStructure row 1): full
    // TransmissionWeight, a near-mirror specular lobe and a tint that carries the smoke.  Authored alpha 0.087
    // becomes the transmission colour, so the glazing stays as dark as the artist made it but now transmits,
    // refracts and reflects instead of swallowing the light.
    MaterialSlabDescriptor glass;
    glass.BaseColor[0] = 1.0f; glass.BaseColor[1] = 1.0f; glass.BaseColor[2] = 1.0f;
    glass.BaseMetalness       = 0.0f;
    glass.TransmissionWeight  = 1.0f;
    glass.TransmissionColor[0] = 0.087f; glass.TransmissionColor[1] = 0.094f; glass.TransmissionColor[2] = 0.105f;
    glass.SpecularWeight      = 1.0f;
    glass.SpecularRoughness   = 0.01f;
    glass.SpecularIor         = 1.52f;   // soda-lime automotive glazing
    glass.GeometryThinWalled  = true;    // the .blend glazing is a single-sided shell, not a solid block
    Materials.push_back(MakeMaterial("Glass — smoked transmissive cockpit glazing", glass));            // 7

    // 8 — Plastic: authored black, matte, non-metallic.  No coat: it must read visibly duller than the paint.
    MaterialSlabDescriptor plastic = Dielectric(0.0f, 0.0f, 0.0f, 0.5f);
    plastic.CoatWeight = 0.0f;
    Materials.push_back(MakeMaterial("Plastic — lower trim, splitter and grille", plastic));            // 8

    // 9 — Rubber / StandardRubber.002: authored base 0.037 grey, roughness 0.761.
    MaterialSlabDescriptor tyre = Dielectric(0.03741f, 0.03741f, 0.03741f, 0.76087f);
    tyre.CoatWeight = 0.0f;
    Materials.push_back(MakeMaterial("StandardRubber — tyre carcass and tread", tyre));                 // 9

    // 10 — Material.024, the mag accent.  Authored emission (0.0, 0.277, 1.0) at strength 1.0: the blue glow
    // visible on the wheels in the .blend viewport.
    MaterialSlabDescriptor hub; hub.BaseColor[0]=0.42f; hub.BaseColor[1]=0.44f; hub.BaseColor[2]=0.49f;
    hub.BaseMetalness=1.0f; hub.SpecularRoughness=0.16f;
    hub.EmissionColor[0]=0.0f; hub.EmissionColor[1]=0.277313f; hub.EmissionColor[2]=1.0f;
    hub.EmissionLuminance = 40.0f;
    Materials.push_back(MakeMaterial("Material.024 — mag accent, blue emissive", hub));                 // 10

    // 11 — brake disc and caliper.  Scene-authored: the .blend has no separate brake material.
    MaterialSlabDescriptor brake; brake.BaseColor[0]=0.30f; brake.BaseColor[1]=0.075f; brake.BaseColor[2]=0.025f;
    brake.BaseMetalness=0.82f; brake.SpecularRoughness=0.29f;
    Materials.push_back(MakeMaterial("Brake disc and caliper", brake));                                 // 11

    // 12 — Plastic2: authored light grey (0.8), the nose wedge and secondary trim.
    MaterialSlabDescriptor trim = Dielectric(0.8f, 0.8f, 0.8f, 0.5f);
    Materials.push_back(MakeMaterial("Plastic2 — secondary trim and nose wedge", trim));                // 12

    // 13 — FrontLight: authored white emission at strength 48.7.  Carried as luminance so the headlamps are a
    // real light source for the GI paths rather than a bright albedo.
    MaterialSlabDescriptor head = Dielectric(0.8f, 0.8f, 0.8f, 0.5f);
    head.EmissionColor[0]=1.0f; head.EmissionColor[1]=1.0f; head.EmissionColor[2]=1.0f;
    head.EmissionLuminance = 48.699997f * 40.0f;
    Materials.push_back(MakeMaterial("FrontLight — headlamp emitter", head));                           // 13

    // 14 — RearLight: authored red emission (1.0, 0.0, 0.016) at 6.5, with the artist's IOR 8.0 lens.
    MaterialSlabDescriptor tail = Dielectric(0.8f, 0.8f, 0.8f, 0.5f);
    tail.EmissionColor[0]=1.0f; tail.EmissionColor[1]=0.0f; tail.EmissionColor[2]=0.016442f;
    tail.EmissionLuminance = 6.5f * 40.0f;
    tail.SpecularIor = 8.0f;
    Materials.push_back(MakeMaterial("RearLight — tail lens emitter", tail));                           // 14

    // 15 — Material.016 / Dots Stroke: authored black, plain dielectric.
    Materials.push_back(MakeMaterial("Material.016 — dark plate", Dielectric(0.0f, 0.0f, 0.0f, 0.5f))); // 15

    // 16 — PROTO-X.002 carries totcol = 0 in the .blend, so Blender itself falls back to its default grey.
    // Reproduce that fallback rather than guessing a family for it.
    Materials.push_back(MakeMaterial("Unassigned — Blender default grey", Dielectric(0.8f,0.8f,0.8f,0.5f))); // 16
}

//------------------------------------------------------------------------------------------------------------------------ Construct + Export
void DriveSceneAuthor::Construct() noexcept
{
    Triangles.clear(); CornerNormals.clear(); Spans.clear();
    AuthorMaterials();

    Frontier::Vehicle::VehicleGeometry geo;   // real ControlVehicle socket data (dims, CoM height, wheel layout)
    const float comH   = geo.CoMHeight;        // shift the body so local origin = CoM
    const float radius = geo.TyreRadius;
    const float halfW  = 0.5f * geo.TyreWidth; // measured section width (ControlVehicle.blend RubberFL)

    // span 0 — body (dynamic) -> instance 0.  Its faces are partitioned into MAMetalicCoat, MAGlass and MAPlastic.
    { auto s = OpenSpan("ControlVehicle — paint / glass / plastic", /*Dynamic=*/true); (void)s;
      AppendVehicleBody(comH, MatBodyPaint); }

    // spans 1..4 — wheels (dynamic) -> instances 1..4 (FL, FR, RL, RR).  Every wheel emits MARubber + hub + brake.
    const char* wheelNames[4] = { "XPBD Tyre FL", "XPBD Tyre FR", "XPBD Tyre RL", "XPBD Tyre RR" };
    for (int w = 0; w < 4; ++w)
    { auto s = OpenSpan(wheelNames[w], /*Dynamic=*/true); (void)s;
      AppendWheel(Vector3{0,0,0}, radius, halfW, /*Segments=*/kDriveWheelSegmentCount, MatTyre); }
    // 📝 Rim/mag spokes are off for now (kDriveWheelSpokeCount = 0): the wheel closes with a plain hub face while
    //    the tyre itself is the thing under review. Restoring them is one constant, not a rewrite.

    // span 5 — course (static) -> instances 5.. (one per material used)
    { auto s = OpenSpan("Course", /*Dynamic=*/false); (void)s;
      AppendCourse(); }
}

bool DriveSceneAuthor::Export(const std::string& Path, std::string* Error) const noexcept
{
    SceneEncodeConfiguration Configuration;
    Configuration.Name           = "DriveCourse.r" + std::to_string(kDriveSceneRevision);
    Configuration.CornerNormals  = &CornerNormals;
    Configuration.WriteTexcoords = true;
    Configuration.Spans          = &Spans;
    return SceneCodec::Encode(Path, Triangles, Materials, Error, Configuration);
}

//------------------------------------------------------------------------------------------------------------------------ revision check (cheap header scan for the stamped scene name)
bool DriveSceneMatchesRevision(const std::string& Path) noexcept
{
    std::ifstream f(Path, std::ios::binary);
    if (!f) return false;
    std::string head(4096, '\0');
    f.read(&head[0], static_cast<std::streamsize>(head.size()));
    head.resize(static_cast<size_t>(f.gcount()));
    const std::string marker = "DriveCourse.r" + std::to_string(kDriveSceneRevision);
    return head.find(marker) != std::string::npos;
}

} // namespace Drive
} // namespace Frontier
