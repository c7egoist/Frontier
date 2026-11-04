# Force Field and Particle editors — C++ integration plan

Status: **in progress** (2026-11-04, branch `arena/88b72faa-frontier`). The owner approved the HTML prototypes
(`Experimental/ForceFieldEditor`, `Experimental/ParticleEditor`, `Exhibits/ForceFieldEditor`) and asked for both
editors in the Frontier editor before the vehicle step. This plan records the phases and what each one delivered.

## 1. Decisions carried over from the prototypes

| Decision | Where it lands in C++ |
|---|---|
| The Force Field is the master component | `ForceField` record; `Wind` and `ForceSource` records under it |
| 16 types: 9 flows, 6 accelerations, 1 damping | `ForceSourceCategory`, `ForceSourceCatalogue` |
| Flow, accelerate and damp never share a bucket | `ForceContribution`, `ForceFieldSpace::EvaluateContribution` |
| 100 m to 100 km, detail by cell span | `EvaluateStepSample(…, CellSpan)`; mesoscale in `PlanetaryWindProfile` |
| One visualization for both editors | `Interface/ForceFieldVisualization/` (phase B) |
| Render settings look | `Interface/Controls/SectionRows`, `Inspectors/ForceField/` (phase C) |

## 2. Phases

| Phase | Content | Status |
|---|---|---|
| A | Engine port of `ForceFieldCatalogue.js`, renames, records, levelspace, parity test | ✔️ `2691cd8` |
| B | Field view: Scene · Field switch, map, oblique, minimap, timeline, camera overlay | ✔️ `440c481` `f6f0deb` |
| C | Force Field, Wind and Force pages, Forces group, workspace actions, Log Stream | ✔️ `ddff77f` … `fc32e34` |
| D | Windows binary and Tracker | 🚧 |
| E | Particle editor: outliner, inspector, library, its own Vulkan viewport (Slang port) | 🚧 |

## 3. Phase A — engine

- `Frontier/Engine/PhysicalDynamics/ForceSourceCatalogue.{h,cpp}`: the type table (parameters with their ranges and
  levelspace keys), activation (Always, Window, Trigger), moving centres (tornado track, puff drift, front travel),
  reach masks (Sphere, Column, Box with falloff), the 9 flow, 6 acceleration and 1 damping evaluations, the radial
  profile, the cascade budget and the Beaufort scale. Line for line with the prototype; the gradient noise hashes in
  uint32 as `Math.imul`.
- `ForceFieldSpace`: `ConfigureAuthoredSources(Sources, TimelineSeconds)` prepares the records once per refresh; their
  flows join `EvaluateStepSample`; `EvaluateContribution` reads any contribution, optionally one source alone. The
  eddies are the prototype's divergence-free 2D stream-function curl; gust bands, eddies and mesoscale fade below two
  cells. The authored sources run on the Force Field's timeline clock, the wind on the renderer's clock.
- Renames: `ForceSourceKind` → `ForceSourceCategory` (VortexColumn → TornadoColumn, TravelingGustFront → GustFront,
  RadialMicroburst → Microburst, LocalizedGustPuff → GustPuff, AerodynamicWake → VehicleWake, ThermalUpdraftPlume →
  ThermalUpdraft, DirectionalJetCorridor → JetCorridor, SphericalImpulseShell → BlastWave), `VortexColumnParameters` →
  `TornadoColumnParameters`, `ActiveForceSource::Kind/Vortex` → `Category/Column`, `Emitter*` → `Body*`.
- Records: `ForceSourceConfiguration` (`ForceSource`, group Forcefield, under `rec_force_field`). Levelspace keys:
  `category` (snake_case), `centre_metres` in scene axes [east, north, up], the type's own keys (`inner_radius_metres`,
  `inflow_mps`, `track_bearing_deg` …), `reach`, `reach_metres`, `falloff`, `activation`, `*_seconds`, `acts_on`.
  The firing time is runtime only.
- `Default.levelspace` carries the prototype's 14 demo sources. The GPU cloud synthesis keeps only triggered sources
  for now, so the renderer's sky is unchanged; the CPU field (vectors, camera wind, local volume drift) sees them all.
- Parity: `ForceFieldCatalogueValidation` against `Exhibits/ForceFieldEditor/Results/CatalogueReference.toml`
  (written by `ExportCatalogueReference.mjs` from the prototype): 23 of 23, 1,781 samples, worst error 0 at 1e-9.

## 4. Phase B — the field view

- `Frontier/Engine/Interface/ForceFieldVisualization/ForceFieldVisualization.{h,cpp}`: one renderer with three
  projections of the horizontal slice. Map (top-down, logarithmic zoom and pan), Oblique (the slice tilted, with source
  columns standing on it) and Camera (the scene viewport's perspective camera, drawn over the rendered image).
- The lattice is evaluated asynchronously, at most 48,000 samples on world-snapped power-of-two cells, so panning does
  not shimmer. Turbo legend with a 98th-percentile automatic scale, the eos arrows, tracers, source outlines with reach,
  columns, bearings and tracks, the cascade overlay, a scale bar and a 72² minimap of the 100 km extent.
- `Projects/Everest/Source/EverestFieldViewport.cpp`: the viewport bar's Scene · Field switch, the timeline with one
  lane per force (window, trigger, firing) and the field's own clock, picking and moving sources on the slice.
- `ForceFieldWorkspaceCapture` (`Exhibits/ForceFieldEditor/Code/`) captures the Field view at 6 km, 100 km, oblique,
  accelerate, vorticity and over the scene.

## 5. Phase C — pages and workspace links

| Part | Content |
|---|---|
| Force Field page | Peak in view with its history, forces by contribution and cost, quick switches, 7 sections |
| Wind page | Speed at 10 m at the camera and its last 12 s, compass, shear and veer, 5 sections |
| Force page | Radial profile and status; Strength, Reach, Timing, Receivers |
| Outliner | The forces under the Force Field, by contribution |
| Construct dialog | A Forces group with the 16 types; the bare `ForceSource` type is not offered |
| Workspace actions | `select:`, `add-force[:type]`, `field-view:on/off`, `field-span:<m>`, `fire:` |
| Log Stream | Field view shown / back, the contribution shown, each firing |

- Force Field sections: View, Range, Forces, Receivers, Timeline, Vectors, Budget. The history holds 120 entries at
  about 10 Hz while the Field view shows.
- Wind sections: Flow, Gusts, Altitude (hodograph), Eddies (a wind-only vorticity preview), Mesoscale.
- The workspace actions travel through `InspectorRuntime` (`RequestWorkspaceAction`, `ConsumeWorkspaceActions`).
- Sources: `Frontier/Engine/Interface/Inspectors/ForceField/` (sections and pieces), `ForceFieldInspector`,
  `WindInspector`, `ForceSourceInspector`, `ConstructPanel`, `EverestWorkspace`, `EverestFieldViewport`.
- A new force lands in the middle of the Field view while it shows, otherwise on the ground where the camera looks.
- Validation: the capture tool's Workspace stage; `EnvironmentInspectorValidation`; the eight regression tests.

## 6. Phase E — the Particle editor

The prototype's engine (eos `549c477`, `Experimental/ParticleEditor/Engine/`) moves to C++, Vulkan and Slang with its
behaviour unchanged; the UI follows the approved prototype (outliner, inspector, library sheet, field overlay).

| Step | Content | Proof |
|---|---|---|
| E1 | Preset library as content, its decoder, effect parameters, uniform packing | C++ packing equals the prototype's |
| E2 | Slang port of `shaders.js`; stored SPIR-V | Pinned slangc compiles it; archive check |
| E3 | Vulkan host: stores, pipelines, refresh sequence, readbacks, offscreen image | SwiftShader captures |
| E4 | The editor: outliner, viewport, library sheet, inspector pages, field overlay | Workspace captures and checks |
| E5 | Evidence, Tracker, Windows binary | — |

- E1: `EngineContent/ParticleArchives/ParticleLibrary.toml` is exported from `presets.js` (52 presets, 14 groups, the
  default wind and scene). The packing covers `fillSys`, the refresh constants and the wind components.
- E2: simulation, wind lattice, rendering, light fibres and lensing, compiled by the pinned slangc and stored like
  the other shader sets.
- E3: particle stores, census and probe readbacks; the captures are compared with the prototype's.

Renames for the engine's barred words: *system* → effect, *kind* → `ParticleBehaviour`, *emit* → release,
*frame* → refresh, buffers → stores, *pass* → dispatch or rasterization.

## 7. Open points

- Authored flow sources in the GPU cloud records (funnels for authored tornadoes) — after the owner sees the field.
- The proposed cascades (4 × 128² × 32) are budgeted and drawn; the GPU lattice itself comes with the particles.
