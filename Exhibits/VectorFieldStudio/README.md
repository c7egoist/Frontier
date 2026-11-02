# Vector Field Studio — visible validation

This exhibit retains the browser harness, actual rendered captures, and machine-readable results for the GPU field workspace.

## Reproduction

Prerequisites: Node.js 22+, a running dev server on `127.0.0.1:5173`, and optional headless-browser packages.

```bash
npm install
npm install --no-save @sparticuz/chromium puppeteer-core
npm run dev
# in a second shell
npm test
npm run build
npm run validate:visual
```

The harness extracts the bundled AL2023 shared libraries for `chrome-headless-shell`, launches SwiftShader WebGL2, and captures the compositor surface via CDP. Override the target with `FRONTIER_URL`, quality with `FRONTIER_QUALITY`, and frame cap with `FRONTIER_FPS`.

## Validation profile

| Item | Value |
|---|---|
| Capture viewport | 1400 × 860, DPR 1 |
| Renderer | Headless Chromium / SwiftShader WebGL2 |
| Quality | Low · 1,620 glyphs · 4,096 tracers · 9,409 terrain vertices |
| Frame pacing | 5 FPS cap for software-WebGL surface readback |
| Interactions | Animated/fixed-arrow frame comparison, preset switching, scalar filmstrip selection, sample CSV import, terrain probe |
| Assertions | WebGL2, `EXT_color_buffer_float`, realtime arrow pixel change > fixed-arrow control, visible probe, zero console/page errors |

The low/fps-capped profile exists only to make software-WebGL screenshots reliable. The application defaults to balanced quality and uncapped pacing on a normal GPU browser. The reported software FPS is not a performance claim.

## Evidence

| File | Shows |
|---|---|
| `Capture/01-wind-workspace.png` | Wind field, obstacle wake, GPU glyphs/tracers, telemetry and filmstrip |
| `Capture/02-terrain-flow.png` | Vegetation scalar channel, rainfall/vegetation layers, terrain flow |
| `Capture/03-force-field.png` | Two-source force field with pressure scalar |
| `Capture/04-imported-data.png` | Sample CSV imported into Float32 3D texture, data-scalar channel |
| `Capture/05-probe.png` | Active 3D probe with vector and derivative readout |
| `Capture/06-arrow-motion-a.png` | Isolated viewport frame at animation time A |
| `Capture/07-arrow-motion-b.png` | Isolated viewport frame 1.4 s later; arrow origins have advected |
| `Capture/validation-report.json` | Environment, frame-difference metrics, interaction results, console/page errors, verdict |
| `validate.mjs` | Harness that produced the captures |

## Result

Latest run: **2026-11-02 17:04:21 UTC — PASS**. See `Capture/validation-report.json` for the machine-readable result.

| Check | Result |
|---|---|
| Unit tests | 12 / 12 passed |
| Production build | Passed · Vite 8.3.5 |
| WebGL2 / `EXT_color_buffer_float` | Available |
| GPU status | `WebGL2 · GPU shaders` |
| Animated-arrow changed pixels | 40.558% · mean absolute RGB delta 21.901 |
| Fixed-arrow control changed pixels | 11.246% · mean absolute RGB delta 5.924 |
| Rendered captures | 7 / 7 completed |
| Preset / scalar / import interactions | Exercised |
| Terrain probe | Visible · position `-11.36, 0.16, -11.88` |
| Browser console errors | 0 |
| Browser page errors | 0 |

A `PASS` means WebGL2 initialized with float-framebuffer support detected, animated arrow frames changed substantially more than the fixed-arrow control, the probe returned a sample, all seven captures completed, and no browser console or page errors were observed.
