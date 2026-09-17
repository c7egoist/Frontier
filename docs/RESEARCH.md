# Research notes: how a large ocean gets simulated without an FFT

This is the survey the implementation is built on: what the alternatives cost, what the shipped
technique in each of them is, and which pieces this project took, rewrote or rejected. Every claim
that shaped a design decision is cited inline; the implementation consequences are summarised at the
end of each section.

Scope: a **real-time, large-area ocean** (kilometres of horizon, metres of detail near the camera) on
**WebGPU**, for a GTX-class GPU (≈4.4 TFLOP/s, ≈192 GB/s — 1060/1650 class) scaling up to RTX
(≈13–83 TFLOP/s, ≈360–1008 GB/s). Explicit constraint from the brief: **no FFT ocean synthesis** —
the water has to come from a particle simulation.

## 1. The reference implementation and what it does

`matsuoka-601/Splash` ([github.com/matsuoka-601/Splash](https://github.com/matsuoka-601/Splash)) is
the closest public WebGPU artefact to the target experience. Reading its tree (via `gh api`; raw
fetches are blocked in this sandbox) shows a very conventional modern stack:

| Pass directory | Files | Technique |
| --- | --- | --- |
| `mls-mpm/` | `p2g_1`, `p2g_2`, `p2gDensity`, `updateGrid`, `g2p`, `clearGrid`, `castDensityGrid`, `clearDensityGrid`, `copyPosition` | MLS-MPM, Tait EOS with γ = 1 and a large stiffness, P2G scatter with `atomicAdd` on 32-bit ints reinterpreting floats |
| `render/` | `depthMap`, `narrowRangeFilter`, `gaussian`, `sphere`, `fluid`, `thicknessMap`, `densityRaymarch`, `fullScreen`, `bgColor` (+ `fluidRender.ts`) | Screen-space fluid rendering: splat depth, Narrow-Range Filter, then shade; sub-pixel spheres for the splat |
| `public/cubemap/` | 6 faces | skydome, the only "distance" the scene has |

Its sibling `matsuoka-601/WebGPU-Ocean` documents the same trade-off space and states the two
constraints this project inherited:

* **MLS-MPM is chosen over SPH** because SPH's per-particle neighbour search and pressure solve are
  far more expensive per particle (and that repo's SPH path was reportedly unstable on macOS).
* **P2G must be done with integer atomics** (`atomicAdd` on `u32` with a float bit pattern), because
  floating-point atomics are not order-deterministic and WebGPU forbids them on storage textures.

Splash is a *tank*: a bounded box, a few metres across, ~10⁵–10⁶ particles, no horizon, no waves
travelling into the distance. A game ocean needs the opposite aspect ratio: tens of square kilometres
of surface, and detail only where the camera is. That single difference drives the architecture below.

## 2. The candidate techniques, and why the stack looks like this

### 2.1 FFT / Gerstner synthesis — rejected by the brief

Spectral (Tessendorf-style) synthesis gives a beautiful far field for the cost of one inverse FFT
per frame, and it is what most shipped ocean renderers use. It is *not* a simulation: the surface is
a fixed superposition of sinusoids, it cannot be edited by events (boats, splashes, terrain), and it
needs a displacement/LOD scheme to avoid tiling artefacts. Rejected: the brief asks for a real
particle simulation.

### 2.2 Grid shallow water (SWE) — the cheap large-area layer

The shallow-water equations in flux/height form are 2D, which is exactly what a large, thin ocean
wants: `∂h/∂t + ∇·(h v) = 0`, `∂v/∂t + (v·∇)v = −g∇(h + b)`. Pure Eulerian SWE on a 512²–2048² grid
is a few tens of microseconds of work per step and gives wave shoaling, refraction, run-up and
wakes for free. What it does *not* give is a surface: the height field is a rendering input, and the
splash/curl/whitecap detail that makes water read as water has to be injected (Tessendorf's fBm
foam tricks, or, as here, particles).

### 2.3 SPH — the "real particles" answer, and its price

SPH with a fixed-support kernel gives genuine particles, conservation and free surfaces, but the
neighbour search dominates: with ~30–60 neighbours per particle and a per-substep cost of
`O(n · neighbours)`, an SPH ocean of 10⁶ particles is out of reach on a 4 TFLOP/s part at 60 Hz
(Splash's own numbers, and the reason `WebGPU-Ocean` refuses SPH). The standard fix for the
neighbour search is Hoetzlein's **counting sort + uniform grid** ([Fast Fixed-Radius Nearest
Neighbors on the GPU, 2014](https://ramakarl.com/pdfs/2014_Hoetzlein_Fast_Neighbors.pdf)): one atomic
per particle to count, a two-level exclusive scan, one atomic to place — that is exactly the pipeline
in `swe/swe_hash.wgsl` + `swe/swe_scan.wgsl`, and it is why the layer stays viable at 262 k–1 M
particles: the scatter is `O(n)` with no branching, and the neighbour loop then reads a
cache-resident bucket list.

### 2.4 The hybrid that this project actually uses

Every technique above is good at one scale and bad at the others, so the ocean is split by **scale
and by update rate**, not by technique:

| Scale | Representation | Why |
| --- | --- | --- |
| Sub-metre splash/curl near the camera | **MLS-MPM** particles in a camera-following 3D box | Handles free surfaces, splashes and merging without a surface tracker; Taichi's paper reports it running ~10¹⁰ particle-updates/s on GPU ([Hu et al. 2018, MLS-MPM](https://dl.acm.org/doi/10.1145/3355089.3356506)) |
| Metres–kilometres of surface, 60 Hz | **Lagrangian shallow-water particles** on a camera-following lattice | Exact mass/volume conservation, no CFL-limited pressure solve, `O(n · 13)` per substep |
| Horizon, 3–9 km, packets | **Wave particles** (Yuksel, House & Keyser, SIGGRAPH 2007) | Analytic packets carry amplitude/phase over long distances with no grid, no CFL and no FFT; they give wakes, refraction over a shoal and a clean "infinite" horizon |

The shallow-water particle layer is the workhorse. Its discretisation is the density↔height analogy
used by **Solenthaler & Pajarola, Density Contrast SPH (2008)**: each particle owns a fixed column
volume `V = dx² · depth` (so mass is conserved by construction), the local depth is the kernel sum
`h_i = Σ_j V_j W_ij`, and the pressure force is the symmetric SPH form
`−Σ_j m_j (p_i/ρ_i² + p_j/ρ_j²) ∇W_ij` with `p = ½ρgh²`. The `h²` factors cancel, leaving a pairwise
antisymmetric force — which is why `tests/model.test.ts` can assert that total momentum cannot drift.
XSPH velocity smoothing ([Monaghan 1989](https://doi.org/10.1016/0021-9991(89)90091-2)) is applied to
the *advection* velocity only, so it stabilises the gradient form without breaking that property.

## 3. Two discretisation traps, and the fixes

Both were found by writing the CPU mirror of the shader (`tests/model.test.ts`) rather than by
running the GPU, and both are cheap closed-form corrections.

### 3.1 The kernel sum is not the height

For a *uniform* lattice of spacing `dx` and kernel radius `h = 2 dx`, the discrete kernel sum is

```
Σ_j dx² W(dx·|j|) = dx² [ W(0) + 4W(0.5h) + 4W(0.707h) ] ≈ 1.1188
```

i.e. 12 % larger than the disc integral it approximates (`∫W = 1` for the quadratic kernel
`W = 6/(πh²)(1−q)²`). Left uncorrected, the derived depth is 12 % too large, the surface elevation
η = h − depth is nonzero in *still* water (2.9 m of a 24 m column), and the Froude/wind/drag terms see
the wrong depth. Fix: divide by the lattice constant `latticeWSum(dx,h)` (`common/util.wgsl`).

### 3.2 The kernel sum is not a gradient either — "well balancing"

`Σ_j V_j ∇W_ij` is a discrete gradient operator, and on a square lattice its norm is *not* 1:
tracing `M = Σ_j (|dW/dr|/r) r_j ⊗ r_j` (isotropic for the square lattice) gives
`latticeGradNorm = ½ Σ_shells 4|dW/dr| r  ⟹ 0.873` for `h = 2 dx`. Two consequences:

1. the pressure term is effectively `0.873 g∇h`, i.e. a 6 % wave-speed error everywhere;
2. the analytic bed term `∇b` that balances it needs the *same* operator, or still water on a slope
   creeps downhill at `(1 − 0.873)·g|∇b|` — the classic lake-at-rest failure of unbalanced
   shallow-water schemes.

Both are fixed by dividing the kernel sum by `latticeGradNorm` and using the analytic bed gradient
directly, which makes the discrete operator exact for a linear field — and a sloping bed *is* linear
locally. The residual left in `tests/model.test.ts` is third-order in `k·dx`, and the test asserts
that the naive form accelerates 5–10× more, and drifts >2× further after two seconds.

### 3.3 The pairing instability (known, mitigated, documented)

A regular lattice is the worst case for the pairing instability of SPH gradients
([Dehnen & Aly 2012](https://doi.org/10.1111/j.1365-2966.2012.21074.x), [Price
2012](https://doi.org/10.1016/j.jcp.2011.09.014)): the self-term and the nearest shells bias the
effective spring constant, so short-wavelength lattice modes grow. The scheme carries three
mitigations — a soft-core repulsion inside 0.35 h (`swe_step.wgsl`), XSPH velocity smoothing, and
bottom drag — and the experiments behind them are in `tests/model.test.ts`: still water on a flat bed
stays below 1e-6 m/s for 5 s of simulated time, and the growth that starts from round-off after that
is the documented long-horizon limit of the layer, not a bug. Two principled upgrades are queued for
it: a higher-order kernel, and periodic semi-Lagrangian re-latticing of the fine layer (cheap because
the layer is quasi-Eulerian already, and it removes the mode entirely).

## 4. Rendering research

* **Screen-space fluid (SSFR)**: splat particle depth/thickness, then filter and shade. The filter
  is the difference between "muddy blobs" and readable water, and the standard choice is Nvidia's
  **Narrow-Range Filter** (Truong et al.): a depth-weighted blur whose weights are confined to a
  narrow band around the centre depth, so it smooths a surface without bleeding across it.
  `render/nrf.wgsl` implements the horizontal/vertical/cleanup trio exactly like Splash's
  `narrowRangeFilter.wgsl`. Depth is written in the same pass that accumulates thickness
  (`fsSurface` writes `frag_depth`); the filter radius and σ are in metres, not texels, so the look
  is resolution-independent.
* **Foam/whitewater practice** ([surfertoday's survey of shipped ocean
  renderers](https://www.surfertoday.com/surfing/ocean-wave-simulation-in-video-games)): whitecaps
  come from *steepness* (breaking crests), *turbulence/compression* and *shoreline* (shallow depth) —
  not from noise. The implementation derives all three: the SWE step produces a `breaking` metric
  from the Froude number and surface steepness (`swe_step.wgsl`), the wave packet layer spills when a
  packet's depth-limited steepness exceeds `waveSteepness`, and both feed the foam channel of the
  height fields, which the mesh and the far field consume.
* **Bubbles and wet foam** ([Stomakhin et al., Guided Bubbles and Wet Foam,
  SIGGRAPH 2022](https://alexey.stomakhin.com/research/whitewater.html)): treat foam as a separate
  phase constrained to the surface manifold rather than as a passive texture — the renderer's foam
  channel is the cheap version of that idea, and `foam/` is reserved for the real thing.

## 5. Coupling and mass

The two simulation layers must exchange water. The pattern used here (a 3D solver over a height field,
with transfer by bilinear deposit) is the one established by Chentanez & Müller's `hfFluid` work and
the 3D-Euler/height-field coupling papers ([ACM
10.5555/2849517.2849519](https://dl.acm.org/doi/10.5555/2849517.2849519)): the height field carries
the bulk and the far field, the 3D solver owns everything that leaves the surface, and the two
exchange *volume*, not forces.

In this implementation the exchange is explicit and one-slot-per-particle, so no pass needs a global
barrier:

```
swe_spawn.spawnFromCrests  ──► MPM particle at a breaking crest (volume removed from the column)
mpm.g2p (below absorb depth) ──► deposit[ i ] (fixed point, 1/256 m³) for particle i
swe_step (next substep)      ──► atomicExchange(deposit[i]) adds the volume back to V_i
```

## 6. WebGPU constraints that shaped the code

From the [WebGPU default limits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits)
(the specification's defaults, which are what a page gets unless it requests more):

* `maxStorageBufferBindingSize` = **128 MiB**, `maxBufferSize` = 256 MiB → at 76 B/particle the SWE
  layer caps out around ~1.5 M particles *per binding*; `deriveConfig()` clamps the budgets against
  the adapter's real limits, so a preset that does not fit degrades instead of failing.
* `maxComputeWorkgroupsPerDimension` = 65 535 → every dispatch is `ceil(count / workgroupSize)` and
  counts are kept in the range where that is safe (the 1 M-particle layer dispatches 16 384 groups).
* `maxStorageTexturesPerShaderStage` = 4 and no atomics on textures → all cross-pass accumulation
  uses **storage buffers of `atomic<u32>`** with a documented fixed-point contract
  (`common/accum.wgsl`), not texture atomics.
* No `textureSample` in a compute pass without an explicit level → every compute-side sample uses
  `textureSampleLevel(..., 0.0)`.

## 7. Sources

* Splash — <https://github.com/matsuoka-601/Splash>; WebGPU-Ocean — <https://github.com/matsuoka-601/WebGPU-Ocean>
* Hu, Fang, Ge, Qu, Zhu, Pradhana, Jiang — *A Moving Least Squares Material Point Method…*, SIGGRAPH
  2018 — <https://dl.acm.org/doi/10.1145/3355089.3356506>
* Yuksel, House, Keyser — *Wave Particles*, SIGGRAPH 2007 —
  <https://www.cs.ucr.edu/~shouse/waveparticles.pdf>
* Truong, Yuksel et al. — *Narrow-Range Filter* (GPU Gems 3 / Nvidia technical report) —
  <https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-physics/part-vi-gpu-physics>
* Hoetzlein — *Fast Fixed-Radius Nearest Neighbors on the GPU*, 2014 —
  <https://ramakarl.com/pdfs/2014_Hoetzlein_Fast_Neighbors.pdf>
* Stomakhin et al. — *Guided Bubbles and Wet Foam*, SIGGRAPH 2022 —
  <https://alexey.stomakhin.com/research/whitewater.html>
* Monaghan — *On the problem of penetration in particle methods*, JCP 1989 —
  <https://doi.org/10.1016/0021-9991(89)90091-2>
* Solenthaler & Pajarola — *Density Contrast SPH*, SCA 2008 —
  <https://doi.org/10.2312/SCA/SCA08/017-024>
* Dehnen & Aly — *Improving convergence in SPH without pairing instability*, MNRAS 2012 —
  <https://doi.org/10.1111/j.1365-2966.2012.21074.x>
* Chentanez & Müller — *Real-time simulation of large bodies of water with small scale details*
  (hfFluid), SCA 2010 — <https://dl.acm.org/doi/10.5555/1921427.1921457>
* Industry practice survey — <https://www.surfertoday.com/surfing/ocean-wave-simulation-in-video-games>
