# Frontier · Field Studio

A GPU-resident 3D vector field workspace for wind, force, and terrain analysis. The viewport,
outliner, and inspector are one clean surface: the field is evaluated on the GPU, while the
inspector exposes the parameters, live statistics, and a probe readout.

## Run

```bash
cd Exhibits/VectorFieldStudio
python3 -m http.server 8080 --bind 0.0.0.0
```

Open `http://localhost:8080/`. The app is a static ES-module exhibit; no build step or package
install is required. `npm start` runs the same server.

## Field models

| Mode | Field | What is visualised |
|---|---|---|
| Wind | Directional boundary flow + curl-noise turbulence + terrain lift | 3D streaklines above the heightfield, terrain deflection, vertical speed profile |
| Force | Attractors, repulsors, and vortices with local-support falloff | GPU particle streaks, vector glyphs, streamlines, equipotential slice |
| Terrain | Downhill heightfield gradient + flow accumulation | Surface flow streaks, channel rain, vegetation blades, water plane |

All three modes share the same particle state, slice, and glyph infrastructure. The active field
function is selected by a single `uMode` uniform, so switching modes does not rebuild the GPU
pipeline.

## Viewport and analysis

| Feature | Behaviour |
|---|---|
| Orbit / pan / zoom | Drag, shift-drag or right-drag, scroll |
| Focus | Double-click the terrain |
| Probe | `P` or the Probe button, then click the terrain |
| Play / pause | `Space` |
| Modes | `1` wind, `2` force, `3` terrain |
| Camera | `R` resets; ISO / TOP / FRONT presets |
| Grid | `G` toggles the ground grid |
| Screenshot | `S` or the camera button |
| Save / open | JSON scene download / upload; autosaves to local storage |

The inspector includes a magnitude histogram, a vertical wind profile, a probe vector dial, and
live field statistics. The probe reads the same field model as the GPU shaders.

## GPU pipeline

| Stage | Implementation |
|---|---|
| Particle state | Two RGBA32F pairs (position + age, previous position + seed), 256² by default |
| Advection | Full-screen fragment shader with MRT, ping-pong targets, fixed 60 Hz step |
| Curl noise | 64³ RGBA8 tileable 3D noise volume, sampled with `sampler3D` |
| Terrain data | 256² RGBA8: height, flow accumulation, vegetation, moisture |
| Slice | Per-fragment field evaluation, contour lines, potential or flow channel |
| Glyphs | Per-vertex field evaluation, 864 base points, magnitude-scaled length |
| Rain | Separate 128² RGBA32F ping-pong state, 16k drops |
| Vegetation | 30k blade candidates, density-revealed in the vertex shader |

The rendered image never reads back to the CPU. The CPU field mirror is used only for the probe,
histogram, vertical profile, and streamline geometry.

## Quality and performance

| Quality | Particle texture | Particles | Pixel ratio cap |
|---|---|---|---|
| Performance | 192² | 36,864 | 1.5 |
| Balanced | 256² | 65,536 | 1.5 |
| Quality | 384² | 147,456 | 2.0 |

The simulation uses a fixed 1/60 s step with at most three substeps per frame. Rain is a separate
16,384-drop state. Vegetation is capped at 30,000 blades. The renderer selects `RGBA32F` when
`EXT_color_buffer_float` is available and falls back to `RGBA16F`.

## Source map

| Path | Role |
|---|---|
| `src/FieldStudio.js` | Application shell, loop, persistence, overlays |
| `src/SceneState.js` | Serialisable scene state, modes, presets |
| `src/terrain.js` | Heightfield, flow accumulation, moisture, vegetation, mesh |
| `src/noise.js` | Tileable 3D noise volume and CPU trilinear sampler |
| `src/field.js` | CPU mirror of the field for probes, statistics, streamlines |
| `src/gpu/GpuField.js` | Particle and rain ping-pong simulation |
| `src/gpu/SceneRenderer.js` | Terrain, water, slice, glyphs, vegetation, sources, probe |
| `src/gpu/shaders/` | GLSL ES 3.00 field, terrain, particle, and overlay shaders |
| `src/OutlinerSequence.js` | Layer tree, visibility, selection |
| `src/InspectorPanel.js` | Schema-driven inspector, charts, probe readout |
| `src/ParameterSchema.js` | Inspector schema for every node |
| `src/ChartStrip.js` | Histogram, profile, and vector-dial canvases |
| `src/IconAtlas.js` | Inline stroke icons |

## Port notes

The field model is isolated in `src/field.js` and `src/gpu/shaders/common.js`. A native Vulkan/Slang
port can reuse the same parameter names and the same three field branches. The UI parameter schema
is data-driven and maps directly to the native inspector controls. The terrain data layout
(height, flow, vegetation, moisture) is a compact RGBA8 texture that can be uploaded to a Vulkan
image with the same channel order.

## Validation

See `VALIDATION.md`. The pure field and terrain tests run with `npm test`. The browser validation
used headless Chromium with SwiftShader and exercised all three modes, presets, quality changes,
save/load, probe placement, and responsive layouts.

## Limitations

- This is a browser exhibit, not the native C++ editor.
- The CPU probe and statistics use the 8-bit noise volume, so they are close to, not bit-identical
  with, the GPU field.
- Force sources are limited to eight.
- The terrain is a 256² heightfield; it is not a streaming terrain system.
- The browser validation used software Vulkan (SwiftShader); hardware-GPU performance will differ.
