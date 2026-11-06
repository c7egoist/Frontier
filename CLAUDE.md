# Frontier — Landscape Studio (Arena session)

## Pinned source reference (authoritative UI + SDF reference)
- UI / ProjectZero 3-column editor theme and layer-stack interaction:
  `https://github.com/c7egoist/Frontier/tree/arena%2F68c84c0d-frontier`
  (`src/app/style.css` `.tp-*` tokens, `src/erosion/layer-stack-ui.js`).
- Prior (rejected) attempt — do NOT copy its UI or tiled ocean:
  `https://github.com/SultanAladin/Frontier/tree/arena/6c0074b7-frontier`
  (`Experimental/LandscapeWorkspace`).

## Architecture (this prototype)
- `src/core/mask2d.js` — resolution-independent 2D mask: world-space capsule
  strokes; canvas is only a display raster; rebuild at any resolution.
- `src/core/landscape.js` — SDF landscape field. Per mask layer: region rect
  (+ box-selected sub-regions) → flat base slab from sea level → per-layer
  landform stack → smooth edge falloff (flat at sea level, no "heels") → closed
  3D SDF, unioned across layers. Emits matching GLSL for the GPU raymarcher.
- `src/core/landforms.js` — generators: fractal, multifractal, ridged
  multifractal, badlands, craters, ridge noise, sand dunes.
- `src/app/editor2d.js` — 2D paint editor (brush/erase/pan/box-region, zoom).
- `src/app/viewport3d.js` — WebGL2 raymarched SDF + procedural non-tiling
  ocean (world-space directional waves + noise-warped phase, no textures).
- `src/app/layerstack.js` / `src/app/inspector.js` — left Outliner (mask layers
  each with their own landform sub-stack) and right Inspector.

## Run
```bash
npm install
npm run dev    # http://localhost:5173
npm test
```
