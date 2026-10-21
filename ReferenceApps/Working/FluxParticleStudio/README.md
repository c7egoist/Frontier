# Flux · Particle Studio

AE-style GPU particle editor: emitter layers, a scrubbable loop timeline,
flow-field turbulence, starburst events, velocity-stretched light streaks,
bloom + motion trails, and PNG / WebM / JSON export. Dressed in the Exhibits
dark UI language.

No accounts, no backend; compositions autosave to the browser.

## Run

```sh
cd particle-editor
npm install
npm run dev      # → http://localhost:5175
npm test         # 8 tests: presets/io/shader sanity
npm run build    # static dist/ — CSS is inlined so githack-style hosts stay styled
```

## What it does

- **Emitter layers** — point / sphere / box / disc / ring / line shapes, up to
  20 000 particles each: count, life, speed, spread, direction, position.
- **Forces** — gravity, XZ wind, and trig flow-field turbulence
  (amount / scale / speed) with a re-seedable evolution.
- **Look** — true-3D solid particles (faceted **shards** or **voxel cubes**,
  velocity-aligned with tumble, lit by key + rim + glint shading), size over
  life, streak stretch, brightness, 3-stop colour-over-life gradient,
  additive or normal blending.
- **Diagnostics** — a live GPU badge in the viewport corner (draw calls,
  triangles, programs); click it for GL info, per-layer status, and the
  captured console log. `window.__flux` exposes store + engine.
- **Starbursts** — per-layer radial shockwave + flash at a fixed event time,
  ticked in amber on the timeline.
- **Timeline** — play / pause / loop, exact scrub (the sim is a pure function
  of time, like AE), 1–30 s loop duration.
- **Post** — Unreal bloom + afterimage light trails, both toggleable live.
- **Layers** — add / duplicate / delete / visibility / opacity; labelled
  undo/redo, autosave, unsaved-work guard.
- **Export** — frame PNG, one-loop WebM render, reloadable `.flux.json`.
- **Presets** — 7 tuned compositions: Prism Burst, Iris Flow, Voxel Bloom,
  Silver Tide, Teal Current, Violet Split, Jade Flower.

## Shortcuts

`Space` play · `Home` restart · `F` reset camera · `L` add layer ·
`Del` delete layer · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo ·
`Ctrl+S` download composition · `?` help · drag orbits, wheel zooms.

## Layout

```
index.html            shell (topbar / panels / viewport / timeline / status)
src/style.css         Exhibits dark system (pills, sections, sliders, switches)
src/shaders.js        stateless particle GLSL (streak-aligned instanced quads)
src/engine.js         Three.js viewport, layers, composer, transport, capture
src/state.js          store + snapshot undo (pure)
src/presets.js        starter + 7 reference-tuned compositions
src/panels.js         composition / layers / presets + layer inspector
src/timeline.js       transport, playhead, duration, burst ticks
src/io.js             JSON codec, PNG/WebM export, downloads
src/main.js           boot + wiring + shortcuts + autosave
tests/                node --test suite (8 tests)
```

## Limits

- No keyframed properties yet — motion comes from the time-driven sim,
  turbulence evolution, and burst events. Per-property keyframes are the
  natural next step.
- Trails + scrub: seeking resets the trail buffer (one clean frame).
- WebM recording needs `MediaRecorder` (all modern desktop browsers).
