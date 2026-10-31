# Project Everest — Editor UI & Dual-Tier Vulkan GPU Renderer Plan

🧩 Active roadmap for porting the VehicleHMI exhibit (Outliner, Observatory Inspectors, Dedicated Studios, and dual-tier
RTX/GTX ReSTIR GI + reflections) into native C++ / Vulkan / Slang on Frontier.

Status: 🟡 Active — Phase 1A (`Project Browser -> Select Application -> Project Everest -> Docked Outliner + LogStream + ControlCentre`)
verified. Phase 1B currently has shared Engine records and an initial native Inspector rendering, but **is not 1:1 VehicleHMI
parity** and must not pass the UI gate yet. The first C++ Inspector was over-clustered in `SceneInspectorPanel.cpp` and
its visuals/control groups diverge from the source; treat captures `07`–`12` as implementation progress only, not proof of
port fidelity. The strict 1:1 source is `Experimental/VehicleHmiPrototype/` at Sultan branch
`arena/e9bd7db5-frontier`, inspected revision `6afb6f00b5f25c45f7cda92c7da65b64845768f3`, with the checked-in
mechanical control/label inventories in `Frontier/Projects/Project-VehicleHmiDemo/Contract/`. The strict source audit and separate per-domain module split are now established. The Solar panel is the first source-mapped
implementation in progress: it has the reference's four tabs, date/time/location and colour/optics controls, source-matched
celestial calculations, and regression assertions; its native layout/style/interaction parity still needs review, and it
is **not** accepted as 1:1 yet. Folder, Lens Flare, Clouds, Wind, and Atmosphere remain prototype screens pending their own
source-driven ports. The UI gate remains blocked on all six domain checklists, exact visible/control/interaction parity,
mutation tests, and rendered review. Do not begin Phase 2 Vulkan renderer work before this gate passes.

---

## 1. Standing Rules & Branch Topology

| Role | Branch | Purpose |
| :--- | :--- | :--- |
| Canonical upstream | `SultanAladin/Frontier` (`arena/11f31835-frontier`) | Reusable UI (`PanelDockspace`, `ControlCentrePanel`, `ProjectBrowserPanel`, `ControlKit`) + rules. |
| Reference 1 | `streamlinkinbox/Frontier` (`arena/08e7de48-frontier`) | GPU `FacetCdfPreparation` / `FacetCdfSubmission` + ULP visibility-reuse guards. |
| Reference 2 | `streamlinkinbox/Frontier` (`arena/5ec53579-frontier`) | `PathReplayRayQuery` (`VK_KHR_ray_query` <-> `OrderedSoftwareBvh`), SVGF `PathReplayVarianceFilter`, blocked-NEE guard. |
| Reference 3 | `egoistm1inbox/Frontier` (`arena/9ce908bc-frontier`) | `LogStream`, `SceneDirectory`, `RecordEntry`, dual-tier `GTX`/`RTX` design, automotive/weather inspectors. |

- 🔴 **Lifecycle & loop naming (`SKILL-Naming.md` §6)**: Application and simulation lifecycles follow
  **`Initialize -> Loop -> Finalize`** (`ExecuteApplicationLoop`, `AdvanceWorkspaceLoop`, `PrimaryViewport`). Never name
  engine loops, classes, variables, or active branches `Main` / `MainLoop` / `main`.
- 🔴 **Post-commit synchronisation**: After every local commit, run
  `git fetch sultan arena/11f31835-frontier && git merge --no-edit sultan/arena/11f31835-frontier`. Never push to
  `origin` without explicit user approval.

---

## 2. Three-Branch Audit Summary

| Branch | Verified Strengths | Identified Gaps | Synthesis Decision |
| :--- | :--- | :--- | :--- |
| `08e7de48` | Vulkan Slang -> SPIR-V compute (`16` CTests / `20,535` checks); GPU facet CDF cuts area evals `25,656,526 -> 466`. | Lacks `VK_KHR_ray_query` hardware RT and GTX SDF + card GI fallback; `348.05 MiB` uncompressed reservoir bank. | Reuse `FacetCdfPreparation` / `FacetCdfSubmission` + ULP visibility checks. |
| `5ec53579` | Vulkan Slang -> SPIR-V `PathReplayRayQuery` (`VK_KHR_acceleration_structure` + `VK_KHR_ray_query` <-> `OrderedSoftwareBvh`), SVGF variance filter, blocked-NEE guard. | `added-only temporal1` residual `-7.74%` (`temporal4` `-1.35%`); lacks GPU facet CDF cache and GTX SDF + card GI fallback; basic slider-only inspector. | Reuse as primary GPU ray-query + SVGF spine. |
| `9ce908bc` | `LogStream` + `SceneDirectory` + `RecordEntry`; dual-tier `SdfRestirPortalMirror.slang` (`Tier 0` GTX SDF + `3x3` `OrientedSurfaceCard` GI + BVH reflections; `Tier 1` RTX full RT); rich inspector concepts. | `SceneRenderer.cpp` runs on CPU `std::thread`s; `VulkanShaderCompiler.h` emits placeholder SPIR-V; bypasses Project Browser; `Entity`/`FrameGraph` naming violations. | Reuse `LogStream` + `SceneDirectory`; port GTX SDF + card GI to real Slang -> SPIR-V GPU `SubmissionOrder` units; port VehicleHMI observatory UI cleanly into `Engine/`. |

---

## 3. Editor UI Port Plan (Before Vulkan Renderer Work)

### 3.1 Automatic Constructor / Destructor Lifecycle (`Frontier/Engine/Scene/`)
- Constructing any `RecordEntry` subclass issues a `RecordToken`, inserts into `RecordStore`, registers in
  `SceneDirectory` (**Outliner**), and binds its `RecordInspectorDescriptor` in `RecordInspectorRegistry` (**Inspector**).
- Destroying the `RecordEntry` unbinds its `RecordInspectorDescriptor` and unregisters from `SceneDirectory` and
  `RecordStore` in deterministic reverse order.

### 3.2 Phase 1B — Global Engine Environment & Folder UI (`Frontier/Engine/Scene/` + `Frontier/Engine/Interface/`)
Shared globally across **all** Frontier projects (not project-local), porting the VehicleHMI observatory / optical-workbench
designs and `SourceImages/Folder UI/` folder telemetry cards with live `ControlCentrePanel` theme bindings:

| Global Engine System | Engine Record (`Frontier/Engine/Scene/`) | Ported VehicleHMI / Engine UI Surface (`Frontier/Engine/Interface/`) |
| :--- | :--- | :--- |
| **Folders** | `FolderRecord` (`RecordClassification::Folder`) | Outliner stepped chamfered folder rows, subfolder nesting, + Folder Inspector (`Big Numbers` telemetry, nested classification distribution bars, visibility tick scale, badge/accent swatches). |
| **Sun** | `SunRecord` | Solar Observatory (`Overview` polar Alt/Az dome + presets + `Sunlight`/`Sun disc`/`Day cycle` tiles, `Daylight` 24h altitude curve + rise/set, `Light & colour` Planck blackbody spectrum + Kelvin/RGB, `Disc & optics` angular disc + Lens Flare link). |
| **Lens Flare** | `LensFlareRecord` (nested under `Sun`) | Camera-Optics Editor (live procedural composite banner with draggable source + `Compose`, `Ghosts` optical-axis reflection guide, `Halo` annular cross-section, `Rays & streaks` blade/anamorphic mixer). |
| **Clouds** | `CloudLayerRecord` | Cloud Observatory (`Overview` FBM density diagnostic atlas + 2D `Coverage × Density` pad, `Formation` vertical density envelope + ceiling clip + scatter, `Rendering` pixel share + shadow controls, `Weather` shared-wind link). |
| **Wind** | `WindFieldRecord` | Shared Forcefield Instruments (`Flow` interactive compass rose + streamlines + `FROM °` bearing, `Variability` two-sine gust envelope + XYZ turbulence traces, `Altitude` 6-level 0–3 km shear/veer vector ladder, `Receivers` linked advection routing). |
| **Atmosphere** | `AtmosphereRecord` | Optical Workbench (`Overview` live `AtmosphereModel` panoramic sky-view capture + 2D `Molecular × Aerosol` pad, `Medium` Rayleigh/Mie/Ozone altitude curves, `Light response` RGB solar transmittance strips, `Baking` `TransmittanceLut` bake status). |

### 3.2.1 Strict 1:1 port contract and per-domain implementation

The table above is a feature map, **not permission to redesign the source**. Port from the original authored screen and its behavior; preserve exact words, section order, component arrangement, visible values, control ranges, interactions, and state transitions. Any unavoidable native-toolkit mismatch must be called out explicitly and approved before changing the visible/interaction contract—do not silently substitute an inspired-by treatment. Use reference revision `6afb6f00b5f25c45f7cda92c7da65b64845768f3` (Sultan `arena/e9bd7db5-frontier`) and the checked-in `UiControlInventory.tsv`, `UiLabels.tsv`, `FileInventory.tsv`, and original `SourceImages/`.

Keep **one docked Inspector shell** for selection and theme integration, but split content into independently owned and testable domain renderers under `Frontier/Engine/Interface/Inspectors/`:

| Native panel module | Source-of-truth UI entry points (at the reference revision) | Required verification |
| :--- | :--- | :--- |
| `FolderInspectorPanel` | `SourceImages/Folder UI/` (four source captures); folder telemetry/Outliner reference | Capture overlay; all folder controls and subtree mutation |
| `SolarInspectorPanel` | `Source/SunInspectorDashboard.js`, `Style/SunInspector.css`, shared native controls and inspector navigation | 1:1 section/label/control inventory; date, presets, tabs, keyboard and edit mutations |
| `LensFlareInspectorPanel` | `Source/NativeFlarePanel.js` and its worker/kernel dependencies | Source drag, preset changes and every optical control |
| `CloudInspectorPanel` | `Source/CloudInspectorDashboard.js`, `Source/NativeCloudPanel.js`, `Style/CloudInspector.css` | Density/formation/render/weather interactions and all linked state |
| `WindInspectorPanel` | `Source/NativeWindPanel.js`, `Style/WindInstruments.css` | Compass pointer/key controls, bearing, variability, altitude and receiver routes |
| `AtmosphereInspectorPanel` | `Source/AtmosphereInspectorDashboard.js`, atmosphere dashboard style and shared bake controls | Rayleigh/Mie/Ozone, RGB response, explicit bake and every source label |

`SceneInspectorPanel` must become the thin docked shell/dispatcher, not the home for all six domain layouts. Retain shared primitives in a narrow presentation layer; do not force domain-specific cards, charts, navigation, or interactions into a generic combined template. For each panel, retain a checklist mapping every source control/label to its C++ implementation and test. Rendered captures count as evidence only after their domain checklist and interaction tests pass.

### 3.3 Phase 1C — Custom Project Inspectors & Dedicated Domain Studios
1. **User-Authored Custom Inspectors (`Frontier/Projects/Project-Everest/Source/`)**:
   - **Everest Vehicle Inspector** (`Chassis`, `DualMotorAllWheel` powertrain, suspension/tyre continuum parameters, and live **Cabin HMI** instrument readouts) registered via `RecordInspectorRegistry`.
2. **Dedicated Domain Studios (`UI/Editor/` + `Frontier/Engine/Interface/`)**:
   - **Fracture Studio** (Voronoi cell authoring, impulse threshold curve, cluster hierarchy preview).
   - **Fluid Studio** (gas/smoke/liquid domain, vorticity/buoyancy solver, march budget).
   - **Particle Studio** (emitter stack rail, spawn/force/collision sequence, GPU precipitation coupling).

---

## 4. Phase 2 — Native Vulkan Slang GPU Renderer Plan (After UI Gate)

1. **`SubmissionOrder` & `TransientTargetAtlas`** — real Slang -> SPIR-V Vulkan compute/rasterization pipeline (`Initialize -> Loop -> Finalize`).
2. **RTX Tier (`VK_KHR_acceleration_structure` + `VK_KHR_ray_query`)** — hardware BLAS/TLAS direct visibility, ReSTIR GI indirect bounce, dielectric glass transmission, and ray-traced reflections (`PathReplayRayQuery` + `FacetCdfPreparation` + `PathReplayVarianceFilter`).
3. **GTX & Lower-End Tier (`SignedDistanceField` + `OrderedSoftwareBvh`)** — toroidal/analytic SDF + `3x3` `OrientedSurfaceCard` ReSTIR GI + software triangle-BVH reflections, requiring zero hardware RT extensions.
4. **Environment Coupling** — bind `SunRecord`, `LensFlareRecord`, `CloudLayerRecord`, `WindFieldRecord`, and `AtmosphereRecord` directly to GPU uniform/LUT submissions and validate both `RTX` and `GTX` tiers with rendered exhibits.
