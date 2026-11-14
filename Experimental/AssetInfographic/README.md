# Asset Infographic

A standalone, dependency-free dashboard page for browsing a catalogue of assets. The layout is modelled on the dark "Traffic Management" reference in `Reference/InfographicReference.jpg`:

- a glass column on the left: category chips, status tiles, a metric chart, a feature card and the LOD chain
- a relief atlas on the right with asset pins, a large headline, the asset picker, layer modes, search and a detail panel
- an interactive infographic **board** for every other nav section (the reference was only the starting point)

## Boards

| Section | What's on it |
|---|---|
| **Overview** | Atlas, pins, detail panel with budget ring, 12-week budget trend, status switcher and Compare |
| **Library** | Grid or list view; sort by name, triangles, texture, budget or updated (click again to reverse); group by category; inline bars, mini LOD bars, budget meters; ☆ to compare |
| **Budgets** | Semicircle gauges with live budget sliders; per-category bullet charts with **draggable budget markers** (or ← →); squarified **treemap** of texture, triangles or scene cost; top budget users; at-a-glance figures |
| **Analytics** | **Donut** of triangles by category (click to filter); bubble **scatter** (triangles × texture, size = instances) with **drag-to-brush**, which filters the whole dashboard; 7×24 streaming **heatmap** with crosshair hover; **radar** comparing up to 4 assets, or one asset against its category average; log-scale **LOD reduction** curves |
| **Pipeline** | Release **funnel** with stage-to-stage conversion; segmented readiness ring; **kanban** status board (drag cards between columns, or use ‹ ›); build-history bars |
| **Issues** | Issues derived automatically (failed validation, over or near budget, awaiting review, shallow LOD chain, high material count); severity tiles; expandable rows with **Locate**, a one-click **fix** and **Snooze**; stacked issues-by-owner bars; a live critical-issue badge on the nav pill |

The left column also shows a **texture memory composition** bar (click a segment to filter), the budget line, and a library-health ring.

## Global components

- **Command palette:** <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> or the *Jump to…* pill. Search assets, sections and actions.
- **Toasts with Undo:** every change (status moves, fixes, brushing) can be undone.
- **Compare tray:** ☆ or <kbd>C</kbd> adds the selected asset (up to 4), and *Open radar* jumps to the comparison.
- **Tooltips:** hover any chart element.
- **Shortcuts:** <kbd>1</kbd>–<kbd>6</kbd> switch sections, <kbd>C</kbd> compares, <kbd>L</kbd> locates the asset on the map, <kbd>X</kbd> clears filters, <kbd>/</kbd> jumps to search, <kbd>←</kbd>/<kbd>→</kbd> step through assets, <kbd>Esc</kbd> closes.

Filters (chips, status tiles, search, scatter brush) apply to every board. Edits made on boards (statuses, budgets, fixes) are written back into the catalogue JSON, so **Download** captures them.

## Run

```bash
python3 Experimental/AssetInfographic/Serve.py      # http://0.0.0.0:8094/
```

Any static server at the repo root works. The page is an ES module, so `file://` will not work.

## Use your own assets

The catalogue is plain JSON. You can change it in three ways:

1. **Edit** (top right) opens the JSON editor. Changes apply live and are saved to `localStorage`. **Download** exports the file and **Reset** restores the default catalogue.
2. **Import JSON**, or drag a `.json` file onto the page.
3. **Background**, or drag an image onto the page, swaps the procedural relief for your own map or screenshot. You can also set `"Background": "url"` in the JSON.

`DefaultCatalogue.js` shows every field. The essentials:

| Field | Meaning |
|---|---|
| `Sections[]` | Top nav pills: `{Label, Headline, Metric}`. `Metric` is the index of the chart that section shows |
| `Categories[]` | `{Key, Label, Icon, Tones:[a,b]}`. The first four become chips |
| `Statuses[]` / `HighlightStatuses` | `{Key, Label, Tone: ok·warn·bad·info·idle, Hint}`. Two keys become the large tiles |
| `Metrics[]` | `{Title, Unit, Target, High, Low, Range, Ticks, Axis, Series?}`. Values above `High` are highlighted in white, values below `Low` in orange. Without a `Series`, a trace is generated from `Seed`/`Base`/`PeakAt`/`DipAt` |
| `Budgets` | `{TextureMb, Triangles, Categories:{Key: MB}}`. Optional; defaults to the current use plus ~10–15% |
| `Sections[].Board` | Optional: `Atlas`, `Library`, `Budgets`, `Analytics`, `Pipeline` or `Issues`. If omitted, it is inferred from the label |
| `Assets[]` | `{Id, Label, Category, Status, Atlas:[u,v], Icon, Triangles, LodLevels or Lods[], TextureMb, Materials, Instances, BudgetUse, Owner, Updated, Tags[]}` |

`Atlas` is a 0–1 position on the backdrop. `BudgetUse` is a fraction: above 0.85 shows a warning and above 1 means over budget.

Icons: `boulder terrain knot column character vehicle tree crate building lamp bus generic`.

## Interaction (Overview)

- Click a pin, use the picker, or press **← / →** to select an asset.
- Drag to pan the atlas and scroll to zoom.
- Chips and status tiles toggle filters, and search filters by label, id or tag.
- The **Status / Category / Budget** buttons recolour the pins.
- The ↗ next to the metric title cycles through the metrics.
- **Esc** closes the editor and the picker.

## Files

`index.html` · `AssetInfographic.css` · `AssetInfographic.js` (app, atlas, filters) · `Boards.js` (section boards) · `Components.js` (palette, toasts, tooltip, count-up) · `Kit.js` (shared helpers, treemap, arcs) · `DefaultCatalogue.js`
