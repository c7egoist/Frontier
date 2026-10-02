# 94 — ResamplingSequence

One resampling core, three specialised functions, four capability permutations. Weighted reservoir sampling, the
temporal rule, the spatial rule, the tally ceiling, the multiple-importance weight and the pairwise combination
are **identical** at every traversal capability. What differs is exactly three functions, and this document exists
to keep it at three.

🔴 That is the load-bearing decision. Three renderers maintained in parallel diverge within a release, and the
divergence appears as an image that changes when the artist opens the same document on a different machine. One
renderer with three specialised seams cannot.

## Position In The Sequence

| Field       | Value                                                                              |
|-------------|-------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                  |
| Layer       | `Layer4_Compute`                                                                    |
| Upstream    | `02` (quadrature, sampling), `16` (identity, pixel lists, `MotionSurface`), `18` (the reflectance source), `42` (materials), `44` (the reaching set), `56` (layer content), `90` (the capability), `92` (reservoirs, the structure), `96`, `98`, `100`, `104` |
| Downstream  | `18` reads the resampled direct term and the reconstructed indirect; `96` is injected into; `102` reconstructs |
| Unblocks    | Direct light without a four-illuminant cap; indirect light at all                   |

## 1. The Core, And What It Is Not

Weighted reservoir sampling accumulates candidates into a fixed-size reservoir such that the retained candidate is
distributed proportionally to a target density `p̂`, without storing the candidates. That is the whole mechanism,
and it is thirty lines.

```cpp
/// 🧩 Accumulates one candidate into a reservoir by weighted reservoir sampling; replaces on ξ < wᵢ / WeightSum.
/// in    ActiveReservoir  [-]  amended in place; a vacant reservoir is a legal input
/// in    Candidate        [-]  the illuminant and the position on its emission shape
/// in    CandidateWeight  [-]  wᵢ = p̂(candidate) / p(candidate); a zero weight is absorbed, never skipped
/// in    ξ                [-]  uniform on [0,1), from `104`'s decorrelated sequence
/// out   Replaced         [-]  the candidate became the retained one
/// err   never refuses; a non-finite weight is bounded and reported through `86`
/// cost  ✔️
/// pre   CandidateWeight ≥ 0 and finite
/// post  ActiveReservoir.CandidateTally increased by exactly one
/// tag   device, shared, nonallocating, nonthrowing
SLATE_SHARED bool Accumulate(SLATE_INOUT(DirectReservoir) ActiveReservoir,
                             IlluminantCandidate          Candidate,
                             Real32                       CandidateWeight,
                             Real64                       ξ);
```

🔴 A zero-weight candidate is **absorbed and not skipped**. Skipping it leaves `CandidateTally` describing fewer
candidates than were drawn, every downstream multiple-importance weight is then computed against a tally that is
too small, and the image is uniformly slightly too bright. It looks like a material being wrong, it survives
review, and it is the single most common defect in this family of algorithms.

⚠️ The candidate is `IlluminantCandidate` and the field is `ChosenIlluminant` — never `Emitter`. `44` names the
population and a second spelling for one concept is `00` §8's warning verbatim.

## 2. The Three Seams

Everything else is one body of source, specialised by a compile-time constant into four permutations. The
specialisation is a constant and not a branch: a runtime branch on a capability that cannot change is the
conditional `VulkanExchange`'s own note forbids.

| Seam                    | `ScreenTraced`                                             | `DriverTraced`                                 | `HardwareTraced`                                |
|-------------------------|-------------------------------------------------------------|------------------------------------------------|--------------------------------------------------|
| `ClassifyOcclusion`     | `100`'s extremum march, plus `60`'s existing projections    | Ray query, terminate on first hit               | The same, in a ray-tracing recording where one was negotiated |
| `ResolveTargetDensity`  | Unshadowed p̂ — reflectance × emitted radiance × geometry    | The same, plus retained-reservoir visibility reuse | The same                                       |
| `ProjectCandidate`      | Reprojection only; the Jacobian is one                      | Single-vertex reconnection, closed-form solid-angle Jacobian | The same, with the extent-derived reconnection bound of §6 |

`ComputeTraced` takes `DriverTraced`'s column with `92` §3's structure traversed in compute rather than by the
driver. It is one seam implementation, not a fourth column.

🔴 `ClassifyOcclusion` is the **only** seam that touches a ray. That is what makes `ScreenTraced` a configuration
of this document rather than a separate renderer: the resampling mathematics never learns whether a visibility
answer came from a traced ray or from a depth march.

## 3. The Direct Term — Where It Runs

🔴 Direct resampling runs **inside `18`'s per-material dispatch** and writes no new resolved target.

`16` §5 already compacts a pixel list per visible material. `18` already dispatches over it, reconstructs
position, orientation and the tangent basis from partition identity and triangle index, and resolves every channel
through `20` and `70`. Everything `p̂` needs is in registers at that moment.

| ① | Read the retained reservoir for this pixel from `92`'s previous cycle slot                    |
| ② | Draw `CandidateDrawCount` candidates from `44` §5's reaching set, through `104`'s sequence        |
| ③ | `Accumulate` each into a fresh reservoir; `p̂` is `ResolveTargetDensity`, unshadowed              |
| ④ | Combine the reprojected retained reservoir into it — §4                                          |
| ⑤ | Combine the spatial neighbours into it, pairwise-weighted — §5                                    |
| ⑥ | `ClassifyOcclusion` **once**, for the retained candidate only                                     |
| ⑦ | Shade it through `Shared/ReflectanceProjection.slang.h`, scaled by `ContributionWeight`           |
| ⑧ | Write the reservoir to this rotation's slot                                                       |

🔴 Step ⑥ is the whole economy of the algorithm. One visibility query per pixel resolves lighting from an
arbitrarily large population, which is what removes `DirectOcclusionCapacity`'s cap of four. `44`'s
`IlluminantReachCapacity` of sixteen still bounds the *reaching set* and is unchanged — the cap this branch
removes is on how many can be **shadowed**, not on how many can reach.

⚠️ Step ⑥ runs **after** the combinations and never during them. Testing visibility per candidate is the naive
arrangement and costs `CandidateDrawCount` rays per pixel, which is the cost this algorithm exists to avoid.

🔴 If step ⑥ answers occluded, the reservoir's `ContributionWeight` is set to nothing and its `CandidateTally` to
one. This is visibility reuse, and without it the temporal chain re-selects an occluded illuminant indefinitely
and produces a stable, confident, wrong shadow — the same defect `92` §4 names from the invalidation side.

## 4. Temporal Combination

Reprojection reads `MotionSurface` and reuses `64` §4's rejection rules **verbatim**, through
`SampleIntegrator::Classify` where the host form is shared and through the same rules on the device.

🔴 It is not a second reprojection mechanism. `64` §8 gates that reprojection is never derived from depth and the
previous camera; a resampling document that derived its own would violate that gate in a second place, and the two
would disagree at exactly the silhouettes where both matter.

| Refused when                                          | Consequence                              |
|-------------------------------------------------------|-------------------------------------------|
| The reprojected position is off the extent            | The reservoir starts fresh, tally one     |
| The occupant identity differs — `16` §4.1             | Same                                      |
| The depth differs beyond `RejectionSpecification`'s bound | Same                                  |

⚠️ The neighbourhood test of `64` §4's fourth row is **not** applied here. It bounds an accumulated radiance
against local values; a reservoir holds a choice rather than a radiance, and there is no neighbourhood of choices
to bound against. `64` applies it downstream where it is meaningful.

🔴 `CandidateTally` saturates at `ResamplingTallyCeiling`, and the ceiling is what bounds temporal correlation. An
unbounded tally makes the retained reservoir so heavy that a change in lighting takes seconds to appear — the same
failure `64` §3's stored-count ceiling exists to prevent, in a different quantity.

## 5. Spatial Combination

Neighbours are drawn from a small disc and combined with a **pairwise multiple-importance weight**, which is
unbiased where the naive uniform weight is not.

🔴 Neighbours are drawn from the **same material's compacted pixel list**, not from the screen neighbourhood.
`18` §1's own reasoning applies unchanged: a material's pixel list is spatially scattered, so neighbouring lanes
are not neighbouring pixels. Reusing across a material boundary combines reservoirs whose target densities were
computed against different reflectance models, and the pairwise weight is derived assuming they were not.

⚠️ This is a real constraint on how the neighbour disc is sampled and it costs a list lookup per neighbour. The
alternative — screen-space neighbours with a material test that rejects most of them — pays for the reservoir read
and then discards it.

`RotationsSurvived` suppresses the correlation that spatial reuse accumulates: two reservoirs that have reused
each other for many rotations are effectively one sample, and combining them again claims a variance reduction
that did not occur.

## 6. The Indirect Term

Recorded separately, at half extent, and it **cannot** be merged with the direct recording.

🔴 `08` §3.2 already gives the reason twice, for `62` and for `80`: a recording that both writes a per-pixel
structure and consumes it has read a target it is still writing. The indirect recording reads the direct
reservoirs the direct recording is still writing. This is the third instance and the schedule's existing gate
covers it without amendment.

| ① | A path is traced from the primary surface through `92`'s structure                        |
| ② | At the secondary vertex, the direct term is resampled by §3's core over `98`'s cell       |
| ③ | The secondary vertex is shaded through `Shared/ReflectanceProjection.slang.h` — the same source `18` uses |
| ④ | On a miss, `96`'s content-keyed store answers; on a miss there, `28`'s sky-view radiance   |
| ⑤ | The result is injected into `96` — `96` §3                                                |

⚠️ Step ③ is the constraint `IlluminationGroundwork` §5 declares. The secondary vertex shades through the same
shared reflectance source as the primary. A simplified second evaluation is how a renderer acquires a first-bounce
look and a second-bounce look that disagree.

At `HardwareTraced`, the reconnection bound is derived from the ray's spread rather than from a fixed distance and
roughness pair. 🔴 A fixed bound produces fireflies on glossy chains — the surface is rough enough to pass the
roughness test and specular enough that the Jacobian is enormous — and a spread-derived bound is what makes the
two conditions one condition instead of two thresholds that must be tuned against each other.

## 7. What `18` Reads

`18`'s `AmbientContribution` already carries `DiffuseComponent`, `SpecularComponent`, `EmissiveComponent` and
`Attenuation`, with the two lit members arriving **already attenuated**. That shape is unchanged; only the source
of the two lit members changes.

| Member                | Source today          | Source after this branch                                        |
|-----------------------|-----------------------|------------------------------------------------------------------|
| `DiffuseComponent`    | `SkyViewSurface`, cosine-convolved | `102`'s reconstructed indirect diffuse, or the sky where absent |
| `SpecularComponent`   | `SkyViewSurface` at the reflection direction | `102`'s reconstructed indirect specular, likewise |
| `EmissiveComponent`   | Channel 7             | Unchanged — never attenuated, and never resampled                |
| `Attenuation`         | Channel 6 × `60`      | Channel 6 only above `ScreenTraced`; `60` is substituted away    |

🔴 `Attenuation`'s change is subtle and matters. `60`'s ambient term attenuates the *sky* ambient because the sky
is an unoccluded hemisphere the surface may not see. A resampled indirect term already accounts for occlusion by
construction — it traced the geometry. Multiplying by `60` a second time is `60` §2's own double-darkening defect,
arriving from the other direction.

⚠️ Channel 6 is **retained** in the product at every capability. It is authored detail the topology does not
carry, and no amount of tracing recovers detail that is not in the geometry. `60` §2 states this from the
consuming side and it is unchanged.

## 8. Ordering

Two recordings. Full ordering is in `ScheduleAmendment.md` §3; the amendment ordinals are here because the
contributing component declares them, as `SpecularProjection.h` and `TransmissionSequence.h` already do.

```cpp
static constexpr std::uint32_t DirectAmendmentOrdinal   = 4u;   // [-] - before `18` at ④
static constexpr std::uint32_t IndirectAmendmentOrdinal = 6u;   // [-] - after the direct recording
```

🔴 Both are below `TransmissionSequence::CollectAmendmentOrdinal` of ten, which is the lowest ordinal currently
declared. The existing ordinals — 10, 20, 30, 40, 50, 60 — are spaced by ten precisely so that insertions land
between them without renumbering, and this branch inserts below all of them rather than between two.

## 9. Precision

| Computation                        | Tier | Reason                                                            |
|------------------------------------|------|--------------------------------------------------------------------|
| `ChosenIlluminant`, `CandidateTally`| A   | Integers; the weight is derived from the second                   |
| The capability permutation selected | A    | An enumeration ordinal; host and device must agree which ran      |
| `ξ` from `104`'s sequence           | A    | Parity-proven; `102` and `82` must draw the same stream           |
| `p̂`, the Jacobian, the MIS weight   | B    | Continuous; bounded, and the non-finite bound is declared in `Contract/` |
| The shaded contribution             | D    | `RadianceSurface` is Tier D — `18` §6                             |

🔴 The non-finite bound lives in `Contract/` and never at the site. `02` §8 gates tolerance literals outside
`Contract/`, and a weight clamp is the most-tuned tolerance in this family — one written at the site is one that
is tuned in six places and disagrees in three.

## 10. Gates

- **Gate:** One resampling core; exactly three functions are specialised by capability.
- **Gate:** The specialisation is a compile-time constant, never a runtime branch on the capability.
- 🔴 **Gate:** A zero-weight candidate is absorbed into the tally, never skipped.
- **Gate:** Direct resampling runs inside `18`'s dispatch and writes no new resolved target.
- **Gate:** `ClassifyOcclusion` runs once per pixel, after every combination, for the retained candidate only.
- **Gate:** An occluded retained candidate zeroes `ContributionWeight` and resets the tally to one.
- **Gate:** Reprojection reads `MotionSurface` through `64` §4's rules and derives none of its own.
- **Gate:** Spatial neighbours are drawn from the same material's compacted list.
- **Gate:** The tally saturates at `ResamplingTallyCeiling`.
- **Gate:** The two recordings are never merged — `08` §3.2's rule, third instance.
- **Gate:** A secondary vertex shades through the same `Shared/` reflectance source as a primary one.
- **Gate:** `60`'s resolved occlusion does not attenuate a resampled indirect term; channel 6 still does.
- **Gate:** Every candidate spelling is `Illuminant`; `Emitter` appears nowhere.
- **Gate:** `Accumulate` is registered with `ParityRunner` at Tier A for its integer members.

## 11. Open

| Open question                                                             | Blocks                               |
|----------------------------------------------------------------------------|---------------------------------------|
| `CandidateDrawCount` per pixel per rotation                                | Quality against cost; measure         |
| The spatial neighbour count and disc extent                                | Same                                  |
| Whether `RotationsSurvived` earns its two bytes at Slate's reuse depth      | 💾 `92` §2; measure before removing   |
| Whether indirect stays one bounce or `96` is trusted for further bounces   | `96` §4 carries the same row          |
| Whether `ScreenTraced` indirect is worth building at all                    | `100` §6 carries the same row         |
