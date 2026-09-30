//============================================================================================================================================
//                                              ENGINE BINARY + PROJECT LOADING — DIRECTION NOTE
//============================================================================================================================================
// 📦 Dated architecture note (2026-09-30) for Frontier.exe project opening and code-image ownership.

# Engine as one binary; projects opened by it

**Status:** 🚧 source migration delivered; build and device execution remain pending explicit authorization and a complete
toolchain.

## The runtime shape

`Frontier.exe` is the sole windowed host. It reads a `ProjectName.frontier` stream, resolves content and opening-scene
locations relative to that stream, optionally loads a project code image, then brings up the shared window, device,
renderer, editor, input, camera, celestial, and GPU/CPU Surfel-GI facilities once.

```text
Frontier.exe Projects/Project-Zero/ProjectZero.frontier
Frontier.exe Projects/Project-Drive/ProjectDrive.frontier
```

A project is therefore content and project behaviour opened by the engine, not a second executable. Project-Zero is one
such project and is no longer the source batch or runtime donor for Project-Drive or a new project.

## Code-image edge

A project image exports `ConstructProjectInterchange`, the versioned C ABI declared in
`Engine/ProjectInterchange/ProjectInterchange.h`. The host requires an exact interchange number, interface fingerprint,
and structure size before invoking project code. Only C-layout records and C function references cross this edge:

- the host provides project paths, display-cycle duration, read-only input readings, scene mutation receptions, camera
  requests, rendering preferences, panel declarations, and diagnostic publication;
- project code provides construction, per-cycle simulation, and retirement callbacks;
- no C++ standard-library record, exception, allocator ownership, Vulkan reference, or ImGui record crosses the edge.

ProjectZero and ProjectDrive have independent `.frontier` streams and image construction entries. A Project-Drive image
relink does not name shared Frontier translation units in CMake or the primary PowerShell batch.

## Authoring rule

A new project starts with a project specification and a minimal C ABI image. The standalone creator is
`Projects/Project-Tractrix/Build/CreateProjectSpecification.py`; it does not copy `GameExecution.cpp`, an existing
project source tree, a renderer, an editor, or a windowed entry. `Tools/Build/ProjectOwnershipChecks.py` records the
static gates that prevent those boundaries from returning.

## Current evidence boundary

This source delivery wires the ownership and build descriptions but has not been built or run in this session: the
repository instruction requires authorization before a build, probe, or verification executable is started, and the
local environment lacks the Windows/Vulkan toolchain. Runtime proof still requires a Windows device run that opens both
specifications, shows common shared facilities, and records the shared GPU Surfel dispatches against the CPU reference.
