# Fracture Editor and Environment Inspectors — Architecture Plan

🧩 Dual-path realtime and baked fracture workspace with infographic-driven inspectors for Fracture, Sun,
Atmosphere, and Clouds.

## 1. TL;DR

Frontier upgrades the legacy standalone `Experimental/FractureEditor` and `VehicleProvingGrounds` greedy
planar splitter into a unified **Realtime + Baked Fracture Studio** (`FractureDivision`) inside a three-column
`WorkspaceHost` (**`SceneDirectoryPanel` Left · `ViewportPanel` Centre · `SceneInspectorPanel` Right**). It
fuses **Principal-Stress Griffith partitioning** (3D bulk solids), **Mott/LEFM crack-tip propagation** (thin
panes with perimeter retention), and **Power-Voronoi `BondAdjacencyAtlas` clustering** (baked partial chipping
+ `R16F` SDF bricks), styled with infographic bento cards derived directly from the four `SourceImages/General UI`
references alongside unified **Sun**, **Atmosphere**, and **Clouds** inspectors.

---

## 2. Audit of Existing SultanAladin Fracture Implementations

Inspection across `SultanAladin/Frontier` (`Experimental/SlateReference/{A,B}`, `Exhibits/SceneDirectory`) and
`SultanAladin/Frontier-` (`Experimental/FractureEditor`, `SourceDepot/{Fragmentation,Propagation}`) located three
distinct fracture substrates:

| Upstream Location                                             | Substrate Mechanism                                      | Strengths                                               | Deficits to Resolve                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `VehicleProvingGrounds/Source/{FractureStructure,Sequence}.js`| Greedy 8-candidate planar half-space split (`2·Gc·A`)    | Closed convex hulls (`ΔV < 1e-7`), DP quality, SDF pool | Binary-tree cut seams; capped at 1 dynamic solid/step    |
| `FractureEditor/SourceDepot/Fragmentation/fracture.ts`        | Principal-stress Griffith + Hertzian cone + Weibull      | True radial/hoop cracks, rock bedding, natural arrest   | Three.js coupled; stripped down during earlier JS port   |
| `FractureEditor/SourceDepot/Propagation/{crack2d,regions}.ts` | Mott/LEFM Rayleigh tip network + flood-fill extraction   | T-junction wake shielding; border shards stay mounted   | Never wired into `FractureEditor` or 3D rigid-body world |
| `Experimental/FractureEditor/FracturePanel.{html,js}`         | 3-pane standalone specimen preview (`IndexedDB` storage) | Per-piece `32³–128³` SDF config, geometry receipt       | No `SceneDirectory` tree; prose-heavy inspector cards    |
| `Exhibits/SceneDirectory/Capture/inspector-fracture.png`      | Runtime debris settings page                             | Live rigid-body & SDF pool counters                     | No per-solid authoring, no infographics, prose blocks    |

---

## 3. Fracture Algorithm Comparison (Realtime + Baked Decision Matrix)

🔴 **Legend (`SKILL-Emoji.md`):** Cost / Memory / Effort: `✔️` = low (best), `🚩` = medium, `🔴` = high (worst).
**Accuracy / Realism / Closure:** `🔴` = highest (best), `🚩` = medium, `✔️` = low. Quality: `⭐` (more = better).

| Option                                                   | CPU/GPU Cost | Memory | Closure | Realism | Realtime Fit | Baked Fit | Quality   | Rank  |
| -------------------------------------------------------- | ------------ | ------ | ------- | ------- | ------------ | --------- | --------- | ----- |
| **Hybrid Stress-Griffith + LEFM Pane + Bond Atlas**      | ✔️           | ✔️     | 🔴      | 🔴      | 🔴           | 🔴        | ⭐⭐⭐⭐⭐ | 🥇 🏆 |
| Principal-Stress Griffith (`Fragmentation` upgraded)     | ✔️           | ✔️     | 🔴      | 🔴      | 🔴           | 🚩        | ⭐⭐⭐⭐  | 🥈    |
| Clustered Power-Voronoi + `BondAdjacencyAtlas`           | ✔️           | 🚩     | 🔴      | 🚩      | 🚩           | 🔴        | ⭐⭐⭐⭐  | 🥉    |
| Mott/LEFM Crack-Tip Network (`Propagation` panes only)   | ✔️           | ✔️     | 🔴      | 🔴      | 🔴           | 🚩        | ⭐⭐⭐⭐  | 🏅    |
| Legacy 8-Plane Greedy Split (`FractureStructure.js`)     | ✔️           | ✔️     | 🔴      | ✔️      | 🚩           | ✔️        | ⭐⭐⭐    | 🎖️    |
| Noise-Displaced Boolean Polygon-Complex Cutter           | 🔴           | 🔴     | 🚩      | 🔴      | ✔️           | 🔴        | ⭐⭐⭐    | 🏳️    |
| Tetrahedral Co-Rotational FEM / XPBD Continuum           | 🔴           | 🔴     | 🚩      | 🔴      | ✔️           | ✔️        | ⭐⭐      | 🏁    |

⭐ **Selected Architecture:** **Hybrid Stress-Griffith + LEFM Pane + Bond Atlas** (`🥇 🏆`) — preserves exact
closed convex hulls (`VolumeError < 1e-7`) and `< 1.5 ms` impact-local dynamic splitting while restoring
Hertzian cone plugs, T-junction pane cracks with perimeter retention, and baked `BondAdjacencyAtlas` partial
chipping.

---

## 4. Dual-Path Realtime + Baked Pipeline (`FractureDivision`)

```text
                        ┌──────────────────────────────────────────────────────┐
                        │           SolidSpecimen + FractureRecipe             │
                        │  Material(Gc, ρ, StoredEnergy) · Ceiling · MinSpan   │
                        └──────────────────────────┬───────────────────────────┘
                                                   │
                       ┌───────────────────────────┴───────────────────────────┐
                       ▼                                                       ▼
     ┌───────────────────────────────────┐                   ┌───────────────────────────────────┐
     │     REALTIME DYNAMIC (<1.5 ms)    │                   │     BAKED ARCHIVE (0.00 ms hit)   │
     │  ① Contact (p_hit, n_hit, ½μvₙ²)  │                   │  ① Authoring partition + Seed     │
     │  ② ThinAxis? → CrackTipNetwork    │                   │  ② Build BondAdjacencyAtlas       │
     │    Bulk?     → PrincipalStress    │                   │  ③ Bake 32³–128³ R16F SDF bricks  │
     │  ③ DP Triangulate (4√3·A / Σℓ²)   │                   │  ④ Encode .fracture.toml + .facet │
     └─────────────────┬─────────────────┘                   └─────────────────┬─────────────────┘
                       │                                                       │
                       └───────────────────────────┬───────────────────────────┘
                                                   ▼
            ┌─────────────────────────────────────────────────────────────────────┐
            │  CompositeFacetSet (1 draw submission/solid) + RigidBodyWorld       │
            │  + FragmentDistancePool (GPU SDF occlusion & GI bounce on birth)    │
            └─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Realtime Dynamic vs Baked Archive Contract

| Dimension              | Realtime Dynamic (`Dynamic`)                            | Baked Archive (`Baked`)                                  |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Impact Epicentre       | Exact runtime contact `p_hit` and striker vector `v_n`  | Pre-authored epicentre or localized bond-impulse release |
| Energy Budget          | `E = α · ½·μ·vₙ² + E_stored · V` (speed scales shards)  | Fixed recipe `Energy` + runtime impulse bond evaluation  |
| Partial Destruction    | Hertzian cone comminution near `p_hit`, slabs far away  | `BondAdjacencyAtlas` detaches only over-strained regions |
| Thin-Pane Perimeter    | `CrackTipNetwork` keeps border-mounted shards hanging   | Pre-scored radial/concentric petals with border anchors  |
| Runtime CPU Cost       | `0.6–1.8 ms` per impact (worker / SIMD partition)       | `0.00 ms` geometry generation (`< 0.05 ms` bond check)   |
| Distance Field (GI)    | Device-evaluated SDF brick from `FragmentDistancePool`  | Pre-baked `32³ / 64³ / 128³ R16F` brick in `.facet`      |
| Serialization Format   | `FractureRecipe` table in scene `.toml`                 | `.fracture.toml` metadata + binary `.facet` hull/SDF     |

---

## 5. Visual Design & SourceImage Component Mapping

Every surface, bento card, typography rule, and viewport overlay derives directly from the four mandatory
`SourceImages/General UI` references:

| Reference Image                            | Extracted Visual Tokens & Infographic Patterns                                   | Applied Studio Locations                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bef5178e3f075257202d8236789c9a73.jpg`     | `#e9f038` chartreuse active pill; 2-col biomarker range bars; multi-band         | Mode bar; Material `Gc` & `Slenderness` range cards; Weibull fragment    |
| *(Heart Biometric HUD)*                    | particle spectrum; radial closure arc; `[ ]` corner-bracket viewport callout     | mass spectrum; Planck wavelength chart; `[ ]` 3D impact zone reticle     |
| `0bab27674eea6c04ccaf172f194ce6ef.jpg`     | `#151618` matte bento; 2-up `Online / Offline` KPI tiles; split-tone numerals    | Outliner `Intact / Fractured` KPI cards; all hero readouts (`78.3%`);    |
| *(Fleet Operational Telemetry)*            | (`78.` bright + `3` muted); dashed `Target:` curve with white peaks & amber dips | `½·μ·v²` kinetic break curve; 24h solar elevation; step-time chart       |
| `13edfbc6a1110a5abd8ec9099429cf07.jpg`     | `#38b889` emerald glass; 2×2 rounded-square tool cluster; crosshair + dotted     | Left viewport 2×2 tool cluster; semi-circular bond-strain gauge;         |
| *(Facial Spatial Telemetry)*               | scan patch; dual-tone sine wave; semi-circular stress arc; concentric polar GFI  | concentric anisotropy & solar disc reticles; 2D cloud FBM density atlas  |
| `146a70d9e465a1a9def640bca5aa68f8.jpg`     | 1px obsidian dot-matrix canvas; `#cde286` sage-lime pill; 3D translucent glass   | Workspace dot-grid; 2-up 3D glass folder recipe cards; sage-lime KPI     |
| *(Skeletal X-Ray & Folder Archives)*       | folder pockets with fanned cards; `⚠` mesh callout; `+ / -` floating zoom dock  | highlight cards; X-ray stress plexus view; bottom timeline/explode dock  |

---

## 6. Workspace Layout & Inspector Specifications

```text
┌──────────────────────────┬───────────────────────────────────────────────┬──────────────────────────────────┐
│   SCENEDIRECTORYPANEL    │                 VIEWPORTPANEL                 │       SCENEINSPECTORPANEL        │
│       (Left 304 px)      │             (Centre Fluid Stage)              │          (Right 428 px)          │
├──────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
│ • Brand + Scene Header   │ • Top Pill Bar: Realtime Strike · Exploded ·  │ • Inspector Quick Switcher:      │
│ • 2-Up KPI Bento:        │   X-Ray Plexus · Bond Atlas · SDF Bricks      │   [Fracture][Solver][Sun]        │
│   [🟢 Intact] [🔴 Broken]│ • 2×2 Tool Cluster (Strike, Anchor, Cut, XRay)│   [Atmosphere][Clouds]           │
│ • Search + Tier Pills    │ • Live 3D Rigid-Body + Sky/Cloud/Fog Stage    │ • Sub-Tab Pill Bar               │
│ • Destruction Records:   │ • [ ] Corner-Bracket Impact Reticle +         │ • Infographic Bento Cards:       │
│   - Fracture Solver      │   Leader-Line Readouts (Gc, Cells, ΔV, ms)    │   - 3D Glass Folder Presets      │
│   - Concrete Pillar [RT] │ • ⚠ Tensile Strain Mesh Callout               │   - Split-Tone Hero Metrics      │
│   - Glass Pane [LEFM]    │ • Bottom Scrubber Dock:                       │   - Kinetic / Ephemeris Curves   │
│   - Tempered Pane [RT]   │   [+] [-] [Play 0.25×] ──┃── [Break][Reset]   │   - Weibull / RGB Shutters       │
│   - Timber Beam [BAKED]  │                          ▲                    │   - Polar Domes & FBM Atlases    │
│   - Granite Slab [BAKED] │                 Chartreuse Playhead           │   - Compact Geometry Receipt     │
│ • Environment Records:   │                                               │                                  │
│   - Sun · Atmosphere     │                                               │                                  │
│   - Clouds               │                                               │                                  │
│ • Sage-Lime Theme Pill   │                                               │                                  │
└──────────────────────────┴───────────────────────────────────────────────┴──────────────────────────────────┘
```

### 6.1 Inspector Instrument Inventory (Zero Prose Walls)

| Inspector      | Sub-Tabs                                         | Bespoke Infographic Instruments                                                          |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Fracture**   | `Overview` · `Pattern` · `Bonds & SDF` · `Bench` | 3D glass folder recipe pockets; 2×2 `Gc`/`ρ` biomarker bars; `½·μ·v²` break curve;       |
|                |                                                  | Weibull fragment spectrum; grain/stress polar dial; strain arc gauge; 4-solver benchmark |
| **Solver**     | `Debris & Field`                                 | `Awake / Sleeping` KPI pair; `1.5 ms` budget telemetry curve; SDF pool occupancy bar     |
| **Sun**        | `Overview` · `Daylight` · `Spectrum` · `Optics`  | Interactive polar solar dome; sage-lime `Sunlight 12.0×` card; 24h ephemeris curve       |
|                |                                                  | (`Lat/Lon/UTC`); Planck `380–780 nm` blackbody curve (`502 nm` peak); aureole reticle    |
| **Atmosphere** | `Visibility` · `Medium` · `Spectrum & LUT`       | 6-target receding contrast walk (`0–20 km`); `0–100 km` Rayleigh/Mie/Ozone altitude      |
|                |                                                  | profile; Henyey-Greenstein polar lobe; RGB spectral shutters; live `128×32` LUT canvas   |
| **Clouds**     | `Overview` · `Formation` · `Render` · `Weather`  | Live 4-octave PCG FBM density atlas; 2D `Coverage × Density` pad; altitude trapezoid     |
|                |                                                  | envelope; pixel-share target grid (`35%/axis`); polar wind compass; lightning trigger    |

---

## 7. C++ Engine Integration & Naming Alignment (`SKILL-Naming.md`)

- **Coordinator & Data Structures:**
  - `FractureDivision` (replaces any banned coordinator suffix)
  - `FractureRecipeSpecification` (TOML-serialized per-record authoring payload via `toml++`)
  - `PrincipalStressPartition` (3D Griffith + Hertzian cone convex splitter)
  - `CrackTipNetwork` (2.5D Mott/LEFM shell propagation + perimeter retention)
  - `BondAdjacencyAtlas` (contiguous face-pair impulse capacity table for baked cluster chipping)
  - `CompositeFacetSet` + `FragmentDistancePool` (single-submission Vulkan/Slang draw + `R16F` SDF bricks)
- **Environment Alignment:**
  - Binds directly to `Frontier::AtmosphereParameters` + `Frontier::TransmittanceLut` (`AtmosphereModel.h`)
    and `Frontier::CloudParameters` (`CloudField.h`), plus `DirectionalLightSpecification` (`Sun`).
- **Interactive HTML Deliverable:**
  - `Exhibits/FractureEditor/FractureEditor.html` — standalone interactive studio implementing all four
    fracture solvers, rigid-body debris physics, volumetric sky/cloud/lightning viewport rasterization,
    switchable `SourceImages` themes, and all five infographic inspectors (`Fracture`, `Solver`, `Sun`,
    `Atmosphere`, `Clouds`).
