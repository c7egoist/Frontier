// BakeStage.js — the Map Baking workspace viewport: header bar · split stage · footer bar.
//
// TextureStudio's BakingWorkspace header carries an eyebrow + status, the study title, a BAKING badge, a resolution combo,
// a three-way view select, undo / redo, a save menu, three CTAs (GeometryCompiler · Send to Paint · Bake Targets) and a
// second tool group (study select, Low Target / High Source uploads, GPU pill), with a HUD hint floating over the stage.
// Here it is one line each:
//
//   header  glyph · study ▾ · BAKING · Low / High sources · GPU  ………  undo · redo │ Export ▾ │ Send to Paint · Bake
//   stage   3D target pane (no renderer attached — the frame one mounts into) · 2D map sheet (one tile per queued map,
//           live through the bake) · or both side by side
//   footer  key hints ………  progress / estimate │ 3D · 2D · Split
//
// GeometryCompiler moves into the Export menu; resolution stays in the card's Output fold (it is a bake setting, not a
// view setting).  Every action goes through the inspector Hub, so the card, the queue outliner and this stage agree.

import { MountViewport } from "../MaterialInspector/Viewport.js";
import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Download } from "../MaterialInspector/CardKit.js";

const VIEWS = [["3D", "3d"], ["2D", "2d"], ["Split", "split"]];
const FILL = {
  Normals: "linear-gradient(135deg, #8a86ff, #9a8cff 45%, #6fb0ff)",
  Surface: "radial-gradient(circle at 42% 36%, #f4f4f4, #8a8a8a 45%, #2a2a2a 80%)",
  "Masks & IDs": "conic-gradient(from 40deg at 50% 50%, #ff6b5e, #ffb238, #46d267, #4d9bff, #c48cff, #ff6b5e)",
  "Volume & Distance": "radial-gradient(circle at 50% 50%, #e0c4ff, #8d5cff 35%, #1e1430 75%)",
};
const Glyph = (Body, Size = 14) => `<svg width="${Size}" height="${Size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Body}</svg>`;
const G = {
  compiler: '<path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9z"/><path d="m9 10.5-2 1.5 2 1.5M15 10.5l2 1.5-2 1.5M12.8 9.5l-1.6 5"/>',
  png: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18"/><circle cx="15.5" cy="9" r="1.5"/>',
};

export function MountBakeStage(Host, Hub) {
  const B = Hub.Model, P = () => Hub.State.P;
  const Gpu = typeof navigator !== "undefined" && !!navigator.gpu;
  const St = { Flash: 0 };
  const Vp = MountViewport(Host, { Title: "Map Baking viewport", Views: VIEWS, View: "split", Head: HeadHtml(), Foot: FootHtml(), OnView: () => Draw() });
  const Card = Host.querySelector(".vp-card"), Stage = Host.querySelector(".vp-stage");
  Card.style.setProperty("--vp-accent", "#ff8a5c");
  Stage.classList.add("bake");
  Vp.Head.dataset.dense = "";   // more header controls than Pattern / Stamp → labels collapse sooner

  function HeadHtml() {
    return `<div class="vp-doc">
        <span class="vp-glyph">${icon("bake", 15)}</span>
        <span class="vp-doc-text"><small>Ray baker</small>
          <select class="vp-name" data-vp="study" aria-label="Bake study">${B.BAKE_STUDY_SHAPES.map((E) => `<option value="${E.id}">${Esc(E.name)}</option>`).join("")}</select></span>
        <span class="vp-badge">BAKING</span>
      </div>
      <span class="vp-sep vp-hide-sm"></span>
      <span class="vp-srcs" data-vp="sources"></span>
      <span class="vp-pill vp-hide-sm ${Gpu ? "" : "warn"}" data-vp="gpu"></span>
      <span class="vp-gap"></span>
      <button type="button" class="vp-ibtn" data-vp="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 15)}</button>
      <button type="button" class="vp-ibtn" data-vp="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 15)}</button>
      <span class="vp-sep"></span>
      <div class="vp-menu-wrap">
        <button type="button" class="vp-btn" data-vp="menu" aria-haspopup="menu" aria-expanded="false" title="Export">${icon("download", 14)}<span class="vp-lbl">Export</span><span class="vp-caret">${icon("down", 11)}</span></button>
        <div class="vp-menu" role="menu" data-menu>
          <button type="button" role="menuitem" data-vp="export-map" title="Needs a bake engine — this demo runs dry">${Glyph(G.png)}Current map<small>.png</small></button>
          <button type="button" role="menuitem" data-vp="export-volume" title="Needs a bake engine — this demo runs dry">${icon("volume", 14)}Volume SDF<small>.fvol</small></button>
          <hr>
          <button type="button" role="menuitem" data-vp="export-preset">${icon("download", 14)}Bake preset<small>.bake.json</small></button>
          <button type="button" role="menuitem" data-vp="export-request">${icon("download", 14)}Bake request<small>.json</small></button>
          <button type="button" role="menuitem" data-vp="copy-request">${icon("copy", 14)}Copy bake request</button>
          <hr>
          <button type="button" role="menuitem" data-vp="compiler">${Glyph(G.compiler)}Open in GeometryCompiler</button>
        </div>
      </div>
      <button type="button" class="vp-btn" data-vp="send-paint" title="Hand the baked maps to Texture Painting">${icon("brush", 14)}<span class="vp-lbl">Send to Paint</span></button>
      <button type="button" class="vp-btn primary" data-vp="bake"></button>`;
  }

  function FootHtml() {
    return `<span class="vp-keys"><span><kbd>B</kbd>Bake</span><span><kbd>Esc</kbd>Cancel</span><span class="vp-k-extra">Pick a map in the queue to inspect it</span></span>
      <span class="vp-gap"></span>
      <span class="bk-meter" data-vp="meter"><span class="bar"><i></i></span><span class="vp-selinfo" data-vp="status"></span></span>
      <span class="vp-sep"></span>
      <span class="vp-seg" role="radiogroup" aria-label="View">${VIEWS.map(([L, Id]) => `<button type="button" role="radio" aria-checked="${Id === "split"}" class="${Id === "split" ? "active" : ""}" data-vp-view="${Id}">${L}</button>`).join("")}</span>`;
  }

  function Source(Slot, Label) {
    const Src = P()[Slot];
    return `<label class="vp-src ${Src ? "custom" : ""}" title="${Src ? `${Esc(Src.name)} · click to replace` : `Load a ${Label.toLowerCase()} mesh (.obj / .stl) — the study mesh is used until then`}">
      ${icon("upload", 12)}<span><b>${Label}</b>${Src ? ` ${Esc(Src.name)}` : ""}</span><input type="file" accept=".obj,.stl" data-vp="source" data-slot="${Slot}" hidden></label>`;
  }

  // ---------------------------------------------------------------------------------------------- stage
  function Pane3d() {
    const S = B.Study(P()), Low = P().lowSource?.name, High = P().highSource?.name;
    return `<div class="bk-pane" data-pane="3d"><span class="bk-pane-tag">3D target</span>
      <div class="bk-empty">${icon("cube", 30)}<b>${Esc(Low || S.name)}</b><span>${Esc(High ? `high: ${High}` : `${S.complexity} · ${S.topo}`)}</span><span>No 3D renderer attached — the target mounts here</span></div></div>`;
  }

  function Pane2d() {
    const S = Hub.State, Sel = P().selected, Run = S.Run, Fresh = Hub.ResultState().Label === "Fresh";
    if (!Sel.length) return `<div class="bk-pane" data-pane="2d"><span class="bk-pane-tag">2D maps</span><div class="bk-empty">${icon("image", 30)}<b>No maps queued</b><span>Tick maps in the queue to bake them</span></div></div>`;
    const Tiles = Sel.map((Id) => {
      const M = B.MAP[Id], At = Run ? Run.Queue.indexOf(Id) : -1;
      const State = Run ? (At > -1 && At < Run.Index ? "done" : At === Run.Index ? "running" : "") : Fresh && S.Result.Maps.includes(Id) ? "done" : "";
      const Tag = State === "done" ? "baked" : State === "running" ? `${Math.round(((Run.Progress * Run.Total) % 1) * 100)}%` : S.Result && !Fresh ? "stale" : "queued";
      const Size = M.isVolume ? `${P().sdfRes}³ voxels` : `${P().resolution} px`;
      return `<button type="button" class="bk-tile ${State} ${S.Open === Id ? "open" : ""}" data-map="${Esc(Id)}" style="--fill:${FILL[M.group]};--g:${B.GROUP_COLOURS[M.group]}" title="${Esc(M.label)} · open in the card">
        <em>${Tag}</em><b>${Esc(M.label)}</b><small>${Esc(M.group)} · ${Size}</small></button>`;
    }).join("");
    return `<div class="bk-pane" data-pane="2d"><span class="bk-pane-tag">2D maps · ${Sel.length}</span><div class="bk-sheet">${Tiles}</div></div>`;
  }

  function Draw() {
    const V = Vp.View;
    const Scroll = Vp.Body.querySelector(".bk-sheet")?.scrollTop || 0;
    Vp.Body.style.display = "flex";
    Vp.Body.innerHTML = `${V !== "2d" ? Pane3d() : ""}${V !== "3d" ? Pane2d() : ""}`;
    const Sheet = Vp.Body.querySelector(".bk-sheet");
    if (Sheet) Sheet.scrollTop = Scroll;
    Chrome();
  }

  function Chrome() {
    const S = Hub.State, Run = S.Run, H = Hub.History, E = B.Estimate(P()), R = Hub.ResultState();
    const Study = Host.querySelector('[data-vp="study"]');
    if (document.activeElement !== Study) Study.value = P().studyId;
    Study.disabled = !!Run;
    Host.querySelector('[data-vp="sources"]').innerHTML = Source("lowSource", "Low") + Source("highSource", "High");
    const Device = P().deviceMode, Pill = Host.querySelector('[data-vp="gpu"]');
    const OnGpu = Device !== "cpu" && Gpu;
    Pill.classList.toggle("warn", !OnGpu);
    Pill.innerHTML = `<i></i>${Device === "cpu" ? "CPU" : Gpu ? "GPU ready" : "CPU fallback"}`;
    Pill.title = Device === "cpu" ? "Ray device forced to CPU in the card" : Gpu ? "WebGPU available — rays run on the GPU" : "No WebGPU in this browser — rays fall back to the CPU";
    Host.querySelector('[data-vp="undo"]').disabled = !H.Past.length || !!Run;
    Host.querySelector('[data-vp="redo"]').disabled = !H.Future.length || !!Run;
    const Go = Host.querySelector('[data-vp="bake"]');
    Go.classList.toggle("primary", !Run);
    Go.classList.toggle("running", !!Run);
    Go.disabled = !Run && !E.Maps;
    Go.innerHTML = Run ? `${icon("stop", 13)}<span class="vp-lbl">Cancel ${Math.round(Run.Progress * 100)}%</span>` : `${icon("play", 13)}<span class="vp-lbl">${E.Maps ? `Bake ${E.Maps} map${E.Maps === 1 ? "" : "s"}` : "Pick a map"}</span>`;
    Go.title = Run ? "Cancel the bake (Esc)" : "Bake the queued maps (B)";
    const HasData = !!S.Result?.Data;
    Host.querySelector('[data-vp="export-map"]').disabled = !HasData;
    Host.querySelector('[data-vp="export-volume"]').disabled = !HasData || !P().selected.includes("volumeSdf");
    Host.querySelector('[data-vp="meter"] .bar i').style.width = `${Run ? Run.Progress * 100 : R.Label === "Fresh" ? 100 : 0}%`;
    Host.querySelector('[data-vp="meter"] .bar i').style.background = R.Label === "Stale" ? "#ffb238" : "#46d267";
    if (!St.Flash) Host.querySelector('[data-vp="status"]').textContent = Run
      ? `${Run.Text} · ${Run.Index + 1} of ${Run.Total}`
      : `${E.Maps} map${E.Maps === 1 ? "" : "s"} · ${P().resolution} px · ~${B.Duration(E.Seconds)} · ${B.Bytes(E.Bytes)} · ${R.Label.toLowerCase()}`;
  }

  // Live progress ticks touch only the tiles + meter (no full redraw mid-bake).
  function Tick() {
    const Run = Hub.State.Run;
    if (!Run) return Draw();
    for (const T of Vp.Body.querySelectorAll("[data-map]")) {
      const At = Run.Queue.indexOf(T.dataset.map);
      T.classList.toggle("done", At > -1 && At < Run.Index);
      T.classList.toggle("running", At === Run.Index);
      const Em = T.querySelector("em");
      if (Em) Em.textContent = At > -1 && At < Run.Index ? "baked" : At === Run.Index ? `${Math.round(((Run.Progress * Run.Total) % 1) * 100)}%` : "queued";
    }
    Chrome();
  }

  function Flash(Text) {
    Hub.Flash(Text);
    const El = Host.querySelector('[data-vp="status"]');
    if (El) El.textContent = Text;
    clearTimeout(St.Flash);
    St.Flash = setTimeout(() => { St.Flash = 0; Chrome(); }, 2200);
  }

  function CloseMenu() {
    Host.querySelector("[data-menu]").classList.remove("open");
    Host.querySelector('[data-vp="menu"]').setAttribute("aria-expanded", "false");
  }

  function OnAct(Id, El) {
    const Request = () => JSON.stringify(B.Request(P()), null, 2);
    switch (Id) {
      case "undo": Hub.Step(true); return;
      case "redo": Hub.Step(false); return;
      case "menu": { const M = Host.querySelector("[data-menu]"), Open = !M.classList.contains("open"); M.classList.toggle("open", Open); El.setAttribute("aria-expanded", String(Open)); return; }
      case "bake": if (Hub.State.Run) Hub.Cancel(); else Hub.Bake(); return;
      case "export-preset": Download(B.ExportPreset(P()), `${P().studyId}.bake.json`, "application/json"); Flash("Exported bake preset"); break;
      case "export-request": Download(Request(), `${P().studyId}.bake-request.json`, "application/json"); Flash("Exported bake request"); break;
      case "copy-request": (navigator.clipboard?.writeText(Request()) || Promise.reject()).then(() => Flash("Copied bake request"), () => Flash("Clipboard unavailable")); break;
      case "compiler":
        try { globalThis.localStorage?.setItem("Frontier.Handoff", JSON.stringify({ From: "bake", To: "geometry-compiler", Request: B.Request(P()), At: Date.now() })); } catch { /* storage full */ }
        Flash("Bake request handed to GeometryCompiler"); break;
      case "send-paint": {
        const R = Hub.ResultState();
        if (R.Label !== "Fresh") { Flash(R.Label === "Stale" ? "Re-bake first — settings changed" : "Bake first — nothing to send"); return; }
        try { globalThis.localStorage?.setItem("Frontier.Handoff", JSON.stringify({ From: "bake", To: "paint", Maps: Hub.State.Result.Maps, Study: P().studyId, At: Date.now() })); } catch { /* storage full */ }
        Flash(`Sent ${Hub.State.Result.Maps.length} maps to Paint`); return;
      }
      default: return;
    }
    CloseMenu();
  }

  Host.addEventListener("click", (E) => {
    const Map = E.target.closest("[data-map]");
    if (Map) { Hub.OpenMap(Map.dataset.map); return; }
    const Btn = E.target.closest("button[data-vp]");
    if (Btn && !Btn.disabled) OnAct(Btn.dataset.vp, Btn);
  });
  document.addEventListener("click", (E) => { if (!E.target.closest?.(".vp-menu-wrap")) CloseMenu(); });
  Host.addEventListener("change", (E) => {
    const El = E.target;
    if (El.dataset.vp === "study") { Hub.Apply(B.SetValue(P(), "studyId", El.value)); Hub.Render(); Flash(`Study: ${B.Study(P()).name}`); }
    else if (El.dataset.vp === "source") {
      const File = El.files?.[0];
      El.value = "";
      if (!File) return;
      Hub.Apply(B.SetValue(P(), El.dataset.slot, { name: File.name, size: File.size }));
      Hub.Render();
      Flash(`${El.dataset.slot === "lowSource" ? "Low" : "High"} mesh: ${File.name}`);
    }
  });
  document.addEventListener("keydown", (E) => {
    const Typing = E.target.matches?.("input, textarea, select, [contenteditable]");
    if (Typing || E.ctrlKey || E.metaKey || E.altKey) return;
    if (E.key === "b" || E.key === "B") { E.preventDefault(); if (!Hub.State.Run && P().selected.length) Hub.Bake(); }
    else if (E.key === "Escape") { CloseMenu(); if (Hub.State.Run) Hub.Cancel(); }
  });

  Hub.Subscribe((Live) => (Live ? Tick() : Draw()));
  Draw();
  return Object.assign(Vp, { Draw, Flash });
}
