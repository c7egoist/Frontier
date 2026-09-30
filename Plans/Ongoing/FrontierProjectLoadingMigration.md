# Frontier Project Loading Migration

## Purpose

Make `Frontier.exe` the sole windowed executable. It owns the reusable engine facilities once; it opens a project
from a `.frontier` specification and, when required, a project DLL. `Project-Zero` becomes one project opened by
Frontier, never the executable or source donor for another project.

This document records the selected delivery shape and the ordered work needed to reach it. It does not claim that
`Frontier.exe` exists in this checkout.

## Selected delivery shape

- **One windowed host:** `Frontier.exe` owns the native window, Vulkan device and swapchain, input, global editor,
  rendering, camera facilities, celestial environment, diagnostics, and content-location rules.
- **One project specification:** every project provides `ProjectName.frontier`, which identifies content, opening
  scene, launch configuration, and its optional DLL.
- **One dynamic code image per project:** a project DLL holds only project-specific scene construction, simulation,
  input interpretation, camera behaviour, and editor panels. Changing Project-Drive rebuilds `ProjectDrive.dll`,
  not the shared engine executable.
- **One C ABI across the DLL edge:** no C++ standard-library types, exceptions, allocator ownership, Vulkan
  references, or ImGui records cross the edge. The host validates the ABI number and interface hash before calling
  project code.

The selected route directly removes both current faults: repeated compilation of shared source and a new project
quietly running through Project-Zero.

## Confirmed rendering ownership

The current source confirms that the following are common rendering facilities and belong in `Frontier.exe`:

- cluster culling, the visibility image records, surface resolve, Hi-Z, and presentation;
- the ReSTIR direct and indirect renderer, denoising, tone conversion, and display;
- common camera projection and editor camera controls;
- the celestial environment. `CelestialSequence.cpp` currently sits under Project-Zero and must move into `Engine/`.

The visibility raster is therefore already a common prerequisite of the ReSTIR route; it is not project-specific.

Surfel GI is a required shared GPU and CPU facility. `Engine/DisplayPresentation/SurfelReference.{h,cpp}` is the
Vulkan-free, deterministic shared field oracle (persistent placement, hash-grid gather, and Jacobi running mean);
its scene-measurement callback keeps scene-specific CPU tracing outside the engine. `SurfelReference.cpp`,
`SurfelGI.cpp`, and the render-mode CPU mirror remain fixtures built on the same contract. The GPU side is authored in
`SurfelIrradianceUpdate.slang`, `SurfelCommit.slang`, `SurfelGIResolve.slang`, and `SurfelGIStage`.

The migration must keep the GPU compute route in `Engine/`, wire it through the one Frontier host, and retain the
shared CPU implementation as the deterministic reference. It is not optional and it must not remain
Project-Zero-specific. The GPU route uses the shared visibility images for primary surfaces, persistent world-space
surfels for indirect light, and the existing CWBVH traversal for its rays.

The source snapshot also does not establish a separate moon facility. The extraction must identify the existing
celestial inputs and place any sun, sky, moon, and star presentation used by projects in the engine layer.

## Destination layout

```text
Engine/
    ProjectInterchange/
        ProjectSpecification.h
        ProjectInterchange.h
        CodeInterchange.h
    Host/
        FrontierHost.cpp
Projects/
    Project-Zero/
        ProjectZero.frontier
        Source/ProjectZeroInterchange.cpp
    Project-Drive/
        ProjectDrive.frontier
        Source/ProjectDriveInterchange.cpp
Build/
    Frontier.exe
    ProjectZero.dll
    ProjectDrive.dll
```

`ProjectInterchange` describes project opening in engine-owned terms. `CodeInterchange` is the versioned C ABI for a
DLL loaded by the host. `FrontierHost` is the sole windowed `main` location.

The exact folders will be aligned with the complete Frontier layer arrangement before source movement.
The names above express responsibility; they do not promise a final path in this partial checkout.

## Project specification

Each `.frontier` file is a declarative input, resolved relative to its own location. Its first revision contains:

```toml
[Project]
ProjectName               = "ProjectDrive"
ProjectFormatNumber       = 1
ContentLocation           = "Content"
OpeningScene              = "Content/Scenes/DriveCourse.gltf"
CodeImage                 = "Build/ProjectDrive.dll"
CodeInterchangeNumber     = 1
```

The host accepts a project path from the command line:

```text
Frontier.exe Projects/Project-Zero/ProjectZero.frontier
Frontier.exe Projects/Project-Drive/ProjectDrive.frontier
```

`ContentLocation`, `OpeningScene`, and `CodeImage` never fall back to Project-Zero. A missing file or an incompatible
DLL is a reported refusal with the exact project path and interface number.

## Code-interchange guarantee

A project DLL exposes one C ABI construction entry, `ConstructProjectInterchange`. Its returned interchange contains
only versioned function references and plain C-layout records.

The host supplies read-only access to:

- input readings and display-cycle duration;
- scene creation and scene mutation requests;
- camera requests and rendering preferences;
- editor panel declaration and diagnostic publication;
- project-content paths.

The project supplies callbacks that:

- construct its scene and project-owned simulation;
- advance that simulation for one display cycle;
- publish project editor panels;
- release project-owned resources before the DLL unloads.

Engine facilities retain all Vulkan, ImGui, window, swapchain, allocator, and thread ownership. Project code never
starts a window, creates a second renderer, or reaches into another project's source folder. ABI compatibility is
established with a number, a structure-size check, and a generated interface hash before any callback runs.

## Migration sequence

### 1. Receive the complete Frontier source and build graph

This Slate checkout cannot produce the real executable by itself: `FlattenedEngine/` is a sparse full-file overlay,
Project-Zero has only selected tracked source files, and the complete `Module.toml` plus production dependency graph
are not present. Overlay it on the complete Frontier checkout before editing or building the production host.

### 2. Extract `FrontierHost`

Move reusable window, device, swapchain, input, editor, renderer, camera, content-location, and celestial work from
`Projects/Project-Zero/Source/GameExecution.cpp` into `Engine/`. Replace Project-Zero literals and scene aliases with
`ProjectSpecification` readings. Leave `FrontierHost.cpp` as the only windowed `main` translation unit.

The first visible milestone opens the existing Project-Zero content through:

```text
Frontier.exe Projects/Project-Zero/ProjectZero.frontier
```

The image, editor facilities, and diagnostics must match the current Project-Zero launch before further extraction.

### 3. Convert Project-Zero into a project DLL

Move Project-Zero scene construction, content aliases, and project-only panels behind `ProjectZeroInterchange.cpp`.
It retains its own content and behaviour but loses `main`, window ownership, and direct renderer construction.

No other project may include a Project-Zero source file after this step.

### 4. Convert Project-Drive without copying Project-Zero

Split `DriveExecution.cpp` into project-specific driving code and `ProjectDriveInterchange.cpp`. The drive DLL owns the
course, vehicle sequence, driver interpretation, chase-camera request, and vehicle inspector panels. The shared host
owns the editor, renderer, window, device, and camera facility.

Replace the current `PROJECT_ZERO_SOURCES` reuse in `ProjectDrive.cmake` and the copied source list in
`ToolchainSequence.ps1`. The drive DLL must compile only Drive source plus its declared physics source; it links to
the Frontier interchange import surface rather than compiling Project-Zero or engine renderer translation units.

Project-Drive keeps its headless `DriveTelemetry` and `SurfelReference` executables. The latter is the
deterministic CPU reference for the shared GPU surfel route; neither executable is an alternate windowed
application.

### 5. Retire Project-Tractrix duplication

Remove the Project-Zero-copy route from `DuplicateFromProjectZero.py`. Replace it with a project creation route that
creates only a project specification, project content folders, and a minimal `ProjectInterchange` source file.

A newly created project begins with its own scene and project DLL. It never receives a copied `GameExecution.cpp`, a
windowed `main`, or a Project-Zero source include.

### 6. Align every build route

Make the PowerShell/MSVC route primary:

- `Frontier.exe` compiles every shared engine translation unit once.
- each project DLL compiles only its project translation units;
- a project DLL relink does not compile or relink `Frontier.exe`;
- the Module.toml and orchestration descriptions declare the same ownership;
- any CMake or g++ support route mirrors the same source ownership;
- headless CPU verification targets retain their existing independent launch paths.

The production build must never use the old Project-Zero-derived executable names after the migration completes.

### 7. Add architecture checks and authoring guidance

Add checks that reject:

- a second windowed `main` under `Projects/`;
- `PROJECT_ZERO_SOURCES` inside another project's build description;
- `GameExecution.cpp` copied into another project;
- a project source include that crosses into another project's source folder;
- a project specification whose scene or DLL path resolves through Project-Zero.

Update the project creation guidance and `CLAUDE.md` in the same change so future agents receive the correct rule
before they add a project.

## Completion evidence

The migration is complete only when all of the following hold:

- `Frontier.exe ProjectZero.frontier` and `Frontier.exe ProjectDrive.frontier` open distinct project content;
- both runs expose the same global renderer and editor facilities, while each project exposes only its own panels;
- an edit to Project-Drive recompiles and reloads only `ProjectDrive.dll`;
- a binary inspection and build log show shared engine translation units linked only into `Frontier.exe`;
- Project-Drive contains no Project-Zero source inclusion, copied host source, or windowed entry point;
- the CPU surfel reference and Drive exhibit provenance remain successful;
- a Vulkan-device run records the surfel update, commit, and resolve dispatches and presents their image;
- the GPU image remains within the agreed CPU-reference tolerance for the shared fixture;
- the Project-Zero rendering verification remains successful;
- the new-project route produces a standalone project specification and DLL without copying an existing project.

## Deliberately excluded

This migration does not redesign ReSTIR, visibility raster, physics equations, or project content. It includes the
required GPU and CPU surfel route so the common rendering facilities are built once and opened by `Frontier.exe`
for every project.
