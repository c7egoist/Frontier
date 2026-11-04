# Planet-scale landmass authoring (Landscape Studio)

The third Frontier workspace. It authors **continents, islands and gulfs at
planetary scale** from a signed-distance field, renders them with a real
simulated ocean, and stores the whole planet as a few kilobytes of operations.

This first milestone is deliberately **sculpting only**. Erosion, sedimentation,
fracture and cryo-weathering are listed in the outliner as planned layers, in
pipeline order, so the existing Terrain Studio simulations can be ported one at
a time without reshuffling the UI or the document format.

---

## Why not a heightmap

A heightmap is a raster: cost scales with area, it cannot overhang, and every
resize is a resample. The Terrain Studio's heightfield is the right tool for a
1 km study site; it is the wrong tool for a 3 200 km planet.

The planet here is a function, not a picture:

```
F(x, y, z) = y − elevation(x, z)
```

`elevation` is evaluated from the authored document — a noise spectrum for the
planetary base, plus a list of stamps and brush strokes. Nothing is baked.

| Concern | Heightmap planet | This document |
| --- | --- | --- |
| Save file | 100s of MB | **< 32 KB JSON** (asserted in tests) |
| Area | fixed grid | arbitrary; the field is continuous |
| Detail | uniform | per-sample octave budget (LOD) |
| Undo | raster diff or full copy | delete one operation |
| Overhangs | impossible | SDF supports them when authored volumetrically |

The kilobyte document is what makes an HDD machine viable: there is nothing to
stream. Tiles are derived on demand and evicted under a memory budget, so random
reads from a spinning disk are replaced by local evaluation.

## Architecture

```
src/core/landscape-document.js   Sparse planet doc: layers, stamps, strokes; serialise/normalise/diff
src/core/landscape-math.js       Spectral noise, ridged carving, continental profile helpers
src/core/landscape-field.js      SDF evaluator: base spectrum + stamps + strokes, per-term LOD budgets
src/core/landscape-tiles.js      Memory-budgeted LRU tile scheduler + clipmap ring selection
src/app/landscape-shaders.js     Terrain, ocean and sky GLSL (single source of truth)
src/app/landscape-ocean.js       GPU shallow-water solver + displaced surface
src/app/landscape-viewport.js    three.js viewport: clipmap rings, ocean, picking, sculpting
src/app/landscape-toolbar.js     Tool rail (navigate, sculpt tools, landmass stamps) + brush sliders
src/app/landscape-studio.js      Workspace controller: persistence, outliner, inspector, import/export
src/app/landscape.css            Studio styling on the shared --tp-* tokens
tools/render-landscape.mjs       Offline QA renderer (raymarch, --topdown map mode)
```

### The field

The base elevation is a continental profile (shelf → slope → abyssal plain)
modulated by a **spectral** noise set, not by absolute-amplitude fbm:

```
amplitude_i = A₀ · gain^i        A₀ given at the base wavelength, gain = 0.5
```

Specifying amplitude at the longest wavelength keeps slope roughly constant
across bands instead of stacking the largest amplitude at the shortest
wavelength — the mistake that produces either glass-smooth plains or noise
static.

Relief (hills, spurs, gullies) is gated by `reliefMask = landMask ·
smoothstep(0, height·0.22, signedHeight)`, so the sea floor stays smooth and no
micro-islands appear offshore.

Stamps are windowed to reach exactly zero at their bounds (`t ≈ 2.55`) and their
interior relief fades earlier (`t ≈ 1.55`); otherwise the bounds cull slices a
visible rectangle out of the terrain. Blending uses a small softness derived
from the stamp's own height times a `stampCoverage` feather — radius-proportional
softness produced kilometres-wide aprons around islands and moats around basins.

### LoD

```
octaveBudget(wavelength, cell, max) = clamp(floor(log2(wavelength / (4·cell))) + 1, 1, max)
SAMPLES_PER_FEATURE = 4
```

Neighbouring tiles agree to 1.94e-5 m at their shared seam. Seven clipmap rings
from 256 m to 1 048 576 m tiles keep the planet legible from orbit down to
ground level, with an LRU scheduler that never exceeds its byte budget.

### The ocean

Not a scrolling normal map and not a sky-blue plane:

* **Solver** — Mei-style shallow-water update on the SDF bed, one texel per
  cell, run in three fragment passes (init, flux, integrate) into half-float
  render targets at 320². The domain follows the camera and re-seeds from the
  analytic bed, so cost is bounded no matter how large the planet is.
* **Open water** — an analytic Gerstner swell (four octaves, analytic normals,
  wind chop) carries the horizon out to 900 km beyond the simulated window.
* **Shading** — Beer-Lambert absorption with per-channel extinction, suspended
  sediment near the coast, Fresnel reflection of the analytic sky, a two-lobe sun
  specular, advected whitewater, and a surf band derived from how close the bed
  is to the surface. Breakers roll shoreward with the depth field rather than
  sitting in a fixed ring at the beach.

The surface normal comes from the **simulated water height**, not the bed — a
bed-derived normal tilts the whole ocean to follow the sea floor, which is the
classic tell of a fake ocean at the shoreline.

### Storage and UI

The workspace reuses the Frontier shell: outliner dock on the left, inspector
tabs (Layer / World / Ocean / Ops) on the right, tool rail docked to the
viewport's left edge, camera presets, HUD and a header with save/open/export.
Documents autosave to `localStorage` under `frontier.landscape.document.v3`;
`Save Landmass` writes JSON, `Export .OBJ` writes the visible region's mesh.

---

## Port sequence (next milestones)

The outliner already shows these as *planned* layers, in evaluation order:

1. **Landform sculpting** — *this milestone*: continents, islands, plateaus,
   mesas, ridges, deltas, canyons, basins, straits, craters; raise/lower/smooth/
   flatten/terrace/sharpen/noise brushes.
2. **Particle erosion** — port the Terrain Studio erosion logic one feature at a
   time, highest-quality first. Each becomes a layer whose result is baked back
   into the SDF, exactly as the current editor does.
3. **Sedimentation beds** — stratigraphic layers and chemical cementation,
   authored as beds rather than as surface colour.
4. **Fracture & cracks** — the open question. Volumetric SDF cracks (thin carved
   wedges evaluated as a subtracted distance field) are the promising route; a
   surface-only approach cannot produce the undercut edges real cracks have.
5. **Cryo / thermal weathering** — snow accumulation, thaw, pitting and thermal
   expansion, reusing the existing frost-weathering module.
6. **SDF → mesh** — dual contouring on the region lattice, then island removal,
   Taubin smoothing, QEM decimation and game-ready attribute packing (already
   wired for the OBJ export).

## Verification

* `node --test tests/*.test.mjs` — 114 tests: field maths, document round-trip,
  scheduler budgets, ocean surf field, GLSL parsing at 300 es, DOM wiring of the
  studio UI, and the headless workspace (boot, frames, LOD, stamping, sculpting,
  inspector, persistence).
* `node tools/render-landscape.mjs --out out.png` — offline raymarched render.
  `--topdown --view-span 240000` gives a map of a region for seam checking.
* `npm run dev` — the studio at `0.0.0.0:5173`, selectable from the header's
  workspace switcher (Landscape Studio) or `#landscape`.
