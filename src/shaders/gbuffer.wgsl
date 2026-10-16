@group(1) @binding(0) var<storage, read_write> GBufferOutput: array<GBufferRecord>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= Frame.screen.x || globalId.y >= Frame.screen.y) { return; }
  let pixelIndex = globalId.y * Frame.screen.x + globalId.x;
  var seed = makeSeed(pixelIndex, Frame.screen.z, 17u);
  let jitter = vec2<f32>(randomFloat(&seed), randomFloat(&seed)) - vec2<f32>(0.5);
  let uv = (vec2<f32>(globalId.xy) + vec2<f32>(0.5) + jitter) / vec2<f32>(Frame.screen.xy);
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let direction = normalize(
    Frame.cameraForward.xyz
    + Frame.cameraRight.xyz * (ndc.x * Frame.settings.x * Frame.settings.y)
    + Frame.cameraUp.xyz * (ndc.y * Frame.settings.x)
  );
  let hit = traceScene(Frame.cameraPosition.xyz, direction, FAR_DISTANCE);
  if (hit.valid == 0u) {
    let sky = environmentRadiance(direction);
    GBufferOutput[pixelIndex] = GBufferRecord(
      vec4<f32>(0.0, 0.0, 0.0, FAR_DISTANCE),
      vec4<f32>(0.0, 0.0, 1.0, 1.0),
      vec4<f32>(0.0),
      vec4<f32>(sky, 1.0),
      vec4<u32>(INVALID_ID, 0u, 0u, 0u)
    );
    return;
  }
  let material = loadMaterial(hit.materialId);
  let viewDirection = normalize(Frame.cameraPosition.xyz - hit.worldPosition);
  let direct = directAtSurface(hit, viewDirection, &seed);
  let depth = max(dot(hit.worldPosition - Frame.cameraPosition.xyz, Frame.cameraForward.xyz), 0.0);
  GBufferOutput[pixelIndex] = GBufferRecord(
    vec4<f32>(hit.worldPosition, depth),
    vec4<f32>(hit.worldNormal, material.roughness),
    vec4<f32>(material.albedo, material.idslness),
    vec4<f32>(direct, 1.0),
    vec4<u32>(hit.objectId, hit.materialId, 1u, 0u)
  );
}
