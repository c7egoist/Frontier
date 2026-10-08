# Frontier CAD Editor (Experimental)

A browser CAD editor for modelling cars. Vite + React + three.js for the UI and viewport, and
[replicad](https://replicad.xyz) (OpenCascade WASM) as the modelling kernel. Layout follows the
Experimental editor UI: outliner on the left, pill toolbar over the viewport, inspector on the right.

## Run

```sh
npm install
npm run dev      # http://localhost:5180
npm run build    # production bundle in dist/
npm test         # kernel, spline joint audit and document integration tests (Node + OpenCascade)
```

## What it does

- **Modelling kernel:** primitives (box, cylinder, sphere, ellipsoid), extrude, revolve, sweep, loft
  (all eight types: smooth, ruled, G1 start / end / both, apex start / end / both), fillet, chamfer,
  **bevel** (asymmetric chamfer with distance and setback), push / pull face, boolean union / subtract /
  intersect, mirror.
- **Curves:** line, polyline, three-point arc, tangent arc, circle, ellipse, helix, Bezier, B-spline fit,
  and a **continuity-controlled spline** where each interior knot is G0, G1 or G2 with a tangent scale.
  The joint audit test measures every joint from the emitted geometry.
- **Surfaces:** planar patch, fill patch, extrude, revolve, loft and sweep surfaces.
- **Interaction (Plasticity / SolidArc chart):** 1 control points, 2 edges, 3 faces, 4 solids; G / R / S
  move, rotate, scale with gizmo; Shift adds to selection, Ctrl toggles; double-click a solid for faces;
  Shift+A add menu; F or F3 command search; `?` shortcut sheet; undo / redo; Numpad views; Space fits the
  selection. Full list in the in-app `?` overlay and in `src/commands.js`.
- **Edit model:** every edit is an undoable step. Realtime re-evaluates on each change; Edit mode
  defers evaluation until you press Evaluate. Only the nodes downstream of an edit are rebuilt.
- **Export:** binary STL of visible solids.

## Layout

| Path | Purpose |
| --- | --- |
| `src/kernel/evaluate.js` | Document graph evaluation on replicad, with caching by node key |
| `src/kernel/worker.js`, `client.js` | Kernel worker (loads the WASM) and a coalescing main-thread client |
| `src/geometry/spline.js` | G0 / G1 / G2 spline solver, Bezier emission and joint analysis |
| `src/model/nodeTypes.js` | Node registry: fields, defaults, input rules |
| `src/actions.js` | Document mutations, all routed through `commit()` for undo |
| `src/commands.js` | Command registry shared by hotkeys, palette and help |
| `src/viewport/scene.js` | three.js scene, picking, hover, gizmo, control-point handles |
| `src/panels/` | Outliner, Inspector, Viewport and overlays (palette, help, toast) |
| `tests/` | `kernel.test.mjs`, `spline.test.mjs`, `actions.test.mjs` |

## Known limits

- Bevel is implemented as a chamfer with two distances, not as a separate replicad primitive.
- Interactive behaviour (gizmo drags, hover and picking on screen) has not been checked in a browser
  in this environment. Server-side rendering of the whole UI and the kernel tests do pass.
- Sample car pod (Add sample) is a rough placeholder built from a smooth loft and four wheel cylinders.
