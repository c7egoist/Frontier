@group(1) @binding(0) var<storage, read> CurrentGBuffer: array<GBufferRecord>;
@group(1) @binding(1) var<storage, read> PreviousGBuffer: array<GBufferRecord>;
@group(1) @binding(2) var<storage, read> CurrentCandidates: array<ReservoirRecord>;
@group(1) @binding(3) var<storage, read> PreviousReservoirs: array<ReservoirRecord>;
@group(1) @binding(4) var<storage, read_write> TemporalOutput: array<ReservoirRecord>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= Frame.screen.x || globalId.y >= Frame.screen.y) { return; }
  let pixelIndex = globalId.y * Frame.screen.x + globalId.x;
  let surface = CurrentGBuffer[pixelIndex];
  var seed = makeSeed(pixelIndex, Frame.screen.z, 149u);
  var reservoir = CurrentCandidates[pixelIndex];

  if (Frame.features.y != 0u && Frame.features.x != 0u && surface.ids.z != 0u) {
    let previousCoordinate = reprojectPreviousPixel(surface, globalId.x, globalId.y);
    if (previousCoordinate.x >= 0 && previousCoordinate.y >= 0) {
      let previousIndex = u32(previousCoordinate.y) * Frame.screen.x + u32(previousCoordinate.x);
      let previousSurface = PreviousGBuffer[previousIndex];
      if (validateHistory(surface, previousSurface)) {
        let previousReservoir = PreviousReservoirs[previousIndex];
        var endpointStable = true;
        if (previousReservoir.ids.w == 0u && previousReservoir.ids.x < Frame.screen.w) {
          let endpointId = previousReservoir.ids.x;
          let localEndpoint = vec4<f32>(previousReservoir.samplePositionTarget.xyz, 1.0);
          let previousEndpoint = (objectPreviousModel(endpointId) * localEndpoint).xyz;
          let currentEndpoint = (objectModel(endpointId) * localEndpoint).xyz;
          endpointStable = distance(previousEndpoint, currentEndpoint) < 0.12;
        }
        if (endpointStable && previousReservoir.ids.y != 0u && previousReservoir.pathRadianceM.w > 0.0
            && previousReservoir.ids.z <= Frame.quality.z + 2u) {
          let sourceCount = max(previousReservoir.pathRadianceM.w, 1.0);
          let representedCount = min(sourceCount, f32(Frame.quality.z));
          let sourceWeightSum = previousReservoir.sampleNormalWeight.w * (representedCount / sourceCount);
          let evaluation = evaluateCandidate(surface, previousReservoir, true);
          if (evaluation.valid != 0u && previousReservoir.samplePositionTarget.w > 1.0e-7) {
            var reuseWeight = evaluation.targetValue * sourceWeightSum / previousReservoir.samplePositionTarget.w;
            let destinationAverage = reservoir.sampleNormalWeight.w / max(reservoir.pathRadianceM.w, 1.0);
            let sourceAverage = sourceWeightSum / max(representedCount, 1.0);
            let clampLimit = max(max(destinationAverage, sourceAverage), 1.0e-4)
                           * max(Frame.thresholds.x, 1.0) * max(representedCount, 1.0);
            reuseWeight = min(reuseWeight, clampLimit);
            reservoir = addReservoirSample(
              reservoir,
              previousReservoir,
              reuseWeight,
              representedCount,
              evaluation.targetValue,
              min(previousReservoir.ids.z + 1u, 255u),
              &seed
            );
          }
        }
      }
    }
  }
  TemporalOutput[pixelIndex] = reservoir;
}
