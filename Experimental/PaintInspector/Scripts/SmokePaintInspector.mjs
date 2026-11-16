// UI smoke test: boots the Texture Paint page (layer outliner + layer card) in jsdom and drives every path — outliner select,
// add every layer type, eye / lock, rename, delete, drag to reorder and into a folder, filters; card blend / part / opacity,
// every kind card (fill, material preset, generator, stamps + text), the ChannelStack (fold, open, toggle, group switch,
// bulk, search, value / opacity / blend per channel), lock guard, mask add / edit / remove, undo / redo, export, copy, import.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/PaintInspector/Scripts/SmokePaintInspector.mjs
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";

// TexturePaintEngine imports bare "three" (the page maps it with an importmap).
const THREE = pathToFileURL(resolve(ROOT, "../TextureStudio/Vendor/three.esm.min.js")).href;
register("data:text/javascript," + encodeURIComponent(`export async function resolve(S, C, N) { return S === "three" ? { url: ${JSON.stringify(THREE)}, shortCircuit: true } : N(S, C); }`));
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost:8097/Experimental/PaintInspector/", pretendToBeVisual: true });
const w = dom.window;
const errors = [];
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + ((e && e.stack) || e)));
w.addEventListener("error", (e) => errors.push("window error: " + ((e.error && e.error.stack) || e.message)));

// 2D canvas mock: enough for createImageData / putImageData / toDataURL.
let painted = 0;
w.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind !== "2d") return null;
  const canvas = this;
  return { createImageData: (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }), putImageData: (img) => { painted++; canvas._last = img; } };
};
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
let blobs = 0; w.URL.createObjectURL = () => `blob:x${++blobs}`;
w.URL.revokeObjectURL = () => {};
let downloads = [];
w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
let clip = "";
Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { clip = t; } }, configurable: true });
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "localStorage", "location", "URL", "URLSearchParams", "CSS", "Blob"]) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* ignore */ }
}
globalThis.addEventListener = w.addEventListener.bind(w);
globalThis.requestAnimationFrame = w.requestAnimationFrame?.bind(w) || ((f) => setTimeout(() => f(performance.now()), 16));
globalThis.cancelAnimationFrame = w.cancelAnimationFrame?.bind(w) || clearTimeout;
globalThis.CSS ||= w.CSS || { escape: (s) => String(s).replace(/["\\:]/g, "\\$&") };
w.CSS ||= globalThis.CSS;
const PointerEvent = w.PointerEvent || class extends w.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId || 1; } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel, root = w.document) => root.querySelector(sel);
const qa = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const click = (el, detail = 1) => { if (!el) throw new Error("click target missing"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, detail })); };
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, ...opts }));
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const setVal = (el, v, final = true) => { if (!el) throw new Error("input missing"); el.value = v; fire(el, "input"); if (final) fire(el, "change"); };
// Dropdowns (CardKit.Dropdown): open the <details>, then click the option — the same path a user takes.
const pick = (act, value, root = w.document) => {
  const opt = q(`.mi-dd-opt[data-act="${act}"][data-value="${CSS.escape(String(value))}"]`, root);
  if (!opt) throw new Error(`dropdown ${act} has no option ${value}`);
  const dd = opt.closest("details.mi-dd"); dd.open = true; click(dd.querySelector("summary"));
  click(opt);
};
const options = (act, root = w.document) => qa(`.mi-dd-opt[data-act="${act}"]`, root).map((o) => o.dataset.value);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const step = async (name, fn) => { if (process.env.TRACE) console.log("> " + name, Math.round(process.memoryUsage().heapUsed / 1e6) + "MB"); const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } console.log(`${errors.length > before ? "FAIL" : " ok "} ${name}`); };


const { Mount } = await import(pathToFileURL(ROOT + "PaintInspector.js"));
const { MountPaintOutliner } = await import(pathToFileURL(ROOT + "PaintOutliner.js"));
w.localStorage.clear();
const App = Mount(w.document.getElementById("Card"), { docked: false });
const Out = MountPaintOutliner(w.document.getElementById("Outliner"), App);
const St = App.State, B = App.Model;
const Card = w.document.getElementById("Card"), Tree = w.document.getElementById("Outliner");
const stat = (k) => q(`[data-stat="${k}"]`, Card);
const sel = () => B.Selected(St.P);
const row = (id) => q(`[data-row="layer:${CSS.escape(id)}"]`, Tree);
const byName = (n) => St.P.layers.find((L) => L.name === n);
const range = (bind) => q(`input[type="range"][data-bind="${CSS.escape(bind)}"]`, Card);

await step("boot", async () => {
  for (const k of ["opacity", "channels", "mask"]) expect(stat(k), `tile ${k}`);
  expect(sel()?.kind === "paint" && q(".mi-name", Card).value === "Hand Painted Layer", "starter selection");
  expect(qa(".ol-row.kind-layer", Tree).length === 6, `layer rows ${qa(".ol-row.kind-layer", Tree).length}`);
  expect(q(".cs-stack", Card) && qa(".cs-row", Card).length >= 7, "channel stack");
  expect(Tree.textContent.includes("512"), "resolution in the outliner");
});

await step("outliner select + add every type", async () => {
  click(row(byName("Base Ceramic Coat").id));
  expect(sel().name === "Base Ceramic Coat" && q(".mi-name", Card).value === "Base Ceramic Coat", "select from outliner");
  for (const T of B.LAYER_TYPES) {
    const n = St.P.layers.length; pick("layer-add", T.Id, Tree);
    expect(St.P.layers.length === n + 1 && sel().kind === T.Id, `add ${T.Id}`);
  }
  for (let i = 0; i < B.LAYER_TYPES.length; i++) key("z", { ctrlKey: true });
  expect(St.P.layers.length === 6, `undo adds (${St.P.layers.length})`);
});

await step("eye, lock and the lock guard", async () => {
  const L = byName("Base Ceramic Coat"); click(row(L.id));
  click(q(`[data-act="layer-eye"][data-id="layer:${L.id}"]`, Tree));
  expect(!B.Layer(St.P, L.id).visible && row(L.id).classList.contains("muted"), "hidden");
  click(q('[data-act="visible"]', Card)); expect(B.Layer(St.P, L.id).visible, "card visible switch");
  click(q(`[data-act="layer-lock"][data-id="layer:${L.id}"]`, Tree));
  expect(B.Layer(St.P, L.id).locked && q(".pi-card.locked", Card), "locked");
  const before = B.Layer(St.P, L.id).fill.roughness;
  setVal(range("layer:opacity"), 10);
  click(q('[data-act="cs-open"][data-ch="roughness"]', Card)); setVal(range("layer:stack@roughness.value"), 5);
  expect(B.Layer(St.P, L.id).opacity === 1 && B.Layer(St.P, L.id).fill.roughness === before, "locked layer refuses edits");
  click(q('[data-act="lock"]', Card)); expect(!B.Layer(St.P, L.id).locked, "unlocked from the card");
});

await step("layer section: blend, part, opacity, name", async () => {
  const L = sel();
  pick("blend", "Multiply", Card); expect(sel().blend === "Multiply", "blend");
  pick("part", "1", Card); expect(sel().partFilter === 1 && row(L.id).textContent.includes("Lid"), "part filter");
  setVal(range("layer:opacity"), 55); expect(sel().opacity === 0.55 && stat("opacity").textContent.includes("55"), "opacity");
  const nm = q(".mi-name", Card); nm.value = "Glaze"; fire(nm, "input"); fire(nm, "change");
  expect(sel().name === "Glaze" && row(L.id).textContent.includes("Glaze"), "rename from the card");
});

await step("channel stack: open, value, colour, opacity, blend, toggle, group, bulk, search", async () => {
  const Id = sel().id;
  if (!q('[data-editor="roughness"]', Card)) click(q('[data-act="cs-open"][data-ch="roughness"]', Card));
  setVal(range("layer:stack@roughness.value"), 30); expect(B.Layer(St.P, Id).fill.roughness === 0.3, "roughness value");
  setVal(range("layer:stack@roughness.opacity"), 40); expect(B.Layer(St.P, Id).channelOpacity.roughness === 0.4, "channel opacity");
  pick("cs-set", "Overlay", q('[data-editor="roughness"]', Card)); expect(B.Layer(St.P, Id).channelBlends.roughness === "Overlay", "channel blend");
  click(q('[data-act="cs-open"][data-ch="albedo"]', Card));
  const hex = q('[data-bind="layer:stack@albedo.value"][data-hex]', Card); setVal(hex, "#112233");
  expect(B.Layer(St.P, Id).fill.color === "#112233", "albedo colour");
  click(q('[data-act="cs-group"][data-group="Coat"]', Card)); expect(q('.cs-row[data-row="clearcoat"]', Card), "open Coat");
  click(q('[data-act="cs-toggle"][data-ch="clearcoat"]', Card)); expect(B.Layer(St.P, Id).channels.clearcoat, "clearcoat on");
  click(q('[data-act="cs-group-toggle"][data-group="Coat"]', Card)); expect(["clearcoat", "coatRoughness", "sheen", "sheenRoughness", "sheenColor"].every((c) => B.Layer(St.P, Id).channels[c]), "Coat all on");
  click(q('[data-act="cs-bulk"][data-value="all"]', Card)); expect(B.LayerStack(B.Layer(St.P, Id)).on.length === 22 && stat("channels").textContent.includes("22"), "all 22");
  click(q('[data-act="cs-bulk"][data-value="core"]', Card)); expect(B.LayerStack(B.Layer(St.P, Id)).on.length === 7, "core only");
  const s = q('[data-act="cs-search"]', Card); s.value = "irid"; fire(s, "input");
  expect(qa(".cs-row", Card).length === 2, `search rows ${qa(".cs-row", Card).length}`);
  q('[data-act="cs-search"]', Card).value = ""; fire(q('[data-act="cs-search"]', Card), "input");
  expect(Tree.textContent.includes("7 ch"), "outliner reads the channel count");
});

await step("kind cards: fill, material, generator, stamps, text, folder, paint", async () => {
  setVal(range("fill:patternRepeats"), 8); expect(sel().fill.patternRepeats === 8, "fill repeats");
  pick("layer-add", "material", Tree); pick("material", B.MATERIALS[5].id, Card);
  expect(sel().material.presetId === B.MATERIALS[5].id && sel().name === B.MATERIALS[5].name, "material preset");
  setVal(range("material:grainStrength"), 20); expect(sel().material.grainStrength === 0.2, "grain");
  click(row(byName("Edge Wear").id)); pick("gen-preset", "top-dust", Card); setVal(range("generator:threshold"), 70);
  expect(sel().generator.preset === "top-dust" && sel().generator.threshold === 0.7, "generator");
  click(q('[data-act="gen-invert"]', Card)); expect(sel().generator.invert, "generator invert");
  click(row(byName("Warning Seal").id)); setVal(range("stamp:scale"), 80);
  expect(sel().stamps[0].scale === 0.8, "stamp scale");
  click(q('[data-act="stamp-projection"][data-value="3d"]', Card)); expect(sel().stamps[0].projection === "3d", "projection");
  click(row(St.P.layers.find((L) => L.kind === "text").id));
  const t = q('[data-act="text-content"]', Card); t.value = "HELLO"; fire(t, "input"); fire(t, "change");
  expect(sel().text.content === "HELLO" && sel().stamps.every((E) => E.text.content === "HELLO"), "text content");
  click(row(byName("Details").id)); expect(!q(".cs-stack", Card) && Card.textContent.includes("Holds"), "folder card has no channels");
  click(row(byName("Hand Painted Layer").id)); expect(q('a[href="../BrushStudio/"]', Card), "paint card links to Brush");
});

await step("mask add / edit / remove", async () => {
  click(q('[data-act="mask-add"]', Card)); expect(sel().mask?.enabled && stat("mask").textContent.includes("On"), "added");
  pick("mask-preset", "crevice-dirt", Card); click(q('[data-act="mask-invert"]', Card)); setVal(range("mask:opacity"), 50);
  expect(sel().mask.preset === "crevice-dirt" && sel().mask.invert && sel().mask.opacity === 0.5, "edited");
  expect(q(`[data-row="mask:${sel().id}"]`, Tree) || row(sel().id).textContent.includes("MASK"), "mask in the outliner");
  click(q('[data-act="mask-remove"]', Card)); expect(sel().mask === null, "removed");
  key("z", { ctrlKey: true }); expect(sel().mask?.preset === "crevice-dirt", "undo restores");
});

await step("outliner: drag into a folder, reorder, rename, delete, filters", async () => {
  const Hand = byName("Hand Painted Layer"), F = byName("Details");
  expect(App.Move(Hand.id, F.id, "inside") && B.Layer(St.P, Hand.id).parentId === F.id, "into folder");
  expect(!App.Move(F.id, Hand.id, "inside"), "cycle refused");
  const Coat = St.P.layers[0]; App.Move(Coat.id, F.id, "before");
  expect(St.P.layers.indexOf(B.Layer(St.P, Coat.id)) > St.P.layers.indexOf(B.Layer(St.P, F.id)), "reorder above");
  Out.State.Renaming = `layer:${Coat.id}`; Out.Render();
  const r = q(".ol-rename", Tree); r.value = "Under Glaze"; key("Enter", {}, r);
  expect(B.Layer(St.P, Coat.id).name === "Under Glaze" || (fire(r, "change"), B.Layer(St.P, Coat.id).name === "Under Glaze"), "rename in the outliner");
  const n = St.P.layers.length; App.Remove(byName("Edge Wear").id); expect(St.P.layers.length === n - 1, "delete");
  key("z", { ctrlKey: true }); expect(St.P.layers.length === n, "undo delete");
  click(q('[data-act="stat-masked"]', Tree)); expect(qa(".ol-row.kind-layer", Tree).every((R) => B.Layer(St.P, R.dataset.row.slice(6))?.mask || B.Layer(St.P, R.dataset.row.slice(6))?.kind === "folder"), "masked filter");
  click(q('[data-act="stat-masked"]', Tree));
  const s = q('[data-act="ol-search"]', Tree); if (s) { s.value = "seal"; fire(s, "input"); expect(qa(".ol-row.kind-layer", Tree).some((R) => R.textContent.includes("Warning Seal")), "search"); s.value = ""; fire(s, "input"); }
});

await step("undo / redo / reset / export / copy / import", async () => {
  const name = sel().name; pick("blend", "Screen", Card);
  key("z", { ctrlKey: true }); expect(sel().blend !== "Screen", "undo");
  key("z", { ctrlKey: true, shiftKey: true }); expect(sel().blend === "Screen", "redo");
  click(q('[data-act="export"]', Card)); expect(downloads.at(-1)?.endsWith(".texpaint.json"), "export");
  click(q('[data-act="export-layer"]', Card)); expect(downloads.at(-1)?.endsWith(".layer.json"), "export layer");
  click(q('[data-act="copy"]', Card)); await sleep(20); expect(JSON.parse(clip).schema === "frontier.texture-paint.v2", "copy");
  const saved = clip;
  click(q('[data-act="reset"]', Card)); expect(St.P.layers.length === 6 && sel().name === "Hand Painted Layer", "reset");
  const f = q('[data-act="import"]', Card);
  Object.defineProperty(f, "files", { value: [{ text: async () => saved }], configurable: true }); fire(f, "change"); await sleep(20);
  expect(St.P.layers.some((L) => L.name === "Under Glaze") && sel().name === name, "import");
  expect(JSON.parse(w.localStorage.getItem(B.STORAGE_KEY)).layers.length === St.P.layers.length, "persisted");
});

console.log(errors.length ? `\n${errors.length} error(s):\n` + errors.join("\n") : "\n0 errors");
process.exit(errors.length ? 1 : 0);
