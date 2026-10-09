# Frontier Road Editor

A static, no-build road editor: a 2D plan and a 3D view side by side, with junction hubs, bridges,
guardrails, drainage, paving patterns, road markings and diamond exchanges. The UI follows the Slate
FrontierEditor look (dark outliner, radial inspector, rounded cards). Everything runs in the browser;
nothing needs npm to run.

## Open it

- Locally: `cd RoadEditor && python3 -m http.server 8080`, then open http://localhost:8080/
- raw.githack (once this branch is pushed): https://raw.githack.com/c7egoist/Frontier/arena/f7295378-frontier/RoadEditor/index.html
  (not verified from the build sandbox, which cannot reach raw.githack)

Paths are relative and the three.js import map is local, so the folder works from any static host.
Google Fonts (DM Sans) is loaded from the web; without it the UI falls back to the system font.

## Controls

| Action | How |
| --- | --- |
| Select | `V`, click an object (plan or 3D) |
| Move a junction | drag its disc on the plan, or use the gizmo in 3D |
| Change corner radius | drag the dashed ring of the selected junction (one handle per joint) |
| Move along one axis | drag the red/blue arrows of the selected junction |
| Add a junction | `J`, click |
| Draw a road | `R`, click a junction then another; click empty ground to add one and continue; `Esc` stops |
| Add a road control point | double-click the road, or the inspector button |
| Move a control point | drag its square |
| Paving area | `A`, click corners; double-click, `Enter` or click the first corner to close |
| Exchange | `X`, click where the diamond should go (settings in the Exchange card) |
| Delete | `Del` (selected object) |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Pan / zoom | middle-drag or `Space`+drag / mouse wheel; `F` frames the network |

The top bar switches the split between plan and 3D, and toggles markings, guardrails and drainage.

## What the editor builds

- **Junction hubs.** Each arm is footprinted from the joint centre out to a mouth station. The
  carriageway is the closing of those footprints (concave corners filled with the corner radius).
  Each band boundary is the same closing with radius reduced by the band offset, so kerbs,
  footways and verges keep constant widths around corners. Mouth corners land exactly on the road
  sections (tested).
- **Road sections.** Carriageway with camber (crown or fall), gutter, kerb, footway, verge, optional
  V-ditch, fill slopes or a bridge deck with piers. Near a junction the road blends to a flat plateau at
  the junction height, so hubs and roads meet without steps.
- **Bridges.** A road can be bridged over a station range: deck, fascia, underside, and piers where
  the underside clears the ground. A hub gets a deck when all its arms are bridged.
- **Crossings.** Roads that cross without sharing a junction are checked. Under 0.5 m clearance is an
  error; under 2.5 m is a warning. Grade-separated crossings are reported with their clearance.
- **Guardrails.** Posts and a rail box, offset past the footway, with an adjustable post spacing.
- **Drainage.** Gutter channels, gullies (grates) at a set spacing, and drain pipes at a set depth.
- **Paving.** Seven procedural patterns (slab, brick, herringbone, hex, cobble, flag, plain), on
  footways and on drawn paving areas. Tiles map to world x/z, so they run across hubs without seams.
- **Road markings.** Solid or dashed centre line, edge lines, and dashed lane dividers.
- **Diamond exchange.** A bridged mainline over the cross road, four 45-degree ramps, and four far
  arms. It is made of ordinary junctions and roads, so every part can be edited afterwards.

## Files

**Project JSON** (`frontier-road-project`, version 1) is the single source of truth. Import and export
use the same validator. Errors name the field, for example `roads[0].lanesL: must be a whole number
from 1 to 4`. Export, import and export again gives byte-identical output (tested).

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
(`asphalt`, `gutter`, `kerb`, `verge`, `embank`, `deck`, `white`, `guard`, `post`, `grate`, `pipe`,
`paving_<pattern>_<colour>`). Coordinates are metres, Y up.

## Tests

```sh
npm test    # node --test tests/*.test.js  (no dependencies)
```

24 geometry and I/O tests: clipper and closing areas against closed-form values, curve and elevation
checks, hub areas for straight, T and dead-end joints, mouth-corner matching, crossing detection,
diamond exchange topology, export/import round trip, validation messages, and OBJ structure.

Browser checks (headless Chromium, not part of the repo) covered: loading, dragging and undoing a
junction, changing a corner radius, drawing a road, drawing a paving area, placing an exchange, and
round-tripping the project file.

## Vendored libraries (`vendor/`)

- three.js r183.2 (`module/`, `addons/controls/OrbitControls.js`, `TransformControls.js`), MIT, see `vendor/three/LICENSE`.
- clipper-lib 6.4.2 (`clipper/`), Boost Software License 1.0, see `vendor/clipper/README.md`.
- earcut 3.0.2 (`earcut/`), ISC, see `vendor/earcut/LICENSE`.

## Known limits

- Ground is flat at y = 0 (or at each junction's height). Fill slopes are a fixed 1.5:1. There is no terrain.
- Only the diamond exchange is generated. Other interchange forms must be built by hand.
- Stop lines, give-way marks, arrows and traffic signals are not generated.
- The 3D transform gizmo moves junctions only. Control points and paving corners move in the plan.
- A full rebuild takes roughly 0.2 s for the sample and 0.5 s for a diamond exchange. Rebuilds are
  debounced while dragging, so drags update in steps rather than every frame.
- Clearance checks run in plan only (they assume the vertical positions in the file are the truth).
- Acute junction angles (under about 25 degrees) can make neighbouring mouths overlap. Those cases
  are not flagged yet.
- No game-engine plugin is included. The integration point is the JSON file and the OBJ/MTL pair.
