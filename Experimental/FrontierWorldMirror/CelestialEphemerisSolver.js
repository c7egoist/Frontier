//==========================================================================================================================================
//                                                   CELESTIALEPHEMERISSOLVER.JS
//==========================================================================================================================================
// 1:1 browser port of Engine/GeometricRaster/Atmosphere/CelestialEphemerisSolver.{h,cpp} (SultanAladin/Frontier-1,
// branch arena/39c6910b-frontier-1 @ 5af9a1b). Same defaults, same Meeus solar position, same world-axis convention:
// right-handed +X North, +Y West, +Z Up; compass azimuth clockwise from North.

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONFIGURATION
//------------------------------------------------------------------------------------------------------------------------

export const SolarTintSource = Object.freeze({ RgbTint: 0, KelvinTemperature: 1 });
export const SolarAppearanceMode = Object.freeze({ Muted: 0, Radiant: 1 });
export const DayCycleSpeedPreset = Object.freeze({ Multiplier1: 0, Multiplier8: 1, Multiplier30: 2, Multiplier100: 3, Custom: 4 });

// SolarCelestialConfiguration defaults, member for member
export const SolarCelestialDefaults = Object.freeze({
  SolarEnabled: true,
  AngularDiameterDegrees: 0.533, // [deg] - Apparent solar disc diameter [0.1..5.0]
  TintSource: SolarTintSource.RgbTint,
  ManualRgbTint: [1.0, 1.0, 1.0],
  ColorTemperatureKelvin: 6500.0, // [K]
  SolarIntensityMultiplier: 22.0, // [x] - Atmospheric sky irradiance multiplier [0..60]
  DirectGainMultiplier: 2.5, // [x] - Direct sunlit surface radiance scale [0..5]
  LocalHours: 15.5, // [h]
  CycleAnimationEnabled: false,
  CycleSpeedPreset: 1, // DayCycleSpeedPreset.Multiplier8
  DayDurationHours: 3.0, // [h]
  SiteLatitudeDegrees: -26.19,
  SiteLongitudeDegrees: 28.32,
  DayOfMonth: 10,
  Month: 9,
  Year: 2026,
  UtcOffsetHours: 2.0,
  ManualDirectionOverride: false,
  ManualAzimuthDegrees: 295.0,
  ManualElevationDegrees: 38.0,
  AppearanceMode: SolarAppearanceMode.Radiant,
  SunGlareStrength: 0.25, // [x] - Optical glare veil strength [0..2] (Radiant mode)
});

const DegToRad = 0.01745329251994329577;
const RadToDeg = 57.2957795130823208768;

function WrapDegrees360(AngleDegrees) {
  const Mod = AngleDegrees % 360.0;
  return Mod < 0.0 ? Mod + 360.0 : Mod;
}

function Clamp(Value, Low, High) {
  return Math.min(High, Math.max(Low, Value));
}

function SrgbChannelToLinear(Channel) {
  const C = Clamp(Channel, 0.0, 1.0);
  return C <= 0.04045 ? C / 12.92 : Math.pow((C + 0.055) / 1.055, 2.4);
}

function NormalizeAxis(X, Y, Z) {
  const Length = Math.hypot(X, Y, Z);
  return Length > 1e-12 ? [X / Length, Y / Length, Z / Length] : [0.0, 0.0, 1.0];
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  CELESTIAL EPHEMERIS SOLVER
//------------------------------------------------------------------------------------------------------------------------

// Compass Azimuth (0 = North/+X, 90 = East/-Y, 180 = South/-X, 270 = West/+Y) and Elevation -> right-handed +Z up axis
export function ConvertAzimuthElevationToWorldAxis(AzimuthDegrees, ElevationDegrees) {
  const AzRad = AzimuthDegrees * DegToRad;
  const ElRad = ElevationDegrees * DegToRad;
  const CosEl = Math.cos(ElRad);
  return NormalizeAxis(CosEl * Math.cos(AzRad), -CosEl * Math.sin(AzRad), Math.sin(ElRad));
}

// Inverse of ConvertAzimuthElevationToWorldAxis (inspector read-outs)
export function ConvertWorldAxisToAzimuthElevation(Axis) {
  const [X, Y, Z] = NormalizeAxis(Number(Axis?.[0]) || 0, Number(Axis?.[1]) || 0, Number(Axis?.[2]) || 0);
  return {
    AzimuthDegrees: WrapDegrees360(Math.atan2(-Y, X) * RadToDeg),
    ElevationDegrees: Math.asin(Clamp(Z, -1.0, 1.0)) * RadToDeg,
  };
}

// Planckian colour temperature [1000..40000 K] in linear RGB
export function EvaluateKelvinToLinearRgb(Kelvin) {
  const T = Clamp(Kelvin, 1000.0, 40000.0) * 0.01;
  let R = 255.0;
  let G = 255.0;
  let B = 255.0;
  if (T <= 66.0) {
    R = 255.0;
    G = Clamp(99.4708025861 * Math.log(Math.max(1.0, T)) - 161.1195681661, 0.0, 255.0);
    B = T <= 19.0 ? 0.0 : Clamp(138.5177312231 * Math.log(Math.max(1.0, T - 10.0)) - 305.0447927307, 0.0, 255.0);
  } else {
    R = Clamp(329.698727446 * Math.pow(T - 60.0, -0.1332047592), 0.0, 255.0);
    G = Clamp(288.1221695283 * Math.pow(T - 60.0, -0.0755148492), 0.0, 255.0);
    B = 255.0;
  }
  return [SrgbChannelToLinear(R / 255.0), SrgbChannelToLinear(G / 255.0), SrgbChannelToLinear(B / 255.0)];
}

// Astronomical solar position, sidereal time and effective tint without atmospheric refraction
export function SolveSolarEphemeris(Partial = {}) {
  const Config = { ...SolarCelestialDefaults, ...Partial };
  const Outcome = {
    ElevationDegrees: 38.0,
    AzimuthDegrees: 295.0,
    DeclinationDegrees: 0.0,
    EquationOfTimeMinutes: 0.0,
    SiderealHours: 0.0,
    WorldDirectionToSun: [0.42, -0.55, 0.72],
    EffectiveSolarTint:
      Config.TintSource === SolarTintSource.KelvinTemperature
        ? EvaluateKelvinToLinearRgb(Config.ColorTemperatureKelvin)
        : [...Config.ManualRgbTint],
  };

  let Y = Math.trunc(Config.Year);
  let M = Math.trunc(Clamp(Config.Month, 1, 12));
  const D = Math.trunc(Clamp(Config.DayOfMonth, 1, 31));
  if (M <= 2) {
    --Y;
    M += 12;
  }

  const A = Math.trunc(Y / 100);
  const B = 2 - A + Math.trunc(A / 4);
  const UtcHours = Number(Config.LocalHours) - Number(Config.UtcOffsetHours);
  const Jd = Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5 + UtcHours / 24.0;
  const T = (Jd - 2451545.0) / 36525.0;

  const MeanLon = WrapDegrees360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const MeanAnom = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = MeanAnom * DegToRad;
  const Centre =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2.0 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3.0 * Mr) * 0.000289;
  const Omega = 125.04 - 1934.136 * T;
  const ApparentLon = MeanLon + Centre - 0.00569 - 0.00478 * Math.sin(Omega * DegToRad);
  const MeanObliq = 23.0 + (26.0 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60.0) / 60.0;
  const Obliq = MeanObliq + 0.00256 * Math.cos(Omega * DegToRad);

  const Declination = Math.asin(Math.sin(Obliq * DegToRad) * Math.sin(ApparentLon * DegToRad)) * RadToDeg;
  const TanHalf = Math.tan(Obliq * 0.5 * DegToRad);
  const Y2 = TanHalf * TanHalf;
  const L0r = MeanLon * DegToRad;
  const EqTime =
    4.0 *
    RadToDeg *
    (Y2 * Math.sin(2.0 * L0r) -
      2.0 * Ecc * Math.sin(Mr) +
      4.0 * Ecc * Y2 * Math.sin(Mr) * Math.cos(2.0 * L0r) -
      0.5 * Y2 * Y2 * Math.sin(4.0 * L0r) -
      1.25 * Ecc * Ecc * Math.sin(2.0 * Mr));

  const TrueSolarRaw = (UtcHours * 60.0 + EqTime + 4.0 * Number(Config.SiteLongitudeDegrees)) % 1440.0;
  const TrueSolarMin = TrueSolarRaw < 0.0 ? TrueSolarRaw + 1440.0 : TrueSolarRaw;
  const HourAngle = TrueSolarMin * 0.25 - 180.0;

  const LatR = Number(Config.SiteLatitudeDegrees) * DegToRad;
  const DecR = Declination * DegToRad;
  const HaR = HourAngle * DegToRad;
  const CosAngle = Clamp(Math.sin(LatR) * Math.sin(DecR) + Math.cos(LatR) * Math.cos(DecR) * Math.cos(HaR), -1.0, 1.0);
  const PoleAngle = Math.acos(CosAngle);
  const Elevation = 90.0 - PoleAngle * RadToDeg;
  const SinPole = Math.sin(PoleAngle);

  let Azimuth = 0.0;
  if (Math.abs(SinPole) > 1.0e-9) {
    const CosAz = Clamp((Math.sin(LatR) * Math.cos(PoleAngle) - Math.sin(DecR)) / (Math.cos(LatR) * SinPole), -1.0, 1.0);
    Azimuth = Math.acos(CosAz) * RadToDeg;
    Azimuth = HourAngle > 0.0 ? WrapDegrees360(Azimuth + 180.0) : WrapDegrees360(540.0 - Azimuth);
  }

  const GmstDeg = WrapDegrees360(280.46061837 + 360.98564736629 * (Jd - 2451545.0) + Number(Config.SiteLongitudeDegrees));
  Outcome.SiderealHours = GmstDeg / 15.0;
  Outcome.DeclinationDegrees = Declination;
  Outcome.EquationOfTimeMinutes = EqTime;

  if (Config.ManualDirectionOverride) {
    Outcome.AzimuthDegrees = WrapDegrees360(Config.ManualAzimuthDegrees);
    Outcome.ElevationDegrees = Clamp(Config.ManualElevationDegrees, -90.0, 90.0);
  } else {
    Outcome.AzimuthDegrees = Azimuth;
    Outcome.ElevationDegrees = Elevation;
  }

  Outcome.WorldDirectionToSun = ConvertAzimuthElevationToWorldAxis(Outcome.AzimuthDegrees, Outcome.ElevationDegrees);
  return Outcome;
}

// Advances LocalHours monotonically when CycleAnimationEnabled is active (same arithmetic as the C++ solver)
export function AdvanceDayCycleHours(Config, DeltaSeconds) {
  if (!Config.CycleAnimationEnabled || !(DeltaSeconds > 0.0)) return Config;
  let DurationH = Number(Config.DayDurationHours) || 3.0;
  const Preset = Config.CycleSpeedPreset ?? DayCycleSpeedPreset.Multiplier8;
  if (Preset === DayCycleSpeedPreset.Multiplier1) DurationH = 24.0;
  else if (Preset === DayCycleSpeedPreset.Multiplier8) DurationH = 3.0;
  else if (Preset === DayCycleSpeedPreset.Multiplier30) DurationH = 0.8;
  else if (Preset === DayCycleSpeedPreset.Multiplier100) DurationH = 0.24;
  DurationH = Math.max(0.01, DurationH);
  const NextH = (Number(Config.LocalHours) + (24.0 / DurationH) * DeltaSeconds) % 24.0;
  return { ...Config, LocalHours: NextH < 0.0 ? NextH + 24.0 : NextH };
}
