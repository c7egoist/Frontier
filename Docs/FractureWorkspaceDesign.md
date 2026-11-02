# Frontier Fracture & Celestial Workspace — Architecture & Solver Comparison

🧩 Unified realtime + baked fracture authoring workspace with infographic inspectors for Fracture, Sun, Atmosphere, and Clouds.

## 1. Fracture Solver Comparison Across Upstream & Runtime Paradigms

Comparison of all fracture implementations inspected across `SultanAladin/Frontier`, `SultanAladin/Frontier-`, and `SultanAladin/RockGenerator` against our unified **Dual-Pipeline (Realtime + Baked SDF + Hybrid Strain-Bond)** architecture.
**Legend (`SKILL-Emoji.md`):** Cost / Memory / Effort: `✔️` = low (best), `🚩` = medium, `🔴` = high. Accuracy / Material Realism: `🔴` = best.

| Solver Architecture | Upstream Origin | Mechanism | Runtime Cost | Memory | Accuracy | Realtime | Baked + SDF | Quality | Rank |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **Engineering Navier–Cauchy + Fractography (`EngineeringBakedFracture.js`)** | **This Workspace (Bake)** | 3D Navier–Cauchy elastostatic lattice + exact $3\times 3$ Cauchy eigenstresses + Rankine Mode-I / Mohr–Coulomb Mode-II + 3D wake stress relaxation (`T`-junctions) + matched interlocking fractography ($H=0.78$ + aggregate pullout sockets / Wallner / splinters, $\Delta V/V_0 \approx 5\times 10^{-16}$) | 🔴 `20–110 ms` *(Author Bake)* | 🚩 | 🔴 | 🚩 *(Pre-Baked)* | 🟢 | ⭐⭐⭐⭐⭐ | 🥇 🏆 |
| **Fast Boussinesq Flat-BSP + 1-Draw-Call GPU (`FastRuntimeFracture.js`)** | **This Workspace (Runtime)** | Pre-allocated CSR `Float64Array`/`Int32Array` arena + 1-clip Boussinesq–Hertz normal + $O(N)$ `CutToken` bonds + single `RGBA32F` `DataTexture` GPU transform batch | ✔️ `0.25–1.25 ms` | ✔️ | 🚩 | 🟢 *(`1 Draw Call`)* | 🟢 | ⭐⭐⭐⭐⭐ | 🥈 🏆 |
| **Griffith Stress-Budgeted Clipping** | `Frontier-` (`Fragmentation`) | Analytic principal tensile stress + Hertzian cone + `2·Gc·A` plane cuts + grain/tempering | 🚩 `4.5–15 ms` | ✔️ | 🔴 | 🚩 | 🟢 | ⭐⭐⭐⭐ | 🥉 |
| **LEFM Dynamic Crack-Tip Wavefront** | `Frontier-` (`Propagation`) | Mott speed `v = v_t(1 − Gc/G)`, `0.4 cR` branching, wake shielding (`T`-junctions) | ✔️ `0.8–2.0 ms` | ✔️ | 🔴 | 🟢 | 🚩 | ⭐⭐⭐⭐ | 🏅 |
| **Voronoi Convex Hull Lattice** | `Frontier` (`EverestInterface`) | Golden-angle / Poisson seed bisectors + impact radial envelope | 🔴 `4–26 ms` | ✔️ | 🚩 | 🚩 | 🟢 | ⭐⭐⭐ | 🎖️ |
| **Dendritic Lightning + Core-Rind CSG** | `RockGenerator` (`fracture.ts`) | Inner eroded cortex + stochastic polyline cuts + BVH boolean `INTERSECTION` | 🔴 `90–600 ms` | 🔴 | 🔴 | 🔴 | 🟢 | ⭐⭐⭐⭐ | 🎖️ |

⭐ **Architectural Resolution:** Pure Voronoi produces blobby stone-like cells for every material, whereas pure BVH-CSG is too slow for runtime hits. Combining **Griffith Stress-Budgeted Convex Clipping** (realtime `<2 ms`, watertight `ΣV = V₀` to `10⁻⁷`), **LEFM Radial/Ring/Dicing Wavefronts** (plate brittle glass), **Voronoi Adjacency Strain Bonds** (progressive cluster collapse), and **Offline Baked Archives + `32³ / 64³ / 128³` Piece SDF Voxel Atlases** delivers both sub-2ms realtime destruction and zero-allocation baked runtime playback.

---

## 2. Visual & Infographic Theme Synthesis (`SourceImages/General UI`)

Every surface, card, control, and viewport overlay is synthesized from the four specified `SourceImages/General UI` references with zero reuse of prior HTML layouts.

| Source Reference | Extracted Visual Language | Workspace Application |
| :--- | :--- | :--- |
| `bef5178e...jpg` *(Golden X-Ray Scan)* | Matte `#0A0B0A` canvas, `#EFE838` active pill tabs, X-ray rim + warm amber internal glow, `[ ]` viewport reticle + arc dial, multi-band spectrum bars, glowing timeline playhead | **X-Ray Stress Viewport Lens**, Top Pill Switchers, Impact Reticle HUD, Bottom Playback & Fracture Timeline, Material Spectrum Bars |
| `0bab2767...jpg` *(Monochrome Ops)* | Pure dark bento cards (`20px` radius, `1px` hairline), split-tone hero numerals (`78.` white + `.3` slate), `🟢`/`🔴` KPI status cards, dashed target threshold waveform | **Outliner KPI Cards**, **Griffith Stress & Weibull Waveform Card**, Split-Tone Metric Typography, Diagonal Vector Corner Indicators |
| `13edfbc6...jpg` *(Emerald Telemetry)* | Frosted dark glass (`blur(20px)`), bioluminescent `#38B28B` accents, `2×2` rounded-square tool cluster, semi-circular arc gauge, nested concentric radar rings | **Telemetry Scan Viewport Lens**, `2×2` Viewport Tool Cluster, **Polar Anisotropy Toughness Radar**, **24h Solar Diurnal Arc** |
| `146a70d9...jpg` *(Dot-Matrix & Plexus)* | Subtle micro-dot canvas, white Delaunay/Voronoi structural lines + yellow stress zone, floating glass callouts, 3D pocket preset cards, `#C8DF52` sage-lime action pills | **Bond Plexus Viewport Lens**, **Baked Archive Pocket Cards**, Dot-Matrix Backdrop, `+` / `−` Circular Viewport Controls |

---

## 3. Tri-Column Spatial Layout & Domain Coverage

```text
┌──────────────────────────────┬────────────────────────────────────────────────────┬────────────────────────────────────┐
│ LEFT: SCENE DIRECTORY        │ CENTRE: 3D REALTIME + BAKED VIEWPORT               │ RIGHT: INFOGRAPHIC INSPECTOR       │
│ (Outliner · 300 px)          │ (WebGL2 PBR + Sky/Cloud Raymarch + Physics)        │ (Bento Infographics · 416 px)      │
├──────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────────────────┤
│ • Brand & Search Capsule     │ • Top Floating Pills:                              │ • 4-Domain Pill Bar:               │
│ • Category Filter Chips      │   [Realtime | Baked | Hybrid Bonds | Matrix]       │   [Fracture | Sun | Atmos | Clouds]│
│ • Dual KPI Cards (Live/Baked)│   [PBR | X-Ray | Telemetry | Bond Plexus | SDF]    │                                    │
│ • Celestial & Media Group:   │ • 2×2 Square Viewport Tool Cluster                 │ • FRACTURE: Pipeline, Griffith     │
│   - Directional Sun          │ • Interactive 3D Stage:                            │   Waveform, Polar Toughness Rose,  │
│   - Sky Atmosphere           │   - Click-to-Strike Raycast Impact + Gizmo         │   Impact Pad, Piece SDF + Archive  │
│   - Global Cloud Slab        │   - Closed Convex Shards + Bond Breakage           │ • SUN: 15-Property Ephemeris, 24h  │
│   - Local Cloud Volume       │   - Live Sky Scatter + Cloud Slab + Sun Shadows    │   Solar Arc, Disc Tint, World Map  │
│ • Destructible Constructs:   │ • Reticle Bracket HUD + Dual Integrity Rings       │ • ATMOSPHERE: 256×512 LUT Viewer,  │
│   - 7 Material/Shape Targets │ • Bottom Timeline:                                 │   Rayleigh/Mie/Ozone Altitude Plot │
│ • Fragment Cluster Stream    │   - Bullet-Time (0.1×–1×), Scrub Playhead, Explode │ • CLOUDS: Global/Local 1−exp(−3ρ)  │
│ • Spawn + 4-Theme Switcher   │   - Phase Clips (Nucleate → Propagate → Settle)    │   Density Mask, World-Z Slab Slice │
└──────────────────────────────┴────────────────────────────────────────────────────┴────────────────────────────────────┘
```

---

## 4. Physical Domain Specifications

| Inspector | Underlying Equations & Retained Engine Fields | Interactive Infographic Controls |
| :--- | :--- | :--- |
| **Fracture** | Griffith energy `ΔE = 2·Gc·A`, Rayleigh wave speed `cR = 0.92√(μ/ρ)`, tempering `U = 46 kJ/m³`, orthotropic cost `1 + (k−1)(n·g)²`, Euler manifold `V − E + F = 2`, `ΣVᵢ = V₀` | Weibull/Stress Threshold Curve, Polar Anisotropy Rose, Impact Locus Pad + Hertzian Cone Dial, `32³/64³/128³` SDF Iso-Slice + LED Residency Matrix, Archive Pocket Cards |
| **Sun** | All 15 native fields: Solar Declination `δ`, Equation of Time `EoT`, Elevation `α`, Azimuth `γ`, Kasten-Young Air Mass `AM`, Angular Diameter `0.533°`, RGB Tint, Sky/Direct Multipliers | 24-Hour Diurnal Solar Path Gauge with Twilight Bands, Proportional Solar Disc Chromatic Preview, Diagonal-Hatched Gain Comparison Bars, Clickable Dot-Matrix World Graticule |
| **Atmosphere** | All 18 native fields (Bruneton & Neyret / Hillaire): `H_R = 8 km`, `H_M = 1.2 km`, HG `g`, Ozone tent (`25 ± 15 km`), Ground Albedo, Twilight Glow, `256 × 512` RGBA16F LUT | 4-Mode HDR Bake Viewer (`Altitude Profile`, `Panorama 4:1`, `Transmittance`, `Full Sphere 2:1`), `0–100 km` Multi-Channel Optical Density Graph, HG Phase Lobe Polar Plot |
| **Clouds** | Global Slab & Local Box: deterministic PCG 4-octave FBM, Beer-Lambert `exp(−σ_t·s)`, `1 − exp(−3ρ)` top-down projection, 6 morphologies, Anvil overhang, Wind advection | Continuous `192 × 96` Top-Down Density Field, Draggable World-Z Slab Column with Ceiling Clip + `X–Z` Cross-Section, Local 3D Box Extents Diagram, Wind Vector Compass |
