# C++ Project Browser, Auto-Generated Project Structure & Scoped Frontier Workspace Plan

> **TL;DR:** Double-clicking **`Frontier.exe`** on Windows boots directly into the native **C++20 + Vulkan 1.2/1.3 Project Browser** (`ProjectBrowserPanel`). Creating a new project **`<ProjectName>`** automatically scaffolds a complete user project directory mirroring **`Frontier/`** (`Engine/` with `Engine/UserInterface/`, `Content/`, `Shaders/`, `Binaries/Win64/`), stages required Engine **`.dll`** binaries and `.spv` shaders, and generates three C++20 targets (**`<ProjectName>`**, **`<ProjectName>Editor`**, **`<ProjectName>Shipping`**) inside **`namespace <ProjectName>::*`**. Opening a project exposes capability-filtered hosts — **currently restricted strictly to `Open with Frontier` and `Open with UVWorkspace`** — and launches the updated C++ **Frontier Workspace** (**Outliner + Analytical Shapes + Simplified Sun + 3D Drag-and-Drop + GPU `.slang` TransformGizmo; zero Inspectors and zero bespoke props**).

---

## 1. 🏆 Key Architectural Decisions

*(Legend — Build Modularity / Windows UX / Maintainability: 🔴 = highest/best, 🚩 = moderate, ✔️ = lowest; Complexity: ✔️ = lowest/best)*

### 1.1 Engine `.dll` Packaging & Staging Strategy for User Projects

| Rank | `.dll` Packaging Option | Build Modularity | Windows UX | Complexity | Summary |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 🏆 🥇 | **Option A — Two Shared Engine DLLs (`FrontierEngine.dll` + `FrontierWorkspaceUi.dll`) + Thin Host `.exe`s** | 🔴 | 🔴 | ✔️ | `FrontierEngine.dll` exports portable runtime, codecs, math, geometry, and Vulkan rendering (used by all 3 targets including `<ProjectName>Shipping.exe`); `FrontierWorkspaceUi.dll` exports ImGui/docking/Outliner/Browser UI (linked only by `Editor` & `Development`, stripped from `Shipping`). Both `.dll`s auto-stage into `<ProjectName>/Binaries/Win64/`. |
| 🥈 | **Option B — Monolithic Single `Frontier.dll` Across All Profiles** | ✔️ | 🚩 | ✔️ | Mixes Editor UI symbols into the runtime binary or requires duplicate DLL builds per profile, violating the strict `Shipping` Editor-exclusion rule in `CLAUDE.md` §2.4. |
| 🥉 | **Option C — Granular Per-Domain DLLs (10+ `.dll` files)** | 🚩 | 🚩 | 🔴 | Heavy `__declspec(dllexport)` maintenance across every internal class with slower Windows loader startup. |

💡 **Recommendation:** **Option A (`FrontierEngine.dll` + `FrontierWorkspaceUi.dll`)** — gives every generated user project clean, self-contained Windows `.dll` staging while keeping `<ProjectName>Shipping.exe` 100% free of Editor/ImGui code.

### 1.2 Startup Transition Flow (`Frontier.exe` → Project Browser → Workspace)

| Rank | Launch Routing Architecture | Instant Handoff | Process Isolation | Complexity | Summary |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 🏆 🥇 | **Option A — Unified Single-Window `Frontier.exe` Booting `ProjectBrowserPanel`, Switching In-Place to `Frontier` or `UVWorkspace`** | 🔴 | 🚩 | ✔️ | Double-clicking `Frontier.exe` opens the C++ Project Browser immediately on the active Vulkan swapchain; choosing **Open with Frontier** or **Open with UVWorkspace** transitions smoothly in the same window (while also supporting `--project=<Path> --workspace=frontier|uv` CLI launch). |
| 🥈 | **Option B — Separate `FrontierBrowser.exe` Launching Child Processes (`CreateProcessW`)** | 🚩 | 🔴 | 🚩 | Causes a visible window close/reopen flash and second Vulkan device initialization when opening a project. |

💡 **Recommendation:** **Option A** (with `--project` and `--workspace` CLI arguments also wired so `FrontierUV.exe` and `<ProjectName>Editor.exe` can boot directly into a target project when needed).

---

## 2. 🔍 End-to-End Windows Double-Click Flow

```text
  [ User double-clicks Frontier.exe on Windows ]
                        │
                        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 1. C++ PROJECT BROWSER (1:1 HTML OLED / Dark / Light Design)            │
  │    • Left Rail (204 px): Workspace / Recent / Starred / Projects / UV   │
  │    • Center Grid: Project & Geometry Tiles with GPU-rendered thumbnails │
  │    • Right Reader / Details (302 px): Preview, Levels, Notes, Revisions │
  │    • Actions: [ + New Project ]   [ Open Local... ]   [ Open With ▾ ]   │
  └─────────────────────┬───────────────────────────────────┬───────────────┘
                        │                                   │
          [ + New Project: "<ProjectName>" ]       [ Select Existing Project ]
                        │                                   │
                        ▼                                   │
  ┌─────────────────────────────────────────────┐           │
  │ 2. PROJECT GENERATOR (ProjectScaffolder)    │           │
  │    • Creates <ProjectName>/ mirroring Engine│           │
  │      - Engine/ (+ UserInterface/, Lifecycle)│           │
  │      - Content/ (Geometry, Materials, ...)  │           │
  │      - Shaders/ (.slang starter + domains)  │           │
  │      - SessionOutput/ (Logs, Captures)      │           │
  │    • Generates CMakeLists.txt & 3 targets:  │           │
  │      1) <ProjectName>         (Development) │           │
  │      2) <ProjectName>Editor   (Editor)      │           │
  │      3) <ProjectName>Shipping (Shipping)    │           │
  │    • Generates namespace <ProjectName>::*   │           │
  │    • Copies FrontierEngine.dll,             │           │
  │      FrontierWorkspaceUi.dll & shaders into │           │
  │      <ProjectName>/Binaries/Win64/          │           │
  └─────────────────────┬───────────────────────┘           │
                        └─────────────────┬─────────────────┘
                                          ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 3. CAPABILITY-DRIVEN "OPEN WITH" SELECTOR (WorkspaceCapabilityRegister) │
  │    🟢 Open with Frontier     (Updated C++ World Workspace — default)    │
  │    🟢 Open with UVWorkspace  (C++ Dual-Viewport UV Authoring Workspace) │
  │    🚧 (Future capabilities e.g. GameEngine / TextureStudio hidden now)  │
  └─────────────────────┬───────────────────────────────────┬───────────────┘
                        │                                   │
         [ Open with Frontier ]              [ Open with UVWorkspace ]
                        ▼                                   ▼
  ┌─────────────────────────────────────────┐ ┌─────────────────────────────┐
  │ 4A. UPDATED C++ FRONTIER WORKSPACE      │ │ 4B. C++ UV WORKSPACE        │
  │  • Same dark HTML layout aesthetic      │ │  • Existing UVOutlinerPanel │
  │  • Left C++ Outliner (add, search, eye, │ │  • 3D + 2D UV GPU Viewports │
  │    Simplified Sun ON/OFF, drag reorder) │ │  • 5-Tab UVInspectorPanel   │
  │  • Construct / Shelf: ONLY 6 Analytical │ └─────────────────────────────┘
  │    Shapes + Simplified Sun (NO props)   │
  │  • 3D Viewport: Drag-and-drop onto floor│
  │    + GPU .slang TransformGizmo move/rot │
  │  • 🔴 NO Inspectors yet (omitted clean) │
  └─────────────────────────────────────────┘
```

---

## 3. 🧩 Auto-Generated `<ProjectName>` Folder Structure (1:1 Mirror of `Frontier/`)

When the user enters a project name in **New Project** (for example, **`VehicleStudio`** — sanitized to PascalCase C++ identifier `<ProjectName>`), `ProjectScaffolder` generates the exact Engine-mirrored directory tree below:

### 3.1 Side-by-Side Comparison: `Frontier/` Engine Root vs. Generated `<ProjectName>/` Root

| Engine Repository (`Frontier/`) | Generated User Project (`<ProjectName>/`) | Purpose in User Project |
| :--- | :--- | :--- |
| `CMakeLists.txt` | `CMakeLists.txt` | C++20 build defining `<ProjectName>`, `<ProjectName>Editor`, and `<ProjectName>Shipping` targets linked against Engine `.dll`/`.lib` SDK. |
| *(Engine root)* | `<ProjectName>.ProjectSpace` | Atomic PascalCase project container storing project identity, registered capabilities (`Frontier`, `UVWorkspace`), default world path, and appearance. |
| `Engine/` | `Engine/` | **User-authored C++20 source tree** mirroring the Engine's domain layout under `namespace <ProjectName>::*`. |
| `Engine/Components/` *(Engine UI)* | **`Engine/UserInterface/`** | **Custom user UI components** authored specifically for `<ProjectName>` (kept cleanly separate from Frontier's built-in `Engine/Components/`). |
| `Engine/Configuration/` | `Engine/Configuration/` | Project-specific runtime & startup configuration (`<ProjectName>Configuration.{h,cpp}`). |
| `Engine/Lifecycle/` | `Engine/Lifecycle/` | Auto-generated C++ `Initialize → Tick → Finalize` runtime loop + per-target entry points (`<ProjectName>Launch.cpp`, `<ProjectName>EditorLaunch.cpp`, `<ProjectName>ShippingLaunch.cpp`). |
| `Engine/GeometrySpace/` | `Engine/GeometrySpace/` | User custom analytical/procedural geometry generators. |
| `Engine/MaterialSpace/` | `Engine/MaterialSpace/` | User custom material definitions and surface logic. |
| `Engine/SimulationSpace/` | `Engine/SimulationSpace/` | User world simulation and force logic. |
| `Engine/Workspaces/` | `Engine/Workspaces/` | User custom workspace tools/extensions (Editor-gated). |
| `EngineContent/` | **`Content/`** | **Project asset repository** mirroring `EngineContent/` (`Geometry/`, `Icons/`, `FontsArchives/`, `Materials/`, `Worlds/`, `UV/`, `Graphics/`). |
| `Engine/Shaders/` | **`Shaders/`** | **Project `.slang` shader tree** mirroring `Engine/Shaders/` (`Compute/`, `DirectLighting/`, `GlobalIllumination/`, `MaterialSpace/`, `Visibility/`). |
| `Build/Windows/Release/` | **`Binaries/Win64/`** | Auto-staged **`FrontierEngine.dll`**, **`FrontierWorkspaceUi.dll`**, **`CompiledShaders/`**, plus compiled `<ProjectName>*.exe` binaries. |

### 3.2 Complete Auto-Generated Directory Tree (`Projects/<ProjectName>/`)

*(Shown below using `<ProjectName>` = `VehicleStudio` as a concrete example)*

```text
<DestinationRoot>/VehicleStudio/
├── VehicleStudio.ProjectSpace                      // Root project container (Open-with: Frontier, UVWorkspace)
├── CMakeLists.txt                                  // Auto-generated C++20 project build (3 profile targets)
├── .gitignore                                      // Ignores SessionOutput/, Build/, and transient symbols
│
├── Engine/                                         // 🧩 USER C++20 SOURCE TREE (mirrors Frontier/Engine/)
│   ├── Configuration/
│   │   ├── VehicleStudioConfiguration.h            // namespace VehicleStudio::Configuration
│   │   └── VehicleStudioConfiguration.cpp
│   ├── Lifecycle/
│   │   ├── VehicleStudioRuntimeLifecycle.h         // namespace VehicleStudio::Lifecycle (Initialize/Tick/Finalize)
│   │   ├── VehicleStudioRuntimeLifecycle.cpp
│   │   ├── VehicleStudioLaunch.cpp                 // Entry point for target: VehicleStudio (Development)
│   │   ├── VehicleStudioEditorLaunch.cpp           // Entry point for target: VehicleStudioEditor (Editor)
│   │   └── VehicleStudioShippingLaunch.cpp         // Entry point for target: VehicleStudioShipping (Shipping)
│   ├── UserInterface/                              // 🧩 CUSTOM USER UI COMPONENTS (not Engine core UI)
│   │   ├── VehicleStudioOverlayPanel.h             // namespace VehicleStudio::UserInterface
│   │   └── VehicleStudioOverlayPanel.cpp
│   ├── GeometrySpace/
│   │   └── VehicleStudioPrimitives.h               // namespace VehicleStudio::GeometrySpace
│   ├── MaterialSpace/
│   │   └── VehicleStudioMaterials.h                // namespace VehicleStudio::MaterialSpace
│   ├── SimulationSpace/
│   │   └── VehicleStudioWorldStep.h                // namespace VehicleStudio::SimulationSpace
│   └── Workspaces/
│       └── VehicleStudioWorkspaceHook.h            // namespace VehicleStudio::Workspaces (#if FRONTIER_PROFILE_EDITOR)
│
├── Content/                                        // 🧩 USER CONTENT REPOSITORY (mirrors Frontier/EngineContent/)
│   ├── Geometry/                                   // .GeometrySpace assets
│   ├── Icons/                                      // Custom project vector SVG icons
│   ├── FontsArchives/                              // Custom project .FontSpace typefaces
│   ├── Materials/                                  // .MaterialSpace surface presets
│   ├── Worlds/
│   │   └── MainWorld.WorldSpace                    // Default analytical world scene opened by Frontier
│   ├── UV/
│   │   └── MainSurface.UVSpace                     // Default UV session opened by UVWorkspace
│   └── Graphics/                                   // .ImageSpace textures & .VectorSpace graphics
│
├── Shaders/                                        // 🧩 USER .SLANG SHADERS (mirrors Frontier/Engine/Shaders/)
│   ├── Compute/
│   ├── DirectLighting/
│   ├── GlobalIllumination/
│   ├── MaterialSpace/
│   │   └── VehicleStudioSurface.slang              // Starter user .slang shader module
│   └── Visibility/
│
├── Binaries/                                       // 🧩 AUTO-STAGED ENGINE DLLS & OUTPUT EXECUTABLES
│   └── Win64/
│       ├── FrontierEngine.dll                      // Staged core Engine runtime DLL (all profiles)
│       ├── FrontierWorkspaceUi.dll                 // Staged Engine UI/Workspace DLL (Editor & Development)
│       ├── CompiledShaders/                        // Staged Engine SPIR-V (.spv) shaders
│       ├── EngineContent/                          // Staged/linked core fonts & icons for standalone run
│       ├── VehicleStudio.exe                       // Produced when building target VehicleStudio
│       ├── VehicleStudioEditor.exe                 // Produced when building target VehicleStudioEditor
│       └── VehicleStudioShipping.exe               // Produced when building target VehicleStudioShipping
│
└── SessionOutput/                                  // Local diagnostic logs, captures, and generated thumbnails
    ├── Logs/
    └── Captures/
```

---

## 4. 🧩 Auto-Generated C++ Targets, Namespaces & Main Loops

### 4.1 Generated CMake Targets (Derived Automatically from `<ProjectName>`)

| Target Name | Active Profile Macro | Subsystem / Entry | Linked Engine DLLs | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`<ProjectName>Runtime`** *(Library)* | Per-target | Shared sources in `Engine/**` (excluding `*Editor*` in Shipping) | `FrontierEngine.dll` | Compiles user code in `Engine/Configuration`, `Engine/Lifecycle`, `Engine/UserInterface`, `Engine/GeometrySpace`, `Engine/MaterialSpace`, `Engine/SimulationSpace`. |
| **`<ProjectName>Editor`** | `FRONTIER_PROFILE_EDITOR=1` | `Engine/Lifecycle/<ProjectName>EditorLaunch.cpp` | `FrontierEngine.dll` + `FrontierWorkspaceUi.dll` | Launches `<ProjectName>` directly inside the Frontier Editor workspace with custom `Engine/UserInterface/` & `Engine/Workspaces/` registered. |
| **`<ProjectName>`** | `FRONTIER_PROFILE_DEVELOPMENT=1` | `Engine/Lifecycle/<ProjectName>Launch.cpp` | `FrontierEngine.dll` + `FrontierWorkspaceUi.dll` | Standalone developer runtime loop with assertions, diagnostics, and custom `Engine/UserInterface/` active, without Editor authoring panels. |
| **`<ProjectName>Shipping`** | `FRONTIER_PROFILE_SHIPPING=1` | `Engine/Lifecycle/<ProjectName>ShippingLaunch.cpp` (`WIN32`) | **`FrontierEngine.dll` only** | Stripped production executable (`-O2 /DNDEBUG`, zero Editor/ImGui symbols) running the pure `<ProjectName>::Lifecycle` main loop on Vulkan + `DesktopPlatformWindow`. |

### 4.2 Generated Namespace Convention

Every generated header/source uses sanitized PascalCase **`<ProjectName>`** as its root namespace, mirroring Frontier's internal domain namespaces:

```cpp
namespace <ProjectName>
{
    namespace Configuration   { struct <ProjectName>StartupParameters; }
    namespace Lifecycle       { class  <ProjectName>RuntimeLifecycle;  }
    namespace UserInterface   { class  <ProjectName>OverlayPanel;      }
    namespace GeometrySpace   { /* Custom project geometry */          }
    namespace MaterialSpace   { /* Custom project materials */         }
    namespace SimulationSpace { /* Custom project simulation */        }
    namespace Workspaces      { /* Editor-only workspace extensions */ }
}
```

### 4.3 Auto-Generated Main Loop Skeleton (`<ProjectName>RuntimeLifecycle` + `*Launch.cpp`)

- **`<ProjectName>RuntimeLifecycle.{h,cpp}`** implements Frontier's standard **`Initialize() → Tick(double Δt) → Finalize()`** contract on top of `Frontier::Lifecycle::RuntimeLifecycle`, mounting `<ProjectName>/Content/Worlds/MainWorld.WorldSpace` and ticking `<ProjectName>::SimulationSpace` + `<ProjectName>::UserInterface`.
- **`<ProjectName>ShippingLaunch.cpp`** auto-generates the standalone Windows/cross-platform main loop (`WinMain` / `main`) creating `DesktopPlatformWindow("<ProjectName>", 1920u, 1080u)`, initializing `VulkanInterchange` + `TieredWorldRenderSequence`, stepping `<ProjectName>RuntimeLifecycle::Tick(Δt)` until window close, and calling `Finalize()`.

---

## 5. 🧩 C++ Project Browser & Scoped C++ Frontier Workspace Specification

### 5.1 C++ Project Browser (`Engine/Editor/Browser/` — First Screen of `Frontier.exe`)

| Feature Area | Exact Behavior in C++ |
| :--- | :--- |
| **Executable Entry** | `Frontier.exe` boots straight into `ProjectBrowserPanel` unless `--project=<Path>` is passed on the command line. |
| **Visual Design** | Matches `Experimental/ProjectBrowser/` 1:1: three-column aligned layout (`204 px` left rail, fluid center tile grid, `302 px` right reader/details pane, `64 px` headers, collapsible rails, OLED / Dark / Light theme selector). |
| **Capability Registry (`WorkspaceCapabilityRegister`)** | Queries registered host workspaces. **Active capabilities in this build:**<br>1. **`Frontier`** (*Open with Frontier* — World Workspace)<br>2. **`UVWorkspace`** (*Open with UVWorkspace* — UV Authoring Workspace)<br>*(Architecture supports registering `GameEngine`, `TextureStudio`, etc. later without refactoring).* |
| **New Project Flow** | Modal / inline creation sheet: Project Name (`<ProjectName>`), Location picker (OS native folder dialog on Win32 `IFileOpenDialog` + manual path input), Template (`Blank Analytical Project`), and **Create & Open in Frontier** button invoking `ProjectScaffolder`. |
| **Return to Browser** | Top bar in both `Frontier` and `UVWorkspace` includes a **Projects** button returning cleanly to the Project Browser or opening another `.ProjectSpace`. |

### 5.2 Scoped C++ Frontier Workspace (Matching Updated HTML Design — Strict Boundaries)

| Workspace Element | Included Now (`🟢`) / Deferred (`🔴`) | Details |
| :--- | :---: | :--- |
| **Updated HTML Visual Aesthetic** | 🟢 **Included** | Dark `#151515` / `#0e0e0e` surfaces, crisp `1 px` `#ffffff12` borders, `#ffb454` selection bar, Inter/DM Sans `.FontSpace` typography, top workspace bar (`Project Name`, `Construct +`, `Transform Mode W/E/R`, `Projects` button). |
| **Left C++ Outliner (`WorldOutlinerPanel`)** | 🟢 **Included** | Search filter, category filter chips, `+` / `Construct` analytical shape insertion, visibility eye toggle, **Simplified Sun ON/OFF power switch**, `F2` rename, `Delete` removal, drag reorder, and 1:1 selection sync with the 3D viewport. |
| **Analytical Shapes ONLY** | 🟢 **Included** | **Box (Cube)**, **Sphere**, **Cylinder**, **Cone**, **Torus**, and **Floor Plane** — rendered with analytical/procedural thumbnails and GPU `.slang` shading. |
| **Bespoke Multi-Part Studio/Track Props** | 🔴 **Excluded (Per User Direction)** | Zero multi-part cameras/fans/barriers/cones ported to C++; reserved for upcoming custom prop system. |
| **Simplified Sun** | 🟢 **Included** | Matches the simplified HTML Sun: single Outliner Sun entry with quick azimuth/elevation direction + intensity + angular diameter + Outliner **ON/OFF** toggle. |
| **3D Drag-and-Drop & Viewport Moving** | 🟢 **Included** | Drag any analytical shape from the Construct palette / bottom shelf directly into the 3D viewport with live Z-up (`+Z`) floor-surface raycast preview; select any shape in 3D via GPU `.slang` pick and translate / rotate / scale it with the GPU `.slang` `TransformGizmo` (`W` / `E` / `R`) + Unreal-style RMB + WASD Z-up camera. |
| **Right-Hand Inspector Panels** | 🔴 **Excluded (Per User Direction)** | **No right-hand Inspector column yet** — viewport expands cleanly across the full right area (`Outliner | Full 3D Viewport`) until the dedicated C++ Inspector design turn. |

---

## 6. 🏁 Implementation & GitHub Actions Windows Build Sequence (Next Turn Upon Approval)

1. **Step 1 — Shared DLL Split & Export Macros (`CMakeLists.txt`, `Engine/Configuration/ExportConfiguration.h`)**:
   - Configure `FrontierEngine` (`SHARED` `.dll` on Windows) + `FrontierWorkspaceUi` (`SHARED` `.dll` for non-Shipping) + unified **`Frontier`** (`Frontier.exe`) and **`FrontierUV`** (`FrontierUV.exe`) executables.
2. **Step 2 — `ProjectScaffolder` & Auto-Generated `<ProjectName>` Template (`Engine/Configuration/ProjectScaffolder.{h,cpp}`)**:
   - Implement PascalCase identifier sanitizer, Engine-mirrored directory creator (`Engine/`, `Engine/UserInterface/`, `Content/`, `Shaders/`, `Binaries/Win64/`, `SessionOutput/`), CMake/C++20 source emitter (`<ProjectName>`, `<ProjectName>Editor`, `<ProjectName>Shipping` + `namespace <ProjectName>::*`), and `.dll` + `CompiledShaders` staging.
3. **Step 3 — Native C++ `ProjectBrowserPanel` & `WorkspaceCapabilityRegister` (`Engine/Editor/Browser/`)**:
   - Port the 3-column HTML Project Browser into C++20/ImGui with Win32 native folder picker, New Project generator, and capability selector showing **`Open with Frontier`** and **`Open with UVWorkspace`**.
4. **Step 4 — Scoped C++ Frontier Workspace (`Engine/Workspaces/World/`)**:
   - Build the Inspector-free 2-column C++ Frontier Workspace matching the HTML theme: C++ Outliner, 6 analytical shapes only, simplified Sun with ON/OFF toggle, drag-and-drop floor placement, and GPU `.slang` `TransformGizmo` translation/rotation/scaling.
5. **Step 5 — `Exhibits/` Validation & Visual `.png` Proofs + GitHub Actions Windows Build (`.github/workflows/windows-frontier-build.yml`)**:
   - Verify locally via CTest + offscreen `.png` visual proofs (`ProjectBrowserValidation`, `FrontierWorkspaceValidation`), push to `arena/429d7dc7-frontier`, trigger the Windows x64 GitHub Actions workflow, verify green build, and publish the portable **`Frontier-Windows-x64.zip`** artifact ready to unzip and double-click **`Frontier.exe`** on Windows.
