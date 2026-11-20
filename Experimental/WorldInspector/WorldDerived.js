// WorldDerived.js — pure numbers behind the World Inspector graphics.  No DOM.  Every quantity is either World Mirror's
// own arithmetic (cited inline) or a standard reference formula (named inline), so the tiles never invent values.

import { Solar } from "../FrontierWorldMirror/Solar.mjs";

export const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
const Deg = Math.PI / 180;

// ------------------------------------------------------------------------------------------------ colour
export const LinearToSrgb = (C) => {
  const X = Clamp(C, 0, 1);
  return X <= 0.0031308 ? X * 12.92 : 1.055 * X ** (1 / 2.4) - 0.055;
};
export const SrgbToLinear = (C) => (C <= 0.04045 ? C / 12.92 : ((C + 0.055) / 1.055) ** 2.4);
export function HexToRgb(Hex) {
  const M = /^#?([0-9a-f]{6})$/i.exec(String(Hex || ""));
  if (!M) return [0.5, 0.5, 0.5];
  const N = parseInt(M[1], 16);
  return [((N >> 16) & 255) / 255, ((N >> 8) & 255) / 255, (N & 255) / 255];
}
export const HexToLinear = (Hex) => HexToRgb(Hex).map(SrgbToLinear);
export function RgbToHex(Rgb) {
  return `#${Rgb.map((C) => Math.round(Clamp(C, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}
// Linear radiance → display hex, normalised so the brightest channel is 1 (a hue swatch, not an exposure).
export function ChromaHex(Linear) {
  const Peak = Math.max(1e-9, ...Linear);
  return RgbToHex(Linear.map((C) => LinearToSrgb(C / Peak)));
}
export const Luminance = ([R, G, B]) => 0.2126 * R + 0.7152 * G + 0.0722 * B;

// The renderer's tone map (GtxReferenceTracer AcesFilmChannel, Narkowicz ACES fit) followed by its 1/2.2 encode.
export const AcesFilm = (X) => Clamp((X * (2.51 * X + 0.03)) / (X * (2.43 * X + 0.59) + 0.14), 0, 1);
export const Display = (Linear, Gain) => AcesFilm(Math.max(0, Linear) * Gain) ** (1 / 2.2);

// McCamy (1992) correlated colour temperature from linear sRGB.
export function CctFromLinear([R, G, B]) {
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
  const S = X + Y + Z;
  if (S <= 1e-9) return 0;
  const N = (X / S - 0.332) / (0.1858 - Y / S);
  return 449 * N ** 3 + 3525 * N ** 2 + 6823.3 * N + 5520.33;
}

// The same Kelvin → linear tint CompileLiveGtxScene uses for "Colour source: Temperature".
export function KelvinToLinear(Kelvin) {
  const K = Clamp(Kelvin, 1800, 12000) / 100;
  const R = K <= 66 ? 1 : Clamp(1.2929 * (K - 60) ** -0.1332, 0, 1);
  const G = K <= 66 ? Clamp(0.39008 * Math.log(K) - 0.6318, 0, 1) : Clamp(1.12989 * (K - 60) ** -0.0755, 0, 1);
  const B = K >= 66 ? 1 : K <= 19 ? 0 : Clamp(0.5432 * Math.log(K - 10) - 1.1962, 0, 1);
  return [R ** 2.2, G ** 2.2, B ** 2.2];
}

// ------------------------------------------------------------------------------------------------ sun
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const CompassName = (Az) => COMPASS[Math.round((((Az % 360) + 360) % 360) / 22.5) % 16];

export function SolveSun(Rec, Hours = Rec["Local Hours"]) {
  return Solar({
    LocalHours: Number(Hours ?? 12),
    Month: Number(Rec.Month ?? 10),
    Day: Number(Rec["Day of Month"] ?? 4),
    Latitude: Number(Rec.Latitude ?? -26.19),
    Longitude: Number(Rec.Longitude ?? 28.32),
    UtcOffset: Number(Rec.UtcOffset ?? 2),
  });
}

function Crossings(Samples, Level) {
  const Out = [];
  for (let I = 1; I < Samples.length; I++) {
    const A = Samples[I - 1], B = Samples[I];
    if ((A.Elevation - Level) * (B.Elevation - Level) < 0) {
      const T = (Level - A.Elevation) / (B.Elevation - A.Elevation);
      Out.push({ Hours: A.Hours + (B.Hours - A.Hours) * T, Rising: B.Elevation > A.Elevation });
    }
  }
  return Out;
}

// One day of the World Mirror solar solve (Solar.mjs, geometric horizon, no refraction) at 10-minute steps.
export function SunDay(Rec, Step = 1 / 6) {
  const Samples = [];
  for (let H = 0; H <= 24 + 1e-9; H += Step) {
    const S = SolveSun(Rec, H);
    Samples.push({ Hours: H, Elevation: S.Elevation, Azimuth: S.Azimuth });
  }
  const Horizon = Crossings(Samples, 0);
  const Sunrise = Horizon.find((C) => C.Rising)?.Hours ?? null;
  const Sunset = Horizon.find((C) => !C.Rising)?.Hours ?? null;
  const Noon = Samples.reduce((A, B) => (B.Elevation > A.Elevation ? B : A));
  const AllDay = Samples.every((S) => S.Elevation > 0), AllNight = Samples.every((S) => S.Elevation <= 0);
  const Daylight = AllDay ? 24 : AllNight ? 0 : Samples.filter((S) => S.Elevation > 0).length * Step;
  return {
    Samples,
    Rise: Sunrise,
    Fall: Sunset,
    Noon,
    Daylight,
    Twilight: { Civil: Crossings(Samples, -6), Nautical: Crossings(Samples, -12), Astronomical: Crossings(Samples, -18) },
  };
}

export function SkyPhase(Elevation) {
  if (Elevation >= 6) return ["Day", "#f2c76b"];
  if (Elevation >= 0) return ["Golden hour", "#f29a52"];
  if (Elevation >= -6) return ["Civil twilight", "#7f6fa8"];
  if (Elevation >= -12) return ["Nautical twilight", "#3f4a86"];
  if (Elevation >= -18) return ["Astronomical twilight", "#232a52"];
  return ["Night", "#11152b"];
}

export const ClockText = (Hours) => {
  if (Hours === null || !Number.isFinite(Hours)) return "—";
  const M = Math.round((((Hours % 24) + 24) % 24) * 60);
  return `${String(Math.floor(M / 60) % 24).padStart(2, "0")}:${String(M % 60).padStart(2, "0")}`;
};
export const DurationText = (Hours) => `${Math.floor(Hours)}h ${String(Math.round((Hours % 1) * 60) % 60).padStart(2, "0")}m`;

// Kasten & Young (1989) relative optical air mass.
export function AirMass(ElevationDeg) {
  if (ElevationDeg <= -1) return Infinity;
  const H = Math.max(0, ElevationDeg);
  return 1 / (Math.sin(H * Deg) + 0.50572 * (H + 6.07995) ** -1.6364);
}

// ------------------------------------------------------------------------------------------------ atmosphere
// Sea-level coefficients and the ozone tent, as in AtmosphereSky.js EvaluateMediumAtAltitudeKm (per metre).
export const SEA_LEVEL_RAYLEIGH = [5.802e-6, 13.558e-6, 33.1e-6];
export const SEA_LEVEL_MIE_SCATTER = 3.996e-6;
export const SEA_LEVEL_MIE_EXTINCTION = 4.4e-6;
export const PEAK_OZONE_ABS = [0.65e-6, 1.881e-6, 0.085e-6];

export function MediumAt(AltM, A) {
  return {
    Rayleigh: Math.exp(-AltM / A.RayleighH) * A.Rayleigh,
    Mie: Math.exp(-AltM / A.MieH) * A.Mie,
    Ozone: Math.max(0, 1 - Math.abs(AltM - 25000) / 15000) * A.Ozone,
  };
}

// Henyey–Greenstein phase function and its forward-hemisphere energy share.
export const HenyeyGreenstein = (G, CosT) => (1 - G * G) / (4 * Math.PI * Math.max(1e-6, 1 + G * G - 2 * G * CosT) ** 1.5);
export function ForwardShare(G) {
  let Fwd = 0, All = 0;
  for (let I = 0; I < 400; I++) {
    const Mu = -1 + (I + 0.5) / 200;
    const P = HenyeyGreenstein(G, Mu);
    All += P;
    if (Mu > 0) Fwd += P;
  }
  return Fwd / All;
}

// ------------------------------------------------------------------------------------------------ clouds
export const Oktas = (Coverage) => Math.round(Clamp(Coverage, 0, 1) * 8);
export function MetarCover(Okta) {
  if (Okta === 0) return ["SKC", "Clear"];
  if (Okta <= 2) return ["FEW", "Few"];
  if (Okta <= 4) return ["SCT", "Scattered"];
  if (Okta <= 7) return ["BKN", "Broken"];
  return ["OVC", "Overcast"];
}
// Vertical density profile of a cloud layer, exactly the bottom/top ramps of EvalVolumetricCloudsCpu.
export function CloudProfile(H, Anvil) {
  const Bot = Clamp(H / 0.16, 0, 1);
  const Top = Clamp((1 - H) / (0.28 - 0.16 * Anvil), 0, 1);
  return Bot * Top;
}

// ------------------------------------------------------------------------------------------------ moon
export const SYNODIC_DAYS = 29.530588;
export const MoonIllumination = (P) => (1 - Math.cos(2 * Math.PI * P)) / 2;
export function MoonPhaseName(P) {
  const Q = ((P % 1) + 1) % 1;
  if (Q < 0.035 || Q >= 0.965) return "New moon";
  if (Q < 0.215) return "Waxing crescent";
  if (Q < 0.285) return "First quarter";
  if (Q < 0.465) return "Waxing gibbous";
  if (Q < 0.535) return "Full moon";
  if (Q < 0.715) return "Waning gibbous";
  if (Q < 0.785) return "Last quarter";
  return "Waning crescent";
}

// ------------------------------------------------------------------------------------------------ stars
// EvalMoonAndStarsCpu: stars fade in as the sun drops; scintillation is a sine of depth·0.008 at rate·5 rad/s.
export const StarDayFade = (SunZ) => Clamp(1 - (SunZ + 0.08) * 5, 0, 1);
export const Twinkle = (T, Depth, Rate, Seed) => 1 - Depth * 0.008 * (0.5 + 0.5 * Math.sin(T * Rate * 5 + Seed * 40));
export function SkyClass(LimitingMag) {
  if (LimitingMag < 3) return "Inner city";
  if (LimitingMag < 4.5) return "City sky";
  if (LimitingMag < 5.5) return "Suburban sky";
  if (LimitingMag < 6.5) return "Rural sky";
  return "Pristine dark sky";
}

// ------------------------------------------------------------------------------------------------ wind
const BEAUFORT = [
  [0.5, "Calm"], [1.6, "Light air"], [3.4, "Light breeze"], [5.5, "Gentle breeze"], [8.0, "Moderate breeze"], [10.8, "Fresh breeze"],
  [13.9, "Strong breeze"], [17.2, "Near gale"], [20.8, "Gale"], [24.5, "Strong gale"], [28.5, "Storm"], [32.7, "Violent storm"], [Infinity, "Hurricane force"],
];
export function Beaufort(Ms) {
  const I = BEAUFORT.findIndex(([Hi]) => Ms < Hi);
  return { Force: I, Name: BEAUFORT[I][1] };
}
export const BEAUFORT_LIMITS = BEAUFORT.map(([Hi]) => Hi);

// ------------------------------------------------------------------------------------------------ fog
// Koschmieder: meteorological visibility for a 2 % contrast threshold.
export const Visibility = (Sigma) => (Sigma > 1e-9 ? 3.912 / Sigma : Infinity);
export function VisibilityClass(M) {
  if (M < 1000) return "Fog";
  if (M < 5000) return "Mist";
  if (M < 10000) return "Haze";
  return "Clear";
}

// ------------------------------------------------------------------------------------------------ camera
// Same 16:9 sensor height as CompileLiveGtxScene; circle of confusion = sensor width / 1200 (0.03 mm on 36 mm).
export function CameraOptics(Focal, SensorW, FStop, SubjectM) {
  const SensorH = SensorW / (16 / 9);
  const Hfov = 2 * Math.atan(SensorW / (2 * Focal)) / Deg;
  const Vfov = 2 * Math.atan(SensorH / (2 * Focal)) / Deg;
  const Coc = SensorW / 1200;
  const HyperMm = (Focal * Focal) / (FStop * Coc) + Focal;
  const S = SubjectM * 1000;
  const Near = (S * (HyperMm - Focal)) / (HyperMm + S - 2 * Focal) / 1000;
  const Far = S >= HyperMm ? Infinity : (S * (HyperMm - Focal)) / (HyperMm - S) / 1000;
  return { Hfov, Vfov, Coc, Hyperfocal: HyperMm / 1000, Near, Far, Depth: Far - Near, SensorH };
}

// ------------------------------------------------------------------------------------------------ exposure
// Display curve of the World Mirror tone map with contrast as a log-slope about 18 % grey.
export function ToneCurve(Stops, Gain, Contrast) {
  const L = 0.18 * 2 ** (Stops * Contrast);
  return Display(L, Gain);
}
export function DynamicRange(Gain, Contrast) {
  let Lo = null, Hi = null;
  for (let S = -16; S <= 16; S += 0.02) {
    const Y = ToneCurve(S, Gain, Contrast);
    if (Lo === null && Y >= 0.02) Lo = S;
    if (Hi === null && Y >= 0.98) Hi = S;
  }
  return Lo === null || Hi === null ? Infinity : Hi - Lo;
}

// ------------------------------------------------------------------------------------------------ weather
export function RainClass(MmH) {
  if (MmH <= 0) return "None";
  if (MmH < 2.5) return "Light";
  if (MmH < 7.6) return "Moderate";
  if (MmH < 50) return "Heavy";
  return "Violent";
}
export const PRIMARY_BOW = 42, SECONDARY_BOW = 51;

// ------------------------------------------------------------------------------------------------ surfaces + lights
export const F0FromIor = (N) => ((N - 1) / (N + 1)) ** 2;
export const LUX_REFERENCES = [
  [0.002, "Starlight"], [0.25, "Full moon"], [10, "Street lamp"], [100, "Overcast dusk"], [500, "Office"], [10000, "Daylight shade"], [100000, "Direct sun"],
];
