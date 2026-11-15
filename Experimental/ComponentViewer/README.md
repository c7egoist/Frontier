# Component Viewer

Vehicle Lab, renamed and redesigned as a Blueprint-style **Component Viewer**, merged with Frontier-1's Cluster LOD
Studio (Hero Workspace) as an import step called **Geometry Compile**. The look follows Project Zero as Cluster LOD
Studio uses it: charcoal docks on a 2 px seam, trapezoid tabs, pill sliders, white active segments, amber selection,
a notch at the top for shortcuts and a drawer at the bottom.

```
python3 Experimental/ComponentViewer/Serve.py        # http://0.0.0.0:8095/ → /Experimental/ComponentViewer/
```

## Two screens

**Geometry Compile** (the import inspector) opens for every imported object: OBJ, glTF / GLB, STL, PLY and Frontier's
FCT1 `.facet`. FBX is listed but has no reader yet. Steps run top to bottom, and changing a setting marks that step
and every step after it stale:

| Step | What it does | Runs |
|---|---|---|
| Source & Units | Reads the file, sets units (m/cm/mm/in/ft) and Z-up → Y-up, welds with a tolerance, checks topology | auto |
| Geometry | Scale, mirror, rotate, pivot (centre, floor or authored), flip normals, normals mode (smooth/flat/angle split) | auto |
| UV Charts | Chart unwrap and pack (from Frontier-1), checker / chart preview, OBJ + UVs and SVG sheet export | Bake |
| SDF Bake | Signed distance field in a worker, slice view and raymarched preview, `.r32` export | Bake |
| Cluster LOD | Nanite-style cluster hierarchy in a worker, levels with triangle counts, error and wrong-material share; **Preserve materials** toggle (below) | Bake |
| Collision | Box, sphere or capsule fit, the SDF as a distance-field collider, or none | auto |
| Icon Bake | Content-browser icon inside a square capture frame, clay or normal shading, PNG export | auto |
| Metadata | Name, category and tags | auto |

**Compile & open** adds the compiled asset to Content and opens it as a new Blueprint class. Esc cancels.

### Material-aware cluster LOD

Every LOD triangle is a surviving source triangle, so it always keeps its material slot. Forced LODs and the
*Materials* preview draw each face with its own slot. With **Preserve materials** on (the default):

- Each material is clustered as if it were its own mesh, so every cluster holds one material.
- The simplifier holds the seams between materials, using the same machinery as open borders:
  - **Slide** (default): seam vertices may move only along the seam.
  - **Pin**: seam vertices never move, so borders stay exact and reduction stops earlier.
- Vertices where three or more materials meet never move, and no collapse may remove the last faces of a material
  in a group.
- It is still one mesh. Clusters on either side of a seam index the same shared vertices and edges, are grouped
  together across the seam and simplify together. Every level stays crack-free, and the check script verifies this
  with edge counts.

*Wrong material* is the share of a level's surface that shows a different material from the source surface nearest
to it.

| Mesh | Off | Slide | Pin |
|---|---|---|---|
| ControlVehicle body, LOD 2 | 2.6% at 726 tris | 0.02% at 744 tris | 0.3% at 884 tris |
| Torus, 8 material regions | 24% at 1254 tris | 0.9% at 1928 tris | 0.3% at 3984 tris |


**Component Viewer** (the Blueprint editor):

- *Components*: the scene hierarchy under DefaultSceneRoot. Drag a row onto another to re-parent it. Each row has a
  visibility toggle and a warning marker. Actor components (Vehicle Movement, Rotating Movement) sit in their own
  section. **Add** lists the component classes plus every compiled mesh in Content.
- *Viewport*: 7 inspection channels, keys 1–7: Lit, Unlit, Wireframe, Normals, UV checker, Cluster LOD and Collision.
  Click a component to select it, or drop a Content asset onto the viewport to add it. **Construction Script** shows a
  generated node graph you can pan, zoom and drag.
- *Details*: built from each class's property specs (transform, mesh and material slots, LOD, lights, camera,
  collision, vehicle wheels and powertrain). Selecting the root shows class defaults, compiler results and the asset
  pipeline state.
- *Drawer*: compiled-data cards (icon, UV, SDF, LOD, collision) for the selected mesh, plus Vehicle Lab's torque curve,
  editable with linear, smooth, ease or step interpolation.
- *Simulate* (Space): Vehicle Lab's drive preview, with speed, rpm, acceleration, torque, gear, throttle and brake.
  It spins the Vehicle Movement wheels and Rotating Movement components.
- **Compile** (Ctrl+S) validates the class and bakes its icon. The other keys are Del, Ctrl+D, F, G and Esc; press ? for
  the full list.

The starting class is **BP_ControlVehicle**, the Vehicle Lab car. Its body, tyre and rim `.facet` files are compiled
through the same pipeline. It has four wheels, each with a rim child, headlights, a chase camera, a bumper trigger and
Vehicle Movement, using the Vehicle Lab sheet values: 1300 kg, a 520 N·m peak and a 7200 rpm redline.

## Files

| File | Role |
|---|---|
| `Main.js` | Boot, workers, icon renderer, import flow, vehicle class |
| `GeometryCompile.js` | Import inspector UI |
| `CompileSteps.js` | Step pipeline, settings, invalidation (no DOM) |
| `ComponentViewer.js` | Blueprint editor UI |
| `Blueprint.js` | Component classes, property specs, tree operations, validation, torque curve, drive step (no DOM) |
| `Render.js` | three.js stage, mesh channels, icon renderer |
| `Ui.js`, `Icons.js`, `ComponentViewer.css` | Project Zero controls, icons and styles |
| `Engine/` | Readers, mesh analysis, workers; SDF, UV, cluster LOD, simplification, transform and OBJ export from Frontier-1 |
| `Models/` | ControlVehicle Body / Tyre / Rim (FCT1) from Vehicle Lab |
| `Vendor/`, `Fonts/` | three.js r187 + OrbitControls; DM Sans (OFL) |

## Checks

```
node Experimental/ComponentViewer/Scripts/CheckComponentViewer.mjs          # readers, pipeline, blueprint model, drive
npm install --prefix /tmp/smoke jsdom@25
JSDOM_DIR=/tmp/smoke node Experimental/ComponentViewer/Scripts/SmokeComponentViewer.mjs   # UI paths in jsdom
```

The smoke test boots the whole page with mocked WebGL and workers, then clicks through every main path. It fails on any
runtime error. It does not check what the GPU draws.

Sources: Vehicle Lab is `Experimental Remastered/AssetInspector` on Frontier-OLD, branch `arena/d96da802-frontier`.
Cluster LOD Studio is `Experimental/ClusterLodStudio` on Frontier-1, branch `arena/453e172d-frontier-1`. Copied engine
files keep an attribution header.
