# Frontier — AAA Procedural 3D Rock & Cliff Studio

**Frontier** is a structural-geology-first procedural 3D rock and cliff generator for AAA game production. Every overhang, stratified sedimentary bench, curve-swept sandstone arch, hexagonal basalt column, exfoliation sheeting visor, razor-fluted karst spire, and balanced caprock pedestal is synthesized in **true 3D geometry** — never faked with sedimentation stripe textures or displaced spheres.

---

## Core Architecture

1. **Analytical 3D Curve-Swept Arches (`src/geology/arch-curves.js`)**
   - Natural arches (`desert-arch`, `double-arch`, `sea-arch`) are sculpted directly along **true 3D cubic Bézier curves** with parallel-transported Frenet frames, slender crown taper, polygonal sandstone fin cross-sections, and stepped bedding pedestals — **zero hole-punching boolean cuts**.
2. **Real 3D Sedimentary Stratigraphy & Differential Weathering (`src/geology/sedimentary-formations.js`)**
   - `sedimentary-cliff` builds 17 continuous dipping stratigraphic horizons alternating between massive overhanging caprock cornices, rhythmically interbedded flagstone wafer packets, deeply undercut fissile shale recesses, lenticular paleochannel pinch-outs, oblique fault throws, and angular fallen caprock slabs.
3. **18 Distinct Procedural Formation Archetypes (`src/geology/presets.js`, `src/geology/formations.js`)**
   - **Arch**: *Utah Sandstone Arch*, *Double Sandstone Arch*, *Coastal Sea Arch*
   - **Sedimentary**: *Sedimentary Cliff*
   - **Desert**: *Utah Canyon Wall*, *Utah Slot Canyon*, *Desert Spires*, *Hoodoo Columns*, *Sandstone Butte*, *Balanced Pedestal Rock*
   - **Cliff**: *Jointed Cliff Face*, *Granite Exfoliation Dome*, *Columnar Basalt Cliff*
   - **Outcrop**: *Limestone Karst Tower*, *Alpine Crag Spire*, *Weathered Granite Tor*, *Dipping Slate Outcrop*
   - **Boulder**: *Fractured Hero Boulder*
4. **Sparse Narrow-Band SDF + QEF Dual Contouring (`src/core/sparse-sdf.js`, `src/core/dual-contour.js`, `src/core/qef.js`)**
   - Evaluates a narrow-band brick-sparse signed distance field and solves per-cell 3×3 Quadric Error Functions with Tikhonov regularization, preserving razor-sharp bedding ledges and fracture dihedrals while keeping rock faces organic and clean.
5. **AAA Game Engine Mesh Export (`src/io/glb-exporter.js`, `src/io/obj-exporter.js`)**
   - Exports binary **glTF 2.0 (`.glb`)** and **Wavefront `.obj`** with crease-split normals, triplanar-ready UVs, adaptive QEM LOD decimation, and baked RGBA vertex masks (`R = Volumetric AO`, `G = Concave Cavity`, `B = Convex Edge`, `A = Upward Slope`).

---

## Quick Start

```bash
npm install
npm run dev      # Launch interactive WebGL2 studio on 0.0.0.0:5173
npm test         # Run unit & integration suite across all 18 archetypes
npm run build    # Production Vite bundle
```

### Headless CLI Asset Baker

```bash
npm run generate -- --archetype desert-arch --seed 4029 --quality high --out exports/arch.glb
npm run generate -- --archetype sedimentary-cliff --seed 4029 --lods --out exports/cliff.glb
```

---

## Update (continued from arena/74dbc624): rain on rocks, flat terrain colours, fixed water/snow/rock physics

- **Rock & Cliff Studio — particle rain erosion on the SDF** (`src/geology/rain-erosion.js`):
  Terrain-Studio-style droplets fall from the sky, run over the true 3D surface
  (projected gravity + SDF reprojection), and carve/deposit with a sub-voxel
  brush directly in the SDF grid before Dual Contouring. Anti-"melted chocolate"
  design: no smoothing pass anywhere, per-step carve capped by actual downhill
  drop, sharp convex edges protected via SDF curvature, thin arch spans
  protected from perforation, per-node channel-depth cap, hardness-aware via
  the geological block hardness. Controls: *Rainfall Erosion Amount / Raindrop
  Count / Sharp Edge Protection* (defaults 50% / 8k / 70%). Erode at
  High/Ultra, then bake down with the QEM target. CLI: `--rain 0.6
  --rain-droplets 14000 --rain-edge 0.75`.
- **Terrain Studio — flat colours**: all procedural colour "textures" removed
  from the terrain & rock render shaders (hexagonal column tiles, honeycomb
  fabric, noise grain, sand ripples, glitter). Albedo is now only the flat
  lithology palettes blended by hardness/elevation/slope/sediment/snow/water.
  Noise *generators* (terrain shape, weather) are untouched.
- **Water flow fixed**: proper Mei pipe model with per-second friction and an
  anti-overshoot levelling cap (no more sloshing/uphill pumping); snowmelt is
  single-counted through the cryosphere pass; droplets ride full total head
  and merge into lakes instead of skating across them; flat hydrostatic
  water-surface normals at shorelines; Froude-limited flow velocity.
- **Snow improved**: slope/wind-aware snowfall — retention sheds from steep faces, windward faces are scoured and lee faces drift-loaded (ported from egoistm1inbox arena/fd0eaa50),
  cohesion-aware avalanche repose, **mass-conserving** wind drift (tilted
  potential), stable pairwise glacier creep, rain-on-snow melt.
- **Visibility toggles**: Water / Snow / Rain can be hidden independently from
  the viewport toolbar (and mirrored in the inspector) without pausing sims.
- **Rocks are real rigid bodies now** (`src/erosion/rock-calving.js`):
  world-space position + quaternion orientation integrated at 120 Hz substeps
  under g = 9.81 with ellipsoid rolling physics raised to the **exact faceted
  mesh support** at contact (sharp polyhedron corners no longer seat through
  slopes), a one-time footprint-ring seating correction for wide rocks on
  uneven ground, Coulomb friction, restitution, rolling, water buoyancy/drag
  and impulse rock-rock collision. The vertex shader no longer re-snaps rocks
  to the heightfield — settled boulders stay put until erosion genuinely
  removes their support, then fall. Pausing/stopping the live sim now freezes
  boulder physics too, instead of letting rocks keep settling on a frozen
  terrain snapshot.
- **Rocks embed into snow & sediment**: the ground is layered (snow/ice over
  loose sediment over bedrock) and the soft layers are crushable — a boulder
  sinks until bearing pressure × contact-patch area carries its true mass
  (fresh snow ~8 kPa hardening as it densifies; sediment 55–140 kPa), so big
  rocks sink deeper, slabs ride high, and mega-boulders punch through snow
  onto sediment. Landings in snow are dead (plastic crush), rolling rocks
  plough and bog down (deep soft ground still leaves ~35% of a loose rock's
  diameter protruding on its compacted plug), and embedded rocks stamp the snowpack
  (`ROCK_IMPRINT_FRAG`): compacted footprint + the displaced volume resurfacing
  as a rim hugging the rock, so boulders protrude naturally and rolling ones
  leave furrows. Melt wakes embedded rocks to settle onto the sediment.
- **Sediment feels the rocks back**: boulders are rasterized into an obstacle
  field (`ROCK_OBSTACLE_FRAG`: rock-top height + footprint coverage) that every
  transport pass reads. Pipe water flux is throttled around protruding rocks
  (streams divert, pond behind boulder dams, overtop when deep), thermal
  talus avalanches use `max(terrain, rockTop)` as ground (sediment banks
  against boulders, sheds off their tops, spills over once banked high
  enough), droplets ride over/around rock tops with shielded pickup under
  footprints, the integrator armours the bed beneath rocks while deposition
  fills only the free cell fraction so sediment wedges up and buries them,
  and snow creep/drift sheds off and banks against boulders too.

- **Chemical weathering stains**: iron "bleeding" (rust) and copper patina,
  simulated not painted. Rock Formation editor: dissolved Fe/Cu from
  mineral-veined seep zones (joints/concavities) is routed down the finished
  mesh by steepest-descent flow accumulation (`src/geology/chemical-staining.js`),
  depositing ochre streaks along real drainage lines and pooling malachite/
  azurite in hollows — baked into a per-vertex stain attribute (sliders:
  Chemical Weathering / Iron / Copper; CLI `--chem/--iron/--copper`).
  Terrain Studio: boulders get per-instance mineralogy (seed hash) with
  seep-column rust streaks running down steep faces plus an oxidation rind.
  The terrain itself now has a **Chemical weathering & dissolution**
  simulation layer (`CHEM_WEATHER_FRAG`): a persistent GPU state tracks iron
  rust, salt efflorescence, signed desert-varnish/copper-patina coating and
  hydrolysis alteration from water depth, discharge, snowmelt, evaporation,
  slope, burial, hardness/fractures and seeded Fe/Cu/carbonate veins. It is
  geomorphic as well as visual — altered rock loses hardness, soluble bedrock
  dissolves, hydrolysis creates clay fines and salt crystallisation bursts
  exposed rock into sediment. Per-process rates and baking live on the layer
  inspector; the toolbar "Weathering" slider controls stain visibility on
  terrain + boulders. Disabled on the airless lunar theme. Flat mineral
  colours only — no noise grain, in keeping with the flat-colour pass.
- **Simulation seasons**: live processes no longer all run at once by default.
  Rain, snow/glaciers, wind, rockfall/boulders and chemical weathering are
  separate seasons that can be run **one at a time** or armed together in
  Simultaneous mode from the Simulation Seasons panel. Selecting a simulation
  layer arms its season; pressing **Simulate** runs it, and each simulation
  layer also has its own inspector trigger. Any stack/base-layer evaluation
  auto-pauses every season until Simulate is pressed again, so snow cannot
  interfere while shaping the base landform.
- **Mineral-bearing sedimentary layers**: Stratigraphic Beds now carry iron,
  copper, carbonate and salt/evaporite composition plus a target horizon.
  Stack evaluation bakes those into a mineral source field, chemical water
  leaches and transports dissolved Fe/Cu along flow paths, and boulders in
  those paths stain from the transported state. The **Mineral Strata &
  Dissolved Stain** shading mode visualises the source beds and stain trails.

Verification: `npm test` — 34/34 pass (includes `tests/rain-erosion.test.mjs`,
rigid-body free-fall/no-elevator tests, exact-mesh seating / pause-freeze, and
simulation-season / mineral-strata regression tests). `npm run build` clean.
