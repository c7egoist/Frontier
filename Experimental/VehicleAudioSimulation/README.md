# Frontier · Vehicle Audio Simulation — Interactive Exhibit

Engineering-grade, time-based audio + drivetrain for nine vehicles. Runs at 60 FPS
but **does not require high FPS to stay audible** — audio is clocked by `AudioContext`
at 48 kHz, physics at 240 Hz fixed-step off `performance.now()`.

Open `index.html` via

```sh
python3 -m http.server 5173 --directory Experimental/VehicleAudioSimulation --bind 0.0.0.0
# Live Preview: https://5173-<sandboxId>.e2b.app
```

## Drive

- **W / ↑** throttle, **S / ↓** brake, **A/D** steer (adds cornering load), **Q/E** shift, **Space / N** neutral.
- Click **▶ Start engine** (browser autoplay policy), select any of the 9 cards.
- Drag **Render cap** to 5 FPS — gauges and spectrum keep moving at 240 Hz / 48 kHz.
- Try: GTR/Agera lift at 5000 rpm → BOV; Mustang lift above 3200 → overrun pops;
  Demon hold limiter → flutter; Taycan → inverter sweep + 2-speed shift.

See `Docs/VehicleAudioEngineering.md` for firing orders, induction maps and the
C++ parity (`Frontier/Engine/Audio/*`, `Exhibits/VehicleAudio/*`).

