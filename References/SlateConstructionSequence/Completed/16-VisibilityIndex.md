# 16 — VisibilityIndex

The render spine resolves, for every pixel, *which surface is there* — and defers every question about what that
surface looks like. Separating visibility from shading is what makes shading cost proportional to visible material
variety rather than to submitted geometry, and it is what lets `26` outline a selection by comparing identities
instead of re-rasterising it.

`VisibilityIndex` is the name of both the mechanism and the target it writes. "Visibility buffer" is not usable —
`Buffer` is banned — and the substitute is not a euphemism: what is written is an index into the population, which
is what `Index` means in the closed suffix list.

## Position In The Sequence

| Field       | Value                                                                            |
|-------------|-----------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                |
| Layer       | `Layer4_Compute`                                                                  |
| Upstream    | `02` (Tier A predicates, rebasing), `06` (device), `08` (ordering), `10`, `12`, `20` (resident coverage), `42` (materials, resolution), `46` (projection, depth convention), `56` |
| Downstream  | `18` shades from it; `26` outlines from it; `30` reads depth                      |
| Unblocks    | Knowing which surface each pixel resolved to                                      |

## 1. Partitioning

Polygon topology from `10` is partitioned into `MicroSurfacePartition` — 64 to 128 triangles each, spatially
coherent, with a bounding extent and a cone of face orientations. The partition is derived once when topology
changes, persists in a persistent device extent, and is not rebuilt per rotation.

The size range is not arbitrary: it is the granularity at which a partition is worth culling individually and
still large enough that per-partition overhead is amortised.

## 2. Culling

Two-phase, using the previous rotation's depth as a conservative predictor.

① **First phase.** Test every partition against the frustum and against the previous rotation's depth reduction.
   Partitions that pass are rasterised. This resolves everything that was visible last rotation and still is.
② **Depth reduction.** Reduce the depth produced by ① into a hierarchical minimum.
③ **Second phase.** Re-test the partitions rejected by ① against the *current* reduction. Those that now pass —
   newly disoccluded surfaces — are rasterised.

Two phases exist because a single phase against stale depth drops surfaces that became visible this rotation, and
a single phase against no depth rasterises everything. Neither is acceptable; the second phase is small because
disocclusion is rare between adjacent rotations.

## 3. Rasterisation

Two paths, selected per partition by projected extent.

| Path              | Selected when                          | Mechanism                                        |
|-------------------|-----------------------------------------|---------------------------------------------------|
| Hardware raster   | Projected triangles exceed a few pixels| Standard graphics recording                       |
| Compute raster    | Projected triangles are sub-pixel      | 64-bit `atomicMax`, depth in the high bits        |

The compute path packs depth into the high bits of a 64-bit value and identity into the low bits, so a single
`atomicMax` resolves depth and identity together with no separate depth test and no read-modify-write hazard.
This is the whole reason the path exists: sub-pixel triangles defeat hardware rasterisation's fixed-function
coverage and quad occupancy, and dense topology produces them in quantity.

🔴 If the compute path's capability is absent, the substitution is hardware raster for all partitions — declared
in `08` §5, not branched at the recording site.

### 3.1 The coverage test — where cutout is resolved

`62` §2 rules that a cutout occupant is opaque where it is present, is resolved here at visibility time, and
writes `VisibilityIndex` so that `18`, `26`, `60` and `74` need no special case for it. That ruling is correct
and this document supplied no mechanism to satisfy it: a partition carries positions and indices, and thresholding
a coverage channel needs a domain position and a sampled channel. Recorded as `00` §10 conflict 31.

| Step | Behaviour                                                                          |
|------|-------------------------------------------------------------------------------------|
| ①    | The partition's material is read through §4.1's resolution; only cutout-enrolled materials proceed |
| ②    | The domain position is interpolated at the fragment from the triangle's coordinates |
| ③    | Channel 8 is sampled from `20`'s resident tiles at the coarsest **guaranteed** level |
| ④    | The value is thresholded against the per-material threshold `42` declares            |
| ⑤    | Below the threshold the fragment is discarded before depth resolution                |

🔴 Step ② interpolates and does not **write**. §4's rule is about the resolved target set, which stays three
narrow targets; a raster stage computing a value it consumes and discards has not widened anything. Conflating
the two would forbid the depth comparison as well.

🔴 Step ③ reads the coarsest **guaranteed-resident** level, per `20` §3, and never demands. A visibility
recording that could stall on residency has made the whole image wait for a leaf, and `20` §2.1's rule that
sampling never stalls is what makes this safe rather than merely fast.

⚠️ This is the edge that moves `16` from stratum 5 to stratum 7 in `00` §9.1. It is a real read and it is
cheaper than the alternative: resolving cutout in `18` means the fragment already won the depth test, so the
hole shows whatever is behind it at the wrong depth, and `60`'s projections see a solid leaf.

## 4. What Is Written

| Target              | Contents                                                     |
|---------------------|---------------------------------------------------------------|
| `DepthSurface`      | Resolved depth                                               |
| `VisibilityIndex`   | Partition identity and triangle index within the partition   |
| `OccupancySurface`  | Coverage — whether any surface resolved at this pixel        |
| `MotionSurface`     | Screen displacement of the resolved surface since the previous rotation |

Attributes are **not** written. Position, orientation, texture coordinates and derivatives are reconstructed in
`18` from the partition identity, the triangle index, and the pixel position. Reconstruction is what keeps the
resolved target narrow: three narrow targets instead of a wide attribute set, at every pixel, every rotation.

Identity is Tier A. `26` compares these identities to find selection edges, and a comparison of approximate
identities produces an outline that shimmers along silhouettes.

### 4.1 Resolving a partition to an occupant

🔴 A partition identity is **not** an occupant identity. What is written here indexes the partition population;
`26`'s enrolment test, §5's classification and `74`'s picking all need the occupant, and none of them can derive
it from what this document writes.

`42` declares the resolution — partition identity to occupant slot and generation, and from the occupant to its
material. It is a device-resident indexed lookup, derived when partitioning is derived and invalidated with it,
never a search. Every consumer reads that one resolution rather than deriving its own.

⚠️ This was absent from the series. `26` §1 ① instructed the reader to "resolve the occupant from
`VisibilityIndex`", which nothing made possible. Recorded as `00` §10 conflict 15.

### 4.2 Motion is not an attribute

`08` §2 declares `MotionSurface` produced here and `64` §2 depends on it, while §4's table omitted it and §6's
gate forbade it. As written, `64` could not function and this document could not pass its own gate. Recorded as
`00` §10 conflict 35.

🔴 Motion is written here because it is **free here and derivable nowhere else**. It is the difference between
the fragment's position under the current projection and under the previous rotation's projection with the
occupant's previous composed transform — two values the raster stage already holds. It is not a surface
attribute: nothing about the material or the domain enters it, and `18` reconstructs no motion.

⚠️ `64` §8 gates that reprojection is never derived from depth and the previous camera. That gate is only
satisfiable if motion is resolved where the surface resolves, which is here.

## 5. Material Classification

After resolution, pixels are classified by which material their resolved surface uses — through §4.1's resolution
— and a compacted list is produced per material. `18` then dispatches once per material over its own pixel list.

Classification is why shading cost tracks visible material variety. A scene with two hundred materials of which
six are visible dispatches six times.

### 5.1 The unoccupied class

Pixels where no surface resolved form their own class, and it is a class rather than an omission. `18` dispatches
over it and samples `28`'s `SkyViewSurface` along the view direction, or the constant floor when the atmosphere is
disabled — the same two sources `18` §5 already declares for the ambient term.

⚠️ Without this class nothing writes the background at all: `18` dispatches per material over pixels that resolved
to a surface, and an unoccupied pixel resolved to none. The image carries a hole exactly where the sky belongs.
`OccupancySurface` already records the distinction, so the class costs one dispatch and no new target.

## 6. Gates

- **Gate:** Partitions are 64 to 128 triangles and carry an extent and an orientation cone.
- **Gate:** Partitioning is derived on topology change, never per rotation.
- **Gate:** Both culling phases run; the second tests against the current rotation's reduction.
- **Gate:** No attribute other than depth, identity, coverage and motion is written. Motion is a property of the
  resolved surface, not of the material — §4.2.
- **Gate:** The coverage test reads only guaranteed-resident levels and never demands or stalls — §3.1.
- **Gate:** Identity is Tier A and integer throughout.
- **Gate:** The compute path packs depth in the high bits of the 64-bit `atomicMax`.
- **Gate:** Absent compute-raster capability degrades per `08` §5, not by a site-local branch.
- **Gate:** Per-material pixel lists are compacted before `18` dispatches.
- **Gate:** Occupant resolution reads `42`'s indexed lookup; no consumer derives its own.
- **Gate:** The unoccupied class is dispatched, so every pixel of the display extent is written.
- **Gate:** Nothing that is not an occupant surface is written here — overlays and manipulators are `80`.

## 7. Open

| Open question                                                       | Blocks                     |
|----------------------------------------------------------------------|-----------------------------|
| The projected-extent threshold selecting compute over hardware raster | Tuning; measure, do not guess |
| Whether partitioning runs on host or device                          | Topology-change latency only |
| Whether the orientation cone earns its storage at this partition size | Cull rate, measurable       |
