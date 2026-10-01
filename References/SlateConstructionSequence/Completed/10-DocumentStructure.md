# 10 — DocumentStructure

`SlateDocument.lib` holds everything the engine can contain, name, persist and revise — and it holds none of it on
a device. It is a peer of `SlateVulkan`, linking neither it nor anything above it. That peer relationship is
the load-bearing property of the whole partition: a document model that cannot compile without a `VkDevice` has
already merged rendering into authoring, and no later discipline separates them again.

This is one of the two units `04-UnitDirectoryStructure.md` omits. It exists because `Layer2_Format` and
`Layer3_Document` are device-free by law and need a link target that enforces the law.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                             |
| Layers      | `Layer2_Format`, `Layer3_Document`                                              |
| Upstream    | `02` (transforms, tolerances), `04` (streams)                                   |
| Downstream  | `12` linearises it; `14` presents it; `20`, `22`, `24` author into it           |
| Unblocks    | Anything the engine can hold, name, save or undo                                |

## 1. Layer2_Format — Streams

✔️ `FormatCodec` done — signature, version and a migration chain assembled from declared entries, refusing a later
stream rather than reading it partially.

🚧 `ImageCodec`, `VectorCodec`, `TypefaceCodec` and `TopologyCodec` are unbuilt; `52` and `38` consume
specifications handed to them already decoded. Each keeps its declaration.

| Component        | Mechanism                                                       |
|------------------|------------------------------------------------------------------|
| `ImageCodec`     | Image stream translation, decoded to a declared colour space     |
| `VectorCodec`    | Vector stream translation — consumed by `52`                     |
| `TypefaceCodec`  | Typeface stream translation; glyph outlines — consumed by `52`   |
| `TopologyCodec`  | Polygon topology stream translation — conditioned by `38`        |

🔴 A codec translates a stream and does nothing else. It does not condition what it decoded, and it does not
decide whether the result is fit to use. `TopologyCodec` produces exactly what the file contained — including
n-gons, duplicate vertices, degenerate faces and absent orientation — and `38` is what makes it paintable. A codec
that silently repairs is a codec whose output cannot be trusted to describe the file.

Codecs read through `StorageExchange` from `04`, so a decode can be driven by byte-range arrival rather than by
whole-file completion. Every decoded image declares its colour space; an image with an assumed colour space is a
future colour defect with no traceable origin.

## 2. Layer3_Document — The Population

✔️ Done — `PopulationIndex` with `OccupancyIndex`, `PropertySpecification`, `TopologyStructure`, `SceneStructure`,
`EnrollmentIndex`, `RevisionSequence` and `SelectionSequence`. §2.1's generational identity, §2.2's validated
properties and §2.3's scrubbable inverse-recording revisions all hold as declared, and `SelectionSequence` is
session-scoped per `48` §2 — conflict 34 settled.

🚧 `SurfaceStructure` is unbuilt. Of the six components specified elsewhere, `MaterialSpecification` (`42`) is
built; `IlluminantPopulation` (`44`), `CameraProjection` (`46`), `SurfaceLayerSequence` (`56`),
`BrushSpecification` (`58`) and `40`'s spatial subdivisions are not. All are occupants or properties of occupants
in this same slot population and all obey generational identity.

🔴 `SurfaceLayerSequence` in `56` is where painted texels live. `20` §4 asserted they "live in `10`" while this
section declared nothing that could hold them — recorded as `00` §10 conflict 16.

🔴 Occupant identity is Tier A. It is an unsigned integer pair, never a real number, never hashed into a smaller
width for convenience. An identity that collides is not an identity.

⚠️ `HistoryStack` is the retired spelling. `History` is banned and "stack" understates it — the sequence is
scrubbable in both directions, not merely popped.

### 2.4 Transaction lifecycle

✔️ The four-stage lifecycle done — Open, Amend, Abandon, Seal, with merging declared per operation against a
declared interval and never inferred, and every transaction carrying the description `84` presents.

🔴 An open transaction is **not** in `RevisionSequence` and is not scrubbable. A drag that recorded a transaction
per pointer sample would fill the sequence with states the artist never intended to stop at, and undo would step
back one pixel at a time. `22`, `72`, `78` and `84` all use this lifecycle; none invents its own.

## 3. What Never Appears Here

| Absent                       | Because                                              |
|------------------------------|-------------------------------------------------------|
| Any Vulkan type or header    | The peer relationship is enforced by the linker       |
| Any ImGui type               | ImGui exists only inside `SlateUI`                    |
| Device residency knowledge   | `20` owns residency; the document owns the source     |
| Presentation-order knowledge | `12` derives order; the document holds the relations  |

## 4. Gates

- **Gate:** `SlateDocument` compiles with no include path to `SlateVulkan`, `SlateCompute` or `SlateUI`.
- **Gate:** Every occupant reference carries a generation, and resolution compares it.
- **Gate:** Occupant identity is an integer pair at Tier A.
- **Gate:** Every decoded image declares a colour space.
- **Gate:** Every format version has a declared migration, not a reader conditional.
- **Gate:** Every property declares its validation.
- **Gate:** Every transaction records its inverse.
- **Gate:** Every interactive edit uses the §2.4 lifecycle; no document invents its own.
- **Gate:** An open transaction is absent from `RevisionSequence` until it is sealed.
- **Gate:** Merging is declared per operation, never inferred.
- **Gate:** A codec translates only; conditioning and repair happen in `38`.

## 5. Open

| Open question                                                        | Blocks                     |
|------------------------------------------------------------------------|-----------------------------|
| Whether `RevisionSequence` is bounded, and by what — count or extent    | `22` memory, not design     |
| Which image formats ship in the first `ImageCodec`                      | Nothing structural          |
| Whether `SurfaceStructure` is needed before `24`                        | `24` scheduling only        |
