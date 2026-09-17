#include "common.wgsl"

// Seabed / island rendered with the same analytic bathymetry the sim uses,
// on a camera-centred radial clipmap (identical vertex layout to the ocean).

@group(0) @binding(0) var<uniform> C : Camera;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) world : vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  let RA : u32 = 256u;
  let ri = vi / (RA + 1u);
  let ai = vi % (RA + 1u);
  let t = f32(ri) / 192.0;
  let radius = 0.6 * exp(t * 10.3);
  let ang = f32(ai) / f32(RA) * 2.0 * PI;
  var p = C.eye.xz + vec2<f32>(cos(ang), sin(ang)) * radius;
  let q = max(0.5, radius * 0.03);
  p = floor(p / q + 0.5) * q;

  let y = seabed(p);
  var o : VSOut;
  o.world = vec3<f32>(p.x, y, p.y);
  o.clip = C.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let e = 1.5;
  let hx = seabed(in.world.xz + vec2<f32>(e, 0.0)) - seabed(in.world.xz - vec2<f32>(e, 0.0));
  let hz = seabed(in.world.xz + vec2<f32>(0.0, e)) - seabed(in.world.xz - vec2<f32>(0.0, e));
  let N = normalize(vec3<f32>(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
  let L = normalize(C.sun.xyz);

  let y = in.world.y;
  let sand = vec3<f32>(0.72, 0.65, 0.49);
  let rock = vec3<f32>(0.32, 0.30, 0.28);
  let grass = vec3<f32>(0.20, 0.30, 0.14);
  var base = mix(sand, grass, smoothstep(3.0, 18.0, y));
  base = mix(base, rock, smoothstep(0.55, 0.85, 1.0 - N.y));
  base = mix(sand * 0.8, base, smoothstep(-1.5, 1.0, y));
  base *= 0.85 + 0.3 * fbm(in.world.xz * 0.08, 3);

  var col = base * (0.25 + 0.9 * max(0.0, dot(N, L)));
  // Underwater absorption for submerged bed.
  if (y < 0.0) {
    let d = -y;
    col *= exp(-vec3<f32>(0.16, 0.055, 0.035) * d * 1.3);
  }

  let dist = length(in.world - C.eye.xyz);
  let fog = 1.0 - exp(-dist * 0.00016);
  col = mix(col, vec3<f32>(0.45, 0.58, 0.72), fog);

  col = 1.0 - exp(-col * C.sun.w);
  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
  return vec4<f32>(col, 1.0);
}
