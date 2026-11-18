# 🧩 Texture Studio: Docking the Project Zero Cards

> **Short answer.** The original **Texture Studio** (`Experimental/TextureStudio/`) keeps its viewports, its real material catalogue, its paint engine and its baker. The Project Zero cards built as separate pages now replace its side panels:
>
> - **Material:** the Material Outliner on the left and the new Material Inspector on the right.
> - **Pattern / Stamp:** the Artwork Outliner and the Pattern / Stamp card.
> - **Baking:** the Bake Outliner and the Map Baking card.
> - **Texture Paint:** the Paint (layers) Outliner and the Layer Inspector.
>
> **Right-clicking a brush tool** (or the canvas) opens the **Brush Studio card** as a context menu.
>
> Each card edits the workspace's own document, so the viewport updates live. No parallel copy of the document exists.

---

## 1. 📊 What exists

| Workspace | Texture Studio today | Card page (no viewport) | Shared document |
| :--- | :--- | :--- | :--- |
| Material | Viewport + right *Material Inspector* (Properties · Layer Stack tabs, pill cloud) | `MaterialInspector/` card + `MaterialOutliner` | ✅ same `params` + `Authoring` v2 (`MaterialModel.js` keeps the Texture Studio format) |
| Pattern · Stamp | Left layer stack + SVG stage + right inspector | `ArtworkInspector/` card + `ArtworkOutliner` | ✅ same artwork document (`ArtworkStackEngine.js` is byte-identical) |
| Baking | Viewport + right bake panel | `BakeInspector/` card + `BakeOutliner` | Card request → `runBake`'s `surface` / `volume` split |
| Texture Paint | Left layers + 3D / UV viewport + right Layer Inspector + right-click tool popup | `PaintInspector/` card + `PaintOutliner`, `BrushStudio/` | Paint layers are built by Texture Studio's own `TexturePaintEngine.js` |

## 2. 🧭 Decisions (taken as instructed)

| # | Question | Decision |
| :--- | :--- | :--- |
| 2.1 | Where | **In place, inside `Experimental/TextureStudio/`.** No new page. The workspace tabs, the content browser drawer and the status bar stay. |
| 2.2 | Old panels | The native side panels are **hidden, not deleted**. Their code still runs, so `TextureStudioValidation.mjs` and the cross-workspace bridges keep working. The card hosts take their place in the grid. |
| 2.3 | Theme | The cards keep their Project Zero look. Their page-level CSS (element rules, `:root` colours) is **scoped under `.pz-scope`** so it cannot restyle Texture Studio. The standalone card pages put `pz-scope` on `<body>` and look unchanged. |
| 2.4 | Card lifetime | Each card is **mounted once** and its host node is moved between workspace mounts. The Material and Artwork cards hold module state and bind document listeners, so remounting would duplicate them. |
| 2.5 | Brushes | The Brush Studio card opens as a **floating context menu** when you right-click a brush tool, the 3D / UV canvas or the inspector. Selecting a brush or editing a setting maps onto `state.brush` (size, opacity, flow, hardness, spacing, colour, jitter, tip), so the next stroke uses it. |

## 3. 🔌 Wiring

| Card → workspace | Workspace → card |
| :--- | :--- |
| Material: card `Subscribe` → `api.assignParams(P)` → `normalizeMaterial` → `syncMaterialLive()` | `applyAsset` / library pick → `Hub.Adopt(params)` |
| Artwork: card `Subscribe` → `api.assignDocument(doc)` → `evaluateAndRender(true)` | starter / asset drop → `Hub.Adopt(doc)` |
| Bake: `Options.Bake(request)` → the workspace's `runBake` with the card's `surface` / `volume` settings | bake results → card job state |
| Paint: card `Subscribe` → `api.assignLayers(doc)` → `refreshComposite()` | strokes and layer adds → `Hub.Adopt(doc)` |
| Brush: card change → `api.assignBrush(patch)` | tool change → card tool page |

## 4. ✔️ Gates

- The existing card checks and smokes still pass with `pz-scope`.
- A new `TextureStudio/Scripts/CheckCardDock.mjs`, with no DOM, checks:
  - every adapter round-trips a document;
  - the brush mapping covers the core keys.
- Headless Chromium screenshots of Material, Pattern, Paint (with the brush context menu) and Baking: `TextureStudio/Screenshots/cards-*.png`.

## 5. ✅ Results

Landed on `arena/28856115-frontier`. Texture Studio keeps its tabs, viewports, material catalogue, paint engine, baker,
ContentBrowser and status bar; the side panels are now the Project Zero cards.

| Workspace | Left | Right | Two-way hand-off |
| :--- | :--- | :--- | :--- |
| Material | Material Outliner | **new Material Inspector** | card edit → `assignParams` → live shader · library / drop / proposed strip → `Hub.Adopt` |
| Pattern, Stamp | Artwork Outliner | Pattern / Stamp card (one card, mode follows the tab) | card doc → `assignDocument` → SVG stage · stage edits → `Adopt(doc, mode)` |
| Baking | Bake queue | Map Baking card | card study → `useStudy` · card **Bake** → `bakeRequest` → the workspace's GPU / CPU baker (real maps, not a dry run) |
| Texture Paint | Paint Outliner | Layer Inspector | card layers → `assignLayers` (texels, masks, stamp rasters stay in the engine) · engine edits → `Adopt` |
| Texture Paint | — | **Brush Studio context menu** | right-click a brush tool button, the 3D / UV canvas or the inspector → floating Brush Studio; colour, size, opacity, flow, hardness, spacing, jitter, colour dynamics and PBR values → `assignBrush`; tool changes follow both ways |

### What changed

| File | Change |
| :--- | :--- |
| `TextureStudio/CardDock.js` · `CardDock.css` | new — seats every card once and moves its host between workspace mounts; rAF-coalesced pushes; brush menu |
| `TextureStudio/index.html` · `TextureStudio.js` | card CSS (scoped `.pz-scope`), `DockCards` / `UndockCards`, harness `card` / `workspaceApi` |
| `Workspaces/*Workspace.js` | `dock` + `assign*` / `on*Change` hooks; Paint routes right-click to `openBrushMenu` (falls back to the old popup when undocked) |
| `ViewportHeaderKit.js` | `data-tool-id` on tool buttons |
| Card modules | `Options.scoped` (`KeyReaches`), `Adopt`, Brush Studio `Subscribe` / `Adopt`, Paint `store: false` |
| `Engine/Materials/animatedVfxKernels.js` | **bug fix** — VFX outputs moved to file scope; the paint overlay wrapped them in a block, so the Texture Paint shader failed to compile and the paint viewport was black (already broken at HEAD) |
| `TexturePaintWorkspace.js` | readout showed `Brush · 0px` at start (pre-existing) |
| `TextureStudioValidation.mjs` | mock DOM `appendChild` / `insertBefore` (suite 7 failed at HEAD); 19a accepts the docked layout |

### Gates

| Gate | Result |
| :--- | :--- |
| `TextureStudio/Scripts/CheckCardDock.mjs` (browser) | **18 / 18** |
| `TextureStudioValidation.mjs` | **29 / 29** (HEAD stopped at suite 7) |
| Card suites (Material ×3, Artwork ×2, Bake ×2, Paint ×2, Brush ×2) | all green |
| Standalone card pages | unchanged look; Brush Studio page keys still global |

Screenshots: `Experimental/TextureStudio/Screenshots/cards-{material,pattern,paint,bake}.png`.

### Known limits

- Bake sets (multi-part templates) plan in the card but bake one study on the stage; the card says so.
- The Brush Studio's drawing pad viewport is left out of the menu — the Texture Paint viewport is the canvas.
- Card history is per card; the workspace's own undo stack is unchanged.
