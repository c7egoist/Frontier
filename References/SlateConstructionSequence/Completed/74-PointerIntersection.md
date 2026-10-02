# 74 — PointerIntersection

Picking answers what is under the pointer. It is asked every pointer sample, by painting, by selection, by
manipulation and by placement, and it is answered **on the host**.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateDocument.lib` (traversal), `SlateCompute.lib` (domain resolution)       |
| Layers      | `Layer3_Document`, `Layer4_Compute`                                           |
| Upstream    | `02` (Tier A predicates), `40` (subdivision), `12` (enrollment), `46`, `72`   |
| Downstream  | `22` paints at what it resolved; `78` manipulates it; `12` enrolls it         |
| Unblocks    | Picking — occupants, placements, components, marquee                          |

## 1. Host, Never Readback

🔴 `00` §11 gates this and `22` §1 gives the reason. Readback of a device target is latent by the recording slot count —
tens of milliseconds — while a stylus reports at hundreds of samples per second. A pointer resolved against a
target read back is resolved against where the cursor used to be.

| Mechanism              | Where it runs | Reads                                             |
|------------------------|---------------|----------------------------------------------------|
| Intersection traversal | Host          | `40`'s subdivision over `10`'s topology           |
| Domain resolution      | Host          | The intersected triangle's domain coordinates     |
| Placement intersection | Host          | `72`'s extents, resolved through `70` on the host |

⚠️ `16`'s `VisibilityIndex` holds exactly the answer this document computes, one rotation late. That it is never
read is a deliberate duplication of work, and the alternative is a stroke that lags the cursor.

## 2. What Is Resolved

An intersection resolves to a **tuple**, not to an occupant. Every consumer needs a different part of it, and
resolving them separately would traverse the same subdivision several times per sample.

| Resolved                 | Consumed by                                        |
|--------------------------|-----------------------------------------------------|
| Occupant identity        | `12` enrollment, `78` manipulation                  |
| Triangle index           | Component selection                                 |
| Domain position          | `22` painting, `72` domain placement                |
| Position and orientation | `78` manipulator plane, `72` projected placement    |
| Distance                 | Ordering when several intersect                     |
| Placement identity       | `12` enrollment when a placement was hit            |

🔴 A placement is intersected at **its own extent**, not at its carrying surface's. `26` §5 outlines what this
resolves, and the two must agree: selecting a decal and seeing the whole object outline, or clicking a decal and
selecting the object, are the same defect on either side of the same rule.

## 3. Subsets And Precedence

| Order | Resolved                                       |
|-------|-------------------------------------------------|
| 1     | A placement whose extent contains the position |
| 2     | The nearest occupant surface                   |
| 3     | Nothing                                        |

Occupants enrolled in the lock subset, and those excluded from visibility, are not intersected at all — `12` §3's
enrollment is tested by interval comparison before any traversal, so an excluded population costs nothing.

⚠️ Precedence 1 above 2 is deliberate. A placement is on a surface, so both always intersect, and resolving the
surface first makes a placed decal unselectable by clicking it.

## 4. Marquee

A marquee resolves a screen extent to a set. It is not a repeated point intersection: the extent is projected
into the subdivision and traversed once.

| Mode         | Enrolls                                    |
|--------------|---------------------------------------------|
| Containment  | Occupants whose whole extent falls inside  |
| Intersection | Occupants whose extent overlaps at all     |

The result is one enrollment transaction in `SelectionSequence`, not one per occupant. `12` §9 gates that every
mutation is a transaction; a marquee over a thousand occupants committing a thousand transactions makes undo step
back one occupant at a time.

## 5. Gates

- **Gate:** No mechanism here reads back a device target.
- **Gate:** Intersection runs on the host against `40`.
- **Gate:** One traversal resolves the whole tuple.
- **Gate:** A placement is intersected at its own extent, agreeing with `26` §5.
- **Gate:** A placement resolves before its carrying surface.
- **Gate:** Locked and visibility-excluded occupants are never traversed.
- **Gate:** Classification uses Tier A predicates from `02` §4.
- **Gate:** A marquee commits one enrollment transaction.

## 6. Open

| Open question                                                          | Blocks                        |
|-------------------------------------------------------------------------|--------------------------------|
| Pick radius in display pixels for thin geometry and outlines            | Tuning only                    |
| Whether component selection includes edges and vertices, or faces only  | `12` enrollment shape          |
| Whether marquee containment is against the extent or the topology       | Cost; correctness unaffected   |
