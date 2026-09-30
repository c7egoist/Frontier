# Weather fixes — fog "cylinder" + wind advection mode (2026-09-28)

Two engine fixes, delivered as patches against `SultanAladin/Frontier-`@`main`. Both apply cleanly
(`git apply --check` OK) and the touched C++ headers pass `g++ -fsyntax-only`. **Not GPU-tested here** (no
Vulkan/Slang toolchain in the sandbox) — build + verify on the RT PC, and re-run the wind mirror gate
(`CheckWindField` / the cloud shader-mirror proof) after applying the wind patch.

Patches:
- `patches/Fog_HorizonContinuity.patch` — fog cylinder fix (1 shader hunk).
- `patches/WindAdvection_Mode.patch` — wind advection mode (shader + CPU twin + packing + settings + inspector).
- `patches/ALL_WeatherFixes.patch` — both, combined.

---

## 1. Fog "cylinder" at low quality — bounds discontinuity

**Symptom (your report):** standing *inside* fog on low quality, a cylinder/wall of fog appears around you;
"probably the trace or bounds."

**Cause:** the volumetric march distance in `ReSTIRViewport.slang` is the **surface hit distance** for pixels
that hit geometry, but a flat **`distance = 100000`** for pixels that miss (sky):

```glsl
float distance = 100000.0;
if (surfaceHit) { ... distance = length(delta); ... }
```

Past the edge of the **finite ground mesh**, rays stop hitting geometry and flip to the 100000 branch. Ground-hit
pixels fog to the (near) surface; the sky pixels just past the mesh edge fog to 100000 — a step change in fog
thickness that draws a **ring / cylindrical wall** around the camera. On low quality the reduced render scale and
coarse march make that ring hard-edged and obvious.

**Fix:** a sky-miss ray pointing **below the horizon** now integrates fog to the **implicit ground plane at z = 0**
(which is exactly the height-fog's own z-reference in `WeatherColumn`) instead of the full sky distance, so fog stays
**continuous across the finite mesh's edge**:

```glsl
else if (direction.z < -1e-4) { float g = -CameraOrigin.z / direction.z; if (g > 0.0) distance = min(g, 100000.0); }
```

Upward/near-horizontal rays keep the sky distance. Self-contained; no CPU-parity implications.

---

## 2. Wind "ruins the cloud shape" — advection mode (translate ⇄ shear)

**Symptom (your report):** wind should just translate the cloud, but instead it "ruins the shape — looked like a
mess, like it was translated by heavy noise," and "it doesn't shear in one direction." You asked to make it
**optional**: choose **shear** (realistic) or **translation**.

**Cause:** the camera cloud advects with a **per-height velocity × the weather clock**
(`VolumetricMedia.h::CloudDensity` → `WindField::SampleStep(Wind, Altitude)`, mirrored on the GPU by
`WeatherMedia.slang::WeatherDrift`). Because the velocity varies with altitude (Shear + Veer) **and** the clock
grows without bound, the horizontal offset between the **top and bottom** of a cloud diverges over time: adjacent
heights end up sampling completely unrelated parts of the noise field → the cloud is **stretched into
decorrelated noise**. The Veer term also turns the direction per-km, so it isn't a single-direction lean. (The
ground cloud-shadow never had this — it advects with a single *mid-slab* folded drift, i.e. pure translation.)

**Fix:** split advection into a **bulk translation** + an **optional, bounded shear**, selected by a new mode:

- **Bulk** = the wind at a **reference altitude** (mid-slab for the deck, centre for a local puff), integrated over
  the clock. Uniform across height ⇒ it can only *move* the medium; the shape is preserved. This is now the default
  ("Air shear" off) and matches how the ground shadow already advects.
- **Shear** (opt-in) = adds the **height-relative** velocity difference `(v(z) − v(ref))`, but its time growth is
  **capped at 45 s** so the medium leans to a **steady, coherent tilt** instead of stretching without limit into
  noise. This is the "realistic" mode, now well-behaved.

Mode lane: `Weather[3].z` (previously unused) — `0 = translate`, `1 = shear`. The GPU `WeatherDrift` and the CPU
`CloudDensity` were changed with **identical expressions** so the shader-mirror stays consistent (the existing
"close, not bit-exact" tolerance applies; re-run the gate).

### UI
A new **"Air shear"** toggle in the **Wind** inspector's *Flow* card (`WeatherInspectorPanel.cpp`), backed by
`WindSettings::Advection` (`WindField.h`), built into the sheet and read back on both the base-wind and
owned-component apply paths (`CelestialSequence.cpp`). Off = rigid translation, On = altitude lean. Default **off**
(clean shape-preserving), so out of the box clouds no longer smear.

> ⚠️ The panel tile's pixel placement (`Y2+400`, card height `600`) was set without a live view — if it crowds the
> Beaufort readout on your resolution, nudge those two constants; the toggle itself is fully wired.

### Files touched (wind)
| File | Change |
|---|---|
| `Engine/Shaders/WeatherMedia.slang` | `WeatherRefKm()` + rewrite `WeatherDrift` (bulk + bounded shear, mode-gated on `Weather[3].z`) |
| `Engine/DisplayPresentation/VolumetricMedia.h` | `CloudDensity` CPU twin: same bulk + bounded shear |
| `Engine/DisplayPresentation/WeatherConstantRecord.h` | pack `W[3][2] = Advection` |
| `Engine/DisplayPresentation/WindField.h` | `WindSettings::Advection` field (default 0 = translate) |
| `Projects/Project-Zero/Source/CelestialSequence.cpp` | build "Air shear" switch + read it back (base + component) |
| `Engine/Editor/WeatherInspectorPanel.cpp` | render the "Air shear" tile |

---

## Also answered this round (no code)
- **Antialiasing** is native (Halton(2,3) jitter + temporal accumulation), gated by the `AntiAliasing` toggle;
  **on** for the ReSTIR / GI-on path, **not** on the GI-off plain-raster path (kernel skipped), and off entirely on
  the Minimal tier. There is no separate "surfel" path in the engine. Nothing was added to the engine.
- **Cloud-shadow toggle** already exists — `"Shadow Enabled"` in the Clouds inspector's *GPU cloud shadows* fold
  (`CelestialSequence.cpp::BuildCloudShadowSheet` → `CloudsInspectorPanel.cpp`).
