# 68 — ChartPartition

Every paintable surface addresses a parametric domain, and that domain has to exist before anything subdivides it,
paints into it or transfers through it. This document produces it: where the topology is cut, how each piece is
flattened, how the pieces are arranged, and what the distortion of the result is.

🔴 This mechanism was in `24` and is here because it could not stay there. `24` produced the domain `20` subdivides while sizing its inter-chart gap against `PhysicalTileApron` — a cross-unit constant now declared in `Contract/` (`02` §3.3). This removes the last `68` → `20` edge completely, so the edge runs one way and this document precedes `20`. Recorded as `00` §10 conflict 30.

## Position In The Sequence

| Field       | Value                                                                                     |
|-------------|--------------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                         |
| Layer       | `Layer4_Compute`                                                                           |
| Upstream    | `02` (`UnwrapSolver`, `PlanarClassifier`), `10` (topology), `34` (off-tick solving), `38`   |
| Downstream  | `20` subdivides the domain; `22` paints into it; `24` transfers through it; `18` §1.1 derives its basis from it |
| Unblocks    | Seams and unwrap, ahead of the domain that needs them                                      |

## 1. The Components

| Component               | What it owns                                                            |
|-------------------------|--------------------------------------------------------------------------|
| `ChartPartition`        | The set of charts one surface's topology is cut into — §3               |
| `SeamSpecification`     | Where the topology is cut, authored and derived — §2                    |
| `ParameterSpecification`| One chart's flattening and its distortion — §4                          |
| `ChartArrangement`      | Where each chart sits in the domain, and the gap between them — §5      |
| `PartitionMetrics`      | Distortion, termination cause and occupancy, reported through `86`      |

## 2. Seams

A seam is where the topology is cut so it can be flattened. Seams come from two sources and both persist.

| Source    | Held as                                       | Survives                                   |
|-----------|-----------------------------------------------|---------------------------------------------|
| Authored  | Edge identities in `10`, per surface          | Re-unwrapping, conditioning, save and open  |
| Derived   | Produced here from orientation and curvature  | Only until the next partition               |

🔴 An authored seam is a document amendment in `10`'s `RevisionSequence` and is never discarded by a re-unwrap.
An artist who spent an hour marking seams and watched an automatic partition erase them has lost work the program
told them it was holding.

⚠️ Derived seams are added to the authored set, never in place of it. Where a surface would not flatten within the
declared distortion using only the authored seams, the shortfall is cut here and the addition is **reported**
through `86`. A silent extra cut is a seam the artist finds later in the painted result.

Seam edges are edge identities from `10`, not positions. `38`'s conditioning may move a vertex; a seam recorded as
a position would then be a seam somewhere else, and the surface would cut through the middle of a chart.

## 3. Partitioning

A chart is a connected piece of topology bounded by seams and by the topology's own boundary. Partitioning is the
assignment of every polygon to exactly one chart.

| Property                          | Requirement                                                        |
|-----------------------------------|---------------------------------------------------------------------|
| Coverage                          | Every polygon belongs to exactly one chart — none is unassigned     |
| Connectivity                      | A chart is connected across non-seam edges                          |
| Orientation                       | Every chart flattens without folding — §4                           |
| Identity                          | Each chart carries a stable identity across a re-partition where it is unchanged |

🔴 Chart identity is stable where the chart is unchanged. `24` §3 keys transferred results on the chart partition
revision, and a partition that renumbered every chart on every run would discard every derived artefact for a
change that touched one seam.

## 4. Flattening

Each chart is flattened by `02` §5's `UnwrapSolver`, which is **Tier C**. It declares a convergence criterion and
an iteration ceiling and reports which of the two terminated it, per `02` §5's contract.

| Reported                | Meaning                                                            |
|-------------------------|---------------------------------------------------------------------|
| Convergence             | The criterion was met; the flattening is as declared                |
| Ceiling                 | The iteration ceiling terminated it; the result is the last iterate |
| Distortion, per chart   | Area and angle distortion, both, and the worst position of each     |
| Fold                    | A flattening that overlaps itself — §4.1                            |

🔴 A ceiling termination is reported through `86` and is not silently accepted. `02` §5 states the general reason:
a solver that returns its last iterate when the ceiling is hit is indistinguishable from one that converged. Here
the specific consequence is that the artist paints on a domain whose distortion nobody measured.

⚠️ Area and angle distortion are reported **separately**. They trade against each other and no single number
expresses both; a surface flattened to preserve angles stretches in area, and an artist painting a repeating
pattern cares about area while an artist painting a decal cares about angle.

### 4.1 Folds

A flattened chart that overlaps itself maps two topology positions to one domain position. Painting one paints
both.

🔴 A fold is a **failure**, not a distortion value. The chart is subdivided further — an additional derived seam —
and re-flattened, and the additional cut is reported like any other. A fold accepted and shipped is a surface
where the artist paints a stroke and it appears somewhere else at the same time.

Overlap is tested with `02` §4's `IntersectionClassifier` and `PlanarClassifier` at Tier A. An approximate overlap
test finds folds sometimes, which is worse than not testing, because the failures that survive are the subtle ones.

## 5. Arrangement

Charts are arranged into the unit domain. Each occupies a disjoint area, and adjacent charts are separated by a
declared gap.

🔴 The gap is at least `20` §1's `PhysicalTileApron`, read as a number. A gap narrower than the apron means a
tile's duplicated border reads texels belonging to a different chart, and every chart edge in the painted result
carries a fringe of a neighbouring chart's content.

⚠️ The apron is read as a **constant**, and nothing here consults `20`'s subdivision, residency or promotion. That
is the whole content of `00` §10 conflict 13's resolution, and it is what makes this document precede `20`.

| Declared            | Meaning                                                              |
|---------------------|-----------------------------------------------------------------------|
| Gap                 | At least the apron, in domain units at the maximum working extent    |
| Relative scale      | Whether charts are packed at a common scale or individually          |
| Occupancy           | The fraction of the domain covered, reported through `86`            |

Charts are packed at a **common scale** by default: one texel of domain covers the same topology area on every
chart. A per-chart scale packs more tightly and makes one surface's paint finer than another's on the same object,
which the artist sees as an inconsistent brush.

## 6. When A Partition Is Re-Derived

| What changed                       | Re-derived                                          |
|------------------------------------|------------------------------------------------------|
| Topology imported or conditioned   | The whole partition                                  |
| An authored seam added or removed  | The affected charts, and the arrangement             |
| The distortion criterion amended   | The whole partition                                  |
| The camera moved                   | Nothing                                              |
| An occupant moved                  | Nothing — the domain is parametric, not world-referred |
| Anything painted                   | Nothing                                              |

🔴 A re-partition advances the chart partition revision, and `24` §3 keys on it while `20` promotes against it.
Re-partitioning moves domain positions, so every derived artefact addressed in the old domain is invalid — and
that is exactly what the revision makes discoverable rather than silent.

⚠️ Painted texels are **not** derived and are not discarded. `56` §3 stores them at the working extent, and `56` §3.1 resamples them into the new domain on the tick when a re-partition occurs. `68` advances the partition revision and derives the unwrap; `56` §3.1 resamples the authored texel layers. This operation is reported through `86`, and `56` §3.1 confirms already. Recorded as `00` §10 conflict 40.

## 7. Off The Tick

Flattening is a long solve and runs through `34`'s `WorkSequence` on the `Background` class, cancellable, with
progress. The previous partition stands until the new one completes.

🔴 The previous partition stands. A surface with no valid domain has no place to sample, no place to promote a
tile from and nothing for `18` §1.1 to derive a tangent basis from; the visible result of swapping the domain
mid-solve is the whole object flickering while an unrelated seam is being marked.

## 8. Precision

| Computation                        | Tier | Reason                                                           |
|------------------------------------|------|-------------------------------------------------------------------|
| Edge and chart identity            | A    | Integers; a mismatch cuts or keys the wrong thing                 |
| Overlap and containment tests      | A    | `02` §4's predicates; a missed fold paints two places at once     |
| Flattening solve                   | C    | `UnwrapSolver`; criterion and ceiling both declared and reported  |
| Distortion measures                | B    | Continuous; reported, not compared for identity                   |
| Domain positions                   | B    | `02` §3.2's surface space, at 32 bits                             |

## 9. Gates

- **Gate:** Authored seams are held in `10` as edge identities and survive every re-partition.
- **Gate:** Derived seams are added to the authored set, never substituted for it, and are reported.
- **Gate:** Every polygon belongs to exactly one chart.
- **Gate:** Chart identity is stable where the chart is unchanged.
- **Gate:** Flattening reports its termination cause, per `02` §5's Tier C contract.
- **Gate:** Area and angle distortion are reported separately.
- **Gate:** A fold is a failure; the chart is subdivided and re-flattened, never shipped folded.
- **Gate:** Overlap testing uses `02` §4's Tier A predicates.
- **Gate:** The inter-chart gap is at least `20` §1's `PhysicalTileApron`.
- 🔴 **Gate:** This document reads no mechanism from `20` — only the apron constant.
- **Gate:** A camera move, an occupant move and a paint stroke re-derive nothing here.
- **Gate:** A re-partition advances the partition revision that `24` keys on.
- **Gate:** Flattening runs on `34`'s `Background` class; the previous partition stands until it completes.

## 10. Open

| Open question                                                              | Blocks                            |
|-----------------------------------------------------------------------------|------------------------------------|
| The declared distortion threshold above which a seam is derived             | Quality; `86` reports either way   |
| The packing objective — occupancy against chart count                       | Memory; measurable                 |
| Whether charts may be packed at individual scales on request                | §5's default stands regardless     |
| Whether an imported domain is retained instead of re-derived                | `50` format coverage               |
| Whether a re-partition resamples painted texels in place or on promotion    | `56` §10 carries the same row      |
