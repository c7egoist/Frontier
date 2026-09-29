# Building on Windows (Visual Studio / MSVC, no CMake)

Two independent things are covered here:

1. **Project-Drive headless tools** — build them with `ToolchainSequence.ps1` (this folder).
2. **The Jolt include fix** for the Project-Zero windowed app that was failing with `C1083` on `RigidBodySolver.cpp`.

---

## 1. Project-Drive headless references

> **These two tools are NOT the editor.** They are headless CPU *verification* tools — they print to the console
> and write files, they never open a window. The drivable editor window (viewport + ImGui + sun/sky + the driving
> scene, "like Project-Zero") is the **`Project-Zero.exe --scene drive`** windowed app: add Project-Drive to the
> Project-Zero build and apply the `GameExecution.cpp` hooks in **`Docs\DriveEditorWiring.md`** (Milestone 1 opens
> the window with your car + course; Milestone 2 makes it drive). Frontier ships every sub-project inside the single
> `Project-Zero` binary and selects the level with `--scene` — there is no separate editor executable.

`ToolchainSequence.ps1` drives `cl.exe` directly (no CMake). It builds two standalone CPU tools that link
**only** the vehicle physics sources plus `Projects\Project-Drive\Source` — no Vulkan, Jolt, ImGui or GLFW:

| Executable            | Sources                                                        | Output (in `Diagnostics\`)               |
|-----------------------|---------------------------------------------------------------|------------------------------------------|
| `DriveTelemetry.exe`  | `DriveTelemetry.cpp` + the 7 `Engine\PhysicalDynamics\Vehicle\*.cpp` | `telemetry.csv`, `timing.log`, `run.log` |
| `SurfelReference.exe` | `SurfelReference.cpp` (single TU)                              | `drive_gi.ppm`, `surfel_timing.log`      |

Run from the repository root:

```powershell
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Configuration Debug
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Rebuild
powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Run:$false   # build only
```

The script imports the MSVC x64 environment from `vcvarsall.bat` automatically (same probe order as
Project-Zero), so you do **not** need a "Developer PowerShell" prompt. Flags mirror the engine standard:
`/std:c++20 /EHsc /permissive- /Zc:__cplusplus /fp:precise /O2 /MD`. Binaries land in
`Projects\Project-Drive\Build\Output\Windows\<Configuration>\`.

> Frontier is a **C++20** codebase (`Engine\ContentInterchange\MaterialDescriptor.h` uses a defaulted
> `operator==`). Do not drop these tools to `/std:c++17` if you later have them include engine content headers.

---

## 2. Project-Zero: `RigidBodySolver.cpp` cannot open `Jolt/Physics/Collision/BodyFilter.h`

```
Engine\PhysicalDynamics\RigidBodySolver.cpp(35): fatal error C1083:
    Cannot open include file: 'Jolt/Physics/Collision/BodyFilter.h'
```

Cause: the Jolt package root (`ExternalPackages\jolt`) is on the **linker** path but is absent from the
**include** list in `Get-IncludePaths` inside `Projects\Project-Zero\Build\ToolchainSequence.ps1`. Jolt
headers are included as `#include <Jolt/...>`, so the compiler needs `ExternalPackages\jolt` as an `/I` root.

Fix — add this one line to the array returned by `Get-IncludePaths` (it sits alongside the other
`$PackageRoot` includes, and matches what the top-level CMake `FRONTIER_ENGINE_INCLUDES` already does):

```powershell
"/I$(Join-Path $PackageRoot 'jolt')"
```

This is a pre-existing Project-Zero issue and is unrelated to Project-Drive — none of the vehicle sources or
the Project-Drive integration TUs include Jolt. The batch aborted on `RigidBodySolver.cpp` before it ever
reached a Vehicle translation unit; once the include path is present, the build proceeds.
