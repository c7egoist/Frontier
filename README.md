# Frontier — Road & Bridge Studio

A spline-based road network + bridge generator. Draw bezier splines, get clean
carriageways with pavements, curbs, guardrails and lane markings, auto N-way
junction hubs where splines meet, and beam or arch bridges with piers,
abutments and parapets — all editable live in a Slate-editor-styled studio.

![status](https://img.shields.io/badge/status-working%20app-green)

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
  superstructure sides/bottom, W-beam guardrails with posts, dashed centre /
  edge / lane markings, dead-end caps.
- **Junctions** — automatic N-way hubs (Coons-patch topology ported from
  Roadnet V3) with corner fillets, corner pavement, curb drops and rails.
  Near-straight 2-arm joins connect directly without a hub.
- **Bridges** — per-spline toggle:
  - *Beam*: deck + fascia girders, single / bent / wall piers with crossheads,
    bearings and footings, abutments with wing walls.
  - *Arch*: parabolic ribs following the alignment, spandrel columns, thrust
    blocks (auto-falls back to beam when the span/height doesn't suit an arch).
- **Scene** — ground + water planes, grid, adjustable draw height.
- **Project IO** — browser-local save (Ctrl+S), JSON export/import, and
  **Wavefront OBJ export** of every generated mesh.
- **Theme** — graphite 3-pane studio (outliner / viewport / inspector) in the
  spirit of Slate's `Frontier/Experimental/FrontierEditor`.

## Roadnet lineage (V2 vs V3 — which is latest?)

`SultanAladin/Roadnet` contains:

| Location | What it is |
|---|---|
| repo root (`src/`) | **V3 — the latest.** 842-line editor + 935-line geometry + `JunctionRenderer`. N-way junctions, sloped mouths, corner pavement. |
| `RoadNetV2-main/`, `out_dir/`, `temp_dir/` | Identical copies of **V2** (776-line editor, no junction renderer). |

This studio ports the **V3 road/junction topology** and fixes / extends it:

1. **Topology presets never applied (V3 bug)** — the dropdown wrote lowercase
   values (`"two lane road"`) while the width checks compared title case
   (`'2 Lane Road'`), so *every* road built 10 m wide. Fixed with per-spline
   presets that actually drive width + lanes.
2. **Pavement/curbs inverting on curves (V3 bug)** — offsets were applied
   blindly, so when `halfWidth + pavement` exceeded the local curve radius the
   inner edge looped back on itself. Fixed with curvature-adaptive resampling
   plus per-station offset clamping (parallel-curve inversion guard), battered
   curb faces and pavement crossfall.
3. **Span fold-back at junctions (V3 bug)** — spans pinned to mouth centres
   even when the mouth radius exceeded the pair length, doubling the road back
   over itself. Fixed with hub-aware trimming + conditional mouth pinning.
4. **Missing pieces added** — guardrail posts on spans (V3 only had them on
   junction corners), lane markings, dead-end caps, height-aware node clustering
   (overpasses no longer merge with roads below), and the whole bridge
   generator (beam + arch).

## Project layout

```
src/
  lib/
    vec.ts            vector math (world <-> road space, beziers, Coons)
    model.ts          project model, presets, demo scene, migration
    roadGeometry.ts   curvature-safe spans + N-way junction hubs
    bridgeGeometry.ts beam / arch spans, piers, abutments, parapets
    network.ts        clustering -> junctions -> trimmed spans
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
