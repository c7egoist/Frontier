# 44 — IlluminantPopulation

`18`'s direct term integrates incident radiance and needs a source for it. This document is that source: the
illuminants the artist places, what each declares, and how `18`, `60` and `28` agree about them.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `10`, `12` (attachment), `36` (colour), `02`                                 |
| Downstream  | `18` (direct term), `60` (one projection each), `28` (the sun), `78`, `80`   |
| Unblocks    | Incident radiance — `18`'s direct term has a source                          |

## 1. The Components

| Component               | What it owns                                                       |
|-------------------------|---------------------------------------------------------------------|
| `IlluminantPopulation`  | Every illuminant in the document, in `10`'s population             |
| `IlluminantSpecification` | One illuminant's declared properties                             |
| `IncidenceProjection`   | Direction, distance and solid extent at a shaded position          |
| `IlluminantIndex`       | Which illuminants a partition may be lit by — §5                   |

An illuminant is an occupant of the document population. It enrolls in `12`, appears in the outliner, attaches
through `AttachmentFollows`, and is manipulated by `78` like anything else. An illuminant held outside the
population is one the artist cannot select, name, group or undo.

## 2. What An Illuminant Declares

| Declared            | Meaning                                                      | Tier |
|---------------------|---------------------------------------------------------------|------|
| Emission shape      | §3 — the geometry radiance leaves from                       | A    |
| Radiant intensity   | Magnitude, in the working space                               | B    |
| Colour              | A `ColourSpecification`, or a temperature — `36` §5           | B    |
| Extent              | The distance beyond which its contribution is not integrated  | B    |
| Occlusion enrollment| Whether `60` projects it                                      | A    |
| Visibility          | `12`'s enrollment, like any occupant                          | A    |

🔴 Extent is a **declared** cutoff, not a threshold discovered from the falloff. A cutoff derived from a magnitude
changes when the artist changes the magnitude, so brightening an illuminant would silently enlarge the set of
surfaces it lights, and `60`'s cost with it. The artist sets the extent and sees it.

⚠️ Falloff within the extent is physical and is not authored. The two are different decisions: how the radiance
diminishes is physics, and where the program stops caring is a budget.

## 3. Emission Shapes

| Shape       | Emits from                        | Occluded by `60` as         |
|-------------|-----------------------------------|------------------------------|
| Point       | A position, with a radius         | One projection from it       |
| Directional | A direction, with an angular size | One parallel projection      |
| Spot        | A position, within a cone         | One projection within it     |
| Extended    | A rectangle or disc               | One projection from its axis |

Every shape has a **non-zero size**. A point illuminant carries a radius, a directional one an angular size. This
is not a refinement — `18`'s reflectance models integrate over a solid extent, and a zero-extent source produces a
specular highlight that is either absent or a single aliased pixel depending on the roughness.

🔴 The sun is a directional illuminant **and** `28`'s sky parameter, and there is exactly one of it. Two suns
disagreeing about their direction is a scene where the shadows fall one way and the sky brightens the other. The
document holds one illuminant enrolled as the atmospheric source, and `28` reads it rather than declaring its own.

## 4. Ambient Is Not An Illuminant

`00` §5.1's first socket fills `18`'s ambient term from `28`'s sky-view irradiance, plus a constant floor when the
sky is off. Neither is an illuminant, neither is in this population, and neither is manipulable by `78`.

An ambient term presented as a light in the outliner is a light the artist will try to move.

## 5. Which Illuminants Reach A Partition

`IlluminantIndex` records, per partition of `16`, which illuminants' extents reach it. `18` integrates that set and
not the whole population.

| What changed                    | Re-derived                                    |
|---------------------------------|------------------------------------------------|
| An illuminant moved or resized  | Its own entries only                          |
| An occupant moved               | Its partitions' entries only                  |
| The camera moved                | Nothing                                       |
| Radiant intensity changed       | Nothing — extent is declared, not derived     |

The last row is §2's cutoff rule paying for itself: the most common illuminant edit an artist makes costs nothing
at all here.

## 6. Ordering And Determinism

`18` integrates illuminants in `IlluminantIndex` order, and that order is by identity — stable across ticks, across
runs and across machines. `02` §5's ordered recombination applies: an accumulation in arrival order is a different
number each run at Tier B, and the difference is visible as flicker on a surface lit by many sources.

## 7. What Is Drawn

An illuminant's presence in the workspace — its position, its cone, its extent — is drawn by `80` at `08` §3 ⑩,
depth-tested, as an overlay. 🔴 It writes no `VisibilityIndex`; `80` §4 gates this from the other side, and the
consequence of breaking it is an illuminant that `18` tries to shade.

## 8. Gates

- **Gate:** Every illuminant is an occupant of the document population and enrolls in `12`.
- **Gate:** Every emission shape has a non-zero size.
- **Gate:** Extent is declared, never derived from intensity.
- **Gate:** Exactly one illuminant is enrolled as the atmospheric source, and `28` reads it.
- **Gate:** The ambient term is not an illuminant and is not in this population.
- **Gate:** `18` integrates `IlluminantIndex`'s set, in identity order.
- **Gate:** A camera move re-derives nothing here.
- **Gate:** Illuminant presentation is an `80` overlay and writes no `VisibilityIndex`.

## 9. Open

| Open question                                                          | Blocks                        |
|-------------------------------------------------------------------------|--------------------------------|
| Whether extended shapes are integrated analytically or sampled          | `18` §10; `64` if sampled      |
| How many illuminants one partition may carry before the index truncates | `86` reports it either way     |
| Whether imported topology's illuminants are read from the file          | `50` format coverage           |
| Whether an illuminant may be enrolled to light a subset only            | `12` enrollment shape          |
