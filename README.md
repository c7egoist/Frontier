# Frontier — World Editor

A game-engine world editor in the spirit of Unreal: an entity
hierarchy fused with a **live 3D viewport** and a **Details panel**.
No build step — just open `index.html` (or serve the folder). The
viewport streams three.js from a CDN.

Three panes: **Hierarchy** (entities) · **Viewport** (live render) ·
**Details** (per-entity properties). Everything is linked: select,
hide, move or retune an entity and the 3D world updates instantly.

Entity types: **Atmosphere** (Sky Atmosphere, Sky Light, Directional
Light/Sun, Moon, Fog), **Lights** (Point, Spot), **Scene** (Folder,
Mesh, Camera, Particles, Physics), **Audio & Logic** (Audio, Script,
Post Process). Mesh shape follows the name: Ground, Capsule, Coin…

Time of day: scrub the timeline pill (or press `T`) to sweep a full
day/night cycle — sun arc, dusk skies, moonrise, stars.

## Use

| Key | Action |
|---|---|
| `Enter` / `F2` | Rename selected entity |
| `↑` `↓` `←` `→` | Navigate · collapse / expand |
| `Tab` / `Shift+Tab` | Reparent (indent / outdent) |
| `Insert` | Add entity |
| `Ctrl+D` | Duplicate (with children) |
| `V` | Show / hide |
| `Del` | Delete (with children) |
| `Alt` + `↑`/`↓` | Reorder |
| `Ctrl+Enter` | Isolate subtree / back out |
| `/` | Search entities |
| `T` | Play / pause time-lapse |
| `Ctrl+/` | Shortcut reference |

Viewport: drag to orbit, scroll to zoom, click any object to select it.

## Theme

All visuals derive from the **theme token block** at the top of
`styles.css` (`dark` signature theme + `light`). To re-skin the app,
only that block needs to change.
