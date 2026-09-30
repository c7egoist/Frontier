//============================================================================================================================================
//                                              ENGINE BINARY + PROJECT LOADING — DIRECTION NOTE
//============================================================================================================================================
// 📦 Dated design note (2026-09-30). Records the intended architecture; the change itself is NOT yet done.

# Engine as one binary; projects opened by it

**Status:** 🚧 direction noted — **not yet implemented**. This is a forward decision to build against, not a description
of the current tree. Filed here (dated note, not a README) per the notes policy in `CLAUDE.md`.

## The direction

Build the engine as a **single binary** — `Frontier.exe` — that contains all the **shared systems** compiled once:
sun/sky, physics, rendering, ReSTIR GI, device/swapchain, input, the editor host, and so on. A **project** is then a
thing the engine **opens**, not its own executable:

```
Frontier.exe ProjectZero.<ext>
Frontier.exe ProjectDrive.<ext>
```

The engine boots, reads the named project (its scene, content, configuration, and project-specific code), and runs it.

## Why (and how it fits the existing rules)

- Today each project tends to be a standalone executable that pulls in **Project-Zero's** host (`GameExecution.cpp`)
  for everything — window, Vulkan host, editor, scene loop. That couples every project to Project-Zero and duplicates
  the host per project.
- The governance already says: **shared systems live in `Engine/` and are reused, never copied; each project is
  different and never a copy of another.** One engine binary is the natural conclusion — the shared host/systems are
  compiled **once** into `Frontier.exe`; a project carries only what makes it that project.

## Decisions recorded on 2026-09-30

- **Project specification** — each project uses `ProjectName.frontier`, a declarative file naming its content, opening
  scene, launch configuration, DLL, and interchange number.
- **Project-specific C++** — each project delivers a dynamic DLL through the versioned `CodeInterchange` C ABI. An
  edit to a project rebuilds that DLL without rebuilding `Frontier.exe`.
- **Host extraction** — reusable window, Vulkan, editor, renderer, camera, input, and celestial work move from
  `GameExecution.cpp` into the engine-owned `FrontierHost` executable.
- **Toolchains** — update every build route together: PowerShell/MSVC first, then `Module.toml` and orchestration,
  then any CMake or g++ support route. Shared translation units compile into `Frontier.exe` only.

## Current standing

The implementation is not in this partial Slate checkout. The exact migration sequence, C ABI guarantee, source
ownership, and completion evidence are in
[`Plans/Ongoing/FrontierProjectLoadingMigration.md`](../Plans/Ongoing/FrontierProjectLoadingMigration.md).

Existing standalone project executables remain compatibility paths during migration. They must not be copied or used
as the creation pattern for a new project.
