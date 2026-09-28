//============================================================================================================================================
//                                               SURFELIRRADIANCEUPDATE.SLANG
//============================================================================================================================================
// 🧩 GTX global-illumination path, pass 1 of 2 — the persistent world-space surfel field's temporal irradiance update.
//    Dispatched ONE thread per live surfel when the "Raytracing" quick tile is OFF and "Global Illumination" is ON
//    (see the mode matrix in RaytraceToggle/PortingGuide.md). It does NOT run in the raytraced ReSTIR path, and it does
//    NOT run in the plain visibility-raster mode (GI off) — the host skips the whole surfel graph there.
//
//    Technique (mirrors the proven CPU reference SurfelGI/SurfelGI.cpp, itself after Jure Triglav's surfel GI):
//      • surfels are persistent in world space and never move — the single biggest anti-flicker decision;
//      • each frame a surfel casts RayCount cosine-weighted hemisphere rays, traverses the shared CWBVH for
//        visibility, gathers sun direct at the hit (shadow-ray tested) plus the neighbouring surfels' PREVIOUS
//        irradiance (one bounce this frame → multi-bounce over frames), and folds the result into a running mean;
//      • Jacobi update: it reads Irradiance (last frame) and writes IrradianceNew, so the pass is order-independent
//        and never feeds its own output back within a frame (no read-after-write shimmer). The host swaps the two
//        after the dispatch (or bind them ping-pong).
//    Anti-flicker levers, all here: persistent surfels · running mean 1/min(age,cap) · firefly clamp · Jacobi.
//
// ⚠️ PORT SEAMS (marked `// PORT:` below). This file lowers to SPIR-V today (Tools/Build/CheckShaders.sh) and carries
//    the real bindings + the real traversal helper. Two hooks tie it to the engine's existing kernel code:
//      (1) hit shading uses the sun term + a surfel-field gather; wiring the full GpuLuminaire list + OpenPBR albedo
//          decode is the SAME code the ReSTIR kernel already runs (ReSTIRViewport.slang §DI / MaterialEvaluation.slang).
//      (2) the surfel hash grid is a head/next linked list; the host builds it each frame from the surfel positions.
//    NOTE: GLSL source lowered by the build scripts (glslang/glslc -fshader-stage=compute --target-env=vulkan1.2).

#version 460
#extension GL_GOOGLE_include_directive : require

layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

//------------------------------------------------------------------------------------------------------------------------
//                                                    SURFEL FIELD
//------------------------------------------------------------------------------------------------------------------------
// One persistent record per surfel. std430; 80 B. Alive when Albedo.w > 0.5.
struct GpuSurfel
{
    vec4 PositionRadius;    // xyz = world position, w = world-space radius
    vec4 NormalAge;         // xyz = surface normal (unit), w = age in frames (float; running-mean denominator)
    vec4 Albedo;            // xyz = diffuse albedo, w = alive flag (>0.5)
    vec4 Irradiance;        // xyz = E (committed, last frame) — read this frame (Jacobi source)
    vec4 IrradianceNew;     // xyz = E' (this frame's running-mean result) — written here (Jacobi target)
};

layout(std430, binding = 0) buffer SurfelExtent      { GpuSurfel Surfels[];      };
layout(std430, binding = 1) readonly buffer SurfelGridHeadExtent { int  SurfelGridHead[]; };  // per-cell first surfel (+1; 0 = empty)
layout(std430, binding = 2) readonly buffer SurfelGridNextExtent { int  SurfelGridNext[]; };  // per-surfel next in cell chain (+1; 0 = end)

// Shared CWBVH blobs (identical bindings to the ReSTIR kernel's 8/9) — TraversalCWBVH.slang traces these.
layout(std430, binding = 8) readonly buffer TraversalNodeExtent { vec4 CwbvhNodes[]; };
layout(std430, binding = 9) readonly buffer TraversalLeafExtent { vec4 CwbvhTris[];  };
uint TlasInstanceCount = 0u;   // single-blob world here (GTX Cornell/showcase); the two-level path plugs in as in ReSTIRViewport.
#include "TraversalCWBVH.slang"

//------------------------------------------------------------------------------------------------------------------------
//                                                    PUSH CONSTANTS
//------------------------------------------------------------------------------------------------------------------------
layout(push_constant) uniform SurfelUpdateConstants
{
    vec4  SunDirectionRadiance;   // xyz = direction TO the sun (unit), w = scalar radiance
    vec4  SunColour;              // xyz = sun colour, w unused
    vec4  SkyAmbient;             // xyz = hemisphere ambient (sky) radiance added on a ray miss, w unused
    vec4  GridOriginCell;         // xyz = grid origin (world), w = cell size
    uvec4 Counts;                 // x = surfel count, y = frame index, z = ray count, w = grid hash size
    vec4  Tuning;                 // x = firefly clamp, y = running-mean age cap, z/w unused
} PC;

const float kPi    = 3.14159265358979;
const float kInvPi = 0.31830988618379;

//------------------------------------------------------------------------------------------------------------------------
//                                                    HELPERS
//------------------------------------------------------------------------------------------------------------------------
uint HashU(uint x){ x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; x^=x>>16; return x; }
float Rand(inout uint s){ s=HashU(s); return float(s>>8)*(1.0/16777216.0); }

ivec3 CellOf(vec3 p)
{
    vec3 q = (p - PC.GridOriginCell.xyz) / PC.GridOriginCell.w;
    return ivec3(floor(q));
}
uint CellHash(ivec3 c)
{
    uint h = uint(c.x + 1024) * 73856093u ^ uint(c.y + 1024) * 19349663u ^ uint(c.z + 1024) * 83492791u;
    return h % PC.Counts.w;
}

// Gather the neighbouring surfels' committed irradiance at (P, N) from the 3×3×3 cell neighbourhood.
vec3 GatherField(vec3 P, vec3 N)
{
    vec3 acc = vec3(0.0); float wsum = 0.0;
    ivec3 base = CellOf(P);
    for (int dz = -1; dz <= 1; ++dz)
    for (int dy = -1; dy <= 1; ++dy)
    for (int dx = -1; dx <= 1; ++dx)
    {
        uint cell = CellHash(base + ivec3(dx, dy, dz));
        int idx = SurfelGridHead[cell] - 1;
        int guard = 0;
        while (idx >= 0 && guard < 256)
        {
            GpuSurfel s = Surfels[idx];
            vec3 d = P - s.PositionRadius.xyz;
            float dist = length(d);
            float r = s.PositionRadius.w;
            if (s.Albedo.w > 0.5 && dist < r)
            {
                float wn = dot(N, s.NormalAge.xyz);
                float planar = abs(dot(d, s.NormalAge.xyz));
                if (wn > 0.0 && planar < r * 0.5)
                {
                    float wd = 1.0 - dist / r; wd *= wd;
                    float w = wn * wd;
                    acc += s.Irradiance.xyz * w; wsum += w;
                }
            }
            idx = SurfelGridNext[idx] - 1;
            ++guard;
        }
    }
    return wsum > 1e-4 ? acc / wsum : vec3(0.0);
}

void main()
{
    uint si = gl_GlobalInvocationID.x;
    if (si >= PC.Counts.x) return;
    GpuSurfel s = Surfels[si];
    if (s.Albedo.w < 0.5) return;

    vec3 N = normalize(s.NormalAge.xyz);
    // tangent frame
    vec3 t = abs(N.x) < 0.9 ? vec3(1,0,0) : vec3(0,1,0);
    vec3 tx = normalize(cross(t, N));
    vec3 ty = cross(N, tx);

    uint seed = HashU(si * 2246822519u ^ PC.Counts.y * 3266489917u);
    uint rays = max(PC.Counts.z, 1u);
    float firefly = PC.Tuning.x;

    vec3 meas = vec3(0.0);
    for (uint k = 0u; k < rays; ++k)
    {
        float u1 = Rand(seed), u2 = Rand(seed);
        float rr = sqrt(u1), ph = 2.0 * kPi * u2;
        vec3 wi = normalize(tx * (rr * cos(ph)) + ty * (rr * sin(ph)) + N * sqrt(max(0.0, 1.0 - u1)));

        vec3 O = s.PositionRadius.xyz + N * 1e-3;
        vec3 rD = 1.0 / wi;
        TraversalHit h = TraverseClosest(O, wi, rD, 1e30);
        if (h.t >= 1e29)
        {
            // ray escaped → sky ambient contributes to this surfel's irradiance
            meas += PC.SkyAmbient.xyz;
            continue;
        }
        vec3 hp = O + wi * h.t;
        // PORT: decode the hit's geometric normal + albedo from h (triangle → material slab), exactly as the ReSTIR
        //       kernel does. Here we shade the bounce with the sun term against the incoming direction's opposite as a
        //       stand-in normal and gather the surfel field — structurally identical, materially approximate.
        vec3 hitN = -wi;
        // sun direct at the hit (shadow-ray tested)
        vec3 Lo = vec3(0.0);
        vec3 L = normalize(PC.SunDirectionRadiance.xyz);
        float ndl = max(dot(hitN, L), 0.0);
        if (ndl > 0.0)
        {
            vec3 sO = hp + hitN * 1e-3; vec3 srD = 1.0 / L;
            bool shadowed = TraverseOccluded(sO, L, srD, 1e30);   // single-blob world (TlasInstanceCount==0); two-level: TraverseInstancesOccluded
            if (!shadowed) Lo += PC.SunColour.xyz * (PC.SunDirectionRadiance.w * ndl * kInvPi);
        }
        // multi-bounce: neighbouring surfels' previous irradiance at the hit
        Lo += kInvPi * GatherField(hp, hitN);
        // firefly clamp on the sample
        Lo = min(Lo, vec3(firefly));
        meas += Lo;
    }
    // cosine-weighted estimator of irradiance E = π · mean(Lo)
    meas *= kPi / float(rays);

    float age = s.NormalAge.w + 1.0;
    float cap = max(PC.Tuning.y, 1.0);
    float alpha = 1.0 / min(age, cap);              // running mean → converges then holds (anti-flicker)
    vec3 Enew = s.Irradiance.xyz + (meas - s.Irradiance.xyz) * alpha;

    Surfels[si].IrradianceNew = vec4(Enew, 0.0);    // Jacobi target; host commits Irradiance = IrradianceNew
    Surfels[si].NormalAge.w   = age;
}
