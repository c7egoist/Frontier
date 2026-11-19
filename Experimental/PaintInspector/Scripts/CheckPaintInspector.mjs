// Model checks for the Texture Paint layer card (pure Node, no DOM).
//   node Experimental/PaintInspector/Scripts/CheckPaintInspector.mjs
// PaintModel.js builds layers with TextureStudio's TexturePaintEngine, which imports bare "three"; this script registers a
// resolve hook mapping it to the vendored build (the page does the same with an importmap).
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const EXP = resolve(ROOT, "..") + "/";
const THREE = pathToFileURL(EXP + "TextureStudio/Vendor/three.esm.min.js").href;
register("data:text/javascript," + encodeURIComponent(`export async function resolve(S, C, N) { return S === "three" ? { url: ${JSON.stringify(THREE)}, shortCircuit: true } : N(S, C); }`));

const B = await import(pathToFileURL(ROOT + "PaintModel.js"));
const CS = await import(pathToFileURL(EXP + "MaterialInspector/ChannelStack.js"));
const Engine = await import(pathToFileURL(EXP + "TextureStudio/Engine/TexturePaintEngine.js"));

let Pass = 0, Fail = 0;
const Check = async (Name, Fn) => {
  try { const Note = await Fn(); Pass++; console.log(` ok  ${Name}${Note ? ` — ${Note}` : ""}`); }
  catch (E) { Fail++; console.log(`FAIL ${Name}\n     ${E.stack.split("\n").slice(0, 3).join("\n     ")}`); }
};
const Expect = (C, Msg) => { if (!C) throw new Error(Msg); };
const Throws = (Fn, Msg) => { try { Fn(); } catch { return; } throw new Error(Msg); };
const Sig = (P) => JSON.stringify(B.Serialise(P));

await Check("channel catalogue is the engine's: 22 channels in 5 groups, Core first", () => {
  Expect(B.PAINT_CHANNELS.length === 22 && CS.PAINT_GROUPS.join() === "Core,Surface,Coat,Optics,Emission", "counts");
  Expect(CS.CORE_CHANNELS.join() === "albedo,roughness,metalness,height,normal,ao,opacity", `core ${CS.CORE_CHANNELS}`);
  const Ids = new Set(B.PAINT_CHANNELS.map((C) => C.Id));
  for (const C of Engine.ALL_PAINT_CHANNELS || []) Expect(Ids.has(C.key), `engine channel ${C.key} missing`);
  return CS.PAINT_GROUPS.map((G) => `${G} ${B.PAINT_CHANNELS.filter((C) => C.Group === G).length}`).join(" · ");
});

await Check("PbrChannelDefinitions copy is byte-identical to TextureStudio's", () => {
  const A = readFileSync(EXP + "MaterialInspector/Engine/PbrChannelDefinitions.js"), Bt = readFileSync(EXP + "TextureStudio/Engine/PbrChannelDefinitions.js");
  Expect(A.equals(Bt), "MaterialInspector/Engine/PbrChannelDefinitions.js drifted from TextureStudio/Engine/");
});

await Check("starter document: engine schema, six layers, a folder holding two", () => {
  const P = B.Create();
  Expect(P.schema === B.SCHEMA && P.schema === "frontier.texture-paint.v2", "schema");
  Expect(P.layers.length === 6 && B.Selected(P)?.kind === "paint", "layers / selection");
  const F = P.layers.find((L) => L.kind === "folder");
  Expect(B.TopFirst(P, F.id).length === 2, "folder contents");
  Expect(B.TopFirst(P).length === 4 && B.TopFirst(P)[0].id === F.id, "top-first order");
  return B.TopFirst(P).map((L) => L.name).join(" › ");
});

await Check("every layer type adds through createPaintLayer with all 22 engine keys", () => {
  let P = B.Create();
  const Keys = Object.keys(Engine.createPaintLayer("paint", { res: B.RES })).sort().join();
  for (const T of B.LAYER_TYPES) {
    const R = B.AddLayer(P, T.Id); P = R.Next;
    const L = B.Layer(P, R.Id);
    Expect(L && B.TypeOf(L) === T.Id && P.selectedLayerId === R.Id, `${T.Id} added + selected`);
    // a gradient layer is an engine paint layer plus its point gradient
    Expect(Object.keys(L).filter((K) => K !== "gradient").sort().join() === Keys && (T.Id === "gradient") === !!L.gradient, `${T.Id} keys`);
  }
  return `${B.LAYER_TYPES.length} types`;
});

await Check("export → load round trip is lossless and strips texels", () => {
  let P = B.Create();
  P = B.AssignChannelField(P, P.layers[0].id, "roughness", "value", 37);
  const J = B.Export(P), Q = B.Load(J);
  Expect(Sig(Q) === Sig(P), "round trip");
  Expect(!/"pixels"\s*:\s*\{/.test(J), "pixels serialised");
  Throws(() => B.Load("{nope"), "bad JSON accepted");
  return `${(J.length / 1024).toFixed(1)} KB`;
});

await Check("normalise repairs hostile input", () => {
  const P = B.Normalise({ layers: [{ kind: "fill", blend: "Quantum", opacity: 7, channels: { roughness: 1 }, channelOpacity: { roughness: -2 }, channelBlends: { roughness: "Nope" } }], selectedLayerId: "x" });
  const L = P.layers[0];
  Expect(L.blend === "Normal" && L.opacity === 1, "blend / opacity");
  Expect(L.channels.roughness === true && L.channelOpacity.roughness === 0 && L.channelBlends.roughness === "Inherit", "channels");
  Expect(P.selectedLayerId === L.id, "selection repaired");
  Expect(B.Normalise({ layers: [] }).layers.length === 1, "an empty document still yields a layer");
  Throws(() => B.Normalise({}), "a non-document is accepted");
});

await Check("channel stack view ↔ engine fields (scalars ×100, colours verbatim)", () => {
  let P = B.Create();
  const Id = P.layers.find((L) => L.kind === "fill").id;
  P = B.AssignChannelField(P, Id, "roughness", "value", 70);
  P = B.AssignChannelField(P, Id, "albedo", "value", "#336699");
  P = B.AssignChannelField(P, Id, "clearcoat", "opacity", 40);
  P = B.AssignChannelField(P, Id, "metalness", "blend", "Multiply");
  const L = B.Layer(P, Id), S = B.LayerStack(L);
  Expect(L.fill.roughness === 0.7 && L.fill.color === "#336699", `fill ${L.fill.roughness} ${L.fill.color}`);
  Expect(L.channelOpacity.clearcoat === 0.4 && L.channelBlends.metalness === "Multiply", "opacity / blend");
  Expect(S.per.roughness.value === 70 && S.per.albedo.value === "#336699", "read back");
  const T = B.AssignLayerStack(P, Id, { ...S, on: ["albedo", "emissive"] });
  Expect(B.LayerStack(B.Layer(T, Id)).on.join() === "albedo,emissive", "switches");
});

await Check("paint layers expose opacity + blend only (the brush decides values)", () => {
  const P = B.Create();
  for (const L of P.layers.filter((E) => E.kind === "paint" && !E.gradient)) {
    Expect(!B.QueryLayerValues(L), `${L.kind} values`);
    const Keys = CS.CardFields(B.LayerCard(L), CS.PAINT_CHANNEL.roughness).map((F) => F.K);
    Expect(!Keys.includes("value") && Keys.includes("opacity") && Keys.includes("blend"), `${L.kind} card ${Keys}`);
    Expect(!("value" in B.LayerStack(L).per.albedo), `${L.kind} stack value`);
  }
});

await Check("text and stamp layers show their own values; edits land in the text spec / the picked stamp", () => {
  let P = B.Create();
  const T = P.layers.find((E) => E.kind === "text"), D = P.layers.find((E) => E.kind === "decal");
  Expect(B.QueryLayerValues(T) && B.LayerStack(T).per.roughness.value === Math.round(T.text.roughness * 100) && B.LayerStack(T).per.albedo.value === T.text.color, "text reads the text spec");
  P = B.AssignChannelField(P, T.id, "metalness", "value", "64");
  const T2 = B.Layer(P, T.id);
  Expect(T2.text.metalness === 0.64 && T2.stamps.every((St) => St.text.metalness === 0.64), "text metalness → spec + stamps");
  Expect(B.LayerStack(D).per.albedo.value === D.stamps[0].tint && !("value" in B.LayerStack(D).per.roughness), "stamp: tint, roughness from the image");
  P = B.AssignChannelField(P, D.id, "roughness", "value", "40");
  const D2 = B.Layer(P, D.id);
  Expect(D2.stamps[0].roughness === 0.4 && D2.stamps[0].metalness === null, "stamp roughness override only");
  P = B.AssignChannelField(P, D.id, "emissive", "on", false);
  return "text + stamp";
});

await Check("gradient layers: every point (and the background) has its own surface values", () => {
  let P = B.Create();
  const { Next, Id } = B.AddLayer(P, "gradient"); P = Next;
  const L = B.Layer(P, Id), [A, Bp] = L.gradient.points;
  Expect(L.kind === "paint" && B.TypeOf(L) === "gradient", "paint layer + gradient");
  Expect(B.LayerStack(L, A.id).per.metalness.value === Math.round(A.metalness * 100) && B.LayerStack(L, Bp.id).per.metalness.value === Math.round(Bp.metalness * 100) && A.metalness !== Bp.metalness, "per-point values");
  Expect(B.LayerStack(L, B.BACKGROUND).per.albedo.value === L.gradient.background, "background entry");
  P = B.AssignChannelField(P, Id, "roughness", "value", "81", Bp.id);
  let G = B.Layer(P, Id).gradient;
  Expect(G.points[1].roughness === 0.81 && G.points[0].roughness === A.roughness, "edit lands on the picked point only");
  P = B.AssignChannelField(P, Id, "emissive", "value", "#00ff88", B.BACKGROUND);
  Expect(B.Layer(P, Id).gradient.backgroundSurface.extValues.emissive === "#00ff88", "background extended value");
  const Add = B.AddPoint(P, Id, A.id); P = Add.Next;
  G = B.Layer(P, Id).gradient;
  Expect(G.points.length === 3 && G.points[2].metalness === A.metalness, "added point copies the picked one");
  P = B.EditPoint(P, Id, Add.Point, { radius: 2, color: "#123456" });
  P = B.RemovePoint(P, Id, A.id);
  G = B.Layer(P, Id).gradient;
  Expect(G.points.length === 2 && G.points[1].radius === 2 && G.points[1].color === "#123456", "edit + remove");
  const Back = B.Normalise(JSON.parse(B.Export(P)));
  Expect(JSON.stringify(B.Layer(Back, Id).gradient) === JSON.stringify(G), "round trip keeps the gradient");
  return `${G.points.length} points`;
});

await Check("duplicate gets a fresh id and sits above the source", () => {
  const P = B.Create(), Src = P.layers[0];
  const { Next, Id } = B.Duplicate(P, Src.id);
  Expect(Id && Id !== Src.id && Next.layers.length === 7, "id / count");
  Expect(Next.layers.indexOf(B.Layer(Next, Id)) === Next.layers.indexOf(B.Layer(Next, Src.id)) + 1, "position");
  Expect(B.Layer(Next, Id).name.includes(Src.name), "name");
});

await Check("remove a folder lifts its layers to the enclosing level", () => {
  const P = B.Create(), F = P.layers.find((L) => L.kind === "folder");
  const Q = B.Remove(P, F.id);
  Expect(Q.layers.length === 5 && !B.Layer(Q, F.id), "removed");
  Expect(Q.layers.every((L) => !L.parentId), "lifted");
  Expect(B.Layer(Q, Q.selectedLayerId), "selection valid");
});

await Check("move: before / after / inside, no cycles, no nesting into non-folders", () => {
  let P = B.Create();
  const [Coat, Wear, Hand, F] = P.layers;
  let Q = B.Move(P, Coat.id, Hand.id, "before");
  Expect(Q.layers.indexOf(B.Layer(Q, Coat.id)) > Q.layers.indexOf(B.Layer(Q, Hand.id)), "before = above");
  Q = B.Move(P, Hand.id, Coat.id, "after");
  Expect(Q.layers.indexOf(B.Layer(Q, Hand.id)) < Q.layers.indexOf(B.Layer(Q, Coat.id)), "after = below");
  Q = B.Move(P, Wear.id, F.id, "inside");
  Expect(B.Layer(Q, Wear.id).parentId === F.id && B.Depth(Q, Wear.id) === 1, "inside");
  const G = B.AddLayer(B.Select(Q, F.id), "folder"); Q = G.Next;
  Expect(B.Layer(Q, G.Id).parentId === F.id, "new folder lands in the selected folder");
  Expect(B.Move(Q, F.id, G.Id, "inside") === Q, "cycle refused");
  Expect(B.Move(Q, Coat.id, Hand.id, "inside") === Q, "nest into a paint layer refused");
});

await Check("material preset applies the engine's overrides", () => {
  let P = B.Create();
  const R = B.AddLayer(P, "material"); P = R.Next;
  const M = B.MATERIALS.find((E) => E.metalness >= 0.9) || B.MATERIALS[0];
  P = B.UseMaterial(P, R.Id, M.id);
  const L = B.Layer(P, R.Id), Ov = Engine.createMaterialLayerOverridesFromPreset(M, B.RES);
  Expect(L.material.presetId === M.id && L.name === M.name, "preset / name");
  for (const K of new Set([...Object.keys(L.material), ...Object.keys(Ov.material)])) Expect(JSON.stringify(L.material[K]) === JSON.stringify(Ov.material[K]), `material.${K}`);
  Expect(B.UseMaterial(P, R.Id, "no-such-material") === P, "unknown preset ignored");
  return `${B.MATERIALS.length} presets · ${M.name}`;
});

await Check("mask add / remove, stats and painted channels", () => {
  let P = B.Create();
  const Id = P.layers[0].id;
  P = B.AssignMask(P, Id, true);
  Expect(B.Layer(P, Id).mask?.enabled === true, "mask added");
  const N = B.Stats(P);
  Expect(N.Masks === 2 && N.Folders === 1 && N.Layers === 5, JSON.stringify(N));
  P = B.AssignMask(P, Id, false);
  Expect(B.Layer(P, Id).mask === null, "mask removed");
  const Hidden = B.Edit(P, P.layers.find((L) => L.kind === "folder").id, { visible: false });
  Expect(B.Stats(Hidden).Visible === 3, "folder hides its layers");
  return `painted ${B.Painted(P).join(", ")}`;
});

await Check("edits are pure — the input document is never mutated", () => {
  const P = B.Create(), Before = Sig(P), Id = P.layers[0].id;
  B.AssignChannelField(P, Id, "roughness", "value", 1); B.Rename(P, Id, "X"); B.Remove(P, Id); B.Move(P, Id, P.layers[2].id, "before"); B.AssignMask(P, Id, true);
  Expect(Sig(P) === Before, "mutated");
});

await Check("rename strips control characters and keeps a name", () => {
  const P = B.Create(), Id = P.layers[0].id;
  Expect(B.Layer(B.Rename(P, Id, "A\u0007B"), Id).name === "AB", "control");
  Expect(B.Layer(B.Rename(P, Id, ""), Id).name === P.layers[0].name, "empty");
});

console.log(`\n${Pass} passed, ${Fail} failed`);
process.exit(Fail ? 1 : 0);
