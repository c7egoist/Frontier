# RoadWorks Editor

A spline-based road network + bridge generator. Draw bezier splines, get clean
carriageways with pavements, curbs, guardrails and lane markings, auto N-way
junctions where splines meet, and beam or arch bridges with procedural
substructures — all editable live in a Slate-editor-styled studio.

![status](https://img.shields.io/badge/status-working%20app-green)

## Open

Live static build (no install) via raw.githack, served from this branch:

```
https://raw.githack.com/c7egoist/Frontier/arena/01a10cf3-frontier/dist/index.html
```

(`dist/` is committed on purpose with relative asset paths so this URL works.)

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build -> dist/
```

Headless checks (geometry + UI smoke tests):

```bash
npm test
```

## What it does

- **Spline editor** — draw / select / pan modes, bezier handles with gizmos,
  node snapping (shared nodes become junctions), closed loops, spline joining,
  whole-spline moves.
- **Roads** — carriageway + battered curbs + pavements with crossfall,
  superstructure sides/bottom, W-beam guardrails with embedded posts, dashed
  centre / edge / lane markings, dead-end caps.
- **Junctions** — automatic merged N-way junctions: each spline is split into
  runs at shared nodes, runs trim back by the corner radius, and the junction
  is generated *from the span end sections*, so every boundary curve is shared
  exactly — no gaps, no black seams. Near-straight 2-arm joins connect
  directly without a junction.
- **Bridges** — per-spline toggle, fully procedural matrix:
  - *Superstructure*: solid slab, I-girders (+ diaphragms) or box girder(s).
  - *Piers*: single column, multi-column bent, wall, hammerhead, portal frame.
  - *Foundations*: spread footings or elevated pile caps with round piles.
  - *Abutments*: full-height cantilever, stub, or spill-through (+ wing walls).
  - *Arch*: parabolic ribs following the alignment, spandrel columns, mass
    thrust blocks (auto-falls back to beam when the span/height doesn't suit).
- **Scene** — ground + water planes, grid, adjustable draw height.
- **Project IO** — browser-local save (Ctrl+S), JSON export/import, and
  **Wavefront OBJ export** of every generated mesh.
- **Theme** — graphite 3-pane studio (outliner / viewport / inspector) in the
  spirit of Slate's `Frontier/Experimental/FrontierEditor`.

## Topology notes

Road cross-sections use curvature-adaptive resampling plus per-station offset
clamping (parallel-curve inversion guard), so pavement/curbs never loop back
on tight curves. Junction topology follows the TransitArchitect approach
(GRIT `Plugins/TransitArchitect`): graph edges trimmed by node radius,
junction approach frames sorted by angle, tangent-arc fillets between
successive approaches, two Coons halves per corner — adapted here so span end
sections are shared verbatim with the junction.

## Project layout

```
src/
  lib/
    vec.ts            vector math (world <-> road space, beziers, Coons)
    model.ts          project model, presets, demo scene, migration
    roadGeometry.ts   curvature-safe spans + merged junctions
    bridgeGeometry.ts procedural super/substructure, beam + arch spans
    network.ts        clustering -> runs -> spans -> merged junctions
    exportObj.ts      Wavefront OBJ export
  components/
    Viewport.tsx      3D canvas, spline editing, HUD
    Outliner.tsx      scene tree (splines / junctions)
    Inspector.tsx     Slate-style card inspector
    PatchMesh.tsx     patch -> three.js mesh
    controls.tsx      sliders, toggles, segmented, selects
  App.tsx             state, draw/select logic, shortcuts, persistence
  app.css             graphite studio theme
scripts/
  geo-test.ts         headless generator tests (incl. curve + fold-back regressions)
  ui-test.tsx         SSR smoke tests for outliner + inspector
```

## Shortcuts

| Key | Action |
|---|---|
| V / P / H | Select / draw / pan mode |
| Click (draw) | Extend spline (snaps to nodes within 2 m) |
| Click node (draw) | Join / close loop / share node |
| Del | Delete selected node |
| G / F | Toggle grid / frame all |
| Shift+A | New-spline menu |
| Ctrl+S | Save to browser |
| Esc | Deselect / finish drawing |
