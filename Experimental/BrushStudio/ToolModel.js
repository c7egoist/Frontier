// ToolModel.js — the per-tool popup menus (pure data, no DOM).
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
import { SHAPES, GRAINS, BLEND_MODES, CHANNELS } from "./BrushModel.js";

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

// PBR block reused by Fill / Stamp / Text / Gradient: which channels the operation writes and the values it writes.
const Pbr = (Prefix = "") => [
  { Title: "Material channels", Hint: "What this writes when texture painting", Fields: [{ K: "channels", L: "Channels", T: "channels", Def: ["albedo", "roughness"] }] },
  { Title: "Channel values", When: (V) => V.channels.some((C) => C !== "albedo"), Fields: [
    S("roughness", "Roughness", 0, 100, 60, "", { When: Has("roughness") }),
    S("metalness", "Metal", 0, 100, 0, "", { When: Has("metalness") }),
    S("height", "Relief", -100, 100, Prefix === "text" ? 35 : 15, "Raise (+) or carve (−)", { When: Has("height") }),
    S("emissive", "Emission", 0, 100, 40, "", { When: Has("emissive") }),
  ] },
];

export const TOOLS = Object.freeze([
  { Id: "paint", Label: "Paint", Glyph: "brush", Key: "B", Verb: "Drag to paint with the active brush", Groups: [
    { Title: "Brush", Fields: [{ K: "brushcard", T: "brushcard" }] },
    { Title: "Size & opacity", Fields: [B("prop.size"), B("prop.opacity"), B("render.flow")] },
    { Title: "Colour", Fields: [{ K: "colours", T: "colours" }] },
    { Title: "Feel", Fields: [B("stab.streamline", { L: "StreamLine" }), B("pen.size", { L: "Pressure → size" }), B("dyn.jitterSize", { L: "Size jitter" }), B("shape.hardness")] },
    { Title: "Pressure curve", Fields: [B("pen.pressureCurve")] },
    { Title: "Texture painting", Fields: [B("mat.channels"), B("mat.roughness", { L: "Roughness", When: (V, Br) => Br["mat.channels"].includes("roughness") }), B("mat.metalness", { L: "Metal", When: (V, Br) => Br["mat.channels"].includes("metalness") }), B("mat.height", { L: "Relief", When: (V, Br) => Br["mat.channels"].includes("height") })] },
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
    { Title: "Channels to erase", Hint: "Leave a channel out to protect it", Fields: [{ K: "channels", L: "Channels", T: "channels", Def: ["albedo", "roughness", "metalness", "height", "emissive"] }] },
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
    ...Pbr(),
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
      { K: "colour", L: "Tint", T: "colour", Def: "#ffb238" },
      S("opacity", "Opacity", 1, 100, 100), S("hardness", "Hardness", 0, 100, 85),
      Sel("blend", "Blend mode", BLEND_MODES, "Normal"),
    ] },
    ...Pbr(),
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
      { K: "colour", L: "Colour", T: "colour", Def: "#f0f0f0" }, S("opacity", "Opacity", 1, 100, 100),
      S("outline", "Outline", 0, 12, 0, "", { Unit: "px" }),
      { K: "outlineColour", L: "Outline colour", T: "colour", Def: "#111111", When: (V) => V.outline > 0 },
    ] },
    ...Pbr("text"),
    { Title: "Place", Fields: [{ K: "readout", T: "readout" }, Act([["Apply", "text-apply", "check", "primary"], ["Cancel", "text-cancel", "close"]])] },
  ] },
  { Id: "curve", Label: "Curve", Glyph: "curve", Key: "C", Verb: "Click to add points · Enter or double-click to stroke", Groups: [
    { Title: "Brush", Fields: [{ K: "brushcard", T: "brushcard" }] },
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
    case "channels": { const L = Array.isArray(V) ? CHANNELS.map((C) => C.Id).filter((C) => V.includes(C)) : null; return L?.length ? L : [...F.Def]; }
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
