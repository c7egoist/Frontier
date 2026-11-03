// Shared uniforms, noise, sky and tone mapping for the world blockout renderer.
// All world units are metres. y is up. Sea level is y = 0.

const PI: f32 = 3.14159265359;

struct Frame {
  viewProj      : mat4x4f,
  invViewProj   : mat4x4f,
  eye           : vec4f, // xyz eye, w = time (s)
  forward       : vec4f, // xyz forward, w = simRadius
  sunDir        : vec4f, // xyz towards sun, w = sun intensity
  sunColor      : vec4f,
  sky           : vec4f, // x exposure, y fogDensity, z cloudCover, w unused
  sim           : vec4f, // x simExtent (half size), y simSpacing, z simCellMetres, w waterLevel
  screen        : vec4f, // xy size in pixels, zw 1/size
  misc          : vec4f, // x flatDistance, y horizonDistance, z fovY, w cameraHeight
  wind          : vec4f, // xy wind dir, z wind speed, w choppiness
  cascade       : vec4f, // xyz cascade tiles, w = deep depth (used for out-of-world bathymetry)
  world         : vec4f, // x worldSize, y half world size, z spectrum N, w grid N
  debug         : vec4f, // x lodOverlay (0/1), y waterSlice (0/1), z, w spare
};

struct Ring {
  // x = snapped origin x, y = snapped origin z, z = spacing, w = inner extent
  data : array<vec4f, 16>,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(0) @binding(1) var linearRepeat : sampler;
@group(0) @binding(2) var linearClamp : sampler;

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------
// Hash-based 2D simplex for GPU-side detail offsets. Deliberately NOT the CPU permutation:
// anything authoritative (terrain bake, coastlines, city pads, bathymetry) is produced on the
// CPU at upload time, so the two never have to agree. The GPU noise only adds sub-pixel detail
// where the bake is too coarse, which is exactly where exact agreement is invisible.
const GRAD3 = array<vec2f, 12>(
  vec2f(1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(-1.0, -1.0),
  vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(1.0, 0.0), vec2f(-1.0, 0.0),
  vec2f(0.0, 1.0), vec2f(0.0, -1.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0)
);

fn hash12(p : vec2f) -> u32 {
  var h = (bitcast<u32>(p.x) * 1597334673u) ^ (bitcast<u32>(p.y) * 3812015801u);
  h = (h ^ (h >> 15u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  return h ^ (h >> 16u);
}

fn permMod12(i: u32, j: u32) -> u32 {
  return hash12(vec2f(f32(i), f32(j))) % 12u;
}

fn grad2(gi: u32, x: f32, y: f32) -> f32 {
  let g = GRAD3[gi];
  return g.x * x + g.y * y;
}

fn simplex2(xin: f32, yin: f32) -> f32 {
  let F2: f32 = 0.3660254037844386;
  let G2: f32 = 0.21132486540518713;
  let s = (xin + yin) * F2;
  let i = floor(xin + s);
  let j = floor(yin + s);
  let t = (i + j) * G2;
  let x0 = xin - (i - t);
  let y0 = yin - (j - t);
  var i1 = 0.0;
  var j1 = 1.0;
  if (x0 > y0) { i1 = 1.0; j1 = 0.0; }
  let x1 = x0 - i1 + G2;
  let y1 = y0 - j1 + G2;
  let x2 = x0 - 1.0 + 2.0 * G2;
  let y2 = y0 - 1.0 + 2.0 * G2;
  let ii = u32(bitcast<i32>(i)) & 0xFFFFu;
  let jj = u32(bitcast<i32>(j)) & 0xFFFFu;
  var n0 = 0.0;
  var n1 = 0.0;
  var n2 = 0.0;
  var t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0.0) {
    let gi = permMod12(ii, jj);
    t0 = t0 * t0;
    n0 = t0 * t0 * grad2(gi, x0, y0);
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0.0) {
    let gi = permMod12(ii + u32(i1), jj + u32(j1));
    t1 = t1 * t1;
    n1 = t1 * t1 * grad2(gi, x1, y1);
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0.0) {
    let gi = permMod12(ii + 1u, jj + 1u);
    t2 = t2 * t2;
    n2 = t2 * t2 * grad2(gi, x2, y2);
  }
  return 70.0 * (n0 + n1 + n2);
}

fn fbm2(p: vec2f, octaves: u32) -> f32 {
  var a = 1.0;
  var f = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o = o + 1u) {
    sum = sum + a * simplex2(p.x * f, p.y * f);
    norm = norm + a;
    a = a * 0.5;
    f = f * 2.0;
  }
  return sum / max(norm, 1e-6);
}

fn ridged2(p: vec2f, octaves: u32) -> f32 {
  var a = 0.5;
  var f = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  var prev = 1.0;
  for (var o = 0u; o < octaves; o = o + 1u) {
    var n = 1.0 - abs(simplex2(p.x * f, p.y * f));
    n = n * n * prev;
    prev = n;
    sum = sum + n * a;
    norm = norm + a;
    a = a * 0.5;
    f = f * 2.02;
  }
  return sum / max(norm, 1e-6);
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
fn skyColor(dir: vec3f, sunDir: vec3f) -> vec3f {
  let up = clamp(dir.y, -1.0, 1.0);
  let zenith = vec3f(0.030, 0.085, 0.235);
  let horizon = vec3f(0.46, 0.56, 0.71);
  let ground = vec3f(0.07, 0.08, 0.09);
  let t = pow(clamp(up, 0.0, 1.0), 0.62);
  var col = mix(horizon, zenith, t);
  // sun glow: a soft halo plus a tight disc, both kept below clipping so the tonemapper does
  // not wash the whole sky out on a low sun.
  let sd = max(dot(dir, sunDir), 0.0);
  let glow = pow(sd, 6.0) * 0.10 + pow(sd, 300.0) * 1.4;
  col = col + frame.sunColor.rgb * glow * 0.55;
  // below horizon fades to haze
  col = mix(ground, col, smoothstep(-0.12, 0.02, up));
  // very cheap cloud band, only for the sky pass
  let cl = fbm2(vec2f(dir.x / max(abs(dir.y) + 0.08, 0.08), dir.z / max(abs(dir.y) + 0.08, 0.08)) * 1.7 + vec2f(frame.eye.w * 0.004, 0.0), 5u);
  let cloud = smoothstep(0.15, 0.75, cl) * smoothstep(0.0, 0.35, up) * frame.sky.z;
  col = mix(col, vec3f(0.92, 0.94, 0.98) * (0.75 + 0.25 * sd), cloud);
  return col;
}

// Aerial perspective: height fog plus distance extinction.
fn applyFog(col: vec3f, worldPos: vec3f, eye: vec3f, sunDir: vec3f) -> vec3f {
  let dist = length(worldPos - eye);
  let h0 = max(eye.y, 0.0);
  let h1 = max(worldPos.y, 0.0);
  let scaleH = 7000.0;
  let avgH = (h1 - h0) / max(log((h1 + scaleH) / (h0 + scaleH)), 1e-4);
  let density = frame.sky.y;
  let fogAmount = 1.0 - exp(-dist * density * exp(-max(avgH, 0.0) / scaleH));
  let sunAmt = pow(max(dot(normalize(worldPos - eye), sunDir), 0.0), 4.0);
  let fogCol = mix(vec3f(0.58, 0.66, 0.78), frame.sunColor.rgb * 1.2, sunAmt * 0.6);
  return mix(col, fogCol, clamp(fogAmount, 0.0, 0.92));
}

// ---------------------------------------------------------------------------
// Tone mapping (ACES fitted, Narkowicz 2015) + gamma
// ---------------------------------------------------------------------------
fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn tonemap(color: vec3f) -> vec3f {
  let exposed = color * frame.sky.x;
  let mapped = acesFilm(exposed);
  return pow(mapped, vec3f(1.0 / 2.2));
}

// ---------------------------------------------------------------------------
// Full screen triangle (no vertex buffer)
// ---------------------------------------------------------------------------
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

fn fullscreenTri(idx: u32) -> VSOut {
  var out: VSOut;
  var p = vec2f(-1.0, -1.0);
  if (idx == 1u) { p = vec2f(3.0, -1.0); }
  if (idx == 2u) { p = vec2f(-1.0, 3.0); }
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  return out;
}

fn rayFromUv(uv: vec2f) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let p = frame.invViewProj * vec4f(ndc, 1.0, 1.0);
  return normalize(p.xyz / p.w - frame.eye.xyz);
}
