# Replay history after an abandoned submission

`PathReplayHistorySubmission` wraps a speculative `PathReplayHistoryDomain::Resolve`. If the scope exits before
`AcknowledgeCompletion()`, it invalidates that snapshot, so the next resolve requires a fresh reservoir and
associated optional histories. The LightCompute Vulkan host acknowledges only after a successful fence wait and
readback. This prevents its retry from trusting a snapshot that did not reach the GPU.

## Reproduced case

Before the guard, the fixture warmed legacy-layout history, switched to compact, and injected a failure after
history resolution. A retry with the same layout failed with `Abandoned submission reused incompatible GPU
history`. The old snapshot had already advanced, even though no matching frame was submitted.

After the guard, two injected failures pass: immediately after history resolution, and after recording the
command buffer but before queue submission. For both, the retry resets history, accepts zero old seed banks and
matches a fresh result bit-for-bit. A host unit check also covers normal completion, scope abandonment and
exception unwinding. These are injected failures, **not actual GPU device loss, failed queue submission or fence
failure**. Caller synchronization remains essential if commands might still be in flight.

| Fresh frame | Retry after abandoned recording |
|---|---|
| ![Fresh replay](Images/ReplayRetryFresh.png) | ![Replay retry](Images/ReplayRetryActual.png) |

Actual 32 × 32 SwiftShader CPU Vulkan readbacks for the second injection; the tone-mapped PPMs are identical.
This is a reset check, not improved image quality, faster rendering or proof of production integration.

[Capture and hashes](Results/ReplaySubmissionCapture.txt) · [Release](Results/ReplaySubmission-release.txt) ·
[ASan/UBSan host](Results/ReplaySubmission-sanitized.txt).

## Caller contract

- Keep the domain and guard alive for the whole submission. Only one submission may be pending per domain;
  overlapping use and cross-thread mutation are not supported or enforced by the guard.
- Respect `Decision().ResetReservoir`, including resetting colour and seed histories where applicable. Supply the
  correct output-allocation revision and scene revisions.
- Call `AcknowledgeCompletion()` only after the submission actually completed successfully. The guard cannot
  inspect Vulkan fences or determine whether an acknowledgement is truthful.
- Invalidating a CPU snapshot does **not** cancel work or make in-flight GPU resources safe to reuse. Wait for
  completion or otherwise resolve the device/queue failure before reusing or destroying resources.
- The legacy direct `Resolve()` API still exists; direct callers must explicitly invalidate on failed or abandoned
  work. The production renderer does not currently use this guard or the replay recorder.

## Reproduce

Requires CMake 3.20+, C++20, Slang, Vulkan-Headers and SwiftShader as described in
[ReplayCompact](ReplayCompact.md). Run serially:

```sh
FRONTIER_REPLAY_COMPACT=1 RESULTS="$PWD/_ClaudeScratch/submission-release.txt" \
  bash Exhibits/LightCompute/RunReplaySampleHistory.sh
FRONTIER_REPLAY_COMPACT=1 SANITIZE=1 BUILD_JOBS=1 RESULTS="$PWD/_ClaudeScratch/submission-sanitized.txt" \
  bash Exhibits/LightCompute/RunReplaySampleHistory.sh
export VK_ICD_FILENAMES="$PWD/ExternalPackages/VulkanCompute/SwiftShader/vk_swiftshader_icd.json"
export LD_LIBRARY_PATH="$PWD/ExternalPackages/VulkanCompute/SwiftShader${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
_ClaudeScratch/build/replay-sample-history-release/LightComputeValidation \
  "$PWD/ExternalPackages/VulkanCompute/SwiftShader/libvulkan.so.1" \
  "$PWD/_ClaudeScratch/build/replay-sample-history-release" \
  --capture-replay-abandoned-submission "$PWD/_ClaudeScratch/replay-retry-capture"
cmp _ClaudeScratch/replay-retry-capture/ReplayRetryFresh.ppm _ClaudeScratch/replay-retry-capture/ReplayRetryActual.ppm
```

ReSTIR GI, renderer linkage, combining seed history and reservoir reuse, physical-GPU/Windows validation and
game performance remain open. Sanitizers cover host code, not the external driver or shader.
