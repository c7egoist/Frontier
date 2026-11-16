# 🖌️ Texture Paint Workspace: Outliner, Inspector and the Reusable Channel Stack

> **Short answer:** add a sixth card page, **Paint**, to the Texturing dock (Material · Pattern · Stamp · Baking · Brush · **Paint**). It follows the same *outliner · card* layout as the other pages. Build one shared component, **`ChannelStack`**, styled exactly like the Material Inspector's channel list. It provides grouped dropdown heads, a row per channel, an enable switch on every row, and a card that opens per channel. The Paint inspector uses it, and so does every Brush Studio tool (Paint, Smudge, Erase, Fill, Stamp, Gradient, Text, Curve, Move, Eyedropper).

---

## 1. 📊 What exists today

| Piece | Where | State |
| :--- | :--- | :--- |
| Dock nav (5 pages) | `MaterialInspector/CardKit.js::DockNav` | ✔️ reuse: add the `paint` entry |
| Outliner card | `MaterialInspector/OutlinerKit.js` (`Shell`, `TreeRow`, `CreateOutliner`) | ✔️ reuse: search, filters, rename, drag reorder, keyboard |
| Inspector card controls | `CardKit.js` (`Knob`, `Dropdown`, `Segments`, `Toggle`, `StatTile`, `History`, `Rebuild`) | ✔️ reuse |
| Material channel list (the look to copy) | `MaterialInspector.js::GroupsHtml` / `RowHead` / `EditorHtml` | ⚠️ the design is right, but the code is private to the Material card. Extract it into `ChannelStack` |
| Brush channels | `BrushModel.js` `CHANNELS` (5) + the `channels` chip field; `ToolModel.js` `MaterialBlock` | ❌ flat chips plus separate value groups. Replace with `ChannelStack` |
| Paint document model (layers, masks, per-channel opacity and blend) | `TextureStudio/Engine/TexturePaintEngine.js::createPaintLayer` / `createPaintDocument` | ✔️ the reference schema for the Paint outliner |
| 22 paint channels | `TextureStudio/Engine/PbrChannelDefinitions.js` | ✔️ the channel catalogue (copy it byte-identical, as BrushStudio already does with `PaintToolCatalogue.js`) |

## 2. 🧭 Decisions

### 2.1 Where Texture Paint lives

| Option | Layout match | Keeps Brush Studio | Verdict |
| :--- | :--- | :--- | :--- |
| A: new **Paint** page `Experimental/PaintInspector/` (outliner · card), sixth dock entry | ✔️ same as Material / Pattern / Stamp / Baking | ✔️ unchanged page, gains `ChannelStack` | 🥇 |
| B: swap the Brush page's library for a layer outliner | ⚠️ loses the 102-brush library | ⚠️ | 🥈 |
| C: tabs inside the Brush card | ❌ crowds the studio card | ⚠️ | ❌ |

### 2.2 Which channels the stack lists

| Option | Matches Material design | Painter cost | Verdict |
| :--- | :--- | :--- | :--- |
| A: the 22 TextureStudio paint channels in 5 groups (Core · Surface · Coat · Optics · Emission). Core is open by default; the other groups fold with swatch peeks | ✔️ grouped like Material's 28 | Drawing Pad previews the 5 core views; the rest are stored and exported | 🥇 |
| B: keep today's 5 channels | ⚠️ one flat list | none | 🥈 |

### 2.3 The component's home

| Option | Reuse | Verdict |
| :--- | :--- | :--- |
| A: `Experimental/MaterialInspector/ChannelStack.js` + styles in `MaterialInspector.css`, beside CardKit / OutlinerKit (every card already imports from there) | ✔️ Material, Paint and Brush all import it | 🥇 |
| B: `Experimental/Shared/` | ⚠️ that is a new kit location | 🥈 |

## 3. 🧩 `ChannelStack`: the reusable component

`Experimental/MaterialInspector/ChannelStack.js`. It matches the Material Inspector's channel list:

- group heads with a chevron, name, count, an `n/m` on-count and six swatch peeks when folded;
- rows with a swatch, name and hint, a readout chip and an **enable switch**;
- the open row expands into that channel's card.

The full reference is in `Experimental/MaterialInspector/README.md § ChannelStack`.

```js
ChannelStack({
  Bind: "t|fill|stack",                    // field address root → data-bind="t|fill|stack@roughness.value"
  Value: { on: ["albedo"], per: { roughness: { value: 40, opacity: 100, blend: "Normal" } } },
  Card: TOOL_CARDS.fill,                   // [{ K, T: slider|seg|select|colour|switch|note, L, Def, For, Only, When, Ranged }] or Card(Ch)
  Ui: StackUi(),                           // { Open, Folds, Query } — the host keeps one per stack
  // optional: Title, Hint, Switch, Search, Bulk, FlatBelow, Tone, Bare, Empty, Albedo, DefaultOpen,
  //           Field / Swatch / Readout / Head / Editor / GroupBadge / Edited hooks, Acts: { Open, Group }
}) → html   ·   data-act: cs-open · cs-group · cs-toggle · cs-group-toggle · cs-bulk · cs-set · cs-search
```

- **Catalogue.** `PAINT_CHANNELS` is derived from the engine registry. `ALL_PAINT_CHANNELS` is read from a byte-identical copy of `TextureStudio/Engine/PbrChannelDefinitions.js`, and a check gates the copy.
  - 22 channels in 5 groups.
  - Scalars are displayed at engine × 100; `ToEngine` and `FromEngine` convert between the two.
- **Pure edits.** `StackAction` (all `cs-*` clicks), `ParseStackBind`, `AssignStackField`, `ToggleStackChannel`, `ToggleStackGroup`, `NormaliseStack`, `StackDefault`.
- **`LinkedStack({ Key, Link, Card, On })`.** For hosts whose flat keys stay the source of truth, such as Brush Studio's `mat.channels` and `mat.roughness`.
  - It maps those keys into the stack value.
  - Everything else is stored under `Key`, so old `.brush.json` files load unchanged.
- **Consumers.**
  - **Material** (`GroupsHtml`: `Switch:false`, `FlatBelow:8`, its own `Swatch` / `Head` / `Editor` / `GroupBadge` hooks, `Acts:{ Group:"group" }`).
  - **Brush** (Materials section and every tool studio).
  - **Paint** (layer channels).

| Tool | Per-channel card (`ToolModel.TOOL_CARDS`, `BrushModel.BRUSH_CARD`) |
| :--- | :--- |
| Paint (Brush Studio → Materials) | value / colour · strength · source (None / Shape / Grain) · amount · flow · blend |
| Fill | value · opacity · blend |
| Stamp | value from (Flat / Decal map) · value · opacity · blend |
| Text | value (height defaults to 35) · opacity |
| Gradient | start · end (channel range, `Ranged`) · opacity |
| Erase | strength · edge (Inherit / Soft / Hard) |
| Smudge | strength |
| Move | enable switch only |
| Curve · Eyedropper | no stack: Curve paints with the brush's channels; Eyedropper samples the pad |

## 4. 🗂️ Paint page: Outliner

| Part | Content |
| :--- | :--- |
| Head | `Layers` · *Texture Paint · mesh* · add-layer menu (Paint · Fill · Material · Stamp · Text · Generator · Folder) |
| Stats | **Layers** visible / total · **Channels** painted / 22 |
| Search + filter | by layer type, with mask, hidden, locked |
| Tree | Texture set (part) → layers top-first → each layer's **mask** and **stamps** as children. A row shows a kind icon, name, *blend · opacity · n ch*, channel peek dots, a visibility eye and a lock |
| Footer | resolution · layers · masks · painted channels |

## 5. 🔍 Paint page: Inspector (Layer Inspector)

| Section | Content |
| :--- | :--- |
| Header | layer name, kind badge, layer dropdown, undo / redo / reset |
| Stat tiles | Opacity · Channels on · Mask coverage |
| Layer | blend dropdown, opacity knob, part filter dropdown, lock |
| Type card | Fill: colour and values · Material: preset dropdown · Generator: preset, threshold, softness, noise · Stamp / Text: stamp list and transform |
| **Channels** | `ChannelStack` with per-channel enable, opacity and blend (`channelOpacity` / `channelBlends` from the reference schema) |
| Mask | enable, invert, opacity, add / remove |
| Footer | `.texpaint` export · JSON · Copy |

## 6. ✔️ Gates

| Gate | Check |
| :--- | :--- |
| `CheckPaintInspector.mjs` / `SmokePaintInspector.mjs` | model round trip, every layer kind, outliner add / rename / reorder / visibility, inspector sections, `ChannelStack` toggles and per-channel fields |
| `CheckBrushStudio` / `SmokeBrushStudio` updated | every tool's channel section uses `ChannelStack`; values normalise; old `.brush.json` channel arrays import |
| Screenshots | `PaintInspector/Screenshots/paint.png`, `paint-channels.png`; `BrushStudio/Screenshots/channels-*.png` |
| Docs | `ChannelStack` section in `Experimental/UI_COMPONENT_GUIDELINES.md` + READMEs |

## 7. ✅ Results (2026-11-15)

| Gate | Result |
| :--- | :--- |
| `CheckPaintInspector.mjs` | **15 / 15**: engine catalogue + byte-identical `PbrChannelDefinitions.js` copy, 7 layer types with all 22 engine keys, lossless round trip, hostile input, channel view ↔ engine fields, duplicate / remove / move (cycles refused), material overrides equal the engine's, mask / stats, purity |
| `SmokePaintInspector.mjs` | **9 steps, 0 errors** (jsdom): outliner select / add all types / eye / lock / drag / rename / delete / filters; every card section and type card; `ChannelStack` open / value / colour / opacity / blend / switch / group / bulk / search; lock guard; mask; undo / redo / export / copy / reset / import |
| `CheckBrushStudio` / `SmokeBrushStudio` | 13 / 13 · 14 passed, 0 errors (the channel stacks step covers the brush and every channel-writing tool) |
| Material regression | `CheckMaterialInspector` 17 / 17 (interop byte-identical) · `SmokeMaterialInspector` 0 errors · `SmokeOutliners` 11 passed. `GroupsHtml` now renders through `ChannelStack` with no visual change |
| Bake regression | `CheckBakeInspector` 17 / 17 · `SmokeBakeInspector` 0 errors |
| Pages | Material, Pattern, Stamp, Baking, Brush and Paint load in Chromium with no page errors; all six show the dock pill `Material · Pattern · Stamp · Baking · Brush · Paint` |
| Screenshots | `PaintInspector/Screenshots/{paint,paint-channels,paint-text}.png` · `BrushStudio/Screenshots/channels-brush.png` |
| Docs | `UI_COMPONENT_GUIDELINES.md § Shared texturing components` · `MaterialInspector/README.md § ChannelStack` · `BrushStudio/README.md § Channels per tool` · `PaintInspector/README.md` · `Experimental/README.md` · `Experimental/index.html` |

**Engine reuse.**

- `PaintModel.js` creates and repairs layers only through TextureStudio's `createPaintDocument` / `createPaintLayer`, and uses `PAINT_BLENDS`, `PAINT_MESH_PRESETS`, `createMaterialLayerOverridesFromPreset` and the 168 `materials.js` presets.
- The channel catalogue is the engine's `PbrChannelDefinitions.js`.
- No parallel paint model or channel list was written.

**Naming.** New identifiers follow `BannedWordsVocabulary.md`:

- the edit verbs are `Assign*` / `Toggle*`;
- the boolean query is `QueryLayerValues`;
- `LAYER_TYPE*` replaces `Kind`, `Icon` replaces `Glyph`, `EnclosingId` replaces `ParentId`, and the shared object is `Inspector` rather than `Hub`.

Existing page code was not renamed.

