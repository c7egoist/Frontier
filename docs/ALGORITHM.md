# Frontier Algorithm Notes

How Frontier turns a branch skeleton into **one closed, manifold,
genus-0 mesh** with fused ("L") junctions instead of intersecting ("I")
tubes.

## 1. Skeleton

Two growers produce the same graph structure (nodes with position,
radius, parent, children):

* **Recursive** (default): leader + laterals. Each branch is a polyline;
  laterals spawn at golden-angle azimuths with species parameters
  (branch angle, length/radius decay, tropisms, curl, envelope).
  Leonardo's rule (area preserving: `r_parent² = r_cont² + r_lat²`)
  keeps junctions botanically consistent.
* **Space colonization** (Runions et al. 2007, simplified): attractors in
  an envelope pull growth; attractors inside the kill radius are removed.
  Radii propagate bottom-up, then rescale to the trunk radius.

Pipeline surgery (both growers):

1. `enforce_bifurcation` — N-furcations (N > 2) are rewritten into short
   chains of binary (Y) junctions, leader deepest.
2. `subdivide_long_edges` — edges longer than ~2.5× local radius are
   split (square-ish quads + smooth wind bending).
3. `compute_frames` — parallel-transport frames from the root
   (twist-free, so ring seams align and lofts never corkscrew).

## 2. Rings, lofts, dart bridges

* Every node owns a ring of `N` vertices (CCW around the growth
  tangent), `N` snapped to a ladder `{4,5,6,8,…,20}` from local radius.
* Consecutive same-count rings loft to **pure quads**.
* Different-count rings join with a **dart bridge**: a greedy walk over
  both loops emitting quads where the loops advance together and
  triangles ("darts") where only one advances. Always manifold; seam
  rotation is auto-aligned to minimize twist.
* Root is fan-capped below the flare; tips end in short cone caps.
* **Bark UVs**: u = angular fraction × 3 tiles/turn; v = arclength/2.
  Junction child-loop verts carry a texture-arclength override (`v_arc`,
  the child node arclen) so V interpolates *across* the webs instead of
  smearing a constant-V 1D texture slice (the old diagonal-stripe
  artifact); child-loop U is pairwise-matched to the parent path U after
  P-ring adoption. Seam-vertex splitting is deliberately *not* used —
  it would break the watertight-manifold guarantee.

## 3. The fused Y junction ("webbed pants")

At a binary junction J (parent P, children C1, C2) we build a
pair-of-pants surface:

```
            C2 ring (L2, back-first loop)
           /  \
          /    \   crotch vertex C (shared by L1+L2)
   child 2      \   /
                 \ /
   parent ring P  X      <- front quad disk + back quad disk
                 / \       + 2 outer side triangles
   child 1      /   \
           \  /      (child rings pushed out so they separate;
            L1        collars swell the throat — no hourglass)
```

* Parent ring P (`2a` verts) sits just before J; child rings L1/L2
  (`2b1+1`, `2b2+1` verts, `a = b1+b2`, split ∝ child radii) sit past J
  and **share one crotch vertex** (the fork notch).
* Front disk: `a` quads bridging parent front arc → concatenated child
  front arcs (`O1F…C…O2F`). Back disk mirrored (`O2B…C…O1B`).
* Two side triangles close the outer elbows (with a small bevel so the
  outer edge is never degenerate).
* Loop orientations are verified numerically (Newell dot tangent) with
  automatic global front/back flip; mixed signs raise `JunctionError`.

Placement (the anti-pinch rules):

* Child ring centers are pushed out along their axes until the rings
  separate (`o ≈ (r1+r2)·0.45 / sin(half-angle)`), so the throat keeps
  full cross-section — this was the hourglass-pinch fix.
* The crotch sits just ahead of both ring planes (short V notch).
* Branch-collar swelling (parent ×1.12, children ×1.06) fattens the
  throat exactly like real branch collars.
* 2 iterations of junction-only Laplacian relaxation even out spacing
  (topology-safe: positions only).

Winding is derived once and checked everywhere: every interior edge is
used by exactly 2 faces in opposite directions; a signed-volume guard
flips the mesh if it ever comes out inside-out (it never does — tests
assert the guard never fires).

## 4. Validation gate ("no compromise")

`validate_mesh` asserts: no NaN, no degenerate faces, **closed**
(0 boundary edges), **manifold** (0 edges with 3+ faces),
**consistently oriented**, **single component**, **genus 0**
(`V − E + F == 2`), outward volume. The CLI `--strict` flag and the
test suite fail loudly on any violation.

## 5. Wind payload (per vertex)

* `weight` ∈ [0,1]: 0 at root flare → 1 at twig tips (height^1.6 mixed
  with thinning radius; trunk stays near-rigid).
* `phase` ∈ [0,1): stable random per branch (neighbors sway out of sync).
* `pivot`: branch-base position (rotation center for pivot wind).
* `flutter`: high-frequency amount (twigs/leaves).
* Packed as `COLOR_0 = (weight, phase, ao, level01)`,
  `TEXCOORD_1 = pivot.xy`, `TEXCOORD_2 = (pivot.z, flutter)`.

Because junctions share vertices (not intersections), pivot rotation
about branch bases can never open cracks — the mesh bends as one skin.
