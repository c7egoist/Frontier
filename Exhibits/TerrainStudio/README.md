# TerrainStudio — SDF + heightfield terrain generator exhibit

A layer-stack terrain generator with physically-motivated geology, 3D SDF
voxel cave carving and overhang surfaces, and a streamlined sculpt/cave/mask
authoring editor, presented in the Frontier Editor UI language. Runs
entirely in the browser: no build step, no dependencies.

**Open it:** serve this repository over HTTP and visit
`/Exhibits/TerrainStudio/` (any static server works; the module scripts
require `http://`, not `file://`). WebGL 2 with `EXT_color_buffer_float`
preferred (graceful fallbacks included).

## The four field-tested presets (1024² · 2 km · 2 m texels)

| Preset | Geology in one line |
| --- | --- |
| **Bernese Alps** | Glaciated granite massif: connected structural arêtes, wide U-valleys, cirque/couloir snowpack, 3D karst caves |
| **Khumbu Himalaya** | Collision thrust front: dark Lhotse-style gneiss walls, glacial U-troughs, névé couloirs and gorge caves |
| **Colorado Canyon** | Tilted sedimentary plateau: strata hardness staircase, stream-power river gorge, Redwall alcove caves & SDF arch |
| **Rocky Hamada** | Sandstone badlands & wadi canyonlands: dark desert-varnish mesas, broad golden sand corridors and wind caves |

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
black-and-white combine mask updates in real time. Base-layer sculpting
(`Field.BaseDelta`) applies directly onto Layer 0 so subsequent river,
glacial and thermal layers erode over your sculpted base.

`Source/ErosionSequence.js` holds the asynchronous, cancellable solvers:

- **Hydraulic erosion** — droplet simulation with slope-saturated sediment
  capacity and terminal speed; writes Wear and Deposition.
- **Drainage solve** — priority-flood depression filling + MFD (Holmgren
  slope⁴) accumulation; writes Flow and lake Water.
- **River erosion (fluvial)** — area-gated stream-power incision applied
  across a √A valley swath with routed downstream sediment load and
  deposition into floodplains, fans and deltas.
- **Thermal erosion** — 8-neighbour proportional angle-of-repose relaxation
  with hardness-aware cliff/talus angles.
- **Glacial polish** — dilates trunk flow and pinched `\/` creases across
  the full trough width to carve parabolic U-valleys (`\___/`).
- **Aeolian settle** — saltation slabs depositing golden sand sheets in
  wind shadows and flat wadi corridors.
- **Snow accumulation** — multi-scale concavity and slope hold read from an
  immutable source snapshot (no recursive in-place feedback): steep rock
  walls (`> 28–32°`) and wind-scoured convex arêtes shed snow to expose
  dark granite/gneiss bedrock while concave cirques, couloirs and high
  basins retain snowpack.

`Source/DistanceStamps.js` handles 3D SDF/voxel geometry (`PolygoniseStamps`):
- **3D SDF Caves (`ConstructCave`, `CaveDistance`, `BuildProceduralCaves`)** —
  vaulted 3D cave capsules with flattened floors, flared entrances and 3D
  karst wall roughness are subtracted from the terrain SDF via
  `SmoothMax(TerrainD, -DCave, LipBlend * 0.65)` and polygonised with
  Surface Nets. Breached heightmap roof texels are written to the
  `CaveCutout` channel (`FieldTexC.b`) and discarded in the terrain shader
  so you look straight inside the hollow 3D cave interior.

`Source/ReliefRasterization.js` is the WebGL2 renderer:
- **768² vertex-displaced heightfield mesh** with vertex + normal `\/`
  valley-concavity relaxation, paired with the 3D Surface-Nets cave/overhang
  mesh (`StampProgram`) and the fragment-traced implicit density renderer
  (`RaymarchFragmentGlsl`, ViewMode 14).
- **3D de-stretched shading on steep cliffs**: 3D tangent-projected micro-normal
  perturbation (`PerturbNormal`), slope-attenuated top-down channel streaks
  (`SteepFade`), 3D elevation-banded rock shelves (`ShelfNormal`), and
  subterranean cave mouth & interior occlusion (`InsideCave`, `CaveSunAtten`,
  `CaveAmbAtten`, `CaveRimOcc`).

## Sculpt & Paint workflow (Round 5)

- **Basic sculpt brushes (`Raise`, `Lower`, `Flatten`, `Smooth`, `Terrace`)**
  operate strictly on either the **Base layer (Layer 0)** (`Field.BaseDelta`,
  with one-click **Re-erode over base**) or a dedicated **Sculpt layer**
  (`Field.SculptDelta`) in the stack.
- **3D SDF cave brushes (`Carve cave`, `Fill cave`)** bore or fill hollow 3D
  SDF cave tunnels into any cliff or hillside on click/drag and immediately
  re-polygonise the voxel cave surface and heightmap entrance cutout.
- **Black & white combine mask (`Mask (B&W)`)** paints `0` (Black — hide to
  underlying terrain) and `1` (White — reveal combined terrain) into the
  authored B&W mask channel to combine terrain layers in the stack, with a
  live **View: B&W mask** (`ViewMode 15`) toggle.
