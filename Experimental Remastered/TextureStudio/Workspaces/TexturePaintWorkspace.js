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
} from "../Engine/TexturePaintEngine.js";
import { GpuPaintSession } from "../Engine/GpuPaintEngine.js";
import { evaluateArtworkDocument } from "../Engine/Patterns/ArtworkStackEngine.js";
import { listStampStarterCatalog, loadStarterAsArtworkDocument } from "../Engine/Patterns/StarterCatalogBridge.js";
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
  SmoothScroll,
  OpenScope,
  CloseScope,
  ReleaseScope,
  Broadcast,
  Toast,
} from "../StudioControls.js";

function clonePixels(buf) {
  return {
    res: buf.res,
    albedo: new Uint8ClampedArray(buf.albedo),
    roughness: new Uint8ClampedArray(buf.roughness),
    metalness: new Uint8ClampedArray(buf.metalness),
    height: new Uint8ClampedArray(buf.height),
  };
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

const TOOL_LABELS = {
  paint: "Brush",
  erase: "Eraser",
  fill: "Fill",
  stamp: "Stamp",
  eyedropper: "Sample",
};

const QUICK_SWATCHES = ["#eff4cf", "#e8c27a", "#d96b4e", "#6ea8ff", "#7ac98f", "#d6dce6", "#42464f", "#141518"];

export function mountTexturePaintWorkspace(root, appBridge) {
  let res = 512;
  const defaultStampCatalog = listStampStarterCatalog();
  const stampPreviews = defaultStampCatalog.map((entry) => {
    const doc = loadStarterAsArtworkDocument(entry);
    const evaluated = evaluateArtworkDocument(doc, 192);
    return { entry, name: doc.name, evaluated };
  });
  const defaultStamp = stampPreviews[0];

  let state = {
    doc: createPaintDocument(res),
    meshId: "teapot",
    customGeo: null,
    viewportMode: "3d", // "3d" | "split" | "2d"
    viewChannel: "lit", // "lit" | "baseColor" | "roughness" | "metalness" | "height" | "mask"
    fillScope: "part", // "part" | "island" | "all"
    brush: {
      tool: "paint", // "paint" | "erase" | "fill" | "stamp" | "eyedropper"
      tip: "round", // "round" | "chisel" | "chalk" | "splatter" | "sponge"
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
      channels: { albedo: true, roughness: true, metalness: true, height: true },
      stampName: defaultStamp.name,
      stampData: defaultStamp.evaluated,
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
  let isPainting3D = false;
  let isPainting2D = false;
  let inspectorScope = null;
  let rafId = 0;
  let disposed = false;
  let strokeSeedCounter = 1;
  let activeToolPopup = null;
  let dragLayerId = null;

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
  ]) {
    const b = Construct("button", "pill-btn" + (state.brush.tool === id ? " active" : ""), [
      ConstructGlyph(glyph),
      Construct("span", null, label),
    ]);
    b.type = "button";
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
    ["Active Mask", "mask"],
  ]) {
    const o = Construct("option", null, label);
    o.value = val;
    chanSelect.append(o);
  }

  const btnToolMenu = Construct("button", "pill-btn", [ConstructGlyph("Sliders"), Construct("span", null, "Tool Menu (Q)")]);
  btnToolMenu.type = "button";
  btnToolMenu.title = "Open Active Tool Popup (Right-Click / Q / Tab)";

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

  splitBox.append(pane3D, pane2D);
  const hudHelp = Construct("div", "viewport-hud-bottom", "Left-drag mesh to paint · Right-click or Q / Tab for Active Tool Menu · B/E/G/S/I switch tools");
  stage.append(splitBox, hudHelp);
  centerCol.append(toolbar, stage);

  // RIGHT: BRUSH & LAYER INSPECTOR
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Brush & Layer Inspector"),
      Construct("span", "panel-heading-meta", "GPU 3D/UV PAINT"),
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

  const paintMat = new THREE.MeshStandardMaterial({
    map: gpuPaint.isActive ? gpuPaint.displayAlbedoRT.texture : fallbackAlbTex,
    roughnessMap: gpuPaint.isActive ? gpuPaint.finalOrmhRT.texture : fallbackRoughTex,
    metalnessMap: gpuPaint.isActive ? gpuPaint.finalOrmhRT.texture : fallbackMetalTex,
    normalMap: gpuPaint.isActive ? gpuPaint.finalNormalRT.texture : fallbackNormalTex,
    roughness: 1.0,
    metalness: 1.0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });

  let paintMesh = null;
  let wireOverlay = null;
  let lastCpuComp = null;

  // 3D Brush Ring Reticle
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

  function refreshComposite() {
    if (!meshCues || disposed) return;

    if (gpuPaint.isActive) {
      const out = gpuPaint.composite(state.doc, {
        hasLiveStroke,
        liveBrush: state.brush,
        viewChannel: state.viewChannel,
      });
      if (out) {
        paintMat.map = out.albedoTex;
        if (state.viewChannel === "lit") {
          paintMat.roughnessMap = out.ormhTex;
          paintMat.metalnessMap = out.ormhTex;
          paintMat.normalMap = out.normalTex;
          paintMat.roughness = 1.0;
          paintMat.metalness = 1.0;
        } else {
          paintMat.roughnessMap = null;
          paintMat.metalnessMap = null;
          paintMat.normalMap = null;
          paintMat.roughness = 0.85;
          paintMat.metalness = 0.0;
        }
        uvQuadMat.map = out.albedoTex;
        uvQuadMat.needsUpdate = true;
      }
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

  // ----------------------------------------------------------------- 3D RAYCAST + GPU PAINT HANDLERS
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
    if (!hit || state.brush.tool === "eyedropper") {
      brushRing.visible = false;
      return;
    }
    const n = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    brushRing.visible = true;
    brushRing.position.copy(hit.point).addScaledVector(n, 0.008);
    brushRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    brushRing.scale.setScalar(state.brush.size);
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

  function dabAlongSegment3D(pStart, pEnd, normal) {
    const layer = getTargetPaintableLayer(true);
    const partFilter = layer?.partFilter ?? -1;
    const dist = pStart.distanceTo(pEnd);
    const step = Math.max(0.015, state.brush.size * 0.24);
    const steps = Math.max(1, Math.min(20, Math.ceil(dist / step)));
    const temp = new THREE.Vector3();

    for (let s = 0; s <= steps; s++) {
      temp.lerpVectors(pStart, pEnd, steps === 0 ? 1 : s / steps);
      if (gpuPaint.isActive) {
        gpuPaint.dabStroke({
          mode: "3d",
          hitPos: temp,
          hitNormal: normal,
          worldRadius: state.brush.size,
          brush: state.brush,
          partFilter,
          seed: strokeSeedCounter++,
        });
      } else {
        applyBrushDab3D({
          strokeAccum: activeCpuStroke,
          meshIndex,
          cues: meshCues,
          hitPos: temp,
          hitNormal: normal,
          worldRadius: state.brush.size,
          brush: state.brush,
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

  pane3D.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      rightDownPos3D = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0 || e.altKey) return;
    if (activeToolPopup && !activeToolPopup.contains(e.target)) closeToolPopup();
    const hit = raycastMeshFromEvent(e);
    if (!hit) {
      orbit.enabled = true;
      return;
    }

    if (state.brush.tool === "eyedropper") {
      if (hit.uv) performEyedropperAtUv(hit.uv.x, hit.uv.y);
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
    pendingUndoSnap = snapshotSelectedLayer();
    if (gpuPaint.isActive) gpuPaint.beginStroke();
    else activeCpuStroke = createStrokeAccumulator(res);
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
    if (!isPainting3D || !hit) return;
    const norm = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    dabAlongSegment3D(lastHitPos || hit.point, hit.point, norm);
    lastHitPos = hit.point.clone();
  });

  const endStroke3D = () => {
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
    pendingUndoSnap = null;
    refreshComposite();
  };
  pane3D.addEventListener("pointerup", endStroke3D);
  pane3D.addEventListener("pointercancel", endStroke3D);

  // Synchronized 2D UV Canvas Painting!
  function uvFromPaneEvent(e) {
    const rect = pane2D.getBoundingClientRect();
    const halfSide = Math.min(rect.width, rect.height) * 0.44;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const u = Math.max(0, Math.min(1, ((e.clientX - cx) / Math.max(1, halfSide)) * 0.5 + 0.5));
    const v = Math.max(0, Math.min(1, 0.5 - ((e.clientY - cy) / Math.max(1, halfSide)) * 0.5));
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
    if (state.brush.tool === "eyedropper") { performEyedropperAtUv(u, v); return; }
    const layer = getTargetPaintableLayer(true);
    if (!layer || layer.locked) return;
    if (state.brush.tool === "fill") { performFillAtUv(layer, u, v); return; }

    isPainting2D = true;
    hasLiveStroke = true;
    pendingUndoSnap = snapshotSelectedLayer();
    if (gpuPaint.isActive) {
      gpuPaint.beginStroke();
      gpuPaint.dabStroke({
        mode: "2d",
        uv: { x: u, y: v },
        uvRadius: state.brush.pixelRadius / res,
        brush: state.brush,
        partFilter: layer.partFilter ?? -1,
        seed: strokeSeedCounter++,
      });
    } else {
      activeCpuStroke = createStrokeAccumulator(res);
      applyBrushDabUV({ strokeAccum: activeCpuStroke, cues: meshCues, u, v, pixelRadius: state.brush.pixelRadius, brush: state.brush, activePartFilter: layer.partFilter ?? -1 });
    }
    refreshComposite();
    pane2D.setPointerCapture(e.pointerId);
  });

  pane2D.addEventListener("pointermove", (e) => {
    if (!isPainting2D) return;
    const { u, v } = uvFromPaneEvent(e);
    const layer = getTargetPaintableLayer(false);
    if (gpuPaint.isActive) {
      gpuPaint.dabStroke({
        mode: "2d",
        uv: { x: u, y: v },
        uvRadius: state.brush.pixelRadius / res,
        brush: state.brush,
        partFilter: layer?.partFilter ?? -1,
        seed: strokeSeedCounter++,
      });
    } else if (activeCpuStroke) {
      applyBrushDabUV({ strokeAccum: activeCpuStroke, cues: meshCues, u, v, pixelRadius: state.brush.pixelRadius, brush: state.brush, activePartFilter: layer?.partFilter ?? -1 });
    }
    refreshComposite();
  });

  const endStroke2D = () => {
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
    const px = clientX ?? (box.left + box.width * 0.5 - 170);
    const py = clientY ?? (box.top + 68);
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    pop.style.left = forceRefresh && prevLeft ? prevLeft : `${Math.max(12, Math.min(px, vw - 356))}px`;
    pop.style.top = forceRefresh && prevTop ? prevTop : `${Math.max(12, Math.min(py, vh - 460))}px`;

    const closeBtn = Construct("button", "stack-mini-btn", ConstructGlyph("Close"));
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeToolPopup);
    pop.append(
      Construct("div", "tool-popup-head", [
        ConstructGlyph(state.brush.tool === "erase" ? "Eraser" : state.brush.tool === "fill" ? "Fill" : state.brush.tool === "stamp" ? "Stamp" : state.brush.tool === "eyedropper" ? "Pipette" : "Brush"),
        Construct("strong", null, `${TOOL_LABELS[state.brush.tool] || "Active"} Tool Options`),
        Construct("small", null, "Q / Tab / Esc"),
        closeBtn,
      ]),
    );

    // Quick tool switcher tabs
    const tabs = Construct("div", "tool-popup-tabs");
    for (const [id, label, glyph] of [
      ["paint", "Brush", "Brush"],
      ["erase", "Erase", "Eraser"],
      ["fill", "Fill", "Fill"],
      ["stamp", "Stamp", "Stamp"],
      ["eyedropper", "Pick", "Pipette"],
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

    const tool = state.brush.tool;

    if (tool === "paint" || tool === "erase") {
      const tipRow = Construct("div", "chip-strip");
      for (const [label, key] of [["Round", "round"], ["Chisel", "chisel"], ["Chalk", "chalk"], ["Splatter", "splatter"], ["Sponge", "sponge"]]) {
        const cb = Construct("button", "chip-btn" + (state.brush.tip === key ? " active" : ""), label);
        cb.type = "button";
        cb.addEventListener("click", () => {
          state.brush.tip = key;
          Broadcast();
          openToolPopup(null, null, true);
        });
        tipRow.append(cb);
      }
      pop.append(Construct("div", "property-label", "Brush Tip Shape"), tipRow);

      if (tool === "paint") {
        const swRow = Construct("div", "tool-popup-swatches");
        for (const hex of QUICK_SWATCHES) {
          const sw = Construct("button", "tool-popup-swatch" + (state.brush.color.toLowerCase() === hex ? " active" : ""));
          sw.type = "button";
          sw.style.background = hex;
          sw.title = hex;
          sw.addEventListener("click", () => {
            state.brush.color = hex;
            Broadcast();
            openToolPopup(null, null, true);
          });
          swRow.append(sw);
        }
        const cInp = document.createElement("input");
        cInp.type = "color"; cInp.value = state.brush.color; cInp.className = "color-native";
        cInp.addEventListener("input", () => { state.brush.color = cInp.value; Broadcast(); });
        swRow.append(cInp);
        pop.append(Construct("div", "property-label", "Ink Color"), swRow);
      }

      makePopupSlider(pop, "Brush Size", 0.03, 0.9, 0.01, "m", () => state.brush.size, (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); });
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
      makePopupSlider(pop, "Flow", 0.05, 1, 0.01, "", () => state.brush.flow, (v) => { state.brush.flow = v; });
      makePopupSlider(pop, "Hardness", 0.05, 0.98, 0.01, "", () => state.brush.hardness, (v) => { state.brush.hardness = v; });
      if (tool === "paint") {
        makePopupSlider(pop, "Roughness", 0.02, 1, 0.01, "", () => state.brush.roughness, (v) => { state.brush.roughness = v; });
        makePopupSlider(pop, "Metalness", 0, 1, 0.01, "", () => state.brush.metalness, (v) => { state.brush.metalness = v; });
      }
    } else if (tool === "fill") {
      const scRow = Construct("div", "chip-strip");
      for (const [label, sc] of [["Mesh Part", "part"], ["UV Island", "island"], ["Whole Mesh", "all"]]) {
        const b = Construct("button", "chip-btn" + (state.fillScope === sc ? " active" : ""), label);
        b.type = "button";
        b.addEventListener("click", () => { state.fillScope = sc; Broadcast(); openToolPopup(null, null, true); });
        scRow.append(b);
      }
      pop.append(Construct("div", "property-label", "Flood Fill Scope"), scRow);

      const swRow = Construct("div", "tool-popup-swatches");
      for (const hex of QUICK_SWATCHES) {
        const sw = Construct("button", "tool-popup-swatch" + (state.brush.color.toLowerCase() === hex ? " active" : ""));
        sw.type = "button"; sw.style.background = hex;
        sw.addEventListener("click", () => { state.brush.color = hex; Broadcast(); openToolPopup(null, null, true); });
        swRow.append(sw);
      }
      pop.append(Construct("div", "property-label", "Fill Color"), swRow);
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
      makePopupSlider(pop, "Roughness", 0.02, 1, 0.01, "", () => state.brush.roughness, (v) => { state.brush.roughness = v; });
      makePopupSlider(pop, "Metalness", 0, 1, 0.01, "", () => state.brush.metalness, (v) => { state.brush.metalness = v; });
    } else if (tool === "stamp") {
      const gridBox = Construct("div", "tool-popup-stamp-grid");
      for (const sp of stampPreviews) {
        const card = Construct("button", "preset-card" + (state.brush.stampName === sp.name ? " active" : ""));
        card.type = "button";
        card.append(
          Construct("small", null, sp.entry.group || "Stamp Decal"),
          Construct("strong", null, sp.name),
        );
        card.addEventListener("click", () => {
          state.brush.stampData = sp.evaluated;
          state.brush.stampName = sp.name;
          if (gpuPaint.isActive) gpuPaint.ensureStampTexture(sp.evaluated);
          Broadcast();
          openToolPopup(null, null, true);
          Toast(`Loaded stamp "${sp.name}"`);
        });
        gridBox.append(card);
      }
      pop.append(Construct("div", "property-label", `Active Stamp: ${state.brush.stampName}`), gridBox);
      makePopupSlider(pop, "Decal Scale", 0.04, 0.9, 0.01, "m", () => state.brush.size, (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); });
      makePopupSlider(pop, "Rotation", -180, 180, 1, "°", () => state.brush.angle, (v) => { state.brush.angle = v; });
      makePopupSlider(pop, "Opacity", 0.05, 1, 0.01, "", () => state.brush.opacity, (v) => { state.brush.opacity = v; });
      makePopupSlider(pop, "Relief Height", -1, 1, 0.02, "", () => state.brush.height, (v) => { state.brush.height = v; });
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
    Broadcast();
  }

  function renderLeftColumn() {
    leftInner.innerHTML = "";

    const addBar = Construct("div", "chip-strip");
    for (const [label, kind] of [
      ["+ Paint", "paint"],
      ["+ Fill", "fill"],
      ["+ Material", "material"],
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
      const sub = `${layer.kind.toUpperCase()} · ${layer.blend} · ${partTag}`;
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
          layer.mask = { enabled: true, invert: false, pixels: new Uint8ClampedArray(res * res).fill(255) };
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

    rightInner.append(
      Construct("div", "object-heading", [
        Construct("div", "object-symbol", ConstructGlyph("Brush")),
        Construct("div", "object-heading-copy", [
          Construct("strong", null, layer ? layer.name : "No Layer"),
          Construct("span", null, state.doc.editingMask ? "EDITING LAYER MASK (WHITE=SHOW)" : `${layer?.kind?.toUpperCase() || "PAINT"} LAYER`),
        ]),
      ]),
    );

    MetricTrio(rightInner, [
      { Label: "GPU Canvas", Highlight: true, Read: () => ({ value: `${res}px`, sub: gpuPaint.isActive ? "WebGL2 RT" : "CPU Mock" }) },
      { Label: "Parts", Read: () => ({ value: String(meshIndex?.partNames?.length || 1), sub: `${meshIndex?.islandCount || 1} Islands` }) },
      { Label: "Baked Maps", Read: () => ({ value: state.doc.bakedMaps ? "Linked" : "Geom", sub: state.doc.bakedMaps ? "High/Low AO" : "Auto Cues" }) },
    ]);

    const bSec = SectionCard(rightInner, { Title: "Brush & Tool Parameters", Glyph: "Brush" });
    SegmentedRow(bSec.Inner, {
      Label: "Brush Tip",
      Options: [["Round", "round"], ["Chisel", "chisel"], ["Chalk", "chalk"], ["Splatter", "splatter"], ["Sponge", "sponge"]],
      Read: () => state.brush.tip,
      Write: (v) => { state.brush.tip = v; },
    });
    ColorRow(bSec.Inner, { Label: "Paint Color", Read: () => state.brush.color, Write: (hex) => { state.brush.color = hex; } });
    SliderRow(bSec.Inner, { Label: "3D Radius", Minimum: 0.03, Maximum: 0.9, Step: 0.01, Unit: "m", Read: () => state.brush.size, Write: (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); } });
    SliderRow(bSec.Inner, { Label: "Opacity", Minimum: 0.05, Maximum: 1, Step: 0.01, Read: () => state.brush.opacity, Write: (v) => { state.brush.opacity = v; } });
    SliderRow(bSec.Inner, { Label: "Flow", Minimum: 0.05, Maximum: 1, Step: 0.01, Read: () => state.brush.flow, Write: (v) => { state.brush.flow = v; } });
    SliderRow(bSec.Inner, { Label: "Hardness", Minimum: 0.05, Maximum: 0.98, Step: 0.01, Read: () => state.brush.hardness, Write: (v) => { state.brush.hardness = v; } });
    SliderRow(bSec.Inner, { Label: "Brush Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => state.brush.roughness, Write: (v) => { state.brush.roughness = v; } });
    SliderRow(bSec.Inner, { Label: "Brush Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => state.brush.metalness, Write: (v) => { state.brush.metalness = v; } });
    SliderRow(bSec.Inner, { Label: "Brush Height Relief", Minimum: -1, Maximum: 1, Step: 0.02, Read: () => state.brush.height, Write: (v) => { state.brush.height = v; } });
    SegmentedRow(bSec.Inner, {
      Label: "Fill Tool Scope",
      Options: [["Mesh Part", "part"], ["UV Island", "island"], ["Whole Mesh", "all"]],
      Read: () => state.fillScope,
      Write: (v) => { state.fillScope = v; },
    });

    if (layer) {
      const lSec = SectionCard(rightInner, { Title: "Active Layer Modifier & Target", Glyph: "Layers", Badge: layer.kind.toUpperCase() });
      TextRow(lSec.Inner, { Label: "Layer Name", Read: () => layer.name, Write: (v) => { layer.name = v; renderLeftColumn(); } });
      SelectRow(lSec.Inner, {
        Label: "Blend Mode",
        Options: ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => [b, b]),
        Read: () => layer.blend,
        Write: (v) => { layer.blend = v; refreshComposite(); renderLeftColumn(); },
      });
      SliderRow(lSec.Inner, { Label: "Layer Opacity", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.opacity, Write: (v) => { layer.opacity = v; refreshComposite(); } });
      const partOpts = [["All Mesh Parts", -1], ...(meshIndex?.partNames || ["Surface"]).map((n, i) => [n, i])];
      SelectRow(lSec.Inner, { Label: "Target Part Filter", Options: partOpts, Read: () => layer.partFilter ?? -1, Write: (v) => { layer.partFilter = Number(v); refreshComposite(); renderLeftColumn(); } });

      if (layer.kind === "fill") {
        ColorRow(lSec.Inner, { Label: "Fill Color", Read: () => layer.fill.color, Write: (v) => { layer.fill.color = v; refreshComposite(); renderLeftColumn(); } });
        SliderRow(lSec.Inner, { Label: "Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.fill.roughness, Write: (v) => { layer.fill.roughness = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.fill.metalness, Write: (v) => { layer.fill.metalness = v; refreshComposite(); } });
        if (appBridge?.shared?.patternData) {
          ActionRow(lSec.Inner, [{
            Label: "Apply Pattern Studio Tile",
            Glyph: "Pattern",
            Tone: "warm",
            Act: () => { layer.fill.patternData = appBridge.shared.patternData; refreshComposite(); Toast("Applied Pattern Studio tile to Fill layer"); },
          }]);
        }
        if (layer.fill.patternData) {
          SliderRow(lSec.Inner, { Label: "Pattern Repeats", Minimum: 1, Maximum: 12, Step: 1, Read: () => layer.fill.patternRepeats || 3, Write: (v) => { layer.fill.patternRepeats = v; refreshComposite(); } });
        }
      } else if (layer.kind === "material") {
        SelectRow(lSec.Inner, {
          Label: "Frontier Material",
          Options: MATERIAL_CATALOG.slice(0, 24).map((m) => [m.name, m.id]),
          Read: () => layer.material.presetId,
          Write: (id) => {
            const found = MATERIAL_CATALOG.find((m) => m.id === id);
            if (found) {
              layer.material.presetId = found.id;
              layer.material.presetName = found.name;
              layer.material.color = found.color;
              layer.material.roughness = found.roughness;
              layer.material.metalness = found.metalness;
              refreshComposite();
              renderLeftColumn();
            }
          },
        });
        SliderRow(lSec.Inner, { Label: "Micro Grain Scale", Minimum: 1, Maximum: 32, Step: 0.5, Read: () => layer.material.grainScale, Write: (v) => { layer.material.grainScale = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Grain Contrast", Minimum: 0, Maximum: 0.35, Step: 0.01, Read: () => layer.material.grainStrength, Write: (v) => { layer.material.grainStrength = v; refreshComposite(); } });
      } else if (layer.kind === "generator") {
        SegmentedRow(lSec.Inner, { Label: "Generator Type", Options: [["Edge Wear", "edge-wear"], ["Crevice Dirt", "crevice-dirt"], ["Top Dust", "top-dust"]], Read: () => layer.generator.preset, Write: (v) => { layer.generator.preset = v; refreshComposite(); } });
        ColorRow(lSec.Inner, { Label: "Effect Color", Read: () => layer.generator.color, Write: (v) => { layer.generator.color = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Threshold", Minimum: 0.05, Maximum: 0.95, Step: 0.01, Read: () => layer.generator.threshold, Write: (v) => { layer.generator.threshold = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Softness", Minimum: 0.02, Maximum: 0.8, Step: 0.01, Read: () => layer.generator.softness, Write: (v) => { layer.generator.softness = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Noise Breakup", Minimum: 0, Maximum: 0.9, Step: 0.02, Read: () => layer.generator.noiseMix, Write: (v) => { layer.generator.noiseMix = v; refreshComposite(); } });
      }

      if (layer.mask) {
        const maskSec = SectionCard(rightInner, { Title: "Layer Mask Controls", Glyph: "Sparkles", Open: state.doc.editingMask });
        SwitchRow(maskSec.Inner, { Label: "Paint on Mask", Read: () => !!state.doc.editingMask, Write: (v) => { state.doc.editingMask = v; renderLeftColumn(); refreshComposite(); } });
        SwitchRow(maskSec.Inner, { Label: "Mask Enabled", Read: () => !!layer.mask.enabled, Write: (v) => { layer.mask.enabled = v; renderLeftColumn(); refreshComposite(); } });
        SwitchRow(maskSec.Inner, { Label: "Invert Mask", Read: () => !!layer.mask.invert, Write: (v) => { layer.mask.invert = v; refreshComposite(); } });
        ActionRow(maskSec.Inner, [
          { Label: "Fill White", Act: () => { layer.mask.pixels?.fill(255); if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 1); refreshComposite(); } },
          { Label: "Fill Black", Act: () => { layer.mask.pixels?.fill(0); if (gpuPaint.isActive) gpuPaint.fillMaskGpu(layer, 0); refreshComposite(); } },
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
    const exp = gpuPaint.isActive ? gpuPaint.readExportChannels() : lastCpuComp;
    if (!exp) return;
    downloadRgbaPng(exp.albedo, res, `${state.meshId}-albedo.png`, false);
    downloadRgbaPng(exp.roughness, res, `${state.meshId}-roughness.png`, true);
    downloadRgbaPng(exp.metalness, res, `${state.meshId}-metalness.png`, true);
    downloadRgbaPng(exp.normal, res, `${state.meshId}-normal.png`, false);
    Toast("Exported Albedo, Roughness, Metalness & Normal PNGs");
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

  return {
    name: "Texture Paint",
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
      state.brush.stampData = stampEval;
      state.brush.stampName = stampEval.name || "Stamp Decal";
      if (gpuPaint.isActive) gpuPaint.ensureStampTexture(stampEval);
      selectTool("stamp");
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
