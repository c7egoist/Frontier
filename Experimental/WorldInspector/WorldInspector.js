// WorldInspector.js — World Mirror inspector cards for the environment and scene objects, Project Zero card style.
//
// Cards only (no viewport): Sun, Atmosphere, Clouds, Moon, Stars, Lens Flare, Exposure, Camera, Wind, Fog, Weather,
// Object, Light, Group.  Each card edits the World Mirror record the editor itself edits (WorldDocument.js), and every
// graphic is computed from World Mirror's own solvers: Solar.mjs for the sun, CompileLiveGtxScene for what the renderer
// receives, the Sky-View LUT plus the CPU parity cloud and moon/star evaluators for the sky domes.
//
// Rendering: a card is rebuilt wholesale on discrete edits ("change", clicks); while a slider or graphic is dragged only
// the [data-live] regions are refreshed, so the control under the pointer is never replaced mid-drag.  Canvases live
// outside both: placeholders are re-attached to cached canvases and only re-rendered when their key changes.

import { Knob, ColourField, SwitchRow, Segments, Dropdown, StatTile, SyncSiblings, Rebuild, History, Download, Esc, HEX } from "../MaterialInspector/CardKit.js";
import { Icon } from "./WorldIcons.js";
import {
  UseCatalogue, FieldMeta, CreateDocument, RowOf, RecordOf, ObjectRows, Read, Edit, AdvanceClock, ResetPanel, Compile, Save, Load, ExportJson, STORE_KEY,
} from "./WorldDocument.js";
import * as D from "./WorldDerived.js";
import * as G from "./WorldGraphics.js";
import { BuildSkyViewLut, GetSkyViewCacheKey, MOON_PRESET_TINTS } from "../FrontierWorldMirror/AtmosphereSky.js";
import { MaterialChannels, MaterialTypes, ResolveMaterial, ChangeChannel, ChooseMaterialType } from "../FrontierWorldMirror/MaterialSpecification.js";

const F = (V, Dg = 1) => (Number.isFinite(+V) ? (+V).toFixed(Dg) : "—");
const Signed = (V, Dg = 1) => `${V > 0 ? "+" : ""}${F(V, Dg)}`;

// ------------------------------------------------------------------------------------------------ card registry
export const CARDS = [
  { Id: "sun", Name: "Sun", Icon: "sun", Eyebrow: "Directional light · ephemeris", Tone: "amber" },
  { Id: "atmosphere", Name: "Atmosphere", Icon: "atmosphere", Eyebrow: "Rayleigh · Mie · ozone", Tone: "blue" },
  { Id: "clouds", Name: "Volumetric Clouds", Icon: "cloud", Eyebrow: "Layer · coverage · altitude", Tone: "slate" },
  { Id: "moon", Name: "Moon", Icon: "moon", Eyebrow: "Phase · position · preset", Tone: "pale" },
  { Id: "stars", Name: "Stars", Icon: "star", Eyebrow: "Field · magnitude · scintillation", Tone: "violet" },
  { Id: "flare", Name: "Lens Flare", Icon: "flare", Eyebrow: "Ghosts · halo · streaks", Tone: "amber" },
  { Id: "post", Name: "Exposure", Icon: "exposure", Eyebrow: "EV · tone curve · lens effects", Tone: "grey" },
  { Id: "camera", Name: "Camera", Icon: "camera", Eyebrow: "Optics · field of view · focus", Tone: "blue" },
  { Id: "wind", Name: "Wind", Icon: "wind", Eyebrow: "Flow · shear · Beaufort", Tone: "mint" },
  { Id: "fog", Name: "Fog", Icon: "fog", Eyebrow: "Height fog · aerial perspective", Tone: "slate" },
  { Id: "weather", Name: "Weather", Icon: "rain", Eyebrow: "Precipitation · rainbow", Tone: "blue" },
  { Id: "object", Name: "Object", Icon: "object", Eyebrow: "Transform · surface", Tone: "amber" },
  { Id: "light", Name: "Light", Icon: "light", Eyebrow: "Area emitter · photometry", Tone: "amber" },
  { Id: "group", Name: "Group", Icon: "group", Eyebrow: "Contents · visibility", Tone: "grey" },
];

// What each card's controls reach.  "Renderer" = consumed by CompileLiveGtxScene; "Record" = World Mirror record the
// editor saves and the C++ engine bridge reads, but the browser GTX compile does not.
const REACH = {
  sun: "Renderer · sun direction, irradiance, disc", atmosphere: "Renderer · sky LUT, transmittance", clouds: "Renderer · cloud march",
  moon: "Renderer · moon disc", stars: "Renderer · star field", flare: "Record · engine lens-flare pass", post: "Renderer · EV · Record · tone, lens",
  camera: "Renderer · camera ray setup", wind: "Renderer · cloud drift", fog: "Record · engine fog passes", weather: "Record · engine weather passes",
  object: "Renderer · primitive + material", light: "Renderer · area light quad", group: "Renderer · outliner visibility",
};

// ------------------------------------------------------------------------------------------------ small templates
const Section = (Title, Small = "", Tools = "") => `<div class="mi-section-title"><h3>${Esc(Title)}</h3>${Small ? `<small>${Esc(Small)}</small>` : ""}${Tools ? `<span>${Tools}</span>` : ""}</div>`;
const Fold = (Title, Small, Body, Open = false) => `<details class="mi-fold" ${Open ? "open" : ""}><summary>${Esc(Title)}<small>${Esc(Small)}</small><span class="mi-chev">${Icon("chevron", 12)}</span></summary><div class="mi-fold-body">${Body}</div></details>`;
const Chip = (Text, Tone = "") => `<span class="wi-chip ${Tone}">${Esc(Text)}</span>`;
const Readout = (Label, Value, Unit = "") => `<div class="wi-readout"><span>${Esc(Label)}</span><b>${Esc(Value)}${Unit ? `<em>${Esc(Unit)}</em>` : ""}</b></div>`;
const Swatch = (Hex, Size = 12) => `<i class="wi-swatch" style="background:${Hex};width:${Size}px;height:${Size}px"></i>`;
const Canvas = (Name, Key, Class = "") => `<span class="wi-canvas ${Class}" data-canvas="${Name}" data-ckey="${Esc(Key)}"></span>`;

let LiveFns = new Map();
function Live(Key, Fn, Class = "") {
  LiveFns.set(Key, Fn);
  return `<div class="wi-live ${Class}" data-live="${Key}">${Fn(Context())}</div>`;
}

function KnobFor(Id, Label, { Hint = "", Panel = null, Unit = null, Value = null } = {}) {
  const Row = RowOf(State.Doc, Id) || State.Doc.Rows.find((R) => R.Id === Id);
  const M = FieldMeta(Panel || Row?.Panel || Id, Label);
  if (!M) return "";
  const V = Value ?? Number(Read(State.Doc, Id, Label) ?? M.Default ?? M.Min);
  return Knob({ Bind: `${Id}|${Label}`, Label, Value: D.Clamp(V, M.Min, M.Max), Min: M.Min, Max: M.Max, Step: M.Step, Unit: Unit ?? M.Unit, Hint });
}

// Switches the compile treats as on unless explicitly false (`Rec[Label] !== false`).
const DEFAULT_ON = new Set(["Powered", "Cast shadows", "GI", "Visible", "Star field", "Twinkle", "Follow Wind", "Shadow Enabled", "Enabled"]);
export function Effective(Doc, Id, Label) {
  const V = Read(Doc, Id, Label);
  return V === undefined ? DEFAULT_ON.has(Label) : !!V;
}

function SwitchFor(Id, Label, Hint = "") {
  return SwitchRow("flip", Effective(State.Doc, Id, Label), Label, Hint, `data-target="${Esc(`${Id}|${Label}`)}"`);
}

function PickFor(Id, Label, { Lead = null } = {}) {
  const Row = RowOf(State.Doc, Id) || State.Doc.Rows.find((R) => R.Id === Id);
  const M = FieldMeta(Row?.Panel || Id, Label);
  if (!M?.Options) return "";
  const Cur = Number(Read(State.Doc, Id, Label) ?? 0);
  const Extra = `data-target="${Esc(`${Id}|${Label}`)}"`;
  if (M.Options.length <= 3) return `<div class="wi-pick"><span>${Esc(Label)}</span>${Segments("pick", M.Options.map((O, I) => [O, I]), Cur, { Label, Extra })}</div>`;
  return `<div class="wi-pick"><span>${Esc(Label)}</span>${Dropdown("pick", M.Options.map((O, I) => [O, I, Lead?.(I) || null]), Cur, { Label, Extra })}</div>`;
}

const Grid = (...Knobs) => `<div class="mi-knob-grid">${Knobs.filter(Boolean).join("")}</div>`;
const Stack = (...Parts) => `<div class="wi-stack">${Parts.filter(Boolean).join("")}</div>`;

function Axes(Bind, Label, Vec, Step = 0.01, Unit = "m") {
  return `<div class="wi-axes-row"><span>${Esc(Label)}<small>${Esc(Unit)}</small></span><div class="mi-axes">${["X", "Y", "Z"].map((A, I) => `<label><b class="axis-${A}">${A}</b><input type="number" step="${Step}" data-bind="${Esc(`${Bind}:${I}`)}" data-fid="a:${Esc(Bind)}:${I}" value="${F(Vec[I] ?? 0, 3)}" aria-label="${Esc(Label)} ${A}"></label>`).join("")}</div></div>`;
}

// ------------------------------------------------------------------------------------------------ shared context
const State = { Doc: null, Root: null, Filter: "all", Hist: History(120), Saved: true, Timer: null, Clock: null };

function Context() {
  const Doc = State.Doc, Scene = Compile(Doc);
  return { Doc, Scene, V: (Id, Label) => Read(Doc, Id, Label) };
}

let LutCache = { Key: "", Lut: null };
function SkyLut(Scene) {
  const Key = GetSkyViewCacheKey(Scene.SunDir, Scene.Atmosphere);
  if (Key !== LutCache.Key) LutCache = { Key, Lut: BuildSkyViewLut(Scene.SunDir, Scene.Atmosphere) };
  return LutCache.Lut;
}

const Deg = (Rad) => (Rad * 180) / Math.PI;
const SunElevation = (Scene) => Deg(Math.asin(D.Clamp(Scene.SunDir[2], -1, 1)));
const DiscRgb = (Scene) => (Scene.Solar?.Enabled ? Scene.Solar.Transmittance.map((T, I) => T * Scene.Solar.DiscIntensity * (Scene.Solar.Tint?.[I] ?? 1)) : [0, 0, 0]);
const SkyKey = (Scene, Extra = "") => JSON.stringify([Scene.SunDir.map((V) => +V.toFixed(4)), Scene.Atmosphere, +Scene.ExposureGain.toFixed(4), Extra]);

function SunHex(Scene) {
  return D.ChromaHex(Scene.SunIrradiance.some((V) => V > 0) ? Scene.SunIrradiance : [1, 0.9, 0.8]);
}

// ================================================================================================ cards
function SunCard(C) {
  const Rec = RecordOf(C.Doc, "sun");
  const Body = `
  <section class="wi-hero">
    ${Live("sun-chart", (X) => {
      const R = RecordOf(X.Doc, "sun"), Day = D.SunDay(R), Hrs = Number(R["Local Hours"] ?? 12);
      return G.SunChart(Day, Hrs, SunHex(X.Scene)) + G.DayStrip(Day, Hrs);
    })}
    ${Live("sun-legend", (X) => {
      const R = RecordOf(X.Doc, "sun"), Day = D.SunDay(R), Solved = D.SolveSun(R), [Phase, Col] = D.SkyPhase(Solved.Elevation);
      return `<div class="wi-legend">${Chip(D.ClockText(R["Local Hours"]), "strong")}${`<span class="wi-chip" style="--chip:${Col}">${Swatch(Col, 8)}${Esc(Phase)}</span>`}
        ${Chip(`↑ ${D.ClockText(Day.Rise)}`)}${Chip(`↓ ${D.ClockText(Day.Fall)}`)}${Chip(`${D.DurationText(Day.Daylight)} daylight`)}</div>`;
    })}
  </section>
  ${Live("sun-metrics", (X) => {
    const R = RecordOf(X.Doc, "sun"), S = D.SolveSun(R), Am = D.AirMass(S.Elevation), Irr = X.Scene.SunIrradiance, Lum = D.Luminance(Irr);
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Elevation", Value: F(S.Elevation, 1), Unit: "°", Caption: S.Elevation > 0 ? `air mass ${Number.isFinite(Am) ? F(Am, 2) : "∞"}` : "below horizon", Meter: { Kind: "band", Lo: 0.5, Hi: 1, At: (S.Elevation + 90) / 180, Tone: S.Elevation > 0 ? "ok" : "warn" }, Hot: S.Elevation > 0 })}
      ${StatTile({ Label: "Azimuth", Value: F(S.Azimuth, 0), Unit: "°", Caption: `${D.CompassName(S.Azimuth)} · from north`, Meter: { Kind: "fill", At: S.Azimuth / 360, Colour: "#ffb238" } })}
      ${StatTile({ Label: "Irradiance", Value: F(Lum, 2), Unit: "rel", Caption: `CCT ${F(D.CctFromLinear(Irr), 0)} K`, Meter: { Kind: "swatches", Colours: [SunHex(X.Scene), D.ChromaHex(X.Scene.SkyRadiance)] } })}
    </section>`;
  })}
  <section class="wi-duo">
    ${Live("sun-compass", (X) => { const S = D.SolveSun(RecordOf(X.Doc, "sun")); return G.Compass(S.Azimuth, S.Elevation, { Colour: SunHex(X.Scene) }); }, "wi-centre")}
    ${Live("sun-solved", (X) => {
      const S = D.SolveSun(RecordOf(X.Doc, "sun"));
      return `<div class="wi-readouts">${Readout("Declination", F(S.Declination, 2), "°")}${Readout("Equation of time", F(S.EquationOfTime, 1), "min")}${Readout("Transmittance", F(X.Scene.Solar.Transmittance[1] * 100, 0), "%")}${Readout("Disc radius", F(Deg(X.Scene.SunAngularRadiusRad), 2), "°")}</div>`;
    })}
  </section>
  ${Section("Day cycle", "CLOCK · ANIMATION", `<button type="button" class="mi-text-btn" data-act="now">Now</button>`)}
  ${Stack(KnobFor("sun", "Local Hours"), SwitchFor("sun", "Animate", "advance the clock"), Grid(PickFor("sun", "Speed"), KnobFor("sun", "Day duration")))}
  ${Section("Observer", "LATITUDE · DATE")}
  ${Grid(KnobFor("sun", "Latitude"), KnobFor("sun", "Longitude"), KnobFor("sun", "Day of Month"), KnobFor("sun", "Month"))}
  ${Section("Disc", "SIZE · COLOUR")}
  ${Live("sun-disc", (X) => G.DiscCompare(Number(X.V("sun", "Angular Diameter")), 0.533, { Colour: SunHex(X.Scene) }), "wi-centre")}
  ${Stack(KnobFor("sun", "Angular Diameter", { Hint: "renderer clamps to 28.6°" }), PickFor("sun", "Colour source"))}
  ${Number(Rec["Colour source"]) === 1
    ? Stack(Live("sun-kelvin", (X) => G.KelvinBar(Number(X.V("sun", "Temperature")))), KnobFor("sun", "Temperature", { Hint: "renderer clamps 1800–12000 K" }))
    : ColourField("sun|Sun Tint", "Sun Tint", Read(C.Doc, "sun", "Sun Tint") || "#ffffff", "linear tint")}
  ${Section("Gain", "SUNLIGHT", `<span class="wi-inline">${SwitchFor("sun", "Powered")}</span>`)}
  ${Grid(KnobFor("sun", "Intensity"), KnobFor("sun", "Direct"))}`;
  return Body;
}

function AtmosphereCard(C) {
  const Atm = (X) => {
    const A = X.Scene.Atmosphere;
    return { Rayleigh: A.rayleigh, Mie: A.mie, Ozone: A.ozone, RayleighH: A.rayleighH, MieH: A.mieH, Top: A.atmoTop };
  };
  return `
  <section class="wi-hero wi-duo">
    ${Live("atm-dome", (X) => `<figure class="wi-dome">${Canvas("dome-sky", SkyKey(X.Scene))}<figcaption>Sky-View LUT · fisheye · N up</figcaption></figure>`, "wi-centre")}
    ${Live("atm-profile", (X) => G.DensityProfile(Atm(X)))}
  </section>
  ${Live("atm-metrics", (X) => {
    const Zen = X.Scene.SkyRadiance, Tr = X.Scene.Solar.Transmittance, El = SunElevation(X.Scene), Am = D.AirMass(El);
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Zenith", Value: F(D.CctFromLinear(Zen) / 1000, 1), Unit: "kK", Caption: "sky colour temperature", Meter: { Kind: "swatches", Colours: [D.ChromaHex(Zen), D.RgbToHex(Zen.map((V) => D.Display(V, X.Scene.ExposureGain)))] } })}
      ${StatTile({ Label: "Sun transmit", Value: F(Tr[1] * 100, 0), Unit: "%", Caption: `R ${F(Tr[0] * 100, 0)} · B ${F(Tr[2] * 100, 0)}`, Meter: { Kind: "stack", Parts: [{ Share: Tr[0], Colour: "#ff7b6b" }, { Share: Tr[1], Colour: "#7be08f" }, { Share: Tr[2], Colour: "#6fa8ff" }] } })}
      ${StatTile({ Label: "Air mass", Value: Number.isFinite(Am) ? F(Am, 2) : "∞", Caption: `sun at ${F(El, 1)}°`, Meter: { Kind: "fill", At: Number.isFinite(Am) ? Math.min(1, Am / 38) : 1, Colour: "#f29a52" } })}
    </section>`;
  })}
  ${Section("Scattering", "RAYLEIGH · MIE · OZONE")}
  <section class="wi-duo">${Live("atm-spectrum", (X) => G.ScatterSpectrum(Atm(X)))}${Live("atm-phase", (X) => G.PhasePolar(X.Scene.Atmosphere.mieG), "wi-centre")}</section>
  ${Grid(KnobFor("atmosphere", "Rayleigh"), KnobFor("atmosphere", "Mie"), KnobFor("atmosphere", "Mie Anisotropy"), KnobFor("atmosphere", "Ozone"))}
  ${Section("Planet", "SCALE HEIGHTS · TOP")}
  ${Grid(KnobFor("atmosphere", "Rayleigh Scale H"), KnobFor("atmosphere", "Mie Scale H"))}
  ${KnobFor("atmosphere", "Atmosphere", { Hint: "top of atmosphere" })}
  ${Section("Appearance", "TINT · GROUND")}
  ${Stack(KnobFor("atmosphere", "Sky Brightness"), ColourField("atmosphere|Sky Tint", "Sky Tint", Read(C.Doc, "atmosphere", "Sky Tint") || "#ffffff", "sky tint"), ColourField("atmosphere|Ground Albedo", "Ground Albedo", Read(C.Doc, "atmosphere", "Ground Albedo") || "#796e60", "ground albedo"))}
  ${Fold("Twilight", "horizon glow · white line", Stack(KnobFor("atmosphere", "Horizon Glow"), KnobFor("atmosphere", "White Line"), SwitchFor("atmosphere", "Line at civil only")))}`;
}

function CloudsCard(C) {
  const Shape = (X) => {
    const R = (L) => Number(X.V("clouds", L));
    return { Enabled: !!X.Scene.Clouds.enabled, Coverage: R("Coverage"), Density: R("Density"), Bottom: R("Base"), Thickness: R("Thickness"), Ceiling: R("Ceiling"), Anvil: R("Anvil") };
  };
  const Types = ["Stratus", "Stratocumulus", "Cumulus", "Cumulonimbus", "Altostratus", "Cirrus"];
  return `
  <section class="wi-hero wi-duo">
    ${Live("cld-dome", (X) => `<figure class="wi-dome">${Canvas("dome-clouds", SkyKey(X.Scene, [X.Scene.Clouds, X.Scene.SunIrradiance]))}<figcaption>Cloud march · CPU parity</figcaption></figure>`, "wi-centre")}
    ${Live("cld-section", (X) => G.CloudSection(Shape(X)))}
  </section>
  ${Live("cld-metrics", (X) => {
    const S = Shape(X), Ok = D.Oktas(S.Coverage), [Code, Name] = D.MetarCover(Ok), Cl = X.Scene.Clouds, Drift = Math.hypot(Cl.windX || 0, Cl.windY || 0);
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Cover", Value: `${Ok}`, Unit: "/8 okta", Caption: `${Code} · ${Name}`, Meter: { Kind: "steps", Count: 8, Done: Ok }, Hot: S.Enabled })}
      ${StatTile({ Label: "Layer", Value: F(S.Bottom / 1000, 1), Unit: `–${F((S.Bottom + S.Thickness) / 1000, 1)} km`, Caption: Types[Cl.type] || "Custom", Meter: { Kind: "band", Lo: S.Bottom / S.Ceiling, Hi: Math.min(1, (S.Bottom + S.Thickness) / S.Ceiling), At: (S.Bottom + S.Thickness / 2) / S.Ceiling } })}
      ${StatTile({ Label: "Drift", Value: F(Drift, 1), Unit: "m/s", Caption: Read(X.Doc, "clouds", "Follow Wind") === false ? "wind off" : `from wind card`, Meter: { Kind: "fill", At: Drift / 40, Colour: "#89e0c4" } })}
    </section>`;
  })}
  ${Section("Shape", "TYPE · COVERAGE · DENSITY", `<span class="wi-inline">${SwitchFor("clouds", "Enabled")}</span>`)}
  ${Stack(PickFor("clouds", "Type"), KnobFor("clouds", "Coverage"))}
  ${Number(Read(C.Doc, "clouds", "Type")) > 3 ? `<p class="wi-note">${Icon("info", 12)} The browser cloud march has 4 type profiles; this type renders with the Cumulonimbus profile.</p>` : ""}
  ${Grid(KnobFor("clouds", "Density"), KnobFor("clouds", "Feature Scale"), KnobFor("clouds", "Anvil"), KnobFor("clouds", "Anisotropy"))}
  <section class="wi-duo">${Live("cld-phase", (X) => G.PhasePolar(Number(X.V("clouds", "Anisotropy")), { Label: "cloud phase", Colour: "#cfd8e6" }), "wi-centre")}
    ${Live("cld-note", (X) => `<div class="wi-readouts">${Readout("Forward scatter", F(D.ForwardShare(Number(X.V("clouds", "Anisotropy"))) * 100, 0), "%")}${Readout("Optical depth", F(Number(X.V("clouds", "Density")) * Number(X.V("clouds", "Thickness")) / 1000, 2), "τ/km")}${Readout("Feature scale", F(Number(X.V("clouds", "Feature Scale")), 2), "×")}</div>`)}</section>
  ${Section("Altitude", "BASE · THICKNESS · CEILING")}
  ${Stack(KnobFor("clouds", "Base"), KnobFor("clouds", "Thickness"), KnobFor("clouds", "Ceiling"), SwitchFor("clouds", "Follow Wind", "drift with the wind card"))}
  ${Fold("Cloud shadows", "ground shadow layer", Stack(SwitchFor("clouds", "Shadow Enabled"), Grid(KnobFor("clouds", "Shadow Coverage"), KnobFor("clouds", "Shadow Density"), KnobFor("clouds", "Shadow Base"), KnobFor("clouds", "Shadow Thick"))))}`;
}

function MoonCard(C) {
  const Preset = ["Luna", "Ember", "Glacier", "Sulfur", "Shroud", "Shard"];
  const Lead = (I) => `<i class="wi-swatch" style="background:${D.ChromaHex(MOON_PRESET_TINTS[I] || MOON_PRESET_TINTS[0])}"></i>`;
  return `
  <section class="wi-hero wi-duo">
    ${Live("moon-disc", (X) => {
      const M = X.Scene.Moon;
      return `<figure class="wi-dome">${Canvas("moon", JSON.stringify([M.preset, M.phase, M.bright, M.glow, X.V("moon", "Roll")]))}<figcaption>${Esc(Preset[M.preset] || "Luna")} texture · renderer phase vector</figcaption></figure>`;
    }, "wi-centre")}
    ${Live("moon-compass", (X) => G.Compass(Number(X.V("moon", "Azimuth")), Number(X.V("moon", "Elevation")), { Colour: "#e8e3d6", Label: "Moon", Size: 150 }), "wi-centre")}
  </section>
  ${Live("moon-strip", (X) => G.PhaseStrip(Number(X.V("moon", "Phase"))))}
  ${Live("moon-metrics", (X) => {
    const P = Number(X.V("moon", "Phase")), Il = D.MoonIllumination(P), Size = Number(X.V("moon", "Size"));
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Phase", Value: D.MoonPhaseName(P).split(" ")[0], Caption: D.MoonPhaseName(P).toLowerCase(), Meter: { Kind: "fill", At: P, Colour: "#e8e3d6" }, Hot: Il > 0.5 })}
      ${StatTile({ Label: "Illuminated", Value: F(Il * 100, 0), Unit: "%", Caption: `age ${F(P * D.SYNODIC_DAYS, 1)} d of ${F(D.SYNODIC_DAYS, 1)}`, Meter: { Kind: "fill", At: Il, Colour: "#cfcfcf" } })}
      ${StatTile({ Label: "Apparent size", Value: F(Size, 2), Unit: "°", Caption: `×${F(Size / 0.52, 1)} the real moon`, Meter: { Kind: "fill", At: Math.min(1, Size / 6), Colour: "#9ec3ff" } })}
    </section>`;
  })}
  ${Section("Appearance", "PRESET · BRIGHTNESS", `<span class="wi-inline">${SwitchFor("moon", "Visible")}</span>`)}
  ${Stack(PickFor("moon", "Preset", { Lead }), KnobFor("moon", "Phase"))}
  ${Grid(KnobFor("moon", "Bright"), KnobFor("moon", "Glow"))}
  ${Live("moon-size", (X) => G.DiscCompare(Number(X.V("moon", "Size")), 0.52, { Colour: "#e8e3d6", RealLabel: "real moon" }), "wi-centre")}
  ${KnobFor("moon", "Size")}
  ${Section("Position", "AZIMUTH · ELEVATION")}
  ${Grid(KnobFor("moon", "Azimuth"), KnobFor("moon", "Elevation"), KnobFor("moon", "Roll"), KnobFor("moon", "Pitch"))}
  ${SwitchFor("moon", "Follow Sky", "track the ephemeris")}`;
}

function StarsCard(C) {
  return `
  <section class="wi-hero wi-duo">
    ${Live("star-dome", (X) => `<figure class="wi-dome">${Canvas("stars-window", SkyKey(X.Scene, [X.Scene.Stars, X.Scene.Moon]), "square")}<figcaption>30° zenith window · star evaluator</figcaption></figure>`, "wi-centre")}
    ${Live("star-fade", (X) => {
      const Z = X.Scene.SunDir[2], Fade = D.StarDayFade(Z);
      return `<div class="wi-readouts">${Readout("Daylight fade", F(Fade * 100, 0), "%")}${Readout("Sun elevation", F(SunElevation(X.Scene), 1), "°")}${Readout("Visible from", "< 6.9", "° sun")}${Readout("Full field", "< −4.6", "° sun")}
        ${Fade < 0.05 ? `<button type="button" class="mi-text-btn wi-wide" data-act="night">Preview at 22:00</button>` : ""}</div>`;
    })}
  </section>
  ${Live("star-mag", (X) => G.MagnitudeScale(Number(X.V("stars", "Limiting magnitude"))))}
  ${Live("star-metrics", (X) => {
    const M = Number(X.V("stars", "Limiting magnitude")), Thr = D.Clamp(M / 8.5, 0.05, 0.98), Density = 0.18 * Thr;
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Sky class", Value: F(M, 1), Unit: "mag", Caption: D.SkyClass(M), Meter: { Kind: "band", Lo: 0.56, Hi: 0.81, At: M / 8 } })}
      ${StatTile({ Label: "Cell fill", Value: F(Density * 100, 1), Unit: "%", Caption: "of hash cells hold a star", Meter: { Kind: "fill", At: Density / 0.18, Colour: "#b48cff" } })}
      ${StatTile({ Label: "Rotation", Value: F(Number(X.V("stars", "Celestial rotation")), 0), Unit: "°", Caption: "celestial pole spin", Meter: { Kind: "fill", At: Number(X.V("stars", "Celestial rotation")) / 360, Colour: "#9ec3ff" } })}
    </section>`;
  })}
  ${Section("Field", "BRIGHTNESS · SIZE", `<span class="wi-inline">${SwitchFor("stars", "Star field")}</span>`)}
  ${Grid(KnobFor("stars", "Brightness"), KnobFor("stars", "Point Size"))}
  ${Stack(KnobFor("stars", "Limiting magnitude"), KnobFor("stars", "Celestial rotation"))}
  ${Section("Scintillation", "TWINKLE", `<span class="wi-inline">${SwitchFor("stars", "Twinkle")}</span>`)}
  ${Live("star-wave", (X) => G.TwinkleWave(Number(X.V("stars", "Twinkle depth")), Number(X.V("stars", "Twinkle rate")), !!X.V("stars", "Twinkle")))}
  ${Grid(KnobFor("stars", "Twinkle depth"), KnobFor("stars", "Twinkle rate"))}`;
}

function FlareState(X) {
  const R = (L) => X.V("flare", L);
  return {
    Enabled: !!R("Enabled"), Intensity: +R("Intensity"), Ghosts: Math.round(+R("Ghosts")), HaloRadius: +R("Halo Radius"), Chromatic: +R("Chromatic"), Blades: +R("Aperture Blades"),
    StreakGain: +R("Streak gain"), Anamorphic: !!R("Anamorphic"), Streaks: !!R("Streaks"), Starburst: !!R("Starburst"), Spread: +R("Spread"), Rotation: +R("Rotation"), RayPairs: Math.round(+R("Ray pairs")),
    GhostGain: +R("Ghost brightness"), Spacing: +R("Ghost spacing"), HaloGain: +R("Halo brightness"), HaloWidth: +R("Halo width"), Shape: +R("Ghost shape"), X: +R("Preview X"), Y: +R("Preview Y"),
  };
}

function FlareCard() {
  return `
  <section class="wi-hero">${Live("flare-frame", (X) => G.FlareFrame(FlareState(X)))}</section>
  ${Live("flare-metrics", (X) => {
    const Fl = FlareState(X), Layers = [Fl.Ghosts > 0, Fl.HaloGain > 0, Fl.Starburst, Fl.Anamorphic && Fl.Streaks].filter(Boolean).length;
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Elements", Value: `${Fl.Ghosts}`, Unit: "ghosts", Caption: `${Layers} of 4 layers on`, Meter: { Kind: "steps", Count: 4, Done: Layers }, Hot: Fl.Enabled })}
      ${StatTile({ Label: "Aperture", Value: `${Math.round(Fl.Blades)}`, Unit: "blades", Caption: Math.round(Fl.Blades) % 2 ? `${Math.round(Fl.Blades) * 2}-point star` : `${Math.round(Fl.Blades)}-point star`, Meter: { Kind: "fill", At: (Fl.Blades - 3) / 9, Colour: "#ffb238" } })}
      ${StatTile({ Label: "Dispersion", Value: F(Fl.Chromatic, 2), Caption: "chromatic split", Meter: { Kind: "stack", Parts: [{ Share: 1, Colour: "#ff5a4a" }, { Share: 1 + Fl.Chromatic, Colour: "#5aff8a" }, { Share: 1, Colour: "#5a8aff" }] } })}
    </section>`;
  })}
  ${Section("Lens", "TYPE · GAIN", `<span class="wi-inline">${SwitchFor("flare", "Enabled")}</span>`)}
  ${Stack(PickFor("flare", "Type"), KnobFor("flare", "Intensity"))}
  ${Grid(KnobFor("flare", "Ghosts"), KnobFor("flare", "Aperture Blades"), KnobFor("flare", "Halo Radius"), KnobFor("flare", "Chromatic"))}
  ${Section("Layers", "STARBURST · STREAKS")}
  <div class="wi-switch-grid">${SwitchFor("flare", "Starburst")}${SwitchFor("flare", "Anamorphic")}${SwitchFor("flare", "Streaks")}</div>
  ${Grid(KnobFor("flare", "Ray pairs"), KnobFor("flare", "Spread"), KnobFor("flare", "Rotation"), KnobFor("flare", "Streak gain"))}
  ${Fold("Ghosts + halo", "brightness · spacing · shape", Stack(PickFor("flare", "Ghost shape"), Grid(KnobFor("flare", "Ghost brightness"), KnobFor("flare", "Ghost spacing"), KnobFor("flare", "Halo brightness"), KnobFor("flare", "Halo width"))))}
  ${Fold("Preview pose", "light position in frame", Grid(KnobFor("flare", "Preview X"), KnobFor("flare", "Preview Y")))}`;
}

function PostCard() {
  const Gain = (X) => X.Scene.ExposureGain;
  return `
  <section class="wi-hero wi-duo wi-duo-wide">
    ${Live("post-curve", (X) => G.ToneChart(Gain(X), Number(X.V("post", "Contrast")), Number(X.V("post", "EV Compensation"))))}
    ${Live("post-ladder", (X) => G.EvLadder(Number(X.V("post", "EV Compensation"))), "wi-centre")}
  </section>
  ${Live("post-metrics", (X) => {
    const Ev = Number(X.V("post", "EV Compensation")), Mid = D.ToneCurve(0, Gain(X), Number(X.V("post", "Contrast"))), Dr = D.DynamicRange(Gain(X), Number(X.V("post", "Contrast")));
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Exposure gain", Value: `×${F(Gain(X), 2)}`, Caption: `${F(X.Scene.RenderSettings.ExposureGain, 2)} · 2^${Signed(Ev, 2)}`, Meter: { Kind: "band", Lo: 0.375, Hi: 0.625, At: (Ev + 4) / 8, Tone: Math.abs(Ev) > 2 ? "warn" : "ok" }, Hot: true })}
      ${StatTile({ Label: "Mid grey out", Value: F(Mid * 100, 0), Unit: "%", Caption: "18 % scene grey on screen", Meter: { Kind: "fill", At: Mid, Colour: "#d6d6d6" } })}
      ${StatTile({ Label: "Latitude", Value: Number.isFinite(Dr) ? F(Dr, 1) : "∞", Unit: "stops", Caption: "2 %–98 % display range", Meter: { Kind: "fill", At: Number.isFinite(Dr) ? Dr / 16 : 1, Colour: "#4d9bff" } })}
    </section>`;
  })}
  ${Section("Exposure", "EV · CALIBRATION")}
  ${Stack(KnobFor("post", "EV Compensation"), Knob({ Bind: "render-settings|ExposureGain", Label: "Exposure gain", Value: Number(RecordOf(State.Doc, "render-settings").ExposureGain ?? 1.35), Min: 0.1, Max: 8, Step: 0.01, Unit: "×", Hint: "render settings" }))}
  ${Section("Tone + lens", "SATURATION · BLOOM · VIGNETTE")}
  ${Live("post-fx", (X) => G.LensFx(Number(X.V("post", "Bloom Intensity")), Number(X.V("post", "Vignette")), Number(X.V("post", "Saturation"))))}
  ${Grid(KnobFor("post", "Contrast"), KnobFor("post", "Saturation"), KnobFor("post", "Bloom Intensity"), KnobFor("post", "Vignette"))}`;
}

function Optics(X) {
  const R = (L) => Number(X.V("camera", L));
  return { Focal: R("Focal Length"), Sensor: R("Sensor Width"), FStop: R("Aperture"), Subject: R("Subject Distance") };
}

function CameraCard(C) {
  const Rec = RecordOf(C.Doc, "camera");
  return `
  <section class="wi-hero">${Live("cam-fov", (X) => { const O = Optics(X); return G.FovDiagram(D.CameraOptics(O.Focal, O.Sensor, O.FStop, O.Subject), O.Subject, O.Focal); })}</section>
  ${Live("cam-metrics", (X) => {
    const O = Optics(X), P = D.CameraOptics(O.Focal, O.Sensor, O.FStop, O.Subject), Rend = Deg(X.Scene.VerticalFovRad);
    const Lens = O.Focal < 24 ? "Wide angle" : O.Focal < 70 ? "Normal" : O.Focal < 200 ? "Telephoto" : "Super telephoto";
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Field of view", Value: F(P.Hfov, 1), Unit: "°", Caption: `${Lens} · V ${F(Rend, 1)}°`, Meter: { Kind: "fill", At: P.Hfov / 180, Colour: "#4d9bff" }, Hot: true })}
      ${StatTile({ Label: "In focus", Value: Number.isFinite(P.Depth) ? F(P.Depth, 2) : "∞", Unit: "m", Caption: `${F(P.Near, 2)} → ${Number.isFinite(P.Far) ? F(P.Far, 1) : "∞"} m`, Meter: { Kind: "band", Lo: Math.min(1, P.Near / 100), Hi: Number.isFinite(P.Far) ? Math.min(1, P.Far / 100) : 1, At: O.Subject / 100 } })}
      ${StatTile({ Label: "Hyperfocal", Value: F(P.Hyperfocal, 1), Unit: "m", Caption: `CoC ${F(P.Coc * 1000, 0)} µm`, Meter: { Kind: "fill", At: Math.min(1, P.Hyperfocal / 100), Colour: "#46d267" } })}
    </section>`;
  })}
  ${Section("Lens", "FOCAL · SENSOR")}
  ${Live("cam-sensor", (X) => {
    const O = Optics(X), W = 400, H = 44, S = 180 / 70;
    return G.Svg(W, H, `${[[36, "FF"], [23.6, "APS-C"], [17.3, "MFT"]].map(([Sw, N]) => `<rect x="${(W - Sw * S) / 2}" y="${22 - (Sw / (16 / 9)) * S / 2.2}" width="${Sw * S}" height="${(Sw / (16 / 9)) * S / 1.1}" rx="2" fill="none" stroke="#ffffff22"/><text x="${(W + Sw * S) / 2 + 3}" y="${22 - (Sw / (16 / 9)) * S / 2.2 + 8}" fill="#666" font-size="7">${N}</text>`).join("")}
      <rect x="${(W - O.Sensor * S) / 2}" y="${22 - (O.Sensor / (16 / 9)) * S / 2.2}" width="${O.Sensor * S}" height="${(O.Sensor / (16 / 9)) * S / 1.1}" rx="2" fill="#4d9bff18" stroke="#4d9bff"/>
      <text x="8" y="12" fill="#7d7d7d" font-size="8">sensor ${F(O.Sensor, 1)} × ${F(O.Sensor / (16 / 9), 1)} mm · crop ×${F(36 / O.Sensor, 2)}</text>`, { Label: "Sensor size", Class: "wi-strip" });
  })}
  ${Stack(KnobFor("camera", "Focal Length"), KnobFor("camera", "Sensor Width"))}
  ${Section("Focus", "APERTURE · DISTANCE")}
  ${Live("cam-fstops", (X) => {
    const Stops = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22], Cur = Optics(X).FStop;
    return `<div class="wi-fstops">${Stops.map((S) => `<button type="button" class="${Math.abs(S - Cur) < 0.05 ? "active" : ""}" data-act="fstop" data-value="${S}" aria-label="f/${S}"><i style="--open:${F((1.4 / S) * 100, 0)}%"></i>${S}</button>`).join("")}</div>`;
  })}
  ${Grid(KnobFor("camera", "Aperture"), KnobFor("camera", "Subject Distance"))}
  ${Fold("Placement", "origin · target", Stack(Axes("obj:camera|Position", "Origin", Rec.Position || [0, 0, 0]), Axes("obj:camera|Target", "Target", Rec.Target || [0, 0, 0])))}`;
}

function WindCard() {
  const W = (X) => { const R = (L) => Number(X.V("wind", L)); return { Speed: R("Speed"), Bearing: R("Bearing"), Shear: R("Shear"), Veer: R("Veer"), Gust: R("Gust"), Turb: R("Turbulence"), Steady: R("Steadiness") }; };
  return `
  <section class="wi-hero wi-duo">
    ${Live("wind-rose", (X) => { const S = W(X); return G.WindRose(S.Bearing, S.Speed, S.Turb, S.Gust); }, "wi-centre")}
    ${Live("wind-profile", (X) => { const S = W(X); return G.WindProfile(S.Speed, X.V("wind", "Air shear") ? S.Shear : 0, X.V("wind", "Air shear") ? S.Veer : 0, S.Bearing); })}
  </section>
  ${Live("wind-beaufort", (X) => G.BeaufortStrip(W(X).Speed))}
  ${Live("wind-metrics", (X) => {
    const S = W(X), B = D.Beaufort(S.Speed), Cl = X.Scene.Clouds;
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Force", Value: `${B.Force}`, Unit: "Bft", Caption: B.Name.toLowerCase(), Meter: { Kind: "steps", Count: 12, Done: B.Force }, Hot: B.Force >= 6 })}
      ${StatTile({ Label: "From", Value: F(S.Bearing, 0), Unit: "°", Caption: `${D.CompassName(S.Bearing)} · blows to ${D.CompassName(S.Bearing + 180)}`, Meter: { Kind: "fill", At: S.Bearing / 360, Colour: "#89e0c4" } })}
      ${StatTile({ Label: "Gusts to", Value: F(S.Speed * (1 + S.Gust), 1), Unit: "m/s", Caption: `cloud drift ${F(Math.hypot(Cl.windX || 0, Cl.windY || 0), 1)} m/s`, Meter: { Kind: "band", Lo: S.Speed / 40, Hi: Math.min(1, (S.Speed * (1 + S.Gust)) / 40), At: S.Speed / 40 } })}
    </section>`;
  })}
  ${Section("Flow", "SPEED · BEARING")}
  ${Stack(KnobFor("wind", "Speed"), KnobFor("wind", "Bearing", { Hint: "drag the rose" }))}
  ${Section("Shear", "CHANGE WITH HEIGHT", `<span class="wi-inline">${SwitchFor("wind", "Air shear")}</span>`)}
  ${Grid(KnobFor("wind", "Shear"), KnobFor("wind", "Veer"))}
  ${Section("Gust", "TURBULENCE · STEADINESS")}
  ${Grid(KnobFor("wind", "Gust"), KnobFor("wind", "Turbulence"))}
  ${KnobFor("wind", "Steadiness")}`;
}

function FogCard(C) {
  const Hf = (X) => ({ On: !!X.V("height-fog", "Enabled"), Density: Number(X.V("height-fog", "Density")), Falloff: Number(X.V("height-fog", "Falloff Height")) });
  return `
  <section class="wi-hero wi-duo">
    ${Live("fog-chart", (X) => { const H = Hf(X); return G.FogChart(H.Density, H.Falloff, H.On); })}
    ${Live("fog-read", (X) => {
      const H = Hf(X), Vis = D.Visibility(H.On ? H.Density : 0);
      return `<div class="wi-readouts">${Readout("Ground visibility", Number.isFinite(Vis) ? (Vis >= 1000 ? F(Vis / 1000, 1) : F(Vis, 0)) : "∞", Number.isFinite(Vis) ? (Vis >= 1000 ? "km" : "m") : "")}${Readout("Class", D.VisibilityClass(Vis))}${Readout("Half density at", F(H.Falloff * Math.LN2, 0), "m")}${Readout("Column depth", F(H.Density * H.Falloff, 2), "τ")}</div>`;
    })}
  </section>
  ${Live("fog-vis", (X) => { const H = Hf(X); return G.VisibilityStrip(H.On ? H.Density : 0, Number(X.V("aerial-fog", "Start")), H.On); })}
  ${Section("Height fog", "MEDIUM", `<span class="wi-inline">${SwitchFor("height-fog", "Enabled")}</span>`)}
  ${Stack(KnobFor("height-fog", "Density"), KnobFor("height-fog", "Falloff Height"), KnobFor("height-fog", "Sun Scatter"), ColourField("height-fog|Colour", "Fog colour", Read(C.Doc, "height-fog", "Colour") || "#c8d2dc", "fog colour"))}
  ${Section("Aerial perspective", "DISTANCE HAZE", `<span class="wi-inline">${SwitchFor("aerial-fog", "Enabled")}</span>`)}
  ${Grid(KnobFor("aerial-fog", "Density"), KnobFor("aerial-fog", "Mie Blend"))}
  ${KnobFor("aerial-fog", "Start", { Hint: "amber tick on the strip" })}`;
}

function WeatherCard() {
  const Kinds = ["Rain", "Snow", "Sleet", "Hail", "Drizzle"];
  return `
  <section class="wi-hero">${Live("rainbow", (X) => G.RainbowDiagram(SunElevation(X.Scene), {
    Enabled: !!X.V("rainbow", "Enabled"), Intensity: Number(X.V("rainbow", "Intensity")), Width: Number(X.V("rainbow", "Width")), Secondary: Number(X.V("rainbow", "Secondary")), Alexander: !!X.V("rainbow", "Alexander's Band"),
  }))}</section>
  ${Live("wx-metrics", (X) => {
    const Mm = Number(X.V("precipitation", "Intensity")), On = !!X.V("precipitation", "Enabled"), El = SunElevation(X.Scene), Bow = 42 - El;
    const Opts = FieldMeta("precipitation", "Precipitation")?.Options || Kinds;
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Rate", Value: F(Mm, 1), Unit: "mm/h", Caption: On ? D.RainClass(Mm).toLowerCase() : "off", Meter: { Kind: "fill", At: Math.log10(Math.max(0.1, Mm) * 10) / 3, Colour: "#4d9bff" }, Hot: On })}
      ${StatTile({ Label: "Type", Value: Opts[Number(X.V("precipitation", "Precipitation"))] || "Rain", Caption: `${F(Number(X.V("precipitation", "Accumulation")) * 100, 0)} % accumulation`, Meter: { Kind: "fill", At: Number(X.V("precipitation", "Accumulation")), Colour: "#cfd8e6" } })}
      ${StatTile({ Label: "Bow height", Value: Bow > 0 ? F(Bow, 0) : "—", Unit: Bow > 0 ? "°" : "", Caption: Bow > 0 ? "primary arc top" : "sun too high (> 42°)", Meter: { Kind: "band", Lo: 0, Hi: 42 / 90, At: Math.max(0, Bow) / 90, Tone: Bow > 0 ? "ok" : "warn" } })}
    </section>`;
  })}
  ${Section("Precipitation", "TYPE · RATE", `<span class="wi-inline">${SwitchFor("precipitation", "Enabled")}</span>`)}
  ${Live("wx-rain", (X) => G.RainScale(Number(X.V("precipitation", "Intensity")), !!X.V("precipitation", "Enabled"), (FieldMeta("precipitation", "Precipitation")?.Options || Kinds)[Number(X.V("precipitation", "Precipitation"))] || ""))}
  ${Stack(PickFor("precipitation", "Precipitation"), KnobFor("precipitation", "Intensity"))}
  ${Grid(KnobFor("precipitation", "Density"), KnobFor("precipitation", "Particle Size"), KnobFor("precipitation", "Wind Drift"), KnobFor("precipitation", "Accumulation"))}
  <div class="wi-switch-grid">${SwitchFor("precipitation", "Follow Wind")}${SwitchFor("precipitation", "Spawn from Clouds")}${SwitchFor("precipitation", "Ground Collision")}</div>
  ${Section("Rainbow", "42° · 51° BOWS", `<span class="wi-inline">${SwitchFor("rainbow", "Enabled")}</span>`)}
  ${Grid(KnobFor("rainbow", "Intensity"), KnobFor("rainbow", "Width"), KnobFor("rainbow", "Secondary"), KnobFor("rainbow", "Minimum Path"))}
  ${SwitchFor("rainbow", "Alexander's Band", "dark band between the bows")}`;
}

// ------------------------------------------------------------------------------------------------ objects
const ChannelMeta = Object.fromEntries(MaterialChannels.map((Ch) => [Ch.Id, Ch]));
function MaterialOf(Rec) {
  return Rec?.Material ? ResolveMaterial(Rec.Material) : null;
}
function Fill(Mat, Id) {
  const Ch = Mat?.Channels?.[Id];
  return Ch?.Source === "Fill" || Ch?.Source === undefined ? Ch?.Fill ?? ChannelMeta[Id]?.Default : ChannelMeta[Id]?.Default;
}
function ChannelKnob(Id, Mat, ChId, Hint = "") {
  const M = ChannelMeta[ChId], Src = Mat.Channels[ChId]?.Source || "Fill";
  if (Src !== "Fill") return `<div class="mi-knob"><span class="mi-knob-label"><span>${Esc(M.Label)}</span><small>${Esc(Src)} source</small></span><div class="wi-locked">${Icon("lock", 12)} Authored as ${Esc(Src)} in World Mirror</div></div>`;
  const Range = M.Maximum - M.Minimum;
  return Knob({ Bind: `mat:${Id}|${ChId}`, Label: M.Label, Value: Number(Fill(Mat, ChId)), Min: M.Minimum, Max: M.Maximum, Step: Range > 4 ? 0.1 : 0.01, Unit: M.Unit || "", Hint });
}

function ObjectCard(C) {
  const Rows = ObjectRows(C.Doc, "geometry"), Id = C.Doc.Selected.geometry, Row = Rows.find((R) => R.Id === Id) || Rows[0];
  if (!Row) return `<p class="mi-empty">No geometry in the scene.</p>`;
  const Rec = RecordOf(C.Doc, Row.Id), Mat = MaterialOf(Rec);
  const Options = Rows.map((R) => { const M = MaterialOf(RecordOf(C.Doc, R.Id)); return [R.Name, R.Id, `<i class="wi-swatch" style="background:${M ? Fill(M, "colour") : "#555"}"></i>`, R.PrimitiveShape || ""]; });
  const Picker = `<div class="wi-picker">${Dropdown("select", Options, Row.Id, { Label: "Object", Extra: 'data-target="geometry"' })}</div>`;
  const Hidden = !!C.Doc.Hidden[Row.Id];
  return `
  ${Picker}
  <section class="wi-hero wi-duo">
    ${Live("obj-ball", (X) => {
      const R = RecordOf(X.Doc, Row.Id), M = MaterialOf(R);
      if (!M) return `<div class="wi-vehicle">${Icon("object", 40)}<small>Vehicle BVH asset · materials come from the mesh</small></div>`;
      return `<figure class="wi-dome">${Canvas("ball", JSON.stringify([Row.Id, M.Type, ...["colour", "metallic", "roughness", "reflectance", "coat", "transmission", "emission"].map((K) => Fill(M, K)), X.Scene.SunIrradiance, X.Scene.SkyRadiance, X.Scene.ExposureGain]))}<figcaption>${Esc(M.Type)} · lit by the compiled sun + sky</figcaption></figure>`;
    }, "wi-centre")}
    ${Live("obj-xform", (X) => { const R = RecordOf(X.Doc, Row.Id); return G.TransformDiagram(R.Position || [0, 0, 0], R.Scale || [1, 1, 1], R.Rotation || [0, 0, 0]); })}
  </section>
  ${Live("obj-metrics", (X) => {
    const R = RecordOf(X.Doc, Row.Id), M = MaterialOf(R), Prim = X.Scene.Primitives.find((P) => P.OwnerId === Row.Id);
    if (!M) return `<section class="mi-metrics">${StatTile({ Label: "Shape", Value: "Vehicle", Caption: Prim ? "in the compiled scene" : "not compiled" })}${StatTile({ Label: "Shadows", Value: R["Cast shadows"] === false ? "Off" : "On" })}${StatTile({ Label: "GI", Value: R.GI === false ? "Off" : "On" })}</section>`;
    const Metal = Number(Fill(M, "metallic")), Rough = Number(Fill(M, "roughness")), Tr = Number(Fill(M, "transmission")), Ior = Number(Fill(M, "reflectance"));
    const Alb = D.HexToLinear(Fill(M, "colour")), Y = D.Luminance(Alb), F0 = Metal > 0.5 ? Y : D.F0FromIor(Ior);
    const Class = Tr > 0.5 ? "Glass" : Metal > 0.5 ? "Conductor" : "Dielectric";
    const Valid = Metal > 0.5 ? Y >= 0.45 : Y >= 0.02 && Y <= 0.9;
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Albedo", Value: F(Y * 100, 0), Unit: "%", Caption: Valid ? "physically plausible" : Metal > 0.5 ? "dark for a metal" : Y < 0.02 ? "darker than charcoal" : "brighter than snow", Meter: { Kind: "band", Lo: Metal > 0.5 ? 0.45 : 0.02, Hi: Metal > 0.5 ? 1 : 0.9, At: Y, Tone: Valid ? "ok" : "warn" }, Tone: Valid ? "" : "warn" })}
      ${StatTile({ Label: "F0", Value: F(F0 * 100, 1), Unit: "%", Caption: `${Class} · IOR ${F(Ior, 2)}`, Meter: { Kind: "fill", At: F0, Colour: "#ffb238" }, Hot: Metal > 0.5 })}
      ${StatTile({ Label: "Gloss", Value: F((1 - Rough) * 100, 0), Unit: "%", Caption: Rough < 0.1 ? "mirror" : Rough < 0.4 ? "glossy" : Rough < 0.7 ? "satin" : "matte", Meter: { Kind: "fill", At: 1 - Rough, Colour: "#d6d6d6" } })}
    </section>`;
  })}
  ${Section("Transform", (Row.PrimitiveShape || "object").toUpperCase(), `<span class="wi-inline">${Segments("hide", [["Visible", "0", "eye"], ["Hidden", "1", "eye-off"]], Hidden ? "1" : "0", { Label: "Visibility", Extra: `data-target="${Esc(Row.Id)}"`, Fill: false })}</span>`)}
  ${Stack(Axes(`obj:${Row.Id}|Position`, "Position", Rec.Position || [0, 0, 0]), Axes(`obj:${Row.Id}|Rotation`, "Rotation", Rec.Rotation || [0, 0, 0], 1, "deg"), Axes(`obj:${Row.Id}|Scale`, "Size", Rec.Scale || [1, 1, 1]))}
  <div class="wi-switch-grid">${SwitchRow("flip", Effective(C.Doc, Row.Id, "Cast shadows"), "Cast shadows", "", `data-target="${Esc(`${Row.Id}|Cast shadows`)}"`)}${SwitchRow("flip", Effective(C.Doc, Row.Id, "GI"), "Global illumination", "", `data-target="${Esc(`${Row.Id}|GI`)}"`)}</div>
  ${Mat ? `
  ${Section("Surface", "MATERIAL")}
  <div class="wi-pick"><span>Type</span>${Dropdown("mat-type", MaterialTypes.map((T) => [T, T]), Mat.Type, { Label: "Material type", Extra: `data-target="${Esc(Row.Id)}"` })}</div>
  ${Live("obj-swatches", (X) => {
    const M = MaterialOf(RecordOf(X.Doc, Row.Id)), Metal = Number(Fill(M, "metallic")), Rough = Number(Fill(M, "roughness"));
    return `<div class="wi-pbr">${[["Base", Fill(M, "colour")], ["Metal", D.RgbToHex([Metal, Metal, Metal])], ["Rough", D.RgbToHex([Rough, Rough, Rough])], ["Coat", D.RgbToHex(Array(3).fill(Number(Fill(M, "coat"))))], ["Trans", D.RgbToHex(Array(3).fill(Number(Fill(M, "transmission"))))], ["Emit", D.RgbToHex(Array(3).fill(Math.min(1, Number(Fill(M, "emission")) / 5)))]].map(([N, H]) => `<span><i style="background:${H}"></i>${N}</span>`).join("")}</div>`;
  })}
  ${Mat.Channels.colour?.Source && Mat.Channels.colour.Source !== "Fill" ? ChannelKnob(Row.Id, Mat, "colour") : ColourField(`mat:${Row.Id}|colour`, "Base colour", Fill(Mat, "colour"), "base colour")}
  ${Grid(ChannelKnob(Row.Id, Mat, "metallic"), ChannelKnob(Row.Id, Mat, "roughness"), ChannelKnob(Row.Id, Mat, "reflectance"), ChannelKnob(Row.Id, Mat, "emission"))}
  ${Fold("Specular + coat", "anisotropy · clear coat", Grid(ChannelKnob(Row.Id, Mat, "anisotropy"), ChannelKnob(Row.Id, Mat, "coat"), ChannelKnob(Row.Id, Mat, "coatRoughness"), ChannelKnob(Row.Id, Mat, "opacity")))}
  ${Fold("Volume", "transmission · refraction", Grid(ChannelKnob(Row.Id, Mat, "transmission"), ChannelKnob(Row.Id, Mat, "ior")))}` : ""}`;
}

function LightGeometry(X, Id) {
  const R = RecordOf(X.Doc, Id), P = R.ReferenceInspector?.Properties || {};
  const Width = Array.isArray(R.Scale) ? Number(R.Scale[0]) || Number(P.width) || 1.7 : Number(P.width) || 1.7;
  const Height = Array.isArray(R.Scale) ? Number(R.Scale[1]) || Number(P.height) || 1.3 : Number(P.height) || 1.3;
  const Pos = R.Position || P.pos || [0, 0, 0];
  const Floor = X.Scene.Primitives.find((Pr) => Pr.OwnerId === "gallery-floor");
  const FloorZ = Floor ? Floor.Center[2] + Floor.HalfExtents[2] : 0;
  return { Rec: R, P, Width, Height, Pos, Drop: Math.max(0.05, Pos[2] - FloorZ) };
}

function LightCard(C) {
  const Rows = ObjectRows(C.Doc, "light"), Id = C.Doc.Selected.light, Row = Rows.find((R) => R.Id === Id) || Rows[0];
  if (!Row) return `<p class="mi-empty">No lights in the scene.</p>`;
  const Rec = RecordOf(C.Doc, Row.Id), P = Rec.ReferenceInspector?.Properties || {};
  const Picker = Rows.length > 1 ? `<div class="wi-picker">${Dropdown("select", Rows.map((R) => [R.Name, R.Id]), Row.Id, { Label: "Light", Extra: 'data-target="light"' })}</div>` : "";
  const LtKnob = (Key, Label, Min, Max, Step, Unit, Hint = "") => Knob({ Bind: `lt:${Row.Id}|${Key}`, Label, Value: Number(P[Key] ?? 0), Min, Max, Step, Unit, Hint });
  return `
  ${Picker}
  <section class="wi-hero wi-duo">
    ${Live("lt-foot", (X) => { const L = LightGeometry(X, Row.Id); return G.LightFootprint(L.Width, L.Height, L.Drop, Number(L.P.spread ?? 165)); })}
    ${Live("lt-read", (X) => {
      const L = LightGeometry(X, Row.Id), Area = X.Scene.AreaLights.find((A) => A.Id === Row.Id);
      return `<div class="wi-readouts"><div class="wi-emit" style="background:${Area ? D.ChromaHex(Area.Radiance) : "#333"}"></div>${Readout("Radiance", Area ? F(D.Luminance(Area.Radiance), 2) : "off", Area ? "rel" : "")}${Readout("Emitter area", F(L.Width * L.Height, 2), "m²")}${Readout("Height above floor", F(L.Drop, 2), "m")}</div>`;
    })}
  </section>
  ${Live("lt-lux", (X) => {
    const L = LightGeometry(X, Row.Id), Lm = Rec.Powered === false ? 0 : Number(L.P.lumens ?? 2400) * Number(L.P.dimmer ?? 1);
    // Uniform Lambertian rectangle, on-axis illuminance: E = 2·Lv·Σ (a/√(a²+d²))·atan(b/√(a²+d²)), Lv = Φ / (π·A).
    const A = L.Width / 2, B = L.Height / 2, Dd = L.Drop, Lv = Lm / (Math.PI * L.Width * L.Height);
    const E = 2 * Lv * ((A / Math.hypot(A, Dd)) * Math.atan(B / Math.hypot(A, Dd)) + (B / Math.hypot(B, Dd)) * Math.atan(A / Math.hypot(B, Dd)));
    return G.LuxScale(Math.max(0.001, E), `${F(E, 0)} lx on the floor below`);
  })}
  ${Live("lt-metrics", (X) => {
    const L = LightGeometry(X, Row.Id), Lm = Number(L.P.lumens ?? 2400) * Number(L.P.dimmer ?? 1), Lv = Lm / (Math.PI * L.Width * L.Height);
    return `<section class="mi-metrics">
      ${StatTile({ Label: "Output", Value: F(Lm, 0), Unit: "lm", Caption: `≈ ${F(Lm / 90, 0)} W LED`, Meter: { Kind: "fill", At: Math.min(1, Lm / 20000), Colour: "#ffd38a" }, Hot: Rec.Powered !== false })}
      ${StatTile({ Label: "Luminance", Value: F(Lv, 0), Unit: "nit", Caption: "Lambertian surface", Meter: { Kind: "fill", At: Math.min(1, Math.log10(Math.max(1, Lv)) / 5), Colour: "#ffb238" } })}
      ${StatTile({ Label: "Colour", Value: F(D.CctFromLinear(D.HexToLinear(L.P.color || "#ffffff")), 0), Unit: "K", Caption: (L.P.color || "#ffffff").toUpperCase(), Meter: { Kind: "swatches", Colours: [L.P.color || "#ffffff"] } })}
    </section>`;
  })}
  ${Section("Emission", "PHOTOMETRY", `<span class="wi-inline">${SwitchRow("flip", Effective(C.Doc, Row.Id, "Powered"), "Powered", "", `data-target="${Esc(`${Row.Id}|Powered`)}"`)}</span>`)}
  ${Stack(LtKnob("lumens", "Luminous flux", 0, 20000, 10, "lm"), LtKnob("dimmer", "Dimmer", 0, 1, 0.01, "×"), ColourField(`lt:${Row.Id}|color`, "Light colour", P.color || "#ffffff", "emitter colour"))}
  ${Section("Shape", "SIZE · SPREAD")}
  ${Grid(LtKnob("width", "Width", 0.16, 6, 0.01, "m"), LtKnob("height", "Height", 0.16, 6, 0.01, "m"), LtKnob("spread", "Spread", 10, 180, 1, "°"), LtKnob("shadowSoftness", "Shadow softness", 0, 4, 0.01, "×"))}
  ${Fold("Placement", "position · rotation", Stack(Axes(`obj:${Row.Id}|Position`, "Position", Rec.Position || P.pos || [0, 0, 0]), Axes(`obj:${Row.Id}|Rotation`, "Rotation", Rec.Rotation || P.rot || [0, 0, 0], 1, "deg")))}`;
}

function GroupCard(C) {
  const Groups = C.Doc.Rows.filter((R) => R.Panel === "group"), Id = C.Doc.Selected.group, Row = Groups.find((R) => R.Id === Id) || Groups[0];
  if (!Row) return `<p class="mi-empty">No groups.</p>`;
  const Members = C.Doc.Rows.filter((R) => R.Parent === Row.Id);
  const Panels = {};
  for (const M of Members) Panels[M.Panel] = (Panels[M.Panel] || 0) + 1;
  const Hue = { geometry: "#ffb238", light: "#ffd38a", camera: "#4d9bff", "render-settings": "#8a8a8a", sun: "#f29a52", atmosphere: "#6fa8ff", clouds: "#cfd8e6", moon: "#e8e3d6", stars: "#b48cff", group: "#666" };
  const Shown = Members.filter((M) => !C.Doc.Hidden[M.Id]).length;
  const Tint = RecordOf(C.Doc, Row.Id).Tint || FieldMeta("group", "Tint")?.Default || "#9bacb4";
  return `
  <div class="wi-picker">${Dropdown("select", Groups.map((G2) => [G2.Name, G2.Id, null, `${C.Doc.Rows.filter((R) => R.Parent === G2.Id).length} members`]), Row.Id, { Label: "Group", Extra: 'data-target="group"' })}</div>
  <section class="wi-hero">
    <div class="wi-comp">${Object.entries(Panels).map(([P, N]) => `<i style="flex:${N};background:${Hue[P] || "#777"}" title="${Esc(P)} · ${N}"></i>`).join("")}</div>
    <div class="wi-legend">${Object.entries(Panels).map(([P, N]) => `<span class="wi-chip">${Swatch(Hue[P] || "#777", 8)}${Esc(P)} · ${N}</span>`).join("")}</div>
  </section>
  <section class="mi-metrics">
    ${StatTile({ Label: "Members", Value: `${Members.length}`, Caption: `${Object.keys(Panels).length} kinds`.replace("kinds", "types"), Meter: { Kind: "stack", Parts: Object.entries(Panels).map(([P, N]) => ({ Share: N, Colour: Hue[P] || "#777" })) } })}
    ${StatTile({ Label: "Visible", Value: `${Shown}`, Unit: `/${Members.length}`, Caption: C.Doc.Hidden[Row.Id] ? "group hidden" : "in the render", Meter: { Kind: "steps", Count: Math.max(1, Members.length), Done: C.Doc.Hidden[Row.Id] ? 0 : Shown }, Hot: !C.Doc.Hidden[Row.Id] })}
    ${StatTile({ Label: "Tint", Value: Tint.toUpperCase(), Caption: "outliner colour", Meter: { Kind: "swatches", Colours: [Tint] } })}
  </section>
  ${Section("Contents", "VISIBILITY", Segments("hide", [["Shown", "0", "eye"], ["Hidden", "1", "eye-off"]], C.Doc.Hidden[Row.Id] ? "1" : "0", { Label: "Group visibility", Extra: `data-target="${Esc(Row.Id)}"`, Fill: false }))}
  <div class="wi-members">${Members.map((M) => `<div class="wi-member ${C.Doc.Hidden[M.Id] ? "off" : ""}">${Swatch(Hue[M.Panel] || "#777", 10)}<span>${Esc(M.Name)}<small>${Esc(M.Panel)}${M.PrimitiveShape ? ` · ${Esc(M.PrimitiveShape)}` : ""}</small></span>
    <button type="button" class="icon-btn" data-act="hide-flip" data-target="${Esc(M.Id)}" aria-label="${C.Doc.Hidden[M.Id] ? "Show" : "Hide"} ${Esc(M.Name)}">${Icon(C.Doc.Hidden[M.Id] ? "eye-off" : "eye", 14)}</button></div>`).join("") || `<p class="mi-empty">Empty group.</p>`}</div>
  ${Section("Appearance", "TINT")}
  ${ColourField(`grp:${Row.Id}|Tint`, "Group tint", Tint, "outliner tint")}`;
}

const BUILDERS = { sun: SunCard, atmosphere: AtmosphereCard, clouds: CloudsCard, moon: MoonCard, stars: StarsCard, flare: FlareCard, post: PostCard, camera: CameraCard, wind: WindCard, fog: FogCard, weather: WeatherCard, object: ObjectCard, light: LightCard, group: GroupCard };
const RESET_PANELS = { fog: ["height-fog", "aerial-fog"], weather: ["precipitation", "rainbow"], post: ["post", "render-settings"], object: null, light: null, group: null };

function CardHtml(Card, C) {
  return `<article class="mi-card wi-card tone-${Card.Tone}" data-card="${Card.Id}" aria-label="${Esc(Card.Name)} inspector">
    <header class="mi-head"><span class="mi-mark">${Icon(Card.Icon, 15)}</span><span class="mi-head-title"><b>${Esc(Card.Name)}</b><small>${Esc(Card.Eyebrow.toUpperCase())}</small></span>
      <span class="mi-head-tools"><button type="button" class="icon-btn" data-act="reset" data-target="${Card.Id}" title="Reset ${Esc(Card.Name)}" aria-label="Reset ${Esc(Card.Name)}">${Icon("reset", 14)}</button></span></header>
    <div class="wi-body">${BUILDERS[Card.Id](C)}</div>
    <footer class="mi-foot-line wi-foot"><span>${Esc(REACH[Card.Id])}</span><span>drag graphics to edit</span></footer>
  </article>`;
}

// ================================================================================================ canvases
const Canvases = new Map();
const CanvasSpecs = {
  "dome-sky": (C, El, Done) => G.RenderDome(El, { Lut: SkyLut(C.Scene), SunDir: C.Scene.SunDir, Gain: C.Scene.ExposureGain, SunDisc: { HalfRad: C.Scene.SunAngularRadiusRad, Rgb: DiscRgb(C.Scene) }, Done }),
  "dome-clouds": (C, El, Done) => G.RenderDome(El, { Lut: SkyLut(C.Scene), SunDir: C.Scene.SunDir, Gain: C.Scene.ExposureGain, Clouds: C.Scene.Clouds.enabled ? C.Scene.Clouds : null, SunIrr: C.Scene.SunIrradiance, SkyCol: C.Scene.SkyRadiance, SunDisc: { HalfRad: C.Scene.SunAngularRadiusRad, Rgb: DiscRgb(C.Scene) }, Done }),
  "stars-window": (C, El, Done) => G.RenderStarWindow(El, { Lut: SkyLut(C.Scene), SunDir: C.Scene.SunDir, Gain: C.Scene.ExposureGain, Stars: C.Scene.Stars, Moon: C.Scene.Moon, FovDeg: 30, Done }),
  moon: (C, El, Done) => { const M = C.Scene.Moon; G.RenderMoon(El, { Preset: M.preset, Phase: M.phase, Bright: M.bright, Glow: M.glow, Roll: Number(C.V("moon", "Roll") || 0) }); Done(); },
  ball: (C, El, Done) => {
    const Row = C.Doc.Rows.find((R) => R.Id === C.Doc.Selected.geometry), M = MaterialOf(RecordOf(C.Doc, Row?.Id));
    if (M) G.RenderBall(El, { Albedo: D.HexToLinear(Fill(M, "colour")), Metallic: +Fill(M, "metallic"), Roughness: +Fill(M, "roughness"), F0: D.F0FromIor(+Fill(M, "reflectance")), Coat: +Fill(M, "coat"), Transmission: +Fill(M, "transmission"), Emission: +Fill(M, "emission"), SunDir: C.Scene.SunDir, SunIrr: C.Scene.SunIrradiance, SkyCol: C.Scene.SkyRadiance, Gain: C.Scene.ExposureGain });
    Done();
  },
};

function AttachCanvases(Root) {
  for (const Ph of Root.querySelectorAll("[data-canvas]")) {
    const Name = Ph.dataset.canvas, Key = Ph.dataset.ckey;
    let Entry = Canvases.get(Name);
    if (!Entry) { Entry = { El: document.createElement("canvas"), Key: null, Busy: false, Want: null }; Entry.El.className = "wi-canvas-el"; Entry.El.setAttribute("aria-hidden", "true"); Canvases.set(Name, Entry); }
    if (Entry.El.parentNode !== Ph) Ph.replaceChildren(Entry.El);
    if (Entry.Key !== Key) { Entry.Want = Key; Paint(Name); }
  }
}

function Paint(Name) {
  const Entry = Canvases.get(Name);
  if (!Entry || Entry.Busy || Entry.Want === null) return;
  Entry.Busy = true;
  const Key = Entry.Want;
  Entry.Want = null;
  setTimeout(() => {
    const Done = () => { Entry.Key = Key; Entry.Busy = false; if (Entry.Want !== null && Entry.Want !== Key) Paint(Name); else Entry.Want = null; };
    try { CanvasSpecs[Name](Context(), Entry.El, Done); } catch (Err) { console.error(`World Inspector: ${Name} render failed`, Err); Done(); }
  }, State.Clock ? 250 : 40);
}

// ================================================================================================ render + refresh
function NavHtml() {
  return `<nav class="mi-docknav wi-nav" aria-label="World inspector cards">
    <a href="?card=all" data-act="show" data-value="all" class="${State.Filter === "all" ? "active" : ""}">${Icon("grid4", 12)}All</a>
    ${CARDS.map((Cd) => `<a href="?card=${Cd.Id}" data-act="show" data-value="${Cd.Id}" class="${State.Filter === Cd.Id ? "active" : ""}" ${State.Filter === Cd.Id ? 'aria-current="page"' : ""}>${Icon(Cd.Icon, 12)}${Esc(Cd.Name.replace("Volumetric ", ""))}</a>`).join("")}
  </nav>
  <div class="wi-toolbar">
    <button type="button" class="icon-btn" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo" ${State.Hist.Past.length ? "" : "disabled"}>${Icon("undo", 14)}</button>
    <button type="button" class="icon-btn" data-act="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" ${State.Hist.Future.length ? "" : "disabled"}>${Icon("redo", 14)}</button>
    <button type="button" class="mi-text-btn" data-act="export">${Icon("download", 12)} World JSON</button>
    <button type="button" class="mi-text-btn" data-act="reset-all">${Icon("reset", 12)} Showcase defaults</button>
    <span class="wi-saved">${State.Saved ? "Saved locally" : "Saving…"}</span>
  </div>`;
}

export function RenderAll() {
  const Root = State.Root;
  LiveFns = new Map();
  const C = Context();
  const Cards = CARDS.filter((Cd) => State.Filter === "all" || State.Filter === Cd.Id);
  const Html = `<div class="wi-top">${NavHtml()}</div><div class="wi-grid ${State.Filter === "all" ? "" : "single"}">${Cards.map((Cd) => CardHtml(Cd, C)).join("")}</div>`;
  if (typeof document === "undefined") return Html;
  Rebuild(Root, Html, ".wi-card, .wi-top");
  AttachCanvases(Root);
  return Html;
}

function RefreshLive() {
  if (!State.Root?.querySelectorAll) return;
  const C = Context();
  for (const El of State.Root.querySelectorAll("[data-live]")) {
    const Fn = LiveFns.get(El.dataset.live);
    if (!Fn) continue;
    const Html = Fn(C);
    if (El.__Html !== Html) { El.innerHTML = Html; El.__Html = Html; }
  }
  AttachCanvases(State.Root);
}

function Persist() {
  State.Saved = false;
  clearTimeout(State.Timer);
  State.Timer = setTimeout(() => { State.Saved = Save(State.Doc); const S = State.Root?.querySelector(".wi-saved"); if (S) S.textContent = State.Saved ? "Saved locally" : "Not saved"; }, 300);
}

// ================================================================================================ edits
function Snapshot() {
  return { Values: State.Doc.Values, Hidden: State.Doc.Hidden, Selected: State.Doc.Selected };
}

export function Write(Bind, Raw) {
  const Doc = State.Doc;
  const [Head, Field] = Bind.split("|");
  if (Head.startsWith("obj:")) {
    const Id = Head.slice(4), [Key, Axis] = Field.split(":"), Rec = RecordOf(Doc, Id), Num = Number(Raw);
    if (!Number.isFinite(Num)) return false;
    const Vec = [...(Rec[Key] || [0, 0, 0])];
    Vec[+Axis] = Key === "Scale" ? Math.max(0.01, Num) : Num;
    Rec[Key] = Vec;
    const Ref = Rec.ReferenceInspector?.Properties;
    if (Ref && Key === "Position") Ref.pos = [...Vec];
    if (Ref && Key === "Rotation") Ref.rot = [...Vec];
    return true;
  }
  if (Head.startsWith("mat:")) {
    const Id = Head.slice(4), Rec = RecordOf(Doc, Id), M = ChannelMeta[Field];
    if (!Rec.Material || !M) return false;
    const Value = M.Kind === "Colour" ? (HEX.test(Raw) ? Raw.toLowerCase() : null) : D.Clamp(Number(Raw), M.Minimum, M.Maximum);
    if (Value === null || (M.Kind !== "Colour" && !Number.isFinite(Value))) return false;
    Rec.Material = ChangeChannel({ ...Rec.Material, Channels: { ...(Rec.Material.Channels || {}) } }, Field, { Source: "Fill", Fill: Value });
    return true;
  }
  if (Head.startsWith("lt:")) {
    const Id = Head.slice(3), Rec = RecordOf(Doc, Id);
    Rec.ReferenceInspector ??= { Type: "LuminousSurface", Properties: {} };
    const P = Rec.ReferenceInspector.Properties;
    if (Field === "color") { if (!HEX.test(Raw)) return false; P.color = Raw.toLowerCase(); return true; }
    const Num = Number(Raw);
    if (!Number.isFinite(Num)) return false;
    P[Field] = Num;
    // The compile reads Scale[0..1] ahead of the reference width / height for plain area lights: keep both in step.
    if ((Field === "width" || Field === "height") && Array.isArray(Rec.Scale)) { const S = [...Rec.Scale]; S[Field === "width" ? 0 : 1] = Num; Rec.Scale = S; }
    return true;
  }
  if (Head.startsWith("grp:")) {
    if (!HEX.test(Raw)) return false;
    RecordOf(Doc, Head.slice(4)).Tint = Raw.toLowerCase();
    return true;
  }
  const Row = Doc.Rows.find((R) => R.Id === Head);
  if (!Row) return false;
  const Meta = FieldMeta(Row.Panel, Field);
  let Value = Raw;
  if (typeof Raw === "string" && HEX.test(Raw)) Value = Raw.toLowerCase();
  else if (typeof Raw !== "boolean") {
    Value = Number(Raw);
    if (!Number.isFinite(Value)) return false;
    if (Meta && Number.isFinite(Meta.Min) && Number.isFinite(Meta.Max)) Value = D.Clamp(Value, Meta.Min, Meta.Max);
  }
  Edit(Doc, Head, Field, Value);
  return true;
}

function SnapToField(Bind, Value) {
  const [Head, Field] = Bind.split("|"), Row = State.Doc.Rows.find((R) => R.Id === Head), M = Row && FieldMeta(Row.Panel, Field);
  if (!M) return Value;
  const Step = M.Step || 0.01;
  return D.Clamp(Math.round(Value / Step) * Step, M.Min, M.Max);
}

function MirrorInputs(Bind) {
  const [Head, Field] = Bind.split("|"), V = Read(State.Doc, Head, Field);
  for (const El of State.Root.querySelectorAll(`[data-bind="${CSS.escape(Bind)}"]`)) {
    if (El === document.activeElement) continue;
    if (El.type === "range") { El.value = V; El.style.setProperty("--fill", `${(((V - El.min) / (El.max - El.min || 1)) * 100).toFixed(1)}%`); }
    else if (El.type === "number") El.value = (+V).toFixed(Math.max(0, -Math.floor(Math.log10(+El.step || 1))));
  }
}

function Commit(Full = true) {
  State.Hist.Settle(Snapshot());
  Persist();
  if (Full) RenderAll(); else RefreshLive();
}

function Restore(Snap) {
  if (!Snap) return;
  State.Doc.Values = Snap.Values;
  State.Doc.Hidden = Snap.Hidden || {};
  State.Doc.Selected = { ...State.Doc.Selected, ...(Snap.Selected || {}) };
  Persist();
  RenderAll();
  SyncClock();
}

function SyncClock() {
  const On = !!RecordOf(State.Doc, "sun").Animate && !!State.Root;
  if (On && !State.Clock) {
    let Last = performance.now();
    State.Clock = setInterval(() => {
      const Now = performance.now();
      if (AdvanceClock(State.Doc, (Now - Last) / 1000)) { RefreshLive(); MirrorInputs("sun|Local Hours"); Persist(); }
      Last = Now;
    }, 100);
  } else if (!On && State.Clock) { clearInterval(State.Clock); State.Clock = null; }
}

function Perform(Btn) {
  const Act = Btn.dataset.act, Target = Btn.dataset.target, Value = Btn.dataset.value, Doc = State.Doc;
  State.Hist.Begin(Snapshot());
  switch (Act) {
    case "show":
      State.Filter = Value;
      history.replaceState(null, "", Value === "all" ? location.pathname : `?card=${Value}`);
      State.Hist.Pending = null;
      RenderAll();
      return;
    case "flip": { const [Head, Field] = Target.split("|"); Edit(Doc, Head, Field, !Effective(Doc, Head, Field)); break; }
    case "pick": { const [Head, Field] = Target.split("|"); Edit(Doc, Head, Field, Number(Value)); break; }
    case "select": Doc.Selected[Target] = Value; break;
    case "mat-type": { const Rec = RecordOf(Doc, Target); Rec.Material = ChooseMaterialType(ResolveMaterial(Rec.Material), Value); break; }
    case "hide": if (Value === "1") Doc.Hidden[Target] = true; else delete Doc.Hidden[Target]; break;
    case "hide-flip": if (Doc.Hidden[Target]) delete Doc.Hidden[Target]; else Doc.Hidden[Target] = true; break;
    case "moon-phase": Edit(Doc, "moon", "Phase", Number(Value)); break;
    case "fstop": Edit(Doc, "camera", "Aperture", Number(Value)); break;
    case "night": Edit(Doc, "sun", "Local Hours", 22); break;
    case "now": { const T = new Date(); Edit(Doc, "sun", "Month", T.getMonth() + 1); Edit(Doc, "sun", "Day of Month", T.getDate()); Edit(Doc, "sun", "Local Hours", T.getHours() + T.getMinutes() / 60); break; }
    case "reset": {
      if (Target === "object" || Target === "light") { const Id = Doc.Selected[Target === "object" ? "geometry" : "light"]; if (Id) ResetPanel(Doc, Id); delete Doc.Hidden[Id]; }
      else if (Target === "group") { const Id = Doc.Selected.group; ResetPanel(Doc, Id); for (const R of Doc.Rows) if (R.Parent === Id || R.Id === Id) delete Doc.Hidden[R.Id]; }
      else for (const P of RESET_PANELS[Target] || [Target]) ResetPanel(Doc, P);
      break;
    }
    case "reset-all": { const Fresh = CreateDocument(); Doc.Values = Fresh.Values; Doc.Hidden = {}; break; }
    case "undo": case "redo": State.Hist.Pending = null; Restore(State.Hist.Step(Act === "undo", Snapshot())); return;
    case "export": State.Hist.Pending = null; Download(ExportJson(Doc), "world-inspector.json", "application/json"); return;
    default: State.Hist.Pending = null; return;
  }
  Commit(true);
  SyncClock();
}

// ------------------------------------------------------------------------------------------------ graphic drags
function ScrubValue(Spec, Svg, E) {
  const R = Svg.getBoundingClientRect();
  if (!(R.width > 0 && R.height > 0)) return [];
  const U = (E.clientX - R.left) / R.width, V = (E.clientY - R.top) / R.height;
  const Range = (Bind) => {
    const [H, Fd] = Bind.split("|"), Row = State.Doc.Rows.find((Rw) => Rw.Id === H), M = Row && FieldMeta(Row.Panel, Fd);
    return [Number(Spec.min ?? M?.Min ?? 0), Number(Spec.max ?? M?.Max ?? 1)];
  };
  const Out = [];
  // 1-D along x between the normalised plot edges x0..x1 (sun clock, magnitude scale).
  if (Spec.scrub) {
    const [Lo, Hi] = Range(Spec.scrub), X0 = Number(Spec.x0 ?? 0), X1 = Number(Spec.x1 ?? 1);
    Out.push([Spec.scrub, Lo + D.Clamp((U - X0) / (X1 - X0), 0, 1) * (Hi - Lo)]);
  }
  // Frame position: the value is the normalised coordinate itself (flare preview pose), clamped to the field range.
  if (Spec.scrubX) { const [Lo, Hi] = Range(Spec.scrubX); Out.push([Spec.scrubX, D.Clamp(U, Lo, Hi)]); }
  if (Spec.scrubY) {
    const [Lo, Hi] = Range(Spec.scrubY);
    if (Spec.y0 !== undefined) {
      const T = D.Clamp((V - Number(Spec.y0)) / (Number(Spec.y1 ?? 1) - Number(Spec.y0)), 0, 1);
      Out.push([Spec.scrubY, Spec.invert ? Hi - T * (Hi - Lo) : Lo + T * (Hi - Lo)]);
    } else Out.push([Spec.scrubY, D.Clamp(V, Lo, Hi)]);
  }
  // Compass bearing from the rose centre, clockwise from north.
  if (Spec.scrubAngle) {
    const Cx = R.left + R.width / 2, Cy = R.top + R.height / 2;
    Out.push([Spec.scrubAngle, ((Math.atan2(E.clientX - Cx, -(E.clientY - Cy)) * 180) / Math.PI + 360) % 360]);
  }
  return Out;
}

function StartDrag(E, Target) {
  const Host = Target.closest("[data-live]");
  if (!Host) return;
  E.preventDefault();
  State.Hist.Begin(Snapshot());
  Host.setPointerCapture?.(E.pointerId);
  const Spec = { ...Target.dataset };
  const Apply = (Ev) => {
    const Svg = Host.querySelector("svg");
    if (!Svg) return;
    for (const [Bind, Raw] of ScrubValue(Spec, Svg, Ev)) { if (Write(Bind, SnapToField(Bind, Raw))) MirrorInputs(Bind); }
    RefreshLive();
  };
  Apply(E);
  const Move = (Ev) => Apply(Ev);
  const Up = () => { Host.removeEventListener("pointermove", Move); Host.removeEventListener("pointerup", Up); Host.removeEventListener("pointercancel", Up); Commit(true); };
  Host.addEventListener("pointermove", Move);
  Host.addEventListener("pointerup", Up);
  Host.addEventListener("pointercancel", Up);
}

// ================================================================================================ mount
export async function Mount(Root, { Catalogue = null, Storage = globalThis.localStorage } = {}) {
  const Panels = Catalogue || (await (await fetch(new URL("../FrontierWorldMirror/NativePanels.json", import.meta.url))).json()).Panels;
  UseCatalogue(Panels);
  State.Root = Root;
  State.Doc = Load(Storage);
  const Wanted = new URLSearchParams(globalThis.location?.search || "").get("card");
  State.Filter = CARDS.some((Cd) => Cd.Id === Wanted) ? Wanted : "all";
  RenderAll();
  SyncClock();

  Root.addEventListener("input", (E) => {
    const El = E.target;
    if (!El.dataset?.bind) return;
    if (El.dataset.hex !== undefined && !HEX.test(El.value)) return;
    State.Hist.Begin(Snapshot());
    if (!Write(El.dataset.bind, El.type === "color" || El.dataset.hex !== undefined ? El.value : El.value)) return;
    SyncSiblings(Root, El);
    Persist();
    RefreshLive();
  });
  Root.addEventListener("change", (E) => {
    if (!E.target.dataset?.bind) return;
    Commit(true);
  });
  Root.addEventListener("click", (E) => {
    const Btn = E.target.closest("[data-act]");
    if (!Btn || Btn.disabled || Btn.closest("summary")) return;
    if (Btn.tagName === "A") E.preventDefault();
    Perform(Btn);
  });
  Root.addEventListener("pointerdown", (E) => {
    const T = E.target.closest("[data-scrub], [data-scrub-x], [data-scrub-y], [data-scrub-angle]");
    if (T && E.button === 0) StartDrag(E, T);
  });
  document.addEventListener("keydown", (E) => {
    if (!(E.ctrlKey || E.metaKey) || E.key.toLowerCase() !== "z" || E.target.closest?.("input")) return;
    E.preventDefault();
    Restore(State.Hist.Step(!E.shiftKey, Snapshot()));
  });
  return { State, Write, RenderAll, Compile: () => Compile(State.Doc), Reset: () => { Storage?.removeItem(STORE_KEY); State.Doc = CreateDocument(); RenderAll(); } };
}

// Headless entry for the validation script: same builders, no DOM.
export function MountHeadless(Panels, Doc = null) {
  UseCatalogue(Panels);
  State.Doc = Doc || CreateDocument();
  if (State.Clock) { clearInterval(State.Clock); State.Clock = null; }
  State.Root = null;
  State.Filter = "all";
  return { State, Write, Act: (Dataset) => Perform({ dataset: Dataset }), Html: () => RenderAll(), Context, CARDS };
}
