// Landscape SDF field model.
//
// Pipeline: 2D mask layer (strokes + region rect) -> flat base slab rising
// from sea level (Y=0) -> per-layer landform stack displacing height, all
// multiplied by a SMOOTH region-edge falloff so terrain is flat at sea level
// around the boundary (no sharp "heels") -> closed 3D SDF solid per layer,
// combined across layers by min (union).

import { fbm2, ridged2, vnoise2 } from './noise.js';
import { rectSDF, layerMaskSDF } from './mask2d.js';

export const SEA_LEVEL = 0;
export const UNDER_DEPTH = 60; // solid extends this far below sea level

// Lateral bound of a layer: its storage region rect plus any box-selected
// sub-regions, combined as a union (min of SDFs).
export function layerBoundSDF(layer, x, z) {
  let d = rectSDF(layer.region, x, z);
  if (layer.regions) for (const r of layer.regions) d = Math.min(d, rectSDF(r, x, z));
  return d;
}

// Smooth region falloff: 1 deep inside, 0 outside, interpolated across `edge`.
export function regionFalloff(rect, x, z, edge) {
  const d = rectSDF(rect, x, z);
  return 1 - smoothstep(-edge, edge, d);
}

export function layerFalloff(layer, x, z) {
  return 1 - smoothstep(-layer.edgeWidth, layer.edgeWidth, layerBoundSDF(layer, x, z));
}

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// CPU landform displacement (meters) for one landform at world xz.
export function landformDisplacement(lf, x, z) {
  const p = lf.params;
  switch (lf.type) {
    case 'fractal':
      return p.amplitude * (fbm2(x * p.scale, z * p.scale, p.octaves) - 0.5) * 2;
    case 'multifractal': {
      const n = fbm2(x * p.scale, z * p.scale, p.octaves);
      return p.amplitude * (Math.pow(n, p.gain) - 0.5) * 2;
    }
    case 'ridged':
      return p.amplitude * (ridged2(x * p.scale, z * p.scale, p.octaves) - 0.5) * 2 * p.sharpness;
    case 'badlands': {
      const f = fbm2(x * p.scale, z * p.scale, p.octaves);
      const r = ridged2(x * p.scale * 1.7, z * p.scale * 1.7, p.octaves);
      return p.amplitude * (f * (1 - p.talus) + r * p.talus - 0.5) * 2;
    }
    case 'craters': {
      let d = 0;
      for (let i = 0; i < p.count; i++) {
        const hx = Math.sin(i * 127.1 + p.seed * 311.7) * 43758.5453;
        const hz = Math.sin(i * 269.5 + p.seed * 183.3) * 28001.8384;
        const cx = (hx - Math.floor(hx) - 0.5) * 2000;
        const cz = (hz - Math.floor(hz) - 0.5) * 2000;
        const dist = Math.hypot(x - cx, z - cz);
        const r = p.radius * (0.4 + 0.6 * (Math.sin(i * 91.7 + p.seed) * 0.5 + 0.5));
        if (dist < r) {
          const t = dist / r;
          const bowl = -p.depth * (1 - t * t);
          const rim = p.rim * Math.exp(-Math.pow((t - 0.85) * 6, 2));
          d += bowl + rim;
        }
      }
      return d;
    }
    case 'ridges': {
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      return p.amplitude * (ridged2((x * c - z * s) * p.scale, (x * s + z * c) * p.scale, p.octaves) - 0.5) * 2;
    }
    case 'dunes': {
      const c = Math.cos(p.windAngle), s = Math.sin(p.windAngle);
      const along = x * c + z * s;
      const across = -x * s + z * c;
      const n = vnoise2(across * 0.01, 3.7) - 0.5;
      const wave = Math.sin((along + n * 40) / p.wavelength * Math.PI * 2);
      const shaped = Math.pow(Math.max(0, wave), p.sharpness);
      return p.amplitude * shaped;
    }
    default:
      return 0;
  }
}

// Terrain surface height (m above sea level) for one layer at world xz.
// Base slab is FLAT (baseHeight) and relief rides on top, both scaled by the
// smooth region falloff -> flat at sea level at the boundary.
export function layerHeight(layer, x, z) {
  const m = layerFalloff(layer, x, z);
  if (m <= 0) return 0;
  const mask = layerMaskSDF(layer.strokes, x, z) <= 0 ? 1 : 0;
  if (mask <= 0 && layer.requireStrokes) return 0;
  let relief = 0;
  for (const lf of layer.landforms) {
    if (!lf.visible) continue;
    relief += landformDisplacement(lf, x, z) * lf.params.influence;
  }
  return (layer.baseHeight + relief) * m;
}

// Closed 3D SDF for one layer: solid below the surface, down to -UNDER_DEPTH.
export function layerSDF(layer, x, y, z) {
  const h = layerHeight(layer, x, z);
  const ground = y - h; // negative below surface
  const under = -UNDER_DEPTH - y; // negative above bottom cap
  const bound = rectSDF(layer.region, x, z); // 2D region bound (x,z)
  // combine: inside region laterally, between bottom and surface vertically
  return Math.max(Math.max(ground, under), bound - 0); // bound>=0 outside region
}

// Whole document SDF = union (min) of visible layers.
export function worldSDF(doc, x, y, z) {
  let d = Infinity;
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    d = Math.min(d, layerSDF(layer, x, y, z));
  }
  return d;
}

// ---------------------------------------------------------------------------
// GLSL generation — emits a fragment-shader SDF that mirrors the JS math so
// the GPU raymarcher renders the exact same field.
// ---------------------------------------------------------------------------

export const MAX_LAYERS = 8;
export const MAX_OPS = 24; // flattened landforms across all layers

export function buildFieldGLSL() {
  return /* glsl */`
${'' /* noise injected separately */}
float rectSDF2(vec4 rect, vec2 xz) {
  vec2 q = max(rect.xy - xz, xz - (rect.xy + rect.zw));
  float outside = length(max(q, 0.0));
  if (outside > 0.0) return outside;
  vec2 in2 = min(xz - rect.xy, rect.xy + rect.zw - xz);
  return -min(in2.x, in2.y);
}
float regionFalloff(vec4 rect, vec2 xz, float edge) {
  return 1.0 - smoothstep(-edge, edge, rectSDF2(rect, xz));
}
float lfDisp(int type, vec4 pa, vec4 pb, vec2 xz) {
  if (type == 0) return pa.x * (fbm(xz * pa.y, int(pa.z)) - 0.5) * 2.0;                       // fractal
  if (type == 1) { float n = fbm(xz * pa.y, int(pa.z)); return pa.x * (pow(n, pa.w) - 0.5) * 2.0; } // multifractal
  if (type == 2) return pa.x * (ridged(xz * pa.y, int(pa.z)) - 0.5) * 2.0 * pa.w;             // ridged
  if (type == 3) {                                                                             // badlands
    float f = fbm(xz * pa.y, int(pa.z));
    float r = ridged(xz * pa.y * 1.7, int(pa.z));
    return pa.x * (f * (1.0 - pb.x) + r * pb.x - 0.5) * 2.0;
  }
  if (type == 4) {                                                                             // craters
    float d = 0.0;
    int count = int(pa.x);
    for (int i = 0; i < 128; i++) {
      if (i >= count) break;
      float s1 = sin(float(i) * 127.1 + pa.w * 311.7) * 43758.5453;
      float s2 = sin(float(i) * 269.5 + pa.w * 183.3) * 28001.8384;
      float s3 = sin(float(i) * 91.7 + pa.w) * 12578.13;
      vec2 c = vec2(fract(s1) - 0.5, fract(s2) - 0.5) * 2000.0;
      float r = pa.y * (0.4 + 0.6 * (fract(s3) ));
      float dist = length(xz - c);
      if (dist < r) {
        float t = dist / r;
        d += -pa.z * (1.0 - t * t) + pb.y * exp(-pow((t - 0.85) * 6.0, 2.0));
      }
    }
    return d;
  }
  if (type == 5) {                                                                             // ridges
    float c = cos(pa.w), s = sin(pa.w);
    return pa.x * (ridged(vec2(xz.x * c - xz.y * s, xz.x * s + xz.y * c) * pa.y, int(pa.z)) - 0.5) * 2.0;
  }
  // dunes (type 6)
  {
    float c = cos(pb.z), s = sin(pb.z);
    float along = xz.x * c + xz.y * s;
    float across = -xz.x * s + xz.y * c;
    float n = vnoise(vec2(across * 0.01, pa.w * 0.01)) - 0.5;
    float wave = sin((along + n * 40.0) / pa.y * 6.28318);
    return pa.x * pow(max(0.0, wave), pb.x);
  }
}

uniform vec4 uRegion[${MAX_LAYERS}];
uniform float uBase[${MAX_LAYERS}];
uniform float uEdge[${MAX_LAYERS}];
uniform float uVisible[${MAX_LAYERS}];
uniform int uOpLayer[${MAX_OPS}];
uniform int uOpType[${MAX_OPS}];
uniform vec4 uOpA[${MAX_OPS}];
uniform vec4 uOpB[${MAX_OPS}];
uniform float uOpVis[${MAX_OPS}];
uniform float uOpInfl[${MAX_OPS}];

float layerHeight(int L, vec2 xz) {
  float m = regionFalloff(uRegion[L], xz, uEdge[L]);
  if (m <= 0.0) return 0.0;
  float relief = 0.0;
  for (int i = 0; i < ${MAX_OPS}; i++) {
    if (uOpLayer[i] != L || uOpVis[i] < 0.5) continue;
    relief += lfDisp(uOpType[i], uOpA[i], uOpB[i], xz) * uOpInfl[i];
  }
  return (uBase[L] + relief) * m;
}

float map(vec3 p) {
  float d = 1e9;
  for (int L = 0; L < ${MAX_LAYERS}; L++) {
    if (uVisible[L] < 0.5) continue;
    float h = layerHeight(L, p.xz);
    float ground = p.y - h;
    float under = -${UNDER_DEPTH.toFixed(1)} - p.y;
    vec2 q = max(uRegion[L].xy - p.xz, p.xz - (uRegion[L].xy + uRegion[L].zw));
    float bound = length(max(q, 0.0));
    d = min(d, max(max(ground, under), bound));
  }
  return d;
}
`;
}
