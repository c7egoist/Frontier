# 26 — IntersectionOutline

Selection feedback is derived by comparing resolved identities, not by re-rasterising the selection. `16` already
wrote, for every pixel, which surface resolved there; an outline is the boundary of the set of pixels whose
resolved occupant is enrolled in the selection subset. No extra geometry is submitted and no second visibility
resolution occurs.

This works because identity is Tier A. An outline derived from approximate identities shimmers along silhouettes,
and that shimmer is misread as an anti-aliasing defect for a long time before anyone suspects the comparison.

⚠️ `SelectionIndex` is the retired spelling; the mechanism is intersection — which surface a pixel resolved to.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`, presented by `SlateUI.lib`                                |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `12` (`EnrollmentIndex`), `16` (`VisibilityIndex`, `DepthSurface`), `42` (occupant resolution), `66` (`DisplaySurface`), `08` |
| Downstream  | `80` records over it; `14` records the interface over both                    |
| Unblocks    | Selection feedback the artist can see                                         |

## 1. Derivation

① For each pixel, read the partition identity from `VisibilityIndex` and resolve it to an occupant through
   `42`'s indexed lookup — see `16` §4.1.
② Test enrollment in the selection subset — an interval comparison against `12`'s compressed enrollment.
③ A pixel is an outline pixel when it is enrolled and any neighbour within the outline width is not, or when it
   is not enrolled and any neighbour within the width is.
④ Write coverage into `OutlineSurface`.
⑤ Record the outline over `DisplaySurface` in the outline colour — display-referred, at `08` §3 ⑨.

⚠️ Step ① previously read "resolve the occupant from `VisibilityIndex`", which nothing in the series made
possible: `16` §4 writes partition identity and triangle index, and a partition is not an occupant. The
resolution now exists in `42` and is read here rather than derived. Recorded as `00` §10 conflict 15.

Step ② is why `12` compresses enrollment by interval: this is a per-pixel test every rotation, and a per-occupant
set lookup at that frequency is not affordable.

The selection tested is `12`'s `SelectionSequence` enrollment at the current position in that sequence. Undoing a
selection change moves the outline, which is the feedback that tells the artist the undo did what they expected.

## 2. Occlusion

An outline is drawn where the selection is visible, and optionally where it is occluded — rendered differently so
that the artist can tell. Occlusion is determined by comparing the selection's depth against `DepthSurface`, both
already resolved by `16`.

🔴 Occluded-outline rendering must be visually distinct, not merely dimmer. An artist who cannot distinguish
"behind something" from "faint" will move the wrong occupant.

## 3. Placement

`26` records at `08` §3 ⑨ — **after** `66` produces `DisplaySurface`, not after `30`. It reads `VisibilityIndex`,
which is stable from `16` onward, so the ordering costs nothing.

🔴 The outline is **display-referred**. It is written in display code values over a finished `DisplaySurface`, and
it is never passed through `66`'s exposure or tone map.

⚠️ This document previously placed itself at ⑤, before tone mapping, and justified the position only against `30`.
An outline written into `RadianceSurface` is tone-mapped with the scene: raise the exposure and the outline
converges to the same white as the surface it surrounds, so the affordance that exists to be unmistakable is
brightest exactly when it is least visible. It is also reflected by `30` and accumulated by `64` — a selection
outline appearing in a mirror, smeared across two rotations. Recorded as `00` §10 conflict 25.

The outline colour is therefore a display colour, chosen for contrast against display values, and it does not
change when the artist changes exposure.

## 4. Width And Anti-Aliasing

Outline width is specified in display pixels and is therefore independent of scene scale and camera distance —
selection feedback is an interface affordance, not a scene property, and must not thin out with distance.

Coverage is written as a scalar so step ⑤ composites a smooth edge. A binary outline aliases badly against the
diagonal silhouettes that dominate polygon topology.

⚠️ Width in display pixels is also why the outline cannot precede `64`. Accumulation reprojects the previous
rotation by `MotionSurface`; a display-width feature reprojected as though it were a surface property smears
across the silhouette it was drawn on, and grows a trailing edge whenever the camera moves.

## 5. Placed Content And Decals

Placed content from `72` — text, images, vector sources, tiling — is enrolled in the population like any other
occupant, so it outlines through the same path with no addition. What outlines is the placement's **projected
extent on the surface it is attached to**, because that is what the artist selected and what a manipulator will
move.

🔴 A placement is outlined at its extent, never at the extent of the surface carrying it. Selecting one decal on a
character and seeing the whole character outline tells the artist nothing about what they are about to move.

## 6. Gates

- **Gate:** No geometry is submitted; the outline derives from `16`'s targets only.
- **Gate:** The occupant is resolved through `42`, never derived here.
- **Gate:** Identity comparison is Tier A and integer.
- **Gate:** Enrollment is tested by interval comparison.
- **Gate:** Occluded outlines are visually distinct from visible ones.
- **Gate:** Width is specified in display pixels.
- **Gate:** Coverage is scalar, not binary.
- 🔴 **Gate:** The outline is recorded display-referred, after `66`, and is never tone-mapped, reflected or
  accumulated.
- **Gate:** A placement outlines at its own extent, not its carrying surface's.

## 7. Open

| Open question                                                       | Blocks                       |
|-----------------------------------------------------------------------|-------------------------------|
| Whether hover feedback uses this path or a lighter one                | Nothing structural            |
| Whether outlines nest — enclosure outlined differently from occupant  | `12` enrollment shape         |
| Whether the outline colour follows the interface theme                | `14` theme policy only        |

⚠️ "Whether `OutlineSurface` can pack into `OccupancySurface`" is **closed** — it cannot. `OccupancySurface` is a
scene-referred classification target produced by `16` at ②, and `26` now runs at ⑨.
