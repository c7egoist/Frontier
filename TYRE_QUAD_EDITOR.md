# Tyre Quad Editor — how it works, and what to honestly expect

Open `TyreQuadEditor.html` (serve the folder, e.g. `python3 -m http.server 8080`,
then visit `/TyreQuadEditor.html`). It replaces the tread system of the original
generator (`References/TyreGenerator.original.html`, kept for reference).

## Why the previous attempts failed

The original demo — and the "fixed" versions produced from it — cheat in two ways:

1. **Heightmap displacement.** The tread is a regular lathe grid whose vertices are
   pushed in/out by a canvas depth texture. Groove walls are just stretched grid
   cells, resolution is fixed by the texture, and sipes/edges alias. It *looks*
   like tread; it is not tread geometry and it deforms badly.
2. **Triangulated polygons.** The "poly tread" path extrudes Clipper polygons via
   `THREE.Shape` triangulation — all triangles, with no edge flow. Fine for a
   picture, useless for the deformation work you want.

## The pipeline in this editor (no heightmap anywhere)

All of it lives in `quad-core.mjs` (pure geometry, no DOM — it runs in Node too):

1. **You design vector shapes** in one unwrapped tread tile: `u` = around the tyre
   (the tile repeats in this direction), `v` = across the tread. Shapes have a
   role — **lug** (raised block, top at 0), **groove** (cut), **sipe** (thin cut) —
   a depth, and an outline-smoothing (Chaikin) level. Draw them with the pen /
   primitives, import an **SVG** (`path`, `polygon`, `rect`, `circle`, `ellipse`
   are parsed, curves flattened), or load a preset. Shapes may cross the tile
   edge; they wrap.
2. **Constrained triangulation.** Shape outlines are subdivided — each shape at
   its own local width, so a 1 mm sipe is not meshed with 9 mm triangles — split
   at every mutual intersection, and enforced as constraint edges in a Delaunay
   triangulation (missing constraints get midpoint insertions until they exist).
   Grid Steiner points fill the interior. This makes the mesh *conform* to your
   drawn outlines instead of sampling them.
3. **Region classification.** Each triangle takes the height of the topmost shape
   containing its centroid (lug top `0`, groove/sipe floor `−depth`, background =
   groove floor when lugs exist). Overlaps resolve by shape order — no boolean
   operations, so crossing/complex/asymmetric patterns cannot break it.
4. **Tri → quad conversion.** Every triangle becomes exactly 3 quads (edge
   midpoints + centroid). Height boundaries get real **wall quads**, with an
   optional chamfer ring (inset top edge + 45° strip, scaled down on short edges).
   Free vertices are then Laplacian-smoothed with a fold guard; shape outlines,
   borders and wall rings stay exactly where you drew them.
5. **Array + wrap.** The tile is repeated around the circumference (straight,
   alternate mirror-across, alternate flip-around, alternate 180° — the modes
   real alternating off-road patterns use), vertices are **welded at the seam**,
   and the band is wrapped onto the crowned/shouldered profile. Sidewalls are a
   structured quad lathe; the rim is quad lathe + quad disc.
6. **Validation, not vibes.** Every build reports: quad count, **triangle count
   (must be 0)**, poor quads (corner angle < 25°), minimum quad angle,
   extraordinary vertices, open edges. The same validator runs in
   `tests/quadmesh.test.mjs` and deliberately includes a case proving it *catches*
   a triangle — the numbers are not rigged.

Export is **OBJ with true 4-vertex faces** (`f a b c d`). GLB is deliberately not
offered as the quad export because glTF only stores triangles. Note the standard
caveat every DCC tool shares: GPUs rasterise each quad as 2 triangles internally —
that is display-only; the stored/exported topology is quads.

## Presets

`Ribline Touring 4` (Street), `Trail Lock A/T` and `Rocklock M/T` (off-road),
`Vector Trail V` (Grip/UHP) — the four that failed before — plus
`Kalahari Asym A/T` and `Apex Asym UHP`, which are deliberately **asymmetric**:
different lug sizes, angles and spacing on each side of the centreline, the class
of pattern that is impossible to fake with a mirrored heightmap strip. Load one
and inspect its shape list; everything is editable.

## Deformation

The Deformation panel moves the actual mesh vertices: contact-patch flattening
with sidewall bulge, twist about the axle, inflation growth. This is the payoff
of real quad topology — and the Quad wireframe toggle lets you watch the edge
flow while it deforms.

## Honest limitations

- Tri→quad splitting creates a valence-3 vertex at every triangle centroid.
  Those are the extraordinary vertices in the stats; *some* extraordinary
  vertices are mathematically unavoidable in any quad mesh of an arbitrary
  shape, but if you need production FEA-grade flow you would retopologise
  further (e.g. field-aligned quad meshing) — that is a research-grade step
  beyond this editor, and we won't pretend otherwise.
- Quad quality is worst where shapes cross at acute angles or nearly touch
  (narrow rubber slivers between two grooves). The stats show it as "poor
  quads"; lowering **Detail (edge mm)** or giving shapes more clearance helps.
- The chamfer is a mitered approximation at sharp concave corners.
- Tread band and sidewall are coincident at the shoulder but not stitched into
  one shell (visible only if you go looking for it in a DCC).

## Tests

```sh
node tests/quadmesh.test.mjs
```

Builds every preset tile, a full welded tyre in all array modes, a single-lug
wall/chamfer case, and SVG round-tripping — asserting 100% quads throughout.
