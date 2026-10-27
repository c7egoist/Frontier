# TerrainStudio — SDF + heightfield terrain generator exhibit

A layer-stack terrain generator with physically-motivated geology, Gaea-style
dendritic rivers and multi-elevation lakes/tarns, 3D SDF voxel cave carving
and overhang surfaces, and a streamlined sculpt/cave/mask authoring editor,
presented in the Frontier Editor UI language. Runs entirely in the browser:
no build step, no dependencies.

**Open it:** serve this repository over HTTP and visit
`/Exhibits/TerrainStudio/` (any static server works; the module scripts
require `http://`, not `file://`). WebGL 2 with `EXT_color_buffer_float`
preferred (graceful fallbacks included).

## Fourteen field-tested presets (1024² · 2 km · 2 m texels)

| Preset | Category | Geology in one line |
| --- | --- | --- |
| **Bernese Alps** | Alpine | Glaciated granite massif: sharp arêtes, wide U-valleys, cirque tarns, alpine rivers and 3D karst caves |
| **Khumbu Himalaya** | Alpine | Active collision front: dark Lhotse-banded gneiss walls, pyramidal horns, meltwater rivers and gorge caves |
| **Colorado Canyon** | Arid | Sedimentary staircase: hard beds hold cliffs, soft beds bleed slopes, Redwall alcove caves & SDF rock arch |
| **Rocky Hamada** | Arid | Sandstone badlands & wadi canyonlands: dark desert-varnish mesas, golden sand corridors, wadi pools & caves |
| **Dolomite Towers** | Alpine | Pale carbonate reef towers and castellated ramparts above green alpine scree aprons, an emerald tarn and caves |
| **Patagonian Fitz Roy** | Alpine | Wind-scoured granite spires rising above a turquoise glacial piedmont lake and braided outwash streams |
| **Tatra Cirque & Tarns** | Alpine | Amphitheatre of dark granite arêtes cradling multi-level glacial paternoster tarns linked by cascades |
| **Highland Glen & Loch** | Rivers & Lakes | Classic U-shaped glaciated glen flooded by a deep Highland loch, fed by cascading mountain rivers |
| **Norwegian Fjord** | Rivers & Lakes | Deeply drowned glacial fjord with sheer gneiss walls, high plateau snowfields, hanging valley streams and caves |
| **Braided River Valley** | Rivers & Lakes | Wide gravel-bed braided river plain fed by eroded greywacke mountain catchments, alluvial fans and valley pools |
| **Icelandic Caldera Lake** | Volcanic & Karst | Dark basalt ring-ridge and black tephra slopes enclosing a luminous turquoise crater lake and lava tubes |
| **Guilin Karst River** | Volcanic & Karst | Fengcong limestone tower-karst pinnacles and solution caves rising out of a meandering jade river plain |
| **Monument Butte & Arroyo** | Arid | Isolated De Chelly red-sandstone mittens and stratified mesas cut by dendritic flash-flood arroyos and pools |
| **Painted Badlands & Fans** | Arid | Intricately gullied polychrome mudstone ridges shedding sediment into coalescing alluvial fans and a playa |

Every preset is an ordinary editable layer stack — nothing is baked. Open
one, restack it, re-seed it, save your own.

## How the terrain is made

`Source/ReliefField.js` is the substrate: a 1024² heightfield plus a
registry of full-resolution channels — **Flow, Water, Wear, Deposition,
Hardness, Snow, Moisture, Occlusion, Protrusion, CaveCutout** (derived by
simulation) and **Mask** (`Combine mask (B&W)`, plus any additional black
and white masks you create for combining terrains in the stack).

`Source/LayerStackEvaluation.js` runs the stack bottom-up with per-layer
`Cache` and `UnmaskedCache` buffers so editing a layer or painting its
black-and-white combine mask updates in real time. `BuildRidgeUplift` and
`BuildTectonicFront` combine connected anisotropic structural fold spines
with fold-advected lateral spur ribs and concave flank shaping (`Unit^1.38`)
so mountains form sharp dihedral arêtes, pyramidal horns, and branching
buttresses with wide concave valleys between them.

`Source/ErosionSequence.js` holds the asynchronous, cancellable solvers:

- **Hydraulic erosion** — droplet simulation with slope-saturated sediment
  capacity and terminal speed; writes Wear and Deposition.
- **Drainage solve & post-incision hydrology (`BakeHydrologyChannels`)** —
  priority-flood depression filling + MFD (Holmgren slope⁴) accumulation;
  dilates major valley trunk rivers into multi-texel channels bordered by
  alluvial gravel/sand bars and populates bounded valley tarns and pools.
- **River erosion (fluvial)** — area-gated stream-power incision applied
  across a √A valley swath with routed downstream sediment load and
  deposition into floodplains, fans and deltas.
- **Thermal erosion** — 8-neighbour proportional angle-of-repose relaxation
  with crystalline bedrock competence (`HardnessNorm`) so convex arêtes and
  upper horn walls hold steep cliff angles (`66°–76°`) while concave chutes
  and lower aprons relax at `31°–35°` into realistic talus cones.
- **Glacial polish** — strictly valley-gated (`Concavity > 0`) so glaciers
  scour parabolic U-troughs and overdeepened cirque tarn basins without
  ever rounding off the sharp arête crests and horns above them.
- **Aeolian settle** — saltation slabs depositing golden sand sheets in
  wind shadows and flat wadi corridors.
- **Snow accumulation** — multi-scale concavity and slope hold read from an
  immutable source snapshot.

`Source/DistanceStamps.js` handles 3D SDF/voxel geometry (`PolygoniseStamps`):
- **3D SDF Caves (`ConstructCave`, `CaveDistance`, `BuildProceduralCaves`)** —
  vaulted 3D cave capsules with flattened floors, flared entrances and 3D
  karst wall roughness are subtracted from the terrain SDF and polygonised
  with Surface Nets. Breached heightmap roof texels are written to the
  `CaveCutout` channel (`FieldTexC.b`) and discarded in the terrain shader.

`Source/ReliefRasterization.js` is the WebGL2 renderer:
- **768² vertex-displaced heightfield mesh** with vertex + normal `\/`
  valley-concavity relaxation, paired with the 3D Surface-Nets cave/overhang
  mesh (`StampProgram`), the bounded 3D lake/fjord water sheet
  (`WaterProgram`), and the fragment-traced implicit density renderer
  (`RaymarchFragmentGlsl`, ViewMode 14).
- **Meso + micro 3D rock cleavage & Gaea-style river/tarn shading**:
  `ShadeSurface` combines 3D elevation-banded shelves (`ShelfNormal`),
  meso-scale (~20 m) 3D triplanar rock cleavage (`MesoNormal`), close-up 3D
  micro-normals, alluvial riverbank gravel collars (`BankCollar`), and
  physically-based river/tarn water absorption with Fresnel sky reflection,
  sun specular, and whitewater rapids foam.


## Round 7 — Photorealistic Shading, Gaea-Style Rugged Outcrops & Rocks, and Terrain Quality Selector

1. **Photorealistic Rock, Snow & Atmosphere Shading (`ReliefRasterization.js`, `ErosionSequence.js`)**:
   - **Crisp 1.15-Texel Couloir & Crevice Normals**: Removed the 18-metre (`4.5` texel) normal blur inside concave mountain couloirs so gullies, dihedrals, outcrop crags, and boulders retain razor-sharp geometric normals, restricting valley-pinch relaxation strictly to flat valley bottoms (`FineNormal.y > 0.88`).
   - **Scale-Invariant 3D Angular Rock Cleavage (`PerturbNormal` + `RidgedOctaves`)**: Fixed the finite-difference chain-rule scaling (`Step = 0.24 / Scale`) and replaced smooth bilinear noise with multi-octave rotated 3D ridged rock fracture planes, adding meso-scale outcrop cleavage (`~19 m`) and crag/boulder facets (`~4 m`).
   - **Coherent Alpine Snowpack Pierced by Bedrock Crags (`SnowAccumulation`)**: Relaxed over-aggressive convex ridge wind-scour and slope clipping so snow blankets upper cirques, benches, and summits up to the angle of repose while steep cliff faces (`> 42°`) and protruding bedrock outcrops pierce sharply through the snow.
   - **Flat-Gated Reflective Water & Clear Studio Aerial Perspective (`ApplyFog`)**: Restricted reflective turquoise water sheets to flat valley rivers and lake basins (`GeometricNormal.y > 0.90`) so steep mountain torrents read as dark wet bedrock, and added a `1250 m` clear foreground distance to `ApplyFog` so the 2 km massif renders with Gaea-style studio clarity.
2. **Gaea-Style Rugged Bedrock Outcrops & Scattered Talus Rocks/Boulders (`ApplyRuggedOutcropsAndRocks`, `RockOutcrops`)**:
   - Added `ApplyRuggedOutcropsAndRocks` in `ErosionSequence.js` and registered the **Rugged outcrops & rocks** (`RockOutcrops`) surface layer in `LayerStackEvaluation.js`.
   - Synthesises anisotropic, stepped bedrock outcrops (`18.5 m` default amplitude) along ridges, shoulders, and steep mountain flanks plus multi-texel cellular rockfall boulders (`5.8 m` default amplitude) across talus aprons, moraines, and canyon benches, coupled with 3D shader boulder masks (`BoulderMask`), warm/cool mineral weathering, and basal contact AO (`BoulderContactAO`).
3. **Interactive Terrain Quality / Resolution Selector (`index.html`, `TerrainStudio.js`, `ReliefRasterization.js`)**:
   - Added interactive **Quality / Resolution** selectors (`512² Draft`, `1024² 1K`, `2048² 2K High`, `4096² 4K Ultra`) in three places: the top-left viewport pill (`#chip-resolution`), the bottom-center viewport dock (`#quality-select`), and the top card of the **Scene** inspector tab (**Terrain quality & outcrops**), alongside live **Rugged outcrops** and **Rock & boulder scatter** sliders.
