//==========================================================================================================================================
//                                                      ATMOSPHERESKY.JS
//==========================================================================================================================================
// Browser port of Engine/GeometricRaster/Atmosphere/AtmosphericSkySequence.{h,cpp} (SultanAladin/Frontier-1, branch
// arena/39c6910b-frontier-1 @ 5af9a1b). Same medium, same LUT resolutions and parameterisations, same quadrature:
//   - 256x64 Bruneton spherical-horizon Transmittance LUT (64 quadratic steps)
//   - 32x32 Hillaire 2020 isotropic Multi-Scatter LUT (32 Fibonacci directions x 24 steps, L2 / (1 - Fms))
//   - 192x108 limb-centred Sky-View LUT (rows 0..53 upper sky, rows 54..107 ground / aerial perspective)
//   - Smoothstep-azimuth x Catmull-Rom-polar Sky-View sampler clamped inside each bank
//   - Neckel & Labs limb-darkened photosphere, erfc edge, three-lobe corona and bounded 30 deg glare veil
// Volumetric clouds, moon and starfield CPU parity helpers follow below the sky section.

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONSTANTS
//------------------------------------------------------------------------------------------------------------------------

export const SKY_VIEW_WIDTH = 192;
export const SKY_VIEW_HEIGHT = 108;
export const SKY_VIEW_HALF_HEIGHT = SKY_VIEW_HEIGHT / 2;
export const TRANSMITTANCE_WIDTH = 256;
export const TRANSMITTANCE_HEIGHT = 64;
export const MULTI_SCATTER_WIDTH = 32;
export const MULTI_SCATTER_HEIGHT = 32;

const PI = Math.PI;
const TAU = 2.0 * Math.PI;
const RAD_TO_DEG = 180.0 / Math.PI;
const DEG_TO_RAD = Math.PI / 180.0;

const DEFAULT_VIEWER_ALTITUDE_M = 100.0;
const SEA_LEVEL_RAYLEIGH_SCATTER = [5.802e-6, 13.558e-6, 33.1e-6];
const SEA_LEVEL_MIE_SCATTER = 3.996e-6;
const SEA_LEVEL_MIE_EXTINCTION = 4.40e-6;
const PEAK_OZONE_ABS = [0.650e-6, 1.881e-6, 0.085e-6];

// AtmosphericMediumConfiguration defaults, member for member
export const AtmosphericMediumDefaults = Object.freeze({
  RayleighStrength: 1.0,
  MieStrength: 1.0,
  MieAnisotropy: 0.78,
  OzoneStrength: 1.2,
  RayleighScaleHeightMeters: 8000.0,
  MieScaleHeightMeters: 1200.0,
  AtmosphereThicknessMeters: 60000.0,
  PlanetRadiusMeters: 6360000.0,
  LimbGlowIntensity: 1.0,
  SkyBrightnessMultiplier: 1.0,
  SkyTint: [1.0, 1.0, 1.0],
  GroundAlbedo: [0.045, 0.088, 0.165],
  ObserverAltitudeMeters: 100.0,
});

// Default C++ SolarIntensityScale argument of BuildSkyViewLut (SolarCelestialConfiguration::SolarIntensityMultiplier)
export const DEFAULT_SOLAR_INTENSITY = 22.0;

// Limb polar angle for the default viewer (100 m above a 6360 km planet); GPU samplers bake this literal
export const SKY_VIEW_LIMB_POLAR = 1.576404012;

export const MOON_PRESET_TINTS = [
  [0.94, 0.93, 0.90], // 0: Luna
  [1.00, 0.56, 0.34], // 1: Ember
  [0.76, 0.90, 1.00], // 2: Glacier
  [0.98, 0.88, 0.42], // 3: Sulfur
  [0.72, 0.74, 0.82], // 4: Shroud
  [0.84, 0.96, 0.94], // 5: Shard
];

// Cloud / celestial CPU parity helpers (below) keep their metre-space sphere intersection
const EARTH_RADIUS_M = AtmosphericMediumDefaults.PlanetRadiusMeters;
const OBSERVER_ALT_M = DEFAULT_VIEWER_ALTITUDE_M;

function IntersectSphereDist(originZ, dirZ, radius) {
  const b = originZ * dirZ;
  const c = originZ * originZ - radius * radius;
  const disc = b * b - c;
  if (disc < 0.0) return [-1.0, -1.0];
  const root = Math.sqrt(disc);
  return [-b - root, -b + root];
}

function Clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function ClampUnit(v) {
  return v < -1.0 ? -1.0 : v > 1.0 ? 1.0 : v;
}

//------------------------------------------------------------------------------------------------------------------------
//                                              MEDIUM RESOLUTION (mirror keys -> C++ medium)
//------------------------------------------------------------------------------------------------------------------------

// Resolves the World Mirror atmosphere record (lower-camel keys) into the C++ AtmosphericMediumConfiguration shape
export function ResolveAtmosphericMedium(atmo = {}) {
  const D = AtmosphericMediumDefaults;
  const Num = (Value, Fallback) => (Number.isFinite(Number(Value)) ? Number(Value) : Fallback);
  return {
    RayleighStrength: Math.max(0.0, Num(atmo.rayleigh, D.RayleighStrength)),
    MieStrength: Math.max(0.0, Num(atmo.mie, D.MieStrength)),
    MieAnisotropy: Clamp(Num(atmo.mieG, D.MieAnisotropy), 0.0, 0.99),
    OzoneStrength: Math.max(0.0, Num(atmo.ozone, D.OzoneStrength)),
    RayleighScaleHeightMeters: Math.max(500.0, Num(atmo.rayleighH, D.RayleighScaleHeightMeters)),
    MieScaleHeightMeters: Math.max(200.0, Num(atmo.mieH, D.MieScaleHeightMeters)),
    AtmosphereThicknessMeters: Math.max(10000.0, Num(atmo.atmoTop, D.AtmosphereThicknessMeters)),
    PlanetRadiusMeters: Math.max(500000.0, Num(atmo.planetRadius, D.PlanetRadiusMeters)),
    LimbGlowIntensity: Math.max(0.0, Num(atmo.horizonGlow, D.LimbGlowIntensity)),
    SkyBrightnessMultiplier: Math.max(0.0, Num(atmo.skyBrightness, D.SkyBrightnessMultiplier)),
    SkyTint: Array.isArray(atmo.skyTint) ? atmo.skyTint : D.SkyTint,
    GroundAlbedo: Array.isArray(atmo.groundAlbedo) ? atmo.groundAlbedo : D.GroundAlbedo,
    ObserverAltitudeMeters: Math.max(5.0, Num(atmo.observerAltitude, D.ObserverAltitudeMeters)),
    SolarIntensity: Math.max(0.0, Num(atmo.solarIntensity, DEFAULT_SOLAR_INTENSITY)),
    Enabled: atmo.enabled !== false,
  };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 SPHERICAL GEOMETRY (km)
//------------------------------------------------------------------------------------------------------------------------

function ComputeHorizonDistanceKm(BottomKm, TopKm) {
  return Math.sqrt(Math.max(0.0, (TopKm - BottomKm) * (TopKm + BottomKm)));
}

function QuerySphereBlockedKm(RadiusKm, CosPolar, TargetKm) {
  if (CosPolar >= 0.0) return false;
  const Disc = RadiusKm * RadiusKm * CosPolar * CosPolar - (RadiusKm - TargetKm) * (RadiusKm + TargetKm);
  return Disc >= 0.0 && RadiusKm > TargetKm + 1.0e-4;
}

function IntersectUpperSphereDistanceKm(RadiusKm, CosPolar, TopKm) {
  const Disc = Math.max(0.0, RadiusKm * RadiusKm * CosPolar * CosPolar + (TopKm - RadiusKm) * (TopKm + RadiusKm));
  return Math.max(0.0, -RadiusKm * CosPolar + Math.sqrt(Disc));
}

// Returns the ground hit distance or -1 when the ray misses the planet
function IntersectLowerSphereDistanceKm(RadiusKm, CosPolar, BottomKm) {
  const Disc = RadiusKm * RadiusKm * CosPolar * CosPolar - (RadiusKm - BottomKm) * (RadiusKm + BottomKm);
  if (CosPolar < 0.0 && Disc >= 0.0) {
    const Hit = -RadiusKm * CosPolar - Math.sqrt(Disc);
    if (Hit > 0.0) return Hit;
  }
  return -1.0;
}

export function ComputeLimbPolarAngle(ViewerRadiusKm, BottomKm) {
  const SafeR = Math.max(BottomKm + 1.0e-4, ViewerRadiusKm);
  const Tangent = Math.sqrt(Math.max(0.0, (SafeR - BottomKm) * (SafeR + BottomKm)));
  return Math.acos(ClampUnit(-Tangent / SafeR));
}

// Medium coefficients in km^-1 at an altitude in km, written into Out = [RayR, RayG, RayB, Mie, ExtR, ExtG, ExtB]
function EvaluateMediumAtAltitudeKm(AltKm, M, Out) {
  const AltM = Math.max(0.0, AltKm * 1000.0);
  const DenR = Math.exp(-AltM / M.RayleighScaleHeightMeters) * M.RayleighStrength;
  const DenM = Math.exp(-AltM / M.MieScaleHeightMeters) * M.MieStrength;
  const DenO = Math.max(0.0, 1.0 - Math.abs(AltM - 25000.0) / 15000.0) * M.OzoneStrength;
  Out[0] = SEA_LEVEL_RAYLEIGH_SCATTER[0] * 1000.0 * DenR;
  Out[1] = SEA_LEVEL_RAYLEIGH_SCATTER[1] * 1000.0 * DenR;
  Out[2] = SEA_LEVEL_RAYLEIGH_SCATTER[2] * 1000.0 * DenR;
  Out[3] = SEA_LEVEL_MIE_SCATTER * 1000.0 * DenM;
  const MieExt = SEA_LEVEL_MIE_EXTINCTION * 1000.0 * DenM;
  Out[4] = Out[0] + MieExt + PEAK_OZONE_ABS[0] * 1000.0 * DenO;
  Out[5] = Out[1] + MieExt + PEAK_OZONE_ABS[1] * 1000.0 * DenO;
  Out[6] = Out[2] + MieExt + PEAK_OZONE_ABS[2] * 1000.0 * DenO;
  return Out;
}

// Bilinear RGB fetch of a tightly packed 3-channel LUT into Out[0..2]
function SampleLut2DBilinearRgb(Lut, Width, Height, U, V, Out) {
  const FX = Clamp(U, 0.0, 1.0) * (Width - 1);
  const FY = Clamp(V, 0.0, 1.0) * (Height - 1);
  const X0 = Math.min(Width - 2, Math.floor(FX));
  const Y0 = Math.min(Height - 2, Math.floor(FY));
  const TX = FX - X0;
  const TY = FY - Y0;
  const I00 = (Y0 * Width + X0) * 3;
  const I10 = I00 + 3;
  const I01 = I00 + Width * 3;
  const I11 = I01 + 3;
  for (let C = 0; C < 3; ++C) {
    const A = Lut[I00 + C] + (Lut[I10 + C] - Lut[I00 + C]) * TX;
    const B = Lut[I01 + C] + (Lut[I11 + C] - Lut[I01 + C]) * TX;
    Out[C] = A + (B - A) * TY;
  }
  return Out;
}

function SampleTransmittanceSphericalLut(Lut, RadiusKm, CosPolar, BottomKm, TopKm, Out) {
  if (QuerySphereBlockedKm(RadiusKm, CosPolar, BottomKm)) {
    Out[0] = 0.0; Out[1] = 0.0; Out[2] = 0.0;
    return Out;
  }
  const ClampedR = Clamp(RadiusKm, BottomKm, TopKm);
  const HorizonKm = ComputeHorizonDistanceKm(BottomKm, TopKm);
  const RhoKm = Math.sqrt(Math.max(0.0, (ClampedR - BottomKm) * (ClampedR + BottomKm)));
  const DistTopKm = IntersectUpperSphereDistanceKm(ClampedR, ClampUnit(CosPolar), TopKm);
  const DMinKm = Math.max(0.0, TopKm - ClampedR);
  const DMaxKm = RhoKm + HorizonKm;
  const U = Clamp((DistTopKm - DMinKm) / Math.max(1.0e-5, DMaxKm - DMinKm), 0.0, 1.0);
  const V = Clamp(RhoKm / Math.max(1.0e-5, HorizonKm), 0.0, 1.0);
  return SampleLut2DBilinearRgb(Lut, TRANSMITTANCE_WIDTH, TRANSMITTANCE_HEIGHT, U, V, Out);
}

function SampleMultiScatterGridLut(Lut, AltKm, SolarCos, ThicknessKm, Out) {
  const U = Clamp(0.5 * (SolarCos + 1.0), 0.0, 1.0);
  const V = Math.sqrt(Clamp(AltKm / Math.max(1.0e-3, ThicknessKm), 0.0, 1.0));
  return SampleLut2DBilinearRgb(Lut, MULTI_SCATTER_WIDTH, MULTI_SCATTER_HEIGHT, U, V, Out);
}

//------------------------------------------------------------------------------------------------------------------------
//                                            SKY-VIEW PARAMETERISATION (limb split)
//------------------------------------------------------------------------------------------------------------------------

// Texel-centre (u, v) in [0, 1] -> world direction, matching the C++ LUT bake rows
export function ReconstructSkyViewDirection(u, v, LimbAngle = SKY_VIEW_LIMB_POLAR) {
  const H = SKY_VIEW_HEIGHT;
  const HalfH = SKY_VIEW_HALF_HEIGHT;
  const Row = Clamp(Math.floor(v * H), 0, H - 1);
  const LowerBank = Row >= HalfH;
  const LocalV = LowerBank ? (Row - HalfH) / (HalfH - 1) : Row / (HalfH - 1);
  const Polar = LowerBank
    ? Math.min(PI - 1.0e-5, LimbAngle + (PI - LimbAngle) * LocalV * LocalV + 1.5e-4)
    : Math.max(0.0, LimbAngle * (1.0 - LocalV * LocalV) - 1.5e-4);
  const Azimuth = (u - 0.5) * TAU;
  const SinPolar = Math.sin(Polar);
  return [SinPolar * Math.cos(Azimuth), SinPolar * Math.sin(Azimuth), Math.cos(Polar)];
}

// World direction -> { U, CoordY (texel-index space), BankMin, BankMax } exactly as SampleSkyViewDirection resolves it
export function ResolveSkyViewCoordinates(dx, dy, dz, LimbAngle = SKY_VIEW_LIMB_POLAR) {
  const HalfH = SKY_VIEW_HALF_HEIGHT;
  const Azimuth = Math.atan2(dy, dx);
  const Polar = Math.acos(ClampUnit(dz));
  let U = Azimuth / TAU + 0.5;
  U -= Math.floor(U);
  const LowerBank = Polar > LimbAngle;
  let CoordY;
  if (!LowerBank) {
    const Q = Math.sqrt(Clamp(1.0 - Polar / Math.max(1.0e-4, LimbAngle), 0.0, 1.0));
    CoordY = Q * (HalfH - 1);
  } else {
    const Q = Math.sqrt(Clamp((Polar - LimbAngle) / Math.max(1.0e-4, PI - LimbAngle), 0.0, 1.0));
    CoordY = HalfH + Q * (HalfH - 1);
  }
  return { U, CoordY, BankMin: LowerBank ? HalfH : 0, BankMax: LowerBank ? HalfH * 2 - 1 : HalfH - 1 };
}

// Normalised texture coordinates for hardware samplers (texel-centred V stays inside its bank)
export function ProjectSkyViewCoordinates(dx, dy, dz) {
  const R = ResolveSkyViewCoordinates(dx, dy, dz);
  return [R.U, (R.CoordY + 0.5) / SKY_VIEW_HEIGHT];
}

//------------------------------------------------------------------------------------------------------------------------
//                                                SOLAR TRANSMITTANCE
//------------------------------------------------------------------------------------------------------------------------

const _Coeff = new Float32Array(7);

// Exact 64-step quadratic optical depth from the observer towards SunDirection (C++ ComputeSolarTransmittance)
export function ComputeSolarTransmittance(sunDir, atmo = {}, ObserverAltitudeMeters = null) {
  const M = ResolveAtmosphericMedium(atmo);
  const GroundKm = Math.max(500.0, M.PlanetRadiusMeters * 0.001);
  const ThicknessKm = Math.max(10.0, M.AtmosphereThicknessMeters * 0.001);
  const TopKm = GroundKm + ThicknessKm;
  const AltKm = Math.max(0.001, (ObserverAltitudeMeters ?? M.ObserverAltitudeMeters) * 0.001);
  if (AltKm >= ThicknessKm) return [1.0, 1.0, 1.0];

  const SunMag = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  const CosPolar = SunMag > 1.0e-6 ? ClampUnit(sunDir[2] / SunMag) : 1.0;
  const RadiusKm = GroundKm + AltKm;
  if (QuerySphereBlockedKm(RadiusKm, CosPolar, GroundKm)) return [0.0, 0.0, 0.0];
  const DistTopKm = IntersectUpperSphereDistanceKm(RadiusKm, CosPolar, TopKm);
  if (DistTopKm <= 1.0e-5) return [1.0, 1.0, 1.0];

  const TransSteps = 64;
  let OptR = 0.0, OptG = 0.0, OptB = 0.0;
  for (let S = 0; S < TransSteps; ++S) {
    const F0 = S / TransSteps;
    const F1 = (S + 1) / TransSteps;
    const T0 = DistTopKm * F0 * F0;
    const T1 = DistTopKm * F1 * F1;
    const T = 0.5 * (T0 + T1);
    const Step = Math.max(1.0e-5, T1 - T0);
    const RK = Math.sqrt(Math.max(GroundKm * GroundKm, RadiusKm * RadiusKm + 2.0 * RadiusKm * CosPolar * T + T * T));
    EvaluateMediumAtAltitudeKm(RK - GroundKm, M, _Coeff);
    OptR += _Coeff[4] * Step;
    OptG += _Coeff[5] * Step;
    OptB += _Coeff[6] * Step;
  }
  return [Math.exp(-OptR), Math.exp(-OptG), Math.exp(-OptB)];
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   LUT CACHE KEYS
//------------------------------------------------------------------------------------------------------------------------

function MediumCacheKey(M) {
  return [
    M.RayleighStrength.toFixed(4),
    M.MieStrength.toFixed(4),
    M.OzoneStrength.toFixed(4),
    Math.round(M.RayleighScaleHeightMeters),
    Math.round(M.MieScaleHeightMeters),
    Math.round(M.AtmosphereThicknessMeters),
    Math.round(M.PlanetRadiusMeters),
    M.GroundAlbedo.map((C) => Number(C).toFixed(3)).join(","),
  ].join("|");
}

export function GetSkyViewCacheKey(sunDir, atmo = {}) {
  const M = ResolveAtmosphericMedium(atmo);
  return [
    sunDir[0].toFixed(4),
    sunDir[1].toFixed(4),
    sunDir[2].toFixed(4),
    MediumCacheKey(M),
    M.MieAnisotropy.toFixed(3),
    M.LimbGlowIntensity.toFixed(2),
    M.SkyBrightnessMultiplier.toFixed(2),
    M.SkyTint.map((C) => Number(C).toFixed(2)).join(","),
    Math.round(M.ObserverAltitudeMeters),
    M.SolarIntensity.toFixed(2),
    M.Enabled ? "1" : "0",
  ].join("|");
}

//------------------------------------------------------------------------------------------------------------------------
//                                    FOUNDATION LUTS (Transmittance 256x64 + Multi-Scatter 32x32)
//------------------------------------------------------------------------------------------------------------------------

let FoundationKey = "";
let TransmittanceTexelsRgb = null;
let MultiScatterTexelsRgb = null;

function BuildFoundationLuts(M, GroundKm, TopKm, ThicknessKm) {
  const Key = MediumCacheKey(M);
  if (Key === FoundationKey && TransmittanceTexelsRgb && MultiScatterTexelsRgb) return;
  FoundationKey = Key;
  const C = new Float32Array(7);
  const SunT = new Float32Array(3);

  // Pass 1: 256x64 Bruneton/Hillaire spherical-horizon Transmittance LUT (64 quadratic Fraction^2 steps)
  const Trans = new Float32Array(TRANSMITTANCE_WIDTH * TRANSMITTANCE_HEIGHT * 3).fill(1.0);
  const HorizonKm = ComputeHorizonDistanceKm(GroundKm, TopKm);
  const TransSteps = 64;
  for (let Y = 0; Y < TRANSMITTANCE_HEIGHT; ++Y) {
    const V = Y / (TRANSMITTANCE_HEIGHT - 1);
    const RhoKm = V * HorizonKm;
    const RadiusKm = Math.sqrt(RhoKm * RhoKm + GroundKm * GroundKm);
    const DMinKm = Math.max(0.0, TopKm - RadiusKm);
    const DMaxKm = RhoKm + HorizonKm;
    for (let X = 0; X < TRANSMITTANCE_WIDTH; ++X) {
      const U = X / (TRANSMITTANCE_WIDTH - 1);
      const DistTopKm = DMinKm + U * (DMaxKm - DMinKm);
      const CosPolar = DistTopKm <= 1.0e-5
        ? 1.0
        : ClampUnit((HorizonKm * HorizonKm - RhoKm * RhoKm - DistTopKm * DistTopKm) / (2.0 * RadiusKm * DistTopKm));
      let OptR = 0.0, OptG = 0.0, OptB = 0.0;
      for (let S = 0; S < TransSteps; ++S) {
        const F0 = S / TransSteps;
        const F1 = (S + 1) / TransSteps;
        const T0 = DistTopKm * F0 * F0;
        const T1 = DistTopKm * F1 * F1;
        const T = 0.5 * (T0 + T1);
        const Step = Math.max(1.0e-5, T1 - T0);
        const RK = Math.sqrt(Math.max(GroundKm * GroundKm, RadiusKm * RadiusKm + 2.0 * RadiusKm * CosPolar * T + T * T));
        EvaluateMediumAtAltitudeKm(RK - GroundKm, M, C);
        OptR += C[4] * Step;
        OptG += C[5] * Step;
        OptB += C[6] * Step;
      }
      const Idx = (Y * TRANSMITTANCE_WIDTH + X) * 3;
      Trans[Idx] = Math.exp(-OptR);
      Trans[Idx + 1] = Math.exp(-OptG);
      Trans[Idx + 2] = Math.exp(-OptB);
    }
  }

  // Pass 2: 32x32 isotropic infinite-order Multi-Scatter LUT (Hillaire 2020 Fibonacci 32 dirs x 24 steps -> L_2nd / (1 - f_ms))
  const Multi = new Float32Array(MULTI_SCATTER_WIDTH * MULTI_SCATTER_HEIGHT * 3);
  const MsDirs = 32;
  const MsSteps = 24;
  const GoldenRatio = 1.6180339887498948482;
  const InvFourPi = 1.0 / (4.0 * PI);
  const InvDirs = 1.0 / MsDirs;
  const Albedo = M.GroundAlbedo;
  for (let Y = 0; Y < MULTI_SCATTER_HEIGHT; ++Y) {
    const V = Y / (MULTI_SCATTER_HEIGHT - 1);
    const AltKm = Clamp(V * V * ThicknessKm, 0.01, Math.max(0.02, ThicknessKm - 0.01));
    const RadiusKm = GroundKm + AltKm;
    for (let X = 0; X < MULTI_SCATTER_WIDTH; ++X) {
      const U = X / (MULTI_SCATTER_WIDTH - 1);
      const SunCos = ClampUnit(2.0 * U - 1.0);
      const SunSin = Math.sqrt(Math.max(0.0, 1.0 - SunCos * SunCos));
      let Lum2R = 0.0, Lum2G = 0.0, Lum2B = 0.0;
      let FmsR = 0.0, FmsG = 0.0, FmsB = 0.0;
      for (let D = 0; D < MsDirs; ++D) {
        const CosPhi = 1.0 - 2.0 * (D + 0.5) * InvDirs;
        const SinPhi = Math.sqrt(Math.max(0.0, 1.0 - CosPhi * CosPhi));
        const Theta = (TAU * (D + 0.5)) / GoldenRatio;
        const DirX = SinPhi * Math.cos(Theta);
        const DirZ = CosPhi;
        const RaySunCos = ClampUnit(DirX * SunSin + DirZ * SunCos);
        const GroundD = IntersectLowerSphereDistanceKm(RadiusKm, DirZ, GroundKm);
        const HitsGround = GroundD > 0.0;
        const MaxD = HitsGround ? GroundD : IntersectUpperSphereDistanceKm(RadiusKm, DirZ, TopKm);
        if (MaxD <= 1.0e-5) continue;
        const Step = MaxD / MsSteps;
        let TR = 1.0, TG = 1.0, TB = 1.0;
        let RayL2R = 0.0, RayL2G = 0.0, RayL2B = 0.0;
        let RayFmsR = 0.0, RayFmsG = 0.0, RayFmsB = 0.0;
        for (let S = 0; S < MsSteps; ++S) {
          const T = (S + 0.5) * Step;
          const RK = Math.sqrt(Math.max(GroundKm * GroundKm, RadiusKm * RadiusKm + 2.0 * RadiusKm * DirZ * T + T * T));
          EvaluateMediumAtAltitudeKm(RK - GroundKm, M, C);
          const SafeER = Math.max(1.0e-7, C[4]);
          const SafeEG = Math.max(1.0e-7, C[5]);
          const SafeEB = Math.max(1.0e-7, C[6]);
          const SegTR = Math.exp(-SafeER * Step);
          const SegTG = Math.exp(-SafeEG * Step);
          const SegTB = Math.exp(-SafeEB * Step);
          const IntR = (1.0 - SegTR) / SafeER;
          const IntG = (1.0 - SegTG) / SafeEG;
          const IntB = (1.0 - SegTB) / SafeEB;
          const ScatR = C[0] + C[3];
          const ScatG = C[1] + C[3];
          const ScatB = C[2] + C[3];
          const SampleSunCos = ClampUnit((RadiusKm * SunCos + T * RaySunCos) / RK);
          SampleTransmittanceSphericalLut(Trans, RK, SampleSunCos, GroundKm, TopKm, SunT);
          RayL2R += TR * ScatR * InvFourPi * SunT[0] * IntR;
          RayL2G += TG * ScatG * InvFourPi * SunT[1] * IntG;
          RayL2B += TB * ScatB * InvFourPi * SunT[2] * IntB;
          RayFmsR += TR * ScatR * IntR;
          RayFmsG += TG * ScatG * IntG;
          RayFmsB += TB * ScatB * IntB;
          TR *= SegTR;
          TG *= SegTG;
          TB *= SegTB;
        }
        if (HitsGround) {
          const HitSunCos = ClampUnit((RadiusKm * SunCos + MaxD * RaySunCos) / GroundKm);
          if (HitSunCos > 0.0) {
            SampleTransmittanceSphericalLut(Trans, GroundKm, HitSunCos, GroundKm, TopKm, SunT);
            const DiffFactor = HitSunCos / PI;
            RayL2R += TR * Albedo[0] * SunT[0] * DiffFactor;
            RayL2G += TG * Albedo[1] * SunT[1] * DiffFactor;
            RayL2B += TB * Albedo[2] * SunT[2] * DiffFactor;
          }
        }
        // 4*pi / MsDirs * (1/(4*pi)) == 1 / MsDirs for isotropic multi-scatter spherical integration
        Lum2R += RayL2R * InvDirs;
        Lum2G += RayL2G * InvDirs;
        Lum2B += RayL2B * InvDirs;
        FmsR += RayFmsR * InvDirs;
        FmsG += RayFmsG * InvDirs;
        FmsB += RayFmsB * InvDirs;
      }
      const Idx = (Y * MULTI_SCATTER_WIDTH + X) * 3;
      Multi[Idx] = Lum2R / Math.max(1.0e-3, 1.0 - Math.min(0.95, FmsR));
      Multi[Idx + 1] = Lum2G / Math.max(1.0e-3, 1.0 - Math.min(0.95, FmsG));
      Multi[Idx + 2] = Lum2B / Math.max(1.0e-3, 1.0 - Math.min(0.95, FmsB));
    }
  }

  TransmittanceTexelsRgb = Trans;
  MultiScatterTexelsRgb = Multi;
}

//------------------------------------------------------------------------------------------------------------------------
//                                          SKY-VIEW LUT (192x108 limb-centred, RGBA32F)
//------------------------------------------------------------------------------------------------------------------------

export function BuildSkyViewLut(sunDir, atmo = {}, outBuf = null) {
  const W = SKY_VIEW_WIDTH;
  const H = SKY_VIEW_HEIGHT;
  const Radiance = outBuf && outBuf.length === W * H * 4 ? outBuf : new Float32Array(W * H * 4);
  const M = ResolveAtmosphericMedium(atmo);

  if (!M.Enabled) {
    for (let I = 0; I < W * H; ++I) {
      Radiance[I * 4] = 0.008;
      Radiance[I * 4 + 1] = 0.010;
      Radiance[I * 4 + 2] = 0.016;
      Radiance[I * 4 + 3] = 1.0;
    }
    return Radiance;
  }

  const SunMag = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  const SunX = SunMag > 1.0e-6 ? sunDir[0] / SunMag : 0.0;
  const SunY = SunMag > 1.0e-6 ? sunDir[1] / SunMag : 0.0;
  const SunZ = SunMag > 1.0e-6 ? sunDir[2] / SunMag : 1.0;

  const GroundKm = Math.max(500.0, M.PlanetRadiusMeters * 0.001);
  const ThicknessKm = Math.max(10.0, M.AtmosphereThicknessMeters * 0.001);
  const TopKm = GroundKm + ThicknessKm;
  const MieG = M.MieAnisotropy;
  const EffectiveAltM = Clamp(M.ObserverAltitudeMeters > 0.0 ? M.ObserverAltitudeMeters : DEFAULT_VIEWER_ALTITUDE_M, 5.0, Math.max(100.0, (ThicknessKm - 0.05) * 1000.0));
  const StartRadiusKm = GroundKm + EffectiveAltM * 0.001;

  BuildFoundationLuts(M, GroundKm, TopKm, ThicknessKm);
  const Trans = TransmittanceTexelsRgb;
  const Multi = MultiScatterTexelsRgb;

  const HalfH = SKY_VIEW_HALF_HEIGHT;
  const SkySteps = 40;
  const GndSteps = 28;
  const LimbAngle = ComputeLimbPolarAngle(StartRadiusKm, GroundKm);
  const SunElevRad = Math.asin(ClampUnit(SunZ));
  const DayVis = Clamp((SunElevRad * RAD_TO_DEG + 6.0) / 14.0, 0.0, 1.0);
  const SolarScale = Math.max(0.0, M.SolarIntensity) * 0.28;
  const G2 = MieG * MieG;
  const Tint = M.SkyTint;
  const Bright = M.SkyBrightnessMultiplier;
  const Albedo = M.GroundAlbedo;
  const C = new Float32Array(7);
  const SunT = new Float32Array(3);
  const Ms = new Float32Array(3);
  // Per-row march terms depend only on (polar, step); hoisting them out of the azimuth loop keeps the arithmetic identical
  const MaxSteps = Math.max(SkySteps, GndSteps);
  const StepT = new Float64Array(MaxSteps);
  const StepRK = new Float64Array(MaxSteps);
  const StepAlt = new Float64Array(MaxSteps);
  const StepCoeff = new Float64Array(MaxSteps * 4);
  const StepSeg = new Float64Array(MaxSteps * 3);
  const StepInt = new Float64Array(MaxSteps * 3);
  const GroundSunT = new Float32Array(3);
  const GroundMulti = new Float32Array(3);

  for (let Y = 0; Y < H; ++Y) {
    const LowerBank = Y >= HalfH;
    const LocalV = LowerBank ? (Y - HalfH) / (HalfH - 1) : Y / (HalfH - 1);
    const PolarAngle = LowerBank
      ? Math.min(PI - 1.0e-5, LimbAngle + (PI - LimbAngle) * LocalV * LocalV + 1.5e-4)
      : Math.max(0.0, LimbAngle * (1.0 - LocalV * LocalV) - 1.5e-4);
    const CosPolar = Math.cos(PolarAngle);
    const SinPolar = Math.sqrt(Math.max(0.0, 1.0 - CosPolar * CosPolar));
    const LimbFactor = Math.exp(-Math.max(0.0, CosPolar) * 7.5);
    const GlowScale = 1.0 + (M.LimbGlowIntensity - 1.0) * LimbFactor * 0.55;

    const GroundDistKm = LowerBank ? IntersectLowerSphereDistanceKm(StartRadiusKm, CosPolar, GroundKm) : -1.0;
    const HitsGround = LowerBank && GroundDistKm > 0.0;
    const MaxDistKm = HitsGround ? Math.max(0.005, GroundDistKm) : IntersectUpperSphereDistanceKm(StartRadiusKm, CosPolar, TopKm);
    const Steps = LowerBank ? GndSteps : SkySteps;

    const NightR = 0.0007 + 0.0008 * LimbFactor;
    const NightG = 0.0010 + 0.0011 * LimbFactor;
    const NightB = 0.0022 + 0.0020 * LimbFactor;
    const NightFade = 1.0 - DayVis * 0.9;

    for (let S = 0; S < Steps; ++S) {
      const F0 = S / Steps;
      const F1 = (S + 1) / Steps;
      const T0 = MaxDistKm * F0 * F0;
      const T1 = MaxDistKm * F1 * F1;
      const T = 0.5 * (T0 + T1);
      const Step = Math.max(1.0e-5, T1 - T0);
      const RK = Math.sqrt(Math.max(GroundKm * GroundKm, StartRadiusKm * StartRadiusKm + 2.0 * StartRadiusKm * CosPolar * T + T * T));
      const AltKm = Math.max(0.0, RK - GroundKm);
      EvaluateMediumAtAltitudeKm(AltKm, M, C);
      StepT[S] = T;
      StepRK[S] = RK;
      StepAlt[S] = AltKm;
      StepCoeff[S * 4] = C[0];
      StepCoeff[S * 4 + 1] = C[1];
      StepCoeff[S * 4 + 2] = C[2];
      StepCoeff[S * 4 + 3] = C[3];
      for (let Ch = 0; Ch < 3; ++Ch) {
        const SafeE = Math.max(1.0e-7, C[4 + Ch]);
        const Seg = Math.exp(-SafeE * Step);
        StepSeg[S * 3 + Ch] = Seg;
        StepInt[S * 3 + Ch] = (1.0 - Seg) / SafeE;
      }
    }

    for (let X = 0; X < W; ++X) {
      const U = (X + 0.5) / W;
      const Azimuth = (U - 0.5) * TAU;
      const RdX = SinPolar * Math.cos(Azimuth);
      const RdY = SinPolar * Math.sin(Azimuth);
      const RdZ = CosPolar;

      const CosTheta = RdX * SunX + RdY * SunY + RdZ * SunZ;
      const PhaseR = (3.0 / (16.0 * PI)) * (1.0 + CosTheta * CosTheta);
      const Denom = Math.max(1.0e-3, 1.0 + G2 - 2.0 * MieG * CosTheta);
      const PhaseM = ((3.0 / (8.0 * PI)) * ((1.0 - G2) * (1.0 + CosTheta * CosTheta))) / ((2.0 + G2) * Math.pow(Denom, 1.5));

      let TR = 1.0, TG = 1.0, TB = 1.0;
      let RadR = 0.0, RadG = 0.0, RadB = 0.0;
      for (let S = 0; S < Steps; ++S) {
        const RK = StepRK[S];
        const SampleSunCos = ClampUnit((StartRadiusKm * SunZ + StepT[S] * CosTheta) / RK);
        SampleTransmittanceSphericalLut(Trans, RK, SampleSunCos, GroundKm, TopKm, SunT);
        SampleMultiScatterGridLut(Multi, StepAlt[S], SampleSunCos, ThicknessKm, Ms);
        const CR = StepCoeff[S * 4], CG = StepCoeff[S * 4 + 1], CB = StepCoeff[S * 4 + 2], CM = StepCoeff[S * 4 + 3];
        const ScR = CR * PhaseR + CM * PhaseM;
        const ScG = CG * PhaseR + CM * PhaseM;
        const ScB = CB * PhaseR + CM * PhaseM;
        RadR += TR * (ScR * SunT[0] + (CR + CM) * Ms[0]) * StepInt[S * 3];
        RadG += TG * (ScG * SunT[1] + (CG + CM) * Ms[1]) * StepInt[S * 3 + 1];
        RadB += TB * (ScB * SunT[2] + (CB + CM) * Ms[2]) * StepInt[S * 3 + 2];
        TR *= StepSeg[S * 3];
        TG *= StepSeg[S * 3 + 1];
        TB *= StepSeg[S * 3 + 2];
      }

      if (HitsGround) {
        const HitSunCos = ClampUnit((StartRadiusKm * SunZ + MaxDistKm * CosTheta) / GroundKm);
        if (HitSunCos > 0.0) SampleTransmittanceSphericalLut(Trans, GroundKm, HitSunCos, GroundKm, TopKm, GroundSunT);
        else GroundSunT.fill(0.0);
        SampleMultiScatterGridLut(Multi, 0.0, HitSunCos, ThicknessKm, GroundMulti);
        const SunTerm = Math.max(0.0, HitSunCos) / PI;
        RadR += TR * Albedo[0] * (GroundSunT[0] * SunTerm + GroundMulti[0] * 0.70);
        RadG += TG * Albedo[1] * (GroundSunT[1] * SunTerm + GroundMulti[1] * 0.70);
        RadB += TB * Albedo[2] * (GroundSunT[2] * SunTerm + GroundMulti[2] * 0.70);
      }

      let OutR = (RadR * SolarScale * GlowScale + NightR * NightFade) * Tint[0] * Bright;
      let OutG = (RadG * SolarScale * GlowScale + NightG * NightFade) * Tint[1] * Bright;
      let OutB = (RadB * SolarScale * GlowScale + NightB * NightFade) * Tint[2] * Bright;

      if (LowerBank) {
        // True grazing Schlick Fresnel reflection near the lower limb blended cleanly against upper-limb row 0
        const LimbIdx = X * 4;
        const Grazing = Math.pow(1.0 - Clamp(-CosPolar, 0.0, 1.0), 5.0);
        const Fresnel = 0.02 + 0.98 * Grazing;
        OutR = OutR * (1.0 - Fresnel) + Radiance[LimbIdx] * Fresnel;
        OutG = OutG * (1.0 - Fresnel) + Radiance[LimbIdx + 1] * Fresnel;
        OutB = OutB * (1.0 - Fresnel) + Radiance[LimbIdx + 2] * Fresnel;
      }

      const Idx = (Y * W + X) * 4;
      Radiance[Idx] = Math.max(0.0, OutR);
      Radiance[Idx + 1] = Math.max(0.0, OutG);
      Radiance[Idx + 2] = Math.max(0.0, OutB);
      Radiance[Idx + 3] = 1.0;
    }
  }
  return Radiance;
}

//------------------------------------------------------------------------------------------------------------------------
//                                               SKY-VIEW SAMPLER (C++ parity)
//------------------------------------------------------------------------------------------------------------------------

function CatmullRom(P0, P1, P2, P3, T) {
  const T2 = T * T;
  const T3 = T2 * T;
  return 0.5 * (2.0 * P1 + (-P0 + P2) * T + (2.0 * P0 - 5.0 * P1 + 4.0 * P2 - P3) * T2 + (-P0 + 3.0 * P1 - 3.0 * P2 + P3) * T3);
}

// Smoothstep azimuth x Catmull-Rom polar sampling clamped inside the resolved bank, written into Out[0..2]
export function SampleSkyViewInto(lut, dx, dy, dz, Out) {
  const W = SKY_VIEW_WIDTH;
  const R = ResolveSkyViewCoordinates(dx, dy, dz);
  const FX = R.U * W - 0.5;
  const IX0 = ((Math.floor(FX) % W) + W) % W;
  const IX1 = (IX0 + 1) % W;
  const TX = FX - Math.floor(FX);
  const SX = TX * TX * (3.0 - 2.0 * TX);
  const IY1 = Clamp(Math.floor(R.CoordY), R.BankMin, R.BankMax);
  const IY0 = Clamp(IY1 - 1, R.BankMin, R.BankMax);
  const IY2 = Clamp(IY1 + 1, R.BankMin, R.BankMax);
  const IY3 = Clamp(IY1 + 2, R.BankMin, R.BankMax);
  const TY = Clamp(R.CoordY - IY1, 0.0, 1.0);
  for (let Ch = 0; Ch < 3; ++Ch) {
    const Row = (IY) => {
      const A = lut[(IY * W + IX0) * 4 + Ch];
      const B = lut[(IY * W + IX1) * 4 + Ch];
      return A + (B - A) * SX;
    };
    Out[Ch] = Math.max(0.0, CatmullRom(Row(IY0), Row(IY1), Row(IY2), Row(IY3), TY));
  }
  return Out;
}

export function SampleSkyViewLutCpu(lut, dx, dy, dz) {
  if (!lut) return [0.18, 0.31, 0.54];
  return SampleSkyViewInto(lut, dx, dy, dz, [0.0, 0.0, 0.0]);
}

//------------------------------------------------------------------------------------------------------------------------
//                                          SOLAR DISC, CORONA & GLARE (C++ parity)
//------------------------------------------------------------------------------------------------------------------------

export function EvaluateSolarErf(Argument) {
  const Variable = 1.0 / (1.0 + 0.3275911 * Math.abs(Argument));
  const Polynomial = ((((1.061405429 * Variable - 1.453152027) * Variable + 1.421413741) * Variable - 0.284496736) * Variable + 0.254829592) * Variable;
  const Result = 1.0 - Polynomial * Math.exp(-Argument * Argument);
  return Argument < 0.0 ? -Result : Result;
}

// Neckel & Labs (1994, Solar Physics 153) limb darkening at 650 / 550 / 450 nm
export function EvaluateNeckelLabsLimbDarkening(MuPhotosphere) {
  const Mu = Clamp(MuPhotosphere, 0.0, 1.0);
  const Mu2 = Mu * Mu;
  const Mu3 = Mu2 * Mu;
  const Mu4 = Mu2 * Mu2;
  const Mu5 = Mu4 * Mu;
  return [
    Clamp(0.34685 + 1.37539 * Mu - 2.04425 * Mu2 + 2.70493 * Mu3 - 1.94290 * Mu4 + 0.55999 * Mu5, 0.0, 1.05),
    Clamp(0.23698 + 1.37916 * Mu - 1.83226 * Mu2 + 2.34540 * Mu3 - 1.65319 * Mu4 + 0.52391 * Mu5, 0.0, 1.05),
    Clamp(0.11903 + 1.24089 * Mu - 1.19977 * Mu2 + 1.33936 * Mu3 - 0.98690 * Mu4 + 0.48739 * Mu5, 0.0, 1.05),
  ];
}

export function EvaluateSolarGlareSpread(SeparationRadians, DiscRadiusRadians) {
  const Reach = 30.0 * DEG_TO_RAD;
  if (SeparationRadians >= Reach) return 0.0;
  const SepDegrees = SeparationRadians * RAD_TO_DEG;
  const DiscDegrees = DiscRadiusRadians * RAD_TO_DEG;
  const Effective = Math.sqrt(SepDegrees * SepDegrees + DiscDegrees * DiscDegrees);
  const Window = 1.0 - SeparationRadians / Reach;
  const Bloom = 1.5 / ((Effective + 0.02) * (Effective + 0.02));
  const AureoleRatio = Effective / 6.0;
  const Aureole = 0.25 / (1.0 + AureoleRatio * AureoleRatio);
  return (Bloom + Aureole) * Window * Window;
}

// Resolved-disc branch of EvaluateSolarCoronaRadiance (ground observer). Solar = { HalfRad, DiscIntensity,
// GlareStrength, Radiant, Transmittance[3], Tint[3] }. The sub-pixel Gaussian branch is used by the GPU shaders.
export function EvaluateSolarCoronaRadiance(dx, dy, dz, sunDir, Solar, Out = [0, 0, 0]) {
  Out[0] = 0.0; Out[1] = 0.0; Out[2] = 0.0;
  if (!(Solar.DiscIntensity > 0.0)) return Out;
  const Cx = dx - sunDir[0], Cy = dy - sunDir[1], Cz = dz - sunDir[2];
  const HalfChord = 0.5 * Math.hypot(Cx, Cy, Cz);
  const Separation = 2.0 * Math.asin(Clamp(HalfChord, 0.0, 1.0));
  const HalfRad = Math.max(0.0008, Solar.HalfRad);
  const T = Solar.Transmittance;
  const Tint = Solar.Tint;
  if (dz >= -0.0056 && Separation <= HalfRad * 48.0 && T[0] + T[1] + T[2] > 1.0e-6) {
    const NormalizedRadius = Separation / HalfRad;
    let PR = 0.0, PG = 0.0, PB = 0.0;
    if (NormalizedRadius < 1.32) {
      const ClampedR = Math.min(1.0, NormalizedRadius);
      const Ld = EvaluateNeckelLabsLimbDarkening(Math.sqrt(Math.max(0.0, 1.0 - ClampedR * ClampedR)));
      const PhotoMag = 0.5 * (1.0 - EvaluateSolarErf((NormalizedRadius - 0.997) / 0.012)) * Solar.DiscIntensity;
      PR = Ld[0] * PhotoMag; PG = Ld[1] * PhotoMag; PB = Ld[2] * PhotoMag;
    }
    const R1 = NormalizedRadius / 1.18, R2 = NormalizedRadius / 3.40, R3 = NormalizedRadius / 11.5;
    const ScatterFactor = Clamp(0.55 + 0.85 * (1.0 - T[2]), 0.55, 1.35);
    const Profile = Solar.DiscIntensity * (
      0.042 / Math.pow(1.0 + R1 * R1, 1.85) +
      0.0085 * ScatterFactor / Math.pow(1.0 + R2 * R2, 1.38) +
      0.0014 * ScatterFactor / Math.pow(1.0 + R3 * R3, 1.22));
    const Window = Clamp(1.0 - NormalizedRadius / 48.0, 0.0, 1.0);
    const Corona = Profile * Window * Window;
    Out[0] += (PR + Corona * 1.04) * T[0] * Tint[0];
    Out[1] += (PG + Corona * 0.99) * T[1] * Tint[1];
    Out[2] += (PB + Corona * 0.91) * T[2] * Tint[2];
  }
  if (Solar.Radiant && Solar.GlareStrength > 0.0 && sunDir[2] >= -0.0056) {
    const Spread = EvaluateSolarGlareSpread(Separation, HalfRad);
    if (Spread > 0.0) {
      const GlareScale = Solar.GlareStrength * Spread * 0.045 * Solar.DiscIntensity;
      Out[0] += Tint[0] * T[0] * GlareScale * 1.02;
      Out[1] += Tint[1] * T[1] * GlareScale * 1.0;
      Out[2] += Tint[2] * T[2] * GlareScale * 0.96;
    }
  }
  return Out;
}

// CPU 3D Value-Noise FBM for volumetric cloud parity in GtxReferenceTracer
function Hash3(ix, iy, iz) {
  let n = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296.0;
}

function Noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const uz = fz * fz * (3.0 - 2.0 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n000 = Hash3(ix, iy, iz), n100 = Hash3(ix + 1, iy, iz);
  const n010 = Hash3(ix, iy + 1, iz), n110 = Hash3(ix + 1, iy + 1, iz);
  const n001 = Hash3(ix, iy, iz + 1), n101 = Hash3(ix + 1, iy, iz + 1);
  const n011 = Hash3(ix, iy + 1, iz + 1), n111 = Hash3(ix + 1, iy + 1, iz + 1);
  return lerp(
    lerp(lerp(n000, n100, ux), lerp(n010, n110, ux), uy),
    lerp(lerp(n001, n101, ux), lerp(n011, n111, ux), uy),
    uz,
  );
}

function CloudFbm3(x, y, z) {
  let sum = 0.0, amp = 0.52, freq = 1.0;
  for (let o = 0; o < 4; ++o) {
    sum += amp * Noise3(x * freq, y * freq, z * freq);
    freq *= 2.07;
    amp *= 0.48;
  }
  return sum;
}

export function EvalVolumetricCloudsCpu(dx, dy, dz, sunDir, sunIrr, skyCol, clouds, timeSec = 0.0) {
  if (!clouds?.enabled || dz <= 0.008 || clouds.coverage <= 0.01 || clouds.density <= 0.01) {
    return { rad: [0, 0, 0], trans: 1.0 };
  }
  const baseM = Math.max(200.0, clouds.baseM ?? 1400.0);
  const thickM = Math.max(150.0, clouds.thicknessM ?? 1100.0);
  const rInner = EARTH_RADIUS_M + baseM;
  const rOuter = EARTH_RADIUS_M + baseM + thickM;
  const origZ = EARTH_RADIUS_M + OBSERVER_ALT_M;

  const [, tEnter] = IntersectSphereDist(origZ, dz, rInner);
  const [, tExit] = IntersectSphereDist(origZ, dz, rOuter);
  const maxDist = Math.min(tExit, 48000.0);
  if (maxDist <= tEnter || tEnter < 0.0) return { rad: [0, 0, 0], trans: 1.0 };

  const steps = 16;
  const dt = (maxDist - tEnter) / steps;
  const fScale = 0.00065 / Math.max(0.08, clouds.featureScale ?? 0.35);
  const wx = (clouds.windX ?? 6.0) * timeSec;
  const wy = (clouds.windY ?? 2.0) * timeSec;
  const cov = Clamp(clouds.coverage ?? 0.34, 0.0, 1.0);
  const densMul = Math.max(0.0, clouds.density ?? 2.4) * 0.008;
  const anvil = Clamp(clouds.anvil ?? 0.5, 0.0, 1.0);
  const g = Clamp(clouds.anisotropy ?? 0.45, -0.5, 0.9);
  const cosTheta = dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2];
  const hg = (gg) => (1.0 - gg * gg) / (4.0 * Math.PI * Math.pow(Math.max(1e-3, 1.0 + gg * gg - 2.0 * gg * cosTheta), 1.5));
  const phase = 0.78 * hg(g) + 0.22 * hg(-0.25);

  const sampleDensity = (px, py, pz) => {
    const alt = Math.hypot(px, py, pz) - EARTH_RADIUS_M;
    const h = Clamp((alt - baseM) / thickM, 0.0, 1.0);
    const bot = Clamp(h / 0.16, 0.0, 1.0);
    const top = Clamp((1.0 - h) / (0.28 - 0.16 * anvil), 0.0, 1.0);
    const profile = bot * top;
    if (profile <= 0.001) return 0.0;
    const shapeCov = Clamp(cov + anvil * h * h * 0.25, 0.0, 1.0);
    const n = CloudFbm3((px + wx) * fScale, (py + wy) * fScale, (alt - baseM) * fScale * 1.4);
    const nNorm = Clamp((n - 0.28) / 0.44, 0.0, 1.0);
    const thr = 1.0 - shapeCov;
    return Math.max(0.0, (nNorm - thr) / Math.max(0.18, shapeCov)) * profile * densMul;
  };

  let trans = 1.0;
  let rR = 0.0, rG = 0.0, rB = 0.0;
  for (let i = 0; i < steps; ++i) {
    const t = tEnter + (i + 0.5) * dt;
    const px = dx * t, py = dy * t, pz = origZ + dz * t;
    const d = sampleDensity(px, py, pz);
    if (d > 1e-6) {
      let sunTau = 0.0;
      if (clouds.shadowEnabled !== false) {
        const sStep = (thickM * 0.55) / 3.0;
        for (let s = 1; s <= 3; ++s) {
          sunTau += sampleDensity(px + sunDir[0] * s * sStep, py + sunDir[1] * s * sStep, pz + sunDir[2] * s * sStep) * sStep;
        }
      }
      const sunAtt = Math.exp(-sunTau * 1.15) * (0.35 + 0.65 * (1.0 - Math.exp(-sunTau * 2.2 + 0.25)));
      const segT = Math.exp(-d * dt);
      const scatter = (1.0 - segT);
      const alt = Math.hypot(px, py, pz) - EARTH_RADIUS_M;
      const h = Clamp((alt - baseM) / thickM, 0.0, 1.0);
      const amb = 0.28 + 0.52 * h;
      const litR = sunIrr[0] * sunAtt * phase * 2.4 + skyCol[0] * amb * 0.55;
      const litG = sunIrr[1] * sunAtt * phase * 2.4 + skyCol[1] * amb * 0.55;
      const litB = sunIrr[2] * sunAtt * phase * 2.4 + skyCol[2] * amb * 0.55;
      rR += trans * litR * scatter;
      rG += trans * litG * scatter;
      rB += trans * litB * scatter;
      trans *= segT;
      if (trans < 0.015) break;
    }
  }
  const haze = 1.0 - Math.exp(-tEnter * 0.00004);
  rR = rR * (1.0 - haze) + skyCol[0] * (1.0 - trans) * haze;
  rG = rG * (1.0 - haze) + skyCol[1] * (1.0 - trans) * haze;
  rB = rB * (1.0 - haze) + skyCol[2] * (1.0 - trans) * haze;
  return { rad: [rR, rG, rB], trans };
}

export function EvalMoonAndStarsCpu(dx, dy, dz, sunDir, moon, stars, timeSec = 0.0) {
  let outR = 0.0, outG = 0.0, outB = 0.0;
  // Moon disc with 3D spherical phase & mare/crater detail
  if (moon?.visible && moon.dir && dz > -0.05) {
    const mx = moon.dir[0], my = moon.dir[1], mz = moon.dir[2];
    const cosM = dx * mx + dy * my + dz * mz;
    const angR = moon.sizeRad ?? 0.012;
    const cosEdge = Math.cos(angR);
    const glow = Math.pow(Math.max(0.0, cosM), 420.0) * (moon.glow ?? 0.8) * 0.28 * (moon.bright ?? 1.6);
    const tint = moon.tint || [0.94, 0.93, 0.90];
    outR += tint[0] * glow;
    outG += tint[1] * glow;
    outB += tint[2] * glow;

    if (cosM > cosEdge) {
      // Tangent basis on moon sphere
      const upRef = Math.abs(mz) < 0.98 ? [0, 0, 1] : [1, 0, 0];
      let tx = upRef[1] * mz - upRef[2] * my;
      let ty = upRef[2] * mx - upRef[0] * mz;
      let tz = upRef[0] * my - upRef[1] * mx;
      const tl = Math.hypot(tx, ty, tz) || 1.0;
      tx /= tl; ty /= tl; tz /= tl;
      const bx = my * tz - mz * ty, by = mz * tx - mx * tz, bz = mx * ty - my * tx;
      const px = (dx * tx + dy * ty + dz * tz) / Math.max(1e-4, angR);
      const py = (dx * bx + dy * by + dz * bz) / Math.max(1e-4, angR);
      const r2 = px * px + py * py;
      if (r2 < 1.0) {
        const pz = Math.sqrt(Math.max(0.0, 1.0 - r2));
        // Lunar phase angle from 0 (new) -> 0.5 (full) -> 1.0 (new)
        const phAng = ((moon.phase ?? 0.62) - 0.5) * Math.PI * 2.0;
        const lx = Math.sin(phAng), ly = 0.18, lz = Math.cos(phAng);
        const ll = Math.hypot(lx, ly, lz);
        const ndl = Math.max(0.0, (px * lx + py * ly + pz * lz) / ll);
        const mare = 0.68 + 0.32 * Noise3(px * 3.8 + 4.1, py * 3.8 - 2.3, pz * 3.8);
        const edgeAA = Clamp((1.0 - Math.sqrt(r2)) * 14.0, 0.0, 1.0);
        const lum = (0.015 + ndl * 1.45) * mare * (moon.bright ?? 1.6) * edgeAA;
        outR += tint[0] * lum;
        outG += tint[1] * lum;
        outB += tint[2] * lum;
      }
    }
  }

  // Deterministic procedural starfield
  if (stars?.enabled && dz > 0.005) {
    const dayFade = Clamp(1.0 - (sunDir[2] + 0.08) * 5.0, 0.0, 1.0);
    if (dayFade > 0.01) {
      const rot = stars.rotationRad ?? 0.0;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const rx = dx * cr - dy * sr;
      const ry = dx * sr + dy * cr;
      const rz = dz;
      const scale = 175.0;
      const gx = rx * scale, gy = ry * scale, gz = rz * scale;
      const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
      const h1 = Hash3(ix, iy, iz);
      const h2 = Hash3(ix + 19, iy - 7, iz + 31);
      const h3 = Hash3(ix - 13, iy + 29, iz - 5);
      const magThresh = Clamp((stars.limMag ?? 5.5) / 8.5, 0.05, 0.98);
      if (h1 > 1.0 - 0.18 * magThresh) {
        const cx = ix + 0.2 + 0.6 * h2;
        const cy = iy + 0.2 + 0.6 * h3;
        const cz = iz + 0.2 + 0.6 * ((h1 * 7.13) % 1.0);
        const d2 = (gx - cx) * (gx - cx) + (gy - cy) * (gy - cy) + (gz - cz) * (gz - cz);
        const rad = 0.08 * Clamp(stars.pointSize ?? 1.0, 0.4, 3.0);
        if (d2 < rad * rad) {
          const falloff = Math.exp(-d2 / (rad * rad * 0.35));
          const tw = stars.twinkle
            ? 1.0 - ((stars.twinkleDepth ?? 30) * 0.008) * (0.5 + 0.5 * Math.sin(timeSec * (stars.twinkleRate ?? 1.2) * 5.0 + h2 * 40.0))
            : 1.0;
          const intensity = (0.45 + 1.55 * h3 * h3) * (stars.brightness ?? 1.0) * dayFade * tw * falloff * Clamp(dz * 4.0, 0.0, 1.0);
          const warm = h2;
          outR += intensity * (0.78 + 0.42 * warm);
          outG += intensity * (0.88 + 0.12 * warm);
          outB += intensity * (1.20 - 0.35 * warm);
        }
      }
    }
  }
  return [outR, outG, outB];
}

const _f32View = new Float32Array(1);
const _u32View = new Uint32Array(_f32View.buffer);

function FloatToHalf(val) {
  _f32View[0] = val;
  const x = _u32View[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >>> (1 - exp);
    return sign | ((mant + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | ((mant + 0x1000) >>> 13);
}

export function PackSkyViewRgba16f(floatData, outU16 = null) {
  const len = floatData.length;
  const u16 = outU16 && outU16.length === len ? outU16 : new Uint16Array(len);
  for (let i = 0; i < len; ++i) {
    u16[i] = FloatToHalf(floatData[i]);
  }
  return u16;
}


