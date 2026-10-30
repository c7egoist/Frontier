# Frontier

## Tyre Quad Editor

`TyreQuadEditor.html` + `quad-core.mjs` — draw or import (SVG) tread shapes,
convert them to a genuine all-quad mesh (no heightmap displacement, no
triangulated tread), array it around the tyre with mirror/flip/rotate modes,
test deformation on the real quad vertices, and export true-quad OBJ.
See `TYRE_QUAD_EDITOR.md` for the pipeline, honest limitations, and validation.
Run the topology tests with `node tests/quadmesh.test.mjs`.
The upstream demo this replaces is kept at `References/TyreGenerator.original.html`.
