//============================================================================================================================================
// 📦 Engine/Shaders/DistanceFieldGIResolve.slang — Distance Field Global Illumination resolve compute shader
//============================================================================================================================================
// Resolves screen-space pixels using Distance Field ray marching, Global Distance Field acceleration,
//    Surface Cache radiance sampling, Distance Field Soft Shadows, and ReSTIR GI spatiotemporal resampling.

#version 460
#extension GL_GOOGLE_include_directive : require

layout(local_size_x = 16, local_size_y = 16, local_size_z = 1) in;

#include "DistanceFieldRecords.slang"
#include "GlobalDistanceField.slang"
#include "SurfaceCacheRecords.slang"

//------------------------------------------------------------------------------------------------------------------------
//                                                    IMAGES & BUFFERS
//------------------------------------------------------------------------------------------------------------------------

layout(rgba8,   binding = 0) uniform writeonly image2D OutputImage;
layout(rgba32f, binding = 1) uniform readonly  image2D SurfacePositionImage;
layout(rgba16f, binding = 2) uniform readonly  image2D SurfaceNormalImage;

// ReSTIR GI Reservoir structure (std430)
struct GpuReservoir
{
    vec4 RadianceAndWeight;             // xyz = radiance, w = unbiased weight W
    vec4 DirectionAndM;                 // xyz = direction, w = sample count M
};

layout(std430, set = 0, binding = 3) buffer CurrentReservoirBlock  { GpuReservoir CurrentReservoirs[]; };
layout(std430, set = 0, binding = 4) buffer HistoryReservoirBlock  { GpuReservoir HistoryReservoirs[]; };

layout(push_constant) uniform ResolveParameters
{
    vec4 SunDirectionAndAngle;          // xyz = sun direction, w = light angular size [rad]
    vec4 SunRadianceAndAmbient;         // xyz = sun radiance, w = ambient intensity
    uvec4 ResolutionAndSettings;        // xy = width/height, z = mode (0=GI, 1=Indirect, 2=Shadow), w = restir enabled
};

void main()
{
    ivec2 Pixel = ivec2(gl_GlobalInvocationID.xy);
    if (Pixel.x >= int(ResolutionAndSettings.x) || Pixel.y >= int(ResolutionAndSettings.y)) return;

    vec4 PosSample = imageLoad(SurfacePositionImage, Pixel);
    vec4 NormSample = imageLoad(SurfaceNormalImage, Pixel);

    vec3 WorldPos = PosSample.xyz;
    vec3 WorldNormal = NormSample.xyz;

    // Distance field soft shadow toward sun
    vec3 ShadowOrigin = WorldPos + WorldNormal * 0.015;
    float SoftShadow = MarchDistanceFieldSoftShadow(GlobalDistanceFieldSampler,
                                                   ShadowOrigin,
                                                   SunDirectionAndAngle.xyz,
                                                   DistanceFieldBoundMin.xyz,
                                                   DistanceFieldBoundMax.xyz,
                                                   0.02,
                                                   5.0,
                                                   SunDirectionAndAngle.w,
                                                   DistanceFieldGridDimensions.w / 3u);

    float NDotL = max(0.0, dot(WorldNormal, SunDirectionAndAngle.xyz));
    vec3 DirectSun = SunRadianceAndAmbient.xyz * (NDotL * SoftShadow);

    // Indirect GI sample from surface cache & reservoir
    uint PixelIdx = uint(Pixel.y) * ResolutionAndSettings.x + uint(Pixel.x);
    GpuReservoir Res = CurrentReservoirs[PixelIdx];
    vec3 IndirectRadiance = Res.RadianceAndWeight.xyz * Res.RadianceAndWeight.w;

    vec3 BaseAlbedo = (WorldPos.z > 0.015) ? vec3(0.88, 0.38, 0.16) : vec3(0.45, 0.45, 0.45);
    vec3 Composite = vec3(0.0);

    if (ResolutionAndSettings.z == 0u)
    {
        // Full GI
        Composite = (DirectSun + IndirectRadiance + vec3(SunRadianceAndAmbient.w)) * BaseAlbedo;
    }
    else if (ResolutionAndSettings.z == 1u)
    {
        // Indirect GI only
        Composite = IndirectRadiance * BaseAlbedo * 2.0;
    }
    else if (ResolutionAndSettings.z == 2u)
    {
        // Soft shadows only
        Composite = vec3(SoftShadow);
    }
    else
    {
        // Surface cache direct view
        Composite = SampleSurfaceCacheFromNormal(WorldNormal);
    }

    // Tone map to sRGB
    vec3 Mapped = (Composite * (2.51 * Composite + 0.03)) / (Composite * (2.43 * Composite + 0.59) + 0.14);
    vec3 Srgb = pow(clamp(Mapped, 0.0, 1.0), vec3(1.0 / 2.2));

    imageStore(OutputImage, Pixel, vec4(Srgb, 1.0));
}
