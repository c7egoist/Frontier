// Model checks for the Pattern / Stamp Studio card (pure Node, no DOM).
//   node Experimental/ArtworkInspector/Scripts/CheckArtworkInspector.mjs
// Optional: TS_DIR=…/Experimental/TextureStudio confirms the copied engine files are byte-identical to TextureStudio's.
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const A = await import(pathToFileURL(ROOT + "ArtworkModel.js"));
let Pass = 0, Fail = 0;
const Check = async (Name, Fn) => {
  try { const Note = await Fn(); Pass++; console.log(` ok  ${Name}${Note ? ` — ${Note}` : ""}`); }
  catch (E) { Fail++; console.log(`FAIL ${Name}\n     ${E.stack.split("\n").slice(0, 3).join("\n     ")}`); }
};
const Expect = (C, Msg) => { if (!C) throw new Error(Msg); };
const Throws = (Fn, Msg) => { try { Fn(); } catch { return; } throw new Error(Msg); };
const First = (Mode) => A.Create(Mode, A.Catalog(Mode)[0].Id);

await Check("every starter builds, evaluates and exports (both modes)", () => {
  let Slowest = 0, N = 0;
  for (const Mode of ["pattern", "stamp"]) for (const E of A.Catalog(Mode)) {
    const D = A.Create(Mode, E.Id), S = A.Stats(D);
    Expect(D.mode === Mode && D.starterId === E.Id && D.layers.length, `${E.Id} doc`);
    Expect(S.Instances > 0 && S.Coverage > 0 && S.Coverage <= 1, `${E.Id} stats ${S.Instances} ${S.Coverage}`);
    Expect(A.ExportSvg(D, 64).startsWith("<svg"), `${E.Id} svg`);
    Expect(A.LayerRows(D, A.Selected(D)).length >= 5, `${E.Id} rows`);
    Slowest = Math.max(Slowest, S.Milliseconds); N++;
  }
  return `${N} starters, slowest stats ${Slowest.toFixed(1)} ms`;
});

await Check("catalog entries carry id / name / group", () => {
  for (const Mode of ["pattern", "stamp"]) for (const E of A.Catalog(Mode)) Expect(E.Id && E.Name && E.Group, `${Mode} ${E.Id}`);
  return `${A.Catalog("pattern").length} pattern · ${A.Catalog("stamp").length} stamp`;
});

await Check("edge statistic: patterns wrap the seam, stamps keep a margin", () => {
  const Hex = A.Stats(A.Create("pattern", "noise-hex-matrix"));
  Expect(Hex.Wraps > 0, "hex matrix wraps");
  const Stamp = A.Stats(First("stamp"));
  Expect(Stamp.Wraps === 0 && Stamp.Margin > 0 && !Stamp.Clipped, "stamp margin");
  let D = First("stamp");
  D = A.EditLayer(D, A.Selected(D).id, (L) => { L.transform.x = 10; });
  Expect(A.Stats(D).Clipped, "pushing a decal over the border flags it clipped");
  return `hex ${Hex.Wraps} wraps · disc margin ${Math.round(Stamp.Margin)} px`;
});

await Check("edits are immutable and round-trip through the project format", () => {
  const D = First("pattern"), Before = JSON.stringify(D);
  const D2 = A.EditLayer(D, A.Selected(D).id, (L) => { L.opacity = 0.3; });
  Expect(JSON.stringify(D) === Before, "original untouched");
  const Text = A.ExportProject(D2), Raw = JSON.parse(Text);
  Expect(Raw.schema === "frontier.pattern.v1" && Raw.document.layers.length === D.layers.length && !("resolution" in Raw.document), "TextureStudio save shape");
  const Back = A.Load(Text);
  Expect(Back.mode === "pattern" && A.Selected(Back).opacity === 0.3, "reload");
  Expect(A.Load(A.ExportProject(First("stamp"))).mode === "stamp", "stamp schema → stamp mode");
  Expect(A.Load(JSON.stringify(D)).layers.length === D.layers.length, "bare document accepted");
});

await Check("load rejects malformed documents", () => {
  Throws(() => A.Load("{}"), "no layers");
  Throws(() => A.Load(JSON.stringify({ layers: [] })), "empty layers");
  Throws(() => A.Load(JSON.stringify({ layers: [{ kind: "teapot" }] })), "bad kind");
  Throws(() => A.Load(JSON.stringify({ layers: [{ kind: "motif", modifiers: 4 }] })), "bad modifiers");
  Expect(A.Load(JSON.stringify({ resolution: 99999, document: First("pattern") })).resolution === 1024, "resolution clamp");
});

await Check("layers: add every kind, duplicate, move, remove", () => {
  let D = First("pattern");
  const N = D.layers.length;
  for (const Kind of ["motif", "text", "gradient"]) { const R = A.AddLayer(D, Kind); D = R.Doc; Expect(A.FindLayer(D, R.Id)?.kind === Kind && D.selectedLayerId === R.Id, Kind); }
  const Dup = A.DuplicateLayer(D, D.selectedLayerId);
  Expect(Dup.Doc.layers.length === N + 4 && Dup.Id !== D.selectedLayerId, "dup");
  D = Dup.Doc;
  const At = D.layers.findIndex((L) => L.id === Dup.Id);
  D = A.MoveLayer(D, Dup.Id, -1);
  Expect(D.layers.findIndex((L) => L.id === Dup.Id) === At - 1, "move");
  D = A.RemoveLayer(D, Dup.Id);
  Expect(D.layers.length === N + 3 && D.layers.some((L) => L.id === D.selectedLayerId), "remove keeps a selection");
});

await Check("modifiers: add / patch (clamped) / reorder / remove", () => {
  let D = First("stamp");
  const Id = A.Selected(D).id;
  const R = A.AddModifier(D, Id, "array-radial"); D = R.Doc;
  Expect(A.Selected(D).modifiers.at(-1).id === R.Id, "added");
  D = A.PatchModifier(D, Id, R.Id, "count", 12);
  Expect(A.Selected(D).modifiers.at(-1).count === 12, "patched");
  Expect(A.Stats(D).Instances >= 12, "radial multiplies instances");
  const R2 = A.AddModifier(D, Id, "noise-jitter"); D = R2.Doc;
  D = A.MoveModifier(D, Id, R2.Id, -1);
  Expect(A.Selected(D).modifiers[0].id === R2.Id || A.Selected(D).modifiers.at(-2).id === R2.Id, "moved");
  D = A.RemoveModifier(D, Id, R.Id);
  Expect(!A.Selected(D).modifiers.some((M) => M.id === R.Id), "removed");
  for (const Def of A.MODIFIER_DEFINITIONS) Expect(A.MODIFIER_FIELDS[Def.type] && A.MODIFIER_GLYPH[Def.type], `schema for ${Def.type}`);
  return `${A.MODIFIER_DEFINITIONS.length} modifier types have editor schemas`;
});

await Check("colour slots: solid → linear → radial, stops 2–12, angle", () => {
  let D = First("pattern");
  const Id = A.Selected(D).id;
  D = A.SetSlotMode(D, Id, "fill", "linear");
  Expect(A.SlotState(D, Id, "fill").Mode === "linear" && A.SlotState(D, Id, "fill").Stops.length >= 2, "linear");
  for (let I = 0; I < 14; I++) D = A.SlotStops(D, Id, "fill", true);
  Expect(A.SlotState(D, Id, "fill").Stops.length === 12, "max 12 stops");
  for (let I = 0; I < 14; I++) D = A.SlotStops(D, Id, "fill", false);
  Expect(A.SlotState(D, Id, "fill").Stops.length === 2, "min 2 stops");
  D = A.SetSlotColour(D, Id, "fill", 1, "#123456");
  Expect(A.SlotState(D, Id, "fill").Stops[1].color === "#123456", "stop colour");
  D = A.SetSlotAngle(D, Id, "fill", 30);
  Expect(A.SlotState(D, Id, "fill").Angle === 30, "angle");
  D = A.SetSlotMode(D, Id, "fill", "solid");
  Expect(/^#/.test(A.SlotCss(A.SlotState(D, Id, "fill"))) || A.SlotCss(A.SlotState(D, Id, "fill")).length, "solid css");
});

await Check("surface: finish presets and channel switches", () => {
  let D = First("stamp");
  const Id = A.Selected(D).id;
  D = A.SetFinish(D, Id, "foil");
  Expect(A.Selected(D).surface.finish === "foil" && A.ChannelValue(A.Selected(D), "metalness") > 0.5, "foil is metallic");
  const Off = A.ARTWORK_PBR_CHANNELS.find((C) => !A.Selected(D).surface.channels[C.key] && !C.isColor);
  D = A.SetChannelOn(D, Id, Off.key, true);
  Expect(A.Selected(D).surface.channels[Off.key], "channel on");
  D = A.SetChannelValue(D, Id, Off.key, 99);
  Expect(A.ChannelValue(A.Selected(D), Off.key) <= (Off.max ?? 1), "value clamped");
  D = A.SetChannelOn(D, Id, Off.key, false);
  Expect(!A.Selected(D).surface.channels[Off.key], "channel off");
  return `${A.ARTWORK_PBR_CHANNELS.length} channels · ${Object.keys(A.ARTWORK_FINISHES).length} finishes`;
});

await Check("shape parameter ranges match the engine's clamps", () => {
  for (const [Type, Fields] of Object.entries(A.SHAPE_FIELDS)) for (const F of Fields) Expect(F.Min < F.Max && F.Step > 0, `${Type}.${F.Key}`);
  const Src = readFileSync(ROOT + "Engine/Patterns/ArtworkStackEngine.js", "utf8");
  Expect(/innerRatio[^\n]*0\.92/.test(Src) && A.SHAPE_FIELDS.ring.find((F) => F.Key === "innerRatio").Max === 0.92, "ring inner ratio 0.92");
  return `${Object.keys(A.SHAPE_FIELDS).length} parametric shapes`;
});

await Check("palette counts distinct authored colours and contrast", () => {
  const Carbon = A.Palette(A.Create("pattern", "tech-carbon-twill"));
  Expect(Carbon.Colours.length >= 2 && Carbon.Contrast < 0.25, `carbon twill is low-contrast (${Carbon.Contrast.toFixed(2)})`);
  const Hex = A.Palette(A.Create("pattern", "noise-hex-matrix"));
  Expect(Hex.Contrast > 0.5, "hex matrix is high-contrast");
  return `carbon ${Carbon.Contrast.toFixed(2)} · hex ${Hex.Contrast.toFixed(2)}`;
});

const TS = process.env.TS_DIR;
if (TS && existsSync(TS)) {
  await Check("copied engine files are byte-identical to TextureStudio", () => {
    for (const F of ["NoiseField.js", "PbrChannelDefinitions.js", "Patterns/ArtworkStackEngine.js"]) {
      Expect(readFileSync(`${ROOT}Engine/${F}`, "utf8") === readFileSync(`${TS}/Engine/${F}`, "utf8"), F);
    }
  });
} else console.log("skip interop (set TS_DIR to a TextureStudio checkout)");

console.log(`\n${Pass} passed, ${Fail} failed`);
process.exit(Fail ? 1 : 0);
