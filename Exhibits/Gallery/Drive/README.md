# Project-Drive evidence gallery

All Project-Drive proof material lives in this one central gallery directory. The suite is rerun by:

```bash
python3 Exhibits/Workbench/Drive/DriveSceneProof.py
```

## Evidence map

| Artefact | What it proves | Execution boundary |
|---|---|---|
| `ProjectDriveAutomotiveMaterials_CPU_Reference.png` | ControlVehicle close view with dense cobalt finite flakes over every painted panel, a visible separate clearcoat response, and distinct dark glazing / plastic / rubber / alloy treatment. | CPU Surfel-GI reference; **not** a native Vulkan/Slang capture. |
| `ProjectDriveSurfelGI_CPU_Reference.png` | The complete car and course through the CPU Surfel-GI branch. | CPU reference; **not** native Frontier GPU output. |
| `ProjectDriveReSTIR_CPU_Reference.png` | The complete car and course through the finite-sun-candidate CPU ReSTIR-DI reservoir branch. | CPU mirror; **not** the native Vulkan/Slang ReSTIR dispatch. |
| `ProjectDriveXPBDTyreDeformation_CPU_Reference.png` | Actual settled `XPBDSoftTyre` nodes (5 rings × 64 segments), flattened multi-node contact patch, resolved load and explicit proof gate. | CPU reference; **not** ImGui/Vulkan output. |
| `ProjectDrivePhysicsMotion_CPU_Reference.png` | Exact 12-second `DriveTelemetry` chassis trajectory, ramp launch/airborne sample and speed trace. | CPU reference based on the real `VehicleSolver` telemetry. |
| `ProjectDriveVehicleEditor_CPU_Reference.png` | Project-declared vehicle outliner plus an inspector-state sheet for body/glass/plastic, XPBD tyre settings, live vehicle telemetry and reconfigure actions. | CPU state-sheet reference derived from `ProjectDriveInterchange.cpp`, `VehicleInspectorSequence.h` and telemetry; **not** an ImGui capture. |
| `ProjectDrivePhysicsTelemetry_CPU_Reference.csv` | Raw 60 Hz vehicle telemetry from the 240 Hz fixed-step run. | CPU `VehicleSolver` reference. |
| `ProjectDrivePhysicsRun_CPU_Reference.txt` | Human-readable run summary (peak speed, airborne duration, final travel). | CPU `VehicleSolver` reference. |
| `ProjectDrivePhysicsTiming_CPU_Reference.txt` | Fixed-step / real-time-factor timing record. | CPU `VehicleSolver` reference. |
| `Provenance.json` | Commands, SHA-256 input/output ledger and native-vs-reference boundary for every artefact. | Metadata. |

## Truthfulness rule

The native Frontier/Vulkan/Slang/ImGui executable is not available in this sandbox. The suite therefore labels every
output `CPU_Reference` and `Provenance.json` names the precise CPU algorithm. These files show the actual shared
course, extracted `ControlVehicleMesh`, `XPBDSoftTyre` and `VehicleSolver` code paths where applicable, but never
represent a CPU mirror or state sheet as a native GPU/editor capture.
