//============================================================================================================================================
// 📦 Engine/Shaders/SkyRecords.slang — the sky as the ray-tracing kernel sees it
//============================================================================================================================================
// The Celestial port's GPU seam. Everything here is a transcription of Engine/DisplayPresentation/AtmosphereModel.h
//    and Twilight, and it must stay one: the CPU raster, the headless proofs and this kernel are three consumers
//    of the same model, and the first time they disagree the sky becomes two skies.
//
//    ⚠️ The coefficients are NOT repeated here. They arrive in the uniform block from AtmosphereMedium, because a
//    second copy of 5.8e-6 in a shader is exactly how the GI-on and GI-off skies drift apart — the same failure
//    ColourTransfer.h records for the tone map.
//
// ⚠️ WHY THE KERNEL NEEDS THIS AT ALL. ReSTIRViewport had two branches saying "there is no environment light":
//    a missed primary ray and an escaped bounce ray. With a real atmosphere both are wrong in different ways.
//    The primary is the sky BEHIND the geometry. The bounce is the sky as a LIGHT — it is the largest emitter in
//    an outdoor scene, and it is what makes an unlit face take the colour of the air above it. Round 9 removed
//    the sun/sky system and left bindings 21-24 vacant; this fills the first of them.

#ifndef FRONTIER_SKY_RECORDS
#define FRONTIER_SKY_RECORDS

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE UNIFORM BLOCK
//------------------------------------------------------------------------------------------------------------------------

// 368 bytes, std140. Sized against Vulkan's guaranteed 128-byte push limit deliberately NOT applying here: the
//    push block is already at that limit with five uint reserves left, and the atmosphere plus weather need
//    twenty-three 16-byte rows. A uniform buffer is the only place it fits, which is what the binding reservation
//    anticipated.
layout(std140, binding = 21) uniform SkyConstants
{
    vec4 SkySunDirection;    // xyz = unit, toward the sun (CelestialSolver's convention); w = elevation [deg]
    vec4 SkySunRadiance;     // xyz = colour x intensity; w = 0 disables the sky entirely
    vec4 SkyRayleigh;        // xyz = beta_R x strength [1/m]; w = Rayleigh scale height [m]
    vec4 SkyMie;             // x = beta_M x strength [1/m], y = Mie scale height [m], z = anisotropy g, w = unused
    vec4 SkyOzone;           // xyz = beta_O x strength [1/m]; w = unused
    vec4 SkyPlanet;          // x = planet radius [m], y = atmosphere height [m], z = camera height [m], w = unused
    uvec4 SkyControl;        // x = view samples, y = light samples, z = weather flags, w = cloud type
    vec4 SkyTwilight;        // x = glow intensity, y = line intensity, z = 1 when the line is civil-only, w = unused
    vec4 SkySunDirect;       // xyz = panel direct-sun factor 0.11·gain·colour·T (kernel: ÷Ω, ×Ω back); w = unused

    // Weather is in the sky record, not a second binding, so primary misses, GI bounces and sun NEE share one
    //    coherent update. All rows are std140-sized; disabled media are gated by SkyControl.z.
    vec4 SkyCloudLayer;      // base, thickness, coverage, density
    vec4 SkyCloudShape;      // feature scale, ceiling, anvil, HG anisotropy
    vec4 SkyCloudWind;       // speed, bearing [deg], shear [/km], veer [deg/km]
    vec4 SkyCloudAlbedo;     // rgb albedo, w retired (P2.2): SkyCloudClock carries the clock
    uvec4 SkyCloudControl;   // cloud steps, local steps, sun-shadow taps, reserved
    vec4 SkyLocalCloudCentre;
    vec4 SkyLocalCloudHalfSize;
    vec4 SkyLocalCloudParams; // density, coverage, feature scale, HG anisotropy
    vec4 SkyLocalFogCentre;
    vec4 SkyLocalFogHalfSize;
    vec4 SkyLocalFogParams;
    vec4 SkyCloudScatter;    // forward g1, back g2, lobe mix, absorption (P2.4b reads; packed P2.2)
    vec4 SkyCloudDetail;     // sky ambient x, powder, erosion detail, local erosion detail (P2.4 reads)
    vec4 SkyCloudClock;      // wind integral xy [m], wall clock [s], spare
};

// The sun's angular RADIUS, one definition for the three consumers: the disc below draws this body, the
//    viewport's next-event estimator samples it, and the CPU raster draws it a third time — a disc and a light
//    that disagree on the sun's size would be two suns. (Was the disc's private literal; same value, now
//    shared. SkyConstantRecord.h's kSunAngularRadius is the host's copy of this same body.)
const float kSunAngularRadius = 0.53 * (3.14159265358979323846 / 180.0) * 0.5;

//------------------------------------------------------------------------------------------------------------------------
//                                                    THE INTEGRAL
//------------------------------------------------------------------------------------------------------------------------

// Air mass at an elevation above the horizon, Kasten-Young 1989 — the panel's airMassOf, transcribed term for
//    term. MUST equal AtmosphereModel::AirMass; the solver proof pins the host's values against the almanac.
float SkyAirMass(float ElevationDegrees)
{
    float Zenith = 90.0 - ElevationDegrees;
    if (Zenith >= 96.0) return 40.0;
    return min(40.0, 1.0 / (cos(radians(Zenith)) + 0.50572 * pow(96.07995 - Zenith, -1.6364)));
}

// Ray-sphere about the planet centre. Returns false on a miss; Near/Far may be negative and the caller clamps.
bool SkyIntersect(vec3 Origin, vec3 Direction, float Radius, out float Near, out float Far)
{
    float B = dot(Origin, Direction);
    float C = dot(Origin, Origin) - Radius * Radius;
    float D = B * B - C;
    if (D < 0.0) { Near = 0.0; Far = 0.0; return false; }
    float S = sqrt(D);
    Near = -B - S;
    Far  = -B + S;
    return true;
}

// Single-scattering sky radiance along a direction, and the transmittance along it.
//
//    Transcribed from AtmosphereModel::Integrate. The quadratic sample spacing (s*s below) is what makes 16
//    samples look like far more: the near half of the ray holds nearly all the density, so uniform spacing
//    wastes most of its samples in near-vacuum.
vec3 SkyRadiance(vec3 Direction, out vec3 OutTransmittance, out bool OutHitGround)
{
    OutTransmittance = vec3(1.0);
    OutHitGround = false;
    if (SkySunRadiance.w <= 0.0) return vec3(0.0);

    float PlanetRadius = SkyPlanet.x;
    float TopRadius    = PlanetRadius + SkyPlanet.y;
    vec3  Origin       = vec3(0.0, 0.0, PlanetRadius + max(SkyPlanet.z, 0.0));

    float Near, Far;
    if (!SkyIntersect(Origin, Direction, TopRadius, Near, Far) || Far < 0.0) return vec3(0.0);

    float Start = max(Near, 0.0);
    float End   = Far;

    // A ray that meets the ground stops there — everything beyond is rock, not air.
    float GroundNear, GroundFar;
    if (SkyIntersect(Origin, Direction, PlanetRadius, GroundNear, GroundFar) && GroundNear > 0.0)
    {
        End = GroundNear;
        OutHitGround = true;
    }
    if (End <= Start) return vec3(0.0);

    vec3  BetaR = SkyRayleigh.xyz;
    float BetaM = SkyMie.x;
    vec3  BetaO = SkyOzone.xyz;
    float Hr = SkyRayleigh.w;
    float Hm = SkyMie.y;
    float G  = SkyMie.z;

    float Mu = dot(Direction, SkySunDirection.xyz);
    const float kPi = 3.14159265358979323846;
    float PhaseR = 3.0 / (16.0 * kPi) * (1.0 + Mu * Mu);
    float Denominator = (2.0 + G * G) * pow(max(1.0 + G * G - 2.0 * G * Mu, 1e-6), 1.5);
    float PhaseM = 3.0 / (8.0 * kPi) * ((1.0 - G * G) * (1.0 + Mu * Mu)) / max(Denominator, 1e-9);

    uint N  = max(SkyControl.x, 1u);
    uint NL = max(SkyControl.y, 1u);
    float Length = End - Start;

    vec3  SumR = vec3(0.0), SumM = vec3(0.0);
    float OpticalR = 0.0, OpticalM = 0.0;

    for (uint I = 0u; I < N; ++I)
    {
        float S0 = float(I)      / float(N);
        float S1 = float(I + 1u) / float(N);
        S0 *= S0; S1 *= S1;                       // quadratic: dense near the camera

        float Ta  = Start + Length * S0;
        float Tb  = Start + Length * S1;
        float Seg = Tb - Ta;
        float Tm  = 0.5 * (Ta + Tb);

        vec3  P = Origin + Direction * Tm;
        float H = length(P) - PlanetRadius;

        float DensityR = exp(-H / Hr) * Seg;
        float DensityM = exp(-H / Hm) * Seg;
        OpticalR += DensityR;
        OpticalM += DensityM;

        float LightNear, LightFar;
        if (!SkyIntersect(P, SkySunDirection.xyz, TopRadius, LightNear, LightFar)) continue;

        float LightR = 0.0, LightM = 0.0;
        bool  Lit = true;
        for (uint J = 0u; J < NL; ++J)
        {
            float Q0 = float(J)      / float(NL);
            float Q1 = float(J + 1u) / float(NL);
            Q0 *= Q0; Q1 *= Q1;
            float SegL = LightFar * (Q1 - Q0);
            float Tq   = LightFar * 0.5 * (Q0 + Q1);
            vec3  Q    = P + SkySunDirection.xyz * Tq;
            float Hq   = length(Q) - PlanetRadius;
            if (Hq < 0.0) { Lit = false; break; }
            LightR += exp(-Hq / Hr) * SegL;
            LightM += exp(-Hq / Hm) * SegL;
        }
        if (!Lit) continue;

        // Mie extinction runs 1.1x its scattering: real aerosols absorb a little as well as scatter.
        vec3 Tau = BetaR * (OpticalR + LightR) + BetaM * 1.1 * (OpticalM + LightM) + BetaO * (OpticalR + LightR);
        vec3 Attenuation = exp(-Tau);
        SumR += Attenuation * DensityR;
        SumM += Attenuation * DensityM;
    }

    OutTransmittance = exp(-(BetaR * OpticalR + BetaM * 1.1 * OpticalM + BetaO * OpticalR));
    return (SumR * BetaR * PhaseR + SumM * BetaM * PhaseM) * SkySunRadiance.xyz;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     CLOUDS
//------------------------------------------------------------------------------------------------------------------------

// The cloud field is deliberately evaluated here, beside the atmosphere, rather than as a post-process. A post
//    blend cannot put a cloud between the camera and a surface, cannot shadow the sun NEE, and makes a GI bounce
//    see a different sky from a primary miss. These functions are the GPU twin of VolumetricMedia.h's three-octave
//    density and per-medium march; the record carries the live settings and budgets.
const uint kCloudLayerFlag      = 1u << 0u;
const uint kLocalCloudFlag      = 1u << 1u;
const uint kLocalFogFlag        = 1u << 2u;
const uint kCloudFollowWindFlag = 1u << 3u;
const uint kLocalCloudWindFlag  = 1u << 4u;
const uint kLocalFogWindFlag    = 1u << 5u;
const float kCloudExtinctionScale = 0.01;
const float kCloudMaxDistance = 200000.0; // [m] enough to cover the visible troposphere without grazing-ray runaway

float CloudHash(vec3 P)
{
    // hash13, twinned from VolumetricMedia (same op order): the noise lattice hash.
    vec3 Q = fract(P * 0.1031);
    Q += dot(Q, Q.zyx + 31.32);
    return fract((Q.x + Q.y) * Q.z);
}

float CloudNoise(vec3 P)
{
    vec3 I = floor(P), F = P - I;
    vec3 U = F * F * (3.0 - 2.0 * F);
    float N000 = CloudHash(I);
    float N100 = CloudHash(I + vec3(1.0, 0.0, 0.0));
    float N010 = CloudHash(I + vec3(0.0, 1.0, 0.0));
    float N110 = CloudHash(I + vec3(1.0, 1.0, 0.0));
    float N001 = CloudHash(I + vec3(0.0, 0.0, 1.0));
    float N101 = CloudHash(I + vec3(1.0, 0.0, 1.0));
    float N011 = CloudHash(I + vec3(0.0, 1.0, 1.0));
    float N111 = CloudHash(I + vec3(1.0, 1.0, 1.0));
    float X00 = mix(N000, N100, U.x), X10 = mix(N010, N110, U.x);
    float X01 = mix(N001, N101, U.x), X11 = mix(N011, N111, U.x);
    return mix(mix(X00, X10, U.y), mix(X01, X11, U.y), U.z);
}

float CloudHeightProfile(uint Type, float Normalised)
{
    float H = clamp(Normalised, 0.0, 1.0);
    if (Type == 0u) return smoothstep(0.0, 0.08, H) * (1.0 - smoothstep(0.75, 1.0, H));
    if (Type == 1u) return smoothstep(0.0, 0.12, H) * (1.0 - smoothstep(0.50, 0.95, H));
    if (Type == 2u) return smoothstep(0.0, 0.07, H) * (1.0 - smoothstep(0.35, 1.0, H)) * 1.15;
    if (Type == 3u) return smoothstep(0.0, 0.05, H) * (1.0 - smoothstep(0.85, 1.0, H))
                         * mix(1.0, 1.6, smoothstep(0.7, 1.0, H) * SkyCloudShape.z);
    if (Type == 4u) return smoothstep(0.0, 0.3, H) * (1.0 - smoothstep(0.6, 1.0, H)) * 0.7;
    return smoothstep(0.0, 0.4, H) * (1.0 - smoothstep(0.5, 1.0, H)) * 0.35;
}

// The local cloud's vertical profile (REF lcDensity's three-way): 0 stratiform, 1 cumuliform, 2 wispy.
float CloudLocalProfile(uint Type, float Normalised)
{
    float H = clamp(Normalised, 0.0, 1.0);
    if (Type == 0u) return smoothstep(0.0, 0.1, H) * (1.0 - smoothstep(0.75, 1.0, H));
    if (Type == 1u) return smoothstep(0.0, 0.08, H) * (1.0 - smoothstep(0.4, 1.0, H)) * 1.15;
    return smoothstep(0.0, 0.3, H) * (1.0 - smoothstep(0.6, 1.0, H)) * 0.6;
}

// The local cloud's mask (REF lcMask): a box fades on its thinnest margin, an ellipsoid on its radius.
float CloudLocalMask(uint Shape, float Soft, vec3 Local)
{
    float M = Shape == 0u ? min(min(1.0 - abs(Local.x), 1.0 - abs(Local.y)), 1.0 - abs(Local.z))
                          : 1.0 - length(Local);
    return smoothstep(0.0, max(0.05, Soft), M);
}

vec3 CloudWindAt(float Altitude)
{
    float Km = max(Altitude, 0.0) * 0.001;
    float Speed = SkyCloudWind.x * (1.0 + SkyCloudWind.z * Km);
    float Bearing = radians(SkyCloudWind.y + SkyCloudWind.w * Km);
    return vec3(sin(Bearing), cos(Bearing), 0.0) * Speed;
}

// The per-pixel turbulence displacement (REF windSwirl = windTurb x 8): the reference's six-noise curl in
//    Z-up axes, times eight. Called ONCE per pixel (see CloudAlong), never per step. Reads the record's REF
//    form — no Steadiness lane exists, so Steadiness != 1 is CPU-path-only (the default 1.0 is identical).
vec3 CloudSwirlAt(vec3 P, float T)
{
    if (SkyCloudClock.w <= 0.0) return vec3(0.0);
    vec3 Q = P * 0.02 + vec3(T * 0.05, T * 0.03, 0.0);
    float E = 0.5;
    float Dx = CloudNoise(Q + vec3(E, 0.0, 0.0)) - CloudNoise(Q - vec3(E, 0.0, 0.0));
    float Dy = CloudNoise(Q + vec3(0.0, E, 0.0)) - CloudNoise(Q - vec3(0.0, E, 0.0));
    float Dz = CloudNoise(Q + vec3(0.0, 0.0, E)) - CloudNoise(Q - vec3(0.0, 0.0, E));
    float Scale = SkyCloudClock.w * SkyCloudWind.x * 0.9;
    return vec3(Dz - Dy, Dx - Dz, Dy - Dx) * Scale * 8.0;
}

// The wind displacement — the twin of WindField::AdvectDrift, which carries the streak note. The packed wind
//    integral times the altitude factor (local wind over surface wind) times the caller's art factor: shear
//    and veer lean the field progressively, never from time-of-day. Reads the Clock row, not the retired w lane.
vec2 CloudDriftAt(float Altitude, float ArtFactor)
{
    float Factor = length(CloudWindAt(Altitude).xy) / max(1e-3, SkyCloudWind.x);
    return SkyCloudClock.xy * Factor * ArtFactor;
}

float CloudDensityAt(vec3 Position, float Time, float Lod)
{
    float Ceiling = max(SkyCloudShape.y, 0.0);
    float Base = clamp(SkyCloudLayer.x, 0.0, Ceiling);
    float Top = clamp(SkyCloudLayer.x + SkyCloudLayer.y, 0.0, Ceiling);
    if (Position.z < Base || Position.z > Top || Top <= Base + 1.0) return 0.0;

    float Hn = clamp((Position.z - Base) / (Top - Base), 0.0, 1.0);
    float Profile = CloudHeightProfile(SkyControl.w, Hn);
    if (Profile <= 0.0) return 0.0;

    vec3 Drift = vec3(0.0);
    if ((SkyControl.z & kCloudFollowWindFlag) != 0u)
        Drift.xy = CloudDriftAt(Position.z, 0.8);
    float LeanFactor = SkyControl.w >= 3u ? SkyCloudShape.z : 0.2;
    float DriftLen = length(Drift.xy);
    float LeanGuard = max(1e-3, DriftLen + 1e-3);
    float LeanReach = Hn * (Top - Base) * 0.35 * LeanFactor;
    vec2 Slanted = Position.xy + Drift.xy + LeanReach * Drift.xy / LeanGuard;

    float Inverse = 1.0 / max(SkyCloudShape.x * 900.0, 1.0);
    vec3 S = vec3(Slanted * Inverse, Position.z * Inverse);
    float Shape = CloudNoise(S) * 0.5
                + CloudNoise(S * 2.02 + vec3(3.1, 1.7, 9.2)) * 0.25
                + CloudNoise(S * 4.10 + vec3(7.7, 2.2, 1.1)) * 0.125
                + CloudNoise(S * 8.3 + vec3(1.3, 8.8, 4.4)) * 0.0625;
    Shape /= 0.9375;
    if (SkyControl.w == 5u)
    {
        float Streak = CloudNoise(vec3(S.x * 0.25, S.y * 6.0, S.z * 4.0));
        Shape = Shape * 0.6 + Streak * 0.5;
    }
    float Threshold = 1.0 - clamp(SkyCloudLayer.z, 0.0, 1.0);
    float Body = clamp((Shape - Threshold) / max(1.0 - Threshold, 1e-3), 0.0, 1.0) * Profile;
    if (Body <= 0.0 || Lod > 0.5) return Body * max(SkyCloudLayer.w, 0.0);
    float TimeShift = Time * 0.02;
    float Detail = CloudNoise(S * 9.0 + vec3(TimeShift)) * 0.6
                 + CloudNoise(S * 19.0 + vec3(5.0)) * 0.4;
    float Erode = mix(Detail, 1.0 - Detail, clamp(Hn * 3.0, 0.0, 1.0)) * SkyCloudDetail.z * 0.45;
    return clamp(Body - Erode * (1.0 - Body), 0.0, 1.0) * max(SkyCloudLayer.w, 0.0);
}

float LocalDensityAt(vec3 Position, bool FogVolume, vec3 Swirl, float Lod)
{
    if (FogVolume)
    {
        if ((SkyControl.z & kLocalFogFlag) == 0u) return 0.0;
    }
    else if ((SkyControl.z & kLocalCloudFlag) == 0u) return 0.0;

    vec3 Centre = FogVolume ? SkyLocalFogCentre.xyz : SkyLocalCloudCentre.xyz;
    vec3 HalfSize = max(FogVolume ? SkyLocalFogHalfSize.xyz : SkyLocalCloudHalfSize.xyz, vec3(1e-3));
    vec4 Params = FogVolume ? SkyLocalFogParams : SkyLocalCloudParams;
    vec3 Local = (Position - Centre) / HalfSize;

    if (FogVolume)
    {
        // Kept, not ported (P8's vf replaces it): the fog marches exactly what it always marched.
        float R = length(Local);
        if (R >= 1.0) return 0.0;
        float Mask = 1.0 - smoothstep(0.55, 1.0, R);
        if (Mask <= 0.0) return 0.0;

        vec3 Drift = vec3(0.0);
        if ((SkyControl.z & kLocalFogWindFlag) != 0u)
            Drift.xy = CloudDriftAt(Position.z, 0.6);
        float Inverse = 1.0 / max(Params.z, 1.0);
        vec3 S = (Position + Drift) * Inverse;
        float Shape = CloudNoise(S) * 0.5 + CloudNoise(S * 2.02 + vec3(3.1, 1.7, 9.2)) * 0.25;
        Shape /= 0.75;
        float Threshold = 1.0 - clamp(Params.y, 0.0, 1.0);
        float Raw = clamp((Shape - Threshold) / max(1.0 - Threshold, 1e-3), 0.0, 1.0);
        return smoothstep(0.0, 1.0, Raw) * Mask * max(Params.x, 0.0);
    }

    // The unpacked local-cloud word: type in bits 0-1, shape in bit 2, softness 8-bit fixed in 8-15.
    uint LocalPack = SkyCloudControl.w;
    uint LocalType = LocalPack & 3u;
    uint LocalShape = (LocalPack >> 2u) & 1u;
    float LocalSoft = float((LocalPack >> 8u) & 255u) / 255.0;

    float Hn = clamp(Local.z * 0.5 + 0.5, 0.0, 1.0);
    float Profile = CloudLocalProfile(LocalType, Hn);
    if (Profile <= 0.0) return 0.0;
    float Mask = CloudLocalMask(LocalShape, LocalSoft, Local);
    if (Mask <= 0.0) return 0.0;

    vec3 Push = vec3(0.0);
    if ((SkyControl.z & kLocalCloudWindFlag) != 0u)
        Push = vec3(CloudDriftAt(Position.z, 0.6), 0.0) + Swirl * 0.6;
    float Inverse = 1.0 / max(Params.z, 1.0);
    vec3 S = (Position + Push) * Inverse;
    float Shape = CloudNoise(S) * 0.5
                + CloudNoise(S * 2.02 + vec3(3.1, 1.7, 9.2)) * 0.25
                + CloudNoise(S * 4.10 + vec3(7.7, 2.2, 1.1)) * 0.125
                + CloudNoise(S * 8.3 + vec3(1.3, 8.8, 4.4)) * 0.0625;
    Shape /= 0.9375;
    float Threshold = 1.0 - clamp(Params.y, 0.0, 1.0);
    float Body = clamp((Shape - Threshold) / max(1.0 - Threshold, 1e-3), 0.0, 1.0) * Profile * Mask;
    if (Body <= 0.0 || Lod > 0.5) return Body * max(Params.x, 0.0);
    float Detail = CloudNoise(S * 9.0) * 0.6 + CloudNoise(S * 19.0 + vec3(5.0)) * 0.4;
    float Erode = mix(Detail, 1.0 - Detail, clamp(Hn * 3.0, 0.0, 1.0)) * SkyCloudDetail.w * 0.45;
    return clamp(Body - Erode * (1.0 - Body), 0.0, 1.0) * max(Params.x, 0.0);
}

// How far past the slab entry the layer march may run: the reference's span cut (celestial line 1023),
//    spelled for the block — above the slab max(60 km, thick x 40), below or inside thick x 14. Layer only;
//    the boxes span themselves.
float CloudSlabFarCap(float OriginZ, float Base, float Top)
{
    float Thickness = Top - Base;
    return OriginZ > Top ? max(60000.0, Thickness * 40.0) : Thickness * 14.0;
}

bool CloudSlabInterval(vec3 Origin, vec3 Direction, float Maximum, out float Near, out float Far)
{
    float Ceiling = max(SkyCloudShape.y, 0.0);
    float Base = clamp(SkyCloudLayer.x, 0.0, Ceiling);
    float Top = clamp(SkyCloudLayer.x + SkyCloudLayer.y, 0.0, Ceiling);
    if (Top <= Base + 1.0) return false;
    if (abs(Direction.z) < 1e-6)
    {
        if (Origin.z < Base || Origin.z > Top) return false;
        Near = 0.0; Far = Maximum;
        Far = min(Far, Near + CloudSlabFarCap(Origin.z, Base, Top));
        return Far > Near;
    }
    float T0 = (Base - Origin.z) / Direction.z;
    float T1 = (Top - Origin.z) / Direction.z;
    if (T0 > T1) { float Swap = T0; T0 = T1; T1 = Swap; }
    Near = max(T0, 0.0); Far = min(T1, Maximum);
    Far = min(Far, Near + CloudSlabFarCap(Origin.z, Base, Top));
    return Far > Near;
}

bool CloudBoxInterval(vec3 Origin, vec3 Direction, vec3 Centre, vec3 HalfSize, float Maximum,
                      out float Near, out float Far)
{
    float Low = -1e30, High = 1e30;
    for (int Axis = 0; Axis < 3; ++Axis)
    {
        if (abs(Direction[Axis]) < 1e-7)
        {
            if (abs(Origin[Axis] - Centre[Axis]) > HalfSize[Axis]) return false;
            continue;
        }
        float Inv = 1.0 / Direction[Axis];
        float T0 = (-HalfSize[Axis] - (Origin[Axis] - Centre[Axis])) * Inv;
        float T1 = ( HalfSize[Axis] - (Origin[Axis] - Centre[Axis])) * Inv;
        if (T0 > T1) { float Swap = T0; T0 = T1; T1 = Swap; }
        Low = max(Low, T0); High = min(High, T1);
    }
    if (Low > High || High < 0.0) return false;
    Near = max(Low, 0.0); Far = min(High, Maximum);
    return Far > Near;
}

float CloudShadowMedium(vec3 Origin, vec3 Direction, uint Medium, uint Taps, vec3 Swirl)
{
    // Twin of VolumetricMedia::ShadowMarch: Taps half-step taps toward the sun from the sample point. The taps
    //    pace the medium's own reference step (the view step the CPU march passes is the same size to 4% — the
    //    rescale — so both paths resolve the same self-shadowing, the 4.83x gap/shadow contrast the CPU path
    //    measured). A full-interval march was tried here first: at grazing its taps stride whole clouds between
    //    samples and the shadow aliases into noise, while these local taps stay inside the structure.
    //    The lod threading is the reference's (clShadow/uniShadow): the layer's first two taps keep erosion,
    //    the rest skip it, and the local shadow always skips it (the fog ignores lod).
    float StepSize = Medium == 0u ? 4000.0 / float(max(SkyCloudControl.x, 1u))
                   : max((Medium == 1u ? SkyLocalCloudParams.z : SkyLocalFogParams.z) * 0.5, 1.0);
    uint Count = max(Taps, 1u);
    float Depth = 0.0;
    float Time = SkyCloudClock.z;
    for (uint I = 1u; I <= Count; ++I)
    {
        float Distance = StepSize * float(I) * 0.5;
        vec3 Q = Origin + Direction * Distance;
        float D = Medium == 0u ? CloudDensityAt(Q, Time, I > 2u ? 1.0 : 0.0)
                : LocalDensityAt(Q, Medium == 2u, Swirl, 1.0);
        Depth += D * StepSize * 0.5 * kCloudExtinctionScale;
        if (Depth > 4.0) break;
    }
    return exp(-Depth);
}

float CloudSunTransmittance(vec3 Origin, vec3 Direction, vec3 Swirl)
{
    if ((SkyControl.z & (kCloudLayerFlag | kLocalCloudFlag | kLocalFogFlag)) == 0u) return 1.0;
    // Per-medium transmittances multiply, which is the combined medium's: optical depths add under the
    //    exponential, so this equals the CPU shadow march's summed densities at the same tap points.
    uint Taps = max(SkyCloudControl.z, 1u);
    float Result = 1.0;
    if ((SkyControl.z & kCloudLayerFlag) != 0u) Result *= CloudShadowMedium(Origin, Direction, 0u, Taps, Swirl);
    if ((SkyControl.z & kLocalCloudFlag) != 0u) Result *= CloudShadowMedium(Origin, Direction, 1u, Taps, Swirl);
    if ((SkyControl.z & kLocalFogFlag) != 0u) Result *= CloudShadowMedium(Origin, Direction, 2u, Taps, Swirl);
    return Result;
}

float CloudHenyeyGreenstein(float CosTheta, float G)
{
    const float Pi = 3.14159265358979323846;
    float Denominator = max(1.0 + G * G - 2.0 * G * CosTheta, 1e-4);
    return (1.0 - G * G) / (4.0 * Pi * pow(Denominator, 1.5));
}

float CloudMarchJitter(vec3 Direction)
{
    // Twin of VolumetricMedia::MarchJitter, which carries the note. The clock reads the record's Clock
    //    row — the march takes no Time parameter, exactly like the drift it sits beside.
    return CloudHash(vec3(Direction.xy * 317.19, fract(SkyCloudClock.z * 3.0)));
}

void CloudMarchMedium(vec3 Origin, vec3 Direction, float Near, float Far, uint Medium,
                      vec3 SunDirection, vec3 SunRadiance, vec3 AmbientRadiance,
                      inout vec3 Scatter, inout float Transmittance, vec3 Swirl)
{
    float Span = Far - Near;
    if (Span <= 0.0) return;
    uint Budget = Medium == 0u ? max(SkyCloudControl.x, 1u) : max(SkyCloudControl.y, 1u);
    float Feature = Medium == 0u ? max(SkyCloudShape.x * 900.0, 1.0)
                                 : max((Medium == 1u ? SkyLocalCloudParams.z : SkyLocalFogParams.z) * 0.5, 1.0);
    float DesiredStep = Medium == 0u ? 4000.0 / float(Budget) : Feature;
    uint Count = max(uint(ceil(Span / DesiredStep)), 1u);
    // The cap is the CPU march's (4x the tier's budget for the layer, the local budget for the boxes): the same
    //    span takes the same steps on both paths, so a capped grazing ray shades identically in either.
    Count = min(Count, Medium == 0u ? max(Budget * 4u, 4u) : Budget);
    float Step = Span / float(Count);
    float G = Medium == 0u ? SkyCloudShape.w : (Medium == 1u ? SkyLocalCloudParams.w : SkyLocalFogParams.w);
    float Phase = CloudHenyeyGreenstein(dot(Direction, SunDirection), G);
    // The layer's white rides the record; the box keeps the CPU default white (the sheet exposes no local
    //    albedo, so the default is the only value both paths ever see); the fog keeps its fixed grey — the
    //    same three albedos VolumetricMedia::March shades with.
    vec3 Albedo = Medium == 0u ? SkyCloudAlbedo.xyz
                : (Medium == 1u ? vec3(0.92, 0.94, 0.97) : vec3(0.88));
    // lodFar (REF cloudMarch): the layer sheds its erosion past 200 km of entry distance; the local
    // march always reads full detail (marchLocal passes lod 0).
    float Lod = Medium == 0u ? smoothstep(20000.0, 200000.0, Near) : 0.0;
    float Time = SkyCloudClock.z;
    float Jitter = Medium == 0u ? CloudMarchJitter(Direction) : 0.5;
    for (uint I = 0u; I < Count; ++I)
    {
        float T = Near + (float(I) + Jitter) * Step;
        vec3 P = Origin + Direction * T;
        float Density = Medium == 0u ? CloudDensityAt(P, Time, Lod) : LocalDensityAt(P, Medium == 2u, Swirl, 0.0);
        if (Density <= 1e-5) continue;
        float SunT = CloudSunTransmittance(P, SunDirection, Swirl);
        float Extinction = Density * Step * kCloudExtinctionScale;
        float SegmentT = exp(-Extinction);
        vec3 Incoming = SunRadiance * SunT * Phase + AmbientRadiance;
        Scatter += Incoming * Albedo * (1.0 - SegmentT) * Transmittance;
        Transmittance *= SegmentT;
        if (Transmittance < 0.005) break;
    }
}

// One ray's turbulence displacement (REF gSwirl, filled once per pixel in main): a windTurb x8 thirty
// metres along the ray, only when turbulence is on and a local cloud follows the wind. CloudAlong calls
// it for the view ray; the viewport's NEE calls it for each shadow ray, which has no pixel of its own
// (the same per-ray generalisation the jitter's direction-hash makes for bounces).
vec3 CloudPixelSwirl(vec3 Origin, vec3 Direction)
{
    if (SkyCloudClock.w <= 0.0 || (SkyControl.z & kLocalCloudWindFlag) == 0u) return vec3(0.0);
    return CloudSwirlAt(Origin + Direction * 30.0, SkyCloudClock.z);
}

void CloudAlong(vec3 Origin, vec3 Direction, float Maximum, vec3 SunDirection, vec3 SunRadiance,
                vec3 AmbientRadiance, out vec3 Scatter, out float Transmittance)
{
    Scatter = vec3(0.0); Transmittance = 1.0;
    float Nears[3] = float[3](1e30, 1e30, 1e30);
    float Fars[3]  = float[3](-1.0, -1.0, -1.0);
    bool Hits[3]   = bool[3](false, false, false);
    Hits[0] = (SkyControl.z & kCloudLayerFlag) != 0u
           && CloudSlabInterval(Origin, Direction, Maximum, Nears[0], Fars[0]);
    Hits[1] = (SkyControl.z & kLocalCloudFlag) != 0u
           && CloudBoxInterval(Origin, Direction, SkyLocalCloudCentre.xyz, max(SkyLocalCloudHalfSize.xyz, vec3(1e-3)), Maximum, Nears[1], Fars[1]);
    Hits[2] = (SkyControl.z & kLocalFogFlag) != 0u
           && CloudBoxInterval(Origin, Direction, SkyLocalFogCentre.xyz, max(SkyLocalFogHalfSize.xyz, vec3(1e-3)), Maximum, Nears[2], Fars[2]);
    uint Order[3] = uint[3](0u, 1u, 2u);
    for (uint A = 1u; A < 3u; ++A)
        for (uint B = A; B > 0u && Nears[Order[B]] < Nears[Order[B - 1u]]; --B)
        {
            uint Swap = Order[B]; Order[B] = Order[B - 1u]; Order[B - 1u] = Swap;
        }
    vec3 PixelSwirl = CloudPixelSwirl(Origin, Direction);
    for (uint I = 0u; I < 3u; ++I)
    {
        uint M = Order[I];
        if (!Hits[M] || Transmittance < 0.005) continue;
        CloudMarchMedium(Origin, Direction, Nears[M], Fars[M], M, SunDirection, SunRadiance,
                         AmbientRadiance, Scatter, Transmittance, PixelSwirl);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      TWILIGHT
//------------------------------------------------------------------------------------------------------------------------

// ⚠️ NOT PHYSICAL, and deliberately so — the same note as AtmosphereModel.h carries. The integral above is
//    SINGLE scattering, so once the sun is below the horizon every sample sits in the planet's shadow and the
//    sky goes black. Real twilight is lit by light scattered two or more times over the limb, which single
//    scattering cannot produce at any sample count. This is the art-directed term, added on top.
vec3 SkyTwilightGlow(vec3 Direction)
{
    const float kPi = 3.14159265358979323846;
    float Altitude = degrees(asin(clamp(Direction.z, -1.0, 1.0)));
    if (Altitude < -2.0) return vec3(0.0);
    float AltitudePositive = max(Altitude, 0.0);

    float SunElevation = SkySunDirection.w;
    float Window = smoothstep(-16.0, -5.0, SunElevation) * (1.0 - smoothstep(0.5, 6.0, SunElevation));
    if (Window <= 0.0) return vec3(0.0);

    // Angle between the view ray's horizontal bearing and the sun's, folded to [0, pi].
    float Bearing    = atan(Direction.x, Direction.y);
    float SunBearing = atan(SkySunDirection.x, SkySunDirection.y);
    float AzimuthDelta = abs(Bearing - SunBearing);
    if (AzimuthDelta > kPi) AzimuthDelta = 2.0 * kPi - AzimuthDelta;

    float Az     = exp(-pow(AzimuthDelta / 0.95, 2.0));
    float AzWide = exp(-pow(AzimuthDelta / 1.8, 2.0));
    float Depth  = clamp(-SunElevation / 10.0, 0.0, 1.0);

    vec3 C0 = vec3(1.00, 0.88, 0.62);
    vec3 C1 = vec3(1.00, 0.62, 0.28);
    vec3 C2 = vec3(0.95, 0.42, 0.30);
    vec3 C3 = vec3(0.62, 0.36, 0.48);
    vec3 C4 = vec3(0.25, 0.30, 0.58);

    float U = log2(1.0 + AltitudePositive * 2.0);
    vec3 Colour = mix(C0, C1, smoothstep(0.0, 1.6, U));
    Colour = mix(Colour, C2, smoothstep(1.6, 2.9, U));
    Colour = mix(Colour, C3, smoothstep(2.9, 4.0, U));
    Colour = mix(Colour, C4, smoothstep(4.0, 5.2, U));
    Colour = mix(Colour, mix(C2, C4, 0.6), Depth * 0.6);

    float H    = mix(1.9, 3.8, Depth);
    float Env  = exp(-AltitudePositive / H) * (1.0 - Depth * 0.35);
    float Rim  = exp(-AltitudePositive / 0.45) * (1.0 - Depth);
    float Lobe = Az * 0.85 + AzWide * 0.15;

    vec3 Glow = (Colour * Env * 0.30 + C0 * Rim * 0.25) * Lobe * Window;

    // The white line: a hairline about 0.11 deg wide — a fifth of the solar disc — gated to civil twilight.
    float LineWindow = SkyTwilight.z > 0.5
        ? smoothstep(-5.5, -2.5, SunElevation) * (1.0 - smoothstep(-0.6, 0.3, SunElevation))
        : 1.0;
    float LineAz = exp(-pow(AzimuthDelta / 0.55, 2.0));
    float Line   = exp(-pow(Altitude / 0.11, 2.0)) * (0.7 + 0.3 * smoothstep(-0.4, 0.0, Altitude));
    Glow += vec3(1.0, 0.98, 0.92) * Line * LineAz * LineWindow * SkyTwilight.y * 0.45;

    // The cool dome fill: the earth's shadow, bluest high up and away from the sun.
    float DomeWindow = smoothstep(-16.0, -8.0, SunElevation) * (1.0 - smoothstep(-2.0, 4.0, SunElevation));
    Glow += vec3(0.10, 0.15, 0.30) * 0.035 * DomeWindow * (1.0 - exp(-AltitudePositive / 6.0)) * (1.0 - 0.5 * Az);

    return Glow * SkyTwilight.x;
}

// What an escaped ray sees: the physical sky plus the twilight approximation.
//
//    This is the ONE entry point the kernel calls, so the two miss branches cannot drift into treating the sky
//    differently — a primary ray and a bounce ray must see the same air.
vec3 SkyAlong(vec3 Direction, vec3 Origin)
{
    if (SkySunRadiance.w <= 0.0) return vec3(0.0);
    vec3 Transmittance;
    bool HitGround;
    vec3 Radiance = SkyRadiance(Direction, Transmittance, HitGround);

    // Clouds sit between the observer and the atmosphere. Compose their in-scatter before stars, moons and the
    //    sun body so all of those are attenuated by the same cloud transmittance. The day factor mirrors the CPU
    //    raster's twilight hand-off: single-scattering clouds do not receive a full sun below the horizon.
    vec3 CloudScatter;
    float CloudTransmittance;
    float CloudDay = smoothstep(-12.0, 0.0, SkySunDirection.w);
    CloudAlong(Origin, Direction, kCloudMaxDistance, SkySunDirection.xyz,
               SkySunRadiance.xyz * CloudDay, Radiance, CloudScatter, CloudTransmittance);
    // Everything below this point is behind the weather too: stars, twilight, the lunar discs and the solar disc
    //    must all use the same cloud transmittance as the atmospheric background. Keep the atmosphere's
    //    transmittance multiplied in the value passed to MoonAlong and the sun body; otherwise clouds would
    //    shade only the blue sky while leaving the brightest celestial sources pasted on top. The sun body also
    //    needs the view transmittance WITHOUT the weather (its reddening floor), so it is captured first.
    vec3 ViewTransmittance = Transmittance;
    Transmittance *= CloudTransmittance;
    Radiance = Radiance * CloudTransmittance + CloudScatter;
    // Aureole compression. Art-directed, twilight precedent: the single-scatter integral near the sun reaches
    //    ~1.5 linear and the ACES curve renders that as near-white — no edge survives, so the sun reads as a
    //    faded blob with no disk. The reference caps its halo the same way ("normalised to its own peak, so it
    //    can never blow out") and draws the disc over the capped glow. Luminance-ratio soft shoulder inside an
    //    angular gate: below the knee the sky passes through untouched (the dome, the horizons, the white line);
    //    above it the peak eases toward the shoulder, so the aureole renders bright-but-not-clipped and the 12x
    //    disc lands on top WITH a sharp edge. One ratio for all channels, so the hue survives; the gate fades
    //    the effect out by ~15 deg off-sun. Function-locals like the disc's own boost (single consumer); the
    //    values MUST equal SkyConstantRecord.h's kAureoleKnee/Slope/Sigma, pairwise-pinned by the parity proof.
    if (!HitGround)
    {
        const float kAureoleKnee  = 1.0;
        const float kAureoleSlope = 0.06;
        const float kAureoleSigma = 5.0 * (3.14159265358979323846 / 180.0);
        float AureoleAng = acos(clamp(dot(Direction, SkySunDirection.xyz), -1.0, 1.0));
        float AureoleLum = dot(Radiance, vec3(0.2126, 0.7152, 0.0722));
        float AureoleGate = exp(-AureoleAng / kAureoleSigma);
        float AureoleTarget = AureoleLum <= kAureoleKnee
            ? AureoleLum : kAureoleKnee + (AureoleLum - kAureoleKnee) * kAureoleSlope;
        float AureoleMix = AureoleLum > 0.0
            ? (AureoleLum + (AureoleTarget - AureoleLum) * AureoleGate) / AureoleLum : 1.0;
        Radiance *= AureoleMix;
    }
    // Stars read the integral's own luminance as their visibility gate — the raster's rule (a star shows only
    //    when it outshines the air behind it), evaluated before the moons and twilight join, exactly where the
    //    raster evaluates it. StarAlong is declared by PostRecords.slang, included before this file.
    if (!HitGround) Radiance += StarAlong(Direction, dot(Radiance, vec3(0.2126, 0.7152, 0.0722))) * CloudTransmittance;
    if (!HitGround) Radiance += SkyTwilightGlow(Direction) * CloudTransmittance;
    // The moons ride the same transmittance the integral measured, and hide behind the planet like the twilight
    //    does. MoonAlong is declared by MoonRecords.slang, which ReSTIRViewport includes BEFORE this file.
    if (!HitGround) Radiance += MoonAlong(Direction, Transmittance);
    // The sun's body. The integral above is skylight only, so without this the sun is a Mie glow with no
    //    source — the "blurred disc". Transcribed term for term from the panel's lines 1238-1242 (spec:
    //    References/CelestialPanel.reference.html): smoothstep-edged disc, limb-darkened, gated near the horizon,
    //    at the panel's own defaults (0.53 deg diameter, 0.25 softness, 12x disc radiance). Every elevation here
    //    is the SUN's (SkySunDirection.w) — the view ray's elevation is nowhere in the panel's disc, and the host
    //    twin (SunDisc::Evaluate) takes no view elevation for exactly that reason. The reddening is the panel's
    //    max(sun-path extinction, view-transmittance-squared): analytic Beer-Lambert through the Kasten-Young air
    //    mass of the SUN elevation, floored by the view ray's own transmittance for the from-altitude case. Two
    //    deliberate differences remain: the disc sits BEHIND the weather (the panel draws it over its clouds; the
    //    engine attenuates — re-audit after the cloud field is fixed, D1e), and the panel's extra analytic
    //    sun-glow (sg) is NOT transcribed — the Mie lobe already provides the forward glow and both would double
    //    it. (Revisited by porting it: sg peaks at ~5 linear against a ~20-linear forward field, <=7 LSB after
    //    the curve, and no honest assertion separates it — so it stays out, and stays documented.) A hidden sun
    //    needs no extra gate: PackSkyRecord zeroes the radiance, which kills the disc while twilight and the
    //    moons live on.
    if (!HitGround)
    {
        float SunAng = acos(clamp(dot(Direction, SkySunDirection.xyz), -1.0, 1.0));
        const float kSunRadius = kSunAngularRadius;   // the shared body: the NEE cone samples this same disc
        const float kSunSoft = 0.25;
        const float kSunBoost = 12.0;
        float SunElev = SkySunDirection.w;
        // The panel evaluates the edge twice and keeps the second (horizon-softened) form; only it is kept here.
        float SunSoftElev = mix(1.0, 2.2, 1.0 - smoothstep(0.0, 4.0, SunElev));
        float SunDisc = 1.0 - smoothstep(kSunRadius * (1.0 - kSunSoft * 0.9 * SunSoftElev), kSunRadius, SunAng);
        float SunLimb = mix(1.0, 0.55, smoothstep(0.0, kSunRadius, SunAng));
        vec3 SunExt = exp(-(SkyRayleigh.xyz * SkyRayleigh.w + vec3(SkyMie.x * 1.1) * SkyMie.y)
                          * SkyAirMass(SunElev));
        vec3 SunCol = SkySunRadiance.xyz * max(SunExt, ViewTransmittance * ViewTransmittance);
        Radiance += SunDisc * SunLimb * SunCol * kSunBoost
                  * mix(0.35, 1.0, smoothstep(-1.0, 8.0, SunElev)) * CloudTransmittance;
    }
    return Radiance;
}

#endif // FRONTIER_SKY_RECORDS
