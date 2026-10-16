//============================================================================================================================================
//                                                              GHOSTRASTER.WGSL
//============================================================================================================================================
// 🧩 A see-through vehicle view for the HMI Garage: translucent cyan fill, animated scan band and rasterised triangle edges.
//
//    Ghost and wireframe modes remove the car from the opaque surface projection. This pass draws its same live facets over
//    the resolved scene with the world depth still active, so the ground and props remain visible through the body while
//    nearby world geometry continues to occlude it. The barycentric edge mask is a portable WebGPU wireframe (no polygon
//    line mode); the same tyre, steering-wheel, cockpit and derez transforms are used as the normal vehicle pass.

//! include "FrameDescriptor.wgsl"
//! include "EffectRecords.wgsl"
//! include "TyreCarcass.wgsl"

@group(0) @binding(1) var<storage, read> Occupants : array<OccupantRecord>;
@group(0) @binding(2) var<uniform> Effect : EffectRecord;
@group(0) @binding(3) var<storage, read> VehicleState : VehicleRecord;

const GhostVehicleOccupantCount : u32 = 5u;

struct GhostVarying
{
    @builtin(position) Position            : vec4f,
    @location(0) Normal                    : vec3f,
    @location(1) @interpolate(flat) Family : u32,
    @location(2) BodyLocal                 : vec3f,
    @location(3) WorldPosition              : vec3f,
    @location(4) Barycentric                : vec3f,
    @location(5) @interpolate(flat) Vehicle : u32,
}

fn DeformGhostVehicle(Index: u32, Family: u32, Position: vec3f, Normal: vec3f) -> DeformedVertex
{
    var Moved: DeformedVertex;
    Moved.Position = Position;
    Moved.Normal = Normal;
    if (Index >= 1u && Index < GhostVehicleOccupantCount)
    {
        return DeformTyre(Index - 1u, Position, Normal);
    }
    if (Index == 0u)
    {
        return DeformBodyVertex(Family, Position, Normal);
    }
    return Moved;
}

@vertex
fn GhostVertex(@location(0) Position: vec3f, @location(1) Family: u32, @location(2) Normal: vec3f,
               @location(3) OccupantOffset: u32, @builtin(instance_index) OccupantIndex: u32,
               @builtin(vertex_index) VertexIndex: u32) -> GhostVarying
{
    let Index = OccupantIndex + OccupantOffset;
    let Occupant = Occupants[Index];
    let Moved = DeformGhostVehicle(Index, Family, Position, Normal);
    let World = Occupant.LocalToWorld * vec4f(Moved.Position, 1.0);
    var Barycentric = vec3f(0.0);
    let Corner = VertexIndex % 3u;
    if (Corner == 0u) { Barycentric.x = 1.0; }
    else if (Corner == 1u) { Barycentric.y = 1.0; }
    else { Barycentric.z = 1.0; }

    var Varying: GhostVarying;
    Varying.Position = Frame.ViewProjection * World;
    Varying.Normal = (Occupant.LocalToWorld * vec4f(Moved.Normal, 0.0)).xyz;
    Varying.Family = select(Family, Occupant.MaterialOverride, Occupant.MaterialOverride != NoMaterialOverride);
    Varying.BodyLocal = (Occupants[0].WorldToLocal * World).xyz;
    Varying.WorldPosition = World.xyz;
    Varying.Barycentric = Barycentric;
    Varying.Vehicle = select(0u, 1u, Index < GhostVehicleOccupantCount);
    return Varying;
}

fn IsVehicleCellGone(BodyLocal: vec3f) -> bool
{
    if (Effect.MaskMode == 0u)
    {
        return false;
    }
    if (Effect.MaskMode == 3u)
    {
        return true;
    }
    let Unit = (BodyLocal - Effect.BodyMinimum.xyz) / max(Effect.BodyMaximum.xyz - Effect.BodyMinimum.xyz, vec3f(1.0e-3));
    let Elapsed = Effect.Clock - Effect.MaskStart;
    let Seed = u32(Effect.Emitters[0].Centre.w);
    if (Effect.MaskMode == 1u)
    {
        return Elapsed >= ResolveDerezRelease(Unit, Seed, Effect.Style, 1.0);
    }
    return Elapsed < ResolveRezArrival(Unit, Seed, Effect.Style, 1.0);
}

@fragment
fn GhostFragment(Varying: GhostVarying) -> @location(0) vec4f
{
    let Width = max(fwidth(Varying.Barycentric), vec3f(1.0e-5));
    let Mode = u32(VehicleState.Cabin.w + 0.5);
    if (Varying.Vehicle == 0u || Mode == 0u || IsVehicleCellGone(Varying.BodyLocal))
    {
        discard;
    }

    let EdgeDistance = min(min(Varying.Barycentric.x / Width.x, Varying.Barycentric.y / Width.y), Varying.Barycentric.z / Width.z);
    let Wire = 1.0 - smoothstep(0.8, 1.8, EdgeDistance);
    let ViewDirection = normalize(Frame.CameraPosition - Varying.WorldPosition);
    let Normal = normalize(Varying.Normal);
    let Fresnel = pow(1.0 - abs(dot(Normal, ViewDirection)), 1.8);
    let ScanFront = -3.2 + fract(Frame.ElapsedSeconds * 0.18) * 6.4;
    let Scan = exp(-pow((Varying.BodyLocal.x - ScanFront) * 2.4, 2.0));
    let Cyan = vec3f(0.19, 0.78, 1.0);

    var Alpha = 0.0;
    var Colour = Cyan;
    if (Mode == 2u)
    {
        Alpha = Wire * 0.92;
        if (Alpha < 0.025)
        {
            discard;
        }
        Colour = mix(vec3f(0.08, 0.43, 0.68), vec3f(0.46, 0.94, 1.0), max(Wire, Scan));
    }
    else
    {
        Alpha = clamp(0.08 + Fresnel * 0.18 + Wire * 0.48 + Scan * 0.18, 0.0, 0.82);
        Colour = mix(vec3f(0.035, 0.17, 0.24), Cyan, 0.36 + 0.64 * Scan);
        Colour = mix(Colour, vec3f(0.62, 0.98, 1.0), Wire * 0.78);
    }
    return vec4f(Colour, Alpha);
}
