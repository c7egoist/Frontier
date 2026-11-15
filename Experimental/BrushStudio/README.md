# Brush Studio

This page rebuilds TextureStudio's paint brushes as a **Procreate-style Brush Studio** in the Project Zero editor's visual language, for texture painting. Like the other studio pages, it has no 3D workspace or renderer. Instead, a live 2D **Drawing Pad** shows exactly what the brush does to each PBR channel.

```
python3 Experimental/MaterialInspector/Serve.py       # serves the repo root on :8097
http://localhost:8097/Experimental/BrushStudio/
  ?brush=<catalogue id>   start on a brush, e.g. pencil-classic-yellow-hb
  ?tool=<tool id>         paint · smudge · erase · fill · stamp · gradient · text · curve · move · eyedropper
  ?section=<section id>   open a studio section, e.g. shape, grain, rendering
  ?popup=1                open the starting tool's own menu
```

## Layout

The page has two cards side by side, styled like the other studio pages: a dock nav pill, cards with a 22 px radius, DM Sans 300 type, amber highlights, and one shared CardKit for knobs, segments, switches and colour fields.

- **Brush Library** card:
  - Recent brushes.
  - Search.
  - The 102 TextureStudio catalogue instruments, grouped by family, each with a live preview stroke.
  - Your own duplicated or imported brushes, listed as *My brushes*.
  - An amber dot on any brush that differs from its reset point.
- **Studio** card, with three columns as in Procreate's Brush Studio:
  1. **Section rail.** Each section shows an amber count of the settings edited away from the reset point.
  2. **Settings.** Each group has a *Reset section* button, and each edited field has its own reset.
  3. **Drawing Pad.** The tool rail floats on top, with Procreate-style size and opacity sliders on the side. The pad also has:
     - Channel views (Colour / Rough / Metal / Height / Glow) and paper tones.
     - **Live** re-render: every stroke on the pad is redrawn with the brush as you edit it.
     - A **Preview** stroke.
     - Pad undo / redo / clear.
     - A stats footer: size, opacity, dabs, render ms, items and rendering mode.

## Studio sections (Procreate's Brush Studio, plus texture painting)

| Section | Groups |
| --- | --- |
| Stroke path | spacing, jitter lateral / linear, fall off |
| Stabilization | StreamLine (+ pressure), stabilization, motion filtering (+ expression) |
| Taper | pressure taper, touch taper (with linked ends), size / opacity / pressure / tip, tip animation, classic taper |
| Shape | 16 procedural sources, scatter / rotation / count / jitter / flips / azimuth, roundness (+ graph), tip falloff, filtering |
| Grain | 12 procedural grains, moving or texturized, scale / zoom / rotation / depth / offset / blend, filtering |
| Rendering | 6 modes (light → heavy glaze, uniform / intense blending), flow, wet edges, burnt edges, blend mode, luminance |
| Wet mix | dilution, charge, attack, pull, grade, blur (+ jitter), wetness jitter |
| Colour dynamics | stroke gradients and multicolour modes, stamp and stroke HSB jitter, colour pressure and tilt, opacity over the stroke, hue over the stroke |
| Dynamics | speed → size / opacity, size / opacity jitter, over-the-stroke behaviour |
| Stylus | pressure curve editor, pressure → size / opacity / flow / bleed / smoothing, tilt curve and tilt targets, mouse and touch simulation |
| Properties | stamp preview, orient to screen, preview scale, smudge, min / max size and opacity |
| **Materials** | which PBR channels the brush paints, plus roughness / metallic / height / emission values, each textured by the shape or grain |
| **Instrument** | the catalogue tool's own controls (shape, paint, bristle, grade, nib, ink…). Each control maps onto the studio settings, and the mapping is shown under the control |
| About this brush | name, author, created date, signature, brush data, and *Create new reset point* / *Reset all settings* |

In total the studio has 139 fields. Every value is normalised, so an imported brush can never contain an out-of-range value.

The Materials and Instrument sections go beyond Procreate's Brush Studio:

- **Materials** is there because this studio paints textures.
- **Instrument** keeps the TextureStudio tool menus' schema intact. Switching a control's option away and back restores the same settings, whatever order you touched the controls in.

## Per-tool popups

Each tool has its own menu. To open it, tap the active tool in the rail, the same way tapping the active brush opens the library in Procreate. The menu is a floating card with an arrow pointing to the tool. It has a reset button and closes with Esc. Settings marked as brush-bound edit the active brush directly, so the popup and the studio never disagree.

| Tool | Key | Groups |
| --- | --- | --- |
| Paint | B | brush card → Studio, size & opacity, colour discs + swatches, feel, pressure curve, texture-painting channels, symmetry & blend |
| Smudge | S | current brush or a finger, strength, finger painting, StreamLine, spacing |
| Erase | E | erase with the current brush or a catalogue eraser, tip, edge (soft / hard / grain), feel, which channels to erase |
| Fill | G | region / similar / all, threshold, feather, grow, colour or grain source, blend, material channels and values |
| Stamp | P | 16 shapes, click / drag / grid placement, size / rotation jitter, mirror, align to drag, look, material channels |
| Gradient | D | linear / radial / conic, pad / repeat / reflect, presets and stops, blend, limit to painted / empty, apply |
| Text | T | text, font / weight / italic / align, size / spacing / line height / arc / rotation, outline, material channels, place / apply |
| Curve | C | brush, smooth / polyline, closed loop, smoothness, pressure profile (even / taper / swell / fade), points, stroke |
| Move | V | everything / last item, U / V offset and nudge, scale, rotation, flips, clip / tile edges, apply |
| Eyedropper | I | sample → primary / secondary, point or area, current channel or composite, recent samples |

Pad keys:

- `[` / `]` change the brush size.
- Enter applies a gradient, text, curve or move.
- Backspace removes the last curve point.
- Ctrl+Z and Ctrl+Shift+Z undo and redo on the pad.
- Alt+Z undoes settings changes.
- Esc closes a popup.

## Files

| File | What it holds |
| --- | --- |
| `BrushModel.js` | Pure brush schema: shapes, grains, render and blend modes, the 14 sections and their fields, defaults, family presets, instrument mapping, set / reset / reset point / duplicate / export / import |
| `BrushEngine.js` | Pure stroke planner: stabilisation, spacing, tapers, jitter, dynamics, colour, and a seeded RNG, so a replayed stroke is identical |
| `Sources.js` | Procedural tips and grains (no bitmap files) with cached thumbnails. `SetCanvasFactory` lets the tests run without a DOM |
| `ToolModel.js` | The 10 tool popups, written as typed field groups like the studio sections, plus the curve path and pressure profiles |
| `Painter.js` | 2D renderer: stroke (grain, wet edges, blending, smudge, per-channel values), flood fill, stamp, gradient, text, move, height shading |
| `Pad.js` | The Drawing Pad: an op list (undoable clear, capped at 160 ops), live re-render, channel views, pointer / pen input with pressure and tilt, and stats |
| `BrushStudio.js` / `.css` | The two cards, every renderer and control binding, the popups and keyboard handling |
| `Engine/PaintToolCatalogue.js` | Byte-identical copy of TextureStudio's catalogue (102 instruments, schemas and artwork) |
| `Engine/BrushDynamics.js` | Verbatim extract of TextureStudio's `TexturePaintEngine.js` curves, HSL shifting, colour / opacity modes and gradient presets |

## Data

A brush exports as `*.brush.json` with schema `frontier.brush.v1`. The file holds:

- the catalogue `instrument` it came from;
- the instrument `params`;
- all 139 studio `values`;
- the `reset` point;
- name / author / signature.

Imports are normalised field by field. Unknown keys are dropped, and a foreign schema is rejected.

## Checks

```
TS_DIR=/path/to/TextureStudio node Experimental/BrushStudio/Scripts/CheckBrushStudio.mjs
JSDOM_DIR=/tmp/smoke node Experimental/BrushStudio/Scripts/SmokeBrushStudio.mjs      # npm i --prefix /tmp/smoke jsdom@25
```

- **`CheckBrushStudio.mjs`** checks the pure modules: schema, every instrument and every option, edits and resets, round trips, engine determinism and stabilisation, sources, tool popups, the curve tool, and the renderer on a pixel-less canvas. With `TS_DIR` set, it also confirms the copied engine files match TextureStudio.
- **`SmokeBrushStudio.mjs`** boots the page in jsdom and drives it end to end: library, every section and field type, the curve editor, all resets, duplicate / export / import, undo / redo, every pad tool, every tool popup and its controls, channel views and keyboard shortcuts.
