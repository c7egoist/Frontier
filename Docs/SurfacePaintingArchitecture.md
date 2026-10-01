# Surface Painting Architecture

How the Slate CAD construction sequence maps onto this tree. The sequence is vendored at
`References/SlateConstructionSequence/` and is authoritative for *mechanism*; this note is authoritative for
*where the mechanism lives here*.

## The three properties the design exists to buy

- **The history is the asset.** A stroke is recorded against the surface's parametric domain, not against a
  pixel population. Texels are a derived, revisable residency decision (`20` §1).
- **Re-resolvable.** Because the stroke is a domain record committed as an invertible transaction, the same
  surface can be re-resolved at a different working resolution without repainting (`22` §1, `10` §2.3).
- **Device-side evaluation.** Texels are produced on the GPU against demand-driven, budget-bounded tile
  residency. This is what keeps a repaint off the CPU rather than spiking it (`20` §2).

## Subsystem map

Slate CAD is built as `Slate*.lib` units behind a numbered `Layer1`–`Layer5` split. This tree has neither —
the engine is flat under `Frontier/Engine/<Subsystem>`, per `Docs/FlattenedEngineTree.md`. The translation:

| Slate CAD unit      | Layer              | Frontier home                                     |
|---------------------|--------------------|---------------------------------------------------|
| `SlateDocument.lib` | `Layer3_Document`  | `Engine/ContentInterchange`                       |
| `SlateCompute.lib`  | `Layer4_Compute`   | `Engine/DeviceExchange` + `Engine/Shaders`        |
| `SlateUI.lib`       | `Layer5_Interface` | `Engine/Editor` + `Engine/SpatialInterface`       |
| `Layer2_Format`     | —                  | `Engine/ContentInterchange` codecs                |

## Document placement

| Doc                     | What it fixes                                              | Frontier home                     |
|-------------------------|------------------------------------------------------------|-----------------------------------|
| `20-SurfaceTileSpace`   | Resolution independence; demand-driven tile residency      | `DeviceExchange` + `Shaders`      |
| `22-ImpressionSequence` | Strokes as transactional impressions in the domain         | `ContentInterchange` + `Shaders`  |
| `24-UvSurfaceDepot`     | UV surfaces, evictable and reconstructible                 | `DeviceExchange` + `Shaders`      |
| `56-SurfaceLayerSequence` | Ordered surface content and the order it is read in      | `ContentInterchange`              |
| `58-BrushSpecification` | What a brush is                                            | `ContentInterchange`              |
| `68-ChartPartition`     | Chart layout                                               | `DeviceExchange` + `Shaders`      |
| `70-AnalyticProjection` | Content that is a description rather than texels           | `DeviceExchange` + `Shaders`      |
| `72-DecalProjection`    | Placed content that stays editable                         | `ContentInterchange` + `Shaders`  |
| `54-TilingSpecification` | Repeating pattern as a declaration of plane symmetry      | `ContentInterchange`              |
| `10-DocumentStructure`  | `RevisionSequence`; every transaction invertible           | `ContentInterchange`              |
| `84-RevisionPanel`      | Scrubbing the history in both directions                   | `Editor` + `SpatialInterface`     |
| `50-AssetInterchange`   | Baked channels leaving for other programs                  | `ContentInterchange`              |

## What this tree already provides

The adaptation is cheaper than it looks, because three of the contracts already exist here.

- `Engine/ContentInterchange/TextureIndex.h` already states that *"the same Name replaces the slot IN PLACE —
  the texels move, the slot stays, exactly what a re-bake wants (descriptors name slots, never heaps)."*
  That is precisely the hook re-resolving at another resolution needs: the material descriptor keeps naming a
  slot while the texels behind it are rebuilt at a new size.
- `Engine/ContentInterchange/` already owns `MaterialDescriptor`, `MaterialIndex` and `UnifiedMaterialEvaluation`,
  so `56`'s layer sequence has an obvious neighbour rather than a new home.
- `Editor/AuthoringTools/Modelling/SolidArc/Document/UndoSequence.{h,cpp}` is a working invertible-transaction
  log in this tree. `10` §2.3 and `84` describe a scrubbable superset of it, not a different idea.

## Naming

The construction sequence's names are already compliant with `AgenticInstuctions/SKILL-Naming.md` — the closed
suffix list gives `Sequence` as *"ordered workflow — strokes, layer order, revisions"*, `Space` as *"spatial
subdivision — tile"*, and `Depot` as *"a store of derived, evictable, reconstructible artefacts"*. No renaming
is required, and no new name should be invented where the sequence already fixes one.

⚠️ These documents declare bans that apply to any code written against them: `Stack`, `Stamp`, `Mip`, `Table`.
The ordered content of a surface is a `SurfaceLayerSequence` and a position in it is a sequence position; one
resolved brush placement is an `ImpressionSample`.
