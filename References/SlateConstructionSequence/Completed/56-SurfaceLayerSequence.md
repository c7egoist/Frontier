# 56 — SurfaceLayerSequence

`20` §4 states that painted texels are authored content, that they live here, and that a resident tile is a derived
projection of what this document holds. This is that document. It owns the ordered content of a surface: what was
painted, what was placed onto it, what is resolved into it analytically, and the order in which all of it is read.

⚠️ `Stack` is banned. The ordered content of a surface is a `SurfaceLayerSequence`, and a position in it is a
sequence position.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                             |
| Layer       | `Layer3_Document`                                                               |
| Upstream    | `02`, `10` (population, transactions), `36` (working space), `42` (channels), `68` (the domain) |
| Downstream  | `20` reconstructs from it; `22` paints into it; `70` resolves into it; `72` places into it; `50` emits it |
| Unblocks    | Surface content that is ordered, revisable and resolution-independent          |

## 1. The Components

| Component               | What it owns                                                        |
|-------------------------|----------------------------------------------------------------------|
| `SurfaceLayerSequence`  | The ordered content of one surface, per channel                     |
| `LayerSpecification`    | One entry — its source, its channels, its combination — §2          |
| `CoverageSpecification` | Where a layer applies, and how strongly — §5                        |
| `LayerIndex`            | Identity and lookup across the sequence, including nested sequences |
| `ContentSpecification`  | The four content sources of §3, as one declared union               |

## 2. A Layer Is A Declaration With A Source

Every entry declares four things, and nothing downstream reads an entry without all four:

| Declared        | Meaning                                                                  |
|-----------------|---------------------------------------------------------------------------|
| Source          | Where the content comes from — §3                                        |
| Channels        | Which of `42`'s channels the entry writes; a subset, never implicitly all |
| Combination     | How it reads against what precedes it — `22` §3's `CombineSpecification`  |
| Coverage        | Where it applies, and at what strength — §5                              |

🔴 The combination specification is `22` §3's, unamended and not re-declared here. `22` applies it between
impressions within a stroke; this document applies it between entries in the sequence. Two documents declaring two
sets of combination behaviours produce a surface whose result changes depending on whether content arrived as a
stroke or as a layer, which is a difference the artist cannot see and cannot correct.

⚠️ A layer that declares no channel subset writes nothing. Defaulting to all twenty channels means a colour layer
silently overwrites roughness, and the artist discovers it at export.

## 3. Four Content Sources, Two Storage Behaviours

| Source              | The authored thing                          | Held in `10` as         | Reconstructible |
|---------------------|---------------------------------------------|--------------------------|------------------|
| Painted impressions | The texels — `22`                           | Texels, at the working extent | No          |
| Placed content      | A source plus a transform — `72`            | The source and transform | Yes             |
| Tiling              | The pattern declaration — `54`              | The declaration          | Yes             |
| Analytic resolution | An outline or an analytic source — `70`     | The source description   | Yes             |

🔴 This is `20` §4's table read from the document side, and it decides evictability from here rather than from the
residency system. `20` never decides what may be discarded; it reads the decision this document already made. A
residency system that classified content itself would be classifying content it can only see as texels.

Only the first row stores texels. The other three store a description that `70` resolves at whatever reduction
level was promoted, which is what `20` §2.1's third reconstruction source is reading.

⚠️ Painted texels are stored at the surface's working extent and are the one thing in a document that a change of working extent or domain re-partition resamples. When `68` re-partitions the domain, `68` advances the partition revision while `56` §3.1 resamples the authored texels into the new domain on the tick, confirming the operation and reporting it through `86`. Recorded as `00` §10 conflict 40. Everything else is re-resolved, and re-resolution is exact where resampling is not.

## 4. Order Is The Sequence, And It Is The Only Ordering Authority

Entries are read in sequence order, and that order is the sole answer to "what is on top". No entry carries a
depth, a priority or an ordinal that could disagree with its position.

Placed content — decals from `72`, text and imagery included — occupies a sequence position exactly as a painted
layer does. 🔴 The outliner in `12` **presents** that order and edits it; it does not hold a second one. A tool
palette that reorders in the outliner and a tool that reorders in a layer panel are editing the same sequence, so
the two views can never disagree.

### 4.1 Nested sequences

An entry may itself be a sequence. A nested sequence declares its own combination and its own coverage, and it
reads against what precedes it as a single entry does.

| Property                          | Behaviour                                                       |
|-----------------------------------|------------------------------------------------------------------|
| Combination of the nested content | Applied within the nested sequence first                        |
| Combination of the nested entry   | Applied once, to the nested result                              |
| Coverage of the nested entry      | Applied to the nested result, not to each entry inside it       |
| Channels of the nested entry      | The union of what its entries write, restricted by its own set  |

⚠️ Applying the enclosing coverage per entry rather than once to the result is the defect that makes a partly
covered nested sequence darken at its own internal overlaps. It is the same defect `22` §3 fixes by accumulating a
stroke once and applying it once, at a different scale.

## 5. Coverage

`CoverageSpecification` declares where an entry applies. It is a continuous value in the domain, not a decision per
texel, and it has the same four sources §3 declares — it may be painted, placed, tiled or resolved analytically.

🔴 Coverage is content, and it is revisable through `RevisionSequence` like any other content. Painting coverage is
a stroke, undone by `22` §4's extent-bounded inverse, and nothing about it is a separate mechanism.

## 6. Revisions

Every amendment to the sequence is a transaction in `10`'s `RevisionSequence`, and its inverse is bounded by what
it touched:

| Amendment                    | Inverse is bounded by                              |
|------------------------------|-----------------------------------------------------|
| A stroke                     | The extents touched — `22` §4                      |
| Reordering an entry          | Two sequence positions                             |
| Presenting or hiding an entry| One declared value                                 |
| Amending a combination       | One declared value                                 |
| Removing an entry            | The entry — its source, not its resolved texels    |

🔴 Removing an entry that stores a description retains the description, never the texels it had resolved to. Texels
resolved from a description are in `SurfaceDepot` under `20` §4 and are reconstructible by definition, so recording
them in an inverse would store a derivation inside the document to undo a change that does not need it.

⚠️ Presenting and hiding are amendments and are recorded. An artist who hides a layer, saves, reopens and finds it
presented has been told the document does not hold what they see.

## 7. Resolution Independence

Nothing in this document addresses a tile, a texel population or a device resource. Entries address `68`'s
parametric domain, and `20` projects the sequence onto whatever is resident.

🔴 This is the property `20`'s opening paragraph claims and this document supplies. A layer sequence that held
device extents would make the working extent a property of the file, and changing it would be an import rather than
an amendment.

## 8. Precision

| Computation                     | Tier | Reason                                                        |
|---------------------------------|------|----------------------------------------------------------------|
| Entry identity and generation   | A    | `10` §2.1's integer pair; a collision reorders a surface       |
| Sequence position               | A    | An integer ordinal; order is not approximate                   |
| Channel value combination       | B    | Continuous; the working space is `36`'s                        |
| Coverage value                  | B    | Continuous; quantisation at the stored depth only              |
| Domain positions                | B    | `02` §3.2's surface space, at 32 bits                          |

## 9. Gates

- **Gate:** Every entry declares source, channels, combination and coverage; none is implicit.
- **Gate:** Combination behaviour is `22` §3's, not a second declaration.
- **Gate:** Painted texels are the only stored content; the other three sources store descriptions.
- **Gate:** Sequence position is the only ordering authority; no entry carries a second ordinal.
- **Gate:** `12`'s outliner presents and edits this sequence and never holds a separate order.
- **Gate:** A nested sequence combines internally first, then reads as one entry.
- **Gate:** Enclosing coverage applies once to a nested result, never per entry inside it.
- **Gate:** Coverage is content and is revised through `RevisionSequence`.
- **Gate:** Every amendment is a transaction with an inverse bounded by what it touched.
- **Gate:** Presenting and hiding are recorded amendments.
- **Gate:** No entry addresses a tile, a texel population or a device resource.

## 10. Open

| Open question                                                              | Blocks                         |
|-----------------------------------------------------------------------------|---------------------------------|
| Whether an entry may target more than one surface                          | `22` §7 carries the same row    |
| Whether nesting depth is bounded, and at what depth                        | Interface presentation only     |
| Whether coverage is stored at a lower extent than the content it restricts  | Memory; not structural          |
| Whether a working-extent change resamples in place or on next resolution    | `20` promotion behaviour        |
| Whether an entry may read a channel it does not write                       | `70` resolution inputs          |
