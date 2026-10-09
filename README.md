# Frontier · Road Studio

A working, graph-based HTML road editor for game-engine asset creation. The Slate-inspired graphite workspace pairs a live 2D plan with a real WebGL 3D view, an outliner, a geometry/material/detail inspector, and a road asset library.

## Open the editor

**No installation:** open [`RoadDesigner.html`](./RoadDesigner.html) in a modern browser. It is the complete, self-contained application: code, styles, fonts, icon graphics, geometry generator, and procedural materials are embedded. No CDN or external network requests are required. WebGL2 is needed for 3D; the 2D editor and OBJ/JSON export remain available without it.

**Development:** Node.js 22.12 or newer.

```sh
npm ci
npm run dev              # port 3000, bound to 0.0.0.0
npm run build            # typecheck, compile, regenerate RoadDesigner.html
npm test                 # 33 geometry / topology / export checks
npm run test:browser     # 20 browser checks; requires the dev server above
npm run format:check
```

The development server accepts preview hosts. The app has no backend, no browser-facing localhost requests, and no account requirement.

### Static hosting / raw.githack

Publish the **root-level `RoadDesigner.html`** file, not the development `index.html`. The single HTML can be served from any static host, including raw.githack; it does not need a `dist/assets` folder.

After this session's branch has been pushed to GitHub, its raw.githack URL is:

```text
https://raw.githack.com/c7egoist/Frontier/arena/8070fd6c-frontier/RoadDesigner.html
```

The development workspace does not publish a branch automatically. Use a commit-pinned URL for a stable deployed version. Local saves are scoped to the browser and hosting origin; use JSON export when moving between hosts.

## Editing

- **Linked 2D / 3D split view.** Select in either view. Switch to full 2D or full 3D, or drag the divider to resize the split.
- **Draw roads in plan.** Click a start point, then click to add segments. Snap to nodes or to the actual cubic alignment of an existing road. At-grade crossings become shared junctions automatically. Zoom out or pan when extending beyond the current view.
- **One junction pivot.** Drag the center handle or an X/Z axis in plan. In 3D, use X/Y/Z axes or the center's horizontal translation plane. Moving a shared graph node moves all connected approaches and their relative Bézier handles together.
- **Curve editing.** Select a road to expose its two Bézier handles in 2D. The road's pivot translates both endpoints, including any incident connections. Numeric X/Y/Z transforms are also live.
- **Junction shape.** Change the corner radius or the common approach profile. An individual approach remains editable separately by selecting that road. Pedestrian crossings can be toggled per joint.
- **Road profiles.** One to six lanes; adjustable lane widths, sidewalks, crown/crossfall, and one-way template/preset settings.
- **Surfaces.** Asphalt, concrete, or cobble; herringbone, running-bond, slab, or basket-weave paving. Procedural paving textures use continuous world-space UVs at junctions.
- **Guardrails.** Swept corrugated W-beam surfaces with solid embedded posts, adjustable height and spacing, and continuous barriers around guarded junction corners.
- **Drainage.** Gutter strips, modeled metal inlet grates, adjustable inlet spacing, crossfall, and a schematic plan-view drainage overlay.
- **Bridges.** Concrete or steel-girder decks, piers, caps, foundations and abutments. Support placement avoids underlying carriageways. Enabling a bridge raises low endpoints to 6 m and enables guardrails; attached roads become approach ramps. The graph's elevation remains explicitly editable in Transform.
- **Markings.** Dashed lane lines, edge lines, double center lines on wider roads, approach arrows, and zebra crossings. Markings stop before the junction interior.
- **Persistence.** Local autosave, Ctrl/Cmd+S, JSON import/export, transactional undo/redo, scene search, rename, and delete.
- **View controls.** Orbit, pan, zoom, frame all/selection, grid and label toggles, clay/wireframe shading, dusk lighting, context visibility and detail layers.

### Included networks

| Template            | Geometry                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Northbank district  | Two four-way junctions, curved streets, an elevated viaduct and continuous approach ramps   |
| Three-way junction  | A clean, shared T-joint with paved corners                                                  |
| Garden roundabout   | Four connected cubic quarter-arcs and four entries; one-way circulation                     |
| Diamond interchange | Shared ramp terminals, four connecting ramps, a separate cross highway and a steel overpass |

The diamond's complete road graph is connected. The overpass remains separate from the highway directly below it. The default template is tested at **5.76 m minimum modeled clearance** and **approximately 6.4% maximum grade**, with no geometry diagnostics.

## How the topology works

1. Roads are cubic Bézier graph edges between first-class nodes. Handles are stored relative to their endpoint, so a shared pivot cannot tear an attached curve away.
2. Adaptive subdivision produces stations with analytic tangents. Offset widths are curvature-limited to prevent local parallel-curve inversions.
3. A spatial grid finds segment-crossing candidates. Newton refinement finds the intersection on the actual cubic curves; a 0.7 m elevation gate prevents overpasses from becoming at-grade junctions.
4. Exact de Casteljau subdivision splits each affected cubic. Coincident crossings become one shared graph node, including T-touches and multiple crossings along the same road.
5. Road runs trim away from junctions. Junction arms use the **actual terminal cross-sections of the trimmed road meshes**, sorted by direction.
6. Bounded tangent fillets form the corners. Curbs and paving share the same pinned approach boundaries. Asphalt triangulation retains the crowned mouth's left, center and right vertices rather than discarding collinear plan-view points.
7. Near-straight degree-two joins share a canonical cross-section normal. Changes of width or significant bends generate an explicit transition joint.
8. Diagnostics identify overlapping/degenerate junctions, self-crossing single-cubic alignments, short approaches, excessive grades and low clearances. Invalid geometry blocks mesh export, while JSON remains exportable for repair.

The topology approach was informed by the supplied Frontier topology reference. This implementation and the bridge/guardrail/drainage generators were written separately; the earlier bridge implementation was not imported. The UI's panel and card structure is inspired by the supplied Slate inspector reference.

## Engine exports

| Format                | Included                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| **GLB** — recommended | Indexed triangles, computed normals, UVs, material parameters and embedded procedural paving textures        |
| **OBJ ZIP**           | OBJ triangles, explicit face normals, UVs and a matching MTL; diffuse materials but no paving texture images |
| **`.road.json`**      | Versioned, editable graph, handles, road settings, junction radii and elevations                             |

Coordinates are **meters, Y-up**. The preview terrain, trees, grids and gizmos are not exported. Clay/wireframe view modes do not change exported materials. Viewport-hidden detail layers are still included in the complete mesh export. Materials are not game-engine shaders; convert them to your engine's native material system as needed.

### Host integration API

Embed the standalone HTML in an engine-tool browser/webview. Within that document:

```js
const graph = window.frontier.getProject(); // independent JSON-safe copy
const built = window.frontier.getNetwork(); // generated mesh data + diagnostics

window.frontier.select({ kind: "node", id: graph.nodes[0].id });
window.frontier.moveJoint(graph.nodes[0].id, [10, 0, 5]);
window.frontier.setMode("draw");
window.frontier.loadTemplate("diamond");
window.frontier.exportProject("glb"); // browser download

window.addEventListener("frontier:change", (event) => {
  const { project, meshes, diagnostics } = event.detail;
  // Mesh data: positions, triangle indices, UVs, material key, owner ID/kind.
  // Compute normals if importing these raw arrays rather than GLB/OBJ.
});
```

Additional API methods: `getSelection()`, `worldToPlan([x,y,z])`, `save()`, `undo()`, and `redo()`. Treat `getNetwork()` and event mesh arrays as read-only. A cross-origin iframe host must use its own validated messaging bridge; there is no permissive postMessage listener.

## Shortcuts

| Action               | Key                           |
| -------------------- | ----------------------------- |
| Select / draw / move | V / D or P / W                |
| Pan / temporary pan  | H / hold Space                |
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

This is a procedural **game-engine mesh editor**, not a certified civil/structural engineering or hydraulic simulation package. Crossfall and drainage visualization are geometric/schematic, not a water-flow solver. The interchange is not a lane-level traffic-routing simulation.

An editor tile is bounded to **500 roads, 1,500 nodes, a 5 × 5 km control-point extent, no more than 5 km of control-polygon length per alignment, and 35 km total**. Imports are bounded and validated before geometry allocation. Larger worlds should be designed/exported in tiles. Imported self-crossing single-cubic loops are flagged for repair; use separate connected edges or the roundabout template instead.

Local saves depend on browser storage availability. Keep exported JSON copies of important work; undo history is not persisted. The source is TypeScript with Three.js and Canvas rendering, built with Vite. Runtime dependency/font licenses are in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and embedded in the standalone HTML.

## Source map

```text
src/core/       Graph model, bounded parsing, cubic sampling, intersection splitting,
                shared-section junction geometry, structures, diagnostics and OBJ
src/render/     Linked Canvas plan, Three.js scene, picking/gizmos and materials
src/ui/         Icon registration, safe HTML helpers and procedural asset previews
src/main.ts     Application state, transactions, undo/save/import/export and controls
src/style.css   Responsive Slate-inspired studio skin
scripts/        Self-contained HTML packaging and browser regression checks
tests/          Geometry, topology, persistence and export regressions
RoadDesigner.html   Generated self-contained deliverable (intentionally tracked)
```
