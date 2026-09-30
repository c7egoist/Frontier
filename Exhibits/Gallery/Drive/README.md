# Project-Drive evidence gallery

Everything here is produced by the Frontier engine's own code, built from the pinned checkout with
`VehiclePhysics/Overlay` seated on top of it. Slate authors no renderer, no material model, no sky and no camera.
Rerun the whole gallery with:

```bash
python3 Exhibits/Workbench/FrontierMirror/RunDriveMirror.py --width 480 --height 270 --fps 10
```

## What is actually running

| Stage | Translation unit | Role |
|---|---|---|
| Level | `Projects/Project-Drive/Source/DriveSceneAuthor` | the app's own course, `ControlVehicleMesh` shell, four wheels and twelve authored materials, in the app's own span order |
| Physics | `Engine/PhysicalDynamics/Vehicle/VehicleSolver` | PacejkaDrivetrain, XPBD soft tyres, closed-loop `Aerodynamics`, 240 Hz fixed step |
| Camera | `Projects/Project-Drive/Source/ChaseCameraSolver` | the app's own spring chase camera |
| Sky | `Projects/Project-Zero/Source/CelestialSequence` | the real sun / sky / atmosphere / star / moon model at local hour 13.0 |
| Raster | `Engine/GeometricRaster/VisibilityRaster` | the shipped raytracing-off, global-illumination-off render path |

The body and all four wheels are re-registered every frame from the solver's own pose telemetry, so the car in a
sequence is wherever the physics put it. The sequences **are** the run, not an animation of it.

## Driving sequences

| Artefact | What it shows |
|---|---|
| `ProjectDriveChaseRun_CPU_Reference.gif` | The full scripted run from the chase camera: settle, full throttle, slalom, ramp, brake. |
| `ProjectDriveTracksideRun_CPU_Reference.gif` | The same run from a fixed post beside the course, past the cones and the ramp. |
| `ProjectDriveOrbitWhileDriving_CPU_Reference.gif` | The same run with the eye circling the moving car — the body, wheels and course from every azimuth at speed. |
| `ProjectDriveMaterialTurntable_CPU_Reference.gif` | The car held at the pose the solver produced three seconds in, circled once. |

## Material angles

Lifted straight out of the turntable frames, so each is the same shipped shading from a different azimuth:
`ProjectDriveMaterialAngleRear`, `…RearQuarter`, `…Side`, `…FrontQuarter`, `…Front`, `…FarSide`
(`_CPU_Reference.png`).

## The run, plotted

Every series is a column of the telemetry CSV, drawn by `Exhibits/Workbench/Drive/DriveTelemetryGraphs.py`.
Nothing is modelled or smoothed; these are the numbers the solver wrote.

| Artefact | Series |
|---|---|
| `ProjectDriveSpeedVsTime_CPU_Reference.png` | Road speed and its forward component, km/h. Peak ≈ 123 km/h. |
| `ProjectDriveDriverInputs_CPU_Reference.png` | Throttle, brake and steer exactly as the solver consumed them. |
| `ProjectDriveSteering_CPU_Reference.png` | Commanded steer against the front wheel angles and front slip angle the solver produced. |
| `ProjectDriveAerodynamics_CPU_Reference.png` | `AeroForces`: total / front / rear downforce and total drag. Peak ≈ 6547 N and 2165 N. |
| `ProjectDriveAeroAgainstSpeed_CPU_Reference.png` | Downforce against road speed — the speed-squared signature of the aero model. |
| `ProjectDrivePowertrain_CPU_Reference.png` | Engine rpm with the gear index and turbo boost on the same axis; every upshift is an rpm drop at a gear step. |
| `ProjectDriveTyreLoads_CPU_Reference.png` | Per-wheel `Fz` from the XPBD soft tyre — load transfer, and wheels leaving the ground over the ramp. |

## Raw records

| Artefact | Contents |
|---|---|
| `ProjectDrivePhysicsTelemetry_CPU_Reference.csv` | 60 Hz samples of the 240 Hz run: pose, speed, powertrain, the six aero columns and per-wheel load / slip / steer / omega / brake temperature. |
| `ProjectDrivePhysicsRun_CPU_Reference.txt` | Run summary: peak speed, airborne duration, suspension travel, final travel. |
| `ProjectDrivePhysicsTiming_CPU_Reference.txt` | Fixed-step and real-time-factor timing. |
| `ProjectDriveXPBDTyreDeformation_CPU_Reference.png` | Settled `XPBDSoftTyre` nodes, 5 rings × 64 segments, with the flattened contact patch and resolved load. |
| `Provenance.json` | Engine repository and revision, every command, and a sha256 for every published file. |

## Execution boundary

These frames are rendered on the CPU by the engine's own translation units, run headless. They are not Vulkan
swapchain captures and not ImGui captures — but they are the same code the GPU path shades from, on the same
level, driven by the same solver. Nothing in this gallery is drawn by Slate.

## What was removed

`Exhibits/Workbench/Drive/DriveSceneProof.cpp` was a bespoke raytracer written inside Slate. It ran no engine
code, so its sheets were never evidence about Project-Drive. It is deleted, along with the sheets it produced
(`ProjectDriveAutomotiveMaterials`, `ProjectDriveSurfelGI`, `ProjectDriveReSTIR`, `ProjectDrivePhysicsMotion`,
`ProjectDriveVehicleEditor`), and superseded by the sequences and graphs above.
