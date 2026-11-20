// WorldGraphics.js — the infographics on the World Inspector cards.
//
// SVG builders return strings (rendered into [data-live] hosts and testable without a DOM).  Interactive graphics
// carry data-scrub (1-D) or data-scrub-x / data-scrub-y (2-D) bindings that WorldInspector.js turns into drags.
// Canvas renderers (sky dome, moon, material ball) run World Mirror's own evaluators on the CPU in small chunks.

import { SampleSkyViewInto, EvalVolumetricCloudsCpu, EvalMoonAndStarsCpu, MOON_PRESET_TINTS } from "../FrontierWorldMirror/AtmosphereSky.js";
import { ConvertAzimuthElevationToWorldAxis } from "../FrontierWorldMirror/CelestialEphemerisSolver.js";
import {
  Clamp, ClockText, SkyPhase, CompassName, MediumAt, HenyeyGreenstein, CloudProfile, MoonIllumination, MoonPhaseName, Twinkle,
  ToneCurve, Beaufort, PRIMARY_BOW, SECONDARY_BOW, LUX_REFERENCES, KelvinToLinear, ChromaHex, AcesFilm,
  SEA_LEVEL_RAYLEIGH, SEA_LEVEL_MIE_SCATTER, PEAK_OZONE_ABS, Visibility,
} from "./WorldDerived.js";

const F = (V, D = 1) => Number(V).toFixed(D);
const Esc = (S) => String(S).replace(/[&<>"]/g, (C) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[C]);
const Pts = (List) => List.map(([X, Y]) => `${F(X)},${F(Y)}`).join(" ");
let Uid = 0;
const Id = (P) => `${P}${++Uid}`;

export function Svg(W, H, Body, { Label = "", Class = "", Extra = "" } = {}) {
  return `<svg class="wi-svg ${Class}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${Esc(Label)}" ${Extra}>${Body}</svg>`;
}
const T = (X, Y, S, { A = "start", C = "#7d7d7d", Sz = 8.5, W = 300, Cls = "" } = {}) =>
  `<text x="${F(X)}" y="${F(Y)}" text-anchor="${A}" fill="${C}" font-size="${Sz}" font-weight="${W}" class="${Cls}">${Esc(S)}</text>`;
const L = (X1, Y1, X2, Y2, C = "#ffffff14", W = 1, Dash = "") => `<line x1="${F(X1)}" y1="${F(Y1)}" x2="${F(X2)}" y2="${F(Y2)}" stroke="${C}" stroke-width="${W}" ${Dash ? `stroke-dasharray="${Dash}"` : ""}/>`;

// ------------------------------------------------------------------------------------------------ sun
// Elevation through the day (World Mirror's Solar.mjs) over twilight bands; drag anywhere to set Local Hours.
export function SunChart(Day, Hours, SunHex) {
  const W = 400, H = 176, X0 = 26, X1 = W - 8, Y0 = 10, Y1 = H - 20;
  const Lo = -30, Hi = Math.max(30, Math.ceil((Day.Noon.Elevation + 8) / 10) * 10);
  const X = (Hr) => X0 + (Hr / 24) * (X1 - X0), Y = (E) => Y1 - ((Clamp(E, Lo, Hi) - Lo) / (Hi - Lo)) * (Y1 - Y0);
  const Bands = [[0, -6, "#2a2c4a55"], [-6, -12, "#1f2142aa"], [-12, -18, "#171a36cc"], [-18, Lo, "#10132a"]]
    .map(([A, B, C]) => `<rect x="${X0}" y="${F(Y(A))}" width="${X1 - X0}" height="${F(Y(B) - Y(A))}" fill="${C}"/>`).join("");
  const Curve = Day.Samples.map((S) => [X(S.Hours), Y(S.Elevation)]);
  const Lit = Id("sunlit"), Clip = Id("sunclip");
  const Grid = [0, 6, 12, 18, 24].map((Hr) => L(X(Hr), Y0, X(Hr), Y1, "#ffffff0a") + T(X(Hr), H - 6, `${String(Hr).padStart(2, "0")}:00`, { A: "middle" })).join("")
    + [Hi, 60, 30].filter((E, I, A) => E <= Hi && A.indexOf(E) === I).map((E) => L(X0, Y(E), X1, Y(E), "#ffffff08", 1, "2 3") + T(X0 - 4, Y(E) + 3, `${E}°`, { A: "end" })).join("")
    + T(X0 - 4, Y(-18) + 3, "−18°", { A: "end", C: "#55597a" });
  const Mark = (Hr, Label, C) => (Hr === null ? "" : L(X(Hr), Y(0) - 5, X(Hr), Y(0) + 5, C, 1.4) + T(X(Hr), Y(0) + 15, `${Label} ${ClockText(Hr)}`, { A: "middle", C, Sz: 8 }));
  const Now = Day.Samples.reduce((A, B) => (Math.abs(B.Hours - Hours) < Math.abs(A.Hours - Hours) ? B : A));
  const Sx = X(Hours), Sy = Y(Now.Elevation);
  const Body = `<defs>
      <linearGradient id="${Lit}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb238" stop-opacity=".34"/><stop offset="1" stop-color="#ffb238" stop-opacity=".02"/></linearGradient>
      <clipPath id="${Clip}"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${F(Y(0) - Y0)}"/></clipPath>
    </defs>
    ${Bands}${Grid}
    <polygon points="${Pts([[X0, Y(0)], ...Curve, [X1, Y(0)]])}" fill="url(#${Lit})" clip-path="url(#${Clip})"/>
    ${L(X0, Y(0), X1, Y(0), "#ffffff40", 1)}${T(X1, Y(0) - 4, "horizon", { A: "end", C: "#8a8a8a", Sz: 7.5 })}
    <polyline points="${Pts(Curve)}" fill="none" stroke="#f0c070" stroke-width="1.6" stroke-linejoin="round"/>
    ${Mark(Day.Rise, "↑", "#f2a35e")}${Mark(Day.Fall, "↓", "#c98cf0")}
    ${L(X(Day.Noon.Hours), Y(Day.Noon.Elevation) - 6, X(Day.Noon.Hours), Y(Day.Noon.Elevation) - 14, "#ffffff55")}
    ${T(X(Day.Noon.Hours), Y(Day.Noon.Elevation) - 17, `noon ${F(Day.Noon.Elevation, 0)}°`, { A: "middle", C: "#bdbdbd", Sz: 8 })}
    ${L(Sx, Y0, Sx, Y1, "#ffffff30", 1, "3 3")}
    <circle cx="${F(Sx)}" cy="${F(Sy)}" r="13" fill="${SunHex}" opacity=".18"/><circle cx="${F(Sx)}" cy="${F(Sy)}" r="6" fill="${SunHex}" stroke="#111" stroke-width="1.5"/>
    <rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="transparent" data-scrub="sun|Local Hours" data-min="0" data-max="24" data-x0="${X0 / W}" data-x1="${X1 / W}" style="cursor:ew-resize"/>`;
  return Svg(W, H, Body, { Label: `Solar elevation through the day; now ${ClockText(Hours)} at ${F(Now.Elevation)} degrees` });
}

export function DayStrip(Day, Hours) {
  const W = 400, H = 22, X0 = 26, X1 = W - 8;
  const X = (Hr) => X0 + (Hr / 24) * (X1 - X0);
  const Gid = Id("day");
  const Stops = Day.Samples.filter((_, I) => I % 3 === 0).map((S) => `<stop offset="${F(S.Hours / 24, 3)}" stop-color="${SkyPhase(S.Elevation)[1]}"/>`).join("");
  return Svg(W, H, `<defs><linearGradient id="${Gid}">${Stops}</linearGradient></defs>
    <rect x="${X0}" y="4" width="${X1 - X0}" height="10" rx="5" fill="url(#${Gid})"/>
    <rect x="${F(X(Hours) - 1.5)}" y="1" width="3" height="16" rx="1.5" fill="#f2f2f2" stroke="#111"/>
    <rect x="${X0}" y="0" width="${X1 - X0}" height="${H}" fill="transparent" data-scrub="sun|Local Hours" data-min="0" data-max="24" data-x0="${X0 / W}" data-x1="${X1 / W}" style="cursor:ew-resize"/>`,
  { Label: "Sky phase through the day", Class: "wi-strip" });
}

export function Compass(Az, El, { Colour = "#ffb238", Label = "Sun", Size = 108 } = {}) {
  const C = Size / 2, R = C - 12;
  const Ticks = Array.from({ length: 36 }, (_, I) => {
    const A = (I * 10 * Math.PI) / 180, Long = I % 9 === 0;
    return L(C + Math.sin(A) * (R - (Long ? 6 : 3)), C - Math.cos(A) * (R - (Long ? 6 : 3)), C + Math.sin(A) * R, C - Math.cos(A) * R, Long ? "#ffffff55" : "#ffffff1c");
  }).join("");
  const Cards = [["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([N, A]) => T(C + Math.sin((A * Math.PI) / 180) * (R + 7), C - Math.cos((A * Math.PI) / 180) * (R + 7) + 3, N, { A: "middle", C: N === "N" ? "#e6e6e6" : "#7a7a7a", Sz: 8 })).join("");
  const Rings = [30, 60].map((E) => `<circle cx="${C}" cy="${C}" r="${F(R * (1 - E / 90))}" fill="none" stroke="#ffffff10" stroke-dasharray="2 3"/>`).join("");
  const Up = El > 0, Rad = R * Clamp(1 - El / 90, 0, 1.15), A = (Az * Math.PI) / 180;
  const Px = C + Math.sin(A) * Math.min(Rad, R), Py = C - Math.cos(A) * Math.min(Rad, R);
  return Svg(Size, Size, `<circle cx="${C}" cy="${C}" r="${R}" fill="#0d0f14" stroke="#ffffff14"/>${Rings}${Ticks}${Cards}
    ${L(C, C, Px, Py, Up ? Colour : "#5d6080", 1.2, Up ? "" : "2 2")}
    <circle cx="${F(Px)}" cy="${F(Py)}" r="5" fill="${Up ? Colour : "#262a40"}" stroke="${Up ? "#111" : "#6a6f99"}" stroke-width="1.2"/>
    <circle cx="${C}" cy="${C}" r="1.6" fill="#888"/>`,
  { Label: `${Label} azimuth ${F(Az, 0)} degrees ${CompassName(Az)}, elevation ${F(El)} degrees`, Class: "wi-compass" });
}

export function DiscCompare(Diameter, Real, { Colour = "#ffd27a", RealLabel = "real sun", Name = "set" } = {}) {
  const W = 180, H = 56, Max = Math.max(Diameter, Real) || 1, S = 22 / Max;
  return Svg(W, H, `<circle cx="34" cy="26" r="${F(Math.max(1.2, Real * S))}" fill="none" stroke="#ffffff55" stroke-dasharray="2 2"/>
    ${T(34, 52, `${RealLabel} ${Real}°`, { A: "middle", Sz: 7.5 })}
    <circle cx="118" cy="26" r="${F(Math.max(1.2, Diameter * S))}" fill="${Colour}" opacity=".9"/>
    ${T(118, 52, `${Name} ${F(Diameter, 2)}° · ×${F(Diameter / Real, 1)}`, { A: "middle", C: "#cfcfcf", Sz: 7.5 })}`, { Label: `Angular size ${Diameter} degrees against ${RealLabel}`, Class: "wi-mini" });
}

export function KelvinBar(Kelvin, Lo = 1000, Hi = 40000) {
  const W = 400, H = 34, X0 = 4, X1 = W - 4, Gid = Id("kel");
  const Pos = (K) => X0 + ((Math.log(K) - Math.log(Lo)) / (Math.log(Hi) - Math.log(Lo))) * (X1 - X0);
  const Stops = [1000, 1500, 2000, 3000, 4000, 5000, 6500, 8000, 10000, 15000, 25000, 40000].map((K) => `<stop offset="${F((Pos(K) - X0) / (X1 - X0), 3)}" stop-color="${ChromaHex(KelvinToLinear(K))}"/>`).join("");
  const Refs = [[1900, "candle"], [3200, "tungsten"], [5500, "noon sun"], [6500, "D65"], [10000, "blue sky"]].map(([K, N], I) => L(Pos(K), 13, Pos(K), 16, "#00000088") + T(Pos(K), I % 2 ? 32 : 24, N, { A: "middle", Sz: 7 })).join("");
  return Svg(W, H, `<defs><linearGradient id="${Gid}">${Stops}</linearGradient></defs><rect x="${X0}" y="2" width="${X1 - X0}" height="12" rx="6" fill="url(#${Gid})"/>${Refs}
    <rect x="${F(Pos(Clamp(Kelvin, Lo, Hi)) - 1.5)}" y="0" width="3" height="16" rx="1.5" fill="#fff" stroke="#111"/>`, { Label: `Colour temperature ${Kelvin} kelvin`, Class: "wi-strip" });
}

// ------------------------------------------------------------------------------------------------ atmosphere
export function DensityProfile(A) {
  const W = 200, H = 176, X0 = 30, X1 = W - 6, Y0 = 8, Y1 = H - 20, Top = Math.min(A.Top, 60000);
  const Y = (M) => Y1 - (M / Top) * (Y1 - Y0), X = (D) => X0 + Clamp(D, 0, 1.05) * (X1 - X0);
  const Peak = { Rayleigh: Math.max(1e-6, A.Rayleigh), Mie: Math.max(1e-6, A.Mie), Ozone: Math.max(1e-6, A.Ozone) };
  const Line = (Key, C) => {
    const P = [];
    for (let I = 0; I <= 80; I++) {
      const M = (I / 80) * Top;
      P.push([X(MediumAt(M, A)[Key] / Peak[Key]), Y(M)]);
    }
    return `<polyline points="${Pts(P)}" fill="none" stroke="${C}" stroke-width="1.5"/>`;
  };
  const Km = [0, 10, 20, 30, 40, 50, 60].filter((K) => K * 1000 <= Top).map((K) => L(X0, Y(K * 1000), X1, Y(K * 1000), "#ffffff08") + T(X0 - 4, Y(K * 1000) + 3, `${K}`, { A: "end" })).join("");
  const Hmark = (M, C, N) => (M > Top ? "" : L(X0, Y(M), X1, Y(M), C, 1, "3 3") + T(X1, Y(M) - 3, `${N} ${F(M / 1000, 1)} km`, { A: "end", C, Sz: 7.5 }));
  return Svg(W, H, `${Km}${T(4, Y0 + 2, "km", { Sz: 7.5 })}
    <rect x="${X0}" y="${Y(40000)}" width="${X1 - X0}" height="${F(Y(10000) - Y(40000))}" fill="#b48cff08"/>
    ${Line("Ozone", "#b48cff")}${Line("Mie", "#e8cf9a")}${Line("Rayleigh", "#6fa8ff")}
    ${Hmark(A.RayleighH, "#6fa8ffaa", "H·R")}${Hmark(A.MieH, "#e8cf9aaa", "H·M")}
    ${L(X0, Y1, X1, Y1, "#ffffff30")}${T((X0 + X1) / 2, H - 6, "relative density", { A: "middle" })}`,
  { Label: "Rayleigh, Mie and ozone density against altitude" });
}

export function ScatterSpectrum(A) {
  const W = 200, H = 92, Floor = 70, Rows = [
    ["R", SEA_LEVEL_RAYLEIGH[0] * A.Rayleigh, PEAK_OZONE_ABS[0] * A.Ozone, "#ff7b6b"],
    ["G", SEA_LEVEL_RAYLEIGH[1] * A.Rayleigh, PEAK_OZONE_ABS[1] * A.Ozone, "#7be08f"],
    ["B", SEA_LEVEL_RAYLEIGH[2] * A.Rayleigh, PEAK_OZONE_ABS[2] * A.Ozone, "#6fa8ff"],
  ];
  const Mie = SEA_LEVEL_MIE_SCATTER * A.Mie;
  const Max = Math.max(40e-6, ...Rows.map((R) => R[1]), Mie);
  const Hh = (V) => (V / Max) * 56;
  const Bars = Rows.map(([N, Ray, Oz, C], I) => {
    const X = 14 + I * 44;
    return `<rect x="${X}" y="${F(Floor - Hh(Ray))}" width="16" height="${F(Hh(Ray))}" rx="3" fill="${C}"/>
      <rect x="${X + 18}" y="${F(Floor - Hh(Oz))}" width="8" height="${F(Hh(Oz))}" rx="2" fill="#b48cff"/>${T(X + 12, Floor + 11, N, { A: "middle", C })}`;
  }).join("");
  return Svg(W, H, `${L(8, Floor, W - 6, Floor, "#ffffff22")}${Bars}
    <rect x="146" y="${F(Floor - Hh(Mie))}" width="22" height="${F(Hh(Mie))}" rx="3" fill="#e8cf9a"/>${T(157, Floor + 11, "Mie", { A: "middle", C: "#e8cf9a" })}
    ${T(8, 10, "sea-level β per channel", { Sz: 7.5 })}${T(W - 6, 10, "▮ ozone", { A: "end", C: "#b48cff", Sz: 7.5 })}`,
  { Label: "Sea-level scattering and ozone absorption coefficients" });
}

export function PhasePolar(G, { Label = "Mie phase", Colour = "#e8cf9a" } = {}) {
  const W = 120, H = 92, Cx = 52, Cy = 46;
  const Max = HenyeyGreenstein(Math.abs(G), 1), P = [];
  for (let I = 0; I <= 120; I++) {
    const Th = (I / 120) * Math.PI * 2;
    const R = (HenyeyGreenstein(G, Math.cos(Th)) / Max) ** 0.35 * 38;
    P.push([Cx + Math.cos(Th) * R, Cy + Math.sin(Th) * R]);
  }
  return Svg(W, H, `<circle cx="${Cx}" cy="${Cy}" r="38" fill="none" stroke="#ffffff10"/>${L(Cx - 44, Cy, Cx + 50, Cy, "#ffffff18")}
    <polygon points="${Pts(P)}" fill="${Colour}22" stroke="${Colour}" stroke-width="1.3"/>
    <path d="M${Cx - 46} ${Cy} l6 -3 v6z" fill="#ffb238"/>${T(Cx + 52, Cy - 4, "→", { A: "end", C: "#aaa" })}
    ${T(4, 10, `${Label} g ${F(G, 2)}`, { Sz: 7.5 })}`, { Label: `${Label} with anisotropy ${G}` });
}

// ------------------------------------------------------------------------------------------------ clouds
export function CloudSection(C) {
  const W = 200, H = 176, X0 = 30, X1 = W - 6, Y0 = 8, Y1 = H - 20;
  const Top = Math.max(2000, (C.Bottom + C.Thickness) * 1.7);
  const Y = (M) => Y1 - (M / Top) * (Y1 - Y0);
  const Steps = 40, Shape = [];
  for (let I = 0; I <= Steps; I++) {
    const Hn = I / Steps, P = CloudProfile(Hn, C.Anvil) * Clamp(C.Coverage + C.Anvil * Hn * Hn * 0.25, 0, 1);
    Shape.push([X0 + 70 + P * 80, Y(C.Bottom + Hn * C.Thickness)]);
  }
  const Left = Shape.map(([Xp, Yp]) => [X0 + 70 - (Xp - X0 - 70), Yp]).reverse();
  const KmStep = Top > 9000 ? 2 : Top > 4500 ? 1 : 0.5;
  const Km = Array.from({ length: Math.floor(Top / 1000 / KmStep) + 1 }, (_, I) => I * KmStep).filter((K) => K * 1000 <= Top).map((K) => L(X0, Y(K * 1000), X1, Y(K * 1000), "#ffffff08") + T(X0 - 4, Y(K * 1000) + 3, `${K}`, { A: "end" })).join("");
  const Dim = (M, N, Cl) => L(X0, Y(M), X1, Y(M), Cl, 1, "3 3") + T(X1, Y(M) - 3, `${N} ${F(M / 1000, 2)} km`, { A: "end", C: Cl, Sz: 7.5 });
  const Op = Clamp(0.25 + C.Density / 5, 0.25, 0.95);
  return Svg(W, H, `${Km}${T(4, Y0 + 2, "km", { Sz: 7.5 })}
    <rect x="${X0}" y="${F(Y(C.Bottom + C.Thickness))}" width="${X1 - X0}" height="${F(Y(C.Bottom) - Y(C.Bottom + C.Thickness))}" fill="#ffffff06"/>
    <polygon points="${Pts([...Shape, ...Left])}" fill="#e6ebf2" fill-opacity="${F(Op, 2)}" stroke="#ffffff66" stroke-width=".8"/>
    ${Dim(C.Bottom, "base", "#9ec3ff")}${Dim(C.Bottom + C.Thickness, "top", "#cfd8e6")}${C.Ceiling <= Top ? Dim(C.Ceiling, "ceiling", "#7a7a7a") : T(X1, Y0 + 8, `ceiling ${F(C.Ceiling / 1000, 1)} km ↑`, { A: "end", C: "#7a7a7a", Sz: 7.5 })}
    ${C.Enabled ? "" : T((X0 + X1) / 2, Y1 / 2, "clouds off", { A: "middle", C: "#ff8b78", Sz: 10 })}
    <rect x="${X0}" y="${Y1}" width="${X1 - X0}" height="4" fill="#3a3328"/>${T((X0 + X1) / 2, H - 6, "density profile · width = coverage", { A: "middle" })}`,
  { Label: `Cloud layer from ${C.Bottom} to ${C.Bottom + C.Thickness} metres` });
}

// ------------------------------------------------------------------------------------------------ moon
// Glyphs follow the renderer's phase vector (EvalMoonAndStarsCpu: light x = sin((phase − 0.5)·2π)), so a waxing moon is
// lit on its left, as seen from the southern-hemisphere showcase site.
export function PhaseStrip(Phase) {
  const W = 400, H = 50;
  const Moons = Array.from({ length: 8 }, (_, I) => {
    const P = I / 8, Cx = 26 + I * 49.7, R = 12, On = Math.abs(((Phase - P + 1.5) % 1) - 0.5) < 1 / 16;
    const K = Math.cos(2 * Math.PI * P), Waxing = P <= 0.5;
    const Arc = `M${Cx} ${18 - R} A${R} ${R} 0 0 ${Waxing ? 1 : 0} ${Cx} ${18 + R} A${F(Math.abs(K) * R, 2)} ${R} 0 0 ${(K > 0) === Waxing ? 0 : 1} ${Cx} ${18 - R}Z`;
    return `<g class="wi-hit" data-act="moon-phase" data-value="${P}" role="button" aria-label="${MoonPhaseName(P)}">
      <circle cx="${Cx}" cy="18" r="${R + 4}" fill="${On ? "#ffffff12" : "transparent"}" stroke="${On ? "#ffb23888" : "transparent"}"/>
      <circle cx="${Cx}" cy="18" r="${R}" fill="#1b1d22" stroke="#ffffff1a"/>${P === 0 ? "" : P === 0.5 ? `<circle cx="${Cx}" cy="18" r="${R}" fill="#e8e3d6"/>` : `<path d="${Arc}" fill="#e8e3d6" transform="translate(${F(2 * Cx)} 0) scale(-1 1)"/>`}
      ${T(Cx, 45, ["New", "Wax cres", "First qtr", "Wax gib", "Full", "Wan gib", "Last qtr", "Wan cres"][I], { A: "middle", Sz: 7, C: On ? "#e6e6e6" : "#6a6a6a" })}</g>`;
  }).join("");
  return Svg(W, H, Moons, { Label: `Lunar cycle, current ${MoonPhaseName(Phase)}`, Class: "wi-strip" });
}

// ------------------------------------------------------------------------------------------------ stars
export function MagnitudeScale(Mag) {
  const W = 400, H = 34, X0 = 6, X1 = W - 6, X = (M) => X0 + (M / 8) * (X1 - X0), Gid = Id("mag");
  const Zones = [[0, 3, "Inner city"], [3, 4.5, "City"], [4.5, 5.5, "Suburb"], [5.5, 6.5, "Rural"], [6.5, 8, "Pristine"]]
    .map(([A, B, N]) => L(X(B), 4, X(B), 16, "#00000066") + T((X(A) + X(B)) / 2, 27, N, { A: "middle", Sz: 7 })).join("");
  return Svg(W, H, `<defs><linearGradient id="${Gid}"><stop offset="0" stop-color="#3a3f58"/><stop offset="1" stop-color="#05060c"/></linearGradient></defs>
    <rect x="${X0}" y="4" width="${X1 - X0}" height="12" rx="6" fill="url(#${Gid})"/>${Zones}
    ${Array.from({ length: 9 }, (_, M) => T(X(M), 33.5, `${M}`, { A: "middle", Sz: 6.5, C: "#555" })).join("")}
    <rect x="${F(X(Clamp(Mag, 0, 8)) - 1.5)}" y="1" width="3" height="18" rx="1.5" fill="#fff" stroke="#111"/>
    <rect x="${X0}" y="0" width="${X1 - X0}" height="${H}" fill="transparent" data-scrub="stars|Limiting magnitude" data-min="0" data-max="8" data-x0="${X0 / W}" data-x1="${X1 / W}" style="cursor:ew-resize"/>`,
  { Label: `Limiting magnitude ${Mag}`, Class: "wi-strip" });
}

export function TwinkleWave(Depth, Rate, On) {
  const W = 200, H = 92, X0 = 8, X1 = W - 6, Y0 = 16, Y1 = H - 14, Span = 4, Lo = 1 - Math.max(0.05, Depth * 0.008) * 1.15;
  const Lines = [0.13, 0.41, 0.77].map((Seed, I) => {
    const P = [];
    for (let K = 0; K <= 160; K++) {
      const Tm = (K / 160) * Span;
      P.push([X0 + (K / 160) * (X1 - X0), Y1 - (((On ? Twinkle(Tm, Depth, Rate, Seed) : 1) - Lo) / (1 - Lo)) * (Y1 - Y0)]);
    }
    return `<polyline points="${Pts(P)}" fill="none" stroke="${["#f2f2f2", "#9ec3ff", "#ffd38a"][I]}" stroke-width="1.1" opacity="${[0.95, 0.7, 0.55][I]}"/>`;
  }).join("");
  return Svg(W, H, `${L(X0, Y1, X1, Y1, "#ffffff20")}${L(X0, Y0, X1, Y0, "#ffffff10", 1, "2 3")}${Lines}
    ${T(X0, 10, On ? `scintillation · ${F(Depth, 0)} % at ${F(Rate, 2)} Hz` : "twinkle off", { Sz: 7.5 })}${T(X1, H - 3, `${Span} s`, { A: "end", Sz: 7 })}${T(X0, H - 3, `${F(Lo * 100, 0)} %`, { Sz: 7 })}${T(X1, Y0 - 3, "100 %", { A: "end", Sz: 7 })}`,
  { Label: "Star brightness over four seconds" });
}

// ------------------------------------------------------------------------------------------------ lens flare
const FlareShape = (Cx, Cy, R, Sides, Rot = 0) => {
  if (!Sides) return `M${F(Cx + R)} ${F(Cy)} A${F(R)} ${F(R)} 0 1 0 ${F(Cx - R)} ${F(Cy)} A${F(R)} ${F(R)} 0 1 0 ${F(Cx + R)} ${F(Cy)}Z`;
  return `M${Array.from({ length: Sides }, (_, I) => { const A = Rot + (I / Sides) * Math.PI * 2; return `${F(Cx + Math.cos(A) * R)} ${F(Cy + Math.sin(A) * R)}`; }).join(" L")}Z`;
};
// Layout schematic: ghosts on the source–centre axis, chromatic split, halo ring, starburst and anamorphic streak.
export function FlareFrame(Fl) {
  const W = 400, H = 225, Cx = W / 2, Cy = H / 2, Sx = Fl.X * W, Sy = Fl.Y * H, Diag = Math.hypot(Cx, Cy);
  const Gain = Fl.Enabled ? Fl.Intensity : 0, Sides = [0, 6, 8][Fl.Shape] ?? 0, Glow = Id("fg"), Blur = Id("fb");
  const Dx = Cx - Sx, Dy = Cy - Sy;
  const Ghosts = Array.from({ length: Fl.Ghosts }, (_, I) => {
    const Tt = 0.55 + I * 0.32 * Fl.Spacing, Gx = Sx + Dx * Tt, Gy = Sy + Dy * Tt, R = 5 + ((I * 7) % 5) * 4 + (I % 3) * 3;
    const A = Clamp(0.12 * Fl.GhostGain * Gain, 0, 0.6), Ch = Fl.Chromatic * 2.2;
    return ["#ff5a4a", "#5aff8a", "#5a8aff"].map((C, K) => `<path d="${FlareShape(Gx + (K - 1) * Ch, Gy, R, Sides, Fl.Rotation * Math.PI / 180)}" fill="${C}" fill-opacity="${F(A, 3)}"/>`).join("");
  }).join("");
  const HaloR = Fl.HaloRadius * Diag * 0.55;
  const Halo = Fl.HaloGain > 0 ? ["#ff6a5a", "#7aff9a", "#6a9aff"].map((C, K) => `<circle cx="${F(Sx + Dx * 0.08)}" cy="${F(Sy + Dy * 0.08)}" r="${F(HaloR + (K - 1) * Fl.Chromatic * 3)}" fill="none" stroke="${C}" stroke-opacity="${F(Clamp(0.22 * Fl.HaloGain * Gain, 0, 0.7), 3)}" stroke-width="${F(Math.max(0.8, Fl.HaloWidth * 120), 1)}"/>`).join("") : "";
  const Rays = Fl.Starburst ? Array.from({ length: Fl.RayPairs * 2 }, (_, I) => {
    const A = (Fl.Rotation * Math.PI) / 180 + (I / (Fl.RayPairs * 2)) * Math.PI * 2, Len = (38 + (I % 3) * 14) * Fl.Spread * Clamp(Gain, 0.2, 2);
    return L(Sx, Sy, Sx + Math.cos(A) * Len, Sy + Math.sin(A) * Len, "#fff2d6", 0.9);
  }).join("") : "";
  const Streak = Fl.Anamorphic && Fl.Streaks ? `<ellipse cx="${F(Sx)}" cy="${F(Sy)}" rx="${F(150 * Fl.StreakGain * Clamp(Gain, 0.2, 2))}" ry="1.6" fill="#7fb0ff" opacity=".75" filter="url(#${Blur})"/>` : "";
  const Blades = `<path d="${FlareShape(W - 26, 24, 12, Math.round(Fl.Blades), -Math.PI / 2)}" fill="none" stroke="#ffffff66"/>${T(W - 26, 46, `${Math.round(Fl.Blades)} blades`, { A: "middle", Sz: 7 })}`;
  return Svg(W, H, `<defs><radialGradient id="${Glow}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".25" stop-color="#ffe2a8" stop-opacity=".6"/><stop offset="1" stop-color="#ffb238" stop-opacity="0"/></radialGradient>
      <filter id="${Blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
    <rect width="${W}" height="${H}" rx="10" fill="#07080b"/>
    ${L(Sx, Sy, Sx + Dx * 2.2, Sy + Dy * 2.2, "#ffffff14", 1, "3 4")}<circle cx="${Cx}" cy="${Cy}" r="2" fill="#ffffff33"/>
    <g style="mix-blend-mode:screen">${Halo}${Ghosts}${Rays}${Streak}</g>
    <circle cx="${F(Sx)}" cy="${F(Sy)}" r="${F(26 * Clamp(Gain, 0.15, 2))}" fill="url(#${Glow})"/>
    ${Blades}${Fl.Enabled ? "" : T(Cx, Cy + 4, "flare off", { A: "middle", C: "#ff8b78", Sz: 12 })}
    ${T(10, H - 9, "drag the light source", { Sz: 7.5, C: "#5f5f5f" })}
    <rect width="${W}" height="${H}" fill="transparent" data-scrub-x="flare|Preview X" data-scrub-y="flare|Preview Y" style="cursor:crosshair"/>`,
  { Label: "Lens flare layout", Class: "wi-hero-frame" });
}

// ------------------------------------------------------------------------------------------------ exposure + camera
export function ToneChart(Gain, Contrast, Ev) {
  const W = 260, H = 176, X0 = 28, X1 = W - 8, Y0 = 8, Y1 = H - 22, Lo = -8, Hi = 8;
  const X = (S) => X0 + ((S - Lo) / (Hi - Lo)) * (X1 - X0), Y = (V) => Y1 - V * (Y1 - Y0);
  const Curve = [], Neutral = [];
  for (let I = 0; I <= 160; I++) {
    const S = Lo + (I / 160) * (Hi - Lo);
    Curve.push([X(S), Y(ToneCurve(S, Gain, Contrast))]);
    Neutral.push([X(S), Y(ToneCurve(S, Gain / 2 ** Ev, 1))]);
  }
  const Mid = ToneCurve(0, Gain, Contrast);
  const Grid = [-8, -4, 0, 4, 8].map((S) => L(X(S), Y0, X(S), Y1, "#ffffff0a") + T(X(S), H - 9, `${S > 0 ? "+" : ""}${S}`, { A: "middle" })).join("")
    + [0, 0.5, 1].map((V) => L(X0, Y(V), X1, Y(V), "#ffffff0a") + T(X0 - 4, Y(V) + 3, `${V * 100}%`, { A: "end", Sz: 7.5 })).join("");
  return Svg(W, H, `${Grid}<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${F(Y(0.98) - Y0)}" fill="#ff6b5e0c"/>
    <polyline points="${Pts(Neutral)}" fill="none" stroke="#ffffff30" stroke-dasharray="3 3"/>
    <polyline points="${Pts(Curve)}" fill="none" stroke="#f2f2f2" stroke-width="1.7"/>
    ${L(X(0), Y1, X(0), Y(Mid), "#ffb23888", 1, "2 2")}${L(X0, Y(Mid), X(0), Y(Mid), "#ffb23888", 1, "2 2")}
    <circle cx="${F(X(0))}" cy="${F(Y(Mid))}" r="3.5" fill="#ffb238"/>${T(X(0) + 6, Y(Mid) + 12, `18 % grey → ${F(Mid * 100, 0)} %`, { C: "#ffcf80", Sz: 7.5 })}
    ${T((X0 + X1) / 2, H - 1, "scene stops from mid grey", { A: "middle", Sz: 7.5 })}`,
  { Label: `Tone curve, mid grey maps to ${F(Mid * 100, 0)} percent` });
}

export function EvLadder(Ev) {
  const W = 120, H = 176, X = 60, Y0 = 14, Y1 = H - 14, Y = (E) => Y0 + ((4 - E) / 8) * (Y1 - Y0);
  const Rungs = Array.from({ length: 9 }, (_, I) => { const E = 4 - I; return L(X - (E === 0 ? 16 : 9), Y(E), X + (E === 0 ? 16 : 9), Y(E), E === 0 ? "#ffffff66" : "#ffffff22") + T(X + 22, Y(E) + 3, `${E > 0 ? "+" : ""}${E}`, { Sz: 7.5, C: E === 0 ? "#bbb" : "#666" }); }).join("");
  const Gid = Id("ev");
  return Svg(W, H, `<defs><linearGradient id="${Gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".5" stop-color="#6a6a6a"/><stop offset="1" stop-color="#0c0c0c"/></linearGradient></defs>
    <rect x="${X - 4}" y="${Y0}" width="8" height="${Y1 - Y0}" rx="4" fill="url(#${Gid})"/>${Rungs}
    <path d="M${X - 22} ${F(Y(Clamp(Ev, -4, 4)))} l9 -5 v10z" fill="#ffb238"/>${T(X - 26, F(Y(Clamp(Ev, -4, 4)) + 3), `${Ev > 0 ? "+" : ""}${F(Ev, 2)}`, { A: "end", C: "#ffcf80", Sz: 8 })}
    <rect x="0" y="${Y0}" width="${W}" height="${Y1 - Y0}" fill="transparent" data-scrub-y="post|EV Compensation" data-min="-4" data-max="4" data-y0="${Y0 / H}" data-y1="${Y1 / H}" data-invert="1" style="cursor:ns-resize"/>`,
  { Label: `Exposure compensation ${Ev} EV`, Class: "wi-ladder" });
}

export function LensFx(Bloom, Vignette, Saturation) {
  const W = 400, H = 70, Vg = Id("vg"), Bl = Id("bl"), Sat = Id("sat");
  const Hues = [0, 40, 80, 140, 200, 260, 320].map((Hh, I) => `<stop offset="${I / 6}" stop-color="hsl(${Hh} ${F(Clamp(70 * Saturation, 0, 100), 0)}% 55%)"/>`).join("");
  return Svg(W, H, `<defs><radialGradient id="${Vg}" cx=".5" cy=".5" r=".72"><stop offset="${F(Clamp(1 - Vignette, 0.05, 1) * 0.7, 2)}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${F(Clamp(Vignette * 1.4, 0, 1), 2)}"/></radialGradient>
      <radialGradient id="${Bl}"><stop offset="0" stop-color="#fff2d6" stop-opacity="${F(Clamp(Bloom * 3, 0, 1), 2)}"/><stop offset="1" stop-color="#ffb238" stop-opacity="0"/></radialGradient>
      <linearGradient id="${Sat}">${Hues}</linearGradient></defs>
    <rect x="4" y="6" width="120" height="58" rx="8" fill="#5c6878"/><rect x="4" y="6" width="120" height="58" rx="8" fill="url(#${Vg})"/>
    <circle cx="64" cy="35" r="${F(6 + Bloom * 60, 1)}" fill="url(#${Bl})"/><circle cx="64" cy="35" r="4" fill="#fff"/>
    ${T(64, 6 + 58 + 0, "", {})}${T(134, 20, "Bloom + vignette", { C: "#bdbdbd", Sz: 8.5 })}${T(134, 32, `bloom ${F(Bloom, 2)} · vignette ${F(Vignette, 2)}`, { Sz: 7.5 })}
    <rect x="134" y="42" width="262" height="12" rx="6" fill="url(#${Sat})"/>${T(396, 66, `saturation ×${F(Saturation, 2)}`, { A: "end", Sz: 7.5 })}`,
  { Label: "Bloom, vignette and saturation preview", Class: "wi-strip" });
}

export function FovDiagram(O, Subject, Focal) {
  const W = 400, H = 150, Cx = 22, Cy = H / 2, Far = Math.max(12, Math.min(140, Subject * 2.2, Number.isFinite(O.Far) ? O.Far * 1.25 : 140));
  const X = (M) => Cx + (Math.log1p(M) / Math.log1p(Far)) * (W - Cx - 14);
  const Half = (O.Hfov / 2) * (Math.PI / 180), Spread = (M) => Math.min(Cy - 8, Math.tan(Half) * (X(M) - Cx));
  const Wedge = `M${Cx} ${Cy} L${F(X(Far))} ${F(Cy - Spread(Far))} L${F(X(Far))} ${F(Cy + Spread(Far))}Z`;
  const Near = Clamp(O.Near, 0, Far), FarDof = Number.isFinite(O.Far) ? Math.min(O.Far, Far) : Far;
  const Ticks = [1, 2, 5, 10, 20, 50, 100].filter((M) => M <= Far).map((M) => L(X(M), H - 14, X(M), H - 10, "#ffffff40") + T(X(M), H - 2, `${M} m`, { A: "middle", Sz: 7 })).join("");
  return Svg(W, H, `<path d="${Wedge}" fill="#4d9bff10" stroke="#4d9bff55"/>
    <rect x="${F(X(Near))}" y="10" width="${F(Math.max(1, X(FarDof) - X(Near)))}" height="${H - 34}" fill="#46d26714" stroke="#46d26744"/>
    ${L(X(Subject), 8, X(Subject), H - 24, "#ffb238", 1.4)}<circle cx="${F(X(Subject))}" cy="${Cy}" r="5" fill="#ffb238"/>
    ${T(X(Subject), 7, `focus ${F(Subject, 1)} m`, { A: "middle", C: "#ffcf80", Sz: 7.5 })}
    ${T(F(X(Near) + 3), H - 28, `near ${F(O.Near, 2)} m`, { C: "#7fe39a", Sz: 7 })}${T(F(Math.min(W - 6, X(FarDof) - 3)), H - 28, Number.isFinite(O.Far) ? `far ${F(O.Far, 1)} m` : "far ∞", { A: "end", C: "#7fe39a", Sz: 7 })}
    <rect x="${Cx - 14}" y="${Cy - 7}" width="14" height="14" rx="3" fill="#2a2a2a" stroke="#888"/>${T(Cx - 7, Cy - 11, `${Focal} mm`, { A: "middle", Sz: 7 })}
    ${L(Cx, H - 12, W - 14, H - 12, "#ffffff22")}${Ticks}`,
  { Label: `Field of view ${F(O.Hfov)} degrees, depth of field ${F(O.Near, 2)} to ${Number.isFinite(O.Far) ? F(O.Far, 1) : "infinity"} metres` });
}

// ------------------------------------------------------------------------------------------------ fog
export function FogChart(Density, Falloff, On) {
  const W = 200, H = 150, X0 = 30, X1 = W - 6, Y0 = 8, Y1 = H - 20, Top = Falloff * 4;
  const Y = (M) => Y1 - (M / Top) * (Y1 - Y0), X = (D) => X0 + (D / Math.max(1e-6, Density)) * (X1 - X0) * 0.95;
  const P = [];
  for (let I = 0; I <= 60; I++) { const M = (I / 60) * Top; P.push([X(Density * Math.exp(-M / Falloff)), Y(M)]); }
  return Svg(W, H, `${[0, 1, 2, 3, 4].map((K) => L(X0, Y(K * Falloff), X1, Y(K * Falloff), "#ffffff08") + T(X0 - 4, Y(K * Falloff) + 3, `${F((K * Falloff) / 1000, Falloff >= 1000 ? 1 : 2)}`, { A: "end", Sz: 7.5 })).join("")}
    <polygon points="${Pts([[X0, Y1], ...P, [X0, Y(Top)]])}" fill="#cfd8e6${On ? "26" : "0c"}"/><polyline points="${Pts(P)}" fill="none" stroke="${On ? "#cfd8e6" : "#5a5a5a"}" stroke-width="1.5"/>
    ${L(X0, Y(Falloff), X1, Y(Falloff), "#9ec3ff88", 1, "3 3")}${T(X1, Y(Falloff) - 3, `falloff ${F(Falloff, 0)} m · 37 %`, { A: "end", C: "#9ec3ff", Sz: 7.5 })}
    ${T(4, Y0 + 2, "km", { Sz: 7.5 })}${T((X0 + X1) / 2, H - 6, "density with height", { A: "middle" })}`,
  { Label: `Height fog density ${Density} per metre, falloff ${Falloff} metres` });
}

export function VisibilityStrip(Sigma, AerialStart, On) {
  const W = 400, H = 44, X0 = 6, X1 = W - 6, Max = 20000, X = (M) => X0 + (Math.log1p(M / 50) / Math.log1p(Max / 50)) * (X1 - X0), Gid = Id("vis");
  const Stops = Array.from({ length: 13 }, (_, I) => { const M = (Max * I) / 12, Tr = On ? Math.exp(-Sigma * M) : 1; return `<stop offset="${F((X(M) - X0) / (X1 - X0), 3)}" stop-color="rgb(${Math.round(60 + 140 * (1 - Tr))},${Math.round(80 + 125 * (1 - Tr))},${Math.round(110 + 110 * (1 - Tr))})"/>`; }).join("");
  const Vis = Visibility(Sigma);
  return Svg(W, H, `<defs><linearGradient id="${Gid}">${Stops}</linearGradient></defs><rect x="${X0}" y="6" width="${X1 - X0}" height="14" rx="7" fill="url(#${Gid})"/>
    ${[100, 1000, 5000, 10000, 20000].map((M) => L(X(M), 20, X(M), 24, "#ffffff40") + T(X(M), 33, M >= 1000 ? `${M / 1000} km` : `${M} m`, { A: "middle", Sz: 7 })).join("")}
    ${On && Number.isFinite(Vis) && Vis < Max ? `<rect x="${F(X(Vis) - 1.5)}" y="2" width="3" height="22" rx="1.5" fill="#fff" stroke="#111"/>${T(X(Vis), 43, `visibility ${Vis >= 1000 ? `${F(Vis / 1000, 1)} km` : `${F(Vis, 0)} m`}`, { A: "middle", C: "#e6e6e6", Sz: 7.5 })}` : ""}
    ${L(X(AerialStart), 4, X(AerialStart), 22, "#ffb238", 1.2, "2 2")}`, { Label: "Contrast with distance through the fog", Class: "wi-strip" });
}

// ------------------------------------------------------------------------------------------------ wind
export function WindRose(Bearing, Speed, Turbulence, Gust) {
  const S = 160, C = S / 2, R = C - 16, A = (Bearing * Math.PI) / 180, Spread = (8 + Turbulence * 40) * (Math.PI / 180);
  const Arc = (Ang, Rr) => [C + Math.sin(Ang) * Rr, C - Math.cos(Ang) * Rr];
  const Sector = `M${C} ${C} L${Pts([Arc(A - Spread, R)])} A${R} ${R} 0 0 1 ${Pts([Arc(A + Spread, R)])}Z`;
  const Len = Clamp(Speed / 40, 0.12, 1) * R, Tail = Arc(A, Len), Head = Arc(A + Math.PI, Len * 0.55);
  const Ticks = Array.from({ length: 72 }, (_, I) => { const An = (I * 5 * Math.PI) / 180, Lg = I % 18 === 0 ? 7 : I % 2 === 0 ? 3.5 : 1.8; return L(...Arc(An, R - Lg), ...Arc(An, R), Lg > 5 ? "#ffffff66" : "#ffffff1c"); }).join("");
  const Cards = [["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([N, D]) => T(...Arc((D * Math.PI) / 180, R + 9), N, { A: "middle", Sz: 8, C: N === "N" ? "#e6e6e6" : "#777" })).join("");
  const Gustw = Clamp(Speed * (1 + Gust) / 40, 0, 1) * R;
  return Svg(S, S, `<circle cx="${C}" cy="${C}" r="${R}" fill="#0d0f14" stroke="#ffffff14"/>${[0.25, 0.5, 0.75].map((K) => `<circle cx="${C}" cy="${C}" r="${F(R * K)}" fill="none" stroke="#ffffff0c"/>`).join("")}
    <path d="${Sector}" fill="#89e0c41a" stroke="#89e0c455"/>${Ticks}${Cards}
    <circle cx="${C}" cy="${C}" r="${F(Gustw)}" fill="none" stroke="#89e0c4" stroke-opacity=".35" stroke-dasharray="2 3"/>
    ${L(Tail[0], Tail[1], Head[0], Head[1], "#89e0c4", 2)}<path d="M${F(Head[0])} ${F(Head[1])} l${F(Math.sin(A + Math.PI - 0.5) * -8)} ${F(-Math.cos(A + Math.PI - 0.5) * -8)} M${F(Head[0])} ${F(Head[1])} l${F(Math.sin(A + Math.PI + 0.5) * -8)} ${F(-Math.cos(A + Math.PI + 0.5) * -8)}" stroke="#89e0c4" stroke-width="2" fill="none"/>
    <circle cx="${F(Tail[0])}" cy="${F(Tail[1])}" r="3.5" fill="#89e0c4"/>
    <circle cx="${C}" cy="${C}" r="${R}" fill="transparent" data-scrub-angle="wind|Bearing" style="cursor:grab"/>`,
  { Label: `Wind from ${F(Bearing, 0)} degrees ${CompassName(Bearing)} at ${F(Speed)} metres per second`, Class: "wi-compass" });
}

export function WindProfile(Speed, Shear, Veer, Bearing) {
  const W = 230, H = 160, X0 = 34, Y0 = 10, Y1 = H - 16, Top = 3;
  const Y = (Km) => Y1 - (Km / Top) * (Y1 - Y0), Max = Speed * (1 + Shear * Top) || 1;
  const Rows = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((Km) => {
    const V = Speed * (1 + Shear * Km), Dir = ((Bearing + Veer * Km) * Math.PI) / 180, Len = (V / Max) * 70;
    const Cx = X0 + 80, Cy = Y(Km), Dx = -Math.sin(Dir) * Len, Dy = Math.cos(Dir) * Len * 0.45;
    return L(X0, Cy, W - 6, Cy, "#ffffff08") + T(X0 - 5, Cy + 3, `${Km}`, { A: "end", Sz: 7.5 })
      + L(Cx - Dx / 2, Cy - Dy / 2, Cx + Dx / 2, Cy + Dy / 2, "#89e0c4", 1.6) + `<circle cx="${F(Cx + Dx / 2)}" cy="${F(Cy + Dy / 2)}" r="2.2" fill="#89e0c4"/>`
      + T(W - 6, Cy + 3, `${F(V, 1)} m/s`, { A: "end", Sz: 7.5, C: "#9a9a9a" });
  }).join("");
  return Svg(W, H, `${T(4, Y0 + 2, "km", { Sz: 7.5 })}${Rows}${T(X0 + 80, H - 3, `shear ${F(Shear, 2)}/km · veer ${F(Veer, 0)}°/km`, { A: "middle", Sz: 7.5 })}`, { Label: "Wind speed and direction with height" });
}

export function BeaufortStrip(Ms) {
  const W = 400, H = 36, X0 = 6, X1 = W - 6, Cell = (X1 - X0) / 13, B = Beaufort(Ms);
  const Cells = Array.from({ length: 13 }, (_, I) => `<rect x="${F(X0 + I * Cell + 1)}" y="4" width="${F(Cell - 2)}" height="14" rx="4" fill="hsl(${F(160 - I * 13, 0)} ${I === B.Force ? 70 : 30}% ${I === B.Force ? 55 : 22}%)"/>${T(X0 + I * Cell + Cell / 2, 14.5, `${I}`, { A: "middle", Sz: 7.5, C: I === B.Force ? "#111" : "#9a9a9a", W: I === B.Force ? 500 : 300 })}`).join("");
  return Svg(W, H, `${Cells}${T(X0, 31, "Beaufort", { Sz: 7.5 })}${T(X1, 31, `${B.Name} · ${F(Ms * 3.6, 0)} km/h · ${F(Ms * 1.943844, 0)} kn`, { A: "end", Sz: 7.5, C: "#cfcfcf" })}`, { Label: `Beaufort force ${B.Force}, ${B.Name}`, Class: "wi-strip" });
}

// ------------------------------------------------------------------------------------------------ weather
export function RainbowDiagram(SunEl, Rb) {
  const W = 400, H = 160, Cx = W / 2, Hz = 118, K = 2.15, Ay = Hz + SunEl * K, Gid = Id("rb");
  const Clip = Id("rbc");
  const Bow = (Deg, Op, Wd) => ["#ff4a3a", "#ff9b2e", "#ffe14a", "#4ade6a", "#4aa8ff", "#7a5cff"].map((C, I) => `<circle cx="${Cx}" cy="${F(Ay)}" r="${F((Deg + (Deg === PRIMARY_BOW ? 1 : -1) * (I - 2.5) * 0.35 * Wd) * K)}" fill="none" stroke="${C}" stroke-opacity="${F(Op, 2)}" stroke-width="${F(1.6 * Wd, 2)}"/>`).join("");
  const Band = Rb.Alexander ? `<path d="M${Cx - SECONDARY_BOW * K} ${F(Ay)} A${SECONDARY_BOW * K} ${SECONDARY_BOW * K} 0 0 1 ${Cx + SECONDARY_BOW * K} ${F(Ay)} L${Cx + PRIMARY_BOW * K} ${F(Ay)} A${PRIMARY_BOW * K} ${PRIMARY_BOW * K} 0 0 0 ${Cx - PRIMARY_BOW * K} ${F(Ay)}Z" fill="#000" opacity=".35"/>` : "";
  const Top = PRIMARY_BOW - SunEl;
  return Svg(W, H, `<defs><linearGradient id="${Gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4a63"/><stop offset="1" stop-color="#7d8aa0"/></linearGradient><clipPath id="${Clip}"><rect width="${W}" height="${Hz}"/></clipPath></defs>
    <rect width="${W}" height="${Hz}" rx="8" fill="url(#${Gid})"/><rect y="${Hz}" width="${W}" height="${H - Hz}" fill="#26241f"/>
    <g clip-path="url(#${Clip})" opacity="${Rb.Enabled ? Clamp(0.35 + Rb.Intensity * 0.3, 0, 1) : 0.08}">${Band}${Bow(PRIMARY_BOW, 0.9, Rb.Width)}${Bow(SECONDARY_BOW, 0.55 * Rb.Secondary, Rb.Width)}</g>
    ${L(0, Hz, W, Hz, "#ffffff55")}${L(Cx, Hz, Cx, Math.min(H - 4, Ay), "#ffffff30", 1, "2 3")}
    <circle cx="${Cx}" cy="${F(Math.min(H - 6, Ay))}" r="3" fill="#ffb238"/>${T(Cx + 6, Math.min(H - 6, Ay) + 3, `antisolar point −${F(SunEl, 0)}°`, { Sz: 7.5, C: "#ffcf80" })}
    ${T(8, 14, Top > 0 ? `primary bow top ${F(Top, 0)}° above horizon` : "bow below the horizon: sun higher than 42°", { Sz: 8, C: Top > 0 ? "#e6e6e6" : "#ff8b78" })}
    ${T(W - 8, 14, `42° · 51°${Rb.Alexander ? " · Alexander band" : ""}`, { A: "end", Sz: 7.5, C: "#cfd8e6" })}`,
  { Label: `Rainbow geometry with the sun at ${F(SunEl)} degrees` });
}

export function RainScale(MmH, On, Type) {
  const W = 400, H = 40, X0 = 6, X1 = W - 6, X = (V) => X0 + (Math.log10(Clamp(V, 0.1, 100)) + 1) / 3 * (X1 - X0), Gid = Id("rain");
  const Zones = [[0.1, 2.5, "Light"], [2.5, 7.6, "Moderate"], [7.6, 50, "Heavy"], [50, 100, "Violent"]].map(([A, B, N]) => L(X(B), 4, X(B), 18, "#00000066") + T((X(A) + X(B)) / 2, 29, N, { A: "middle", Sz: 7 })).join("");
  return Svg(W, H, `<defs><linearGradient id="${Gid}"><stop offset="0" stop-color="#2b4566"/><stop offset=".5" stop-color="#3f7fd0"/><stop offset=".8" stop-color="#d0a03f"/><stop offset="1" stop-color="#d04a3f"/></linearGradient></defs>
    <rect x="${X0}" y="5" width="${X1 - X0}" height="12" rx="6" fill="url(#${Gid})" opacity="${On ? 1 : 0.3}"/>${Zones}
    ${[1, 10].map((V) => T(X(V), 38, `${V}`, { A: "middle", Sz: 6.5, C: "#555" })).join("")}
    <rect x="${F(X(MmH) - 1.5)}" y="1" width="3" height="20" rx="1.5" fill="#fff" stroke="#111"/>${T(X1, 38, `mm/h · ${Type}`, { A: "end", Sz: 7, C: "#777" })}${T(X0, 38, "0.1", { Sz: 6.5, C: "#555" })}`,
  { Label: `Precipitation ${MmH} millimetres per hour`, Class: "wi-strip" });
}

// ------------------------------------------------------------------------------------------------ objects
export function TransformDiagram(Pos, Scale, Rot) {
  const W = 200, H = 150, Ox = 100, Oy = 88, K = 19;
  const Iso = ([X, Y, Z]) => [Ox + (X - Y) * K * 0.866, Oy + (X + Y) * K * 0.5 - Z * K];
  const Grid = Array.from({ length: 7 }, (_, I) => { const V = I - 3; return L(...Iso([V, -3, 0]), ...Iso([V, 3, 0]), "#ffffff0c") + L(...Iso([-3, V, 0]), ...Iso([3, V, 0]), "#ffffff0c"); }).join("");
  const Fit = Math.max(1, ...Scale.map(Math.abs), ...Pos.map((P) => Math.abs(P) / 2.6));
  const P = Pos.map((V) => V / Fit), S = Scale.map((V) => Math.abs(V) / Fit / 2);
  const Rz = ((Rot?.[2] || 0) * Math.PI) / 180;
  const Corner = (Sx, Sy, Sz) => { const X = Sx * S[0], Y = Sy * S[1]; return Iso([P[0] + X * Math.cos(Rz) - Y * Math.sin(Rz), P[1] + X * Math.sin(Rz) + Y * Math.cos(Rz), P[2] + Sz * S[2]]); };
  const Face = (List, C) => `<polygon points="${Pts(List.map((V) => Corner(...V)))}" fill="${C}" stroke="#ffffff55" stroke-width=".8"/>`;
  const Axis = (V, C, N) => L(...Iso([0, 0, 0]), ...Iso(V), C, 1.3) + T(...Iso(V.map((A) => A * 1.15)), N, { A: "middle", C, Sz: 8 });
  const Foot = Iso([P[0], P[1], 0]), Mid = Iso(P);
  return Svg(W, H, `${Grid}${Axis([2.6, 0, 0], "#cf9a93", "X")}${Axis([0, 2.6, 0], "#9ec3a6", "Y")}${Axis([0, 0, 2.6], "#91aace", "Z")}
    ${L(Foot[0], Foot[1], Mid[0], Mid[1], "#ffb23866", 1, "2 2")}<ellipse cx="${F(Foot[0])}" cy="${F(Foot[1])}" rx="${F(Math.max(2, S[0] * K))}" ry="${F(Math.max(1, S[0] * K * 0.5))}" fill="#00000055"/>
    ${Face([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], "#4d9bff22")}${Face([[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], "#4d9bff30")}${Face([[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], "#4d9bff44")}
    ${T(4, H - 6, Fit > 1 ? `scaled 1 : ${F(Fit, 1)}` : "1 grid = 1 m", { Sz: 7.5 })}`,
  { Label: `Object at ${Pos.map((V) => F(V, 2)).join(", ")} metres, size ${Scale.map((V) => F(V, 2)).join(" by ")}` });
}

export function LuxScale(Lux, Label = "illuminance") {
  const W = 400, H = 46, X0 = 6, X1 = W - 6, X = (V) => X0 + ((Math.log10(Clamp(V, 0.001, 200000)) + 3) / 8.3) * (X1 - X0), Gid = Id("lux");
  const Refs = LUX_REFERENCES.map(([V, N], I) => L(X(V), 16, X(V), 20, "#ffffff55") + T(X(V), I % 2 ? 38 : 29, N, { A: "middle", Sz: 7 })).join("");
  return Svg(W, H, `<defs><linearGradient id="${Gid}"><stop offset="0" stop-color="#0b0d18"/><stop offset=".45" stop-color="#4a4030"/><stop offset="1" stop-color="#fff3d0"/></linearGradient></defs>
    <rect x="${X0}" y="4" width="${X1 - X0}" height="12" rx="6" fill="url(#${Gid})"/>${Refs}
    <rect x="${F(X(Lux) - 1.5)}" y="0" width="3" height="20" rx="1.5" fill="#ffb238" stroke="#111"/>${T(X1, 46, Label, { A: "end", Sz: 7, C: "#666" })}`,
  { Label: `${Label} ${F(Lux, 1)} lux on a log scale`, Class: "wi-strip" });
}

export function LightFootprint(Width, Height, Elev, Spread) {
  const W = 200, H = 150, Gx = 100, Gy = 128, K = Math.min(26, 90 / Math.max(Width, Height, 1));
  const Top = Gy - Math.min(96, Elev * 38), Half = ((Clamp(Spread, 10, 180) / 2) * Math.PI) / 180, Reach = Math.min(90, Math.tan(Math.min(Half, 1.4)) * (Gy - Top));
  return Svg(W, H, `<rect x="0" y="${Gy}" width="${W}" height="${H - Gy}" fill="#1d1b17"/>${L(0, Gy, W, Gy, "#ffffff30")}
    <path d="M${F(Gx - (Width * K) / 2)} ${F(Top)} L${F(Gx + (Width * K) / 2)} ${F(Top)} L${F(Gx + (Width * K) / 2 + Reach)} ${Gy} L${F(Gx - (Width * K) / 2 - Reach)} ${Gy}Z" fill="#ffd38a14" stroke="#ffd38a33"/>
    <rect x="${F(Gx - (Width * K) / 2)}" y="${F(Top - 3)}" width="${F(Width * K)}" height="6" rx="2" fill="#fff3d0"/>
    ${L(14, Gy, 14, Top, "#ffffff40")}${T(18, (Gy + Top) / 2, `${F(Elev, 2)} m`, { Sz: 7.5 })}
    ${T(Gx, Top - 8, `${F(Width, 2)} × ${F(Height, 2)} m · ${F(Spread, 0)}° spread`, { A: "middle", Sz: 7.5, C: "#cfcfcf" })}`,
  { Label: `Area light ${Width} by ${Height} metres at ${Elev} metres` });
}

// ================================================================================================ canvas renderers
// Fisheye sky dome (zenith centre, horizon rim, north up, east left as seen from below) built from the renderer's
// Sky-View LUT plus, optionally, the CPU parity cloud and moon/star evaluators.  Chunked so a drag never stalls.
const Jobs = new WeakMap();

export function RenderDome(Canvas, Spec) {
  if (!Canvas?.getContext) return;
  const Size = Spec.Size || 168, Ctx = Canvas.getContext("2d");
  if (!Ctx) return;
  Canvas.width = Size; Canvas.height = Size;
  const Img = Ctx.createImageData(Size, Size), Out = [0, 0, 0], R = Size / 2 - 1, Job = {};
  Jobs.set(Canvas, Job);
  let Row = 0;
  const Step = () => {
    if (Jobs.get(Canvas) !== Job) return;
    const End = Math.min(Size, Row + (Spec.Clouds ? 6 : 24));
    for (; Row < End; Row++) {
      for (let Col = 0; Col < Size; Col++) {
        const U = (Col + 0.5 - Size / 2) / R, V = (Row + 0.5 - Size / 2) / R, Rr = Math.hypot(U, V), I = (Row * Size + Col) * 4;
        if (Rr > 1) { Img.data[I + 3] = 0; continue; }
        const Az = Math.atan2(-U, -V) * (180 / Math.PI), El = 90 - Rr * 90;
        const [Dx, Dy, Dz] = ConvertAzimuthElevationToWorldAxis(Az, El);
        SampleSkyViewInto(Spec.Lut, Dx, Dy, Dz, Out);
        let Lr = Out[0], Lg = Out[1], Lb = Out[2];
        if (Spec.Stars || Spec.Moon) {
          const Ms = EvalMoonAndStarsCpu(Dx, Dy, Dz, Spec.SunDir, Spec.Moon, Spec.Stars, Spec.Time || 0);
          Lr += Ms[0]; Lg += Ms[1]; Lb += Ms[2];
        }
        if (Spec.Clouds) {
          const Cl = EvalVolumetricCloudsCpu(Dx, Dy, Dz, Spec.SunDir, Spec.SunIrr, Spec.SkyCol, Spec.Clouds, 0);
          Lr = Lr * Cl.trans + Cl.rad[0]; Lg = Lg * Cl.trans + Cl.rad[1]; Lb = Lb * Cl.trans + Cl.rad[2];
        }
        const Sep = Dx * Spec.SunDir[0] + Dy * Spec.SunDir[1] + Dz * Spec.SunDir[2];
        if (Spec.SunDisc && Sep > Math.cos(Math.max(0.035, Spec.SunDisc.HalfRad))) { Lr += Spec.SunDisc.Rgb[0]; Lg += Spec.SunDisc.Rgb[1]; Lb += Spec.SunDisc.Rgb[2]; }
        const Edge = Clamp((1 - Rr) * R * 0.9, 0, 1);
        Img.data[I] = AcesFilm(Lr * Spec.Gain) ** (1 / 2.2) * 255;
        Img.data[I + 1] = AcesFilm(Lg * Spec.Gain) ** (1 / 2.2) * 255;
        Img.data[I + 2] = AcesFilm(Lb * Spec.Gain) ** (1 / 2.2) * 255;
        Img.data[I + 3] = 255 * Edge;
      }
    }
    Ctx.putImageData(Img, 0, 0);
    if (Row < Size) (globalThis.requestAnimationFrame || ((Fn) => setTimeout(Fn, 0)))(Step);
    else Spec.Done?.();
  };
  Step();
}

// Zenith star window: a 30° gnomonic patch around the zenith (north up, west right, as in the dome).  The star field is
// a hashed lattice of ~0.05° points, far below one pixel of a 168 px dome, so each pixel keeps the brightest of a 4×4
// sub-grid of evaluator samples — every star the renderer would draw in that patch lands on a pixel.
export function RenderStarWindow(Canvas, Spec) {
  if (!Canvas?.getContext) return;
  const Size = Spec.Size || 168, Ctx = Canvas.getContext("2d");
  if (!Ctx) return;
  Canvas.width = Size; Canvas.height = Size;
  const Img = Ctx.createImageData(Size, Size), Out = [0, 0, 0], Tan = Math.tan(((Spec.FovDeg || 30) * Math.PI) / 360), Job = {}, Sub = 4;
  Jobs.set(Canvas, Job);
  let Row = 0;
  const Dir = (U, V) => { const X = -V * Tan, Y = U * Tan, L = Math.hypot(X, Y, 1); return [X / L, Y / L, 1 / L]; };
  const Step = () => {
    if (Jobs.get(Canvas) !== Job) return;
    const End = Math.min(Size, Row + 8);
    for (; Row < End; Row++) for (let Col = 0; Col < Size; Col++) {
      const I = (Row * Size + Col) * 4;
      const [Cx, Cy, Cz] = Dir((Col + 0.5) / Size * 2 - 1, (Row + 0.5) / Size * 2 - 1);
      SampleSkyViewInto(Spec.Lut, Cx, Cy, Cz, Out);
      let Sr = 0, Sg = 0, Sb = 0;
      for (let J = 0; J < Sub; J++) for (let K = 0; K < Sub; K++) {
        const [Dx, Dy, Dz] = Dir((Col + (K + 0.5) / Sub) / Size * 2 - 1, (Row + (J + 0.5) / Sub) / Size * 2 - 1);
        const S = EvalMoonAndStarsCpu(Dx, Dy, Dz, Spec.SunDir, Spec.Moon, Spec.Stars, Spec.Time || 0);
        if (S[0] + S[1] + S[2] > Sr + Sg + Sb) { Sr = S[0]; Sg = S[1]; Sb = S[2]; }
      }
      Img.data[I] = AcesFilm((Out[0] + Sr) * Spec.Gain) ** (1 / 2.2) * 255;
      Img.data[I + 1] = AcesFilm((Out[1] + Sg) * Spec.Gain) ** (1 / 2.2) * 255;
      Img.data[I + 2] = AcesFilm((Out[2] + Sb) * Spec.Gain) ** (1 / 2.2) * 255;
      Img.data[I + 3] = 255;
    }
    Ctx.putImageData(Img, 0, 0);
    if (Row < Size) (globalThis.requestAnimationFrame || ((Fn) => setTimeout(Fn, 0)))(Step);
    else Spec.Done?.();
  };
  Step();
}

// Real lunar texture (the six World Mirror moon presets) lit with EvalMoonAndStarsCpu's phase vector.
const MoonTextures = new Map();
const MOON_FILES = ["luna", "ember", "glacier", "sulfur", "shroud", "shard"];
function MoonTexture(Preset, Ready) {
  const Name = MOON_FILES[Preset] || "luna";
  const Hit = MoonTextures.get(Name);
  if (Hit?.Pixels) return Hit;
  if (!Hit && typeof Image !== "undefined") {
    const Rec = { Pixels: null, W: 512, H: 256, Waiters: [Ready] };
    MoonTextures.set(Name, Rec);
    const Img = new Image();
    Img.onload = () => {
      const C = document.createElement("canvas");
      C.width = Rec.W; C.height = Rec.H;
      const G = C.getContext("2d");
      G.drawImage(Img, 0, 0, Rec.W, Rec.H);
      Rec.Pixels = G.getImageData(0, 0, Rec.W, Rec.H).data;
      for (const Fn of Rec.Waiters) Fn?.();
      Rec.Waiters = [];
    };
    Img.src = `../PhotometricEditor/Textures/Moons/${Name}_2k.jpg`;
  } else Hit?.Waiters.push(Ready);
  return null;
}

export function RenderMoon(Canvas, M) {
  if (!Canvas?.getContext) return;
  const Size = 150, Ctx = Canvas.getContext("2d");
  if (!Ctx) return;
  Canvas.width = Size; Canvas.height = Size;
  const Tex = MoonTexture(M.Preset, () => RenderMoon(Canvas, M));
  const Img = Ctx.createImageData(Size, Size), R = 52, C = Size / 2, Tint = MOON_PRESET_TINTS[M.Preset] || MOON_PRESET_TINTS[0];
  const Ph = (M.Phase - 0.5) * Math.PI * 2, Lv = [Math.sin(Ph), 0.18, Math.cos(Ph)], Ll = Math.hypot(...Lv);
  const Roll = (M.Roll * Math.PI) / 180, Cr = Math.cos(Roll), Sr = Math.sin(Roll);
  for (let Y = 0; Y < Size; Y++) for (let X = 0; X < Size; X++) {
    const I = (Y * Size + X) * 4, Px0 = (X + 0.5 - C) / R, Py0 = -(Y + 0.5 - C) / R, D = Math.hypot(Px0, Py0);
    let Rr = 0, Gg = 0, Bb = 0;
    if (D < 1) {
      const Px = Px0 * Cr - Py0 * Sr, Py = Px0 * Sr + Py0 * Cr, Pz = Math.sqrt(1 - Px * Px - Py * Py);
      let Al = [0.62, 0.61, 0.59];
      if (Tex?.Pixels) {
        const Lon = Math.atan2(Px, Pz), Lat = Math.asin(Py);
        const Tx = Math.floor(((Lon / (2 * Math.PI) + 0.5) % 1) * (Tex.W - 1)), Ty = Math.floor((0.5 - Lat / Math.PI) * (Tex.H - 1)), K = (Ty * Tex.W + Tx) * 4;
        Al = [Tex.Pixels[K] / 255, Tex.Pixels[K + 1] / 255, Tex.Pixels[K + 2] / 255].map((V) => V ** 2.2);
      }
      const Ndl = Math.max(0, (Px0 * Lv[0] + Py0 * Lv[1] + Pz * Lv[2]) / Ll);
      const Lum = (0.015 + Ndl * 1.45) * M.Bright * Clamp((1 - D) * 60, 0, 1);
      Rr = Al[0] * Tint[0] * Lum; Gg = Al[1] * Tint[1] * Lum; Bb = Al[2] * Tint[2] * Lum;
    }
    const Halo = D >= 1 ? Math.max(0, 1 - (D - 1) * 1.6) ** 3 * 0.18 * M.Glow * MoonIllumination(M.Phase) * M.Bright : 0;
    Img.data[I] = AcesFilm(Rr + Tint[0] * Halo) ** (1 / 2.2) * 255;
    Img.data[I + 1] = AcesFilm(Gg + Tint[1] * Halo) ** (1 / 2.2) * 255;
    Img.data[I + 2] = AcesFilm(Bb + Tint[2] * Halo) ** (1 / 2.2) * 255;
    Img.data[I + 3] = D < 1 ? 255 : Clamp(Halo * 4, 0, 1) * 255;
  }
  Ctx.putImageData(Img, 0, 0);
}

// Analytic material ball lit by the compiled sun irradiance and zenith sky (Lambert + GGX, Schlick Fresnel).
export function RenderBall(Canvas, B) {
  if (!Canvas?.getContext) return;
  const Size = 150, Ctx = Canvas.getContext("2d");
  if (!Ctx) return;
  Canvas.width = Size; Canvas.height = Size;
  const Img = Ctx.createImageData(Size, Size), R = 60, C = Size / 2;
  const View = [0, 0, 1], Sun = [B.SunDir[1] * -0.9 + 0.35, Math.max(0.25, B.SunDir[2]), 0.75], Sl = Math.hypot(...Sun);
  const Ls = Sun.map((V) => V / Sl), A = Math.max(0.02, B.Roughness * B.Roughness);
  const F0 = [0, 1, 2].map((K) => B.F0 * (1 - B.Metallic) + B.Albedo[K] * B.Metallic);
  for (let Y = 0; Y < Size; Y++) for (let X = 0; X < Size; X++) {
    const I = (Y * Size + X) * 4, Nx = (X + 0.5 - C) / R, Ny = -(Y + 0.5 - C) / R, D = Nx * Nx + Ny * Ny;
    if (D >= 1) { Img.data[I + 3] = 0; continue; }
    const Nz = Math.sqrt(1 - D), N = [Nx, Ny, Nz];
    const Ndl = Math.max(0, N[0] * Ls[0] + N[1] * Ls[1] + N[2] * Ls[2]), Ndv = Math.max(1e-3, Nz);
    const Hv = [Ls[0] + View[0], Ls[1] + View[1], Ls[2] + View[2]], Hl = Math.hypot(...Hv), Hn = Hv.map((V) => V / Hl);
    const Ndh = Math.max(0, N[0] * Hn[0] + N[1] * Hn[1] + N[2] * Hn[2]), Vdh = Math.max(0, Hn[2]);
    const Dg = (A * A) / (Math.PI * ((Ndh * Ndh) * (A * A - 1) + 1) ** 2), K = A / 2;
    const G = (Ndl / (Ndl * (1 - K) + K)) * (Ndv / (Ndv * (1 - K) + K));
    const Sky = 0.5 + 0.5 * Ny, Out = [0, 0, 0];
    for (let Ch = 0; Ch < 3; Ch++) {
      const Fr = F0[Ch] + (1 - F0[Ch]) * (1 - Vdh) ** 5, FrV = F0[Ch] + (1 - F0[Ch]) * (1 - Ndv) ** 5;
      const Diffuse = (B.Albedo[Ch] / Math.PI) * (1 - B.Metallic) * (1 - B.Transmission * 0.9) * (1 - Fr);
      const Spec = (Dg * G * Fr) / Math.max(1e-3, 4 * Ndl * Ndv);
      const Coat = B.Coat * 0.04 * ((0.0016 / (Math.PI * ((Ndh * Ndh) * (0.0016 - 1) + 1) ** 2)) * G) / Math.max(1e-3, 4 * Ndl * Ndv);
      Out[Ch] = (Diffuse + Spec + Coat) * B.SunIrr[Ch] * Ndl * 3 + B.SkyCol[Ch] * (Diffuse * Math.PI * Sky + FrV * (0.4 + 0.6 * Sky)) * 2.2 + B.Emission * B.Albedo[Ch] * 0.15;
    }
    const Edge = Clamp((1 - Math.sqrt(D)) * R, 0, 1);
    Img.data[I] = AcesFilm(Out[0] * B.Gain) ** (1 / 2.2) * 255;
    Img.data[I + 1] = AcesFilm(Out[1] * B.Gain) ** (1 / 2.2) * 255;
    Img.data[I + 2] = AcesFilm(Out[2] * B.Gain) ** (1 / 2.2) * 255;
    Img.data[I + 3] = 255 * Edge;
  }
  Ctx.putImageData(Img, 0, 0);
}
