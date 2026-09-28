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
| `grid_plainraster.png` | RT off, GI off | flat sky-ambient + direct. Every family reads correctly — flakes sparkle, emission glows, cloth is matte-sheened, and **glass genuinely transmits the scene** (see note below). |
| `grid_surfelgi.png` | RT off, GI on | adds inter-sphere GI + contact darkening; richer colour bleed between neighbours. Glass still transmits the real scene, opaque reflections stay sky-only. |
| `grid_raytraced.png` | RT on | true **raytraced reflection AND refraction**: glass shows the scene through it, metals reflect their neighbours, the glint-flake row sparkles with real specular facets, hero chrome/gold mirror the field. |

#### Glass transmission in the non-RT modes (fix)
Earlier the plain-raster / surfel-GI glass looked **flat/frosted**: those paths refracted only the
smooth sky, so a glass sphere over featureless environment had nothing to transmit. The CPU mirror
now shades dielectric transmission with a **recursive analytic refraction trace** (`shadeAnalytic`,
bounded to depth 4): the refracted ray is intersected against the actual scene geometry and shaded
with the *current mode's* lighting (surfel GI or flat sky-ambient). So glass transmits real geometry
in **every** pipeline, not just when RT is on — it merely gains true multi-bounce accuracy under RT.
A **studio checkerboard floor** was added to the ground quad so the transmitted/reflected structure
is legible (an unbroken environment made the effect invisible regardless of correctness).

Rendered 660×480, 130 frames, 44 spp (raytraced), surfel field converged to ~44 k surfels
(frame-to-frame flicker 2×10⁻⁵).

### Reproduce
```bash
cd ../CpuMirror
g++ -O2 -std=c++17 -pthread ModeMatrix.cpp -o modematrix
./modematrix --scene grid --w 660 --h 480 --frames 130 --rays 8 --direct 48 --spp 44
# writes mode_{plainraster,surfelgi,raytraced}.ppm   (--scene cornell for the box)
```

---

## Flakes on the non-raytraced paths (#30)

`GlintSheet_Modes.png` — a close row of glint-flake spheres (density ramping 0.6 → 8 left→right) rendered through
all three modes. Earlier, flakes only sparkled under the path tracer: on the non-RT paths a flake was a mirror
aligned with the surface normal, so a cluster of flakes all reflected the *same* smooth sky direction and read as
a flat patch. Two changes fix it, and they are physically the right ones:

1. **Sun disc in the sky** (`skyColor`): a bright, ~1.5° sun + aureole. Without a sharp feature in the environment
   there is nothing for a specular surface to catch, so metals and flakes looked flat regardless of the path.
2. **Per-flake facet normals** (`flakeFacetNormal`): a fired flake is a *randomly-tilted micro-mirror*, deterministic
   per cell. Each facet reflects the environment in its own direction, so a cluster flashes bright/dark (and
   occasionally flares white on the sun) — the tilted-microfacet basis of the Deliot–Belcour flake model reduced to
   one representative facet per cell.

Result: flakes now sparkle at Standard fidelity on **plain raster and surfel GI**, not only under RT (RT still has
the highest contrast because its facets reflect the real dark ground, punching visible holes). Reproduce:
```bash
./modematrix --scene glint --w 640 --h 300 --frames 90 --rays 6 --direct 40 --spp 40
```

## Materials through the multi-slab (layered) path (#29)

`MultiSlab_Compare.png` — the full 15-family grid rendered through the flat single-slab shader (left) and the new
**layered multi-slab stack** (right), surfel-GI mode. The flat path sums every lobe unconditionally; the stack path
(`shadeStack`, enabled with `--slabs`) instead evaluates the material as an **ordered stack of slabs** composited
top→bottom with an energy throughput `T`:

```
  clear-coat slab  → reflects F·T of the env, passes (1-F)·T down
  glint-flake slab → tilted-facet reflection, covers most of what's beneath where it fires
  base slab        → conductor (terminates the stack)  OR  dielectric-spec over a diffuse/SSS slab
  (fuzz sheen, emission, glass-as-interface-stack handled in-line)
```

This is the Tier-B multi-slab layout (roadmap #10/#29): coat-over-flake-over-metal/pigment resolved as *layers*, not
a blend. **Every one of the 15 families still resolves correctly through the stack** (RMSE vs the flat path ≈ 1.6 %),
and the small differences are an *improvement* — the layered path conserves energy (the coat no longer double-counts
with the base). Reproduce:
```bash
./modematrix --scene grid --slabs --w 560 --h 410 --frames 110 --rays 6 --direct 36 --spp 26
```
