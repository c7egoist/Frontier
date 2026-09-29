# Project-Drive — a standalone windowed app (its own `Project-Drive.exe`)

Project-Drive is a **separate executable**, a sibling of Project-Zero — **not** a `--scene` mode of it. It has its
own entry point, its own window, its own scene, and lets you drive. It reuses Project-Zero's renderer/editor
translation units as *shared source code* compiled into itself, but it never launches or links against the
Project-Zero binary.

## How it is built

| Platform | Script | What it does |
|---|---|---|
| Windows (MSVC, primary) | `Build\ToolchainSequence.ps1` | Forked from Project-Zero's windowed script; entry point swapped to `DriveExecution.cpp`, drive/vehicle sources added. Produces `Build\Project-Drive.exe`. |
| Linux (CMake) | `Build\ToolchainSequence.sh` | Builds the `Project-Drive` CMake target. |
| CMake target | `Build\ProjectDrive.cmake` | Defines the `Project-Drive` executable = `PROJECT_ZERO_SOURCES` − `GameExecution.cpp` + `DriveExecution.cpp` + drive layer + vehicle physics. Add `include(Projects/Project-Drive/Build/ProjectDrive.cmake)` at the end of the engine root `CMakeLists.txt`. |

See `Build/BUILD_WINDOWS.md` for the exact commands and the controls table.

## The entry point — `Source/DriveExecution.cpp`

`DriveExecution.cpp` is Project-Drive's own `main()`. It is a copy of Project-Zero's `GameExecution.cpp` (the same
2800-line Vulkan/ImGui host, so the editor, viewport, outliner, sun/sky, gizmos and inspectors are all present) with
a small set of **drive-specific edits**, each marked with a `Project-Drive:` comment:

1. **Includes** — the drive scene / vehicle / camera / input / inspector headers.
2. **Default scene** — `ScenePath = "Projects/Project-Drive/Content/Scenes/DriveCourse.gltf"`, plus a `--scene drive`
   alias.
3. **Scene generation** — if the course glTF is missing or stale, `DriveSceneAuthor::Construct()`/`Export()`
   writes it (flat plane + grid/checker + ramp + speed bumps + car), exactly like `ShowroomStructure` does for the
   showroom.
4. **Camera framing** — a drive-course branch places the editor camera behind/above the spawn pad.
5. **Config path** — `Projects/Project-Drive/Content/Frontier.config.toml` (defaults tolerated if absent).
6. **Vehicle bring-up** — after the scene loads, a `VehicleInstanceSequence` is constructed from the real
   `VehicleGeometry` (ControlVehicle dimensions).
7. **Drive loop** — in the per-frame loop, **P** toggles Play/Edit; in Play the `DriverInputExchange` feeds W/A/S/D +
   Space + Shift/Ctrl + R into the vehicle solver, `VehicleInstanceSequence::AdvanceVehicle` steps the physics and writes
   the body(0) + wheel(1..4) `InstanceRecord::World` rows, `Surface.RefreshInstances` uploads them (the same path the
   D3 instance-motion feature ships), and the fly camera is repositioned as a chase camera trailing the chassis. In
   Edit mode W/A/S/D fly the editor camera instead.

## The modules (all in `Source/`, compiled against real engine headers)

| File | Role | Mirrors |
|---|---|---|
| `DriveSceneAuthor.{h,cpp}` | One-shot exporter: emits the course + the real ControlVehicle body + 4 procedural wheels as a glTF level, body given the cobalt **flake clearcoat**, wheels the rubber material. Same `Construct()`/`Export()`/`…IsCurrent()` contract as `ShowcaseStructure`. Instance order is the contract: **0 = body, 1..4 = wheels FL,FR,RL,RR**. | `ShowroomStructure` / `ShowcaseStructure` |
| `VehicleInstanceSequence.{h,cpp}` | Owns the live `VehicleSolver` + a collider-free chassis integrator; steps physics at 240 Hz and writes the body + 4 wheel `InstanceRecord::World` rows, then refreshes the flat triangles for the accel structure. | `PhysicsInstanceSequence` |
| `ChaseCameraSolver.{h,cpp}` | A `CameraProjection` that trails the car (spring lag, speed-reactive FOV). Available for a dedicated chase camera; the entry point currently repositions the fly camera directly in Play mode. | `FlyThroughSolver` |
| `DriverInputExchange.h` | Forwards `InputExchange` (W/A/S/D, Space, Shift/Ctrl, R) into the engine-agnostic `DriverInputIntegrator`; edge-detects the discrete pulses. | new (thin) |
| `VehicleInspectorSequence.h` | Builds/applies an `EditorSheet` per subsystem (Chassis, Engine, Turbo, Gearbox, Tyre-long, Tyre-lat, Aero, Live) — **all curves editable**. | `EditorInspectorSequence` |

## Design notes

* **Chassis has no collider** — only the wheels contact the ground (`VehicleInstanceSequence` owns a collider-free
  integrator + the XPBD soft tyres). Jolt is linked for the course/ground collider only.
* **Instance layout is a contract** between `DriveSceneAuthor` (which authors the rows) and
  `VehicleInstanceSequence` (which rewrites them): row 0 = body, rows 1..4 = wheels FL, FR, RL, RR, rows 5+ = course.
* **Shared code, not a shared binary** — the Project-Zero renderer/editor `.cpp`s are compiled *into*
  `Project-Drive.exe`. Nothing at runtime reaches for `Project-Zero.exe`.

## Verifying without the GPU app

The physics and lighting were proved headlessly by the CPU mirrors under
`Overlay/Exhibits/Workbench/Drive/` (native proof) with rendered output in `Overlay/Exhibits/Gallery/Drive/`, per
the repo's proofs-in-Exhibits convention. Those are verification artifacts, not the app.
