# Vulkan submission and TLAS refresh

Continues from `7dee22cc8a09243e50daedde114a82f203d50d88`. No shader, resolution, bounce count, or other rendering
quality setting is changed.

## Changes

- Uploads, image transitions, and the next recorded command sequence share one Vulkan queue submission and fence wait.
  Existing dependencies and overlapping-write ordering remain; pending resources stay alive until completion. Explicit
  flushes, readback, staging growth, and empty series still flush, and each sequence in a series is still waited on.
- Unchanged effective TLAS inputs reuse the previous TLAS bytes. The key uses exact float bits for bounds/centroids,
  occupant indices, BLAS roots and ground assignment. Changes in participation, activity or bounds are re-evaluated every
  refresh. `BuildHostHierarchy` invalidates retained inputs. TLAS writes and `WriteObserver` notifications still occur
  every refresh, including on the unchanged path.
- Changed TLAS inputs still use the same eight-bin SAH splits; ordered prefix/suffix spans avoid repeatedly scanning the
  same bins, preserving candidate and signed-zero tie behavior.

## Results

Linux x86-64, GCC 12.2, `-O3 -DNDEBUG`, pinned SwiftShader (CPU Vulkan), ProvingGround with 2,094 occupants. Three
alternating process pairs; each reported median is from seven rounds after a warm-up. Full individual measurements and
checks: [Comparison.txt](Results/Comparison.txt).

| Workload | Original | Optimized | Observation |
|---|---:|---:|---|
| 16 KiB upload + dependent copy | 0.287939 ms | 0.111543 ms | 2 → 1 submissions and waits |
| Upload + two command sequences | 3 submits | 2 submits | Each sequence still waits separately |
| Unchanged TLAS, host only | 0.193936 ms | 0.023511 ms | 8.25× in this sample |
| Moving-occupant TLAS, host only | 0.212703 ms | 0.195016 ms | 1.09× in this sample |

The submission timings are noisy. These are **microbenchmarks on software Vulkan**, not whole-frame FPS or hardware-GPU
claims. The comparison contains the individual samples. End-to-end viewport performance and the native Windows runtime
are not validated for this reconstructed commit; profile on a real GPU before making frame-performance claims.

151 TLAS snapshots (3,892,248 bytes) exactly matched the original revision. They cover transforms, activity, raster and
fragment participation, local/card/facet bounds, BLAS root, ground, zero-active and single-instance scenes, rebuilding,
seeded edits, coincident bounds and a binned grid. Structural checks cover leaf membership, bounds and links. Vulkan
readbacks verify unchanged uploads, the observer, a replacement destination and a moved instance. The upload tests cover
buffer/image overlap, image layers and transitions, multi-sequence dependencies, resource lifetime, flushes, readback
and staging growth beyond 80 MiB.

## Reproduce

On Linux x86-64 with Python 3, Node, Git and a C++20 GCC compiler:

```sh
python3 Automation/PrepareUI.py
python3 Automation/PrepareVulkanCompute.py
python3 Exhibits/RenderingPerformance/Code/CompareRevisions.py --pairs 3
```

The script extracts the four original source/header files with `git show`, compiles both revisions against the same
fixture and unchanged dependencies, runs the checks, compares snapshots byte-for-byte and prints paired measurements.
Executables and snapshots stay in ignored `_ClaudeScratch/`. The baseline Git object must be available. To use another
Vulkan implementation, supply `FRONTIER_VULKAN_DRIVER`, `VK_ICD_FILENAMES`, and (if needed) `LD_LIBRARY_PATH`.

The validation programs are also registered as `DeviceSubmissionValidation`, `RayTracingRefreshValidation` and
`RayTracingTransferValidation` CTests in a normal `BUILD_TESTING` build; the two Vulkan tests require an initialized
Vulkan device. The full repository test suite, validation layers and hardware Vulkan were not run in this environment.
