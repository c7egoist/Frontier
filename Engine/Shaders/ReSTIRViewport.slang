//============================================================================================================================================
// 📦 Engine/Shaders/ReSTIRViewport.slang — Progressive path tracer with RIS direct lighting (interim kernel)
//============================================================================================================================================
// 🚧 HONEST STATUS (plan v2.1 R0): this is NOT ReSTIR as published. Per pixel it does
//       • primary visibility from the R2 visibility raster (SurfaceImage / NormalImage, no primary rays),
//       • shadow / bounce rays traverse the R3 CWBVH (TraversalCWBVH.slang, bindings 8-9) — O(log N), not O(N),
//       • ReSTIR-DI *initial candidates only*: M light samples resampled with a weighted reservoir (correct RIS),
//         with ExtraCandidateCount further same-pixel candidates folded in, plus temporal (R6 row 2) and
//         spatiotemporal neighbour reuse (R6 row 3),
//       • one BSDF-sampled bounce with next-event estimation — plain 1-bounce path tracing, no GI reservoir (R6),
//       • R4b: surfaces are shaded with the OpenPBR lobe set of MaterialEvaluation.slang (one resolved slab, interpolated
//         normals + normal maps from the VertexRecord buffer, ray-cone texture LOD, GGX energy / LTC sheen LUTs),
//       • a running-mean accumulation that restarts on camera motion; motion vectors exist (R2) but are consumed only
//         by the R6 temporal reservoir (row 2), no denoiser (R7).
//    It is kept as the reference image source until the staged frame graph replaces it.
// NOTE: GLSL source lowered to SPIR-V by the build scripts (glslc -fshader-stage=compute --target-env=vulkan1.2 -I Engine).
//       World space is right-handed Z-up (CLAUDE.md §7); the pixel→ray mapping (Shaders/RayGeneration.slang) is applied by
//       SurfaceResolve.slang — this kernel no longer generates camera rays.

#version 460
#extension GL_GOOGLE_include_directive : require
#extension GL_EXT_nonuniform_qualifier : require   // R4a: bindless Textures[nonuniformEXT(slot)]
layout(local_size_x = 16, local_size_y = 16, local_size_z = 1) in;

//------------------------------------------------------------------------------------------------------------------------
//                                                    STORAGE IMAGE OUTPUT
//------------------------------------------------------------------------------------------------------------------------

layout(rgba8,   binding = 0) uniform writeonly image2D OutputImage;    // tone-mapped 8-bit presentation image
layout(rgba32f, binding = 3) uniform          image2D HistoryImage;   // linear HDR running mean, .a = sample count
layout(rgba32f, binding = 4) uniform readonly image2D SurfaceImage;   // R2 SurfaceResolve: xyz = world position, w = visibility id bits
layout(rgba16f, binding = 5) uniform readonly image2D NormalImage;    // R2 SurfaceResolve: xyz = camera-facing geometric normal

//------------------------------------------------------------------------------------------------------------------------
//                                                    SCENE GEOMETRY BINDING
//------------------------------------------------------------------------------------------------------------------------

struct GpuTriangle          // TriangleIndex (SwapchainExchange.h), R4a layout
{
    vec4 v0;            // xyz = vertex α, w = materialIndex (floatBitsToUint)
    vec4 v1;            // xyz = vertex β, w = γ.u
    vec4 v2;            // xyz = vertex γ, w = γ.v
    vec4 uv;            // xy = α.uv, zw = β.uv
};

struct GpuMaterial          // MaterialRecord (ContentInterchange/MaterialIndex.h, 64 B) — R4a header; mirrors SceneRecords.slang
{
    vec4  Albedo;           // xyz = flattened base colour, w = specular roughness
    vec4  Emissive;         // xyz = emission radiance [nit], w = metalness
    uvec4 Slabs;            // x = SlabOffset, y = SlabCount, z = Flags, w = Complexity
    uvec2 Textures;         // x = base colour slot, y = normal slot (0xFFFFFFFF = none)
    float AlphaCutoff;
    float NormalScale;
};

struct GpuMaterialSlab      // MaterialSlabRecord (288 B) — 18 vec4; field map in SceneRecords.slang. Read by R4b shading.
{
    vec4  Payload[15];
    uvec4 TextureSlots0;
    uvec4 TextureSlots1;
    uvec4 Runtime;
};

struct GpuInstance          // InstanceRecord (SceneStructure.h / SceneRecords.slang) — only MaterialIndex is read here
{
    mat4 World;
    mat4 PreviousWorld;
    uint VertexOffset;
    uint FirstIndex;
    uint TriangleCount;
    uint MaterialIndex;
    uint ClusterOffset;
    uint ClusterCount;
    uint Flags;
    uint FlatTriangleOffset;
};

struct GpuLuminaire         // LuminaireRecord (SceneStructure.h): emissive triangle + alias entry
{
    uint  TriangleSlot;     // index into Triangles[]
    uint  InstanceIndex;
    uint  PrimitiveIndex;
    uint  AliasSlot;
    float Threshold;
    float Area;
    float Probability;
    float Pad;
};

layout(std430, binding = 1) readonly buffer TriangleExtent  { GpuTriangle  Triangles[];  };
layout(std430, binding = 2) readonly buffer MaterialExtent  { GpuMaterial  Materials[];  };
layout(std430, binding = 6) readonly buffer InstanceExtent  { GpuInstance  Instances[];  };
layout(std430, binding = 7) readonly buffer LuminaireExtent { GpuLuminaire Luminaires[]; };
layout(std430, binding = 8) readonly buffer TraversalNodeExtent { vec4 CwbvhNodes[]; };   // R3: TraversalIndex node blob
layout(std430, binding = 9) readonly buffer TraversalLeafExtent { vec4 CwbvhTris[];  };   // R3: TraversalIndex triangle blob
layout(std430, binding = 10) readonly buffer MaterialSlabExtent { GpuMaterialSlab MaterialSlabs[]; };

struct GpuVertex            // VertexRecord (SceneRecords.slang, 64 B) — R4b: interpolated normals / tangents / UVs
{
    vec4 Position;
    vec4 Normal;            // xyz object space
    vec4 Tangent;           // xyz object space, w = bitangent sign
    vec4 Texcoord;          // xy
};
layout(std430, binding = 11) readonly buffer VertexExtent { GpuVertex Vertices[]; };   // R4b: shared with the R2 raster set
layout(std430, binding = 12) readonly buffer IndexExtent  { uint      Indices[];  };   // R4b
// 13 = EnergyLut, 14 = SheenLut (declared in MaterialEvaluation.slang)
layout(binding = 15) uniform sampler2D MotionImage;   // R6: R2 motion (CurrentUv − PreviousUv, [0,1] uv units) — texelFetch only
struct GpuReservoir   // 64 B stride — mirrors ReservoirBufferRecord in SwapchainExchange.cpp
{
    vec4  Sample;    // xyz = light sample point, w = WeightSum
    uvec4 Counts;    // x = M, y = SelectedLight, z = Visible, w = Age
    vec4  UvDepth;   // xy = SelectedUv, z = W, w = view depth at the build pixel [m]
    vec4  Normal;    // xyz = viewer-facing geometric normal at the build pixel, w = stride guard (ViewportWidth)
};
layout(std430, binding = 16) readonly buffer PrevReservoirExtent { GpuReservoir PrevReservoirs[]; };
layout(std430, binding = 17) writeonly buffer CurrReservoirExtent { GpuReservoir CurrReservoirs[]; };
layout(rgba16f, binding = 18) uniform image2D HistorySurfaceImage;   // R7a: xyz = normal, w = depth the history mean was shaded at (w ≤ 0 = no surface)
layout(rgba32f, binding = 19) uniform image2D MomentImage;           // R7: x = E[luma], y = E[luma²], reprojected with the mean
layout(rgba32f, binding = 20) uniform writeonly image2D DenoiseImage; // R7: xyz = linear radiance, w = variance — the à-trous input
// ── P1: the celestial record ───────────────────────────────────────────────────────────────────────────────────────
// Mirrors CelestialUniform (Engine/DisplayPresentation/CelestialUniform.h) field for field, 27 vec4s = 432 bytes.
// ⚠️ A readonly SSBO rather than a uniform block, deliberately: std430 lays vec4s out identically to the C++ struct,
//    whereas std140 would need padding rules re-derived here, and the descriptor pool's storage-buffer count is the
//    one already sized for data bindings. Read-only, written once per frame by the CPU solve — nothing is baked (F4).
struct CelestialRecord
{
    vec4 SunDirectionAndCosRadius;      // xyz dir TO sun, w cos(angular radius)
    vec4 SunRadianceAndLimb;            // rgb DISC radiance [W/m2/sr], w limb darkening
    vec4 SunIrradianceAndScale;         // rgb top-of-atmosphere IRRADIANCE [W/m2], w sky scale
    vec4 SunTransmittance;              // rgb atmospheric transmittance to the sun at ground, w unused
    vec4 FlareStreakAndFlags;           // rgb streak tint x intensity, w element bits as a float
    vec4 FlareGhostAndCount;            // x intensity, y dispersal, z size [rad], w count
    vec4 FlareBurstAndChroma;           // x intensity, y length [rad], z sharpness, w blades
    vec4 FlareChromaAndFade;            // x ghost chromatic, y occlusion fade, z streak length, w streak thickness
    vec4 MoonDirectionAndCosRadius;
    vec4 MoonRadianceAndEarthshine;
    vec4 RayleighScatteringAndHeight;   // rgb 1/m, w scale height [m]
    vec4 MieScatteringAndHeight;
    vec4 OzoneAbsorptionAndG;           // rgb 1/m, w Mie anisotropy
    vec4 GroundAlbedoAndPlanetRadius;
    vec4 AtmosphereHeightAndFog;        // x shell [m], y fog density, z fog height, w fog sun scatter
    vec4 CloudLayer;                    // x coverage, y density, z base [m], w thickness [m]
    vec4 CloudShape;                    // x shape scale [m], y detail, z anvil, w powder
    vec4 CloudLighting;                 // x g1, y g2, z mix, w ambient
    vec4 CloudAbsorptionAndWind;        // x absorption, yz wind drift [m], w wind speed
    vec4 WindShear;                     // x shear, y veer [rad], z gust, w turbulence
    vec4 LocalCloudCentreAndDensity;    // w == 0 means disabled; no branch needed
    vec4 LocalCloudExtentAndCoverage;
    vec4 LocalFogCentreAndDensity;      // w == 0 means disabled
    vec4 LocalFogExtentAndG;
    vec4 StarsAndRotation;              // x brightness, y density, z size, w sidereal rotation [rad]
    vec4 ExposureAndFlags;              // x gain, y EV100, z sun elevation [deg], w feature bits as a float
    vec4 MilkyWayAndMoonPhase;          // x milky way, y lit fraction, z elongation [rad], w wall seconds
};
layout(std430, binding = 21) readonly buffer CelestialExtent { CelestialRecord Celestial[]; };

#define kCelestialFlagEnabled    1u
#define kCelestialFlagFog        2u
#define kCelestialFlagLocalFog   4u
#define kCelestialFlagLocalCloud 8u
#define kCelestialFlagMoon       16u
#define kCelestialFlagStars      32u

// Lens-flare element bits. Mirror LensFlareElementBits in CelestialStructure.h; the gate asserts they agree.
#define kFlareElementStreak      1u
#define kFlareElementGhosts      2u
#define kFlareElementStarburst   4u

// Media step budgets. The view march is the expensive one; the sun march runs INSIDE it, so its cost is the
//    product of the two and it is kept deliberately small. Both are measured in CheckCelestialMedia.
// How far the media march reaches. 200 km is past the far edge of any cloud layer on the horizon; the march
//    clips itself to the actual slab intersection, so this only bounds the fog case.
#define kMediaFarDistance  200000.0
// The sun-occlusion probe for the lens flare needs a yes/no answer, not a picture, so it runs coarse.
#define kMediaOcclusionSteps 12
// Surface fog runs on every geometry pixel, so it gets a smaller budget than the sky march — and the segment is
//    metres to hundreds of metres rather than kilometres, so it needs fewer steps to resolve.
#define kMediaSurfaceSteps  16
// What fraction of the slab's nominal optical depth the AMBIENT approximation should use. Cloud does not fill
//    its own bounding volume; this is the effective fill factor, calibrated so the result lands on measured
//    overcast transmittance rather than on the geometric worst case.
// ⚠️ COUPLED TO Clouds.Absorption. This fill factor was calibrated when absorption was 0.05; dropping that to
//    0.012 (to stop clouds being hard silhouettes) scaled the ambient dimming down with it — overcast went from
//    passing 48% of clear-sky light to 79%, i.e. barely dimming at all. Raised by the same 4.2x ratio.
#define kMediaAmbientFill   0.050
// Light that diffuses through a fully closed deck. An overcast day is dim, not dark: ~15% of clear-sky.
#define kMediaOvercastFloor 0.15
// Octave multiple-scattering approximation (Wrenninge/Hillaire). Each successive order is attenuated less,
//    phase-flattened toward isotropic, and weighted lower. Three orders is the usual real-time choice.
#define kMediaScatterOrders   3
#define kMediaOrderExtinction 0.5
#define kMediaOrderPhase      0.5
#define kMediaOrderWeight     0.5
// The coverage threshold sweeps between these two points on the noise distribution. Measured over 20 000
//    samples of the 3-octave sum: ~2% of the field exceeds 0.72 and ~97% exceeds 0.28, so coverage 0 is an
//    (almost) clear sky and coverage 1 is (almost) solid overcast, with 0.5 landing near half cover.
// ⚠️ RECALIBRATED AFTER WIDENING THE REMAP WINDOW. With the old narrow window these two made coverage roughly
//    linear, but a wider window lets far more of the field through: measured, coverage 0.5 produced **77% sky
//    cover** and shaded 78% of the ground. (Those two agreeing is itself the proof the shadow is correct — it
//    was the coverage that was wrong, not the shadowing.) Raising the floor pulls the whole mapping back so the
//    slider means what it says.
// ⚠️ RECALIBRATED AGAIN AFTER WIDENING THE HEIGHT GRADIENT. Fixing the pancake profile made each cloud taller
//    but thinner in density, so the same thresholds under-delivered: coverage 0.8 gave only 20% sky cover and
//    near-overcast still left 66% of the ground in full sun. Measured floor sweep at ceiling 0.80:
//        floor 0.46 -> 0.80 coverage gives 20% sky      floor 0.34 -> 54%
//        floor 0.38 -> 40%                              floor 0.30 -> 67%
//    0.28 lands 0.8 near 75%, which is what "heavily clouded" should mean.
#define kMediaShapeCeiling 0.78
#define kMediaShapeFloor   0.28
// How wide the coverage remap window is. 0.28 made the field near-binary — flat, saturated interiors with no
//    shading detail and an erosion pass that could not bite. See the measurement in CelestialMedia.slang.
#define kMediaCoverageWindow 0.50
// How fast sky light from above (and ground bounce from below) fades toward the middle of the cloud deck.
//    An e-fold across the slab: the centre of a thick cloud is the darkest place in it, but never black.
#define kMediaAmbientFalloff 1.6
// How much of the light falling on the ground comes back up into the cloud base. Typical terrain albedo.
#define kMediaGroundBounce   0.30
// 🔴 THIS WAS BACKWARDS AND IT COST TWO ROUNDS OF "STILL FLAT". Squashing the vertical axis makes the noise
//    vary FASTER in z, so a column crosses the coverage threshold only in a thin band — measured, the cloud
//    occupied just the 40-60% slice of the slab, a 180 m disc inside a 900 m layer, 900 m wide: a 5:1 pancake.
//    Squashing makes clouds THINNER, not taller.
//
//    The literature's structure is the opposite: the noise is roughly ISOTROPIC (it adds bumps and cauliflower,
//    not layers) and the vertical silhouette comes entirely from the HEIGHT GRADIENT. 0.7 keeps a little
//    vertical compression so tops billow slightly more than bases, without banding the slab.
#define kMediaVerticalScale  0.70
// Energy normalisation for the octave sum: a cloud reflects as a body of albedo ~0.9, i.e. radiance E*0.9/pi,
//    but a sum of phase-function samples averages ~1/4pi. 0.286/0.077 closes the gap. See CelestialMedia.slang.
#define kMediaAlbedoGain   3.73
// How much light the higher scattering orders still receive deep inside a cloud, where the straight-line path
//    to the sun is fully blocked. This is diffusion from the lit top and sides — the reason a cumulus base is
//    grey rather than black.
#define kMediaDiffuseFloor 0.45
// How sharply the powder term recovers to 1.0 with optical depth. Larger = only the very thinnest wisps darken.
#define kMediaPowderSharpness 6.0
// Samples along the line to the sun when shadowing GEOMETRY through the cloud deck. Runs once per shaded pixel
//    on the shadow-ray path, so it is a probe rather than a march.
// ⚠️ 6 was too few and biased the shadow HEAVY. Over a ~1200 m slant path each sample stood for 200 m, so a
//    single hit on a thin cloud was extrapolated across the whole segment: 25% sky cover produced only 19%
//    sunlit ground, when the two should roughly agree. 12 halves that error and is still a probe, not a march.
#define kMediaShadowSteps 12
#define kMediaViewSteps    48
#define kMediaSunSteps     5
#define kMediaShapeOctaves 3
#define kMediaDetailOctaves 2
#define kMediaLocalOctaves 3

#include "CelestialMedia.slang"

layout(binding = 22) uniform sampler2D Textures[];   // R4a bindless table — ⚠️ a variable-count binding must be the last one in the set

const float kTemporalNormalCos = 0.906308;   // cos(25°): temporal/spatial normal validation
const float kTemporalDepthTol  = 0.10;       // 10% relative depth validation
const uint  kTemporalMClamp    = 20u;        // prev M capped at 20× current M (ReSTIR M-clamp)
const uint  kSpatialTaps       = 4u;         // R6 row 3: 4-tap cross — the true spatial reuse (ExtraCandidateCount = extra same-pixel candidates)
// ⚠️ The cross is ROTATED and its radius JITTERED per pixel per frame. A fixed offset set makes the reuse graph static:
//    pixel (x,y) could only ever exchange reservoirs with (x±r,y) and (x,y±r), which partitions the image into r²
//    residue classes that never share a sample. Each class converges to its own estimate and temporal accumulation
//    cements the difference instead of averaging it away, so a fixed r = 11 lattice stayed visible at any frame count.
//    Measured: 121 isolated pools versus 1 when jittered, and a 30 % class-to-class bias that never decayed.
const float kSpatialRadiusMinPx = 4.0;       // [px] at 1280 px width — scaled by RenderWidth/1280 for resolution independence
const float kSpatialRadiusMaxPx = 16.0;      // [px] the band's mean matches the old fixed radius, so reuse reach is unchanged
// P0 ⚠️ The radius above is in PIXELS, which makes the reuse footprint depend on how far away the surface is: standing
//    at a wall, a 16 px tap covers a few millimetres of it; backing away, the same 16 px spans metres. That is a
//    viewpoint-dependent estimator — validation pass rates and M growth change with distance, so the SAME surface
//    converges to a slightly different brightness seen from near and from far (suspect 1 in
//    References/ReSTIRBrightnessDiagnosis.md). The pixel radius is therefore corrected toward a constant WORLD
//    footprint: the reference metre-per-pixel is taken at kSpatialReferenceDepth, and the radius scales by the ratio,
//    clamped so a distant surface cannot collapse the cross onto its own pixel nor a very near one fling taps across
//    the screen. Constant in metres = the same neighbourhood is reused wherever the camera stands.
const float kSpatialReferenceDepth = 4.0;    // [m]  depth at which the pixel radii above are taken as authored
const float kSpatialDepthScaleMin  = 0.35;   // [-]  floor on the correction (far surfaces keep a usable cross)
const float kSpatialDepthScaleMax  = 2.50;   // [-]  ceiling (near surfaces do not tap half the screen away)

// P0 ⚠️ ONE distance regularisation, read by the RIS target function AND by both shading sites. They used to
//    disagree — the target divided by d^2 + 0.001 while shading divided by d^2 + 0.01 — which means RIS was
//    resampling against a target that is not proportional to what the shader then computes. That is a silent
//    10x mismatch at 10 cm (the shading denominator doubles there: a whole stop of darkening on close-range
//    light transport) and it degrades the resampling quality at every distance, because the reservoir is
//    optimising for the wrong function. It cannot move with the camera for fixed geometry, so it was never the
//    viewpoint bug, but it is a real bug and the sky's NEE will read the same constant.
const float kDistanceEpsilon = 0.001;

const uint kMaterialTextureNone = 0xFFFFFFFFu;

#include "MaterialEvaluation.slang"

//------------------------------------------------------------------------------------------------------------------------
//                                          R4b: MATERIAL RESOLVE (slab + textures → ShadingRecord)
//------------------------------------------------------------------------------------------------------------------------
// Barycentrics are rebuilt from the hit position against the flat triangle (one convention for the raster-fed primary
//    hit and the CWBVH bounce hit). Vertex normals / tangents / UVs come from the shared VertexRecord buffer (binding 11/12)
//    through the instance's index range — the same data the R2 raster consumes, so nothing is uploaded twice.
// Texture LOD: ray cones (Akenine-Möller et al. 2019/2021). Cone width w = t · pixelSpread (primary) + t₂ · pixelSpread
//    (bounce, ⚠️ no curvature term yet — flat-surface spread only); λ = ½ log2(texW·texH · uvArea / worldArea) + log2(w / |n·d|).
// ⚠️ Texture channel selection is not part of MaterialSlabRecord; the shader assumes the glTF packing the codec emits:
//    metalness = B and roughness = G of the metallicRoughness image, occlusion = R, opacity = A of base colour, others RGB.

vec3 Barycentric(vec3 p, vec3 a, vec3 b, vec3 c)
{
    vec3 e0 = b - a, e1 = c - a, e2 = p - a;
    float d00 = dot(e0, e0), d01 = dot(e0, e1), d11 = dot(e1, e1), d20 = dot(e2, e0), d21 = dot(e2, e1);
    float den = d00 * d11 - d01 * d01;
    if (abs(den) < 1e-20) return vec3(1.0, 0.0, 0.0);
    float v = (d11 * d20 - d01 * d21) / den;
    float w = (d00 * d21 - d01 * d20) / den;
    return vec3(1.0 - v - w, v, w);
}

// Texture slot of channel C (0-15) of a slab, 0xFFFF = none — mirrors MaterialSlabTexture in SceneRecords.slang.
uint SlabTexture(GpuMaterialSlab S, uint C)
{
    uint Word = C < 8u ? S.TextureSlots0[C / 2u] : S.TextureSlots1[(C - 8u) / 2u];
    return (Word >> ((C & 1u) * 16u)) & 0xFFFFu;
}
const uint kChannelBaseColor = 0u, kChannelMetalness = 1u, kChannelRoughness = 2u, kChannelSpecularColor = 3u, kChannelNormal = 4u,
           kChannelCoatNormal = 5u, kChannelEmission = 6u, kChannelOpacity = 7u, kChannelCoat = 10u, kChannelFuzz = 11u,
           kChannelThinFilm = 12u, kChannelOcclusion = 14u;

struct SurfaceFrame         // everything the kernel needs at a hit besides the ShadingRecord
{
    vec3  Normal;           // shading normal (interpolated + normal map), facing the viewer side
    vec3  Tangent;          // orthonormal frame axes for the local BSDF space
    vec3  Bitangent;
    vec3  Geometric;        // face normal facing the viewer side (ray offsets, shadow rays)
    vec3  Emission;         // slab emission × texture [nit]
    float Opacity;          // geometry_opacity × texture alpha
    float Occlusion;        // baked AO — multiplies the debug ambient floor only
    float LodBias;          // ½ log2(uvArea / worldArea) + log2(coneWidth / |n·d|): add ½ log2(texW·texH) per texture
};

vec3 ToLocal(SurfaceFrame F, vec3 w)   { return vec3(dot(w, F.Tangent), dot(w, F.Bitangent), dot(w, F.Normal)); }
vec3 FromLocal(SurfaceFrame F, vec3 w) { return F.Tangent * w.x + F.Bitangent * w.y + F.Normal * w.z; }

vec4 SampleChannel(GpuMaterialSlab S, uint channel, vec2 uv, float lodBias, vec4 fallback)
{
    uint slot = SlabTexture(S, channel);
    if (slot == 0xFFFFu) return fallback;
    ivec2 size = textureSize(Textures[nonuniformEXT(slot)], 0);
    float lod = lodBias + 0.5 * log2(float(size.x * size.y));
    return textureLod(Textures[nonuniformEXT(slot)], uv, lod);
}

// Resolve the material at a hit. `viewDir` points from the hit towards the viewer / previous vertex; `coneWidth` is the
//    ray-cone footprint at the hit [m]. Fills the ShadingRecord from the first slab (Tier A: one resolved slab) or, when
//    the material has no slab, from the 64 B header (constant base colour / roughness / metalness).
ShadingRecord ResolveMaterial(GpuMaterial mat, GpuInstance instance, uint primitive, vec3 hitPos, vec3 viewDir, float coneWidth, out SurfaceFrame F)
{
    GpuTriangle tri = Triangles[instance.FlatTriangleOffset + primitive];
    vec3 bc = Barycentric(hitPos, tri.v0.xyz, tri.v1.xyz, tri.v2.xyz);
    vec3 e1 = tri.v1.xyz - tri.v0.xyz, e2 = tri.v2.xyz - tri.v0.xyz;
    vec3 faceCross = cross(e1, e2);
    float worldArea = 0.5 * length(faceCross);
    vec3 ng = worldArea > 0.0 ? faceCross / (2.0 * worldArea) : vec3(0.0, 0.0, 1.0);
    if (dot(ng, viewDir) < 0.0) ng = -ng;

    // Vertex attributes through the instance's index range (object space → world with the instance matrix).
    uint base = instance.FirstIndex + primitive * 3u;
    GpuVertex va = Vertices[Indices[base + 0u] + instance.VertexOffset];
    GpuVertex vb = Vertices[Indices[base + 1u] + instance.VertexOffset];
    GpuVertex vc = Vertices[Indices[base + 2u] + instance.VertexOffset];
    mat3 world = mat3(instance.World);   // ⚠️ normals use the linear part directly (rigid / uniform scale); non-uniform scale is not corrected
    vec2 uv  = bc.x * va.Texcoord.xy + bc.y * vb.Texcoord.xy + bc.z * vc.Texcoord.xy;
    vec3 nI  = world * (bc.x * va.Normal.xyz + bc.y * vb.Normal.xyz + bc.z * vc.Normal.xyz);
    vec4 tI  = bc.x * va.Tangent + bc.y * vb.Tangent + bc.z * vc.Tangent;
    vec3 n   = dot(nI, nI) > 1e-12 ? normalize(nI) : ng;
    if (dot(n, ng) < 0.0) n = -n;                                   // interpolated normal follows the viewer-facing side
    vec3 t;
    if (dot(tI.xyz, tI.xyz) > 1e-12) t = world * tI.xyz;
    else                                                            // no authored tangents: derive from the UV parametrisation of the face
    {
        vec2 duv1 = vb.Texcoord.xy - va.Texcoord.xy, duv2 = vc.Texcoord.xy - va.Texcoord.xy;
        float det = duv1.x * duv2.y - duv2.x * duv1.y;
        t = abs(det) > 1e-12 ? (e1 * duv2.y - e2 * duv1.y) / det : (abs(n.z) < 0.999 ? cross(vec3(0.0, 0.0, 1.0), n) : vec3(1.0, 0.0, 0.0));
        tI.w = 1.0;
    }
    t = t - n * dot(n, t);
    t = dot(t, t) > 1e-12 ? normalize(t) : normalize(abs(n.z) < 0.999 ? cross(vec3(0.0, 0.0, 1.0), n) : vec3(1.0, 0.0, 0.0));
    float handed = tI.w < 0.0 ? -1.0 : 1.0;
    vec3 b = cross(n, t) * handed;

    // Ray-cone LOD bias (texture-size term added per fetch).
    vec2 duvA = vb.Texcoord.xy - va.Texcoord.xy, duvB = vc.Texcoord.xy - va.Texcoord.xy;
    float uvArea = 0.5 * abs(duvA.x * duvB.y - duvB.x * duvA.y);
    F.LodBias = (uvArea > 0.0 && worldArea > 0.0) ? 0.5 * log2(uvArea / worldArea) + log2(max(coneWidth, 1e-6) / max(abs(dot(ng, viewDir)), 1e-3)) : 0.0;

    ShadingRecord m;
    m.BaseColor = mat.Albedo.xyz; m.Metalness = mat.Emissive.w; m.DiffuseRoughness = 0.0;
    m.SpecularWeight = 1.0; m.SpecularColor = vec3(1.0); m.SpecularRoughness = mat.Albedo.w; m.SpecularAnisotropy = 0.0; m.SpecularIor = 1.5;
    m.ThinFilmWeight = 0.0; m.ThinFilmThickness = 0.5; m.ThinFilmIor = 1.4;
    m.HazinessWeight = 0.0; m.HazinessRoughness = 0.5;
    m.CoatWeight = 0.0; m.CoatColor = vec3(1.0); m.CoatRoughness = 0.0; m.CoatIor = 1.6; m.CoatDarkening = 1.0;
    m.FuzzWeight = 0.0; m.FuzzColor = vec3(1.0); m.FuzzRoughness = 0.5;
    m.Emission = mat.Emissive.xyz;
    F.Emission = mat.Emissive.xyz; F.Opacity = 1.0; F.Occlusion = 1.0;

    if (mat.Slabs.y > 0u)
    {
        GpuMaterialSlab S = MaterialSlabs[mat.Slabs.x];   // Tier A: the bottom slab only (multi-slab stacks arrive with R5)
        vec4 P0 = S.Payload[0], P1 = S.Payload[1], P2 = S.Payload[2], P3 = S.Payload[3];
        vec4 P8 = S.Payload[8], P9 = S.Payload[9], P10 = S.Payload[10], P11 = S.Payload[11], P12 = S.Payload[12], P13 = S.Payload[13];
        float normalScale = uintBitsToFloat(S.Runtime.y), occlusionStrength = uintBitsToFloat(S.Runtime.z);

        vec4 baseTex = SampleChannel(S, kChannelBaseColor, uv, F.LodBias, vec4(1.0));
        m.BaseColor          = P0.x * P0.yzw * baseTex.xyz;
        m.Metalness          = P1.x * SampleChannel(S, kChannelMetalness, uv, F.LodBias, vec4(1.0)).z;   // glTF: B
        m.DiffuseRoughness   = P1.y;
        m.SpecularWeight     = P1.z;
        m.SpecularColor      = vec3(P1.w, P2.xy) * SampleChannel(S, kChannelSpecularColor, uv, F.LodBias, vec4(1.0)).xyz;
        m.SpecularRoughness  = P2.z * SampleChannel(S, kChannelRoughness, uv, F.LodBias, vec4(1.0)).y;   // glTF: G
        m.SpecularAnisotropy = P2.w;
        m.SpecularIor        = P3.x;
        m.CoatWeight         = P8.y * SampleChannel(S, kChannelCoat, uv, F.LodBias, vec4(1.0)).x;
        m.CoatColor          = vec3(P8.zw, P9.x);
        m.CoatRoughness      = P9.y;
        m.CoatIor            = P9.w;
        m.CoatDarkening      = P10.x;
        m.FuzzWeight         = P10.y;
        m.FuzzColor          = vec3(P10.zw, P11.x) * SampleChannel(S, kChannelFuzz, uv, F.LodBias, vec4(1.0)).xyz;
        m.FuzzRoughness      = P11.y;
        m.Emission           = P11.z * vec3(P11.w, P12.xy) * SampleChannel(S, kChannelEmission, uv, F.LodBias, vec4(1.0)).xyz;
        m.ThinFilmWeight     = P12.z * SampleChannel(S, kChannelThinFilm, uv, F.LodBias, vec4(1.0)).x;
        m.ThinFilmThickness  = P12.w;
        m.ThinFilmIor        = P13.x;
        m.HazinessWeight     = P13.z;
        m.HazinessRoughness  = P13.w;
        F.Emission  = m.Emission;
        F.Opacity   = P13.y * SampleChannel(S, kChannelOpacity, uv, F.LodBias, vec4(1.0)).w;   // glTF: A of base colour
        F.Occlusion = mix(1.0, SampleChannel(S, kChannelOcclusion, uv, F.LodBias, vec4(1.0)).x, occlusionStrength);

        uint normalSlot = SlabTexture(S, kChannelNormal);
        if (normalSlot != 0xFFFFu)
        {
            vec3 tn = SampleChannel(S, kChannelNormal, uv, F.LodBias, vec4(0.5, 0.5, 1.0, 1.0)).xyz * 2.0 - 1.0;
            tn.x *= normalScale; tn.y *= normalScale;
            vec3 nm = normalize(t * tn.x + b * tn.y + n * tn.z);
            if (dot(nm, ng) > 0.0) n = nm;                         // reject maps that push the normal below the surface
            t = normalize(t - n * dot(n, t)); b = cross(n, t) * handed;
        }
    }

    F.Normal = n; F.Tangent = t; F.Bitangent = b; F.Geometric = ng;
    return m;
}

#include "TraversalCWBVH.slang"

// P2: the physical sky. Shared verbatim with Scratchpad/AtmosphereScatterTest.cpp, which compiles this same file
//    as C++ and measures the dawn band, the sunset chroma and the ozone-blue zenith against thresholds. One
//    implementation, two compilers — so the proof cannot drift away from what ships.
#include "RayGeneration.slang"
#include "AtmosphereScatter.slang"

// Real-time step budget. Measured against a 256/32 reference across dawn, sunset and noon: with the warped step
//    distribution, 16/8 lands at 2.12% mean error — better than 32 UNIFORM steps (2.435%) at half the cost. The
//    table is in AtmosphereScatter.slang at the march.
#define kSkyViewSteps 16
#define kSkySunSteps  8

// Aerial perspective runs on every surface pixel, not just misses, so it gets a smaller budget. The segment is
//    also far shorter than a sky ray — metres to kilometres rather than a hundred kilometres — so it needs far
//    fewer steps to resolve.
#define kAerialSteps    8
#define kAerialSunSteps 4

// Unpack the celestial record into the scattering parameters. Kept next to the include so the mapping from the
//    CPU-side struct to the physics is one short function that can be read in one go.
AtmosphereParameters CelestialAtmosphereOf(CelestialRecord sky)
{
    AtmosphereParameters atmosphere;
    atmosphere.RayleighScattering  = sky.RayleighScatteringAndHeight.xyz;
    atmosphere.MieScattering       = sky.MieScatteringAndHeight.xyz;
    atmosphere.OzoneAbsorption     = sky.OzoneAbsorptionAndG.xyz;
    atmosphere.GroundAlbedo        = sky.GroundAlbedoAndPlanetRadius.xyz;
    atmosphere.RayleighScaleHeight = sky.RayleighScatteringAndHeight.w;
    atmosphere.MieScaleHeight      = sky.MieScatteringAndHeight.w;
    atmosphere.MieAnisotropy       = sky.OzoneAbsorptionAndG.w;
    atmosphere.PlanetRadius        = sky.GroundAlbedoAndPlanetRadius.w;
    atmosphere.AtmosphereHeight    = sky.AtmosphereHeightAndFog.x;
    return atmosphere;
}

//------------------------------------------------------------------------------------------------------------------------
//                                          P2b: THE SKY AS SEEN BY A RAY
//------------------------------------------------------------------------------------------------------------------------

// Where the observer is, in planet-centred coordinates. The world is a local tangent frame with z up, so the
//    camera sits atop the planet radius; +z in world is "up" is "away from the centre", which is what makes the
//    ENU directions from the CPU solver line up with the sphere geometry here without a change of basis.
vec3 CelestialObserver(CelestialRecord sky, vec3 worldPosition)
{
    float planetRadius = sky.GroundAlbedoAndPlanetRadius.w;
    return vec3(worldPosition.x, worldPosition.y, worldPosition.z + planetRadius);
}

// 🔴 THE SUN DISC, COMPOSITED ANALYTICALLY — F1, the "weird shapes" rule.
//
//    The disc is 0.53 degrees across. The sky-view LUT is 192x192 over the whole sphere with a non-linear
//    latitude warp, so a texel near the horizon subtends far more than that: rasterising the disc into the table
//    turns a crisp circle into a smeared polygon that swims as the sun moves, which is precisely the "the sky
//    gives weird shapes" report. So the LUT holds sky ONLY, and the disc is added here, per-pixel, at full
//    resolution, as an exact analytic test against the true direction.
//
//    Limb darkening is the real solar profile: the edge of the disc is dimmer than the centre because the line of
//    sight there grazes cooler, higher photosphere. Without it the sun reads as a flat sticker.
vec3 CelestialSunDisc(CelestialRecord sky, vec3 rayDirection, vec3 transmittance)
{
    vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
    float cosRadius    = sky.SunDirectionAndCosRadius.w;
    float cosAngle     = dot(rayDirection, sunDirection);

    if (cosAngle < cosRadius) return vec3(0.0);

    // Normalised radius across the disc, 0 at centre and 1 at the limb.
    float normalised = sqrt(max(0.0, 1.0 - (1.0 - cosAngle) / max(1.0 - cosRadius, 1e-9)));
    float limb       = 1.0 - sky.SunRadianceAndLimb.w * (1.0 - normalised);

    return sky.SunRadianceAndLimb.xyz * limb * transmittance;
}

// The moon: the same analytic composite, but lit by the sun rather than self-luminous, so it carries a phase.
//    ⚠️ NO DAY/NIGHT SWITCH. A daytime moon is real and the brief asks for it; it disappears at noon purely
//    because the sky's own radiance is orders of magnitude above it, which the physical numbers already produce.
vec3 CelestialMoonDisc(CelestialRecord sky, vec3 rayDirection, vec3 transmittance)
{
    if ((uint(sky.ExposureAndFlags.w) & kCelestialFlagMoon) == 0u) return vec3(0.0);

    vec3  moonDirection = sky.MoonDirectionAndCosRadius.xyz;
    float cosRadius     = sky.MoonDirectionAndCosRadius.w;
    float cosAngle      = dot(rayDirection, moonDirection);

    if (cosAngle < cosRadius) return vec3(0.0);

    // Position across the disc, as a unit vector on the lunar sphere facing us. The phase terminator is then just
    //    the dot product with the sun — so the crescent always points at the sun, because it IS the sun's lighting
    //    rather than a hand-animated mask that can drift out of step with the sky.
    // Build a local frame on the disc to find which way this point faces.
    vec3 right = normalize(cross(vec3(0.0, 0.0, 1.0), moonDirection));
    vec3 up    = cross(moonDirection, right);
    vec3 offset = rayDirection - moonDirection * cosAngle;
    vec2 disc   = vec2(dot(offset, right), dot(offset, up));
    float radius = length(disc) / max(sqrt(max(1.0 - cosRadius * cosRadius, 1e-9)), 1e-9);
    vec3 surfaceNormal = normalize(moonDirection * sqrt(max(0.0, 1.0 - radius * radius))
                                 + right * disc.x * 60.0 + up * disc.y * 60.0);

    float lit = max(dot(surfaceNormal, sky.SunDirectionAndCosRadius.xyz), 0.0);

    // Earthshine keeps the unlit limb faintly visible, as it is in life.
    float shade = lit + sky.MoonRadianceAndEarthshine.w;

    return sky.MoonRadianceAndEarthshine.xyz * shade * transmittance;
}

// 🔴 CAMERA/EYE GLARE AROUND THE SUN — a TIGHT flare that keeps the disc readable, NOT a halo.
//
//    The problem this solves, measured: the disc is 24 000x the sky beside it and 0.53 deg across. At a typical
//    render height that is ~2 px, and ACES maps both the disc and the sky around it to ~1.0, so the sun and its
//    surroundings clip to the same white and the sun is invisible. Physically correct, visually absent.
//
//    ⚠️ WHAT THIS MUST NOT BECOME. The atmosphere ALREADY produces a broad aureole: measured at 17:00, the sky
//    0.3 deg from the sun is only 3.20x the sky 20 degrees away — a wide, gentle Mie forward lobe. That is the
//    real haze, and it is already there. A second broad term stacked on top of it is precisely the "sun blending
//    into the atmosphere like a halo" that is not wanted. So this function is deliberately NARROW and STEEP.
//
//    The shape is the CIE disability-glare function (Vos & van den Berg; the simplified general form is
//    10/theta^3 + 5/theta^2). Two properties earn it its place over a Gaussian bloom:
//      · theta^-3 falls off FAST — by 2 degrees it has dropped ~1000x from its value at 0.2 degrees, so it stays
//        a compact flare hugging the disc instead of a wash spreading over the sky;
//      · it is what an actual eye and an actual lens do, so the result reads as a photograph rather than an
//        effect. The sun in a photograph is not a big disc: it is a small disc inside a tight glare.
//
//    kGlareInner keeps theta^-3 finite at theta = 0 and sets where the flare stops growing; it is a shade wider
//    than the disc so the glare emerges from behind the sun's edge rather than spiking at its centre.
//    ⚠️ THE CUTOFF AND THE EXPONENT WERE BOTH SET BY MEASUREMENT, AND THE FIRST ATTEMPT WAS A HALO.
//    With the CIE tail (theta^-3 + theta^-2) and a 6 deg cutoff, the flare still lifted the sky by +0.03 ACES
//    at 3 degrees even after the strength was cut 800x — because theta^-2 decays far too slowly to stay tight.
//    Measured lift above bare sky at 3 deg, sweeping strength: 0.139, 0.139, 0.139, 0.117, 0.071, 0.030 — it
//    refused to go away. Scaling could not fix a shape problem.
//
//    So the tail term is dropped and the cutoff pulled in to 2.5 deg: pure theta^-3, which falls 1000x per
//    decade of angle, inside a hard window. That is a flare hugging the disc, and it CANNOT reach far enough to
//    read as a halo. Fixed by changing the shape, not by turning the knob down.
#define kGlareInner   0.30      // [deg] core softening radius, just wider than the disc's own 0.265
#define kGlareCutoff  2.5       // [deg] hard limit — past this the sky is untouched, so no halo is possible
//    Strength measured on the same sweep, as ACES lift above the bare sky at a correctly exposed 17:00:
//        2.5e-3 -> flare visible to 0.6 deg, ZERO lift at 3 deg    <- chosen
//        1.0e-4 -> visible only to 0.3 deg (too faint to help)
//    With the theta^-3 shape the strength now controls brightness WITHOUT controlling reach, which is exactly
//    the separation that was missing before.
#define kGlareStrength 2.5e-3   // [-]   scales the disc's radiance into the flare

vec3 CelestialSunGlare(CelestialRecord sky, vec3 rayDirection, vec3 transmittance)
{
    vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
    float cosAngle     = dot(rayDirection, sunDirection);
    if (cosAngle <= 0.0) return vec3(0.0);   // never behind the viewer

    // ⚠️ Not named `degrees` — that is a GLSL builtin, and shadowing it compiles here but breaks the C++ port.
    float angle = degrees(acos(clamp(cosAngle, -1.0, 1.0)));
    if (angle > kGlareCutoff) return vec3(0.0);

    // theta^-3 ONLY. The CIE function's theta^-2 term describes scatter out to 30 degrees, which is right for
    //    modelling disability glare and wrong for drawing a sun: it is what made the first attempt a halo.
    float t  = max(angle, kGlareInner);
    float psf = 1.0 / (t * t * t);

    // Smoothly windowed to zero across the whole range rather than only at the end: squared cosine falloff, so
    //    there is no angle at which the flare has a hard edge or a visible ring.
    float w = 1.0 - angle / kGlareCutoff;
    float window = w * w;

    // Driven by the DISC's radiance, so the flare tracks the sun's own brightness and reddens with it at dusk:
    //    the same SunTransmittance that warms the direct light warms the glare.
    return sky.SunRadianceAndLimb.xyz * (psf * kGlareStrength * window) * transmittance;
}

// 🔴 AERIAL PERSPECTIVE — the haze between the eye and a surface.
//
//    WHY THIS MATTERS AND WHAT IT FIXES. Without it a ground plane renders as a flat slab of one colour that
//    meets the sky at a hard seam. Measured on the golden-hour preview: the ground varied only ~20 levels over
//    200 px of receding distance, and the sky-to-ground transition was a 99-level cliff in 8 px, jumping hue
//    from gold to mauve. Real distance does two things at once and this does both:
//
//      · OUT-SCATTER: the surface's own light is attenuated on its way to the eye  (multiply by transmittance)
//      · IN-SCATTER:  air between eye and surface glows with scattered sunlight    (add the marched radiance)
//
//    The standard composite, in every reference from Preetham 1999 to Hillaire 2020, is exactly:
//
//        L = L_surface * T(eye, surface) + L_inscatter(eye, surface)
//
//    ⚠️ THIS IS WHY THE HORIZON SEAM DISAPPEARS. As a surface recedes, T falls towards zero and the in-scatter
//    rises towards the sky's own radiance — so ground at the skyline converges to the SAME value as the sky
//    just above it. The seam is not smoothed by a fade; it stops existing, because both sides are computing the
//    same integral over nearly the same air.
vec3 CelestialAerialPerspective(CelestialRecord sky, vec3 origin, vec3 surfacePosition, vec3 surfaceRadiance)
{
    if ((uint(sky.ExposureAndFlags.w) & kCelestialFlagEnabled) == 0u) return surfaceRadiance;

    vec3  toSurface = surfacePosition - origin;
    float distance  = length(toSurface);
    if (distance < 1.0) return surfaceRadiance;      // nothing to scatter in the first metre

    AtmosphereParameters atmosphere = CelestialAtmosphereOf(sky);
    vec3 observer = CelestialObserver(sky, origin);

    vec3 transmittance;
    vec3 inScatter = AtmosphereScatterTo(atmosphere, observer, toSurface / distance,
                                         sky.SunDirectionAndCosRadius.xyz,
                                         kAerialSteps, kAerialSunSteps, distance, transmittance);

    return surfaceRadiance * transmittance + inScatter * sky.SunIrradianceAndScale.xyz;
}

//------------------------------------------------------------------------------------------------------------------------
//                                    🔴 LENS FLARE — a camera artefact, never a halo
//------------------------------------------------------------------------------------------------------------------------
//
//    WHY THESE THREE ELEMENTS AND NOT THE USUAL FOUR. Every reference implementation — Chapman's article,
//    Froyok's UE port, the commercial packs — ships ghosts, streaks, a starburst AND A HALO. The halo is
//    deliberately absent here. A ring of light hugging the sun is visually indistinguishable from the
//    atmosphere's own Mie aureole, which this renderer already computes, and stacking a second one on top is
//    precisely the "sun blending into the atmosphere like a halo" that was rejected outright.
//
//    The three that remain are each safe from that failure BY CONSTRUCTION, not by tuning:
//      · the STREAK is horizontal, so it cannot read as a radially symmetric glow;
//      · the GHOSTS sit on the far side of the frame centre, nowhere near the sun;
//      · the STARBURST is hard radial spikes with gaps between them, which no haze produces.
//
//    All three are driven by the sun's SCREEN-RELATIVE position, which is what makes them read as a lens: they
//    sweep and swing as the camera turns even though the sky has not changed. That is the opposite of the
//    atmosphere, and it is why they must be computed here rather than folded into the sky integral.
uint CelestialFlareElements(CelestialRecord sky) { return uint(sky.FlareStreakAndFlags.w); }

// The anamorphic streak: a horizontal smear through the sun. `right` and `up` are the camera's own basis, so
//    the streak stays level with the FRAME rather than with the world — tilt the camera and it tilts with it,
//    which is exactly what a real anamorphic lens does.
vec3 CelestialFlareStreak(CelestialRecord sky, vec3 rayDirection, vec3 right, vec3 up)
{
    vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
    if (dot(rayDirection, sunDirection) <= 0.0) return vec3(0.0);

    // Offset from the sun, split into the camera's horizontal and vertical axes.
    vec3  offset     = rayDirection - sunDirection * dot(rayDirection, sunDirection);
    float horizontal = abs(dot(offset, right));
    float vertical   = abs(dot(offset, up));

    float length    = sky.FlareChromaAndFade.z;
    float thickness = sky.FlareChromaAndFade.w;
    if (horizontal > length) return vec3(0.0);

    // Smooth along the streak and sharply across it. The vertical term is squared-exponential so the smear has
    //    a soft core and no hard edge, and the horizontal term tapers to exactly zero at the tip.
    float along  = 1.0 - horizontal / length;
    float across = exp(-(vertical * vertical) / max(thickness * thickness, 1e-12));

    return sky.FlareStreakAndFlags.xyz * (along * along * across);
}

// Ghosts: internal reflections between lens elements. Each sits at a point obtained by reflecting the sun
//    through the frame centre and scaling — so as the sun approaches the edge of frame, the ghosts march
//    across from the opposite side. That motion is the tell that this is glass, not sky.
vec3 CelestialFlareGhosts(CelestialRecord sky, vec3 rayDirection, vec3 forward)
{
    int count = int(sky.FlareGhostAndCount.w);
    if (count <= 0) return vec3(0.0);

    vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
    float dispersal    = sky.FlareGhostAndCount.y;
    float size         = sky.FlareGhostAndCount.z;
    float chromatic    = sky.FlareChromaAndFade.x;

    // The sun's offset from the centre of the frame, which is the axis every ghost lies on.
    vec3 sunOffset = sunDirection - forward * dot(sunDirection, forward);

    // 🔴 THE DEGENERATE CASE THAT WAS A HALO. When the camera looks EXACTLY at the sun, sunOffset is the zero
    //    vector, every ghost centre collapses to `forward` — which is the sun — and the whole chain piles up
    //    into a ring hugging it. That is precisely the banned artefact, and it appears in the single most
    //    likely thing a player does: look straight at the sun. Caught by the ring sweep in LensFlareTest §3,
    //    which measured 0.147 of ghost energy within 4 degrees while the off-axis case read exactly zero.
    //
    //    Physically there is nothing to draw here: ghosts are reflections displaced ACROSS the frame, and with
    //    the source dead centre there is no displacement, so the reflections land on the source and are simply
    //    the source. Returning nothing is the honest answer, and it also removes the discontinuity — the fade
    //    below ramps the ghosts in as the sun moves off centre rather than switching them on.
    float offAxis = length(sunOffset);
    if (offAxis < 1e-4) return vec3(0.0);

    // Ramp in over the first degree off-centre, so there is no pop as the sun crosses the frame's middle.
    float centreFade = clamp(offAxis / 0.0175, 0.0, 1.0);

    vec3 total = vec3(0.0);
    for (int i = 1; i <= count; ++i)
    {
        // Mirrored through the centre and stepped outward: -i * dispersal puts ghost 1 just past the centre and
        //    the rest trailing away from the sun.
        float step   = -float(i) * dispersal;
        vec3  centre = normalize(forward + sunOffset * step);

        float distance = length(rayDirection - centre * dot(rayDirection, centre));
        float radius   = size * (0.6 + 0.5 * float(i));     // later ghosts are larger, as in a real stack
        if (distance > radius) continue;

        // A soft-edged disc with a brighter rim — real ghosts are images of the aperture, not gaussians.
        float t    = distance / radius;
        float disc = (1.0 - t * t);
        disc = disc * disc * (0.55 + 0.45 * t * t);

        // Each ghost carries a different tint: successive reflections pass the lens coating a different number
        //    of times, so they drift through the spectrum rather than all being the same colour.
        float phase = float(i) * chromatic;
        vec3  tint  = vec3(0.5 + 0.5 * cos(phase),
                           0.5 + 0.5 * cos(phase + 2.094),
                           0.5 + 0.5 * cos(phase + 4.189));

        total += tint * disc;
    }

    return total * sky.FlareGhostAndCount.x * centreFade;
}

// Starburst: diffraction at the aperture blades. An even-bladed iris produces N spikes and an odd-bladed one
//    produces 2N — that is real photographic behaviour, and it falls out of the cos(N * angle) term below
//    rather than being special-cased.
vec3 CelestialFlareStarburst(CelestialRecord sky, vec3 rayDirection, vec3 right, vec3 up)
{
    vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
    float cosAngle     = dot(rayDirection, sunDirection);
    if (cosAngle <= 0.0) return vec3(0.0);

    float angle = acos(clamp(cosAngle, -1.0, 1.0));
    float reach = sky.FlareBurstAndChroma.y;
    if (angle > reach || angle < 1e-6) return vec3(0.0);

    vec3  offset = rayDirection - sunDirection * cosAngle;
    float theta  = atan(dot(offset, up), dot(offset, right));

    // 🔴 ODD BLADE COUNTS MUST DOUBLE, AND THE FIRST VERSION DID NOT. A 7-bladed iris makes a 14-point star,
    //    because each blade edge diffracts into a pair of opposed spikes and with odd N those pairs do not
    //    coincide; with even N they overlap exactly and you get N. The original `cos(theta * blades * 0.5)`
    //    gave 7 spikes for 7 blades — measured, not assumed, by counting maxima around a ring.
    //
    //    The correct spike count is N for even N and 2N for odd N, so that is computed explicitly rather than
    //    hoped for from an algebraic coincidence.
    float blades = sky.FlareBurstAndChroma.w;
    float spikes = mod(blades, 2.0) < 0.5 ? blades : blades * 2.0;
    float lobe   = abs(cos(theta * spikes * 0.5));
    float spike  = pow(lobe, sky.FlareBurstAndChroma.z);

    // 🔴 Falls off as 1/angle along each spike, so the spikes are LONG but the light between them is zero. That
    //    gap is what keeps a starburst from reading as a glow: a halo fills the annulus, a starburst does not.
    float radial = (1.0 - angle / reach) / (1.0 + angle * 40.0);

    return vec3(spike * radial) * sky.FlareBurstAndChroma.x;
}

// Everything the lens adds, composited. `occlusion` is 1 when the sun is fully visible and 0 when hidden.
vec3 CelestialLensFlare(CelestialRecord sky, vec3 rayDirection, vec3 forward, vec3 right, vec3 up,
                        vec3 sunTransmittance, float occlusion)
{
    uint elements = CelestialFlareElements(sky);
    if (elements == 0u) return vec3(0.0);

    // The flare is formed from light that reached the lens, so it must carry the sun's own attenuation: at
    //    sunset the ghosts go orange with the sun, for free, rather than needing their own colour ramp.
    float fade = mix(1.0, occlusion, sky.FlareChromaAndFade.y);
    if (fade <= 0.0) return vec3(0.0);

    vec3 total = vec3(0.0);
    if ((elements & kFlareElementStreak)    != 0u) total += CelestialFlareStreak(sky, rayDirection, right, up);
    if ((elements & kFlareElementGhosts)    != 0u) total += CelestialFlareGhosts(sky, rayDirection, forward);
    if ((elements & kFlareElementStarburst) != 0u) total += CelestialFlareStarburst(sky, rayDirection, right, up);

    return total * sunTransmittance * sky.SunIrradianceAndScale.xyz * fade;
}

// The whole sky along a ray: scattering, plus the discs composited on top. `includeDiscs` is false for the
//    reservoir's light-sampling path, where the sun is sampled as an explicit light rather than found by chance.
vec3 CelestialSky(CelestialRecord sky, vec3 origin, vec3 rayDirection, bool includeDiscs)
{
    if ((uint(sky.ExposureAndFlags.w) & kCelestialFlagEnabled) == 0u) return vec3(0.0);

    AtmosphereParameters atmosphere = CelestialAtmosphereOf(sky);
    vec3 observer = CelestialObserver(sky, origin);

    vec3 transmittance;
    vec3 radiance = AtmosphereScatter(atmosphere, observer, rayDirection,
                                      sky.SunDirectionAndCosRadius.xyz,
                                      kSkyViewSteps, kSkySunSteps, transmittance);

    // ⚠️ The integral is written for unit solar irradiance, so the sun's actual output scales it here — and it
    //    must be the SAME number the disc is derived from, or the sky and the sun it came from drift apart in
    //    brightness as the Intensity slider moves.
    radiance *= sky.SunIrradianceAndScale.xyz;

    if (includeDiscs)
    {
        // Glare first, then the disc on top of it — so the disc always sits ABOVE its own flare and stays the
        //    brightest thing in frame. Reversing these would let the flare wash over the disc's edge, which is
        //    the "sun dissolving into the sky" failure.
        radiance += CelestialSunGlare(sky, rayDirection, transmittance);
        radiance += CelestialSunDisc(sky, rayDirection, transmittance);
        radiance += CelestialMoonDisc(sky, rayDirection, transmittance);
    }

    return radiance;
}
const uint kVisibilityInvalid = 0xFFFFFFFFu;
uint VisibilityInstance(uint Packed)  { return (Packed >> 14) & 0x3FFFFu; }
uint VisibilityPrimitive(uint Packed) { return Packed & 0x3FFFu; }

//------------------------------------------------------------------------------------------------------------------------
//                                                    PUSH CONSTANTS
//------------------------------------------------------------------------------------------------------------------------

layout(push_constant) uniform ReSTIRConstants
{
    vec3    CameraOrigin;           // [m]   camera world position
    float   FieldOfViewTanHalf;     // [-]   tan(FoV/2)
    vec3    CameraForward;          // [-]   forward unit vector
    float   AspectRatio;            // [-]   width / height
    vec3    CameraRight;            // [-]   right unit vector
    float   Exposure;               // [-]   ACES exposure
    vec3    CameraUp;               // [-]   up unit vector
    float   AmbientStrength;        // [-]   ambient fallback
    uint    ViewportWidth;          // [px]  render width
    uint    ViewportHeight;         // [px]  render height
    uint    FrameIndex;             // [cnt] temporal accumulation index
    uint    ExtraCandidateCount;  // [cnt] extra same-pixel RIS candidates (R6 row 3: renamed; true spatial reuse is the fixed kSpatialTaps cross)
    uint    SamplesPerPixel;        // [cnt] primary DI candidates per pixel
    uint    AlphaMaskedMaterialCount; // [cnt] R4b: materials flagged kMaterialFlagAlphaMask (0 ⇒ any-hit shadow rays) — was TriangleCount (unused here)
    uint    LightTriangleCount;     // [cnt] emissive triangles for DI sampling
    uint    FeatureFlags;           // [bit] kFeatureGlobalIllumination | kFeatureAntiAliasing
    // ⚠️ The block is exactly 128 bytes — Vulkan's guaranteed push-constant minimum. Anything further has
    //    to become a uniform buffer, or it breaks on cards offering only the guarantee.
    // How much colour the eye still has at the adapted luminance: 1 normally, 0 in near-black adaptive scenes.
    float   ColourSaturation;       // [-]   taken from one of the reserves, so the block is still 128 B
    uint    PushReserve1;
    uint    PushReserve2;
    uint    PushReserve3;
    uint    PushReserve4;
    uint    PushReserve5;
    uint    PushReserve6;
    uint    PushReserve7;
};

//------------------------------------------------------------------------------------------------------------------------
const uint kFeatureGlobalIllumination = 1u;   // bit 0: trace the secondary bounce (section 4)
const uint kFeatureAntiAliasing       = 2u;   // bit 1: sub-pixel jitter — applied by the R2 raster/resolve, not here
const uint kFeatureAmbientFloor       = 4u;   // bit 2: add albedo × AmbientStrength (debug fill light; default OFF)
const uint kFeatureTemporalReuse      = 8u;   // bit 3: R6 row 2 — temporal reservoir reuse (back-projection + validation)
const uint kFeatureSpatialReuse       = 16u;  // bit 4: R6 row 3 — spatiotemporal neighbour reuse (pairwise MIS)
const uint kFeatureAliasPick          = 32u;  // bit 5: R6 row 3 — Walker-alias light pick (off = uniform, the R0 identity proof)
const uint kFeatureTemporalReprojection = 64u;  // bit 6: R7a — reproject the running mean through the R2 motion vectors
const uint kFeatureDenoise            = 128u; // bit 7: R7 — the à-trous filter runs, so the kernel defers the tone map to it

float PixelSpreadAngle() { return 2.0 * FieldOfViewTanHalf / float(ViewportHeight); }   // [rad] R4b ray-cone spread per pixel

//------------------------------------------------------------------------------------------------------------------------
//                                                    PCG RANDOM
//------------------------------------------------------------------------------------------------------------------------

uint PcgHash(uint v)
{
    uint state = v * 747796405u + 2891336453u;
    uint word  = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float RandFloat(inout uint seed)
{
    seed = PcgHash(seed);
    return float(seed) * (1.0 / 4294967296.0);
}

uint MakeSeed(uvec2 pixel, uint frame)
{
    return PcgHash(pixel.x + pixel.y * 7919u + frame * 1000003u);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    RAY / HIT STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

const uint kMaterialFlagAlphaMask = 2u;      // MaterialRecord.Flags bit (SceneRecords.slang)
const uint kAlphaMaskRetraceLimit = 4u;      // cut-out layers a shadow / bounce ray may pass through before giving up
struct Ray    { vec3 origin; vec3 dir; };
struct Hit    { bool valid; float t; vec3 pos; vec3 normal; uint matIdx; uint primitive; uint instance; };

const float kEps = 1e-4;
const float kInf = 1e30;

//------------------------------------------------------------------------------------------------------------------------
//                                                    SCENE TRAVERSAL
//------------------------------------------------------------------------------------------------------------------------

// R4b alpha mask: true when the hit on `primitive` is a cut-out texel (kMaterialFlagAlphaMask materials only). Opacity =
//    geometry_opacity × base-colour alpha at LOD 0 through the flat triangle's own UVs — no vertex fetch on this path.
bool AlphaMaskCutOut(uint primitive, vec3 hitPos)
{
    GpuTriangle tri = Triangles[primitive];
    GpuMaterial mat = Materials[floatBitsToUint(tri.v0.w)];
    if ((mat.Slabs.z & kMaterialFlagAlphaMask) == 0u) return false;
    float opacity = 1.0;
    if (mat.Slabs.y > 0u) opacity = MaterialSlabs[mat.Slabs.x].Payload[13].y;   // geometry_opacity
    if (mat.Textures.x != kMaterialTextureNone)
    {
        vec3 bc = Barycentric(hitPos, tri.v0.xyz, tri.v1.xyz, tri.v2.xyz);
        vec2 uv = bc.x * tri.uv.xy + bc.y * tri.uv.zw + bc.z * vec2(tri.v1.w, tri.v2.w);
        opacity *= textureLod(Textures[nonuniformEXT(mat.Textures.x)], uv, 0.0).a;
    }
    return opacity < mat.AlphaCutoff;
}

//------------------------------------------------------------------------------------------------------------------------
//                                        HIT IDENTITY  (D2 — one definition, one place)
//------------------------------------------------------------------------------------------------------------------------
// A hit is identified by the PAIR (instance, primitive). Today Triangles[] is one flat world-space array and the
//    traversal returns a flat slot, so the instance is recovered from the layout. Once instances carry transforms
//    (D3) the traversal will return the pair directly and only these two helpers change — every caller already
//    speaks in terms of the pair, so nothing downstream has to be revisited.
//
// ⚠️ Why this is worth a helper rather than an inline loop: the search below used to be copy-pasted at the bounce
//    site. Two copies of an identity rule is how (instance, primitive) silently disagree between the primary hit
//    and the bounce hit — and because ReSTIR reuses hits across frames, a disagreement decorrelates the reservoir
//    instead of crashing. One definition removes that whole class of bug.

// Instance owning a flat primitive slot. Triangles[] is laid out per instance in FlatTriangleOffset order, so this
//    is a search for the last instance whose offset does not exceed the slot. Bounded by instance count.
uint InstanceOfPrimitive(uint flatPrimitive)
{
    uint found = 0u;
    for (uint i = 0u; i + 1u < uint(Instances.length()); ++i)
    {
        if (Instances[i + 1u].FlatTriangleOffset <= flatPrimitive) found = i + 1u;
        else break;
    }
    return found;
}

// Primitive index WITHIN its instance — what ResolveMaterial expects for vertex/uv lookup.
uint LocalPrimitive(uint flatPrimitive, uint instance)
{
    return flatPrimitive - Instances[instance].FlatTriangleOffset;
}

Hit TraceScene(Ray ray)
{
    // R3: closest hit through the CWBVH; the primitive index addresses the flat Triangles[] for material and normal.
    // R4b: a hit on a cut-out texel of an alpha-masked material is skipped and the ray re-traced from just past it.
    Hit closest;
    closest.valid = false;
    closest.t     = kInf;

    vec3 rD = vec3(1.0) / ray.dir;   // IEEE ±inf on axis-aligned rays is handled by the slab test exactly as in tinybvh
    vec3  origin = ray.origin;
    float tBase  = 0.0;
    uint  passes = AlphaMaskedMaterialCount == 0u ? 0u : kAlphaMaskRetraceLimit;
    for (uint pass = 0u; pass <= passes; ++pass)
    {
        TraversalHit h = TraverseClosest(origin, ray.dir, rD, kInf);
        if (h.primitive == 0xFFFFFFFFu || h.t <= kEps) return closest;
        vec3 pos = origin + h.t * ray.dir;
        if (passes != 0u && AlphaMaskCutOut(h.primitive, pos)) { origin = pos + ray.dir * kEps; tBase += h.t + kEps; continue; }

        GpuTriangle tri = Triangles[h.primitive];
        closest.valid  = true;
        closest.t      = tBase + h.t;
        closest.pos    = pos;
        closest.normal = normalize(cross(tri.v1.xyz - tri.v0.xyz, tri.v2.xyz - tri.v0.xyz));   // R4a: face normal from the edges (slot now carries UVs)
        closest.matIdx = floatBitsToUint(tri.v0.w);
        closest.primitive = h.primitive;
        closest.instance  = InstanceOfPrimitive(h.primitive);   // D2: identity is the (instance, primitive) pair
        return closest;
    }
    return closest;
}

bool TraceShadow(vec3 origin, vec3 target)
{
    vec3 dir = target - origin;
    float tMax = length(dir) - 2.0 * kEps;
    dir = normalize(dir);
    vec3 rD = vec3(1.0) / dir;
    if (AlphaMaskedMaterialCount == 0u)
        return TraverseOccluded(origin + dir * kEps, dir, rD, tMax);   // R3 fast path: any-hit, no material fetch (Cornell unchanged)

    // R4b: closest-hit walk that steps through cut-out texels (foliage cards); an opaque hit before the light occludes.
    vec3 o = origin + dir * kEps;
    for (uint pass = 0u; pass <= kAlphaMaskRetraceLimit; ++pass)
    {
        TraversalHit h = TraverseClosest(o, dir, rD, tMax);
        if (h.primitive == 0xFFFFFFFFu) return false;
        vec3 pos = o + h.t * dir;
        if (!AlphaMaskCutOut(h.primitive, pos)) return true;
        o = pos + dir * kEps; tMax -= h.t + kEps;
        if (tMax <= 0.0) return false;
    }
    return true;   // more cut-out layers than the limit: treat as occluded (conservative, never leaks light)
}

//------------------------------------------------------------------------------------------------------------------------
//                                          COSINE-WEIGHTED HEMISPHERE SAMPLING
//------------------------------------------------------------------------------------------------------------------------

vec3 SampleCosineHemisphere(vec3 normal, float u1, float u2)
{
    float r     = sqrt(u1);
    float theta = 6.28318530718 * u2;
    float x     = r * cos(theta);
    float y     = r * sin(theta);
    float z     = sqrt(max(0.0, 1.0 - u1));

    vec3 up      = abs(normal.y) < 0.999 ? vec3(0,1,0) : vec3(1,0,0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitan   = cross(normal, tangent);

    return normalize(tangent * x + bitan * y + normal * z);
}

//------------------------------------------------------------------------------------------------------------------------
//                             LIGHT TRIANGLE AREA SAMPLING (uniform area pick)
//------------------------------------------------------------------------------------------------------------------------

// Light triangles come from the luminaire table (R2), which carries a Walker alias entry + area-power pdf per
//    luminaire — R6 row 3 picks through it (PickLight) for many-light scenes. Uniform stays behind the F5 toggle
//    for the R0 identity proof.
uint LightTriangle(uint lightIdx) { return Luminaires[lightIdx].TriangleSlot; }

vec3 SampleLightPoint(uint lightTriIdx, float u1, float u2)
{
    uint idx = LightTriangle(lightTriIdx);
    vec3 v0 = Triangles[idx].v0.xyz;
    vec3 v1 = Triangles[idx].v1.xyz;
    vec3 v2 = Triangles[idx].v2.xyz;
    float r1 = sqrt(u1);
    return (1.0 - r1) * v0 + r1 * (1.0 - u2) * v1 + r1 * u2 * v2;
}

//------------------------------------------------------------------------------------------------------------------------
//                                    🔴 P3 / F2: THE SUN IS A MEMBER OF THE LIGHT POOL
//------------------------------------------------------------------------------------------------------------------------
//
//    The reported failure was "sun isn't being used in ReSTIR" — the sun painted on the miss path as a backdrop
//    while the reservoir resampled only emissive triangles. Ray Tracing Gems II ch.23 states the rule plainly:
//    the sun is an ordinary entry in the light pool. So it is given a light index one past the end of the
//    luminaire table and travels through EVERY existing path — initial RIS, extra candidates, temporal reuse,
//    spatial reuse, the shadow ray, the final shade — with no parallel code path to drift out of step.
//
//    ⚠️ HOW A DIRECTIONAL LIGHT FITS AN AREA-LIGHT ESTIMATOR. The reservoir stores a world POINT and the shading
//    maths divides by d². The sun has no position. Rather than special-case the estimator (which would mean
//    touching 11 call sites and inventing a second target function), the sun is represented as a disc at a large
//    but finite distance:
//
//        · the sample point is hitPos + (direction jittered within the sun's angular radius) * kSunDistance
//        · its "emission" is irradiance x kSunDistance², so that emission / d² collapses back to the irradiance
//
//    The two cancel exactly, so f·E·cosθ comes out — the correct directional-light contribution — through the
//    unmodified area-light code. Sampling across the disc rather than the centre is what produces genuine
//    penumbrae from the existing shadow ray, for free.
//
//    kSunDistance is a compromise measured against float precision, not a round number picked by feel. Too small
//    and a reservoir shared between pixels parallaxes (the stored point implies a different direction at a
//    neighbour); too large and emission = E·d² loses mantissa. At 100 km, two pixels 5 m apart disagree by
//    5e-5 rad = 0.003 deg — far inside the sun's own 0.53 deg disc, so reuse stays physically sensible — while
//    E·d² stays around 2e11, comfortably inside fp32.
#define kSunDistance 100000.0

// The sun occupies the index one past the real luminaires, so `< LightTriangleCount` still means "a triangle".
uint SunLightIndex() { return LightTriangleCount; }

bool SunIsActive(CelestialRecord sky)
{
    // Below the horizon the sun contributes nothing and must not be sampled: every candidate spent on it would
    //    be a wasted reservoir slot returning zero, which shows up as noise at dusk.
    return (uint(sky.ExposureAndFlags.w) & kCelestialFlagEnabled) != 0u
        && sky.SunDirectionAndCosRadius.z > 0.0;
}

uint TotalLightCount(CelestialRecord sky)
{
    return LightTriangleCount + (SunIsActive(sky) ? 1u : 0u);
}

// Every read of a light's emission goes through this accessor, so the reservoir paths cannot disagree
//    about what a light radiates.
vec3 LightEmission(uint lightIndex)
{
    if (lightIndex >= LightTriangleCount)
    {
        // The sun, pre-multiplied by d² so the estimator's 1/d² cancels it. Attenuated by the atmosphere along
        //    the path to the sun, which is what reddens direct sunlight at sunset — the scene warms because the
        //    air is filtering the light, not because a colour was keyframed.
        CelestialRecord sky = Celestial[0];
        return sky.SunIrradianceAndScale.xyz * sky.SunTransmittance.xyz * (kSunDistance * kSunDistance);
    }
    return Materials[floatBitsToUint(Triangles[LightTriangle(lightIndex)].v0.w)].Emissive.xyz;
}

// Sample a point on a light. For a triangle this is the usual area sample; for the sun it is a point on its
//    visible disc, which is what gives the shadow its penumbra.
vec3 SampleLightPointFrom(uint lightIndex, float u1, float u2, vec3 from)
{
    if (lightIndex >= LightTriangleCount)
    {
        CelestialRecord sky = Celestial[0];
        vec3  sunDirection = sky.SunDirectionAndCosRadius.xyz;
        float cosRadius    = sky.SunDirectionAndCosRadius.w;

        // Uniform direction inside the cone of half-angle acos(cosRadius) — the standard cone sample.
        float cosTheta = mix(cosRadius, 1.0, u1);
        float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
        float phi      = 6.2831853 * u2;

        vec3 tangent   = normalize(abs(sunDirection.z) < 0.99 ? cross(vec3(0.0, 0.0, 1.0), sunDirection)
                                                              : vec3(1.0, 0.0, 0.0));
        vec3 bitangent = cross(sunDirection, tangent);

        vec3 jittered = normalize(sunDirection * cosTheta
                                + tangent   * (sinTheta * cos(phi))
                                + bitangent * (sinTheta * sin(phi)));

        return from + jittered * kSunDistance;
    }
    return SampleLightPoint(lightIndex, u1, u2);
}

// R6 row 3: light-triangle pick. Alias ON (F5, default): one Walker-alias probe — col uniform, accept on
//    Threshold else redirect to AliasSlot, source pdf = Probability[z] (power/total, SceneStructure.cpp).
//    Alias OFF: uniform over luminaires with p = 1/N — bit-for-bit the R0 estimator (identity proof).
//    Any positive pSource keeps RIS unbiased: the converged image is unchanged, only the noise differs.
uint PickTriangleLight(inout uint seed, out float pSource)
{
    if ((FeatureFlags & kFeatureAliasPick) != 0u)
    {
        uint col = uint(RandFloat(seed) * float(LightTriangleCount));
        col = min(col, LightTriangleCount - 1u);
        uint z = RandFloat(seed) < Luminaires[col].Threshold ? col : Luminaires[col].AliasSlot;
        pSource = Luminaires[z].Probability;
        return z;
    }
    pSource = 1.0 / float(LightTriangleCount);
    return min(uint(RandFloat(seed) * float(LightTriangleCount)), LightTriangleCount - 1u);
}

uint PickLight(inout uint seed, out float pSource)
{
    // 🔴 The sun competes for reservoir slots on equal terms. An even split between "the sun" and "everything
    //    else" is the simple choice and a sound one outdoors, where the sun usually dominates but the emissives
    //    still matter; any positive pSource keeps RIS unbiased, so this trades noise, never correctness.
    CelestialRecord sky = Celestial[0];
    if (SunIsActive(sky))
    {
        const float sunShare = LightTriangleCount > 0u ? 0.5 : 1.0;
        if (RandFloat(seed) < sunShare)
        {
            pSource = sunShare;
            return SunLightIndex();
        }
        // Fall through to a triangle pick, whose probability must be scaled by the share left over for it.
        float trianglePSource;
        uint  picked = PickTriangleLight(seed, trianglePSource);
        pSource = trianglePSource * (1.0 - sunShare);
        return picked;
    }
    return PickTriangleLight(seed, pSource);
}

//------------------------------------------------------------------------------------------------------------------------
//                                  RIS DIRECT LIGHTING — WEIGHTED RESERVOIR SAMPLING (initial candidates)
//------------------------------------------------------------------------------------------------------------------------

// R6 row 2: full-BSDF target — f(wo,wi)·Le·cosθ/d². Any positive target keeps RIS unbiased (converged image
//    unchanged); the BSDF-weighted one is required for correct re-evaluation at foreign pixels on reuse.
float PHatFull(SurfaceFrame F, ShadingRecord m, ResolvedLayers L, vec3 wo, vec3 emit, vec3 toLight, float dist2)
{
    float dist = max(sqrt(dist2), 1e-9);
    vec3  lDir = toLight / dist;
    float cosT = max(0.0, dot(F.Geometric, lDir));
    if (cosT <= 0.0) return 0.0;
    vec3  wi = ToLocal(F, lDir);
    if (wi.z <= 0.0) return 0.0;
    return max(dot(EvaluateBsdf(m, L, wo, wi), emit), 0.0) * cosT / (dist2 + kDistanceEpsilon);
}

struct Reservoir
{
    vec3  SelectedPoint;    // chosen light sample position
    float WeightSum;        // running sum of candidate weights (Σ p̂/p_source)
    uint  SampleCount;      // M: number of considered candidates
    float UnbiasedWeight;   // W: final unbiased contribution weight (WeightSum / (M · p̂(z)))
    uint  SelectedLight;    // R6: luminaire-table index of the chosen sample (kills the O(L) nearest-emissive searches)
    vec2  SelectedUv;       // R6: area-sample uv of the chosen sample on its triangle (p̂ re-evaluation on reuse)
    uint  Visible;          // R6: visibility of the chosen sample at the shading pixel (1 = lit; re-traced on reuse)
};

void ResampleCandidate(inout Reservoir res, vec3 point, uint light, vec2 uv, float weight, inout uint seed)
{
    res.WeightSum    += weight;
    res.SampleCount  += 1u;
    if (RandFloat(seed) * res.WeightSum <= weight)
    {
        res.SelectedPoint = point;
        res.SelectedLight = light;
        res.SelectedUv    = uv;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                              ACES FILMIC TONE MAPPING
//------------------------------------------------------------------------------------------------------------------------

// Rec. 709 luma. Must match AtrousDenoise.slang exactly: the kernel measures the variance of THIS quantity and the
//    filter compares neighbours by it, so a mismatch would make the filter's noise estimate describe a different
//    signal from the one it is filtering.
float Luminance(vec3 colour)
{
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

float AcesFilm(float x)
{
    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 ToneMap(vec3 hdr)
{
    // A7d ⚠️ Desaturate BEFORE the exposure and the curve, in linear radiance, because that is where the colour
    //    physically is. Doing it afterwards would mix display values, and a channel that had already clipped
    //    would drag the grey it is mixed toward.
    //
    //    Below about 3 cd/m² the cones give out before the rods do, so colour drains from what the eye sees and
    //    by 0.003 it is gone. Rendering full saturation down there is what turns a faint pre-dawn glow into a
    //    lurid orange band: at 15° below the horizon the glow is 0.078 cd/m² and almost entirely red, so red
    //    clips while blue stays black. Mixed to grey it reads as the pale band it actually is.
    const float Grey = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
    hdr = mix(vec3(Grey), hdr, clamp(ColourSaturation, 0.0, 1.0));
    hdr *= Exposure;
    float r = AcesFilm(hdr.r);
    float g = AcesFilm(hdr.g);
    float b = AcesFilm(hdr.b);
    // gamma 2.2
    return pow(vec3(r, g, b), vec3(1.0 / 2.2));
}

//------------------------------------------------------------------------------------------------------------------------
//                                              TEMPORAL ACCUMULATION RESOLVE
//------------------------------------------------------------------------------------------------------------------------
// Running mean in linear radiance, REPROJECTED through the R2 motion vectors (R7a).
//
// Before R7a the mean was read from the pixel's own address and the whole history was thrown away the instant the
//    camera moved: the image went to one sample per pixel while moving and only resolved once the camera stopped.
//    The motion vectors needed to do better already existed — R2 writes them and R6 back-projects temporal
//    reservoirs through them — they simply were not consumed by the accumulator. This reads the history from where
//    the surface WAS, so a pan keeps its samples.
//
// Validation is deliberately the same rule R6 row 2 uses for reservoirs — 25° normal, 10 % relative depth — rather
//    than a second, subtly different one. A pixel that fails it is disocclusion: new geometry with no history, and
//    the honest answer there is to restart rather than smear a neighbour's colour across the silhouette.
//
// The history's alpha channel carries the sample count. Reprojection preserves it, so a surface tracked across a
//    pan keeps converging instead of restarting at n = 1; disocclusion resets it to 1. HistorySurfaceImage stores the
//    matching (normal, depth) so the next frame can validate against what this frame actually shaded.

const float kReprojectNormalCos = kTemporalNormalCos;   // 25°, identical to the reservoir rule
const float kReprojectDepthTol  = kTemporalDepthTol;    // 10 % relative

// Depth < 0 marks "no surface" (background); such a pixel never reprojects and never becomes a valid source.
void ResolveSurface(uvec2 pixel, vec3 radiance, vec3 normal, float depth)
{
    vec4  history   = vec4(0.0);
    float count     = 0.0;
    bool  resolved  = false;   // did we already establish where this pixel's history comes from?

    const bool reproject = depth > 0.0 && (FeatureFlags & kFeatureTemporalReprojection) != 0u;

    vec2 moments = vec2(0.0);   // R7: x = E[luma], y = E[luma²], carried alongside the mean

    if (FrameIndex > 0u && reproject)
    {
        vec2 extent = vec2(float(ViewportWidth), float(ViewportHeight));
        vec2 cuv    = (vec2(pixel) + 0.5) / extent;
        vec2 motion = texelFetch(MotionImage, ivec2(pixel), 0).rg;
        ivec2 prevPx = ivec2(floor((cuv - motion) * extent));

        if (all(greaterThanEqual(prevPx, ivec2(0))) && prevPx.x < int(ViewportWidth) && prevPx.y < int(ViewportHeight))
        {
            vec4 prevSurface = imageLoad(HistorySurfaceImage, prevPx);
            // prevSurface.w <= 0 means that pixel held no surface last frame, so there is nothing to inherit.
            if (prevSurface.w > 0.0
                && dot(normal, prevSurface.xyz) > kReprojectNormalCos
                && abs(depth - prevSurface.w) / max(depth, 1e-3) < kReprojectDepthTol)
            {
                history  = imageLoad(HistoryImage, prevPx);
                count    = history.a;
                moments  = imageLoad(MomentImage, prevPx).xy;   // the moments follow the same reprojection
                resolved = true;
            }
            // Failing validation is a real disocclusion: leave count at 0 so the mean restarts at n = 1 rather
            //    than smearing the surface that used to be behind this pixel.
            else resolved = true;
        }
        else resolved = true;   // back-projected off screen — also a disocclusion
    }

    if (FrameIndex > 0u && !resolved)
    {
        // Either reprojection is disabled, or this pixel has no surface to reproject through (background, direct
        //    emitters). Both read the pixel's own history, which is exactly the pre-R7a behaviour — so with the
        //    feature bit clear this function is byte-identical to the accumulator it replaced.
        history = imageLoad(HistoryImage, ivec2(pixel));
        count   = history.a;
        moments = imageLoad(MomentImage, ivec2(pixel)).xy;
    }

    count      = count + 1.0;
    vec3 mean  = history.rgb + (radiance - history.rgb) / count;

    // R7: the same incremental mean applied to the first two luminance moments. Variance is E[x²] − E[x]², which is
    //    the noise estimate the à-trous filter divides by; a pixel with many samples reports a small variance and
    //    is therefore barely filtered, which is how the denoiser fades out as the image converges.
    float luma = Luminance(radiance);
    moments   += (vec2(luma, luma * luma) - moments) / count;
    // Clamped at zero: with one sample the estimator is exactly zero and float error can push it slightly negative.
    float sampleVariance = max(moments.y - moments.x * moments.x, 0.0);

    // ⚠️ The image being filtered is the MEAN of n samples, not one sample, so the noise the filter must reason
    //    about is the variance OF THE MEAN — the sample variance divided by n. Handing it the raw sample variance
    //    reports a noise level that never falls as the estimate converges, so the filter stays maximally
    //    permissive forever and keeps blurring an image that no longer needs it.
    float variance = sampleVariance / count;

    // A single sample carries no information about its own spread. Reporting its luminance squared keeps the
    //    filter permissive on brand-new pixels (disocclusions), which is exactly where smoothing is needed most.
    if (count < 2.0) variance = luma * luma;

    imageStore(HistoryImage,     ivec2(pixel), vec4(mean, count));
    imageStore(HistorySurfaceImage, ivec2(pixel), vec4(normal, depth));
    imageStore(MomentImage,      ivec2(pixel), vec4(moments, 0.0, 0.0));

    // With the denoiser on, the filter owns the tone map: it needs LINEAR radiance, and tone mapping before a blur
    //    would average display-space values and darken every gradient. The final à-trous level writes OutputImage.
    imageStore(DenoiseImage, ivec2(pixel), vec4(mean, variance));
    if ((FeatureFlags & kFeatureDenoise) == 0u)
        imageStore(OutputImage, ivec2(pixel), vec4(ToneMap(mean), 1.0));
}

// Background and other surface-less writes: no normal, no depth, never a reprojection source.
void Resolve(uvec2 pixel, vec3 radiance)
{
    ResolveSurface(pixel, radiance, vec3(0.0, 0.0, 1.0), -1.0);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    MAIN COMPUTE KERNEL
//------------------------------------------------------------------------------------------------------------------------

void main()
{
    uvec2 pixel = gl_GlobalInvocationID.xy;
    if (pixel.x >= ViewportWidth || pixel.y >= ViewportHeight) return;

    uint seed = MakeSeed(pixel, FrameIndex);

    //------------------------------------------------------------------------------------------------------------------
    // 1 + 2. Primary visibility — read from the R2 visibility raster instead of tracing. SurfaceResolve intersected the
    //    pixel's camera ray (with the frame's raster jitter) with the rasterised triangle, so hitPos / hitNormal are
    //    what TraceScene used to return, already flipped to face the camera. ⚠️ Deviation from R0: anti-aliasing jitter
    //    is now one Halton offset per FRAME (shared by raster and resolve) instead of one PCG offset per pixel; the
    //    accumulated result converges to the same box-filtered image, only the per-frame noise pattern differs.
    //------------------------------------------------------------------------------------------------------------------
    vec4 surface    = imageLoad(SurfaceImage, ivec2(pixel));
    uint visibility = floatBitsToUint(surface.w);

    // The ray-miss path: the camera ray left the scene, so it sees the sky.
    //
    //    ⚠️ THE MISS CARRIES NO DIRECTION. The visibility raster only records hits, so the ray has to be rebuilt
    //    from the pixel and the camera basis. It must match the raster's own mapping exactly or the sky will be
    //    subtly sheared against the geometry — the horizon would not meet the ground at the same place.
    if (visibility == kVisibilityInvalid)
    {
        // ⚠️ USE THE SHARED MAPPING, NEVER A LOCAL COPY. RayGeneration.slang is the single statement of how a
        //    pixel becomes a world ray, including the Vulkan y-down flip. A hand-rolled copy here would be one
        //    sign error away from a sky that is vertically mirrored against the geometry, and the two would
        //    disagree only on the miss path — the hardest kind of bug to see and the easiest to introduce.
        CameraBasis basis;
        basis.Origin     = CameraOrigin;
        basis.Forward    = CameraForward;
        basis.Right      = CameraRight;
        basis.Up         = CameraUp;
        basis.TanHalfFov = FieldOfViewTanHalf;
        basis.Aspect     = AspectRatio;

        vec3 rayDirection = GeneratePrimaryDirection(basis, pixel, vec2(0.5),
                                                     uvec2(ViewportWidth, ViewportHeight));

        // Discs included: this is what the eye sees directly, so the sun and moon belong in it.
        CelestialRecord skyRecord = Celestial[0];
        vec3 background = CelestialSky(skyRecord, CameraOrigin, rayDirection, true);

        // 🔴 CLOUDS AND FOG, ON THE PRIMARY PATH ONLY. The media march composites IN FRONT of the sky — it
        //    attenuates the sky behind it and adds its own scattered light, which is the same
        //    `L*T + inscatter` composite the aerial perspective uses. One integrator serves the global deck,
        //    local puffs, atmospheric fog and local fog, because they are one category of thing.
        {
            float mediaTransmittance;
            vec3  mediaRadiance = MediaScatter(skyRecord, CameraOrigin, rayDirection,
                                               skyRecord.SunDirectionAndCosRadius.xyz,
                                               skyRecord.SunIrradianceAndScale.xyz * skyRecord.SunTransmittance.xyz,
                                               // ⚠️ THE SKY DOME OVERHEAD, NOT `background`. Passing the sky
                                               //    along the VIEW ray meant a cloud seen from below was being
                                               //    "lit" by the sky it is itself blocking, which is why the
                                               //    undersides rendered black. The zenith is a fair, cheap
                                               //    stand-in for the hemispherical average.
                                               CelestialSky(skyRecord, CameraOrigin, vec3(0.0, 0.0, 1.0), false),
                                               kMediaFarDistance, kMediaViewSteps, mediaTransmittance);
            background = background * mediaTransmittance + mediaRadiance;
        }

        // 🔴 The lens flare, added on the miss path only. Occlusion is 1 here BY DEFINITION: this pixel is a
        //    miss, so nothing is between the camera and the sky along it. Surface pixels get the flare too —
        //    see the surface exit below, where occlusion is 0 because geometry is in the way.
        // ⚠️ The flare is added AFTER the media, and deliberately not attenuated by it. A lens flare forms
        //    inside the camera from light that already arrived, so cloud in the scene cannot dim a reflection
        //    that happens between the glass elements. Occlusion of the SUN ITSELF is handled by the media
        //    transmittance fed in below.
        float sunThroughMedia;
        {
            vec3 ignored = MediaScatter(skyRecord, CameraOrigin, skyRecord.SunDirectionAndCosRadius.xyz,
                                        skyRecord.SunDirectionAndCosRadius.xyz, vec3(0.0), vec3(0.0),
                                        kMediaFarDistance, kMediaOcclusionSteps, sunThroughMedia);
        }
        background += CelestialLensFlare(skyRecord, rayDirection, CameraForward, CameraRight, CameraUp,
                                         skyRecord.SunTransmittance.xyz, sunThroughMedia);

        Resolve(pixel, background);
        return;
    }

    GpuInstance primaryInstance = Instances[VisibilityInstance(visibility)];
    GpuMaterial mat = Materials[primaryInstance.MaterialIndex];

    vec3  hitPos     = surface.xyz;
    vec3  toCamera   = CameraOrigin - hitPos;
    float primaryT   = length(toCamera);
    vec3  viewDir    = toCamera / max(primaryT, 1e-6);
    float coneWidth  = primaryT * PixelSpreadAngle();             // ray-cone footprint at the primary hit [m]

    SurfaceFrame  frame;
    ShadingRecord shading = ResolveMaterial(mat, primaryInstance, VisibilityPrimitive(visibility), hitPos, viewDir, coneWidth, frame);

    // If we directly hit an emitter — return its radiance (slab emission × texture; the header's radiance drives the luminaire table)
    if (dot(frame.Emission, frame.Emission) > 0.0)
    {
        Resolve(pixel, frame.Emission);
        return;
    }

    vec3 hitNormal = frame.Geometric;                             // shadow-ray offsets and the DI target function stay geometric
    vec3 woLocal   = ToLocal(frame, viewDir);
    if (woLocal.z <= 0.0) woLocal = vec3(woLocal.xy, 1e-3);      // grazing normal-mapped case: keep the BSDF defined
    ResolvedLayers layers = ResolveLayers(shading, woLocal);
    vec3 albedo    = shading.BaseColor;                           // debug ambient floor only

    vec3 accumulatedRadiance = vec3(0.0);

    //------------------------------------------------------------------------------------------------------------------
    // 3. ReSTIR direct lighting — initial candidates (+ extra same-pixel passes), R6 temporal merge, R6 row 3
    //    spatiotemporal neighbour taps, shade.
    //------------------------------------------------------------------------------------------------------------------

    // 🔴 F2: the gate is now the TOTAL light count, so an outdoor scene with no emissive triangles still runs
    //    the full reservoir pipeline against the sun. Previously this read `LightTriangleCount > 0u`, which meant
    //    a daylit scene containing no lamps skipped direct lighting entirely and was lit only by the bounce —
    //    the sun would have been present in the pool and still never sampled.
    if (TotalLightCount(Celestial[0]) > 0u)
    {
        // Initial reservoir from M = SamplesPerPixel candidates
        Reservoir res;
        res.SelectedPoint  = vec3(0.0);
        res.WeightSum      = 0.0;
        res.SampleCount    = 0u;
        res.UnbiasedWeight = 0.0;
        res.SelectedLight  = 0u;
        res.SelectedUv     = vec2(0.0);
        res.Visible        = 0u;

        for (uint s = 0u; s < SamplesPerPixel; ++s)
        {
            float  pSource;
            uint   li          = PickLight(seed, pSource);   // R6 row 3: alias (F5) or uniform (identity proof)
            float  u1          = RandFloat(seed);
            float  u2          = RandFloat(seed);
            vec3   lp          = SampleLightPointFrom(li, u1, u2, hitPos);
            vec3   toLight     = lp - hitPos;

            // Get light material
            vec3 lEmissive = LightEmission(li);

            // Target function: full-BSDF unshadowed direct contribution (R6 row 2)
            float pHat = PHatFull(frame, shading, layers, woLocal, lEmissive, toLight, dot(toLight, toLight));
            float w    = pHat / pSource;   // p̂ / p_source — pSource is 1/N uniform or the alias Probability[z]

            ResampleCandidate(res, lp, li, vec2(u1, u2), w, seed);
        }

        // Compute unbiased weight W (R6: the chosen light comes from the reservoir — no nearest-emissive search)
        if (res.WeightSum > 0.0 && res.SampleCount > 0u)
        {
            vec3  toSel    = res.SelectedPoint - hitPos;

            vec3 selEmissive = LightEmission(res.SelectedLight);

            float pHatSel = PHatFull(frame, shading, layers, woLocal, selEmissive, toSel, dot(toSel, toSel));
            if (pHatSel > 0.0)
                res.UnbiasedWeight = res.WeightSum / (float(res.SampleCount) * pHatSel);

            // Extra same-pixel candidates (R6 row 3: renamed from SpatialPassCount): ExtraCandidateCount further light samples
            //    from THIS pixel, resampled with the same target function so the reservoir stays a valid RIS estimate.
            for (uint sp = 0u; sp < ExtraCandidateCount; ++sp)
            {
                float  npSource;
                uint   nli    = PickLight(seed, npSource);   // R6 row 3: same alias/uniform gate as the initial loop
                float  nu1    = RandFloat(seed);
                float  nu2    = RandFloat(seed);
                vec3   nlp    = SampleLightPointFrom(nli, nu1, nu2, hitPos);
                vec3   nToL   = nlp - hitPos;
                vec3   nEmit  = LightEmission(nli);
                float  nPHat  = PHatFull(frame, shading, layers, woLocal, nEmit, nToL, dot(nToL, nToL));
                float  nW     = nPHat / npSource;   // p̂ / p_source, same as the initial loop
                ResampleCandidate(res, nlp, nli, vec2(nu1, nu2), nW, seed);
            }
            // Recompute W for the final selection (the selected point may have changed).
            vec3  emit2  = vec3(0.0);
            {
                vec3  toSel2   = res.SelectedPoint - hitPos;
                emit2          = LightEmission(res.SelectedLight);
                float pHat2 = PHatFull(frame, shading, layers, woLocal, emit2, toSel2, dot(toSel2, toSel2));
                res.UnbiasedWeight = pHat2 > 0.0 ? res.WeightSum / (float(res.SampleCount) * pHat2) : 0.0;
            }

            // R6 row 2: temporal reuse — back-project by the R2 motion vector, validate the previous surface
            //    (25° normal, 10% depth, stride guard), pairwise-MIS merge with M-clamp, then re-trace visibility
            //    at the current pixel (standard ReSTIR — keeps W unbiased after reuse).
            uint resAge = 0u;
            if ((FeatureFlags & kFeatureTemporalReuse) != 0u && FrameIndex > 0u)
            {
                vec2 cuv = (vec2(pixel) + 0.5) / vec2(float(ViewportWidth), float(ViewportHeight));
                vec2 motion = texelFetch(MotionImage, ivec2(pixel), 0).rg;
                vec2 puv = cuv - motion;
                ivec2 prevPx = ivec2(floor(puv * vec2(float(ViewportWidth), float(ViewportHeight))));
                if (all(greaterThanEqual(prevPx, ivec2(0))) && prevPx.x < int(ViewportWidth) && prevPx.y < int(ViewportHeight))
                {
                    GpuReservoir prev = PrevReservoirs[prevPx.y * int(ViewportWidth) + prevPx.x];
                    uint prevM = prev.Counts.x;
                    bool valid = prevM > 0u
                        && prev.Normal.w == float(ViewportWidth)   // stride guard (render-scale change)
                        && dot(hitNormal, prev.Normal.xyz) > kTemporalNormalCos
                        && abs(primaryT - prev.UvDepth.w) / max(primaryT, 1e-3) < kTemporalDepthTol;
                    if (valid)
                    {
                        uint mPrevCapped = min(prevM, kTemporalMClamp * res.SampleCount);
                        vec3 prevEmit = LightEmission(prev.Counts.y);
                        vec3 prevToL  = prev.Sample.xyz - hitPos;
                        float pPrev = PHatFull(frame, shading, layers, woLocal, prevEmit, prevToL, dot(prevToL, prevToL));
                        vec3  curToL  = res.SelectedPoint - hitPos;
                        float pCur  = PHatFull(frame, shading, layers, woLocal, emit2, curToL, dot(curToL, curToL));
                        float wCur  = pCur * res.UnbiasedWeight * float(res.SampleCount);
                        float wPrev = pPrev * prev.UvDepth.z * float(mPrevCapped);
                        float total = wCur + wPrev;
                        if (total > 0.0 && RandFloat(seed) * total <= wPrev)
                        {
                            res.SelectedPoint = prev.Sample.xyz;
                            res.SelectedLight = prev.Counts.y;
                            res.SelectedUv    = prev.UvDepth.xy;
                        }
                        res.SampleCount = res.SampleCount + mPrevCapped;
                        res.WeightSum   = total;
                        resAge = prev.Counts.w + 1u;
                        vec3  finEmit = LightEmission(res.SelectedLight);
                        vec3  finToL  = res.SelectedPoint - hitPos;
                        float pFin = PHatFull(frame, shading, layers, woLocal, finEmit, finToL, dot(finToL, finToL));
                        res.UnbiasedWeight = pFin > 0.0 ? total / (float(res.SampleCount) * pFin) : 0.0;
                    }
                }
            }

            // R6 row 3: spatiotemporal neighbour reuse — K taps read the STABLE prev-frame buffer at neighbouring
            //    pixels of the current frame (same-frame Curr reads would race within the dispatch). Each valid tap
            //    merges by the same pairwise-MIS algebra as temporal: validation, per-tap M-clamp, winner age+1.
            //    Gated on kFeatureSpatialReuse and FrameIndex > 0 (no prev frame on the first accumulation frame).
            if ((FeatureFlags & kFeatureSpatialReuse) != 0u && FrameIndex > 0u)
            {
                // Rotation and radius are drawn from a SEPARATE stream, seeded from the pixel and frame, so the
                //    main `seed` sequence used by resampling is untouched — the R6 identity proofs still hold.
                uint  tapSeed = PcgHash(MakeSeed(pixel, FrameIndex) ^ 0x9E3779B9u);
                float scale   = float(ViewportWidth) / 1280.0;
                float angle   = RandFloat(tapSeed) * 6.28318531;
                // P0: hold the reuse footprint constant in METRES, not in pixels (see the constants' note). A pixel
                //    subtends more world the further the surface is, so the pixel radius is divided by that growth.
                float depthScale = clamp(kSpatialReferenceDepth / max(primaryT, 1e-3),
                                         kSpatialDepthScaleMin, kSpatialDepthScaleMax);
                float radius  = mix(kSpatialRadiusMinPx, kSpatialRadiusMaxPx, RandFloat(tapSeed)) * scale * depthScale;

                for (uint tap = 0u; tap < kSpatialTaps; ++tap)
                {
                    // The cross keeps its 90° spacing — it is still four taps of equal reach, just aimed
                    //    differently each frame, so no direction is systematically favoured over time.
                    float  theta  = angle + float(tap) * 1.57079633;
                    ivec2  offset = ivec2(int(round(radius * cos(theta))), int(round(radius * sin(theta))));
                    if (offset.x == 0 && offset.y == 0) continue;   // a rounded-to-zero tap is the pixel itself
                    ivec2 npx = ivec2(pixel) + offset;
                    if (any(lessThan(npx, ivec2(0))) || npx.x >= int(ViewportWidth) || npx.y >= int(ViewportHeight)) continue;
                    GpuReservoir neigh = PrevReservoirs[npx.y * int(ViewportWidth) + npx.x];
                    uint neighM = neigh.Counts.x;
                    bool nValid = neighM > 0u
                        && neigh.Normal.w == float(ViewportWidth)   // stride guard (render-scale change)
                        && dot(hitNormal, neigh.Normal.xyz) > kTemporalNormalCos
                        && abs(primaryT - neigh.UvDepth.w) / max(primaryT, 1e-3) < kTemporalDepthTol;
                    if (!nValid) continue;
                    uint mNeighCapped = min(neighM, kTemporalMClamp * res.SampleCount);
                    vec3 neighEmit = LightEmission(neigh.Counts.y);
                    vec3 neighToL  = neigh.Sample.xyz - hitPos;
                    float pNeigh = PHatFull(frame, shading, layers, woLocal, neighEmit, neighToL, dot(neighToL, neighToL));
                    vec3  selfToL  = res.SelectedPoint - hitPos;
                    vec3  selfEmit = LightEmission(res.SelectedLight);
                    float pSelf = PHatFull(frame, shading, layers, woLocal, selfEmit, selfToL, dot(selfToL, selfToL));
                    float wSelf  = pSelf * res.UnbiasedWeight * float(res.SampleCount);
                    float wNeigh = pNeigh * neigh.UvDepth.z * float(mNeighCapped);
                    float nTotal = wSelf + wNeigh;
                    uint  takeAge = resAge;
                    if (nTotal > 0.0 && RandFloat(seed) * nTotal <= wNeigh)
                    {
                        res.SelectedPoint = neigh.Sample.xyz;
                        res.SelectedLight = neigh.Counts.y;
                        res.SelectedUv    = neigh.UvDepth.xy;
                        takeAge = neigh.Counts.w + 1u;
                    }
                    res.SampleCount = res.SampleCount + mNeighCapped;
                    res.WeightSum   = nTotal;
                    resAge = takeAge;
                    vec3  mEmit = LightEmission(res.SelectedLight);
                    vec3  mToL  = res.SelectedPoint - hitPos;
                    float pM = PHatFull(frame, shading, layers, woLocal, mEmit, mToL, dot(mToL, mToL));
                    res.UnbiasedWeight = pM > 0.0 ? nTotal / (float(res.SampleCount) * pM) : 0.0;
                }
            }

            // Visibility re-traced at the current pixel; an occluded merged sample contributes nothing.
            res.Visible = TraceShadow(hitPos + hitNormal * kEps, res.SelectedPoint) ? 0u : 1u;
            if (res.Visible == 0u) res.UnbiasedWeight = 0.0;

            // 🔴 CLOUDS BLOCK THE SUN. Geometry can occlude the sun with a shadow ray, but a cloud is not
            //    geometry — it is a medium the ray passes straight through. Without this the ground under an
            //    overcast sky stays in full, hard sunlight while the sky above it is solid cloud, which is the
            //    most obvious way volumetric clouds fail to be lighting rather than decoration.
            //
            //    Applied as a continuous attenuation of the reservoir's weight rather than a binary occlusion,
            //    because a cloud edge shades PARTIALLY — that gradient is what makes cloud shadows drift across
            //    a landscape instead of snapping on and off.
            if (res.Visible == 1u && res.SelectedLight >= LightTriangleCount)
                res.UnbiasedWeight *= MediaSunShadow(Celestial[0], hitPos,
                                                     Celestial[0].SunDirectionAndCosRadius.xyz);

            // Publish the final reservoir for next frame's temporal reuse (always — even occluded, M still counts).
            GpuReservoir outRes;
            outRes.Sample  = vec4(res.SelectedPoint, res.WeightSum);
            outRes.Counts  = uvec4(res.SampleCount, res.SelectedLight, res.Visible, resAge);
            outRes.UvDepth = vec4(res.SelectedUv, res.UnbiasedWeight, primaryT);
            outRes.Normal  = vec4(hitNormal, float(ViewportWidth));
            CurrReservoirs[pixel.y * ViewportWidth + pixel.x] = outRes;

            // Shade (R6: the stored selection carries its light — no search)
            if (res.Visible == 1u)
            {
                vec3 shadeDir = normalize(res.SelectedPoint - hitPos);
                float shadeCos = max(0.0, dot(hitNormal, shadeDir));

                vec3 chosenEmit = LightEmission(res.SelectedLight);

                float dist2 = dot(res.SelectedPoint - hitPos, res.SelectedPoint - hitPos);
                vec3  wiLocal = ToLocal(frame, shadeDir);
                vec3  f = wiLocal.z > 0.0 ? EvaluateBsdf(shading, layers, woLocal, wiLocal) : vec3(0.0);   // R4b: full lobe stack
                accumulatedRadiance += f * chosenEmit * shadeCos * res.UnbiasedWeight / (dist2 + kDistanceEpsilon);
            }
        }
    }

    //------------------------------------------------------------------------------------------------------------------
    // 4. One-bounce indirect (plain path tracing with NEE, no GI reservoir); skipped when the GI feature is off
    //------------------------------------------------------------------------------------------------------------------
    if ((FeatureFlags & kFeatureGlobalIllumination) != 0u)
    {
        // R4b: BSDF-sampled bounce (EON CLTC / VNDF / LTC per lobe). ⚠️ For Cornell (specular_weight 0, r_d 0) the CLTC
        //    sample IS a cosine sample, but one extra random number is drawn for the lobe pick — the converged image is
        //    unchanged, the per-frame noise pattern is not.
        vec4 bounce = SampleBsdf(shading, layers, woLocal, vec3(RandFloat(seed), RandFloat(seed), RandFloat(seed)));
        if (bounce.w > 0.0)
        {
            vec3 bounceDir = FromLocal(frame, bounce.xyz);
            vec3 throughput = EvaluateBsdf(shading, layers, woLocal, bounce.xyz) * bounce.z / bounce.w;   // f · cosθ / pdf
            Ray  bounceRay;
            bounceRay.origin = hitPos + hitNormal * kEps;
            bounceRay.dir    = bounceDir;

            Hit bounceHit = TraceScene(bounceRay);

            // 🔴 A BOUNCE RAY THAT ESCAPES NOW COLLECTS THE SKY. This is the line that makes scene objects
            //    actually RECEIVE the celestial light rather than merely stand in front of a pretty backdrop —
            //    the explicit requirement. Without it a sunlit courtyard renders black-shadowed, because the only
            //    light reaching an upward-facing surface from the open sky would be nothing at all.
            //
            //    Discs are EXCLUDED here. The sun is sampled as an explicit light in the reservoir (P3), so
            //    letting a random bounce also hit the disc would double-count it — and because the disc is tiny
            //    and enormously bright, the rare hit that did occur would arrive as a fireflies-grade spike.
            if (!bounceHit.valid && dot(bounceDir, hitNormal) > 0.0)
            {
                // 🔴 THE CHEAP FORM, AND THIS IS THE ARCHITECTURAL DECISION. This line runs once per bounce
                //    SAMPLE, so a 48-step cloud march here would multiply by the sample count and is
                //    unaffordable. A bounce ray needs to know how much the deck DIMS the sky it is sampling,
                //    not what shape the clouds are, so it gets a closed-form average opacity instead of a
                //    march. Without this the ground stays brightly sky-lit under heavy overcast, which is the
                //    single most obvious way clouds fail to affect a scene.
                vec3  skyRadiance = CelestialSky(Celestial[0], hitPos, bounceDir, false);
                float cloudDimming = MediaAmbientTransmittance(Celestial[0], bounceDir);
                accumulatedRadiance += throughput * skyRadiance * cloudDimming;
            }
            else if (bounceHit.valid && dot(bounceDir, hitNormal) > 0.0)
            {
                GpuMaterial   bMat  = Materials[bounceHit.matIdx];
                // D2: TraceScene already resolved the instance — reuse it rather than repeating the search here.
                GpuInstance   bInstance = Instances[bounceHit.instance];
                SurfaceFrame  bFrame;
                float         bCone = coneWidth + bounceHit.t * PixelSpreadAngle();
                ShadingRecord bShading = ResolveMaterial(bMat, bInstance, LocalPrimitive(bounceHit.primitive, bounceHit.instance), bounceHit.pos, -bounceDir, bCone, bFrame);

                if (dot(bFrame.Emission, bFrame.Emission) > 0.0)
                {
                    accumulatedRadiance += throughput * bFrame.Emission;
                }
                else if (TotalLightCount(Celestial[0]) > 0u)
                {
                    vec3  bHitPos    = bounceHit.pos;
                    vec3  bHitNormal = bFrame.Geometric;
                    vec3  bWo        = ToLocal(bFrame, -bounceDir);
                    if (bWo.z <= 0.0) bWo = vec3(bWo.xy, 1e-3);
                    ResolvedLayers bLayers = ResolveLayers(bShading, bWo);

                    // The secondary bounce is a single unweighted sample rather than a reservoir, so a
                    //    uniform pick over the emissive triangles is the correct estimator here.
                    const uint bLightCount = TotalLightCount(Celestial[0]);
                    uint  bLi  = min(uint(RandFloat(seed) * float(bLightCount)), bLightCount - 1u);
                    vec3  bLp  = SampleLightPointFrom(bLi, RandFloat(seed), RandFloat(seed), bHitPos);
                    vec3  bToL = bLp - bHitPos;
                    float bDist = length(bToL);
                    vec3  bLDir = bToL / bDist;
                    float bCos  = max(0.0, dot(bHitNormal, bLDir));
                    vec3  bWi   = ToLocal(bFrame, bLDir);

                    vec3 bLEmit = LightEmission(bLi);

                    if (bCos > 0.0 && bWi.z > 0.0 && !TraceShadow(bHitPos + bHitNormal * kEps, bLp))
                    {
                        float bDist2 = bDist * bDist;
                        vec3  bF = EvaluateBsdf(bShading, bLayers, bWo, bWi);
                        // ⚠️ Divide by the count the pick above chose from: dividing by a different number
                        //    than you sampled from is a bias that scales the whole second bounce.
                        accumulatedRadiance += throughput * bF * bLEmit * bCos / ((bDist2 + kDistanceEpsilon) * float(bLightCount));
                    }
                }
            }
        }
    }

    //------------------------------------------------------------------------------------------------------------------
    // 5. Ambient floor (debug only — flag kFeatureAmbientFloor; a real GI pass makes it unnecessary) + tone map + write
    //------------------------------------------------------------------------------------------------------------------
    if ((FeatureFlags & kFeatureAmbientFloor) != 0u)
        accumulatedRadiance += albedo * frame.Occlusion * AmbientStrength;

    // 🔴 AERIAL PERSPECTIVE, applied LAST and at the single exit point for surface pixels.
    //
    //    Placed here deliberately: every lighting contribution — direct, reservoir, bounce, emission, ambient —
    //    has already been summed, and haze must attenuate the TOTAL leaving the surface, not one term of it.
    //    Applying it earlier would let later additions arrive unattenuated, so a distant emissive would punch
    //    through kilometres of air at full strength.
    accumulatedRadiance = CelestialAerialPerspective(Celestial[0], CameraOrigin, hitPos, accumulatedRadiance);

    // 🔴 FOG MUST ALSO SIT IN FRONT OF GEOMETRY, OR IT IS NOT FOG. Aerial perspective above handles the thin
    //    air over kilometres; this handles the dense media — a local fog pool the camera is looking through, or
    //    a cloud the camera is inside. The march is bounded by the distance to THIS surface, which is what makes
    //    a fog bank occlude a near object more than a far one correctly rather than hovering in front of both.
    {
        CelestialRecord mediaSky = Celestial[0];
        uint mediaFlags = uint(mediaSky.ExposureAndFlags.w);

        // Only pay for this when a dense medium can actually be between eye and surface. The global deck is
        //    overhead and the aerial perspective already covers the air, so surfaces skip the layer entirely.
        if ((mediaFlags & (kCelestialFlagFog | kCelestialFlagLocalFog | kCelestialFlagLocalCloud)) != 0u)
        {
            vec3  toSurface = hitPos - CameraOrigin;
            float surfaceDistance = length(toSurface);
            if (surfaceDistance > 0.5)
            {
                float mediaTransmittance;
                vec3  mediaRadiance = MediaScatter(mediaSky, CameraOrigin, toSurface / surfaceDistance,
                                                   mediaSky.SunDirectionAndCosRadius.xyz,
                                                   mediaSky.SunIrradianceAndScale.xyz * mediaSky.SunTransmittance.xyz,
                                                   CelestialSky(mediaSky, CameraOrigin, vec3(0.0, 0.0, 1.0), false),
                                                   surfaceDistance, kMediaSurfaceSteps, mediaTransmittance);
                accumulatedRadiance = accumulatedRadiance * mediaTransmittance + mediaRadiance;
            }
        }
    }

    // R7a: the primary hit's geometric normal and camera distance are what the next frame validates its
    //    back-projection against — the same pair R6 row 2 uses to validate reprojected reservoirs.
    ResolveSurface(pixel, accumulatedRadiance, hitNormal, primaryT);
}
