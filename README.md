# FIELD/FORM — Sharp 3D Polygon Cliff, Fracture & SatMap Study

A dependency-free browser prototype for generating sharp 3D rock archetypes (`slab`, `blocky`, `jagged`, `columnar`, `spire`, `rubble`), fracturing them along sequential 3D planes, sealing opened joints into single watertight meshes, and assembling pronounced 3D cliff faces colored with multi-band satellite-derived geological **SatMaps**.

## Run

Serve the repository root (required for ES-module imports) and open it in a modern browser:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

## Key Features & Fixes

1. **Razor-Sharp 3D Polygon Rocks (Zero Voxel Blur)**:
   - Instead of rasterizing the cliff onto a low-resolution Marching Tetrahedra voxel grid that blurs rock edges, the cliff mesh is assembled directly from the flat-shaded, watertight 2-manifold triangles of the 3D fractured rock polyhedra and the faceted low-poly cliff core.
2. **Pronounced 3D Cliff Architecture**:
   - Bold headlands, deep recessed canyon gullies, cantilevered upper overhangs, undulating strata benches, and a cascading multi-scale talus boulder apron at the cliff toe.
   - Controlled independently by **Ridge silhouette** (`cliffContour`) and **3D face relief & overhangs** (`cliffRelief`).
3. **High-Variation 3D Rock Generator (`makeRockPolyhedron`)**:
   - Six distinct 3D geological archetypes:
     - `slab` — Flat, wide stratified rock plates and cantilevered overhang shelves with crisp perimeter facets.
     - `blocky` — Chunky multi-faceted cliff stones with planar cleavage faces and anisotropic taper/shear.
     - `jagged` — High-contrast angular crags with sharp directional ridge prows.
     - `columnar` — True 5–7 sided polygonal basalt column prisms with chiseled cross-joint caps.
     - `spire` — Steep upward-tapering alpine crag pinnacles.
     - `rubble` — Broken talus boulders and angular scree wedges.
4. **Real 3D Cracked Rocks with Sealed Joint Fissures (`buildSealedRockMesh`)**:
   - Both the Single-Rock view and the Cliff assembly fracture rocks using `generateFractureNetwork` (primary through-going joints, secondary cross-joints, and abutting T-junctions).
   - When joints open (`Sealed joint opening`), fracture walls bevel inward to a welded/sealed fissure root on the cut plane so each fractured rock remains a **single closed, watertight 2-manifold mesh** with no open interior holes.
5. **16-Stop Geological SatMaps (`SATMAP_PRESETS`)**:
   - Includes five satellite-derived multi-band outcrop color ramps (*Utah Navajo Sandstone*, *Alpine Dolomite & Karst*, *Icelandic Columnar Basalt*, *Sierra Crag & Breccia*, *Redbed Gorge & Ironstone*) indexed by 3D domain-warped strata elevation, surface slope, relief protrusion, ambient occlusion, and fracture cleavage depth—with zero crack textures.

## Tests

```sh
npm test
```

Runs 14 deterministic tests covering rock archetype variation, volume conservation, sealed 2-manifold joint openings, watertight cliff assembly across formations and seeds, pronounced 3D cliff relief, and SatMap color ramps.
