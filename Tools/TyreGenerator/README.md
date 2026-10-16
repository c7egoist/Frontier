# Tyre Generator — pure-quad topology and 2D tread editor

`TyreGenerator.html` is the Slate tyre tool with two additions:

1. **Pure-quad tread mesh (default, "Mesh mode: quad").** `TyreTopology.js` remeshes the tyre into one closed manifold of
   quads: tread, shoulders, sidewalls and bead cap. No heightmap and no high-poly input are used. The tread is built from
   the pattern's groove regions (Clipper) and triangulated with a constrained Delaunay (`vendor/cdt2d.esm.js`). Every
   triangle is then split into three quads. Shoulders and sidewalls reuse the same boundary samples, so all edges are
   shared. Tread uses UV set 0 and sidewalls use UV set 1 (`texture.channel = 1`).
   The panel's **Quad budget** sets the target face count. The contour spacing adapts to fit it (2–40 mm).
   Each rebuild shows a topology report: open edges, non-manifold edges, inconsistent edges, χ and timing.
   **Quad OBJ** exports the quads (mm, `usemtl tread` / `sidewall`).
2. **2D tread editor (“2D tread editor…” button).** Draw on the unrolled tread (u along the circumference, v across):
   Groove/sipe (polyline, width), Block (polygon), Dimple (circle), Select/move, Erase. Also mirror across the centre line,
   grid snap (Shift disables it), zoom and pan, undo/redo and per-shape depth. Shapes are stored in one `shape` layer
   (tag `drawn`) and feed both the texture maps (`renderPattern`) and the quad remesh.

## Running

The page is an ES module, so serve the folder rather than opening the file directly:

    python3 -m http.server 8080   # then open http://localhost:8080/TyreGenerator.html

The page loads three.js and clipper from unpkg, so it needs internet access.

## Tests (Node, no browser)

    npm install
    npm test            # quad remesh, shapes, editor geometry, render check (~45 s)
    ALL=1 npm test      # also Frostbite Sipe (about 20 s per build)

`tests/explore.mjs` builds presets from the command line and prints the audit and counts.

## Measured results (default budget 120k quads, Node)

All 14 presets are watertight, manifold, have χ = 0 and are all quads (no triangles, no holes).

| Preset | Quads | Contour (mm) | Time |
|---|---|---|---|
| GZero | 35 k | 2 | 1.3 s |
| Comet Drag | 46 k | 2 | 1.8 s |
| Kestrel TC | 95 k | 5 | 1.7 s |
| Monsoon Cut | 112 k | 40 | 2.4 s |
| Ravager Mud | 129 k | 2.5 | 2.5 s |
| Talon Trail | 125 k | 12 | 1.8 s |
| Apex Shadow | 144 k | 30 | 2.3 s |
| Vortex R1 | 144 k | 40 | 2.6 s |
| Grizzly Magnum | 153 k | 20 | 2.4 s |
| Dimple Rave | 154 k | 40 | 7.7 s |
| Urban Pulse | 261 k | 40 | 4.9 s |
| Frostbite Sipe | 470 k | 40 | ~20 s |

Rough figures from the Node test run. Browser build times will differ.

## Known limitations

- **Dense patterns.** Frostbite Sipe has 800 zig-zag sipe lines, which is more geometry than the budget can represent at
  coarse spacing. It gives about 470k quads and a build of about 20 s. Lower the sipe count or raise the contour spacing
  to reduce it. The budget is a target, not a hard cap, for these presets.
- **Bead cap fold.** The bead cap sits inside the rim. On the left wall the UV is mirrored (so lettering reads correctly),
  and the cap column where left and right meet folds in UV. That fold is hidden by the rim. Removing it would mean
  duplicating topology, which would break the welded manifold.
- **Poly mode** (the older polygon tread) does not draw 2D-editor shapes. Use quad mode or heightmap mode for those.
- **Visual check.** The page's UI and WebGL view have been checked by syntax and by the Node tests, not in a browser.
- **Where it lands.** These files live in `Tools/TyreGenerator/` of the Frontier session repository. The Slate
  `References/TyreGenerator.html` is unchanged.
