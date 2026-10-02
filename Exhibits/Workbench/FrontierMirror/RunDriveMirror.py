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
`Frontier/` tree is the engine itself — nothing is seated, overlaid or patched — and the
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
SEAT = Checkout.ENGINE                   # the engine tree itself; nothing is seated or overlaid any more
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
    "Engine/Host/CelestialSequence.cpp",
    "Projects/Project-Drive/Source/DriveSceneAuthor.cpp", "Projects/Project-Drive/Source/ChaseCameraSolver.cpp",
]
INCLUDES = [".", "Engine", "Engine/GeometricRaster", "Engine/ContentInterchange", "Engine/DeviceExchange",
            "Engine/DisplayPresentation", "Engine/Shaders", VEHICLE, "Engine/Host", "Projects/Project-Zero/Source",
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
    ("ProjectDriveXPBDRimCollapse", ["--camera", "wheel", "--wheel", "0", "--seconds", "12",
                                     "--orbit-period", "9", "--orbit-radius", "2.5", "--orbit-height", "1.05",
                                     "--rim-stop", "0"],
     "The defeated control for the sequence above: the identical run with the rim-bottoming constraint switched "
     "off at the command line, so the only difference between the two GIFs is the constraint under test. The "
     "sidewall is tension-only, so with nothing to stop it the belt keeps going once it runs out of sidewall and "
     "the tread ends up 17.5 mm INSIDE the rim it is mounted on \u2014 the carcass occupying the wheel. With the "
     "constraint on, the same landing stops at the flange with 0.72 mm left, which is the constraint's own "
     "compliance answering the load rather than the tread passing through steel."),
    # 📝 The three below were published by hand in fc3728c and were never wired into this script, so the one
    #    documented rebuild command did not touch them and they silently kept showing pre-fix behaviour while
    #    everything around them was regenerated. An artefact with no generator is the same defect as a proof
    #    that runs no engine code: it stops being evidence the moment the code moves underneath it.
    ("ProjectDriveXPBDLatticeDebug", ["--camera", "wheel", "--wheel", "0", "--seconds", "12",
                                      "--orbit-period", "9", "--orbit-radius", "2.5", "--orbit-height", "1.05",
                                      "--debug-lattice", "--height", "300"],
     "The same front-left tyre as the deformation sequence, drawn as the XPBD lattice itself rather than a "
     "skin: every node the solver integrates, with the ones in ground contact picked out, so the contact "
     "patch and the sidewall travel can be read directly off the particles."),
    ("ProjectDriveKerbStrike", ["--camera", "wheel", "--wheel", "0", "--seconds", "12", "--scenario", "kerb",
                                "--orbit-period", "9", "--orbit-radius", "2.5", "--orbit-height", "1.05"],
     "The car leaned onto the kerb's vertical face until the tyre strikes it side-on. This is the hardest "
     "case the course offers the carcass: the flange projection is handed a 46.7 mm breach, against 13.6 mm "
     "for the ramp landing."),
    ("ProjectDriveKerbStrike_LatticeDebug", ["--camera", "wheel", "--wheel", "0", "--seconds", "12",
                                             "--scenario", "kerb", "--orbit-period", "9", "--orbit-radius", "2.5",
                                             "--orbit-height", "1.05", "--debug-lattice", "--height", "300"],
     "The kerb strike as the lattice, which is where the rim-bottoming constraint is easiest to see: without "
     "it the tread folds 76.0 mm inside the rim it is mounted on, and with it the carcass stops on the "
     "flange with 0.67 mm left."),
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
    """Resolve the engine tree.  Kept as a name because callers import it; it no longer seats or overlays.

    Project-Drive is part of `Frontier/` now — there is no private copy to build, no overlay to lay over it and
    no hard-link dance to get wrong.  Dependencies are still installed, which is the one documented exception.
    """
    return Checkout.seat()


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



def _touches(command: list[str], names: list[str]) -> bool:
    """prose: Does a recorded command line belong to one of the named sequences?
    in:    command - a provenance command, already split into arguments
    in:    names   - sequence names this pass re-rendered
    out:   True when the command rendered one of them, so the stale copy can be dropped
    use:   Keeping the superseded command next to the fresh one would make the provenance self-contradictory.
    tag:   drive, provenance"""
    joined = " ".join(command)
    return any(f"frames-{name}" in joined for name in names)


def main() -> int:
    width = "480"
    height = "270"
    fps = 10
    only: list[str] = []
    for index, argument in enumerate(sys.argv):
        if argument == "--width":
            width = sys.argv[index + 1]
        elif argument == "--height":
            height = sys.argv[index + 1]
        elif argument == "--fps":
            fps = int(sys.argv[index + 1])
        elif argument == "--only":
            only = [n for n in sys.argv[index + 1].split(",") if n]

    # 📝 --only re-renders a named subset and leaves the rest of the gallery alone. A full pass is nine sequences
    #    plus the telemetry run and its graphs, which is around half an hour on two cores; when a change only
    #    moves the carcass there is no reason to re-roll the chase camera or replot the powertrain. The physics
    #    run, the graphs, the turntable stills and the tyre sheet are all skipped, and the provenance entries for
    #    the named sequences are merged into the published file rather than the file being rewritten from one
    #    partial pass — a provenance that silently dropped eight sequences would be worse than a slow rebuild.
    known = {entry[0] for entry in SEQUENCES}
    unknown = [name for name in only if name not in known]
    if unknown:
        raise SystemExit(f"--only: unknown sequence(s) {', '.join(unknown)}; known: {', '.join(sorted(known))}")
    partial = bool(only)

    seat_overlay()
    GALLERY.mkdir(parents=True, exist_ok=True)
    commands: list[list[str]] = []
    results: dict[str, object] = {}
    outputs: list[Path] = []

    if partial:
        log(f"partial rebuild: {', '.join(only)} (physics, graphs, stills and tyre sheet skipped)")

    # ── 1. the physics run ───────────────────────────────────────────────────────────────────────────────────────
    telemetry_binary = None if partial else compile_binary("DriveTelemetry",
                                      ["Projects/Project-Drive/Source/DriveTelemetry.cpp", *VEHICLE_SOURCES],
                                      [VEHICLE, "Projects/Project-Drive/Source"])
    run_dir = BUILD / "telemetry"
    if not partial:
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
    if not partial:
        log("plotting the run")
        outputs += render_graphs(GALLERY / "ProjectDrivePhysicsTelemetry_CPU_Reference.csv", GALLERY)
        commands.append([sys.executable, "Exhibits/Workbench/Drive/DriveTelemetryGraphs.py"])

    # ── 3. the rendered sequences ────────────────────────────────────────────────────────────────────────────────
    mirror = compile_binary("DriveSceneMirror", [str(MIRROR), *ENGINE_SOURCES, *VEHICLE_SOURCES], INCLUDES)
    sequence_notes: dict[str, str] = {}
    for name, flags, caption in [e for e in SEQUENCES if not only or e[0] in only]:
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
        # "flange:" is carried too: it is the line that says how close the tread came to the rim it is
        #    mounted on, which is the whole point of the rim-bottoming pair below.
        results[name] = [line for line in rendered.stdout.splitlines()
                         if "run:" in line or "camera" in line or "flange:" in line]

        target = GALLERY / f"{name}_CPU_Reference.gif"
        assemble_gif(frames, target, fps)
        outputs.append(target)
        log(f"wrote {target.name} ({target.stat().st_size // 1024} KiB)")

        if name == "ProjectDriveMaterialTurntable" and not partial:
            for index, angle in ANGLE_STILLS.items():
                source = frames / f"frame_{index:04d}.png"
                if not source.exists():
                    continue
                still = GALLERY / f"ProjectDriveMaterialAngle{angle}_CPU_Reference.png"
                shutil.copyfile(source, still)
                outputs.append(still)
            log(f"lifted {len(ANGLE_STILLS)} material angles out of the turntable")

    # ── 4. the soft tyre, from the engine's own XPBD solver ─────────────────────────────────────────────────────
    tyre_binary = None if partial else compile_binary("XPBDTyreProof",
                                 [str(ROOT / "Exhibits/Workbench/Drive/XPBDTyreProof.cpp"),
                                  f"{VEHICLE}/XPBDSoftTyre.cpp"], [VEHICLE])
    tyre_sheet = GALLERY / "ProjectDriveXPBDTyreDeformation_CPU_Reference.png"
    if not partial:
        log("deforming the soft tyre")
        Checkout.run([str(tyre_binary), str(tyre_sheet)], cwd=SEAT, quiet=True)
        commands.append([tyre_binary.name, str(tyre_sheet)])
        outputs.append(tyre_sheet)

    # ── 5. retire what the hand-written raytracer left behind ────────────────────────────────────────────────────
    retired = [] if partial else [name for name in SUPERSEDED if (GALLERY / name).exists()]
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
        "level": "Projects/Project-Drive/Source/DriveSceneAuthor",
        "physics": "Engine/PhysicalDynamics/Vehicle/VehicleSolver — PacejkaDrivetrain, XPBD soft tyres, Aerodynamics",
        "camera": "Projects/Project-Drive/Source/ChaseCameraSolver, the app's own chase camera",
        "sky": "Projects/Project-Zero/Source/CelestialSequence at local hour " + SUN_HOUR +
               " — the engine's real sun, sky, atmosphere, star and moon model",
        "raster": "Engine/GeometricRaster/VisibilityRaster — the shipped RT-off / GI-off render path",
    }
    provenance["executionBoundary"] = {
        "nativeFrontierVulkanSlangImGuiCapture": False,
        "description": "Every frame is rendered on the CPU by the engine's own translation units, built from the "
                       "flattened Frontier/ engine tree. No renderer, material model, sky or "
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
    # 📝 A partial pass only knows about the sequences it re-rendered, so it merges into the published file
    #    instead of replacing it. Anything it did not touch keeps the entry from the pass that did, and the
    #    merged file records which keys this pass is actually accountable for.
    published = GALLERY / "Provenance.json"
    if partial and published.exists():
        merged = json.loads(published.read_text())
        for section in ("results", "sequences"):
            if isinstance(merged.get(section), dict) and isinstance(provenance.get(section), dict):
                merged[section].update(provenance[section])
        merged.setdefault("commands", [])
        merged["commands"] = [c for c in merged["commands"] if not _touches(c, only)] + commands
        merged["partialRebuild"] = {
            "sequences": only,
            "note": "Re-rendered the sequences listed here only. Every other entry is carried over from the "
                    "last full pass; the physics run, graphs, turntable stills and tyre sheet were not re-run.",
        }
        provenance = merged
    published.write_text(json.dumps(provenance, indent=2) + "\n")
    log(f"published {len(outputs)} artefacts to {GALLERY.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
