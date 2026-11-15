# Fracture Editor

A UI redesign of the per-object **Fracture** editor from Frontier-OLD's Project Zero editor
(`arena/bc062d35-frontier-old`, `Experimental/ProjectZeroEditor`). This covers **the UI only**. The section view is a
schematic that shows piece count, size spread, impact focus and material character. It is not the runtime fracture
solver and does no 3D rendering.

```
python3 Experimental/FractureEditor/Serve.py         # http://0.0.0.0:8096/ → /Experimental/FractureEditor/
```

It is plain ES modules with no build step and no dependencies. Fonts are shared with `../ComponentViewer/Fonts`. The
look is the same Project Zero language as the Component Viewer: charcoal docks on a 2 px seam, pill sliders, white
active segments and amber (#ffb238) for selection and the impact point.

## What changed from the old UI

| Old (Project Zero) | Redesign |
|---|---|
| A small inspector card plus an editor in a separate pop-up window (opened with ↗) | One window. The **Objects** list, the **section** and the **Recipe** sit side by side, and an **Inspector card** tab shows the compact card editing the same recipe |
| One object at a time; you had to find it in the outliner | An object list with a state pill per object (Off · Live · Unbaked · Stale · SDF pending · Baked), search, filters (All / On / Needs bake) and **Bake N objects** |
| Material as a dropdown | Six material tiles, each with a one-line note on how it breaks (concrete rubble, stone slabs, wood splinters, radial glass, tempered dice, tough ABS) |
| Energy as a raw number | A cubic slider (most of the travel goes to the useful low range), shown in J or kJ, with **Tap / Strike / Impact / Blast** presets |
| Piece ceiling and minimum size with no feedback | A **budget meter** shows what energy asks for, what the ceiling allows and what the minimum size allows, and highlights the one that decides the piece count |
| Impact X/Y/Z number fields only | Drag the amber point on the section, nudge it with the arrow keys (Shift for ×10), or type it in. **Centre** resets it |
| Status text "Open the editor to bake or refresh geometry." | A bake card with signature hash, piece count and age. When stale it lists **what changed** (e.g. `Material Concrete → Glass`) and offers **Revert** (restore the baked recipe) or **Rebake** |
| SDF toggle and resolution select | The same controls, plus a memory breakdown (pieces, then `N × res³ × 2 B` of R16F, then total) |
| No undo | Undo and redo per object (Ctrl Z / Ctrl Shift Z). A slider drag or impact drag counts as one step |
| — | Shade the pieces by **Material**, **Size** (density ramp) or **Release** order from the impact. An **Explode** preview pulls them apart (preview only, not saved) |

Pieces are drawn as filled shards with gaps, with no outline strokes, no wireframe and no footprint.

## Compatibility

Storage is byte-compatible with the old editor, so recipes move both ways:

- Key `Frontier.Fracture.v2:<objectId>` → `{ Owner: {Id, Name, Primitive, Scale}, Settings }`
- Same defaults and clamps: Energy 0–50 000, Seed 1–999 999 (integer), Ceiling 2–160 (integer), Minimum size 0.002–0.3,
  impact ±1000. SDF resolution is 32, 64 or 128.
- Same materials (`concrete rock wood glass tempered plastic`).
- Same bake signature: `{Revision: 2, Primitive, Scale, Recipe}`. It ignores Enabled, Mode, PieceSdf, SdfResolution,
  Baked and EditedAt, so turning on SDF or changing its resolution only marks the SDF as pending, not the pieces.
- `?object=<id>` opens that object, which is how the old launcher opened the editor window.
- `storage` events keep other open windows (another editor, or the Project Zero inspector) in sync live.

The section preview covers cubes, spheres, cylinders and cones, as before. A torus shows "Concave preview needs
decomposition." and imported meshes show "Source geometry preview is pending." The recipe still applies to both.

## Keys

`↑ ↓` object · `E` enable · `R` new seed · `B` bake · `1 2 3` shading · `V` editor or card · `?` shortcuts · Ctrl Z / Ctrl Shift Z

## Files

| File | Contents |
|---|---|
| `FractureModel.js` | Pure model: normalize/clamps, `describe`, `signature`, `bakeState`, `recipeDiff`, storage, piece budget, memory estimate, deterministic schematic shatter (2D Voronoi section) |
| `FractureEditor.js` | The UI: object list, section stage, recipe panel, bake flow (simulated progress), inspector card, undo, keys, sync |
| `FractureEditor.css` | Styles |
| `Icons.js` | Inline stroke icons |
| `index.html`, `Serve.py` | Page and preview server |
| `Scripts/CheckFractureEditor.mjs` | 18 model checks: compatibility, clamps, signature, states, diff, shatter invariants |
| `Scripts/SmokeFractureEditor.mjs` | jsdom drive of every UI path (`JSDOM_DIR=/tmp/smoke node …`) |
