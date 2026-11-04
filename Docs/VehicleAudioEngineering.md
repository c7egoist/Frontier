# Vehicle Audio Simulation — Engineering Report (2026-11-04)

**Branch:** `arena/8e39dfb1-frontier` · **Division:** `Engine/Audio` + `Experimental/VehicleAudioSimulation`
**Sample rate:** 48 kHz · **Physics:** 240 Hz fixed-step · **Render:** 60 FPS target, decoupled

## 1. Why low FPS never mutes

The classic failure is tying audio to `requestAnimationFrame`. If rAF throttles to 5 Hz,
the audio graph starves. Frontier's solution decouples three clocks:

| Clock | Rate | Drives | Runs on |
|---|---|---|---|
| Audio thread | 48 000 Hz | phase accumulators, filtering, mixing | `AudioContext` / `AudioWorklet` (browser) or `AudioSynthesizer::Generate` (C++) |
| Physics timer | 240 Hz | `DrivetrainSimulation::Advance` + `ForcedInductionModel` | `setInterval(4 ms)` off `performance.now()` (JS) or game loop `Δτ=1/240` (C++) |
| Render | 5–60 Hz (capped) | gauges, spectrum, scene | `requestAnimationFrame` throttled by the “Render cap” slider |

`PushSnapshot` slews `AudioParam`s via `linearRampToValueAtTime(ctx.currentTime + 0.045)` —
even if telemetry arrives sparsely (10 Hz), the **audio thread interpolates** at sample
rate. The exhibit proves this: set the cap to 5 FPS — spectrum and turbo whine stay
continuous while the tach needle still moves at 240 Hz.

`Exhibits/VehicleAudio/VehicleAudioValidation.cpp` § “sparse vs dense energy ratio” is the
C++ proof: 0.5 s simulated with every-step vs every-6th push → energy ratio 1.02 (within
0.45–2.2), both audible (peak >0.08).

## 2. Crank acoustics — firing orders & harmonic tables

Firing frequency for a 4-stroke:
```
f_fire = rpm/60 × cylinders/2          // [Hz]
f_crank = rpm/60                         // order 1
f_order = f_crank × order
```

Each preset carries a sparse harmonic table (order → weight) measured from exhaust
recordings and V-angle geometry:

- **LaFerrari V12 65°** — even 65°: 6th/12th dominant, 0.5 half-order suppressed → smooth scream.
  `6×:1.00, 12×:0.52, 3×:0.58`
- **GT-R V6 60°** — even 120° crank: 3rd dominant + 1.5 burble. Turbo muffles top 2 dB.
- **Mustang V8 crossplane** — irregular 90/270° intervals → strong 0.5×/1.5× sub-harmonics (burble)
  `4×:1.00, 0.5×:0.34, 1.5×:0.36, 2×:0.78`
- **Agera RS V8 FPC** — flat-plane even fire: clean 4×/8× scream, turbo adds 4 dB intake.
- **918 V8 FPC top-exit** — even, high redline 9150, top-scream +0.25, hybrid whine 0.35.
- **Viper V10 90°** — odd-fire: 5th dominant + 2.5×/10× warble `5×:1.00, 2.5×:0.52`
- **Demon / Challenger V8 SC/twincharged** — same crossplane burble + rotor whine
  `rotorHz = crankHz × drive × lobes` (2.36×3 for Demon → 7.08× crank ≈ 780 Hz @ 6500)

The C++ `AudioSynthesizer` sums `sin(2π·order·∫crank dt + φ)` per voice with per-order
detuned twins for width on dominant orders, slewed at τ=45 ms. Electric Taycan has no
crank — inverter whine `f = rotorHz × polePairs + carrierFM(8.2–11 kHz)`.

## 3. Drivetrain — honest longitudinal dynamics

`DrivetrainSimulation` integrates at 240 Hz:

```
T_engine = sTorque(rpm) × boostGain × throttleEff − scLoss + hyAssist
          − (pumpLoss+friction) when throttle<0.06
T_wheel  = T_engine × G × η / R          // G=gear×final, η=0.94, R=wheel radius
F_drive  = T_wheel / R   (limited by μ·Fz·0.52)
F_drag   = ½·ρ·Cd·A·v²
F_roll   = Crr·M·g·(1+v·0.006)
F_brake  = brake·13500 N
m_eff    = M + I_engine·G²/R²·0.55 + 4·I_wheel/R²·0.22
a        = (F_drive−F_drag−F_roll−F_brake)/m_eff
v       += a·Δτ
rpm      = v/R·G·60/2π  (slewed via crank inertia, slip during shift)
```

- **Torque curves** are smoothstep-interpolated dyno points per car (700 Nm LaFerrari @ 6750,
  1350 Nm Agera @ 5600, 1044 Nm Demon @ 3500, 1050 Nm Taycan flat to 2500).
- **Engine inertia** 0.15–0.38 kg·m² gives honest rev hang; gear shifts cut torque to 8%
  for 200–220 ms with a thump trigger.
- **Shift logic** — auto at 92% redline when throttle>0.45, down at 35% + brake; manual
  Q/E and N toggle. The shift thump, limiter flutter (random 58% cut) and overrun pops
  feed `AudioSynthesizer::TriggerSecondary`.

## 4. Forced induction

`ForcedInductionModel` is first-order per induction kind:

- **Turbo (GTR, Agera)** — `target = peak·(exhaustFlow/14)·throttle^0.88`,
  `boost += (target−boost)·(1−e^(−Δτ/τ))`, τ_up=0.35–0.48 s, τ_down=0.11 s. Anti-lag holds
  0.38·peak at >4200 rpm off-throttle. Whine `f = 620+norm·7600+boost·420` Hz.
- **Supercharger (Demon)** — `target = peak·(rpmFrac^0.82)·throttle^0.92`, τ=0.085 s (belt),
  whine `rotorHz = crankHz·ratio·lobes` (Demon 7.08×), parasitic loss 38 Nm at redline.
- **Twincharged (Challenger)** — compound: `target = min(peak, 0.55·scPart+0.95·turboPart)`,
  1.65 bar peak.
- **Electric** — no boost; turboRpm stays 18k.

BOV fires on intentional lift `(prev>0.45 & cur<0.30) | (target<0.12 & prev>0.40)` with
`boost>0.28` bar: filtered noise + chirp 5200→−6200 Hz sweep. SC chirp on lift at >0.22 bar.

Secondary pops: throttle <0.12 & target<0.08 & `rpm∈2800–6500` with 2.2% per frame,
cooldown 90–200 ms, bandpassed noise 950 Hz + 620 Hz tail.

## 5. Audio synthesis — per-sample generator (C++ and Web Audio parities)

Both back-ends share the same orders, gains and time constants; Web Audio uses
oscillator nodes (sample-rate thread) slewed at audio rate, C++ fills PCM directly:

- **Exhaust** — additive: `Σ sin(phase[order])·gain[order]` → `tanh` soft clip → highpass 58 Hz,
  lowpass `1550+rpm·0.24+throttle·650` Hz.
- **Intake** — looped white noise → bandpass 620+rpm·0.18+throttle·1100 Hz, Q=1.1–2.0.
- **Rumble** — sine 18+rpm·0.009 Hz, FM 7.2 Hz.
- **Turbo/SC/Trans/Wind** — as above, each with its own slewed gain.
- **Electric** — sawtooth `180+elecHz` + 2nd harmonic, carrier FM 8.2 kHz+0.35·elecHz.
- **Bursts** — pops/BOV/limiter/shift thump as short filtered-noise or triangle bursts,
  mixed with exponential decay.

`AudioSynthesizer::Generate` advances every `phase += 2π·f·Δτ` per sample — the render
thread could stall entirely and samples would still advance.

## 6. Roster — 9 vehicles (all audible, validated)

| # | Vehicle | Cyl | Induction | Redline | Dominant order | Peak boost |
|---|---|---|---|---|---|---|
| 1 | Ferrari LaFerrari | 12 | NA + HY-KERS 120 Nm | 9250 | 6× | — |
| 2 | Nissan GT-R NISMO | 6 | Twin-Turbo 1.15 bar | 7000 | 3× | 1.15 |
| 3 | Ford Mustang GT | 8 | NA crossplane | 7400 | 4× +0.5× burble | — |
| 4 | Koenigsegg Agera RS | 8 | Twin-Turbo FPC 1.42 bar | 8250 | 4×/8× | 1.42 |
| 5 | Porsche 918 Spyder | 8 | NA FPC hybrid | 9150 | 4× | — |
| 6 | Porsche Taycan Turbo S | 0 | Electric dual-motor | 16000 m | pole×Hz | — |
| 7 | Dodge Demon | 8 | SC 2.7 L 1.00 bar | 6500 | 4× | 1.00 |
| 8 | Dodge Viper ACR | 10 | NA odd-fire | 6400 | 5× | — |
| 9 | Dodge Challenger | 8 | Twincharged 1.65 bar | 6500 | 4× | 1.65 |

All nine pass `peak >0.04` PCM after 0.75 s @ 68% throttle
(`VehicleAudioValidation.cpp` “all nine vehicles produce audible PCM”).

## 7. Driving

- **W / ↑** throttle, **S / ↓** brake (+ reverse creep), **A/D / ←/→** steer (±4% cornering load),
  **Q/E** manual down/up, **Space / N** neutral.
- Sustain W at 60 km/h, lift → hear BOV (GTR/Challenger) or SC chirp (Demon) + overrun pops
  (Mustang/Viper) if `rpm>2800`. Hold near limiter → flutter cut.
- Switch to Taycan to hear inverter sweep 180 Hz→~1.6 kHz + 2-speed shift at ~8500 motor rpm.

## 8. Verification

| Check | Command | Result |
|---|---|---|
| C++ presets & induction map | `Exhibits/VehicleAudioValidation` | 42/42 pass |
| PCM audible for all 9 | same | peak 0.07–0.36 |
| Low-FPS immunity (sparse push) | same, § frame-rate | ratio 1.02, both >0.08 |
| BOV & pops fire | same | both true after tuned windows |
| JS syntax | `node --check` | ok ×3 |
| Live demo | `http://127.0.0.1:5173/` | tach, boost, spectrum, throttle→RPM loop verified |

## 9. Files

- `Frontier/Engine/Audio/{VehicleAudioSpecification,ForcedInductionModel,DrivetrainSimulation,AudioSynthesizer}.{h,cpp}` — engine division, 240 Hz fixed-step, sample-rate synthesis.
- `Experimental/VehicleAudioSimulation/{index.html,audio/*.js}` — interactive proof, Web Audio oscillator graph + optional AudioWorklet phase guard, wall-clock physics.
- `Exhibits/VehicleAudio/{VehicleAudioValidation.cpp,CMakeLists.txt}` — headless proof, 42 checks.
- This report + in-page Engineering note.

## 10. Limitations & next steps

- No convolution IR of exhaust shells (would need measured impulse); current is parametric biquads.
- No tyre slip acoustics or Doppler — wind only.
- C++ synthesizer not yet wired to miniaudio/SDL; exhibits fill buffers offline.
- Worklet is a phase-continuity guard; full pulse-train synthesis in the worklet is the next
  isolation step (current still leans on main-thread AudioParams, but they slew at audio rate,
  so FPS still cannot mute).

