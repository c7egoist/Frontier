# Asset Infographic

A standalone, dependency-free dashboard page for browsing a catalogue of assets. The layout is modelled on the dark "Traffic Management" reference in `Reference/InfographicReference.jpg`:

- a glass column on the left: category chips, status tiles, a metric chart, a feature card and the LOD chain
- a relief atlas on the right with asset pins, a large headline, the asset picker, layer modes, search and a detail panel

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
| `Assets[]` | `{Id, Label, Category, Status, Atlas:[u,v], Icon, Triangles, LodLevels or Lods[], TextureMb, Materials, Instances, BudgetUse, Owner, Updated, Tags[]}` |

`Atlas` is a 0–1 position on the backdrop. `BudgetUse` is a fraction: above 0.85 shows a warning and above 1 means over budget.

Icons: `boulder terrain knot column character vehicle tree crate building lamp bus generic`.

## Interaction

- Click a pin, use the picker, or press **← / →** to select an asset.
- Drag to pan the atlas and scroll to zoom.
- Chips and status tiles toggle filters, and search filters by label, id or tag.
- The **Status / Category / Budget** buttons recolour the pins.
- The ↗ next to the metric title cycles through the metrics.
- **Esc** closes the editor and the picker.
