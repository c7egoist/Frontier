// ToolModel.js — the per-tool studios (pure data, no DOM).
//
// Every paint tool has its own dedicated studio, laid out exactly like the Brush Studio: a section list on the left and
// that section's settings beside it.  STUDIOS[tool].Sections names which groups each section shows; the paint tool's
// studio *is* the Brush Studio (its brush sections come from BrushModel.SECTIONS, plus a Colour section here).
//
// Every paint tool on the pad's rail opens its own Project Zero popup.  A popup is described the same way the Brush
// Studio sections are — groups of typed fields — so one renderer draws both.  Fields whose key starts with "@" edit the
// active brush (brush.values["sec.key"]); every other key is the tool's own state (Tools[tool][key]).
//
//   TOOLS                 rail order: { Id, Label, Glyph, Key, Hint, Verb, Groups[{ Title, Hint?, When?, Fields }] }
//   TOOL                  by id
//   CreateTools()         default state for every tool
//   NormaliseTools(raw)   coerce imported / stored state
//   SetToolValue(Tools, Tool, Key, Value)
//   ToolFields(Tool)      flat field list (for checks)
//
// Field types beyond the brush ones: text (textarea) · stops (colour ramp) · actions (button row) · brushcard (the brush
// the tool paints with) · colours (primary / secondary / swatches / recent) · sample (eyedropper readout) ·
// history (sampled colours) · nudge (move arrows) · instrument (eraser catalogue picker) · readout (status line).

import { PAINT_TOOLS, COLOUR_GRADIENT_PRESETS } from "./BrushModel.js";
import { SHAPES, GRAINS, BLEND_MODES } from "./BrushModel.js";
import { PAINT_CHANNELS, BLEND_CHANNEL, LinkedStack } from "../MaterialInspector/ChannelStack.js";

const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
const HEX = /^#[0-9a-f]{6}$/i;
const S = (K, L, Min, Max, Def, Hint = "", Extra = {}) => ({ K, L, T: "slider", Min, Max, Step: Extra.Step ?? 1, Unit: Extra.Unit ?? "%", Def, Hint, ...Extra });
const W = (K, L, Def, Hint = "", Extra = {}) => ({ K, L, T: "switch", Def, Hint, ...Extra });
const G = (K, L, Opts, Def, Hint = "", Extra = {}) => ({ K, L, T: "seg", Opts, Def, Hint, ...Extra });
const Sel = (K, L, Opts, Def, Hint = "", Extra = {}) => ({ K, L, T: "select", Opts, Def, Hint, ...Extra });
const B = (K, Extra = {}) => ({ K: `@${K}`, T: "brush", ...Extra });   // brush-bound: label / type come from the brush schema
const Act = (Items) => ({ K: `actions:${Items.map((I) => I[1]).join("+")}`, T: "actions", Items });
const Has = (Ch) => (V) => (V.channels || []).includes(Ch);

export const ERASERS = PAINT_TOOLS.filter((T) => T.key === "eraser").map((T) => T.id);
export const FONTS = Object.freeze([
  { Id: "sans", Label: "DM Sans", Css: '"DM Sans", system-ui, sans-serif' },
  { Id: "serif", Label: "Serif", Css: 'Georgia, "Times New Roman", serif' },
  { Id: "mono", Label: "Mono", Css: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { Id: "condensed", Label: "Condensed", Css: '"Arial Narrow", "Roboto Condensed", sans-serif-condensed, sans-serif' },
  { Id: "display", Label: "Display", Css: 'Impact, "Haettenschweiler", "Arial Black", sans-serif' },
  { Id: "script", Label: "Script", Css: '"Brush Script MT", "Segoe Script", cursive' },
]);

// ------------------------------------------------------------------------------------------------ channel cards
// Every tool that writes paint channels shows them as a ChannelStack (MaterialInspector/ChannelStack.js): switch a
// channel on or off, open it, and set that channel's own card for this tool.  The per-tool cards differ — a fill writes
// a value at an opacity, an eraser removes at a strength, a gradient ramps from a start to an end value, Move only needs
// to know which channels travel.  Keys the pad already read (channels / roughness / metalness / height / emissive) stay
// the source of truth through the stack's Link; everything else lives in the tool's "stack" store.
const VALUE = [
  { K: "value", L: "Value", T: "slider", For: ["scalar"], Def: (Ch) => Ch.Def },
  { K: "value", L: "Colour", T: "colour", For: ["colour"], Skip: ["albedo", "emissive"], Def: (Ch) => Ch.Def },
  { K: "strength", L: "Glow strength", T: "slider", Only: ["emissive"], Def: 40 },
];
const Note = (Text, Only = ["albedo"]) => ({ K: `note:${Only.join("+")}`, T: "note", Only, Text });
const NoAlbedo = (F) => ({ ...F, Skip: [...(F.Skip || []), "albedo"] });
export const TOOL_CARDS = Object.freeze({
  fill: [...VALUE.map(NoAlbedo), NoAlbedo({ K: "opacity", L: "Opacity", T: "slider", Def: 100 }), NoAlbedo({ K: "blend", L: "Blend", T: "select", Opts: BLEND_CHANNEL, Def: "Normal" }), Note("Colour, opacity and blend come from the Source section.")],
  stamp: [NoAlbedo({ K: "source", L: "Value from", T: "seg", For: ["scalar"], Opts: ["Flat", "Decal map"], Def: "Flat", Hint: "Decal map: the tint's brightness drives the value" }), ...VALUE.map(NoAlbedo), NoAlbedo({ K: "opacity", L: "Opacity", T: "slider", Def: 100 }), NoAlbedo({ K: "blend", L: "Blend", T: "select", Opts: BLEND_CHANNEL, Def: "Normal" }), Note("Tint, opacity and blend come from the Look section.")],
  text: [...VALUE.map(NoAlbedo).map((F) => (F.K === "value" && F.T === "slider" ? { ...F, Def: (Ch) => (Ch.Id === "height" ? 35 : Ch.Def) } : F)), NoAlbedo({ K: "opacity", L: "Opacity", T: "slider", Def: 100 }), Note("Colour and opacity come from the Look section.")],
  gradient: [
    { K: "start", L: "Start value", T: "slider", For: ["scalar"], Ranged: true, Def: (Ch) => Math.max(Ch.Min, 0) },
    { K: "end", L: "End value", T: "slider", For: ["scalar"], Ranged: true, Def: (Ch) => Math.min(Ch.Max, 100) },
    NoAlbedo({ K: "opacity", L: "Opacity", T: "slider", Def: 100 }),
    Note("Albedo uses the colour stops."), Note("Colour channels follow the colour stops.", ["specularColor", "sheenColor", "attenuationColor", "emissive"]),
  ],
  erase: [
    { K: "strength", L: "Strength", T: "slider", Def: 100, Hint: "Share of the eraser's strength" },
    { K: "edge", L: "Edge", T: "seg", Opts: ["Inherit", "Soft", "Hard"], Def: "Inherit", Hint: "Inherit follows the Tip section" },
  ],
  smudge: [{ K: "strength", L: "Strength", T: "slider", Def: 100, Hint: "Share of the smudge strength" }],
  move: [],
});
const PBR_LINK = { on: "channels", "roughness.value": "roughness", "metalness.value": "metalness", "height.value": "height", "emissive.strength": "emissive" };
const FIVE = ["albedo", "roughness", "metalness", "height", "emissive"];
export const TOOL_STACKS = Object.freeze({
  fill: LinkedStack({ Key: "stack", Link: PBR_LINK, Card: TOOL_CARDS.fill, On: ["albedo", "roughness"] }),
  stamp: LinkedStack({ Key: "stack", Link: PBR_LINK, Card: TOOL_CARDS.stamp, On: ["albedo", "roughness"] }),
  text: LinkedStack({ Key: "stack", Link: PBR_LINK, Card: TOOL_CARDS.text, On: ["albedo", "roughness"] }),
  gradient: LinkedStack({ Key: "stack", Card: TOOL_CARDS.gradient, On: ["albedo"] }),
  erase: LinkedStack({ Key: "stack", Link: { on: "channels" }, Card: TOOL_CARDS.erase, On: FIVE }),
  smudge: LinkedStack({ Key: "stack", Card: TOOL_CARDS.smudge, On: FIVE }),
  move: LinkedStack({ Key: "stack", Card: TOOL_CARDS.move, On: FIVE }),
});
const Stack = (Tool, L = "Channels") => ({ K: "stack", L, T: "stack", Stack: TOOL_STACKS[Tool], Def: TOOL_STACKS[Tool].Store({}) });
// The linked keys (never drawn on their own; the stack shows them inside each channel card).
const LINKED = "Linked channel keys";
const Linked = (Prefix = "") => ({ Title: LINKED, When: () => false, Fields: [
  { K: "channels", L: "Channels", T: "channels", Def: ["albedo", "roughness"] },
  S("roughness", "Roughness", 0, 100, 60), S("metalness", "Metal", 0, 100, 0),
  S("height", "Relief", -100, 100, Prefix === "text" ? 35 : 15), S("emissive", "Emission", 0, 100, 40),
] });
const Pbr = (Tool) => [{ Title: "Material channels", Hint: "What this writes when texture painting", Fields: [Stack(Tool)] }, Linked(Tool)];

export const TOOLS = Object.freeze([
  { Id: "paint", Label: "Paint", Glyph: "brush", Key: "B", Verb: "Drag to paint with the active brush", Groups: [
    { Title: "Brush", Fields: [{ K: "brushcard", T: "brushcard" }] },
    { Title: "Size & opacity", Fields: [B("prop.size"), B("prop.opacity"), B("render.flow")] },
    { Title: "Colour", Fields: [{ K: "colours", T: "colours" }] },
    { Title: "Feel", Fields: [B("stab.streamline", { L: "StreamLine" }), B("pen.size", { L: "Pressure → size" }), B("dyn.jitterSize", { L: "Size jitter" }), B("shape.hardness")] },
    { Title: "Pressure curve", Fields: [B("pen.pressureCurve")] },
    { Title: "Texture painting", Fields: [B("mat.stack")] },
    { Title: "Symmetry & blend", Fields: [G("symmetry", "Symmetry", ["Off", "Vertical", "Horizontal", "Quadrant"], "Off", "Mirror strokes across the pad"), B("render.blend")] },
  ] },
  { Id: "smudge", Label: "Smudge", Glyph: "smudge", Key: "S", Verb: "Drag to push paint around", Groups: [
    { Title: "Tip", Fields: [
      W("useBrush", "Smudge with current brush", true, "Off: a soft round finger"),
      { K: "brushcard", T: "brushcard", When: (V) => V.useBrush },
      S("size", "Size", 1, 100, 26, "", { When: (V) => !V.useBrush }),
      S("hardness", "Hardness", 0, 100, 20, "", { When: (V) => !V.useBrush }),
    ] },
    { Title: "Smudge", Fields: [
      S("strength", "Strength", 1, 100, 70, "How far colour is dragged"),
      S("paint", "Finger painting", 0, 100, 0, "Mix in some of the primary colour"),
      S("streamline", "StreamLine", 0, 100, 25),
      S("spacing", "Spacing", 1, 100, 6, "Lower = smoother drag"),
    ] },
    { Title: "Channels to smudge", Hint: "Leave a channel out to keep it still", Fields: [Stack("smudge")] },
  ] },
  { Id: "erase", Label: "Erase", Glyph: "eraser", Key: "E", Verb: "Drag to erase", Groups: [
    { Title: "Eraser", Fields: [
      W("useBrush", "Erase with current brush", false, "Procreate-style: the paint brush's tip, grain and dynamics"),
      { K: "instrument", L: "Eraser", T: "instrument", Def: ERASERS[0], Opts: ERASERS, When: (V) => !V.useBrush },
      { K: "brushcard", T: "brushcard", When: (V) => V.useBrush },
    ] },
    { Title: "Tip", Fields: [
      S("size", "Size", 1, 100, 30), S("strength", "Strength", 1, 100, 100, "Opacity of the erase"),
      S("flow", "Flow", 1, 100, 100), S("hardness", "Hardness", 0, 100, 70),
      G("edge", "Edge", ["Soft", "Hard", "Grain"], "Soft", "Grain erases through the paper texture"),
    ] },
    { Title: "Feel", Fields: [
      S("streamline", "Stabilizer", 0, 100, 20), S("pressure", "Pressure → size", 0, 100, 40),
      W("taper", "Taper ends", true),
    ] },
    { Title: "Channels to erase", Hint: "Leave a channel out to protect it", Fields: [Stack("erase")] },
    { Title: LINKED, When: () => false, Fields: [{ K: "channels", L: "Channels", T: "channels", Def: [...FIVE] }] },
  ] },
  { Id: "fill", Label: "Fill", Glyph: "fill", Key: "G", Verb: "Click to fill", Groups: [
    { Title: "Scope", Fields: [
      G("scope", "Fill", ["Region", "Similar", "All"], "Region", "Region floods connected pixels · Similar fills every matching pixel"),
      S("tolerance", "Threshold", 0, 100, 18, "How different a pixel may be", { When: (V) => V.scope !== "All" }),
      S("feather", "Feather", 0, 24, 1, "", { Unit: "px", When: (V) => V.scope !== "All" }),
      S("grow", "Grow", 0, 12, 1, "Expand into anti-aliased edges", { Unit: "px", When: (V) => V.scope !== "All" }),
    ] },
    { Title: "Source", Fields: [
      G("source", "Paint with", ["Colour", "Grain"], "Colour"),
      { K: "colour", L: "Colour", T: "colour", Def: "#d9a441" },
      { K: "grain", L: "Grain", T: "grain", Def: "canvas", When: (V) => V.source === "Grain" },
      S("grainScale", "Grain scale", 10, 400, 100, "", { When: (V) => V.source === "Grain" }),
      S("opacity", "Opacity", 1, 100, 100), Sel("blend", "Blend mode", BLEND_MODES, "Normal"),
    ] },
    ...Pbr("fill"),
  ] },
  { Id: "stamp", Label: "Stamp", Glyph: "stamp", Key: "P", Verb: "Click to stamp · drag to scatter", Groups: [
    { Title: "Stamp", Fields: [
      { K: "shape", L: "Shape", T: "shape", Def: "star" },
      G("placement", "Placement", ["Click", "Drag", "Grid"], "Click", "Grid tiles the whole pad"),
      S("spacing", "Spacing", 10, 300, 120, "", { When: (V) => V.placement !== "Click" }),
      W("align", "Align to drag", true, "", { When: (V) => V.placement === "Drag" }),
    ] },
    { Title: "Transform", Fields: [
      S("size", "Size", 8, 400, 84, "", { Unit: "px" }), S("sizeJitter", "Size jitter", 0, 100, 0),
      S("rotation", "Rotation", -180, 180, 0, "", { Unit: "°" }), S("rotationJitter", "Rotation jitter", 0, 100, 0),
      W("mirror", "Mirror", false, "Flip horizontally"),
    ] },
    { Title: "Look", Fields: [
      { K: "colour", L: "Tint", T: "colour", Def: "#46d267" },
      S("opacity", "Opacity", 1, 100, 100), S("hardness", "Hardness", 0, 100, 85),
      Sel("blend", "Blend mode", BLEND_MODES, "Normal"),
    ] },
    ...Pbr("stamp"),
  ] },
  { Id: "gradient", Label: "Gradient", Glyph: "gradient", Key: "D", Verb: "Drag across the pad to lay a gradient", Groups: [
    { Title: "Shape", Fields: [
      G("type", "Type", ["Linear", "Radial", "Conic"], "Linear"),
      G("spread", "Spread", ["Pad", "Repeat", "Reflect"], "Pad", "", { When: (V) => V.type !== "Conic" }),
    ] },
    { Title: "Colours", Fields: [
      { K: "preset", L: "Preset", T: "gradient", Def: "ember" },
      { K: "stops", L: "Stops", T: "stops", Def: ["#ff3d2e", "#ff9d3b", "#ffe38e"] },
    ] },
    { Title: "Blend", Fields: [
      S("opacity", "Opacity", 1, 100, 100), Sel("blend", "Blend mode", BLEND_MODES, "Normal"),
      G("limit", "Paint", ["Everywhere", "Painted", "Empty"], "Everywhere", "Painted keeps the gradient inside existing paint"),
    ] },
    { Title: "Material channels", Hint: "Ramp each channel from a start to an end value", Fields: [Stack("gradient")] },
    { Title: "Line", Fields: [{ K: "readout", T: "readout" }, Act([["Apply", "gradient-apply", "check", "primary"], ["Clear line", "gradient-clear", "close"]])] },
  ] },
  { Id: "text", Label: "Text", Glyph: "text", Key: "T", Verb: "Click to place text", Groups: [
    { Title: "Text", Fields: [{ K: "content", L: "Text", T: "text", Def: "Frontier" }] },
    { Title: "Type", Fields: [
      Sel("font", "Font", FONTS.map((F) => F.Id), "sans", "", { Labels: Object.fromEntries(FONTS.map((F) => [F.Id, F.Label])) }),
      G("weight", "Weight", ["300", "400", "600", "800"], "600"),
      W("italic", "Italic", false),
      G("align", "Align", ["Left", "Centre", "Right"], "Centre"),
    ] },
    { Title: "Layout", Fields: [
      S("size", "Size", 18, 160, 64, "", { Unit: "px" }), S("spacing", "Letter spacing", -10, 40, 0, "", { Unit: "px" }),
      S("lineHeight", "Line height", 80, 200, 115), S("arc", "Arc", -180, 180, 0, "Bend the line around a circle", { Unit: "°" }),
      S("rotation", "Rotation", -180, 180, 0, "", { Unit: "°" }),
    ] },
    { Title: "Look", Fields: [
      { K: "colour", L: "Colour", T: "colour", Def: "#3d6fd9" }, S("opacity", "Opacity", 1, 100, 100),
      S("outline", "Outline", 0, 12, 0, "", { Unit: "px" }),
      { K: "outlineColour", L: "Outline colour", T: "colour", Def: "#111111", When: (V) => V.outline > 0 },
    ] },
    ...Pbr("text"),
    { Title: "Place", Fields: [{ K: "readout", T: "readout" }, Act([["Apply", "text-apply", "check", "primary"], ["Cancel", "text-cancel", "close"]])] },
  ] },
  { Id: "curve", Label: "Curve", Glyph: "curve", Key: "C", Verb: "Click to add points · Enter or double-click to stroke", Groups: [
    { Title: "Brush", Fields: [{ K: "brushcard", T: "brushcard" }] },
    { Title: "Brush channels", Hint: "The curve strokes with the brush's own channel cards", Fields: [B("mat.stack")] },
    { Title: "Path", Fields: [
      G("mode", "Path", ["Smooth", "Polyline"], "Smooth"), W("closed", "Closed loop", false),
      S("smoothness", "Smoothness", 0, 100, 50, "Tension of the spline", { When: (V) => V.mode === "Smooth" }),
    ] },
    { Title: "Pressure along the path", Fields: [
      G("profile", "Profile", ["Even", "Taper", "Swell", "Fade"], "Taper"),
      S("pressure", "Pressure", 5, 100, 70),
    ] },
    { Title: "Points", Fields: [{ K: "readout", T: "readout" }, Act([["Stroke", "curve-commit", "check", "primary"], ["Undo point", "curve-undo", "undo"], ["Clear", "curve-clear", "close"]])] },
  ] },
  { Id: "move", Label: "Move", Glyph: "move", Key: "V", Verb: "Drag to move · values below fine-tune", Groups: [
    { Title: "Target", Fields: [G("target", "Move", ["Everything", "Last item"], "Everything")] },
    { Title: "Offset", Fields: [
      S("u", "U", -100, 100, 0, "Horizontal offset"), S("v", "V", -100, 100, 0, "Vertical offset"),
      { K: "nudge", T: "nudge" },
    ] },
    { Title: "Transform", Fields: [
      S("scale", "Scale", 10, 400, 100), S("rotation", "Rotation", -180, 180, 0, "", { Unit: "°" }),
      W("flipX", "Flip horizontal", false), W("flipY", "Flip vertical", false),
      G("wrap", "Edges", ["Clip", "Tile"], "Clip", "Tile wraps paint around the edges — seamless textures"),
    ] },
    { Title: "Channels to move", Hint: "Channels left out stay where they are", Fields: [Stack("move")] },
    { Title: "Commit", Fields: [Act([["Apply", "move-apply", "check", "primary"], ["Reset", "move-reset", "reset"]])] },
  ] },
  { Id: "eyedropper", Label: "Eyedropper", Glyph: "pipette", Key: "I", Verb: "Click to sample a colour", Groups: [
    { Title: "Sample", Fields: [{ K: "sample", T: "sample" }] },
    { Title: "Sampling", Fields: [
      G("size", "Area", ["Point", "3×3", "5×5", "11×11"], "3×3", "Average over a square"),
      G("target", "Send to", ["Primary", "Secondary"], "Primary"),
      G("from", "From", ["Pad", "Paint only"], "Pad", "Pad includes the paper colour under transparent areas"),
      W("returnTool", "Return to previous tool", true, "Go back after a sample"),
    ] },
    { Title: "Recent samples", Fields: [{ K: "history", T: "history", Def: [] }] },
  ] },
]);

export const TOOL = Object.freeze(Object.fromEntries(TOOLS.map((T) => [T.Id, T])));
export const ToolFields = (Tool) => TOOL[Tool].Groups.flatMap((G) => G.Fields);
const OwnFields = (Tool) => ToolFields(Tool).filter((F) => !F.K.startsWith("@") && "Def" in F);

export function CreateTools() {
  const Out = {};
  for (const T of TOOLS) Out[T.Id] = Object.fromEntries(OwnFields(T.Id).map((F) => [F.K, structuredClone(F.Def)]));
  Out.gradient.line = null;            // [[x0, y0], [x1, y1]] in pad units (0‥1)
  Out.text.at = null;                  // [x, y]
  Out.curve.points = [];               // [[x, y], …]
  Out.move.dx = 0; Out.move.dy = 0;
  Out.eyedropper.last = null;          // { Hex, A }
  return Out;
}

function Coerce(F, V) {
  switch (F.T) {
    case "slider": return Number.isFinite(+V) ? Clamp(Math.round(+V / F.Step) * F.Step, F.Min, F.Max) : F.Def;
    case "switch": return typeof V === "boolean" ? V : F.Def;
    case "seg": case "select": case "instrument": return F.Opts.includes(V) ? V : F.Def;
    case "colour": return HEX.test(V || "") ? V.toLowerCase() : F.Def;
    case "text": return typeof V === "string" ? V.slice(0, 240) : F.Def;
    case "shape": return SHAPES.some((E) => E.Id === V) ? V : F.Def;
    case "grain": return GRAINS.some((E) => E.Id === V) ? V : F.Def;
    case "gradient": return COLOUR_GRADIENT_PRESETS.some((E) => E.id === V) ? V : F.Def;
    case "channels": { const L = Array.isArray(V) ? PAINT_CHANNELS.map((C) => C.Id).filter((C) => V.includes(C)) : null; return L?.length ? L : [...F.Def]; }
    case "stack": return F.Stack.Store(V);
    case "stops": { const L = Array.isArray(V) ? V.filter((C) => HEX.test(C)).map((C) => C.toLowerCase()).slice(0, 8) : []; return L.length >= 2 ? L : [...F.Def]; }
    case "history": return Array.isArray(V) ? V.filter((C) => HEX.test(C)).slice(0, 12) : [];
    default: return V ?? F.Def;
  }
}

export function NormaliseTools(Raw = {}) {
  const Base = CreateTools();
  for (const T of TOOLS) {
    const Src = Raw[T.Id] || {};
    for (const F of OwnFields(T.Id)) Base[T.Id][F.K] = Coerce(F, Src[F.K]);
  }
  return Base;
}

export function SetToolValue(Tools, Tool, Key, Value) {
  const F = OwnFields(Tool).find((E) => E.K === Key);
  const Next = { ...Tools, [Tool]: { ...Tools[Tool], [Key]: F ? Coerce(F, Value) : Value } };
  // Choosing a gradient preset loads its stops.
  if (Tool === "gradient" && Key === "preset") { const P = COLOUR_GRADIENT_PRESETS.find((E) => E.id === Value); if (P) Next.gradient.stops = [...P.stops]; }
  return Next;
}

// Merge a patch of several keys (a channel stack write touches its store and its linked keys at once).
export function PatchTool(Tools, Tool, Patch) {
  const Own = OwnFields(Tool), Next = { ...Tools[Tool] };
  for (const [K, V] of Object.entries(Patch)) { const F = Own.find((E) => E.K === K); Next[K] = F ? Coerce(F, V) : V; }
  return { ...Tools, [Tool]: Next };
}

export const VisibleToolFields = (Group, Values, BrushValues) => Group.Fields.filter((F) => !F.When || F.When(Values, BrushValues));
export const VisibleToolGroups = (Tool, Values, BrushValues) => TOOL[Tool].Groups.filter((G) => (!G.When || G.When(Values, BrushValues)) && VisibleToolFields(G, Values, BrushValues).length);

// The pad's pressure along a constructed curve (Curve tool).
export function ProfilePressure(Profile, T, Pressure) {
  const P = Pressure / 100;
  if (Profile === "Taper") return P * Math.min(1, Math.sin(Math.PI * T) * 1.6 + 0.08);
  if (Profile === "Swell") return P * (0.25 + 0.75 * Math.sin(Math.PI * T));
  if (Profile === "Fade") return P * (1 - T * 0.9);
  return P;
}

// Catmull-Rom through the clicked points (Curve tool), returned as pad-unit samples.
export function CurvePath(Points, { Mode = "Smooth", Closed = false, Smoothness = 50 } = {}) {
  if (Points.length < 2) return Points.map((P) => [...P]);
  const Pts = Closed ? [...Points, Points[0]] : Points;
  if (Mode === "Polyline") {
    const Out = [];
    for (let I = 0; I < Pts.length - 1; I++) for (let K = 0; K < 16; K++) { const T = K / 16; Out.push([Pts[I][0] + (Pts[I + 1][0] - Pts[I][0]) * T, Pts[I][1] + (Pts[I + 1][1] - Pts[I][1]) * T]); }
    Out.push([...Pts.at(-1)]);
    return Out;
  }
  const Tension = 1 - Smoothness / 100, Out = [];
  const At = (I) => Closed ? Points[((I % Points.length) + Points.length) % Points.length] : Points[Clamp(I, 0, Points.length - 1)];
  const Segs = Closed ? Points.length : Points.length - 1;
  for (let I = 0; I < Segs; I++) {
    const P0 = At(I - 1), P1 = At(I), P2 = At(I + 1), P3 = At(I + 2);
    for (let K = 0; K < 24; K++) {
      const T = K / 24, T2 = T * T, T3 = T2 * T, S = (1 - Tension) / 2;
      const C = (A, B, C2, D) => B + (-S * A + S * C2) * T + (2 * S * A + (S - 3) * B + (3 - 2 * S) * C2 - S * D) * T2 + (-S * A + (2 - S) * B + (S - 2) * C2 + S * D) * T3;
      Out.push([C(P0[0], P1[0], P2[0], P3[0]), C(P0[1], P1[1], P2[1], P3[1])]);
    }
  }
  Out.push([...(Closed ? Points[0] : Points.at(-1))]);
  return Out;
}

// ------------------------------------------------------------------------------------------------ studios
// Icon colours: every tool and every section glyph carries its own colour (no fills behind the icons, no amber).
export const TOOL_COLOURS = Object.freeze({ paint: "#ff6b9a", smudge: "#b48cff", erase: "#ff6b5e", fill: "#4d9bff", stamp: "#46d267", gradient: "#36d3c4", text: "#f08cff", curve: "#7cc4ff", move: "#5fe0a0", eyedropper: "#ff8a5c" });
export const PALETTE = Object.freeze(["#4d9bff", "#46d267", "#ff6b9a", "#b48cff", "#36d3c4", "#ff8a5c", "#7cc4ff", "#f08cff", "#5fe0a0", "#ff6b5e", "#8f9bff", "#4fd1e8", "#c792ea", "#9aa4b2", "#e8e8e8"]);
const Sec = (Id, Label, Glyph, Hint, Groups) => ({ Id, Label, Glyph, Hint, Groups });
const About = () => Sec("about", "About", "info", "Shortcut, what changed, reset", []);
const Material = Sec("material", "Material", "material", "PBR channels this writes", ["Material channels", "Linked channel keys"]);

export const STUDIOS = Object.freeze({
  paint: { Title: "Brush Studio", Sub: "Texture-painting brush", Sections: [Sec("paint-colour", "Colour", "sphere", "Primary, secondary, swatches, symmetry", ["Colour", "Symmetry & blend"])] },
  smudge: { Title: "Smudge Studio", Sub: "Push and blend paint", Sections: [Sec("tip", "Tip", "smudge", "Finger or current brush", ["Tip"]), Sec("smudge", "Smudge", "wave", "Strength, finger painting, smoothing", ["Smudge"]), Sec("channels", "Channels", "layers", "Which channels the smudge drags", ["Channels to smudge"]), About("smudge")] },
  erase: { Title: "Eraser Studio", Sub: "Remove paint per channel", Sections: [Sec("eraser", "Eraser", "eraser", "Catalogue eraser or current brush", ["Eraser"]), Sec("tip", "Tip", "shape", "Size, strength, flow, edge", ["Tip"]), Sec("feel", "Feel", "pressure", "Stabilizer, pressure, taper", ["Feel"]), Sec("channels", "Channels", "layers", "Protect channels · per-channel strength", ["Channels to erase", "Linked channel keys"]), About("erase")] },
  fill: { Title: "Fill Studio", Sub: "Flood regions and similar colour", Sections: [Sec("scope", "Scope", "grid", "Region, similar or everything", ["Scope"]), Sec("source", "Source", "fill", "Colour or grain, opacity, blend", ["Source"]), Material, About("fill")] },
  stamp: { Title: "Stamp Studio", Sub: "Decals · click, drag or grid", Sections: [Sec("decal", "Decal", "stamp", "Shape and placement", ["Stamp"]), Sec("transform", "Transform", "move", "Size, rotation, jitter, mirror", ["Transform"]), Sec("look", "Look", "eye", "Tint, opacity, hardness, blend", ["Look"]), Material, About("stamp")] },
  gradient: { Title: "Gradient Studio", Sub: "Linear, radial and conic ramps", Sections: [Sec("shape", "Shape", "radial", "Type and spread", ["Shape"]), Sec("colours", "Colours", "gradient", "Preset and stops", ["Colours"]), Sec("blend", "Blend", "blend", "Opacity, mode, where it paints", ["Blend"]), Sec("material", "Material", "material", "Channels the ramp writes", ["Material channels"]), Sec("line", "Line", "ray", "Apply or clear the line", ["Line"]), About("gradient")] },
  text: { Title: "Text Studio", Sub: "Lettering painted into the texture", Sections: [Sec("text", "Text", "text", "What it says", ["Text"]), Sec("type", "Type", "pen", "Font, weight, italic, align", ["Type"]), Sec("layout", "Layout", "grid", "Size, spacing, arc, rotation", ["Layout"]), Sec("look", "Look", "eye", "Colour, opacity, outline", ["Look"]), Material, Sec("place", "Place", "move", "Apply or cancel", ["Place"]), About("text")] },
  curve: { Title: "Curve Studio", Sub: "Point-to-point brush strokes", Sections: [Sec("brush", "Brush", "brush", "The brush the curve strokes with", ["Brush", "Brush channels"]), Sec("path", "Path", "curve", "Smooth or polyline, closed loop", ["Path"]), Sec("pressure", "Pressure", "pressure", "Pressure along the path", ["Pressure along the path"]), Sec("points", "Points", "stroke", "Stroke, undo or clear points", ["Points"]), About("curve")] },
  move: { Title: "Move Studio", Sub: "Offset, transform and wrap paint", Sections: [Sec("target", "Target", "layers", "Everything or the last item", ["Target"]), Sec("offset", "Offset", "move", "U / V offset and nudges", ["Offset"]), Sec("transform", "Transform", "warp", "Scale, rotation, flips, edges", ["Transform"]), Sec("channels", "Channels", "layers", "Which channels move", ["Channels to move"]), Sec("commit", "Commit", "check", "Apply or reset", ["Commit"]), About("move")] },
  eyedropper: { Title: "Eyedropper Studio", Sub: "Sample colour from the pad", Sections: [Sec("sample", "Sample", "pipette", "The last colour picked", ["Sample"]), Sec("sampling", "Sampling", "sliders", "Area, target, source", ["Sampling"]), Sec("recent", "Recent", "layers", "Colours you have sampled", ["Recent samples"]), About("eyedropper")] },
});

// Settings that differ from the tool's defaults (drives edited dots, section counts and per-field reset).
let Defaults = null;
export const ToolDefault = (Tool, Key) => structuredClone((Defaults ||= CreateTools())[Tool][Key]);
export function ToolChanged(Tool, Values) {
  const Out = new Set();
  Defaults ||= CreateTools();
  for (const F of OwnFields(Tool)) if (F.T !== "history" && JSON.stringify(Values[F.K]) !== JSON.stringify(Defaults[Tool][F.K])) Out.add(F.K);
  return Out;
}
export const SectionGroups = (Tool, Section) => TOOL[Tool].Groups.filter((G) => Section.Groups.includes(G.Title));
export function ToolChangedBySection(Tool, Values) {
  const Ch = ToolChanged(Tool, Values), Out = {};
  for (const S of STUDIOS[Tool].Sections) Out[S.Id] = SectionGroups(Tool, S).flatMap((G) => G.Fields).filter((F) => Ch.has(F.K)).length;
  return Out;
}
