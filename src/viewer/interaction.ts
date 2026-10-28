/**
 * GPU collision for foliage: a displacement field with memory.
 *
 * The plant's bounding box is covered by a 32 × 32 × 32 grid of cells; each
 * cell stores a displacement vector that behaves like a damped spring. Every
 * frame a fragment pass (ping-pong, Verlet integration) pulls each cell toward
 * the displacement the colliders ask for — radially out of a soft shell round
 * every sphere / capsule — or back toward rest when nothing touches it. The
 * vertex shader then samples the field at the vertex and at its limb pivot, so
 * a character walking through a crop leaves a wake that springs back and
 * overshoots like the real thing, while the plant's roots stay put.
 *
 * All of it lives on the GPU: the CPU only uploads up to MAX_COLLIDERS
 * capsules per frame. In an engine the same pass runs once per plant instance
 * (or once per terrain tile as a 2-D field) and the characters write their
 * capsules from the animation system.
 *
 * The 3-D grid is packed into one 2-D texture: 32 slices (one per height
 * level) tiled 8 × 4, so the sampler can use hardware bilinear filtering
 * within a slice and the shader blends two slices by hand.
 */
import * as THREE from 'three';

export const FIELD_RES = 32;
export const FIELD_TILES_X = 8;
export const FIELD_TILES_Y = 4;
export const FIELD_TEX_W = FIELD_RES * FIELD_TILES_X;
export const FIELD_TEX_H = FIELD_RES * FIELD_TILES_Y;
export const MAX_COLLIDERS = 8;

export interface Collider {
  /** Capsule from `a` to `b` (a sphere when they coincide). */
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}

export interface FieldBounds {
  min: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * The field box round a plant: its bounding box grown by a quarter and by the
 * largest collider, never thinner than a metre, with the floor one cell below
 * the soil so buried rings sit inside it.
 */
export function fieldBounds(box: THREE.Box3, colliderRadius: number): FieldBounds {
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const pad = Math.max(0.25 * Math.max(size.x, size.y, size.z), 1.6 * colliderRadius, 0.15);
  const min = new THREE.Vector3(box.min.x - pad, Math.min(box.min.y, 0) - 0.05 * (size.y + pad), box.min.z - pad);
  const max = new THREE.Vector3(box.max.x + pad, box.max.y + pad, box.max.z + pad);
  const s = new THREE.Vector3().subVectors(max, min);
  const minSide = Math.max(1, 0.5 * Math.max(s.x, s.y, s.z));
  for (const k of ['x', 'z'] as const) {
    if (s[k] < minSide) {
      const grow = 0.5 * (minSide - s[k]);
      min[k] -= grow;
      s[k] = minSide;
    }
  }
  if (s.y < minSide) s.y = minSide;
  return { min, size: s };
}

/** Shared GLSL: shell displacement a point receives from one capsule (0 outside 1.6 radii). */
export const PUSH_GLSL = /* glsl */ `
vec3 pushFromCapsule(vec3 q, vec3 a, vec3 b, float R) {
  vec3 ab = b - a;
  float t = dot(q - a, ab) / max(dot(ab, ab), 1e-8);
  vec3 c = a + ab * clamp(t, 0.0, 1.0);
  vec3 d = q - c;
  float dist = length(d);
  float reach = 1.6 * R;
  if (dist >= reach) return vec3(0.0);
  vec3 away = dist > 1e-4 ? d / dist : vec3(0.0, 1.0, 0.0);
  away.y *= 0.35; // plants bend aside rather than lift
  float pen = (reach - dist) / reach;
  float amt = R * pen * pen * (3.0 - 2.0 * pen);
  return away * amt;
}
`;

/** Shared GLSL: trilinear sample of the packed field (needs uField, uFieldMin, uFieldSize). */
export const FIELD_SAMPLE_GLSL = /* glsl */ `
uniform sampler2D uField;
uniform vec3 uFieldMin;
uniform vec3 uFieldSize;
const float FIELD_RES = ${FIELD_RES}.0;
const float FIELD_TILES_X = ${FIELD_TILES_X}.0;
const float FIELD_TILES_Y = ${FIELD_TILES_Y}.0;

vec3 fieldSlice(float k, vec2 uv) {
  float tx = mod(k, FIELD_TILES_X);
  float ty = floor(k / FIELD_TILES_X);
  // Keep the bilinear footprint inside the tile.
  vec2 inTile = clamp(uv, vec2(0.5 / FIELD_RES), vec2(1.0 - 0.5 / FIELD_RES));
  vec2 st = (vec2(tx, ty) + inTile) / vec2(FIELD_TILES_X, FIELD_TILES_Y);
  return texture2D(uField, st).xyz;
}

vec3 fieldAt(vec3 p) {
  vec3 u = (p - uFieldMin) / uFieldSize;
  if (any(lessThan(u, vec3(0.0))) || any(greaterThan(u, vec3(1.0)))) return vec3(0.0);
  float fy = clamp(u.y * FIELD_RES - 0.5, 0.0, FIELD_RES - 1.0);
  float k0 = floor(fy);
  float k1 = min(k0 + 1.0, FIELD_RES - 1.0);
  return mix(fieldSlice(k0, u.xz), fieldSlice(k1, u.xz), fy - k0);
}
`;

const UPDATE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform vec3 uMin;
uniform vec3 uSize;
uniform vec4 uColA[${MAX_COLLIDERS}];
uniform vec4 uColB[${MAX_COLLIDERS}];
uniform int uCount;
uniform float uDt;
uniform float uStiff;
uniform float uDamp;
uniform float uReset;
uniform float uMaxDisp;
const int RES = ${FIELD_RES};
const int TILES_X = ${FIELD_TILES_X};
${PUSH_GLSL}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int i = px.x - (px.x / RES) * RES;
  int j = px.y - (px.y / RES) * RES;
  int k = (px.y / RES) * TILES_X + px.x / RES;
  vec3 cell = uMin + (vec3(float(i), float(k), float(j)) + 0.5) / float(RES) * uSize;

  vec3 target = vec3(0.0);
  float touching = 0.0;
  for (int c = 0; c < ${MAX_COLLIDERS}; c++) {
    if (c >= uCount) break;
    vec3 d = pushFromCapsule(cell, uColA[c].xyz, uColB[c].xyz, uColA[c].w);
    target += d;
    touching = max(touching, step(1e-6, dot(d, d)));
  }

  vec3 xc = texelFetch(uCur, px, 0).xyz;
  vec3 xp = texelFetch(uPrev, px, 0).xyz;
  // Damped spring: pulled firmly to the collider's displacement while touched, softly home afterwards.
  float ks = uStiff * mix(1.0, 5.0, touching);
  vec3 acc = ks * (target - xc);
  vec3 vel = (xc - xp) * (1.0 - uDamp * mix(1.0, 2.5, touching));
  vec3 xn = xc + vel + acc * uDt * uDt;
  float m = length(xn);
  if (m > uMaxDisp) xn *= uMaxDisp / m;
  xn *= 1.0 - uReset;
  gl_FragColor = vec4(xn, 1.0);
}
`;

const QUAD_VERTEX = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Ping-pong displacement field; `null` texture when float render targets are unavailable. */
export class InteractionField {
  readonly supported: boolean;
  private targets: THREE.WebGLRenderTarget[] = [];
  private cur = 0;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private bounds: FieldBounds = { min: new THREE.Vector3(-1, -0.1, -1), size: new THREE.Vector3(2, 2, 2) };
  private reset = 1;
  private accumulator = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.supported = isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uCur: { value: null },
        uMin: { value: new THREE.Vector3() },
        uSize: { value: new THREE.Vector3(1, 1, 1) },
        uColA: { value: Array.from({ length: MAX_COLLIDERS }, () => new THREE.Vector4()) },
        uColB: { value: Array.from({ length: MAX_COLLIDERS }, () => new THREE.Vector4()) },
        uCount: { value: 0 },
        uDt: { value: 1 / 60 },
        uStiff: { value: 60 },
        uDamp: { value: 0.06 },
        uReset: { value: 1 },
        uMaxDisp: { value: 1 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: UPDATE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    if (this.supported) {
      for (let i = 0; i < 3; i++) {
        this.targets.push(
          new THREE.WebGLRenderTarget(FIELD_TEX_W, FIELD_TEX_H, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false,
          }),
        );
      }
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
      quad.frustumCulled = false;
      this.scene.add(quad);
    }
  }

  /** The field texture to sample in the plant shaders (the most recently written target). */
  get texture(): THREE.Texture | null {
    return this.supported ? this.targets[this.cur].texture : null;
  }

  get min(): THREE.Vector3 {
    return this.bounds.min;
  }

  get size(): THREE.Vector3 {
    return this.bounds.size;
  }

  /** Re-cover a new plant; the field is cleared on the next step. */
  setBounds(b: FieldBounds): void {
    this.bounds = b;
    this.reset = 1;
  }

  clear(): void {
    this.reset = 1;
  }

  /**
   * Advance the springs. Fixed 120 Hz sub-steps for stability whatever the frame rate
   * (a Verlet spring with k·dt² ≪ 1), at most 8 per frame.
   */
  step(dt: number, colliders: Collider[], stiffness: number, damping: number, maxDisp: number): void {
    if (!this.supported) return;
    const u = this.material.uniforms;
    const n = Math.min(MAX_COLLIDERS, colliders.length);
    for (let i = 0; i < n; i++) {
      const c = colliders[i];
      (u.uColA.value as THREE.Vector4[])[i].set(c.a.x, c.a.y, c.a.z, c.r);
      (u.uColB.value as THREE.Vector4[])[i].set(c.b.x, c.b.y, c.b.z, 0);
    }
    u.uCount.value = n;
    (u.uMin.value as THREE.Vector3).copy(this.bounds.min);
    (u.uSize.value as THREE.Vector3).copy(this.bounds.size);
    u.uStiff.value = stiffness;
    u.uDamp.value = damping;
    u.uMaxDisp.value = maxDisp;
    const h = 1 / 120;
    u.uDt.value = h;
    this.accumulator = Math.min(this.accumulator + Math.min(dt, 0.1), 8 * h);
    const prevTarget = this.renderer.getRenderTarget();
    let steps = 0;
    while (this.accumulator >= h - 1e-9 && steps < 8) {
      const prev = this.targets[(this.cur + 2) % 3];
      const cur = this.targets[this.cur];
      const next = this.targets[(this.cur + 1) % 3];
      u.uPrev.value = prev.texture;
      u.uCur.value = cur.texture;
      u.uReset.value = this.reset;
      this.renderer.setRenderTarget(next);
      this.renderer.render(this.scene, this.camera);
      this.cur = (this.cur + 1) % 3;
      // Two cleared frames so prev and cur are both at rest.
      if (this.reset > 0 && steps >= 1) this.reset = 0;
      this.accumulator -= h;
      steps++;
    }
    this.renderer.setRenderTarget(prevTarget);
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    this.material.dispose();
  }
}
