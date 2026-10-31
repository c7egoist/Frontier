# Project Everest

Native Vulkan C++ GPU target project for the Frontier VehicleHMI and dual-tier illumination port.

## Containers and launch flow

- `ProjectEverest.projectspace` — editable Frontier workspace container opened through `ProjectBrowserPanel` ->
  Application selection -> `EditorWorkspace` (`PanelDockspace`, `ControlCentrePanel`, one shared `Inspector`, and
  `SceneDirectoryPanel`). The Log Stream service remains available while its dock window is hidden for now.
- `ProjectEverest.frontier` — declarative `.frontier` descriptor consumed by `DecodeProjectDescriptor` and headless
  verification, registering the `Powertrain`, `CabinHMI`, `Weather`, and `Fracture` user log categories.
- `Content/Scenes/ProvingGrounds.scene.toml` and `Content/Scenes/StudioShowcase.scene.toml` — project scene definitions.
- `Content/Lighting/DualTierIllumination.toml` — pins hardware `VK_KHR_ray_query` for RTX GPUs and
  `SignedDistanceField` + `OrderedSoftwareBvh` reflections for GTX / lower-end GPUs.
