# Ray-traced reflections and sun shadows — sources of noise, options, measurements

The editor's RTX path (`RayTracing = true`, "RTX ReSTIR PT" in the readout) shows three problems. Its reflections
carry fireflies. Its variance filter blurs every reflection. Its ray-traced sun shadows flicker along their edges,
while the GTX path's shadows are clean. This exhibit finds where each comes from in the port's code, tests options
against the demo's behaviour and measures them in the editor's own scene viewport, offscreen. The report and the
recommendation live in `Documentation/Plans/Ongoing/RayTracedLighting.md`.

Every option is a bit of `RefreshToggles::Refinements` (`RefinementBit`, `SceneLayouts.slang` `RefinementBit…`). All
bits clear reproduce the demo: with mask 0, the direct radiance target was bit-identical to the demo's shader over
8 refreshes in two views (the shader compiled from the commit before the change, swapped into the same host).

## Options

| Bit | Option | What changes | Added work |
|---|---|---|---|
| 1 | 🌞 `SolarDisc` | The sun's highlight is shaded as a disc (representative point, energy-normalised) toward the disc's centre, in the direct term and at every path vertex; reflection rays no longer see the solar disc, whose light the direct term carries | none |
| 2 | 🎲 `StratifiedSun` | Sun-disc samples for the shadow ray follow the R2 sequence ranked over 4×4 pixel blocks, so each block covers the disc evenly every refresh | none |
| 4 | 🌗 `PenumbraFilter` | `PenumbraResolve.slang` averages the sun-ray verdicts over a disc the size of the local penumbra (blocker travel × tan of the sun's radius), with plane and normal weights | one screen-resolution dispatch, early exit outside penumbrae |
| 8 | 🪞 `MirrorFilter` | Surfaces with roughness below 0.10 take the unfiltered reflection, fading to the variance-filtered one by 0.20 | one 4-tap upsample dispatch |
| 16 | 🔍 `MirrorTrace` | With `MirrorFilter`: surfaces below roughness 0.20 are traced once per screen pixel instead of upsampled from half resolution | one ray per smooth screen pixel |

## Run

```sh
cmake --build <build> --target RayTracedLightingCapture
FRONTIER_VULKAN_DRIVER=<SwiftShader>/libvulkan.so.1 VK_ICD_FILENAMES=<SwiftShader>/vk_swiftshader_icd.json \
<build>/RayTracedLightingCapture <build>/ShaderArchives/GlobalIllumination <build>/ShaderArchives/Environment \
    EngineContent/EnvironmentArchives/ProvingGround EngineContent/EnvironmentArchives/CelestialMaps <out> \
    PenumbraNear,TowerShadow Demo,Cascades,StratifiedSun,PenumbraFilter,Refined,Reference 8 16 1
```

The tool takes views and variants as comma-separated lists, then warm-up refreshes, measured refreshes and indirect
light on or off. Each variant starts from a cleared history (reservoirs, variance filters and antialiasing restart)
with time frozen. Its warm-up refreshes run first, then 16 measured refreshes, one whole 16-refresh antialiasing
jitter cycle. `Reference` (unbiased: no penumbra filter, sharp mirrors) measures three cycles. Every stage is its own
submission, and `DeviceExchange::SubmissionTiming` names each stage's cost.

## Measures

| Measure | Definition |
|---|---|
| Fireflies | per refresh: pixels brighter than all 8 neighbours by over 0.12 of full scale and over 1.6× their mean (final 8-bit image) |
| Noise | temporal standard deviation per pixel and channel over the measured refreshes, in 8-bit levels, mean over the region |
| Edge noise | the same over edge pixels: those whose 5×5 neighbourhood in the reference's mean spans over 24 levels of luminance |
| RMS from reference | distance of the variant's mean image from the reference's mean (blur and bias, not noise), over the region and its edges |
| Stage cost | wall time of each stage's awaited submission (SwiftShader: CPU emulation, so ratios matter, not absolutes) |

## Views

| View | Camera → target | What it shows |
|---|---|---|
| `PaneNear` | (3.0, −23.6, 1.5) → (6.0, −27.2, 1.0) | the glass pane (roughness 0.04) mirroring the barriers |
| `ConesNear` | (−33.2, 18.6, 1.3) → (−30.0, 15.2, 0.3) | a skid-pad cone (roughness 0.22) under the sun |
| `PenumbraNear` | (−3.0, −4.5, 2.5) → (−5.8, −1.0, 0.0) | a light pole's head and mast shadow, penumbra 0 → ~17 cm |
| `TowerShadow` | (−37.0, −13.0, 4.0) → (−46.0, −20.0, 0.0) | the control tower's shadow, long edges with growing penumbra |

The sun sits at 38° elevation and 132° azimuth with 98 klx; the clouds cover 42 %. All captures used 480×270 at the
low grade, on SwiftShader on a 2-CPU Linux sandbox (2026-11-02).
