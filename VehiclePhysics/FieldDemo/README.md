# Field test-drive demo

A **real physics playback** of the ported vehicle driving across an open field — flat ground, a cone slalom,
three speed bumps, and a launch ramp. The car body has **no collision** (only the four wheels touch the ground),
and the wheels are **procedural** (the `.blend`'s `RubberFL*`/`RimFL*` meshes are not imported).

| File | What it is |
|---|---|
| `FieldTestDrive.cpp` | Drives the sim (same `VehicleController` + XPBD soft tyre + Pacejka drivetrain + socket-derived `VehicleGeometry` as the validation suites) over the field terrain and dumps per-frame telemetry. |
| `field_drive.json` | The recorded run (60 Hz): chassis pose, per-wheel hub position / spin / steer / contact / load, plus the terrain profile and cone positions. |
| `viewer.html` | Canvas playback — **side view** (wheels spin, suspension works the bumps, ramp launch) + **top-down** (front wheels steer through the cones, path trail) + a live HUD. |
| `ControlVehicle_concept.png` | Illustrative concept render of the PROTO-X wedge (styling only — **not** the real mesh or a real engine render). |

## Run it
```bash
# 1. regenerate the telemetry (optional — field_drive.json is checked in)
V=../Overlay/Engine/PhysicalDynamics/Vehicle
g++ -std=c++17 -O2 FieldTestDrive.cpp $V/VehicleController.cpp $V/VehicleGeometry.cpp $V/Aerodynamics.cpp \
    $V/XPBDSoftTyre.cpp $V/PacejkaTyreModel.cpp $V/TyreSlipDynamics.cpp $V/Drivetrain.cpp -I$V -o fielddrive && ./fielddrive
# 2. view
python3 -m http.server 8000    # open viewer.html
```

## What this run shows (measured, not scripted)
- Top speed ~30 m/s (109 km/h); launches off the ramp at **25.7 m/s**.
- **1.31 s fully airborne** (all four wheels off the ground), ~2 m of air at apex.
- Speed bumps drive ~0.38 m of suspension travel.
- Lands and stays upright (min up-vector z = 0.921).

## Honest scope note
This is a faithful **2-D visualization of the real physics**, not a GPU render. This milestone is a headless physics/logic
port — there is no 3-D renderer or material system in it yet. Seeing the actual textured body mesh needs either local
Blender (`../CarModelling/ControlVehicle/ExportControlVehicle.py` → glTF/OBJ) or the Frontier engine itself.
