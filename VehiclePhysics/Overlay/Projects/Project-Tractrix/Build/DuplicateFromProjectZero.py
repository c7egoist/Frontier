#!/usr/bin/env python3
"""
DuplicateFromProjectZero.py — stand up Project-Tractrix from Project-Zero inside a Frontier checkout.

Why a script (not a committed copy): Project-Zero is ~100 files including binary content (MoonTextures, icons,
    Sponza fetch state). Copying all of that into the Slate deliverable repo would be wasteful and would rot; instead
    this reproduces the duplication deterministically in the user's own Frontier tree, then overlays the Phase-0
    vehicle physics seam on top.

What it does, idempotently:
  1. Locate the Frontier repo root (arg, $FRONTIER_ROOT, or auto-detect by the PROJECT_ZERO_SOURCES marker).
  2. Copy  Projects/Project-Zero  ->  Projects/Project-Tractrix   (skips if present unless --force).
  3. Overlay the extended Jolt seam + new vehicle modules from this deliverable's Overlay/ tree into Engine/.
  4. Rewrite the project's display identity (window title, project name, bootstrap logs) to "Project-Tractrix".
  5. Drop the CMake registration snippet next to the copy and print the two-line manual wiring step.

Run:
    python3 DuplicateFromProjectZero.py [/path/to/Frontier] [--force]
"""

import argparse
import os
import re
import shutil
import sys
from pathlib import Path

OLD_PROJECT = "Project-Zero"
NEW_PROJECT = "Project-Tractrix"

# New engine translation units this port adds (relative to the Frontier root). RigidBodySolver.{h,cpp} are the
#    byte-exact originals *extended in place* with the Phase-0 seam, so they overwrite; the rest are brand new.
OVERLAY_ENGINE_FILES = [
    "Engine/PhysicalDynamics/RigidBodySolver.h",
    "Engine/PhysicalDynamics/RigidBodySolver.cpp",
    "Engine/PhysicalDynamics/VehiclePhysicsThread.h",
    "Engine/PhysicalDynamics/VehiclePhysicsThread.cpp",
    "Engine/PhysicalDynamics/XPBDTyreSolver.h",
    "Engine/PhysicalDynamics/XPBDTyreSolver.cpp",
]

# Display-identity rewrites: only the strings a player/dev sees. Include/asset paths are left pointing at the shared
#    engine; the duplicated project keeps its own Source/ include dir (added by the CMake snippet).
IDENTITY_REWRITES = [
    # (file relative to the NEW project root, literal old -> literal new)
    ("Source/GameExecution.cpp",   'Project-Zero  |  ReSTIR GI  |  Frontier Engine',
                                    'Project-Tractrix  |  Vehicle Physics  |  Frontier Engine'),
    ("Source/GameExecution.cpp",   'Project-Zero windowed ReSTIR renderer starting.',
                                    'Project-Tractrix windowed vehicle showcase starting.'),
    ("Source/GameExecution.cpp",   'ControlCentre.AssignProjectName("Project-Zero");',
                                    'ControlCentre.AssignProjectName("Project-Tractrix");'),
    ("Source/CpuReferenceMain.cpp", 'Project-Zero showcase starting.',
                                     'Project-Tractrix showcase starting.'),
    ("Source/CpuReferenceMain.cpp", 'Project-Zero showcase completed.',
                                     'Project-Tractrix showcase completed.'),
]

OVERLAY_ROOT = Path(__file__).resolve().parents[3]      # Build -> Project-Tractrix -> Projects -> Overlay


def find_frontier_root(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    if os.environ.get("FRONTIER_ROOT"):
        candidates.append(Path(os.environ["FRONTIER_ROOT"]).expanduser().resolve())
    # Walk upward from CWD looking for the marker.
    here = Path.cwd().resolve()
    for parent in [here, *here.parents]:
        candidates.append(parent)
    for c in candidates:
        cml = c / "CMakeLists.txt"
        if cml.is_file() and "PROJECT_ZERO_SOURCES" in cml.read_text(errors="ignore"):
            return c
    raise SystemExit(
        "could not locate the Frontier repo root — pass it explicitly:\n"
        "    python3 DuplicateFromProjectZero.py /path/to/Frontier"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Duplicate Project-Zero into Project-Tractrix + overlay the vehicle seam.")
    ap.add_argument("frontier_root", nargs="?", help="Path to the Frontier checkout (default: auto-detect).")
    ap.add_argument("--force", action="store_true", help="Overwrite an existing Projects/Project-Tractrix.")
    args = ap.parse_args()

    root = find_frontier_root(args.frontier_root)
    print(f"[Tractrix] Frontier root : {root}")
    print(f"[Tractrix] overlay root  : {OVERLAY_ROOT}")

    src_project = root / "Projects" / OLD_PROJECT
    dst_project = root / "Projects" / NEW_PROJECT
    if not src_project.is_dir():
        raise SystemExit(f"missing source project: {src_project}")

    # 1) Copy the project tree.
    if dst_project.exists():
        if not args.force:
            print(f"[Tractrix] {dst_project} already exists — skipping copy (use --force to replace).")
        else:
            print(f"[Tractrix] --force: removing existing {dst_project}")
            shutil.rmtree(dst_project)
    if not dst_project.exists():
        print(f"[Tractrix] copying {src_project}  ->  {dst_project}")
        shutil.copytree(src_project, dst_project)

    # 2) Overlay the vehicle engine files.
    for rel in OVERLAY_ENGINE_FILES:
        src = OVERLAY_ROOT / rel
        dst = root / rel
        if not src.is_file():
            print(f"[Tractrix] WARNING: overlay file missing, skipped: {src}")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"[Tractrix] overlaid {rel}")

    # 2b) Overlay any Project-Tractrix-specific sources shipped in the deliverable (identity header, etc.).
    overlay_project_src = OVERLAY_ROOT / "Projects" / NEW_PROJECT / "Source"
    if overlay_project_src.is_dir():
        for f in sorted(overlay_project_src.iterdir()):
            if f.is_file():
                shutil.copy2(f, dst_project / "Source" / f.name)
                print(f"[Tractrix] added Source/{f.name}")

    # 3) Rewrite display identity.
    for rel, old, new in IDENTITY_REWRITES:
        target = dst_project / rel
        if not target.is_file():
            print(f"[Tractrix] note: identity target absent, skipped: {rel}")
            continue
        text = target.read_text(errors="ignore")
        if old in text:
            target.write_text(text.replace(old, new))
            print(f"[Tractrix] identity rewrite in {rel}")
        else:
            print(f"[Tractrix] note: identity string not found (already patched?): {rel}: {old!r}")

    # 4) Point out the CMake wiring.
    snippet = Path(__file__).with_name("ProjectTractrix.cmake")
    print("\n[Tractrix] Done. Final manual step — register the target in the top-level CMakeLists.txt:")
    print(f"    include(\"${{CMAKE_CURRENT_SOURCE_DIR}}/Projects/{NEW_PROJECT}/Build/ProjectTractrix.cmake\")")
    print(f"    (add that line after the Project-Zero block; the snippet is at {snippet.name},")
    print(f"     copied into Projects/{NEW_PROJECT}/Build/ by this run if present in the overlay.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
