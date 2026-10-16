@group(1) @binding(0) var<storage, read> GBufferInput: array<GBufferRecord>;
@group(1) @binding(1) var<storage, read_write> CandidateOutput: array<ReservoirRecord>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= Frame.screen.x || globalId.y >= Frame.screen.y) { return; }
  let pixelIndex = globalId.y * Frame.screen.x + globalId.x;
  let surface = GBufferInput[pixelIndex];
  let debugMode = Frame.display.x;
  if (surface.ids.z == 0u || debugMode == 1u || debugMode == 2u || debugMode == 3u) {
    CandidateOutput[pixelIndex] = emptyReservoir();
    return;
  }
  if (Frame.features.w != 0u && Frame.screen.z > 0u && ((globalId.x + globalId.y + Frame.screen.z) & 1u) != 0u) {
    CandidateOutput[pixelIndex] = emptyReservoir();
    return;
  }

  var reservoir = emptyReservoir();
  var seed = makeSeed(pixelIndex, Frame.screen.z, 83u);
  let candidateCount = clamp(Frame.quality.y, 1u, 4u);
  for (var candidateIndex = 0u; candidateIndex < candidateCount; candidateIndex += 1u) {
    let candidate = createCandidate(surface, &seed);
    if (candidate.ids.y == 0u) { continue; }
    reservoir = addReservoirSample(
      reservoir,
      candidate,
      candidate.sampleNormalWeight.w,
      1.0,
      candidate.samplePositionTarget.w,
      0u,
      &seed
    );
  }
  CandidateOutput[pixelIndex] = reservoir;
}
