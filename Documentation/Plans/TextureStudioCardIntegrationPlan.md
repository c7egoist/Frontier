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

## 6. Theme pass, channel audit, layer thumbnails, Brush Library grid

### 6.1 Channel audit — is every channel hooked to what it shows?

Each channel was driven from its card in the live studio and read back at the workspace or viewport.

| Area | Channels | Result before | Fix |
| :--- | :--- | :--- | :--- |
| Material Inspector → stage material | 29 (3 vector maps not probed) | 25 move the material. **Height (`reliefHeight`) went nowhere**: the stage shader never read it. Occlusion and Coat IOR reach shader uniforms (`uAoIntensity`, `uCoatIor`). Coverage only means something on a detail or coat stratum. Emissive colour shows only once Glow strength is above 0, which is by design. | `materials.js` adds a new `uReliefHeight` uniform that scales the relief normal (0.5 = 1×, so existing materials look the same) |
| Layer Inspector → paint engine layer (fill, material, generator) | 22 × 3 + per-channel opacity and blend | **66 / 66** land where the engine reads them | — |
| Brush Studio → workspace brush | per-tool channel stacks | **Not hooked**: only colour, size, opacity, flow, roughness, metalness and height travelled. The channel on/off maps (`paintChannels`, `eraseChannels`, `fillChannels`, `gradientChannels`, `textChannels`) and extended values (sheen, clearcoat …) were ignored. | `CardDock.ChannelPatch`: the active tool's stack sets that tool's channel map. Fill, stamp and text values go to the brush PBR fields and `extValues`. The paint brush's emissive strength sets the glow. |
| Map Baking card → baker | 18 maps | ids match the engine catalogue 18/18, and every request key is consumed. **The map open in the card did not change the map the stage inspects.** | `BakingWorkspace.inspectMap(id)` — the card's open map now drives the stage's inspected map |

### 6.2 Docked theme (imported panels only)

`CardDock.css` remaps the cards onto TextureStudio `:root` colours. The standalone card pages stay as they were.

- **Colours.** Every card grey is now written as `var(--pz-gN, #original)`, sorted into 9 bands by lightness. The change covers 159 declarations across Material / Outliner / Artwork / Bake / Paint / Brush CSS. The bands are unset outside the dock, so the original greys still apply there. Inside `.cd-host` and `.cd-brush-menu` they map to `--field`, `--panel`, `--card`, `--card-top` and `--raised`. Sliders use `--slider-fill` and `--slider-thumb`.
- **No outlines** on outliner cards, stats, filters, rows, the footer, metrics, folds, search, dropdowns or split values.
- **Icon colour colours only the glyph.** There is no tinted tile behind `pi-type`, `ol-icon`, `mi-mark`, `cs-on.lit`, `ai-glyph` or `bs-glyph`.
- **Toggles match the studio `.switch`.** On is white with a `#111` knob; off is `#232326`. Status discs are white instead of green.

### 6.3 Layer thumbnails

- `TexturePaintWorkspace` exposes `layerThumb(id)`, which returns a data URL from its existing thumbnail cache. It also exposes `watchThumbs(fn)`, which fires at most about 4 times a second when thumbnails are invalidated.
- `MountPaintOutliner(Host, Card, { thumb })` shows the real texture in each layer row. Folders keep their icon, and a checker shows through where a layer is still transparent.

### 6.4 Brush menu: Library section as a grid

- `BrushStudio.Mount(…, { library: "section" })` hides the side preset list. Each tool's section list now opens on **Library**, which shows that tool's presets as a grid:

| Tool | Library grid |
| :--- | :--- |
| Paint / Smudge / Curve | Brushes by family, drawn as engine stroke previews |
| Erase | Erasers |
| Fill | Colours + grains |
| Stamp | Shapes |
| Gradient | Gradient ramps |
| Text | Fonts, previewing the current text |

- Search filters the grid. Picking a tile sets the brush, eraser, fill source, shape, preset or font.
- The standalone Brush Studio page keeps its side library unchanged.

### Gates

| Gate | Result |
| :--- | :--- |
| `CheckCardDock.mjs` | **27 / 27** (9 new: relief uniform, theme ×3, bake inspect, layer thumbnails, Library grid, channel stack → brush, per-tool Library) |
| `TextureStudioValidation.mjs` | **29 / 29** |
| Brush 13/0 + 14/0 · Paint 15/0 + 0 errors · Material 17/0 · Outliners 11/0 · Bake 17/0 · Artwork 12/0 | green |

Screenshots: `Experimental/TextureStudio/Screenshots/cards-{paint,brush-library,brush-stamp,material}.png`.

## 7. Fill placement, interpolation, tool context menus

### 7.1 What the request was

| Ask | Where |
| :--- | :--- |
| Place gradients in the viewport. Radial has a movable centre, linear has movable stops along the line, and point field takes many smoothed points. | Stamp + Pattern (stage and card) |
| Interpolation types for every fill except Solid | Linear, radial and point field: fill, outline and ground |
| Same text context menu in both studios | The Stamp and Pattern Text tool opens Brush Studio's Text library, as in Texture Paint |
| Context menus for other tools | Shapes, Gradient, Pen and Curve |

### 7.2 Engine (`Engine/Patterns/ArtworkStackEngine.js`, copied to ArtworkInspector)

- **Stop-ramp interpolation** (`fillInterp` / `strokeInterp` / `background.fillInterp`): `linear`, `hermite`, `cubic` (Catmull-Rom), `bezier` and `step`.
  - Smooth modes are expanded into 40 sampled stops, so both Canvas2D and SVG get the same curve.
- **Point-field interpolation** (`fillPointGradient.interp`): `gaussian` (default), `linear`, `hermite`, `cubic` and `bezier` falloff kernels, plus `step` (the nearest point wins).
- **Placement** (`fillPlace` / `strokePlace` / `background.fillPlace`) = `{a, b, space?}` in frame-normalised units.
  - Linear runs a → b. Radial is centred on a, with b on its rim.
  - When no placement is set, the angle layout is used as before.
- **`space: "scene"`**: one ramp spans the whole canvas instead of repeating inside every instance of an arrayed or scattered layer.
  - Each instance maps the scene anchors into its own local space. It uses the un-wrapped position, so wrapped copies still match at the seam.
  - Canvas and SVG are kept identical, as before.

### 7.3 Stage interaction (`Workspaces/ArtworkGradientPlacement.js`, `ArtworkStackWorkspace.js`)

- **Gradient tool (F):**
  - Dragging on empty canvas lays the ramp.
  - The square end handles move it. Dragging the radial centre moves the whole ramp and keeps its rim.
  - Clicking the line adds a stop (up to 12).
  - Stop dots slide along the line. Double-clicking, Alt-clicking or pressing Delete removes a stop when more than 2 remain.
  - In point-field mode, a click adds a colour point.
- **Span rule:** the first placement on a layer with more than one instance defaults to **Whole canvas**. A single shape defaults to **Each shape**. Both menus can switch it, and the switch keeps the anchors in place on the canvas.
- Every gesture is one undo step.
- **Native inspector:** an Interpolation select plus Place / Reset placement after Gradient Angle, and a point-field Interpolation select after Global Spread.

### 7.4 Card (`Experimental/ArtworkInspector`)

- **Slot editor:**
  - Interpolation segments for every non-solid mode.
  - Point-field mode with per-point colour, falloff and field base.
  - Ramp spans (Each shape / Whole canvas).
  - Place in viewport and Reset placement.
- **Place in viewport:** when docked, `placeGradient(slot)` hands the slot to the stage gradient tool.
- **Model:** `AssignSlotInterp`, `AssignSlotSpace`, `AssignPointColour`, `AssignPointField` and `ResetSlotPlace`.

### 7.5 Tool context menus (`Workspaces/ArtworkToolMenu.js`)

| Tool (right-click on toolbar or stage) | Menu |
| :--- | :--- |
| Square / circle / diamond / triangle / star / hexagon / stripe | **Shapes**: motif grid (all motifs), fill Solid / Linear / Radial / Point plus colours, outline width and colour, apply to selection |
| Gradient | Target (Fill / Outline / Ground), source (Linear / Radial / Point field), interpolation, span, stop chips, reset placement |
| Pen / Curve | Curve smoothing, outline width and colour, fill closed paths |
| Text | Docked: **Brush Studio Text library** (font grid, the same menu as Texture Paint). The chosen font, weight and size apply to the selected text layer. Undocked: native text view. |

### 7.6 Gates

| Gate | Result |
| :--- | :--- |
| `CheckCardDock.mjs` | **32 / 32** (5 new: interpolation renders differ, viewport radial place and centre drag, tool context menus, Text tool to Brush Studio font library, card "Place in viewport" hand-off) |
| `TextureStudioValidation.mjs` | **29 / 29** (21d now drives the renamed Gradient tool in point-field mode) |
| `SmokeArtworkInspector.mjs` | 0 errors |

Screenshots: `Experimental/TextureStudio/Screenshots/{fill-linear-scene,fill-point-field,menu-gradient,menu-shapes}.png`.

### 7.7 Known limits

- Interpolated ramps are baked into 40 sampled stops. This is exact enough for albedo, but SVG exports carry more `<stop>` elements.
- Point-field placement uses document space, so arrayed instances share one field, as before.

## 8. No inspector preview; rows open side by side

### 8.1 Asks

- Drop the preview from the inspector. When docked, the Pattern / Stamp card no longer shows its document thumbnail, because the viewport is the preview. The standalone card page keeps its thumbnail, since it has no viewport.
- Panels open and close independently, so several stay open together: Text + Outline in Pattern / Stamp, Emissive + Roughness in Material, any channels in the Paint layer inspector and Brush Studio.

### 8.2 How

| Piece | Change |
| :--- | :--- |
| `MaterialInspector/ChannelStack.js` (shared by Material, Paint, Brush Studio) | `Ui.Opened` lists every open row and `Ui.Open` is the last one touched. Adds `StackRowOpen`, `StackReveal` and `StackFoldAll`. `cs-open` toggles only its own row. |
| `MaterialInspector.js` | `S.Opened` holds `"<stratum>:<channel>"`. `S.Channel` stays the row edits go to: a pointerdown or focus inside an open row makes it current (capture phase, ignored while a render puts focus back). Esc folds every row; the outliner opens a channel beside the others. |
| `ArtworkInspector.js` | Same model for property and modifier rows (`S.Opened` per layer, `S.Open` = current). Esc folds all. `RowOpen` and `FoldRows` are exposed on the hub. |
| `CardKit.Rebuild` + Material render | Focus restore is scoped to the focused row, because field ids repeat when several editors are open. |
| Bake card | Unchanged. Its one open map is what the viewport inspects. |

### 8.3 Gates

| Gate | Result |
| :--- | :--- |
| `CheckCardDock.mjs` | **36 / 36**. New checks: material emission + roughness open together and close independently; pattern rows open side by side; no docked preview thumbnail; paint channel rows side by side. The brush hand-off check now polls instead of using one 200 ms wait. |
| Smoke: Material 0 errors · Artwork 0 errors (new "rows open side by side") · Paint 0 · Brush 14/0 · Bake 0 · Outliners 10/0 | green |
| Model checks: Material, Artwork, Paint, Brush | 0 fails |
