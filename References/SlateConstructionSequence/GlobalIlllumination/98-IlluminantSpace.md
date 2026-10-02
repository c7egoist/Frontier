# 98 — IlluminantSpace

`44` §5's `IlluminantIndex` records which illuminants reach a **partition of `16`**, and `16` partitions only what
the camera resolved. A secondary vertex is not a partition of `16` — it is a position on geometry that may never
have been rasterised, off screen, behind the camera, or facing away. Nothing in the engine can answer "which
illuminants reach here" for such a position.

This document answers it. A world-space subdivision holding, per cell, a small retained reservoir over the
illuminants whose declared extents reach that cell.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (rebasing), `06` (extents), `44` (the population and the declared extents), `92` (the recording slot count), `104` (the sequence) |
| Downstream  | `94` §6 ② resamples a secondary vertex's direct term against a cell           |
| Unblocks    | A secondary vertex that is lit by the same population the primary one is      |

## 1. Why This Is Not `44` §5

| | `44` §5's `IlluminantIndex`                | `98`'s cells                                    |
|---|---------------------------------------------|--------------------------------------------------|
| Keyed by | A partition of `16`                     | A world-space cell                              |
| Populated for | Geometry the camera resolved       | Everywhere the illuminant extents reach         |
| Holds | Which illuminants reach                     | A retained reservoir over which illuminants reach |
| Re-derived when | An illuminant or occupant moved   | An illuminant moved, resized, or was enrolled    |

🔴 They are not merged and `44` is not amended. `44` §5's index answers a question about visible geometry and its
re-derivation table is tuned for that — an occupant move re-derives its partitions' entries, and a camera move
re-derives nothing. A world-space subdivision has no partitions to key on and no occupant to attribute a cell to.

⚠️ `44` §5's index is still read, by `18`, for the primary term, unchanged. This document serves secondary
vertices only.

## 2. The Cells

A subdivision over the union of every enrolled illuminant's declared extent, which `44` §2 makes a **declared**
quantity rather than one derived from intensity.

🔴 That declaration is what makes this document cheap. `44` §2's rule — extent is authored, not discovered from
the falloff — means the union is known without evaluating any falloff, an intensity change moves no cell boundary,
and the most common illuminant edit costs nothing here. `44` §5's last row already states this for the visible
index; it holds identically here and for the same reason.

| What changed                    | Re-derived                                        |
|---------------------------------|----------------------------------------------------|
| An illuminant moved or resized  | The cells its prior and its current extent reach   |
| Radiant intensity changed       | Nothing                                            |
| Occlusion enrollment changed    | Nothing — this document stores no visibility       |
| An occupant moved               | Nothing — cells are over illuminants, not geometry |
| The camera moved                | Nothing                                            |
| An illuminant was added or removed | The cells its extent reaches                    |

⚠️ The fourth row is the difference from `44` §5 that matters. An occupant move re-derives `44`'s index and
re-derives nothing here, because a cell is a statement about which illuminants *reach a place*, and moving
geometry does not move a place.

## 3. What A Cell Holds

One retained reservoir, of the same species `92` §2 declares, over the illuminants reaching that cell — plus the
reaching count, so a cell that reaches nothing is distinguishable from one that has not been derived.

🔴 A **reservoir** and not a list. A list of the reaching set would be a second copy of `44`'s data at world
resolution, and a cell in a scene with many overlapping illuminants would carry an unbounded one. A reservoir is
fixed-size by construction and already holds the resampled choice `94` §6 ② needs, so the secondary vertex reads a
choice rather than resampling a list it would have to walk.

⚠️ The cell reservoir is refreshed a few cells per rotation, round-robin, rather than every cell every rotation.
A cell's reservoir is a coarse spatial statement and does not need to converge at the rotation rate; refreshing
everything would make this document's cost scale with the scene's extent rather than with the display's.

## 4. What Is Deliberately Absent

| Absent                            | Why                                                        |
|-----------------------------------|-------------------------------------------------------------|
| Visibility, of any sort           | `94` §2's `ClassifyOcclusion` answers it at the vertex      |
| Stored radiance                   | That is `96`; a cell holds a choice, not a measurement      |
| Any occupant reference            | Cells are over illuminants; §2's fourth row depends on it   |
| A per-cell cycle slot          | The refresh is round-robin, so there is nothing to reproject |

🔴 The first row is the one worth stating twice. A cell that stored visibility would be a coarse shadow map at
world resolution, invalidated by every occupant move — which is exactly the invalidation `60` §4 works to avoid,
reintroduced at a resolution where it is more expensive and less correct.

## 5. Precision

| Computation                    | Tier | Reason                                                         |
|--------------------------------|------|-----------------------------------------------------------------|
| Cell resolution from a position| A    | An integer subdivision; host and device must resolve identically |
| Position rebasing              | B    | `02` §3.2, before any narrowing                                |
| The reservoir's stored weights | B    | As `92` §6 declares them                                       |
| `ChosenIlluminant`             | A    | An identity pair                                               |

## 6. Ordering

`98` contributes one recording, before `94`'s indirect recording and after its direct one. It produces the cell
extent and amends nothing. `ScheduleAmendment.md` §3 carries the position.

⚠️ It is recorded even at `ScreenTraced`, where `100` §5's screen-traced indirect reads it for the same reason —
a probe direction that marches off the extremum chain needs a lit answer, and the cell reservoir is that answer.
It is substituted away only where no indirect term is produced at all.

## 7. Gates

- **Gate:** `44` §5's index is not amended, merged, or replaced; `18`'s primary term reads it unchanged.
- **Gate:** Cells are derived over `44` §2's **declared** extents, never over a falloff threshold.
- **Gate:** An intensity change re-derives nothing.
- **Gate:** An occupant move re-derives nothing.
- **Gate:** A cell holds a reservoir, never a list of the reaching set.
- **Gate:** No cell stores visibility, radiance, or an occupant reference.
- **Gate:** The refresh is round-robin and bounded per rotation.
- **Gate:** Positions are rebased in 64-bit before cell resolution.
- **Gate:** Cell resolution is Tier A and lives in `Shared/`.

## 8. Open

| Open question                                                        | Blocks                              |
|-----------------------------------------------------------------------|--------------------------------------|
| Cell extent, and whether it is uniform or grows as `96`'s does        | 💾 Budget; `96` §8 carries the shape |
| Cells refreshed per rotation                                          | Convergence against cost             |
| Whether a cell's reservoir is one reservoir or one per orientation cone | Quality; `96` keys by cone and this may need to |
| Whether an illuminant enrolled to light a subset changes the cells     | `44` §9 carries the same row         |
