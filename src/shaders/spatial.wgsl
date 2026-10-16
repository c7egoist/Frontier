@group(1) @binding(0) var<storage, read> CurrentGBuffer: array<GBufferRecord>;
@group(1) @binding(1) var<storage, read> TemporalReservoirs: array<ReservoirRecord>;
@group(1) @binding(2) var<storage, read_write> SpatialOutput: array<ReservoirRecord>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= Frame.screen.x || globalId.y >= Frame.screen.y) { return; }
  let pixelIndex = globalId.y * Frame.screen.x + globalId.x;
  let surface = CurrentGBuffer[pixelIndex];
  var reservoir = TemporalReservoirs[pixelIndex];
  if (Frame.features.z == 0u || Frame.quality.w == 0u || surface.ids.z == 0u) {
    SpatialOutput[pixelIndex] = reservoir;
    return;
  }

  let offsets = array<vec2<i32>, 8>(
    vec2<i32>(1, 0), vec2<i32>(-1, 0), vec2<i32>(0, 1), vec2<i32>(0, -1),
    vec2<i32>(1, 1), vec2<i32>(-1, 1), vec2<i32>(1, -1), vec2<i32>(-1, -1)
  );
  var seed = makeSeed(pixelIndex, Frame.screen.z, 227u);
  let rotation = seed & 7u;
  let tapCount = min(Frame.quality.w, 8u);
  for (var tap = 0u; tap < tapCount; tap += 1u) {
    let offsetIndex = (tap + rotation) & 7u;
    let radius = i32(1u + (tap / 4u));
    let samplePixel = vec2<i32>(globalId.xy) + offsets[offsetIndex] * radius;
    if (samplePixel.x < 0 || samplePixel.y < 0 || samplePixel.x >= i32(Frame.screen.x) || samplePixel.y >= i32(Frame.screen.y)) {
      continue;
    }
    let sampleIndex = u32(samplePixel.y) * Frame.screen.x + u32(samplePixel.x);
    let neighborSurface = CurrentGBuffer[sampleIndex];
    if (!compatibleNeighbor(surface, neighborSurface)) { continue; }
    let neighborReservoir = TemporalReservoirs[sampleIndex];
    if (neighborReservoir.ids.y == 0u || neighborReservoir.samplePositionTarget.w <= 1.0e-7) { continue; }

    let sourceCount = max(neighborReservoir.pathRadianceM.w, 1.0);
    let representedCount = min(sourceCount, f32(Frame.quality.z));
    let sourceWeightSum = neighborReservoir.sampleNormalWeight.w * (representedCount / sourceCount);
    let evaluation = evaluateCandidate(surface, neighborReservoir, true);
    if (evaluation.valid == 0u) { continue; }
    var reuseWeight = evaluation.targetValue * sourceWeightSum / neighborReservoir.samplePositionTarget.w;
    let destinationAverage = reservoir.sampleNormalWeight.w / max(reservoir.pathRadianceM.w, 1.0);
    let sourceAverage = sourceWeightSum / max(representedCount, 1.0);
    let clampLimit = max(max(destinationAverage, sourceAverage), 1.0e-4)
                   * max(Frame.thresholds.x, 1.0) * max(representedCount, 1.0);
    reuseWeight = min(reuseWeight, clampLimit);
    reservoir = addReservoirSample(
      reservoir,
      neighborReservoir,
      reuseWeight,
      representedCount,
      evaluation.targetValue,
      neighborReservoir.ids.z,
      &seed
    );
  }
  SpatialOutput[pixelIndex] = reservoir;
}
