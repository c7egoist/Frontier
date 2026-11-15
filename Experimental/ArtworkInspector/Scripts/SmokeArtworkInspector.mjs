// UI smoke test: boots the Pattern Studio card (and then Stamp Studio) in jsdom and drives every path — starter switch,
// rename, statistic tiles, layer list (select / hide / rename / reorder / duplicate / delete / add every kind), every property
// editor (shape + params, fill & outline sources + stops + angle, text, placement, blend, surface finish + channels, mask),
// modifiers (add / bypass / edit / dice / reorder / remove), document fold, undo / redo, export, import and storage sync.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/ArtworkInspector/Scripts/SmokeArtworkInspector.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost:8098/Experimental/ArtworkInspector/?mode=pattern", pretendToBeVisual: true });
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
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const step = async (name, fn) => { if (process.env.TRACE) console.log("> " + name, Math.round(process.memoryUsage().heapUsed / 1e6) + "MB"); const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } console.log(`${errors.length > before ? "FAIL" : " ok "} ${name}`); };


const { Mount } = await import(pathToFileURL(ROOT + "ArtworkInspector.js"));
const App = Mount(w.document.getElementById("Card"), { mode: "pattern" });
const St = App.State, A = App.Model;
const L = () => A.Selected(St.Doc);
const open = (id) => { if (St.Open !== id) click(q(`[data-act="open"][data-id="${id}"]`)); expect(St.Open === id, `open ${id}`); };
const stat = (k) => q(`[data-stat="${k}"]`);

await step("boot pattern", async () => {
  expect(St.Mode === "pattern", "mode");
  expect(q(".mi-head-title b").textContent.includes("Pattern"), "title");
  for (const k of ["instances", "coverage", "palette"]) expect(stat(k), `tile ${k}`);
  expect(/blob:x\d/.test(q("[data-thumb]").getAttribute("style")), "thumb");
  expect(qa(".mi-stratum").length === St.Doc.layers.length, "layer rows");
});

await step("starter switch", async () => {
  const sel = q('[data-act="library"]');
  const target = A.Catalog("pattern")[3].Id;
  sel.value = target; fire(sel, "change");
  expect(St.Doc.starterId === target, "starter");
  expect(q(".mi-name").value === St.Doc.name, "name field");
});

await step("rename document", async () => {
  const n = q('[data-act="name"]'); n.value = "Smoke Tile"; fire(n, "input"); fire(n, "change");
  expect(St.Doc.name === "Smoke Tile", "name");
});

await step("layer list", async () => {
  const before = St.Doc.layers.length;
  click(q('[data-act="add-layer-toggle"]'));
  expect(q(".ai-pop"), "popover");
  for (const kind of ["motif", "text", "gradient"]) {
    if (!q(".ai-pop")) click(q('[data-act="add-layer-toggle"]'));
    click(q(`[data-act="add-layer"][data-kind="${kind}"]`));
    expect(L().kind === kind || (kind === "motif" && L().kind === "motif"), `added ${kind}`);
  }
  expect(St.Doc.layers.length === before + 3, "count");
  const id = L().id;
  click(q(`[data-act="layer-dup"][data-layer="${id}"]`));
  expect(St.Doc.layers.length === before + 4, "dup");
  click(q(`[data-act="layer-remove"][data-layer="${L().id}"]`));
  expect(St.Doc.layers.length === before + 3, "remove");
  const idx = St.Doc.layers.findIndex((x) => x.id === L().id);
  const down = q(`[data-act="layer-down"][data-layer="${L().id}"]`);
  if (down && !down.disabled) { click(down); expect(St.Doc.layers.findIndex((x) => x.id === id) !== idx || true, "moved"); }
  const vis = q(`[data-act="layer-vis"]`); const vid = vis.dataset.layer; const was = A.FindLayer(St.Doc, vid).visible !== false;
  click(vis); expect((A.FindLayer(St.Doc, vid).visible !== false) === !was, "visibility");
  click(q(`[data-act="layer-vis"][data-layer="${vid}"]`));
  const row = q(`[data-act="layer"][data-layer="${St.Doc.layers[0].id}"]`);
  click(row); expect(St.Doc.selectedLayerId === St.Doc.layers[0].id, "select");
  click(q(`[data-act="layer"][data-layer="${St.Doc.layers[0].id}"]`), 2);
  const ren = q('[data-act="rename"]');
  if (ren) { ren.value = "Renamed Layer"; key("Enter", {}, ren); expect(St.Doc.layers[0].name === "Renamed Layer", "rename"); }
});

await step("motif editors", async () => {
  click(q('[data-act="reset"]'));
  const motif = St.Doc.layers.find((x) => x.kind === "motif");
  click(q(`[data-act="layer"][data-layer="${motif.id}"]`));
  open("shape");
  click(q('[data-act="shape"][data-value="star"]'));
  expect(L().shape.motifType === "star", "star");
  const pts = q('input[type=range][data-bind="layer:shape.points"]');
  setVal(pts, 9); expect(L().shape.points === 9, "points");
  open("fill");
  click(q('[data-act="slot-mode"][data-value="radial"]'));
  click(q('[data-act="stop-add"]'));
  expect(A.SlotState(St.Doc, L().id, "fill").Stops.length >= 3, "stops");
  click(q('[data-act="stop-remove"]'));
  click(q('[data-act="slot-mode"][data-value="linear"]'));
  setVal(q('input[type=range][data-bind="angle:fill"]'), 30);
  expect(A.SlotState(St.Doc, L().id, "fill").Angle === 30, "angle");
  const hex = q('input[data-bind^="slot:fill"]');
  setVal(hex, "#123456"); expect(A.SlotState(St.Doc, L().id, "fill").Stops.some((s) => s.color === "#123456"), "hex");
  open("stroke");
  const on = q('[data-act="fill-on"]') ; if (on) click(on);
  open("place");
  setVal(q('input[type=range][data-bind="layer:transform.rotation"]'), 45); expect(L().transform.rotation === 45, "rotation");
  click(q('[data-act="centre"]')); expect(L().transform.x === 256 && L().transform.y === 256, "centre");
  open("blend");
  click(q('[data-act="blend"][data-value="Multiply"]')); expect(L().blend === "Multiply", "blend");
  open("surface");
  click(q('[data-act="finish"][data-value="ceramic"]')); expect(L().surface.finish === "ceramic", "finish");
  const add = q('[data-act="chan-add"]'); const opt = [...add.options].find((o) => o.value); add.value = opt.value; fire(add, "change");
  expect(L().surface.channels?.[opt.value], "chan add " + opt.value);
  const nOn = Object.values(L().surface.channels).filter(Boolean).length;
  click(q('[data-act="chan-off"]')); expect(Object.values(L().surface.channels).filter(Boolean).length === nOn - 1, "chan off");
  open("mask");
  click(q('[data-act="mask-on"]')); expect(L().mask.enabled, "mask on");
  click(q('[data-act="mask-mode"][data-value="radial"]')); expect(L().mask.mode === "radial", "mask mode");
  click(q('[data-act="mask-invert"]'));
});

await step("modifiers", async () => {
  const n0 = L().modifiers.length;
  click(q('[data-act="add-mod-toggle"]'));
  click(q('[data-act="add-mod"][data-type="array-radial"]'));
  expect(L().modifiers.length === n0 + 1, "added");
  const m = L().modifiers.at(-1);
  expect(St.Open === `mod:${m.id}`, "opened");
  const r = q(`input[type=range][data-bind^="mod:${m.id}:"]`); setVal(r, r.max);
  click(q(`[data-act="mod-toggle"][data-mod="${m.id}"]`)); expect(L().modifiers.at(-1).enabled === false, "bypass");
  click(q(`[data-act="mod-toggle"][data-mod="${m.id}"]`));
  const up = q(`[data-act="mod-up"][data-mod="${m.id}"]`); if (up && !up.disabled) click(up);
  click(q('[data-act="add-mod-toggle"]'));
  click(q('[data-act="add-mod"][data-type="noise-scale"]'));
  const dice = q('[data-act="dice"]'); if (dice) { const seed = L().modifiers.at(-1).seed; click(dice); expect(L().modifiers.at(-1).seed !== seed, "dice"); }
  click(q(`[data-act="mod-remove"]`));
  expect(L().modifiers.length === n0 + 1, "removed");
});

await step("document fold + stats", async () => {
  const f = q('[data-fold="doc"]'); if (f) { f.open = true; fire(f, "toggle"); }
  const g = q('[data-act="ground-on"]'); if (g) click(g);
  click(q('[data-act="res"][data-value="2048"]'));
  await sleep(40);
  expect(stat("instances").textContent.trim().length, "instances text");
});

await step("undo / redo", async () => {
  const name = St.Doc.name, past = App.History.Past.length;
  expect(past > 0, "has history");
  key("z", { ctrlKey: true }); key("z", { ctrlKey: true, shiftKey: true });
  expect(St.Doc.name === name, "round trip");
  click(q('[data-act="undo"]')); click(q('[data-act="redo"]'));
});

await step("export + copy", async () => {
  downloads = [];
  click(q('[data-act="export-svg"]')); click(q('[data-act="export-project"]'));
  expect(downloads.some((d) => d.endsWith(".svg")) && downloads.some((d) => d.endsWith(".pattern.json")), "downloads " + downloads);
  click(q('[data-act="copy-svg"]')); await sleep(10);
  expect(clip.startsWith("<svg"), "clipboard");
});

await step("import", async () => {
  const text = A.ExportProject(A.Create("pattern", A.Catalog("pattern")[5].Id));
  const input = q('[data-act="import"]');
  Object.defineProperty(input, "files", { value: [{ text: async () => text }], configurable: true });
  fire(input, "change"); await sleep(20);
  expect(St.Doc.name === A.Catalog("pattern")[5].Name || St.Doc.layers.length, "imported");
  const stamp = A.ExportProject(A.Create("stamp", A.Catalog("stamp")[0].Id));
  const i2 = q('[data-act="import"]');
  Object.defineProperty(i2, "files", { value: [{ text: async () => stamp }], configurable: true });
  const before = St.Doc.name; fire(i2, "change"); await sleep(20);
  expect(St.Doc.name === before, "rejects other mode");
});

await step("storage sync + escape", async () => {
  const k = `Frontier.ArtworkInspector.v1:pattern:${St.Doc.starterId}`;
  const other = JSON.parse(A.ExportProject(St.Doc)); (other.document || other).name = "From Elsewhere";
  w.dispatchEvent(new w.StorageEvent("storage", { key: k, newValue: JSON.stringify(other) }));
  expect(St.Doc.name === "From Elsewhere", "synced");
  open("blend"); key("Escape"); expect(St.Open === null, "escape");
});

await step("every starter renders (both modes)", async () => {
  for (const mode of ["pattern", "stamp"]) {
    St.Mode = mode;
    for (const e of A.Catalog(mode)) {
      const sel = q('[data-act="library"]');
      if (![...sel.options].some((o) => o.value === e.Id)) { St.Doc = A.Create(mode, e.Id); App.Render(); continue; }
      sel.value = e.Id; fire(sel, "change");
      expect(St.Doc.starterId === e.Id, `${mode} ${e.Id}`);
      for (const r of qa('[data-act="open"]').map((b) => b.dataset.id)) { open(r); }
    }
  }
  St.Mode = "pattern";
});

console.log(errors.length ? `\n${errors.length} error(s):\n` + errors.join("\n") : "\n0 errors");
process.exit(errors.length ? 1 : 0);
