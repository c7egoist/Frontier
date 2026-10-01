# Tread mesh audit

`TreadMeshAudit.mjs` runs the procedural tread builder out of `References/TyreGenerator.html` with no
browser, no canvas and no WebGL, and reports whether the mesh it produces is closed.

```bash
npm i clipper-lib earcut
node Exhibits/Workbench/Tyre/TreadMeshAudit.mjs
```

It extracts the geometry functions from the generator itself rather than keeping a copy, so it cannot
drift away from the file it is auditing. Vertices are welded by position to 0.1 um first, so float noise
is never reported as a crack.

| Field | Meaning |
|---|---|
| `boundary` | Edges used by exactly one triangle. |
| `shoulderRim` | Of those, the ones on the tread band's two open rims, where the sidewall attaches. Expected. |
| `interiorCracks` | The rest — holes you can see through. |
| `nonManifold` | Edges used by more than two triangles. |
| `degenerate` | Zero-area triangles. |

## Where it stands

Measured on the off-road preset, the busiest tread the generator ships (56 sipes, three zig-zag
circumferential grooves, three lateral sets):

| | before | after |
|---|---|---|
| interior cracks | 80,000 | 13,167 |
| non-manifold edges | 686 | 106 |
| triangles | 291,193 | 67,665 |

Two defects were fixed. Groove wall heights came from probing the pattern's **raster** 0.9 mm off the
edge; a sipe is 1.5 mm wide, so that probe crossed the groove and read the rubber on the far side,
building the wall to a height taken from the wrong region. It now asks the boolean result which floor
piece owns the point, which is exact. Separately, each Earcut triangle was refined barycentrically by a
step count derived from its own longest edge, so two polygons sharing a boundary split it a different
number of times and left T-junctions along every shared edge; `splitWide` made adjacent strips of one
polygon disagree routinely. Boundary density already comes from `subdivideRing`, which both sides run
identically, so the refinement is gone.

The remaining 13,167 are **not** a bug with a single cause. They are spread across the whole tread at
groove boundaries, and they are structural: the builder emits each floor piece and each wall as an
independent triangle soup and relies on separately triangulated polygons happening to agree on their
shared vertices. Closing them needs a shared vertex pool with an explicit index buffer, which is a change
to how the builder is organised rather than another patch. That belongs in the C++ port, with this audit
as its gate.
