# Sun, sky, stars, moon, fog and flare port — audit, source of truth, and the 1:1 contract

This file is the specification, not a note. Two things go wrong when a port like this is done by description instead of
by transcription: the physics gets re-invented worse than the original, and the UI gets summarised into fewer controls
than the original had. Both are barred here — §4 lists every control with its range, unit and default, and §5 pins the
formula each shader must match. Where this file and the engine disagree, the engine is wrong.

## 1. WHAT THE CURRENT TREE ACTUALLY DOES

| Subsystem | Today (`Source/AtmosphereIntegrator.js` + `Shader/AtmosphereScattering.wgsl`) | Verdict |
| --- | --- | --- |
| Sky scattering | Single scattering only. **Uniform** sample spacing along the view ray (40 view × 12 light), fixed Earth constants compiled into the shader, ozone as a tent, energy-conserving segment integral. No multi-scattering → a high-haze sky and the whole horizon go flat grey. | Wrong spacing, missing order of scattering, nothing editable |
| Sun | A `cos > 0.99998` step disc in `DirectRadiance.wgsl`, ×2500, added to the background only. No limb darkening, no aureole, no colour temperature, no air-mass extinction, no ephemeris. | Placeholder |
| Twilight | Nothing. Below the horizon the march returns black and the host pastes a constant `NightSky = [0.0012, 0.0016, 0.0030]`. | Missing |
| Stars | None. | Missing |
| Moon | A hard-coded vector at 38° opposite the sun, used only as a key-light handover. No disc, no phase, no texture, no moonlight on surfaces beyond that fake. | Missing |
| Planets | None. | Missing |
| Lens flare | None. | Missing |
| Fog | None. Only the local Eulerian tyre plume. Distant mountains have zero aerial perspective. | Missing |
| Controls | One flat outliner row `Sun & sky` with 4 presets, 5 sliders and a 2-D semicircle. `SkyScale` and `SolarIlluminance` are the only physical knobs; the medium itself is not editable. | 8 controls where the source has 60+ |
| Bake gating | `RecordSkyView` keys on the **sun direction and illuminance only** — so editing Mie, ozone or a scale height never rebuilds the sky. | Broken gate |

The constants are also duplicated rather than shared: `AtmosphereIntegrator.js` re-declares `RayleighScatter`, `MieExtinction` and
`OzoneAbsorption` that `AtmosphereScattering.wgsl` already compiled in, and the JS copy is used for the key light while the WGSL
copy is used for the sky. They agree today only by luck. This is the defect `Frontier-/AtmosphereModel.h` and
`Slate/AtmosphereProjection.slang.h` both exist to prevent — one definition, read by every consumer.

## 2. SOURCE OF TRUTH

| Concern | Authority | Why |
| --- | --- | --- |
| Atmosphere medium, twilight, sun disc, moons, stars, fog, flare **physics** | `SultanAladin/Frontier-` → `Engine/DisplayPresentation/{AtmosphereModel,AtmosphericOptics,FogModel,LensFlareKernel,StarFieldControls,SunColourTemperature}.h`, `Engine/Shaders/{SkyRecords,MoonRecords,PostRecords}.slang` | It is the shipped implementation, it is measured (the sky proofs report 0.014–0.123 % bake error), and it carries the reasoning for every deliberate deviation |
| The three-surface **LUT chain** and its dirty-gating | `SultanAladin/Slate` → `Engine/SlateCompute/Compute/AtmosphereIntegrator/`, `Engine/Shared/AtmosphereProjection.slang.h` | Half-precision transmittance/multi-scatter/sky-view surfaces, `RebuildOwed()` gating, and the rule that a bake and its lookup are one mapping written once |
| **Editor panels, control names, ranges, defaults** | `Frontier-/Engine/Editor/{Sun,AtmosphereSky,Stars,Moon,Fog,LensFlare}InspectorPanel.cpp` + `Projects/Project-Zero/Source/CelestialSequence.cpp` (the sheet builders) | The C++ panel is the faithful port of the reference HTML; the HTML in `Experimental/FrontierEditor` is the loose one. Controls come from the C++ |
| Editor shell, outliner, CSS vocabulary | `SultanAladin/Frontier@arena/67f1c409-frontier` → this prototype's `EditorShell.js` / `EditorControls.js` / `Style/FrontierEditor.css` | Already in the tree; the port extends it rather than restyling it |

⚠️ **`Frontier-` explicitly rejected LUTs and reverted them** (`AtmosphereModel.h` header note: measured no gain on a
GPU-bound frame, "the burden of proof sits with the LUT"). That verdict was Vulkan/RTX, not WebGPU. Here the LUT wins on
different grounds: the sky must be read by *four* consumers (primary sky pixels, card radiosity, cabin glass, plume
marching) and one WebGPU bind group cannot re-march 40×12 at every card texel. **The analytic march stays in the tree as
the bake itself** — the bake *is* the analytic integral, run once per amendment — so nothing is lost by the LUT that
`Frontier-` was protecting against, and the `Fetch Baked Dome` toggle keeps the analytic path reachable.

## 3. TARGET ARCHITECTURE

```
  SOURCE/ENVIRONMENT/                        SHADER/                          PER FRAME
  ─ EnvironmentSpecification.js  ─┐          AtmosphereModel.wgsl  (include)  ┌─ 0.00 ms while nothing is edited
    every control, range, default ├─► record ├─ AtmosphereScattering.wgsl      │   (dirty key = the whole medium+sun
  ─ Atoms: one JS mirror per      │  encode  │    ① Transmittance 256×64       │    key), so driving costs nothing
    C++ header, byte-identical    │          │    ② MultiScatter   32×32       │
  ─ CelestialSolver.js            ▼          │    ③ SkyView 192×108 ── reads ① ②
    NOAA ephemeris + day clock               ├─ SkyCelestial.wgsl    (include) ┤─ per sky pixel: LUT fetch + sun disc
  ─ StarCatalogue.js (8 920 records)         │   SunAlong StarAlong MoonAlong  │   +limb+aureole, stars, moon, planets
  ─ LensFlareKernel.js                       │   FogAlong, FlareAlong           ├─ per geometry px: O(1) analytic fog
  ─ EnvironmentRecord.js (layout)            └─ EnvironmentRecords.wgsl (struct)┤  once px: O(1) flare, depth-gated
```

Rules the port is held to:

**R1 — one definition.** Every constant lives once, in the JS specification, and is uploaded. No WGSL `const` for anything
the panel can edit. (`Slate/AtmosphereUniform.slang` and `Frontier-/SkyRecords.slang` both carry this note; both were
written because two copies drifted.)

**R2 — the sky is analytic, the *bake* is the LUT.** ① and ② rebuild only when the medium changes; ③ rebuilds when the
medium, the sun, or the camera altitude changes materially. `Frontier-`'s tier ladder sets sample counts; they are not
compiled in.

**R3 — nothing that twinkles gets baked.** Stars never enter ③, because a point source in a 192×108 sheet is a shimmering GI
splotch; card irradiance reads the smooth dome only, and the night ambient gets the *integrated* starlight and Milky Way as a
cheap analytic dome term instead. The solar **disc** stays out of ③ too (it is added analytically after the fetch, where it is
today), but the **aureole stays in** — the Mie lobe is smooth on the scale of a texel, which is what makes it bakeable. Inside
the disc's own cone the fetch is replaced rather than filtered, so a bilinear tap never smears disc-shaped energy into the
neighbourhood of the sun; that is `Frontier-`'s `SkyDomeCovers` rule (sun cone *and* horizon band march, everything else
fetches) carried over to the sky-view sheet, and it is also what keeps the horizon hairline crisp when ③ is in use.

**R4 — fog is O(1) or nothing.** No froxel march for aerial perspective. `FogModel::Transmission` is a closed form; it
runs on geometry pixels only, with the sky's own horizon transmittance left alone so enabling fog never erases the sunset
hairline.

**R5 — the inspector shows real pixels.** The Atmosphere panel's "Baked atmosphere" card displays the actual ③/① textures
read back from the device (radiance / panorama / transmittance / altitude profile), exactly as `SkyCache` does in
`AtmosphereSkyInspectorPanel.cpp`. Illustrations are labelled as illustrations.

## 4. THE 1:1 CONTROL CONTRACT

Ported from the sheet builders (`CelestialSequence.cpp` `MakeSlider/MakeSwitch/MakeSelect/MakeColour/MakeReadout`) and
laid out per `Record*Inspector`. Name · range · default · unit · decimals, in that order. Dropping one is a defect.

**4.1 Sun** (`SunInspectorPanel.cpp`) — header `DIRECTIONAL LIGHT`, bake pair, 4 quick tiles, then cards.
- Baking · `Sun lighting bake` + `Sun disc bake` cards, each: *Use baked image* tile, *Bake*, *Load image*, source caption, status. Both targets distinct; neither aliases the dome bake.
- Quick tiles: `Sunlight` (unavailable, no independent enable), `Sun disc` (same), `Day cycle` → `Animate`, `Dynamic/Static` → same `Animate` binding, never a second flag.
- Child row: `Lens Flare — Optical effect subcomponent`, arrow.
- `Sun direction` card: orbit dial (Az/El), `Local Hours` 0–24 h · 2 dp · shared with the cycle card, `Azimuth` 0–360° and `Elevation` ±90° as **solver readouts with disabled sliders**.
- `Sunlight intensity` card: `Intensity` 0–60 × · 1 dp with the illuminance response curve, `Direct` 0–5 × · 2 dp.
- `Temperature` card: `Colour source` {RGB, Kelvin}, `Temperature` 2000–10000 K · 0 dp, the warm→cool spectrum pill, `Sun Tint` RGB chip; Kelvin→linear sRGB through the Planckian locus, negative channels clipped, peak-normalised; manual HDR tint remembered across mode switches.
- `Daylight cycle` card: `Local Hours` (same property), the 24 h curve, 00:00/06:00/12:00/18:00/24:00 ticks, period pill (Night/Morning/Afternoon/Evening).
- `Sun disc` card: `Angular Diameter` 0.1–5 deg · 2 dp, glow-ringed disc illustration, Pinpoint↔Broad labels.
- `Dynamic settings` card: `Day duration` 0.01–168 real h per 24 h cycle (= 24/`Speed`), x1/x8/x30/x100 presets.
- Collapsible `Additional Sun settings`: `Direct`, `Sun Tint`, `Day of Month` 1–31, `Month` 1–12. Hidden but live: `Latitude` ±90°, `Longitude` ±180°, `Speed`, `Declination`, `Equation of Time`.

**4.2 Atmosphere / Sky** (`AtmosphereSkyInspectorPanel.cpp`)
- `Atmosphere bake` card: `Fetch Baked Dome` switch (OFF = analytic march), *Bake atmosphere*, status line (no baked image · stale · resident · current), and a caption naming **our** chain — `3 × RGBA16F · sky view 192 × 108 · transmittance 256 × 64 · multi-scatter 32 × 32`. The C++ panel's own caption reads `256 × 512 radiance + transmittance` because `Frontier-` bakes one octahedral dome sheet instead; the layout is ported, the numbers are ours, and neither is silently swapped for the other.
- `Baked atmosphere` card: four buttons **Air · Panorama · Transmit · Sphere** over one image that shows *actual baked pixels* — profile (altitude column opposite the baked sun), panorama (the sky-view sheet decoded), transmittance (the ① sheet), full sphere (the same fetch folded). Per-view caption; and the disclaimer "Atmospheric scattering only: the bright area is scattered sunlight, not the Sun disc."
- `Atmospheric scattering`: `Rayleigh` 0–4 × · 2 dp + the λ⁻⁴ curve with the haze line and the spectrum strip.
- `Aerosol haze`: `Mie` 0–6 × · 2 dp + the source-to-distance attenuation diagram.
- `Ozone absorption`: `Ozone` 0–4 × · 2 dp + the Chappuis-band curve.
- `Density falloff`: `Rayleigh Scale H` 2000–15000 m · 0 dp, the 10-bar km chart, `Mie Scale H` 300–4000 m · 0 dp.
- `Ground reflectance`: `Ground Albedo` RGB (default 0.19/0.17/0.14), applied separately, not baked into the dome.
- Collapsible `Additional atmosphere settings`: `Sky Brightness` 0–3 × · 2 dp, `Sky Tint` RGB, `Mie Anisotropy` 0–0.99 · 3 dp, `Atmosphere` (shell height) 10000–120000 m, `Horizon Glow` 0–3 ×, `White Line` 0–3 ×, `Line at civil only` switch, `Air Mass` readout, `Tier Samples` readout.

**4.3 Stars** (`StarsInspectorPanel.cpp`)
- `Stars settings`: tiles `Star field`, `Twinkle` (both live green/red), `Bake`, `Use baked` (**disabled** — no baked-star playback).
- `Star field`: the **8 920-record equatorial catalogue chart** (RA horizontal, declination vertical, rotation applied as the inverse of the renderer's transform), `Limiting magnitude` 0–8 mag · 1 dp, live `n / 8920 stars` count.
- `Twinkle`: 4-second oscilloscope trace of the two-frequency signal, instantaneous-% readout, `Twinkle depth` 0–100 % · 0 dp, `Twinkle rate` 0.2–3 Hz · 2 dp.
- `Celestial rotation`: the draggable pole dial (pointer, arrows, Shift = 10°, Home = 0) + `Celestial rotation` 0–360° · 1 dp.
- `Renderer scale`: `Brightness` 0–4 ×, `Point Size` 0.4–3 ×.
- Readouts: `Loaded`, `Sidereal Time`.

**4.4 Moon & planets** (`MoonInspectorPanel.cpp`)
- `Moon settings`: `Visible`, `Follow sky` tiles + a compact active-instance dropdown (M1…M4, labels are the instance names).
- `Moon catalogue`: one horizontal strip of the six **real textured bodies** — Luna, Ember, Glacier, Sulfur, Shroud, Shard — click a sphere or its caption to re-body the selected instance; arrows scroll without changing selection.
- `Lunar phase`: `Phase` in days on the 29.53-day cycle, "% illuminated", the textured phase-lit disc.
- `Moonlight`: `Bright` 0–6 ×, `Glow` 0–3 ×, glow field, phase-weighted strength readout.
- `Moon size`: `Size` 0.1–max(180, size) deg, compressed comparison ring, free-entry field, `Natural size · 0.52°` button.
- `Lunar position`: the spherical dial (drag) + `Azimuth` 0–360°, `Elevation` ±90°, disabled while `Follow sky` is on.
- `Moon rotation`: `Roll` 0–360°, `Pitch` ±180°, guide-marked disc, `Reset orientation`.
- Readouts: solved `Elevation`, `Azimuth`, `Illumination`.
- Preset bodies carry `Haze` (0 / 0.08 / 0.05 / 0 / 1 / 0), `SizeDegrees` (0.52 / 1.6 / 1.2 / 1.1 / 2.4 / 0.6), `Gamma` (1×5, 0.9 for Shard), `TiltDegrees` (6.7 / 25 / 3 / 2 / 27 / 0). **Convention traps:** up is +Z; panel phase 0 = full while the ephemeris says 0 = new, converted once at pack time; albedos linear.
- Planets ride the star lane: Venus, Jupiter, Mars, Saturn as low-scintillation discs with their own magnitude, size and colour, off by default.

**4.5 Fog** (`FogInspectorPanel.cpp`) — two sibling entities, exactly as the engine separates them.
- `Height fog`: `Enabled` tile, `Density` 0–0.2 1/m · 4 dp, `Falloff Height` 10–3000 m, `Sun Scatter` 0–2 ×, `Colour` RGB; the vertical density curve (0–3 km) and the note that height fog keeps the legacy `exp(−optical depth²)` law.
- `Atmospheric fog` (aerial perspective): `Enabled`, `Density` 0–4 ×, `Start` 0–2000 m, `Mie Blend` 0–1 (spectral Rayleigh → grey aerosol); the RGB distance-vs-transmission graph with a pointer/keyboard probe that never edits density.
- Both: `Visibility through fog` card with the mean % readout and the probe caption, and a `Neutral-light reference` swatch.

**4.6 Lens flare** (`LensFlareInspectorPanel.cpp`) — child of Sun in the outliner.
- Header `Enabled` button; `Lens flare image` thumbnail; `Flare composite` with the draggable + arrow-keyable source over the 640×280 linear cache, `Recenter`, and `Intensity` 0–3 × / `Spread` 0.25–2 ×.
- `Flare layers`: `Type` {Cinematic, Anamorphic, Starburst, Halo, **Custom layers**}, three layer tiles `Anamorphic` / `Streaks` / `Starburst` (editing one selects Custom), `Rotation` 0–180°, `Ray pairs` 2–12.
- `Lens ghosts`: −/+ and `Ghosts` 0–24, three shape cards {round, hexagonal, octagonal}, `Ghost brightness` 0–2 ×, `Ghost spacing` 0–2 ×, `Chromatic` 0–1.
- `Halo & optical response`: `Halo Radius` 0.1–1.2, `Halo width` 0.005–0.2, `Halo brightness` 0–3 ×, `Streak gain` 0–3 ×.
- `Legacy preset settings`: `Aperture Blades` 3–12, with the label stating that Custom uses ray pairs.
- `Bake / export HDR` writes the linear cache (PFM), `Use baked image` disabled.

**4.7 Outliner** — the flat `Sun & sky` row is deleted. `Environment` becomes a folder with children, matching the
`Inspector / Environment` header every C++ panel already prints:

```
Environment
  ├─ Sun            (Directional light)      → child: Lens Flare (optical subcomponent)
  ├─ Atmosphere     (Scattering medium)
  ├─ Stars          (Point-source sky)
  ├─ Moon & planets (Night sky bodies)
  ├─ Height fog     (Analytic ground layer)
  └─ Aerial fog     (Analytic aerial perspective)
```

## 5. FORMULAS, TRANSCRIBED NOT REINVENTED

| Name | Source | The part that must not be "improved" |
| --- | --- | --- |
| Single-scatter integral | `AtmosphereModel.h::Integrate` | `s²` quadratic spacing; Mie extinction = 1.1× scattering; ozone absorption multiplied by the *Rayleigh* column; ground clip ends the ray |
| Phase | same | `PhaseR = 3/(16π)(1+µ²)`; `PhaseM = 3/(8π)·(1−g²)(1+µ²)/((2+g²)(1+g²−2gµ)^1.5)` |
| Ozone | `Slate` | a **tent** about 25 km ± 15 km, not an exponential — a layer with a maximum aloft is why twilight is blue and not brown |
| Transmittance LUT | `Slate` | discriminant as `r²(µ²−1)+R²`, never the expanded quadratic — the expanded form loses every digit at grazing angles, i.e. exactly at the horizon |
| Twilight | `AtmosphereModel.h::Twilight` | window `smoothstep(−16,−5)·(1−smoothstep(0.5,6))`; log-altitude colour ramp C0→C4; the hairline is `exp(−(alt/0.11°)²)` — 0.11° is a fifth of the sun and is what makes it a *line*; art-directed, and labelled as such |
| Aureole compression | `SkyRecords.slang::SkyAlong` | knee 1.0, slope 0.06, σ 5°, one ratio for all channels so the hue survives; without it the sun is a white blob with no edge |
| Sun disc | same | `kSunRadius = 0.265°`, soft 0.25, boost 12, limb `mix(1,0.55,…)`, horizon softening `mix(1,2.2,1−smoothstep(0,4,elev))`, `mix(0.35,1,smoothstep(−1,8,elev))`; the panel's extra analytic glow stays **out** (the Mie lobe already pays for it) |
| Stars | `PostRecords.slang::StarAlong` | gate on the sky's own luminance at that pixel with ceiling 0.09 — daylight removes the contrast, not the star; horizon→equatorial two-rotation transform; octahedral 32×32 bins; profile = half-pixel core, third-pixel skirt, cut at 1.6 r; gain ×5.73; magnitude cut `10^(−0.4m)` |
| Twinkle | `StarFieldControls.h` | `1−depth·(0.5+0.3 sin T+0.2 sin(0.47T+0.8))`, `T=(t+phase)·2πf`, phase `13x+37y+71z` so binned duplicates cannot disagree |
| Moon | `MoonRecords.slang::MoonAlong` | ray-cone tangent projection (`sin(a)/sin(θ)`), 3-D sphere normal, tilt→spin→UV, `lit=(sin φ,0,cos φ)`, wrap `haze·0.3`, limb `mix(1,0.5,1−z²…)`, edge `0.975→0.88`, earthshine 0.012, rim, corona `exp(−a/1.4θ)·0.09+exp(−3.5a)·0.005`; zenith guard on the cross product (the panel's goes NaN overhead) |
| Moon ambient | same | `tint·bright·max(dir.z,0)·0.0025·(0.5+0.5 cos 2πφ)` — deliberately tiny and phase-gated |
| Fog | `FogModel.h` | height: `exp(−OD²)` with an exponential altitude column; aerial: separate Rayleigh/Mie columns after `Start`, Mie-blended, per-channel Beer; the two layers composed **separately** so height tint never colours aerial extinction; sun in-scatter `HG(g=0.55)·clamp(sun.z+0.1,0,1)`; distance capped at 100 km |
| Flare | `LensFlareKernel.h::LFRender` | the whole kernel verbatim: edge fade, anamorphic cool streak, rotatable warm streak, `sin(angle·pairs)^32` burst, core pair, ghost loop with polygon folding `cos(Fold)/cos(π/n)`, golden-ratio radii, halo with hue from angle+offset·8 |
| Kelvin | `SunColourTemperature.h` | Planckian-locus xy → XYZ → **linear** sRGB/Rec.709, clip negatives, peak-normalise; display transfer only on swatches |

## 6. FRAME BUDGET

| Work | Cost | Amortised by |
| --- | --- | --- |
| ① Transmittance 256×64 | ~0.04 ms | per **medium** amendment only — the sun moving does not touch it |
| ② Multi-scatter 32×32 | ~0.02 ms | per medium amendment |
| ③ SkyView 192×108 | ~0.25 ms worst case | per medium **or** sun **or** altitude change; `Frontier-`'s stale-bake warning is the model for telling the artist when it is dirty |
| Sky pixels: LUT fetch + sun/stars/moon/planets | ~0.03 ms | every frame, and only on `Depth ≤ 0` |
| Geometry pixels: analytic fog | ~0.02 ms | closed form; no march, no froxel buffer |
| Flare | ~0.01 ms | gated off when the sun is behind the camera, below the horizon, or depth-occluded |
| Card / cabin / plume sky reads | 0 | one texture fetch each, unchanged in count |
| **Total added** | **≈0.06 ms/frame while driving** | |

Measured, not asserted: `HardwareMetrics.js` already times passes, and the Atmosphere panel's bake card prints the real
rebuild count and last bake duration.

## 7. STAGES

Each stage ends green: the JS suites under `Tools/`, plus a headless capture through `Tools/HeadlessHarness.mjs`.

| # | Delivers | Proof |
| --- | --- | --- |
| 1 | `Source/Environment/` medium + record + `EnvironmentRecords.wgsl`; constants stop being duplicated; the bake key covers the whole medium (the broken gate is fixed) | `Environment.test.mjs`: record layout ↔ WGSL struct offsets, one-definition grep, key-sensitivity table |
| 2 | ① ② ③ LUT chain, quadratic spacing, ozone tent, multi-scatter, sun-cone inpainting, dirty gating | parity test against a JS re-transcription of `AtmosphereModel::Integrate` at 6 times of day; bake RMSE ≤ 0.13/255 |
| 3 | Sun: ephemeris, Kelvin, Kasten–Young air mass, limb-darkened disc, aureole compression, twilight ramp + hairline | known dates vs the NOAA figures; disc edge stays sharp after the curve |
| 4 | Stars + Milky Way: catalogue import, bins, magnitude cut, twinkle, pixel-footprint AA, night ambient | Orion's belt lands where it should at the site latitude; no star above the ceiling in daylight |
| 5 | Moon (six bodies, phase, texture) + planets + moonlight NEE + ambient handover | phase lit from the right side; no NaN overhead; `MoonAmbient` matches the raster's term |
| 6 | Height + aerial fog with the horizon guard; flare with depth occlusion | fog never erases the sunset hairline; flare hidden behind a building |
| 7 | The six inspector pages + Environment folder, all §4 controls, real baked-pixel previews | every control enumerated in §4 present with the same label/range/default/unit; readback image non-empty |

## 8. ASSETS

- **Star catalogue:** `Frontier-/EngineContent/StarCatalogue/BrightStars.bin` — 'SLAT' v1, 8 920 records × 28 B (dir³, luminance, linear RGB from B−V). Converted to `Style/Celestial/stars.bin` (same 249 KB, 16 B header stripped) so the browser fetches a `Float32Array` directly. Real stars, not a hash field: the constellations are the thing that makes a night sky read as a place.
- **Moon bodies:** `Frontier-/EngineContent/CelestialTextures/*_2k.jpg` — the six the C++ panel previews. Copied as-is and down-pyramid'd to 512² and 128² PNGs at import time by `Tools/BuildMoonAtlases.py`; the 2 K originals stay out of the tree (2.6 MB for a disc that never covers more than a few hundred pixels here).
- No other binary. Everything else is procedural or already in the repo.
