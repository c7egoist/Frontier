/*==========================================================================================================================================
                                                       MATERIALICONBAKER.JS
==========================================================================================================================================*/
/* Pre-bakes transparent circular 3D PBR Material Sphere PNG icons for AssetBrowser:
   - Stage 1: Instant analytical Cook-Torrance GGX + Clearcoat + Iridescence + Flake transparent PNG sphere (zero wait)
   - Stage 2: Batched offscreen Three.js WebGL shader bake using genuine Frontier createMaterial(m) shaders + PMREM studio lighting,
              auto-disposing the temporary baker WebGL context as soon as the queue completes. */

import * as THREE from "three";
import { createMaterial, normalizeMaterial } from "./Engine/Materials/materials.js";

const ANALYTICAL_CACHE = new Map();
const WEBGL_CACHE = new Map();
const PENDING_IDS = new Set();
const WAITERS = new Map(); // id -> Set<(url) => void>

let bakeQueue = [];
let queueRunning = false;
let bakerSession = null;
let idleDisposeTimer = 0;

function parseHexRgb(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex || "#888888"));
  if (!m) return [0.53, 0.53, 0.53];
  return [
    parseInt(m[1].slice(0, 2), 16) / 255,
    parseInt(m[1].slice(2, 4), 16) / 255,
    parseInt(m[1].slice(4, 6), 16) / 255,
  ];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function hash2(x, y, seed = 17) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Renders raw RGBA pixels of an 88x88 transparent Cook-Torrance PBR sphere
 * (alpha === 0 outside orb silhouette, alpha === 255 inside, smooth AA edge).
 */
export function renderAnalyticalSpherePixels(mat, size = 88) {
  const data = new Uint8ClampedArray(size * size * 4);
  const [br, bg, bb] = parseHexRgb(mat.color || "#888888");
  const [sr, sg, sb] = parseHexRgb(mat.secondaryColor || mat.colors?.[0] || mat.color || "#ffffff");
  const [er, eg, eb] = parseHexRgb(mat.emissionColor || mat.color || "#ffaa44");

  const rough = Math.max(0.05, Math.min(1.0, mat.roughness ?? 0.45));
  const metal = clamp01(mat.metalness ?? 0);
  const coat = clamp01(mat.coat ?? 0);
  const coatRough = Math.max(0.04, Math.min(0.8, mat.coatRoughness ?? 0.1));
  const irid = clamp01(mat.iridescence ?? 0);
  const flakes = clamp01(mat.flakes ?? 0);
  const emit = Math.max(0, mat.emissionStrength ?? 0);
  const trans = clamp01(mat.translucency ?? mat.transmission ?? 0);

  // Normalized key, fill & rim directions
  const kl = Math.hypot(-0.46, -0.58, 0.67);
  const kx = -0.46 / kl, ky = -0.58 / kl, kz = 0.67 / kl;
  const fl = Math.hypot(0.68, 0.25, 0.69);
  const fx = 0.68 / fl, fy = 0.25 / fl, fz = 0.69 / fl;
  const rl = Math.hypot(0.28, -0.68, -0.68);
  const rx = 0.28 / rl, ry = -0.68 / rl, rz = -0.68 / rl;

  const hx = kx, hy = ky, hz = kz + 1;
  const hl = Math.hypot(hx, hy, hz);
  const nhx = hx / hl, nhy = hy / hl, nhz = hz / hl;

  const hfx = fx, hfy = fy, hfz = fz + 1;
  const hfl = Math.hypot(hfx, hfy, hfz);
  const fhx = hfx / hfl, fhy = hfy / hfl, fhz = hfz / hfl;

  const half = size * 0.5;
  const radius = size * 0.445;
  const alphaPow = rough * rough;
  const coatPow = coatRough * coatRough;

  for (let py = 0; py < size; py++) {
    const dy = (py + 0.5 - half) / radius;
    for (let px = 0; px < size; px++) {
      const dx = (px + 0.5 - half) / radius;
      const r2 = dx * dx + dy * dy;
      if (r2 > 1.045) continue;

      const rDist = Math.sqrt(r2);
      const aa = clamp01((1.0 - rDist) * radius * 0.85 + 0.5);
      if (aa <= 0.005) continue;

      const nx = dx / Math.max(1, rDist);
      const ny = dy / Math.max(1, rDist);
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));

      const u = Math.atan2(nx, nz) / Math.PI;
      const v = Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const micro = (hash2(Math.floor(u * 46), Math.floor(v * 46), 31) - 0.5) * (0.04 + flakes * 0.14);

      const nDotKey = Math.max(0, nx * kx + ny * ky + nz * kz);
      const nDotFill = Math.max(0, nx * fx + ny * fy + nz * fz);
      const nDotRim = Math.max(0, nx * rx + ny * ry + nz * rz);
      const nDotV = Math.max(0.02, nz);
      const fresnel = Math.pow(1 - nDotV, 5);

      const nDotH = Math.max(0, nx * nhx + ny * nhy + nz * nhz);
      const denom = nDotH * nDotH * (alphaPow * alphaPow - 1) + 1;
      const ggx = (alphaPow * alphaPow) / Math.max(0.001, Math.PI * denom * denom);
      const specKey = Math.min(2.4, ggx * 0.24 * (0.35 + 0.65 * nDotKey));

      const nDotHf = Math.max(0, nx * fhx + ny * fhy + nz * fhz);
      const specFill = Math.pow(nDotHf, Math.max(4, 18 / (rough + 0.08))) * 0.18;

      const coatDenom = nDotH * nDotH * (coatPow * coatPow - 1) + 1;
      const coatGgx = (coatPow * coatPow) / Math.max(0.0005, Math.PI * coatDenom * coatDenom);
      const coatSpec = coat * Math.min(2.6, coatGgx * 0.18);

      const amb = 0.14 + 0.14 * (-ny * 0.5 + 0.5) + fresnel * 0.22;
      const diffWeight = (1 - metal * 0.88) * (0.12 + 0.78 * nDotKey + 0.28 * nDotFill);

      const albR = clamp01(br * (1 - flakes * 0.12) + sr * (flakes * 0.12 + micro * 0.6));
      const albG = clamp01(bg * (1 - flakes * 0.12) + sg * (flakes * 0.12 + micro * 0.6));
      const albB = clamp01(bb * (1 - flakes * 0.12) + sb * (flakes * 0.12 + micro * 0.6));

      const specR = (1 - metal) * 0.96 + metal * albR;
      const specG = (1 - metal) * 0.96 + metal * albG;
      const specB = (1 - metal) * 0.98 + metal * albB;

      let outR = albR * (diffWeight + amb * (0.45 + 0.55 * (1 - metal))) + specR * (specKey + specFill) + coatSpec;
      let outG = albG * (diffWeight + amb * (0.45 + 0.55 * (1 - metal))) + specG * (specKey + specFill) + coatSpec;
      let outB = albB * (diffWeight + amb * (0.45 + 0.55 * (1 - metal))) + specB * (specKey + specFill) + coatSpec;

      const rim = Math.pow(1 - nDotV, 2.4) * (0.28 + 0.45 * (1 - rough)) + nDotRim * 0.14;
      outR += (0.55 * (1 - metal) + albR * metal) * rim * 0.42;
      outG += (0.64 * (1 - metal) + albG * metal) * rim * 0.42;
      outB += (0.82 * (1 - metal) + albB * metal) * rim * 0.45;

      if (trans > 0.05) {
        const sss = Math.pow(Math.max(0, 1 - nDotKey), 1.4) * trans * 0.38;
        outR += albR * sss + sr * sss * 0.3;
        outG += albG * sss + sg * sss * 0.3;
        outB += albB * sss + sb * sss * 0.3;
      }

      if (irid > 0.04) {
        const phase = (1 - nDotV) * 5.2;
        outR += irid * 0.28 * (0.5 + 0.5 * Math.cos(phase));
        outG += irid * 0.26 * (0.5 + 0.5 * Math.cos(phase + 2.09));
        outB += irid * 0.34 * (0.5 + 0.5 * Math.cos(phase + 4.18));
      }

      if (emit > 0.02) {
        const eStr = Math.min(1.4, emit * 0.55) * (0.55 + 0.45 * nDotV);
        outR += er * eStr;
        outG += eg * eStr;
        outB += eb * eStr;
      }

      const tone = (v) => {
        const x = Math.max(0, v);
        const mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
        return Math.round(Math.pow(clamp01(mapped), 1 / 2.15) * 255);
      };

      const i4 = (py * size + px) * 4;
      data[i4] = tone(outR);
      data[i4 + 1] = tone(outG);
      data[i4 + 2] = tone(outB);
      data[i4 + 3] = Math.round(aa * 255);
    }
  }
  return { data, width: size, height: size };
}

/**
 * Instant transparent 88x88 Cook-Torrance PBR sphere bake on 2D Canvas.
 * Returns a circular PNG dataURL (transparent outside the orb) or null in headless Node mocks.
 */
export function bakeAnalyticalMaterialSphere(mat, size = 88) {
  if (!mat?.id) return null;
  if (WEBGL_CACHE.has(mat.id)) return WEBGL_CACHE.get(mat.id);
  if (ANALYTICAL_CACHE.has(mat.id)) return ANALYTICAL_CACHE.get(mat.id);
  if (typeof document === "undefined" || typeof ImageData === "undefined") return null;

  let cv, ctx;
  try {
    cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx?.createImageData || !ctx?.putImageData || typeof cv.toDataURL !== "function") return null;
  } catch {
    return null;
  }

  const pixels = renderAnalyticalSpherePixels(mat, size);
  const img = ctx.createImageData(size, size);
  img.data.set(pixels.data);
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL("image/png");
  ANALYTICAL_CACHE.set(mat.id, url);
  return url;
}

function ensureBakerSession(size = 96) {
  if (bakerSession) return bakerSession;
  if (typeof WebGL2RenderingContext === "undefined" && typeof WebGLRenderingContext === "undefined") {
    return null;
  }
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color("#13161c");
    const cGeo = new THREE.PlaneGeometry(6, 4);
    const cm1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.8, 3.65, 3.4) });
    const cm2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.9, 2.6) });
    const cm3 = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.85, 1.45) });
    const c1 = new THREE.Mesh(cGeo, cm1); c1.position.set(4.5, 5.2, 4.2); c1.lookAt(0, 0, 0);
    const c2 = new THREE.Mesh(cGeo, cm2); c2.position.set(-5.8, 2.2, -2.2); c2.lookAt(0, 0, 0);
    const c3 = new THREE.Mesh(cGeo, cm3); c3.position.set(0.5, -4.5, 3.8); c3.lookAt(0, 0, 0);
    envScene.add(c1, c2, c3);
    const envRT = pmrem.fromScene(envScene, 0.035);
    cGeo.dispose(); cm1.dispose(); cm2.dispose(); cm3.dispose(); pmrem.dispose();

    const scene = new THREE.Scene();
    scene.environment = envRT.texture;
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    cam.position.set(0, 0, 3.5);
    cam.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight("#fff8eb", 2.4);
    key.position.set(3.2, 4.4, 4.0);
    const rim = new THREE.DirectionalLight("#9ac5ff", 1.15);
    rim.position.set(-3.8, 1.8, -3.2);
    const hemi = new THREE.HemisphereLight("#eef3ff", "#17181d", 0.5);
    scene.add(key, rim, hemi);

    const sphereGeo = new THREE.SphereGeometry(0.95, 48, 36);
    const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial());
    scene.add(mesh);

    const clipCanvas = document.createElement("canvas");
    clipCanvas.width = size;
    clipCanvas.height = size;
    const clipCtx = clipCanvas.getContext("2d");

    bakerSession = {
      size,
      renderer,
      envRT,
      scene,
      cam,
      sphereGeo,
      mesh,
      clipCanvas,
      clipCtx,
    };
    return bakerSession;
  } catch {
    return null;
  }
}

export function disposeMaterialIconBaker() {
  clearTimeout(idleDisposeTimer);
  idleDisposeTimer = 0;
  bakeQueue = [];
  queueRunning = false;
  PENDING_IDS.clear();
  if (!bakerSession) return;
  try {
    bakerSession.mesh.material?.dispose?.();
    bakerSession.sphereGeo.dispose();
    bakerSession.envRT.dispose();
    bakerSession.renderer.dispose();
  } catch {}
  bakerSession = null;
}

function renderOneWebglMaterial(mat) {
  const s = ensureBakerSession(96);
  if (!s) return null;
  let threeMat = null;
  try {
    const norm = normalizeMaterial(mat);
    // Avoid Three.js transmission background pass turning circular alpha cutouts black
    norm.transmission = 0;
    threeMat = createMaterial(norm);
    s.mesh.material?.dispose?.();
    s.mesh.material = threeMat;
    s.renderer.setClearColor(0x000000, 0);
    s.renderer.clear(true, true, true);
    s.renderer.render(s.scene, s.cam);

    const cx = s.clipCtx;
    const sz = s.size;
    cx.clearRect(0, 0, sz, sz);
    cx.save();
    cx.beginPath();
    cx.arc(sz * 0.5, sz * 0.5, sz * 0.465, 0, Math.PI * 2);
    cx.clip();
    cx.drawImage(s.renderer.domElement, 0, 0, sz, sz);
    cx.restore();
    return s.clipCanvas.toDataURL("image/png");
  } catch {
    threeMat?.dispose?.();
    return null;
  }
}

function pumpBakeQueue() {
  if (queueRunning) return;
  if (!bakeQueue.length) {
    clearTimeout(idleDisposeTimer);
    idleDisposeTimer = setTimeout(() => {
      if (!bakeQueue.length) disposeMaterialIconBaker();
    }, 1500);
    return;
  }
  queueRunning = true;
  clearTimeout(idleDisposeTimer);
  const step = () => {
    const batch = bakeQueue.splice(0, 4);
    for (const mat of batch) {
      PENDING_IDS.delete(mat.id);
      if (WEBGL_CACHE.has(mat.id)) continue;
      const url = renderOneWebglMaterial(mat);
      if (url) {
        WEBGL_CACHE.set(mat.id, url);
        const cbs = WAITERS.get(mat.id);
        if (cbs) {
          for (const cb of cbs) cb(url);
          WAITERS.delete(mat.id);
        }
      }
    }
    queueRunning = false;
    if (bakeQueue.length) pumpBakeQueue();
    else {
      idleDisposeTimer = setTimeout(() => {
        if (!bakeQueue.length) disposeMaterialIconBaker();
      }, 1500);
    }
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
  else setTimeout(step, 16);
}

/**
 * Returns immediately available baked sphere PNG dataURL (WebGL cache -> analytical Cook-Torrance PBR bake)
 * and schedules an async WebGL shader upgrade when running in a browser WebGL environment.
 */
export function getBakedMaterialIcon(mat, onUpgrade = null) {
  if (!mat?.id) return null;
  if (WEBGL_CACHE.has(mat.id)) return WEBGL_CACHE.get(mat.id);

  if (onUpgrade) {
    if (!WAITERS.has(mat.id)) WAITERS.set(mat.id, new Set());
    WAITERS.get(mat.id).add(onUpgrade);
    if (WAITERS.size > 240) {
      const oldest = WAITERS.keys().next().value;
      if (oldest !== mat.id) WAITERS.delete(oldest);
    }
  }

  if (
    typeof WebGL2RenderingContext !== "undefined" &&
    !PENDING_IDS.has(mat.id)
  ) {
    PENDING_IDS.add(mat.id);
    bakeQueue.push(mat);
    pumpBakeQueue();
  }

  return bakeAnalyticalMaterialSphere(mat, 88);
}

export function isMaterialWebglBaked(id) {
  return WEBGL_CACHE.has(id);
}
