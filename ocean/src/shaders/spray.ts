import { COMMON } from './common';

// Spray spawn: scan the near composite; where the crest metric is sharp
// (concave-down fast-moving crests = breaking), append particles to a GPU
// ring buffer via atomicAdd.
export const SPRAY_SPAWN = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var compTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> posData: array<vec4f>; // xyz world, w age
@group(0) @binding(3) var<storage, read_write> velData: array<vec4f>; // xyz vel, w size
@group(0) @binding(4) var<storage, read_write> counter: array<atomic<u32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.fineN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }
  let st = textureLoad(compTex, id, 0);
  let dxn = P.size / P.fineN;
  let hl = textureLoad(compTex, wrapId(id + vec2i(-1, 0), N), 0).x;
  let hr = textureLoad(compTex, wrapId(id + vec2i(1, 0), N), 0).x;
  let hd = textureLoad(compTex, wrapId(id + vec2i(0, -1), N), 0).x;
  let hu = textureLoad(compTex, wrapId(id + vec2i(0, 1), N), 0).x;
  let lap = hl + hr + hd + hu - 4.0 * st.x;

  let sharp = max(-lap, 0.0) / dxn * max(st.x, 0.0) * min(abs(st.y) * 0.22, 1.5);
  let r = hash21(vec2f(id) * 1.618 + vec2f(P.time * 57.31, P.seed * 13.7));
  if (r >= sharp * P.spawnRate) { return; }

  let cap = arrayLength(&posData);
  let idx = atomicAdd(&counter[0], 1u) % cap;
  let world = P.origin + (vec2f(id) + vec2f(0.5)) * dxn;
  let r2 = hash21(vec2f(id) * 2.71 + vec2f(P.time * 23.7, 5.1));
  let r3 = hash21(vec2f(id) * 4.13 + vec2f(P.time * 11.1, 9.3));
  let ang = r2 * 2.0 * PI;
  let side = (vec2f(cos(ang), sin(ang)) - P.windDir * 0.5) * (0.5 + 1.1 * r3);
  let upv = 1.0 + 2.6 * r2 * min(abs(st.y) * 0.55, 1.6);
  let fwd = P.windDir * (0.5 + 1.3 * r3);
  posData[idx] = vec4f(world.x, st.x + 0.06, world.y, 0.8 + 1.0 * r2);
  velData[idx] = vec4f(fwd.x + side.x, upv, fwd.y + side.y, 0.10 + 0.16 * r3);
}
`;

// Spray integration: ballistic + wind drag, killed when re-entering the
// surface or leaving the near window. Age lives in posData.w.
export const SPRAY_UPDATE = /* wgsl */ `
${COMMON}

struct UpdParams {
  dt: f32,
  windAmp: f32,
  origin: vec2f,
  size: f32,
  windDir: vec2f,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> U: UpdParams;
@group(0) @binding(1) var compTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> posData: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velData: array<vec4f>;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  var p = posData[i];
  if (p.w <= 0.0) { return; }
  var v = velData[i];

  v.y = v.y - 9.81 * U.dt;
  let drag = 0.9 * U.dt;
  v.x = v.x + (U.windDir.x * U.windAmp * 1.4 - v.x * 0.9) * U.dt;
  v.z = v.z + (U.windDir.y * U.windAmp * 1.4 - v.z * 0.9) * U.dt;
  v.x = v.x - v.x * drag * 0.35;
  v.z = v.z - v.z * drag * 0.35;

  p = vec4f(p.xyz + v.xyz * U.dt, p.w - U.dt * 0.75);

  let uv = (p.xz - U.origin) / U.size;
  if (uv.x < -0.03 || uv.x > 1.03 || uv.y < -0.03 || uv.y > 1.03 || p.w <= 0.0) {
    posData[i] = vec4f(p.xyz, 0.0);
    return;
  }
  let h = sampleBilin(compTex, clamp(uv, vec2f(0.0), vec2f(1.0)), 256u).x;
  if (p.y < h) {
    posData[i] = vec4f(p.xyz, 0.0);
    return;
  }
  posData[i] = p;
  velData[i] = v;
}
`;

// Billboard rendering of alive particles.
export const SPRAY_RENDER = /* wgsl */ `
struct RenderUniforms {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  camPosTime: vec4f,
  sunAmb: vec4f,
  camRight: vec4f,
  camUp: vec4f,
  nearOS: vec4f,
  midOS: vec4f,
  farOS: vec4f,
  modelOrigin: vec4f,
  misc: vec4f,
}

@group(0) @binding(0) var<uniform> F: RenderUniforms;
@group(0) @binding(1) var<storage> posData: array<vec4f>;
@group(0) @binding(2) var<storage> velData: array<vec4f>;

struct VSout {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) fade: f32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSout {
  var out: VSout;
  let p = posData[ii];
  if (p.w <= 0.001) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0); // off-screen degenerate
    out.uv = vec2f(0.0);
    out.fade = 0.0;
    return out;
  }
  let v = velData[ii];
  let corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let c = corners[vi];
  let sz = v.w * 2.6;
  let wp = p.xyz + (F.camRight.xyz * (c.x - 0.5) + F.camUp.xyz * (c.y - 0.5)) * sz;
  out.pos = F.viewProj * vec4f(wp, 1.0);
  out.uv = c;
  out.fade = clamp(p.w / 0.7, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VSout) -> @location(0) vec4f {
  let d = length(in.uv - vec2f(0.5));
  let a = smoothstep(0.5, 0.1, d) * 0.5 * in.fade;
  if (a < 0.004) { discard; }
  let col = vec3f(0.90, 0.95, 1.0);
  return vec4f(col, a);
}
`;
