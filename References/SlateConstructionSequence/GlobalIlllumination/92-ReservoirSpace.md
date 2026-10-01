# 92 — ReservoirSpace

Two extents and one invalidation rule. `94` resamples; this document holds what `94` resamples *into*, and holds
the traversal structure `94` resamples *against*. They are one document because they share exactly one property
that nothing else in the branch shares: both are invalidated by the same events, and an occupant that moved must
invalidate both or neither.

🔴 A structure invalidated on a different schedule than the reservoirs that reference it is the defect where a
reservoir keeps choosing an illuminant occluded by geometry that is no longer there — stable, confident, and
wrong, exactly as `100` §4 describes for the screen-traced form.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                              |
| Layer       | `Layer4_Compute`                                                                |
| Upstream    | `06` (extents, rotation), `08` (targets, substitution), `10` (topology), `12` (composed transforms), `16` (partitions), `34` (off-tick work), `40` (the host subdivision this is **not**), `90` (the capability) |
| Downstream  | `94` reads both; `102` reads the recording slot count                                |
| Unblocks    | Somewhere for a reservoir to live and something for a ray to meet              |

## 1. The Components

| Component                | What it owns                                                             |
|--------------------------|---------------------------------------------------------------------------|
| `ReservoirSpace`         | The reservoir extents, both cycle slots, both signals — §2             |
| `IntersectionStructure`  | The device traversal structure and its refit — §3                        |
| `InvalidationSpecification` | What discards a reservoir and what merely refits — §4                 |
| `ReservoirMetrics`       | Occupancy, refit count, invalidation cause, reported through `86`         |

## 2. What A Reservoir Holds

Declared in `Shared/ResamplingProjection.slang.h` so host and device agree, and so `ParityRunner` covers the
update — `00` §4.

```cpp
// 💾 32 bytes, 16-byte aligned. Two per pixel per cycle slot at the direct signal's extent.
struct DirectReservoir
{
    IlluminantIdentity  ChosenIlluminant;      // [-]   - the reaching-set member this reservoir selected
    Unsigned32          ChosenPosition;        // [-]   - two 16-bit unorm ordinates on the emission shape
    Real32              WeightSum;             // [-]   - Σ wᵢ over every candidate this reservoir has seen
    Real32              ContributionWeight;    // [-]   - W = WeightSum / (CandidateTally · p̂); zero when p̂ = 0
    Unsigned16          CandidateTally;        // [-]   - M, saturating at ResamplingTallyCeiling
    Unsigned16          RotationsSurvived;     // [-]   - feeds the duplication test — `94` §5
};
```

🔴 The count is `CandidateTally` and **not** `CandidateCount`. `64`'s `AccumulatedSample` already carries
`SampleCount` and `102` §5 reads it; two different quantities under one spelling is how `102` comes to divide a
resampling tally by a convergence ceiling and produce a reconstruction extent that is wrong on exactly the pixels
that converged.

⚠️ `ChosenIlluminant` is an `IlluminantIdentity` — the tag `IlluminationGroundwork` §6 declares — and carries a
generation. An illuminant deleted and a new one created in its slot must not inherit the reservoir that chose the
old one, and a bare ordinal cannot express that.

🔴 `ReconstructionSeed` is **absent** from the layout. A seed reproducing the candidate stream is only readable by
a validation pass, and no document in this branch declares one. Four bytes per pixel per slot for a consumer that
does not exist is `02` §8's gate applied to a struct member.

### 2.1 Two signals, two extents

| Signal   | Extent          | Cycle slots | Why                                                        |
|----------|-----------------|----------------|-------------------------------------------------------------|
| Direct   | display         | 2              | Contact shadows are high-frequency; half extent loses them  |
| Indirect | half of display | 2              | Indirect is low-frequency by construction; `102` upsamples  |

The slot count is `RecordingSlotCount` from `Contract/ToleranceContract.h` — declared **2u** there and marked
open. This document reads that constant and never declares its own. 🔴 A reservoir depth that disagreed with the
recording rotation would have `94` reading a slot the device is still writing.

## 3. The Traversal Structure

🔴 **`40` is not a head start on this and the source confirms it.** `SpatialSubdivision` holds `BoundingStructure`
in *object space* precisely so that occupant motion is a refit, and `74` traverses it on the host so a pointer
sample never reads back a device target. Both properties are correct and neither transfers. What this document
holds is device-resident, in world space, and built by the driver where `90` negotiated one.

| Level  | Holds                                        | Rebuilt when                                  |
|--------|----------------------------------------------|------------------------------------------------|
| Upper  | One entry per occupant, at its composed transform | An occupant is added or removed            |
| Lower  | One occupant's topology, in object space     | That occupant's topology changed — `38`        |

The two levels mirror `40` §2's split and for the same reason: the lower level is object-space and therefore
invariant under occupant motion, so moving an occupant updates one upper-level transform and touches nothing else.

⚠️ Lower-level construction runs through `34` at `Background` priority, exactly as `40` §4 specifies for host
rebuilds. A build in flight never replaces the live structure; the result crosses back on the tick and is swapped
there. `34` §3 applies without amendment.

🔴 The refit is **serial ahead of the recordings that traverse it**, on the one graphics queue. `00` §5 declares
multiple queue families absent and `VulkanExchange` holds one `VkQueue`. Its cost is on the critical path in full
and `ConstructionOrder.md` states every budget that way.

### 3.1 Cutout occupants

`16` §3.1 resolves cutout coverage at visibility time by thresholding channel 8, and `62` §2 rules that a cutout
occupant is opaque where it is present. A traversal structure that ignored that would have a leaf casting a solid
square shadow.

The lower level therefore carries a per-occupant **any-hit declaration** for cutout-enrolled materials only, which
re-runs `16` §3.1's threshold at the intersection. 🔴 It reads the coarsest **guaranteed-resident** level and never
demands, for `20` §2.1's reason: a traversal that could stall on residency has made the whole image wait for a
leaf.

⚠️ Non-cutout occupants declare no any-hit behaviour at all. Declaring one uniformly costs every ray the
opportunity for an early exit, on every occupant, to serve the minority that need it.

## 4. Invalidation — Including Paint

The table `60` §4 could keep short because occlusion reads topology and not channels. This document cannot: a
reservoir stores a *radiometric* choice, and painting changes radiometry.

| What changed                          | Structure          | Direct reservoirs        | Indirect reservoirs      |
|---------------------------------------|--------------------|--------------------------|---------------------------|
| The camera moved                      | Nothing            | Reprojected — `94` §4    | Reprojected               |
| An occupant moved                     | One upper transform| Reprojected; motion covers it | Reprojected          |
| An occupant was added or removed      | Upper rebuilt      | Reprojected              | Reprojected               |
| An illuminant moved or resized        | Nothing            | 🔴 Discarded             | Retained                  |
| An illuminant's intensity changed     | Nothing            | Retained — see below     | Retained                  |
| Topology changed — `38`               | That lower level   | Reprojected              | Reprojected               |
| **An occupant was painted**           | Only if cutout     | Retained                 | 🔴 Discarded — §4.1       |
| The display extent changed            | Nothing            | Discarded whole          | Discarded whole           |
| Device loss                           | Rebuilt whole      | Discarded whole          | Discarded whole           |

🔴 An intensity change **retains** the reservoirs, and this is `44` §2's declared-extent rule paying for itself a
second time. Intensity does not change which illuminants reach a partition — `44` §5's last row — and a reservoir
stores a *choice among reachers*. The chosen illuminant is still a legal choice; only its contribution scales, and
that scale is applied at shade time, not stored. The most common illuminant edit an artist makes costs nothing
here, exactly as it costs nothing in `44` and `60`.

⚠️ An illuminant *moving* is different and discards. Position enters `p̂` through the geometry term, so a moved
illuminant makes every stored `ContributionWeight` describe a distribution that no longer exists.

### 4.1 Paint invalidates the indirect signal

🔴 This row exists in no donor document and is the row that matters most for a texture-paint application.

A stroke in `22` changes channel 1, and channel 1 is the albedo an indirect bounce carries. An indirect reservoir
whose chosen path reconnects through a surface the artist just repainted holds radiance of the previous colour.
Retained, it produces a red wall bouncing green light for as long as the reservoir survives — which, with a
saturating tally, is indefinitely.

| Scope of the stroke                       | What is discarded                                       |
|-------------------------------------------|----------------------------------------------------------|
| Any painted layer of one occupant's surface | Indirect reservoirs whose reconnection surface is that occupant |
| A cutout coverage channel — channel 8      | Additionally, that occupant's lower level is rebuilt      |
| A non-radiometric channel — 3, 5, 9…       | Nothing; roughness does not change transported radiance   |

⚠️ Direct reservoirs are **retained** through a stroke. A direct reservoir stores which illuminant was chosen and
that choice is a function of the illuminant's own radiance and the surface position, not of the surface's albedo —
albedo enters at shade time, from the resolved channels, which are already current. Discarding them would reset
every shadow the artist can see for a change that does not affect one.

🔴 The discard is per-occupant and driven by the identity `22` already commits with its transaction. It is **not**
a whole-extent discard: an artist painting continuously would then never accumulate an indirect signal at all,
which is precisely the workflow this engine exists for.

## 5. Extent Arithmetic

At a 1920 × 1080 display, `RecordingSlotCount = 2`:

| Extent                            | Arithmetic                          | Claimed    |
|-----------------------------------|--------------------------------------|------------|
| Direct reservoirs                 | 1920 × 1080 × 32 B × 2 slots        | ≈ 133 MiB  |
| Indirect reservoirs               | 960 × 540 × 48 B × 2 slots          | ≈ 50 MiB   |
| Traversal structure, ~500K triangles | Driver-reported; ~24 B per triangle | ≈ 12 MiB  |
| Scratch, refit                    | Driver-reported                      | ≈ 4 MiB    |

⚠️ 💾 The direct reservoirs are the largest single claim this branch makes and they are at display extent by
§2.1's decision. At 4K the same arrangement is ≈ 531 MiB, which is past what a 6 GiB device should spend on one
signal. `08` §7 already carries the shape of this question for `ReflectionSurface` and `OcclusionSurface`; §7
below carries it for these.

🔴 The claim is refused **in full** or granted in full, in `TargetSpace::Claim`'s idiom: a half-claimed reservoir
set is one where `94` reads an extent that was never claimed and meets it as a null view rather than as a refusal.

## 6. Precision

| Computation                          | Tier | Reason                                                          |
|--------------------------------------|------|------------------------------------------------------------------|
| `ChosenIlluminant` identity          | A    | An integer pair; a mismatch shades the wrong illuminant         |
| `CandidateTally`, `RotationsSurvived`| A    | Integers; the weight is derived from the first                  |
| Structure transforms                 | B    | Continuous; rebased in 64-bit before narrowing — `02` §3.2      |
| `WeightSum`, `ContributionWeight`    | B    | Continuous; bounded, and `94` §3's clamp is the bound           |
| Extent occupancy reported to `86`    | A    | An integer count                                                |

## 7. Gates

- **Gate:** No `VkAccelerationStructureKHR` handle is negotiated here; `90` negotiated the capability.
- **Gate:** The recording slot count is `RecordingSlotCount` from `Contract/`, never a local constant.
- **Gate:** The lower level is object-space and invariant under occupant motion.
- **Gate:** An occupant move updates one upper transform and rebuilds nothing.
- **Gate:** Lower-level construction runs through `34` at `Background`; a build in flight never replaces the live
  structure.
- **Gate:** The refit is serial on the one graphics queue and its cost is stated in full.
- **Gate:** Any-hit behaviour is declared for cutout-enrolled materials only, and reads guaranteed-resident levels.
- 🔴 **Gate:** A stroke discards the indirect reservoirs of the painted occupant and no others; direct reservoirs
  are retained.
- **Gate:** An illuminant intensity change invalidates nothing; a move discards the direct reservoirs.
- **Gate:** The reservoir layout carries no member no document in this branch reads.
- **Gate:** `CandidateTally` is spelled apart from `64`'s `SampleCount`.
- **Gate:** The extent claim is refused in full or granted in full.
- **Gate:** `40`'s host structures are not amended, read, or shared with.

## 8. Open

| Open question                                                                | Blocks                              |
|-------------------------------------------------------------------------------|--------------------------------------|
| Whether direct reservoirs stay at display extent above 1440p                   | 💾 §5; measure before deciding       |
| `ResamplingTallyCeiling` — the saturating tally bound                          | `94` quality; `86` reports it either way |
| Whether `ComputeTraced` is built, or `ScreenTraced` serves that hardware       | `IlluminationGroundwork` §12 carries the same row |
| Whether the upper level is rebuilt or refitted after many occupant moves        | Tuning; `40` §8 carries the same shape |
| Whether a paint stroke's discard is per-occupant or per-chart from `68`         | Cost only; per-occupant is correct and coarse |
