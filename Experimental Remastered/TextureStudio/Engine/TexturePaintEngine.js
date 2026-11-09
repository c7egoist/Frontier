/*==========================================================================================================================================
                                                         TEXTUREPAINTENGINE.JS
==========================================================================================================================================*/
/* Clean, seam-free 3D + 2D UV multi-channel PBR painting, layer stack compositing, procedural generators, masks, and stamp projection. */

import * as THREE from "three";
import { TeapotGeometry } from "../Vendor/addons/TeapotGeometry.js";
import { RoundedBoxGeometry } from "../Vendor/addons/RoundedBoxGeometry.js";
import { createDrapedClothGeometry } from "./Materials/clothGeometry.js";
import { fbm3D } from "./NoiseField.js";
import { nextArtworkId } from "./Patterns/ArtworkStackEngine.js";

export const PAINT_DEFAULT_RES = 512;

export const PAINT_MESH_PRESETS = [
  { id: "teapot", label: "Utah Teapot", parts: ["Body", "Lid", "Handle", "Spout"] },
  { id: "shaderball", label: "Shader Ball", parts: ["Shell", "Core"] },
  { id: "box", label: "Rounded Box", parts: ["All Faces"] },
  { id: "sphere", label: "UV Sphere", parts: ["Surface"] },
  { id: "cloth", label: "Draped Cloth", parts: ["Fabric"] },
];
export const PAINT_MESH_LIST = PAINT_MESH_PRESETS;

export const PAINT_BLENDS = ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"];

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb01(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex || "#e8c27a"));
  if (!m) return [0.91, 0.76, 0.48];
  return [
    parseInt(m[1].slice(0, 2), 16) / 255,
    parseInt(m[1].slice(2, 4), 16) / 255,
    parseInt(m[1].slice(4, 6), 16) / 255,
  ];
}

function rgb01ToHex(r, g, b) {
  const toH = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

export const CURVE_PRESETS = {
  linear: [[0, 0], [1, 1]],
  flat: [[0, 1], [1, 1]],
  ease: [[0, 0], [0.35, 0.14], [0.7, 0.82], [1, 1]],
  punch: [[0, 0], [0.22, 0.72], [0.62, 0.94], [1, 1]],
  scurve: [[0, 0], [0.28, 0.08], [0.72, 0.92], [1, 1]],
  bell: [[0, 0], [0.22, 0.86], [0.5, 1], [0.78, 0.86], [1, 0]],
  inverse: [[0, 1], [1, 0]],
};

export function sampleCurve(points, t) {
  const x = clamp(t, 0, 1);
  if (!Array.isArray(points) || points.length === 0) return x;
  if (points.length === 1) return clamp(points[0][1], 0, 1);
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return clamp(pts[0][1], 0, 1);
  if (x >= pts[pts.length - 1][0]) return clamp(pts[pts.length - 1][1], 0, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      const span = Math.max(1e-5, x1 - x0);
      const u = (x - x0) / span;
      // Smooth Catmull-Rom tangent estimate for responsive spline shape
      const pPrev = pts[Math.max(0, i - 1)];
      const pNext = pts[Math.min(pts.length - 1, i + 2)];
      const m0 = ((y1 - pPrev[1]) / Math.max(1e-4, x1 - pPrev[0])) * span * 0.5;
      const m1 = ((pNext[1] - y0) / Math.max(1e-4, pNext[0] - x0)) * span * 0.5;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return clamp(h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1, 0, 1);
    }
  }
  return clamp(pts[pts.length - 1][1], 0, 1);
}

export function sampleCurveLut(points, count = 17) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = sampleCurve(points, count <= 1 ? 1 : i / (count - 1));
  }
  return out;
}

export function getToolChannels(brush, toolOverride = null) {
  const t = toolOverride || brush?.tool || "paint";
  if (t === "erase") return brush?.eraseChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  if (t === "fill") return brush?.fillChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  return brush?.paintChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) * 0.5;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const hue = ((h % 1) + 1) % 1;
  if (s <= 1e-4) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const tc = (t) => {
    const x = ((t % 1) + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 0.5) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [tc(hue + 1 / 3), tc(hue), tc(hue - 1 / 3)];
}

export function shiftHslHex(hex, hDelta = 0, sDelta = 0, lDelta = 0) {
  const [r, g, b] = hexToRgb01(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h + hDelta, clamp(s + sDelta, 0, 1), clamp(l + lDelta, 0, 1));
  return rgb01ToHex(nr, ng, nb);
}

function prngHash(seed, salt = 0) {
  let x = (Math.imul(Math.floor(seed) | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

/**
 * Resolve per-dab brush geometry & colour dynamics from Stroke Curves + Jitter + Colour Dynamics.
 */
export function resolveDabVariation(brush, strokeT = 0, seed = 1, followAngleDeg = null) {
  const j = brush.jitter || {};
  const cd = brush.colourDynamics || {};
  const curves = brush.curves || {};

  const t = clamp(strokeT, 0, 1);
  const sizeCurve = curves.sizeOverStroke ? sampleCurve(curves.sizeOverStroke, t) : 1;
  const flowCurve = curves.opacityOverStroke ? sampleCurve(curves.opacityOverStroke, t) : 1;
  const hueCurveVal = curves.hueOverStroke ? sampleCurve(curves.hueOverStroke, t) : 0.5;

  const rSize = prngHash(seed, 1) * 2 - 1;
  const rAngle = prngHash(seed, 2) * 2 - 1;
  const rScatA = prngHash(seed, 3) * Math.PI * 2;
  const rScatR = Math.sqrt(prngHash(seed, 4));
  const rFlow = prngHash(seed, 5);
  const rHue = prngHash(seed, 6) * 2 - 1;
  const rSat = prngHash(seed, 7) * 2 - 1;
  const rVal = prngHash(seed, 8) * 2 - 1;

  const sizeScale = clamp(sizeCurve * (1 + rSize * (j.size || 0) * 0.75), 0.12, 2.4);
  const flowScale = clamp(flowCurve * (1 - rFlow * (j.flow || 0)), 0.03, 1.0);
  const baseAngle = (brush.angle || 0) + (followAngleDeg !== null && brush.followDirection ? followAngleDeg : 0);
  const angle = baseAngle + rAngle * (j.angle || 0);
  const scatterMag = rScatR * (j.scatter || 0);
  const scatterU = Math.cos(rScatA) * scatterMag;
  const scatterV = Math.sin(rScatA) * scatterMag;

  const hCurveShift = cd.strokeGradient ? (hueCurveVal - 0.5) * 1.0 : 0;
  const hDelta = hCurveShift + rHue * (cd.hueJitter || 0) * 0.5;
  const sDelta = rSat * (cd.satJitter || 0) * 0.75;
  const vDelta = rVal * (cd.valJitter || 0) * 0.65;
  const color = (hDelta !== 0 || sDelta !== 0 || vDelta !== 0)
    ? shiftHslHex(brush.color || "#e8c27a", hDelta, sDelta, vDelta)
    : (brush.color || "#e8c27a");

  return {
    ...brush,
    color,
    angle,
    flow: clamp((brush.flow ?? 0.78) * flowScale, 0.02, 1.0),
    sizeScale,
    scatterU,
    scatterV,
  };
}

/**
 * Convert raw RGBA pixels from an uploaded PNG/JPG/WebP/SVG into multi-channel surface maps
 * (useful both as a Stamp Decal, Custom Brush Alpha Tip, or Fill Texture).
 */
export function rgbaPixelsToSurfaceMaps(rgba, width, heightPx, { name = "Uploaded Image", previewDataUrl = "" } = {}) {
  const n = width * heightPx;
  const albedo = new Uint8ClampedArray(n * 4);
  const tipAlpha = new Uint8ClampedArray(n * 4);
  const roughness = new Uint8ClampedArray(n * 4);
  const metalness = new Uint8ClampedArray(n * 4);
  const height = new Uint8ClampedArray(n * 4);

  let hasAlphaVariance = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 245) { hasAlphaVariance = true; break; }
  }

  for (let i = 0; i < n; i++) {
    const i4 = i * 4;
    const r = rgba[i4], g = rgba[i4 + 1], b = rgba[i4 + 2], a = rgba[i4 + 3];
    const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    const alphaVal = hasAlphaVariance ? a : lum;

    albedo[i4] = r; albedo[i4 + 1] = g; albedo[i4 + 2] = b; albedo[i4 + 3] = a;
    tipAlpha[i4] = 255; tipAlpha[i4 + 1] = 255; tipAlpha[i4 + 2] = 255; tipAlpha[i4 + 3] = alphaVal;

    const rVal = clamp(Math.round(170 - lum * 0.45), 16, 245);
    roughness[i4] = rVal; roughness[i4 + 1] = rVal; roughness[i4 + 2] = rVal; roughness[i4 + 3] = 255;
    metalness[i4] = 18; metalness[i4 + 1] = 18; metalness[i4 + 2] = 18; metalness[i4 + 3] = 255;
    const hVal = clamp(Math.round(128 + (lum - 128) * 0.7), 0, 255);
    height[i4] = hVal; height[i4 + 1] = hVal; height[i4 + 2] = hVal; height[i4 + 3] = 255;
  }

  return {
    name,
    width,
    heightPx,
    albedo,
    tipAlpha,
    roughness,
    metalness,
    height,
    previewDataUrl,
    isCustomImage: true,
  };
}

/**
 * Build a clean non-overlapping [0..1]x[0..1] UV geometry for each target mesh,
 * tagging vertices with `surfacePart` (0..N-1) and UV island `chartId` so both
 * 3D painting, 2D UV painting, flood-fill, and High/Low baking work seamlessly together.
 */
export function buildPaintTargetGeometry(meshId = "teapot", customGeometry = null) {
  let geo;
  let partNames = ["Surface"];

  if (customGeometry) {
    geo = customGeometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    const scale = 2.4 / maxDim;
    geo.translate(-center.x, -center.y, -center.z);
    geo.scale(scale, scale, scale);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) generateAutoBoxUVs(geo);
    clampAndSanitizeUVs(geo);
    partNames = ["Imported Mesh"];
    const count = geo.attributes.position.count;
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  } else if (meshId === "teapot") {
    const seg = 16;
    geo = new TeapotGeometry(1.0, seg);
    const uv = geo.attributes.uv;
    const countPerPatch = (seg + 1) ** 2;
    const partAttr = new Float32Array(uv.count);
    partNames = ["Body", "Lid", "Handle", "Spout"];

    // Pack the 4 named parts cleanly into 4 quadrants inside [0..1]x[0..1]
    // Quadrant layout: Body (0,0), Lid (0.5,0), Handle (0,0.5), Spout (0.5,0.5)
    for (let i = 0; i < uv.count; i++) {
      const patch = Math.floor(i / countPerPatch);
      let partIdx = 0;
      let local = 0;
      let cols = 4;
      let rows = 4;

      if (patch >= 20 && patch < 28) {
        partIdx = 1; // Lid (8 patches -> 4x2)
        local = patch - 20;
        cols = 4;
        rows = 2;
      } else if (patch >= 12 && patch < 16) {
        partIdx = 2; // Handle (4 patches -> 2x2)
        local = patch - 12;
        cols = 2;
        rows = 2;
      } else if (patch >= 16 && patch < 20) {
        partIdx = 3; // Spout (4 patches -> 2x2)
        local = patch - 16;
        cols = 2;
        rows = 2;
      } else {
        partIdx = 0; // Body (patches 0..11, 28..31 -> 16 patches -> 4x4)
        local = patch < 12 ? patch : patch - 16;
        cols = 4;
        rows = 4;
      }

      const qx = (partIdx % 2) * 0.5;
      const qy = Math.floor(partIdx / 2) * 0.5;
      const g = 0.06;
      const cellW = 0.48 / cols;
      const cellH = 0.48 / rows;
      const lu = (local % cols) * cellW + 0.01;
      const lv = Math.floor(local / cols) * cellH + 0.01;
      const u = qx + lu + (g + uv.getX(i) * (1 - 2 * g)) * cellW;
      const v = qy + lv + (g + uv.getY(i) * (1 - 2 * g)) * cellH;
      uv.setXY(i, u, v);
      partAttr[i] = partIdx;
    }
    uv.needsUpdate = true;
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(partAttr, 1));
  } else if (meshId === "shaderball") {
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const a = (Math.PI * i) / 180;
      const y = 1.25 * Math.cos(a);
      let r = 1.25 * Math.sin(a);
      const groove = (c, w, d) => d * Math.exp(-Math.pow((y - c) / w, 6));
      r -= groove(0.58, 0.02, 0.032) + groove(0.5, 0.015, 0.024);
      r -= groove(-0.68, 0.018, 0.028) + groove(-0.78, 0.018, 0.028);
      pts.push(new THREE.Vector2(Math.max(0.002, r), y));
    }
    geo = new THREE.LatheGeometry(pts.reverse(), 96);
    clampAndSanitizeUVs(geo);
    const pos = geo.attributes.position;
    const partAttr = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      partAttr[i] = pos.getY(i) < -0.62 ? 1 : 0;
    }
    partNames = ["Upper Shell", "Base Band"];
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(partAttr, 1));
  } else if (meshId === "box") {
    geo = new RoundedBoxGeometry(1.9, 1.9, 1.9, 4, 0.14);
    generateAutoBoxUVs(geo);
    const count = geo.attributes.position.count;
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
    partNames = ["All Faces"];
  } else if (meshId === "cloth") {
    geo = createDrapedClothGeometry();
    geo.scale(0.85, 0.85, 0.85);
    clampAndSanitizeUVs(geo);
    const count = geo.attributes.position.count;
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
    partNames = ["Fabric"];
  } else {
    geo = new THREE.SphereGeometry(1.22, 64, 48);
    clampAndSanitizeUVs(geo);
    const count = geo.attributes.position.count;
    geo.setAttribute("surfacePart", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
    partNames = ["Surface"];
  }

  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.partNames = partNames;
  return geo;
}

function clampAndSanitizeUVs(geo) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const u = Math.max(0.002, Math.min(0.998, uv.getX(i)));
    const v = Math.max(0.002, Math.min(0.998, uv.getY(i)));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

function generateAutoBoxUVs(geo) {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uvs = new Float32Array(pos.count * 2);
  geo.computeBoundingBox();
  const min = geo.boundingBox.min;
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const sx = Math.max(size.x, 1e-4), sy = Math.max(size.y, 1e-4), sz = Math.max(size.z, 1e-4);

  // Pack 6 box projections cleanly into 3x2 cells inside [0..1]x[0..1]
  for (let i = 0; i < pos.count; i++) {
    const nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const px = (pos.getX(i) - min.x) / sx;
    const py = (pos.getY(i) - min.y) / sy;
    const pz = (pos.getZ(i) - min.z) / sz;

    let cell = 0, u = 0, v = 0;
    if (ax >= ay && ax >= az) {
      cell = nx >= 0 ? 0 : 1;
      u = pz; v = py;
    } else if (ay >= ax && ay >= az) {
      cell = ny >= 0 ? 2 : 3;
      u = px; v = pz;
    } else {
      cell = nz >= 0 ? 4 : 5;
      u = px; v = py;
    }
    const cx = cell % 3;
    const cy = Math.floor(cell / 3);
    const pad = 0.05;
    uvs[i * 2] = (cx + pad + clamp(u, 0, 1) * (1 - 2 * pad)) / 3;
    uvs[i * 2 + 1] = (cy + pad + clamp(v, 0, 1) * (1 - 2 * pad)) / 2;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/**
 * Spatial & UV index for fast 3D stroke projection, flood fill, and generator map caching.
 */
export function buildMeshPaintIndex(geo) {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const partAttr = geo.attributes.surfacePart;
  const idx = geo.index ? geo.index.array : null;
  const triCount = idx ? idx.length / 3 : pos.count / 3;

  const tris = new Array(triCount);
  // UV island clustering by shared UV vertices
  const parent = new Int32Array(triCount);
  const edgeToTri = new Map();
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };

  for (let t = 0; t < triCount; t++) {
    parent[t] = t;
    const i0 = idx ? idx[t * 3] : t * 3;
    const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
    const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;

    const p0 = [pos.getX(i0), pos.getY(i0), pos.getZ(i0)];
    const p1 = [pos.getX(i1), pos.getY(i1), pos.getZ(i1)];
    const p2 = [pos.getX(i2), pos.getY(i2), pos.getZ(i2)];

    const n0 = [norm.getX(i0), norm.getY(i0), norm.getZ(i0)];
    const n1 = [norm.getX(i1), norm.getY(i1), norm.getZ(i1)];
    const n2 = [norm.getX(i2), norm.getY(i2), norm.getZ(i2)];

    const uv0 = [uv.getX(i0), uv.getY(i0)];
    const uv1 = [uv.getX(i1), uv.getY(i1)];
    const uv2 = [uv.getX(i2), uv.getY(i2)];

    const cx = (p0[0] + p1[0] + p2[0]) / 3;
    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const cz = (p0[2] + p1[2] + p2[2]) / 3;
    const r = Math.max(
      Math.hypot(p0[0] - cx, p0[1] - cy, p0[2] - cz),
      Math.hypot(p1[0] - cx, p1[1] - cy, p1[2] - cz),
      Math.hypot(p2[0] - cx, p2[1] - cy, p2[2] - cz),
    );

    const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
    let fnx = e1y * e2z - e1z * e2y;
    let fny = e1z * e2x - e1x * e2z;
    let fnz = e1x * e2y - e1y * e2x;
    const fl = Math.hypot(fnx, fny, fnz) || 1;
    fnx /= fl; fny /= fl; fnz /= fl;

    const minU = Math.min(uv0[0], uv1[0], uv2[0]);
    const maxU = Math.max(uv0[0], uv1[0], uv2[0]);
    const minV = Math.min(uv0[1], uv1[1], uv2[1]);
    const maxV = Math.max(uv0[1], uv1[1], uv2[1]);

    tris[t] = {
      t,
      p0, p1, p2,
      n0, n1, n2,
      uv0, uv1, uv2,
      center: [cx, cy, cz],
      radius: r,
      faceNormal: [fnx, fny, fnz],
      minU, maxU, minV, maxV,
      part: partAttr ? Math.round(partAttr.getX(i0)) : 0,
      island: 0,
    };

    const ukeys = [
      `${Math.round(uv0[0] * 10000)},${Math.round(uv0[1] * 10000)}`,
      `${Math.round(uv1[0] * 10000)},${Math.round(uv1[1] * 10000)}`,
      `${Math.round(uv2[0] * 10000)},${Math.round(uv2[1] * 10000)}`,
    ];
    for (let e = 0; e < 3; e++) {
      const a = ukeys[e], b = ukeys[(e + 1) % 3];
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeToTri.has(ek)) {
        parent[find(t)] = find(edgeToTri.get(ek));
      } else {
        edgeToTri.set(ek, t);
      }
    }
  }

  const islandMap = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(t);
    if (!islandMap.has(root)) islandMap.set(root, islandMap.size);
    tris[t].island = islandMap.get(root);
  }

  return { tris, triCount, islandCount: islandMap.size, partNames: geo.userData.partNames || ["Surface"] };
}

/**
 * Create a per-layer pixel buffer set for Paint layers & Masks.
 */
export function createLayerPixelBuffer(res) {
  const n = res * res;
  return {
    res,
    albedo: new Uint8ClampedArray(n * 4), // RGBA 0..255 (alpha = Albedo coverage)
    roughness: new Uint8ClampedArray(n).fill(140),
    metalness: new Uint8ClampedArray(n).fill(0),
    height: new Uint8ClampedArray(n).fill(128), // 128 = 0 displacement
    roughAlpha: new Uint8ClampedArray(n),
    metalAlpha: new Uint8ClampedArray(n),
    heightAlpha: new Uint8ClampedArray(n),
  };
}

export function createMaskBuffer(res, fillValue = 255) {
  return new Uint8ClampedArray(res * res).fill(fillValue);
}

export function createPaintLayer(kind = "paint", overrides = {}) {
  const res = overrides.res || PAINT_DEFAULT_RES;
  const id = overrides.id || nextArtworkId("tp");
  const isFolder = kind === "folder";
  return {
    id,
    kind, // "paint" | "fill" | "material" | "decal" | "generator" | "folder"
    name: overrides.name || (
      kind === "paint" ? "Paint Layer" :
      kind === "fill" ? "Fill Layer" :
      kind === "material" ? "Material Layer" :
      kind === "decal" ? "Stamp Decal" :
      kind === "generator" ? "Weathering Generator" : "Folder"
    ),
    parentId: overrides.parentId || null,
    visible: overrides.visible !== false,
    locked: overrides.locked === true,
    blend: overrides.blend || "Normal",
    opacity: clamp(overrides.opacity ?? 1, 0, 1),
    partFilter: overrides.partFilter ?? -1, // -1 = all parts, 0..N = specific part
    channels: {
      albedo: true,
      roughness: true,
      metalness: true,
      height: true,
      ...(overrides.channels || {}),
    },
    fill: {
      color: "#c89f68",
      roughness: 0.45,
      metalness: 0.0,
      height: 0.0,
      patternRepeats: 3,
      patternData: null, // Optional Pattern Studio raster maps
      ...(overrides.fill || {}),
    },
    material: {
      presetId: "racing-green",
      presetName: "Racing Green",
      color: "#345f42",
      roughness: 0.24,
      metalness: 0.87,
      height: 0.0,
      grainScale: 10,
      grainStrength: 0.08,
      ...(overrides.material || {}),
    },
    decal: {
      stampName: "Industrial Warning Seal",
      stampMaps: null, // { albedo, roughness, metalness, height, width, heightPx }
      anchorPos: [0, 0.2, 1.0],
      anchorNormal: [0, 0, 1],
      radius: 0.45,
      rotation: 0,
      ...(overrides.decal || {}),
    },
    generator: {
      preset: "edge-wear", // "edge-wear" | "crevice-dirt" | "top-dust" | "triplanar-grunge"
      color: "#cad4de",
      roughness: 0.28,
      metalness: 0.82,
      height: -0.15,
      threshold: 0.42,
      softness: 0.24,
      noiseMix: 0.35,
      noiseScale: 6.0,
      ...(overrides.generator || {}),
    },
    pixels: kind === "paint" ? (overrides.pixels || createLayerPixelBuffer(res)) : null,
    mask: overrides.mask || null, // { enabled, invert, pixels: Uint8ClampedArray(res*res), editing: false }
  };
}

export function createPaintDocument(res = PAINT_DEFAULT_RES) {
  const baseFill = createPaintLayer("fill", {
    res,
    name: "Base Ceramic Coat",
    fill: { color: "#cfd2d6", roughness: 0.34, metalness: 0.06, height: 0.0 },
  });
  const paintTop = createPaintLayer("paint", {
    res,
    name: "Hand Painted Layer",
  });
  return {
    schema: "frontier.texture-paint.v2",
    resolution: res,
    meshId: "teapot",
    layers: [baseFill, paintTop], // Bottom-to-top compositing order
    selectedLayerId: paintTop.id,
    editingMask: false,
    bakedMaps: null, // Optional { normal, ao, curvature, height, worldNormal, res }
  };
}

/**
 * Rasterize geometric/baked curvature, AO, and world-normal cues per UV texel so Generators work out-of-the-box
 * even before running an explicit High/Low bake, and automatically upgrade when real Baked Maps are attached!
 */
export function buildDefaultMeshCues(geo, meshIndex, res) {
  const n = res * res;
  const worldPos = new Float32Array(n * 3);
  const worldNormal = new Float32Array(n * 3);
  const curvature = new Float32Array(n).fill(0.5);
  const ao = new Float32Array(n).fill(0.85);
  const covered = new Uint8Array(n);
  const triAt = new Int32Array(n).fill(-1);
  const partAt = new Int16Array(n).fill(-1);
  const islandAt = new Int32Array(n).fill(-1);

  for (let tIdx = 0; tIdx < meshIndex.tris.length; tIdx++) {
    const tri = meshIndex.tris[tIdx];
    const x0 = tri.uv0[0] * res, y0 = (1 - tri.uv0[1]) * res;
    const x1 = tri.uv1[0] * res, y1 = (1 - tri.uv1[1]) * res;
    const x2 = tri.uv2[0] * res, y2 = (1 - tri.uv2[1]) * res;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1);
    const maxX = Math.min(res - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) + 0);
    const maxY = Math.min(res - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);

    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) continue;

    // Estimate local edge sharpness from vertex normals vs face normal for crisp instant curvature
    const d0 = 1 - Math.abs(tri.n0[0] * tri.faceNormal[0] + tri.n0[1] * tri.faceNormal[1] + tri.n0[2] * tri.faceNormal[2]);
    const d1 = 1 - Math.abs(tri.n1[0] * tri.faceNormal[0] + tri.n1[1] * tri.faceNormal[1] + tri.n1[2] * tri.faceNormal[2]);
    const d2 = 1 - Math.abs(tri.n2[0] * tri.faceNormal[0] + tri.n2[1] * tri.faceNormal[1] + tri.n2[2] * tri.faceNormal[2]);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5, sy = py + 0.5;
        const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) / denom;
        const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05) continue;

        const pid = py * res + px;
        if (covered[pid] && (w0 < 0 || w1 < 0 || w2 < 0)) continue;

        covered[pid] = 1;
        triAt[pid] = tIdx;
        partAt[pid] = tri.part;
        islandAt[pid] = tri.island;

        const wx = w0 * tri.p0[0] + w1 * tri.p1[0] + w2 * tri.p2[0];
        const wy = w0 * tri.p0[1] + w1 * tri.p1[1] + w2 * tri.p2[1];
        const wz = w0 * tri.p0[2] + w1 * tri.p1[2] + w2 * tri.p2[2];
        worldPos[pid * 3] = wx;
        worldPos[pid * 3 + 1] = wy;
        worldPos[pid * 3 + 2] = wz;

        let nx = w0 * tri.n0[0] + w1 * tri.n1[0] + w2 * tri.n2[0];
        let ny = w0 * tri.n0[1] + w1 * tri.n1[1] + w2 * tri.n2[1];
        let nz = w0 * tri.n0[2] + w1 * tri.n1[2] + w2 * tri.n2[2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        worldNormal[pid * 3] = nx;
        worldNormal[pid * 3 + 1] = ny;
        worldNormal[pid * 3 + 2] = nz;

        const sharp = clamp((w0 * d0 + w1 * d1 + w2 * d2) * 3.5, 0, 0.45);
        curvature[pid] = clamp(0.5 + sharp + (ny > 0 ? 0.08 : -0.08));
        ao[pid] = clamp(0.65 + 0.35 * (ny * 0.5 + 0.5));
      }
    }
  }

  return { res, worldPos, worldNormal, curvature, ao, covered, triAt, partAt, islandAt };
}

/**
 * Evaluate tip shape alpha for Brush presets (Round, Airbrush, Chisel, Chalk, Splatter, Sponge).
 */
function sampleBrushTip(dxNorm, dyNorm, brush, px, py) {
  let u = dxNorm;
  let v = dyNorm;
  if (brush.angle) {
    const rad = (-brush.angle * Math.PI) / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const ru = u * c - v * s;
    const rv = u * s + v * c;
    u = ru;
    v = rv;
  }
  const roundness = clamp(brush.roundness ?? 1.0, 0.15, 1.0);
  v /= roundness;

  const tip = brush.tip || "round";
  if (tip === "custom" && brush.customTipData) {
    const su = u * 0.5 + 0.5;
    const sv = v * 0.5 + 0.5;
    if (su < 0 || su > 1 || sv < 0 || sv > 1) return 0;
    const ct = brush.customTipData;
    const ctH = ct.heightPx || ct.width;
    const ix = Math.min(ct.width - 1, Math.max(0, Math.floor(su * ct.width)));
    const iy = Math.min(ctH - 1, Math.max(0, Math.floor(sv * ctH)));
    const buf = ct.tipAlpha || ct.albedo || ct.rgba;
    const si = (iy * ct.width + ix) * 4;
    const tipA = (buf[si + 3] ?? 255) / 255;
    const dist = Math.hypot(u, v);
    const edgeFall = dist > 1 ? 0 : sampleCurve(brush.curves?.falloff || [[0, 0], [0.5, 0.55], [1, 1]], 1 - dist);
    return clamp(tipA * (brush.curves?.falloff ? edgeFall : 1) * (brush.flow ?? 1), 0, 1);
  }

  const dist = Math.hypot(u, v);
  if (dist > 1) return 0;

  const hardness = clamp(brush.hardness ?? 0.72, 0.02, 0.99);
  const linearEdge = dist <= hardness ? 1 : 1 - (dist - hardness) / Math.max(0.01, 1 - hardness);
  let falloff = brush.curves?.falloff
    ? sampleCurve(brush.curves.falloff, linearEdge)
    : linearEdge * linearEdge * (3 - 2 * linearEdge);

  if (tip === "chisel") {
    const boxD = Math.max(Math.abs(u), Math.abs(v) * 1.4);
    const cEdge = boxD <= 0.85 ? 1 : clamp((1 - boxD) / 0.15, 0, 1);
    falloff = brush.curves?.falloff ? sampleCurve(brush.curves.falloff, cEdge) : cEdge;
  } else if (tip === "chalk") {
    const grain = fbm3D(px * 0.25, py * 0.25, 1.3, 2, 17);
    falloff *= clamp(0.35 + grain * 1.15, 0, 1);
  } else if (tip === "splatter") {
    const dots = fbm3D(px * 0.19, py * 0.19, 4.7, 2, 91);
    falloff = dots > 0.54 ? falloff : 0;
  } else if (tip === "sponge") {
    const pores = fbm3D(px * 0.22, py * 0.22, 8.2, 3, 53);
    falloff *= clamp((pores - 0.3) * 2.1, 0, 1);
  }
  return clamp(falloff * (brush.flow ?? 1), 0, 1);
}

/**
 * Seam-free 3D world-space capsule/sphere stroke dab into an accumulation stroke buffer.
 */
export function applyBrushDab3D({
  strokeAccum,
  meshIndex,
  cues,
  hitPos,
  hitNormal,
  worldRadius,
  brush,
  activePartFilter = -1,
}) {
  const res = cues.res;
  const rMax = Math.max(0.005, worldRadius);
  const rSearch = rMax * 1.35;
  const px0 = hitPos.x, py0 = hitPos.y, pz0 = hitPos.z;
  const nx0 = hitNormal.x, ny0 = hitNormal.y, nz0 = hitNormal.z;

  // Candidate triangles near hit sphere
  for (let tIdx = 0; tIdx < meshIndex.tris.length; tIdx++) {
    const tri = meshIndex.tris[tIdx];
    if (activePartFilter >= 0 && tri.part !== activePartFilter) continue;
    const dxC = tri.center[0] - px0, dyC = tri.center[1] - py0, dzC = tri.center[2] - pz0;
    if (Math.hypot(dxC, dyC, dzC) > tri.radius + rSearch) continue;
    // Backface threshold so brush doesn't bleed onto opposite thin side
    const dotN = tri.faceNormal[0] * nx0 + tri.faceNormal[1] * ny0 + tri.faceNormal[2] * nz0;
    if (dotN < -0.25) continue;

    // Project UV bounding box (+2px dilation to cross UV seams cleanly)
    const minPx = Math.max(0, Math.floor(tri.minU * res) - 2);
    const maxPx = Math.min(res - 1, Math.ceil(tri.maxU * res) + 2);
    const minPy = Math.max(0, Math.floor((1 - tri.maxV) * res) - 2);
    const maxPy = Math.min(res - 1, Math.ceil((1 - tri.minV) * res) + 2);

    const x0 = tri.uv0[0] * res, y0 = (1 - tri.uv0[1]) * res;
    const x1 = tri.uv1[0] * res, y1 = (1 - tri.uv1[1]) * res;
    const x2 = tri.uv2[0] * res, y2 = (1 - tri.uv2[1]) * res;
    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) continue;

    // Build local tangent basis around hit normal for oriented tips (chisel/stamp)
    const upRef = Math.abs(ny0) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let tx = upRef[1] * nz0 - upRef[2] * ny0;
    let ty = upRef[2] * nx0 - upRef[0] * nz0;
    let tz = upRef[0] * ny0 - upRef[1] * nx0;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const bx = ny0 * tz - nz0 * ty;
    const by = nz0 * tx - nx0 * tz;
    const bz = nx0 * ty - ny0 * tx;

    for (let py = minPy; py <= maxPy; py++) {
      for (let px = minPx; px <= maxPx; px++) {
        const sx = px + 0.5, sy = py + 0.5;
        const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) / denom;
        const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        // Allow slight negative barycentric margin (-0.18) for clean seam bleed dilation
        if (w0 < -0.18 || w1 < -0.18 || w2 < -0.18) continue;

        const pid = py * res + px;
        if (activePartFilter >= 0 && cues.partAt[pid] >= 0 && cues.partAt[pid] !== activePartFilter) continue;

        const wx = w0 * tri.p0[0] + w1 * tri.p1[0] + w2 * tri.p2[0];
        const wy = w0 * tri.p0[1] + w1 * tri.p1[1] + w2 * tri.p2[1];
        const wz = w0 * tri.p0[2] + w1 * tri.p1[2] + w2 * tri.p2[2];

        const vx = wx - px0, vy = wy - py0, vz = wz - pz0;
        const d3 = Math.hypot(vx, vy, vz);
        if (d3 > rMax) continue;

        const uLocal = (vx * tx + vy * ty + vz * tz) / rMax;
        const vLocal = (vx * bx + vy * by + vz * bz) / rMax;
        const alpha = sampleBrushTip(uLocal, vLocal, brush, px, py);
        if (alpha <= 0.001) continue;

        if (brush.tool === "stamp" && brush.stampData) {
          // Sample stamp pixel at (uLocal*0.5+0.5, vLocal*0.5+0.5)
          let rotU = uLocal, rotV = vLocal;
          if (brush.angle) {
            const rad = (-brush.angle * Math.PI) / 180;
            const c = Math.cos(rad), s = Math.sin(rad);
            rotU = uLocal * c - vLocal * s;
            rotV = uLocal * s + vLocal * c;
          }
          const su = rotU * 0.5 + 0.5;
          const sv = 1 - (rotV * 0.5 + 0.5);
          if (su >= 0 && su <= 1 && sv >= 0 && sv <= 1) {
            const st = brush.stampData;
            const stH = st.heightPx || st.width;
            const stAlb = st.albedo || st.rgba;
            const ix = Math.min(st.width - 1, Math.max(0, Math.floor(su * st.width)));
            const iy = Math.min(stH - 1, Math.max(0, Math.floor(sv * stH)));
            const si = (iy * st.width + ix) * 4;
            const sa = (stAlb[si + 3] / 255) * (brush.flow ?? 1);
            if (sa > strokeAccum.alpha[pid]) {
              strokeAccum.hasPerPixelPbr = true;
              strokeAccum.alpha[pid] = sa;
              strokeAccum.color[pid * 3] = stAlb[si];
              strokeAccum.color[pid * 3 + 1] = stAlb[si + 1];
              strokeAccum.color[pid * 3 + 2] = stAlb[si + 2];
              strokeAccum.rough[pid] = st.roughness ? st.roughness[si] : Math.round(clamp(brush.roughness ?? 0.45) * 255);
              strokeAccum.metal[pid] = st.metalness ? st.metalness[si] : Math.round(clamp(brush.metalness ?? 0) * 255);
              strokeAccum.height[pid] = st.height ? st.height[si] : Math.round(clamp((brush.height ?? 0.25) * 0.5 + 0.5) * 255);
              strokeAccum.dirtyMinX = Math.min(strokeAccum.dirtyMinX, px);
              strokeAccum.dirtyMaxX = Math.max(strokeAccum.dirtyMaxX, px);
              strokeAccum.dirtyMinY = Math.min(strokeAccum.dirtyMinY, py);
              strokeAccum.dirtyMaxY = Math.max(strokeAccum.dirtyMaxY, py);
            }
          }
        } else {
          // Accumulation builds smoothly via flow without exceeding 1, and opacity applies at stroke commit/display!
          const next = clamp(strokeAccum.alpha[pid] + alpha * (1 - strokeAccum.alpha[pid] * 0.72));
          if (next > strokeAccum.alpha[pid]) {
            const [dr, dg, db] = hexToRgb01(brush.color || "#e8c27a").map((v) => Math.round(v * 255));
            const prevA = strokeAccum.alpha[pid];
            const dw = next > 1e-4 ? clamp(alpha / next, 0, 1) : 1;
            strokeAccum.hasPerPixelPbr = true;
            strokeAccum.alpha[pid] = next;
            if (prevA < 0.005) {
              strokeAccum.color[pid * 3] = dr;
              strokeAccum.color[pid * 3 + 1] = dg;
              strokeAccum.color[pid * 3 + 2] = db;
            } else {
              strokeAccum.color[pid * 3] = Math.round(strokeAccum.color[pid * 3] * (1 - dw) + dr * dw);
              strokeAccum.color[pid * 3 + 1] = Math.round(strokeAccum.color[pid * 3 + 1] * (1 - dw) + dg * dw);
              strokeAccum.color[pid * 3 + 2] = Math.round(strokeAccum.color[pid * 3 + 2] * (1 - dw) + db * dw);
            }
            strokeAccum.rough[pid] = Math.round(clamp(brush.roughness ?? 0.45) * 255);
            strokeAccum.metal[pid] = Math.round(clamp(brush.metalness ?? 0) * 255);
            strokeAccum.height[pid] = Math.round(clamp((brush.height ?? 0.25) * 0.5 + 0.5) * 255);
            strokeAccum.dirtyMinX = Math.min(strokeAccum.dirtyMinX, px);
            strokeAccum.dirtyMaxX = Math.max(strokeAccum.dirtyMaxX, px);
            strokeAccum.dirtyMinY = Math.min(strokeAccum.dirtyMinY, py);
            strokeAccum.dirtyMaxY = Math.max(strokeAccum.dirtyMaxY, py);
          }
        }
      }
    }
  }
}

/**
 * Direct 2D UV brush splat sharing exact accumulation contract as 3D splat.
 */
export function applyBrushDabUV({ strokeAccum, cues, u, v, pixelRadius, brush, activePartFilter = -1 }) {
  const res = cues.res;
  const cx = u * res;
  const cy = (1 - v) * res;
  const r = Math.max(1.5, pixelRadius);
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(res - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(res - 1, Math.ceil(cy + r));
  const [dr, dg, db] = hexToRgb01(brush.color || "#e8c27a").map((c) => Math.round(c * 255));
  const dRough = Math.round(clamp(brush.roughness ?? 0.45) * 255);
  const dMetal = Math.round(clamp(brush.metalness ?? 0) * 255);
  const dHeight = Math.round(clamp((brush.height ?? 0.25) * 0.5 + 0.5) * 255);

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const pid = py * res + px;
      if (activePartFilter >= 0 && cues.partAt[pid] >= 0 && cues.partAt[pid] !== activePartFilter) continue;
      const dx = (px + 0.5 - cx) / r;
      const dy = (py + 0.5 - cy) / r;
      const alpha = sampleBrushTip(dx, dy, brush, px, py);
      if (alpha <= 0.001) continue;

      if (brush.tool === "stamp" && brush.stampData) {
        let rotU = dx, rotV = dy;
        if (brush.angle) {
          const rad = (-brush.angle * Math.PI) / 180;
          const c = Math.cos(rad), s = Math.sin(rad);
          rotU = dx * c - dy * s;
          rotV = dx * s + dy * c;
        }
        const su = rotU * 0.5 + 0.5;
        const sv = rotV * 0.5 + 0.5;
        if (su >= 0 && su <= 1 && sv >= 0 && sv <= 1) {
          const st = brush.stampData;
          const stH = st.heightPx || st.width;
          const stAlb = st.albedo || st.rgba;
          const ix = Math.min(st.width - 1, Math.max(0, Math.floor(su * st.width)));
          const iy = Math.min(stH - 1, Math.max(0, Math.floor(sv * stH)));
          const si = (iy * st.width + ix) * 4;
          const sa = (stAlb[si + 3] / 255) * (brush.flow ?? 1);
          if (sa > strokeAccum.alpha[pid]) {
            strokeAccum.hasPerPixelPbr = true;
            strokeAccum.alpha[pid] = sa;
            strokeAccum.color[pid * 3] = stAlb[si];
            strokeAccum.color[pid * 3 + 1] = stAlb[si + 1];
            strokeAccum.color[pid * 3 + 2] = stAlb[si + 2];
            strokeAccum.rough[pid] = st.roughness ? st.roughness[si] : dRough;
            strokeAccum.metal[pid] = st.metalness ? st.metalness[si] : dMetal;
            strokeAccum.height[pid] = st.height ? st.height[si] : dHeight;
          }
        }
      } else {
        const next = clamp(strokeAccum.alpha[pid] + alpha * (1 - strokeAccum.alpha[pid] * 0.72));
        if (next > strokeAccum.alpha[pid]) {
          const prevA = strokeAccum.alpha[pid];
          const dw = next > 1e-4 ? clamp(alpha / next, 0, 1) : 1;
          strokeAccum.hasPerPixelPbr = true;
          strokeAccum.alpha[pid] = next;
          if (prevA < 0.005) {
            strokeAccum.color[pid * 3] = dr;
            strokeAccum.color[pid * 3 + 1] = dg;
            strokeAccum.color[pid * 3 + 2] = db;
          } else {
            strokeAccum.color[pid * 3] = Math.round(strokeAccum.color[pid * 3] * (1 - dw) + dr * dw);
            strokeAccum.color[pid * 3 + 1] = Math.round(strokeAccum.color[pid * 3 + 1] * (1 - dw) + dg * dw);
            strokeAccum.color[pid * 3 + 2] = Math.round(strokeAccum.color[pid * 3 + 2] * (1 - dw) + db * dw);
          }
          strokeAccum.rough[pid] = dRough;
          strokeAccum.metal[pid] = dMetal;
          strokeAccum.height[pid] = dHeight;
        }
      }
      strokeAccum.dirtyMinX = Math.min(strokeAccum.dirtyMinX, px);
      strokeAccum.dirtyMaxX = Math.max(strokeAccum.dirtyMaxX, px);
      strokeAccum.dirtyMinY = Math.min(strokeAccum.dirtyMinY, py);
      strokeAccum.dirtyMaxY = Math.max(strokeAccum.dirtyMaxY, py);
    }
  }
}

export function createStrokeAccumulator(res) {
  const n = res * res;
  return {
    res,
    hasPerPixelPbr: false,
    alpha: new Float32Array(n),
    color: new Uint8ClampedArray(n * 3),
    rough: new Uint8ClampedArray(n),
    metal: new Uint8ClampedArray(n),
    height: new Uint8ClampedArray(n),
    dirtyMinX: res,
    dirtyMaxX: -1,
    dirtyMinY: res,
    dirtyMaxY: -1,
  };
}

/**
 * Commit accumulated stroke buffer into a layer's pixel buffers or mask buffer.
 */
export function commitStrokeAccumulator(layer, strokeAccum, brush, editingMask = false) {
  if (strokeAccum.dirtyMaxX < strokeAccum.dirtyMinX) return false;
  const res = layer.pixels?.res || strokeAccum.res;
  const opacity = clamp(brush.opacity ?? 1, 0, 1);
  const [cr, cg, cb] = hexToRgb01(brush.color || "#e8c27a").map((v) => Math.round(v * 255));
  const roughByte = Math.round(clamp(brush.roughness ?? 0.45, 0, 1) * 255);
  const metalByte = Math.round(clamp(brush.metalness ?? 0, 0, 1) * 255);
  const heightByte = Math.round(clamp((brush.height ?? 0.25) * 0.5 + 0.5, 0, 1) * 255);

  const isErase = brush.tool === "erase";
  const useAccumPbr = strokeAccum.hasPerPixelPbr || (brush.tool === "stamp" && !!brush.stampData);

  if (editingMask && layer.mask?.pixels) {
    const maskPx = layer.mask.pixels;
    const targetVal = isErase ? 0 : 255;
    for (let y = strokeAccum.dirtyMinY; y <= strokeAccum.dirtyMaxY; y++) {
      for (let x = strokeAccum.dirtyMinX; x <= strokeAccum.dirtyMaxX; x++) {
        const pid = y * res + x;
        const sa = strokeAccum.alpha[pid] * opacity;
        if (sa <= 0.001) continue;
        maskPx[pid] = Math.round(maskPx[pid] * (1 - sa) + targetVal * sa);
      }
    }
    return true;
  }

  if (!layer.pixels) return false;
  const px = layer.pixels;
  if (!px.roughAlpha) px.roughAlpha = new Uint8ClampedArray(res * res);
  if (!px.metalAlpha) px.metalAlpha = new Uint8ClampedArray(res * res);
  if (!px.heightAlpha) px.heightAlpha = new Uint8ClampedArray(res * res);
  const ch = getToolChannels(brush);

  for (let y = strokeAccum.dirtyMinY; y <= strokeAccum.dirtyMaxY; y++) {
    for (let x = strokeAccum.dirtyMinX; x <= strokeAccum.dirtyMaxX; x++) {
      const pid = y * res + x;
      const sa = strokeAccum.alpha[pid] * opacity;
      if (sa <= 0.001) continue;
      const i4 = pid * 4;

      if (isErase) {
        if (ch.albedo) px.albedo[i4 + 3] = Math.round(px.albedo[i4 + 3] * (1 - sa));
        if (ch.roughness) px.roughAlpha[pid] = Math.round(px.roughAlpha[pid] * (1 - sa));
        if (ch.metalness) px.metalAlpha[pid] = Math.round(px.metalAlpha[pid] * (1 - sa));
        if (ch.height) px.heightAlpha[pid] = Math.round(px.heightAlpha[pid] * (1 - sa));
        continue;
      }

      const sr = useAccumPbr ? strokeAccum.color[pid * 3] : cr;
      const sg = useAccumPbr ? strokeAccum.color[pid * 3 + 1] : cg;
      const sb = useAccumPbr ? strokeAccum.color[pid * 3 + 2] : cb;
      const sRough = useAccumPbr ? strokeAccum.rough[pid] : roughByte;
      const sMetal = useAccumPbr ? strokeAccum.metal[pid] : metalByte;
      const sHeight = useAccumPbr ? strokeAccum.height[pid] : heightByte;

      if (ch.albedo) {
        const oldA = px.albedo[i4 + 3] / 255;
        const outA = sa + oldA * (1 - sa);
        if (outA > 1e-4) {
          px.albedo[i4] = Math.round((sr * sa + px.albedo[i4] * oldA * (1 - sa)) / outA);
          px.albedo[i4 + 1] = Math.round((sg * sa + px.albedo[i4 + 1] * oldA * (1 - sa)) / outA);
          px.albedo[i4 + 2] = Math.round((sb * sa + px.albedo[i4 + 2] * oldA * (1 - sa)) / outA);
        }
        px.albedo[i4 + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
      if (ch.roughness) {
        const oldR = px.roughAlpha[pid] / 255;
        const outR = sa + oldR * (1 - sa);
        if (outR > 1e-4) px.roughness[pid] = Math.round((sRough * sa + px.roughness[pid] * oldR * (1 - sa)) / outR);
        px.roughAlpha[pid] = Math.round(clamp(outR, 0, 1) * 255);
      }
      if (ch.metalness) {
        const oldM = px.metalAlpha[pid] / 255;
        const outM = sa + oldM * (1 - sa);
        if (outM > 1e-4) px.metalness[pid] = Math.round((sMetal * sa + px.metalness[pid] * oldM * (1 - sa)) / outM);
        px.metalAlpha[pid] = Math.round(clamp(outM, 0, 1) * 255);
      }
      if (ch.height) {
        const oldH = px.heightAlpha[pid] / 255;
        const outH = sa + oldH * (1 - sa);
        if (outH > 1e-4) px.height[pid] = Math.round((sHeight * sa + px.height[pid] * oldH * (1 - sa)) / outH);
        px.heightAlpha[pid] = Math.round(clamp(outH, 0, 1) * 255);
      }
    }
  }
  return true;
}

/**
 * Flood fill by scope: "all" | "part" | "island".
 */
export function applyFloodFill({ layer, cues, hitTriIndex, scope = "part", brush, editingMask = false }) {
  const res = cues.res;
  const hitPart = hitTriIndex >= 0 ? cues.partAt[hitTriIndex] : -1;
  const hitIsland = hitTriIndex >= 0 ? cues.islandAt[hitTriIndex] : -1;
  const accum = createStrokeAccumulator(res);

  for (let pid = 0; pid < res * res; pid++) {
    if (scope === "part" && hitPart >= 0 && cues.partAt[pid] !== hitPart && cues.partAt[pid] !== -1) continue;
    if (scope === "island" && hitIsland >= 0 && cues.islandAt[pid] !== hitIsland && cues.islandAt[pid] !== -1) continue;
    accum.alpha[pid] = 1.0;
    const x = pid % res, y = Math.floor(pid / res);
    accum.dirtyMinX = Math.min(accum.dirtyMinX, x);
    accum.dirtyMaxX = Math.max(accum.dirtyMaxX, x);
    accum.dirtyMinY = Math.min(accum.dirtyMinY, y);
    accum.dirtyMaxY = Math.max(accum.dirtyMaxY, y);
  }
  return commitStrokeAccumulator(layer, accum, { ...brush, tool: brush.tool === "erase" ? "erase" : "fill" }, editingMask);
}

function blendChannelByte(dst, src, blend) {
  const a = dst / 255, b = src / 255;
  let o = b;
  if (blend === "Multiply") o = a * b;
  else if (blend === "Screen") o = 1 - (1 - a) * (1 - b);
  else if (blend === "Overlay") o = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
  else if (blend === "Add") o = Math.min(1, a + b);
  else if (blend === "Darken") o = Math.min(a, b);
  return Math.round(clamp(o, 0, 1) * 255);
}

/**
 * Composite entire Texture Paint Layer Stack (+ optional live stroke preview!) into final Albedo/Roughness/Metalness/Height/Normal buffers.
 */
export function compositePaintDocument(doc, cues, { liveStroke = null, liveBrush = null, viewChannel = "lit" } = {}) {
  const res = doc.resolution || cues.res;
  const n = res * res;
  const outA = new Uint8ClampedArray(n * 4);
  const outR = new Uint8ClampedArray(n).fill(140);
  const outM = new Uint8ClampedArray(n).fill(0);
  const outH = new Uint8ClampedArray(n).fill(128);

  // Initialize opaque neutral slate base
  for (let i = 0; i < n; i++) {
    outA[i * 4] = 48;
    outA[i * 4 + 1] = 52;
    outA[i * 4 + 2] = 58;
    outA[i * 4 + 3] = 255;
  }

  const folderMap = new Map(doc.layers.filter((l) => l.kind === "folder").map((f) => [f.id, f]));
  const isVisible = (l) => {
    if (!l.visible) return false;
    if (l.parentId && folderMap.has(l.parentId)) return isVisible(folderMap.get(l.parentId));
    return true;
  };
  const effectiveOpacity = (l) => {
    let op = l.opacity ?? 1;
    if (l.parentId && folderMap.has(l.parentId)) op *= effectiveOpacity(folderMap.get(l.parentId));
    return op;
  };

  const bakedRes = doc.bakedMaps?.res || res;
  const bakedAo = doc.bakedMaps?.ao;
  const bakedCurv = doc.bakedMaps?.curvature;
  const bakedNorm = doc.bakedMaps?.worldNormal;
  const bakedAoIsFloat = bakedAo instanceof Float32Array || bakedAo instanceof Float64Array;
  const bakedCurvIsFloat = bakedCurv instanceof Float32Array || bakedCurv instanceof Float64Array;
  const sampleBakedScalar = (arr, isFloat, pixelIndex) => {
    let bi = pixelIndex;
    if (bakedRes !== res) {
      const px = pixelIndex % res;
      const py = (pixelIndex - px) / res;
      const bx = Math.min(bakedRes - 1, Math.floor((px / res) * bakedRes));
      const by = Math.min(bakedRes - 1, Math.floor((py / res) * bakedRes));
      bi = by * bakedRes + bx;
    }
    const v = arr[bi] ?? 0;
    return isFloat ? v : v / 255;
  };

  for (const layer of doc.layers) {
    if (layer.kind === "folder" || !isVisible(layer)) continue;
    const op = effectiveOpacity(layer);
    if (op <= 0.001) continue;
    const ch = layer.channels || { albedo: true, roughness: true, metalness: true, height: true };
    const maskPixels = layer.mask?.enabled ? layer.mask.pixels : null;
    const maskInvert = !!layer.mask?.invert;
    const partFilter = layer.partFilter ?? -1;

    if (layer.kind === "paint" && layer.pixels) {
      const px = layer.pixels;
      const isLive = liveStroke && liveBrush && doc.selectedLayerId === layer.id && !doc.editingMask;
      const bch = isLive ? getToolChannels(liveBrush) : { albedo: true, roughness: true, metalness: true, height: true };
      const [lr, lg, lb] = isLive ? hexToRgb01(liveBrush.color).map((v) => Math.round(v * 255)) : [0, 0, 0];
      const lRough = isLive ? Math.round((liveBrush.roughness ?? 0.45) * 255) : 0;
      const lMetal = isLive ? Math.round((liveBrush.metalness ?? 0) * 255) : 0;
      const lHeight = isLive ? Math.round(((liveBrush.height ?? 0.25) * 0.5 + 0.5) * 255) : 128;

      for (let i = 0; i < n; i++) {
        if (partFilter >= 0 && cues.partAt[i] >= 0 && cues.partAt[i] !== partFilter) continue;
        const i4 = i * 4;
        let aAlb = px.albedo[i4 + 3] / 255;
        let aRough = px.roughAlpha ? (px.roughAlpha[i] / 255) : aAlb;
        let aMetal = px.metalAlpha ? (px.metalAlpha[i] / 255) : aAlb;
        let aHeight = px.heightAlpha ? (px.heightAlpha[i] / 255) : aAlb;
        let sr = px.albedo[i4], sg = px.albedo[i4 + 1], sb = px.albedo[i4 + 2];
        let sRough = px.roughness[i], sMetal = px.metalness[i], sHeight = px.height[i];

        if (isLive && liveStroke.alpha[i] > 0.001) {
          const sa = liveStroke.alpha[i] * (liveBrush.opacity ?? 1);
          if (liveBrush.tool === "erase") {
            if (bch.albedo) aAlb *= (1 - sa);
            if (bch.roughness) aRough *= (1 - sa);
            if (bch.metalness) aMetal *= (1 - sa);
            if (bch.height) aHeight *= (1 - sa);
          } else {
            const useLiveBuf = liveStroke.hasPerPixelPbr || (liveBrush.tool === "stamp" && !!liveBrush.stampData);
            const brR = useLiveBuf ? liveStroke.color[i * 3] : lr;
            const brG = useLiveBuf ? liveStroke.color[i * 3 + 1] : lg;
            const brB = useLiveBuf ? liveStroke.color[i * 3 + 2] : lb;
            const brRough = useLiveBuf ? liveStroke.rough[i] : lRough;
            const brMetal = useLiveBuf ? liveStroke.metal[i] : lMetal;
            const brHeight = useLiveBuf ? liveStroke.height[i] : lHeight;

            if (bch.albedo) {
              const outA2 = sa + aAlb * (1 - sa);
              if (outA2 > 1e-4) {
                sr = Math.round((brR * sa + sr * aAlb * (1 - sa)) / outA2);
                sg = Math.round((brG * sa + sg * aAlb * (1 - sa)) / outA2);
                sb = Math.round((brB * sa + sb * aAlb * (1 - sa)) / outA2);
              }
              aAlb = outA2;
            }
            if (bch.roughness) {
              const outR2 = sa + aRough * (1 - sa);
              if (outR2 > 1e-4) sRough = Math.round((brRough * sa + sRough * aRough * (1 - sa)) / outR2);
              aRough = outR2;
            }
            if (bch.metalness) {
              const outM2 = sa + aMetal * (1 - sa);
              if (outM2 > 1e-4) sMetal = Math.round((brMetal * sa + sMetal * aMetal * (1 - sa)) / outM2);
              aMetal = outM2;
            }
            if (bch.height) {
              const outH2 = sa + aHeight * (1 - sa);
              if (outH2 > 1e-4) sHeight = Math.round((brHeight * sa + sHeight * aHeight * (1 - sa)) / outH2);
              aHeight = outH2;
            }
          }
        }

        if (aAlb <= 0.001 && aRough <= 0.001 && aMetal <= 0.001 && aHeight <= 0.001) continue;
        let maskMul = 1;
        if (maskPixels) {
          let m = maskPixels[i] / 255;
          if (maskInvert) m = 1 - m;
          maskMul = m;
        }
        const effAlb = clamp(aAlb * op * maskMul, 0, 1);
        const effRough = clamp(aRough * op * maskMul, 0, 1);
        const effMetal = clamp(aMetal * op * maskMul, 0, 1);
        const effHeight = clamp(aHeight * op * maskMul, 0, 1);

        if (ch.albedo && effAlb > 0.001) {
          const br = blendChannelByte(outA[i4], sr, layer.blend);
          const bg = blendChannelByte(outA[i4 + 1], sg, layer.blend);
          const bb = blendChannelByte(outA[i4 + 2], sb, layer.blend);
          outA[i4] = Math.round(outA[i4] * (1 - effAlb) + br * effAlb);
          outA[i4 + 1] = Math.round(outA[i4 + 1] * (1 - effAlb) + bg * effAlb);
          outA[i4 + 2] = Math.round(outA[i4 + 2] * (1 - effAlb) + bb * effAlb);
        }
        if (ch.roughness && effRough > 0.001) outR[i] = Math.round(outR[i] * (1 - effRough) + sRough * effRough);
        if (ch.metalness && effMetal > 0.001) outM[i] = Math.round(outM[i] * (1 - effMetal) + sMetal * effMetal);
        if (ch.height && effHeight > 0.001) outH[i] = Math.round(outH[i] * (1 - effHeight) + sHeight * effHeight);
      }
    } else if (layer.kind === "fill") {
      const f = layer.fill;
      const [fr, fg, fb] = hexToRgb01(f.color).map((v) => Math.round(v * 255));
      const fRough = Math.round(clamp(f.roughness ?? 0.5, 0, 1) * 255);
      const fMetal = Math.round(clamp(f.metalness ?? 0, 0, 1) * 255);
      const fHeight = Math.round(clamp((f.height ?? 0) * 0.5 + 0.5, 0, 1) * 255);
      const pat = f.patternData;
      const rep = Math.max(1, Number(f.patternRepeats || 2));

      for (let i = 0; i < n; i++) {
        if (partFilter >= 0 && cues.partAt[i] >= 0 && cues.partAt[i] !== partFilter) continue;
        let eff = op;
        if (maskPixels) {
          let m = maskPixels[i] / 255;
          if (maskInvert) m = 1 - m;
          eff *= m;
        }
        if (eff <= 0.001) continue;

        let sr = fr, sg = fg, sb = fb, sR = fRough, sM = fMetal, sH = fHeight;
        if (pat) {
          const x = i % res, y = Math.floor(i / res);
          const su = ((x / res) * rep) % 1;
          const sv = ((y / res) * rep) % 1;
          const patH = pat.heightPx || pat.width;
          const ix = Math.floor(su * pat.width);
          const iy = Math.floor(sv * patH);
          const si = (iy * pat.width + ix) * 4;
          const pa = pat.albedo[si + 3] / 255;
          sr = Math.round(fr * (1 - pa) + pat.albedo[si] * pa);
          sg = Math.round(fg * (1 - pa) + pat.albedo[si + 1] * pa);
          sb = Math.round(fb * (1 - pa) + pat.albedo[si + 2] * pa);
          sR = pat.roughness[si];
          sM = pat.metalness[si];
          sH = pat.height[si];
        }
        const i4 = i * 4;
        if (ch.albedo) {
          outA[i4] = Math.round(outA[i4] * (1 - eff) + blendChannelByte(outA[i4], sr, layer.blend) * eff);
          outA[i4 + 1] = Math.round(outA[i4 + 1] * (1 - eff) + blendChannelByte(outA[i4 + 1], sg, layer.blend) * eff);
          outA[i4 + 2] = Math.round(outA[i4 + 2] * (1 - eff) + blendChannelByte(outA[i4 + 2], sb, layer.blend) * eff);
        }
        if (ch.roughness) outR[i] = Math.round(outR[i] * (1 - eff) + sR * eff);
        if (ch.metalness) outM[i] = Math.round(outM[i] * (1 - eff) + sM * eff);
        if (ch.height) outH[i] = Math.round(outH[i] * (1 - eff) + sH * eff);
      }
    } else if (layer.kind === "material") {
      const m = layer.material;
      const [mr, mg, mb] = hexToRgb01(m.color).map((v) => v * 255);
      const mRough = clamp(m.roughness ?? 0.4, 0, 1) * 255;
      const mMetal = clamp(m.metalness ?? 0, 0, 1) * 255;
      const mHeight = clamp((m.height ?? 0) * 0.5 + 0.5, 0, 1) * 255;
      const gScale = m.grainScale || 10;
      const gStr = m.grainStrength || 0.08;

      for (let i = 0; i < n; i++) {
        if (partFilter >= 0 && cues.partAt[i] >= 0 && cues.partAt[i] !== partFilter) continue;
        let eff = op;
        if (maskPixels) {
          let mv = maskPixels[i] / 255;
          if (maskInvert) mv = 1 - mv;
          eff *= mv;
        }
        if (eff <= 0.001) continue;

        const wx = cues.worldPos[i * 3] * gScale;
        const wy = cues.worldPos[i * 3 + 1] * gScale;
        const wz = cues.worldPos[i * 3 + 2] * gScale;
        const micro = cues.covered[i] ? (fbm3D(wx, wy, wz, 2, 71) - 0.5) * 2 * gStr : 0;

        const i4 = i * 4;
        if (ch.albedo) {
          const sr = clamp(mr * (1 + micro), 0, 255);
          const sg = clamp(mg * (1 + micro), 0, 255);
          const sb = clamp(mb * (1 + micro), 0, 255);
          outA[i4] = Math.round(outA[i4] * (1 - eff) + blendChannelByte(outA[i4], sr, layer.blend) * eff);
          outA[i4 + 1] = Math.round(outA[i4 + 1] * (1 - eff) + blendChannelByte(outA[i4 + 1], sg, layer.blend) * eff);
          outA[i4 + 2] = Math.round(outA[i4 + 2] * (1 - eff) + blendChannelByte(outA[i4 + 2], sb, layer.blend) * eff);
        }
        if (ch.roughness) outR[i] = Math.round(outR[i] * (1 - eff) + clamp(mRough + micro * 90, 0, 255) * eff);
        if (ch.metalness) outM[i] = Math.round(outM[i] * (1 - eff) + mMetal * eff);
        if (ch.height) outH[i] = Math.round(outH[i] * (1 - eff) + clamp(mHeight + micro * 70, 0, 255) * eff);
      }
    } else if (layer.kind === "generator") {
      const g = layer.generator;
      const [gr, gg, gb] = hexToRgb01(g.color).map((v) => v * 255);
      const gRough = clamp(g.roughness ?? 0.5, 0, 1) * 255;
      const gMetal = clamp(g.metalness ?? 0, 0, 1) * 255;
      const gHeight = clamp((g.height ?? 0) * 0.5 + 0.5, 0, 1) * 255;
      const thr = g.threshold ?? 0.42;
      const soft = Math.max(0.02, g.softness ?? 0.24);
      const nScale = g.noiseScale ?? 6;
      const nMix = g.noiseMix ?? 0.35;

      for (let i = 0; i < n; i++) {
        if (!cues.covered[i]) continue;
        if (partFilter >= 0 && cues.partAt[i] >= 0 && cues.partAt[i] !== partFilter) continue;

        let metric = 0;
        if (g.preset === "edge-wear") {
          const curv = bakedCurv ? sampleBakedScalar(bakedCurv, bakedCurvIsFloat, i) : cues.curvature[i];
          metric = clamp((curv - 0.5) * 2.2, 0, 1);
        } else if (g.preset === "crevice-dirt") {
          const occ = bakedAo ? sampleBakedScalar(bakedAo, bakedAoIsFloat, i) : cues.ao[i];
          metric = clamp(1 - occ, 0, 1);
        } else if (g.preset === "top-dust") {
          let ny = cues.worldNormal[i * 3 + 1];
          if (bakedNorm) {
            let bi = i;
            if (bakedRes !== res) {
              const px = i % res;
              const py = (i - px) / res;
              bi = Math.min(bakedRes - 1, Math.floor((py / res) * bakedRes)) * bakedRes + Math.min(bakedRes - 1, Math.floor((px / res) * bakedRes));
            }
            ny = bakedNorm[bi * 3 + 1];
          }
          metric = clamp(ny, 0, 1);
        } else {
          metric = 0.5;
        }

        const nVal = fbm3D(
          cues.worldPos[i * 3] * nScale,
          cues.worldPos[i * 3 + 1] * nScale,
          cues.worldPos[i * 3 + 2] * nScale,
          3,
          131,
        );
        const combined = metric * (1 - nMix) + nVal * nMix;
        let genAlpha = clamp((combined - (thr - soft * 0.5)) / soft, 0, 1) * op;
        if (maskPixels) {
          let mv = maskPixels[i] / 255;
          if (maskInvert) mv = 1 - mv;
          genAlpha *= mv;
        }
        if (genAlpha <= 0.001) continue;

        const i4 = i * 4;
        if (ch.albedo) {
          outA[i4] = Math.round(outA[i4] * (1 - genAlpha) + blendChannelByte(outA[i4], gr, layer.blend) * genAlpha);
          outA[i4 + 1] = Math.round(outA[i4 + 1] * (1 - genAlpha) + blendChannelByte(outA[i4 + 1], gg, layer.blend) * genAlpha);
          outA[i4 + 2] = Math.round(outA[i4 + 2] * (1 - genAlpha) + blendChannelByte(outA[i4 + 2], gb, layer.blend) * genAlpha);
        }
        if (ch.roughness) outR[i] = Math.round(outR[i] * (1 - genAlpha) + gRough * genAlpha);
        if (ch.metalness) outM[i] = Math.round(outM[i] * (1 - genAlpha) + gMetal * genAlpha);
        if (ch.height) outH[i] = Math.round(outH[i] * (1 - genAlpha) + gHeight * genAlpha);
      }
    } else if (layer.kind === "decal" && layer.decal?.stampMaps) {
      const dec = layer.decal;
      const st = dec.stampMaps;
      const [ax, ay, az] = dec.anchorPos;
      const [nx, ny, nz] = dec.anchorNormal;
      const rMax = Math.max(0.05, dec.radius || 0.45);
      const upRef = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let tx = upRef[1] * nz - upRef[2] * ny;
      let ty = upRef[2] * nx - upRef[0] * nz;
      let tz = upRef[0] * ny - upRef[1] * nx;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const rot = ((dec.rotation || 0) * Math.PI) / 180;
      const cr = Math.cos(rot), srRot = Math.sin(rot);

      for (let i = 0; i < n; i++) {
        if (!cues.covered[i]) continue;
        if (partFilter >= 0 && cues.partAt[i] >= 0 && cues.partAt[i] !== partFilter) continue;
        // Normal similarity check prevents projecting onto reverse side
        const ndot = cues.worldNormal[i * 3] * nx + cues.worldNormal[i * 3 + 1] * ny + cues.worldNormal[i * 3 + 2] * nz;
        if (ndot < 0.15) continue;

        const vx = cues.worldPos[i * 3] - ax;
        const vy = cues.worldPos[i * 3 + 1] - ay;
        const vz = cues.worldPos[i * 3 + 2] - az;
        const uRaw = (vx * tx + vy * ty + vz * tz) / rMax;
        const vRaw = (vx * bx + vy * by + vz * bz) / rMax;
        const uRot = uRaw * cr - vRaw * srRot;
        const vRot = uRaw * srRot + vRaw * cr;
        const su = uRot * 0.5 + 0.5;
        const sv = 1 - (vRot * 0.5 + 0.5);
        if (su < 0 || su > 1 || sv < 0 || sv > 1) continue;

        const stH = st.heightPx || st.width;
        const ix = Math.min(st.width - 1, Math.max(0, Math.floor(su * st.width)));
        const iy = Math.min(stH - 1, Math.max(0, Math.floor(sv * stH)));
        const si = (iy * st.width + ix) * 4;
        let eff = (st.albedo[si + 3] / 255) * op * clamp((ndot - 0.15) * 3, 0, 1);
        if (maskPixels) {
          let mv = maskPixels[i] / 255;
          if (maskInvert) mv = 1 - mv;
          eff *= mv;
        }
        if (eff <= 0.001) continue;

        const i4 = i * 4;
        if (ch.albedo) {
          outA[i4] = Math.round(outA[i4] * (1 - eff) + blendChannelByte(outA[i4], st.albedo[si], layer.blend) * eff);
          outA[i4 + 1] = Math.round(outA[i4 + 1] * (1 - eff) + blendChannelByte(outA[i4 + 1], st.albedo[si + 1], layer.blend) * eff);
          outA[i4 + 2] = Math.round(outA[i4 + 2] * (1 - eff) + blendChannelByte(outA[i4 + 2], st.albedo[si + 2], layer.blend) * eff);
        }
        if (ch.roughness) outR[i] = Math.round(outR[i] * (1 - eff) + st.roughness[si] * eff);
        if (ch.metalness) outM[i] = Math.round(outM[i] * (1 - eff) + st.metalness[si] * eff);
        if (ch.height) outH[i] = Math.round(outH[i] * (1 - eff) + st.height[si] * eff);
      }
    }
  }

  // Optional active mask overlay / channel solo diagnostic visualization
  if (viewChannel === "mask") {
    const sel = doc.layers.find((l) => l.id === doc.selectedLayerId);
    const mp = sel?.mask?.pixels;
    for (let i = 0; i < n; i++) {
      const m = mp ? mp[i] : 255;
      outA[i * 4] = m; outA[i * 4 + 1] = m; outA[i * 4 + 2] = m;
    }
  } else if (viewChannel === "baseColor") {
    // Albedo unchanged
  } else if (viewChannel === "roughness") {
    for (let i = 0; i < n; i++) {
      outA[i * 4] = outR[i]; outA[i * 4 + 1] = outR[i]; outA[i * 4 + 2] = outR[i];
    }
  } else if (viewChannel === "metalness") {
    for (let i = 0; i < n; i++) {
      outA[i * 4] = outM[i]; outA[i * 4 + 1] = outM[i]; outA[i * 4 + 2] = outM[i];
    }
  } else if (viewChannel === "height") {
    for (let i = 0; i < n; i++) {
      outA[i * 4] = outH[i]; outA[i * 4 + 1] = outH[i]; outA[i * 4 + 2] = outH[i];
    }
  }

  // Derive tangent-space Normal map from composited height buffer
  const outN = new Uint8ClampedArray(n * 4);
  const sampleH = (x, y) => outH[clamp(y, 0, res - 1) * res + clamp(x, 0, res - 1)] / 255;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const dx = sampleH(x + 1, y) - sampleH(x - 1, y);
      const dy = sampleH(x, y + 1) - sampleH(x, y - 1);
      let nx = -dx * 2.8;
      let ny = -dy * 2.8;
      let nz = 1.0;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i4 = (y * res + x) * 4;
      outN[i4] = Math.round((nx * 0.5 + 0.5) * 255);
      outN[i4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outN[i4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outN[i4 + 3] = 255;
    }
  }

  return { res, albedo: outA, roughness: outR, metalness: outM, height: outH, normal: outN };
}

export function sampleCompositedAtUV(comp, u, v) {
  const res = comp.res;
  const x = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
  const y = Math.min(res - 1, Math.max(0, Math.floor((1 - v) * res)));
  const pid = y * res + x;
  const i4 = pid * 4;
  return {
    color: rgb01ToHex(comp.albedo[i4] / 255, comp.albedo[i4 + 1] / 255, comp.albedo[i4 + 2] / 255),
    roughness: comp.roughness[pid] / 255,
    metalness: comp.metalness[pid] / 255,
    height: (comp.height[pid] / 255 - 0.5) * 2,
  };
}
