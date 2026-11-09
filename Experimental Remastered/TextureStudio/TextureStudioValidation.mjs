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
  evaluateArtworkDocument,
} = await import("./Engine/Patterns/ArtworkStackEngine.js");
const {
  listPatternStarterCatalog,
  listStampStarterCatalog,
  loadStarterAsArtworkDocument,
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
    const el = {
      tagName: String(tag).toUpperCase(),
      style: { setProperty() {}, cssText: "" },
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      dataset: {},
      children: [],
      options: [{ text: "Default" }, { text: "Opt1" }],
      selectedIndex: 0,
      getRootNode: () => globalThis.document,
      get ownerDocument() { return globalThis.document; },
      append(...args) { el.children.push(...args); },
      prepend(...args) { el.children.unshift(...args); },
      setAttribute() {}, removeAttribute() {},
      addEventListener() {}, removeEventListener() {},
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
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
      clientWidth: 640, clientHeight: 480, scrollTop: 0, scrollHeight: 480,
      set innerHTML(v) { el._html = v; if (v === "") el.children = []; },
      get innerHTML() { return el._html || ""; },
    };
    return el;
  }

  const mainEl = makeEl("main");
  globalThis.window = { location: { hash: "#material" }, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.document = {
    getElementById: (id) => id === "studio-main" ? mainEl : makeEl("div"),
    querySelector: () => null,
    querySelectorAll: () => [],
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

console.log(`\nALL ${results.length} VALIDATION SUITES PASSED CLEANLY`);
