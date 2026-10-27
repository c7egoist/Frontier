//============================================================================================================================================
//                                                              RELIEFRASTERIZATION.JS
//============================================================================================================================================
// 🧩 WebGL2 rasterization for the terrain: a 512² grid displaced by the 1024² relief texture in the
//    vertex stage, shaded per-pixel with slope/altitude/channel-driven procedural splatting (rock strata,
//    scree, meadow, sand, snow, glacier ice), GGX sun + hemisphere ambient, a 2048² shadow map, height-
//    fogged aerial perspective, shore-aware water, and a procedural sky.
//
// 📝 Height and channels live in Float32 textures sampled with texelFetch + manual bilinear, so the
//    shading reads every one of the million texels even though the geometry carries a quarter of them.
//    Debug view modes recolour the same surface by any channel — the fastest way to see whether the
//    fluvial solver or your brush actually did what you told it to.

import { Resolution, TexelSize, WorldExtent } from "./ReliefField.js?v=13";

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  MATRIX ARITHMETIC
//--------------------------------------------------------------------------------------------------------------------------------------------

function PerspectiveMatrix(FovRadians, Aspect, Near, Far)
{
    const F = 1.0 / Math.tan(FovRadians * 0.5);
    const M = new Float32Array(16);
    M[0] = F / Aspect;
    M[5] = F;
    M[10] = (Far + Near) / (Near - Far);
    M[11] = -1.0;
    M[14] = (2.0 * Far * Near) / (Near - Far);
    return M;
}

function OrthoMatrix(Left, Right, Bottom, Top, Near, Far)
{
    const M = new Float32Array(16);
    M[0] = 2.0 / (Right - Left);
    M[5] = 2.0 / (Top - Bottom);
    M[10] = -2.0 / (Far - Near);
    M[12] = -(Right + Left) / (Right - Left);
    M[13] = -(Top + Bottom) / (Top - Bottom);
    M[14] = -(Far + Near) / (Far - Near);
    M[15] = 1.0;
    return M;
}

function LookAtMatrix(Eye, Centre, Up)
{
    let Zx = Eye[0] - Centre[0], Zy = Eye[1] - Centre[1], Zz = Eye[2] - Centre[2];
    const ZLen = Math.sqrt(Zx * Zx + Zy * Zy + Zz * Zz) || 1.0;
    Zx /= ZLen; Zy /= ZLen; Zz /= ZLen;
    let Xx = Up[1] * Zz - Up[2] * Zy, Xy = Up[2] * Zx - Up[0] * Zz, Xz = Up[0] * Zy - Up[1] * Zx;
    const XLen = Math.sqrt(Xx * Xx + Xy * Xy + Xz * Xz) || 1.0;
    Xx /= XLen; Xy /= XLen; Xz /= XLen;
    const Yx = Zy * Xz - Zz * Xy, Yy = Zz * Xx - Zx * Xz, Yz = Zx * Xy - Zy * Xx;
    const M = new Float32Array(16);
    M[0] = Xx; M[1] = Yx; M[2] = Zx;
    M[4] = Xy; M[5] = Yy; M[6] = Zy;
    M[8] = Xz; M[9] = Yz; M[10] = Zz;
    M[12] = -(Xx * Eye[0] + Xy * Eye[1] + Xz * Eye[2]);
    M[13] = -(Yx * Eye[0] + Yy * Eye[1] + Yz * Eye[2]);
    M[14] = -(Zx * Eye[0] + Zy * Eye[1] + Zz * Eye[2]);
    M[15] = 1.0;
    return M;
}

function MultiplyMatrix(A, B)
{
    const M = new Float32Array(16);
    for (let Column = 0; Column < 4; Column++)
    {
        for (let Row = 0; Row < 4; Row++)
        {
            let Sum = 0.0;
            for (let K = 0; K < 4; K++)
                Sum += A[K * 4 + Row] * B[Column * 4 + K];
            M[Column * 4 + Row] = Sum;
        }
    }
    return M;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  ORBIT CAMERA
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Exponential-glide orbit (the Material workspace camera feel): every control writes the goal, the
//    camera itself eases toward it with a frame-rate independent 1 − e^(−k·dt) blend.

export class OrbitCamera
{
    constructor()
    {
        this.Target       = { X: 0, Y: 220, Z: 0 };
        this.TargetGoal   = { ...this.Target };
        this.Azimuth      = -0.65;
        this.Elevation    = 0.42;
        this.Distance     = 2700;
        this.AzimuthGoal  = this.Azimuth;
        this.ElevationGoal = this.Elevation;
        this.DistanceGoal = this.Distance;
        this.Eye          = [0, 900, 2400];
    }

    Frame(AzimuthDeg, ElevationDeg, Distance, TargetY)
    {
        this.AzimuthGoal   = AzimuthDeg * Math.PI / 180.0;
        this.ElevationGoal = ElevationDeg * Math.PI / 180.0;
        this.DistanceGoal  = Distance;
        this.TargetGoal    = { X: 0, Y: TargetY, Z: 0 };
    }

    Advance(DeltaSeconds, Field)
    {
        const K = 1.0 - Math.exp(-Math.min(DeltaSeconds, 0.05) * 6.5);
        const KT = 1.0 - Math.exp(-Math.min(DeltaSeconds, 0.05) * 9.0);
        this.Azimuth   += (this.AzimuthGoal - this.Azimuth) * K;
        this.Elevation += (this.ElevationGoal - this.Elevation) * K;
        this.Distance  += (this.DistanceGoal - this.Distance) * K;
        this.Target.X  += (this.TargetGoal.X - this.Target.X) * KT;
        this.Target.Y  += (this.TargetGoal.Y - this.Target.Y) * KT;
        this.Target.Z  += (this.TargetGoal.Z - this.Target.Z) * KT;

        const CosEl = Math.cos(this.Elevation);
        this.Eye =
        [
            this.Target.X + this.Distance * CosEl * Math.sin(this.Azimuth),
            this.Target.Y + this.Distance * Math.sin(this.Elevation),
            this.Target.Z + this.Distance * CosEl * Math.cos(this.Azimuth),
        ];
        if (Field)
        {
            const Floor = Field.HeightAt(this.Eye[0], this.Eye[2]) + 3.0;
            if (this.Eye[1] < Floor)
                this.Eye[1] = Floor;
        }
    }

    Basis()
    {
        const Eye = this.Eye;
        let Fx = this.Target.X - Eye[0], Fy = this.Target.Y - Eye[1], Fz = this.Target.Z - Eye[2];
        const FLen = Math.sqrt(Fx * Fx + Fy * Fy + Fz * Fz) || 1.0;
        Fx /= FLen; Fy /= FLen; Fz /= FLen;
        let Rx = Fz * 0 - Fy * 0 + (Fy * 0 - Fz * 1) * -1;   // cross(F, up) expanded below properly
        Rx = Fy * 0 - Fz * 1;
        let Ry = Fz * 0 - Fx * 0;
        let Rz = Fx * 1 - Fy * 0;
        // cross(F, (0,1,0)) = (Fy*0 − Fz*1, Fz*0 − Fx*0, Fx*1 − Fy*0) = (−Fz, 0, Fx) — but right = cross(F, up) gives left-handed feel; use cross(up?) Standard: R = normalize(cross(F, up)) is actually LEFT in RH with Y up when F is forward… keep consistent with LookAtMatrix which uses X = up × Z where Z = −F, i.e. X = up × (−F) = F × up → same (−Fz, 0, Fx)? Verify with F=(0,0,−1): expect R=(1,0,0). (−Fz,0,Fx) = (1,0,0) ✓
        Rx = -Fz; Ry = 0; Rz = Fx;
        const RLen = Math.sqrt(Rx * Rx + Rz * Rz) || 1.0;
        Rx /= RLen; Rz /= RLen;
        const Ux = Ry * Fz - Rz * Fy, Uy = Rz * Fx - Rx * Fz, Uz = Rx * Fy - Ry * Fx;
        return { Forward: [Fx, Fy, Fz], Right: [Rx, Ry, Rz], Up: [Ux, Uy, Uz] };
    }

    RayFromNdc(NdcX, NdcY, Aspect, FovRadians)
    {
        const Basis = this.Basis();
        const TanHalf = Math.tan(FovRadians * 0.5);
        let Dx = Basis.Forward[0] + Basis.Right[0] * NdcX * TanHalf * Aspect + Basis.Up[0] * NdcY * TanHalf;
        let Dy = Basis.Forward[1] + Basis.Right[1] * NdcX * TanHalf * Aspect + Basis.Up[1] * NdcY * TanHalf;
        let Dz = Basis.Forward[2] + Basis.Right[2] * NdcX * TanHalf * Aspect + Basis.Up[2] * NdcY * TanHalf;
        const Len = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz) || 1.0;
        return { Origin: this.Eye, Direction: [Dx / Len, Dy / Len, Dz / Len] };
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SHADER TEXT
//--------------------------------------------------------------------------------------------------------------------------------------------

const SharedGlsl = /* glsl */`
    uniform sampler2D HeightTex;   // relief height in metres (own texture: sculpt re-uploads stay cheap)
    uniform sampler2D FieldTexA;   // flow, water, snow, moisture
    uniform sampler2D FieldTexB;   // wear, deposition, hardness, spare
    uniform sampler2D FieldTexC;   // occlusion, protrusion (baked surface data), spare, spare
    uniform sampler2D PaintTex;    // painted rock, meadow, sand, snow
    uniform sampler2D OverlayTex;  // whichever channel is being inspected / painted
    uniform sampler2D ShadowTex;

    uniform vec3  SunDirection;
    uniform vec3  SunColour;
    uniform vec3  SkyZenithColour;
    uniform vec3  SkyHorizonColour;
    uniform vec3  FogColour;
    uniform float FogDensity;
    uniform float WaterLevel;
    uniform vec2  HeightRange;
    uniform float TimeSeconds;
    uniform float Exposure;
    uniform int   ViewMode;        // 0 shaded · 1 height · 2 slope · 3 flow · 4 water · 5 wear · 6 deposition · 7 hardness · 8 snow · 9 moisture · 10 normals · 11 channel overlay · 12 occlusion · 13 protrusion
    uniform float OverlayAmount;
    uniform vec3  OverlayTint;
    uniform mat4  ShadowViewProjection;
    uniform float ShadowsEnabled;

    uniform vec3  RockLowColour;
    uniform vec3  RockHighColour;
    uniform vec3  MeadowColour;
    uniform vec3  DryColour;
    uniform vec3  SandColour;
    uniform vec3  ScreeColour;
    uniform vec3  SnowColour;
    uniform vec3  WaterTint;
    uniform float StrataContrast;
    uniform float StrataBand;
    uniform float Vegetation;

    const float FieldExtent = ${WorldExtent.toFixed(1)};
    const float FieldTexel  = ${TexelSize.toFixed(3)};
    const int   FieldRes    = ${Resolution};

    ivec2 ClampTexel(ivec2 C)
    {
        return clamp(C, ivec2(0), ivec2(FieldRes - 1));
    }

    float FetchHeight(ivec2 C)
    {
        return texelFetch(HeightTex, ClampTexel(C), 0).r;
    }

    float SampleChannelBilinear(sampler2D Tex, int Component, vec2 WorldXZ)
    {
        vec2 Grid = (WorldXZ / FieldExtent + 0.5) * float(FieldRes) - 0.5;
        vec2 Cell = floor(Grid);
        vec2 Frac = Grid - Cell;
        ivec2 C = ivec2(Cell);
        float AA = texelFetch(Tex, ClampTexel(C), 0)[Component];
        float BA = texelFetch(Tex, ClampTexel(C + ivec2(1, 0)), 0)[Component];
        float AB = texelFetch(Tex, ClampTexel(C + ivec2(0, 1)), 0)[Component];
        float BB = texelFetch(Tex, ClampTexel(C + ivec2(1, 1)), 0)[Component];
        return mix(mix(AA, BA, Frac.x), mix(AB, BB, Frac.x), Frac.y);
    }

    vec4 SampleTexBilinear(sampler2D Tex, vec2 WorldXZ)
    {
        vec2 Grid = (WorldXZ / FieldExtent + 0.5) * float(FieldRes) - 0.5;
        vec2 Cell = floor(Grid);
        vec2 Frac = Grid - Cell;
        ivec2 C = ivec2(Cell);
        vec4 AA = texelFetch(Tex, ClampTexel(C), 0);
        vec4 BA = texelFetch(Tex, ClampTexel(C + ivec2(1, 0)), 0);
        vec4 AB = texelFetch(Tex, ClampTexel(C + ivec2(0, 1)), 0);
        vec4 BB = texelFetch(Tex, ClampTexel(C + ivec2(1, 1)), 0);
        return mix(mix(AA, BA, Frac.x), mix(AB, BB, Frac.x), Frac.y);
    }

    float SampleHeight(vec2 WorldXZ)
    {
        return SampleChannelBilinear(HeightTex, 0, WorldXZ);
    }

    float HashGrid(vec2 P)
    {
        vec3 P3 = fract(vec3(P.xyx) * 0.1031);
        P3 += dot(P3, P3.yzx + 33.33);
        return fract((P3.x + P3.y) * P3.z);
    }

    float HashNoise(vec2 P)
    {
        vec2 I = floor(P);
        vec2 F = fract(P);
        vec2 U = F * F * (3.0 - 2.0 * F);
        float AA = HashGrid(I);
        float BA = HashGrid(I + vec2(1.0, 0.0));
        float AB = HashGrid(I + vec2(0.0, 1.0));
        float BB = HashGrid(I + vec2(1.0, 1.0));
        return mix(mix(AA, BA, U.x), mix(AB, BB, U.x), U.y);
    }

    uniform float QualityDetailScale;

    float SampleDetailedHeight(vec2 XZ, float Protrusion, float QScale)
    {
        float BaseH = SampleChannelBilinear(HeightTex, 0, XZ);
        if (QScale <= 0.85)
            return BaseH;
        float Gain = clamp((QScale - 0.85) * 1.15, 0.0, 1.6);
        float R1 = 1.0 - abs(HashNoise(XZ * 0.28 + 7.1) * 2.0 - 1.0);
        float R2 = 1.0 - abs(HashNoise(XZ * 0.62 - 13.4) * 2.0 - 1.0);
        float Crag = (R1 * R1 * 0.68 + R2 * R2 * 0.32) - 0.35;
        return BaseH + Crag * 3.2 * Gain * clamp(Protrusion * 1.4, 0.15, 1.0);
    }



    float NoiseOctaves(vec2 P, int Octaves)
    {
        float Sum = 0.0;
        float Amplitude = 0.5;
        for (int Octave = 0; Octave < 5; Octave++)
        {
            if (Octave >= Octaves)
                break;
            Sum += Amplitude * HashNoise(P);
            P = P * 2.03 + vec2(17.3, 9.1);
            Amplitude *= 0.5;
        }
        return Sum;
    }

    // Sharp angular ridged noise for fractured bedrock outcrops, dihedrals, and talus boulders.
    float RidgedOctaves(vec2 P, int Octaves)
    {
        float Sum = 0.0;
        float Amplitude = 0.52;
        float Weight = 1.0;
        for (int Octave = 0; Octave < 4; Octave++)
        {
            if (Octave >= Octaves)
                break;
            float N = 1.0 - abs(HashNoise(P) * 2.0 - 1.0);
            N = N * N * Weight;
            Weight = clamp(N * 1.9, 0.15, 1.0);
            Sum += N * Amplitude;
            P = mat2(1.62, -1.24, 1.24, 1.62) * P + vec2(17.3, 9.1);
            Amplitude *= 0.50;
        }
        return Sum;
    }

    // Triplanar-projected angular rock cleavage & fracture field for 3D normal perturbation.
    float DetailHeight(vec3 WorldPos, vec3 Normal, float Scale)
    {
        vec3 Blend = abs(Normal);
        Blend = pow(Blend, vec3(3.0));
        Blend /= max(Blend.x + Blend.y + Blend.z, 0.0001);
        float Top   = RidgedOctaves(WorldPos.xz * Scale, 2);
        float SideX = RidgedOctaves(vec2(WorldPos.z * 0.85, WorldPos.y * 1.25) * Scale + 41.0, 2);
        float SideZ = RidgedOctaves(vec2(WorldPos.x * 0.85, WorldPos.y * 1.25) * Scale + 83.0, 2);
        return Top * Blend.y + SideX * Blend.x + SideZ * Blend.z;
    }

    // Scale-invariant 3D normal perturbation: Step scales as 1/Scale so the finite difference in
    // lattice space is always 0.24 units regardless of wavelength.
    vec3 PerturbNormal(vec3 WorldPos, vec3 Normal, float Scale, float Strength)
    {
        float Step = 0.24 / max(Scale, 0.005);
        float Centre = DetailHeight(WorldPos, Normal, Scale);
        float Dx = (DetailHeight(WorldPos + vec3(Step, 0.0, 0.0), Normal, Scale) - Centre) / 0.24;
        float Dy = (DetailHeight(WorldPos + vec3(0.0, Step, 0.0), Normal, Scale) - Centre) / 0.24;
        float Dz = (DetailHeight(WorldPos + vec3(0.0, 0.0, Step), Normal, Scale) - Centre) / 0.24;
        vec3 Grad = vec3(Dx, Dy, Dz);
        Grad -= Normal * dot(Grad, Normal);
        return normalize(Normal - Grad * Strength);
    }

    float ShadowFactor(vec3 WorldPos, vec3 Normal, float NdotL)
    {
        if (ShadowsEnabled < 0.5)
            return 1.0;
        vec3 OffsetPos = WorldPos + Normal * 1.6;
        vec4 ShadowClip = ShadowViewProjection * vec4(OffsetPos, 1.0);
        vec3 Coord = ShadowClip.xyz / ShadowClip.w * 0.5 + 0.5;
        if (Coord.x < 0.0 || Coord.x > 1.0 || Coord.y < 0.0 || Coord.y > 1.0 || Coord.z > 1.0)
            return 1.0;
        float Bias = mix(0.0016, 0.00035, clamp(NdotL, 0.0, 1.0));
        float Texel = 1.0 / 2048.0;
        float Lit = 0.0;
        for (int Oy = -1; Oy <= 1; Oy++)
        {
            for (int Ox = -1; Ox <= 1; Ox++)
            {
                float Depth = texture(ShadowTex, Coord.xy + vec2(float(Ox), float(Oy)) * Texel).r;
                Lit += (Coord.z - Bias <= Depth) ? 1.0 : 0.0;
            }
        }
        return Lit / 9.0;
    }

    vec3 GgxSpecular(vec3 Normal, vec3 ViewDir, vec3 LightDir, float Roughness, vec3 F0)
    {
        vec3 HalfDir = normalize(ViewDir + LightDir);
        float NdotL = max(dot(Normal, LightDir), 0.0);
        float NdotV = max(dot(Normal, ViewDir), 0.0001);
        float NdotH = max(dot(Normal, HalfDir), 0.0);
        float VdotH = max(dot(ViewDir, HalfDir), 0.0);
        float Alpha = Roughness * Roughness;
        float Alpha2 = Alpha * Alpha;
        float Denominator = NdotH * NdotH * (Alpha2 - 1.0) + 1.0;
        float Distribution = Alpha2 / (3.14159265 * Denominator * Denominator);
        float K = Alpha * 0.5;
        float Geometry = (NdotL / (NdotL * (1.0 - K) + K)) * (NdotV / (NdotV * (1.0 - K) + K));
        vec3 Fresnel = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
        return Distribution * Geometry * Fresnel / max(4.0 * NdotL * NdotV, 0.0001);
    }

    vec3 ApplyFog(vec3 Colour, vec3 WorldPos, vec3 CameraPos)
    {
        float Distance = max(length(WorldPos - CameraPos) - 1250.0, 0.0);
        float Density = FogDensity * (0.55 + 0.45 * exp(-max(WorldPos.y - WaterLevel, 0.0) * 0.005));
        float Factor = 1.0 - exp(-Distance * Distance * Density * Density * 0.42);
        return mix(Colour, FogColour, clamp(Factor, 0.0, 0.36));
    }

    vec3 Tonemap(vec3 Colour)
    {
        vec3 X = Colour * Exposure;
        vec3 Mapped = clamp((X * (2.51 * X + 0.03)) / (X * (2.43 * X + 0.59) + 0.14), 0.0, 1.0);
        return pow(Mapped, vec3(1.0 / 2.2));
    }

    vec3 DebugRamp(float T)
    {
        // A readable blue→cyan→green→amber→red ramp for scalar channels.
        vec3 C1 = vec3(0.05, 0.10, 0.35);
        vec3 C2 = vec3(0.05, 0.55, 0.85);
        vec3 C3 = vec3(0.15, 0.75, 0.35);
        vec3 C4 = vec3(0.95, 0.75, 0.20);
        vec3 C5 = vec3(0.90, 0.20, 0.10);
        T = clamp(T, 0.0, 1.0);
        if (T < 0.25) return mix(C1, C2, T / 0.25);
        if (T < 0.50) return mix(C2, C3, (T - 0.25) / 0.25);
        if (T < 0.75) return mix(C3, C4, (T - 0.50) / 0.25);
        return mix(C4, C5, (T - 0.75) / 0.25);
    }
`;

const TerrainVertexGlsl = /* glsl */`#version 300 es
    precision highp float;
    precision highp int;
    uniform sampler2D HeightTex;
    uniform sampler2D FieldTexB;
    uniform sampler2D FieldTexC;
    uniform mat4 ViewProjection;
    uniform float GridResUniform;
    uniform float QualityDetailScale;
    uniform float StrataBand;
    uniform float StrataContrast;
    const float FieldExtent = ${WorldExtent.toFixed(1)};
    const int   FieldRes    = ${Resolution};
    layout(location = 0) in vec2 GridCoord;
    out vec3 WorldPosition;
    out vec2 WorldXZ;

    float HashGridV(vec2 P)
    {
        vec3 P3 = fract(vec3(P.xyx) * 0.1031);
        P3 += dot(P3, P3.yzx + 33.33);
        return fract((P3.x + P3.y) * P3.z);
    }

    float HashNoiseV(vec2 P)
    {
        vec2 I = floor(P);
        vec2 F = fract(P);
        vec2 U = F * F * (3.0 - 2.0 * F);
        return mix(mix(HashGridV(I), HashGridV(I + vec2(1.0, 0.0)), U.x),
                   mix(HashGridV(I + vec2(0.0, 1.0)), HashGridV(I + vec2(1.0, 1.0)), U.x), U.y);
    }

    float SubTexelCrag(vec2 XZ, float Protrusion, float QScale)
    {
        if (QScale <= 0.85)
            return 0.0;
        float Gain = clamp((QScale - 0.85) * 1.15, 0.0, 1.6);
        float R1 = 1.0 - abs(HashNoiseV(XZ * 0.28 + 7.1) * 2.0 - 1.0);
        float R2 = 1.0 - abs(HashNoiseV(XZ * 0.62 - 13.4) * 2.0 - 1.0);
        float Crag = (R1 * R1 * 0.68 + R2 * R2 * 0.32) - 0.35;
        return Crag * 3.2 * Gain * clamp(Protrusion * 1.4, 0.15, 1.0);
    }

    float FetchHeightBilinear(vec2 WorldXZIn)
    {
        vec2 Grid = (WorldXZIn / FieldExtent + 0.5) * float(FieldRes) - 0.5;
        vec2 Cell = floor(Grid);
        vec2 Frac = Grid - Cell;
        ivec2 C = ivec2(Cell);
        ivec2 MaxC = ivec2(FieldRes - 1);
        float AA = texelFetch(HeightTex, clamp(C, ivec2(0), MaxC), 0).r;
        float BA = texelFetch(HeightTex, clamp(C + ivec2(1, 0), ivec2(0), MaxC), 0).r;
        float AB = texelFetch(HeightTex, clamp(C + ivec2(0, 1), ivec2(0), MaxC), 0).r;
        float BB = texelFetch(HeightTex, clamp(C + ivec2(1, 1), ivec2(0), MaxC), 0).r;
        return mix(mix(AA, BA, Frac.x), mix(AB, BB, Frac.x), Frac.y);
    }

    float FetchHardness(vec2 WorldXZIn)
    {
        vec2 Grid = (WorldXZIn / FieldExtent + 0.5) * float(FieldRes) - 0.5;
        ivec2 C = clamp(ivec2(floor(Grid)), ivec2(0), ivec2(FieldRes - 1));
        return texelFetch(FieldTexB, C, 0).b;
    }

    float FetchProtrusion(vec2 WorldXZIn)
    {
        vec2 Grid = (WorldXZIn / FieldExtent + 0.5) * float(FieldRes) - 0.5;
        ivec2 C = clamp(ivec2(floor(Grid)), ivec2(0), ivec2(FieldRes - 1));
        return texelFetch(FieldTexC, C, 0).g;
    }

    // 📝 Ported from Slate CliffGenerator src/terrain-geometry.js + src/detail.js:
    //    Displaces cliff vertices horizontally along the smoothed outward cliff normal (OutDir)
    //    to form caprock overhang lips, undercut soft-bed recesses, 3D buttresses, staggered
    //    masonry block courses, and razor-sharp peak/arete horns.
    void main()
    {
        float ActiveGrid = max(GridResUniform, 256.0);
        vec2 XZ = (GridCoord / ActiveGrid - 0.5) * FieldExtent;
        float Height = FetchHeightBilinear(XZ);
        float Hardness = FetchHardness(XZ);
        float Protrusion = FetchProtrusion(XZ);

        // Smooth outward horizontal cliff normal sampled over +-13.5 m so adjacent vertices never fold.
        float Span = 13.5;
        float HxP = FetchHeightBilinear(XZ + vec2(Span, 0.0));
        float HxM = FetchHeightBilinear(XZ - vec2(Span, 0.0));
        float HzP = FetchHeightBilinear(XZ + vec2(0.0, Span));
        float HzM = FetchHeightBilinear(XZ - vec2(0.0, Span));
        vec2 Grad = vec2((HxP - HxM) / (2.0 * Span), (HzP - HzM) / (2.0 * Span));
        float Slope = length(Grad);
        vec2 OutDir = Slope > 0.001 ? (-Grad / Slope) : vec2(0.0);

        float Steep = smoothstep(0.52, 1.32, Slope);
        float DispH = 0.0;
        float DispY = SubTexelCrag(XZ, Protrusion, max(QualityDetailScale, 1.0));

        if (Steep > 0.005)
        {
            float Band = max(StrataBand, 6.0);
            float Warp = (HashNoiseV(XZ * 0.009) - 0.5) * Band * 0.45;
            float BedPhase = (Height + Warp) / Band * 6.2831853;
            float LedgeNotch = HashNoiseV(XZ * 0.032 + vec2(Height * 0.04)) * 2.0 - 1.0;
            // Hard beds push outward (+); soft beds undercut inward (-).
            float BedLip = ((Hardness - 0.44) * 2.0 + 0.52 * cos(BedPhase)) * (1.0 - 0.35 * max(0.0, LedgeNotch));
            // 3D buttress ribs & alcoves along the cliff wall.
            float Buttress = (HashNoiseV(XZ * 0.024 + vec2(Height * 0.015, -Height * 0.012)) * 2.0 - 1.0) * 1.35;
            // Staggered brickwork cliff block courses.
            float CourseIdx = floor((Height + Warp) / (Band * 0.42));
            float StrikeU = dot(XZ, vec2(-OutDir.y, OutDir.x)) + mod(CourseIdx, 2.0) * 7.5;
            float BlockCell = floor(StrikeU / 15.0);
            float BlockJut = (HashGridV(vec2(BlockCell, CourseIdx)) - 0.48) * 1.45 * (0.35 + 0.65 * StrataContrast);

            float OverhangStrength = 2.65 * (0.45 + 0.55 * StrataContrast);
            DispH = Steep * (BedLip * OverhangStrength + Buttress + BlockJut);
            DispH = clamp(DispH, -3.4, 4.2);
            // Gravity lip sag on projecting caprock overhangs + vertical step riser accent.
            DispY += -max(0.0, DispH) * 0.16 + Steep * sin(BedPhase) * 0.55 * StrataContrast;
        }

        // Peak & arete horn sharpening: pull upper steep flanks slightly into the ridge divide & lift summit horns.
        float HornMask = smoothstep(0.42, 0.82, Protrusion) * smoothstep(0.35, 1.05, Slope);
        DispH -= HornMask * 1.15;
        DispY += smoothstep(0.52, 0.92, Protrusion) * 1.65;

        WorldPosition = vec3(XZ.x + OutDir.x * DispH, Height + DispY, XZ.y + OutDir.y * DispH);
        WorldXZ = XZ;
        gl_Position = ViewProjection * vec4(WorldPosition, 1.0);
    }
`;

const SurfaceFragmentCore = /* glsl */`
    // Shared terrain/stamp shading. Expects varyings WorldPosition (+ GeometricNormal under STAMP_SURFACE).
    vec3 ShadeSurface(vec3 WorldPos, vec3 GeometricNormal, vec3 CameraPos)
    {
        vec2 XZ = WorldPos.xz;
        vec4 TexA = SampleTexBilinear(FieldTexA, XZ);
        vec4 TexB = SampleTexBilinear(FieldTexB, XZ);
        vec4 TexC = SampleTexBilinear(FieldTexC, XZ);
        vec4 Paint = SampleTexBilinear(PaintTex, XZ);
        float HeightHere = WorldPos.y;
        float HeightNorm = clamp((HeightHere - HeightRange.x) / max(HeightRange.y - HeightRange.x, 1.0), 0.0, 1.0);
        float FlowHere = TexA.r;
        float WaterHere = TexA.g;
        float SnowHere = TexA.b;
        float MoistureHere = TexA.a;
        float WearHere = TexB.r;
        float DepositionHere = TexB.g;
        float HardnessHere = TexB.b;
        float OcclusionHere = TexC.r;
        float ProtrusionHere = TexC.g;
        float MaskHere = TexC.a;

        // Detect subterranean points inside 3D SDF caves (where WorldPos.y sits below the roof H(XZ)).
        float RoofHeight = SampleHeight(XZ);
        float CaveDepth  = max(RoofHeight - WorldPos.y, 0.0);
        float InsideCave = smoothstep(0.85, 3.6, CaveDepth);

        vec3 ViewDir = normalize(CameraPos - WorldPos);
        float ViewDistance = length(CameraPos - WorldPos);
        float DetailFade = exp(-ViewDistance / 1100.0);

        float NdotLRaw = dot(GeometricNormal, SunDirection);

        if (ViewMode != 0)
        {
            float DiffuseShade = 0.32 + 0.68 * clamp(NdotLRaw, 0.0, 1.0);
            vec3 DebugColour;
            if      (ViewMode == 1)  DebugColour = DebugRamp(HeightNorm);
            else if (ViewMode == 2)  DebugColour = DebugRamp(clamp(1.0 - GeometricNormal.y, 0.0, 1.0) * 1.6);
            else if (ViewMode == 3)  DebugColour = mix(vec3(0.02), vec3(0.25, 0.6, 1.0), pow(FlowHere, 2.2)) + vec3(0.05);
            else if (ViewMode == 4)  DebugColour = mix(vec3(0.03), vec3(0.1, 0.5, 1.0), WaterHere);
            else if (ViewMode == 5)  DebugColour = mix(vec3(0.03), vec3(1.0, 0.4, 0.15), WearHere);
            else if (ViewMode == 6)  DebugColour = mix(vec3(0.03), vec3(0.95, 0.8, 0.3), DepositionHere);
            else if (ViewMode == 7)  DebugColour = DebugRamp(HardnessHere);
            else if (ViewMode == 8)  DebugColour = mix(vec3(0.03), vec3(0.95), SnowHere);
            else if (ViewMode == 9)  DebugColour = mix(vec3(0.05, 0.03, 0.01), vec3(0.2, 0.8, 0.35), MoistureHere);
            else if (ViewMode == 10) DebugColour = GeometricNormal * 0.5 + 0.5;
            else if (ViewMode == 12) DebugColour = vec3(OcclusionHere);
            else if (ViewMode == 13) DebugColour = vec3(ProtrusionHere);
            else if (ViewMode == 15) DebugColour = vec3(clamp(MaskHere, 0.0, 1.0));
            else
            {
                float OverlayReading = SampleChannelBilinear(OverlayTex, 0, XZ);
                DebugColour = mix(vec3(0.04), OverlayTint, clamp(OverlayReading, 0.0, 1.0));
            }
            return ApplyFog(DebugColour * DiffuseShade * 1.6, WorldPos, CameraPos);
        }

        // On steep / nearly-vertical walls, sampling 2D top-down (X, Z) channels smears texels
        // vertically. Attenuate top-down streak channels with slope and introduce 3D elevation-banded
        // rock ledges (functions of WorldPos.y) so cliff walls break into horizontal benches.
        float SteepFade = smoothstep(0.26, 0.68, abs(GeometricNormal.y));
        float FlowEffective = FlowHere * SteepFade;
        float WearEffective = WearHere * (0.35 + 0.65 * SteepFade);

        float StrataWarp = (HashNoise(XZ * 0.0085) - 0.5) * StrataBand * 0.60;
        float StrataAngle = (HeightHere + StrataWarp) / max(StrataBand, 4.0) * 6.28318;
        float BandPhase = sin(StrataAngle);
        float BandShelf = cos(StrataAngle);

        // 3-scale 3D angular rock fracture & outcrop masks for crisp geological edges from orbit to close-up zoom.
        float QScale = max(QualityDetailScale, 1.0);
        float FractureMacro = RidgedOctaves(XZ * 0.042 + vec2(HeightHere * 0.018), 2);
        float FractureMeso  = RidgedOctaves(XZ * 0.18 * QScale - vec2(HeightHere * 0.036), 2);
        float FractureMicro = RidgedOctaves(XZ * 0.58 * QScale + vec2(HeightHere * 0.075), 2);
        float OutcropCrag   = clamp((ProtrusionHere - 0.38) * 1.85 + (HardnessHere - 0.58) * 1.25 + (FractureMacro - 0.52) * 0.65, 0.0, 1.0)
                            * (1.0 - smoothstep(0.90, 0.97, GeometricNormal.y));

        float Flatness = smoothstep(0.82, 0.96, GeometricNormal.y);
        // Slopes steeper than ~15-26 deg and protruding outcrop crags expose fractured bedrock.
        float SlopeRock = 1.0 - smoothstep(0.74, 0.92, GeometricNormal.y - WearEffective * 0.09 - OutcropCrag * 0.26);
        float HighRock  = smoothstep(0.30, 0.52, HeightNorm) * (1.0 - smoothstep(0.88, 0.96, GeometricNormal.y - OutcropCrag * 0.16));
        float RockW = clamp(max(max(SlopeRock, HighRock), OutcropCrag * 0.92), 0.0, 1.0);
        RockW = mix(RockW, 1.0, InsideCave);

        vec3 ShelfNormal = normalize(GeometricNormal + vec3(0.0, max(BandShelf, -0.35) * StrataContrast * 0.28 * RockW * (1.0 - InsideCave), 0.0));

        float ValleyFloor = smoothstep(0.84, 0.96, GeometricNormal.y);
        float VegSignal = MoistureHere * 0.65 + (1.0 - HeightNorm) * 0.45 - 0.20 + (FractureMacro - 0.5) * 0.15;
        float MeadowW = Vegetation * smoothstep(0.36, 0.56, VegSignal) * ValleyFloor
                      * (1.0 - smoothstep(0.26, 0.42, HeightNorm))
                      * (1.0 - clamp(SnowHere * 2.5, 0.0, 1.0)) * (1.0 - RockW * 0.85) * (1.0 - InsideCave);
        float SedimentW = clamp(DepositionHere * 1.45 - 0.28, 0.0, 1.0) * (0.35 + 0.65 * smoothstep(0.25, 0.70, FlowEffective)) * Flatness * (1.0 - InsideCave);
        float SandW = clamp(DepositionHere * 1.25 - 0.22, 0.0, 1.0) * (1.0 - MoistureHere * 0.55) * Flatness
                    + (1.0 - smoothstep(0.0, 3.5, HeightHere - WaterLevel)) * step(0.0, HeightHere - WaterLevel) * 0.6 * Flatness;
        SandW = clamp(SandW * (1.0 - SedimentW * 0.70) * (1.0 - InsideCave * 0.8), 0.0, 1.0);

        // Talus scree fans & scattered 3D angular boulders on mid-slopes and cliff bases.
        float ScreeSlope = smoothstep(0.66, 0.84, GeometricNormal.y) * (1.0 - smoothstep(0.91, 0.97, GeometricNormal.y));
        float ScreeW = clamp(DepositionHere * 1.32 + WearEffective * 0.30 - 0.12, 0.0, 1.0) * ScreeSlope * (1.0 - SandW) * (1.0 - OutcropCrag * 0.75) * (1.0 - InsideCave);

        // Individual 3D rocks & talus boulders scattered on scree aprons, moraines & valley shoulders.
        float BoulderField = pow(clamp(FractureMeso * 0.95 + FractureMicro * 0.42 - 0.48, 0.0, 1.0), 1.85);
        float BoulderZone  = clamp(ScreeW * 1.45 + DepositionHere * 0.78 * (1.0 - Flatness * 0.60), 0.0, 1.0) * (1.0 - WaterHere);
        float BoulderMask  = clamp(BoulderField * BoulderZone * 1.55, 0.0, 1.0) * (1.0 - InsideCave);

        RockW = clamp(max(RockW * (1.0 - ScreeW * 0.62), BoulderMask * 0.92), 0.0, 1.0);

        // Opaque, fracture-broken snow boundary (no blurry airbrushed grey halo!): snow terminates in a
        // razor-sharp geological edge against protruding rock crags, dihedrals, and boulders.
        float SnowSignal = SnowHere * 1.28 + (FractureMacro - 0.50) * 0.22 + (FractureMeso - 0.50) * 0.16
                         - max(OutcropCrag - 0.42, 0.0) * 0.82 - BoulderMask * 0.90
                         - (1.0 - smoothstep(0.55, 0.78, GeometricNormal.y)) * 0.55;
        float SnowW = smoothstep(0.08, 0.24, SnowSignal) * smoothstep(0.40, 0.64, GeometricNormal.y) * (1.0 - InsideCave);
        float IceW = SnowW * smoothstep(0.42, 0.78, FlowEffective) * Flatness;

        // ---- albedos: natural stone/earth tones with crisp rock joint fissures & mineral grain ---
        float RockMix = clamp(HeightNorm * 0.54 + ProtrusionHere * 0.48 + HardnessHere * 0.25 - 0.18, 0.0, 1.0);
        vec3 RockAlbedo = mix(RockLowColour, RockHighColour, RockMix);
        // Warm iron-oxide/lichen mineral weathering on exposed rock ribs breaks up monochromatic grey stone.
        vec3 WarmMineral = mix(RockAlbedo, vec3(0.46, 0.39, 0.32), 0.32);
        RockAlbedo = mix(RockAlbedo, WarmMineral, clamp(FractureMacro * 0.85 + ProtrusionHere * 0.35 - 0.35, 0.0, 0.68) * (1.0 - StrataContrast * 0.5));
        vec3 BandTint = mix(vec3(1.10, 0.90, 0.73), vec3(0.74, 0.60, 0.54), BandPhase * 0.5 + 0.5);
        RockAlbedo *= mix(vec3(1.0), BandTint, StrataContrast * 0.92);
        // Sharp rock joint fissures + wind-scoured outcrop arrises so close-up rock has real fracture character.
        float JointFissure = smoothstep(0.18, 0.42, FractureMeso * 0.62 + FractureMicro * 0.38);
        float MineralVar   = (0.72 + 0.38 * JointFissure) * (0.86 + 0.24 * FractureMacro);
        RockAlbedo *= MineralVar * (0.70 + 0.30 * OcclusionHere) * (0.86 + 0.30 * ProtrusionHere + 0.08 * WearEffective);
        // Distinct weathered block contrast on protruding outcrop crags and scattered talus boulders.
        vec3 BoulderTone = mix(RockLowColour * 0.64, WarmMineral * 1.14, step(0.50, FractureMacro));
        RockAlbedo = mix(RockAlbedo, BoulderTone, clamp(BoulderMask * 0.68 + OutcropCrag * 0.28, 0.0, 0.72));

        vec3 SoilAlbedo = mix(DryColour, RockLowColour * 1.04, clamp(0.25 + DepositionHere * 0.55, 0.0, 1.0));
        vec3 SedimentAlbedo = mix(SandColour, DryColour, 0.45) * 0.94;
        vec3 MeadowAlbedo = mix(MeadowColour * 0.90, DryColour * 0.94, clamp((1.0 - MoistureHere) * 0.85 - 0.05, 0.0, 1.0)) * (0.88 + 0.22 * FractureMicro);
        vec3 SandAlbedo = SandColour * (0.94 + 0.10 * FractureMacro);
        vec3 ScreeAlbedo = ScreeColour * (0.80 + 0.32 * FractureMicro) * (0.90 + 0.16 * ProtrusionHere);
        vec3 SnowAlbedo = SnowColour * (0.95 + 0.05 * FractureMeso);
        vec3 IceAlbedo = mix(SnowColour, vec3(0.55, 0.72, 0.85), 0.65);

        vec3 Albedo = SoilAlbedo;
        Albedo = mix(Albedo, SedimentAlbedo, SedimentW);
        Albedo = mix(Albedo, SandAlbedo, SandW * (1.0 - MeadowW * 0.6));
        Albedo = mix(Albedo, ScreeAlbedo, ScreeW);
        Albedo = mix(Albedo, MeadowAlbedo, MeadowW);
        Albedo = mix(Albedo, RockAlbedo, RockW);
        Albedo = mix(Albedo, IceAlbedo, IceW * 0.85);
        Albedo = mix(Albedo, SnowAlbedo, SnowW * (1.0 - IceW * 0.7));
        Albedo *= mix(vec3(1.04, 1.00, 0.94), vec3(0.96, 0.99, 1.05), HeightNorm);

        float Roughness = 0.92;
        Roughness = mix(Roughness, 0.82, RockW);
        Roughness = mix(Roughness, 0.50, SnowW * 0.6);
        Roughness = mix(Roughness, 0.22, IceW);
        Roughness = mix(Roughness, 0.42, smoothstep(0.55, 0.95, FlowEffective) * RockW * 0.7);

        // Alluvial riverbank & lakeshore gravel/sand bar collar around rivers and perched lakes.
        float BankCollar = smoothstep(0.02, 0.16, WaterHere) * (1.0 - smoothstep(0.18, 0.36, WaterHere))
                         * Flatness * (1.0 - SnowW * 0.85) * (1.0 - InsideCave);
        vec3 BankGravel = mix(SandColour, RockLowColour * 0.82, 0.48);
        Albedo = mix(Albedo, BankGravel, BankCollar * 0.72);

        float Wet = clamp(WaterHere * 0.85 + smoothstep(0.72, 0.96, FlowEffective) * 0.55
                          + (1.0 - smoothstep(0.0, 1.8, abs(HeightHere - WaterLevel))) * 0.5, 0.0, 1.0) * (1.0 - SnowW);
        Albedo *= 1.0 - 0.36 * Wet;
        Roughness = mix(Roughness, 0.26, Wet * 0.8);

        // ---- normals: 3D shelf normal + meso outcrop cleavage + crag/boulder facets ----
        float MesoFade  = exp(-ViewDistance / 4200.0);
        float CragFade  = exp(-ViewDistance / 2600.0);
        float MesoStrength = clamp(RockW * 0.28 + OutcropCrag * 0.22, 0.0, 0.44) * (1.0 - SnowW * 0.82);
        float CragStrength = clamp(RockW * 0.32 + OutcropCrag * 0.26 + BoulderMask * 0.48 + ScreeW * 0.26, 0.0, 0.68) * (1.0 - SnowW * 0.85);

        vec3 MesoNormal = PerturbNormal(WorldPos, ShelfNormal, 0.056, MesoStrength * MesoFade);
        vec3 Normal     = PerturbNormal(WorldPos, MesoNormal, 0.26 * QScale, CragStrength * CragFade);

        float AridFlat = Flatness * smoothstep(0.35, 0.75, StrataContrast);
        float Ripple = sin(dot(XZ, vec2(0.83, 0.55)) * 2.4);
        Normal = normalize(Normal + vec3(0.83, 0.0, 0.55) * Ripple * 0.04 * SandW * AridFlat * DetailFade);

        // ---- studio lighting + crevice & boulder cavity occlusion -------------------------
        float NdotL = dot(Normal, SunDirection);
        float Wrap = SnowW * 0.28 + IceW * 0.20;
        float WrappedNdotL = clamp((NdotL + Wrap) / (1.0 + Wrap), 0.0, 1.0);
        float Shadow = ShadowFactor(WorldPos, GeometricNormal, clamp(NdotLRaw, 0.0, 1.0));

        float CaveSunAtten = exp(-max(CaveDepth - 2.2, 0.0) * 0.14);
        float CaveAmbAtten = mix(0.26, 1.0, exp(-max(CaveDepth - 1.6, 0.0) * 0.075));
        float CaveRimOcc   = 1.0 - 0.24 * smoothstep(0.6, 2.4, CaveDepth) * (1.0 - smoothstep(2.4, 8.0, CaveDepth));

        // Boulder contact ring AO + non-linear crevice cavity darkening.
        float BoulderContactAO = 1.0 - 0.26 * smoothstep(0.05, 0.28, BoulderMask) * (1.0 - smoothstep(0.35, 0.70, BoulderMask));
        float CavityAO = pow(clamp(OcclusionHere, 0.0, 1.0), 1.35) * BoulderContactAO;
        float AmbientOcclusion = mix(0.32, 1.0, CavityAO) * CaveAmbAtten * CaveRimOcc;
        float DirectOcclusion  = mix(0.72, 1.0, CavityAO) * (0.94 + 0.11 * ProtrusionHere) * CaveSunAtten * CaveRimOcc;

        vec3 HemiAmbient = mix(RockLowColour * 0.50, mix(SkyHorizonColour, SkyZenithColour, 0.45), Normal.y * 0.5 + 0.5);
        vec3 Diffuse = Albedo * (SunColour * 1.06 * WrappedNdotL * Shadow * DirectOcclusion + HemiAmbient * 0.48 * AmbientOcclusion);
        vec3 Specular = SunColour * GgxSpecular(Normal, ViewDir, SunDirection, Roughness, vec3(0.04)) * max(NdotL, 0.0) * Shadow;
        vec3 EnvSpecular = mix(SkyHorizonColour, SkyZenithColour, 0.5) * pow(1.0 - max(dot(Normal, ViewDir), 0.0), 3.2)
                         * (1.0 - Roughness) * 0.28 * AmbientOcclusion;

        vec3 Colour = Diffuse + Specular + EnvSpecular;

        // ---- Gaea-style Perched Lakes, Tarns & Flowing Rivers (above sea-level plane) -----
        // Calm reflective water pools only on flat valley floors & tarns (< 23 deg, GeometricNormal.y > 0.92),
        // preventing cartoon turquoise specks from clinging to steep mountain slopes.
        float AridKeep = smoothstep(-15.0, 5.0, WaterLevel);
        float WaterCover = smoothstep(0.22, 0.42, WaterHere) * smoothstep(0.90, 0.965, GeometricNormal.y)
                         * AridKeep * (1.0 - SnowW * 0.88) * (1.0 - InsideCave);
        if (WaterCover > 0.005)
        {
            float WaterDepth01 = clamp((WaterHere - 0.20) / 0.70, 0.0, 1.0);
            float Absorption   = 1.0 - exp(-WaterDepth01 * 2.8);
            vec3 WaterBodyCol  = mix(WaterTint * 1.04, WaterTint * 0.36, Absorption);

            vec2 WaveCoord = XZ * 0.18 + vec2(TimeSeconds * 0.04, -TimeSeconds * 0.03);
            vec3 RippleVec = vec3((HashNoise(WaveCoord) - 0.5) * 0.04 * DetailFade, 1.0, (HashNoise(WaveCoord + 19.3) - 0.5) * 0.04 * DetailFade);
            vec3 WaterNormal = normalize(mix(GeometricNormal, normalize(RippleVec), smoothstep(0.84, 0.98, GeometricNormal.y)));

            vec3 ReflDir = reflect(-ViewDir, WaterNormal);
            vec3 WaterSkyRefl = mix(SkyHorizonColour, SkyZenithColour, pow(max(ReflDir.y, 0.0), 0.5));
            float WaterFresnel = 0.02 + 0.98 * pow(1.0 - max(dot(WaterNormal, ViewDir), 0.0), 5.0);
            vec3 WaterSunSpec = SunColour * GgxSpecular(WaterNormal, ViewDir, SunDirection, mix(0.07, 0.32, 1.0 - DetailFade), vec3(0.02))
                              * max(dot(WaterNormal, SunDirection), 0.0) * Shadow;

            vec3 LitWater = mix(WaterBodyCol, WaterSkyRefl, WaterFresnel * 0.78) + WaterSunSpec;
            float RapidGrade = smoothstep(0.95, 0.84, GeometricNormal.y) * smoothstep(0.76, 0.92, FlowHere);
            float FoamMask   = clamp(RapidGrade * smoothstep(0.45, 0.80, HashNoise(XZ * 0.30)) * 0.65, 0.0, 0.65);
            LitWater = mix(LitWater, vec3(0.90, 0.94, 0.96), FoamMask);

            float WaterAlpha = clamp(mix(0.42, 0.94, Absorption) + WaterFresnel * 0.25, 0.0, 0.95) * WaterCover;
            Colour = mix(Colour, LitWater, WaterAlpha);
        }

        // Inspected-channel tint overlay (while painting channels).
        if (OverlayAmount > 0.001)
        {
            float OverlayReading = SampleChannelBilinear(OverlayTex, 0, XZ);
            Colour = mix(Colour, OverlayTint * (0.35 + 0.65 * clamp(NdotLRaw, 0.0, 1.0)) * 1.4,
                         clamp(OverlayReading, 0.0, 1.0) * OverlayAmount);
        }

        return ApplyFog(Colour, WorldPos, CameraPos);
    }
`;

const TerrainFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    precision highp int;
    ${""}
    in vec3 WorldPosition;
    in vec2 WorldXZ;
    out vec4 OutColour;
    uniform vec3 CameraPosition;
    uniform vec3 BrushCentre;
    uniform float BrushRadius;
    uniform float BrushFalloff;
    uniform float BrushVisible;
    uniform float ShowGrid;
    ${SharedGlsl}
    ${SurfaceFragmentCore}

    void main()
    {
        vec2 XZ = WorldXZ;
        // Cut open the heightmap skin wherever a 3D SDF cave mouth breaches the surface so the
        // 3D Surface-Nets voxel cavern behind it is visible.
        float CaveCut = SampleChannelBilinear(FieldTexC, 2, XZ);
        if (CaveCut > 0.42)
            discard;

        // Crisp central difference including sub-texel crag displacement at 2K/4K quality.
        float QScale = max(QualityDetailScale, 1.0);
        float ProHere = SampleChannelBilinear(FieldTexC, 1, XZ);
        float E = FieldTexel * (1.05 / sqrt(QScale));
        float H0  = SampleDetailedHeight(XZ, ProHere, QScale);
        float Hx1 = SampleDetailedHeight(XZ + vec2(E, 0.0), ProHere, QScale);
        float Hx0 = SampleDetailedHeight(XZ - vec2(E, 0.0), ProHere, QScale);
        float Hz1 = SampleDetailedHeight(XZ + vec2(0.0, E), ProHere, QScale);
        float Hz0 = SampleDetailedHeight(XZ - vec2(0.0, E), ProHere, QScale);
        vec3 FineNormal = normalize(vec3(-(Hx1 - Hx0) / (2.0 * E), 1.0, -(Hz1 - Hz0) / (2.0 * E)));

        // Only relax V-seam normals on near-flat valley bottoms (FineNormal.y > 0.88), never on steep couloirs or rock outcrops.
        float E2 = FieldTexel * 1.75;
        float Sx1 = SampleHeight(XZ + vec2(E2, 0.0));
        float Sx0 = SampleHeight(XZ - vec2(E2, 0.0));
        float Sz1 = SampleHeight(XZ + vec2(0.0, E2));
        float Sz0 = SampleHeight(XZ - vec2(0.0, E2));
        vec3 SmoothNormal = normalize(vec3(-(Sx1 - Sx0) / (2.0 * E2), 1.0, -(Sz1 - Sz0) / (2.0 * E2)));
        float ValleyBottom = smoothstep(0.88, 0.96, FineNormal.y);
        float Concavity = clamp((0.25 * (Sx1 + Sx0 + Sz1 + Sz0) - H0) / 4.5, 0.0, 1.0) * ValleyBottom;
        vec3 GeometricNormal = normalize(mix(FineNormal, SmoothNormal, Concavity * 0.24));

        vec3 Colour = ShadeSurface(WorldPosition, GeometricNormal, CameraPosition);
        vec3 FinalColour = Tonemap(Colour);

        if (ShowGrid > 0.5)
        {
            vec2 GridPos = abs(fract(XZ / 32.0) - 0.5);
            float Line = smoothstep(0.48, 0.5, max(GridPos.x, GridPos.y));
            FinalColour = mix(FinalColour, vec3(0.9), Line * 0.14);
        }

        if (BrushVisible > 0.5)
        {
            float Distance = length(XZ - BrushCentre.xz);
            float Ring = 1.0 - smoothstep(0.0, 2.2 + BrushRadius * 0.012, abs(Distance - BrushRadius));
            float InnerRing = 1.0 - smoothstep(0.0, 1.4 + BrushRadius * 0.008, abs(Distance - BrushRadius * BrushFalloff));
            float Disc = (1.0 - smoothstep(BrushRadius * BrushFalloff, BrushRadius, Distance)) * 0.10;
            vec3 Accent = vec3(0.24, 0.77, 0.43);
            FinalColour = mix(FinalColour, Accent, clamp(Ring * 0.9 + InnerRing * 0.45, 0.0, 1.0));
            FinalColour += Accent * Disc;
        }

        OutColour = vec4(FinalColour, 1.0);
    }
`;

const StampVertexGlsl = /* glsl */`#version 300 es
    precision highp float;
    uniform mat4 ViewProjection;
    layout(location = 0) in vec3 Position;
    layout(location = 1) in vec3 Normal;
    out vec3 WorldPosition;
    out vec3 WorldNormal;
    void main()
    {
        WorldPosition = Position;
        WorldNormal = Normal;
        gl_Position = ViewProjection * vec4(Position, 1.0);
    }
`;

const StampFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    precision highp int;
    in vec3 WorldPosition;
    in vec3 WorldNormal;
    out vec4 OutColour;
    uniform vec3 CameraPosition;
    uniform vec3 BrushCentre;
    uniform float BrushRadius;
    uniform float BrushFalloff;
    uniform float BrushVisible;
    ${SharedGlsl}
    ${SurfaceFragmentCore}
    void main()
    {
        if (!gl_FrontFacing)
            discard;
        vec3 N = normalize(WorldNormal);
        vec3 Colour = ShadeSurface(WorldPosition, N, CameraPosition);
        vec3 FinalColour = Tonemap(Colour);
        if (BrushVisible > 0.5)
        {
            float Distance = length(WorldPosition.xz - BrushCentre.xz);
            float Ring = 1.0 - smoothstep(0.0, 2.2 + BrushRadius * 0.012, abs(Distance - BrushRadius));
            vec3 Accent = vec3(0.24, 0.77, 0.43);
            FinalColour = mix(FinalColour, Accent, clamp(Ring * 0.85, 0.0, 1.0));
        }
        OutColour = vec4(FinalColour, 1.0);
    }
`;

const DepthFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    void main() { }
`;

// Sphere-traced density terrain: the heightfield becomes an implicit surface
// (density = y - h(x,z) - detail) and is raymarched per-pixel, so shading normals come from the
// density gradient itself — one continuous smooth surface with no mesh tessellation and no
// texel stair-stepping. Procedural detail octaves inside the density add relief the 1024²
// heightmap cannot hold, each fading in as the camera closes in. Hits write gl_FragDepth so
// stamps, water and the brush ring composite exactly as they do against the mesh.
const RaymarchFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    precision highp int;
    in vec2 Ndc;
    out vec4 OutColour;
    uniform vec3 CameraPosition;
    uniform vec3 CameraRight;
    uniform vec3 CameraUp;
    uniform vec3 CameraForward;
    uniform float TanHalfFov;
    uniform float Aspect;
    uniform mat4 ViewProjection;
    uniform float RaymarchSteps;
    uniform float RaymarchDetail;
    uniform vec3 BrushCentre;
    uniform float BrushRadius;
    uniform float BrushFalloff;
    uniform float BrushVisible;
    uniform float ShowGrid;
    ${SharedGlsl}
    ${SurfaceFragmentCore}

    float TraceDetail(vec2 XZ, float Distance)
    {
        float Sum = 0.0;
        Sum += (HashNoise(XZ * (1.0 / 26.0)) * 2.0 - 1.0) * 1.05 * exp(-Distance / 1600.0);
        Sum += (HashNoise(XZ * (1.0 / 13.0) + 4.7) * 2.0 - 1.0) * 0.52 * exp(-Distance / 850.0);
        Sum += (HashNoise(XZ * (1.0 / 6.5) + 9.3) * 2.0 - 1.0) * 0.26 * exp(-Distance / 450.0);
        Sum += (HashNoise(XZ * (1.0 / 3.2) + 2.9) * 2.0 - 1.0) * 0.13 * exp(-Distance / 240.0);
        return Sum * RaymarchDetail;
    }

    // 📝 Ported from Slate CliffGenerator src/sdf-chunks.js + src/detail.js:
    //    3D density evaluation with vertical wall shear, caprock overhang lips, soft-bed undercuts,
    //    3D buttresses, and staggered brickwork cliff courses evaluated at 3D elevation P.y.
    float TerrainDensity(vec3 P, float Distance)
    {
        float Step = 5.5;
        float HxP = SampleHeight(P.xz + vec2(Step, 0.0));
        float HxM = SampleHeight(P.xz - vec2(Step, 0.0));
        float HzP = SampleHeight(P.xz + vec2(0.0, Step));
        float HzM = SampleHeight(P.xz - vec2(0.0, Step));
        vec2 Grad = vec2((HxP - HxM) / (2.0 * Step), (HzP - HzM) / (2.0 * Step));
        float Slope = length(Grad);
        vec2 OutDir = Slope > 0.001 ? (-Grad / Slope) : vec2(0.0);
        float Steep = smoothstep(0.52, 1.32, Slope);

        // Vertical wall shear + 3D caprock overhang / soft-bed undercut at elevation P.y:
        float CliffShift = 0.0;
        if (Steep > 0.01)
        {
            float Band = max(StrataBand, 6.0);
            float Warp = (HashNoise(P.xz * 0.009) - 0.5) * Band * 0.45;
            float BedPhase = (P.y + Warp) / Band * 6.2831853;
            float Hardness = SampleChannelBilinear(FieldTexB, 2, P.xz);
            float BedLip = (Hardness - 0.44) * 1.85 + 0.55 * cos(BedPhase);
            float Buttress = (HashNoise(P.xz * 0.025 + vec2(P.y * 0.018, -P.y * 0.014)) * 2.0 - 1.0) * 1.15;
            float CourseIdx = floor((P.y + Warp) / (Band * 0.42));
            float StrikeU = dot(P.xz, vec2(-OutDir.y, OutDir.x)) + mod(CourseIdx, 2.0) * 7.5;
            float BlockCell = floor(StrikeU / 15.0);
            float SeamU = abs(fract(StrikeU / 15.0) - 0.5);
            float SeamY = abs(fract((P.y + Warp) / (Band * 0.42)) - 0.5);
            float Groove = smoothstep(0.44, 0.50, max(SeamU, SeamY)) * 0.75;
            float BlockJut = ((HashGrid(vec2(BlockCell, CourseIdx)) - 0.48) * 1.35 - Groove) * (0.35 + 0.65 * StrataContrast);
            CliffShift = Steep * (BedLip * 2.1 * (0.45 + 0.55 * StrataContrast) + Buttress + BlockJut);
            CliffShift = clamp(CliffShift, -3.2, 3.8);
        }

        vec2 SampleXZ = P.xz - OutDir * CliffShift;
        float H0 = SampleHeight(SampleXZ);
        float HAvg = 0.25 * (HxP + HxM + HzP + HzM);
        float ValleyConcave = max(HAvg - H0, 0.0) * (1.0 - Steep) * 0.36;
        float ProHere = SampleChannelBilinear(FieldTexC, 1, P.xz);
        float HornLift = smoothstep(0.50, 0.90, ProHere) * 1.55;
        float HEff = H0 + ValleyConcave + HornLift;
        return P.y - HEff - TraceDetail(P.xz, Distance);
    }

    vec3 TraceNormal(vec3 P, float Distance)
    {
        float E = max(0.35, Distance * 0.0016);
        vec2 K = vec2(1.0, -1.0);
        return normalize(K.xyy * TerrainDensity(P + K.xyy * E, Distance)
                       + K.yyx * TerrainDensity(P + K.yyx * E, Distance)
                       + K.yxy * TerrainDensity(P + K.yxy * E, Distance)
                       + K.xxx * TerrainDensity(P + K.xxx * E, Distance));
    }

    void main()
    {
        vec3 Ro = CameraPosition;
        vec3 Rd = normalize(CameraForward + (CameraRight * (Ndc.x * Aspect) + CameraUp * Ndc.y) * TanHalfFov);

        // Clip the march to the terrain bounding box; misses leave sky/water/stamps to their draws.
        vec3 BoxMin = vec3(-FieldExtent * 0.5, HeightRange.x - 30.0, -FieldExtent * 0.5);
        vec3 BoxMax = vec3( FieldExtent * 0.5, HeightRange.y + 30.0,  FieldExtent * 0.5);
        vec3 InvRd = 1.0 / Rd;
        vec3 TSmalls = min((BoxMin - Ro) * InvRd, (BoxMax - Ro) * InvRd);
        vec3 TBigs   = max((BoxMin - Ro) * InvRd, (BoxMax - Ro) * InvRd);
        float TNear = max(max(TSmalls.x, TSmalls.y), TSmalls.z);
        float TFar  = min(min(TBigs.x, TBigs.y), TBigs.z);
        if (TFar <= max(TNear, 0.0))
            discard;

        float T = max(TNear, 0.0);
        float PrevT = T;
        float HitT = -1.0;
        int MaxSteps = int(RaymarchSteps);
        for (int StepIndex = 0; StepIndex < 512; StepIndex++)
        {
            if (StepIndex >= MaxSteps || T > TFar)
                break;
            float D = TerrainDensity(Ro + Rd * T, T);
            if (D < 0.0)
            {
                float Lo = PrevT;
                float Hi = T;
                for (int Refine = 0; Refine < 5; Refine++)
                {
                    float Mid = (Lo + Hi) * 0.5;
                    if (TerrainDensity(Ro + Rd * Mid, Mid) < 0.0) Hi = Mid; else Lo = Mid;
                }
                HitT = (Lo + Hi) * 0.5;
                break;
            }
            PrevT = T;
            float Relax = 0.62 / (1.0 + 0.55 * RaymarchDetail * exp(-T / 700.0));
            T += max(D * Relax, 0.35 + T * 0.0012);
        }
        if (HitT < 0.0)
            discard;

        vec3 P = Ro + Rd * HitT;
        if (SampleChannelBilinear(FieldTexC, 2, P.xz) > 0.42)
            discard;
        vec3 Normal = TraceNormal(P, HitT);
        vec3 Colour = ShadeSurface(P, Normal, CameraPosition);
        vec3 FinalColour = Tonemap(Colour);

        if (ShowGrid > 0.5)
        {
            vec2 GridPos = abs(fract(P.xz / 32.0) - 0.5);
            float Line = smoothstep(0.48, 0.5, max(GridPos.x, GridPos.y));
            FinalColour = mix(FinalColour, vec3(0.9), Line * 0.14);
        }

        if (BrushVisible > 0.5)
        {
            float Distance = length(P.xz - BrushCentre.xz);
            float Ring = 1.0 - smoothstep(0.0, 2.2 + BrushRadius * 0.012, abs(Distance - BrushRadius));
            float InnerRing = 1.0 - smoothstep(0.0, 1.4 + BrushRadius * 0.008, abs(Distance - BrushRadius * BrushFalloff));
            float Disc = (1.0 - smoothstep(BrushRadius * BrushFalloff, BrushRadius, Distance)) * 0.10;
            vec3 Accent = vec3(0.24, 0.77, 0.43);
            FinalColour = mix(FinalColour, Accent, clamp(Ring * 0.9 + InnerRing * 0.45, 0.0, 1.0));
            FinalColour += Accent * Disc;
        }

        vec4 Clip = ViewProjection * vec4(P, 1.0);
        gl_FragDepth = (Clip.z / Clip.w) * 0.5 + 0.5;
        OutColour = vec4(FinalColour, 1.0);
    }
`;

const SkyVertexGlsl = /* glsl */`#version 300 es
    precision highp float;
    out vec2 Ndc;
    void main()
    {
        vec2 P = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        Ndc = P * 2.0 - 1.0;
        gl_Position = vec4(Ndc, 0.99999, 1.0);
    }
`;

const SkyFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    in vec2 Ndc;
    out vec4 OutColour;
    uniform vec3 CameraRight;
    uniform vec3 CameraUp;
    uniform vec3 CameraForward;
    uniform float TanHalfFov;
    uniform float Aspect;
    uniform vec3 SunDirection;
    uniform vec3 SunColour;
    uniform vec3 SkyZenithColour;
    uniform vec3 SkyHorizonColour;
    uniform vec3 FogColour;
    uniform float TimeSeconds;
    uniform float Exposure;
    uniform float CloudAmount;

    float SkyHash(vec2 P)
    {
        vec3 P3 = fract(vec3(P.xyx) * 0.1031);
        P3 += dot(P3, P3.yzx + 33.33);
        return fract((P3.x + P3.y) * P3.z);
    }
    float SkyNoise(vec2 P)
    {
        vec2 I = floor(P);
        vec2 F = fract(P);
        vec2 U = F * F * (3.0 - 2.0 * F);
        return mix(mix(SkyHash(I), SkyHash(I + vec2(1, 0)), U.x),
                   mix(SkyHash(I + vec2(0, 1)), SkyHash(I + vec2(1, 1)), U.x), U.y);
    }
    float SkyFbm(vec2 P)
    {
        float Sum = 0.0;
        float Amp = 0.5;
        for (int I = 0; I < 5; I++)
        {
            Sum += Amp * SkyNoise(P);
            P = P * 2.07 + 13.1;
            Amp *= 0.52;
        }
        return Sum;
    }

    void main()
    {
        vec3 Dir = normalize(CameraForward + CameraRight * Ndc.x * TanHalfFov * Aspect + CameraUp * Ndc.y * TanHalfFov);
        float Elevation = clamp(Dir.y, -1.0, 1.0);
        vec3 Colour = mix(SkyHorizonColour, SkyZenithColour, pow(max(Elevation, 0.0), 0.40));
        float BelowHorizon = 1.0 - smoothstep(-0.08, 0.06, Elevation);
        float DeepGround = 1.0 - smoothstep(-0.45, -0.05, Elevation);
        vec3 GroundHaze = mix(FogColour * 0.86, FogColour * vec3(0.38, 0.36, 0.34), DeepGround);
        Colour = mix(Colour, GroundHaze, BelowHorizon);

        float SunDot = dot(Dir, SunDirection);
        float Disc = smoothstep(0.99955, 0.99985, SunDot);
        float Glow = pow(max(SunDot, 0.0), 220.0) * 0.5 + pow(max(SunDot, 0.0), 8.0) * 0.10;
        Colour += SunColour * (Disc * 14.0 + Glow);

        if (Dir.y > 0.015 && CloudAmount > 0.001)
        {
            vec2 CloudUV = Dir.xz / (Dir.y + 0.14) * 0.85 + vec2(TimeSeconds * 0.0022, TimeSeconds * 0.0009);
            float Field = SkyFbm(CloudUV * 1.35);
            float Cover = smoothstep(0.58 - CloudAmount * 0.22, 0.80 - CloudAmount * 0.22, Field);
            float HorizonFade = smoothstep(0.015, 0.16, Dir.y);
            vec3 CloudColour = mix(SkyHorizonColour * 0.82, vec3(1.02, 1.0, 0.98), 0.55 + 0.45 * pow(max(SunDot, 0.0), 3.0));
            Colour = mix(Colour, CloudColour * (0.75 + 0.35 * Field), Cover * HorizonFade * 0.75);
        }

        vec3 X = Colour * Exposure;
        vec3 Mapped = clamp((X * (2.51 * X + 0.03)) / (X * (2.43 * X + 0.59) + 0.14), 0.0, 1.0);
        OutColour = vec4(pow(Mapped, vec3(1.0 / 2.2)), 1.0);
    }
`;

const WaterVertexGlsl = /* glsl */`#version 300 es
    precision highp float;
    uniform mat4 ViewProjection;
    uniform float WaterLevel;
    layout(location = 0) in vec2 PlaneCoord;
    out vec3 WorldPosition;
    void main()
    {
        WorldPosition = vec3(PlaneCoord.x, WaterLevel, PlaneCoord.y);
        gl_Position = ViewProjection * vec4(WorldPosition, 1.0);
    }
`;

const WaterFragmentGlsl = /* glsl */`#version 300 es
    precision highp float;
    precision highp int;
    in vec3 WorldPosition;
    out vec4 OutColour;
    uniform vec3 CameraPosition;
    ${SharedGlsl}

    float WaterBump(vec2 P)
    {
        return NoiseOctaves(P, 3);
    }

    void main()
    {
        vec2 XZ = WorldPosition.xz;
        if (abs(XZ.x) > FieldExtent * 0.499 || abs(XZ.y) > FieldExtent * 0.499)
            discard;
        float TerrainHeight = SampleHeight(XZ);
        float DepthBelow = WaterLevel - TerrainHeight;
        if (DepthBelow < -0.05)
            discard;

        vec2 FlowP = XZ * 0.055 + vec2(TimeSeconds * 0.021, TimeSeconds * 0.013);
        float Eps = 0.55;
        float B0 = WaterBump(FlowP);
        float Bx = WaterBump(FlowP + vec2(Eps, 0.0));
        float Bz = WaterBump(FlowP + vec2(0.0, Eps));
        float B0b = WaterBump(XZ * 0.16 - vec2(TimeSeconds * 0.03, 0.0));
        // Wave detail must die with distance: unfaded, the per-pixel noise normal aliases into
        // sparkling static across the whole sea when the camera sits kilometres away.
        float DetailFade = exp(-length(CameraPosition - WorldPosition) * 0.0012);
        vec3 Normal = normalize(vec3(((B0 - Bx) * 1.4 + (B0b - 0.5) * 0.08) * DetailFade, 1.0, (B0 - Bz) * 1.4 * DetailFade));

        vec3 ViewDir = normalize(CameraPosition - WorldPosition);
        float Fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(Normal, ViewDir), 0.0), 5.0);
        vec3 ReflectedDir = reflect(-ViewDir, Normal);
        vec3 SkyReflection = mix(SkyHorizonColour, SkyZenithColour, pow(max(ReflectedDir.y, 0.0), 0.5));

        float Absorption = 1.0 - exp(-max(DepthBelow, 0.0) * 0.16);
        vec3 Body = mix(WaterTint * 1.7, WaterTint * 0.55, Absorption);
        float StreamFlow = SampleChannelBilinear(FieldTexA, 0, XZ);
        Body = mix(Body, WaterTint * 1.2, smoothstep(0.6, 0.95, StreamFlow) * 0.3);

        vec3 Specular = SunColour * GgxSpecular(Normal, ViewDir, SunDirection, mix(0.07, 0.38, 1.0 - DetailFade), vec3(0.02)) * max(dot(Normal, SunDirection), 0.0);
        float FoamBand = 1.0 - smoothstep(0.0, 0.85, DepthBelow);
        float FoamPattern = smoothstep(0.58, 0.85, NoiseOctaves(XZ * 0.33 + TimeSeconds * 0.045, 3)) * FoamBand;
        vec3 Colour = mix(Body, SkyReflection, Fresnel) + Specular;
        Colour = mix(Colour, vec3(0.92, 0.95, 0.96), FoamPattern * 0.65);
        float Alpha = clamp(mix(0.42, 0.97, Absorption) + Fresnel * 0.3, 0.0, 0.98);
        Colour = ApplyFog(Colour, WorldPosition, CameraPosition);
        OutColour = vec4(Tonemap(Colour), Alpha);
    }
`;

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  RASTERIZATION HOST
//--------------------------------------------------------------------------------------------------------------------------------------------

const GridSegments = 768;

export class ReliefRasterization
{
    constructor(Canvas)
    {
        this.Canvas = Canvas;
        const Gl = Canvas.getContext("webgl2", { antialias: true, depth: true, powerPreference: "high-performance" });
        if (!Gl)
            throw new Error("WebGL2 unavailable");
        this.Gl = Gl;
        this.Camera = new OrbitCamera();
        this.FovRadians = 55.0 * Math.PI / 180.0;
        this.Environment = null;
        this.StampVertexCount = 0;
        this.StampIndexCount = 0;
        this.OverlayTint = [1.0, 0.45, 0.2];
        this.HeightRange = [0, 1];
        this.StrataBand = 26.0;
        this.UseRaymarch = false;
        this.RaymarchSteps = 220;
        this.RaymarchDetail = 1.0;
        this.QualityId = "1024";
        this.ActiveGridSegments = GridSegments;
        this.QualityDetailScale = 1.0;
        this.PackScratch = new Float32Array(Resolution * Resolution * 4);

        this.ConstructPrograms();
        this.ConstructGeometry();
        this.ConstructTextures();
        this.ConstructShadowTarget();
    }

    CompileShader(Type, Source)
    {
        const Gl = this.Gl;
        const Shader = Gl.createShader(Type);
        Gl.shaderSource(Shader, Source);
        Gl.compileShader(Shader);
        if (!Gl.getShaderParameter(Shader, Gl.COMPILE_STATUS))
        {
            const Log = Gl.getShaderInfoLog(Shader);
            console.error(Log, Source);
            throw new Error("Shader compilation failed: " + Log);
        }
        return Shader;
    }

    LinkProgram(VertexSource, FragmentSource)
    {
        const Gl = this.Gl;
        const Program = Gl.createProgram();
        Gl.attachShader(Program, this.CompileShader(Gl.VERTEX_SHADER, VertexSource));
        Gl.attachShader(Program, this.CompileShader(Gl.FRAGMENT_SHADER, FragmentSource));
        Gl.linkProgram(Program);
        if (!Gl.getProgramParameter(Program, Gl.LINK_STATUS))
            throw new Error("Program link failed: " + Gl.getProgramInfoLog(Program));
        const Uniforms = {};
        const Count = Gl.getProgramParameter(Program, Gl.ACTIVE_UNIFORMS);
        for (let Index = 0; Index < Count; Index++)
        {
            const Info = Gl.getActiveUniform(Program, Index);
            Uniforms[Info.name] = Gl.getUniformLocation(Program, Info.name);
        }
        return { Program, Uniforms };
    }

    ConstructPrograms()
    {
        this.TerrainProgram = this.LinkProgram(TerrainVertexGlsl, TerrainFragmentGlsl);
        this.StampProgram   = this.LinkProgram(StampVertexGlsl, StampFragmentGlsl);
        this.TerrainDepthProgram = this.LinkProgram(TerrainVertexGlsl, DepthFragmentGlsl);
        this.StampDepthProgram   = this.LinkProgram(StampVertexGlsl, DepthFragmentGlsl);
        this.SkyProgram    = this.LinkProgram(SkyVertexGlsl, SkyFragmentGlsl);
        this.WaterProgram  = this.LinkProgram(WaterVertexGlsl, WaterFragmentGlsl);
        this.RaymarchProgram = this.LinkProgram(SkyVertexGlsl, RaymarchFragmentGlsl);
    }

    RebuildTerrainGrid(Segments)
    {
        const Gl = this.Gl;
        this.ActiveGridSegments = Segments;
        const VertCount = (Segments + 1) * (Segments + 1);
        const GridCoords = new Float32Array(VertCount * 2);
        let Cursor = 0;
        for (let Z = 0; Z <= Segments; Z++)
        {
            for (let X = 0; X <= Segments; X++)
            {
                GridCoords[Cursor++] = X;
                GridCoords[Cursor++] = Z;
            }
        }
        const Indices = new Uint32Array(Segments * Segments * 6);
        Cursor = 0;
        const RowVerts = Segments + 1;
        for (let Z = 0; Z < Segments; Z++)
        {
            for (let X = 0; X < Segments; X++)
            {
                const A = Z * RowVerts + X;
                const B = A + 1;
                const C = A + RowVerts;
                const D = C + 1;
                Indices[Cursor++] = A; Indices[Cursor++] = C; Indices[Cursor++] = B;
                Indices[Cursor++] = B; Indices[Cursor++] = C; Indices[Cursor++] = D;
            }
        }
        if (!this.TerrainVao)
            this.TerrainVao = Gl.createVertexArray();
        Gl.bindVertexArray(this.TerrainVao);
        if (!this.TerrainGridBuffer)
            this.TerrainGridBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ARRAY_BUFFER, this.TerrainGridBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, GridCoords, Gl.STATIC_DRAW);
        Gl.enableVertexAttribArray(0);
        Gl.vertexAttribPointer(0, 2, Gl.FLOAT, false, 0, 0);
        if (!this.TerrainIndexBuffer)
            this.TerrainIndexBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ELEMENT_ARRAY_BUFFER, this.TerrainIndexBuffer);
        Gl.bufferData(Gl.ELEMENT_ARRAY_BUFFER, Indices, Gl.STATIC_DRAW);
        this.TerrainIndexCount = Indices.length;
        Gl.bindVertexArray(null);
    }

    SetQuality(QualityId)
    {
        this.QualityId = String(QualityId);
        if (this.QualityId === "512")
        {
            this.RebuildTerrainGrid(448);
            this.QualityDetailScale = 0.78;
            this.RaymarchSteps = 150;
        }
        else if (this.QualityId === "2048")
        {
            this.RebuildTerrainGrid(1024);
            this.QualityDetailScale = 1.45;
            this.RaymarchSteps = 300;
        }
        else if (this.QualityId === "4096")
        {
            this.RebuildTerrainGrid(1280);
            this.QualityDetailScale = 2.05;
            this.RaymarchSteps = 380;
        }
        else
        {
            this.QualityId = "1024";
            this.RebuildTerrainGrid(768);
            this.QualityDetailScale = 1.0;
            this.RaymarchSteps = 220;
        }
    }

    ConstructGeometry()
    {
        const Gl = this.Gl;
        this.RebuildTerrainGrid(GridSegments);

        // Water plane covering the field plus a margin.
        const Reach = WorldExtent * 0.5;
        const Plane = new Float32Array([-Reach, -Reach, Reach, -Reach, -Reach, Reach, Reach, Reach]);
        this.WaterVao = Gl.createVertexArray();
        Gl.bindVertexArray(this.WaterVao);
        const PlaneBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ARRAY_BUFFER, PlaneBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, Plane, Gl.STATIC_DRAW);
        Gl.enableVertexAttribArray(0);
        Gl.vertexAttribPointer(0, 2, Gl.FLOAT, false, 0, 0);
        Gl.bindVertexArray(null);

        this.SkyVao = Gl.createVertexArray();

        // Stamp surface buffers, refilled per polygonise.
        this.StampVao = Gl.createVertexArray();
        Gl.bindVertexArray(this.StampVao);
        this.StampPositionBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ARRAY_BUFFER, this.StampPositionBuffer);
        Gl.enableVertexAttribArray(0);
        Gl.vertexAttribPointer(0, 3, Gl.FLOAT, false, 0, 0);
        this.StampNormalBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ARRAY_BUFFER, this.StampNormalBuffer);
        Gl.enableVertexAttribArray(1);
        Gl.vertexAttribPointer(1, 3, Gl.FLOAT, false, 0, 0);
        this.StampIndexBuffer = Gl.createBuffer();
        Gl.bindBuffer(Gl.ELEMENT_ARRAY_BUFFER, this.StampIndexBuffer);
        Gl.bindVertexArray(null);
    }

    ConstructFloatTexture(Components)
    {
        const Gl = this.Gl;
        const Texture = Gl.createTexture();
        Gl.bindTexture(Gl.TEXTURE_2D, Texture);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.NEAREST);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.NEAREST);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
        if (Components === 4)
            Gl.texImage2D(Gl.TEXTURE_2D, 0, Gl.RGBA32F, Resolution, Resolution, 0, Gl.RGBA, Gl.FLOAT, null);
        else
            Gl.texImage2D(Gl.TEXTURE_2D, 0, Gl.R32F, Resolution, Resolution, 0, Gl.RED, Gl.FLOAT, null);
        Gl.bindTexture(Gl.TEXTURE_2D, null);
        return Texture;
    }

    ConstructTextures()
    {
        this.HeightTex  = this.ConstructFloatTexture(1);
        this.FieldTexA  = this.ConstructFloatTexture(4);
        this.FieldTexB  = this.ConstructFloatTexture(4);
        this.FieldTexC  = this.ConstructFloatTexture(4);
        this.PaintTex   = this.ConstructFloatTexture(4);
        this.OverlayTex = this.ConstructFloatTexture(1);
        this.ZeroSamples = new Float32Array(Resolution * Resolution);
    }

    ConstructShadowTarget()
    {
        const Gl = this.Gl;
        const Size = 2048;
        this.ShadowTexture = Gl.createTexture();
        Gl.bindTexture(Gl.TEXTURE_2D, this.ShadowTexture);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.LINEAR);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.LINEAR);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
        Gl.texImage2D(Gl.TEXTURE_2D, 0, Gl.DEPTH_COMPONENT32F, Size, Size, 0, Gl.DEPTH_COMPONENT, Gl.FLOAT, null);
        this.ShadowFramebuffer = Gl.createFramebuffer();
        Gl.bindFramebuffer(Gl.FRAMEBUFFER, this.ShadowFramebuffer);
        Gl.framebufferTexture2D(Gl.FRAMEBUFFER, Gl.DEPTH_ATTACHMENT, Gl.TEXTURE_2D, this.ShadowTexture, 0);
        Gl.drawBuffers([Gl.NONE]);
        Gl.readBuffer(Gl.NONE);
        Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
        Gl.bindTexture(Gl.TEXTURE_2D, null);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              UPLOADS
    //--------------------------------------------------------------------------------------------------------

    PackAndUpload(Texture, SourceA, SourceB, SourceC, SourceD)
    {
        const Gl = this.Gl;
        const Pack = this.PackScratch;
        const Count = Resolution * Resolution;
        for (let Index = 0; Index < Count; Index++)
        {
            Pack[Index * 4]     = SourceA[Index];
            Pack[Index * 4 + 1] = SourceB[Index];
            Pack[Index * 4 + 2] = SourceC[Index];
            Pack[Index * 4 + 3] = SourceD[Index];
        }
        Gl.bindTexture(Gl.TEXTURE_2D, Texture);
        Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, Resolution, Resolution, Gl.RGBA, Gl.FLOAT, Pack);
        Gl.bindTexture(Gl.TEXTURE_2D, null);
    }

    // 📝 Heights upload alone — a straight texSubImage of the field array, no interleave packing.
    //    This is what makes sculpt strokes feel like clay instead of concrete.
    UploadHeights(Field)
    {
        const Gl = this.Gl;
        Gl.bindTexture(Gl.TEXTURE_2D, this.HeightTex);
        Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, Resolution, Resolution, Gl.RED, Gl.FLOAT, Field.Heights);
        Gl.bindTexture(Gl.TEXTURE_2D, null);
        this.HeightRange = [Field.Minimum, Field.Maximum];
    }

    UploadField(Field)
    {
        this.UploadHeights(Field);
        this.PackAndUpload(this.FieldTexA,
            Field.ChannelSamples("Flow"),
            Field.ChannelSamples("Water"),
            Field.ChannelSamples("Snow"),
            Field.ChannelSamples("Moisture"));
        this.PackAndUpload(this.FieldTexB,
            Field.ChannelSamples("Wear"),
            Field.ChannelSamples("Deposition"),
            Field.ChannelSamples("Hardness"),
            this.ZeroSamples);
        this.PackAndUpload(this.FieldTexC,
            Field.ChannelSamples("Occlusion"),
            Field.ChannelSamples("Protrusion"),
            Field.ChannelSamples("CaveCutout") || this.ZeroSamples,
            Field.ChannelSamples("Mask") || this.ZeroSamples);
    }

    // Repack whichever packed texture owns a channel (after painting into it).
    UploadChannelGroup(Field, ChannelName)
    {
        if (ChannelName === "Flow" || ChannelName === "Water" || ChannelName === "Snow" || ChannelName === "Moisture")
        {
            this.PackAndUpload(this.FieldTexA,
                Field.ChannelSamples("Flow"),
                Field.ChannelSamples("Water"),
                Field.ChannelSamples("Snow"),
                Field.ChannelSamples("Moisture"));
        }
        else if (ChannelName === "Wear" || ChannelName === "Deposition" || ChannelName === "Hardness")
        {
            this.PackAndUpload(this.FieldTexB,
                Field.ChannelSamples("Wear"),
                Field.ChannelSamples("Deposition"),
                Field.ChannelSamples("Hardness"),
                this.ZeroSamples);
        }
        else
        {
            this.PackAndUpload(this.FieldTexC,
                Field.ChannelSamples("Occlusion"),
                Field.ChannelSamples("Protrusion"),
                Field.ChannelSamples("CaveCutout") || this.ZeroSamples,
                Field.ChannelSamples("Mask") || this.ZeroSamples);
        }
    }

    UploadPaint(Field)
    {
        this.PackAndUpload(this.PaintTex,
            this.ZeroSamples,
            this.ZeroSamples,
            this.ZeroSamples,
            this.ZeroSamples);
    }

    UploadOverlay(Samples, Tint)
    {
        const Gl = this.Gl;
        Gl.bindTexture(Gl.TEXTURE_2D, this.OverlayTex);
        if (Samples)
            Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, Resolution, Resolution, Gl.RED, Gl.FLOAT, Samples);
        else
            Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, Resolution, Resolution, Gl.RED, Gl.FLOAT, new Float32Array(Resolution * Resolution));
        Gl.bindTexture(Gl.TEXTURE_2D, null);
        if (Tint)
            this.OverlayTint = Tint;
    }

    SetStampSurface(Surface)
    {
        const Gl = this.Gl;
        Gl.bindBuffer(Gl.ARRAY_BUFFER, this.StampPositionBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, Surface.Positions, Gl.DYNAMIC_DRAW);
        Gl.bindBuffer(Gl.ARRAY_BUFFER, this.StampNormalBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, Surface.Normals, Gl.DYNAMIC_DRAW);
        Gl.bindBuffer(Gl.ELEMENT_ARRAY_BUFFER, this.StampIndexBuffer);
        Gl.bufferData(Gl.ELEMENT_ARRAY_BUFFER, Surface.Indices, Gl.DYNAMIC_DRAW);
        this.StampVertexCount = Surface.Positions.length / 3;
        this.StampIndexCount = Surface.Indices.length;
    }

    SetEnvironment(Environment)
    {
        this.Environment = Environment;
    }

    SunDirectionVector()
    {
        const Env = this.Environment;
        const Az = Env.SunAzimuth * Math.PI / 180.0;
        const El = Env.SunElevation * Math.PI / 180.0;
        return [Math.cos(El) * Math.sin(Az), Math.sin(El), Math.cos(El) * Math.cos(Az)];
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              FRAME
    //--------------------------------------------------------------------------------------------------------

    BindFieldTextures()
    {
        const Gl = this.Gl;
        Gl.activeTexture(Gl.TEXTURE0);
        Gl.bindTexture(Gl.TEXTURE_2D, this.HeightTex);
        Gl.activeTexture(Gl.TEXTURE1);
        Gl.bindTexture(Gl.TEXTURE_2D, this.FieldTexA);
        Gl.activeTexture(Gl.TEXTURE2);
        Gl.bindTexture(Gl.TEXTURE_2D, this.FieldTexB);
        Gl.activeTexture(Gl.TEXTURE3);
        Gl.bindTexture(Gl.TEXTURE_2D, this.PaintTex);
        Gl.activeTexture(Gl.TEXTURE4);
        Gl.bindTexture(Gl.TEXTURE_2D, this.OverlayTex);
        Gl.activeTexture(Gl.TEXTURE5);
        Gl.bindTexture(Gl.TEXTURE_2D, this.ShadowTexture);
        Gl.activeTexture(Gl.TEXTURE6);
        Gl.bindTexture(Gl.TEXTURE_2D, this.FieldTexC);
        Gl.activeTexture(Gl.TEXTURE0);
    }

    AssignSharedUniforms(ProgramRecord, Options, ShadowVP)
    {
        const Gl = this.Gl;
        const U = ProgramRecord.Uniforms;
        const Env = this.Environment;
        const Sun = this.SunDirectionVector();
        const Set3 = (Name, V) => { if (U[Name]) Gl.uniform3f(U[Name], V[0], V[1], V[2]); };
        const Set1 = (Name, V) => { if (U[Name]) Gl.uniform1f(U[Name], V); };

        if (U.HeightTex) Gl.uniform1i(U.HeightTex, 0);
        if (U.FieldTexA) Gl.uniform1i(U.FieldTexA, 1);
        if (U.FieldTexB) Gl.uniform1i(U.FieldTexB, 2);
        if (U.PaintTex)  Gl.uniform1i(U.PaintTex, 3);
        if (U.OverlayTex) Gl.uniform1i(U.OverlayTex, 4);
        if (U.ShadowTex) Gl.uniform1i(U.ShadowTex, 5);
        if (U.FieldTexC) Gl.uniform1i(U.FieldTexC, 6);

        Set3("SunDirection", Sun);
        Set3("SunColour", [1.05, 0.97, 0.88].map((C) => C * Env.SunIntensity * 0.42));
        Set3("SkyZenithColour", Env.SkyZenith);
        Set3("SkyHorizonColour", Env.SkyHorizon);
        Set3("FogColour", Env.FogColour);
        Set1("FogDensity", Env.FogDensity);
        Set1("WaterLevel", Env.WaterLevel);
        if (U.HeightRange) Gl.uniform2f(U.HeightRange, this.HeightRange[0], this.HeightRange[1]);
        Set1("TimeSeconds", Options.TimeSeconds);
        Set1("Exposure", Env.Exposure);
        if (U.ViewMode) Gl.uniform1i(U.ViewMode, Options.ViewMode);
        Set1("OverlayAmount", Options.OverlayAmount);
        Set3("OverlayTint", this.OverlayTint);
        if (U.ShadowViewProjection) Gl.uniformMatrix4fv(U.ShadowViewProjection, false, ShadowVP);
        Set1("ShadowsEnabled", Options.Shadows ? 1.0 : 0.0);
        Set3("RockLowColour", Env.RockLow);
        Set3("RockHighColour", Env.RockHigh);
        Set3("MeadowColour", Env.MeadowTint);
        Set3("DryColour", Env.DryTint);
        Set3("SandColour", Env.SandTint);
        Set3("ScreeColour", Env.ScreeTint);
        Set3("SnowColour", Env.SnowTint);
        Set1("StrataContrast", Env.StrataContrast);
        Set1("StrataBand", this.StrataBand);
        Set1("Vegetation", Env.Vegetation);
        if (U.CameraPosition) Set3("CameraPosition", this.Camera.Eye);
        if (U.WaterTint) Set3("WaterTint", Env.WaterTint);
        if (Options.Brush && U.BrushCentre)
        {
            Set3("BrushCentre", [Options.Brush.X, Options.Brush.Y, Options.Brush.Z]);
            Set1("BrushRadius", Options.Brush.Radius);
            Set1("BrushFalloff", Options.Brush.Falloff);
            Set1("BrushVisible", Options.Brush.Visible ? 1.0 : 0.0);
        }
        else if (U.BrushVisible)
        {
            Set1("BrushVisible", 0.0);
        }
        Set1("ShowGrid", Options.ShowGrid ? 1.0 : 0.0);
        Set1("CloudAmount", Options.CloudAmount !== undefined ? Options.CloudAmount : 0.4);
        Set1("GridResUniform", this.ActiveGridSegments);
        Set1("QualityDetailScale", this.QualityDetailScale);
    }

    Render(Options)
    {
        const Gl = this.Gl;
        const Env = this.Environment;
        if (!Env)
            return;
        const Width = this.Canvas.width;
        const Height = this.Canvas.height;
        if (Width === 0 || Height === 0)
            return;
        const Aspect = Width / Height;
        const Sun = this.SunDirectionVector();

        const View = LookAtMatrix(this.Camera.Eye,
            [this.Camera.Target.X, this.Camera.Target.Y, this.Camera.Target.Z], [0, 1, 0]);
        const Projection = PerspectiveMatrix(this.FovRadians, Aspect, 1.5, 16000.0);
        const ViewProjection = MultiplyMatrix(Projection, View);

        // Shadow frustum: an orthographic box around the whole field, from the sun.
        const Centre = [0, (this.HeightRange[0] + this.HeightRange[1]) * 0.5, 0];
        const SunEye = [Centre[0] + Sun[0] * 3200, Centre[1] + Sun[1] * 3200, Centre[2] + Sun[2] * 3200];
        const ShadowView = LookAtMatrix(SunEye, Centre, [0, 1, 0]);
        const ShadowProjection = OrthoMatrix(-1750, 1750, -1750, 1750, 200, 6400);
        const ShadowVP = MultiplyMatrix(ShadowProjection, ShadowView);

        Gl.enable(Gl.DEPTH_TEST);
        Gl.depthFunc(Gl.LEQUAL);
        Gl.disable(Gl.BLEND);

        if (Options.Shadows)
        {
            Gl.bindFramebuffer(Gl.FRAMEBUFFER, this.ShadowFramebuffer);
            Gl.viewport(0, 0, 2048, 2048);
            Gl.clear(Gl.DEPTH_BUFFER_BIT);
            this.BindFieldTextures();
            Gl.useProgram(this.TerrainDepthProgram.Program);
            if (this.TerrainDepthProgram.Uniforms.ViewProjection)
                Gl.uniformMatrix4fv(this.TerrainDepthProgram.Uniforms.ViewProjection, false, ShadowVP);
            if (this.TerrainDepthProgram.Uniforms.HeightTex)
                Gl.uniform1i(this.TerrainDepthProgram.Uniforms.HeightTex, 0);
            if (this.TerrainDepthProgram.Uniforms.GridResUniform)
                Gl.uniform1f(this.TerrainDepthProgram.Uniforms.GridResUniform, this.ActiveGridSegments);
            Gl.bindVertexArray(this.TerrainVao);
            Gl.drawElements(Gl.TRIANGLES, this.TerrainIndexCount, Gl.UNSIGNED_INT, 0);
            if (this.StampIndexCount > 0)
            {
                Gl.useProgram(this.StampDepthProgram.Program);
                if (this.StampDepthProgram.Uniforms.ViewProjection)
                    Gl.uniformMatrix4fv(this.StampDepthProgram.Uniforms.ViewProjection, false, ShadowVP);
                Gl.bindVertexArray(this.StampVao);
                Gl.drawElements(Gl.TRIANGLES, this.StampIndexCount, Gl.UNSIGNED_INT, 0);
            }
            Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
        }

        Gl.viewport(0, 0, Width, Height);
        Gl.clearColor(Env.FogColour[0], Env.FogColour[1], Env.FogColour[2], 1.0);
        Gl.clear(Gl.COLOR_BUFFER_BIT | Gl.DEPTH_BUFFER_BIT);
        this.BindFieldTextures();

        // Sky (drawn first, depth at far plane, depth write off).
        Gl.depthMask(false);
        Gl.useProgram(this.SkyProgram.Program);
        this.AssignSharedUniforms(this.SkyProgram, Options, ShadowVP);
        const Basis = this.Camera.Basis();
        const SkyU = this.SkyProgram.Uniforms;
        if (SkyU.CameraRight)   Gl.uniform3f(SkyU.CameraRight, Basis.Right[0], Basis.Right[1], Basis.Right[2]);
        if (SkyU.CameraUp)      Gl.uniform3f(SkyU.CameraUp, Basis.Up[0], Basis.Up[1], Basis.Up[2]);
        if (SkyU.CameraForward) Gl.uniform3f(SkyU.CameraForward, Basis.Forward[0], Basis.Forward[1], Basis.Forward[2]);
        if (SkyU.TanHalfFov)    Gl.uniform1f(SkyU.TanHalfFov, Math.tan(this.FovRadians * 0.5));
        if (SkyU.Aspect)        Gl.uniform1f(SkyU.Aspect, Aspect);
        Gl.bindVertexArray(this.SkyVao);
        Gl.drawArrays(Gl.TRIANGLES, 0, 3);
        Gl.depthMask(true);

        // Terrain: the displaced mesh, or the sphere-traced density field in its place.
        if (this.UseRaymarch)
        {
            Gl.useProgram(this.RaymarchProgram.Program);
            this.AssignSharedUniforms(this.RaymarchProgram, Options, ShadowVP);
            const RU = this.RaymarchProgram.Uniforms;
            if (RU.ViewProjection) Gl.uniformMatrix4fv(RU.ViewProjection, false, ViewProjection);
            if (RU.CameraRight)    Gl.uniform3f(RU.CameraRight, Basis.Right[0], Basis.Right[1], Basis.Right[2]);
            if (RU.CameraUp)       Gl.uniform3f(RU.CameraUp, Basis.Up[0], Basis.Up[1], Basis.Up[2]);
            if (RU.CameraForward)  Gl.uniform3f(RU.CameraForward, Basis.Forward[0], Basis.Forward[1], Basis.Forward[2]);
            if (RU.TanHalfFov)     Gl.uniform1f(RU.TanHalfFov, Math.tan(this.FovRadians * 0.5));
            if (RU.Aspect)         Gl.uniform1f(RU.Aspect, Aspect);
            if (RU.RaymarchSteps)  Gl.uniform1f(RU.RaymarchSteps, this.RaymarchSteps);
            if (RU.RaymarchDetail) Gl.uniform1f(RU.RaymarchDetail, this.RaymarchDetail);
            Gl.bindVertexArray(this.SkyVao);
            Gl.drawArrays(Gl.TRIANGLES, 0, 3);
        }
        else
        {
            Gl.useProgram(this.TerrainProgram.Program);
            this.AssignSharedUniforms(this.TerrainProgram, Options, ShadowVP);
            if (this.TerrainProgram.Uniforms.ViewProjection)
                Gl.uniformMatrix4fv(this.TerrainProgram.Uniforms.ViewProjection, false, ViewProjection);
            Gl.bindVertexArray(this.TerrainVao);
            Gl.drawElements(Gl.TRIANGLES, this.TerrainIndexCount, Gl.UNSIGNED_INT, 0);
        }

        // SDF stamp & 3D cave surfaces (with slight polygon offset so the cave lip collar never Z-fights with the heightfield).
        if (this.StampIndexCount > 0)
        {
            Gl.useProgram(this.StampProgram.Program);
            this.AssignSharedUniforms(this.StampProgram, Options, ShadowVP);
            if (this.StampProgram.Uniforms.ViewProjection)
                Gl.uniformMatrix4fv(this.StampProgram.Uniforms.ViewProjection, false, ViewProjection);
            Gl.bindVertexArray(this.StampVao);
            Gl.drawElements(Gl.TRIANGLES, this.StampIndexCount, Gl.UNSIGNED_INT, 0);
        }

        // Water sheet last, blended.
        Gl.enable(Gl.BLEND);
        Gl.blendFunc(Gl.SRC_ALPHA, Gl.ONE_MINUS_SRC_ALPHA);
        Gl.depthMask(false);
        Gl.useProgram(this.WaterProgram.Program);
        this.AssignSharedUniforms(this.WaterProgram, Options, ShadowVP);
        if (this.WaterProgram.Uniforms.ViewProjection)
            Gl.uniformMatrix4fv(this.WaterProgram.Uniforms.ViewProjection, false, ViewProjection);
        Gl.bindVertexArray(this.WaterVao);
        Gl.drawArrays(Gl.TRIANGLE_STRIP, 0, 4);
        Gl.depthMask(true);
        Gl.disable(Gl.BLEND);
        Gl.bindVertexArray(null);
    }

    ResizeToDisplay()
    {
        const Dpr = Math.min(window.devicePixelRatio || 1.0, 2.0);
        const Width = Math.floor(this.Canvas.clientWidth * Dpr);
        const Height = Math.floor(this.Canvas.clientHeight * Dpr);
        if (Width > 0 && Height > 0 && (this.Canvas.width !== Width || this.Canvas.height !== Height))
        {
            this.Canvas.width = Width;
            this.Canvas.height = Height;
        }
    }
}
