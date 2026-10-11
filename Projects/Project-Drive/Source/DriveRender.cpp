//============================================================================================================================================
// 📦 Projects/Project-Drive/Source/DriveRender.cpp — headless CPU reference RENDERER for Project-Drive
//============================================================================================================================================
//
//    The GPU-free mirror of what the Vulkan app draws for Project-Drive. It pulls the geometry out of exactly the
//    same headers the product reads — no re-authored stand-ins, no imported scene:
//
//        • the course   from DriveCourse.h            (EmitCourseTriangles — the very emitter the render side uses)
//        • the body     from ControlVehicleMesh.inl   (2924 tris, per-face material family straight from the .blend)
//        • the wheels   from ControlVehicleRimMesh.inl + ControlVehicleTyreMesh.inl (hub-local, posed per corner)
//        • the pose     from the REAL VehicleSolver   (socket geometry, XPBD soft tyres, Pacejka drivetrain, aero)
//
//    The vehicle is driven by the same scripted input as DriveTelemetry, so a frame rendered at t = 3.5 s shows the
//    car where the physics actually put it. Shading is a small CPU path tracer: one camera ray, a sun shadow ray,
//    one diffuse bounce, plus a mirror/specular bounce for the clearcoat, glass and metal families.
//
//    Build:  see Projects/Project-Drive/Makefile  (target: DriveRender)

#include "VehicleSolver.h"
#include "VehicleGeometry.h"
#include "DriveCourse.h"

#include "ControlVehicleMesh.inl"
#include "ControlVehicleRimMesh.inl"
#include "ControlVehicleTyreMesh.inl"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cerrno>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

using namespace Frontier::Vehicle;
namespace DC = Frontier::Drive;

//============================================================================================================================================
//  Minimal maths (deliberately local: this tool must build with plain g++ and nothing else)
//============================================================================================================================================
namespace R
{
struct V3 { float x = 0, y = 0, z = 0; };
inline V3 operator+(V3 a, V3 b) noexcept { return { a.x + b.x, a.y + b.y, a.z + b.z }; }
inline V3 operator-(V3 a, V3 b) noexcept { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
inline V3 operator*(V3 a, float s) noexcept { return { a.x * s, a.y * s, a.z * s }; }
inline V3 operator*(float s, V3 a) noexcept { return a * s; }
inline V3 operator*(V3 a, V3 b) noexcept { return { a.x * b.x, a.y * b.y, a.z * b.z }; }
inline V3 operator/(V3 a, float s) noexcept { return { a.x / s, a.y / s, a.z / s }; }
inline float Dot(V3 a, V3 b) noexcept { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline V3 Cross(V3 a, V3 b) noexcept { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
inline float Len(V3 a) noexcept { return std::sqrt(Dot(a, a)); }
inline V3 Norm(V3 a) noexcept { const float l = Len(a); return l > 1e-20f ? a * (1.0f / l) : V3{}; }

struct Q { float x = 0, y = 0, z = 0, w = 1; };
[[nodiscard]] inline V3 Rot(const Q& q, V3 v) noexcept
{
    // Hamilton product q * (v,0) * conj(q)
    const float tx = 2.0f * (q.y * v.z - q.z * v.y);
    const float ty = 2.0f * (q.z * v.x - q.x * v.z);
    const float tz = 2.0f * (q.x * v.y - q.y * v.x);
    return { v.x + q.w * tx + (q.y * tz - q.z * ty),
             v.y + q.w * ty + (q.z * tx - q.x * tz),
             v.z + q.w * tz + (q.x * ty - q.y * tx) };
}
[[nodiscard]] inline Q Mul(const Q& a, const Q& b) noexcept
{
    return { a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
             a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
             a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
             a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}
[[nodiscard]] inline Q FromQuat(const Quat& q) noexcept { return { q.x, q.y, q.z, q.w }; }
} // namespace R

//============================================================================================================================================
//  Triangle soup + BVH
//============================================================================================================================================
struct Tri
{
    R::V3 a, b, c;
    R::V3 na, nb, nc;      // per-corner normals (flat where the author gave none)
    uint32_t mat = 0;
};

// BVH sort key: the centroid is precomputed ONCE and never re-derived from a permuted index array, so the
// comparator cannot alias the range it is partitioning (the failure mode that made nth_element walk off the
// end of Order[]).
struct BvhItem { float c[3]; int idx; };

struct BvhNode
{
    R::V3 lo, hi;
    int left = -1, right = -1;   // interior children; -1 for a leaf
    int start = 0, count = 0;    // leaf: range into Order[]
};

class Scene
{
public:
    std::vector<Tri> Triangles;
    std::vector<int> Order;
    std::vector<BvhItem> Items;
    std::vector<BvhNode> Nodes;

    void Add(R::V3 a, R::V3 b, R::V3 c, uint32_t mat) noexcept
    {
        const R::V3 n = R::Norm(R::Cross(b - a, c - a));
        Triangles.push_back({ a, b, c, n, n, n, mat });
    }
    void Add(R::V3 a, R::V3 b, R::V3 c, R::V3 na, R::V3 nb, R::V3 nc, uint32_t mat) noexcept
    { Triangles.push_back({ a, b, c, na, nb, nc, mat }); }

    void Build() noexcept
    {
        const size_t n = Triangles.size();
        Items.clear(); Items.resize(n);
        for (size_t i = 0; i < n; ++i)
        {
            const Tri& t = Triangles[i];
            R::V3 c = (t.a + t.b + t.c) * (1.0f / 3.0f);
            if (!std::isfinite(c.x)) c.x = 0.0f;
            if (!std::isfinite(c.y)) c.y = 0.0f;
            if (!std::isfinite(c.z)) c.z = 0.0f;
            Items[i] = { { c.x, c.y, c.z }, static_cast<int>(i) };
        }
        Order.resize(n);
        Nodes.clear();
        Nodes.reserve(n * 2 + 1);
        BuildNode(0, static_cast<int>(n), 0);
        for (size_t i = 0; i < n; ++i) Order[i] = Items[i].idx;
    }

    // Closest hit. Returns false when nothing is struck before `tMax`.
    bool Hit(R::V3 o, R::V3 d, float tMax, float& outT, int& outTri) const noexcept
    {
        outT = tMax; outTri = -1;
        int stack[128]; int sp = 0; stack[sp++] = 0;
        while (sp > 0)
        {
            const BvhNode& n = Nodes[stack[--sp]];
            if (!RayBox(o, d, n.lo, n.hi, outT)) continue;
            if (n.count > 0)
            {
                for (int i = 0; i < n.count; ++i)
                {
                    const int ti = Order[n.start + i];
                    float t; float u, v;
                    if (RayTri(o, d, Triangles[ti], t, u, v) && t < outT && t > 1e-4f) { outT = t; outTri = ti; }
                }
            }
            else { stack[sp++] = n.left; stack[sp++] = n.right; }
        }
        return outTri >= 0;
    }

    // Any hit (shadow rays).
    bool Occluded(R::V3 o, R::V3 d, float tMax) const noexcept
    {
        int stack[128]; int sp = 0; stack[sp++] = 0;
        while (sp > 0)
        {
            const BvhNode& n = Nodes[stack[--sp]];
            if (!RayBox(o, d, n.lo, n.hi, tMax)) continue;
            if (n.count > 0)
            {
                for (int i = 0; i < n.count; ++i)
                { float t, u, v; if (RayTri(o, d, Triangles[Order[n.start + i]], t, u, v) && t < tMax && t > 1e-4f) return true; }
            }
            else { stack[sp++] = n.left; stack[sp++] = n.right; }
        }
        return false;
    }

private:
    static bool RayBox(R::V3 o, R::V3 d, R::V3 lo, R::V3 hi, float tMax) noexcept
    {
        float t0 = 1e-4f, t1 = tMax;
        const float od[3][2] = { { o.x, d.x }, { o.y, d.y }, { o.z, d.z } };
        const float bn[3][2] = { { lo.x, hi.x }, { lo.y, hi.y }, { lo.z, hi.z } };
        for (int a = 0; a < 3; ++a)
        {
            const float inv = 1.0f / (std::fabs(od[a][1]) < 1e-20f ? 1e-20f : od[a][1]);
            float ta = (bn[a][0] - od[a][0]) * inv;
            float tb = (bn[a][1] - od[a][0]) * inv;
            if (ta > tb) std::swap(ta, tb);
            t0 = std::max(t0, ta); t1 = std::min(t1, tb);
            if (t0 > t1) return false;
        }
        return true;
    }
    static bool RayTri(R::V3 o, R::V3 d, const Tri& t, float& outT, float& outU, float& outV) noexcept
    {
        const R::V3 e1 = t.b - t.a, e2 = t.c - t.a;
        const R::V3 p = R::Cross(d, e2);
        const float det = R::Dot(e1, p);
        if (std::fabs(det) < 1e-12f) return false;
        const float inv = 1.0f / det;
        const R::V3 tv = o - t.a;
        const float u = R::Dot(tv, p) * inv;
        if (u < -1e-5f || u > 1.00001f) return false;
        const R::V3 qv = R::Cross(tv, e1);
        const float v = R::Dot(d, qv) * inv;
        if (v < -1e-5f || u + v > 1.00001f) return false;
        const float tt = R::Dot(e2, qv) * inv;
        if (tt <= 1e-4f) return false;
        outT = tt; outU = u; outV = v; return true;
    }

    int BuildNode(int start, int count, int depth) noexcept
    {
        const int self = static_cast<int>(Nodes.size());
        Nodes.push_back({});
        R::V3 lo{ 1e30f, 1e30f, 1e30f }, hi{ -1e30f, -1e30f, -1e30f };
        for (int i = 0; i < count; ++i)
        {
            const Tri& t = Triangles[static_cast<size_t>(Items[static_cast<size_t>(start + i)].idx)];
            for (const R::V3* p : { &t.a, &t.b, &t.c })
            {
                lo = { std::min(lo.x, p->x), std::min(lo.y, p->y), std::min(lo.z, p->z) };
                hi = { std::max(hi.x, p->x), std::max(hi.y, p->y), std::max(hi.z, p->z) };
            }
        }
        Nodes[self].lo = lo; Nodes[self].hi = hi;
        if (count <= 4 || depth >= 40) { Nodes[self].start = start; Nodes[self].count = count; return self; }

        const R::V3 ext = hi - lo;
        const int axis = (ext.x >= ext.y && ext.x >= ext.z) ? 0 : (ext.y >= ext.z ? 1 : 2);
        std::nth_element(Items.begin() + start, Items.begin() + start + count / 2, Items.begin() + start + count,
                         [axis](const BvhItem& p, const BvhItem& q) { return p.c[axis] < q.c[axis]; });
        const int mid = std::max(1, count / 2);
        const int l = BuildNode(start, mid, depth + 1);
        const int r = BuildNode(start + mid, count - mid, depth + 1);
        Nodes[self].left = l; Nodes[self].right = r;
        return self;
    }
};

//============================================================================================================================================
//  Materials — the CourseMaterial families, in the same order as DriveCourse.h
//============================================================================================================================================
struct Material
{
    R::V3 Albedo{ 0.8f, 0.8f, 0.8f };
    R::V3 Emission{ 0, 0, 0 };
    float Specular = 0.0f;     // 0 = pure lambert, 1 = mirror
    float Roughness = 1.0f;
};

static const Material& MaterialFor(uint32_t id)
{
    static const Material Table[16] =
    {
        /* 0 MatCheckerLight    */ { { 0.62f, 0.62f, 0.63f }, {}, 0.02f, 0.85f },
        /* 1 MatCheckerDark     */ { { 0.055f, 0.055f, 0.060f }, {}, 0.05f, 0.60f },
        /* 2 MatSurround        */ { { 0.20f, 0.205f, 0.21f }, {}, 0.015f, 0.95f },
        /* 3 MatRamp            */ { { 0.42f, 0.20f, 0.16f }, {}, 0.02f, 0.90f },
        /* 4 MatBump            */ { { 0.75f, 0.60f, 0.10f }, {}, 0.02f, 0.90f },
        /* 5 MatCone            */ { { 0.90f, 0.35f, 0.06f }, {}, 0.03f, 0.80f },
        /* 6 MatBodyPaint       */ { { 0.030f, 0.075f, 0.30f }, {}, 0.55f, 0.10f },
        /* 7 MatVehicleGlass    */ { { 0.020f, 0.028f, 0.040f }, {}, 0.75f, 0.05f },
        /* 8 MatVehiclePlastic  */ { { 0.028f, 0.028f, 0.030f }, {}, 0.18f, 0.45f },
        /* 9 MatTyre            */ { { 0.032f, 0.032f, 0.034f }, {}, 0.06f, 0.70f },
        /*10 MatHub             */ { { 0.10f, 0.26f, 0.75f }, {}, 0.40f, 0.25f },
        /*11 MatBrake           */ { { 0.42f, 0.43f, 0.45f }, {}, 0.50f, 0.30f },
        /*12 MatVehicleTrim     */ { { 0.22f, 0.23f, 0.25f }, {}, 0.25f, 0.40f },
        /*13 MatHeadlight       */ { { 0.90f, 0.92f, 0.95f }, { 9.0f, 9.2f, 9.6f }, 0.30f, 0.15f },
        /*14 MatTaillight       */ { { 0.55f, 0.05f, 0.03f }, { 4.2f, 0.30f, 0.16f }, 0.30f, 0.15f },
        /*15 MatVehicleDefault  */ { { 0.62f, 0.62f, 0.62f }, {}, 0.10f, 0.60f },
    };
    return Table[id < 16u ? id : 15u];
}

//============================================================================================================================================
//  Sky — a compact analytic model (same shape the Project-Zero CPU reference uses), sun placed by hour angle
//============================================================================================================================================
struct Sky
{
    R::V3 SunDir{ 0, 0, 1 };
    R::V3 SunColour{ 1, 1, 1 };
    float SunIntensity = 4.0f;

    void Place(float sunHour) noexcept
    {
        // Hour angle: 12:00 = local noon (sun high), 6:00/18:00 = on the horizon.
        const float elev = 1.15f * std::cos((sunHour - 12.0f) * (3.14159265f / 12.0f));
        const float azim = (sunHour - 12.0f) * (3.14159265f / 12.0f) - 1.15f;
        const float ce = std::cos(elev), se = std::sin(elev);
        SunDir = R::Norm(R::V3{ -std::sin(azim) * ce, -0.35f * ce, se });
        SunDir = R::Norm(SunDir);
        const float h = std::max(0.0f, SunDir.z);
        const float warm = 1.0f - std::exp(-h * 4.5f);
        SunColour = { 1.0f, 0.55f + 0.42f * warm, 0.22f + 0.75f * warm * warm };
        SunIntensity = 0.25f + 7.5f * warm;
    }

    [[nodiscard]] R::V3 Sample(R::V3 d) const noexcept
    {
        const float up = std::max(0.0f, d.z);
        const R::V3 zenith{ 0.16f, 0.30f, 0.66f };
        const R::V3 horizon{ 0.62f, 0.68f, 0.78f };
        R::V3 sky = horizon * std::pow(1.0f - up, 3.0f) + zenith * std::pow(up, 0.55f);
        const float sun = std::max(0.0f, R::Dot(d, SunDir));
        sky = sky + SunColour * (SunIntensity * (std::pow(sun, 1400.0f) * 22.0f + std::pow(sun, 12.0f) * 0.28f));
        // ground hemisphere: a dim apron bounce instead of a void
        if (d.z < 0.0f) sky = { 0.055f, 0.058f, 0.062f };
        return sky;
    }
};

//============================================================================================================================================
//  Mock rigid chassis (identical integrator to DriveTelemetry / the FieldDemo suites)
//============================================================================================================================================
struct MockChassis
{
    Vec3  Position{};
    Quat  Orientation{ 0, 0, 0, 1 };
    Vec3  LinearVelocity{}, AngularVelocity{};
    Vec3  ForceAccum{}, TorqueAccum{};
    Vec3  InvInertiaDiag{};
    Vec3  Gravity{ 0.0f, 0.0f, -9.81f };
    float Mass = 1300.0f, LinearDamping = 0.0f, AngularDamping = 0.05f;

    [[nodiscard]] Quat Conjugate() const noexcept { return { -Orientation.x, -Orientation.y, -Orientation.z, Orientation.w }; }
    [[nodiscard]] Vec3 WorldAngularAccel(const Vec3& tw) const noexcept
    {
        const Vec3 tb = Conjugate().Rotate(tw);
        const Vec3 ab{ tb.x * InvInertiaDiag.x, tb.y * InvInertiaDiag.y, tb.z * InvInertiaDiag.z };
        return Orientation.Rotate(ab);
    }
    void ApplyForceAtPoint(const Vec3& f, const Vec3& p) noexcept { ForceAccum += f; TorqueAccum += Cross(p - Position, f); }
    void ApplyTorque(const Vec3& t) noexcept { TorqueAccum += t; }
    void Integrate(float dt) noexcept
    {
        ForceAccum += Gravity * Mass;
        LinearVelocity += ForceAccum * (dt / Mass);
        if (LinearDamping > 0) LinearVelocity = LinearVelocity * std::exp(-LinearDamping * dt);
        Position += LinearVelocity * dt;
        AngularVelocity += WorldAngularAccel(TorqueAccum) * dt;
        AngularVelocity = AngularVelocity * std::exp(-AngularDamping * dt);
        const Quat wq{ AngularVelocity.x, AngularVelocity.y, AngularVelocity.z, 0.0f };
        const Quat dq = QuatMul(wq, Orientation);
        Orientation = QuatNormalize(Quat{ Orientation.x + 0.5f * dt * dq.x, Orientation.y + 0.5f * dt * dq.y,
                                          Orientation.z + 0.5f * dt * dq.z, Orientation.w + 0.5f * dt * dq.w });
        ForceAccum = Vec3{}; TorqueAccum = Vec3{};
    }
    [[nodiscard]] ChassisState State() const noexcept { return { Position, Orientation, LinearVelocity, AngularVelocity }; }
};

//============================================================================================================================================
//  Frame capture: everything a render needs from one instant of the simulation
//============================================================================================================================================
struct Frame
{
    float T = 0.0f;
    R::V3 Pos{};
    R::Q  Rot{};
    R::V3 Hub[4]{};
    R::Q  HubRot[4]{};
    float Steer[4]{};
    float Spin[4]{};
    float Speed = 0.0f;
    bool  Airborne = false;
};

//============================================================================================================================================
//  Emitters — real geometry, straight out of the product headers
//============================================================================================================================================
static void EmitCourse(Scene& s)
{
    DC::EmitCourseTriangles([&](float ax, float ay, float az, float bx, float by, float bz,
                                float cx, float cy, float cz, uint32_t m)
    { s.Add({ ax, ay, az }, { bx, by, bz }, { cx, cy, cz }, m); });
}

static void EmitIndexed(Scene& s, const float* pos, const uint32_t* idx, const uint32_t* fam,
                        uint32_t triCount, uint32_t matOverride, R::V3 origin, R::Q rot)
{
    for (uint32_t t = 0; t < triCount; ++t)
    {
        const uint32_t i0 = idx[t * 3 + 0], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
        const R::V3 a = rot.w == 1.0f && rot.x == 0.0f && rot.y == 0.0f && rot.z == 0.0f
                          ? R::V3{ pos[i0 * 3 + 0], pos[i0 * 3 + 1], pos[i0 * 3 + 2] }
                          : R::Rot(rot, R::V3{ pos[i0 * 3 + 0], pos[i0 * 3 + 1], pos[i0 * 3 + 2] });
        const R::V3 b = rot.w == 1.0f && rot.x == 0.0f && rot.y == 0.0f && rot.z == 0.0f
                          ? R::V3{ pos[i1 * 3 + 0], pos[i1 * 3 + 1], pos[i1 * 3 + 2] }
                          : R::Rot(rot, R::V3{ pos[i1 * 3 + 0], pos[i1 * 3 + 1], pos[i1 * 3 + 2] });
        const R::V3 c = rot.w == 1.0f && rot.x == 0.0f && rot.y == 0.0f && rot.z == 0.0f
                          ? R::V3{ pos[i2 * 3 + 0], pos[i2 * 3 + 1], pos[i2 * 3 + 2] }
                          : R::Rot(rot, R::V3{ pos[i2 * 3 + 0], pos[i2 * 3 + 1], pos[i2 * 3 + 2] });
        s.Add(origin + a, origin + b, origin + c, matOverride != 0xFFFFFFFFu ? matOverride : fam[t]);
    }
}

[[nodiscard]] inline bool Finite(R::V3 v) noexcept { return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z); }

static void CheckFinite(const Scene& s, const char* stage, const Frame& f)
{
    for (size_t i = 0; i < s.Triangles.size(); ++i)
    {
        const Tri& t = s.Triangles[i];
        if (!Finite(t.a) || !Finite(t.b) || !Finite(t.c) || !Finite(t.na) || !Finite(t.nb) || !Finite(t.nc))
        {
            std::printf("[NaN] %s tri %zu (%g,%g,%g) (%g,%g,%g) n=(%g,%g,%g) mat=%u | pos=(%g,%g,%g) rot=(%g,%g,%g,%g)\n",
                        stage, i, t.a.x, t.a.y, t.a.z, t.b.x, t.b.y, t.b.z, t.na.x, t.na.y, t.na.z, t.mat,
                        f.Pos.x, f.Pos.y, f.Pos.z, f.Rot.x, f.Rot.y, f.Rot.z, f.Rot.w);
            std::fflush(stdout);
            return;
        }
    }
}

static void EmitVehicle(Scene& s, const Frame& f)
{
    namespace Body = Frontier::Drive::ControlVehicleMesh;
    EmitIndexed(s, Body::kPositions, Body::kTriangles, Body::kTriangleFamily,
                Body::kTriangleCount, 0xFFFFFFFFu, f.Pos, f.Rot);
    CheckFinite(s, "body", f);

    namespace Rim  = Frontier::Drive::ControlVehicleRimMesh;
    namespace Tyre = Frontier::Drive::ControlVehicleTyreMesh;
    for (int w = 0; w < 4; ++w)
    {
        const R::Q spin = R::FromQuat(Quat::AxisAngle(Vec3{ 0.0f, 1.0f, 0.0f }, f.Spin[w]));
        const R::Q pose = R::Mul(f.HubRot[w], spin);
        EmitIndexed(s, Rim::kPositions, Rim::kTriangles, Rim::kTriangleMaterial,
                    Rim::kTriangleCount, 0xFFFFFFFFu, f.Hub[w], pose);
        CheckFinite(s, "pre-tyre-w", f);
        EmitIndexed(s, Tyre::kPositions, Tyre::kTriangles, Tyre::kTriangleMaterial,
                    Tyre::kTriangleCount, DC::MatTyre, f.Hub[w], pose);
    }
}

//============================================================================================================================================
//  Camera
//============================================================================================================================================
struct Camera
{
    R::V3 Eye{}, Target{};
    float FovY = 45.0f;
    R::V3 Fwd{}, Right{}, Up{};
    void Finish() noexcept
    {
        Fwd = R::Norm(Target - Eye);
        Right = R::Norm(R::Cross(Fwd, R::V3{ 0, 0, 1 }));
        Up = R::Cross(Right, Fwd);
        if (std::fabs(Fwd.z) > 0.999f) { Right = { 0, 1, 0 }; Up = { -Fwd.z, 0, 0 }; }
    }
};

//============================================================================================================================================
//  Renderer
//============================================================================================================================================
struct RenderOptions
{
    int Width = 640, Height = 360;
    int Samples = 2;
    int MaxDepth = 3;
    float SunHour = 15.0f;
    float FovY = 42.0f;
};

static uint32_t RngState = 0x12345678u;
inline float Rng() noexcept
{
    RngState ^= RngState << 13; RngState ^= RngState >> 17; RngState ^= RngState << 5;
    return static_cast<float>(RngState) * (1.0f / 4294967296.0f);
}
inline R::V3 CosineSample(R::V3 n) noexcept
{
    const float u1 = Rng(), u2 = Rng();
    const float r = std::sqrt(u1), phi = 6.28318531f * u2;
    const R::V3 t = R::Norm(std::fabs(n.z) < 0.9f ? R::Cross(n, R::V3{ 0, 0, 1 }) : R::Cross(n, R::V3{ 1, 0, 0 }));
    const R::V3 b = R::Cross(n, t);
    return R::Norm(t * (r * std::cos(phi)) + b * (r * std::sin(phi)) + n * std::sqrt(std::max(0.0f, 1.0f - u1)));
}

// Per-material coverage of the PRIMARY ray. This is the objective "is the car actually in frame, and how
// much of the frame is it" tally — no eyeballing required.
static long long gMatHits[17]{};
static long long gRayCount = 0;
static long long gShadowRays = 0;

static R::V3 Radiance(const Scene& sc, const Sky& sky, R::V3 o, R::V3 d, int depth) noexcept
{
    R::V3 result{ 0, 0, 0 };
    R::V3 throughput{ 1, 1, 1 };
    for (int bounce = 0; bounce < 6; ++bounce)
    {
        float t; int tri;
        if (bounce == 0) ++gRayCount;
        if (!sc.Hit(o, d, 1e30f, t, tri)) { result = result + throughput * sky.Sample(d); break; }
        const Tri& T = sc.Triangles[tri];
        if (bounce == 0) ++gMatHits[T.mat < 16u ? T.mat : 16u];
        const R::V3 p = o + d * t;
        R::V3 n = R::Norm(T.na + T.nb + T.nc);
        if (R::Dot(n, d) > 0.0f) n = n * -1.0f;
        const Material& M = MaterialFor(T.mat);

        result = result + throughput * M.Emission;

        // Sun (explicit, shadowed)
        if (M.Specular < 0.9f)
        {
            const float ndl = std::max(0.0f, R::Dot(n, sky.SunDir));
            ++gShadowRays;
            if (ndl > 0.0f && !sc.Occluded(p + n * 2e-3f, sky.SunDir, 1e30f))
                result = result + throughput * (M.Albedo * (sky.SunColour * (sky.SunIntensity * ndl * 0.3183f)));
        }
        // Sky dome (explicit, shadowed by a cosine lobe)
        {
            const R::V3 sd = CosineSample(n);
            ++gShadowRays;
            if (!sc.Occluded(p + n * 2e-3f, sd, 1e30f))
                result = result + throughput * (M.Albedo * sky.Sample(sd) * 0.9f);
        }

        // Specular / mirror lobe for clearcoat, glass and metal
        if (M.Specular > 0.0f && bounce < 2)
        {
            const float r = Rng();
            if (r < M.Specular)
            {
                R::V3 refl = d - n * (2.0f * R::Dot(n, d));
                if (M.Roughness > 0.05f)
                {
                    const R::V3 j = CosineSample(n) * (M.Roughness * 0.45f);
                    refl = R::Norm(refl + j);
                }
                o = p + n * 2e-3f; d = refl;
                throughput = throughput * (M.Albedo * 0.65f + R::V3{ 0.35f, 0.35f, 0.35f });
                continue;
            }
        }
        if (bounce + 1 >= depth) break;

        // Diffuse bounce
        const R::V3 nd = CosineSample(n);
        o = p + n * 2e-3f; d = nd;
        throughput = throughput * M.Albedo;
        if (throughput.x + throughput.y + throughput.z < 0.02f) break;
    }
    return result;
}

static void RenderFrame(const Scene& sc, const Sky& sky, const Camera& cam, const RenderOptions& opt,
                        std::vector<float>& out)
{
    const float aspect = static_cast<float>(opt.Width) / static_cast<float>(opt.Height);
    const float fovy = opt.FovY > 0.0f ? opt.FovY : cam.FovY;
    const float half = std::tan(0.5f * fovy * (3.14159265f / 180.0f));
    const int spp = opt.Samples * opt.Samples;
    out.assign(static_cast<size_t>(opt.Width) * opt.Height * 3, 0.0f);
    for (int y = 0; y < opt.Height; ++y)
    {
        for (int x = 0; x < opt.Width; ++x)
        {
            R::V3 acc{ 0, 0, 0 };
            for (int sy = 0; sy < opt.Samples; ++sy)
                for (int sx = 0; sx < opt.Samples; ++sx)
                {
                    const float u = (static_cast<float>(x) + (sx + 0.5f) / opt.Samples) / opt.Width * 2.0f - 1.0f;
                    const float v = 1.0f - (static_cast<float>(y) + (sy + 0.5f) / opt.Samples) / opt.Height * 2.0f;
                    const R::V3 dir = R::Norm(cam.Fwd + cam.Right * (u * half * aspect) + cam.Up * (v * half));
                    acc = acc + Radiance(sc, sky, cam.Eye, dir, opt.MaxDepth);
                }
            const size_t o = (static_cast<size_t>(y) * opt.Width + x) * 3;
            out[o + 0] = acc.x / spp; out[o + 1] = acc.y / spp; out[o + 2] = acc.z / spp;
        }
    }
}

static bool WritePpm(const char* path, const std::vector<float>& img, int w, int h, float exposure)
{
    FILE* f = std::fopen(path, "wb");
    if (!f) { std::fprintf(stderr, "[DriveRender] CANNOT WRITE %s (errno %d)\n", path, errno); return false; }
    std::fprintf(f, "P6\n%d %d\n255\n", w, h);
    std::vector<uint8_t> row(static_cast<size_t>(w) * 3);
    for (int y = 0; y < h; ++y)
    {
        for (int x = 0; x < w; ++x)
        {
            const size_t o = (static_cast<size_t>(y) * w + x) * 3;
            for (int c = 0; c < 3; ++c)
            {
                float v = img[o + c] * exposure;
                v = v / (1.0f + v);                                 // Reinhard
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
//  main
//============================================================================================================================================
int main(int argc, char** argv)
{
    std::string outDir = (argc > 1) ? argv[1] : "Projects/Project-Drive/Diagnostics/Render";
    std::error_code DirError;
    std::filesystem::create_directories(outDir, DirError);   // the tool must not silently render into a void
    RenderOptions opt;
    std::string mode = "chase";
    float simTime = 12.0f;
    float captureHz = 6.0f;            // captured poses per simulated second
    bool  parked = false;              // --static: hold the car still and move only the camera
    for (int i = 2; i < argc; ++i)
    {
        const std::string a = argv[i];
        auto next = [&](float def) { return (i + 1 < argc) ? static_cast<float>(std::atof(argv[++i])) : def; };
        if      (a == "--width")  opt.Width = static_cast<int>(next(opt.Width));
        else if (a == "--height") opt.Height = static_cast<int>(next(opt.Height));
        else if (a == "--spp")    { opt.Samples = static_cast<int>(next(2)); if (opt.Samples < 1) opt.Samples = 1; }
        else if (a == "--sun")    opt.SunHour = next(opt.SunHour);
        else if (a == "--mode")   mode = (i + 1 < argc) ? argv[++i] : mode;
        else if (a == "--time")   simTime = next(simTime);
        else if (a == "--fps")    { captureHz = next(captureHz); if (captureHz < 0.05f) captureHz = 0.05f; }
        else if (a == "--static") parked = true;
        else std::fprintf(stderr, "[DriveRender] unknown flag %s\n", a.c_str());
    }

    // ---- build the static course once -------------------------------------------------------------------------
    Scene CourseScene;
    EmitCourse(CourseScene);
    CourseScene.Build();
    std::printf("[DriveRender] course: %zu triangles, %zu BVH nodes\n", CourseScene.Triangles.size(), CourseScene.Nodes.size());
    std::fflush(stdout);

    // ---- run the real solver, capturing a pose every render frame -----------------------------------------------
    const float dt = 1.0f / 240.0f;
    const float T = simTime;
    const int steps = static_cast<int>(T / dt);
    const int stride = std::max(1, static_cast<int>(std::lround((1.0f / dt) / captureHz)));

    VehicleGeometry g;
    VehicleSolverConfiguration cfg; cfg.ActiveScheme = DrivingScheme::PacejkaDrivetrain;
    ApplyGeometry(cfg, g);
    cfg.Aero.Enabled = true;

    MockChassis ch;
    ch.Position = { 0.0f, 0.0f, g.CoMHeight };
    ch.Mass = cfg.ChassisMass;
    ch.InvInertiaDiag = g.InvInertia();

    VehicleSolver ctl;
    VehicleSolver::Hooks h;
    h.ReadChassis = [&] { return ch.State(); };
    h.ApplyForceAtPoint = [&](const Vec3& f, const Vec3& p) { ch.ApplyForceAtPoint(f, p); };
    h.ApplyTorque = [&](const Vec3& t) { ch.ApplyTorque(t); };
    h.Ground = [](const Vec3& p, Vec3& s, Vec3& n)
    {
        float Sx, Sy, Sz, Nx, Ny, Nz;
        DC::CourseSurface(p.x, p.y, p.z, Sx, Sy, Sz, Nx, Ny, Nz);
        s = Vec3{ Sx, Sy, Sz }; n = Vec3{ Nx, Ny, Nz }; return true;
    };
    ctl.Build(cfg, h, ch.State());

    auto InputAt = [](float t) -> DriverInput
    {
        DriverInput in{};
        if (t < 1.0f) return in;
        in.Throttle = 1.0f;
        if (t >= 2.5f && t < 6.5f) in.Steer = 0.14f * std::sin(2.0f * 3.14159265f * (t - 2.5f) / 2.2f);
        if (t > 9.0f) { in.Throttle = 0.0f; in.Brake = 1.0f; }
        return in;
    };

    std::vector<Frame> Frames;
    float spin[4] = { 0, 0, 0, 0 };
    const auto simStart = std::chrono::steady_clock::now();
    for (int s = 0; s <= steps; ++s)
    {
        const float t = s * dt;
        ctl.AssignInput(InputAt(t));
        ctl.Step(dt);
        ch.Integrate(dt);
        const auto& tl = ctl.Telemetry();
        for (uint32_t w = 0; w < tl.WheelCount && w < 4; ++w) spin[w] += tl.Wheels[w].WheelOmega * dt;

        if (s % stride == 0)
        {
            Frame f;
            f.T = t;
            f.Pos = { ch.Position.x, ch.Position.y, ch.Position.z };
            f.Rot = R::FromQuat(ch.Orientation);
            for (uint32_t w = 0; w < tl.WheelCount && w < 4; ++w)
            {
                f.Hub[w] = { tl.Wheels[w].HubPosition.x, tl.Wheels[w].HubPosition.y, tl.Wheels[w].HubPosition.z };
                f.HubRot[w] = R::FromQuat(tl.Wheels[w].HubRotation);
                f.Steer[w] = tl.Wheels[w].SteerAngleRad;
                f.Spin[w] = spin[w];
            }
            f.Speed = tl.SpeedMetresPerSecond;
            bool air = true;
            for (uint32_t w = 0; w < tl.WheelCount; ++w) if (tl.Wheels[w].InContact) air = false;
            f.Airborne = air;
            Frames.push_back(f);
        }
    }
    const double simMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - simStart).count();
    std::printf("[DriveRender] simulation: %zu captured frames in %.0f ms\n", Frames.size(), simMs);

    // ---- render -------------------------------------------------------------------------------------------------
    Sky sky; sky.Place(opt.SunHour);
    std::vector<float> img;
    std::string timingPath = outDir + "/rendertiming.csv";
    FILE* tf = std::fopen(timingPath.c_str(), "w");
    if (tf) std::fprintf(tf, "frame,t,render_ms,triangles,bvh_nodes,speed_mps,x,y,z,airborne\n");

    int idx = 0;
    double totalRenderMs = 0.0;
    for (const Frame& f : Frames)
    {
        const Frame& Car = parked ? Frames.front() : f;
        Scene sc = CourseScene;                 // static course is copied, not rebuilt
        EmitVehicle(sc, Car);
        sc.Build();

        Camera cam;
        if (mode == "chase")
        {
            const R::V3 back = R::Rot(Car.Rot, R::V3{ -7.2f, -2.6f, 2.55f });
            cam.Eye = Car.Pos + back;
            cam.Target = Car.Pos + R::Rot(Car.Rot, R::V3{ 2.0f, 0.0f, 0.45f });
        }
        else if (mode == "trackside")
        {
            cam.Eye = { 14.0f, -16.0f, 2.2f };
            cam.Target = Car.Pos + R::V3{ 0, 0, 0.5f };
        }
        else // orbit: a full turn spread evenly over the captured frames
        {
            const float a = 6.28318531f * static_cast<float>(idx) / static_cast<float>(std::max<size_t>(1, Frames.size()));
            cam.Eye = f.Pos + R::V3{ 8.6f * std::cos(a), 8.6f * std::sin(a), 2.9f };
            cam.Target = f.Pos + R::V3{ 0, 0, 0.45f };
        }
        cam.FovY = 42.0f;
        cam.Finish();

        const auto r0 = std::chrono::steady_clock::now();
        RenderFrame(sc, sky, cam, opt, img);
        const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - r0).count();
        totalRenderMs += ms;

        if (idx % 8 == 0)
        {
            static const char* Names[17] =
            { "checkerLight","checkerDark","surround","ramp","bump","cone","bodyPaint","glass","plastic","tyre",
              "hub","brake","trim","headlight","taillight","default","SKY" };
            std::printf("[cover] frame %d:", idx);
            for (int m = 0; m < 17; ++m)
                if (gMatHits[m] > 0)
                    std::printf(" %s=%.2f%%", Names[m], 100.0 * static_cast<double>(gMatHits[m]) / std::max<long long>(1, gRayCount));
            std::printf("  (rays=%lld shadow=%lld)\n", gRayCount, gShadowRays);
            std::fflush(stdout);
            for (int m = 0; m < 17; ++m) gMatHits[m] = 0;
            gRayCount = 0; gShadowRays = 0;
        }

        char path[1024];
        std::snprintf(path, sizeof(path), "%s/%s_%03d.ppm", outDir.c_str(), mode.c_str(), idx);
        WritePpm(path, img, opt.Width, opt.Height, 1.35f);
        if (tf) std::fprintf(tf, "%d,%.4f,%.1f,%zu,%zu,%.2f,%.2f,%.2f,%.2f,%d\n",
                             idx, f.T, ms, sc.Triangles.size(), sc.Nodes.size(),
                             f.Speed, f.Pos.x, f.Pos.y, f.Pos.z, f.Airborne ? 1 : 0);
        std::printf("[DriveRender] frame %3d  t=%5.2fs  %5.1f ms  %6zu tris  (%s)\n",
                    idx, f.T, ms, sc.Triangles.size(), path);
        std::fflush(stdout);
        ++idx;
    }
    if (tf) { std::fclose(tf); }
    std::printf("[DriveRender] %d frames, %.1f ms total (%.1f ms/frame average), %dx%d, %d spp\n",
                idx, totalRenderMs, totalRenderMs / std::max(1, idx), opt.Width, opt.Height, opt.Samples * opt.Samples);
    return 0;
}
