# 24 — UvSurfaceDepot

Transfer moves attributes from a dense source topology onto a sparse working topology through the parametric
domain. It is Tier C — it converges against a declared criterion — and it is held to reporting which criterion
terminated it.

`UvSurfaceDepot` keeps the word `Surface` under the named individual exemption in `SKILL-Naming.md` §
Mathematical Vocabulary. ⚠️ `Bake` is banned; the operation is transfer, and its parameters are a
`TransferSpecification`.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (`LinearSolver`, Tier A predicates), `10`, `68` (the domain), `20` (`SurfaceDepot`) |
| Downstream  | `18` samples the transferred result                                           |
| Unblocks    | Attributes moved between topologies                                           |

## 1. What This Document No Longer Owns

🔴 Unwrapping is specified in `68` — `ChartPartition` — and not here.

⚠️ The split is not organisational tidying. This document previously produced the domain that `20` subdivides and
`22` paints into, **while** sizing its inter-chart gap against `20`'s `PhysicalTileApron`. `24` therefore
depended on `20` and `20` depended on `24`, and neither could be built first. `00` §9 asserted "strictly downward
with two forward references" over a series containing that cycle, which is the failure recorded as `00` §10
conflict 13.

`68` produces the domain and depends on `20` for nothing — the apron is a declared constant from `20` §1, read as
a number, not as a subdivision. `20` then subdivides the finished domain. The edge runs one way.

| Was here                       | Now in |
|--------------------------------|---------|
| Seam classification            | `68`   |
| Chart partitioning and packing | `68`   |
| Parameterisation solving       | `68`   |
| Distortion reporting           | `68`   |
| Attribute transfer             | `24`   |
| The derived-result depot       | `24`   |

## 2. Transfer

Attributes move from a dense source topology to a sparse working topology.

| Field                  | Meaning                                                    |
|------------------------|-------------------------------------------------------------|
| Source topology        | The dense origin                                            |
| Working topology       | The sparse destination, carrying the domain                 |
| Search extent          | Maximum distance searched along the working orientation     |
| Correspondence rule    | How a hit is chosen when the search returns several         |
| Channels               | Which of `18`'s twenty are transferred                      |
| Domain extent          | Resolution at which the result is written                   |

For each domain position on the working topology: reconstruct the position and orientation, search the source
within the extent, and sample the correspondence. Misses are recorded as misses — never as zero, never as the
nearest value found beyond the extent. A recorded miss is diagnosable; a fabricated value is not.

Correspondence uses `IntersectionClassifier` at Tier A. A transfer that misclassifies which source surface
corresponds produces seam artefacts that are indistinguishable from unwrap defects, and the two get debugged
together for a long time.

## 3. The Depot

Transferred results are derived, reconstructible artefacts keyed by content — source topology revision, working
topology revision, the chart partition revision from `68`, the specification, and domain extent. They live in
`SurfaceDepot` from `20` §4 and are evictable.

The chart partition revision is part of the key because re-unwrapping moves every domain position. A transferred
result keyed without it survives a re-unwrap and is then read at positions that mean something else, which
presents as attributes that are subtly wrong everywhere rather than as an obvious failure.

🔴 A transferred result that has been **painted over** is no longer derived. The painted content is a layer in
`56` and is not evictable; the transferred result underneath it remains derived and evictable independently,
because `56` §4's layer sequence keeps them separate rather than merging them into one texel set.

⚠️ This is a correction. This section previously said the painted-over transfer "moves to `10`", which described
a transferred result mutating into authored content — and left the composite unable to say which texels were
which. Nothing moves. Paint is a layer above; transfer is a layer below; both are addressed at their own level.

## 4. Reporting

Transfer is Tier C and reports which criterion terminated it — convergence or iteration ceiling. It also reports
its miss count, per channel, through `86`. A transfer that missed a tenth of the domain and one that missed
nothing are visually similar in the regions that succeeded.

## 5. Gates

- **Gate:** Transfer misses are recorded as misses.
- **Gate:** Correspondence uses Tier A classification.
- **Gate:** Depot keys include both topology revisions, the chart partition revision, and the specification.
- **Gate:** Transfer reports its termination cause and its miss count.
- 🔴 **Gate:** This document declares no unwrap, no seam classification and no chart packing, and reads no
  mechanism from `20`. Its only `20` dependency is `SurfaceDepot` residency.
- **Gate:** A transferred result is always evictable; nothing painted is stored in it.

## 6. Open

| Open question                                                    | Blocks                     |
|--------------------------------------------------------------------|-----------------------------|
| Whether transfer runs on host or device                            | Latency, not design         |
| Whether `SurfaceStructure` sources transfer, or only topology      | `10` §5 carries this too    |
| Whether a miss may be filled from a coarser transfer               | Quality only, not design    |

⚠️ The two unwrap questions carried here — distortion threshold and packing objective — moved to `68` with the
mechanism.
