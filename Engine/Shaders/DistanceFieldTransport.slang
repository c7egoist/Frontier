//============================================================================================================================================
//                                                     DISTANCEFIELDTRANSPORT.SLANG
//============================================================================================================================================
// 📦 Shared std430 scene records, local-volume distance composition and exact secondary triangle traversal.

#ifndef FRONTIER_DISTANCE_TRANSPORT
#define FRONTIER_DISTANCE_TRANSPORT
struct DistanceFacet { vec4 Alpha; vec4 Beta; vec4 Gamma; vec4 Normal; vec4 Albedo; vec4 Emission; };
struct DistanceBranch { vec4 Minimum; vec4 Maximum; uvec4 Range; };
// 📝 One row per scene instance, mirrored by DistanceAtlasPlacement (112 bytes). The atlas is baked once at startup; a moving instance only
//    rewrites its world-to-local rows. State.x bit 0: owns a volume. Bit 1: moved from the pose its baked facets were captured at.
struct SdfInstance { vec4 Row0; vec4 Row1; vec4 Row2; vec4 BoxMinimum; vec4 BoxMaximum; uvec4 Layout; uvec4 State; };
layout(std430, binding=3) readonly buffer DistanceAtlas { float AtlasDistances[]; };
layout(rgba32f, binding=4) uniform readonly image2D PreviousRadiance;
layout(std430, binding=5) readonly buffer DistanceConstants { uvec4 GeometryCounts; SdfInstance SdfInstances[]; };   // x instances, y branches, z facets, w card size
layout(std430, binding=6) readonly buffer DistanceBranches { DistanceBranch Branches[]; };
layout(std430, binding=7) readonly buffer DistanceFacets { DistanceFacet Facets[]; };
layout(rgba32f, binding=10) uniform image2D NextRadiance;
layout(rgba32f, binding=8) uniform image2D SurfaceDiffuse;
layout(rgba32f, binding=9) uniform image2D SurfaceNormal;
layout(rgba32f, binding=11) uniform image2D SurfaceEmission;
layout(push_constant) uniform DistancePush
{
    vec4 SunDirectionRadiance;
    vec4 SunColour;
    vec4 SkyAmbient;
    vec4 Tuning;
    vec4 CameraEye;
    uvec4 Counts;
    uvec4 RenderExtent;
} PC;

bool InstanceMoved(uint Instance)
{
    return Instance < GeometryCounts.x && (SdfInstances[Instance].State.x & 2u) != 0u;
}
bool BeyondScene(vec3 Point)
{
    return any(lessThan(Point, Branches[0].Minimum.xyz)) || any(greaterThan(Point, Branches[0].Maximum.xyz));
}
// 📝 The scene field is the smallest of the instances' local fields, each read through its own world-to-local map. Outside an instance's
//    padded volume the distance is the straight-line distance to the volume plus the value at the nearest edge sample, which is an upper
//    bound; a box that is already farther than the best answer is skipped without touching the atlas. `Cell` is the world size of the
//    voxel that supplied the answer, so callers can tell how much to trust it. Returns 1e20 when the scene owns no volume.
float SampleSceneDistance(vec3 Position, out float Cell)
{
    float Best = 1e20;
    Cell = 0.25;
    for (uint Instance = 0u; Instance < GeometryCounts.x; ++Instance)
    {
        SdfInstance Entry = SdfInstances[Instance];
        if ((Entry.State.x & 1u) == 0u) continue;
        vec3 Local = vec3(dot(Entry.Row0.xyz, Position) + Entry.Row0.w, dot(Entry.Row1.xyz, Position) + Entry.Row1.w,
                          dot(Entry.Row2.xyz, Position) + Entry.Row2.w);
        vec3 Clamped = clamp(Local, Entry.BoxMinimum.xyz, Entry.BoxMaximum.xyz);
        float Scale = Entry.BoxMinimum.w;
        float BoxDistance = length(Local - Clamped) * Scale;
        if (BoxDistance >= Best) continue;
        float Voxel = Entry.BoxMaximum.w;
        vec3 Coordinate = (Clamped - Entry.BoxMinimum.xyz) / Voxel - 0.5;
        vec3 Lower = clamp(floor(Coordinate), vec3(0.0), vec3(Entry.Layout.yzw) - 2.0);
        vec3 Fraction = clamp(Coordinate - Lower, vec3(0.0), vec3(1.0));
        uvec3 Base = uvec3(Lower);
        float Distance = 0.0;
        for (uint Corner = 0u; Corner < 8u; ++Corner)
        {
            uvec3 Offset = uvec3(Corner & 1u, (Corner >> 1u) & 1u, (Corner >> 2u) & 1u);
            vec3 Weight = mix(vec3(1.0) - Fraction, Fraction, vec3(Offset));
            uvec3 Texel = Base + Offset;
            Distance += AtlasDistances[Entry.Layout.x + (Texel.z * Entry.Layout.z + Texel.y) * Entry.Layout.y + Texel.x] * Weight.x * Weight.y * Weight.z;
        }
        float Total = BoxDistance + Distance * Scale;
        if (Total < Best) { Best = Total; Cell = Voxel * Scale; }
    }
    return Best;
}
// 📝 Every facet owns a non-overlapping rectangular card. The square-to-triangle warp uses every texel;
//    authored UVs are interpolated separately by ResolveMaterial, so mirrored/repeated UVs never alias cards.
ivec2 CardOrigin(uint Facet)
{
    uint Columns=uint(imageSize(NextRadiance).x)/GeometryCounts.w;
    return ivec2(Facet%Columns,Facet/Columns)*int(GeometryCounts.w);
}
vec3 CardPosition(uint Facet, vec2 Coordinate)
{
    float Root=sqrt(clamp(Coordinate.x,0.0,1.0));
    vec3 Weights=vec3(1.0-Root,Root*(1.0-Coordinate.y),Root*Coordinate.y);
    return Facets[Facet].Alpha.xyz*Weights.x+Facets[Facet].Beta.xyz*Weights.y+Facets[Facet].Gamma.xyz*Weights.z;
}
vec2 CardCoordinate(uint Facet, vec3 Position)
{
    vec3 EdgeAlpha=Facets[Facet].Beta.xyz-Facets[Facet].Alpha.xyz;
    vec3 EdgeBeta=Facets[Facet].Gamma.xyz-Facets[Facet].Alpha.xyz;
    vec3 Delta=Position-Facets[Facet].Alpha.xyz;
    float Alpha=dot(EdgeAlpha,EdgeAlpha), Beta=dot(EdgeAlpha,EdgeBeta), Gamma=dot(EdgeBeta,EdgeBeta);
    float Denominator=max(Alpha*Gamma-Beta*Beta,1e-20);
    vec2 Weights=max(vec2(Gamma*dot(Delta,EdgeAlpha)-Beta*dot(Delta,EdgeBeta),
                          Alpha*dot(Delta,EdgeBeta)-Beta*dot(Delta,EdgeAlpha))/Denominator,vec2(0.0));
    float Sum=Weights.x+Weights.y;
    return clamp(vec2(Sum*Sum,Weights.y/max(Sum,1e-10)),vec2(0.0),vec2(1.0));
}
vec3 SampleCachedRadiance(uint Facet, vec3 Position, bool Current)
{
    vec2 Coordinate=clamp(CardCoordinate(Facet,Position)*float(GeometryCounts.w)-0.5,vec2(0.0),vec2(GeometryCounts.w-1u));
    ivec2 Lower=ivec2(floor(Coordinate)), Origin=CardOrigin(Facet);
    vec2 Fraction=fract(Coordinate);
    vec3 Radiance=vec3(0.0);
    for (uint Corner=0u;Corner<4u;++Corner)
    {
        ivec2 Offset=ivec2(Corner&1u,(Corner>>1u)&1u);
        ivec2 Pixel=Origin+min(Lower+Offset,ivec2(GeometryCounts.w-1u));
        vec2 Weight=mix(vec2(1.0)-Fraction,Fraction,vec2(Offset));
        Radiance+=(Current ? imageLoad(NextRadiance,Pixel).xyz : imageLoad(PreviousRadiance,Pixel).xyz)*Weight.x*Weight.y;
    }
    return Radiance;
}
float SurfaceCoverage(uint Facet, vec3 Position)
{
    ivec2 Pixel=CardOrigin(Facet)+ivec2(clamp(CardCoordinate(Facet,Position)*float(GeometryCounts.w),vec2(0.0),vec2(GeometryCounts.w-1u)));
    return imageLoad(SurfaceNormal,Pixel).w;
}
struct DistanceRayHit { float Travel; uint Facet; };
DistanceRayHit TraceDistanceMesh(vec3 Origin, vec3 Direction, float Maximum)
{
    DistanceRayHit Hit; Hit.Travel=Maximum; Hit.Facet=0xFFFFFFFFu;
    vec3 Reciprocal=1.0/(sign(Direction)*max(abs(Direction),vec3(1e-20))+vec3(equal(Direction,vec3(0.0)))*1e-20);
    uint Branch=0u;
    while (Branch<GeometryCounts.y)
    {
        DistanceBranch Entry=Branches[Branch];
        vec3 Near=(Entry.Minimum.xyz-Origin)*Reciprocal, Far=(Entry.Maximum.xyz-Origin)*Reciprocal;
        vec3 Lower=min(Near,Far), Upper=max(Near,Far);
        if (max(max(Lower.x,Lower.y),max(Lower.z,0.0)) > min(min(Upper.x,Upper.y),min(Upper.z,Hit.Travel)))
        { Branch=Entry.Range.x; continue; }
        for (uint Index=0u; Index<Entry.Range.z; ++Index)
        {
            uint Slot=Entry.Range.y+Index;
            DistanceFacet Triangle=Facets[Slot];
            vec3 EdgeAlpha=Triangle.Beta.xyz-Triangle.Alpha.xyz, EdgeBeta=Triangle.Gamma.xyz-Triangle.Alpha.xyz;
            vec3 Cross=cross(Direction,EdgeBeta);
            float Determinant=dot(EdgeAlpha,Cross);
            if (abs(Determinant)<1e-10) continue;
            vec3 Delta=Origin-Triangle.Alpha.xyz;
            float Beta=dot(Delta,Cross)/Determinant;
            vec3 Second=cross(Delta,EdgeAlpha);
            float Gamma=dot(Direction,Second)/Determinant, Travel=dot(EdgeBeta,Second)/Determinant;
            if (Beta>=0.0 && Gamma>=0.0 && Beta+Gamma<=1.0 && Travel>1e-4 && Travel<Hit.Travel && !InstanceMoved(floatBitsToUint(Triangle.Alpha.w)))
            { if (SurfaceCoverage(Slot,Origin+Direction*Travel)>0.0) { Hit.Travel=Travel; Hit.Facet=Slot; } }
        }
        ++Branch;
    }
    return Hit;
}
// 📝 Hard umbra comes from the exact BVH over the baked scene. The penumbra is marched through the composed local fields, which is also the only
//    place a moved instance can shade anything: its baked facets are masked out of every exact query. The field is unsigned and trilinear,
//    so it reads up to half a voxel high at a surface. Two guards follow from that: samples closer to the surface than the receiver's own
//    tangent plane are the receiver itself and are ignored, and the cone is opened by a quarter voxel so contact does not band.
float DistanceShadow(vec3 Position, vec3 Normal)
{
    vec3 Direction=normalize(PC.SunDirectionRadiance.xyz);
    vec3 Origin=Position+Normal*0.002;
    if (TraceDistanceMesh(Origin,Direction,1e20).Facet!=0xFFFFFFFFu) return 0.0;
    float Visibility=1.0, Travel=0.004;
    float Maximum=length(Origin-Branches[0].Minimum.xyz)+length(Branches[0].Maximum.xyz-Branches[0].Minimum.xyz);
    float Softness=max(PC.Tuning.x,0.0001), Facing=max(dot(Normal,Direction),0.0);
    for (uint Step=0u; Step<48u && Travel<Maximum; ++Step)
    {
        float Cell;
        float Distance=SampleSceneDistance(Origin+Direction*Travel,Cell);
        if (Distance>1e19) break;
        if (Distance<Travel*Facing-0.75*Cell)
            Visibility=min(Visibility,max(Distance-0.25*Cell,0.0)/(Softness*Travel));
        Travel+=max(Distance*0.5,Cell*0.5);
    }
    return clamp(Visibility,0.0,1.0);
}
vec3 HemisphereDirection(vec3 Normal, uint Sample, uint SampleCount, vec2 Shift)
{
    float Height=fract((float(Sample)+0.5)/float(SampleCount)+Shift.x);
    float Angle=6.28318530718*fract(float(Sample)*0.61803398875+Shift.y);
    vec3 Tangent=normalize(abs(Normal.z)<0.9 ? cross(Normal,vec3(0,0,1)) : cross(Normal,vec3(0,1,0)));
    return Tangent*(cos(Angle)*sqrt(1.0-Height))+cross(Normal,Tangent)*(sin(Angle)*sqrt(1.0-Height))+Normal*sqrt(Height);
}
// Sample actual textured surface cards as well as cosine directions. The balance heuristic
// prevents a small bright card from becoming a sharp translated image of itself at low ray counts.
float BranchSolidAngle(uint Slot, vec3 Position, vec3 Normal)
{
    DistanceBranch Entry=Branches[Slot];
    vec3 Center=(Entry.Minimum.xyz+Entry.Maximum.xyz)*0.5-Position;
    vec3 Extent=(Entry.Maximum.xyz-Entry.Minimum.xyz)*0.5;
    if (dot(Center,Normal)+dot(Extent,abs(Normal))<=0.0) return 0.0;
    float Area=max(Extent.x*Extent.y+Extent.y*Extent.z+Extent.z*Extent.x,1e-12);
    return Area/(dot(Center,Center)+Area);
}
float FacetSolidAngle(uint Slot, vec3 Position, vec3 Normal)
{
    DistanceFacet Facet=Facets[Slot];
    if (InstanceMoved(floatBitsToUint(Facet.Alpha.w))) return 0.0;
    vec3 Delta=(Facet.Alpha.xyz+Facet.Beta.xyz+Facet.Gamma.xyz)/3.0-Position;
    float Height=max(dot(Facet.Alpha.xyz-Position,Normal),max(dot(Facet.Beta.xyz-Position,Normal),dot(Facet.Gamma.xyz-Position,Normal)));
    if (Height<=0.0) return 0.0;
    float Area=0.5*length(cross(Facet.Beta.xyz-Facet.Alpha.xyz,Facet.Gamma.xyz-Facet.Alpha.xyz));
    float DistanceSquared=max(dot(Delta,Delta),1e-12);
    return Area*min(1.0,Height/sqrt(DistanceSquared))*abs(dot(Facet.Normal.xyz,Delta))/
        (sqrt(DistanceSquared)*(DistanceSquared+Area*0.1));
}
// The preorder BVH splits each contiguous facet range in half. Both sampling and PDF
// evaluation follow that same partition; no array, recursion, or per-pixel all-facet scan.
uint SelectRadianceFacet(vec3 Position, vec3 Normal, float Sequence, uint Requested, out float Probability)
{
    uint Branch=0u, First=0u, Count=GeometryCounts.z;
    Probability=1.0;
    if (Count==0u) { Probability=0.0; return 0xFFFFFFFFu; }
    while (Branches[Branch].Range.z==0u)
    {
        uint Left=Branch+1u, Right=Branches[Left].Range.x, Half=Count/2u;
        float Alpha=BranchSolidAngle(Left,Position,Normal), Beta=BranchSolidAngle(Right,Position,Normal);
        if (Alpha+Beta<=0.0) { Probability=0.0; return 0xFFFFFFFFu; }
        float Split=Alpha/(Alpha+Beta);
        bool ChooseLeft=Requested==0xFFFFFFFFu ? Sequence<Split : Requested<First+Half;
        if (ChooseLeft)
        {
            Probability*=Split; Sequence/=max(Split,1e-20); Branch=Left; Count=Half;
        }
        else
        {
            Probability*=1.0-Split; Sequence=(Sequence-Split)/max(1.0-Split,1e-20);
            Branch=Right; First+=Half; Count-=Half;
        }
    }
    DistanceBranch Entry=Branches[Branch];
    vec4 Weights=vec4(0.0);
    float Sum=0.0;
    for (uint Index=0u; Index<Entry.Range.z; ++Index)
    { Weights[Index]=FacetSolidAngle(Entry.Range.y+Index,Position,Normal); Sum+=Weights[Index]; }
    if (Sum<=0.0) { Probability=0.0; return 0xFFFFFFFFu; }
    float Target=clamp(Sequence,0.0,0.999999)*Sum, Accumulated=0.0;
    for (uint Index=0u; Index<Entry.Range.z; ++Index)
    {
        Accumulated+=Weights[Index];
        if (Requested==Entry.Range.y+Index || (Requested==0xFFFFFFFFu && Target<Accumulated))
        { Probability*=Weights[Index]/Sum; return Entry.Range.y+Index; }
    }
    Probability=0.0; return 0xFFFFFFFFu;
}
float RadianceDirectionDensity(uint Facet, vec3 Origin, vec3 Point, float Probability)
{
    vec3 Delta=Point-Origin;
    float Area=0.5*length(cross(Facets[Facet].Beta.xyz-Facets[Facet].Alpha.xyz,Facets[Facet].Gamma.xyz-Facets[Facet].Alpha.xyz));
    return Probability*dot(Delta,Delta)/max(Area*abs(dot(Facets[Facet].Normal.xyz,normalize(Delta))),1e-20);
}
#ifndef FRONTIER_SDF_REFERENCE_SAMPLES
#define FRONTIER_SDF_REFERENCE_SAMPLES 0
#endif
uint ScrambleSample(uint Value)
{
    Value^=Value>>16u; Value*=0x7feb352du; Value^=Value>>15u;
    Value*=0x846ca68bu; return Value^(Value>>16u);
}
vec4 GatherSampleShift(bool Current)
{
    if (!Current) return vec4(0.0);
    uint Seed=ScrambleSample(gl_GlobalInvocationID.x)^ScrambleSample(gl_GlobalInvocationID.y+0x9e3779b9u);
    return vec4(ScrambleSample(Seed),ScrambleSample(Seed+1u),ScrambleSample(Seed+2u),ScrambleSample(Seed+3u))/4294967296.0;
}
vec3 GatherDistanceRadiance(vec3 Position, vec3 Normal, bool Current)
{
    float Cell; SampleSceneDistance(Position,Cell);
    vec3 Origin=Position+Normal*0.002, Result=vec3(0.0);
    // Pixel-decorrelated quadrature removes repeated projected silhouettes. The gather is
    // reconstructed as incident irradiance before material evaluation, not blurred after tonemapping.
    uint SampleCount=Current ? 32u : 16u;
#if FRONTIER_SDF_REFERENCE_SAMPLES > 0
    if (Current) SampleCount=uint(FRONTIER_SDF_REFERENCE_SAMPLES);
#endif
    vec4 Shift=GatherSampleShift(Current);
    for (uint Sample=0u; Sample<SampleCount; ++Sample)
    {
        vec3 Direction=HemisphereDirection(Normal,Sample,SampleCount,Shift.xy);
        float Travel=Cell;
        vec3 Incoming=PC.SkyAmbient.xyz;
        bool Resolved=false;
        DistanceRayHit GatherHit; GatherHit.Facet=0xFFFFFFFFu; GatherHit.Travel=0.0;
        for (uint Step=0u; Step<48u; ++Step)
        {
            vec3 Point=Origin+Direction*Travel;
            float Distance=SampleSceneDistance(Point,Cell);
            if (Distance>1e19 || BeyondScene(Point))
            {
                DistanceRayHit Hit=TraceDistanceMesh(Origin,Direction,1e20);
                if (Hit.Facet!=0xFFFFFFFFu) Incoming=SampleCachedRadiance(Hit.Facet,Origin+Direction*Hit.Travel,Current);
                GatherHit=Hit;
                Resolved=true;
                break;
            }
            if (Distance<Cell*0.7)
            {
                // 📝 Exact triangle refinement avoids shading a voxel boundary as a surface.
                DistanceRayHit Hit=TraceDistanceMesh(Origin,Direction,Travel+Cell*2.0);
                if (Hit.Facet!=0xFFFFFFFFu)
                {
                    Incoming=SampleCachedRadiance(Hit.Facet,Origin+Direction*Hit.Travel,Current);
                    GatherHit=Hit;
                    Resolved=true;
                    break;
                }
            }
            Travel+=max(Distance*0.75,Cell*0.5);
        }
        // The coarse field is an accelerator, never the visibility authority on budget exhaustion.
        if (!Resolved)
        {
            DistanceRayHit FinalHit=TraceDistanceMesh(Origin,Direction,1e20);
            GatherHit=FinalHit;
            Incoming=FinalHit.Facet==0xFFFFFFFFu ? PC.SkyAmbient.xyz :
                SampleCachedRadiance(FinalHit.Facet,Origin+Direction*FinalHit.Travel,Current);
        }
        float CosineDensity=max(dot(Normal,Direction),0.0)/3.14159265359;
        float AreaDensity=0.0;
        if (GatherHit.Facet!=0xFFFFFFFFu)
        {
            float Probability;
            SelectRadianceFacet(Origin,Normal,0.0,GatherHit.Facet,Probability);
            AreaDensity=RadianceDirectionDensity(GatherHit.Facet,Origin,Origin+Direction*GatherHit.Travel,Probability);
        }
        Result+=Incoming*(CosineDensity/max(CosineDensity+AreaDensity,1e-20))/float(SampleCount);
        float Probability;
        uint Facet=SelectRadianceFacet(Origin,Normal,fract((float(Sample)+0.5)/float(SampleCount)+Shift.z),0xFFFFFFFFu,Probability);
        if (Facet==0xFFFFFFFFu || Probability<=0.0) continue;
        vec2 Coordinate=fract(vec2(0.5)+float(Sample)*vec2(0.754877666,0.569840296)+Shift.yw);
        vec3 Point=CardPosition(Facet,Coordinate), Delta=Point-Origin;
        float TravelToCard=length(Delta);
        if (TravelToCard<1e-4) continue;
        Direction=Delta/TravelToCard;
        CosineDensity=max(dot(Normal,Direction),0.0)/3.14159265359;
        if (CosineDensity<=0.0) continue;
        DistanceRayHit CardHit=TraceDistanceMesh(Origin,Direction,TravelToCard+0.002);
        if (CardHit.Facet!=Facet) continue;
        AreaDensity=RadianceDirectionDensity(Facet,Origin,Point,Probability);
        Result+=SampleCachedRadiance(Facet,Point,Current)*
            (CosineDensity/max(CosineDensity+AreaDensity,1e-20))/float(SampleCount);
    }
    return Result;
}
#endif
