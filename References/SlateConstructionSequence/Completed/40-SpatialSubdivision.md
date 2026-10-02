# 40 — SpatialSubdivision

`74` resolves the pointer on the host, every sample, without reading back a device target. That is only possible
if the host can answer "what does this ray meet" in bounded time. This document is what it asks.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `02` (Tier A predicates), `10`, `12` (attachment), `34`, `38`                 |
| Downstream  | `74` (every pointer sample), `72`, `26`, `60`, `12`                          |
| Unblocks    | Host-side intersection without a device                                       |

## 1. The Components

| Component            | What it holds                                                          |
|----------------------|-------------------------------------------------------------------------|
| `BoundingStructure`  | Extents over one occupant's topology, in object space                  |
| `OctantSpace`        | The document-space subdivision over occupants                          |
| `AxisSpace`          | The two-dimensional subdivision over a surface's parametric domain     |
| `TraversalSequence`  | Ray and extent traversal over any of the three                         |

Three subdivisions and not one, because the three answer different questions and share no space. `00` §10 conflict
7 fixed their spellings; this document is where they acquire behaviour.

## 2. Two Levels, And Why

`OctantSpace` subdivides **occupants** in document space. `BoundingStructure` subdivides **faces** within one
occupant, in that occupant's own object space.

🔴 The inner level is in object space and is therefore invariant under occupant motion. A ray entering an occupant
is transformed into object space once, at entry, and traversed there.

⚠️ A single document-space subdivision over every face would be re-derived whenever any occupant moved. Moving an
occupant is the most frequent thing an artist does to a scene, and it would cost a full rebuild each time. The
split makes an occupant move an update to one extent in `OctantSpace` and nothing else.

`AxisSpace` is the third and answers a two-dimensional question — which placements' extents contain a domain
position — for `74` §3 and `72`. It is over the domain, not over space, and it is per surface.

## 3. Traversal

| Query                    | Structure                        | Answers                            |
|--------------------------|----------------------------------|-------------------------------------|
| Ray to nearest surface   | `OctantSpace` → `BoundingStructure` | `74`'s tuple                     |
| Extent to occupant set   | `OctantSpace`                    | `74`'s marquee, `16`'s culling      |
| Domain position to placement | `AxisSpace`                  | `74` precedence 1, `72`             |
| Ray to placement extent  | `AxisSpace`, after the surface hit | Projected placement resolution    |

Traversal descends nearest-first and stops when the remaining extents are further than the nearest confirmed hit.
For the marquee, traversal is once over the extent — `74` §4 states this from the other side — and not once per
sample position within it.

Enrollment exclusion is tested **before** descent: `74` §3's locked and visibility-excluded occupants never enter
traversal at all, which is why an excluded population costs nothing rather than costing a rejected test each.

## 4. Currency

The subdivision must be correct on the tick that reads it, and the tick that reads it is the tick a pointer sample
arrives on. There is no room for a rebuild between the two.

| What changed                       | Cost                                                        |
|------------------------------------|--------------------------------------------------------------|
| An occupant moved                  | One extent updated in `OctantSpace`; refit, not rebuilt     |
| An occupant was added or removed   | One insertion or removal                                    |
| Topology was imported              | `BoundingStructure` built through `34`, off the tick        |
| A placement moved                  | One extent updated in that surface's `AxisSpace`            |
| The camera moved                   | Nothing                                                     |

🔴 Refit is not rebuild. Refitting propagates changed extents upward and leaves the subdivision's shape alone; the
shape degrades as occupants move far from where they were built, and quality is recovered by a rebuild through
`34` at `Background` priority. Degraded quality costs traversal time; a stalled tick costs the artist's stroke.

A build in flight never replaces the live structure. `34` §3 applies without amendment: the result crosses back on
the tick and the requester swaps it in there.

## 5. Attachment

`OctantSpace` holds occupants at their **composed** transforms — `12`'s `AttachmentFollows` resolved downward. An
occupant attached to a moved carrier moves in the subdivision even though its own transform did not change.

⚠️ This is the one place where the two nesting relations differ observably in intersection. `EnclosureContains` is
organisational and has no effect here at all: clicking a surface inside a closed enclosure hits that surface.
Whether the outliner then presents the enclosure or the occupant is `12`'s decision, not this document's.

## 6. Precision

| Computation              | Tier | Reason                                                      |
|--------------------------|------|--------------------------------------------------------------|
| Extent overlap           | A    | A missed overlap is geometry that cannot be clicked          |
| Ray against a face       | A    | `02` §4's orientation predicate; the answer is a selection   |
| Domain containment       | A    | Decides which placement was picked                           |
| Distance ordering        | B    | Only orders confirmed hits                                   |

🔴 Extents are conservative outward, matching `38` §6. An inward-rounded extent excludes a face from traversal, and
the artist meets it as a surface with a thin band along one edge that cannot be selected or painted.

## 7. Gates

- **Gate:** `74` answers on the host against this and never reads back a device target.
- **Gate:** `BoundingStructure` is in object space and is invariant under occupant motion.
- **Gate:** An occupant move is a refit of one extent, never a rebuild.
- **Gate:** Rebuilds run through `34` and are swapped in on the tick.
- **Gate:** Enrollment exclusion is tested before descent.
- **Gate:** A marquee is one traversal over the extent.
- **Gate:** Classification uses `02` §4's Tier A predicates.
- **Gate:** Extents are conservative outward.
- **Gate:** `OctantSpace` holds composed transforms; `EnclosureContains` does not affect traversal.

## 8. Open

| Open question                                                            | Blocks                       |
|---------------------------------------------------------------------------|-------------------------------|
| Subdivision arity and leaf occupancy for `OctantSpace`                    | Tuning only                   |
| Whether refit degradation is measured, and what triggers the rebuild      | Tuning only                   |
| Whether `AxisSpace` is per surface or per chart from `68`                 | Cost only; either is correct  |
| Whether `16`'s device culling reads this or derives its own extents       | `16` §4.1 carries this too    |
