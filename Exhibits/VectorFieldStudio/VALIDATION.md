# Field Studio Validation

## Pure checks

Command:

```bash
cd Exhibits/VectorFieldStudio
npm test
```

Result: **11 passed, 0 failed**.

| Check | Result |
|---|---|
| Terrain heightfield, mesh, data texture, bilinear sampling | ✔️ |
| Tileable 3D noise volume and finite curl | ✔️ |
| Wind / force / terrain field vectors finite | ✔️ |
| Attractor, repulsor, and vortex direction | ✔️ |
| Probe readout finite and includes terrain channels | ✔️ |
| Vegetation and glyph bases above terrain | ✔️ |
| Matrix inverse and projection round-trip | ✔️ |
| Ray-heightfield intersection | ✔️ |
| State sanitisation and clamping | ✔️ |
| Mode preset visibility | ✔️ |
| Scalar helpers and camera eye | ✔️ |

## Browser validation

| Item | Value |
|---|---|
| Browser | Chromium 153 headless shell |
| Graphics | ANGLE / SwiftShader Vulkan (software) |
| Viewport | 1440 × 900, device scale 1 |
| Canvas | 860 × 826 CSS, 860 × 826 drawing buffer |
| WebGL | WebGL 2.0, `RGBA32F` render targets |
| Console | No application errors or warnings |

### Initial state

| Item | Value |
|---|---|
| Mode | Wind |
| Particles | 65,536 |
| Rain drops | 16,384 |
| Vegetation blades | 12,744 |
| Glyphs | 864 |
| Outliner rows | 15 |
| Inspector sections | 4 |
| Legend | Wind speed, 0–35 m/s |

### Interactions

| Interaction | Result |
|---|---|
| Force mode | Mode, inspector, legend, sources, slice, glyphs, streamlines updated |
| Terrain mode | Mode, inspector, legend, rain, vegetation, surface flow updated |
| Storm Cell preset | Wind speed 30, terrain seed 19, ice ramp applied |
| Quality change | 147,456 particles after selecting Quality |
| Hide outliner | Outliner hidden; workspace columns `1120px 320px` |
| Hide inspector | Inspector hidden; workspace columns `260px 1180px` |
| Save / load roundtrip | Mode, quality, terrain seed, wind speed, and particle count preserved |
| Probe | Placed at `[7.9, 10.0, 15.7]`; vector `[10.55, 4.24, 2.81]`; magnitude `11.71 u` |
| Force source toggle | Attractor disabled; source row and outliner updated |
| Glyph colour ramp | Changed to ice |
| Probe marker toggle | `showProbe` false; marker and label hidden |
| Help modal | Opens and closes with Escape |
| Responsive 1024 | `230px 504px 290px` |
| Responsive 800 | `510px 290px`; outliner hidden |
| Responsive 600 | `600px`; outliner and inspector hidden |

### Pixel checks

| Mode | Viewport mean luma | Max luma | Non-black fraction |
|---|---|---|---|
| Wind | 67.9 | 239 | 0.983 |
| Force | 63.7 | 255 | 0.983 |
| Terrain | 63.6 | 236 | 0.983 |

The readback was performed only by the validation script. The application itself does not read
back the rendered image.

## Evidence

| File | Content |
|---|---|
| `Results/wind.png` | Wind mode, 1440 × 900 |
| `Results/force.png` | Force mode with slice, glyphs, and streamlines |
| `Results/terrain.png` | Terrain mode with rain, vegetation, and surface flow |
| `Results/probe.png` | Probe marker and label |
| `Results/responsive.png` | 600 × 768 responsive layout |

## Known limitations

- The browser validation used SwiftShader; hardware-GPU timing and feature support will differ.
- The CPU probe and statistics use the 8-bit noise volume, so they are approximate against the
  GPU field.
- The app is a web exhibit. The native C++ editor is not built or modified by this change.
- Force sources are limited to eight.
- The terrain is a 256² heightfield, not a streaming terrain system.
