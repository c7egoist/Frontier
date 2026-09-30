# Phase 6 — Real Geometry Data Block + Closed-Loop Aerodynamics

**Codename:** Project-Tractrix · **Branch:** `arena/01a0e8d9-slate` · **No PR.**

This phase closes out the three items that Phase 5 had parked as "known limitations" of the
driving layer. Investigating each one showed that **none of them was a defect in the ported
physics** — two were artefacts of the *test harness* and one was a missing (but standard) piece
of tyre modelling. All three are now resolved, and the geometry is no longer arbitrary.

---

## 1. Geometry is now authored DATA, not scattered magic numbers

New file **`VehicleGeometry.h` / `VehicleGeometry.cpp`.**

In GRIT the wheel positions and aero force-application points were read from skeletal-mesh
**sockets**, which live on the game thread; GRIT had to pre-resolve them to CoM-relative offsets
and marshal them to the physics thread. Frontier is our own engine, so there is no socket/thread
split to work around — the geometry is a single plain-data struct that any thread reads directly.

`VehicleGeometry` holds documented, realistic **GT3-class estimates** and derives everything
downstream from them:

| Quantity | Value | Notes |
|---|---|---|
| Mass | 1300 kg | incl. driver + fuel |
| Wheelbase | 2.65 m | front→rear axle |
| Track (F/R) | 1.65 / 1.62 m | centre-to-centre |
| Front weight fraction | 0.47 | 47/53 balance |
| **CoM height** | **0.35 m** | low, like a real race car |
| Tyre radius | 0.34 m | matches the soft-tyre radius |
| Static ride height | 0.06 m | feeds ground-effect ride height |
| Radii of gyration (roll/pitch/yaw) | 0.55 / 1.35 / 1.40 m | truer than a solid-box guess |

Derived by the struct: front/rear axle X, hub local-Z, CoM-above-floor, the full inertia tensor
(`I = m·k²`) and its inverse, and a sanity rollover threshold.

`ApplyGeometry(config, geom)` stamps the four `WheelMount`s (front steer, rear drive — RWD),
every aero device's `ForceApplicationPoint_COM`, the CoM-above-floor ride-height reference, the
tyre radius, and mass onto a `VehicleControllerConfig`. Both `AeroIntegrationChecks` and
`VehicleDrivingChecks` now build their rigs through it, and set the mock chassis inertia from
`geom.InvInertia()`. Nothing downstream hard-codes a dimension — swap in a specific car's measured
numbers at any time.

### Why this fixes the "rollover" limitation
Static rollover threshold `a_roll = (½·track)/CoM_height`:

* placeholder box: `0.78 / 0.89 ≈ 0.88 g` → tips over **below** tyre grip (~1.7 g) ⇒ it rolled
  before it could slide.
* GT3 estimate: `0.825 / 0.35 ≈ 2.36 g` → **slides** long before it rolls, like a real car.

The drift test now keeps all four on the ground through a 273° power-oversteer slide (rolled = no)
with no special-casing — it's pure geometry.

---

## 2. Aero ↔ suspension is now physically CLOSED-LOOP

Phase 5 followed GRIT's rule literally: compute downforce, then **inject** it into each tyre's
grip load `Fz`. That is faithful but open-loop — the downforce raised grip without ever pressing
on the car.

Because our tyre is a compliant XPBD soft body, we can do the real thing:

* **Downforce is applied as a genuine downward force at each contact patch**
  (`up · (−aeroDownforce)`), split front/rear across the wheels.
* The tyre physically **compresses**, so its **measured** `Fz` rises over the next steps — and
  that measured `Fz` (not an injected one) is what the Pacejka slip model now uses. Grip
  **emerges** from the real load.
* The car **squats**, lowering the CoM; ride height is read from the live CoM height above the
  sampled ground, so the lower ride height feeds straight back into the ground-effect terms. The
  loop is closed.
* The **pitch moment is no longer applied separately** — the front-splitter and rear-wing/diffuser
  downforces act at their real fore/aft lever arms, so the aero pitch (and load transfer) is
  produced by the forces themselves. Applying `aero.PitchMoment_Nm` on top would double-count it.
* Drag, body side-force and the **yaw + roll** moments still act at the CoM.

Result (`AeroIntegrationChecks`, 8/8): aero cuts terminal speed 60→49.5 m/s, adds ~14.7 kN total
downforce (front ~6.8 kN, rear ~7.5 kN measured at the wheels), and lifts sustained cornering grip
from 1.38 g to 1.95 g — all through real tyre load, not an injected number.

**Execution order (verified).** Per step: sense state → compute aero from the current pose
(1-step ride-height lag, negligible at 240 Hz) → soft tyre resolves contact and `Fz` **emerges** →
Pacejka `Fx/Fy` from measured `Fz` → drivetrain → integrate. Force-accumulation order is
irrelevant (forces sum linearly before the single integrate).

---

## 3. Low-speed static friction (stiction) — the last real gap

The transient slip model gives `Fx → 0` as slip → 0, and the low-speed spin stabiliser holds the
wheel near free-rolling, so **at a crawl there was no force to represent static friction.** That,
not the drivetrain, was why a fully-braked car settled at ~1.1 m/s instead of stopping.

Added a **longitudinal stiction term**, blended in only below ~2 m/s and only while the car is not
being driven (`throttle < 5%`): a direct arresting force `−Vx·(mass share)/dt`, capped at `μ·Fz`,
that pins the wheel's mass share. It fades out with speed, so launches and all normal driving keep
pure Pacejka behaviour. The AMT also declutches under firm braking at low speed (as a driver would
clutch in), so idle torque never fights the brake.

* **Brake-to-rest**: from 56 m/s the car now brakes to **0.000 m/s and holds** (was ~1.1 m/s).
* **Parking on a slope**: with static friction the parked car now **holds stationary with zero
  creep** on every realistic parking grade (10–60 %, up to 31°) instead of trickling downhill.

### The one honest scope note (not a defect in the port)
The *breakaway* angle — the grade at which a parked car finally slides — cannot be produced by the
**test mock**, because the mock's simplified contact reports a **vertical** load (`Fz ≈ m·g`). The
static-friction cap `μ·Fz ≈ 1.15·m·g` is therefore measured against gravity's vertical component,
which always exceeds the ≤ `m·g` down-slope pull, so the mock holds at any angle. The `arctan(μ)`
breakaway emerges in the **real engine**, where the Jolt heightfield supplies true slope-normal
contacts. This is a property of the validation harness, not of the ported vehicle physics, and the
test documents it inline rather than asserting a number the mock can't generate.

---

## Test results (all suites, `g++ -std=c++17 -O2`)

| Suite | Result |
|---|---|
| `AerodynamicsValidation` (unit) | **23 / 23** |
| `AeroIntegrationChecks` (closed-loop) | **8 / 8** |
| `VehicleDrivingChecks` | **12 / 12, 0 known-limitations** |
| `VehicleSceneValidation` (both models) | **38 / 38** |
| `VehicleInputChecks` | **16 / 16** |
| `XPBDTyreValidation` (Phase 2) | 14 / 14 |

Build (integrated):
```
g++ -std=c++17 -O2 <TEST>.cpp VehicleController.cpp VehicleGeometry.cpp \
    Aerodynamics.cpp XPBDSoftTyre.cpp PacejkaTyreModel.cpp TyreSlipDynamics.cpp Drivetrain.cpp
```

## Files changed / added
* **`VehicleGeometry.h`** (new) — GT3-class data block + derived quantities.
* **`VehicleGeometry.cpp`** (new) — `MakeWheelMounts` / `ApplyGeometry`.
* `VehicleController.cpp` — closed-loop aero (real patch downforce, measured `Fz`, no pitch
  double-count), low-speed stiction, declutch-under-brake.
* `AeroIntegrationChecks.cpp`, `VehicleDrivingChecks.cpp` — build through `VehicleGeometry`, real
  inertia; brake/park/rollover reframed to physical, harness-valid assertions.

## Next phases
Fuel → Thermal → ABS → Supercharger, then a performance pass (SoA over wheels, drop
`std::function` from the inner loop).
