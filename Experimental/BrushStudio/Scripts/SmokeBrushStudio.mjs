// UI smoke test: boots the Brush Studio in jsdom (pixel-less canvas) and drives every path — library (families, search,
// pick), every studio section and field type (sliders, switches, segments, selects, shape / grain / render pickers,
// colours, curves, channels), per-field / per-section / whole-brush reset, reset point, duplicate, export / import, the
// drawing pad (paint, smudge, erase, fill, stamp, gradient, text, curve, move, eyedropper), every tool's dedicated studio
// (every section and control), the closable pad, channel views, keyboard shortcuts, pad undo / redo / clear and settings undo / redo.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/BrushStudio/Scripts/SmokeBrushStudio.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MockContext } from "./CanvasMock.mjs";

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost:8097/Experimental/BrushStudio/", pretendToBeVisual: true });
const w = dom.window;
const errors = [];
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + ((e && e.stack) || e)));
w.addEventListener("error", (e) => errors.push("window error: " + ((e.error && e.error.stack) || e.message)));

w.HTMLCanvasElement.prototype.getContext = function (kind) { return kind === "2d" ? (this.__ctx ||= MockContext(this)) : null; };
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
const Rect = { left: 0, top: 0, width: 640, height: 420, right: 640, bottom: 420, x: 0, y: 0 };
w.Element.prototype.getBoundingClientRect = function () { return this.classList?.contains("bs-stage") || this.tagName === "CANVAS" ? { ...Rect } : { left: 0, top: 0, width: 320, height: 130, right: 320, bottom: 130, x: 0, y: 0 }; };
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
w.Element.prototype.scrollIntoView = function () {};
let blobs = 0; w.URL.createObjectURL = () => `blob:x${++blobs}`;
w.URL.revokeObjectURL = () => {};
const downloads = [];
w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
w.HTMLInputElement.prototype.click = function () {};
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "localStorage", "location", "URL", "URLSearchParams", "Blob", "Image"]) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* ignore */ }
}
globalThis.addEventListener = w.addEventListener.bind(w);
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 4);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.devicePixelRatio = 1;
globalThis.CSS = w.CSS || {};
globalThis.CSS.escape ||= (s) => String(s).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
w.CSS = globalThis.CSS;
const PointerEvent = class extends w.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId || 1; this.pointerType = o.pointerType || "mouse"; this.pressure = o.pressure ?? 0.5; } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel, root = w.document) => root.querySelector(sel);
const qa = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const click = (el, opts = {}) => { if (!el) throw new Error("click target missing"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, detail: 1, ...opts })); };
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, ...opts }));
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const setVal = (el, v, final = true) => { if (!el) throw new Error("input missing"); el.value = v; fire(el, "input"); if (final) fire(el, "change"); };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
let passed = 0;
const step = async (name, fn) => { const before = errors.length; let Note = ""; try { Note = (await fn()) || ""; } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } const ok = errors.length === before; passed += ok; console.log(`${ok ? " ok " : "FAIL"} ${name}${Note ? ` — ${Note}` : ""}`); };
const byAct = (Act, Root = w.document) => qa("[data-act]", Root).filter((E) => E.dataset.act === Act);
const Canvas = () => q(".bs-stage > canvas.bs-canvas") || q(".bs-stage canvas");
const pointer = (type, u, v, extra = {}) => Canvas().dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: u * Rect.width, clientY: v * Rect.height, button: 0, buttons: type === "pointerup" ? 0 : 1, ...extra }));
async function stroke(Pts, extra) { pointer("pointerdown", ...Pts[0], extra); for (const P of Pts.slice(1)) { pointer("pointermove", ...P, extra); await sleep(1); } pointer("pointerup", ...Pts.at(-1), extra); await sleep(20); }
const tap = async (u, v) => { pointer("pointerdown", u, v); pointer("pointerup", u, v); await sleep(15); };

const { Mount } = await import(pathToFileURL(ROOT + "BrushStudio.js"));
const M = await import(pathToFileURL(ROOT + "BrushModel.js"));
const { TOOLS } = await import(pathToFileURL(ROOT + "ToolModel.js"));
const App = Mount(w.document.getElementById("Studio"), {});
const St = App.State;
const Ops = () => App.Pad.Ops.map((O) => O.Kind);
await sleep(30);

await step("mounts library card + studio card with 14 sections and a drawing pad", () => {
  expect(qa('[data-act="section"]').length >= 14, `sections ${qa('[data-act="section"]').length}`);
  expect(Canvas(), "pad canvas");
  expect(qa('[data-act="tool"]').length === TOOLS.length, `rail tools ${qa('[data-act="tool"]').length}`);
  expect(qa('[data-act="pick"]').length >= 5, "library rows");
  return `${St.ActiveId} · ${qa('[data-act="pick"]').length} visible brushes`;
});

await step("library: families fold, search filters, picking a brush loads it", async () => {
  const Fam = byAct("family")[0];
  const Rows = () => qa('.bs-lib-row[data-act="pick"]');
  const Before = Rows().length;
  click(Fam);
  const After = Rows().length;
  click(byAct("family").find((F) => F.dataset.family === Fam.dataset.family));
  expect(Before !== After, `folding ${Fam.dataset.family} changed nothing (${Before})`);
  setVal(q('input[data-act="filter"]'), "fountain", false);
  const Hits = Rows();
  expect(Hits.length >= 1 && Hits.length < Before, `search hits ${Hits.length}`);
  click(Hits[0]);
  expect(St.ActiveId.includes("fountain") || App.Brush().name.toLowerCase().includes("fountain"), St.ActiveId);
  setVal(q('input[data-act="filter"]'), "zzqx-none", false);
  expect(Rows().length === 0, "no hits");
  setVal(q('input[data-act="filter"]'), "", false);
  App.Select("brush-hog-bristle-flat-12-oil");
  return `fountain → ${Hits.length} hit(s)`;
});

await step("every section renders and every field type edits the brush", async () => {
  const Kinds = {};
  for (const Sec of M.SECTIONS) {
    click(byAct("section").find((B) => B.dataset.section === Sec.Id));
    expect(St.Section === Sec.Id, Sec.Id);
    const Panel = q(".bs-settings") || w.document;
    // Sliders (first per group), segments, switches, pickers, selects.
    for (const R of qa('input[type="range"][data-bind^="b|"], input[type="range"][data-bind^="p|"]', Panel).slice(0, 6)) { const Mid = (+R.min + +R.max) / 2; setVal(R, String(Math.round(Mid))); Kinds.slider = (Kinds.slider || 0) + 1; }
    for (const B of qa('[data-act="set"][data-bind^="b|"]:not(.active), [data-act="set"][data-bind^="p|"]:not(.active)', Panel).slice(0, 4)) { if (B.isConnected) { click(B); Kinds.set = (Kinds.set || 0) + 1; } }
    for (const T of qa('[data-act="toggle"][data-bind^="b|"]', Panel).slice(0, 3)) { const Fresh = qa('[data-act="toggle"]').find((E) => E.dataset.bind === T.dataset.bind); if (Fresh) { click(Fresh); Kinds.toggle = (Kinds.toggle || 0) + 1; } }
    for (const S of qa('select[data-bind^="b|"], select[data-bind^="p|"]', Panel).slice(0, 3)) { const Opt = [...S.options].find((O) => O.value !== S.value); if (Opt) { setVal(S, Opt.value); Kinds.select = (Kinds.select || 0) + 1; } }
    for (const C of qa('input[type="color"][data-bind^="b|"]', Panel).slice(0, 2)) { setVal(C, "#3366aa"); Kinds.colour = (Kinds.colour || 0) + 1; }
    for (const P of qa('[data-act="curve-preset"]', Panel).slice(0, 2)) { click(P); Kinds.curve = (Kinds.curve || 0) + 1; }
    for (const Ch of qa('[data-act="chan"][data-bind^="b|"]', Panel).slice(0, 2)) { click(Ch); Kinds.channel = (Kinds.channel || 0) + 1; }
    await sleep(2);
  }
  const By = M.ChangedBySection(App.Brush());
  const Edited = Object.entries(By).filter(([, N]) => N).length;
  expect(Edited >= 10, `only ${Edited} sections show edits: ${JSON.stringify(By)}`);
  return `${Edited}/14 sections edited · ${Object.entries(Kinds).map(([K, N]) => `${K} ${N}`).join(", ")}`;
});

await step("curve editor: drag a point and double-click to add one", async () => {
  click(byAct("section").find((B) => B.dataset.section === "stylus"));
  const Svg = q("svg.bs-curve-svg");
  expect(Svg, "curve svg");
  const Key = Svg.closest("[data-curve]").dataset.curve.slice(2);
  const Before = JSON.stringify(App.Brush().values[Key]);
  // The first point sits at x = 0: pixel (10, 122 - y*112) in the 320-wide viewBox at 1:1.
  const [X0, Y0] = App.Brush().values[Key][0];
  const Px = 10 + X0 * 300, Py = 122 - Y0 * 112;
  Svg.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: Px, clientY: Py }));
  Svg.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: Px, clientY: Py + (Y0 > 0.5 ? 40 : -40) }));
  Svg.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: Px, clientY: Py + (Y0 > 0.5 ? 40 : -40) }));
  const Dragged = JSON.stringify(App.Brush().values[Key]);
  expect(Dragged !== Before, "drag moved nothing");
  const N = App.Brush().values[Key].length;
  q("svg.bs-curve-svg").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, clientX: 160, clientY: 20 }));
  expect(App.Brush().values[Key].length === N + 1, "double-click adds a point");
  return `${Key}: ${N} → ${N + 1} points`;
});

await step("per-field reset, section reset, whole-brush reset, reset point", async () => {
  click(byAct("section").find((B) => B.dataset.section === "stroke"));
  const R = q('input[type="range"][data-bind="b|stroke.spacing"]');
  setVal(R, "77");
  expect(App.Brush().values["stroke.spacing"] === 77, "spacing set");
  const FR = byAct("field-reset").find((B) => B.dataset.bind === "b|stroke.spacing");
  expect(FR, "field reset button");
  click(FR);
  expect(App.Brush().values["stroke.spacing"] === App.Brush().reset.values["stroke.spacing"], "field reset");
  setVal(q('input[type="range"][data-bind="b|stroke.jitterLateral"]'), "40");
  click(byAct("reset-section")[0]);
  expect(M.ChangedBySection(App.Brush()).stroke === 0, "section reset");
  click(byAct("reset-all")[0]);
  expect(M.Changed(App.Brush()).size === 0, `brush reset left ${[...M.Changed(App.Brush())].slice(0, 5)}`);
  click(byAct("section").find((B) => B.dataset.section === "about"));
  setVal(q('input[type="range"][data-bind="b|stroke.spacing"]') || q('[data-bind="m|name"]'), "My oil brush");
  if (byAct("reset-point")[0]) { click(byAct("reset-point")[0]); expect(M.Changed(App.Brush()).size === 0, "reset point"); }
});

await step("duplicate, export and import", async () => {
  const Count = Object.keys(St.Brushes).length;
  click(byAct("duplicate")[0]);
  expect(Object.keys(St.Brushes).length === Count + 1 && St.ActiveId.includes("~"), "duplicated");
  click(byAct("export")[0]);
  expect(downloads.at(-1)?.endsWith(".json") || downloads.at(-1)?.includes("brush"), `download ${downloads.at(-1)}`);
  const Text = App.Export();
  const File = q(".bs-file");
  const Doc = JSON.parse(Text); Doc.name = "Imported brush"; Doc.id = "imported-1";
  Object.defineProperty(File, "files", { value: [{ text: async () => JSON.stringify(Doc) }], configurable: true });
  fire(File, "change");
  await sleep(10);
  expect(App.Brush().name === "Imported brush", App.Brush().name);
  Object.defineProperty(File, "files", { value: [{ text: async () => "{not json" }], configurable: true });
  fire(File, "change");
  await sleep(10);
  expect(App.Brush().name === "Imported brush", "bad import ignored");
  return `downloads: ${downloads.join(", ")}`;
});

await step("settings undo / redo", async () => {
  const Before = App.Brush().values["stroke.spacing"];
  click(byAct("section").find((B) => B.dataset.section === "stroke"));
  setVal(q('input[type="range"][data-bind="b|stroke.spacing"]'), String(Before === 50 ? 60 : 50));
  click(byAct("undo")[0]);
  expect(App.Brush().values["stroke.spacing"] === Before, "undo");
  click(byAct("redo")[0]);
  expect(App.Brush().values["stroke.spacing"] !== Before, "redo");
});

await step("drawing pad: every tool commits an op", async () => {
  App.Select("brush-hog-bristle-flat-12-oil");
  click(byAct("clear")[0]);
  const Start = App.Pad.Ops.length;
  App.Tool("paint"); await stroke([[0.1, 0.3], [0.3, 0.2], [0.5, 0.4], [0.8, 0.3]]);
  App.Tool("paint"); await stroke([[0.1, 0.6], [0.4, 0.62]], { pointerType: "pen", pressure: 0.8, tiltX: 20, tiltY: 10 });
  App.Tool("smudge"); await stroke([[0.2, 0.3], [0.4, 0.35]]);
  App.Tool("erase"); await stroke([[0.4, 0.1], [0.45, 0.5]]);
  App.Tool("fill"); await tap(0.9, 0.9);
  App.Tool("stamp"); await tap(0.2, 0.75); await stroke([[0.3, 0.8], [0.5, 0.82], [0.7, 0.8]]);
  App.Tool("gradient"); await stroke([[0.05, 0.1], [0.95, 0.9]]); key("Enter");
  App.Tool("text"); await tap(0.6, 0.7); key("Enter");
  App.Tool("curve"); for (const [U, V] of [[0.1, 0.5], [0.3, 0.45], [0.5, 0.6]]) await tap(U, V); key("Backspace"); await tap(0.7, 0.5); key("Enter");
  App.Tool("move"); await stroke([[0.5, 0.5], [0.55, 0.52]]); key("Enter");
  App.Tool("eyedropper"); await tap(0.15, 0.3);
  await sleep(30);
  const Kinds = Ops().slice(Start);
  for (const K of ["paint", "smudge", "erase", "fill", "stamp", "gradient", "text", "move"]) expect(Kinds.includes(K), `no ${K} op in ${Kinds.join(",")}`);
  expect(Kinds.filter((K) => K === "paint").length >= 3, "curve should stroke a paint op");
  expect(St.Tools.eyedropper.last, "eyedropper sampled");
  expect(App.Pad.Stats.Dabs >= 0 && typeof App.Pad.Stats.Ms === "number", "stats");
  return Kinds.join(" · ");
});

await step("pad undo / redo / clear and keyboard shortcuts", async () => {
  const N = App.Pad.Ops.length;
  click(byAct("pad-undo")[0]); expect(App.Pad.Ops.length === N - 1, "pad undo");
  click(byAct("pad-redo")[0]); expect(App.Pad.Ops.length === N, "pad redo");
  key("z", { ctrlKey: true }); expect(App.Pad.Ops.length === N - 1, "ctrl+z");
  key("z", { ctrlKey: true, shiftKey: true }); expect(App.Pad.Ops.length === N, "ctrl+shift+z");
  for (const T of TOOLS) { key(T.Key.toLowerCase()); expect(St.Tool === T.Id, `${T.Key} → ${St.Tool}`); }
  key("b");
  const S0 = App.Brush().values["prop.size"]; key("]"); expect(App.Brush().values["prop.size"] > S0 || S0 === 100, "] grows"); key("[");
  click(byAct("clear")[0]); expect(App.Pad.Ops.length === 0, "clear");
  click(byAct("pad-undo")[0]); expect(App.Pad.Ops.length === N, "undo restores a clear");
});

await step("channel views, paper, live and preview toggles", async () => {
  for (const V of ["roughness", "metalness", "height", "emissive", "albedo"]) { const B = qa("[data-vp-view]").find((E) => E.dataset.vpView === V); click(B); expect(St.View === V, V); await sleep(5); }
  for (const B of byAct("paper")) click(byAct("paper").find((E) => E.dataset.value === B.dataset.value));
  const L = St.Live; click(byAct("live")[0]); expect(St.Live !== L, "live"); click(byAct("live")[0]);
  const P = St.Preview; click(byAct("preview")[0]); expect(St.Preview !== P, "preview"); click(byAct("preview")[0]);
});

await step("every tool opens its own studio and every section's controls edit that tool", async () => {
  const Notes = [];
  const Panel = () => q(".bs-settings");
  for (const T of TOOLS) {
    click(byAct("tool").find((B) => B.dataset.tool === T.Id));
    expect(St.Tool === T.Id && St.Studio === T.Id, `${T.Id} studio`);
    const Ids = byAct("section").map((B) => B.dataset.section).filter((Id) => T.Id !== "paint" || Id === "paint-colour");
    expect(Ids.length >= (T.Id === "paint" ? 1 : 3), `${T.Id} studio has ${Ids.length} sections`);
    let N = 0;
    const Bind = (E) => E.dataset.bind || "";
    for (const Id of Ids) {
      click(byAct("section").find((B) => B.dataset.section === Id));
      expect(q(".bs-set-head h2"), `${T.Id}/${Id} heading`);
      for (const R of qa('input[type="range"][data-bind]', Panel()).slice(0, 8)) { const Fresh = qa('input[type="range"]', Panel()).find((E) => Bind(E) === Bind(R)); if (Fresh) { setVal(Fresh, String(Math.round((+Fresh.min + +Fresh.max) / 2) + 1)); N++; } }
      for (const B of qa('[data-act="set"]:not(.active)', Panel()).slice(0, 6)) { const Fresh = qa('[data-act="set"]', Panel()).find((E) => Bind(E) === Bind(B) && E.dataset.value === B.dataset.value); if (Fresh) { click(Fresh); N++; } }
      for (const B of qa('[data-act="toggle"]', Panel()).slice(0, 4)) { const Fresh = qa('[data-act="toggle"]', Panel()).find((E) => Bind(E) === Bind(B)); if (Fresh) { click(Fresh); N++; } }
      for (const S of qa("select[data-bind]", Panel()).slice(0, 3)) { const Fresh = qa("select", Panel()).find((E) => Bind(E) === Bind(S)); const Opt = Fresh && [...Fresh.options].find((O) => O.value !== Fresh.value); if (Opt) { setVal(Fresh, Opt.value); N++; } }
      for (const C of qa('input[type="color"][data-bind]', Panel()).slice(0, 2)) { setVal(C, "#22aa66"); N++; }
      const Txt = q("textarea[data-bind]", Panel()); if (Txt) { setVal(Txt, "Hello pad"); N++; }
      for (const Ch of qa('[data-act="chan"]', Panel()).slice(0, 2)) { const Fresh = qa('[data-act="chan"]', Panel()).find((E) => Bind(E) === Bind(Ch) && E.dataset.value === Ch.dataset.value); if (Fresh) { click(Fresh); N++; } }
      for (const A of ["swatch", "swap-colours", "nudge", "gradient-clear", "curve-clear", "text-cancel"]) { const B = byAct(A, Panel())[0]; if (B) { click(B); N++; } }
      expect(St.Studio === T.Id, `${T.Id} studio stayed open`);
    }
    if (T.Id !== "paint") {
      // edited marks: section counts, a per-field reset, a section reset, the About page and a whole-tool reset
      const Edited = qa(".bs-sec-count").length;
      expect(Edited >= 1, `${T.Id}: edits show section counts`);
      const Fr = qa('[data-act="field-reset"]', Panel())[0]; if (Fr) click(Fr);
      const Rs = byAct("reset-section", Panel())[0]; if (Rs && !Rs.disabled) click(Rs);
      click(byAct("section").find((B) => B.dataset.section === "about"));
      expect(q(".bs-tool-card"), `${T.Id} about card`);
      const Reset = byAct("tool-reset").find((B) => !B.disabled); if (Reset) click(Reset);
      expect(qa(".bs-sec-count").length === 0, `${T.Id}: tool reset clears edits`);
    }
    expect(N >= 3, `${T.Id} studio only had ${N} working controls`);
    Notes.push(`${T.Id} ${N}`);
  }
  return Notes.join(" · ");
});

await step("studio link: a brush-using tool opens the Brush Studio and Escape returns", async () => {
  App.Tool("curve");
  click(byAct("section").find((B) => B.dataset.section === "brush"));
  click(byAct("studio")[0]);
  expect(St.Studio === "paint" && St.Tool === "curve", `studio link → ${St.Studio}`);
  expect(q(".bs-head").textContent.includes("Brush Studio") && byAct("studio-back").length, "back chip");
  key("Escape"); expect(St.Studio === "curve", "Escape returns to the Curve Studio");
  App.Tool("paint"); App.Section("properties");
  const R = qa('input[type="range"]', q(".bs-settings")).find((E) => E.dataset.bind === "b|prop.size");
  expect(R, "size slider bound to the brush"); setVal(R, "33");
  expect(App.Brush().values["prop.size"] === 33, `studio size → brush ${App.Brush().values["prop.size"]}`);
  expect(q('.bs-side input[data-fid="side-size"]').value === "33", "side slider follows the brush");
});

await step("drawing pad closes and reopens; viewport stays blank", async () => {
  expect(St.PadOpen && q(".bs-shell").dataset.pad === "open", "pad starts open");
  click(byAct("pad-toggle", q(".bs-padbar"))[0]);
  expect(!St.PadOpen && q(".bs-shell").dataset.pad === "closed", "close from the pad");
  click(byAct("pad-toggle", q(".bs-rail"))[0]);
  expect(St.PadOpen, "reopen from the rail");
  click(byAct("pad-toggle", q(".bs-head"))[0]); expect(!St.PadOpen, "close from the studio head");
  App.TogglePad(true); expect(St.PadOpen, "TogglePad(true)");
  expect(!q(".vp-body canvas:not(.bs-canvas):not(.bs-guide)"), "no renderer canvas in the viewport");
  expect(q(".vp-title small").textContent.length > 0, "viewport meta");
});

console.log(errors.length ? `\n${errors.length} error(s):\n` + errors.join("\n\n") : `\n${passed} passed, 0 errors`);
App.Destroy();
process.exit(errors.length ? 1 : 0);
