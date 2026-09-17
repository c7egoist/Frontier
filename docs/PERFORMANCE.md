# Performance

Everything here is a **cost model plus the numbers the code is configured with**. The sandbox this
was written in has no GPU, so nothing below is a measured frame time: the arithmetic is shown so it
can be checked, the knobs are named, and section 5 explains how to measure the real thing in one
minute. Where a number is an estimate it says so.

## 1. The hardware the presets are aimed at

| Target | FP32 | Bandwidth | Preset |
| --- | --- | --- | --- |
| GTX 1060 / 1650 class | 4.4 / 3.0 TFLOP/s | 192 / 128 GB/s | `gtx` — the default target |
| RTX 3060 | 12.7 TFLOP/s | 360 GB/s | `rtx` |
| RTX 4070 / 4090 | 29 / 83 TFLOP/s | 504 / 1008 GB/s | `rtx` (the budgets scale, the algorithm does not change) |
| Integrated (Iris Xe, Apple M1) | 2.1–2.6 TFLOP/s | 50–68 GB/s shared | `igpu`, `safe` |

Pascal-era hardware is the constraint that matters: 4.4 TFLOP/s and — more importantly — *slow L2
atomics*. That is why the frame is designed around two cheap layers and one small expensive one,
rather than one big uniform grid of particles.

## 2. Per-pass cost model

Per-particle costs are given per *substep*; multiply by `count × substeps × Hz` for the layer.

| Layer | Work per particle | Traffic per particle | gtx: particle-updates/s |
| --- | --- | --- | --- |
| Fine SWE `swe_step` | ~13 neighbours × ~28 flops + 3×3 cell scan ≈ **380 flops** | 32 B write + ~64 B cold read (neighbours are L1-resident) | 31.5 M |
| SWE grid rebuild (every 4th substep) | 6 passes, ~8 B/particle each | ~50 B | 7.9 M |
| `splatFine` | 4 atomic adds × 4 texels = **16 atomics** | 32 B | 15.7 M |
| Coarse SWE + splat | same, 16 m spacing | same | 1.0 M |
| Wave `update` | ~40 flops | 40 B | 1.4 M |
| Wave `splat` | footprint 9–515 texels (mean ≈ 60) × 5 atomics ≈ **300 atomics** | 40 B | 1.4 M |
| MPM `p2g`/`g2p` | 27 nodes × (2 atomics + ~20 flops) / 27 nodes × ~100 flops | 96 B + grid traffic | 33.6 M |
| MPM grid clear/update | 38 k cells × 32 B × 4 substeps | ~0.15 GB/s | — |
| Render: sky + 2 meshes | 128² × 2 verts, 65 k triangles | — | — |
| Render: SSFR splat ×2 | 140 k quads, 10–25 px radius → 40–280 Mpx/pass | — | — |
| Render: NRF + post | 2 × RG16F + 1 full-screen at 1632×918 | — | — |

## 3. What that adds up to on a GTX 1060 (estimates)

| Bucket | Estimate | Why |
| --- | --- | --- |
| Fine + coarse SWE (all passes) | **0.6–1.5 ms** | 12 GFLOP/s of compute and ~2.5 GB/s of storage traffic at 60 Hz; latency-bound rather than throughput-bound |
| Wave packets | **0.5–1.5 ms** | ~430 M L2 atomics/s from the splat footprints |
| MLS-MPM (4 substeps) | **1.5–3 ms** | ~1.8 G atomics/s in P2G, 27-node gather/scatter |
| Render (sky, meshes, SSFR, NRF, post at 0.85×) | **3–8 ms** | fill-rate bound: SSFR overdraw is 40–280 Mpx per splat pass |
| **Total** | **≈ 6–14 ms** | the target is 16.6 ms, so a 1080p60 GTX run has ~20 % headroom — which is exactly the margin `AdaptiveQuality` manages |

Two conclusions the code already acts on:

* **The CPU-side simulation layers are cheap; the 3D layer and the screen-space fluid are not.**
  That is why `mpmSubsteps`, the MPM count and the SSFR `effects` gate are the first knobs the
  adaptive controller touches, and why the mesh is a fixed 128² grid at every preset.
* **Atomics are the currency of this design.** The three atomic-bound passes (wave splat, MPM P2G,
  SWE splat) are the ones to watch on Pascal. Every one of them has a count knob and a resolution
  knob in `PRESETS`.

## 4. Presets in numbers

| | safe | igpu | gtx | rtx |
| --- | --- | --- | --- | --- |
| Fine SWE particles / spacing | 16 384 / 3 m | 65 536 / 3 m | 262 144 / 1.5 m | 1 048 576 / 1.5 m (768 m) |
| Fine domain | 384 m | 768 m | 768 m | 1536 m |
| Coarse layer | off | 16 384 @ 32 m, 10 Hz | 65 536 @ 16 m, 15 Hz | 262 144 @ 8 m, 30 Hz |
| Wave packets | 2 000 | 8 000 | 24 000 | 64 000 |
| Packet domain | 3 km | 3 km | 6 km | 9 km |
| MPM particles / box | 4 000 / 12 m | 20 000 / 12 m | 140 000 / 22 m | 400 000 / 32 m |
| Near / far field | 256² / 128² | 512² / 256² | 1024² / 512² | 1536² / 1024² |
| Render scale | 0.5× | 0.62× | 0.85× | 1.0× |
| Mesh (levels × res) | 4 × 64² | 5 × 96² | 6 × 128² | 7 × 160² |
| Layer memory (`totalBytes`) | ~6 MB | ~14 MB | ~45 MB | ~140 MB |

`deriveConfig()` clamps every budget against the adapter's real `maxStorageBufferBindingSize`
(WebGPU's default is 128 MiB per binding) and against `maxBufferSize`, so a preset that does not fit
degrades to what fits instead of failing to start.

## 5. Measuring it

1. `npm run dev`, open with `?bench=1` — that raises the adaptive target to 240 fps so the controller
   does not throttle the measurement, and keeps every pass in the frame.
2. The timings themselves come from `Profiler` in `web/src/core/gpu.ts`: it reserves timestamp pairs
   per pass (`timestamp-query` and, where available, `timestamp-query-inside-passes`) and resolves
   them into a readback ring. Without the feature it degrades to a no-op, so the render loop never
   blocks on a readback either way.
3. The HUD shows frames/s, smoothed frame time, the quality level and the memory footprint; the
   "gpu budget" bar is frame time against the 60 fps target.
4. Quick ablations, all reachable from the keyboard: `F` (3D layer + SSFR off), `1`–`5` (debug views,
   which replace the shaded output with the raw height/normal/foam/velocity/counter visualisation),
   `P` (freeze the simulation — the renderer keeps running), `L` (adaptive off, so the level stays
   where you put it).
5. To attribute a spike, use the timestamp table rather than intuition: a spike that disappears with
   `F` is SSFR fill; one that tracks camera speed is the MPM box re-seeding.

## 6. Where the headroom goes if you need more

In rough order of value per line of code:

1. **SSFR at half resolution** — splat thickness/depth into half-res targets and upsample in the
   shade pass. Halves the two most expensive render passes; the filter already works in metres, so
   the only change is the texel size.
2. **`farRes` down one step** (512 → 384) — the wave splat footprint scales with
   `(domain/farRes)²`; the horizon is unaffected, only the swell's fine structure.
3. **Cheaper neighbour loop** — the current loop reads `cellStart` for all 9 cells; a bitmask-per-row
   test would skip empty rows on the 3×3 scan (≈2 of 9 cells are typically empty at 13 neighbours).
4. **Subgroup-wide neighbour fetch** — the 3×3 scan re-reads the same buckets from every lane. With
   `subgroups` this becomes one broadcast per bucket row; the capability is already queried in
   `gpu.ts` and unused.
5. **Sparse MPM tiles** — `PRESETS.gtx.mpmElementsPerParticle` trades grid resolution against
   atomics; sparse tiles that skip empty regions are the next step if the box ever grows past 32 m.

## 7. Known limits

* The fine layer is toroidal and the bed is not periodic: every field has a seam term at the lattice
  boundary. It is third-order small with the lattice normalisation, and the sponge band sits on top of
  it, but a hard look at the boundary at grazing angles will find it.
* The lattice pairing instability (docs/RESEARCH.md §3.3) is mitigated, not eliminated: a still ocean
  drifts above round-off after roughly ten seconds of simulated time. Cheap fix if a title needs
  perfectly still water: periodic semi-Lagrangian re-latticing of the fine layer.
* SSFR cost is camera-distance dependent by nature. Flying into a crest spikes the frame; the
  adaptive controller is the answer, not a constant-time guarantee.
