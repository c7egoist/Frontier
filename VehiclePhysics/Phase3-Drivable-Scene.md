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
| Drivable vehicle: rigid chassis + 4 XPBD soft tyres, driving layer | `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleController.{h,cpp}` | ✅ (engine-agnostic, hook-based) |
| Headless drive test (mock chassis + mock heightfield) | `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleSceneValidation.cpp` | ✅ **19/19 pass** |
| Procedural Jolt-heightfield test track + direct node sampler | `Overlay/Projects/Project-Tractrix/Source/TractrixTestTrack.h` | in-tree only (Jolt) |
| Scene assembly: solver + track + controller + physics thread | `Overlay/Projects/Project-Tractrix/Source/TractrixVehicleScene.h` | in-tree only (Jolt) |

## Design

**The soft tyre is the suspension.** Each corner runs a Phase-2 `XPBDSoftTyre` whose nodes contact the heightfield
**directly** through a `GroundQuery` — no raycast, exactly the Phase-3 requirement. The tyre carries the vertical wheel
load `Fz` (it is the compliant spring between chassis and ground) and its friction coefficient sets the grip limit. A
shock-absorber term (`SuspensionDamping`) damps the vertical hub velocity so the soft carcass does not bounce.

**Thin driving layer.** Driver input becomes in-plane forces at each contact patch, bounded by the per-wheel friction
circle `|F_plane| ≤ μ·Fz`:
- **longitudinal** = engine (driven wheels · throttle) − braking, where braking always opposes motion and is clamped to
  at most `m·|v|/Δt` per wheel so it decelerates cleanly to a standstill and **never reverses** the car;
- **lateral** = a load-scaled linear cornering force opposing side-slip velocity (front wheels steered);
- **rolling resistance** ∝ `Fz`.

This keeps the calibrated soft tyre in the loop for load, ride and grip while giving a controllable car. Swapping the
in-plane layer for the full Phase-1 Pacejka / Phase-2 emergent-slip forces (with wheel spin state) is the production
upgrade path; the seam is the same `ApplyForceAtPoint` at the patch.

**Engine-agnostic + threaded.** `VehicleController` mentions no Jolt: it reaches the chassis through `Hooks`
(`ReadChassis` / `ApplyForceAtPoint` / `ApplyTorque`) and the ground through the tyre's `GroundQuery`. In-engine,
`TractrixVehicleScene` binds those hooks to `RigidBodySolver` and drives `controller.Step(dt); solver.StepOnce();` from
the Phase-0 `VehiclePhysicsThread` at 240 Hz; the game thread exchanges `DriverInput` / `VehicleTelemetry` over the
lock-free `DataChannel`s. The headless test binds the same hooks to a mock semi-implicit-Euler box, so the whole
controller is validated without Jolt.

## Validation (headless drive test)

`g++ -std=c++17 -O2 -Wall -Wextra VehicleSceneValidation.cpp VehicleController.cpp XPBDSoftTyre.cpp -o vscene && ./vscene`

1200 kg car, 4 wheels, RWD, front-steer, soft XPBD tyres (R = 0.34 m), 240 Hz:

| Scenario | Checks |
|----------|--------|
| **Settle** (flat, no input) | finite · upright · **4/4 wheels in contact** · **total load = 1.000·mg** · v�z→0 · no sink-through (rest ride height 0.890 m) |
| **Accelerate** (throttle 1) | forward speed > 5 m/s (reached ~36) · Δx > 5 m (~95 m) · upright · on wheels |
| **Brake** (brake 1) | was moving (~36 m/s) · **stops to 0.000 m/s** (no reverse) |
| **Steer** (throttle 0.3, steer 0.7) | heading changes (~1.4 rad) · moves laterally toward steer · **stays upright** |
| **Slope** (6 % grade heightfield, handbrake) | finite · no sink-through · 4/4 in contact · upright |

**Result: 19 / 19 pass.** (Note: driving to ~35 m/s and applying full lock will roll the car — correct rollover
dynamics for a high-CoM box, not a bug; the cornering test uses a realistic input.)

## Applying the overlay in-engine

1. Copy `Overlay/Engine/PhysicalDynamics/Vehicle/VehicleController.{h,cpp}` into the Frontier tree (alongside the Phase
   1–2 `Vehicle/` modules) and add `VehicleController.cpp` to the Project-Tractrix source list.
2. Copy `Overlay/Projects/Project-Tractrix/Source/TractrixTestTrack.h` and `TractrixVehicleScene.h` into the duplicated
   project (see `Overlay/Projects/Project-Tractrix/Build/DuplicateFromProjectZero.py`).
3. In the project bootstrap: `TractrixVehicleScene scene; scene.Bring();` then each game tick `scene.SetInput(input);`
   and read `scene.Telemetry(t)` to place the chassis box + four wheels for rendering.

## Deferred
- **Phase 4 — EOS networking** (server-authoritative sim + client prediction), porting GRIT's EpicAdapter/EOS seam.
- Production tyre forces: replace the in-plane driving layer with the Phase-1/2 slip-based emergent forces + wheel-spin
  state (the vertical-load / heightfield-contact path already goes through the soft tyre).
