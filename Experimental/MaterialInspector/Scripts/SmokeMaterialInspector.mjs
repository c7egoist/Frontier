// UI smoke test: boots the Material Inspector card in jsdom and drives every path — library switch, rename, statistic tiles,
// strata (select / toggle / rename / add + remove detail), channel groups, search, open/close rows, value / colour / vector
// editors, every source kind (field generators + knobs + stops, ramp shapes + angle, image), direct switch, add / remove
// channel, stratum knobs, presets, undo / redo, export, import and cross-window storage sync.  Layout and pixels are not
// checked (canvas 2D is mocked).
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/MaterialInspector/Scripts/SmokeMaterialInspector.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const PREFIX = "Frontier.MaterialInspector.v1:";
const dom = new JSDOM(html, { url: "http://localhost:8097/Experimental/MaterialInspector/", pretendToBeVisual: true });
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
w.URL.createObjectURL = () => "blob:x";
w.URL.revokeObjectURL = () => {};
let downloads = [];
w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
let clip = "";
Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { clip = t; } }, configurable: true });
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "localStorage", "location", "URL", "URLSearchParams", "CSS", "Blob"]) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* ignore */ }
}
globalThis.addEventListener = w.addEventListener.bind(w);
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
const step = async (name, fn) => { const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } console.log(`${errors.length > before ? "FAIL" : " ok "} ${name}`); };

const { Mount } = await import(pathToFileURL(ROOT + "MaterialInspector.js"));
const App = Mount(w.document.getElementById("Card"));
const St = App.State, M = App.Model;
const layer = () => M.FindLayer(St.P, St.LayerId);
const stored = () => JSON.parse(w.localStorage.getItem(PREFIX + St.P.id));
const row = (k) => q(`.mi-row-head[data-ch="${k}"]`);
const open = (k) => { if (St.Channel !== k) click(row(k)); expect(St.Channel === k && q(`[data-editor="${k}"]`), `editor for ${k}`); };

await step("boot: one card, Derez, strata + grouped channels", async () => {
  expect(qa(".mi-card").length === 1, "exactly one card");
  expect(St.P.id === "derez-lattice-dissolve-controlvehicle", St.P.id);
  expect(qa(".mi-stratum").length === 2, "coat + surface strata");
  const groups = qa(".mi-group").map((g) => g.dataset.group + (g.classList.contains("open") ? "*" : ""));
  console.log("   groups:", groups.join(" "), "| rows visible:", qa(".mi-row-head").length, "| open editors:", qa(".mi-editor").length);
  expect(qa(".mi-editor").length === 1, "one inline editor");
  expect(qa(".mi-row-head").length < 20, "collapsed groups keep the list short");
  expect(stored().name === St.P.name, "seeded storage");
  expect(painted > 0, "field thumbnails painted");
});

await step("rows: open / close / arrows / escape", async () => {
  open("roughness");
  expect(q(".mi-row.open").dataset.row === "roughness", "row open");
  key("ArrowDown", {}, row("roughness"));
  expect(St.Channel === "metallic", `arrow → ${St.Channel}`);
  key("Escape");
  expect(St.Channel === null && !q(".mi-editor"), "escape closes");
  click(row("metallic")); click(row("metallic"));
  expect(St.Channel === null, "click again collapses");
});

await step("groups expand / collapse and search", async () => {
  const head = q('.mi-group[data-group="Coat"] .mi-group-head');
  click(head);
  expect(q('.mi-group[data-group="Coat"]').classList.contains("open"), "coat group opened");
  click(q('.mi-group[data-group="Coat"] .mi-group-head'));
  expect(!q('.mi-group[data-group="Coat"]').classList.contains("open"), "coat group closed");
  setVal(q('[data-act="search"]'), "sheen", false);
  console.log("   search sheen →", qa(".mi-row-head").map((r) => r.dataset.ch).join(","));
  expect(qa(".mi-row-head").length === 3, "3 sheen rows");
  setVal(q('[data-act="search"]'), "zzz", false);
  expect(q(".mi-empty"), "empty note");
  setVal(q('[data-act="search"]'), "", false);
});

await step("scalar value: slider + number + scrub", async () => {
  open("metallic");
  setVal(q('.mi-editor input[type="range"][data-bind="ch"]'), "0.6");
  expect(Math.abs(St.P.metalness - 0.6) < 1e-9, `metalness ${St.P.metalness}`);
  expect(q('[data-stat="response"]').textContent.includes("Hybrid"), "response tile follows (hybrid at 0.6)");
  setVal(q('.mi-editor input[type="number"][data-bind="ch"]'), "0.25");
  expect(St.P.metalness === 0.25, "number input");
  setVal(q('.mi-editor input[type="number"][data-bind="ch"]'), "7");
  expect(St.P.metalness === 1, "clamped");
  const readout = q('[data-scrub="metallic"]');
  readout.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, button: 0 }));
  readout.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40 }));
  expect(St.P.metalness < 0.75, `scrubbed ${St.P.metalness}`);
  readout.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 40 }));
  click(readout);
  expect(St.Channel === "metallic", "click after drag swallowed");
  await sleep(5);
  const cls = St.P.metalness >= 0.9 ? "Conductor" : St.P.metalness <= 0.1 ? "Dielectric" : "Hybrid";
  expect(q('[data-stat="response"]').textContent.includes(cls), `response tile reads ${cls} at metalness ${St.P.metalness}`);
});

await step("colour + vector editors", async () => {
  open("colour");
  setVal(q('.mi-editor input[type="color"][data-bind="ch"]'), "#336699");
  expect(St.P.color === "#336699", St.P.color);
  setVal(q(".mi-editor .mi-hex"), "aa5500");
  expect(St.P.color === "#aa5500", "hex input");
  setVal(q(".mi-editor .mi-hex"), "nope");
  expect(St.P.color === "#aa5500", "bad hex ignored");
  q('.mi-group[data-group="Core"]') && open("normal");
  setVal(q('[data-bind="vec:0"]'), "0.3");
  expect(St.P.normal[0] === 0.3, JSON.stringify(St.P.normal));
  click(q('[data-act="vec-flat"]'));
  expect(St.P.normal.join() === "0,0,1", "flat reset");
});

await step("field source: generators, knobs, stops, camo palette, direct", async () => {
  open("roughness");
  click(q('[data-act="source"][data-kind="field"]'));
  let src = M.ChannelSource(St.P, layer(), "roughness");
  expect(src.Mode === "field" && src.Generator, "field declared");
  expect(q('canvas[data-preview="roughness"]')._last, "preview painted");
  for (const g of M.GeneratorDefinitions) { click(q(`[data-act="gen"][data-gen="${g.identity}"]`)); }
  click(q('[data-act="gen"][data-gen="cells"]'));
  expect(St.P.Authoring.Generators.find((g) => g.Identity === src.Generator).Procedure === "cells", "generator switched");
  setVal(q('input[type="range"][data-bind="field:scale"]'), "20");
  expect(St.P.Authoring.Inputs[`field:${src.Generator}:scale`] === 20, "scale knob");
  setVal(q('input[type="number"][data-bind="field:angle"]'), "999");
  expect(St.P.Authoring.Inputs[`field:${src.Generator}:angle`] === 180, "angle clamped");
  click(q('[data-act="stop-add"]'));
  expect(M.ChannelSource(St.P, layer(), "roughness").Stops.length === 3, "stop added");
  setVal(q('[data-bind="stop:0"]'), "#112233");
  expect(M.ChannelSource(St.P, layer(), "roughness").Stops[0] === "#112233", "stop edited");
  click(q('[data-act="stop-remove"]'));
  expect(M.ChannelSource(St.P, layer(), "roughness").Stops.length === 2, "stop removed");
  click(q('[data-act="gen"][data-gen="camouflage"]'));
  setVal(q('[data-bind="camo:2"]'), "#445566");
  expect(St.P.Authoring.Inputs[`field:${src.Generator}:colour2`] === "#445566", "camo palette");
  click(q('[data-act="direct"]'));
  expect(M.ChannelSource(St.P, layer(), "roughness").Direct === true, "direct on");
  expect(q('.mi-group[data-group="Core"] .mi-auth'), "authored badge");
  expect(q('[data-ch="roughness"] .mi-readout').textContent.includes("Camo"), "readout shows generator");
});

await step("ramp + image + back to value keeps generator draft", async () => {
  const gen = M.ChannelSource(St.P, layer(), "roughness").Generator;
  click(q('[data-act="source"][data-kind="ramp"]'));
  expect(M.ChannelSource(St.P, layer(), "roughness").Mode === "linear", "linear ramp");
  setVal(q('input[type="range"][data-bind="angle"]'), "45");
  expect(M.ChannelSource(St.P, layer(), "roughness").Angle === 45, "angle");
  for (const s of ["radial", "conic", "linear"]) { click(q(`[data-act="ramp"][data-shape="${s}"]`)); expect(M.ChannelSource(St.P, layer(), "roughness").Mode === s, s); }
  click(q('[data-act="source"][data-kind="texture"]'));
  expect(q(".mi-drop"), "drop zone");
  click(q('[data-act="source"][data-kind="field"]'));
  expect(M.ChannelSource(St.P, layer(), "roughness").Generator === gen, "generator draft restored");
  click(q('[data-act="source"][data-kind="value"]'));
  expect(!St.P.Authoring.Sources.roughness, "source cleared");
});

await step("add / remove channel", async () => {
  const L0 = layer().Channels.length;
  click(q('.mi-group[data-group="Sheen"] .mi-group-head'));
  open("sheenColour");
  click(q('[data-act="remove-channel"]'));
  expect(layer().Channels.length === L0 - 1 && !layer().Channels.includes("sheenColour"), "removed");
  click(q('[data-act="add-toggle"]'));
  expect(q(".mi-pop"), "add menu");
  click(q('.mi-pop [data-ch="sheenColour"]'));
  expect(layer().Channels.includes("sheenColour") && St.Channel === "sheenColour" && !q(".mi-pop"), "re-added + opened");
  // order follows the registry, not insertion
  expect(layer().Channels.indexOf("sheenColour") === M.CHANNELS.filter((c) => c.Key !== "coverage").findIndex((c) => c.Key === "sheenColour"), "registry order");
});

await step("strata: coat select, toggle, rename, knobs", async () => {
  const coat = St.P.Authoring.Layers.find((l) => l.Model === "coat");
  click(q(`[data-act="layer"][data-layer="${coat.Identity}"]`));
  expect(St.LayerId === coat.Identity, "coat selected");
  console.log("   coat rows:", qa(".mi-row-head").map((r) => r.dataset.ch).join(","));
  expect(qa(".mi-row-head").length === 4 && !q(".mi-group-head"), "small strata list flat, no group heads");
  open("roughness");
  setVal(q('.mi-editor input[type="range"][data-bind="ch"]'), "0.3");
  expect(St.P.coatRoughness === 0.3, "coat roughness carrier");
  click(q(`[data-act="layer-toggle"][data-layer="${coat.Identity}"]`));
  expect(!M.FindLayer(St.P, coat.Identity).Enabled, "disabled");
  expect(!M.ExportToml(St.P).includes('"Coating"'), "disabled coat not exported");
  click(q(`[data-act="layer-toggle"][data-layer="${coat.Identity}"]`));
  click(q(`[data-act="layer"][data-layer="${coat.Identity}"]`), 2);
  const input = q(".mi-rename");
  expect(input, "rename field");
  input.value = "Lacquer";
  key("Enter", {}, input);
  expect(M.FindLayer(St.P, coat.Identity).Name === "Lacquer", "renamed");
  const fold = q('[data-fold="coat"]');
  fold.open = true; fire(fold, "toggle");
  setVal(q('input[type="range"][data-bind="flat:orangePeel"]'), "0.5");
  expect(St.P.orangePeel === 0.5, "orange peel knob");
});

await step("detail stratum: add, preset, coverage, remove", async () => {
  const n0 = St.P.Authoring.Layers.length;
  click(q('[data-act="add-detail"]'));
  expect(St.P.Authoring.Layers.length === n0 + 1 && layer().Model === "detail", "detail added");
  const fold = q('[data-fold="detail"]');
  fold.open = true; fire(fold, "toggle");
  click(q('[data-act="preset"][data-preset="cells"]'));
  const src = M.ChannelSource(St.P, layer(), "colour");
  expect(src.Mode === "field" && St.P.Authoring.Generators.find((g) => g.Identity === src.Generator).Procedure === "cells", "preset field");
  open("coverage");
  setVal(q('.mi-editor input[type="range"][data-bind="ch"]'), "0.8");
  expect(St.P.Authoring.Inputs[`layer:${layer().Identity}:coverage`] === 0.8, "coverage input");
  const id = layer().Identity;
  click(q(`[data-act="remove-layer"][data-layer="${id}"]`));
  expect(!M.FindLayer(St.P, id) && !Object.keys(St.P.Authoring.Inputs).some((k) => k.includes(id)), "detail removed with its inputs");
});

await step("undo / redo", async () => {
  const before = JSON.stringify(St.P);
  const name = St.P.name;
  setVal(q(".mi-name"), "Renamed material");
  expect(St.P.name === "Renamed material", "renamed");
  key("z", { ctrlKey: true });
  expect(St.P.name === name, `undo name → ${St.P.name}`);
  key("z", { ctrlKey: true, shiftKey: true });
  expect(St.P.name === "Renamed material", "redo");
  click(q('[data-act="undo"]'));
  expect(JSON.stringify(St.P) === before, "undo button");
});

await step("library switch (candy paint: flakes), per-material storage", async () => {
  const derezName = St.P.name;
  setVal(q('[data-act="library"]'), "candy-crimson");
  expect(St.P.id === "candy-crimson" && qa(".mi-stratum").length === 3, "3 strata");
  const flakes = St.P.Authoring.Layers.find((l) => l.Model === "flakes");
  click(q(`[data-act="layer"][data-layer="${flakes.Identity}"]`));
  const fold = q('[data-fold="flakes"]');
  fold.open = true; fire(fold, "toggle");
  setVal(q('[data-bind="palette:1"]'), "#00ff00");
  expect(St.P.colors[1] === "#00ff00", "palette edit");
  click(q('[data-target="palette"][data-act="stop-add"]'));
  expect(St.P.colors.length === 6, "palette stop added");
  setVal(q('input[type="range"][data-bind="flat:flakes"]'), "0.9");
  expect(St.P.flakes === 0.9, "flake density");
  open("colour");
  expect(M.ChannelSource(St.P, layer(), "colour").Mode === "radial", "flake colour radial ramp");
  setVal(q('[data-act="library"]'), "derez-lattice-dissolve-controlvehicle");
  expect(St.P.name === derezName, "derez restored from storage");
  setVal(q('[data-act="library"]'), "candy-crimson");
  expect(St.P.flakes === 0.9 && St.P.colors.length === 6, "candy edits persisted");
  for (const e of M.CATALOG) { setVal(q('[data-act="library"]'), e.id); expect(St.P.id === e.id, e.id); expect(q(".mi-editor"), "editor open on load"); }
  click(q('[data-act="reset"]'));
  expect(St.P.id === M.CATALOG.at(-1).id, "reset keeps material");
});

await step("export TOML / JSON / copy", async () => {
  downloads = [];
  click(q('[data-act="export-toml"]'));
  click(q('[data-act="export-json"]'));
  click(q('[data-act="copy-toml"]'));
  await sleep(5);
  console.log("   downloads:", downloads.join(", "));
  expect(downloads.length === 2 && downloads[0].endsWith(".material") && downloads[1].endsWith(".json"), "downloads");
  expect(clip.startsWith("Format = 1"), "clipboard TOML");
});

await step("import JSON", async () => {
  const P = M.CreateMaterial("brushed-titanium");
  P.name = "Imported titanium";
  const input = q('[data-act="import"]');
  Object.defineProperty(input, "files", { value: [{ text: async () => M.ExportJson(P) }], configurable: true });
  fire(input, "change");
  await sleep(10);
  expect(St.P.name === "Imported titanium", St.P.name);
  const again = q('[data-act="import"]');
  Object.defineProperty(again, "files", { value: [{ text: async () => "{\"broken\":1}" }], configurable: true });
  fire(again, "change");
  await sleep(10);
  expect(St.P.name === "Imported titanium" && q("[data-status]").textContent.startsWith("Import failed"), "bad import rejected");
});

await step("cross-window storage sync", async () => {
  const other = structuredClone(St.P);
  other.roughness = 0.77;
  const ev = new w.StorageEvent("storage", { key: PREFIX + St.P.id, newValue: JSON.stringify(other) });
  w.dispatchEvent(ev);
  expect(St.P.roughness === 0.77 && q('[data-stat="response"]').textContent.includes("Matte"), "synced");
});

console.log(errors.length ? `\n${errors.length} error(s):\n` + errors.join("\n\n") : "\n0 errors");
process.exit(errors.length ? 1 : 0);
