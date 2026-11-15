// UI smoke test: boots the Map Baking card in jsdom and drives every path — study switch, low / high sources, statistic tiles,
// device, map toggles, group all / none, every map editor (knobs, convention, voxel grid, signed), output fold, the dry-run
// bake with live progress and cancel, a host-supplied bake, staleness, undo / redo, export, copy and preset import.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/BakeInspector/Scripts/SmokeBakeInspector.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost:8099/Experimental/BakeInspector/", pretendToBeVisual: true });
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



const { Mount } = await import(pathToFileURL(ROOT + "BakeInspector.js"));
let App = Mount(w.document.getElementById("Card"));
const St = App.State, B = App.Model;
const stat = (k) => q(`[data-stat="${k}"]`);
const open = (id) => { if (St.Open !== id) click(q(`[data-act="open"][data-id="${id}"]`)); expect(St.Open === id, `open ${id}`); };

await step("boot", async () => {
  for (const k of ["output", "rays", "state"]) expect(stat(k), `tile ${k}`);
  expect(stat("state").textContent.includes("Unbaked"), "unbaked");
  expect(q('[data-act="bake"]').textContent.includes("Bake 5 maps"), "bake label");
  expect(qa(".bi-map").length >= 13, "map rows in open groups");
});

await step("study + sources", async () => {
  const s = q('[data-act="study"]'); s.value = "torus"; fire(s, "change");
  expect(St.P.studyId === "torus" && q(".bi-name").textContent.includes("Torus"), "study");
  const f = q('[data-act="source"][data-slot="highSource"]');
  Object.defineProperty(f, "files", { value: [{ name: "hero_high.obj", size: 1234 }], configurable: true });
  fire(f, "change");
  expect(St.P.highSource?.name === "hero_high.obj" && q(".bi-source.custom"), "source");
  click(q('[data-act="source-clear"][data-slot="highSource"]'));
  expect(St.P.highSource === null, "cleared");
});

await step("device + estimate", async () => {
  const before = stat("rays").textContent;
  click(q('[data-act="device"][data-value="cpu"]'));
  expect(St.P.deviceMode === "cpu" && stat("rays").textContent.includes("CPU"), "cpu");
  expect(stat("rays").textContent !== before, "estimate changed");
  click(q('[data-act="device"][data-value="auto"]'));
});

await step("map toggles + groups", async () => {
  click(q('[data-act="map-toggle"][data-map="ao"]'));
  expect(!St.P.selected.includes("ao"), "ao off");
  click(q('[data-act="map-toggle"][data-map="ao"]'));
  click(q('[data-act="group"][data-group="Masks & IDs"]'));
  expect(q('[data-row="partId"]'), "masks group opened");
  click(q('[data-act="group-all"][data-group="Masks & IDs"]'));
  expect(St.P.selected.includes("partId") && St.P.selected.includes("wireframe"), "all");
  click(q('[data-act="group-all"][data-group="Masks & IDs"]'));
  expect(!St.P.selected.includes("partId"), "none");
  const head = q('[data-act="open"][data-id="bentNormal"]'); head.focus();
  key(" ", { shiftKey: true }, head);
  expect(St.P.selected.includes("bentNormal"), "shift-space toggles");
});

await step("map editors", async () => {
  for (const M of B.BAKE_MAP_CATALOG) {
    if (!q(`[data-act="open"][data-id="${M.id}"]`)) click(q(`[data-act="group"][data-group="${M.group}"]`));
    open(M.id);
    expect(q(`[data-editor="${M.id}"]`), `editor ${M.id}`);
    for (const K of B.MAP_PARAMS[M.id].Keys) expect(q(`input[type=range][data-bind="set:${K}"]`), `${M.id} knob ${K}`);
  }
  open("ao");
  const r = q('input[type=range][data-bind="set:samples"]');
  const rays = stat("rays").textContent;
  setVal(r, 30, false);
  expect(St.P.samples === 30 && stat("rays").textContent !== rays, "live estimate");
  fire(r, "change");
  open("bentNormal");
  expect(q('[data-editor="bentNormal"]').textContent.includes("Also drives"), "shared hint");
  open("normalTangent");
  click(q('[data-act="normal-y"][data-value="-Y"]'));
  expect(St.P.normalY === "-Y", "directx");
  open("volumeSdf");
  click(q('[data-act="sdf-res"][data-value="64"]'));
  click(q('[data-act="sdf-signed"]'));
  expect(St.P.sdfRes === 64 && !St.P.sdfSigned, "sdf");
  key("Escape"); expect(St.Open === null, "escape");
});

await step("output fold", async () => {
  const f = q('[data-fold="out"]'); f.open = true; fire(f, "toggle");
  click(q('[data-act="res"][data-value="1024"]'));
  expect(St.P.resolution === 1024 && q('[data-fold="out"]').open, "resolution, fold stays open");
  setVal(q('input[type=range][data-bind="set:padding"]'), 9);
  expect(St.P.padding === 9, "padding");
});

await step("dry-run bake, progress, stale", async () => {
  click(q('[data-act="bake"]'));
  expect(St.Run && q('[data-act="cancel"]'), "running");
  expect(q('[data-act="undo"]').disabled, "undo locked while baking");
  await sleep(400);
  expect(St.Run.Progress > 0 && q(".bi-map.running"), "progress + running row");
  for (let i = 0; i < 100 && St.Run; i++) await sleep(100);
  expect(!St.Run && St.Result?.Dry, "finished");
  expect(stat("state").textContent.includes("Fresh"), "fresh");
  click(q('[data-act="device"][data-value="gpu"]'));
  expect(stat("state").textContent.includes("Fresh"), "device does not stale");
  click(q('[data-act="map-toggle"][data-map="ao"]'));
  expect(stat("state").textContent.includes("Stale"), "stale");
});

await step("cancel", async () => {
  click(q('[data-act="bake"]')); await sleep(200);
  click(q('[data-act="cancel"]')); await sleep(400);
  expect(!St.Run && q('[data-status]').textContent.includes("cancelled"), "cancelled");
});

await step("undo / redo", async () => {
  const sel = St.P.selected.join();
  key("z", { ctrlKey: true }); expect(St.P.selected.join() !== sel, "undo");
  key("z", { ctrlKey: true, shiftKey: true }); expect(St.P.selected.join() === sel, "redo");
});

await step("export + copy + import", async () => {
  downloads = [];
  click(q('[data-act="export-preset"]')); click(q('[data-act="export-request"]'));
  expect(downloads.some((d) => d.endsWith(".bake.json")) && downloads.some((d) => d.endsWith(".bake-request.json")), "downloads " + downloads);
  click(q('[data-act="copy-request"]')); await sleep(10);
  expect(JSON.parse(clip).schema === "frontier.bake-request.v1", "clipboard");
  const preset = B.ExportPreset(B.Normalise({ ...B.Create(), samples: 22, selected: ["ao"] }));
  const input = q('[data-act="import"]');
  Object.defineProperty(input, "files", { value: [{ text: async () => preset }], configurable: true });
  fire(input, "change"); await sleep(20);
  expect(St.P.samples === 22 && St.P.selected.join() === "ao", "imported");
  const bad = q('[data-act="import"]');
  Object.defineProperty(bad, "files", { value: [{ text: async () => "{}" }], configurable: true });
  fire(bad, "change"); await sleep(20);
  expect(q('[data-status]').textContent.includes("Import failed"), "rejects");
});

await step("persistence + host bake", async () => {
  const stored = JSON.parse(w.localStorage.getItem("Frontier.BakeInspector.v1"));
  expect(stored.samples === 22, "saved");
  let got = null;
  w.document.getElementById("Card").replaceWith(Object.assign(w.document.createElement("div"), { id: "Card2" }));
  App = Mount(w.document.getElementById("Card2"), { Bake: async (req, { Progress }) => { got = req; Progress(0.5, "Host baking", 0); await sleep(20); return { Device: "WebGPU", Ms: 42, Maps: req.surface.channels }; } });
  expect(St.P.samples === 22, "restored");
  expect(!q("[data-progress-text]").textContent.includes("Dry run"), "no dry-run note with a host");
  click(q('[data-act="bake"]')); await sleep(80);
  expect(got?.surface?.channels.join() === "ao" && St.Result.Device === "WebGPU" && !St.Result.Dry, "host bake");
  expect(stat("state").textContent.includes("WebGPU"), "result caption");
});

console.log(errors.length ? `\n${errors.length} error(s):\n` + errors.join("\n") : "\n0 errors");
process.exit(errors.length ? 1 : 0);
