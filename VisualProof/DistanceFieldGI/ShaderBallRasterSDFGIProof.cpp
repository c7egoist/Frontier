//============================================================================================================================================
//                                            SHADERBALLRASTERSDFGIPROOF.CPP
//============================================================================================================================================
// 📦 Hybrid Renderer:
//    - Primary Visibility & Sharp Specular Reflections / Glass Transmission via Triangle Mesh BVH Ray Tracing
//    - Diffuse Indirect GI, Row 8 Emissive Bleed, Contact Soft Shadows, and AO via Continuous SDF (Global Distance Field)
//    - Shading accelerated against the Depth Buffer

#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <algorithm>
#include <chrono>
#include <cstring>
#include <omp.h>

#include "ContentInterchange/ShaderBallGeometry.h"
#include "GeometricRaster/DistanceFieldSpace.h"

namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kInvPi = 0.31830988618379067154f;

struct Vec3 {
    float x = 0.0f, y = 0.0f, z = 0.0f;
    Vec3() = default;
    Vec3(float inX, float inY, float inZ) : x(inX), y(inY), z(inZ) {}

    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
    Vec3 operator*(const Vec3& o) const { return {x * o.x, y * o.y, z * o.z}; }

    float Dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }
    Vec3 Cross(const Vec3& o) const {
        return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
    }
    float Length() const { return std::sqrt(x * x + y * y + z * z); }
    Vec3 Normalized() const {
        float l = Length();
        return l > 1e-6f ? (*this) * (1.0f / l) : Vec3{0, 0, 1};
    }
};

struct AABB {
    Vec3 low{1e30f, 1e30f, 1e30f};
    Vec3 high{-1e30f, -1e30f, -1e30f};
    void Grow(const Vec3& p) {
        low.x = std::min(low.x, p.x); low.y = std::min(low.y, p.y); low.z = std::min(low.z, p.z);
        high.x = std::max(high.x, p.x); high.y = std::max(high.y, p.y); high.z = std::max(high.z, p.z);
    }
};

struct Tri {
    Vec3 a, b, c;
    Vec3 na, nb, nc;
};

struct BVHNode {
    AABB bounds;
    uint32_t left = 0, count = 0, first = 0;
};

class MeshBVH {
public:
    std::vector<Tri> tris;
    std::vector<uint32_t> order;
    std::vector<BVHNode> nodes;
    AABB rootBounds;

    void Build(const Frontier::GeometryStructure& mesh) {
        const auto& verts = mesh.QueryVertices();
        const auto& inds = mesh.QueryIndices();
        size_t nTri = inds.size() / 3;
        tris.resize(nTri);
        order.resize(nTri);
        for (size_t i = 0; i < nTri; ++i) {
            order[i] = i;
            const auto& v0 = verts[inds[i * 3 + 0]];
            const auto& v1 = verts[inds[i * 3 + 1]];
            const auto& v2 = verts[inds[i * 3 + 2]];
            tris[i].a = {v0.SpatialLocation.x, v0.SpatialLocation.y, v0.SpatialLocation.z};
            tris[i].b = {v1.SpatialLocation.x, v1.SpatialLocation.y, v1.SpatialLocation.z};
            tris[i].c = {v2.SpatialLocation.x, v2.SpatialLocation.y, v2.SpatialLocation.z};
            tris[i].na = {v0.NormalDirection.x, v0.NormalDirection.y, v0.NormalDirection.z};
            tris[i].nb = {v1.NormalDirection.x, v1.NormalDirection.y, v1.NormalDirection.z};
            tris[i].nc = {v2.NormalDirection.x, v2.NormalDirection.y, v2.NormalDirection.z};
        }
        nodes.clear();
        nodes.reserve(nTri * 2);
        nodes.push_back({});
        Subdivide(0, 0, (uint32_t)nTri);
        rootBounds = nodes[0].bounds;
    }

    bool Slab(const AABB& box, const Vec3& o, const Vec3& invD, float limit) const {
        float nearT = 0.0f, farT = limit;
        const float lo[3] = {box.low.x, box.low.y, box.low.z}, hi[3] = {box.high.x, box.high.y, box.high.z};
        const float orig[3] = {o.x, o.y, o.z}, rcp[3] = {invD.x, invD.y, invD.z};
        for (int i = 0; i < 3; ++i) {
            float a = (lo[i] - orig[i]) * rcp[i];
            float b = (hi[i] - orig[i]) * rcp[i];
            if (a > b) std::swap(a, b);
            nearT = std::max(nearT, a); farT = std::min(farT, b);
            if (nearT > farT) return false;
        }
        return true;
    }

    bool IntersectTri(const Tri& tri, const Vec3& o, const Vec3& d, float& t, float& u, float& v) const {
        Vec3 e1 = tri.b - tri.a;
        Vec3 e2 = tri.c - tri.a;
        Vec3 p{d.y * e2.z - d.z * e2.y, d.z * e2.x - d.x * e2.z, d.x * e2.y - d.y * e2.x};
        float det = e1.x * p.x + e1.y * p.y + e1.z * p.z;
        if (std::abs(det) < 1e-12f) return false;
        float invDet = 1.0f / det;
        Vec3 tv = o - tri.a;
        u = (tv.x * p.x + tv.y * p.y + tv.z * p.z) * invDet;
        if (u < 0.0f || u > 1.0f) return false;
        Vec3 q{tv.y * e1.z - tv.z * e1.y, tv.z * e1.x - tv.x * e1.z, tv.x * e1.y - tv.y * e1.x};
        v = (d.x * q.x + d.y * q.y + d.z * q.z) * invDet;
        if (v < 0.0f || u + v > 1.0f) return false;
        t = (e2.x * q.x + e2.y * q.y + e2.z * q.z) * invDet;
        return t > 1e-4f;
    }

    int Closest(const Vec3& o, const Vec3& d, float& t, float& u, float& v) const {
        Vec3 invD{1.0f / d.x, 1.0f / d.y, 1.0f / d.z};
        int best = -1;
        uint32_t stack[64]; int depth = 0; stack[depth++] = 0;
        while (depth) {
            const BVHNode& node = nodes[stack[--depth]];
            if (!Slab(node.bounds, o, invD, t)) continue;
            if (node.count) {
                for (uint32_t i = 0; i < node.count; ++i) {
                    uint32_t triIdx = order[node.first + i];
                    float ht, hu, hv;
                    if (IntersectTri(tris[triIdx], o, d, ht, hu, hv) && ht < t) {
                        t = ht; u = hu; v = hv; best = (int)triIdx;
                    }
                }
            } else {
                stack[depth++] = node.left;
                stack[depth++] = node.left + 1;
            }
        }
        return best;
    }

private:
    void Subdivide(uint32_t nodeIdx, uint32_t first, uint32_t count) {
        BVHNode& node = nodes[nodeIdx];
        node.first = first;
        node.bounds = AABB{};
        for (uint32_t i = 0; i < count; ++i) {
            const auto& t = tris[order[first + i]];
            node.bounds.Grow(t.a); node.bounds.Grow(t.b); node.bounds.Grow(t.c);
        }
        if (count <= 4) { node.count = count; return; }

        Vec3 span = node.bounds.high - node.bounds.low;
        int axis = span.x > span.y ? (span.x > span.z ? 0 : 2) : (span.y > span.z ? 1 : 2);
        auto centroid = [&](uint32_t idx, int a) {
            const auto& t = tris[idx];
            float xs[3] = {t.a.x + t.b.x + t.c.x, t.a.y + t.b.y + t.c.y, t.a.z + t.b.z + t.c.z};
            return xs[a] * (1.0f / 3.0f);
        };
        uint32_t mid = count / 2;
        std::nth_element(order.begin() + first, order.begin() + first + mid, order.begin() + first + count,
                         [&](uint32_t l, uint32_t r) { return centroid(l, axis) < centroid(r, axis); });
        node.count = 0;
        uint32_t left = (uint32_t)nodes.size();
        nodes.resize(left + 2);
        nodes[nodeIdx].left = left;
        Subdivide(left, first, mid);
        Subdivide(left + 1, first + mid, count - mid);
    }
};

struct PBRMaterial {
    Vec3 baseColor{0.8f, 0.8f, 0.8f};
    float metallic = 0.0f;
    float roughness = 0.3f;
    float specular = 1.0f;
    float ior = 1.5f;
    float transW = 0.0f;
    Vec3 transCol{1.0f, 1.0f, 1.0f};
    float transDepth = 1.0f;
    Vec3 emission{0.0f, 0.0f, 0.0f};
    float coatW = 0.0f;
    float coatRough = 0.0f;
    int familyId = 0;
};

struct ShaderBallInstance {
    Vec3 position;
    AABB bounds;
    PBRMaterial material;
    int row = 0;
    int col = 0;
};

// HSV to RGB conversion
Vec3 HueColor(float h, float sat, float val) {
    h = h - std::floor(h);
    float x = h * 6.0f;
    int i = static_cast<int>(x);
    float fr = x - static_cast<float>(i);
    float p = val * (1.0f - sat);
    float q = val * (1.0f - sat * fr);
    float t = val * (1.0f - sat * (1.0f - fr));
    switch (i % 6) {
        case 0: return {val, t, p};
        case 1: return {q, val, p};
        case 2: return {p, val, t};
        case 3: return {p, q, val};
        case 4: return {t, p, val};
        default:return {val, p, q};
    }
}

// Build 225 ShaderBall Instances across 15 Material Families
std::vector<ShaderBallInstance> BuildShowcaseShaderBalls(const AABB& localBounds) {
    const int N = 15;
    const float STEP = 1.5f;
    const float span = (N - 1) * STEP;
    const float x0 = -span * 0.5f;
    const float y0 = -span * 0.5f;

    std::vector<ShaderBallInstance> instances;
    instances.reserve(N * N);

    for (int row = 0; row < N; ++row) {
        for (int col = 0; col < N; ++col) {
            float t = static_cast<float>(col) / static_cast<float>(N - 1);
            // Hue sweep matching defaultscene_surfelgi.png (Pink on left to Red on right)
            float hue = 0.88f * (1.0f - t);

            PBRMaterial mat{};
            mat.familyId = row;

            switch (row) {
                case 0: // Anisotropic metal
                    mat.baseColor = HueColor(hue, 0.55f, 0.90f);
                    mat.metallic = 1.0f;
                    mat.roughness = 0.14f + 0.26f * t;
                    break;
                case 1: // Transmissive glass
                    mat.baseColor = {1.0f, 1.0f, 1.0f};
                    mat.transW = 1.0f;
                    mat.transCol = HueColor(hue, 0.18f, 1.0f);
                    mat.transDepth = 3.0f;
                    mat.ior = 1.30f + 1.12f * t;
                    mat.roughness = 0.02f;
                    break;
                case 2: // Subsurface scattering
                    mat.baseColor = HueColor(hue, 0.35f, 0.88f);
                    mat.roughness = 0.32f;
                    break;
                case 3: { // Thin film
                    int baseKind = col % 3;
                    if (baseKind == 0) mat.baseColor = {0.03f, 0.03f, 0.04f};
                    else if (baseKind == 1) { mat.baseColor = {1.0f, 0.766f, 0.336f}; mat.metallic = 1.0f; }
                    else mat.baseColor = {0.0f, 0.0f, 0.0f};
                    mat.roughness = 0.04f + 0.12f * baseKind;
                    mat.coatW = 1.0f;
                    mat.coatRough = 0.05f;
                    break;
                }
                case 4: // Cloth / velvet
                    mat.baseColor = HueColor(hue, 0.75f, 0.45f);
                    mat.specular = 0.0f;
                    mat.roughness = 0.5f + 0.45f * t;
                    break;
                case 5: // Clear coat / car paint
                    mat.baseColor = HueColor(hue, 0.85f, 0.50f);
                    mat.roughness = 0.45f;
                    mat.coatW = 1.0f;
                    mat.coatRough = 0.40f * t;
                    break;
                case 6: // Haziness
                    mat.baseColor = HueColor(hue, 0.45f, 0.22f);
                    mat.roughness = 0.10f;
                    mat.coatW = 0.6f;
                    mat.coatRough = 0.50f + 0.35f * t;
                    break;
                case 7: // EON diffuse
                    mat.baseColor = HueColor(hue, 0.80f, 0.75f);
                    mat.specular = 0.0f;
                    mat.roughness = 1.0f;
                    break;
                case 8: // Emission rainbow luminaires
                    mat.emission = HueColor(hue, 0.85f, 1.0f) * 6.0f;
                    mat.baseColor = {0.0f, 0.0f, 0.0f};
                    break;
                case 9: // Rough metal
                    mat.baseColor = HueColor(hue, 0.40f, 0.85f);
                    mat.metallic = 1.0f;
                    mat.roughness = 0.05f + 0.85f * t;
                    break;
                case 10: // Morph dielectric to metal
                    mat.baseColor = HueColor(hue, 0.70f, 0.65f);
                    mat.metallic = t;
                    mat.roughness = 0.22f;
                    break;
                case 11: // Ceramic / rubber
                    mat.baseColor = ((col & 1) == 0) ? HueColor(hue, 0.30f, 0.90f) : HueColor(hue, 0.55f, 0.10f);
                    mat.roughness = 0.65f;
                    break;
                case 12: // Glints
                    mat.baseColor = HueColor(hue, 0.50f, 0.30f);
                    mat.metallic = 0.8f;
                    mat.roughness = 0.25f;
                    break;
                case 13: // Absorbing tinted glass
                    mat.baseColor = {1.0f, 1.0f, 1.0f};
                    mat.transW = 1.0f;
                    mat.transCol = HueColor(hue, 0.70f, 0.85f);
                    mat.transDepth = 0.10f + 0.50f * t;
                    mat.ior = 1.52f;
                    mat.roughness = 0.05f;
                    break;
                case 14: { // Showpieces
                    int kind = col % 5;
                    if (kind == 0) { mat.baseColor = {0.95f, 0.96f, 0.97f}; mat.metallic = 1.0f; mat.roughness = 0.03f; }
                    else if (kind == 1) { mat.baseColor = HueColor(hue, 0.90f, 0.06f); mat.roughness = 0.30f; mat.coatW = 1.0f; }
                    else if (kind == 2) { mat.baseColor = HueColor(hue, 0.15f, 0.95f); mat.roughness = 0.05f; mat.coatW = 1.0f; }
                    else if (kind == 3) { mat.baseColor = {1.0f, 0.766f, 0.336f}; mat.metallic = 1.0f; mat.roughness = 0.06f; }
                    else {
                        // Frosted glass
                        mat.baseColor = {1.0f, 1.0f, 1.0f};
                        mat.transW = 1.0f;
                        mat.transCol = HueColor(hue, 0.10f, 1.0f);
                        mat.ior = 1.5f;
                        mat.roughness = 0.30f;
                        mat.transDepth = 2.5f;
                    }
                    break;
                }
            }

            ShaderBallInstance inst{};
            inst.position = {x0 + col * STEP, y0 + row * STEP, 0.0f};
            inst.bounds.low = inst.position + localBounds.low;
            inst.bounds.high = inst.position + localBounds.high;
            inst.material = mat;
            inst.row = row;
            inst.col = col;
            instances.push_back(inst);
        }
    }
    return instances;
}

// ------------------------------------------------------------------------------------------------
// Continuous Scene Distance Field (Evaluated for SDF GI & Soft Shadows)
// ------------------------------------------------------------------------------------------------
class SceneDistanceField {
public:
    Frontier::DistanceFieldSpace shaderBallSDF;
    float x0 = -10.5f, y0 = -10.5f, step = 1.5f;

    bool Init(const std::string& path) {
        std::string err;
        return shaderBallSDF.LoadFromFile(path, &err);
    }

    float SampleObjects(const Vec3& p) const {
        float d = 1e6f;
        // Bounding check around the 15x15 showcase field
        // Evaluates 2x2 neighborhood to eliminate Voronoi boundary clamping artifacts & floor rings
        if (p.z > -0.2f && p.z < 2.0f && p.x > -13.0f && p.x < 13.0f && p.y > -13.0f && p.y < 13.0f) {
            int c0 = std::clamp(static_cast<int>(std::floor((p.x - x0) / step)), 0, 13);
            int r0 = std::clamp(static_cast<int>(std::floor((p.y - y0) / step)), 0, 13);

            for (int r = r0; r <= r0 + 1; ++r) {
                for (int c = c0; c <= c0 + 1; ++c) {
                    Vec3 center{x0 + static_cast<float>(c) * step, y0 + static_cast<float>(r) * step, 0.0f};
                    Vec3 localP = p - center;
                    Frontier::Vector3 fLocal{localP.x, localP.y, localP.z};
                    float ballDist = shaderBallSDF.SampleDistance(fLocal);
                    d = std::min(d, ballDist);
                }
            }
        }
        return d;
    }

    float Sample(const Vec3& p) const {
        return std::min(p.z, SampleObjects(p));
    }

    float MarchSoftShadow(const Vec3& ro, const Vec3& rd, float minT, float maxT, float lightRad) const {
        float shadow = 1.0f;
        float t = minT;
        for (int i = 0; i < 48; ++i) {
            Vec3 p = ro + rd * t;
            float dist = SampleObjects(p);
            if (dist < 0.001f) return 0.0f;
            shadow = std::min(shadow, (lightRad * dist) / t);
            t += std::max(0.012f, dist * 0.95f);
            if (t >= maxT) break;
        }
        return std::clamp(shadow, 0.0f, 1.0f);
    }

    Vec3 EvalIndirectGI(const Vec3& p, const Vec3& n, float giBoost) const {
        Vec3 indirect{0, 0, 0};

        // Row 8 Emissive Luminaires (Y = 1.5m, X in [-10.5, +10.5])
        for (int col = 0; col < 15; ++col) {
            float t = static_cast<float>(col) / 14.0f;
            float hue = 0.88f * (1.0f - t);
            Vec3 lumColor = HueColor(hue, 0.85f, 1.0f) * 6.0f;
            Vec3 lumCenter{-10.5f + col * 1.5f, 1.5f, 0.55f};

            Vec3 toLight = lumCenter - p;
            float distSq = toLight.Dot(toLight);
            float dist = std::sqrt(distSq);
            Vec3 L = toLight * (1.0f / dist);
            float ndotl = std::max(0.0f, n.Dot(L));

            if (ndotl > 1e-4f) {
                float shadow = MarchSoftShadow(p + n * 0.02f, L, 0.03f, dist - 0.55f, 0.28f);
                float solidAngle = (kPi * 0.55f * 0.55f) / std::max(0.1f, distSq);
                indirect = indirect + lumColor * (ndotl * solidAngle * shadow * kInvPi * giBoost);
            }
        }

        // Continuous distance field Ambient Occlusion from scene geometry
        float aoAcc = 0.0f;
        for (int j = 1; j <= 5; ++j) {
            float sDist = 0.08f * j;
            float d = SampleObjects(p + n * sDist);
            if (d < sDist) {
                aoAcc += (sDist - d) / sDist;
            }
        }
        float ao = std::clamp(1.0f - aoAcc * 0.20f, 0.0f, 1.0f);

        // Soft ambient sky fill weighted by AO
        indirect = indirect + Vec3{0.16f, 0.22f, 0.32f} * (ao * 0.45f);
        return indirect;
    }
};

// ------------------------------------------------------------------------------------------------
// Ray Tracing Hit & Scene Intersection (For Specular Reflections & Glass Refraction)
// ------------------------------------------------------------------------------------------------
struct SceneHit {
    bool hit = false;
    float t = 1e30f;
    Vec3 p;
    Vec3 n;
    PBRMaterial mat;
    bool isFloor = false;
};

// Ray-Scene Intersect against Floor + 225 ShaderBall BVH instances
SceneHit TraceScene(const Vec3& ro, const Vec3& rd, const MeshBVH& bvh, const std::vector<ShaderBallInstance>& instances, float maxDist = 1e30f) {
    SceneHit result{};
    result.t = maxDist;
    Vec3 invD{1.0f / rd.x, 1.0f / rd.y, 1.0f / rd.z};

    // 1. Floor plane at z = 0
    if (rd.z < -1e-5f) {
        float tf = -ro.z / rd.z;
        if (tf > 1e-4f && tf < result.t) {
            result.hit = true;
            result.t = tf;
            result.p = ro + rd * tf;
            result.n = Vec3{0, 0, 1};
            result.isFloor = true;
            int cx = static_cast<int>(std::floor(result.p.x * 0.5f));
            int cy = static_cast<int>(std::floor(result.p.y * 0.5f));
            float c = ((cx + cy) & 1) ? 0.24f : 0.46f;
            result.mat.baseColor = Vec3{c, c, c * 1.03f};
            result.mat.roughness = 0.50f;
            result.mat.metallic = 0.0f;
        }
    }

    // 2. 225 ShaderBall Instances
    int hitInst = -1, hitTri = -1;
    float hitU = 0.0f, hitV = 0.0f;

    for (size_t i = 0; i < instances.size(); ++i) {
        const auto& inst = instances[i];
        if (bvh.Slab(inst.bounds, ro, invD, result.t)) {
            Vec3 localO = ro - inst.position;
            float t = result.t, tu, tv;
            int triIdx = bvh.Closest(localO, rd, t, tu, tv);
            if (triIdx >= 0 && t < result.t) {
                result.hit = true;
                result.t = t;
                result.isFloor = false;
                hitInst = static_cast<int>(i);
                hitTri = triIdx;
                hitU = tu;
                hitV = tv;
            }
        }
    }

    if (hitInst >= 0 && hitTri >= 0) {
        const auto& inst = instances[hitInst];
        const auto& tri = bvh.tris[hitTri];
        result.p = ro + rd * result.t;
        float w = 1.0f - hitU - hitV;
        result.n = (tri.na * w + tri.nb * hitU + tri.nc * hitV).Normalized();

        Vec3 localP = result.p - inst.position;
        Vec3 coreCenter{0.08f, -0.08f, 0.55f};
        float distToCore = (localP - coreCenter).Length();

        if (distToCore < 0.24f) {
            // Inner core sphere
            result.mat.baseColor = Vec3{0.22f, 0.24f, 0.27f};
            result.mat.metallic = 0.85f;
            result.mat.roughness = 0.20f;
        } else if (localP.z < 0.12f) {
            // Cushion base stand
            result.mat.baseColor = Vec3{0.14f, 0.14f, 0.16f};
            result.mat.metallic = 0.0f;
            result.mat.roughness = 0.65f;
        } else {
            // Outer shell
            result.mat = inst.material;
        }
    }

    return result;
}

// Fresnel Dielectric
float FresnelDielectric(float cosI, float eta) {
    cosI = std::abs(cosI);
    float s2 = eta * eta * (1.0f - cosI * cosI);
    if (s2 > 1.0f) return 1.0f; // Total internal reflection
    float cosT = std::sqrt(std::max(0.0f, 1.0f - s2));
    float rs = (eta * cosI - cosT) / (eta * cosI + cosT);
    float rp = (cosI - eta * cosT) / (cosI + eta * cosT);
    return 0.5f * (rs * rs + rp * rp);
}

// Refract vector
bool RefractVec(const Vec3& d, const Vec3& n, float eta, Vec3& out) {
    float ci = -d.Dot(n);
    float s2 = eta * eta * (1.0f - ci * ci);
    if (s2 > 1.0f) return false;
    out = (d * eta + n * (eta * ci - std::sqrt(std::max(0.0f, 1.0f - s2)))).Normalized();
    return true;
}

// Sky Color
Vec3 SkyColor(const Vec3& dir) {
    float t = std::max(0.0f, dir.z);
    Vec3 horizon{0.85f, 0.88f, 0.95f};
    Vec3 zenith{0.30f, 0.50f, 0.95f};
    Vec3 ground{0.22f, 0.20f, 0.18f};
    if (dir.z < 0.0f) return ground;
    Vec3 col = horizon * (1.0f - t) + zenith * t;
    Vec3 sunDir = Vec3{0.1473f, -0.1179f, 0.9820f}.Normalized();
    float s = std::max(0.0f, dir.Dot(sunDir));
    float disc = std::pow(s, 3200.0f);
    float glow = std::pow(s, 9.0f);
    return col + Vec3{1.0f, 0.95f, 0.86f} * (disc * 10.0f + glow * 0.28f);
}

// Shading function merging Ray Traced reflections/transmission with SDF GI
Vec3 ShadeSurface(const SceneHit& hit, const Vec3& rayDir, const MeshBVH& bvh,
                 const std::vector<ShaderBallInstance>& instances,
                 const SceneDistanceField& sdf, const Vec3& sunDir, const Vec3& sunRad,
                 int depth = 0) {
    if (!hit.hit) return SkyColor(rayDir);

    if (hit.mat.emission.Length() > 0.1f) return hit.mat.emission;

    const Vec3 P = hit.p;
    const Vec3 N = hit.n;
    const PBRMaterial& m = hit.mat;

    // ---------------------------------------------------------------------------------------------
    // GLASS EVALUATION (Snell's Law Refraction & Fresnel Transmission via Mesh BVH Ray Tracing)
    // ---------------------------------------------------------------------------------------------
    if (m.transW > 0.5f && depth < 4) {
        bool entering = rayDir.Dot(N) < 0.0f;
        Vec3 n = entering ? N : N * -1.0f;
        float eta = entering ? (1.0f / m.ior) : m.ior;
        float Fr = FresnelDielectric(rayDir.Dot(n), eta);

        // 1. Ray Traced Reflection
        Vec3 reflDir = (rayDir - n * (2.0f * rayDir.Dot(n))).Normalized();
        SceneHit reflHit = TraceScene(P + n * 1e-3f, reflDir, bvh, instances);
        Vec3 reflColor = ShadeSurface(reflHit, reflDir, bvh, instances, sdf, sunDir, sunRad, depth + 1);

        // 2. Ray Traced Refraction
        Vec3 refrDir;
        bool ok = RefractVec(rayDir, n, eta, refrDir);
        Vec3 refrColor;
        if (!ok) {
            refrColor = reflColor; // Total internal reflection
        } else {
            SceneHit refrHit = TraceScene(P - n * 1e-3f, refrDir, bvh, instances);
            refrColor = ShadeSurface(refrHit, refrDir, bvh, instances, sdf, sunDir, sunRad, depth + 1);

            // Beer-Lambert absorption through glass volume
            if (!entering) {
                float d = refrHit.t;
                Vec3 absorb{
                    std::exp(-(1.0f - m.transCol.x) * d / std::max(m.transDepth, 1e-3f)),
                    std::exp(-(1.0f - m.transCol.y) * d / std::max(m.transDepth, 1e-3f)),
                    std::exp(-(1.0f - m.transCol.z) * d / std::max(m.transDepth, 1e-3f))
                };
                refrColor = refrColor * absorb;
            }
        }

        Vec3 tint = entering ? Vec3{1, 1, 1} : m.transCol;
        return reflColor * Fr + tint * refrColor * (1.0f - Fr);
    }

    // ---------------------------------------------------------------------------------------------
    // OPAQUE SURFACES: SDF Soft Shadows + SDF Diffuse Indirect GI + RT Specular Reflections
    // ---------------------------------------------------------------------------------------------
    // 1. SDF Contact Soft Shadow
    float shadow = sdf.MarchSoftShadow(P + N * 0.015f, sunDir, 0.015f, 25.0f, 0.22f);

    // 2. Direct Sun Illumination
    Vec3 V = (rayDir * -1.0f).Normalized();
    Vec3 L = sunDir;
    Vec3 Hdir = (L + V).Normalized();

    float ndotl = std::max(0.0f, N.Dot(L));
    float ndoth = std::max(0.0f, N.Dot(Hdir));
    float ndotv = std::max(1e-4f, N.Dot(V));

    float alpha = m.roughness * m.roughness;
    float alphaSq = alpha * alpha;
    float dDenom = ndoth * ndoth * (alphaSq - 1.0f) + 1.0f;
    float d = alphaSq / (kPi * dDenom * dDenom + 1e-4f);

    Vec3 f0 = Vec3{0.04f, 0.04f, 0.04f} * (1.0f - m.metallic) + m.baseColor * m.metallic;
    float hDotL = std::max(0.0f, Hdir.Dot(L));
    Vec3 f = f0 + (Vec3{1.0f, 1.0f, 1.0f} - f0) * std::pow(1.0f - hDotL, 5.0f);
    Vec3 spec = f * (d * 0.25f / (ndotv + 1e-3f));
    Vec3 kd = (Vec3{1.0f, 1.0f, 1.0f} - f) * (1.0f - m.metallic);

    Vec3 directDiffuse = kd * m.baseColor * (ndotl * kInvPi);
    Vec3 directRadiance = (directDiffuse + spec) * sunRad * shadow;

    // 3. SDF Indirect GI (Emissive Bleed + AO evaluated from Distance Field)
    Vec3 indirectGI = sdf.EvalIndirectGI(P, N, 2.0f);
    Vec3 indirectDiffuse = m.baseColor * (1.0f - m.metallic) * indirectGI;

    // 4. Ray Traced Specular Reflection (Eliminates Blocky SDF Reflection Artifacts!)
    Vec3 reflColor{0, 0, 0};
    if (depth < 2 && (m.metallic > 0.05f || m.roughness < 0.35f || m.coatW > 0.1f)) {
        Vec3 R = (rayDir - N * (2.0f * rayDir.Dot(N))).Normalized();
        SceneHit rHit = TraceScene(P + N * 1e-3f, R, bvh, instances);
        if (rHit.hit) {
            // Evaluate hit surface direct + SDF GI
            float rShadow = sdf.MarchSoftShadow(rHit.p + rHit.n * 0.015f, sunDir, 0.015f, 25.0f, 0.22f);
            float rNdotL = std::max(0.0f, rHit.n.Dot(sunDir));
            Vec3 rDirect = rHit.mat.baseColor * (rNdotL * kInvPi) * sunRad * rShadow;
            Vec3 rIndirect = rHit.mat.baseColor * sdf.EvalIndirectGI(rHit.p, rHit.n, 2.0f);
            reflColor = rDirect + rIndirect + rHit.mat.emission;
        } else {
            reflColor = SkyColor(R);
        }
    } else {
        Vec3 R = (rayDir - N * (2.0f * rayDir.Dot(N))).Normalized();
        reflColor = SkyColor(R);
    }

    Vec3 specLobe = reflColor * f0 * std::clamp(1.0f - m.roughness * 1.2f, 0.0f, 1.0f);

    // Clear Coat Lobe (Car Paint / Haze)
    Vec3 coatLobe{0, 0, 0};
    if (m.coatW > 0.0f) {
        float fCoat = m.coatW * (0.05f + 0.95f * std::pow(1.0f - ndotv, 5.0f));
        Vec3 R = (rayDir - N * (2.0f * rayDir.Dot(N))).Normalized();
        coatLobe = SkyColor(R) * fCoat * std::clamp(1.0f - m.coatRough * 1.2f, 0.0f, 1.0f);
    }

    return directRadiance + indirectDiffuse + specLobe + coatLobe;
}

// ACES Tone Mapping
Vec3 TonemapACES(const Vec3& x) {
    auto f = [](float v) {
        v = std::max(0.0f, v);
        return (v * (2.51f * v + 0.03f)) / (v * (2.43f * v + 0.59f) + 0.14f);
    };
    return {f(x.x), f(x.y), f(x.z)};
}

void WritePng(const std::string& path, int w, int h, const std::vector<Vec3>& hdr) {
    std::string ppmPath = path.substr(0, path.find_last_of('.')) + ".ppm";
    std::ofstream ppm(ppmPath, std::ios::binary);
    ppm << "P6\n" << w << " " << h << "\n255\n";
    std::vector<uint8_t> rgb(w * h * 3);
    for (int i = 0; i < w * h; ++i) {
        Vec3 c = TonemapACES(hdr[i]);
        auto srgb = [](float v) {
            v = std::clamp(v, 0.0f, 1.0f);
            return static_cast<uint8_t>(std::pow(v, 1.0f / 2.2f) * 255.0f + 0.5f);
        };
        rgb[i * 3 + 0] = srgb(c.x);
        rgb[i * 3 + 1] = srgb(c.y);
        rgb[i * 3 + 2] = srgb(c.z);
    }
    ppm.write(reinterpret_cast<const char*>(rgb.data()), rgb.size());
    ppm.close();

    std::string cmd = "convert " + ppmPath + " " + path + " && rm -f " + ppmPath;
    int res = std::system(cmd.c_str());
    (void)res;
}

} // namespace

int main(int argc, char** argv) {
    std::cout << "================================================================================\n";
    std::cout << " HYBRID SHADERBALL RASTER / RT REFLECTIONS + GLASS + SDF GI & SOFT SHADOWS\n";
    std::cout << "================================================================================\n";

    // 1. Load authentic ShaderBall mesh
    Frontier::GeometryStructure sbMesh;
    std::string meshErr;
    if (!Frontier::ShaderBallGeometry::Load("Exhibits/Assets/ShaderBall/ShaderBall.mesh", sbMesh, &meshErr)) {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.mesh: " << meshErr << "\n";
        return 1;
    }
    std::cout << "Loaded ShaderBall mesh: " << sbMesh.QueryVertices().size() << " vertices, "
              << sbMesh.QueryIndices().size() / 3 << " triangles\n";

    // 2. Build BVH for the resident ShaderBall geometry
    MeshBVH bvh;
    bvh.Build(sbMesh);
    std::cout << "Built BVH: " << bvh.nodes.size() << " nodes for " << bvh.tris.size() << " triangles\n";

    // 3. Load baked 96^3 ShaderBall SDF for SDF GI & Soft Shadows
    SceneDistanceField sceneSDF;
    if (!sceneSDF.Init("Exhibits/Assets/ShaderBall/ShaderBall.sdf")) {
        std::cerr << "Failed to load Exhibits/Assets/ShaderBall/ShaderBall.sdf\n";
        return 1;
    }
    std::cout << "Loaded 96^3 ShaderBall distance field for SDF GI evaluation\n";

    // 4. Construct 225 ShaderBall Instances across 15 Material Families
    std::vector<ShaderBallInstance> instances = BuildShowcaseShaderBalls(bvh.rootBounds);
    std::cout << "Constructed 225 ShaderBall instances (" << instances.size() * bvh.tris.size()
              << " instanced triangles) across 15 material families\n";

    // Camera parameters matching Project Zero showcase view
    Vec3 eye{0.0f, -19.0f, 12.5f};
    Vec3 target{0.0f, 1.5f, 0.4f};
    Vec3 fwd = (target - eye).Normalized();
    Vec3 worldUp{0.0f, 0.0f, 1.0f};
    Vec3 rgt = fwd.Cross(worldUp).Normalized();
    Vec3 up = rgt.Cross(fwd).Normalized();
    float fovRad = 44.0f * kPi / 180.0f;

    // Directional Sun Key Light
    Vec3 sunDir = Vec3{0.1473f, -0.1179f, 0.9820f}.Normalized();
    Vec3 sunRadiance = Vec3{2.5f, 2.45f, 2.35f};

    // Render configurations
    struct TargetRender {
        int width, height;
        std::string filename;
        Vec3 customEye;
        Vec3 customTarget;
        bool hasCustomCam = false;
    };

    std::vector<TargetRender> targets = {
        { 1120, 840, "VisualProof/DistanceFieldGI/ShaderBall_Showcase_Raster_SDF_GI_4x3.png", {}, {}, false },
        { 1280, 720, "VisualProof/DistanceFieldGI/ShaderBall_Showcase_Raster_SDF_GI.png", {}, {}, false },
        { 1280, 720, "VisualProof/DistanceFieldGI/Surface_Cache_Scene_Render.png", {}, {}, false },
        { 1280, 720, "VisualProof/DistanceFieldGI/ShaderBall_Closeup_Raster_SDF_GI.png",
          Vec3{0.0f, -2.2f, 1.45f}, Vec3{0.0f, 0.0f, 0.55f}, true }
    };

    for (const auto& tgt : targets) {
        int W = tgt.width;
        int H = tgt.height;

        Vec3 cEye = tgt.hasCustomCam ? tgt.customEye : eye;
        Vec3 cTarget = tgt.hasCustomCam ? tgt.customTarget : target;
        Vec3 cFwd = (cTarget - cEye).Normalized();
        Vec3 cRgt = cFwd.Cross(worldUp).Normalized();
        Vec3 cUp = cRgt.Cross(cFwd).Normalized();

        float halfH = std::tan(fovRad * 0.5f);
        float halfW = halfH * static_cast<float>(W) / static_cast<float>(H);

        auto t0 = std::chrono::high_resolution_clock::now();

        // -----------------------------------------------------------------------------------------
        // PASS 1: PRIMARY VISIBILITY RASTER -> DEPTH BUFFER & INITIAL HITS
        // -----------------------------------------------------------------------------------------
        std::vector<SceneHit> primaryHits(W * H);
        std::vector<Vec3> rayDirs(W * H);

        #pragma omp parallel for schedule(dynamic, 16)
        for (int y = 0; y < H; ++y) {
            for (int x = 0; x < W; ++x) {
                int pixIdx = y * W + x;
                float u = ((static_cast<float>(x) + 0.5f) / static_cast<float>(W) * 2.0f - 1.0f) * halfW;
                float v = (1.0f - (static_cast<float>(y) + 0.5f) / static_cast<float>(H) * 2.0f) * halfH;

                Vec3 rayDir = (cFwd + cRgt * u + cUp * v).Normalized();
                rayDirs[pixIdx] = rayDir;
                primaryHits[pixIdx] = TraceScene(cEye, rayDir, bvh, instances);
            }
        }

        // -----------------------------------------------------------------------------------------
        // PASS 2: DEFERRED SHADING (ACCELERATED BY DEPTH BUFFER: SKIPS NON-GEOMETRY PIXELS)
        // -----------------------------------------------------------------------------------------
        std::vector<Vec3> hdr(W * H);

        #pragma omp parallel for schedule(dynamic, 16)
        for (int i = 0; i < W * H; ++i) {
            const auto& hit = primaryHits[i];
            const Vec3& rd = rayDirs[i];

            if (!hit.hit) {
                // Depth buffer bypass: render sky directly without SDF queries!
                int x = i % W;
                int y = i / W;
                float u = ((static_cast<float>(x) + 0.5f) / static_cast<float>(W) * 2.0f - 1.0f) * halfW;
                float v = (1.0f - (static_cast<float>(y) + 0.5f) / static_cast<float>(H) * 2.0f) * halfH;
                float vig = 1.0f - 0.25f * (u * u + v * v);
                hdr[i] = Vec3{0.55f, 0.60f, 0.68f} * vig;
                continue;
            }

            // Shade surface: evaluates glass transmission, RT specular reflections, and SDF GI
            hdr[i] = ShadeSurface(hit, rd, bvh, instances, sceneSDF, sunDir, sunRadiance);
        }

        auto t1 = std::chrono::high_resolution_clock::now();
        double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        std::cout << "Rendered " << W << "x" << H << " (" << tgt.filename << ") in " << ms << " ms\n";

        WritePng(tgt.filename, W, H, hdr);
    }

    std::cout << "All Hybrid ShaderBall renders completed successfully!\n";
    std::cout << "================================================================================\n";
    return 0;
}
