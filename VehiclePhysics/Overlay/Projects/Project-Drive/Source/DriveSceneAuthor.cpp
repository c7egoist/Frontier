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

// The original ControlVehicle .blend owns four named appearance families: MAGlass, MAMetalicCoat,
// MAPlastic/MAPlastic2 and MARubber.  The dependency-free body extraction deliberately flattened the mesh to
// positions and triangles (there is no Blender material-index stream in ControlVehicleMesh.inl), so recover the
// authored families from their unambiguous source-space regions.  This is intentionally a small, documented mapping
// rather than an all-body paint fallback: the cabin glazing, lower trim/splitter/grille and painted shell stay
// separate material batches in every exported DriveCourse scene.
uint32_t ClassifyControlVehicleFace(const Vector3& A, const Vector3& B, const Vector3& C) noexcept
{
    const Vector3 P{ (A.x + B.x + C.x) / 3.0f, (A.y + B.y + C.y) / 3.0f, (A.z + B.z + C.z) / 3.0f };
    const Vector3 N = Normalize(Cross(Sub(B, A), Sub(C, A)));
    const float Side = std::fabs(P.y);

    // Dark, slightly blue cockpit glazing: side windows plus the forward/back sloped screen surfaces.
    const bool CockpitEnvelope = P.z > 0.62f && P.z < 1.31f && P.x > -2.05f && P.x < 1.62f;
    const bool GlazingFacing = Side > 0.47f || std::fabs(N.x) > 0.48f;
    if (CockpitEnvelope && GlazingFacing)
        return MatVehicleGlass;

    // Plastic undertray/side-skirt, lower fascia and the two bumper/grille end regions.
    const bool LowerTrim = P.z < 0.16f || (Side > 0.98f && P.z < 0.46f);
    const bool EndFascia = (P.x > 2.72f && P.z < 0.50f) || (P.x < -2.72f && P.z < 0.57f);
    if (LowerTrim || EndFascia)
        return MatVehiclePlastic;

    return MatBodyPaint;
}
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
    (void)Material; // retained in the declaration for source compatibility; per-face family assignment is authoritative.
    using namespace Frontier::Drive::ControlVehicleMesh;
    auto Raw = [&](uint32_t i)
    { return Vector3{ kPositions[i*3+0], kPositions[i*3+1], kPositions[i*3+2] }; };
    auto Local = [&](const Vector3& P) { return Vector3{P.x, P.y, P.z - ComHeight}; };
    for (uint32_t t = 0; t < kTriangleCount; ++t)
    {
        const Vector3 A = Raw(kTriangles[t*3+0]);
        const Vector3 B = Raw(kTriangles[t*3+1]);
        const Vector3 C = Raw(kTriangles[t*3+2]);
        AppendFace(Local(A), Local(B), Local(C), ClassifyControlVehicleFace(A, B, C));
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
        [&](const float A[3], const float B[3], const float D[3], uint32_t Slot)
        {
            AppendFace(Vector3{C.x + A[0], C.y + A[1], C.z + A[2]},
                       Vector3{C.x + B[0], C.y + B[1], C.z + B[2]},
                       Vector3{C.x + D[0], C.y + D[1], C.z + D[2]}, Slot);
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

    // 6 — System-B cobalt automotive paint.  Use a deliberately high finite-flake population (not a sparse
    // glint accent): each painted panel has 6.0 density, 1 mm-scale UV placement and a distinct low-roughness
    // dielectric clearcoat.  The settings are the same OpenPBR fields used by the ReSTIR material evaluator.
    MaterialSlabDescriptor paint = Dielectric(0.018f, 0.045f, 0.28f, 0.28f);
    paint.SlateAutomotiveProfile = 1.0f;
    paint.SlateAutomotiveSweep   = 0.0f;
    paint.SlateGlintDensity      = 6.0f;
    paint.SlateGlintUvScale      = 1.0f;
    paint.CoatWeight             = 1.0f;
    paint.CoatColor[0] = 1.0f; paint.CoatColor[1] = 1.0f; paint.CoatColor[2] = 1.0f;
    paint.CoatRoughness = 0.055f;
    paint.CoatIor       = 1.5f;
    Materials.push_back(MakeMaterial("MAMetalicCoat — dense cobalt finite-flake clearcoat", paint)); // 6

    // 7 — the source's MAGlass family: tinted, high-IOR glazing with a clear reflected lobe.
    MaterialSlabDescriptor glass = Dielectric(0.018f,0.050f,0.085f,0.055f);
    glass.SpecularIor = 1.52f;
    glass.CoatWeight = 1.0f; glass.CoatRoughness = 0.025f; glass.CoatIor = 1.52f;
    Materials.push_back(MakeMaterial("MAGlass — smoked cockpit glazing", glass));                   // 7

    // 8 — MAPlastic / MAPlastic2.  It is non-metallic and visibly rougher than paint; no accidental body-wide coat.
    MaterialSlabDescriptor plastic = Dielectric(0.012f,0.014f,0.018f,0.46f);
    plastic.CoatWeight = 0.0f;
    Materials.push_back(MakeMaterial("MAPlastic — lower trim, splitter and grille", plastic));       // 8

    // 9 — MARubber / MAStandardRubber.002 tyre sidewall and tread.
    MaterialSlabDescriptor tyre = Dielectric(0.012f,0.013f,0.015f,0.82f);
    tyre.CoatWeight = 0.0f;
    Materials.push_back(MakeMaterial("MARubber — XPBD tyre carcass", tyre));                           // 9

    // 10 / 11 — wheel and brake treatments stay physically distinct from the rubber.
    MaterialSlabDescriptor hub; hub.BaseColor[0]=0.42f; hub.BaseColor[1]=0.44f; hub.BaseColor[2]=0.49f;
    hub.BaseMetalness=1.0f; hub.SpecularRoughness=0.16f;
    Materials.push_back(MakeMaterial("Wheel hub — machined alloy", hub));                              // 10
    MaterialSlabDescriptor brake; brake.BaseColor[0]=0.30f; brake.BaseColor[1]=0.075f; brake.BaseColor[2]=0.025f;
    brake.BaseMetalness=0.82f; brake.SpecularRoughness=0.29f;
    Materials.push_back(MakeMaterial("Brake disc and caliper", brake));                               // 11
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
