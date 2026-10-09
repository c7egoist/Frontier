# Frontier Road Editor

A browser road designer for the Frontier engine. It is a static site made of plain ES modules: there is no build step and no npm dependency at runtime. three.js r183.2 is vendored under `vendor/three/`.

Open it through any static server (ES modules do not load from `file://`):

```
python3 -m http.server 8000 --directory road-editor
# then open http://localhost:8000/
```

Or open the hosted copy on raw.githack:

```
https://raw.githack.com/c7egoist/Frontier/arena/9a1993b2-frontier/road-editor/index.html
```

## What it does

- **Plan and perspective in one split view.** The 2D plan (XZ, north up) and the 3D view (Y up, metres) share selection and edits. Views can also be shown alone.
- **Junctions as nodes.** Every junction has one handle. Dragging it in the plan, or moving it with the 3D gizmo, moves the whole joint: all arms, the carriageway fan, the kerb rings and the batters. The corner radius and fillet steps are edited on the node.
- **Watertight junctions.** Each arm leaves its node as a straight throat. Arm offset lines are intersected pairwise and rounded with quadratic fillets, which gives one closed loop per lateral slot (carriageway edge, gutter, kerb top, footway edge, ditch floor and lip). Adjacent loops are joined by quads, and the carriageway is a triangle fan. Roads and junctions meet on identical throat vertices, so there are no gaps or overlaps. Dead ends close with a half-round cap, and bends and T-junctions use the same construction.
- **Roads.** A road is a Hermite centreline through its interior points, with straight stubs at both ends. Lanes, widths, shoulders, crown, kerbs, gutters, footways, ditches, paving and markings are set per road.
- **Paving.** Seven procedural patterns (asphalt, concrete slab, herringbone and running-bond brick, granite setts, grid pavers, gravel) apply to carriageways and footways. They are tiled in metres and exported as PNG textures.
- **Drainage.** Kerb-and-gutter roads get grates at a set inlet spacing. Ditch roads get V ditches.
- **Terrain.** A procedural flat or rolling terrain drives embankment and cut batters (1:2 with a 12 m cap), bridge detection and guardrail placement.
- **Bridges.** A span is detected where the road sits more than a threshold above the ground (default 2.5 m) or passes over another road by at least the grade clearance (default 5.5 m). Bridge spans get a deck, parapets, abutments and piers that stand clear of other roads.
- **Guardrails.** Posts and a rail run along the outer edge of high embankments (automatic above 2 m, or forced on or off per road). Bridge spans get parapets instead.
- **Markings.** Centre line (dashed or solid yellow), edge lines and lane lines, drawn as decals just above the carriageway.
- **Grade separation and crossings.** Two roads that cross in plan are grade separated if their surfaces differ by at least the clearance. Otherwise the crossing is at grade. At-grade crossings are converted to junctions when an edit is committed, or from **Construct → Convert at-grade crossings**.
- **Interchanges.** The Interchange tool takes an upper road, then a lower road that it crosses. It builds a diamond: the upper road is split at two nodes and bridges over the lower road, the lower road is split at two nodes, and four ramps join each upper node to each lower node.
- **Exchange.** Export and import work for OBJ, JSON and a ZIP bundle. See below.

## Controls

| Action | How |
| --- | --- |
| Select | Click a junction or road in the plan or the 3D view. Any item, including interchanges, can be chosen from the outliner |
| Move a junction | Drag it in the plan, or use the gizmo in 3D |
| Move an interior point | Select the road, then drag its amber point. Double-click a road to add a point |
| Place a junction | `N`, then click the ground |
| Route a road | `R`. Click junctions, ground points or a road (this splits it). `Esc`, `Enter` or double-click finishes; the route ends at its last point |
| Build an interchange | `I`, then click the upper road, then the lower road |
| Delete | `Delete` removes the selected junction (with its roads), road or point |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) |
| Frame all | `F` |
| Pan / zoom (plan) | Space-drag, middle-drag or right-drag / mouse wheel |

## Exchange: export and import

The **Exchange** menu covers all file formats.

- **Bundle (.zip)** contains `<name>.obj` (positions, UVs and normals, one `usemtl` per material), `<name>.mtl`, `textures/*.png` for the paving patterns, `project.json`, and a README.
- **OBJ + MTL** downloads the two text files without textures.
- **Project (.json)** is the editable document. It is the same format the importer reads.
- **Open** accepts `.json` (replaces the project, after confirmation, and is undoable), `.zip` (reads `project.json` from the bundle) and `.obj` (shown as a translucent reference layer that can be toggled or removed).

The JSON document has the form `{ "format": "frontier-road-editor", "version": 1, "project": { ... } }`. A bare project object is accepted too. Importing migrates missing fields to defaults and rejects broken references.

## Project model

- Units are metres. Y is up. Plan coordinates are `(x, z)`, with north as −z.
- `nodes[]`: `id`, `name`, `x`, `y`, `z`, `radius` (corner radius, m), `steps` (fillet steps).
- `roads[]`: `id`, `name`, `from`, `to` (node ids), `points[]` (`{x, y, z}`, interior points), plus `lanes`, `laneWidth`, `shoulder`, `oneWay`, `crown`, `curb`, `gutter`, `gutterDrop`, `sidewalk`, `surface`, `drainage`, `guardrail`, `bridge` and `markings`. Defaults are in `src/geom/profile.js`.
- `interchanges[]`: `id`, `name`, `roads[]` and `nodes[]` (the parts built by the Interchange tool).
- `terrain`: `mode` (`flat` or `rolling`), `amplitude`, `wavelength`, `seed`, `base`. `clearance` sets the grade clearance (default 5.5 m).

The editor autosaves to `localStorage`, under the key `frontier-road-editor:v1`.

## Layout of the code

```
index.html, styles.css     page shell (Slate-style graphite UI)
src/main.js                boot
src/app.js                 controller: project, commands, undo, tools, exports
src/model/                 project data, topology (split, grade commit, interchange), materials
src/geom/                  pure geometry, no DOM:
  profile.js               cross-section slots and road defaults
  centerline.js            Hermite centrelines with straight stubs
  junction.js              junction solver and surface emission
  road.js                  road bodies, batters, bridges, guardrails, markings, grates
  batter.js                slope-to-terrain solver
  network.js               project -> meshes, throats, crossings, bridge flags, checks
  mesh.js                  indexed mesh builder with grid normals
  terrain.js               procedural terrain
src/render/                plan.js (canvas 2D), scene.js (three.js), textures.js
src/export/                obj.js, zip.js (store and deflate), project-io.js
src/ui/                    inspector, outliner and form controls
vendor/three/              three.js r183.2 (MIT), see vendor/three/README.txt
tests/                     node:test suites (geometry, model, export)
```

## Tests

```
npm test          # from road-editor/, or: node --test tests/*.test.mjs
```

The geometry tests check that junction loops are simple and wound CCW, that the network closes at every throat (the only open edges left are batter toes on the ground and the top of zero-thickness parapets on bridges), and that batters meet the terrain. The model tests cover splitting without losing points, at-grade commit, interchange structure, validation and migration. The export tests cover the ZIP writer and reader, OBJ round trip and JSON round trip.

## Limits and known behaviour

- Parapets are single sheets, not thick walls, so their end edges are open. Abutments are simplified walls.
- Arms that overlap are reported in **Checks**. Very acute angles give long throats (warned above 60 m).
- An interior point that falls inside a junction's throat is ignored for the road's shape, and a warning names the road. The point stays in the file.
- Drainage is modelled as kerbs, gutters, grates and ditches. Culverts and pipe networks are not modelled.
- Imported OBJ files are reference geometry only. They cannot be edited, and their materials are not read.
- Build time grows with the network. The geometry build (`buildNetwork`) takes about 15 to 40 ms for the samples and about 240 ms for a 60-road grid, on a single JavaScript thread. A full editor refresh, including GPU upload, took roughly 150 to 300 ms in headless testing with software WebGL, so large networks drag less smoothly than small ones.
- Textures are generated at run time on canvases. Google Fonts are loaded when the page is online; otherwise the system UI font is used.
