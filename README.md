# Frontier Ocean

A real-time ocean for WebGPU, built out of **particles** — no FFT synthesis anywhere in the project.

* **Fine shallow-water particles** (Lagrangian water columns, Hoetzlein counting-sort neighbours) carry
  the ocean you can touch: 262 k columns over 768 m at 1.5 m spacing on the default preset, 1 M on the
  RTX preset.
* **A nested coarse layer** covers the mid-field at a fraction of the update rate, so the surface does
  not end where the fine lattice ends.
* **Wave particles** (Yuksel/House/Keyser 2007) carry the swell to the horizon at 3–9 km with
  depth-dependent dispersion, so packets slow down, steepen and spill over a shoal.
* **MLS-MPM** runs in a camera-following 3D box (140 k particles, 22 m across on the default preset)
  for the splash, curl and whitewater that a height field cannot express, and returns its mass to the
  shallow-water layer through a `deposit` slot per column.
* **Screen-space fluid** with a Narrow-Range Filter shades the 3D particles; the ocean mesh and the
  fluid meet in one shared surface space.

Everything is written for a **GTX-class GPU** (4.4 TFLOP/s, 192 GB/s) and scales up rather than down:
presets, per-layer budgets and an adaptive quality controller are in `web/src/core/params.ts`.

## Requirements

* A browser with WebGPU: Chrome/Edge 113+, Safari 18+, Firefox 141+ (on Linux, Chrome may need
  `--enable-unsafe-webgpu`).
* Node 20+ for the dev server and the checks.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`?tier=safe|igpu|gtx|rtx` forces a preset, `?preset=safe|igpu` forces a low-end one, `?bench=1` lifts
the adaptive target to 240 fps for measurement, `?scale=0.5` pins the render scale, `?adaptive=0`
freezes quality.

**Controls**: drag to look · `WASD` fly · `Shift` boost · `Space`/`C` up/down · click to push water,
`Alt`+click to stir · `1`–`5` debug views · `F` toggle the 3D layer · `L` adaptive quality · `P` pause ·
`R` reset the camera · `H` hide help.

## Checks

There is no GPU in CI, so the repository is verified statically and numerically instead:

```bash
npm run typecheck     # tsc --noEmit, strict, WebGPU types
npm run check:globals # the generated globals.wgsl matches the TS schema (byte-for-byte, offsets too)
npm run check:wgsl    # resolves every #include/#ifdef, parses every entry point, audits P.* usage
npm test              # vitest: model invariants + layout/drift guards
npm run check         # all of the above, in order
npm run build         # tsc + vite build (this is what passes for an integration test here)
```

`npm run gen:globals` regenerates `web/shaders/common/globals.wgsl` after editing `GLOBALS_FIELDS`;
`npm run check:globals` fails if it is stale (it runs automatically before `dev`).

## Documentation

* [`docs/RESEARCH.md`](docs/RESEARCH.md) — the survey behind the design: what Splash does, why SPH is
  too expensive, how the shallow-water particle formulation works, the two discretisation traps
  (kernel normalisation and well balancing) and their fixes, the pairing instability, the rendering
  research, and the WebGPU limits that shaped the code.
* [`docs/DESIGN.md`](docs/DESIGN.md) — architecture: layers, frame flow, buffers and passes, binding
  and fixed-point conventions, the mass cycle, numerics, LOD, and the failure modes each guard exists
  for.
* [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) — the cost model per pass, estimates for a GTX 1060,
  the preset numbers, how to measure on real hardware, and where the headroom is.

## Repository layout

```
web/index.html          app shell: canvas, HUD, help, fatal-error overlay
web/src/core/           GPU bootstrap + capabilities + timestamp profiler, params/presets, math
web/src/common/         the WGSL preprocessor/resolver and the CPU-side uniform schema
web/src/sim/            the layers: swe (fine/coarse), surface (bed, accumulators, resolve), wave, mpm
web/src/render/         scene targets, meshes, screen-space fluid passes, post
web/src/main.ts         camera, input, HUD and the two-submission frame loop
web/shaders/            WGSL: common (globals/util/accum/bed_bake), swe, wave, mpm, render
tools/                  gen-globals (schema -> WGSL) and check-wgsl (the offline WGSL auditor)
tests/                  model invariants and layout drift guards (vitest)
```

## Status and limitations

Simulation, renderer and app shell are complete; the numbers in `docs/PERFORMANCE.md` are a cost model
and have not been measured on hardware yet (the development sandbox has no GPU), so the first run on a
real machine should be treated as the first measurement. Known limits are listed at the end of
`docs/PERFORMANCE.md` — the two that matter are the toroidal seam of the fine layer (third-order small,
absorbed by the sponge band) and the SPH pairing instability of a perfectly still lattice (mitigated,
documented, with the fix noted).
