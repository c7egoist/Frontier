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
