# Frontier · Road authoring

A self-contained HTML tool for generating **roads, paving and procedural parking** for game-engine asset workflows. Linked 2D/3D editing, shared junction pivots and exports remain live. The workspace is deliberately asset-only: no buildings, trees, benches, planters, statues, parked vehicles or decorative environment meshes.

## Open

Open [`RoadDesigner.html`](./RoadDesigner.html), or use the [verified production-detail snapshot on raw.githack](https://raw.githack.com/c7egoist/Frontier/5c8d1d9ec088372879ef0835a7ef21c52e9e3e08/RoadDesigner.html). No install or external asset requests are required. raw.githack can show a safety notice first; choose **Open the page**. Browser-local saves do not transfer between hosting origins: export/import JSON to move a layout.

Only the root HTML is deployed, not Vite's development `index.html`. Code, fonts, procedural materials and licensing notices are embedded. WebGL2 enables the 3D view; plan editing and OBJ/JSON export also work without it.

## Slate FrontierEditor UI

The achromatic palette and component treatment are ported from the supplied [Slate FrontierEditor source](https://github.com/unassignedinbox/Slate/tree/arena/01a0fd48-slate/Frontier/Experimental/FrontierEditor), revision `bf0bdd5005f97b6375c21bc74e9a4bd8b41417cd`:

- `#101010` shell, `#161616` full-height 284 px outliner, `#2a2a2a` selected rows.
- DM Sans, 71 px top bar, grey selection indicators and controls.
- Source inspector gradients, 64 px object icons, fine typography and 18 px cards.
- A resizable **scrollable asset grid** with visible mesh-generated road, parking and infrastructure previews, material swatches and readable specifications. No stock scenery illustrations.

`src/ui/slate-editor.css` preserves those tokens and treatments. The grid is extended to accommodate linked road viewports and a narrow inspector. The 3D workspace uses neutral studio lighting and a plain ground plane, not a green diorama. Preview lighting/ground are not exported.

## Editing

- **Split 2D / 3D:** select in either view; resize the split or use full 2D/3D. The magnifier in the 3D toolbar frames the selected curb, paving or parking edge for close-up inspection; it changes only the camera.
- **Mesh detail:** Editing and Production preview profiles keep the same authoring graph. Production targets ≤0.75 m road segments and ≤10 mm Bézier chord deviation, with denser fillet tessellation and exact pinned approach endpoints. The Editing profile retains the previous 2.8 m / 45 mm tolerances for responsiveness.
- **Draw:** click points in plan. Snap to shared nodes and actual cubic curves; at-grade crossings are split into shared topology, while elevated crossings remain separate.
- **One junction pivot:** X/Z in plan, X/Y/Z in 3D. Connected approaches and relative Bézier handles follow the same node. Road pivots and numeric transforms remain editable.
- **Merge construction:** acute-angle runout includes radius and road width. Both ends share the available trim budget rather than wasting 43% at a free end. Paving setback is adjustable; wide inward offsets cannot fold around the merge nose. Inappropriate zebras are suppressed and junction guidance is surface-clipped.
- **Paving:** nine world-scaled bond/panel patterns, independent pavement width, flush/stone/rumble curb profiles and edge courses. Albedo, normal and roughness channels are available in GLB and the OBJ texture package. Relief is generated independently from stone colour, rather than turning colour variation into fake displacement. Road and junction curbs share a continuous 15 mm top chamfer (reduced for flush profiles).
- **Infrastructure:** procedural service covers, framed cast-iron curb inlets, recessed linear-channel grates and continuous gutters. W-beam/pedestrian barriers, concrete racing barriers and steel/concrete bridges remain available. Signs, signal heads and light fixtures are optional, explicitly enabled controls; templates do not auto-populate them.
- **Persistence:** local autosave, JSON import/export, transactional undo/redo, rename/delete and scene search.

### Asset library and road utilities

The library is a **multi-column, vertically scrolling grid**. Preview images and specifications are always visible; scrolling reaches every tile. Drag its upper divider, or focus that divider and use ↑/↓ (Home/End for limits), to resize it. Collapse/reopen does not lose the grid. Narrow screens retain visible two-column tiles and scrollable category tabs.

Select a road or shared junction, then choose **Infrastructure → Manhole cover**, **Curb drainage** or **Linear channel drain**. These enable generated geometry on the selection, not decorative placeholder objects. Open **Inspector → Details** to edit:

- Manhole diameter (0.45–1.00 m), station interval (12–100 m) and lateral offset. Circular rims, recessed seams, cast tread and lifting pockets follow road grade/crossfall; lateral placement stays inside the carriageway and clear of raised medians. Bridge decks do not receive manholes. World Y zero is not assumed to be the ground datum.
- Curb-inlet, linear-channel or combined drainage construction, with editable inlet spacing. Road grates sit inside the road lip rather than behind the curb.
- **Inspect a cover / Inspect drainage** frames a modeled service detail in 3D and reveals its layer; it does not edit the graph. The flow overlay remains a separate 2D diagnostic, not a substitute for the drainage mesh.
- Parking has independent cover and drainage toggles. Covers fit entirely inside connected drive aisles; perimeter inlets avoid entry throats and remain inside the footprint.

Covers and channel grates include deterministic albedo/normal/roughness maps and cast-iron metallic response. GLB root extras and OBJ `mesh.json` include service IDs, ownership, positions and dimensions. These are surface infrastructure assets, **not** underground pipe networks or a hydraulic simulation.

### Procedural parking

Choose **Parking & paving → Procedural parking**, then click in plan. Parking is not a fixed prop or a copied premade lot:

- Footprint width/depth, shape, rotation and an independent pivot.
- Automatically repeated parking modules, single-loaded or double-loaded aisles.
- 45°, 60° or 90° bays with editable bay width/depth and drive-aisle width.
- An unblocked entry spine, configurable entry side/width, optional accessible bays and transfer aisles. Clipped drive aisles must connect to the actual footprint entry; disconnected rows are excluded with a warning.
- Live capacity/row metrics, an optional per-row cap, optional bay numbering, adjustable procedural paint wear, real markings and drainage detail.
- Bevelled curbs and a metric paved perimeter; no cars, trees, posts, buildings or furniture are generated with a parking surface.

Changing dimensions regenerates the rows and stall geometry. Bays and 1.25 m transfer aisles are checked for overlap with one another and circulation. Paint, arrows and grates stay inside curved footprints; curb openings use exact entry widths and closed chamfer returns. Insufficient footprint/capacity produces a warning, not fake spaces. Parking is a bounded geometric layout generator, not a certified planning-code or swept-vehicle simulation.

### Included road networks

Northbank streets, an acute merge fixture, Harbour street circuit, channelized crossroads, cloverleaf, trumpet, racing loop/pits with paddock parking, waterfront paths, T-junction, roundabout and diamond interchange. The former city blocks and stylized landscape are removed, including from old imported project data; road graphs and parking are retained.

The diamond has about **5.79 m modeled clearance** and **6.49% maximum grade**. Cloverleaf/trumpet ramp crossings maintain at least **5.19 m** modeled clearance. Those are geometry checks, not structural certification.

## Export

| Format           | Content                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **GLB**          | Indexed geometry, normals, metric UVs, original PBR materials, embedded albedo/normal/roughness textures and decals                             |
| **OBJ ZIP**      | Triangles, face normals, UVs, MTL, albedo/normal/roughness PNGs, `materials.json`, `mesh.json` and `IMPORT.txt`; keep the texture folder intact |
| **`.road.json`** | Editable v1 graph, relative handles, settings, junction setbacks and procedural surface parameters                                              |

OBJ uses `norm`/`map_Pr` PBR MTL extensions. Importers that ignore these extensions can use the material manifest or GLB. Albedo is sRGB; normal/roughness are linear data. Normals use **OpenGL +Y**: invert green for DirectX -Y shaders. UV repeats and normal strengths are recorded in the manifest.

Geometry exports default to **Production** detail, independently of preview detail. Choose Editing in the export menu for a lighter mesh. Export rebuilds a captured project snapshot: it does not change the live graph, undo history or preview tessellation. `mesh.json` records tolerances, owner IDs/names, surface/material mappings, counts, world bounds and the service-feature table. GLB root extras identify the tessellation profile and service features. `materials.json` also records cover/channel wrap modes and metallic response; `Pm` and clamp settings are included in MTL.

Meters, **Y-up**. Hidden detail layers remain in a complete mesh export. Clay/wireframe preview does not alter the original exported materials. No preview environment is exported. A final game's visual quality also depends on its texture resolution, material/shader integration, lighting, terrain and rendering pipeline; this editor does not claim to be a complete AAA environment renderer.

Release HTML is checked byte-for-byte against the published GitHub file. **135 CPU checks and 52 browser checks** pass, including the real parking controls, exports, absence of auto-generated props, mobile layout and offline use.

## Development and verification

Node.js ≥22.12:

```sh
npm ci
npm run dev              # 0.0.0.0:3000; preview hosts accepted
npm run build            # strict TS, Vite, regenerate standalone HTML
npm test                 # geometry, topology, parking and export checks
npm run test:browser     # real interaction, downloads, mobile and offline checks
npm run format:check
```

The app has no backend, no credentials and no browser-facing localhost calls. Sources are TypeScript/Three.js/Canvas; runtime/font notices are in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and the standalone file.

### Integration API

```js
const project = window.frontier.getProject(); // independent JSON-safe copy
const network = window.frontier.getNetwork(); // treat arrays as read-only
window.frontier.select({ kind: "node", id: project.nodes[0].id });
window.frontier.moveJoint(project.nodes[0].id, [10, 0, 5]);
window.frontier.loadTemplate("race");
window.frontier.placeSite("parking"); // enter placement mode
window.frontier.setGeometryDetail("production"); // preview only, graph unchanged
window.frontier.inspectSelection(); // close-up material camera
window.frontier.inspectInfrastructure("manhole"); // also accepts "drainage"
window.frontier.exportProject("glb", "production"); // independent dense export
window.addEventListener("frontier:change", ({ detail }) => {
  const { project, meshes, diagnostics } = detail;
});
```

Selection kinds are `node`, `road` and `site`. `worldToPlan` returns plan-canvas pixels, not page coordinates. Additional methods: `getSelection`, `setMode`, `save`, `undo`, `redo`. There is no permissive cross-origin messaging listener.

### Limits and shortcuts

Tiles: ≤500 roads, ≤1,500 nodes, ≤200 surfaces, 5 × 5 km extent, 5 km maximum alignment control-polygon length and 35 km total. Production tessellation has a separate **15 km control-polygon budget**. Surface-detail and utility-repeat estimates are checked before allocation; the conservative utility budget is 1.5 million vertices. Invalid geometry blocks mesh export but leaves JSON available for repair. Larger worlds should be authored/exported as tiles.

V select · D/P draw · W move · H/Space pan · M measure · B procedural parking · F frame · G grid · S snap · Shift+A templates · Delete remove · Ctrl/Cmd+S save · Ctrl/Cmd+O import · Ctrl/Cmd+Z undo · Esc cancel.
