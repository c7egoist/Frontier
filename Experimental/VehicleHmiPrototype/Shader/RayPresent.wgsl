// RayPresent.wgsl — ACES tonemap + exposure to the swapchain (sRGB view).
struct Frame {
  eye: vec4f, right: vec4f, up: vec4f, fwd: vec4f,
  sunDir: vec4f, sunColor: vec4f,
  viewProj: mat4x4f, prevViewProj: mat4x4f,
  misc: vec4f, misc2: vec4f, misc3: vec4f, misc4: vec4f, pack1: vec4f, pack2: vec4f,
  lightPos: array<vec4f, 16>, lightCol: array<vec4f, 16>,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var src: texture_2d<f32>;
struct VsOut { @builtin(position) pos: vec4f };
@vertex fn Vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return VsOut(vec4f(p[i], 0.0, 1.0));
}
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
@fragment fn Present(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let size = vec2f(frame.misc.x, frame.misc.y);
  let uv = frag.xy / max(size, vec2f(1.0));
  // src is at trace resolution; sample nearest via texel coords scaled by canvas:
  let dims = vec2f(textureDimensions(src));
  let texel = vec2u(min(uv * dims, dims - 1.0));
  var c = textureLoad(src, texel, 0).rgb;
  c *= exp2(frame.misc3.x);
  return vec4f(aces(c), 1.0);
}
