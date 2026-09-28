# Star fix — blocky / pixelated stars

## Root cause
Stars are drawn by `StarAlong` in `Engine/Shaders/PostRecords.slang` and its mirror in
`Engine/GeometricRaster/VisibilityRaster.cpp`. Each star used a **flat-topped disc**:

```
float Radius = max(StarSize*0.0002, PixelAngle*0.5);   // ~half a RENDER pixel
if (Angle > Radius*1.6) continue;                       // hard cut
float Core = Angle <= Radius ? 1.0 : exp(-Falloff*Falloff);  // FLAT TOP inside Radius
```

Three things make that blocky:
1. **Flat top + hard cut = a hard-edged disc.** Point-sampled once per pixel, its edge aliases into square steps.
2. **Radius is tied to the RENDER pixel.** On the reduced-resolution tiers (Minimal/Economy render at ~0.5× and
   upscale), a ~1-render-pixel disc becomes a **2×2+ hard block** on screen — the exact artefact in your capture.
3. **Bright cores clip to white.** `Lum·5.73` sends bright stars over 1.0, so the tone map paints a **solid white
   square** — the most visible blockiness of all.

## The fix (applied to both files, kept in sync)
Replace the flat-top disc with a **smooth, energy-preserving Gaussian point-spread**:
- **Sigma floored to ~0.9 of the render-pixel spread**, so the PSF always spans a pixel with a *soft* edge — there
  is no hard rim left to alias, at any resolution or tier.
- **Magnitude-aware width (≤ 3×):** faint stars stay tight points; bright stars **bloom softly** instead of
  clipping to a block.
- **Flux preserved:** the Gaussian's total energy is matched to the old flat-top+skirt profile
  (Ω_old = 1.727·πR², × the same 5.73 gain), so the faint-end brightness calibration is unchanged — only the
  *shape* changes. The `5.73` factor is now folded into the analytic Gaussian peak.

Files changed:
- `PostRecords.slang` (GPU shader) — see `patches/PostRecords.slang.patch`
- `VisibilityRaster.cpp` (CPU raster mirror) — see `patches/VisibilityRaster.cpp.patch`

The full patched files are included here too (`PostRecords.slang`, `VisibilityRaster.cpp`).

## Proof
`Stars_Compare.png` (from `StarProfileDemo.cpp`, which runs the **exact** old and new profile math) is a 2×2 sheet:

| | Native | 0.5× upscaled (reduced tier) |
|---|---|---|
| **OLD (flat disc)** | faint aliased pinpricks | **hard blocky squares** |
| **NEW (soft PSF)** | smooth round stars, soft bloom | smooth round stars, no blocks |

## Caveats / follow-ups (need a GPU run to close)
- The single-cell lookup still only tests the octahedral cell the ray falls in. The new PSF reach (≤ 3σ, a few
  render pixels ≪ a ~3.6° cell) is far smaller than a cell, so this is safe in practice, but a very bright star
  right on a cell boundary could have its faint outer bloom clipped. If that ever shows, test the neighbouring
  cells too.
- The flux/peak calibration was derived analytically (Ω_old = 1.727·πR²) and matched in the demo; confirm the
  faint-end brightness on hardware and nudge the `0.9`/`0.55`/`3.0` PSF constants to taste. The
  `CheckPostKernel.sh` ceiling/energy pins that guard the two-copy transcription should be re-run so the GPU and
  raster profiles stay byte-for-byte equivalent.
- Best long-term option: draw stars in a **full-resolution** presentation pass so their PSF is sized to the
  *display* pixel rather than the reduced render pixel — then even the coarsest tier gets crisp round stars.

---

## #34 — star **size** upper clamp (separate, smaller change)

The fix above (`patches/PostRecords.slang.patch` + `VisibilityRaster.cpp.patch`) is the **StarFix profile**: it
rewrites the flat disc into a smooth Gaussian PSF to kill the *blocky* look. Roadmap **#34** is a different, much
smaller ask — put an **upper bound on star size** so no star can balloon into a big circle — and it targets the
**original main formula** (which is what you quoted), not the Gaussian rewrite.

```
- float Radius = max(StarSize*0.0002, PixelAngle*0.5);                 // floor only -> can balloon
+ float Radius = clamp(StarSize*0.0002, PixelAngle*0.5, PixelAngle*1.2);// floor AND 1.2-px ceiling
```

Why this specifically fixes "big circles": there was **no upper bound**, so a large `StarSize` (or the wide
pixel spread on the reduced-resolution tiers) grows the disc without limit. A **bright** star is worse still — its
skirt runs out to `1.6·Radius` and is scaled by luminance, so an uncapped `Radius` is exactly why bright stars read
as big circles. Capping `Radius` caps that skirt with it; ceiling `1.2 px` → footprint ≤ ~1.9 px radius. The
half-pixel floor is untouched, so faint stars still get their sub-pixel core.

- `patches/StarSizeClamp_PostRecords.patch` — GPU shader (`StarAlong`)
- `patches/StarSizeClamp_VisibilityRaster.patch` — CPU raster twin (uses `std::clamp`; `<algorithm>` already included)

Both apply cleanly against `main` (`git apply --check` OK). `Stars_SizeClamp.png` (from `StarSizeClampDemo.cpp`,
which runs the exact original disc+skirt math) shows the effect side-by-side: **BEFORE** = big luminance-bloomed
discs, **AFTER** = small points. Reproduce:
```bash
g++ -O2 -std=c++17 StarSizeClampDemo.cpp -o starclamp && ./starclamp
```

### ⚠ #34 and the StarFix Gaussian are MUTUALLY EXCLUSIVE
Both edit the **same `Radius` line**, so you apply **one or the other**, never both:

| You want… | Apply |
|---|---|
| smooth, non-blocky stars (bright ones *bloom* softly, i.e. get **bigger**) | StarFix profile (`PostRecords.slang.patch` + `VisibilityRaster.cpp.patch`) |
| keep the original flat-disc look but **never let a star grow into a big circle** | #34 clamp (`StarSizeClamp_*.patch`) |

The StarFix Gaussian deliberately widens bright stars (σ scaled up to 3× by apparent magnitude, support to 3σ) to
read as bloom — so it would *reintroduce* large bright stars, the opposite of #34. A "smooth **and** small" variant
is possible but not yet built: it would keep the Gaussian shape while also capping StarFix's `BloomScale` (3 → ~1.3)
and its support (3σ → 2σ). Say the word and I'll add it.
