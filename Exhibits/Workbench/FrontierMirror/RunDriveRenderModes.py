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
import math
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


def gate_not_degenerate(ppm: Path, label: str, minimum_colours: int = 64) -> bool:
    """Refuse to publish a render that carries no picture.

    A renderer that returns one flat colour for every pixel still writes a perfectly valid PNG, and a sheet
    of them looks like a deliverable until somebody opens it. This counts distinct pixel values and declines
    to publish below a floor, so a broken transport path is reported as a gap rather than shipped as a proof.
    """
    data = ppm.read_bytes()
    body = data[data.index(b'255\n') + 4:] if b'255\n' in data[:32] else data[15:]
    colours = {body[i:i + 3] for i in range(0, len(body) - 2, 3)}
    if len(colours) >= minimum_colours:
        return True
    log(f"REFUSING to publish {label}: only {len(colours)} distinct pixel value(s) in the whole frame")
    log(f"   the render path is broken, not merely unlit -- see the note in SurfelReference.cpp BuildScene()")
    return False


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
    parser.add_argument("--frames", type=int, default=24, help="turntable frames per GIF")
    parser.add_argument("--fps", type=int, default=12)
    parser.add_argument("--reuse", type=int, default=12, help="ReSTIR temporal reuse frames per rendered frame")
    parser.add_argument("--gi-frames", type=int, default=16, help="Surfel GI temporal frames per rendered frame")
    args = parser.parse_args()

    Drive.seat_overlay()
    DriveLevelPatch.main(str(SEAT))
    stage = stage_denoise()

    GALLERY.mkdir(parents=True, exist_ok=True)
    produced: list[tuple[str, str]] = []

    turn = args.frames
    def azimuths():
        return [i * 360.0 / turn for i in range(turn)]

    # ---------------------------------------------------------------------------------- 1. visibility raster
    raster = Drive.compile_binary("DriveSceneMirror", [str(Drive.MIRROR), *Drive.ENGINE_SOURCES,
                                                       *Drive.VEHICLE_SOURCES], Drive.INCLUDES)
    frames = Drive.SCRATCH / "tmp/rendermodes-raster"
    if frames.exists():
        shutil.rmtree(frames)
    frames.mkdir(parents=True, exist_ok=True)
    log(f"rendering the visibility raster turntable ({turn} frames)")
    # The raster host owns its own orbit, so it renders the whole turntable in one invocation.
    #
    # --still (a FROZEN car, orbiting camera) is deliberate.  These three GIFs exist to isolate light
    # transport, so the car, the materials, the sun and the camera path must be identical across all three and
    # the ONLY difference may be how light is carried.  Letting the car drive would confound the comparison
    # with pose changes -- and the ray-traced hosts render the level's static pose anyway, so a driving raster
    # would not even be the same scene.  The vehicle-actually-driving proofs are separate artefacts in
    # Exhibits/Gallery/Drive (ChaseRun, TracksideRun, OrbitWhileDriving), where the motion gates DO apply.
    Checkout.run([str(raster), "--frames-out", str(frames), "--width", str(args.width),
                  "--height", str(args.height), "--fps", str(args.fps),
                  "--seconds", f"{turn / args.fps:.3f}", "--still",
                  "--camera", "orbit", "--sun", SUN_HOUR,
                  "--orbit-period", f"{turn / args.fps:.3f}",
                  "--orbit-radius", "8.37", "--orbit-height", "2.20"],
                 cwd=SEAT, quiet=True)
    raster_gif = GALLERY / "ProjectDriveRenderMode_VisibilityRaster_CPU_Reference.gif"
    Drive.assemble_gif(frames, raster_gif, args.fps)
    produced.append((raster_gif.name, "VisibilityRaster — GI OFF, RT OFF. Lambert + a GGX lobe, direct light only."))

    # ---------------------------------------------------------------------------------- 2. Surfel GI
    surfel = compile_binary("SurfelReference", SURFEL_SOURCES,
                            ["Projects/Project-Drive/Source", "Engine/PhysicalDynamics/Vehicle", "."])
    sf_frames = Drive.SCRATCH / "tmp/rendermodes-surfel"
    if sf_frames.exists():
        shutil.rmtree(sf_frames)
    sf_frames.mkdir(parents=True, exist_ok=True)
    log(f"rendering the Surfel GI turntable ({turn} frames)")
    diag = SEAT / "Projects/Project-Drive/Diagnostics"
    degenerate = 0
    for i, deg in enumerate(azimuths()):
        rad = math.radians(deg)
        # Rotate the default eye about the car so all three modes sweep the SAME circle.
        ex = -6.40 * math.cos(rad) - -5.40 * math.sin(rad)
        ey = -6.40 * math.sin(rad) + -5.40 * math.cos(rad)
        Checkout.run([str(surfel), "--w", str(args.width), "--h", str(args.height),
                      "--frames", str(args.gi_frames), "--rays", "8",
                      "--eye", f"{ex:.4f}", f"{ey:.4f}", "2.20",
                      "--aim", "0", "0", "0.70", "--fov", "46",
                      "--name", f"turn_{i:04d}.ppm"], cwd=SEAT, quiet=True)
        ppm = diag / f"turn_{i:04d}.ppm"
        if not gate_not_degenerate(ppm, f"Surfel GI frame {i}"):
            degenerate += 1
        write_png_from_ppm(ppm, sf_frames / f"frame_{i:04d}.png")
        ppm.unlink()
    if degenerate:
        log(f"NOT publishing Surfel GI: {degenerate}/{turn} frames carried no picture")
    else:
        surfel_gif = GALLERY / "ProjectDriveRenderMode_SurfelGI_CPU_Reference.gif"
        Drive.assemble_gif(sf_frames, surfel_gif, args.fps)
        shutil.copyfile(diag / "surfel_timing.log", GALLERY / "SurfelGI_timing.log")
        produced.append((surfel_gif.name,
                         "SurfelReference — GI ON, RT OFF. Sharp direct light plus a persistent world-space "
                         "surfel field carrying only the bounced term, temporally averaged through a hash grid."))

    # ---------------------------------------------------------------------------------- 3. ReSTIR
    mlv = compile_binary("MaterialLevelViewport", MLV_SOURCES, [*MLV_INCLUDES, str(stage)])
    rt_frames = Drive.SCRATCH / "tmp/rendermodes-restir"
    if rt_frames.exists():
        shutil.rmtree(rt_frames)
    rt_frames.mkdir(parents=True, exist_ok=True)
    log(f"rendering the ReSTIR turntable ({turn} frames @ {args.spp} spp, "
        f"{args.reuse} frames of reuse, {args.bounce} bounces)")
    # ReSTIR converges through TEMPORAL REUSE, not sample count: one frame of reservoirs is one candidate per
    # pixel however high --spp goes, which is why a single frame stays noisy at any sample count.
    for i, deg in enumerate(azimuths()):
        Checkout.run([str(mlv), "--level", "drive", "--view", f"orbit@{deg:.3f}",
                      "--out", str(rt_frames / f"frame_{i:04d}.png"),
                      "--width", str(args.width), "--height", str(args.height),
                      "--spp", str(args.spp), "--bounce", str(args.bounce),
                      "--sun", SUN_HOUR, "--restir", "--frames", str(args.reuse)],
                     cwd=SEAT, quiet=True)
    restir_gif = GALLERY / "ProjectDriveRenderMode_ReSTIR_CPU_Reference.gif"
    Drive.assemble_gif(rt_frames, restir_gif, args.fps)
    produced.append((restir_gif.name,
                     "MaterialLevelViewport --restir — GI ON, RT ON. The CPU transcription of "
                     "ReSTIRViewport.slang's reservoir resampling, with temporal reuse."))

    # ---------------------------------------------------------------------------- 4. the oracle, as one still
    # Not one of the three modes asked for; kept as the reference the other three are judged against, and a
    # still because a brute-force turntable costs hours for no extra information.
    oracle = GALLERY / "ProjectDriveRenderMode_ReferencePathTracer_CPU_Reference.png"
    log("rendering the reference path tracer (single still)")
    # Rendered at the GIF's OWN resolution, not a doubled one: it is the reference the turntables are judged
    # against, so it has to be the same pixels. (Doubling it also had the host OOM-killed -- the path tracer
    # holds per-pixel state per thread, so memory grows with resolution x threads.)  The extra quality goes
    # into samples instead, which is where it belongs for an oracle.
    Checkout.run([str(mlv), "--level", "drive", "--view", "orbit@0", "--out", str(oracle),
                  "--width", str(args.width), "--height", str(args.height),
                  "--spp", str(max(64, args.spp * 8)), "--bounce", str(args.bounce), "--sun", SUN_HOUR],
                 cwd=SEAT, quiet=True)
    produced.append((oracle.name,
                     "MaterialLevelViewport — brute-force NEE + power-heuristic MIS through "
                     "MaterialEvaluation.slang compiled 1:1 as C++. The oracle, not a shipped real-time path."))

    # A GIF supersedes the still of the same mode; leaving both behind is how a gallery grows stale copies.
    for mode in ("VisibilityRaster", "SurfelGI", "ReSTIR"):
        stale = GALLERY / f"ProjectDriveRenderMode_{mode}_CPU_Reference.png"
        if stale.exists() and (GALLERY / f"ProjectDriveRenderMode_{mode}_CPU_Reference.gif").exists():
            stale.unlink()
            log(f"removed superseded still {stale.name}")

    log(f"published {len(produced)} artefacts to {GALLERY.relative_to(ROOT)}")
    for name, caption in produced:
        log(f"   {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
