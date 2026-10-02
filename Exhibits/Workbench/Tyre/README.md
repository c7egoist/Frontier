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

## ④ continued — the floors close, one contour orientation at a time

The band rewrite landed, and with it two defects were found and fixed. Neither was the one the previous
section predicted, and the prediction itself was only half right.

### The triangulator

Clipper2's `Triangulate` is beta. Handed a whole row band it exhausted three gigabytes and the process was
killed; scoped down to one block it was still killed. It was replaced with `earcut`, with nesting taken from
a Clipper `PolyTree64` so each outer loop is triangulated with the holes that actually belong to it. Pairing
loops by orientation alone is not enough — a negative area says "this is a hole", not "this is a hole in
that one", and a block band routinely holds several islands.

### The defect that mattered: the same number computed twice

The isolation run is the whole story.

| case                                            | open edges | excess over the rim |
|-------------------------------------------------|-----------:|--------------------:|
| no pattern at all                                |        870 |                   0 |
| one circumferential groove, edges on grid lines  |        870 |                   0 |
| one circumferential groove, edges mid-cell       |      1 686 |                 816 |
| one circumferential groove, edges 0.04 off a line|      2 162 |               1 292 |

With no pattern the mesh is already exactly closed: 870 open edges is 2 × 435 columns, the two rim openings,
with no non-manifold and no degenerate faces. The quad grid was never the problem. Cracks appeared only where
a groove forced a band — and vanished when the groove happened to land on grid lines.

The repair pass reported **zero** T-junctions against those cracks, which ruled out the predicted cause.
Dumping the open edges showed every one of them at lateral −3.0000 exactly, in two rings, one on the crown
floor and one on the groove floor — and nothing at all at +3.0000. One side of a groove closed, the other
did not.

The cell grid puts a column line at `Unit(Circumference * Column / Columns)`. The subdivision pass put it at
`llround(Ax + Dx * Fraction)`. Those are the same real number reached by different arithmetic, so they
disagree in the last bit, and `llround` turns that into one integer — one micrometre, which is exactly
`WeldTolerance`, so the two sides fail to weld. Because the error depends on `Ax` and `Dx`, an edge walked in
`+x` rounded differently from one walked in `−x`, which is why a rectangle closed along one side and opened
along the other.

A crossing now carries the grid coordinate it lies on, snapped with the identical expression the cell grid
uses, and only the other coordinate is interpolated. All three cases above go to 870 — the rim and nothing
else.

### What is still open

The full Grizzly Magnum pattern is better but not closed: raw open edges 24 268 → 22 348. Grading by contour
orientation says where the rest lives.

| contour orientation                | excess open edges |
|------------------------------------|------------------:|
| circumferential, parallel to columns |                 0 |
| lateral, straight across             |               252 |
| lateral, diagonal                    |             1 289 |

Contours parallel to the column grid are exact. Contours that cross it are not, and diagonals are worst. The
cause is the same species as the one just fixed, one level up: where a diagonal contour crosses a grid line,
the floor gets that intersection from Clipper's exact integer arithmetic while the wall gets it from an
interpolation of the raw contour. Snapping fixed the axis-aligned case because there the shared coordinate
*is* a grid coordinate; on a diagonal the shared coordinate is an intersection, and only one of the two
producers computes it exactly.

The fix is architectural and is the last one this stage needs: **a wall must be extruded from the floor's own
boundary, not recomputed from the raw contour.** The floor boundary is already the exact Clipper result, so
deriving the wall from it makes disagreement impossible rather than merely unlikely. The gate stays failing
until it is in.
