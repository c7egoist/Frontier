# Vehicle Physics — native vehicle dynamics on Jolt 5.3.0

## Authoritative source selection

Scanned all branch heads in the four owner-specified repositories. The newest complete native vehicle snapshot found is:

- Repository: `SultanAladin/Frontier-`
- Branch: `arena/215a6f39-frontier`
- Branch head: `f2cfc57daaaf1fafc9a01a2002af6cad8cbd0f0f`, 2026-10-14 18:32:41 UTC
- Latest vehicle-source change contained by that head: `f1f0d72e54effc0b5cae64eae726323bb82bdd01`, 2026-10-14 04:16:30 UTC (tyre deformation/pressure integration)

This head contains the complete C++ `Engine/PhysicalDynamics/Vehicle/` model and Project-Drive vehicle geometry sources. The other same-day candidate heads are older; the latest C++ vehicle source change is an ancestor of `arena/215a6f39-frontier`. Searches of `SultanAladin/Slate`, `unassignedinbox/Slate`, and `unassignedinbox/Frontier` found no newer matching native vehicle source. No HTML/JavaScript vehicle physics was ported or compared with Jolt.

## Ported and wired

The native model is under `Frontier/Engine/PhysicalDynamics/Vehicle/`:

- `VehicleSolver`: four-corner vehicle dynamics, Pacejka slip, suspension/anti-roll bars, wheel spin, braking/ABS, thermal state, drivetrain and aerodynamics.
- `Drivetrain`, `PacejkaMagicFormula`, `TyreSlipDynamics`, `RigidWheel`, `TraceContactTyre`, and suspension/thermal specifications.
- `VehicleGeometry`: measured ControlVehicle socket geometry and dimensions, plus geometry-to-wheel/suspension setup.
- `JoltVehicleBinding`: reads the Jolt chassis pose/velocity, applies vehicle forces/torques to the Jolt dynamic body, and steps both systems at the same fixed interval.
- `RigidBodySolver::QuerySurface`: Jolt narrow-phase ray hit, world-space normal, and collision body's friction coefficient. The binding uses this by default for tyre ground samples and road-material friction, while allowing a scene-provided query override.
- `VehicleContactMaterial.h`: mechanical tyre and road coefficients are distinct from visual PBR materials; the coefficients combine symmetrically. The existing `EngineContent/MaterialArchives/TextureStudio/performance-rubber.material` is a render material, not a substitute for contact parameters.

The root target `FrontierVehiclePhysics` now contains the native model and binding, and links the existing `FrontierJoltPhysicsExtension` (Jolt 5.3.0 remains pinned to the owner-reference revision `0373ec0d…`).

## Verification

Standalone configure/build/test:

```sh
python Automation/PrepareJolt.py
cmake -S Exhibits/VehiclePhysics -B Build/VehiclePhysics
cmake --build Build/VehiclePhysics --parallel
ctest --test-dir Build/VehiclePhysics --output-on-failure
```

Latest sandbox run: **6/6 CTest tests passed**, including the upstream vehicle-equation and mock-scene suites, generic Jolt body validation, and `JoltVehicleBindingValidation`. The Jolt vehicle test queries the actual Jolt plane for surface normal and friction, registers a 4-wheel ControlVehicle geometry/configuration, verifies four tyre contacts, then drives the actual dynamic Jolt chassis to **15.240 m/s**. The legacy JS-derived Pacejka and wheel-spin programs remain isolated as provisional exhibit-only checks; their sources are no longer included in the `FrontierVehiclePhysics` product library.

## Remaining integration boundary

The C++ dynamics and a real Jolt chassis/ground/material-query path are now connected and validated. The binding's default surface sampler is a vertical ray fan (appropriate for this +Z-up vehicle); a project can override it for a terrain/heightfield-specific sampler. The actual Project-Drive scene, rendered ControlVehicle mesh/socket asset transfer, wheel visual-material assignment, and Windows/MSVC application build are not yet integrated or proven. This test does not claim Vulkan/GPU/native-window proof.
