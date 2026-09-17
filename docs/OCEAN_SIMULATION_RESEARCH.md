# Ocean Simulation for Frontier — Research & Architecture

> Goal: a **real-time, non-FFT, simulation-driven ocean** for large open water, targeting
> entry GPUs (GTX 1050-class) first and scaling up to high-end RTX. Inspired by
> [Splash](https://splash-fluid.netlify.app/) (interactive WebGPU fluid), but designed for
> **ocean scale**. This document is the research summary and the proposed architecture;
> a working WebGPU prototype lives in `ocean/`.

---

## 1. Why not the things you already ruled out (and why that's correct)

### 1.1 FFT oceans (Tessendorf)

FFT/Spectral oceans (Tessendorf 2001) are the industry default for *look* — Sea of Thieves,
Assassin's Creed, etc. all run a Tessendorf-style inverse FFT per frame on the GPU
(see [Rare's SIGGRAPH 2018 talk](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)).
Problems for us:

- **It's not interactive.** The heightfield is a fixed statistical realization driven by wind
  parameters; a boat cannot *push back* on it. You can stamp interactions into a separate
  "dynamic" buffer (Sea of Thieves runs additional real-time surface sims for incidental
  behavior around objects), but the ocean itself never reacts.
- **It's expensive.** A two-pass complex FFT over cascaded 256²–512² grids every frame is one of
  the priciest common water techniques; community measurements put Sea of Thieves' water at up to
  ~40% of frame time when the ocean dominates the view. On a GTX 1050 that budget simply doesn't exist.
- **It's periodic.** The "ocean" is a tiling patch; far field repeats.

So: excluded, as the brief says. The FFT's *only* irreplaceable feature is cheap **dispersion**
(waves of different wavelengths traveling at different speeds). Section 5 covers how we get
dispersion back without FFT.

### 1.2 Full-3D particle fluids (what Splash actually is)

[Splash](https://github.com/matsuoka-601/Splash) is a 3D **MLS-MPM** (Moving Least Squares
Material Point Method) particle sim — the same family as WebGPU-Ocean
(~100k particles on *integrated* graphics, ~300k on decent GPUs; P2G scatter via `atomicAdd`),
rendered with screen-space fluid rendering + a Narrow-Range Filter.
This is great for a *box of water*, and it's why Splash feels so good to poke.

For an ocean it's off by ~3–5 orders of magnitude:

| | Splash (3D MPM) | Ocean needed |
|---|---|---|
| Domain | ~8 m box | 1–10 km visible |
| Volumetric cells at 0.5 m | 16³ ≈ 4k | 2000×2000×40 ≈ 1.6·10⁸ |
| Particles at 8/cell | ~10⁵ (feasible) | ~10⁹ (not feasible) |
| CFL timestep | tiny (sound-speed in MPM) | would need massive substeps |

The fix is not "more particles" — it's **removing dimensions you don't need**. For most ocean
gameplay, water is a *surface* phenomenon: swell, wakes, chop, foam, spray. Depth matters only
for propagation speed and buoyancy. This is exactly what your "2D grid instead of 3D" idea is,
and it's backed by decades of practice.

---

## 2. The option space (what the literature actually offers)

### 2.1 Heightfield / "water columns" — your idea, formalized

Represent water as a heightfield `h(x,z)`; each grid cell is a **column** of water with state
`(h, ∂h/∂t)` or `(h, hu, hv)`. This is the depth-averaged limit of Navier–Stokes. Family members:

- **Pipe model** — Kass & Miller 1990. Virtual pipes between columns, extremely cheap and stable,
  the classic "game water" (GPU Gems ch.1 uses its cousin: sum-of-sines + normal maps).
- **Shallow Water Equations (SWE)** — full momentum form; supports flow, flooding, terrain.
  Heavier, needs careful solvers, but GPU-friendly (see the heightfield interaction survey:
  [Rigid Body Interaction for Large-Scale Real-Time Water Simulation](https://onlinelibrary.wiley.com/doi/10.1155/2014/580154)).
- **Linear wave equation** — `∂²h/∂t² = c²∇²h − damping`. One Laplacian per step per cell.
  This is what **Crest** (production Unity ocean, used in many shipped games) runs for its
  "Dynamic Waves" in camera-following cascade sims
  ([Crest user guide](https://github.com/ajweeks/crest-oceanrender/blob/master/USERGUIDE.md));
  Crest's experimental branch even drives the *whole* ocean shape from the wave-equation PDE.
  Cheap, unconditionally manageable with CFL + damping, handles interactions (boats, explosions)
  by writing velocity/height impulses straight into the grid.

**Cost model (why columns win at scale):** a 1 km² patch at 0.5 m resolution is
**4 M columns ≈ 4 M × ~30 flops ≈ 0.1 GFLOP/frame-step** — comfortably under 1 ms even on a
GTX 1050 (~1.8 TFLOPS, and this workload is bandwidth-trivial: a few MB of texture traffic).
The same volume in 3D at the same surface resolution is ~10⁸ cells and a CFL bound 40× worse.
Verdict: **the surface/column representation is the only one that scales to a large ocean in
real time.** Your instinct is right.

Limitations to know: no overturning (breaking waves fold, they don't invert) → add **particles
for spray/foam**; non-dispersive unless corrected → §5; heightfield can't represent overhangs →
acceptable for an ocean.

### 2.2 Pure Lagrangian particles at ocean scale — why not, alone

2D SPH/PBF on the plane (each "particle" = a column of water) is the most literal reading of
"2D grid of simulated particles". It works, but for an *open* ocean it's strictly worse than a
grid: SPH costs ~O(kN) neighbor queries (k ≈ 30–80) with density/pressure iteration (PBF: 2–4
iterations), you need particles *everywhere* the player can see (km² at 0.5 m spacing = hundreds
of millions), and neighbor search on GPU needs counting-sort infrastructure per frame. MPM/FLIP
are better but same order. Games that ship particle water (e.g. small ponds, Splash-style boxes)
use ≤10⁶ particles ≈ a 300×300 m patch at best — and that's on high-end hardware.

**But** two Lagrangian techniques *do* belong in the stack:

- **Wave particles** (Yuksel, House, Keyser, SIGGRAPH 2007 —
  [project page](https://www.cemyuksel.com/research/waveparticles/)): a 2D particle system where
  each particle carries a *piece of a wavefront* (a local deviation function) moving at phase
  speed. Unconditionally stable, embarrassingly parallel, works on open ocean; boats emit wakes
  by spawning particles. Ran at 170 fps on a GeForce 7900 GTX in 2007. Shipped in the *Uncharted*
  series for wave detail ([water resources survey](https://github.com/wave-harmonic/water-resources)).
  Successor: **Water Wave Packets** (Jeschke & Wojtan 2015/2017) — particles carry whole wave
  *groups*, far fewer needed.
- **Spray/foam particles**: spawned where the column sim says the surface is breaking (§6).
  This is where "real particles" genuinely earn their cost in an ocean.

### 2.3 Hybrid particle+grid (the VFX answer)

Chentanez & Müller's real-time water work (2010-2011: small-media-steps FLIP+heightfield hybrid,
tall-cell grid) combines 3D particles near the action with heightfield elsewhere — real-time on
2010 GPUs for ~meter-scale scenes. Beautiful, still too heavy for km-scale oceans on GTX-class
hardware, but the *pattern* — **grid for bulk, particles for breaking/spray** — is the one to keep.

### 2.4 Adaptive resolution — your AMR idea, formalized

"Adaptive 2D grid, refine where the wave goes up" exists in the hydrology literature as
**Block-Uniform Quadtree (BUQ) AMR** for SWE on GPU:

- Vacondio et al. 2017, *A non-uniform efficient grid type for GPU-parallel Shallow Water
  Equations models* ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1364815216309252)):
  quadtree of uniform-resolution **blocks**; **up to one order of magnitude speedup** vs uniform
  Cartesian grids at equal accuracy; designed specifically so GPU memory access stays
  "plain matrix" fast regardless of adaptivity.
- [BG-Flood](https://github.com/CyprienBosserelle/BG_Flood): open-source GPU SWE on block-quadtree
  AMR (Basilisk-derived), simulates Pacific-scale tsunami→inundation runs quasi-real-time.
- Afivo-based quadtree AMR SWE (2025,
  [MDPI](https://www.mdpi.com/2077-1312/13/10/1834)): block-structured 2:1-balanced quadtree,
  ghost-cell exchange, coarse-flux conservation — the standard machinery, well documented.

Game-adjacent evidence: Crest's LOD system is "adaptive in space" via cascades (camera-centered,
exponentially growing sim windows) + a *render* LOD that smoothly blends displacement textures.
The projected-grid idea (Johanson 2004) and screen-space adaptive meshes
([MDPI 2024 large-scale open sea](https://www.mdpi.com/2077-1312/12/4/572)) adapt the *rendering*
mesh per-pixel, which also fights "stretch".

**One important correction to "refine when the wave goes up":** height alone is the wrong trigger.
A 6 m swell with 300 m wavelength is *smooth* at 4 m resolution; a 30 cm chop with 1.5 m wavelength
at 0.5 m resolution is Nyquist-starved. What actually needs cells is **local wavelength**, which
shows up as steepness/curvature. Practical refinement criteria (all available in the column state):

```
score(block) = w1·max|∇h|          (steepness — wave face)
             + w2·max|∇²h|·Δx      (curvature — crest sharpness)
             + w3·max|∂h/∂t|/c     (kinetic energy)
             + w4·objectProximity  (wakes, hulls, explosions)
```

with **hysteresis** (refine at score > 0.7, coarsen only below 0.3), **budget caps**, and
2–4 frame dwell times — otherwise the grid thrashes and you pay re-allocation every frame.

---

## 3. Verdict on the proposed design

| Proposal element | Research verdict |
|---|---|
| 2D instead of 3D | **Correct and non-negotiable** for ocean scale. Columns/heightfield, depth-averaged. |
| "Particles" | Use **Eulerian columns** (grid) for the bulk — cheaper and stabler at scale; use **Lagrangian particles** where they shine: spray/foam, and optionally wave particles for crisp wakes. |
| Adaptive grid, refine under waves | **Correct family** (BUQ/AMR, proven ~10× savings). Refine on **steepness/curvature + interaction**, not raw height; use blocks (not cells), 2:1 balance, hysteresis, budget caps, ghost cells, per-level timesteps. |
| What's missing | **Dispersion** (oceans need it), **far field** (an AMR window alone doesn't give you a horizon), **foam/spray** (the "alive" factor), **rendering LOD** (AMR in the sim doesn't help unless the render mesh samples the refined result), **buoyancy API** (it's a game). |

---

## 4. Recommended architecture: Adaptive Cascaded Column Ocean (ACCO)

```
                          ┌──────────────────────────────────────────────┐
                          │                 RENDERER                     │
   camera-following       │  clipmap/radial-LOD surface mesh (snapped),  │
   ┌───────────────┐      │  samples height+foam textures, blends bands, │
   │ SPRAY/FOAM    │      │  procedural micro-normals, fresnel sky,      │
   │ particles     │◄──spawn─  sun spec, foam, distance haze         │
   └──────▲────────┘      └───────────────▲──────────────────────────────┘
          │ breaking crests               │ height/normal/foam
   ┌──────┴───────────────────────────────┴──────────────────────────────┐
   │                        SIMULATION (GPU compute)                     │
   │  NEAR cascade (~100 m): block-quadtree AMR column sim               │
   │    L0 coarse grid always simulated; blocks refine 2:1 on demand;    │
   │    composite to fine texture for rendering; restriction pass back   │
   │  MID cascade (~0.5-1 km) & FAR cascade (~2-8 km):                   │
   │    uniform coarse periodic column sims, camera-following            │
   │  all cascades: wave-equation columns + damping + wind forcing       │
   │    + interaction impulses (player, boats, explosions)               │
   │    + (phase 2) band-split dispersion or wavelet front tracking      │
   └─────────────────────────────────────────────────────────────────────┘
```

Key properties:

- **Everything is one simulation** (no "fake far field"): all bands are live, interactive,
  camera-following periodic sims at exponentially growing windows — the Crest pattern, minus FFT,
  with AMR where it matters (near field). Wave patterns wrap, but far windows are km-scale so
  repetition is sub-perceptual.
- **Interaction writes are trivial**: a boat hull, cannonball or explosion = a velocity impulse
  into the near (or mid) cascade. Buoyancy = sample `(h, ∂h/∂t)` at probe points → force on rigid
  body. This is the interactivity FFT can't give you.
- **The AMR is where you save GPU**: uniform fine grid over the near window costs (2×)² = 4× the
  cells everywhere; BUQ spends them only under steep/energetic waves — typically 20–40% of blocks,
  i.e. ~2.5–5× cheaper at equal visual detail, matching the ~10× BUQ literature speedups for
  bigger level counts.
- **Scalability = one config table** (§7): GTX 1050 runs 1 cascade + shallow AMR + few particles;
  RTX 4080 runs 3 cascades + deeper AMR + dense spray + better shading. No structural changes.

### 5. Getting dispersion back (the one real physics gap)

Naive wave equation: all waves move at `c = √(g·d)` → chop keeps pace with swell, looks "mushy".
Deep-water truth: `c(k) = √(g/k)` (short waves slower). Options, in increasing order of cost:

1. **Per-cascade effective depth** (v1 prototype): tune `c` per cascade band. Free. Wrong
   relative speeds *within* a band, but each band reads plausibly.
2. **Band-split dispersion** ("FFT-lite"): split `h` into 2–3 spatial-frequency bands with cheap
   separable blurs (difference-of-Gaussians), integrate each band with its own `c(k_band)`,
   recombine. ~4 extra texture passes, no FFT, no change to interactivity. **Recommended phase 2.**
3. **Water Surface Wavelets** (Jeschke et al. 2018) / **dispersive+shallow split**
   (Jeschke & Wojtan, SIGGRAPH 2023,
   [paper](https://research-explorer.ista.ac.at/download/14240/14725/2023_ACMToG_Jeschke.pdf)):
   state of the art — heightfield sims with *exact* Airy dispersion correction, real-time at 512 m
   domains, obstacles included. This is the "RTX-tier" upgrade path with published algorithms.
4. **Wave particles** handle dispersion natively (each particle carries its wavelength).

### 6. Breaking, foam, spray — where "real particles" live

- Crest metric from column state: `sharpness ∝ max(0, −∇²h)·max(0, h)·|∂h/∂t|/c`.
- Spawn spray particles (ring buffer, `atomicAdd` append) where `sharpness > threshold` and
  randomly by rate; particles are ballistic + wind drag, killed when they re-enter the surface.
- Foam: accumulate on the grid where sharpness is high, decay + diffuse over seconds, advect
  slightly with the wave; shade via noise breakup (Sea of Thieves does the masked/feedback-blur
  variant of this for its object-interaction foam).

### 7. Performance model & quality tiers

Estimates for 1080p, ocean occupying most of the frame; column-step cost ≈ bandwidth-bound
(~8 B/cell/read-pass); numbers intentionally conservative for the 1050 row.

| Tier | GPU | Cascades (res @ window) | AMR | Spray budget | Shading extras | Est. water cost |
|---|---|---|---|---|---|---|
| Low | GTX 1050–1650 | 2 (128² @ 96 m, 128² @ 768 m) | off / depth 1, ≤8 blocks | 10–20 k | basic fresnel + foam | **1.5–3 ms** |
| Mid | GTX 1660–1080 | 2–3 (256² @ 96 m + 192² @ 768 m) | depth 2, ≤24 blocks | 40 k | + micro-normals, spray shadows off | **2–4 ms** |
| High | RTX 2060–3060 | 3 (256² @ 128 m, 256² @ 1 km, 192² @ 4 km) | depth 2, ≤48 blocks | 100 k | + screen-space spray lighting | **3–5 ms** |
| Ultra | RTX 4070–4090 | 3 larger + band-split dispersion | depth 3, ≤96 blocks | 200 k | + narrow-range-filtered refraction/reflection (Splash-style), planar reflections | **5–9 ms** |

Uniform-grid equivalent of a 256² fine near window = 65 k cells/frame-step; AMR at ~30% refined
blocks simulates ~26 k — and the savings grow with refinement depth (2:1 per level: each extra
level costs 4× uniform if applied everywhere).

### 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| AMR boundary artifacts (waves crossing block levels) | ghost cells = bilinear from coarse level; **restriction pass** averages fine→coarse each step so waves leave refined blocks intact; 2:1 balance rule |
| Refinement popping when blocks toggle | hysteresis + dwell; blend old/new block state over 2-3 frames on transition |
| Wave-equation energy buildup (ocean "boiling") | velocity damping + high-band diffusion + bounded wind forcing; CFL `dt ≤ 0.5·Δx/c` per level with subcycling |
| Camera-following artifacts | snap cascade origin to cell grid, advect field semi-Lagrangian against camera delta |
| Far-field wrap repetition | km-scale windows + exponential cascade growth + fog |
| WGSL/WebGPU compat (GTX = Vulkan 1.1-era drivers) | WebGPU works on Vulkan 1.1+; keep to core WGSL, RGBA16F storage fallback to r32float packing if needed; ship WebGL2 fallback later if a console target requires |

---

## 9. The prototype in `ocean/` (what ships with this document)

A self-contained Vite + TypeScript + **WebGPU** app implementing:

- 3 camera-following cascade column sims (near/mid/far) with wind forcing, damping,
  camera advection, click-to-splash interaction — the full "2D particle column" core.
- **Block-quadtree AMR on the near cascade** (BUQ-style): L0 always simulated, blocks refine 2:1
  by steepness/curvature score with hysteresis + budget, fine step (2 half-dt substeps) →
  restriction → composite, live overlay + HUD showing refined blocks and cell savings vs a
  uniform fine grid.
- Spray particles spawned from breaking crests (GPU ring buffer, atomic append), billboarded.
- Radial-LOD ocean mesh to the horizon, band-blended height sampling, procedural micro-normals,
  fresnel sky reflection, sun specular, foam, haze.
- **Sea-state controller**: per-frame block-RMS readback modulates wind injection and adds
  feedback damping so the ocean converges to a target wave height per cascade.
- Quality tier presets (GTX 1050 → RTX 4090), top-down minimap showing the AMR grid + sim state.

Run it:

```bash
cd ocean && npm install && npm run dev
```

Needs a WebGPU browser (Chrome/Edge 113+). Controls: drag = orbit, wheel = zoom,
click on water = splash, GUI = tiers/AMR/wind toggles.

Validation that runs headless (no GPU required): `npm test` — numeric physics ports
(stability, controller convergence, propagation speed, AMR score calibration) and a full WGSL
parse + bind-group/struct-layout cross-check of every shader.


## 10. Roadmap

1. **v1 (this repo)** — cascades + AMR + spray + tiered quality. ✔
2. **v1.5** — band-split dispersion; boat buoyancy probes + hull impulse writes; wake wave particles.
3. **v2** — Water-surface-wavelet / dispersive-split solver for exact Airy dispersion; foam advection.
4. **v2.5** — Splash-style screen-space rendering (narrow-range filter, raymarched absorption) on High/Ultra tiers.
5. **v3** — engine integration: buoyancy API for rigid bodies, network-friendly deterministic wind params, LOD for multiplayer entity interactions.

## 11. References

- Tessendorf, *Simulating Ocean Water* (SIGGRAPH course, 2001) — FFT baseline we're replacing.
- Kass & Miller, *Rapid, Stable Fluid Dynamics for Computer Graphics* (SIGGRAPH 1990) — heightfield columns.
- Yuksel, House, Keyser, *Wave Particles* (ACM TOG, SIGGRAPH 2007) — https://www.cemyuksel.com/research/waveparticles/
- Jeschke & Wojtan, *Water Wave Packets* (SIGGRAPH 2015) and *Water Surface Wavelets* (SIGGRAPH 2018).
- Jeschke & Wojtan, *Generalizing Shallow Water Simulations with Dispersive Surface Waves* (ACM TOG 2023) — https://doi.org/10.1145/3592098
- Vacondio et al., *A non-uniform efficient grid type for GPU-parallel Shallow Water Equations models* (Environmental Modelling & Software, 2017) — Block-Uniform Quadtree AMR.
- [BG-Flood](https://github.com/CyprienBosserelle/BG_Flood) — open-source GPU block-quadtree AMR SWE.
- Chentanez & Müller, *Real-time Simulation of Large Bodies of Water with Small Media Steps* / *Real-Time Eulerian Water Simulation Using a Restricted Tall Cell Grid* (SIGGRAPH 2010/2011).
- Müller, *Fast Water Simulation for Games Using Height Fields* (GDC 2008) — the practical wave-equation column sim.
- [Crest Ocean System](https://github.com/crest-ocean/crest) — production cascaded dynamic-wave architecture; [user guide](https://github.com/ajweeks/crest-oceanrender/blob/master/USERGUIDE.md).
- Ang (Rare), *The Technical Art of Sea of Thieves* (SIGGRAPH 2018) — FFT ocean + incidental real-time sims, foam pipeline. https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf
- Finch, *Effective Water Simulation from Physical Models*, GPU Gems 1 ch. 1 — https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models
- matsuoka-601, [Splash](https://github.com/matsuoka-601/Splash) & [WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean) — WebGPU MLS-MPM reference points; [release thread](https://www.reddit.com/r/GraphicsProgramming/comments/1jh3pd2/splash_a_realtime_fluid_simulation_in_browsers/).
- Truong & Yuksel, *Narrow-Range Filter for Water Rendering* (PACMCGIT 2018) — screen-space fluid rendering quality (Ultra tier).
- Johanson, *Real-time water rendering — projected grid* (2004); MDPI 2024 screen-space-LOD open sea — https://www.mdpi.com/2077-1312/12/4/572
