# Frontier — rendering proof

Everything under `proof/` was produced in this sandbox by CPU reference renderers that read the
project's own headers. **Open `proof/index.html`** for the browsable version. This file is the
plain-text index: what is there, what it does and does not prove.

Branch base: commit `1784c86` of `SultanAladin/Frontier-` (the commit before `3e45285`).
Working tree: `work` branch.

---

## 0. The honesty box — read this first

| | |
|:---|:---|
| **What these pixels are** | CPU reference renders. The GPU side of the pipeline is *simulated on the CPU*, exactly as you asked. |
| **What they are not** | Screenshots of the Vulkan app. There is no GPU and no Windows here, and there never was. |
| **Project-Zero ReSTIR stills** | The project's *own* CPU ReSTIR path tracer (`bin/Project-Zero-CpuReference`). Same scene, sky, fog, ReSTIR DI + GI. Proves the **scene, lighting and integrator**. Does **not** exercise the Vulkan passes. |
| **Project-Zero raster + SDF stills** | New `bin/Project-Zero-PathCompare`, a CPU mirror of the three paths (see §1). The **scene, camera and light directions are the project's**; the rasteriser and the SDF march are mine, and the surface shading is my path tracer, **not** the engine's material model. |
| **Project-Drive** | Course from `DriveCourse.h::EmitCourseTriangles` (the very emitter the render side uses), body/rim/tyre from the generated `ControlVehicle*.inl`, every pose from the real `VehicleSolver`. **Geometry, layout and dynamics are the project's own; surface shading is mine.** |
| **The code fixes** | Still **GPU-unverified**. Compile/syntax-checked only, plus the CPU references below. |

---

## 1. The three render paths, side by side (new)

`Projects/Project-Zero/Source/PathCompareMain.cpp` renders the **same scene from the same camera**
through each path the engine can take:

| path | how it works |
|:---|:---|
| `reference` | primary ray + exact ray-traced sun shadow and one cosine bounce — the ground truth for the diff metric |
| `sdf` | primary ray; **sun shadow and sky/GI marched through the baked `DistanceAtlasSpace` volume** |
| `raster` | z-buffer over the same triangles; sun + moon + the first N emissive triangles; **one coarse 256×256 sun shadow map stretched over 480 m**; flat ambient, no GI |

### Accuracy against the reference (RMS over RGB, 0 = identical)

| scene | sun hour | viewport | sdf vs reference | raster vs reference |
|:---|:---|:---|---:|---:|
| showcase | 08:00 | 640×360 | **0.903** | 1.263 |
| showcase | 12:00 | 640×360 | **1.113** | 1.772 |
| showcase | 17:93 | 640×360 | **0.087** | 0.137 |
| showcase | 20:00 | 640×360 | **0.081** | 0.109 |
| Cornell box | 12:00 | 480×270 | **3.329** | 4.286 |

The SDF path is closer to the reference than the raster path **in every case**. The Cornell box is the
worst case for both — it is a closed room with no sky, so a path without GI has nothing to fall back on
(raster mean luminance 0.768 against reference 0.425: the flat ambient leaks light everywhere).

### Cost of each path (showcase, 640×360, 2 spp)

| stage | ms |
|:---|---:|
| bake the distance atlas (once, 1.75 M voxels at 0.157 m) | ~490 |
| `raster` | ~20 |
| `sdf` (6–10 M distance samples) | ~1,200 |
| `reference` (exact ray tracing) | ~1,600 |

The raster path is ~60× cheaper than the SDF path and ~80× cheaper than the reference on the CPU.
That cost gap is the whole reason the engine offers it — and the quality table above is what you pay.

### The raster light list, measured not asserted

The showcase scene contains **0 emissive triangles** and the outdoor scene **0**; the Cornell box
contains **2**. So on Project-Zero's own CPU scenes the raster path is lit by sun + moon + flat
ambient only. (The 1,642-emissive-triangle figure reported earlier came from the live app's scene,
which is not in this checkout — I cannot measure it here, and I am not going to pretend I did.)

### The baked field

`proof/Project-Zero/sdf/*_sdfslice.png` is a slice through the baked volume, so the field the SDF GI
marches can be looked at rather than taken on trust.

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
| `Project-Drive/Project-Drive_tumble_closeup.gif` / `.mp4` | 231 | 60 | 4.7 MB / 2.6 MB |
| `Project-Drive/Project-Drive_tumble_fixedcam.gif` / `.mp4` | 126 | 30 | 7.2 MB / 1.3 MB |
| `Project-Drive/Project-Drive_tumble_chase.gif` / `.mp4` | 126 | 30 | 5.1 MB / 1.0 MB |
| `Project-Drive/Project-Drive_control_fixedcam.gif` / `.mp4` | 126 | 30 | 6.9 MB / 1.1 MB |
| `Project-Drive/Project-Drive_chase.gif` / `.mp4` | 72 | 6 | 1.9 MB / 2.1 MB |
| `Project-Drive/Project-Drive_orbit.gif` / `.mp4` | 48 | 6 | 1.6 MB / 1.5 MB |
| `Project-Drive/Project-Drive_trackside.gif` / `.mp4` | 36 | 4 | 0.7 MB / 0.8 MB |
| `Project-Zero/Project-Zero_sdf_turntable.gif` / `.mp4` | 12 | 7 | 0.9 MB / 0.2 MB |
| `Project-Zero/Project-Zero_raster_turntable.gif` / `.mp4` | 12 | 7 | 0.15 MB / 0.02 MB |
| `Project-Zero/Project-Zero_turntable.gif` / `.mp4` | 16 | 8 | 0.8 MB / 0.2 MB |
| `Project-Zero/Project-Zero_timeofday.gif` / `.mp4` | 13 | 4 | 0.8 MB / 0.2 MB |

Every frame of every clip is an independent full render. Nothing is interpolated.

---

## 6. Still not fixed

1. `Play` still rebuilds the scene every frame (`ProjectDriveInterchange.cpp` bumps `GeometryRevision`
   each tick → `RefreshGeometry` + `BuildBottomLevel` + `UploadScene`, which calls `vkDeviceWaitIdle`).
   **Not fixed** — only now logged (`[UploadScene] #n trigger=… since_previous_ms`).
2. The XPBD force blow-up above. The measurement is now in place; **the fix is not written**.
3. F8 eject — unimplemented.
4. SolidArc B/C bevel/fillet/chamfer still take the fixed 0.1 radius.
5. SolidArc is a standalone Win32 host; in-process hosting inside `Frontier.exe` is not done.
