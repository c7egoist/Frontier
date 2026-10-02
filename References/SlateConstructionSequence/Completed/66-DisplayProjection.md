# 66 — DisplayProjection

Everything above `08` §3 ⑧ is radiance. Everything below it is display code. This document is that line: it takes
the accumulated scene-referred result, applies exposure, projects it into the display's gamut and range, and
encodes it. It is the last document that may treat a value as a physical quantity and the first that treats one as
a colour a monitor will show.

## Position In The Sequence

| Field       | Value                                                                                  |
|-------------|-----------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                      |
| Layer       | `Layer4_Compute`                                                                        |
| Upstream    | `02` (`ColourProjection`), `06`, `08` (ordering), `36` (spaces), `64` (`AccumulationSurface`) |
| Downstream  | `26`, `80` and `14` amend `DisplaySurface`; presentation reads it                       |
| Unblocks    | Exposure, tone projection, encoding — a viewable image                                  |

## 1. The Components

| Component               | What it owns                                                            |
|-------------------------|--------------------------------------------------------------------------|
| `DisplayProjection`     | Scene-referred radiance to display code — §3                            |
| `ExposureSpecification` | The declared exposure and its metering — §2                             |
| `ToneProjection`        | The range compression — §3                                              |
| `EncodeSpecification`   | The output transfer and the display space it targets — §4               |

## 2. Exposure

Exposure is applied first, in the working space, as a scale on radiance. It is one declared value.

| Source     | Behaviour                                                                       |
|------------|----------------------------------------------------------------------------------|
| Declared   | Read from `46`'s `CameraProjection` — an authored camera property held in the document |
| Metered    | Derived from a reduction of `AccumulationSurface`, over a declared interval      |

🔴 Exposure is an **authored camera property stored in the document** (`46` §6, `48` §2). `36` §2's reasoning about machine-dependence covers the display space (which stays out of the document); it does not extend to an authored decision about the image. `66` reads exposure from the active camera in `46`, while `76` holds only non-document application state (display mode, overlay toggles). Recorded as `00` §10 conflict 33.

⚠️ Metered exposure adapts over a declared interval and the interval is not zero. An exposure that tracks the
reduction instantly makes the whole workspace brighten when the artist orbits past a bright surface, and they
correct a stroke against a value that has already changed.

Metering is off by default. A painting application whose exposure moves while the artist paints is one where the
colour they mixed is not the colour they see a moment later.

## 3. Tone Projection

The scene carries radiance without an upper bound — emissive channels are `[0,∞)` in `18` §2 — and the display
has one. The projection compresses that range.

| Property                  | Requirement                                                          |
|---------------------------|-----------------------------------------------------------------------|
| Domain                    | Scene-referred, exposure applied, in the working space               |
| Range                     | The display's, in the display space                                  |
| Monotonic                 | Required — a brighter radiance is never a darker display code        |
| Hue behaviour             | Declared, not incidental — §3.1                                      |
| Neutral axis              | A neutral radiance projects to a neutral display code                |

🔴 The projection is **not invertible in general**, and every consumer that needs a scene-referred value takes it
before this point rather than inverting afterwards. `36` §6 is the case that matters: a colour sampled from the
workspace is sampled scene-referred, before `66`, precisely because no correction after the fact recovers it.

### 3.1 Hue

Compressing the three channels independently rotates hue as it desaturates, and a saturated red highlight becomes
orange as it brightens. The projection declares its hue behaviour rather than inheriting whatever per-channel
compression produces.

⚠️ This is not a preference. An artist painting a saturated colour and watching it shift as they brighten it
cannot tell whether the shift is in their paint or in the display, and every correction they make is a correction
to the wrong thing.

## 4. Encoding

After the projection, the value is in the display space of `36` §2 and is encoded with that space's transfer.

| Applied      | From                                          |
|--------------|------------------------------------------------|
| Primaries    | `36`'s display space, through `02` §5's `ColourProjection` |
| White point  | `36`'s `WhiteProjection`, where they differ    |
| Transfer     | `36`'s `TransferSpecification`                 |

🔴 The transfer is applied exactly once, here. `06` declares the presentation format and a format that carries
its own transfer is declared as such, so that this document does not apply a second one. A value encoded twice is
the most common defect in a display path and it looks merely "a bit washed out", which is why it survives.

⚠️ The display space is queried or declared per `36` §9's open row and is **never** assumed to be the working
space. Assuming they match produces an image that is correct on exactly one monitor.

## 5. What Records After This

`DisplaySurface` is produced here and amended by `26`, `80` and `14`, in that order, per `08` §2.

🔴 None of those three is projected or encoded by this document. They author display code directly, in the
display space, and `08` §3.1 declares why: a selection outline passed through a tone projection changes colour
with exposure, and at high exposure the outline that exists to be unmistakable becomes the same white as
everything around it.

⚠️ This means an overlay colour is authored in the display space and does not round-trip to a working-space
colour. `80` and `26` declare their colours as display-referred `ColourSpecification` values — `36` §1 already
requires the space to travel with the coordinate, so nothing here is a special case.

## 6. Ordering

`66` records at `08` §3 ⑧. It produces `DisplaySurface`, reads `AccumulationSurface`, and amends nothing.

It is the only document that reads across the line. Everything before it works in radiance; everything after it
works in display code; and there is exactly one recording where a value crosses.

## 7. Precision

| Computation                    | Tier | Reason                                                          |
|--------------------------------|------|------------------------------------------------------------------|
| Exposure scale                 | B    | A multiply in the working space                                 |
| Metering reduction             | B    | Continuous; ordered recombination per `02` §5                   |
| Tone projection                | B    | Continuous and non-linear; error is visible as banding          |
| Primaries and white projection | B    | `36` §7's tiers, unamended                                      |
| Transfer encode                | B    | `36` §7; the error compounds at the encode                      |
| Display space identity         | A    | An integer; a mistaken match encodes for the wrong display      |

🔴 The metering reduction is ordered per `02` §5. A reduction that accumulates in arrival order is a different
number each run at Tier B, and the difference is an exposure that changes between runs on an unchanged workspace.

## 8. Gates

- **Gate:** Exposure is an authored camera property stored in the document (`46` §6) and read from `46`'s presented camera.
- **Gate:** Metering adapts over a declared non-zero interval and is off by default.
- **Gate:** The tone projection is monotonic and maps a neutral radiance to a neutral display code.
- **Gate:** Hue behaviour is declared, not a consequence of per-channel compression.
- **Gate:** No consumer inverts the projection; scene-referred values are taken before this recording.
- **Gate:** The output transfer is applied exactly once in the whole engine, here.
- **Gate:** The display space is queried or declared, never assumed to be the working space.
- **Gate:** `26`, `80` and `14` author display code directly and are never projected or encoded here.
- **Gate:** `66` is the only recording where a value crosses `08` §3.1's line.

## 9. Open

| Open question                                                              | Blocks                             |
|-----------------------------------------------------------------------------|-------------------------------------|
| Which tone projection — the specific curve and its parameters               | Appearance; a constant, not a shape |
| Whether the projection is a closed form or a resident lookup                | Cost; measure                       |
| The metering interval and the reduction's extent                            | Tuning; off by default anyway       |
| Whether a high-range display path exists, skipping the compression          | `06` presentation format            |
| Whether the display space is queried from the platform — `36` §9's row       | `04` platform coverage              |
