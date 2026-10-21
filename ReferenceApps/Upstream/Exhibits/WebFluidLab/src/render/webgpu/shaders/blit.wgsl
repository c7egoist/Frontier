// Fullscreen upscale blit from the (dynamically resized) internal render
// target to the swapchain, with a light unsharp-mask so lowered dynamic
// resolution scales still read reasonably crisp — the same spirit as
// Unreal's dynamic-resolution upscale pass.

@group(0) @binding(0) var srcTex : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  var out: VsOut;
  let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
  out.uv = uv;
  out.pos = vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
  out.pos.y = -out.pos.y;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex));
  let texel = 1.0 / dims;
  let center = textureSample(srcTex, srcSampler, in.uv);
  let n = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(0.0, -texel.y));
  let s = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(0.0, texel.y));
  let e = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(texel.x, 0.0));
  let w = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(-texel.x, 0.0));
  let blur = (n + s + e + w) * 0.25;
  let sharpened = center + (center - blur) * 0.35;
  return vec4<f32>(clamp(sharpened.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
