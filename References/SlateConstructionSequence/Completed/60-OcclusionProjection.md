# 60 — OcclusionProjection

`18` integrates incident radiance from `44`'s illuminants and, on its own, integrates it as though nothing stood
between the illuminant and the surface. This document resolves what stands between. It owns both occlusion terms
Slate has — the per-illuminant occlusion that attenuates the direct term, and the scalar ambient occlusion that
attenuates the ambient term — and it keeps them separate, because they are different questions with different
answers.

## Position In The Sequence

| Field       | Value                                                                                            |
|-------------|---------------------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                                |
| Layer       | `Layer4_Compute`                                                                                  |
| Upstream    | `02` (sampling, rebasing), `06` (device), `08` (ordering), `16` (partitions, depth), `44` (illuminants) |
| Downstream  | `18` attenuates its direct term and its ambient term with what is written here                    |
| Unblocks    | Shadows                                                                                           |

## 1. The Components

| Component                | What it owns                                                              |
|--------------------------|----------------------------------------------------------------------------|
| `OcclusionProjection`    | One illuminant's occlusion projection — its extent, its depth, its rebuild |
| `OcclusionIndex`         | Which projection each enrolled illuminant occupies — §4                    |
| `AmbientOcclusionSequence` | The screen-space ambient term — §5                                       |
| `OcclusionMetrics`        | Projection count, rebuild count and truncation, reported through `86`      |

## 2. Two Terms, Not One

| Term       | Answers                                                    | Attenuates          | Written to               |
|------------|------------------------------------------------------------|---------------------|---------------------------|
| Direct     | Is *this illuminant* visible from this position             | `18` §4's direct    | `DirectOcclusionSurface`  |
| Ambient    | How much of the hemisphere is closed at this position       | `18` §5's ambient   | `OcclusionSurface`        |

🔴 The two are never merged into one scalar. A single occlusion value applied to both terms darkens a surface in
shadow twice — once because the illuminant is hidden and once because the geometry hiding it also closes the
hemisphere — and the artist sees contact regions that go black while everything around them is correctly lit.

⚠️ Both terms are **scalar**. `18` §7 declares that no bent orientation is produced and nothing consumes one;
this document is the producer that declaration binds. A bent orientation's only consumer was indirect lighting,
and `00` §5.1 declares indirect lighting absent.

Authored occlusion — `18`'s channel 6 — and the ambient term written here **multiply**. `18` §5 states this from
the consuming side, and the reason it is a product rather than a choice is that they describe different scales:
channel 6 is detail the topology does not carry, and this document resolves contact the topology does carry.

## 3. The Direct Term

Every illuminant `44` §2 enrolls for occlusion receives one projection, whose shape follows the illuminant's
emission shape from `44` §3.

| Emission shape | Projection                                 | Extent driven by                     |
|----------------|--------------------------------------------|---------------------------------------|
| Point          | Six faces about the position               | The declared extent — `44` §2         |
| Directional    | Parallel, subdivided by view distance      | The camera's resolved depth range     |
| Spot           | One projection within the declared cone    | The cone angle and the extent         |
| Extended       | One projection along the shape's axis      | The extent; the shape drives softness |

An illuminant not enrolled for occlusion receives no projection and is integrated by `18` unattenuated. 🔴 That
is a declared behaviour and not a failure — an artist lighting a workspace with six fill illuminants does not
want six projections, and `44` §2 gives them the switch rather than making them delete the illuminant.

### 3.1 What `18` reads

`DirectOcclusionSurface` carries one visibility value per illuminant per pixel, at the display extent, packed by
`OcclusionIndex` position. `18` reads one value per pixel and recovers the visibility of every illuminant that
reaches that pixel.

🔴 The set that reaches a pixel is `44` §5's `IlluminantIndex`, not the whole population. `18` integrates that
set and this document projects that set, so the two never disagree about which illuminant occupies which
position.

⚠️ The packed capacity is finite and `44` §9 already carries the open row for it. When the reaching set exceeds
the capacity, the excess illuminants are integrated **unattenuated** and the truncation is reported through `86`.
Dropping them instead would make an over-lit region go dark, which reads as a defect; leaving them unshadowed
reads as missing shadow, which is what it is.

### 3.2 Softness

An emission shape has a non-zero size — `44` §3 — so its occlusion has a penumbra. Width is resolved from the
declared size and the occluder distance, and is filtered over a sample set from `02` §6's low-discrepancy planar
pattern.

🔴 The sample pattern is `02` §6's and is not invented here. `64` accumulates `RadianceSurface` across rotations,
so an occlusion term sampled from a pattern that is not progressive converges to a different value than the one
`64` assumes it is averaging.

## 4. Rebuild — What Invalidates A Projection

A projection is world-referred. It is rebuilt when what it sees changes, and not otherwise.

| What changed                    | Rebuilt                                            |
|---------------------------------|-----------------------------------------------------|
| An illuminant moved or resized  | Its own projection only                            |
| An occupant moved               | Every projection whose extent reaches it           |
| The camera moved                | Nothing for point, spot or extended shapes         |
| The camera moved                | The directional subdivision only — §3's extent row |
| Radiant intensity changed       | Nothing — `44` §2's extent is declared, not derived |
| An occupant was painted         | Nothing — occlusion reads topology, not channels   |

🔴 A camera move rebuilds nothing but the directional subdivision, and a paint stroke rebuilds nothing at all.
These are the two things the artist does constantly, and a projection set that rebuilds on either is a workspace
that stutters while being used rather than while being changed.

⚠️ The last row holds only because occlusion reads topology. A cutout occupant is the exception, and `62` §2 declares it: cutout coverage is resolved at `16` §3.1, so a cutout occupant already occludes correctly here, and a change to its coverage channel does rebuild the projections that reach it.

## 5. The Ambient Term

`OcclusionSurface` is resolved in screen space from `16`'s `DepthSurface`, at half extent as `08` §2 declares.
Positions are reconstructed as `18` §1 reconstructs them, from depth and pixel position, and the hemisphere is
sampled over `02` §6's planar pattern.

🔴 It is resolved at half extent and read at display extent, so it is upsampled with a depth-aware weighting.
A bilinear upsample crosses depth discontinuities and pulls the occlusion of a background surface onto a
foreground silhouette, which is visible as a dark fringe around every object.

⚠️ Screen space is a declared limitation, not an approximation to be improved silently. What is off screen does
not occlude, and a surface that leaves the workspace edge brightens. `86` does not report this; it is a property
of the term, and `00` §5.1's substitution accounting is where it belongs.

## 6. Ordering

`60` records at `08` §3 ③ — after `16` produced `DepthSurface`, before `18` reads either term. It produces
`OcclusionSurface` and `DirectOcclusionSurface` and amends neither.

Nothing here reads `RadianceSurface`. Occlusion is a visibility question and is resolved before anything is
shaded; a term that read shading would be a one-rotation-stale term, and its staleness would be visible exactly
when the illuminant moves.

## 7. Precision

| Computation                        | Tier | Reason                                                        |
|------------------------------------|------|----------------------------------------------------------------|
| Illuminant and occupant identity   | A    | An integer; a mismatch attenuates the wrong illuminant        |
| `OcclusionIndex` position          | A    | An integer ordinal; `18` unpacks by position                  |
| Projection depth and comparison    | B    | Continuous; rebased per `02` §3.2 before narrowing            |
| Penumbra width and filtering       | B    | Continuous over the declared emission size                    |
| Ambient hemisphere accumulation    | D    | Perceptual; it attenuates a Tier D term and claims nothing more |

🔴 Depth comparison is Tier B and the comparison offset is declared in `Contract/`, never as a literal at the
comparison site. `02` §8 gates tolerance literals outside `Contract/`, and a shadow comparison offset is the
single most-tuned tolerance in any renderer — one written at the site is one that is tuned in six places.

## 8. Gates

- **Gate:** The direct and ambient terms are separate values and are never merged into one scalar.
- **Gate:** Both terms are scalar; no bent orientation is produced.
- **Gate:** The authored channel 6 and the resolved ambient term multiply.
- **Gate:** Every occlusion-enrolled illuminant of `44` receives exactly one projection.
- **Gate:** An illuminant not enrolled is integrated unattenuated, by declaration.
- **Gate:** `DirectOcclusionSurface` is packed by `OcclusionIndex` position, and `18` unpacks by that position.
- **Gate:** The reaching set is `44` §5's, not the population.
- **Gate:** Truncation integrates the excess unattenuated and reports through `86`.
- **Gate:** Sample patterns are `02` §6's, progressive, never invented here.
- **Gate:** A camera move rebuilds only the directional subdivision; a paint stroke rebuilds nothing.
- **Gate:** The ambient term is upsampled with depth-aware weighting, never bilinearly.
- **Gate:** Nothing here reads `RadianceSurface`.
- **Gate:** The depth comparison offset lives in `Contract/`.

## 9. Open

| Open question                                                              | Blocks                          |
|-----------------------------------------------------------------------------|----------------------------------|
| Projection extents, and whether they are declared or derived from the extent | Memory; measure                 |
| How many subdivisions the directional shape carries                         | Quality against memory          |
| Packed capacity of `DirectOcclusionSurface` — `44` §9 carries the same row   | `86` reports truncation either way |
| Whether the ambient term stays half extent — `08` §7 carries the same row    | Tuning                          |
| Whether the ambient term jitters per rotation and relies on `64`             | `64` owns the resolve           |
| Whether an extended shape's occlusion is resolved from its axis or its area  | Quality; cost is the difference |
