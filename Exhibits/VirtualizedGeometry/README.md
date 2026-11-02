# Virtualized geometry — the demo's builder against the branch's C++ tier build

Measures the two cluster-DAG builders on identical input: the VehicleHMI demo's `Source/GeometryHierarchy.js`
(upstream `6afb6f0`, run under Node.js) and the branch's C++ `FacetTierBuild` + `QuadricTierBuild` through
`ScreenSpaceClusterRefinement::BuildFromFacetField` (inherited with the `2d55bd2` sync). The input is the demo's own
corpus (`Tools/GeometryHierarchyCorpus.mjs`) with the options of its evidence tool: a 5120-facet sphere, the same
sphere with a transmissive band (classification 9), an 8192-facet heightfield with a cliff, and a 2976-facet vessel
with a UV seam, two UV islands and three authored sharp rings. Nothing here renders; it is build and cut evidence for
`Documentation/Plans/Ongoing/VirtualizedGeometry.md`.

## Run

```sh
git archive 6afb6f00b5f25c45f7cda92c7da65b64845768f3 \
    Experimental/VehicleHmiPrototype/Source/GeometryHierarchy.js \
    Experimental/VehicleHmiPrototype/Tools/GeometryHierarchyCorpus.mjs \
    Experimental/VehicleHmiPrototype/package.json | tar -x -C <scratch>
node Exhibits/VirtualizedGeometry/Code/CorpusExport.mjs <scratch>/Experimental/VehicleHmiPrototype <corpus>
cmake -S Exhibits/VirtualizedGeometry -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build <build>
<build>/TierComparison <corpus> marked > <corpus>/TierComparisonMarked.json
<build>/TierComparison <corpus> crease > <corpus>/TierComparisonCrease.json
node Exhibits/VirtualizedGeometry/Code/SurfaceDeviation.mjs <corpus>
```

The upstream commit must be fetched first (`git fetch --filter=blob:none --depth 1
https://github.com/SultanAladin/Frontier.git 6afb6f00b5f25c45f7cda92c7da65b64845768f3`). `marked` keeps only the
authored sharp edges, which is the demo's input meaning; `crease` is the C++ default (45° dihedral re-detection on
every tier). The `Results/` files were produced on 2026-11-02 (Node.js 22.22, GCC 12.2 `-O2`, 2-CPU Linux sandbox).

## Measures

| Measure | Definition |
|---|---|
| Levels | DAG levels (demo) or tiers (C++), leaf first; triangles and clusters per level |
| Per-cluster cut | each cluster decided alone, selected iff its error ≤ τ < its enclosing group's error, at 12 thresholds τ from 10⁻³ to 10^0.2 of the largest error. **Gaps** = leaf clusters nothing covers (holes); **Overlaps** = selected clusters enclosing another selected cluster (double cover). This is the demo's GPU cut rule |
| Sharp edges / UV seams | undirected edges carrying a sharp bit / manifold edges whose two corner UVs disagree |
| Off-crease | sharp-edge endpoints no longer on a source crease plane (vessel only) |
| Seam crossing | triangles whose U span exceeds 0.5, i.e. smeared across the vessel's meridian seam |
| Needles | triangles with longest² / (2·area) > 20 |
| Deviation | two-sided distance between a level and the source surface, exhaustive point-to-triangle, as % of the source bounding-box diagonal: Hausdorff maximum / root-mean-square |

## Results

**Build, reduction and cut** (`Results/DemoNesting.json`, `Results/TierComparisonMarked.json`,
`Results/TierComparisonCrease.json`):

| Surface | Builder | Build | Levels | Leaf → coarsest (root clusters) | Per-cluster cut: thresholds with defects, worst overlap |
|---|---|---|---|---|---|
| Sphere | demo | 531 ms | 7 | 5120 → 80 (1) | 0 / 12 |
| | C++ marked | 37 ms | 7 | 5120 → 92 (1) | 10 / 12, 27 clusters |
| Glass sphere | demo | 400 ms | 5 | 5120 → 352 (25) | 0 / 12 |
| | C++ marked | 45 ms | 11 | 5120 → 370 (4) | 4 / 12, 22 clusters |
| Heightfield cliff | demo | 712 ms | 7 | 8192 → 254 (11) | 0 / 12 |
| | C++ marked | 59 ms | 10 | 8192 → 133 (2) | 10 / 12, 40 clusters |
| UV vessel | demo | 277 ms | 6 | 2976 → 92 (1) | 0 / 12 |
| | C++ marked | 22 ms | 9 | 2976 → 236 (2) | 6 / 12, 16 clusters |
| | C++ crease | 37 ms | 24 | 2976 → 302 (9) | 4 / 12, 11 clusters |

Build times are the median of three runs and vary by about 15 % between runs on this sandbox. No cut had gaps. Every
build passed its own builder's validator (`ValidateGeometryHierarchy`, `ValidateTierSequence`).

**Features on the UV vessel** (per level, leaf first):

| Builder | Sharp edges | UV seam edges | Off-crease | Seam crossing |
|---|---|---|---|---|
| demo | 144 → 144 → 110 → 74 → 52 → 32 | 116 → 115 → 74 → 54 → 36 → 23 | 0 | 0 |
| C++ marked | 144 → 0 on every coarser tier | 116 on every tier (seam vertices pinned) | — | 0 |
| C++ crease | 240 at the leaf, 147 at the coarsest (re-detected by angle) | 116 on every tier | — | 0 |

`ClassifyEdges` in `QuadricTierBuild.cpp` clears each tier's sharp mask and rebuilds it from open borders and,
optionally, the dihedral angle, so authored sharp edges do not reach coarser tiers.

**Deviation at matched triangle counts** (`Results/SurfaceDeviation.json`; C++ interpolated log-linearly between its
neighbouring tiers; Hausdorff / RMS, % of the diagonal):

| Surface | Triangles | demo | C++ marked | C++ crease |
|---|---|---|---|---|
| Sphere | 1280 | 0.47 / 0.077 | 0.24 / 0.067 | 0.24 / 0.067 |
| | 160 | 0.99 / 0.355 | 1.10 / 0.407 | 1.16 / 0.413 |
| Glass sphere | 640 | 0.56 / 0.180 | 0.80 / 0.194 | 0.80 / 0.194 |
| | coarsest | 20.80 / 9.969 (352) | 19.64 / 1.856 (370) | 17.34 / 1.795 (382) |
| Heightfield cliff | 4096 | **0.06** / 0.013 | 1.03 / 0.043 | 0.88 / 0.036 |
| | 1022 | **0.53** / 0.065 | 1.24 / 0.084 | 2.10 / 0.147 |
| | 254 | 9.34 / 3.337 | **2.36** / 0.356 | 6.86 / 1.418 |
| UV vessel | 748 | **0.45** / 0.114 | 0.90 / 0.109 | 0.75 / 0.086 |
| | 374 | **0.91** / 0.199 | 2.18 / 0.326 | 3.68 / 0.636 |
| | 92 | 2.72 / 0.864 | not reached | not reached |

## Reading the results

- The demo's per-cluster errors are group-coherent: every cluster of a simplification group carries the same enclosing
  error and sphere, so a per-cluster GPU cut is crack-free at every threshold. The C++ errors are not (a cluster's
  coarser error comes from whichever enclosing cluster was visited); its CPU cut compensates by walking groups
  serially, which does not map onto a parallel compute dispatch.
- The demo simplifies along UV seams and creases and keeps them exact; the C++ build pins seam vertices (the vessel
  stalls at 236–302 triangles) and drops authored creases after the leaf tier.
- The C++ build is 7–14× faster because it is compiled; the demo's builder runs single-threaded in JavaScript.
- The demo's coarse terrain levels are poor: 217 of its 254 coarsest triangles are needles and the deviation reaches
  9.3 %. The C++ build is better there. Both builders lock class borders, which ruins the glass sphere's coarsest level.
