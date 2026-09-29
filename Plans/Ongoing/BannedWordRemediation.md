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
| 2 — vehicle dynamics core (class API) | `VehicleController.{h,cpp}` → `VehicleSolver.{h,cpp}`; `VehicleControllerConfig`→`VehicleSolverConfiguration`; `SetInput`→`AssignInput`; `IsBuilt`→`Constructed`; `DrivingModel`→`DrivingLayer` (field `Model`→`ActiveLayer`); `SlipSolverKind`→`SlipSolverSelection`. 17 referencing files + BOTH build lists (`ProjectDrive.cmake`, `ToolchainSequence.ps1`) updated | 🟢 done — g++ syntax-clean |
| 3 — powertrain subsystems | `Drivetrain.{h,cpp}`, `PacejkaTyreModel.{h,cpp}` (`Model`), `TyreSlipDynamics::SetSolver`, `BrakingSystem` (`UseBrakeThermalModel` bool `Use` prefix + `Model`), tyre models | ⬜ pending |
| 5 — formatting pass | banner emoji `📦`→`🧩` (~20 vehicle files); internal snake_case members (`config_`,`input_`,…)→PascalCase; single-letter params (`v`,`c`,`dt`) | ⬜ deferred |
| 3 — instance / scene seams | `VehicleInstanceSequence`, `DriveSceneStructure`, `ChaseCameraSolver` | 🚧 |
| 4 — our identifiers in the copied host | `DriveExecution.cpp` (`IsDrive`→`DriveSelected`, etc.) | 🚧 |
| 5 — formatting pass | 142/122 rulers, `///` annotation blocks, aligned columns, emoji whitelist across the authored layer | 🚧 |

## Build sync

Pure identifier renames do not move files, so the `Build/ProjectDrive.cmake` and `Build/ToolchainSequence.ps1` source
lists are unaffected. When a **file** is renamed (Phase 1 renamed two header files), update every place that names it —
including the MSVC `ToolchainSequence.ps1` and any `Module.toml`, not only CMake/g++. Header-only files are not in the
source lists, so Phase 1 needed only a comment fix in `ProjectDrive.cmake`.

## Phase 2 decision (resolved)

`VehicleController` → **`VehicleSolver`** (solves the coupled longitudinal/lateral/yaw dynamics). `VehicleIntegrator`
was considered and rejected. Applied across all 17 referencing files and both build lists. `Step`/`Build`/`SlipSolver`
were kept — they are not on the banned list (`SlipSolver` uses the approved `Solver` suffix).

## Deferred to the formatting pass (Phase 5)

Items found during Phase 2 but out of the banned-**word** scope: the `📦` file-banner emoji (used consistently across
~20 vehicle files — whitelist allows `🧩`), internal trailing-underscore snake_case members, and single-letter params.
Batched together so the diff is one mechanical style sweep rather than scattered noise across feature phases.
