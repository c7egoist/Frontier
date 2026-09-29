# Wiring Project-Drive into the Frontier editor (`--scene drive`)

This is the exact integration recipe for the drivable editor. The heavy lifting is done by the modules in
`Source/` — each compiled against the real engine headers and verified — so `GameExecution.cpp` only gains a small,
clearly-bounded set of hooks rather than a rewrite. Every insertion point below mirrors an existing Project-Zero
pattern (the drop scene, the fly camera, the celestial inspector), so it drops into the frame loop you already have.

## The modules (all in `Projects/Project-Drive/Source/`)
| File | Role | Mirrors |
|---|---|---|
| `VehicleInstanceSequence.{h,cpp}` | Owns the live `VehicleController` + a collider-free chassis integrator; each frame steps physics at 240 Hz and writes the body + 4 wheel `InstanceRecord::World` rows, and refreshes the flat triangles for the accel structure. | `PhysicsInstanceSequence` |
| `ChaseCameraSolver.{h,cpp}` | A `CameraProjection` that trails the car (spring lag, speed-reactive FOV). | `FlyThroughSolver` |
| `VehicleInputBridge.h` | Forwards `InputExchange` (W/A/S/D, Space, Shift/Ctrl, R) into the engine-agnostic `VehicleInputController`, edge-detecting shifts/reset. | new (thin) |
| `VehicleInspectorSequence.h` | Builds/《applies》 an `EditorSheet` per vehicle subsystem (Chassis, Engine, Turbo, Gearbox, Tyre-long, Tyre-lat, Aero, Live) — **all curves editable** as their control sets. | `EditorInspectorSequence` / `CameraInspectorBinding` |

## Build
Add the two lines to the root `CMakeLists.txt` shown in `Build/ProjectDrive.cmake`. No new link libraries.

## GameExecution.cpp — the insertion points

**① Scene alias (arg parse, next to the other `--scene` names)**
```cpp
if (ScenePath == "drive") ScenePath = "Projects/Project-Drive/Content/Scenes/DriveCourse.gltf";
```
Author `DriveCourse.gltf` once from `DriveCourse.h` + `ControlVehicleMesh.inl` + procedural wheels (a `DriveSceneStructure`, the same one-shot exporter pattern as `ShowcaseStructure`). Instance order is the contract: **instance 0 = body, 1..4 = wheels FL,FR,RL,RR** (matches `VehicleInstanceConfiguration` defaults). Give the body the flake clearcoat material (`AutomotiveFlakePaint.slang`) and the wheels the rubber material; the body has **no collider** by design.

**② Construct once, after the scene is resident**
```cpp
Frontier::Drive::VehicleInstanceSequence Vehicle;
Frontier::Drive::ChaseCameraSolver       ChaseCam;
Frontier::Drive::VehicleInputBridge      DriveInput;
Frontier::Vehicle::VehicleInputController DriveController;   // the feel layer (ramps, self-centring)
bool DriveScene = (ScenePath.find("DriveCourse") != std::string::npos);
if (DriveScene) {
    Frontier::Vehicle::VehicleGeometry geo;                  // real ControlVehicle socket geometry
    Vehicle.Construct(geo, {});                              // body=0, wheels 1..4, spawn on the pad
}
bool PlayMode = false;   // false = edit (fly cam), true = drive (chase cam). Toggle with C.
```

**③ Per-frame, in the input/update phase (before culling)**
```cpp
if (DriveScene) {
    if (Input.IsKeyPressed(VirtualKeyCategory::KeyC) && !CHeldLast) PlayMode = !PlayMode;  // edge toggle
    CHeldLast = Input.IsKeyPressed(VirtualKeyCategory::KeyC);

    Frontier::Vehicle::DriverInput drive{};
    if (PlayMode) {
        drive = DriveInput.Poll(Input, DriveController, Δτ).Drive;  // W/A/S/D + Space + Shift/Ctrl + R
        FlyCam.AdvanceLocomotion(Input, 0.0f);                     // parked while driving
    } else {
        FlyCam.AdvanceLocomotion(Input, Δτ);                       // editor fly camera owns W/A/S/D
    }
    Vehicle.AdvanceVehicle(drive, MutableInstances, Δτ);           // steps physics, writes World rows
    Vehicle.RefreshBodyFacets(FlatTriangles, MutableInstances);    // then refit the accel structure

    // Camera selection: chase cam in Play, fly cam in Edit.
    const auto& ch = Vehicle.Chassis();
    const Frontier::Vec3 fwd = ch.Orientation.Rotate({1,0,0});     // car forward
    ChaseCam.AdvanceChase({ch.Position.x,ch.Position.y,ch.Position.z},
                          {fwd.x,fwd.y,fwd.z}, Vehicle.Telemetry().SpeedMetresPerSecond, Δτ);
    ActiveCamera = PlayMode ? static_cast<CameraProjection*>(&ChaseCam)
                            : static_cast<CameraProjection*>(&FlyCam);
}
```
Feed `ActiveCamera` into the same view/projection upload the fly camera already uses, and re-refit the acceleration
structure from `FlatTriangles` exactly as the D5 drop scene does after `RefreshBodyFacets`.

**④ Outliner rows for the vehicle (once, when building the tree)**
Add one row per `Frontier::Drive::VehicleSection` under a "Vehicle" folder, each with
`InspectorKey = VehicleInspectorKey(section)`. `VehicleSectionLabel(section)` gives the display name.

**⑤ Inspector exchange (the `Update(pick, commit)` callback, alongside the celestial branch)**
```cpp
const uint64_t key = Rows[pick].InspectorKey;
if ((key >> 32) == 6) {                                    // family 6 = vehicle
    const auto section = static_cast<Frontier::Drive::VehicleSection>(uint32_t(key));
    if (!commit) Frontier::Drive::BuildVehicleSheet(section, Vehicle.Configuration(), Vehicle.Telemetry(), Sheet);
    else { auto cfg = Vehicle.Configuration();
           Frontier::Drive::ApplyVehicleSheet(section, Sheet, cfg);
           Vehicle.Reconfigure(cfg); }                      // rebind tyres so curve/geometry edits take effect
    return &Sheet;
}
```

## Controls
```
Edit ⇄ Play ...... C            Throttle ... W       Brake/reverse ... S
Steer ............ A / D        Handbrake .. Space   Up / down shift . Left-Shift / Left-Ctrl
Reset vehicle .... R            Editor fly . W/A/S/D + RMB-look (Play parks it)
```

## What is still authoring-only (not code)
- `DriveCourse.gltf` + its `DriveSceneStructure` exporter (①). The geometry already exists as data:
  `DriveCourse.h` (course), `ControlVehicleMesh.inl` (body), and the procedural wheel builder used by
  `SurfelReference.cpp` — the exporter just emits them as glTF instances in the contract order.
- Assigning the flake clearcoat material to the body instance and the rubber material to the wheels.
