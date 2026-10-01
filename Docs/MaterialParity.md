# Material parity across the three render paths

One material model, evaluated by the visibility raster, the surfel GI path and the ReSTIR path. This note records
what is claimed, how the claim is tested, and what the test cannot reach.

## The claim

The three paths differ in **transport** — how light gets to a surface — and in nothing else. Specifically they must
not differ in **material evaluation**: the decode of a hit into a `ShadingRecord`, and the lobe stack evaluated on
it. Historically they did differ. The surfel passes reduced every receiving surface to albedo / metalness /
roughness with a fixed dielectric `F0` of 0.04, and `SurfelIrradianceUpdate.slang` invented its hit normal as
`hitN = -wi` rather than reading the geometry.

## The three configurations

| Path             | Raytracing | GI  | Reflections | What it is                                        |
| ---------------- | ---------- | --- | ----------- | ------------------------------------------------- |
| Visibility raster| off        | off | off         | direct sun and the analytic sky, nothing bounced   |
| Surfel GI        | off        | on  | optional    | irradiance cached on surfels, no rays at shade time|
| ReSTIR           | on         | on  | optional    | traced, reservoir-resampled direct and indirect    |

## The proof

`VisualProof/MaterialParity/MaterialParityProof.cpp`. Twenty-nine checks in three gates; it exits non-zero if any
of them fails, so it can gate a commit. Output lands in `VisualProof/MaterialParity/`:
`MaterialParityProof.txt` (transcript) and `MaterialParitySheet.png` (six bands).

### Gate ① — the shaders say so

A source audit of `ReSTIRViewport.slang`, `SurfelIrradianceUpdate.slang` and `SurfelGIResolve.slang`, with comments
stripped first so a sentence in a comment cannot satisfy or trip a check. Each shader must:

- call `ResolveMaterial` — decode the real hit, not approximate it
- call `ResolveLayers` **and** `EvaluateBsdf` — the shared lobe stack, not a private BRDF
- `#include "SceneMaterialResolve.slang"` — the shared decode, not a copy of it
- contain no `hitN = -wi`, no `mix(vec3(0.04), albedo`, no `AlbedoImage` / `MaterialAux` G-buffer read

and the two surfel passes must additionally bind the same scene buffers and bindless texture table the ReSTIR
kernel binds, since a pass that cannot see the geometry cannot decode a hit from it.

This gate is a **source audit, not an execution**. There is no shader validator in this environment, and the only
route to executing `.slang` on the CPU is the repository's `-DFRONTIER_CPU_PORT` mirror through `SlangCpuShim.h`,
which `SceneMaterialResolve.slang` does not yet fit. Gate ① therefore proves the shaders *are written* to share the
model. Gates ② and ③ execute the shared model itself, through `MaterialEvaluation.slang` compiled as C++.

### Gate ② — hold transport, demand the same image

All three paths are given identical transport: direct sun only, no GI, no reflections, no shadow rays. Whatever
remains of a difference between them is material evaluation. The requirement is **bitwise** equality, not a
tolerance — the three paths run the same `EvaluateWorld` on the same `ShadingRecord`, so any non-zero difference
means a path kept something of its own.

```text
pair                       max |Δ| per channel      mean |Δ|
raster  vs surfel                     0.000e+00     0.000e+00
raster  vs restir                     0.000e+00     0.000e+00
surfel  vs restir                     0.000e+00     0.000e+00
```

### Gate ③ — release transport, demand a different image

Gate ② is vacuous if the three paths are secretly the same renderer. So each path is then given its own transport
and the images are required to **differ**. They do, and the difference is bounce light and ground reflections, not
material. `AmbientResponse` stays path-independent by construction and is checked separately.

## The scene

Nineteen ShaderBalls at **full resolution — 67 832 triangles each, no decimation** — one per material family, taken
from column 9 of the showcase grid, in a line at 1.45 m pitch over a ground plane. 1 288 810 triangles, through a
median-split BVH. The twentieth family (emission, row 8) is a sphere and is excluded; see *Known gaps*.

The camera is a 3.85° vertical lens 44 m back rather than a wide lens close in. Across a 28 m row, a wide lens gives
the end balls a visibly different view direction from the middle ones, which reads as a material difference when it
is only perspective. At this focal length the row is effectively orthographic.

The sheet is six bands of 2560 × 256: rows 1–3 are raster / surfel / ReSTIR with transport **held** and must be
indistinguishable; rows 4–6 are the same three with their **own** transport and must not be.

## Building

MSVC, the primary toolchain:

```powershell
.\VisualProof\MaterialParity\BuildMaterialParityProof.ps1          # build and run
.\VisualProof\MaterialParity\BuildMaterialParityProof.ps1 -NoRun   # build only
```

g++, same seven translation units — if one list changes, both must:

```bash
F=_AgentScratch/Frontier
g++ -std=c++20 -O2 -w -DFRONTIER_CPU_PORT -pthread \
    -I$F/Engine -I$F -I$F/ExternalPackages/vulkan-headers/include \
    VisualProof/MaterialParity/MaterialParityProof.cpp \
    $F/Engine/ContentInterchange/ShowcaseStructure.cpp \
    $F/Engine/ContentInterchange/ShaderBallGeometry.cpp \
    $F/Engine/ContentInterchange/MaterialIndex.cpp \
    $F/Engine/GeometricRaster/GeometryStructure.cpp \
    $F/Engine/DeviceExchange/OrientationClassifier.cpp \
    $F/Engine/DisplayPresentation/ShadingTableCodec.cpp \
    -o _AgentScratch/build/parity/MaterialParityProof
```

Run from the repository root — the proof reads the mesh asset and the three `.slang` files by repository-relative
path. Roughly 25 s: six full-resolution renders and the BVH build.

Two things the build deliberately does not do. `SceneCodec.cpp` is not linked, because the proof writes no glTF and
that translation unit needs the `cgltf` single-header parser; `SceneCodec::Encode` is defined inside the proof as a
refusal that returns `false` with a reason. And no compression library is linked: the PNG writer is fixed-Huffman
deflate over a greedy LZ77, which keeps the sheet at about 1.2 MB instead of the 11.9 MB stored blocks would cost.

## Known gaps

- **Gate ① is static.** See above. Executing the surfel `.slang` text on the CPU needs `SlangCpuShim.h` extended
  with `mat4`, the integer vector types, bit-cast intrinsics and texture arrays.
- **Emission (row 8) is excluded.** The grid keeps spheres there on purpose: every triangle of an emissive instance
  becomes a luminaire-table row, and twenty instances of 67 832 triangles would be 1.4 M of them. The parity
  argument does not depend on it — emission is an additive term that bypasses the lobe stack.
- **The proof shades on the CPU.** It executes the shipped `MaterialEvaluation.slang` text, not SPIR-V. A driver
  miscompilation of that same text would not be caught here.
- **`TlasInstanceCount = 0u`.** The surfel passes still pin this, so on device they walk the flattened triangle
  list rather than the two-level TLAS. That is a scaling problem, not a material one, and it is tracked separately.
