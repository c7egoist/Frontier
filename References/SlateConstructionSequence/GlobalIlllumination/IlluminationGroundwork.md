# IlluminationGroundwork — Repealing `00` §5's First Absence

`00` §5 lists global illumination as **absent by instruction**, with four substitution sockets in §5.1 filled by
`28`'s sky-view radiance and a constant floor. Eight documents were then written against that absence, and five
of them carry gates that forbid what this branch adds. This document is where the absence is repealed, where each
of those gates is restated rather than quietly broken, and where the vocabulary the eight new documents use is
fixed once instead of being invented eight times.

Nothing here is optional reading before the documents numbered `90` through `104`. A document in this branch that
contradicts this one is wrong.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | None — this is an amendment to `00`, not a component                          |
| Layer       | L0 … L4                                                                       |
| Upstream    | `00` (absences, tiers, link partition), `08` (the target set and the ordering) |
| Downstream  | `90`, `92`, `94`, `96`, `98`, `100`, `102`, `104`                             |
| Unblocks    | Indirect light with a declared owner rather than a declared absence            |

## 1. What The Repeal Actually Costs

🔴 The absence was not a placeholder. Five gates in force today are **satisfied** by the absence and are made
false by removing it. Each is restated here, and the restatement is the amendment.

| Document | Gate as written                                                        | Gate as restated                                            |
|----------|-------------------------------------------------------------------------|--------------------------------------------------------------|
| `18` §9  | The ambient term comes from `28` or the constant floor — nothing else   | The ambient term comes from `102`'s reconstructed indirect, from `28`, or from the constant floor, selected by `TraversalCapability` — §4 |
| `18` §9  | No bent orientation is produced or consumed                            | Unchanged. Nothing in this branch produces one — §5          |
| `60` §8  | The direct and ambient terms are separate and never merged             | Unchanged, and strengthened: `94` resamples the direct term and never touches the ambient one |
| `60` §8  | Every occlusion-enrolled illuminant of `44` receives one projection    | Holds at `ScreenTraced` only. Above it `60` is substituted away entirely — `08` §5 |
| `00` §11 | Every absence in §5 names a substitution                               | The row is deleted, not re-substituted. An absence that is no longer absent has no substitution to name |

⚠️ The four sockets of `00` §5.1 are **not** repurposed. Socket one — the ambient term in `18` — is the only one
this branch fills; sockets two, three and four stay filled as they are. A branch that claimed all four would be
claiming that bent orientations and irradiance products are now produced, and neither is.

## 2. The Capability Vocabulary

🔴 `Tier` is banned structurally by `00` §8 and is already taken by the four precision guarantees in
`PrecisionContract.h`. Every spelling in this branch that names *how a ray is answered* is a
**`TraversalCapability`**, and the two words are never used for each other.

| Capability       | Answered by                                                        | Resampling configuration                              |
|------------------|---------------------------------------------------------------------|--------------------------------------------------------|
| `ScreenTraced`   | `100`'s extremum chain and `60`'s existing occlusion projections     | Direct resampling only; indirect from `96` alone       |
| `ComputeTraced`  | Slate's own traversal over `92`'s structure, in compute              | Full, at reduced candidate counts                      |
| `DriverTraced`   | `VK_KHR_ray_query`, inline, in a compute dispatch                    | Full — direct, indirect, world illuminant subdivision  |
| `HardwareTraced` | Ray query, plus a ray-tracing recording where `90` negotiated one    | Full, plus the reconnection shift `94` §6 declares     |

The capability is scored **once**, at device creation, and is a member of the existing `CapabilitySet` in
`VulkanExchange.h`. 🔴 It is not re-queried at a recording site. That struct's own note states the reason and it
applies here without amendment: a code path conditional on something that cannot change is a conditional that
never leaves.

⚠️ `ScreenTraced` is a capability, not a form factor. A 2016 desktop part lands there and a current mobile part
with `VK_KHR_ray_query` lands at `DriverTraced`. Naming it after the screen rather than after the hardware is
what keeps that straight at every site that reads it.

## 3. What The Source Already Provides

Read from the tree rather than from the series, because three of these contradict what the documents imply.

| Already built                              | Where                                        | What this branch does with it                     |
|--------------------------------------------|----------------------------------------------|----------------------------------------------------|
| `DepthReduction` — a hierarchical minimum   | `SlateCompute/…/VisibilityIndex/Api/`        | 🔴 **Wrong extremum.** See below                    |
| `ProjectPermutedOrdinal`, `ProjectVariation`| `Shared/SampleProjection.slang.h`            | `104` extends the permutation to an Owen scramble  |
| `ProjectHemisphericalSample`, cosine-weighted| `Shared/SampleProjection.slang.h`           | `94` generates indirect candidates through it      |
| Per-material compacted pixel lists          | `16` §5, built                               | 🔴 `94`'s spatial reuse is defined over these — §6 |
| `IlluminantReachCapacity = 16u`             | `Contract/ToleranceContract.h`               | The reaching set stays at sixteen; only the *shadowed* capacity of four is removed |
| One graphics queue, no second family        | `VulkanExchange.h`, `CapabilitySet`          | 🔴 Nothing in this branch is async — §7            |

🔴 **`DepthReduction` reduces by minimum, and a screen march needs the maximum.** Its own header states why the
minimum is correct for *occlusion culling* over reversed depth: the least ordinate across a region is its furthest
point. A ray marching through the same chain wants to skip empty space, which needs the region's **nearest**
point — the maximum. The existing chain cannot answer that and must not be made to: `16`'s culling depends on the
minimum being conservative in exactly the direction it is. `100` therefore holds a second chain and `16`'s is
untouched. This is not visible from any document and is the single largest correction the source forced.

## 4. Where The Indirect Term Enters

🔴 This is the load-bearing structural decision of the branch, and it is a smaller change than it appears.

`18` already dispatches once per visible material over `16`'s compacted pixel list, already reconstructs position,
orientation and the tangent basis, already resolves every channel, and already adds an ambient diffuse and an
ambient specular term from `28`. **The indirect term replaces the source of those two terms and nothing else.**

| What `18` does today                              | What `18` does after this branch                       |
|---------------------------------------------------|---------------------------------------------------------|
| Ambient diffuse ← `SkyViewSurface`, cosine-convolved | ← `102`'s reconstructed `IndirectDiffuseSurface`, or the sky where the capability is absent |
| Ambient specular ← `SkyViewSurface` at the reflection direction | ← `102`'s reconstructed `IndirectSpecularSurface`, likewise |
| Direct term ← integrate `44` §5's reaching set     | ← **resample** that set through `94`, then integrate the chosen illuminant |
| Produces `RadianceSurface` whole                   | Unchanged                                               |

Three consequences follow, and each closes a defect the obvious arrangement would have opened.

🔴 **`30`'s exact-composite contract survives untouched.** `30` §1 subtracts what `18`'s ambient specular already
contributed and swaps in what the trace found. That subtraction still has an operand — `18` still pre-adds an
ambient specular, only from a different source. `ReflectionSurface` keeps its meaning, `SpecularProjection.h`
keeps its `Compose`, and `30` is not amended at all. An arrangement that made indirect specular a fifth signal
composited elsewhere would have left `30` with nothing to subtract.

🔴 **No new resolved target is written by `16`.** Direct resampling happens *inside* `18`'s per-material dispatch,
where the channels are already resolved. `16` §6's gate — "no attribute other than depth, identity, coverage and
motion is written" — is not touched. The alternative, a wide surface description for a separate resampling
dispatch to read, is exactly the wide attribute target `16` §4 exists to refuse.

🔴 **`64` is unchanged and still last.** Accumulation still reads `RadianceSurface` after `30`, still derives its
weight from a stored count, still resets rather than decays. `102` runs *before* `18` consumes the indirect
signals, so nothing reconstructs a target `64` later accumulates — which would have averaged a filtered image and
converged to the filter rather than to the scene.

## 5. What Is Still Absent

Declared here so that the repeal is bounded and a later document does not assume the whole donor corpus arrived.

| Still absent                          | Why                                              | What stands in its place                    |
|---------------------------------------|--------------------------------------------------|----------------------------------------------|
| Bent orientations                     | Still no consumer; `18` §7's reasoning holds     | Scalar occlusion, unchanged                  |
| Irradiance products for a population  | `96` is content-keyed and world-referred          | `96` — one store, not a placed population    |
| Volumetric transport                  | Out of scope; no document reads it                | Nothing                                      |
| Caustic transport by connection       | Refused; the shift `94` §6 declares cannot carry it | The path is traced and converges slowly     |
| A second reflectance evaluation on the device for indirect hits | `18`'s models are host-and-device shared already | `94` reads `Shared/ReflectanceProjection.slang.h` — the same source |

⚠️ The last row is a constraint, not an omission. An indirect hit shades through the **same** shared reflectance
source the primary hit does. A second simplified evaluation at the secondary vertex is how a renderer acquires a
first-bounce look and a second-bounce look that disagree, and the artist reads the disagreement as the indirect
light being the wrong colour.

## 6. Identity — One New Subject Tag

`IdentityContract.h` declares six subject tags and **none of them is an illuminant**. A reservoir stores which
illuminant it chose, so the tag is required before `94` compiles.

```cpp
struct IlluminantSubject {};

using IlluminantIdentity = Identity<IlluminantSubject>;   // [-] - one illuminant of `44`'s population
```

🔴 It is a distinct tag and not a reuse of `OccupantSubject`, even though `44` §1 makes every illuminant an
occupant of the document population. The reservoir indexes `44` §5's *reaching set*, which is a per-partition
narrowing, and passing an occupant identity where a reaching-set position is expected is precisely the defect
`00` §10 conflict 15 recorded against `VisibilityIndex`.

## 7. One Queue — What It Forbids

`CapabilitySet` carries `GraphicsFamilyOrdinal` and `VulkanExchange` holds one `VkQueue`, commented "one queue;
transfers ordered inside it". `00` §5 declares multiple queue families absent.

🔴 Nothing in this branch overlaps with anything else. `92`'s structure refit is **serial** ahead of the recordings
that traverse it, and its cost is on the critical path in full. Every budget in `ConstructionOrder.md` is stated
that way. A plan that hides a refit behind async compute is stating a figure this engine cannot reach.

## 8. Numbering

`88` is a **deleted identity** — `00` §9 records `88-ReferenceAmendment.md` as deleted rather than archived, and
`00` §8.1 makes a number an identity rather than a position. Identities are not recycled. This branch therefore
begins at `90` and takes even numbers upward in the order §9 of `00` is amended to list them.

| №   | Document                | Unit           | Layer            |
|-----|-------------------------|----------------|-------------------|
| 90  | `IntersectionExtension` | `SlateVulkan`  | `Layer2_Device`   |
| 92  | `ReservoirSpace`        | `SlateCompute` | `Layer4_Compute`  |
| 94  | `ResamplingSequence`    | `SlateCompute` | `Layer4_Compute`  |
| 96  | `RadianceDepot`         | `SlateCompute` | `Layer4_Compute`  |
| 98  | `IlluminantSpace`       | `SlateCompute` | `Layer4_Compute`  |
| 100 | `ExtremumSpace`         | `SlateCompute` | `Layer4_Compute`  |
| 102 | `VarianceIntegrator`    | `SlateCompute` | `Layer4_Compute`  |
| 104 | `DiscrepancySequence`   | `SlateMath`    | `Layer1_Numeric`  |

## 9. Strata — The Re-derivation

`00` §9.1 is a build product derived from every Position block's Upstream field. Adding eight documents extends
it; it is **not** hand-edited, and what follows is the expected output rather than the authority.

| Stratum | Added                          | Because                                                       |
|---------|--------------------------------|----------------------------------------------------------------|
| 1       | `104`                          | Reads `02` only; `Shared/`, parity-proven                     |
| 3       | `90`                           | Reads `06` and `08`                                           |
| 8       | `92` · `100`                   | Read `16`, `40`, `90`; alongside `60` and `76`                |
| 9       | `98`                           | Reads `92`, `44`, `104`                                       |
| 10      | `94`                           | Reads `92`, `96`, `98`, `100`, `104`, `42`, `56`              |
| 11      | `96` · `102`                   | `96` reads `94`; `102` reads `94` and `64`'s declared count   |
| 12      | `18` moves                     | 🔴 It now reads `102`. See below                              |

🔴 **`18` moves from stratum 9 to stratum 12, and `62`, `30`, `64`, `66` move with it.** This is the real cost of
§4's arrangement and it is stated rather than absorbed: making `18` read a reconstructed indirect signal makes
every document downstream of `18` deeper by three. The ordering inside one rotation is unaffected — §3 of
`ScheduleAmendment.md` is the authority there — but the build order genuinely changes and the cycle gate must be
re-run, not assumed.

## 10. The Cycle That Is Not One

`102` reads `64`'s stored sample count to decay its own reconstruction extent — `102` §5, and it is the highest
value mechanism in the branch. `64` reads `RadianceSurface`, which `18` produced from `102`'s output. Read as a
graph over documents, that is a cycle, and `00` §11's gate is mechanical and runs every build.

🔴 It is not a cycle, for exactly the reason `64` §6 already declares its own self-read legal: the count `102`
reads is the **previous rotation's**, ordered by `06`'s recording rotation and not by the schedule. `64` §6 states
that this is "the one place in the schedule where a cycle slot depends on the one before it"; this branch makes
it the second. Both are declared as rotation-crossing edges and are excluded from the stratum traversal by
declaration, never by the traversal failing to notice them.

⚠️ The exclusion is a **declared field on the Upstream edge**, not an omission from it. An edge left out of the
Position block to dodge the gate makes the gate sound on a graph that is not the real one, which `00` §11's second
gate exists to forbid.

## 11. Gates

- **Gate:** `Tier` names a precision guarantee and never a traversal capability; `TraversalCapability` names the
  latter and never the former.
- **Gate:** The capability is a member of `CapabilitySet`, scored at device creation, never re-queried.
- **Gate:** `16` writes no target this branch added. Direct resampling runs inside `18`'s dispatch.
- **Gate:** `30` §1's composite is not amended, and `18` still pre-adds an ambient specular term.
- **Gate:** `64` accumulates a target no reconstruction has touched.
- **Gate:** `IlluminantIdentity` is a distinct subject tag and never an `OccupantIdentity`.
- **Gate:** Nothing in this branch is recorded on a second queue.
- **Gate:** `100` holds its own extremum chain; `16`'s `DepthReduction` is not amended.
- 🔴 **Gate:** Every rotation-crossing edge is declared as one, and `00` §9.1's stratum table is re-derived by the
  script rather than extended by hand.
- **Gate:** `00` §5's global-illumination row is **deleted**, not re-substituted, and §5.1's socket one names
  `102` while sockets two through four stand unchanged.

## 12. Open

| Open question                                                                | Blocks                              |
|-------------------------------------------------------------------------------|--------------------------------------|
| Whether `ComputeTraced` is built at all, or `ScreenTraced` serves that hardware | `92` §7 carries the same row; measure |
| Whether the indirect signals stay at half extent above 1440p                   | `102` quality; `08` §7's shape       |
| Whether `18`'s stratum move justifies splitting its ambient term into a separate document | Nothing structural; build order only |
| Whether a second reflectance evaluation for secondary vertices is ever warranted | §5's last row; refused until measured |
