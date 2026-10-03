# FIELD/FORM — 3D polygon-first cliff and fracture study

A dependency-free browser prototype for building true 3D cliff formations from convex rock polyhedra, then producing a fused, sealed surface for a terrain generator's later SDF/erosion work. It uses raw WebGL with structured, geometry-aware shader shading (no external 3D library, crack maps, Voronoi cells, or build step).

## Run

Serve the repository root (required for the ES-module imports) and open it in a modern browser:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

The default view is a layered sedimentary escarpment with a rubble toe. Choose between sedimentary, columnar basalt, and breccia/talus profiles. The seed, ridge-silhouette strength, 3D face relief, rock packing, local crack deflection, dominant joint azimuth, shallow joint-groove relief, and geological stamp strength are adjustable. Ridge strength reshapes the crown and side contour; face relief pushes the low-poly base in or out through depth. Drag to orbit and scroll to zoom. Switch to the single-rock view to inspect sequential polyhedral cuts and replay their growth.

Cliff export provides a binary STL of the fused, watertight shell plus a separate JSON recipe containing the rock layout, groove traces, generation parameters, and field grid. The single-rock view exports its closed polygon fragments and fracture-plane data as JSON.

## Geometry model

- Each rock form is an irregular convex polyhedron built from evenly distributed corner candidates, keeping the facet count low and the arrises crisp. Slab, blocky, jagged, columnar, and rubble profiles vary the actual 3D hull silhouette; fracture joints remain geometric, never painted into a texture.
- Each seeded cliff profile creates an irregular low-poly ridge/silhouette plus triangulated, depth-varying front and back surfaces. Rock centers conform to the local front surface; rock scale varies broadly to form headlands, ledges, and smaller infill rather than a straight wall.
- The variable-size rock solids overlap that volumetric base. A signed-distance union merges them, so the cliff is polygonized as **one continuous triangle mesh** instead of separately rendered stones with internal faces.
- Sequential plane cuts generate some of the joint traces. They become shallow subtracted grooves in the union field; changing groove relief does not pull the rocks apart or expose an open interior face.
- The single-rock view retains the original plane-by-plane splitting model: every cut adds a shared polygonal cap and produces closed fragments. Later cuts can abut older fracture faces.
- Surface color uses per-rock earthy palettes and a structured shader material: sediment bedding, basalt column seams, or sparse breccia veins. Elevation tint, discrete SDF curvature, and a local occlusion approximation darken sheltered areas. The marks are directional geological forms, not random texture noise or crack maps.
- The cliff shell is sampled and polygonized from a finite-resolution SDF grid. This is a geometry/assembly prototype—not a full elastic stress/LEFM solver or an erosion implementation. The exported rock recipe preserves per-rock colors and material settings for the later terrain SDF and erosion stages.

Everything is genuine 3D geometry: no 2D extrusion, cell fracture, or image-based cracks.

## Tests

```sh
npm test
```

Tests cover deterministic fracture geometry, closed individual polyhedra, volume conservation, fracture-face data, selectable cliff profiles, variable base controls, palette variation, and edge-manifold closure of the fused cliff mesh.
