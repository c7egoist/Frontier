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
  under g = 9.81 with ellipsoid-support terrain contact, Coulomb friction,
  restitution, rolling, water buoyancy/drag and impulse rock-rock collision.
  The vertex shader no longer re-snaps rocks to the heightfield — settled
  boulders stay put until erosion genuinely removes their support, then fall.

Verification: `npm test` — 26/26 pass (includes new `tests/rain-erosion.test.mjs`
and rigid-body free-fall/no-elevator regression tests). `npm run build` clean.
