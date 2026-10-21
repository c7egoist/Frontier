/* Flux shaders — stateless GPU particles. Position is a pure function of
   (seed, age, time), so the timeline scrubs exactly like AE. Particles are
   TRUE 3D solids: unit shards/cubes instanced per particle, oriented along
   velocity with tumble, lit by faceted key + rim + glint shading. */
import * as THREE from 'three';

export const SHAPES = ['point', 'sphere', 'box', 'disc', 'ring', 'line'];

/** Per-layer solid geometry style. */
export const SOLIDS = ['shard', 'cube'];

export const VERT = /* glsl */`
attribute vec4 aSeed;
attribute float aIndex;
uniform float uTime, uLoop, uLife, uCount;
uniform vec3 uEmitPos, uDir;
uniform float uSpeed, uSpread, uShape;
uniform float uRadius, uLength, uWidth, uHeight, uDepth;
uniform float uGravity;
uniform vec2 uWind;
uniform float uTurbAmp, uTurbScale, uTurbSpeed, uEvo;
uniform float uBurstTime, uBurstPower;
uniform float uSize0, uSize1, uStretch, uTumble;
uniform vec3 uColA, uColB, uColC;
uniform float uColBias, uBright, uOpacity;
varying vec3 vLocal;
varying vec4 vCol;

vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 1.61803, n + 4.23607)) * 43758.5453);
}

vec3 shapeOffset(vec3 r) {
  if (uShape < 0.5) return vec3(0.0);                                    // point
  if (uShape < 1.5) {                                                   // sphere (volume)
    vec3 v = r - 0.5;
    float l = max(length(v), 1e-4);
    return (v / l) * (uRadius * pow(r.x * 0.999 + 0.001, 0.3333));
  }
  if (uShape < 2.5) return (r - 0.5) * vec3(uWidth, uHeight, uDepth);    // box
  if (uShape < 3.5) {                                                   // disc (XZ)
    float a = r.x * 6.28318;
    float rr = uRadius * sqrt(max(r.y, 1e-4));
    return vec3(cos(a) * rr, 0.0, sin(a) * rr);
  }
  if (uShape < 4.5) {                                                   // ring (XZ)
    float a = r.x * 6.28318;
    return vec3(cos(a) * uRadius, 0.0, sin(a) * uRadius);
  }
  return vec3((r.x - 0.5) * uLength, 0.0, 0.0);                          // line (X)
}

vec3 calcPos(float age, float emitT, vec3 dir, vec3 off, float spd, out vec3 rdir) {
  vec3 p = uEmitPos + off + dir * spd * age;
  p += vec3(0.0, uGravity, 0.0) * 0.5 * age * age;
  p += vec3(uWind.x, 0.0, uWind.y) * age;
  // Trig flow-field turbulence, growing over life.
  float f = uTurbSpeed * 2.0;
  vec3 q = (uEmitPos + off) * uTurbScale;
  float e = uEvo * 6.28318;
  vec3 tb = vec3(
    sin(q.y + uTime * f + e) + 0.5 * sin(q.z * 1.7 + uTime * f * 1.31 + e * 0.7),
    sin(q.z + uTime * f * 0.93 + e * 1.13) + 0.5 * sin(q.x * 1.7 + uTime * f * 1.11),
    sin(q.x + uTime * f * 1.17 + e * 0.71) + 0.5 * sin(q.y * 1.7 + uTime * f * 0.97));
  p += tb * (uTurbAmp * age * 0.33);
  // Starburst: radial kick for particles alive when it fires.
  rdir = p - uEmitPos;
  float rl = length(rdir);
  rdir = rl > 1e-4 ? rdir / rl : dir;
  float ab = uBurstTime - emitT;
  if (uBurstPower > 0.0 && ab > 0.0 && ab < age) {
    float bt = age - ab;
    p += rdir * (uBurstPower * bt * exp(-bt * 1.6));
  }
  return p;
}

void main() {
  vec3 h1 = hash3(aSeed.x * 91.7 + aIndex * 0.618);
  vec3 h2 = hash3(aSeed.y * 57.3 + aIndex * 1.307);
  vec3 h3v = hash3(aSeed.z * 113.1 + 7.7);
  float emitT = (aIndex / max(uCount, 1.0)) * uLoop;
  float age = mod(uTime - emitT + uLoop, uLoop);
  float age01 = age / max(uLife, 1e-3);
  bool dead = age01 >= 1.0;

  vec3 dirBase = length(uDir) < 1e-3 ? vec3(0.0, 1.0, 0.0) : normalize(uDir);
  vec3 dir = normalize(dirBase + (h2 - 0.5) * uSpread * 2.0 + vec3(1e-5, 0.0, 0.0));
  vec3 off = shapeOffset(h1);
  float spd = uSpeed * (0.35 + 0.65 * h3v.x);

  vec3 rdir;
  vec3 p = calcPos(age, emitT, dir, off, spd, rdir);
  // Analytic-ish velocity for solid alignment.
  float e = 0.035;
  vec3 r2;
  vec3 vel = calcPos(min(age + e, uLife), emitT, dir, off, spd, r2)
           - calcPos(max(age - e, 0.0), emitT, dir, off, spd, r2);

  // Colour: 3-stop gradient over life + burst flash.
  float t = clamp(age01, 0.0, 1.0);
  vec3 col = mix(mix(uColA, uColB, smoothstep(0.0, uColBias, t)), uColC, smoothstep(uColBias, 1.0, t));
  float bright = uBright;
  float dtb = uTime - uBurstTime;
  if (uBurstPower > 0.0 && dtb > 0.0 && dtb < 6.0 && emitT <= uBurstTime) {
    bright *= 1.0 + exp(-dtb * 2.5) * uBurstPower * 0.06;
  }
  col *= bright;
  float env = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t));
  float alpha = env * uOpacity;

  // True-3D solid: unit shard/cube oriented along velocity + tumble.
  float wsize = mix(uSize0, uSize1, t);
  float speedN = clamp(length(vel) / 1.2, 0.0, 3.0);
  float len = wsize * (0.6 + uStretch * (0.4 + speedN));
  float wid = wsize * 0.6;
  vec3 fwd = normalize(vel + vec3(1e-6, 2e-6, 0.0));
  vec3 refUp = abs(fwd.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(refUp, fwd));
  vec3 up = cross(fwd, right);
  float tang = h3v.y * 6.28318 + uTime * uTumble * (h3v.z - 0.5) * 2.0;
  float ct = cos(tang), st = sin(tang);
  vec3 tr = right * ct + up * st;
  vec3 tu = up * ct - right * st;
  vec3 wp = p + (tr * position.x + tu * position.y) * wid + fwd * position.z * len;
  vec3 wn = normalize(tr * normal.x + tu * normal.y + fwd * normal.z);

  // Faceted key + rim + glint lighting (world space; meshes sit at origin).
  vec3 keyDir = normalize(vec3(0.45, 0.8, 0.35));
  float dif = max(dot(wn, keyDir), 0.0);
  vec3 V = normalize(cameraPosition - wp);
  float rim = pow(1.0 - abs(dot(wn, V)), 2.0);
  float spec = pow(max(dot(reflect(-keyDir, wn), V), 0.0), 24.0);
  vec3 lit = col * (0.25 + 0.95 * dif) + col * rim * 0.8 + vec3(1.0) * spec * (0.35 + bright * 0.2);

  if (dead) { wp = p; alpha = 0.0; }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vLocal = position;
  vCol = vec4(lit, alpha);
}
`;

export const FRAG = /* glsl */`
varying vec3 vLocal;
varying vec4 vCol;
void main() {
  float tip = smoothstep(0.15, 0.5, abs(vLocal.z));
  vec3 rgb = vCol.rgb * (1.0 + tip * 0.5);
  float a = vCol.a;
  a += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.008;
  if (a < 0.004) discard;
  gl_FragColor = vec4(rgb, a);
}
`;

export function makeUniforms() {
  return {
    uTime: {value: 0}, uLoop: {value: 8}, uLife: {value: 4}, uCount: {value: 6000},
    uEmitPos: {value: new THREE.Vector3(0, 0, 0)},
    uDir: {value: new THREE.Vector3(0, 1, 0)},
    uSpeed: {value: 3}, uSpread: {value: 0.6}, uShape: {value: 0},
    uRadius: {value: 3}, uLength: {value: 10}, uWidth: {value: 8},
    uHeight: {value: 2}, uDepth: {value: 8},
    uGravity: {value: -2}, uWind: {value: new THREE.Vector2(0, 0)},
    uTurbAmp: {value: 1.2}, uTurbScale: {value: 0.35}, uTurbSpeed: {value: 0.7},
    uEvo: {value: Math.random()},
    uBurstTime: {value: 0}, uBurstPower: {value: 0},
    uSize0: {value: 0.22}, uSize1: {value: 0.1}, uStretch: {value: 1.5},
    uTumble: {value: 1.2},
    uColA: {value: new THREE.Color('#7ee7ff')},
    uColB: {value: new THREE.Color('#b78cff')},
    uColC: {value: new THREE.Color('#f6c66a')},
    uColBias: {value: 0.5}, uBright: {value: 1.4}, uOpacity: {value: 0.9},
  };
}
