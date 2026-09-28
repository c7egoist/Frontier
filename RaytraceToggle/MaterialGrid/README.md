# Material grid — all materials render correctly in every mode

`MaterialGrid_Modes.png` is a 20×20 = **400-sphere material matrix** rendered by the CPU mirror
(`../CpuMirror/ModeMatrix.cpp --scene grid`) in all three render-mode paths, proving the material model is
evaluated correctly regardless of which path is active — the same guarantee the GPU aux G-buffer
(`../HostWiring/Patches/SurfaceResolve_MaterialAux.patch`) provides on the device.

This mirrors the intent of the engine's 400-sphere material library (`MaterialLevelViewport`'s `grid400`
showcase) with the mirror's continuous **metalness × roughness** material model + Schlick–Fresnel:

* **rows** sweep **metalness** 0 → 1 (front dielectric → back metallic) and carry a per-row rainbow hue;
* **columns** sweep **specular roughness** 0.03 → 0.98 (left mirror-smooth → right matte);
* a neutral ground plane + an overhead area light under a physical sky.

| Tile | Path | What to look for |
|---|---|---|
| `grid_plainraster.png` | RT off, GI off | flat sky-ambient + direct; metals reflect the **sky** only. Every cell reads correctly — no black metals, no blown dielectrics. |
| `grid_surfelgi.png` | RT off, GI on | adds inter-sphere GI + contact darkening between neighbours; warmer, richer. Metals still reflect the sky (no scene rays). |
| `grid_raytraced.png` | RT on | metals reflect their **neighbours + the grid** (the tell-tale reflection rings on the back rows); highest contrast. |

The key result: the metalness/roughness/hue variation is legible in **all three** tiles — the non-raytraced
paths are not falling back to a single flat material. Rendered at 640×460, 120 frames, 40 spp (raytraced),
surfel field converged to ~30 k surfels (flicker 3×10⁻⁵).

### Reproduce
```bash
cd ../CpuMirror
g++ -O2 -std=c++17 -pthread ModeMatrix.cpp -o modematrix
./modematrix --scene grid --w 640 --h 460 --frames 120 --rays 8 --direct 48 --spp 40
# writes mode_{plainraster,surfelgi,raytraced}.ppm  (--scene cornell for the original box)
```
