# Swept-line tread modelling

How a tyre tread gets built the way a modeller would build it: draw the pattern, trace one element with a tapered
line, array that line around the wheel, fit it to the carcass, and bridge each ring to the next. No booleans, no
repair pass, no holes.

Prototype: `References/TreadLineModelling.html` — open it, drag the nodes, watch the audit.

## 1. Why the previous approach failed

Phase 1 cut grooves out of a lathed slab with Clipper2 and extruded the resulting walls. The numbers it produced:

| Approach                   | Raw boundary edges | Non-manifold edges |
|----------------------------|--------------------|--------------------|
| Boolean / CSG, raw         | 22 348             | 1 785              |
| Boolean / CSG, after repair| 16 736             | 6 926              |
| Swept line (this method)   | **0**              | **0**              |

Repair made the non-manifold count four times worse, which is the usual sign that the problem is not the repair
but the premise. A boolean cut has to invent new vertices wherever the cutting contour crosses an existing edge,
and the crossing is decided numerically. Two grooves that pass within a fraction of a millimetre of each other
produce slivers, the sliver gets welded by the tolerance, and the weld leaves an edge shared by three faces. Every
hole and artifact on the tread traces back to that.

The swept line never cuts anything. It places vertices where it wants them and connects them in a fixed order, so
the connectivity is decided by a loop counter rather than by a floating-point comparison. Watertight by
construction, not by repair.

## 2. The five steps

### Step 1 — draw the 2-D pattern

The tread is divided into **lanes** running the full circumference, side by side across the width with no gap. A
lane is the circumferential band a single element family lives in: the two shoulder lanes, the two intermediate
lanes, the centre lane, in the five-rib passenger layout.

Each lane owns a `seam` pair — its inboard and outboard lateral limits, expressed as a fraction of the patterned
half width so a pattern survives a change of section width without being re-authored. Adjacent lanes **share** the
seam value exactly:

```js
for (let k = 0; k < LANES.length - 1; k++) {
  const mid = (LANES[k].seam[1] + LANES[k + 1].seam[0]) / 2;
  LANES[k].seam[1] = mid;
  LANES[k + 1].seam[0] = mid;
}
```

That one assignment is why the lane-to-lane bridge later seals to the last bit of a float rather than to a
tolerance. The two values are not *close*; they are the same number.

### Step 2 — trace the element with a tapered line

One element per lane, described as a **line**: an ordered list of nodes, each carrying four numbers.

| Field | Meaning                                                       |
|-------|---------------------------------------------------------------|
| `t`   | position along the pitch, 0 … 1                               |
| `y`   | lateral centre of the line at that point                      |
| `w`   | half width — **the taper**                                    |
| `h`   | height above the groove floor, 0 … 1                          |

The line *is* the quads. There is no separate profile curve and no extrusion distance; `w` and `h` at a given `t`
are the element's cross-section there. A rib is two nodes. A block row is four: rise, run, run, drop. A
directional vee is five, walking `y` outboard as `t` advances — that walk is the arrowhead. A lug is seven, with
`w` swelling in the middle and pinching at both ends.

Nodes interpolate with smoothstep rather than linearly, so a mould cutter following the line is
tangent-continuous. Linear interpolation creases the walls, and the crease shows up as a hard shading line on the
rendered block.

### Step 3 — array around the wheel

The pitch is repeated around the circumference. Real moulds vary the pitch length deliberately so the tyre does
not sing one note at one speed, so the prototype jitters it with two incommensurate sines and then normalises:

```js
const total = raw.reduce((a, b) => a + b, 0);
const out = [0];
for (let p = 0; p < raw.length; p++) out.push(out[p] + raw[p] / total);
```

Normalising against the total is what lets the sequence be irregular and still close exactly at 1.0. The last ring
wraps to the first with `(i + 1) % ringCount`, so there is no seam to weld.

### Step 4 — fit the tyre profile

Each ring is placed on the carcass. Lateral stays lateral; the radius comes from the moulded surface, and the
height lifts the point off the groove floor toward it:

```js
const lateral = point.y * treadHalf;
const base    = surfaceAt(lateral, dimensions);     // crown parabola, then shoulder arc
const radius  = base.r - depth * (1 - point.h) * base.w;
```

`surfaceAt` is the same `EvaluateTyreProfile` the engine uses: a crown parabola inboard of `treadHalf`, a shoulder
arc outboard of it, cut at 80° so the surface never turns parallel to the axis. It also returns a **contact
weight** `base.w`, which falls to zero over the shoulder. Multiplying the groove depth by that weight is what
fades the pattern out as it wraps over the shoulder, exactly as a real mould does — the blocks shallow out and
disappear instead of running off the edge of the tread.

### Step 5 — bridge

Two stitches, both plain quad strips:

- **ring → ring**, within a lane: ring `i` point `k` to ring `i+1` point `k+1`, wrapping the last ring to the
  first.
- **lane → lane**: lane `j`'s outboard seam column to lane `j+1`'s inboard seam column. Same lateral, same height,
  so the join is geometrically invisible — but it still has to be stitched, or the band is several surfaces rather
  than one.

Then the band is closed into a solid: a skirt down each lateral edge, and one inner face joining the two skirts.

A skirt on its own closes nothing — it only moves the open loop outwards. The tread band is a **sheet** with two
boundary loops by nature, and those loops are where it meets the sidewalls. Joining the two skirts with an inner
face at `outerRadius − depth − beltThickness` is what earns the right to assert zero boundary edges.

## 3. The constraint that makes it work

> Every cross-section must carry a **constant point count**, whatever the line samples to.

Two consecutive rings cannot be bridged with quads unless they agree on how many points they have. A varying count
is precisely what forces other approaches back to booleans — and it is the single thing to get right when porting
this to C++.

The prototype uses eight, `RING = 8`:

| Index | Point                                        |
|-------|----------------------------------------------|
| 0     | inboard seam, at the groove floor            |
| 1     | foot of the inboard wall                     |
| 2     | top of the inboard wall                      |
| 3     | crown of the element                         |
| 4     | crown of the element                         |
| 5     | top of the outboard wall                     |
| 6     | foot of the outboard wall                    |
| 7     | outboard seam, at the groove floor           |

Where the element is absent — the gap between two blocks — the count does not drop. Points 1 … 6 collapse toward
the centre and `h` goes to zero, so the ring degenerates to a flat strip of groove floor while keeping all eight
points. That is how a lateral groove is made: not by removing geometry, but by flattening it.

Two consequences follow, and both are deliberate:

- **Taper to a minimum, never to zero.** `w` is clamped to `0.012` of the patterned half width. A true zero
  produces coincident vertices, which are degenerate triangles, which are the same class of defect the booleans
  were producing.
- **Degenerate quads exist in the groove floors.** They are zero-area, not zero-point, so the connectivity stays
  manifold. They cost memory and nothing else, and they can be welded at export if the vertex count matters.

## 4. The audit

Every edge in a closed manifold is shared by exactly two triangles. Count them:

```js
const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
// … tally every triangle's three edges, then:
// uses === 1 → boundary (a hole)
// uses  > 2 → non-manifold (a fin, or a weld that merged two surfaces)
```

Both counts must be zero with capping on. Current state of the prototype:

| Pattern      | Lanes | Rings | Vertices | Quads  | Boundary | Non-manifold |
|--------------|-------|-------|----------|--------|----------|--------------|
| Five rib     | 5     | 736   | 32 384   | 32 384 | 0        | 0            |
| Block row    | 5     | 736   | 32 384   | 32 384 | 0        | 0            |
| Directional  | 5     | 736   | 32 384   | 32 384 | 0        | 0            |
| Lugged       | 4     | 736   | 26 496   | 26 496 | 0        | 0            |
| Asymmetric   | 5     | 736   | 32 384   | 32 384 | 0        | 0            |
| Winter       | 5     | 736   | 32 384   | 32 384 | 0        | 0            |

With capping off the boundary count is exactly `ringCount × 2` — the two lateral loops, and nothing else. That is
the more useful gate of the two, because it says the open edges are *where they are supposed to be* rather than
merely that there are none.

## 5. Vocabulary

Names used in the code, matching the trade rather than the renderer:

- **Rib** — a continuous circumferential band, uninterrupted around the tyre.
- **Block** — a freestanding element bounded by grooves on all sides. **Lug** is the oversized off-road kind.
- **Circumferential groove** — the deep ones running round the tyre; they drain the contact patch and they are
  what tread depth is measured in.
- **Lateral groove** — across the tread. A **lateral notch** reaches only one groove instead of two.
- **Sipe** — a thin slit subdividing a block for biting edges. Shallower than a groove; in the node list it is an
  `h` dip that does not reach zero.
- **Tie bar** — a raised link across a lateral groove that stops the block squirming.
- **Shoulder** — where the tread edge merges into the sidewall. The contact weight fades here.
- **Void ratio** — groove and sipe area over total area. Sea-land ratio, informally.
- **Pitch sequence** — the deliberately unequal pitch lengths of step 3.

## 6. Porting to C++

The prototype maps onto the existing types with no structural change:

| Prototype          | Engine                                                                  |
|--------------------|-------------------------------------------------------------------------|
| `LANES`            | `TreadPatternSpecification` — add a lane list carrying seams and nodes   |
| `node{t,y,w,h}`    | a new `TreadLineNode` in `TreadSpecification.h`                         |
| `sampleLane`       | `TreadLineSampler`                                                      |
| `laneSection`      | `TreadLineSection`, returning a fixed `TreadRingPointCount` array        |
| `pitchOffsets`     | already present as the pitch sequence in `TreadPatternSpecification`     |
| `surfaceAt`        | `EvaluateTyreProfile` in `TyreProfileSpecification.h` — unchanged        |
| `buildTread`       | replaces the body of `TreadMeshSolver`                                   |
| `audit`            | the existing manifold gate in `Exhibits/Workbench/Tyre/TreadMeshProof`   |

`TreadRegionSolver` and Clipper2 stay, but their job shrinks: they solve the **2-D pattern** for the raster and
the preview, and no longer generate the solid. That is work they are good at. Generating a watertight solid from a
clipped polygon soup is work nothing is good at.

Order of work:

1. `TreadLineNode` and the lane list in the specification types.
2. `TreadLineSection` with `TreadRingPointCount` as a compile-time constant, and a static assertion that every
   section returns exactly that many points.
3. Rewrite `TreadMeshSolver::Solve` as the five steps.
4. Extend `TreadMeshProof` to gate boundary and non-manifold at zero for all six pattern families, and at
   `RingCount × 2` with capping off.
5. Convert the existing presets from region lists to lane lists.

Step 4 before step 5, so the preset conversion is landing against a gate that already works.

## 7. Open questions

- **Sipes are approximated.** A real sipe is a zero-width slit; here it is an `h` dip with finite width. Below
  about 0.4 mm the two walls would need to share vertices, which is a second constant point count problem. Worth
  solving only if sipes are to be visible in the contact patch.
- **Tie bars are not implemented.** They are a second `h` floor inside the lateral groove, so they are a node-list
  change rather than a topology change.
- **The belt thickness is a constant** at 11 mm. It should come from the carcass specification once the sidewall
  is generated by the same sweep, at which point the inner face disappears and the tread band joins the sidewalls
  directly.
