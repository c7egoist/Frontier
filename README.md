# Frontier Terrain Lab

A browser-based procedural landscape editor inspired by the current Frontier editor surface. It is a self-contained prototype with a non-destructive terrain layer stack, live height-field preview, masks, generators, material/signal synthesis, erosion controls, and editable landscape presets.

## Run

```bash
npm install
npm run dev -- --port 5173
```

Open the URL printed by Vite. Use `npm run build` to create a production build.

## What is included

- **Non-destructive stack** — height, erosion, river, sedimentation, and surface-signal layers can be selected, hidden, duplicated, or created from the layer menu.
- **Generator and mask controls** — multifractal, ridged, mountain, rift, dune, volcanic, and coastal terrain variants; masks including mountain/coastal falloffs, strata, rifts, cliffs, altitude, slope, drainage, and basin masks.
- **Erosion processes** — hydraulic, thermal, aeolian, glacial, and coastal modes expose their own context-sensitive physical controls.
- **Terrain signals** — a protrusion-aware material pass resolves vegetation, rock exposure, snow response, waterline, surface slope, rivers, and sediment instead of treating the surface as a literal satellite image.
- **Live preview** — a canvas-based height-field renderer with terrain, heightmap, flow/sediment, and erosion debug channels. Drag the preview to orbit and export the current preview PNG.
- **Preset library** — Sandstone canyons, Sandstone cliffs, Coastal cliffs, Himalayan range, Icelandic, Alps, Snowy mountains, Rugged outcrops, Desert dunes, and Rocky desert stacks.

The terrain view is a compact procedural preview intended to demonstrate layer relationships and authoring behavior; it does not require a backend or external GIS imagery.
