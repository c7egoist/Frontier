# Project-Drive — scene CPU mirror (proof)

These images are the **CPU mirror proof** for `Project-Zero.exe --scene drive`: a dependency-free C++ render of the
*same* geometry the windowed app loads, so the scene can be verified without a GPU or a window. Source and runner live
in [`Exhibits/Workbench/Drive/`](../../Workbench/Drive/); this folder holds the rendered output and its provenance.

| File | What it shows |
|---|---|
| `drive_scene.png` | The default course from the editor's opening camera — checker pad, grey ramp, yellow speed bump, orange cones, and the real ControlVehicle (cobalt flake-clearcoat body + four procedural wheels) under sun + sky with world-space **surfel GI**. |
| `drive_body_flakes.png` | Three-quarter front close-up of the body so the **clearcoat + metallic flake** term reads (the flakes are the sparse cobalt sparkle across the panels). |
| `NativeProof.json` | Build + run provenance: the exact `g++ -std=c++20 -Wall -Wextra -Werror` compile (Release **and** Debug), the render invocations, and the sha256 of every source input and rendered output. `gpuExecution: false`. |

## What it proves
- The drive scene is assembled correctly: **5,640 triangles** — course 2,092 + ControlVehicle body 2,780 (matches
  `ControlVehicleMesh::kTriangleCount`) + 4 wheels 768 — with the instance-order contract (body first, then wheels).
- Direct sun (next-event + shadow ray) and sky are correct; the surfel field carries the indirect bounce and the
  contact shadows under the car and ramp read the way the Vulkan ReSTIR path produces them.
- The flake clearcoat is present on the body (not flat candy paint).

## Regenerate
```
python3 Exhibits/Workbench/Drive/RunProof.py          # from the repository root
```
The proof self-gates with `Check()` (scene non-empty, body/course/wheels present, body triangle count matches the
mesh, every pixel finite, scene covers a sensible fraction of frame). A failed gate is a non-zero exit.

> This is the *render* proof. The *physics* is proven separately by the headless `DriveTelemetry` reference
> (real ControlVehicle over this course), and the flake material has its own close-up study in
> `Exhibits/Gallery/AutomotiveFlakes/`.
