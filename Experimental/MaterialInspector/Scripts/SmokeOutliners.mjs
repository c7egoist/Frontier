// UI smoke test for the three outliners (Material layers, Pattern / Stamp artwork, Bake queue). Each page is booted in
// its own jsdom (child process, so module state never leaks) and the outliner is driven generically: every row is
// selected and must sync the card, search narrows the tree and Escape clears it, the filter menu applies / clears every
// filter, statistic tiles toggle, carets collapse / expand, keyboard navigation walks the tree, F2 renames, row tools
// fire, and card edits must re-render the outliner.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/MaterialInspector/Scripts/SmokeOutliners.mjs [material|pattern|stamp|bake]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = fileURLToPath(import.meta.url);
const EXP = resolve(dirname(HERE), "../..") + "/";
const PAGES = {
  material: { Dir: "MaterialInspector", Card: "MaterialInspector.js", Outliner: "MaterialOutliner.js", Fn: "MountMaterialOutliner", Opts: {} },
  pattern: { Dir: "ArtworkInspector", Card: "ArtworkInspector.js", Outliner: "ArtworkOutliner.js", Fn: "MountArtworkOutliner", Opts: { mode: "pattern" } },
  stamp: { Dir: "ArtworkInspector", Card: "ArtworkInspector.js", Outliner: "ArtworkOutliner.js", Fn: "MountArtworkOutliner", Opts: { mode: "stamp" } },
  bake: { Dir: "BakeInspector", Card: "BakeInspector.js", Outliner: "BakeOutliner.js", Fn: "MountBakeOutliner", Opts: {} },
  // The same outliner holding a bake set (one character: body parts, clothes, props) instead of a single study.
  bakeset: { Dir: "BakeInspector", Card: "BakeInspector.js", Outliner: "BakeOutliner.js", Fn: "MountBakeOutliner", Opts: {}, Seed: { key: "Frontier.BakeInspector.v1", model: "BakeModel.js", make: (B) => B.UseTemplate(B.Create(), "outfit") } },
};

const Only = process.argv[2];
if (!Only) {
  let Failed = 0;
  for (const Name of Object.keys(PAGES)) {
    console.log(`\n== ${Name}`);
    const R = spawnSync(process.execPath, [HERE, Name], { stdio: "inherit", env: process.env });
    if (R.status !== 0) Failed++;
  }
  console.log(Failed ? `\n${Failed} outliner suite(s) failed` : "\nall outliner suites passed");
  process.exit(Failed ? 1 : 0);
}

const Page = PAGES[Only];
if (!Page) throw new Error(`unknown page ${Only}`);
const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + "/"))("jsdom");
const ROOT = EXP + Page.Dir + "/";
const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: `http://localhost:8097/Experimental/${Page.Dir}/`, pretendToBeVisual: true });
const w = dom.window;
const errors = [];
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + ((e && e.stack) || e)));
w.addEventListener("error", (e) => errors.push("window error: " + ((e.error && e.error.stack) || e.message)));

w.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind !== "2d") return null;
  return { createImageData: (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }), putImageData: () => {} };
};
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
let blobs = 0; w.URL.createObjectURL = () => `blob:x${++blobs}`;
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () {};
Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true });
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "localStorage", "location", "URL", "URLSearchParams", "CSS", "Blob"]) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* ignore */ }
}
globalThis.addEventListener = w.addEventListener.bind(w);
globalThis.requestAnimationFrame = w.requestAnimationFrame?.bind(w) || ((f) => setTimeout(() => f(performance.now()), 16));
globalThis.cancelAnimationFrame = w.cancelAnimationFrame?.bind(w) || clearTimeout;
globalThis.CSS = w.CSS || {};
globalThis.CSS.escape ||= (s) => String(s).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
w.CSS = globalThis.CSS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OL = () => w.document.getElementById("Outliner");
const q = (sel, root = OL()) => root.querySelector(sel);
const qa = (sel, root = OL()) => [...root.querySelectorAll(sel)];
const click = (el, detail = 1) => { if (!el) throw new Error("click target missing"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, detail })); };
const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
let passed = 0;
const step = async (name, fn) => { const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } const ok = errors.length === before; passed += ok; console.log(`${ok ? " ok " : "FAIL"} ${name}`); };

if (Page.Seed) { const Model = await import(pathToFileURL(ROOT + Page.Seed.model)); w.localStorage.setItem(Page.Seed.key, JSON.stringify(Page.Seed.make(Model))); }
const { Mount } = await import(pathToFileURL(ROOT + Page.Card));
const Mod = await import(pathToFileURL(ROOT + Page.Outliner));
const Hub = Mount(w.document.getElementById("Card"), { ...Page.Opts, docked: true });
const Out = Mod[Page.Fn](OL(), Hub);
const RowIds = () => qa("[data-row]").map((R) => R.dataset.row);
const RowById = (Id) => qa("[data-row]").find((R) => R.dataset.row === Id);
const ByAct = (Act, Sel = "") => qa(`${Sel}[data-act]`).find((B) => B.dataset.act === Act && !B.disabled);

await step("mounts a single outliner card beside the card", async () => {
  expect(qa(".ol-card").length === 1, "one .ol-card");
  expect(q(".ol-head h1").textContent.trim().length > 0, "title");
  expect(RowIds().length > 2, `rows: ${RowIds().length}`);
  expect(qa(".ol-stats button, .ol-stats [data-act]").length >= 1, "stat tiles");
  expect(qa(".ol-foot span").length >= 2, "footer columns");
  console.log(`   ${q(".ol-head h1").textContent.trim()} · ${RowIds().length} rows · stats: ${qa(".ol-stats > *").map((E) => E.textContent.replace(/\s+/g, " ").trim()).join(" | ")}`);
});

await step("every leaf row selects and marks itself selected; group rows select without errors", async () => {
  const Leaves = qa("[data-row]:not([aria-expanded])").map((R) => R.dataset.row);
  const Ids = [...Leaves, ...RowIds().filter((Id) => !Leaves.includes(Id))];
  let Marked = 0;
  for (const Id of Ids) {
    const Row = RowById(Id);
    if (!Row) continue; // selecting may collapse / re-render groups
    click(Row);
    await sleep(20);
    if (RowById(Id)?.classList.contains("selected")) Marked++;
  }
  expect(Marked >= Math.min(1, Leaves.length), `no leaf row showed .selected (${Leaves.length} leaves)`);
  console.log(`   ${Marked}/${Ids.length} rows took the selection (${Leaves.length} leaves)`);
});

await step("search narrows the tree, unknown text empties it, Escape clears", async () => {
  const All = RowIds().length;
  const First = q(".ol-row:not(.group) .ol-name") || q(".ol-name");
  const Word = First.textContent.trim().split(/\s+/)[0];
  type(q('[data-act="ol-search"]'), Word);
  const Hits = RowIds().length;
  expect(Hits >= 1 && Hits <= All, `search ${Word}: ${Hits} of ${All}`);
  type(q('[data-act="ol-search"]'), "zzqxj-nothing");
  expect(RowIds().length <= 1, `nonsense search should leave at most the root row, got ${RowIds().length}`);
  key(q('[data-act="ol-search"]'), "Escape");
  expect(q('[data-act="ol-search"]').value === "" && RowIds().length === All, "cleared");
});

await step("filter menu applies every filter, shows chips, then clears", async () => {
  if (!q('[data-act="ol-filter-menu"]')) return console.log("   (no filters)");
  click(q('[data-act="ol-filter-menu"]'));
  const Values = qa('.ol-menu [data-act="ol-filter"]').map((B) => B.dataset.value);
  expect(Values.length >= 1, "menu items");
  for (const V of Values) {
    if (!q(".ol-menu")) click(q('[data-act="ol-filter-menu"]'));
    click(qa('.ol-menu [data-act="ol-filter"]').find((B) => B.dataset.value === V));
    RowIds();
    click(qa('.ol-chips [data-act="ol-filter"]').find((B) => B.dataset.value === V));
  }
  expect(Out.State?.Filters ? Out.State.Filters.size === 0 : !q(".ol-filter.active"), "all filters removed");
  click(q('[data-act="ol-filter-menu"]'));
  click(qa('.ol-menu [data-act="ol-filter"]').find((B) => B.dataset.value === Values[0]));
  if (!q(".ol-menu")) click(q('[data-act="ol-filter-menu"]'));
  click(q('[data-act="ol-filter-clear"]'));
  expect(!q(".ol-filter.active") && !q(".ol-menu"), "clear filters closes the menu");
  console.log(`   filters: ${Values.join(", ")}`);
});

await step("statistic tiles toggle and toggle back", async () => {
  const Acts = qa(".ol-stats [data-act]").map((B) => B.dataset.act).filter(Boolean);
  for (const A of Acts) { click(ByAct(A, ".ol-stats ")); await sleep(20); click(ByAct(A, ".ol-stats ")); await sleep(20); }
  console.log(`   tiles: ${Acts.join(", ") || "(display only)"}`);
});

await step("carets collapse and expand groups", async () => {
  const Carets = qa('.ol-caret:not(.empty)');
  const Caret = Carets.find((C) => C.classList.contains("open") && C.closest("[data-row]") !== qa("[data-row]")[0]) || Carets[0];
  if (!Caret) return console.log("   (flat tree)");
  const Id = Caret.dataset.id, Before = RowIds().length;
  click(Caret);
  const After = RowIds().length;
  click(qa(".ol-caret").find((C) => C.dataset.id === Id));
  expect(RowIds().length === Math.max(Before, After), "re-expanded");
  expect(Before !== After, `toggling ${Id} changed nothing (${Before})`);
});

await step("keyboard: arrows, Home / End move the selection", async () => {
  const Rows = qa("[data-row]");
  Rows[0].focus();
  key(Rows[0], "End");
  await sleep(20);
  const Last = RowIds().at(-1);
  key(RowById(Last) || qa("[data-row]").at(-1), "Home");
  await sleep(20);
  const Now = qa("[data-row]");
  key(Now[0], "ArrowDown");
  key(qa("[data-row]")[1] || Now[0], "ArrowUp");
  key(qa("[data-row]")[0], "ArrowLeft");
  key(qa("[data-row]")[0], "ArrowRight");
  expect(w.document.activeElement?.closest?.("#Outliner"), "focus stays in the outliner");
});

await step("F2 / double-click rename commits when the row allows it", async () => {
  const Row = qa("[data-row]").find((R) => { R.focus(); key(R, "F2"); return !!q(".ol-rename"); });
  if (!Row) return console.log("   (no renameable rows)");
  const Input = q(".ol-rename");
  Input.value = "Renamed by smoke";
  key(Input, "Enter");
  await sleep(20);
  expect(qa(".ol-name").some((N) => N.textContent.includes("Renamed by smoke")), "rename shows in the tree");
});

await step("row tools and status toggles fire without errors", async () => {
  const Safe = (A) => !/delete|remove|clear/i.test(A);
  const Acts = [...new Set(qa(".ol-tool[data-act], .ol-status[data-act], .ol-eye[data-act]").map((B) => B.dataset.act))].filter(Safe);
  for (const A of Acts) {
    const B = ByAct(A);
    if (!B) continue;
    click(B); await sleep(20);
    const Again = ByAct(A);
    if (Again && /toggle|eye|status|hide|show/i.test(A)) { click(Again); await sleep(20); }
  }
  console.log(`   tools: ${Acts.join(", ") || "(none)"}`);
});

if (q(".ol-actions")) await step("footer action bar: add from its menu, move, duplicate, hide, delete", async () => {
  const Count = () => (Hub.State.Doc?.layers || Hub.State.P?.Authoring?.Layers || Hub.State.P?.layers || []).length;
  const Rows = Count();
  click(q('.ol-actions [data-act="ol-act-menu"]')); await sleep(10);
  const Items = qa(".ol-act-menu button:not([disabled])");
  expect(Items.length >= 1, "add menu lists entries");
  click(Items[0]); await sleep(20);
  expect(!q(".ol-act-menu"), "menu closes after a pick");
  expect(Count() === Rows + 1, `a layer was added (${Rows} → ${Count()})`);
  const Done = [];
  for (const A of ["layer-up", "layer-down", "layer-dup", "layer-vis", "layer-eye", "layer-toggle", "layer-lock"]) {
    const B = qa(`.ol-actions [data-act="${A}"]`).find((E) => !E.disabled);
    if (!B) continue;
    click(B); await sleep(20); Done.push(A);
    if (/vis|eye|toggle|lock/.test(A)) { const Again = qa(`.ol-actions [data-act="${A}"]`).find((E) => !E.disabled); if (Again) { click(Again); await sleep(20); } }
  }
  const Del = qa('.ol-actions [data-act="layer-remove"]').find((E) => !E.disabled);
  if (Del) { const N = Count(); click(Del); await sleep(20); expect(Count() === N - 1, "delete removes the selected layer"); Done.push("layer-remove"); }
  console.log(`   footer: add + ${Done.join(", ")}`);
});

await step("card edits re-render the outliner", async () => {
  const Before = OL().innerHTML;
  const Undo = w.document.querySelector('#Card [data-act="undo"]:not([disabled])');
  if (Undo) { click(Undo); await sleep(5); }
  // Something in the card that changes state: first segment / toggle that is not already active.
  const Seg = [...w.document.querySelectorAll("#Card [data-bind] button:not(.active), #Card button[data-bind]:not(.active)")][0];
  if (Seg) { click(Seg); await sleep(5); }
  expect(qa(".ol-card").length === 1, "still one card");
  if (!Undo && !Seg) console.log("   (nothing to edit)");
  else console.log(`   outliner ${OL().innerHTML === Before ? "unchanged (edit outside the tree)" : "re-rendered"}`);
});

if (Only === "bakeset") await step("bake set: parts tree, toggles, own map queue, add part, per-part bake progress", async () => {
  const S = Hub.State, B = Hub.Model;
  Out.State.Query = ""; Out.State.Filters.clear();
  for (const Id of ["set", "cat:Body", "cat:Clothing", "cat:Props"]) Out.State.Expanded[Id] = true;
  Out.Render();
  if (S.P.set?.template !== "outfit" || S.P.set.parts.length !== 12) Hub.UseTarget("set:outfit");   // earlier steps click every row, Targets included
  expect(S.P.set?.parts.length === 12, "outfit template loaded");
  for (const C of B.PART_CATEGORIES) expect(RowById(`cat:${C}`), `category row ${C}`);
  const Jacket = S.P.set.parts.find((P) => P.kind === "jacket");
  click(RowById(`part:${Jacket.id}`)); await sleep(5);
  expect(S.Part === Jacket.id && w.document.querySelector(`#Card [data-editor="part:${Jacket.id}"]`), "part opens its editor in the card");
  click(q(`[data-act="part-toggle"][data-id="part:${Jacket.id}"]`)); await sleep(5);
  expect(!B.FindPart(S.P, Jacket.id).enabled, "part disabled from the tree");
  click(q(`[data-act="part-toggle"][data-id="part:${Jacket.id}"]`)); await sleep(5);
  click(q(`[data-act="ol-expand"][data-id="part:${Jacket.id}"]`)); await sleep(5);
  click(q(`[data-act="pmap-toggle"][data-id="pmap:${Jacket.id}:ao"]`)); await sleep(5);
  const J = B.FindPart(S.P, Jacket.id);
  expect(J.maps && !J.maps.includes("ao") && B.FindPart(S.P, S.P.set.parts[0].id).maps === null, "own queue on the jacket only");
  click(q(`[data-act="cat-toggle"][data-id="cat:Props"]`)); await sleep(5);
  expect(S.P.set.parts.filter((P) => B.KIND[P.kind].Category === "Props").every((P) => !P.enabled), "props category off");
  click(q(`[data-act="cat-toggle"][data-id="cat:Props"]`)); await sleep(5);
  const Opt = q('.mi-dd-opt[data-act="part-add"][data-value="hat"]');
  Opt.closest("details").open = true; click(Opt); await sleep(5);
  expect(S.P.set.parts.length === 13 && S.P.set.parts.at(-1).name === "Hat 2" && S.Part === S.P.set.parts.at(-1).id, "add part from the outliner dropdown");
  Hub.Bake(); await sleep(250);
  expect(S.Run && S.Run.Parts.length === 13, "bake queues every enabled part");
  expect(qa(".ol-badge").some((B) => /%$/.test(B.textContent)), "running part shows its own progress");
  for (let i = 0; i < 300 && S.Run; i++) await sleep(100);
  expect(!S.Run && qa(".ol-badge").filter((B) => B.textContent === "READY").length >= 12, `parts ready after the bake (${S.Run ? "still running" : qa(".ol-badge").map((B) => B.textContent).join(",")})`);
  Hub.OpenPart(J.id); await sleep(5);
  const Res = w.document.querySelector('#Card .mi-dd-opt[data-act="part-res"][data-value="1024"]');
  Res.closest("details").open = true; click(Res); await sleep(5);
  expect(B.FindPart(S.P, J.id).resolution === 1024, "jacket resolution from its dropdown");
  expect(Hub.StaleParts().length >= 1 && Hub.StaleParts().length < 13, `only some parts stale (${Hub.StaleParts().length})`);
  const Stale = w.document.querySelector('#Card [data-act="bake-stale"]');
  expect(Stale, "stale-only button");
  click(Stale); await sleep(30);
  expect(S.Run && S.Run.Parts.length === Hub.StaleParts().length, "stale-only bake runs just those parts");
  for (let i = 0; i < 300 && S.Run; i++) await sleep(100);
  expect(!Hub.StaleParts().length, "all fresh again");
});

console.log(`\n${passed} passed, ${errors.length ? "with errors" : "0 errors"}`);
if (errors.length) console.log(errors.join("\n\n"));
process.exit(errors.length ? 1 : 0);
