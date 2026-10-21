# 📦 Celestial demo vs Vehicle HMI — source audit and improvement report

**Date:** 2026-10-21 · **Scope:** report only; no renderer changes in this audit.

## 🧭 Evidence and interpretation

The linked demo is **not the native C++ renderer** previously audited. GitHub Pages reports
its published source as `arena/01a08c57-frontier:/docs`, built from commit
**`da3720b353dc0e4d2421f064f65cbfeb41cdb5f2`**. Both the Pages build metadata and source tree
were checked. The demo is a standalone WebGL environment renderer with an HTML editor,
a Canvas2D precipitation overlay and an optional Three.js transform gizmo.

The deployed HTML/GLSL and its `CLAUDE.md` were inspected through GitHub. This is a
**source audit**, not a same-PC visual or FPS benchmark of the live URL. Visual explanations
below are supported by implemented shading differences and the user's observations, not
an assertion that screenshots from both applications were compared at identical settings.

The reference `CLAUDE.md` specifies decoupled architecture, domain naming, physical units,
Z-up coordinates and quantitative metrics. It does **not** define an emoji comparison legend.
This report uses: ✅ implemented/verified in source; 🟡 approximate/partial; ❌ missing;
🎯 proposed work; 📏 calculated payload; 🧪 previously recorded test; ❓ not measured.
The HTML demo itself is Y-up; our prototype is Z-up. A port must explicitly rotate axes
(e.g. `(x, y, z) → (x, −z, y)`), not paste its height/wind equations unchanged.

**Main conclusion:** its visual advantage comes mainly from richer cloud illumination,
real bounded local fog, coordinated wind/weather, and stronger art direction—not proof
that WebGL is faster or that every part of the reference is more physically correct.

## ① 🎨 Visual and feature comparison

| Effect | What the published demo actually does | Current prototype | Why the reference can look better / what to improve | Likely incremental cost, not measured FPS |
|---|---|---|---|---|
| ☁️ Global volumetric clouds | Spherical shell; four-octave shape plus two erosion octaves; six height profiles; wind shear/anvil lean; dual-lobe HG scattering; up to five sunlight-density taps; three-octave multiple-scatter approximation and Beer–powder term. Standard uses 28 primary samples / 4 light taps. | ✅ Independent low-resolution slab renderer; baked FBM shape; default 12 sky samples; approximate height/forward lighting; no volumetric self-shadowing. | Internal shaded structure, brighter silver edges, dark crevices and erosion explain a major quality gap. Add shape/detail separation and cheap bounded light attenuation before increasing global resolution. | 🔴 Highest risk: secondary light samples multiply density work. Keep low-resolution targets and quality tiers. |
| 🌥️ Local clouds | Movable box/ellipsoid; three formation profiles, erosion, softness, shared cloud lighting; combined local fog/cloud march with shared extinction and shadow sampling. | ✅ One ellipsoid; Puff/Bank/Wisp placement presets; volume-relative shape; approximate lighting. | Our presets change bounds/material parameters, not the reference's distinct formation models. Add true formation profiles, box option, erosion and consistent local lighting. | 🟡–🔴 Depends on occupied screen area, detail and light taps. |
| 🌫️ Local volumetric fog | Actual finite Box/Ellipsoid/Sphere/Dome volume; heterogeneous noise; soft shell, density falloff, bottom-heavy density; absorption/albedo; HG scattering; sunlight self-shadow and point/spot illumination. | ❌ No dedicated local fog volume. Height fog and aerial fog are analytic geometry-distance effects. Tyre smoke/local clouds are not substitutes. | This is a genuinely missing feature, not a slider problem. Add bounded fog that visibly catches headlights/spotlights and mixes extinction correctly with clouds. | 🟡 Bounded integration + limited light list; 🔴 if every step loops all scene lights. |
| 🌬️ Wind | Shared CPU/GPU field: integrated displacement, gust phase, altitude speed shear, directional veer and optional noise swirl; linked to local fog, both clouds and precipitation. | 🟡 Cloud speed/bearing/follow controls; cloud offset derives from speed × elapsed time. No equivalent shared gust/shear weather field. | Shared motion makes the scene feel coherent. Integrated displacement also prevents a wind-speed edit from relocating the entire existing cloud field. Implement one common field/clock, not separate sine-wave wind in each effect. | 🟢 Integrated vector/phase; 🟡 optional turbulence. Evaluate turbulence once per ray/particle subset, not per cloud step. |
| 🧊 Hail / precipitation | CPU particles projected through the scene camera onto Canvas2D. Hail terminal speed 22 m/s, nominal 9 mm diameter, type restitution .6 multiplied by user bounce; up to three bounces. Cloud-linked spawning, wind drift and ground-plane collisions. | ❌ No hail/precipitation renderer. Existing sparks/smoke are separate. | Add camera-relative hail with wind, varied size, bounce and short-lived impacts. Use GPU instancing/depth/cabin clipping rather than copying a screen overlay into a vehicle scene. | 🟡 Simulation, collision and overdraw dominate; bounded particle/impact budgets are essential. |
| ⭐ Stars / Milky Way | Procedural octahedral layers (2–4 by tier), neighbour search, bright-star cores, halos/spikes, temperature colour, air-mass twinkle, noisy Milky Way and dust lanes; sky-luminance contrast visibility; optional 4-sample AA. | ✅ Rebuilt 8,920-star catalogue renderer, pixel-aware cores, compact halos, twinkle; simple artistic galactic band; mostly solar-elevation visibility. | Its richer band, dust, larger bright stars and exposure-aware visibility look more cinematic. Keep real catalogue positions; add dust/noisy galactic structure, sparse bright-star spikes and sky-luminance/extinction gating. | 🟢–🟡 if the band is baked or cheaply sampled; 🔴 if every pixel gets multi-layer noise and 4× star evaluation. |
| 🔆 Lens flare | Four strong art-directed modes, coloured ghosts, halo ring, anamorphic streaks, starburst and veiling glow; evaluated inside the final fragment shader and scaled by sunlight/exposure. | ✅ Native-derived LFRender kernel, cached half-resolution optical image, live sun depth visibility and cabin/glass occlusion. | First improve preset shapes, intensity balance, sun coupling and exposure matching. Do not discard our stronger occlusion integration just to match a brighter picture. | 🟢 Preset tuning; 🟡 texture rebuilds during camera motion. |
| 🌞 Sun | Soft/limb-darkened disc; near-horizon colour/extinction, disc boost and analytic glare; coordinated dawn/sky exposure. | ✅ Disc, atmosphere tint/extinction, twilight/horizon work and independent flare controls. | Match the whole exposure/glare/disc response rather than making the Sun simply brighter. | 🟢 Mostly analytic shading/preset work. |
| 🌍 Atmosphere | Spherical Rayleigh/Mie/ozone approximation; 20 view segments × up to 8 sunlight segments; altitude-aware rays; artistic dawn and earth-shadow dome fill. | ✅ Transmittance + multiple-scattering + sky-view LUTs, dirty-gated updates. | The reference's defaults and coordinated colour response can look better. Our LUT architecture is a better foundation for a heavy vehicle scene; tune it before replacing it with a costly per-pixel nested march. | 🟢 Grading/presets; 🟡 LUT refreshes. Full-resolution nested atmosphere would be 🔴. |
| 🌑 Cloud ground shadows | The audited checker-plane lighting is labelled shadow-less Lambert; its optional surface-darkening factor is not a projected cloud-density shadow. Cloud self-shadowing is a different feature. | ✅ Real density-derived 128² sun-projected ground transmission for global/local clouds, with edge fade and negative-altitude handling. | Our ground-shadow path is ahead in this respect. Retain it; improve *internal* cloud lighting separately. | 🟡 Small field updates plus receiver sampling; no claim of zero cost. |

### Important reference limitations—not reasons to ignore its visual strengths

- The precipitation overlay is camera-projected but does not sample the vehicle's depth or
  cabin transmission. Its collision routine uses the plane, not a full car/terrain scene.
- Flare visibility checks Sun position/front/horizon, not the opaque vehicle/cabin/depth.
- Its local-media loop is shared, but comments calling interaction “free” do not mean zero
  cost: extra density, light and shadow samples still run.
- `cloudRes`, `covMargin`, `atmoN`, `atmoNL` appear in tier declarations, but the audited
  executable path does not consume those properties. Atmosphere loops remain 20×8.
  There is no implemented quarter/half-resolution cloud target corresponding to `cloudRes`.
- The legacy thin-cloud, height-fog and terrain uniforms are explicitly uploaded as disabled
  (`uCloudOn=0`, `uFogOn=0`, `uTerrOn=0`). Do not infer working effects from every inspector card.
  Local volumetric fog, volumetric clouds, local clouds and atmospheric fog are wired separately.

## ② ⏱️ FPS and workload comparison — what is and is not known

| Metric | Celestial demo | Current prototype | What the comparison permits |
|---|---|---|---|
| ❓ Actual desktop FPS on the user's PC | Not measured in this audit. | No controlled current-build desktop measurement. Prior user-reported 27 FPS referred to the retired cloud implementation. | No defensible “demo runs X FPS / ours Y FPS” claim yet. |
| ⚠️ HUD FPS | Initial HTML says 60; Auto targets 45 FPS by default and adjusts tiers. | Live HUD and GPU timestamp metrics exist. | Neither a placeholder nor an Auto target is a benchmark. The reference FPS uses a dt capped at .1 s, so very slow frames can be overstated. |
| 🧩 Rendering workload | Primarily analytic sky/plane/environment in one fullscreen draw, plus a tiny ambient draw/readback, particles and UI/gizmos. | Vehicle/road scene, surface visibility, cascaded/RT shadows, cards/GI/ReSTIR, reconstruction, cabin, optional reflections, smoke, weather and presentation. | Absolute whole-app FPS is not an isolated weather comparison. |
| 🖥️ Resolution | `min(tier.scale, devicePixelRatio) × trim`, clamped .3–3. Auto can trade detail/resolution for FPS. Low scale .6; Standard scale 1. | Low scene scale .6; independent cloud scale defaults .35 per axis. | Fix both internal extents, DPR and quality before benchmarking. At DPR 1, choosing a 3× reference tier does not itself produce a 3× framebuffer. |
| ☁️ Cloud workload | Standard: 28 primary samples, 4 light taps per occupied sample; procedural noise and erosion; runs in the main fragment path. | 12 sky / 16 local samples at default 35% axis cloud resolution; no secondary volumetric light march. | The reference is doing substantially richer shading, not demonstrably doing the same work faster. |
| 🌫️ Local-media workload | Standard cap 28 samples; shared local fog/cloud march; four shadow samples when enabled/needed. | Local clouds only; local fog absent. | Adding matching fog/lighting has a real cost that must be budgeted. |
| 🧊 Precipitation budget | Low 4,000 / Medium 12,000 / High 25,000 CPU particles, further capped by the render tier. | None yet. | These are particle limits, not FPS results. A full CPU/Canvas port is risky in our already busy main thread. |
| 🧪 Earlier cloud-only software measurement | No equivalent test. | At 640×360, 35%-axis clouds: compute 21.63 ms; enabled presentation probe 27.20 ms vs disabled 19.01 ms. Previously recorded approximate increment 29.82 ms; excludes scene, real display work and subsequently added shadow lookup. | Not desktop FPS and not comparable to an unmeasured reference. Retain as regression evidence only. |
| 🧪 Earlier shadow-only software measurement | No equivalent ground-shadow measurement. | Previously recorded 128² field updates about 1.11–1.64 ms after the first update, excluding surface lookup; wind refresh ≤8 Hz unless edits/repositioning force refresh. | Not per-frame desktop GPU cost; no FPS guarantee. |
| 🧪 Star visibility, not performance | No matched measured test. | Previous shader proof: 879 HDR pixels above .2 in a 512×256 hemisphere fixture, peak 7.0117. | Confirms output, not visual parity or hardware FPS. |
| 🎯 Target frame budgets | Unknown actual frame cost. | 60 FPS permits 16.67 ms; 120 FPS permits 8.33 ms **for the entire application**. | If the scene already exceeds 8.33 ms, adding effects cannot make it 120 FPS without other savings/adaptive quality. |

**Recommendation:** define a total weather budget only after measuring baseline headroom.
Never add individual FPS losses together; compare milliseconds and whole-frame percentiles.

## ③ 📏 Resource usage — calculated payloads, not measured total VRAM

Calculations use a **1920×1080 internal scene**, DPR 1 where relevant, not CSS window size.
Driver alignment, swapchain multiplicity, browser backing copies, transient allocations and
all unrelated vehicle/GI resources are excluded. “Reference” means the published source.

| Resource | Reference | Current / recommended prototype |
|---|---|---|
| ☁️ Cloud density storage | Procedural shader noise: no dedicated density texture; higher ALU work. | Current 64³ R8 baked FBM = **256 KiB**. Add a small reusable erosion field only if profiling warrants it. |
| ☁️ Cloud optical/depth targets | No separately implemented cloud-resolution targets found. | Two RGBA16F targets at 672×378 = **3.876 MiB**. |
| 🌑 Ground-shadow field | No equivalent cloud-projected ground field found. | 128² RGBA16F = **128 KiB**. Current cloud targets + noise + shadows total **4.251 MiB** at this internal scene size. |
| 🌫️ Proposed local fog | Procedural density inside the main fragment shader; no separate fog target. | Reuse our bounded media optical/depth targets where possible. A dedicated separate pair would duplicate the 3.876 MiB cost; avoid it initially. Small per-volume parameters/light lists still cost storage and integration work. |
| ⭐ Stars | Procedural layers/noise, no star catalogue texture. | Recalculated in this audit: 8,920 records expanded to 24,988 binned entries; 1024×50 RGBA32F texture = **800 KiB**. JS records add CPU heap overhead, not included here. |
| 🌙 Moon textures | All six 2K textures preloaded with mipmaps. For 2048×1024 images: nominal RGB+mips payload ≈**48 MiB**; RGBA-backed storage ≈**64 MiB**. Actual driver storage not measured. | All six bodies packed in a 2048×1024×6 RGBA8 atlas = **48 MiB**, without mips. Can load active bodies lazily later; preserve Earth Moon quality. |
| 🔆 Flare | Analytic work in the main fullscreen shader; no separate optical image. | Current 960×540 RGBA16F optical image = **3.955 MiB**; full-resolution RGBA8 cabin transmission = **7.910 MiB**, shared with cloud/cabin visibility; small visibility texture excluded. |
| 🧊 Hail | 4k/12k/25k JS particle objects; heap not measured. Canvas2D colour surface alone: **7.91 MiB at DPR 1**, **31.64 MiB at DPR 2**, before backing copies. | 🎯 Start with 4,096 instanced particles. A proposed 32–48-byte record is **128–192 KiB**, or **256–384 KiB** if double-buffered; draw geometry/impacts add more. These are design estimates, not implemented usage. |
| 🌬️ Wind | Shared displacement, phase, controls and 120-sample CPU trace; procedural turbulence work. | 🎯 A compact shared uniform record plus CPU-integrated phase/displacement; no full-screen wind texture needed initially. Exact size depends on implementation. |
| 🌍 Atmosphere | Main framebuffer plus 4×1 ambient target, nominal float payload 64 bytes; per-frame synchronous readback can stall despite tiny byte count. | Three RGBA16F LUTs (256×64, 32×32, 192×108) total **298 KiB**. Dirty-gated integration; no equivalent per-frame ambient readback required. |

The largest avoidable allocations are not necessarily the new weather controls: eager
six-body lunar storage and the full-resolution cabin/transmission image are already larger
than the cloud-noise texture. Do not confuse downloaded JPEG bytes with decoded GPU memory.

## ④ 🎯 Recommended implementation order

| Order | Deliverable | Retain / change | Performance protection | Acceptance requirement |
|---|---|---|---|---|
| 1 🌬️ | Shared wind field and weather clock | Retain existing follow controls; integrate displacement rather than recomputing speed×time; add gust/shear/veer and explicit bearing convention. | One common CPU update/uniform record; optional turbulence outside dense sample loops. | Editing speed/bearing does not pop the entire field; all enabled media agree on gust timing and direction. |
| 2 🌫️ | Genuine local volumetric fog | Add one placeable box/ellipsoid first; albedo, extinction, absorption, noise, falloff and anisotropy. Share optical integration with local clouds. | Bound rays analytically, clip to scene depth, skip empty intervals; initially sample Sun/Moon and a small selected light list. | Headlights and a spotlight visibly scatter inside the fog; opaque cabin stays opaque; overlap is order-correct; disabled cost is skipped. |
| 3 🧊 | Wind-linked hail | Add instanced ice particles, terminal speed/drag, capped bounce and short-lived impacts. | Camera-relative budget, coarse collision proxies/height queries, depth/cabin clipping; no Jolt rigid body per hailstone. | No hail through roof/dashboard; visible ground bounce; counts/memory bounded; zero spawn work when disabled. |
| 4 ☁️ | Better cloud material and self-lighting | Preserve the independently rewritten renderer and useful ground shadows. Add erosion, real formation profiles, dual-lobe phase and bounded light taps/approximate multiple scatter. | Introduce features separately; start with 2 sunlight taps at cloud resolution, optional higher quality; no return to the rejected 3D-cache/history pipeline by default. | Clearly shaded cloud body and silver edges at matched coverage/exposure; no opacity pulse or shadow discontinuity; quality ladder measured. |
| 5 🔆⭐🌞 | Optical/art-direction parity | Reference-inspired flare presets while retaining cabin/depth occlusion; richer galactic dust/glow and atmosphere-based visibility; matched Sun/sky/exposure presets. Keep user-requested Luna 25° and independent moonlight power. | Prefer LUT/preset/baked-band changes, sparse bright-star effects and existing optical-image path. Rebuild flares only when required. | Matched daytime, sunset, clear-night, cloudy and cockpit comparisons; no bright flare through opaque cabin; stars readable without turning the sky into white noise. |

This order gives shared motion first, then the two missing effects, then the most expensive
quality upgrade. It does **not** mean blindly copying the HTML or reverting the independent
cloud rewrite. The demo's visual formulas must be adapted to our depth, coordinate, exposure,
lighting and cabin architecture. UI appearance alone is not integration.

## ⑤ 🔬 FPS/resource validation before claiming parity

| Test | Required method | Reported result |
|---|---|---|
| Matched environment-only views | Same PC/browser, actual adapter, fixed internal extent/DPR/FOV, exposure, Sun elevation and camera; Auto quality off; same enabled media. | Screenshots plus actual dimensions/quality—not just two HUD FPS numbers. |
| Vehicle-scene baseline | Profile our real scene with weather disabled, then one effect at a time and all effects together. | CPU time, GPU stage time, whole-frame median/p95/p99 and 1% low; no summing FPS losses. |
| Warm-up / stability | Warm shaders/assets, then use an unclamped wall clock over a fixed collection interval; repeat. | Separate compile/texture-load spikes from steady frame cost; identify thermal/vsync caps. |
| Resource accounting | GPU texture/record inventory plus browser/driver profiling where available. | GPU payload vs actual reported VRAM, JS heap, particle counts and transient peak distinguished. |
| 60 / 120 FPS | Check 16.67 / 8.33 ms whole-frame budgets and remaining headroom on the actual desktop GPU. | If a preset misses budget, reduce media resolution/light taps/particle count or mark it unsupported at that target. |
| Regression safety | Cabin, glass, negative altitude, overlapping fog/clouds, wind edits, new/full Moon, cloud-shadow edges, disabled effects. | Visual proof and numerical tests; preserve existing non-weather work. |

### 📚 Source links

- [Published demo](https://sultanaladin.github.io/Frontier-/celestial/)
- [Exact deployed HTML/GLSL](https://github.com/SultanAladin/Frontier-/blob/da3720b353dc0e4d2421f064f65cbfeb41cdb5f2/docs/celestial/index.html)
- [Reference CLAUDE.md](https://github.com/SultanAladin/Frontier-/blob/da3720b353dc0e4d2421f064f65cbfeb41cdb5f2/CLAUDE.md)
- Reference line ranges: stars **802–844**; atmosphere **845–865**; wind **867–877**;
  local fog **960–983**; cloud/local-media material **993–1083**; flare **1113–1130**;
  quality ladder **3189–3202**; precipitation **3461–3526**; uploads/readback/render **3613–3653**.
- Current implementation: `Experimental/VehicleHmiPrototype/Source/{CloudSequence,CloudShadow,CloudSettings,StarCatalogue,AtmosphereIntegrator,DisplayProjection}.js`;
  `Shader/{CloudTrace,CloudField,CloudShadowProject,NightStars,FogMedium,FlareImage,DisplayPresent}.wgsl`.
- Earlier measured limitations and tests: [cloud report](../Experimental/VehicleHmiPrototype/CLOUDS_PORT.md),
  [environment report](../Experimental/VehicleHmiPrototype/ENVIRONMENT_PORT.md).

**Bottom line:** add the missing local fog and hail, unify motion, and improve cloud
illumination/art direction. Keep our existing depth/cabin integration, low-resolution cloud
architecture, measured controls and LUT-based atmosphere. Actual performance parity remains
unproven until the matched desktop measurements above are run.
