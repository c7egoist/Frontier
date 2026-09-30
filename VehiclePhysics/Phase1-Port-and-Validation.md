# Project-Tractrix — Phase 1: Vehicle-Model Port & Validation

**Scope:** port GRIT's *vehicle force models* (Pacejka tyre, contact-slip solver, strut, drivetrain) into pure,
sandbox-compilable C++ under `Overlay/Engine/PhysicalDynamics/Vehicle/`, prove correctness against the GRIT source, and
add one **researched improvement** (a transient relaxation-length tyre solver) that is measured head-to-head against the
faithful GRIT reference.

> **Honesty caveat, stated up front.** GRIT is an Unreal Engine + Chaos project and **cannot be compiled or run in this
> sandbox**. Therefore "validated against GRIT" here means: (1) the force **equations and constants are ported
> line-for-line from the GRIT source** (`SultanAladin/GRIT@main`, `Source/GRIT/VehicleFramework/`), re-read this turn to
> settle every ambiguity; and (2) an **independent oracle** — the same equations re-derived without the port's
> precomputed cache — is swept over the input space and must agree to < 0.5 N. A *live telemetry diff* against a running
> GRIT car is **not possible without user-supplied GRIT logs**; if you can export GRIT `TelemetryLogger` traces, the
> harness can be extended to diff against them directly.

---

## Deliverables (all compile & pass in-sandbox, no Unreal / no Jolt)

| File | Contents |
|------|----------|
| `Vehicle/PacejkaTyreModel.{h,cpp}` | MF6.1 pure-slip Fx/Fy, self-aligning torque Mz, and the MF6.1 cosine combined-slip weighting. `PacejkaParameters` mirrors the GRIT `FTireSpecSheet`; `Prepare()` builds the same premultiplied cache as GRIT `FPacejkaPrecomputedCache::Initialize`. |
| `Vehicle/TyreSlipDynamics.{h,cpp}` | Two interchangeable slip-state solvers: **A** = faithful reconstruction of GRIT's iterative contact-slip solver (implicit backward-Euler Newton, finite-difference Jacobian, ≤ 12 iters); **B** = the researched **relaxation-length transient model** (semi-implicit exponential update, ~1 force eval/step). |
| `Vehicle/SuspensionModel.h` | Header-only strut: linear / progressive / digressive spring cubic + linear damper, coefficients derived exactly as GRIT `ComputeProgressiveCoefficients`, force clamped ≥ 0. |
| `Vehicle/Drivetrain.{h,cpp}` | Engine (RK4 torque-curve × boost − braking), turbocharger (GRIT `SolvePowertrain` STAGE 1–7, isentropic power balance), AMT single clutch (slip/lockup), transmission (gear × final drive), 4-mode differential (Open / Locked / LSD / TorqueVectoring). Default spec = GRIT preset-1 (VR38DETT-class GTR). |
| `Vehicle/VehicleValidation.cpp` | Headless 3-layer harness (below). **35 checks, all passing.** |

### Build & run

```bash
cd Overlay/Engine/PhysicalDynamics/Vehicle
g++ -std=c++17 -O2 -Wall -Wextra PacejkaTyreModel.cpp TyreSlipDynamics.cpp Drivetrain.cpp VehicleValidation.cpp -o vehval
./vehval    # → "RESULT: 35 passed, 0 failed"
```

Compiles clean under `-Wall -Wextra -Wshadow`.

---

## What was read from GRIT to make the port faithful

Every formula below was verified against `Source/GRIT/VehicleFramework/VehicleSolver.cpp` (and `Components/*.h`) this turn:

* **Pacejka Fx / Fy** (`ComputePacejkaLongitudinalForce` L3483, `...Lateral` L3546): the curvature factors **Ex and Ey ARE
  scaled** by the force multipliers (`Cache.pEx1_Lx`, `Cache.pEy1_Ly`) — a non-obvious detail. The port matches; the
  oracle was corrected to match GRIT (initially it omitted the Ly scale on Ey, which the sweep caught: 147 N error → 0).
  Slip clamps κ ∈ [−0.92, 1.5], α ∈ [−1.3, 1.3] rad; `dfz = (Fz_kN − Fz0)·InvFz0`; load-sensitive μ
  `max(1 − λ|dfz|, MuLoadMinFactor)`; E clamped to [−1, 1].
* **Combined slip** (`ApplyCombinedSlip` L3759): the MF6.1 cosine weighting uses the **normalized theoretical slips**
  `κ_s = κ/C_κ`, `α_s = tan(α)/C_α`, with `G_xα = cos(rCx1·atan(rBx1·α_s))` and
  `G_yκ = cos(rCy1·atan(rBy·κ_s·s))` plus the ply-steer vertical shift `SVyκ`. **Finding:** with the default `r*`
  parameters this weighting is *weak* (the stiffnesses `C_κ`, `C_α` are large, so the normalized slips are tiny). It
  therefore bounds the combined force only by the **vector sum** of the pure-slip peaks, not a tight friction circle.
  The port reproduces this exactly; the harness invariant was written to match GRIT's real behaviour, not an idealized
  ellipse.
* **Suspension** (`Components/SuspensionSpecifications.h`): `k3 = (F0·HF − SpringRate·x_max)/x_max³` with
  `F0 = SpringRate·StaticPreload`. **Finding:** with GRIT's *default* preload (5 cm) the "Progressive" curve produces a
  **falling rate** (`k3 < 0`) — it only rises when `preload·HF > x_max`. Faithfully reproduced; the harness asserts both
  the default-quirk and the rising behaviour with a larger preload.
* **Turbo** (`SolvePowertrain` STAGE 1–7, L3946–4095): isentropic turbine expansion (`Cp·T·(1−(1/Πexp)^((γ−1)/γ))`) vs
  isentropic compressor load, net-shaft power balance with speed-dependent friction, shaft integration, boost first-order
  lag (`FInterpTo`, τ = 2.5 − 1.5·SpeedFactor), BOV, wastegate. Flow/temp use `MaxFlowRate·throttle` and
  `Lerp(573, MaxExhaustTemp, throttle)`, **not** an rpm-sampled flow. **Finding:** with GRIT's default constants the
  quadratic shaft friction caps the shaft near ~9,500 rpm in a free-rev, so boost stays low (~0.09 bar). This is genuine
  GRIT behaviour — retuning the turbo map/friction is a *spec-authoring* task, not a port-correctness one. The port
  reproduces the dynamics (spool-up, lag, decay-on-lift); it does not silently "fix" the tune.
* **Engine** (RK4 `EvalNetTorque` L4155): `net = SampleTorque(rpm)·boost·throttle − (friction·ω + pumping·ω²·(1−throttle)) − load`.
  Matched, including that **friction is unblended** and only the **pumping term** is throttle-blended. (GRIT's lumped
  clutch-locked integration mode is documented as a Phase-2 refinement; the port uses the decoupled RK4 path.)

---

## Validation harness — 3 layers, 35 checks

### Layer 1 — Port fidelity (the achievable "vs GRIT" check)
An independent re-implementation of the GRIT Fx/Fy equations (no precomputed cache) is swept over
Fz ∈ {2–12 kN} × camber ∈ {0, ±} × full slip range. The cached port must agree to **< 0.5 N**. ✅ (Fx and Fy both.)

### Layer 2 — Physics invariants
Peak-force location & magnitude; monotonic load sensitivity with falling effective μ; combined force bounded by the
vector sum of pure peaks; Mz ≈ 0 at α = 0 and sign-flips with α; spring non-negativity / monotonicity; digressive
softening & progressive stiffening; damper direction; **drivetrain**: revs up under throttle, rev-limits at 7200 rpm,
boost builds monotonically & respects the wastegate, boost decays on lift, clutch lockup at matched speeds, open-diff
torque conservation, LSD bias to the slower wheel, lower gear → more wheel torque. ✅

### Layer 3 — Newton reference vs relaxation-length ODE
Both solvers integrate the **same** single-contact-point transient model (Pacejka 2012 ch. 7):

```
du/dt = Vsx − (|Vx|/σx)·u        κ' = u/σx
dv/dt = Vsy − (|Vx|/σy)·v        α' = atan(v/σy)
```

Measured at Vx = 20 m/s, Fz = 4 kN, ~8 % slip / 0.05 rad:

| Metric | Newton (Solver A) | Relaxation (Solver B) |
|--------|-------------------|-----------------------|
| Steady κ | 0.0800 | 0.0800 |
| Steady Fx / Fy / Mz | 4765.9 N / 4023.5 N / −774.4 N·m | 4765.9 N / 4023.5 N / −774.4 N·m |
| Newton iterations | 5 | — |
| **Magic-Formula evals / wheel / step** | **15** | **1** |

* **Steady state agrees exactly** — because Solver A recovers slip with the *converged* effective relaxation length, so
  σ affects only the transient, never the steady state.
* **~15× fewer force evaluations** per wheel per step (no Newton loop).
* **Transient** rise time is finite and short (τ = σ/Vx ≈ 2.6 ms at 20 m/s).
* **Low-speed stability** — the deciding advantage. As Vx → 0 the naïve instantaneous slip `κ = Vsx/|Vx|`,
  `α = atan(Vsy/|Vx|)` **diverges** (the harness drives Vx oscillating through zero and shows |α| blowing past 1 rad,
  chattering with the sign of Vx). The relaxation model's `−(|Vx|/σ)·u` term vanishes at standstill, so `du/dt → Vsx`:
  the contact deflection integrates like a **spring**, producing a bounded, smooth restoring force at zero speed. This is
  the textbook fix for the Magic Formula's well-known low-speed singularity (Pacejka & Besselink 1997; Pacejka 2012 §7).

**Recommendation:** adopt Solver B (relaxation-length) as the production path — it is faster, unconditionally stable at
low speed, and matches the GRIT-faithful Newton reference at steady state. Keep Solver A as the offline reference oracle.
Phase-0's high-rate physics thread supplies the integration rate the explicit ODE needs.

---

## References
* Pacejka, H. B. (2012). *Tire and Vehicle Dynamics*, 3rd ed. — MF6.1 pure/combined slip; ch. 7 transient contact model.
* Pacejka & Besselink (1997). *Magic Formula Tyre Model with Transient Properties* — relaxation length / stretched string; valid at zero speed.
* Besselink et al. (2010), *Vehicle System Dynamics* 48(6) — MF-Swift.
* Heywood (1988); Dixon (2013); Serrano et al. (2007) — engine / driveline / turbocharger (as cited in GRIT source).

## Not in Phase 1 (deferred)
* Karnopp low-speed static/kinetic friction state machine (GRIT Stage 5) — the relaxation solver supersedes its purpose
  (bounded standstill force); porting it as an optional module is a Phase-2 task if bit-matching GRIT's stiction is
  required.
* Brake thermal model & pressure lag — constants extracted; module deferred to Phase 2 with the wheel-dynamics loop.
* Clutch-locked lumped-inertia integration mode; XPBD soft-tyre calibration (Phase 2, per Thread-M plan).
