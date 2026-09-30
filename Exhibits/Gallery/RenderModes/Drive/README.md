# Project-Drive — the three render modes

Three GIFs of the same car, on the same course, under the same sun, on the same camera orbit. The **only**
thing that changes between them is how light is carried.

| artefact | GI | RT | what is actually running |
|---|---|---|---|
| `ProjectDriveRenderMode_VisibilityRaster_CPU_Reference.gif` | off | off | `Engine/GeometricRaster/VisibilityRaster` |
| `ProjectDriveRenderMode_SurfelGI_CPU_Reference.gif` | **on** | off | `Projects/Project-Drive/Source/SurfelReference` |
| `ProjectDriveRenderMode_ReSTIR_CPU_Reference.gif` | **on** | **on** | `Projects/Project-Zero/Host/MaterialLevelViewport --restir` |
| `ProjectDriveRenderMode_ReferencePathTracer_CPU_Reference.png` | — | — | the same host with no flag: the oracle |

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

## What to look for

The raster is documented at `VisibilityRaster.h:6` as *direct-only lookdev PBR — Lambert plus a GGX*. It has no
`CoatWeight`, no `GlintDensity`, no `TransmissionWeight`. It **structurally cannot** show the flake paint, the
clearcoat or the glass, and it has no indirect light at all: everything out of the sun's reach goes black.

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
