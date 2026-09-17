#include "common.wgsl"

// ---------------------------------------------------------------------------
// Spray / splash particles.
//
// The heightfield cannot represent overturning water, so following
// Chentanez & Mueller 2010 we *convert* the unresolved part of the surface
// into ballistic particles: wherever a crest is steep and rising fast the
// solver emits droplets that then fly under gravity + wind drag and die when
// they fall back to the free surface. This is the "real particle" layer.
// ---------------------------------------------------------------------------

struct Particle {
  pos  : vec4<f32>,   // xyz world, w = life (<=0 means dead)
  vel  : vec4<f32>,   // xyz m/s,   w = size
};

struct SprayU {
  camEye     : vec4<f32>,   // xyz eye, w = dt
  wind       : vec4<f32>,   // xy dir, z speed, w = time
  cfg        : vec4<f32>,   // x = count, y = emit rate, z = patch size, w = gravity
  bandParams : vec4<f32>,   // x = band0 L, y = band2 L, z = spawn threshold, w = seed
};

@group(0) @binding(0) var<uniform> S : SprayU;
@group(0) @binding(1) var<storage, read_write> parts : array<Particle>;
@group(0) @binding(2) var disp : texture_2d_array<f32>;
@group(0) @binding(3) var samp : sampler;

fn rnd(seed : ptr<function, u32>) -> f32 {
  var x = *seed;
  x ^= x << 13u; x ^= x >> 17u; x ^= x << 5u;
  *seed = x;
  return f32(x & 0x00ffffffu) / f32(0x01000000u);
}

// Sample the composite ocean surface (all bands) at a world position.
fn surfaceAt(p : vec2<f32>) -> vec3<f32> {
  var h = 0.0;
  var d = vec2<f32>(0.0);
  for (var i = 0u; i < NBANDS; i = i + 1u) {
    let L = select(select(S.bandParams.x, S.bandParams.x * 0.25, i == 1u), S.bandParams.y, i == 2u);
    let s = textureSampleLevel(disp, samp, p / L, i32(i), 0.0);
    h += s.x;
    d += s.yz;
  }
  return vec3<f32>(d.x, h, d.y);
}

@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= u32(S.cfg.x)) { return; }

  var p = parts[idx];
  let dt = S.camEye.w;
  var seed = idx * 747796405u + u32(S.wind.w * 60.0) * 2891336453u + u32(S.bandParams.w);
  seed = seed ^ (seed >> 15u); seed = max(seed, 1u);

  p.pos.w -= dt;

  if (p.pos.w <= 0.0) {
    // Respawn: pick a point in a disc around the camera and only emit if the
    // local surface is steep enough to be breaking.
    let ang = rnd(&seed) * 2.0 * PI;
    let rad = sqrt(rnd(&seed)) * S.cfg.z;
    let xz = S.camEye.xz + vec2<f32>(cos(ang), sin(ang)) * rad;

    let s = surfaceAt(xz);
    let e = 1.0;
    let sx = surfaceAt(xz + vec2<f32>(e, 0.0)).y - surfaceAt(xz - vec2<f32>(e, 0.0)).y;
    let sz = surfaceAt(xz + vec2<f32>(0.0, e)).y - surfaceAt(xz - vec2<f32>(0.0, e)).y;
    let steep = length(vec2<f32>(sx, sz) / (2.0 * e));

    let depth = waterDepth(xz);
    // Shoaling amplifies steepness in shallow water -> shore break spray.
    let shoal = 1.0 + 2.5 * smoothstep(40.0, 4.0, depth);

    if (steep * shoal > S.bandParams.z && rnd(&seed) < S.cfg.y * dt * 60.0) {
      p.pos = vec4<f32>(xz.x + s.x, s.y + 0.4, xz.y + s.z, 0.7 + rnd(&seed) * 1.6);
      let up = 2.0 + steep * shoal * 5.0 + rnd(&seed) * 3.0;
      p.vel = vec4<f32>(S.wind.x * S.wind.z * 0.25 + (rnd(&seed) - 0.5) * 2.0,
                        up,
                        S.wind.y * S.wind.z * 0.25 + (rnd(&seed) - 0.5) * 2.0,
                        0.10 + rnd(&seed) * 0.35);
    } else {
      p.pos = vec4<f32>(0.0, -1000.0, 0.0, 0.0);
    }
  } else {
    // Ballistic flight with air drag and wind advection.
    var v = p.vel.xyz;
    let windV = vec3<f32>(S.wind.x, 0.0, S.wind.y) * S.wind.z;
    v += (vec3<f32>(0.0, -S.cfg.w, 0.0) + (windV - v) * 0.35) * dt;
    p.pos = vec4<f32>(p.pos.xyz + v * dt, p.pos.w);
    p.vel = vec4<f32>(v, p.vel.w);
    // Die when re-absorbed by the height field.
    let s = surfaceAt(p.pos.xz);
    if (p.pos.y < s.y) { p.pos.w = 0.0; }
  }

  parts[idx] = p;
}
