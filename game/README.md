# FRONTIER // ZIPPER CIRCUIT

A browser racer inspired by WipEout Omega's neon tracks, with four-wheel cars and a
living avenue: trains cross the road, traffic weaves through the lanes, and whole rows of
bollards rise and sink in a moving pattern.

## Run it

No build step. ES modules need a web server (opening `index.html` directly from disk won't load them):

```bash
cd game
python3 -m http.server 8080
# then open http://localhost:8080
```

Three.js r160 is vendored in `vendor/three/` (MIT, see `vendor/three/LICENSE`).

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Steer | ← → / A D | Left stick |
| Throttle / brake | ↑ W / ↓ S | RT / LT |
| Boost (drains energy) | Space | A |
| Drift (hold while steering) | Shift | B |
| Draw the bollard gap to lane 1–5 | 1 2 3 4 5 (top row or numpad) | LB / RB nudge |
| Pause | P / Esc | Start |
| Restart / mute | R / M | |

## The dynamic avenue

- **Bollard Zipper** (`js/zipper.js`). Each row of bollards has one open lane. The
  *Zipper Caller* draws the gap: pressing 1–5 sets a target lane, and the gap steps toward it
  one lane every two rows as rows are revealed ahead of the lead car. The caller panel shows
  the upcoming rows. Cars that pass through the open gap score a clean zip and recover energy.
  - **Solo**: an AI teammate draws the gap toward the lane of the nearest FRONTIER car. Press 1–5 to take over.
  - **Co-op**: a friend calls the gap with the number keys while you drive.
- **Traffic** (`js/traffic.js`). Civilian cars run in the avenue sections and are physical. Hitting one costs speed.
- **Trains** (`js/trains.js`). A freight train sweeps across the avenue at each level crossing,
  behind flashing gates and a horn warning. The train body is a hazard and stuns anything it hits.
  An elevated monorail runs beside the circuit.
- **Boost pads, jump ramps, banking and hills** (`js/track.js`, `js/car.js`).

## Code map

- `js/config.js`: all tunable numbers (speeds, grip, energy, zipper and train timings, teams, difficulty).
- `js/track.js`: procedural track. A turtle draws a point-symmetric loop, so it closes exactly; banking is derived from curvature.
- `js/car.js`: rail-style vehicle physics in track space (progress, lateral offset, grip, centrifugal force, airtime).
- `js/ai.js`: AI driver: corner-speed lookahead, lane choice around obstacles, zipper gap seeking.
- `js/race.js`: race controller: field, collisions, laps, positions, events.
- `js/world.js`, `js/carmesh.js`, `js/particles.js`: rendering: road, neon, city, cars, effects.
- `js/hud.js`, `css/style.css`: HUD, caller panel, minimap, menus, results.
- `js/audio.js`: WebAudio synth for engine, boost, impacts, horn, and caller ticks. No sound assets.

## Notes

- Physics runs in track coordinates at a fixed-feel 60 Hz step (dt is clamped to 1/30 s).
- `window.__frontier` exposes the live race for debugging.
- Mobile touch controls are not implemented; keyboard or gamepad is required.
