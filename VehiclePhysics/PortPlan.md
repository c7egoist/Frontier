# GRIT → Frontier Vehicle Physics Port — Plan of Record

**Codename:** `Project-Tractrix` (a duplicate of Project-Zero as the host showcase).
**Source project:** `SultanAladin/GRIT` — Chaos PBD vehicle, line-trace suspension, Pacejka tyres, full drivetrain, EpicAdapter/EOS.
**Target project:** `SultanAladin/Frontier-` (`main`) — Jolt 5.6.x rigid-body engine (`Engine/PhysicalDynamics/RigidBodySolver.{h,cpp}`).

> ### ⚠ SOURCE-OF-TRUTH CORRECTION (2026-09-29)
> The authoritative GRIT source is branch **`source-only`** (`e61b15c`, 2026-09-29) — **not** `main`
> (`f89d924`, 2026-01-09, **8 months stale**). `source-only`'s `VehicleFramework/VehicleSolver.cpp` is **8,413 lines**
> and contains subsystems missing from `main`: **Aerodynamics**, Fuel, Coolant/EngineOil/Thermal, Turbo+Supercharger,
> ABS, Pacejka `.tyrx` tyre specs, and a real input `Controllers/VehicleController` (UE Enhanced Input). Phases 0–3
> were built against stale `main`; from **Phase 5** onward the driving layer is **re-ported from `source-only`**, keeping
> the Phase-2 XPBD soft tyre. See `Phase5-SourceOnly-Report.md`.

> This is a **re-implementation**, not a code copy. Chaos ↔ Jolt differ in units (cm → m, ÷100), handedness
> (LH → RH), and force units (N/cm → N/m). The *model math* (Pacejka, strut, drivetrain ODEs) ports close to
> verbatim; the *integration seam* is rebuilt against Jolt.

---

## Phase 0 — Seam + thread + soft-tyre skeleton  **(this deliverable)**

Everything here is delivered as a path-mirrored `Overlay/` tree plus a duplication script; nothing is committed into
the Frontier repo by this deliverable (see `README.md` for how to apply it).

| Item | Where | Status |
|------|-------|--------|
| Duplicate Project-Zero → Project-Tractrix | `Overlay/Projects/Project-Tractrix/Build/DuplicateFromProjectZero.py` | ✅ script + CMake snippet |
| Jolt seam: explicit single step | `RigidBodySolver::StepOnce()` | ✅ |
| Jolt seam: forces/torques (incl. at-point) | `ApplyForce / ApplyForceAtPoint / ApplyTorque / ApplyAngularImpulse` | ✅ |
| Jolt seam: body queries | `QueryBodyMass / QueryCenterOfMass / QueryPointVelocity` | ✅ |
| Jolt seam: scene casts | `CastRay / CastSphere / CastCylinder` → `SceneCastResult` | ✅ |
| Jolt seam: **heightfield terrain** | `CreateHeightfieldBody(HeightfieldDescription)` | ✅ |
| Jolt seam: strut constraint | `CreateDistanceSpring / DestroyConstraint` | ✅ |
| Custom physics thread + GT↔PT conduit | `VehiclePhysicsThread.{h,cpp}` + `DataChannel<T>` | ✅ compiled + tested |
| XPBD soft-tyre ring (skeleton) | `XPBDTyreSolver.{h,cpp}` | ✅ compiled + tested |

**Verified locally** (`g++ -std=c++17 -O2 -Wall -Wextra`, mock solver, no Jolt/Vulkan): the thread holds its fixed
cadence (72 steps in 300 ms @ 240 Hz, 0 dropped, realtime ratio 1.000) and the XPBD ring settles on flat ground with a
correctly-signed upward hub reaction and no sink-through. The Jolt-touching TU (`RigidBodySolver.cpp`) is written to
Jolt 5.6.x API idioms and only compiles inside the Frontier tree (Jolt headers absent from the sandbox).

> **Heightfield frame note (important for the terrain author):** Jolt lays its heightfield in the local X/Z plane with
> height along +Y. The seam wraps the shape with a +90° rotation about X so that, in Frontier's **+Z-up** world:
> sample **row → world +X**, **height → world +Z**, and sample **column → world −Y**. `SampleCount` must be a non-zero
> multiple of 8; `Samples` is row-major.

### Phase-0 caveat — the XPBD tyre is a *skeleton*
`XPBDTyreSolver` implements a correct, stable XPBD substep loop (predict → spoke/hoop/contact projection → velocity
update) over a single ring, but its stiffness/mass are **provisional and uncalibrated**. The reported `NetForce`
magnitude is not yet physical. Calibration + validation is Phase 2 — do not wire its output to a shipping vehicle yet.

---

## Phase 1 — Analytic vehicle on shapecast wheels  **(validation gate)**

Port from GRIT, on rigid wheels that probe the heightfield via `CastCylinder` / a multi-ray fan:

- **Pacejka '96 Magic Formula** tyre (long. + lat. + combined slip, load sensitivity, relaxation length).
- **MacPherson/strut suspension** (spring + damper + anti-roll) driven through `ApplyForceAtPoint` and/or
  `CreateDistanceSpring`.
- **Drivetrain**: engine torque curve → **DCT** (two clutches / two shafts, torque cross-fade, regularised/Karnopp
  clutch friction) → diff → wheels; **turbo** (1st-order spool ODE + wastegate/BOV) and **supercharger** (belt ω,
  parasitic drain) as isolated, unit-tested modules.

> **Gate (user requirement): correctness must be verified before porting continues.** Build a headless CPU harness that
> replays GRIT input traces and compares Frontier telemetry (slip ratio/angle, tyre force, wheel load, engine/turbo
> speed, gear state) against GRIT reference logs within tolerance. No Phase-2 work until Phase-1 passes this gate.

---

## Phase 1 — Vehicle-model port + validation  **(delivered)**

Pure-C++, sandbox-compilable port of GRIT's force models under `Overlay/Engine/PhysicalDynamics/Vehicle/`, with a
headless 3-layer validation harness. **See `Phase1-Port-and-Validation.md` for the full writeup.**

| Item | Where | Status |
|------|-------|--------|
| Pacejka MF6.1 (Fx/Fy/Mz + combined slip) | `Vehicle/PacejkaTyreModel.{h,cpp}` | ✅ line-for-line from GRIT source |
| Contact-slip solvers (Newton ref + relaxation-length) | `Vehicle/TyreSlipDynamics.{h,cpp}` | ✅ |
| Strut spring (lin/prog/digr) + damper | `Vehicle/SuspensionModel.h` | ✅ |
| Drivetrain (engine RK4, turbo STAGE 1–7, clutch, gearbox, 4-mode diff) | `Vehicle/Drivetrain.{h,cpp}` | ✅ |
| Validation harness (35 checks) | `Vehicle/VehicleValidation.cpp` | ✅ 35/35 pass |

**Researched improvement:** transient **relaxation-length** tyre solver (Pacejka & Besselink 1997) added alongside the
GRIT-faithful Newton reference — matches steady state exactly, ~15× fewer force evals/step, and is unconditionally stable
at low speed where the raw Magic Formula diverges. Recommended as the production path.

> **GRIT-fidelity caveat:** GRIT needs Unreal+Chaos and cannot run in-sandbox, so "vs GRIT" = equation/constant fidelity
> (re-read from source) + an independent oracle sweep (< 0.5 N) + physics invariants. A live telemetry diff needs
> user-supplied GRIT `TelemetryLogger` logs.

## Phase 2 — XPBD soft tyre replaces the analytic tyre  ✅ **COMPLETE** (see `Phase2-XPBD-Soft-Tyre.md`)

A calibrated **multi-ring XPBD carcass** (320 nodes = 5 rings × 64 segments) with hoop / lateral / shear / spoke
compliant constraints, an inflation-pressure body-force as the primary load carrier, direct node-vs-ground contact
(**no raycast** — the Phase-3 heightfield primitive), and a **compliant tread-bristle brush** for friction. The emergent
contact force was calibrated to, then **cross-validated against, the Phase-1 Pacejka baseline**.

| Item | Where | Status |
|------|-------|--------|
| Multi-ring soft carcass + pressure + contact | `Vehicle/XPBDSoftTyre.{h,cpp}` | ✅ ships pre-calibrated |
| Brush-model tread friction (bristle stick/slip) | `Vehicle/XPBDSoftTyre.cpp` | ✅ gradual build-up, μ-cone saturation |
| Cross-validation vs Pacejka | `Vehicle/XPBDTyreValidation.cpp` | ✅ **14/14 pass** |

Results at Fz ≈ 5.25 kN: correct signs everywhere · free-roll residual < 4 % load · Fx & Fy peaks within 0.5–1.3× of
Pacejka with slip/cornering stiffness in-band · correct load sensitivity. **Known limitation:** `Mz` has the correct
sign but ~10× small magnitude (contact-patch length under-resolves the pneumatic trail) — documented, closes with finer
meshing. Build: `g++ -std=c++17 -O2 XPBDSoftTyre.cpp PacejkaTyreModel.cpp XPBDTyreValidation.cpp -o xpbdval && ./xpbdval`.

## Phase 3 — Low-poly drivable scene  ✅ **COMPLETE** (see `Phase3-Drivable-Scene.md`)
A drivable car on a **Jolt-heightfield** test track inside Project-Tractrix, driven by the Phase-0 physics thread. The
chassis is a rigid box; each corner is a Phase-2 **XPBD soft tyre** whose nodes contact the heightfield **directly**
(no raycast). The soft tyre carries the vertical load (it is the suspension spring, with an added shock-absorber term);
a thin driving layer turns throttle/brake/steer into in-plane forces bounded by the friction circle `μ·Fz`.

| Item | Where | Status |
|------|-------|--------|
| Vehicle controller (chassis + 4 soft tyres + driving layer) | `Vehicle/VehicleController.{h,cpp}` | ✅ engine-agnostic (hook-based) |
| Procedural Jolt-heightfield track + direct node sampler | `Projects/Project-Tractrix/Source/TractrixTestTrack.h` | ✅ |
| Scene assembly (solver + track + controller + thread) | `Projects/Project-Tractrix/Source/TractrixVehicleScene.h` | ✅ in-tree |
| Headless drive test (mock chassis + mock heightfield) | `Vehicle/VehicleSceneValidation.cpp` | ✅ **19/19 pass** |

Placeholder car = **box + four wheels** (`CarModelling/Cars/BoxCar.scr`), box not touching the wheels (the user will
author real bodywork). Validated invariants: settles carrying exactly `1.000·mg` on 4 wheels with no sink-through;
accelerates; brakes to a dead stop without reversing; steers/yaws while upright; rests stably on a 6 % slope.

## Phase 5 — Re-port driving layer from GRIT `source-only`  🔶 **IN PROGRESS** (see `Phase5-SourceOnly-Report.md`)
Keeps the Phase-2 XPBD soft tyre + Jolt heightfield + physics thread; re-derives the driving layer from the
up-to-date `source-only` branch, one subsystem at a time (drivable-first). **This milestone ships the first two:**

| Item | Where | Status |
|------|-------|--------|
| **Aerodynamics** (faithful port of `ComputeAerodynamicForces`) | `Vehicle/Aerodynamics.{h,cpp}` | ✅ wing/splitter/canards/diffuser/skirts/vortex/body |
| Aero wired into the driving layer (drag→chassis, downforce→wheel Fz) | `Vehicle/VehicleController.{h,cpp}` | ✅ |
| Aero physics invariants | `Vehicle/AerodynamicsValidation.cpp` | ✅ **23/23** |
| Aero end-to-end drive proof (on/off compare) | `Vehicle/AeroIntegrationTests.cpp` | ✅ **8/8** |
| **Engine-agnostic input controller** (WASD + gamepad/wheel) | `Vehicle/VehicleInputController.h` | ✅ |
| Input invariants | `Vehicle/VehicleInputTests.cpp` | ✅ **16/16** |

**Roadmap (subsequent milestones, phase-by-phase from `source-only`):** Fuel (`FuelControlSystem`+`FuelSpecifications`) →
Thermal (Coolant/EngineOil/Thermal) → ABS → Supercharger, then reconcile the core solver params against `.tyrx`
Pacejka specs (GT3/LMP3/rally/drift/street). Each lands as a self-contained module + validation, same as Aerodynamics.

## Phase 6 — EOS networking  *(deferred — "tomorrow")*
Server-authoritative simulation + client prediction/reconciliation, porting GRIT's EpicAdapter/EOS seam
(`GameContext/AuthenticationContext`, `GameContext/SessionAdapter`).

---

## Locked decisions
- Terrain = **Jolt heightfield** (no terrain exists in Frontier yet; arbitrary-mesh terrain deferred).
- Tyres = **XPBD soft body** (rigid-XPBD); everything else rigid in Jolt.
- **Custom physics thread required** (done, Phase 0).
- New project is a **duplicate of Project-Zero** (done, via script).
- EOS deferred to a later pass.
