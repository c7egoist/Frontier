# Virtual Geometry Editor

A browser demo of a **robust LOD system**: Nanite-style virtual geometry (a cluster DAG with a
per-cluster, crack-free LOD cut) next to a classic discrete LOD chain. It runs on **WebGL2**
with an optional **WebGPU** path that does the culling on the GPU. The UI follows Project Zero
Editor: trapezoid dock tabs, Outliner, Inspector with metric tiles and ON/OFF property tiles,
a top notch for quick tools, a bottom Asset Browser drawer, and a status bar.

Reference implementation studied: [bdwhst/Vulcanite](https://github.com/bdwhst/Vulcanite) (Vulkan Nanite).

## Run

```bash
python3 Experimental/VirtualGeometryEditor/Serve.py      # http://0.0.0.0:8093/ (redirects to the editor)
node Experimental/VirtualGeometryEditor/ClusterHierarchyValidation.mjs          # ~4 s
node Experimental/VirtualGeometryEditor/ClusterHierarchyValidation.mjs --full   # ~15 s, larger sources
```

URL options:

| Option | Effect |
|---|---|
| `?backend=webgpu` | Start on the WebGPU path, without creating a WebGL2 context. |
| `&capture=1` | Render WebGPU frames offscreen. Use `Gpu.CaptureImage()` for stills or headless checks. |

There are no build steps and no dependencies. Fonts (DM Sans, OFL) are self-hosted in `Fonts/`.

## What the LOD system does

### Offline: building the cluster DAG (`Engine/ClusterHierarchyBuilder.js`, in a Web Worker)

1. **Weld and normalise** the source polygon network (`PolygonNetworkSources.js`), using
   procedural sources or Wavefront OBJ import.
2. **Cluster** level 0: triangles are partitioned into clusters of at most 128 triangles
   (`GraphPartitioner.js`). This is a METIS-like recursive bisection over triangle adjacency,
   with spatial seeding and boundary refinement.
3. Then, for each level:
   - **Group** adjacent clusters (about 8 per group), partitioning the cluster adjacency
     weighted by shared border edges.
   - **Merge** each group and **lock its outer border**.
   - **Simplify** it to about 50% with quadric edge collapse (`QuadricSimplifier.js`), which
     also handles border weighting, normal-flip rejection and link conditions.
   - **Re-split** the simplified group into new clusters.

   Every cluster made from a group shares that group's error and bounding sphere as its
   *parent* values.
4. **Make the DAG monotonic.** Group error is at least the maximum child error, and the parent
   sphere encloses the child spheres. Because of this, each cluster can decide on its own
   whether to draw, with no traversal order and no cracks.
5. **Build bounding trees** per level. Nodes store the cull sphere, the largest parent sphere,
   the maximum parent error and the minimum self error, so whole subtrees can be rejected
   (Vulcanite's BVH idea).
6. **Build a discrete chain**: whole-network simplification to about 50% per level, used for
   the comparison mode.

### Runtime: selecting the cut (`Engine/ClusterCutSelector.js`)

A cluster is drawn **iff** `proj(SelfError, SelfSphere) ≤ τ < proj(ParentError, ParentSphere)`,
where `proj(e, s) = e · H / (2·tan(fov/2)) / max(dist(eye, s) − r, near)`. Selection happens
in instance-local space, so one DAG serves any number of instances.

Pruning and culling:

- **Instances:** view-volume test and an occlusion test. The occlusion test uses the previous
  frame's `ANY_SAMPLES_PASSED` query on the instance's bounding cube.
- **Bounding-tree nodes:** view-volume test, and an error-bound prune when
  `proj(maxParent) ≤ τ` or the minimum self error is already too coarse.
- **Clusters:** view-volume sphere test and a backface normal-cone test.

The discrete selector picks the coarsest level whose error is ≤ τ. It applies a hysteresis band
and a bias, and switches levels with a dithered cross-fade.

### Rasterization

| Path | How |
|---|---|
| WebGL2 (`WebGl2Rasterization.js`) | CPU cut. Selected clusters become sorted, merged vertex ranges, drawn with `WEBGL_multi_draw` (one call per instance). Vertex attributes are packed (position, oct-normal, cluster id, triangle/level bits). Per-cluster LOD records live in a float texture for the debug views. |
| WebGPU (`WebGpuClusterRasterization.js`) | A compute shader runs one thread per (instance × cluster) and does the instance frustum test, then GPU occlusion (query results resolved straight into a storage buffer, with no CPU readback), the DAG cut test, the cluster frustum test and the cone test. Visible clusters are appended to a list, then a single `drawIndirect` renders the whole scene by pulling vertices from storage buffers. Counters and timestamps are read back asynchronously. |

The two paths are cross-checked. On the Boulder Field view, the WebGPU compute cut and the CPU
cut both select **326 clusters / 34,336 triangles**, with the same per-level histogram.

## Editor

| Area | Contents |
|---|---|
| Viewport | Mode switch: **Cluster DAG / Discrete / Compare** (a draggable split screen with discrete on the left and the cluster DAG on the right). Live HUD, plus a legend for the Error and Level views. |
| Notch | Orbit / fly / fly-through path, frame, freeze cut, wireframe, debug-view cycle, bounds, and a threshold slider. |
| Inspector | Hero and breadcrumb for the picked cluster. Metrics: triangles, clusters, reduction versus full detail, frame / CPU ms. τ slider (logarithmic, in px), isolate a single DAG level, and debug views: Lit, Clusters, Groups, Level, Triangles, Error (projected error ÷ τ), Instances, Normals. Property tiles: view volume, occlusion, backface cones, cluster BVH, freeze cut, wireframe, bounds, ground grid. Discrete chain settings (hysteresis, bias, cross-fade ms, forced level) and environment settings. **Click any surface** to see that cluster's self and parent errors in world units and in pixels, and why the cut selected it. |
| Statistics | Triangle and frame-time sparkline, the selection funnel (BVH nodes → clusters → drawn), the instance funnel, drawn clusters per level, and renderer info. |
| Build | Backend switch (WebGL2 / WebGPU). Cluster size and group size with a rebuild. Instance rows and spacing. Per-asset build reports. |
| Outliner / Levels | Asset visibility toggles; instance collections (click to frame one); DAG level sizes; live cut composition; the discrete chain. |
| Asset Browser | Generators: boulder, terrain tile, torus knot, fluted column. Layouts: Boulder Field, Colonnade, Knot Gallery, Stress Field. Wavefront **OBJ import**, built locally in a worker. |

Keys:

| Key | Action |
|---|---|
| `1` `2` `3` | Mode |
| `V` / `Shift+V` | Cycle debug view |
| `X` | Wireframe |
| `F` | Freeze cut (then fly around and see the frozen frustum and what it selected) |
| `C` | Occlusion |
| `B` | Bounds |
| `G` | Fly (WASD/QE, Shift to boost) |
| `P` | Fly-through path |
| `H` | Frame scene |
| `.` | Frame the picked cluster |
| `[` `]` | Threshold |
| `Esc` | Clear the selection |

## Validation (`ClusterHierarchyValidation.mjs`)

For every source asset the script checks:

- monotonic errors;
- parent spheres enclose self spheres;
- group parent-pair consistency;
- the bounding-tree cut equals a linear scan;
- **watertight cuts** across about 12 mixed-level views (no new open edges);
- finest-cut area drift under 2%;
- the discrete chain is monotonic, and hysteresis switches at most once under camera wobble.

At the scene level it checks that the merged draw ranges cover exactly the selected clusters'
vertices, and that instance culling both culls and draws in a close-up view. The script exits
non-zero on failure.

## Known limitations

- **Fluted column:** a few root groups can't be simplified further, and coarse cuts lose the
  flutes (20–40% area drift at the coarsest cut). One edge, shared with a neighbouring group
  at level 3 and above, is reported as a "seam contact" (an edge used by more than two
  triangles). It is not an open crack.
- **Occlusion** uses bounding cubes with one frame of latency. It is not a two-phase HZB
  (hierarchical depth buffer) pass.
- **No software rasterizer.** Tiny triangles go through the hardware path.
- **Headless SwiftShader in `--single-process` mode** can't present a WebGPU canvas: the device
  is lost on the first submit. That's why `&capture=1` exists for automated checks.
- **Banned-vocabulary renames** (`Model`, `Graph`, `Node`, `Draw` …) are only partly done in
  the engine internals.
