# 64 — SampleIntegrator

One rotation resolves one sample per pixel and every sampled term in the engine — `18`'s area illuminants,
`30`'s traced reflection, `60`'s hemisphere — is noisy at one sample. This document accumulates those samples
across rotations so that a workspace the artist is not moving converges, and it declares what happens to the
accumulation when they do move.

`02` §6's sub-pixel offsets and `02` §5's `TimeIntegrator` both name this document as their consumer. This is
where both claims are discharged.

## Position In The Sequence

| Field       | Value                                                                                        |
|-------------|-----------------------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                                            |
| Layer       | `Layer4_Compute`                                                                              |
| Upstream    | `02` (`TimeIntegrator`, sub-pixel offsets), `06`, `08`, `16` (`MotionSurface`), `30`, `46`    |
| Downstream  | `66` projects `AccumulationSurface` to display                                                |
| Unblocks    | Temporal accumulation; `02` §6's jitter has a consumer                                        |

## 1. The Components

| Component              | What it owns                                                              |
|------------------------|----------------------------------------------------------------------------|
| `SampleIntegrator`     | The accumulation itself — §3                                              |
| `OffsetSequence`       | The per-slot sub-pixel offset, from `02` §6                           |
| `ReprojectionIndex`    | Where this pixel was last rotation, from `MotionSurface` — §2             |
| `RejectionSpecification` | When a reprojected sample is refused, and what replaces it — §4          |
| `ConvergenceMetrics`   | Accumulated sample count and rejection rate, reported through `86`         |

## 2. Reprojection

`16` writes `MotionSurface` at resolution time, and `08` §2 states why: motion is a property of the resolved
surface and is free where the surface resolves. This document reads it and nothing else to find where a pixel was.

🔴 Reprojection is **never** derived from depth and the previous camera. Depth reprojection is correct only for
what did not move, and what did move is exactly the population this document has to handle. `08` §2 records the
same reasoning from the schedule side.

Motion covers the camera and the occupant together. An occupant moved by `78` and a camera orbited by `46`
produce motion in the same target, so the accumulation does not need to know which happened.

## 3. Accumulation

`AccumulationSurface` holds the running result. Per pixel, per rotation:

① Read the sub-pixel offset for this cycle slot from `02` §6, and record which offset produced this sample.
② Reproject through `MotionSurface` to the previous position.
③ Apply §4's rejection.
④ Accumulate the current sample into the reprojected history at the resolved weight.
⑤ Write the result, and write the sample count alongside it.

🔴 The weight is derived from the **recorded sample count**, not from a constant. A constant weight is an
exponential average that never converges and never fully forgets — it leaves a permanent trail behind moving
occupants and a permanent floor of residual noise on the ones that stopped. A count-derived weight converges
while the workspace is still and resets cleanly when it is not.

⚠️ The count is stored, saturating at a declared ceiling. Without the ceiling, a workspace left untouched
accumulates a weight so small that a subsequent change takes seconds to appear, and the artist believes the
program has stopped responding.

### 3.1 The offset sequence

Offsets come from `02` §6's sub-pixel pattern, are deterministic per cycle slot, and are applied to `46`'s
projection — not to the resolved position and not to the accumulation.

🔴 The offset is applied to the projection, which is what makes every stage downstream of `16` see a consistently
jittered workspace. An offset applied after resolution shifts an already-resolved image, which resamples rather
than samples, and the result is blur rather than convergence.

⚠️ `26`, `80` and `14` record display-referred at `08` §3 ⑨–⑫ — after `66` — and are never jittered and never
accumulated. A jittered selection outline shimmers on a still workspace, which is the opposite of what an outline
is for.

## 4. Rejection

A reprojected sample is refused when it does not describe the same surface.

| Refused when                                     | Because                                            |
|--------------------------------------------------|-----------------------------------------------------|
| The reprojected position is off the extent        | There is no history to read                        |
| The occupant identity differs — `16` §4.1         | A different surface resolved there                 |
| The depth differs beyond a declared bound         | The same occupant, a different part of it          |
| The accumulated value lies outside the neighbourhood | The history describes a shading that no longer holds |

On refusal the history is discarded and the sample count resets to one. 🔴 It resets rather than decays,
because a partial history of a surface that is no longer there is a coloured ghost, and a ghost fading over ten
rotations is more visible than one that is never drawn.

⚠️ The identity test reads `16` §4.1's occupant resolution, not the partition identity. A partition identity
changes when topology is re-partitioned, and re-partitioning would then discard every pixel's history for a
change the artist cannot see.

The neighbourhood test bounds the history against the current rotation's local values, which is what handles
illumination that changed without the surface moving — an illuminant brightened, a stroke painted. `22`'s
painting does not invalidate anything here explicitly; the bound resolves it.

## 5. What Is Accumulated, And What Is Not

| Accumulated                            | Not accumulated                                     |
|----------------------------------------|------------------------------------------------------|
| `RadianceSurface`, after `62` and `30` | Anything display-referred — `08` §3.1                |
| Sampled illumination and reflection    | `26`'s outline, `80`'s overlays, `14`'s interface    |
| `60`'s ambient term, through `18`      | `82`'s speculative extents — `22` §4.1               |

🔴 Accumulation happens **above** the display-referred line at `08` §3 ⑧, on radiance. Accumulating display code
averages values that have been through a non-invertible tone projection, and the average of tone-mapped samples
is not the tone-mapped average — bright samples are compressed before averaging and the result is darker than the
scene is.

## 6. Ordering

`64` records at `08` §3 ⑦ — after `30` resolved into `RadianceSurface`, before `66` projects. It produces
`AccumulationSurface`, reads it from the previous cycle slot, and amends nothing.

⚠️ It reads its own previous result, which is the one place in the schedule where a cycle slot depends on the
one before it. `06`'s rotation is what makes that legal, and the accumulation is invalid on the first rotation
after bring-up, after an extent change and after a device loss — in all three the sample count starts at one and
no history is read.

## 7. Precision

| Computation                       | Tier | Reason                                                        |
|-----------------------------------|------|----------------------------------------------------------------|
| Occupant identity comparison      | A    | An integer; a mismatched match accumulates a different surface |
| Cycle slot and offset index    | A    | An integer; host and device must agree which offset was used  |
| Sample count                      | A    | An integer; the weight is derived from it                     |
| Reprojected position              | B    | Continuous; sampled with a reconstruction filter              |
| Accumulated radiance              | D    | `RadianceSurface` is Tier D — `18` §6                         |

🔴 The offset index is Tier A and the offset sequence is `Shared/`, parity-proven. `46` applies the offset on the
host when it builds the projection and `82` applies the same sequence when it resolves a preview; a sequence that
disagrees produces a preview that converges to a different image than the workspace does.

## 8. Gates

- **Gate:** Reprojection reads `MotionSurface`; it is never derived from depth and the previous camera.
- **Gate:** The accumulation weight is derived from a stored sample count, never a constant.
- **Gate:** The sample count saturates at a declared ceiling.
- **Gate:** Offsets come from `02` §6 and are applied to `46`'s projection, never after resolution.
- **Gate:** Rejection resets the count to one; history is discarded, never decayed.
- **Gate:** The identity test reads `16` §4.1's occupant resolution, not a partition identity.
- **Gate:** Only scene-referred values are accumulated; nothing below `08` §3 ⑧ is.
- **Gate:** Accumulation records at ⑦, after `30`, before `66`.
- **Gate:** No history is read on the first rotation, after an extent change, or after device loss.
- **Gate:** The offset sequence lives in `Shared/` and is proven at Tier A.

## 9. Open

| Open question                                                             | Blocks                             |
|----------------------------------------------------------------------------|-------------------------------------|
| The sample count ceiling                                                   | Tuning; `86` reports convergence    |
| The depth bound and the neighbourhood bound                                | Tuning; measure                     |
| The length of the offset sequence before it repeats                        | Convergence quality                 |
| Whether the reprojection filter is bilinear or a wider reconstruction      | Sharpness against cost              |
| Whether accumulation is suspended entirely while the camera is in motion   | `46` interaction; probably refused  |
| Whether `82`'s previews accumulate at all — `82` carries the same row       | Preview quality only                |
