# SOLID ARC

A WebGPU-based parametric sketcher prototype for the browser.

## Current surface

- 2D drafting for lines, polylines, polygons, rectangles, circles, ellipses, slots, three-point arcs, continuous Bézier/Hermite curves, B-splines, NURBS, and Catmull–Rom splines.
- The toolbar provides hover and keyboard tooltips; selected geometry uses a bright neutral highlight and exposes its applicable construction guides, vertices, or circular control handles in 2D and 3D. Circles intentionally remain guide-free when selected.
- CAD curve tools include Bézier, cubic Hermite, B-spline, and NURBS; additional sketch tools include three-point arc, slot, and polygon. Curves use adaptive tessellation based on model length and current view scale, so long or zoomed-in curves stay smooth.
- Left-click adds points; right-click confirms every drawing. Rectangles and circles use click-drag sizing, while ellipses use the centre-and-corner workflow.
- Curves and polylines remain open for as many left-clicked points as needed, then finish as one continuous drawing with right-click.
- Construction planes with elevation, twist, and tilt.
- Closed rectangles, circles, ellipses, polygons, slots, and planes keep a consistent counter-clockwise winding order and render as semi-transparent filled faces with outlines.
- A real perspective 3D viewport rendered with WebGPU when available, with a WebGL fallback.
- 3D is the default view; 2D drafting remains available from the left pill toolbar.
- Draw directly onto the active construction plane in 3D using camera ray intersection.
- Smooth camera lag for orbit and zoom, with stable world-Z-up orbiting and Blender-style MMB navigation.
- Static HTML, CSS, and JavaScript: no build step and no server dependency.
- Code is split into `src/input.js`, `src/ui.js`, and `src/rendering.js` so snapping, inspector presentation, and GPU packet creation can grow independently.

## GitHub Pages

The site is intentionally self-contained. Publish the repository root with GitHub Pages, then open `index.html` at the Pages URL. All asset references are relative, so it works from a project subpath.

For local preview:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

The 3D status readout reports `WEBGPU` when the browser successfully initializes WebGPU and `WEBGL FALLBACK` when it does not.
