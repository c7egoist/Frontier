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
- `VehiclePhysicsComponent`: engine-facing lifecycle owner for the Jolt world, road, chassis and complete native vehicle configuration. It exposes input assignment, fixed stepping, chassis readback and wheel/powertrain telemetry; scenes can instead supply custom ground/material callbacks.
- `RigidBodySolver::QuerySurface`: Jolt narrow-phase ray hit, world-space normal, and collision body's friction coefficient. The binding uses this by default for tyre ground samples and road-material friction.
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

Engine integration entry point:

```cpp
Frontier::Vehicle::VehiclePhysicsComponent Vehicle;
Frontier::Vehicle::VehiclePhysicsComponentConfiguration Config;
if (Vehicle.Bring(Config)) {
    Vehicle.AssignInput({.Throttle = 0.6f, .Steer = 0.1f});
    Vehicle.StepFixed(); // call once per configured fixed step
    const auto& Wheels = Vehicle.Telemetry().Wheels;
}
```

Latest sandbox run: **7/7 CTest tests passed**, including the upstream vehicle-equation and mock-scene suites, generic Jolt body validation, Jolt surface/material query, Jolt binding, and `VehiclePhysicsComponentValidation`. The component test verifies four loaded tyre contacts, powered drivetrain/wheel spin, Jolt chassis acceleration, braking response and clean teardown. The legacy JS-derived Pacejka and wheel-spin programs remain isolated as provisional exhibit-only checks; their sources are no longer included in the `FrontierVehiclePhysics` product library.

## Remaining integration boundary

The C++ dynamics and a real Jolt chassis/ground/material-query path are now connected and validated. The binding's default surface sampler is a vertical ray fan (appropriate for this +Z-up vehicle); a project can override it for a terrain/heightfield-specific sampler. The actual Project-Drive scene, rendered ControlVehicle mesh/socket asset transfer, wheel visual-material assignment, and Windows/MSVC application build are not yet integrated or proven. This test does not claim Vulkan/GPU/native-window proof.

## Modular tyre models (XPBD spring + 3-D FEM)

Three interchangeable tyre models now sit behind the engine-agnostic `TyreModel` seam
(`Frontier/Engine/PhysicalDynamics/Vehicle/TyreModel.h`), so any component can use any model:

- `PacejkaTyreModel` — validated MF6.1 slip adapter (production default).
- `XpbdTyreSpring` — configurable XPBD tyre spring: radial sidewall spring + inflation pressure + tangential
  shear constraint relaxed by iterative projection.
- `TyreFEMSolver` — 3-D finite-element carcass: toroidal hex mesh, linear-isotropic elasticity, inflation
  pressure, penalty ground contact, semi-implicit integration.
- `TyreModelRegistry` — `CreateTyreModel(TyreModelKind)` factory.

`VehicleSolver` gained a `TyreModel` configuration knob and a `StepModular` path; `Pacejka` keeps the existing
validated behaviour unchanged. Headless validation for all three models (identical kinematics, results table,
friction-ellipse and finiteness checks) is at `TyreModelValidation.cpp` + `TyreModelValidationResults.txt`, wired
into this exhibit's CMake as the `TyreModelValidation` test. It was run locally (`g++ -std=c++20`, 0 failures);
the Jolt-dependent targets could not be compiled in this sandbox because `ExternalPackages/` is restored from
pinned dependencies and is not vendored here.
