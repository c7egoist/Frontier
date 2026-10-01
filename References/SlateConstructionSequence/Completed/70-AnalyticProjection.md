# 70 — AnalyticProjection

Some content is a description rather than texels: an outline, a repeating pattern, a placed source with a
transform. `20` §2.1 names this as the third reconstruction source for a promoted tile, and its cost is bounded by
resolution work rather than by transfer. This document is what performs that resolution.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (`LatticeProjection`, `PlanarClassifier`), `20` (tiles, budget), `52`, `54`, `56`, `72` |
| Downstream  | `20` promotes what it resolves; `18` samples it; `82` previews through it     |
| Unblocks    | Resolution-free sources resolved at promotion                                 |

## 1. Resolution Happens At Promotion

🔴 Analytic content is resolved when a tile is promoted, at that tile's reduction level, into that tile. It is not
resolved per rotation, not per pixel, and not into a resolution-independent representation that is then sampled.

| Consequence                                               | Why it follows                                |
|-----------------------------------------------------------|------------------------------------------------|
| A finer level is a **re-resolution**, not a magnification | The source has no resolution to magnify        |
| Cost is per promoted tile, not per displayed pixel        | `20` §2.2's cost budget bounds it              |
| `18` samples texels and knows nothing analytic            | `18` §8 — channels are read resolved           |

⚠️ This is the mechanism behind `20` §4's evictability claim. Resolved analytic texels are legally reconstructible
from the source and the transform, so they belong in `SurfaceDepot` and may be discarded under pressure. Painted
texels may not, because for them the texels *are* the authored content.

## 2. What Is Re-Resolved, And When

`00` §10.1 ② is the authority and is not restated differently here. The mechanism this document supplies is the
comparison:

- Each analytic layer carries a revision counter, advanced only when its declared inputs change.
- Each resident tile records the counters it was resolved from.
- Promotion compares counters. Equal means the resolved texels stand.

🔴 The comparison is an integer test at Tier A, per tile, not per pixel. A camera move advances no counter and a
moved occupant advances no counter — a placement's transform is stored relative to the surface it is attached to,
so composing the occupant's transform changes nothing the resolution reads.

⚠️ This is the specific trap the design was checked against: resolving every rotation is correct and unaffordable,
and resolving never is affordable and wrong. Neither is what happens. What happens is a counter comparison whose
answer is almost always "no work".

## 3. Sources

| Source            | Declared in | Resolved by                                                       |
|-------------------|-------------|--------------------------------------------------------------------|
| Vector outline    | `52`        | Flatten to the level's tolerance, then classify interior           |
| Repeating pattern | `54`        | `LatticeProjection` to a cell, then resolve cell content           |
| Placed content    | `72`        | Transform the domain position into the source space, then resolve |
| Text              | `52` + `72` | Glyph outlines resolved as outlines, positioned by the sequence   |
| Imagery           | `50` + `72` | Sample the decoded image through the placement transform          |

🔴 Placed content is not a fourth mechanism. `72` supplies a transform from the surface domain into a source's own
space; the source is then one of the four above. This is why text, imagery, vector content and tiling all place
identically and why `72` needs no per-source placement path.

## 4. Host And Device Agreement

Every analytic source resolves on **both** the host and the device — the device for `20`'s promotion, the host for
`82`'s preview and for `74`'s intersection against placed content. `00` §11 gates this at Tier B through
`ParityRunner`.

⚠️ Where the two disagree the artist blames the preview, because the preview is the thing that looks provisional.
The defect is then attributed to the wrong subsystem for as long as it takes someone to check.

## 5. Coarse Then Refine

Analytic content **may** resolve coarse and be refined later. `22` §2 forbids exactly this for painted impressions
and the distinction is the same one throughout: paint applied at the wrong resolution is authored content that is
permanently wrong, while analytic content re-resolved at a finer level simply replaces itself.

## 6. Gates

- **Gate:** Resolution happens at promotion, at the promoted level, into the tile.
- **Gate:** Nothing is re-resolved without its counter having advanced.
- **Gate:** Counter comparison is Tier A and per tile.
- **Gate:** A camera move and an attached occupant's move both re-resolve nothing.
- **Gate:** Every source resolves identically on host and device, proven at Tier B.
- **Gate:** Resolved analytic texels are always evictable.
- **Gate:** Placed content is a transform into a source space, never a separate resolution path.
- **Gate:** Resolution cost is reported to `20`'s budget, per tile.

## 7. Open

| Open question                                                          | Blocks                        |
|-------------------------------------------------------------------------|--------------------------------|
| Per-slot resolution-cost budget                                     | Tuning; measure                |
| Whether resolution runs in the same recording as promotion transfer     | `08` recording count only      |
| Whether a deep analytic layer sequence is flattened after a threshold   | Cost only; correctness unaffected |
