#!/usr/bin/env python3
"""Build and run the Project-Drive CPU-reference proof suite.

Every image, GIF, graph, telemetry and provenance artefact is written beneath Exhibits/Gallery/Drive.
The render artefacts are CPU mirrors driven by the checked-in Project-Drive course, vehicle mesh, physics
telemetry and C-ABI declarations; they are not claimed to be native Frontier Vulkan/Slang/ImGui captures.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
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
    "ProjectDriveVisibilityRaster_CPU_Reference.png",
    "ProjectDriveAutomotiveMaterials_CPU_Reference.png",
    "ProjectDriveMaterialAngleFront_CPU_Reference.png",
    "ProjectDriveMaterialAngleRear_CPU_Reference.png",
    "ProjectDriveSurfelGI_CPU_Reference.png",
    "ProjectDriveReSTIR_CPU_Reference.png",
    "ProjectDriveXPBDTyreDeformation_CPU_Reference.png",
    "ProjectDrivePhysicsMotion_CPU_Reference.png",
    "ProjectDriveTelemetryGraphs_CPU_Reference.png",
    "ProjectDriveDrivingFollow_CPU_Reference.gif",
    "ProjectDriveDrivingCourse_CPU_Reference.gif",
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


def compile_binary(label: str, source: Path, extra_sources: list[Path] | None = None, optimization: str = "-O2",
                   include_paths: list[Path] | None = None) -> Path:
    extra_sources = extra_sources or []
    include_paths = include_paths or []
    binary = GALLERY / f".{label}"
    run(["g++", "-std=c++20", "-Wall", "-Wextra", "-Werror", optimization, "-pthread",
         *[f"-I{rel(path)}" for path in include_paths], rel(source), *[rel(item) for item in extra_sources],
         "-o", rel(binary)])
    return binary


def render_scene(binary: Path, name: str, mode: str, frames: int, eye: tuple[float, float, float],
                 look: tuple[float, float, float], fov: float, width: int = 960, height: int = 540,
                 out_dir: Path = GALLERY, pose: tuple[float, float, float, float] | None = None) -> dict[str, object]:
    command = [rel(binary), "--out", rel(out_dir), "--name", name, "--render-mode", mode, "--frames", str(frames),
               "--w", str(width), "--h", str(height), "--eye", *map(str, eye), "--look", *map(str, look),
               "--fov", str(fov)]
    if pose is not None:
        command.extend(["--vehicle-pose", *map(str, pose)])
    return run(command)


def load_telemetry(path: Path) -> list[dict[str, str]]:
    return list(csv.DictReader(path.open()))


def row_yaw(rows: list[dict[str, str]], index: int) -> float:
    a = rows[max(0, index - 3)]
    b = rows[min(len(rows) - 1, index + 3)]
    dx = float(b["x"]) - float(a["x"])
    dy = float(b["y"]) - float(a["y"])
    return math.atan2(dy, dx) if abs(dx) + abs(dy) > 1.0e-4 else 0.0


def row_pose(rows: list[dict[str, str]], index: int) -> tuple[float, float, float, float]:
    row = rows[index]
    # DriveSceneProof's rest mesh used z = 0.2486 when DriveTelemetry spawned the chassis at z = 0.42.
    return (float(row["x"]), float(row["y"]), float(row["z"]) - 0.1714, row_yaw(rows, index))


def render_drive_gif(binary: Path, rows: list[dict[str, str]], name: str, indices: list[int], mode: str,
                     camera: str) -> dict[str, object]:
    frame_dir = ROOT / "_AgentScratch/tmp/drive_gif_frames" / name
    shutil.rmtree(frame_dir, ignore_errors=True)
    frame_dir.mkdir(parents=True, exist_ok=True)
    commands: list[dict[str, object]] = []
    for frame_number, index in enumerate(indices):
        row = rows[index]
        x, y, z = float(row["x"]), float(row["y"]), float(row["z"])
        if camera == "follow":
            eye = (x - 7.0, y - 5.0, z + 2.4)
            look = (x + 2.8, y, z + 0.25)
            fov = 52.0
        else:
            eye = (x - 11.0, -9.0, 4.8)
            look = (x + 4.0, 0.0, 0.55)
            fov = 48.0
        commands.append(render_scene(binary, f"frame_{frame_number:02d}", mode, 1, eye, look, fov,
                                     width=520, height=292, out_dir=frame_dir, pose=row_pose(rows, index)))
    frames = [frame_dir / f"frame_{i:02d}.png" for i in range(len(indices))]
    target = GALLERY / f"{name}.gif"
    commands.append(run(["convert", "-delay", "18", "-loop", "0", *[rel(frame) for frame in frames], rel(target)]))
    return {"frames": len(indices), "camera": camera, "commands": commands, "output": rel(target)}


def write_editor_declarations() -> None:
    target = GALLERY / "ProjectDriveEditorDeclarations_CPU_Reference.txt"
    target.write_text(
        "Project-Drive editor declarations are verified by Exhibits/Gallery/CodeImages/AbiContract_CPU_Check.txt.\n"
        "This file intentionally replaces the previous fake ImGui-looking PNG sheet: the project code image\n"
        "declares C-layout panels and subjects only; Frontier.exe owns the actual editor rendering.\n\n"
        "Panels: DriveOutliner, ControlVehicle, XPBDTyres, VehicleDynamics, DriveRenderModes.\n"
        "Subjects: ControlVehicle, ControlVehicle.Body, ControlVehicle.XPBDTyre.FL, ControlVehicle.XPBDTyre.FR,\n"
        "ControlVehicle.XPBDTyre.RL, ControlVehicle.XPBDTyre.RR, DriveCourse, DriveCourse.Ramp, DriveCourse.Slalom.\n",
        encoding="utf-8")


def run_suite() -> None:
    GALLERY.mkdir(parents=True, exist_ok=True)
    for obsolete in (
        "ProjectDriveOpening_CPU_Mirror.png", "ProjectDriveBodyFlakes_CPU_Mirror.png", "DriveScenePreview.png",
        "DriveSceneSurfelGi.png", "ProjectDriveVehicleEditor_CPU_Reference.png",
    ):
        (GALLERY / obsolete).unlink(missing_ok=True)

    reports: list[dict[str, object]] = []
    release = compile_binary("DriveSceneProof-Release", DRIVE_SOURCE)
    reports.append({"build": "release", "compile": "passed"})
    reports.append({"visibility_raster": render_scene(release, "ProjectDriveVisibilityRaster_CPU_Reference", "visibility", 1,
                                                        (-6.0, -5.8, 2.3), (0.8, 0.0, 0.42), 49.0)})
    reports.append({"material_closeup": render_scene(release, "ProjectDriveAutomotiveMaterials_CPU_Reference", "surfel", 24,
                                                       (-3.2, -3.0, 1.4), (0.2, 0.0, 0.45), 42.0)})
    reports.append({"material_front_angle": render_scene(release, "ProjectDriveMaterialAngleFront_CPU_Reference", "surfel", 24,
                                                          (4.2, -3.4, 1.35), (0.15, 0.0, 0.45), 39.0)})
    reports.append({"material_rear_angle": render_scene(release, "ProjectDriveMaterialAngleRear_CPU_Reference", "surfel", 24,
                                                         (-4.3, 3.2, 1.65), (-0.45, 0.0, 0.55), 41.0)})
    reports.append({"surfel_gi": render_scene(release, "ProjectDriveSurfelGI_CPU_Reference", "surfel", 28,
                                                (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})
    reports.append({"restir_di": render_scene(release, "ProjectDriveReSTIR_CPU_Reference", "restir", 1,
                                                (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})

    debug = compile_binary("DriveSceneProof-Debug", DRIVE_SOURCE, optimization="-O0")
    reports.append({"build": "debug", "compile": "passed", "smoke": render_scene(debug, ".ProjectDriveDebugSmoke", "visibility", 1,
                                                                                         (-5.3, -4.6, 2.6), (0.2, 0.0, 0.48), 46.0)})
    debug.unlink(missing_ok=True)
    (GALLERY / ".ProjectDriveDebugSmoke.png").unlink(missing_ok=True)

    xpbd = compile_binary("XPBDTyreProof", XPBD_SOURCE, [XPBD_SOURCE_ENGINE])
    reports.append({"xpbd_tyre": run([rel(xpbd), rel(GALLERY / "ProjectDriveXPBDTyreDeformation_CPU_Reference.png")])})
    xpbd.unlink(missing_ok=True)

    telemetry = compile_binary("DriveTelemetry", TELEMETRY_SOURCE, VEHICLE_SOURCES,
                               include_paths=[VEHICLE_DIR, OVERLAY / "Projects/Project-Drive/Source"])
    temp_physics = GALLERY / ".physics"
    shutil.rmtree(temp_physics, ignore_errors=True)
    temp_physics.mkdir(exist_ok=True)
    reports.append({"vehicle_physics": run([rel(telemetry), rel(temp_physics)])})
    telemetry.unlink(missing_ok=True)
    shutil.copyfile(temp_physics / "telemetry.csv", GALLERY / "ProjectDrivePhysicsTelemetry_CPU_Reference.csv")
    shutil.copyfile(temp_physics / "run.log", GALLERY / "ProjectDrivePhysicsRun_CPU_Reference.txt")
    shutil.copyfile(temp_physics / "timing.log", GALLERY / "ProjectDrivePhysicsTiming_CPU_Reference.txt")
    reports.append({"physics_sheets": run([sys.executable, rel(SHEETS_SOURCE), rel(temp_physics / "telemetry.csv")])})
    rows = load_telemetry(temp_physics / "telemetry.csv")
    frame_indices = [min(len(rows) - 1, index) for index in (60, 150, 240, 330, 420, 510, 600, 690)]
    reports.append({"driving_follow_gif": render_drive_gif(release, rows, "ProjectDriveDrivingFollow_CPU_Reference", frame_indices, "visibility", "follow")})
    reports.append({"driving_course_gif": render_drive_gif(release, rows, "ProjectDriveDrivingCourse_CPU_Reference", frame_indices, "visibility", "course")})
    shutil.rmtree(temp_physics)
    release.unlink(missing_ok=True)

    write_editor_declarations()

    inputs = [DRIVE_SOURCE, XPBD_SOURCE, SHEETS_SOURCE, COURSE_SOURCE, CONTROL_MESH, XPBD_SOURCE_ENGINE, TELEMETRY_SOURCE, *VEHICLE_SOURCES,
              ROOT / "FlattenedEngine/Projects/Project-Drive/Source/ProjectDriveInterchange.cpp",
              OVERLAY / "Projects/Project-Drive/Source/DriveSceneAuthor.cpp",
              OVERLAY / "Projects/Project-Drive/Source/VehicleInspectorSequence.h"]
    all_outputs = OUTPUTS + ["ProjectDriveEditorDeclarations_CPU_Reference.txt"]
    provenance = {
        "proof": "Project-Drive visibility raster, Surfel GI, ReSTIR-DI mirror, automotive material angles, XPBD tyre deformation, vehicle motion GIFs and telemetry graphs.",
        "executionBoundary": {
            "nativeFrontierVulkanSlangImGuiCapture": False,
            "description": "PNG/GIF renders are headless CPU references using the checked-in Project-Drive course, ControlVehicle mesh, DriveTelemetry poses and a shared sun/sky approximation. The editor proof is the C-ABI declaration text plus the separate ABI check output; no fake ImGui capture is generated."
        },
        "checks": {
            "visibilityRaster": "A no-GI/no-reflection primary-visibility reference is generated separately from Surfel-GI and ReSTIR-DI.",
            "automotiveMaterials": "Front/rear/close angles expose paint, clearcoat flakes, glass, plastic, rubber, hub and brake material families.",
            "xpbd": "XPBD proof gates 5 rings x 64 segments, multi-contact tyre deformation and positive resolved vertical reaction.",
            "physics": "DriveTelemetry runs VehicleSolver, XPBDSoftTyre, Pacejka drivetrain, aerodynamic package and shared DriveCourse heightfield at 240 Hz for 12 seconds.",
            "drivingGifs": "Two animated GIFs are rendered from sampled telemetry poses, not from a stationary car."
        },
        "commands": reports,
        "sha256": {rel(path): sha256(path) for path in inputs if path.exists()},
        "outputs": {rel(GALLERY / name): sha256(GALLERY / name) for name in all_outputs},
    }
    (GALLERY / "Provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Wrote {len(all_outputs)} Drive evidence artefacts and provenance to {rel(GALLERY)}.")


if __name__ == "__main__":
    try:
        run_suite()
    except Exception as error:
        print(f"DriveSceneProof failed: {error}", file=sys.stderr)
        sys.exit(1)
