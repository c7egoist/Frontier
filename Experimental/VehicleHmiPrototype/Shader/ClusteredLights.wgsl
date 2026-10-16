//============================================================================================================================================
//                                                         CLUSTEREDLIGHTS.WGSL
//============================================================================================================================================
// 🧩 Every light of the frame, found through a world-space cluster grid: the lookup, the photometry of point, spot (IES) and
//    rectangular lights, and the falloff. Visibility is the caller's business (ClusterVisibility.wgsl), so this file is also
//    usable by the forward passes, which have no distance field.

// 📝 Group 2 in every program that uses the lights (group 1 is empty where the program has no distance field). The records are
//    written by ClusteredLightStore.js; the layouts of both are kept in step there.

struct ClusteredLight
{
    PositionReach : vec4f,   // [m] xyz position, w reach: beyond it the light is zero
    ForwardType   : vec4f,   // [-] xyz unit forward (the beam axis, a rectangle's normal), w type: 0 point, 1 spot, 2 rectangle
    UpProfile     : vec4f,   // [-] xyz unit up, orthogonal to forward; w IES profile index, negative when there is none
    ColourFlags   : vec4f,   // [lx·k] rgb linear colour × intensity (a rectangle: radiance); w flags, bit 0 casts shadow
    HalfSize      : vec4f,   // [m] xy half extents of a rectangle
}

struct ClusterGridRecord
{
    Minimum    : vec4f,   // [m] xyz corner of cell (0,0,0)
    CellSize   : vec4f,   // [m] xyz cell edge
    Dimensions : vec4u,   // [-] xyz cells per axis, w lights this frame
}

@group(2) @binding(0) var<storage, read> ClusterLights   : array<ClusteredLight>;
@group(2) @binding(1) var<storage, read> ClusterCells    : array<vec2u>;   // per cell: first entry, entry count
@group(2) @binding(2) var<storage, read> ClusterEntries  : array<u32>;      // light indices, cell by cell
@group(2) @binding(3) var<storage, read> IesProfiles     : array<f32>;     // one 91 × 91 grid per profile, (v, h) row-major
@group(2) @binding(4) var<uniform> ClusterGrid           : ClusterGridRecord;

const IesSamples       : u32 = 91u;
const IesTexels        : u32 = 8281u;      // 91 × 91
const IesStepDegrees   : f32 = 2.0;
const LightFlagShadow  : u32 = 1u;
const LightMinimumDistance2 : f32 = 0.09; // [m²] a point or spot's inverse-square is clamped inside 30 cm

// 📝 What a light delivers to one point: its unit direction towards the light, the illuminance at normal incidence (before the
//    cosine and the surface's reflectance), the reach (for the shadow ray), and whether the light casts shadows.
struct LightSample
{
    Direction   : vec3f,
    Illuminance : vec3f,
    Range       : f32,
    Shadowed    : bool,
}

// 📝 The cluster cell's (first, count) of entries for a position; (0, 0) outside the grid.
fn ResolveClusterRange(Position: vec3f) -> vec2u
{
    let Local = (Position - ClusterGrid.Minimum.xyz) / ClusterGrid.CellSize.xyz;
    let Cell = vec3i(floor(Local));
    let Dimensions = vec3i(ClusterGrid.Dimensions.xyz);
    if (any(Cell < vec3i(0)) || any(Cell >= Dimensions))
    {
        return vec2u(0u, 0u);
    }
    let Index = u32(Cell.x) + u32(Dimensions.x) * (u32(Cell.y) + u32(Dimensions.y) * u32(Cell.z));
    return ClusterCells[Index];
}

// 📐 Bilinear lookup of an IES profile at a horizontal and a vertical angle (degrees, the light's frame). Zero outside ±90°.
fn SampleIesProfile(Profile: u32, Horizontal: f32, Vertical: f32) -> f32
{
    let U = (Horizontal + 90.0) / IesStepDegrees;
    let V = (Vertical + 90.0) / IesStepDegrees;
    let Last = f32(IesSamples - 1u);
    if (U < 0.0 || V < 0.0 || U > Last || V > Last)
    {
        return 0.0;
    }
    let U0 = min(u32(floor(U)), IesSamples - 2u);
    let V0 = min(u32(floor(V)), IesSamples - 2u);
    let Fu = U - f32(U0);
    let Fv = V - f32(V0);
    let Base = Profile * IesTexels + V0 * IesSamples + U0;
    let Top = mix(IesProfiles[Base], IesProfiles[Base + 1u], Fu);
    let Bottom = mix(IesProfiles[Base + IesSamples], IesProfiles[Base + IesSamples + 1u], Fu);
    return mix(Top, Bottom, Fv);
}

// 📝 One light at one point. Point and spot lights are inverse-square with the IES pattern (if any) along their beam; a
//    rectangle is a Lambertian area light, represented by the point of its face nearest the surface, which is the standard
//    approximation for LED strips and panels. The window carries each light smoothly to zero at its reach.
fn ResolveLightSample(Index: u32, Position: vec3f, Normal: vec3f) -> LightSample
{
    var Sample: LightSample;
    Sample.Direction = vec3f(0.0, 0.0, 1.0);
    Sample.Illuminance = vec3f(0.0);
    Sample.Range = 0.0;
    Sample.Shadowed = false;
    let Light = ClusterLights[Index];
    let Reach = Light.PositionReach.w;
    let Type = u32(Light.ForwardType.w + 0.5);
    let Forward = Light.ForwardType.xyz;
    let Up = Light.UpProfile.xyz;
    let Right = cross(Forward, Up);
    let Colour = Light.ColourFlags.rgb;
    if (Reach <= 0.0 || all(Colour <= vec3f(0.0)))
    {
        return Sample;
    }
    var Toward = Light.PositionReach.xyz - Position;
    if (Type == 2u)
    {
        let Offset = Position - Light.PositionReach.xyz;
        let Clamped = vec2f(clamp(dot(Offset, Right), -Light.HalfSize.x, Light.HalfSize.x),
                            clamp(dot(Offset, Up), -Light.HalfSize.y, Light.HalfSize.y));
        Toward = Light.PositionReach.xyz + Right * Clamped.x + Up * Clamped.y - Position;
    }
    let Squared = dot(Toward, Toward);
    if (Squared >= Reach * Reach)
    {
        return Sample;
    }
    let Range = sqrt(Squared);
    let Direction = Toward / max(Range, 1.0e-4);
    if (dot(Normal, Direction) <= 0.0)
    {
        return Sample;
    }
    let Ratio = Squared / (Reach * Reach);
    let Window = (1.0 - Ratio) * (1.0 - Ratio);
    var Illuminance = vec3f(0.0);
    if (Type == 2u)
    {
        // 📐 Lambert's emitter: radiance × area × cos(emitter) / r².
        let Cosine = max(dot(-Direction, Forward), 0.0);
        let Area = 4.0 * Light.HalfSize.x * Light.HalfSize.y;
        Illuminance = Colour * Area * Cosine / max(Squared, LightMinimumDistance2);
    }
    else
    {
        var Pattern = 1.0;
        let Along = dot(-Direction, Forward);
        if (Type == 1u && Along <= 0.0)
        {
            return Sample;
        }
        let Profile = Light.UpProfile.w;
        if (Profile >= 0.0)
        {
            let Horizontal = degrees(atan2(dot(-Direction, Right), Along));
            let Vertical = degrees(atan2(dot(-Direction, Up), Along));
            Pattern = SampleIesProfile(u32(Profile + 0.5), Horizontal, Vertical);
        }
        Illuminance = Colour * Pattern / max(Squared, LightMinimumDistance2);
    }
    Sample.Direction = Direction;
    Sample.Illuminance = Illuminance * Window;
    Sample.Range = Range;
    Sample.Shadowed = (u32(Light.ColourFlags.w + 0.5) & LightFlagShadow) != 0u;
    return Sample;
}
