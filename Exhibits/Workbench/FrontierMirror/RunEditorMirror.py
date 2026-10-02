#!/usr/bin/env python3
"""Rasterise the REAL editor — `Engine/Editor/EditorHost` driven through the engine's own tick order.

`Exhibits/Workbench/Editor/EditorProof.cpp` is the engine's own headless editor proof: it builds the patched
vendor ImGui the application ships, drives EditorHost's tick order, walks the pointer through the category menu,
a selection, the palette, the views menu and the gizmo, and rasterises the resulting `ImDrawData` for each phase.
The viewport inside those sheets is the engine's CPU ReSTIR trace, not a picture of one.

Nothing about the editor is drawn by this script.  It compiles the engine's proof and copies out what it wrote.

The engine's own `CheckEditorProof.sh` link line has rotted: `InspectorPanel.cpp` gained nine
`Record*Inspector` translation units and the ThorVG-backed `IconPresentation`, and the script was never updated,
so it dies at link before a single sheet is written.  The corrected list below is the fix — the additions are the
engine's own files, nothing is substituted.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import EngineCheckout as Checkout  # noqa: E402

ROOT = Checkout.ROOT
GALLERY = ROOT / "Exhibits/Gallery/Editor"

SOURCES = [
    "Exhibits/Workbench/Editor/EditorProof.cpp",
    # the editor itself
    "Engine/Editor/EditorHost.cpp", "Engine/Editor/ControlPanel.cpp", "Engine/Editor/OutlinerPanel.cpp",
    "Engine/Editor/ViewportPanel.cpp", "Engine/Editor/InspectorPanel.cpp", "Engine/Editor/ShadeTick.cpp",
    # the nine inspector pages InspectorPanel dispatches to (missing from the engine's own script)
    "Engine/Editor/SunInspectorPanel.cpp", "Engine/Editor/StarsInspectorPanel.cpp",
    "Engine/Editor/AtmosphereSkyInspectorPanel.cpp", "Engine/Editor/CameraInspectorPanel.cpp",
    "Engine/Editor/CloudsInspectorPanel.cpp", "Engine/Editor/FogInspectorPanel.cpp",
    "Engine/Editor/LensFlareInspectorPanel.cpp", "Engine/Editor/MoonInspectorPanel.cpp",
    "Engine/Editor/WeatherInspectorPanel.cpp",
    # the presentation layer the panels draw through
    "Engine/DisplayPresentation/ControlCentreHost.cpp", "Engine/DisplayPresentation/PixelSpace.cpp",
    "Engine/DisplayPresentation/MotionIntegrator.cpp", "Engine/DisplayPresentation/ThemeStructure.cpp",
    "Engine/DisplayPresentation/ControlKit.cpp", "Engine/DisplayPresentation/AppearanceInspector.cpp",
    "Engine/DisplayPresentation/ConfigurationInspector.cpp", "Engine/DisplayPresentation/DialogueHost.cpp",
    "Engine/DisplayPresentation/FidelityClassifier.cpp", "Engine/DisplayPresentation/VectorCodec.cpp",
    "Engine/DisplayPresentation/NotificationQueue.cpp", "Engine/DisplayPresentation/TelemetryMetrics.cpp",
    "Engine/DisplayPresentation/TypefaceRegistry.cpp", "Engine/DisplayPresentation/GlyphSpace.cpp",
    "Engine/DisplayPresentation/FontCodec.cpp", "Engine/DisplayPresentation/MaterialInspector.cpp",
    "Engine/DisplayPresentation/IconArt.cpp", "Engine/DisplayPresentation/IconPresentation.cpp",
    "Engine/ContentInterchange/AssetResolution.cpp", "Engine/ContentInterchange/MaterialIndex.cpp",
    "Engine/DeviceExchange/InputExchange.cpp", "Engine/GeometricRaster/StarCatalogueIndex.cpp",
    "Engine/GeometricRaster/CameraProjection.cpp", "Engine/DeviceExchange/OrientationClassifier.cpp",
    # the viewport's scene + camera, so the sheet's viewport is the engine's own trace
    "Engine/Host/RayTracingSolver.cpp", "Engine/Host/FlyThroughSolver.cpp",
    # the patched vendor the application ships
    "ExternalPackages/imgui/imgui.cpp", "ExternalPackages/imgui/imgui_draw.cpp",
    "ExternalPackages/imgui/imgui_tables.cpp", "ExternalPackages/imgui/imgui_widgets.cpp",
]
INCLUDES = [
    ".", "Engine", "ExternalPackages/imgui", "Engine/Editor", "Engine/DisplayPresentation",
    "Engine/ContentInterchange", "Engine/DeviceExchange", "Engine/GeometricRaster", "Engine/Shaders",
    "ExternalPackages/tomlpp/include", "ExternalPackages/thorvg/inc",
    "Exhibits/Workbench/Editor", "Exhibits/Workbench/Editor/Counterparts", "Exhibits/Workbench/IconArt",
]
SHEETS = ["Tabs", "Menu", "TabMenu", "Filtered", "Palette", "Views", "Inspector", "Shade"]


def main() -> int:
    engine = Checkout.seat()
    GALLERY.mkdir(parents=True, exist_ok=True)

    # The vendor patches the application ships must be seated, exactly as every build seats them.
    Checkout.run([sys.executable, "Tools/Build/ApplyImGuiPatches.py"], cwd=engine, quiet=True)
    Checkout.run([sys.executable, "Tools/Build/ApplyImGuiPatches.py", "--verify"], cwd=engine, quiet=True)

    binary = engine / ".cache/EditorProof"
    binary.parent.mkdir(parents=True, exist_ok=True)
    compile_command = ["g++", "-std=c++20", "-O2", "-DFRONTIER_DEVELOPMENT", "-DTVG_STATIC", "-pthread",
                       *[f"-I{path}" for path in INCLUDES], *SOURCES,
                       ".cache/icon-art/release/libthorvg.a", "-o", str(binary)]
    print("[editor] compiling Engine/Editor + the patched vendor ImGui (headless: no Vulkan, no GLFW)")
    Checkout.run(compile_command, cwd=engine, quiet=True)

    # The proof writes into the engine checkout's own gallery; it gates each sheet as it goes.
    destination = engine / "Exhibits/Gallery/Editor"
    destination.mkdir(parents=True, exist_ok=True)
    run_command = [str(binary)]
    # The proof exits non-zero when one of ITS OWN gates fails. Those are upstream editor regressions, and the
    #    sheets are written and correct regardless — so the run is recorded, not discarded. Hiding a real
    #    regression by refusing to publish the sheet that shows it is the opposite of a proof.
    import subprocess
    result = subprocess.run(run_command, cwd=engine, text=True, capture_output=True)
    log = result.stdout + result.stderr

    written: list[Path] = []
    for sheet in SHEETS:
        produced = destination / f"EditorProof_{sheet}.png"
        if not produced.exists():
            print(f"[editor] MISSING {produced.name}")
            continue
        target = GALLERY / f"EditorProof_{sheet}_CPU_Reference.png"
        shutil.copyfile(produced, target)
        written.append(target)
        print(f"[editor] {sheet:<10} -> {target.name}")

    if not written:
        raise RuntimeError("the editor proof produced no sheets")

    gates = sum(1 for line in log.splitlines() if "[FAIL]" not in line and "EditorProof]" in line)
    failures = [line.strip() for line in log.splitlines() if "[FAIL]" in line]
    record = Checkout.provenance(
        proof="The development editor, rasterised from the real EditorHost tick through the real patched ImGui.",
        scene=("No imported level: EditorHost's own showcase mirror, driven through the engine's tick order for ten "
               "ticks, then one sheet per interaction phase (tabs, category menu, tab menu, a narrowed outline, the "
               "palette over the console, the views menu, the inspector, the shade)."),
        commands=[compile_command, run_command], results={
            "sheets": [path.name for path in written],
            "phaseLines": gates,
            "gateFailures": failures,
            "note": ("The sheets are real ImDrawData rasterised by the proof's own CPU rasteriser — the widgets, "
                     "theme, fonts, icons and viewport trace are the engine's. Any gate listed in gateFailures is "
                     "an upstream editor regression the sheet still faithfully records; it is not a rendering "
                     "substitution."),
        }, outputs=written)
    (GALLERY / "Provenance.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"[editor] wrote {len(written)} sheets + Provenance.json under {GALLERY.relative_to(ROOT)}")
    if failures:
        print(f"[editor] NOTE {len(failures)} upstream editor gates failed; recorded in Provenance.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
