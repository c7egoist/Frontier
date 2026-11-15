// ArtworkStage.js — the Pattern Studio / Stamp Studio workspace viewport: header bar · live SVG artboard · footer bar.
//
// TextureStudio's ArtworkStackWorkspace stacks two header bands (eyebrow + doc bar, then 14 vector tools, "More tools",
// a 14-entry view list, undo / redo, a Save menu and two CTAs) over a ruled stage and a hint footer.  This is the same job
// on one line each:
//
//   header  glyph · name · PATTERN/STAMP · resolution  ………  undo · redo │ Save ▾ │ Send to Material · Send to Paint
//   stage   the document's own SVG (artworkDocumentLayersSvg — the exact markup TextureStudio draws), live on every edit;
//           a floating tool rail (Select · Shape ▾ · Text · Gradient · Pan) instead of a tool band
//   footer  key hints ………  selected layer · instances │ view segment │ − zoom + · Fit
//
// The artboard reads and writes the inspector Hub (State.Doc, Apply / Settle / Render), so drags, placements and the
// card's sliders share one undo history and one storage slot.

import { MountViewport } from "../MaterialInspector/Viewport.js";
import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Download } from "../MaterialInspector/CardKit.js";
import { artworkDocumentLayersSvg, artworkDocumentBackgroundSvg, evaluateLayerInstances } from "./Engine/Patterns/ArtworkStackEngine.js";

const Glyph = (Body, Size = 15) => `<svg width="${Size}" height="${Size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Body}</svg>`;
const G = {
  select: '<path d="M6 3.5 18 13l-5.2 1 3 5.6-2.2 1.2-3-5.7L6 18.6z"/>',
  pan: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.3-5.6-3.6L4 13.6a1.4 1.4 0 0 1 2.3-1.6L8 14"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  diamond: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>',
  triangle: '<path d="M12 4.5 20.5 19h-17z"/>',
  hexagon: '<path d="M12 3.5 19.4 7.8v8.4L12 20.5 4.6 16.2V7.8z"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  send: '<path d="M4 12h13M12 6.5 17.5 12 12 17.5"/><path d="M20 5v14" opacity=".5"/>',
  png: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18"/><circle cx="15.5" cy="9" r="1.5"/>',
  open: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
  save: '<path d="M5 4.5h11l3.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5z"/><path d="M8 4.5V9h7V4.5M8 20v-6h8v6"/>',
};
const SHAPES = [["circle", "Circle", "O"], ["square", "Rectangle", "R"], ["diamond", "Diamond", "D"], ["triangle", "Triangle", ""], ["hexagon", "Hexagon", ""], ["star", "Star", ""]];
const TOOLS = { select: ["Select & move", "V"], shape: ["Shape", "R"], text: ["Text", "T"], gradient: ["Gradient wash", "G"], pan: ["Pan", "H"] };
const ACCENT = { pattern: "#4d9bff", stamp: "#46d267" };
const ZMIN = 0.1, ZMAX = 8;
const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));

export function MountArtworkStage(Host, Hub, Mode = Hub.State.Mode) {
  const A = Hub.Model, Stamp = Mode === "stamp";
  const Views = Stamp ? [["Decal", "decal"], ["On surface", "surface"]] : [["Tile", "tile"], ["Repeat 3×3", "repeat"]];
  const St = { Tool: "select", Shape: "circle", Zoom: 1, X: 0, Y: 0, Fitted: true, Drag: null, Space: null, Frame: 0, Flash: 0 };
  const Doc = () => Hub.State.Doc;
  const Size = () => Doc().size || A.ARTWORK_SIZE;

  const Vp = MountViewport(Host, { Title: Stamp ? "Stamp Studio viewport" : "Pattern Studio viewport", Views, Head: HeadHtml(), Foot: FootHtml(), OnView: () => { Fit(); Draw(); } });
  const Card = Host.querySelector(".vp-card"), Stage = Host.querySelector(".vp-stage");
  Card.style.setProperty("--vp-accent", ACCENT[Mode]);
  Stage.classList.add("art");
  Vp.Body.innerHTML = `<div class="art-board" data-board><svg data-art xmlns="http://www.w3.org/2000/svg"></svg></div><span class="art-tag" data-tag hidden></span>`;
  Stage.insertAdjacentHTML("beforeend", RailHtml());
  const Board = Vp.Body.querySelector("[data-board]"), Svg = Vp.Body.querySelector("[data-art]"), Tag = Vp.Body.querySelector("[data-tag]");

  // ---------------------------------------------------------------------------------------------- markup
  function HeadHtml() {
    return `<div class="vp-doc">
        <span class="vp-glyph">${icon(Stamp ? "stamp" : "pattern", 15)}</span>
        <span class="vp-doc-text"><small>${Stamp ? "Stamp Studio · PBR decal" : "Pattern Studio · seamless tile"}</small><input class="vp-name" data-vp="name" aria-label="Document name" spellcheck="false"></span>
        <span class="vp-badge">${Stamp ? "STAMP" : "PATTERN"}</span>
        <select class="vp-select vp-hide-sm" data-vp="res" aria-label="Export resolution" title="Export resolution">${A.RESOLUTIONS.map((R) => `<option value="${R}">${R} px</option>`).join("")}</select>
      </div>
      <span class="vp-gap"></span>
      <button type="button" class="vp-ibtn" data-vp="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 15)}</button>
      <button type="button" class="vp-ibtn" data-vp="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 15)}</button>
      <span class="vp-sep"></span>
      <div class="vp-menu-wrap">
        <button type="button" class="vp-btn" data-vp="menu" aria-haspopup="menu" aria-expanded="false" title="Save & export">${Glyph(G.save, 14)}<span class="vp-lbl">Save</span><span class="vp-caret">${icon("down", 11)}</span></button>
        <div class="vp-menu" role="menu" data-menu>
          <button type="button" role="menuitem" data-vp="save-project">${Glyph(G.save, 14)}Save project<small>.${Mode}.json</small></button>
          <label role="menuitem">${Glyph(G.open, 14)}Open project…<small>.json</small><input type="file" accept=".json,application/json" data-vp="open" hidden></label>
          <hr>
          <button type="button" role="menuitem" data-vp="export-svg">${icon("download", 14)}Export vector<small>.svg</small></button>
          <button type="button" role="menuitem" data-vp="export-png">${Glyph(G.png, 14)}Export image<small data-vp-res>.png</small></button>
          <button type="button" role="menuitem" data-vp="copy-svg">${icon("copy", 14)}Copy SVG markup</button>
        </div>
      </div>
      ${Stamp ? "" : `<button type="button" class="vp-btn" data-vp="send-material" title="Use this tile as a material pattern layer">${icon("material", 14)}<span class="vp-lbl">Send to Material</span></button>`}
      <button type="button" class="vp-btn primary" data-vp="send-paint" title="${Stamp ? "Load this decal into the Stamp tool" : "Use this tile as a paint source"}">${icon("brush", 14)}<span class="vp-lbl">Send to Paint</span></button>`;
  }

  function FootHtml() {
    return `<span class="vp-keys"><span><kbd>V</kbd>Select</span><span><kbd>R</kbd>Shape</span><span><kbd>T</kbd>Text</span><span class="vp-k-extra"><kbd>Space</kbd>Pan</span><span class="vp-k-extra"><kbd>Shift</kbd>Constrain</span></span>
      <span class="vp-gap"></span>
      <span class="vp-selinfo" data-vp="sel" aria-live="polite"></span>
      <span class="vp-sep"></span>
      <span class="vp-seg" role="radiogroup" aria-label="View">${Views.map(([L, Id], I) => `<button type="button" role="radio" aria-checked="${I === 0}" class="${I === 0 ? "active" : ""}" data-vp-view="${Id}">${L}</button>`).join("")}</span>
      <span class="vp-zoombox">
        <button type="button" class="vp-ibtn" data-vp="zoom-out" title="Zoom out (−)" aria-label="Zoom out">${icon("minus", 13)}</button>
        <output data-vp="zoom">100%</output>
        <button type="button" class="vp-ibtn" data-vp="zoom-in" title="Zoom in (+)" aria-label="Zoom in">${icon("plus", 13)}</button>
        <button type="button" class="vp-ibtn" data-vp="fit" title="Fit (F)" aria-label="Fit to view">${Glyph(G.fit, 13)}</button>
      </span>`;
  }

  function RailHtml() {
    const Btn = (Id, Body, More = "") => `<button type="button" class="vp-ibtn" data-tool="${Id}" ${More} title="${TOOLS[Id][0]} (${TOOLS[Id][1]})" aria-label="${TOOLS[Id][0]}">${Body}</button>`;
    return `<nav class="art-rail" aria-label="Vector tools">
      ${Btn("select", Glyph(G.select))}
      <div class="art-shapes">${Btn("shape", Glyph(G.circle), "data-more")}
        <div class="art-fly" data-fly role="menu" aria-label="Shapes">${SHAPES.map(([Id, L]) => `<button type="button" class="vp-ibtn" data-shape="${Id}" title="${L}" aria-label="${L}">${Glyph(G[Id])}</button>`).join("")}</div>
      </div>
      ${Btn("text", icon("text", 15))}
      ${Btn("gradient", icon("gradient", 15))}
      <hr>
      ${Btn("pan", Glyph(G.pan))}
    </nav>`;
  }

  // ---------------------------------------------------------------------------------------------- artboard
  const Units = () => Size() * (Vp.View === "repeat" ? 3 : 1);
  const Origin = () => (Vp.View === "repeat" ? -Size() : 0);

  function SvgMarkup() {
    const D = Doc(), N = Size(), Repeat = Vp.View === "repeat", Surface = Vp.View === "surface";
    const { defs, body } = artworkDocumentLayersSvg(D, { idPrefix: "vp" });
    const Bg = artworkDocumentBackgroundSvg(D, { id: "vp-bg" });
    const Ghosts = Repeat ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([X, Y]) => `<use href="#vp-tile" x="${X * N}" y="${Y * N}" class="art-ghost"/>`).join("") : "";
    const Ground = Surface ? `<filter id="vp-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .19  0 0 0 0 .17  0 0 0 .55 0"/></filter>` : "";
    const Under = Surface ? `<rect width="${N}" height="${N}" fill="#3a3834"/><rect width="${N}" height="${N}" filter="url(#vp-grain)"/>` : "";
    return `<defs><clipPath id="vp-clip"><rect width="${N}" height="${N}"/></clipPath>${Ground}${Bg.defs}${defs}</defs>
      ${Under}<g id="vp-tile" clip-path="url(#vp-clip)">${Bg.rect}${body}</g>${Ghosts}${SelectionMarkup()}`;
  }

  // Corner brackets around the selected layer's own frame (what a drag moves) — no box, no outline over the artwork.
  function SelectionMarkup() {
    const L = A.Selected(Doc());
    if (!L || L.kind === "gradient" || L.kind === "folder" || L.visible === false) return "";
    const T = L.transform || {}, W = Math.max(8, T.width || 48), H = Math.max(8, T.height || 48), Hw = W / 2 + 6, Hh = H / 2 + 6;
    const K = Clamp(Math.min(W, H) * 0.22, 6, 26);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([Sx, Sy]) => `M${Sx * Hw} ${Sy * Hh + -Sy * K}V${Sy * Hh}H${Sx * Hw + -Sx * K}`).join("");
    return `<g class="art-sel" transform="translate(${T.x ?? Size() / 2} ${T.y ?? Size() / 2}) rotate(${T.rotation || 0})"><path d="${C}"/><circle r="${Clamp(2.5 / St.Zoom, 1, 6)}"/></g>`;
  }

  function Draw() {
    cancelAnimationFrame(St.Frame);
    const U = Units(), O = Origin();
    Svg.setAttribute("viewBox", `${O} ${O} ${U} ${U}`);
    Svg.innerHTML = SvgMarkup();
    Board.classList.toggle("checker", Vp.View !== "surface" && !Doc().background?.enabled);
    Board.classList.toggle("surface", Vp.View === "surface");
    Board.dataset.view = Vp.View;
    Place();
    UpdateChrome();
  }
  const Schedule = () => { cancelAnimationFrame(St.Frame); St.Frame = requestAnimationFrame(Draw); };

  function Place() {
    const U = Units();
    Board.style.width = Board.style.height = `${U * St.Zoom}px`;
    Board.style.transform = `translate(${St.X}px, ${St.Y}px)`;
    Host.querySelector('[data-vp="zoom"]').textContent = `${Math.round(St.Zoom * 100)}%`;
    const L = A.Selected(Doc());
    if (L && L.kind !== "gradient" && L.kind !== "folder" && L.visible !== false) {
      const T = L.transform || {}, O = Origin();
      Tag.hidden = false;
      Tag.textContent = L.name;
      Tag.style.left = `${St.X + ((T.x ?? 0) - O) * St.Zoom}px`;
      Tag.style.top = `${St.Y + ((T.y ?? 0) - (T.height || 48) / 2 - 6 - O) * St.Zoom}px`;
    } else Tag.hidden = true;
  }

  function Fit() {
    const W = Stage.clientWidth || 800, H = Stage.clientHeight || 600, U = Units();
    St.Zoom = Clamp(Math.min((W - 132) / U, (H - 56) / U), ZMIN, ZMAX);
    St.X = (W - U * St.Zoom) / 2 + 22;
    St.Y = (H - U * St.Zoom) / 2;
    St.Fitted = true;
    Place();
  }

  function ZoomAt(Factor, Cx, Cy) {
    const Next = Clamp(St.Zoom * Factor, ZMIN, ZMAX);
    if (Cx === undefined) { Cx = Stage.clientWidth / 2; Cy = Stage.clientHeight / 2; }
    St.X = Cx - ((Cx - St.X) * Next) / St.Zoom;
    St.Y = Cy - ((Cy - St.Y) * Next) / St.Zoom;
    St.Zoom = Next;
    St.Fitted = false;
    Draw();
  }

  // Stage pixel → document unit.
  function ToDoc(Event) {
    const R = Stage.getBoundingClientRect();
    return { X: (Event.clientX - R.left - St.X) / St.Zoom + Origin(), Y: (Event.clientY - R.top - St.Y) / St.Zoom + Origin() };
  }

  // ---------------------------------------------------------------------------------------------- chrome sync
  function UpdateChrome() {
    const D = Doc(), H = Hub.History;
    const Name = Host.querySelector('[data-vp="name"]');
    if (Name && document.activeElement !== Name) Name.value = D.name || "";
    const Res = Host.querySelector('[data-vp="res"]');
    if (Res) Res.value = String(D.resolution || 1024);
    const ResTag = Host.querySelector("[data-vp-res]");
    if (ResTag) ResTag.textContent = `${D.resolution || 1024}px .png`;
    Host.querySelector('[data-vp="undo"]').disabled = !H.Past.length;
    Host.querySelector('[data-vp="redo"]').disabled = !H.Future.length;
    for (const B of Host.querySelectorAll("[data-tool]")) { const On = B.dataset.tool === Tool(); B.classList.toggle("active", On); B.setAttribute("aria-pressed", String(On)); }
    const ShapeBtn = Host.querySelector('[data-tool="shape"]');
    ShapeBtn.innerHTML = Glyph(G[St.Shape]);
    ShapeBtn.title = `${SHAPES.find((S) => S[0] === St.Shape)[1]} (R · R again cycles)`;
    for (const B of Host.querySelectorAll("[data-shape]")) B.classList.toggle("active", B.dataset.shape === St.Shape);
    Stage.classList.toggle("pan", Tool() === "pan");
    Stage.classList.toggle("place", ["shape", "text", "gradient"].includes(Tool()));
    Board.classList.toggle("tool-pan", Tool() === "pan");
    Board.classList.toggle("tool-place", ["shape", "text", "gradient"].includes(Tool()));
    if (!St.Flash) SelInfo();
  }
  const Tool = () => St.Space || St.Tool;

  function SelInfo() {
    const El = Host.querySelector('[data-vp="sel"]'), L = A.Selected(Doc());
    if (!El) return;
    if (!L) { El.textContent = "Nothing selected"; return; }
    const Count = L.kind === "folder" ? 0 : evaluateLayerInstances(L, Size(), Mode).length;
    El.innerHTML = `<i style="background:${Esc(A.LayerColour(L))}"></i>${Esc(L.name)}<span>· ${L.kind === "gradient" ? "full-tile wash" : `${Count} instance${Count === 1 ? "" : "s"}`}${L.locked ? " · locked" : ""}</span>`;
  }

  function Flash(Text) {
    Hub.Flash(Text);
    const El = Host.querySelector('[data-vp="sel"]');
    if (El) El.innerHTML = `<i style="background:${ACCENT[Mode]}"></i>${Esc(Text)}`;
    clearTimeout(St.Flash);
    St.Flash = setTimeout(() => { St.Flash = 0; SelInfo(); }, 2200);
  }

  function SetTool(Id) {
    St.Tool = Id;
    Host.querySelector("[data-fly]").classList.remove("open");
    UpdateChrome();
  }

  // ---------------------------------------------------------------------------------------------- document actions
  function Commit(Next, Message) {
    Hub.Apply(Next);
    Hub.Render();
    if (Message) Flash(Message);
  }

  function PlaceAt(P) {
    const D = Doc(), N = Size(), X = Math.round(Clamp(P.X, 0, N)), Y = Math.round(Clamp(P.Y, 0, N));
    if (Tool() === "gradient") {
      const R = A.AddLayer(D, "gradient");
      Commit(R.Doc, "Gradient wash added");
    } else if (Tool() === "text") {
      const R = A.AddLayer(D, "text");
      Commit(A.EditLayer(R.Doc, R.Id, (E) => { E.transform.x = X; E.transform.y = Y; }), "Text placed — edit it in the card");
      Hub.SelectLayer(R.Id, "text");
    } else {
      const R = A.AddLayer(D, "motif"), Label = SHAPES.find((S) => S[0] === St.Shape)[1];
      const Count = D.layers.filter((L) => L.shape?.motifType === St.Shape).length + 1;
      Commit(A.EditLayer(R.Doc, R.Id, (E) => { E.shape.motifType = St.Shape; E.transform.x = X; E.transform.y = Y; E.name = `${Label} ${Count}`; }), `${Label} placed at ${X}, ${Y}`);
    }
    SetTool("select");
  }

  async function ExportPng() {
    const D = Doc(), Res = D.resolution || 1024;
    try {
      const Url = URL.createObjectURL(new Blob([A.ExportSvg(D, Res)], { type: "image/svg+xml" }));
      const Img = new Image();
      await new Promise((Ok, No) => { Img.onload = Ok; Img.onerror = No; Img.src = Url; });
      const C = document.createElement("canvas");
      C.width = C.height = Res;
      C.getContext("2d").drawImage(Img, 0, 0, Res, Res);
      URL.revokeObjectURL(Url);
      const Blob_ = await new Promise((Ok) => C.toBlob(Ok, "image/png"));
      const A_ = Object.assign(document.createElement("a"), { href: URL.createObjectURL(Blob_), download: `${A.Slug(D.name)}.png` });
      A_.click();
      setTimeout(() => URL.revokeObjectURL(A_.href), 1000);
      Flash(`Exported ${A.Slug(D.name)}.png · ${Res}px`);
    } catch { Flash("PNG export needs a browser canvas"); }
  }

  // Hand-off for the Material / Paint workspaces (they pick it up from storage when they open).
  function Send(Target) {
    const D = Doc();
    try { globalThis.localStorage?.setItem("Frontier.Handoff", JSON.stringify({ From: Mode, To: Target, Name: D.name, Svg: A.ExportSvg(D, D.resolution || 1024), At: Date.now() })); } catch { /* storage full */ }
    Flash(`Sent “${D.name}” to ${Target === "material" ? "Material" : "Paint"}`);
  }

  function OnAct(Id, El) {
    const D = Doc();
    switch (Id) {
      case "undo": Hub.Step(true); return;
      case "redo": Hub.Step(false); return;
      case "menu": { const M = Host.querySelector("[data-menu]"), Open = !M.classList.contains("open"); M.classList.toggle("open", Open); El.setAttribute("aria-expanded", String(Open)); return; }
      case "save-project": Download(A.ExportProject(D), `${A.Slug(D.name)}.${Mode}.json`, "application/json"); Flash(`Saved ${A.Slug(D.name)}.${Mode}.json`); break;
      case "export-svg": Download(A.ExportSvg(D, D.resolution || 1024), `${A.Slug(D.name)}.svg`, "image/svg+xml"); Flash(`Exported ${A.Slug(D.name)}.svg`); break;
      case "export-png": ExportPng(); break;
      case "copy-svg": (navigator.clipboard?.writeText(A.ExportSvg(D, D.resolution || 1024)) || Promise.reject()).then(() => Flash("Copied SVG markup"), () => Flash("Clipboard unavailable")); break;
      case "send-material": Send("material"); return;
      case "send-paint": Send("paint"); return;
      case "zoom-in": ZoomAt(1.25); return;
      case "zoom-out": ZoomAt(0.8); return;
      case "fit": Fit(); Draw(); return;
      default: return;
    }
    CloseMenus();
  }

  function CloseMenus() {
    Host.querySelector("[data-menu]").classList.remove("open");
    Host.querySelector('[data-vp="menu"]').setAttribute("aria-expanded", "false");
    Host.querySelector("[data-fly]").classList.remove("open");
  }

  // ---------------------------------------------------------------------------------------------- events
  Host.addEventListener("click", (E) => {
    const Shape = E.target.closest("[data-shape]");
    if (Shape) { St.Shape = Shape.dataset.shape; SetTool("shape"); return; }
    const T = E.target.closest("[data-tool]");
    if (T) {
      if (T.dataset.tool === "shape" && St.Tool === "shape") { Host.querySelector("[data-fly]").classList.toggle("open"); return; }
      SetTool(T.dataset.tool);
      if (T.dataset.tool === "shape") Host.querySelector("[data-fly]").classList.add("open");
      return;
    }
    const B = E.target.closest("[data-vp]");
    if (B && B.tagName === "BUTTON") OnAct(B.dataset.vp, B);
  });
  document.addEventListener("click", (E) => { if (!E.target.closest?.(".vp-menu-wrap, .art-shapes")) CloseMenus(); });

  Host.addEventListener("change", async (E) => {
    const El = E.target, D = Doc();
    if (El.dataset.vp === "name") { const V = El.value.trim().slice(0, 80); if (V && V !== D.name) Commit(A.Edit(D, (X) => { X.name = V; }), "Renamed"); else El.value = D.name; }
    else if (El.dataset.vp === "res") Commit({ ...D, resolution: +El.value }, `Export resolution ${El.value} px`);
    else if (El.dataset.vp === "open") {
      const File = El.files?.[0];
      El.value = "";
      CloseMenus();
      if (!File) return;
      try { Commit(A.Load(await File.text(), Mode), `Opened ${File.name}`); } catch (Error) { Flash(`Could not open · ${Error.message}`); }
    }
  });
  Host.addEventListener("keydown", (E) => { if (E.target.dataset?.vp === "name" && E.key === "Enter") E.target.blur(); });

  Stage.addEventListener("pointerdown", (E) => {
    if (E.button !== 0 && E.button !== 1) return;
    if (E.target.closest(".art-rail")) return;
    CloseMenus();
    const P = ToDoc(E);
    if (E.button === 1 || Tool() === "pan") {
      St.Drag = { Kind: "pan", Sx: E.clientX, Sy: E.clientY, X0: St.X, Y0: St.Y };
      Stage.classList.add("panning");
    } else if (["shape", "text", "gradient"].includes(Tool())) {
      PlaceAt(P);
      return;
    } else {
      const Hit = E.target.closest?.("[data-layer-id]");
      if (!Hit) return;
      const Id = Hit.dataset.layerId, L = A.FindLayer(Doc(), Id);
      if (!L) return;
      if (Doc().selectedLayerId !== Id) Hub.SelectLayer(Id);
      if (L.locked || L.kind === "gradient") { if (L.locked) Flash(`${L.name} is locked`); return; }
      St.Drag = { Kind: "move", Id, P0: P, X0: L.transform.x, Y0: L.transform.y, Moved: false };
    }
    Stage.setPointerCapture?.(E.pointerId);
    E.preventDefault();
  });

  Stage.addEventListener("pointermove", (E) => {
    const Dr = St.Drag;
    if (!Dr) return;
    if (Dr.Kind === "pan") { St.X = Dr.X0 + E.clientX - Dr.Sx; St.Y = Dr.Y0 + E.clientY - Dr.Sy; St.Fitted = false; Place(); return; }
    const P = ToDoc(E), N = Size();
    let Dx = P.X - Dr.P0.X, Dy = P.Y - Dr.P0.Y;
    if (E.shiftKey) { if (Math.abs(Dx) > Math.abs(Dy)) Dy = 0; else Dx = 0; }
    if (!Dr.Moved && Math.hypot(Dx, Dy) * St.Zoom < 3) return;
    Dr.Moved = true;
    const X = Math.round(Clamp(Dr.X0 + Dx, -N, 2 * N)), Y = Math.round(Clamp(Dr.Y0 + Dy, -N, 2 * N));
    Hub.Apply(A.EditLayer(Doc(), Dr.Id, (L) => { L.transform.x = X; L.transform.y = Y; }), true);
    Schedule();
    const El = Host.querySelector('[data-vp="sel"]');
    if (El) El.innerHTML = `<i style="background:${Esc(A.LayerColour(A.FindLayer(Doc(), Dr.Id)))}"></i>${Esc(A.FindLayer(Doc(), Dr.Id).name)}<span>· x ${X} · y ${Y}</span>`;
  });

  const EndDrag = () => {
    const Dr = St.Drag;
    St.Drag = null;
    Stage.classList.remove("panning");
    if (Dr?.Kind === "move" && Dr.Moved) { Hub.Settle(); Hub.Render(); }
  };
  Stage.addEventListener("pointerup", EndDrag);
  Stage.addEventListener("pointercancel", EndDrag);

  Stage.addEventListener("wheel", (E) => {
    E.preventDefault();
    const R = Stage.getBoundingClientRect();
    if (E.ctrlKey || E.metaKey || Math.abs(E.deltaY) >= Math.abs(E.deltaX)) ZoomAt(Math.exp(-E.deltaY * 0.0015), E.clientX - R.left, E.clientY - R.top);
    else { St.X -= E.deltaX; St.Fitted = false; Place(); }
  }, { passive: false });

  document.addEventListener("keydown", (E) => {
    const T = E.target, Typing = T.matches?.("input, textarea, select, [contenteditable]");
    if (Typing || E.ctrlKey || E.metaKey || E.altKey) return;
    if (E.key === " " && !St.Space) { if (!E.repeat) { St.Space = "pan"; UpdateChrome(); } E.preventDefault(); return; }
    const K = E.key.toLowerCase();
    if (K === "escape") { CloseMenus(); if (St.Tool !== "select") SetTool("select"); return; }
    if (K === "v") SetTool("select");
    else if (K === "h") SetTool("pan");
    else if (K === "t") SetTool("text");
    else if (K === "g") SetTool("gradient");
    else if (K === "r") { if (St.Tool === "shape") St.Shape = SHAPES[(SHAPES.findIndex((S) => S[0] === St.Shape) + 1) % SHAPES.length][0]; SetTool("shape"); }
    else if (K === "f") { Fit(); Draw(); }
    else if (K === "+" || K === "=") ZoomAt(1.25);
    else if (K === "-" || K === "_") ZoomAt(0.8);
    else return;
    E.preventDefault();
  });
  document.addEventListener("keyup", (E) => { if (E.key === " " && St.Space) { St.Space = null; UpdateChrome(); } });

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (St.Fitted) Fit(); else Place(); }).observe(Stage);
  Hub.Subscribe((Live) => { if (St.Drag?.Kind === "move" && !Live) return; Schedule(); });

  Fit();
  Draw();

  return Object.assign(Vp, {
    State: St, Draw, Fit, SetTool, Flash,
    Zoom: (Z) => { St.Zoom = Clamp(Z, ZMIN, ZMAX); St.Fitted = false; Draw(); },
    Markup: () => Svg.innerHTML,
  });
}
