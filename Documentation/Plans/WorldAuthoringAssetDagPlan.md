# World Authoring, Approved Format Registry & Persistent Artifact DAG Plan

> **TL;DR**: Replace hardcoded showcase fallbacks in `EditorLifecycle` / `ShowcaseGalleryScene` with an authoritative **`.WorldSpace`** TOML + `64B`-aligned SFNT/TTF-style container lifecycle, map all **41 approved extensions** (first preference) plus unreplaced legacy **`.Space`** domains onto banned-word-compliant C++20 `Engine/` modules, and cache immutable derived outputs in a **SHA-256 Persistent Dependency DAG** (`Saved/DerivedArtifacts/`) to eliminate runtime and edit-time recomputation. *(Status: 🚧 Proposed architecture — audited against current workspace sources; no runtime code modified in this planning step.)*

---

## 1. Mandatory Decisions & Open-Choice Tables

*Legend — Safety / Determinism / Tooling Fit: `🔴` = High (best) · `🚩` = Medium · `✔️` = Low. Rework / Complexity Cost: `✔️` = Lowest (best) · `🚩` = Medium · `🔴` = High. Quality: plain `⭐` (`1–5`).*

### 1.1 Extension Write Casing Policy (Option 2A vs. Exact Lowercase)

| Rank | Candidate Policy | Load Behavior | Write Behavior | Compatibility with `SpaceContainerCodec` | Rating |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 🏆 🥇 | **Option 2A — Case-Insensitive Load, Canonical `PascalCase` Write** *(Old-Plan Rule)* | Accepts `.worldspace`, `.WorldSpace`, `.Fontspace`, `.fontspace`, `.FontSpace` identically on Windows/Linux/Android | Writes `.WorldSpace`, `.FontSpace`, `.PixelAtlas`, `.SkyAtmosphere`, `.ShaderGraph`, etc. | 🔴 *(Already implemented in `SpaceContainerCodec.cpp`)* | ⭐⭐⭐⭐⭐ |
| 🥈 | **Option 2B — Case-Insensitive Load, Exact Lowercase Write** | Same case-insensitive decoder | Writes exact lowercase `.worldspace`, `.interface`, `.fontspace`, etc. | 🚩 *(Requires changing existing `Content/` & `SpaceSuffixRegistry`)* | ⭐⭐⭐⭐ |

💡 **Recommendation:** Retain **Option 2A** from `DocumentFormatsInstancePlan.md` §1 & `SpaceContainerCodec.cpp` (load case-insensitively across all 41 names; write canonical `PascalCase` unless you confirm Option 2B lowercase-on-write is preferred).

### 1.2 Persistent Derived Artifact Storage Layout (Zero Recomputation)

| Rank | Candidate Layout | Deduplication & Sharing | Source Cleanliness / Git Safety | Rework Cost | Rating |
| :---: | :--- | :---: | :---: | :---: | :---: |
| 🏆 🥇 | **Two-Tier Content-Addressed Repository (`Saved/DerivedArtifacts/<Sha256Prefix>/<Digest>.DerivedArtifact`)** | 🔴 *(Cross-world sharing by SHA-256 key)* | 🔴 *(Keeps `Content/` authoring files pure & Git-small; `Saved/` already git-ignored)* | ✔️ | ⭐⭐⭐⭐⭐ |
| 🥈 | **Co-Located Sidecar Files (`<Asset>.Derived.<Ext>`)** | ✔️ *(Per-path only; duplicates identical bakes)* | 🚩 *(Pollutes `Content/` with hardware/driver binaries)* | 🚩 | ⭐⭐⭐ |
| 🥉 | **Embedded Derived Section Inside Authoring File** | ✔️ *(Single file only)* | 🔴 *(Mixes driver-specific BVH/SPIR-V into portable source files)* | 🔴 | ⭐⭐ |

💡 **Recommendation:** Use **`Saved/DerivedArtifacts/<Sha256Prefix>/<Digest>.DerivedArtifact`** using the **same Two-Tier TOML + `64B`-aligned SFNT/TTF binary container** (`SpaceContainerCodec`), keeping authored `.WorldSpace` / `.ShaderGraph` / `.SkyAtmosphere` files portable and small while never recomputing unchanged derived outputs on startup or edit.

### 1.3 Legacy Migration & Empty `Environment` Folder Policy

| Question | 🏆 Recommended Default | Rationale |
| :--- | :--- | :--- |
| Empty `Environment` folder after last item removal | **Preserve empty folder** unless explicitly deleted | Prevents surprise folder disappearance when toggling or swapping sky/sun presets |
| Legacy `.VolumetricSpace`, `.PhotometrySpace`, `.ComponentSpace` | **Dual-decode + explicit versioned migration** | Prevents silent misinterpretation (e.g., `ControlVehicle.ComponentSpace` rig ≠ `.Component` attachment) |
| Unsupported Construct / Context items vs. HTML (`ProjectZeroEditor`) | **Keep visible, disable (`grey`) with `ControlTooltip` diagnostic** | Preserves 1:1 HTML visual parity without fake stubs (`CLAUDE.md` §2.1) |

---

## 2. Verified Current-Code Audit (Hardcoded Showcase & Format Gaps)

Inspection of the active repository confirms the following exact baseline gaps:

| Inspected Unit | Verified Current Behavior | Defect / Gap Against Target Plan |
| :--- | :--- | :--- |
| `Engine/Lifecycle/EditorLifecycle.cpp` (`PopulateWorldSceneSession`, L333–385) | Branches on `ApocalypticCitySessionActive` / `BlankPlaneSkySessionActive` / default `BuildVehicleClearSkyDefaultScene`; then overwrites `Atmosphere` from `Viewport.QueryDisplaySettings()`, binding `Atmo.Solar.SolarEnabled = DisplayCfg.CelestialStarsEnabled` and forcing `Atmo.Moons[0].Visible = false`. | Hardcoded session switching; viewport display toggles overwrite authored world atmosphere/solar/lunar settings. |
| `Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp` (L598–1319) | `BuildVehicleClearSkyDefaultScene` invokes `DefaultContentGenerator::EnsureDefaultContentAvailable`, tries `LoadWorldSceneFromSpaceFile("Content/Worlds/VehicleClearSkyDefault.WorldSpace")`, and **silently falls back** to hardcoded C++ scene construction on failure; `BuildBlankPlaneSkyScene` & `BuildApocalypticCityRacingScene` bypass `.WorldSpace` entirely; `RegisterShowcaseGalleryInOutliner` hardcodes fixed rows (`Showcase`, `Cameras`, `World`, `Lighting`). | Startup can silently invent hardcoded showcase content instead of surfacing an authoritative `.WorldSpace` load error; outliner folders/IDs are not round-tripped dynamically from `.WorldSpace`. |
| `Engine/Codecs/SpaceContainerCodec.{h,cpp}` | Implements Two-Tier Hybrid TOML + `# === FRONTIER_BINARY_BOUNDARY ===` + `64B` alignment + `64`-bit FNV-1a checksums + Option 2A (`27` registered extensions) + `NormalizeManifestKeysRecursive` (rejecting `.UVChart`/`.Surface`). | Missing registry entries for the **41 approved extensions** and missing SHA-256 DAG identity / derived artifact container schema. |
| `Engine/Codecs/WorldSpaceCodec.{h,cpp}` | Encodes `.WorldHierarchy`, `.EditorCamera`, `.WorldPlacement`, `AreaLuminaires`, `MeasuredLuminaires`, and `32 B` `PackedWorldPlacementBinaryRow` (`64B`-aligned). | Lacks nested folder entries (`EnclosingIndex`, `FirstNestedIndex`, `NextPeerIndex`, `DepthLevel`), component attachments (`.Component`), trigger/sound/sequence references, and environment entity creation/deletion bindings. |
| `Engine/Configuration/EngineConfiguration.{h,cpp}` | Defines `HostLaunchMode` & `WorkspaceCategory` in memory / CLI args. | No persistent `.EngineConfig`, `.GraphicsSettings`, `.UserProfile`, or `.EditorLayout` codecs separating boot config, player presets, user profile, and editor-only docking layout. |
| `Experimental/ProjectZeroEditor` reference (`ExperimentalEditorUiPortPlan.md`) | Pinned upstream at `eosclient0001-rgb/Frontier` (`2fd4c6247b8697d18337669276da9ce88f6d6e00`); **not yet staged locally** under `Experimental/` in this checkout. | Phase 0 must inspect and capture the pinned HTML `Construct` and outliner right-click menus before coding native UI parity. |

---

## 3. Preserved Old-Plan Rules (Two-Tier TTF Container, Revision Caps & Naming Boundary)

All foundational rules from `DocumentFormatsInstancePlan.md`, `DocumentSpacesRevisionPlan.md`, `DataDrivenSpaceContentFormattingPlan.md`, `SKILL-Naming.md`, `BannedWordsVocabulary.md`, and `CodingStandards.md` remain **mandatory**:

### 3.1 Two-Tier Hybrid "TTF / SFNT-Style" Container Wire Format

```text
+======================================================================================================+
| TIER 1 — HUMAN-READABLE UTF-8 PASCALCASE TOML MANIFEST (Top of File, decoded via toml++)             |
|   ['.DocumentHeader']      -> ContainerExtension, DomainSubFormat, SchemaVersion, BinaryAlignment=64 |
|   ['.ArtifactProvenance']  -> ArtifactDigestSha256, SourceRevisionToken, CompilerVersion *(DAG)*     |
|   ['.<DomainSection>']     -> Typed TOML metadata, asset paths, non-kinship index links              |
|   [['.SectionDirectory']]  -> TTF/SFNT-style directory: SectionIdentifier, SubFormatTag,             |
|                               RelativeAlignedOffset, ByteLength, ChecksumFnv1a64                     |
+======================================================================================================+
| # === FRONTIER_BINARY_BOUNDARY ===  +  0..63 zero-padding bytes to 64-byte boundary                  |
+======================================================================================================+
| TIER 2 — PACKED 64-BYTE-ALIGNED BINARY SECTIONS (Random-access CPU / GPU readback)                   |
|   • Section 0..N : 64B-aligned numeric streams, candela grids, LUTs, cluster pyramids, PCM, SPIR-V   |
|   • Optional .Revision : Parametric operation stream (<= 215 MiB per document / 750 MiB global)      |
+======================================================================================================+
```

- 🔴 **SFNT/TTF Framing Rule:** "TTF formatting" denotes the **64-byte-aligned offset/length/checksum section directory** inspired by SFNT/TTF tables — never masquerading non-font payloads as valid OpenType files. Only **`.FontSpace`** stores typography metrics and licensed font payloads (imported from `.ttf`/`.otf` via `Interchange`).
- 🔴 **Codec vs. Interchange vs. Exchange:**
  - `Engine/Codecs/` (`*Codec` = `*Encoder` + `*Decoder`): Lossless native Two-Tier container I/O (`toml++` + `64B` binary).
  - `Engine/Interchange/` (`*Interchange`): External formats (`.obj`, `.gltf`, `.step`, `.exr`, `.png`, `.ktx2`, `.ies`, `.ttf`/`.otf`, `.wav`/`.ogg`/`.flac`, `.svg`, `SPIR-V`) and `VulkanInterchange`.
  - `*Exchange`: Live bi-directional memory sync (`InputExchange`, `WorkspaceExchange`).

### 3.2 Parametric Revision (`215 MiB` / `750 MiB`) vs. Persistent Artifact DAG

| Aspect | Parametric Revision History (`.Revision`) | Persistent Dependency DAG (`.DerivedArtifact`) |
| :--- | :--- | :--- |
| **Owner** | `Engine/Workspaces/Revision/` (`ContentRegion`, `OperationRecorder`, `RevisionExtension`) | `Engine/Codecs/` + `Engine/Tools/` (`ArtifactDigestRegister`, `DerivedArtifactRepository`) |
| **Memory / Disk Cap** | **`215 MiB` per document** · **`750 MiB` global** (`EngineConstants.h`) | Configurable LRU disk budget under `Saved/DerivedArtifacts/` (independent of undo cap) |
| **Compaction Rule** | **Redo Purge → Prefix Fold** into parametric baseline | Content-addressed SHA-256 eviction of unreferenced stale digests |
| **Non-Kinship Links** | `EnclosingIndex`, `FirstNestedIndex`, `NextPeerIndex`, `DepthLevel` | Directed dependency edges `(DerivedDigest -> UpstreamInputDigests)` |

### 3.3 On-Disk Extension Names vs. Banned-Word-Compliant C++20 Identifiers

⚠️ **Strict Naming Boundary (`BannedWordsVocabulary.md` & `SKILL-Naming.md`):**
The user's **41 approved extensions** are the canonical **on-disk file suffixes** (taking precedence over overlapping old names). Inside C++20 headers, `.cpp` files, folders, and `.slang` shaders, banned words (`Node`, `Graph`, `Table`, `Emitter`, `Cache`, `Pipeline`, `Stage`, `Pass`, `Pool`, `Store`, `Object`, `Entity`, `Menu`, `Card`, `Badge`, `Pill`, `Context`, `Element`, `Item`, `Value`, `State`, `Flag`, `Parent`/`Child`/`Sibling`, `And`) remain **strictly forbidden**. Every row below provides the **banned-word-compliant C++20 owner and codec name**.

---

## 4. Master Engine-to-Component Mapping Registry

### 4.1 Tier A — User-Approved Format Registry (First Preference, 41 Formats)

*Status Legend: `🟢` Implemented · `🚧` Partial / Legacy Equivalent Exists · `🔴` Planned (`New`) · `⚠️` Ground-Up Redo Gated (`CLAUDE.md` §1.2 — zero simplified stubs).*

#### A. World, UI, Typography, Atlases & Audio (`1–5`)

| # | On-Disk Suffix *(Load CI / Write PascalCase)* | Compliant C++20 `Engine/` Owner & Codec | Tier-1 TOML & Tier-2 `64B` Binary Payload | Status | Profile Scope |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 1 | **`.worldspace`** *(→ `.WorldSpace`)* | `Engine/Codecs/WorldSpaceCodec` · `Engine/Lifecycle/EditorLifecycle` · `RuntimeLifecycle` | TOML: `.WorldHierarchy` (non-kinship indices), `.EditorCamera`, `.WorldPlacement`, environment links · Bin: `32B` transforms, `.Revision` | 🚧 | All (`Runtime` + `Editor`) |
| 2 | **`.interface`** *(→ `.Interface`)* | `Engine/Components/` (`PixelSpace`, `Docking/`, `Controls/`) · Planned `Codecs/InterfaceCodec` | TOML: screen anchors, layout containers, z-order slots, control bindings · Bin: packed layout metrics, `.Revision` | 🔴 | All (`Runtime` HUD/UI) |
| 3 | **`.Fontspace`** *(→ `.FontSpace`)* | `Engine/Codecs/FontCodec` · `Engine/Components/Appearance/TypographyRepository` | TOML: `TypefaceTitle`, `UnitsPerEm`, `AscenderEm`, `DescenderEm`, metrics · Bin: `.CharacterSet` contours, kerning pairs, licensed font payload | 🟢 | All |
| 4 | **`.pixelatlas`** *(→ `.PixelAtlas`)* | `Engine/Components/ContentBrowser/ThumbnailSheetRepository` · `Engine/Codecs/TextureCodec` · Planned `PixelAtlasCodec` | TOML: variant (`SpriteSheet` / `IconAtlas` / `VirtualPageTable`), rect bounds, gutter px, colour space · Bin: `64B` mip/page tiles | 🚧 | Separate `Editor` vs `Shipping` atlases |
| 5 | **`.soundscape`** *(→ `.Soundscape`)* | `Engine/AudioSpace/` (`AudioExtension`, `AudioBusAccumulator`, `SpatialAcoustics`) · `Codecs/AcousticCodec` → `SoundscapeCodec` | TOML: ambient beds, stem routing, spatial bus snapshots, source refs + licences · Bin: decoded float32 PCM / spatial impulse responses | 🚧 | All |

#### B. Simulation, Particles, Fields, Fluids & Destruction (`6–15`)

| # | On-Disk Suffix | Compliant C++20 `Engine/` Owner & Codec | Tier-1 TOML & Tier-2 `64B` Binary Payload | Status | Profile Scope |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 6 | **`.distancefield`** *(→ `.DistanceField`)* | `Engine/DistanceFieldSpace/` (`LocalSignedDistanceVolume`) · `GeometricRaster/Baking/GpuSdfBaker` · Planned `DistanceFieldCodec` | TOML: signed/unsigned convention, voxel transform, extent, truncation `[m]` · Bin: `64B` scalar 3D grid / clipmap bricks | ⚠️ | All (`BKL-012` redo gated) |
| 7 | **`.particlesystem`** *(→ `.ParticleSystem`)* | Planned `Engine/ParticleSpace/` (`ParticleSequence`, `ParticleSystemCodec`) | TOML: master timeline, spawn source refs, LOD thresholds, spatial bounds · Bin: compiled spawn schedule | ⚠️ | All (`BKL-013` redo gated) |
| 8 | **`.emitternode`** *(→ `.EmitterNode`)* | Planned `Engine/ParticleSpace/` (`ParticleSpawnSource`, `ParticleSpawnCodec`) | TOML: spawn rates, burst curves, lifetime gradients, compute update rules · Bin: baked burst LUTs | ⚠️ | All (`BKL-013` redo gated) |
| 9 | **`.vectorfield`** *(→ `.VectorField`)* | Planned `Engine/SimulationSpace/FieldSpace/` (`VectorFieldModel`, `VectorFieldCodec`) | TOML: dimensions, physical units `[m/s]`, transform, curl/vortex generator recipe, seed, wrap mode · Bin: `64B` 3D float4 velocity grid | ⚠️ | All (`BKL-013` redo gated) |
| 10 | **`.ribbontrail`** *(→ `.RibbonTrail`)* | Planned `Engine/ParticleSpace/` (`RibbonTrailSequence`, `RibbonTrailCodec`) | TOML: strip width/UV curves, tessellation tolerance, `.MaterialSpace` binding · Bin: precomputed strip spline segments | ⚠️ | All (`BKL-013` redo gated) |
| 11 | **`.swarmbehavior`** *(→ `.SwarmBehavior`)* | Planned `Engine/SimulationSpace/` (`SwarmSimulationSequence`, `SwarmBehaviorCodec`) | TOML: separation/alignment/cohesion weights, spatial hash cell extent, max instances · Bin: GPU instance seed buffer | ⚠️ | All (`BKL-013` redo gated) |
| 12 | **`.fluidgrid`** *(→ `.FluidGrid`)* | Planned `Engine/SimulationSpace/FluidSpace/` (`EulerianFluidSolver`, `FluidGridCodec`) | TOML: 2D/3D domain resolution, voxel size, viscosity, solver steps, boundary modes · Bin: optional initial velocity/pressure/vorticity/divergence | ⚠️ | All (`BKL-013` redo gated) |
| 13 | **`.fracturetree`** *(→ `.FractureTree`)* | `Engine/GeometrySpace/Fracture/` (`ConvexPartitioning`, `EngineeringBakedFracture`, `FastRuntimeFracture`) · Planned `FractureTreeCodec` | TOML: Voronoi cell links (`EnclosingIndex`, `FirstNestedIndex`), stress thresholds `[Pa]`, material links · Bin: chunk adjacency/connectivity packed arrays | 🚧 | All |
| 14 | **`.constraintset`** *(→ `.ConstraintSet`)* | `Engine/SimulationSpace/PhysicsSpace/ConstraintSolver` · `ComponentInstanceCategories.h` · `ComponentSpaceCodec` → `ConstraintSetCodec` | TOML: `Fixed`/`Hinge`/`Slider`/`Ball`/`Spring`/`Spin`/`Tether`/`Dock`, axis, limits, break torque/force · Bin: packed constraint rows | 🚧 | All |
| 15 | **`.impactprofile`** *(→ `.ImpactProfile`)* | `Engine/SimulationSpace/PhysicsSpace/CollisionDetection` · `GeometrySpace/Fracture/FractureMaterialRepository` · Planned `ImpactProfileCodec` | TOML: material-pair matrix keys, impulse thresholds, soundscape/particle/decal/fracture triggers · Bin: compact pair lookup table | 🔴 | All |

#### C. Raytracing, Lighting, Atmosphere, Shaders, Compute & Post (`16–29`)

| # | On-Disk Suffix | Compliant C++20 `Engine/` Owner & Codec | Tier-1 TOML & Tier-2 `64B` Binary Payload | Status | Profile Scope |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 16 | **`.raystructure`** *(→ `.RayStructure`)* | `Engine/SpatialAcceleration/` (`WideBoundingTree`, `CompressedWideTree`, `ClusterPyramid`) · `GeometricRaster/Baking/BakingAccelerationStructure` · Planned `RayStructureCodec` | TOML: portable geometry ref, SAH build flags, AABB bounds, device/driver fingerprint · Bin: `128B` `BVH4` nodes or Vulkan BLAS/TLAS cache | 🚧 | All (device-keyed) |
| 17 | **`.iesprofile`** *(→ `.IesProfile`)* | `Engine/Codecs/PhotometricProfile` · `PhotometrySpaceCodec` · Planned `IesProfileCodec` + `IesInterchange` | TOML: IES provenance, luminous units `[cd]`/`[lm]`, tilt/symmetry, normalization · Bin: `64B` `128x32` float32 candela grid | 🚧 | All |
| 18 | **`.skyatmosphere`** *(→ `.SkyAtmosphere`)* | `Engine/GeometricRaster/Atmosphere/` (`AtmosphericSkySequence`, `CelestialEphemerisSolver`) · `VolumetricSpaceCodec` → `SkyAtmosphereCodec` | TOML: Rayleigh/Mie/Ozone cross-sections, scale heights, ground albedo, sun angular radius · Bin: derived `256x64` Transmittance, `32x32` MultiScatter, `192x108` SkyView LUTs | 🚧 | All |
| 19 | **`.shadergraph`** *(→ `.ShaderGraph`)* | `Engine/MaterialSpace/Dynamic/` (`DynamicMaterialCompiler`) · `Engine/Shaders/` (`.slang`) · Planned `ClosureNetworkCodec` | TOML: authored closure network ops, parameter pins, `.ColourSpace` tags · Bin: deterministic `.slang` IR / compiled SPIR-V digest refs | 🚧 | `Editor` (source) · `Shipping` (compiled) |
| 20 | **`.computekernel`** *(→ `.ComputeKernel`)* | `Engine/GeometricRaster/Compute/` (`ComputeDispatchEncoder`, `TimelineTransferRegister`) · `Engine/Shaders/Compute/` · Planned `ComputeProgramCodec` | TOML: `.slang` entry point, threadgroup `[X,Y,Z]`, push-constant layout (`static_assert` parity), target profile · Bin: compiled SPIR-V variants | 🚧 | All |
| 21 | **`.rendergraph`** *(→ `.RenderGraph`)* | `Engine/GeometricRaster/GlobalIllumination/TieredWorldRenderSequence` & `VulkanWorldRenderSequence` · `RenderSpaceCodec` → `RenderSequenceCodec` | TOML: acyclic execution sequence, transient VRAM aliasing lifetimes, async compute sync barriers, temporal feedback slots · Bin: baked barrier schedule | 🚧 | All |
| 22 | **`.poststack`** *(→ `.PostStack`)* | `Engine/Shaders/GlobalIllumination/DisplayToneTransform.slang` · `GeometricRaster/Atmosphere/LensFlareSequence` · `RenderSpaceCodec` → `PostStackCodec` | TOML: ordered tone-map, 3D colour-grading LUT refs, glare thresholds, optical distortion · Bin: `64B` 3D grading LUT texels | 🚧 | All |
| 23 | **`.noisegraph`** *(→ `.NoiseGraph`)* | `Engine/Shaders/MaterialSpace/ProceduralFieldGenerators.slang` · `GeometricRaster/Atmosphere/CloudNoiseVolume.h` · Planned `NoiseSynthesisCodec` | TOML: deterministic Simplex/Worley/Perlin/Ridged chain, octaves, lacunarity, uint64 seed · Bin: optional pre-baked 2D/3D tile | 🚧 | All |
| 24 | **`.convexhull`** *(→ `.ConvexHull`)* | `Engine/GeometrySpace/Fracture/ConvexPartitioning` · `SimulationSpace/PhysicsSpace/BroadphaseSolver` · Planned `ConvexHullCodec` | TOML: source `.GeometrySpace` ref, hull generation tolerance, vertex/plane count, mass center · Bin: packed vertices, face planes, inertia bounds | 🚧 | All |
| 25 | **`.shardcluster`** *(→ `.ShardCluster`)* | `Engine/GeometrySpace/Fracture/` (`FracturePartitionTypes.h`) · `SimulationSpace/PhysicsSpace/FractureSimulationRunner` · Planned `ShardClusterCodec` | TOML: shard refs, density `[kg/m^3]`, sleep linear/angular velocity thresholds · Bin: `64B` inertia tensors, COM offsets, local hulls | 🚧 | All |
| 26 | **`.irradiance`** *(→ `.Irradiance`)* | `Engine/GeometricRaster/GlobalIllumination/StokesContourIrradianceSequence` · Planned `IrradianceCodec` | TOML: directional lobe basis (`SH`/`Stokes`), texel/voxel bounds, colour space · Bin: `64B` HDR bounce lobes | ⚠️ | All (`BKL-012` redo gated) |
| 27 | **`.spectralcurve`** *(→ `.SpectralCurve`)* | `Engine/ColourSpace/SpectralDistribution` · `MaterialSpace/Scattering/ThinFilmInterference.h` · `Codecs/ColourCodec` → `SpectralCurveCodec` | TOML: wavelength range `[nm]`, step `[nm]`, sample units (transmission/IOR/emission) · Bin: `64B` float32 spectral pairs | 🚧 | All |
| 28 | **`.lensaperture`** *(→ `.LensAperture`)* | `Engine/Components/Camera/VisualEffects/` (`CameraOpticsEncoder`, `DepthOfField`, `ChromaticAberration`, `VignetteEffect`) · Planned `LensApertureCodec` | TOML: blade count, focal length `[mm]`, f-stop, chromatic fringe, vignette, sensor curve · Bin: `64B` bokeh PSF / exposure LUT | 🚧 | All |
| 29 | **`.radiancecache`** *(→ `.RadianceCache`)* | `Engine/GeometricRaster/GlobalIllumination/SurfelRadiosityLatticeSequence` · Planned `RadianceFieldCodec` | TOML: spatial lattice spacing, scene/lighting/hardware validity digest, update cadence · Bin: compatible GI surfel/clipmap checkpoint *(only when verified valid)* | ⚠️ | All (`BKL-012` redo gated) |

#### D. Component Attachment, Gameplay Logic, Config & Sequencing (`30–41`)

| # | On-Disk Suffix | Compliant C++20 `Engine/` Owner & Codec | Tier-1 TOML & Tier-2 `64B` Binary Payload | Status | Profile Scope |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 30 | **`.component`** *(→ `.Component`)* | `Engine/ComponentClass/` (`ComponentClassDefinition`, `ComponentInstanceStorage`, `ComponentWorldPlacement`) · Planned `ComponentAttachmentCodec` | TOML: modular behaviour/property blocks (`Health`, `RigidBody`, `SurfaceRender`, `AudioSource`) attached to world placement slots *(distinct from `.ComponentSpace` vehicle rigs)* · Bin: packed POD defaults | 🚧 | All |
| 31 | **`.triggerzone`** *(→ `.TriggerZone`)* | `Engine/ComponentClass/ComponentInstanceCategories.h` (`OverlapAll` / `CollisionVolume`) · `SimulationSpace/PhysicsSpace/CollisionDetection` · Planned `TriggerZoneCodec` | TOML: Box/Sphere/Capsule half-extents, layer filter mask, `Enter`/`Stay`/`Exit` signal IDs · Bin: optional convex hull | 🚧 | All |
| 32 | **`.eventbus`** *(→ `.EventBus`)* | `Engine/NetworkingSpace/RemoteDirectiveRouter` · `Workspaces/WorkspaceExchange` · Planned `SignalBusCodec` | TOML: typed signal channel definitions (`PlayerDefeated`, `WaveCleared`), payload field schemas, routing rules *(non-DAG runtime routing)* | 🔴 | All |
| 33 | **`.variabletable`** *(→ `.VariableTable`)* | Planned `Engine/Configuration/VariableRegisterCodec` & `Engine/Lifecycle/RuntimeVariableRegister` | TOML: typed flags, score counters, difficulty multipliers, debug overrides (`Editor`/`Development` gated) | 🔴 | All (`Debug` stripped in `Shipping`) |
| 34 | **`.timerprofile`** *(→ `.TimerProfile`)* | `Engine/Constants/TimeConstants.h` · Planned `Engine/Lifecycle/TimerPresetRegister` & `TimerProfileCodec` | TOML: countdown duration `[s]`, cooldown `[s]`, time-dilation factor `[0..1]`, `.Curve` ref | 🔴 | All |
| 35 | **`.curve`** *(→ `.Curve`)* | `ComponentClass/ComponentInstanceCategories.h` (`CurveInterpolationForm`) · `Components/Controls/ScalarCurveEditor` · Planned `Engine/Mathematics/PolynomialCurves` & `CurveCodec` | TOML: 1D/2D domain units, interpolation (`Linear`, `SmoothSpline`, `EaseInOut`, `StepHold`), extrapolation · Bin: `64B` float64 keyframes & tangents | 🚧 | All |
| 36 | **`.engineconfig`** *(→ `.EngineConfig`)* | `Engine/Configuration/EngineConfiguration` · `BuildConfiguration.h` · Planned `EngineConfigCodec` | TOML: physics tick rate (`120 Hz`), memory ceilings (`215/750 MiB`), default Vulkan 1.3 API, startup `.WorldSpace` path | 🚧 | All |
| 37 | **`.graphicssettings`** *(→ `.GraphicsSettings`)* | `Engine/Configuration/` + `GeometricRaster/GlobalIllumination/TieredWorldRenderSequence` · Planned `GraphicsSettingsCodec` | TOML: resolution, V-Sync, FPS ceiling, texture/shadow/GI quality tiers, hardware fallback bounds | 🔴 | All (user-local override) |
| 38 | **`.userprofile`** *(→ `.UserProfile`)* | Planned `Engine/Configuration/UserProfileRepository` & `UserProfileCodec` | TOML: player preferences, accessibility toggles, achievement tokens, playtime `[s]` · Atomic write + `.bak` recovery; **never committed or shared in DAG** | 🔴 | User-local OS path |
| 39 | **`.editorlayout`** *(→ `.EditorLayout`)* | `Engine/Configuration/WorkspaceConfiguration` · `Components/Docking/WorkspaceDockContainer` · Planned `EditorLayoutCodec` | TOML: dock splits, active workspace tabs, grid snap `[m]`, gizmo scale, viewport display toggles | 🚧 | **`Editor` ONLY** *(excluded in `Shipping`)* |
| 40 | **`.timeline`** *(→ `.Timeline`)* | `Engine/Components/Controls/SimulationTimelineFooter` & `SimulationTimeRuler` · Planned `SequenceTimelineCodec` | TOML: multi-track animation, camera cuts, `.Soundscape` cues, subtitle tracks, `.Curve` refs · Bin: packed keyframe blocks | 🚧 | All |
| 41 | **`.tooltip`** *(→ `.Tooltip`)* | `Engine/Components/Controls/ControlTooltip` · `ControlAppearance.h` · Planned `TooltipCodec` | TOML: headline, body, metric tags, comparison fields, `.Interface` / `.Curve` styling refs | 🚧 | `Editor` & `Runtime` separated |

---

### 4.2 Tier B — Unreplaced Old-Plan `.Space` Extensions (Retained & Harmonized)

Where no exact replacement exists in Tier A, retain the confirmed old-plan formats (`DocumentFormatsInstancePlan.md` & `DataDrivenSpaceContentFormattingPlan.md`) in `SpaceContainerCodec`:

| Retained Old-Plan Suffix | C++20 Codec (`Engine/Codecs/`) | Role & Boundary vs. Tier A |
| :--- | :--- | :--- |
| **`.ProjectSpace`** | `ProjectCodec` | Root project manifest (`ContentRepositoryIndex.ProjectSpace`), startup world/config pointer, dependency lock index |
| **`.GeometrySpace`** | `GeometryCodec` | Half-edge `PolygonNetwork`, creased normals, `ClusterPyramid`, UVs; **feeds** derived `.ConvexHull`, `.RayStructure`, `.DistanceField` |
| **`.MaterialSpace`** | `MaterialCodec` | 10-lobe OpenPBR 1.1 `SurfaceMaterial` & `CompactMaterialRegister`; references `.ShaderGraph` / `.TextureSpace` / `.SpectralCurve` |
| **`.TextureSpace`** | `TextureCodec` | Multi-UDIM channel-packed mip chains; distinct from `.PixelAtlas` sprite/virtual page tables |
| **`.ImageSpace`** | `ImageCodec` | Layered SDR/HDR linear-light radiometric canvas (`LensFlareBakedSheet`, `LunarSurfaceSheet`) |
| **`.VectorSpace`** | `VectorCodec` | Exact 2D Bézier contours, boolean winding, variable strokes (`Pattern`/`Stamp`) |
| **`.SurfaceParameterSpace`** / **`.UVSpace`** | `UVCodec` | `UDIM` + `.UVTile` islands, seams, pins, texel density |
| **`.ColourSpace`** | `ColourCodec` | Tristimulus primaries (`ACEScg`, `Rec.2020`, `Oklab`), ramps, swatches |
| **`.SimulationSpace`** | `SimulationCodec` | Top-level solver session tying `.ConstraintSet`, `.ConvexHull`, `.FluidGrid`, `.ShardCluster` |
| **`.VolumetricSpace`** | `VolumetricSpaceCodec` | Cloud decks (`StaticFullResolutionCumulus`), condensate noise (`CondensateNoiseVolume`), local fog; **sky scattering migrates carefully to `.SkyAtmosphere`** |
| **`.PhotometrySpace`** | `PhotometrySpaceCodec` | Solar ephemeris (`ClearMorningSun`) & LTC area luminaires (`CeilingSoftboxLuminaire`); **measured IES lamps map to `.IesProfile`** |
| **`.RenderSpace`** | `RenderSpaceCodec` | Viewport render tier configuration (`MatCap` / `OpenPbrDirect`), shadow cascade spans; pairs with `.RenderGraph` & `.PostStack` |
| **`.ComponentSpace`** | `ComponentSpaceCodec` | Articulated rig assets (`ControlVehicle.ComponentSpace` + `ControlVehicleSurfaceDecoder`); **never aliased as `.Component`** |
| **`.NetworkSpace`** / **`.InputSpace`** | `NetworkCodec` / `InputCodec` | Replication policies (`FP1` framing) and hardware chord/axis bindings |
| **`.Terrain`** · **`.Sketch`** · **`.Assembly`** · **`.Pigment`** · **`.Motion`** · **`.InstanceSpace`** | Domain codecs (`SpaceContainerCodec` registered) | Preserved Option 1A / Option 1B containers for CAD (`Sketcher`), natural paint, heightfields, and unified `.InstanceSpace` interchange |

---

## 5. Persistent Dependency DAG Architecture (Zero-Recomputation Save-to-Disk)

### 5.1 End-to-End Build & Hydration Flow

```text
  AUTHORING SOURCES (TOML + 64B Tier-2)                 PERSISTENT DEPENDENCY DAG                   RUNTIME HYDRATION
  =====================================                 =========================                   =================
  [.WorldSpace] ──┐
  [.EngineConfig] ├──> [CanonicalInputSerializer] ──> [SHA-256 Digest + CycleCheck]
  [.GeometrySpace]┤      (Manifest + Params +             │
  [.ShaderGraph] ─┤       Upstream Digests +              ├──(HIT: Checksum & Compatibility OK)──> [Load 64B DerivedArtifact]
  [.SkyAtmosphere]┤       Tool/Driver Version)            │                                          │
  [.IesProfile] ──┤                                       └──(MISS / Stale / Corrupt)────────────> [Execute Leaf Builder on
  [.NoiseGraph] ──┘                                            │                                    WorkspaceThread / ExecutionChannels]
                                                               v                                     │
                                                  [Atomic Write .tmp -> fsync -> Rename]             v
                                                  Saved/DerivedArtifacts/<ab>/<sha256>.DerivedArtifact ──> [Vulkan / Jolt / Audio]
```

### 5.2 Deterministic Content-Addressed Identity & Invalidation Contract

1. **Canonical Input Digest (`SHA-256`, Separate from `64`-bit FNV-1a Corruption Check):**
   - `ArtifactIdentityKey = SHA256(FormatTag || SchemaVersion || CanonicalTomlBytes || OrderedUpstreamDigests || CompilerOrSolverVersion || TargetPlatformArch || OptionalGpuDriverFingerprint)`.
   - **Never** rely on file modification timestamps (`mtime`) or filename alone for cache validity.
   - Keep `64`-bit FNV-1a (`ChecksumFnv1a64`) in `[['.SectionDirectory']]` for fast corruption detection on every section read.
2. **Acyclic Validation & Cycle Reporting:**
   - Before scheduling any build edge, `ArtifactDependencyRegister` runs topological cycle detection across `(AssetToken, SubresourceTag)` edges; any cycle aborts with the exact cycle chain printed to `ThoughtLog` / UI notification.
   - Scene parentage (`EnclosingIndex`), runtime `.EventBus` traffic, and temporal frame feedback are **explicitly excluded** from the build DAG.
3. **Minimal Transitive Invalidation Matrix:**

| Authoring Change | Recomputed Derived Artifact(s) | Unchanged Work Preserved on Disk |
| :--- | :--- | :--- |
| Edit **`.SkyAtmosphere`** scattering/ozone | `256x64` Transmittance + `32x32` MultiScatter + `192x108` SkyView LUTs | Geometry `BVH4`, `ShaderGraph` SPIR-V, `PixelAtlas`, `Soundscape` |
| Edit **`.ShaderGraph`** node | Affected `.ComputeKernel` / material SPIR-V variant | Unmodified materials, geometry, audio, atmosphere LUTs |
| Edit **`.GeometrySpace`** vertices | `.ConvexHull`, `.RayStructure` (`BVH4`/BLAS), `.DistanceField`, `.ShardCluster` for that asset only | Other world placements, lighting LUTs, `.PostStack` |
| Edit **`.IesProfile`** lamp file | `128x32` float32 candela grid for that luminaire | Geometry, world hierarchy, atmosphere |
| Edit **`.PixelAtlas`** source icon | Single affected atlas sheet + mip chain | Unrelated atlases, shaders, physics |
| Edit **`.Soundscape`** stem/gain | Decoded/resampled PCM cache for that stem | All visual, physics, and shader artifacts |
| Edit **`.PostStack`** LUT / curve | 3D grading LUT texels (`64B`-aligned) | Scene geometry, BVH4, sky LUTs, audio |
| Edit **`.GraphicsSettings`** / **`.EditorLayout`** | Runtime render-target sizing / dock split **only** | **Zero** asset DAG invalidation or world rewrite |

4. **Atomic Persistence & Hardware Safety:**
   - Every save and derived-artifact write creates `<Target>.tmp.<pid>` on the same filesystem, flushes, verifies FNV-1a + byte bounds, and atomically replaces the target; corrupted cache entries are quarantined/deleted and cleanly rebuilt without failing startup.
   - Hardware-specific `.RayStructure` (BLAS/TLAS) and compiled SPIR-V include `VulkanDriverUuid` + `PipelineCacheVersion` in their SHA-256 key so driver upgrades never load stale binaries.

---

## 6. First Vertical Slice: Data-Driven World Startup & Environment Construct / Delete

### 6.1 Removing Hardcoded Showcase Fallbacks

1. **`EngineConfig` → `ProjectSpace` → `.WorldSpace` Boot Chain:**
   - `EditorLifecycle` resolves the startup world path from `.EngineConfig` / CLI `--world=<path>` / `.ProjectSpace`, never from `BlankPlaneSkySessionActive` / `ApocalypticCitySessionActive` hardcoded branches.
   - Missing or corrupt `.WorldSpace` files present an actionable `ConfirmationDialogue` / diagnostic error (`ThoughtLog`) rather than silently building hardcoded geometry.
   - `DefaultContentGenerator` runs solely as an explicit CLI/setup tool (`FrontierDefaultContentGenerator`) or explicit "Construct Default Project" action.
2. **Decouple `.EditorLayout` Viewport Toggles from Authored World Data:**
   - Remove the `EditorLifecycle.cpp` L369–380 override block (`Atmo.Solar.SolarEnabled = DisplayCfg.CelestialStarsEnabled`, `Atmo.Moons[0].Visible = false`). Authored `.WorldSpace` + `.SkyAtmosphere` + `.PhotometrySpace` values stay authoritative; debug view overrides live ephemerally in `.EditorLayout`.

### 6.2 Reference Gate & Environment Construct / Remove Transactions

- **Step 0 HTML Parity Gate (`CLAUDE.md` §2.1):** Stage/render pinned `Experimental/ProjectZeroEditor` (`2fd4c6247b8697d18337669276da9ce88f6d6e00`), capture `.png` screenshots of the `Construct` drawer and outliner right-click context directive sheet (idle, hover, disabled, selected, scroll, dismissal), and store reference captures before writing native UI.
- **Five Initial Environment Entities (`Sun`, `Clouds`, `Moon`, `Stars`, `Atmosphere`):**
  - Constructed via typed, undoable `OperationRecorder` transactions in `OutlinerPanel` / `WorldSpace` model.
  - Lazily allocate one `Environment` folder (`EnclosingIndex`) on first environment construct; reuse the same folder ID on subsequent additions and across save/reopen.
  - Right-click remove unregisters renderer bindings, synchronizes Vulkan timeline lifetimes (`TimelineTransferRegister` / `VulkanInterchange`), preserves shared `.SkyAtmosphere` / `.VolumetricSpace` / `.PhotometrySpace` files on disk, and supports exact `Undo`/`Redo` restoration.
  - Unsupported HTML actions remain visible and greyed-out with `ControlTooltip` reasons.

---

## 7. Phased Execution, Validation & Visual Evidence Gates

| Phase | Scope & Deliverables | Mandatory Verification & `Exhibits/` Proof Gate |
| :---: | :--- | :--- |
| **Phase 0** | Stage & capture pinned `ProjectZeroEditor` HTML `Construct` & outliner right-click states; complete full legacy codec/consumer audit. | Browser `.png` screenshots inspected via `read_file`; complete control-to-C++ equivalence table. |
| **Phase 1** | Extend `SpaceContainerCodec` (`41` approved names + Option 2A + `ArtifactProvenance`), upgrade `WorldSpaceCodec` with non-kinship folders & component links, remove hardcoded showcase fallback in `EditorLifecycle`/`ShowcaseGalleryScene`. | Codec fuzz/bounds/truncation/FNV-1a/case-insensitive tests; round-trip `.WorldSpace` save/reopen equality; actionable error test on corrupt world. |
| **Phase 2** | Native `OutlinerPanel` Construct & right-click directive parity for `Sun`, `Clouds`, `Moon`, `Stars`, `Atmosphere` under default `Environment` folder with `OperationRecorder` undo/redo & GPU teardown sync. | Create/delete/undo/redo/save/reopen CTest + side-by-side HTML vs. C++ offscreen `.png` captures in `Exhibits/Images/`. |
| **Phase 3** | Implement `ArtifactDependencyRegister` & `DerivedArtifactRepository` (`Saved/DerivedArtifacts/`) with end-to-end vertical slice (`.SkyAtmosphere` 3-LUT + `.IesProfile` candela cache). | Measured cold-miss vs. warm-hit startup timings, cycle detection test, single-parameter invalidation test, crash-safe atomic write test. |
| **Phase 4** | Roll out remaining domain codecs (`.EngineConfig`, `.GraphicsSettings`, `.UserProfile`, `.EditorLayout`, `.Soundscape`, `.PixelAtlas`, `.RayStructure`, `.PostStack`, `.Curve`, `.ShaderGraph`, `.ComputeKernel`, `.RenderGraph`, `.NoiseGraph`, `.ConvexHull`, `.FractureTree`, `.ShardCluster`, `.ConstraintSet`, `.ImpactProfile`, `.Component`, `.TriggerZone`, `.EventBus`, `.VariableTable`, `.TimerProfile`, `.Timeline`, `.Tooltip`, `.Interface`, `.SpectralCurve`, `.LensAperture`). Redo-gated domains (`.DistanceField`, `.Irradiance`, `.RadianceCache`, `.ParticleSystem`, `.EmitterNode`, `.VectorField`, `.RibbonTrail`, `.SwarmBehavior`, `.FluidGrid`) remain gated behind `BKL-012`/`BKL-013`. | Per-domain round-trip + real consumer integration tests; zero simplified stubs; `Shipping` profile link audit verifying `Engine/Editor/` & `.EditorLayout` exclusion. |
