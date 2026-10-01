# 58 — BrushSpecification

`22` resolves a stroke against a brush and does not own one. Every reference to "the brush" anywhere in the
sequence resolves here — `00` §10 conflict 12 records that before this document those references named nothing.
A brush is a declaration: a shape, a spacing, a channel set, and a set of dynamics that read input axes.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                             |
| Layer       | `Layer3_Document`                                                               |
| Upstream    | `02` (sampling, `CurveSolver`), `10` (persistence), `36` (working space), `42` (channels), `50`/`52` (shape sources) |
| Downstream  | `22` resolves strokes against it; `76` holds the active one; `82` previews it   |
| Unblocks    | The brush every stroke in `22` is resolved against                              |

## 1. The Components

| Component            | What it owns                                                          |
|----------------------|------------------------------------------------------------------------|
| `BrushSpecification` | One brush — everything §2 declares                                    |
| `ImpressionShape`    | The shape of a single impression — §3                                 |
| `DynamicSpecification` | One input axis mapped onto one parameter — §4                       |
| `BrushIndex`         | Stored brushes, their identities and their groupings                  |
| `SpacingSpecification` | How a resampled path is spaced — §5                                 |

## 2. What A Brush Declares

| Declared     | Meaning                                                                     |
|--------------|------------------------------------------------------------------------------|
| Shape        | The coverage of one impression — §3                                         |
| Extent       | Radius in the domain, or in screen terms — §5's open row                     |
| Spacing      | Distance between resampled impressions, relative to extent                  |
| Channels     | Which of `42`'s channels the stroke writes, and the value written to each   |
| Combination  | `22` §3's `CombineSpecification`, per stroke                                |
| Dynamics     | Input axes mapped onto the above — §4                                       |

🔴 A brush declares a **channel set with a value per channel**, never a single colour. `22` §5's multi-channel
stroke is one transaction because one brush wrote both channels, and a brush that carried only a colour would make
painting roughness a separate tool with separate presets and a separate undo.

⚠️ A brush is not a tool. `76` holds which brush is active and holds tool state generally; this document declares
what a brush *is*. A brush stored inside the tool would make brushes unshareable between documents and unsavable
independently of the interface.

## 3. The Impression Shape

An impression's coverage comes from one of three sources, and all three produce the same thing — a continuous
coverage over the impression's extent.

| Source              | Declared as                                        | Resolved                              |
|---------------------|----------------------------------------------------|----------------------------------------|
| Analytic            | A profile from centre to edge                      | At the extent, every impression       |
| Imported imagery    | A single-channel image through `50`                | Sampled at the extent — `02` §6       |
| Vector outline      | An `OutlineSpecification` through `52`             | Through `52` §4, at the extent        |

🔴 A shape is coverage, not colour. An imported image supplies where the impression applies, and the values it
applies come from §2's channel set. A shape carrying colour would make every brush a per-channel asset, and an
artist changing colour would be editing an image.

⚠️ The vector source resolves through `52` §4's `PlanarClassifier` at Tier A, which is why a shaped brush has the
same silhouette in `82`'s preview as in the resolved stroke.

### 3.1 Rotation

| Behaviour     | Meaning                                                              |
|---------------|-----------------------------------------------------------------------|
| Fixed         | One declared angle, held per impression                              |
| Path-relative | The tangent of the resampled path at that impression                 |
| Input-driven  | A reported stylus rotation axis, through §4                          |
| Varied        | A declared variation about the above — §6                            |

Path-relative rotation reads the tangent of the **resampled** path from `22` §1 ③, not of the raw input, because
raw input at a low sample rate produces a tangent that jitters at every reported position.

## 4. Dynamics

A dynamic maps one input axis onto one brush parameter. `22` §1 delivers the axes; this document declares what
reads them.

| Axis         | Reported by                          | When absent                                    |
|--------------|--------------------------------------|-------------------------------------------------|
| Pressure     | The stylus, per `04` §3              | The dynamic falls back to its declared value   |
| Tilt         | The stylus, where supported          | The dynamic falls back to its declared value   |
| Rotation     | The stylus, where supported          | The dynamic falls back to its declared value   |
| Speed        | Derived from arrival timestamps      | Never absent                                    |
| Path distance| Derived from the resampled path      | Never absent                                    |

🔴 An absent axis falls back to a declared value; it never reads as zero. `22` §1 states this from the input side —
a tablet reporting no tilt and a stylus held upright are different facts. The document that has to act on that
distinction is this one, because the dynamic is here.

Each dynamic declares the axis, the parameter, the interval over which the parameter varies, and the progression
between the interval's ends. 🔴 The progression is **declared, never linear by assumption** — pressure mapped
linearly onto radius feels wrong to every artist who has used a stylus, and a brush that cannot state its own
progression is a brush every artist immediately abandons.

⚠️ Speed is derived from arrival timestamps, per `22` §1 ③. A speed dynamic driven by consumption times would make
the same gesture produce different strokes on different machines — the exact defect `04` §3's timestamping exists
to prevent.

## 5. Spacing

Spacing is declared relative to the impression extent, not in absolute distance, so a brush resized keeps its
character. `22` §1 ③ resamples the path at this spacing.

🔴 Spacing bounds the impression count, and the impression count bounds the work in `22` §2. A spacing that may be
declared arbitrarily fine is a brush that can stall a stroke, so spacing carries a declared floor and the floor is
reported through `86` when a brush reaches it rather than being silently applied.

## 6. Variation

A brush may declare variation on extent, rotation, coverage strength and position about the path. Every variation
declares an interval and reads a **stroke-seeded sequence**, never an unseeded one.

🔴 The sequence is seeded per stroke and recorded with the transaction. A stroke that varies from an unrecorded
source resolves differently every time it is re-resolved, so undo and redo would produce a different stroke from
the one the artist made, and `20`'s reconstruction of an evicted tile would disagree with what was on screen.

## 7. Storage And Presets

| Held                        | Where                                                                 |
|-----------------------------|------------------------------------------------------------------------|
| A brush declaration         | `BrushIndex`, stored with the application — `48` §6's per-application rule |
| A shape's imported source   | Beside the brush; embedded, per `48` §5's vector default              |
| Which brush is active       | `76`, per application                                                  |
| A brush used by a stroke    | Recorded with the transaction — §6's seed and the resolved parameters |

⚠️ A stroke records the brush parameters it resolved with, not a reference to the brush. An artist who edits a
brush and then undoes an old stroke must get that stroke's inverse, not the inverse the current brush would
produce.

## 8. Preview

`82` presents the impression the artist is about to apply, as a `22` §4.1 speculative extent. It resolves through
the same path a committed impression does, at the same extent, with the same shape — 🔴 a preview drawn as a
circle when the brush is a shaped outline is a preview that lies about the only thing the artist is looking at it
for.

Because it is speculative, it may resolve coarse and refine, never commits, and never blocks eviction.

## 9. Precision

| Computation                    | Tier | Reason                                                       |
|--------------------------------|------|---------------------------------------------------------------|
| Shape coverage                 | B    | Continuous; the visible result is the coverage                |
| Vector shape classification    | A    | `52` §4; host and device must agree — §8                      |
| Dynamic progression            | B    | Continuous over a declared interval                           |
| Spacing and resample positions | B    | Domain distances at 32 bits — `02` §3.2                       |
| Variation sequence             | A    | Integer; the same seed must produce the same sequence exactly |

🔴 The variation sequence is Tier A and parity-proven. It is generated on the host when `82` previews and on the
device when `22` resolves, and a sequence that disagrees produces a preview whose variation is not the variation
the artist gets.

## 10. Gates

- **Gate:** A brush declares a channel set with a value per channel, never a single colour.
- **Gate:** A brush is not a tool; `76` holds which one is active.
- **Gate:** A shape declares coverage only, never colour.
- **Gate:** Path-relative rotation reads the resampled path's tangent, not raw input.
- **Gate:** An absent input axis falls back to a declared value and never reads as zero.
- **Gate:** Every dynamic declares its progression; none is linear by assumption.
- **Gate:** Speed dynamics read arrival timestamps.
- **Gate:** Spacing is relative to extent and carries a declared floor, reported when reached.
- **Gate:** Variation reads a stroke-seeded sequence recorded with the transaction.
- **Gate:** A stroke records the parameters it resolved with, not a reference to a brush.
- **Gate:** The preview resolves the same shape at the same extent as the committed impression.
- **Gate:** The variation sequence is Tier A and parity-proven.

## 11. Open

| Open question                                                            | Blocks                          |
|---------------------------------------------------------------------------|----------------------------------|
| Whether extent is declared in the domain or in screen terms               | `22` §7 carries the same row     |
| Whether a brush may declare more than one shape and alternate between them| Presets only; not structural     |
| Whether brushes are grouped, and whether grouping is stored               | Interface presentation           |
| Whether a brush may read the surface it is painting onto                  | `56` §10 carries the same row    |
| Whether an eraser is a brush with `Erase` or a separate declaration        | `76` tool shape                  |
