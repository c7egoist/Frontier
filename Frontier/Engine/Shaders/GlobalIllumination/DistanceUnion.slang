//============================================================================================================================================
//                                                          DISTANCEUNION.SLANG
//============================================================================================================================================
// 🧩 Rewrites the scene distance field brick by brick: min over the culled occupant volumes and the analytic course plane.

#pragma once
#include "IntrinsicParity.slang"
#include "HostConstants.slang"

// 📝 This is the ONLY place that walks occupants, and it does so per invalidated 8³ brick, never per ray. A brick is
//    invalidated when the cascade window scrolls over it or when a moving occupant's old or new bounds, grown by the
//    cascade band, overlap it. Everything downstream traverses the assembled field alone.
//
//    The active list (every enabled distance occupant, rebuilt on the host when activity changes) is walked in pages
//    of 64: each lane tests one occupant's bounds, the survivors' volume profiles
//    are staged in workgroup memory, and every lane then folds the page into the eight voxels it owns. A page can
//    never overflow, so a brick under any number of occupants (a dense stress field, say) is still exact, and each
//    surviving profile is read from device memory once per brick instead of once per voxel.

#include "SceneLayouts.slang"
#include "DistanceLayouts.slang"

  [[vk::binding(0, 0)]] ConstantBuffer<DistanceConstants>          Distance;
  [[vk::binding(1, 0)]] StructuredBuffer<int4>      Bricks;
  [[vk::binding(2, 0)]] StructuredBuffer<OccupantProfile>   Occupants;
  [[vk::binding(3, 0)]] Texture3D<float4>                VolumeSpace;
  [[vk::binding(4, 0)]] SamplerState              VolumeSampler;
  [[vk::binding(5, 0)]] [[vk::image_format("rgba16f")]] RWTexture3D<float4>                TargetClip0;
  [[vk::binding(6, 0)]] [[vk::image_format("rgba16f")]] RWTexture3D<float4>                TargetClip1;
  [[vk::binding(7, 0)]] [[vk::image_format("rgba16f")]] RWTexture3D<float4>                TargetClip2;
  [[vk::binding(8, 0)]] [[vk::image_format("rgba16f")]] RWTexture3D<float4>                TargetClip3;
  [[vk::binding(9, 0)]] RWStructuredBuffer<uint> BrickEpochs;
  [[vk::binding(10, 0)]] StructuredBuffer<uint> DistanceList;   // occupant indices; Distance.DistanceOccupantCount long

static const uint PageSize = 64u;   // [-] - occupants tested per page, one per lane

groupshared uint PageCount;
groupshared uint PageIdentity[64];
groupshared float4x4 PageInverse[64];   // WorldToLocal
groupshared float4 PageVolume[64];     // xyz VolumeMinimum [m], w VoxelExtent [m]
groupshared float4 PageTexel[64];     // xyz VolumeTexelOrigin [texel]
groupshared float4 PageExtent[64];     // xyz VolumeTexelExtent [texel]

void WriteClipTexel(uint Level, int3 Texel, float4 Texel4)
{
    switch (Level)
    {
        case 0u:      { TargetClip0[Texel] = Texel4; } break;
        case 1u:      { TargetClip1[Texel] = Texel4; } break;
        case 2u:      { TargetClip2[Texel] = Texel4; } break;
        default:      { TargetClip3[Texel] = Texel4; } break;
    }
}

// 📝 Inside its volume an occupant answers with its transferred distance; outside, with the distance to the volume
//    plus the distance stored at the nearest volume point — the extension the union needs for its band.
float SamplePageDistance(uint Slot, float3 Position, float3 InverseSpace)
{
    let Local = (mul(float4(Position, 1.0), PageInverse[Slot])).xyz;
    let Volume = PageVolume[Slot];
    let Lowest = Volume.xyz + float3(0.5 * Volume.w);
    let Highest = Volume.xyz + (PageExtent[Slot].xyz - float3(0.5)) * Volume.w;
    let Clamped = clamp(Local, Lowest, Highest);
    let Outside = length(Local - Clamped);
    let Texel = PageTexel[Slot].xyz + (Clamped - Volume.xyz) / Volume.w;
    return VolumeSpace.SampleLevel(VolumeSampler, Texel * InverseSpace, 0.0).x + Outside;
}

 
[shader("compute")]
[numthreads(64, 1, 1)]
void UniteDistance(uint3 Group : SV_GroupID, uint Lane : SV_GroupIndex)
{
    let BrickIndex = Group.x + Group.y * 65535u;
    if (BrickIndex >= Distance.BrickCount)
    {
        return;
    }

    let Brick = Bricks[BrickIndex];
    let Level = ToUnsigned(Brick.w) & 0xFFu;
    let OccupantCaused = ((ToUnsigned(Brick.w) >> 8u) & 2u) != 0u;
    let Clip = Distance.Clips[Level];
    let BrickMinimum = float3(Brick.xyz * ToSigned(BrickEdge)) * Clip.VoxelExtent;
    let BrickMaximum = BrickMinimum + float3(float(BrickEdge) * Clip.VoxelExtent);
    let InverseSpace = 1.0 / float3(TextureExtent(VolumeSpace));

    // ① each lane owns a 2×2×2 sub-cube of the brick, seeded with the analytic course plane
    let LaneVoxel = uint3(Lane & 3u, (Lane >> 2u) & 3u, Lane >> 4u) * 2u;
    var Nearest : float[8] = {};
    var Identity : uint[8] = {};
    for (var Sub = 0u; Sub < 8u; Sub++)
    {
        let WorldVoxel = Brick.xyz * ToSigned(BrickEdge) + int3(LaneVoxel + uint3(Sub & 1u, (Sub >> 1u) & 1u, Sub >> 2u));
        Nearest[Sub]  = (float(WorldVoxel.z) + 0.5) * Clip.VoxelExtent - Distance.GroundHeight;
        Identity[Sub] = GroundIdentity;
    }

    // ② pages: cull 64 occupants against the brick grown by the band, step the survivors, fold them in
    for (var Page = 0u; Page < Distance.DistanceOccupantCount; Page += PageSize)
    {
        if (Lane == 0u)
        {
            InterlockedExchange(PageCount, 0u, AtomicDiscard);
        }
        GroupMemoryBarrierWithGroupSync();
        if (Page + Lane < Distance.DistanceOccupantCount)
        {
            let Index = DistanceList[Page + Lane];
            let Minimum = Occupants[Index].WorldMinimum;
            let Maximum = Occupants[Index].WorldMaximum;
            if (all(Maximum + float3(Clip.Band) >= BrickMinimum) && all(Minimum - float3(Clip.Band) <= BrickMaximum))
            {
                uint Slot; InterlockedAdd(PageCount, 1u, Slot);
                PageIdentity[Slot] = Index;
                PageInverse[Slot]  = Occupants[Index].WorldToLocal;
                PageVolume[Slot]   = float4(Occupants[Index].VolumeMinimum, Occupants[Index].VoxelExtent);
                PageTexel[Slot]    = float4(Occupants[Index].VolumeTexelOrigin, 0.0);
                PageExtent[Slot]   = float4(Occupants[Index].VolumeTexelExtent, 0.0);
            }
        }
        GroupMemoryBarrierWithGroupSync();
        let Count = PageCount;
        for (var Slot = 0u; Slot < Count; Slot++)
        {
            for (var Sub = 0u; Sub < 8u; Sub++)
            {
                let WorldVoxel = Brick.xyz * ToSigned(BrickEdge) + int3(LaneVoxel + uint3(Sub & 1u, (Sub >> 1u) & 1u, Sub >> 2u));
                let Sampled = SamplePageDistance(Slot, (float3(WorldVoxel) + 0.5) * Clip.VoxelExtent, InverseSpace);
                if (Sampled < Nearest[Sub])
                {
                    Nearest[Sub]  = Sampled;
                    Identity[Sub] = PageIdentity[Slot];
                }
            }
        }
        GroupMemoryBarrierWithGroupSync();
    }

    // ③ write the brick into its toroidal texels and stamp its epoch
    let Resolution = ToSigned(Clip.Resolution);
    for (var Sub = 0u; Sub < 8u; Sub++)
    {
        let WorldVoxel = Brick.xyz * ToSigned(BrickEdge) + int3(LaneVoxel + uint3(Sub & 1u, (Sub >> 1u) & 1u, Sub >> 2u));
        let Texel = ((WorldVoxel % int3(Resolution)) + int3(Resolution)) % int3(Resolution);
        WriteClipTexel(Level, Texel, float4(clamp(Nearest[Sub], -Clip.Band, Clip.Band), float(Identity[Sub]), 0.0, 1.0));
    }
    if (Lane == 0u)
    {
        BrickEpochs[ResolveBrickSlot(Level, Brick.xyz, Distance.BricksPerAxis)] = ConstructBrickEpoch(Distance.RefreshIndex, OccupantCaused);
    }
}
