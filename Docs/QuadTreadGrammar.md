# Quad Tread Grammar

How a tyre tread is modelled here: **one conforming quad grid per pitch**, built from traced feature outlines, then
mirrored, bent onto the crown, and arrayed around the wheel. No height map, no displacement, no texture lookup, no
per-vertex raster probe — if a face exists it is because an outline in a design asked for it.

* Viewer / authoring surface: [`References/QuadTreadAAA.html`](../References/QuadTreadAAA.html)
* Meshing core: [`References/quadtread/quadcore.mjs`](../References/quadtread/quadcore.mjs) (grammar → traces) and
  [`References/quadtread/quadmesh.mjs`](../References/quadtread/quadmesh.mjs) (traces → quads)
* Twelve designs: [`References/quadtread/designs.mjs`](../References/quadtread/designs.mjs)
* Checks: `node verify.mjs` (37 parameter extremes), `node run12.mjs` (all designs, full ring),
  `node build_html.mjs && node build_html.mjs --check && node shipped_check.mjs` (the code inside the HTML is the
  code that was tested, and it still produces clean meshes)

---

## 1. The four steps

| Step | What is built | Why it is a separate step |
|---|---|---|
| **1 Trace** | one **authored half** of one pitch, flat | you see the pattern exactly as authored: skins at the cell's level, one wall quad per step down the level chain, groove floors, chamfer lands |
| **2 Mirror** | the other half, produced from the first | a rib's blocks reflect through the centreline (`mir: 'mirror'`), through its centre (`'point'`), or the two halves are authored independently (`'copy'` + `lanesL`). Nothing is re-authored; the halves share the centre row's vertices |
| **3 Crown** | one pitch bent onto the wheel | lateral mm follow the meridian of the crown bulge and the shoulder roundover, circumferential mm become wheel angle, depth is measured along the profile **normal** so a groove floor curves instead of flattening. Topology untouched — only positions change |
| **4 Array** | `pitches` copies, plus skirt and cap | the seam is not stitched: the last column of tile *t* **is** the first column of tile *t+1*, so walls and skins across a pitch boundary are the same faces. A blocked rib bridges itself because the two facing loops are identical (same K, same columns, same levels) |

`pitch = tread circumference / pitches`, exact — variable pitch (below) is the only thing that stretches it.

---

## 2. Design grammar

A design is a stack of **lanes**, authored from the centreline out to the shoulder on the right half only.

```js
design = {
  id, label, tag, desc,
  shear:  'v' | 'z' | 'none',   // how the chevron angle is realised: circumferential drift per mm of lateral run
  mir:    'mirror' | 'point' | 'copy',   // how the left half is produced (lane.mir overrides per lane)
  shift:  0.5,                  // the flip's translation, as a fraction of a pitch (stagger)
  wrap:   0..1, wrapL: 0..1,    // how far the outermost lanes continue past the tread edge, × shoulderLen
  pitchSeq: [1, .82, 1.14, …],  // optional relative pitch lengths (angles only, never topology)
  lanes:  [lane, …],
  lanesL: [lane, …],            // optional independent left stack (implies an asymmetric tyre)
}

lane = {
  w: 0.22,                      // share of the half-width; normalised across the stack
  kind: 'rib' | 'groove',
  base: 'floor',                // level of the lane's own surface (a groove is 'floor' by default)
  chev: 0.6,                    // chevron weight: 1 = full angle, 0 = straight circumferentially
  mir, shift,                   // per-lane override of the mirror rule
  edge: { a, cyc, tri },        // serrated lane boundary (a wave the grid must resolve, see §3)
  blocks: {…}, cuts: […], sipes: {…}, tie: {…},   // feature generators (below)
}

cut = {                          // a cut is a band between two trajectories across part of a lane
  level: 'floor',                // what depth the cells inside it sit at
  at: [0.05, 0.95],              // the t-range it occupies along the lane's span (t is 0 at the inner edge)
  u0: [a, b], u1: [a, b],        // the two edges as u(a)→u(b): different ends = a taper
  du0, du1,                      // shorthand taper for the flat form
  keys: [[t, u0, u1], …],        // a literal trace of the outline (both edges at once)
  lKeys, rKeys,                  // per-edge offsets: hooks, notches, dog-bones, undercuts
  bow,                           // mid-span widening of both edges
  zig: { a, cyc, ph, tri, side }, // serration on the edges (side 'L'/'R'/'E' picks which)
  samples,                       // how many t-stations the shape forces into the grid
}
```

Generators are just cut factories: `gaps(n, w, at, taper, level, bow, zig, keys)` (block separations),
`sipes(n, w, at, level, du, zig)`, `tieBars(n, w, at)` (the one generator with `over: 1`, because a tie bar is a
*bridge* — it raises a cell above what contains it rather than cutting it deeper).

### Levels

A level is a depth plus a lateral inset. `depthFrac` scales it by tread depth:

| level | depth | used for |
|---|---|---|
| `top` | 0.00 | block skin; carries the chamfer inset (`cham`) |
| `kerf` | 0.14 | wear scribe, a shallow slit |
| `relief` | 0.45 | a ledge under a lug, the second terrace of a two-step wall |
| `sipe` | 0.62 (`sipeDepthF`) | sipe floors |
| `pit` | 0.78 | stud pockets |
| `floor` | 1.00 | groove floors |

Levels are *terraces*: the cell's level is the deepest feature containing it, and every wall is a walk **down the
chain** of levels between its two cells (see §3). A design can therefore put a sipe inside a block, a pit inside a
sipe field and a relief ledge under a lug without any special cases.

### Mirroring is an authoring operation

`mir: 'mirror'` reflects the right half about the centreline (t read backwards, drift negated, `shift` pitch
fractions of circumferential offset) — that is the classic herringbone: one arm authored, the tyre carries it.
`'point'` reflects through the *centre of the pitch*, which staggers the halves by half a pitch automatically, and
is what an all-terrain wants. `'copy'` with `lanesL` gives an asymmetric tyre: two stacks, one function per side,
identical grid so they still share every vertex on the centre row.

---

## 3. How the mesh is built (and why it closes)

1. **Rows** are x stations: every lane edge, every cut boundary, every turning point of every serration and key
   profile, then subdivided by `xsub`. Rows of *gaps* are merged across lanes at a fixed `u` so a void keeps the
   same band edges on both sides of a rib (that is what lets a groove read as one channel instead of a stair).
2. **Columns** are the same count `K` at every row: the seam (u=0), the uniform `usub` refinement, both boundary
   trajectories of every cut, and one column per serration turning point. **Every column is evaluated at every
   row** and clamped to its feature's x-range, so a feature that dies out mid-pitch leaves a harmless phantom loop
   rather than a T-junction — that is what makes blunt-ended voids and half-fading sipes possible at all.
3. Per row the columns are sorted by u, then pushed apart to a minimum spacing (`ugap`) so no cell can fold inside
   out. Serrated rows solve a fixed point (`x = x₀ + sgn·wave(u)`) so a zig-zag edge is *traced*, not sampled.
4. **Row refinement**: for each band, if the rank→column map at its two rows differs *at a rank where a wall has
   to be emitted*, or if two levels touch diagonally, a row is inserted at the band's middle and the sweep repeats
   (bounded, and capped, because a tangential crossing cannot be resolved by subdivision — what is left is a
   quarter-millimetre skew, never a hole).
5. **The vertical chain**: every node carries a ring for *every* level, in depth order, including the chamfer land
   (`bevel` below the skin, inset to zero so the skin's edge reads as a moulded bevel). A wall between two cells
   steps down that chain, one quad per step. Because the chain is global, a strip that turns a corner, meets a
   third level, or ends where a level fades out shares vertices at both ends — the class of hole that kills naive
   terraced meshes is gone by construction. A level that reaches a node on one side only gets its ring
   interpolated along the chain, which is what makes a sipe taper out into a block edge instead of tearing.
6. **Diagonal contacts** (the marching-cubes ambiguity) are resolved by repainting the smallest cell of the 2×2
   into an ordinary one-cell step, one snap at a time, so a chain of contacts unwinds without oscillating.
7. **Orientation is propagated, not guessed**: one seed face per connected component decides the outward side from
   its reference normal; every other face follows over the shared-edge graph, computed on a **single period** of the
   array (the first `perTile` faces, seam walls included). This is the only way two wall strips meeting at a block
   corner can be guaranteed to agree.
8. **Welding + the seam**: the array is `pitches` copies and the last tile's seam column is the first tile's, so
   copies weld into one ring. Duplicate wall quads over the same node pair are dropped rather than emitted twice.
9. **Skirt and cap**: rows run past the tread edge (at least one margin row even with the skirt off, so no feature
   edge lands on the rim loop), and `cap` drops each rim loop onto the carcass and lands it — the pitch then has
   *zero* open edges, i.e. a sealed tube of quads.

---

## 4. The audit

Every build reports, on one pitch with the array seam wrapped:

* `open` — edges used once. **Correct value: `2 × cols`** (the two rim loops), or **0** with `cap` on. Anything else is a hole.
* `nonManifold` — edges used more than twice. Must be 0.
* `inconsistent` — edges whose two users traverse them the same way. Must be 0.
* `degenerate` — zero-area quads. Must be 0.
* `pinched` — vertices whose incident face count differs from their incident edge count (a non-disk fan). Must be 0 except on step 1, which is a half-mesh and open by construction.
* `splits` × `passes` — how much row refinement the trace needed, `levels` — the chain that design actually uses,
  `mirrored faces` — how many quads came from the mirror rather than from authoring, plus `rows × cols` and pitch in mm.

`verify.mjs` sweeps 37 parameter extremes (pitch 1 → 121, chevron 0 → 21, asymmetry, both wraps, cap on/off,
skirt 0/9/20/off, bevel 0, cham 0, `ugap` 0, depth 1/20, sipe depth 0/1, crown 0/6, shoulder, hi/lo res, tiny and
SUV carcasses, `xmin` 0/12, no subdivision, `treadFrac` 0.2/0.9, aspect 65, rim 15) across all four steps and fails
if any of the above moves. `run12.mjs` does the same for the twelve designs at the real `pitches` and checks that
the exported OBJ still has four indices per face.

## 6. Results

Measured from the code inside the shipped HTML at its default carcass (245/45 R17, 9 mm depth, `xsub` 6, `usub` 9,
48 pitches). Every row is **closed to exactly the two rim loops, manifold, consistently wound, degenerate-free,
pinch-free, and every face a quad** — at step 2, 3 and 4 alike (`open` is listed so the number can be checked
against `2 × cols`).

| design | grid (rows×cols) | quads / pitch | ring quads @48 | mirrored | open | pitch mm |
|---|---|---|---|---|---|---|
| `wetV` | 84×73 | 8,453 | 405,744 | 147,168 | 146 (=2K) | 42.7 |
| `asymUHP` | 71×67 | 6,492 | 311,616 | 0 | 134 (=2K) | 42.7 |
| `herringbone` | 73×25 | 3,012 | 144,576 | 43,200 | 50 (=2K) | 42.7 |
| `allTerrain` | 118×61 | 10,545 | 506,160 | 128,832 | 122 (=2K) | 42.7 |
| `winterSipe` | 152×85 | 22,913 | 1,099,824 | 363,120 | 170 (=2K) | 42.7 |
| `rally` | 123×33 | 6,296 | 302,208 | 87,120 | 66 (=2K) | 42.7 |
| `mudClaw` | 163×37 | 9,014 | 432,672 | 214,896 | 74 (=2K) | 42.7 |
| `semiSlick` | 57×33 | 3,556 | 170,688 | 41,184 | 66 (=2K) | 42.7 |
| `touring` | 123×81 | 14,632 | 702,336 | 260,496 | 162 (=2K) | 33.3–48.7 |
| `offRoad` | 92×25 | 2,859 | 137,232 | 61,200 | 50 (=2K) | 42.7 |
| `sandPaddle` | 62×41 | 3,383 | 162,384 | 39,360 | 82 (=2K) | 42.7 |
| `studded` | 161×109 | 26,364 | 1,265,472 | 413,328 | 218 (=2K) | 42.7 |

`asymUHP` has no mirrored faces because its left half is authored, not reflected. `touring` is the design carrying
`pitchSeq`, so its pitch stretches from 33 mm to 49 mm around the ring while its grid stays 123×81 — topology
untouched, which is the point of doing it in the mapper. With `cap` on, `open` becomes 0: the pitch is a sealed
quad tube.

The 37-case sweep in `verify.mjs` prints one line per parameter extreme per step and finishes with
`all clean: every mesh is a closed, oriented, all-quad manifold`.


## 5. Authoring rules

* **A feature must not be thinner than the grid can see.** A sipe narrower than `max(xsub, usub)` spacing, or a
  zig amplitude larger than the gap to its neighbour, makes trajectories tangent: the refinement will spend its
  budget and leave skew. `ugap` keeps cells apart, `xmin` keeps rows apart, both are safety nets, not design tools.
* Levels must differ for a wall to exist; a cut at the level its lane already sits at is a no-op (that is how a
  `base: 'top'` rib with a `floor` level `sipes` entry would behave — set `sipe` or `relief` instead).
* `at: [-0.1, 1.1]` on a `blocks` cut is how a lug runs off the lane edge and onto the wrap.
* Voids merge across a rib when their rows fall within `xmin`; that is intentional (a groove that continues past a
  centre rib is one groove), and it is why `xmin` should stay near a fraction of `xsub`.
* The mesh is tread only: no sidewall, no carcass — `cap` closes the band onto the carcass radius, it does not build one.
