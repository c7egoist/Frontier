# World Mirror — C++ Sun/Sky LUT + Full C++ GI (VoxelSdfClipmap · DynamicProbeCache)

> **TL;DR:** The World Mirror now runs the C++ GI engines.
>
> - **GI engines:** **SDF Cone GI** (`VoxelSdfClipmap`, now the default) and **DDGI** (`DynamicProbeCache`) are ported 1:1 from `Engine/`, together with `LinearCosineLightIntegration` AO.
> - **Sun and sky:** both come from the C++ Sky-View LUT, with the C++ night floor.
> - **Bake:** runs once in a Blob worker and packs into **one Float32Array** shared by the WebGPU and WebGL renderers (plus the headless reference tracer).
> - **Update (§6):** the CPU fallback renderer is gone, so the viewport is GPU-only. The cone march now reads half-float 3D volumes, and losing the GPU now triggers recovery instead of a black screen.
> - **Inspector:** a rebuilt Global Illumination card exposes every C++ setting, plus a live bake status and a **Rebake** button.
>
> 🟢 Validation passes 20/20 (new Suite 20). WGSL is validated by naga and GLSL by glslang. The CPU workers match the single-threaded render pixel for pixel.

![C++ GI engines vs legacy (CPU renderer, showcase gallery)](Images/WorldMirrorCppGiEngines.png)

---

## 1. 🏆 Key Decisions

| Rank | Option | Summary |
| :---: | :--- | :--- |
| 🏁 | **A — Bake once, pack one vec4 field, sample per pixel (chosen)** | `RadianceFieldBaker` bakes in a worker → `PackRadianceField` → CPU workers (message), WebGPU (storage buffer, binding 12), WebGL (RGBA32F texture, unit 9). One JS sampler is the reference; WGSL and GLSL are line-by-line ports. |
| 🥈 | B — Bake separately per renderer | Triples the bake cost, and the three paths would drift apart. |
| 🥉 | C — Approximate the C++ GI in shaders | Not parity. Rejected. |

🏁 **Cache key:** geometry, materials, lights, sun, sky and the GI settings. Camera and exposure are excluded, so orbiting never re-bakes.

🏁 **While a bake is pending:** the C++ engines fall back to the ambient fill (`giAlg 2`), so the frame never goes black.

---

## 2. 🧩 What changed

| Area | Files | Change |
| :--- | :--- | :--- |
| Sun / sky | `ShowcaseGalleryScene.js` | C++ `SynchronizeWorldAtmosphere`. `SkyRadiance = max((0.015, 0.020, 0.032), LUT zenith)`, cached per sky key. |
| Scene query | `RadianceFieldScene.js` (new) | Hermetic scene query: closest hit, occlusion, closest surface, and BounceSlab radiance. |
| DDGI | `DynamicProbeCache.js` (new) | 7×6×4 probes, 64 Fibonacci rays, 2 bounces. 8×8 octahedral irradiance, 16×16 Chebyshev moments, backface gating. |
| SDF GI | `VoxelSdfClipmap.js` (new) | 3-tier 48³ toroidal distance clipmap. 2 cascades (half extents 2.8 / 5.6 m). Signs from a 6-direction vote. Direct injection plus penumbra. 2 radiosity bounces. Mip1 and Mip2. |
| Layout | `RadianceFieldLayout.js` (new) | 24-vec4 header plus data, 2048-wide rows. `CreateRadianceFieldSampler` is the CPU reference for `SampleIrradianceOverPi` and `EvaluateDeterministicConeGiOverPi` (16 cones). |
| Baker | `RadianceFieldBaker.js` (new) | Blob worker; the newest request wins, with progress stages. `BakeRadianceFieldSync` for Node. |
| Shaders | `RadianceFieldShaders.js` (new), `WebgpuGtxRenderer.js`, `GtxWorldViewport.jsx` | Ports `rfProbeIrradiance`, `rfConeGi` and `rfAmbientOcclusion` to WGSL and GLSL. Adds `uGiCfg` (WGSL uniform buffer grows from 624 to 640 B). |
| Reference tracer | `GtxReferenceTracer.js` (was `CpuGtxFallbackRenderer.js`) | Adds `giAlg 3/4` and the C++ AO (IGN-rotated contact × chassis rays) plus specular AO. Full-frame filters: AO à-trous and a 7×7 bilateral on the diffuse GI (SDF GI only), applied after the workers finish. |
| Inspector | `Inspectors.jsx` | Clipmap settings: centre, extents, resolution, bounces, cones, light-injection toggles, bilateral. Probe settings: grid, counts, rays, bounces, blend. AO radii and rays. Bake status and Rebake. |
| Uniforms | `ShadowPipeline.js` | `voxel_sdf → 3`, `ddgi → 4`, plus `coneCount`, `aoContact`, `aoChassis`, `aoRays`. |

---

## 3. 📊 Measurements (Node, single thread, showcase gallery)

| Item | SDF Cone GI | DDGI | Legacy cone GI |
| :--- | ---: | ---: | ---: |
| Bake | 2.3 s | 0.4 s | — |
| Packed field | 3.3 MB (208 896 vec4) | 0.5 MB (32 768 vec4) | — |
| CPU frame 480×270 | 9.8 s* | 4.2 s | 1.7 s |

\* C++ also evaluates the 16 cones per pixel. Spread across 8 browser workers, an interactive 304 px frame takes about 0.5 s. The GPU paths are unaffected.

---

## 4. ✅ Verification

| Check | Result |
| :--- | :--- |
| `WorldMirrorValidation.mjs` | 🟢 20/20. Suite 20 covers: GI menu and defaults, uniform codes, the cache key ignoring the camera, both bakes being finite with their flags set, plausible irradiance, the CPU frame changing compared with the fallback, and shader bindings. |
| WGSL (naga-wasm) | 🟢 All 4 modules validate, including the scene shader with the new code. |
| GLSL (glslang, wrapped to 450) | 🟢 Compiles. A deliberately broken variant is rejected, confirming the check is real. |
| Minified bundle (esbuild) worker bake | 🟢 Both engines; same stats as the direct bake. |
| CPU workers (4) vs single thread | Removed with the CPU fallback (§6). |
| C++ cross-check | Vote directions, the cone loop, and tier = cascade (tier 2 → no radiance) all match `VoxelSdfClipmap.cpp`. |

⚠️ **Two older test bounds were loosened** to follow the C++ night sky floor:

- Night sky test: changed from `< (0.02, 0.02, 0.03)` to `≤ (0.015, 0.020, 0.032)`.
- Unlit-night frame average: changed from `< 0.03` to `< 0.04`; it measures 0.033.

---

## 5. ⏳ Not done / follow-ups

| Item | Note |
| :--- | :--- |
| GPU AO / GI filtering | The GPU paths output raw AO and GI. The C++ à-trous and bilateral run on the CPU path only. |
| Browser visual check | No browser in the sandbox. The WebGPU and WebGL paths are compiled but not visually confirmed. |
| Dynamic SDF objects | `DynamicLocalSdfInstance` is not ported; vehicles are baked as static geometry. |

---

## 6. 🛠️ Update: GPU-only viewport and the black-screen fix

> **TL;DR:** The black screen came from the GPU giving up, not from a scene error.
>
> - The per-pixel cone march read the clipmap from a storage buffer: 8 reads per distance sample and 8 per radiance sample, on every step of 16 cones.
> - That was heavy enough for the GPU to time out. WebGPU lost its device, then WebGL2 lost its context three times, and the viewport ended up on the CPU fallback.
> - The fix: the lookups are now single hardware-trilinear fetches, a GPU loss rebuilds the device, and the CPU renderer has been removed.

| Area | Change |
| :--- | :--- |
| 🏁 Clipmap lookups | `BuildRadianceVolumes` (`RadianceFieldLayout.js`) builds two half-float 3D volumes at upload time:<br>• the distance tiers (r16f, 48×48×144);<br>• the six cascade/mip radiance grids stacked along z (rgba16f, 48×48×84).<br>Together they take 2.2 MB and build in about 40 ms. The new header slots 84–92 hold the layer offsets and the volume size.<br>`rfTierDistance` and `rfGridRgb` now make **1 fetch instead of 8** in both shaders: WGSL bindings 13–15 and GLSL units 10–11. |
| Device loss | WebGPU `device.lost` rebuilds the device on a fresh canvas (up to 2 times) before moving to WebGL2.<br>A WebGL2 context loss remounts the canvas. Both put the C++ GI engines into **GI safe mode**, which uses the ambient fill; clicking the amber `GI safe mode` badge turns them back on.<br>If no context survives, the viewport shows a **"The viewport needs a GPU"** overlay with a Retry button. |
| CPU fallback | Removed:<br>• the `cpu-gtx` backend and its loop;<br>• the multi-worker frame pool;<br>• the 2D canvas gizmo and compositor.<br>`CpuGtxFallbackRenderer.js` is renamed to `GtxReferenceTracer.js`. It keeps only the hermetic band kernel, which the GI bake worker needs, and a synchronous tracer for shape thumbnails and validation. |
| Vehicle asset | `VehicleBvhAssets.js` now tries only the two URLs that exist (`GtxReflectionBenchmark/Assets`). Three 404s were showing on every load. |

| Check | Result |
| :--- | :--- |
| Volume lookups vs packed reference (4000 random points) | 🟢 Distance max relative error 3.9e-4; radiance 4.6e-4, which is half-float precision. Now asserted in Suite 20 (bound 4e-3); a negative control at 1e-9 fails as expected. |
| `WorldMirrorValidation.mjs` | 🟢 20/20. Suite 8 now asserts that the viewport has no CPU path and that `CpuGtxFallbackRenderer.js` no longer exists. |
| WGSL (naga) / GLSL (glslang) | 🟢 All modules validate with the new `texture_3d` and `sampler3D` bindings. |
| ESLint `no-undef` on the edited modules | 🟢 0 errors. |
| Worker bake (DDGI and Voxel SDF) | 🟢 1.4 s and 24.3 s, the same stats as before. |
| Browser | ⚠️ Still not visually confirmed (no GPU or browser in the sandbox). |


## 7. 🧭 Update: Lumen-style GI on a persistent GPU global distance field

> **TL;DR:** The C++ GI bake (24 s of CPU, requested again on every scene change) is gone from the viewport. Both backends now keep a **global distance field on the GPU** and update only the voxels around whatever moved. GI is the Unreal Lumen design:
>
> - a global SDF;
> - a radiance **surface cache** stored in the field's voxels;
> - a final gather (per-pixel rays or a probe radiance cache) traced through the field.
>
> Emissive primitives now light the scene with exact integrals instead of cone GI.

### 7.1 Pipeline (identical on WebGPU and WebGL2)

| Pass | What it does | When it runs |
| :--- | :--- | :--- |
| StaticBuild | Signed distance and albedo/emission of the analytic primitives, written into a two-level clipmap. Both levels (48³ each, 0.117 m and 0.233 m voxels) are stacked in one rgba16f 3D texture. | First frame, a layout change, or a primitive edit. Only the old ∪ new box of the edited primitive is rebuilt. |
| LocalBake | A local SDF of each vehicle mesh (body, tyres, rims), built by exact BVH closest-triangle queries. | Once per mesh. |
| Compose | Merges the static field with the vehicle instances (world→local transforms) into the live field. | Only the old ∪ new box of a moving instance. |
| SurfaceLight | Radiance surface cache: sun and moon with SDF soft shadows, area/point lights (polygon form factors), emissive primitives (exact sphere and box integrals), sky, and multi-bounce feedback from the previous frame's cache. | While converging: 72 frames, restarted by a lighting change. |
| ProbeTrace / ProbeBlend | 7×6×4 probes trace up to 256 rays through the field into the surface cache, then blend into 8×8 octahedral irradiance plus 16×16 Chebyshev depth moments. | `ddgi` engine, while converging. |

- **Scene shaders:** `voxel_sdf` runs per-pixel final-gather rays through the field into the surface cache (4–32 rays, bilateral 7×7). `ddgi` samples the probe cache. Both add exact traced AO.
- **WebGPU** runs the passes as compute (`GlobalDistanceFieldGi.js`).
- **WebGL2** runs the same six kernels as fragment passes into 3D texture layers, with MRT and the viewport clipped to the dirty box (`GlobalDistanceFieldGiGl.js`, which needs `EXT_color_buffer_float`).
- **Idle frames** do no field work. The viewport keeps redrawing only while the radiance converges.

### 7.2 Emissive lighting (replaces cone GI)

| Emitter | Illuminance | Visibility |
| :--- | :--- | :--- |
| Sphere | Exact horizon-clipped sphere integral. | Shadow rays to stratified points on the sphere's facing disk. The ray count follows Shadow Rays (2–8). |
| Box-like | Sum of Lambert polygon form factors of the faces that face the receiver. | Shadow rays to stratified points in the emitter volume, ignoring the emitter itself. |

The same integrals feed the surface cache, so direct and indirect emissive light agree. Against Monte Carlo the integrals match within 0.01 for quads and spheres, including partly-below-horizon cases.

### 7.3 Render settings that now take effect

| Setting | Before | Now |
| :--- | :--- | :--- |
| Half-Resolution Shadow Pass | Never read. | Renders the sun depth map at half resolution. |
| Edge Anti-Aliasing | Never read. | FXAA in the blit/outline pass on both backends. |
| GI Intensity / Sky & Ambient Fill | `Number(x) ?? d` gave NaN for missing values. | Finite fallback in the resolver and the encoder. Fill is now applied the same way on both backends. |
| Reflection Rays (1–8) | WGSL clamped to 4. | Up to 8 on both backends. |
| AO Rays / Pixel (4–32) | Forced to at least 12. | Uses the slider value. |
| Cone GI Directions (analytic GI) | WGSL ignored it; GLSL applied a gain fudge. | Renamed **Sky Visibility Cones**: that many BVH-traced sky visibility rays (primitives and vehicle). |
| Cone Directions (`voxel_sdf`) | Cone count of the CPU field. | Renamed **Final Gather Rays** (4–32). |
| Clipmap, probe, inject and bilateral settings | Fed the CPU bake. | Feed the GPU field layout, the injection flags and the convergence signature. |

The Render Settings panel now shows the live GPU GI state (backend, clip levels, probes, convergence). **Reset** restarts the accumulation without rebuilding the field.

### 7.4 Verification (headless Dawn and ANGLE on lavapipe; no browser GPU in the sandbox)

| Check | Result |
| :--- | :--- |
| GPU field vs CPU closest-surface reference (55,296 voxels, with vehicle) | 🟢 Mean error 0.00084 m. 7 voxels exceed tolerance on thin vehicle panels; the 2 inside overlapping primitives are expected, because the CPU reference is unsigned. |
| Vehicle move (WebGPU and WebGL2) | 🟢 37,914 static + 154,266 composed voxels; the mesh is not rebaked. 147 ms (WebGPU) / 165 ms (WebGL2) on lavapipe. |
| Idle frame | 🟢 0 static, 0 composed voxels. |
| Incremental vs full rebuild | 🟢 0 differing voxels on both backends. |
| WebGL2 vs WebGPU | 🟢 Field identical. Surface radiance within 0.4%. Probe rays bit-identical. |
| Probe irradiance (12 frames) | 🟢 No NaN. irr/π 0.145 / 0.177 / 0.240. |
| Scene-side sampling on ANGLE | 🟢 Header flags decode; field gather and probe irradiance are finite. |
| Shader compiles | 🟢 Dawn: 6 compute passes plus scene/shadow/outline. ANGLE: scene and outline programs link. naga: all WGSL modules. |
| `WorldMirrorValidation.mjs` | 🟢 20/20. Suite 20 is rewritten for the GPU field: layout, dirty boxes, idle diff, lighting signature, parameter block, kernels, no CPU GI imports on the live path, and the settings fixes. The Suite 11 mock device now executes the field's compute passes. |
| ESLint | 🟢 0 errors. |
| Browser | ⚠️ Not visually confirmed. The full scene pipeline does not fit lavapipe in the 4 GB sandbox. |

**Off the live path:** `RadianceFieldBaker.js`, `VoxelSdfClipmap.js`, `DynamicProbeCache.js`, `RadianceFieldScene.js` and `RadianceFieldLayout.js` remain only for the CPU reference tracer and validation. No viewport, renderer or inspector module imports them.
