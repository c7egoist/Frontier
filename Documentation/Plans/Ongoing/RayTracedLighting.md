# Ray-traced reflections and sun shadows (RTX path) — report

Status: **report with tested options** (2026-11-02, branch `arena/88b72faa-frontier`). Every option is opt-in behind
`RefreshToggles::Refinements`; mask 0 keeps the 1:1 port (direct radiance bit-identical to the demo's shader).
Measurements and method: `Exhibits/RayTracedLighting/`.

## 1. Short answers

| ❓ Question | 💡 Answer |
|---|---|
| 🔥 Where do the reflection fireflies come from? | RESULTS-FIREFLIES |
| 🌫️ Why is every reflection blurred? | The reflection is traced at **half resolution** and upsampled ×2. Then the glossy variance filter runs **three 5×5 à-trous passes** (reach ±8 half-resolution pixels, ±16 on screen). Their edge stops look only at the *receiving* surface's depth, normal and luminance, so a flat mirror is blurred like a rough floor. Its temporal step reprojects with the surface's motion, which smears reflected images when the camera moves |
| 🌗 Why do RTX shadow edges flicker while GTX shadows are clean? | RTX sends **one ray to a random point of the sun's disc per pixel and refresh**, a binary verdict that only the antialiasing (10 % blend, 3×3 clamp) averages. A penumbra a few pixels wide stays noisy. GTX's "SDF" shadows are in fact **three raster cascades with 3×3 PCF**: deterministic, so clean, but a fixed blur with no contact hardening, limited by shadow-map resolution |
| ✅ Which options are better? | RESULTS-VERDICT |

## 2. What the two paths do today

| | 🟩 GTX (`RayTracing` off) | 🟦 RTX (`RayTracing` on) |
|---|---|---|
| Diffuse GI | distance field + surface cards | ReSTIR path tracing (`MaxBounces` 3) |
| Reflections | distance-field march, card radiance at the hit, roughness ≤ 0.50 | BVH trace, 2 bounces with sun/fire/HMI/light NEE at each hit, roughness ≤ 0.80 |
| Reflection resolution and filter | half resolution, glossy variance filter, ×2 upsample | same |
| Sun shadows | 3 raster cascades, 3×3 PCF | 1 BVH ray per pixel and refresh to a jittered point of the disc |
| Sun highlight | toward the disc's centre | toward the shadow ray's jittered direction |
| Firefly guard | — | GI path samples clamped at luminance 24 (`FireflyFilter`); reflections only at 200 |

## 3. Options tested

RESULTS-OPTIONS

## 4. Recommendation

RESULTS-RECOMMENDATION

## 5. Other findings

- The shadow cascades are rasterized on the RTX path too. They cannot be skipped: the environment's fog shafts sample
  them (`EnvironmentOverlay` `SceneShadowDepth`).
- The demo's `FireflyFilter` clamps only the indirect path samples and the ReSTIR spatial weights. Reflection samples
  are clamped at 200, which is roughly 400× a sunlit grey surface.
- The omitted vehicle's clear coat (roughness 0.03) is the worst case for both sun mechanisms. 🌞 `SolarDisc` matters
  most when the car returns.
- ReSTIR's path vertices shade the sun through the same next-event estimate as the reflection hits, so 🌞 `SolarDisc`
  also removes highlight spikes from indirect light.
- 🐞 **With indirect GI off, the RTX reflections vanish.** The glossy variance filter's temporal step, its wavelet and
  its screen upsample all take their validity guide from the ReSTIR temporal pass (`ReservoirTemporal` writes
  `GuideViews`). Without indirect light that pass does not run, the guide goes stale, and every half-resolution
  reflection texel is treated as invalid (zero). This is inherited from the demo's structure. A fix is to write the
  guide when indirect light is off (a guide-only entry of `ReservoirTemporal`), or to give the glossy filter a guide of
  its own. 🔍 `MirrorTrace` is unaffected because it writes the screen directly.
