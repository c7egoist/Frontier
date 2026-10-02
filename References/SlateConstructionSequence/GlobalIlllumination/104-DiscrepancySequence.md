# 104 — DiscrepancySequence

`02` §6 declares four sample patterns and `Shared/SampleProjection.slang.h` implements them: a low-discrepancy
planar pattern from the two radical inverses, a spherical projection, a cosine-weighted hemispherical one, and the
sub-pixel offsets `64` consumes. All four are progressive and all four are parity-proven.

None of them is decorrelated **between pixels**. That is what resampling needs and what this document adds.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateMath.lib`                                                               |
| Layer       | `Layer1_Numeric`                                                              |
| Upstream    | `02` (the existing patterns and the permutation)                             |
| Downstream  | `94` (every candidate draw and every ξ), `96`, `98`, `100`, `102`            |
| Unblocks    | Noise the reconstruction can remove rather than noise it preserves            |

## 1. What `02` Already Gives, And What It Does Not

Read from `Shared/SampleProjection.slang.h` rather than from `02`, because the source is ahead of the document.

| Already built                | Entry point                    | Property                                     |
|------------------------------|--------------------------------|-----------------------------------------------|
| Radical inverse, base two    | `ProjectRadicalTwo`            | Progressive                                   |
| Radical inverse, base three  | `ProjectRadicalThree`          | Progressive                                   |
| Planar low-discrepancy       | `ProjectPlanarSample`          | Uniform coverage, progressive                 |
| An ordinal permutation       | `ProjectPermutedOrdinal`       | Decorrelates one ordinal against a seed       |
| A permuted unit interval     | `ProjectVariation`             | The permutation applied to a scalar draw      |
| Sub-pixel offsets            | `ProjectSubPixelOffset`        | Deterministic per cycle slot               |
| Spherical, solid-angle uniform| `ProjectSphericalSample`      | For `28`'s multiple-scattering integral       |
| Hemispherical, cosine-weighted| `ProjectHemisphericalSample`  | For `18` and `94` §6's indirect candidates    |

🔴 `ProjectPermutedOrdinal` is a permutation and **not an Owen scramble**. A permutation decorrelates two draws
that share an ordinal; an Owen scramble additionally preserves the sequence's low-discrepancy structure while
doing so. Feeding a resampling core from a permuted sequence gives noise that is decorrelated but not
low-discrepancy, and the variance reduction the sequence was chosen for is lost at exactly the point it was
supposed to pay.

⚠️ Neither is what `102`'s reconstruction wants. A wavelet reconstruction removes noise that is spatially
*high-frequency*; a per-pixel independent stream produces noise with energy at every frequency, including the low
ones the kernel cannot reach. Low-frequency noise survives reconstruction and survives `64`'s accumulation as
blotching that fades over seconds.

## 2. What Is Added

Two mechanisms, both in `Shared/`, both parity-proven, both extending what exists rather than replacing it.

| Added                            | Extends                     | Serves                                        |
|----------------------------------|-----------------------------|------------------------------------------------|
| An Owen scramble over the radical inverse | `ProjectRadicalTwo`  | `94`'s candidate draws — variance reduction    |
| A spatially-distributed offset per pixel  | `ProjectVariation`   | `102`'s reconstruction — noise it can remove   |

🔴 The existing entry points are **not amended**. `28`, `18`, `60` and `64` all draw from them today, they are
registered with `ParityRunner`, and changing a sequence changes every image every consumer produces. The scramble
is a new entry point that composes with `ProjectRadicalTwo`; the offset is a new one that composes with
`ProjectVariation`.

⚠️ 🔴 `64`'s sub-pixel offsets in particular are **untouched**. `64` §7 makes the offset index Tier A because `46`
applies it on the host and `82` replays it for a preview, and a sequence that disagreed would make a preview
converge to a different image than the workspace. This document adds a stream beside that one; it does not
renumber it.

## 3. The Spatial Property

The per-pixel offset is distributed so that the error of a set of neighbouring pixels is concentrated at high
spatial frequency — which is precisely the band `102`'s wavelet removes and `64`'s accumulation averages out
fastest.

🔴 The property is over the **screen neighbourhood**, not over the material's compacted pixel list. `94` §5 draws
its spatial reuse neighbours from the compacted list, for `18` §1's reason, and those are two different
neighbourhoods used for two different purposes: reuse must not cross a material, and noise distribution must be
spatially coherent because the reconstruction kernel is. Conflating them would give one of the two the wrong
neighbourhood.

⚠️ The offset varies per rotation as well as per pixel, on a short cycle. A distribution that is fixed across
rotations makes the same pixels wrong in the same direction every rotation, and `64` averages a set of samples
that all share the error rather than a set whose errors cancel.

## 4. Where It Is Drawn

| Consumer                    | Draws                                                     |
|-----------------------------|------------------------------------------------------------|
| `94` §3 ②                   | Candidate positions on emission shapes                     |
| `94` §1                     | `ξ`, the replacement draw of the reservoir update           |
| `94` §6 ①                   | The indirect path's direction, through `ProjectHemisphericalSample` |
| `98` §3                     | The cell reservoir's refresh draws                          |
| `100` §5                    | Probe directions                                            |
| `102`                       | Nothing — it reads the noise, it does not draw              |

## 5. Precision

| Computation              | Tier | Reason                                                            |
|--------------------------|------|--------------------------------------------------------------------|
| The scramble             | A    | Integer bit operations; host and device must produce one stream   |
| The spatial offset       | A    | Same                                                              |
| The scrambled real draw  | B    | Continuous; bounded as the existing radical inverses are          |

🔴 Both new entry points are Tier A and registered with `ParityRunner`. `00` §11 gates that every `Shared/` entry
point has coverage at its declared tier, and `00` §4 notes that an entry point in `Shared/` with no registration
is duplicated source that has not diverged yet.

⚠️ `ReversedBits` already exists in `ToolchainInterchange.slang.h` in both forms, host and device, branch-free, with a note
explaining that the host form reverses in constant-width exchanges precisely so neither form can diverge. The
scramble is built on it and reaches for no toolchain-specific spelling of its own.

## 6. Gates

- **Gate:** No existing entry point in `SampleProjection.slang.h` is amended.
- **Gate:** `64`'s sub-pixel offset sequence is untouched.
- **Gate:** Both new entry points live in `Shared/` and are registered with `ParityRunner` at Tier A.
- **Gate:** The scramble is built on `ToolchainInterchange.slang.h`'s intrinsics and reaches for no toolchain spelling.
- **Gate:** The spatial property is over the screen neighbourhood, never the compacted pixel list.
- **Gate:** The offset varies per rotation on a declared cycle.
- **Gate:** No consumer draws from a sequence declared outside this document or `02` §6.

## 7. Open

| Open question                                                          | Blocks                              |
|-------------------------------------------------------------------------|--------------------------------------|
| The rotation cycle length before the spatial offset repeats             | `64` §9 carries the same shape       |
| Whether the offset is stored as a resident extent or derived per pixel  | 💾 A small extent against a few instructions |
| Whether the scramble's seed varies per signal or is shared across four  | Correlation between the four signals |
| Whether `28` and `60` should later migrate to the scrambled sequence    | Quality; refused until measured, since it changes every existing image |
