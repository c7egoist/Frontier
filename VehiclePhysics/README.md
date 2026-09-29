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
        ├── Build/DuplicateFromProjectZero.py   # stands up Project-Tractrix + overlays the seam
        ├── Build/ProjectTractrix.cmake         # CMake target registration (duplicate of the Project-Zero target)
        └── Source/ProjectTractrixIdentity.h    # project identity constants
```

> The overlay deliberately does **not** carry a full copy of Project-Zero (~100 files incl. binary content). The script
> reproduces that copy in your own Frontier checkout, then overlays the engine seam on top — deterministic and small.

## How to apply (in your Frontier checkout)

```bash
# from anywhere; pass your Frontier repo root (or let it auto-detect)
python3 /path/to/VehiclePhysics/Overlay/Projects/Project-Tractrix/Build/DuplicateFromProjectZero.py /path/to/Frontier

# then register the target — add ONE line to the top-level CMakeLists.txt, after the Project-Zero block:
#   include("${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Tractrix/Build/ProjectTractrix.cmake")
```

The script (1) copies `Projects/Project-Zero` → `Projects/Project-Tractrix`, (2) overlays the extended
`RigidBodySolver` and the two new physics modules into `Engine/PhysicalDynamics/`, (3) rewrites the project's
user-facing identity strings, and (4) prints the CMake wiring step. It is idempotent; re-run with `--force` to replace an
existing `Project-Tractrix` copy.

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
