# Frontier · World Blockout

A standalone world-blockout editor for a 10,000 km flat world: SDF-first terrain that bakes to
heightmaps and meshes, and a spectral ocean that simulates close to the camera, tessellates in the
mid range and shades the horizon — with the switch points decided by screen-space error, not by a
fixed distance chain.

| | |
|---|---|
| Stack | TypeScript + WebGPU (WGSL), Vite. No runtime dependencies. |
| World | 10,000 km × 10,000 km, metres, sea level = 0, authored top-down |
| Terrain | SDF field (coast distance, uplift, mountain spines, gulfs, brushes) → 16-bit heightmap + mesh + coastline |
| Water | GPU spectral cascade FFT (Tessendorf, finite depth, Hs-calibrated) + near-field shallow-water sim + 4-regime adaptive mesh |
| Runs | `npm install && npm run dev`, then open the preview |

## Why the water is not a wave texture

A scrolling normal map has no geometry, no dispersion and no memory. This does:

1. **Spectrum (CPU, once).** Phillips spectrum over wave vectors for three cascades (512 m, 64 m,
   8 m tiles), Hermitian-symmetric `h0(k)`, finite-depth dispersion `ω = √(gk·tanh(kd))`, then
   calibrated by FFT so the surface significant wave height matches `Hs ≈ 0.21 U²/g` for the wind
   you set. Verified in `tests/run.ts`.
2. **Time term + inverse FFT (GPU, every frame).** `h(k,t) = h0(k)e^{iωt} + h0*(−k)e^{−iωt}`,
   radix-2 inverse transform in WGSL (`ocean_fft.wgsl`), resolved into height, slope, displacement
   and Jacobian textures. The exact index arithmetic is replayed on the CPU and compared against a
   reference FFT in `tests/fftShaderParity.ts` — bit-exact at N = 4, 8, 16, 32.
3. **Near-field sim (GPU).** Depth-averaged shallow-water equations on a camera-centred grid,
   CFL-clamped, spectrally nudged so it agrees with the FFT field offshore and adds what a linear
   spectrum cannot: shoaling, refraction, breaking and foam.
4. **Adaptive mesh.** The surface is drawn as nested rings. Each ring's quad spacing and the
   per-fragment cascade fade come from `src/core/lod.ts`, which measures projected error in pixels.

## Adaptivity, concretely

`resolveBaseSpacing(cameraHeight)` asks how many pixels the shortest rendered wave spans at that
camera height and picks the finest spacing that still resolves it (≥ 4 quads per wave); rings double
outward, dropping out when they would alias. Measured output (`Exhibits/lod-resolver.png`):

| Camera | Base spacing | Rings | Triangles |
|--------|--------------|-------|-----------|
| 2 m | 2 m | 9 | 55k |
| 2 km | 16 m | 6 | 37k |
| 20 km | 32 m | 5 | 31k |

Per fragment, each cascade fades out when one of its texels projects below ~1 px
(`cascadeFade` in `ocean_surface.wgsl`), and a cascade contributes nothing beyond its tile extent,
so tiling cannot become visible. That is the water equivalent of an error-metric-driven geometry
budget: detail you cannot see is never computed.

## Regimes

| Regime | What runs | Why |
|--------|-----------|-----|
| simulated | SWE sim + finest spectrum | gives waves that react to seabed, coast and each other |
| displaced | tessellated mesh displaced by cascades | real crest geometry out to ~25 km |
| flat + spectrum normals | 2-triangle plane, slope texture | beyond the pixel budget, geometry buys nothing |
| horizon skirt | shading only | the last 100 km has no resolvable detail at all |

## Editor

Top-left panels: world generation (seed, bake resolution, peak, shelf), sculpt tools (raise, lower,
flatten, smooth, gulf, landmass, city plot) with a radius/strength brush, ocean settings (wind,
direction, choppiness, spectrum and sim resolution, LOD pixel budget), view toggles and exports.
Click-drag orbits, wheel zooms, WASD/QE flies, Shift-drag pans. The Map mode is the authoritative
top-down view with LOD ring overlay; the 3D mode is the blockout.

Exports: colour map PNG, 16-bit heightmap PNG, terrain OBJ, world JSON (params + SDF ops + cities,
round-trippable), coastline SVG, spectrum CSV. All generated from the same field the view uses.

## SDF-first terrain

`WorldField.heightAt` evaluates the field, not an image: warped coast distance from a rasterised
signed-distance layer, continental uplift, mountain spines, plus brush ops that are ordered
independently (blob unions, gulf subtractions with guaranteed water, flatten pads, shelf widening).
Noise is band-limited to the active bake resolution, so a 512² bake of a 10,000 km world is smooth
instead of speckled. Bakes produce the heightmap, the SDF grid, the mesh (`buildTerrainMesh`) and
marching-squares coastlines (`extractCoastline`).

## Verification

`npm test` runs every suite:

| Suite | What it proves |
|-------|----------------|
| spectrum physics | Hs tracks wind speed, cascades split variance, waves evolve continuously, deterministic per seed |
| LOD resolver | regimes, ring nesting, bounded triangles, altitude adapts base spacing, CFL timestep |
| world field + brushes | land fraction, SDF↔mesh agreement, coastline extraction, each brush does what it claims |
| FFT shader parity | the shader's butterfly arithmetic reproduces a reference inverse FFT exactly |
| FFT pass chain | every pass reads the texture the previous pass wrote; ping-pong cannot read what it writes |
| uniform layouts | CPU uniforms match WGSL struct sizes and offsets (parsed with wgsl_reflect) |
| shader parse + bindings | every module parses, entry points exist, bindings exist in the matching layout |
| stage visibility | shader usage per stage matches the bindgroup layout's visibility flags |
| DOM boot (no GPU) | controls, HUD and all six exports work with no WebGPU adapter |

There is **no GPU in the build environment**, so the GPU path is verified statically (parse,
bindings, layouts, chain) and the physics/math are verified numerically. The images in `Exhibits/`
are CPU reference renders from the same spectrum and field code — they are labelled as such and are
not GPU captures. First-run GPU correctness on your machine is the open item; the HUD surfaces any
shader or validation error instead of failing silently.

## Evidence

| File | Shows |
|------|-------|
| `Exhibits/ocean-surface.png` | surface ray-marched from the FFT height field, 35 m camera, sun glitter path |
| `Exhibits/ocean-surface-low.png` | 10 m camera, grazing angle, chop cascades resolving with distance |
| `Exhibits/water-column.png` | the surface as a height profile — crests, troughs and Hs, not a texture |
| `Exhibits/world-map.png` | the SDF world: continents, shelves, gulfs, archipelago, coastline |
| `Exhibits/lod-resolver.png` | the resolver's decisions per camera altitude |
| `Exhibits/lod-rings-*.png` | tessellation density at 200 m and 4 km |

Regenerate with `npm run evidence`.

## Fidelity boundary

`Experimental/WorldBlockout` follows the folder conventions in the repository's agent rules
(`Experimental/` for prototypes with their own launcher). It is deliberately engine-independent:
the spectrum, field, LOD resolver and exporters are plain TypeScript and can be lifted into an
engine worker or a C++ port with the WGSL translated. It does not claim to add rendering to the
C++ editor, which is not present in this branch.
