# Vehicle Physics — Pacejka MF6.1 slice

First Phase 7 deliverable: a portable, headless pure-slip and combined-slip tyre-force core, ported from the
owner-authorized previous project **`SultanAladin/Frontier-` @ `3382938`**. The specific reference files are
`Experimental/VehicleHmiPrototype/Source/TyreSlipSolver.js` and `VehicleSpecification.js`. Neither the reference JS nor
unrelated VehicleHMI demo JS is copied into this checkout.

## Implemented

- Longitudinal MF6.1 force `Fx(κ, γ, Fz)` with the source clamp `κ ∈ [-0.92, 1.5]`.
- Lateral MF6.1 force `Fy(α, γ, Fz)` with `α ∈ [-1.3, 1.3]` rad and camber thrust/shift.
- Combined-slip cosine weighting `Gxα`, `Gyκ`, and lateral `SVyκ`, using normalized pure-slip stiffnesses.
- Load-scaled longitudinal/lateral relaxation lengths, including the reference 5% lower load-ratio floor.
- Default parameter sheet from the previous project's `PacejkaParameters` (GRIT FTireSpecSheet coefficients).

The implementation is isolated under `Frontier/Engine/Physics/`; no vehicle integration or Jolt API leaks into the
portable tyre mathematics.

## Reproduction and verification

```sh
g++ -std=c++17 -O2 -Wall -Wextra -Werror -I Frontier \
  Exhibits/VehiclePhysics/PacejkaSlipValidation.cpp \
  Frontier/Engine/Physics/PacejkaSlipSolver.cpp \
  -o /tmp/PacejkaSlipValidation
/tmp/PacejkaSlipValidation
```

Result: **67 checks, 0 failed**. Thirteen slip/load/camber tuples were evaluated by the original JS source at
reference commit `3382938`; C++ pure Fx, pure Fy, combined Fx/Fy, plus four-load relaxation lengths agree to relative
tolerance `2e-12` (absolute floor `1e-8`). Additional checks pin zero-load handling and both slip saturation bounds.
GCC 12.2.0, C++17, `-Wall -Wextra -Werror` is clean. Golden outputs were generated with Node.js v22.22.3.

CMake target: `PacejkaSlipValidation` in this directory. CMake was not available in the sandbox, so the exact target
sources were compiled directly with g++ as above.

## Phase 7 boundary

This is **not** a vehicle simulation or Jolt integration. Still outstanding: transient slip relaxation dynamics,
contact/load/suspension, wheel angular integration, powertrain/brakes/aero, vehicle stability port of
`VehicleStability.mjs`, Jolt native world/body lifecycle/contact validation, and the Windows SDK build. The authorized
previous project's `JoltWorld.js` uses Jolt 1.1.0 WASM; this repository currently has no native Jolt dependency or C++
build target. No dependency was silently vendored and no native/Jolt result is claimed. Phase 8 remains deferred.
