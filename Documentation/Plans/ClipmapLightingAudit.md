# Clipmap Lighting CPU Audit

## Outcome

| Item | Status | Evidence |
|---|---|---|
| C++ static SDF clipmap reference | complete | `Engine/DistanceFieldSpace/ClipmapSurfaceCache.{h,cpp}` |
| C++ hybrid object-local vehicle SDF | complete | Same module; `VehiclePlacement` transforms world samples into local vehicle coordinates before SDF composition |
| Surface-card cache reference | complete | Nine explicit cards injected from sun, point, area, or emissive input |
| Sobol spherical-cap cone accessibility | complete | `EvaluateConeGlobalIllumination` in `Exhibits/ClipmapLighting/ClipmapLightingValidation.cpp` |
| Deterministic two-bounce path reference | complete for the controlled CPU scene | 16 fixed Sobol directions, no PRNG, no denoiser |
| 480 × 270 captures, GIF, debug views | complete | `Exhibits/ClipmapLighting/Output/` and `Proof.html` |
| GPU implementation or engine hook | **blocked / not claimed** | Checkout has no Vulkan renderer host, Slang compiler integration, scene resource path, or CMake executable |
| Absolute realism, real-scene comparison, 60/120 FPS | **not demonstrated** | No calibrated real reference or GPU hardware was available |

## Executed validation

| Check | Result from the final CPU run |
|---|---:|
| Resolution | `480 × 270` |
| Static clipmap bake | `189.952 ms` |
| Full static-plus-moving-vehicle rebake | `371.906 ms` per motion update |
| Local vehicle SDF + card refresh | `0.039 ms` per motion update |
| Scoped update reduction | `9,544×` (`371.906 / 0.038968`) |
| Hybrid SDF error vs analytic scene oracle | `4.4296e-08 m` mean absolute error |
| Stale vehicle SDF error vs analytic scene oracle | `0.49959 m` mean absolute error |
| Determinism | two independently rendered combined images had the same `0xdeda8611` image hash |
| Finite-pixel scan | combined and path images passed; no NaN or Inf |
| Combined CPU image time | `3,269.044 ms` |
| Deterministic 16-ray two-bounce path reference | `20,905.900 ms` |

### Command executed

```bash
g++ -std=c++20 -O3 -Wall -Wextra -Wpedantic -I. \
  Exhibits/ClipmapLighting/ClipmapLightingValidation.cpp \
  Engine/DistanceFieldSpace/ClipmapSurfaceCache.cpp \
  -o _ClaudeScratch/clipmap-build/ClipmapLightingValidation
_ClaudeScratch/clipmap-build/ClipmapLightingValidation Exhibits/ClipmapLighting/Output
```

`cmake` was absent in the sandbox, so the retained `Exhibits/ClipmapLighting/CMakeLists.txt` was not executed. The direct `g++` command above compiled warning-free and executed successfully.

## What I actually inspected

I opened the final PNG captures and the generated GIF in the workspace image viewer. I saw a simple analytic gallery containing a boxy red vehicle, ceiling area emitter, coloured walls, hard vehicle silhouettes, and bright indirect colour fields. The final images are free from stochastic grain because the path reference uses fixed quadrature and no denoiser.

I also saw that the output is **not photoreal**: it has basic analytic geometry, an overexposed ceiling area, simplified material response, low-detail wheels, hard silhouettes, a clipped foreground floor, and no calibrated real-world material or camera reference. I therefore do not claim “absolute realism,” a real-versus-fake comparison, or production visual readiness.

The source-separated GI images are honest captures. Area/emissive GI is much stronger than the sun and point captures in this enclosed synthetic scene; that imbalance is visible in the output and is not concealed by the report.

## Upstream audit performed before the replacement

The owner-linked branch was fetched for read-only inspection at commit `c205cb698288ccd90bf909e25e28ce28d48d0dfa`.

| Inspected upstream item | Finding | Consequence |
|---|---|---|
| `Engine/DistanceFieldSpace/SignedDistanceVolume.*` | One sparse narrow-band volume with 8³ bricks; not a camera-centered scrolling clipmap. | Not a direct answer to a clipmap requirement. |
| `Engine/Shaders/GlobalIllumination/SignedDistanceConeIllumination.slang` | Six-cone sky visibility compute; it has no general card/surfel surface-radiance cache. | Not suitable as proof of emissive/point/sun surface-cache GI. |
| `Engine/Shaders/GlobalIllumination/OctahedralIrradianceLattice.slang` | DDGI-style lattice has separate limitations and was not engine-wired in this checkout. | Do not present it as an installed production replacement. |
| `Experimental/DeterministicPathTracer/` | WebGPU/WGSL experimental tracer with its own validation material; not a C++ Vulkan engine hook. | Do not copy it and assert C++ integration. |
| Upstream `WorldRenderEngineUnificationPlan.md` | Explicitly identifies shortcomings in SDF shadows, current SDF GI, and absent C++ path-trace integration. | The right action is a measured replacement path, not a false claim that the old code is correct. |

## Architecture of the CPU reference

```text
Static analytic room
  -> Float32 static 128³ level 0 / 1 / 2 clipmaps
  -> tri-linear first-containing-level sample

Moving vehicle transform
  -> inverse yaw into vehicle-local coordinates
  -> exact local body and wheel SDF union

static clipmap union local vehicle SDF
  -> surface normal / SDF visibility / penumbra diagnostic
  -> 16 deterministic Sobol hemisphere cone accessibility
  -> finite-area surface-card radiance gather
  -> direct + indirect controlled capture
```

- **Static data:** three 128³ Float32 clipmap levels. The CPU reference bakes them once for the gallery anchor.
- **Moving data:** vehicle SDF is never written into the static clipmap. It is composed locally at each query, then one dynamic vehicle card is transformed/reinjected.
- **Cache:** four floor cards, three wall cards, one ceiling emitter, and one vehicle card. Splitting the floor is necessary: a single centre card was entirely shadowed by the moved vehicle and made sun injection falsely disappear. The final proof keeps the corrected split cards.
- **Color space:** radiance calculations remain linear RGB. Only PPM output applies ACES fitted tone mapping followed by sRGB transfer. The direct use of arbitrary radiance proxy numbers is not physical calibration.
- **Path reference:** fixed 16 Sobol directions are evaluated for the second diffuse bounce at every primary hit. This removes random noise without using a denoiser, but it is finite deterministic quadrature and therefore not a complete unbiased general path tracer.

## Scope of the speed claim

The `9,544×` result is valid only for a moving-object **distance-maintenance update**:

1. Baseline: recompute every sample of all three 128³ static-plus-vehicle volumes.
2. New reference: leave static clipmaps unchanged, transform the local vehicle SDF, and reinject its card.

This is an apples-to-apples proof that local composition avoids rebaking 6,291,456 volume samples per vehicle update. It does **not** prove a faster full CPU renderer, GPU renderer, 60 FPS, 120 FPS, or any named GPU result. The actual combined CPU image time is `3.269 s`, and the path reference is `20.906 s`; neither is realtime.

## Remaining production requirements

| Requirement | Proper solution | Evidence still required |
|---|---|---|
| GPU clipmap | Vulkan `R16_SFLOAT`/`R32_SFLOAT` 3D image clip levels, scroll slabs, sparse residency where supported, compute raster/voxelization into static levels | RenderDoc resource inspection, barriers, GPU timestamps, vendor captures |
| Dynamic objects | Per-object local SDF atlas or mesh BVH ray query; refit or rebuild only changed objects; conservative union with static clipmap | Moved-vehicle shadow/GI ground-truth images and dynamic update timing on target GPU |
| Surface cache | Automatic surfel/card placement, visibility, normal cones, radiance cache invalidation, temporal stability management | Cache occupancy, invalidation, emissive light transport, leak and seam test suite |
| Soft shadows | Depth/PCSS or ray-query soft shadows for direct lighting; retain SDF cones only as explicitly bounded fallback/diagnostic | Contact, thin occluder, large-area source, acne/peter-pan, and moving-caster test images |
| DDGI | Probe relocation, classification, octahedral irradiance and depth moments, leak prevention, scroll/cascade updates | Leak-box, thin-wall, dynamic emissive, and probe-debug captures |
| Path tracing | GPU wavefront MIS/NEE integrator, proper light sampling, BSDF sampling, robust ray offsets, convergence error reporting | Reference comparison, convergence plots, exact deterministic contract, firefly statistics without a denoiser |
| Realism | Measured scene scale, physical camera exposure, HDR environment, calibrated materials, real reference capture | Side-by-side controlled photograph and error metric; none exists here |
| Performance | GPU timestamps and CPU submission profiling at both 60 and 120 Hz | Target-GPU p50/p95/p99 frame-time reports and capture traces |

## Files retained for review

| Path | Purpose |
|---|---|
| `Engine/DistanceFieldSpace/ClipmapSurfaceCache.h` | C++ data layout and public operations |
| `Engine/DistanceFieldSpace/ClipmapSurfaceCache.cpp` | C++ static clipmap bake, local SDF, card injection, SDF penumbra |
| `Exhibits/ClipmapLighting/ClipmapLightingValidation.cpp` | Deterministic CPU scene, tests, PPM renderer, metrics writer |
| `Exhibits/ClipmapLighting/CMakeLists.txt` | Rebuild description |
| `Exhibits/ClipmapLighting/Proof.html` | Browser proof page |
| `Exhibits/ClipmapLighting/Output/` | Final PNGs, GIF, metrics JSON |
