# Frontier editor — Scene Viewport preview (Windows x64)

This folder runs as extracted. Keep `Frontier.exe`, `EngineContent/` and `Projects/` side by side.
`Package.json` lists anything left out of this download under `omitted`: the small download leaves out the Texture
Studio material archives, which the Scene Viewport does not read.

## Run

1. Start `Frontier.exe`. The Project Browser opens and lists **Project Everest**. The Zig build (`Package.json` →
   `toolchain`) also opens a console window with the log output; closing it closes the editor. The MSVC build has none.
2. Open Everest. The **Scene Viewport** panel brings up the live renderer. The first bring-up takes a while,
   because the distance volumes, surface cards and BVH are built from the scene. The panel shows the schematic and a
   status line until the first image is ready.
   - To skip the browser, run `Frontier.exe Projects\Everest\Everest.projectspace`, or drop the `.projectspace` file
     on `Frontier.exe`.
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

## If it does not start

- The failure dialog names what was missing or refused, and the path of the diagnostic file:
  `%LOCALAPPDATA%\Frontier\Logs\Frontier-<number>.log`. That file is the most useful thing to send back.
- The journal records start-up, the Vulkan device, the project that opened and the Scene Viewport's first statuses
  (renderer, extent, refresh time), so a viewport problem on a particular GPU shows up there too.
- Keep the extracted folder together: `Frontier.exe` reads `EngineContent/ShaderArchives/Surface` (Project Browser),
  `GlobalIllumination` and `Environment` (Scene Viewport) beside itself.

## Not verified

- This build is **unsigned** and was **not antivirus-scanned**. Windows SmartScreen or the browser may warn about it.
  Do not turn protection off. If the download or start is blocked, build from source instead (see the repository's
  `Exhibits/SceneViewport/README.md`).
- `Package.json` → `toolchain` says how this copy was built: the repository's pinned Zig cross-toolchain on Linux, or
  MSVC. Releases on GitHub are launched on a GitHub Windows runner with a CPU Vulkan driver before they are published;
  the release notes carry that run's result and screenshots. No copy has been run on a hardware GPU by the authors, and
  all rendering evidence in the repository comes from CPU Vulkan drivers.
- Known gaps:
  - the environment does not relight the scene (cloud shadows and environment moonlight do not reach it);
  - the `Moons` record's phase value is unused (the phase follows the sun–moon geometry);
  - viewport submissions are synchronous.

`Package.json` lists the source revision, the toolchain and a SHA-256 for every file.
