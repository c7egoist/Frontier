# Frontier · Road Studio

A working, graph-based HTML road editor for game-engine asset creation. The Slate-inspired graphite workspace now includes modern paving, racing circuits, signs, street blocks and parking. It pairs a live 2D plan with a real WebGL 3D view, an outliner, a geometry/material/detail inspector, and a road asset library.

## Open the editor

**No installation:** open [`RoadDesigner.html`](./RoadDesigner.html) in a modern browser. It is the complete, self-contained application: code, styles, fonts, icon graphics, geometry generator, and procedural materials are embedded. No CDN or external network requests are required. WebGL2 is needed for 3D; the 2D editor and OBJ/JSON export remain available without it.

**Development:** Node.js 22.12 or newer.

```sh
npm ci
npm run dev              # port 3000, bound to 0.0.0.0
npm run build            # typecheck, compile, regenerate RoadDesigner.html
npm test                 # 67 geometry / topology / racing / export checks
npm run test:browser     # 38 browser checks; requires the dev server above
npm run format:check
```

The development server accepts preview hosts. The app has no backend, no browser-facing localhost requests, and no account requirement.

### Static hosting / raw.githack

Publish the **root-level `RoadDesigner.html`** file, not the development `index.html`. The single HTML can be served from any static host, including raw.githack; it does not need a `dist/assets` folder.

The branch's editor URL is:

```text
https://raw.githack.com/c7egoist/Frontier/arena/8070fd6c-frontier/RoadDesigner.html
```

A commit-pinned URL avoids stale branch caches and gives a stable deployed version. Only explicitly pushed work is available on GitHub/raw.githack. Local saves are scoped to the browser and hosting origin; use JSON export when moving between hosts.

## Editing

- **Linked 2D / 3D split view.** Select in either view. Switch to full 2D or full 3D, or drag the divider to resize the split.
- **Draw roads in plan.** Click a start point, then click to add segments. Snap to nodes or to the actual cubic alignment of an existing road. At-grade crossings become shared junctions automatically. Zoom out or pan when extending beyond the current view.
- **One junction pivot.** Drag the center handle or an X/Z axis in plan. In 3D, use X/Y/Z axes or the center's horizontal translation plane. Moving a shared graph node moves all connected approaches and their relative Bézier handles together.
- **Curve editing.** Select a road to expose its two Bézier handles in 2D. The road's pivot translates both endpoints, including any incident connections. Numeric X/Y/Z transforms are also live.
- **Junction shape.** Change the corner radius or the common approach profile. An individual approach remains editable separately by selecting that road. Pedestrian crossings can be toggled per joint. Acute merges reserve the complete fillet runout rather than capping a free-ended approach at 43%; a separate **Paving / merge setback** moves the paving nose farther back without moving the pivot. Merge throats suppress inappropriate zebras and gain clipped lane guidance/gore hatching.
- **Road profiles.** One to six lanes; adjustable lane widths, sidewalks, crown/crossfall, and one-way template/preset settings, optional parallel-parking bands and tapered central medians.
- **Surfaces.** Asphalt, concrete, cobble or fully paved carriageways; **nine paving patterns** including cool-grey ashlar, linear limestone, terrazzo, slate, permeable blocks, slabs and the original bond patterns. Dark edge courses and generated normal maps give modern sidewalks/plazas consistent detail. World-scaled UVs remain continuous at junctions.
- **Guardrails.** Swept corrugated W-beam surfaces with solid embedded posts, adjustable height and spacing, and continuous barriers around guarded junction corners. Also swept three-bar pedestrian railings and solid concrete racing barriers. Stone, flush and red/white rumble-curb profiles are editable.
- **Drainage.** Gutter strips, modeled metal inlet grates, adjustable inlet spacing, crossfall, and a schematic plan-view drainage overlay.
- **Bridges.** Concrete or steel-girder decks, piers, caps, foundations and abutments. Support placement avoids underlying carriageways. Enabling a bridge raises low endpoints to 6 m and enables guardrails; attached roads become approach ramps. The graph's elevation remains explicitly editable in Transform.
- **Markings & signs.** Urban, motorway and racing marking styles; lane/edge lines, stop bars, arrows, zebras, merge hatching, clipped yellow-box junctions and starting-grid/checker stripes. Adjustable marking setbacks avoid crowded mouths. Front-facing speed/parking/exit/yield signs have proper decal UVs. Street poles/luminaires and static red/green traffic-signal heads are actual meshes.
- **Blocks & parking.** In the asset library, choose **Blocks & parking**, then click in plan to place a street block, parking court, plaza, landscaped island or waterfront. Sites have their own pivot, X/Y/Z transform, dimensions, rotation, shape and material controls; they are not fake road nodes. Blocks include stepped buildings, windows, rooftop equipment and a paved perimeter. Parking includes bays, wider accessible spaces, striped access aisles, entry clearance, wheel stops, numbers, signage and lights. Site deletion never changes road connectivity.
- **Persistence.** Local autosave, Ctrl/Cmd+S, JSON import/export, transactional undo/redo, scene search, rename, and delete.
- **View controls.** Orbit, pan, zoom, frame all/selection, grid and label toggles, clay/wireframe shading, dusk lighting, context visibility and detail layers.

### Included networks

| Template               | Geometry                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Northbank district     | Two four-way junctions, curved streets, viaduct, stone street block and parking court                              |
| Lane merge laboratory  | Shallow incoming slip road with recessed paving, normalized sign UVs and merge-aware guidance                      |
| Harbour street circuit | Closed rounded city loop, central boulevards, four developed blocks, parallel bays and connected parking court     |
| Channelized crossroads | Four curved slip lanes, four triangular planted islands, stop bars, clipped yellow box and static signals          |
| Cloverleaf interchange | Four connected 270° elevated loop ramps, braided ramp crossings and a steel motorway flyover                       |
| Trumpet interchange    | Three-arm network, a 270° loop and two connecting flyover ramps                                                    |
| Grand prix paddock     | Closed one-way racing loop, rumble curbs, concrete barriers, starting grid, pit lane and connected paddock parking |
| Waterfront promenade   | Curved stone promenade, parallel cycleway, pedestrian railings, terraces, lighting and water plane                 |
| Three-way junction     | Clean shared T-joint with paved corners                                                                            |
| Garden roundabout      | Four connected cubic quarter-arcs, four entries and landscaped circular plaza                                      |
| Diamond interchange    | Four connecting ramps, shared terminals, separate cross highway, steel overpass and motorway signs                 |

All eleven templates have finite indexed geometry, exact shared mouths and no geometry diagnostics in their default configuration. The diamond has **5.79 m minimum modeled clearance** and **6.49% maximum grade**; the cloverleaf/trumpet maintain **at least 5.19 m modeled clearance**, including their grade-separated ramp crossings, with grades under 7%.

## How the topology works

1. Roads are cubic Bézier graph edges between first-class nodes. Handles are stored relative to their endpoint, so a shared pivot cannot tear an attached curve away.
2. Adaptive subdivision produces stations with analytic tangents. Offset widths are curvature-limited to prevent local parallel-curve inversions.
3. A spatial grid finds segment-crossing candidates. Newton refinement finds the intersection on the actual cubic curves; a 0.7 m elevation gate prevents overpasses from becoming at-grade junctions.
4. Exact de Casteljau subdivision splits each affected cubic. Coincident crossings become one shared graph node, including T-touches and multiple crossings along the same road.
5. Road runs trim away from junctions using radius-plus-width acute-angle runout. Both ends share one length budget, retaining a short road body; a free end does not waste half the available length. Junction arms use the **actual terminal cross-sections of the trimmed road meshes**, sorted by direction.
6. Bounded tangent fillets form the corners. Curbs and paving share the same pinned approach boundaries. Inward paving offsets are curvature-limited so a wide pavement cannot fold around a merge nose. Asphalt triangulation retains the crowned mouth's left, center and right vertices rather than discarding collinear plan-view points.
7. Near-straight degree-two joins share a canonical cross-section normal. Changes of width/curb profile or significant bends generate an explicit transition joint.
8. Diagnostics identify overlapping/degenerate junctions, self-crossing single-cubic alignments, short approaches, excessive grades low clearances and site footprints that encroach into driveable roads. Invalid geometry blocks mesh export, while JSON remains exportable for repair.

The topology approach was informed by the supplied Frontier topology reference. This implementation and the bridge/guardrail/drainage generators were written separately; the earlier bridge implementation was not imported. The UI's panel and card structure is inspired by the supplied Slate inspector reference.

## Engine exports

| Format                | Included                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **GLB** — recommended | Indexed triangles, normals, UVs, embedded albedo/normal textures, sign/marking decals and all site/furniture geometry    |
| **OBJ ZIP**           | OBJ triangles, face normals, UVs, matching MTL, PNG textures and matching UV-repeat transforms in the textures directory |
| **`.road.json`**      | Backward-compatible v1 graph, handles, road settings, junction radii/setbacks/signals and optional editable sites        |

Coordinates are **meters, Y-up**. Preview-only context terrain/trees, grids and gizmos are not exported. **Site-owned** trees, planted islands, buildings, parking, benches, signs and lights are included. OBJ archives must be extracted with their `textures/` directory intact. Clay/wireframe view modes do not change exported materials. Viewport-hidden detail layers are still included in the complete mesh export. Materials are not game-engine shaders; convert them to your engine's native material system as needed.

### Host integration API

Embed the standalone HTML in an engine-tool browser/webview. Within that document:

```js
const graph = window.frontier.getProject(); // independent JSON-safe copy
const built = window.frontier.getNetwork(); // generated mesh data + diagnostics

window.frontier.select({ kind: "node", id: graph.nodes[0].id });
window.frontier.moveJoint(graph.nodes[0].id, [10, 0, 5]);
window.frontier.setMode("draw");
window.frontier.loadTemplate("race");
window.frontier.placeSite("parking"); // enter placement mode; click in plan
window.frontier.exportProject("glb"); // browser download

window.addEventListener("frontier:change", (event) => {
  const { project, meshes, diagnostics } = event.detail;
  // Mesh data: positions, triangle indices, UVs, material key, owner ID/kind.
  // Compute normals if importing these raw arrays rather than GLB/OBJ.
});
```

Selections use `{kind: "node" | "road" | "site", id}`. `Project.sites` is an optional independent collection, not part of the road graph. `getNetwork().parkingSpaces` counts generated street/court bays.

Additional API methods: `getSelection()`, `worldToPlan([x,y,z])`, `save()`, `undo()`, and `redo()`. `worldToPlan` returns pixels relative to the plan canvas, not the page. Treat `getNetwork()` and event mesh arrays as read-only. A cross-origin iframe host must use its own validated messaging bridge; there is no permissive postMessage listener.

## Shortcuts

| Action               | Key                           |
| -------------------- | ----------------------------- |
| Select / draw / move | V / D or P / W                |
| Pan / temporary pan  | H / hold Space                |
| Place street block   | B                             |
| Measure distance     | M                             |
| Frame network        | F                             |
| Toggle grid / snap   | G / S                         |
| Finish drawing       | Esc                           |
| Delete selected      | Delete or Backspace           |
| Templates            | Shift+A                       |
| Scene search         | /                             |
| Save / open project  | Ctrl/Cmd+S / Ctrl/Cmd+O       |
| Undo / redo          | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Help                 | ?                             |

## Scope and safeguards

This is a procedural **game-engine mesh editor**, not a certified civil/structural engineering or hydraulic simulation package. Crossfall and drainage visualization are geometric/schematic, not a water-flow solver. The interchange is not a lane-level traffic-routing simulation. Signal phases and luminaire emission are static preview/material values, not working traffic logic or exported punctual lights. Sites are editable massing/layout assets, not building interiors. Extremely short/overlapping approaches still produce explicit diagnostics rather than silently claiming the requested geometry is valid.

An editor tile is bounded to **500 roads, 1,500 nodes, 200 sites, a 5 × 5 km control-point extent, no more than 5 km of control-polygon length per alignment, and 35 km total**. Imports are bounded and validated before geometry allocation. Site-detail preflight additionally limits estimated detail vertices to 750,000; shrub density is adaptive so large islands cannot allocate unbounded plant meshes. Larger worlds should be designed/exported in tiles. Imported self-crossing single-cubic loops are flagged for repair; use separate connected edges or the roundabout template instead.

Local saves depend on browser storage availability. Keep exported JSON copies of important work; undo history is not persisted. The source is TypeScript with Three.js and Canvas rendering, built with Vite. Runtime dependency/font licenses are in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and embedded in the standalone HTML.

## Source map

```text
src/core/       Graph model, bounded parsing, cubic sampling, intersection splitting,
                shared-section junction geometry, racing/urban templates, site geometry,
                furniture, structures, diagnostics and textured OBJ packaging
src/render/     Linked Canvas plan, Three.js scene, picking/gizmos and materials
src/ui/         Icon registration, safe HTML helpers and procedural asset previews
src/main.ts     Application state, transactions, undo/save/import/export and controls
src/style.css   Responsive Slate-inspired studio skin
scripts/        Self-contained HTML packaging and browser regression checks
tests/          Geometry, topology, persistence and export regressions
RoadDesigner.html   Generated self-contained deliverable (intentionally tracked)
```
