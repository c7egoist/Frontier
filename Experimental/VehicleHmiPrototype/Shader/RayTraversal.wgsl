//============================================================================================================================================
//                                                           RAYTRAVERSAL.WGSL
//============================================================================================================================================
// 🧩 Exact triangle traversal and physically-based path evaluation for the WebGPU ReSTIR renderer.
//
// This is deliberately not a distance-field or screen-space approximation.  Rays traverse a world-space TLAS, enter
// a per-facet-set SAH BLAS in the instance's local frame, then run watertight-enough two-sided Möller–Trumbore tests.
// The same path evaluator is used for first candidates, temporal radiance refresh, spatial visibility, glossy paths
// and ray-traced direct shadows.

//! include "SceneRecords.wgsl"
//! include "SurfaceReflectance.wgsl"
//! include "SkyProjection.wgsl"
//! include "ClusteredLights.wgsl"
//! include "RaySceneRecords.wgsl"
//! include "DiscrepancySequence.wgsl"

struct RayHit
{
    Position    : vec3f,
    Normal      : vec3f,
    Distance    : f32,
    Material    : u32,
    Occupant    : u32,
    Hit         : bool,
}

fn ConstructRayMiss(Origin: vec3f, Direction: vec3f, MaximumDistance: f32) -> RayHit
{
    var Result: RayHit;
    Result.Position = Origin + Direction * MaximumDistance;
    Result.Normal = -Direction;
    Result.Distance = MaximumDistance;
    Result.Material = 0u;
    Result.Occupant = RaySkyIdentity;
    Result.Hit = false;
    return Result;
}

fn RayInverseDirection(Direction: vec3f) -> vec3f
{
    let Safe = select(vec3f(1.0e-20), Direction, abs(Direction) > vec3f(1.0e-20));
    return 1.0 / Safe;
}

fn RayBoxEntry(Origin: vec3f, InverseDirection: vec3f, Minimum: vec3f, Maximum: vec3f, Limit: f32) -> f32
{
    let Near = (Minimum - Origin) * InverseDirection;
    let Far = (Maximum - Origin) * InverseDirection;
    let Low = min(Near, Far);
    let High = max(Near, Far);
    let Entry = max(max(Low.x, Low.y), max(Low.z, 0.0));
    let Exit = min(min(High.x, High.y), min(High.z, Limit));
    return select(-1.0, Entry, Exit >= Entry && all(Maximum >= Minimum));
}

fn IntersectRayTriangle(Origin: vec3f, Direction: vec3f, Triangle: RayTriangle, MinimumDistance: f32, MaximumDistance: f32) -> f32
{
    let Edge1 = Triangle.B - Triangle.A;
    let Edge2 = Triangle.C - Triangle.A;
    let CrossDirection = cross(Direction, Edge2);
    let Determinant = dot(Edge1, CrossDirection);
    if (abs(Determinant) < 1.0e-8)
    {
        return -1.0;
    }
    let Inverse = 1.0 / Determinant;
    let Offset = Origin - Triangle.A;
    let U = dot(Offset, CrossDirection) * Inverse;
    if (U < 0.0 || U > 1.0)
    {
        return -1.0;
    }
    let CrossOffset = cross(Offset, Edge1);
    let V = dot(Direction, CrossOffset) * Inverse;
    if (V < 0.0 || U + V > 1.0)
    {
        return -1.0;
    }
    let Travel = dot(Edge2, CrossOffset) * Inverse;
    return select(-1.0, Travel, Travel > MinimumDistance && Travel < MaximumDistance);
}

// Traverses a facet-set BLAS after moving the world ray into an instance's local rigid frame.  The fixed stack depth is
// ample for the generated SAH trees (the largest authored mesh is under 4k triangles, depth < 32) and overflow simply
// refuses the far child rather than producing undefined storage access.
fn TraceRayBlas(Origin: vec3f, Direction: vec3f, MinimumDistance: f32, MaximumDistance: f32, Instance: RayInstance,
                Best: ptr<function, RayHit>)
{
    if (Instance.BlasRoot >= arrayLength(&RayNodes) || Instance.Occupant >= arrayLength(&RayOccupants))
    {
        return;
    }
    let Occupant = RayOccupants[Instance.Occupant];
    let LocalOrigin = (Occupant.WorldToLocal * vec4f(Origin, 1.0)).xyz;
    let LocalDirection = (Occupant.WorldToLocal * vec4f(Direction, 0.0)).xyz;
    let LocalInverse = RayInverseDirection(LocalDirection);
    var Stack: array<u32, 64>;
    var StackCount = 1u;
    Stack[0] = Instance.BlasRoot;
    var Limit = (*Best).Distance;
    loop
    {
        if (StackCount == 0u)
        {
            break;
        }
        StackCount--;
        let NodeIndex = Stack[StackCount];
        if (NodeIndex >= arrayLength(&RayNodes))
        {
            continue;
        }
        let Node = RayNodes[NodeIndex];
        if (RayBoxEntry(LocalOrigin, LocalInverse, Node.Minimum, Node.Maximum, Limit) < 0.0)
        {
            continue;
        }
        if (Node.Count > 0u)
        {
            for (var Offset = 0u; Offset < Node.Count; Offset++)
            {
                let TriangleIndex = Node.LeftOrFirst + Offset;
                if (TriangleIndex >= arrayLength(&RayTriangles))
                {
                    continue;
                }
                let Triangle = RayTriangles[TriangleIndex];
                let Travel = IntersectRayTriangle(LocalOrigin, LocalDirection, Triangle, MinimumDistance, Limit);
                if (Travel < 0.0)
                {
                    continue;
                }
                let LocalNormal = normalize(cross(Triangle.B - Triangle.A, Triangle.C - Triangle.A));
                var WorldNormal = normalize((Occupant.LocalToWorld * vec4f(LocalNormal, 0.0)).xyz);
                if (dot(WorldNormal, Direction) > 0.0)
                {
                    WorldNormal = -WorldNormal;
                }
                (*Best).Position = Origin + Direction * Travel;
                (*Best).Normal = WorldNormal;
                (*Best).Distance = Travel;
                (*Best).Material = select(Triangle.Family, Occupant.MaterialOverride, Occupant.MaterialOverride != NoMaterialOverride);
                (*Best).Occupant = Instance.Occupant;
                (*Best).Hit = true;
                Limit = Travel;
            }
            continue;
        }
        let Left = Node.LeftOrFirst;
        let Right = Left + 1u;
        if (Right >= arrayLength(&RayNodes) || StackCount + 2u > 64u)
        {
            continue;
        }
        let LeftEntry = RayBoxEntry(LocalOrigin, LocalInverse, RayNodes[Left].Minimum, RayNodes[Left].Maximum, Limit);
        let RightEntry = RayBoxEntry(LocalOrigin, LocalInverse, RayNodes[Right].Minimum, RayNodes[Right].Maximum, Limit);
        if (LeftEntry >= 0.0 && RightEntry >= 0.0)
        {
            if (LeftEntry < RightEntry)
            {
                Stack[StackCount] = Right;
                Stack[StackCount + 1u] = Left;
            }
            else
            {
                Stack[StackCount] = Left;
                Stack[StackCount + 1u] = Right;
            }
            StackCount += 2u;
        }
        else if (LeftEntry >= 0.0)
        {
            Stack[StackCount] = Left;
            StackCount++;
        }
        else if (RightEntry >= 0.0)
        {
            Stack[StackCount] = Right;
            StackCount++;
        }
    }
}

fn TraceRayClosest(Origin: vec3f, Direction: vec3f, MinimumDistance: f32, MaximumDistance: f32) -> RayHit
{
    var Result = ConstructRayMiss(Origin, Direction, MaximumDistance);
    if (RayScene.InstanceCount == 0u || RayScene.TlasRoot >= arrayLength(&RayNodes))
    {
        return Result;
    }
    let Inverse = RayInverseDirection(Direction);
    var Stack: array<u32, 64>;
    var StackCount = 1u;
    Stack[0] = RayScene.TlasRoot;
    loop
    {
        if (StackCount == 0u)
        {
            break;
        }
        StackCount--;
        let NodeIndex = Stack[StackCount];
        if (NodeIndex >= arrayLength(&RayNodes))
        {
            continue;
        }
        let Node = RayNodes[NodeIndex];
        if (RayBoxEntry(Origin, Inverse, Node.Minimum, Node.Maximum, Result.Distance) < 0.0)
        {
            continue;
        }
        if (Node.Count > 0u)
        {
            for (var Offset = 0u; Offset < Node.Count; Offset++)
            {
                let InstanceIndex = Node.LeftOrFirst + Offset;
                if (InstanceIndex < arrayLength(&RayInstances) && RayInstances[InstanceIndex].Active != 0u)
                {
                    TraceRayBlas(Origin, Direction, MinimumDistance, Result.Distance, RayInstances[InstanceIndex], &Result);
                }
            }
            continue;
        }
        let Left = Node.LeftOrFirst;
        let Right = Left + 1u;
        if (Right >= arrayLength(&RayNodes) || StackCount + 2u > 64u)
        {
            continue;
        }
        let LeftEntry = RayBoxEntry(Origin, Inverse, RayNodes[Left].Minimum, RayNodes[Left].Maximum, Result.Distance);
        let RightEntry = RayBoxEntry(Origin, Inverse, RayNodes[Right].Minimum, RayNodes[Right].Maximum, Result.Distance);
        if (LeftEntry >= 0.0 && RightEntry >= 0.0)
        {
            if (LeftEntry < RightEntry)
            {
                Stack[StackCount] = Right; Stack[StackCount + 1u] = Left;
            }
            else
            {
                Stack[StackCount] = Left; Stack[StackCount + 1u] = Right;
            }
            StackCount += 2u;
        }
        else if (LeftEntry >= 0.0)
        {
            Stack[StackCount] = Left; StackCount++;
        }
        else if (RightEntry >= 0.0)
        {
            Stack[StackCount] = Right; StackCount++;
        }
    }
    return Result;
}

fn TraceRayVisible(Origin: vec3f, Direction: vec3f, MaximumDistance: f32) -> f32
{
    let Hit = TraceRayClosest(Origin, Direction, RayBias, max(RayBias, MaximumDistance - RayBias));
    return select(1.0, 0.0, Hit.Hit);
}

fn SampleRaySky(Direction: vec3f) -> vec3f
{
    var Radiance = textureSampleLevel(RaySkyView, RaySkySampler, ProjectSkyCoordinates(normalize(Direction)), 0.0).rgb * Frame.SkyScale
                 + Frame.NightSkyRadiance;
    if (dot(Direction, Frame.SunDirection) > 0.99998)
    {
        Radiance += Frame.SunIlluminance * 2500.0;
    }
    return Radiance;
}

fn RayDirectLighting(Position: vec3f, Normal: vec3f, View: vec3f, Surface: SurfaceSample) -> vec3f
{
    var Radiance = vec3f(0.0);
    if (dot(Normal, Frame.SunDirection) > 0.0)
    {
        let Visible = select(1.0, TraceRayVisible(Position + Normal * RayBias, Frame.SunDirection, RayScene.MaximumDistance),
                             FeatureEnabled(Frame, FeatureDirectShadow));
        Radiance += Frame.SunIlluminance * Visible * ResolveDirectReflectance(Surface, Normal, View, Frame.SunDirection);
    }
    for (var LightIndex = 0u; LightIndex < arrayLength(&RayLights); LightIndex++)
    {
        let Light = RayLights[LightIndex];
        let Toward = Light.PositionType.xyz - Position;
        let Reach = min(length(Toward), Light.DirectionReach.w);
        if (Reach <= RayBias)
        {
            continue;
        }
        let Direction = Toward / max(length(Toward), 1.0e-5);
        let Arrival = EvaluateLightArrival(Light, Position, Normal);
        if (any(Arrival > vec3f(0.0)))
        {
            let Visible = select(1.0, TraceRayVisible(Position + Normal * RayBias, Direction, Reach),
                                 FeatureEnabled(Frame, FeatureDirectShadow));
            Radiance += Arrival * Visible * ResolveDirectReflectance(Surface, Normal, View, Direction);
        }
    }
    return Radiance;
}

fn SampleGgxHalf(Normal: vec3f, Roughness: f32, Pair: vec2f) -> vec3f
{
    let Alpha = max(Roughness * Roughness, 0.02);
    let Phi = 2.0 * Pi * Pair.x;
    let Cosine = sqrt((1.0 - Pair.y) / max(1.0e-5, 1.0 + (Alpha * Alpha - 1.0) * Pair.y));
    let Sine = sqrt(max(0.0, 1.0 - Cosine * Cosine));
    return ConstructTangentFrame(Normal) * vec3f(cos(Phi) * Sine, sin(Phi) * Sine, Cosine);
}

// Mixture sampling returns f·cos/pdf, including a GGX lobe for metallic / clear-coated paint and a cosine diffuse lobe.
// It is used after every traced hit, which makes the path continuation material-aware instead of treating a car body as
// a Lambert-only approximation.
struct RayBounce
{
    Direction : vec3f,
    Weight    : vec3f,
}

fn SamplePathBounce(Surface: SurfaceSample, Normal: vec3f, View: vec3f, Seed: ptr<function, u32>) -> RayBounce
{
    let F0 = ResolveSpecularColour(Surface);
    let SpecularProbability = clamp(max(ResolveLuminance(F0), Surface.CoatWeight * 0.25) + Surface.Metalness * 0.35, 0.08, 0.92);
    var Direction = vec3f(0.0, 0.0, 1.0);
    var Pdf = 0.0;
    let SelectSpecular = AdvanceUniform(Seed) < SpecularProbability;
    if (SelectSpecular)
    {
        let Half = SampleGgxHalf(Normal, Surface.Roughness, vec2f(AdvanceUniform(Seed), AdvanceUniform(Seed)));
        Direction = reflect(-View, Half);
        if (dot(Direction, Normal) <= 1.0e-5)
        {
            Direction = ConstructTangentFrame(Normal) * ProjectCosineHemisphere(vec2f(AdvanceUniform(Seed), AdvanceUniform(Seed)));
        }
        let NdotH = max(dot(Normal, Half), 1.0e-5);
        let VdotH = max(dot(View, Half), 1.0e-5);
        Pdf = max(1.0e-6, ResolveGgxDistribution(NdotH, Surface.Roughness) * NdotH / (4.0 * VdotH) * SpecularProbability);
    }
    else
    {
        Direction = ConstructTangentFrame(Normal) * ProjectCosineHemisphere(vec2f(AdvanceUniform(Seed), AdvanceUniform(Seed)));
        Pdf = max(1.0e-6, dot(Normal, Direction) * InversePi * (1.0 - SpecularProbability));
    }
    let Contribution = ResolveDirectReflectance(Surface, Normal, View, Direction) / Pdf;
    var Result: RayBounce;
    Result.Direction = Direction;
    Result.Weight = max(Contribution, vec3f(0.0));
    return Result;
}

// Next-event estimation for the sun and actual dynamic lights, plus a bounded Russian-roulette path.  Emissive facets
// and the physical sky are seen on continuation rays, so this handles an arbitrary chain of diffuse/metal/coat bounces.
fn TracePathRadiance(First: RayHit, View: vec3f, Seed: ptr<function, u32>) -> vec3f
{
    if (!First.Hit)
    {
        return SampleRaySky(-View);
    }
    var Hit = First;
    var Outgoing = View;
    var Throughput = vec3f(1.0);
    var Radiance = vec3f(0.0);
    for (var Bounce = 0u; Bounce < 6u; Bounce++)
    {
        if (Bounce >= RayScene.MaximumBounces || !Hit.Hit || Hit.Material >= arrayLength(&RayMaterials))
        {
            break;
        }
        let Surface = ProjectSurfaceSample(RayMaterials[Hit.Material]);
        Radiance += Throughput * (Surface.Emission * Frame.EmissionScale + RayDirectLighting(Hit.Position, Hit.Normal, Outgoing, Surface));
        let Sample = SamplePathBounce(Surface, Hit.Normal, Outgoing, Seed);
        let Direction = Sample.Direction;
        Throughput *= Sample.Weight;
        if (max(max(Throughput.x, Throughput.y), Throughput.z) <= 1.0e-5)
        {
            break;
        }
        if (Bounce >= 1u)
        {
            let Survival = clamp(max(max(Throughput.x, Throughput.y), Throughput.z), 0.10, 0.95);
            if (AdvanceUniform(Seed) > Survival)
            {
                break;
            }
            Throughput /= Survival;
        }
        Hit = TraceRayClosest(Hit.Position + Hit.Normal * RayBias, Direction, RayBias, RayScene.MaximumDistance);
        if (!Hit.Hit)
        {
            Radiance += Throughput * SampleRaySky(Direction);
            break;
        }
        Outgoing = -Direction;
    }
    return Radiance;
}
