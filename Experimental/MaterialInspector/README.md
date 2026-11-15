# Material Inspector

This is the Material workspace inspector from **TextureStudio** (`unassignedinbox/Frontier`, branch `arena/6eeea758-frontier`), rebuilt as a **single card** in the Project Zero editor style. It has no workspace, viewport or renderer.

```
python3 Experimental/MaterialInspector/Serve.py        # http://0.0.0.0:8097/
```

## What changed from the TextureStudio inspector

| TextureStudio | This card |
| --- | --- |
| Two tabs: *Properties* and *Layer Stack*. | One card. The strata are a compact stack inside it. |
| A cloud of 28 removable channel pills, followed by an "Inspect Channel" dropdown, a "Source" dropdown, a "Generator" dropdown and a column of sliders. | One quiet row per channel showing its live value. Rows are grouped (Core, Specular, Coat, Sheen, Thin film, Volume, Emission), and groups without authored channels start folded. Opening a row expands **that one channel's** editor in place. |
| Source and generator are hidden behind dropdowns. | Source is a visible segment (Value · Field · Ramp · Image). The eight field generators are chips. Ramp shape is a segment. |
| "Drag pills to scrub values". | You can drag any scalar readout in the list, or the Roughness / Metalness tiles, without opening anything. Shift gives fine control. |
| Separate "Surface Albedo & Microfacet" sliders that duplicate channels. | Channels *are* the values. Only the stratum's own knobs (finish, coat orange peel, flake dispersion and palette, detail presets) are in a folded section. |

Short strata (coat, flakes and new detail strata, with 8 or fewer channels) are shown as a flat list without group heads.

## Card anatomy

1. **Identity.** Editable material name, catalog label and library picker.
2. **Metric trio.** Roughness, Metalness and Strata. The first two can be scrubbed.
3. **Strata** (top → bottom):
   - The dot toggles a stratum on or off.
   - Click a stratum to select it; double-click to rename it.
   - `+ Detail` adds a masked detail stratum, which you can remove again.
4. **Channels.** Filter, `+ Channel` (adds a missing channel; the list keeps registry order), and grouped rows. One row is open at a time:
   - **Value:** a slider pill with a numeric field, a colour field with hex input, or X/Y/Z inputs for vectors.
   - **Field:** live preview, generator chips, Scale / Seed / Angle / Contrast, and a colour ramp (or the camouflage palette).
   - **Ramp:** linear, radial or conic, with angle and stops.
   - **Image:** drop or choose a tile. It is resampled to a PNG of at most 256 px and embedded.
   - For non-value sources there is also a *Base value* control and a *Drive directly* switch.
   - The footer shows the parameter address and a Remove button.
5. **Stratum knobs** (folded).
6. **Export:** `.material` TOML, JSON (`alloy.material.v6`), or Copy.

Keyboard: ↑ / ↓ move between channel rows. Esc closes the open editor. Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo.

## Data and compatibility

- **`MaterialModel.js`** is pure (no DOM). It keeps the TextureStudio document format unchanged:
  - flat look-dev parameters (`color`, `roughness`, `coat`, …);
  - `Authoring` v2 (`Layers`, `Generators`, `Inputs`, `Sources`, …);
  - the same `ChannelAddress` carrier rules: surface → targets, coat → `coat*`, flakes → `flake-output:*`, detail → `layer:<id>:*`.
- **`Engine/FieldSpecification.js`** and **`Engine/textureSource.js`** are byte-identical copies from TextureStudio.
- Every material is stored per id under `localStorage["Frontier.MaterialInspector.v1:<id>"]`. Changes sync live between open windows.
- `?material=<id>` opens a specific catalog entry.
- The catalog is a short slice of the TextureStudio library: Derez Lattice Dissolve, Candy Crimson, Brushed Titanium, Molten Magma Crust and Woodland Camouflage · Smooth. Together they cover every stratum model and source kind.

## Checks

```
node Experimental/MaterialInspector/Scripts/CheckMaterialInspector.mjs
JSDOM_DIR=/tmp/smoke node Experimental/MaterialInspector/Scripts/SmokeMaterialInspector.mjs   # npm i --prefix /tmp/smoke jsdom@25
```

If `TS_DIR` points at a TextureStudio checkout (`…/Experimental/TextureStudio`), the check script also confirms two things:

- the copied engine files are unchanged;
- TextureStudio's own `NormalizeMaterialAuthoring` accepts every document this card exports.
