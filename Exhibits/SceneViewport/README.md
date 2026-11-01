# Scene Viewport — the live ReSTIR GI port with the PlanetaryAtmosphere environment

## Result

The Everest workspace's **Scene Viewport** no longer draws a schematic. It presents the 1:1 C++/Vulkan/Slang port of the
VehicleHMI demo's ReSTIR GI (`Exhibits/RestirGiParity`) live. The scene is the demo's own **proving ground with no car**.
The **PlanetaryAtmosphere** environment is overlaid on it: atmosphere, sun disc, lens flare, volumetric clouds, height
fog lit by the scene's lamps, Luna and Ember from the six-body atlas, ringed and banded planets, and Hipparcos stars.
The level's records drive all of it, and they can be edited in the Inspector.

| Daylight — the level as authored | Low sun — flare, long shadows |
|---|---|
| ![Daylight](Images/Daylight.png) | ![Low sun](Images/LowSunFlare.png) |
| **Dusk — fog lit by the street lamps** | **Night — Luna, Ember, Jupiter, Mars, stars** |
| ![Dusk](Images/DuskFogLamps.png) | ![Night](Images/NightMoonsPlanetsStars.png) |

The four images come from the same `SceneViewport` the editor uses, rendered offscreen on SwiftShader at 480 × 270
(quality `low`, 12 refreshes each) from the stored SPIR-V in `EngineContent/ShaderArchives`. The camera and records are
listed in `Code/SceneViewportValidation.cpp`.

![Everest workspace with the live Scene Viewport](Images/EverestLiveSceneViewport.png)

That capture runs the real `EverestWorkspace` and the same `EverestSceneViewport` bridge the editor uses, through the
level's records (`Default.levelspace`, quality tier 2 → `high`, 1028 × 482). The bridge opens a device of its own here,
reads the presented image back, and the interface is CPU-rasterized at 1920 × 1080
(`Code/SceneViewportWorkspaceCapture.cpp`, log in `Results/SceneViewportWorkspaceCapture.txt`). The Log Stream shows the
viewport's bring-up line. In the editor, the image stays on the GPU and ImGui samples it directly.

## Layout

```text
Frontier/Engine/
├── DeviceExchange/VulkanDeviceAccess.h       the editor's Vulkan device as the exchanges attach to it
├── Rendering/
│   ├── GlobalIllumination/                   the 1:1 port (namespace Frontier::GlobalIllumination)
│   │     IlluminationHost, SceneStructure, BoundingStructure, OccupantDistanceSpace, SceneDistanceSpace,
│   │     SurfaceCardDepot, RayTracingSpace, AtmosphereIntegrator, ShadowProjection, SurfaceProjection,
│   │     ResamplingSequence, DisplayProjection, RefreshEncoding, EnvironmentEncoding, LuminaireRegister, …
│   └── SceneViewport/                        SceneViewport (bring-up + refresh) and EnvironmentOverlay
└── Shaders/GlobalIllumination/*.slang        54 Slang units, 31 SPIR-V entries
EngineContent/ShaderArchives/
├── GlobalIllumination/                       stored SPIR-V of the port (31) + ShaderCompilation.json
└── Environment/                              stored SPIR-V of PlanetaryAtmosphere (15) + ShaderCompilation.json
Projects/Everest/Source/EverestSceneViewport  level records → SceneViewport
```

## How it is wired

```
VulkanPresentation (Vulkan 1.3 + dynamicRendering, scalar layouts, draw parameters — SceneRendering)
   │  QueryDeviceAccess() → VulkanDeviceAccess
   ├─ DeviceExchange::AttachDevice          illumination port     ─┐  one VkDevice, one queue, the editor's thread
   └─ VulkanComputeExchange::AttachDevice   PlanetaryAtmosphere   ─┘
EverestWorkspace::ConstructViewportSurface   orbit (RMB) · pan (MMB) · dolly (wheel) · fly (RMB + WASD/QE) · F recentres
   └─ PresentSceneViewport(request) → EverestSceneViewport::Render(request, level records)
        └─ SceneViewport::Refresh
             ① AdvanceCelestial → ResolveLight → light-change relighting (10° / 30 %) → EncodeEnvironment
               → RefreshConstants; LuminaireRegister (20 street lamps + 10 lamp posts) — all ported 1:1
             ② distance union, shadow cascades, card lighting, surface, direct, ReSTIR GI, reflection, SVGF, resolve
             ③ EnvironmentVisibility: resolved radiance × scale + reversed depth + rays → the environment's 4 layers
             ── submit ──  PlanetaryAtmosphere: LUTs (dirty-gated) · cloud shadows · dome · clouds · fog · flare
             ④ RestoreEnvironmentRadiance → the port's DisplayPresent tone-maps the overlaid image → full dependency
   ImGui_ImplVulkan_AddTexture(presented view, GENERAL) → AddImage over the panel
```

- **One device.** With `ApplicationWindowCallbacks::SceneRendering`, the presentation device carries everything
  `DeviceExchange::Initialize` enables. Both exchanges attach to it and never destroy it. Every submission is ordered
  on the presentation queue. The present submission ends with a global dependency, so the interface submission that
  samples the image comes after it. Resizing retires the queue before the screen targets are replaced, and the targets
  follow the panel once its size has held still for six interface ticks.
- **No car.** `IlluminationAssets::OmitVehicle` deactivates the body and four wheels before bring-up. Inactive occupants
  are skipped by every step, as idle fragments are. The file still contains them, for when vehicles come back.
- **The demo's own sky still lights the scene.** Only the visible environment is PlanetaryAtmosphere. The refresh keeps
  the demo's sun, moon light, sky irradiance and luminaires, and the level's Solar, Moons and Atmosphere records drive
  both. The demo's own fog, aerial perspective and flare are switched off in the refresh, because the environment draws
  them. The environment does not relight the scene: cloud shadows do not darken it.

## Records → viewport

| Level record | Illumination refresh (the demo's sky) | PlanetaryAtmosphere |
|---|---|---|
| `Solar` | `SunElevation`, `SunAzimuth` (counter-clockwise from +X east), `SolarIlluminance` = 12 × klx / 98, `SunTemperature`, `SunRadius` | sun direction; disc irradiance = demo tint × illuminance, in environment units; disc radius |
| `OpticalFlare` | — (the demo flare stays off) | flare gain, aperture blades, halo radius, chromatic shift, anamorphic and starburst toggles |
| `Atmosphere` | `Rayleigh`, `Mie` = (turbidity − 1) / 1.4, `Ozone`, `MieG`, on/off | the same scales on the Earth reference, planet radius, thickness, aerial perspective |
| `Clouds` | — | one cumulus slab: base, thickness, coverage, density, wind drift, silver lining |
| `Stars` | stars, planets on/off | Hipparcos limit from the count, brightness, Milky Way, scintillation, sidereal speed |
| `Moons` | primary moon direction on the sky path; phase from the sun–moon angle | Luna (and Ember when the secondary moon is on) at their orbit angles |
| `Fog` | — | height fog: density, falloff height = 1 / falloff, base altitude, phase; lamps as fog luminaires |
| `Wind` | — | cloud advection |
| `RenderPipeline` | quality tier → `low` / `medium` / `high`; RTX tier → ReSTIR path tracer or GTX distance field; GI, TAA and exposure toggles | — |

The sky is placed for the demo's date, time and observer: 2026-10-20, 12:00, −26.18°, 28.32°. The Hipparcos stars are
rotated from the catalogue's J2000 axes by the demo's sidereal angle. The planets come from the demo's own orbital
solver (`CelestialSolver.js`, ported).

## Radiometric scale

PlanetaryAtmosphere's constants are tuned for a sun irradiance of about 1.38, while the illumination port's sun is 12.
These constants include the cloud and fog skylight, the night floor and the star flux. Both sides keep their balance:

- The resolved radiance enters the environment multiplied by `ResolveEnvironmentRadianceScale`, and
  `RestoreEnvironmentRadiance` divides the overlaid image back before present. The port's eye adaptation never sees
  the conversion.
- The scale is the daylight unit 1.38 / 12, divided by the share of skylight left at the sun's elevation:
  e^((elevation − 6°)/3°), clamped to [0.002, 1]. As a result, the environment's constant daylight skylight fades through
  twilight. Clouds and fog are lit only by the moon, the stars and the lamps at night.
- Stars and the Milky Way are scaled so that under the port's night exposure (at most 0.82) they read as they do under
  the environment's own night exposure (2.9).

## 1:1 host encoders added for the live path

`EncodeEnvironment` (`EnvironmentSettings.js`), the orbital solver (`CelestialSolver.js`), the moon roster
(`CelestialAtlas.js`) and `LightingSystem.Update` / `BuildClusterGrid` (`LuminaireRegister`) are ported statement for
statement. `RestirGiParityValidation … live` takes neither the environment block nor the luminaire register from the
capture. Over all 12 refreshes, the demo's `Frame record` (1,072 B) and `Clustered light records` (12,320 B) writes are
byte-identical to the port's. The solver's planets agree to 8.4 × 10⁻¹⁶ and its sidereal angle exactly. After the
renaming the log again has 150 checks and 0 failures; every deterministic stage is unchanged, and the presented image
matches 99.98 % of 8-bit values (84.4 dB; 99.94 % before, the stochastic stages vary run to run as two runs of the demo
do). See `Results/ParityLiveNativeEnvironment.txt`.

## Shaders: Slang sources, stored SPIR-V

Every shader is a `.slang` unit: the port's 54 units in `Frontier/Engine/Shaders/GlobalIllumination` and the
PlanetaryAtmosphere units in `Frontier/Engine/Shaders`. CMake compiles them to SPIR-V 1.3 with the pinned Slang compiler
(`Automation/PrepareVulkanCompute.py`, slangc 2026.14.1).

So that an editor build without that compiler (for example MSVC on Windows) still runs the viewport, the compiled
archives are also stored in `EngineContent/ShaderArchives/{GlobalIllumination,Environment}`:

- The editor build copies `EngineContent` beside `Frontier.exe`, stored archives included. A set the build compiled
  replaces its stored copy afterwards.
- The port's units compile only with the pinned compiler by default, so every build presents the SPIR-V the parity
  validation measured. `-DFRONTIER_GLOBAL_ILLUMINATION_SLANGC=<slangc>` selects another compiler.
- `Automation/StoreShaderArchives.py --build <build> --compiler <slangc>` refreshes the stored archives after a shader
  change. `ShaderCompilation.json` records the compiler and the SHA-256 of every source and archive.
- CTest `StoredShaderArchiveValidation` fails when a Slang source changed without refreshing the stored archives. When
  the build compiled a set with the pinned compiler, the test also requires the compiled and stored SPIR-V to be
  byte-identical. Recompiling from scratch reproduced all 46 stored archives byte for byte.

## Checks

`Code/SceneViewportValidation.cpp` (log: `Results/SceneViewportValidation.txt`) checks the following:

- the environment is overlaid on the illumination device;
- the vehicle is deactivated;
- the 20 street lamps and 10 lamp posts are placed from the scene;
- every image is lit;
- the daylight sky is bright;
- the low sun saturates;
- the night sky is darker than the day and shows stars.

## Build and run it yourself (Windows)

1. Fonts, once: `python -m pip install -r Automation/FontRequirements.txt`, then `python Automation/PrepareFonts.py`.
2. In a Visual Studio x64 developer prompt at the repository root:

   ```bat
   cmake -S . -B Build/Editor -A x64
   cmake --build Build/Editor --config Release --target Frontier
   Build\Editor\Release\Frontier.exe
   ```

3. Started from the repository root, the Project Browser lists **Project Everest** (`Projects/Everest`). Open it, and
   the Scene Viewport brings the scene up. Started from elsewhere, open `Projects/Everest/Everest.projectspace` through
   the browser.

No Slang compiler is needed for this: the stored archives are used. A ready-made package is built with
`Automation/PackageEditorPreviewWindows.py` (see Distribution below).

## Reproduce (Linux host, SwiftShader)

```sh
# Proving-ground content from a reference capture (Exhibits/RestirGiParity/Code/CaptureReference.sh)
python3 Exhibits/SceneViewport/Code/ExportProvingGround.py <capture> EngineContent/EnvironmentArchives/ProvingGround
# Offscreen images (SwiftShader: FRONTIER_VULKAN_DRIVER / VK_ICD_FILENAMES as in the parity README)
build/SceneViewportValidation EngineContent/ShaderArchives/GlobalIllumination EngineContent/ShaderArchives/Environment \
    EngineContent/EnvironmentArchives/ProvingGround EngineContent/EnvironmentArchives/CelestialMaps out low 480 270 12
# Everest workspace with the live viewport
build/SceneViewportWorkspaceCapture EngineContent Projects/Everest EngineContent/ShaderArchives out/EverestLiveSceneViewport.png 12
```

The build stages `EnvironmentArchives/ProvingGround` into `Projects/Everest/Content` through the project's content
imports.

## Distribution

`Automation/PackageEditorPreviewWindows.py --executable <build>/Frontier.exe --toolchain "<toolchain>"` packages
`Frontier.exe` with `EngineContent` (shader archives included), Project Everest with its staged content, the licence
notices, `WindowsPreviewReadme.md` as `README.md` and a `Package.json` with a SHA-256 for every file. It checks the
executable is Windows x64 PE32+, the SPIR-V archives are complete and well-formed and the fonts match their catalogue.

## Not claimed

- **Hardware.** Every image here was rendered on SwiftShader (CPU Vulkan): about 12–19 s per refresh at 480 × 270, and
  about 51 s at the workspace's 1028 × 482 `high` tier. No hardware GPU and no Windows desktop session was run.
- **Windows.** The Windows editor target was cross-compiled and linked with the repository's pinned Zig 0.13.0
  `x86_64-windows-gnu` toolchain (`Automation/WindowsToolchain.cmake`), configured without a Slang compiler so it used
  the stored archives. It imports only Windows system DLLs and the UCRT, and loads `vulkan-1.dll` at run time. It was
  never launched, and MSVC was not run.
- **Environment lighting the scene.** The environment does not relight the illumination. Cloud shadows, environment
  moonlight and fog shadowing do not reach the GI scene, which is lit by the demo's own sky model.
- **Moon phase record.** Moon phase follows the sun–moon geometry. The `Moons` record's phase value is not used.
- **Synchronous submissions.** Submissions are synchronous (one fence wait per step group). Pipelining the viewport
  with the interface is future work.
