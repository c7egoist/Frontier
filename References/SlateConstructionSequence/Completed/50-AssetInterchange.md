# 50 — AssetInterchange

Topology and imagery arrive from files other programs wrote, and painted channels leave for programs Slate does
not control. This document is both directions. The export half is the one that matters commercially: a painting
application whose output cannot be loaded by the renderer the artist actually ships in is a painting application
nobody uses twice.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                          |
| Layer       | `Layer3_Document`                                                            |
| Upstream    | `04` (`StorageExchange`), `10` (codecs, population), `34`, `36`, `42`, `48`  |
| Downstream  | `38` (conditioning), `56`, `72`, `20`, `86`                                  |
| Unblocks    | Topology and imagery in; painted channels **out**                            |

## 1. The Components

| Component              | What it owns                                                       |
|------------------------|---------------------------------------------------------------------|
| `AssetInterchange`     | Intake and emission as one contract, in both directions            |
| `TopologyCodec`        | Polygon topology and its attributes, per format                    |
| `ImageCodec`           | Raster imagery and its declared colour space, per format           |
| `EmissionSpecification`| What an export produces — §5                                       |
| `IntakeIndex`          | What arrived, from where, and what was assumed about it            |

## 2. Intake Is Three Steps, And They Are Separate

| Step | Owned by  | Produces                                                    |
|------|-----------|--------------------------------------------------------------|
| ①    | This file | A decoded specification, faithful to the source             |
| ②    | This file | Occupants in `10`'s population, enrolled in `12`            |
| ③    | `38`      | Derived companions — adjacency, extents, tangent basis      |

🔴 Step ① never repairs. `38`'s non-mutation rule begins here: a codec that welds vertices, reverses winding or
drops a degenerate face has produced a specification that no longer describes the file the artist supplied, and
`38`'s guarantee that an index means the same thing afterwards is already broken before `38` runs.

Step ③ runs through `34` at `Interactive` priority and is where the cost is. Steps ① and ② are bounded by the
file; step ③ is bounded by the topology.

⚠️ An intake that partially fails does not partially populate. Half a topology enrolled as an occupant is an
occupant the artist will paint on and export.

## 3. What Arrives, And What Is Assumed About It

| Arrives              | Held as                                     | When the file is silent            |
|----------------------|---------------------------------------------|-------------------------------------|
| Positions            | Document space at 64-bit — `02` §3.2        | Refused; there is no default       |
| Face indexing        | `TopologyStructure` in `10`                 | Refused                            |
| Texture coordinates  | The imported indexing — `38` §2             | Absent; `68` produces a domain     |
| Perpendiculars       | As supplied                                 | Absent; `38` derives them          |
| Tangent basis        | As supplied — `38` §4 uses it unamended     | Absent; `38` derives it            |
| Material assignment  | An enrollment onto `42`'s materials         | One material for the whole occupant|
| Unit scale           | A declared scale applied at intake          | Assumed, recorded, reported        |
| Imagery colour space | Declared to `36` §3                         | Assumed, recorded, reported        |

🔴 An assumption is **recorded in `IntakeIndex` and reported through `86`**, never made silently. The two rows
that assume — unit scale and colour space — are the two that produce a result which looks plausible and is wrong:
a model at a hundredth of its intended size still renders, and an image decoded as though it were linear still
looks like an image.

⚠️ Unit scale is applied at intake and not carried as a per-occupant multiplier. A scene where each occupant
carries its own unit convention is a scene where `02` §3.2's rebasing is correct and the geometry still does not
line up.

## 4. Imagery

`ImageCodec` decodes to the content-native space `36` §3 declares, and conversion into the working space happens
once, there. This document does not convert; it declares.

| Property           | Behaviour                                                            |
|--------------------|-----------------------------------------------------------------------|
| Colour space       | Declared by the content where the format carries it — `36` §3        |
| Channel measure    | Read from `42`'s declaration at the point of use, never inferred     |
| Bit depth          | Retained; never narrowed at intake                                   |
| The original       | Retained, so `36` §3's re-conversion is from it                      |

🔴 There is no inference from file name, channel count or encoding. `42` §3 states this from the other side, and
this is the document where the temptation lives — the intake path is exactly where a file called `_normal` looks
like a helpful signal.

## 5. Emission — The Export Half

`EmissionSpecification` declares what leaves: which channels, at what extent, in what layout, for which consumer.

| Declared           | Meaning                                                             |
|--------------------|----------------------------------------------------------------------|
| Channel selection  | Which of `42`'s channels are written                                |
| Extent             | Texels per edge, per channel — not one extent for all               |
| Arrangement        | Which channels share an image, and in which components              |
| Colour space       | Per emitted image, declared and written into it where the format can|
| Naming             | A declared pattern over occupant, material and channel              |

🔴 An emission resolves the domain at the declared extent through the same path `20` promotes tiles with — `56`'s
layers and `70`'s analytic sources, resolved at the emission's level. It is **not** a readback of resident tiles.
Residency is a display decision bounded by device memory; an export bounded by what happened to be resident is an
export whose content depends on where the artist last looked.

⚠️ Emission runs through `34` at `Background`, and the document remains editable while it runs. It reads a sealed
state per `48` §3, so an export started before an edit contains the state at the moment it started.

Emission writes through `48` §3's write-verify-replace sequence. An export that half-overwrites last week's
export has destroyed a deliverable to produce nothing.

### 5.1 The arrangement is declared, never conventional

Packing occlusion, roughness and metalness into three components of one image is one convention among many, and
the consumer decides which. The arrangement is part of the emission specification and is presented to the artist,
because a wrong arrangement is a shipped asset that renders as a plausible, wrong surface.

## 6. Round-Tripping Is Not Claimed

| Claim                                     | Made |
|-------------------------------------------|------|
| Imported topology is exported unchanged   | Yes  |
| Painted channels export faithfully        | Yes  |
| An imported file re-exports byte-identical| No   |
| Every source construct survives export    | No   |

🔴 What is claimed is that the topology is unchanged — the same vertices, the same indexing, the same order —
because `38` never mutated it. What is not claimed is that a format's every construct survives a passage through
Slate's population. Constructs that do not survive are named at intake, through `86`, at the moment they arrive
rather than at the moment they are missed.

## 7. Precision

| Computation                | Tier | Reason                                                    |
|----------------------------|------|------------------------------------------------------------|
| Position decode            | A    | At the file's width, widened never narrowed               |
| Index decode               | A    | An integer; a misread index is a wrong face               |
| Unit scale application     | B    | One multiplication, applied once at intake                |
| Channel value emission     | B    | Continuous; quantised once at the declared depth          |

## 8. Gates

- **Gate:** Intake never repairs; the decoded specification is faithful to the source.
- **Gate:** A partially failed intake enrolls nothing.
- **Gate:** Every assumption is recorded in `IntakeIndex` and reported through `86`.
- **Gate:** Unit scale is applied once at intake, never carried per occupant.
- **Gate:** Channel measure is read from `42`, never inferred from name, encoding or channel count.
- **Gate:** The original imported image is retained for `36` §3's re-conversion.
- **Gate:** Emission resolves the domain at its declared extent and never reads back resident tiles.
- **Gate:** Emission runs through `34` at `Background` and reads sealed state.
- **Gate:** Emission writes through `48` §3's write-verify-replace sequence.
- **Gate:** The channel arrangement is declared and presented, never conventional.
- **Gate:** Constructs that will not survive are named at intake, not at export.

## 9. Open

| Open question                                                            | Blocks                        |
|---------------------------------------------------------------------------|--------------------------------|
| Which topology and image formats ship first                               | Coverage only; not structural  |
| Whether illuminants and cameras are read from an imported file            | `44` §9 carries the same row   |
| Whether emission may target a subset of the population                    | `12` enrollment shape          |
| Whether an emission specification is stored in the document               | `48` document content          |
| Whether imported animation data is refused or ignored                     | `00` §5 declares it absent     |
