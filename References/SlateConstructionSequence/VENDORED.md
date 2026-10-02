# Vendored from SultanAladin/Slate

`AgenticInstuctions/ConstructionSequence`, copied here for reference. This repository is a different
lineage and did not carry these documents; only the `SKILL-*` files were present.

This is the authoritative design for surface painting. It was looked for and missed once: a search by
filename found no paint plan, because the documents are numbered by position in the construction order
rather than named after the feature. Search their contents, not their names.

The painting story, in reading order:

| Doc | Subject |
|---|---|
| `20-SurfaceTileSpace` | Resolution independence; demand-driven tile residency |
| `22-ImpressionSequence` | A stroke as transactional brush impressions in the parametric domain |
| `24-UvSurfaceDepot` | UV surfaces |
| `56-SurfaceLayerSequence` | Ordered surface content |
| `58-BrushSpecification` | Brushes |
| `68-ChartPartition` | Chart layout |
| `70-AnalyticProjection` | Description rather than texels |
| `72-DecalProjection` | Editable placed content |
| `54-TilingSpecification` | Repeating pattern as plane symmetry |
| `10-DocumentStructure` | `RevisionSequence`, invertible transactions |
| `84-RevisionPanel` | Scrubbing the history |
| `50-AssetInterchange` | Baked channels leaving for other programs |

Banned terms declared in these documents, which apply to any code written against them:
`Stack`, `Stamp`, `Mip`, `Table`.
