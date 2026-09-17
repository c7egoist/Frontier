// Shared WGSL prelude: hash/noise, wrap/bilinear fetch helpers, sky model, tone map.
export const COMMON = /* wgsl */ `
const PI: f32 = 3.141592653589793;

// Simulation state layout shared by every sim texture (RGBA16F):
//   r = height h (m)   g = dh/dt (m/s)   b = foam (0..1)   a = spare
struct SimParams {
  origin: vec2f,       // window min corner in world XZ
  prevOrigin: vec2f,   // previous frame window origin (camera advection)
  size: f32,           // window edge length (m)
  dt: f32,
  c: f32,              // wave propagation speed sqrt(g*depthEff)
  damping: f32,        // velocity damping / s
  diffusion: f32,      // per-step blend toward neighbor average (high-band decay)
  windAmp: f32,        // wind forcing magnitude (m/s^2 scale)
  time: f32,
  seed: f32,
  texN: f32,           // coarse grid resolution
  fineN: f32,          // fine/composite grid resolution
  windDir: vec2f,
  spawnRate: f32,
  splashXY: vec2f,     // world XZ of active splash impulse
  splashAmp: f32,
  splashSigma: f32,    // splash radius (m)
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + vec2f(45.32, 45.32));
  return fract(q.x * q.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let ux = f.x * f.x * (3.0 - 2.0 * f.x);
  let uy = f.y * f.y * (3.0 - 2.0 * f.y);
  return mix(
    mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), ux),
    mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), ux),
    uy);
}

fn fbm2(p: vec2f) -> f32 {
  return 0.62 * vnoise(p) + 0.38 * vnoise(p * 2.13 + vec2f(17.3, 9.1));
}

fn wrapId(c: vec2i, n: i32) -> vec2i {
  return ((c % vec2i(n)) + vec2i(n)) % vec2i(n);
}

// Manually bilinear-filtered, toroidally-wrapping fetch (compute-safe).
fn sampleBilin(tex: texture_2d<f32>, uv: vec2f, n: u32) -> vec4f {
  let ni = i32(n);
  let p = uv * f32(n) - vec2f(0.5);
  let i0 = floor(p);
  let fr = p - i0;
  let a = wrapId(vec2i(i0), ni);
  let b = wrapId(vec2i(i0) + vec2i(1, 0), ni);
  let c = wrapId(vec2i(i0) + vec2i(0, 1), ni);
  let d = wrapId(vec2i(i0) + vec2i(1, 1), ni);
  let ta = textureLoad(tex, a, 0);
  let tb = textureLoad(tex, b, 0);
  let tc = textureLoad(tex, c, 0);
  let td = textureLoad(tex, d, 0);
  return mix(mix(ta, tb, fr.x), mix(tc, td, fr.x), fr.y);
}

fn skyColor(d: vec3f, sun: vec3f) -> vec3f {
  let dy = max(d.y, 0.0);
  var col = mix(vec3f(0.16, 0.34, 0.62), vec3f(0.55, 0.68, 0.82), pow(dy, 0.55));
  let sd = max(dot(d, sun), 0.0);
  col += vec3f(1.0, 0.85, 0.62) * (pow(sd, 700.0) * 24.0 + pow(sd, 7.0) * 0.10);
  col = mix(col, vec3f(0.72, 0.80, 0.88), pow(1.0 - dy, 5.0));
  return col;
}

fn acesTone(c: vec3f) -> vec3f {
  let x = max(c * vec3f(0.85), vec3f(0.0));
  return clamp((x * (2.51 * x + vec3f(0.03))) / (x * (2.43 * x + vec3f(0.59)) + vec3f(0.14)), vec3f(0.0), vec3f(1.0));
}
`;
