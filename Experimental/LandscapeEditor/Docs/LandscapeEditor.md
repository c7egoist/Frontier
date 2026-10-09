# Landscape Editor

A browser heightmap editor built on a layer stack. Each layer is either a **generator** (base shape) or an **erosion** pass. Layers evaluate bottom to top, and any layer or mask can use noise generators.

## Run

```
cd Experimental/LandscapeEditor
node Serve.mjs            # http://0.0.0.0:8080 (PORT and HOST override)
node Check/CheckLandscape.mjs   # headless checks, no browser needed
node Check/RenderPresetSheet.mjs /tmp/sheet 256 [Ids]   # preset PNG sheet for review
```

Serve over HTTP. Opening `index.html` through `file://` breaks ES module and worker loading.

## Layout

- **Left, Layer Stack.** Top of the list is the last layer applied. Eye icons toggle visibility. Filter field, and `+ Generator` / `+ Erosion` in the footer.
- **Centre, Viewport.** WebGL2 terrain with orbit (drag) and zoom (wheel). Perspective or Top. Satmap dropdown, shading (Satmap, Clay, Elevation ramp), Water, Contours and exaggeration. Undo, redo, exports and JSON save/open. The Presets drawer sits above the status bar.
- **Right, Inspector.** The landscape settings and statistics when nothing is selected. Otherwise a preview (output and mask), the layer stack card, the source or erosion card, rock hardness modulation, and the layer's masks.

Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.

## Layers

| Kind | Fields |
| --- | --- |
| Generator | Source type and seed, parameters, Amplitude (m), Offset (m), Blend, Opacity, masks |
| Erosion | Erosion type and seed, type-specific sliders, optional rock-hardness modulation, Blend, Opacity, masks |

Blend modes: Add, Subtract, Replace, Multiply, Maximum, Minimum. Erosion layers default to Replace and apply `prev + Opacity·Mask·(eroded − prev)`.

### Generators (base shapes)

Perlin fBm, Simplex fBm, Billow, Ridged multifractal, Hybrid multifractal, Mountain noise, Domain-warped fBm, Cellular, Dune field, Terraced plateau, Island falloff, Linear slope, Constant level. Each exposes its own sliders (scale, octaves, lacunarity, gain, warp and type-specific values).

### Masks

Each mask has enable, invert, strength (0–1) and seed. Masks multiply together per layer.

- Coastal falloff: inland, offshore or coastline band, with breakup.
- Altitude band: low, high and feather.
- Summit falloff: smooth mountain-top weighting that avoids hard contours.
- Slope band, Cliff face, Strata (stratified bands), Rift zone, Ridge protrusion.
- Noise gate: thresholded generator (uses a mask generator).

The Noise gate mask takes its own generator sub-card, so generators apply to masks as well as to base shapes and erosion modulation.

### Erosion types

Each type has its own parameter set in the inspector:

- Hydraulic droplets: droplet count, lifetime, inertia, capacity, erode and deposit rates, evaporation, gravity, radius.
- Stream power (fluvial): erodibility K, area and slope exponents, transport, deposition, iterations. Drainage-routed incision.
- Thermal talus: talus angle, rate, iterations. Mass-conserving, with outflow capped at half the donor's drop.
- Glacial carving: snowline, strength, ice threshold, cirque weight, smoothing.
- Aeolian wind: wind angle, strength, sand supply, saltation, repose.
- Wave-cut coast: reach, energy, undercut, talus.
- Stratified weathering: band height, hard-rock ratio, contrast, rate, talus.

Erosion layers carry a seed and optional rock-hardness modulation, which scales erodibility from a noise source.

## Satmaps

The satmap is a terrain-driven albedo, not a literal photo. Modes:

Composite (satellite), Elevation, Slope, Protrusions and hollows, Rivers and drainage, Sedimentation, Erosion intensity, Moisture, Coast distance.

Palettes: Temperate, Arid, Sandstone, Alpine, Himalayan, Volcanic, Coastal, Glacial. A palette sets the lowland to snow colours, plus snow line, vegetation, rockiness and wetness.

## Presets

Blank plain, Sandstone canyons, Sandstone cliffs, Coastal cliffs, Himalayan mountain, Icelandic, Alps, Snowy mountains, Rugged outcrops, Desert dunes, Rocky desert. Each is a full layer stack with a palette and sea level. Thumbnails render in a worker at 128².

## Evaluation and caching

`EvaluateProject` folds layers bottom-up and caches each stack prefix by content, so changing a top layer reuses everything below it. The worker keeps the latest project and drops superseded requests. Dragging sliders debounces recompute to about 220 ms.

## Export and persistence

- Export R16: 16-bit little-endian raw, normalised to the landscape's own min and max. The file name records the Z range in metres.
- Export satmap: current satmap as PNG.
- Save JSON / Open JSON: the complete project.
- The current landscape and view are stored in `localStorage` under `Frontier.LandscapeEditor.v1`.

## Known limitations

- The default resolution is 256². Cell size is WorldSize / N, so larger worlds need larger N for detail.
- Some presets show visible banding from the stratified and glacial operators (Alps, Himalayan). Tune those layers before relying on them for art.
- Terraced-plateau bases can leave flat discs that the erosion does not fully break up.
- Sea levels were calibrated visually at 256². Icelandic (77% land) and Coastal cliffs (93% land) are intentional but unvalidated against real coastlines.
- The Summit mask is inert on terrain below its 1200 m threshold; this is expected, not a bug.
- Checks cover ranges, determinism, cache reuse and stability. They do not measure realism. That still needs visual review.
