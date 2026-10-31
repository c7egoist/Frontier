# Project Everest — Editor UI & LogStream Exhibit

End-to-end rendered validation exhibit proving the Phase 1 editor UI delivery for **Project Everest** before Phase 2
native Vulkan GPU renderer porting (`RTX` `VK_KHR_ray_query` full hardware raytracing + `GTX` SDF with software BVH
reflections fallback).

## Verified Flow

1. **Frontier Project Browser Discovery (`01_ProjectBrowser_Projects.png`)**
   - `ProjectBrowserPanel::AttachProjectDirectory` discovers `Frontier/Projects/Project-Everest/ProjectEverest.projectspace`
     (alongside `.frontier` -> `.projectspace` sibling resolution) and surfaces **Project Everest** in the **Projects**
     view (`2 levels · 2 catalogue items`).
2. **Select Application -> Open Project Everest (`02_ProjectBrowser_SelectApplication.png`)**
   - Selecting **Project Everest** and opening the launch sheet (`##launch`) presents the interactive
     **Application Target** selector (`Frontier · Project workspace`, `Texture Studio · Material workspace`,
     `SolidArc · Parametric CAD workspace`, `Simulation Studio · Diagnostics workspace`) and **Open Project** action.
3. **Docked Editor Workspace — OLED Theme (`03_ProjectEverest_Workspace_OLED.png`)**
   - `EditorWorkspace::ActivateProjectWorkspace` mounts `ProjectEverest.projectspace` + `ProjectEverest.frontier`,
     registers the four Project Everest user log categories (`Powertrain`, `CabinHMI`, `Weather`, `Fracture`) alongside
     the nine engine channels, constructs ten initial `RecordEntry` instances (including six typed global Inspector
     domains), and docks `Outliner`, `Viewport`, `Log Stream`, and `Inspector` inside `PanelDockspace` beneath the
     `ControlCentrePanel` top-edge notch. Constructor/destructor validation checks both Outliner and Inspector registry
     insertion/removal.
4. **ControlCentre Theme Controller (`04_ProjectEverest_ControlCentre_ThemeDrawer.png`)**
   - Opening the `ControlCentrePanel` top-edge drawer exposes the reusable **Appearance -> Theme** controller (`OLED`,
     `Dark`, `Light`, `Sepia`, `Dracula`, `Nord`, `Dim`, `GitHub`) governing the active project workspace.
5. **Live Workspace Re-Theming — Light Theme (`05_ProjectEverest_Workspace_LightTheme.png`)**
   - Applying `ThemeCategory::Light` through `ControlCentrePanel` re-themes `PanelDockspace` trapezoidal tabs,
     `SceneDirectoryPanel` (`Outliner`), `Viewport`, and `LogStreamPanel` live from `ControlKit::Palette()`
     (`OLED` log region mean luminance `0.075` -> `Light` log region mean luminance `0.968`).
6. **Live Workspace Re-Theming — Sepia Theme + Channels Surface (`06_ProjectEverest_Workspace_SepiaChannels.png`)**
   - Applying `ThemeCategory::Sepia` and opening `LogStreamPanel`'s `DropdownControlSurface` (`All channels`) verifies
     live theme propagation across floating popup surfaces, all nine engine channels, and Project Everest's four
     coloured user categories (`Powertrain`, `CabinHMI`, `Weather`, `Fracture`).

## Global Engine Inspector UI Captures

**Status: implementation-progress prototypes only — not 1:1 VehicleHMI parity and not the UI acceptance gate.** The environment records and Inspector modules are reusable Engine code shared across projects (`Frontier/Engine/Scene/` and `Frontier/Engine/Interface/`). The current rendered C++ screens were an initial native approximation; they diverge from the source UI in layout and interaction details and must be replaced/refined against the original source before Phase 1B passes. The strict source is `Experimental/VehicleHmiPrototype/` at Sultan branch `arena/e9bd7db5-frontier`, inspected revision `6afb6f00b5f25c45f7cda92c7da65b64845768f3`, plus the source-image references and checked-in UI inventories. Captures are actual native C++ ImGui frames, but are evidence of progress—not parity. The atmosphere image is labelled a CPU model reference, not GPU LUT readback, and the lens-flare image is a geometry preview, not a claim that the HMI HDR composite renderer is already ported.

| File | Panel contents |
| --- | --- |
| `Images/07_ProjectEverest_FolderInspector_OLED.png` | Editable folder title, nested counts, category distribution, subfolder creation, subtree visibility, badge, notes, and accent. |
| `Images/08_ProjectEverest_LensFlareInspector_OLED.png` | Optical-axis ghost guide, source drag target, presets, ghost spacing/count, halo, streaks, and aperture controls. |
| `Images/09_ProjectEverest_CloudInspector_OLED.png` | Density diagnostic, coverage/density, formation, altitude clip, trace budget, shadows, and shared-wind coupling. |
| `Images/10_ProjectEverest_WindInspector_OLED.png` | Interactive compass rose, travel/source bearing, speed, gust/turbulence, altitude vector ladder, receiver routing. |
| `Images/11_ProjectEverest_AtmosphereInspector_OLED.png` | CPU atmosphere model panorama, Rayleigh/Mie/Ozone, RGB transmittance strips, scattering settings, explicit LUT bake. |
| `Images/12_ProjectEverest_SunInspector_OLED.png` | Altitude/azimuth diagram, quick toggles, presets, daily elevation curve, colour temperature and solar disc controls. |

## Reproducing

```bash
python3 Automation/PrepareUI.py
python3 Automation/PrepareFonts.py
cmake -S . -B _ClaudeScratch/build/host -G Ninja -DFRONTIER_BUILD_VALIDATION=ON
cmake --build _ClaudeScratch/build/host --target ProjectEverestValidation -j 4
ctest --test-dir _ClaudeScratch/build/host -R "^ProjectEverestValidation$" --output-on-failure
```
