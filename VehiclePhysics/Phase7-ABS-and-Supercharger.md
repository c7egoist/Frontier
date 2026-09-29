# Phase 7 — ABS + Supercharger (Fuel deferred)

**Codename:** Project-Tractrix · **Branch:** `arena/01a0e8d9-slate` · **No PR.**

Fuel is **deferred by request** — custom fuels with their own energy density, a fuel-control unit
metering consumption, fuel mixing, and nitrous/accelerants is a whole subsystem that deserves its
own milestone. This phase ships the two subsystems that stand on their own: a **belt-driven
supercharger** and **anti-lock braking** on a real **disk-brake thermal model**.

Both are ported from GRIT's `source-only` spec headers
(`Components/SuperchargerSpecifications.h`, `Components/BrakingSpecifications.h`) — the physics
lives in those headers' inline methods; the monolithic solver isn't in that branch, so the models
are reconstructed faithfully from the equations and preset data.

---

## 1. Supercharger — belt-driven forced induction

New types in `Drivetrain.{h,cpp}`: `InductionType { NaturallyAspirated, Turbocharged,
Supercharged }` and `SuperchargerParameters` (port of `FSuperchargerSpecifications`, twin-screw
preset-1).

Unlike the exhaust-driven turbo (which spools over time), a supercharger is geared to the crank, so
its boost tracks engine rpm **instantly** and it **taxes the crank** with parasitic drag:

* `chargerRPM = engineRPM × DriveRatio` (3.2).
* Boost from the charger-rpm curve, capped at the **tune ceiling** by a recirculation (bypass)
  valve that slews at `BypassValveRate` (8 bar/s) and **vents off-throttle** — `MaxBoost_Base`
  0.8 bar on pump fuel, `MaxBoost_Race` 1.2 bar on race fuel (`RaceTune`).
* Torque gain from the boost→multiplier curve (up to ×1.75).
* **Parasitic drag** from the charger-rpm curve is subtracted from the crank inside the engine RK4
  as an accessory load; off-throttle it falls to the `ParasiticLossFactor` (8 %) floor because the
  bypass recirculates instead of compressing.

The drivetrain `Step` now branches on `InductionType`; the turbo path is unchanged. Telemetry
gains `ParasiticDrag_Nm`, and `TurboRPM`/`BoostBar` report the charger when blown.

**End-to-end (AbsSuperchargerTests):** a supercharged GT3 out-accelerates the NA car from a
standing start (83.7 m vs 79.1 m in 6 s; 32.5 vs 29.6 m/s), running 0.80 bar of boost and 73 N·m of
parasitic drag; the NA car reports zero boost and zero drag.

## 2. ABS on a disk-brake thermal model

New module `BrakingSystem.h` (header-only, per-wheel). Port of `FBrakingSpecifications`:

* **Torque:** `T = 2·μ(T)·(P·A_piston)·R_eff` — four 44 mm pistons, 120 bar max, 0.125 m effective
  radius ⇒ ~7.66 kN·m at full cold pressure.
* **Thermal fade:** `μ(T)` lerps from 0.42 cold to 0.38 across 300–600 °C, so sustained braking
  heats the disk and fades the torque.
* **Heat & cooling:** `Q̇_gen = T·|ω|`; airspeed-boosted convective cooling; `dT/dt =
  (Q̇_gen − Q̇_cool)/(m·c_p)`.
* **Hydraulics:** line pressure slews toward the commanded pressure at finite rise/fall rates.

GRIT ships no ABS, so the anti-lock controller is a standard **proportional slip regulator**: while
braking above a min speed, it scales the commanded line pressure down in proportion to how far the
measured wheel slip overshoots the peak-grip target (`SlipTarget` 0.12), clamped to a dump floor.
This holds the wheel near the top of its μ–slip curve instead of letting it lock — a proportional
regulator tracks the target far better than a bang-bang dump/re-apply cycle (which lets the wheel
re-lock during each re-apply phase).

Wired into `VehicleController` behind `UseBrakeThermalModel` (off by default, so existing
scenes/tests are byte-for-byte unchanged). When on, the foot brake torque comes from the disk model
and, if `Abs.Enabled`, is modulated per wheel using the slip κ already computed that step. The
handbrake keeps its mechanical constant-torque path (no ABS). Per-wheel telemetry gains brake
torque, line pressure, disk temperature and an `AbsActive` flag.

**End-to-end (AbsSuperchargerTests), hard stop from 40 m/s:**

| | mean \|slip\| | ABS duty | stop distance | peak disk temp |
|---|---|---|---|---|
| ABS **on** | **0.35** | 85 % | **57.7 m** | 401 K |
| ABS **off** | 0.90 (locked) | 0 % | 65.6 m | 340 K |

ABS keeps the wheels rolling near the grip peak and stops **shorter** than locked wheels, while the
disks heat up as expected.

---

## Test results (all suites, `g++ -std=c++17 -O2`)

| Suite | Result |
|---|---|
| `BrakingValidation` (disk/thermal/ABS unit) | **16 / 16** |
| `SuperchargerValidation` (drivetrain unit) | **13 / 13** |
| `AbsSuperchargerTests` (end-to-end) | **11 / 11** |
| `AerodynamicsValidation` | 23 / 23 |
| `AeroIntegrationTests` | 8 / 8 |
| `VehicleDrivingTests` | 12 / 12, 0 known-limitations |
| `VehicleSceneValidation` | 38 / 38 |
| `VehicleInputTests` | 16 / 16 |
| `XPBDTyreValidation` | 14 / 14 |
| `VehicleValidation` (Pacejka/slip/drivetrain core) | 35 / 35 |

Builds:
```
# supercharger unit
g++ -std=c++17 -O2 SuperchargerValidation.cpp Drivetrain.cpp -o super
# braking unit (header-only)
g++ -std=c++17 -O2 BrakingValidation.cpp -o brakes
# end-to-end ABS + supercharger
g++ -std=c++17 -O2 AbsSuperchargerTests.cpp VehicleController.cpp VehicleGeometry.cpp Aerodynamics.cpp \
    XPBDSoftTyre.cpp PacejkaTyreModel.cpp TyreSlipDynamics.cpp Drivetrain.cpp -o abs
```

## Files changed / added
* **`BrakingSystem.h`** (new) — disk-brake hydraulics + thermal fade + proportional-slip ABS.
* **`BrakingValidation.cpp`** (new) — brake/thermal/ABS unit checks.
* **`SuperchargerValidation.cpp`** (new) — supercharger drivetrain unit checks.
* **`AbsSuperchargerTests.cpp`** (new) — end-to-end drive proof.
* `Drivetrain.{h,cpp}` — `InductionType`, `SuperchargerParameters`, `StepSupercharger`, branch in
  `Step`, parasitic drag into the engine load, new outputs.
* `VehicleController.{h,cpp}` — induction/supercharger/brakes config, `BrakingSystem` member,
  ABS-aware foot-brake path, new telemetry.

## Roadmap
Remaining from `source-only`, phase-by-phase: **Fuel** (custom energy/density fuels + fuel-control
unit + mixing + nitrous/accelerants — deferred, its own milestone) → **Thermal**
(Coolant/EngineOil) → then a performance pass (SoA over wheels, drop `std::function` from the inner
loop). EOS networking remains deferred.
