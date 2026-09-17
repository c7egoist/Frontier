# Frontier Ocean — Adaptive Column Simulation prototype

A real-time, **non-FFT, simulation-driven ocean** in **WebGPU** (TypeScript, zero runtime
dependencies). Companion prototype to `docs/OCEAN_SIMULATION_RESEARCH.md` — read that for the
"why" (technique survey, references, performance model).

## What it implements

| Piece | Technique |
|---|---|
| Water core | **2D column simulation** (depth-averaged wave equation `h_tt = c²∇²h`) on GPU compute, per-column state `(h, ∂h/∂t, foam)` in RGBA16F textures |
| Scale | **3 camera-following cascades** (96 m / 640 m / 4096 m periodic windows, exponentially growing) — one live simulation everywhere, no tiling FFT |
| **Adaptive resolution** | **Block-quadtree AMR (BUQ-style)** on the near cascade: 8×8 blocks refine 2:1 by a steepness/curvature/energy score with hysteresis + budget; fine level runs 2 half-dt substeps, restricts back into the coarse grid, and composites into the 256² render texture |
| Spray | GPU particle system spawned from breaking-crest metric (concave curvature × height × speed), atomic ring buffer, billboard rendering, surface re-entry kill |
| Foam | Accumulates at sharp fast crests in the sim state, decays exponentially, shaded with noise breakup |
| Sea-state controller | Per-frame block-RMS readback drives wind injection + feedback damping so the sea converges to a target height (tuned numerically, see `test/physics.ts`) |
| Rendering | Radial-LOD ("clipmap disc") mesh to a 13 km horizon, band-blended height sampling, per-band grid snapping, analytic micro-normals, fresnel sky, sun specular, SSS-style crest tint, foam, haze |
| Interaction | Click = splash impulse (watch the AMR grid bloom around it), wind slider = sea state |
| Scalability | Tier presets **GTX 1050 → RTX 4090**: cascade configs, AMR budget (0–64 blocks), spray budget (8k–200k), mesh/normal detail, render scale |

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires a WebGPU browser (Chrome/Edge 113+; the GPU can be anything from a GTX 1050 up).
Controls: **drag** orbit · **wheel** zoom · **click water** splash · **shift-drag** pan.
GUI: quality tier, AMR on/off, sea state, spray, minimap overlay, wave-height debug view.

URL params: `?tier=low|mid|high|ultra`, `&amr=0`, `&map=0`, `&spray=0`, `&scale=0.75`.

## Read the HUD

- **AMR blocks** — refined blocks / 64. Splash somewhere and blocks light up around it (also
  visible as yellow outlines on the minimap).
- **sim cells** — columns actually simulated vs a uniform fine grid; the difference is the AMR
  saving (~40–60% at default settings, more at deep refinement).

## Tests (no GPU needed)

```bash
npm test
```

- `test/physics.ts` — TypeScript ports of the exact shader math: CFL stability over 60 s,
  sea-state controller convergence, wave translation at speed c = √(g·d), AMR score
  calibration (calm < coarsen threshold, splash > refine threshold).
- `test/validate-wgsl.mjs` — parses every shader with a full WGSL parser, cross-checks all bind
  group declarations against the layouts in `sim.ts`/`renderer.ts`, and verifies uniform struct
  sizes match the TS-side packing (catches vec-alignment bugs).
- `test/headless.mjs` — optional: drives a real headless Chrome (WebGPU + SwiftShader) against
  the built app. Needs a working Chrome with NSS (`npm i -D puppeteer-core @sparticuz/chromium`
  on a machine with system libs).

## Layout

```
src/
  main.ts            bootstrap, frame loop, input, splash raycast
  sim.ts             cascades, block-quadtree AMR, sea-state controller, spray
  renderer.ts        ocean mesh + sky + spray + minimap pipelines
  tiers.ts           quality tier table (the scalability knobs)
  camera.ts gui.ts math.ts
  shaders/
    common.ts        shared WGSL (hash/noise, wrapping bilinear, sky, tonemap)
    sim.ts           wave-equation step, init, AMR fine/restrict/composite/score
    spray.ts         spawn / integrate / billboard shaders
    water.ts         sky, ocean surface, minimap
```
