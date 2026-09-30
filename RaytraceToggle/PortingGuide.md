# Porting guide — Raytracing toggle, Surfel GI path, reflection modes

Target: `SultanAladin/Frontier-@main`. Apply `Patches/RaytraceToggle_Integration.patch`, drop the two
shaders into `Engine/Shaders/`, add them to the build table, then do the host-side surfel wiring below.

---

## 1. Control Centre — the tiles (done in the patch)

`Engine/DisplayPresentation/ControlCentreHost.h`
- `enum QuickTileCategory`: add `Raytracing = 7`, bump `Count = 8` (fills the last cell of the 4×2 grid).
- New `enum class ReflectionModeCategory : uint32_t { Off, Sky, Raytraced, Count }` + `NextReflectionMode()`.
- `ControlCentreSettings`: add `bool Raytracing = true;` and
  `ReflectionModeCategory ReflectionMode = Raytraced;`. `ReflectionBounces` stays as the *raytraced depth*
  used only when the mode is Raytraced.

`Engine/DisplayPresentation/ControlCentreHost.cpp`
- `TileTable`: append the `Raytracing` tile (toggle; reuses the `SparklesAntiAliasing` glyph — give it a
  dedicated icon later via `IconSymbols.inc` + baked art if you want).
- `IsTileActive`: `Raytracing → Settings.Raytracing`; `Reflections → ReflectionMode != Off`.
- `ToggleTile`: `Raytracing` toggles the bool; `Reflections` now cycles the mode (`NextReflectionMode`).
- Dashboard + Render-page labels show `Off / Sky / Raytraced`.

## 2. The decision matrix + logs (done in the patch)

`Projects/Project-Zero/Source/GameExecution.cpp`, inside `ApplyControlCentreSettings`, before the existing
GI/reflection assigns:

```
GiActive = GlobalIllumination && GiBounces>0
RtActive = Raytracing
if RtActive && !GiActive && ReflectionMode==Off:  RtActive = false          // the guard → plain raster
EffReflMode = ReflectionMode
if !RtActive && EffReflMode==Raytraced:            EffReflMode = Sky          // no RT budget → sky reflection
RenderPath = RtActive ? 0(raytraced) : GiActive ? 1(surfel) : 2(plain raster)
Integrator.AssignRenderPath(RenderPath)
Integrator.AssignReflectionMode(EffReflMode)
Integrator.AssignMaxReflectionBounces(EffReflMode==Raytraced ? ReflectionBounces : 0)
```

Two `Logger.RecordMessage` lines are emitted every time settings change: a **`RenderPath`** line (path +
reflection mode + whether the guard/degrade fired) and, on the surfel path, a **`SurfelGI`** line (field
config, the two passes, tier budget, anti-flicker note) — the requested surfel-GI logs.

`Engine/DisplayPresentation/ReSTIRIntegrator.h`: config gains `ReflectionMode` and `RenderPath` (uint) with
`AssignReflectionMode` / `AssignRenderPath`.

## 3. Feature-bit map (done in the patch, shader side)

`Engine/Shaders/ReSTIRViewport.slang` FeatureFlags (uint):

| bits | meaning |
|---|---|
| 0–10 | existing (GI, AA, temporal/spatial reuse, denoise, sky reservoir …) |
| **11** | `kFeatureRaytracing` — mirrors `RenderPath==0`; the kernel early-outs if it isn't the active path |
| 12–14 | denoise-guide field (separate delivery `../FlakeVerification/Denoise/`) |
| **15–16** | `kReflectionMode` (0 Off / 1 Sky / 2 Raytraced), via `kReflectionModeShift=15`, `kReflectionModeMask=3` |

In `ReSTIRIntegrator.cpp` `BuildDispatch`, OR these bits into the pushed `FeatureFlags`
(`Raytracing`→bit 11; `ReflectionMode`→`<<15`). Then in the kernel's reflection code honour the mode:
`Sky` = sample the sky dome along the reflection vector and skip the scene reflection ray; `Raytraced` =
the existing path. (The surfel/plain paths get the mode through `SurfelGIResolve`'s own push constant,
`Counts.w`, so they never touch FeatureFlags.)

## 4. GPU surfel passes (shaders done; host wiring is the remaining work)

Dispatch order per frame when `RenderPath==1` (surfel GI), inserted after `SurfaceResolve` (which already
produces `SurfaceImage`=world pos and `NormalImage`=normal) and *instead of* the ReSTIR kernel:

1. **Host: spawn + build grid.** Coverage-driven spawn is cheapest on the host from the G-buffer readback
   or a tiny compute prepass; then build the uniform hash grid (`SurfelGridHead` / `SurfelGridNext`
   linked-list buffers) from the surfel positions. Budget/coverage constants mirror the CPU reference
   (`RMIN 0.035, RMAX 0.09, COVERAGE_TARGET 2.4, SPAWN_BUDGET 1200`).
2. **`SurfelIrradianceUpdate.slang`** — dispatch `ceil(surfelCount/64)` groups. Reads `Surfels[]` +
   grid + CWBVH (bindings 8/9), writes `IrradianceNew`. Host then commits `Irradiance = IrradianceNew`
   (or ping-pong the two).
3. **`SurfelGIResolve.slang`** — dispatch `ceil(W/16)×ceil(H/16)`. Reads the G-buffer + surfel field +
   sky cube, writes the tone-mapped `OutputImage`.

Buffers to allocate (SSBOs; see the `layout(std430 …)` blocks in the shaders): `Surfels[]` (80 B/record,
size = max surfels ≈ 12–16k for 480²), `SurfelGridHead[hashSize]`, `SurfelGridNext[maxSurfels]`.
Push-constant structs are at the top of each shader.

For **plain raster** (`RenderPath==2`): run only `SurfelGIResolve` with `kFeatureGlobalIllumination`
clear — it skips the surfel gather and fills indirect with sky ambient (never black). No surfel buffers
needed; you can bind empty ones.

## 5. Materials in every mode (the correctness requirement)

`SurfelGIResolve` reads `AlbedoImage` (SurfaceResolve already parks primary albedo for the denoiser) and a
`MaterialAux` image (metalness/roughness). **PORT seam:** extend `SurfaceResolve.slang` to also emit
metal/rough into an aux target, *or* decode the material slab from `SurfaceImage.w` (the visibility id)
exactly as `ReSTIRViewport.slang` does in its DI block. Diffuse = `albedo·(1−metal)`, specular F0 =
`mix(0.04, albedo, metal)`; the same numbers the OpenPBR lobe set uses, so a surface reads identically
whether lit by the kernel, the surfels, or the flat raster. Replace the inline lobe with a call into
`MaterialEvaluation.slang` (it is include-only and already lowers) when you want the full lobe set.

## 6. Reflections (Off / Sky / Raytraced)

Handled in `SurfelGIResolve::Reflection()` and (for the raytraced path) the kernel:
- **Off** — no specular term.
- **Sky** — `texture(SkyCube, reflect(-V,N))`, roughness widens the LOD. No rays. This is the reflection
  for the surfel + plain paths.
- **Raytraced** — one CWBVH reflection ray; miss → sky, hit → sun direct + surfel-field indirect at the hit.

## 7. Compile the shaders

```sh
bash Tools/Build/BuildGlslang.sh                       # builds /tmp/glslang-build/StandAlone/glslang
# add the two shaders to SHADER_TABLE in CMakeLists.txt:
#   "SurfelIrradianceUpdate.slang|compute|SurfelIrradianceUpdate.spv"
#   "SurfelGIResolve.slang|compute|SurfelGIResolve.spv"
PATH=/tmp/glslang-build/StandAlone:$PATH bash Tools/Build/CheckShaders.sh   # → all GREEN
```

## 8. What is verified vs. what remains

- ✅ Shaders lower to SPIR-V (`Exhibits/ShaderCompilation/IntegrationShaderCompilationProvenance.txt`).
- ✅ C++ patch `git apply --check`-clean on `main`.
- ✅ All three modes + reflection modes proven in `CpuMirror/ModeMatrix.cpp`.
- ⏳ Host surfel-buffer allocation + grid build + the two dispatches (§4), the `MaterialAux` target (§5),
  the FeatureFlags packing in `BuildDispatch` (§3), and on-GPU visual validation — need your build/device.
- ⏳ Optional: a dedicated Raytracing tile icon; a tier-keyed default (e.g. low tiers default RT off →
  surfel GI) in `FidelityClassifier.cpp`.
