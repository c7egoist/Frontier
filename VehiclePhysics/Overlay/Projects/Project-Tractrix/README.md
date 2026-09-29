# Project-Tractrix

A duplicate of **Project-Zero** (the "Project-Zero | ReSTIR GI" sphere-grid showcase) repurposed as the host for the
GRIT → Frontier vehicle-physics port. The name refers to the **tractrix** — the curve a towed point traces behind a
moving one, the classic idealisation of a trailing/castered wheel's steer geometry.

This folder in the deliverable holds only the *new* pieces; the bulk of the project (Source, Content, Shaders, Host, …)
is produced by copying Project-Zero with `Build/DuplicateFromProjectZero.py`.

## New / changed here
- `Build/DuplicateFromProjectZero.py` — copies Project-Zero → Project-Tractrix, overlays the Phase-0 vehicle seam into
  `Engine/PhysicalDynamics/`, and rewrites the project's display identity.
- `Build/ProjectTractrix.cmake` — the CMake target (a duplicate of the Project-Zero target with the two new vehicle TUs
  appended and the executable renamed). Include it from the top-level `CMakeLists.txt`.
- `Source/ProjectTractrixIdentity.h` — project identity constants + Phase-0 physics-thread defaults.

See `../../PortPlan.md` and `../../README.md` (in the `VehiclePhysics/` deliverable root) for the full plan and apply
instructions.
