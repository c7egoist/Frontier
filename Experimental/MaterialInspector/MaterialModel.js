// MaterialModel.js — pure model behind the Material Inspector card (no DOM).
//
// It keeps the TextureStudio Material workspace document so that a material exported from this card loads back into
// TextureStudio unchanged:
//   • flat look-dev parameters (color, roughness, metalness, ior, coat, …) that the surface stratum addresses directly;
//   • Authoring v2 { Layers, Generators, Variables, Links, Inputs, Sources, Designer } — stratum channel lists, coded field
//     generators, per-address inputs and per-address channel sources.
// Channel registry and ChannelAddress rules are copied from TextureStudio/Engine/Materials/MaterialSpecification.js; the
// field generators are TextureStudio's own FieldSpecification.js (copied verbatim into ./Engine).

import { GeneratorDefinitions, CamouflagePalette, SampleGenerator } from "./Engine/FieldSpecification.js";
import { normalizeTextureSource } from "./Engine/textureSource.js";

export { GeneratorDefinitions, CamouflagePalette };

export const STORAGE_PREFIX = "Frontier.MaterialInspector.v1:";
export const STORAGE_CURRENT = "Frontier.MaterialInspector.v1#current";

const Clamp = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, V));
const Uuid = () => globalThis.crypto.randomUUID();
const HEX = /^#[0-9a-f]{6}$/i;

// ------------------------------------------------------------------------------------------------ channel registry
// [key, caption, type, target, default, min, max, group, hint]
export const CHANNELS = [
  ["colour", "Colour", "colour", "color", "#ffffff", 0, 1, "Core", "Base albedo"],
  ["roughness", "Roughness", "scalar", "roughness", 0.5, 0, 1, "Core", "Microfacet gloss"],
  ["metallic", "Metallic", "scalar", "metalness", 0, 0, 1, "Core", "Conductor mask"],
  ["normal", "Normal", "vector", "normal", [0, 0, 1], 0, 1, "Core", "Surface tangent"],
  ["microNormal", "Micro normal", "vector", "microNormal", [0, 0, 1], 0, 1, "Core", "Fine pore / grain"],
  ["height", "Height", "scalar", "reliefHeight", 0.5, 0, 1, "Core", "Displacement relief"],
  ["occlusion", "Occlusion", "scalar", "aoIntensity", 1, 0, 1, "Core", "Cavity AO"],
  ["opacity", "Opacity", "scalar", "opacity", 1, 0, 1, "Core", "Cutout / alpha"],
  ["coverage", "Coverage", "scalar", "coverage", 1, 0, 1, "Core", "Stratum blend mask"],
  ["ior", "IOR", "scalar", "ior", 1.5, 1, 3, "Specular", "Fresnel index"],
  ["specular", "Specular", "scalar", "specular", 1, 0, 1, "Specular", "Dielectric reflection"],
  ["specularColour", "Specular colour", "colour", "specularColor", "#ffffff", 0, 1, "Specular", "Edge tint"],
  ["anisotropy", "Anisotropy", "scalar", "anisotropy", 0, 0, 1, "Specular", "Directional brushing"],
  ["anisotropyRotation", "Anisotropy angle", "scalar", "anisotropyRotation", 0, 0, 1, "Specular", "Grain direction"],
  ["coat", "Clearcoat", "scalar", "coat", 0, 0, 1, "Coat", "Lacquer weight"],
  ["coatRoughness", "Coat roughness", "scalar", "coatRoughness", 0.08, 0.01, 1, "Coat", "Lacquer polish"],
  ["coatIor", "Coat IOR", "scalar", "coatIor", 1.5, 1, 2.5, "Coat", "Lacquer Fresnel"],
  ["coatNormal", "Coat normal", "vector", "coatNormal", [0, 0, 1], 0, 1, "Coat", "Orange peel"],
  ["sheen", "Sheen", "scalar", "sheen", 0, 0, 1, "Sheen", "Grazing velvet"],
  ["sheenRoughness", "Sheen roughness", "scalar", "sheenRoughness", 0.55, 0, 1, "Sheen", "Grazing falloff"],
  ["sheenColour", "Sheen colour", "colour", "sheenColor", "#ffffff", 0, 1, "Sheen", "Grazing tint"],
  ["iridescence", "Iridescence", "scalar", "iridescence", 0, 0, 1, "Thin film", "Interference weight"],
  ["iridescenceIor", "Film IOR", "scalar", "iridescenceIOR", 1.35, 1, 2.5, "Thin film", "Film index"],
  ["iridescenceThickness", "Film thickness", "scalar", "filmThickness", 380, 0, 1200, "Thin film", "Nanometres", "nm"],
  ["transmission", "Transmission", "scalar", "translucency", 0, 0, 1, "Volume", "Gel / glass"],
  ["thickness", "Thickness", "scalar", "depth", 0.5, 0, 10, "Volume", "Volume depth"],
  ["attenuationColour", "Attenuation", "colour", "attenuationColor", "#ffffff", 0, 1, "Volume", "Interior tint"],
  ["emissive", "Emissive", "colour", "emissionColor", "#000000", 0, 1, "Emission", "Self-glow colour"],
  ["emissiveIntensity", "Glow strength", "scalar", "emissionStrength", 0, 0, 10, "Emission", "HDR intensity"],
].map(([Key, Caption, Type, Target, Default, Minimum, Maximum, Group, Hint, Unit = ""]) =>
  Object.freeze({ Key, Caption, Type, Target, Default, Minimum, Maximum, Group, Hint, Unit }));

export const CHANNEL = Object.freeze(Object.fromEntries(CHANNELS.map((C) => [C.Key, C])));
export const GROUPS = Object.freeze(["Core", "Specular", "Coat", "Sheen", "Thin film", "Volume", "Emission"]);

export const MODELS = Object.freeze({
  surface: { Label: "Surface", Hint: "Base BSDF" },
  coat: { Label: "Coat", Hint: "Lacquer topcoat" },
  flakes: { Label: "Flakes", Hint: "Particle field" },
  detail: { Label: "Detail", Hint: "Masked overlay" },
});

// Card-level source choices.  "Ramp" covers TextureStudio's linear / radial / conic modes.
export const SOURCES = Object.freeze([
  { Id: "value", Label: "Value" },
  { Id: "field", Label: "Field" },
  { Id: "ramp", Label: "Ramp" },
  { Id: "texture", Label: "Image" },
]);
export const RAMP_SHAPES = Object.freeze(["linear", "radial", "conic"]);
const STORED_MODES = ["value", "solid", "texture", "linear", "radial", "conic", "ramp", "field", "pattern"];
export const SourceKind = (Mode) => (RAMP_SHAPES.includes(Mode) || Mode === "ramp" ? "ramp" : Mode === "solid" ? "value" : Mode || "value");

export const FIELD_KNOBS = Object.freeze([
  { Key: "scale", Label: "Scale", Minimum: 1, Maximum: 64, Step: 0.5, Default: 8, Unit: "×" },
  { Key: "seed", Label: "Seed", Minimum: 0, Maximum: 200, Step: 1, Default: 12, Unit: "" },
  { Key: "angle", Label: "Angle", Minimum: -180, Maximum: 180, Step: 1, Default: 0, Unit: "°" },
  { Key: "amount", Label: "Contrast", Minimum: 0, Maximum: 1, Step: 0.02, Default: 1, Unit: "" },
]);

export const DETAIL_PRESETS = Object.freeze([
  { Id: "noise", Label: "Scuffs", Stops: ["#14161a", "#c9b89b"] },
  { Id: "camouflage-smooth", Label: "Camo", Stops: [...CamouflagePalette] },
  { Id: "cells", Label: "Cells", Stops: ["#22252b", "#d8aa5b"] },
  { Id: "stripes", Label: "Grain", Stops: ["#1a1d22", "#a2abb8"] },
]);

// Model-specific stratum knobs (not channels).  Flat parameter keys, same as TextureStudio.
export const STRATUM_KNOBS = Object.freeze({
  surface: [
    { Key: "detailScale", Label: "Detail scale", Minimum: 0.5, Maximum: 120, Step: 0.5, Default: 8, Unit: "×" },
    { Key: "grain", Label: "Grain", Minimum: 0, Maximum: 1, Step: 0.01, Default: 0.5 },
  ],
  coat: [{ Key: "orangePeel", Label: "Orange peel", Minimum: 0, Maximum: 1, Step: 0.02, Default: 0 }],
  flakes: [
    { Key: "flakes", Label: "Density", Minimum: 0, Maximum: 1, Step: 0.01, Default: 0 },
    { Key: "flakeScale", Label: "Frequency", Minimum: 4, Maximum: 120, Step: 1, Default: 24 },
    { Key: "flakeTilt", Label: "Tilt", Minimum: 0, Maximum: 1, Step: 0.02, Default: 0.2 },
  ],
  detail: [],
});

// ------------------------------------------------------------------------------------------------ addresses
export function ChannelAddress(Layer, Channel) {
  if (Layer.Model === "coat")
    return ({ roughness: "coatRoughness", ior: "coatIor", coverage: "coat", coat: "coat", coatRoughness: "coatRoughness", coatIor: "coatIor", normal: "coatNormal", coatNormal: "coatNormal" })[Channel] || `layer:${Layer.Identity}:${Channel}`;
  if (Layer.Model === "flakes") return `flake-output:${Channel}`;
  if (Layer.Model === "surface") return CHANNEL[Channel].Target;
  return `layer:${Layer.Identity}:${Channel}`;
}

export function ResolveAddress(P, Address, Visited = new Set()) {
  if (Visited.has(Address)) throw Error("Cyclic shared material variable.");
  Visited.add(Address);
  const Reference = P.Authoring?.Links?.[Address];
  if (!Reference) return Address;
  const Variable = P.Authoring.Variables.find((V) => V.Identity === Reference);
  if (!Variable) throw Error("Shared variable is missing.");
  return ResolveAddress(P, Variable.Address, Visited);
}

export function ReadParameter(P, Address) {
  const R = ResolveAddress(P, Address);
  return R.includes(":") ? P.Authoring?.Inputs?.[R] : P[R];
}

export function WriteParameter(P, Address, Quantity) {
  if (typeof Quantity === "number" && !Number.isFinite(Quantity)) throw Error("Material input must be finite.");
  const Next = structuredClone(P), R = ResolveAddress(Next, Address);
  if (R.includes(":")) Next.Authoring.Inputs[R] = Quantity;
  else Next[R] = Quantity;
  return Next;
}

// Which registry entry governs a stratum channel's value domain (coat strata reuse roughness/ior/coverage domains for their
// own carriers — TextureStudio's Physical() does the same).
function Domain(Channel) { return CHANNEL[Channel]; }

export function ReadChannel(P, Layer, Channel) {
  const Spec = Domain(Channel), V = ReadParameter(P, ChannelAddress(Layer, Channel));
  if (Spec.Type === "colour") return HEX.test(V) ? V.toLowerCase() : Spec.Default;
  if (Spec.Type === "vector") return Array.isArray(V) && V.length === 3 && V.every(Number.isFinite) ? V : [...Spec.Default];
  return Number.isFinite(+V) && V !== null && V !== "" ? Clamp(+V, Spec.Minimum, Spec.Maximum) : Spec.Default;
}

export function WriteChannel(P, Layer, Channel, Quantity) {
  const Spec = Domain(Channel);
  let Q = Quantity;
  if (Spec.Type === "scalar") Q = Clamp(+Quantity, Spec.Minimum, Spec.Maximum);
  else if (Spec.Type === "colour") { if (!HEX.test(Quantity)) return P; Q = Quantity.toLowerCase(); }
  else if (!Array.isArray(Quantity) || Quantity.length !== 3 || !Quantity.every(Number.isFinite)) return P;
  return WriteParameter(P, ChannelAddress(Layer, Channel), Q);
}

// ------------------------------------------------------------------------------------------------ sources
export function ChannelSource(P, Layer, Channel) {
  const Address = ResolveAddress(P, ChannelAddress(Layer, Channel));
  return P.Authoring.Sources[Address] || { Mode: "value" };
}

export function DeclareField(P, Procedure, Name, Category = "Layer field") {
  const Next = structuredClone(P), Identity = Uuid();
  const Keys = ["scale", "seed", "angle", "amount", ...(Procedure.startsWith("camouflage") ? ["colour0", "colour1", "colour2", "colour3", "softness", "pixelSize"] : [])];
  Next.Authoring.Generators.push({ Identity, Name: Name.slice(0, 80), Category: Category.slice(0, 60), Procedure, Enabled: true, Coded: true,
    Inputs: Keys.map((K) => `field:${Identity}:${K}`), Outputs: ["colour", "roughness", "metallic", "normal", "coverage"] });
  if (Procedure.startsWith("camouflage")) {
    CamouflagePalette.forEach((C, I) => { Next.Authoring.Inputs[`field:${Identity}:colour${I}`] = C; });
    Next.Authoring.Inputs[`field:${Identity}:softness`] = 0.012;
    Next.Authoring.Inputs[`field:${Identity}:pixelSize`] = 4;
  }
  for (const K of FIELD_KNOBS) Next.Authoring.Inputs[`field:${Identity}:${K.Key}`] = K.Default;
  return { P: Next, Identity };
}

function DefaultStops(Channel) {
  const Spec = CHANNEL[Channel];
  return Spec.Type === "colour" ? ["#0b0b0b", "#e8c27a"] : ["#0b0b0b", "#e8e8e8"];
}

export function SetSourceMode(P, Layer, Channel, Kind, Shape) {
  const Address = ResolveAddress(P, ChannelAddress(Layer, Channel));
  const Current = P.Authoring.Sources[Address] || {};
  if (Kind === "value") {
    const Next = structuredClone(P);
    delete Next.Authoring.Sources[Address];
    return Next;
  }
  let Next = P;
  const Base = { Stops: Current.Stops || DefaultStops(Channel), Direct: Current.Direct ?? false };
  let Source;
  if (Kind === "field") {
    let Generator = Current.Generator && P.Authoring.Generators.find((G) => G.Identity === Current.Generator && G.Coded)?.Identity;
    if (!Generator) ({ P: Next, Identity: Generator } = DeclareField(P, "noise", `${Layer.Name} ${Channel}`));
    Source = { Mode: "field", Generator, ...Base };
  } else if (Kind === "ramp") {
    const Mode = RAMP_SHAPES.includes(Shape) ? Shape : RAMP_SHAPES.includes(Current.Mode) ? Current.Mode : "linear";
    Source = { Mode, ...Base, Angle: Number.isFinite(Current.Angle) ? Current.Angle : 0 };
  } else if (Kind === "texture") {
    Source = { Mode: "texture", ...Base, ...(Current.Texture ? { Texture: Current.Texture } : {}) };
  } else throw Error(`Unknown source kind ${Kind}.`);
  Next = structuredClone(Next);
  // Keep a field's generator reference when temporarily switching away, so returning to Field restores it.
  if (Kind !== "field" && Current.Generator) Source.Generator = Current.Generator;
  Next.Authoring.Sources[Address] = Source;
  return Next;
}

export function PatchSource(P, Layer, Channel, Patch) {
  const Address = ResolveAddress(P, ChannelAddress(Layer, Channel));
  if (!P.Authoring.Sources[Address]) return P;
  const Next = structuredClone(P), Source = Next.Authoring.Sources[Address];
  if (Patch.Stops) {
    const Stops = Patch.Stops.filter((S) => HEX.test(S)).slice(0, 8);
    if (Stops.length >= 2) Source.Stops = Stops.map((S) => S.toLowerCase());
  }
  if (Patch.Direct !== undefined) Source.Direct = !!Patch.Direct;
  if (Patch.Angle !== undefined && Number.isFinite(+Patch.Angle)) Source.Angle = Clamp(+Patch.Angle, -180, 180);
  if (Patch.Texture !== undefined) {
    if (Patch.Texture === null) delete Source.Texture;
    else { const T = normalizeTextureSource(Patch.Texture); if (!T) throw Error("Invalid embedded channel image."); Source.Texture = T; }
  }
  return Next;
}

export function SetGeneratorProcedure(P, GeneratorId, Procedure) {
  if (!GeneratorDefinitions.some((D) => D.identity === Procedure)) throw Error(`Unknown generator ${Procedure}.`);
  const Next = structuredClone(P), G = Next.Authoring.Generators.find((E) => E.Identity === GeneratorId);
  if (!G) return P;
  G.Procedure = Procedure;
  const Keys = ["scale", "seed", "angle", "amount", ...(Procedure.startsWith("camouflage") ? ["colour0", "colour1", "colour2", "colour3", "softness", "pixelSize"] : [])];
  G.Inputs = Keys.map((K) => `field:${G.Identity}:${K}`);
  if (Procedure.startsWith("camouflage")) {
    CamouflagePalette.forEach((C, I) => { Next.Authoring.Inputs[`field:${G.Identity}:colour${I}`] ??= C; });
    Next.Authoring.Inputs[`field:${G.Identity}:softness`] ??= 0.012;
    Next.Authoring.Inputs[`field:${G.Identity}:pixelSize`] ??= 4;
  }
  return Next;
}

export function FieldInput(P, GeneratorId, Key) {
  const V = P.Authoring.Inputs[`field:${GeneratorId}:${Key}`];
  if (/^colour\d$/.test(Key)) return HEX.test(V) ? V : CamouflagePalette[+Key.slice(6)] || "#808080";
  const Knob = FIELD_KNOBS.find((K) => K.Key === Key);
  return Number.isFinite(V) ? V : Knob ? Knob.Default : 0;
}

export function WriteFieldInput(P, GeneratorId, Key, Quantity) {
  const Knob = FIELD_KNOBS.find((K) => K.Key === Key);
  const Q = Knob ? Clamp(+Quantity, Knob.Minimum, Knob.Maximum) : Quantity;
  return WriteParameter(P, `field:${GeneratorId}:${Key}`, Q);
}

// ------------------------------------------------------------------------------------------------ strata
export function FindLayer(P, Identity) { return P.Authoring.Layers.find((L) => L.Identity === Identity); }

export function PatchLayer(P, Identity, Patch) {
  const Next = structuredClone(P), L = FindLayer(Next, Identity);
  if (!L) return P;
  if (Patch.Name !== undefined) L.Name = String(Patch.Name).replace(/[\u0000-\u001f]/g, "").slice(0, 80) || "Stratum";
  if (Patch.Enabled !== undefined) L.Enabled = !!Patch.Enabled;
  return Next;
}

export function SetLayerChannels(P, Identity, Channels) {
  const Next = structuredClone(P), L = FindLayer(Next, Identity);
  if (!L) return P;
  const Ordered = CHANNELS.map((C) => C.Key).filter((K) => Channels.includes(K));
  L.Channels = Ordered.length ? Ordered : ["colour"];
  return Next;
}

export function AddChannel(P, Identity, Channel) {
  const L = FindLayer(P, Identity);
  if (!L || L.Channels.includes(Channel) || !CHANNEL[Channel]) return P;
  return SetLayerChannels(P, Identity, [...L.Channels, Channel]);
}

export function RemoveChannel(P, Identity, Channel) {
  const L = FindLayer(P, Identity);
  if (!L || !L.Channels.includes(Channel) || L.Channels.length <= 1) return P;
  return SetLayerChannels(P, Identity, L.Channels.filter((C) => C !== Channel));
}

export function AddDetailLayer(P) {
  if (P.Authoring.Layers.length >= 16) return { P, Identity: null };
  const Next = structuredClone(P), Identity = Uuid();
  const Count = Next.Authoring.Layers.filter((L) => L.Model === "detail").length + 1;
  // Detail strata sit above the surface body, below coats/flakes (stack is top → bottom).
  const SurfaceIndex = Next.Authoring.Layers.findIndex((L) => L.Model === "surface");
  Next.Authoring.Layers.splice(SurfaceIndex < 0 ? 0 : SurfaceIndex, 0, { Identity, Name: `Detail ${Count}`, Model: "detail", Enabled: true, Channels: ["colour", "roughness", "coverage"] });
  Next.Authoring.Inputs[`layer:${Identity}:coverage`] = 0.5;
  return { P: Next, Identity };
}

export function RemoveLayer(P, Identity) {
  const L = FindLayer(P, Identity);
  if (!L || L.Model !== "detail") return P;
  const Next = structuredClone(P);
  Next.Authoring.Layers = Next.Authoring.Layers.filter((E) => E.Identity !== Identity);
  const Prefix = `layer:${Identity}:`;
  for (const K of Object.keys(Next.Authoring.Inputs)) if (K.startsWith(Prefix)) delete Next.Authoring.Inputs[K];
  for (const K of Object.keys(Next.Authoring.Sources)) if (K.startsWith(Prefix)) delete Next.Authoring.Sources[K];
  return Next;
}

export function ApplyDetailPreset(P, Identity, PresetId) {
  const L = FindLayer(P, Identity), Preset = DETAIL_PRESETS.find((E) => E.Id === PresetId);
  if (!L || !Preset) return P;
  let Next = L.Channels.includes("colour") ? P : AddChannel(P, Identity, "colour");
  Next = SetSourceMode(Next, FindLayer(Next, Identity), "colour", "field");
  const Source = ChannelSource(Next, FindLayer(Next, Identity), "colour");
  Next = SetGeneratorProcedure(Next, Source.Generator, Preset.Id);
  return PatchSource(Next, FindLayer(Next, Identity), "colour", { Stops: Preset.Stops });
}

// ------------------------------------------------------------------------------------------------ sampling (previews)
export function HexRgb(Hex) {
  const H = HEX.test(Hex) ? Hex.slice(1) : "808080";
  return [0, 2, 4].map((O) => parseInt(H.slice(O, O + 2), 16));
}
export function RgbHex([R, G, B]) {
  return "#" + [R, G, B].map((V) => Math.round(Clamp(V, 0, 255)).toString(16).padStart(2, "0")).join("");
}
export function StopsColour(Stops, T) {
  const S = Stops.length >= 2 ? Stops : ["#000000", "#ffffff"], X = Clamp(T) * (S.length - 1), I = Math.min(S.length - 2, Math.floor(X)), F = X - I;
  const A = HexRgb(S[I]), B = HexRgb(S[I + 1]);
  return [A[0] + (B[0] - A[0]) * F, A[1] + (B[1] - A[1]) * F, A[2] + (B[2] - A[2]) * F];
}

// Colour of the source at UV (0..1).  Field contrast pivots around 0.5; camouflage maps bands onto its own palette.
export function SampleSource(P, Source, U, V) {
  const X = U - 0.5, Y = V - 0.5;
  if (Source.Mode === "field") {
    const G = P.Authoring.Generators.find((E) => E.Identity === Source.Generator);
    if (!G) return [128, 128, 128];
    const In = (K) => FieldInput(P, G.Identity, K);
    const A = (In("angle") * Math.PI) / 180, C = Math.cos(A), S = Math.sin(A);
    const Settings = { scale: In("scale"), seed: In("seed"), softness: P.Authoring.Inputs[`field:${G.Identity}:softness`] ?? 0.012, pixelSize: P.Authoring.Inputs[`field:${G.Identity}:pixelSize`] ?? 4, colourCount: 4 };
    let T = SampleGenerator(G.Procedure, Settings, X * C - Y * S, X * S + Y * C);
    T = Clamp(0.5 + (T - 0.5) * In("amount"));
    if (G.Procedure.startsWith("camouflage")) {
      const Palette = [0, 1, 2, 3].map((I) => In(`colour${I}`));
      return HexRgb(Palette[Math.min(3, Math.round(T * 3))]);
    }
    return StopsColour(Source.Stops || ["#000000", "#ffffff"], T);
  }
  if (RAMP_SHAPES.includes(Source.Mode)) {
    const A = ((Source.Angle || 0) * Math.PI) / 180;
    let T;
    if (Source.Mode === "linear") T = X * Math.cos(A) + Y * Math.sin(A) + 0.5;
    else if (Source.Mode === "radial") T = Math.hypot(X, Y) * 2;
    else T = ((Math.atan2(Y, X) - A) / (Math.PI * 2) + 1) % 1;
    return StopsColour(Source.Stops || ["#000000", "#ffffff"], T);
  }
  return [128, 128, 128];
}

// CSS approximation for ramps (cheap swatches in the channel list; the editor canvas uses SampleSource).
export function RampCss(Source) {
  const Stops = (Source.Stops || ["#000000", "#ffffff"]).join(", "), A = Source.Angle || 0;
  if (Source.Mode === "radial") return `radial-gradient(circle, ${Stops})`;
  if (Source.Mode === "conic") return `conic-gradient(from ${A + 90}deg, ${Stops})`;
  return `linear-gradient(${A + 90}deg, ${Stops})`;
}

// ------------------------------------------------------------------------------------------------ catalog
// A short, varied slice of the TextureStudio Material workspace catalog (materials.js / animatedVfxCatalog.js) so each
// stratum model and source kind shows up at least once.
export const CATALOG = Object.freeze([
  { id: "derez-lattice-dissolve-controlvehicle", name: "Derez Lattice Dissolve (ControlVehicle)", category: "Animated & VFX", label: "ANIMATED 16³ LATTICE · HMI DEREZ",
    type: 47, color: "#090c11", secondaryColor: "#1ee6ff", roughness: 0.08, metalness: 0.34, coat: 1, coatRoughness: 0.04, coatIor: 1.5, detailScale: 7.5, grain: 0.65,
    emissionColor: "#1ee6ff", emissionStrength: 2.45,
    Author: (P) => {
      let { P: N, Identity } = DeclareField(P, "checker", "Lattice clock", "Animated fields");
      N.Authoring.Inputs[`field:${Identity}:scale`] = 16;
      N.Authoring.Sources.emissionColor = { Mode: "field", Generator: Identity, Stops: ["#06080c", "#1ee6ff", "#ffffff"], Direct: false };
      N.Authoring.Sources.roughness = { Mode: "radial", Stops: ["#141414", "#5a5a5a"], Direct: false, Angle: 0 };
      return N;
    } },
  { id: "candy-crimson", name: "Candy Crimson", category: "Paint", label: "CANDY METALLIC",
    type: 0, color: "#8b202a", roughness: 0.21, metalness: 0.81, depth: 0.82, flakes: 0.55, flakeScale: 38, flakeTilt: 0.32, coat: 1, coatRoughness: 0.06, coatIor: 1.52, orangePeel: 0.18,
    colors: ["#ee685e", "#eab870", "#c985c8", "#8da1e3", "#f2b6b0"] },
  { id: "brushed-titanium", name: "Brushed Titanium", category: "Metal", label: "DIRECTIONAL BRUSHED METAL",
    type: 1, color: "#858681", roughness: 0.38, metalness: 1, coat: 0.2, coatRoughness: 0.25, anisotropy: 0.72, anisotropyRotation: 0.25, detailScale: 42, grain: 0.4,
    Author: (P) => {
      let { P: N, Identity } = DeclareField(P, "stripes", "Brush grain", "Relief fields");
      N.Authoring.Inputs[`field:${Identity}:scale`] = 48;
      N.Authoring.Inputs[`field:${Identity}:amount`] = 0.6;
      N.Authoring.Sources.roughness = { Mode: "field", Generator: Identity, Stops: ["#4a4a4a", "#7c7c7c"], Direct: false };
      return N;
    } },
  { id: "molten-magma-crust-animated", name: "Molten Magma Crust", category: "Animated & VFX", label: "PAHOEHOE BASALT · BLACKBODY FISSURES",
    type: 48, color: "#1b1918", roughness: 0.86, metalness: 0.04, coat: 0.06, coatRoughness: 0.52, detailScale: 2.1, grain: 0.92, emissionColor: "#d93b04", emissionStrength: 2.75,
    Author: (P) => {
      let { P: N, Identity } = DeclareField(P, "cells", "Fissure cells", "Structural fields");
      N.Authoring.Inputs[`field:${Identity}:scale`] = 6;
      N.Authoring.Sources.emissionColor = { Mode: "field", Generator: Identity, Stops: ["#ffd26a", "#d93b04", "#1b1918", "#1b1918"], Direct: false };
      N.Authoring.Sources.reliefHeight = { Mode: "field", Generator: Identity, Stops: ["#000000", "#ffffff"], Direct: false };
      return N;
    } },
  { id: "woodland-camouflage-fabric-smooth", name: "Woodland Camouflage Fabric · Smooth", category: "Fabric", label: "PROCEDURAL CAMOUFLAGE · WOVEN CLOTH",
    type: 4, color: "#566044", roughness: 0.86, metalness: 0, coat: 0, detailScale: 68, grain: 0.7, sheen: 0.2, sheenRoughness: 0.8, sheenColor: "#d9d2b8",
    Author: (P) => {
      let { P: N, Identity } = DeclareField(P, "camouflage-smooth", "Smooth woodland camouflage", "Camouflage");
      N.Authoring.Inputs[`field:${Identity}:scale`] = 4;
      N.Authoring.Sources.color = { Mode: "field", Direct: true, Generator: Identity };
      return N;
    } },
]);

// Stratum declaration, after TextureStudio's DeclareMaterialAuthoring (stack order is top → bottom).
export function DeclareAuthoring(P) {
  const Surface = { Identity: Uuid(), Name: P.type === 0 ? "Paint body" : "Surface body", Model: "surface", Enabled: true,
    Channels: CHANNELS.map((C) => C.Key).filter((K) => K !== "coverage") };
  const Layers = [Surface];
  if (P.type === 0) Layers.unshift({ Identity: Uuid(), Name: "Metallic flakes", Model: "flakes", Enabled: true, Channels: ["colour", "roughness", "metallic", "normal", "coverage"] });
  if (P.type === 0 || P.coat > 0) Layers.unshift({ Identity: Uuid(), Name: "Clearcoat", Model: "coat", Enabled: true, Channels: ["coverage", "roughness", "ior", "normal"] });
  return { Version: 2, Layers, Generators: [], Variables: [], Links: {}, Inputs: {}, Sources: {}, Designer: {} };
}

export function CreateMaterial(Id) {
  const Entry = CATALOG.find((E) => E.id === Id) || CATALOG[0];
  const { Author, ...Flat } = Entry;
  let P = { ...structuredClone(Flat), ior: Flat.ior ?? 1.5 };
  P.Authoring = DeclareAuthoring(P);
  if (P.type === 0) {
    const Flakes = P.Authoring.Layers.find((L) => L.Model === "flakes");
    P.Authoring.Inputs["flake-output:coverage"] = P.flakes ?? 0.5;
    P.Authoring.Inputs["flake-output:colour"] = P.colors?.[0] || "#ffffff";
    P.Authoring.Inputs["flake-output:metallic"] = 1;
    P.Authoring.Inputs["flake-output:roughness"] = 0.18;
    if (Flakes) P.Authoring.Sources["flake-output:colour"] = { Mode: "radial", Stops: P.colors.slice(0, 4), Direct: false, Angle: 0 };
  }
  if (Author) P = Author(P);
  return Validate(P);
}

// ------------------------------------------------------------------------------------------------ validation
// The same structural rules as TextureStudio's NormalizeMaterialAuthoring (subset relevant to this card) so documents that
// pass here also load there.  Returns the document; throws on anything malformed.
export function Validate(P) {
  if (!P || typeof P !== "object" || typeof P.name !== "string") throw Error("Material needs a name.");
  const A = P.Authoring;
  if (!A || A.Version !== 2 || !Array.isArray(A.Layers) || !A.Layers.length || A.Layers.length > 16 || !Array.isArray(A.Generators) || A.Generators.length > 32) throw Error("Invalid material authoring document.");
  const Tokens = new Set();
  const Token = (Id) => { if (typeof Id !== "string" || !/^[a-f\d-]{36}$/i.test(Id) || Tokens.has(Id)) throw Error("Invalid or duplicate authoring identity."); Tokens.add(Id); };
  for (const L of A.Layers) {
    Token(L.Identity);
    if (typeof L.Name !== "string" || L.Name.length > 80 || !MODELS[L.Model] || typeof L.Enabled !== "boolean" || !Array.isArray(L.Channels) || !L.Channels.length || new Set(L.Channels).size !== L.Channels.length || L.Channels.some((C) => !CHANNEL[C])) throw Error("Invalid PBR layer.");
  }
  for (const G of A.Generators) {
    Token(G.Identity);
    if (typeof G.Name !== "string" || G.Name.length > 80 || typeof G.Enabled !== "boolean" || !Array.isArray(G.Inputs) || (G.Coded && !GeneratorDefinitions.some((D) => D.identity === G.Procedure))) throw Error("Invalid field declaration.");
  }
  for (const Box of [A.Inputs, A.Sources, A.Designer]) if (!Box || typeof Box !== "object" || Array.isArray(Box)) throw Error("Invalid authoring parameter index.");
  const AddressValid = (K) => /^[a-zA-Z0-9:-]{1,150}$/.test(K) && !["__proto__", "constructor", "prototype"].includes(K);
  for (const [K, S] of Object.entries(A.Sources)) {
    if (!AddressValid(K) || !S || !STORED_MODES.includes(S.Mode)) throw Error("Invalid channel source.");
    if (S.Stops && (!Array.isArray(S.Stops) || S.Stops.length < 2 || S.Stops.length > 8 || S.Stops.some((C) => !HEX.test(C)))) throw Error("Invalid channel colour ramp.");
    if (S.Mode === "field" && !A.Generators.some((G) => G.Identity === S.Generator && G.Coded)) throw Error("Missing coded field instance.");
    if (S.Texture && !normalizeTextureSource(S.Texture)) throw Error("Invalid embedded channel image.");
  }
  for (const K of Object.keys(A.Inputs)) if (!AddressValid(K)) throw Error("Invalid field input.");
  return P;
}

export function Load(Text) {
  const Raw = typeof Text === "string" ? JSON.parse(Text) : Text;
  const P = Raw?.schema === "alloy.material.v6" ? Raw.material : Raw;
  return Validate(structuredClone(P));
}

// ------------------------------------------------------------------------------------------------ summaries
export function Summary(P) {
  const Layers = P.Authoring.Layers;
  const Authored = Object.values(P.Authoring.Sources).length;
  return {
    Roughness: Clamp(+(P.roughness ?? 0.5), 0, 1),
    Metalness: Clamp(+(P.metalness ?? 0), 0, 1),
    Enabled: Layers.filter((L) => L.Enabled).length,
    Total: Layers.length,
    Channels: new Set(Layers.flatMap((L) => L.Channels)).size,
    Authored,
  };
}

export function ChannelReadout(P, Layer, Channel) {
  const Spec = CHANNEL[Channel], Source = ChannelSource(P, Layer, Channel), Kind = SourceKind(Source.Mode);
  if (Kind === "field") {
    const G = P.Authoring.Generators.find((E) => E.Identity === Source.Generator);
    return { Kind, Text: (GeneratorDefinitions.find((D) => D.identity === G?.Procedure)?.label || "Field").replace("Military camouflage · ", "Camo · ") };
  }
  if (Kind === "ramp") return { Kind, Text: `${Source.Mode[0].toUpperCase()}${Source.Mode.slice(1)} · ${(Source.Stops || []).length}` };
  if (Kind === "texture") return { Kind, Text: Source.Texture ? `${Source.Texture.width}×${Source.Texture.height}` : "No image" };
  if (Kind === "pattern") return { Kind, Text: "Pattern" };
  const V = ReadChannel(P, Layer, Channel);
  if (Spec.Type === "colour") return { Kind, Text: V.toUpperCase() };
  if (Spec.Type === "vector") return { Kind, Text: V.every((C, I) => C === [0, 0, 1][I]) ? "Flat +Z" : V.map((C) => C.toFixed(2)).join(" ") };
  const Span = Spec.Maximum - Spec.Minimum;
  return { Kind, Text: Span > 100 ? `${Math.round(V)}${Spec.Unit ? " " + Spec.Unit : ""}` : V.toFixed(2) };
}

// ------------------------------------------------------------------------------------------------ export
function HexLinear(Hex) {
  return HexRgb(Hex).map((C) => { const S = C / 255; return S <= 0.04045 ? S / 12.92 : Math.pow((S + 0.055) / 1.055, 2.4); });
}

// Frontier .material TOML — same layout as TextureStudio's exportMaterialTOML, but strata are emitted only when enabled.
export function ExportToml(P) {
  const Enabled = (Model) => P.Authoring.Layers.some((L) => L.Model === Model && L.Enabled);
  const Rgb = HexLinear(P.color || "#808080");
  const Lines = [
    "Format = 1",
    `Name = ${JSON.stringify(String(P.name || "Untitled Material"))}`,
    "",
    "[[Strata]]",
    `Category = ${(P.translucency ?? 0) > 0.1 ? '"Transmissive"' : '"Opaque"'}`,
    `Albedo = [${Rgb.map((V) => V.toFixed(6)).join(", ")}]`,
    `Roughness = ${Number(P.roughness ?? 0.5).toFixed(4)}`,
    `Metallic = ${Number(P.metalness ?? 0).toFixed(4)}`,
    `Ior = ${Number(P.ior ?? 1.5).toFixed(4)}`,
    "Coverage = 1.0",
    `Anisotropy = ${Number(P.anisotropy ?? 0).toFixed(4)}`,
  ];
  if (Enabled("coat") && Number(P.coat ?? 0) > 0.01)
    Lines.push("", "[[Strata]]", 'Category = "Coating"', "Albedo = [1.0, 1.0, 1.0]", `Roughness = ${Number(P.coatRoughness ?? 0.08).toFixed(4)}`, "Metallic = 0.0", `Ior = ${Number(P.coatIor ?? 1.5).toFixed(4)}`, `Coverage = ${Number(P.coat).toFixed(4)}`);
  if (Enabled("flakes")) {
    const Palette = (P.colors || ["#ffffff"]).map((C, I, All) => { const L = HexLinear(C); return `[${L.map((V) => V.toFixed(6)).join(", ")}, ${(All.length > 1 ? I / (All.length - 1) : 0).toFixed(3)}]`; });
    Lines.push("", "[AutomotivePaint]", "Enabled = true", "Layers = 3", 'ColourMode = "Palette"', `Distribution = [${Number(P.flakes ?? 0).toFixed(3)}, ${Math.round((P.flakeSize ?? 0.4) * 1000)}, 1, ${Number(P.depth ?? 0.5).toFixed(3)}]`, `Palette = [${Palette.join(", ")}]`);
  }
  if (Number(P.emissionStrength ?? 0) > 0) {
    const E = HexLinear(P.emissionColor || "#000000");
    Lines.push("", "[Emission]", `Colour = [${E.map((V) => V.toFixed(6)).join(", ")}]`, `Strength = ${Number(P.emissionStrength).toFixed(4)}`);
  }
  return Lines.join("\n") + "\n";
}

export function ExportJson(P) {
  return JSON.stringify({ schema: "alloy.material.v6", version: 6, material: P }, null, 2);
}

export const Slug = (Name) => (Name || "material").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "material";
