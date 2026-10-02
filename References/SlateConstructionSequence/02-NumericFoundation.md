# 02 — NumericFoundation

`Layer1_Numeric` is the only place in Slate where a numerical guarantee originates. Everything above it inherits
guarantees; nothing above it may strengthen one. That inversion — guarantees flow up and weaken, never up and
strengthen — is what makes the precision tier system enforceable rather than aspirational.

This document specifies the scalar and geometric vocabulary, the exact predicates the visibility spine and the
selection outline both depend on, the solvers and integrators, and the parity mechanism that proves the CPU form
and the shader form of a computation agree.

## Position In The Sequence

| Field       | Value                                                                      |
|-------------|-----------------------------------------------------------------------------|
| Unit        | `SlateMath.lib`                                                             |
| Layer       | `Layer1_Numeric`                                                            |
| Upstream    | `00` — tier system, parity mechanism, link partition                        |
| Downstream  | Every document in the series without exception                              |
| Unblocks    | Any computation at all; `Contract/` becomes usable                          |

## 1. Scope

In scope — scalar policy, transforms, orientation and intersection predicates, tolerance arithmetic, linear and
constraint solving, quadrature and time integration, spectral and colour projection, sampling patterns.

Out of scope — anything that touches a device, a file, a window or a document. `Layer1_Numeric` has no include
path to `SlateVulkan`, `SlateDocument` or `SlateUI`, and the link partition makes that structural.

## 2. Scalar Policy

✔️ Scalar policy done — `Contract/` and `TransformProjection` carry the six representations and their tiers.

## 3. Geometric Vocabulary

🚧 Partially completed.

- ✔️ Decomposed transforms, compounding and matrix derivation done — `TransformProjection`.
- ✔️ Rebasing in 64-bit before the narrowing done — `Rebase`; document and device space exist.
- ✔️ Tolerances and cross-unit capacities done — `ToleranceContract.h`.
- 🚧 View-relative space and surface space are unbuilt; they arrive with `46` and `20`.

## 4. Exact Predicates — Tier A

✔️ Done — all five exist in `Shared/` with the fast path and the exact fallback both: `OrientationClassifier`,
`PlanarClassifier`, and the three below.

| Predicate                | Question answered                                    | Consumed by     |
|--------------------------|------------------------------------------------------|------------------|
| `IncircleClassifier`     | Is a point inside a circumscribed circle             | `68`, `52`       |
| `IntersectionClassifier` | Do two extents genuinely intersect, and where        | `16`, `26`       |
| `ContainmentClassifier`  | Is a point strictly inside, on, or outside a boundary| `12`, `26`       |

Each is implemented with a floating-point fast path and an exact fallback taken only when the fast path's error
bound cannot exclude zero. The fallback is a correctness requirement, not an optimisation to be removed: a
predicate that is *usually* exact provides no topological guarantee at all.

Each also exists in `Shared/`, compiles under both toolchains, and is proven equal by `ParityRunner`. A Tier A
predicate that disagrees between CPU and device is the defect class that produces cracks along surface seams and
selection outlines that flicker at silhouettes.

## 5. Solvers And Integrators

✔️ Done — `CurveSolver` and `ColourProjection` first, the latter carrying the transfer, white adaptation and
temperature projection rows as one unit rather than as three, and every component below since. `TimeIntegrator`
is the one exception and is not built as a component; see the note beneath the table.

| Component                | Mechanism                                        | Tier | Consumed by |
|--------------------------|--------------------------------------------------|------|--------------|
| `LinearSolver`           | Dense and sparse factorisation                   | B    | `24`, `68`   |
| `UnwrapSolver`           | Boundary-first parameterisation                  | C    | `68`         |
| `QuadratureIntegrator`   | Definite integral approximation over a domain    | B    | `18`, `28`   |
| `TimeIntegrator`         | Fixed-step accumulation with an interpolant      | C    | `64`         |
| `SpectralProjection`     | Wavelength-domain to tristimulus                 | B    | `28`         |
| `LatticeProjection`      | Periodic plane symmetry — translation and reflection | A | `70`         |

Every Tier C component declares its convergence criterion and its iteration ceiling as part of its contract, and
reports which of the two terminated it. A solver that silently returns its last iterate when the ceiling is hit is
indistinguishable from one that converged, and that ambiguity propagates upward as an unexplained artefact.

⚠️ `TimeIntegrator` was declared here as consumed by `12` and `12` never reads it. Its real consumer is `64`.
Recorded as `00` §10 conflict 21.

✔️ `TimeIntegrator` is discharged rather than built. `64` §3's accumulation carries the fixed-step step and the
weight derived from the stored sample count, and `64` states at its head that this is where the claim is
discharged. Nothing else names the component, so no separate component is owed and §8's consumer gate holds.

⚠️ `ConstraintSolver` is **removed**. It named `12` and `24` as consumers and neither reads it — `12` composes
static transforms and solves nothing, and `24`'s Upstream cites `LinearSolver` and the predicates only. This is
conflict 21's defect a second time, caught by §8's gate on the second pass rather than the first. Recorded as
`00` §10 conflict 41.

🔴 `LatticeProjection` is **Tier A** and therefore parity-proven: a periodic lattice that disagrees between host
and device produces a pattern that does not meet itself across a tile edge. ✔️ It lives in `Shared/` and is
registered as `ClassifyLatticeCell`.

## 6. Sampling

Sample patterns are shared source, because the device and the host must place samples identically for `18`'s
accumulation and `28`'s integration to agree.

| Pattern                | Property                                    | Consumed by |
|------------------------|---------------------------------------------|--------------|
| Low-discrepancy planar | Uniform coverage, progressive               | `18`, `30`, `60` |
| Spherical              | Solid-angle uniform                         | `28`         |
| Hemispherical, cosine  | Weighted to the cosine lobe                 | `18`, `60`   |
| Sub-pixel offsets      | Deterministic per cycle slot             | `46`, `64`, `82` |

⚠️ The offset row previously named `08` and `18`, neither of which mentions jitter. `46` applies the offset to
the projection, `64` accumulates across the sequence, and `82` replays it for a preview. Conflict 20 recorded
that the offsets had no consumer; they had three, and none of them was listed.

## 7. Parity

🚧 Partially completed — `ParityRunner` registers entry points, compares over a common sample set and reports per
registration; the shader-side form is not compared, because it requires the device `06` brings up. Until then the
runner compares the host form against itself and reports the sample counts rather than an agreement nothing
established.

An entry point in `Shared/` with no registration is duplicated source that has not diverged yet.

## 8. Gates

- **Gate:** `Layer1_Numeric` compiles with no include path to any unit other than `SlateMath` itself.
- **Gate:** Every exported computation declares a tier.
- **Gate:** No computation claims a tier stronger than its weakest input.
- **Gate:** All four Tier A predicates take an exact fallback and are registered with `ParityRunner`.
- **Gate:** No tolerance literal appears outside `Contract/`.
- **Gate:** Every position narrowing to 32-bit is rebased in 64-bit first.
- **Gate:** Every Tier C component reports its termination cause.
- 🔴 **Gate:** Every component in §5 names at least one consumer that reads it. A component with no consumer is
  removed or its consumer is named — never carried.

## 9. Open

| Open question                                                        | Blocks                        |
|-----------------------------------------------------------------------|--------------------------------|
| Exact-fallback strategy — adaptive expansion or extended precision     | Nothing in design; `16` timing |
| Whether path flattening tolerance is fixed or resolution-relative      | `52` quality; `70` re-resolves |

✔️ Closed — whether `TimeIntegrator` is needed before `64` ships. `64` shipped and discharged it; see §5.
