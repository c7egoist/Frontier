#!/usr/bin/env python3
"""Run Project-Drive on the CPU with the engine's own code and publish the gallery.

What this produces, and where each piece comes from:

    telemetry   Projects/Project-Drive/Source/DriveTelemetry.cpp stepping the shipped `VehicleSolver`
                (PacejkaDrivetrain + XPBD soft tyres + closed-loop `Aerodynamics`) at 240 Hz against
                `DriveCourse`'s heightfield.  -> one CSV, one run log, one timing log
    graphs      Exhibits/Workbench/Drive/DriveTelemetryGraphs.py plotting that CSV.  Seven sheets: speed,
                driver inputs, steering response, aerodynamics, aero against speed, powertrain, tyre loads.
    sequences   Exhibits/Workbench/FrontierMirror/DriveSceneMirror.cpp driving the SAME solver run and
                rendering each frame through `Engine/GeometricRaster/VisibilityRaster` with the real
                `CelestialSequence` sky and the app's own `ChaseCameraSolver`.  -> animated GIFs
    angles      the same binary with `--camera orbit --freeze`, which holds a solver-produced pose and
                circles it, so the authored Project-Drive materials are shown from every azimuth.

The engine is not vendored into Slate; it is cloned at the revision `EngineCheckout` pins, the
`VehiclePhysics/Overlay` tree is seated on top of it the way the overlay README says to apply it, and the
gallery provenance records the revision, the commands and the sha256 of every published file.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Drive"))

import EngineCheckout as Checkout  # noqa: E402
from DriveTelemetryGraphs import render as render_graphs  # noqa: E402

ROOT = Checkout.ROOT
SCRATCH = ROOT / "_AgentScratch"
SEAT = SCRATCH / "DriveSeat"
OVERLAY = ROOT / "VehiclePhysics/Overlay"
GALLERY = ROOT / "Exhibits/Gallery/Drive"
MIRROR = ROOT / "Exhibits/Workbench/FrontierMirror/DriveSceneMirror.cpp"
BUILD = SCRATCH / "build/drive"

# 13:00 local is the staging every Drive sheet is lit under: the engine's own celestial model at its brightest
#    over the observation site, which is what makes the paint, glass and rubber legible from every azimuth.
SUN_HOUR = "13.0"

VEHICLE = "Engine/PhysicalDynamics/Vehicle"
VEHICLE_SOURCES = [f"{VEHICLE}/{name}.cpp" for name in
                   ("VehicleSolver", "VehicleGeometry", "Aerodynamics", "XPBDSoftTyre",
                    "PacejkaMagicFormula", "TyreSlipDynamics", "Drivetrain")]
ENGINE_SOURCES = [
    "Engine/GeometricRaster/VisibilityRaster.cpp", "Engine/GeometricRaster/SceneStructure.cpp",
    "Engine/GeometricRaster/GeometryStructure.cpp", "Engine/GeometricRaster/CameraProjection.cpp",
    "Engine/GeometricRaster/StarCatalogueIndex.cpp", "Engine/ContentInterchange/MaterialIndex.cpp",
    "Engine/ContentInterchange/AssetResolution.cpp", "Engine/ContentInterchange/SpaceExport.cpp",
    "Engine/ContentInterchange/SpaceCodec.cpp", "Engine/ContentInterchange/TextureIndex.cpp",
    "Engine/DisplayPresentation/CelestialSolver.cpp", "Engine/DeviceExchange/OrientationClassifier.cpp",
    # VisibilityRaster now evaluates the engine's own OpenPBR lobe set, which indexes the energy/sheen LUTs.
    "Engine/DisplayPresentation/ShadingTableCodec.cpp",
    "Projects/Project-Zero/Source/CelestialSequence.cpp",
    "Projects/Project-Drive/Source/DriveSceneAuthor.cpp", "Projects/Project-Drive/Source/ChaseCameraSolver.cpp",
]
INCLUDES = [".", "Engine", "Engine/GeometricRaster", "Engine/ContentInterchange", "Engine/DeviceExchange",
            "Engine/DisplayPresentation", "Engine/Shaders", VEHICLE, "Projects/Project-Zero/Source",
            "Projects/Project-Drive/Source", "ExternalPackages/stb", "ExternalPackages/vulkan-headers/include"]

# Each entry is one published GIF: the flags handed to the mirror, and the caption the README carries.
SEQUENCES = [
    ("ProjectDriveChaseRun", ["--camera", "chase", "--seconds", "12"],
     "The full scripted run from the app's own ChaseCameraSolver: settle, full throttle, slalom, ramp, brake."),
    ("ProjectDriveTracksideRun", ["--camera", "trackside", "--seconds", "12"],
     "The same run from a fixed post beside the course, so the speed reads as motion through frame."),
    ("ProjectDriveOrbitWhileDriving", ["--camera", "orbit", "--seconds", "12", "--orbit-period", "5",
                                       "--orbit-radius", "9", "--orbit-height", "2.6"],
     "The same run with the eye circling the moving car: the body, wheels and course from every azimuth at speed."),
    ("ProjectDriveXPBDTyreDeformation", ["--camera", "wheel", "--wheel", "0", "--seconds", "12",
                                         "--orbit-period", "9", "--orbit-radius", "2.5", "--orbit-height", "1.05"],
     "The front-left tyre for the whole run, close enough to read the carcass. The surface is rebuilt every frame "
     "from XPBDSoftTyre's own particle lattice, so the contact patch flattening, the shoulders bulging and the "
     "shiver over the bumps are the deformation the solver resolved \u2014 not a cylinder being squashed for the camera."),
    ("ProjectDriveMaterialTurntable", ["--camera", "orbit", "--freeze", "3.0", "--seconds", "9",
                                       "--orbit-period", "6", "--orbit-radius", "6.5", "--orbit-height", "2.4"],
     "The car held at the pose the solver produced three seconds into the run, circled once, to show the "
     "twelve authored Project-Drive materials from every angle."),
]

# Frames lifted out of the turntable as standalone material angles (frame index -> published name).
ANGLE_STILLS = {0: "Rear", 10: "RearQuarter", 20: "Side", 30: "FrontQuarter", 40: "Front", 50: "FarSide"}

# The retired hand-written raytracer's sheets. They claimed to be Project-Drive renders and were not.
SUPERSEDED = [
    "ProjectDriveAutomotiveMaterials_CPU_Reference.png", "ProjectDriveSurfelGI_CPU_Reference.png",
    "ProjectDriveReSTIR_CPU_Reference.png", "ProjectDrivePhysicsMotion_CPU_Reference.png",
    "ProjectDriveVehicleEditor_CPU_Reference.png",
    # The hand-drawn XPBD schematic. Superseded by ProjectDriveXPBDTyreDeformation_CPU_Reference.gif, which is the
    #    real tyre rendered from the solver's own nodes instead of a diagram of what the solver is supposed to do.
    "ProjectDriveXPBDTyreDeformation_CPU_Reference.png",
]


def log(message: str) -> None:
    print(f"[drive] {message}", flush=True)


def seat_overlay() -> Path:
    """Clone the pinned engine, then lay VehiclePhysics/Overlay over a private copy of it.

    The overlay path-mirrors the engine root, so applying it is how Project-Drive exists at all.  The copy is
    hard-linked off the pinned checkout and every overlaid file is unlinked before it is written, so the shared
    checkout the other mirrors build from is never modified.
    """
    engine = Checkout.seat()
    if not SEAT.exists():
        log(f"seating a private engine copy at {SEAT.relative_to(ROOT)}")
        Checkout.run(["cp", "-al", str(engine), str(SEAT)], cwd=SCRATCH)
    overlaid = 0
    for source in sorted(OVERLAY.rglob("*")):
        if not source.is_file():
            continue
        target = SEAT / source.relative_to(OVERLAY)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            target.unlink()                      # break the hard link rather than write through it
        shutil.copyfile(source, target)
        overlaid += 1
    log(f"overlaid {overlaid} VehiclePhysics files onto the checkout")
    return SEAT


def compile_binary(name: str, sources: list[str], includes: list[str]) -> Path:
    BUILD.mkdir(parents=True, exist_ok=True)
    binary = BUILD / name
    command = ["g++", "-std=c++20", "-O2", "-w", "-DFRONTIER_CPU_PORT", "-pthread",
               "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
               *[f"-I{path}" for path in includes], *sources, "-o", str(binary)]
    log(f"compiling {name} ({len(sources)} translation units)")
    Checkout.run(command, cwd=SEAT)
    return binary


def assemble_gif(frames: Path, target: Path, fps: int) -> None:
    delay = max(2, round(100 / fps))
    Checkout.run(["convert", "-delay", str(delay), "-loop", "0",
                  *sorted(str(p) for p in frames.glob("frame_*.png")),
                  "-layers", "OptimizeTransparency", str(target)], cwd=ROOT, quiet=True)


def main() -> int:
    width = "480"
    height = "270"
    fps = 10
    for index, argument in enumerate(sys.argv):
        if argument == "--width":
            width = sys.argv[index + 1]
        elif argument == "--height":
            height = sys.argv[index + 1]
        elif argument == "--fps":
            fps = int(sys.argv[index + 1])

    seat_overlay()
    GALLERY.mkdir(parents=True, exist_ok=True)
    commands: list[list[str]] = []
    results: dict[str, object] = {}
    outputs: list[Path] = []

    # ── 1. the physics run ───────────────────────────────────────────────────────────────────────────────────────
    telemetry_binary = compile_binary("DriveTelemetry",
                                      ["Projects/Project-Drive/Source/DriveTelemetry.cpp", *VEHICLE_SOURCES],
                                      [VEHICLE, "Projects/Project-Drive/Source"])
    run_dir = BUILD / "telemetry"
    run_dir.mkdir(parents=True, exist_ok=True)
    log("running the vehicle")
    physics = Checkout.run([str(telemetry_binary), str(run_dir)], cwd=SEAT, quiet=True)
    commands.append([str(telemetry_binary.name), str(run_dir)])
    results["physics"] = physics.stdout.strip().splitlines()[-8:]
    for source, published in (("telemetry.csv", "ProjectDrivePhysicsTelemetry_CPU_Reference.csv"),
                              ("run.log", "ProjectDrivePhysicsRun_CPU_Reference.txt"),
                              ("timing.log", "ProjectDrivePhysicsTiming_CPU_Reference.txt")):
        shutil.copyfile(run_dir / source, GALLERY / published)
        outputs.append(GALLERY / published)

    # ── 2. the graphs that prove it ran ──────────────────────────────────────────────────────────────────────────
    log("plotting the run")
    outputs += render_graphs(GALLERY / "ProjectDrivePhysicsTelemetry_CPU_Reference.csv", GALLERY)
    commands.append([sys.executable, "Exhibits/Workbench/Drive/DriveTelemetryGraphs.py"])

    # ── 3. the rendered sequences ────────────────────────────────────────────────────────────────────────────────
    mirror = compile_binary("DriveSceneMirror", [str(MIRROR), *ENGINE_SOURCES, *VEHICLE_SOURCES], INCLUDES)
    sequence_notes: dict[str, str] = {}
    for name, flags, caption in SEQUENCES:
        frames = BUILD / f"frames-{name}"
        if frames.exists():
            shutil.rmtree(frames)
        frames.mkdir(parents=True)
        command = [str(mirror), "--frames-out", str(frames), "--width", width, "--height", height,
                   "--fps", str(fps), "--sun", SUN_HOUR, *flags]
        log(f"rendering {name}")
        rendered = Checkout.run(command, cwd=SEAT, quiet=True)
        commands.append([mirror.name, *command[1:]])
        sequence_notes[name] = caption
        results[name] = [line for line in rendered.stdout.splitlines() if "run:" in line or "camera" in line]

        target = GALLERY / f"{name}_CPU_Reference.gif"
        assemble_gif(frames, target, fps)
        outputs.append(target)
        log(f"wrote {target.name} ({target.stat().st_size // 1024} KiB)")

        if name == "ProjectDriveMaterialTurntable":
            for index, angle in ANGLE_STILLS.items():
                source = frames / f"frame_{index:04d}.png"
                if not source.exists():
                    continue
                still = GALLERY / f"ProjectDriveMaterialAngle{angle}_CPU_Reference.png"
                shutil.copyfile(source, still)
                outputs.append(still)
            log(f"lifted {len(ANGLE_STILLS)} material angles out of the turntable")

    # ── 4. the soft tyre, from the engine's own XPBD solver ─────────────────────────────────────────────────────
    tyre_binary = compile_binary("XPBDTyreProof",
                                 [str(ROOT / "Exhibits/Workbench/Drive/XPBDTyreProof.cpp"),
                                  f"{VEHICLE}/XPBDSoftTyre.cpp"], [VEHICLE])
    tyre_sheet = GALLERY / "ProjectDriveXPBDTyreDeformation_CPU_Reference.png"
    log("deforming the soft tyre")
    Checkout.run([str(tyre_binary), str(tyre_sheet)], cwd=SEAT, quiet=True)
    commands.append([tyre_binary.name, str(tyre_sheet)])
    outputs.append(tyre_sheet)

    # ── 5. retire what the hand-written raytracer left behind ────────────────────────────────────────────────────
    retired = [name for name in SUPERSEDED if (GALLERY / name).exists()]
    for name in retired:
        (GALLERY / name).unlink()
    if retired:
        log(f"removed {len(retired)} sheets from the retired hand-written renderer")

    # ── 6. provenance ────────────────────────────────────────────────────────────────────────────────────────────
    provenance = Checkout.provenance(
        proof="Project-Drive driven on the CPU by the engine's own vehicle solver and visibility raster.",
        scene="Projects/Project-Drive/Source/DriveSceneAuthor — the app's own course, ControlVehicle shell, "
              "four wheels and twelve authored materials, in the app's own span order.",
        commands=commands, results=results, outputs=outputs)
    provenance["stages"] = {
        "level": "Projects/Project-Drive/Source/DriveSceneAuthor (VehiclePhysics/Overlay)",
        "physics": "Engine/PhysicalDynamics/Vehicle/VehicleSolver — PacejkaDrivetrain, XPBD soft tyres, Aerodynamics",
        "camera": "Projects/Project-Drive/Source/ChaseCameraSolver, the app's own chase camera",
        "sky": "Projects/Project-Zero/Source/CelestialSequence at local hour " + SUN_HOUR +
               " — the engine's real sun, sky, atmosphere, star and moon model",
        "raster": "Engine/GeometricRaster/VisibilityRaster — the shipped RT-off / GI-off render path",
    }
    provenance["executionBoundary"] = {
        "nativeFrontierVulkanSlangImGuiCapture": False,
        "description": "Every frame is rendered on the CPU by the engine's own translation units, built from the "
                       "pinned checkout with VehiclePhysics/Overlay applied. No renderer, material model, sky or "
                       "camera is authored in Slate. This is not a Vulkan swapchain capture; it is the same code "
                       "the GPU path shades from, run headless.",
    }
    provenance["sequences"] = sequence_notes
    provenance["retired"] = {
        "sheets": retired,
        "reason": "Exhibits/Workbench/Drive/DriveSceneProof.cpp was a bespoke raytracer written in Slate. It did "
                  "not run any engine code, so its sheets were not evidence about Project-Drive. It is deleted and "
                  "its output is superseded by the sequences above.",
    }
    (GALLERY / "Provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    log(f"published {len(outputs)} artefacts to {GALLERY.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
