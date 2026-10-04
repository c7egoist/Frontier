# Nacre — Texture Studio

A browser-based texture-painting workspace built with plain HTML, CSS, Canvas 2D, and IndexedDB. No install step or remote assets are required.

## Run locally

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173`.

## Included workflow

- Paint and erase directly on a 1024 × 1024 texture, or switch to the live shaded 3D material preview and paint through its UV projection.
- Organize paint, fill, material-effect, editable text, and SVG decal layers. Toggle visibility and locks, adjust opacity/blend mode, reorder by dragging, duplicate, rename, and delete.
- Edit a metallic/roughness material with carbon, ceramic, anodized-metal, and polymer presets; base tint, roughness, metalness, clear coat, IOR, anisotropy, and five texture-channel toggles.
- Add editable text decals, import sanitized SVG files, drop an SVG into the decal panel, or place the built-in roundel, index, and signal marks.
- Undo and redo paint strokes, toggle UV guides, zoom, export a flattened PNG, and save/open a complete `.nacre.json` project.
- Drafts are saved locally in the browser using IndexedDB.

## Shortcuts

`B` brush · `E` eraser · `H` move/orbit · `I` sample color · `G` UV guides · `0` fit · `[` / `]` brush size · `Ctrl/⌘ Z` undo · `Ctrl/⌘ Shift Z` redo · `Ctrl/⌘ S` export project.
