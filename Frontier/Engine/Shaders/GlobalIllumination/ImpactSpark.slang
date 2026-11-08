//============================================================================================================================================
//                                                            IMPACTSPARK.SLANG
//============================================================================================================================================
// 🧩 Jolt's debounced chassis-to-metal/concrete contact events become short-lived, emissive spark sprites in the GI presentation pass.

#pragma once
#include "IntrinsicParity.slang"
#include "RefreshDescriptor.slang"
#include "ImpactSparkLayouts.slang"

  [[vk::binding(1, 0)]] ConstantBuffer<ImpactSparkProfile> Impact;

struct ImpactSparkVarying
{
    float4 Position : SV_Position;
    [[vk::location(0)]] float2 Local : LOCATION0;
    [[vk::location(1)]] nointerpolation uint SparkIndex : LOCATION1;
    [[vk::location(2)]] float2 Axis : LOCATION2;
};

float2 ImpactSparkCorner(uint Vertex)
{
    if (Vertex == 0u) return float2(-1.0, -1.0);
    if (Vertex == 1u) return float2( 1.0, -1.0);
    if (Vertex == 2u) return float2( 1.0,  1.0);
    if (Vertex == 3u) return float2(-1.0, -1.0);
    if (Vertex == 4u) return float2( 1.0,  1.0);
    return float2(-1.0,  1.0);
}

float2 ImpactSparkScreen(float4 Clip)
{
    let Ndc = Clip.xy / Clip.w;
    return float2(Ndc.x * 0.5 + 0.5, 0.5 - Ndc.y * 0.5) * Refresh.ScreenExtent;
}

[shader("vertex")]
ImpactSparkVarying ImpactSparkVertex(uint Vertex : SV_VulkanVertexID, uint Instance : SV_VulkanInstanceID)
{
    var Varying : ImpactSparkVarying = {};
    Varying.SparkIndex = Instance;
    Varying.Local = ImpactSparkCorner(Vertex);
    Varying.Axis = float2(1.0, 0.0);
    if (Instance >= min(Impact.Header.x, ImpactSparkCapacity))
    {
        Varying.Position = float4(2.0, 2.0, 0.0, 1.0);
        return Varying;
    }

    let Spark = Impact.Sparks[Instance];
    let Point = Spark.PositionAge.xyz;
    let Clip = mul(float4(Point, 1.0), Refresh.UnjitteredViewProjection);
    let ViewDepth = -(mul(float4(Point, 1.0), Refresh.View)).z;
    if (Clip.w <= 1.0e-4 || ViewDepth <= 0.05 || Spark.PositionAge.w >= 0.75)
    {
        Varying.Position = float4(2.0, 2.0, 0.0, 1.0);
        return Varying;
    }

    let RadiusWorld = clamp(Spark.ColourSize.w, 0.08, 0.8);
    let RadiusPixels = clamp(RadiusWorld * Refresh.ScreenExtent.y / max(ViewDepth, 0.1), 2.0, 42.0);
    let Corner = Varying.Local;
    let PixelOffset = Corner * RadiusPixels;
    Varying.Position = Clip;
    Varying.Position.xy += float2(2.0 * PixelOffset.x * Refresh.InverseScreenExtent.x,
                                  -2.0 * PixelOffset.y * Refresh.InverseScreenExtent.y) * Clip.w;

    let NormalPoint = Point + normalize(Spark.NormalSpeed.xyz) * RadiusWorld;
    let NormalClip = mul(float4(NormalPoint, 1.0), Refresh.UnjitteredViewProjection);
    if (NormalClip.w > 1.0e-4)
    {
        let Axis = ImpactSparkScreen(NormalClip) - ImpactSparkScreen(Clip);
        Varying.Axis = dot(Axis, Axis) > 1.0e-5 ? normalize(Axis) : float2(1.0, 0.0);
    }
    return Varying;
}

[shader("fragment")]
float4 ImpactSparkFragment(ImpactSparkVarying Varying) : SV_Target0
{
    if (Varying.SparkIndex >= min(Impact.Header.x, ImpactSparkCapacity)) discard;
    let Spark = Impact.Sparks[Varying.SparkIndex];
    let Radius = length(Varying.Local);
    if (Radius > 1.0) discard;

    let Age = max(0.0, Spark.PositionAge.w);
    let Fade = saturate((0.75 - Age) / 0.75);
    let Flash = exp(-Age * 11.0);
    let Axis = normalize(Varying.Axis);
    let Perpendicular = float2(-Axis.y, Axis.x);
    let Along = abs(dot(Varying.Local, Axis));
    let Across = abs(dot(Varying.Local, Perpendicular));
    let Needle = exp(-Across * 30.0) * (1.0 - smoothstep(0.05, 1.0, Along));
    let Angle = atan2(Varying.Local.y, Varying.Local.x);
    let Rays = pow(saturate(abs(cos(Angle * 5.0 + float(Varying.SparkIndex) * 1.71))), 28.0) * exp(-Radius * 1.55);
    let Core = exp(-Radius * Radius * 70.0);
    let Halo = exp(-Radius * Radius * 5.5) * 0.16;
    let SpeedGain = clamp((Spark.NormalSpeed.w - 4.5) * 0.16, 0.45, 1.5);
    let Brightness = Fade * SpeedGain * (3.5 * Flash * Core + (0.5 + 1.8 * Flash) * (0.55 * Rays + 0.7 * Needle + Halo));
    return float4(Spark.ColourSize.rgb * Brightness, 0.0);
}
