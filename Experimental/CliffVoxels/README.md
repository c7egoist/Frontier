# CliffVoxels — voxel SDF cliff generator (WIP scaffold)

True-3D voxel cliffs with real overhangs (90°+, `\ /` profiles), built for
sandstone escarpments, canyons, spires and coastal cliffs with Gaea-style
rock detail. Not a heightfield: the rock is a signed-distance field,
meshed with surface nets, shaded with satmaps (slope / strata / cavity /
flow masks) plus canvas grain detail.

## Provenance (reused UI shell)

Workspace shell, theme CSS and icon vocabulary copied from
`SultanAladin/Frontier-@arena/5c85f535-frontier`, `Experimental/CliffSequence`
(plus `Fluid/src/ThemeSpecification.css`); `three.module.min.js` and
`OrbitControls.js` vendored from its `Experimental/Ocean/lib/`
(three.js, MIT licence, © three.js authors). The polygon solvers there are
NOT reused — this tool replaces them with a voxel pipeline.

## Pipeline stages

1. **Landform** — SDF base mass: fault-block, headland, canyon, spire,
   coastal. Domain-warped ridged fBm relief on all sides.
2. **Strata** — Gaea Stacks-style sedimentary bands: thickness, hardness
   per band (soft bands retreat), dip angle.
3. **Joints** — columnar Voronoi jointing (dolerite) or block joints;
   deterministic carve, no full-face symmetry.
4. **Talus** — thermal-erosion-style repose deposits at the cliff foot +
   debris size, gully carve on the crown.
5. **Mesh & Maps** — surface-nets mesh, per-vertex satmaps, grain detail;
   OBJ + PLY (vertex colors) + recipe JSON export.

Same seeds reproduce the same cliff. Every exported face is a triangle.

## Run it (static, no build)

```sh
cd Experimental/CliffVoxels
python3 -m http.server 5174
# open http://127.0.0.1:5174/
```

Status: shell scaffold only — pipeline modules land next.
