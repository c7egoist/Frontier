# Native sky and local clouds — pre-port audit

## Decision

**The native implementation is a useful functional reference, but it is not demonstrated to be optimal or fastest. Do not port its full-resolution GPU march unchanged for an FPS-sensitive 120 Hz target.** Preserve the native controls, profiles, density semantics and wind behavior; decide separately whether to optimize the rendering architecture.

This is a source audit, not a cloud implementation or a hardware benchmark. No cloud rendering code was added to the prototype. The existing environment work was left intact.

## Source reviewed

Upstream `SultanAladin/Frontier-`, main commit `28ec0657a23ed6bbf680f17cc06b464a53639dae` inspected in this session:

- [WeatherMedia.slang](https://github.com/SultanAladin/Frontier-/blob/28ec0657a23ed6bbf680f17cc06b464a53639dae/Engine/Shaders/WeatherMedia.slang): active GPU visible media.
- [CloudShadow.slang](https://github.com/SultanAladin/Frontier-/blob/28ec0657a23ed6bbf680f17cc06b464a53639dae/Engine/Shaders/CloudShadow.slang): density/noise helpers and separate ground-shadow field.
- [VolumetricMedia.h](https://github.com/SultanAladin/Frontier-/blob/28ec0657a23ed6bbf680f17cc06b464a53639dae/Engine/DisplayPresentation/VolumetricMedia.h): CPU reference, settings and budgets.
- [ReSTIRViewport.slang](https://github.com/SultanAladin/Frontier-/blob/28ec0657a23ed6bbf680f17cc06b464a53639dae/Engine/Shaders/ReSTIRViewport.slang): view-ray composition/history and shadow query call sites.
- `CloudsInspectorPanel.cpp`, `CloudDensityPreview.h`, `CloudShadowStaging.h`, `CelestialSequence.cpp`.
- Upstream `Docs/CloudFogViewportAudit.md` and `Docs/CloudFogViewportRepair.md`: historical missing wiring and subsequent GPU repair. Their older missing-wiring finding must not be mistaken for current behavior.

Downloaded inspection copies are outside the repository in `/home/user/cloud-audit/`. The upstream documentation's compilation/CPU checks are not newly executed GPU performance evidence.

## What the native implementation actually does

### Sky clouds

An altitude-clamped horizontal slab, with six vertical profiles: Stratus, Stratocumulus, Cumulus, Cumulonimbus, Altostratus and Cirrus. The cloud field uses three rotated value-noise shape octaves plus a fourth erosion octave. Integer hashing and quintic interpolation avoid the previous sine-hash precision and lattice problems. Wind can both move and evolve the field.

This is a genuine view-ray participating-medium march, not a flat sky image. It handles camera rays inside/intersecting the layer and clips against opaque surface distance. It is nevertheless a flat Z-up slab, not a planet-curved global weather shell.

### Local clouds

A world-positioned finite volume. An AABB bounds ray work, but actual density fades radially in normalized coordinates: its support is **ellipsoidal inside that box**, not a solid rectangular fog box. Two rotated noise octaves provide the shape, with coverage, density, scale, tint, anisotropy and wind controls. One local-cloud slot plus one local-fog slot accompany the global layer in this shader; it is not a scalable arbitrary-volume-list renderer.

### Lighting and integration

Occupied ray segments are integrated front to back. At a nonempty view sample, another march estimates sunlight transmittance through global cloud, local cloud and local fog. Henyey–Greenstein phase functions and ambient illumination supply scattering. Overlapping media share extinction and a density-weighted source.

The GPU view distance is capped at 100 km; a segment has at most 512 samples. Quality steps and shadow taps are bounded. Default CPU budget values are 28 cloud steps, 28 local steps and 6 light taps, but **28 is not a fixed per-ray sample count**: global spacing is 4,000 m / quality steps, and the global cap is four times that quality value. Path length and overlap determine actual work.

## Existing optimizations worth keeping

1. Slab/AABB intersection and surface-depth clipping avoid marching irrelevant ray lengths.
2. Entry/exit sorting skips empty gaps between disjoint volumes and integrates overlap correctly.
3. Low density skips shadow/scattering evaluation.
4. View transmission below 0.005 terminates marching; shadow optical depth above 4 terminates shadow work.
5. Disabled media have cheap early returns; local density rejects points outside its radial support before noise evaluation.
6. Bounded sample budgets prevent runaway distant work.
7. Integer hashes, rotated octaves and jitter address quality problems without simply increasing step count.
8. Inspector density previews are key-cached at 192×96; they are static density diagnostics, not per-frame lit cloud renders.

These are sensible baseline optimizations. They do not make the full rendering method cost-optimal.

## Main performance and quality concerns

### 1. Full-resolution view march × nested shadow march

Every relevant screen pixel performs its own volume integration. Each occupied view sample may perform six shadow taps at the reference budget. Global density evaluation runs four noise octaves, each with eight corner hashes.

An **illustrative** 28 occupied global view samples with six non-terminating global shadow samples each imply approximately `28 × (1 + 6) × 4 × 8 = 6,272` corner-hash evaluations per ray, before interpolation, drift/evolution, phase and other math. This is an operation-count illustration, not a measured GPU instruction count or frame time. Actual density skips, ray lengths and early-outs change it substantially.

Grazing/horizon rays and cameras inside clouds can be particularly expensive. This architecture can easily create view-dependent fluctuations; acceptable FPS cannot be inferred from CPU proofs or shader compilation.

### 2. Repeated analytic noise and lighting work

The inspected path has no precomputed 3D noise texture, occupancy hierarchy for holes *inside* the slab, or cached cloud self-shadow lighting volume. Slab/box skipping only rejects large geometric gaps. Phase terms invariant along a ray, wind setup and medium parameters also offer opportunities for hoisting/specialization.

A 3D noise lookup is not automatically faster on every GPU: texture bandwidth, cache behavior and desired native-field fidelity must be measured. It is a candidate, not an unconditional replacement.

### 3. No dedicated temporal cloud reconstruction in this path

`ReSTIRViewport.slang` stores clean lighting history **before** calling `ApplyWeather`. This avoids smearing old clouds into surface-lighting history, which is good. However, that history does not accumulate the subsequently added cloud scattering. The cloud march uses frame-varying jitter, then passes into the later image filtering path; there is no dedicated reprojected cloud radiance/transmittance/depth history in the inspected code.

Therefore, do not assume the lighting accumulator makes low-sample clouds converge. A dedicated cloud reconstruction path would need wind-aware reprojection, camera-cut/disocclusion rejection and settings/bounds invalidation. Local-cloud silhouettes and entering a cloud require particular care.

### 4. Ground shadows are a different staged field

The separately staged `CloudShadowTransmittance` is queried at surface/direct-light evaluation sites, including p-hat calculations. It uses eight density taps. It is not a shared sunlight-transmittance map, and it is not automatically synchronized with the visible layer's live evolution/settings. The visible-medium self-shadow march does use live density.

This means the renderer can pay considerable shadow work while still allowing visible-cloud/ground-shadow mismatches. A synchronized cached sunlight-transmittance map is worth evaluating, with explicit update cadence and wind handling.

### 5. Quality and scope are bounded

The renderer is single-scattering-style direct/ambient integration, not full cloud multiple scattering. Local ray bounds are looser than their ellipsoidal density support. The GPU interval/sample caps can undersample long spans. Clouds do not provide complete secondary/refraction/GI transport in this repair. Native source parity should not be described as physically complete cloud rendering.

The upstream repair also notes that activating weather with GI off selects a compute/direct-shadow fallback instead of the map-only route; that can introduce a cost unrelated to the march alone in the native application. It does not automatically apply to this browser prototype's architecture.

## Recommended approach if approved

**Keep the native UI and cloud field; optimize the camera-ray rendering path first.**

1. Separate cloud radiance/transmittance from clean opaque lighting; preserve surface-depth clipping and correct sky/local overlap.
2. Start with half width and half height for sky-cloud tracing: roughly one quarter as many cloud rays before reconstruction overhead, **not a promised 4× total-frame speedup**.
3. Use depth-aware upsampling and dedicated cloud temporal reconstruction. Keep a full-resolution reference mode for comparison and disocclusion/near-volume validation.
4. Treat local clouds more carefully: tight bounds, projected screen bounds, and conservative depth handling; near/inside-cloud cases may need higher resolution or extra samples rather than simply inheriting distant-sky settings.
5. Hoist ray-invariant lighting terms, specialize disabled media, and preserve opacity early-outs.
6. Evaluate a synchronized sun-transmittance cache to replace repeated shadow marches where quality permits. Benchmark procedural noise versus a precomputed texture representation rather than assuming a winner.
7. Add independent GPU timing for cloud view tracing, light/shadow work, reconstruction and any field/cache update. Compare each against clouds disabled.

Cheapest alternatives such as sky textures or billboards do not preserve the requested local fly-through volumes and native appearance, so they are not equivalent replacements.

## Measurements required before calling it fast

Use identical camera, resolution, quality, sun/wind and hardware. Measure disabled baseline, global only, local only and overlap. Include clear patches, dense coverage, horizon/grazing views, camera inside local cloud, motion/disocclusion and weather edits. Report median and slow-frame GPU times, not just an instantaneous FPS counter. Test 1080p and the user's actual display resolution; compare image quality against the full-resolution reference.

At 120 FPS the entire frame budget is 8.33 ms. No cloud millisecond budget or preserved FPS is established by this audit. **Verdict: good reference model and native UI; partially optimized renderer; not the demonstrated best/fastest method. Await the user's choice before implementation.**
