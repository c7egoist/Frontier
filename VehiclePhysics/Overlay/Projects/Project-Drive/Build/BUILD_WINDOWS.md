# Building Project-Drive — its OWN standalone windowed app

Project-Drive is a **separate executable** (`Project-Drive.exe`), a sibling of Project-Zero — **not** a `--scene`
mode of it. It has its own entry point (`Projects\Project-Drive\Source\DriveExecution.cpp` → `int main`), opens its
own visible window, generates and loads its own scene (`DriveCourse`), and lets you drive. It compiles the
Project-Zero renderer/editor translation units straight into itself as shared code (so it is a full ReSTIR editor with
viewport + outliner + inspectors + sun/sky), but it never launches or links against the Project-Zero binary.

> **Overlay note.** This folder is an *overlay* dropped onto a checkout of the Frontier engine. The two build entry
> points below live here; the only thing you touch in the engine tree itself is the **one-line CMake include** in
> §3 (Windows needs no engine-tree edit at all).

---

## 1. Windows (MSVC, no CMake) — `ToolchainSequence.ps1`

This is the primary Windows path. It drives `cl.exe` / `link.exe` directly and is a fork of Project-Zero's own
windowed toolchain script, with the entry point swapped to `DriveExecution.cpp` and the vehicle/scene/camera layer
added. From the **repository root**:

```powershell
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1                 # Release build + does not run
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Run            # build then launch the window
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Configuration Debug -Run
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Rebuild -Run
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Development:$false   # ship build: editor compiles out
```

* Imports the MSVC x64 environment from `vcvarsall.bat` automatically (same probe order as Project-Zero) — no
  "Developer PowerShell" prompt required.
* Flags mirror the engine standard: `/std:c++20 /EHsc /permissive- /Zc:__cplusplus /fp:precise` plus `/O2 /MD`
  (Release) or `/Zi /MDd` (Debug).
* Compiles the full Vulkan + Slang + ImGui + editor stack, lowers the shader table to SPIR-V, and links
  `vulkan-1 / glfw3dll / thorvg / Jolt`.
* Output: `Projects\Project-Drive\Build\Output\Windows\<Configuration>\Binary\Project-Drive.exe`, and a mirror at
  `Build\Project-Drive.exe` so `.\Build\Project-Drive.exe` runs from the repository root.

The script needs the same locked dependencies Project-Zero uses (`python3 Tools\Bootstrap.py`, Vulkan SDK on
`VULKAN_SDK`). It reuses Project-Zero's prebuilt GLFW/ThorVG/Jolt if present.

---

## 2. Linux (CMake) — `ToolchainSequence.sh`

For IDE integration / Linux desktops. Requires the one-line CMake include from §3 first. From anywhere:

```bash
Projects/Project-Drive/Build/ToolchainSequence.sh                 # configure + build (Release) + run
RUN=0 Projects/Project-Drive/Build/ToolchainSequence.sh           # build only
CONFIG=Debug Projects/Project-Drive/Build/ToolchainSequence.sh
```

It runs `cmake --build <dir> --target Project-Drive` and launches the binary from the repository root.

---

## 3. CMake integration — one line in the root `CMakeLists.txt`

`ProjectDrive.cmake` defines the standalone `Project-Drive` target by cloning the `PROJECT_ZERO_SOURCES` batch,
removing `GameExecution.cpp`, and adding `DriveExecution.cpp` + the drive layer + the vehicle physics `.cpp`s. It
mirrors every Project-Zero target property (definitions, include dirs, link libraries, the `ReSTIRViewportSpirv`
dependency, icon staging).

Add **one line at the very end** of the engine's root `CMakeLists.txt` — after the `Project-Zero` target, the `Jolt`
library, Vulkan/GLFW/ThorVG, `ReSTIRViewportSpirv`, and the `FRONTIER_*`/`EXT`/`IMGUI_*` variables are all defined:

```cmake
include(Projects/Project-Drive/Build/ProjectDrive.cmake)
```

Then configure and build the target as usual:

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target Project-Drive -j
```

No other engine-tree edit is required; the SIMD/per-file source properties Project-Zero sets are source-scoped in the
same directory and are inherited by the shared translation units automatically.

---

## 4. Driving

The window opens with the editor camera looking down the course. Controls:

| Key            | Action                                                             |
|----------------|-------------------------------------------------------------------|
| **P**          | Toggle **Play** (drive the car) / **Edit** (fly the editor camera) |
| **W / S**      | Throttle / brake-reverse (Play mode)                              |
| **A / D**      | Steer left / right (Play mode)                                    |
| **Space**      | Handbrake (Play mode)                                             |
| **Left-Shift / Left-Ctrl** | Shift up / down                                      |
| **R**          | Reset the car to the spawn pose                                   |
| **WASD + RMB** | Fly / steer the editor camera (Edit mode)                        |

In Play mode the fly camera becomes a chase camera that trails the chassis; in Edit mode it is a free editor camera.
On first launch the app generates `Projects\Project-Drive\Content\Scenes\DriveCourse.gltf` (flat plane + grid/checker
+ ramp + speed bumps + the car). Delete that file to regenerate it after changing `DriveSceneAuthor::Construct()`
(the revision counter also invalidates a stale file automatically).
