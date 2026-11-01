# Frontier editor — Scene Viewport preview (Windows x64)

This folder runs as extracted. Keep `Frontier.exe`, `EngineContent/` and `Projects/` side by side.

## Run

1. Start `Frontier.exe`. The Project Browser opens and lists **Project Everest**. A console window opens beside it
   with the log output; closing it closes the editor.
2. Open Everest. The **Scene Viewport** panel brings up the live renderer. The first bring-up takes a while,
   because the distance volumes, surface cards and BVH are built from the scene. The panel shows the schematic and a
   status line until the first image is ready.
3. Camera controls:
   - right mouse drag: orbit;
   - middle mouse drag: pan;
   - mouse wheel: dolly;
   - hold the right mouse button and use W/A/S/D/Q/E: fly;
   - F: recentre.
4. Select the level's environment records in the Scene Directory and edit them in the Inspector:
   `Solar`, `OpticalFlare`, `Atmosphere`, `Clouds`, `Stars`, `Moons`, `Fog`, `Wind` and `RenderPipeline`.
   - `RenderPipeline` quality tier 0/1/2 selects the demo's `low`/`medium`/`high` grade.
   - The hardware ray query (RTX) tier selects the ReSTIR path tracer. Turning it off selects the distance-field GI
     (GTX path). Changing a tier rebuilds the viewport.

## What you are looking at

- The 1:1 C++/Vulkan/Slang port of the VehicleHMI demo's ReSTIR GI renders the demo's proving ground, without the car.
- The PlanetaryAtmosphere environment is drawn over it: atmosphere, sun, lens flare, volumetric clouds, height fog lit by
  the street lamps, moons, planets and Hipparcos stars.
- Everything runs on the editor's own Vulkan 1.3 device and queue.

## Requirements

- Windows 10/11 x64.
- A GPU and driver with Vulkan 1.3, dynamic rendering, scalar block layout and shader draw parameters.
- The RTX path needs `VK_KHR_ray_query` and acceleration structures. Without them, set the ray query tier off.

If the viewport cannot start, its status line says why. The same message is written to the Log Stream panel and to
the diagnostic journal.

## Not verified

- This build is **unsigned** and was **not antivirus-scanned**. Windows SmartScreen or the browser may warn about it.
  Do not turn protection off. If the download or start is blocked, build from source instead (see the repository's
  `Exhibits/SceneViewport/README.md`).
- It was cross-compiled on Linux with the repository's pinned Zig toolchain and **never launched on Windows** or on a
  hardware GPU. All rendering evidence comes from SwiftShader (CPU Vulkan).
- Known gaps:
  - the environment does not relight the scene (cloud shadows and environment moonlight do not reach it);
  - the `Moons` record's phase value is unused (the phase follows the sun–moon geometry);
  - viewport submissions are synchronous.

`Package.json` lists the source revision, the toolchain and a SHA-256 for every file.
