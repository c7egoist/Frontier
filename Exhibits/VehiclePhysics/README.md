# Vehicle Physics — portable tyre and wheel slices

Phase 7 portable physics components are being ported from the owner-authorized previous project
**`SultanAladin/Frontier-` @ `3382938`**. References include
`Experimental/VehicleHmiPrototype/Source/TyreSlipSolver.js`, `VehicleSolver.js`, and `VehicleSpecification.js`.
Neither the reference JS nor unrelated VehicleHMI demo JS is copied into this checkout.

## Implemented

- Longitudinal MF6.1 force `Fx(κ, γ, Fz)` with the source clamp `κ ∈ [-0.92, 1.5]`.
- Lateral MF6.1 force `Fy(α, γ, Fz)` with `α ∈ [-1.3, 1.3]` rad and camber thrust/shift.
- Combined-slip cosine weighting `Gxα`, `Gyκ`, and lateral `SVyκ`, using normalized pure-slip stiffnesses.
- Load-scaled longitudinal/lateral relaxation lengths, including the reference 5% lower load-ratio floor.
- Backward-Euler transient-slip integration from the reference `VehicleSolver.js`, with source clamps `κ ∈ [-1.5, 1.5]` and `α ∈ [-1.3, 1.3]`; nonpositive timesteps preserve the input coordinates.
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

Results: `Pacejka MF6.1 validation: 94 checks, 0 failed`; `Wheel spin validation: 25 checks, 0 failed`.
Thirteen tyre slip/load/camber tuples and four relaxation loads were compared to JS outputs; ten transient-slip
cases cover forward/reverse motion, loading and timesteps, with clamp, boundedness and steady-state checks. Eleven
wheel-spin tuples differentially cover drive, braking, tyre reaction, pressure-dependent rolling resistance, contact,
shredded tyres, reverse rotation, and JavaScript-compatible signed angle wrapping. GCC C++17 `-Wall -Wextra -Werror`
passes; oracle values were generated using Node.js v22.22.3.

CMake targets and CTest entries: `PacejkaSlipValidation` and `WheelSpinValidation`. CMake is not installed in the
sandbox, so both targets are compiled directly with g++ as shown.

## Phase 7 boundary

This remains **not** a vehicle simulation or Jolt integration. Still outstanding: contact/load/suspension coupling,
vehicle-level powertrain/brakes/aero, stability port of `VehicleStability.mjs`, Jolt native world/body lifecycle/contact
validation, and the Windows SDK build. This wheel component integrates supplied drive/brake torques; it does not
implement the transmission, differential, or vehicle controls. The authorized
previous project's `JoltWorld.js` uses Jolt 1.1.0 WASM; this repository currently has no native Jolt dependency or C++
build target. No dependency was silently vendored and no native/Jolt result is claimed. Phase 8 remains deferred.
