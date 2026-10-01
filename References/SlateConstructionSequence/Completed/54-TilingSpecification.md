# 54 — TilingSpecification

A repeating pattern is a declaration of plane symmetry plus content placed within one cell of it. Textiles —
herringbone, twill, houndstooth, basket weave — are all this, and none of them is noise. The mechanism is periodic
and deterministic, and the reason to say so first is that pattern generation reaches for noise by habit.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `02` (`LatticeProjection`), `10`, `36`, `52` (outlines), `50` (imagery)       |
| Downstream  | `70` resolves it; `56` holds it as a layer; `82` previews it                  |
| Unblocks    | Repeating pattern definition — textiles and weaves                            |

## 1. Not Noise

🔴 `00` §5 declares continuous stochastic sources absent. This document is the substitution: variation across cells
is a function of the **cell index**, never of a sampled continuous source.

| Wanted                          | Supplied by                                                       |
|---------------------------------|--------------------------------------------------------------------|
| Every cell identical            | No per-cell variation declared                                     |
| Cells that differ               | A declared progression indexed by cell position                    |
| Cells that look randomly varied | A deterministic permutation of the cell index into a declared set  |

⚠️ The third row is the one that matters and the one most likely to be implemented as noise. A permutation of the
index is reproducible: the same document reopens with the same pattern, a tile re-resolved at a finer level agrees
with the coarse one it replaces, and the host preview agrees with the device result. Sampled noise satisfies none
of those, and each failure appears as the pattern changing when nothing was edited.

## 2. The Lattice

`LatticeProjection` from `02` — Tier A, parity-proven — maps a domain position to a cell index and a position
within that cell. Tier A because `82` classifies on the host and `70` on the device, and a cell boundary that
disagrees produces a pattern that does not meet itself across a tile edge.

| Declared           | Meaning                                                         |
|--------------------|------------------------------------------------------------------|
| Cell extents       | The repeating unit's size in domain units                        |
| Offset progression | Row-to-row or column-to-column displacement — half-drop, brick   |
| Reflection         | Which axes reflect on alternate cells                            |
| Rotation ordinal   | Quarter-turn increments applied on a declared cell schedule      |
| Skew               | Shear applied to the lattice, for diagonal repeats               |

🔴 These five compose. Herringbone is reflection on one axis combined with a rotation ordinal and an offset
progression; it is not a special pattern requiring its own mechanism. A design that enumerates named patterns
instead of composing symmetries can express exactly the patterns someone listed.

## 3. Cell Content

A cell holds an ordered sequence of content elements, each with a placing transform within the cell.

| Content source  | Supplied by | Resolution                            |
|-----------------|-------------|----------------------------------------|
| Vector outline  | `52`        | Re-resolved at every reduction level   |
| Imagery         | `50`        | Sampled from the decoded image         |
| A nested tiling | `54`        | One level of nesting only — see below  |
| A declared colour | `36`      | Constant within its coverage           |

🔴 Nesting is bounded at **one level**. A weave whose thread is itself a weave is expressible and is where the
complexity artists want lives; unbounded nesting makes resolution cost unbounded, and `20` §2.2's evaluation-cost
budget cannot bound what it cannot predict.

Content elements compose within the cell by the same `CombineSpecification` from `22` §3, so a pattern and a
stroke combine the same way and the artist learns one behaviour.

## 4. What This Document Does Not Do

| Not here               | Where                                                         |
|------------------------|----------------------------------------------------------------|
| Resolving to texels    | `70` — this document declares, it does not resolve             |
| Placement on a surface | `72` if placed as a decal; `56` if applied as a whole layer    |
| Preview                | `82`                                                           |

A tiling applied as a layer covers the whole domain. A tiling placed as a decal covers the placement's extent.
Both read this same declaration.

## 5. Gates

- **Gate:** No sampled continuous source appears anywhere; variation is indexed by cell.
- **Gate:** The same document reopens with an identical pattern.
- **Gate:** Lattice classification is Tier A and parity-proven.
- **Gate:** Named patterns are compositions of the five declared symmetries, never special cases.
- **Gate:** Nesting is bounded at one level.
- **Gate:** Cell content composes by `22` §3's specifications.
- **Gate:** This document resolves nothing into a domain.

## 6. Open

| Open question                                                        | Blocks                              |
|-----------------------------------------------------------------------|--------------------------------------|
| Whether the permutation is declared per pattern or fixed engine-wide  | Reproducibility scope                |
| Whether cell extents may vary across the lattice                      | Would break `LatticeProjection`      |
| Whether a pattern may be seeded from a painted layer                  | `56` and `70` cost                   |
