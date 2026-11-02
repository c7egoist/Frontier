# Scene Viewport — the live ReSTIR GI port with the PlanetaryAtmosphere environment

## Result

The Everest workspace's **Scene Viewport** no longer draws a schematic. It presents the 1:1 C++/Vulkan/Slang port of the
VehicleHMI demo's ReSTIR GI (`Exhibits/RestirGiParity`) live. The scene is the demo's own **proving ground with no car**.
The **PlanetaryAtmosphere** environment is overlaid on it: atmosphere, sun disc, lens flare, volumetric clouds, height
fog lit by the scene's lamps, Luna and Ember from the six-body atlas, ringed and banded planets, and Hipparcos stars.
The level's records drive all of it, and they can be edited in the Inspector.

Since 2026-11-02 the environment also **lights the scene** (the owner's Option A). Its sun through its own air is the
key light, and at night Luna and Ember are. Its sky is the sky view that every bounce and reflection samples. Its clouds
shade the ground, and the scene's sun cascades shadow the fog's sun shafts. The GI algorithms are unchanged: the
environment only feeds the inputs the ported units already read (see *How it is wired*). The four planets are level
records in the Scene Directory, like the sun, the moons and the stars.

| Daylight — the level as authored | Low sun — flare, long shadows |
|---|---|
| ![Daylight](Images/Daylight.png) | ![Low sun](Images/LowSunFlare.png) |
| **Dusk — fog lit by the street lamps** | **Night — Luna, Ember, Jupiter, Mars, stars** |
| ![Dusk](Images/DuskFogLamps.png) | ![Night](Images/NightMoonsPlanetsStars.png) |

The four images come from the same `SceneViewport` the editor uses, with the environment lighting the scene. They were
rendered offscreen on SwiftShader at 480 × 270 (quality `low`, 12 refreshes each) from the stored SPIR-V in
`EngineContent/ShaderArchives`. The cameras and records are listed in `Code/SceneViewportValidation.cpp`. What the
environment fed each refresh:

| Scenario | Key light (refresh units) | Sky view, zenith | Cloud shadow map | Image: sky / ground |
|---|---|---|---|---|
| Daylight | sun (10.86, 8.53, 6.20) | (0.165, 0.400, 1.220) | 39.6 % of the map shaded, τ up to 3.80 | 0.729 / 0.272 |
| Low sun, 8° | sun (7.96, 4.18, 1.53): red/blue 5.20 against 1.75 by day | (0.084, 0.191, 0.562) | 42.3 %, τ up to 9.21 | 0.674 / 0.254 |
| Dusk, −4° | sun 0 (below the horizon) | (0.006, 0.006, 0.017) | — (no sun) | 0.134 / 0.148 |
| Night, −28° | Luna + Ember (0.064, 0.064, 0.067) from Luna's direction | 0 | — | 0.003 / 0.041 |

Before Option A, the same four views measured sky / ground 0.863 / 0.395, 0.787 / 0.397, 0.161 / 0.176 and 0.003 / 0.045.
The scene is now darker where the clouds shade it, and cooler under the environment's blue sky.

![Fog sun shafts: shafted, unshadowed, difference](Images/FogSunShafts.png)

*The fog's sun shafts.* Left: the low sun with the fog shadowed by the scene's sun cascades. Middle: the next refresh
with `Fog.ReceiveRayShadow` off. Right: the difference, ×4. Orange is light that the shadows of the posts, gantry and
buildings remove from the haze. Blue is antialiasing jitter between consecutive refreshes. Over the whole frame the
overlaid radiance is 0.767 shafted, 0.771 unshadowed and 0.767 shafted again (three consecutive refreshes at the same
clock), so the shafts take 0.42 % of the frame's light. The drift between the two shafted refreshes is 0.02 %.

![Everest workspace with the live Scene Viewport](Images/EverestLiveSceneViewport.png)

That capture runs the real `EverestWorkspace` and the same `EverestSceneViewport` bridge the editor uses, through the
level's records (`Default.levelspace`, quality tier 2 → `high`, 1028 × 482). The bridge opens a device of its own here,
reads the presented image back, and the interface is CPU-rasterized at 1920 × 1080
(`Code/SceneViewportWorkspaceCapture.cpp`, log in `Results/SceneViewportWorkspaceCapture.txt`). The Log Stream shows the
viewport's bring-up line. In the editor, the image stays on the GPU and ImGui samples it directly. This capture was made
before Option A, so it still shows the demo's own lighting under the overlay.

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
└── Shaders/GlobalIllumination/*.slang        55 Slang units, 33 SPIR-V entries (EnvironmentVisibility and
                                              EnvironmentLighting bridge to the environment; the rest is the port)
EngineContent/ShaderArchives/
├── GlobalIllumination/                       stored SPIR-V of the port (33) + ShaderCompilation.json
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
             ① AdvanceCelestial → ResolveLight → AdjustLight* → light-change relighting (10° / 30 %) → EncodeEnvironment
               → RefreshConstants; LuminaireRegister (20 street lamps + 10 lamp posts) — all ported 1:1
               * the environment's transmitted sun replaces the demo's air mass; at night Luna + Ember are the key light
             ── BeforeRecording ──  realm resolved; PlanetaryAtmosphere: LUTs · sky view · cloud shadow map
               (ExecuteSkyAndShadows); the bridge profile and the port's CloudShadowParams written
             ② sky view → ProjectEnvironmentSky (the environment's sky over the port's sky view)
                        → ProjectCloudShadow (its cloud shadow map → the port's projected cloud shadows)
               distance union, shadow cascades, card lighting, surface, direct, ReSTIR GI, reflection, SVGF, resolve
             ③ EnvironmentVisibility: resolved radiance × scale + reversed depth + rays → the environment's 4 layers
             ── submit ──  PlanetaryAtmosphere: dome · clouds · fog (sun shafts through the port's sun cascades) · flare
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
- **The environment lights the scene** (`SceneViewportConfiguration::EnvironmentLighting`, on in the editor). Three
  hooks of `RefreshInterlude` carry it, and every ported unit keeps reading its inputs exactly as before:
  - *Sun.* `AdjustLight` passes the sun through the environment's own air (`ResolveAirTransmittance`, the
    transmittance its sky uses) instead of the demo's 64-step air mass. It keeps the same direction, the level's colour
    temperature and the demo's horizon fade. `CelestialSky` keeps drawing its analytic disc, in that colour.
  - *Night.* Below the demo's −4° the key light is Luna, at the `Moons` record's phase and albedo against the demo's
    full-moon light (0.08, 0.10, 0.14), plus Ember lit by its elongation from the sun. Both pass through the same air;
    the brighter of the two casts the shadows.
  - *Sky.* `ProjectEnvironmentSky` writes the environment's sky view into the port's sky view, in refresh units. This
    is what `SampleSkyRadiance` returns to the surface cards and to every ray that escapes in ReSTIR GI and the reflections.
  - *Clouds.* `ProjectCloudShadow` turns the environment's cloud shadow map (±1,200 m around the origin, 256²) into the
    port's projected cloud shadows: 128², optical depth −ln T. The demo leaves that input idle, and the port's
    `DirectRadiance` already samples it (bindings 11–13).
  - *Fog.* The environment's fog samples the port's three sun cascades (`FogSceneShadow`, bindings 6/7 of
    `IntegrateFogSpace`), so buildings, posts and the gantry cut shafts out of the sunlit haze. Lamp glow is unchanged.

  With `EnvironmentLighting = false` the refresh keeps the demo's own sun, moon, sky and idle cloud shadows, and only the
  fog shafts remain. These are the demo's own inputs, and `RestirGiParityValidation` runs without the environment, so
  the parity evidence is unaffected. The demo's own fog, aerial perspective and flare stay off in the refresh, because
  the environment draws them.

## Records → viewport

| Level record | Illumination refresh | PlanetaryAtmosphere |
|---|---|---|
| `Solar` | `SunElevation`, `SunAzimuth` (counter-clockwise from +X east), `SolarIlluminance` = 12 × klx / 98, `SunTemperature`, `SunRadius`; the key light's colour is the environment's air transmittance × that tint × illuminance | sun direction; disc irradiance = demo tint × illuminance, in environment units; disc radius |
| `OpticalFlare` | — (the demo flare stays off) | flare gain, aperture blades, halo radius, chromatic shift, anamorphic and starburst toggles |
| `Atmosphere` | `Rayleigh`, `Mie` = (turbidity − 1) / 1.4, `Ozone`, `MieG`, on/off | the same scales on the Earth reference, planet radius, thickness, aerial perspective |
| `Clouds` | the environment's cloud shadow map as the projected cloud shadows (`CastGroundShadows`) | one cumulus slab: base, thickness, coverage, density, wind drift, silver lining |
| `Stars` | stars, planets on/off | Hipparcos limit from the count, brightness, Milky Way, scintillation, sidereal speed |
| `Moons` | primary moon direction on the sky path; at night Luna's light from `PrimaryPhase` and `PrimaryAlbedo`, plus Ember (`SecondaryMoonEnabled`) by its elongation | Luna (and Ember when the secondary moon is on) at their orbit angles |
| `Planet` (×4: Venus, Jupiter, Mars, Saturn) | — | one entry per body: on/off, drawn diameter, brightness, rings, atmosphere shell; placed by the demo's orbital solver for `Body` |
| `Fog` | — | height fog: density, falloff height = 1 / falloff, base altitude, phase; lamps as fog luminaires; sun shafts shadowed by the refresh's sun cascades (`ReceiveRayShadow`) |
| `Wind` | — | cloud advection |
| `RenderPipeline` | quality tier → `low` / `medium` / `high`; RTX tier → ReSTIR path tracer or GTX distance field; GI, TAA and exposure toggles | — |

The sky is placed for the demo's date, time and observer: 2026-10-20, 12:00, −26.18°, 28.32°. The Hipparcos stars are
rotated from the catalogue's J2000 axes by the demo's sidereal angle. The planets come from the demo's own orbital
solver (`CelestialSolver.js`, ported).

In `Default.levelspace` the four planets are `rec_planet_{venus,jupiter,mars,saturn}` under the `Atmosphere` record. Their
defaults are the earlier built-in ones: 0.80° / 1.26° / 0.69° / 1.03° drawn diameters, Venus with an atmosphere shell,
Saturn with rings. A level without planet entries still draws those four. The sun (`Solar`), the moons (`Moons`) and the
stars (`Stars`) were already entries.

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

Every shader is a `.slang` unit: the 55 units in `Frontier/Engine/Shaders/GlobalIllumination` (the port and its two
environment bridges) and the PlanetaryAtmosphere units in `Frontier/Engine/Shaders`. CMake compiles them to SPIR-V 1.3
with the pinned Slang compiler (`Automation/PrepareVulkanCompute.py`, slangc 2026.14.1).

So that an editor build without that compiler (for example MSVC on Windows) still starts and runs the viewport, the
compiled archives are also stored in `EngineContent/ShaderArchives/{GlobalIllumination,Environment,Surface}`:

- `Surface` is the editor's own raster set (`Engine/Render/Shader`, 18 entries): the Project Browser previews that
  `Frontier.exe` loads at start-up, CAD, MatCap and material surfaces, vector coverage and the bake field. It is
  compiled with the repository's portable compiler, `slang-loader@0.0.7` (Slang 2026.19 WASM, `FRONTIER_SLANG_WASM`),
  because the pinned slangc has no SPIR-V optimizer. Until 2026-11-02 it was not stored: a build without a Slang
  compiler on `PATH` (the 21a0ccb4 download, or MSVC without the Vulkan SDK) stopped at start-up with
  "Missing or malformed browser shader archive". CTest `BrowserPreviewStartupValidation` now runs the browser's
  start-up rendering from the stored set (four pipelines, four catalogue thumbnails, one read back).

- The editor build copies `EngineContent` beside `Frontier.exe`, stored archives included. A set the build compiled
  replaces its stored copy afterwards.
- The port's units compile only with the pinned compiler by default, so every build presents the SPIR-V the parity
  validation measured. `-DFRONTIER_GLOBAL_ILLUMINATION_SLANGC=<slangc>` selects another compiler.
- `Automation/StoreShaderArchives.py --build <build> --compiler <slangc or slang-wasm.js> --sets <set>` refreshes the
  stored archives after a shader change. `ShaderCompilation.json` records the compiler and the SHA-256 of every source
  and archive.
- CTest `StoredShaderArchiveValidation` fails when a Slang source changed without refreshing the stored archives. When
  the build compiled a set with the compiler that stored it (pinned slangc; for `Surface`, the slang-loader WASM by its
  SHA-256), the test also requires the compiled and stored SPIR-V to be byte-identical. Recompiling from scratch
  reproduced all 46 GlobalIllumination and Environment archives byte for byte, and the 18 Surface archives likewise.

## Checks

`Code/SceneViewportValidation.cpp` (log: `Results/SceneViewportValidation.txt`, 18 checks, 0 failing) checks the
following:

- the environment is overlaid on the illumination device;
- the vehicle is deactivated;
- the 20 street lamps and 10 lamp posts are placed from the scene;
- every image is lit;
- the daylight sky is bright;
- the low sun saturates;
- the night sky is darker than the day and shows stars;
- the fog's sun shafts are shadowed by the scene's sun cascades: the unshadowed refresh carries more than 0.1 % more
  light than both shafted refreshes around it;
- what the environment fed the refresh (read back from the port's own inputs):
  - the daylight sky view is the environment's blue sky;
  - the clouds shade the ground: more than 1 % of the projected cloud shadow map shaded (optical depth above 0.05),
    and somewhere deeper than 0.2;
  - the low sun is reddened by the environment's air: red/blue at least 1.15 × the daylight ratio;
  - Luna and Ember light the night: a moon key light from above the horizon;
  - the night sky view is far darker than the day's;
- no transfer was rejected and no submission failed (`DeviceExchange::Faults`).

The tenth argument `demo` renders the same scenarios with the demo's own light inputs (Option A off).

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

No Slang compiler is needed for this: the stored archives are used (all three sets, since 2026-11-02). A Slang
compiler on `PATH`, such as the Vulkan SDK's, recompiles the Surface set instead. `Frontier.exe
Projects\Everest\Everest.projectspace` opens Everest without the browser. A ready-made package is built with
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
executable is Windows x64 PE32+, every entry of every stored shader set is present and well-formed, the files
`Frontier.exe` opens before the first click are there, and the fonts match their catalogue.
`--omit-material-archives` leaves out the Texture Studio material archives (about 180 MiB), which the Scene Viewport
does not read.

`Automation/Workflows/EditorPreviewWindows.yml` publishes downloads on GitHub once it is copied to
`.github/workflows/` (GitHub runs workflows only from there; Arena's GitHub App may not create workflow files, and its
sandbox cannot reach `uploads.github.com`). Then every push of `main` or an `arena/…` branch runs:

1. the Zig cross-build, packaged (the download);
2. an MSVC build exactly as above (`cmake -S . -B Build/Editor -A x64`), packaged as `…-MSVC.zip`;
3. the packaged `Frontier.exe` launched on a GitHub Windows runner with a CPU Vulkan driver
   (`Automation/LaunchEditorPreviewWindows.ps1`: Chrome's SwiftShader, else Mesa lavapipe): the Project Browser until
   its first thumbnails are confirmed, then Everest from the command line until the Scene Viewport has presented
   four refreshes, with a screenshot and the diagnostic file of each;
4. a pre-release `editor-preview-<sha>` with both packages, the screenshots and the results in its notes.

## Device loss on the RX 9060 XT (fixed in `8d50414`)

The owner's log of the `e4b9baf4` download on an AMD RX 9060 XT showed "staged write submission failed" 2.7 s after
Everest opened, and then `VK_ERROR_DEVICE_LOST`.

- **Cause.** `DeviceExchange::FlushWrites` recorded the staged writes of one flush as buffer copies with no barrier
  between them. `ConstructRegionFrom` stages a zero fill and then the contents into the same buffer. Vulkan does not
  order such copies, and on that GPU the zero fill could land last. The distance volumes' hierarchy was then zero, so
  `TransferDistance` traversed it forever. The GPU hung, Windows reset it after 2 s, and the next submission reported the
  lost device. CPU drivers execute the copies in order, which is why no run here failed.
- **Fix.** A write that overlaps an earlier write of the same flush now waits for it. The Khronos validation layer's
  synchronization validation (built from source here) reported 4 `SYNC-HAZARD-WRITE-AFTER-WRITE` before the fix and none
  after it: on SwiftShader over the bring-up and 8 refreshes, and on Mesa lavapipe over the bring-up.
- **Hardening** in the same commit:
  - fence waits are checked;
  - every failure names the `VkResult` and the labelled submission;
  - out-of-range writes, copies and reads are rejected, as WebGPU rejects them;
  - unwritten descriptor bindings are reported;
  - `robustImageAccess` is enabled on both device paths;
  - the device is probed before the first submission;
  - every bring-up step is journalled with its duration (`[SceneViewport] bring-up ①…⑧`);
  - the first two refreshes are submitted step by step, so a fault names its step (`device fault: …`).

## Not claimed

- **Hardware.** Every image here was rendered on SwiftShader (CPU Vulkan): about 12–19 s per refresh at 480 × 270, and
  about 52 s at the workspace's 1028 × 482 `high` tier. No hardware GPU and no Windows desktop session was run. The
  RX 9060 XT fault was traced from the owner's log and confirmed with synchronization validation, not on that GPU.
- **Windows.** The Windows editor target was cross-compiled and linked with the repository's pinned Zig 0.13.0
  `x86_64-windows-gnu` toolchain (`Automation/WindowsToolchain.cmake`), configured without a Slang compiler so it used
  the stored archives. It imports only Windows system DLLs and the UCRT, and loads `vulkan-1.dll` at run time. It was
  never launched here, and MSVC was not run: `Automation/Workflows/EditorPreviewWindows.yml` does both on GitHub's
  Windows runners once it is copied to `.github/workflows/`. The owner's first launch of the `21a0ccb4` package stopped
  at start-up because the `Surface` set was missing; `e4b9baf4` stores it and checks it (see Shaders above). On the
  RX 9060 XT, `e4b9baf4` then lost the device; `8d50414` fixes that (see above).
- **Parity of the environment lighting.** Option A feeds the port inputs the demo never had: the environment's sun
  colour, sky view, cloud shadows and moonlight. There is nothing 1:1 to compare them with. `RestirGiParityValidation`
  runs the port without an environment, and there the three new hooks are never called, so the 150 parity checks still
  describe the demo inputs. That capture was not re-run after Option A, because its reference capture is not in this
  sandbox.
- **Moon phase record.** The drawn moon discs follow the sun–moon geometry. The `Moons` record's phase sets only Luna's
  light.
- **Workspace capture.** `Images/EverestLiveSceneViewport.png` predates Option A: it shows the demo's own lighting under
  the overlay.
- **Synchronous submissions.** Submissions are synchronous (one fence wait per step group). Pipelining the viewport
  with the interface (Option A's optional step 6) is future work.
