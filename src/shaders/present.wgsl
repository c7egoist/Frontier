@group(1) @binding(0) var LightingTexture: texture_2d<f32>;
@group(1) @binding(1) var LinearSampler: sampler;
@group(1) @binding(2) var<storage, read> GBufferInput: array<GBufferRecord>;

struct PresentVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> PresentVertex {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let position = positions[vertexIndex];
  var output: PresentVertex;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

fn acesToneMap(color: vec3<f32>) -> vec3<f32> {
  let x = max(color, vec3<f32>(0.0));
  return clamp((x * (2.51 * x + vec3<f32>(0.03))) / (x * (2.43 * x + vec3<f32>(0.59)) + vec3<f32>(0.14)), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fragmentMain(input: PresentVertex) -> @location(0) vec4<f32> {
  let dimensions = vec2<i32>(i32(Frame.screen.x), i32(Frame.screen.y));
  let centerPixel = clamp(vec2<i32>(input.uv * vec2<f32>(Frame.screen.xy)), vec2<i32>(0), dimensions - vec2<i32>(1));
  var color = textureSampleLevel(LightingTexture, LinearSampler, input.uv, 0.0).xyz;

  if (Frame.display.y != 0u && Frame.display.x <= 1u) {
    let centerIndex = u32(centerPixel.y) * Frame.screen.x + u32(centerPixel.x);
    let centerSurface = GBufferInput[centerIndex];
    var totalWeight = 0.0;
    var filtered = vec3<f32>(0.0);
    for (var oy = -1; oy <= 1; oy += 1) {
      for (var ox = -1; ox <= 1; ox += 1) {
        let samplePixel = clamp(centerPixel + vec2<i32>(ox, oy), vec2<i32>(0), dimensions - vec2<i32>(1));
        let sampleIndex = u32(samplePixel.y) * Frame.screen.x + u32(samplePixel.x);
        let sampleSurface = GBufferInput[sampleIndex];
        var edgeWeight = 1.0;
        if (centerSurface.ids.z != sampleSurface.ids.z) {
          edgeWeight = 0.0;
        } else if (centerSurface.ids.z != 0u) {
          let normalAgreement = max(dot(normalize(centerSurface.worldNormalRoughness.xyz), normalize(sampleSurface.worldNormalRoughness.xyz)), 0.0);
          let planeDistance = abs(dot(sampleSurface.worldPosition.xyz - centerSurface.worldPosition.xyz,
                                      normalize(centerSurface.worldNormalRoughness.xyz)));
          edgeWeight = pow(normalAgreement, 20.0) * exp(-planeDistance * 18.0);
        }
        let spatialWeight = select(1.0, 2.0, ox == 0 && oy == 0);
        let weight = edgeWeight * spatialWeight;
        filtered += textureLoad(LightingTexture, samplePixel, 0).xyz * weight;
        totalWeight += weight;
      }
    }
    if (totalWeight > 0.0) {
      color = mix(color, filtered / totalWeight, clamp(Frame.thresholds.z, 0.0, 1.0));
    }
  }

  color = acesToneMap(color * exp2(Frame.settings.w));
  color = pow(color, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(color, 1.0);
}
