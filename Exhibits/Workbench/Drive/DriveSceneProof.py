#!/usr/bin/env python3
"""Build and run the Project-Drive CPU-reference proof suite.

Every image and telemetry artefact is written beneath Exhibits/Gallery/Drive.  This runner never claims its
headless CPU mirrors are native Frontier Vulkan, Slang, or ImGui output.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKBENCH = ROOT / "Exhibits/Workbench/Drive"
GALLERY = ROOT / "Exhibits/Gallery/Drive"
OVERLAY = ROOT / "VehiclePhysics/Overlay"
DRIVE_SOURCE = WORKBENCH / "DriveSceneProof.cpp"
XPBD_SOURCE = WORKBENCH / "XPBDTyreProof.cpp"
SHEETS_SOURCE = WORKBENCH / "DriveEvidenceSheets.py"
COURSE_SOURCE = OVERLAY / "Projects/Project-Drive/Source/DriveCourse.h"
CONTROL_MESH = OVERLAY / "Projects/Project-Drive/Source/ControlVehicleMesh.inl"
XPBD_SOURCE_ENGINE = OVERLAY / "Engine/PhysicalDynamics/Vehicle/XPBDSoftTyre.cpp"
TELEMETRY_SOURCE = OVERLAY / "Projects/Project-Drive/Source/DriveTelemetry.cpp"
VEHICLE_DIR = OVERLAY / "Engine/PhysicalDynamics/Vehicle"
VEHICLE_SOURCES = [
    VEHICLE_DIR / "VehicleSolver.cpp", VEHICLE_DIR / "VehicleGeometry.cpp", VEHICLE_DIR / "Aerodynamics.cpp",
    VEHICLE_DIR / "XPBDSoftTyre.cpp", VEHICLE_DIR / "PacejkaMagicFormula.cpp", VEHICLE_DIR / "TyreSlipDynamics.cpp",
    VEHICLE_DIR / "Drivetrain.cpp",
]
OUTPUTS = [
    "ProjectDriveAutomotiveMaterials_CPU_Reference.png",
    "ProjectDriveSurfelGI_CPU_Reference.png",
    "ProjectDriveReSTIR_CPU_Reference.png",
    "ProjectDriveXPBDTyreDeformation_CPU_Reference.png",
    "ProjectDrivePhysicsMotion_CPU_Reference.png",
    "ProjectDriveVehicleEditor_CPU_Reference.png",
    "ProjectDrivePhysicsTelemetry_CPU_Reference.csv",
    "ProjectDrivePhysicsRun_CPU_Reference.txt",
    "ProjectDrivePhysicsTiming_CPU_Reference.txt",
]


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str]) -> dict[str, object]:
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    print(completed.stdout, completed.stderr)
    if completed.returncode:
        raise RuntimeError(f"{' '.join(command)} exited with {completed.returncode}")
    return {"command": command, "exit": completed.returncode, "output": completed.stdout + completed.stderr}


def compile_binary(label: str, source: Path, extra_sources: list[Path] = [], optimization: str = "-O2",
                   include_paths: list[Path] = []) -> Path:
    binary = GALLERY / f".{label}"
    run(["g++", "-std=c++20", "-Wall", "-Wextra", "-Werror", optimization, "-pthread",
         *[f"-I{rel(path)}" for path in include_paths], rel(source), *[rel(item) for item in extra_sources],
         "-o", rel(binary)])
    return binary


def render_scene(binary: Path, name: str, mode: str, frames: int, eye: tuple[float, float, float],
                 look: tuple[float, float, float], fov: float) -> dict[str, object]:
    return run([rel(binary), "--out", rel(GALLERY), "--name", name, "--render-mode", mode, "--frames", str(frames),
                "--w", "960", "--h", "540", "--eye", *map(str, eye), "--look", *map(str, look), "--fov", str(fov)])


def run_suite() -> None:
    GALLERY.mkdir(parents=True, exist_ok=True)
    for obsolete in ("ProjectDriveOpening_CPU_Mirror.png", "ProjectDriveBodyFlakes_CPU_Mirror.png", "DriveScenePreview.png", "DriveSceneSurfelGi.png"):
        (GALLERY / obsolete).unlink(missing_ok=True)

    reports: list[dict[str, object]] = []
    release = compile_binary("DriveSceneProof-Release", DRIVE_SOURCE)
    reports.append({"build": "release", "compile": "passed"})
    reports.append({"material_closeup": render_scene(release, "ProjectDriveAutomotiveMaterials_CPU_Reference", "surfel", 24,
                                                       (-3.2, -3.0, 1.4), (0.2, 0.0, 0.45), 42.0)})
    reports.append({"surfel_gi": render_scene(release, "ProjectDriveSurfelGI_CPU_Reference", "surfel", 28,
                                                (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})
    reports.append({"restir_di": render_scene(release, "ProjectDriveReSTIR_CPU_Reference", "restir", 1,
                                                (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})
    release.unlink(missing_ok=True)

    debug = compile_binary("DriveSceneProof-Debug", DRIVE_SOURCE, optimization="-O0")
    reports.append({"build": "debug", "compile": "passed", "smoke": render_scene(debug, ".ProjectDriveDebugSmoke", "surfel", 4,
                                                                                         (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})
    debug.unlink(missing_ok=True)
    (GALLERY / ".ProjectDriveDebugSmoke.png").unlink(missing_ok=True)

    xpbd = compile_binary("XPBDTyreProof", XPBD_SOURCE, [XPBD_SOURCE_ENGINE])
    reports.append({"xpbd_tyre": run([rel(xpbd), rel(GALLERY / "ProjectDriveXPBDTyreDeformation_CPU_Reference.png")])})
    xpbd.unlink(missing_ok=True)

    telemetry = compile_binary("DriveTelemetry", TELEMETRY_SOURCE, VEHICLE_SOURCES,
                               include_paths=[VEHICLE_DIR, OVERLAY / "Projects/Project-Drive/Source"])
    temp_physics = GALLERY / ".physics"
    temp_physics.mkdir(exist_ok=True)
    reports.append({"vehicle_physics": run([rel(telemetry), rel(temp_physics)])})
    telemetry.unlink(missing_ok=True)
    shutil.copyfile(temp_physics / "telemetry.csv", GALLERY / "ProjectDrivePhysicsTelemetry_CPU_Reference.csv")
    shutil.copyfile(temp_physics / "run.log", GALLERY / "ProjectDrivePhysicsRun_CPU_Reference.txt")
    shutil.copyfile(temp_physics / "timing.log", GALLERY / "ProjectDrivePhysicsTiming_CPU_Reference.txt")
    reports.append({"physics_sheets": run([sys.executable, rel(SHEETS_SOURCE), rel(temp_physics / "telemetry.csv")])})
    shutil.rmtree(temp_physics)

    inputs = [DRIVE_SOURCE, XPBD_SOURCE, SHEETS_SOURCE, COURSE_SOURCE, CONTROL_MESH, XPBD_SOURCE_ENGINE, TELEMETRY_SOURCE, *VEHICLE_SOURCES,
              ROOT / "FlattenedEngine/Projects/Project-Drive/Source/ProjectDriveInterchange.cpp",
              OVERLAY / "Projects/Project-Drive/Source/DriveSceneAuthor.cpp",
              OVERLAY / "Projects/Project-Drive/Source/VehicleInspectorSequence.h"]
    provenance = {
        "proof": "Project-Drive automotive materials, Surfel GI, ReSTIR-DI mirror, XPBD tyre deformation, vehicle movement and editor state suite.",
        "executionBoundary": {
            "nativeFrontierVulkanSlangImGuiCapture": False,
            "description": "All PNGs are headless CPU references. The Surfel image uses the suite's CPU surfel field. The ReSTIR image is a CPU finite-sun-candidate reservoir mirror, not the native Vulkan/Slang ReSTIR dispatch. The editor sheet is a CPU state reference derived from Project-Drive panel declarations, VehicleInspectorSequence and actual DriveTelemetry, not an ImGui capture."
        },
        "checks": {
            "automotiveMaterials": "Dense finite flakes and separate clearcoat are applied only to MatBodyPaint; glass, plastic, rubber, hub and brake have distinct material IDs.",
            "xpbd": "XPBD proof gates 5 rings x 64 segments, multi-node contact and positive resolved vertical reaction.",
            "physics": "DriveTelemetry runs the real VehicleSolver, XPBDSoftTyre, Pacejka drivetrain, aero and shared DriveCourse heightfield at 240 Hz for 12 seconds.",
            "renderModes": "Separate car images were rendered through the CPU Surfel-GI and CPU ReSTIR-DI-reservoir reference branches."
        },
        "commands": reports,
        "sha256": {rel(path): sha256(path) for path in inputs if path.exists()},
        "outputs": {rel(GALLERY / name): sha256(GALLERY / name) for name in OUTPUTS},
    }
    (GALLERY / "Provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Wrote {len(OUTPUTS)} Drive evidence artefacts and provenance to {rel(GALLERY)}.")


if __name__ == "__main__":
    try:
        run_suite()
    except Exception as error:
        print(f"DriveSceneProof failed: {error}", file=sys.stderr)
        sys.exit(1)
