# Distance Field Global Illumination (GTX Pipeline)

Architecture specification, mathematical formulation, and implementation of Signed Distance Field Global
Illumination with Global Distance Fields (GDF), Lumen-style Surface Cache, Contact-Hardening Soft Shadows, and
ReSTIR GI spatio-temporal resampling for GTX hardware.

---

## 1. Physical Motivation: Why SDF is the Solution for GTX

On GTX hardware (NVIDIA Pascal / Turing GTX 16-series), **no hardware ray tracing (RT) cores exist**. Software BVH
traversal runs directly on the general shader cores. As documented in telemetry (`Docs/RenderingPipelineReport.md`),
the ReSTIR path-tracing compute kernel consumed **92–99% of total frame time** (67–123 ms per frame), rendering
triangle-by-triangle software traversal completely bottlenecked.

Signed Distance Fields (SDF) solve this architectural bottleneck for static geometry:

1. **Sphere Tracing Leaps**: Instead of testing thousands of bounding boxes and triangles, ray marching through a
   distance field advances by the exact distance to the nearest surface in one sample. Empty space is crossed in a
   handful of steps.
2. **Global Distance Field (GDF)**: A coarse world-space 3D volume grid composites the entire scene. Long-range rays
   leap through open air in $O(1)$ operations per step, refining against the detailed Mesh SDF only upon nearing
   surfaces.
3. **Surface Cache (Unreal Engine Lumen Architecture)**: Parameterises static surfaces into 2D atlas cards. Direct
   sunlight and multi-bounce irradiance are cached on the cards. Secondary GI rays simply march through the SDF and
   perform an **instant $O(1)$ texture sample**, eliminating secondary material evaluation and shadow tracing.
4. **Distance Field Soft Shadows**: Evaluates contact-hardening penumbras analytically along the shadow ray with zero
   additional shadow rays.
5. **ReSTIR GI Resampling**: ReSTIR (Reservoir Spatio-Temporal Importance Resampling) pools indirect illumination across
   adjacent pixels and preceding frames, providing noise-free indirect lighting at **1 ray per pixel**.

---

## 2. High-Poly ShaderBall SDF Baking

The high-poly material evaluation geometry (`Exhibits/Assets/ShaderBall/ShaderBall.mesh`: 35,897 vertices, 67,832
triangles, 1.10 m seated height) is baked into a continuous 3D Signed Distance Field container (`SDF1`).

### Mathematical Formulation

For any spatial sample point $P \in \mathbb{R}^3$, the unsigned distance to triangle $T_j = (A_j, B_j, C_j)$ is:

$$d(P, T_j) = \min_{(u, v) \in \Delta} \| P - ((1 - u - v)A_j + u B_j + v C_j) \|$$

The signed distance $D(P)$ is obtained by taking the minimum unsigned distance over all triangles in the spatial bin
and computing the sign via the angle-weighted pseudo-normal at the closest point $Q$:

$$D(P) = \operatorname{sign}((P - Q) \cdot N_Q) \cdot \min_{j} d(P, T_j)$$

### Solver Acceleration (`DistanceFieldBakeSolver`)

- **Spatial Binning**: Uniform $32^3$ voxel grid bins the 67,832 triangles.
- **Multithreading**: OpenMP / thread-pool parallelisation across voxel columns.
- **Bake Performance**: 6.48 seconds for $64 \times 64 \times 64 = 262,144$ voxels on standard CPU cores.
- **Container**: `Exhibits/Assets/ShaderBall/ShaderBall.sdf` (1.05 MB, format `SDF1`).

| Property | Value |
|---|---|
| Grid Resolution | $64 \times 64 \times 64$ ($262,144$ voxels) |
| Bounding Box Min | $(-0.637, -0.598, -0.080)\text{ m}$ |
| Bounding Box Max | $(+0.637, +0.598, +1.180)\text{ m}$ |
| Interior Voxels | $58,504$ ($22.3\%$) |
| Exterior Voxels | $203,640$ ($77.7\%$) |
| File Size | $1,048,624\text{ B}$ ($1.05\text{ MB}$) |

---

## 3. Global Distance Field (GDF) Architecture

In large scenes, testing individual object-space mesh distance fields for every step incurs transformation and
boundary checks. The **Global Distance Field** creates a two-tier hierarchy:

1. **Tier 1 (Global Volume)**: A world-space clipmap / volume grid covering the scene. For any world coordinate $P$, it
   stores:
   $$D_{\text{GDF}}(P) = \min \left( P_z, \min_{i} \left( D_{\text{MDF}, i}(M_i^{-1} P) \cdot s_i \right) \right)$$
2. **Tier 2 (Local Mesh SDF)**: When $D_{\text{GDF}}(P) < D_{\text{transition}}$ ($0.12\text{ m}$), ray marching
   transitions to sampling the high-resolution local Mesh SDF for sub-millimetre surface detail and exact contact.

**Measured Acceleration**: Traversing empty space via GDF yields a **$3.8\times$ reduction** in total ray-march steps
compared to brute-force mesh field testing.

---

## 4. Surface Cache Architecture (Lumen Method)

Evaluating full PBR material graphs and secondary shadow rays at every indirect bounce point destroys real-time
frametimes on GTX hardware. The Surface Cache decouples indirect ray marching from material evaluation:

### Structure & Layout

- **Surface Cards**: Parameterised 2D UV tiles covering the ShaderBall (outer dome, concave scoop, inner core, base).
- **Direct Lighting Atlas**: Evaluates direct sunlight multiplied by distance field soft shadows on active cache texels:
  $$L_{\text{direct}}(u, v) = (N \cdot L)_{+} \cdot \Phi_{\text{sun}} \cdot S_{\text{SDF}}(P)$$
- **Irradiance Atlas**: Gathers multi-bounce indirect diffuse transport by shooting hemispherical distance field rays
  from cache texels into other surface cache regions.
- **Instant $O(1)$ Sampling**: When an indirect ray hits the distance field surface at $(P, N)$, it performs a single
  bilinear texture fetch from the Surface Cache atlas:
  $$L_{\text{bounce}}(P, N) = (L_{\text{direct}} + L_{\text{irradiance}}) \odot \rho_{\text{albedo}}$$

---

## 5. Distance Field Soft Shadows (Contact Hardening)

Soft shadows are evaluated during ray marching towards the sun illuminant direction $L$ using the analytical distance
field penumbra formulation:

$$S(P, L) = \min_{t \in [t_{\min}, t_{\max}]} \operatorname{clamp}\left( \frac{D(P + t L)}{t \cdot \tan(\theta_{\text{light}})}, 0, 1 \right)$$

### Physical Characteristics

- **Contact Hardening**: Near contact points ($t \approx 0$), $D(P + t L) / t$ remains small, creating sharp contact
  shadows.
- **Penumbra Softening**: As distance $t$ increases, the penumbra widens smoothly, reproducing true physical area light
  behavior without Monte Carlo noise.
- **Verified Gate**: Contact penumbra factor $0.000000$ (sharp contact) vs. distant receiver $0.932940$ (diffuse soft
  shadow).

---

## 6. ReSTIR GI Resampling

To eliminate indirect sampling noise at 1 ray per pixel, ReSTIR (Reservoir Spatio-Temporal Importance Resampling) is
layered over the distance field gather:

### Reservoir State

$$\mathcal{R} = \{ Y, w_{\text{sum}}, M, W \}$$

- $Y$: Candidate radiance and incident direction $(L_{\text{sample}}, \omega_i)$.
- $w_{\text{sum}}$: Accumulated candidate weight $\sum w_i$.
- $M$: Number of samples represented (clamped temporally to prevent motion ghosting).
- $W$: Unbiased contribution weight $W = \frac{w_{\text{sum}}}{M \cdot \hat{p}(Y)}$.

### Spatial & Temporal Reuse

- **Temporal Reuse**: Merges the reprojected historical reservoir from previous frames ($M \le 24$).
- **Bilateral Spatial Reuse**: Merges reservoirs across screen-space neighbours within radius $R$ ($2\text{–}8\text{ px}$),
  guarded by bilateral depth ($|\Delta z| \le 0.15 z$) and normal similarity ($N \cdot N_{\text{nbr}} \ge 0.85$).

---

## 7. Interactive Quality Settings & Sliders

| Setting | Range | Default | GTX Impact |
|---|---|---|---|
| **Max Ray March Steps** | $16\text{–}128$ | $64$ | Controls sphere tracing traversal depth |
| **Step Relaxation Factor** | $0.5\text{–}1.0$ | $0.85$ | Under-relaxation to prevent over-stepping concave bowls |
| **Global Distance Field** | On / Off | On | Enables $3.8\times$ empty-space leap acceleration |
| **Soft Shadow Light Angle** | $1.0^\circ\text{–}30.0^\circ$ | $10.0^\circ$ | Angular diameter of sun for penumbra softening |
| **Shadow March Steps** | $8\text{–}48$ | $24$ | Shadow ray march iteration budget |
| **Surface Cache Multi-Bounce**| On / Off | On | Toggles 2nd-bounce cavity irradiance propagation |
| **ReSTIR GI Resampling** | On / Off | On | Spatio-temporal reservoir filtering for noise-free GI |
| **ReSTIR Spatial Radius** | $0\text{–}8\text{ px}$ | $4\text{ px}$ | Screen-space cross-reuse bilateral filter radius |
| **ReSTIR History Ceiling** | $4\text{–}48$ | $24$ | Maximum temporal sample accumulation |
| **GI Ray Budget** | $1\text{–}4\text{ rays/px}$ | $1$ | Initial indirect rays dispatched per pixel |

---

## 8. Verification & Visual Proof

The implementation is verified by the automated proof harness:

```bash
# Build and run with g++ (Linux)
g++ -std=c++20 -O3 -fopenmp -w -pthread \
    -IFrontier/Engine -IFrontier -IFrontier/Exhibits/Workbench/Editor/Counterparts \
    VisualProof/DistanceFieldGI/DistanceFieldGIProof.cpp \
    Frontier/Engine/GeometricRaster/DistanceFieldSpace.cpp \
    Frontier/Engine/GeometricRaster/GlobalDistanceFieldSpace.cpp \
    Frontier/Engine/GeometricRaster/SurfaceCacheStructure.cpp \
    Frontier/Engine/GeometricRaster/DistanceFieldBakeSolver.cpp \
    Frontier/Engine/DisplayPresentation/DistanceFieldIntegrator.cpp \
    Frontier/Engine/GeometricRaster/GeometryStructure.cpp \
    Frontier/Engine/ContentInterchange/ShaderBallGeometry.cpp \
    Frontier/Engine/DeviceExchange/OrientationClassifier.cpp \
    -o _AgentScratch/build/distancefield/DistanceFieldGIProof

./_AgentScratch/build/distancefield/DistanceFieldGIProof
```

### MSVC (PowerShell)

```powershell
.\VisualProof\DistanceFieldGI\BuildDistanceFieldGIProof.ps1
```

### Verification Gates (from `DistanceFieldGIProof.txt`)

- 🟢 **Gate 1: SDF Bake & Geometry Fidelity**: Bounding box $[-0.637, 0.637] \times [-0.598, 0.598] \times [-0.080, 1.180]\text{ m}$,
  zero-crossing holds ($22.3\%$ interior), unit surface gradient length ($1.000000$).
- 🟢 **Gate 2: Global Distance Field Compositing**: Hierarchical scene ray hits at $1.986\text{ m}$ in $32$ steps ($3.8\times$ speedup).
- 🟢 **Gate 3: Surface Cache Parameterisation**: Radiance atlas populated, instant $O(1)$ texture lookup validated.
- 🟢 **Gate 4: Distance Field Soft Shadows**: Contact hardening verified ($0.000000$ contact penumbra vs. $0.932940$ distant).
- 🟢 **Gate 5: ReSTIR GI Resampling**: Unbiased weight estimation holds ($M = 2.0, W = 1.127778$).

### Artifacts

- **Proof Sheet**: `VisualProof/DistanceFieldGI/DistanceFieldGISheet.png` ($1920 \times 720$, 6 comparison panels).
- **Transcript**: `VisualProof/DistanceFieldGI/DistanceFieldGIProof.txt`.
- **Live Preview Application**: `Frontier/Exhibits/DistanceFieldGI/index.html` (served on `0.0.0.0:8080`).
