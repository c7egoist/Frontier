# Vehicle Audio — Exhibits

Headless proof that the time-based drivetrain + sample-rate synthesizer works and that
low render rate cannot starve audio.

## Build (Linux / MSVC)

```sh
g++ -std=c++17 -I Frontier/Frontier Exhibits/VehicleAudio/VehicleAudioValidation.cpp \
  Frontier/Frontier/Engine/Audio/VehicleAudioSpecification.cpp \
  Frontier/Frontier/Engine/Audio/ForcedInductionModel.cpp \
  Frontier/Frontier/Engine/Audio/DrivetrainSimulation.cpp \
  Frontier/Frontier/Engine/Audio/AudioSynthesizer.cpp \
  -o /tmp/veh_proof && /tmp/veh_proof
```

Expect `42 pass, 0 fail`. Key probes:

- Every preset builds correct `InductionKind` and peak torque.
- WOT smoke tests: Mustang gains speed, GTR/Demon build boost, Taycan accelerates.
- **Sparse vs dense push** (the low-FPS immunity core): 0.5 s simulated; A pushes
  every physics step (240 Hz), B pushes every 6th (≈40 Hz, as if render at 10 Hz).
  Both produce audible PCM (peak >0.08) and energy ratio ≈1.02 (Δ <6 dB).
- BOV and overrun pops fire after tuned windows.

## Live interactive proof

```sh
python3 -m http.server 5173 --directory Experimental/VehicleAudioSimulation --bind 0.0.0.0
# open http://127.0.0.1:5173/ — Live Preview https://5173-<sandboxId>.e2b.app
```

WASD drives; “Render cap” 5 FPS proves physics (240 Hz) and audio (48 kHz) keep
running while rAF draws 5×/s. See `Docs/VehicleAudioEngineering.md` for the
crank → order derivation per vehicle.

