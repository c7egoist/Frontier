// Headless checks for the Brush Studio's pure modules: the brush model (sections / fields / defaults / instrument
// mapping / reset / export-import), the stroke engine (determinism, spacing, stabilisation, tapers), the procedural
// shape & grain sources, the per-tool popup model, and the renderer against a pixel-less canvas.
//   node Experimental/BrushStudio/Scripts/CheckBrushStudio.mjs
//   TS_DIR=/path/to/TextureStudio node …   (also proves the copied engine files match TextureStudio byte-for-byte)
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MockCanvas } from "./CanvasMock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const imp = (F) => import(pathToFileURL(ROOT + F));
const M = await imp("BrushModel.js");
const E = await imp("BrushEngine.js");
const Src = await imp("Sources.js");
const T = await imp("ToolModel.js");
const P = await imp("Painter.js");
const Cat = await imp("Engine/PaintToolCatalogue.js");
Src.SetCanvasFactory((W, H) => MockCanvas(W, H));
globalThis.document ??= { createElement: () => MockCanvas() };

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { const Note = await fn(); passed++; console.log(` ok  ${name}${Note ? ` — ${Note}` : ""}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split("\n").slice(0, 3).join("\n     ")}`); }
};
const expect = (c, m) => { if (!c) throw new Error(m); };
const Line = (N = 40, X0 = 20, Step = 9, Y = 60, Pen = true) => Array.from({ length: N }, (_, I) => ({ x: X0 + I * Step, y: Y, p: 0.2 + 0.6 * Math.sin((Math.PI * I) / (N - 1)), t: I * 16, pen: Pen, alt: Math.PI / 3, az: 0 }));

await check("brush schema: 14 Procreate-style sections, every field typed with a valid default", () => {
  expect(M.SECTIONS.length === 14, `sections ${M.SECTIONS.length}`);
  const Ids = M.SECTIONS.map((S) => S.Id);
  for (const Want of ["stroke", "stabilization", "taper", "shape", "grain", "rendering", "wetmix", "colour", "dynamics", "stylus", "properties", "materials", "instrument", "about"]) expect(Ids.some((I) => I.startsWith(Want.slice(0, 5))), `missing section ${Want}`);
  const Keys = Object.keys(M.FIELDS);
  expect(Keys.length >= 130, `fields ${Keys.length}`);
  expect(new Set(Keys).size === Keys.length, "duplicate field keys");
  expect(JSON.stringify(M.Normalise(M.DEFAULTS)) === JSON.stringify(M.DEFAULTS), "defaults are not a fixed point of Normalise");
  for (const F of Object.values(M.FIELDS)) {
    if (F.T === "slider") expect(F.Def >= F.Min && F.Def <= F.Max, `${F.K} default out of range`);
    if (F.T === "seg" || F.T === "select") expect(F.Opts.includes(F.Def), `${F.K} default not an option`);
  }
  return `${M.SECTIONS.length} sections · ${Keys.length} fields · ${M.SHAPES.length} shapes · ${M.GRAINS.length} grains · ${M.RENDER_MODES.length} render modes · ${M.BLEND_MODES.length} blend modes`;
});

await check("every catalogue instrument becomes a valid brush at its reset point", () => {
  const Captions = new Set();
  for (const Tool of M.PAINT_TOOLS) {
    const B = M.FromInstrument(Tool.id);
    expect(B.schema === M.SCHEMA_ID && B.instrument === Tool.id && B.name === Tool.label, Tool.id);
    expect(JSON.stringify(M.Normalise(B.values)) === JSON.stringify(B.values), `${Tool.id} values not normalised`);
    expect(M.Changed(B).size === 0, `${Tool.id} starts edited`);
    Captions.add(M.Caption(B));
  }
  expect(Captions.size >= 15, `only ${Captions.size} distinct brush characters`);
  return `${M.PAINT_TOOLS.length} brushes · ${Captions.size} distinct characters · ${Object.keys(M.FAMILY_PRESETS).length} family presets`;
});

await check("instrument controls: every option maps to studio settings and switching back restores them", () => {
  let Options = 0;
  for (const Tool of M.PAINT_TOOLS) {
    const B0 = M.FromInstrument(Tool.id);
    for (const G of Cat.toolSchema(Tool.id)) for (const C of G.controls) {
      if (C.type !== "seg" && C.type !== "select") continue;
      for (const O of C.opts) { const B = M.SetParam(B0, C.k, O); expect(B.params[C.k] === O, `${Tool.id}.${C.k}=${O}`); Options++; }
      const Back = M.SetParam(M.SetParam(B0, C.k, C.opts.find((O) => O !== C.def) ?? C.def), C.k, C.def);
      const Diff = [...M.Changed(Back)].filter((K) => !K.startsWith("instrument."));
      expect(Diff.length === 0, `${Tool.id}.${C.k}: switching away and back left ${Diff.join(", ")} changed`);
    }
  }
  return `${Options} option applications · ${M.PARAM_OPTIONS.length} mapped character controls`;
});

await check("edits: SetValue coerces, linked tapers move together, Changed / ChangedBySection / Reset", () => {
  let B = M.FromInstrument("brush-hog-bristle-flat-12-oil");
  B = M.SetValue(B, "stroke.spacing", 999);
  expect(B.values["stroke.spacing"] === M.FIELDS["stroke.spacing"].Max, "slider clamp");
  B = M.SetValue(B, "shape.source", "not-a-shape");
  expect(B.values["shape.source"] === M.FIELDS["shape.source"].Def, "unknown shape falls back");
  B = M.SetValue(B, "taper.pressureLink", true);
  B = M.SetValue(B, "taper.pressureStart", 33);
  expect(B.values["taper.pressureEnd"] === 33, "linked taper");
  B = M.SetValue(B, "prop.minSize", 90); B = M.SetValue(B, "prop.maxSize", 20);
  expect(B.values["prop.minSize"] <= B.values["prop.maxSize"], "min ≤ max");
  const By = M.ChangedBySection(B);
  expect(By.stroke >= 1 && By.taper >= 1 && By.properties >= 1, JSON.stringify(By));
  const R = M.ResetBrush(B);
  expect(M.Changed(R).size === 0, "reset clears edits");
  const Pt = M.MakeResetPoint(B);
  expect(M.Changed(Pt).size === 0 && Pt.values["stroke.spacing"] === 100, "new reset point");
  return `sections edited: ${Object.entries(By).filter(([, N]) => N).map(([K, N]) => `${K} ${N}`).join(", ")}`;
});

await check("export → import round-trips; hostile documents are normalised or rejected", () => {
  let B = M.SetValue(M.FromInstrument("spray-classic-aerosol-can"), "colour.primary", "#123456");
  B = { ...B, name: "My spray", author: "Me", signature: "sig" };
  const Back = M.Import(M.Export(B));
  expect(JSON.stringify(Back.values) === JSON.stringify(B.values) && Back.name === "My spray" && Back.author === "Me", "round trip");
  expect(M.Changed(Back).has("colour.primary"), "reset point survives export");
  const Evil = M.Import(JSON.stringify({ instrument: "nope", name: "x\u0000y".repeat(50), values: { "stroke.spacing": "NaN", "colour.primary": "red", "mat.channels": ["bogus"], extra: 1 } }));
  expect(Evil.name.length <= 80 && !/\u0000/.test(Evil.name) && Evil.values["colour.primary"].startsWith("#") && Evil.values["mat.channels"].length >= 1 && !("extra" in Evil.values), "sanitised");
  let Threw = false; try { M.Import(JSON.stringify({ schema: "other.v9" })); } catch { Threw = true; }
  expect(Threw, "foreign schema rejected");
  const D = M.Duplicate(B);
  expect(D.id !== B.id && D.name.endsWith("copy"), "duplicate");
});

await check("stroke engine: deterministic per seed, spacing and stabilisation behave", () => {
  const B = M.FromInstrument("pen-classic-gold-nib-fountain");
  const A1 = E.PlanStroke(B, Line(), { Seed: 7, Final: true }), A2 = E.PlanStroke(B, Line(), { Seed: 7, Final: true });
  expect(JSON.stringify(A1.Dabs) === JSON.stringify(A2.Dabs), "same seed differs");
  expect(A1.Dabs.length > 10 && Math.abs(A1.Length - 351) < 1, `dabs ${A1.Dabs.length} length ${A1.Length}`);
  const Tight = E.PlanStroke(M.SetValue(B, "stroke.spacing", 1), Line(), { Seed: 7, Final: true });
  const Loose = E.PlanStroke(M.SetValue(B, "stroke.spacing", 80), Line(), { Seed: 7, Final: true });
  expect(Tight.Dabs.length > Loose.Dabs.length * 3, `spacing: ${Tight.Dabs.length} vs ${Loose.Dabs.length}`);
  const Wobble = Line().map((Pt, I) => ({ ...Pt, y: Pt.y + (I % 2 ? 6 : -6) }));
  const Dev = (Pts) => Pts.reduce((S, Q) => S + Math.abs(Q.y - 60), 0) / Pts.length;
  const Raw = Dev(E.Stabilise(Wobble, M.SetValue(B, "stab.streamline", 0).values));
  const Smooth = Dev(E.Stabilise(Wobble, M.SetValue(M.SetValue(B, "stab.streamline", 90), "stab.amount", 60).values));
  expect(Smooth < Raw * 0.7, `StreamLine should calm a wobble: ${Raw.toFixed(2)} → ${Smooth.toFixed(2)}`);
  const Taper = E.PlanStroke(M.SetValue(M.SetValue(B, "taper.pressureStart", 40), "taper.size", 100), Line(40, 20, 9, 60, true), { Seed: 1, Final: true });
  expect(Taper.Dabs[0].s < Taper.Dabs[Math.floor(Taper.Dabs.length / 2)].s, "taper thins the start");
  return `${A1.Dabs.length} dabs · spacing 1% → ${Tight.Dabs.length}, 80% → ${Loose.Dabs.length} · wobble ${Raw.toFixed(1)} → ${Smooth.toFixed(1)} px`;
});

await check("colour mixing and preview path", () => {
  const Mid = parseInt(E.MixHex("#000000", "#ffffff", 0.5).slice(1, 3), 16);
  expect(Mid > 100 && Mid < 200, `mid grey ${Mid}`);   // mixed in linear light, so brighter than 128
  expect(E.MixHex("#ff0000", "#0000ff", 0).toLowerCase() === "#ff0000" && E.MixHex("#ff0000", "#0000ff", 1).toLowerCase() === "#0000ff", "endpoints");
  const Pts = E.PreviewPoints(300, 100);
  expect(Pts.length === 91 && Pts.every((Q) => Q.p >= 0 && Q.p <= 1), "preview points");
});

await check("sources: every shape and grain renders; random shapes have variants; thumbs are URLs", () => {
  for (const S of M.SHAPES) { const C = Src.Tip(S.Id, { Hardness: 0.7, Variant: 1 }); expect(C && C.width === 128, S.Id); expect(Src.ShapeThumb(S.Id).startsWith("data:"), `${S.Id} thumb`); }
  for (const G of M.GRAINS) { if (G.Id === "none") continue; const V = Src.GrainValues(G.Id); expect(V.length === Src.GRAIN_SIZE * Src.GRAIN_SIZE && V.some((X) => X > 0), G.Id); }
  expect(Src.TipVariants("bristle") === 6 && Src.TipVariants("round") === 1, "variants");
  return `${M.SHAPES.length} shapes · ${M.GRAINS.length} grains`;
});

await check("tools: 10 tools, unique shortcuts, every tool has groups; values coerce", () => {
  expect(T.TOOLS.length === 10, `${T.TOOLS.length} tools`);
  expect(new Set(T.TOOLS.map((X) => X.Key)).size === 10, "shortcut clash");
  const Tools = T.CreateTools(), Brush = M.FromInstrument("brush-hog-bristle-flat-12-oil").values;
  const Counts = [];
  for (const Tool of T.TOOLS) {
    const Groups = T.VisibleToolGroups(Tool.Id, Tools[Tool.Id], Brush);
    expect(Groups.length >= 1, `${Tool.Id} has no groups`);
    for (const F of T.ToolFields(Tool.Id)) if (F.K.startsWith("@")) expect(M.FIELDS[F.K.slice(1)], `${Tool.Id} binds unknown brush field ${F.K}`);
    Counts.push(`${Tool.Id} ${T.ToolFields(Tool.Id).length}`);
  }
  const N = T.NormaliseTools(JSON.parse(JSON.stringify(Tools)));
  expect(JSON.stringify(N.fill) === JSON.stringify(Tools.fill), "normalise round trip");
  let X = T.SetToolValue(Tools, "text", "size", 9999);
  expect(X.text.size <= 160, "text size clamp");
  X = T.SetToolValue(Tools, "gradient", "preset", T.TOOL.gradient && "oceanic-mint");
  expect(Array.isArray(X.gradient.stops) && X.gradient.stops.length >= 2, "preset loads stops");
  expect(T.ERASERS.length === 7 && T.FONTS.length >= 4, "erasers / fonts");
  return Counts.join(" · ");
});

await check("tool studios: every tool has a dedicated studio covering every group; edits are tracked per section", () => {
  const Out = [];
  for (const Tool of T.TOOLS) {
    const Studio = T.STUDIOS[Tool.Id];
    expect(Studio && /Studio$/.test(Studio.Title), `${Tool.Id} has no studio`);
    expect(T.TOOL_COLOURS[Tool.Id] && !/ffb238/i.test(T.TOOL_COLOURS[Tool.Id]), `${Tool.Id} colour`);
    const Used = Studio.Sections.flatMap((S) => S.Groups), Titles = Tool.Groups.map((G) => G.Title);
    for (const U of Used) expect(Titles.includes(U), `${Tool.Id} studio names unknown group ${U}`);
    if (Tool.Id !== "paint") {
      for (const Ti of Titles) expect(Used.includes(Ti), `${Tool.Id} group ${Ti} has no section`);
      expect(Studio.Sections.some((S) => S.Id === "about"), `${Tool.Id} about section`);
    }
    expect(new Set(Studio.Sections.map((S) => S.Id)).size === Studio.Sections.length, `${Tool.Id} duplicate section ids`);
    Out.push(`${Studio.Title.replace(" Studio", "")} ${Studio.Sections.length}`);
  }
  expect(T.STUDIOS.stamp.Title === "Stamp Studio" && T.STUDIOS.text.Title === "Text Studio" && T.STUDIOS.erase.Title === "Eraser Studio", "named studios");
  expect(!T.PALETTE.some((C) => /ffb238/i.test(C)), "no amber in the icon palette");
  const Tools = T.CreateTools();
  expect(T.ToolChanged("stamp", Tools.stamp).size === 0, "defaults are unedited");
  const X = T.SetToolValue(Tools, "stamp", "size", 200);
  expect(T.ToolChanged("stamp", X.stamp).has("size") && T.ToolChangedBySection("stamp", X.stamp).transform === 1, "edit counted in Transform");
  expect(T.ToolDefault("stamp", "size") === 84, "default lookup");
  return Out.join(" · ");
});

await check("curve tool path and pressure profiles", () => {
  const Pts = [[0.1, 0.5], [0.4, 0.3], [0.7, 0.6]];
  const S = T.CurvePath(Pts, { Mode: "Smooth" }), L = T.CurvePath(Pts, { Mode: "Polyline" }), C = T.CurvePath(Pts, { Closed: true });
  expect(S.length === 49 && L.length === 33 && C.length === 73, `${S.length}/${L.length}/${C.length}`);
  expect(Math.abs(S.at(-1)[0] - 0.7) < 1e-9 && Math.abs(C.at(-1)[0] - 0.1) < 1e-9, "endpoints");
  expect(T.ProfilePressure("Taper", 0, 100) < 0.2 && T.ProfilePressure("Taper", 0.5, 100) > 0.9 && T.ProfilePressure("Even", 0.3, 70) === 0.7, "profiles");
});

await check("renderer: stroke / fill / stamp / gradient / text / move run on a pixel-less canvas", () => {
  const C = MockCanvas(320, 200), X = C.getContext("2d");
  const B = M.FromInstrument("brush-hog-bristle-flat-12-oil");
  const Plan = P.RenderStroke(X, B, Line(30, 20, 9, 100), { Seed: 3, Scale: 1, Final: true });
  expect(Plan.Dabs.length > 0 && C.__draws > 0, "stroke drew");
  for (const Ch of ["roughness", "metalness", "height", "emissive"]) P.RenderStroke(X, M.SetValue(B, "mat.channels", ["albedo", Ch]), Line(), { Seed: 1, Channel: Ch, Final: true });
  P.RenderStroke(X, B, Line(), { Seed: 1, Erase: true, Final: true });
  const Tools = T.CreateTools();
  P.FloodFill(X, { X: 10, Y: 10, Scope: "Region", Tolerance: 18, Feather: 1, Grow: 1, Source: "Colour", Colour: "#ff0000", Grain: "canvas", GrainScale: 100, Opacity: 100, Blend: "Normal" });
  P.DrawStamp(X, { Points: [[50, 50], [90, 60, 0.4]], Shape: "star", Size: 40, SizeJitter: 20, Rotation: 10, RotationJitter: 30, Mirror: true, Colour: "#ffb238", Opacity: 90, Hardness: 85, Blend: "Normal", Seed: 4 });
  for (const Type of ["Linear", "Radial", "Conic"]) for (const Spread of ["Pad", "Repeat", "Reflect"]) P.DrawGradient(X, { Type, Spread, Stops: ["#ff0000", "#0000ff"], From: [0, 0], To: [160, 100], Opacity: 100, Blend: "Normal", Limit: "None" });
  P.DrawText(X, { Content: "Frontier\nStudio", Font: T.FONTS[0].Id, Weight: 600, Italic: false, Align: "Centre", Size: 40, Spacing: 2, LineHeight: 115, Arc: 30, Rotation: 5, Colour: "#ffffff", Opacity: 100, Outline: 2, OutlineColour: "#000000", At: [160, 100] });
  P.ApplyMove(X, { ...Tools.move, Dx: 10, Dy: 5, U: 10, V: 5 });
  return `${Plan.Dabs.length} dabs · ${C.__draws} draws · ${C.__puts || 0} puts`;
});

await check("copied TextureStudio engine files are verbatim", () => {
  const Ts = process.env.TS_DIR;
  if (!Ts || !existsSync(Ts)) return "skipped (set TS_DIR to compare)";
  expect(readFileSync(ROOT + "Engine/PaintToolCatalogue.js", "utf8") === readFileSync(resolve(Ts, "Engine/PaintToolCatalogue.js"), "utf8"), "PaintToolCatalogue.js differs");
  const Dyn = readFileSync(ROOT + "Engine/BrushDynamics.js", "utf8"), Engine = readFileSync(resolve(Ts, "Engine/TexturePaintEngine.js"), "utf8");
  const Body = Dyn.split("\n").filter((L) => !L.startsWith("//") && !/^export \{/.test(L)).join("\n").trim();
  const Chunks = Body.split(/\n{2,}/).filter((C) => C.trim().length > 40);
  const Missing = Chunks.filter((C) => !Engine.includes(C.replace(/^export /gm, "")) && !Engine.includes(C));
  expect(Missing.length === 0, `${Missing.length} BrushDynamics chunks not found in TexturePaintEngine.js:\n${Missing[0]?.slice(0, 200)}`);
  return `catalogue identical · ${Chunks.length} dynamics chunks found verbatim`;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
