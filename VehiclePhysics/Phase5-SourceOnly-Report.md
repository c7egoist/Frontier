# Phase 5 — Re-port from GRIT `source-only`: Aerodynamics + Input Controller

**Status:** 🔶 in progress · this milestone = Aerodynamics subsystem + engine-agnostic input controller.
**Basis:** `SultanAladin/GRIT@source-only` (`e61b15c`, 2026-09-29) — the up-to-date branch, *not* the 8-month-stale `main`.
**Keeps:** Phase-2 XPBD soft tyre, Jolt heightfield terrain, custom physics thread. **Re-ports:** the driving layer.

---

## 1. Why this re-port exists

Phases 0–3 were built against GRIT `main` (`f89d924`, 2026-01-09). Comparing branches revealed `main` is **8 months
behind** `source-only`, whose `VehicleFramework/VehicleSolver.cpp` is **8,413 lines** (vs `main`'s small one) and
already contains the subsystems a prior audit wrongly reported "absent": **Aerodynamics**, Fuel, Coolant/EngineOil/
Thermal, Turbo **and** Supercharger, ABS, Pacejka `.tyrx` tyre specs (GT3/LMP3/rally/drift/street), plus a real
`Controllers/VehicleController` (UE `APlayerController` + Enhanced Input). `source-only` ships **source only** (no
`Content/` `.uasset`s), so it is the authoritative *code* reference.

Approach agreed with the user: **rewrite from Phase 2** (keep the XPBD soft tyre), **drivable-first** — re-port the core
plus **one** added subsystem to prove the pipeline, then add the rest phase-by-phase. The chosen proof subsystem is
**Aerodynamics** (self-contained, well-defined equations, easy to validate headless). This milestone also adds the
**input controller** the user asked for.

---

## 2. Aerodynamics — faithful port of `ComputeAerodynamicForces()`

**Files:** `Overlay/Engine/PhysicalDynamics/Vehicle/Aerodynamics.{h,cpp}`
**Ported from:** `VehicleSolver.cpp` `FVehicleSolverCallback::ComputeAerodynamicForces()` (~L2789) and the config in
`Components/AerodynamicSpecifications.h`. The formulae, coefficients, clamps and the GT3 factory defaults from
`InitializeAerodynamicsPackage()` are reproduced **verbatim**; only Unreal math (`FMath`/`FVector`) is translated to the
self-contained `Vec3` from `XPBDSoftTyre.h`. No Unreal, no Jolt — it compiles and validates in the sandbox.

### Devices modelled (GT3 adaptive kit)
| Device | Model | Key terms |
|--------|-------|-----------|
| **Rear wing** | Lifting-line (Prandtl) | `CL = base + 0.11·α`, induced drag `CL²/(π·AR·e)`, e=0.82; DRS-style adaptive angle + aero-brake deploy |
| **Canards ×4** | Lifting-line | as wing, e=0.78, throttle-reduction + damage factor |
| **Front splitter** | Pressure coeff + ground effect | `q·A·Cp·(h_ref/h)^(sens·0.08)` clamped 0.6–2.8 |
| **Underbody + diffuser** | Bernoulli venturi + expansion | `Cp_floor = 1−1.5²`, diffuser Cp (Cooper 1998), ride-height map peaking at optimum |
| **Side skirts L/R** | Ground-effect sealing | suction ∝ blockage ratio, sealing efficiency |
| **Vortex generators** | Enhancement + drag | boosts diffuser/underbody downforce, adds drag penalty |
| **Body** | 3D component drag | `−½ρ·v·|v|·A·Cd` per body axis, body lift, side-force |

Global modifiers: dynamic pressure `q = ½ρV²`; **sideslip loss** `clamp(1 − 0.18·|β|, 0.82, 1)`; below **0.5 m/s** all
aero is zero. Outputs: total/front/rear downforce, world drag/lift/side vectors, and pitch/roll/yaw moments about the CoM.

### Faithfulness note (an inherited GRIT quirk, preserved deliberately)
GRIT computes `CL = BaseCoeffLift + 0.11·angle` with `BaseCoeffLift ≈ −3.2`. Because the base is strongly negative,
**reducing** the wing angle makes `CL` *more* negative ⇒ *more* |downforce| and induced drag — the inverse of a real
DRS, yet exactly what the source computes. The port reproduces this; the validation asserts the *faithful* behaviour
(adaptation is active past threshold; the gate deploys under braking; handbrake suppresses it) rather than idealized DRS
semantics. Flagged here so a future pass can decide whether to "fix" GRIT or keep parity.

### How the controller applies aero
Wired in `VehicleController::StepPacejka` (the production driving layer; the `SimpleFrictionCircle` fallback ignores aero):
- **Drag + side-force + aero moments → the chassis** (`ApplyForceAtPoint` at the CoM, `ApplyTorque` for the moments).
- **Downforce → the per-axle tyre vertical load `Fz`** that feeds the Pacejka slip model. `FrontDownforce`/`RearDownforce`
  are split across the front/rear wheels and added to the grip load only — **never** to the chassis vertical force. This
  is GRIT's documented rule ("*Downforce is applied to wheel loads, NOT to chassis*", `VehicleSolver.h` ~L600); it
  reuses the existing `Fz → Pacejka` path (more `Fz` ⇒ more grip) without injecting free vertical momentum into the body.

Ride height (for the ground-effect terms) is derived each step from a ground sample under the CoM minus
`ComHeightAboveFloor_m`, so the terms respond to squat. New config lives in `VehicleControllerConfig::Aero`
(defaults `AerodynamicPackage::DefaultGT3()`); telemetry exposes the full `AeroForces` breakdown and per-wheel
`AeroDownforce`.

### Validation
- **`AerodynamicsValidation.cpp` — 23/23.** Drag ∝ V² (2× speed → 4× drag), drag opposes velocity, net downforce pushes
  DOWN, front+rear split consistent, ground effect (splitter rises as ride height drops; underbody factor peaks at the
  optimum and falls off above *and* below it), adaptive wing active past threshold, aero-brake gate + handbrake
  suppression + below-threshold no-deploy, sideslip loss + side-force, master switch, plausible GT3 magnitudes @200 km/h.
- **`AeroIntegrationChecks.cpp` — 8/8 (drives the whole car).** Aero vs no-aero:
  - **terminal speed 50.3 vs 60.1 m/s** — drag lowers top speed;
  - **coast-down (6 s) sheds 52.9 vs 35.5 m/s** — drag decelerates faster;
  - **sustained cornering 1.78 g vs 1.20 g** — downforce raises grip (measured on a roll-locked planar fixture so the
    result reflects grip, not the placeholder box's known tip-over);
  - front/rear wheels each receive multi-kN downforce at speed; telemetry exposes it.

Build: `g++ -std=c++17 -O2 AerodynamicsValidation.cpp Aerodynamics.cpp -o aero && ./aero`
and `g++ -std=c++17 -O2 AeroIntegrationChecks.cpp VehicleController.cpp Aerodynamics.cpp XPBDSoftTyre.cpp
PacejkaTyreModel.cpp TyreSlipDynamics.cpp Drivetrain.cpp -o aerodrive && ./aerodrive`.

---

## 3. Input controller — engine-agnostic WASD + gamepad/wheel

**File:** `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleInputController.h` (header-only)
**Role reference:** GRIT `Controllers/VehicleController` (UE `APlayerController` + Enhanced Input: `IA_Throttle/Brake/
Steer/Handbrake/GearUp/GearDown/…`) and `FVehicleInputConfig`/`FInputTensor`. The *engine binding* is factored out: the
game layer feeds raw button/axis state in, reads a normalised `DriverCommand` out. No Unreal/SDL/Jolt.

### Standard layout (as requested)
```
W          throttle              S          brake
A / D      steer left / right    Space      handbrake
Left-Shift sequential up-shift   Left-Ctrl  sequential down-shift    R  reset
```
Keyboard axes are digital, so throttle/brake **ramp** in/out and steering **self-centres** when A/D release (configurable
rates). Output is `DriverCommand{ DriverInput Drive; bool ShiftUp/ShiftDown; int SelectedGear; bool ResetVehicle }`.
`Drive` feeds `VehicleController::SetInput()`; the shift pulses are latched for the manual-gearbox phase (the controller
currently runs an AMT and auto-shifts). Convenience `Apply(controller, dt)` does both in one call.

### Gamepad / wheel extension points (documented, ready to wire)
- **Gamepad:** `SetThrottleAxis/SetBrakeAxis` (analog triggers), `SetSteerAxis` (stick X). `SteeringLinearity` shapes the
  stick curve. Analog axes bypass the keyboard ramps; dead-zone + sensitivity still apply.
- **Racing wheel:** `SetWheelAngle(deg)` maps the physical angle through `WheelRotationRange_deg` (default 900°) to full
  lock; `FFBStrength` is surfaced for the engine's force-feedback driver (this class computes no FFB itself).
- **H-pattern shifter:** `SelectGear(n)` instead of the sequential `ShiftUp/ShiftDown` pulses.

Config mirrors GRIT's `FVehicleInputConfig`: per-axis sensitivity, per-axis dead-zone, device-switch threshold.

### Validation
- **`VehicleInputChecks.cpp` — 16/16.** W ramps + release decay, S brake, Space handbrake, A/D steer sign + self-centre,
  edge-triggered shift pulses (delivered once, consumed), gamepad dead-zone + direct pass-through, wheel rotation-range
  mapping, sensitivity scaling.

Build: `g++ -std=c++17 -O2 VehicleInputChecks.cpp Aerodynamics.cpp XPBDSoftTyre.cpp PacejkaTyreModel.cpp
TyreSlipDynamics.cpp Drivetrain.cpp VehicleController.cpp -o input && ./input`.

---

## 4. Regression status

| Suite | Result |
|-------|--------|
| `AerodynamicsValidation.cpp` | **23/23** |
| `AeroIntegrationChecks.cpp` | **8/8** |
| `VehicleInputChecks.cpp` | **16/16** |
| `VehicleSceneValidation.cpp` (Phase-3, both models, aero integrated) | **38/38** |
| `VehicleDrivingChecks.cpp` (mechanical diagnostics, aero disabled) | **10 pass · 3 known-limitations** |

The 3 "known-limitations" are pre-existing placeholder-box artefacts (imperfect full-brake stop ~1.1 m/s; park-slope
critical angle 26.6° below `arctan μ`; high-CoM box rolls in a hard drift) — reported honestly, tracked here, and to be
revisited when a real vehicle mesh / inertia tensor replaces the box. They are **not** aero regressions.

## 5. What's next (phase-by-phase from `source-only`)
Fuel → Thermal (Coolant/EngineOil) → ABS → Supercharger, then reconcile the core solver against the `.tyrx` Pacejka
specs. Each subsystem lands as a self-contained module + headless validation, exactly like Aerodynamics.
