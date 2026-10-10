# Frontier · Road authoring

A self-contained HTML tool for generating **connected highway bridges, city roads, paving and procedural parking** for game-engine asset workflows. Linked 2D/3D editing, shared junction pivots and exports remain live. The workspace is deliberately asset-only: no buildings, trees, benches, statues, parked vehicles or decorative environment meshes. Planting openings and block perimeters are empty infrastructure, not scenery.

## Open

Open [`RoadDesigner.html`](./RoadDesigner.html), or use the [verified reference-scaled interchange and bridge snapshot on raw.githack](https://raw.githack.com/c7egoist/Frontier/f9fd79f7902a4ebed9c8679a95ccd5dc0a193ffb/RoadDesigner.html). No install or external asset requests are required. raw.githack can show a safety notice first; choose **Open the page**. Browser-local saves do not transfer between hosting origins: export/import JSON to move a layout.

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
- **Demand-rendered preview:** the 3D scene redraws for geometry, camera/damping, resize, shading, lighting, selection and layer changes—not continuously while idle. Hidden 3D panes defer GPU work until shown again, while graph edits still update. The status reads **Idle** when no draw is needed; this does not lower mesh fidelity or change exports.
- **Draw:** click points in plan. Snap to shared nodes and actual cubic curves; at-grade crossings are split into shared topology, while elevated crossings remain separate.
- **One junction pivot:** X/Z in plan, X/Y/Z in 3D. Connected approaches and relative Bézier handles follow the same node. Road pivots and numeric transforms remain editable.
- **Merge construction:** acute-angle runout includes radius and road width. Both ends share the available trim budget rather than wasting 43% at a free end. Paving setback is adjustable; wide inward offsets cannot fold around the merge nose. Inappropriate zebras are suppressed and junction guidance is surface-clipped.
- **Paving:** nine world-scaled bond/panel patterns, independent pavement width, flush/stone/rumble curb profiles and edge courses. Albedo, normal and roughness channels are available in GLB and the OBJ texture package. Relief is generated independently from stone colour, rather than turning colour variation into fake displacement. Street/racing road and junction curbs share a continuous 15 mm top chamfer; motorway flush shoulder profiles do not generate raised urban curbs.
- **Footways and access:** 4.2 m default sidewalks along the full alignment, widths up to 12 m, independent footway crossfall and curb upstand, graded corner ramps and authored vehicle crossings. The fresh Northbank demo includes one authored driveway; new roads do not auto-populate entries.
- **Infrastructure:** procedural service covers, framed cast-iron gullies, physical side-entry curb throats with inspection lids, hollow drainage kerbs, recessed linear-channel grates and continuous gutters. Seven physical guardrail/parapet profiles and connected steel/concrete bridges are available. Signs, signal heads and lights are optional controls; the city template deliberately includes street lighting, signs and one signalized boulevard junction.
- **Persistence:** local autosave, JSON import/export, transactional undo/redo, rename/delete and scene search.

### Reference-scaled highway bridges and divided interchanges

- **Networks → Connected highway bridge:** two separate one-way carriageways, 3.65 m lanes, 2 m symmetric shoulders, 7.2 m alignment elevation, two 48 m overpasses, four directional access ramps and a continuous lower avenue. Approaches and ramps use shared graph nodes, not detached bridge props.
- **Details → Bridge structure:** steel I-girder or concrete-girder sections, closed thin deck bases/slabs, bearings, diaphragms, chamfered piers and real foundations. Adjustable total underside depth (0.75–2.4 m) and pier bay spacing (16–50 m) are consumed by the geometry. Clearance subtracts the actual authored structural depth and lower road crown, not a hardcoded material estimate.
- Elevated bridge joints stitch the deck and beams between their trimmed spans. Shared span ends are bearing seams rather than tall abutment walls across a connected road. Support stations test lower roads/ramps and an indexed set of actual triangulated junction paving, cycleways, footways, parking and plot bands. Height-clipped intersection checks use oriented footing reservations and the wider headstock at its own elevation; open courtyard/gateway holes stay open. A blocked pier is moved to safe edges of the lower corridor when possible. This is a geometric exclusion rule, not a structural load solver.
- **Mixed bridge joins:** straight steel/concrete or different-depth members receive a real shared transition, not mismatched end caps. Each arm retains its own material and mouth section, tapering into the joint depth. Clearance reporting consumes that same taper. Per-member road/material/mouth-depth/joint-depth metadata is included in GLB and OBJ manifests, and bridge inspection prefers the selected joint.
- **Insert connected bridge section / Infrastructure → Insert connected highway bridge:** on a selected ground alignment at least 600 m long, insert two level landings and three connected sections. Original shared endpoint positions, XZ spline and direction are preserved. The default rise is 7.2 m. Approximately 4% approach geometry is required; steep or conflicting approaches, vehicle entries and insufficient length/capacity are refused atomically. Undo/redo restores the operation. A manual Elevated bridge deck toggle constructs at the current height and no longer lifts neighbouring streets.
- **Clovers and T networks:** the C-D cloverleaf has four directional motorway carriageways, separate collector-distributor roads, four 270° loops and four direct right-turn links. The legacy `trumpet` ID now generates a genuine single-loop trumpet, with one 270° loop, two direct links and one semi-direct movement. Directed reachability covers all required movements. Nominal loop radius is 120 m with a 50 km/h loop setting; the minimum measured curve radius including transitions is about 112.1 m.

- **Geometry → Traffic handedness:** right/left lane-direction policy controls bike/bus stencil directions, incoming-only stop bars and signal-pole/mast placement. Signal heads are omitted from outgoing-only one-way arms. Motorway shoulder width is independently editable. Channelized crossroads have compact 3.25 m motor lanes, 3.5 m right-turn slip lanes and small rounded paving islands.
- **Curbs and gores:** exact tangent and mid-arc knots keep a short rounded splitter from turning into a chamfer between long straight returns. Painted gores are derived from the actual sampled curb tip, remain on triangulated asphalt and stop 1.6 m before the physical nose. Ordinary crossroads no longer inherit unrelated merge dividers. **Inspect curb splitter** frames the real construction.
- **Roadside protection:** W-beam, three-wave thrie-beam, hollow box-beam, four-cable, pedestrian tube railing, concrete safety barrier and bridge parapet/vertical infill. These are distinct swept sections with caps, posts/sockets and attachment detail, not a texture selector. Corner sweeps use the actual fillet normals; mixed designs receive a connected transition. Infrastructure thumbnails show the generated profile close-up. Production includes denser bolt/hardware detail.

The corrected diamond/bridge/city crossings have **5.431 m minimum modeled clearance** and **3.086% maximum alignment grade**. C-D cloverleaf/trumpet clearances are **5.475 m**; maximum alignment grades are **3.158% / 3.017%** respectively. These are measured geometry checks, **not civil, traffic-safety or structural certification**. The complete source audit and dimensioned schematics are linked below. Larger networks remain tiled game assets; use Editing preview when appropriate.

### Connected city road network — no buildings or trees

**Networks → Connected city network** builds a five-by-five street grid linked to the highway bridge/underpass and four ramps. It includes a bus/cycle boulevard and central avenue, parallel-parking local streets, red shared-cycle streets, 16 gated open plots and four procedural parking courts with true split-road access connections. The interiors remain empty; no buildings or trees are generated.

- **Shared cycle street:** full-width red carriageway and direction-aware bicycle stencils, without falsely adding dedicated bicycle lanes or centre separators.
- **Parking-pocket curb extensions:** consume 2.1 m of parking width near pedestrian crossings, not travel lanes. The outside footway boundary/elevation and motor-lane/crown scale are preserved. Separate protected/painted cycle lanes prevent bulbs from pinching them. The radius solver includes the enlarged corner footway. Roadside parking stops before the pocket taper.
- **Crossings and refuges:** zebras conform to the actual curve/grade and share the station and length of the dropped curb ramps. Stop bars cover incoming lanes only; one-way outgoing mouths do not receive stop bars. Medians from 1.2 m form continuous rounded raised islands around genuinely flat crossing passages with tactile panels, rather than a raised obstruction across the zebra.
- Open-plot collision diagnostics test the actual solid paving band and entry mask, not the empty interior or gate throat. Genuine band encroachment still warns.
- District-scale plan labels become more selective on large networks and return with zoom. The city opens around its central crossing; fit/zoom can reveal the entire connected network. Cached static shadows keep the detailed bridge/rail geometry from regenerating a light map during every camera orbit.

### Pedestrian footways and vehicle crossings

- **Surface → Paving pattern:** sidewalk width (0–12 m), stone/flush/rumble profile, curb upstand (0.04–0.30 m) and footway crossfall (−3% to +3%). Positive crossfall rises away from the curb, draining toward the road. Flush/racing profiles cap the effective upstand at 40/80 mm. Concrete curb faces have world-scaled microaggregate PBR and vertical-face UVs.
- **Details → Pedestrian corner ramps:** enable ramps, adjust clear width (1.4–3.4 m) and run (0.8–6 m), and toggle tactile warning paving. Crossing-aligned ramps lower the actual curb and paving to a 6 mm lip, have flared sides and retain a clear landing where the available width allows. The run is clipped to fit the footway. Tactile paving has 400 mm modules with separate albedo/normal/roughness maps. The inspector reports the generated cross-ramp gradient, rather than assuming that the requested run fits.
- **Details → Vehicle crossings / Infrastructure → Vehicle driveway crossing:** author up to 20 individual entries per road, with curve position, alignment side, 3–12 m opening width and 0–12 m apron beyond the sidewalk. A dropped curb, graded fore-ramp, continuous pedestrian landing and concrete apron are generated together. Rails, road-edge paint, curbside parking bays and explicitly enabled roadside poles/signs leave the opening clear. Entries are not decorative car props or automatic parking connectors.
- Entry positions are normalized **cubic parameters**, not arc-length fractions. Splitting a road or resolving a crossing assigns each entry to exactly one segment and remaps its parameter, preserving its authored world position. Too-close/overlapping entries remain in the editable graph with a warning; they are not silently duplicated into the mesh.
- **Inspect a corner ramp / Inspect entry** frames the generated construction without moving the shared pivot or changing the graph. Paving is revealed if its layer was hidden. Ramp dimensions, effective rise/run, cross-gradient, clear landing, station, side and apron length are in `network.footways`, GLB extras and OBJ `mesh.json`.

The **Wide pedestrian street** preset uses 5.5 m footways and linear paving. Infrastructure kits also expose Wide pedestrian sidewalk, Corner curb ramp, Vehicle driveway crossing, Side-entry curb drain and Hollow drainage curb as mesh-generated thumbnails. Ramps are suppressed on bridge decks, in acute merge throats and where a footway cannot fit them. These are game-asset geometry controls, **not accessibility, planning-code, structural or swept-vehicle certification**.

### Clean offsets, European mobility and empty growing spaces

- **Widened junction corners:** road and junction trimming share an offset-aware radius floor. Line/arc/line fillets use analytic tangents/normals, not curvature estimated from resampled mesh chords. Increasing a footway to 12 m no longer creates alternating-width pavement spikes. Requested node radius remains editable; the inspector shows the effective offset floor. The actual circular fit can be smaller on a constrained mouth: approach footways then taper continuously, retain exact seams and report a warning. `mesh.json` records requested radii, offset floors and actual fitted corner radii (`0` identifies a cubic fallback).
- **Geometry → European mobility profile:** reserve outer motor lanes for buses (one lane on a one-way road; both on a two-way road), choose asphalt/red bus surfacing, or add painted/protected cycle space. Motor lane count is not inflated: 1.2–3.5 m cycle tracks and 0.3–1.5 m protection buffers add width outside it. Concrete buffers have physical gaps at vehicle crossings and end before pedestrian crossings. Painted cycle lanes alongside parking retain an adjustable hatched door buffer; unparked painted lanes keep their original envelope. BUS/bicycle stencils, contraflow cycle directions, conforming junction corner ribbons and set-back cycle crossings are actual mesh/material assets. Roadside parking occupies a separate strip between the outer motor lane and cycle buffer, not the bus or bicycle lane.
- **European road presets:** European mobility boulevard (4 motor lanes, outer bus reservation, protected red cycling and parking); Bus-priority avenue (2 reserved bus lanes and protected cycling, no car parking); Protected cycle street with parking; and Urban bicycle lanes with parking and a hatched door buffer.
- **Details → Empty planting openings:** generate framed footway pits at an adjustable interval, with width/length controls and optional iron grates. The paving is physically cut; soil is recessed 160 mm and grates have actual slots and a central future-tree opening. Placement preserves at least 2 m through-walk, avoids ramp/driveway flares, suppresses too-tight placements and excludes bridges. **No trees are generated.** Curved pit rims share the exact boundary stations of their paving opening.
- **Parking & paving → Empty tree planting pit:** independently place/rotate/size a small 0.8–6 m × 0.8–8 m framed piece. Standalone pieces do not perform arbitrary booleans against existing imported/solid paving: place them in open space, or use automatic road pits to cut a footway. Soil recesses/grates are shallow game assets, not horticultural/root-volume or drainage design.
- **Layer/inspection controls:** bus, cycle and empty-planting layers are independent in both linked views. Inspect mobility/planting buttons frame the asset and reveal its layer without changing the graph.

### City blocks without buildings

**Parking & paving → Urban block perimeter** creates a configurable rounded/triangular/elliptical frontage ring with inset paving borders and a closed plinth. The default central plot is genuinely open — no hidden paving roof, building or bottom slab fills it. Width, depth, rotation, rounding, frontage-band width and an explicit paved-courtyard option remain editable. A configurable north/south/east/west vehicle gateway cuts the paving, border and plinth; align a road driveway and parking entrance yourself.

The **European mobility quarter** network is a complete editable example with 12 roads, **180 marked roadside bays**, bus/cycle junctions, 4 gated open blocks, 4 procedural permeable parking courts, aligned vehicle aprons, empty footway pits, planting islands and marked EV reservations. Its plot/court footprints regenerate from the widened road envelopes, preserving frontage and access. Buildings and trees are deliberately absent. Legacy architectural `block`/landscape `water` data remain excluded; the new `urban-block` kind is infrastructure only.

### Asset library and road utilities

The library is a **multi-column, vertically scrolling grid**. Preview images and specifications are always visible; scrolling reaches every tile. Drag its upper divider, or focus that divider and use ↑/↓ (Home/End for limits), to resize it. Collapse/reopen does not lose the grid. Narrow screens retain visible two-column tiles and scrollable category tabs.

Select a road or shared junction, then choose **Infrastructure → Manhole cover**, **Curb drainage** or **Linear channel drain**. These enable generated geometry on the selection, not decorative placeholder objects. Open **Inspector → Details** to edit:

- Manhole diameter (0.45–1.00 m), station interval (12–100 m) and lateral offset. Circular rims, recessed seams, cast tread and lifting pockets follow road grade/crossfall; lateral placement stays inside the carriageway and clear of raised medians. Bridge decks do not receive manholes. World Y zero is not assumed to be the ground datum.
- Curb-inlet, linear-channel or combined drainage construction, with editable spacing and a separate **Curb inlet style** choice. Road gully grates sit inside the road lip. **Side-entry** removes the solid curb face and builds jambs, a soffit, recessed throat and sealed concrete sidewalk inspection slab. **Hollow** builds repeated arched face apertures with depth and occasional top access grates; its module/port counts remain stable between Editing and Production. Face drains avoid access ramps. Low/flush curbs fall back to road grates when a face inlet cannot fit.
- For hollow curbs, the interval control spaces the top access grates; regular 650 mm kerb modules determine the face-port repetition. Service metadata records the style, actual port count and top access-grate count. The displayed inlet count includes the individual hollow ports, not just two continuous runs.
- **Inspect a cover / Inspect drainage** frames a modeled service detail in 3D and reveals its layer; it does not edit the graph. The flow overlay remains a separate 2D diagnostic, not a substitute for the drainage mesh.
- Parking has independent cover and drainage toggles. Covers fit entirely inside connected drive aisles; perimeter inlets avoid entry throats and remain inside the footprint.

Covers, channel grates, tactile paving and concrete curbs include deterministic albedo/normal/roughness maps and cast-iron metallic response. GLB root extras and OBJ `mesh.json` include service IDs, ownership, positions and dimensions. These are surface infrastructure assets, **not** underground pipe networks or a hydraulic simulation.

### Roadside parking bays

**Networks → European mobility quarter** now generates bays on both sides of all twelve roads. The European boulevard, protected-cycle street and painted-cycle presets include parking when applied or drawn. Existing saved roads retain their explicit settings; select a road and use **Details → Road markings & parking → Curbside parking → Parallel bays** to enable them.

- Real four-sided white marking meshes, with periodically repeated white **P** stencils, visible in both linked views and included in mesh exports. No parked-car props.
- Nominal **5.5 × 2.1 m** bays on a 6 m pitch, in a dedicated **2.3 m strip per side**. Motor/bus lane count and widths are unchanged; cycle tracks/buffers sit outside parking.
- The entire box remains at least 10 m from the trimmed junction mouth. Full corner-ramp/driveway flares plus clearance are excluded on the affected side. Parking-pocket crossing tapers remain unoccupied.
- Narrowed, folded or excessively shortened curve boxes are omitted, not counted as usable spaces. Bridges, motorway/racing alignments and all-bus carriageways do not receive car bays even if parking is manually requested.
- A live roadside-bay count and **Inspect roadside parking** camera control appear in the existing Slate Details card. Inspection reveals the marking/bus/cycle layers without changing the graph or history.
- `network.roadsideParking`, `frontier:change`, GLB extras and OBJ `mesh.json` include per-bay IDs, road ownership, side, traffic direction, station range, position, conservative plan dimensions and four footprint corners. `parkingSpaces` includes both roadside bays and procedural court capacity.

Dimensions are geometric game-asset defaults, not certified parking/traffic-code or vehicle-swept-path assessments.

### Procedural parking

Choose **Parking & paving → Procedural parking**, then click in plan. Parking is not a fixed prop or a copied premade lot:

- Footprint width/depth, shape, rotation and an independent pivot.
- Automatically repeated parking modules, single-loaded or double-loaded aisles.
- 45°, 60° or 90° bays with editable bay width/depth and drive-aisle width.
- An unblocked entry spine, configurable entry side/width, optional accessible bays and transfer aisles. Clipped drive aisles must connect to the actual footprint entry; disconnected rows are excluded with a warning.
- Live capacity/row metrics, an optional per-row cap, optional bay numbering, adjustable procedural paint wear, real markings and drainage detail.
- Optional empty soil islands replace periodic normal bays, never circulation or accessible transfers. The surface is cut around each recessed opening; remaining usable bays determine capacity. Back-to-back openings stay separately framed rather than overlapping triangulation holes.
- Asphalt, permeable-paver or concrete bay finishes; configurable EV-reserved bay stencils (not charging equipment). Accessible bays remain separately reserved and numbered capacity has no gaps.
- Bevelled curbs and a metric paved perimeter; no cars, trees, posts, buildings or furniture are generated with a parking surface.

Changing dimensions regenerates the rows and stall geometry. Bays and 1.25 m transfer aisles are checked for overlap with one another and circulation. Paint, arrows and grates stay inside curved footprints; curb openings use exact entry widths and closed chamfer returns. Insufficient footprint/capacity produces a warning, not fake spaces. Parking is a bounded geometric layout generator, not a certified planning-code or swept-vehicle simulation.

### Included road networks

Connected city network, connected highway bridge, dumbbell/twin roundabouts, European mobility quarter, Northbank streets, an acute merge fixture, Harbour street circuit, compact channelized crossroads, divided cloverleaf, single-loop trumpet interchange, racing loop/pits with paddock parking, waterfront paths, T-junction, roundabout and divided diamond interchange. Legacy architectural blocks and stylized landscape remain excluded from old imported project data; road graphs and parking are retained. New open block-perimeter pieces do not generate architecture.

All template defaults are game-asset starting layouts. No template generates architecture or trees; only explicitly designed infrastructure such as the city street lights/signals is included.

## Interchange dimensions and source verification

The interchange/bridge families have been rebuilt from published FHWA/MoDOT/Caltrans/MassDOT schematics and geometric controls, with explicit measured dimensions. See the [source audit and before/after measurements](./docs/INTERCHANGE_REFERENCES.md), [dimensioned diamond](./docs/reference-layouts/diamond.svg), [C-D cloverleaf](./docs/reference-layouts/cloverleaf.svg) and [single-loop trumpet](./docs/reference-layouts/trumpet.svg).

- **Conventional diamond:** 260 m terminal centres; perpendicular local-street ramp tangents; two 48 m overpass decks. The raised approaches and four ramps use closed fill instead of being treated as kilometres of viaduct.
- **C-D cloverleaf:** four nominal 120 m loops, separate collector-distributor roads and two-lane core collectors; 304 m C-D graph-port spacing and about 410.6 m between actual gore noses. Four 96 m structural spans; measured loop minimum radius is about 112.1 m, not the previous 17.8 m connection.
- **Genuine trumpet:** one 270-degree loop, two direct right-turn links and an outer semi-direct connection, preserving all six required movements between its three arms. Two 84 m stem spans, rather than the old twin-loop T arrangement.
- **Speed-change lanes:** an actual one-sided extra lane, 150 m exit or 200 m entrance full-width run plus a 90 m pavement taper. Geometry controls preserve the through lanes and shoulder; keep-left mirrors the side. User-shortened zones are reported, not silently advertised as full-length.
- **Bridge proportions:** 7.2 m alignment datum / 1.6 m depth in these templates; actual minimum modeled road clearances 5.431–5.475 m. Width-derived 3–5 girder arrangements and individual bearings, deeper pier caps and structure-to-fill abutments. Supported span lengths are exported.
- **Live dimension controls:** Geometry → Reference dimensions shows cubic minimum radius, maximum alignment grade, actual structural length, girder layout, measured weave spacing and published-source links. Details → Bridge structure exposes structural start/end percentages and earth-supported approaches.
- **Connected insertion:** a nominal 64 m deck and two filled approaches; minimum 600 m host, increasing with requested rise, near 4% grades. Shared endpoints and the exact XZ alignment remain unchanged. The operation refuses insufficient/blocked approaches atomically.

The selected cross-sections, radius/grade targets and flat-ground reference are explicit **game-asset assumptions**, not universal standards or traffic/structural certification. Traffic demand, queues, weaving capacity, sight distance, superelevation and structural loads require separate project-specific design. Highway shoulder profiles are flush rather than raised urban curbs. The user's European parking streets are unchanged.

Run `npm run audit:design` to regenerate the dimensioned schematics and assert their measured geometry. `network.designReview`, `auxiliaryLanes` and `embankments` are available through the live API, change events, GLB extras and OBJ manifests.

## Export

| Format           | Content                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **GLB**          | Indexed geometry, normals, metric UVs, original PBR materials, embedded albedo/normal/roughness textures and decals                             |
| **OBJ ZIP**      | Triangles, face normals, UVs, MTL, albedo/normal/roughness PNGs, `materials.json`, `mesh.json` and `IMPORT.txt`; keep the texture folder intact |
| **`.road.json`** | Editable v1 graph, relative handles, settings, junction setbacks and procedural surface parameters                                              |

OBJ uses `norm`/`map_Pr` PBR MTL extensions. Importers that ignore these extensions can use the material manifest or GLB. Albedo is sRGB; normal/roughness are linear data. Normals use **OpenGL +Y**: invert green for DirectX -Y shaders. UV repeats and normal strengths are recorded in the manifest.

Geometry exports default to **Production** detail, independently of preview detail. Choose Editing in the export menu for a lighter mesh. Export rebuilds a captured project snapshot: it does not change the live graph, undo history or preview tessellation. `mesh.json` records tolerances, owner IDs/names, surface/material mappings, counts, world bounds and service-feature, footway, mobility, empty-planting, block, bridge, barrier, splitter, street-detail, roadside-parking, measured-design-review, auxiliary-lane and approach-fill tables, plus actual junction offset fits. GLB root extras identify the tessellation profile and include the same infrastructure tables. `materials.json` also records cover/channel wrap modes and metallic response; `Pm` and clamp settings are included in MTL.

Meters, **Y-up**. Hidden detail layers remain in a complete mesh export. Clay/wireframe preview does not alter the original exported materials. No preview environment is exported. A final game's visual quality also depends on its texture resolution, material/shader integration, lighting, terrain and rendering pipeline; this editor does not claim to be a complete AAA environment renderer.

Release HTML is checked byte-for-byte against the published GitHub file. **323 CPU checks and 92 browser checks** pass, including published-reference cubic curvature/grade/spacing checks, bounded overpass/abutment/fill geometry, full production C-D cloverleaf, single-loop trumpet reachability, one-sided handed speed-change lanes, source/measurement exports and clear underside inspection, boxed European roadside-bay geometry/capacity, bus/cycle/door-buffer separation, access/mouth exclusions, parking live controls/history/inspection and embedded export/offline stencils, idle/hidden-pane render invalidation, real support surface/height exclusion, mixed member/tapered-clearance checks, incoming-only handed signal placement, directed interchange reachability, actual bridge/support clearances, atomic connected bridge insertion, seven distinct barrier sections, exact rounded splitter tips and geometry-derived gores, pocket/refuge/shared-cycle treatment, the exact widened/elevated Northbank corner reproduction, analytic offsets, short-fit tapering, bus/cycle lane separation, real planting apertures/grate slots, gated block rings, parking islands/EV capacity, legacy drainage/ramp/driveway checks, PBR exports, mobile layout and fully offline use.

Published standalone: **1,165,059 bytes**, SHA-256 `f1b0c040beef008213870893269a16b5448e06a7d36376008a3640146a0fef5f`, byte-verified against GitHub blob `c9234a97d7968b72e3bbf9e3eb74156ab1e8ae3e`. The immutable raw.githack URL uses code commit `f9fd79f7902a4ebed9c8679a95ccd5dc0a193ffb`.

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
const preview = window.frontier.getPreviewStats(); // draw/idle counters, camera copy, visibility, pending state; null without WebGL
window.frontier.select({ kind: "node", id: project.nodes[0].id });
window.frontier.moveJoint(project.nodes[0].id, [10, 0, 5]);
window.frontier.loadTemplate("race");
window.frontier.placeSite("parking"); // enter placement mode
window.frontier.setGeometryDetail("production"); // preview only, graph unchanged
window.frontier.inspectSelection(); // close-up material camera
window.frontier.inspectInfrastructure("manhole"); // also accepts "drainage"
window.frontier.addDriveway(); // requires a selected non-bridge road / connected node
window.frontier.inspectFootway("corner-ramp"); // also accepts "driveway"
window.frontier.inspectPlanning("planting"); // also accepts "mobility"
window.frontier.loadTemplate("europe"); // bus/cycle roads, 180 roadside bays, gated blocks and courts
window.frontier.loadTemplate("city"); // connected streets, parking access and highway bridge
window.frontier.loadTemplate("bridge"); // divided highway + four ramps + underpass
window.frontier.inspectRoadDetail("bridge"); // also "splitter", "street" and "parking"
const groundRoadId = network.spans.find(
  (s) => !s.road.bridge && s.alignment.length >= 600,
)?.road.id;
if (groundRoadId) window.frontier.insertBridge(groundRoadId, 8, "steel"); // atomic
window.frontier.placeSite("tree-pit"); // empty independent planting opening
window.frontier.exportProject("glb", "production"); // independent dense export
window.addEventListener("frontier:change", ({ detail }) => {
  const {
    project,
    meshes,
    diagnostics,
    services,
    footways,
    mobility,
    plantings,
    blocks,
    bridges,
    barriers,
    splitters,
    streetDetails,
    roadsideParking,
    designReview,
    auxiliaryLanes,
    embankments,
  } = detail;
});
```

Selection kinds are `node`, `road` and `site`. `worldToPlan` returns plan-canvas pixels, not page coordinates. Additional methods: `getSelection`, `setMode`, `save`, `undo`, `redo`. There is no permissive cross-origin messaging listener.

### Limits and shortcuts

Tiles: ≤500 roads, ≤1,500 nodes, ≤200 surfaces, 5 × 5 km extent, 5 km maximum alignment control-polygon length and 35 km total. Production tessellation has a separate **32 km control-polygon budget**. Surface-detail and utility-repeat estimates are checked before allocation; the conservative utility budget is 1.5 million vertices, including physical hollow-kerb repetition. Roads support at most 20 authored driveway entries each. Invalid geometry blocks mesh export but leaves JSON available for repair. Larger worlds should be authored/exported as tiles.

V select · D/P draw · W move · H/Space pan · M measure · B procedural parking · F frame · G grid · S snap · Shift+A templates · Delete remove · Ctrl/Cmd+S save · Ctrl/Cmd+O import · Ctrl/Cmd+Z undo · Esc cancel.
