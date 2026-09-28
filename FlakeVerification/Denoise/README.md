# Denoiser prototypes — keeping the flakes (rendered by the real ReSTIR path tracer)

Follow-up to `../../DenoiserResearch.md`. I prototyped the recommended fixes **in the CPU ReSTIR
renderer** and rendered them on the flake sphere so you can see which one actually keeps the flakes at
Standard quality. **Start with `DenoiseZoom.png`** (raw vs current filter vs the winner), then
`DenoiseCompare.png` (all six side by side).

## How it works (one render, many denoisers)
`--denoise-sweep` renders the frame **once**, then applies every denoiser variant to a fresh copy of
the same accumulated film and times the denoise stage in isolation. So the timings below compare the
*filters*, not the render. All variants layer on top of the **shipped à-trous** (they call it
unchanged) — the parity mirror is untouched. Guides used: per-pixel **albedo**, **specular
roughness**, and a **deterministic System-B flake coverage mask** (the same finite hash-placed field
the flake normal reads, so a marked pixel genuinely carries a flake, not Monte-Carlo noise).

Repro:
```bash
make -C Projects/Project-Zero/Host MaterialLevelViewport
cd Projects/Project-Zero/Host
./MaterialLevelViewport --level showcase --view flake1 --width 448 --height 448 \
    --spp 6 --frames 6 --taps 2 --threads 2 --restir --flakes-systemb \
    --denoise-sweep --out sweep.png
```

## The six variants
| mode | what it does |
|---|---|
| `raw` | no denoise (flakes visible but noisy) |
| `atrous` | the **current** shipped filter (variance-guided edge-avoiding à-trous) |
| `demod` | A5/A1: demodulate by albedo, filter, remodulate |
| `specaware` | A2: fade back to raw where **base roughness** is low |
| `flakeguide` | A4: fade back to raw where the **deterministic flake mask** says a flake is present |
| `combo` | demod albedo + flake-guide + spec-aware together |

## Timings — denoise stage only (CPU mirror, 448×448, 5 levels, 2 cores)
| mode | ms | vs à-trous |
|---|---|---|
| raw | 0.00 | — |
| **atrous (current)** | **1084** | baseline |
| specaware | 1136 | +5% |
| flakeguide | 1161 | +7% |
| combo | 1234 | +14% |
| demod | 1255 | +16% |

These are **CPU-mirror** times (the mirror exists for parity, not speed). On the GPU the à-trous is the
same 5×25 taps/level; every prototype adds only a **handful of per-pixel ALU ops** (one lerp, or a
divide+multiply), i.e. **effectively free** on the GPU. So none of these "kills performance" — the
worst case is +16% of an already-cheap pass on the CPU reference, and sub-microsecond on the GPU.

## Which is most accurate / best quality?

**Winner: `flakeguide` (and `combo`).** See `DenoiseZoom.png`:

- **`atrous` / `demod`** — smooth, but the **flakes are erased** into a mushy blob. This is exactly
  the "ruins the detail" problem: the flakes are sub-pixel specular points on a smooth normal/depth
  surface, so the geometry edge-stops don't protect them and the variance-guided luminance term
  treats them as noise. Albedo demodulation doesn't help because flakes are *illumination*, not
  surface colour.
- **`specaware`** — also smooth here, because these flakes sit on a **roughness-0.25 base**, so
  base-roughness alone never crosses the "keep it sharp" threshold. (It *would* help pure mirrors and
  glass, just not this flake material — which is why the flake mask is the right signal.)
- **`flakeguide`** — the **flake specks are preserved sharp** while the diffuse/GI noise *between*
  them is still cleaned. This is the answer to "at Standard I need to see the flakes regardless."
- **`combo`** — same flake preservation plus albedo demodulation and mirror/glass sharpening; use
  this as the general setting (keeps flakes *and* helps other low-roughness materials), at +14% CPU.

### Why the raw image "looked better" than the denoised one
Because the current filter was throwing away real signal (the flakes) along with the noise, so you
were comparing *noisy-but-complete* against *clean-but-missing-detail*. `flakeguide` fixes the premise:
it denoises the noise and **keeps** the flakes, so it beats both raw and the current à-trous.

## Honest limitations / next step
`flakeguide` preserves flake pixels at their **raw** value, so those pixels keep some Monte-Carlo
noise (you asked for flakes "regardless", and you said the noisy version looked better — this is that,
minus the background noise). The cleaner-still version is to give the flake channel its **own tiny
temporal filter** (accumulate the deterministic flake highlight across frames instead of copying the
raw sample) — that removes the residual sparkle-noise without blurring, and is the natural Phase-2
after this proof. It's the same "diffuse/specular split" idea from `DenoiserResearch.md`, just applied
to the flake sub-channel.

## Files
- `DenoiseZoom.png` — raw vs current vs flake-guide, zoomed (**the proof**)
- `DenoiseCompare.png` — all six variants side by side
- `sweep_<mode>.png` — the full-frame render for each variant
- `MaterialLevelViewport_SystemB+Denoise.patch` — self-contained diff vs clean HEAD: the System-B
  flake wiring plus the `--denoise-sweep` prototypes (`ApplyDenoiseMode`, the guide buffers, the
  `SystemBFlakeWeight` mask). Applies to `Projects/Project-Zero/Host/MaterialLevelViewport.cpp`.
