# 36 — ColourSpecification

Every colour in Slate is a coordinate **and the space it is a coordinate in**. This document declares the spaces,
the conversions between them, and the one rule that prevents the most common defect in a painting application: an
image decoded twice, or not at all, because nobody recorded what it was.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateMath.lib` (the conversions), `SlateDocument.lib` (the declaration)      |
| Layers      | `Layer1_Numeric`, `Layer3_Document`                                           |
| Upstream    | `00` (tiers), `02` (`Shared/`, parity)                                        |
| Downstream  | `50`, `56`, `58`, `66`, `76`, `44`, `18`, `42`                               |
| Unblocks    | A declared working space; paint that matches display                         |

## 1, 2. The Components And The Three Spaces

✔️ Done — `ColourSpecification` carries its space identity and no bare triple exists in the tree. The working and
display spaces are declared as constants with distinct identities.

🚧 The working space is not yet stored per document, because `48` is unbuilt. When it is, it is declared per
document and never assumed — linear and wide enough that a saturated illuminant does not clip on entry, with a
document that predates the rule converted on open and the assumption reported.

⚠️ The display space is not the working space, is not stored in the document, and does not travel with it. `48`
gates the same for exposure and for the same reason: a document that looks different on the machine that opens it
is a document whose appearance belongs to the machine.

## 3. Content-Native Is Not Optional

🚧 Unbuilt — intake waits on `50`. Imagery arriving through it declares its own space at intake and is converted
into the working space once, there. The declaration comes from the content where the format carries one and from
the artist where it does not.

| Situation                                     | Behaviour                                                   |
|-----------------------------------------------|--------------------------------------------------------------|
| The content declares its space                 | Converted at intake; the declaration is recorded            |
| The content declares nothing                   | An assumption is made, recorded, and reported through `86`  |
| The artist overrides                           | Re-converted from the original, never from the converted    |

🔴 Re-conversion is always from the retained original. Converting a converted image is the defect where correcting
an artist's mistake makes the image worse than the mistake did.

## 4. Not Every Channel Is A Colour

🚧 The per-channel conversion decision at intake is unbuilt; `42` already declares the measure this section reads.
`18` declares twenty channels and only some carry colour. A roughness value put through a transfer function is a
wrong number that still looks like a plausible surface, which is why the mistake survives review.

| Channel carries         | Converted | Example                                    |
|-------------------------|-----------|---------------------------------------------|
| Reflectance or emission | Yes       | Base colour, emissive colour, transmission |
| A scalar measure        | No        | Roughness, occlusion, thickness            |
| A direction             | No        | Tangent-space perturbation                 |

`42` declares, per channel, which of the three a material's source is. Conversion at intake reads that declaration
and nothing else. There is no heuristic here — no inference from the image's own encoding, and none from its name.

## 5. Illuminant Colour

🚧 Unbuilt — waits on `44`. Its illuminants declare colour as a `ColourSpecification` and, where the illuminant is
described by a temperature instead, `WhiteProjection` produces the coordinate from it. The temperature is retained
as the authored value, because an artist who set 5600 expects to see 5600 when they return.

## 6. The Picker — `00` §12 Resolved

🚧 Unbuilt — waits on `76`. The ruling below stands and is what `76` must implement.

🔴 A colour sampled from the workspace is sampled **scene-referred**, before `66`, and converted into the working
space. This closes `00` §12's open row and `76` §6's copy of it.

The reason is that the alternative does not round-trip. A display-referred sample has been through exposure and
the tone projection; painting with it and then viewing the result applies both again, so what the artist sampled
is not what they get. The tone projection is not invertible in general, so no correction after the fact recovers
it.

Sampling the display value is offered as a **separate, named action** for the case it is actually right for —
matching a reference image placed beside the work. It reports that it is display-referred, because a value
sampled that way and painted will not match the thing it was sampled from.

## 7. Precision

✔️ Done — primaries derived from chromaticities on every call, the inverse solved rather than transcribed, von
Kries adaptation in Bradford cone space, both transfers with odd reflection for negatives, and the Planckian locus
refusing outside its declared interval. Space identity compares as an integer at Tier A; the projections are
Tier B.

## 8. Gates

- **Gate:** Every stored colour carries its space; no bare triple exists in the tree.
- **Gate:** The working space is declared in the document, never assumed.
- **Gate:** The display space is never stored in the document.
- **Gate:** Imported content is converted once, at intake, and re-conversion is from the retained original.
- **Gate:** An undeclared content space produces a recorded assumption and an `86` report.
- **Gate:** Only channels `42` declares as colour-carrying are converted.
- **Gate:** `ColourProjection` lives in `Shared/` and is proven at Tier B by `ParityRunner`.
- **Gate:** Workspace sampling is scene-referred; display sampling is a separate action and says so.

## 9. Open

| Open question                                                           | Blocks                        |
|--------------------------------------------------------------------------|--------------------------------|
| Which primaries the default working space uses                           | Nothing structural; a constant |
| Whether the display space is queried from the OS or declared in settings | `66` encode only               |
| Whether a document may declare a second working space for a layer        | `56`; probably refused         |
