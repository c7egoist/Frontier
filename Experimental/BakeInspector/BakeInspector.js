// BakeInspector.js — the single Map Baking inspector card (TextureStudio BakingWorkspace), Project Zero styling, same
// language as the Material and Pattern / Stamp cards.
//
// One card, top to bottom:
//   identity (study · low / high sources) → statistics (output · ray budget · result state) → bake bar (device, progress)
//   → maps, grouped; each map row opens only the settings that shape it → output fold (resolution, padding, cage) → export.
// The old inspector split this across a left checklist of 18 maps and a right column of always-open "Ray Execution &
// Surface Settings", "3D Volume SDF" and "Export" cards, so it was never clear which slider affected which map.
//
// The card does not bake.  It hands Model.Request(settings) to Options.Bake(request, { Progress, Signal }); without a host
// it runs a clearly labelled dry run that walks the queue on the estimated timings.

import * as B from "./BakeModel.js";
import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Knob, SwitchRow, Segments, StatTile, SyncSiblings, Download, Rebuild, History } from "../MaterialInspector/CardKit.js";

const S = {
  P: null, Open: null, Groups: {}, Folds: {}, Status: "", StatusTimer: 0,
  Run: null,      // { Progress, Text, Index, Total, Controller } while baking
  Result: null,   // { Fingerprint, Ms, Device, Maps, Dry, At }
  Docked: false,  // an outliner card owns the map checklist (the card keeps only the open map's editor)
};
const Peers = new Set();   // outliner re-render hooks: Fn(Live)
const Notify = (Live) => { for (const Fn of Peers) Fn(Live); };
const H = History();
let Root = null, Host = {};
const Store = (() => { try { return globalThis.localStorage; } catch { return null; } })();
const GLYPH = { Normals: "normal", Surface: "surface", "Masks & IDs": "id", "Volume & Distance": "volume" };

// ------------------------------------------------------------------------------------------------ plumbing
function Save() { try { Store?.setItem(B.STORAGE_KEY, JSON.stringify(S.P)); } catch { /* private mode */ } }

function Apply(Next, Live = false) {
  if (!Next) return;
  H.Begin(S.P);
  S.P = Next;
  if (!Live) Settle();
}
function Settle() { if (H.Settle(S.P)) Save(); }

function Step(Back) {
  Settle();
  const Prev = H.Step(Back, S.P);
  if (!Prev) return;
  S.P = B.Normalise(Prev);
  Save();
  Render();
  Flash(Back ? "Undone" : "Redone");
}

function Flash(Text) {
  S.Status = Text;
  const El = Root?.querySelector("[data-status]");
  if (El) { El.textContent = Text; El.classList.add("on"); }
  clearTimeout(S.StatusTimer);
  S.StatusTimer = setTimeout(() => { S.Status = ""; const E = Root?.querySelector("[data-status]"); if (E) { E.classList.remove("on"); E.textContent = "Saved locally"; } }, 1800);
}

// ------------------------------------------------------------------------------------------------ statistics
function ResultState() {
  if (S.Run) return { Label: "Baking", Tone: "", Caption: `${S.Run.Index + 1} of ${S.Run.Total} · ${Math.round(S.Run.Progress * 100)}%` };
  if (!S.Result) return { Label: "Unbaked", Tone: "", Caption: "No results yet" };
  const Fresh = S.Result.Fingerprint === B.Fingerprint(S.P);
  return { Label: Fresh ? "Fresh" : "Stale", Tone: Fresh ? "ok" : "warn", Caption: `${Fresh ? "" : "Settings changed · "}${S.Result.Dry ? "dry run" : S.Result.Device} ${B.Duration(S.Result.Ms / 1000)}` };
}

function StatsHtml() {
  const E = B.Estimate(S.P), R = ResultState();
  const ResLabel = S.P.resolution >= 1024 ? `${S.P.resolution / 1024}K` : `${S.P.resolution}`;
  return StatTile({ Key: "output", Label: "Output", Value: B.Bytes(E.Bytes).split(" ")[0], Unit: B.Bytes(E.Bytes).split(" ")[1] || "", Hot: true,
      Caption: `${E.Maps} map${E.Maps === 1 ? "" : "s"} · ${ResLabel}${S.P.selected.includes("volumeSdf") ? ` + ${S.P.sdfRes}³` : ""}`,
      Meter: { Kind: "stack", Parts: B.GROUPS.map((G) => ({ Share: E.ByGroup[G], Colour: B.GROUP_COLOURS[G], Title: `${G}: ${B.Bytes(E.ByGroup[G])}` })) },
      Title: "Memory the baked results occupy (RGBA8 maps, float32 SDF voxels), split by map group." })
    + StatTile({ Key: "rays", Label: "Ray budget", Value: B.Count(E.Rays).split(" ")[0], Unit: B.Count(E.Rays).split(" ")[1] || "",
      Tone: E.Seconds > 20 ? "warn" : "", Caption: E.Maps ? `≈ ${B.Duration(E.Seconds)} on ${E.Device.toUpperCase()}` : "Nothing queued",
      Meter: { Kind: "fill", At: Math.min(1, Math.log10(1 + E.Seconds * 10) / 3), Colour: E.Seconds > 20 ? "#ff6b5e" : E.Seconds > 3 ? "#ffb238" : "#46d267" },
      Title: "Rays traced across the covered UV area (≈72 % of the atlas) plus SDF distance queries, and the estimated wall time on the chosen device." })
    + StatTile({ Key: "state", Label: "Result", Value: R.Label, Tone: R.Tone, Caption: R.Caption,
      Meter: { Kind: "steps", Count: S.Run ? S.Run.Total : Math.max(1, S.P.selected.length), Done: S.Run ? S.Run.Index : S.Result && R.Label === "Fresh" ? S.P.selected.length : 0, Active: !!S.Run },
      Title: "Whether the last bake still matches the current settings." });
}

// ------------------------------------------------------------------------------------------------ sections
function MapEditor(Id) {
  const P = B.MAP_PARAMS[Id], M = B.MAP[Id];
  const Knobs = P.Keys.map((K) => {
    const Spec = B.SETTINGS[K], Shared = B.SharedWith(S.P, K, Id);
    return Knob({ Bind: `set:${K}`, Label: Spec.Label, Value: S.P[K], Min: Spec.Min, Max: Spec.Max, Step: Spec.Step, Unit: Spec.Unit, Hint: Shared.length ? `shared · ${Shared.length}` : Spec.Hint });
  });
  const Shared = [...new Set(P.Keys.flatMap((K) => B.SharedWith(S.P, K, Id)))];
  let Extra = "";
  if (P.Convention) Extra += Segments("normal-y", [["OpenGL +Y", "+Y"], ["DirectX −Y", "-Y"]], S.P.normalY, { Label: "Tangent convention" });
  if (P.Volume) Extra += `<div class="mi-sub-label">Voxel grid</div>` + Segments("sdf-res", B.SDF_DIMS.map((D) => [`${D}³`, D]), S.P.sdfRes, { Label: "Voxel grid" })
    + SwitchRow("sdf-signed", S.P.sdfSigned, "Signed interior", S.P.sdfSigned ? "Negative inside the mesh" : "Distance magnitude only");
  const C = B.MapCost(S.P, Id);
  return `<div class="mi-editor" data-editor="${Id}">
    ${Extra}
    ${Knobs.length ? `<div class="mi-knob-grid">${Knobs.join("")}</div>` : ""}
    ${P.Note ? `<p class="mi-note">${Esc(P.Note)}</p>` : ""}
    ${Shared.length ? `<p class="mi-note">Also drives ${Esc(Shared.join(", "))}.</p>` : ""}
    <div class="mi-editor-foot"><code>${Esc(Id)} · ${P.Volume ? `${C.Voxels.toLocaleString("en")} voxels` : `${B.MAP_PARAMS[Id].Rays(S.P)} ray${B.MAP_PARAMS[Id].Rays(S.P) === 1 ? "" : "s"}/texel`}</code><span class="bi-cost">${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)} rays` : ""}</span></div>
  </div>`;
}

function MapRow(M) {
  const On = S.P.selected.includes(M.id), Open = S.Open === M.id, C = B.MapCost(S.P, M.id);
  const Running = S.Run && S.Run.Queue?.[S.Run.Index] === M.id, Done = S.Run && S.Run.Queue?.indexOf(M.id) > -1 && S.Run.Queue.indexOf(M.id) < S.Run.Index;
  return `<div class="mi-row bi-map ${Open ? "open" : ""} ${On ? "" : "off"} ${Running ? "running" : ""} ${Done ? "done" : ""}" data-row="${M.id}">
    <div class="ai-mod-line">
      <button type="button" class="mi-dot" data-act="map-toggle" data-map="${M.id}" role="switch" aria-checked="${On}" title="${On ? "Skip" : "Bake"} ${Esc(M.label)}" aria-label="${On ? "Skip" : "Bake"} ${Esc(M.label)}"></button>
      <button type="button" class="mi-row-head" data-act="open" data-id="${M.id}" data-fid="row:${M.id}" aria-expanded="${Open}">
        <span class="mi-row-name">${Esc(M.label)}<small>${Esc(M.short)}</small></span>
        <span class="mi-readout">${On ? `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)}` : ""}` : "Skipped"}</span>
      </button>
    </div>
    ${Open ? MapEditor(M.id) : ""}
  </div>`;
}

function MapGroups() {
  return B.GROUPS.map((G) => {
    const Maps = B.BAKE_MAP_CATALOG.filter((M) => M.group === G), On = Maps.filter((M) => S.P.selected.includes(M.id)).length;
    const Open = S.Groups[G] ?? (On > 0 || Maps.some((M) => M.id === S.Open));
    return `<div class="mi-group ${Open ? "open" : ""}" data-group="${Esc(G)}">
      <div class="bi-group-line">
        <button type="button" class="mi-group-head" data-act="group" data-group="${Esc(G)}" data-open="${Open}" aria-expanded="${Open}">
          <span class="mi-chev">${icon("chevron", 11)}</span><i class="bi-group-dot" style="background:${B.GROUP_COLOURS[G]}"></i><span>${Esc(G)}</span><small>${On} / ${Maps.length}</small>
        </button>
        <button type="button" class="mi-text-btn bi-all" data-act="group-all" data-group="${Esc(G)}" data-on="${On < Maps.length}">${On < Maps.length ? "All" : "None"}</button>
      </div>
      ${Open ? Maps.map(MapRow).join("") : ""}
    </div>`;
  }).join("");
}

// With the outliner docked, the queue checklist lives there; the card shows only the map being inspected.
function DockedMap() {
  const M = S.Open && B.MAP[S.Open];
  if (!M) return `<p class="mi-empty">Pick a map in the bake queue to see the settings that shape it.</p>`;
  return MapRow(M);
}

function Source(Slot, Label) {
  const Src = S.P[Slot];
  return `<label class="bi-source ${Src ? "custom" : ""}" title="${Src ? `${Esc(Src.name)} · click to replace` : `Use a custom ${Label.toLowerCase()} mesh (.obj / .stl)`}">
    ${icon("upload", 12)}<span><b>${Label}</b><small>${Src ? Esc(Src.name) : "Study mesh"}</small></span>
    <input type="file" accept=".obj,.stl" data-act="source" data-slot="${Slot}" hidden>
    ${Src ? `<button type="button" class="mi-x" data-act="source-clear" data-slot="${Slot}" aria-label="Use the study mesh">${icon("close", 10)}</button>` : ""}
  </label>`;
}

function OutputFold() {
  const Open = S.Folds.out ?? false;
  return `<details class="mi-fold" data-fold="out" ${Open ? "open" : ""}>
    <summary>${icon("sliders", 14)}<span>Output &amp; cage</span><small>${S.P.resolution} PX · PAD ${S.P.padding} · ${S.P.normalY === "+Y" ? "OPENGL" : "DIRECTX"}</small><span class="mi-chev">${icon("chevron", 11)}</span></summary>
    <div class="mi-fold-body">
      <div class="mi-sub-label">Map resolution</div>
      ${Segments("res", B.RESOLUTIONS.map((R) => [R >= 1024 ? `${R / 1024}K` : String(R), R]), S.P.resolution, { Label: "Map resolution" })}
      ${Knob({ Bind: "set:padding", Label: B.SETTINGS.padding.Label, Value: S.P.padding, Min: 0, Max: 14, Step: 1, Unit: "px", Hint: B.SETTINGS.padding.Hint })}
      <div class="mi-knob-grid">
        ${["frontDistance", "rearDistance"].map((K) => Knob({ Bind: `set:${K}`, Label: B.SETTINGS[K].Label, Value: S.P[K], Min: B.SETTINGS[K].Min, Max: B.SETTINGS[K].Max, Step: B.SETTINGS[K].Step, Unit: "m" })).join("")}
      </div>
      ${Segments("normal-y", [["OpenGL +Y", "+Y"], ["DirectX −Y", "-Y"]], S.P.normalY, { Label: "Tangent convention" })}
    </div>
  </details>`;
}

function CardHtml() {
  const P = S.P, St = B.Study(P), Index = B.BAKE_STUDY_SHAPES.indexOf(St), E = B.Estimate(P), Run = S.Run;
  return `<article class="mi-card bi-card" aria-label="Map Baking inspector">
    <header class="mi-head">
      <span class="mi-mark">${icon("bake", 15)}</span>
      <div class="mi-head-title"><b>Map Baking</b><small>HIGH → LOW CAGE</small></div>
      <div class="mi-head-tools">
        <button type="button" class="icon-btn" data-act="undo" ${H.Past.length && !Run ? "" : "disabled"} title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 14)}</button>
        <button type="button" class="icon-btn" data-act="redo" ${H.Future.length && !Run ? "" : "disabled"} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 14)}</button>
        <label class="icon-btn" title="Import bake preset" aria-label="Import bake preset">${icon("upload", 14)}<input type="file" accept=".json,application/json" data-act="import" hidden></label>
        <button type="button" class="icon-btn" data-act="reset" ${Run ? "disabled" : ""} title="Reset to defaults" aria-label="Reset to defaults">${icon("reset", 14)}</button>
      </div>
    </header>

    <section class="mi-ident">
      <span class="mi-eyebrow">${Esc(St.family.toUpperCase())} / ${String(Index + 1).padStart(2, "0")}</span>
      <div class="mi-name bi-name">${Esc(St.name)}</div>
      <div class="mi-ident-row">
        <span class="mi-sub" title="${Esc(St.desc)}">${Esc(St.complexity)} · ${Esc(St.topo)} · ${Esc(St.role)}</span>
        <select class="mi-library" data-act="study" aria-label="Bake study" ${Run ? "disabled" : ""}>
          ${B.BAKE_STUDY_SHAPES.map((E) => `<option value="${E.id}" ${E.id === P.studyId ? "selected" : ""}>${Esc(E.name)}</option>`).join("")}
        </select>
      </div>
      <div class="bi-sources">${Source("lowSource", "Low")}${icon("ray", 12)}${Source("highSource", "High")}</div>
    </section>

    <section class="mi-metrics" data-metrics>${StatsHtml()}</section>

    <section class="bi-bake">
      <div class="bi-bake-row">
        <button type="button" class="bi-go ${Run ? "running" : ""}" data-act="${Run ? "cancel" : "bake"}" ${!Run && !E.Maps ? "disabled" : ""}>
          ${icon(Run ? "stop" : "play", 13)}${Run ? "Cancel" : E.Maps ? `Bake ${E.Maps} map${E.Maps === 1 ? "" : "s"}` : "Pick a map"}
        </button>
        ${Segments("device", B.DEVICES, P.deviceMode, { Label: "Ray device", Fill: false })}
      </div>
      <div class="bi-progress" data-progress><i style="width:${Run ? Run.Progress * 100 : S.Result && ResultState().Label === "Fresh" ? 100 : 0}%"></i></div>
      <div class="bi-progress-text" data-progress-text>${Esc(Run ? Run.Text : S.Result ? `Last bake: ${S.Result.Maps.length} maps in ${B.Duration(S.Result.Ms / 1000)}${S.Result.Dry ? " (dry run — no bake engine attached)" : ` on ${S.Result.Device}`}` : Host.Bake ? "Ready" : "Dry run — this page has no bake engine attached; timings follow the estimate")}</div>
    </section>

    <section class="mi-channels">
      <div class="mi-section-title"><h3>Maps</h3><small>${E.Maps} OF ${B.BAKE_MAP_CATALOG.length} QUEUED</small></div>
      <div class="mi-list">${S.Docked ? DockedMap() : MapGroups()}</div>
    </section>

    ${OutputFold()}

    <footer class="mi-foot">
      <div class="mi-export">
        <button type="button" class="primary" data-act="export-preset">${icon("download", 13)}Preset</button>
        <button type="button" data-act="export-request" title="The exact request a bake host receives">${icon("download", 13)}Request</button>
        <button type="button" data-act="copy-request" title="Copy the bake request">${icon("copy", 13)}Copy</button>
      </div>
      <div class="mi-foot-line"><span class="mi-status ${S.Status ? "on" : ""}" data-status>${Esc(S.Status || "Saved locally")}</span><span>Open a map to see what shapes it</span></div>
    </footer>
  </article>`;
}

function Render() { Rebuild(Root, CardHtml(), ".bi-card"); Notify(false); }

function RefreshLive() {
  const M = Root.querySelector("[data-metrics]");
  if (M) M.innerHTML = StatsHtml();
  for (const Row of Root.querySelectorAll(".bi-map")) {
    const Id = Row.dataset.row, Read = Row.querySelector(".mi-readout"), C = B.MapCost(S.P, Id);
    if (Read && S.P.selected.includes(Id)) Read.textContent = `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)}` : ""}`;
    const Cost = Row.querySelector(".bi-cost");
    if (Cost) Cost.textContent = `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)} rays` : ""}`;
  }
  Notify(true);
}

function UpdateProgress() {
  const Bar = Root.querySelector("[data-progress] i"), Text = Root.querySelector("[data-progress-text]"), M = Root.querySelector("[data-metrics]");
  if (Bar) Bar.style.width = `${(S.Run?.Progress ?? 1) * 100}%`;
  if (Text && S.Run) Text.textContent = S.Run.Text;
  if (M) M.innerHTML = StatsHtml();
  for (const Row of Root.querySelectorAll(".bi-map")) {
    const At = S.Run?.Queue.indexOf(Row.dataset.row) ?? -1;
    Row.classList.toggle("running", At > -1 && At === S.Run.Index);
    Row.classList.toggle("done", At > -1 && At < S.Run.Index);
  }
  Notify(true);
}

// ------------------------------------------------------------------------------------------------ bake
// Default host: walks the queue on the estimated per-map timings (compressed into ≤ 4 s) so the progress UI is exercisable.
async function DryRun(Request, { Progress, Signal }) {
  const Queue = [...(Request.surface?.channels || []), ...(Request.volume ? ["volumeSdf"] : [])];
  const Costs = Queue.map((Id) => Math.max(0.15, (B.MapCost(S.P, Id).Rays || 2e5) / 3.2e8));
  const Scale = Math.min(1, 4 / Costs.reduce((A, C) => A + C, 0.001));
  const T0 = performance.now();
  for (let I = 0; I < Queue.length; I++) {
    const Ms = Math.max(140, Costs[I] * Scale * 1000), Steps = 6;
    for (let K = 0; K < Steps; K++) {
      if (Signal.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((R) => setTimeout(R, Ms / Steps));
      Progress((I + (K + 1) / Steps) / Queue.length, `Dry run · ${B.MAP[Queue[I]].label}`, I);
    }
  }
  return { Device: "Dry run", Ms: performance.now() - T0, Maps: Queue, Dry: true };
}

async function RunBake() {
  if (S.Run || !S.P.selected.length) return;
  Settle();
  const Request = B.Request(S.P), Fingerprint = B.Fingerprint(S.P);
  const Queue = [...(Request.surface?.channels || []), ...(Request.volume ? ["volumeSdf"] : [])];
  const Controller = new AbortController();
  S.Run = { Progress: 0, Text: "Preparing…", Index: 0, Total: Queue.length, Queue, Controller };
  Render();
  const T0 = performance.now();
  const Progress = (P, Text, Index) => {
    if (!S.Run) return;
    S.Run.Progress = Math.max(0, Math.min(1, +P || 0));
    if (Text) S.Run.Text = Text;
    S.Run.Index = Number.isInteger(Index) ? Math.min(Queue.length - 1, Index) : Math.min(Queue.length - 1, Math.floor(S.Run.Progress * Queue.length));
    UpdateProgress();
  };
  try {
    const R = await (Host.Bake || DryRun)(Request, { Progress, Signal: Controller.signal });
    S.Result = { Fingerprint, Ms: R?.Ms ?? performance.now() - T0, Device: R?.Device || "host", Maps: R?.Maps || Queue, Dry: !!R?.Dry, Data: R?.Data ?? null, At: Date.now() };
    S.Run = null;
    Render();
    Flash(`Baked ${S.Result.Maps.length} maps`);
    Host.OnResult?.(S.Result);
  } catch (Error) {
    S.Run = null;
    Render();
    Flash(Error?.name === "AbortError" ? "Bake cancelled" : `Bake failed · ${Error?.message || Error}`);
  }
}

// ------------------------------------------------------------------------------------------------ events
function Write(Bind, Raw) {
  if (Bind.startsWith("set:")) { const V = +Raw; return Number.isFinite(V) ? B.SetValue(S.P, Bind.slice(4), V) : S.P; }
  return S.P;
}

function OnClick(Event) {
  const El = Event.target.closest("[data-act]");
  if (!El || !Root.contains(El) || El.disabled) return;
  const Act = El.dataset.act, V = El.dataset.value;
  if (["study", "import", "source"].includes(Act)) return;
  switch (Act) {
    case "undo": return Step(true);
    case "redo": return Step(false);
    case "reset": Apply(B.Create()); S.Open = null; Flash("Defaults restored"); break;
    case "bake": RunBake(); return;
    case "cancel": S.Run?.Controller.abort(); return;
    case "device": Apply(B.SetValue(S.P, "deviceMode", V)); break;
    case "open": S.Open = S.Open === El.dataset.id ? null : El.dataset.id; break;
    case "map-toggle": Apply(B.ToggleMap(S.P, El.dataset.map)); break;
    case "group": S.Groups[El.dataset.group] = El.dataset.open !== "true"; break;
    case "group-all": Apply(B.SetGroup(S.P, El.dataset.group, El.dataset.on === "true")); S.Groups[El.dataset.group] = true; break;
    case "normal-y": Apply(B.SetValue(S.P, "normalY", V)); break;
    case "sdf-res": Apply(B.SetValue(S.P, "sdfRes", +V)); break;
    case "sdf-signed": Apply(B.SetValue(S.P, "sdfSigned", !S.P.sdfSigned)); break;
    case "res": Apply(B.SetValue(S.P, "resolution", +V)); break;
    case "source-clear": Event.preventDefault(); Apply(B.SetValue(S.P, El.dataset.slot, null)); Host.OnSource?.(El.dataset.slot, null); break;
    case "export-preset": Download(B.ExportPreset(S.P), `${S.P.studyId}.bake.json`, "application/json"); return Flash("Exported bake preset");
    case "export-request": Download(JSON.stringify(B.Request(S.P), null, 2), `${S.P.studyId}.bake-request.json`, "application/json"); return Flash("Exported bake request");
    case "copy-request": (navigator.clipboard?.writeText(JSON.stringify(B.Request(S.P), null, 2)) || Promise.reject()).then(() => Flash("Copied bake request"), () => Flash("Clipboard unavailable")); return;
    default: return;
  }
  Render();
  if (Act === "open" && S.Open) Root.querySelector(`[data-fid="row:${CSS.escape(S.Open)}"]`)?.focus({ preventScroll: true });
}

function OnInput(Event) {
  const El = Event.target;
  if (!El.dataset.bind) return;
  if (El.type === "number" && (El.value === "" || !Number.isFinite(+El.value))) return;
  Apply(Write(El.dataset.bind, El.value), true);
  SyncSiblings(Root, El);
  RefreshLive();
}

async function OnChange(Event) {
  const El = Event.target, Act = El.dataset.act;
  if (Act === "study") { Apply(B.SetValue(S.P, "studyId", El.value)); Render(); Flash(`Study: ${B.Study(S.P).name}`); return; }
  if (Act === "source") {
    const File = El.files?.[0];
    if (!File) return;
    Apply(B.SetValue(S.P, El.dataset.slot, { name: File.name, size: File.size }));
    Host.OnSource?.(El.dataset.slot, File);
    El.value = "";
    Render();
    Flash(`${El.dataset.slot === "lowSource" ? "Low" : "High"} mesh: ${File.name}`);
    return;
  }
  if (Act === "import") {
    const File = El.files?.[0];
    El.value = "";
    if (!File) return;
    try { Apply(B.Load(await File.text())); Render(); Flash("Preset imported"); } catch (Error) { Flash(`Import failed · ${Error.message}`); }
    return;
  }
  if (El.dataset.bind) {
    if (El.type === "number" && Number.isFinite(+El.value) && El.value !== "") Apply(Write(El.dataset.bind, El.value), true);
    Settle();
    Render();
  }
}

function OnKey(Event) {
  const T = Event.target, Typing = T.matches?.("input, textarea, select");
  if ((Event.ctrlKey || Event.metaKey) && !Event.altKey && (Event.key === "z" || Event.key === "Z" || Event.key === "y")) {
    if ((Typing && T.type !== "range") || S.Run) return;
    Event.preventDefault();
    return Step(!(Event.key === "y" || Event.shiftKey));
  }
  if (T.classList?.contains("mi-row-head") && (Event.key === "ArrowDown" || Event.key === "ArrowUp")) {
    Event.preventDefault();
    const Heads = [...Root.querySelectorAll(".mi-row-head")], At = Heads.indexOf(T);
    Heads[Math.max(0, Math.min(Heads.length - 1, At + (Event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    return;
  }
  if (T.classList?.contains("mi-row-head") && Event.key === " " && Event.shiftKey) { Event.preventDefault(); Apply(B.ToggleMap(S.P, T.dataset.id)); Render(); Root.querySelector(`[data-fid="row:${CSS.escape(T.dataset.id)}"]`)?.focus(); return; }
  if (Event.key === "Escape" && !Typing && S.Open) { S.Open = null; Render(); }
}

// ------------------------------------------------------------------------------------------------ boot
// Options.Bake(request, { Progress(p, text, index), Signal }) → Promise<{ Device, Ms, Maps, Data }>; Options.OnResult(result);
// Options.OnSource(slot, File | null) for custom low / high meshes.
export function Mount(El, Options = {}) {
  Root = El;
  Host = Options;
  S.Docked = !!Options.docked;
  let Stored = null;
  try { Stored = Store?.getItem(B.STORAGE_KEY); } catch { Stored = null; }
  try { S.P = Stored ? B.Normalise(JSON.parse(Stored)) : B.Create(); } catch { S.P = B.Create(); }
  Root.addEventListener("click", OnClick);
  Root.addEventListener("input", OnInput);
  Root.addEventListener("change", OnChange);
  Root.addEventListener("toggle", (E) => { const F = E.target.closest?.("[data-fold]"); if (F) S.Folds[F.dataset.fold] = F.open; }, true);
  document.addEventListener("keydown", OnKey);
  if (S.Docked && !S.Open) S.Open = S.P.selected[0] || null;
  Render();
  return Hub;
}

// What the outliner (or a host) drives the card through — edits go Apply → Render so undo and storage stay whole.
const Hub = {
  State: S, Model: B, History: H, Render, Apply, Settle, Flash, Step, Bake: RunBake, ResultState,
  Cancel: () => S.Run?.Controller.abort(),
  Subscribe(Fn) { Peers.add(Fn); return () => Peers.delete(Fn); },
  OpenMap(Id) { S.Open = Id; Render(); Root.querySelector(`[data-fid="row:${CSS.escape(Id)}"]`)?.scrollIntoView?.({ block: "nearest" }); },
};
