# Engine Component ↔ Approved Extension Mapping, TTF-Style Serialization & Persistent Artifact DAG Plan

> **Status: proposed.** This is a design document. It does not claim that any codec, serializer, cache, or world loader below has been implemented. It extends [WorldAuthoringAssetDagPlan.md](WorldAuthoringAssetDagPlan.md), [DataDrivenSpaceContentFormattingPlan.md](DataDrivenSpaceContentFormattingPlan.md), [DocumentFormatsInstancePlan.md](DocumentFormatsInstancePlan.md), and [DocumentSpacesRevisionPlan.md](DocumentSpacesRevisionPlan.md), and it supersedes their naming proposals only where the explicitly approved extensions below require it.
>
> Inspected revision: `arena/5922d41b-frontier` @ `1828eae92c8c2e8c47e4decbac3aa53a0cd2f370` (`unassignedinbox/Frontier`). File references use that tree. Old-plan rules remain in force unless this document explicitly replaces them.

---

## TL;DR

Every engine subsystem is mapped to one approved extension and one native owner. Every authored document uses the retained two-tier hybrid container (UTF-8 TOML manifest + TTF/SFNT-style 64-byte-aligned section directory with FNV-1a checksums). A persistent content-addressed artifact DAG records what was baked from what, so an unchanged node is memory-mapped from disk instead of rebuilt. Startup loads the `.worldspace` named by `.engineconfig`; the silent hand-built showcase fallback in `EditorLifecycle.cpp` / `ShowcaseGalleryScene.cpp` is removed.

---

## 1. Decisions

| Topic | Design |
| --- | --- |
| Authority | An authored document on disk is authoritative. Runtime memory is a cooked view of it. No hardcoded scene, material, lighting, or default geometry may be manufactured when a file is missing. |
| Names | The user's approved extension list below takes precedence. Older domain formats that are not replaced stay loadable. Internal C++ identifiers still obey `SKILL-Naming.md`; the extension strings themselves are approved public identifiers and are exempt from the prose blacklist. |
| Container | Retain the existing `Codecs/SpaceContainerCodec` framing: PascalCase TOML manifest, explicit ASCII boundary, 64-byte-aligned SFNT/TTF-style section directory, per-section 64-bit FNV-1a checksums, explicit schema version. |
| Persistence | Add `Engine/Serialization/`: extension register, artifact identity/hashing, dependency ordering, derived-artifact ledger, and atomic persistence. Cache root defaults to `Build/Cache/` and is Git-ignored. |
| Recomputation | Content digest = xxHash64 over canonical inputs plus sorted upstream digests plus tool/schema/platform/device keys. Hash match ⇒ load cached binary. Mismatch ⇒ rebuild only the dirty subtree in topological order. |
| World startup | `.engineconfig.StartupWorld` names a `.worldspace`. Missing/corrupt world is a visible error. `FrontierDefaultContentGenerator` may author the default files once, to disk, before load. |
| Scope | Editor chrome stays editor-only. Runtime world assets, codecs, and production systems must work without editor UI. Shipping excludes editor resources. |

---

## 2. Approved extension registry

Canonical read is case-insensitive; canonical write is PascalCase (old rule, Option 2A). Each entry is a planned domain contract, not evidence of an existing codec. `Legacy relation` states whether the new contract replaces, narrows, or coexists with an existing `.Space` format.

| Approved suffix | Canonical write | Domain | Native owner (inspected path) | Wire format | Cached / baked artifact | Legacy relation |
| --- | --- | --- | --- | --- | --- | --- |
| `.worldspace` | `.WorldSpace` | World root, stable IDs, placements, components, links | `Engine/Lifecycle`, `Engine/Codecs/WorldSpaceCodec`, outliner | TOML + binary | Scene resource bundle, cluster instances | Replaces ad-hoc world models; existing `.WorldSpace` codec is the base |
| `.gameobject` | `.GameObject` | Placed world instance record (transform, links, component slots) | `Engine/Lifecycle`, world model | TOML | Instanced transform/record set | New; distinct from `.ComponentSpace` rigs |
| `.component` | `.Component` | Reusable behavior/data blocks attached to a game object | `Engine/ComponentClass`, `Engine/Components` | TOML | Component definition register | Narrows `.ComponentSpace`; rig assets stay `.ComponentSpace` until audited |
| `.triggerzone` | `.TriggerZone` | Non-blocking sensor volumes, OnEnter/OnStay/OnExit bindings | `Engine/SimulationSpace`, gameplay | TOML | Sensor volume set | New |
| `.eventbus` | `.EventBus` | Named signal schemas and routing definitions | `Engine/Input`, gameplay | TOML | Signal definition set | Narrows `.InputSpace`/signal routing |
| `.variabletable` | `.VariableTable` | Typed game flags, counters, difficulty multipliers, debug toggles | Gameplay/configuration | TOML | Variable set snapshot | New |
| `.timerprofile` | `.TimerProfile` | Countdowns, ability cooldowns, time-dilation presets | Timing/gameplay | TOML | Timer profile | New |
| `.curve` | `.Curve` | 1D/2D easing graphs (Linear, Ease-In-Out, Bounce) | `Engine/Components/Motion` | TOML (+ optional binary keys) | Sampled curve LUT | Narrows `.Motion` easing curves |
| `.timeline` | `.Timeline` | Multitrack keyframe sequencer (animation, camera cuts, audio cues, subtitles) | `Engine/Components/Motion` | TOML + binary | Track evaluation cache | Narrows `.Motion` sequencing |
| `.engineconfig` | `.EngineConfig` | Boot settings, tick rate, memory limits, renderer API, startup world | `Engine/Configuration/EngineConfiguration` | TOML | Compiled startup descriptor | New; current settings are code-only |
| `.graphicssettings` | `.GraphicsSettings` | Player quality and display choices | Display/quality configuration | TOML | Resolved preset + capability fallback key | Separates player overrides from `.RenderSpace` authoring |
| `.userprofile` | `.UserProfile` | Local preferences, achievements, playtime, accessibility | Platform user storage | TOML | Local profile document | New; never in project/Git |
| `.soundscape` | `.Soundscape` | Ambient beds, music stems, spatial mixer snapshots | `Engine/AudioSpace`, `Engine/Codecs/AcousticCodec` | TOML + PCM/Opus | Decoded bus graph, converted stems | Coexists with `.Acoustic`; `.soundscape` is the approved authoring surface |
| `.interface` | `.Interface` | UI screens, menus, HUD anchors, containers, z-order | `Engine/Components` | TOML | Layout hierarchy runtime | New |
| `.fontspace` | `.FontSpace` | Font faces, metrics, variants, licensed payload | `Engine/Codecs/FontCodec`, `EngineContent/FontArchives` | TOML + SFNT-style binary | MSDF/SDF glyph chart pages, metrics | Existing `.FontSpace` is the base |
| `.pixelatlas` | `.PixelAtlas` | Packed sprite sheets, icon atlases, virtual texture page tables | `Engine/Components/VectorIcons`, texture/image codecs | TOML + BC7/RGBA | Packed chart, mip chain | New; not every `.TextureSpace` |
| `.tooltip` | `.Tooltip` | Hover cards (item descriptions, DPS comparisons, status) | Interface system | TOML | Localized card binding | New |
| `.editorlayout` | `.EditorLayout` | Editor panels, snap sizes, gizmo scales | `Engine/Workspaces` docking | TOML | Workspace panel arrangement | Editor-only |
| `.rendergraph` | `.RenderGraph` | Pass dependencies, transient VRAM aliasing, async compute sync | `Engine/GeometricRaster` scheduler / submission order | TOML → DAG | Compiled pass order + transient assignment | New; derived from runtime render sequence |
| `.shadergraph` | `.ShaderGraph` | Visual node shader authoring network | `Engine/Shaders/Compiler` | TOML → `.spv` | SPIR-V module + reflection | Authoring source; `.slang` remains the shader language |
| `.computekernel` | `.ComputeKernel` | Standalone GPU compute program definition | `Engine/Shaders/Compute`, dispatch | TOML → `.spv` | SPIR-V compute module + permutation index | New |
| `.poststack` | `.PostStack` | Tone-mapping, 3D grading LUT, bloom, lens distortion | `Engine/GeometricRaster` post-process units | TOML + 3D LUT | Effect order + LUT texture | Narrows `.RenderSpace` tone stack |
| `.iesprofile` | `.IesProfile` | Measured photometric distribution | Photometry import, `Engine/Codecs/PhotometricProfile` | TOML + LUT | Resampled intensity grid | Narrows `.PhotometrySpace` measured luminaires |
| `.skyatmosphere` | `.SkyAtmosphere` | Spectral scattering, ozone absorption, aerial fog LUTs | `Engine/GeometricRaster/Atmosphere` | TOML + LUT | Scattering/absorption LUTs | Narrows `.VolumetricSpace` skies/fog |
| `.irradiance` | `.Irradiance` | Precomputed diffuse bounce lighting, directional lobes | Global illumination baking | Binary + TOML | Light-field textures + lobes | New |
| `.radiancecache` | `.RadianceCache` | Real-time world-space probe configuration + compatible checkpoint | Global illumination | Binary + TOML | Probe checkpoint | New; dynamic per-frame results are not assumed portable |
| `.spectralcurve` | `.SpectralCurve` | Wavelength dispersion profiles | `Engine/ColourSpace/SpectralDistribution` | TOML | Dispersion sample set | Narrows `.ColourSpace` spectral data |
| `.lensaperture` | `.LensAperture` | Bokeh shape, chromatic fringes, vignette, exposure curves | Camera/post optics | TOML | Optical parameter set (+ derived LUT) | New |
| `.raystructure` | `.RayStructure` | Portable BLAS/TLAS recipe + optional device acceleration artifact | `Engine/SpatialAcceleration` | Binary + TOML recipe | Acceleration structure keyed by device/driver | New; runtime BVH becomes a derived artifact |
| `.distancefield` | `.DistanceField` | 3D scalar SDF grids, soft shadow/AO/raymarch | `Engine/DistanceFieldSpace` | Binary 3D grid + TOML header | SDF grid | New; existing local SDF volume becomes a derived artifact |
| `.particlesystem` | `.ParticleSystem` | Master timeline, emitters, LOD fallbacks, bounds | Particle domain | TOML | Master simulation timeline | Replaces deferred simplified particle redo contract |
| `.emitternode` | `.EmitterNode` | Spawn rates, burst curves, lifetime gradients, GPU update rules | Particle domain | TOML | Emitter configuration | New |
| `.vectorfield` | `.VectorField` | 3D directional velocity grids (curl noise, vortices, turbulence) | Force-field/particle consumers | Binary 3D grid + TOML recipe | Velocity grid | Replaces deferred simplified vector-field redo contract |
| `.ribbontrail` | `.RibbonTrail` | Continuous strip generators (sword arcs, contrails, tracers, lightning) | Particle/ribbon rendering | TOML | Strip generator parameters | New |
| `.swarmbehavior` | `.SwarmBehavior` | Boids/flocking rules, GPU-instanced crowd/insect/spark logic | Swarm simulation | TOML | Flocking rule set | New |
| `.fluidgrid` | `.FluidGrid` | Eulerian 2D/3D Navier-Stokes domain (velocity, pressure, vorticity, divergence) | Fluid simulation | Binary + TOML | Solver domain fields | New; do not mock while solver is deferred |
| `.noisegraph` | `.NoiseGraph` | Deterministic fractal noise pipelines (Simplex, Worley, Perlin, Ridged) | Procedural generation | TOML | Noise field/order + seed | New |
| `.fracturetree` | `.FractureTree` | Voronoi shatter hierarchy, connectivity graph, stress thresholds | `Engine/GeometrySpace/Fracture` | Binary + TOML | Fracture hierarchy | Narrows existing fracture workspace output |
| `.shardcluster` | `.ShardCluster` | Pre-fractured debris pieces, mass/inertia, sleep thresholds | Destruction/physics | Binary + TOML | Debris chunk set | New |
| `.constraintset` | `.ConstraintSet` | Mechanical joints, ragdoll hinges, hydraulics, breakable welds | `Engine/SimulationSpace/PhysicsSpace` | TOML | Joint set | New |
| `.convexhull` | `.ConvexHull` | Simplified outer bounding polyhedra for broad-phase checks | Geometry/physics | Binary | Hull polyhedra | New |
| `.impactprofile` | `.ImpactProfile` | Material-pair response lookup (sparks, decals, debris, fracture triggers) | Physics/material/effects | TOML | Contact response lookup | New |

**Retained legacy formats (unchanged unless a migration is explicitly verified):** `.ProjectSpace`, `.ColourSpace`, `.GeometrySpace`, `.SurfaceParameterSpace`, `.MaterialSpace`, `.TextureSpace`, `.ImageSpace`, `.VectorSpace`, `.UVSpace`, `.VolumetricSpace`, `.PhotometrySpace`, `.RenderSpace`, `.ComponentSpace`, `.Acoustic`, `.Motion`, `.Sketch`, `.Assembly`, `.Pigment`, `.Terrain`, `.NetworkSpace`, `.InputSpace`, `.InstanceSpace`.

---

## 3. Engine-to-extension mapping

Paths are the inspected native owners. `Internal` columns use naming-rule-compliant identifiers (§4.2).

### 3.A Scene, configuration & gameplay

| Engine subsystem | Approved extension | Format | Cached / baked artifact |
| --- | --- | --- | --- |
| `Engine/Configuration/EngineConfiguration`, host launch | `.engineconfig` | TOML | Resolved startup descriptor + channel-lane derivation |
| Viewport display/quality settings | `.graphicssettings` | TOML | Validated preset index + capability fallback key |
| Platform player preferences/progress | `.userprofile` | TOML | Local profile document (outside project) |
| `Engine/Lifecycle` world model, outliner, startup | `.worldspace` | TOML + binary | Scene resource bundle, cluster instances, outliner rows |
| Placed world records | `.gameobject` | TOML | Instanced transform/record set |
| `Engine/ComponentClass`, component register | `.component` | TOML | Component definition register |
| Sensor volumes | `.triggerzone` | TOML | Sensor volume set |
| `Engine/Input` signal routing | `.eventbus` | TOML | Signal definition set |
| Gameplay flags/counters/multipliers | `.variabletable` | TOML | Variable set snapshot |
| Timing/time dilation | `.timerprofile` | TOML | Timer profile |
| `Engine/Components/Motion` easing | `.curve` | TOML (+ binary keys) | Sampled curve LUT |
| `Engine/Components/Motion` sequencing | `.timeline` | TOML + binary | Track evaluation cache |
| `Engine/AudioSpace`, acoustic codec | `.soundscape` | TOML + PCM/Opus | Decoded bus graph, converted stems |

### 3.B UI, fonts & editor

| Engine subsystem | Approved extension | Format | Cached / baked artifact |
| --- | --- | --- | --- |
| `Engine/Components` panes, controls, docking, notch, control centre, appearance | `.interface` | TOML | Layout hierarchy runtime (anchors, containers, z-order) |
| `Engine/Codecs/FontCodec`, `EngineContent/FontArchives` | `.fontspace` | TOML + SFNT-style binary | Glyph metrics/kerning + MSDF/SDF chart pages |
| `Engine/Components/VectorIcons`, texture/image codecs, packer | `.pixelatlas` | TOML + BC7/RGBA | Packed chart, region table, mip chain |
| Hover cards | `.tooltip` | TOML | Card content/layout binding |
| `Engine/Workspaces` docking | `.editorlayout` | TOML | Workspace panel arrangement (editor-only) |

### 3.C Rendering, lighting & compute

| Engine subsystem | Approved extension | Format | Cached / baked artifact |
| --- | --- | --- | --- |
| Render scheduler / submission order | `.rendergraph` | TOML → DAG | Compiled pass order + transient VRAM aliasing |
| `Engine/Shaders/Compiler`, `.slang` authoring | `.shadergraph` | TOML → `.spv` | SPIR-V module + reflection |
| `Engine/Shaders/Compute`, dispatch | `.computekernel` | TOML → `.spv` | SPIR-V compute module + permutation index |
| Post-process units | `.poststack` | TOML + 3D LUT | Effect order + grading LUT texture |
| Photometry measured luminaires, IES import | `.iesprofile` | TOML + LUT | Resampled intensity/orientation grid |
| Atmosphere | `.skyatmosphere` | TOML + LUT | Scattering/absorption/fog LUTs |
| Global-illumination baking | `.irradiance` | Binary + TOML | Diffuse light-field textures + directional lobes |
| Real-time probe field | `.radiancecache` | Binary + TOML | Versioned probe checkpoint + provenance |
| `Engine/ColourSpace/SpectralDistribution` | `.spectralcurve` | TOML | Wavelength dispersion samples + units |
| Camera optics | `.lensaperture` | TOML | Bokeh/exposure/vignette parameter set |
| `Engine/SpatialAcceleration` | `.raystructure` | Binary + TOML recipe | BLAS/TLAS build options + optional derived artifact |
| `Engine/DistanceFieldSpace` | `.distancefield` | Binary 3D grid + TOML header | SDF grid + transform/units metadata |

### 3.D Simulation, VFX & destruction

| Engine subsystem | Approved extension | Format | Cached / baked artifact |
| --- | --- | --- | --- |
| Particle domain | `.particlesystem` | TOML | Master timeline + emitter bindings + LOD/bounds |
| Particle spawning | `.emitternode` | TOML | Spawn/burst/lifetime/update configuration |
| Force-field / vector-field domain | `.vectorfield` | Binary 3D grid + TOML recipe | Velocity grid |
| Ribbon/trail rendering | `.ribbontrail` | TOML | Strip generator parameters |
| Swarm/flocking | `.swarmbehavior` | TOML | Flocking rule set + instance bindings |
| Fluid solver | `.fluidgrid` | Binary + TOML | Velocity/pressure/vorticity/divergence fields |
| Procedural generation | `.noisegraph` | TOML | Deterministic noise order + seed |
| `Engine/GeometrySpace/Fracture` | `.fracturetree` | Binary + TOML | Voronoi hierarchy + connectivity + stress thresholds |
| Destruction debris | `.shardcluster` | Binary + TOML | Chunk mass/inertia/sleep thresholds |
| `Engine/SimulationSpace/PhysicsSpace` | `.constraintset` | TOML | Joint/hinge/hydraulic/weld set |
| Collision broad phase | `.convexhull` | Binary | Outer hull polyhedra |
| Material contact response | `.impactprofile` | TOML | Material-pair lookup + effect references |

---

## 4. `Engine/Serialization/` folder

### 4.1 Modules

| Unit | Responsibility |
| --- | --- |
| `ExtensionRegister.{h,cpp}` | Maps approved suffix ↔ type ID ↔ schema version ↔ owner. Case-insensitive resolve, canonical PascalCase write. Rejects case collisions on case-sensitive filesystems. |
| `ArtifactIdentity.{h,cpp}` | Canonical byte encoding, xxHash64 node digest, versioned hashing policy, provenance struct. |
| `DependencyOrder.{h,cpp}` | Directed acyclic build order, cycle detection with reported path, transitive dirty propagation, topological scheduling. |
| `DerivedArtifactLedger.{h,cpp}` | Reads/writes the TOML manifest: node, inputs, outputs, digest, tool/schema/platform/device keys, status, timing, attempts. Atomic write. |
| `ArtifactPersistence.{h,cpp}` | Content-addressed store under `Build/Cache/<Domain>/<digest>.bin` + sidecar provenance. Memory-map on hit, atomic temp+rename publish, quarantine on corruption. |
| `CookedAssetLocator.{h,cpp}` | Dispatch from an approved extension + digest to a memory-mapped artifact and its runtime loader. |
| `SerializationLifecycle.{h,cpp}` | Initialize → Tick → Finalize participant; owns worker-lane submission and cancellation. |
| `SerializationValidation.cpp` | Focused validation executable under `Exhibits/` or CTest. |

### 4.2 Naming compliance (extension string vs internal identifier)

The extension strings are approved public identifiers. Internal types avoid the hard-banned words (`Cache`, `Graph`, `Node`, `Kernel`, `Store`, `Table`, `Matrix`, `Entity`, `System`, `Hierarchy`, `Emit`, `State`, `Value`, `Record`).

| Extension | Internal Frontier identifier |
| --- | --- |
| `.computekernel` | `GpuComputeProgramDocument` |
| `.shadergraph` | `ShaderAuthoringNetworkDocument` |
| `.rendergraph` | `RenderExecutionOrderDocument` |
| `.noisegraph` | `ProceduralNoiseOrderDocument` |
| `.emitternode` | `ParticleSpawnUnitDocument` |
| `.particlesystem` | `ParticleDomainDocument` |
| `.variabletable` | `GameplayVariableSetDocument` |
| `.eventbus` | `SignalDefinitionSetDocument` |
| `.timeline` | `SequencedTrackDocument` |
| `.component` | `WorldComponentDefinitionDocument` |
| `.gameobject` | `WorldInstanceRecord` |
| `.convexhull` | `CollisionHullDocument` |
| `.distancefield` | `SignedDistanceGridDocument` |
| `.raystructure` | `AccelerationStructureRecipeDocument` |
| `.irradiance` | `BakedDiffuseLightFieldDocument` |
| `.radiancecache` | `ProbeFieldCheckpointDocument` |
| `.fluidgrid` | `FluidSolverDomainDocument` |
| `.fracturetree` | `FractureHierarchyDocument` |
| `.shardcluster` | `DebrisChunkSetDocument` |
| `.constraintset` | `MechanicalJointSetDocument` |
| `.swarmbehavior` | `FlockingRuleSetDocument` |
| `.ribbontrail` | `StripGeometryGeneratorDocument` |
| `.vectorfield` | `VelocityFieldDocument` |
| `.impactprofile` | `MaterialContactResponseDocument` |
| `.poststack` | `PostProcessOrderDocument` |
| `.iesprofile` | `PhotometricDistributionDocument` |
| `.skyatmosphere` | `AtmosphericScatteringDocument` |
| `.spectralcurve` | `SpectralDispersionDocument` |
| `.lensaperture` | `CameraOpticDocument` |
| `.pixelatlas` | `PackedTexelChartDocument` |
| `.fontspace` | `TypefaceDocument` |
| `.interface` | `InterfaceLayoutDocument` |
| `.tooltip` | `HoverCardDocument` |
| `.editorlayout` | `WorkspaceLayoutDocument` |
| `.userprofile` | `PlayerPreferenceDocument` |
| `.graphicssettings` | `DisplayQualityDocument` |
| `.engineconfig` | `BootConfigurationDocument` |
| `.timerprofile` | `TimeDilationProfileDocument` |
| `.curve` | `EasingCurveDocument` |
| `.soundscape` | `AcousticBedDocument` |
| `.triggerzone` | `SensorVolumeDocument` |
| `.worldspace` | `WorldDocument` |

---

## 5. Container wire format (TTF/SFNT-style framing)

Retain the existing `SpaceContainerCodec` framing. The hybrid file is inspired by SFNT/TTF section directories; it is not required to be a valid standalone font or a valid standalone `.toml` document.

| Tier | Content |
| --- | --- |
| Tier 1 | UTF-8 TOML manifest: `.DocumentHeader` (identity, `SchemaVersion`, `AuthoringWorkspace`, `BinaryAlignmentBytes = 64`), domain tables, `[['.SectionDirectory']]` entries with `SectionIdentifier`, `SubFormatTag`, `ByteLength`, `RelativeAlignedOffset`, `ChecksumFnv1a64`. |
| Boundary | Explicit ASCII delimiter plus zero padding to the next 64-byte boundary. |
| Tier 2 | 64-byte-aligned binary sections: parametric payloads, tiled numeric streams, glyph/atlas charts, SDF grids, acceleration artifacts, embedded revision streams. |

Rules carried forward from the old plan and still mandatory:

- Case-insensitive decode, canonical PascalCase encode; unknown fields/sections preserved or refused, never destructively rewritten.
- Bounds, overflow-safe offsets, section-overlap and truncation checks, path containment, and clear diagnostics for untrusted files.
- FNV-1a detects accidental corruption; it is not collision-resistant content identity. Artifact identity uses §6.
- Schema/algorithm/tool versions are part of the digest, not inferred from filenames or mtimes.
- Revision history limits remain separate from the build DAG: **215 MiB per document**, **750 MiB global**, redo purge then prefix fold, monotonic cross-document ordering.

---

## 6. Persistent artifact DAG and disk-cache pipeline

### 6.1 Pipeline

```text
[ Source: .toml / .ttf / .glsl / .slang / .ies / grid / ... ]
                    |
                    v  xxHash64( canonical bytes + sorted upstream digests + tool/schema/platform/device keys )
        [ Dependency order: hash match on disk? ]
                    |
       match -------+------- mismatch
        |                   |
        v                   v
[ Memory-map cooked ]  [ Bake only dirty nodes, topologically,
   binary + provenance ]  deduplicated, cancellable, atomic publish ]
                    |
                    v
        [ Build/Cache/<Domain>/<digest>.bin + sidecar provenance ]
                    |
                    v
        [ DerivedArtifactLedger.toml updated atomically ]
```

### 6.2 Node identity

| Field | Rule |
| --- | --- |
| Source digest | xxHash64 over the canonical byte encoding of the authored document (canonical key order, normalized line endings, explicit units/colour space). |
| Upstream digests | Sorted list of dependency node digests; edges come from explicit references in the document, never from filename or mtime guessing. |
| Tool keys | Compiler/shader compiler/parser/algorithm version, output format, platform, and relevant device/driver capabilities. |
| Policy | Hashing policy itself is versioned; changing it invalidates the store deliberately. |
| Section integrity | Existing per-section FNV-1a stays for corruption detection. |

### 6.3 Resolve, bake, publish

1. **Resolve.** Compute the node digest and look up `Build/Cache/<Domain>/<digest>.bin` plus sidecar. Present + type/version/checksum compatible ⇒ memory-map/load directly.
2. **Dirty propagation.** On edit, recompute only changed nodes; mark downstream nodes dirty through explicit edges; schedule in topological order with deduplication and cancellation.
3. **Bake.** Only dirty nodes execute. Preserve the last valid result while rebuilding when safe; failures stay visible and never silently present stale output as current.
4. **Publish.** Write to a temporary file, flush, atomically rename, then update the ledger. Publish only if the source generation still matches.
5. **Recovery.** A write-ahead journal records intent; crash mid-publish leaves either old or new artifact, never a torn file. Corrupt artifacts are quarantined and rebuilt.
6. **Accounting.** Refcount/reachability from authored documents and the ledger; configurable quota; concurrent-writer safety; cross-platform path handling. Never garbage-collect authored sources, unsaved work, or reachable derived artifacts. Do not commit derived artifacts to Git by default.

### 6.4 Provenance ledger

`Build/Cache/DerivedArtifactLedger.toml` is the single manifest. Example shape:

```toml
SchemaVersion = 1
HashingPolicy = 'Frontier.XXH64.V1'

[[Nodes]]
NodeId = 'World.VehicleClearSkyDefault'
ApprovedExtension = '.WorldSpace'
SourcePath = 'Content/Worlds/VehicleClearSkyDefault.WorldSpace'
SourceDigest = '0x...'
UpstreamDigests = ['0x...', '0x...']
ToolKeys = ['toml++.3.4.0', 'FrontierContainer.1']
ArtifactPath = 'Build/Cache/WorldSpace/0x....bin'
ArtifactDigest = '0x...'
Status = 'Current'
LastBakedUnixNanoseconds = 0
```

---

## 7. World authority: removing the hardcoded showcase fallback

Inspected defect: `Engine/Lifecycle/EditorLifecycle.cpp::PopulateWorldSceneSession` selects builder entry points directly (`BuildApocalypticCityRacingScene`, `BuildBlankPlaneSkyScene`, `BuildVehicleClearSkyDefaultScene`). `Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp::BuildVehicleClearSkyDefaultScene` (starting near line 987) **first attempts** `Content/Worlds/VehicleClearSkyDefault.WorldSpace`, then silently constructs a hand-built scene with inline materials and primitive transforms when the file is absent or fails to decode. Subsequent viewport display settings overwrite portions of the loaded atmosphere. That is the exact hardcoded-showcase behaviour the approved data-driven contract forbids.

Required end state:

| Behaviour | Required change |
| --- | --- |
| Startup selection | `.engineconfig.StartupWorld` names the `.worldspace`. Lifecycle loads that document; no implicit builder dispatch. |
| Missing world | Visible error with the resolved path; no silent hand-built scene. |
| Corrupt world | Decode diagnostic + quarantine/repair flow; never partial inline defaults presented as authored content. |
| Default content | `Tools/DefaultContentGenerator` authors the default `.worldspace` and its referenced assets to disk deterministically, verifies offsets/checksums, then exits. Generation is a tool action, not a runtime fallback. |
| Runtime mutations | Construct/remove/edit operations persist through the world document and shared assets; outliner rows are views, not independent truth. |
| Display overrides | `.graphicssettings` may choose quality, but must not rewrite authored world properties or mask load failure. |
| Evidence | Save/reopen equality, stable IDs/order, create/remove each entity type, undo/redo, missing/corrupt/failed-save cases, and a measured cache hit/miss report. |

---

## 8. Legacy overlap and migration rules

An overlap is not automatic equivalence. Each row needs an explicit audit before migration.

| Approved | Overlapping legacy | Decision rule |
| --- | --- | --- |
| `.soundscape` | `.Acoustic`, `.AcousticSpace` | `.soundscape` is the approved authoring surface; keep clip import under existing interchange contracts. Do not invent `.audio`. |
| `.iesprofile` | `.PhotometrySpace` measured luminaires | `.iesprofile` holds the imported measured distribution; solar/area photometry stays `.PhotometrySpace`. |
| `.skyatmosphere` | `.VolumetricSpace` skies/clouds/fog | `.skyatmosphere` holds spectral scattering/atmosphere authoring; clouds/fog keep their domain until individually audited. |
| `.component` | `.ComponentSpace` | `.component` is reusable behavior/data; `.ComponentSpace` rig assets stay until the rig codec is audited. |
| `.timeline` / `.curve` | `.Motion` | `.timeline` sequencing and `.curve` easing are extracted; other motion data stays `.Motion`. |
| `.rendergraph` / `.poststack` | `.RenderSpace` | `.rendergraph` is the pass DAG; `.poststack` is the effect order/LUT. `.RenderSpace` viewport authoring remains until audited. |
| `.shadergraph` / `.computekernel` | raw `.slang` | `.slang` stays the primary shader language; the approved formats are authoring/compiled definitions, not replacements for shader source. |
| `.irradiance` / `.radiancecache` | GI bake outputs | New derived artifacts; never treat a stale temporal probe result as current. |
| `.spectralcurve` | `.ColourSpace` spectral | `.spectralcurve` is the wavelength-dispersion profile; colour-space containers stay. |
| `.raystructure` | runtime `SpatialAcceleration` trees | Recipe + device-keyed derived artifact; never serialize live handles or assume portability. |
| `.distancefield` | `DistanceFieldSpace` local SDF | Grid + metadata; record signedness, units, voxel transform, truncation. |
| `.particlesystem` / `.vectorfield` | removed simplified particle/force-field code | Deferred redo domains; block unsupported solvers explicitly rather than mocking. |
| `.fracturetree` / `.shardcluster` | `GeometrySpace/Fracture` workspace | Fracture hierarchy and debris chunks become derived artifacts of authored input. |
| `.constraintset` / `.convexhull` / `.impactprofile` | `SimulationSpace` physics | Authored configurations; broad-phase hull role depends on the physics algorithm and is not guaranteed. |

Migration mechanics: versioned decoders, explicit conversion, preserve the original file, emit a migration report, and never overwrite the only copy. Renaming a legacy file does not grant it new semantics.

---

## 9. Phases and acceptance gates

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0 | Audit and freeze: inventory subsystems/codecs/content; pin reference revision; record migration fixtures and evidence | Approved mapping table signed off; no guessed owners |
| 1 | Foundation: `ExtensionRegister`, `ArtifactIdentity`, `DependencyOrder`, `DerivedArtifactLedger`, `ArtifactPersistence` + tests | Hit/miss, cycle, failure, cancellation, crash-recovery tests pass |
| 2 | Container alignment: register approved suffixes/types/schema versions in `SpaceContainerCodec`; bounded/untrusted-file tests | Round-trip, case, unknown-section, offset/checksum tests pass |
| 3 | World authority slice: `.engineconfig` startup, `.worldspace` + `.gameobject` + `.component`; remove hardcoded fallback; default generator writes real files | No hardcoded fallback path remains; save/reopen equality proven |
| 4 | Gameplay/config formats: `.triggerzone`, `.eventbus`, `.variabletable`, `.timerprofile`, `.curve`, `.timeline`, `.graphicssettings`, `.userprofile` | Each has schema, owner, codec, consumer, tests |
| 5 | UI/fonts: `.interface`, `.fontspace`, `.pixelatlas`, `.tooltip`, `.editorlayout` | Layout/glyph/atlas round-trip + Shipping exclusion audit |
| 6 | Rendering/compute: `.rendergraph`, `.shadergraph`, `.computekernel`, `.poststack`, `.iesprofile`, `.skyatmosphere`, `.spectralcurve`, `.lensaperture`, `.irradiance`, `.radiancecache`, `.raystructure`, `.distancefield` | Derived artifacts visually/intersection-verified against fresh builds |
| 7 | Simulation/VFX/destruction: `.soundscape`, `.particlesystem`, `.emitternode`, `.vectorfield`, `.ribbontrail`, `.swarmbehavior`, `.fluidgrid`, `.noisegraph`, `.fracturetree`, `.shardcluster`, `.constraintset`, `.convexhull`, `.impactprofile` | Deterministic replay, invalidation, LOD/bounds, no mocked solvers |
| 8 | Hardening: concurrency, quota/GC, cross-platform paths, Shipping separation, performance gates | Measured idle/edit-time and cache-hit evidence; regression suite green |

Commit and push each logical milestone on the active branch.

---

## 10. Verification and evidence

| Claim | Required proof |
| --- | --- |
| Data-driven world | Startup loads `.engineconfig` → `.worldspace`; missing/corrupt/failed-save cases produce explicit errors; no inline default scene capture. |
| No recomputation | Ledger hit/miss counters; identical inputs skip bake; changed input rebuilds only its downstream subtree; timing table. |
| Container correctness | Round-trip equality, case-insensitive load, unknown section preservation, bounds/overlap/truncation, checksum mismatch, malformed diagnostics. |
| DAG correctness | Cycle reporting, transitive invalidation, cancellation, deduplication, atomic publish, crash recovery, corrupt-artifact quarantine. |
| Format correctness | Per-domain known-answer fixtures: glyph metrics, atlas regions, SDF sampling, photometric orientation/energy, shader SPIR-V equivalence, acceleration intersection parity. |
| Runtime integration | Create/remove each environment entity; save/reopen; undo/redo; GPU lifetime synchronization; no stale acceleration/descriptors. |
| Production separation | Editor symbols/resources absent from Shipping; runtime world data usable without editor UI. |
| Performance | Reproducible conditions, hardware, revision, cache state, and before/after numbers; no claim without measurement. |

---

## 11. Open decisions before implementation

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | Canonical filename casing | (a) PascalCase write, case-insensitive read; (b) mandate lowercase | (a), matching the retained old rule; confirm if lowercase is required |
| 2 | `.gameobject` scope | (a) approve as a full extension; (b) fold placements into `.worldspace` | (a); the approved description names it explicitly |
| 3 | Cache root | (a) `Build/Cache/`; (b) `<Project>/Saved/ArtifactCache/` | (a), overridable by `.engineconfig` |
| 4 | Identity hash | (a) xxHash64; (b) SHA-256 | (a) for node identity; keep FNV-1a for section integrity; optional SHA-256 for published verification |
| 5 | Device-specific artifacts | Key by API/device/driver/build flags | Yes; never assume portability |
| 6 | First vertical slice | (a) world + engineconfig; (b) add UI formats first | (a); it proves the authority/no-fallback rule |
| 7 | Deferred solver formats | Block explicitly until solver exists | Yes; do not mock `.particlesystem`/`.vectorfield`/`.fluidgrid` |

---

## Appendix A — Approved name descriptions (verbatim scope)

| Extension | Approved scope |
| --- | --- |
| `.worldspace` | Top-level scene manifest, record-entry tree, spatial bounds |
| `.interface` | Complete UI screens, menus, and HUD layout hierarchies (anchor points, containers, z-ordering) |
| `.fontspace` | Font storage |
| `.pixelatlas` | Packed sprite sheets, UI icon atlases, or virtual texture page tables |
| `.soundscape` | Ambient audio beds, dynamic music stems, and spatial mixer snapshots |
| `.distancefield` | 3D scalar grids storing shortest-distance values for soft shadows, ambient occlusion, and raymarching |
| `.particlesystem` | Master timeline coordinating multiple synchronized emitters, LOD fallbacks, and bounding boxes |
| `.emitternode` | Modular spawn rates, burst curves, lifetime gradients, and GPU compute update rules |
| `.vectorfield` | 3D directional velocity grids (curl noise, vortices, turbulence) that push and swirl GPU particles |
| `.ribbontrail` | Continuous strip-geometry generators for sword arcs, jet contrails, tracers, and lightning bolts |
| `.swarmbehavior` | Boids, flocking matrices, and GPU-instanced crowd/insect/spark simulation logic |
| `.fluidgrid` | Eulerian 2D/3D Navier-Stokes solver domains storing velocity, pressure, vorticity, and divergence |
| `.fracturetree` | Voronoi shattering hierarchies, chunk connectivity graphs, and stress thresholds for real-time destruction |
| `.constraintset` | Mechanical joints, ragdoll hinges, hydraulic pistons, and breakable structural welds |
| `.impactprofile` | Material-pair lookup tables defining sparks, decals, debris spawns, and fracture triggers on collision |
| `.raystructure` | Pre-built BLAS/TLAS (bounding volume hierarchy) acceleration structures for hardware raytracing |
| `.iesprofile` | Real-world photometric light-distribution curves for physically accurate architectural lamps and spotlights |
| `.skyatmosphere` | Spectral scattering tables, ozone absorption curves, and multi-scattering aerial fog LUTs |
| `.shadergraph` | Visual node-based shader authoring networks prior to compiling to SPIR-V/HLSL/GLSL |
| `.computekernel` | Standalone GPU compute programs for frustum culling, terrain generation, or custom post-effects |
| `.rendergraph` | Directed acyclic graphs (DAGs) defining render passes, transient VRAM aliasing, and async compute sync |
| `.poststack` | Tone-mapping curves, 3D color-grading LUTs, bloom thresholds, and optical lens distortion profiles |
| `.noisegraph` | Deterministic fractal noise pipelines (Simplex, Worley, Perlin, Ridged) for procedural worldgen |
| `.convexhull` | Simplified outer bounding polyhedra auto-generated around complex raw geometry for fast broad-phase checks |
| `.shardcluster` | Pre-fractured brittle debris pieces storing mass, inertia tensors, and sleeping velocity thresholds |
| `.irradiance` | Precomputed diffuse bounce-lighting textures and directional lobe maps |
| `.spectralcurve` | Wavelength-accurate light dispersion profiles for thin-film iridescence, oil slicks, and crystal prisms |
| `.lensaperture` | Physically modeled camera bokeh shapes, chromatic fringes, vignette, and sensor exposure curves |
| `.radiancecache` | Real-time world-space probe caches updating dynamic global illumination across frames |
| `.component` | Modular behavior/data blocks (Health, RigidBody, MeshRenderer, AudioSource) attached to a game object |
| `.triggerzone` | Sensor volumes that do not block movement, firing OnEnter, OnStay, and OnExit events |
| `.eventbus` | Global message/signal definitions allowing systems to communicate without hard dependencies |
| `.variabletable` | Global game flags, score counters, difficulty multipliers, and debug cheat toggles |
| `.timerprofile` | Reusable countdowns, ability cooldowns, and time-dilation (slow-motion) presets |
| `.curve` | Basic 1D/2D easing graphs (Linear, Ease-In-Out, Bounce) shared across UI tweens, door movements, and falloff math |
| `.engineconfig` | Boot-time system settings (tick rate, memory limits, default renderer API, startup map) |
| `.graphicssettings` | Player-facing quality presets (resolution, V-Sync, FPS cap, texture quality, shadow distance) |
| `.userprofile` | Local player preferences, unlocked achievements, playtime counters, and accessibility toggles |
| `.editorlayout` | Saved workspace panel arrangements, grid snap sizes, and gizmo scales |
| `.timeline` | Multi-track keyframe sequencer orchestrating object animations, camera cuts, audio cues, and subtitles |
| `.tooltip` | Floating hover cards dynamically displaying item descriptions, DPS comparisons, and status effects |
| `.gameobject` | Placement/instance record that `.component` blocks attach to |

---

## Appendix B — Inspected sources

| Fact | Source at `1828eae` |
| --- | --- |
| Hardcoded world dispatch | `Engine/Lifecycle/EditorLifecycle.cpp::PopulateWorldSceneSession` |
| Silent hand-built fallback | `Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp::BuildVehicleClearSkyDefaultScene` |
| World model/codec | `Engine/Codecs/WorldSpaceCodec.{h,cpp}`, `Engine/Codecs/SpaceContainerCodec.{h,cpp}` |
| Existing suffix categories | `SpaceSuffixCategory` in `SpaceContainerCodec.h` |
| Configuration owner | `Engine/Configuration/EngineConfiguration.{h,cpp}` |
| Subsystem folders | `Engine/` tree: AudioSpace, Codecs, ColourSpace, ComponentClass, Components, Configuration, Constants, DistanceFieldSpace, Editor, GeometricRaster, GeometrySpace, Input, Interchange, Lifecycle, MaterialSpace, Mathematics, NetworkingSpace, Shaders, SimulationSpace, SpatialAcceleration, Threading, Tools, Windowing, Workspaces |
| Existing content tree | `Content/` (55 files across Worlds, Components, Geometry, SurfaceParameters, Materials, Photometry, Environment, Rendering, Optics) |
| Retained rules | `Documentation/Plans/DocumentFormatsInstancePlan.md`, `DocumentSpacesRevisionPlan.md`, `Documentation/AgenticInstructions/SKILL-{Naming,Formatting,Emoji,CompactOutputProtocol}.md` |
