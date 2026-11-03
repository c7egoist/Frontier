// Vertical water-column slice — the evidence view for "this really is a height field".
//
// A thin vertical quad at the cursor plane draws the displaced surface profile as a filled
// silhouette, over the seabed profile, with a waterline. In the editor this is the difference
// between "a wave texture" and "2.5D water": you can see crests, troughs and water depth.
struct SliceParams {
  axisX     : f32,   // 1 = slice runs along world X at fixed Z, 0 = along Z at fixed X
  fixed     : f32,   // the fixed coordinate
  halfLen   : f32,   // half length of the slice, metres
  heightScale : f32, // vertical exaggeration
  lineWidth : f32,
  pad0      : f32,
  pad1      : f32,
  pad2      : f32,
};
@group(1) @binding(0) var<uniform> sl : SliceParams;
@group(1) @binding(1) var fieldTex : texture_2d<f32>;
@group(1) @binding(2) var fieldSampler : sampler;
@group(1) @binding(3) var bathyTex : texture_2d<f32>;
@group(1) @binding(4) var sliceSampler : sampler;

fn surfaceAt(t : f32) -> vec2f {
  // t in [0,1] along the slice; returns (seabed height, surface height)
  var world : vec2f;
  if (sl.axisX > 0.5) { world = vec2f(sl.fixed - sl.halfLen + t * 2.0 * sl.halfLen, sl.fixed); }
  else { world = vec2f(sl.fixed, sl.fixed - sl.halfLen + t * 2.0 * sl.halfLen); }
  let uv = (world + vec2f(frame.world.y, frame.world.y)) / frame.world.x;
  let b = textureSampleLevel(bathyTex, sliceSampler, uv, 0.0).r;
  let f = textureSampleLevel(fieldTex, fieldSampler, uv, 0.0);
  return vec2f(b, frame.sim.w + f.x * sl.heightScale);
}

@vertex fn vs(@builtin(vertex_index) idx : u32) -> @builtin(position) vec4f {
  // 2 triangles per step: (bottom_i, bottom_i+1, top_i) and (top_i, bottom_i+1, top_i+1)
  let steps = 256u;
  let tri = idx / 3u;
  let cornerId = idx % 3u;
  let step = tri / 2u;
  let second = (tri & 1u) == 1u;
  var which = 0u;   // 0 = bottom, 1 = top
  var offset = 0u;  // 0 = current step, 1 = next step
  if (cornerId == 1u) { offset = 1u; }
  if (cornerId == 2u) { which = 1u; }
  if (second) {
    if (cornerId == 0u) { which = 1u; offset = 0u; }
    if (cornerId == 1u) { which = 0u; offset = 1u; }
    if (cornerId == 2u) { which = 1u; offset = 1u; }
  }
  let t = clamp((f32(step) + f32(offset)) / f32(steps), 0.0, 1.0);
  let s = surfaceAt(t);
  let along = sl.fixed - sl.halfLen + t * 2.0 * sl.halfLen;
  let y = select(s.x, s.y, which == 1u);
  var worldPos : vec3f;
  if (sl.axisX > 0.5) { worldPos = vec3f(along, y, sl.fixed); }
  else { worldPos = vec3f(sl.fixed, y, along); }
  return frame.viewProj * vec4f(worldPos, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.25, 0.75, 0.95, 0.85);
}
