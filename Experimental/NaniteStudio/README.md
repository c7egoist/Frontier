# 🧩 Nanite Virtual Geometry Studio (`Experimental/NaniteStudio`)

> **Interactive WebGL / GPU reference studio for continuous cluster-based Virtual Geometry (Nanite) and monotonic hierarchical LOD streaming**, deeply inspired by [bdwhst/Vulcanite](https://github.com/bdwhst/Vulcanite) and styled with the canonical **Project-Zero Editor UI foundation** (trapezoidal tabs, Project-Zero notch, Outliner, 3D Stage, 2×2 metric readout cards, categorized Property Inspector, and bottom Performance Drawer).

![Nanite Studio Overview](Images/NaniteStudioOverview.png)

---

## 🎯 Architecture & Core Algorithms

Traditional Level of Detail (LOD) systems swap entire discrete meshes based on distance, causing noticeable visual popping, cracking along shared boundaries, and severe overdraw when high-poly models shrink to sub-pixel sizes.

This studio implements a complete **Nanite-style Virtual Geometry Pipeline**:

```
[Raw High-Poly Mesh]
         │
         ▼
[30-Bit Morton Curve Sorting] ──► [Partition into <=128-Triangle Clusters] (Level 0)
         │
         ▼
[Cluster Grouping (2-4 Clusters)]
         │
         ▼
[Seam-Locked QEM Edge Collapse Decimation] (Perimeter vertices strictly fixed)
         │
         ▼
[Re-Cluster Simplified Triangles] ──► [Level 1, Level 2, ... Coarser Clusters]
         │
         ▼
[Monotonic Error Propagation] (ParentError > SelfError guaranteed)
         │
         ▼
[Runtime Continuous DAG Cut Selection] (ParentProjectedError > τ && SelfProjectedError <= τ)
         │
         ▼
[6-Plane Frustum Culling + Normal-Cone Backface Culling + Hi-Z]
         │
         ▼
[Direct GPU Hardware / Multi-Instance Draw Submission]
```

### 1. 30-Bit Morton Space-Filling Curve Clustering
Triangles are sorted along a 3D Z-order Morton space-filling curve. Centroids are normalized to $[0, 1023]^3$ (10 bits per axis) and bit-interleaved into a single 30-bit integer. Sorting by Morton code guarantees spatial locality, allowing contiguous spans of $\le 128$ triangles to form tight geometric clusters.

### 2. Seam-Locked Quadric Error Metric (QEM) Decimation
To allow arbitrary LOD cuts without cracking or holes:
- Adjacent clusters in Level $L$ are merged into a cluster group.
- The **perimeter edges and boundary vertices** of the cluster group are strictly identified and **locked**.
- Edges between boundary vertices are never collapsed; internal edges collapse using symmetric $4 \times 4$ plane quadrics $Q(v) = \sum p p^T$.
- Because boundary vertices and edges remain **100% bit-exact**, any neighboring cluster group rendered at Level $L$, $L+1$, or $L+2$ shares identical boundary coordinates—**zero cracks, zero T-junctions!**

### 3. Monotonic Error Hierarchy Invariant
Each cluster tracks:
- `SelfError` ($E_{self}$): Geometric simplification error introduced by this cluster.
- `ParentError` ($E_{parent}$): Error of the coarser parent cluster group that replaces this cluster.
- **Monotonicity Rule**: $E_{parent} > E_{self}$ is strictly enforced.

### 4. Runtime Continuous LOD Cut Selection
Given camera position, field of view, and screen height:
$$\text{PixelsPerRadian} = \frac{\text{viewportHeight}}{2 \cdot \tan(\text{FOV} / 2)}$$
$$\text{ProjectedSelfError} = \frac{E_{self} \cdot \text{PixelsPerRadian}}{\text{DistanceToSphere}}$$
$$\text{ProjectedParentError} = \frac{E_{parent} \cdot \text{PixelsPerRadian}}{\text{DistanceToSphere}}$$
A cluster is rendered if and only if:
$$\text{ProjectedParentError} > \tau \quad \land \quad \text{ProjectedSelfError} \le \tau$$
where $\tau = \text{MaxAllowedPixelError} \cdot 2^{-\text{LODBias}}$ (default $1.0\text{ px}$).

### 5. Culling Pipeline & Freeze LOD Visualizer
- **Frustum Culling**: Evaluates cluster bounding sphere against 6 camera frustum planes.
- **Normal-Cone Backface Culling**: Evaluates unit cone direction $\vec{N}_{cone}$ against view vector $\vec{V}$; if $\vec{N}_{cone} \cdot \vec{V} > \sin(\theta_{cutoff})$, the entire cluster faces away from the camera and is rejected before rasterization.
- **Freeze Culling / Freeze LOD**: Locks the culling and LOD selection camera in place, and renders a 3D wireframe pyramid of the frozen camera frustum. The user can fly around outside the frustum to inspect outside-the-frustum culling and distance LOD banding in real time!

---

## 🎨 Project-Zero Editor UI Surfaces

| UI Surface | Description |
| :--- | :--- |
| **Top Notch** | Center pull-down trapezoidal notch with quick preset scene buttons, Freeze LOD button, Wireframe toggle, and live 60 FPS badge. |
| **Trapezoidal Dock Tabs** | Sloped bevel tabs (`Outliner ×`, `Stage Viewport ×`, `Inspector ×`, `+`) integrating seamlessly into panel backgrounds. |
| **Scene Outliner** | Search filter, summary visible/total counters, and hierarchical tree of scene instances with visibility toggles and triangle count badges. |
| **3D Stage Viewport** | WebGL Three.js viewport with Orbit & Fly controls, floating view mode pills (`PBR Surface`, `Cluster IDs`, `LOD Levels`, `Error Heatmap`, `Normal Cones`), and bottom telemetry readout. |
| **Property Inspector** | Hero preview banner, 2×2 metric readout cards (`Virtual / Active Tris`, `Active Clusters`, `Screen Error`, `Frame Time`), and categorized control cards. |
| **Performance Drawer** | Bottom pull-up drawer featuring real-time LOD Level Histogram canvas and rolling 60-sample frame time graph. |

---

## 🚀 Local Launch & Verification

Run the automated verification suite:

```bash
node Experimental/NaniteStudio/NaniteValidation.mjs
```

Start the local preview server:

```bash
python3 Experimental/NaniteStudio/Serve.py 8098
```

Open `http://localhost:8098/` in any WebGL2-capable browser.
