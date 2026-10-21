# Frontier · Road Editor

Spline road authoring for the **Frontier Terrain Lab** engine
(`arena/471659c9-frontier`): plan-view editing, live 3D preview with a
drive-through camera, junctions, terrain drape, design validation, and
engine-convention exports — dressed in the **Exhibits UI system**
(`arena/01a0fd48-slate`).

Y-up, metres, north (−Z) up on the plan. No accounts, no backend; projects
autosave to the browser.

## Run

```sh
cd road-editor
npm install
npm run dev      # → http://localhost:5174
npm test         # 48 tests: topology/network-mesh/validation/codec/state + browser smoke (see below)
npm run build    # static dist/ — serve anywhere, no backend needed
```

First launch opens a starter pass with a loop, a spur, and one welded
junction. The **Samples** panel loads four authored networks, headed by a
diamond interchange with a bridge overpass, ramps, and guardrails.

## What it does

- **Spline roads** — centripetal Catmull-Rom centrelines, open or closed loops,
  per-point height + width scale. Draw (`D`), drag points, `Alt`+click inserts,
  double-click extends the nearest end.
- **Cross-sections** — 1–6 lanes, lane width, asymmetric shoulders, kerbs,
  camber, 4 surface presets, centre markings (single / double / dashed),
  edge lines, guardrails with posts.
- **Bridges & guardrails** — flag control points as bridge to deck the span
  (fascia, girders, piers/bents, abutments, parapet or rail); W-beam
  guardrails with posts and end treatments run both verges and switch to
  deck rails on bridges.
- **Vertical design** — per-point heights, grade smoothing, flatten, reverse;
  import a **heightmap PNG** (white = high) or grow **demo hills**, then
  **Drape points** or set **Conform → Drape** so the ribbon hugs the ground.
- **Intersections & interchanges** — crossings, T-touches, and shared nodes
  are detected automatically and paved as watertight junction patches with
  rounded corners, skirts, and stop-line paint; near-parallel legs warn.
  Grade-separated crossings stay open as **overpasses** with clearance
  checks, so diamonds and roundabout-free interchanges just work.
- **Junctions** — drag an endpoint onto another endpoint and they weld into a
  shared node; every road on the node follows it. Endpoints also snap onto
  other roads mid-span to form T-junctions.
- **Validation** — tight curves (<15 m warn / <7 m error), grades (>8% /
  >12%), self-crossings, pinched intersection angles, low overpass
  clearance, stacked points, dangling junctions. Click an issue to fly to
  it. Overpasses show clearance poles in 3D and a one-click **Build
  bridge** action in the Intersections panel.
- **3D preview** — orbit / top / wireframe / auto-rotate, heightfield terrain,
  PNG capture, and a **drive-through camera** (8/16/30 m/s) along any road.
- **History** — labelled undo/redo, dirty tracking, autosave, unsaved-work
  guard on navigation.

## Exports

| Format | Contents |
|---|---|
| `.road.json` | Versioned project. Reloadable here; readable by `integration/`. |
| `.obj` | Y-up metre mesh, `o Road__part` + `o junction_*` groups, engine header comments. Geometry only — same convention as Terrain Lab exports. |
| `.csv` | Centreline stations: `s,x,y,z,heading,grade,radius,width` per road. |
| `.png` | Plan capture or 3D capture. |

## Shortcuts

`V` select · `D` draw · `H` pan (`Space`+drag works everywhere) · `F` fit ·
`1/2/3` Plan/Split/3D · `Del` remove point · `Shift`+`Del` remove road ·
`Ctrl`+`Z` / `Ctrl`+`Shift`+`Z` undo/redo · `Ctrl`+`S` download project ·
`?` help.

## Engine integration

- `integration/frontier-road-import.js` — self-contained ESM loader:
  `buildRoadGroup(project, THREE, {terrain})` adds live road meshes to a
  Terrain Lab scene, with optional raycast drape. See `integration/README.md`.
- `.road.json` schema: `{format:'frontier-road-network', version:1,
  units:'meters', up:'+Y', roads[], junctions[], heightmap?}`. The parser is
  tolerant — it repairs and reports instead of refusing slightly-off files.

## Layout

```
index.html            workspace shell (header / panels / viewports / dock)
src/style.css         Exhibits design system (see below)
src/spline.js         Catmull-Rom sampling, arc-length, curvature, grade (pure)
src/topology.js       network analysis: runs, junctions, overpasses, bridges (pure)
src/geometry.js       network meshing (runs/patches/bridges/rails) + OBJ (pure)
src/validate.js       design checks (pure)
src/io.js             schema, codecs, heightfield sampling, starter scene
src/state.js          store: selection, tools, undo/redo, junctions, autosave
src/plan.js           2D canvas editor (tools, snapping, welding)
src/preview3d.js      Three.js preview + drive-through
src/panels.js         Exhibits controls, lists, inspector, toolbars, menus
src/main.js           boot + refresh flow + shortcuts + files
tests/                node --test regression suite (48 tests)

The browser tier (`tests/smoke.test.js`) boots the real `index.html` in jsdom and drives
panels + canvas gestures end to end. jsdom is optional: the test self-skips without it.
Enable with `npm i --no-save jsdom` (kept out of package.json so installs stay lean).
public/samples/       four authored networks (served + bundled)
integration/          engine-side loader + wiring guide
```

## UI provenance

Theme, tokens, and components are ported from the Exhibits branch:

- `ControlsPreview.html` — pill value boxes, pill sliders, segmented pills,
  switches, combo dropdowns with the blue hover bar, `#4a90e2` accent.
- `ColourPicker.html` — unified top header, right props with foldable
  sections, live status bar, fully-rounded pill language.
- `Frontier/Docs/Design/ViewportHeader.html` — viewport zones; the
  drive-transport capsule is option C's HUD idea.
- Terrain Lab itself — floating viewport toolbars, metrics strip, toast and
  icon idioms, OBJ/JSON/PNG export conventions.

## Limits

- Junctions weld **endpoints only** (loops have no ends to weld), though
  endpoints can land on other roads mid-span as T-junctions.
- Validation is geometric, not a traffic or structural simulation.
- OBJ carries no materials — paint and surfaces are vertex colours in the
  live view, plain geometry on disk.
