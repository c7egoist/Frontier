# Frontier Sketch — browser workbench

This replaces the former SolidArc panel prototype with a standalone, browser-native **2D sketching workbench**. Open `index.html` from a static web server; no build system or third-party runtime is required.

## What is implemented

- Analytical **line, circle, and arc** entities—not canvas paths or polygon meshes.
- Explicit, stable point IDs. Adjacent curves share an endpoint ID, which is the 2D topological model.
- Sketch tools: line/chained line, polyline, rectangle, circle, arc, selection, point editing, move, uniform scale, offset, trim, mirror, fillet, and chamfer.
- Driving horizontal, vertical, length, radius, equal, parallel, perpendicular, coincident, and fixed constraints (the UI exposes the appropriate safe subset).
- Deterministic undo/redo, local autosave, JSON import/export, and line/circle/arc DXF import/export.
- Canvas grid, coordinate readout, zoom, pan, snap-to-grid, and snap-to-vertex.

## Kernel design

`cad-kernel.js` owns the model and has no DOM or rendering dependency:

```text
SketchDocument
├── points[]        stable topological vertices: { id, x, y, fixed }
├── entities[]      analytical curves that reference point IDs
│   ├── line        { a, b }
│   ├── circle      { center, radius }
│   └── arc         { center, radius, startAngle, endAngle, clockwise }
└── constraints[]   driving analytical relations and dimensions
```

The canvas is a **consumer** of the model: it samples circles and arcs only while rendering. It is never saved as geometry and is never used as a modelling kernel.

A partial transform calls `detachSelection()` first. When a selected curve shares a vertex with an unselected curve, it receives a copied vertex before the transform. This prevents accidental deformation of unselected topology—a common failure mode in screen-polygon implementations.

## Run and verify

```sh
cd Editor/EditorTools/ParametricSketcher/Panel
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` in a browser. Automated kernel checks run from the repository root:

```sh
npm test
```

## Scope boundary

This deliverable deliberately starts at the requested 2D sketch foundation. No pretend 3D extrusion, face pushing, bevel, or chamfer mesh approximation is included. A later solid stage should consume closed sketch regions and build a real B-rep model with persistent vertex/edge/loop/face/shell/body topology; it must not promote Canvas triangles to the kernel.
