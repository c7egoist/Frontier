/*==========================================================================================================================================
                                                     TEXTURESTUDIOVALIDATION.MJS
==========================================================================================================================================*/
/* Comprehensive Automated Validation Suite for Frontier Experimental Remastered Texture Studio.
   Run via:
     node TextureStudioValidation.mjs http://127.0.0.1:8088 */

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const threeUrl = pathToFileURL(resolve(HERE, "Vendor/three.esm.min.js")).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { if (s === "three") return { shortCircuit: true, url: "${threeUrl}" }; return n(s, c); }`,
    ),
);

const THREE = await import("./Vendor/three.esm.min.js");
const {
  materials,
  normalizeMaterial,
  createMaterial,
  createBallGeometry,
} = await import("./Engine/Materials/materials.js");
const { createDrapedClothGeometry } = await import("./Engine/Materials/clothGeometry.js");
const { createLeatherSwatchGeometry } = await import("./Engine/Materials/leatherGeometry.js");
const { createBotanicalGeometry } = await import("./Engine/Materials/botanicalGeometry.js");
const { getRecipe } = await import("./Engine/Materials/materialProfiles.js");
const { exportMaterialTOML, exportMaterialJSON } = await import("./Engine/Materials/materialExport.js");

const {
  createArtworkDocument,
  createArtworkLayer,
  createDefaultModifier,
  artworkDocumentToSvgString,
  evaluateArtworkDocument,
} = await import("./Engine/Patterns/ArtworkStackEngine.js");
const {
  listPatternStarterCatalog,
  listStampStarterCatalog,
  loadStarterAsArtworkDocument,
  getArtworkPreviewSvg,
} = await import("./Engine/Patterns/StarterCatalogBridge.js");

const {
  buildPaintTargetGeometry,
  buildMeshPaintIndex,
  buildDefaultMeshCues,
  createPaintDocument,
  createPaintLayer,
  createStrokeAccumulator,
  applyBrushDab3D,
  applyBrushDabUV,
  commitStrokeAccumulator,
  applyFloodFill,
  compositePaintDocument,
  sampleCompositedAtUV,
} = await import("./Engine/TexturePaintEngine.js");

const {
  BAKE_MAP_CATALOG,
  createBakeStudyPair,
  bakeMeshMaps,
  bakeVolumeSdf,
} = await import("./Engine/BakingEngine.js");

const results = [];
async function suite(name, fn) {
  const t0 = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t0);
  results.push({ name, ms, ok: true });
  console.log(`PASS [${ms}ms] ${name}`);
}

await suite("1. Material Library, Look-Dev Geometries, Recipes & TOML Export", async () => {
  assert(materials.length >= 40, `Expected >=40 materials, got ${materials.length}`);
  for (const m of materials.slice(0, 15)) {
    const norm = normalizeMaterial(m);
    const recipe = getRecipe(norm);
    assert(recipe.controls.length >= 1, `Missing recipe controls for ${m.name}`);
    const threeMat = createMaterial(norm);
    assert(threeMat.isMaterial, `Invalid Three.js material for ${m.name}`);
    threeMat.dispose();
  }
  const toml = exportMaterialTOML(normalizeMaterial(materials[0]));
  assert(toml.includes("Format = 1") && toml.includes("[[Strata]]"), "Invalid .material TOML export");
  const json = JSON.parse(exportMaterialJSON(normalizeMaterial(materials[0])));
  assert.equal(json.schema, "alloy.material.v6");

  const geos = [
    createBallGeometry(),
    createDrapedClothGeometry(),
    createLeatherSwatchGeometry({ kind: "swatch" }),
    createBotanicalGeometry("Leaf", 10),
  ];
  geos.forEach((g) => {
    assert(g.attributes.position.count > 100);
    g.dispose();
  });
});

await suite("2. Unified Pattern Stack + Noise-Scale Modifier + 108 Starters", async () => {
  const patCatalog = listPatternStarterCatalog();
  assert(patCatalog.length >= 108, `Expected >=108 pattern starters, got ${patCatalog.length}`);

  const noiseDoc = createArtworkDocument("pattern");
  noiseDoc.layers = [
    createArtworkLayer("motif", {
      name: "Hex Matrix",
      transform: { x: 256, y: 256, width: 38, height: 38, rotation: 0 },
      shape: { motifType: "hexagon", color: "#eff4cf" },
      surface: { finish: "ceramic", roughness: 0.25, metalness: 0.1, height: 0.3, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
      modifiers: [
        { ...createDefaultModifier("array-grid"), columns: 8, rows: 8 },
        { ...createDefaultModifier("noise-scale"), minScale: 0.25, maxScale: 1.75, frequency: 4, seed: 19 },
      ],
    }),
  ];

  const ev = evaluateArtworkDocument(noiseDoc, 256);
  assert.equal(ev.width, 256);
  assert.equal(ev.albedo.length, 256 * 256 * 4);
  assert(ev.stats.instances >= 64, `Expected >=64 grid instances, got ${ev.stats.instances}`);
  assert(
    ev.stats.maxScale > ev.stats.minScale * 1.4,
    `Expected strong noise-driven scale variance, got ${ev.stats.minScale}..${ev.stats.maxScale}`,
  );
  let roughChanged = false;
  for (let i = 0; i < ev.roughness.length; i += 4) {
    if (ev.roughness[i] !== 220) {
      roughChanged = true;
      break;
    }
  }
  assert(roughChanged, "Pattern roughness channel did not evaluate");
});

await suite("3. Unified Stamp Stack + Transparent Decal Cutout + 5 Starters", async () => {
  const stampCatalog = listStampStarterCatalog();
  assert(stampCatalog.length >= 5, `Expected >=5 stamp starters, got ${stampCatalog.length}`);
  const stampDoc = loadStarterAsArtworkDocument(stampCatalog[0]);
  const ev = evaluateArtworkDocument(stampDoc, 256);
  let transparentCount = 0;
  let opaqueCount = 0;
  for (let i = 3; i < ev.albedo.length; i += 4) {
    if (ev.albedo[i] < 10) transparentCount++;
    else if (ev.albedo[i] > 200) opaqueCount++;
  }
  assert(transparentCount > 5000 && opaqueCount > 1000, "Stamp cutout alpha balance failed");
});

await suite("4. Texture Paint Engine: Packed UVs, 3D Strokes, 2D UV Strokes, Flood Fill, Generators, Decals & Masks", async () => {
  for (const meshId of ["teapot", "shaderball", "box", "sphere", "cloth"]) {
    const g = buildPaintTargetGeometry(meshId);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      assert(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${meshId} UV out of [0..1] tile: (${u},${v})`);
    }
    g.dispose();
  }

  const res = 128;
  const geo = buildPaintTargetGeometry("teapot");
  const idx = buildMeshPaintIndex(geo);
  assert.deepEqual(idx.partNames, ["Body", "Lid", "Handle", "Spout"]);
  const cues = buildDefaultMeshCues(geo, idx, res);
  const doc = createPaintDocument(res);
  const paintLayer = doc.layers[1];

  // 3D Ray Stroke
  const tri = idx.tris[0];
  const hitPos = new THREE.Vector3(...tri.p0).add(new THREE.Vector3(...tri.p1)).add(new THREE.Vector3(...tri.p2)).multiplyScalar(1 / 3);
  const brush = { tool: "paint", tip: "round", color: "#ff5533", roughness: 0.25, metalness: 0.8, height: 0.4, opacity: 1, flow: 1, hardness: 0.8 };
  const accum3D = createStrokeAccumulator(res);
  applyBrushDab3D({ strokeAccum: accum3D, meshIndex: idx, cues, hitPos, hitNormal: new THREE.Vector3(...tri.faceNormal), worldRadius: 0.4, brush });
  assert.equal(commitStrokeAccumulator(paintLayer, accum3D, brush, false), true);

  // 2D UV Stroke
  const accumUV = createStrokeAccumulator(res);
  applyBrushDabUV({ strokeAccum: accumUV, cues, u: 0.5, v: 0.5, pixelRadius: 10, brush });
  assert.equal(commitStrokeAccumulator(paintLayer, accumUV, brush, false), true);

  // Generator Layer (Edge Wear) + Decal Layer + Mask
  const genLayer = createPaintLayer("generator", { res, generator: { preset: "edge-wear", color: "#ffffff", threshold: 0.2, softness: 0.3, noiseMix: 0.2, noiseScale: 5 } });
  doc.layers.push(genLayer);

  const comp = compositePaintDocument(doc, cues);
  const sample = sampleCompositedAtUV(comp, 0.5, 0.5);
  assert(/^#[0-9a-f]{6}$/.test(sample.color), `Invalid sampled color ${sample.color}`);

  // Part Flood Fill
  assert.equal(applyFloodFill({ layer: paintLayer, cues, hitTriIndex: 0, scope: "part", brush }), true);
  geo.dispose();
});

await suite("5. Baking Engine: 17 Surface Maps + Signed 3D Volume SDF", async () => {
  assert(BAKE_MAP_CATALOG.length >= 18);
  const study = createBakeStudyPair("box");
  const allSurface = BAKE_MAP_CATALOG.filter((m) => !m.isVolume).map((m) => m.id);
  const baked = await bakeMeshMaps(study.low, study.high, {
    resolution: 128,
    channels: allSurface,
    samples: 6,
    padding: 3,
  });
  for (const ch of allSurface) {
    assert(baked.maps[ch]?.length === 128 * 128 * 4, `Baked buffer missing or wrong size for ${ch}`);
  }
  assert(baked.bridgeData?.ao?.length === 128 * 128);
  assert(baked.bridgeData?.curvature?.length === 128 * 128);

  const sdf = await bakeVolumeSdf(study.high, { nx: 16, ny: 16, nz: 16, signMode: "signed" });
  assert.equal(sdf.values.length, 16 * 16 * 16);
  assert(sdf.minVal < -0.05 && sdf.maxVal > 0.05, `Expected signed interior/exterior range, got ${sdf.minVal}..${sdf.maxVal}`);
});

const baseUrl = process.argv[2];
if (baseUrl) {
  await suite(`6. Live HTTP Endpoints (${baseUrl})`, async () => {
    const paths = [
      "/Experimental%20Remastered/",
      "/Experimental%20Remastered/TextureStudio/",
      "/Experimental%20Remastered/TextureStudio/TextureStudio.css",
      "/Experimental%20Remastered/TextureStudio/TextureStudio.js",
      "/Experimental%20Remastered/TextureStudio/AssetBrowser.js",
      "/Experimental%20Remastered/TextureStudio/StudioControls.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/MaterialWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/ArtworkStackWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/PatternWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/StampWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/TexturePaintWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Workspaces/BakingWorkspace.js",
      "/Experimental%20Remastered/TextureStudio/Engine/NoiseField.js",
      "/Experimental%20Remastered/TextureStudio/Engine/WebGpuCompute.js",
      "/Experimental%20Remastered/TextureStudio/Engine/TexturePaintEngine.js",
      "/Experimental%20Remastered/TextureStudio/Engine/BakingEngine.js",
      "/Experimental%20Remastered/TextureStudio/Engine/Patterns/ArtworkStackEngine.js",
      "/Experimental%20Remastered/TextureStudio/Engine/Patterns/StarterCatalogBridge.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/three.esm.min.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/orbit-controls.esm.min.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/addons/TeapotGeometry.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/addons/RoundedBoxGeometry.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/addons/OBJLoader.js",
      "/Experimental%20Remastered/TextureStudio/Vendor/addons/STLLoader.js",
      "/Experimental%20Remastered/TextureStudio/Assets/draped-cloth.js",
      "/Experimental%20Remastered/TextureStudio/Fonts/dm-sans-latin-400-normal.woff2",
    ];
    for (const p of paths) {
      const r = await fetch(baseUrl.replace(/\/$/, "") + p);
      assert.equal(r.status, 200, `Expected 200 for ${p}, got ${r.status}`);
    }
  });
}

await suite("7. Full TextureStudio Shell & All 5 Workspaces Mount & Switch Cleanly", async () => {
  function makeWebGLMock() {
    const gl = {
      VERSION: 0x1F02, SHADING_LANGUAGE_VERSION: 0x8B8C, VENDOR: 0x1F00, RENDERER: 0x1F01,
      SCISSOR_BOX: 0x0C10, VIEWPORT: 0x0BA2, MAX_TEXTURE_SIZE: 0x0D33, MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C,
      MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, MAX_TEXTURE_IMAGE_UNITS: 0x8872,
      MAX_VERTEX_ATTRIBS: 0x8869, MAX_VARYING_VECTORS: 0x8DFC, MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB,
      MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, MAX_SAMPLES: 0x8D57,
      ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B89, LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81,
      getExtension: () => ({}),
      getSupportedExtensions: () => ["EXT_color_buffer_float", "OES_texture_float_linear"],
      getParameter: (p) => {
        if (p === 0x1F02) return "WebGL 2.0 (OpenGL ES 3.0 Chromium)";
        if (p === 0x8B8C) return "WebGL GLSL ES 3.00";
        if (p === 0x1F00 || p === 0x1F01) return "MockGPU";
        if (p === 0x0C10 || p === 0x0BA2) return new Int32Array([0, 0, 640, 480]);
        if (p === 0x0D33 || p === 0x851C) return 4096;
        return 32;
      },
      getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
      getContextAttributes: () => ({ alpha: true, antialias: true }),
      getProgramParameter: (prog, p) => (p === 0x8B86 || p === 0x8B89) ? 0 : true,
      getShaderParameter: () => true,
      getShaderInfoLog: () => "",
      getProgramInfoLog: () => "",
      getActiveUniform: () => ({ name: "uMock", size: 1, type: 0x1406 }),
      getActiveAttrib: () => ({ name: "position", size: 1, type: 0x8B51 }),
      checkFramebufferStatus: () => 36053,
      isContextLost: () => false,
      getUniformLocation: () => ({}),
      getAttribLocation: () => 0,
      getUniformBlockIndex: () => 0,
      createTexture: () => ({}), createBuffer: () => ({}), createFramebuffer: () => ({}),
      createRenderbuffer: () => ({}), createVertexArray: () => ({}), createProgram: () => ({}),
      createShader: () => ({}),
    };
    return new Proxy(gl, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === "string" && prop === prop.toUpperCase()) return 1;
        return () => {};
      },
    });
  }

  function makeEl(tag = "div") {
    const listeners = new Map();
    const attrs = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      className: "",
      style: { setProperty() {}, cssText: "", height: "" },
      classList: {
        toggle(c, f) {
          const set = new Set(String(el.className || "").split(/\s+/).filter(Boolean));
          const on = f !== undefined ? !!f : !set.has(c);
          if (on) set.add(c); else set.delete(c);
          el.className = [...set].join(" ");
        },
        add(...cs) { cs.forEach((c) => el.classList.toggle(c, true)); },
        remove(...cs) { cs.forEach((c) => el.classList.toggle(c, false)); },
        contains: (c) => String(el.className || "").split(/\s+/).includes(c),
      },
      dataset: {},
      children: [],
      parentNode: null,
      options: [{ text: "Default" }, { text: "Opt1" }],
      selectedIndex: 0,
      getRootNode: () => globalThis.document,
      get ownerDocument() { return globalThis.document; },
      append(...args) {
        for (const a of args) {
          if (a && typeof a === "object") { a.parentNode = el; el.children.push(a); }
        }
      },
      prepend(...args) {
        for (let i = args.length - 1; i >= 0; i--) {
          const a = args[i];
          if (a && typeof a === "object") { a.parentNode = el; el.children.unshift(a); }
        }
      },
      remove() {
        if (el.parentNode?.children) {
          el.parentNode.children = el.parentNode.children.filter((c) => c !== el);
          el.parentNode = null;
        }
      },
      contains(target) {
        if (target === el) return true;
        return el.children.some((c) => typeof c.contains === "function" && c.contains(target));
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (sel.startsWith(".") && cur.classList?.contains(sel.slice(1))) return cur;
          if (sel.startsWith("[")) {
            const attrName = sel.slice(1, -1).split("=")[0];
            const camel = attrName.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (cur.hasAttribute?.(attrName) || cur.dataset?.[camel] !== undefined) return cur;
          }
          cur = cur.parentNode;
        }
        return null;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (node) => {
          for (const ch of node.children || []) {
            const cls = String(ch.className || "");
            const match = sel.startsWith(".")
              ? cls.split(/\s+/).includes(sel.slice(1))
              : sel.startsWith("[")
                ? ch.hasAttribute?.(sel.slice(1, -1).split("=")[0])
                : String(ch.tagName).toLowerCase() === sel.toLowerCase();
            if (match) out.push(ch);
            walk(ch);
          }
        };
        walk(el);
        return out;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === "class") el.className = String(v);
        if (k.startsWith("data-")) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          el.dataset[camel] = String(v);
        }
      },
      getAttribute(k) { return attrs.get(k) ?? null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        if (!listeners.has(type)) return;
        listeners.set(type, listeners.get(type).filter((f) => f !== fn));
      },
      dispatchEvent(evt) {
        const ev = Object.assign({ target: el, preventDefault() {}, stopPropagation() {}, clientX: 200, clientY: 200 }, evt);
        for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev);
        return true;
      },
      click() { el.dispatchEvent({ type: "click" }); },
      setPointerCapture() {}, releasePointerCapture() {},
      getContext: (kind) => (kind && kind.includes("webgl")) ? makeWebGLMock() : {
        fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, globalCompositeOperation: "source-over",
        font: "", textAlign: "center", textBaseline: "middle",
        fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
        fill() {}, ellipse() {}, arc() {}, rect() {}, roundRect() {}, quadraticCurveTo() {}, bezierCurveTo() {},
        drawImage() {}, save() {}, restore() {}, scale() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {},
        setLineDash() {},
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
      },
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 640, height: parseFloat(el.style.height) || 480,
      }),
      clientWidth: 640, clientHeight: 480, scrollTop: 0, scrollHeight: 480,
      set innerHTML(v) { el._html = v; if (v === "") el.children = []; },
      get innerHTML() { return el._html || ""; },
    };
    return el;
  }

  const mainEl = makeEl("main");
  const browserHostEl = makeEl("div");
  const winListeners = new Map();
  globalThis.window = {
    location: { hash: "#material" },
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener(t, fn) { if (!winListeners.has(t)) winListeners.set(t, []); winListeners.get(t).push(fn); },
    removeEventListener(t, fn) { if (winListeners.has(t)) winListeners.set(t, winListeners.get(t).filter((f) => f !== fn)); },
    dispatchEvent(evt) { for (const fn of [...(winListeners.get(evt.type) || [])]) fn(Object.assign({ preventDefault() {}, stopPropagation() {} }, evt)); },
  };
  globalThis.document = {
    getElementById: (id) => id === "studio-main" ? mainEl : id === "asset-browser-host" ? browserHostEl : makeEl("div"),
    querySelector: (sel) => globalThis.document.body.querySelector(sel) || mainEl.querySelector(sel) || browserHostEl.querySelector(sel),
    querySelectorAll: (sel) => [...mainEl.querySelectorAll(sel), ...browserHostEl.querySelectorAll(sel), ...globalThis.document.body.querySelectorAll(sel)],
    createElement: (tag) => makeEl(tag),
    createElementNS: (ns, tag) => makeEl(tag),
    addEventListener() {}, removeEventListener() {},
    body: makeEl("body"),
    activeElement: null,
  };
  globalThis.history = { replaceState() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };

  await import("./TextureStudio.js");
  for (const ws of ["material", "pattern", "stamp", "paint", "bake"]) {
    globalThis.window.__frontierTextureStudio.switchWorkspace(ws);
    const snap = globalThis.window.__frontierTextureStudio.getSnapshot();
    assert(snap && typeof snap === "object", `Workspace ${ws} did not mount cleanly`);
  }
});

// ----------------------------------------------------------------- 8. GPU BAKE / GPU PAINT / TOOL POPUPS / DRAG-DROP STACKS
await suite("8. GPU Bake/Paint Shaders, Q/Tab/Right-Click Tool Popups & Draggable/Up-Down Layer Stacks", async () => {
  const gpuBake = await import("./Engine/GpuBakeEngine.js");
  const gpuPaintMod = await import("./Engine/GpuPaintEngine.js");
  const bakeEng = await import("./Engine/BakingEngine.js");

  assert(gpuBake.BAKE_GLSL3_SHADERS.CORE_RAY_FRAG.includes("uGridMetaTex"), "Missing GLSL3 ray bake shader");
  assert(gpuBake.BAKE_GLSL3_SHADERS.DERIVE_CHANNEL_FRAG.includes("calcCurvature"), "Missing GLSL3 derive channel shader");
  assert(gpuBake.BAKE_WGSL_SHADERS.MESH_RAY_WGSL.includes("@compute"), "Missing WebGPU compute ray bake shader");
  assert(gpuBake.BAKE_WGSL_SHADERS.SDF_WGSL.includes("@compute"), "Missing WebGPU compute SDF shader");
  assert(gpuPaintMod.PAINT_GLSL3_SHADERS.DAB_COMMON.includes("tipCoverage("), "Missing GPU Paint dab shader");
  assert(gpuPaintMod.PAINT_GLSL3_SHADERS.COMPOSITE_LAYER_FRAG.includes("blendRgb("), "Missing GPU Paint composite shader");

  const studyPair = bakeEng.createBakeStudyPair("teapot");
  const packed = gpuBake.packBakeGeometryForGpu(studyPair.low, studyPair.high);
  assert(packed.triCount > 100 && packed.gridMeta.length === 16 * 16 * 16 * 2, "GPU geometry spatial grid packing failed");
  const gbuf = gpuBake.rasterizeLowMeshGBuffer(studyPair.low, 64);
  assert(gbuf.posCov.length === 64 * 64 * 4 && gbuf.normPart.length === 64 * 64 * 4, "Low-poly G-buffer rasterization failed");

  // Exercise GpuPaintSession WebGL2 mesh-cue upload, stamp upload & pattern fill upload against real buildDefaultMeshCues output!
  const mockGpuRenderer = {
    capabilities: { isWebGL2: true },
    extensions: { get: () => ({}) },
    getContext: () => ({ getParameter: () => "ValidatedWebGL2" }),
    autoClear: true,
    getRenderTarget: () => null,
    getScissorTest: () => false,
    setScissorTest() {},
    setRenderTarget() {},
    render() {},
    getClearColor: (c) => c.set(0, 0, 0),
    getClearAlpha: () => 1,
    setClearColor() {},
    clear() {},
  };
  const gpuSess = new gpuPaintMod.GpuPaintSession(mockGpuRenderer, 64);
  assert.equal(gpuSess.isActive, true, "Mock WebGL2 GpuPaintSession should activate");
  const testGeo = buildPaintTargetGeometry("teapot");
  const testIdx = buildMeshPaintIndex(testGeo);
  const testCues = buildDefaultMeshCues(testGeo, testIdx, 64);
  gpuSess.uploadMeshCues(testCues, null);
  assert(gpuSess.posPartTex && gpuSess.auxCueTex, "uploadMeshCues must upload worldPos/worldNormal without throwing");
  assert(gpuSess.auxCueTex.image.data.some((v) => v > 100), "auxCueTex AO/Curvature bytes should be normalized 0..255");

  // Upload baked Float32 (CPU bake) and Uint8 (GPU bake) bridgeData
  gpuSess.uploadMeshCues(testCues, { res: 64, ao: new Float32Array(64 * 64).fill(0.75), curvature: new Float32Array(64 * 64).fill(0.6) });
  gpuSess.uploadMeshCues(testCues, { res: 64, ao: new Uint8ClampedArray(64 * 64).fill(180), curvature: new Uint8ClampedArray(64 * 64).fill(140) });

  // Verify Stamp & Pattern Fill texture uploads work with ArtworkStackEngine .albedo buffers
  const stampEval = evaluateArtworkDocument(createArtworkDocument("stamp"), 64);
  gpuSess.ensureStampTexture(stampEval);
  assert.equal(gpuSess.hasStamp, true, "ensureStampTexture must accept ArtworkStackEngine .albedo buffer");

  const patEval = evaluateArtworkDocument(createArtworkDocument("pattern"), 64);
  const patLayer = createPaintLayer("fill", { res: 64, fill: { color: "#ffffff", roughness: 0.4, metalness: 0.1, height: 0, patternRepeats: 2, patternData: patEval } });
  const patGpu = gpuSess.ensureLayerTargets(patLayer);
  assert(patGpu.patternTex, "ensureLayerTargets must upload Pattern Fill .albedo buffer");
  gpuSess.dispose();
  testGeo.dispose();

  // Switch back to Texture Paint & exercise Q/Tab/Right-click popup + layer stack drag/up/down
  globalThis.window.__frontierTextureStudio.switchWorkspace("paint");
  const paintRowsBefore = globalThis.document.querySelectorAll(".stack-row");
  assert(paintRowsBefore.length >= 2, "Expected paint workspace stack rows");
  assert(paintRowsBefore.every((r) => r.draggable === true), "All paint stack rows must be draggable");

  const firstTitleBefore = paintRowsBefore[0].querySelector(".stack-row-title")?.textContent;
  const secondTitleBefore = paintRowsBefore[1].querySelector(".stack-row-title")?.textContent;
  const orderBtns = paintRowsBefore[0].querySelectorAll(".stack-order-btn");
  assert(orderBtns.length === 2, "Expected Up/Down reorder buttons on each paint layer row");
  orderBtns[1].click(); // Move top visual layer down 1 slot
  const paintRowsAfterBtn = globalThis.document.querySelectorAll(".stack-row");
  assert(
    paintRowsAfterBtn[0].querySelector(".stack-row-title")?.textContent === secondTitleBefore &&
    paintRowsAfterBtn[1].querySelector(".stack-row-title")?.textContent === firstTitleBefore,
    "Up/Down button did not reorder paint layer stack",
  );

  // Test Drag-and-Drop reordering back
  const dragSrc = paintRowsAfterBtn[1];
  const dragTgt = paintRowsAfterBtn[0];
  dragSrc.dispatchEvent({ type: "dragstart", dataTransfer: { effectAllowed: "", setData() {} } });
  dragTgt.dispatchEvent({ type: "dragover", clientY: 5 }); // top half -> drop-above
  dragTgt.dispatchEvent({ type: "drop", clientY: 5, dataTransfer: { getData: () => dragSrc.dataset.layerId } });
  const paintRowsAfterDrag = globalThis.document.querySelectorAll(".stack-row");
  assert(
    paintRowsAfterDrag[0].querySelector(".stack-row-title")?.textContent === firstTitleBefore,
    "Drag-and-drop did not reorder paint layer stack back",
  );

  // Test Q hotkey & Right-click popup menu
  globalThis.window.dispatchEvent({ type: "keydown", key: "q" });
  let popups = globalThis.document.body.querySelectorAll(".tool-popup-menu");
  assert(popups.length === 1, "Pressing Q did not open Active Tool Popup menu");
  globalThis.window.dispatchEvent({ type: "keydown", key: "Escape" });
  popups = globalThis.document.body.querySelectorAll(".tool-popup-menu");
  assert(popups.length === 0, "Escape did not close Active Tool Popup menu");

  globalThis.window.dispatchEvent({ type: "keydown", key: "Tab" });
  popups = globalThis.document.body.querySelectorAll(".tool-popup-menu");
  assert(popups.length === 1, "Pressing Tab did not open Active Tool Popup menu");
  globalThis.window.dispatchEvent({ type: "keydown", key: "Tab" });
  assert(globalThis.document.body.querySelectorAll(".tool-popup-menu").length === 0, "Pressing Tab again did not toggle popup closed");

  const splitPanes = globalThis.document.querySelectorAll(".viewport-split-pane");
  assert(splitPanes.length >= 1, "Missing paint viewport split panes");
  splitPanes[0].dispatchEvent({ type: "pointerdown", button: 2, clientX: 220, clientY: 180 });
  splitPanes[0].dispatchEvent({ type: "contextmenu", clientX: 221, clientY: 181 });
  assert(globalThis.document.body.querySelectorAll(".tool-popup-menu").length === 1, "Right-click on paint viewport did not open Active Tool Popup");
  globalThis.window.dispatchEvent({ type: "keydown", key: "Escape" });

  // Verify Pattern Studio layer drag-drop & popup as well
  globalThis.window.__frontierTextureStudio.switchWorkspace("pattern");
  const artRows = globalThis.document.querySelectorAll(".stack-row");
  assert(artRows.length >= 2 && artRows.every((r) => r.draggable === true), "Pattern Studio stack rows must be draggable");
  globalThis.window.dispatchEvent({ type: "keydown", key: "q" });
  assert(globalThis.document.body.querySelectorAll(".tool-popup-menu").length === 1, "Q did not open Pattern Studio Quick Menu");
  globalThis.window.dispatchEvent({ type: "keydown", key: "Escape" });

  // Verify Baking Studio Q popup as well
  globalThis.window.__frontierTextureStudio.switchWorkspace("bake");
  globalThis.window.dispatchEvent({ type: "keydown", key: "q" });
  assert(globalThis.document.body.querySelectorAll(".tool-popup-menu").length === 1, "Q did not open Baking Studio Quick Menu");
  globalThis.window.dispatchEvent({ type: "keydown", key: "Escape" });
});

// ----------------------------------------------------------------- 9. AFRICAN PATTERNS & SVG VECTOR EXPORT
await suite("9. African Patterns Catalog (36+ Studies), SVG Paths & Vector Rendering", async () => {
  const patCatalog = listPatternStarterCatalog();
  const african = patCatalog.filter((p) => p.group === "African Patterns");
  assert(african.length >= 34, `Expected >=34 African Patterns, got ${african.length}`);
  const keyNames = ["Asante Kente Blocks", "Ndebele Painted Chevrons", "Bamana Bogolanfini Dashes", "Kuba Raffia Steps", "Yoruba Adire Rings", "African Diamond Carpet"];
  for (const kn of keyNames) {
    assert(african.some((a) => a.name === kn), `Missing African Pattern: ${kn}`);
  }
  for (const entry of african) {
    const doc = loadStarterAsArtworkDocument(entry);
    assert(doc.layers.length >= 1, `Empty layers in ${entry.name}`);
    const svg = artworkDocumentToSvgString(doc, { width: 512, height: 512 });
    assert(svg.includes("<svg") && (svg.includes("<path") || svg.includes("<polygon") || svg.includes("<rect") || svg.includes("<ellipse")), `Invalid SVG output for ${entry.name}`);
    const thumb = getArtworkPreviewSvg(entry, "pattern", 60);
    assert(thumb.includes("<svg"), `Missing preview SVG for ${entry.name}`);
  }
});

// ----------------------------------------------------------------- 10. INTERACTIVE SVG CANVAS + ASSET BROWSER DRAWER + AUTO-TAB + CANVAS DRAG-DROP
await suite("10. Interactive SVG Vector Canvas, Bottom Resizable Asset Browser & Auto-Category Drop", async () => {
  const api = globalThis.window.__frontierTextureStudio;

  // 10a. Verify decluttered Layer Stacks (preset grids moved out of workspace left columns into Asset Browser)
  for (const ws of ["material", "pattern", "stamp"]) {
    api.switchWorkspace(ws);
    const leftCards = globalThis.document.querySelectorAll(".preset-card");
    assert.equal(leftCards.length, 0, `Workspace ${ws} should keep asset cards in bottom Asset Browser, not left stack`);
  }

  // 10b. Verify Workspace -> Asset Browser auto-category switching unless user specifies otherwise
  api.switchWorkspace("material");
  assert.equal(api.getAssetBrowser().activeCategory, "materials");
  api.switchWorkspace("pattern");
  assert.equal(api.getAssetBrowser().activeCategory, "patterns");
  api.switchWorkspace("stamp");
  assert.equal(api.getAssetBrowser().activeCategory, "stamps");
  api.switchWorkspace("bake");
  assert.equal(api.getAssetBrowser().activeCategory, "meshes");

  // User manually selects Patterns tab while on Bake -> should stay pinned when switching workspaces!
  const patCatBtn = globalThis.document.querySelectorAll(".cb-cat-tab").find((b) => b.dataset.category === "patterns");
  assert(patCatBtn, "Missing Patterns tab in Asset Browser");
  patCatBtn.click();
  assert.equal(api.getAssetBrowser().userSpecifiedCategory, true);
  api.switchWorkspace("material");
  assert.equal(api.getAssetBrowser().activeCategory, "patterns", "User-specified category should remain pinned across workspace switches");

  // Clicking Auto Reset button restores automatic category matching
  const autoResetBtn = globalThis.document.querySelector(".cb-auto-pill");
  assert(autoResetBtn, "Missing Auto/Pinned toggle pill");
  autoResetBtn.click();
  assert.equal(api.getAssetBrowser().userSpecifiedCategory, false);
  assert.equal(api.getAssetBrowser().activeCategory, "materials");

  // 10c. Verify draggable notch resize + collapse/expand
  const notch = globalThis.document.querySelector(".cb-resize");
  assert(notch, "Missing Asset Browser resize notch (.cb-resize)");
  const initialH = api.getAssetBrowser().heightPx;
  notch.dispatchEvent({ type: "pointerdown", button: 0, clientY: 600 });
  globalThis.window.dispatchEvent({ type: "pointermove", clientY: 480 }); // drag UP +120px
  globalThis.window.dispatchEvent({ type: "pointerup" });
  assert(api.getAssetBrowser().heightPx > initialH + 60, `Expected drawer height increase after dragging notch up, got ${api.getAssetBrowser().heightPx}`);
  notch.dispatchEvent({ type: "dblclick" });
  assert.equal(api.getAssetBrowser().collapsed, true, "Double-click on notch should collapse Asset Browser");
  notch.dispatchEvent({ type: "dblclick" });
  assert.equal(api.getAssetBrowser().collapsed, false, "Second double-click should expand Asset Browser");

  // 10d. Interactive SVG Vector Canvas + Toolbar + Direct Move / Resize / Rotate + Draw Tool in Pattern & Stamp Studio
  api.switchWorkspace("pattern");
  const patSnap = api.getSnapshot();
  assert.equal(patSnap.viewChannel, "vector", "Pattern Studio should open in Interactive Vector SVG mode");
  assert.equal(patSnap.showGrid, true, "Vector grid should be enabled by default");
  const svgCanvas = globalThis.document.querySelector(".se-canvas");
  assert(svgCanvas && svgCanvas.innerHTML.includes('id="se-grid"'), "SVG canvas missing grid defs");
  assert(svgCanvas.innerHTML.includes('data-handle="rotate"'), "SVG canvas missing rotation handle");
  assert(svgCanvas.innerHTML.includes('data-handle="se"'), "SVG canvas missing SE resize handle");

  // Drop an African Pattern directly onto the SVG viewport!
  const seViewport = globalThis.document.querySelector(".se-viewport");
  const kentePayload = JSON.stringify({ assetKind: "pattern", id: "legacy:Asante Kente Blocks", name: "Asante Kente Blocks" });
  seViewport.dispatchEvent({
    type: "drop",
    clientX: 256,
    clientY: 256,
    dataTransfer: { getData: (t) => (t === "application/x-frontier-asset" ? kentePayload : "") },
  });
  assert.equal(api.getSnapshot().name, "Asante Kente Blocks", "Dropping Asante Kente Blocks onto Pattern canvas should load it");
  assert(globalThis.document.querySelector(".se-canvas").innerHTML.includes("<path"), "African Kente SVG paths should render directly in .se-canvas");

  // Draw a brand-new Diamond vector shape right on the SVG canvas using the Diamond toolbar tool!
  const diamondBtn = globalThis.document.querySelectorAll(".se-tool-btn").find((b) => b.dataset.vectorTool === "diamond");
  assert(diamondBtn, "Missing Diamond vector tool button in toolbar");
  diamondBtn.click();
  const layersBeforeDraw = api.getSnapshot().layers;
  svgCanvas.dispatchEvent({ type: "pointerdown", button: 0, clientX: 160, clientY: 160 });
  svgCanvas.dispatchEvent({ type: "pointermove", clientX: 280, clientY: 280 });
  svgCanvas.dispatchEvent({ type: "pointerup", clientX: 280, clientY: 280 });
  assert.equal(api.getSnapshot().layers, layersBeforeDraw + 1, "Drawing Diamond shape on SVG canvas should create a new layer");

  // Directly move, resize & rotate that selected layer on the SVG canvas!
  const beforeMove = api.getSnapshot().selectedLayer;
  const layerGroupMock = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "g");
  layerGroupMock.dataset = { layerId: beforeMove.id };
  svgCanvas.dispatchEvent({ type: "pointerdown", button: 0, clientX: 200, clientY: 200, target: layerGroupMock });
  svgCanvas.dispatchEvent({ type: "pointermove", clientX: 264, clientY: 232 });
  svgCanvas.dispatchEvent({ type: "pointerup", clientX: 264, clientY: 232 });
  const afterMove = api.getSnapshot().selectedLayer;
  assert(afterMove.x !== beforeMove.x || afterMove.y !== beforeMove.y, "Dragging SVG layer should update its (x, y) coordinates");

  const resizeHandleMock = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "rect");
  resizeHandleMock.dataset = { handle: "se" };
  svgCanvas.dispatchEvent({ type: "pointerdown", button: 0, clientX: 280, clientY: 280, target: resizeHandleMock });
  svgCanvas.dispatchEvent({ type: "pointermove", clientX: 340, clientY: 340 });
  svgCanvas.dispatchEvent({ type: "pointerup", clientX: 340, clientY: 340 });
  assert(api.getSnapshot().selectedLayer.width !== afterMove.width, "Dragging SE handle should resize active layer width");

  const rotHandleMock = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "circle");
  rotHandleMock.dataset = { handle: "rotate" };
  svgCanvas.dispatchEvent({ type: "pointerdown", button: 0, clientX: 300, clientY: 100, target: rotHandleMock });
  svgCanvas.dispatchEvent({ type: "pointermove", clientX: 420, clientY: 240 });
  svgCanvas.dispatchEvent({ type: "pointerup", clientX: 420, clientY: 240 });
  assert(api.getSnapshot().selectedLayer.rotation !== beforeMove.rotation, "Dragging rotate handle should rotate active layer");

  // 10e. Verify Stamp Studio interactive SVG canvas & Material/Bake Asset Drops
  api.switchWorkspace("stamp");
  assert.equal(api.getSnapshot().viewChannel, "vector", "Stamp Studio should also use interactive Vector SVG canvas");
  api.switchWorkspace("material");
  const matStage = globalThis.document.querySelector(".viewport-stage");
  const matDropPayload = JSON.stringify({ assetKind: "material", id: materials[2].id, name: materials[2].name });
  matStage.dispatchEvent({
    type: "drop",
    dataTransfer: { getData: (t) => (t === "application/x-frontier-asset" ? matDropPayload : "") },
  });
  assert.equal(api.getSnapshot().id, materials[2].id, "Dropping Material onto Material 3D stage should apply it");

  api.switchWorkspace("paint");
  const paintPane = globalThis.document.querySelector(".viewport-split-pane");
  assert(paintPane, "Missing paint pane for asset drop");
  const paintLayersBefore = api.getSnapshot().layers;
  paintPane.dispatchEvent({
    type: "drop",
    dataTransfer: { getData: (t) => (t === "application/x-frontier-asset" ? kentePayload : "") },
  });
  assert.equal(api.getSnapshot().layers, paintLayersBefore + 1, "Dropping African Pattern onto Paint viewport should add Pattern Fill layer");

  api.switchWorkspace("bake");
  const bakeStage = globalThis.document.querySelector(".viewport-stage");
  const meshDropPayload = JSON.stringify({ assetKind: "mesh", id: "torus", name: "Torus Knot Study" });
  bakeStage.dispatchEvent({
    type: "drop",
    dataTransfer: { getData: (t) => (t === "application/x-frontier-asset" ? meshDropPayload : "") },
  });
  assert.equal(api.getSnapshot().studyId, "torus", "Dropping Bake Study Mesh onto Baking viewport should load it");
});

console.log(`\nALL ${results.length} VALIDATION SUITES PASSED CLEANLY`);
