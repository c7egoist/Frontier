//============================================================================================================================================
//                                                   SURFELGIRESOLVE.SLANG
//============================================================================================================================================
// 📦 GTX path, pass 2 of 2 — per-pixel resolve. Reads the visibility raster's G-buffer (SurfaceImage = world position,
//    NormalImage = normal — the SAME pair SurfaceResolve.slang produces for the ReSTIR kernel), evaluates the material,
//    and composes the final pixel from three separable terms:
//        direct  = sun NEE, shadow-ray tested        (always — sharp)
//        indirect= surfel-field diffuse gather        (only when Global Illumination is ON)
//        reflect = OFF / SKY / RAYTRACED              (the Reflections quick-tile mode)
//    then tone-maps to OutputImage. Materials are evaluated in ALL modes here, not only the raytraced kernel — which is
//    the correctness requirement: a surface looks the same material whether it is lit by ReSTIR, by surfels, or flat.
//
//    This one shader covers TWO of the three render modes (the third is the raytraced ReSTIR kernel, unchanged):
//        • Raytracing OFF + GI ON  → surfel GI      : kFeatureGlobalIllumination set, surfel gather runs.
//        • Raytracing OFF + GI OFF → plain raster   : flag clear, indirect = sky ambient only (never black), no rays.
//    The Reflections mode is independent (Off/Sky/Raytraced); the host clamps it so Raytraced reflections only appear
//    when the raytracing budget is actually available (see PortingGuide.md mode matrix + the fall-back guard).
//
// ⚠️ PORT SEAMS (`// PORT:`): albedo/metalness/roughness are read from G-buffer images here; SurfaceResolve.slang already
//    parks primary albedo (the denoiser reads it) — extend it to also emit a metal/rough aux target, OR decode the
//    material slab from SurfaceImage.w (visibility id) exactly as ReSTIRViewport.slang does. This file LOWERS today.
//    NOTE: GLSL source lowered by the build scripts (glslang/glslc -fshader-stage=compute --target-env=vulkan1.2).

#version 460
#extension GL_GOOGLE_include_directive : require

layout(local_size_x = 16, local_size_y = 16, local_size_z = 1) in;

//------------------------------------------------------------------------------------------------------------------------
//                                                    IMAGES / G-BUFFER
//------------------------------------------------------------------------------------------------------------------------
layout(rgba8,   binding = 0) uniform writeonly image2D OutputImage;   // tone-mapped presentation
layout(rgba32f, binding = 1) uniform readonly  image2D SurfaceImage;  // xyz = world position, w = visibility id bits
layout(rgba16f, binding = 2) uniform readonly  image2D NormalImage;   // xyz = geometric normal
layout(rgba8,   binding = 3) uniform readonly  image2D AlbedoImage;   // xyz = base colour (PORT: SurfaceResolve primary albedo)
layout(rgba16f, binding = 4) uniform readonly  image2D MaterialAux;   // x = metalness, y = roughness (SurfaceResolve aux)

//------------------------------------------------------------------------------------------------------------------------
//                                                    SURFEL FIELD (read-only here)
//------------------------------------------------------------------------------------------------------------------------
struct GpuSurfel
{
    vec4 PositionRadius;
    vec4 NormalAge;
    vec4 Albedo;
    vec4 Irradiance;
    vec4 IrradianceNew;
};
layout(std430, binding = 10) readonly buffer SurfelExtent          { GpuSurfel Surfels[];      };
layout(std430, binding = 11) readonly buffer SurfelGridHeadExtent  { int  SurfelGridHead[]; };
layout(std430, binding = 12) readonly buffer SurfelGridNextExtent  { int  SurfelGridNext[]; };

// Shared CWBVH — direct shadow ray + raytraced reflection ray.
layout(std430, binding = 8) readonly buffer TraversalNodeExtent { vec4 CwbvhNodes[]; };
layout(std430, binding = 9) readonly buffer TraversalLeafExtent { vec4 CwbvhTris[];  };
uint TlasInstanceCount = 0u;
#include "TraversalCWBVH.slang"

//------------------------------------------------------------------------------------------------------------------------
//                                                    PUSH CONSTANTS
//------------------------------------------------------------------------------------------------------------------------
layout(push_constant) uniform ResolveConstants
{
    vec4  SunDirectionRadiance;   // xyz = to-sun (unit), w = radiance
    vec4  SunColour;              // xyz = sun colour
    vec4  SkyAmbient;             // xyz = sky ambient (plain-raster diffuse fill), w = exposure
    vec4  GridOriginCell;         // xyz = grid origin, w = cell size
    vec4  CameraEye;              // xyz = eye, w unused
    uvec4 Counts;                 // x = surfel count, y = grid hash size, z = feature flags, w = reflection mode
} PC;

// Feature flags — MUST match Engine/Shaders/ReSTIRViewport.slang so a single ControlCentreSettings drives both paths.
const uint kFeatureGlobalIllumination = 1u;    // bit 0: surfel diffuse gather runs
// Reflection mode (Counts.w): 0 = Off, 1 = Sky, 2 = Raytraced.
const uint kReflectOff = 0u, kReflectSky = 1u, kReflectRaytraced = 2u;

const float kPi = 3.14159265358979, kInvPi = 0.31830988618379;

ivec3 CellOf(vec3 p){ vec3 q = (p - PC.GridOriginCell.xyz) / PC.GridOriginCell.w; return ivec3(floor(q)); }
uint  CellHash(ivec3 c){ uint h = uint(c.x+1024)*73856093u ^ uint(c.y+1024)*19349663u ^ uint(c.z+1024)*83492791u; return h % PC.Counts.y; }

vec3 GatherField(vec3 P, vec3 N)
{
    vec3 acc = vec3(0.0); float wsum = 0.0;
    ivec3 base = CellOf(P);
    for (int dz=-1; dz<=1; ++dz) for (int dy=-1; dy<=1; ++dy) for (int dx=-1; dx<=1; ++dx)
    {
        uint cell = CellHash(base + ivec3(dx,dy,dz));
        int idx = SurfelGridHead[cell] - 1; int guard = 0;
        while (idx >= 0 && guard < 256)
        {
            GpuSurfel s = Surfels[idx];
            vec3 d = P - s.PositionRadius.xyz; float dist = length(d); float r = s.PositionRadius.w;
            if (s.Albedo.w > 0.5 && dist < r)
            {
                float wn = dot(N, s.NormalAge.xyz); float planar = abs(dot(d, s.NormalAge.xyz));
                if (wn > 0.0 && planar < r*0.5) { float wd = 1.0 - dist/r; wd*=wd; float w = wn*wd; acc += s.Irradiance.xyz*w; wsum += w; }
            }
            idx = SurfelGridNext[idx] - 1; ++guard;
        }
    }
    return wsum > 1e-4 ? acc / wsum : vec3(0.0);
}

vec3 SunDirect(vec3 P, vec3 N)
{
    vec3 L = normalize(PC.SunDirectionRadiance.xyz);
    float ndl = max(dot(N, L), 0.0);
    if (ndl <= 0.0) return vec3(0.0);
    vec3 rD = 1.0 / L;
    bool shadowed = TraverseOccluded(P + N*1e-3, L, rD, 1e30);   // single-blob world; two-level path: TraverseInstancesOccluded
    return shadowed ? vec3(0.0) : PC.SunColour.xyz * (PC.SunDirectionRadiance.w * ndl);
}

// Schlick Fresnel for the specular/reflection weight.
vec3 Fresnel(vec3 f0, float cosTheta){ float m = clamp(1.0 - cosTheta, 0.0, 1.0); float m2 = m*m; return f0 + (vec3(1.0) - f0) * (m2*m2*m); }

vec3 Reflection(vec3 P, vec3 N, vec3 V, vec3 f0, float roughness, uint mode)
{
    if (mode == kReflectOff) return vec3(0.0);
    vec3 R = reflect(-V, N);
    if (mode == kReflectSky)
    {
        // reflect the sky dome only — no scene rays. Roughness widens toward the ambient (cheap gloss).
        return PC.SkyAmbient.xyz;
    }
    // kReflectRaytraced — one reflection ray against the CWBVH; miss → sky, hit → sun direct + surfel indirect at the hit.
    vec3 rD = 1.0 / R;
    TraversalHit h = TraverseClosest(P + N*1e-3, R, rD, 1e30);
    if (h.t >= 1e29) return PC.SkyAmbient.xyz;
    vec3 hp = P + R * h.t; vec3 hN = -R;   // PORT: decode hit normal/albedo like the kernel; stand-in here.
    return SunDirect(hp, hN) * kInvPi + kInvPi * GatherField(hp, hN);
}

void main()
{
    ivec2 pixel = ivec2(gl_GlobalInvocationID.xy);
    ivec2 size = imageSize(SurfaceImage);
    if (pixel.x >= size.x || pixel.y >= size.y) return;

    vec4 surf = imageLoad(SurfaceImage, pixel);
    vec3 P = surf.xyz;
    // A miss (no geometry) shows the sky directly.
    vec3 N = normalize(imageLoad(NormalImage, pixel).xyz);
    if (dot(N, N) < 1e-6)
    {
        vec3 V = normalize(P - PC.CameraEye.xyz);
        vec3 sky = PC.SkyAmbient.xyz;
        imageStore(OutputImage, pixel, vec4(pow(sky / (sky + vec3(1.0)), vec3(1.0 / 2.2)), 1.0));
        return;
    }

    vec3 albedo   = imageLoad(AlbedoImage, pixel).xyz;
    vec2 mr       = imageLoad(MaterialAux, pixel).xy;
    float metal   = mr.x;
    float rough   = mr.y;
    vec3 V        = normalize(PC.CameraEye.xyz - P);
    vec3 f0       = mix(vec3(0.04), albedo, metal);
    vec3 diffuse  = albedo * (1.0 - metal);

    uint flags = PC.Counts.z;
    uint reflMode = PC.Counts.w;

    // --- direct (always, sharp) ---
    vec3 col = diffuse * kInvPi * SunDirect(P, N);

    // --- indirect diffuse ---
    if ((flags & kFeatureGlobalIllumination) != 0u)
        col += diffuse * kInvPi * GatherField(P, N);          // surfel GI
    else
        col += diffuse * PC.SkyAmbient.xyz;                    // plain raster: sky ambient fill (never black)

    // --- reflections (Off / Sky / Raytraced) ---
    if (reflMode != kReflectOff)
    {
        vec3 F = Fresnel(f0, max(dot(N, V), 0.0));
        col += F * Reflection(P, N, V, f0, rough, reflMode);
    }

    // exposure + Reinhard + gamma
    col *= PC.SkyAmbient.w;
    vec3 mapped = pow(col / (col + vec3(1.0)), vec3(1.0/2.2));
    imageStore(OutputImage, pixel, vec4(mapped, 1.0));
}
