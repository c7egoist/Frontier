# Frontier — Agent Instructions

Frontier is a general-purpose, cross-platform editor with reusable engine code.
The legacy migration is complete. Do not treat this as an unfinished 1:1 migration target.

## Mandatory reading — every session

Read all four documents at session start, before naming, formatting, editing, or presenting work.
They are authoritative and override agent defaults within their scope:

- `EngineDocs/AgenticInstuctions/SKILL-Naming.md` — all naming, banned words, and name construction.
- `EngineDocs/AgenticInstuctions/SKILL-formatting.md` — source and document formatting.
- `EngineDocs/AgenticInstuctions/SKILL-Emoji.md` — the only approved emojis and permitted usage.
- `EngineDocs/AgenticInstuctions/SKILL-CompactOutputProtocol.md` — compact output; tables and diagrams over prose.

Report missing rules before affected work. Do not silently skip them or invent exceptions.
These paths remain authoritative until an approved relocation updates every reference.

## Content, formats, and rendering

- Use **Content Directory**, `ContentDirectory`, and `EngineContent/`.
  Do not introduce `AssetDirectory` or `UI/Assets/`.
- Shared fonts belong in `EngineContent/FontArchives/<font name>/`, with the original licence beside each collection.
- Shared SVG content belongs in `EngineContent/Icons/`. Resolve bundled content relative to the executable first;
  launching from another working directory must not hide fonts or pick an unrelated partial collection.
- All engine-authored C++ configuration and serialization formats use **TOML**, decoded/encoded with **toml++**.
  Preserve established schemas and extensions; inspect existing codecs before creating another format.
  `Appearance.toml` stores applied theme/typography; `FontCatalogue.toml` and per-font archive TOMLs describe fonts.
  JSON lock manifests and exhibit reports are automation interchange, not new C++ runtime serialization formats.
  External file formats such as OpenType, SVG, and shaders are not converted into TOML.
- **Vulkan is the primary rendering API. Slang (`.slang`) is the primary shader language.**
  DX11 is permitted for the isolated ImGui display exhibit; it is not a replacement engine-renderer architecture.
  Keep the scene renderer excluded from the current selective UI port.
- **GLFW owns platform windows and input.** Use a no-OpenGL-context window for Vulkan or the DX11 ImGui exhibit.
- Third-party sources belong under the existing ignored `ExternalPackages/`, restored from pinned dependencies.
  Reuse the existing toml++, GLFW, ImGui, and ThorVG dependency setup; do not vendor duplicate copies elsewhere.
- The Control Centre is a top-edge drawer, not a separate floating settings window. Retain the reference's
  trapezoid, travelling sheet, bottom grip, axis-locked drag, and upward swipe/flick dismissal.
  Typography sliders and scroll content retain their pointer ownership; drag the header, quick-card blank space,
  notch, or bottom grip to carry the sheet. GI and renderer settings remain excluded.

## Work and verification

Complete the requested work, run relevant local verification, then deliver results with evidence.
Local builds, tests, focused validation programs, and actual application captures need no separate approval.
Never deliver an implementation as complete without testing it.

| Work                  | Required verification                                             |
|-----------------------|-------------------------------------------------------------------|
| C++ or shaders        | Relevant build and tests; runtime validation where applicable.     |
| UI                    | Relevant tests and actual rendered or interaction evidence.        |
| Behaviour repairs     | Reproduce the defect and verify the repaired behaviour.            |
| Performance claims    | Reproducible measurements, conditions, and comparison results.      |
| Documentation         | Paths, links, structure, consistency, and applicable rule checks.   |
| Plans and analysis    | Verify factual claims against inspected sources; show a report.    |

- Exercise the changed behaviour, not merely unrelated passing tests.
- Add focused validation when existing coverage is insufficient.
- Compilation alone does not establish runtime correctness.
- Progress messages must not imply unfinished work passed verification.
- When blocked, report the command, observed result, missing prerequisites, and remaining checks.
- Mark unavailable checks blocked or not run, never passing. A blocked report is not completed implementation.

## Visible evidence — required with delivery

Every delivery must include an actual image, graph, results table, or concise verification report.
UI appearance claims require actual rendered evidence when capture is supported.
Mockups, generated illustrations, and invented measurements are not validation evidence.
A browser prototype does not prove that the production C++ editor renders the same result.

Retain evidence and its generating code together under `Exhibits/`.
Include reproduction commands, prerequisites, platform, compiler, configuration, tested revision,
and any relevant uncommitted changes. Explain limitations and present the evidence, not just its location.

## Folder ownership and documentation

Follow `Documentation/FolderStructure.md`. Do not invent alternative top-level folders.

| Location                         | Responsibility                                        |
|----------------------------------|-------------------------------------------------------|
| `Engine/`                        | Reusable production code shared across applications.  |
| `UI/Editor/`                     | Production editor UI.                                 |
| `Exhibits/`                      | Validation code, retained results, and proof images.   |
| `Exhibits/EditorMirror/`          | Comparison mirror of the C++ editor UI.                |
| `Experimental/`                  | Prototypes, experimental HTML, and related assets.     |
| `Documentation/Tracker.md`       | Single project progress and violation tracker.        |
| `Documentation/Rules/`           | Project rules; four retained skills remain above.     |
| `Documentation/Plans/Ongoing/`   | Approved active plans.                                |
| `Documentation/Plans/Completed/` | Completed plans, outcomes, and evidence links.         |
| `_ClaudeScratch/`                | Disposable local work; ignored and never committed.    |

Do not put prototypes, captures, reports, or validation-only code in `Engine/`.
Exhibits must reuse production engine code, not independent copies of it.
Keep requested prototype source, assets, and launchers together in `Experimental/`.
Do not delete inherited build, dependency, content, or application folders without an approved migration.
Update the folder map and affected references whenever approved moves change paths.
Maintain one tracker, not per-agent progress reports or competing backlogs.
Keep detailed results in exhibits and link them from the tracker.
Do not silently weaken rules to make a scan pass.

## Scratchpad

Use `_ClaudeScratch/logs/`, `_ClaudeScratch/build/`, and `_ClaudeScratch/tmp/` for disposable material.
Never commit scratch contents or leave the only copy of a deliverable or retained evidence there.
Permanent prototypes go in `Experimental/`; retained validation code and results go in `Exhibits/`.
Respect existing ignored build-output conventions when tools require their own directories.
Do not leave generated output next to source or loose at the root.
Incomplete HTML fragments use a non-`.html` extension such as `.part`.

## Platforms, binaries, and tooling

The user is on Windows. Deliver Windows binaries by default when a binary is requested or part of the task.
Do not build, package, or deliver Linux binaries unless requested.
Never substitute a Linux executable for a Windows deliverable.
If Windows compilation is unavailable, report the blocker; do not claim a Windows binary was verified.

Preserve Windows, Linux, and macOS portability. Android is a future consideration; no Android app is in scope.
Do not download macOS binaries or set up macOS during current work.
MSVC is the user's current compiler, not the only permitted compiler.
GCC/g++, MinGW-w64, or Clang may be used where the repository supports them.
Distinguish locally tested configurations from untested portability expectations.

Use actual repository build instructions and available tooling; do not hard-code developer installation paths.
Isolate platform-specific code from reusable code. Avoid unnecessary Windows-only assumptions.
Use the appropriate host interpreter: Windows command tooling for `.bat`, PowerShell for scripts requiring it,
and Bash for appropriate Linux/macOS commands. Python need not live at a fixed path.

## GitHub Actions — explicit approval required

Always ask before causing a GitHub Actions run unless the user explicitly authorised that run.
This includes dispatches, reruns, and remote operations such as pushes or pull requests that trigger workflows.
Inspect triggers before an authorised remote operation. Never use Actions as an automatic local-test fallback.
Permission to edit or commit locally is not permission to run Actions.
Follow the user's current commit and push instructions; do not infer permission to commit or push.

## Delivery

Follow the compact output skill: short outcome, verification table, visible evidence, exhibit paths,
blockers, untested configurations, and remaining work. Do not substitute confidence or compilation for testing.

### Recovered native Float32 surface maps (2026-10-19)

`VectorSurfaceCompute` writes typed RGBA32F channel maps and separate per-channel contribution masks; coverage/selection
stay RGBA8. `VectorCoverageRasterization` derives the actual storage format from SPIR-V and refuses unsupported Float32
capabilities instead of silently quantizing. The shared PFM writer preserves float bits and emits little-endian,
bottom-first scalar/RGB output. Seven GPU channel assertions pass strict and sanitizer builds; the archive contains
14 actual 32x32 GPU fixture maps/masks with separately authored gold thread and fabric metalness. See
`Exhibits/TextureStudio/NativeSurfaceEvidence.html` and `NativeMaterialApplication.md`.

The retired-slot cache path dispatches and samples the 512×512 Float32 surface output. Texture Workspace now toggles
to the native Pattern panel, persists vector TOML, and submits GPU coverage/selection. Its C++ runner passes 606 checks;
the recorded evidence explicitly does not represent a Windows desktop session. Pattern Float32 outputs remain
unconnected to the PBR material renderer; native 3D application, physical height calibration, user-document export and
Pattern 1:1 parity remain open. GIF previews are 8-bit evidence, not precision checks. Scope remains approximately 68%.

## Upstream and reference branches

| Role                        | Repository and branch                                                                   | Scope                                                                                                          |
|-----------------------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Main integration branch     | `https://github.com/SultanAladin/Frontier/tree/arena/11f31835-frontier`                 | Canonical reusable UI (`PanelDockspace`, `ControlCentrePanel`, `ProjectBrowserPanel`, `ControlKit`) and rules. |
| Reference branch 1          | `https://github.com/streamlinkinbox/Frontier/tree/arena%2F08e7de48-frontier`            | Fence-published GPU facet area/CDF preparation (`FacetCdfPreparation`, `FacetCdfSubmission`) and ULP contract. |
| Reference branch 2          | `https://github.com/streamlinkinbox/Frontier/tree/arena%2F5ec53579-frontier`            | `VK_KHR_ray_query` tier negotiation (`PathReplayRayQuery`), SVGF variance filter, `RecordEditorDescription`.   |
| Reference branch 3          | `https://github.com/egoistm1inbox/Frontier/tree/arena%2F9ce908bc-frontier`              | `LogStream` / `LogStreamPanel`, dual-tier `GTX`/`RTX` design, automotive showcase, and dedicated studios.      |

### Standing post-commit synchronisation rule

- **After every local commit**, immediately fetch and merge the main integration branch
  `https://github.com/SultanAladin/Frontier/tree/arena/11f31835-frontier` into the active working branch so reusable UI
  and engine changes from main stay synchronised automatically without repeating the instruction:
  `git fetch sultan arena/11f31835-frontier && git merge --no-edit sultan/arena/11f31835-frontier`
  (configuring remote `sultan` -> `https://github.com/SultanAladin/Frontier.git` if not yet present).
- Keep commits and post-commit merges local until the user explicitly authorises a remote push, preserving the GitHub
  Actions approval rule above.

## Project Everest — application launch and dual-tier Vulkan illumination

- **Startup flow**: `Frontier` opens in `ProjectBrowserPanel`, where the user selects the target Frontier application
  and opens **Project Everest** (`Frontier/Projects/Project-Everest/ProjectEverest.projectspace` and
  `ProjectEverest.frontier`) into the docked editor workspace (`PanelDockspace` + `ControlCentrePanel` UI theme
  controller + `LogStreamPanel` over `LogRingStore` / `LogCategories`).
- **RTX tier (hardware ray tracing)**: Enabled strictly on RTX-class GPUs advertising
  `VK_KHR_acceleration_structure` and `VK_KHR_ray_query` (`PathReplayRayQuery`). Executes hardware ray-traced direct
  visibility, ReSTIR GI indirect bounce, glass transmission, and glossy/mirror reflections over BLAS/TLAS.
- **GTX and lower-end fallback tier (SDF + BVH reflections)**: First-class non-RT path when hardware ray query is
  absent or disabled. Uses analytical and voxel `SignedDistanceField` raymarching plus `OrientedSurfaceCard` ReSTIR GI
  for indirect illumination and occlusion, paired with `OrderedSoftwareBvh` triangle-BVH compute traversal for
  reflections.
- **GPU execution rule**: Every rendering pass compiles real `.slang` shaders to SPIR-V and dispatches on Vulkan
  `SubmissionOrder` queues; never substitute CPU worker threads or synthetic placeholder SPIR-V words for GPU passes.

## Scene record lifecycle and editor UI architecture

- **Constructor and destructor auto-registration**: Every scene object derives from `RecordEntry`. Constructing an
  instance registers it in `RecordStore` and, in editor/development builds, automatically publishes it into
  `SceneDirectory` (**Outliner**) and binds its `RecordEditorDescription` (**Inspector**). Destroying the instance
  unregisters it from `SceneDirectory`, clears active selection if held, and tears down its Inspector state cleanly.
  Shipping builds compile zero editor UI symbols.
- **Three-tier editor authoring model**:

| Authoring tier                    | Location                                        | Responsibility and examples                                                                                                         |
|-----------------------------------|-------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Reusable engine components        | `Frontier/Engine/Scene/`                        | Ready-made `RecordEntry` components and reusable Inspector cards for standard items (**Sun**, **Sky / Atmosphere**, **Clouds**, **Fog**, **Lights**, **Camera**). |
| User-authored custom inspectors   | `Frontier/Projects/<Project>/Source/`           | Project-specific custom designs (**Vehicle**, **Suspension and Tyre**, **Powertrain**, **Cabin HMI**) authoring bespoke `DescribeEditor(RecordEditorDescription&)` layouts on `ControlKit` and `StackRailControls`. |
| Dedicated domain studios          | `UI/` and `Frontier/Engine/Interface/`          | Docked/modal multi-pane studios sharing `PanelDockspace` and `ControlCentrePanel` for domains beyond a property sheet: **Fracture Studio**, **Fluid / Pyro Studio**, **Particle Studio**, **Cluster Hierarchy Studio**, and **Texture Studio**. |

