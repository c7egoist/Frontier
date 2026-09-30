# Default scene — Surfel GI + normal render

Renders of **Project Zero's default scene** (the `ShowcaseStructure` grid — one sphere per OpenPBR
material family, on the ground plane under an overhead area light) in the two render-mode-matrix paths
this question is about.

| File | Mode | Matrix cell |
|---|---|---|
| `defaultscene_surfelgi.png`  | **Surfel GI** — visibility-raster primary + surfel indirect | RT off · GI **on** |
| `defaultscene_plainraster.png` | **Normal render** — plain visibility raster (materials + direct + sky ambient, no GI, no rays) | RT off · GI off |
| `defaultscene_raytraced.png` | Raytraced ReSTIR (included for reference) | RT on |
| `DefaultScene_SurfelGI_vs_Normal.png` | Side-by-side of the two requested modes | — |

Rendered by the CPU mirror: `../CpuMirror/ModeMatrix.cpp --scene grid` at 560×420, 160 surfel frames,
spp 24, aa 2. Every material family is evaluated in **both** paths — that's the correctness point: only
the *source* of indirect light differs (surfel field vs. flat sky ambient), the BSDF evaluation is shared.
Surfel field converged to ~40k surfels with a frame-to-frame diff of **0.00002** (no flicker).

## Can these run in Project Zero today?

- **Normal render (plain visibility raster, GI-off): YES — native in the engine now.** The GI-off path is
  a real, shipped stage (`SwapchainExchange.cpp` R10 shadow stage + `VisibilityRaster.cpp`): when Global
  Illumination is off the ReSTIR kernel is not dispatched and the frame is rasterised directly with a
  depth-map shadow stage. Nothing to add.

- **Surfel GI: NOT wired into the engine build yet.** There is *zero* surfel code in the actual
  `Engine/`/`Projects/` tree (`grep -ri surfel` → nothing). What exists is the full **design + CPU proof**
  in this `RaytraceToggle/` folder:
  - `CpuMirror/ModeMatrix.cpp` — the runnable proof (these images).
  - `Shaders/Surfel{IrradianceUpdate,GIResolve,Commit}.slang` — the two GPU passes (lower to SPIR-V).
  - `HostWiring/SurfelGIStage.{h,cpp}` — the host buffer/hash-grid/dispatch module (compiles vs. real
    Vulkan-Headers) plus the apply-clean integration patches.
  - `PortingGuide.md` — the remaining host wiring to finish the on-GPU port.

  Note the real engine's "GI **on**" today is the **ReSTIR** kernel, not surfels — surfel GI is an
  *alternative* RT-off GI path proposed by this thread, not a rename of the existing one.

## To actually run surfel GI in Project Zero

The code is written; finishing it is host integration + on-GPU validation, which needs a Vulkan device
(none in this sandbox). Apply `Patches/RaytraceToggle_Integration.patch` (or take it from
`FlattenedEngine/`), add `HostWiring/SurfelGIStage.{h,cpp}` and the three `Shaders/Surfel*.slang` to the
build, and follow `PortingGuide.md` for the buffer allocation + `vkCmdDispatch` order. The images here are
the reference the GPU output should match.
