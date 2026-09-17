import { COMMON } from './common';

export const RENDER_UNIFORMS_DECL = /* wgsl */ `
struct RenderUniforms {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  camPosTime: vec4f,   // xyz camera, w time
  sunAmb: vec4f,       // xyz sun dir, w unused
  camRight: vec4f,
  camUp: vec4f,
  nearOS: vec4f,       // xy near origin, z near size, w near fine cell size
  midOS: vec4f,        // xy mid origin, z mid size, w mid cell size
  farOS: vec4f,        // xy far origin, z far size, w far cell size (size=res*3 if disabled)
  modelOrigin: vec4f,  // xz snapped mesh origin, z waveview flag, w micro octaves
  misc: vec4f,         // x specPower, y microStrength, z foamGain, w windPhase
}
`;

// Fullscreen procedural sky.
export const SKY = /* wgsl */ `
${COMMON}
${RENDER_UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> F: RenderUniforms;

struct VSout {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSout {
  var o: VSout;
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)); // fullscreen triangle
  o.pos = vec4f(xy * 2.0 - vec2f(1.0), 1.0, 1.0);
  o.ndc = xy * 2.0 - vec2f(1.0);
  return o;
}

@fragment
fn fs(in: VSout) -> @location(0) vec4f {
  let p4 = F.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let wpos = p4.xyz / p4.w;
  var dir = normalize(wpos - F.camPosTime.xyz);
  if (dir.y < 0.015) { dir = normalize(vec3f(dir.x, 0.015, dir.z)); }
  var col = skyColor(dir, normalize(F.sunAmb.xyz));
  col = acesTone(col);
  col = pow(col, vec3f(1.0 / 2.2));
  return vec4f(col, 1.0);
}
`;

// Ocean surface: radial-LOD ("clipmap disc") mesh centered on the camera,
// height = weighted blend of near(AMR composite)/mid/far cascade textures,
// normals by central differences across the blended field, PBR-ish shading
// with procedural sky reflection, sun specular, crest subsurface, foam, fog.
export const WATER = /* wgsl */ `
${COMMON}
${RENDER_UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> F: RenderUniforms;
@group(0) @binding(1) var nearTex: texture_2d<f32>;
@group(0) @binding(2) var midTex: texture_2d<f32>;
@group(0) @binding(3) var farTex: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

struct VSin {
  @location(0) pos: vec2f, // local XZ offset from model origin (meters)
}

struct VSout {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) foam: f32,
  @location(3) hgt: f32,
  @location(4) dist: f32,
}

fn bandUV(p: vec2f, os: vec4f) -> vec2f {
  return (p - os.xy) / os.z;
}

// blended surface state at world XZ p
fn surface(p: vec2f, wN: f32, wM: f32, wF: f32) -> vec4f {
  let n = textureSampleLevel(nearTex, samp, bandUV(p, F.nearOS), 0.0);
  let m = textureSampleLevel(midTex, samp, bandUV(p, F.midOS), 0.0);
  let f = textureSampleLevel(farTex, samp, bandUV(p, F.farOS), 0.0);
  let s = wN + wM + wF;
  return (n * wN + m * wM + f * wF) / max(s, 0.0001);
}

fn weights(r: f32) -> vec3f {
  let eN = smoothstep(F.nearOS.z * 0.58, F.nearOS.z * 0.98, r);
  let eM = smoothstep(F.midOS.z * 0.55, F.midOS.z * 0.98, r);
  let wN = 1.0 - eN;
  let wM = max(eN - eM, 0.0);
  let wF = max(1.0 - wN - wM, 0.0);
  return vec3f(wN, wM, wF);
}

@vertex
fn vs(in: VSin) -> VSout {
  var o: VSout;
  let raw = F.modelOrigin.xz + in.pos;
  let r = length(in.pos);

  // per-vertex grid snap to its dominant band cell to avoid vertex swimming
  let w = weights(r);
  let cell = clamp(w.x * F.nearOS.w + w.y * F.midOS.w + w.z * F.farOS.w, 0.35, 64.0);
  let p = floor(raw / vec2f(cell)) * vec2f(cell);

  let ww = weights(length(p - F.modelOrigin.xz));
  let s = surface(p, ww.x, ww.y, ww.z);
  let eps = clamp(cell * 1.25, 0.35, 24.0);
  let sx = surface(p + vec2f(eps, 0.0), ww.x, ww.y, ww.z).x;
  let sz = surface(p + vec2f(0.0, eps), ww.x, ww.y, ww.z).x;
  let world = vec3f(p.x, s.x, p.y);
  let normal = normalize(vec3f(-(sx - s.x) / eps, 1.0, -(sz - s.x) / eps));
  o.pos = F.viewProj * vec4f(world, 1.0);
  o.world = world;
  o.normal = normal;
  o.foam = s.z;
  o.hgt = s.x;
  o.dist = r;
  return o;
}

@fragment
fn fs(in: VSout) -> @location(0) vec4f {
  let V = normalize(F.camPosTime.xyz - in.world);
  let sun = normalize(F.sunAmb.xyz);
  var N = normalize(in.normal);

  // procedural micro-normals (capillary detail), faded with distance
  if (F.modelOrigin.w > 0.5 && in.dist < 260.0) {
    let strength = F.misc.y * exp(-in.dist * 0.012);
    var grad = vec2f(0.0);
    let drift = F.misc.w;
    let p0 = in.world.xz * 0.9 + F.sunAmb.xz * 0.0 + vec2f(drift * 0.7, drift * -0.5);
    let h0 = fbm2(p0);
    grad = grad + vec2f(fbm2(p0 + vec2f(0.22, 0.0)) - h0, fbm2(p0 + vec2f(0.0, 0.22)) - h0) / 0.22 * 0.9;
    if (F.modelOrigin.w > 1.5) {
      let p1 = in.world.xz * 2.3 + vec2f(-drift * 1.1, drift * 0.8);
      let g1 = vec2f(fbm2(p1 + vec2f(0.18, 0.0)) - fbm2(p1), fbm2(p1 + vec2f(0.0, 0.18)) - fbm2(p1)) / 0.18;
      grad = grad + g1 * 0.45;
    }
    N = normalize(N + vec3f(-grad.x, 0.0, -grad.y) * strength);
  }

  let R = reflect(-V, N);
  let sky = skyColor(vec3f(R.x, abs(R.y) * 0.98 + 0.02, R.z), sun);
  let F0 = 0.02;
  let fres = F0 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  let crest = clamp(in.hgt * 0.45 + 0.42, 0.0, 1.0);
  let sunFlat = normalize(vec3f(sun.x, 0.0, sun.z) + vec3f(0.0001));
  let sss = pow(max(dot(-V, -sunFlat) * 0.5 + 0.5, 0.0), 3.0) * crest;
  var body = vec3f(0.010, 0.070, 0.105) + vec3f(0.045, 0.30, 0.28) * sss * 0.55;

  var col = mix(body, sky, fres);
  let Hv = normalize(V + sun);
  col = col + vec3f(1.0, 0.9, 0.72) * pow(max(dot(N, Hv), 0.0), F.misc.x) * 2.2 * (0.25 + fres);

  // foam: sim foam channel with noise breakup
  let fmRaw = clamp(in.foam * F.misc.z, 0.0, 1.0);
  let breakup = fbm2(in.world.xz * 1.6 + vec2f(F.misc.w * 0.3, -F.misc.w * 0.2)) * 0.75 + 0.5;
  let fm = clamp(fmRaw * breakup - 0.28, 0.0, 1.0) * 0.9;
  col = mix(col, vec3f(0.96, 0.98, 1.0), fm);

  // distance haze
  let fog = 1.0 - exp(-in.dist * 0.00021);
  col = mix(col, vec3f(0.70, 0.78, 0.86), fog);

  if (F.modelOrigin.z > 0.5) { // wave-height debug view
    let hm = clamp(in.hgt * 0.35 + 0.5, 0.0, 1.0);
    col = mix(vec3f(0.05, 0.10, 0.35), vec3f(0.95, 0.98, 1.0), hm);
  }

  col = acesTone(col);
  col = pow(col, vec3f(1.0 / 2.2));
  return vec4f(col, 1.0);
}
`;

// Top-down minimap of the near cascade: height/foam field + AMR block overlay
// + camera marker. Drawn as a screen-space quad, no depth.
export const MINIMAP = /* wgsl */ `
${COMMON}
${RENDER_UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> F: RenderUniforms;
@group(0) @binding(1) var mapTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<storage> blockData: array<f32>;

struct VSout {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSout {
  var o: VSout;
  let corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let c = corners[vi];
  let x0 = 0.585; let x1 = 0.965;
  let y0 = -0.965; let y1 = -0.585;
  o.pos = vec4f(mix(x0, x1, c.x), mix(y0, y1, c.y), 0.0, 1.0);
  o.uv = vec2f(c.x, c.y); // +z (window north) points up on screen
  return o;
}

@fragment
fn fs(in: VSout) -> @location(0) vec4f {
  let st = textureSampleLevel(mapTex, samp, in.uv, 0.0);
  var col = vec3f(0.016, 0.05, 0.10);
  col = mix(col, vec3f(0.10, 0.42, 0.55), clamp(st.x * 0.9, 0.0, 1.0));
  col = mix(col, vec3f(0.85, 0.95, 1.0), clamp(st.x * 1.5 - 0.35, 0.0, 1.0));
  col = col + vec3f(0.55, 0.16, 0.05) * clamp(st.z * 1.6, 0.0, 1.0);

  // AMR block overlay
  let px = in.uv * 256.0;
  let bx = floor(px.x / 32.0);
  let by = floor(px.y / 32.0);
  let b = by * 8.0 + bx;
  let refined = blockData[i32(clamp(b, 0.0, 63.0))] > 0.5;
  let fx = abs(fract(px.x / 32.0) - 0.5);
  let fy = abs(fract(px.y / 32.0) - 0.5);
  let edge = max(smoothstep(0.468, 0.498, fx), smoothstep(0.468, 0.498, fy));
  if (refined) {
    col = mix(col, vec3f(1.0, 0.82, 0.15), edge * 0.9);
  } else {
    col = mix(col, vec3f(0.25, 0.45, 0.60), edge * 0.25);
  }

  // camera marker
  let camUV = (F.camPosTime.xz - F.nearOS.xy) / F.nearOS.z;
  let d = length((camUV - in.uv) * 256.0);
  col = mix(col, vec3f(1.0, 0.25, 0.2), smoothstep(4.0, 1.5, d));

  // frame
  let be = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  col = mix(col, vec3f(0.75, 0.85, 0.95), smoothstep(0.004, 0.0, be));
  return vec4f(col, 1.0);
}
`;
