# Frontier editor preview — Windows x64

Extract the ZIP into a new folder. Keep `Frontier.exe`, `EngineContent/` and `Projects/` together.
Start `Frontier.exe`, then open Project Everest. Alternatively:

```text
Frontier.exe Projects\Everest\Everest.projectspace
```

`Package.json` identifies the source revision, file hashes, toolchain and omitted content. The small archive excludes
Texture Studio material archives; the scene viewport does not need them.

## Celestial bodies

- Moon controls now drive all four native sky slots: visibility, phase, placement, orientation, diameter, brightness
  and glow. The primary slot also controls moonlight at night.
- Use **Find in sky** to frame the selected body. **Place in view** switches off following and puts it above the
  horizon.
- Venus, Jupiter, Mars and Saturn each have their own interactive surface instruments and live native previews.
  Controls for orientation, surface appearance, atmospheric limbs and rings update the viewport.
- **Follow sky** uses the date and observer settings on the Sun. Editing manual placement switches following off.
- Stars' limiting magnitude, size, halo, rotation and scintillation controls now reach native rendering.
- Previews are isolated surface evaluations under fixed reference light; they are not copies of the scene camera.

## Cameras and viewport

| Input / mode | Action |
|--------------|--------|
| Camera dropdown | Orbit selected, Chase selected, Free/WASD, Top, Bottom, Front, Back, Left, Right, Space |
| Free / RMB + mouse | Look around |
| Free / RMB + W/A/S/D | Move forward/back/left/right |
| Free / E/Q, Shift | Up/down; speed boost |
| Free / RMB + wheel | Change flight speed |
| Orbit / middle or left drag | Rotate around the selected finite target |
| Orbit / Shift-middle | Pan |
| Orbit / Ctrl-middle or wheel | Dolly |
| Chase | Follow the active selected target; sky bodies provide directional tracking |
| F / focus button | Frame the selected target |
| Circular reset button | Restore the scene camera |
| V | Fill the application window with the viewport |
| Escape or V in fullscreen | Restore the docked panels |
| H | Toggle the detailed readout |

Axis views use fixed-axis perspective projection. Space navigation starts at 150 km, enables wide-range flight, and
restores the earlier scene position when leaving. It is not a new physical solar-system simulation.

The scene-name notch, old Scene/renderer/live text, particle-editor launcher, respawn/reassemble buttons and
Distance Slice debug view have been removed. Distance Slice is also removed from the native presentation shader.

Each panel owns its footer. The viewport footer reports FPS, render time, scene triangles and Sun elevation using
colour and status icons. Render time is not a separate GPU timestamp. No workspace-wide status footer remains.

## Outliner and settings

Outliner shows 15 actual scene/environment entries. The Frontier brand/workspace banners and level badge are removed.
Simulation Origin and unrendered scientific, fluid, fracture and particle examples are not in the default scene.
Their reusable engine code remains; regression examples live in an exhibit fixture.

Required renderer settings remain persisted in the level. Open **Control Centre → Quick Controls → Render settings**
to edit the renderer without listing its implementation details as scene objects. Save with **Ctrl+S** or **Save
level**.

## Local media, wind and baking

- Local Cloud and Local Volumetric Fog start disabled. Select one and **Place in front of camera**, or enable it.
  Both render natively. Local Cloud and Local Fog also have explicit creation-menu entries.
- Wind is a separate contributor under Force Field. Field vectors are evaluated velocity in m/s and are labelled as
  an X-ray overlay. No vegetation/tree-bending consumer is registered in Everest.
- Following media advect their density through fixed bounds. Stopping or unlinking retains accumulated displacement.
- Fog supports box/ellipsoid/sphere/hemisphere bounds, falloff, noise, self-shadowing and adjustable march samples.
  Cloud trace resolution and 16/32/64/128-style sample budgets affect actual rendering.
- **Atmosphere → Baking → Bake atmosphere** generates real GPU lookups and shows their input snapshot.
  **Use baked settings** freezes those optical coefficients; rebake to replace them or turn it off for live editing.
  Coefficients persist with the level; GPU images regenerate from them on load. The Sun remains dynamic.
- Lens Flare **Export HDR** writes linear RGB PFM and refuses to overwrite an existing file.

## Validation and limitations

Native C++/Vulkan changes are tested on Linux with SwiftShader. The Windows executable is cross-built, not
interactively executed on Windows here. The package is unsigned and not antivirus-scanned.

See `Exhibits/CelestialWorkspace/` and `Exhibits/LocalMedia/` in the repository for actual rendered evidence,
parameter-change checks and reproduction commands. Captures use small scene render extents for software-Vulkan
validation; they are not hardware-performance claims.

Unconnected artistic shadow controls and unsupported specialist authoring features remain explicitly unavailable.
