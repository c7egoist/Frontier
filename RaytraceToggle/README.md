# Raytracing toggle + Surfel GI + reflection modes — engine integration

Wires the proven surfel GI (`CpuMirror/ModeMatrix.cpp`, rendered on the material grid) into the real Frontier
pipeline as a selectable render path,
adds a **Raytracing** quick tile, and turns **Reflections** into a 3-way mode (Off / Sky / Raytraced).

## The mode matrix (what the tiles do)

| Raytracing tile | Global Illumination tile | Render path | Reflections available |
|---|---|---|---|
| **ON**  | on *or* off | **Raytraced ReSTIR kernel** (`ReSTIRViewport.slang`) | Raytraced (or Sky/Off) |
| **OFF** | **ON**      | **Surfel GI** — visibility raster primary + surfel indirect | Sky / Off |
| **OFF** | **OFF**     | **Plain visibility raster** — materials + direct + sky ambient, no GI, no rays | Sky / Off |

**Guard:** Raytracing ON but GI OFF *and* Reflections OFF is flat and pointless, so it falls back to the
plain visibility raster (which looks better than a raytraced path carrying neither GI nor reflections).
**Reflections** are only ever *raytraced* or *sky* — there is no screen-space reflection in the engine and
none is added. Raytraced reflections need the raytracing budget, so when RT is off the host degrades
`Raytraced → Sky` automatically.

Materials are evaluated in **all three** paths, not only the raytraced kernel — that is the correctness
requirement, and it is what the CPU mirror proves.

## What's in here

| Path | What |
|---|---|
| `CpuMirror/ModeMatrix.cpp` | Runnable CPU mirror. Renders the same scene in all three modes + a polished-metal sphere so reflections (sky vs raytraced) are visible. Self-contained: `g++ -std=c++20 -O2 -pthread`. |
| `CpuMirror/RenderModeMatrix.png` | The proof image (plain raster · surfel GI · raytraced). |
| `Shaders/SurfelIrradianceUpdate.slang` | GPU pass 1 — per-surfel temporal irradiance update (CWBVH rays, running mean, Jacobi). |
| `Shaders/SurfelGIResolve.slang` | GPU pass 2 — per-pixel resolve (G-buffer → direct + surfel indirect + reflection → tone-map). Also serves the plain-raster mode. |
| `Patches/RaytraceToggle_Integration.patch` | The C++/kernel edits (Control Centre tile + reflection mode, integrator config, GameExecution decision matrix + surfel logs, kernel feature bits). `git apply`-clean on `main`. |
| `Exhibits/ShaderCompilation/IntegrationShaderCompilationProvenance.txt` | glslang lowering both new shaders + the patched kernel to SPIR-V. |
| `PortingGuide.md` | Step-by-step: every edit, the feature-bit map, the dispatch order, and the host-side surfel buffer wiring that finishes the port. |

## Proof status

- **Shaders lower to SPIR-V** — verified with the repo's own `Tools/Build/CheckShaders.sh` toolchain
  (glslang built via `Tools/Build/BuildGlslang.sh`). See `Exhibits/ShaderCompilation/IntegrationShaderCompilationProvenance.txt`.
- **C++ patch applies clean** — `git apply --check` passes on `SultanAladin/Frontier-@main`.
- **Behaviour proven on CPU** — `CpuMirror/ModeMatrix.cpp` renders all three modes correctly, with
  sky-vs-raytraced reflections and a ~0.00002 frame-to-frame surfel diff (no flicker).
- **On-GPU visual validation** still needs your machine (no Vulkan device in this sandbox). Everything else
  the port needs is now written and verified as far as possible — see the follow-up below.

## Follow-up — Thread E-2 (this round)

Three additions on top of the delivery above:

1. **Material grid** (`MaterialGrid/`) — a 20×20 = **400-sphere metalness×roughness×hue matrix** rendered by
   the CPU mirror in all three modes (`ModeMatrix.cpp --scene grid`), proving **all materials render
   correctly in every mode**. The mirror's material model was upgraded from binary metal to continuous
   metalness/roughness + Schlick–Fresnel to make this meaningful. See `MaterialGrid/README.md`.
2. **Host-side wiring** (`HostWiring/`) — the surfel-buffer allocation, host hash-grid build, the extra
   `vkCmdDispatch` calls, the `SurfaceResolve` metal/rough aux target, and the `BuildDispatch` feature-bit
   packing are now **written**: a self-contained `SurfelGIStage.{h,cpp}` module (compiles clean against real
   Vulkan-Headers) plus three apply-clean patches. See `HostWiring/README.md`.
3. **Dedicated Raytracing tile icon** (`HostWiring/Patches/RaytracingIcon.patch`) — a new `RaytracingBeam`
   glyph (sphere + camera ray + two bounce rays) replaces the shared Sparkles glyph on the Raytracing tile.
   Preview: `HostWiring/IconPreview/RaytracingIcon.png`.

The only step that genuinely still needs your GPU is the `MaterialImage` storage-image allocation in
`VisibilityExchange` (the file isn't in this sandbox's clone) — documented with the exact snippet in
`HostWiring/README.md §3` — and on-device visual sign-off.

## Build / run the CPU mirror

```sh
cd CpuMirror
g++ -std=c++20 -O2 -pthread ModeMatrix.cpp -o ModeMatrix
./ModeMatrix --w 440 --h 440 --frames 300 --rays 10 --direct 96 --spp 48
# writes mode_raytraced.ppm / mode_surfelgi.ppm / mode_plainraster.ppm
```
