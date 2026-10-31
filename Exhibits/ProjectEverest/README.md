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
     the nine engine channels, constructs the initial `SceneRecord` instances (verifying constructor/destructor
     auto-registration in `SceneDirectory`), and docks `Outliner` (`SceneDirectoryPanel`), `Viewport`, and `Log Stream`
     (`LogStreamPanel`) inside `PanelDockspace` beneath the `ControlCentrePanel` top-edge notch.
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

## Reproducing

```bash
python3 Automation/PrepareUI.py
python3 Automation/PrepareFonts.py
cmake -S . -B _ClaudeScratch/build/host -G Ninja -DFRONTIER_BUILD_VALIDATION=ON
cmake --build _ClaudeScratch/build/host --target ProjectEverestValidation -j 4
ctest --test-dir _ClaudeScratch/build/host -R "^ProjectEverestValidation$" --output-on-failure
```
