/*==========================================================================================================================================
                                                       TEXTUREPAINTWORKSPACE.JS
==========================================================================================================================================*/
/* Redesigned, clean, seam-free 3D + 2D UV Texture Painting Studio:
   - Unified Paint / Fill / Material / Decal / Weathering Generator / Folder layer stack with per-layer Masks
   - Working 3D surface raycast stroke accumulator (zero UDIM clamping bugs, zero seam tears, instant hover ring cursor)
   - Synchronized 2D UV painting pane + PBR channel solo view + Undo/Redo + .OBJ/.STL import + Baking/Pattern/Stamp bridges. */

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

export function mountTexturePaintWorkspace(root, appBridge) {
  const res = 512;
  const defaultStampCatalog = listStampStarterCatalog();
  const defaultStampDoc = loadStarterAsArtworkDocument(defaultStampCatalog[0]);
  const defaultStampEval = evaluateArtworkDocument(defaultStampDoc, 256);

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
      size: 0.24, // 3D world radius
      pixelRadius: 24,
      opacity: 0.92,
      flow: 0.78,
      hardness: 0.72,
      roundness: 1.0,
      angle: 0,
      channels: { albedo: true, roughness: true, metalness: true, height: true },
      stampName: defaultStampDoc.name,
      stampData: defaultStampEval,
    },
    undoStack: [],
    redoStack: [],
    wireframe: false,
    hoverInfo: "Hover mesh to paint",
  };

  // Pick up any bridged data queued from Material / Pattern / Stamp / Baking tabs!
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
  let activeStroke = null;
  let lastHitPos = null;
  let isPainting3D = false;
  let isPainting2D = false;
  let inspectorScope = null;
  let rafId = 0;
  let disposed = false;

  // ----------------------------------------------------------------- DOM LAYOUT
  const grid = Construct("div", "studio-grid");

  // LEFT: LAYER STACK
  const leftCol = Construct("aside", "studio-column");
  leftCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Paint Layer Stack"),
      Construct("span", "panel-heading-meta", `${res}×${res} PBR`),
    ]),
  );
  const leftScroll = Construct("div", "panel-scroll");
  const leftInner = Construct("div", "panel-scroll-inner");
  leftScroll.append(leftInner);
  const leftFooter = Construct("div", "panel-footer", [
    Construct("span", null, "Seams Dilated +2px"),
    Construct("span", null, "Non-destructive Stack"),
  ]);
  leftCol.append(leftScroll, leftFooter);

  // CENTER: TOOLBAR + 3D/UV VIEWPORT
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

  toolbar.append(
    toolGroup,
    meshSelect,
    vpSelect,
    chanSelect,
    Construct("div", "toolbar-spacer"),
    btnUndo,
    btnRedo,
    btnImportMesh,
    importInp,
    btnExportAll,
  );

  const stage = Construct("div", "viewport-stage");
  const splitBox = Construct("div", "viewport-split-2d");
  const pane3D = Construct("div", "viewport-split-pane");
  pane3D.append(Construct("span", "pane-badge", "3D Surface Viewport"));
  const pane2D = Construct("div", "viewport-split-pane");
  pane2D.append(Construct("span", "pane-badge", "2D UV Texture Canvas"));
  const uvCanvas = document.createElement("canvas");
  uvCanvas.width = res;
  uvCanvas.height = res;
  uvCanvas.style.cssText = "width:100%;height:100%;object-fit:contain;cursor:crosshair;";
  pane2D.append(uvCanvas);

  splitBox.append(pane3D, pane2D);
  const hudHelp = Construct("div", "viewport-hud-bottom", "Left-drag on mesh to paint · Drag background or Alt+Drag to orbit · B/E/G/S/I switch tools");
  stage.append(splitBox, hudHelp);
  centerCol.append(toolbar, stage);

  // RIGHT: BRUSH & LAYER INSPECTOR
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Brush & Layer Inspector"),
      Construct("span", "panel-heading-meta", "3D RAYCAST PAINT"),
    ]),
  );
  const rightScroll = Construct("div", "panel-scroll");
  const rightInner = Construct("div", "panel-scroll-inner");
  rightScroll.append(rightInner);
  rightCol.append(
    rightScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "All channels composite in real time"),
      Construct("span", null, "Live Undo/Redo"),
    ]),
  );

  grid.append(leftCol, centerCol, rightCol);
  root.append(grid);
  SmoothScroll(leftScroll, leftInner);
  SmoothScroll(rightScroll, rightInner);

  // ----------------------------------------------------------------- THREE.JS 3D PAINT STAGE
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  pane3D.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e0f12");
  const envTex = createPaintEnv(renderer);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
  camera.position.set(2.9, 2.0, 3.6);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.target.set(0, 0.08, 0);

  const keyL = new THREE.DirectionalLight("#fff8eb", 2.3);
  keyL.position.set(3.5, 4.8, 3.8);
  const fillL = new THREE.DirectionalLight("#a8c6ff", 0.95);
  fillL.position.set(-4, 2, -3);
  const hemiL = new THREE.HemisphereLight("#eef3ff", "#1a1a1f", 0.65);
  scene.add(keyL, fillL, hemiL);

  // GPU Texture backing for composited Albedo / Roughness / Metalness / Normal!
  const albedoTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.flipY = true;
  albedoTex.needsUpdate = true;

  const roughTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  roughTex.flipY = true;
  roughTex.needsUpdate = true;

  const metalTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  metalTex.flipY = true;
  metalTex.needsUpdate = true;

  const normalTex = new THREE.DataTexture(new Uint8Array(res * res * 4), res, res, THREE.RGBAFormat);
  normalTex.flipY = true;
  normalTex.needsUpdate = true;

  const paintMat = new THREE.MeshStandardMaterial({
    map: albedoTex,
    roughnessMap: roughTex,
    metalnessMap: metalTex,
    normalMap: normalTex,
    roughness: 1.0,
    metalness: 1.0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });

  let paintMesh = null;
  let wireOverlay = null;
  let lastComposited = null;

  // 3D Brush Ring Reticle (tracks hit point & normal cleanly!)
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

  // ----------------------------------------------------------------- MESH & COMPOSITOR
  function rebuildPaintMesh(customGeometry = null) {
    meshGeo = customGeometry || buildPaintTargetGeometry(state.meshId);
    meshIndex = buildMeshPaintIndex(meshGeo);
    meshCues = buildDefaultMeshCues(meshGeo, meshIndex, res);
    if (paintMesh) {
      scene.remove(paintMesh);
      paintMesh.geometry.dispose();
    }
    if (wireOverlay) {
      scene.remove(wireOverlay);
      wireOverlay.geometry.dispose();
    }
    paintMesh = new THREE.Mesh(meshGeo, paintMat);
    scene.add(paintMesh);

    const wfGeo = new THREE.WireframeGeometry(meshGeo);
    wireOverlay = new THREE.LineSegments(
      wfGeo,
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.14 }),
    );
    wireOverlay.visible = state.wireframe;
    scene.add(wireOverlay);

    refreshComposite();
    rebuildInspector();
  }

  function refreshComposite() {
    if (!meshCues || disposed) return;
    const comp = compositePaintDocument(state.doc, meshCues, {
      liveStroke: activeStroke,
      liveBrush: state.brush,
      viewChannel: state.viewChannel,
    });
    lastComposited = comp;

    // Upload Albedo + Normal directly
    albedoTex.image.data.set(comp.albedo);
    albedoTex.needsUpdate = true;

    normalTex.image.data.set(comp.normal);
    normalTex.needsUpdate = true;

    // Pack grayscale Roughness & Metalness into RGBA DataTextures cleanly
    const rData = roughTex.image.data;
    const mData = metalTex.image.data;
    for (let i = 0; i < res * res; i++) {
      const rv = state.viewChannel === "lit" ? comp.roughness[i] : 220;
      const mv = state.viewChannel === "lit" ? comp.metalness[i] : 0;
      const i4 = i * 4;
      rData[i4] = rData[i4 + 1] = rData[i4 + 2] = rv;
      rData[i4 + 3] = 255;
      mData[i4] = mData[i4 + 1] = mData[i4 + 2] = mv;
      mData[i4 + 3] = 255;
    }
    roughTex.needsUpdate = true;
    metalTex.needsUpdate = true;

    // Draw synchronized 2D UV Canvas + UV wireframe lines
    const uctx = uvCanvas.getContext("2d");
    uctx.putImageData(new ImageData(new Uint8ClampedArray(comp.albedo), res, res), 0, 0);
    if (meshIndex && state.viewportMode !== "3d") {
      uctx.strokeStyle = "rgba(255,255,255,0.16)";
      uctx.lineWidth = 0.75;
      uctx.beginPath();
      for (let t = 0; t < meshIndex.tris.length; t += 2) {
        const tri = meshIndex.tris[t];
        uctx.moveTo(tri.uv0[0] * res, (1 - tri.uv0[1]) * res);
        uctx.lineTo(tri.uv1[0] * res, (1 - tri.uv1[1]) * res);
        uctx.lineTo(tri.uv2[0] * res, (1 - tri.uv2[1]) * res);
        uctx.closePath();
      }
      uctx.stroke();
    }
  }

  // ----------------------------------------------------------------- UNDO / REDO
  function snapshotSelectedLayer() {
    const layer = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId);
    if (!layer) return null;
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
    if (state.undoStack.length > 25) state.undoStack.shift();
    state.redoStack.length = 0;
    syncUndoButtons();
  }

  function applySnapshot(snap) {
    const layer = state.doc.layers.find((l) => l.id === snap.layerId);
    if (!layer) return;
    if (snap.pixels && layer.pixels) layer.pixels = clonePixels(snap.pixels);
    if (snap.maskPixels && layer.mask) layer.mask.pixels = new Uint8ClampedArray(snap.maskPixels);
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

  // ----------------------------------------------------------------- 3D RAYCAST + PAINTING HANDLERS
  function raycastMeshFromEvent(e) {
    if (!paintMesh) return null;
    const rect = renderer.domElement.getBoundingClientRect();
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
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    brushRing.quaternion.copy(q);
    brushRing.scale.setScalar(state.brush.size);
  }

  function getTargetPaintableLayer(autoCreatePaint = true) {
    let layer = state.doc.layers.find((l) => l.id === state.doc.selectedLayerId);
    if (!layer || (layer.kind !== "paint" && !state.doc.editingMask)) {
      if (state.doc.editingMask && layer && layer.mask?.pixels) return layer;
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
    const steps = Math.max(1, Math.min(24, Math.ceil(dist / step)));
    const temp = new THREE.Vector3();
    for (let s = 0; s <= steps; s++) {
      temp.lerpVectors(pStart, pEnd, steps === 0 ? 1 : s / steps);
      applyBrushDab3D({
        strokeAccum: activeStroke,
        meshIndex,
        cues: meshCues,
        hitPos: temp,
        hitNormal: normal,
        worldRadius: state.brush.size,
        brush: state.brush,
        activePartFilter: partFilter,
      });
    }
    refreshComposite();
  }

  let pendingUndoSnap = null;

  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.altKey) return;
    const hit = raycastMeshFromEvent(e);
    if (!hit) return; // Empty space allows OrbitControls seamlessly!

    if (state.brush.tool === "eyedropper") {
      if (hit.uv && lastComposited) {
        const s = sampleCompositedAtUV(lastComposited, hit.uv.x, hit.uv.y);
        state.brush.color = s.color;
        state.brush.roughness = s.roughness;
        state.brush.metalness = s.metalness;
        state.brush.height = s.height;
        Broadcast();
        Toast(`Sampled ${s.color}`);
      }
      return;
    }

    const layer = getTargetPaintableLayer(true);
    if (!layer || layer.locked) return;

    if (state.brush.tool === "fill") {
      const snap = snapshotSelectedLayer();
      const px = hit.uv ? Math.min(res - 1, Math.max(0, Math.floor(hit.uv.x * res))) : -1;
      const py = hit.uv ? Math.min(res - 1, Math.max(0, Math.floor((1 - hit.uv.y) * res))) : -1;
      const pid = px >= 0 && py >= 0 ? py * res + px : -1;
      const ok = applyFloodFill({
        layer,
        cues: meshCues,
        hitTriIndex: pid,
        scope: state.fillScope,
        brush: state.brush,
        editingMask: state.doc.editingMask,
      });
      if (ok) {
        pushUndoSnapshot(snap);
        refreshComposite();
        Toast(`Filled ${state.fillScope} scope`);
      }
      return;
    }

    // Begin 3D Brush / Eraser / Stamp Stroke!
    orbit.enabled = false;
    isPainting3D = true;
    pendingUndoSnap = snapshotSelectedLayer();
    activeStroke = createStrokeAccumulator(res);
    lastHitPos = hit.point.clone();
    const norm = hit.face ? hit.face.normal.clone().transformDirection(paintMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    dabAlongSegment3D(hit.point, hit.point, norm);
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (e) => {
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
    if (layer && activeStroke) {
      const committed = commitStrokeAccumulator(layer, activeStroke, state.brush, state.doc.editingMask);
      if (committed && pendingUndoSnap) pushUndoSnapshot(pendingUndoSnap);
    }
    activeStroke = null;
    lastHitPos = null;
    pendingUndoSnap = null;
    refreshComposite();
  };
  renderer.domElement.addEventListener("pointerup", endStroke3D);
  renderer.domElement.addEventListener("pointercancel", endStroke3D);

  // Synchronized 2D UV Canvas Painting!
  function uvFromCanvasEvent(e) {
    const rect = uvCanvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const ox = rect.left + (rect.width - size) / 2;
    const oy = rect.top + (rect.height - size) / 2;
    const u = Math.max(0, Math.min(1, (e.clientX - ox) / size));
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - oy) / size));
    return { u, v };
  }

  uvCanvas.addEventListener("pointerdown", (e) => {
    const { u, v } = uvFromCanvasEvent(e);
    if (state.brush.tool === "eyedropper" && lastComposited) {
      const s = sampleCompositedAtUV(lastComposited, u, v);
      state.brush.color = s.color;
      Broadcast();
      Toast(`Sampled ${s.color}`);
      return;
    }
    const layer = getTargetPaintableLayer(true);
    if (!layer) return;
    if (state.brush.tool === "fill") {
      const snap = snapshotSelectedLayer();
      const px = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
      const py = Math.min(res - 1, Math.max(0, Math.floor((1 - v) * res)));
      const pid = py * res + px;
      applyFloodFill({ layer, cues: meshCues, hitTriIndex: pid, scope: state.fillScope, brush: state.brush, editingMask: state.doc.editingMask });
      pushUndoSnapshot(snap);
      refreshComposite();
      return;
    }
    isPainting2D = true;
    pendingUndoSnap = snapshotSelectedLayer();
    activeStroke = createStrokeAccumulator(res);
    applyBrushDabUV({ strokeAccum: activeStroke, cues: meshCues, u, v, pixelRadius: state.brush.pixelRadius, brush: state.brush, activePartFilter: layer.partFilter ?? -1 });
    refreshComposite();
    uvCanvas.setPointerCapture(e.pointerId);
  });

  uvCanvas.addEventListener("pointermove", (e) => {
    if (!isPainting2D || !activeStroke) return;
    const { u, v } = uvFromCanvasEvent(e);
    const layer = getTargetPaintableLayer(false);
    applyBrushDabUV({ strokeAccum: activeStroke, cues: meshCues, u, v, pixelRadius: state.brush.pixelRadius, brush: state.brush, activePartFilter: layer?.partFilter ?? -1 });
    refreshComposite();
  });

  const endStroke2D = () => {
    if (!isPainting2D) return;
    isPainting2D = false;
    const layer = getTargetPaintableLayer(false);
    if (layer && activeStroke) {
      const committed = commitStrokeAccumulator(layer, activeStroke, state.brush, state.doc.editingMask);
      if (committed && pendingUndoSnap) pushUndoSnapshot(pendingUndoSnap);
    }
    activeStroke = null;
    pendingUndoSnap = null;
    refreshComposite();
  };
  uvCanvas.addEventListener("pointerup", endStroke2D);
  uvCanvas.addEventListener("pointercancel", endStroke2D);

  // ----------------------------------------------------------------- UI RENDERERS
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
    for (const layer of layersTopDown) {
      const isSelected = layer.id === state.doc.selectedLayerId;
      const row = Construct("div", "stack-row" + (isSelected ? " active" : ""));

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
        if (state.doc.layers.length <= 1) {
          Toast("Keep at least one layer");
          return;
        }
        state.doc.layers = state.doc.layers.filter((l) => l.id !== layer.id);
        if (state.doc.selectedLayerId === layer.id) state.doc.selectedLayerId = state.doc.layers[state.doc.layers.length - 1].id;
        renderLeftColumn();
        rebuildInspector();
        refreshComposite();
      });

      row.append(thumb, info, maskPill, visBtn, delBtn);
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
      { Label: "Canvas", Highlight: true, Read: () => ({ value: `${res}px`, sub: "PBR Stack" }) },
      { Label: "Parts", Read: () => ({ value: String(meshIndex?.partNames?.length || 1), sub: `${meshIndex?.islandCount || 1} Islands` }) },
      { Label: "Baked Maps", Read: () => ({ value: state.doc.bakedMaps ? "Linked" : "Geom", sub: state.doc.bakedMaps ? "High/Low AO" : "Auto Cues" }) },
    ]);

    // 1. Brush Settings Card
    const bSec = SectionCard(rightInner, { Title: "Brush & Tool Parameters", Glyph: "Brush" });
    SegmentedRow(bSec.Inner, {
      Label: "Brush Tip",
      Options: [["Round", "round"], ["Chisel", "chisel"], ["Chalk", "chalk"], ["Splatter", "splatter"], ["Sponge", "sponge"]],
      Read: () => state.brush.tip,
      Write: (v) => { state.brush.tip = v; },
    });
    ColorRow(bSec.Inner, {
      Label: "Paint Color",
      Read: () => state.brush.color,
      Write: (hex) => { state.brush.color = hex; },
    });
    SliderRow(bSec.Inner, {
      Label: "3D Radius",
      Minimum: 0.03, Maximum: 0.9, Step: 0.01, Unit: "m",
      Read: () => state.brush.size,
      Write: (v) => { state.brush.size = v; state.brush.pixelRadius = Math.round(v * 110); },
    });
    SliderRow(bSec.Inner, {
      Label: "Opacity",
      Minimum: 0.05, Maximum: 1, Step: 0.01,
      Read: () => state.brush.opacity,
      Write: (v) => { state.brush.opacity = v; },
    });
    SliderRow(bSec.Inner, {
      Label: "Flow",
      Minimum: 0.05, Maximum: 1, Step: 0.01,
      Read: () => state.brush.flow,
      Write: (v) => { state.brush.flow = v; },
    });
    SliderRow(bSec.Inner, {
      Label: "Hardness",
      Minimum: 0.05, Maximum: 0.98, Step: 0.01,
      Read: () => state.brush.hardness,
      Write: (v) => { state.brush.hardness = v; },
    });
    SliderRow(bSec.Inner, {
      Label: "Brush Roughness",
      Minimum: 0.02, Maximum: 1, Step: 0.01,
      Read: () => state.brush.roughness,
      Write: (v) => { state.brush.roughness = v; },
    });
    SliderRow(bSec.Inner, {
      Label: "Brush Metalness",
      Minimum: 0, Maximum: 1, Step: 0.01,
      Read: () => state.brush.metalness,
      Write: (v) => { state.brush.metalness = v; },
    });
    SliderRow(bSec.Inner, {
      Label: "Brush Height Relief",
      Minimum: -1, Maximum: 1, Step: 0.02,
      Read: () => state.brush.height,
      Write: (v) => { state.brush.height = v; },
    });
    SegmentedRow(bSec.Inner, {
      Label: "Fill Tool Scope",
      Options: [["Mesh Part", "part"], ["UV Island", "island"], ["Whole Mesh", "all"]],
      Read: () => state.fillScope,
      Write: (v) => { state.fillScope = v; },
    });

    // 2. Active Layer Properties Card
    if (layer) {
      const lSec = SectionCard(rightInner, { Title: "Active Layer Modifier & Target", Glyph: "Layers", Badge: layer.kind.toUpperCase() });
      TextRow(lSec.Inner, {
        Label: "Layer Name",
        Read: () => layer.name,
        Write: (v) => { layer.name = v; renderLeftColumn(); },
      });
      SelectRow(lSec.Inner, {
        Label: "Blend Mode",
        Options: ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"].map((b) => [b, b]),
        Read: () => layer.blend,
        Write: (v) => { layer.blend = v; refreshComposite(); renderLeftColumn(); },
      });
      SliderRow(lSec.Inner, {
        Label: "Layer Opacity",
        Minimum: 0, Maximum: 1, Step: 0.01,
        Read: () => layer.opacity,
        Write: (v) => { layer.opacity = v; refreshComposite(); },
      });
      const partOpts = [["All Mesh Parts", -1], ...(meshIndex?.partNames || ["Surface"]).map((n, i) => [n, i])];
      SelectRow(lSec.Inner, {
        Label: "Target Part Filter",
        Options: partOpts,
        Read: () => layer.partFilter ?? -1,
        Write: (v) => { layer.partFilter = Number(v); refreshComposite(); renderLeftColumn(); },
      });

      if (layer.kind === "fill") {
        ColorRow(lSec.Inner, { Label: "Fill Color", Read: () => layer.fill.color, Write: (v) => { layer.fill.color = v; refreshComposite(); renderLeftColumn(); } });
        SliderRow(lSec.Inner, { Label: "Roughness", Minimum: 0.02, Maximum: 1, Step: 0.01, Read: () => layer.fill.roughness, Write: (v) => { layer.fill.roughness = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Metalness", Minimum: 0, Maximum: 1, Step: 0.01, Read: () => layer.fill.metalness, Write: (v) => { layer.fill.metalness = v; refreshComposite(); } });
        if (appBridge?.shared?.patternData) {
          ActionRow(lSec.Inner, [{
            Label: "Apply Pattern Studio Tile",
            Glyph: "Pattern",
            Tone: "warm",
            Act: () => {
              layer.fill.patternData = appBridge.shared.patternData;
              refreshComposite();
              Toast("Applied Pattern Studio tile to Fill layer");
            },
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
        SegmentedRow(lSec.Inner, {
          Label: "Generator Type",
          Options: [["Edge Wear", "edge-wear"], ["Crevice Dirt", "crevice-dirt"], ["Top Dust", "top-dust"]],
          Read: () => layer.generator.preset,
          Write: (v) => { layer.generator.preset = v; refreshComposite(); },
        });
        ColorRow(lSec.Inner, { Label: "Effect Color", Read: () => layer.generator.color, Write: (v) => { layer.generator.color = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Threshold", Minimum: 0.05, Maximum: 0.95, Step: 0.01, Read: () => layer.generator.threshold, Write: (v) => { layer.generator.threshold = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Softness", Minimum: 0.02, Maximum: 0.8, Step: 0.01, Read: () => layer.generator.softness, Write: (v) => { layer.generator.softness = v; refreshComposite(); } });
        SliderRow(lSec.Inner, { Label: "Noise Breakup", Minimum: 0, Maximum: 0.9, Step: 0.02, Read: () => layer.generator.noiseMix, Write: (v) => { layer.generator.noiseMix = v; refreshComposite(); } });
      }

      if (layer.mask) {
        const maskSec = SectionCard(rightInner, { Title: "Layer Mask Controls", Glyph: "Sparkles", Open: state.doc.editingMask });
        SwitchRow(maskSec.Inner, {
          Label: "Paint on Mask",
          Read: () => !!state.doc.editingMask,
          Write: (v) => { state.doc.editingMask = v; renderLeftColumn(); refreshComposite(); },
        });
        SwitchRow(maskSec.Inner, {
          Label: "Mask Enabled",
          Read: () => !!layer.mask.enabled,
          Write: (v) => { layer.mask.enabled = v; renderLeftColumn(); refreshComposite(); },
        });
        SwitchRow(maskSec.Inner, {
          Label: "Invert Mask",
          Read: () => !!layer.mask.invert,
          Write: (v) => { layer.mask.invert = v; refreshComposite(); },
        });
        ActionRow(maskSec.Inner, [
          { Label: "Fill White", Act: () => { layer.mask.pixels.fill(255); refreshComposite(); } },
          { Label: "Fill Black", Act: () => { layer.mask.pixels.fill(0); refreshComposite(); } },
        ]);
      }
    }

    // Display & Wireframe
    const dSec = SectionCard(rightInner, { Title: "Viewport Options", Glyph: "Cube", Open: false });
    SwitchRow(dSec.Inner, {
      Label: "Mesh Wireframe Overlay",
      Read: () => state.wireframe,
      Write: (v) => { state.wireframe = v; if (wireOverlay) wireOverlay.visible = v; },
    });

    CloseScope(inspectorScope);
    Broadcast();
  }

  // ----------------------------------------------------------------- TOOLBAR & RESIZE EVENTS
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
    const w = pane3D.clientWidth || 600;
    const h = pane3D.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  meshSelect.addEventListener("change", () => {
    state.meshId = meshSelect.value;
    state.doc.meshId = state.meshId;
    rebuildPaintMesh();
    renderLeftColumn();
    Toast(`Loaded ${meshSelect.options[meshSelect.selectedIndex].text}`);
  });
  vpSelect.addEventListener("change", () => {
    state.viewportMode = vpSelect.value;
    syncViewportLayout();
    refreshComposite();
  });
  chanSelect.addEventListener("change", () => {
    state.viewChannel = chanSelect.value;
    refreshComposite();
  });

  importInp.addEventListener("change", async () => {
    const file = importInp.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let geo;
      if (ext === "obj") {
        const txt = await file.text();
        const grp = new OBJLoader().parse(txt);
        grp.traverse((ch) => { if (ch.isMesh && !geo) geo = ch.geometry.clone(); });
      } else if (ext === "stl") {
        const buf = await file.arrayBuffer();
        geo = new STLLoader().parse(buf);
      }
      if (geo) {
        geo.center();
        geo.computeBoundingSphere();
        const s = 1.45 / Math.max(0.01, geo.boundingSphere.radius || 1);
        geo.scale(s, s, s);
        const prepared = buildPaintTargetGeometry("custom", geo);
        rebuildPaintMesh(prepared);
        Toast(`Imported ${file.name}`);
      }
    } catch (err) {
      Toast(`Import error: ${err.message}`);
    }
    importInp.value = "";
  });

  btnExportAll.addEventListener("click", () => {
    if (!lastComposited) return;
    downloadRgbaPng(lastComposited.albedo, res, `${state.meshId}-albedo.png`, false);
    downloadRgbaPng(lastComposited.roughness, res, `${state.meshId}-roughness.png`, true);
    downloadRgbaPng(lastComposited.metalness, res, `${state.meshId}-metalness.png`, true);
    downloadRgbaPng(lastComposited.normal, res, `${state.meshId}-normal.png`, false);
    Toast("Exported Albedo, Roughness, Metalness & Normal PNGs");
  });

  const onKeyDown = (e) => {
    if (document.activeElement?.tagName === "INPUT") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); btnUndo.click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); btnRedo.click(); }
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
    renderer.render(scene, camera);
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
        fill: {
          color: "#ffffff",
          roughness: 0.45,
          metalness: 0.1,
          height: 0,
          patternRepeats: 3,
          patternData: patternEval,
        },
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
      selectTool("stamp");
      Toast(`Loaded "${state.brush.stampName}" into Stamp Brush`);
    },
    applyBakedMaps(bridgeData) {
      state.doc.bakedMaps = bridgeData;
      refreshComposite();
      Broadcast();
      Toast("Attached High/Low Baked AO + Curvature maps to Texture Paint");
    },
    getSnapshot: () => ({ meshId: state.meshId, layers: state.doc.layers.length, tool: state.brush.tool }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      if (inspectorScope) ReleaseScope(inspectorScope);
      orbit.dispose();
      envTex.dispose();
      albedoTex.dispose();
      roughTex.dispose();
      metalTex.dispose();
      normalTex.dispose();
      paintMat.dispose();
      if (paintMesh) paintMesh.geometry.dispose();
      if (wireOverlay) wireOverlay.geometry.dispose();
      renderer.dispose();
      root.innerHTML = "";
    },
  };
}
