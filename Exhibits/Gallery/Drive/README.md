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
| Sky | `Engine/Host/CelestialSequence` | the real sun / sky / atmosphere / star / moon model at local hour 13.0 |
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

## The tyre, and the rim it is mounted on

The sidewall of `XPBDSoftTyre` is tension-only: it holds the belt out against the gas, and carries nothing at
all in compression. That is correct for a sidewall and wrong for a wheel, because a real tyre runs out of
sidewall and then sits on the rim flange, and from that point the rate is effectively vertical. Without that
limit the belt simply keeps going once the sidewall is spent, and the tread ends up inside the wheel it is
mounted on.

`RimBottoming` is the unilateral constraint that supplies the limit, projected last in each sweep so it is the
final word on where the tread may be. The pair below is the evidence, and it is a controlled pair: same course,
same scripted inputs, same seed, the constraint toggled from the command line with `--rim-stop` and nothing
else. Both runs reach 36.5 m/s and finish within 0.3 m of each other, so the difference in the tread is the
constraint and not a different lap.

| Artefact | What it shows |
|---|---|
| `ProjectDriveXPBDTyreDeformation_CPU_Reference.gif` | The front-left tyre for the whole run, close enough to read the carcass, with the flange constraint on. The surface is rebuilt every frame from the solver's own particle lattice. |
| `ProjectDriveXPBDRimCollapse_CPU_Reference.gif` | The defeated control: the identical run with `--rim-stop 0`. |
| `ProjectDriveXPBDLatticeDebug_CPU_Reference.gif` | The same carcass drawn as the lattice itself rather than a skin, so the nodes and the contact patch are visible directly. |
| `ProjectDriveKerbStrike_CPU_Reference.gif` | The car leaned onto the kerb's vertical face until the tyre strikes it side-on — the hardest case the course offers the carcass. |
| `ProjectDriveKerbStrike_LatticeDebug_CPU_Reference.gif` | The kerb strike as the lattice, which is where the flange is easiest to read off the particles. |

The numbers come from the mirror's own `flange:` line, which is in `Provenance.json` for both runs. The tyre is
a 508.6 mm tread radius on a 344.6 mm rim, so there is 149.0 mm of sidewall between the two once the 15 mm of
tread and carcass thickness is allowed for:

| Run | Closest the tread came to the axis | Against the 359.6 mm flange | Sidewall used |
|---|---|---|---|
| Ramp landing, `--rim-stop 1` (shipped) | 359.4 mm | 0.19 mm short of it | 100% |
| Ramp landing, `--rim-stop 0` (defeated) | 342.1 mm | 17.51 mm **through** it | 112% |
| Kerb strike, `--rim-stop 1` (shipped) | 358.9 mm | 0.67 mm short of it | 100% |
| Kerb strike, `--rim-stop 0` (defeated) | 283.6 mm | 76.04 mm **through** it | 151% |

Two things are worth reading off that table rather than inferring. The shipped run uses 100% of the sidewall
and no more: the scripted ramp landing is hard enough to put the tread on the flange, which is why this course
can prove the constraint at all. And the 0.72 mm is not leakage — it is the constraint's own compliance
answering the load, which is what a soft constraint does. The mirror gates on it (`intrusion < 2 mm`), so a
regression that removed or weakened the limit fails the proof instead of quietly shipping.

The kerb is the harder of the two by a wide margin — the flange projection is handed a 46.7 mm breach against
13.6 mm for the ramp — and it is the case that caught a real defect. The constraint originally ran at a damping
ratio of 1.0, and XPBD's damped solve carries γ in the denominator, so one sweep can only recover 1/(1+γ) of a
breach: 95%. Ground contact re-drives the node every sweep, so that last 5% is an equilibrium and not something
more sweeps grind away (2.40 / 1.73 / 1.63 mm for 1 / 2 / 3 sweeps). On the kerb that left the tread 2.40 mm
inside the flange. The ratio is now 0.25, which holds it at 0.67 mm; `XPBDSoftTyre.h` carries the measurement
showing the heavy ratio was not buying any dissipation to pay for it.

The `flange:` line separates ARRIVAL from RESIDUAL — how deep a node already was when the projection first saw
it, against what was still unresolved afterwards. Keeping the two apart is what distinguishes a constraint that
is under-converging from one that is never handed the problem, and it is what localised the defect above
instead of another parameter sweep.

Every sequence here is produced by `RunDriveMirror.py`. The kerb pair and the lattice-debug view used to be
hand-run and were therefore silently showing pre-fix behaviour long after the constraint landed; they are in
`SEQUENCES` now so the single rebuild command cannot leave them behind again.

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
