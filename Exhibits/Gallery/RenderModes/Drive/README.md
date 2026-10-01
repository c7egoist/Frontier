# Project-Drive — the three render modes

Three GIFs of the same car, on the same course, under the same sun, on the same camera orbit. The **only**
thing that changes between them is how light is carried.

| artefact | GI | RT | what is actually running |
|---|---|---|---|
| `..._VisibilityRaster_CPU_Reference.gif` | off | off | `Engine/GeometricRaster/VisibilityRaster` |
| `..._ReSTIR_DirectOnly_CPU_Reference.gif` | off | **on** | `MaterialLevelViewport --restir --bounce 1` |
| `..._ReSTIR_GlobalIllumination_CPU_Reference.gif` | **on** | **on** | `MaterialLevelViewport --restir --bounce 4` |
| `..._ReferencePathTracer_CPU_Reference.png` | — | — | the same host with no `--restir`: the oracle |

## There is no Surfel GI in Frontier

A `SurfelReference.cpp` lived in the Project-Drive overlay and was published here as the "GI on" column.
Grepping the entire pinned engine for `surfel` returns only coincidental bytes inside `.blend` archives — no
shader, no header, no dispatch, nothing. **It mirrored nothing**, which makes it exactly the self-invented
renderer the project rules forbid, and it is why its output never looked like the rest of the engine.

Frontier expresses global illumination through `DispatchFeatureGlobalIllumination` and
`ReSTIRIntegratorConfiguration::MaxGiBounces`, and the CPU mirror exposes precisely that as `--bounce`
(`MaterialLevelViewport.cpp:2538` — `if (Bounces > 1) Indirect += Radiance(...)`). So GI on/off is now **one
estimator with the bounce count changed**, which is what the product actually does. The file has been deleted.

Measured on frame 0 of the turntable, mean pixel level in the shadowed underbody:

| | frame mean | shadowed underbody |
|---|---|---|
| raster (GI off, RT off) | 163.5 | 107.8 |
| ReSTIR, GI off | 156.7 | 90.8 |
| ReSTIR, GI on | 157.9 | **101.8** |

Indirect light lifts the shadowed underbody by **+12%** while barely moving the frame mean — which is the
signature of GI: it fills what the sun cannot reach and leaves lit surfaces alone.

All four are existing engine code executed on the CPU. Nothing here is a renderer written for the proof.
Regenerate with:

```
python3 Exhibits/Workbench/FrontierMirror/RunDriveRenderModes.py \
    --width 480 --height 270 --spp 8 --bounce 5 --frames 24 --fps 12 --reuse 12 --gi-frames 20
```

## Why the car is frozen

The turntable orbits a **stationary** car. These three artefacts exist to isolate light transport, so pose,
materials, sun and camera path have to be identical and the only free variable may be the transport. A driving
car would confound the comparison — and the two ray-traced hosts render the level's static pose anyway, so a
driving raster would not even be the same scene.

Proof that the vehicle actually drives is a **separate** set of artefacts in `Exhibits/Gallery/Drive/`
(`ChaseRun`, `TracksideRun`, `OrbitWhileDriving`, plus the telemetry graphs), where the motion gates apply.

## One material model

All three evaluate the **same** BSDF: the engine's OpenPBR lobe set from `Engine/Shaders/MaterialEvaluation.slang`,
reached through `Engine/ContentInterchange/UnifiedMaterialEvaluation.h`. Coat, metal flakes, thin film, fuzz,
transmission and the energy-compensation terms are identical in all three columns.

They did not used to be, and the comparison was invalid because of it:

| path | material model before |
|---|---|
| VisibilityRaster | hand-rolled Lambert + one GGX lobe, off `MaterialRecord`'s flattened 64-byte header |
| SurfelReference | a `switch` returning one flat RGB constant per family, shaded pure Lambert |
| MaterialLevelViewport | the real lobe set |

`VisibilityRaster.h` even documented its reduction as though it were a property of rasterisation
(*"direct-only lookdev PBR — Lambert plus a GGX"*). It never was. **Rasterisation decides how visibility is
resolved; it places no constraint on which BSDF you evaluate once a pixel knows its triangle.** A raster path
can evaluate the full lobe set, and now does.

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
