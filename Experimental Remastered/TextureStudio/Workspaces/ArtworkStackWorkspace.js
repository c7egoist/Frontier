/*==========================================================================================================================================
                                                      ARTWORKSTACKWORKSPACE.JS
==========================================================================================================================================*/
/* Unified Vector SVG + Layer-Stack + Non-Destructive Modifier-Stack Workspace powering both Pattern Studio
   (with 36+ African Patterns, Noise-Scaled Patterns & seamless 2x2 wrap) and Stamp Studio (transparent PBR decals & text).
   Features an interactive SVG vector editor (rulers, grid lines/axes, shape tools, direct move/resize/rotate handles)
   and drag-and-drop integration with the bottom Asset Browser. */

import {
  ARTWORK_SIZE,
  ARTWORK_FINISHES,
  MOTIF_TYPES,
  MODIFIER_DEFINITIONS,
  artworkDocumentLayersSvg,
  artworkDocumentToSvgString,
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
import { createLayerStackPanel } from "./LayerStackKit.js";
import { createViewportHeader, STUDIO_RESOLUTIONS } from "./ViewportHeaderKit.js";
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

const SVG_NS = "http://www.w3.org/2000/svg";

const VECTOR_TOOLS = [
  { id: "select", label: "Select", glyph: "Pointer", key: "V" },
  { id: "square", label: "Rect", glyph: "Square", key: "R" },
  { id: "circle", label: "Circle", glyph: "Circle", key: "O" },
  { id: "diamond", label: "Diamond", glyph: "Diamond", key: "D" },
  { id: "triangle", label: "Tri", glyph: "Triangle", key: "T" },
  { id: "star", label: "Star", glyph: "Star", key: "S" },
  { id: "hexagon", label: "Hex", glyph: "Hexagon", key: "G" },
  { id: "stripe", label: "Stripe", glyph: "Stripe", key: "L" },
  { id: "text", label: "Text", glyph: "Type", key: "X" },
  { id: "pan", label: "Pan", glyph: "Hand", key: "H" },
];

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
  off.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);

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

function downloadBlobUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function snapCoord(val, step) {
  return step > 0 ? Math.round(val / step) * step : val;
}

const RESOLUTIONS = STUDIO_RESOLUTIONS;

function buildSingleLayerThumbSvg(doc, layer) {
  if (!layer) return "";
  const docSize = doc.size || ARTWORK_SIZE;
  const thumbLayer = { ...layer, visible: true, parentId: null };
  const singleDoc = {
    ...doc,
    mode: "stamp", // preview individual layer clearly without full-tile ghost crowding unless array-grid/wrap
    layers: [thumbLayer],
    background: { enabled: false },
  };
  const { defs, body } = artworkDocumentLayersSvg(singleDoc, {
    idPrefix: `lt-${String(layer.id || "x").replace(/[^a-z0-9]/gi, "")}`,
  });

  // Auto-frame compact single shapes so tiny motifs fill the 36x36 thumbnail cleanly
  const hasSpreadMod = (layer.modifiers || []).some(
    (m) => m.enabled !== false && (m.type === "array-grid" || m.type === "array-radial"),
  );
  let vb = `0 0 ${docSize} ${docSize}`;
  if (layer.kind !== "gradient" && !hasSpreadMod && layer.transform) {
    const bw = Math.max(24, Number(layer.transform.width || 64));
    const bh = Math.max(24, Number(layer.transform.height || 64));
    const span = Math.max(bw, bh);
    if (span < docSize * 0.56) {
      const box = Math.min(docSize, Math.max(120, span * 1.48));
      const cx = Number(layer.transform.x ?? docSize * 0.5);
      const cy = Number(layer.transform.y ?? docSize * 0.5);
      const vx = Math.max(0, Math.min(docSize - box, cx - box * 0.5));
      const vy = Math.max(0, Math.min(docSize - box, cy - box * 0.5));
      vb = `${vx.toFixed(1)} ${vy.toFixed(1)} ${box.toFixed(1)} ${box.toFixed(1)}`;
    }
  }
  return `<svg xmlns="${SVG_NS}" viewBox="${vb}"><defs>${defs}</defs>${body}</svg>`;
}

function buildMaskMiniSvg(mask) {
  if (!mask) return "";
  const inv = !!mask.invert;
  const fg = inv ? "#14161a" : "#eff4cf";
  const bg = inv ? "#eff4cf" : "#14161a";
  if (mask.mode === "radial") {
    return `<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="${bg}"/><circle cx="12" cy="12" r="7.5" fill="${fg}" fill-opacity="0.9"/></svg>`;
  }
  if (mask.mode === "stripe") {
    return `<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="${bg}"/><rect x="3" y="0" width="5" height="24" fill="${fg}"/><rect x="13" y="0" width="5" height="24" fill="${fg}"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="${bg}"/><circle cx="8" cy="9" r="5" fill="${fg}" fill-opacity="0.85"/><circle cx="16" cy="15" r="4.5" fill="${fg}" fill-opacity="0.7"/><circle cx="16" cy="7" r="2.8" fill="${fg}" fill-opacity="0.65"/></svg>`;
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
    resolution: 1024,
    viewChannel: "vector", // "vector" | "tile2x2" | "composite" | "albedo" | "roughness" | "metalness" | "height" | "normal"
    vectorTool: "select",
    showGrid: true,
    showAxes: true,
    showTileRepeat: isPattern,
    snapStep: 16, // 0, 8, 16, 32, 64
    zoom: 1,
    panX: 0,
    panY: 0,
    lastStats: { instances: 1, coveragePct: 0, minScale: 1, maxScale: 1 },
    lastEval: null,
  };

  let inspectorScope = null;
  let disposed = false;
  let spacePanning = false;
  let pointerInteraction = null; // { kind: "move" | "resize" | "rotate" | "draw" | "pan", ... }
  const undoStack = [];
  const redoStack = [];

  const grid = Construct("div", "studio-grid");

  // ----------------------------------------------------------------- LEFT: FULL DESIGN LAYER STACK + LIVE THUMBNAILS
  const leftCol = Construct("aside", "studio-column tp-layer-dock");
  const layerStackUI = createLayerStackPanel(leftCol, {
    title: "Layers",
    extraMetricLabel: "MODS",
  });

  // ----------------------------------------------------------------- CENTER: UNIFIED 2-TIER ALLOYSTUDIO HEADER + STAGE
  const centerCol = Construct("main", "studio-column viewport-column");

  const viewOpts = [
    ["Vector SVG", "vector"],
    ...(isPattern ? [["Seamless 2×2", "tile2x2"]] : []),
    ["Single PBR Tile", "composite"],
    ["Albedo", "albedo"],
    ["Roughness", "roughness"],
    ["Metalness", "metalness"],
    ["Height", "height"],
    ["Normal", "normal"],
  ];

  const loadJsonInp = document.createElement("input");
  loadJsonInp.type = "file";
  loadJsonInp.accept = ".json,.pattern.json,.stamp.json";
  loadJsonInp.hidden = true;

  const btnSendToPaint = Construct("button", "pill-btn accent", [
    ConstructGlyph("Brush"),
    Construct("span", null, isPattern ? "Use in Paint" : "Use Stamp"),
  ]);
  btnSendToPaint.type = "button";
  btnSendToPaint.title = isPattern ? "Use Pattern in Texture Paint" : "Use Stamp in Texture Paint";

  const btnSendToMaterial = isPattern
    ? Construct("button", "pill-btn warm", [
        ConstructGlyph("Material"),
        Construct("span", null, "Tile on Material"),
      ])
    : null;
  if (btnSendToMaterial) {
    btnSendToMaterial.type = "button";
    btnSendToMaterial.title = "Apply this pattern onto the active Material as a tileable PBR texture";
  }

  const btnGrid = Construct("button", "se-tool-btn" + (state.showGrid ? " active" : ""), [
    ConstructGlyph("Grid"),
    Construct("span", null, "Grid"),
  ]);
  btnGrid.type = "button";
  btnGrid.title = "Toggle Snap Grid";

  const btnAxes = Construct("button", "se-tool-btn" + (state.showAxes ? " active" : ""), [
    ConstructGlyph("Focus"),
    Construct("span", null, "Axes"),
  ]);
  btnAxes.type = "button";
  btnAxes.title = "Toggle Center Symmetry Axes";

  const snapSelect = Construct("select", "se-header-select");
  snapSelect.setAttribute("aria-label", "Snap Grid Step");
  for (const [label, val] of [["Snap: Off", 0], ["Snap: 8px", 8], ["Snap: 16px", 16], ["Snap: 32px", 32], ["Snap: 64px", 64]]) {
    const o = Construct("option", null, label);
    o.value = String(val);
    snapSelect.append(o);
  }
  snapSelect.value = String(state.snapStep);

  const exportRgbaBufferPng = (rgba, w, h, filename) => {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    off.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    downloadBlobUrl(off.toDataURL("image/png"), filename);
  };

  const performSaveProject = () => {
    const payload = {
      schema: `frontier.${mode}.v1`,
      resolution: state.resolution,
      savedAt: new Date().toISOString(),
      document: state.doc,
    };
    const json = JSON.stringify(payload, null, 2);
    try {
      localStorage?.setItem(`frontier-last-${mode}-doc`, json);
    } catch {}
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const slug = (state.doc.name || mode).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadBlobUrl(url, `${slug}.${mode}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Toast(`Saved ${state.doc.name || mode} (${state.resolution}px) project`);
  };

  function syncUndoState() {
    headerUI?.setUndoRedoState(undoStack.length > 0, redoStack.length > 0);
  }

  function pushUndo(snap = null) {
    undoStack.push(snap || structuredClone(state.doc));
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
    syncUndoState();
  }

  function performUndo() {
    if (!undoStack.length) return;
    redoStack.push(structuredClone(state.doc));
    state.doc = undoStack.pop();
    syncUndoState();
    evaluateAndRender(true);
    rebuildInspector();
    Toast("Undone");
  }

  function performRedo() {
    if (!redoStack.length) return;
    undoStack.push(structuredClone(state.doc));
    state.doc = redoStack.pop();
    syncUndoState();
    evaluateAndRender(true);
    rebuildInspector();
    Toast("Redone");
  }

  const headerUI = createViewportHeader(centerCol, {
    workspace: mode,
    badgeText: isPattern ? "PATTERN" : "STAMP",
    iconGlyph: isPattern ? "Pattern" : "Stamp",
    canvasName: state.doc.name || (isPattern ? "Pattern" : "Stamp"),
    onRename(next) {
      if (state.doc.name === next) return;
      pushUndo();
      state.doc.name = next;
      evaluateAndRender(false, { skipPbr: true });
      rebuildInspector();
    },
    resolutions: RESOLUTIONS,
    resolution: state.resolution,
    onResolutionChange(val) {
      if (!RESOLUTIONS.includes(val)) return;
      state.resolution = val;
      headerUI.setSaveItemMeta("png", `${val}px`);
      headerUI.setSaveItemMeta("pbr", `${Math.min(2048, val)}px`);
      evaluateAndRender(true);
      Toast(`Resolution set to ${val} × ${val}px`);
    },
    viewOptions: viewOpts,
    viewValue: state.viewChannel,
    viewAriaLabel: "Canvas View",
    onViewChange(val) {
      state.viewChannel = val;
      syncViewDisplay();
    },
    onUndo: performUndo,
    onRedo: performRedo,
    saveItems: [
      { id: "project", label: "Save Project File", meta: `.${mode}.json`, onClick: performSaveProject },
      {
        id: "png",
        label: "Export PNG",
        meta: `${state.resolution}px`,
        onClick() {
          const sz = state.resolution;
          const ev = evaluateArtworkDocument(state.doc, sz);
          const slug = (state.doc.name || mode).toLowerCase().replace(/[^a-z0-9]+/g, "-");
          exportRgbaBufferPng(ev.albedo, ev.width, ev.heightPx || ev.width, `${slug}-${mode}-${sz}.png`);
          Toast(`Exported ${sz}×${sz} ${mode.toUpperCase()} PNG`);
        },
      },
      {
        id: "svg",
        label: "Export Vector SVG",
        meta: ".svg",
        onClick() {
          const sz = state.resolution;
          const svgStr = artworkDocumentToSvgString(state.doc, { width: sz, height: sz, showBg: true });
          const blob = new Blob([svgStr], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const slug = (state.doc.name || mode).toLowerCase().replace(/[^a-z0-9]+/g, "-");
          downloadBlobUrl(url, `${slug}-${mode}-${sz}.svg`);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          Toast(`Exported ${sz}×${sz} Vector SVG`);
        },
      },
      {
        id: "pbr",
        label: "Export PBR Maps (4×)",
        meta: `${Math.min(2048, state.resolution)}px`,
        onClick() {
          const sz = Math.min(2048, state.resolution);
          const ev = evaluateArtworkDocument(state.doc, sz);
          const slug = (state.doc.name || mode).toLowerCase().replace(/[^a-z0-9]+/g, "-");
          exportRgbaBufferPng(ev.albedo, ev.width, ev.heightPx || ev.width, `${slug}-albedo-${sz}.png`);
          exportRgbaBufferPng(ev.roughness, ev.width, ev.heightPx || ev.width, `${slug}-roughness-${sz}.png`);
          exportRgbaBufferPng(ev.metalness, ev.width, ev.heightPx || ev.width, `${slug}-metalness-${sz}.png`);
          exportRgbaBufferPng(ev.normal, ev.width, ev.heightPx || ev.width, `${slug}-normal-${sz}.png`);
          Toast(`Exported 4 PBR maps @ ${sz}×${sz}px`);
        },
      },
      { id: "open", label: "Open Project File…", meta: ".json", onClick: () => loadJsonInp.click() },
      { node: loadJsonInp },
    ],
    primaryActions: [btnSendToMaterial, btnSendToPaint].filter(Boolean),
    tools: VECTOR_TOOLS.map((t) => ({
      id: t.id,
      label: t.label,
      glyph: t.glyph,
      kbd: t.key,
      datasetKey: "vectorTool",
      active: state.vectorTool === t.id,
    })),
    onToolSelect: (id) => selectVectorTool(id),
    toolTrailing: [btnGrid, btnAxes, snapSelect],
  });
  syncUndoState();

  // Interactive SVG Stage Shell
  const stage = Construct("div", "se-stage-shell");
  const seViewport = Construct("div", "se-viewport");

  const rulerCorner = Construct("div", "se-ruler-corner", "PX");
  const rulerXWrap = Construct("div", "se-ruler-x");
  const rulerXCanvas = document.createElement("canvas");
  rulerXWrap.append(rulerXCanvas);

  const rulerYWrap = Construct("div", "se-ruler-y");
  const rulerYCanvas = document.createElement("canvas");
  rulerYWrap.append(rulerYCanvas);

  // Floating zoom HUD (.se-view-controls matching reference ShapeEditorCanvas.jsx)
  const viewControls = Construct("div", "se-view-controls");
  const viewTitle = Construct("strong", null, `${isPattern ? "VECTOR CANVAS" : "STAMP VECTOR"} ${state.resolution}×${state.resolution}`);
  const btnZoomOut = Construct("button", null, "−");
  btnZoomOut.type = "button";
  const zoomReadout = Construct("span", "tabular", "100%");
  const btnZoomIn = Construct("button", null, "+");
  btnZoomIn.type = "button";
  const btnZoomFit = Construct("button", "se-fit-btn", "Fit");
  btnZoomFit.type = "button";
  viewControls.append(viewTitle, btnZoomOut, zoomReadout, btnZoomIn, btnZoomFit);

  // Primary Interactive SVG Canvas
  const svgEl = document.createElementNS(SVG_NS, "svg");
  svgEl.setAttribute("class", "se-canvas");
  svgEl.setAttribute("tabindex", "0");
  svgEl.setAttribute("aria-label", isPattern ? "Interactive Pattern SVG Vector Canvas" : "Interactive Stamp SVG Vector Canvas");

  // PBR raster overlay (hidden while editing in vector mode!)
  const pbrWrap = Construct("div", "se-pbr-raster");
  pbrWrap.hidden = true;
  const mainCanvas = document.createElement("canvas");
  pbrWrap.append(mainCanvas);

  seViewport.append(rulerCorner, rulerXWrap, rulerYWrap, svgEl, viewControls, pbrWrap);

  // Bottom quick channel strip + modifier tools
  const bottomBar = Construct("div", "se-bottom-bar");
  const miniStrip = Construct("div", "channel-thumbs");
  const miniCanvases = {};
  for (const [label, key] of [
    ["Albedo", "albedo"],
    ["Rough", "roughness"],
    ["Metal", "metalness"],
    ["Normal", "normal"],
  ]) {
    const c = document.createElement("canvas");
    miniCanvases[key] = c;
    const tile = Construct("div", "channel-tile", [c, Construct("span", null, label)]);
    tile.style.cursor = "pointer";
    tile.addEventListener("click", () => {
      state.viewChannel = state.viewChannel === key ? "vector" : key;
      headerUI.setView(state.viewChannel);
      syncViewDisplay();
    });
    miniStrip.append(tile);
  }

  const btnAddNoiseScale = Construct("button", "pill-btn warm", [
    ConstructGlyph("Noise"),
    Construct("span", null, "+ Noise Scale"),
  ]);
  btnAddNoiseScale.type = "button";

  const btnBackVector = Construct("button", "pill-btn", [ConstructGlyph("Pointer"), Construct("span", null, "Vector SVG")]);
  btnBackVector.type = "button";
  btnBackVector.addEventListener("click", () => {
    state.viewChannel = "vector";
    headerUI.setView("vector");
    syncViewDisplay();
  });
  const bottomTools = Construct("div", "se-bottom-tools", [btnAddNoiseScale, btnBackVector]);
  bottomBar.append(miniStrip, bottomTools);

  stage.append(seViewport, bottomBar);
  centerCol.append(stage);

  // ----------------------------------------------------------------- RIGHT: LAYER, MASK & MODIFIER STACK
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Layer & Modifiers"),
      Construct("span", "panel-heading-meta", isPattern ? "VECTOR + PBR" : "DECAL + PBR"),
    ]),
  );
  const rightScroll = Construct("div", "panel-scroll");
  const rightInner = Construct("div", "panel-scroll-inner");
  rightScroll.append(rightInner);
  rightCol.append(
    rightScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "Non-destructive Modifier Stack"),
      Construct("span", null, "Live SVG + PBR"),
    ]),
  );

  grid.append(leftCol, centerCol, rightCol);
  root.append(grid);
  SmoothScroll(rightScroll, rightInner);

  // ----------------------------------------------------------------- HELPERS
  function getSelectedLayer() {
    return state.doc.layers.find((l) => l.id === state.doc.selectedLayerId) || state.doc.layers[state.doc.layers.length - 1] || state.doc.layers[0];
  }

  function selectVectorTool(id) {
    state.vectorTool = id;
    headerUI.setActiveTool(id);
    svgEl.style.cursor = id === "pan" ? "grab" : id === "select" ? "default" : "crosshair";
  }

  function getSvgViewMetrics() {
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(120, rect.width || seViewport.clientWidth - 24 || 640);
    const h = Math.max(120, rect.height || seViewport.clientHeight - 22 || 480);
    const docSize = state.doc.size || ARTWORK_SIZE;
    const baseSpan = docSize * 1.18;
    const spanY = baseSpan / state.zoom;
    const spanX = spanY * (w / h);
    const cx = docSize * 0.5 + state.panX;
    const cy = docSize * 0.5 + state.panY;
    return {
      rect,
      w,
      h,
      docSize,
      vx: cx - spanX * 0.5,
      vy: cy - spanY * 0.5,
      vw: spanX,
      vh: spanY,
    };
  }

  function clientToSvg(clientX, clientY) {
    const m = getSvgViewMetrics();
    const rx = (clientX - m.rect.left) / Math.max(1, m.rect.width);
    const ry = (clientY - m.rect.top) / Math.max(1, m.rect.height);
    return {
      x: m.vx + rx * m.vw,
      y: m.vy + ry * m.vh,
      unitsPerPx: m.vw / Math.max(1, m.rect.width),
    };
  }

  function drawRulers(m) {
    // Top X ruler
    const rw = Math.max(1, Math.round(rulerXWrap.clientWidth || m.w));
    const rh = Math.max(1, Math.round(rulerXWrap.clientHeight || 22));
    if (rulerXCanvas.width !== rw || rulerXCanvas.height !== rh) {
      rulerXCanvas.width = rw;
      rulerXCanvas.height = rh;
    }
    const rcx = rulerXCanvas.getContext("2d");
    rcx.fillStyle = "#151918";
    rcx.fillRect(0, 0, rw, rh);
    rcx.strokeStyle = "#485950";
    rcx.fillStyle = "#8aa095";
    rcx.font = "9px monospace";

    const step = m.vw > 900 ? 128 : m.vw > 450 ? 64 : 32;
    const firstX = Math.floor(m.vx / step) * step;
    for (let v = firstX; v <= m.vx + m.vw; v += step) {
      const px = ((v - m.vx) / m.vw) * rw;
      const major = v % 128 === 0;
      rcx.beginPath();
      rcx.moveTo(px, major ? 4 : 13);
      rcx.lineTo(px, rh);
      rcx.stroke();
      if (major || step <= 64) {
        rcx.fillText(String(Math.round(v)), px + 3, 11);
      }
    }

    // Left Y ruler
    const yw = Math.max(1, Math.round(rulerYWrap.clientWidth || 24));
    const yh = Math.max(1, Math.round(rulerYWrap.clientHeight || m.h));
    if (rulerYCanvas.width !== yw || rulerYCanvas.height !== yh) {
      rulerYCanvas.width = yw;
      rulerYCanvas.height = yh;
    }
    const rcy = rulerYCanvas.getContext("2d");
    rcy.fillStyle = "#151918";
    rcy.fillRect(0, 0, yw, yh);
    rcy.strokeStyle = "#485950";
    rcy.fillStyle = "#8aa095";
    rcy.font = "9px monospace";
    const firstY = Math.floor(m.vy / step) * step;
    for (let v = firstY; v <= m.vy + m.vh; v += step) {
      const py = ((v - m.vy) / m.vh) * yh;
      const major = v % 128 === 0;
      rcy.beginPath();
      rcy.moveTo(major ? 4 : 14, py);
      rcy.lineTo(yw, py);
      rcy.stroke();
      if (major) {
        rcy.save();
        rcy.translate(10, py + 12);
        rcy.rotate(-Math.PI / 2);
        rcy.fillText(String(Math.round(v)), 0, 0);
        rcy.restore();
      }
    }
  }

  function renderVectorSvgCanvas() {
    if (disposed) return;
    const m = getSvgViewMetrics();
    const docSize = m.docSize;
    svgEl.setAttribute("viewBox", `${m.vx.toFixed(2)} ${m.vy.toFixed(2)} ${m.vw.toFixed(2)} ${m.vh.toFixed(2)}`);
    zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;

    const { defs: artDefs, body: artBody } = artworkDocumentLayersSvg(state.doc, { idPrefix: "se-live" });
    const bg = state.doc.background || {};
    const units = m.vw / Math.max(1, m.w);
    const gridStep = Math.max(8, state.snapStep || 32);

    const tileBg = bg.enabled
      ? `<rect x="0" y="0" width="${docSize}" height="${docSize}" fill="${bg.color || "#171a1f"}" opacity="${bg.opacity ?? 1}"/>`
      : "";

    // Adjacent subtle 2x2 ghost repeat preview in Pattern mode
    let ghostTiles = "";
    if (isPattern && state.showTileRepeat) {
      const offsets = [[-docSize, 0], [docSize, 0], [0, -docSize], [0, docSize]];
      ghostTiles = `<g opacity="0.28" pointer-events="none">${offsets
        .map(([ox, oy]) => `<g transform="translate(${ox} ${oy})">${tileBg}${artBody}</g>`)
        .join("")}</g>`;
    }

    // Grid lines + center axes
    let gridMarkup = "";
    if (state.showGrid) {
      gridMarkup += `<rect x="0" y="0" width="${docSize}" height="${docSize}" fill="url(#se-grid)" pointer-events="none"/>`;
      gridMarkup += `<path d="M128 0V${docSize} M256 0V${docSize} M384 0V${docSize} M0 128H${docSize} M0 256H${docSize} M0 384H${docSize}" stroke="rgba(128,166,144,0.22)" stroke-width="${units * 1}" fill="none" pointer-events="none"/>`;
    }
    if (state.showAxes) {
      gridMarkup += `<line x1="${docSize * 0.5}" y1="0" x2="${docSize * 0.5}" y2="${docSize}" stroke="rgba(232,194,122,0.34)" stroke-width="${units * 1.1}" stroke-dasharray="${units * 5} ${units * 4}" pointer-events="none"/>`;
      gridMarkup += `<line x1="0" y1="${docSize * 0.5}" x2="${docSize}" y2="${docSize * 0.5}" stroke="rgba(232,194,122,0.34)" stroke-width="${units * 1.1}" stroke-dasharray="${units * 5} ${units * 4}" pointer-events="none"/>`;
    }

    // Active selection transform box + 8 resize handles + rotation circle
    let selectionMarkup = "";
    const sel = getSelectedLayer();
    if (sel && sel.kind !== "folder" && sel.visible && state.viewChannel === "vector") {
      const { x, y, width, height, rotation } = sel.transform;
      const bw = Math.max(8, width || 32);
      const bh = Math.max(8, height || 32);
      const hw = bw * 0.5, hh = bh * 0.5;
      const hs = Math.max(4, units * 8);
      const hHalf = hs * 0.5;
      const rotY = -hh - units * 28;
      const handlePositions = [
        ["nw", -hw, -hh, "nwse-resize"],
        ["n", 0, -hh, "ns-resize"],
        ["ne", hw, -hh, "nesw-resize"],
        ["e", hw, 0, "ew-resize"],
        ["se", hw, hh, "nwse-resize"],
        ["s", 0, hh, "ns-resize"],
        ["sw", -hw, hh, "nesw-resize"],
        ["w", -hw, 0, "ew-resize"],
      ];
      selectionMarkup = `
        <g class="se-selection-gizmo" transform="translate(${x} ${y}) rotate(${rotation || 0})">
          <rect x="${-hw}" y="${-hh}" width="${bw}" height="${bh}" fill="transparent" stroke="#c1dcab" stroke-width="${units * 1.6}" data-layer-id="${String(sel.id).replace(/"/g, "&quot;")}" style="cursor:move;"/>
          <line x1="0" y1="${-hh}" x2="0" y2="${rotY}" stroke="#c1dcab" stroke-width="${units * 1.3}" pointer-events="none"/>
          <circle cx="0" cy="${rotY}" r="${units * 6}" fill="#17190e" stroke="#c1dcab" stroke-width="${units * 1.8}" data-handle="rotate" style="cursor:grab;"/>
          ${handlePositions
            .map(
              ([id, hx, hy, cur]) =>
                `<rect x="${hx - hHalf}" y="${hy - hHalf}" width="${hs}" height="${hs}" rx="${units * 1.2}" fill="#eff4cf" stroke="#17190e" stroke-width="${units * 1.4}" data-handle="${id}" style="cursor:${cur};"/>`,
            )
            .join("")}
        </g>`;
    }

    // Live draw preview rect if drawing a shape
    let drawDraftMarkup = "";
    if (pointerInteraction?.kind === "draw" && pointerInteraction.draftRect) {
      const dr = pointerInteraction.draftRect;
      drawDraftMarkup = `<rect x="${dr.x}" y="${dr.y}" width="${dr.w}" height="${dr.h}" fill="rgba(239,244,207,0.12)" stroke="#eff4cf" stroke-width="${units * 1.6}" stroke-dasharray="${units * 5} ${units * 4}" pointer-events="none"/>`;
    }

    svgEl.innerHTML = `
      <defs>
        <pattern id="se-checker" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#171b19"/>
          <rect width="12" height="12" fill="#1e2321"/>
          <rect x="12" y="12" width="12" height="12" fill="#1e2321"/>
        </pattern>
        <pattern id="se-grid" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse">
          <path d="M ${gridStep} 0 L 0 0 0 ${gridStep}" fill="none" stroke="rgba(103,135,118,0.28)" stroke-width="${units * 0.9}"/>
        </pattern>
        <clipPath id="se-tile-clip">
          <rect x="0" y="0" width="${docSize}" height="${docSize}"/>
        </clipPath>
        ${artDefs}
      </defs>
      ${ghostTiles}
      <rect x="0" y="0" width="${docSize}" height="${docSize}" fill="url(#se-checker)" data-canvas-bg="1"/>
      ${tileBg}
      <g clip-path="url(#se-tile-clip)">
        ${artBody}
      </g>
      ${gridMarkup}
      <rect x="0" y="0" width="${docSize}" height="${docSize}" fill="none" stroke="#c1dcab" stroke-opacity="0.52" stroke-width="${units * 1.4}" pointer-events="none"/>
      ${selectionMarkup}
      ${drawDraftMarkup}
    `;
    drawRulers(m);
  }

  function updatePbrPreviews() {
    if (!state.lastEval || disposed) return;
    const ev = state.lastEval;
    const w = ev.width;
    const h = ev.heightPx || w;

    for (const key of ["albedo", "roughness", "metalness", "normal"]) {
      drawImageDataToCanvas(miniCanvases[key], ev[key], w, h, key === "albedo", 1);
    }

    if (state.viewChannel !== "vector") {
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
    }
  }

  function syncViewDisplay() {
    const isVector = state.viewChannel === "vector";
    pbrWrap.hidden = isVector;
    svgEl.hidden = !isVector;
    viewControls.hidden = !isVector;
    rulerCorner.hidden = !isVector;
    rulerXWrap.hidden = !isVector;
    rulerYWrap.hidden = !isVector;
    if (isVector) renderVectorSvgCanvas();
    else updatePbrPreviews();
  }

  function evaluateAndRender(reRenderLeft = false, { skipPbr = false } = {}) {
    if (disposed) return;
    if (state.viewChannel === "vector") renderVectorSvgCanvas();
    if (!skipPbr) {
      const ev = evaluateArtworkDocument(state.doc, 384);
      state.lastEval = ev;
      state.lastStats = ev.stats;
      updatePbrPreviews();
    }
    headerUI.setName(state.doc.name || (isPattern ? "Pattern" : "Stamp"));
    headerUI.setResolution(state.resolution);
    viewTitle.textContent = `${isPattern ? "VECTOR CANVAS" : "STAMP VECTOR"} ${state.resolution}×${state.resolution}`;
    if (reRenderLeft) renderLeftColumn();
    Broadcast();
  }

  // ----------------------------------------------------------------- LEFT LAYER STACK (FULL DESIGN + LIVE PREVIEWS)
  const ARTWORK_ADD_OPTIONS = [
    { kind: "motif", label: "+ Motif", glyph: "Star", hint: "Vector shape / procedural motif" },
    { kind: "text", label: "+ Text", glyph: "Type", hint: "Typography & engraved label" },
    { kind: "gradient", label: "+ Grad", glyph: "Sliders", hint: "Linear / radial surface gradient" },
    { kind: "folder", label: "+ Folder", glyph: "Folder", hint: "Group & nest child layers" },
  ];

  function moveLayerByOffset(layerId, deltaUp) {
    const idx = state.doc.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    const nextIdx = idx + (deltaUp > 0 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= state.doc.layers.length) return false;
    pushUndo();
    const [item] = state.doc.layers.splice(idx, 1);
    state.doc.layers.splice(nextIdx, 0, item);
    evaluateAndRender(true);
    rebuildInspector();
    return true;
  }

  function moveLayerRelativeTo(sourceId, targetId, dropAboveInVisual) {
    if (!sourceId || sourceId === targetId) return false;
    const srcIdx = state.doc.layers.findIndex((l) => l.id === sourceId);
    const tgtIdx = state.doc.layers.findIndex((l) => l.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return false;
    pushUndo();
    const [item] = state.doc.layers.splice(srcIdx, 1);
    const newTgtIdx = state.doc.layers.findIndex((l) => l.id === targetId);
    const insertAt = dropAboveInVisual ? newTgtIdx + 1 : newTgtIdx;
    state.doc.layers.splice(insertAt, 0, item);
    evaluateAndRender(true);
    rebuildInspector();
    return true;
  }

  function addArtworkLayer(kind) {
    pushUndo();
    const layer = createArtworkLayer(kind, {
      name: kind === "text" ? "Decal Typography" : kind === "gradient" ? "Gradient Wash" : kind === "folder" ? "Group Folder" : "Motif Shape",
      shape: { color: isPattern ? "#eff4cf" : "#e8c27a" },
    });
    state.doc.layers.push(layer);
    state.doc.selectedLayerId = layer.id;
    evaluateAndRender(true);
    rebuildInspector();
  }

  function renderLeftColumn() {
    const sel = getSelectedLayer();
    const totalMods = state.doc.layers.reduce((acc, l) => acc + ((l.modifiers || []).filter((m) => m.enabled !== false).length), 0);
    const bg = state.doc.background || {};

    layerStackUI.render({
      layers: state.doc.layers,
      limit: 32,
      selectedId: sel?.id || null,
      addOptions: ARTWORK_ADD_OPTIONS,
      extraMetricValue: totalMods,
      systemBase: {
        title: `Canvas Tile · ${state.resolution}×${state.resolution}`,
        meta: bg.enabled ? `Background ${bg.color || "#171a1f"}` : "Transparent alpha cutout",
        badge: isPattern ? "Seamless" : "Cutout",
      },
      renderThumb(layer, thumbEl, { isFolder }) {
        if (isFolder) {
          thumbEl.classList.add("tp-kind-folder");
          thumbEl.append(ConstructGlyph("Folder"));
          return;
        }
        thumbEl.innerHTML = buildSingleLayerThumbSvg(state.doc, layer);
      },
      getSubtitle(layer) {
        const modCount = (layer.modifiers || []).filter((m) => m.enabled !== false).length;
        const kindTag = layer.kind === "motif" ? (layer.shape?.motifType || "motif") : layer.kind;
        const blendTag = layer.blend && layer.blend !== "Normal" ? ` · ${layer.blend}` : "";
        const modTag = modCount > 0 ? ` · ${modCount} mod${modCount > 1 ? "s" : ""}` : "";
        return `${kindTag}${blendTag}${modTag}`;
      },
      getMaskSubrow(layer) {
        if (!layer.mask) return null;
        const thumbWrap = Construct("div", "");
        thumbWrap.innerHTML = buildMaskMiniSvg(layer.mask);
        return {
          enabled: !!layer.mask.enabled,
          active: false,
          label: "Layer mask",
          meta: `${layer.mask.mode || "noise"} · T:${Number(layer.mask.threshold ?? 0.45).toFixed(2)}`,
          thumbEl: thumbWrap.firstElementChild || null,
          onSelect: () => {
            state.doc.selectedLayerId = layer.id;
            renderLeftColumn();
            rebuildInspector();
          },
          onToggle: () => {
            layer.mask.enabled = !layer.mask.enabled;
            evaluateAndRender(true);
            rebuildInspector();
          },
        };
      },
      renderExpanded(layer, expEl) {
        const pills = Construct("div", "tp-exp-pills");
        const chDefs = [
          ["COL", layer.surface?.enableAlbedo !== false, "#eff4cf"],
          ["RGH", layer.surface?.enableRoughness !== false, "#9ecfff"],
          ["MET", layer.surface?.enableMetalness !== false, "#e8c27a"],
          ["HGT", layer.surface?.enableHeight !== false, "#9ad48b"],
        ];
        for (const [short, on, col] of chDefs) {
          if (!on) continue;
          const dot = document.createElement("i");
          dot.style.setProperty("--pill-color", col);
          pills.append(Construct("span", "tp-exp-pill", [dot, Construct("span", null, short)]));
        }
        for (const mod of (layer.modifiers || []).filter((m) => m.enabled !== false)) {
          const dot = document.createElement("i");
          dot.style.setProperty("--pill-color", "#d49fff");
          pills.append(Construct("span", "tp-exp-pill", [dot, Construct("span", null, mod.type)]));
        }
        expEl.append(
          pills,
          Construct("div", "tp-exp-meta", `Pos (${Math.round(layer.transform?.x ?? 256)}, ${Math.round(layer.transform?.y ?? 256)}) · ${Math.round(layer.transform?.width ?? 64)}×${Math.round(layer.transform?.height ?? 64)}`),
        );
      },
      onSelectLayer: (id) => {
        state.doc.selectedLayerId = id;
        renderLeftColumn();
        if (state.viewChannel === "vector") renderVectorSvgCanvas();
        rebuildInspector();
      },
      onAddLayer: addArtworkLayer,
      onMoveLayer: moveLayerByOffset,
      onDropReorder: moveLayerRelativeTo,
      onToggleVisible: (id) => {
        const l = state.doc.layers.find((x) => x.id === id);
        if (!l) return;
        l.visible = l.visible === false;
        evaluateAndRender(true);
      },
      onToggleLock: (id) => {
        const l = state.doc.layers.find((x) => x.id === id);
        if (!l) return;
        l.locked = !l.locked;
        renderLeftColumn();
        rebuildInspector();
      },
      onRenameLayer: (id, nextName) => {
        const l = state.doc.layers.find((x) => x.id === id);
        if (l) { l.name = nextName; rebuildInspector(); }
      },
      onOpacityChange: (id, val, final) => {
        const l = state.doc.layers.find((x) => x.id === id);
        if (!l) return;
        l.opacity = val;
        evaluateAndRender(final, { skipPbr: !final });
      },
      onDuplicateLayer: (id) => {
        const src = state.doc.layers.find((x) => x.id === id);
        if (!src) return;
        pushUndo();
        const copy = structuredClone(src);
        copy.id = `lyr_${Math.random().toString(36).slice(2, 9)}`;
        copy.name = `${src.name} Copy`;
        if (copy.transform && copy.kind !== "folder") {
          copy.transform.x = Math.min(512, (copy.transform.x ?? 256) + 18);
          copy.transform.y = Math.min(512, (copy.transform.y ?? 256) + 18);
        }
        const idx = state.doc.layers.findIndex((x) => x.id === id);
        state.doc.layers.splice(idx + 1, 0, copy);
        state.doc.selectedLayerId = copy.id;
        evaluateAndRender(true);
        rebuildInspector();
        Toast(`Duplicated "${src.name}"`);
      },
      onToggleLayerMask: (id) => {
        const l = state.doc.layers.find((x) => x.id === id);
        if (!l || l.kind === "folder") return;
        pushUndo();
        if (!l.mask) {
          l.mask = { enabled: true, invert: false, mode: "noise", frequency: 4, threshold: 0.45, softness: 0.25, seed: 211 };
        } else {
          l.mask.enabled = !l.mask.enabled;
        }
        state.doc.selectedLayerId = l.id;
        evaluateAndRender(true);
        rebuildInspector();
      },
      onDeleteLayer: (id) => {
        if (state.doc.layers.length <= 1) {
          Toast("Keep at least one layer in stack");
          return;
        }
        pushUndo();
        state.doc.layers = state.doc.layers.filter((l) => l.id !== id);
        if (state.doc.selectedLayerId === id) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
        evaluateAndRender(true);
        rebuildInspector();
      },
    });
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
        Write: (v) => { layer.shape.motifType = v; evaluateAndRender(true); },
      });
    } else if (layer.kind === "text") {
      TextRow(lSec.Inner, {
        Label: "Text Content",
        Read: () => layer.text?.value || "FRONTIER",
        Write: (v) => { if (!layer.text) layer.text = {}; layer.text.value = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Font Size",
        Minimum: 14, Maximum: 160, Step: 2, Unit: "px",
        Read: () => layer.text?.fontSize ?? 54,
        Write: (v) => { if (!layer.text) layer.text = {}; layer.text.fontSize = v; evaluateAndRender(true); },
      });
    } else if (layer.kind === "gradient") {
      SegmentedRow(lSec.Inner, {
        Label: "Fill Type",
        Options: [["Linear", "linear"], ["Radial", "radial"]],
        Read: () => layer.shape.fillMode || "linear",
        Write: (v) => { layer.shape.fillMode = v; evaluateAndRender(true); },
      });
      ColorRow(lSec.Inner, {
        Label: "Secondary Color",
        Read: () => layer.shape.colorB || "#1a1e24",
        Write: (v) => { layer.shape.colorB = v; evaluateAndRender(true); },
      });
    }

    if (layer.kind !== "folder") {
      ColorRow(lSec.Inner, {
        Label: "Primary Color",
        Read: () => layer.shape.color || "#e8c27a",
        Write: (v) => { layer.shape.color = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Stroke Outline",
        Minimum: 0, Maximum: 18, Step: 0.5, Unit: "px",
        Read: () => layer.shape.strokeWidth ?? 0,
        Write: (v) => { layer.shape.strokeWidth = v; evaluateAndRender(true); },
      });
      SelectRow(lSec.Inner, {
        Label: "Blend Mode",
        Options: ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => [b, b]),
        Read: () => layer.blend || "Normal",
        Write: (v) => { layer.blend = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Layer Opacity",
        Minimum: 0, Maximum: 1, Step: 0.02,
        Read: () => layer.opacity ?? 1,
        Write: (v) => { layer.opacity = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Center X",
        Minimum: 0, Maximum: 512, Step: 1, Unit: "px",
        Read: () => layer.transform.x,
        Write: (v) => { layer.transform.x = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Center Y",
        Minimum: 0, Maximum: 512, Step: 1, Unit: "px",
        Read: () => layer.transform.y,
        Write: (v) => { layer.transform.y = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Width",
        Minimum: 6, Maximum: 512, Step: 2, Unit: "px",
        Read: () => layer.transform.width,
        Write: (v) => { layer.transform.width = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Height",
        Minimum: 6, Maximum: 512, Step: 2, Unit: "px",
        Read: () => layer.transform.height,
        Write: (v) => { layer.transform.height = v; evaluateAndRender(true); },
      });
      SliderRow(lSec.Inner, {
        Label: "Rotation",
        Minimum: -180, Maximum: 180, Step: 1, Unit: "°",
        Read: () => layer.transform.rotation,
        Write: (v) => { layer.transform.rotation = v; evaluateAndRender(true); },
      });
    }

    // Surface Finish
    if (layer.kind !== "folder") {
      const sSec = SectionCard(rightInner, { Title: "PBR Surface Channels", Glyph: "Material" });
      SelectRow(sSec.Inner, {
        Label: "Surface Finish",
        Options: Object.entries(ARTWORK_FINISHES).map(([k, v]) => [v.label, k]),
        Read: () => layer.surface.finish,
        Write: (v) => {
          const preset = ARTWORK_FINISHES[v];
          layer.surface.finish = v;
          if (preset) {
            layer.surface.roughness = preset.roughness;
            layer.surface.metalness = preset.metalness;
            layer.surface.height = preset.height;
          }
          evaluateAndRender();
          Broadcast();
        },
      });
      SliderRow(sSec.Inner, { Label: "Roughness", Minimum: 0.04, Maximum: 1, Step: 0.02, Read: () => layer.surface.roughness, Write: (v) => { layer.surface.roughness = v; evaluateAndRender(); } });
      SliderRow(sSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.02, Read: () => layer.surface.metalness, Write: (v) => { layer.surface.metalness = v; evaluateAndRender(); } });
      SliderRow(sSec.Inner, { Label: "Relief Height", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.surface.height, Write: (v) => { layer.surface.height = v; evaluateAndRender(); } });
    }

    // Per-Layer Mask
    if (layer.kind !== "folder") {
      const kSec = SectionCard(rightInner, { Title: "Layer Mask", Glyph: "Focus", Badge: layer.mask?.enabled ? "ON" : "OFF", Open: !!layer.mask?.enabled });
      SwitchRow(kSec.Inner, {
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
        SegmentedRow(kSec.Inner, {
          Label: "Mask Mode",
          Options: [["Noise", "noise"], ["Radial", "radial"], ["Stripe", "stripe"]],
          Read: () => layer.mask.mode,
          Write: (v) => { layer.mask.mode = v; evaluateAndRender(); },
        });
        SliderRow(kSec.Inner, { Label: "Threshold", Minimum: 0, Maximum: 1, Step: 0.02, Read: () => layer.mask.threshold, Write: (v) => { layer.mask.threshold = v; evaluateAndRender(); } });
        SliderRow(kSec.Inner, { Label: "Softness", Minimum: 0.02, Maximum: 0.8, Step: 0.02, Read: () => layer.mask.softness, Write: (v) => { layer.mask.softness = v; evaluateAndRender(); } });
        SliderRow(kSec.Inner, { Label: "Scale / Freq", Minimum: 1, Maximum: 16, Step: 1, Read: () => layer.mask.frequency, Write: (v) => { layer.mask.frequency = v; evaluateAndRender(); } });
        SwitchRow(kSec.Inner, { Label: "Invert Mask", Read: () => !!layer.mask.invert, Write: (v) => { layer.mask.invert = v; evaluateAndRender(); } });
      }
    }

    // Modifier Stack
    const mSec = SectionCard(rightInner, {
      Title: "Non-Destructive Modifiers",
      Glyph: "Modifier",
      Badge: `${(layer.modifiers || []).length} ACTIVE`,
    });

    const addModRow = Construct("div", "chip-strip");
    for (const def of MODIFIER_DEFINITIONS) {
      const ab = Construct("button", "chip-btn", `+ ${def.label}`);
      ab.type = "button";
      ab.addEventListener("click", () => {
        layer.modifiers = layer.modifiers || [];
        layer.modifiers.push(createDefaultModifier(def.type));
        evaluateAndRender(true);
        rebuildInspector();
      });
      addModRow.append(ab);
    }
    mSec.Inner.append(addModRow);

    for (let mi = 0; mi < (layer.modifiers || []).length; mi++) {
      const mod = layer.modifiers[mi];
      const def = MODIFIER_DEFINITIONS.find((d) => d.type === mod.type) || { label: mod.type };
      const card = Construct("div", "modifier-card");
      const head = Construct("div", "modifier-card-head", [
        ConstructGlyph(mod.type === "noise-scale" ? "Noise" : "Modifier"),
        Construct("strong", null, def.label),
      ]);
      const tog = Construct("button", "stack-mini-btn" + (mod.enabled !== false ? " on" : ""), ConstructGlyph(mod.enabled !== false ? "Eye" : "EyeOff"));
      tog.type = "button";
      tog.addEventListener("click", () => { mod.enabled = mod.enabled === false; evaluateAndRender(true); rebuildInspector(); });
      const rm = Construct("button", "stack-mini-btn", ConstructGlyph("Close"));
      rm.type = "button";
      rm.addEventListener("click", () => { layer.modifiers.splice(mi, 1); evaluateAndRender(true); rebuildInspector(); });
      head.append(tog, rm);
      card.append(head);

      if (mod.type === "noise-scale") {
        SelectRow(card, {
          Label: "Noise Algorithm",
          Options: [["FBM (Multi-Octave)", "fbm"], ["Perlin Gradient", "perlin"], ["Worley Cellular", "worley"], ["Ridged Folds", "ridged"], ["Radial Falloff", "radial"]],
          Read: () => mod.noiseType,
          Write: (v) => { mod.noiseType = v; evaluateAndRender(); },
        });
        SelectRow(card, {
          Label: "Modulate Target",
          Options: [["Scale + Color", "scale-color"], ["Scale Only", "scale"], ["Scale + Opacity", "scale-opacity"], ["Scale + Relief", "scale-height"]],
          Read: () => mod.target,
          Write: (v) => { mod.target = v; evaluateAndRender(); },
        });
        SliderRow(card, { Label: "Min Scale", Minimum: 0.05, Maximum: 2.0, Step: 0.02, Read: () => mod.minScale, Write: (v) => { mod.minScale = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Max Scale", Minimum: 0.2, Maximum: 3.0, Step: 0.02, Read: () => mod.maxScale, Write: (v) => { mod.maxScale = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Frequency", Minimum: 0.5, Maximum: 14, Step: 0.25, Read: () => mod.frequency, Write: (v) => { mod.frequency = v; evaluateAndRender(); } });
        ColorRow(card, { Label: "Target Color B", Read: () => mod.colorB || "#76b2d8", Write: (v) => { mod.colorB = v; evaluateAndRender(); } });
      } else if (mod.type === "array-grid") {
        SegmentedRow(card, {
          Label: "Grid Layout",
          Options: [["Grid", "grid"], ["Brick", "brick"], ["Hex", "hex"], ["Drop", "half-drop"]],
          Read: () => mod.layout || "grid",
          Write: (v) => { mod.layout = v; evaluateAndRender(); },
        });
        SliderRow(card, { Label: "Columns", Minimum: 1, Maximum: 24, Step: 1, Read: () => mod.columns, Write: (v) => { mod.columns = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Rows", Minimum: 1, Maximum: 24, Step: 1, Read: () => mod.rows, Write: (v) => { mod.rows = v; evaluateAndRender(); } });
      } else if (mod.type === "array-radial") {
        SliderRow(card, { Label: "Count", Minimum: 3, Maximum: 32, Step: 1, Read: () => mod.count, Write: (v) => { mod.count = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Radius", Minimum: 20, Maximum: 240, Step: 4, Unit: "px", Read: () => mod.radius, Write: (v) => { mod.radius = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Rings", Minimum: 1, Maximum: 5, Step: 1, Read: () => mod.rings, Write: (v) => { mod.rings = v; evaluateAndRender(); } });
      } else if (mod.type === "inset-echo") {
        SliderRow(card, { Label: "Echo Copies", Minimum: 1, Maximum: 8, Step: 1, Read: () => mod.copies, Write: (v) => { mod.copies = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Inset Step", Minimum: 8, Maximum: 90, Step: 2, Unit: "px", Read: () => mod.stepPx, Write: (v) => { mod.stepPx = v; evaluateAndRender(); } });
        ColorRow(card, { Label: "Alt Color", Read: () => mod.colorB || "#181b1f", Write: (v) => { mod.colorB = v; evaluateAndRender(); } });
      } else if (mod.type === "noise-jitter") {
        SliderRow(card, { Label: "Position Jitter", Minimum: 0, Maximum: 80, Step: 1, Unit: "px", Read: () => mod.posJitter, Write: (v) => { mod.posJitter = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Rotation Jitter", Minimum: 0, Maximum: 180, Step: 2, Unit: "°", Read: () => mod.rotJitter, Write: (v) => { mod.rotJitter = v; evaluateAndRender(); } });
        SliderRow(card, { Label: "Dropout", Minimum: 0, Maximum: 0.85, Step: 0.02, Read: () => mod.dropout, Write: (v) => { mod.dropout = v; evaluateAndRender(); } });
      } else if (mod.type === "warp") {
        SegmentedRow(card, {
          Label: "Warp Mode",
          Options: [["Wave", "wave"], ["Swirl", "swirl"], ["Curl", "curl"], ["Pinch", "pinch"]],
          Read: () => mod.warpType || "wave",
          Write: (v) => { mod.warpType = v; evaluateAndRender(); },
        });
        SliderRow(card, { Label: "Amplitude", Minimum: 0, Maximum: 120, Step: 2, Unit: "px", Read: () => mod.amplitude, Write: (v) => { mod.amplitude = v; evaluateAndRender(); } });
      } else if (mod.type === "edge-wear") {
        SliderRow(card, { Label: "Chip Wear", Minimum: 0, Maximum: 0.9, Step: 0.02, Read: () => mod.chipAmount, Write: (v) => { mod.chipAmount = v; evaluateAndRender(); } });
      }
      mSec.Inner.append(card);
    }

    const bgSec = SectionCard(rightInner, { Title: "Document Ground & Tile", Glyph: "Pattern", Open: false });
    SwitchRow(bgSec.Inner, {
      Label: "Ground Fill Enabled",
      Read: () => !!state.doc.background?.enabled,
      Write: (v) => { state.doc.background.enabled = v; evaluateAndRender(); },
    });
    ColorRow(bgSec.Inner, {
      Label: "Ground Color",
      Read: () => state.doc.background?.color || "#171a1f",
      Write: (v) => { state.doc.background.color = v; evaluateAndRender(); },
    });
    if (isPattern) {
      SwitchRow(bgSec.Inner, {
        Label: "Show Ghost Repeat Borders",
        Read: () => state.showTileRepeat,
        Write: (v) => { state.showTileRepeat = v; if (state.viewChannel === "vector") renderVectorSvgCanvas(); },
      });
    }

    CloseScope(inspectorScope);
    Broadcast();
  }

  // ----------------------------------------------------------------- SVG DIRECT VECTOR INTERACTION
  svgEl.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || (e.button === 0 && (state.vectorTool === "pan" || spacePanning))) {
      e.preventDefault();
      const m = getSvgViewMetrics();
      pointerInteraction = {
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: state.panX,
        startPanY: state.panY,
        units: m.vw / Math.max(1, m.w),
      };
      svgEl.style.cursor = "grabbing";
      svgEl.setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0 || state.viewChannel !== "vector") return;

    const pt = clientToSvg(e.clientX, e.clientY);
    const handleEl = e.target.closest?.("[data-handle]");
    if (handleEl) {
      const sel = getSelectedLayer();
      if (!sel || sel.locked) return;
      const handleId = handleEl.dataset.handle;
      const snap = structuredClone(state.doc);
      if (handleId === "rotate") {
        pointerInteraction = {
          kind: "rotate",
          layer: sel,
          undoSnap: snap,
          startAngle: Math.atan2(pt.y - sel.transform.y, pt.x - sel.transform.x) * (180 / Math.PI),
          origRot: sel.transform.rotation || 0,
        };
      } else {
        pointerInteraction = {
          kind: "resize",
          layer: sel,
          undoSnap: snap,
          handle: handleId,
          startX: pt.x,
          startY: pt.y,
          orig: { ...sel.transform },
        };
      }
      svgEl.setPointerCapture?.(e.pointerId);
      return;
    }

    // Shape drawing tool
    if (state.vectorTool !== "select") {
      const sx = snapCoord(pt.x, state.snapStep);
      const sy = snapCoord(pt.y, state.snapStep);
      pointerInteraction = {
        kind: "draw",
        tool: state.vectorTool,
        startX: sx,
        startY: sy,
        draftRect: { x: sx, y: sy, w: 1, h: 1 },
      };
      svgEl.setPointerCapture?.(e.pointerId);
      renderVectorSvgCanvas();
      return;
    }

    // Select & move shape layer directly on SVG canvas
    const hitGroup = e.target.closest?.("[data-layer-id]");
    if (hitGroup) {
      const targetLayer = state.doc.layers.find((l) => l.id === hitGroup.dataset.layerId);
      if (targetLayer) {
        if (state.doc.selectedLayerId !== targetLayer.id) {
          state.doc.selectedLayerId = targetLayer.id;
          renderLeftColumn();
          rebuildInspector();
          renderVectorSvgCanvas();
        }
        if (!targetLayer.locked) {
          pointerInteraction = {
            kind: "move",
            layer: targetLayer,
            undoSnap: structuredClone(state.doc),
            startX: pt.x,
            startY: pt.y,
            origX: targetLayer.transform.x,
            origY: targetLayer.transform.y,
          };
          svgEl.setPointerCapture?.(e.pointerId);
        }
      }
    }
  });

  svgEl.addEventListener("pointermove", (e) => {
    if (!pointerInteraction) return;
    if (pointerInteraction.kind === "pan") {
      state.panX = pointerInteraction.startPanX - (e.clientX - pointerInteraction.startClientX) * pointerInteraction.units;
      state.panY = pointerInteraction.startPanY - (e.clientY - pointerInteraction.startClientY) * pointerInteraction.units;
      renderVectorSvgCanvas();
      return;
    }

    const pt = clientToSvg(e.clientX, e.clientY);
    const l = pointerInteraction.layer;

    if (pointerInteraction.kind === "move" && l) {
      const dx = pt.x - pointerInteraction.startX;
      const dy = pt.y - pointerInteraction.startY;
      l.transform.x = snapCoord(pointerInteraction.origX + dx, e.shiftKey ? 0 : state.snapStep);
      l.transform.y = snapCoord(pointerInteraction.origY + dy, e.shiftKey ? 0 : state.snapStep);
      viewTitle.textContent = `${l.name} (${Math.round(l.transform.x)}, ${Math.round(l.transform.y)})`;
      evaluateAndRender(false, { skipPbr: true });
      Broadcast();
    } else if (pointerInteraction.kind === "resize" && l) {
      const rad = -((pointerInteraction.orig.rotation || 0) * Math.PI) / 180;
      const dxWorld = pt.x - pointerInteraction.startX;
      const dyWorld = pt.y - pointerInteraction.startY;
      const dx = dxWorld * Math.cos(rad) - dyWorld * Math.sin(rad);
      const dy = dxWorld * Math.sin(rad) + dyWorld * Math.cos(rad);
      const h = pointerInteraction.handle;
      const minSz = 10;
      let nextW = pointerInteraction.orig.width;
      let nextH = pointerInteraction.orig.height;
      let shiftX = 0, shiftY = 0;

      if (h.includes("e")) {
        nextW = Math.max(minSz, snapCoord(pointerInteraction.orig.width + dx, state.snapStep));
        shiftX = (nextW - pointerInteraction.orig.width) * 0.5;
      } else if (h.includes("w")) {
        nextW = Math.max(minSz, snapCoord(pointerInteraction.orig.width - dx, state.snapStep));
        shiftX = -(nextW - pointerInteraction.orig.width) * 0.5;
      }
      if (h.includes("s")) {
        nextH = Math.max(minSz, snapCoord(pointerInteraction.orig.height + dy, state.snapStep));
        shiftY = (nextH - pointerInteraction.orig.height) * 0.5;
      } else if (h.includes("n")) {
        nextH = Math.max(minSz, snapCoord(pointerInteraction.orig.height - dy, state.snapStep));
        shiftY = -(nextH - pointerInteraction.orig.height) * 0.5;
      }
      if (e.shiftKey) {
        const uniform = Math.max(nextW, nextH);
        nextW = nextH = uniform;
      }
      const rotBack = ((pointerInteraction.orig.rotation || 0) * Math.PI) / 180;
      l.transform.width = nextW;
      l.transform.height = nextH;
      l.transform.x = pointerInteraction.orig.x + shiftX * Math.cos(rotBack) - shiftY * Math.sin(rotBack);
      l.transform.y = pointerInteraction.orig.y + shiftX * Math.sin(rotBack) + shiftY * Math.cos(rotBack);
      viewTitle.textContent = `${l.name} ${Math.round(nextW)}×${Math.round(nextH)}`;
      evaluateAndRender(false, { skipPbr: true });
      Broadcast();
    } else if (pointerInteraction.kind === "rotate" && l) {
      const curAngle = Math.atan2(pt.y - l.transform.y, pt.x - l.transform.x) * (180 / Math.PI);
      let nextRot = pointerInteraction.origRot + (curAngle - pointerInteraction.startAngle);
      if (e.shiftKey) nextRot = Math.round(nextRot / 15) * 15;
      while (nextRot > 180) nextRot -= 360;
      while (nextRot < -180) nextRot += 360;
      l.transform.rotation = Math.round(nextRot);
      viewTitle.textContent = `${l.name} ${l.transform.rotation}°`;
      evaluateAndRender(false, { skipPbr: true });
      Broadcast();
    } else if (pointerInteraction.kind === "draw") {
      const ex = snapCoord(pt.x, state.snapStep);
      const ey = snapCoord(pt.y, state.snapStep);
      const x = Math.min(pointerInteraction.startX, ex);
      const y = Math.min(pointerInteraction.startY, ey);
      const w = Math.max(8, Math.abs(ex - pointerInteraction.startX));
      const h = Math.max(8, Math.abs(ey - pointerInteraction.startY));
      pointerInteraction.draftRect = { x, y, w, h };
      renderVectorSvgCanvas();
    }
  });

  const endSvgPointer = (e) => {
    if (!pointerInteraction) return;
    const act = pointerInteraction;
    pointerInteraction = null;
    svgEl.style.cursor = state.vectorTool === "pan" ? "grab" : state.vectorTool === "select" ? "default" : "crosshair";

    if (act.kind === "draw") {
      pushUndo();
      const dr = act.draftRect;
      const w = Math.max(48, dr.w < 12 ? 96 : dr.w);
      const h = Math.max(48, dr.h < 12 ? (act.tool === "stripe" ? 36 : 96) : dr.h);
      const cx = dr.w < 12 ? act.startX : dr.x + w * 0.5;
      const cy = dr.h < 12 ? act.startY : dr.y + h * 0.5;
      const isText = act.tool === "text";
      const created = createArtworkLayer(isText ? "text" : "motif", {
        name: isText ? "Vector Label" : `${act.tool.charAt(0).toUpperCase() + act.tool.slice(1)} Shape`,
        transform: { x: Math.round(cx), y: Math.round(cy), width: Math.round(w), height: Math.round(h), rotation: 0 },
        shape: { motifType: isText ? "square" : act.tool, color: isPattern ? "#eff4cf" : "#e8c27a" },
      });
      state.doc.layers.push(created);
      state.doc.selectedLayerId = created.id;
      if (!e.shiftKey) selectVectorTool("select");
      evaluateAndRender(true);
      rebuildInspector();
      Toast(`Created ${created.name} at (${Math.round(cx)}, ${Math.round(cy)})`);
      return;
    }

    if (act.kind === "move" || act.kind === "resize" || act.kind === "rotate") {
      if (act.undoSnap) pushUndo(act.undoSnap);
      evaluateAndRender(true);
    }
  };
  svgEl.addEventListener("pointerup", endSvgPointer);
  svgEl.addEventListener("pointercancel", endSvgPointer);

  svgEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.zoom = Math.max(0.25, Math.min(8, state.zoom * factor));
    renderVectorSvgCanvas();
  }, { passive: false });

  btnZoomOut.addEventListener("click", () => { state.zoom = Math.max(0.25, state.zoom / 1.25); renderVectorSvgCanvas(); });
  btnZoomIn.addEventListener("click", () => { state.zoom = Math.min(8, state.zoom * 1.25); renderVectorSvgCanvas(); });
  btnZoomFit.addEventListener("click", () => { state.zoom = 1; state.panX = 0; state.panY = 0; renderVectorSvgCanvas(); });

  // ----------------------------------------------------------------- ASSET APPLICATION & DRAG-DROP ONTO CANVAS
  function applyAsset(payload, dropInfo = {}) {
    if (!payload) return false;
    let svgPt = null;
    if (Number.isFinite(dropInfo.clientX) && Number.isFinite(dropInfo.clientY)) {
      svgPt = clientToSvg(dropInfo.clientX, dropInfo.clientY);
      svgPt.x = Math.max(0, Math.min(ARTWORK_SIZE, snapCoord(svgPt.x, state.snapStep)));
      svgPt.y = Math.max(0, Math.min(ARTWORK_SIZE, snapCoord(svgPt.y, state.snapStep)));
    }

    if (payload.assetKind === "pattern" || (payload.assetKind === "stamp" && !isPattern && !dropInfo.merge)) {
      pushUndo();
      const entry = payload.raw;
      state.activeStarterId = entry.id;
      state.doc = loadStarterAsArtworkDocument(entry);
      if (state.doc.layers?.length) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
      evaluateAndRender(true);
      rebuildInspector();
      Toast(`Loaded "${entry.name}" onto ${isPattern ? "Pattern" : "Stamp"} SVG Canvas`);
      return true;
    }

    if (payload.assetKind === "stamp") {
      // Drop stamp into Pattern (or Shift-drop into Stamp) as placed layer(s) at drop coordinates!
      pushUndo();
      const stampDoc = loadStarterAsArtworkDocument(payload.raw);
      const targetX = svgPt ? svgPt.x : 256;
      const targetY = svgPt ? svgPt.y : 256;
      for (const srcLyr of stampDoc.layers || []) {
        const cloned = structuredClone(srcLyr);
        cloned.id = `lyr_${Math.random().toString(36).slice(2, 9)}`;
        cloned.transform.x = targetX + (cloned.transform.x - 256) * 0.5;
        cloned.transform.y = targetY + (cloned.transform.y - 256) * 0.5;
        cloned.transform.width *= 0.5;
        cloned.transform.height *= 0.5;
        state.doc.layers.push(cloned);
        state.doc.selectedLayerId = cloned.id;
      }
      evaluateAndRender(true);
      rebuildInspector();
      Toast(`Placed stamp "${payload.name}" at (${Math.round(targetX)}, ${Math.round(targetY)})`);
      return true;
    }

    if (payload.assetKind === "material") {
      const mat = payload.raw;
      const sel = getSelectedLayer();
      if (sel && sel.kind !== "folder") {
        pushUndo();
        sel.shape.color = mat.color || sel.shape.color;
        sel.surface.roughness = mat.roughness ?? sel.surface.roughness;
        sel.surface.metalness = mat.metalness ?? sel.surface.metalness;
        evaluateAndRender(true);
        rebuildInspector();
        Toast(`Applied "${mat.name}" PBR look to layer "${sel.name}"`);
        return true;
      }
    }
    return false;
  }

  seViewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    seViewport.classList.add("canvas-drop-active");
  });
  seViewport.addEventListener("dragleave", () => seViewport.classList.remove("canvas-drop-active"));
  seViewport.addEventListener("drop", (e) => {
    e.preventDefault();
    seViewport.classList.remove("canvas-drop-active");
    let payload = null;
    try {
      const rawJson = e.dataTransfer?.getData("application/x-frontier-asset") || e.dataTransfer?.getData("text/plain");
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        payload = parsed.raw ? parsed : appBridge.resolveAssetPayload?.(parsed.assetKind, parsed.id);
      }
    } catch {}
    if (!payload) payload = appBridge.activeDragAsset;
    if (payload) applyAsset(payload, { source: "drop", clientX: e.clientX, clientY: e.clientY, merge: e.shiftKey });
  });

  // ----------------------------------------------------------------- TOOLBAR & POPUP ACTIONS
  loadJsonInp.addEventListener("change", async () => {
    const file = loadJsonInp.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const docData = parsed?.document || parsed;
      if (Array.isArray(docData?.layers) && docData.layers.length) {
        pushUndo();
        state.doc = docData;
        if (parsed.resolution && RESOLUTIONS.includes(Number(parsed.resolution))) {
          state.resolution = Number(parsed.resolution);
          headerUI.setResolution(state.resolution);
          headerUI.setSaveItemMeta("png", `${state.resolution}px`);
          headerUI.setSaveItemMeta("pbr", `${Math.min(2048, state.resolution)}px`);
        }
        evaluateAndRender(true);
        rebuildInspector();
        headerUI.closeSaveMenu();
        Toast(`Opened "${state.doc.name || file.name}"`);
      } else {
        Toast("Invalid project JSON");
      }
    } catch (err) {
      Toast(`Open error: ${err.message}`);
    }
    loadJsonInp.value = "";
  });

  btnGrid.addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    btnGrid.classList.toggle("active", state.showGrid);
    if (state.viewChannel === "vector") renderVectorSvgCanvas();
  });
  btnAxes.addEventListener("click", () => {
    state.showAxes = !state.showAxes;
    btnAxes.classList.toggle("active", state.showAxes);
    if (state.viewChannel === "vector") renderVectorSvgCanvas();
  });
  snapSelect.addEventListener("change", () => {
    state.snapStep = Number(snapSelect.value) || 0;
    if (state.viewChannel === "vector") renderVectorSvgCanvas();
  });

  btnAddNoiseScale.addEventListener("click", () => {
    const layer = getSelectedLayer();
    if (!layer || layer.kind === "folder") {
      Toast("Select a Motif layer to add Noise Scale");
      return;
    }
    pushUndo();
    layer.modifiers = layer.modifiers || [];
    const hasGrid = layer.modifiers.some((m) => m.type === "array-grid" || m.type === "array-radial");
    if (!hasGrid && isPattern) layer.modifiers.unshift(createDefaultModifier("array-grid"));
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

  btnSendToPaint.addEventListener("click", () => {
    const sz = Math.min(1024, state.resolution);
    const ev = evaluateArtworkDocument(state.doc, sz);
    const payload = { ...ev, name: state.doc.name };
    if (isPattern) appBridge.sendPatternToPaint(payload);
    else appBridge.sendStampToPaint(payload);
  });
  if (btnSendToMaterial) {
    btnSendToMaterial.addEventListener("click", () => {
      const sz = Math.min(1024, state.resolution);
      const ev = evaluateArtworkDocument(state.doc, sz);
      appBridge.sendPatternToMaterial?.({
        ...ev,
        name: state.doc.name,
        repeats: state.doc.tiling?.repeats || 3,
      });
    });
  }

  // Right-click (<5px) / Q / Tab quick modifier & tool popup + shortcuts
  let activeArtPopup = null;
  function closeArtPopup() {
    if (activeArtPopup) {
      activeArtPopup.remove?.();
      activeArtPopup = null;
    }
  }
  function openArtPopup(clientX = null, clientY = null) {
    if (activeArtPopup) { closeArtPopup(); return; }
    const box = stage.getBoundingClientRect();
    const px = clientX ?? (box.left + box.width * 0.5 - 165);
    const py = clientY ?? (box.top + 70);
    const pop = Construct("div", "tool-popup-menu");
    pop.style.left = `${Math.max(12, Math.min(px, (window.innerWidth || 1280) - 356))}px`;
    pop.style.top = `${Math.max(12, Math.min(py, (window.innerHeight || 800) - 360))}px`;

    const closeBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Close"));
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeArtPopup);
    const selLayer = getSelectedLayer();
    pop.append(
      Construct("div", "tool-popup-head", [
        ConstructGlyph(isPattern ? "Pattern" : "Stamp"),
        Construct("strong", null, selLayer ? `${selLayer.name} Quick Menu` : "Vector Quick Menu"),
        Construct("small", null, "Q / Tab / Esc"),
        closeBtn,
      ]),
    );

    const chanRow = Construct("div", "chip-strip");
    for (const [label, val] of [["Vector SVG", "vector"], ["2×2 Tile", "tile2x2"], ["Albedo", "albedo"], ["Rough", "roughness"], ["Normal", "normal"]]) {
      const cb = Construct("button", "chip-btn" + (state.viewChannel === val ? " active" : ""), label);
      cb.type = "button";
      cb.addEventListener("click", () => {
        state.viewChannel = val;
        headerUI.setView(val);
        syncViewDisplay();
        closeArtPopup();
      });
      chanRow.append(cb);
    }
    pop.append(Construct("div", "property-label", "Canvas View"), chanRow);

    const modRow = Construct("div", "chip-strip");
    for (const [label, kind] of [["+ Noise Scale", "noise-scale"], ["+ Array Grid", "array-grid"], ["+ Radial", "array-radial"], ["+ Warp", "warp"]]) {
      const mb = Construct("button", "chip-btn", label);
      mb.type = "button";
      mb.addEventListener("click", () => {
        const l = getSelectedLayer();
        if (l) {
          pushUndo();
          l.modifiers = l.modifiers || [];
          l.modifiers.push(createDefaultModifier(kind));
          evaluateAndRender(true);
          rebuildInspector();
        }
        closeArtPopup();
      });
      modRow.append(mb);
    }
    pop.append(Construct("div", "property-label", "Quick Add Modifier"), modRow);

    const actBtn = Construct("button", "action-button accent", [
      ConstructGlyph("Brush"),
      Construct("span", null, isPattern ? "Send Pattern to Paint" : "Send Stamp to Paint"),
    ]);
    actBtn.type = "button";
    actBtn.style.width = "100%";
    actBtn.addEventListener("click", () => { closeArtPopup(); btnSendToPaint.click(); });
    pop.append(actBtn);

    document.body.append(pop);
    activeArtPopup = pop;
  }

  let artRDown = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button === 2) artRDown = { x: e.clientX, y: e.clientY };
    else if (activeArtPopup && !activeArtPopup.contains(e.target)) closeArtPopup();
  });
  stage.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!artRDown || Math.hypot(e.clientX - artRDown.x, e.clientY - artRDown.y) < 5) {
      openArtPopup(e.clientX, e.clientY);
    }
    artRDown = null;
  });

  const onArtKeyDown = (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      performSaveProject();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      performRedo();
      return;
    }
    if (e.code === "Space") { spacePanning = true; return; }
    if (e.key === "Escape") { closeArtPopup(); headerUI.closeSaveMenu(); return; }
    if (e.key.toLowerCase() === "q" || e.key === "Tab") { e.preventDefault(); openArtPopup(); return; }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const sel = getSelectedLayer();
      if (sel) moveLayerByOffset(sel.id, e.key === "ArrowUp" ? +1 : -1);
      return;
    }
    const toolMatch = VECTOR_TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
    if (toolMatch && !e.ctrlKey && !e.metaKey) selectVectorTool(toolMatch.id);
  };
  const onArtKeyUp = (e) => {
    if (e.code === "Space") spacePanning = false;
  };
  window.addEventListener("keydown", onArtKeyDown);
  window.addEventListener("keyup", onArtKeyUp);

  const ro = new ResizeObserver(() => {
    if (state.viewChannel === "vector") renderVectorSvgCanvas();
  });
  ro.observe(seViewport);

  evaluateAndRender(true);
  rebuildInspector();
  syncViewDisplay();

  return {
    name: isPattern ? "Pattern" : "Stamp",
    applyAsset,
    getSnapshot: () => {
      const sel = getSelectedLayer();
      return {
        mode,
        name: state.doc.name,
        resolution: state.resolution,
        layers: state.doc.layers.length,
        viewChannel: state.viewChannel,
        vectorTool: state.vectorTool,
        showGrid: state.showGrid,
        snapStep: state.snapStep,
        undoDepth: undoStack.length,
        redoDepth: redoStack.length,
        selectedLayer: sel ? { id: sel.id, name: sel.name, ...sel.transform } : null,
        stats: state.lastStats,
      };
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      headerUI.dispose();
      layerStackUI.dispose?.();
      closeArtPopup();
      window.removeEventListener("keydown", onArtKeyDown);
      window.removeEventListener("keyup", onArtKeyUp);
      if (inspectorScope) ReleaseScope(inspectorScope);
      root.innerHTML = "";
    },
  };
}
