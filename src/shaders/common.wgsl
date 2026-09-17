// ---------------------------------------------------------------------------
// Shared definitions for the Frontier ocean (cascaded shallow-water solver).
// ---------------------------------------------------------------------------

const PI : f32 = 3.14159265359;
const G  : f32 = 9.81;
const NBANDS : u32 = 3u;

struct Band {
  // x: domain size L (m), y: cell size dx (m), z: effective depth h (m), w: amplitude gain
  params : vec4<f32>,
  // x: dt for this band, y: linear drag, z: forcing amplitude, w: choppiness
  tuning : vec4<f32>,
};

struct SimUniforms {
  bands     : array<Band, 3>,
  windDirTime : vec4<f32>,   // xy = wind direction (unit), z = time, w = wind speed
  misc        : vec4<f32>,   // x = grid resolution, y = frame index, z = steepness, w = foam decay
};

struct Camera {
  viewProj    : mat4x4<f32>,
  invViewProj : mat4x4<f32>,
  eye         : vec4<f32>,   // xyz eye, w = time
  sun         : vec4<f32>,   // xyz sun dir (towards sun), w = exposure
  params      : vec4<f32>,   // x = choppiness, y = foam intensity, z = sea level, w = wave scale
  windDir     : vec4<f32>,   // xy wind dir, z wind speed, w = shore detail strength
};

// --- Analytic bathymetry -----------------------------------------------------
// A single island + a sloping shelf. Returns seabed height (negative = below
// sea level). Kept analytic so both the sim and the renderer agree exactly.
fn hash21(p : vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(0.1031, 0.1030));
  q += dot(q, q.yx + 33.33);
  return fract((q.x + q.y) * q.x);
}

fn vnoise(p : vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

fn fbm(p : vec2<f32>, oct : i32) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < oct; i = i + 1) {
    s += a * vnoise(q);
    q = q * 2.03 + vec2<f32>(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}

// Seabed elevation in metres (y up, 0 = mean sea level).
fn seabed(p : vec2<f32>) -> f32 {
  let r = length(p);
  // Deep basin far away, shelf rising towards the island.
  let deep = -160.0;
  let shelf = smoothstep(2600.0, 700.0, r);          // 0 offshore -> 1 near island
  var h = mix(deep, -14.0, shelf);
  // Island cone with a gentle beach.
  let island = 95.0 * exp(-pow(r / 420.0, 2.2)) - 16.0;
  h = max(h, island);
  // Rocky detail, fading out in deep water.
  h += fbm(p * 0.0016, 5) * 26.0 * smoothstep(3200.0, 900.0, r);
  h += fbm(p * 0.012, 3) * 2.2 * smoothstep(1400.0, 300.0, r);
  return h;
}

fn waterDepth(p : vec2<f32>) -> f32 {
  return max(0.0, -seabed(p));
}
