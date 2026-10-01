# Project-Drive — the three render modes

Three GIFs of the same car, on the same course, under the same sun, on the same camera orbit. The **only**
thing that changes between them is how light is carried.

| artefact | GI | RT | what is actually running |
|---|---|---|---|
| `..._VisibilityRaster_CPU_Reference.gif` | off | off | `Engine/GeometricRaster/VisibilityRaster` |
| `..._SurfelGI_CPU_Reference.gif` | **on** | off | `Project-Drive/Source/SurfelReference` — surfel indirect + sky reflections |
| `..._ReSTIR_DirectOnly_CPU_Reference.gif` | off | **on** | `MaterialLevelViewport --restir --bounce 1` |
| `..._ReSTIR_GlobalIllumination_CPU_Reference.gif` | **on** | **on** | `MaterialLevelViewport --restir --bounce 4` |
| `..._ReferencePathTracer_CPU_Reference.png` | — | — | the same host with no `--restir`: the oracle |

These are the four cells of the mode matrix in `RaytraceToggle/README.md`:

| Raytracing | Global Illumination | render path |
|---|---|---|
| ON | on or off | raytraced ReSTIR kernel |
| OFF | **ON** | **Surfel GI** — visibility-raster primary + surfel indirect |
| OFF | OFF | plain visibility raster |

## Correction: I previously deleted the Surfel GI and called it invented

An earlier pass grepped the *pinned Frontier checkout* for `surfel`, found nothing, and concluded the path was
a self-invented renderer. That was wrong, and the conclusion was drawn from the wrong place. Surfel GI is a
**Slate feature awaiting upstream integration**, and it has real GPU shaders here in the repo:

- `RaytraceToggle/Shaders/SurfelIrradianceUpdate.slang` — per-surfel temporal irradiance update
- `RaytraceToggle/Shaders/SurfelGIResolve.slang` — per-pixel resolve
- `RaytraceToggle/Shaders/SurfelCommit.slang`
- `RaytraceToggle/CpuMirror/ModeMatrix.cpp` — the proven CPU mirror of all three modes
- `RaytraceToggle/Patches/RaytraceToggle_Integration.patch` — the engine wiring

It is absent from the pinned checkout only because the patch has not landed upstream yet. The file is restored.

## What was actually wrong with it

`SurfelReference.cpp` had drifted from `SurfelGIResolve.slang` in four ways, which is why it looked wrong on
the vehicle while looking acceptable on a large flat floor:

| | shipped shader / ModeMatrix | Drive copy (before) |
|---|---|---|
| surfel radius | `clamp(0.055 × distance_to_eye, 0.22, 0.70)` | **fixed `0.9f`** — a stub |
| planar cutoff | `abs(dot(d, s.n)) < r × 0.5` | **absent** |
| distance falloff | `(1 − dist/r)²` | `(1 − dist/r)` |
| spawning | coverage-driven, warm-started | 4% of pixels, fixed 0.75 m dedupe |

The missing **planar cutoff** is the one that matters most: without it a surfel lying on the ground lights a
point on the car's flank merely because the two are within a radius of each other. A floor has no neighbouring
surface at a different orientation to leak from, which is exactly why the floor looked fine. The fixed 0.9 m
radius compounded it — one footprint that size blankets a 4.4 m car in a handful of surfels.

All four now match the shader. Surfel count over the same frame went from ~2,000 to 14,651.

## What to look for

The raster has no indirect light: everything out of the sun's reach falls back to the sky-ambient term, which is
a cosine-weighted 8-sample estimate of the environment response rather than a traced bounce.

Surfel GI adds the bounced term only — note the light that fills the wheel arches and the underbody, and the
colour bleed from the paint onto the ground.

ReSTIR adds the traced direct term with reservoir resampling. It converges through **temporal reuse**, not
sample count: one frame of reservoirs is one candidate per pixel however high `--spp` goes, which is why each
frame here is accumulated over 12 frames of reuse rather than rendered as a one-shot estimator.

## Honest limits

- The GIF palette is 256 colours. The flake sparkle and the clearcoat gradient are quantised; the oracle PNG is
  the artefact to judge material quality from.
- ReSTIR is 8 spp × 12 reuse frames. It is not converged, and it is not meant to be — it is the real-time path.
  The path-traced PNG at 64 spp is the reference it should be compared against.
- `SurfelGI_timing.log` carries the surfel count and the per-stage millisecond split for the last frame.
