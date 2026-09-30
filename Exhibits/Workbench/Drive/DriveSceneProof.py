#!/usr/bin/env python3
"""Build and run the dependency-free Project-Drive CPU proof.

The proof compiles in Release and Debug, renders the opening camera and a flake
close-up, and writes portable source and output hashes to the gallery provenance.
Run this file from any directory.
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path


RepositoryRoot = Path(__file__).resolve().parents[3]
WorkbenchPath = RepositoryRoot / "Exhibits/Workbench/Drive"
GalleryPath = RepositoryRoot / "Exhibits/Gallery/Drive"
SourcePath = WorkbenchPath / "DriveSceneProof.cpp"
InputPaths = [
    SourcePath,
    WorkbenchPath / "PngWriteCodec.h",
    RepositoryRoot / "VehiclePhysics/Overlay/Projects/Project-Drive/Source/DriveCourse.h",
    RepositoryRoot / "VehiclePhysics/Overlay/Projects/Project-Drive/Source/ControlVehicleMesh.inl",
]
OutputPaths = [
    GalleryPath / "DriveScene.png",
    GalleryPath / "DriveBodyFlakes.png",
]


def RepositoryRelativePath(SourcePath: Path) -> str:
    return str(SourcePath.relative_to(RepositoryRoot))


def CalculateSha256(SourcePath: Path) -> str:
    return hashlib.sha256(SourcePath.read_bytes()).hexdigest()


def RunCommand(Command: list[str]) -> dict:
    CommandResult = subprocess.run(Command, cwd=RepositoryRoot, text=True, capture_output=True)
    print(CommandResult.stdout, CommandResult.stderr)
    if CommandResult.returncode != 0:
        raise RuntimeError(f"{Command} exited with {CommandResult.returncode}")
    return {
        "command": Command,
        "exit": CommandResult.returncode,
        "output": CommandResult.stdout + CommandResult.stderr,
    }


def CompileAndRender(ModeName: str, OptimisationFlags: list[str]) -> dict:
    BinaryPath = GalleryPath / f".DriveSceneProof-{ModeName}"
    BinaryRelativePath = RepositoryRelativePath(BinaryPath)
    CompileReport = RunCommand([
        "g++",
        "-std=c++20",
        "-Wall",
        "-Wextra",
        "-Werror",
        *OptimisationFlags,
        "-pthread",
        RepositoryRelativePath(SourcePath),
        "-o",
        BinaryRelativePath,
    ])
    RenderReport = RunCommand([
        BinaryRelativePath,
        "--out",
        RepositoryRelativePath(GalleryPath),
        "--name",
        "DriveScene",
    ])
    BinaryPath.unlink(missing_ok=True)
    return {"mode": ModeName, "compile": CompileReport, "render": RenderReport}


def RenderCloseup() -> None:
    BinaryPath = GalleryPath / ".DriveSceneProof-Closeup"
    BinaryRelativePath = RepositoryRelativePath(BinaryPath)
    RunCommand([
        "g++",
        "-std=c++20",
        "-O2",
        "-pthread",
        RepositoryRelativePath(SourcePath),
        "-o",
        BinaryRelativePath,
    ])
    RunCommand([
        BinaryRelativePath,
        "--out",
        RepositoryRelativePath(GalleryPath),
        "--name",
        "DriveBodyFlakes",
        "--frames",
        "20",
        "--eye",
        "-3.2",
        "-3.0",
        "1.4",
        "--look",
        "0.2",
        "0.0",
        "0.45",
        "--fov",
        "42",
    ])
    BinaryPath.unlink(missing_ok=True)


def RunDriveSceneProof() -> None:
    GalleryPath.mkdir(parents=True, exist_ok=True)
    ModeReports = [
        CompileAndRender("Release", ["-O2"]),
        CompileAndRender("Debug", ["-O0", "-g"]),
    ]
    RenderCloseup()

    Provenance = {
        "proof": "Project-Drive scene CPU mirror (course + ControlVehicle + wheels, sun/sky, surfel GI, flake clearcoat)",
        "gpuExecution": False,
        "windowsExecution": False,
        "modes": ModeReports,
        "sha256": {
            RepositoryRelativePath(InputPath): CalculateSha256(InputPath)
            for InputPath in InputPaths
            if InputPath.exists()
        },
        "outputs": {
            RepositoryRelativePath(OutputPath): CalculateSha256(OutputPath)
            for OutputPath in OutputPaths
        },
    }
    ProvenancePath = GalleryPath / "DriveSceneProvenance.json"
    ProvenancePath.write_text(json.dumps(Provenance, indent=2) + "\n")
    print(f"Wrote {RepositoryRelativePath(ProvenancePath)} and {len(OutputPaths)} PNGs.")


if __name__ == "__main__":
    try:
        RunDriveSceneProof()
    except Exception as Error:
        print(f"DriveSceneProof failed: {Error}", file=sys.stderr)
        sys.exit(1)
