# Wiring Project-Drive into the Frontier editor (`--scene drive`)

## Read this first — what the two build scripts actually produce

There are **two different things** in Project-Drive, and it is easy to confuse them:

| What you ran | What it is | Opens a window? |
|---|---|---|
| `Projects\Project-Drive\Build\ToolchainSequence.ps1` → `DriveTelemetry.exe`, `SurfelReference.exe` | **Headless CPU verification tools.** One runs the real vehicle physics over the course and writes `telemetry.csv`/logs; the other ray-traces one GI frame to `drive_gi.ppm`. They prove the physics and lighting are correct with no GPU. | **No — by design.** They print to the console and write files. |
| `Project-Zero.exe --scene drive` (the windowed app, after the edits below) | **The drivable editor** — viewport, ImGui panels, sun/sky, hierarchy, inspector, gizmos, and the drive scene. This is the "like Project-Zero" experience. | **Yes.** |

The editor is **not** a separate executable. Frontier links every sub-project (Project-Dyno, Project-Fluid, …)
into the **single** `Project-Zero` windowed binary, and picks the level with `--scene`. Project-Drive follows the
same rule: you add its sources to the Project-Zero build, then run `Project-Zero.exe --scene drive`.

The work below is split into **two milestones**. Milestone 1 makes the app **open with your car and course in the
editor** (small, low-risk, verify in minutes). Milestone 2 makes the car **drive** (uses the seams that are already
written). Do Milestone 1 first and confirm the window opens before starting Milestone 2.

---

## The modules (all in `Projects/Project-Drive/Source/`, compiled against real engine headers)

| File | Role | Mirrors |
|---|---|---|
| `DriveSceneStructure.{h,cpp}` | **DONE.** One-shot exporter: emits the course + the real ControlVehicle body + 4 procedural wheels as a glTF level, body given the cobalt **flake clearcoat**, wheels the rubber material. Same `Construct()`/`Export()`/`…IsCurrent()` contract as `ShowcaseStructure`. Instance order is the contract: **0 = body, 1..4 = wheels FL,FR,RL,RR**. | `ShowroomStructure` / `ShowcaseStructure` |
| `VehicleInstanceSequence.{h,cpp}` | Owns the live `VehicleController` + a collider-free chassis integrator; steps physics at 240 Hz and writes the body + 4 wheel `InstanceRecord::World` rows, then refreshes the flat triangles for the accel structure. | `PhysicsInstanceSequence` |
| `ChaseCameraSolver.{h,cpp}` | A `CameraProjection` that trails the car (spring lag, speed-reactive FOV). | `FlyThroughSolver` |
| `VehicleInputBridge.h` | Forwards `InputExchange` (W/A/S/D, Space, Shift/Ctrl, R) into the engine-agnostic `VehicleInputController`. | new (thin) |
| `VehicleInspectorSequence.h` | Builds/applies an `EditorSheet` per subsystem (Chassis, Engine, Turbo, Gearbox, Tyre-long, Tyre-lat, Aero, Live) — **all curves editable**. | `EditorInspectorSequence` |

---

# Milestone 1 — the app opens with the drive scene

### 1a. Build: add Project-Drive to the Project-Zero source list

**CMake (preferred).** In the root `CMakeLists.txt`, *before* `add_executable(...)`:
```cmake
include(Projects/Project-Drive/Build/ProjectDrive.cmake)
list(APPEND PROJECT_ZERO_SOURCES ${PROJECT_DRIVE_SOURCES})
```
and *after* the target exists:
```cmake
target_include_directories(Project-Zero PRIVATE ${PROJECT_DRIVE_INCLUDE_DIRS})
```
`ProjectDrive.cmake` lists all 10 `.cpp` (DriveSceneStructure + VehicleInstanceSequence + ChaseCameraSolver + the
7 vehicle sources). No new link libraries — the vehicle layer is pure C++/STL (no Jolt, no Vulkan).

**MSVC `ToolchainSequence.ps1` (if you build Project-Zero that way).** In the source-list array add — note
**`DriveSceneStructure.cpp` is required for Milestone 1** (it is what the export block calls):
```powershell
'Projects\Project-Drive\Source\DriveSceneStructure.cpp'
'Projects\Project-Drive\Source\VehicleInstanceSequence.cpp'
'Projects\Project-Drive\Source\ChaseCameraSolver.cpp'
```
and in `Get-IncludePaths` you already added `Projects\Project-Drive\Source` and `Engine\PhysicalDynamics\Vehicle`.

### 1b. `GameExecution.cpp` — include (top, next to `#include "ShowroomStructure.h"`)
```cpp
#include "../../Project-Drive/Source/DriveSceneStructure.h"
```

### 1c. `GameExecution.cpp` — scene alias (in the `--scene` alias block, next to `showroom`/`showcase`)
```cpp
if (ScenePath == "drive") ScenePath = "Projects/Project-Drive/Content/Scenes/DriveCourse.gltf";   // Project-Drive course
```

### 1d. `GameExecution.cpp` — export-if-missing (inside the scene `{ … }` block, right after the Showroom `if (IsShowroom …)` block)
This mirrors the Showcase block exactly (`…IsCurrent()` invalidates a stale file when `Construct()` changes):
```cpp
// Project-Drive course level — generated headless (DriveSceneStructure), then imported like any other level.
const bool IsDrive = ScenePath.find("DriveCourse.gltf") != std::string::npos;
if (IsDrive && (!std::filesystem::exists(ScenePath, FsError) || !Frontier::Drive::DriveSceneIsCurrent(ScenePath)))
{
    std::filesystem::create_directories(std::filesystem::path(ScenePath).parent_path(), FsError);
    std::string Error;
    Frontier::Drive::DriveSceneStructure Course; Course.Construct();
    if (Course.Export(ScenePath, &Error)) std::cerr << "[Scene] Exported the drive course to " << ScenePath << "\n";
    else                                   std::cerr << "[Scene] Drive course export failed: " << Error << "\n";
}
```

### 1e. `GameExecution.cpp` — camera framing (in the `Level.QueryName()` else-if chain, after the `Showroom` branch)
The exporter names the level `DriveCourse.r<rev>`, so match with `find`:
```cpp
else if (Level.QueryName().find("DriveCourse") != std::string::npos)
{
    // Behind and above the spawn pad, looking down the course (+X), pitched down ~10deg.
    Camera.AssignSpatialLocation(Frontier::Vector3{ -9.0f, 0.0f, 4.0f });
    Camera.AssignOrientationEuler(-10.0f * 3.14159265f / 180.0f, 90.0f * 3.14159265f / 180.0f, 0.0f);
    CameraConfig.BaseFlightSpeed = 8.0f;
    Camera.AssignConfiguration(CameraConfig);
}
```
(Tune the numbers once you see it. The generic bounds-centre branch already handles it if you skip this.)

### Milestone 1 result
`Project-Zero.exe --scene drive` opens the **editor window**: viewport, ImGui panels, sun/sky, the outliner/hierarchy,
the inspector, gizmos — with **your course + the real ControlVehicle (flake clearcoat body + 4 wheels) in the scene**.
You can fly around with the editor camera (W/A/S/D + RMB-look), pick objects, and move them with gizmos. The car is
**static** at this stage — Milestone 2 makes it drive.

---

# Milestone 2 — make the car drive (Play mode)

These hooks use the already-written seams. Expect one or two compile iterations, because this touches the frame loop
that owns the CPU instance mirror (`AnimatedInstances`) and the acceleration-structure refresh — I cannot compile the
windowed app from my side, so treat these as anchored insertions, not a verified patch.

### 2a. Construct once, after the scene is resident (near where `PhysicsInstanceSequence BodyBridge` is built)
```cpp
Frontier::Drive::VehicleInstanceSequence  Vehicle;
Frontier::Drive::ChaseCameraSolver        ChaseCam;
Frontier::Drive::VehicleInputBridge       DriveInput;
Frontier::Vehicle::VehicleInputController  DriveController;   // the feel layer (ramps, self-centring)
const bool DriveScene = Level.QueryName().find("DriveCourse") != std::string::npos;
bool  PlayMode = false;   // false = edit (fly cam), true = drive (chase cam). Toggle with C.
bool  CHeldLast = false;
if (DriveScene) { Frontier::Vehicle::VehicleGeometry Geo; Vehicle.Construct(Geo, {}); }
```

### 2b. Per-frame input/step (put this next to the `if (PhysicsReady) BodyBridge.AdvancePhysics(...)` block, ~line 2359, and use the SAME `AnimatedInstances` + `RefreshInstances` path)
```cpp
if (DriveScene)
{
    if (Input.IsKeyPressed(Frontier::VirtualKeyCategory::KeyC) && !CHeldLast) PlayMode = !PlayMode;
    CHeldLast = Input.IsKeyPressed(Frontier::VirtualKeyCategory::KeyC);

    Frontier::Vehicle::DriverInput Drive{};
    if (PlayMode) Drive = DriveInput.Poll(Input, DriveController, static_cast<float>(Δτ)).Drive;

    Vehicle.AdvanceVehicle(Drive, AnimatedInstances, static_cast<float>(Δτ));   // 240 Hz internally; writes rows 0..4
    Surface.RefreshInstances(AnimatedInstances.data(), static_cast<uint32_t>(AnimatedInstances.size()));
    // then the SAME two-level refit the drop scene runs (UpdateTopLevel / RefreshInstanceTraversal, or the
    //   RefreshBodyFacets world-space fallback) so shadows and the tracer follow the car.
}
```

### 2c. Camera selection (where the active `CameraProjection` is chosen for the view/projection upload)
```cpp
if (DriveScene && PlayMode)
{
    const auto& Ch = Vehicle.Chassis();
    const Frontier::Vehicle::Vec3 Fwd = Ch.Orientation.Rotate({1,0,0});
    ChaseCam.AdvanceChase({Ch.Position.x, Ch.Position.y, Ch.Position.z},
                          {Fwd.x, Fwd.y, Fwd.z}, Vehicle.Telemetry().SpeedMetresPerSecond, static_cast<float>(Δτ));
    ActiveCamera = static_cast<Frontier::CameraProjection*>(&ChaseCam);   // player camera
}
else ActiveCamera = static_cast<Frontier::CameraProjection*>(&Camera);    // editor fly camera
```
In Play mode, gate the fly camera's WASD locomotion off so the keys drive the car, not the camera.

### 2d. Outliner rows (once, when the tree is built)
Add one row per `Frontier::Drive::VehicleSection` under a "Vehicle" folder, each with
`InspectorKey = Frontier::Drive::VehicleInspectorKey(section)`.

### 2e. Inspector exchange (in `EditorInspectorSequence::Exchange`, alongside the celestial branch — family 6 = vehicle)
```cpp
const uint64_t Key = Rows[Pick].InspectorKey;
if ((Key >> 32) == 6u) {
    const auto Section = static_cast<Frontier::Drive::VehicleSection>(uint32_t(Key));
    if (!Commit) Frontier::Drive::BuildVehicleSheet(Section, Vehicle.Configuration(), Vehicle.Telemetry(), Sheet);
    else { auto Cfg = Vehicle.Configuration();
           Frontier::Drive::ApplyVehicleSheet(Section, Sheet, Cfg);
           Vehicle.Reconfigure(Cfg); }   // rebind tyres so curve/geometry edits take effect
    return &Sheet;
}
```

## Controls
```
Edit <-> Play .... C            Throttle ... W       Brake/reverse ... S
Steer ............ A / D        Handbrake .. Space   Up / down shift . Left-Shift / Left-Ctrl
Reset vehicle .... R            Editor fly . W/A/S/D + RMB-look (Play parks it)
```
