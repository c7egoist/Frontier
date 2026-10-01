# The showcase grid through three transports

The Project-Zero 20 x 20 material grid, rendered by `Exhibits/Workbench/FrontierMirror/ShowcaseTransportMirror.cpp`
through the visibility raster, the surfel GI field and a traced ReSTIR-style estimator. Output lives in
`Exhibits/Gallery/ProjectZero/ShowcaseTransport/`.

## What the grid is now

Revision 7. Four hundred slots, 380 of them full-resolution ShaderBalls and the emissive row still spheres —
every triangle of an emissive instance becomes a luminaire-table row, and 20 x 67 832 would be 1.4 M of them.

```text
revision 7, 415 materials, 380 grid placements over 1 shared geometry
BLAS: 67 832 triangles, 37 359 nodes - built once, shared by every placement
TLAS: 381 placements over 108 058 stored triangles - flattening would be 25 816 386 (238.9 x)
```

That ratio is the point. Flattening 380 copies of the mesh into world space costs roughly 2 GB at the ~80 bytes a
world-space triangle takes; this machine has 3 GB total. The grid is not merely cheaper instanced, it is only
*possible* instanced. One BLAS is built over the mesh and a TLAS indexes 380 transforms into it, which is the same
two-level structure the device path uses.

No decimation anywhere. Every ball is the full 67 832-triangle asset.

## The three paths

| Path              | Raytracing | GI  | Reflections | Transport                                            |
| ----------------- | ---------- | --- | ----------- | ---------------------------------------------------- |
| Visibility raster | off        | off | off         | direct sun with a shadow ray, sky as constant ambient |
| Surfel GI         | off        | on  | optional    | irradiance accumulated into a persistent surfel field |
| ReSTIR            | on         | on  | optional    | bounces traced per sample                             |

All three call the same `DirectLight` and the same `AmbientResponse`, and shade through
`UnifiedMaterialEvaluation`. That they evaluate the same material model is *not* argued by these pictures — it is
proved separately and bitwise by `VisualProof/MaterialParity`. These images show the other half: with the material
model held fixed, what transport alone does.

The surfel field is `Engine/DisplayPresentation/SurfelReference`, the engine's own Vulkan-free oracle for
`SurfelGIStage`. It owns placement, the spatial hash, the Jacobi running mean and the gather; the mirror supplies
only the scene-specific measurement, through the callback that exists for exactly that.

## Stills

For each of `grid400`, `default`, `metals`, `glass`, `glints`, `paint-candy`:

- `<view>_VisibilityRaster.png`
- `<view>_SurfelGI.png`
- `<view>_ReSTIR.png`

The framings are copied verbatim from `MaterialLevelViewport::ShowcaseViewpointFor`, so a sheet from this mirror is
the same shot the product opens with.

## Animations

- `SurfelGI_Convergence_default.gif`, `..._grid400.gif`, `..._metals.gif` — one rendered frame per surfel step.
  Frame one is the field at zero, which is direct light only; each subsequent frame is one more propagation of
  bounce through the cache. This is the thing a still cannot show: surfel GI is temporal by construction, and the
  cost of the first frame after a camera cut is visible here rather than argued about.
- `SurfelGI_Turntable.gif` — the grid orbited with the field persisting across frames, so the cache is being
  re-used from directions it was not measured from.
- `TransportCycle_default.gif` — one shot, one scene, one material set, dwelling on raster then surfel then
  ReSTIR. Everything that moves between those frames is light transport.

## Running it

```bash
B=_AgentScratch/build/showcase/ShowcaseTransportMirror
$B --view grid400 --path raster --width 1100 --height 620 --out out.png
$B --view default --path surfel --gi-frames 14 --rays 32 --out out.png
$B --view default --path restir --spp 12 --bounce 3 --out out.png
$B --view default --path surfel --converge 14 --out converge.gif
$B --view default --path surfel --turntable 24 --out turntable.gif
$B --view default --path surfel --cycle --out cycle.gif
```

Built from a private engine seat with `VehiclePhysics/Overlay` applied, because the pinned checkout is r6 and the
grid work is r7:

```bash
S=_AgentScratch/ShowcaseSeat
g++ -std=c++20 -O2 -w -DFRONTIER_CPU_PORT -pthread \
    -IExhibits/Workbench/FrontierMirror -I$S/Engine -I$S -I$S/ExternalPackages/vulkan-headers/include \
    Exhibits/Workbench/FrontierMirror/ShowcaseTransportMirror.cpp \
    $S/Engine/ContentInterchange/ShowcaseStructure.cpp \
    $S/Engine/ContentInterchange/ShaderBallGeometry.cpp \
    $S/Engine/ContentInterchange/MaterialIndex.cpp \
    $S/Engine/GeometricRaster/GeometryStructure.cpp \
    $S/Engine/DeviceExchange/OrientationClassifier.cpp \
    $S/Engine/DisplayPresentation/ShadingTableCodec.cpp \
    $S/Engine/DisplayPresentation/SurfelReference.cpp \
    -o _AgentScratch/build/showcase/ShowcaseTransportMirror
```

PNG and GIF are both written by `RasterImageCodec.h` in that same folder — fixed-Huffman deflate for PNG,
median-cut palette plus LZW for GIF. No image library is linked, so regenerating this gallery needs nothing
installed.

## What these images are not

- **Not GPU output.** This is the CPU mirror. It executes the shipped `MaterialEvaluation.slang` text compiled as
  C++ under `FRONTIER_CPU_PORT`, not SPIR-V.
- **Not the product's own surfel dispatch.** `SurfelIrradianceUpdate.slang` and `SurfelGIResolve.slang` are the
  device passes; `SurfelReference` is the engine's declared oracle for them, not a second renderer.
- **Not a parity claim.** See `Docs/MaterialParity.md`. These pictures deliberately differ between paths.
- **Reflections are the analytic sky**, not traced, on the raster and surfel paths. The documented
  `SkyAlongApprox` seam applies to background and reflection-miss pixels.
