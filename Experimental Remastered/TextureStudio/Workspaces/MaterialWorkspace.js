/*==========================================================================================================================================
                                                         MATERIALWORKSPACE.JS
==========================================================================================================================================*/
/* Preserved Look-Dev Material Studio with full Frontier 50+ procedural PBR shader library,
   real-time 3-point PMREM stage, recipe inspector, Frontier .material TOML export, and Texture Paint bridge. */

import * as THREE from "three";
import { OrbitControls } from "../Vendor/orbit-controls.esm.min.js";
import { RoundedBoxGeometry } from "../Vendor/addons/RoundedBoxGeometry.js";
import {
  materials as MATERIAL_CATALOG,
  createMaterial,
  normalizeMaterial,
  createBallGeometry,
} from "../Engine/Materials/materials.js";
import { createDrapedClothGeometry } from "../Engine/Materials/clothGeometry.js";
import { createLeatherSwatchGeometry } from "../Engine/Materials/leatherGeometry.js";
import { createBotanicalGeometry } from "../Engine/Materials/botanicalGeometry.js";
import {
  getRecipe,
  recipeControlValue,
  applyRecipeControl,
  applyRecipeColor,
} from "../Engine/Materials/materialProfiles.js";
import {
  exportMaterialJSON,
  exportMaterialTOML,
  exportMaterialShader,
} from "../Engine/Materials/materialExport.js";
import {
  Construct,
  ConstructGlyph,
  SectionCard,
  SliderRow,
  SwitchRow,
  ColorRow,
  ActionRow,
  MetricTrio,
  SmoothScroll,
  OpenScope,
  CloseScope,
  ReleaseScope,
  Broadcast,
  Toast,
} from "../StudioControls.js";

function createStudioEnvTexture(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#111318");

  const cardMat1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 3.45, 3.2) });
  const cardMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.85, 2.5) });
  const cardMat3 = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.85, 1.4) });
  const cardGeo = new THREE.PlaneGeometry(6, 4);

  const c1 = new THREE.Mesh(cardGeo, cardMat1);
  c1.position.set(4.5, 5.2, 4.2);
  c1.lookAt(0, 0, 0);
  const c2 = new THREE.Mesh(cardGeo, cardMat2);
  c2.position.set(-5.8, 2.2, -2.2);
  c2.lookAt(0, 0, 0);
  const c3 = new THREE.Mesh(cardGeo, cardMat3);
  c3.position.set(0.5, -4.5, 3.8);
  c3.lookAt(0, 0, 0);
  envScene.add(c1, c2, c3);

  const rt = pmrem.fromScene(envScene, 0.035);
  cardGeo.dispose();
  cardMat1.dispose();
  cardMat2.dispose();
  cardMat3.dispose();
  pmrem.dispose();
  return rt.texture;
}

function downloadBlob(text, filename, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountMaterialWorkspace(root, appBridge) {
  let state = {
    selectedId: MATERIAL_CATALOG[0].id,
    params: normalizeMaterial(MATERIAL_CATALOG[0]),
    category: "All",
    search: "",
    shape: "shaderball",
    backdrop: "obsidian",
    autoRotate: false,
    lightAzimuth: 38,
    exposure: 1.08,
  };

  let inspectorScope = null;
  let rafId = 0;
  let disposed = false;

  const grid = Construct("div", "studio-grid");

  // ----------------------------------------------------------------- LEFT: SCENE & SHADER STRATA OUTLINER (CATALOG MOVED TO BOTTOM ASSET BROWSER)
  const leftCol = Construct("aside", "studio-column");
  leftCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Material Scene & Strata"),
      Construct("span", "panel-heading-meta", "LOOK-DEV STAGE"),
    ]),
  );
  const leftScroll = Construct("div", "panel-scroll");
  const leftInner = Construct("div", "panel-scroll-inner");
  const sceneSummaryWrap = Construct("div");
  leftInner.append(sceneSummaryWrap);
  leftScroll.append(leftInner);
  leftCol.append(
    leftScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "Procedural Multi-Strata Shader"),
      Construct("span", null, "Materials in Bottom Browser"),
    ]),
  );

  // ----------------------------------------------------------------- CENTER: 3D STAGE
  const centerCol = Construct("main", "studio-column viewport-column");
  const toolbar = Construct("div", "viewport-toolbar");

  const shapeOptions = [
    ["Shader Ball", "shaderball"],
    ["Sphere", "sphere"],
    ["Draped Cloth", "cloth"],
    ["Leather Swatch", "leather"],
    ["Chamfer Box", "box"],
    ["Botanical", "leaf"],
  ];
  const shapeGroup = Construct("div", "toolbar-group");
  const shapeSelect = Construct("select");
  shapeSelect.style.cssText = "height:30px;padding:0 10px;background:#191a1d;border:1px solid var(--line);border-radius:999px;font-size:11.5px;";
  for (const [label, val] of shapeOptions) {
    const opt = Construct("option", null, label);
    opt.value = val;
    shapeSelect.append(opt);
  }
  shapeSelect.value = state.shape;
  shapeGroup.append(shapeSelect);

  const backdropOptions = [
    ["Obsidian", "obsidian", "#0d0e11"],
    ["Neutral", "neutral", "#1f2126"],
    ["Warm", "warm", "#221d18"],
    ["Daylight", "daylight", "#2a313a"],
  ];
  const bgGroup = Construct("div", "toolbar-group");
  const bgSelect = Construct("select");
  bgSelect.style.cssText = shapeSelect.style.cssText;
  for (const [label, val] of backdropOptions) {
    const opt = Construct("option", null, label);
    opt.value = val;
    bgSelect.append(opt);
  }
  bgGroup.append(bgSelect);

  const btnRotate = Construct("button", "pill-btn", [ConstructGlyph("Rotate"), Construct("span", null, "Spin")]);
  btnRotate.type = "button";
  const btnResetCam = Construct("button", "pill-btn", [ConstructGlyph("Focus"), Construct("span", null, "Reset View")]);
  btnResetCam.type = "button";
  const btnSendToPaint = Construct("button", "pill-btn accent", [ConstructGlyph("Brush"), Construct("span", null, "Send to Paint")]);
  btnSendToPaint.type = "button";

  toolbar.append(shapeGroup, bgGroup, btnRotate, btnResetCam, Construct("div", "toolbar-spacer"), btnSendToPaint);

  const stage = Construct("div", "viewport-stage");
  const stageHint = Construct("div", "viewport-hud-bottom", "Drag to orbit · Scroll to zoom · Right-drag to pan");
  stage.append(stageHint);
  centerCol.append(toolbar, stage);

  // ----------------------------------------------------------------- RIGHT: INSPECTOR
  const rightCol = Construct("aside", "studio-column");
  rightCol.append(
    Construct("div", "panel-heading", [
      Construct("h2", null, "Material Inspector"),
      Construct("span", "panel-heading-meta", "LOOK-DEV PBR"),
    ]),
  );
  const rightScroll = Construct("div", "panel-scroll");
  const rightInner = Construct("div", "panel-scroll-inner");
  rightScroll.append(rightInner);
  rightCol.append(
    rightScroll,
    Construct("div", "panel-footer", [
      Construct("span", null, "Drag pills to scrub values"),
      Construct("span", null, "Frontier Shading"),
    ]),
  );

  grid.append(leftCol, centerCol, rightCol);
  root.append(grid);
  SmoothScroll(leftScroll, leftInner);
  SmoothScroll(rightScroll, rightInner);

  // ----------------------------------------------------------------- THREE.JS SCENE
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = state.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d0e11");
  const envTex = createStudioEnvTexture(renderer);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(2.9, 1.9, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.1, 0);

  const keyLight = new THREE.DirectionalLight("#fff8eb", 2.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  const fillLight = new THREE.DirectionalLight("#b8d0ff", 1.0);
  fillLight.position.set(-4, 2.2, -3);
  const rimLight = new THREE.DirectionalLight("#ffe5c0", 1.25);
  rimLight.position.set(1, 3.5, -4.5);
  const hemiLight = new THREE.HemisphereLight("#eef3ff", "#1c1c20", 0.55);
  scene.add(keyLight, fillLight, rimLight, hemiLight);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.2, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: "#15161a", roughness: 0.85, metalness: 0.08 }),
  );
  pedestal.position.y = -1.52;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  let sampleMesh = null;
  let activeMaterial = null;

  function updateLights() {
    const rad = (state.lightAzimuth * Math.PI) / 180;
    keyLight.position.set(Math.cos(rad) * 5.2, 4.4, Math.sin(rad) * 5.2);
    renderer.toneMappingExposure = state.exposure;
  }

  function buildGeometryForShape(shape) {
    if (shape === "shaderball") return createBallGeometry();
    if (shape === "cloth") {
      const g = createDrapedClothGeometry();
      g.center();
      return g;
    }
    if (shape === "leather") {
      const g = createLeatherSwatchGeometry({ kind: "swatch" });
      g.center();
      return g;
    }
    if (shape === "leaf") {
      const g = createBotanicalGeometry("Leaf", 10);
      g.center();
      return g;
    }
    if (shape === "box") return new RoundedBoxGeometry(2.15, 2.15, 2.15, 8, 0.28);
    return new THREE.SphereGeometry(1.42, 96, 64);
  }

  function rebuildMeshAndMaterial() {
    const geo = buildGeometryForShape(state.shape);
    const mat = createMaterial(state.params);
    if (sampleMesh) {
      scene.remove(sampleMesh);
      sampleMesh.geometry.dispose();
    }
    if (activeMaterial) activeMaterial.dispose();
    activeMaterial = mat;
    sampleMesh = new THREE.Mesh(geo, mat);
    sampleMesh.castShadow = true;
    sampleMesh.receiveShadow = true;
    scene.add(sampleMesh);
  }

  function syncMaterialLive() {
    state.params = normalizeMaterial(state.params);
    const nextMat = createMaterial(state.params);
    if (sampleMesh) {
      const old = sampleMesh.material;
      sampleMesh.material = nextMat;
      activeMaterial = nextMat;
      if (old && old !== nextMat) old.dispose();
    }
  }

  // ----------------------------------------------------------------- UI RENDERERS
  function renderLeftOutliner() {
    sceneSummaryWrap.innerHTML = "";
    const p = state.params;

    const activeRow = Construct("div", "stack-row active", [
      (() => {
        const t = Construct("div", "stack-row-thumb");
        t.style.background = p.color || "#888";
        return t;
      })(),
      Construct("div", "stack-row-info", [
        Construct("span", "stack-row-title", p.name || "Procedural Material"),
        Construct("span", "stack-row-sub", `${p.category || "Surface"} · ${Math.round((p.roughness ?? 0.3) * 100)}% R · ${Math.round((p.metalness ?? 0) * 100)}% M`),
      ]),
    ]);
    sceneSummaryWrap.append(Construct("div", "property-label", "Active Material Layer"), activeRow);

    sceneSummaryWrap.append(Construct("div", "property-label", "Preview Mesh Geometry"));
    const meshList = Construct("div");
    for (const [label, id] of shapeOptions) {
      const btn = Construct("div", "stack-row" + (state.shape === id ? " active" : ""), [
        Construct("div", "stack-row-thumb", ConstructGlyph("Cube")),
        Construct("div", "stack-row-info", [
          Construct("span", "stack-row-title", label),
          Construct("span", "stack-row-sub", id === "shaderball" ? "Multi-cavity look-dev target" : "UV-mapped surface sample"),
        ]),
      ]);
      btn.addEventListener("click", () => {
        state.shape = id;
        shapeSelect.value = id;
        rebuildMeshAndMaterial();
        renderLeftOutliner();
      });
      meshList.append(btn);
    }
    sceneSummaryWrap.append(meshList);

    sceneSummaryWrap.append(Construct("div", "property-label", "Studio Lighting Backdrop"));
    const envStrip = Construct("div", "chip-strip");
    for (const [label, val, hex] of backdropOptions) {
      const cb = Construct("button", "chip-btn" + (state.backdrop === val ? " active" : ""), label);
      cb.type = "button";
      cb.addEventListener("click", () => {
        state.backdrop = val;
        bgSelect.value = val;
        scene.background = new THREE.Color(hex);
        renderLeftOutliner();
      });
      envStrip.append(cb);
    }
    sceneSummaryWrap.append(envStrip);

    const browseBtn = Construct("button", "action-button warm", [
      ConstructGlyph("Grid"),
      Construct("span", null, `Browse ${MATERIAL_CATALOG.length} Materials in Asset Browser`),
    ]);
    browseBtn.type = "button";
    browseBtn.style.width = "100%";
    browseBtn.style.marginTop = "10px";
    browseBtn.addEventListener("click", () => appBridge.focusAssetCategory?.("materials"));
    sceneSummaryWrap.append(browseBtn);
  }

  function applyAsset(payload) {
    if (!payload) return false;
    if (payload.assetKind === "material") {
      const item = payload.raw || MATERIAL_CATALOG.find((m) => m.id === payload.id);
      if (!item) return false;
      state.selectedId = item.id;
      state.params = normalizeMaterial(item);
      rebuildInspector();
      syncMaterialLive();
      renderLeftOutliner();
      Broadcast();
      Toast(`Applied "${item.name}" onto Material Stage`);
      return true;
    }
    if (payload.assetKind === "mesh") {
      const mId = payload.id;
      const mapped = shapeOptions.some(([, id]) => id === mId) ? mId : "shaderball";
      state.shape = mapped;
      shapeSelect.value = mapped;
      rebuildMeshAndMaterial();
      renderLeftOutliner();
      Toast(`Previewing ${mapped} geometry`);
      return true;
    }
    return false;
  }

  function rebuildInspector() {
    if (inspectorScope) ReleaseScope(inspectorScope);
    inspectorScope = OpenScope();
    rightInner.innerHTML = "";

    const p = state.params;
    const recipe = getRecipe(p);

    rightInner.append(
      Construct("div", "object-heading", [
        Construct("div", "object-symbol", ConstructGlyph("Material")),
        Construct("div", "object-heading-copy", [
          Construct("strong", null, p.name || "Procedural Material"),
          Construct("span", null, `${p.label || recipe.title}`),
        ]),
      ]),
    );

    MetricTrio(rightInner, [
      { Label: "Roughness", Highlight: true, Read: () => ({ value: Number(state.params.roughness ?? 0.3).toFixed(2), sub: "Microfacet" }) },
      { Label: "Metalness", Read: () => ({ value: `${Math.round((state.params.metalness ?? 0) * 100)}%`, sub: "Conductor" }) },
      { Label: "Clearcoat", Read: () => ({ value: `${Math.round((state.params.coat ?? 0) * 100)}%`, sub: `IOR ${Number(state.params.ior ?? 1.5).toFixed(2)}` }) },
    ]);

    // Color & Surface Section
    const baseSec = SectionCard(rightInner, { Title: "Base Color & Optical Strata", Glyph: "Palette", Badge: p.category || "Surface" });
    ColorRow(baseSec.Inner, {
      Label: "Base Albedo",
      Read: () => state.params.color || "#888888",
      Write: (hex) => {
        state.params = applyRecipeColor(state.params, "color", hex);
        syncMaterialLive();
      },
    });
    SliderRow(baseSec.Inner, {
      Label: "Roughness",
      Minimum: 0.02, Maximum: 1, Step: 0.01,
      Read: () => state.params.roughness ?? 0.35,
      Write: (v) => { state.params.roughness = v; syncMaterialLive(); },
    });
    SliderRow(baseSec.Inner, {
      Label: "Metalness",
      Minimum: 0, Maximum: 1, Step: 0.01,
      Read: () => state.params.metalness ?? 0,
      Write: (v) => { state.params.metalness = v; syncMaterialLive(); },
    });
    SliderRow(baseSec.Inner, {
      Label: "Clearcoat",
      Minimum: 0, Maximum: 1, Step: 0.01,
      Read: () => state.params.coat ?? 0,
      Write: (v) => { state.params.coat = v; syncMaterialLive(); },
    });

    // Dynamic Procedural Recipe Controls
    const groups = new Map();
    for (const ctrl of recipe.controls) {
      if (ctrl.key === "color") continue;
      const g = ctrl.group || "surface";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(ctrl);
    }
    for (const [gName, ctrls] of groups.entries()) {
      const title = gName.charAt(0).toUpperCase() + gName.slice(1) + " Controls";
      const sec = SectionCard(rightInner, { Title: title, Glyph: "Sliders", Open: gName !== "iridescence" });
      for (const ctrl of ctrls) {
        if (ctrl.color) continue;
        const min = Number.isFinite(ctrl.min) ? ctrl.min : 0;
        const max = Number.isFinite(ctrl.max) ? ctrl.max : 1;
        const step = Number.isFinite(ctrl.step) ? ctrl.step : (max - min) > 10 ? 0.5 : 0.01;
        SliderRow(sec.Inner, {
          Label: ctrl.label || ctrl.id,
          Minimum: min,
          Maximum: max,
          Step: step,
          Unit: ctrl.unit || "—",
          Read: () => {
            const val = recipeControlValue(state.params, ctrl);
            return Number.isFinite(val) ? val : min;
          },
          Write: (v) => {
            state.params = applyRecipeControl(state.params, ctrl, v);
            syncMaterialLive();
          },
        });
      }
      if (recipe.supportsMetalScratches && gName === "finish") {
        SwitchRow(sec.Inner, {
          Label: "Metal Micro-Scratches",
          Read: () => !!state.params.metalScratches,
          Write: (v) => {
            state.params = { ...state.params, metalScratches: v };
            rebuildInspector();
            syncMaterialLive();
          },
        });
      }
    }

    // Look-dev Lighting & Export
    const lightSec = SectionCard(rightInner, { Title: "Stage Lighting", Glyph: "Sun", Open: false });
    SliderRow(lightSec.Inner, {
      Label: "Key Light Azimuth",
      Minimum: -180, Maximum: 180, Step: 1, Unit: "°",
      Read: () => state.lightAzimuth,
      Write: (v) => { state.lightAzimuth = v; updateLights(); },
    });
    SliderRow(lightSec.Inner, {
      Label: "Exposure",
      Minimum: 0.4, Maximum: 2.2, Step: 0.02, Unit: "EV",
      Read: () => state.exposure,
      Write: (v) => { state.exposure = v; updateLights(); },
    });

    const exportSec = SectionCard(rightInner, { Title: "Export & Paint Bridge", Glyph: "Download" });
    ActionRow(exportSec.Inner, [
      {
        Label: ".material TOML",
        Glyph: "Download",
        Tone: "accent",
        Act: () => {
          const slug = (state.params.name || "material").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          downloadBlob(exportMaterialTOML(state.params), `${slug}.material`);
          Toast("Exported Frontier .material TOML");
        },
      },
      {
        Label: "JSON / JS",
        Glyph: "Download",
        Act: () => {
          const slug = (state.params.name || "material").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          downloadBlob(exportMaterialJSON(state.params), `${slug}.json`, "application/json");
          downloadBlob(exportMaterialShader(state.params), `${slug}.js`, "text/javascript");
          Toast("Exported Material JSON + JS module");
        },
      },
    ]);
    ActionRow(exportSec.Inner, [
      {
        Label: "Use in Texture Paint",
        Glyph: "ArrowRight",
        Tone: "warm",
        Act: () => appBridge.sendMaterialToPaint(state.params),
      },
    ]);

    CloseScope(inspectorScope);
    Broadcast();
  }

  // ----------------------------------------------------------------- EVENTS, DROP & LOOP
  stage.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    stage.classList.add("canvas-drop-active");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("canvas-drop-active"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("canvas-drop-active");
    let payload = null;
    try {
      const rawJson = e.dataTransfer?.getData("application/x-frontier-asset") || e.dataTransfer?.getData("text/plain");
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        payload = parsed.raw ? parsed : appBridge.resolveAssetPayload?.(parsed.assetKind, parsed.id);
      }
    } catch {}
    if (!payload) payload = appBridge.activeDragAsset;
    if (payload) applyAsset(payload);
  });

  shapeSelect.addEventListener("change", () => {
    state.shape = shapeSelect.value;
    rebuildMeshAndMaterial();
    renderLeftOutliner();
  });
  bgSelect.addEventListener("change", () => {
    state.backdrop = bgSelect.value;
    const found = backdropOptions.find(([, val]) => val === state.backdrop);
    scene.background = new THREE.Color(found ? found[2] : "#0d0e11");
    renderLeftOutliner();
  });
  btnRotate.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    btnRotate.classList.toggle("active", state.autoRotate);
  });
  btnResetCam.addEventListener("click", () => {
    camera.position.set(2.9, 1.9, 3.6);
    controls.target.set(0, 0.1, 0);
    controls.update();
  });
  btnSendToPaint.addEventListener("click", () => appBridge.sendMaterialToPaint(state.params));

  const resizeObserver = new ResizeObserver(() => {
    const w = stage.clientWidth || 600;
    const h = stage.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(stage);

  updateLights();
  rebuildMeshAndMaterial();
  renderLeftOutliner();
  rebuildInspector();

  const tick = () => {
    if (disposed) return;
    if (state.autoRotate && sampleMesh) sampleMesh.rotation.y += 0.008;
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    name: "Material",
    applyAsset,
    getSnapshot: () => ({ id: state.params.id, name: state.params.name, shape: state.shape }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (inspectorScope) ReleaseScope(inspectorScope);
      controls.dispose();
      envTex.dispose();
      if (sampleMesh) sampleMesh.geometry.dispose();
      if (activeMaterial) activeMaterial.dispose();
      renderer.dispose();
      root.innerHTML = "";
    },
  };
}
