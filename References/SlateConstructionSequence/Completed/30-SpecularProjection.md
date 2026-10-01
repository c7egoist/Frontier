# 30 — SpecularProjection

Screen-space reflection traces the depth already resolved by `16` and reads radiance already shaded by `18`. It
adds no geometry and resolves no second visibility. What it does require is an exact accounting rule, because the
naive composition double-counts: `18` already added a specular ambient term from `28`, and simply adding a
reflection on top lights the same surface twice.

## Position In The Sequence

| Field       | Value                                                                         |
|-------------|--------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                             |
| Layer       | `Layer4_Compute`                                                               |
| Upstream    | `16` (`DepthSurface`), `18` (`RadianceSurface`, channels), `62` (transmissive occupants), `28` (fallback) |
| Downstream  | `64` accumulates the resolved radiance; `66` projects it to display             |
| Unblocks    | Screen-space reflection                                                        |

## 1. The Exact-Composite Contract

🔴 This is the load-bearing rule of the document. `ReflectionSurface` is written as:

| Component | Contents                                                              |
|-----------|------------------------------------------------------------------------|
| RGB       | The reflection contribution **as already added** by `18`'s ambient term |
| A         | The reflection weight — how much of the surface's specular the trace resolved |

Resolve then computes, per pixel:

```
    ResolvedRadiance = RadianceSurface − ReflectionSurface.rgb + TracedRadiance × ReflectionSurface.a
```

It **subtracts what `18` already contributed and swaps in what the trace found**. This is why the alpha channel
carries weight rather than opacity, and why the RGB carries a pre-added contribution rather than the trace
result. Any other formulation either double-counts where the trace succeeds or darkens where it fails.

Where the trace fails, weight is zero, the subtraction and the addition cancel, and the pixel keeps exactly
`18`'s ambient specular. Failure is therefore free and invisible — which is the property that lets the trace be
aggressive about giving up.

## 2. Tracing

① Reconstruct position and orientation from `DepthSurface` and `16`'s identity.
② Reflect the view direction about the orientation, perturbed by roughness from `18`'s channel 3.
③ March in screen space against `DepthSurface` at half extent.
④ Refine the crossing with a short binary search.
⑤ Sample `RadianceSurface` at the hit and record the weight.

Half extent for `ReflectionSurface` is declared in `08` §2. Reflections are low-frequency at all but mirror
roughness, and the extent is where the cost lives.

## 3. Failure And Fallback

| Failure                              | Weight | Fallback                          |
|--------------------------------------|--------|------------------------------------|
| Ray leaves the screen                | 0      | `18`'s ambient specular stands     |
| Ray exceeds the march ceiling        | 0      | Same                               |
| Hit is behind a surface — thickness  | 0      | Same                               |
| Ray points away from the camera      | 0      | Same                               |

Every failure resolves to weight zero and the contract in §1 makes that a no-op. There is no separate fallback
path to write, which is substitution point four from `00` §5.1 — the sky fallback is already present in `18`'s
ambient term and needs no duplicate here.

## 4. Roughness

The reflection direction is perturbed by roughness, and rough reflections are additionally resolved from a
reduction of `RadianceSurface` rather than by tracing more rays. Above a declared roughness the trace is skipped
entirely — weight zero, `18`'s ambient stands, and the visual difference is below the threshold that would
justify the cost.

## 5. Ordering

`30` records at `08` §3 ⑥ — after `18` produced `RadianceSurface` and after `62` amended it, before `64`
accumulates it. Resolve writes back into `RadianceSurface` in place.

🔴 `30` is an **amending recording**, not a producing one. `18` produces `RadianceSurface`; `62` and `30` amend it
in that order. `08` §2's amendment list is what makes that legal and ordered.

⚠️ `08` §6 previously gated "no shared target is produced by two recordings" while this section wrote back into a
target `18` produced. The gate did not describe the design and could only ever have been satisfied by deleting
it. It is now stated as one producer plus an ordered amendment list — recorded as `00` §10 conflict 26.

`30` reads `RadianceSurface` at the hit, so it reads `62`'s amendment: a reflection of a transmissive occupant
shows that occupant. It does not read `26` or `80`, which record display-referred and far later — a selection
outline appearing inside a mirror would be the visible consequence if they did.

## 6. Gates

- **Gate:** `ReflectionSurface` RGB is the pre-added contribution; A is the weight.
- **Gate:** Resolve subtracts the pre-added contribution before adding the traced radiance.
- **Gate:** Every failure sets weight zero, making it a no-op.
- **Gate:** No geometry is submitted and no second visibility resolution occurs.
- **Gate:** Tracing runs at half extent.
- **Gate:** Above the declared roughness ceiling, the trace is skipped.
- 🔴 **Gate:** `30` is declared in `08` §2 as an amending recording of `RadianceSurface`, ordered after `62`.
- **Gate:** Nothing display-referred is reachable by the trace.

## 7. Open

| Open question                                                  | Blocks                    |
|------------------------------------------------------------------|----------------------------|
| March ceiling in steps, and the thickness threshold              | Tuning; measure            |
| Roughness ceiling above which tracing is skipped                 | Tuning; measure            |
| Whether half extent holds at high display extents                | `08` §7 carries this too   |
| Whether the trace jitters per rotation, relying on `64`          | Quality; `64` owns the resolve |

⚠️ "Whether temporal accumulation is needed for rough reflections" is **closed** — `64` exists and accumulates
`RadianceSurface` after this resolve, so rough reflections are accumulated whether or not they need to be. What
remains open is only whether `30` should jitter to exploit it.
