# Replay history reset on output-layout changes

The Engine history domain now detects compact/legacy output-layout changes and caller-supplied output-allocation
revisions. Its new `ResetReservoir` decision also becomes true on the first call or after invalidation. The
LightCompute exhibit honors that decision when recording replay: reservoir history is reset and the existing
colour and seed-history reset paths follow it. This is a safety fix, not an improvement to the estimator or FPS.

## Reproduced defect and checks

Before the fix, the new Vulkan fixture failed with `Changing replay output layout did not reset history to fresh
output`. The test keeps a legacy-sized output allocation, warms history, and switches layouts without asking the
host for a manual reset. It then compares the first switched frame to a separate fresh render using the same seed.

| Check | Result |
|---|---|
| Legacy → compact and compact → legacy | Reservoir and seed-history modes reset; first frames match fresh |
| Colour reconstruction | Both layout directions reset colour and reservoir history; fresh output matches |
| Allocation revision | Host domain test checks reset even when the layout is unchanged |
| Audit override | Domain test requires the reset decision even with full-history audit enabled |
| Existing subpixel replay | Release and host sanitizer runs retain prior numerical results and pass 5/5 CTests |

The allocation-revision case is a **host-domain test**, not a GPU buffer-replacement test. The layout-switch
fixtures use a single allocation large enough for both layouts, and compare the first transition frame. They do
not prove safe aliasing, real GPU performance or all dynamic scenes.

| Fresh reservoir frame | First frame after layout change |
|---|---|
| ![Fresh frame](Images/ReplayLayoutFresh.png) | ![Switched frame](Images/ReplayLayoutSwitched.png) |

The images are direct 32 × 32 SwiftShader CPU-Vulkan fixture readbacks with the same tone mapping. Their PPM
files match byte-for-byte; they are reset diagnostics, not a quality or speed improvement claim.

[Release](Results/ReplayLayoutReset-release.txt) · [Host sanitizer](Results/ReplayLayoutReset-sanitized.txt) ·
[Colour reset](Results/ReplayLayoutResetReconstruction.txt) · [Capture](Results/ReplayLayoutResetCapture.txt).
The full release/sanitizer logs precede a later addition of the optional capture command; the Engine code and
reset assertions are the same. The earlier unrelated compact-layout parity mismatch remains unexplained.

## Caller contract

Set `PathReplayHistorySpecification::CompactOutput` to match the actual dispatch flag. Advance
`OutputAllocationRevision` whenever the persistent output allocation or its history content is replaced. A
`ResetReservoir` result **must** reset the reservoir and optional colour/seed histories before reuse; the recorder
does not do this automatically. The caller still handles dimensions, frame completion, history ownership,
submission synchronization and reset after a failed/abandoned submission. The domain snapshots at `Resolve`,
not on fence completion: call `Invalidate()` after failure. Unreported allocation changes and resource contents
cannot be detected by this API. Counter overflow or allocation-revision reuse is also caller responsibility.

## Reproduce

Prerequisites: CMake, C++20, Vulkan-Headers, Slang 2026.14.1 and SwiftShader in the paths described by
[ReplayCompact](ReplayCompact.md). With the environment prepared, run serially:

```sh
FRONTIER_REPLAY_COMPACT=1 RESULTS="$PWD/_ClaudeScratch/layout-release.txt" \
  bash Exhibits/LightCompute/RunReplaySampleHistory.sh
FRONTIER_REPLAY_COMPACT=1 SANITIZE=1 BUILD_JOBS=1 RESULTS="$PWD/_ClaudeScratch/layout-sanitized.txt" \
  bash Exhibits/LightCompute/RunReplaySampleHistory.sh
RESULTS="$PWD/_ClaudeScratch/layout-motion.txt" bash Exhibits/LightCompute/RunReplayDynamicCamera.sh
export VK_ICD_FILENAMES="$PWD/ExternalPackages/VulkanCompute/SwiftShader/vk_swiftshader_icd.json"
export LD_LIBRARY_PATH="$PWD/ExternalPackages/VulkanCompute/SwiftShader${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
_ClaudeScratch/build/replay-sample-history-release/LightComputeValidation \
  "$PWD/ExternalPackages/VulkanCompute/SwiftShader/libvulkan.so.1" \
  "$PWD/_ClaudeScratch/build/replay-sample-history-release" \
  --capture-replay-layout-transitions "$PWD/_ClaudeScratch/layout-capture"
cmp _ClaudeScratch/layout-capture/LayoutFresh.ppm _ClaudeScratch/layout-capture/LayoutSwitched.ppm
```

This is still software tracing on SwiftShader, not hardware RT, a completed renderer, or a physical-GPU or
Windows test. The replay recorder is not integrated into the production renderer, and combining seed history
with reservoir reuse remains open.
