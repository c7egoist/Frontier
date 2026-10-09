# Frontier Road Editor

A road editor for the Frontier game engine. It has a 2D plan and a 3D view side by side, with junction
hubs, bridges, guardrails, drainage, paving patterns, road markings, diamond exchanges and freehand road
drawing. The UI follows the Slate FrontierEditor look. It runs entirely in the browser. Nothing needs npm
to run; npm is only used to rebuild `index.html`.

## Open it

- **Use `index.html`** in this folder. It is one self-contained file: the code, the CSS and clipper are
  inlined, so it loads no ES modules and needs no server.
- raw.githack: https://raw.githack.com/c7egoist/Frontier/arena/f7295378-frontier/RoadEditor/index.html
  This URL is not verified from the build sandbox, which cannot reach raw.githack. What was checked: the
  single file starts with no errors on a local server, and also on a simulated strict host that serves
  JavaScript as `text/plain` with `X-Content-Type-Options: nosniff`. The module page (`dev/index.html`) does
  not start on that host. That is the likely cause of an earlier blank page.
- The UI loads DM Sans from Google Fonts. Without it, the system sans-serif font is used.

## Development

- `dev/index.html` is the same page as ES modules, loading `src/` directly. Serve this folder (`npm run dev`
  serves it on port 8080) and open `/dev/index.html`. Module scripts need a server that sends JavaScript
  with a JavaScript MIME type.
- `npm install` once, then `npm run build` regenerates `index.html` from `dev/index.html`, `src/`,
  `style.css` and `vendor/`. esbuild is the only dependency. Edit the sources, rebuild, and commit
  `index.html` with them.

## Controls

| Action | How |
| --- | --- |
| Select | `V`, click an object (plan or 3D) |
| Move a junction | drag its disc on the plan, or use the gizmo in 3D |
| Change corner radius | drag the dashed ring of the selected junction (one handle per joint) |
| Move along one axis | drag the white arrows of the selected junction |
| Add a junction | `J`, click |
| Draw a road | `R`, click a junction then another; click empty ground to add one and continue; `Esc` stops |
| Draw a road freehand | `D`, press and drag across the plan, release to create it (see below) |
| Add a road control point | double-click the road, or the inspector button |
| Move a control point | drag its square |
| Paving area | `A`, click corners; double-click, `Enter` or click the first corner to close |
| Exchange | `X`, click where the diamond should go (settings in the Exchange card) |
| Delete | `Del` (selected object) |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Pan / zoom | middle-drag or `Space`+drag / mouse wheel; `F` frames the network |

Freehand drawing (`D`): the stroke is simplified to a 0.5 m tolerance, and sharp reversals are removed, so a
stroke that doubles back over itself does not leave a spike. Each end snaps to a junction within 4 m;
otherwise it creates a new junction. Interior points become control points (up to 40). Strokes shorter than
6 m are refused. The whole stroke is one undo step.

The top bar switches the split between plan and 3D, and toggles markings, guardrails and drainage.

## What the editor builds

- **Junction hubs.** Each arm is footprinted from the joint centre out to a mouth station. The carriageway
  is the closing of those footprints, with concave corners filled by the corner radius. Each band boundary
  uses the same closing with the radius reduced by the band offset, so kerbs, footways and verges keep
  constant widths around corners. Mouth corners land exactly on the road sections (tested).
- **Any angle.** Each arm reserves the road length its crotch fillet needs, so narrow junctions stay clean.
  Two arms set anywhere from 10 to 170 degrees apart, with 150 m roads and a 6 m corner radius, build with no
  errors and their mouth corners land on the hub (`tests/angles.test.js`). A road that is too short for its
  angle gets a warning that names the road and the length it needs.
- **Road sections.** Carriageway with camber (crown or fall), gutter, kerb, footway, verge, optional V-ditch,
  fill slopes or a bridge deck with piers. Near a junction the road blends to a flat plateau at the junction
  height, so hubs and roads meet without steps.
- **Slopes.** Fill slopes run at 1.5:1 but are capped at 8 m wide. A taller fill ends in a vertical retaining
  wall down to ground. Embankments are drawn under the roads and hubs, so they never cover the carriageway.
  Cuts are not capped.
- **Bridges.** A road can be bridged over a station range: deck, fascia, underside, and piers where the
  underside clears the ground. A hub gets a deck when all its arms are bridged.
- **Crossings.** Roads that cross without sharing a junction are checked. Under 0.5 m clearance is an error;
  under 2.5 m is a warning. Grade-separated crossings are reported with their clearance.
- **Guardrails.** Posts and a rail box, offset past the footway, with an adjustable post spacing.
- **Drainage.** Gutter channels, gullies (grates) at a set spacing, and drain pipes at a set depth.
- **Paving.** Seven procedural patterns (slab, brick, herringbone, hex, cobble, flag, plain), on footways and
  on drawn paving areas. Tiles map to world x/z, so they run across hubs without seams.
- **Road markings.** Solid or dashed centre line, edge lines, and dashed lane dividers.
- **Diamond exchange.** A bridged mainline over the cross road, four 45-degree ramps, and four far arms. It is
  made of ordinary junctions and roads, so every part can be edited afterwards.
- **Freehand roads.** The `D` tool turns a drawn stroke into an ordinary road between junctions.

## Files

**Project JSON** (`frontier-road-project`, version 1) is the single source of truth. Import and export use
the same validator. Errors name the field, for example `roads[0].lanesL: must be a whole number from 1 to 4`.
Export, import and export again gives byte-identical output (tested).

```json
{
  "format": "frontier-road-project",
  "version": 1,
  "name": "Sample crossroads",
  "junctions": [ { "id": "J1", "name": "J1", "x": -60, "z": 0, "y": 0, "radius": 6 } ],
  "roads": [ { "id": "R1", "a": "J1", "b": "J5", "ctrl": [], "lanesL": 1, "lanesR": 1, "laneW": 3.5,
               "camber": 0.025, "camberMode": "crown", "gutter": 0.45, "kerbH": 0.15, "kerbW": 0.15,
               "footway": 2, "verge": 1, "pattern": "slab", "colour": "#c9c4b8",
               "bridge": { "on": false }, "guard": { "on": true }, "drain": { "gullies": true },
               "marks": { "centre": "dashed", "edges": true, "lanes": true } } ],
  "areas": [ { "id": "A1", "pts": [[-30, 30], [-12, 30], [-12, 46]], "y": 0, "pattern": "herringbone", "colour": "#b8a890" } ]
}
```

Units are metres, Y up. Omitted optional fields take defaults.

**OBJ + MTL** (Export OBJ): one object per road, junction or area, with one material per surface type
(`asphalt`, `gutter`, `kerb`, `verge`, `embank`, `deck`, `retain`, `white`, `guard`, `post`, `grate`, `pipe`,
`paving_<pattern>_<colour>`). Coordinates are metres, Y up.

## Tests

```sh
npm test    # node --test tests/*.test.js (45 tests)
```

The geometry and I/O tests cover: clipper and closing areas against closed-form values, curve and elevation
checks, hub areas for straight, T and dead-end joints, mouth-corner matching, the angle rule from 10 to 170
degrees, raised-junction slopes (capped fill, retaining wall, and no wall for low junctions), freehand
sketch simplification and snapping, crossing detection, diamond exchange topology, the export/import round
trip, validation messages, and OBJ structure.

Browser checks (headless Chromium with puppeteer; the scripts are not in the repo) covered: loading, dragging
and undoing a junction, changing a corner radius, the road tool, a paving area, an exchange, the project
round trip, bad-file errors, a 25 degree junction in plan, a raised 16 m junction in 3D and plan, and the
draw tool.

## Vendored libraries (`vendor/`)

- three.js r183.2 (`module/`, `addons/controls/OrbitControls.js`, `TransformControls.js`), MIT, see `vendor/three/LICENSE`.
- clipper-lib 6.4.2 (`clipper/`), Boost Software License 1.0, see `vendor/clipper/README.md`.
- earcut 3.0.2 (`earcut/`), ISC, see `vendor/earcut/LICENSE`.

## Known limits

- Ground is flat at y = 0, or at each junction's height. There is no terrain. Retaining walls are vertical and
  fill slopes are capped at 8 m wide.
- Only the diamond exchange is generated. Other interchange forms must be built by hand.
- Stop lines, give-way marks, arrows and traffic signals are not generated.
- The 3D gizmo moves junctions only. Control points and paving corners move in the plan.
- Very acute angles (about 10 to 15 degrees) need roads of roughly 110 m or more. A shorter road gets a
  warning. If a road is too short for both of its junctions, the two hubs merge along it, and a warning is
  shown when the overlap is more than 2 m.
- Crossing checks use plan intersections and the heights stored in the file. They do not sample terrain.
- Freehand strokes are simplified to at most 40 control points, so very fine wiggles are lost.
- A full rebuild takes about 0.2 to 0.4 s for the sample and about 0.8 s with a diamond exchange added
  (headless Chromium, software WebGL). Rebuilds are debounced while dragging, so drags update in steps.
- No game-engine plugin is included. The integration point is the JSON file and the OBJ/MTL pair.
