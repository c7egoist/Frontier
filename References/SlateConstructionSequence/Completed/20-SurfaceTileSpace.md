# 20 — SurfaceTileSpace

Painting in Slate is resolution-independent. A stroke is recorded against the surface's parametric domain, not
against a pixel population, and the pixels that back it are a residency decision made independently and revisable
without touching the stroke. Working extents exceed what fits on a device, so residency is demand-driven: the
device requests what it needs, the request is drained with latency, and promotion is budget-bounded.

This is the mechanism that makes `22` possible. A stroke recorded against pixels cannot be re-resolved; a stroke
recorded against the domain can.

## Position In The Sequence

| Field       | Value                                                                     |
|-------------|----------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                         |
| Layer       | `Layer4_Compute`                                                           |
| Upstream    | `02` (surface space), `06` (extents, transfers), `56` (layer content), `68` (the domain) |
| Downstream  | `22` paints into it; `24` transfers into it; `70` resolves into it; `18` samples it |
| Unblocks    | Resolution-independent paintable surfaces                                  |

## 1. Subdivision

| Parameter               | Value | Meaning                                              |
|-------------------------|-------|-------------------------------------------------------|
| `VirtualCellsPerEdge`   | 64    | Cells per edge of the parametric domain              |
| `PhysicalTileTexels`    | 128   | Texels per edge of a resident tile                   |
| `PhysicalTileApron`     | 4     | Texels of duplicated border on each side             |
| `MaximumWorkingEdge`    | 8192  | Largest working extent per edge                      |

The domain is divided into `VirtualCellsPerEdge` squared cells. A cell is resident or not; a resident cell is
backed by one tile of `PhysicalTileTexels` squared plus an apron.

The apron duplicates the neighbouring tiles' border texels so that filtered sampling and brush impressions near a
tile edge read valid neighbours without a residency check per sample. Four texels covers trilinear filtering plus
the widest impression footprint at the reduction levels that are stored. Without it, every seam in the domain is
visible in the result.

## 2. Residency

| Component             | Mechanism                                                     |
|-----------------------|----------------------------------------------------------------|
| `CellSpace`           | One cell's interior subdivision and residency record          |
| `TileSpace`           | Physical tile extents, sliced and reclaimed                   |
| `RequestQueue`        | Device-written cell demands, drained with latency             |
| `ReturnIndex`         | The readback half of the request traffic specifically         |
| `PageQueue`           | The drained arrival order                                     |
| `PromotionScheduler`  | Budget-bounded promotion and eviction ordering                |
| `SurfaceDepot`        | Derived, evictable, reconstructible surface artefacts          |

### 2.1 The demand cycle

① Sampling writes a demand for any non-resident cell it touched.
② `ReturnIndex` reads demands back with a latency of the recording slot count.
③ `PageQueue` presents them in arrival order.
④ `PromotionScheduler` promotes within a per-slot budget and evicts to make room.
⑤ Promotion reconstructs the tile from one of three sources, then writes the apron.

| Reconstruction source | Holds                                                   | Cost bounded by     |
|-----------------------|----------------------------------------------------------|----------------------|
| `56`'s layer sequence | Authored painted texels                                  | Transfer volume      |
| `SurfaceDepot`        | A previously derived artefact, still valid               | Transfer volume      |
| `70`'s resolution     | Analytic sources — outlines, tiling, placed content       | Evaluation cost      |

🔴 The third source resolves **at the promoted level's resolution**. This is what the domain being
resolution-independent is for: an outline or a repeating pattern is not stored as texels at any resolution, so a
finer level is a re-resolution rather than a magnification. Nothing in `10` holds its texels.

🔴 Demands are latent by the recording slot count. Sampling a non-resident cell must produce something immediately —
the coarsest resident reduction — rather than stalling. A residency system that stalls on demand has converted a
memory problem into a frame-time problem.

### 2.2 Budget

Promotion is bounded per rotation by **two** independent measures, not by tile count. An unbounded promotion burst
on a camera cut produces a stall exactly where it is most visible. Exceeding either budget defers, and deferral is
normal operation rather than an error.

| Measure          | Bounds                                                              |
|------------------|----------------------------------------------------------------------|
| Transfer volume  | Reconstruction from `56` and from `SurfaceDepot`                     |
| Evaluation cost  | Analytic resolution through `70`                                     |

🔴 Transfer volume alone does not bound analytic resolution, because an analytically resolved tile transfers
**nothing** — it is produced on the device from a source description. A surface carrying many analytic layers can
therefore consume unbounded device time while the transfer measure truthfully reports zero. The second measure is
what makes the budget describe the work rather than one visible symptom of it.

## 3. Reduction Levels

Each surface carries a reduction chain down to a single resident tile. The coarsest levels are always resident,
so every sample has an answer regardless of what is promoted.

⚠️ `Mip` is banned. The chain is a reduction chain, and levels are reduction levels.

## 4. Eviction

`SurfaceDepot` holds derived, evictable, reconstructible artefacts keyed by content — reduction levels and
transferred results. Eviction requires reconstructibility: an artefact that cannot be rebuilt is not evictable and
does not belong in the depot.

🔴 Painted texels are **not** derived. They are authored content, and they live in `56`'s layer sequence inside
`10` — not in a tile. A tile holding uncommitted paint is never evicted; `22` commits paint into the document
before its tile becomes eligible.

⚠️ Earlier wording said painted texels "live in `10`" without naming a component that could hold them, and `10`
declared none. `56` is that component. The relationship it establishes is three-way and every part of it is
load-bearing:

- `56`'s layer sequence is the **single source of truth** for surface content.
- A resident tile is a **derived projection** of that sequence at one level, and is discardable.
- `22`'s extent-bounded inverse and `RevisionSequence`'s replay both address the sequence, never the tile.

Content authored by placement is a different case and the distinction decides evictability:

| Content            | The authored thing                              | Resolved texels are      | Evictable |
|--------------------|--------------------------------------------------|--------------------------|-----------|
| Painted impressions| The texels themselves                            | the authored content     | No        |
| Placed content     | Source plus the transform relative to the surface | a derived projection     | Yes       |
| Tiling             | The pattern declaration in `54`                  | a derived projection     | Yes       |

🔴 This is why placed content stays editable after it is placed. If placement resolved into painted texels, moving
it afterwards would mean undo and place again — and every artist rejects that. The corollary is that placed
content's resolved texels are legally reconstructible and belong in `SurfaceDepot`, which is a memory saving
rather than merely a correction.

## 5. Gates

- **Gate:** Every stroke and every transfer addresses the domain, never a resident tile directly.
- **Gate:** Every resident tile carries a written apron.
- **Gate:** Sampling a non-resident cell returns the coarsest resident level and never stalls.
- **Gate:** Promotion is bounded per rotation by transfer volume **and** by evaluation cost.
- **Gate:** The coarsest reduction levels are permanently resident.
- **Gate:** Only reconstructible artefacts enter `SurfaceDepot`.
- **Gate:** No tile holding uncommitted paint is evicted.
- **Gate:** Reclamation is deferred by the recording slot count.
- **Gate:** No tile is the source of truth for any content; `56` is, and a tile is a projection of it.
- **Gate:** A speculative extent never blocks eviction and never enters `RevisionSequence`.

## 6. Open

| Open question                                                    | Blocks                    |
|--------------------------------------------------------------------|----------------------------|
| Per-slot promotion budget in transfer volume                   | Tuning; measure            |
| Whether a dedicated transfer queue is warranted for promotion       | `06` §8 carries this too   |
| Eviction ordering — least-recent, or distance from the camera       | Tuning only                |
| Whether `MaximumWorkingEdge` is per surface or per document         | `10` format                |
