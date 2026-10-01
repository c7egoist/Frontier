# 100 — ExtremumSpace

`94` §2's `ClassifyOcclusion` is the only seam that touches a ray, and at `ScreenTraced` there is no ray to touch.
This document is what answers instead: a hierarchical **maximum** over reversed depth, marched in screen space,
plus a small depth atlas for the illuminants that matter most.

It is why the whole branch runs on hardware with no traversal capability at all — which is most of the hardware a
painting application is opened on.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (sampling), `06` (extents), `08` (ordering), `16` (`DepthSurface`), `44` (the population), `60` (the projections it reuses), `90` (the capability), `96`, `98` |
| Downstream  | `94` §2's `ClassifyOcclusion` at `ScreenTraced`; `94` §6's indirect march there |
| Unblocks    | Resampled lighting on hardware that cannot trace                              |

## 1. 🔴 The Existing Reduction Is The Wrong Extremum

`DepthReduction` exists, is built, and reduces `16`'s depth into a hierarchical **minimum**. Its own header states
why that is correct for occlusion culling over reversed depth: the least ordinate across a region is its furthest
point, so a partition whose nearest ordinate falls below it cannot reach past anything already recorded there. The
header also names the defect of getting it backwards — geometry flickering along its own silhouette.

A ray marching the same chain wants the opposite. To skip a region without stepping through it, the march needs
the region's **nearest** point, which over reversed depth is the **maximum**. The existing chain cannot answer
that, and must not be adapted to: `16`'s culling depends on its conservatism running in exactly the direction it
does.

🔴 This document therefore holds a **second chain**, reducing by maximum, and `16`'s `DepthReduction` is not
amended, not read, and not shared with. Two chains over one depth target is the honest cost of the two questions
being genuinely different.

⚠️ This is invisible from every document in the series and was found only in the source. A plan that says "reuse
the depth pyramid `16` already builds" is describing a chain that answers the wrong question, and the resulting
march would skip past surfaces it should have hit — light leaking through geometry, on the capability that can
least afford it.

## 2. The Chain

Structurally the same as `DepthReduction`: levels halving on both ordinates, rounding **up**, from the display
extent down to a single texel, bounded by `ReductionLevelCeiling` of sixteen.

| Property           | `16`'s `DepthReduction`                | This document's chain                     |
|--------------------|-----------------------------------------|--------------------------------------------|
| Reduced by         | Minimum — the furthest point            | Maximum — the nearest point                |
| Answers            | Can this partition be skipped           | Can this ray step over this region         |
| Read by            | `16` §2's two culling phases            | §3's march, and §5's probe directions      |
| Levels             | Finest is display extent                | 🔴 Finest is **half** extent — §3          |

🔴 The finest level is at half extent, matching `08` §2's extent for `OcclusionSurface` and `ReflectionSurface`.
`30` §2 ③ already marches `DepthSurface` at half extent and states the reason: the extent is where the cost lives.
A contact-scale march is the one case that wants finer, and §3 ④ handles it without a finer chain.

## 3. The March

`94` §2's `ClassifyOcclusion` at `ScreenTraced`, in four steps:

| ① | The illuminant depth atlas is sampled at the shading position — §4                             |
| ② | Where the atlas answers occluded, that is the answer; no march runs                            |
| ③ | Where it answers visible, the chain is marched from the surface toward the illuminant, descending a level on a near miss and ascending on a clear one |
| ④ | The final few steps run at the finest level for contact scale, bounded by a declared step count |

⚠️ Step ② is what makes this affordable. The atlas resolves the large-scale occlusion — one object shadowing
another — and the march resolves only what the atlas's resolution cannot express, which is contact scale. A march
asked to resolve both would need the step count of the whole scene extent.

🔴 A march that leaves the extent answers **visible**, not occluded. `30` §3's table makes every screen-trace
failure a weight of nothing precisely because failure must be free and invisible; the same rule applies here with
the opposite polarity. Answering occluded on leaving the screen darkens every surface near the display edge, and
the artist meets it as a vignette that moves when they orbit.

## 4. The Illuminant Depth Atlas

🔴 Not a new mechanism. `60` §3 already builds one occlusion projection per occlusion-enrolled illuminant, shaped
by its emission shape, with a rebuild table tuned so that a camera move rebuilds only the directional subdivision
and a paint stroke rebuilds nothing. `60` is **retained in full** at `ScreenTraced` — `90` §5's substitution table
says so — and this document reads its projections rather than building a second set.

| What this document adds                     | Why `60` does not already do it                            |
|---------------------------------------------|-------------------------------------------------------------|
| A tiled arrangement over the most significant illuminants | `60` writes `DirectOcclusionSurface`, capped at four |
| Round-robin refresh, a few tiles per rotation | `60` rebuilds on change; this bounds the per-slot cost |
| A sampling routine `94` §2 calls per candidate | `60`'s consumer is `18`, reading a packed per-pixel value  |

🔴 `DirectOcclusionSurface`'s cap of four — `DirectOcclusionCapacity` in `Contract/ToleranceContract.h` — is
exactly what this branch removes, and removing it at `ScreenTraced` too is what makes the branch a capability
substitution rather than a capability requirement. `94` §3 ⑥ queries visibility for **one** retained candidate,
and one query needs no packed capacity at all.

⚠️ The atlas holds the most significant illuminants and not all of them. Significance is by radiant intensity
scaled by the fraction of the display its extent reaches. An illuminant outside the atlas is resampled
unshadowed — `60` §3.1's existing rule, which integrates the excess unattenuated and reports through `86`, rather
than dropping it. Dropping makes an over-lit region go dark, which reads as a defect; leaving it unshadowed reads
as missing shadow, which is what it is.

## 5. The Screen-Traced Indirect Term

`94` §6's path trace, with `92`'s structure replaced by this chain: probe directions march the chain, and on a
miss fall through to `96`'s store and then to `28`'s sky-view radiance — `96` §4's chain, unchanged.

🔴 Probe directions are **`94`'s indirect reservoirs at a coarser extent**, not a separate mechanism. `94` §1's
one-core decision applies here: a screen-space probe lattice with its own reservoirs, its own reprojection and its
own reuse rules would be the second renderer that document exists to prevent. What changes is the extent and
`ClassifyOcclusion`; everything else is the same source.

⚠️ Reflective depth injection into `96` — writing what the illuminant projections themselves see, so the store
holds content the camera never resolved — is **not built**. It has no consumer beyond quality, `96`'s decay would
have to distinguish injected from traced entries, and neither is worth carrying before a measurement. §6 records
it as open.

### 5.1 Named failure modes

Stated so they are recognised rather than debugged, and so `ScreenTraced` is never mistaken for the reference.

| Failure                                          | Cause                                          |
|--------------------------------------------------|-------------------------------------------------|
| Off-screen geometry contributes no indirect light | The march has nothing to hit; `96` answers coarsely |
| Contact shadows from off-screen occluders absent  | Same                                            |
| Grazing reflections degrade to the store          | The march leaves the extent almost immediately  |
| Light leaks through geometry thinner than a cell  | `96`'s cell extent, not the march               |

🔴 `ScreenTraced` is the compatibility capability and never the reference. `102`'s reconstruction and `64`'s
accumulation both converge toward whatever this produces, so a defect here is a defect the artist sees converge
into sharpness rather than one that averages away.

## 6. Precision

| Computation                   | Tier | Reason                                                          |
|-------------------------------|------|------------------------------------------------------------------|
| Chain level arithmetic        | A    | Integer halving and an integer logarithm, as `DepthReduction`'s is |
| The march step and crossing   | B    | Continuous; the crossing bound is declared in `Contract/`         |
| The atlas comparison offset   | B    | 🔴 `60` §7's offset, in `Contract/`, and never a second one       |
| Probe reservoir members       | As `92` §6 declares                                               |

🔴 The comparison offset is `60`'s and is read from `Contract/`. `60` §7 names it the most-tuned tolerance in any
renderer and `02` §8 gates tolerance literals outside `Contract/`. A second offset declared here would be tuned
separately and disagree with `60` on exactly the surfaces both touch.

## 7. Gates

- **Gate:** This chain reduces by **maximum**; `16`'s `DepthReduction` reduces by minimum and is not amended.
- **Gate:** The finest level is at half extent.
- **Gate:** A march leaving the extent answers visible, never occluded.
- **Gate:** The atlas reads `60`'s existing projections and builds no second projection set.
- **Gate:** An illuminant outside the atlas is resampled unshadowed and reported through `86` — `60` §3.1's rule.
- **Gate:** `DirectOcclusionSurface`'s packed capacity is not read by anything in this branch.
- **Gate:** Screen-traced indirect uses `94`'s reservoirs at a coarser extent, with no reuse rules of its own.
- **Gate:** The depth comparison offset is `60`'s, from `Contract/`.
- **Gate:** Sample patterns are `02` §6's and `104`'s, never invented here.
- **Gate:** This document is substituted away entirely above `ScreenTraced` — `90` §5.

## 8. Open

| Open question                                                          | Blocks                             |
|-------------------------------------------------------------------------|-------------------------------------|
| March step count, and the contact-scale step count at the finest level  | Quality against cost; measure       |
| Atlas tile count and how many refresh per rotation                      | 💾 Budget; `86` reports truncation  |
| Whether reflective depth injection into `96` is ever built              | §5's note; quality only             |
| Whether the probe lattice extent is a quarter or an eighth              | Quality against cost                |
| Whether `ScreenTraced` indirect ships at all, or only its direct term    | `94` §11 carries the same row       |
