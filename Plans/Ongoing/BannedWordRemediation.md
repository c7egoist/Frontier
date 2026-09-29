# Banned-Word & Naming Remediation

Bring authored code into line with `AgenticInstuctions/SKILL-Naming.md` and `SKILL-Formatting.md`. Tiered so we fix
what we own without permanently diverging the copied Frontier engine code from upstream.

## Scope tiers

| Tier | What | Action |
|------|------|--------|
| 1 | Code we authored — the vehicle dynamics layer (`Engine/PhysicalDynamics/Vehicle/*`, GRIT-derived) and the Project-Drive / Project-Tractrix seams | Fix fully (naming + formatting) |
| 2 | Upstream-copied host (`DriveExecution.cpp` derived from `GameExecution.cpp`, `RigidBodySolver.cpp`) | Fix only identifiers **we** added; leave inherited names to avoid diverging from Frontier |
| 3 | Vendor (Jolt, ImGui, Vulkan) | Exempt — vendor spellings are verbatim |

## Clarifications

- 🔴 `Ordinal` is **not** banned — `SlotOrdinal` / `RecordingOrdinal` are approved recording-cycle vocabulary. The
  banned word is `Ordinates` (a mathematical coordinate); there are **zero** in the tree. The lone `Ordinal` hit,
  `QueryHousingOrdinal()`, is compliant.
- `Controller`, `Bridge`, `Manager`, `Model` (as a container), `flag`, `state`, `value`, `Config` (shorthand) are the
  high-frequency banned tokens in the authored layer. `Update`, `Get`, `Set` are banned verbs.
- Booleans drop `is` / `has` / `can` / `have` and state the property as a noun phrase (`ThrottleKeyDown`, not
  `bHasThrottle`). `IsKeyPressed` / `IsMouseButtonPressed` are the **engine `InputExchange` API** (Tier 3-adjacent),
  not ours to rename.

## Standing rename decisions

| Retired | Replacement | Reason |
|---------|-------------|--------|
| `VehicleInputController` | `DriverInputIntegrator` | `Controller` banned; it accumulates/ramps input over Δτ (Integrator) |
| `VehicleInputBridge` | `DriverInputExchange` | `Bridge` banned; it crosses the device→engine input edge (Exchange) |
| `InputConfig` | `InputConfiguration` | Zero shorthand |
| `InputDevice` (enum) | `InputDeviceCategory` | Matches engine `…Category` enum convention |
| `Get*` | `Query*` / `Read*` / `Access*` | CRUD verb banned |
| `Set*` (config) | `Assign*` / `Apply*` | CRUD verb banned |
| `Set*Key` / `Set*Axis` | `Forward*Key` / `Forward*Axis` | States the mechanism (forwards a device reading) |
| `Update(dt)` | `Advance(Δτ)` | `Update` banned; delta-time uses the real glyph `Δτ` |
| `k…` / `a…` member prefixes | full PascalCase noun phrases | Zero shorthand, zero `k` prefixes |

## Phases

| Phase | Files | Status |
|-------|-------|--------|
| 1 — driver input layer | `DriverInputIntegrator.h` (was `VehicleInputController.h`), `DriverInputExchange.h` (was `VehicleInputBridge.h`) + callers (`DriveExecution.cpp`, `VehicleInstanceSequence.h`, `TractrixVehicleScene.h`, `VehicleInputTests.cpp`) | 🟢 done — g++ syntax-clean |
| 2 — vehicle dynamics core | `VehicleController.{h,cpp}` (`Controller`→`VehicleSolver`?), `AssignInput` for `SetInput`, `Drivetrain.{h,cpp}`, tyre models | 🚧 next |
| 3 — instance / scene seams | `VehicleInstanceSequence`, `DriveSceneStructure`, `ChaseCameraSolver` | 🚧 |
| 4 — our identifiers in the copied host | `DriveExecution.cpp` (`IsDrive`→`DriveSelected`, etc.) | 🚧 |
| 5 — formatting pass | 142/122 rulers, `///` annotation blocks, aligned columns, emoji whitelist across the authored layer | 🚧 |

## Build sync

Pure identifier renames do not move files, so the `Build/ProjectDrive.cmake` and `Build/ToolchainSequence.ps1` source
lists are unaffected. When a **file** is renamed (Phase 1 renamed two header files), update every place that names it —
including the MSVC `ToolchainSequence.ps1` and any `Module.toml`, not only CMake/g++. Header-only files are not in the
source lists, so Phase 1 needed only a comment fix in `ProjectDrive.cmake`.

## Open naming question for Phase 2

`VehicleController` is the biggest ripple (`Controller` banned, referenced across the whole layer + both projects).
Candidate: `VehicleSolver` (solves the coupled longitudinal/lateral/yaw dynamics) or `VehicleIntegrator` (time-steps
the state). Decide before executing Phase 2 to avoid a second rename.
