# Frontier

A robust **road editor** for the game engine, as a static web app (plain ES
modules, no build step). Open it directly from the branch:

> **https://raw.githack.com/c7egoist/Frontier/arena/abea0a0f-frontier/index.html**

or serve the repo root locally:

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

## What it does

- **Split view** — one canvas, two synchronized cameras: a 2D orthographic
  **plan** on the left and a 3D **perspective orbit** on the right, with a
  draggable divider between them. Pan/zoom independently in each half.
- **Watertight junctions** — intersections are generated from shared
  approach-frame boundaries (the topology approach of
  `arena/01a10cf3-frontier`): every N-way joint is one merged mesh with
  per-corner circular fillets, curb/pavement as pinned offsets of the fillet,
  a Coons interior and tub walls — no cracks, no z-fighting.
- **One handle per joint** — select a junction and drag its *single* gizmo
  handle: every anchor node of the joint (all connected road ends) moves
  together and the geometry regenerates cleanly.
- **Slate translate gizmo** — axis / plane / view-plane drags (figures ported
  from Slate's `GizmoFigures.cpp`), Ctrl = 0.25 m snap, for nodes, whole
  splines and junctions. Bezier handles get their own drag boxes.
- **Paving patterns** — procedural decals on the pavement: concrete slabs,
  pavers (running bond), gravel stipple.
- **Drainage** — gutter channel in the cross-section, inlet grates along the
  gutter, crossfall, and bridge scuppers.
- **Guardrails** — W-beam rail on blockouts and posts with turned-down
  terminals, continued around junction corner fillets.
- **Bridges** — beam bridges (I-girders, diaphragms, piers, footings,
  abutments, parapets that ramp down at landings) and arch bridges (parabolic
  ribs + spandrels). Road↔bridge landings link cleanly (rails hand over to
  the parapet).
- **Markings** — center/edge/lane lines, crosswalks and stop bars on
  junction approaches.
- **Interchanges** — insert a grade-separated **diamond interchange** from the
  Spline menu (or load the demo): 8 clean T-junctions, no broken exchange
  geometry. A harbour demo (shore crossing + lake bridge + causeway landing)
  is included too.
- **Export** — the built network exports as a world-space **OBJ** for the
  game engine; projects save/load as JSON and autosave to localStorage.

## Using the editor

| Input | Action |
| --- | --- |
| `V` / `P` / `H` | select / draw / pan mode |
| left-drag (select) | orbit the 3D view · drag a node |
| left-drag (draw) | extend the road — click ground to add points, click a road to join it, click the other endpoint to close a loop |
| right-drag | pan (any mode) |
| wheel | zoom the view under the cursor |
| gizmo drag | move node / spline / junction — **one handle per joint** |
| release a drag | snaps onto nearby nodes/curves for exact joins |
| `F` / `1` / `2` / `3` | frame all / iso / top / front |
| `G` | toggle grid |
| `Del` / `Esc` | delete selection / deselect |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo |
| `Ctrl+S` | save to localStorage |

The chrome (menu bar, trapezoid tab strip, outliner, black-pill inspector
sliders, status bar) follows Slate's `EditorStyleSpecification`.

## Project layout

```
index.html            app shell (inline CSS link only)
style.css             Slate dev-editor theme
src/
  math.js             curves, patch grids, road↔world mapping
  model.js            project model, presets, demo scenes, migration
  topology.js         spline sampling → network topology (splits, junctions)
  junction.js         merged N-way junction geometry from approach frames
  frames.js           station frames + cross-section lines (gutter support)
  roadSpan.js         at-grade road span builder
  bridge.js           beam + arch bridge builders
  details.js          guardrails, paving patterns, drainage grates
  markings.js         road marking decals
  network.js          buildNetwork(project) orchestrator
  gizmoMath.js        pure gizmo pointer arithmetic
  gizmo.js            Slate translate gizmo (three.js)
  editing.js          snap targets (nodes win over curves)
  exportObj.js        OBJ export + download helper
  viewport.js         split-view renderer, cameras, picking, overlays
  editor.js           app state, modes, history, interactions
  ui.js               Slate chrome DOM
  main.js             boot
vendor/three.module.min.js   three@0.160.0 (vendored — no CDN dependency)
tests/
  smoke.mjs           geometry pipeline tests (11 groups)
  editor-smoke.mjs    headless editor interaction tests (75 checks)
  ui-smoke.mjs        headless UI tests (44 checks)
  gizmo-smoke.mjs     headless gizmo tests (24 checks)
  stubdom.mjs         minimal DOM stubs for the headless tests
```

## Tests

```sh
node tests/smoke.mjs        # geometry pipeline
node tests/editor-smoke.mjs # editor interactions (draw, drags, junction handle, undo)
node tests/ui-smoke.mjs     # UI chrome
node tests/gizmo-smoke.mjs  # gizmo picking + drags
```

All suites run headlessly in node — no browser required.
