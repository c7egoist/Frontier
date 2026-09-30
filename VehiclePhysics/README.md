# VehiclePhysics — GRIT → Frontier vehicle port (Project-Tractrix)

This directory is the **Phase 0** deliverable for porting `SultanAladin/GRIT`'s vehicle physics into
`SultanAladin/Frontier-` (Jolt). It contains a path-mirrored overlay of the Frontier engine plus a script that stands up
the new host project. Read `PortPlan.md` first for the full plan and the phase gates.

## Layout

```
VehiclePhysics/
├── PortPlan.md                          # plan of record, phases, validation gate, locked decisions
├── README.md                            # this file — what's here and how to apply it
└── Overlay/                             # path-mirrors the Frontier repo root; apply on top of a checkout
    ├── Engine/PhysicalDynamics/
    │   ├── RigidBodySolver.h            # ORIGINAL, extended in place with the Phase-0 Jolt seam
    │   ├── RigidBodySolver.cpp          #   (StepOnce, forces, queries, casts, heightfield, distance-spring)
    │   ├── VehiclePhysicsThread.h/.cpp  # NEW: dedicated fixed-rate physics thread + lock-free GT↔PT conduits
    │   └── XPBDTyreSolver.h/.cpp        # NEW: soft-body (rigid-XPBD) tyre ring skeleton
    └── Projects/Project-Tractrix/
        ├── Build/CreateProjectSpecification.py # creates a specification + C ABI code-image starting point
        ├── Build/ProjectTractrix.cmake         # CMake code-image registration
        ├── ProjectTractrix.frontier             # Frontier.exe opening specification
        └── Source/ProjectTractrixInterchange.cpp # project code-image entry
```

## How to apply (in your Frontier checkout)

```bash
# create an independent project shape without copying an existing project
python3 /path/to/VehiclePhysics/Overlay/Projects/Project-Tractrix/Build/CreateProjectSpecification.py Project-Example --root /path/to/Frontier
```

Project-Tractrix and every newly created project are opened by `Frontier.exe ProjectName.frontier`. The shared window,
device, renderer, editor, camera, input, celestial environment, and GPU/CPU Surfel-GI facilities remain engine-owned;
the project C ABI code image carries only project semantics.

## What was verified

The two new pure-C++ modules were compiled (`-std=c++17 -O2 -Wall -Wextra`, zero warnings) and run against a mock solver
in the sandbox:

- **VehiclePhysicsThread** — 240 Hz for 300 ms produced exactly 72 fixed steps, 0 dropped, realtime ratio 1.000; clean
  start/stop/join.
- **XPBDTyreSolver** — a loaded ring dropped onto flat ground settles, keeps its nodes at/above the surface (no
  sink-through over 2 s), and transmits a correctly-signed upward reaction to the hub.

`RigidBodySolver.cpp` uses Jolt 5.6.x headers and compiles only inside the Frontier tree (Jolt is not in the sandbox);
it was written against the existing file's own idioms and the Jolt 5.6.x API. See `PortPlan.md` for the frame/units
conventions (notably the +Z-up heightfield wrap) and the Phase-0 caveat that the XPBD tyre stiffness is not yet
calibrated.
