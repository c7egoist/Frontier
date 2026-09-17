# Design

Frontier Ocean is one frame loop, two submissions and five layers. This document is the map: what
each layer is, what it costs, how the data flows, and which invariants the code is not allowed to
break. Numbers in this file are the ones the code actually uses (`web/src/core/params.ts` is the
source of truth).

```
                     ┌──────────────────────────── submission 1 (simDt = dt / sweSubsteps) ────────┐
  coarse SWE  ──splatCoarse──► far accum ──resolveFar──► far height field ──┐
  wave packets ──splat────────────────────────▲                            │
                                                                           ▼
  fine SWE    ──splatFine────► near accum ──resolveNear──► near height field ──► render (2 submissions later)
       │                                    ▲
       │ spawnCrests                        │ deposit (1/256 m³, one slot per particle)
       ▼                                    │
  MPM 3D particles (camera box) ────────────┘
                     └──────────────────────────── submission 2 (simDt = dt / mpmSubsteps) ────────┘
```

## 1. Layers

| Layer | Representation | Domain | Update rate | Budget (gtx) |
| --- | --- | --- | --- | --- |
| Fine shallow water | Lagrangian columns on a lattice, `V = dx²·h`, 32 B particle | 768 m × 768 m, dx = 1.5 m | 60 Hz × 2 substeps | 262 144 |
| Coarse shallow water | Same solver, bigger `dx`, `-DSWE_COARSE=1` | 4 km × 4 km, dx = 16 m | 15 Hz × 1 step | 65 536 |
| Wave particles | Analytic packets, 40 B each | ±6 km (toroidal) | 60 Hz | 24 000 |
| MLS-MPM | 8 points per cell, 96 B particle | 22 m × 22 m × 5 m, camera box | 60 Hz × 4 substeps | 140 000 |
| Foam / spray | (reserved) | near field | 60 Hz | 60 000 / 10 000 |

Two height fields mediate everything the renderer and the 3D layer consume:

| Field | Format | Extent (gtx) | Content |
| --- | --- | --- | --- |
| `nearField` | `rgba16float`, 1024² | 815 m (`2·radius·1.06`) | elevation η (m), foam (0–1), velocity.xz (m/s) |
| `farField` | `rgba16float`, 512² | 12 km (`2·waveDomain`) | same, blended with the near field across the near footprint |

The renderer's cost does not depend on the particle budget: it samples these two textures. That is
what makes the LOD honest — a 1 M-particle preset and a 16 k-particle preset draw the same number of
triangles.

## 2. Frame flow

**Submission 1 — `OceanSim.simulate()`** (2.5D layers, `simDt = dt / sweSubsteps`):

1. `wave.clearFar` — zero the far accumulators (bias-encoded height + foam + count).
2. coarse layer: `SweLayer.update` (`find` every 4th substep, then `step`) × `cswHz` steps.
3. `splatCoarse` — the coarse columns deposit *elevation* into the far accumulators.
4. `wave.update` → `wave.splat` — packets advect at their group velocity and deposit their footprint.
5. `resolveFar` — accumulators → `farField`, blended with the near field inside the near footprint.
6. fine layer: `fine.update` × `sweSubsteps` (each: hash clear/count/scan/scatter every 4th substep,
   then the fused `swe_step`).
7. `clearNear` → `splatFine` — the fine columns deposit *column height*.
8. `spawnCrests` — breaking crests push entries into the MPM spawn queue.

**Submission 2 — `OceanSim.couple()`** (`simDt = dt / mpmSubsteps`):

9. `resolveNear` — accumulators → `nearField` (η = height − bed).
10. MPM `clear → p2g → gridUpdate → g2p → spawn` × `mpmSubsteps`; `g2p` writes the volume it absorbs
    into `deposit[i]`, which `swe_step` consumes on the next frame.
11. `Renderer.frame` — sky, near mesh, far mesh, screen-space fluid, NSR/post.

Re-writing the uniform block between the two submissions (rather than allocating a second one) is
deliberate: one schema, one bind group, and the profiler can attribute the two halves separately.

## 3. Buffers and passes

| Resource | Format / size (gtx) | Notes |
| --- | --- | --- |
| `swe.particlesA/B` | 262 144 × 32 B | ping-pong; A seeded, B updated |
| `swe.cellCount/cursor/particleIndex/cellStart` | 4 × O(n) u32 | counting-sort grid (Hoetzlein) |
| `swe.blockSums/blockOffset` | `ceil(cells/512)+1` | two-level exclusive scan |
| `swe.deposit` | n × 4 B `atomic<u32>` | MPM → SWE mass return, 1/256 m³ |
| `bed` | `r16float` 512² | baked once from `bedDepthAt` |
| `nearAccum` / `farAccum` / `farCount` | (1024², 512²) × 16 B / 4 B | fixed-point integer atomics |
| MPM `particles` | 140 000 × 96 B | pos(w=lifetime), vel(w=volume), C, F |
| MPM `gridP/gridV/aux/deposit` | tile-major, padded to 8³ tiles | `gridP` packs mass+momentum as `vec2<u32>` |

Pass inventory (`web/shaders/`): `swe_hash` (clear/count/scatter), `swe_scan` (scanBlocks/scanTop/
scanAdd), `swe_step` (main), `swe_splat` (clearNear/splatSwe/splatCoarse), `swe_spawn`
(spawnFromCrests), `surface_resolve` (resolveNear/resolveFar), `wave` (clearFar/update/splat),
`mpm` (clear/p2g/gridUpdate/g2p/spawn), `bed_bake` (main), `render/*`.

## 4. Conventions the code depends on

* **Bindings**: `@group(0) @binding(0)` is always the `Globals` uniform. `@group(1)` is laid out per
  pass: `0..3` storage buffers, `8` = bed texture, `9` = bed sampler, `16+` = surface textures.
  Group(1) indices are *not* a global ABI — each kernel declares what it needs, and `sim/*.ts` builds
  the bind group from the same list.
* **Fixed point**: every cross-pass accumulator is `array<atomic<u32>>` with the scales in
  `common/accum.wgsl` (`HEIGHT_SCALE` 256, `FOAM_SCALE` 1024, `VEL_SCALE` 256 with `VEL_BIAS` 64,
  `COUNT_SCALE` 256, `HEIGHT_BIAS` 64 for the far field's biased-elevation convention). Order
  independence is the point: the result cannot depend on particle order or on which pass wrote first.
* **Determinism**: all randomness comes from `randStep(&seed)` with seeds derived from
  `P.seed`, the particle index and `P.frame`.
* **Bathymetry**: `bedDepthAt` exists twice on purpose — WGSL (`common/util.wgsl`) and TypeScript
  (`core/params.ts::bedDepthAt`). The CPU version seeds `V = dx²·depth` (which is what makes still
  water a fixed point); the GPU version bakes the texture the solver reads. They must stay identical;
  the formula is closed form and the tests pin its constants.
* **Units**: metres, seconds, m³. Elevation η is relative to the still-water level; the world Y of the
  surface is `P.seaLevel + η`.

## 5. Mass and momentum

Volume is the conserved quantity, not mass: `V` is owned by the column particle, and the only things
that change it are the absorbing sponge, the toroidal re-localisation on wrap, the MPM deposit, and
the MPM spawn (which removes volume from the column it came from). The full cycle:

```
breaking crest ──spawnFromCrests──► MPM particle (volume leaves the column)
MPM g2p, below absorb depth ──► deposit[i] (fixed point)
next swe_step ──atomicExchange(deposit[i])──► V_i += deposit/256
```

Momentum is not a bookkeeping variable: the pressure force is pairwise antisymmetric by construction
(`−Σ_j V_i V_j ∇_i W_ij` with `∇_j W_ji = −∇_i W_ij`), and the CPU mirror in `tests/model.test.ts`
asserts that the total cannot drift over a step to 1e-9.

## 6. Numerics

* **Kernel**: quadratic `W = 6/(πh²)(1−q)²` with compact support `h = 2dx` (≈13 neighbours in 2D) and
  an analytically normalised disc integral. `kernelGradFactor = dW/dr`.
* **Lattice constants** (see `docs/RESEARCH.md` §3): `latticeWSum` = 1.12 makes the derived height a
  real depth; `latticeGradNorm` = 0.873 makes the kernel gradient a real gradient, which is what makes
  still water on a slope a fixed point instead of a slow slide.
* **Integration**: symplectic Euler, one dispatch per substep, `dt` clamped and split by
  `sweSubsteps` / `mpmSubsteps`; acceleration is clamped by `P.maxAccel` for safety.
* **Stabilisers**: XSPH smoothing on the advection velocity, a soft-core repulsion inside 0.35 h,
  quadratic bottom drag, breaking-wave drag keyed on the Froude number, and an absorbing sponge band
  at the fine layer's boundary that also relaxes `V` back to the local depth.
* **Toroidal wrap**: an infinite ocean on a fixed particle budget. A wrapping particle re-localises
  `V = dx²·depth(new position)` and halves its velocity. The wrap is why every non-periodic field
  (the bed) has a seam: the bed is smooth over the 768 m fine domain, so the seam term is 13 % of
  `g|∇b|` *without* the lattice normalisation and third-order small with it.

## 7. Level of detail and adaptivity

* The two lattices follow the camera in whole-cell jumps (`recenter`, `radius·0.5` at a time), so
  memory is fixed and the horizon never runs out.
* The MPM box follows the camera, snapped to its cell size; the spawn queue stores positions relative
  to the camera to keep the fixed-point range small.
* `AdaptiveQuality` measures frame time and moves `level` (0.35 … 1) and `effects` (0 … 3). `level`
  scales the MPM draw count (`maxParticles · (0.25 + 0.75·level)`), the mesh detail amplitude and the
  active tile count; `effects` gates shadows/SSR and the screen-space fluid layer. The controller has
  a cooldown so it cannot oscillate, and it is disabled with `L` (or `?adaptive=0`).

## 8. Failure modes and their treatment

| Symptom | Cause | Treatment in code |
| --- | --- | --- |
| Water slowly drains downhill | Unbalanced pressure/bed operators | `latticeGradNorm` normalisation (tested) |
| Surface sits above the bed in still water | Un-normalised kernel sum | `latticeWSum` normalisation (tested) |
| Lattice clumps after seconds of still water | SPH pairing instability | core repulsion + XSPH + drag; documented limit |
| Crests explode | Compression + no dissipation | Froude-gated breaking drag, `maxAccel` clamp |
| Reflecting boundary | Hard edge | absorbing sponge band, toroidal wrap re-localisation |
| Frame time spikes when a wave hits the camera | SSFR fill rate | `effects`/`level` gates, render scale, fluid draw cap |
| Visible seam where fine meets coarse | Field mismatch | `nearFieldFactor` used by *both* the resolve and the mesh |
