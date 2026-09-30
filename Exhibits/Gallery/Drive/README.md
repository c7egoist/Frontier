# Project-Drive evidence gallery

All Project-Drive proof material lives in this central gallery directory. The suite is rerun by:

```bash
python3 Exhibits/Workbench/Drive/DriveSceneProof.py
```

## Evidence map

| Artefact | What it proves | Execution boundary |
|---|---|---|
| `ProjectDriveVisibilityRaster_CPU_Reference.png` | The Project-Drive scene through the no-GI/no-ray-tracing/no-reflection visibility-raster CPU reference: checker course, ramp, cones, ControlVehicle body, glass, trim and wheels. | CPU reference; **not** native Frontier Vulkan/Slang output. |
| `ProjectDriveAutomotiveMaterials_CPU_Reference.png` | Close material view with dense cobalt finite flakes, separate clearcoat, glass, plastic, rubber, alloy and brake treatments. | CPU Surfel-GI reference; **not** a native Vulkan/Slang capture. |
| `ProjectDriveMaterialAngleFront_CPU_Reference.png` | Front angle for the same material families so the glass, plastic and clearcoat separation is visible from another camera. | CPU reference; **not** native Frontier GPU output. |
| `ProjectDriveMaterialAngleRear_CPU_Reference.png` | Rear angle for the same material families and wheel treatments. | CPU reference; **not** native Frontier GPU output. |
| `ProjectDriveSurfelGI_CPU_Reference.png` | The complete car and course through the CPU Surfel-GI branch. | CPU reference; **not** native Frontier GPU output. |
| `ProjectDriveReSTIR_CPU_Reference.png` | The complete car and course through the finite-sun-candidate CPU ReSTIR-DI reservoir branch. | CPU mirror; **not** the native Vulkan/Slang ReSTIR dispatch. |
| `ProjectDriveDrivingFollow_CPU_Reference.gif` | Sampled `DriveTelemetry` poses rendered as an animation from a chase camera; the car moves, launches and continues down the course. | CPU visibility reference driven by the actual telemetry CSV. |
| `ProjectDriveDrivingCourse_CPU_Reference.gif` | The same telemetry poses rendered from a course camera. | CPU visibility reference driven by the actual telemetry CSV. |
| `ProjectDriveXPBDTyreDeformation_CPU_Reference.png` | Actual settled `XPBDSoftTyre` nodes (5 rings × 64 segments), flattened multi-node contact patch, resolved load and explicit proof gate. | CPU reference; **not** ImGui/Vulkan output. |
| `ProjectDrivePhysicsMotion_CPU_Reference.png` | Exact 12-second `DriveTelemetry` chassis trajectory, ramp launch/airborne sample and speed trace. | CPU reference based on the real `VehicleSolver` telemetry. |
| `ProjectDriveTelemetryGraphs_CPU_Reference.png` | Speed-vs-time, throttle/brake/steer, aerodynamic drag/downforce, wheel loads, slip and ride-height graphs from the same CSV. | CPU reference based on the real `VehicleSolver` telemetry. |
| `ProjectDriveEditorDeclarations_CPU_Reference.txt` | Project-Drive editor-facing C-ABI declarations: five panels and nine scene subjects. This replaces the prior fake editor screenshot. | Text proof; actual editor rendering remains owned by `Frontier.exe`. |
| `ProjectDrivePhysicsTelemetry_CPU_Reference.csv` | Raw 60 Hz vehicle telemetry from the 240 Hz fixed-step run, including aero columns. | CPU `VehicleSolver` reference. |
| `ProjectDrivePhysicsRun_CPU_Reference.txt` | Human-readable run summary (peak speed, airborne duration, aero peak, final travel). | CPU `VehicleSolver` reference. |
| `ProjectDrivePhysicsTiming_CPU_Reference.txt` | Fixed-step / real-time-factor timing record. | CPU `VehicleSolver` reference. |
| `Provenance.json` | Commands, SHA-256 input/output ledger and native-vs-reference boundary for every artefact. | Metadata. |

## Truthfulness rule

The native Frontier/Vulkan/Slang/ImGui executable is not available in this sandbox. The suite therefore labels every
rendered output `CPU_Reference` and `Provenance.json` names the exact CPU algorithm and source path. These files show the
shared course, extracted `ControlVehicleMesh`, `XPBDSoftTyre`, aerodynamic package and `VehicleSolver` code paths where
applicable. They do not represent a CPU reference or C-ABI state file as a native GPU/editor capture.
