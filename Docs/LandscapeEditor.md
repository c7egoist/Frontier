# Landscape Editor

A browser heightmap editor built on a layer stack. Layout and styling follow the Frontier
native editor UI: dark panels, pill sliders, DM Sans, and engine icons.
Source lives in `Experimental/LandscapeEditor/`.

## Run it

```
cd Experimental/LandscapeEditor
npm install
npm run build        # writes app.js, app.css, worker.js next to index.html
npm run serve        # http://localhost:8080
npm test             # engine tests (node:test)
npm run proof        # renders every preset to Docs/LandscapeEditorEvidence/
```

## Layout

- **Layer stack** (left). Height layers run first, top to bottom. Satmap layers colour the
  finished terrain afterwards. Each row has show/hide, move, duplicate and delete.
- **Viewport** (centre). *Map* shows a top-down view with a selectable channel. *Perspective*
  is a voxel ray-march: drag to orbit, scroll to change camera height.
- **Inspector** (right). With nothing selected: terrain scale, sea level, seed, sun.
  With a layer selected: its type (dropdown), its own parameter sliders, blend and opacity,
  its masks, and a readout with timing.

## Layer types

| Category | Types | What it does |
| --- | --- | --- |
| Base shape | Perlin fBm, Multifractal, Ridged, Mountain range, Billow, Voronoi terraces, Island, Flat | Generates the field. Amplitude and base level scale it. Blend with layers below: replace, add, subtract, multiply, max, min, average. |
| Erosion | Hydraulic (rain), Thermal (talus), Stream power (fluvial), Aeolian (wind & dunes), Glacial (U-valley) | Each has its own sliders. Erosion deposits sediment, which feeds the sedimentation channel. |
| Modifier | Terrace/strata, Rift carve, Smooth, Sharpen ridges, Cliff sculpt | Reshapes height directly. |
| Satmap | Terrain channel or generator, palette, contrast, bias, breakup, blend mode | Colours the terrain. Channels: altitude, slope, protrusion (convexity), rivers (drainage), sedimentation, wetness, sun exposure. |

## Masks

Any layer can carry several masks. Each mask has its own sliders, an invert toggle,
strength, and a combine operator (multiply, add, subtract, max, min).

- **Coastal falloff**: fades from the shoreline inland, or offshore for a shelf. Jitter breaks up the shore.
- **Mountain falloff**: smooth altitude band with summit roll-off, so the effect never cuts off in a hard line.
- **Slope**, **Cliffs** (narrow steep bands with breakup), **Ridges** (protrusion above surroundings).
- **Stratify (strata)**: bedding planes at a set interval, bent by warp, with ledge share and sharpness.
- **Rift lines**: thin fault zones from zero crossings of warped noise.
- **Generator noise**: any generator used as a mask.

## Presets

Canyons (sandstone), Sandstone cliffs, Coastal cliffs, Himalayan mountains, Icelandic highlands,
Alps, Snowy mountains, Rugged outcrops, Desert dunes, Rocky desert.

## Files

- `src/engine/` is pure JavaScript, with no DOM. Runs in the worker, the tests and the proof script.
  - `generators.js`, `masks.js`, `erosion.js`, `modifiers.js`, `satmap.js`
  - `evaluate.js` runs the stack with a cache keyed on every layer above each layer.
  - `presets.js`, `document.js`, `schema.js` (parameter descriptors that drive every slider)
- `src/ui/` is React, with `main.jsx` the app, `Controls.jsx` the widgets, and `styles.css`.
- `src/worker.js` runs evaluation off the UI thread.

## Known limits

- Results are visually tuned by eye only. Presets are starting points, not calibrated to real survey data.
- Aeolian and glacial erosion are approximations of their physical processes, not full simulations.
- Thermal relaxation is diffusive. Large cliffs need hundreds of iterations to reach talus.
- Snow satmaps on some presets show concentric banding. Not yet diagnosed.
- The browser UI was not exercised in a live browser in this session. The engine is tested in Node.
