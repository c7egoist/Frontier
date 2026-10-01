# Project-Drive ownership wiring

## Runtime ownership

`Frontier.exe` owns the shared window, device, renderer, editor, input exchange, global camera facilities, celestial
presentation, and GPU/CPU Surfel GI. `ProjectDrive.dll` owns only Project-Drive semantics: course construction,
vehicle simulation, driver interpretation, chase-camera requests, and vehicle panel declarations.

The project starts through:

```text
Frontier.exe Projects/Project-Drive/ProjectDrive.frontier
```

`ProjectDrive.frontier` supplies the content root, opening scene, optional code image, interchange number, and
interface fingerprint. Its paths are resolved relative to the specification; they never borrow Project-Zero content.

## Code-image edge

`ProjectDriveInterchange.cpp` exports `ConstructProjectInterchange`. The host validates the record size, interchange
number, and interface fingerprint before it invokes project callbacks. The edge uses only C-layout records and function
references. The host retains Vulkan, ImGui, window, swapchain, allocator, and thread ownership.

Project callbacks receive the display-cycle duration and read-only input readings, and may request scene mutation,
camera configuration, shared render preferences, panels, and diagnostics. The host decides how those requests join its
shared facilities.

## Build ownership

The authoritative PowerShell route compiles all shared translation units exactly once into `Frontier.exe`, then links
`ProjectDrive.dll` from its narrow project batch. `ProjectDrive.cmake` mirrors that ownership. A drive code-image edit
must not cause the Frontier host source list to recompile.

The former `DriveExecution.cpp` route is retired. Do not restore a project `main`, a project-owned window, or a
Project-Zero source include.
