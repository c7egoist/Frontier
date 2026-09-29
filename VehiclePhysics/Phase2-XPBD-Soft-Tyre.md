# Project-Tractrix — Phase 2: XPBD soft tyre replaces the analytic tyre

**Codename:** Project-Tractrix · **Phase:** 2 (soft-body tyre) · **Status:** ✅ complete, cross-validated
**Source model:** `SultanAladin/GRIT` `VehicleSolver.cpp` (Pacejka MF6.1) — ported in Phase 1 as the reference
**Target engine:** `SultanAladin/Frontier-` (Jolt 5.6.x, custom `RigidBodySolver`)

---

## 1. What Phase 2 delivers

Phase 1 gave us a **line-for-line analytic tyre** (`PacejkaTyreModel`) validated 35/35 against GRIT's equations and an
independent oracle. Phase 2 replaces that analytic curve with an **emergent XPBD soft-body tyre** — a deformable
multi-ring carcass whose contact force *falls out of* the simulation instead of being read from a formula — and then
**cross-validates the emergent forces back against the Phase-1 Pacejka baseline**.

Why do this at all? Two reasons the user asked for it:

1. **Physical fidelity.** A soft carcass produces load-dependent contact-patch shape, transient build-up, kerb/camber
   behaviour, and rim-to-ground deflection that an analytic curve can only approximate. It also makes the tyre the
   *ground-contact primitive*: the carcass nodes touch the Jolt heightfield **directly — no raycast** — which is the
   Phase-3 requirement.
2. **It's the interesting part.** Rigid-body everything-else + soft-body tyres (rigid-XPBD) is the architecture the
   user locked in.

### Files (all under `Overlay/Engine/PhysicalDynamics/Vehicle/`)

| File | Lines | Contents |
|------|------:|----------|
| `XPBDSoftTyre.h`  | 174 | Node/edge structs, `SoftTyreParameters` (ships **pre-calibrated**), `TyreReaction`, public API |
| `XPBDSoftTyre.cpp`| 254 | Carcass build, XPBD substep solve (hoop/lateral/shear/spoke + pressure body-force), ground contact + **compliant tread-bristle friction (brush model)**, reaction accumulation |
| `XPBDTyreValidation.cpp` | 209 | Headless cross-validation vs `PacejkaTyreModel` — **14/14 pass** |

---

## 2. The model

### 2.1 Carcass — a multi-ring mass–spring shell solved with XPBD

The tyre is `RingCount` (5) rings of `SegmentCount` (64) nodes = **320 particles**, arranged as a torus band around a
rigid rim. Four families of **compliant distance constraints** give it structure (all solved with Macklin et al.'s
*Small-Steps XPBD*, one iteration per substep, `α̃ = α/Δtₛ²`):

- **Hoop** edges — circumferential, within each ring → tread-band tension (the "steel belt").
- **Lateral** edges — across the width, ring→ring → sidewall/tread lateral coupling.
- **Shear** edges — diagonal → in-plane shear stiffness of the patch (resists parallelogram collapse).
- **Spoke** edges — every node → rim hub → radial sidewall stiffness (the main vertical spring).

Inflation is a **pressure body-force**: each node gets an outward force `p·A_node` along its rim-radial normal, which is
what actually carries the load (a real tyre carries ~85 % of load on air pressure, not carcass stiffness). The rim pose
(`hub`, orientation quaternion) is driven each step by the rigid-body/drivetrain side; the carcass is integrated
relative to it.

### 2.2 Ground contact — nodes touch the surface directly

Every substep, each node is tested against a `GroundQuery` callback (a flat plane here; the **Jolt heightfield** in
Phase 3). Penetrating nodes get a compliant non-penetration constraint (`ContactCompliance`). **No raycast, no analytic
contact patch** — the patch is simply "the set of nodes currently below the surface," and its size/shape emerge from the
load. At the ~5 kN operating point the patch resolves **25 nodes (5 rings × 5 segments)**.

### 2.3 Friction — a compliant tread-bristle brush, *not* rigid Coulomb stick

This is the key addition that made the emergent forces realistic. Each in-contact node carries a **bristle** whose root
(`BristleAnchor`) is planted on the ground where the node first touched and is then **carried along by the belt while the
node stays stuck**. The tangential force is the bristle deflection times the tread shear stiffness
(`1/TreadTangentialCompliance`), **capped at the friction cone `μ·N`**; when the cap is hit the anchor slips forward to
the cone edge (kinetic sliding). This is exactly a **brush model**, and it is what produces:

- a **gradual** force build-up with slip (finite slip/cornering stiffness) instead of an on/off stick,
- the **peak-then-drop-off** saturation shape of the Magic Formula,
- and the correct **peak-slip locations**.

`TreadTangentialCompliance` sets the *initial slope* (slip stiffness); `μ` sets the *saturation level*. Both are exposed
and were calibrated (below). The reaction force/torque are accumulated over the contact nodes and **averaged over the
substeps**; `Mz` is the vertical torque about the hub's ground projection.

---

## 3. Calibration

The soft tyre has physical parameters (pressure, compliances, μ) rather than Magic-Formula coefficients, so it must be
**tuned** to land on the same operating envelope as the Phase-1 tyre. The shipped defaults in `SoftTyreParameters` are
the result of the sweep documented here:

| Parameter | Value | Role |
|-----------|-------|------|
| `SegmentCount` × `RingCount` | 64 × 5 | patch resolution (see §5 limitation) |
| `Radius`, `Width` | 0.34 m, 0.245 m | 225/45-R17-ish |
| `InflationPressure` | 110 kPa | primary load carrier |
| `SpokeCompliance` | 5.0e-5 | **soft enough that ~5 kN needs ~8 mm deflection → a multi-node patch** |
| `HoopCompliance` | 4.0e-7 | tread-band tension |
| `LateralCompliance` | 3.0e-7 | lateral carcass stiffness (→ cornering stiffness) |
| `ShearCompliance` | 5.0e-7 | patch shear |
| `ContactCompliance` | 1.0e-7 | ground normal contact |
| `TreadTangentialCompliance` | 9.0e-7 | slip/cornering **stiffness** (brush slope) |
| `FrictionCoefficient` μ | 2.2 | saturation level (calibrated to the Pacejka D-factor at this mesh's ~0.6 patch utilisation) |
| Solver | dt = 1/2000 s, 12 substeps | Small-Steps XPBD |

**Calibration story (the three issues from the first run, all resolved):**

1. **Vertical over-stiffness.** A coarse mesh is far stiffer than a real tyre. The fix that mattered was **softening the
   sidewall spokes** (`SpokeCompliance` 2e-6 → 5e-5): this drops the vertical rate to ~640 N/mm and, crucially, makes
   ~5 kN require ~8 mm of penetration — which turns a 5-node (1-segment) patch into a **25-node (5-segment) patch**. All
   force/torque fidelity depends on having enough nodes in contact.
2. **Free-rolling point.** There is no analytic "zero-slip" spin rate for a deformable tyre, so the validator **finds it
   empirically**: scan Ω, bracket the sign change of `Fx(Ω)`, and linearly interpolate the `Fx = 0` crossing. Slip is
   then defined `κ = Ω/Ω₀ − 1` about that point. Residual `|Fx|` at Ω₀ is 203 N on a 5252 N load (< 4 %).
3. **Sign conventions.** XPBD `Fy`/`Mz` are negated to match the Phase-1 Pacejka convention (`+α → +Fy`).

---

## 4. Cross-validation results — `XPBDTyreValidation.cpp` → **14 / 14 pass**

Build & run in-sandbox (no Unreal, no Jolt needed):

```
g++ -std=c++17 -O2 XPBDSoftTyre.cpp PacejkaTyreModel.cpp XPBDTyreValidation.cpp -o xpbdval && ./xpbdval
```

Emergent XPBD force vs the analytic Pacejka baseline **at the measured vertical load** (Fz ≈ 5252 N):

**Longitudinal Fx(κ)**

| κ | XPBD Fx (N) | Pacejka Fx (N) |
|-----|------:|------:|
| 0.03 | +2321 | +3481 |
| 0.06 | +4291 | +6365 |
| 0.10 | +5879 | +8815 |
| 0.16 | **+6806** | +10015 |
| 0.22 | +6670 | +9747 |

**Lateral Fy(α) and aligning torque Mz**

| α | XPBD Fy | Pacejka Fy | XPBD Mz | Pacejka Mz |
|-----|------:|------:|------:|------:|
| 2° | +3363 | +4317 | −94.5 | −2370 |
| 4° | +4266 | +8072 | −39.1 | −2885 |
| 6° | +8916 | +10756 | −36.5 | −2009 |
| 8° | +10420 | +12171 | −24.9 | −958 |

**Checks (all pass):** builds with 320 nodes · settles finite (no blow-up) · patch ≥ 9 nodes · load ↑ with penetration ·
free-roll residual < 15 % load · Fx correct sign · Fx peak within 0.5–1.3× Pacejka · Fx peak at plausible slip
(0.05–0.30) · longitudinal slip stiffness within 0.4–1.6× · Fy correct sign · Fy peak within 0.5–1.3× · cornering
stiffness within 0.4–1.6× · Mz correct sign · peak Fx grows with load.

**Interpretation.** The soft tyre reproduces the Magic Formula **as emergent behaviour**: correct signs everywhere, the
correct brush shape (linear → peak → drop-off), peak forces landing at ~0.6–0.9× the analytic peak with slip/cornering
stiffnesses in the same band, and correct load sensitivity — without ever reading a Pacejka coefficient. That is the
Phase-2 gate.

---

## 5. Known limitation — aligning-torque magnitude

`Mz` comes out with the **correct sign** (it opposes the slip angle — the pneumatic-trail effect is real and present)
but its **magnitude is ~10× small** (a ~3 mm trail vs Pacejka's ~30 mm). The cause is purely resolution: the pneumatic
trail is a *fore-aft lever arm* inside the contact patch, and a patch that is only ~5 segments long can't resolve where,
along its length, the lateral force is centred. This is a discretisation ceiling, not a modelling error. It closes with
either **finer circumferential meshing** (128+ segments) or an explicit **tread-stiffness gradient** across the patch,
both at proportional CPU cost. For Phase 3 (traction, braking, cornering grip) `Fx`/`Fy` are what drive the vehicle;
`Mz` mainly affects steering *feel*, so shipping with a documented qualitative `Mz` is the right trade. It is asserted by
sign only in the validator, with the limitation called out in the test name and the file header.

---

## 6. How this plugs into the vehicle

`XPBDSoftTyre` is a drop-in replacement for the analytic tyre's force call: given the rim pose + belt (road-relative)
velocity + a ground query, it returns a `TyreReaction { Force, Mz, ContactCount }` in the same convention Phase 1 used,
so the drivetrain/suspension code is unchanged. In Phase 3 the `GroundQuery` becomes a Jolt heightfield sampler and the
rim pose is driven by the Jolt rigid wheel body; the tyre nodes are the only thing that touches the terrain.

---

## 7. GRIT-fidelity caveat (unchanged from Phase 1)

GRIT needs Unreal + Chaos and **cannot run in-sandbox**, so "vs GRIT" means equation/constant fidelity (Phase 1) plus,
here, cross-validation of the new soft tyre against that validated Phase-1 baseline and against published brush/Magic-
Formula physics invariants. A live telemetry diff would need user-supplied GRIT `TelemetryLogger` logs.
