#!/usr/bin/env python3
"""Render the Project-Drive car through the three light-transport paths the product actually ships.

    visibility raster   Engine/GeometricRaster/VisibilityRaster
                        direct-only lookdev PBR: Lambert + a GGX lobe, no GI. GI off / RT off.
    Surfel GI           Projects/Project-Drive/Source/SurfelReference
                        the engine's GTX split: sharp direct (sun NEE + sky) plus a persistent world-space
                        surfel field carrying only the bounced light, temporally averaged through a hash grid.
    ReSTIR              Projects/Project-Zero/Host/MaterialLevelViewport --restir
                        the CPU transcription of ReSTIRViewport.slang's reservoir resampling.
    reference           Projects/Project-Zero/Host/MaterialLevelViewport
                        brute-force NEE + power-heuristic MIS through the same MaterialEvaluation.slang
                        compiled 1:1 as C++. The oracle the other three are judged against.

The point of the sheet is that geometry, materials, camera and sun are IDENTICAL across all four; only the
light transport changes. The finite-flake paint, the clearcoat and the transmissive glazing exist as material
lobes that the raster simply does not evaluate, so the difference between column one and the rest is the
honest cost of turning GI off.

    python3 RunDriveRenderModes.py [--width 960] [--height 540] [--spp 12] [--bounce 5] [--view ...]
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import EngineCheckout as Checkout  # noqa: E402
import RunDriveMirror as Drive  # noqa: E402
import DriveLevelPatch  # noqa: E402

ROOT = Checkout.ROOT
SEAT = Drive.SEAT
BUILD = Drive.SCRATCH / "build/rendermodes"
GALLERY = ROOT / "Exhibits/Gallery/RenderModes/Drive"
SUN_HOUR = Drive.SUN_HOUR

# MaterialLevelViewport needs the Drive level author and everything it pulls in. The engine Makefile target
# cannot know about those, so the same flags are issued directly with the extra translation units appended.
HOST = "Projects/Project-Zero/Host"
# The engine's own `make MaterialLevelViewport` source list, VERBATIM and in order, so this build cannot drift
# from the one the product ships...
MLV_SOURCES = [
    f"{HOST}/MaterialLevelViewport.cpp",
    "Exhibits/Workbench/Materials/AtrousDenoiseMirror.cpp",
    "Engine/DisplayPresentation/ShadingTableCodec.cpp",
    "Engine/ContentInterchange/MaterialIndex.cpp",
    "Engine/ContentInterchange/MaterialSwatchStructure.cpp",
    "Engine/ContentInterchange/ShowcaseStructure.cpp",
    "Engine/GeometricRaster/CameraProjection.cpp",
    "Engine/DeviceExchange/OrientationClassifier.cpp",
    "Engine/GeometricRaster/SceneStructure.cpp",
    "Engine/GeometricRaster/GeometryStructure.cpp",
    "Engine/SpatialInterface/InterfaceStructure.cpp",
    "Engine/SpatialInterface/InterfaceSequence.cpp",
    "Engine/SpatialInterface/InterfaceLayoutCodec.cpp",
    "Engine/SpatialInterface/InterfaceLightProjection.cpp",
    "Engine/SpatialInterface/InterfacePointerProjection.cpp",
    "Engine/SpatialInterface/PaletteConfiguration.cpp",
    "Engine/DisplayPresentation/MotionIntegrator.cpp",
    "Projects/Project-Zero/Source/InterfaceTrialSequence.cpp",
    "Projects/Project-Zero/Source/SkyFogIntegrator.cpp",
    # ...plus the Drive level and what it drags in.  DriveSceneAuthor resolves its geometry through
    # VehicleGeometry, which neither stock level needs.
    "Projects/Project-Drive/Source/DriveSceneAuthor.cpp",
    "Engine/PhysicalDynamics/Vehicle/VehicleGeometry.cpp",
]
MLV_INCLUDES = [
    HOST, "Projects/Project-Zero/Shaders", "Projects/Project-Zero/Source", "Engine/Shaders",
    "Engine/DisplayPresentation", "Engine/ContentInterchange", "Engine/DeviceExchange",
    "Engine/GeometricRaster", "Exhibits/Workbench/Materials", "Exhibits/Workbench/Editor",
    "Projects/Project-Drive/Source", "Engine/PhysicalDynamics/Vehicle",
    "ExternalPackages/vulkan-headers/include", "ExternalPackages/stb",
]

SURFEL_SOURCES = ["Projects/Project-Drive/Source/SurfelReference.cpp"]


def log(message: str) -> None:
    print(f"[render-modes] {message}", flush=True)


def write_png_from_ppm(source: Path, target: Path) -> None:
    """SurfelReference writes a binary P6 PPM (it has no PNG dependency); the gallery wants PNG."""
    import struct, zlib
    data = source.read_bytes()
    fields, offset = [], 0
    while len(fields) < 4:
        while offset < len(data) and data[offset:offset + 1].isspace():
            offset += 1
        if data[offset:offset + 1] == b'#':
            while offset < len(data) and data[offset] != 0x0A:
                offset += 1
            continue
        start = offset
        while offset < len(data) and not data[offset:offset + 1].isspace():
            offset += 1
        fields.append(data[start:offset])
    offset += 1
    width, height = int(fields[1]), int(fields[2])
    pixels = data[offset:offset + width * height * 3]
    raw = b''.join(b'\x00' + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (struct.pack('>I', len(payload)) + tag + payload
                + struct.pack('>I', zlib.crc32(tag + payload) & 0xffffffff))

    target.write_bytes(b'\x89PNG\r\n\x1a\n'
                       + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
                       + chunk(b'IDAT', zlib.compress(raw, 6))
                       + chunk(b'IEND', b''))


def stage_denoise() -> Path:
    """The a-trous header MaterialLevelViewport includes is generated, exactly as the Makefile does it."""
    stage = SEAT / HOST / ".staged-denoise"
    stage.mkdir(parents=True, exist_ok=True)
    if not (stage / "AtrousDenoise.cpu.1.h").exists():
        log("staging the a-trous denoise header")
        subprocess.run([sys.executable, "Exhibits/Workbench/Materials/StageAtrousDenoise.py"],
                       cwd=SEAT, check=True, env={"DO_STAGE": str(stage), "PATH": "/usr/bin:/bin"})
    return stage


def compile_binary(name: str, sources: list[str], includes: list[str], extra: list[str] | None = None) -> Path:
    BUILD.mkdir(parents=True, exist_ok=True)
    binary = BUILD / name
    command = ["g++", "-std=c++20", "-O2", "-w", "-DFRONTIER_CPU_PORT", "-pthread",
               "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
               *(extra or []),
               *[f"-I{path}" for path in includes], *sources, "-o", str(binary)]
    log(f"compiling {name} ({len(sources)} translation units)")
    Checkout.run(command, cwd=SEAT)
    return binary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--spp", type=int, default=12)
    parser.add_argument("--bounce", type=int, default=5)
    parser.add_argument("--view", default="default")
    args = parser.parse_args()

    Drive.seat_overlay()
    DriveLevelPatch.main(str(SEAT))
    stage = stage_denoise()

    GALLERY.mkdir(parents=True, exist_ok=True)
    produced: list[tuple[str, str]] = []

    # ---------------------------------------------------------------------------------- 1. visibility raster
    raster = Drive.compile_binary("DriveSceneMirror", [str(Drive.MIRROR), *Drive.ENGINE_SOURCES,
                                                       *Drive.VEHICLE_SOURCES], Drive.INCLUDES)
    frames = Drive.SCRATCH / "tmp/rendermodes-raster"
    if frames.exists():
        shutil.rmtree(frames)
    frames.mkdir(parents=True, exist_ok=True)
    log("rendering the visibility raster")
    # The mirror self-checks that a published sequence is a real sequence (more than eight frames), so a
    # single still is lifted out of a frozen ten-frame orbit rather than asking it for one frame.
    Checkout.run([str(raster), "--frames-out", str(frames), "--width", str(args.width),
                  "--height", str(args.height), "--fps", "10", "--seconds", "1",
                  "--camera", "orbit", "--freeze", "1.0", "--still", "--sun", SUN_HOUR,
                  "--orbit-period", "1000", "--orbit-radius", "8.6", "--orbit-height", "2.2"],
                 cwd=SEAT, quiet=True)
    first = sorted(frames.glob("frame_*.png"))
    if first:
        target = GALLERY / "ProjectDriveRenderMode_VisibilityRaster_CPU_Reference.png"
        shutil.copyfile(first[0], target)
        produced.append((target.name, "VisibilityRaster — GI off, RT off. Lambert + GGX, direct light only."))

    # ---------------------------------------------------------------------------------- 2. Surfel GI
    surfel = compile_binary("SurfelReference", SURFEL_SOURCES,
                            ["Projects/Project-Drive/Source", "Engine/PhysicalDynamics/Vehicle", "."])
    log("rendering Surfel GI")
    Checkout.run([str(surfel)], cwd=SEAT, quiet=True)
    ppm = SEAT / "Projects/Project-Drive/Diagnostics/drive_gi.ppm"
    if ppm.exists():
        target = GALLERY / "ProjectDriveRenderMode_SurfelGI_CPU_Reference.png"
        write_png_from_ppm(ppm, target)
        shutil.copyfile(SEAT / "Projects/Project-Drive/Diagnostics/surfel_timing.log",
                        GALLERY / "SurfelGI_timing.log")
        produced.append((target.name,
                         "SurfelReference — the engine's GTX split: sharp direct light plus a persistent "
                         "world-space surfel field carrying only the bounced light."))

    # ---------------------------------------------------------------------------------- 3/4. ReSTIR + oracle
    mlv = compile_binary("MaterialLevelViewport", MLV_SOURCES, [*MLV_INCLUDES, str(stage)])
    # ReSTIR converges through TEMPORAL REUSE, not sample count: one frame of reservoirs is one candidate per
    # pixel however high --spp goes, which is why a single frame stays noisy no matter what.  The shipped
    # real-time path accumulates frames and then runs the a-trous denoiser, so the proof does both -- rendering
    # it as a one-shot estimator would be measuring the algorithm with its main mechanism switched off.
    for name, flags, caption in (
        ("ReSTIR", ["--restir", "--frames", "32"],
         "MaterialLevelViewport --restir --frames 32 — the CPU transcription of ReSTIRViewport.slang's "
         "reservoir resampling with 32 frames of temporal reuse."),
        ("ReferencePathTracer", [],
         "MaterialLevelViewport — brute-force NEE + power-heuristic MIS through MaterialEvaluation.slang "
         "compiled 1:1 as C++. The oracle, not the shipped real-time path."),
    ):
        out = GALLERY / f"ProjectDriveRenderMode_{name}_CPU_Reference.png"
        log(f"rendering {name} at {args.spp} spp / {args.bounce} bounces")
        Checkout.run([str(mlv), "--level", "drive", "--view", args.view, "--out", str(out),
                      "--width", str(args.width), "--height", str(args.height),
                      "--spp", str(args.spp), "--bounce", str(args.bounce), "--sun", SUN_HOUR, *flags],
                     cwd=SEAT, quiet=True)
        produced.append((out.name, caption))

    log(f"published {len(produced)} renders to {GALLERY.relative_to(ROOT)}")
    for name, caption in produced:
        log(f"   {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
