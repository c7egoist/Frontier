# Mesa Drift

A runner-racer prototype: a skatepark the size of a canyon, built on stilts over a desert floor.
Sun-bleached concrete, terracotta, pool-tile ramps, pennant flags and stone arches — no neon.

## Run

```
npm install
npm run dev      # http://localhost:5173
```

## Controls

| Action | Keys | Touch |
| --- | --- | --- |
| Steer (continuous, not lane-snapped) | `←` `→` / `A` `D` | drag |
| Jump | `Space` / `↑` / `W` | tap, or JUMP |
| Duck (slide under beams, stomp mid-air) | `↓` / `S` | DUCK |
| Drift (hold through a 90° corner, boost on exit) | `Shift` / `K` | DRIFT |
| Mute | `M` | |

## Course pieces

| Piece | What it does |
| --- | --- |
| Turn | A true 90° arc. Centrifugal push shoves you into the outer wall unless you drift (or fight it on the stick). Drift the full arc for `PERFECT DRIFT` + boost. |
| Kicker | Tiled ramp into a 10 m gap. Speed launches you; jump at the lip for more air. |
| Tunnel | Bored through rock, lamp-lit, no beams inside. |
| Bowl | Tiled quarter-pipe walls on both sides — ride up them for `WALLRIDE` and the token lines. |
| Split | Centre ramp onto a narrow overhead deck (tokens), or stay low between the deck pillars (obstacles). You can fall off the deck back to the lower level. |
| Overpass | Your road arches 7 m over a crossing road below. |
| Underpass | A bridge crosses overhead; duck the girder under it. |

## Structure

```
src/track.js   track-space math, piece builders, procedural generation, obstacles
src/player.js  kart model, physics (multi-floor decks, ramps, gaps, bowl walls), drift
src/world.js   sky shader, sun/shadows, desert floor, particle pool
src/main.js    game loop, camera, scoring, state
src/hud.js     DOM HUD and screens
src/input.js   keyboard + touch
src/audio.js   procedural sound (no assets)
```
