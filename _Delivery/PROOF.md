# Frontier — rendering proof

Everything under `proof/` was produced in this sandbox by CPU reference programs that read the
project's own headers. **Open `proof/index.html`** for the browsable version. This file is the
plain-text index: what is there, what it does and does not prove.

Branch base: commit `1784c86` of `SultanAladin/Frontier-` (the commit before `3e45285`).

---

## 0. The honesty box — read this first

| | |
|:---|:---|
| **What these pixels are** | CPU reference renders. The GPU side of the pipeline is *simulated on the CPU*. |
| **What they are not** | Screenshots of the Vulkan app. There is no GPU and no Windows here. |
| **`Project-Zero/SDF-GI/`** | A faithful CPU mirror of the real four-pass Distance Field GI pipeline (§1). Read §1 before trusting any other SDF image in this document. |
| **`Project-Zero/pathcompare_reference/`** | The project's *own* CPU ReSTIR path tracer (`Project-Zero-CpuReference`) plus a hand-written reference. Proves the **scene, lighting and integrator**. Does **not** exercise the Vulkan passes. |
| **`Project-Zero/pathcompare_raster/`** | A z-buffer mirror of the raster path with the engine's light list. The scene and camera are the project's; the rasteriser and the surface shading are mine. |
| **Project-Drive** | Course from `DriveCourse.h::EmitCourseTriangles`, body/rim/tyre from the generated `ControlVehicle*.inl`, every pose from the real `VehicleSolver`. **Geometry, layout and dynamics are the project's own; surface shading is mine.** |
| **The code fixes** | Still **GPU-unverified**. Compile/syntax-checked only, plus the CPU references below. |

### A correction, up front

In the previous drop I presented three Project-Zero paths — `reference`, `sdf` and `raster` — and
called the middle one "the SDF GI path". **That was wrong.** It cast camera rays through a path tracer
and used the distance field only for a sun-shadow and a sky term. It was a path tracer that happened to
touch an SDF. You were right to call it out: it looked ray traced because it was ray traced.

Those images have been **deleted** from `proof/` (the folder `Project-Zero/SDF-GI/` is gone). What replaces
them is §1: a line-by-line CPU translation of the four passes the engine actually records.

---

## 1. Distance Field GI — the real pipeline, mirrored on the CPU

### 1.1 What the engine actually does

`Plans/Ongoing/SwapSurfelGIWithDistanceFieldGI.md` puts render mode 1 this way:

| | mode 1: Distance Field GI |
|:---|:---|
| Primary visibility | **mesh rasterization** |
| Diffuse indirect GI | **surface cache over cascaded distance fields** |
| Direct shadows | **monotone k·H/t contact soft shadows** |
| Specular | raytraced BVH or sky |
| RT cores | **not used** |

That is Lumen-for-GTX: a raster G-buffer, a surface cache of cards, and software sphere-marching
through distance fields for the diffuse bounce. **No path tracing.** Four compute passes, in order:

| pass | shader | what it does |
|:---|:---|:---|
| 0 | `DistanceFieldCapture.slang` | one **surface card** per triangle — albedo, normal, coverage, emission |
| 1 | `DistanceFieldRadiance.slang` | **Jacobi propagation** over the card atlas: direct sun + previous frame's indirect, mixed at 0.25 |
| 2 | `DistanceFieldGather.slang` | per G-buffer pixel: hemisphere rays **marched through the composed local distance fields**, refined against the exact triangle BVH, **MIS** between cosine and card-area sampling → incident irradiance |
| 3 | `DistanceFieldGIResolve.slang` | 7×7 bilateral irradiance reconstruction + direct light + tonemap |

Primary visibility comes from a **z-buffer over the live triangles**. The baked facets are used only
for the cards and for exact queries. That split is the whole design.

### 1.2 The mirror

`Projects/Project-Zero/Source/SdfGiPipelineMain.cpp` (`make sdfgi`).

**Translated line by line from the Slang:**

- `SampleSceneDistance` → `DistanceAtlasSpace::Sample`, the engine's *own* transformed-local-field
  composition. A moving instance rewrites only its world→local rows via `Atlas::Project`.
- `DistanceShadow` → hard umbra from the exact facet BVH; otherwise a 48-step march through the composed
  field with the engine's monotone `max(H − 0.25·Cell, 0) / (Softness·Travel)` penumbra.
- `GatherDistanceRadiance` → 32 samples (16 in the radiance pass), 48-step sphere march, exact
  refinement when `Distance < Cell·0.7`, sky on escape, fallback exact trace on exhaustion, and the
  **balance heuristic** between the cosine and card-area PDFs.
- `SelectRadianceFacet` → the engine's preorder BVH solid-angle walk (`BranchSolidAngle` /
  `FacetSolidAngle` / `RadianceDirectionDensity`).
- cards → the engine's **square-to-triangle warp** (`CardPosition` / `CardCoordinate`) and its 4-tap
  bilinear `SampleCachedRadiance`.
- `InstanceMoved` masking → a moved instance's baked facets are excluded from **every** exact query, so
  it can only shade through the field. That is the engine's rule, and it is visible in the output.
- temporal accumulation → the radiance pass mixes at 0.25 per frame, so GI converges over frames.
- `ReconstructIrradiance` → 7×7, alignment³², plane tolerance, `exp(−d²/8)`.

**Simplified (and this is *not* the transport):** the material. The engine decodes authored OpenPBR
slabs through `MaterialEvaluation.slang`; here a surface is a Lambert diffuse term plus a Schlick/GGX
lobe. The **light transport** is the engine's; the **BRDF is a stand-in**.

### 1.3 The scene

An **open-topped courtyard** (floor + four walls, no ceiling — with a ceiling, `DistanceShadow` returns
0 everywhere because the exact BVH always finds the lid), lit by a sun and one emissive wall strip.
Three instances: the room (static), a **sphere that orbits**, and a **box that spins and translates**.
The sphere rotates *and* translates, so the field is exercised by the full affine inverse, not just a
translation. 854 facets, cards at 8×8 = 54,656 card texels, 384×216, 16 frames.

### 1.4 Is it dynamic? The measurements

| | |
|:---|:---|
| distance field baked | **once** — 2,524,243 voxels, 10,096,972 bytes, 566 ms |
| bytes rewritten per frame, both objects moving | **336** (3 placements × 112 B) |
| `Atlas::Project()` per frame | **0.001–0.002 ms** |
| atlas FNV-1a checksum, all 16 frames | **`9af57a57398069d9`, identical in every frame** |
| `PlacementRevision` over 16 frames | 2 → 3 → … → **17** (increments every single frame) |
| `MovedInstances` | **2** (the sphere and the box; the room stays at its baked pose) |

The volume bytes never change; only the 3×112-byte placement rows do. That is the "baked once, only
transformed locally" requirement, measured rather than asserted.

**The negative control — `frozen`.** Identical in every respect except `Atlas::Project()` is never
called. The live geometry still moves, so the objects are visibly in motion, but the field stays at the
baked pose: `PlacementRevision` stays at **1**, `MovedInstances` stays at **0**.

| | dynamic | frozen | GI off |
|:---|---:|---:|---:|
| **RMS on the floor vs a 4-bounce path trace** (mean of frames 0/4/8/12) | **0.1304** | 0.1856 | 0.1956 |
| **mean \|luminance change\| between frames**, floor pixels that are *never occluded* by an object | **0.01044** | 0.00170 | 0.01215 |
| ratio of that change to frozen | **6.1×** | 1.0× | 7.1× |

The second row is the one that matters. Restricted to floor pixels no object ever slides across, the
only thing that can change a pixel is the light — and with the field re-placed the floor's shading moves
**6.1× more** than with the field frozen. The frozen residual (0.0017) is the card history still
converging, not the shadow moving.

Re-placing the field also makes the image **more correct**: floor RMS against the path-traced reference
drops from 0.186 to 0.130 (−30%).

### 1.5 Cost per frame

| stage | ms | note |
|:---|---:|:---|
| bake the distance field | **566** | **once**, never repeated |
| capture surface cards | 0.2 | once |
| `Atlas::Project()` | **0.001–0.002** | per frame, 336 bytes |
| build the live triangle list | 0.03–0.09 | per frame; this is a CPU-mirror artefact, the GPU reads the vertex buffer |
| radiance (54,656 card texels × 16 samples) | 940 | per frame |
| gather (82,944 px × 32 samples × ≤48 march steps) | 4,200 | per frame |
| resolve (7×7 bilateral) | 170 | per frame |

The gather dominates, exactly as it does on a GPU. None of these numbers say anything about GPU
performance — they are a single-thread-for-a-workgroup CPU mirror running on 8 cores.

### 1.6 Two bugs I hit while building this, both worth knowing about

1. **The indirect term was a factor of π too dark.** `GatherDistanceRadiance` averages incoming
   radiance over a *cosine-weighted* hemisphere, so it returns **E/π**, not E. The engine's resolve is
   `col += response · ReconstructIrradiance · Tuning.y` with no further 1/π. I divided by π a second
   time. Fixing it moved the whole-image RMS against the path trace from **0.264 → 0.121**. If
   `DistanceFieldGIResolve` ever gets a 1/π added there, it will be a π-too-dark regression.
2. **`DistanceShadow`'s penumbra keeps darkening as the ray marches.** The visibility estimate is
   `max(H − 0.25·Cell, 0) / (Softness·Travel)` where H is the field value. `Travel` keeps growing, so
   any geometry the ray *passes near* eventually darkens the receiver, even if it never blocks it — the
   cone test `Distance < Travel·Facing − 0.75·Cell` uses the **receiver's** facing term, which for a
   floor under a high sun is a >60° cone. Measured mean floor sun visibility, geometric truth ≈0.65:

   | `ShadowSoftness` (`Tuning.x`) | 0.01 | 0.05 | 0.18 | 0.50 | 1.00 |
   |:---|---:|---:|---:|---:|---:|
   | mean floor sun visibility | 0.92 | 0.89 | 0.79 | 0.62 | 0.56 |

   The host clamps `Tuning.x` to ≥0.01 (`DistanceFieldGIStage.cpp:388`) with no documented upper bound,
   so a soft-shadow setting above ~0.2 will over-darken. The clips in `SDF-GI/` were rendered at the
   clamp floor, 0.01 — see §1.8 for why that was the wrong choice and what it costs to undo it.

### 1.7 What this still does not show

- **A moved instance does not donate GI.** Its baked facets are masked from every exact query, so a
  moving object is lit *by* the scene's cards and it occludes, but it never bleeds its own colour onto
  anything. That is the engine's rule as written, faithfully reproduced — and it is why the moving
  sphere darkens the floor rather than tinting it. If you want moving objects to cast coloured bounce,
  the card/facet data has to be re-projected when an instance moves; the field alone cannot do it.
- **No textures, no normal maps, no OpenPBR.** Cards carry flat albedo.
- **CPU timings are not GPU timings.**

### 1.8 Why the shadows in those clips look banded — my control, not the pipeline

The engine ships `ShadowSoftness = 0.22f` (`Engine/DeviceExchange/DistanceFieldGIStage.h:56`). I rendered
everything at `0.01`, the clamp floor, because 0.01 minimised RMS against a path tracer whose sun is a
**mathematical point**. A point sun has no penumbra, so that objective rewards driving the penumbra to
zero width — and a zero-width penumbra is an aliased hard edge. The banding is the objective being wrong,
not the pipeline. There is also no denoise pass to have omitted: `DistanceFieldGIStage.cpp` records only
SdfCaptureCards → SdfRadiance → SdfGather → SdfResolve.

One run, one control changed (`/tmp/w/ge`, cards 4, warmup 24):

| `ShadowSoftness` | flat-plateau fraction of the sun-visibility buffer | pixels inside the 0.15–0.85 penumbra |
|:---:|:---:|:---:|
| **0.01** (what I shipped) | **0.911** | **3.8 %** |
| 0.08 | 0.852 | 5.1 % |
| **0.22** (engine default) | **0.742** | **16.0 %** |
| 0.45 | 0.698 | 22.9 % |

Flat plateau = adjacent pixels with an identical value. In the *rendered* frame over the 200×80 crop in
`proof/Project-Zero/12_sdfgi_banding.png`, the plateau fraction is 0.488 at 0.01, 0.150 at 0.22 and 0.076
in the path-traced reference. At 0.01 the visibility histogram is essentially two-valued.

`SDF-GI/enginedefault/` is the same 16-frame animation re-rendered at the engine's defaults — softness
0.22, cards 4, `GiBoost` 1.0 — with the penumbra intact.

**The honest cost.** Softening is not free, and it exposes the §1.6 bug rather than fixing it. Against a
path trace with a matched 12.4° cone sun (atan 0.22, `--suncone 12.4`), the field's mean floor luminance
is **0.621** where the reference is **0.773** — 20 % dark. At softness 0.01 the same figure is 0.686,
11 % dark. `DistanceShadow` builds its cone as `Softness × Travel`, so the softness knob controls the
*width* of the ramp and the *total* darkness at the same time; there is no setting that gets both right.
RMS against the point-sun reference, whole image: 0.141 at 0.01 vs 0.186 at 0.22.

That coupling is worth a follow-up fix in `DistanceFieldTransport.slang:158` — normalise the ramp so
softness sets the penumbra width without moving the mean — rather than leaving 0.01 in place, which was
cancelling the width error against the darkness error.

---


## 2. Project-Zero ReSTIR reference — 38 renders

`bin/Project-Zero-CpuReference`, showcase scene (soil plain, 100 analytical shapes, sunset sky, moon,
stars, clouds, ground mist). Sets: `turntable/` 16 yaws, `sun_sweep/` 13 sun hours, `quality/` 6-step
ladder, `fog/` 3 variants. Raw numbers in `Project-Zero/rendertimings.csv` (38 rows).

| viewport | bounces | spatial passes | wall |
|:---|:---:|:---:|---:|
| 320×240 | 4 | 1 | 1.02 s |
| 320×240 | 8 | 2 | 1.27 s |
| 640×480 | 4 | 1 | 4.14 s |
| 640×480 | 8 | 2 | **4.80 s** |
| 960×540 | 8 | 2 | 8.46 s |
| 1280×720 | 8 | 2 | 15.17 s |

Pixel sanity: mean luminance 0.68 at noon → 0.50 at sunset → 0.15 at 21:00; 59,050 unique colours.

---

## 3. Project-Drive — the reference drive

`DriveTelemetry` (unchanged from the repo), 12 s at 240 Hz:

```
steps 2880   wall 26,989 ms   physics/step 9,361.91 us   realtime factor 0.4x
peak speed 36.47 m/s (131.3 km/h)   takeoff 11.18 m/s   airborne 0.58 s
max suspension travel 0.517 m   min chassis up 0.947   final X 184.0 m
```

**9.36 ms per 240 Hz step against a 4.17 ms budget.** The XPBD soft-tyre solver cannot hold that rate
on one core — part of why the live `Play` path is starved. Graphs `Project-Drive/01..04_*.png`,
raw data `Project-Drive/telemetry.csv` (720 rows × 64 columns).

---

## 4. The vehicle tumble, and what the tyres actually did

`DriveRender` gained `--tumble`: the scripted drive runs unchanged until **t = 4.30 s**, where the car
leaves the ramp at **11.26 m/s** and body rates **(roll 2.5, pitch −7.0, yaw 1.2) rad/s** are injected.
A **control run** (identical drive, no spin) is included, and the solver is deterministic — two runs
produce byte-identical CSVs.

Clips: `Project-Drive_tumble_closeup` (60 fps, 640×360 — the one to watch), `_tumble_fixedcam`,
`_tumble_chase`, and `_control_fixedcam`.

### The peak step (tumble, wheel 2 = RL, t = 4.4792 s)

```
nodes in contact          407
deepest penetration       0.156 m      (tyre radius is 0.5086 m — 31% of it)
rim-flange arrival        0.159 m      (the tyre is bottomed out on the rim)
sidewall radial residual  0.134 m      (0.006 m at rest)
sidewall shear residual   0.241 m      (0.0015 m at rest)
reaction Fz               998,389 N    = 313x the static wheel load of 3.19 kN
max |contact lambda|      0.0016       -> lambda/h^2 ~ 5.9 kN per node, h = 1/(240*8) s
```

### What that says about the XPBD bug

The per-node XPBD multiplier stays tiny (λ = 0.0016). With h = 1/(240 × 8 substeps) = 5.2 × 10⁻⁴ s,
λ/h² ≈ 5.9 kN **per node** — and it is summed over ~400 contact nodes with **no clamp**. That is where
998 kN comes from, not from a single bad constraint. This is the mechanism behind the code finding
reported earlier (`XPBDSoftTyre.cpp:505-525` sums raw λ/h² with no clamp), now measured rather than
read out of the source. `VehicleSolver.cpp:245/481` then takes `max(0, reaction.Force.z)` and applies
that to the chassis — which is the launch.

The **control** run, with no forced spin at all, still peaks at **29.7 kN = 9.3× the static wheel load**
at t = 4.571 s on the FR wheel. So the spike is not an artefact of my tumble; the tumble just makes it
300× worse.

### Two things I had to correct while measuring

1. An earlier version of this CSV had a **corrupt header** (a varargs column-name bug), which made
   `w2_deepest_penetration_m` read shifted data and report "205 m of penetration" and a 42 kN peak.
   Those numbers were wrong. The header is now generated in a loop, the sim is confirmed
   deterministic, and the figures above are from a clean run.
2. I initially thought I had found a second bug — "deepest penetration" growing while the car was
   airborne. That was the same corrupt header. In a clean run, penetration while airborne is exactly
   0.0000 m. **There is no such bug**; I am not claiming one.

### Files

- `Project-Drive/tyres_tumble.csv`, `tyres_control.csv` — 1,920 rows × 77 columns, 240 Hz, per wheel:
  contact nodes, max contact λ, penetration, all five constraint-family residuals, rim arrival/residual,
  reaction Fx/Fy/Fz, inflation force, gauge pressure, hub Z, wheel ω, patch centre.
- `Project-Drive/05_tyre_force_spike.png`, `06_tyre_carcass_residuals.png`, `07_tyre_peak_and_artefact.png`.

---

## 5. Animations

| file | frames | fps | size |
|:---|:---:|:---:|---:|
| `Project-Drive/Project-Drive_tumble_closeup.gif` / `.mp4` | 231 | 60 | 2.1 MB / 2.6 MB |
| `Project-Drive/Project-Drive_tumble_fixedcam.gif` / `.mp4` | 126 | 30 | 1.7 MB / 1.3 MB |
| `Project-Drive/Project-Drive_control_fixedcam.gif` / `.mp4` | 126 | 30 | 1.6 MB / 1.1 MB |
| `Project-Drive/Project-Drive_chase.mp4` | 72 | 6 | 2.1 MB |
| `Project-Drive/Project-Drive_orbit.mp4` | 48 | 6 | 1.5 MB |
| `Project-Drive/Project-Drive_trackside.mp4` | 36 | 4 | 0.8 MB |
| `Project-Zero/SDF-GI/Project-Zero_sdfgi_dynamic.gif` / `.mp4` | 16 | 8 | 0.39 MB / 0.07 MB |
| `Project-Zero/SDF-GI/Project-Zero_sdfgi_frozen.gif` / `.mp4` | 16 | 8 | 0.32 MB / 0.04 MB |
| `Project-Zero/SDF-GI/Project-Zero_sdfgi_nogi.gif` / `.mp4` | 16 | 8 | 0.14 MB / 0.06 MB |
| `Project-Zero/SDF-GI/enginedefault/Project-Zero_sdfgi_enginedefault.gif` / `.mp4` | 16 | 8 | 0.41 MB / 0.05 MB |
| `Project-Zero/Project-Zero_raster_turntable.gif` / `.mp4` | 12 | 7 | 0.15 MB / 0.02 MB |
| `Project-Zero/Project-Zero_turntable.gif` / `.mp4` | 16 | 8 | 0.8 MB / 0.2 MB |
| `Project-Zero/Project-Zero_timeofday.gif` / `.mp4` | 13 | 4 | 0.8 MB / 0.2 MB |

Every frame of every clip is an independent full render. Nothing is interpolated.

---

## 6. Still not fixed

1. ~~`Play` still rebuilds the scene every frame (`ProjectDriveInterchange.cpp` bumps `GeometryRevision`
   each tick → `RefreshGeometry` + `BuildBottomLevel` + `UploadScene`, which calls `vkDeviceWaitIdle`).~~
   **FIXED — see §7.** Play now refits; only a topology change rebuilds. Verify with the
   `[Playback] transport stopped: refit steps … rebuild steps …` line.
2. The XPBD force blow-up above. The measurement is now in place; **the fix is not written**.
3. F8 eject — unimplemented.
4. SolidArc B/C bevel/fillet/chamfer still take the fixed 0.1 radius.
5. SolidArc is a standalone Win32 host; in-process hosting inside `Frontier.exe` is not done.

---

## 7. Play no longer rebuilds the scene every step

### 7.1 What was wrong

`FrontierRuntime.cpp` published one deforming physics step with the load-time path:

```
Level.RefreshGeometry(AnimatedInstances);
TracedFacets = Level.QueryFlatTriangles();
Traversal.BuildBottomLevel(TracedFacets, false);        // binned-SAH rebuild of the whole scene
Surface.UploadScene(Level, Traversal, nullptr, "play: project geometry deformed (tyres), every step");
```

`UploadScene` waits for the device to go idle, reallocates and re-uploads every scene extent
(vertices, indices, instances, clusters, materials, luminaires, flat triangles), rebuilds the emitter
cache, reconstructs the hardware BLAS and TLAS, rewrites the descriptor sets and re-examines the
distance atlas. At one call per 240 Hz step that is a reload, not an update.

The trigger is real: `ProjectDriveInterchange::CaptureSurfaces` bumps `GeometryRevision` every tick
because the XPBD tyres genuinely deform. But `GeometrySequence::Advance` **refuses any step that
changes a vertex count, an index count or an index value** — so the resident structures stay valid
across the step and only need refitting. The rebuild was never necessary.

### 7.2 What it does now

```
if (Traversal.IsRefittable() && Traversal.RefitBottomLevel(TracedFacets) &&
    Surface.RefreshDeformation(Level, Traversal, TracedFacets, rows, count))
        ++PlaybackRefitSteps;                       // cheap path
else if (!Traversal.IsRefittable() || !Traversal.BuildBottomLevel(TracedFacets, false))
        break;                                      // nothing can be published
else  { ++PlaybackRebuildSteps; Surface.UploadScene(..., "play: project geometry rebuild (refit refused or topology moved)"); }
```

`SwapchainExchange::RefreshDeformation` is four no-reallocation stages:

| ① | `VisibilityExchange::RefreshDeformation` | deformed vertices, cluster bounds and flat triangles, memcpy'd into the extents `UploadScene` already allocated |
| ② | `RefreshTraversal` | the refitted CWBVH blobs, plus the flat triangles again — now through `UploadTrianglesInPlace`, so no `vkDeviceWaitIdle` and no descriptor rewrite |
| ③ | `RefreshInstances` | instance rows, distance-atlas placements, hardware placement rows |
| ④ | `RayQueryExchange::RefreshVertices` | stages the deformed vertices; `RecordRefit` then issues a `MODE_UPDATE` build of the bottom levels inside the frame's command buffer |

Deliberately absent: `UploadTextures` and `UploadMaterials` (a deformation moves no reflectance), the
emitter-cache rebuild, the distance-atlas topology test, and `vkDeviceWaitIdle` (nothing here destroys
a handle, so nothing has to drain the device).

`RayQueryExchange` gains `VK_BUILD_ACCELERATION_STRUCTURE_ALLOW_UPDATE_BIT_KHR` on the bottom-level
builds, a persistent host mapping of the vertex extent, and a `MODE_UPDATE` arm in `RecordRefit`. A
purely rigid step leaves `VerticesPending` clear and pays only the TLAS refit it always paid.

### 7.3 Bake once, rebuild only when topology moves

The distance atlas was already correct — `DistanceFieldStructure::Matches` is a count comparison and a
deformation cannot move a count — but the trigger is now logged, so an editor rebuild is visible:

```
[SdfGI] UploadScene: topology unchanged ('<trigger>'), atlas kept (bakes so far: 1)
[SdfGI] UploadScene: topology changed ('<trigger>'), baking the atlas (bake #1)
[SdfGI] bake finished in 566 ms; voxels=2524243 placements=3
```

### 7.4 How to verify on hardware

Stop the transport and read one line:

```
[Playback] transport stopped: refit steps 1440, rebuild steps 0, worst traversal refit 7.46 ms,
           UploadScene calls over the session 1, distance-field bakes 1
```

`rebuild steps 0` and `distance-field bakes 1` is the pass condition.

### 7.5 What is proven here, and what is not

| | |
|:---|:---|
| **Proven** | Every changed file compiles. `VisualProof/DistanceAtlas/DistanceAtlasChecks.cpp` now asserts that deforming vertices never re-bakes the atlas — `ALL PASSED (0 failures)`, 9 checks. |
| **Not proven** | Anything on the GPU. The refit path is compile-checked only; the numbers above have to come from your 9060 XT. |

### 7.6 Known limitation this exposes

The distance field is a **rest-pose snapshot**. A deforming tyre is refitted in the raster path, the
traversal and the hardware acceleration, but its voxels still describe the pose that was baked — the
same limitation §1.7 records for moving instances. Making the field follow a deformation means
re-voxelising it, which is exactly the per-frame rebuild this section removes.
