# Folder Structure

## Target ownership

```text
Frontier/
├── CMakeLists.txt             # UI-only build and local verification
├── Automation/                # Existing tooling plus pinned UI setup and patches
├── ExternalPackages/          # Ignored downloaded dependency trees
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── Documentation/
│   ├── Tracker.md
│   ├── FolderStructure.md
│   ├── Rules/
│   └── Plans/
│       ├── Ongoing/
│       ├── Completed/
│       └── References/        # Retained reference documents (InheritedEngine/)
├── Engine/                    # Production code
│   ├── Interface/             # Selectively ported UI foundations
│   ├── Lifecycle/             # Activation sequence
│   └── Render/                # Blank; Git retention marker only
├── Frontier/
│   └── Engine/                # Multi-realm PlanetaryAtmosphere, GeometricRaster, DeviceExchange, Rendering & Shaders
│       ├── DeviceExchange/    # VulkanComputeExchange (compute), DeviceExchange (raster + compute, WebGPU ordering), VulkanDeviceAccess
│       ├── GeometricRaster/   # VisibilityProjection (cross-portal ray routing & reversed-Z visibility)
│       ├── PlanetaryAtmosphere/ # AtmosphereScattering, AstronomicalEphemeris, SkyProjection, PlanetaryProjection,
│       │                        # CloudSpace, VolumetricClouds, FogSpace, OpticalLensFlare, PlanetaryEnsemble, WeatherEffects
│       ├── Rendering/         # SubmissionOrder, BarrierDerivation, TransientTargetAtlas, environment/inspection units
│       │   ├── GlobalIllumination/ # 1:1 port of the VehicleHMI ReSTIR GI renderer (distance field, cards, BVH, ReSTIR, SVGF)
│       │   └── SceneViewport/      # SceneViewport + EnvironmentOverlay: the GI refresh with PlanetaryAtmosphere over it
│       └── Shaders/           # Slang 2026 SPIR-V 1.3 compute & raster shaders (GlobalIllumination/ holds the port's units)
├── UI/
│   └── Editor/                # Lifecycle-owned production editor UI
├── Projects/
│   └── <ProjectName>/         # Independent game/application projects (e.g. Projects/Everest/)
├── EngineContent/             # Shared content archives (icons, fonts, materials, environments)
├── Exhibits/
│   ├── <ValidationName>/
│   │   ├── README.md
│   │   ├── Code/
│   │   ├── Images/
│   │   └── Results/
│   └── EditorMirror/           # Comparison mirror of the C++ editor
├── Experimental/              # Prototypes and experimental HTML
├── EngineDocs/AgenticInstuctions/  # Four retained authoritative skills
└── _ClaudeScratch/            # Ignored logs/, build/, tmp/
```

This is a target map, not a claim that source migration is complete.
Create meaningful folders as their contents are needed; do not add empty placeholder trees.
Use technical validation names under Exhibits, not the banned naming placeholder from earlier discussion.
No new top-level ownership categories without approval. Update this map after approved structural changes.

## Inherited layout — migration review outcome (2026-10-22)

`Internal/`, `Executables/`, `Applications/`, and `memory/` were reclaimed from this branch; the
complete trees remain on `master` and in this branch's history. Their documents, together with
`Documentation/Prototypes/`, `Documentation/Research/`, and the inherited root-level plan and
reference notes, are retained under `Documentation/Plans/References/InheritedEngine/`.
`Automation/` is current tooling (see the target map). Existing diagnostics remain in
`Exhibits/Diagnostics/`. `EngineDocs/` retains existing governance references until separately
reconciled.
The linked source also has `Docs/`, `Editor/`, `Projects/`, `Tools/`, and dependency/content folders;
map their ownership and build dependencies before any import or relocation.

## Selective port boundary

`Exhibits/UIFoundation/` retains verification code, results, and actual SVG raster evidence.
`Automation/Patches/` owns the six inherited ImGui patches. Dependency pins live in
`Automation/UIDependencies.json`. No scene renderer is ported or built by the new CMake target.
No inherited `Internal/` code is linked into this target.

`Exhibits/ControlCentre/` owns current appearance interaction tests, native CPU images, and build evidence.
`Automation/FontSources.json`, `PrepareFonts.py`, and `FontRequirements.txt` define open-font recovery.
`Automation/WindowsToolchain.cmake` supports Windows cross-compilation on the editing host.
`Automation/PackageWindows.py` packages only Windows binaries and their runtime assets under ignored `Binaries/`.

## Shared content and dependencies

```text
EngineContent/
├── Icons/                     # Tracked original/compatibility SVGs
├── MaterialArchives/          # Tracked Texture Studio material library (.material + baked maps)
├── PatternArchives/           # Tracked Texture Studio pattern presets
├── EnvironmentArchives/       # Studio environments + CelestialMaps (6 real 2K moon maps + Hipparcos8.csv) + ProvingGround
├── ShaderArchives/            # Stored Scene Viewport SPIR-V: GlobalIllumination/ + Environment/ (StoreShaderArchives.py)
├── Defaults/                  # Tracked blank project space
└── FontArchives/<font name>/  # Ignored font downloads, OFL notices, TOML descriptors
ExternalPackages/
├── glfw/                      # GLFW 3.4 platform windows/input
├── tomlpp/                    # Native TOML formats
├── imgui/                     # Pinned UI + approved patches
└── thorvg/                    # SVG rasterization
```

ContentDirectory resolves bundled content from the executable independently of the launch working directory.
The font catalogue has a native TOML form; JSON remains only an automation/report interchange.


## Local media and atmospheric field integration (2026-11-02)

`Exhibits/LocalMedia/` retains native Vulkan wind/noise/shape/quality checks and real Everest baking/vector captures.
`Frontier/Engine/PhysicalDynamics/AtmosphericFlow` maps scene Wind coefficients onto the existing force-field solver.
`Frontier/Engine/PlanetaryAtmosphere/VolumeBounds.h` and its Slang counterpart own finite-volume envelopes.
`Frontier/Engine/Scene/EnvironmentDiagnostics.h` carries owned LUT/field readouts without exposing device resources to UI.
The user's functional-baking/local-media request expands the previous selective UI-only boundary for these integrations.
