/*==========================================================================================================================================
                                                       TEXTUREPAINTWORKSPACE.JS
==========================================================================================================================================*/
/* High-Speed GPU-Accelerated 3D + 2D UV Texture Painting Studio:
   - Real-time WebGL2 GPU brush dab accumulation, layer compositing, edge dilation, & height->normal extraction (GpuPaintSession)
   - Unified single-canvas 3D + 2D GPU viewport (zero readPixels stalls during strokes)
   - Right-click (on empty/viewport) OR Q / Tab hotkey opens the context-aware Active Tool Popup Menu
   - Drag-and-drop & Up/Down arrow Layer Stack reordering + Alt+Up/Down shortcuts + per-layer Masks. */

import * as THREE from "three";
import { OrbitControls } from "../Vendor/orbit-controls.esm.min.js";
import { OBJLoader } from "../Vendor/addons/OBJLoader.js";
import { STLLoader } from "../Vendor/addons/STLLoader.js";
import { materials as MATERIAL_CATALOG } from "../Engine/Materials/materials.js";
import {
  PAINT_MESH_PRESETS as PAINT_MESH_LIST,
  PAINT_PBR_CHANNELS,
  PAINT_PBR_CHANNEL_ROWS,
  PAINT_PBR_CHANNEL_MAP,
  EXTENDED_PBR_KEYS,
  createDefaultChannelMap,
  createDefaultChannelOpacities,
  createDefaultChannelBlends,
  createDefaultExtendedValues,
  defaultByteForExtChannel,
  createStampInstance,
  generateProceduralMask,
  featherMaskPixels,
  lookupSurfaceAtUv,
  buildPaintTargetGeometry,
  buildMeshPaintIndex,
  createPaintDocument,
  createPaintLayer,
  buildDefaultMeshCues,
  createStrokeAccumulator,
  applyBrushDab3D,
  applyBrushDabUV,
  commitStrokeAccumulator,
  applyFloodFill,
  compositePaintDocument,
  sampleCompositedAtUV,
  CURVE_PRESETS,
  COLOUR_DYNAMIC_MODES,
  COLOUR_GRADIENT_PRESETS,
  OPACITY_DYNAMIC_MODES,
  getToolChannels,
  resolveDabVariation,
  rgbaPixelsToSurfaceMaps,
} from "../Engine/TexturePaintEngine.js";
import { GpuPaintSession } from "../Engine/GpuPaintEngine.js";
import { evaluateArtworkDocument } from "../Engine/Patterns/ArtworkStackEngine.js";
import {
  listStampStarterCatalog,
  loadStarterAsArtworkDocument,
  getArtworkPreviewSvg,
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
  ActionRow,
  MetricTrio,
  ChannelMaskRow,
  FilterDropdownPill,
  MultiColourRow,
  CurveRow,
  SmoothScroll,
  OpenScope,
  CloseScope,
  ReleaseScope,
  Broadcast,
  Toast,
} from "../StudioControls.js";

function clonePixels(buf) {
  const out = {
    res: buf.res,
    albedo: new Uint8ClampedArray(buf.albedo),
    roughness: new Uint8ClampedArray(buf.roughness),
    metalness: new Uint8ClampedArray(buf.metalness),
    height: new Uint8ClampedArray(buf.height),
  };
  if (buf.roughAlpha) out.roughAlpha = new Uint8ClampedArray(buf.roughAlpha);
  if (buf.metalAlpha) out.metalAlpha = new Uint8ClampedArray(buf.metalAlpha);
  if (buf.heightAlpha) out.heightAlpha = new Uint8ClampedArray(buf.heightAlpha);
  if (buf.extValues) {
    out.extValues = {};
    for (const [k, v] of Object.entries(buf.extValues)) out.extValues[k] = new Uint8ClampedArray(v);
  }
  if (buf.extAlphas) {
    out.extAlphas = {};
    for (const [k, v] of Object.entries(buf.extAlphas)) out.extAlphas[k] = new Uint8ClampedArray(v);
  }
  return out;
}

function createPaintEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#13151b");
  const g = new THREE.PlaneGeometry(7, 5);
  const m1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.95) });
  const m2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.65, 2.3) });
  const p1 = new THREE.Mesh(g, m1);
  p1.position.set(4.5, 5.5, 4);
  p1.lookAt(0, 0, 0);
  const p2 = new THREE.Mesh(g, m2);
  p2.position.set(-5.2, 2.5, -3.5);
  p2.lookAt(0, 0, 0);
  envScene.add(p1, p2);
  const rt = pmrem.fromScene(envScene, 0.04);
  g.dispose();
  m1.dispose();
  m2.dispose();
  pmrem.dispose();
  return rt.texture;
}

function downloadRgbaPng(rgba, res, filename, isGray = false) {
  const c = document.createElement("canvas");
  c.width = res;
  c.height = res;
  const ctx = c.getContext("2d");
  let out;
  if (isGray) {
    out = new Uint8ClampedArray(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      out[i * 4] = rgba[i];
      out[i * 4 + 1] = rgba[i];
      out[i * 4 + 2] = rgba[i];
      out[i * 4 + 3] = 255;
    }
  } else {
    out = rgba;
  }
  ctx.putImageData(new ImageData(new Uint8ClampedArray(out), res, res), 0, 0);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = filename;
  a.click();
}

function rgbaToPreviewDataUrl(albedo, width, heightPx) {
  if (!albedo || !width || typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = heightPx || width;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx?.putImageData || typeof ImageData === "undefined") return null;
    cx.putImageData(new ImageData(new Uint8ClampedArray(albedo), width, c.height), 0, 0);
    return c.toDataURL?.("image/png") || null;
  } catch {
    return null;
  }
}

const TOOL_LABELS = {
  paint: "Brush",
  erase: "Eraser",
  fill: "Fill",
  stamp: "Stamp",
  eyedropper: "Sample",
  move: "Transform Stamp",
};

const QUICK_SWATCHES = ["#eff4cf", "#e8c27a", "#d96b4e", "#6ea8ff", "#7ac98f", "#d6dce6", "#42464f", "#141518"];

export function mountTexturePaintWorkspace(root, appBridge) {
  let res = 512;
  const defaultStampCatalog = listStampStarterCatalog();
  const stampPreviews = defaultStampCatalog.map((entry) => {
    const doc = loadStarterAsArtworkDocument(entry);
    const evaluated = evaluateArtworkDocument(doc, 192);
    const previewSvg = getArtworkPreviewSvg(entry, "stamp", 76);
    return { entry, name: doc.name, evaluated, previewSvg, previewDataUrl: null };
  });
  const defaultStamp = stampPreviews[0];

  const defaultChannels = () => createDefaultChannelMap(false);

  let state = {
    doc: createPaintDocument(res),
    meshId: "teapot",
    customGeo: null,
    viewportMode: "3d", // "3d" | "split" | "2d"
    viewChannel: "lit", // "lit" | "mask" | any key of PAINT_PBR_CHANNELS
    fillScope: "part", // "part" | "island" | "all"
    inspectedLayerChannel: "all", // "all" | any key of PAINT_PBR_CHANNELS
    popupSubTab: "main", // "main" | "dynamics" | "curves"
    activeCurveKey: "falloff", // "falloff" | "sizeOverStroke" | "opacityOverStroke" | "hueOverStroke"
    stampPlaceMode: "subcomponent", // "subcomponent" | "layer"
    brush: {
      tool: "paint", // "paint" | "erase" | "fill" | "stamp" | "eyedropper" | "move"
      tip: "round", // "round" | "chisel" | "chalk" | "splatter" | "sponge" | "custom"
      color: "#e8c27a",
      roughness: 0.34,
      metalness: 0.12,
      height: 0.25,
      size: 0.24,
      pixelRadius: 24,
      opacity: 0.92,
      flow: 0.78,
      hardness: 0.72,
      roundness: 1.0,
      angle: 0,
      spacing: 0.22,
      followDirection: false,
      stabilizer: 0.18,
      paintChannels: defaultChannels(),
      eraseChannels: defaultChannels(),
      fillChannels: defaultChannels(),
      extValues: createDefaultExtendedValues(),
      jitter: {
        size: 0.0,
        angle: 0.0,
        scatter: 0.0,
        flow: 0.0,
      },
      colourDynamics: {
        mode: "solid", // "solid" | "stroke-gradient" | "multicolour" | "multicolour-cycle" | "temperature" | "rainbow" | "velocity"
        gradientPreset: "ember",
        gradientStops: ["#ff3d2e", "#ff9d3b", "#ffe38e"],
        paletteColors: ["#ff3d2e", "#2fe6a7", "#63a8ff", "#ffd166"],
        gradientLength: 36,
        gradientWrap: "pingpong", // "clamp" | "loop" | "pingpong"
        temperatureShift: 0.35,
        opacityMode: "constant", // "constant" | "fade-out" | "fade-in" | "bell" | "pulse" | "velocity" | "curve"
        opacityJitter: 0.0,
        opacityMin: 0.18,
        opacityPulseFreq: 0.45,
        hueJitter: 0.0,
        satJitter: 0.0,
        valJitter: 0.0,
        strokeGradient: false,
      },
      curves: {
        falloff: CURVE_PRESETS.ease.map((p) => [...p]),
        sizeOverStroke: CURVE_PRESETS.flat.map((p) => [...p]),
        opacityOverStroke: CURVE_PRESETS.flat.map((p) => [...p]),
        hueOverStroke: [[0, 0.5], [1, 0.5]],
      },
      stampName: defaultStamp.name,
      stampData: defaultStamp.evaluated,
      stampScale: 0.28,
      stampRotation: 0,
      stampOpacity: 1.0,
      stampHeightStrength: 0.5,
      stampTint: "#ffffff",
      customTipName: "",
      customTipData: null,
    },
    undoStack: [],
    redoStack: [],
    wireframe: false,
    hoverInfo: "Hover mesh to paint",
  };

  if (appBridge?.shared) {
    if (appBridge.shared.bakedMaps) state.doc.bakedMaps = appBridge.shared.bakedMaps;
    if (appBridge.shared.stampData) {
      state.brush.stampData = appBridge.shared.stampData;
      state.brush.stampName = appBridge.shared.stampData.name || "Bridged Stamp";
    }
  }

  let meshGeo = null;
  let meshIndex = null;
  let meshCues = null;
  let activeCpuStroke = null;
  let hasLiveStroke = false;
  let lastHitPos = null;
  let lastUv2D = null;
  let smoothedHit3D = null;
  let smoothedUv2D = null;
  let strokeDabIndex = 0;
  let isPainting3D = false;
  let isPainting2D = false;
  let inspectorScope = null;
  let rafId = 0;
  let disposed = false;
  let strokeSeedCounter = 1;
  let activeToolPopup = null;
  let dragLayerId = null;

  // Shared image uploader for Stamps, Custom Brush Alpha Tips & Fill Image Textures
  const imageFileInput = document.createElement("input");
  imageFileInput.type = "file";
  imageFileInput.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
  let pendingImageRole = "stamp"; // "stamp" | "tip" | "fill"

  async function importImageFile(file, role = "stamp") {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Could not decode image"));
        img.src = url;
      });
      const maxDim = 256;
      const scale = Math.min(1, maxDim / Math.max(1, img.width, img.height));
      const w = Math.max(8, Math.round(img.width * scale));
      const h = Math.max(8, Math.round(img.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, w, h);
      const rgba = cx.getImageData(0, 0, w, h).data;
      const previewDataUrl = cv.toDataURL("image/png");
      URL.revokeObjectURL(url);

      const cleanName = file.name.replace(/\.[^.]+$/, "") || "Custom Image";
      const evaluated = rgbaPixelsToSurfaceMaps(rgba, w, h, { name: cleanName, previewDataUrl });

      if (role === "tip") {
        state.brush.customTipData = evaluated;
        state.brush.customTipName = cleanName;
        state.brush.tip = "custom";
        if (gpuPaint.isActive) gpuPaint.ensureStampTexture(evaluated, true);
        if (state.brush.tool === "stamp" || state.brush.tool === "fill" || state.brush.tool === "eyedropper") {
          selectTool("paint");
        }
        rebuildInspector();
        if (activeToolPopup) openToolPopup(null, null, true);
        Toast(`Equipped "${cleanName}" as Custom Brush Tip`);
      } else if (role === "fill") {
        let targetFill = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId && l.kind === "fill");
        if (!targetFill) {
          targetFill = createPaintLayer("fill", {
            res,
            name: `${cleanName} Fill`,
            fill: { color: "#ffffff", roughness: state.brush.roughness, metalness: state.brush.metalness, height: 0, patternRepeats: 2, patternData: evaluated },
          });
          state.doc.layers.push(targetFill);
          state.doc.selectedLayerId = targetFill.id;
        } else {
          targetFill.fill.patternData = evaluated;
          targetFill.fill.color = "#ffffff";
        }
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
        if (activeToolPopup) openToolPopup(null, null, true);
        Toast(`Applied "${cleanName}" to Fill Layer`);
      } else {
        stampPreviews.unshift({
          entry: { group: "Imported Image" },
          name: cleanName,
          evaluated,
          previewSvg: null,
          previewDataUrl,
        });
        state.brush.stampData = evaluated;
        state.brush.stampName = cleanName;
        if (gpuPaint.isActive) gpuPaint.ensureStampTexture(evaluated, false);
        selectTool("stamp");
        rebuildInspector();
        if (activeToolPopup) openToolPopup(null, null, true);
        Toast(`Added Stamp Image "${cleanName}"`);
      }
    } catch (err) {
      Toast(`Image import failed: ${err.message}`);
    }
  }

  imageFileInput.addEventListener("change", async () => {
    const f = imageFileInput.files?.[0];
    imageFileInput.value = "";
    if (f) await importImageFile(f, pendingImageRole);
  });

  function triggerAddImage(role = "stamp") {
    pendingImageRole = role;
    imageFileInput.click();
  }

  function createStampPreviewCard(sp, isActive, onPick) {
    const card = Construct("button", "preset-card stamp-preview-card" + (isActive ? " active" : ""));
    card.type = "button";
    const thumb = Construct("div", "stamp-preview-thumb");
    if (sp.previewDataUrl) {
      const im = document.createElement("img");
      im.src = sp.previewDataUrl;
      im.alt = sp.name;
      thumb.append(im);
    } else if (sp.previewSvg) {
      thumb.innerHTML = sp.previewSvg;
    } else {
      thumb.append(ConstructGlyph("Stamp"));
    }
    card.append(
      thumb,
      Construct("small", null, sp.entry?.group || "Stamp Decal"),
      Construct("strong", null, sp.name),
    );
    card.addEventListener("click", onPick);
    return card;
  }

  // ----------------------------------------------------------------- DOM LAYOUT
  const grid = Construct("div", "studio-grid");

  // LEFT: LAYER STACK
  const leftCol = Construct("aside", "studio-column");
  const leftMeta = Construct("span", "panel-heading-meta", `${res}×${res} GPU`);
  leftCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Paint Layer Stack"),
      leftMeta,
    ]),
  );
  const leftScroll = Construct("div", "panel-scroll");
  const leftInner = Construct("div", "panel-scroll-inner");
  leftScroll.append(leftInner);
  const leftFooter = Construct("div", "panel-footer", [
    Construct("span", null, "Drag / ↑↓ Reorder"),
    Construct("span", null, "Seams Dilated +2px"),
  ]);
  leftCol.append(leftScroll, leftFooter);

  // CENTER: TOOLBAR + UNIFIED GPU 3D/UV VIEWPORT
  const centerCol = Construct("main", "studio-column viewport-column");
  const toolbar = Construct("div", "viewport-toolbar");

  const toolButtons = new Map();
  const toolGroup = Construct("div", "toolbar-group");
  for (const [id, label, glyph] of [
    ["paint", "Brush", "Brush"],
    ["erase", "Eraser", "Eraser"],
    ["fill", "Fill", "Fill"],
    ["stamp", "Stamp", "Stamp"],
    ["eyedropper", "Sample", "Pipette"],
    ["move", "Move", "Move"],
  ]) {
    const b = Construct("button", "pill-btn" + (state.brush.tool === id ? " active" : ""), [
      ConstructGlyph(glyph),
      Construct("span", null, label),
    ]);
    b.type = "button";
    b.title = TOOL_LABELS[id] || label;
    b.addEventListener("click", () => selectTool(id));
    toolButtons.set(id, b);
    toolGroup.append(b);
  }

  const meshSelect = Construct("select");
  meshSelect.style.cssText = "height:30px;padding:0 10px;background:#191a1d;border:1px solid var(--line);border-radius:999px;font-size:11px;";
  for (const m of PAINT_MESH_LIST) {
    const o = Construct("option", null, m.label);
    o.value = m.id;
    meshSelect.append(o);
  }
  meshSelect.value = state.meshId;

  const vpSelect = Construct("select");
  vpSelect.style.cssText = meshSelect.style.cssText;
  for (const [label, val] of [
    ["3D Mesh", "3d"],
    ["3D + 2D UV", "split"],
    ["2D UV Only", "2d"],
  ]) {
    const o = Construct("option", null, label);
    o.value = val;
    vpSelect.append(o);
  }

  const chanSelect = Construct("select");
  chanSelect.style.cssText = meshSelect.style.cssText;
  for (const [label, val] of [
    ["Lit PBR", "lit"],
    ["Base Color", "baseColor"],
    ["Roughness", "roughness"],
    ["Metalness", "metalness"],
    ["Height", "height"],
    ["Normal Map", "normal"],
    ["Ambient Occlusion", "ao"],
    ["Opacity / Alpha", "opacity"],
    ["Emissive Color", "emissive"],
    ["Emissive Glow", "emissiveIntensity"],
    ["Clearcoat", "clearcoat"],
    ["Coat Roughness", "coatRoughness"],
    ["Sheen", "sheen"],
    ["Sheen Roughness", "sheenRoughness"],
    ["Specular", "specular"],
    ["Anisotropy", "anisotropy"],
    ["Iridescence", "iridescence"],
    ["Iridescence Thick.", "iridescenceThickness"],
    ["Transmission", "transmission"],
    ["Thickness", "thickness"],
    ["Active Mask", "mask"],
  ]) {
    const o = Construct("option", null, label);
    o.value = val;
    chanSelect.append(o);
  }

  const btnToolMenu = Construct("button", "pill-btn", [ConstructGlyph("Sliders"), Construct("span", null, "Brush / Tool (Q)")]);
  btnToolMenu.type = "button";
  btnToolMenu.title = "Open Brush & Tool Inspector (Right-Click / Q / Tab)";

  const btnUndo = Construct("button", "icon-btn", ConstructGlyph("Undo"));
  btnUndo.type = "button";
  btnUndo.title = "Undo (Ctrl+Z)";
  const btnRedo = Construct("button", "icon-btn", ConstructGlyph("Redo"));
  btnRedo.type = "button";
  btnRedo.title = "Redo (Ctrl+Y)";

  const importInp = document.createElement("input");
  importInp.type = "file";
  importInp.accept = ".obj,.stl";
  importInp.hidden = true;
  const btnImportMesh = Construct("button", "pill-btn", [ConstructGlyph("Upload"), Construct("span", null, "Mesh")]);
  btnImportMesh.type = "button";
  btnImportMesh.addEventListener("click", () => importInp.click());

  const btnExportAll = Construct("button", "pill-btn accent", [ConstructGlyph("Download"), Construct("span", null, "Export PBR")]);
  btnExportAll.type = "button";

  const gpuPill = Construct("span", "gpu-badge", [document.createElement("i"), Construct("span", null, "GPU Paint")]);

  toolbar.append(
    toolGroup,
    btnToolMenu,
    meshSelect,
    vpSelect,
    chanSelect,
    gpuPill,
    Construct("div", "toolbar-spacer"),
    btnUndo,
    btnRedo,
    btnImportMesh,
    importInp,
    btnExportAll,
  );

  const stage = Construct("div", "viewport-stage");
  const splitBox = Construct("div", "viewport-split-2d");
  splitBox.style.cssText = "position:relative;z-index:2;background:transparent;";
  const pane3D = Construct("div", "viewport-split-pane");
  pane3D.style.cssText = "background:transparent;";
  pane3D.append(Construct("span", "pane-badge", "3D Surface Viewport"));
  const pane2D = Construct("div", "viewport-split-pane");
  pane2D.style.cssText = "background:transparent;cursor:crosshair;";
  pane2D.append(Construct("span", "pane-badge", "2D UV Texture Canvas"));

  const uvStampOverlay = Construct("div", "uv-stamp-overlay");
  pane2D.append(uvStampOverlay);

  splitBox.append(pane3D, pane2D);
  const hudHelp = Construct("div", "viewport-hud-bottom", "Drag mesh to paint · V = Move/Scale/Rotate Stamps · Right-click or Q/Tab = Tool Inspector · B/E/G/S/I/V tools");
  stage.append(splitBox, hudHelp);
  centerCol.append(toolbar, stage);

  // RIGHT: LAYER INSPECTOR (Right-click or Q opens Brush & Tool Inspector cleanly without clutter)
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Layer Inspector"),
      Construct("span", "panel-heading-meta", "19-CH GPU PBR"),
    ]),
  );
  const rightScroll = Construct("div", "panel-scroll");
  const rightInner = Construct("div", "panel-scroll-inner");
  rightScroll.append(rightInner);
  rightCol.append(
    rightScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "Zero-Readback GPU Compositing"),
      Construct("span", null, "Live Undo/Redo"),
    ]),
  );

  grid.append(leftCol, centerCol, rightCol);
  root.append(grid);
  SmoothScroll(leftScroll, leftInner);
  SmoothScroll(rightScroll, rightInner);

  // ----------------------------------------------------------------- THREE.JS UNIFIED GPU STAGE
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;";
  stage.prepend(renderer.domElement);

  const gpuPaint = new GpuPaintSession(renderer, res);
  const gpuLabel = gpuPill.querySelector("span");
  if (gpuLabel) gpuLabel.textContent = gpuPaint.isActive ? "WebGL2 GPU" : "CPU Mock";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e0f12");
  const envTex = createPaintEnv(renderer);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
  camera.position.set(2.9, 2.0, 3.6);
  const orbit = new OrbitControls(camera, pane3D);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.target.set(0, 0.08, 0);

  const keyL = new THREE.DirectionalLight("#fff8eb", 2.3);
  keyL.position.set(3.5, 4.8, 3.8);
  const fillL = new THREE.DirectionalLight("#a8c6ff", 0.95);
  fillL.position.set(-4, 2, -3);
  const hemiL = new THREE.HemisphereLight("#eef3ff", "#1a1a1f", 0.65);
  scene.add(keyL, fillL, hemiL);

  // 2D GPU UV View Scene (renders directly from GPU VRAM textures, zero readPixels!)
  const uvScene = new THREE.Scene();
  uvScene.background = new THREE.Color("#0b0c0f");
  const uvCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  uvCam.position.z = 5;
  const UV_QUAD_EXTENT = 1.76; // [-0.88 .. +0.88] square
  const uvQuadMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const uvQuadMesh = new THREE.Mesh(new THREE.PlaneGeometry(UV_QUAD_EXTENT, UV_QUAD_EXTENT), uvQuadMat);
  uvScene.add(uvQuadMesh);
  let uvWireLines = null;

  // CPU fallback textures (used ONLY in headless Node mock without real WebGL2!)
  const fallbackAlbTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  fallbackAlbTex.colorSpace = THREE.SRGBColorSpace; fallbackAlbTex.flipY = true; fallbackAlbTex.needsUpdate = true;
  const fallbackRoughTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  fallbackRoughTex.flipY = true; fallbackRoughTex.needsUpdate = true;
  const fallbackMetalTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  fallbackMetalTex.flipY = true; fallbackMetalTex.needsUpdate = true;
  const fallbackNormalTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  fallbackNormalTex.flipY = true; fallbackNormalTex.needsUpdate = true;

  const paintMat = new THREE.MeshPhysicalMaterial({
    map: gpuPaint.isActive ? gpuPaint.displayAlbedoRT.texture : fallbackAlbTex,
    roughnessMap: gpuPaint.isActive ? gpuPaint.finalOrmhRT.texture : fallbackRoughTex,
    metalnessMap: gpuPaint.isActive ? gpuPaint.finalOrmhRT.texture : fallbackMetalTex,
    normalMap: gpuPaint.isActive ? gpuPaint.finalNormalRT.texture : fallbackNormalTex,
    roughness: 1.0,
    metalness: 1.0,
    normalScale: new THREE.Vector2(0.85, 0.85),
    emissive: new THREE.Color("#000000"),
    emissiveIntensity: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.2,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffffff"),
    iridescence: 0,
    iridescenceThicknessMinimum: 100,
    iridescenceThicknessMaximum: 550,
    specularIntensity: 1,
    transmission: 0,
    thickness: 0,
    anisotropy: 0,
    transparent: false,
  });

  let paintMesh = null;
  let wireOverlay = null;
  let lastCpuComp = null;
  let prevExtBitmask = "";

  // 3D Brush Ring Reticle + 3D Stamp Transform Gizmo Frame
  const ringPts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0.008));
  }
  const brushRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: "#eff4cf", transparent: true, opacity: 0.92, depthTest: false }),
  );
  brushRing.renderOrder = 999;
  brushRing.visible = false;
  scene.add(brushRing);

  const stampGizmoPts = [
    new THREE.Vector3(-1, -1, 0.012), new THREE.Vector3(1, -1, 0.012),
    new THREE.Vector3(1, 1, 0.012), new THREE.Vector3(-1, 1, 0.012),
    new THREE.Vector3(-1, -1, 0.012), new THREE.Vector3(0, 1, 0.012),
    new THREE.Vector3(0, 1.32, 0.012),
  ];
  const stampGizmo3D = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(stampGizmoPts),
    new THREE.LineBasicMaterial({ color: "#6ea8ff", transparent: true, opacity: 0.95, depthTest: false }),
  );
  stampGizmo3D.renderOrder = 998;
  stampGizmo3D.visible = false;
  scene.add(stampGizmo3D);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  // ----------------------------------------------------------------- MESH & GPU COMPOSITOR
  function buildUvWireGeometry(geo) {
    const uvAttr = geo.attributes.uv;
    const idx = geo.index ? geo.index.array : null;
    const pos = geo.attributes.position;
    const triCount = idx ? idx.length / 3 : pos.count / 3;
    const verts = new Float32Array(triCount * 6 * 3);
    const half = UV_QUAD_EXTENT * 0.5;
    let o = 0;
    const pushSeg = (u0, v0, u1, v1) => {
      verts[o++] = u0 * UV_QUAD_EXTENT - half; verts[o++] = v0 * UV_QUAD_EXTENT - half; verts[o++] = 0.02;
      verts[o++] = u1 * UV_QUAD_EXTENT - half; verts[o++] = v1 * UV_QUAD_EXTENT - half; verts[o++] = 0.02;
    };
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx[t * 3] : t * 3;
      const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
      const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const u0 = uvAttr.getX(i0), v0 = uvAttr.getY(i0);
      const u1 = uvAttr.getX(i1), v1 = uvAttr.getY(i1);
      const u2 = uvAttr.getX(i2), v2 = uvAttr.getY(i2);
      pushSeg(u0, v0, u1, v1);
      pushSeg(u1, v1, u2, v2);
      pushSeg(u2, v2, u0, v0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return lg;
  }

  function rebuildPaintMesh(customGeometry = null) {
    meshGeo = customGeometry || buildPaintTargetGeometry(state.meshId);
    meshIndex = buildMeshPaintIndex(meshGeo);
    meshCues = buildDefaultMeshCues(meshGeo, meshIndex, res);
    if (paintMesh) { scene.remove(paintMesh); paintMesh.geometry.dispose(); }
    if (wireOverlay) { scene.remove(wireOverlay); wireOverlay.geometry.dispose(); }
    if (uvWireLines) { uvScene.remove(uvWireLines); uvWireLines.geometry.dispose(); }

    paintMesh = new THREE.Mesh(meshGeo, paintMat);
    scene.add(paintMesh);

    wireOverlay = new THREE.LineSegments(
      new THREE.WireframeGeometry(meshGeo),
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.14 }),
    );
    wireOverlay.visible = state.wireframe;
    scene.add(wireOverlay);

    uvWireLines = new THREE.LineSegments(
      buildUvWireGeometry(meshGeo),
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18 }),
    );
    uvScene.add(uvWireLines);

    if (gpuPaint.isActive) {
      gpuPaint.uploadMeshCues(meshCues, state.doc.bakedMaps);
    }

    refreshComposite();
    rebuildInspector();
  }

  function getActiveLayer() {
    return state.doc.layers.find((l) => l.id === state.doc.selectedLayerId) || state.doc.layers[0];
  }

  function getSelectedStamp(layer = getActiveLayer(), fallbackDocSearch = false) {
    if (layer?.stamps?.length) {
      const s = layer.stamps.find((x) => x.id === layer.selectedStampId) || layer.stamps[0];
      if (s) return { layer, stamp: s };
    }
    if (fallbackDocSearch) {
      for (let i = state.doc.layers.length - 1; i >= 0; i--) {
        const l = state.doc.layers[i];
        if (l.visible && l.stamps?.length) {
          const s = l.stamps.find((x) => x.id === l.selectedStampId) || l.stamps[0];
          if (s) return { layer: l, stamp: s };
        }
      }
    }
    return null;
  }

  function getAnyExtendedChannelsMask() {
    const out = {};
    for (const k of EXTENDED_PBR_KEYS) out[k] = false;
    for (const l of state.doc.layers) {
      if (!l.visible) continue;
      if (l.channels) {
        for (const k of EXTENDED_PBR_KEYS) if (l.channels[k]) out[k] = true;
      }
      if (l.stamps?.some((s) => s.visible && s.channels)) {
        for (const s of l.stamps) {
          if (s.visible && s.channels) {
            for (const k of EXTENDED_PBR_KEYS) if (s.channels[k]) out[k] = true;
          }
        }
      }
      if (l.pixels?.extValues) {
        for (const k of Object.keys(l.pixels.extValues)) out[k] = true;
      }
    }
    return out;
  }

  function update3DStampGizmo() {
    const found = getSelectedStamp(getActiveLayer(), state.brush.tool === "move");
    if (!found || !found.stamp.visible || state.viewportMode === "2d") {
      stampGizmo3D.visible = false;
      return;
    }
    const st = found.stamp;
    let posArr = st.anchorPos;
    let normArr = st.anchorNormal;
    if (st.projection !== "3d" && meshCues) {
      const surf = lookupSurfaceAtUv(meshCues, st.u ?? 0.5, st.v ?? 0.5);
      if (surf) { posArr = surf.pos; normArr = surf.normal; }
    }
    if (!posArr || !normArr) {
      stampGizmo3D.visible = false;
      return;
    }
    const p = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
    const n = new THREE.Vector3(normArr[0], normArr[1], normArr[2]).normalize();
    const upRef = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const rgt = new THREE.Vector3().crossVectors(upRef, n).normalize();
    const btg = new THREE.Vector3().crossVectors(n, rgt).normalize();
    const rotRad = ((st.rotation || 0) * Math.PI) / 180;
    const basis = new THREE.Matrix4().makeBasis(rgt, btg, n);
    const qRot = new THREE.Quaternion().setFromAxisAngle(n, -rotRad);
    stampGizmo3D.position.copy(p).addScaledVector(n, 0.01);
    stampGizmo3D.quaternion.setFromRotationMatrix(basis).premultiply(qRot);
    const sx = Math.max(0.02, (st.scale ?? 0.28) * (st.scaleX ?? 1));
    const sy = Math.max(0.02, (st.scale ?? 0.28) * (st.scaleY ?? 1));
    stampGizmo3D.scale.set(sx, sy, 1);
    stampGizmo3D.visible = state.brush.tool === "move" || found.layer.kind === "decal";
  }

  let activeGizmoDrag = null;

  function renderUvStampGizmo() {
    uvStampOverlay.innerHTML = "";
    if (state.viewportMode === "3d" || typeof pane2D.getBoundingClientRect !== "function") return;
    const found = getSelectedStamp(getActiveLayer(), state.brush.tool === "move");
    if (!found || !found.stamp.visible) return;
    const rect = pane2D.getBoundingClientRect();
    if (!rect || rect.width <= 4 || rect.height <= 4) return;
    const st = found.stamp;
    const halfSide = Math.min(rect.width, rect.height) * 0.44;
    const cxPane = rect.width * 0.5;
    const cyPane = rect.height * 0.5;
    const u = st.u ?? 0.5;
    const v = st.v ?? 0.5;
    const xPx = cxPane + (u - 0.5) * 2 * halfSide;
    const yPx = cyPane + (0.5 - v) * 2 * halfSide;
    const wPx = Math.max(18, (st.scale ?? 0.28) * (st.scaleX ?? 1) * 2 * halfSide * 2);
    const hPx = Math.max(18, (st.scale ?? 0.28) * (st.scaleY ?? 1) * 2 * halfSide * 2);

    const box = Construct("div", "uv-stamp-box");
    box.style.width = `${wPx}px`;
    box.style.height = `${hPx}px`;
    box.style.left = `${xPx - wPx * 0.5}px`;
    box.style.top = `${yPx - hPx * 0.5}px`;
    box.style.transform = `rotate(${-(st.rotation || 0)}deg)`;

    const centerDot = Construct("div", "uv-stamp-center");
    const rotKnob = Construct("div", "uv-stamp-rot");
    rotKnob.title = "Drag to Rotate Stamp";
    box.append(centerDot, rotKnob);

    for (const corner of ["nw", "ne", "sw", "se"]) {
      const h = Construct("div", `uv-stamp-handle ${corner}`);
      h.title = "Drag corner to Scale Stamp (Shift = Free Aspect)";
      h.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (found.layer.locked) return;
        st.projection = "uv";
        activeGizmoDrag = {
          mode: "scale",
          layer: found.layer,
          stamp: st,
          centerX: rect.left + xPx,
          centerY: rect.top + yPx,
          halfSide,
          startDist: Math.max(8, Math.hypot(e.clientX - (rect.left + xPx), e.clientY - (rect.top + yPx))),
          startScale: st.scale ?? 0.28,
          startSX: st.scaleX ?? 1,
          startSY: st.scaleY ?? 1,
          startDx: Math.abs(e.clientX - (rect.left + xPx)) || 1,
          startDy: Math.abs(e.clientY - (rect.top + yPx)) || 1,
        };
      });
      box.append(h);
    }

    rotKnob.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (found.layer.locked) return;
      activeGizmoDrag = {
        mode: "rotate",
        layer: found.layer,
        stamp: st,
        centerX: rect.left + xPx,
        centerY: rect.top + yPx,
      };
    });

    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target !== box) return;
      e.stopPropagation();
      e.preventDefault();
      if (found.layer.locked) return;
      st.projection = "uv";
      activeGizmoDrag = {
        mode: "move",
        layer: found.layer,
        stamp: st,
        halfSide,
        startX: e.clientX,
        startY: e.clientY,
        startU: st.u ?? 0.5,
        startV: st.v ?? 0.5,
      };
    });

    uvStampOverlay.append(box);
  }

  window.addEventListener("pointermove", (e) => {
    if (!activeGizmoDrag) return;
    const d = activeGizmoDrag;
    const st = d.stamp;
    if (d.mode === "move") {
      st.u = d.startU + (e.clientX - d.startX) / (2 * Math.max(1, d.halfSide));
      st.v = d.startV - (e.clientY - d.startY) / (2 * Math.max(1, d.halfSide));
      const surf = meshCues ? lookupSurfaceAtUv(meshCues, st.u, st.v) : null;
      if (surf) { st.anchorPos = surf.pos; st.anchorNormal = surf.normal; }
    } else if (d.mode === "scale") {
      if (e.shiftKey) {
        const rx = Math.max(0.2, Math.min(3.5, (Math.abs(e.clientX - d.centerX) / d.startDx) * d.startSX));
        const ry = Math.max(0.2, Math.min(3.5, (Math.abs(e.clientY - d.centerY) / d.startDy) * d.startSY));
        st.scaleX = rx;
        st.scaleY = ry;
      } else {
        const curDist = Math.max(6, Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY));
        st.scale = Math.max(0.025, Math.min(1.6, d.startScale * (curDist / d.startDist)));
      }
    } else if (d.mode === "rotate") {
      const ang = (Math.atan2(-(e.clientY - d.centerY), e.clientX - d.centerX) * 180) / Math.PI - 90;
      st.rotation = ((ang + 540) % 360) - 180;
    }
    refreshComposite();
  });

  window.addEventListener("pointerup", () => {
    if (!activeGizmoDrag) return;
    activeGizmoDrag = null;
    Broadcast();
  });

  function refreshComposite() {
    if (!meshCues || disposed) return;

    const extMask = getAnyExtendedChannelsMask();
    const isLit = state.viewChannel === "lit";

    if (gpuPaint.isActive) {
      const out = gpuPaint.composite(state.doc, {
        hasLiveStroke,
        liveBrush: state.brush,
        viewChannel: state.viewChannel,
      });
      if (out) {
        paintMat.map = out.albedoTex;
        if (isLit) {
          paintMat.roughnessMap = out.ormhTex;
          paintMat.metalnessMap = out.ormhTex;
          paintMat.normalMap = out.normalTex;
          paintMat.roughness = 1.0;
          paintMat.metalness = 1.0;

          const ext = out.ext;
          const hasEm = !!(ext && (extMask.emissive || extMask.emissiveIntensity));
          const hasCoat = !!(ext && (extMask.clearcoat || extMask.coatRoughness));
          const hasSheen = !!(ext && (extMask.sheen || extMask.sheenRoughness));
          const hasIrid = !!(ext && (extMask.iridescence || extMask.iridescenceThickness));
          const hasTrans = !!(ext && (extMask.transmission || extMask.thickness));
          const hasAo = !!(ext && extMask.ao);
          const hasOp = !!(ext && extMask.opacity);
          const hasSpec = !!(ext && extMask.specular);
          const hasAniso = !!(ext && extMask.anisotropy);

          paintMat.emissive.set(hasEm ? "#ffffff" : "#000000");
          paintMat.emissiveIntensity = hasEm ? 1.0 : 0.0;
          paintMat.emissiveMap = hasEm ? ext.emissiveSpecTex : null;

          paintMat.clearcoat = hasCoat ? 1.0 : 0.0;
          paintMat.clearcoatRoughness = hasCoat ? 1.0 : 0.2;
          paintMat.clearcoatMap = hasCoat ? ext.coatSheenTex : null;
          paintMat.clearcoatRoughnessMap = hasCoat ? ext.coatSheenTex : null;

          paintMat.sheen = hasSheen ? 1.0 : 0.0;
          paintMat.sheenRoughness = hasSheen ? 1.0 : 0.5;
          paintMat.sheenRoughnessMap = hasSheen ? ext.coatSheenTex : null;

          paintMat.iridescence = hasIrid ? 1.0 : 0.0;
          paintMat.iridescenceMap = hasIrid ? ext.iridTex : null;
          paintMat.iridescenceThicknessMap = hasIrid ? ext.iridTex : null;

          paintMat.transmission = hasTrans ? 1.0 : 0.0;
          paintMat.thickness = hasTrans ? 2.0 : 0.0;
          paintMat.transmissionMap = hasTrans ? ext.transThickTex : null;
          paintMat.thicknessMap = hasTrans ? ext.transThickTex : null;

          paintMat.aoMap = hasAo ? ext.aoAlphaTex : null;
          paintMat.aoMapIntensity = hasAo ? 1.0 : 0.0;

          paintMat.alphaMap = hasOp ? ext.aoAlphaTex : null;
          paintMat.transparent = hasOp;

          paintMat.specularIntensityMap = hasSpec ? ext.emissiveSpecTex : null;
          paintMat.anisotropy = hasAniso ? 1.0 : 0.0;
          paintMat.anisotropyMap = hasAniso ? ext.anisoTex : null;

          const sig = `${hasEm}|${hasCoat}|${hasSheen}|${hasIrid}|${hasTrans}|${hasAo}|${hasOp}|${hasSpec}|${hasAniso}`;
          if (sig !== prevExtBitmask) {
            prevExtBitmask = sig;
            paintMat.needsUpdate = true;
          }
        } else {
          paintMat.roughnessMap = null;
          paintMat.metalnessMap = null;
          paintMat.normalMap = null;
          paintMat.emissiveMap = null;
          paintMat.emissiveIntensity = 0;
          paintMat.clearcoatMap = null;
          paintMat.clearcoatRoughnessMap = null;
          paintMat.clearcoat = 0;
          paintMat.sheenRoughnessMap = null;
          paintMat.sheen = 0;
          paintMat.iridescenceMap = null;
          paintMat.iridescenceThicknessMap = null;
          paintMat.iridescence = 0;
          paintMat.transmissionMap = null;
          paintMat.thicknessMap = null;
          paintMat.transmission = 0;
          paintMat.aoMap = null;
          paintMat.alphaMap = null;
          paintMat.transparent = false;
          paintMat.specularIntensityMap = null;
          paintMat.anisotropyMap = null;
          paintMat.anisotropy = 0;
          paintMat.roughness = 0.85;
          paintMat.metalness = 0.0;
          if (prevExtBitmask !== "solo") {
            prevExtBitmask = "solo";
            paintMat.needsUpdate = true;
          }
        }
        uvQuadMat.map = out.albedoTex;
        uvQuadMat.needsUpdate = true;
      }
      renderUvStampGizmo();
      update3DStampGizmo();
      return;
    }

    // CPU fallback (only active under Node mock WebGL test)
    const comp = compositePaintDocument(state.doc, meshCues, {
      liveStroke: activeCpuStroke,
      liveBrush: state.brush,
      viewChannel: state.viewChannel,
    });
    lastCpuComp = comp;
    fallbackAlbTex.image.data.set(comp.albedo); fallbackAlbTex.needsUpdate = true;
    fallbackNormalTex.image.data.set(comp.normal); fallbackNormalTex.needsUpdate = true;
    const rData = fallbackRoughTex.image.data, mData = fallbackMetalTex.image.data;
    for (let i = 0; i < res * res; i++) {
      const i4 = i * 4;
      rData[i4] = rData[i4 + 1] = rData[i4 + 2] = comp.roughness[i]; rData[i4 + 3] = 255;
      mData[i4] = mData[i4 + 1] = mData[i4 + 2] = comp.metalness[i]; mData[i4 + 3] = 255;
    }
    fallbackRoughTex.needsUpdate = true; fallbackMetalTex.needsUpdate = true;
    renderUvStampGizmo();
    update3DStampGizmo();
  }

  // ----------------------------------------------------------------- GPU / CPU UNDO & REDO
  function snapshotSelectedLayer() {
    const layer = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId);
    if (!layer) return null;
    if (gpuPaint.isActive) return gpuPaint.cloneLayerSnapshot(layer, !!state.doc.editingMask);
    return {
      layerId: layer.id,
      editingMask: !!state.doc.editingMask,
      pixels: layer.pixels ? clonePixels(layer.pixels) : null,
      maskPixels: layer.mask?.pixels ? new Uint8ClampedArray(layer.mask.pixels) : null,
    };
  }

  function pushUndoSnapshot(snap) {
    if (!snap) return;
    state.undoStack.push(snap);
    if (state.undoStack.length > 25) {
      const dropped = state.undoStack.shift();
      gpuPaint.disposeSnapshot(dropped);
    }
    for (const s of state.redoStack) gpuPaint.disposeSnapshot(s);
    state.redoStack.length = 0;
    syncUndoButtons();
  }

  function applySnapshot(snap) {
    const layer = state.doc.layers.find((l) => l.id === snap.layerId);
    if (!layer) return;
    if (gpuPaint.isActive) {
      gpuPaint.restoreLayerSnapshot(layer, snap);
    } else {
      if (snap.pixels && layer.pixels) layer.pixels = clonePixels(snap.pixels);
      if (snap.maskPixels && layer.mask) layer.mask.pixels = new Uint8ClampedArray(snap.maskPixels);
    }
    refreshComposite();
  }

  function syncUndoButtons() {
    btnUndo.disabled = state.undoStack.length === 0;
    btnRedo.disabled = state.redoStack.length === 0;
  }

  btnUndo.addEventListener("click", () => {
    if (!state.undoStack.length) return;
    const prev = state.undoStack.pop();
    const cur = snapshotSelectedLayer();
    if (cur) state.redoStack.push(cur);
    applySnapshot(prev);
    syncUndoButtons();
    Toast("Undid paint operation");
  });
  btnRedo.addEventListener("click", () => {
    if (!state.redoStack.length) return;
    const next = state.redoStack.pop();
    const cur = snapshotSelectedLayer();
    if (cur) state.undoStack.push(cur);
    applySnapshot(next);
    syncUndoButtons();
    Toast("Redid paint operation");
  });

  // ----------------------------------------------------------------- 3D RAYCAST + GPU PAINT + STAMP TRANSFORM HANDLERS
  function raycastMeshFromEvent(e) {
    if (!paintMesh) return null;
    const rect = pane3D.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(paintMesh, false);
    return hits.length ? hits[0] : null;
  }

  function updateHoverCursor(hit) {
    if (!hit || state.brush.tool === "eyedropper" || state.brush.tool === "move") {
      brushRing.visible = false;
      return;
    }
    const n = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    brushRing.visible = true;
    brushRing.position.copy(hit.point).addScaledVector(n, 0.008);
    brushRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    brushRing.scale.setScalar(state.brush.tool === "stamp" ? state.brush.stampScale : state.brush.size);
  }

  function getTargetPaintableLayer(autoCreatePaint = true) {
    let layer = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId);
    if (!layer || (layer.kind !== "paint" && !state.doc.editingMask)) {
      if (state.doc.editingMask && layer && layer.mask) return layer;
      if (!autoCreatePaint) return null;
      const newPaint = createPaintLayer("paint", { res, name: "Paint Stroke Layer" });
      state.doc.layers.push(newPaint);
      state.doc.selectedLayerId = newPaint.id;
      renderLeftColumn();
      rebuildInspector();
      Toast("Added active Paint Layer for brush stroke");
      return newPaint;
    }
    return layer;
  }

  function placeMovableStamp({ projection = "3d", hit = null, uv = null, stampData = state.brush.stampData, stampName = state.brush.stampName } = {}) {
    if (!stampData) return null;
    let targetLayer = getActiveLayer();
    if (!targetLayer || targetLayer.kind === "folder" || state.stampPlaceMode === "layer") {
      targetLayer = createPaintLayer("decal", { res, name: `${stampName || "Stamp"} Layer` });
      state.doc.layers.push(targetLayer);
      state.doc.selectedLayerId = targetLayer.id;
    }
    if (targetLayer.locked) { Toast("Target layer is locked"); return null; }
    if (!targetLayer.stamps) targetLayer.stamps = [];

    const surf = projection === "3d" && hit
      ? {
          pos: [hit.point.x, hit.point.y, hit.point.z],
          normal: hit.face
            ? (() => { const n = hit.face.normal.clone().transformDirection(paintMesh.matrixWorld).normalize(); return [n.x, n.y, n.z]; })()
            : [0, 0, 1],
        }
      : (meshCues && uv ? lookupSurfaceAtUv(meshCues, uv.u, uv.v) : null);

    const inst = createStampInstance({
      name: stampName || "Stamp",
      projection,
      u: uv?.u ?? hit?.uv?.x ?? 0.5,
      v: uv?.v ?? hit?.uv?.y ?? 0.5,
      anchorPos: surf?.pos || [0, 0.2, 1.0],
      anchorNormal: surf?.normal || [0, 0, 1],
      scale: state.brush.stampScale ?? 0.28,
      rotation: state.brush.stampRotation ?? 0,
      opacity: state.brush.stampOpacity ?? 1.0,
      heightStrength: state.brush.stampHeightStrength ?? 0.5,
      tint: state.brush.stampTint || "#ffffff",
      stampData,
      channels: { ...getToolChannels(state.brush) },
      extValues: { ...state.brush.extValues },
    });
    targetLayer.stamps.push(inst);
    targetLayer.selectedStampId = inst.id;
    renderLeftColumn();
    rebuildInspector();
    refreshComposite();
    return { layer: targetLayer, stamp: inst };
  }

  function dabAlongSegment3D(pStart, pEnd, normal) {
    const layer = getTargetPaintableLayer(true);
    const partFilter = layer?.partFilter ?? -1;
    const dist = pStart.distanceTo(pEnd);
    const spFrac = Math.max(0.06, Math.min(1.0, state.brush.spacing ?? 0.22));
    const step = Math.max(0.01, state.brush.size * spFrac);
    const steps = Math.max(1, Math.min(24, Math.ceil(dist / step)));
    const temp = new THREE.Vector3();
    const dir = new THREE.Vector3().subVectors(pEnd, pStart);
    const nUnit = normal.clone().normalize();
    const upRef = Math.abs(nUnit.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tang = new THREE.Vector3().crossVectors(upRef, nUnit).normalize();
    const bitang = new THREE.Vector3().crossVectors(nUnit, tang).normalize();
    const followAngleDeg = dir.lengthSq() > 1e-6
      ? (Math.atan2(dir.dot(bitang), dir.dot(tang)) * 180) / Math.PI
      : 0;

    const strokeSpeed = Math.min(1, dist / Math.max(0.02, state.brush.size * 2.2));
    for (let s = 0; s <= steps; s++) {
      temp.lerpVectors(pStart, pEnd, steps === 0 ? 1 : s / steps);
      const curIdx = strokeDabIndex++;
      const strokeT = Math.min(1, curIdx / Math.max(8, state.brush.colourDynamics.gradientLength || 48));
      const dabBrush = resolveDabVariation(state.brush, strokeT, strokeSeedCounter++, followAngleDeg, {
        dabIndex: curIdx,
        speed: strokeSpeed,
      });
      const dabPos = temp.clone()
        .addScaledVector(tang, dabBrush.scatterU * state.brush.size)
        .addScaledVector(bitang, dabBrush.scatterV * state.brush.size);
      const dabRadius = Math.max(0.012, state.brush.size * dabBrush.sizeScale);

      if (gpuPaint.isActive) {
        gpuPaint.dabStroke({
          mode: "3d",
          hitPos: dabPos,
          hitNormal: normal,
          worldRadius: dabRadius,
          brush: dabBrush,
          partFilter,
          seed: strokeSeedCounter,
        });
      } else {
        applyBrushDab3D({
          strokeAccum: activeCpuStroke,
          meshIndex,
          cues: meshCues,
          hitPos: dabPos,
          hitNormal: normal,
          worldRadius: dabRadius,
          brush: dabBrush,
          activePartFilter: partFilter,
        });
      }
    }
    refreshComposite();
  }

  function dabAlongSegment2D(uvStart, uvEnd) {
    const layer = getTargetPaintableLayer(false);
    const partFilter = layer?.partFilter ?? -1;
    const baseUvRad = state.brush.pixelRadius / res;
    const distUv = Math.hypot(uvEnd.u - uvStart.u, uvEnd.v - uvStart.v);
    const spFrac = Math.max(0.06, Math.min(1.0, state.brush.spacing ?? 0.22));
    const stepUv = Math.max(0.004, baseUvRad * spFrac);
    const steps = Math.max(1, Math.min(24, Math.ceil(distUv / stepUv)));
    const followAngleDeg = distUv > 1e-5
      ? (Math.atan2(-(uvEnd.v - uvStart.v), uvEnd.u - uvStart.u) * 180) / Math.PI
      : 0;

    const strokeSpeed = Math.min(1, distUv / Math.max(0.006, baseUvRad * 2.2));
    for (let s = 0; s <= steps; s++) {
      const f = steps === 0 ? 1 : s / steps;
      const mu = uvStart.u + (uvEnd.u - uvStart.u) * f;
      const mv = uvStart.v + (uvEnd.v - uvStart.v) * f;
      const curIdx = strokeDabIndex++;
      const strokeT = Math.min(1, curIdx / Math.max(8, state.brush.colourDynamics.gradientLength || 48));
      const dabBrush = resolveDabVariation(state.brush, strokeT, strokeSeedCounter++, followAngleDeg, {
        dabIndex: curIdx,
        speed: strokeSpeed,
      });
      const du = Math.max(0, Math.min(1, mu + dabBrush.scatterU * baseUvRad));
      const dv = Math.max(0, Math.min(1, mv + dabBrush.scatterV * baseUvRad));
      const dabUvRad = Math.max(0.004, baseUvRad * dabBrush.sizeScale);
      const dabPxRad = Math.max(2, state.brush.pixelRadius * dabBrush.sizeScale);

      if (gpuPaint.isActive) {
        gpuPaint.dabStroke({
          mode: "2d",
          uv: { x: du, y: dv },
          uvRadius: dabUvRad,
          brush: dabBrush,
          partFilter,
          seed: strokeSeedCounter,
        });
      } else if (activeCpuStroke) {
        applyBrushDabUV({
          strokeAccum: activeCpuStroke,
          cues: meshCues,
          u: du,
          v: dv,
          pixelRadius: dabPxRad,
          brush: dabBrush,
          activePartFilter: partFilter,
        });
      }
    }
    refreshComposite();
  }

  function performEyedropperAtUv(u, v) {
    const s = gpuPaint.isActive
      ? gpuPaint.samplePixel(u, v)
      : (lastCpuComp ? sampleCompositedAtUV(lastCpuComp, u, v) : null);
    if (!s) return;
    state.brush.color = s.color;
    state.brush.roughness = s.roughness;
    state.brush.metalness = s.metalness;
    state.brush.height = s.height;
    Broadcast();
    Toast(`Sampled ${s.color}`);
  }

  function performFillAtUv(layer, u, v) {
    const snap = snapshotSelectedLayer();
    const px = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
    const py = Math.min(res - 1, Math.max(0, Math.floor((1 - v) * res)));
    const pid = py * res + px;
    const ok = applyFloodFill({
      layer,
      cues: meshCues,
      hitTriIndex: pid,
      scope: state.fillScope,
      brush: state.brush,
      editingMask: state.doc.editingMask,
    });
    if (ok) {
      if (gpuPaint.isActive) {
        if (state.doc.editingMask) gpuPaint.syncMaskCpuToGpu(layer);
        else gpuPaint.syncCpuPixelsToLayerGpu(layer);
      }
      pushUndoSnapshot(snap);
      refreshComposite();
      Toast(`Filled ${state.fillScope} scope`);
    } else {
      gpuPaint.disposeSnapshot(snap);
    }
  }

  let pendingUndoSnap = null;
  let rightDownPos3D = null;
  let rightDownPos2D = null;
  let activeStamp3DDrag = null;
  let activeStamp2DDrag = null;

  pane3D.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      rightDownPos3D = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (activeToolPopup && !activeToolPopup.contains(e.target)) closeToolPopup();
    const hit = raycastMeshFromEvent(e);
    if (!hit) {
      orbit.enabled = true;
      return;
    }

    // Move / Scale / Rotate Stamps smoothly across the 3D surface!
    if (state.brush.tool === "move") {
      const found = getSelectedStamp(getActiveLayer(), true);
      if (!found || found.layer.locked) return;
      orbit.enabled = false;
      state.doc.selectedLayerId = found.layer.id;
      found.layer.selectedStampId = found.stamp.id;
      activeStamp3DDrag = {
        layer: found.layer,
        stamp: found.stamp,
        mode: e.shiftKey ? "scale" : e.altKey ? "rotate" : "move",
        startX: e.clientX,
        startY: e.clientY,
        startScale: found.stamp.scale ?? 0.28,
        startRot: found.stamp.rotation ?? 0,
      };
      if (activeStamp3DDrag.mode === "move") {
        const n = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld).normalize() : new THREE.Vector3(0, 0, 1);
        found.stamp.projection = "3d";
        found.stamp.anchorPos = [hit.point.x, hit.point.y, hit.point.z];
        found.stamp.anchorNormal = [n.x, n.y, n.z];
        if (hit.uv) { found.stamp.u = hit.uv.x; found.stamp.v = hit.uv.y; }
        refreshComposite();
      }
      pane3D.setPointerCapture(e.pointerId);
      return;
    }

    if (e.altKey) return;

    if (state.brush.tool === "eyedropper") {
      if (hit.uv) performEyedropperAtUv(hit.uv.x, hit.uv.y);
      return;
    }

    // Stamp tool places a movable, scalable, rotatable stamp on click & lets user drag to position it!
    if (state.brush.tool === "stamp") {
      orbit.enabled = false;
      const placed = placeMovableStamp({ projection: "3d", hit });
      if (placed) {
        activeStamp3DDrag = { layer: placed.layer, stamp: placed.stamp, mode: "move", startX: e.clientX, startY: e.clientY };
        pane3D.setPointerCapture(e.pointerId);
        Toast(`Placed "${placed.stamp.name}" · drag to position or press V to Transform`);
      }
      return;
    }

    const layer = getTargetPaintableLayer(true);
    if (!layer || layer.locked) return;

    if (state.brush.tool === "fill") {
      if (hit.uv) performFillAtUv(layer, hit.uv.x, hit.uv.y);
      return;
    }

    orbit.enabled = false;
    isPainting3D = true;
    hasLiveStroke = true;
    strokeDabIndex = 0;
    pendingUndoSnap = snapshotSelectedLayer();
    if (gpuPaint.isActive) gpuPaint.beginStroke();
    else activeCpuStroke = createStrokeAccumulator(res);
    smoothedHit3D = hit.point.clone();
    lastHitPos = hit.point.clone();
    const norm = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    dabAlongSegment3D(hit.point, hit.point, norm);
    pane3D.setPointerCapture(e.pointerId);
  }, { capture: true });

  pane3D.addEventListener("pointermove", (e) => {
    const hit = raycastMeshFromEvent(e);
    updateHoverCursor(hit);
    if (hit && meshIndex && hit.uv) {
      const pid = Math.min(res * res - 1, Math.max(0, Math.floor((1 - hit.uv.y) * res) * res + Math.floor(hit.uv.x * res)));
      const partIdx = meshCues.partAt[pid];
      const partName = partIdx >= 0 ? (meshIndex.partNames[partIdx] || `Part ${partIdx}`) : "Surface";
      state.hoverInfo = `${partName} · UV (${hit.uv.x.toFixed(2)}, ${hit.uv.y.toFixed(2)})`;
    }
    if (activeStamp3DDrag) {
      const d = activeStamp3DDrag;
      if (d.mode === "move" && hit) {
        const n = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld).normalize() : new THREE.Vector3(0, 0, 1);
        d.stamp.projection = "3d";
        d.stamp.anchorPos = [hit.point.x, hit.point.y, hit.point.z];
        d.stamp.anchorNormal = [n.x, n.y, n.z];
        if (hit.uv) { d.stamp.u = hit.uv.x; d.stamp.v = hit.uv.y; }
      } else if (d.mode === "scale") {
        d.stamp.scale = Math.max(0.025, Math.min(1.6, d.startScale * Math.exp((e.clientX - d.startX) * 0.008)));
      } else if (d.mode === "rotate") {
        d.stamp.rotation = ((d.startRot + (e.clientX - d.startX) * 0.8 + 540) % 360) - 180;
      }
      refreshComposite();
      return;
    }
    if (!isPainting3D || !hit) return;
    const stab = Math.max(0, Math.min(0.85, state.brush.stabilizer ?? 0));
    smoothedHit3D = smoothedHit3D ? smoothedHit3D.lerp(hit.point, 1 - stab) : hit.point.clone();
    const norm = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    dabAlongSegment3D(lastHitPos || smoothedHit3D, smoothedHit3D, norm);
    lastHitPos = smoothedHit3D.clone();
  });

  pane3D.addEventListener("wheel", (e) => {
    if (state.brush.tool !== "move") return;
    const found = getSelectedStamp(getActiveLayer(), true);
    if (!found || found.layer.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    found.stamp.scale = Math.max(0.025, Math.min(1.6, (found.stamp.scale ?? 0.28) * factor));
    refreshComposite();
    Broadcast();
  }, { passive: false, capture: true });

  const endStroke3D = () => {
    if (activeStamp3DDrag) {
      activeStamp3DDrag = null;
      orbit.enabled = true;
      Broadcast();
      return;
    }
    if (!isPainting3D) return;
    isPainting3D = false;
    orbit.enabled = true;
    const layer = getTargetPaintableLayer(false);
    let committed = false;
    if (layer) {
      if (gpuPaint.isActive) committed = gpuPaint.commitStrokeToLayer(layer, state.brush, state.doc.editingMask);
      else if (activeCpuStroke) committed = commitStrokeAccumulator(layer, activeCpuStroke, state.brush, state.doc.editingMask);
    }
    if (committed && pendingUndoSnap) pushUndoSnapshot(pendingUndoSnap);
    else gpuPaint.disposeSnapshot(pendingUndoSnap);
    hasLiveStroke = false;
    activeCpuStroke = null;
    lastHitPos = null;
    smoothedHit3D = null;
    pendingUndoSnap = null;
    refreshComposite();
  };
  pane3D.addEventListener("pointerup", endStroke3D);
  pane3D.addEventListener("pointercancel", endStroke3D);

  // Synchronized 2D UV Canvas Painting + Stamp Transform!
  function uvFromPaneEvent(e) {
    const rect = pane2D.getBoundingClientRect();
    const halfSide = Math.min(rect.width, rect.height) * 0.44;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const u = Math.max(-0.25, Math.min(1.25, ((e.clientX - cx) / Math.max(1, halfSide)) * 0.5 + 0.5));
    const v = Math.max(-0.25, Math.min(1.25, 0.5 - ((e.clientY - cy) / Math.max(1, halfSide)) * 0.5));
    return { u, v };
  }

  pane2D.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      rightDownPos2D = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (activeToolPopup && !activeToolPopup.contains(e.target)) closeToolPopup();
    const { u, v } = uvFromPaneEvent(e);
    const uClamped = Math.max(0, Math.min(1, u));
    const vClamped = Math.max(0, Math.min(1, v));

    if (state.brush.tool === "move") {
      const found = getSelectedStamp(getActiveLayer(), true);
      if (!found || found.layer.locked) return;
      state.doc.selectedLayerId = found.layer.id;
      found.layer.selectedStampId = found.stamp.id;
      found.stamp.projection = "uv";
      found.stamp.u = u;
      found.stamp.v = v;
      activeStamp2DDrag = { layer: found.layer, stamp: found.stamp };
      refreshComposite();
      pane2D.setPointerCapture(e.pointerId);
      return;
    }

    if (state.brush.tool === "eyedropper") { performEyedropperAtUv(uClamped, vClamped); return; }

    if (state.brush.tool === "stamp") {
      const placed = placeMovableStamp({ projection: "uv", uv: { u, v } });
      if (placed) {
        activeStamp2DDrag = { layer: placed.layer, stamp: placed.stamp };
        pane2D.setPointerCapture(e.pointerId);
        Toast(`Placed "${placed.stamp.name}" in UV · drag gizmo handles to resize/rotate`);
      }
      return;
    }

    const layer = getTargetPaintableLayer(true);
    if (!layer || layer.locked) return;
    if (state.brush.tool === "fill") { performFillAtUv(layer, uClamped, vClamped); return; }

    isPainting2D = true;
    hasLiveStroke = true;
    strokeDabIndex = 0;
    pendingUndoSnap = snapshotSelectedLayer();
    smoothedUv2D = { u: uClamped, v: vClamped };
    lastUv2D = { u: uClamped, v: vClamped };
    if (gpuPaint.isActive) gpuPaint.beginStroke();
    else activeCpuStroke = createStrokeAccumulator(res);
    dabAlongSegment2D({ u: uClamped, v: vClamped }, { u: uClamped, v: vClamped });
    pane2D.setPointerCapture(e.pointerId);
  });

  pane2D.addEventListener("pointermove", (e) => {
    if (activeStamp2DDrag) {
      const pt = uvFromPaneEvent(e);
      const st = activeStamp2DDrag.stamp;
      st.projection = "uv";
      st.u = pt.u;
      st.v = pt.v;
      const surf = meshCues ? lookupSurfaceAtUv(meshCues, st.u, st.v) : null;
      if (surf) { st.anchorPos = surf.pos; st.anchorNormal = surf.normal; }
      refreshComposite();
      return;
    }
    if (!isPainting2D) return;
    const rawPt = uvFromPaneEvent(e);
    const pt = { u: Math.max(0, Math.min(1, rawPt.u)), v: Math.max(0, Math.min(1, rawPt.v)) };
    const stab = Math.max(0, Math.min(0.85, state.brush.stabilizer ?? 0));
    smoothedUv2D = smoothedUv2D
      ? { u: smoothedUv2D.u + (pt.u - smoothedUv2D.u) * (1 - stab), v: smoothedUv2D.v + (pt.v - smoothedUv2D.v) * (1 - stab) }
      : pt;
    dabAlongSegment2D(lastUv2D || smoothedUv2D, smoothedUv2D);
    lastUv2D = { ...smoothedUv2D };
  });

  const endStroke2D = () => {
    if (activeStamp2DDrag) {
      activeStamp2DDrag = null;
      Broadcast();
      return;
    }
    if (!isPainting2D) return;
    isPainting2D = false;
    const layer = getTargetPaintableLayer(false);
    let committed = false;
    if (layer) {
      if (gpuPaint.isActive) committed = gpuPaint.commitStrokeToLayer(layer, state.brush, state.doc.editingMask);
      else if (activeCpuStroke) committed = commitStrokeAccumulator(layer, activeCpuStroke, state.brush, state.doc.editingMask);
    }
    if (committed && pendingUndoSnap) pushUndoSnapshot(pendingUndoSnap);
    else gpuPaint.disposeSnapshot(pendingUndoSnap);
    hasLiveStroke = false;
    activeCpuStroke = null;
    lastUv2D = null;
    smoothedUv2D = null;
    pendingUndoSnap = null;
    refreshComposite();
  };
  pane2D.addEventListener("pointerup", endStroke2D);
  pane2D.addEventListener("pointercancel", endStroke2D);

  // ----------------------------------------------------------------- ACTIVE TOOL CONTEXT POPUP (RIGHT-CLICK / Q / TAB)
  function closeToolPopup() {
    if (activeToolPopup) {
      activeToolPopup.remove?.();
      activeToolPopup = null;
    }
    btnToolMenu.classList.remove("active");
  }

  function makePopupSlider(parent, label, min, max, step, unit, getVal, setVal) {
    const wrap = Construct("div", "property-row");
    const head = Construct("div", null);
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#b4b6be;margin-bottom:4px;";
    const valSpan = Construct("span", null, `${Number(getVal()).toFixed(step >= 1 ? 0 : 2)}${unit}`);
    valSpan.style.fontFamily = "var(--mono)";
    head.append(Construct("span", null, label), valSpan);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(getVal());
    inp.className = "pill-range";
    inp.style.width = "100%";
    const syncFrac = (v) => inp.style.setProperty("--fraction", String((v - min) / Math.max(1e-5, max - min)));
    syncFrac(getVal());
    inp.addEventListener("input", () => {
      const v = Number(inp.value);
      setVal(v);
      valSpan.textContent = `${v.toFixed(step >= 1 ? 0 : 2)}${unit}`;
      syncFrac(v);
      Broadcast();
    });
    wrap.append(head, inp);
    parent.append(wrap);
  }

  function openToolPopup(clientX = null, clientY = null, forceRefresh = false) {
    if (activeToolPopup && !forceRefresh) {
      closeToolPopup();
      return;
    }
    const prevLeft = activeToolPopup?.style.left;
    const prevTop = activeToolPopup?.style.top;
    if (activeToolPopup) activeToolPopup.remove?.();

    const box = stage.getBoundingClientRect();
    const pop = Construct("div", "tool-popup-menu");
    const px = clientX ?? (box.left + box.width * 0.5 - 188);
    const py = clientY ?? (box.top + 56);
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    pop.style.left = forceRefresh && prevLeft ? prevLeft : `${Math.max(12, Math.min(px, vw - 392))}px`;
    pop.style.top = forceRefresh && prevTop ? prevTop : `${Math.max(12, Math.min(py, vh - 540))}px`;

    const closeBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Close"));
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeToolPopup);
    pop.append(
      Construct("div", "tool-popup-head", [
        ConstructGlyph(
          state.brush.tool === "erase" ? "Eraser"
            : state.brush.tool === "fill" ? "Fill"
              : state.brush.tool === "stamp" ? "Stamp"
                : state.brush.tool === "move" ? "Move"
                  : state.brush.tool === "eyedropper" ? "Pipette"
                    : "Brush",
        ),
        Construct("strong", null, `${TOOL_LABELS[state.brush.tool] || "Active"} Inspector`),
        Construct("small", null, "Right-Click / Q / Esc"),
        closeBtn,
      ]),
    );

    // Quick tool switcher tabs (indices [0..4] preserved; Move appended at [5])
    const tabs = Construct("div", "tool-popup-tabs");
    for (const [id, label, glyph] of [
      ["paint", "Brush", "Brush"],
      ["erase", "Erase", "Eraser"],
      ["fill", "Fill", "Fill"],
      ["stamp", "Stamp", "Stamp"],
      ["eyedropper", "Pick", "Pipette"],
      ["move", "Move", "Move"],
    ]) {
      const tb = Construct("button", "tool-popup-tab" + (state.brush.tool === id ? " active" : ""), [
        ConstructGlyph(glyph),
        Construct("span", null, label),
      ]);
      tb.type = "button";
      tb.addEventListener("click", () => {
        selectTool(id);
        openToolPopup(null, null, true);
      });
      tabs.append(tb);
    }
    pop.append(tabs);

    const makePopupToggle = (parent, label, getVal, setVal) => {
      const Row = Construct("div", "property-row toggle-row", [
        Construct("span", "property-label", label),
      ]);
      const Input = document.createElement("input");
      Input.type = "checkbox";
      Input.checked = !!getVal();
      Input.addEventListener("change", () => { setVal(Input.checked); Broadcast(); });
      Row.append(Construct("label", "switch", [Input, Construct("span")]));
      parent.append(Row);
    };

    const appendExtendedBrushChannelSliders = (parent, channelMask, valuesObj) => {
      if (!channelMask || !valuesObj) return;
      for (const chDef of PAINT_PBR_CHANNELS) {
        if (!chDef.extended || chDef.key === "normal" || !channelMask[chDef.key]) continue;
        if (chDef.isColor) {
          ColorRow(parent, {
            Label: `${chDef.label} Tint`,
            Transient: true,
            Read: () => valuesObj[chDef.key] || chDef.defaultVal,
            Write: (v) => { valuesObj[chDef.key] = v; Broadcast(); },
          });
        } else {
          makePopupSlider(
            parent,
            chDef.label,
            chDef.min ?? 0,
            chDef.max ?? 1,
            chDef.step ?? 0.01,
            "",
            () => valuesObj[chDef.key] ?? chDef.defaultVal,
            (v) => { valuesObj[chDef.key] = v; },
          );
        }
      }
    };

    const tool = state.brush.tool;

    if (tool === "paint") {
      // Sub-tabs: Tip & PBR | Colour Dynamics | Curves (only for Paint Brush!)
      const subTabs = Construct("div", "tool-popup-subtabs");
      for (const [sid, sLabel] of [["main", "Tip & PBR"], ["dynamics", "Colour Dynamics"], ["curves", "Curves"]]) {
        const sb = Construct("button", "tool-popup-subtab" + (state.popupSubTab === sid ? " active" : ""), sLabel);
        sb.type = "button";
        sb.addEventListener("click", () => {
          state.popupSubTab = sid;
          openToolPopup(null, null, true);
        });
        subTabs.append(sb);
      }
      pop.append(subTabs);

      if (state.popupSubTab === "main") {
        ChannelMaskRow(pop, {
          Label: "Paint PBR Channels",
          Channels: PAINT_PBR_CHANNEL_ROWS,
          StrictPresence: true,
          Transient: true,
          Read: () => state.brush.paintChannels,
          Write: (next) => {
            state.brush.paintChannels = next;
            Broadcast();
            openToolPopup(null, null, true);
          },
        });

        const tipRow = Construct("div", "chip-strip");
        for (const [label, key] of [["Round", "round"], ["Chisel", "chisel"], ["Chalk", "chalk"], ["Splatter", "splatter"], ["Sponge", "sponge"], ["Custom Img", "custom"]]) {
          const cb = Construct("button", "chip-btn" + (state.brush.tip === key ? " active" : ""), label);
          cb.type = "button";
          cb.addEventListener("click", () => {
            if (key === "custom" && !state.brush.customTipData) {
              triggerAddImage("tip");
              return;
            }
            state.brush.tip = key;
            rebuildInspector();
            openToolPopup(null, null, true);
          });
          tipRow.append(cb);
        }
        const addTipBtn = Construct("button", "chip-btn", [ConstructGlyph("Image"), Construct("span", null, "+ Image")]);
        addTipBtn.type = "button";
        addTipBtn.addEventListener("click", () => triggerAddImage("tip"));
        tipRow.append(addTipBtn);
        pop.append(Construct("div", "property-label", state.brush.tip === "custom" && state.brush.customTipName ? `Brush Tip (${state.brush.customTipName})` : "Brush Tip Shape"), tipRow);

        const swRow = Construct("div", "tool-popup-swatches");
        for (const hex of QUICK_SWATCHES) {
          const sw = Construct("button", "tool-popup-swatch" + (state.brush.color.toLowerCase() === hex ? " active" : ""));
          sw.type = "button";
          sw.style.background = hex;
          sw.title = hex;
          sw.addEventListener("click", () => {
            state.brush.color = hex;
            rebuildInspector();
            openToolPopup(null, null, true);
          });
          swRow.append(sw);
        }
        const cInp = document.createElement("input");
        cInp.type = "color"; cInp.value = state.brush.color; cInp.className = "color-native";
        cInp.addEventListener("input", () => { state.brush.color = cInp.value; Broadcast(); });
        swRow.append(cInp);
        pop.append(Construct("div", "property-label", "Ink Color"), swRow);

        makePopupSlider(pop, "Brush Size", 0.03, 0.9, 0.01, "m", () => state.brush.size, (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); });
        makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
        makePopupSlider(pop, "Flow", 0.05, 1, 0.01, "", () => state.brush.flow, (v) => { state.brush.flow = v; });
        makePopupSlider(pop, "Hardness", 0.05, 0.98, 0.01, "", () => state.brush.hardness, (v) => { state.brush.hardness = v; });
        makePopupSlider(pop, "Tip Angle", -180, 180, 1, "°", () => state.brush.angle, (v) => { state.brush.angle = v; });
        makePopupSlider(pop, "Tip Roundness", 0.15, 1.0, 0.01, "", () => state.brush.roundness, (v) => { state.brush.roundness = v; });
        makePopupSlider(pop, "Roughness", 0.02, 1, 0.01, "", () => state.brush.roughness, (v) => { state.brush.roughness = v; });
        makePopupSlider(pop, "Metalness", 0, 1, 0.01, "", () => state.brush.metalness, (v) => { state.brush.metalness = v; });
        makePopupSlider(pop, "Height Relief", -1, 1, 0.02, "", () => state.brush.height, (v) => { state.brush.height = v; });
        appendExtendedBrushChannelSliders(pop, state.brush.paintChannels, state.brush.extValues);
      } else if (state.popupSubTab === "dynamics") {
        pop.append(Construct("div", "property-label", "Stroke & Lazy Mouse"));
        makePopupSlider(pop, "Spacing", 0.06, 1.0, 0.01, "", () => state.brush.spacing, (v) => { state.brush.spacing = v; });
        makePopupSlider(pop, "Stabilizer", 0, 0.85, 0.02, "", () => state.brush.stabilizer, (v) => { state.brush.stabilizer = v; });
        makePopupToggle(pop, "Follow Stroke Direction", () => state.brush.followDirection, (v) => { state.brush.followDirection = v; });

        pop.append(Construct("div", "property-label", "Tip Jitter & Scatter"));
        makePopupSlider(pop, "Size Jitter", 0, 0.9, 0.01, "", () => state.brush.jitter.size, (v) => { state.brush.jitter.size = v; });
        makePopupSlider(pop, "Angle Jitter", 0, 180, 1, "°", () => state.brush.jitter.angle, (v) => { state.brush.jitter.angle = v; });
        makePopupSlider(pop, "Position Scatter", 0, 1.5, 0.02, "r", () => state.brush.jitter.scatter, (v) => { state.brush.jitter.scatter = v; });
        makePopupSlider(pop, "Flow Jitter", 0, 0.8, 0.01, "", () => state.brush.jitter.flow, (v) => { state.brush.jitter.flow = v; });

        pop.append(Construct("div", "property-label", "Colour Dynamics"));
        FilterDropdownPill(pop, {
          Label: "Colour Mode",
          Prefix: "Mode:",
          Placeholder: "Filter colour modes...",
          Transient: true,
          Options: COLOUR_DYNAMIC_MODES,
          Read: () => state.brush.colourDynamics.mode,
          Write: (v) => {
            state.brush.colourDynamics.mode = v;
            Broadcast();
            openToolPopup(null, null, true);
          },
        });

        const cdMode = state.brush.colourDynamics.mode;
        if (cdMode === "stroke-gradient" || cdMode === "multicolour" || cdMode === "multicolour-cycle") {
          FilterDropdownPill(pop, {
            Label: "Gradient / Palette Preset",
            Prefix: "Palette:",
            Placeholder: "Filter palettes...",
            Transient: true,
            Options: COLOUR_GRADIENT_PRESETS,
            Read: () => state.brush.colourDynamics.gradientPreset,
            Write: (id, opt) => {
              state.brush.colourDynamics.gradientPreset = id;
              if (opt?.stops) {
                state.brush.colourDynamics.gradientStops = [...opt.stops];
                state.brush.colourDynamics.paletteColors = [...opt.stops];
              }
              Broadcast();
              openToolPopup(null, null, true);
            },
          });
          MultiColourRow(pop, {
            Label: cdMode === "stroke-gradient" ? "Gradient Colour Stops" : "Multicolour Palette",
            Transient: true,
            Read: () => (cdMode === "stroke-gradient" ? state.brush.colourDynamics.gradientStops : state.brush.colourDynamics.paletteColors),
            Write: (list) => {
              if (cdMode === "stroke-gradient") state.brush.colourDynamics.gradientStops = list;
              else state.brush.colourDynamics.paletteColors = list;
              Broadcast();
            },
          });
          if (cdMode === "stroke-gradient") {
            makePopupSlider(pop, "Gradient Span (Dabs)", 6, 120, 1, "", () => state.brush.colourDynamics.gradientLength, (v) => { state.brush.colourDynamics.gradientLength = v; });
            const wrapRow = Construct("div", "chip-strip");
            for (const [wLabel, wKey] of [["Ping-Pong", "pingpong"], ["Loop", "loop"], ["Clamp", "clamp"]]) {
              const wb = Construct("button", "chip-btn" + (state.brush.colourDynamics.gradientWrap === wKey ? " active" : ""), wLabel);
              wb.type = "button";
              wb.addEventListener("click", () => {
                state.brush.colourDynamics.gradientWrap = wKey;
                Broadcast();
                openToolPopup(null, null, true);
              });
              wrapRow.append(wb);
            }
            pop.append(Construct("div", "property-label", "Gradient Wrap"), wrapRow);
          }
        } else if (cdMode === "temperature") {
          makePopupSlider(pop, "Warm ↔ Cool Shift", 0, 1, 0.02, "", () => state.brush.colourDynamics.temperatureShift, (v) => { state.brush.colourDynamics.temperatureShift = v; });
        }

        FilterDropdownPill(pop, {
          Label: "Opacity Dynamics",
          Prefix: "Opacity:",
          Placeholder: "Filter opacity modes...",
          Transient: true,
          Options: OPACITY_DYNAMIC_MODES,
          Read: () => state.brush.colourDynamics.opacityMode,
          Write: (v) => {
            state.brush.colourDynamics.opacityMode = v;
            Broadcast();
            openToolPopup(null, null, true);
          },
        });
        makePopupSlider(pop, "Opacity Jitter", 0, 0.95, 0.01, "", () => state.brush.colourDynamics.opacityJitter, (v) => { state.brush.colourDynamics.opacityJitter = v; });
        if (state.brush.colourDynamics.opacityMode !== "constant") {
          makePopupSlider(pop, "Min Opacity Floor", 0.02, 1, 0.01, "", () => state.brush.colourDynamics.opacityMin, (v) => { state.brush.colourDynamics.opacityMin = v; });
        }
        makePopupSlider(pop, "Hue Jitter", 0, 1, 0.01, "", () => state.brush.colourDynamics.hueJitter, (v) => { state.brush.colourDynamics.hueJitter = v; });
        makePopupSlider(pop, "Saturation Jitter", 0, 0.8, 0.01, "", () => state.brush.colourDynamics.satJitter, (v) => { state.brush.colourDynamics.satJitter = v; });
        makePopupSlider(pop, "Value Jitter", 0, 0.8, 0.01, "", () => state.brush.colourDynamics.valJitter, (v) => { state.brush.colourDynamics.valJitter = v; });
        makePopupToggle(pop, "Hue Shift Over Stroke Curve", () => state.brush.colourDynamics.strokeGradient, (v) => { state.brush.colourDynamics.strokeGradient = v; });
      } else {
        const cTabs = Construct("div", "chip-strip");
        for (const [ck, cLabel] of [["falloff", "Tip Falloff"], ["sizeOverStroke", "Size"], ["opacityOverStroke", "Opacity"], ["hueOverStroke", "Hue Shift"]]) {
          const cb = Construct("button", "chip-btn" + (state.activeCurveKey === ck ? " active" : ""), cLabel);
          cb.type = "button";
          cb.addEventListener("click", () => {
            state.activeCurveKey = ck;
            openToolPopup(null, null, true);
          });
          cTabs.append(cb);
        }
        pop.append(Construct("div", "property-label", "Response Curve Target"), cTabs);
        CurveRow(pop, {
          Label: state.activeCurveKey === "falloff" ? "Radial Tip Falloff" : state.activeCurveKey === "sizeOverStroke" ? "Size Over Stroke" : state.activeCurveKey === "opacityOverStroke" ? "Opacity Over Stroke" : "Hue Shift Over Stroke",
          Detail: "Drag points · Click add · Right-click del",
          Transient: true,
          Read: () => state.brush.curves[state.activeCurveKey],
          Write: (pts) => { state.brush.curves[state.activeCurveKey] = pts; Broadcast(); },
        });
      }
    } else if (tool === "erase") {
      ChannelMaskRow(pop, {
        Label: "Erase PBR Channels",
        Channels: PAINT_PBR_CHANNEL_ROWS,
        StrictPresence: true,
        Transient: true,
        Read: () => state.brush.eraseChannels,
        Write: (next) => {
          state.brush.eraseChannels = next;
          Broadcast();
        },
      });
      const tipRow = Construct("div", "chip-strip");
      for (const [label, key] of [["Round", "round"], ["Chisel", "chisel"], ["Chalk", "chalk"], ["Splatter", "splatter"], ["Sponge", "sponge"], ["Custom Img", "custom"]]) {
        const cb = Construct("button", "chip-btn" + (state.brush.tip === key ? " active" : ""), label);
        cb.type = "button";
        cb.addEventListener("click", () => {
          if (key === "custom" && !state.brush.customTipData) {
            triggerAddImage("tip");
            return;
          }
          state.brush.tip = key;
          rebuildInspector();
          openToolPopup(null, null, true);
        });
        tipRow.append(cb);
      }
      pop.append(Construct("div", "property-label", "Eraser Tip Shape"), tipRow);
      makePopupSlider(pop, "Eraser Size", 0.03, 0.9, 0.01, "m", () => state.brush.size, (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); });
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
      makePopupSlider(pop, "Flow", 0.05, 1, 0.01, "", () => state.brush.flow, (v) => { state.brush.flow = v; });
      makePopupSlider(pop, "Hardness", 0.05, 0.98, 0.01, "", () => state.brush.hardness, (v) => { state.brush.hardness = v; });
      makePopupSlider(pop, "Stabilizer", 0, 0.85, 0.02, "", () => state.brush.stabilizer, (v) => { state.brush.stabilizer = v; });
    } else if (tool === "fill") {
      const scRow = Construct("div", "chip-strip");
      for (const [label, sc] of [["Mesh Part", "part"], ["UV Island", "island"], ["Whole Mesh", "all"]]) {
        const b = Construct("button", "chip-btn" + (state.fillScope === sc ? " active" : ""), label);
        b.type = "button";
        b.addEventListener("click", () => { state.fillScope = sc; Broadcast(); openToolPopup(null, null, true); });
        scRow.append(b);
      }
      pop.append(Construct("div", "property-label", "Flood Fill Scope"), scRow);

      ChannelMaskRow(pop, {
        Label: "Fill PBR Channels",
        Channels: PAINT_PBR_CHANNEL_ROWS,
        StrictPresence: true,
        Transient: true,
        Read: () => state.brush.fillChannels,
        Write: (next) => { state.brush.fillChannels = next; Broadcast(); openToolPopup(null, null, true); },
      });

      const swRow = Construct("div", "tool-popup-swatches");
      for (const hex of QUICK_SWATCHES) {
        const sw = Construct("button", "tool-popup-swatch" + (state.brush.color.toLowerCase() === hex ? " active" : ""));
        sw.type = "button"; sw.style.background = hex;
        sw.addEventListener("click", () => { state.brush.color = hex; rebuildInspector(); openToolPopup(null, null, true); });
        swRow.append(sw);
      }
      pop.append(Construct("div", "property-label", "Fill Color"), swRow);
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
      makePopupSlider(pop, "Roughness", 0.02, 1, 0.01, "", () => state.brush.roughness, (v) => { state.brush.roughness = v; });
      makePopupSlider(pop, "Metalness", 0, 1, 0.01, "", () => state.brush.metalness, (v) => { state.brush.metalness = v; });
      makePopupSlider(pop, "Height Relief", -1, 1, 0.02, "", () => state.brush.height, (v) => { state.brush.height = v; });
      appendExtendedBrushChannelSliders(pop, state.brush.fillChannels, state.brush.extValues);
      const addFillImg = Construct("button", "action-button warm", [ConstructGlyph("Image"), Construct("span", null, "+ Add Fill Image Texture")]);
      addFillImg.type = "button";
      addFillImg.style.width = "100%";
      addFillImg.addEventListener("click", () => triggerAddImage("fill"));
      pop.append(addFillImg);
    } else if (tool === "stamp") {
      const modeRow = Construct("div", "chip-strip");
      for (const [mLbl, mKey] of [["On Active Layer", "subcomponent"], ["New Stamp Layer", "layer"]]) {
        const mb = Construct("button", "chip-btn" + (state.stampPlaceMode === mKey ? " active" : ""), mLbl);
        mb.type = "button";
        mb.addEventListener("click", () => { state.stampPlaceMode = mKey; openToolPopup(null, null, true); });
        modeRow.append(mb);
      }
      pop.append(Construct("div", "property-label", "Placement Target"), modeRow);

      ChannelMaskRow(pop, {
        Label: "Stamp PBR Channels",
        Channels: PAINT_PBR_CHANNEL_ROWS,
        StrictPresence: true,
        Transient: true,
        Read: () => state.brush.paintChannels,
        Write: (next) => { state.brush.paintChannels = next; Broadcast(); openToolPopup(null, null, true); },
      });
      const stampHead = Construct("div", null);
      stampHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;";
      const addStampImg = Construct("button", "chip-btn", [ConstructGlyph("Image"), Construct("span", null, "+ Add Image")]);
      addStampImg.type = "button";
      addStampImg.addEventListener("click", () => triggerAddImage("stamp"));
      stampHead.append(Construct("div", "property-label", `Stamp: ${state.brush.stampName}`), addStampImg);
      pop.append(stampHead);

      const gridBox = Construct("div", "tool-popup-stamp-grid");
      for (const sp of stampPreviews) {
        gridBox.append(
          createStampPreviewCard(sp, state.brush.stampName === sp.name, () => {
            state.brush.stampData = sp.evaluated;
            state.brush.stampName = sp.name;
            if (gpuPaint.isActive) gpuPaint.ensureStampTexture(sp.evaluated, false);
            Broadcast();
            openToolPopup(null, null, true);
            Toast(`Loaded stamp "${sp.name}"`);
          }),
        );
      }
      pop.append(gridBox);
      makePopupSlider(pop, "Stamp Scale", 0.04, 1.2, 0.01, "", () => state.brush.stampScale, (v) => { state.brush.stampScale = v; state.brush.size = v; });
      makePopupSlider(pop, "Rotation", -180, 180, 1, "°", () => state.brush.stampRotation, (v) => { state.brush.stampRotation = v; state.brush.angle = v; });
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.stampOpacity, (v) => { state.brush.stampOpacity = v; });
      makePopupSlider(pop, "Relief Height", -1, 1, 0.02, "", () => state.brush.stampHeightStrength, (v) => { state.brush.stampHeightStrength = v; });
      ColorRow(pop, { Label: "Stamp Tint", Transient: true, Read: () => state.brush.stampTint, Write: (v) => { state.brush.stampTint = v; Broadcast(); } });
    } else if (tool === "move") {
      const found = getSelectedStamp(getActiveLayer(), true);
      if (!found) {
        pop.append(Construct("p", "property-hint", "No stamps on active layer yet. Place a stamp with the Stamp tool (S) or click below to place one at center UV."));
        const addCenterBtn = Construct("button", "action-button accent", [ConstructGlyph("Stamp"), Construct("span", null, "+ Place Stamp at UV Center")]);
        addCenterBtn.type = "button";
        addCenterBtn.style.width = "100%";
        addCenterBtn.addEventListener("click", () => {
          placeMovableStamp({ projection: "uv", uv: { u: 0.5, v: 0.5 } });
          openToolPopup(null, null, true);
        });
        pop.append(addCenterBtn);
      } else {
        const st = found.stamp;
        const projRow = Construct("div", "chip-strip");
        for (const [pLbl, pKey] of [["UV Space", "uv"], ["3D Surface", "3d"]]) {
          const pb = Construct("button", "chip-btn" + (st.projection === pKey ? " active" : ""), pLbl);
          pb.type = "button";
          pb.addEventListener("click", () => { st.projection = pKey; refreshComposite(); openToolPopup(null, null, true); });
          projRow.append(pb);
        }
        pop.append(Construct("div", "property-label", `Transform: ${st.name}`), projRow);
        makePopupSlider(pop, "Position U", 0, 1, 0.005, "", () => st.u ?? 0.5, (v) => { st.u = v; const surf = meshCues ? lookupSurfaceAtUv(meshCues, st.u, st.v) : null; if (surf) { st.anchorPos = surf.pos; st.anchorNormal = surf.normal; } refreshComposite(); });
        makePopupSlider(pop, "Position V", 0, 1, 0.005, "", () => st.v ?? 0.5, (v) => { st.v = v; const surf = meshCues ? lookupSurfaceAtUv(meshCues, st.u, st.v) : null; if (surf) { st.anchorPos = surf.pos; st.anchorNormal = surf.normal; } refreshComposite(); });
        makePopupSlider(pop, "Uniform Scale", 0.025, 1.5, 0.01, "", () => st.scale ?? 0.28, (v) => { st.scale = v; refreshComposite(); });
        makePopupSlider(pop, "Scale X", 0.2, 2.5, 0.01, "x", () => st.scaleX ?? 1, (v) => { st.scaleX = v; refreshComposite(); });
        makePopupSlider(pop, "Scale Y", 0.2, 2.5, 0.01, "x", () => st.scaleY ?? 1, (v) => { st.scaleY = v; refreshComposite(); });
        makePopupSlider(pop, "Rotation", -180, 180, 1, "°", () => st.rotation ?? 0, (v) => { st.rotation = v; refreshComposite(); });
        makePopupSlider(pop, "Opacity", 0.02, 1, 0.01, "", () => st.opacity ?? 1, (v) => { st.opacity = v; refreshComposite(); });
        makePopupSlider(pop, "Height Gain", -1, 1.5, 0.02, "", () => st.heightStrength ?? 0.5, (v) => { st.heightStrength = v; refreshComposite(); });
        ColorRow(pop, { Label: "Tint Color", Transient: true, Read: () => st.tint || "#ffffff", Write: (v) => { st.tint = v; refreshComposite(); } });
        const actStrip = Construct("div", "chip-strip");
        const rstBtn = Construct("button", "chip-btn", "Reset Aspect");
        rstBtn.type = "button";
        rstBtn.addEventListener("click", () => { st.scaleX = 1; st.scaleY = 1; st.rotation = 0; refreshComposite(); openToolPopup(null, null, true); });
        const delBtn = Construct("button", "chip-btn", "Delete Stamp");
        delBtn.type = "button";
        delBtn.addEventListener("click", () => {
          found.layer.stamps = found.layer.stamps.filter((x) => x.id !== st.id);
          found.layer.selectedStampId = found.layer.stamps[0]?.id || null;
          renderLeftColumn();
          rebuildInspector();
          refreshComposite();
          openToolPopup(null, null, true);
        });
        actStrip.append(rstBtn, delBtn);
        pop.append(actStrip);
      }
    } else if (tool === "eyedropper") {
      const sampleCard = Construct("div", "object-heading");
      const dot = Construct("div", "object-symbol");
      dot.style.background = state.brush.color;
      sampleCard.append(
        dot,
        Construct("div", "object-heading-copy", [
          Construct("strong", null, state.brush.color),
          Construct("span", null, `ROUGH ${state.brush.roughness.toFixed(2)} · METAL ${state.brush.metalness.toFixed(2)}`),
        ]),
      );
      pop.append(sampleCard);
      const goBtn = Construct("button", "action-button accent", [ConstructGlyph("Brush"), Construct("span", null, "Paint with Sampled Color")]);
      goBtn.type = "button";
      goBtn.style.width = "100%";
      goBtn.addEventListener("click", () => { selectTool("paint"); closeToolPopup(); });
      pop.append(goBtn);
    }

    document.body.append(pop);
    activeToolPopup = pop;
    btnToolMenu.classList.add("active");
  }

  btnToolMenu.addEventListener("click", () => openToolPopup());

  pane3D.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const moved = rightDownPos3D ? Math.hypot(e.clientX - rightDownPos3D.x, e.clientY - rightDownPos3D.y) : 0;
    rightDownPos3D = null;
    if (moved < 5) openToolPopup(e.clientX, e.clientY);
  }, { capture: true });
  pane2D.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const moved = rightDownPos2D ? Math.hypot(e.clientX - rightDownPos2D.x, e.clientY - rightDownPos2D.y) : 0;
    rightDownPos2D = null;
    if (moved < 5) openToolPopup(e.clientX, e.clientY);
  }, { capture: true });

  rightCol.addEventListener("contextmenu", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target?.tagName)) return;
    e.preventDefault();
    openToolPopup(e.clientX, e.clientY);
  });

  // ----------------------------------------------------------------- LAYER ORDERING & LEFT COLUMN
  function moveLayerByOffset(layerId, deltaVisualUp) {
    // state.doc.layers is bottom-to-top compositing order (index 0 = bottom, index len-1 = top).
    const idx = state.doc.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    const nextIdx = idx + (deltaVisualUp > 0 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= state.doc.layers.length) return false;
    const [item] = state.doc.layers.splice(idx, 1);
    state.doc.layers.splice(nextIdx, 0, item);
    renderLeftColumn();
    rebuildInspector();
    refreshComposite();
    return true;
  }

  function moveLayerRelativeTo(sourceId, targetId, dropAboveInVisualStack) {
    if (!sourceId || sourceId === targetId) return false;
    const srcIdx = state.doc.layers.findIndex((l) => l.id === sourceId);
    const tgtIdx = state.doc.layers.findIndex((l) => l.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return false;
    const [item] = state.doc.layers.splice(srcIdx, 1);
    const newTgtIdx = state.doc.layers.findIndex((l) => l.id === targetId);
    // In top-down display: "above" target = higher compositing index (newTgtIdx + 1); "below" = lower (newTgtIdx).
    const insertAt = dropAboveInVisualStack ? newTgtIdx + 1 : newTgtIdx;
    state.doc.layers.splice(insertAt, 0, item);
    renderLeftColumn();
    rebuildInspector();
    refreshComposite();
    return true;
  }

  function selectTool(id) {
    state.brush.tool = id;
    for (const [k, b] of toolButtons.entries()) b.classList.toggle("active", k === id);
    rebuildInspector();
    refreshComposite();
    if (activeToolPopup) openToolPopup(null, null, true);
    Broadcast();
  }

  function renderLeftColumn() {
    leftInner.innerHTML = "";

    const addBar = Construct("div", "chip-strip");
    for (const [label, kind] of [
      ["+ Paint", "paint"],
      ["+ Fill", "fill"],
      ["+ Material", "material"],
      ["+ Stamp", "decal"],
      ["+ Wear Gen", "generator"],
      ["+ Folder", "folder"],
    ]) {
      const b = Construct("button", "chip-btn", label);
      b.type = "button";
      b.addEventListener("click", () => {
        const l = createPaintLayer(kind, {
          res,
          color: state.brush.color,
          fill: { color: state.brush.color, roughness: state.brush.roughness, metalness: state.brush.metalness, height: 0 },
        });
        if (kind === "decal" && state.brush.stampData) {
          const st = createStampInstance({
            name: state.brush.stampName || "Stamp",
            projection: "uv",
            u: 0.5,
            v: 0.5,
            scale: state.brush.stampScale ?? 0.28,
            rotation: state.brush.stampRotation ?? 0,
            opacity: state.brush.stampOpacity ?? 1.0,
            heightStrength: state.brush.stampHeightStrength ?? 0.5,
            tint: state.brush.stampTint || "#ffffff",
            stampData: state.brush.stampData,
          });
          l.stamps.push(st);
          l.selectedStampId = st.id;
        }
        state.doc.layers.push(l);
        state.doc.selectedLayerId = l.id;
        state.doc.editingMask = false;
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
      });
      addBar.append(b);
    }
    leftInner.append(addBar);

    const layersTopDown = [...state.doc.layers].reverse();
    for (let vIdx = 0; vIdx < layersTopDown.length; vIdx++) {
      const layer = layersTopDown[vIdx];
      const isSelected = layer.id === state.doc.selectedLayerId;
      const row = Construct("div", "stack-row" + (isSelected ? " active" : ""));
      row.draggable = true;
      row.dataset.layerId = layer.id;

      const handle = Construct("span", "stack-drag-handle", ConstructGlyph("Grip"));
      handle.title = "Drag to reorder layer";

      const thumb = Construct("div", "stack-row-thumb");
      if (layer.kind === "folder") thumb.append(ConstructGlyph("Folder"));
      else if (layer.kind === "generator") thumb.append(ConstructGlyph("Sparkles"));
      else if (layer.kind === "decal") thumb.append(ConstructGlyph("Stamp"));
      else if (layer.kind === "material") thumb.style.background = layer.material.color;
      else if (layer.kind === "fill") thumb.style.background = layer.fill.color;
      else thumb.append(ConstructGlyph("Brush"));

      const partTag = layer.partFilter >= 0 && meshIndex?.partNames[layer.partFilter] ? meshIndex.partNames[layer.partFilter] : "All";
      const enabledCount = layer.channels ? Object.values(layer.channels).filter(Boolean).length : 4;
      const chTag = layer.kind !== "folder" && enabledCount !== 4 ? ` · ${enabledCount}/19 ch` : "";
      const stpTag = layer.stamps?.length ? ` · ${layer.stamps.length} stp` : "";
      const sub = `${layer.kind.toUpperCase()} · ${layer.blend} · ${partTag}${chTag}${stpTag}`;
      if (layer.parentId) row.style.marginLeft = "14px";
      const info = Construct("div", "stack-row-info", [
        Construct("span", "stack-row-title", layer.name),
        Construct("span", "stack-row-sub", sub),
      ]);

      const orderBox = Construct("div", "stack-order-btns");
      const upBtn = Construct("button", "stack-order-btn", ConstructGlyph("ArrowUp"));
      upBtn.type = "button";
      upBtn.title = "Move layer up (Alt+↑)";
      upBtn.disabled = vIdx === 0;
      upBtn.addEventListener("click", (e) => { e.stopPropagation(); moveLayerByOffset(layer.id, +1); });

      const dnBtn = Construct("button", "stack-order-btn", ConstructGlyph("ArrowDown"));
      dnBtn.type = "button";
      dnBtn.title = "Move layer down (Alt+↓)";
      dnBtn.disabled = vIdx === layersTopDown.length - 1;
      dnBtn.addEventListener("click", (e) => { e.stopPropagation(); moveLayerByOffset(layer.id, -1); });
      orderBox.append(upBtn, dnBtn);

      const maskPill = Construct(
        "button",
        "mask-pill" + (layer.mask?.enabled ? (state.doc.editingMask && isSelected ? " active" : "") : ""),
        layer.mask?.enabled ? (state.doc.editingMask && isSelected ? "EDIT MSK" : "MSK") : "+MSK",
      );
      maskPill.type = "button";
      maskPill.title = "Add or Edit Layer Mask";
      maskPill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!layer.mask) {
          layer.mask = {
            enabled: true,
            invert: false,
            opacity: 1.0,
            generatorPreset: "none",
            generatorThreshold: 0.48,
            generatorSoftness: 0.16,
            generatorNoiseScale: 6.0,
            generatorNoiseMix: 0.25,
            featherRadius: 0,
            pixels: new Uint8ClampedArray(res * res).fill(255),
          };
          if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 1);
        } else {
          layer.mask.enabled = true;
        }
        state.doc.selectedLayerId = layer.id;
        state.doc.editingMask = !state.doc.editingMask;
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
      });

      const visBtn = Construct("button", "stack-mini-btn" + (layer.visible ? " on" : ""), ConstructGlyph(layer.visible ? "Eye" : "EyeOff"));
      visBtn.type = "button";
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        renderLeftColumn();
        refreshComposite();
      });

      const delBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Trash"));
      delBtn.type = "button";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.doc.layers.length <= 1) { Toast("Keep at least one layer"); return; }
        state.doc.layers = state.doc.layers.filter((l) => l.id !== layer.id);
        if (state.doc.selectedLayerId === layer.id) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
      });

      // Drag-and-drop events
      row.addEventListener("dragstart", (e) => {
        dragLayerId = layer.id;
        row.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", layer.id);
        }
      });
      row.addEventListener("dragend", () => {
        dragLayerId = null;
        row.classList.remove("dragging", "drop-above", "drop-below");
      });
      row.addEventListener("dragover", (e) => {
        if (!dragLayerId || dragLayerId === layer.id) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height * 0.5;
        row.classList.toggle("drop-above", above);
        row.classList.toggle("drop-below", !above);
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drop-above", "drop-below");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const src = dragLayerId || e.dataTransfer?.getData("text/plain");
        const r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height * 0.5;
        row.classList.remove("drop-above", "drop-below");
        if (src && src !== layer.id) moveLayerRelativeTo(src, layer.id, above);
      });

      row.append(handle, thumb, info, orderBox, maskPill, visBtn, delBtn);
      row.addEventListener("click", () => {
        state.doc.selectedLayerId = layer.id;
        state.doc.editingMask = false;
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
      });
      leftInner.append(row);
    }
  }

  function rebuildInspector() {
    if (inspectorScope) ReleaseScope(inspectorScope);
    inspectorScope = OpenScope();
    rightInner.innerHTML = "";

    const layer = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId) || state.doc.layers[0];
    const ensureLayerChannelState = (l) => {
      if (!l) return;
      if (!l.channels) l.channels = { albedo: true, roughness: true, metalness: true, height: true };
      if (!l.channelOpacity) l.channelOpacity = { albedo: 1, roughness: 1, metalness: 1, height: 1 };
      if (!l.channelBlends) l.channelBlends = { albedo: "Inherit", roughness: "Inherit", metalness: "Inherit", height: "Inherit" };
    };
    ensureLayerChannelState(layer);
    const activeChCount = layer?.channels ? PAINT_PBR_CHANNELS.filter((c) => !!layer.channels[c.key]).length : 4;

    if (
      state.inspectedLayerChannel !== "all" &&
      layer?.channels &&
      layer.channels[state.inspectedLayerChannel] === false
    ) {
      state.inspectedLayerChannel = "all";
    }

    rightInner.append(
      Construct("div", "object-heading", [
        Construct("div", "object-symbol", ConstructGlyph("Layers")),
        Construct("div", "object-heading-copy", [
          Construct("strong", null, layer ? layer.name : "No Layer"),
          Construct("span", null, state.doc.editingMask ? "EDITING LAYER MASK (WHITE=SHOW)" : `${layer?.kind?.toUpperCase() || "PAINT"} LAYER · LAYER INSPECTOR`),
        ]),
      ]),
    );

    MetricTrio(rightInner, [
      { Label: "GPU Canvas", Highlight: true, Read: () => ({ value: `${res}px`, sub: gpuPaint.isActive ? "WebGL2 RT" : "CPU Mock" }) },
      { Label: "Parts", Read: () => ({ value: String(meshIndex?.partNames?.length || 1), sub: `${meshIndex?.islandCount || 1} Islands` }) },
      { Label: "PBR Channels", Read: () => ({ value: `${activeChCount}/19`, sub: state.doc.bakedMaps ? "Baked AO" : "Live Layer" }) },
    ]);

    // Compact 1-row Active Tool launcher — keeps ALL brush/tool clutter in the Right-Click / Q inspector!
    const toolBarCard = Construct("div", "chip-strip");
    toolBarCard.style.cssText = "align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);";
    const activeToolLabel = TOOL_LABELS[state.brush.tool] || "Brush";
    const activeStampInfo = getSelectedStamp(layer, false);
    const activeSubMeta =
      state.brush.tool === "paint" ? `${state.brush.tip} · ${state.brush.color}`
        : state.brush.tool === "erase" ? `${state.brush.tip} eraser`
          : state.brush.tool === "fill" ? `${state.fillScope} fill`
            : state.brush.tool === "stamp" ? (state.brush.stampName || "Stamp")
              : state.brush.tool === "move" ? (activeStampInfo ? `${activeStampInfo.stamp.name}` : "Drag Stamp")
                : "Sample surface";
    const toolMetaCopy = Construct("div", null, [
      Construct("strong", null, `${activeToolLabel} Active`),
      Construct("div", null, `Right-click or Q for Brush Inspector · ${activeSubMeta}`),
    ]);
    toolMetaCopy.style.cssText = "font-size:11px;line-height:1.35;color:var(--muted);";
    const openBrushBtn = Construct("button", "chip-btn active", [ConstructGlyph("Sliders"), Construct("span", null, "Brush / Tool")]);
    openBrushBtn.type = "button";
    openBrushBtn.title = "Open Brush & Active Tool Inspector (Right-Click / Q)";
    openBrushBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = openBrushBtn.getBoundingClientRect();
      openToolPopup(r.left - 340, r.top);
    });
    toolBarCard.append(toolMetaCopy, openBrushBtn);
    rightInner.append(toolBarCard);

    if (layer) {
      const lSec = SectionCard(rightInner, { Title: `Layer Inspector: ${layer.name}`, Glyph: "Layers", Badge: layer.kind.toUpperCase(), Open: true });
      TextRow(lSec.Inner, { Label: "Layer Name", Read: () => layer.name, Write: (v) => { layer.name = v; renderLeftColumn(); } });
      SwitchRow(lSec.Inner, {
        Label: "Layer Visible",
        Read: () => layer.visible !== false,
        Write: (v) => { layer.visible = !!v; refreshComposite(); renderLeftColumn(); },
      });
      SwitchRow(lSec.Inner, {
        Label: "Lock Layer Edits",
        Read: () => !!layer.locked,
        Write: (v) => { layer.locked = !!v; renderLeftColumn(); },
      });

      const folders = state.doc.layers.filter((f) => f.kind === "folder" && f.id !== layer.id);
      if (layer.kind !== "folder" && folders.length) {
        SelectRow(lSec.Inner, {
          Label: "Parent Folder",
          Options: [["Top Level (None)", ""], ...folders.map((f) => [f.name, f.id])],
          Read: () => layer.parentId || "",
          Write: (v) => { layer.parentId = v || null; renderLeftColumn(); refreshComposite(); },
        });
      }

      if (layer.kind !== "folder") {
        FilterDropdownPill(lSec.Inner, {
          Label: "Master Blend Mode",
          Prefix: "Blend:",
          Placeholder: "Filter blend modes...",
          Options: ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => ({ value: b, label: b })),
          Read: () => layer.blend,
          Write: (v) => { layer.blend = v; refreshComposite(); renderLeftColumn(); },
        });
      }
      SliderRow(lSec.Inner, { Label: "Master Opacity", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.opacity, Write: (v) => { layer.opacity = v; refreshComposite(); } });
      const partOpts = [["All Mesh Parts", -1], ...(meshIndex?.partNames || ["Surface"]).map((n, i) => [n, i])];
      SelectRow(lSec.Inner, { Label: "Target Part Filter", Options: partOpts, Read: () => layer.partFilter ?? -1, Write: (v) => { layer.partFilter = Number(v); refreshComposite(); renderLeftColumn(); } });

      if (layer.kind !== "folder") {
        ChannelMaskRow(lSec.Inner, {
          Label: "Active PBR Channels",
          AddLabel: "Channel",
          Channels: PAINT_PBR_CHANNEL_ROWS,
          StrictPresence: true,
          Read: () => layer.channels,
          Write: (next) => {
            layer.channels = next;
            if (state.inspectedLayerChannel !== "all" && !next[state.inspectedLayerChannel]) {
              state.inspectedLayerChannel = "all";
            }
            refreshComposite();
            renderLeftColumn();
            rebuildInspector();
          },
        });

        const chTabDefs = [["All", "all"]];
        for (const cDef of PAINT_PBR_CHANNELS) {
          if (layer.channels?.[cDef.key]) chTabDefs.push([cDef.short, cDef.key]);
        }
        SegmentedRow(lSec.Inner, {
          Label: "Inspect Channel",
          Options: chTabDefs,
          Read: () => state.inspectedLayerChannel,
          Write: (v) => {
            state.inspectedLayerChannel = v;
            rebuildInspector();
          },
        });
      }

      const clearPaintLayerBuffers = () => {
        if (layer.locked) { Toast("Layer is locked"); return; }
        const snap = snapshotSelectedLayer();
        if (gpuPaint.isActive && layer._gpu) {
          gpuPaint._clearRT(layer._gpu.albedoRT, 0, 0, 0, 0);
          gpuPaint._clearRT(layer._gpu.ormhRT, 0.5, 0, 0.5, 0);
          gpuPaint._clearRT(layer._gpu.chanAlphaRT, 0, 0, 0, 0);
          if (layer._gpu.extValRT) {
            for (const rt of layer._gpu.extValRT) if (rt) gpuPaint._clearRT(rt, 0, 0, 0, 0);
          }
          if (layer._gpu.extAlphaRT) {
            for (const rt of layer._gpu.extAlphaRT) if (rt) gpuPaint._clearRT(rt, 0, 0, 0, 0);
          }
        }
        if (layer.pixels) {
          layer.pixels.albedo?.fill(0);
          layer.pixels.roughAlpha?.fill(0);
          layer.pixels.metalAlpha?.fill(0);
          layer.pixels.heightAlpha?.fill(0);
          if (layer.pixels.extValues) for (const k of Object.keys(layer.pixels.extValues)) layer.pixels.extValues[k]?.fill(0);
          if (layer.pixels.extAlphas) for (const k of Object.keys(layer.pixels.extAlphas)) layer.pixels.extAlphas[k]?.fill(0);
        }
        if (snap) pushUndoSnapshot(snap);
        refreshComposite();
        renderLeftColumn();
        Toast(`Cleared "${layer.name}"`);
      };

      const ch = state.inspectedLayerChannel;
      const CHAN_BLEND_OPTIONS = ["Inherit", "Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => ({
        value: b,
        label: b === "Inherit" ? "Inherit (Master)" : b,
      }));

      if (layer.kind !== "folder" && ch !== "all") {
        const chDef = PAINT_PBR_CHANNEL_MAP[ch];
        const chTitle = chDef?.label || (ch[0].toUpperCase() + ch.slice(1));
        SliderRow(lSec.Inner, {
          Label: `${chTitle} Channel Weight`,
          Minimum: 0,
          Maximum: 1,
          Step: 0.01,
          Read: () => layer.channelOpacity[ch] ?? 1,
          Write: (v) => { layer.channelOpacity[ch] = v; refreshComposite(); },
        });
        FilterDropdownPill(lSec.Inner, {
          Label: `${chTitle} Blend Override`,
          Prefix: "Blend:",
          Placeholder: "Filter channel blends...",
          Options: CHAN_BLEND_OPTIONS,
          Read: () => layer.channelBlends[ch] || "Inherit",
          Write: (v) => { layer.channelBlends[ch] = v; refreshComposite(); },
        });

        const getExtObj = () => {
          const target = layer.kind === "fill" ? layer.fill : layer.kind === "material" ? layer.material : layer.generator;
          if (!target.extValues) target.extValues = {};
          return target.extValues;
        };

        if (chDef?.extended) {
          if (ch === "normal") {
            SliderRow(lSec.Inner, {
              Label: "Height-to-Normal Gain",
              Minimum: 0,
              Maximum: 2.5,
              Step: 0.05,
              Read: () => (getExtObj().normal ?? 1.0),
              Write: (v) => { getExtObj().normal = v; refreshComposite(); },
            });
          } else if (layer.kind === "fill" || layer.kind === "material" || layer.kind === "generator") {
            if (chDef.isColor) {
              ColorRow(lSec.Inner, {
                Label: `${chTitle} Color`,
                Read: () => getExtObj()[ch] ?? chDef.defaultVal,
                Write: (v) => { getExtObj()[ch] = v; refreshComposite(); },
              });
            } else {
              SliderRow(lSec.Inner, {
                Label: `${chTitle} Value`,
                Minimum: chDef.min ?? 0,
                Maximum: chDef.max ?? 1,
                Step: chDef.step ?? 0.01,
                Read: () => getExtObj()[ch] ?? chDef.defaultVal,
                Write: (v) => { getExtObj()[ch] = v; refreshComposite(); },
              });
            }
          } else {
            ActionRow(lSec.Inner, [
              {
                Label: `Flood ${chTitle}`,
                Glyph: "Fill",
                Tone: "accent",
                Act: () => {
                  if (layer.locked) { Toast("Layer is locked"); return; }
                  const prevScope = state.fillScope;
                  const prevFillCh = state.brush.fillChannels;
                  state.fillScope = "all";
                  state.brush.fillChannels = { [ch]: true };
                  performFillAtUv(layer, 0.5, 0.5);
                  state.brush.fillChannels = prevFillCh;
                  state.fillScope = prevScope;
                },
              },
              { Label: "Clear Layer", Glyph: "Trash", Act: clearPaintLayerBuffers },
            ]);
          }
        } else if (layer.kind === "fill") {
          if (ch === "albedo") {
            ColorRow(lSec.Inner, { Label: "Fill Base Color", Read: () => layer.fill.color, Write: (v) => { layer.fill.color = v; refreshComposite(); renderLeftColumn(); } });
            if (layer.fill.patternData) {
              SliderRow(lSec.Inner, { Label: "Pattern Repeats", Minimum: 1, Maximum: 12, Step: 1, Read: () => layer.fill.patternRepeats || 3, Write: (v) => { layer.fill.patternRepeats = v; refreshComposite(); } });
              SliderRow(lSec.Inner, { Label: "Pattern Rotation", Minimum: -180, Maximum: 180, Step: 1, Unit: "°", Read: () => layer.fill.patternRotation || 0, Write: (v) => { layer.fill.patternRotation = v; refreshComposite(); } });
            }
          } else if (ch === "roughness") {
            SliderRow(lSec.Inner, { Label: "Fill Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.fill.roughness, Write: (v) => { layer.fill.roughness = v; refreshComposite(); } });
          } else if (ch === "metalness") {
            SliderRow(lSec.Inner, { Label: "Fill Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.fill.metalness, Write: (v) => { layer.fill.metalness = v; refreshComposite(); } });
          } else if (ch === "height") {
            SliderRow(lSec.Inner, { Label: "Fill Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.fill.height ?? 0, Write: (v) => { layer.fill.height = v; refreshComposite(); } });
            if (layer.fill.patternData) {
              SliderRow(lSec.Inner, { Label: "Pattern Height Gain", Minimum: 0, Maximum: 2.5, Step: 0.05, Read: () => layer.fill.patternHeightStrength ?? 1.0, Write: (v) => { layer.fill.patternHeightStrength = v; refreshComposite(); } });
            }
          }
        } else if (layer.kind === "material") {
          if (ch === "albedo") {
            ColorRow(lSec.Inner, { Label: "Material Tint", Read: () => layer.material.color, Write: (v) => { layer.material.color = v; refreshComposite(); renderLeftColumn(); } });
          } else if (ch === "roughness") {
            SliderRow(lSec.Inner, { Label: "Material Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.material.roughness, Write: (v) => { layer.material.roughness = v; refreshComposite(); } });
          } else if (ch === "metalness") {
            SliderRow(lSec.Inner, { Label: "Material Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.material.metalness, Write: (v) => { layer.material.metalness = v; refreshComposite(); } });
          } else if (ch === "height") {
            SliderRow(lSec.Inner, { Label: "Material Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.material.height ?? 0, Write: (v) => { layer.material.height = v; refreshComposite(); } });
          }
        } else if (layer.kind === "generator") {
          if (ch === "albedo") {
            ColorRow(lSec.Inner, { Label: "Generator Color", Read: () => layer.generator.color, Write: (v) => { layer.generator.color = v; refreshComposite(); } });
          } else if (ch === "roughness") {
            SliderRow(lSec.Inner, { Label: "Generator Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.generator.roughness, Write: (v) => { layer.generator.roughness = v; refreshComposite(); } });
          } else if (ch === "metalness") {
            SliderRow(lSec.Inner, { Label: "Generator Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.generator.metalness, Write: (v) => { layer.generator.metalness = v; refreshComposite(); } });
          } else if (ch === "height") {
            SliderRow(lSec.Inner, { Label: "Generator Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.generator.height ?? 0.1, Write: (v) => { layer.generator.height = v; refreshComposite(); } });
          }
        } else if (layer.kind === "paint" || layer.kind === "decal") {
          ActionRow(lSec.Inner, [
            {
              Label: `Flood ${chTitle}`,
              Glyph: "Fill",
              Tone: "accent",
              Act: () => {
                if (layer.locked) { Toast("Layer is locked"); return; }
                const prevScope = state.fillScope;
                const prevFillCh = state.brush.fillChannels;
                state.fillScope = "all";
                state.brush.fillChannels = { [ch]: true };
                performFillAtUv(layer, 0.5, 0.5);
                state.brush.fillChannels = prevFillCh;
                state.fillScope = prevScope;
              },
            },
            { Label: "Clear Layer", Glyph: "Trash", Act: clearPaintLayerBuffers },
          ]);
        }
      } else if (layer.kind === "folder") {
        const childLayers = state.doc.layers.filter((c) => c.parentId === layer.id);
        lSec.Inner.append(Construct("p", "property-hint", `Folder contains ${childLayers.length} nested child layer${childLayers.length === 1 ? "" : "s"}. Group opacity, visibility & folder mask cascade during compositing.`));
        ActionRow(lSec.Inner, [
          {
            Label: "+ Paint Child",
            Glyph: "Plus",
            Tone: "accent",
            Act: () => {
              const child = createPaintLayer("paint", {
                res,
                name: `${layer.name} Paint ${childLayers.length + 1}`,
                parentId: layer.id,
              });
              state.doc.layers.push(child);
              state.doc.selectedLayerId = child.id;
              renderLeftColumn();
              rebuildInspector();
              refreshComposite();
            },
          },
          {
            Label: "Toggle Children",
            Glyph: "Eye",
            Act: () => {
              const nextVis = childLayers.some((c) => !c.visible);
              childLayers.forEach((c) => { c.visible = nextVis; });
              refreshComposite();
              renderLeftColumn();
            },
          },
        ]);
      } else if (layer.kind === "paint") {
        const kSec = SectionCard(rightInner, { Title: "Paint Layer Actions", Glyph: "Brush", Open: true });
        kSec.Inner.append(Construct("p", "property-hint", "Direct 3D/UV raster layer. Right-click canvas or press Q to switch brush tips, PBR values, or dynamics."));
        ActionRow(kSec.Inner, [
          {
            Label: "Flood Active Color",
            Glyph: "Fill",
            Tone: "accent",
            Act: () => {
              if (layer.locked) { Toast("Layer is locked"); return; }
              const prevScope = state.fillScope;
              state.fillScope = "all";
              performFillAtUv(layer, 0.5, 0.5);
              state.fillScope = prevScope;
            },
          },
          { Label: "Clear Layer", Glyph: "Trash", Act: clearPaintLayerBuffers },
        ]);
      } else if (layer.kind === "decal") {
        const kSec = SectionCard(rightInner, { Title: "Stamp Decal Layer", Glyph: "Stamp", Open: true });
        kSec.Inner.append(Construct("p", "property-hint", "Non-destructive Stamp layer. Place stamps anywhere with Stamp (S) and transform with Move (V) or 2D UV gizmo handles."));
        ActionRow(kSec.Inner, [
          {
            Label: "+ Place Stamp",
            Glyph: "Stamp",
            Tone: "accent",
            Act: () => { placeMovableStamp({ projection: "uv", uv: { u: 0.5, v: 0.5 } }); selectTool("move"); },
          },
          { Label: "Clear Layer", Glyph: "Trash", Act: clearPaintLayerBuffers },
        ]);
      } else if (layer.kind === "fill") {
        const kSec = SectionCard(rightInner, { Title: "Fill & Pattern Properties", Glyph: "Fill", Open: true });
        ColorRow(kSec.Inner, { Label: "Fill Color", Read: () => layer.fill.color, Write: (v) => { layer.fill.color = v; refreshComposite(); renderLeftColumn(); } });
        SliderRow(kSec.Inner, { Label: "Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.fill.roughness, Write: (v) => { layer.fill.roughness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.fill.metalness, Write: (v) => { layer.fill.metalness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.fill.height ?? 0, Write: (v) => { layer.fill.height = v; refreshComposite(); } });
        ActionRow(kSec.Inner, [
          { Label: "+ Add Image Tile", Glyph: "Image", Tone: "warm", Act: () => triggerAddImage("fill") },
          ...(appBridge?.shared?.patternData ? [{
            Label: "Apply Pattern Tile",
            Glyph: "Pattern",
            Act: () => { layer.fill.patternData = appBridge.shared.patternData; rebuildInspector(); refreshComposite(); Toast("Applied Pattern Studio tile to Fill layer"); },
          }] : []),
        ]);
        if (layer.fill.patternData) {
          SliderRow(kSec.Inner, { Label: "Pattern Repeats", Minimum: 1, Maximum: 16, Step: 1, Read: () => layer.fill.patternRepeats || 3, Write: (v) => { layer.fill.patternRepeats = v; refreshComposite(); } });
          SliderRow(kSec.Inner, { Label: "Pattern Rotation", Minimum: -180, Maximum: 180, Step: 1, Unit: "°", Read: () => layer.fill.patternRotation || 0, Write: (v) => { layer.fill.patternRotation = v; refreshComposite(); } });
          SliderRow(kSec.Inner, { Label: "Pattern Height Gain", Minimum: 0, Maximum: 2.5, Step: 0.05, Read: () => layer.fill.patternHeightStrength ?? 1.0, Write: (v) => { layer.fill.patternHeightStrength = v; refreshComposite(); } });
          ActionRow(kSec.Inner, [{
            Label: "Clear Pattern Tile",
            Glyph: "Trash",
            Act: () => { layer.fill.patternData = null; rebuildInspector(); refreshComposite(); },
          }]);
        }
      } else if (layer.kind === "material") {
        const kSec = SectionCard(rightInner, { Title: "Material Surface Properties", Glyph: "Cube", Open: true });
        FilterDropdownPill(kSec.Inner, {
          Label: "Frontier Material",
          Prefix: "Mat:",
          Placeholder: "Filter Frontier materials...",
          Options: MATERIAL_CATALOG.map((m) => ({ value: m.id, label: m.name, sub: m.category || "Material" })),
          Read: () => layer.material.presetId,
          Write: (id) => {
            const found = MATERIAL_CATALOG.find((m) => m.id === id);
            if (found) {
              layer.material.presetId = found.id;
              layer.material.presetName = found.name;
              layer.material.color = found.color;
              layer.material.roughness = found.roughness;
              layer.material.metalness = found.metalness;
              rebuildInspector();
              refreshComposite();
              renderLeftColumn();
            }
          },
        });
        ColorRow(kSec.Inner, { Label: "Base Tint", Read: () => layer.material.color, Write: (v) => { layer.material.color = v; refreshComposite(); renderLeftColumn(); } });
        SliderRow(kSec.Inner, { Label: "Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.material.roughness, Write: (v) => { layer.material.roughness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.material.metalness, Write: (v) => { layer.material.metalness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.material.height ?? 0, Write: (v) => { layer.material.height = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Micro Grain Scale", Minimum: 1, Maximum: 32, Step: 0.5, Read: () => layer.material.grainScale, Write: (v) => { layer.material.grainScale = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Grain Contrast", Minimum: 0, Maximum: 0.35, Step: 0.01, Read: () => layer.material.grainStrength, Write: (v) => { layer.material.grainStrength = v; refreshComposite(); } });
      } else if (layer.kind === "generator") {
        const kSec = SectionCard(rightInner, { Title: "Procedural Mask Generator", Glyph: "Sparkles", Open: true });
        SegmentedRow(kSec.Inner, {
          Label: "Generator Mode",
          Options: [["Edge Wear", "edge-wear"], ["Crevice Dirt", "crevice-dirt"], ["Top Dust", "top-dust"], ["Grunge", "triplanar-grunge"]],
          Read: () => layer.generator.preset,
          Write: (v) => { layer.generator.preset = v; refreshComposite(); },
        });
        ColorRow(kSec.Inner, { Label: "Effect Color", Read: () => layer.generator.color, Write: (v) => { layer.generator.color = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.generator.roughness, Write: (v) => { layer.generator.roughness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.generator.metalness, Write: (v) => { layer.generator.metalness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => layer.generator.height ?? 0.1, Write: (v) => { layer.generator.height = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Threshold", Minimum: 0.05, Maximum: 0.95, Step: 0.01, Read: () => layer.generator.threshold, Write: (v) => { layer.generator.threshold = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Softness", Minimum: 0.02, Maximum: 0.8, Step: 0.01, Read: () => layer.generator.softness, Write: (v) => { layer.generator.softness = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Noise Scale", Minimum: 1, Maximum: 24, Step: 0.5, Read: () => layer.generator.noiseScale ?? 6, Write: (v) => { layer.generator.noiseScale = v; refreshComposite(); } });
        SliderRow(kSec.Inner, { Label: "Noise Breakup", Minimum: 0, Maximum: 0.9, Step: 0.02, Read: () => layer.generator.noiseMix, Write: (v) => { layer.generator.noiseMix = v; refreshComposite(); } });
        SwitchRow(kSec.Inner, { Label: "Invert Generator Mask", Read: () => !!layer.generator.invert, Write: (v) => { layer.generator.invert = !!v; refreshComposite(); } });
      }

      // Layer Stamps Subcomponents Inspector (when layer has stamps or is decal layer)
      if (layer.kind !== "folder" && ((layer.stamps && layer.stamps.length > 0) || layer.kind === "decal")) {
        const stSec = SectionCard(rightInner, {
          Title: "Layer Stamps",
          Glyph: "Stamp",
          Badge: String(layer.stamps?.length || 0),
          Open: true,
        });
        const list = Construct("div", "stamp-sublist");
        for (const st of (layer.stamps || [])) {
          const isStSel = st.id === layer.selectedStampId || (!layer.selectedStampId && st === layer.stamps[0]);
          const item = Construct("div", "stamp-sub-item" + (isStSel ? " active" : ""));
          const vis = Construct("button", "stack-mini-btn" + (st.visible ? " on" : ""), ConstructGlyph(st.visible ? "Eye" : "EyeOff"));
          vis.type = "button";
          vis.addEventListener("click", (e) => { e.stopPropagation(); st.visible = !st.visible; rebuildInspector(); refreshComposite(); });
          const del = Construct("button", "stack-mini-btn", ConstructGlyph("Trash"));
          del.type = "button";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            layer.stamps = layer.stamps.filter((x) => x.id !== st.id);
            layer.selectedStampId = layer.stamps[0]?.id || null;
            renderLeftColumn();
            rebuildInspector();
            refreshComposite();
          });
          const lbl = Construct("span", null, `${st.name} (${st.projection.toUpperCase()})`);
          lbl.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          item.append(ConstructGlyph("Stamp"), lbl, vis, del);
          item.addEventListener("click", () => {
            layer.selectedStampId = st.id;
            rebuildInspector();
            refreshComposite();
          });
          list.append(item);
        }
        stSec.Inner.append(list);

        const activeSt = getSelectedStamp(layer, false)?.stamp;
        if (activeSt) {
          TextRow(stSec.Inner, { Label: "Stamp Name", Read: () => activeSt.name, Write: (v) => { activeSt.name = v; rebuildInspector(); } });
          SegmentedRow(stSec.Inner, {
            Label: "Projection",
            Options: [["UV", "uv"], ["3D", "3d"]],
            Read: () => activeSt.projection || "uv",
            Write: (v) => { activeSt.projection = v; refreshComposite(); rebuildInspector(); },
          });
          SliderRow(stSec.Inner, { Label: "Uniform Scale", Minimum: 0.025, Maximum: 1.5, Step: 0.01, Read: () => activeSt.scale ?? 0.28, Write: (v) => { activeSt.scale = v; refreshComposite(); } });
          SliderRow(stSec.Inner, { Label: "Rotation", Minimum: -180, Maximum: 180, Step: 1, Unit: "°", Read: () => activeSt.rotation ?? 0, Write: (v) => { activeSt.rotation = v; refreshComposite(); } });
          SliderRow(stSec.Inner, { Label: "Opacity", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => activeSt.opacity ?? 1, Write: (v) => { activeSt.opacity = v; refreshComposite(); } });
          SliderRow(stSec.Inner, { Label: "Height Gain", Minimum: -1, Maximum: 1.5, Step: 0.02, Read: () => activeSt.heightStrength ?? 0.5, Write: (v) => { activeSt.heightStrength = v; refreshComposite(); } });
          ColorRow(stSec.Inner, { Label: "Stamp Tint", Read: () => activeSt.tint || "#ffffff", Write: (v) => { activeSt.tint = v; refreshComposite(); } });
        }
        ActionRow(stSec.Inner, [
          {
            Label: "Move / Resize (V)",
            Glyph: "Move",
            Tone: "accent",
            Act: () => selectTool("move"),
          },
          {
            Label: "+ Add Stamp Here",
            Glyph: "Plus",
            Act: () => { placeMovableStamp({ projection: "uv", uv: { u: 0.5, v: 0.5 } }); selectTool("move"); },
          },
        ]);
      }

      // Unconditional Layer Mask Inspector (works on any layer & folder!)
      const maskSec = SectionCard(rightInner, { Title: "Layer Mask", Glyph: "Sparkles", Badge: layer.mask ? (layer.mask.enabled ? "ON" : "OFF") : "NONE", Open: !!(state.doc.editingMask || layer.mask) });
      if (!layer.mask) {
        ActionRow(maskSec.Inner, [
          {
            Label: "Add White Mask",
            Tone: "accent",
            Act: () => {
              layer.mask = { enabled: true, invert: false, opacity: 1, generatorPreset: "none", generatorThreshold: 0.48, generatorSoftness: 0.16, generatorNoiseScale: 6, generatorNoiseMix: 0.25, featherRadius: 0, pixels: new Uint8ClampedArray(res * res).fill(255) };
              if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 1);
              state.doc.editingMask = true;
              renderLeftColumn();
              rebuildInspector();
              refreshComposite();
            },
          },
          {
            Label: "Add Black Mask",
            Act: () => {
              layer.mask = { enabled: true, invert: false, opacity: 1, generatorPreset: "none", generatorThreshold: 0.48, generatorSoftness: 0.16, generatorNoiseScale: 6, generatorNoiseMix: 0.25, featherRadius: 0, pixels: new Uint8ClampedArray(res * res).fill(0) };
              if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 0);
              state.doc.editingMask = true;
              renderLeftColumn();
              rebuildInspector();
              refreshComposite();
            },
          },
        ]);
      } else {
        SwitchRow(maskSec.Inner, { Label: "Paint on Mask", Read: () => !!state.doc.editingMask, Write: (v) => { state.doc.editingMask = v; renderLeftColumn(); refreshComposite(); } });
        SwitchRow(maskSec.Inner, { Label: "Mask Enabled", Read: () => !!layer.mask.enabled, Write: (v) => { layer.mask.enabled = v; renderLeftColumn(); refreshComposite(); } });
        SwitchRow(maskSec.Inner, { Label: "Invert Mask", Read: () => !!layer.mask.invert, Write: (v) => { layer.mask.invert = v; refreshComposite(); } });
        SliderRow(maskSec.Inner, { Label: "Mask Opacity", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.mask.opacity ?? 1, Write: (v) => { layer.mask.opacity = v; refreshComposite(); } });
        SelectRow(maskSec.Inner, {
          Label: "Procedural Generator",
          Options: [["None (Manual Paint)", "none"], ["Edge Wear", "edge-wear"], ["Crevice Dirt", "crevice-dirt"], ["Top Dust", "top-dust"], ["Triplanar Grunge", "triplanar-grunge"]],
          Read: () => layer.mask.generatorPreset || "none",
          Write: (v) => { layer.mask.generatorPreset = v; rebuildInspector(); },
        });
        if (layer.mask.generatorPreset && layer.mask.generatorPreset !== "none") {
          SliderRow(maskSec.Inner, { Label: "Gen Threshold", Minimum: 0.05, Maximum: 0.95, Step: 0.01, Read: () => layer.mask.generatorThreshold ?? 0.48, Write: (v) => { layer.mask.generatorThreshold = v; } });
          SliderRow(maskSec.Inner, { Label: "Gen Softness", Minimum: 0.02, Maximum: 0.8, Step: 0.01, Read: () => layer.mask.generatorSoftness ?? 0.16, Write: (v) => { layer.mask.generatorSoftness = v; } });
          ActionRow(maskSec.Inner, [{
            Label: "Bake Generator to Mask",
            Glyph: "Sparkles",
            Tone: "accent",
            Act: () => {
              if (!meshCues) return;
              const snap = snapshotSelectedLayer();
              generateProceduralMask(layer.mask, meshCues, {
                preset: layer.mask.generatorPreset,
                threshold: layer.mask.generatorThreshold ?? 0.48,
                softness: layer.mask.generatorSoftness ?? 0.16,
                noiseScale: layer.mask.generatorNoiseScale ?? 6,
                noiseMix: layer.mask.generatorNoiseMix ?? 0.25,
                bakedMaps: state.doc.bakedMaps,
              });
              if (gpuPaint.isActive) gpuPaint.syncMaskCpuToGpu(layer);
              if (snap) pushUndoSnapshot(snap);
              refreshComposite();
              Toast(`Baked ${layer.mask.generatorPreset} into Layer Mask`);
            },
          }]);
        }
        SliderRow(maskSec.Inner, { Label: "Feather Radius (px)", Minimum: 0, Maximum: 16, Step: 1, Read: () => layer.mask.featherRadius ?? 0, Write: (v) => { layer.mask.featherRadius = v; } });
        ActionRow(maskSec.Inner, [
          { Label: "Fill White", Act: () => { const snap = snapshotSelectedLayer(); layer.mask.pixels?.fill(255); if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 1); if (snap) pushUndoSnapshot(snap); refreshComposite(); } },
          { Label: "Fill Black", Act: () => { const snap = snapshotSelectedLayer(); layer.mask.pixels?.fill(0); if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 0); if (snap) pushUndoSnapshot(snap); refreshComposite(); } },
          {
            Label: "Feather Mask",
            Act: () => {
              const r = Math.max(1, Math.round(layer.mask.featherRadius || 2));
              const snap = snapshotSelectedLayer();
              featherMaskPixels(layer.mask.pixels, res, r);
              if (gpuPaint.isActive) gpuPaint.syncMaskCpuToGpu(layer);
              if (snap) pushUndoSnapshot(snap);
              refreshComposite();
              Toast(`Feathered mask (${r}px)`);
            },
          },
          {
            Label: "Remove Mask",
            Glyph: "Trash",
            Act: () => {
              layer.mask = null;
              state.doc.editingMask = false;
              renderLeftColumn();
              rebuildInspector();
              refreshComposite();
            },
          },
        ]);
      }
    }

    const dSec = SectionCard(rightInner, { Title: "Viewport Options", Glyph: "Cube", Open: false });
    SwitchRow(dSec.Inner, { Label: "Mesh Wireframe Overlay", Read: () => state.wireframe, Write: (v) => { state.wireframe = v; if (wireOverlay) wireOverlay.visible = v; } });

    CloseScope(inspectorScope);
    Broadcast();
  }

  // ----------------------------------------------------------------- TOOLBAR & SCISSOR RENDERING
  function syncViewportLayout() {
    if (state.viewportMode === "3d") {
      splitBox.style.gridTemplateColumns = "1fr";
      pane3D.style.display = "block";
      pane2D.style.display = "none";
    } else if (state.viewportMode === "2d") {
      splitBox.style.gridTemplateColumns = "1fr";
      pane3D.style.display = "none";
      pane2D.style.display = "block";
    } else {
      splitBox.style.gridTemplateColumns = "1fr 1fr";
      pane3D.style.display = "block";
      pane2D.style.display = "block";
    }
    const w = stage.clientWidth || 800;
    const h = stage.clientHeight || 520;
    renderer.setSize(w, h, false);

    const w3 = pane3D.clientWidth || w;
    const h3 = pane3D.clientHeight || h;
    if (w3 > 0 && h3 > 0) {
      camera.aspect = w3 / h3;
      camera.updateProjectionMatrix();
    }

    const w2 = pane2D.clientWidth || w;
    const h2 = pane2D.clientHeight || h;
    if (w2 > 0 && h2 > 0) {
      const pa = w2 / h2;
      if (pa >= 1) { uvCam.left = -pa; uvCam.right = pa; uvCam.top = 1; uvCam.bottom = -1; }
      else { uvCam.left = -1; uvCam.right = 1; uvCam.top = 1 / pa; uvCam.bottom = -1 / pa; }
      uvCam.updateProjectionMatrix();
    }
    renderUvStampGizmo();
  }

  meshSelect.addEventListener("change", () => {
    state.meshId = meshSelect.value;
    state.doc.meshId = state.meshId;
    rebuildPaintMesh();
    renderLeftColumn();
    Toast(`Loaded ${meshSelect.options[meshSelect.selectedIndex].text}`);
  });
  vpSelect.addEventListener("change", () => { state.viewportMode = vpSelect.value; syncViewportLayout(); refreshComposite(); });
  chanSelect.addEventListener("change", () => { state.viewChannel = chanSelect.value; refreshComposite(); });

  importInp.addEventListener("change", async () => {
    const file = importInp.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let geo;
      if (ext === "obj") {
        const grp = new OBJLoader().parse(await file.text());
        grp.traverse((ch) => { if (ch.isMesh && !geo) geo = ch.geometry.clone(); });
      } else if (ext === "stl") {
        geo = new STLLoader().parse(await file.arrayBuffer());
      }
      if (geo) {
        geo.center(); geo.computeBoundingSphere();
        const s = 1.45 / Math.max(0.01, geo.boundingSphere.radius || 1);
        geo.scale(s, s, s);
        rebuildPaintMesh(buildPaintTargetGeometry("custom", geo));
        Toast(`Imported ${file.name}`);
      }
    } catch (err) {
      Toast(`Import error: ${err.message}`);
    }
    importInp.value = "";
  });

  btnExportAll.addEventListener("click", () => {
    const extMask = getAnyExtendedChannelsMask();
    const exp = gpuPaint.isActive ? gpuPaint.readExportChannels(extMask) : lastCpuComp;
    if (!exp) return;
    downloadRgbaPng(exp.albedo, res, `${state.meshId}-albedo.png`, false);
    downloadRgbaPng(exp.roughness, res, `${state.meshId}-roughness.png`, true);
    downloadRgbaPng(exp.metalness, res, `${state.meshId}-metalness.png`, true);
    downloadRgbaPng(exp.normal, res, `${state.meshId}-normal.png`, false);
    let extraCount = 0;
    if (exp.ext) {
      for (const [key, buf] of Object.entries(exp.ext)) {
        if (!buf || !extMask[key]) continue;
        if (key === "emissive") {
          let rgbaBuf = buf;
          if (buf.length === res * res * 3) {
            rgbaBuf = new Uint8ClampedArray(res * res * 4);
            for (let i = 0; i < res * res; i++) {
              rgbaBuf[i * 4] = buf[i * 3];
              rgbaBuf[i * 4 + 1] = buf[i * 3 + 1];
              rgbaBuf[i * 4 + 2] = buf[i * 3 + 2];
              rgbaBuf[i * 4 + 3] = 255;
            }
          }
          downloadRgbaPng(rgbaBuf, res, `${state.meshId}-emissive.png`, false);
        } else {
          downloadRgbaPng(buf, res, `${state.meshId}-${key}.png`, true);
        }
        extraCount++;
      }
    }
    Toast(`Exported 4 core maps${extraCount ? ` + ${extraCount} extended PBR PNGs` : ""}`);
  });

  const onKeyDown = (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); btnUndo.click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); btnRedo.click(); }
    else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); moveLayerByOffset(state.doc.selectedLayerId, +1); }
    else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); moveLayerByOffset(state.doc.selectedLayerId, -1); }
    else if (e.key === "Escape") { closeToolPopup(); }
    else if (e.key.toLowerCase() === "q" || e.key === "Tab") { e.preventDefault(); openToolPopup(); }
    else if (e.key.toLowerCase() === "b") selectTool("paint");
    else if (e.key.toLowerCase() === "e") selectTool("erase");
    else if (e.key.toLowerCase() === "g") selectTool("fill");
    else if (e.key.toLowerCase() === "s") selectTool("stamp");
    else if (e.key.toLowerCase() === "i") selectTool("eyedropper");
    else if (e.key.toLowerCase() === "v") selectTool("move");
    else if (e.key === "[" || e.key === "]") {
      const mul = e.key === "]" ? 1.12 : 0.88;
      if (state.brush.tool === "move") {
        const found = getSelectedStamp(getActiveLayer(), true);
        if (found) { found.stamp.scale = Math.max(0.025, Math.min(1.6, (found.stamp.scale ?? 0.28) * mul)); refreshComposite(); }
      } else {
        state.brush.size = Math.max(0.03, Math.min(0.9, state.brush.size * mul));
        state.brush.pixelRadius = Math.round(state.brush.size * 110);
      }
      Broadcast();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  const ro = new ResizeObserver(syncViewportLayout);
  ro.observe(stage);

  rebuildPaintMesh();
  renderLeftColumn();
  syncUndoButtons();
  syncViewportLayout();

  const tick = () => {
    if (disposed) return;
    orbit.update();

    const fullW = stage.clientWidth || 800;
    const fullH = stage.clientHeight || 520;
    renderer.setRenderTarget(null);
    if (state.viewportMode === "3d") {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, fullW, fullH);
      renderer.render(scene, camera);
    } else if (state.viewportMode === "2d") {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, fullW, fullH);
      renderer.render(uvScene, uvCam);
    } else {
      const half = Math.floor(fullW * 0.5);
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, half, fullH);
      renderer.setScissor(0, 0, half, fullH);
      renderer.render(scene, camera);

      renderer.setViewport(half, 0, fullW - half, fullH);
      renderer.setScissor(half, 0, fullW - half, fullH);
      renderer.render(uvScene, uvCam);
      renderer.setScissorTest(false);
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const resolveDropPayload = (e) => {
    let payload = null;
    try {
      const rawJson = e.dataTransfer?.getData("application/x-frontier-asset") || e.dataTransfer?.getData("text/plain");
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        payload = parsed.raw ? parsed : appBridge.resolveAssetPayload?.(parsed.assetKind, parsed.id);
      }
    } catch {}
    return payload || appBridge.activeDragAsset || null;
  };

  function applyAsset(payload, dropInfo = {}) {
    if (!payload) return false;
    if (payload.assetKind === "material") {
      const m = payload.raw;
      const l = createPaintLayer("material", {
        res,
        name: m.name || "Material Layer",
        material: { presetId: m.id, presetName: m.name, color: m.color, roughness: m.roughness, metalness: m.metalness, height: 0, grainScale: 10, grainStrength: 0.08 },
      });
      state.doc.layers.push(l);
      state.doc.selectedLayerId = l.id;
      renderLeftColumn();
      rebuildInspector();
      refreshComposite();
      Toast(`Applied Material "${m.name}" to Paint Stack`);
      return true;
    }
    if (payload.assetKind === "pattern") {
      const doc = loadStarterAsArtworkDocument(payload.raw);
      const ev = evaluateArtworkDocument(doc, 512);
      const l = createPaintLayer("fill", {
        res,
        name: doc.name || "Pattern Fill",
        fill: { color: "#ffffff", roughness: 0.45, metalness: 0.1, height: 0, patternRepeats: 2, patternData: { ...ev, name: doc.name } },
      });
      state.doc.layers.push(l);
      state.doc.selectedLayerId = l.id;
      renderLeftColumn();
      rebuildInspector();
      refreshComposite();
      Toast(`Applied Pattern "${doc.name}" to Paint Mesh`);
      return true;
    }
    if (payload.assetKind === "stamp") {
      const doc = loadStarterAsArtworkDocument(payload.raw);
      const ev = evaluateArtworkDocument(doc, 192);
      state.brush.stampData = ev;
      state.brush.stampName = doc.name || payload.name;
      if (gpuPaint.isActive) gpuPaint.ensureStampTexture(ev);
      selectTool("stamp");

      // If dropped directly over 3D/2D canvas, place as movable/scalable/rotatable Stamp!
      if (dropInfo.event) {
        const evDrop = dropInfo.event;
        if (dropInfo.pane === "2d") {
          const hitUv = uvFromPaneEvent(evDrop);
          const placed = placeMovableStamp({ projection: "uv", uv: hitUv });
          if (placed) {
            selectTool("move");
            Toast(`Placed movable stamp "${state.brush.stampName}" at UV (${hitUv.u.toFixed(2)}, ${hitUv.v.toFixed(2)})`);
            return true;
          }
        } else {
          const hit = raycastMeshFromEvent(evDrop);
          if (hit) {
            const placed = placeMovableStamp({ projection: "3d", hit });
            if (placed) {
              selectTool("move");
              Toast(`Placed movable stamp "${state.brush.stampName}" on 3D mesh`);
              return true;
            }
          }
        }
      }
      Toast(`Loaded Stamp "${state.brush.stampName}" into Brush`);
      return true;
    }
    if (payload.assetKind === "brush") {
      const b = payload.raw;
      if (b.tool) selectTool(b.tool);
      else if (b.tip) {
        state.brush.tip = b.tip;
        if (b.hardness) state.brush.hardness = b.hardness;
        selectTool("paint");
      }
      rebuildInspector();
      Toast(`Equipped "${b.name}"`);
      return true;
    }
    if (payload.assetKind === "mesh") {
      const mId = payload.raw?.paintId || payload.id;
      if (PAINT_MESH_LIST.some((p) => p.id === mId)) {
        state.meshId = mId;
        state.customGeo = null;
        meshSelect.value = mId;
        rebuildPaintMesh();
        Toast(`Switched paint mesh to "${payload.name}"`);
        return true;
      }
    }
    return false;
  }

  for (const [paneName, paneEl] of [["3d", pane3D], ["2d", pane2D]]) {
    paneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      stage.classList.add("canvas-drop-active");
    });
    paneEl.addEventListener("dragleave", () => stage.classList.remove("canvas-drop-active"));
    paneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      stage.classList.remove("canvas-drop-active");
      const files = e.dataTransfer?.files;
      if (files?.length && files[0].type?.startsWith("image/")) {
        importImageFile(files[0], state.brush.tool === "fill" ? "fill" : "stamp");
        return;
      }
      const payload = resolveDropPayload(e);
      if (payload) applyAsset(payload, { source: "drop", pane: paneName, event: e });
    });
  }

  return {
    name: "Texture Paint",
    applyAsset,
    applyBridgedMaterial(matParams) {
      const l = createPaintLayer("material", {
        res,
        name: matParams.name || "Material Layer",
        material: {
          presetId: matParams.id,
          presetName: matParams.name,
          color: matParams.color,
          roughness: matParams.roughness,
          metalness: matParams.metalness,
          height: 0,
          grainScale: 10,
          grainStrength: 0.08,
        },
      });
      state.doc.layers.push(l);
      state.doc.selectedLayerId = l.id;
      renderLeftColumn();
      rebuildInspector();
      refreshComposite();
      Toast(`Added "${matParams.name}" Material layer`);
    },
    applyBridgedPattern(patternEval) {
      const l = createPaintLayer("fill", {
        res,
        name: patternEval.name || "Pattern Fill",
        fill: { color: "#ffffff", roughness: 0.45, metalness: 0.1, height: 0, patternRepeats: 3, patternData: patternEval },
      });
      state.doc.layers.push(l);
      state.doc.selectedLayerId = l.id;
      renderLeftColumn();
      rebuildInspector();
      refreshComposite();
      Toast(`Applied "${patternEval.name}" as Pattern Fill layer`);
    },
    applyBridgedStamp(stampEval) {
      const name = stampEval.name || "Stamp Decal";
      if (!stampPreviews.some((sp) => sp.name === name && sp.evaluated === stampEval)) {
        stampPreviews.unshift({
          entry: { group: "Stamp Studio" },
          name,
          evaluated: stampEval,
          previewSvg: null,
          previewDataUrl: rgbaToPreviewDataUrl(stampEval.albedo || stampEval.rgba, stampEval.width, stampEval.heightPx),
        });
      }
      state.brush.stampData = stampEval;
      state.brush.stampName = name;
      if (gpuPaint.isActive) gpuPaint.ensureStampTexture(stampEval);
      selectTool("stamp");
      rebuildInspector();
      Toast(`Loaded "${state.brush.stampName}" into Stamp Brush`);
    },
    applyBakedMaps(bridgeData) {
      state.doc.bakedMaps = bridgeData;
      if (gpuPaint.isActive && meshCues) gpuPaint.uploadMeshCues(meshCues, bridgeData);
      refreshComposite();
      Broadcast();
      Toast("Attached High/Low Baked AO + Curvature maps to Texture Paint");
    },
    moveLayer: moveLayerByOffset,
    getSnapshot: () => ({ meshId: state.meshId, layers: state.doc.layers.length, tool: state.brush.tool, gpu: gpuPaint.isActive }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      closeToolPopup();
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      if (inspectorScope) ReleaseScope(inspectorScope);
      orbit.dispose();
      envTex.dispose();
      fallbackAlbTex.dispose(); fallbackRoughTex.dispose();
      fallbackMetalTex.dispose(); fallbackNormalTex.dispose();
      uvQuadMat.dispose(); uvQuadMesh.geometry.dispose();
      stampGizmo3D.geometry.dispose(); stampGizmo3D.material.dispose();
      paintMat.dispose();
      for (const s of state.undoStack) gpuPaint.disposeSnapshot(s);
      for (const s of state.redoStack) gpuPaint.disposeSnapshot(s);
      gpuPaint.dispose();
      if (paintMesh) paintMesh.geometry.dispose();
      if (wireOverlay) wireOverlay.geometry.dispose();
      if (uvWireLines) uvWireLines.geometry.dispose();
      renderer.dispose();
      root.innerHTML = "";
    },
  };
}
