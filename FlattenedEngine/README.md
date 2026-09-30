# FlattenedEngine — full modified Frontier files (no patches to apply)

This folder is every file the accumulated work touches, **materialized as a complete file**
already carrying all the changes. No `git apply`, no `.patch`, no rejects. Clone / fast-forward
your Frontier checkout to the base commit below, then **copy these files over the same paths**.

- **Base:** `SultanAladin/Frontier-` @ `main`, commit **`2fbe5c5`** *("Stop tracking the Refined creature variants")*.
- **Paths mirror Frontier exactly** — everything under this folder sits at the same relative path in the repo
  (`Engine/…`, `Projects/…`, `Docs/…`). The one exception is `_alternate-star-sizeclamp/` (see below).

## How to consume

```sh
git clone <Frontier> && cd Frontier-
git checkout 2fbe5c5            # or fast-forward main to it
# from the repo root, overlay the full files:
cp -R /path/to/Slate/FlattenedEngine/{Engine,Projects,Docs,CMakeLists.txt} .
git status                      # review; these are the flattened equivalents of the .patch set
```

If `main` has moved past `2fbe5c5`, `git diff` these against the newer tree first — they were flattened
against that exact commit.

## What's baked in (all stacked into these files)

| Area | Files |
|---|---|
| Render-mode matrix / RT toggle, GPU Surfel-GI source + lifecycle + build registration | `SurfelIrradianceUpdate.slang`, `SurfelCommit.slang`, `SurfelGIResolve.slang`, `SurfelGIStage.{h,cpp}`, `SwapchainExchange.{h,cpp}`, `CMakeLists.txt`, `ToolchainSequence.ps1` |
| Surface/material resolve + persistent G-buffer inputs | `SurfaceResolve.slang`, `VisibilityExchange.{h,cpp}` |
| CPU Surfel-GI oracle (shared, Vulkan-free) | `SurfelReference.{h,cpp}`, `CMakeLists.txt`, `ToolchainSequence.ps1` |
| ReSTIR viewport RayQuery integration | `ReSTIRViewport.slang` |
| Weather fixes (fog horizon continuity + wind translate/shear mode) | `ReSTIRViewport.slang`, `WeatherMedia.slang`, `VolumetricMedia.h`, `WeatherConstantRecord.h`, `WindField.h`, `WeatherInspectorPanel.cpp`, `VectorCodec.{h,cpp}`, `CelestialSequence.cpp` |
| Roadmap section E | `Docs/Roadmap.md` |
| Star sizing — **Gaussian profile (DEFAULT)** | `PostRecords.slang`, `VisibilityRaster.cpp` |
| Showcase host — System B flake paint **+** denoise detail-guide | `MaterialLevelViewport.cpp` |
| Denoiser detail-guide ("Smart" keeps flakes at Standard) | `DenoiseGuide.h` *(new file)*, `SwapchainExchange.h` (bits 12–14), `ReSTIRIntegrator.{h,cpp}`, `ControlCentreHost.{h,cpp}`, `GameExecution.cpp` |

## Two mutually-exclusive choices (already decided in the default tree)

1. **Star sizing — Gaussian vs. #34 clamp.** Both edit the *same* `Radius=` line in `PostRecords.slang`
   and `VisibilityRaster.cpp`, so only one can exist at a time.
   - **Default (in the main tree here):** the **Gaussian profile** (flux-preserving skirt).
   - **Alternate:** the simpler **#34 size-clamp** — the two full files live in
     `_alternate-star-sizeclamp/`. To use it instead, copy *those two files* over the defaults
     (they replace, do not merge). Do **not** ship both.

2. **Showcase host — System B + Denoise (stacked, not exclusive).** `MaterialLevelViewport.cpp` here
   contains **both** the System B flake-paint wiring and the denoise detail-guide on top of it. This is
   the full showcase state; there is no separate "System B only" file to pick between.

## Superseded weather patches

`WeatherFixes/patches/ALL_WeatherFixes.patch` is the superset that's baked in here; the standalone
`Fog_HorizonContinuity` and `WindAdvection_Mode` patches are strict subsets and are **not** applied
separately (doing so would double-apply).

## Status / caveats

- Every change flattened **clean** against `2fbe5c5`; the three DenoiseGuide hunks that overlapped the
  RT feature-bit edits were hand-merged (RT reserved bits 12–14 for exactly this). All symbols resolve
  (`S.DenoiseGuide` → `ControlCentreHost.h`; `ActiveConfiguration.DenoiseGuide` + `AssignDenoiseGuide`
  → `ReSTIRIntegrator.h`).
- **Not GPU-verified / not compiled here** — this is a source overlay, not a build. The shader and
  wind-mirror parity gates (`Tools/CheckPostKernel.sh`, wind mirror) aren't present in the sparse
  checkout used to flatten; run them in a full Frontier tree after overlaying.
- The per-feature `.patch` files and their render/evidence folders elsewhere in Slate are kept as the
  historical record; **this folder is the thing to consume.**
