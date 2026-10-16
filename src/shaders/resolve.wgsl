@group(1) @binding(0) var<storage, read> GBufferInput: array<GBufferRecord>;
@group(1) @binding(1) var<storage, read> ReservoirInput: array<ReservoirRecord>;
@group(1) @binding(2) var LightingOutput: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= Frame.screen.x || globalId.y >= Frame.screen.y) { return; }
  let pixelIndex = globalId.y * Frame.screen.x + globalId.x;
  let surface = GBufferInput[pixelIndex];
  let reservoir = ReservoirInput[pixelIndex];
  let mode = Frame.display.x;
  var color = surface.directRadiance.xyz;

  if (mode == 2u && surface.ids.z != 0u) {
    color = normalize(surface.worldNormalRoughness.xyz) * 0.5 + vec3<f32>(0.5);
  } else if (mode == 3u && surface.ids.z != 0u) {
    color = surface.albedoMetalness.xyz;
  } else if (mode == 4u) {
    if (reservoir.ids.y != 0u) {
      let age = min(f32(reservoir.ids.z) / 36.0, 1.0);
      let candidateCount = min(reservoir.pathRadianceM.w / 64.0, 1.0);
      let weightSignal = min(log2(1.0 + reservoir.sampleNormalWeight.w) / 12.0, 1.0);
      color = vec3<f32>(0.2 + age * 0.8, 0.16 + candidateCount * 0.84, 0.28 + weightSignal * 0.72);
    } else {
      color = vec3<f32>(0.04, 0.06, 0.07);
    }
  } else if (mode == 0u && surface.ids.z != 0u && reservoir.ids.y != 0u) {
    let evaluation = evaluateCandidate(surface, reservoir, false);
    if (evaluation.valid != 0u && evaluation.targetValue > 1.0e-7) {
      let representedCount = max(reservoir.pathRadianceM.w, 1.0);
      let normalization = reservoir.sampleNormalWeight.w / (representedCount * evaluation.targetValue);
      color += evaluation.contribution * normalization * Frame.settings.z;
    }
  }

  let value = luminance(color);
  if (value > Frame.thresholds.y && value > 1.0e-5) {
    color *= Frame.thresholds.y / value;
  }
  textureStore(LightingOutput, vec2<i32>(globalId.xy), vec4<f32>(max(color, vec3<f32>(0.0)), 1.0));
}
