# Raytracing toggle + Surfel GI + reflection modes — engine integration

Wires the proven surfel GI (`../SurfelGI/`) into the real Frontier pipeline as a selectable render path,
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
| `CpuMirror/ModeMatrix.cpp` | Runnable CPU mirror. Renders the same scene in all three modes + a polished-metal sphere so reflections (sky vs raytraced) are visible. Self-contained: `g++ -O2 -std=c++17 -pthread`. |
| `CpuMirror/RenderModeMatrix.png` | The proof image (plain raster · surfel GI · raytraced). |
| `Shaders/SurfelIrradianceUpdate.slang` | GPU pass 1 — per-surfel temporal irradiance update (CWBVH rays, running mean, Jacobi). |
| `Shaders/SurfelGIResolve.slang` | GPU pass 2 — per-pixel resolve (G-buffer → direct + surfel indirect + reflection → tone-map). Also serves the plain-raster mode. |
| `Patches/RaytraceToggle_Integration.patch` | The C++/kernel edits (Control Centre tile + reflection mode, integrator config, GameExecution decision matrix + surfel logs, kernel feature bits). `git apply`-clean on `main`. |
| `Patches/shader_compile_proof.txt` | glslang lowering both new shaders + the patched kernel to SPIR-V. |
| `PortingGuide.md` | Step-by-step: every edit, the feature-bit map, the dispatch order, and the host-side surfel buffer wiring that finishes the port. |

## Proof status

- **Shaders lower to SPIR-V** — verified with the repo's own `Tools/Build/CheckShaders.sh` toolchain
  (glslang built via `Tools/Build/BuildGlslang.sh`). See `Patches/shader_compile_proof.txt`.
- **C++ patch applies clean** — `git apply --check` passes on `SultanAladin/Frontier-@main`.
- **Behaviour proven on CPU** — `CpuMirror/ModeMatrix.cpp` renders all three modes correctly, with
  sky-vs-raytraced reflections and a ~0.00002 frame-to-frame surfel diff (no flicker).
- **Not done here** (needs your machine — no Vulkan device / full build in this sandbox): the host-side
  surfel buffer allocation + hash-grid build + the two extra `vkCmdDispatch` calls, and on-GPU visual
  validation. Every one of those steps is spelled out in `PortingGuide.md`.

## Build / run the CPU mirror

```sh
cd CpuMirror
g++ -O2 -std=c++17 -pthread ModeMatrix.cpp -o modematrix
./modematrix --w 440 --h 440 --frames 300 --rays 10 --direct 96 --spp 48
# writes mode_raytraced.ppm / mode_surfelgi.ppm / mode_plainraster.ppm
```
