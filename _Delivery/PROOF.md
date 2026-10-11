# Frontier — rendering proof

Everything under `proof/` was produced in this sandbox by CPU reference renderers that read the
project's own headers. **Open `proof/index.html`** for the browsable version (images, GIFs, MP4s,
graphs). This file is the plain-text index of what is there and what it does and does not prove.

Branch base: commit `1784c86` of `SultanAladin/Frontier-` (the commit before `3e45285`).
Working tree: `work` branch, HEAD `35f2da5`, 10 commits.

---

## 0. The honesty box — read this first

| | |
|:---|:---|
| **What these pixels are** | CPU reference renders. The GPU side of the pipeline is *simulated on the CPU*, exactly as you asked. |
| **What they are not** | Screenshots of the Vulkan app. There is no GPU and no Windows in this sandbox, and there never was. |
| **Project-Zero images** | Produced by the project's *own* CPU ReSTIR path tracer: `Projects/Project-Zero/bin/Project-Zero-CpuReference`. Same scene, same sky, same fog, same ReSTIR DI + GI. Proves the **scene, lighting and integrator** are right. Does **not** exercise the Vulkan passes. |
| **Project-Drive images** | Produced by the new `DriveRender` CPU reference. Course from `DriveCourse.h::EmitCourseTriangles` (the very emitter the render side uses), body from `ControlVehicleMesh.inl`, rims and tyres from `ControlVehicleRimMesh.inl` / `ControlVehicleTyreMesh.inl`, every pose from the real `VehicleSolver`. The **geometry, layout and pose are the project's own**; the surface shading is a small path tracer I wrote for this proof, **not** the engine's material model. |
| **The code fixes** | Still **GPU-unverified**. Compile/syntax-checked only. That is why the Phase-0 logs exist: on your RX 9060 XT they will tell you whether each fix did its job. |

---

## 1. Project-Zero — 38 renders

`Projects/Project-Zero/bin/Project-Zero-CpuReference` — the project's own CPU ReSTIR path tracer,
showcase scene (soil plain, 100 analytical shapes, sunset sky, moon, stars, clouds, ground mist).

| Set | Frames | What varies |
|:---|:---:|:---|
| `turntable/` | 16 | camera yaw 180°→330° in 10° steps, sun 17.93 |
| `sun_sweep/` | 13 | sun hour 05:00 → 21:00 at the hero yaw 220 |
| `quality/` | 6 | resolution × bounces × spatial passes ladder |
| `fog/` | 3 | `clear`, `morning`, `backlit` |

Raw numbers: `Project-Zero/rendertimings.csv` (one row per render), `Project-Zero/logs/*.stdout.log`.

### Timing ladder (same scene, sun 17.93, yaw 220)

| viewport | bounces | spatial passes | wall | render |
|:---|:---:|:---:|---:|---:|
| 320×240 | 4 | 1 | 1.02 s | 0.98 s |
| 320×240 | 8 | 2 | 1.27 s | 1.22 s |
| 640×480 | 4 | 1 | 4.14 s | 4.04 s |
| 640×480 | 8 | 2 | 4.80 s | 4.71 s |
| 960×540 | 8 | 2 | 8.46 s | 8.33 s |
| 1280×720 | 8 | 2 | 15.17 s | 14.95 s |

Doubling the pixel count roughly doubles the cost — the integrator scales with pixels, as it should.
Bounces 4→8 + passes 1→2 costs ~24 % at 320×240 and ~17 % at 640×480.

### Sanity checks on the pixels (not eyeballed)

| frame | mean | std | unique colours |
|:---|---:|---:|---:|
| sun 08:00 | 0.68 | 0.20 | 12 353 |
| sun 17:93 (sunset) | 0.50 | 0.20 | 59 050 |
| sun 21:00 (night) | 0.15 | 0.11 | 15 679 |

Mean luminance falls monotonically from noon to night; 59 k unique colours means a real gradient
render, not a flat placeholder.

---

## 2. Project-Drive — 168 renders + a 12 s physics run

### 2a. Physics (`DriveTelemetry`, unchanged from the repo)

```
steps                 2880          (12.0 s @ 240 Hz)
wall_time_ms          26988.69
physics_per_step_us   9361.91
realtime_factor       0.4x
peak speed            36.47 m/s  (131.3 km/h)
takeoff speed         11.18 m/s  (ramp launch)
airborne              0.58 s
max suspension travel 0.517 m
min chassis up        0.947
final X               184.0 m
```

**This is a finding, not a boast: 9.36 ms per 240 Hz step is 0.4× real time.** A 240 Hz step has a
4.17 ms budget. The XPBD soft-tyre solver alone cannot hold that rate on one core — which is part of
why the live `Play` path is starved. Graphs: `Project-Drive/01_speed_drivetrain.png`,
`02_wheel_loads.png`, `03_slip_braketemp.png`, `04_aero_suspension.png`.
Raw data: `Project-Drive/telemetry.csv` (720 rows × 64 columns), `timing.log`, `run.log`.

### 2b. Renders (`DriveRender`, new in this branch)

| mode | frames | viewport | spp | ms/frame | notes |
|:---|:---:|:---|:---:|---:|:---|
| `chase` | 72 | 480×270 | 4 | 1870.5 | camera behind the car, plays at 6 fps = real time |
| `orbit` | 48 | 480×270 | 4 | 1150.0 | one full turn, car held still (`--static`) |
| `trackside` | 36 | 480×270 | 4 | 718.9 | fixed camera at (14, −16, 2.2) |
| `hero` | 12 | 960×540 | 9 | 15637.8 | full-res stills |

Every frame emits **27 166 triangles**: 2 098 from the course + 2 924 body + 4 × (1 568 rim +
3 968 tyre). The BVH is rebuilt per frame because the wheels spin and steer.

### 2c. "Is the car actually in frame?" — a number, not an opinion

`DriveRender` tallies primary-ray hits per `CourseMaterial` family and prints them as `[cover]`:

```
chase:  bodyPaint=4.31%  plastic=2.07%  tyre=5.07%  glass=0.41%  taillight=1.23%  default=0.48%
        -> 13.57% of the frame is vehicle
        checkerLight=26.81%  checkerDark=28.18%  surround=5.16%  ramp=3.22%  cone=0.02%
orbit:  hub, headlight, taillight and trim appear only once the camera comes round the front —
        which is exactly what a car looks like from behind versus from the side.
```

Motion check on the chase clip: consecutive-frame mean |Δ| = 0.068, and **69.8 % of pixels change
by more than 5 %** between the first and last frame. The car is genuinely travelling.

---

## 3. Animations

| file | frames | fps | size |
|:---|:---:|:---:|---:|
| `Project-Zero/Project-Zero_turntable.gif` / `.mp4` | 16 | 8 | 0.79 MB / 0.22 MB |
| `Project-Zero/Project-Zero_timeofday.gif` / `.mp4` | 13 | 4 | 0.77 MB / 0.21 MB |
| `Project-Drive/Project-Drive_chase.gif` / `.mp4` | 72 | 6 | 7.86 MB / 2.12 MB |
| `Project-Drive/Project-Drive_orbit.gif` / `.mp4` | 48 | 6 | 6.57 MB / 1.49 MB |
| `Project-Drive/Project-Drive_trackside.gif` / `.mp4` | 36 | 4 | 2.84 MB / 0.81 MB |

Every frame of every clip is an independent full render. Nothing is interpolated or tweened.

---

## 4. The code (10 commits on top of `1784c86`)

```
35f2da5  Project-Drive CPU reference renderer: create the output directory, fail loudly on write
4537215  Project-Drive CPU reference renderer: --fps is a capture RATE, not a step stride
e847f63  Project-Drive: headless CPU reference RENDERER (real course + real ControlVehicle mesh)
31aa415  SolidArc: Vulkan DeviceRasterExchange behind RasterExchange (matcap, pick plane, SSAA)
ea9be5e  Vehicle spike dump
d170ed4  Build lists: RenderMetrics.cpp
12f9ef9  Phase 0 renderer logs (per-pass GPU timers, AMD buffer markers, device fault)
ec61418  Hardware RT: resolve ray-query hits through FlatTriangles + instance BLAS
58ce831  SDF: bake a local distance atlas once at startup
65f43d3  Remove Surfel GI
```

`patches/` holds the same work as `git format-patch 1784c86..work` (10 files). Verified by cloning
`1784c86` and `git am`-ing them: the result is byte-identical to the working tree.

`files/` holds every added/modified file at its repo path. `DELETED_FILES.txt` lists the 9 removals
(the Surfel GI stage, its shaders, and the Project-Drive `SurfelReference` copy).

---

## 5. Still not fixed

1. `Play` still rebuilds the scene every frame (`ProjectDriveInterchange.cpp` bumps
   `GeometryRevision` each tick → `RefreshGeometry` + `BuildBottomLevel` + `UploadScene`, which calls
   `vkDeviceWaitIdle`). **Not fixed** — only now logged (`[UploadScene] #n trigger=… since_previous_ms`).
2. XPBD kerb launch — the spike dump exists, the fix does not.
3. F8 eject — still unimplemented.
4. SolidArc B/C bevel/fillet/chamfer still take the fixed 0.1 radius.
5. SolidArc is a standalone Win32 host; true in-process hosting inside `Frontier.exe` is not done.
