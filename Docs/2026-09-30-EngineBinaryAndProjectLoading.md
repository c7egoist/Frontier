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

## Open questions to resolve when we do the change

- **Project format / extension** — what `ProjectZero.<ext>` actually is: a manifest (scene + content + config) plus a
  registration entry point, versus a loadable module.
- **Project-specific C++** — static project modules linked into the engine at build time, or dynamic plugins the engine
  loads at runtime. This decides the entry/registration seam a project implements.
- **Host refactor** — extract the reusable window/Vulkan/editor host out of `GameExecution.cpp` into the engine binary
  so projects stop depending on Project-Zero for the host.
- 🔴 **Toolchains** — this reshapes the build. When implemented, update **every** toolchain together, MSVC first
  (PowerShell orchestration), then `Module.toml`/orchestration, then any CMake/g++ helpers — per the build rule.

## What is NOT changing yet

Nothing in the build is changed by this note. Current standalone project executables keep working until the engine
binary + project-loading seam is designed and landed.
