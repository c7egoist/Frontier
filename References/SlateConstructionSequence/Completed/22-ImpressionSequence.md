# 22 — ImpressionSequence

A stroke is an ordered sequence of resolved brush impressions against a surface's parametric domain. It is
recorded in the domain, committed as a transaction, and undone by its inverse — which means a stroke survives a
change of working resolution, and undoing one costs the extents it touched rather than the surface it touched.

⚠️ `Stamp` is banned. One resolved brush placement is an `ImpressionSample`.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Units       | `SlateCompute.lib` (resolution), `SlateDocument.lib` (persistence)              |
| Layers      | `Layer4_Compute`, `Layer3_Document`                                             |
| Upstream    | `04` (timestamped input), `10` (transactions), `20` (the domain), `56` (layers), `58` (the brush), `74` (intersection), `76` (intent) |
| Downstream  | `18` samples the result; `24` transfers it                                      |
| Unblocks    | Painting that persists, undoes and survives a resolution change                 |

## 1. From Input To Impressions

① `14` delivers intent carrying arrival timestamps from `04`, plus pressure, tilt and rotation where reported.
② The pointer path is projected into the surface's parametric domain through `74`'s resolved intersection — the
   artist paints on the surface under the cursor, and that surface is known exactly because the intersection is
   Tier A.

🔴 Step ② resolves on the **host**, against `40`'s spatial subdivision. It does not read back `16`'s
`VisibilityIndex`. Readback is latent by the recording slot count — `20` §2.1 ② — which is tens of milliseconds, while a
stylus reports at hundreds of samples per second. A path resampled against identities that arrive that late is
resampled against where the cursor used to be.
③ The path is resampled at a spacing set by the brush, in the domain, independent of input sample rate.
④ Each resample yields one `ImpressionSample`: domain position, radius, rotation, and the resolved dynamics.

🔴 Step ③ uses arrival timestamps. A path resampled against consumption times has the display rate baked into it,
so the same physical gesture produces different strokes on different machines. This is why `04` §3 timestamps at
arrival and why `14` §4 carries those timestamps through unmodified.

Absent axes stay absent. A tablet reporting no tilt and a stylus held upright are different facts, and a brush
driven by tilt must fall back rather than read a fabricated zero.

## 2. Impression Resolution

Each impression is resolved against the tiles backing the cells it covers. The apron from `20` §1 means an
impression crossing a tile edge is resolved without a residency check per texel.

An impression touching a non-resident cell **demands and defers**. It is not dropped and not resolved against the
coarse level: paint applied at the wrong resolution is authored content that is permanently wrong, unlike a
display sample which is merely briefly coarse.

🔴 This rule binds **painted impressions only**. It does not bind derived content. Placed content and tiling
resolve through `70` at whatever level is promoted, may resolve coarse and refine later, and are re-resolved
rather than corrected — because for them the authored thing is the source and the transform, not the texels. A
document that applies the never-coarse rule to derived content has misread which content is authored.

## 3. Composition Order

Impressions within a stroke compose in sequence order. The banned word here is unavoidable in prose and absent
from every identifier: the operation is `ImpressionSequence` applying `CombineSpecification`.

| Specification | Effect                                              |
|---------------|------------------------------------------------------|
| Over          | Standard source-over with impression coverage       |
| Additive      | Accumulates without coverage limiting               |
| Multiply      | Attenuates the destination                          |
| Replace       | Overwrites within coverage                          |
| Erase         | Reduces coverage                                    |

A stroke resolves into an accumulation extent first, then applies once to the surface. Applying per impression
lets overlapping impressions within one stroke double-darken at their intersections, which is visible wherever an
artist slows down.

## 4. Transactions

One stroke is one transaction in `RevisionSequence`. The inverse records the prior contents of the touched
extents only — bounded by the stroke, not by the surface. This is why `10` §2.3 requires transactions to carry
inverses rather than snapshots.

A stroke in progress is not yet a transaction. It is committed on release, and only then may its tiles become
eligible for eviction under `20` §4.

### 4.1 The speculative extent

A stroke in progress is one instance of a general need: resolving content into the domain so the artist can see it,
where that resolution will **never** become a transaction. Declared once here and consumed by `58`, `72`, `78`
and `82`, because four documents inventing it separately would produce four behaviours.

| Consumer                          | What is speculative                                  |
|-----------------------------------|-------------------------------------------------------|
| A stroke in progress              | Impressions before release                            |
| Brush preview under the cursor    | The impression the artist is about to apply           |
| Placed content being positioned   | The placement under the manipulator, before release   |
| A parameter being dragged         | The result at the current value                       |

🔴 A speculative extent is display-only, is discarded and re-resolved each rotation, never enters
`RevisionSequence`, and — unlike an uncommitted stroke — **never blocks eviction**. Without that last property, a
brush preview would pin every tile the cursor passed over, and hovering across a surface would exhaust residency
without the artist painting anything.

⚠️ A speculative extent **may** resolve coarse and refine, which the §2 rule forbids for committed paint. The
distinction is the same one `20` §4 draws: nothing speculative is authored content, so nothing speculative can be
permanently wrong. On release the content is resolved properly and committed as one transaction.

## 5. Channels

A stroke targets one or more of `18`'s twenty channels, declared by the brush in `58`. Painting base colour and
roughness in one stroke is one transaction touching two channel surfaces, not two transactions — undo restores
both, which is what the artist performed.

The brush is declared in `58` and held by `76`, not by this document and not by the interface. `22` resolves a
stroke against whatever brush is active; it does not own the brush, its parameters or its presets.

⚠️ Every reference to "the brush" in this document resolves to `58`. Before `58` existed those references named
nothing, which is recorded as `00` §10 conflict 12.

## 6. Gates

- **Gate:** Impressions address the parametric domain, never resident texels directly.
- **Gate:** Path resampling uses arrival timestamps.
- **Gate:** Absent input axes remain distinguishable from zero.
- **Gate:** A painted impression on a non-resident cell demands and defers; it is never resolved coarse.
- **Gate:** A speculative extent never commits, never blocks eviction, and never enters `RevisionSequence`.
- **Gate:** A stroke accumulates once and applies once.
- **Gate:** One stroke is one transaction with an extent-bounded inverse.
- **Gate:** Multi-channel strokes are a single transaction.
- **Gate:** No tile holding an uncommitted stroke is evicted.

## 7. Open

| Open question                                                     | Blocks                    |
|---------------------------------------------------------------------|----------------------------|
| Whether impression spacing is domain-relative or screen-relative     | Brush behaviour, not design|
| Whether a stroke may span more than one surface                      | `24` seam handling         |
| Smoothing of the resampled path, and whether it is a brush parameter | Nothing structural         |
