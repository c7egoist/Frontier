# Phase 3 — Low-poly drivable scene on a Jolt heightfield

**Codename:** `Project-Tractrix`  ·  **Status:** delivered (headless-validated; engine assembly path-mirrored in `Overlay/`).

Phase 3 assembles everything from Phases 0–2 into one **drivable vehicle on a Jolt heightfield**, per the locked decisions:
terrain = Jolt heightfield, tyres = XPBD soft body, everything else rigid in Jolt, stepped on the dedicated physics thread.

> The user's placeholder car for this phase is a **box chassis + four wheels** (`CarModelling/Cars/BoxCar.scr`), with the
> box deliberately **not touching** the wheels — matching the controller, where the hubs mount below the chassis and the
> box floats clear of the tyres. Real bodywork will be authored later by the user; the physics does not depend on it.

## What ships

| Item | Where | Builds in sandbox? |
|------|-------|--------------------|
| Drivable vehicle: rigid chassis + 4 XPBD soft tyres, two driving layers | `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleController.{h,cpp}` | ✅ (engine-agnostic, hook-based) |
| Headless drive test — **both** models (mock chassis + mock heightfield) | `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleSceneValidation.cpp` | ✅ **38/38 pass** (19 per model) |
| Procedural Jolt-heightfield test track + direct node sampler | `Overlay/Projects/Project-Tractrix/Source/TractrixTestTrack.h` | in-tree only (Jolt) |
| Scene assembly: solver + track + controller + physics thread | `Overlay/Projects/Project-Tractrix/Source/TractrixVehicleScene.h` | in-tree only (Jolt) |

## Design

**The soft tyre is the suspension.** Each corner runs a Phase-2 `XPBDSoftTyre` whose nodes contact the heightfield
**directly** through a `GroundQuery` — no raycast, exactly the Phase-3 requirement. The tyre carries the vertical wheel
load `Fz` (it is the compliant spring between chassis and ground) and its friction coefficient sets the grip limit. A
shock-absorber term (`SuspensionDamping`) damps the vertical hub velocity so the soft carcass does not bounce. Both
driving layers below share this identical vertical-load / heightfield-contact path.

### Driving layers — selectable via `config.Model`

**`DrivingModel::PacejkaDrivetrain` (default, production).** The full powertrain and tyre-slip model, combining Phase 1
and Phase 2 with real per-wheel spin state:

```
throttle → Drivetrain (engine → turbo → clutch → gearbox → LSD)  ─┐   (Phase-1 Drivetrain, GT-R defaults)
                                                                  ▼
per wheel:   Iw·ω̇ = T_drive − Fx·Reff − T_brake·sign(ω) − T_roll       (wheel-spin ODE)
             slip κ,α from (Vx, Vsy, ω·Reff)  →  Fx, Fy, Mz            (Phase-1 Pacejka MF6.1 via TyreSlipDynamics)
             force  fwd·Fx + left·Fy + up·Fz  applied at the contact patch
```

- **Drivetrain** (`Drivetrain::Step`) turns throttle + gear + the driven wheels' rpm feedback into per-wheel drive
  torque, with an **AMT auto-clutch**: it holds neutral at a standstill (no idle creep) and engages 1st on throttle,
  auto-shifts on engine rpm with a cooldown, and declutches back to neutral when it rolls to a stop.
- **Wheel spin** is integrated per wheel. A driven wheel's effective inertia includes the drivetrain inertia reflected
  through `(gear·finalDrive)²` — both physically correct and required for stability (the stiff clutch coupling would
  otherwise blow up explicit integration at 240 Hz).
- **Tyre forces** are the transient Magic-Formula (`TyreSlipDynamics`, **relaxation-length** solver — zero-speed stable,
  no velocity-in-denominator singularity). Slip ratio `κ` and slip angle `α` come from the hub velocity and the wheel's
  own spin `ω·Reff`; the resulting `Fx, Fy` (full combined slip, aligning torque `Mz` left **emergent**) are applied at
  the patch. Genuine wheelspin, lockup and slip-limited grip all fall out of this.
- **Low-speed stabilisation.** At a standstill the deflection spring saturates (dry-friction relay) and the wheel-spin
  couples to it undamped. The wheel spin is therefore integrated **semi-implicitly**, viscously relaxed toward the
  kinematic rolling speed `Vx/Reff`; that damping is strong at low speed and **fades out with speed**, so at speed the
  wheel spins/locks under the pure slip dynamics. A matching lateral contact damper suppresses the standstill lateral
  relay. Both dampers vanish at the steady-state operating point, so they do not alter the physical tyre forces.
- **Braking** is a torque on the wheel (`MaxBrakeTorquePerWheel`, plus rear-only `HandbrakeTorque`), anti-reversal
  clamped so a locked wheel stays locked (`κ → −1`, full braking force) while moving and the car holds at rest.

**`DrivingModel::SimpleFrictionCircle` (fallback).** The original Phase-3 arcade layer, kept as a validated, selectable
alternative: driver input becomes in-plane forces bounded by the friction circle `|F_plane| ≤ μ·Fz` — longitudinal =
engine − brake (clamped to `m·|v|/Δt`, never reverses), lateral = load-scaled cornering opposing side-slip, rolling
resistance ∝ `Fz`. No wheel-spin or drivetrain state; useful as a lightweight/deterministic baseline.

Both layers apply forces through the same `ApplyForceAtPoint` seam at the contact patch, so the in-engine assembly is
unchanged when switching models.

**Engine-agnostic + threaded.** `VehicleController` mentions no Jolt: it reaches the chassis through `Hooks`
(`ReadChassis` / `ApplyForceAtPoint` / `ApplyTorque`) and the ground through the tyre's `GroundQuery`. In-engine,
`TractrixVehicleScene` binds those hooks to `RigidBodySolver` and drives `controller.Step(dt); solver.StepOnce();` from
the Phase-0 `VehiclePhysicsThread` at 240 Hz; the game thread exchanges `DriverInput` / `VehicleTelemetry` over the
lock-free `DataChannel`s. The headless test binds the same hooks to a mock semi-implicit-Euler box, so the whole
controller is validated without Jolt.

## Validation (headless drive test)

```
g++ -std=c++17 -O2 -Wall -Wextra VehicleSceneValidation.cpp VehicleController.cpp \
    XPBDSoftTyre.cpp PacejkaTyreModel.cpp TyreSlipDynamics.cpp Drivetrain.cpp -o vscene && ./vscene
```

The suite runs the **same five physical invariants for both driving models**. 1200 kg car, 4 wheels, RWD, front-steer,
soft XPBD tyres (R = 0.34 m), 240 Hz:

| Scenario | Checks | PacejkaDrivetrain | SimpleFrictionCircle |
|----------|--------|-------------------|----------------------|
| **Settle** (flat, no input) | finite · upright · 4/4 in contact · load = 1.000·mg · v_z→0 · no sink-through | ✅ (ride 0.890 m) | ✅ (ride 0.890 m) |
| **Accelerate** (throttle 1) | speed > 5 m/s · Δx > 5 m · upright · on wheels | ✅ ~25 m/s, Δx ~55 m | ✅ ~36 m/s, Δx ~95 m |
| **Brake** (brake 1) | was moving · **stops to 0.00 m/s** (no reverse) | ✅ → −0.001 m/s | ✅ → 0.000 m/s |
| **Steer** (throttle 0.3, steer 0.7) | heading changes · moves toward steer · stays upright | ✅ | ✅ |
| **Slope** (6 % grade heightfield, handbrake) | finite · no sink-through · 4/4 in contact · upright | ✅ | ✅ |

**Result: 38 / 38 pass (19 per model).** The production model is grip-limited to a realistic ~25 m/s launch (the tyre
slip forces cap traction and the AMT shifts through the gears); the arcade model, force-bounded rather than slip-based,
reaches ~36 m/s. (Note: driving to high speed and applying full lock will roll a high-CoM box — correct rollover
dynamics, not a bug; the cornering test uses a realistic input.)

## Applying the overlay in-engine

1. Copy `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleController.{h,cpp}` into the Frontier tree (alongside the Phase
   1–2 `Vehicle/` modules) and add `VehicleController.cpp` to the Project-Tractrix source list. The production model links
   the already-vendored Phase-1/2 units `PacejkaTyreModel.cpp`, `TyreSlipDynamics.cpp` and `Drivetrain.cpp` (also add
   them to the source list if the project does not already build them).
2. Copy `Overlay/Projects/Project-Tractrix/Source/TractrixTestTrack.h` and `TractrixVehicleScene.h` into the duplicated
   project (see `Overlay/Projects/Project-Tractrix/Build/DuplicateFromProjectZero.py`).
3. In the project bootstrap: `TractrixVehicleScene scene; scene.Bring();` then each game tick `scene.SetInput(input);`
   and read `scene.Telemetry(t)` to place the chassis box + four wheels for rendering.

## Done since first delivery
- **Production driving layer** — the in-plane arcade layer has been superseded by `DrivingModel::PacejkaDrivetrain`
  (default): full Phase-1 Pacejka combined-slip forces + engine/turbo/clutch/gearbox/LSD drivetrain + per-wheel spin
  state, on the same soft-tyre `Fz` / direct-heightfield-contact path. The arcade layer remains as a selectable fallback.

## Deferred
- **Phase 4 — EOS networking** (server-authoritative sim + client prediction), porting GRIT's EpicAdapter/EOS seam.
