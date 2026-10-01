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

## Related references

- `References/PaintingSurface/` — the surface-painting prototype, vendored from `SultanAladin/Frontier`
  at `4a77bfd` (`Documentation/Prototypes/PaintingSurface`). No written plan for texture painting exists
  in either upstream repository; this prototype is the design record.
- `References/GeometryWorkspaceAndMaterialProcessingPlan.md` — from `SultanAladin/Slate`. Defines the
  contracts a GPU paint evaluator must satisfy, including the `PaintedTiles` layer source kind.
- `Plans/Ongoing/ProceduralTyreAndSurfacePainting.md` — the four-phase plan these feed into.

## TreadMeshProof — the Phase 1 gate

The C++ gate for the ported builder, against `Engine/ContentInterchange/Tyre`. Build and run:

```
g++ -std=c++20 -O2 -w -o _AgentScratch/build/tyre/TreadMeshProof \
    Exhibits/Workbench/Tyre/TreadMeshProof.cpp \
    Frontier/Engine/ContentInterchange/Tyre/TyreMeshStructure.cpp
./_AgentScratch/build/tyre/TreadMeshProof
```

It sweeps the moulded cross-section on the off-road preset — 285/70 R17, outer radius 415.40 mm — at
360 × 64 and audits the result.

| Measure              | Result | Expected | Why that number                                        |
|----------------------|--------|----------|---------------------------------------------------------|
| positions            | 23 400 | 23 400   | 360 × 65, so the wrap column welded onto column 0        |
| triangles            | 46 080 | 46 080   | 360 × 64 quads                                           |
| non-manifold edges   | 0      | 0        | —                                                        |
| degenerate           | 0      | 0        | —                                                        |
| duplicate faces      | 0      | 0        | —                                                        |
| boundary edges       | 720    | 720      | 2 × 360, exactly the two rim openings and nothing else   |

⚠️ The wrap is closed by **welding**, not by taking the ring index modulo the step count. θ = 2π and
θ = 0 produce cosines differing in the last bits, and the mesh is watertight only if the weld recognises
them as one point. Index arithmetic would close the seam without testing anything.

The proof carries a negative control for the same reason. Displacing the wrap column by ten weld
tolerances opens exactly 128 edges — 64 × 2, one per quad on each of the two triangles that used to
share the seam. A ledger that always answered "clean" would pass the positive control and prove nothing.
