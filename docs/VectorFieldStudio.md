# Vector Field Studio — architecture and data contract

## 1. Purpose

The workspace is a long-lived analysis surface for three classes of field data:

1. **Wind / air** — continuous atmospheric flow around an obstacle, with gusts, wake and relief.
2. **Force fields** — superposed attractive/repulsive sources and potential/curl views.
3. **Terrain flow** — a heightfield with slope-driven runoff, rainfall, vegetation and flow-map layers.
4. **Generic grids** — imported CSV/JSON vector volumes, treated as first-class data rather than a visual preset.

The same field definition is used by GPU shaders and CPU analysis, so probe values, scalar slices and render colors remain traceable to one source of truth.

## 2. Source layout

| Path | Responsibility |
|---|---|
| `src/core/fields.js` | Procedural field functions, terrain height, gradients, curl/divergence and CPU sampling |
| `src/core/datasets.js` | CSV/JSON parsing, regular-grid reconstruction, Float32 3D texture data, sample CSV generator |
| `src/core/analysis.js` | Deterministic sample volume, statistics, histogram, probe derivatives |
| `src/core/palettes.js` | CPU color ramps, legend metadata and generated GLSL palette functions |
| `src/gpu/shaders.js` | Shared GLSL field evaluator plus glyph, terrain, tracer, rain and vegetation shaders |
| `src/gpu/FieldScene.js` | Three.js scene, orbit camera, instanced glyphs, float framebuffer compute, quality levels, probe marker |
| `src/ui/charts.js` | Sparkline, histogram, coherence bar and CPU-sampled scalar filmstrips |
| `src/main.js` | UI state, controls, import/export, telemetry loop, keyboard shortcuts |
| `src/styles.css` | Minimal dark interface, responsive glass panels and status bar |

## 3. GPU path

- **Vector glyphs** are `InstancedBufferGeometry` arrows. By default, each instance advances a structured anchor along the field in the vertex shader using simulation time, then samples the field at that live origin to build an orthonormal basis, scale by magnitude and color by the active scalar channel. Turning off **Animated arrows** returns to the fixed sampling grid.
- **Relief surface** is a 32 × 32 plane displaced in the vertex shader. Finite-difference normals, world-space grid lines, elevation contours and scalar color are computed in the fragment shader.
- **Flow tracers and arrows** share one deterministic float-RGBA seed-position texture. Their vertex shaders advance each seed along the field using simulation time and the same `sampleField()` used for orientation, with a smooth fade at each wrap. `EXT_color_buffer_float` support is detected and reported in the UI, but time-driven motion does not depend on ping-pong render targets.
- **Imported grids** are uploaded as `Data3DTexture` Float32 RGBA volumes. The shader performs manual trilinear interpolation with `texelFetch`, so no float-linear filtering extension is required.
- **Terrain responses** (rainfall, vegetation) are instanced GPU geometry whose positions and opacity are derived from the same height/rain/vegetation functions.

If `EXT_color_buffer_float` is unavailable, the UI still uses time-driven shader advection for arrows and tracers; glyphs, terrain and imported-grid sampling remain GPU-rendered.

## 4. Quality levels

| Level | Tracers | Glyph grid | Terrain vertices |
|---|---:|---:|---:|
| Low | 4,096 | 18 × 5 × 18 | 9,409 |
| Balanced | 12,544 | 26 × 7 × 26 | 25,921 |
| High | 20,736 | 32 × 9 × 32 | 40,401 |
| Ultra | 30,976 | 38 × 11 × 38 | 58,081 |

The live status bar shows actual counts. Quality can be changed without reloading; GPU resources are disposed and rebuilt.

## 5. Scalar channels

| Index | Channel | Meaning |
|---:|---|---|
| 0 | Velocity | `|v| / 6 m/s` color normalization |
| 1 | Pressure / Data scalar | Analytic potential or the imported scalar column |
| 2 | Vorticity | Finite-difference `|∇ × v|` |
| 3 | Divergence | Finite-difference `∇ · v`, diverging palette |
| 4 | Elevation | Terrain height |
| 5 | Rainfall | Procedural accumulation layer |
| 6 | Vegetation | Rain/slope/height response layer |

When a non-velocity channel is active, glyph and tracer colors are lightly magnitude-tinted for legibility; the relief surface and legend continue to show the selected channel exactly.

## 6. CSV contract

Header aliases are normalized to lowercase/underscore. Position aliases include `x/y/z`, `pos_x`, `coord_x`, `lon/lat`; vector aliases include `u/v/w`, `vx/vy/vz`, `velocity_x/y/z`, `vector_x/y/z`, `fx/fy/fz`. Optional scalar aliases include `scalar`, `pressure`, `rainfall`, `vegetation`, `magnitude`.

```csv
x,y,z,u,v,w,scalar
-12,0.5,-12,3.21,0.12,-0.48,0.42
-10.4,0.5,-12,3.18,0.11,-0.44,0.44
...
```

Rows must cover every cell of a regular 3D grid. A 2D grid is accepted by setting the missing axis count to one. Source coordinates are mapped by index to a canonical scene domain of approximately `[-12,12] × [0.5,10.5] × [-12,12]`; original source bounds are retained in dataset metadata and exported snapshots.

## 7. JSON contract

Separate channels:

```json
{
  "name": "Dipole",
  "dimensions": [16, 6, 16],
  "bounds": { "min": [0, 0, 0], "max": [1, 1, 1] },
  "u": [/* nx*ny*nz */],
  "v": [/* nx*ny*nz */],
  "w": [/* nx*ny*nz */],
  "scalar": [/* optional */]
}
```

Also accepted: `vectors: [[u,v,w,s], ...]`, flat `data: [u,v,w,u,v,w,...]` or `data: [u,v,w,s,...]`, and `fields: { u, v, w, scalar }`. A 2D `dimensions:[nx,nz]` form is interpreted as `[nx,1,nz]`.

## 8. Reproducible analysis

`computeFieldStats()` samples a deterministic 9 × 4 × 9 volume (or the imported dataset bounds), computes mean/peak speed, kinetic energy, mean absolute divergence, coherence and a 24-bin histogram. Scalar filmstrips are CPU-sampled 52 × 32 slices through the same field functions. The probe reports position, scaled vector, speed, scalar, curl, divergence, azimuth and inclination.

**Export snapshot** writes a JSON document containing simulation state, dataset metadata, statistics, 72-second history, active probe, layers and renderer status. It intentionally excludes the full imported texture array.

## 9. Controls

| Input | Action |
|---|---|
| Left drag / right drag / wheel | Orbit / pan / zoom |
| Click terrain | Place field probe |
| `1`–`4` | Wind, force, terrain, imported data |
| `Space` | Play/pause |
| `R` | Reset camera |
| `?` | Data and controls reference |
| Filmstrip | Select scalar channel |
| Animated arrows | Toggle live GPU advection vs. a fixed sampling grid |
| Slice plane | Restrict glyphs to a horizontal band |

## 10. Visual validation

`npm run validate:visual` runs headless Chromium/SwiftShader WebGL2 with `?quality=low&fps=5`, exercises presets, scalar channels, sample CSV import and a terrain probe, and writes `Exhibits/VectorFieldStudio/Capture/validation-report.json`. It also captures two isolated viewport frames 1.4 seconds apart with **Animated arrows** enabled, then repeats the pair with the toggle off. A 360 × 220 downsample counts pixels whose RGB sum changes by more than 45; the animated pair must change substantially more than the fixed-arrow control. The two animated frames are retained as `06-arrow-motion-a.png` and `07-arrow-motion-b.png`. The latest PASS measured 40.558% changed pixels for animated arrows versus 11.246% for the fixed-arrow control.

## 11. Current scope and limitations

- This is a browser workspace, not a native C++/Vulkan desktop module.
- Procedural fields are physically inspired visualization models, not validated CFD or weather solvers.
- Imported data must form a regular grid; unstructured meshes and time-varying volume sequences are not yet supported.
- The software-WebGL validation captures are correctness/appearance evidence, not a GPU performance benchmark.
