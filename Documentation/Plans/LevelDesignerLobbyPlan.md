# 🏁 Level Designer: the Lobby Level (Car Configurator)

> **Short answer.** Add a new **Level Designer** workspace at `Experimental/LevelDesigner/`. It has the same docks, tabs, icons, fonts, camera and vehicle as the Component Viewer, and it opens one level, **Lobby**.
>
> - **What the Lobby is.** A neutral studio, modelled on the reference photo: a curved white cyclorama, a soft sky and a glossy floor. The Component Viewer's ControlVehicle sits in the centre.
> - **Hotspot dots.** Small dots float on the car. Click one and the camera glides to that dot's authored view and shows its options, for example tyre or rim colours.
> - **Designing.** A shaded transform gizmo moves, rotates and scales objects. A *Basic / Premium* switch decides who may add objects of their own.
> - **Preview.** Preview mode hides all designer UI, leaving only the car, the dots and the swatches.

---

## 1. 📊 What exists to reuse

| Need | Existing code (reused, not rewritten) |
| :--- | :--- |
| Dock layout, tabs, notch, drawer, DM Sans, pills | `Shared/Studio/Studio.css` and the Component Viewer's `index.html` structure |
| Icons | `Shared/Studio/Icons.js` (`icon`, `hydrateIcons`) |
| Panels and fields | `Shared/Studio/Ui.js` (`section`, `rangeField`, `vec3Field`, `colorField`, `segmented`, `toggle`, `selectField`) |
| Renderer, stage, shadows, mesh from a compiled asset | `Shared/Studio/Render.js` (`Stage`, `meshObject`, `VEHICLE_PALETTE`, `boxOf`) |
| Glide camera (eased flights, lens, dial) | `Shared/Studio/Camera.js` (`CameraRig`, `createCameraHud`) |
| Shaded debug looks (no line helpers) | `Shared/Studio/Visuals.js` (`solidArrow`, `anchorMark`, `glowSprite`, `addHalo`, `fieldShell`) |
| The car | `Shared/Models/` ControlVehicle Body / Tyre / Rim (FCT1), compiled through `Shared/GeometryCompile` as in Component Viewer `Main.js` |
| Importing an object (Premium) | Geometry Compiler hand-off (`Shared/GeometryCompile/CompileExchange.js`) |

## 2. 🧭 Decisions

### 2.1 Where the Level Designer lives

| Option | What it means | Fit |
| :--- | :--- | :--- |
| **A. HTML first: `Experimental/LevelDesigner/`** *(recommended)* | Reuses `Shared/Studio` 1:1, matches the Component Viewer exactly, and gives the C++ port a ground truth to follow (CLAUDE.md §2.5 conversion procedure) | ✅ fastest, same look |
| B. C++ now (`Engine/Workspaces/Level/`) | The ImGui workspace and `.slang` gizmo straight away | ⚠️ no HTML reference to match yet |

### 2.2 The car in the Lobby

| Option | What it means | Fit |
| :--- | :--- | :--- |
| **A. Component Viewer's ControlVehicle** *(recommended)* | The same FCT1 body, tyres and rims, with paint, tyre, rim and glass slots | ✅ "same vehicle as Component Viewer" |
| B. A new procedural sedan shaped like the photo | Closer silhouette | ⚠️ new geometry, not reuse |

### 2.3 Basic and Premium

| Option | What it means | Fit |
| :--- | :--- | :--- |
| **A. Role switch in the Designer** *(recommended)* | **Basic**: the authored lobby items (car, studio, lights, hotspots) are locked. **Premium**: *Add* unlocks primitives, Content assets and imports, and the gizmo works on the user's own objects. Those objects are saved in a separate `premium` layer of the level | ✅ simple, testable, no accounts |
| B. Separate premium level file per user | Real per-user storage | ⚠️ needs a backend |

### 2.4 Hotspots (the configurator dots)

| Option | What it means | Fit |
| :--- | :--- | :--- |
| **A. Authored Hotspot entities** *(recommended)* | Each hotspot holds an anchor on a part, a camera view (pivot, yaw, pitch, distance, lens), a target (slot or part) and options (colour swatches or finishes). Clicking flies the glide camera to the view and shows a small swatch strip | ✅ data-driven, editable in Details |
| B. Fixed hard-coded views | Faster | ❌ not designable |

### 2.5 Gizmo

| Option | What it means | Fit |
| :--- | :--- | :--- |
| **A. Shaded mesh gizmo** *(recommended)* | Move (arrows and plane handles), Rotate (rings), Scale (cubes), built from `Visuals.js` shapes. Keys W / E / R, grid snap toggle, local or world space. Drawn on the GPU, no line helpers | ✅ the Component Viewer's "no line helpers" rule and the §2.1 GPU mandate |
| B. three.js `TransformControls` | Ready made | ❌ line helpers, foreign look, not vendored |

## 3. 🗺️ The Lobby level (`Lobby.level.json`)

| Part | Default (neutral) |
| :--- | :--- |
| Studio | Curved cyclorama (floor, a cove, then the wall) in warm white; a glossy floor with a soft contact shadow |
| Sky | Soft gradient, pale blue to white; hemisphere fill |
| Sun | Low key light from the right, soft shadows (as in the photo) |
| Lights | 0–8 authored area / spot / point lights (the Designer can add more) |
| Car | ControlVehicle on a turntable mark; paint `#9fb3c8` (the photo's ice blue) |
| Hotspots | Paint · Front wheel (tyre and rim) · Rear wheel · Headlights · Interior / glass · Wing |
| Premium layer | Empty; Premium users add objects here |

**Level document.** `{ schema: "frontier.level.v1", name: "Lobby", environment: { sky, sun, lights[], studio }, entities[]: { id, name, type, transform, props, locked, layer: base|premium }, hotspots[]: { id, name, anchor, view, target, options[] } }`.

## 4. 🖥️ Level Designer UI (Component Viewer styling)

| Dock | Contents |
| :--- | :--- |
| Left: **Outliner** / Content | The level tree (Environment → Sky, Sun, Lights, Studio · Vehicle → parts · Hotspots · Premium objects). Stat tiles: Entities, Hotspots. *Add* (Premium) and search. Eye and lock on each row |
| Centre: Viewport | Title `Lobby`, state tag, *Design / Preview* segmented control, a gizmo bar (Select / Move / Rotate / Scale, snap, local or world), Frame, Grid. The glide camera with the dial and lens chip. Hotspot dots live in the viewport |
| Right: **Details** | The selected entity's transform and properties. For a hotspot: its view (**Capture current view**), target and options. For the environment: sky, sun (azimuth, elevation, intensity, colour), studio colours and lights |
| Notch | Shortcuts |
| Drawer | Hotspot strip: thumbnails of every view; click one to fly there |
| Preview | Every dock hidden. Only dots and the swatch strip remain; Esc returns |

## 5. ✔️ Gates

| Gate | Check |
| :--- | :--- |
| `Scripts/CheckLevelDesigner.mjs` | level round trip, normalise, entity operations, a premium-layer lock on Basic, hotspot capture / apply, environment presets |
| `Scripts/SmokeLevelDesigner.mjs` (jsdom, the `StudioHarness`) | boot, select, gizmo drag, add (Premium) / refused (Basic), hotspot fly + swatch, environment edits, Preview / Esc, undo, export / import |
| Screenshots | `LevelDesigner/Screenshots/lobby-design.png`, `lobby-preview.png`, `lobby-hotspot-wheel.png` |
| Docs | `LevelDesigner/README.md`, `Experimental/README.md`, `Experimental/index.html` |
