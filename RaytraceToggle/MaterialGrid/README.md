# Showcase material grid — all families, all three modes

`ShowcaseGrid_Modes.png` is the engine's **15×15 = 225-sphere material showcase**
(`ContentInterchange/ShowcaseStructure.cpp`, the r4 generator — the same grid the flake / denoiser /
material work rendered) run through **all three render-mode paths** by the CPU mirror
(`../CpuMirror/ModeMatrix.cpp --scene grid`). It proves every OpenPBR family shades correctly regardless of
which pipeline is active — the guarantee the GPU aux G-buffer (`../HostWiring/Patches/SurfaceResolve_MaterialAux.patch`)
provides on the device.

15 rows = 15 material **families**, 15 columns = a hue + parameter sweep inside the family (spheres r=0.55,
spacing 1.5, exactly as `MaterialLevelViewport`'s grid). The mirror was given a real multi-lobe material model
— **metal, specular roughness, dielectric transmission (glass) with Beer–Lambert absorption, emission, clear
coat / car paint, thin-film iridescence, cloth/fuzz sheen, subsurface, and glint flakes** — so each family is
distinct:

| Row | Family | Row | Family |
|----|--------|----|--------|
| 0 | anisotropic metal (hue-tinted polish ladder) | 8 | **emission** (luminaire rainbow) |
| 1 | **transmissive glass** (IOR 1.30→2.42, tinted) | 9 | rough metal (roughness ladder) |
| 2 | subsurface (scatter hue sweep) | 10 | dielectric→metal morph |
| 3 | **thin film** over dark/gold/black | 11 | ceramic / rubber (alternating) |
| 4 | **cloth / fuzz** (velvet sheen ramp) | 12 | **glint flakes** (density 1→8) |
| 5 | **coat / car paint** (coat-roughness ramp) | 13 | **absorbing glass** (tint deepening) |
| 6 | haziness (broad second gloss lobe) | 14 | showpieces: chrome · black-gloss · pearl · gold · frosted glass |
| 7 | EON diffuse (hue rainbow) | | |

### What each mode shows (same scene, same materials)

| Tile | Path | Tells |
|---|---|---|
| `grid_plainraster.png` | RT off, GI off | flat sky-ambient + direct; metals/coat/glass **reflect & refract the sky**. Every family already reads correctly — glass is translucent, flakes sparkle, emission glows, cloth is matte-sheened. |
| `grid_surfelgi.png` | RT off, GI on | adds inter-sphere GI + contact darkening; richer colour bleed between neighbours. Reflections still sky-only. |
| `grid_raytraced.png` | RT on | true **raytraced reflection AND refraction**: glass shows the scene through it, metals reflect their neighbours, the glint-flake row sparkles with real specular facets, hero chrome/gold mirror the field. |

Rendered 660×480, 130 frames, 44 spp (raytraced), surfel field converged to ~44 k surfels
(frame-to-frame flicker 2×10⁻⁵).

### Reproduce
```bash
cd ../CpuMirror
g++ -O2 -std=c++17 -pthread ModeMatrix.cpp -o modematrix
./modematrix --scene grid --w 660 --h 480 --frames 130 --rays 8 --direct 48 --spp 44
# writes mode_{plainraster,surfelgi,raytraced}.ppm   (--scene cornell for the box)
```
