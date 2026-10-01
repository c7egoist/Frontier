# 62 — TransmissionSequence

`16` resolves one surface per pixel and `18` shades it. That is correct for everything opaque and wrong for
everything the artist can see through, because a transmissive surface does not replace what is behind it — it
amends it. This document owns the second resolution that transmissive and cutout occupants need, and it owns the
ordering that makes overlapping transmissive surfaces read correctly rather than plausibly.

## Position In The Sequence

| Field       | Value                                                                                          |
|-------------|-------------------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                              |
| Layer       | `Layer4_Compute`                                                                                |
| Upstream    | `02`, `06`, `08` (ordering), `16` (depth, occupancy), `18` (models, channels), `42`, `60`       |
| Downstream  | `30` reflects what this amended; `64` accumulates it; `66` projects it                          |
| Unblocks    | Transparent and cutout occupants                                                                |

## 1. The Components

| Component                | What it owns                                                             |
|--------------------------|---------------------------------------------------------------------------|
| `TransmissionSequence`   | The ordered resolution of transmissive occupants — §3                    |
| `CoverageClassifier`     | Cutout coverage, resolved at `16` rather than here — §2                  |
| `TransmissionSpecification` | What a transmissive occupant declares, from `42` — §4                 |
| `TransmissionMetrics`    | Occupant count, layer depth and truncation, reported through `86`        |

## 2. Cutout Is Not Transmission

🔴 A cutout occupant is opaque where it is present and absent where it is not. It is resolved in `16`, at
visibility time, and it never reaches this document.

| Behaviour        | Channel 8 reads      | Resolved by | Writes `VisibilityIndex` |
|------------------|----------------------|-------------|---------------------------|
| Opaque           | Not read             | `16`        | Yes                       |
| Cutout           | As coverage, thresholded | `16`     | Yes, where present        |
| Transmissive     | As transparency      | `62`        | No                        |

⚠️ Conflating the two is the defect that makes foliage cost what glass costs. A leaf card is opaque with a hole
in it; resolving it as transparent puts every leaf in the sorted sequence below, and a tree becomes the most
expensive object in the workspace for no visual gain.

Because a cutout occupant writes `VisibilityIndex`, it is shaded by `18`, outlined by `26`, picked by `74` and
occluded by `60` with no special case in any of them. That is the whole reason the classification lives at `16`.

🔴 A cutout's coverage threshold is declared per material in `42`, never global. A single threshold across a
document makes one artist's foliage disappear while another's grows a halo, and neither can correct it.

## 3. Ordering

Transmissive occupants are resolved back to front, per pixel, and the ordering is by resolved depth, not by occupant position.

Because `VisibilityIndex` holds only one identity and `DepthSurface` one depth (post-resolution), collecting transmissive fragments requires a dedicated target: `TransmissionIndex` (declared in `08` §2).

`62` contributes **two recordings** to the schedule (`08` §3):
① **⑤·i (`TransmissionSequence 1`)**: Collects transmissive fragments into `TransmissionIndex` — a bounded, per-pixel, depth-sorted set written with atomic sorted insertion, discarding the farthest on overflow. No depth write is performed.
② **⑤·ii (`TransmissionSequence 2`)**: Reads `TransmissionIndex` back to front, shades each fragment through `18`'s declared model, and amends `RadianceSurface`.

🔴 Ordering by occupant position rather than by resolved depth is wrong for every occupant that intersects another and for every occupant that is concave. Two panes of glass crossing at an angle have no single ordering as objects, and the artist rotating the camera watches them swap.

⚠️ Depth here is `16`'s `DepthSurface` for the opaque surface behind, and the transmissive surface's own resolved depth for itself. A transmissive surface behind the opaque depth is discarded — it is not visible, and resolving it would amend a pixel it does not reach.

### 3.1 The layer ceiling

The ordered set per pixel in `TransmissionIndex` is bounded by capacity $K$ declared in `Contract/`. Occupants beyond it are **discarded, farthest first**, during atomic insertion in ⑤·i, and the discard is reported through `86`.

🔴 Discarding the farthest is the correct direction. The nearest transmissive surface is the one the artist is looking at and the one whose amendment dominates; dropping it to keep a distant one is dropping the visible in favour of the invisible. Recorded as `00` §10 conflict 32.

## 4. What A Transmissive Occupant Declares

`42` declares the channels and `18` §3's Transmissive model consumes them. This document adds nothing to that
inventory and resolves what it declares.

| Read        | From `18` §2 | Meaning here                                              |
|-------------|--------------|------------------------------------------------------------|
| Opacity     | Channel 8    | How much of what is behind survives the amendment         |
| Transmission| Channel 18   | Fraction refracted rather than reflected                   |
| Index of refraction | Channel 19 | Fresnel and the refracted direction                  |
| Base colour | Channel 1    | The tint applied to what is transmitted                    |
| Roughness   | Channel 3    | Width of the transmitted lobe                              |

⚠️ Refraction does not bend what is behind. The refracted direction drives Fresnel and the transmitted lobe's
width; the surface behind is read at the pixel, not at a displaced pixel. A screen-space displacement reads
whatever happens to be at the displaced pixel, which is frequently a surface in front of the glass — and the
artist sees the foreground smeared through the object it stands behind.

🔴 This is substitution point three of the four in `00` §5.1, and it is a declared absence rather than an
approximation. A transmissive occupant tints, attenuates and blurs what is behind it; it does not displace it.

## 5. Illumination And Occlusion

A transmissive surface is shaded through `18` exactly as an opaque one is — the same direct term over `44` §5's
reaching set, the same ambient term from `28`, the same models from `18` §3.

`60`'s direct occlusion applies. 🔴 A transmissive occupant does **not** cast occlusion — `60` §3's projections
resolve topology, and a transmissive occupant enrolled in one would cast the shadow of a solid object. Coloured
transmitted light is not produced, and `00` §5.1 accounts for its absence.

⚠️ A cutout occupant *does* cast occlusion, correctly, because §2 resolved it at `16` and it is topology with a
coverage test. The asymmetry is deliberate and is the practical payoff of §2's classification.

## 6. Ordering In The Schedule

`62` contributes two recordings at `08` §3:
- **⑤·i**: `TransmissionSequence 1` records at ⑤·i, writing `TransmissionIndex` with depth-sorted atomic insertion.
- **⑤·ii**: `TransmissionSequence 2` records at ⑤·ii, reading `TransmissionIndex` back to front and amending `RadianceSurface`.

`30` reads `RadianceSurface` after ⑤·ii: a reflection of a transmissive occupant shows that occupant, which `30` §5 states from the other side.

Nothing here writes `VisibilityIndex`, `DepthSurface` or `OccupancySurface`. 🔴 A transmissive occupant that wrote depth would occlude what is behind it in `16`, and the surface it is meant to reveal would never be shaded at all.

⚠️ `TransmissionIndex` allows `26` (selection outlining) and `74` (pointer picking) to inspect transmissive fragments without altering opaque depth resolution. Recorded as `00` §10 conflict 32.

## 7. Precision

| Computation                       | Tier | Reason                                                       |
|-----------------------------------|------|---------------------------------------------------------------|
| Occupant identity                 | A    | An integer; a mismatch amends with the wrong material        |
| Depth ordering comparison         | A    | An ordering; two occupants at equal depth must order stably  |
| Fresnel and transmitted lobe      | B    | Continuous; `18` §4's models unamended                       |
| Amendment accumulation            | D    | `RadianceSurface` is Tier D — `18` §6                        |

🔴 The depth ordering comparison is Tier A even though depth itself is Tier B. What is required is not an exact
depth but a **stable order**, and ties resolve by occupant identity so that the same two coplanar surfaces order
the same way on every rotation, every run and every machine. An order that resolves by arrival flickers, and it
flickers most on exactly the coplanar surfaces artists build deliberately.

## 8. Gates

- **Gate:** Cutout is resolved at `16` and writes `VisibilityIndex`; transmission is resolved here and does not.
- **Gate:** The cutout coverage threshold is declared per material in `42`.
- **Gate:** Transmissive occupants are ordered by resolved depth, never by occupant position.
- **Gate:** A transmissive surface behind the opaque depth is discarded.
- **Gate:** The per-pixel ceiling discards the farthest first and reports through `86`.
- **Gate:** No channel is invented here; `18` §2's inventory is read unamended.
- **Gate:** Refraction does not displace what is behind — no screen-space displacement is applied.
- **Gate:** A transmissive occupant casts no occlusion; a cutout occupant does.
- **Gate:** `62` is declared in `08` §2 as an amending recording, ordered before `30`.
- **Gate:** Nothing here writes `VisibilityIndex`, `DepthSurface` or `OccupancySurface`.
- **Gate:** Depth ordering is Tier A and ties resolve by occupant identity.

## 9. Open

| Open question                                                              | Blocks                            |
|-----------------------------------------------------------------------------|------------------------------------|
| The per-pixel layer ceiling                                                 | Tuning; `86` reports it either way |
| Whether the ordered set is resolved per pixel or per partition              | Cost; measure                      |
| Whether the transmitted lobe reads a reduction of `RadianceSurface`         | Quality; `30` §4 does the same     |
| Whether a transmissive occupant may be selected and outlined by `26`        | `26` reads `VisibilityIndex`; `74` §3 |
| Whether cutout coverage may come from a `56` layer sequence or `42` only    | `56` §10's channel row             |
