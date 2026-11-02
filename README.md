# Frontier · Vector Field Studio

A clean, minimal browser workspace for interactive 3D vector-field analysis: wind/air, force fields, terrain flow systems, and generic imported grids. Rendering and tracer advection run on the GPU through WebGL2.

## Quick start

```bash
npm install
npm run dev
```

Open the live preview on port `5173`. For a production bundle:

```bash
npm run build
npm run preview
```

## Included

| Area | Capability |
|---|---|
| 3D fields | Wind wake, two-source force potential, slope-driven terrain flow, imported 3D grids |
| GPU rendering | Instanced vector glyphs, shader-displaced relief, scalar filmstrips, rain/vegetation layers |
| GPU compute | Time-driven shader advection for moving arrows and 4K–31K tracers; float `RGBA32F`/3D texture support is detected and reported |
| Analysis | Mean/peak speed, kinetic energy, histogram, coherence, time series, scalar slices, 3D probe |
| Data | CSV/JSON drag-and-drop, flexible column aliases, Float32 3D texture sampling, JSON snapshot export |
| Camera | Orbit/pan/zoom, iso/top/section presets, click-to-probe, fullscreen viewport |
| UI | Dark glass panels, lime/teal accents, responsive layout, keyboard shortcuts |

## Data import

CSV needs a regular grid with `x,y,z,u,v,w` and an optional `scalar` column. Aliases (`vx/vy/vz`, `velocity_x`, etc.) and comma/semicolon/tab separators are accepted. JSON supports `dimensions:[nx,ny,nz]` plus separate `u/v/w` arrays, row vectors, or a flat `data` array. A generated sample is available from **Load sample CSV** and at `public/sample-wind-field.csv`.

See [`docs/VectorFieldStudio.md`](docs/VectorFieldStudio.md) for the full data contract and architecture.

## Verification

```bash
npm test
npm run build
```

Actual rendered evidence, interaction captures, and the browser validation script are under [`Exhibits/VectorFieldStudio/`](Exhibits/VectorFieldStudio/). The visual harness uses optional headless-browser packages and is not part of the runtime dependency set:

```bash
npm install --no-save @sparticuz/chromium puppeteer-core
npm run validate:visual
```

The default validation profile is `?quality=low&fps=5` so software WebGL can complete surface captures; the app defaults to balanced quality and uncapped frame pacing in a normal browser. The harness also saves two isolated viewport frames (`06-arrow-motion-a.png`, `07-arrow-motion-b.png`) and compares animated-arrow pixel change against the fixed-arrow control to prove realtime glyph motion.
