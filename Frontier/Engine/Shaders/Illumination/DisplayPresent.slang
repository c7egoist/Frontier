//============================================================================================================================================
//                                                          DISPLAYPRESENT.SLANG
//============================================================================================================================================
// 🧩 Exposure, ACES tonal projection and the distance-slice inset, written to the swapchain through an sRGB view.

#pragma once
#include "IntrinsicParity.slang"
#include "HostConstants.slang"

// 📝 The inset is a top-down slice of the ONE scene distance field at SliceHeight, centred on the cascade focus and
//    spanning cascade 1: blue inside, amber outside with 0.25 m isolines, the cascade-0 window outlined, bricks a
//    moving occupant rewrote glowing magenta and bricks the scrolling window rewrote flashing teal. Driving the
//    ControlVehicle shows the union dispatch chasing it: only the bricks its old and new bounds touch light up.

#include "RefreshDescriptor.slang"
#include "DistanceMarch.slang"
  [[vk::binding(3, 0)]] Texture2D<float4> FlareVisibility;
  [[vk::binding(4, 0)]] Texture2D<float4> FlareImage;
  [[vk::binding(5, 0)]] SamplerState FlareSampler;

  [[vk::binding(1, 0)]] Texture2D<float4>                ResolvedRadiance;
  [[vk::binding(2, 0)]] StructuredBuffer<float>       Adaptation;   // fixed [4] span

#include "CloudPresent.slang"

struct PresentVarying
{
    float4 Position : SV_Position; 
};


[shader("vertex")]
PresentVarying PresentVertex(uint Vertex : SV_VulkanVertexID)
{
    let Corner = float2(float((Vertex << 1u) & 2u), float(Vertex & 2u));
    var Varying : PresentVarying = {};
    Varying.Position = float4(Corner * 2.0 - 1.0, 0.0, 1.0);
    return Varying;
}

// 📐 Narkowicz's ACES filmic fit.
float3 ProjectFilmic(float3 Radiance)
{
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((Radiance * (a * Radiance + b)) / (Radiance * (c * Radiance + d) + e), float3(0.0), float3(1.0));
}

float3 ResolveInsetColour(float2 Coordinates)
{
    let Window = Distance.Clips[min(1u, Distance.ClipCount - 1u)];
    let Span = float(Window.Resolution) * Window.VoxelExtent;
    let Planar = Refresh.FocusPosition.xy + float2(Coordinates.x - 0.5, 0.5 - Coordinates.y) * Span;
    let Position = float3(Planar, Refresh.SliceHeight);
    let Level = ResolveFinestClip(Position, 1.0);
    if (Level >= Distance.ClipCount)
    {
        return float3(0.05);
    }
    let Signed = SampleClipDistance(Level, Position);
    var Colour = SelectBranch(float3(0.95, 0.62, 0.22), float3(0.18, 0.42, 0.95), Signed < 0.0);
    Colour *= 0.35 + 0.65 * exp(-abs(Signed) * 0.9);
    let Isoline = abs(frac(Signed / 0.25 + 0.5) - 0.5);
    Colour = lerp(Colour * 0.55, Colour, smoothstep(0.0, 0.06, Isoline));
    if (abs(Signed) < 0.5 * Distance.Clips[Level].VoxelExtent)
    {
        Colour = float3(1.0);
    }
    let Voxel = int3(floor(Position / Distance.Clips[Level].VoxelExtent));
    let Brick = int3(floor(float3(Voxel) / float(BrickEdge)));
    let Age = ResolveBrickAge(BrickEpochs[ResolveBrickSlot(Level, Brick, Distance.BricksPerAxis)], Refresh.RefreshIndex);
    if (Age.y > 0.5 && Age.x < 24.0)
    {
        Colour = lerp(Colour, float3(1.0, 0.1, 0.85), 0.6 * (1.0 - Age.x / 24.0));
    }
    else if (Age.x < 6.0)
    {
        Colour = lerp(Colour, float3(0.2, 0.85, 0.9), 0.35 * (1.0 - Age.x / 6.0));
    }
    let Finest = Distance.Clips[0];
    let FinestLow = float2(Finest.OriginVoxel.xy) * Finest.VoxelExtent;
    let FinestHigh = FinestLow + float2(float(Finest.Resolution) * Finest.VoxelExtent);
    let EdgeLow = abs(Planar - FinestLow);
    let EdgeHigh = abs(Planar - FinestHigh);
    let Thickness = Span / 256.0;
    let InsideX = Planar.x >= FinestLow.x && Planar.x <= FinestHigh.x;
    let InsideY = Planar.y >= FinestLow.y && Planar.y <= FinestHigh.y;
    if ((InsideY && (EdgeLow.x < Thickness || EdgeHigh.x < Thickness)) || (InsideX && (EdgeLow.y < Thickness || EdgeHigh.y < Thickness)))
    {
        Colour = float3(0.3, 1.0, 0.45);
    }
    return Colour;
}


[shader("fragment")]
float4 PresentFragment(PresentVarying Varying) : SV_Target0
{
    let Pixel = int2(Varying.Position.xy);
    var Radiance = AddClouds(Varying.Position.xy,LoadTexel(ResolvedRadiance, Pixel, 0).rgb);
    Radiance=AddLightning(Varying.Position.xy,Radiance);
    if (Refresh.Flare.x>0.0 && Refresh.InspectionMode==0u){
        let Visibility = LoadTexel(FlareVisibility, int2(0), 0).r;
        if (Visibility>0.0){Radiance+=FlareImage.SampleLevel(FlareSampler, Varying.Position.xy*Refresh.InverseScreenExtent, 0.0).rgb*Visibility;}
    }
    var Exposure = Adaptation[0];
    if (Exposure <= 0.0)
    {
        Exposure = 1.0;
    }
    var Colour = ProjectFilmic(Radiance * Exposure);
    if (Refresh.InspectionMode == 6u || Refresh.InspectionMode == 8u || Refresh.InspectionMode == 9u || Refresh.InspectionMode >= 10u)
    {
        Colour = clamp(Radiance, float3(0.0), float3(1.0));
    }
    if ((Refresh.InsetEnabled & 1u) != 0u)
    {
        let Size = floor(Refresh.ScreenExtent.y * 0.34);
        let Origin = float2(Refresh.ScreenExtent.x - Size - 16.0, 16.0);
        let Local = (Varying.Position.xy - Origin) / Size;
        if (all(Local >= float2(0.0)) && all(Local <= float2(1.0)))
        {
            Colour = ResolveInsetColour(Local);
            let Border = min(min(Local.x, 1.0 - Local.x), min(Local.y, 1.0 - Local.y)) * Size;
            if (Border < 1.5)
            {
                Colour = float3(0.9);
            }
        }
    }
    return float4(Colour, 1.0);
}
