#include "common.wgsl"

@group(0) @binding(0) var<uniform> C : Camera;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) ndc : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  let p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VSOut;
  o.ndc = p[vi];
  o.clip = vec4<f32>(p[vi], 1.0, 1.0);
  return o;
}

fn skyColor(dir : vec3<f32>) -> vec3<f32> {
  let sun = normalize(C.sun.xyz);
  let up = clamp(dir.y, -1.0, 1.0);
  var col = mix(vec3<f32>(0.62, 0.74, 0.86), vec3<f32>(0.12, 0.30, 0.62), pow(clamp(up, 0.0, 1.0), 0.55));
  let mu = max(0.0, dot(dir, sun));
  col += vec3<f32>(1.0, 0.85, 0.62) * pow(mu, 8.0) * 0.30;
  col += vec3<f32>(1.0, 0.92, 0.78) * pow(mu, 900.0) * 14.0;
  col = mix(col, vec3<f32>(0.52, 0.60, 0.70), smoothstep(0.06, -0.05, up));
  return col;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let near = C.invViewProj * vec4<f32>(in.ndc, 0.0, 1.0);
  let far  = C.invViewProj * vec4<f32>(in.ndc, 1.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);

  var col = skyColor(dir);

  // Distant island silhouette is handled by the terrain pass; here just haze.
  col = 1.0 - exp(-col * C.sun.w);
  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
  return vec4<f32>(col, 1.0);
}
