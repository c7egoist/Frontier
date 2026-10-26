# TerrainStudio — SDF + heightfield terrain generator exhibit

A layer-stack terrain generator with physically-motivated geology, SDF voxel
stamps for overhanging landforms, and a channel/brush authoring editor,
presented in the Frontier Editor UI language. Runs entirely in the browser:
no build step, no dependencies.

**Open it:** serve this repository over HTTP and visit
`/Exhibits/TerrainStudio/` (any static server works; the module scripts
require `http://`, not `file://`). WebGL 2 with `EXT_color_buffer_float`
preferred (graceful fallbacks included).

## The four field-tested presets (1024² · 2 km · 2 m texels)

| Preset | Geology in one line |
| --- | --- |
| **Bernese Alps** | Granite massif: ridged crests, glacial U-valleys, hydraulic rills, altitude snowpack |
| **Khumbu Himalaya** | Collision arc on a foreland: knife arêtes, antecedent gorges, névé above 470 m |
| **Colorado Canyon** | Tilted sedimentary plateau: strata hardness staircase, stream-power river, SDF arch |
| **Rocky Hamada** | Dissected plateau in retreat: remnants at staggered levels, wadi fans, sand sheeting |

Every preset is an ordinary editable layer stack — nothing is baked. Open
one, restack it, re-seed it, save your own.

## How the terrain is made

`Source/ReliefField.js` is the substrate: a 1024² heightfield plus a
registry of full-resolution channels — **Flow, Water, Wear, Deposition,
Hardness, Snow, Moisture** (derived by simulation), four authored paint
weights (Rock/Meadow/Sand/Snow), and as many user masks as you care to
create. Channels are first-class: they can mask layers, drive the splat
shader, be painted with the brush, be inspected in the viewport, and be
exported.

`Source/LayerStackEvaluation.js` runs the stack bottom-up with a per-layer
height cache, so editing one layer only recomputes it and everything above.
Each layer finishes with `mix(before, after, strength × mask)`.
Formation builders (ContinentalMass, RidgeUplift, TectonicFront,
CellularPlateau) normalise onto their declared amplitude — at kilometre
wavelengths a 2 km frame holds too few noise features for FBM to reach its
theoretical extremes on its own.

`Source/ErosionSequence.js` holds the solvers (all asynchronous and
cancellable, so the editor never locks):

- **Hydraulic erosion** — droplet simulation with sediment transport,
  hardness-scaled capacity; writes Wear and Deposition.
- **Drainage solve** — priority-flood (Wang & Liu) depression filling, D8
  accumulation; writes Flow and lake Water.
- **River erosion (fluvial)** — stream-power law `E ∝ A^0.45 · (0.12 + S)` with
  a base-level slope floor, applied as a *swath*: each channel cell's cut is
  splatted across a valley cross-section whose half-width grows with √A
  (point incision alone digs slots that talus refill; the swath digs
  valleys). Eroded mass enters a sediment load routed cell-to-cell
  downstream: carrying capacity grows with discharge and grade, an
  overloaded river *deposits* — floodplains, alluvial fans where the grade
  breaks, deltas in lakes — and a loaded river saws slower but never below
  a quarter of its detachment rate (its bedload is its tools). Tune it with
  the layer's **Sedimentation** and **Sediment capacity** sliders. Writes
  Flow, Water and honest Deposition only where sediment actually settles.
- **Thermal erosion** — angle-of-repose relaxation that is *hardness-aware*:
  where strata hardness varies, hard beds stand at the cliff angle while
  soft beds repose — the cliff-and-bench staircase of real canyon country.
- **Glacial polish** — flow-weighted U-valley widening and flattening.
- **Aeolian settle** — saltation slabs depositing in wind shadow.
- **Snow accumulation** — altitude/slope-gated cover with hollow drift.

`Source/DistanceStamps.js` is the SDF half: analytic distance fields
(Arch, Spire, Crag, Fin) displaced by ridged noise, smooth-unioned into a
shared voxel grid and polygonised with surface nets — true overhangs,
arches and fins that a heightfield cannot represent. Stamps plant
themselves on the terrain surface and share the terrain's material shader,
so strata banding continues unbroken across stamp and ground.

`Source/ReliefRasterization.js` is a WebGL2 renderer: vertex-displaced
1024² terrain from an R32F height texture (sculpt strokes re-upload raw
heights without repacking channels), procedural 5-material splatting
(strata-aware rock, meadow, sand, scree, snow) with triplanar micro-detail,
concavity AO, GGX sun with PCF shadows, height fog, ACES tonemapping,
gradient sky, animated water, and twelve inspect modes — every channel is
viewable in the viewport.

The field border eases into the sea (outer 8.5% rim) so worlds read as
finished landmasses rather than floating slabs.

**Texturing is data-driven, with flat colours.** After every build the
editor bakes two Gaea-style data maps from the finished heightfield —
**Occlusion** (multi-scale burial at 3/14/48-texel radii, shaded by how
much sky a slope can see) and **Protrusion** (how proud a crest or edge
stands) — into first-class channels you can inspect like any other. The
splat shader then textures *only* from data: baked occlusion and
protrusion, altitude grading, strata hardness, wear, sediment (silt where
the river laid its load down) and flow (wet, polished rock along trunk
streams). Material colours themselves are flat — there is no noise in the
albedo at all; variation comes from the simulated maps and the geometry.

## Traced density view & resolution limits

The substrate is a **1024² Float32 heightmap** (2 km, 2 m texels): every
channel, layer cache and solver scales with it, so 2048² would cost 4×
and 4096² 16× — beyond what CPU solvers in a browser tab survive. The SDF
stamps are true voxel grids, capped at 130³ cells over their bounds.

The **Traced density** view (view menu, `Shaded ▾`) sidesteps the texel
limit for *rendering*: the heightfield becomes an implicit density
(`d = y − h(x,z) − detail`) held entirely in the fragment shader and
sphere-traced per pixel. Shading normals come from the density gradient —
one continuous smooth surface, no mesh tessellation, no texel
stair-stepping — and four procedural detail octaves (26 m down to 3.2 m
wavelength) live inside the density, each fading in as the camera closes
in, so relief keeps resolving as you zoom past what the heightmap holds.
Hits write real depth, so stamps, water and the brush ring composite
exactly as against the mesh; shadows still come from the mesh shadow map.
Detail amount and trace quality are sliders on the Scene page. The mesh
view remains the fast path for sculpting on weak GPUs.

## The editor

- **Layers page** — reorder by drag, enable/disable, per-type parameter
  schemas, blend modes, strength, seeds, channel/height/slope masks with
  invert and remap range.
- **Brush page** — Raise/Lower/Flatten/Smooth/Terrace sculpting (stored in
  a SculptDelta layer, so strokes are themselves stack-editable), channel
  painting (including your own masks), material painting, and SDF stamp
  placement/removal with live ring preview.
- **Channels library** — live previews, inspect-in-viewport, paint,
  create/rename/delete authored masks.
- **2D field view** — hypsometric hillshade you can sculpt and paint on
  directly from above.
- **Scene page** — sun, atmosphere, palette, water, material response.
- **Exports** — 16-bit PNG heightmap, raw Float32 heights, RGBA mask pack
  (wear/flow/water/deposition), per-channel PNG, viewport PNG, and a
  `FrontierTerrain/1` project JSON (re-importable). Custom presets persist
  in localStorage.

Keys: drag orbit · wheel zoom · right-drag pan · double-click set pivot ·
`F` frame · `G` grid · `P` panels · `[` `]` brush size · `X` flip brush ·
`/` search · `Ctrl/⌘+Z` undo (region-sliced, 28 deep) · `Esc` cancel build.

## Provenance & conventions

The UI reuses the Alloy (TextureStudio) editor design language from
`SultanAladin/Frontier@arena/5e581235-frontier` — DM Sans, the charcoal
token set, 48 px app bar, pill sliders, layer cards — reimplemented in
dependency-free vanilla JS/CSS rather than embedding that React tree.
Fonts are vendored under `Style/Fonts` (SIL OFL, see OFL.txt). Source
follows the repo naming skill: PascalCase, purpose-first nouns, no
Manager/Handler/Core/Base/Value/State/Pass/Node/Kind/Flag/System
vocabulary.
