#include "common.wgsl"

// Spray billboards. Kept in its own module because a vertex stage may only
// bind storage buffers as read-only.

struct Particle {
  pos : vec4<f32>,
  vel : vec4<f32>,
};

struct SprayCam {
  viewProj : mat4x4<f32>,
  right    : vec4<f32>,
  up       : vec4<f32>,
  eye      : vec4<f32>,
};

@group(0) @binding(0) var<uniform> SC : SprayCam;
@group(0) @binding(1) var<storage, read> parts : array<Particle>;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) alpha : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let c = corners[vi];
  let p = parts[ii];

  var out : VSOut;
  out.uv = c;
  if (p.pos.w <= 0.0) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    out.alpha = 0.0;
    return out;
  }
  // Grow droplets slightly with distance so they never fall below a pixel.
  let d = distance(p.pos.xyz, SC.eye.xyz);
  let size = p.vel.w * (1.0 + d * 0.004);
  let world = p.pos.xyz + (SC.right.xyz * c.x + SC.up.xyz * c.y) * size;
  out.pos = SC.viewProj * vec4<f32>(world, 1.0);
  out.alpha = clamp(p.pos.w, 0.0, 1.0) * 0.55;
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }
  let a = in.alpha * (1.0 - r * r);
  return vec4<f32>(vec3<f32>(0.92, 0.96, 1.0) * a, a);
}
