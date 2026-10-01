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
CL=Frontier/ExternalPackages/clipper2/CPP/Clipper2Lib        # python3 Frontier/Tools/Bootstrap.py --package clipper2
g++ -std=c++20 -O2 -w -I $CL/include -o _AgentScratch/build/tyre/TreadMeshProof \
    Exhibits/Workbench/Tyre/TreadMeshProof.cpp \
    Frontier/Engine/ContentInterchange/Tyre/TyreMeshStructure.cpp \
    Frontier/Engine/ContentInterchange/Tyre/TreadRegionSolver.cpp \
    $CL/src/clipper.engine.cpp $CL/src/clipper.offset.cpp $CL/src/clipper.rectclip.cpp
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

### ③ The boolean stage must partition the tread

The floor pieces have to tile the tread exactly once — every square millimetre covered, none covered
twice — because the mesh stage reads that as licence to emit each piece independently and still expect a
closed surface. On the same off-road preset, 7 layers in and 3 floors out at 0, 6 and 15 mm:

| Measure            | Result        | Bound        |
|--------------------|---------------|--------------|
| floor pieces       | 3             | ≥ 2          |
| contours           | 609           | —            |
| domain area        | 756 320.3 mm² | —            |
| gap                | −0.0003 mm²   | 127.86 mm²   |
| spill              | 0.0000 mm²    | 127.86 mm²   |
| overlap            | 2.4900 mm²    | 127.86 mm²   |

⚠️ Gaps and overlaps are measured as **set operations against the domain**, never by comparing a sum of
piece areas against it. Two pieces meeting along a shared boundary produce sliver artifacts one integer
unit wide whose signed areas are tiny and of either sign — one measured −0.157 mm² during development,
which is how the artifact announced itself. A sum double-counts those, and a sum is also blind to a gap
that happens to equal an overlap elsewhere. The set difference is blind to neither.

💡 The tolerance is derived rather than chosen. Two pieces meeting along a boundary can disagree by one
integer unit of the boolean stage, so the worst sliver area the arrangement can produce is its total
internal contour length — 127 857 mm here — times that one-unit width. Measured overlap is 2% of that
bound. The length is summed over the **pieces**, not over their union: slivers form where two pieces
meet, and the union has no such boundary, its contour being merely the rim of the domain.

💡 The boolean stage runs at 1000 integer units per millimetre, so one unit is one micrometre —
deliberately the same figure as `TyreMeshStructure::WeldTolerance`. Any sliver the arithmetic can produce
is then narrower than a weld and collapses to nothing when the mesh stage welds it. The two tolerances
are one choice, not two. Raising the resolution from the prototype's 0.01 mm to 0.001 mm dropped measured
overlap from 24 mm² to 2.49, which is what confirmed the residue was resolution noise and not a real
double-covering.

## ④ The mesh stage — quad-dominant, and not yet closed

🚧 **This gate fails on purpose.** The tread builds, but it is not watertight, and the proof asserts the
real acceptance criterion rather than reporting numbers and passing.

| Measure              | Now     | Required |
|----------------------|---------|----------|
| floor quads          | 15 081  | —        |
| wall quads           | 15 840  | —        |
| floor triangles      | 48 798  | —        |
| quad fraction        | 38.8 %  | —        |
| T-junctions repaired | 7 612   | —        |
| boundary edges       | 17 143  | 1 206    |
| non-manifold         | 5 185   | 0        |

The structure is right and three parts of it are settled.

- **Groove walls are pure quads.** Extruding one outline edge gives exactly one quad, so the 15 840 wall
  faces needed no triangulation at all.
- **Only a piece's outer contours raise walls.** A hole in a piece is the outline of a deeper piece
  sitting inside it, and that deeper piece raises the same wall from its own outer contour. Extruding
  both gave one outline two walls and three faces on one edge.
- **Walls are extruded from grid-subdivided outlines.** The floors are produced by clipping against the
  grid, so their boundary already carries a vertex at every grid crossing; a wall from the raw contour
  spans those in one edge and leaves a T-junction at each. Fixing this alone moved wall quads from
  3 912 to 15 840 and boundary edges from 36 860 to 23 755.

### What is still open, and why

Boundary edges were classified by position rather than guessed at. Of 24 085 before the repair pass,
1 206 are the legitimate rim openings and **4 205 + 3 737 sit on the crown floor itself** — not on walls.
That is the quad grid's own T-junction: a whole-cell quad carries two vertices on a shared grid line
while the cut cell beside it carries three, because a groove outline crosses there.

`TyreMeshStructure::RepairJunctions` was written for exactly this and finds 7 612 of them, taking
boundary edges to 17 143. It is not sufficient, and the non-manifold count rising as it runs says the
repair is now fighting the cause rather than removing it.

💡 The cause is that **each cell is clipped independently**. Two cells sharing a grid line are two
separate boolean problems that happen to agree, which is the same mistake the browser prototype made one
level up — it triangulated each floor piece independently and relied on the pieces agreeing. The fix is
structural, not another repair: per floor piece, emit whole interior cells as quads, then take the
**entire remaining boundary band as one region** — the piece minus the union of those whole cells — and
triangulate it once. One triangulation cannot disagree with itself, and the band's inner boundary is by
construction the outline of the quad cells it meets.
