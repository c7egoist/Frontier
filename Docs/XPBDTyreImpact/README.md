# XPBD tyre — rim bottoming on landings

The soft tyre deformed violently on landing after a ramp: instead of pancaking, the tread band folded into a
sharp inverted V and passed straight through the wheel. This is the fix, the measurement behind it, and the
proof that now guards it.

## What was wrong

A tyre runs out of sidewall. Past that point the carcass is pinched between the road and the rim flange and the
rate goes almost vertical. That hard stop is what keeps a landing from driving the wheel through the road, and
it is why a bottomed tyre thumps instead of swallowing the bump.

Nothing in `XPBDSoftTyre` modelled it:

- the radial spoke is tension-only, so it carries nothing in compression — correct for a cord membrane, but it
  means the sidewall cannot resist collapse;
- the inflation gas is far too soft to stand in for steel;
- no constraint named the rim at all.

So the belt simply kept collapsing. On a 0.6 m drop of a 400 kg quarter car at the shipping rate the tread
reached **90.5 mm inside a 200 mm rim**, folded into a V with 58.4 mm of spread across the patch. The reaction
stayed near-linear the whole way down, so the car was never handed the force that should have arrested it.

The reason this shipped is that there was no impact coverage anywhere. `XPBDTyreValidation` and the existing
`XPBDTyreProof` only ever settle a static hub, and the proof runs at `1/1800 s` — 45x finer than the shipping
step. Nothing drove the tyre past its sidewall, so nothing could have caught it.

## The fix

A unilateral rim-bottoming constraint in `XPBDSoftTyre::Step`. A node may not approach the spin axis closer
than `RimRadius + RimBottomingClearance`; the distance is measured perpendicular to the axis so camber and
steer do not leak into it. It uses the same XPBD eq. 26 form as the rest of the solver, with the hub's own
travel subtracted — the flange moves with the wheel, so the rate that matters is the node closing on the rim,
not the node moving through the world.

| Parameter                   | Default   | Meaning                                                   |
| --------------------------- | --------- | --------------------------------------------------------- |
| `RimBottoming`              | `true`    | `false` restores the old unbounded collapse                |
| `RimBottomingClearance`     | `0.015 m` | tread + carcass thickness held off the flange              |
| `RimBottomingCompliance`    | `2.0e-8`  | rubber pinched on steel — stiffer than ground contact      |
| `RimBottomingDampingRatio`  | `1.00`    | a pinch is strongly dissipative, not a spring              |

It is projected **after** ground contact. That ordering matters and was measured: `SolverIterations` is 1 by
deliberate Part-1 calibration, so whatever runs last wins the position. Projected before contact the
constraint was almost inert (90.5 mm breach only improved to 84.9 mm); projected after it holds the belt out of
the rim to within 2.1 mm.

Interference is reported as `SoftTyreResidual::RimMax`.

## Results

A 400 kg quarter car at 60 Hz with 8 substeps — the shipping regime (`VehiclePhysicsThread::StepHz`,
`VehicleSolver::TyreSubsteps`):

| Drop   | Peak sag | Inside rim | Patch spread | On flange | Peak Fz  |
| ------ | -------- | ---------- | ------------ | --------- | -------- |
| 10 cm  | 125.3 mm | 0.3 mm     | 28.2 mm      | 5 seg     | 24.0 kN  |
| 25 cm  | 126.7 mm | 1.7 mm     | 1.3 mm       | 9 seg     | 48.4 kN  |
| 40 cm  | 126.4 mm | 1.4 mm     | 1.3 mm       | 9 seg     | 44.1 kN  |
| 60 cm  | 127.1 mm | 2.1 mm     | 1.5 mm       | 11 seg    | 56.4 kN  |
| 80 cm  | 127.6 mm | 2.6 mm     | 1.7 mm       | 11 seg    | 67.4 kN  |

The 60 cm landing, with and without the constraint:

| Measure      | Disabled | Enabled  |
| ------------ | -------- | -------- |
| Peak sag     | 215.5 mm | 127.1 mm |
| Inside rim   | 90.5 mm  | 2.1 mm   |
| Patch spread | 58.4 mm  | 1.5 mm   |

Deflection now saturates at the flange — 125 to 128 mm across an 8x range of drop energy — instead of running
away with it, and the belt pancakes rather than folding.

## No regression

The constraint is inert in normal running. All 320 tread nodes sit at 340 mm at rest against a 215 mm limit, so
it never fires below bottoming. `XPBDTyreValidation` was captured with the constraint disabled and enabled and
the two reports are **byte-identical** — 9 passed, 5 failed either way. Those 5 failures are pre-existing
Pacejka slip-stiffness mismatches that predate this work and are documented in the solver header.

## Proof

```text
VisualProof/XPBDTyreImpact/XPBDTyreImpactProof.cpp     self-checking, exits non-zero on failure
VisualProof/XPBDTyreImpact/XPBDTyreImpactSheet.bmp     belt cross-section at peak compression
```

13 checks, all passing: inertness at rest, five landings of rising severity, flatness of the bottomed patch,
the disabled-constraint regression contrast, and the presence of a stiffer rate once the flange is reached.

Flatness is only asserted once the belt rests on the flange across the whole nine-segment window the spread is
measured over. A tyre that merely kisses the flange at a few nodes is still a normally curved patch, and
demanding a pancake there would assert the wrong physics. The window is fixed, so the test is not
self-fulfilling: a belt folded through the rim fails it on shape even when it is far deeper than the flange.

The sheet draws the mid-ring belt against the rim circle at peak compression — left in red with the constraint
disabled, folded inside the rim; right in green with it enabled, resting on it.

Built and run with:

```bash
g++ -std=c++20 -O2 -w -pthread -o ImpactProof \
    VisualProof/XPBDTyreImpact/XPBDTyreImpactProof.cpp \
    Frontier/Engine/PhysicalDynamics/Vehicle/XPBDSoftTyre.cpp
```

## Separate observation, not fixed

While building the drop harness, a quarter car coupled to the tyre by explicit force exchange showed a
coefficient of restitution of 1.3 to 1.6 — it gained energy on every impact. The tyre itself is not the cause:
a quasi-static compress-and-release loop is dissipative at every rate tested, returning 0.81 to 0.97 of the
work put in. Refining only the coupling timestep drives restitution to 0.95, so this is an artefact of
exchanging force once per frame at 60 Hz.

`VehicleSolver` couples the tyre to the chassis the same way at the same rate, so a real landing may well
launch the car for this reason. That is a change to the vehicle coupling rather than to the tyre, and it has
not been touched here.
