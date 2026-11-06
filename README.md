# Frontier — Landscape Studio prototype

2D mask editor → SDF landscape workspace with a ProjectZero-style 3-column
editor UI (Outliner left, viewport center, Inspector right).

- **2D Mask Editor**: resolution-independent paint canvas (strokes stored as
  world-space capsules, rebuilt at any resolution), pan/zoom, box-select a
  region and add it to the active mask layer.
- **Landscape**: each mask layer becomes a closed 3D SDF solid (not a
  heightmap) with its own landform stack (fractal, multifractal, ridged,
  badlands, craters, ridge noise, sand dunes). Terrain is flat at sea level
  with smooth edge blur. WebGL2 raymarched viewport with a procedural,
  non-tiling ocean. WASD camera supported.

```bash
npm install
npm run dev
npm test
```

See `CLAUDE.md` for the pinned source references.
