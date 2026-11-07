# FRONTIER // NEON RIFT

A neon drift racer in the spirit of Subway Surfers crossed with Ready Player One:
an endless elevated highway through a cyber city, with ramps, tunnels, overhead
bridges and skate-park plazas, stitched together by hard **90° corners** you drift
through for points.

Runs in the browser with Three.js (vendored, no build step, no network at runtime).

## Run it

```bash
npm start          # http://localhost:8080
```

or any static server pointed at the repository root (ES modules + import map, so
`file://` will not work).

## Controls

| Key | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | steer — holding into a corner **drags the drift** and pays out score |
| `Space` / `W` / `↑` | jump (hold a direction in the air to spin for trick points) |
| `S` / `↓` | slide under laser gates, dive while airborne |
| `Shift` / `E` | boost (charged by drifting, cells and pads) |
| `M` | mute |
| `R` | retry after a wipeout |

On touch devices on-screen pads appear automatically.

## What is on the road

- **Ramps** launch you into a banked flight with a coin arc to collect on the way down.
- **Tunnels** wrap the road in light rings and kill your sense of speed.
- **Overhead bridges and portal gantries** cross the road; signs and billboards hang over it.
- **Skate-park plazas** open up quarter pipes, spines and grindable rails.
- **90° corners** are banked, and the centrifugal push is real: steer into the corner
  and hold it to carve a drift (more score and boost, less wall).
- Obstacles: barriers (jump or dodge), laser gates (slide), low bars (jump),
  containers (dodge), patrol drones (dodge).

Score comes from distance, drifts, air time, 360s, grinds, near misses and cells,
all multiplied by a combo meter that decays when you play it safe.

## Layout

```
index.html          HUD, menus, import map
styles.css          neon UI
src/main.js         bootstrap, state machine, game loop
src/path.js         analytic track path (straights + 90° arcs, banked)
src/generator.js    course planner: segment shape, style pacing, features
src/track.js        geometry for decks, tunnels, parks, city, props
src/world.js        sky, grid floor, lights, streaming/pruning, pickups
src/player.js       craft model, physics, drift/trick/crash rules
src/camera.js       rail-following chase camera + menu cinematic
src/effects.js      particles + bloom/grade post stack
src/audio.js        procedural synthwave score and SFX (WebAudio)
vendor/             three.js r169 + postprocessing addons
```
