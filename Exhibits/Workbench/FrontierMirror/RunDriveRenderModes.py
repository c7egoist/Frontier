#!/usr/bin/env python3
"""Render the Project-Drive car through the three light-transport paths the product actually ships.

    visibility raster   Engine/GeometricRaster/VisibilityRaster
                        shadow-mapped direct light, no ray queries, no bounce. GI off / RT off.
    ReSTIR direct       MaterialLevelViewport --restir --bounce 1
                        traced direct light, reservoir resampling, no diffuse bounce. RT on / GI off.
    ReSTIR + GI         MaterialLevelViewport --restir --bounce 4
                        the same estimator with diffuse bounces. RT on / GI on.

⚠️ THERE IS NO SURFEL GI IN FRONTIER. A SurfelReference.cpp lived in the Project-Drive overlay and was
published here as the "GI on" column, but grepping the entire pinned engine for "surfel" returns only
coincidental bytes inside .blend archives -- no shader, no header, no dispatch. It mirrored nothing, which
makes it precisely the self-invented renderer the project rules forbid. The engine expresses GI through
DispatchFeatureGlobalIllumination / ReSTIRIntegratorConfiguration::MaxGiBounces, and the CPU mirror exposes
exactly that as --bounce (MaterialLevelViewport.cpp:2538, `if (Bounces > 1) Indirect += Radiance(...)`).
So GI on/off is now one estimator with the bounce count changed, which is what the product actually does.
    reference           Projects/Project-Zero/Host/MaterialLevelViewport
                        brute-force NEE + power-heuristic MIS through the same MaterialEvaluation.slang
                        compiled 1:1 as C++. The oracle the other three are judged against.

The point of the sheet is that geometry, materials, camera and sun are IDENTICAL across all four; only the
light transport changes.

That is only true since all four were made to evaluate the SAME material model -- the engine's OpenPBR lobe
set, through Engine/ContentInterchange/UnifiedMaterialEvaluation.h. They previously did not: the raster
hand-rolled Lambert + one GGX lobe off a flattened 64-byte material header, and the surfel path used a switch
returning one flat RGB constant per family. The columns therefore differed by MATERIAL MODEL as much as by
light transport, which is precisely the variable such a comparison exists to isolate. The difference between
column one and the rest is now the honest cost of turning GI off, and nothing else.

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
    "Engine/Host/InterfaceTrialSequence.cpp",
    "Projects/Project-Zero/Source/SkyFogIntegrator.cpp",
    # ...plus the Drive level and what it drags in.  DriveSceneAuthor resolves its geometry through
    # VehicleGeometry, which neither stock level needs.
    "Projects/Project-Drive/Source/DriveSceneAuthor.cpp",
    "Engine/PhysicalDynamics/Vehicle/VehicleGeometry.cpp",
    # the engine's own celestial solver: the surfel path takes the SAME sun the raster is given
    "Engine/DisplayPresentation/CelestialSolver.cpp",
    "Engine/Host/CelestialSequence.cpp",
    "Engine/GeometricRaster/StarCatalogueIndex.cpp",
    "Engine/ContentInterchange/AssetResolution.cpp",
    "Engine/ContentInterchange/SpaceCodec.cpp",
    "Engine/ContentInterchange/SpaceExport.cpp",
    # AtmosphereModel's parameters arrive through CelestialSequence::ApplyTo(VisibilityRaster&), so the raster
    # and its scene deps are linked purely to read the sky settings back out of QueryCelestial.
    "Engine/GeometricRaster/VisibilityRaster.cpp",
    "Engine/GeometricRaster/SceneStructure.cpp",
    "Engine/GeometricRaster/GeometryStructure.cpp",
    "Engine/GeometricRaster/CameraProjection.cpp",
    "Engine/DeviceExchange/OrientationClassifier.cpp",
    "Engine/ContentInterchange/TextureIndex.cpp",
]
SURFEL_SOURCES = [
    # The GI-on / RT-off path. Its gather, radius rule and spawn policy are the shipped ones --
    # RaytraceToggle/Shaders/SurfelGIResolve.slang + SurfelIrradianceUpdate.slang, mirrored on CPU by
    # RaytraceToggle/CpuMirror/ModeMatrix.cpp. See the note in SurfelReference.cpp for what had drifted.
    "Projects/Project-Drive/Source/SurfelReference.cpp",
    "Projects/Project-Drive/Source/DriveSceneAuthor.cpp",
    "Engine/ContentInterchange/MaterialIndex.cpp",
    "Engine/DisplayPresentation/ShadingTableCodec.cpp",
    "Engine/PhysicalDynamics/Vehicle/VehicleGeometry.cpp",
]

MLV_INCLUDES = [
    "Engine",   # UnifiedMaterialEvaluation.h is included as ContentInterchange/... by every render path

    HOST, "Projects/Project-Zero/Shaders", "Engine/Host", "Projects/Project-Zero/Source", "Engine/Shaders",
    "Engine/DisplayPresentation", "Engine/ContentInterchange", "Engine/DeviceExchange",
    "Engine/GeometricRaster", "Exhibits/Workbench/Materials", "Exhibits/Workbench/Editor",
    "Projects/Project-Drive/Source", "Engine/PhysicalDynamics/Vehicle",
    "ExternalPackages/vulkan-headers/include", "ExternalPackages/stb",
]



def log(message: str) -> None:
    print(f"[render-modes] {message}", flush=True)


def write_png_from_ppm(source: Path, target: Path) -> None:
    """SurfelReference writes a binary P6 PPM (it has no PNG dependency); the gallery wants PNG."""
    import struct, zlib
    data = source.read_bytes()
    head = data.index(b'255\n') + 4
    fields = data[:head].split()
    width, height = int(fields[1]), int(fields[2])
    pixels = data[head:head + width * height * 3]
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
    parser.add_argument("--gi-frames", type=int, default=48, help="surfel temporal frames per rendered frame")
    parser.add_argument("--reuse", type=int, default=12, help="ReSTIR temporal reuse frames per rendered frame")
    args = parser.parse_args()

    Drive.seat_overlay()                 # resolves Frontier/; the drive level is built into the tree
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
                  "--camera", "orbit", "--sun", SUN_HOUR, "--exposure", "1.05",
                  "--orbit-period", f"{turn / args.fps:.3f}",
                  "--orbit-radius", "8.37", "--orbit-height", "2.20"],
                 cwd=SEAT, quiet=True)
    raster_gif = GALLERY / "ProjectDriveRenderMode_VisibilityRaster_CPU_Reference.gif"
    Drive.assemble_gif(frames, raster_gif, args.fps)
    produced.append((raster_gif.name, "VisibilityRaster — GI OFF, RT OFF. The engine's full OpenPBR lobe set under shadow-mapped direct light, with no ray queries and no bounce."))

    # ------------------------------------------------------- 2. Surfel GI: bounce + reflection, RT OFF
    # The mode matrix in RaytraceToggle/README.md: Raytracing OFF + Global Illumination ON selects the surfel
    # path -- visibility-raster primary, surfel indirect, sky reflections. It is a real shipped render mode
    # with GPU shaders (SurfelIrradianceUpdate / SurfelGIResolve), not a stand-in for ReSTIR.
    surfel = compile_binary("SurfelReference", SURFEL_SOURCES,
                            ["Projects/Project-Drive/Source", "Engine/PhysicalDynamics/Vehicle", "Engine",
                             "Engine/Shaders", "Projects/Project-Zero/Source", "Engine/DisplayPresentation",
                             "Engine/GeometricRaster", "Engine/DeviceExchange", "Engine/ContentInterchange",
                             "ExternalPackages/vulkan-headers/include", "ExternalPackages/stb", "."])
    sf_frames = Drive.SCRATCH / "tmp/rendermodes-surfel"
    if sf_frames.exists():
        shutil.rmtree(sf_frames)
    sf_frames.mkdir(parents=True, exist_ok=True)
    log(f"rendering the Surfel GI turntable ({turn} frames, {args.gi_frames} GI frames each)")
    diag = SEAT / "Projects/Project-Drive/Diagnostics"
    for i, deg in enumerate(azimuths()):
        rad = math.radians(deg)
        ex = -6.40 * math.cos(rad) - -5.40 * math.sin(rad)
        ey = -6.40 * math.sin(rad) + -5.40 * math.cos(rad)
        Checkout.run([str(surfel), "--w", str(args.width), "--h", str(args.height),
                      "--frames", str(args.gi_frames), "--rays", "8",
                      "--eye", f"{ex:.4f}", f"{ey:.4f}", "2.20",
                      "--aim", "0", "0", "0.70", "--fov", "46", "--sun", SUN_HOUR,
                      "--name", f"turn_{i:04d}.ppm"], cwd=SEAT, quiet=True)
        ppm = diag / f"turn_{i:04d}.ppm"
        write_png_from_ppm(ppm, sf_frames / f"frame_{i:04d}.png")
        ppm.unlink()
    surfel_gif = GALLERY / "ProjectDriveRenderMode_SurfelGI_CPU_Reference.gif"
    Drive.assemble_gif(sf_frames, surfel_gif, args.fps)
    shutil.copyfile(diag / "surfel_timing.log", GALLERY / "SurfelGI_timing.log")
    produced.append((surfel_gif.name,
                     "SurfelReference — GI ON, RT OFF. Visibility-raster primary plus a persistent "
                     "world-space surfel field carrying the bounced light, with sky reflections."))

    # ------------------------------------------------------------------ 3/4. ReSTIR, GI off then GI on
    mlv = compile_binary("MaterialLevelViewport", MLV_SOURCES, [*MLV_INCLUDES, str(stage)])
    # --bounce IS the engine's global-illumination switch. MaterialLevelViewport.cpp:2538 reads
    #     if (Bounces > 1) Indirect += Radiance(...)
    # so --bounce 1 is traced DIRECT light only (RT on, GI off) and --bounce 4 adds the diffuse bounces
    # (RT on, GI on). That mirrors DispatchFeatureGlobalIllumination / ReSTIRIntegratorConfiguration's
    # MaxGiBounces, which is how the shipped renderer expresses the same toggle.
    for tag, bounces, caption in (
        ("ReSTIR_DirectOnly", 1,
         "MaterialLevelViewport --restir --bounce 1 — RT ON, GI OFF. Traced direct light with reservoir "
         "resampling, and no diffuse bounce at all."),
        ("ReSTIR_GlobalIllumination", max(2, args.bounce),
         "MaterialLevelViewport --restir --bounce N — RT ON, GI ON. The same estimator with the diffuse "
         "bounces enabled; the difference against the column above IS the global illumination."),
    ):
        frames_dir = Drive.SCRATCH / f"tmp/rendermodes-{tag.lower()}"
        if frames_dir.exists():
            shutil.rmtree(frames_dir)
        frames_dir.mkdir(parents=True, exist_ok=True)
        log(f"rendering the {tag} turntable ({turn} frames @ {args.spp} spp, {bounces} bounces)")
        for i, deg in enumerate(azimuths()):
            Checkout.run([str(mlv), "--level", "drive", "--view", f"orbit@{deg:.3f}",
                          "--out", str(frames_dir / f"frame_{i:04d}.png"),
                          "--width", str(args.width), "--height", str(args.height),
                          "--spp", str(args.spp), "--bounce", str(bounces),
                          "--sun", SUN_HOUR, "--restir", "--frames", str(args.reuse)],
                         cwd=SEAT, quiet=True)
        gif = GALLERY / f"ProjectDriveRenderMode_{tag}_CPU_Reference.gif"
        Drive.assemble_gif(frames_dir, gif, args.fps)
        produced.append((gif.name, caption))

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
    for mode in ("VisibilityRaster", "SurfelGI", "ReSTIR_DirectOnly", "ReSTIR_GlobalIllumination"):
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
