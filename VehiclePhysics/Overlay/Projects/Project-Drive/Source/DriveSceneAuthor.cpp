//============================================================================================================================================
//                                                     DRIVESCENEAUTHOR.CPP
//============================================================================================================================================
#include "DriveSceneAuthor.h"
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
    using namespace Frontier::Drive::ControlVehicleMesh;
    auto P = [&](uint32_t i)
    { return Vector3{ kPositions[i*3+0], kPositions[i*3+1], kPositions[i*3+2] - ComHeight }; };
    for (uint32_t t = 0; t < kTriangleCount; ++t)
        AppendFace(P(kTriangles[t*3+0]), P(kTriangles[t*3+1]), P(kTriangles[t*3+2]), Material);
}

//------------------------------------------------------------------------------------------------------------------------ procedural wheel (cylinder centred at origin, axle along +Y — the spin axis)
void DriveSceneAuthor::AppendWheel(const Vector3& C, float Radius, float HalfWidth, uint32_t Segments, uint32_t Material) noexcept
{
    const Vector3 SideL{ C.x, C.y + HalfWidth, C.z };   // +Y face centre
    const Vector3 SideR{ C.x, C.y - HalfWidth, C.z };   // -Y face centre
    for (uint32_t i = 0; i < Segments; ++i)
    {
        const float a0 = 2.0f * kPi * float(i)      / float(Segments);
        const float a1 = 2.0f * kPi * float(i + 1u) / float(Segments);
        const Vector3 d0{ std::cos(a0), 0.0f, std::sin(a0) }, d1{ std::cos(a1), 0.0f, std::sin(a1) };
        const Vector3 oL0{ C.x + d0.x*Radius, C.y + HalfWidth, C.z + d0.z*Radius };
        const Vector3 oL1{ C.x + d1.x*Radius, C.y + HalfWidth, C.z + d1.z*Radius };
        const Vector3 oR0{ C.x + d0.x*Radius, C.y - HalfWidth, C.z + d0.z*Radius };
        const Vector3 oR1{ C.x + d1.x*Radius, C.y - HalfWidth, C.z + d1.z*Radius };
        const float u0 = float(i)/float(Segments), u1 = float(i+1u)/float(Segments);
        // tread (two tris), smooth radial normals
        { const Vector3 P[3]={oR0,oR1,oL1}; const Vector3 N[3]={d0,d1,d1}; const float Uv[3][2]={{u0,0},{u1,0},{u1,1}}; AppendTriangle(P,N,Uv,Material); }
        { const Vector3 P[3]={oR0,oL1,oL0}; const Vector3 N[3]={d0,d1,d0}; const float Uv[3][2]={{u0,0},{u1,1},{u0,1}}; AppendTriangle(P,N,Uv,Material); }
        // side walls (fans to the two face centres)
        { const Vector3 P[3]={SideL,oL0,oL1}; const Vector3 N[3]={{0,1,0},{0,1,0},{0,1,0}}; const float Uv[3][2]={{.5f,.5f},{u0,1},{u1,1}}; AppendTriangle(P,N,Uv,Material); }
        { const Vector3 P[3]={SideR,oR1,oR0}; const Vector3 N[3]={{0,-1,0},{0,-1,0},{0,-1,0}}; const float Uv[3][2]={{.5f,.5f},{u1,0},{u0,0}}; AppendTriangle(P,N,Uv,Material); }
    }
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

    // 6 — flake clearcoat body paint (System B automotive finite-flake, profile 4 "Metallic Cobalt").
    MaterialSlabDescriptor paint;
    AuthorAutomotiveShowcase(paint, /*profile=*/4u, /*sweep=*/0.5f);
    Materials.push_back(MakeMaterial("Body — cobalt flake clearcoat", paint));               // 6

    // 7 — tyre rubber.
    MaterialSlabDescriptor tyre = Dielectric(0.015f,0.015f,0.016f, 0.75f);
    tyre.CoatWeight = 0.0f;
    Materials.push_back(MakeMaterial("Tyre rubber", tyre));                                   // 7

    // 8 — hub (metallic, kept for the Materials-enum alignment even though the wheel is one primitive).
    MaterialSlabDescriptor hub; hub.BaseColor[0]=0.62f; hub.BaseColor[1]=0.63f; hub.BaseColor[2]=0.66f;
    hub.BaseMetalness=1.0f; hub.SpecularRoughness=0.25f;
    Materials.push_back(MakeMaterial("Wheel hub", hub));                                      // 8
}

//------------------------------------------------------------------------------------------------------------------------ Construct + Export
void DriveSceneAuthor::Construct() noexcept
{
    Triangles.clear(); CornerNormals.clear(); Spans.clear();
    AuthorMaterials();

    Frontier::Vehicle::VehicleGeometry geo;   // real ControlVehicle socket data (dims, CoM height, wheel layout)
    const float comH   = geo.CoMHeight;        // shift the body so local origin = CoM
    const float radius = geo.TyreRadius;
    const float halfW  = 0.1175f;              // matches the physics wheel half-width

    // span 0 — body (dynamic) -> instance 0
    { auto s = OpenSpan("Vehicle body", /*Dynamic=*/true); (void)s;
      AppendVehicleBody(comH, /*MatBodyPaint=*/6u); }

    // spans 1..4 — wheels (dynamic) -> instances 1..4 (FL, FR, RL, RR); each centred at the origin.
    const char* wheelNames[4] = { "Wheel FL", "Wheel FR", "Wheel RL", "Wheel RR" };
    for (int w = 0; w < 4; ++w)
    { auto s = OpenSpan(wheelNames[w], /*Dynamic=*/true); (void)s;
      AppendWheel(Vector3{0,0,0}, radius, halfW, /*Segments=*/24u, /*MatTyre=*/7u); }

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
