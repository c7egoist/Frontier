# 102 — VarianceIntegrator

One sample per pixel is noisy, and `64` already accumulates across rotations to fix that. `64` is not enough on
its own: it converges only where the workspace is still, and resampled indirect light at one sample per pixel is
noisy enough that a moving camera shows nothing usable.

This document reconstructs spatially, from the second moment of the signal, and then **decays itself out of the
way** as `64` converges. That decay is the mechanism that makes Slate's renderer different from a game engine's,
and it is why this document exists rather than a denoiser being bolted on.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (quadrature), `06`, `08`, `16` (`DepthSurface`, `MotionSurface`, identity), `64` (the stored sample count — rotation-crossing), `94` (the signals) |
| Downstream  | `18` reads the reconstructed indirect terms as its ambient source            |
| Unblocks    | A usable image at one sample per pixel, and a converged one when held still  |

## 1. Four Signals, Not One

| Signal                    | Extent | Produced by | Temporal response | Reconstruction extent |
|---------------------------|--------|-------------|--------------------|------------------------|
| Direct diffuse            | display| `94` §3     | Slow               | Wide                   |
| Direct specular           | display| `94` §3     | Fast               | Narrow                 |
| Indirect diffuse          | half   | `94` §6     | Slow               | Widest                 |
| Indirect specular         | half   | `94` §6     | Fastest            | Narrowest              |

🔴 The split is not stylistic. The four have genuinely different frequency content and genuinely different
temporal stability, and reconstructing them merged applies one extent to all four. Direct diffuse tolerates a wide
kernel; indirect specular tolerates almost none. The merged result is the characteristic over-smoothed image, and
it is **not recoverable downstream** because the merge is not invertible — which is why the split is here and not
a parameter.

⚠️ The two indirect signals are at half extent and are bilaterally upsampled against depth and orientation before
`18` reads them. 🔴 Never bilinearly. `60` §5 states this from its own side for the same target family: a bilinear
upsample crosses depth discontinuities and pulls a background surface's value onto a foreground silhouette, which
is a dark or bright fringe around every object.

## 2. Moments

The first and second moments of each signal are accumulated temporally, reprojected through `MotionSurface`, and
the variance is their difference. Variance drives the reconstruction extent per pixel: converged pixels are
filtered narrowly, noisy ones widely.

🔴 Reprojection reads `MotionSurface` and reuses `64` §4's rejection rules, exactly as `94` §4 does. There is one
reprojection mechanism in this engine and `16` §4.2 is why: motion is written where the surface resolves because
it is free there and derivable nowhere else.

⚠️ The moments are their own extent and are not packed into the signal targets. A signal target carries radiance
that `18` reads; a moment target carries statistics only this document reads. Packing them would have `18`
sampling a four-component target for three components it wants, on every pixel of every rotation.

## 3. Reconstruction

An edge-avoiding wavelet, several iterations, each doubling its step while keeping its kernel width — so the
effective extent grows geometrically at a constant sample count.

Edges are respected against depth, orientation, and the occupant identity `16` §4.1 resolves. 🔴 Identity is the
one that matters most and is the one a general denoiser lacks: two surfaces at similar depth and orientation but
different occupants must not exchange radiance, and only an identity comparison distinguishes them. `16` already
writes it, `26` already compares it for the same reason, and this document is the third consumer of the same
mechanism.

## 4. Ordering — Before `18`, And Why

🔴 `102` records **before** `18`, not after it. This is the ordering fact most likely to be got backwards.

`18` produces `RadianceSurface` whole. `62` and `30` amend it. `64` accumulates it. If reconstruction ran on
`RadianceSurface`, `64` would accumulate a filtered image and converge toward the filter rather than toward the
scene — and the artist holding still would watch the image get smoother rather than sharper, which is the exact
inverse of what §5 is for.

So the four signals are reconstructed **as signals**, before `18` consumes them as its ambient source, and
`RadianceSurface` is never filtered at all. `18` still produces it whole, `30`'s composite still has its operand,
`64` still accumulates an unfiltered image. Nothing downstream of `18` is amended by this branch.

⚠️ This also puts reconstruction above `08` §3.1's display-referred line by a wide margin, which is where anything
operating on radiance belongs. `102` reads and writes scene-referred values only.

## 5. 🔴 The Decay — Where Slate Beats A Game Engine

In a game the camera never stops, so the reconstruction is the whole answer. Slate is an editor: the artist holds
still constantly, and while they do, `64`'s count-derived weight converges toward a true reference.

So this document **reads `64`'s stored sample count and decays its own reconstruction extent toward nothing as the
count rises.**

| Sample count           | Reconstruction extent           | What the artist sees                          |
|------------------------|----------------------------------|------------------------------------------------|
| One — just rejected    | Full, every iteration            | A usable image immediately                     |
| Rising                 | Iterations dropped progressively | The image sharpening as they wait              |
| At `CountCeiling`      | None; the signal passes through  | A genuine progressive render                   |

`RejectionSpecification::CountCeiling` is declared in `SampleIntegrator.h` at **64u** and is read from there. This
document declares no ceiling of its own — `00` §2's rule, and a second ceiling would decay against a bound `64`
does not share.

🔴 This is the highest-value mechanism in the branch. It is why the same renderer serves a game engine and a DCC
editor without being two renderers: the game camera never holds still so the decay never engages, and the artist's
does so it always eventually does. Nothing in the algorithm distinguishes the two cases — the sample count does.

⚠️ The decay is per pixel and not per image. A pixel whose history was rejected — a newly disoccluded surface —
has a count of one and is reconstructed fully, while the converged pixel beside it is not reconstructed at all.
An image-wide decay would reintroduce noise across the whole extent whenever anything anywhere moved.

### 5.1 The rotation-crossing edge

The count `102` reads is the **previous rotation's**, ordered by `06`'s recording rotation and not by the
schedule. `64` §6 already declares one such edge — it reads its own previous result — and calls it "the one place
in the schedule where a cycle slot depends on the one before it". This branch makes it the second.

🔴 Declared as a rotation-crossing edge in the Position block, and excluded from `00` §9.1's stratum traversal by
that declaration rather than by omitting it. `IlluminationGroundwork` §10 carries the ruling; `00` §11's second
gate is why the edge is declared rather than dropped.

⚠️ On the first rotation after bring-up, an extent change, or device loss, no count is readable and the
reconstruction runs at full extent. `64` §6 names the same three moments for the same reason.

## 6. What This Document Does Not Do

| Not done                              | Why                                                        |
|---------------------------------------|-------------------------------------------------------------|
| Reconstruct `RadianceSurface`         | §4 — `64` would converge toward the filter                  |
| Accumulate temporally                 | That is `64`, and doing it twice double-weights the history |
| Composite the four signals            | `18` consumes them as its ambient source and composites     |
| Produce `RadianceSurface`             | `18` produces it, unchanged                                 |
| Touch anything display-referred       | `08` §3.1                                                   |
| Replace itself with a vendor denoiser  | 🚧 §8's open row; the decay of §5 is not a feature vendors expose |

🔴 The last row is a real constraint on adopting a production denoiser later. A vendor denoiser accumulates
temporally itself and does not accept an external convergence count, so adopting one means giving up §5 — the
mechanism that makes the still image converge. That is a trade to be measured, not assumed.

## 7. Precision

| Computation                        | Tier | Reason                                                     |
|------------------------------------|------|-------------------------------------------------------------|
| Identity comparison at edges       | A    | An integer; a mismatch exchanges radiance across an occupant |
| The sample count read from `64`    | A    | An integer; the decay is derived from it                    |
| Moments and variance               | B    | Continuous, bounded                                         |
| The reconstructed signals          | D    | They feed `18`'s ambient term, Tier D — `18` §6             |

## 8. Gates

- **Gate:** Four signals, four parameter sets; they are never reconstructed merged.
- **Gate:** The indirect signals are upsampled with depth-and-orientation weighting, never bilinearly.
- **Gate:** Reprojection reads `MotionSurface` through `64` §4's rules.
- **Gate:** Edge weighting reads `16` §4.1's occupant identity.
- 🔴 **Gate:** `102` records before `18`; `RadianceSurface` is never reconstructed.
- 🔴 **Gate:** The reconstruction extent decays per pixel against `64`'s stored count, toward nothing at
  `RejectionSpecification::CountCeiling`.
- **Gate:** The ceiling is read from `SampleIntegrator.h`; no second ceiling is declared.
- **Gate:** The count edge is declared rotation-crossing in the Position block.
- **Gate:** Full extent is used on the first rotation, after an extent change, and after device loss.
- **Gate:** Nothing display-referred is read or written.
- **Gate:** No temporal accumulation happens here.

## 9. Open

| Open question                                                              | Blocks                              |
|-----------------------------------------------------------------------------|--------------------------------------|
| Iteration count per signal, and the four edge-weight parameter sets         | Quality; measure against a reference |
| Whether the decay is linear in the count or in its square root              | 🔴 §5; the artist's perception decides |
| Whether a vendor denoiser is ever adopted, given §6's last row              | Quality against §5's mechanism       |
| Whether the moments target is half extent for the half-extent signals        | 💾 Budget; probably yes              |
| Whether direct specular needs reconstruction at all above a roughness bound  | Cost; `30` §4 has the same shape     |
