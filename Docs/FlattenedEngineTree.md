# Flattened engine tree

`Frontier/` at the repository root is the engine. It is one ordinary source tree: the upstream base with every
change this work produced already merged into it. You build it directly. There is no clone step, no seat step,
no overlay copy pass and no patch script — those are gone, not bypassed.

Dependencies are the single documented exception. They are fetched into `Frontier/ExternalPackages/` by the
engine's own `Tools/Bootstrap.py` and are git-ignored, exactly as upstream intends.

## Building

```bash
cd Frontier
python3 Tools/Bootstrap.py --profile proof     # dependencies — the one fetch step
cmake -S . -B build && cmake --build build
```

The CPU proof harnesses build straight off the same tree, from the repository root:

```bash
g++ -std=c++20 -O2 -w -DFRONTIER_CPU_PORT -pthread \
    -IFrontier/Engine -IFrontier -IFrontier/ExternalPackages/vulkan-headers/include \
    VisualProof/MaterialParity/MaterialParityProof.cpp \
    Frontier/Engine/ContentInterchange/ShowcaseStructure.cpp \
    Frontier/Engine/ContentInterchange/ShaderBallGeometry.cpp \
    Frontier/Engine/ContentInterchange/MaterialIndex.cpp \
    Frontier/Engine/GeometricRaster/GeometryStructure.cpp \
    Frontier/Engine/DeviceExchange/OrientationClassifier.cpp \
    Frontier/Engine/DisplayPresentation/ShadingTableCodec.cpp \
    -o _AgentScratch/build/parity/MaterialParityProof
```

## Provenance

| Layer | Source | Resolution |
|---|---|---|
| Base | `SultanAladin/Frontier-` @ `28ec0657a23ed6bbf680f17cc06b464a53639dae` | copied verbatim |
| Render work | `FlattenedEngine/` | 74 files unique to it, copied verbatim |
| Vehicle + r7 work | `VehiclePhysics/Overlay/` | 91 files unique to it, copied verbatim |
| Both touched 5 files | three-way merge, base = the pinned checkout | merged clean, no conflict markers |
| Both added 3 surfel shaders | no common ancestor | resolved to the `Overlay` copies |
| Modelling tool | `Engine/AuthoringTools/SolidArc/` | 216 files added, 13 updated |
| Drive level host edits | `DriveLevelPatch.py` | 11 edits baked in permanently |

The three files with no common ancestor are `Engine/Shaders/SurfelCommit.slang`, `SurfelGIResolve.slang` and
`SurfelIrradianceUpdate.slang`. `SurfelCommit.slang` was byte-identical on both sides. The other two were
resolved to the `Overlay` copies because only those carry the `ResolveMaterial` unification and the
`SkyAlongApprox` replacement for the `samplerCube SkyCube` that the engine never bound — the `FlattenedEngine`
copies are the older, unrunnable versions.

The five three-way merges were `Engine/DisplayPresentation/ControlCentreHost.{cpp,h}`,
`Engine/DisplayPresentation/ReSTIRIntegrator.h`, `Engine/GeometricRaster/VisibilityRaster.cpp` and
`Engine/Shaders/ReSTIRViewport.slang`.

## What was deliberately left out

- `EngineContent/GeometryArchives` (90 MB) and `EngineContent/FontArchives` (23 MB) — runtime archives, not
  code. Everything else under `EngineContent/` was kept, because `CMakeLists.txt` globs
  `EngineContent/Icons/*.svg` at configure time and a code-only copy would not configure.
- Upstream binary artefacts and build caches.

## Preserved alternates

`Frontier/References/AlternateStarSizeClamp/` holds the star size-clamp variant of
`Engine/Shaders/PostRecords.slang` and `Engine/GeometricRaster/VisibilityRaster.cpp`. It is mutually exclusive
with the Gaussian star profile the tree ships, so it is kept as reference rather than merged.

## Pruning

Eleven `.cpp` files were deleted: they were referenced by neither `CMakeLists.txt` nor any surviving `#include`
after the new CMake relocated `Projects/Project-Zero/Source/*.cpp` to `Engine/Host/*.cpp`. The relocation is
**not** a pure move — `RayTracingSolver.{h,cpp}` is listed by a second CMake target under its original path, so
the obvious "delete the old twins" pass is wrong. Of the 28 name matches, 17 are still referenced and were kept.

`Projects/Project-Physics/` is named 9 times by `CMakeLists.txt` and does not exist. That is a pre-existing
upstream condition, present identically in the base checkout, and the flatten neither caused nor fixed it.

## Verification

Run against the flattened tree after the merge, all green:

| Proof | Result |
|---|---|
| `VisualProof/MaterialParity` | 29 / 29 passed |
| `VisualProof/SharedTopology` | 25 / 25 passed |
| `ShowcaseTransportMirror` | renders; BLAS 67 832 triangles, TLAS 381 placements |
| `Frontier/Tools/Build/CheckSolidArc.sh` | compiles and passes |
