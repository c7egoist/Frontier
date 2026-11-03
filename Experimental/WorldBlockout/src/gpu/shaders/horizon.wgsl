// Horizon skirt — the cheapest regime. A ring around the camera at the far distance, shaded as
// open water with sky reflection only (no geometry, no displacement, no texture fetches).
struct HorizonParams {
  innerRadius : f32,
  outerRadius : f32,
  y           : f32,
  segments    : f32,
};
@group(1) @binding(0) var<uniform> hp : HorizonParams;

struct HOut {
  @builtin(position) pos : vec4f,
  @location(0) world : vec3f,
};

// Per-triangle corner table: xy = (radius 0 inner / 1 outer, angle 0 / 1).
const CORNERS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
);

@vertex fn vs(@builtin(vertex_index) idx : u32) -> HOut {
  let seg = idx / 6u;
  let c = CORNERS[idx % 6u];
  let ang = (f32(seg) + c.y) / max(hp.segments, 8.0) * 6.28318530718;
  let r = mix(hp.innerRadius, hp.outerRadius, c.x);
  let world = vec3f(frame.eye.x + cos(ang) * r, hp.y, frame.eye.z + sin(ang) * r);
  var out : HOut;
  out.pos = frame.viewProj * vec4f(world, 1.0);
  out.world = world;
  return out;
}

@fragment fn fs(in : HOut) -> @location(0) vec4f {
  let eye = frame.eye.xyz;
  let view = normalize(in.world - eye);
  let sunDir = normalize(frame.sunDir.xyz);
  // Flat water reflection: mirror the view ray and sample sky, Fresnel-weighted.
  let reflected = reflect(view, vec3f(0.0, 1.0, 0.0));
  let skyRefl = skyColor(reflected, sunDir);
  let fresnel = 0.02 + 0.98 * pow(1.0 - clamp(-view.y, 0.0, 1.0), 5.0);
  let waterBody = vec3f(0.012, 0.055, 0.085);
  var col = mix(waterBody, skyRefl, clamp(fresnel, 0.0, 1.0));
  col = applyFog(col, in.world, eye, sunDir);
  return vec4f(col, 1.0);
}
