# GRIT → Frontier Vehicle Physics Port — Plan of Record

**Codename:** `Project-Tractrix` (a duplicate of Project-Zero as the host showcase).
**Source project:** `SultanAladin/GRIT` (`main`) — Chaos PBD vehicle, line-trace suspension, Pacejka tyres, full drivetrain, EpicAdapter/EOS.
**Target project:** `SultanAladin/Frontier-` (`main`) — Jolt 5.6.x rigid-body engine (`Engine/PhysicalDynamics/RigidBodySolver.{h,cpp}`).

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

## Phase 2 — XPBD soft tyre replaces the analytic tyre

Extend `XPBDTyreSolver` to a calibrated multi-ring carcass: inflation-pressure volume constraint, sidewall + tread-band
constraints, tread-block friction with relaxation length, thermal coupling. Calibrate against, then cross-validate with,
the Phase-1 Pacejka baseline before switching the vehicle over. Tyre nodes become the ground-contact primitive (they
touch the heightfield directly — no raycast).

## Phase 3 — Low-poly drivable scene
A low-poly car on a Jolt-heightfield test track inside Project-Tractrix, driven by the physics thread. Low-poly is
acceptable per the user.

## Phase 4 — EOS networking  *(deferred — "tomorrow")*
Server-authoritative simulation + client prediction/reconciliation, porting GRIT's EpicAdapter/EOS seam
(`GameContext/AuthenticationContext`, `GameContext/SessionAdapter`).

---

## Locked decisions
- Terrain = **Jolt heightfield** (no terrain exists in Frontier yet; arbitrary-mesh terrain deferred).
- Tyres = **XPBD soft body** (rigid-XPBD); everything else rigid in Jolt.
- **Custom physics thread required** (done, Phase 0).
- New project is a **duplicate of Project-Zero** (done, via script).
- EOS deferred to a later pass.
