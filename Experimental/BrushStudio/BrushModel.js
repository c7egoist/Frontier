// BrushModel.js — the full brush definition behind the Brush Studio (pure; no DOM).
//
// Every setting Procreate's Brush Studio exposes is here, grouped the same way (Stroke path · Stabilization · Taper ·
// Shape · Grain · Rendering · Wet mix · Colour dynamics · Dynamics · Stylus · Properties · Materials · About), plus the
// texture-painting extras TextureStudio already had (PBR channel values, colour / opacity dynamics modes, curves over the
// stroke) and the instrument's own catalogue controls (PaintToolCatalogue SchemaFor).
//
// A brush is { id, name, instrument, family, author, created, signature, values: { "section.key": value }, reset }.
// Values are flat-keyed so the schema, the UI binding, normalisation and the engine all address a setting the same way.

import { PAINT_TOOLS, PAINT_FAMILIES, PAINT_SWATCHES, paintTool, toolSchema } from "./Engine/PaintToolCatalogue.js";
import { CURVE_PRESETS, COLOUR_DYNAMIC_MODES, OPACITY_DYNAMIC_MODES, COLOUR_GRADIENT_PRESETS } from "./Engine/BrushDynamics.js";

export { PAINT_TOOLS, PAINT_FAMILIES, PAINT_SWATCHES, CURVE_PRESETS, COLOUR_DYNAMIC_MODES, OPACITY_DYNAMIC_MODES, COLOUR_GRADIENT_PRESETS };

export const SCHEMA_ID = "frontier.brush.v1";
export const HEX = /^#[0-9a-f]{6}$/i;
const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));

// ------------------------------------------------------------------------------------------------ sources
// Procedural tip shapes and grains (rendered by Sources.js).  Ids are stable; labels are what the pickers show.
export const SHAPES = Object.freeze([
  ["round", "Round"], ["hard", "Hard round"], ["square", "Square"], ["flat", "Flat nib"], ["chalk", "Chalk"],
  ["pencil", "Graphite"], ["bristle", "Bristle"], ["splatter", "Splatter"], ["spray", "Spray"], ["leaf", "Leaf"],
  ["blot", "Ink blot"], ["cloud", "Cloud"], ["star", "Star"], ["sparkle", "Sparkle"], ["hex", "Hexagon"], ["knife", "Knife"],
].map(([Id, Label]) => Object.freeze({ Id, Label })));

export const GRAINS = Object.freeze([
  ["none", "Blank"], ["paper", "Paper"], ["canvas", "Canvas"], ["linen", "Linen"], ["concrete", "Concrete"],
  ["charcoal", "Charcoal"], ["wood", "Wood"], ["halftone", "Halftone"], ["noise", "Noise"], ["sponge", "Sponge"], ["hatch", "Hatching"], ["flakes", "Flakes"],
].map(([Id, Label]) => Object.freeze({ Id, Label })));

export const RENDER_MODES = Object.freeze([
  { Id: "light-glaze", Label: "Light glaze", Hint: "Classic: the stroke never builds past its opacity." },
  { Id: "uniform-glaze", Label: "Uniform glaze", Hint: "Flat, even coverage — dab overlaps don't darken." },
  { Id: "intense-glaze", Label: "Intense glaze", Hint: "Stronger build-up inside a single stroke." },
  { Id: "heavy-glaze", Label: "Heavy glaze", Hint: "Dense pigment; opacity matters less than flow." },
  { Id: "uniform-blending", Label: "Uniform blending", Hint: "Dabs blend into the canvas as they land (wet mix works)." },
  { Id: "intense-blending", Label: "Intense blending", Hint: "Blending with stronger pigment build-up." },
]);

export const BLEND_MODES = Object.freeze(["Normal", "Multiply", "Darken", "Colour burn", "Linear burn", "Screen", "Lighten", "Colour dodge", "Add", "Overlay", "Soft light", "Hard light", "Difference", "Hue", "Saturation", "Colour", "Luminosity"]);
export const GRAIN_BLENDS = Object.freeze(["Multiply", "Linear burn", "Colour burn", "Darken", "Subtract", "Overlay", "Hard mix", "Height"]);
export const BURNT_MODES = Object.freeze(["Multiply", "Linear burn", "Colour burn", "Darken", "Overlay", "Soft light"]);

// PBR channels a brush can write while texture painting (TextureStudio's core paint channels).
export const CHANNELS = Object.freeze([
  { Id: "albedo", Label: "Albedo", Colour: "#e8c27a" },
  { Id: "roughness", Label: "Roughness", Colour: "#9a9a9a" },
  { Id: "metalness", Label: "Metal", Colour: "#c9d2dc" },
  { Id: "height", Label: "Height", Colour: "#7f7fff" },
  { Id: "emissive", Label: "Emissive", Colour: "#ff9a3b" },
]);

// ------------------------------------------------------------------------------------------------ schema
// Field: { K, L, T: slider | seg | switch | select | colour | curve | shape | grain | render | channels | gradient | palette,
//          Min, Max, Step, Unit, Def, Opts, Hint, When(values) }
const S = (K, L, Min, Max, Def, Hint = "", Extra = {}) => ({ K, L, T: "slider", Min, Max, Step: Extra.Step ?? 1, Unit: Extra.Unit ?? "%", Def, Hint, ...Extra });
const W = (K, L, Def, Hint = "", Extra = {}) => ({ K, L, T: "switch", Def, Hint, ...Extra });
const G = (K, L, Opts, Def, Hint = "", Extra = {}) => ({ K, L, T: "seg", Opts, Def, Hint, ...Extra });
const Sel = (K, L, Opts, Def, Hint = "", Extra = {}) => ({ K, L, T: "select", Opts, Def, Hint, ...Extra });
const C = (K, L, Def, Preset = "linear", Hint = "", Extra = {}) => ({ K, L, T: "curve", Def: CURVE_PRESETS[Preset], Hint, ...Extra });
const Is = (K, V) => (Values) => Values[K] === V;

export const SECTIONS = Object.freeze([
  { Id: "stroke", Label: "Stroke path", Glyph: "wave", Hint: "How dabs are laid along the path", Groups: [
    { Title: "Stroke properties", Fields: [
      S("stroke.spacing", "Spacing", 0, 100, 10, "Gap between dabs, relative to size"),
      S("stroke.jitterLateral", "Jitter lateral", 0, 100, 0, "Dabs scatter sideways off the path"),
      S("stroke.jitterLinear", "Jitter linear", 0, 100, 0, "Dabs scatter along the path"),
      S("stroke.falloff", "Fall off", 0, 100, 0, "The stroke fades out as it gets longer"),
    ] },
  ] },
  { Id: "stabilization", Label: "Stabilization", Glyph: "stabilize", Hint: "Smoothing between hand and stroke", Groups: [
    { Title: "StreamLine", Fields: [
      S("stab.streamline", "Amount", 0, 100, 20, "Pulls the stroke toward a smooth line"),
      S("stab.streamlinePressure", "Pressure", 0, 100, 0, "Harder pressure smooths more"),
    ] },
    { Title: "Stabilization", Fields: [
      S("stab.amount", "Amount", 0, 100, 0, "Averages the path — independent of speed"),
    ] },
    { Title: "Motion filtering", Fields: [
      S("stab.motion", "Amount", 0, 100, 0, "Removes hand shake"),
      S("stab.expression", "Expression", 0, 100, 0, "Keeps some of the natural wobble", { When: (V) => V["stab.motion"] > 0 }),
    ] },
  ] },
  { Id: "taper", Label: "Taper", Glyph: "taper", Hint: "Stroke ends — pressure and touch", Groups: [
    { Title: "Pressure taper", Hint: "Stylus strokes", Fields: [
      S("taper.pressureStart", "Start", 0, 100, 8, "Length of the entry taper"),
      S("taper.pressureEnd", "End", 0, 100, 8, "Length of the exit taper"),
      W("taper.pressureLink", "Link tip sizes", true, "Start and end move together"),
    ] },
    { Title: "Touch taper", Hint: "Mouse and finger strokes", Fields: [
      S("taper.touchStart", "Start", 0, 100, 14),
      S("taper.touchEnd", "End", 0, 100, 18),
      W("taper.touchLink", "Link tip sizes", false),
    ] },
    { Title: "Taper properties", Fields: [
      S("taper.size", "Size", 0, 100, 70, "How much the ends thin out"),
      S("taper.opacity", "Opacity", 0, 100, 0, "How much the ends fade"),
      S("taper.pressure", "Pressure", 0, 100, 0, "Ends ignore part of the pen pressure"),
      S("taper.tip", "Tip sharpness", 0, 100, 40, "0 = needle point, 100 = blunt"),
      W("taper.tipAnimation", "Tip animation", true, "Show the exit taper while drawing"),
      W("taper.classic", "Classic taper", false, "Older, pressure-only taper for every input"),
    ] },
  ] },
  { Id: "shape", Label: "Shape", Glyph: "shape", Hint: "The stamp at each dab", Groups: [
    { Title: "Shape source", Fields: [
      { K: "shape.source", L: "Shape", T: "shape", Def: "round" },
      W("shape.invert", "Invert shape", false),
    ] },
    { Title: "Shape behaviour", Fields: [
      S("shape.scatter", "Scatter", 0, 100, 0, "Random rotation per dab"),
      S("shape.rotation", "Rotation", -100, 100, 0, "−100 inverse · 0 fixed · 100 follow stroke"),
      S("shape.count", "Shape count", 1, 16, 1, "Dabs stamped at each step", { Unit: "×" }),
      S("shape.countJitter", "Count jitter", 0, 100, 0, "Randomises how many land"),
      W("shape.randomized", "Randomised", false, "Random start angle per stroke"),
      W("shape.azimuth", "Azimuth", false, "Rotate with the stylus azimuth"),
      W("shape.flipX", "Flip X", false, "Random horizontal mirroring"),
      W("shape.flipY", "Flip Y", false, "Random vertical mirroring"),
    ] },
    { Title: "Roundness", Fields: [
      S("shape.roundness", "Roundness", 5, 100, 100, "Squash the stamp"),
      S("shape.pressureRoundness", "Pressure roundness", 0, 100, 0, "Light pressure flattens the stamp"),
      S("shape.jitterH", "Horizontal jitter", 0, 100, 0),
      S("shape.jitterV", "Vertical jitter", 0, 100, 0),
    ] },
    { Title: "Tip falloff", Fields: [
      S("shape.hardness", "Hardness", 0, 100, 80, "Edge softness of the stamp"),
      C("shape.falloff", "Falloff", null, "flat", "Opacity from the rim (left) to the centre (right)"),
    ] },
    { Title: "Shape filtering", Fields: [
      G("shape.filtering", "Filtering", ["None", "Classic", "Improved"], "Improved", "Anti-aliasing of the stamp"),
    ] },
  ] },
  { Id: "grain", Label: "Grain", Glyph: "noise", Hint: "Texture inside the stroke", Groups: [
    { Title: "Grain source", Fields: [
      { K: "grain.source", L: "Grain", T: "grain", Def: "none" },
      W("grain.invert", "Invert grain", false),
    ] },
    { Title: "Grain behaviour", Fields: [
      G("grain.mode", "Behaviour", ["Moving", "Texturized"], "Texturized", "Moving rides with each dab; texturized is fixed to the canvas"),
      S("grain.movement", "Movement", 0, 100, 100, "0 = rolling, 100 = sliding with the brush", { When: Is("grain.mode", "Moving") }),
      S("grain.scale", "Scale", 1, 100, 45),
      S("grain.zoom", "Zoom", 0, 100, 0, "Grain grows with brush size", { When: Is("grain.mode", "Moving") }),
      S("grain.rotation", "Rotation", -100, 100, 0, "−100 inverse · 0 fixed · 100 follow stroke", { When: Is("grain.mode", "Moving") }),
      S("grain.depth", "Depth", 0, 100, 100, "How strongly the grain cuts the stroke"),
      S("grain.depthMin", "Minimum depth", 0, 100, 0, "Depth at the lightest pressure"),
      S("grain.depthJitter", "Depth jitter", 0, 100, 0),
      W("grain.offsetJitter", "Offset jitter", true, "New grain offset every stroke"),
      Sel("grain.blend", "Blend mode", GRAIN_BLENDS, "Multiply"),
      S("grain.brightness", "Brightness", -100, 100, 0),
      S("grain.contrast", "Contrast", -100, 100, 0),
    ] },
    { Title: "Grain filtering", Fields: [G("grain.filtering", "Filtering", ["None", "Classic", "Improved"], "Classic")] },
  ] },
  { Id: "rendering", Label: "Rendering", Glyph: "drop", Hint: "How strokes build and blend", Groups: [
    { Title: "Rendering mode", Fields: [{ K: "render.mode", L: "Mode", T: "render", Def: "light-glaze" }] },
    { Title: "Blending", Fields: [
      S("render.flow", "Flow", 0, 100, 100, "Paint per dab"),
      S("render.wetEdges", "Wet edges", 0, 100, 0, "Pigment pools at the rim"),
      S("render.burntEdges", "Burnt edges", 0, 100, 0, "Edges burn into what's beneath"),
      Sel("render.burntMode", "Burnt edges mode", BURNT_MODES, "Multiply", "", { When: (V) => V["render.burntEdges"] > 0 }),
      Sel("render.blend", "Blend mode", BLEND_MODES, "Normal"),
      W("render.luminance", "Luminance blending", false, "Mix colours by perceived lightness"),
      S("render.alphaThreshold", "Alpha threshold", 0, 100, 0, "Drop faint coverage — crisp edges"),
    ] },
  ] },
  { Id: "wetmix", Label: "Wet mix", Glyph: "drop", Hint: "Paint load and mixing", Groups: [
    { Title: "Wet mix", Hint: "Works best with a blending render mode", Fields: [
      S("wet.dilution", "Dilution", 0, 100, 0, "Water in the paint"),
      S("wet.charge", "Charge", 0, 100, 100, "How long until the brush runs dry"),
      S("wet.attack", "Attack", 0, 100, 100, "How much paint lands"),
      S("wet.pull", "Pull", 0, 100, 0, "Drags colour already on the canvas"),
      S("wet.grade", "Grade", 0, 100, 0, "Pigment strength against the pull"),
    ] },
    { Title: "Blur", Fields: [S("wet.blur", "Blur", 0, 100, 0), S("wet.blurJitter", "Blur jitter", 0, 100, 0)] },
    { Title: "Wetness", Fields: [S("wet.wetnessJitter", "Wetness jitter", 0, 100, 0)] },
  ] },
  { Id: "colour", Label: "Colour dynamics", Glyph: "fill", Hint: "Colour that varies per dab and stroke", Groups: [
    { Title: "Colour", Fields: [
      { K: "colour.primary", L: "Primary", T: "colour", Def: "#e8c27a" },
      { K: "colour.secondary", L: "Secondary", T: "colour", Def: "#2f6d75" },
      Sel("colour.mode", "Colour mode", COLOUR_DYNAMIC_MODES.map((M) => M.id), "solid", "", { Labels: Object.fromEntries(COLOUR_DYNAMIC_MODES.map((M) => [M.id, M.label])) }),
      { K: "colour.gradient", L: "Gradient", T: "gradient", Def: "ember", When: Is("colour.mode", "stroke-gradient") },
      S("colour.gradientLength", "Gradient length", 4, 200, 36, "Dabs per sweep", { Unit: "dabs", When: Is("colour.mode", "stroke-gradient") }),
      G("colour.gradientWrap", "Wrap", ["pingpong", "loop", "clamp"], "pingpong", "", { When: Is("colour.mode", "stroke-gradient") }),
      { K: "colour.palette", L: "Palette", T: "palette", Def: ["#ff3d2e", "#2fe6a7", "#63a8ff", "#ffd166"], When: (V) => String(V["colour.mode"]).startsWith("multicolour") },
      S("colour.temperature", "Temperature split", 0, 100, 35, "", { When: Is("colour.mode", "temperature") }),
    ] },
    { Title: "Stamp colour jitter", Hint: "Per dab", Fields: [
      S("colour.stampHue", "Hue", 0, 100, 0), S("colour.stampSat", "Saturation", 0, 100, 0),
      S("colour.stampBright", "Brightness", 0, 100, 0), S("colour.stampDark", "Darkness", 0, 100, 0),
      S("colour.stampSecondary", "Secondary colour", 0, 100, 0),
    ] },
    { Title: "Stroke colour jitter", Hint: "Per stroke", Fields: [
      S("colour.strokeHue", "Hue", 0, 100, 0), S("colour.strokeSat", "Saturation", 0, 100, 0),
      S("colour.strokeBright", "Brightness", 0, 100, 0), S("colour.strokeSecondary", "Secondary colour", 0, 100, 0),
    ] },
    { Title: "Colour pressure", Fields: [
      S("colour.pressureHue", "Hue", -100, 100, 0), S("colour.pressureSat", "Saturation", -100, 100, 0),
      S("colour.pressureBright", "Brightness", -100, 100, 0), S("colour.pressureSecondary", "Secondary colour", 0, 100, 0),
    ] },
    { Title: "Colour tilt", Fields: [
      S("colour.tiltHue", "Hue", -100, 100, 0), S("colour.tiltSat", "Saturation", -100, 100, 0),
      S("colour.tiltBright", "Brightness", -100, 100, 0), S("colour.tiltSecondary", "Secondary colour", 0, 100, 0),
    ] },
    { Title: "Opacity over stroke", Fields: [
      Sel("colour.opacityMode", "Opacity mode", OPACITY_DYNAMIC_MODES.map((M) => M.id), "constant", "", { Labels: Object.fromEntries(OPACITY_DYNAMIC_MODES.map((M) => [M.id, M.label])) }),
      S("colour.opacityMin", "Minimum", 2, 100, 18, "", { When: (V) => V["colour.opacityMode"] !== "constant" }),
      S("colour.opacityPulse", "Pulse frequency", 8, 200, 45, "", { When: Is("colour.opacityMode", "pulse") }),
    ] },
    { Title: "Hue over stroke", Fields: [C("colour.hueCurve", "Hue curve", null, "linear", "0.5 = no shift", { Def: [[0, 0.5], [1, 0.5]] })] },
  ] },
  { Id: "dynamics", Label: "Dynamics", Glyph: "speed", Hint: "Speed, jitter and curves over the stroke", Groups: [
    { Title: "Speed", Fields: [
      S("dyn.speedSize", "Size", -100, 100, 0, "Fast strokes grow (+) or thin (−)"),
      S("dyn.speedOpacity", "Opacity", -100, 100, 0, "Fast strokes darken (+) or fade (−)"),
    ] },
    { Title: "Jitter", Fields: [S("dyn.jitterSize", "Size", 0, 100, 0), S("dyn.jitterOpacity", "Opacity", 0, 100, 0)] },
    { Title: "Over the stroke", Fields: [
      C("dyn.sizeCurve", "Size over stroke", null, "flat", "Start (left) to end (right)"),
      C("dyn.opacityCurve", "Opacity over stroke", null, "flat"),
    ] },
  ] },
  { Id: "stylus", Label: "Stylus", Glyph: "pressure", Hint: "Pressure and tilt response", Groups: [
    { Title: "Pressure", Fields: [
      C("pen.pressureCurve", "Pressure curve", null, "linear", "Hand pressure (x) to brush pressure (y)"),
      S("pen.size", "Size", 0, 100, 50), S("pen.opacity", "Opacity", 0, 100, 0), S("pen.flow", "Flow", 0, 100, 0),
      S("pen.bleed", "Bleed", 0, 100, 0, "Light pressure lets the grain show"),
      S("pen.smoothing", "Smoothing", 0, 100, 0, "Evens out pressure changes"),
    ] },
    { Title: "Tilt", Fields: [
      S("pen.tiltAngle", "Tilt angle", 0, 90, 0, "Below this angle tilt takes over", { Unit: "°" }),
      S("pen.tiltOpacity", "Opacity", 0, 100, 0, "", { When: (V) => V["pen.tiltAngle"] > 0 }),
      S("pen.tiltGradation", "Gradation", 0, 100, 0, "", { When: (V) => V["pen.tiltAngle"] > 0 }),
      S("pen.tiltBleed", "Bleed", 0, 100, 0, "", { When: (V) => V["pen.tiltAngle"] > 0 }),
      S("pen.tiltSize", "Size", 0, 100, 0, "", { When: (V) => V["pen.tiltAngle"] > 0 }),
      W("pen.sizeCompression", "Size compression", false, "Keep the stamp from distorting under tilt", { When: (V) => V["pen.tiltAngle"] > 0 }),
    ] },
    { Title: "Mouse and touch", Fields: [
      W("pen.simulate", "Speed as pressure", true, "Slow mouse strokes press harder"),
      S("pen.hover", "Hover preview", 0, 100, 60, "Outline opacity before touching down"),
    ] },
  ] },
  { Id: "properties", Label: "Properties", Glyph: "sliders", Hint: "Size and opacity ranges", Groups: [
    { Title: "Brush properties", Fields: [
      W("prop.stampPreview", "Use stamp preview", false, "Library shows one stamp instead of a stroke"),
      W("prop.orient", "Orient to screen", true, "Stamps stay upright when the canvas turns"),
      S("prop.previewSize", "Preview", 0, 100, 40, "Library thumbnail size"),
      S("prop.smudge", "Smudge", 0, 100, 70, "Strength when the brush smudges"),
    ] },
    { Title: "Brush behaviour", Fields: [
      S("prop.maxSize", "Maximum size", 1, 100, 45, "Top of the size slider"),
      S("prop.minSize", "Minimum size", 0, 100, 2, "Bottom of the size slider"),
      S("prop.maxOpacity", "Maximum opacity", 1, 100, 100),
      S("prop.minOpacity", "Minimum opacity", 0, 100, 0),
    ] },
    { Title: "Current", Hint: "The canvas-side sliders", Fields: [
      S("prop.size", "Size", 0, 100, 30), S("prop.opacity", "Opacity", 0, 100, 100),
    ] },
  ] },
  { Id: "materials", Label: "Materials", Glyph: "material", Hint: "PBR channels the brush paints", Groups: [
    { Title: "Channels", Fields: [{ K: "mat.channels", L: "Channels", T: "channels", Def: ["albedo", "roughness", "height"] }] },
    { Title: "Roughness", When: (V) => V["mat.channels"].includes("roughness"), Fields: [
      S("mat.roughness", "Value", 0, 100, 55),
      G("mat.roughSource", "Source", ["None", "Shape", "Grain"], "None", "Texture the value with the shape or grain"),
      S("mat.roughAmount", "Amount", 0, 100, 50, "", { When: (V) => V["mat.roughSource"] !== "None" }),
    ] },
    { Title: "Metallic", When: (V) => V["mat.channels"].includes("metalness"), Fields: [
      S("mat.metalness", "Value", 0, 100, 0),
      G("mat.metalSource", "Source", ["None", "Shape", "Grain"], "None"),
      S("mat.metalAmount", "Amount", 0, 100, 50, "", { When: (V) => V["mat.metalSource"] !== "None" }),
    ] },
    { Title: "Height", When: (V) => V["mat.channels"].includes("height"), Fields: [
      S("mat.height", "Relief", -100, 100, 25, "Raise (+) or carve (−)"),
      G("mat.heightSource", "Source", ["None", "Shape", "Grain"], "Grain"),
      S("mat.heightAmount", "Amount", 0, 100, 60, "", { When: (V) => V["mat.heightSource"] !== "None" }),
    ] },
    { Title: "Emission", When: (V) => V["mat.channels"].includes("emissive"), Fields: [
      S("mat.emissive", "Strength", 0, 100, 40, "Glow of the primary colour"),
    ] },
  ] },
  { Id: "instrument", Label: "Instrument", Glyph: "pen", Hint: "The catalogue tool's own controls", Groups: [] },
  { Id: "about", Label: "About this brush", Glyph: "info", Hint: "Name, author, reset point", Groups: [] },
]);

export const FIELDS = Object.freeze(Object.fromEntries(SECTIONS.flatMap((Sec) => Sec.Groups.flatMap((Gr) => Gr.Fields)).map((F) => [F.K, F])));

export const DEFAULTS = Object.freeze(Object.fromEntries(Object.values(FIELDS).map((F) => [F.K, structuredClone(F.Def)])));

// ------------------------------------------------------------------------------------------------ family presets
// What each catalogue family feels like.  Only differences from DEFAULTS are listed.
export const FAMILY_PRESETS = Object.freeze({
  pen: { "stroke.spacing": 4, "stab.streamline": 35, "shape.source": "hard", "shape.hardness": 92, "taper.size": 85, "taper.tip": 12, "pen.size": 70, "prop.size": 14, "prop.maxSize": 30, "mat.roughness": 30, "mat.height": 8, "mat.heightSource": "None" },
  pencil: { "stroke.spacing": 6, "shape.source": "pencil", "shape.hardness": 60, "grain.source": "paper", "grain.depth": 85, "grain.scale": 30, "pen.size": 30, "pen.opacity": 55, "pen.tiltAngle": 45, "pen.tiltSize": 60, "pen.tiltGradation": 50, "prop.size": 8, "prop.maxSize": 18, "render.mode": "light-glaze", "mat.roughness": 70, "mat.height": 10 },
  "colored-pencil": { "stroke.spacing": 6, "shape.source": "pencil", "shape.hardness": 55, "grain.source": "paper", "grain.depth": 75, "grain.scale": 34, "pen.size": 25, "pen.opacity": 50, "pen.tiltAngle": 40, "pen.tiltSize": 50, "prop.size": 10, "prop.maxSize": 20, "colour.stampBright": 4, "mat.roughness": 72, "mat.height": 12 },
  brush: { "stroke.spacing": 3, "shape.source": "bristle", "shape.rotation": 100, "shape.hardness": 55, "grain.source": "canvas", "grain.mode": "Moving", "grain.depth": 40, "render.mode": "uniform-blending", "wet.pull": 35, "wet.charge": 70, "wet.dilution": 10, "wet.attack": 80, "pen.size": 60, "pen.opacity": 30, "prop.size": 30, "prop.maxSize": 60, "render.wetEdges": 18, "mat.roughness": 45, "mat.height": 30 },
  marker: { "stroke.spacing": 3, "shape.source": "flat", "shape.rotation": 0, "shape.hardness": 75, "shape.roundness": 45, "render.mode": "uniform-glaze", "render.blend": "Multiply", "prop.opacity": 85, "pen.size": 15, "taper.size": 20, "prop.size": 22, "prop.maxSize": 40, "render.wetEdges": 25, "mat.roughness": 35, "mat.height": 4, "mat.heightSource": "None" },
  eraser: { "stroke.spacing": 5, "shape.source": "round", "shape.hardness": 70, "pen.size": 35, "taper.size": 30, "prop.size": 28, "prop.maxSize": 60, "colour.primary": "#f4f1ea", "mat.channels": ["albedo", "roughness", "metalness", "height"] },
  stylus: { "stroke.spacing": 3, "shape.source": "hard", "shape.hardness": 95, "stab.streamline": 25, "pen.size": 55, "taper.size": 80, "prop.size": 16, "prop.maxSize": 40, "render.mode": "uniform-glaze", "mat.roughness": 40, "mat.height": 0, "mat.heightSource": "None" },
  spray: { "stroke.spacing": 14, "shape.source": "spray", "shape.scatter": 100, "shape.count": 6, "shape.countJitter": 60, "stroke.jitterLateral": 45, "shape.hardness": 30, "dyn.jitterSize": 40, "dyn.jitterOpacity": 50, "pen.size": 20, "pen.opacity": 50, "prop.size": 36, "prop.maxSize": 70, "taper.size": 0, "mat.roughness": 60, "mat.height": 6 },
  dry: { "stroke.spacing": 8, "shape.source": "chalk", "shape.scatter": 35, "shape.hardness": 50, "grain.source": "charcoal", "grain.depth": 90, "grain.scale": 52, "pen.size": 40, "pen.opacity": 60, "prop.size": 26, "prop.maxSize": 55, "pen.tiltAngle": 50, "pen.tiltSize": 70, "mat.roughness": 85, "mat.height": 18 },
  glitter: { "stroke.spacing": 18, "shape.source": "sparkle", "shape.scatter": 100, "shape.count": 4, "shape.countJitter": 70, "stroke.jitterLateral": 60, "dyn.jitterSize": 70, "colour.stampBright": 30, "colour.stampHue": 6, "render.mode": "intense-glaze", "prop.size": 18, "prop.maxSize": 40, "mat.channels": ["albedo", "roughness", "metalness", "height"], "mat.metalness": 90, "mat.metalSource": "Shape", "mat.roughness": 18, "mat.height": 12 },
});

// Instrument catalogue params → brush settings, so the catalogue's own controls (Instrument section) drive the brush.
// Each entry: param key → (brush values, param value, all params) => void
const PARAM_MAP = {
  size: (V, X) => { V["prop.size"] = Clamp(Math.round((X / 80) * 100), 0, 100); },
  opacity: (V, X) => { V["prop.opacity"] = Clamp(X, 0, 100); },
  strength: (V, X) => { V["prop.opacity"] = Clamp(X, 0, 100); },
  flow: (V, X) => { V["render.flow"] = Clamp(X, 0, 100); },
  smoothing: (V, X) => { V["stab.streamline"] = Clamp(X, 0, 100); },
  pressure: (V, X) => { if (typeof X === "number") V["pen.size"] = Clamp(X, 0, 100); },
  bleed: (V, X) => { if (typeof X === "number") V["pen.bleed"] = Clamp(X, 0, 100); },
  tilt: (V, X) => { V["pen.tiltSize"] = Clamp(X, 0, 100); V["pen.tiltAngle"] = X > 0 ? Math.max(V["pen.tiltAngle"], 35) : V["pen.tiltAngle"]; },
  grain: (V, X) => { V["grain.depth"] = Clamp(X, 0, 100); if (V["grain.source"] === "none" && X > 0) V["grain.source"] = "paper"; },
  softness: (V, X) => { V["shape.hardness"] = Clamp(100 - X, 0, 100); },
  wetness: (V, X) => { V["wet.pull"] = Clamp(X * 0.6, 0, 100); V["wet.dilution"] = Clamp(X * 0.25, 0, 100); },
  taperAmt: (V, X) => { V["taper.size"] = Clamp(X, 0, 100); },
  scatter: (V, X) => { V["stroke.jitterLateral"] = Clamp(X, 0, 100); },
  jitter: (V, X) => { V["dyn.jitterSize"] = Clamp(X, 0, 100); },
  spread: (V, X) => { V["stroke.jitterLateral"] = Clamp(X, 0, 100); },
  density: (V, X) => { V["shape.count"] = Clamp(Math.round(1 + (X / 100) * 11), 1, 16); },
  buildup: (V, X) => { V["render.flow"] = Clamp(X, 0, 100); },
  pigment: (V, X) => { V["wet.grade"] = Clamp(X, 0, 100); },
  smear: (V, X) => { V["wet.pull"] = Clamp(X, 0, 100); },
  streak: (V, X) => { V["render.wetEdges"] = Clamp(X, 0, 100); },
  glow: (V, X) => { if (X > 0 && !V["mat.channels"].includes("emissive")) V["mat.channels"] = [...V["mat.channels"], "emissive"]; V["mat.emissive"] = Clamp(X, 0, 100); },
  sparkle: (V, X) => { if (typeof X === "number") V["colour.stampBright"] = Clamp(X * 0.5, 0, 100); },
  taper: (V, X) => { V["taper.size"] = X ? Math.max(60, V["taper.size"]) : 0; },
  nib: (V, X) => { V["shape.roundness"] = X === "Broad" ? 40 : X === "Fine" ? 100 : 70; V["shape.source"] = X === "Broad" ? "flat" : V["shape.source"]; },
  hardness: (V, X) => { if (typeof X === "number") V["shape.hardness"] = Clamp(X, 0, 100); },
};

// Character controls (seg / select) → a consistent set of studio settings per option, so switching options never
// compounds.  Every option of one control writes the same keys (base + its own differences).
const OPTION_MAP = {
  shape: { base: { "shape.source": "bristle", "shape.rotation": 100, "shape.scatter": 0, "shape.hardness": 55, "stroke.spacing": 3, "prop.maxSize": 60, "wet.dilution": 10 }, opts: {
    Round: {}, "Flat / Wide": { "prop.maxSize": 80 }, Filbert: { "shape.hardness": 38, "prop.maxSize": 70 }, Fan: { "shape.source": "splatter", "stroke.spacing": 7, "prop.maxSize": 80 },
    Liner: { "shape.source": "hard", "prop.maxSize": 26, "shape.hardness": 85 }, Wash: { "shape.source": "cloud", "shape.hardness": 20, "prop.maxSize": 90, "wet.dilution": 40 },
    Bright: { "shape.source": "square", "shape.rotation": 0, "prop.maxSize": 60 }, Angular: { "shape.source": "knife", "shape.rotation": 0, "prop.maxSize": 70 },
    Mop: { "shape.source": "cloud", "prop.maxSize": 95, "wet.dilution": 25 }, Rigger: { "shape.source": "hard", "prop.maxSize": 18, "shape.hardness": 90 },
    Stippler: { "shape.source": "splatter", "stroke.spacing": 32, "shape.scatter": 100 }, Texture: { "shape.source": "chalk", "shape.scatter": 40 } } },
  paint: { base: { "render.mode": "uniform-blending", "wet.pull": 35, "render.wetEdges": 18, "grain.source": "canvas", "grain.depth": 40, "colour.stampBright": 0 }, opts: {
    Oil: { "render.mode": "intense-blending", "wet.pull": 48, "render.wetEdges": 0, "grain.depth": 55 }, Acrylic: { "wet.pull": 22, "render.wetEdges": 6 },
    Watercolour: { "render.wetEdges": 48, "grain.source": "paper", "grain.depth": 45 }, Gouache: { "render.mode": "uniform-glaze", "wet.pull": 12, "render.wetEdges": 4, "grain.depth": 25 },
    Ink: { "render.mode": "light-glaze", "wet.pull": 0, "render.wetEdges": 22, "grain.source": "none" }, "Wood stain": { "grain.source": "wood", "grain.depth": 75, "render.wetEdges": 30, "colour.stampBright": 6 } } },
  bristle: { base: { "stroke.jitterLateral": 0, "dyn.jitterOpacity": 0 }, opts: {
    Hog: { "stroke.jitterLateral": 6, "dyn.jitterOpacity": 18 }, Sable: {}, Kolinsky: {}, Squirrel: {}, Synthetic: {}, Taklon: {}, Goat: { "dyn.jitterOpacity": 10 }, Badger: { "stroke.jitterLateral": 4, "dyn.jitterOpacity": 12 }, Foam: { "dyn.jitterOpacity": 6 }, Silicone: {} } },
  grade: { fn: (V, X) => { const L = ["9H", "8H", "7H", "6H", "5H", "4H", "3H", "2H", "H", "F", "HB", "B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B"]; const I = L.indexOf(X); if (I < 0) return; const T = I / (L.length - 1); V["prop.opacity"] = Math.round(35 + T * 65); V["shape.hardness"] = Math.round(85 - T * 45); V["grain.depth"] = Math.round(95 - T * 35); } },
  lead: { fn: (V, X) => { const Mm = parseFloat(X); if (Number.isFinite(Mm)) V["prop.maxSize"] = Clamp(Math.round(8 + Mm * 9), 6, 70); } },
  binder: { base: { "grain.depth": 75, "render.wetEdges": 0, "wet.dilution": 0 }, opts: { Wax: { "grain.depth": 88 }, Oil: { "grain.depth": 60 }, Watercolour: { "grain.depth": 50, "render.wetEdges": 35, "wet.dilution": 25 } } },
  nibShape: { base: { "shape.source": "flat", "shape.roundness": 45, "shape.rotation": 0 }, opts: { Bullet: { "shape.source": "round", "shape.roundness": 100 }, Chisel: {}, Brush: { "shape.source": "leaf", "shape.roundness": 100, "shape.rotation": 100 } } },
  ink: { fn: (V, X) => {
    const T = { Alcohol: [25, "Multiply", 75], Water: [45, "Normal", 70], Pigment: [6, "Normal", 92], Dye: [10, "Normal", 90], Gel: [0, "Normal", 98], "Oil-based": [4, "Normal", 94], "Iron gall": [18, "Multiply", 88] }[X];
    if (T) [V["render.wetEdges"], V["render.blend"], V["shape.hardness"]] = T; } },
  blendMode: { fn: (V, X) => { if (BLEND_MODES.includes(X)) V["render.blend"] = X; } },
  nozzle: { base: {}, opts: { Fat: { "prop.maxSize": 90, "shape.count": 8 }, Skinny: { "prop.maxSize": 40, "shape.count": 4 } } },
  variant: { base: {}, opts: { Vine: { "grain.depth": 95, "prop.opacity": 70 }, Compressed: { "grain.depth": 70, "prop.opacity": 95 }, Soft: { "grain.depth": 75, "prop.opacity": 90 }, Oil: { "grain.depth": 55, "prop.opacity": 100 }, Hard: { "grain.depth": 92, "prop.opacity": 75 } } },
  tone: { base: {}, opts: { Sanguine: { "colour.primary": "#9e3b26" }, Bistre: { "colour.primary": "#4a3423" }, Sepia: { "colour.primary": "#704214" }, White: { "colour.primary": "#f2efe6" }, Black: { "colour.primary": "#141414" } } },
  edge: { base: {}, opts: { Point: { "shape.source": "pencil" }, Broad: { "shape.source": "chalk" } } },
  flake: { base: {}, opts: { Fine: { "shape.count": 7, "shape.source": "sparkle", "prop.maxSize": 28 }, Medium: { "shape.count": 4, "shape.source": "sparkle", "prop.maxSize": 40 }, Chunky: { "shape.count": 2, "shape.source": "hex", "prop.maxSize": 34 } } },
  etype: { base: {}, opts: { Pencil: { "shape.hardness": 85, "grain.source": "none" }, Kneaded: { "shape.hardness": 30, "grain.source": "charcoal" }, "Vinyl / Plastic": { "shape.hardness": 92, "grain.source": "none" }, Gum: { "shape.hardness": 50, "grain.source": "paper" }, "Smudge eraser": { "shape.hardness": 20, "grain.source": "none" }, Electric: { "shape.hardness": 96, "grain.source": "none" } } },
};
for (const [K, Spec] of Object.entries(OPTION_MAP)) PARAM_MAP[K] ??= (V, X) => {
  if (typeof X !== "string") return;
  if (Spec.fn) return Spec.fn(V, X);
  const O = Spec.opts?.[X];
  if (O) Object.assign(V, Spec.base, O);
};
export const PARAM_OPTIONS = Object.freeze(Object.keys(OPTION_MAP));

export function InstrumentParams(Instrument, Params = {}) {
  const Out = {};
  for (const G of toolSchema(Instrument)) for (const C of G.controls) {
    const V = Params[C.k];
    if (C.type === "slider") Out[C.k] = Number.isFinite(+V) ? Clamp(+V, C.min, C.max) : C.def;
    else if (C.type === "switch") Out[C.k] = typeof V === "boolean" ? V : C.def;
    else Out[C.k] = C.opts?.includes(V) ? V : C.def;
  }
  return Out;
}

export function ApplyInstrumentParams(Values, Params) {
  const V = { ...Values };
  for (const [K, X] of Object.entries(Params)) PARAM_MAP[K]?.(V, X, Params);
  return V;
}

// ------------------------------------------------------------------------------------------------ brushes
const Iso = () => new Date().toISOString().slice(0, 10);

export function FromInstrument(Id) {
  const Tool = paintTool(Id), Family = Tool.key;
  const Params = InstrumentParams(Tool.id);
  let Values = { ...structuredClone(DEFAULTS), ...structuredClone(FAMILY_PRESETS[Family] || {}) };
  Values["colour.primary"] = PAINT_SWATCHES[Family]?.[0] || Values["colour.primary"];
  Values["colour.secondary"] = PAINT_SWATCHES[Family]?.[1] || Values["colour.secondary"];
  Values = ApplyInstrumentParams(Values, Params);
  const Brush = { schema: SCHEMA_ID, id: Tool.id, name: Tool.label, instrument: Tool.id, family: Family, author: "Frontier", created: Iso(), signature: "", params: Params, values: Normalise(Values) };
  Brush.reset = structuredClone({ values: Brush.values, params: Brush.params, name: Brush.name });
  return Brush;
}

// Coerce every value into its field's range / options; unknown keys are dropped, missing keys take defaults.
export function Normalise(Values = {}) {
  const Out = {};
  for (const [K, F] of Object.entries(FIELDS)) {
    const V = Values[K];
    switch (F.T) {
      case "slider": Out[K] = Number.isFinite(+V) ? Clamp(Math.round(+V / F.Step) * F.Step, F.Min, F.Max) : F.Def; break;
      case "switch": Out[K] = typeof V === "boolean" ? V : F.Def; break;
      case "seg": case "select": Out[K] = F.Opts.includes(V) ? V : F.Def; break;
      case "colour": Out[K] = HEX.test(V || "") ? V.toLowerCase() : F.Def; break;
      case "curve": Out[K] = ValidCurve(V) ? V.map(([X, Y]) => [Clamp(+X, 0, 1), Clamp(+Y, 0, 1)]).sort((A, B) => A[0] - B[0]) : structuredClone(F.Def); break;
      case "shape": Out[K] = SHAPES.some((E) => E.Id === V) ? V : F.Def; break;
      case "grain": Out[K] = GRAINS.some((E) => E.Id === V) ? V : F.Def; break;
      case "render": Out[K] = RENDER_MODES.some((E) => E.Id === V) ? V : F.Def; break;
      case "gradient": Out[K] = COLOUR_GRADIENT_PRESETS.some((E) => E.id === V) ? V : F.Def; break;
      case "channels": { const L = Array.isArray(V) ? CHANNELS.map((C) => C.Id).filter((C) => V.includes(C)) : null; Out[K] = L?.length ? L : [...F.Def]; break; }
      case "palette": { const L = Array.isArray(V) ? V.filter((C) => HEX.test(C)).map((C) => C.toLowerCase()).slice(0, 8) : []; Out[K] = L.length >= 2 ? L : [...F.Def]; break; }
      default: Out[K] = V ?? F.Def;
    }
  }
  if (Out["prop.minSize"] > Out["prop.maxSize"]) Out["prop.minSize"] = Out["prop.maxSize"];
  if (Out["prop.minOpacity"] > Out["prop.maxOpacity"]) Out["prop.minOpacity"] = Out["prop.maxOpacity"];
  return Out;
}

const ValidCurve = (V) => Array.isArray(V) && V.length >= 2 && V.length <= 12 && V.every((P) => Array.isArray(P) && P.length === 2 && P.every((N) => Number.isFinite(+N)));

export function NormaliseBrush(Raw) {
  if (!Raw || typeof Raw !== "object") throw new Error("Not a brush");
  const Base = FromInstrument(PAINT_TOOLS.some((T) => T.id === Raw.instrument) ? Raw.instrument : PAINT_TOOLS[0].id);
  const Brush = {
    ...Base,
    id: String(Raw.id || Base.id).slice(0, 120),
    name: String(Raw.name || Base.name).replace(/[\u0000-\u001f]/g, "").slice(0, 80) || Base.name,
    author: String(Raw.author ?? Base.author).slice(0, 80),
    created: /^\d{4}-\d{2}-\d{2}$/.test(Raw.created || "") ? Raw.created : Base.created,
    signature: String(Raw.signature ?? "").slice(0, 120),
    params: InstrumentParams(Base.instrument, Raw.params || {}),
    values: Normalise(Raw.values || {}),
  };
  Brush.reset = Raw.reset?.values ? { values: Normalise(Raw.reset.values), params: InstrumentParams(Base.instrument, Raw.reset.params || {}), name: String(Raw.reset.name || Brush.name) } : structuredClone({ values: Brush.values, params: Brush.params, name: Brush.name });
  return Brush;
}

export function SetValue(Brush, Key, Value) {
  const F = FIELDS[Key];
  if (!F) return Brush;
  const Values = { ...Brush.values, [Key]: Value };
  // Linked taper tips move together.
  if (Key === "taper.pressureStart" && Brush.values["taper.pressureLink"]) Values["taper.pressureEnd"] = Value;
  if (Key === "taper.pressureEnd" && Brush.values["taper.pressureLink"]) Values["taper.pressureStart"] = Value;
  if (Key === "taper.touchStart" && Brush.values["taper.touchLink"]) Values["taper.touchEnd"] = Value;
  if (Key === "taper.touchEnd" && Brush.values["taper.touchLink"]) Values["taper.touchStart"] = Value;
  return { ...Brush, values: Normalise(Values) };
}

// Re-applies the changed control, then any later control (in schema order, as FromInstrument applies them) that writes
// one of the same settings — so the result never depends on the order the user touched the controls in.
const ParamKeys = (K, X, Params, Values) => {
  const Wrote = new Set(), Probe = new Proxy(structuredClone(Values), { set: (T, P, V) => { Wrote.add(P); T[P] = V; return true; } });
  PARAM_MAP[K]?.(Probe, X, Params);
  return [...Wrote];
};
export function SetParam(Brush, Key, Value) {
  const Params = InstrumentParams(Brush.instrument, { ...Brush.params, [Key]: Value });
  const Order = Object.keys(Params), Touched = new Set(ParamKeys(Key, Params[Key], Params, Brush.values));
  const Apply = { [Key]: Params[Key] };
  for (const K of Order.slice(Order.indexOf(Key) + 1)) if (ParamKeys(K, Params[K], Params, Brush.values).some((S) => Touched.has(S))) Apply[K] = Params[K];
  return { ...Brush, params: Params, values: Normalise(ApplyInstrumentParams(Brush.values, Apply)) };
}

export const ResetBrush = (Brush) => ({ ...Brush, name: Brush.reset.name, values: structuredClone(Brush.reset.values), params: structuredClone(Brush.reset.params) });
export const MakeResetPoint = (Brush) => ({ ...Brush, reset: structuredClone({ values: Brush.values, params: Brush.params, name: Brush.name }) });

// Which settings differ from the reset point — drives the "edited" dots in the section nav.
export function Changed(Brush) {
  const Out = new Set();
  for (const K of Object.keys(FIELDS)) if (JSON.stringify(Brush.values[K]) !== JSON.stringify(Brush.reset.values[K])) Out.add(K);
  for (const K of Object.keys(Brush.params || {})) if (Brush.params[K] !== Brush.reset.params?.[K]) Out.add(`instrument.${K}`);
  return Out;
}

export function ChangedBySection(Brush) {
  const C = Changed(Brush), Out = {};
  for (const Sec of SECTIONS) {
    if (Sec.Id === "instrument") Out[Sec.Id] = [...C].filter((K) => K.startsWith("instrument.")).length;
    else if (Sec.Id === "about") Out[Sec.Id] = Brush.name !== Brush.reset.name ? 1 : 0;
    else Out[Sec.Id] = Sec.Groups.flatMap((G) => G.Fields).filter((F) => C.has(F.K)).length;
  }
  return Out;
}

export function Duplicate(Brush) {
  return { ...structuredClone(Brush), id: `${Brush.instrument}~${Math.random().toString(36).slice(2, 8)}`, name: `${Brush.name} copy`.slice(0, 80), created: Iso() };
}

export function Export(Brush) {
  const { reset, ...Rest } = Brush;
  return JSON.stringify({ ...Rest, schema: SCHEMA_ID, reset }, null, 2);
}

export function Import(Text) {
  const Raw = JSON.parse(Text);
  if (Raw.schema && Raw.schema !== SCHEMA_ID) throw new Error(`Unsupported schema ${Raw.schema}`);
  return NormaliseBrush(Raw);
}

export const VisibleFields = (Group, Values) => Group.Fields.filter((F) => !F.When || F.When(Values));

// Size / opacity actually used for painting (Properties min/max clamp the "current" slider).
export function EffectiveSize(Values, Scale = 1) {
  const Lo = Values["prop.minSize"], Hi = Values["prop.maxSize"], T = Values["prop.size"] / 100;
  const Pct = Lo + (Hi - Lo) * T;
  return Math.max(0.6, (1 + (Pct / 100) ** 1.25 * 260) * Scale);
}
export function EffectiveOpacity(Values) {
  const Lo = Values["prop.minOpacity"], Hi = Values["prop.maxOpacity"];
  return (Lo + (Hi - Lo) * (Values["prop.opacity"] / 100)) / 100;
}

// One-line description for library rows.
export function Caption(Brush) {
  const V = Brush.values;
  const Mode = RENDER_MODES.find((M) => M.Id === V["render.mode"])?.Label || "";
  const Shape = SHAPES.find((S) => S.Id === V["shape.source"])?.Label || "";
  const Grain = V["grain.source"] !== "none" ? ` · ${GRAINS.find((G) => G.Id === V["grain.source"])?.Label} grain` : "";
  return `${Shape}${Grain} · ${Mode.toLowerCase()}`;
}
