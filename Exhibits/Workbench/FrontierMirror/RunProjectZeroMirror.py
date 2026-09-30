#!/usr/bin/env python3
"""Render Project-Zero's DEFAULT level — the 20 x 20 material grid — through the engine's own CPU paths.

What the product opens with no `--scene` argument is `Engine/ContentInterchange/ShowcaseStructure`: r6,
`kShowcaseGridSide` = 20, so 400 spheres and 400 materials across the whole OpenPBR lobe set.  Three render paths
are exercised, and every one of them is engine code:

  visibility raster   Engine/GeometricRaster/VisibilityRaster           RT off, GI off — the plain mode
                      + Projects/Project-Zero/Source/CelestialSequence   the real sun/sky/atmosphere model
  ReSTIR DI           Projects/Project-Zero/Host/MaterialLevelViewport --restir
                      (ReSTIRViewport.slang's resampling arithmetic transcribed 1:1 as C++)
  reference           Projects/Project-Zero/Host/MaterialLevelViewport
                      (brute-force NEE+MIS through Engine/Shaders/MaterialEvaluation.slang compiled as C++)

Both binaries build from the pinned engine checkout EngineCheckout.py seats.  No renderer is authored in Slate.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import EngineCheckout as Checkout  # noqa: E402

ROOT = Checkout.ROOT
GALLERY = ROOT / "Exhibits/Gallery/ProjectZero/Showcase"
MIRROR = ROOT / "Exhibits/Workbench/FrontierMirror/ShowcaseRasterMirror.cpp"

# ── The matrix ──────────────────────────────────────────────────────────────────────────────────────────────────────
# Every entry names an engine framing from ShowcaseViewpointFor, so the raster sheet and the traced sheet of the
#    same view are provably the same shot.  "Different angles demonstrating proper materials" is the whole point of
#    carrying more than the entry framing.
RASTER_VIEWS = [
    ("default", "the product's entry shot — the whole grid as Project-Zero.exe opens it"),
    ("grid400", "all 400 spheres from above: the complete 20 x 20 material matrix"),
    ("metals",  "row 0, the anisotropic metal polish ladder, at eye level"),
    ("glass",   "row 1, the IOR 1.30 -> 2.42 transmissive ramp"),
    ("glints",  "row 12, the glint-flake density ramp"),
]
TRACED_VIEWS = [
    ("default", "the product's entry shot"),
    ("grid400", "all 400 spheres from above"),
    ("metals",  "row 0, the anisotropic metal polish ladder"),
]

RASTER_SOURCES = [
    "Engine/GeometricRaster/VisibilityRaster.cpp", "Engine/GeometricRaster/SceneStructure.cpp",
    "Engine/GeometricRaster/GeometryStructure.cpp", "Engine/GeometricRaster/CameraProjection.cpp",
    "Engine/GeometricRaster/StarCatalogueIndex.cpp", "Engine/ContentInterchange/ShowcaseStructure.cpp",
    "Engine/ContentInterchange/MaterialIndex.cpp", "Engine/ContentInterchange/AssetResolution.cpp",
    "Engine/ContentInterchange/SpaceExport.cpp", "Engine/ContentInterchange/SpaceCodec.cpp",
    "Engine/ContentInterchange/TextureIndex.cpp", "Engine/DisplayPresentation/CelestialSolver.cpp",
    "Engine/DeviceExchange/OrientationClassifier.cpp", "Projects/Project-Zero/Source/CelestialSequence.cpp",
]
RASTER_INCLUDES = [
    ".", "Engine", "Engine/GeometricRaster", "Engine/ContentInterchange", "Engine/DeviceExchange",
    "Engine/DisplayPresentation", "Engine/Shaders", "Projects/Project-Zero/Source",
    "ExternalPackages/stb", "ExternalPackages/vulkan-headers/include",
]


def build_raster(engine: Path) -> tuple[Path, list[str]]:
    """Compile the raster mirror out of engine translation units.  --gc-sections drops the glTF codec chain the
    level's Export path pulls in; the viewport reads the level's triangles, it never writes the glTF."""
    binary = engine / ".cache/ShowcaseRasterMirror"
    binary.parent.mkdir(parents=True, exist_ok=True)
    command = ["g++", "-std=c++20", "-O2", "-Wall", "-Wextra", "-DFRONTIER_CPU_PORT", "-pthread",
               "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
               *[f"-I{path}" for path in RASTER_INCLUDES], str(MIRROR), *RASTER_SOURCES, "-o", str(binary)]
    print("[project-zero] building the visibility-raster mirror out of engine sources")
    Checkout.run(command, cwd=engine, quiet=True)
    return binary, command


def build_viewport(engine: Path) -> tuple[Path, list[str]]:
    """The engine's own Host/Makefile target — its link line is the engine's, not ours."""
    host = engine / "Projects/Project-Zero/Host"
    command = ["make", "MaterialLevelViewport"]
    print("[project-zero] building MaterialLevelViewport through the engine's own Makefile")
    Checkout.run(command, cwd=host, quiet=True)
    return host / "MaterialLevelViewport", command


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--spp", type=int, default=16)
    parser.add_argument("--bounce", type=int, default=5)
    parser.add_argument("--sun", type=float, default=15.0)
    parser.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 2)))
    parser.add_argument("--skip-traced", action="store_true", help="raster sheets only (fast re-run)")
    arguments = parser.parse_args()

    engine = Checkout.seat()
    GALLERY.mkdir(parents=True, exist_ok=True)
    raster, raster_build = build_raster(engine)
    commands: list[list[str]] = [raster_build]
    results: dict[str, object] = {}
    outputs: list[Path] = []

    # ── 1. visibility raster: RT off, GI off — the mode the quick tiles leave you in by default ────────────────────
    for view, caption in RASTER_VIEWS:
        target = GALLERY / f"Showcase_{view.replace('-', '_')}_VisibilityRaster_CPU_Reference.png"
        command = [str(raster), "--out", str(target), "--view", view,
                   "--width", str(arguments.width), "--height", str(arguments.height), "--sun", str(arguments.sun)]
        started = time.time()
        output = Checkout.run(command, cwd=engine, quiet=True).stdout
        commands.append(command)
        outputs.append(target)
        gates = sum(1 for line in output.splitlines() if " pass  " in line)
        results[target.name] = {"caption": caption, "gatesPassed": gates, "seconds": round(time.time() - started, 2)}
        print(f"[project-zero] raster  {view:<10} -> {target.name}  ({gates} gates)")

    if not arguments.skip_traced:
        viewport, viewport_build = build_viewport(engine)
        commands.append(viewport_build)
        # ── 2. ReSTIR DI, and 3. the brute-force reference the ReSTIR estimate is measured against ─────────────────
        for label, extra in (("ReSTIR", ["--restir"]), ("Reference", [])):
            for view, caption in TRACED_VIEWS:
                target = GALLERY / f"Showcase_{view.replace('-', '_')}_{label}_CPU_Reference.png"
                command = [str(viewport), "--level", "showcase", "--view", view, "--out", str(target),
                           "--width", str(arguments.width), "--height", str(arguments.height),
                           "--spp", str(arguments.spp), "--bounce", str(arguments.bounce),
                           "--threads", str(arguments.threads), *extra]
                started = time.time()
                output = Checkout.run(command, cwd=viewport.parent, quiet=True).stdout
                commands.append(command)
                outputs.append(target)
                film = next((line for line in output.splitlines() if "film:" in line), "").strip()
                results[target.name] = {"caption": caption, "film": film,
                                        "seconds": round(time.time() - started, 2)}
                print(f"[project-zero] {label:<9} {view:<10} -> {target.name}")

    record = Checkout.provenance(
        proof="Project-Zero default level (the 20 x 20 = 400-material showcase grid) through the engine's own CPU paths.",
        scene=("Engine/ContentInterchange/ShowcaseStructure r6 — kShowcaseGridSide = 20, so 400 spheres and 400 "
               "material records across the OpenPBR lobe set, on the authored ground plane with the level's own "
               "emissive luminaires and the Project-Zero interface panel. This is what Project-Zero.exe opens with "
               "no --scene argument."),
        commands=commands, results=results, outputs=outputs)
    record["paths"] = {
        "visibilityRaster": "Engine/GeometricRaster/VisibilityRaster.cpp (RT off, GI off) with the sky from "
                            "Projects/Project-Zero/Source/CelestialSequence::ApplyTo — the engine's own atmosphere, "
                            "twilight, star, moon and fog model, not a gradient.",
        "reSTIR": "Projects/Project-Zero/Host/MaterialLevelViewport --restir — ReSTIRViewport.slang's reservoir "
                  "arithmetic transcribed 1:1 as C++ under FRONTIER_CPU_PORT.",
        "reference": "Projects/Project-Zero/Host/MaterialLevelViewport — brute-force NEE + power-heuristic MIS "
                     "through Engine/Shaders/MaterialEvaluation.slang compiled 1:1 as C++.",
        "surfelGlobalIllumination": "NOT RENDERED. The engine has no CPU surfel path: SurfelIrradianceUpdate.slang "
                                    "and SurfelGIResolve.slang are GLSL compute awaiting the host port described in "
                                    "RaytraceToggle/PortingGuide.md. Claiming a surfel sheet here would be a "
                                    "lookalike, which is exactly what this rewrite removes.",
    }
    (GALLERY / "Provenance.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"[project-zero] wrote {len(outputs)} sheets + Provenance.json under {GALLERY.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
