# Vehicle Physics — native rigid-body extension and provisional tyre slices

The authoritative native Jolt reference is **`SultanAladin/Frontier-` @ `3382938`**,
`Engine/PhysicalDynamics/RigidBodySolver.{h,cpp}`, with its Jolt pin in `ExternalPackages/Dependencies.lock.json`.
The C++ rigid-body port below follows that source. The existing standalone tyre/wheel solvers were authored earlier from
JavaScript in the previous project; they are not used as the ControlVehicle source of truth and must be revalidated or
replaced against the missing Project-Drive C++ tyre/dynamics sources before vehicle integration. No HTML/demo physics is
used or compared against Jolt.

## Implemented

- Longitudinal MF6.1 force `Fx(κ, γ, Fz)` with the source clamp `κ ∈ [-0.92, 1.5]`.
- Lateral MF6.1 force `Fy(α, γ, Fz)` with `α ∈ [-1.3, 1.3]` rad and camber thrust/shift.
- Combined-slip cosine weighting `Gxα`, `Gyκ`, and lateral `SVyκ`, using normalized pure-slip stiffnesses.
- Load-scaled longitudinal/lateral relaxation lengths, including the reference 5% lower load-ratio floor.
- A provisional backward-Euler transient-slip implementation with `κ ∈ [-1.5, 1.5]` and `α ∈ [-1.3, 1.3]`; not accepted as the Project-Drive vehicle source until matched to its C++ implementation.
- Default parameter sheet from the previous project's `PacejkaParameters` (GRIT FTireSpecSheet coefficients).
- `WheelSpinSolver` integrates drive torque, loaded-contact tyre reaction and pressure-sensitive rolling resistance,
  applies brake torque with the source's no-reverse-through-zero rule, then advances wheel angle.

These portable components are isolated under `Frontier/Engine/Physics/`; no vehicle integration or Jolt API leaks into
the tyre or wheel mathematics.

## Reproduction and verification

```sh
g++ -std=c++17 -O2 -Wall -Wextra -Werror -I Frontier \
  Exhibits/VehiclePhysics/PacejkaSlipValidation.cpp \
  Frontier/Engine/Physics/PacejkaSlipSolver.cpp \
  -o /tmp/PacejkaSlipValidation && /tmp/PacejkaSlipValidation

g++ -std=c++17 -O2 -Wall -Wextra -Werror -I Frontier \
  Exhibits/VehiclePhysics/WheelSpinValidation.cpp \
  Frontier/Engine/Physics/WheelSpinSolver.cpp \
  -o /tmp/WheelSpinValidation && /tmp/WheelSpinValidation
```

Legacy provisional-suite results: `Pacejka MF6.1 validation: 94 checks, 0 failed`; `Wheel spin validation: 25 checks, 0 failed`.
These fixtures retain JS-derived numerical oracles from earlier work; they are not the Project-Drive C++ vehicle oracle,
are not a complete-car validation, and are not compared with Jolt. GCC C++17 `-Wall -Wextra -Werror` passes.

CMake targets and CTest entries: `PacejkaSlipValidation`, `WheelSpinValidation`, and `JoltPhysicsValidation`.
Restore the pinned, ignored Jolt source before configuring:

```sh
python Automation/PrepareJolt.py
cmake -S Exhibits/VehiclePhysics -B Build/VehiclePhysics
cmake --build Build/VehiclePhysics --parallel
ctest --test-dir Build/VehiclePhysics --output-on-failure
```

Jolt is pinned to the owner-reference lock at upstream **5.3.0** (`0373ec0d…`) by `Automation/JoltDependencies.json`
and verified against the archive SHA-256 there. `RigidBodySolver` is the C++ rigid-body-world port: static/kinematic/
dynamic bodies, box/sphere/capsule/cylinder/plane shapes, layers, fixed-step accumulation, interpolation, sleep, readback,
impulses, teleports, and Jolt registration lifecycle. The extension target is `FrontierJoltPhysicsExtension`.

## Phase 7 boundary

The owner-reference C++ `RigidBodySolver.cpp` is a generic Jolt rigid-body world; inspection confirms it contains no
ControlVehicle drivetrain, suspension, or tyre dynamics. The native solver is now ported and validated against Jolt
5.3.0. ControlVehicle geometry/specification and full vehicle dynamics, suspension/contact coupling, transmission /
differential, vehicle-level brake/control integration, aero, appropriate ControlVehicle/tyre visual material assets,
the custom tyre-to-Jolt chassis bridge, and Windows SDK verification remain outstanding. The owner-linked branch's
`VehicleSolver.js` is not being used as physics source, and no HTML/demo physics is compared against Jolt. Phase 8
remains deferred.
