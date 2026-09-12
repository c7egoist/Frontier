# Frontier CAD panel

This is the HTML prototype for the Parametric Sketcher editor. The panel UI remains the floating Outliner / Viewport / Inspector layout, while the previous prototype kernel has been removed from the active solid path.

## Run

```sh
python3 -m http.server 8080
# open http://localhost:8080/Editor/EditorTools/ParametricSketcher/Panel/index.html?demo
```

The page is intentionally dependency-free and renders through Canvas 2D. `cad-kernel.js` is loaded before the panel script and is also usable from Node for regression checks:

```sh
node Verification/kernel-smoke.js
```

## Kernel boundary

`cad-kernel.js` is a feature-based analytic B-rep prototype:

- profile control segments become stable side faces; line, arc, circle and hole loops are retained;
- caps own oriented loops and are triangulated only for display;
- edges have stable keys (`top:0`, `side:0:1`, `bot:2`) and tangent status;
- primitive boxes and cylinders use the same B-rep path as extrusions;
- a selected cap edge creates only its own fillet/chamfer band; neighbours are not included implicitly;
- cap push and inset are replayed as feature operations, while planar side-face moves update the supporting profile edge;
- the mesh is a presentation cache, never the modelling source of truth;
- 2-D union, subtract, intersection, and XOR split profile edges at intersections and rebuild oriented outer/hole loops before extrusion;
- 2-D mirror uses a real axis transform, preserves holes/boolean regions, and stores a live link to the source curve.

Select closed sketch profiles and open **Construct → 2D Boolean** (or use the Multiple figures **Boolean union** action). Select sketch curves and press **M** for the interactive mirror tool; the inspector action uses the same sketch-space mirror logic. Command-line examples: `boolean subtract Circle01 Circle02`, `mirror Line01 V`.

The existing sketch tools, constraints, dimensions, pattern tools, history, document save/open, and viewport interactions remain in `index.html`. No C++ source is changed by this prototype.
