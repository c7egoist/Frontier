/*==========================================================================================================================================
                                                      ARTWORKSTACKWORKSPACE.JS
==========================================================================================================================================*/
/* Shared Layer-Stack + Non-Destructive Modifier-Stack Workspace powering both Pattern Studio (seamless tileable PBR artwork
   including Noise-Scaled Pattern generation) and Stamp Studio (transparent PBR decals, insignias, wear marks, rich text). */

import {
  ARTWORK_SIZE,
  ARTWORK_FINISHES,
  MOTIF_TYPES,
  MODIFIER_DEFINITIONS,
  createArtworkDocument,
  createArtworkLayer,
  createDefaultModifier,
  evaluateArtworkDocument,
} from "../Engine/Patterns/ArtworkStackEngine.js";
import {
  listPatternStarterCatalog,
  listStampStarterCatalog,
  loadStarterAsArtworkDocument,
} from "../Engine/Patterns/StarterCatalogBridge.js";
import {
  Construct,
  ConstructGlyph,
  SectionCard,
  SliderRow,
  SwitchRow,
  SelectRow,
  SegmentedRow,
  ColorRow,
  TextRow,
  MetricTrio,
  SmoothScroll,
  OpenScope,
  CloseScope,
  ReleaseScope,
  Broadcast,
  Toast,
} from "../StudioControls.js";

function drawImageDataToCanvas(canvas, rgba, w, h, checkerboard = true, tileRepeat = 1) {
  canvas.width = w * tileRepeat;
  canvas.height = h * tileRepeat;
  const ctx = canvas.getContext("2d");
  if (checkerboard) {
    const sz = 16;
    for (let y = 0; y < canvas.height; y += sz) {
      for (let x = 0; x < canvas.width; x += sz) {
        ctx.fillStyle = ((x / sz + y / sz) & 1) === 0 ? "#18191d" : "#22242a";
        ctx.fillRect(x, y, sz, sz);
      }
    }
  } else {
    ctx.fillStyle = "#111215";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);

  for (let ty = 0; ty < tileRepeat; ty++) {
    for (let tx = 0; tx < tileRepeat; tx++) {
      ctx.drawImage(off, tx * w, ty * h);
    }
  }
  if (tileRepeat > 1) {
    ctx.strokeStyle = "rgba(239, 244, 207, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (let i = 1; i < tileRepeat; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w, 0);
      ctx.lineTo(i * w, canvas.height);
      ctx.moveTo(0, i * h);
      ctx.lineTo(canvas.width, i * h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function mountArtworkStackWorkspace(root, appBridge, { mode = "pattern" } = {}) {
  const isPattern = mode === "pattern";
  const catalog = isPattern ? listPatternStarterCatalog() : listStampStarterCatalog();
  const initialDoc = catalog.length ? loadStarterAsArtworkDocument(catalog[0]) : createArtworkDocument(mode);
  if (!initialDoc.selectedLayerId && initialDoc.layers?.length) {
    initialDoc.selectedLayerId = initialDoc.layers[initialDoc.layers.length - 1].id;
  }

  let state = {
    mode,
    doc: initialDoc,
    activeStarterId: catalog[0]?.id || "",
    starterFilter: "All",
    starterSearch: "",
    viewChannel: isPattern ? "tile2x2" : "composite",
    lastStats: { instances: 1, coveragePct: 0, minScale: 1, maxScale: 1 },
    lastEval: null,
  };

  let inspectorScope = null;
  let disposed = false;

  const grid = Construct("div", "studio-grid wide-left");

  // ----------------------------------------------------------------- LEFT: LAYER STACK + STARTERS
  const leftCol = Construct("aside", "studio-column");
  leftCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, isPattern ? "Pattern Stack & Presets" : "Stamp Stack & Decals"),
      Construct("span", "panel-heading-meta", `${catalog.length} STARTERS`),
    ]),
  );

  const leftScroll = Construct("div", "panel-scroll");
  const leftInner = Construct("div", "panel-scroll-inner");
  leftScroll.append(leftInner);
  leftCol.append(
    leftScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, isPattern ? "Seamless Wrap Engine" : "Alpha Decal Cutout"),
      Construct("span", null, "Layer + Modifier Stack"),
    ]),
  );

  // ----------------------------------------------------------------- CENTER: CANVAS + PBR CHANNELS
  const centerCol = Construct("main", "studio-column viewport-column");
  const toolbar = Construct("div", "viewport-toolbar");

  const viewOpts = isPattern
    ? [
        ["Seamless 2×2", "tile2x2"],
        ["Single Tile", "composite"],
        ["Albedo", "albedo"],
        ["Roughness", "roughness"],
        ["Metalness", "metalness"],
        ["Height", "height"],
        ["Normal", "normal"],
      ]
    : [
        ["Decal Cutout", "composite"],
        ["Albedo", "albedo"],
        ["Roughness", "roughness"],
        ["Metalness", "metalness"],
        ["Height", "height"],
        ["Normal", "normal"],
      ];
  const viewSelect = Construct("select");
  viewSelect.style.cssText = "height:30px;padding:0 10px;background:#191a1d;border:1px solid var(--line);border-radius:999px;font-size:11.5px;";
  for (const [label, val] of viewOpts) {
    const o = Construct("option", null, label);
    o.value = val;
    viewSelect.append(o);
  }
  viewSelect.value = state.viewChannel;

  const btnAddNoiseScale = Construct("button", "pill-btn warm", [
    ConstructGlyph("Noise"),
    Construct("span", null, "+ Noise Scale"),
  ]);
  btnAddNoiseScale.type = "button";

  const btnSendToPaint = Construct("button", "pill-btn accent", [
    ConstructGlyph("Brush"),
    Construct("span", null, isPattern ? "Use Pattern in Paint" : "Use as Paint Stamp"),
  ]);
  btnSendToPaint.type = "button";

  const btnExportPng = Construct("button", "pill-btn", [
    ConstructGlyph("Download"),
    Construct("span", null, "Export PNG"),
  ]);
  btnExportPng.type = "button";

  toolbar.append(
    viewSelect,
    btnAddNoiseScale,
    Construct("div", "toolbar-spacer"),
    btnExportPng,
    btnSendToPaint,
  );

  const stage = Construct("div", "viewport-stage");
  stage.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;gap:12px;";

  const mainCanvas = document.createElement("canvas");
  mainCanvas.style.cssText = "max-width:100%;max-height:calc(100% - 92px);border-radius:16px;border:1px solid var(--line-strong);box-shadow:0 20px 60px rgba(0,0,0,0.65);background:#121316;";

  const miniStrip = Construct("div", "channel-thumbs");
  miniStrip.style.cssText = "width:min(460px, 100%);margin:0;";
  const miniCanvases = {};
  for (const [label, key] of [
    ["Albedo", "albedo"],
    ["Roughness", "roughness"],
    ["Metalness", "metalness"],
    ["Normal", "normal"],
  ]) {
    const c = document.createElement("canvas");
    miniCanvases[key] = c;
    const tile = Construct("div", "channel-tile", [c, Construct("span", null, label)]);
    tile.style.cursor = "pointer";
    tile.addEventListener("click", () => {
      state.viewChannel = key;
      viewSelect.value = key;
      updatePreviewDisplay();
    });
    miniStrip.append(tile);
  }

  const stageHint = Construct(
    "div",
    "viewport-hud-bottom",
    isPattern
      ? "Seamless UV Tile · Click channels below to solo · Add Noise Scale modifier on any layer"
      : "Alpha Decal Stamp · Send straight to Texture Paint as active Brush or 3D Decal",
  );

  stage.append(mainCanvas, miniStrip, stageHint);
  centerCol.append(toolbar, stage);

  // ----------------------------------------------------------------- RIGHT: LAYER, MASK & MODIFIER STACK
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Layer & Modifiers"),
      Construct("span", "panel-heading-meta", isPattern ? "PATTERN ENGINE" : "DECAL ENGINE"),
    ]),
  );
  const rightScroll = Construct("div", "panel-scroll");
  const rightInner = Construct("div", "panel-scroll-inner");
  rightScroll.append(rightInner);
  rightCol.append(
    rightScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "Non-destructive Modifier Stack"),
      Construct("span", null, "PBR Channels"),
    ]),
  );

  grid.append(leftCol, centerCol, rightCol);
  root.append(grid);
  SmoothScroll(leftScroll, leftInner);
  SmoothScroll(rightScroll, rightInner);

  // ----------------------------------------------------------------- HELPERS
  function getSelectedLayer() {
    return state.doc.layers.find((l) => l.id === state.doc.selectedLayerId) || state.doc.layers[state.doc.layers.length - 1] || state.doc.layers[0];
  }

  function updatePreviewDisplay() {
    if (!state.lastEval || disposed) return;
    const ev = state.lastEval;
    const w = ev.width;
    const h = ev.heightPx || w;

    const chanData =
      state.viewChannel === "albedo" || state.viewChannel === "composite" || state.viewChannel === "tile2x2"
        ? ev.albedo
        : state.viewChannel === "roughness"
          ? ev.roughness
          : state.viewChannel === "metalness"
            ? ev.metalness
            : state.viewChannel === "height"
              ? ev.height
              : ev.normal;

    const repeat = state.viewChannel === "tile2x2" ? 2 : 1;
    const checker = state.viewChannel === "composite" || state.viewChannel === "tile2x2" || state.viewChannel === "albedo";
    drawImageDataToCanvas(mainCanvas, chanData, w, h, checker, repeat);

    for (const key of ["albedo", "roughness", "metalness", "normal"]) {
      drawImageDataToCanvas(miniCanvases[key], ev[key], w, h, key === "albedo", 1);
    }
  }

  function evaluateAndRender(reRenderLeft = false) {
    if (disposed) return;
    const ev = evaluateArtworkDocument(state.doc, 384);
    state.lastEval = ev;
    state.lastStats = ev.stats;
    updatePreviewDisplay();
    if (reRenderLeft) renderLeftColumn();
    Broadcast();
  }

  // ----------------------------------------------------------------- LEFT COLUMN
  function renderLeftColumn() {
    leftInner.innerHTML = "";

    const addBtns = Construct("div", "chip-strip");
    for (const [label, kind] of [
      ["+ Motif", "motif"],
      ["+ Text", "text"],
      ["+ Grad", "gradient"],
      ["+ Folder", "folder"],
    ]) {
      const b = Construct("button", "chip-btn", label);
      b.type = "button";
      b.addEventListener("click", () => {
        const layer = createArtworkLayer(kind, {
          name: kind === "text" ? "Decal Typography" : kind === "gradient" ? "Gradient Wash" : kind === "folder" ? "Group Folder" : "Motif Shape",
          shape: { color: isPattern ? "#eff4cf" : "#e8c27a" },
        });
        state.doc.layers.push(layer);
        state.doc.selectedLayerId = layer.id;
        evaluateAndRender(true);
        rebuildInspector();
      });
      addBtns.append(b);
    }
    leftInner.append(addBtns);

    const stackBox = Construct("div");
    stackBox.style.marginBottom = "14px";
    const sel = getSelectedLayer();
    const layersTopDown = [...state.doc.layers].reverse();
    for (const layer of layersTopDown) {
      const isActive = sel && layer.id === sel.id;
      const row = Construct("div", "stack-row" + (isActive ? " active" : "") + (layer.parentId ? " nested" : ""));

      const thumb = Construct("div", "stack-row-thumb");
      if (layer.kind === "folder") thumb.append(ConstructGlyph("Folder"));
      else thumb.style.background = layer.shape?.color || "#e8c27a";

      const modCount = (layer.modifiers || []).filter((m) => m.enabled !== false).length;
      const hasNoiseScale = (layer.modifiers || []).some((m) => m.type === "noise-scale" && m.enabled !== false);
      const subParts = [layer.kind.toUpperCase(), layer.blend || "Normal"];
      if (modCount > 0) subParts.push(`${modCount} mod${modCount > 1 ? "s" : ""}`);
      if (hasNoiseScale) subParts.push("Noise Scale");

      const info = Construct("div", "stack-row-info", [
        Construct("span", "stack-row-title", layer.name),
        Construct("span", "stack-row-sub", subParts.join(" · ")),
      ]);

      const maskBtn = Construct("button", "mask-pill" + (layer.mask?.enabled ? " active" : ""), "MSK");
      maskBtn.type = "button";
      maskBtn.title = "Toggle Per-Layer Mask";
      maskBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!layer.mask) {
          layer.mask = { enabled: true, invert: false, mode: "noise", frequency: 4, threshold: 0.45, softness: 0.25, seed: 211 };
        } else {
          layer.mask.enabled = !layer.mask.enabled;
        }
        state.doc.selectedLayerId = layer.id;
        evaluateAndRender(true);
        rebuildInspector();
      });

      const visBtn = Construct("button", "stack-mini-btn" + (layer.visible ? " on" : ""), ConstructGlyph(layer.visible ? "Eye" : "EyeOff"));
      visBtn.type = "button";
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        evaluateAndRender(true);
      });

      const delBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Trash"));
      delBtn.type = "button";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.doc.layers.length <= 1) {
          Toast("Keep at least one layer in stack");
          return;
        }
        state.doc.layers = state.doc.layers.filter((l) => l.id !== layer.id);
        if (state.doc.selectedLayerId === layer.id) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
        evaluateAndRender(true);
        rebuildInspector();
      });

      row.append(thumb, info, maskBtn, visBtn, delBtn);
      row.addEventListener("click", () => {
        state.doc.selectedLayerId = layer.id;
        renderLeftColumn();
        rebuildInspector();
      });
      stackBox.append(row);
    }
    leftInner.append(stackBox);

    // Starter Catalog Browser
    const catHead = Construct("div", "property-label", isPattern ? "Starter Presets (108 Ready)" : "Decal Starter Presets");
    catHead.style.marginTop = "6px";
    leftInner.append(catHead);

    const searchInp = Construct("input");
    searchInp.type = "search";
    searchInp.value = state.starterSearch;
    searchInp.placeholder = isPattern ? "Search patterns (noise, hex, damask, hilbert…)" : "Search decals…";
    const sBar = Construct("div", "search-bar", [ConstructGlyph("Search"), searchInp]);
    searchInp.addEventListener("input", () => {
      state.starterSearch = searchInp.value;
      renderStarterCards(cardsBox);
    });
    leftInner.append(sBar);

    const groups = isPattern
      ? ["All", "Noise & Procedural", "Geometric", "Organic", "Heritage"]
      : ["All", "Stencils & Badges", "Emblems & Seals", "Surface Wear", "Technical Decals"];
    const catRow = Construct("div", "chip-strip");
    for (const g of groups) {
      const chip = Construct("button", "chip-btn" + (state.starterFilter === g ? " active" : ""), g === "Noise & Procedural" ? "Noise Scale ★" : g);
      chip.type = "button";
      chip.addEventListener("click", () => {
        state.starterFilter = g;
        renderLeftColumn();
      });
      catRow.append(chip);
    }
    leftInner.append(catRow);

    const cardsBox = Construct("div", "swatch-grid");
    renderStarterCards(cardsBox);
    leftInner.append(cardsBox);
  }

  function renderStarterCards(cardsBox) {
    cardsBox.innerHTML = "";
    const q = state.starterSearch.trim().toLowerCase();
    const list = catalog.filter((s) => {
      if (state.starterFilter !== "All") {
        if ((s.group || "").toLowerCase() !== state.starterFilter.toLowerCase()) {
          if (!(s.group || "").toLowerCase().includes(state.starterFilter.toLowerCase())) return false;
        }
      }
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.group || "").toLowerCase().includes(q);
    }).slice(0, 60);

    for (const item of list) {
      const card = Construct("button", "preset-card" + (state.activeStarterId === item.id ? " active" : ""));
      card.type = "button";
      card.append(
        Construct("small", null, item.group || "Archive"),
        Construct("strong", null, item.name),
      );
      card.addEventListener("click", () => {
        state.activeStarterId = item.id;
        state.doc = loadStarterAsArtworkDocument(item);
        if (state.doc.layers?.length) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
        evaluateAndRender(true);
        rebuildInspector();
        Toast(`Loaded ${item.name}`);
      });
      cardsBox.append(card);
    }
  }

  // ----------------------------------------------------------------- RIGHT INSPECTOR
  function rebuildInspector() {
    if (inspectorScope) ReleaseScope(inspectorScope);
    inspectorScope = OpenScope();
    rightInner.innerHTML = "";

    const layer = getSelectedLayer();
    if (!layer) return;

    rightInner.append(
      Construct("div", "object-heading", [
        Construct("div", "object-symbol", ConstructGlyph(isPattern ? "Pattern" : "Stamp")),
        Construct("div", "object-heading-copy", [
          Construct("strong", null, state.doc.name || (isPattern ? "Pattern Document" : "Stamp Decal")),
          Construct("span", null, `ACTIVE LAYER: ${layer.name}`),
        ]),
      ]),
    );

    MetricTrio(rightInner, [
      { Label: "Instances", Highlight: true, Read: () => ({ value: String(state.lastStats.instances || 1), sub: "Evaluated" }) },
      { Label: "Scale Span", Read: () => ({ value: `${Number(state.lastStats.minScale ?? 1).toFixed(2)}–${Number(state.lastStats.maxScale ?? 1).toFixed(2)}`, sub: "Noise Mod" }) },
      { Label: "Coverage", Read: () => ({ value: `${Math.round(state.lastStats.coveragePct ?? 0)}%`, sub: `${state.doc.layers.length} Layers` }) },
    ]);

    // 1. Active Layer Card
    const lSec = SectionCard(rightInner, { Title: "Layer Properties", Glyph: "Layers", Badge: layer.kind.toUpperCase() });
    TextRow(lSec.Inner, {
      Label: "Layer Name",
      Read: () => layer.name,
      Write: (v) => { layer.name = v; renderLeftColumn(); },
    });

    if (layer.kind === "motif") {
      SelectRow(lSec.Inner, {
        Label: "Motif Shape",
        Options: MOTIF_TYPES.map((m) => [m.label, m.id]),
        Read: () => layer.shape.motifType,
        Write: (v) => { layer.shape.motifType = v; evaluateAndRender(); },
      });
    } else if (layer.kind === "text") {
      TextRow(lSec.Inner, {
        Label: "Text Content",
        Read: () => layer.text?.value || "FRONTIER",
        Write: (v) => { if (!layer.text) layer.text = {}; layer.text.value = v; evaluateAndRender(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Font Size",
        Minimum: 14, Maximum: 160, Step: 2, Unit: "px",
        Read: () => layer.text?.fontSize ?? 54,
        Write: (v) => { if (!layer.text) layer.text = {}; layer.text.fontSize = v; evaluateAndRender(); },
      });
    } else if (layer.kind === "gradient") {
      SegmentedRow(lSec.Inner, {
        Label: "Fill Type",
        Options: [["Linear", "linear"], ["Radial", "radial"]],
        Read: () => layer.shape.fillMode || "linear",
        Write: (v) => { layer.shape.fillMode = v; evaluateAndRender(); },
      });
      ColorRow(lSec.Inner, {
        Label: "Secondary Color",
        Read: () => layer.shape.colorB || "#1a1e24",
        Write: (v) => { layer.shape.colorB = v; evaluateAndRender(); },
      });
    }

    if (layer.kind !== "folder") {
      ColorRow(lSec.Inner, {
        Label: "Primary Color",
        Read: () => layer.shape.color || "#e8c27a",
        Write: (v) => { layer.shape.color = v; evaluateAndRender(true); },
      });
      SelectRow(lSec.Inner, {
        Label: "Blend Mode",
        Options: ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => [b, b]),
        Read: () => layer.blend || "Normal",
        Write: (v) => { layer.blend = v; evaluateAndRender(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Opacity",
        Minimum: 0, Maximum: 1, Step: 0.01,
        Read: () => layer.opacity ?? 1,
        Write: (v) => { layer.opacity = v; evaluateAndRender(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Base Width",
        Minimum: 4, Maximum: 460, Step: 2, Unit: "px",
        Read: () => layer.transform.width ?? 48,
        Write: (v) => {
          const ratio = (layer.transform.height || v) / Math.max(1, layer.transform.width || v);
          layer.transform.width = v;
          layer.transform.height = Math.max(4, Math.round(v * ratio));
          evaluateAndRender();
        },
      });
      SliderRow(lSec.Inner, {
        Label: "Position X",
        Minimum: 0, Maximum: ARTWORK_SIZE, Step: 2, Unit: "px",
        Read: () => layer.transform.x ?? 256,
        Write: (v) => { layer.transform.x = v; evaluateAndRender(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Position Y",
        Minimum: 0, Maximum: ARTWORK_SIZE, Step: 2, Unit: "px",
        Read: () => layer.transform.y ?? 256,
        Write: (v) => { layer.transform.y = v; evaluateAndRender(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Rotation",
        Minimum: -180, Maximum: 180, Step: 1, Unit: "°",
        Read: () => layer.transform.rotation ?? 0,
        Write: (v) => { layer.transform.rotation = v; evaluateAndRender(); },
      });
    }

    // 2. PBR Surface Finish Card
    if (layer.kind !== "folder") {
      const fSec = SectionCard(rightInner, { Title: "PBR Surface & Relief", Glyph: "Material", Open: false });
      SelectRow(fSec.Inner, {
        Label: "Finish Preset",
        Options: Object.entries(ARTWORK_FINISHES).map(([k, f]) => [f.name, k]),
        Read: () => layer.surface.finish || "ink",
        Write: (v) => {
          const fin = ARTWORK_FINISHES[v];
          layer.surface.finish = v;
          if (fin) {
            layer.surface.roughness = fin.roughness;
            layer.surface.metalness = fin.metalness;
            layer.surface.height = fin.height;
          }
          evaluateAndRender();
        },
      });
      SliderRow(fSec.Inner, {
        Label: "Roughness",
        Minimum: 0.02, Maximum: 1, Step: 0.01,
        Read: () => layer.surface.roughness ?? 0.55,
        Write: (v) => { layer.surface.roughness = v; evaluateAndRender(); },
      });
      SliderRow(fSec.Inner, {
        Label: "Metalness",
        Minimum: 0, Maximum: 1, Step: 0.01,
        Read: () => layer.surface.metalness ?? 0,
        Write: (v) => { layer.surface.metalness = v; evaluateAndRender(); },
      });
      SliderRow(fSec.Inner, {
        Label: "Height Relief",
        Minimum: -1, Maximum: 1, Step: 0.02,
        Read: () => layer.surface.height ?? 0.2,
        Write: (v) => { layer.surface.height = v; evaluateAndRender(); },
      });
    }

    // 3. Per-Layer Mask Card
    const mSec = SectionCard(rightInner, {
      Title: "Layer Mask",
      Glyph: "Sparkles",
      Badge: layer.mask?.enabled ? "ACTIVE" : "OFF",
      Open: !!layer.mask?.enabled,
    });
    SwitchRow(mSec.Inner, {
      Label: "Enable Layer Mask",
      Read: () => !!layer.mask?.enabled,
      Write: (v) => {
        if (!layer.mask) layer.mask = { enabled: v, invert: false, mode: "noise", frequency: 4, threshold: 0.45, softness: 0.25, seed: 211 };
        else layer.mask.enabled = v;
        evaluateAndRender(true);
        rebuildInspector();
      },
    });
    if (layer.mask?.enabled) {
      SegmentedRow(mSec.Inner, {
        Label: "Mask Generator",
        Options: [["Noise", "noise"], ["Radial", "radial"], ["Stripe", "stripe"]],
        Read: () => layer.mask.mode || "noise",
        Write: (v) => { layer.mask.mode = v; evaluateAndRender(); },
      });
      SwitchRow(mSec.Inner, {
        Label: "Invert Mask",
        Read: () => !!layer.mask.invert,
        Write: (v) => { layer.mask.invert = v; evaluateAndRender(); },
      });
      SliderRow(mSec.Inner, {
        Label: "Softness",
        Minimum: 0.02, Maximum: 1, Step: 0.02,
        Read: () => layer.mask.softness ?? 0.25,
        Write: (v) => { layer.mask.softness = v; evaluateAndRender(); },
      });
      SliderRow(mSec.Inner, {
        Label: "Frequency",
        Minimum: 1, Maximum: 16, Step: 0.5,
        Read: () => layer.mask.frequency ?? 4,
        Write: (v) => { layer.mask.frequency = v; evaluateAndRender(); },
      });
      SliderRow(mSec.Inner, {
        Label: "Threshold",
        Minimum: 0, Maximum: 1, Step: 0.02,
        Read: () => layer.mask.threshold ?? 0.45,
        Write: (v) => { layer.mask.threshold = v; evaluateAndRender(); },
      });
    }

    // 4. Non-Destructive Modifier Stack Card
    const modSec = SectionCard(rightInner, {
      Title: "Non-Destructive Modifier Stack",
      Glyph: "Modifier",
      Badge: `${(layer.modifiers || []).length} MODIFIERS`,
    });

    const addModRow = Construct("div", "action-row");
    const modTypeSel = Construct("select");
    modTypeSel.style.cssText = "height:32px;padding:0 10px;background:#0b0b0c;border:1px solid var(--line);border-radius:999px;font-size:11px;flex:1;";
    for (const mMeta of MODIFIER_DEFINITIONS) {
      const opt = Construct("option", null, mMeta.type === "noise-scale" ? `★ ${mMeta.label}` : mMeta.label);
      opt.value = mMeta.type;
      modTypeSel.append(opt);
    }
    modTypeSel.value = "noise-scale";

    const addModBtn = Construct("button", "action-button accent", [
      ConstructGlyph("Plus"),
      Construct("span", null, "Add Modifier"),
    ]);
    addModBtn.type = "button";
    addModBtn.addEventListener("click", () => {
      if (!layer.modifiers) layer.modifiers = [];
      layer.modifiers.push(createDefaultModifier(modTypeSel.value));
      evaluateAndRender(true);
      rebuildInspector();
    });
    addModRow.append(modTypeSel, addModBtn);
    modSec.Inner.append(addModRow);

    const mods = layer.modifiers || [];
    if (!mods.length) {
      modSec.Inner.append(Construct("p", "property-hint", "No modifiers yet. Add Grid Array + Noise Scale to vary motif scale cleanly across noise!"));
    }

    mods.forEach((mod, modIdx) => {
      const card = Construct("div", "modifier-card");
      const meta = MODIFIER_DEFINITIONS.find((m) => m.type === mod.type) || { label: mod.type };
      const head = Construct("div", "modifier-card-head");

      const pill = Construct("span", "modifier-type-pill" + (mod.type === "noise-scale" ? " noise" : ""), meta.label);
      const toggleBtn = Construct("button", "stack-mini-btn" + (mod.enabled !== false ? " on" : ""), ConstructGlyph(mod.enabled !== false ? "Eye" : "EyeOff"));
      toggleBtn.type = "button";
      toggleBtn.addEventListener("click", () => {
        mod.enabled = mod.enabled === false;
        evaluateAndRender(true);
      });

      const removeBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Trash"));
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => {
        layer.modifiers.splice(modIdx, 1);
        evaluateAndRender(true);
        rebuildInspector();
      });

      head.append(pill, Construct("div", "toolbar-spacer"), toggleBtn, removeBtn);
      card.append(head);

      const body = Construct("div");
      body.style.marginTop = "8px";
      card.append(body);

      if (mod.type === "noise-scale") {
        SelectRow(body, {
          Label: "Noise Algorithm",
          Options: [["FBM Perlin", "fbm"], ["Worley Cellular", "worley"], ["Ridged", "ridged"], ["Billow", "billow"], ["Radial Falloff", "radial"]],
          Read: () => mod.noiseType || "fbm",
          Write: (v) => { mod.noiseType = v; evaluateAndRender(); },
        });
        SelectRow(body, {
          Label: "Drive Target",
          Options: [["Scale + Color Shift", "scale-color"], ["Scale + Opacity", "scale-opacity"], ["Uniform Scale", "uniform"], ["Width Only", "width"], ["Height Only", "height"]],
          Read: () => mod.target || "scale-color",
          Write: (v) => { mod.target = v; evaluateAndRender(); },
        });
        SliderRow(body, { Label: "Min Scale", Minimum: 0.05, Maximum: 2.5, Step: 0.05, Read: () => mod.minScale ?? 0.25, Write: (v) => { mod.minScale = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Max Scale", Minimum: 0.1, Maximum: 3.0, Step: 0.05, Read: () => mod.maxScale ?? 1.85, Write: (v) => { mod.maxScale = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Frequency", Minimum: 1, Maximum: 16, Step: 1, Read: () => mod.frequency ?? 3, Write: (v) => { mod.frequency = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Octaves", Minimum: 1, Maximum: 5, Step: 1, Read: () => mod.octaves ?? 3, Write: (v) => { mod.octaves = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Contrast", Minimum: 0.3, Maximum: 3.0, Step: 0.05, Read: () => mod.contrast ?? 1.15, Write: (v) => { mod.contrast = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Dropout Cull", Minimum: 0, Maximum: 0.85, Step: 0.02, Read: () => mod.dropoutThreshold ?? 0, Write: (v) => { mod.dropoutThreshold = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Seed", Minimum: 1, Maximum: 9999, Step: 1, Read: () => mod.seed ?? 1337, Write: (v) => { mod.seed = v; evaluateAndRender(); } });
        if (mod.target === "scale-color") {
          ColorRow(body, { Label: "Max Scale Color B", Read: () => mod.colorB || "#7aa6d9", Write: (v) => { mod.colorB = v; evaluateAndRender(); } });
        }
        SwitchRow(body, { Label: "Invert Noise", Read: () => !!mod.invert, Write: (v) => { mod.invert = v; evaluateAndRender(); } });
      } else if (mod.type === "array-grid") {
        SegmentedRow(body, {
          Label: "Lattice",
          Options: [["Grid", "grid"], ["Brick", "brick"], ["Half-Drop", "half-drop"], ["Hex", "hex"]],
          Read: () => mod.layout || "hex",
          Write: (v) => { mod.layout = v; evaluateAndRender(); },
        });
        SliderRow(body, { Label: "Columns", Minimum: 1, Maximum: 24, Step: 1, Read: () => mod.columns ?? 8, Write: (v) => { mod.columns = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Rows", Minimum: 1, Maximum: 24, Step: 1, Read: () => mod.rows ?? 8, Write: (v) => { mod.rows = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Span Width", Minimum: 64, Maximum: 640, Step: 8, Unit: "px", Read: () => mod.spanX ?? 512, Write: (v) => { mod.spanX = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Span Height", Minimum: 64, Maximum: 640, Step: 8, Unit: "px", Read: () => mod.spanY ?? 512, Write: (v) => { mod.spanY = v; evaluateAndRender(); } });
        SwitchRow(body, { Label: "Alternate Color", Read: () => !!mod.alternateColor, Write: (v) => { mod.alternateColor = v; evaluateAndRender(); } });
      } else if (mod.type === "array-radial") {
        SliderRow(body, { Label: "Count", Minimum: 2, Maximum: 40, Step: 1, Read: () => mod.count ?? 8, Write: (v) => { mod.count = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Base Radius", Minimum: 16, Maximum: 240, Step: 4, Unit: "px", Read: () => mod.radius ?? 130, Write: (v) => { mod.radius = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Rings", Minimum: 1, Maximum: 5, Step: 1, Read: () => mod.rings ?? 1, Write: (v) => { mod.rings = v; evaluateAndRender(); } });
        SwitchRow(body, { Label: "Align Tangent", Read: () => mod.alignTangent !== false, Write: (v) => { mod.alignTangent = v; evaluateAndRender(); } });
      } else if (mod.type === "mirror") {
        SegmentedRow(body, {
          Label: "Mirror Axis",
          Options: [["X", "x"], ["Y", "y"], ["Quad", "xy"], ["Diag", "diag"]],
          Read: () => mod.axis || "xy",
          Write: (v) => { mod.axis = v; evaluateAndRender(); },
        });
      } else if (mod.type === "inset-echo") {
        SliderRow(body, { Label: "Copies", Minimum: 2, Maximum: 14, Step: 1, Read: () => mod.copies ?? 4, Write: (v) => { mod.copies = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Inset Step", Minimum: 4, Maximum: 80, Step: 2, Unit: "px", Read: () => mod.stepPx ?? 26, Write: (v) => { mod.stepPx = v; evaluateAndRender(); } });
        SwitchRow(body, { Label: "Alternate Color B", Read: () => mod.alternateColor !== false, Write: (v) => { mod.alternateColor = v; evaluateAndRender(); } });
      } else if (mod.type === "noise-jitter") {
        SliderRow(body, { Label: "Position Jitter", Minimum: 0, Maximum: 80, Step: 1, Unit: "px", Read: () => mod.posJitter ?? 12, Write: (v) => { mod.posJitter = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Rotation Jitter", Minimum: 0, Maximum: 180, Step: 2, Unit: "°", Read: () => mod.rotJitter ?? 35, Write: (v) => { mod.rotJitter = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Dropout", Minimum: 0, Maximum: 0.85, Step: 0.02, Read: () => mod.dropout ?? 0, Write: (v) => { mod.dropout = v; evaluateAndRender(); } });
      } else if (mod.type === "warp") {
        SegmentedRow(body, {
          Label: "Warp Mode",
          Options: [["Wave", "wave"], ["Swirl", "swirl"], ["Curl", "curl"], ["Pinch", "pinch"]],
          Read: () => mod.warpType || "wave",
          Write: (v) => { mod.warpType = v; evaluateAndRender(); },
        });
        SliderRow(body, { Label: "Amplitude", Minimum: 0, Maximum: 90, Step: 2, Unit: "px", Read: () => mod.amplitude ?? 22, Write: (v) => { mod.amplitude = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Frequency", Minimum: 1, Maximum: 8, Step: 1, Read: () => mod.frequency ?? 2, Write: (v) => { mod.frequency = v; evaluateAndRender(); } });
      } else if (mod.type === "edge-wear") {
        SliderRow(body, { Label: "Chip Amount", Minimum: 0, Maximum: 0.9, Step: 0.02, Read: () => mod.chipAmount ?? 0.38, Write: (v) => { mod.chipAmount = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Chip Frequency", Minimum: 2, Maximum: 24, Step: 1, Read: () => mod.chipScale ?? 10, Write: (v) => { mod.chipScale = v; evaluateAndRender(); } });
        SliderRow(body, { Label: "Bevel Height", Minimum: -0.5, Maximum: 0.8, Step: 0.02, Read: () => mod.bevelHeight ?? 0.25, Write: (v) => { mod.bevelHeight = v; evaluateAndRender(); } });
      }

      modSec.Inner.append(card);
    });

    // Global Document Tile Settings
    if (isPattern) {
      const gSec = SectionCard(rightInner, { Title: "Document Tile & Background", Glyph: "Pattern", Open: false });
      SwitchRow(gSec.Inner, {
        Label: "Background Canvas Fill",
        Read: () => state.doc.background?.enabled !== false,
        Write: (v) => { state.doc.background.enabled = v; evaluateAndRender(); },
      });
      ColorRow(gSec.Inner, {
        Label: "Background Color",
        Read: () => state.doc.background?.color || "#171a1f",
        Write: (v) => { state.doc.background.color = v; evaluateAndRender(); },
      });
    }

    CloseScope(inspectorScope);
    Broadcast();
  }

  // ----------------------------------------------------------------- TOOLBAR EVENTS
  viewSelect.addEventListener("change", () => {
    state.viewChannel = viewSelect.value;
    updatePreviewDisplay();
  });

  btnAddNoiseScale.addEventListener("click", () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    if (!layer.modifiers) layer.modifiers = [];
    const hasGrid = layer.modifiers.some((m) => m.type === "array-grid" || m.type === "array-radial");
    if (!hasGrid && isPattern) {
      layer.modifiers.unshift(createDefaultModifier("array-grid"));
    }
    const existing = layer.modifiers.find((m) => m.type === "noise-scale");
    if (existing) {
      existing.enabled = true;
      Toast("Noise Scale modifier active on layer");
    } else {
      layer.modifiers.push(createDefaultModifier("noise-scale"));
      Toast("Added Noise Scale modifier to layer");
    }
    evaluateAndRender(true);
    rebuildInspector();
  });

  btnExportPng.addEventListener("click", () => {
    const ev = evaluateArtworkDocument(state.doc, 1024);
    const off = document.createElement("canvas");
    off.width = ev.width;
    off.height = ev.heightPx || ev.width;
    off.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(ev.albedo), ev.width, off.height), 0, 0);
    const slug = (state.doc.name || mode).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadDataUrl(off.toDataURL("image/png"), `${slug}-${mode}.png`);
    Toast(`Exported 1024×1024 ${mode.toUpperCase()} PNG`);
  });

  btnSendToPaint.addEventListener("click", () => {
    const ev = evaluateArtworkDocument(state.doc, 512);
    const payload = { ...ev, name: state.doc.name };
    if (isPattern) appBridge.sendPatternToPaint(payload);
    else appBridge.sendStampToPaint(payload);
  });

  evaluateAndRender(true);
  rebuildInspector();

  return {
    name: isPattern ? "Pattern" : "Stamp",
    getSnapshot: () => ({ mode, name: state.doc.name, layers: state.doc.layers.length, stats: state.lastStats }),
    dispose() {
      disposed = true;
      if (inspectorScope) ReleaseScope(inspectorScope);
      root.innerHTML = "";
    },
  };
}
