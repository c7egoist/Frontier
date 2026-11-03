// Composite: scene colour + subtle vignette, nothing hidden.
@group(1) @binding(0) var sceneTex : texture_2d<f32>;
@group(1) @binding(1) var postSampler : sampler;

struct POut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex fn vs(@builtin(vertex_index) idx : u32) -> POut {
  var out : POut;
  let p = vec2f(select(-1.0, 3.0, idx == 1u), select(-1.0, 3.0, idx == 2u));
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  return out;
}

@fragment fn fs(in : POut) -> @location(0) vec4f {
  let c = textureSampleLevel(sceneTex, postSampler, in.uv, 0.0).rgb;
  let d = in.uv - 0.5;
  let vig = 1.0 - dot(d, d) * 0.28;
  // Single place where exposure, tone mapping and gamma happen.
  return vec4f(tonemap(c * vig), 1.0);
}
