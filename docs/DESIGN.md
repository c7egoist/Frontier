# Sound design notes

This document explains how the catalog was designed and how to extend it without breaking the aesthetic. It is written for sound designers and engineers who need to add or tune sounds.

## 1. The brief

The target is a **sleek, engineered interface** — the quiet confidence of a heads-up display or a high-end instrument, not a game console. Three constraints define the palette:

1. **No retro signatures.** No square/sawtooth leads, no bit-crushing, no stepped arpeggios, no "coin" intervals. The audible material is sine, triangle, filtered noise and FM.
2. **Physicality.** Every interaction has a surface (transient), a mechanism (pitched body) and often a mass (sub-bass). A click without a body sounds like a UI toolkit; a click without a surface sounds like a synth pad.
3. **Restraint.** The loudest sound in the library (power-on) peaks at about −6 dBFS; the quietest (hover) at −28 dBFS. Headroom is a feature: UI sounds are mixed against content, not on top of it.

## 2. Signal architecture

```
Voice (per play)
  ├─ tone / noise / bell / thump / pluck sources
  ├─ per-source biquad chains (one-shot sweeps)
  ├─ envelope gains (exponential decays)
  ├─ stereo placement (± small humanised offsets)
  ├─ dry ─────────────────────────────┐
  └─ reverb send ──► convolver ──► 0.42 ┤
                                        ▼
Master bus: highpass 24 Hz → compressor (3:1, soft knee) → tanh soft clip → master gain → analyser → out
```

- **Reverb** is a generated impulse: 1.25 s of low-passed noise with three early reflections and a slightly different decay per channel. It is dark and short by design, so it adds material without smear.
- **Compression** is gentle (−17 dBFS threshold, 14 dB knee, 3:1). It glues stacked layers; it is not there to make things loud.
- **Soft clip** (`tanh`) only catches peaks. At normal levels it is effectively transparent.

## 3. Layer recipes

### Click (and the core family)

| Layer | Source | Envelope | Purpose |
| --- | --- | --- | --- |
| Surface | Noise through a 3 kHz highpass, 28 ms | 0.6 ms attack | The "tick" the finger feels |
| Mechanism | Sine 210–260 Hz, drop to 72 % pitch | 1 ms attack, 80 ms decay | Body of the button |
| Glass | Sine 2.35–2.75 kHz, 32 ms | 1 ms attack | Top-end detail |
| Air | Band-passed noise at 2.7 kHz, Q 1.1 | 35 ms | Ties the layers together |

The four pitch values are randomised per play. Combined with ±6 cents of global drift, this is why repeated clicks do not fatigue.

### Power on

This is the flagship cue and the best illustration of the layering philosophy.

1. **Sub swell** — sine 42 → 82 Hz over 0.85 s, 32 ms attack, 1.15 s body. This is the reactor spinning up; it should be felt more than heard.
2. **Opening air** — pink noise through a bandpass sweeping 420 → 5200 Hz over 0.95 s, plus a high air layer sweeping 3.8 → 7 kHz. The room energises.
3. **Chord bloom** — D major add 9 (`D3 A3 D4 F#4 A4 E6`) entering 0.5 s after the start, each note staggered by 12 ms with a 25 ms attack. Staggering is what makes it bloom instead of stab.
4. **Metal** — an FM bell at D4 with ratio 2.76 and a low thump at 52 Hz land on the chord entry. This is the moment the system "locks in".
5. **Tail** — a high bell at A5 and filtered air decay for 0.8 s.

### Pulse (reactor heartbeat)

Three sub thumps at 50–55 Hz spaced 270 ms apart, decreasing in level, each with a faint 2× harmonic through a 240 Hz lowpass. An FM bell at 108 Hz (ratio 2.4) supplies the metal halo, and a low-passed noise bed keeps the space alive between thumps.

### Charging

A rising sine from 82 Hz to ~660 Hz over 1.25 s, a parallel fifth an octave up, pink noise opening through a 500 → 4800 Hz bandpass, and three power throbs spaced 0.42 s apart, each slightly louder than the last. The final A5 bell and high air mark "ready".

### Unlock

Three acts in one second:

1. **Latch** — a 90 ms low-passed noise burst (1400 → 500 Hz, Q 1.4) plus an 88 Hz thump. Mechanical release.
2. **Air** — a bandpass sweep 1200 → 3200 Hz as the seal equalises.
3. **Confirmation** — A4 then E5, with an A5 bell, spaced 70 ms apart. The harmony resolves upward.

`lock` mirrors the gesture: E5 → A4, falling, with a heavier final latch.

### Complete

A four-note D major arpeggio (`D5 F#5 A5 D6`) with increasing note lengths (0.5 s to 0.86 s), each entering 85 ms after the previous, over a D3/A3 bed with a slow 160–200 ms attack. An A5 bell and high air finish the bloom. The total is a little under 1.5 seconds — long enough to feel like a reward, short enough not to block the next action.

### Error

Two low tones a semitone apart (C#3 and D3) through a 700–900 Hz lowpass, causing slow beating; a second C#3 pulse 170 ms later; a 62 Hz thump and a breath of low noise. No high frequencies at all. An interface that respects its operator does not screech.

## 4. Humanisation

Each play derives a fresh RNG seed (unless `seed` is provided) and applies:

- **Pitch drift**: ±6 cents, global to the voice.
- **Level drift**: ±3 %.
- **Pan drift**: ±0.025 around the sound's designed placement.
- **Noise read offset**: random position into the shared noise buffer.
- **Sound-specific randomisation**: filter frequencies, interval timings, chosen pitch centres and stereo direction, declared in each recipe.

The result is a library that survives thousands of repetitions. For deterministic rendering (test snapshots, waveform previews), pass `seed`.

## 5. Loudness and mixing

Peak measurements alone are misleading for short sounds, so the measurement script reports three numbers:

- **Peak (dBFS)** — safety and headroom.
- **RMS (dBFS)** — sustained energy.
- **K-weighted loudness (LUFS-style)** — perceived level, used to judge the hierarchy.

The designed hierarchy:

| Band | Peak target | Examples |
| --- | ---: | --- |
| Hero | −6 to −8 dBFS | `powerOn`, `impact`, `riser`, `transition` |
| Primary | −9 to −13 dBFS | `complete`, `confirm`, `error`, `click`, `unlock`, `heartbeat` |
| Secondary | −14 to −19 dBFS | `navigate`, `save`, `send`, `hudOpen`, `lock` |
| Tertiary | −20 to −24 dBFS | `copy`, `download`, `info`, `calibrate` |
| Ambient | −25 to −28 dBFS | `hover`, `scroll`, `progressTick`, `standby` |

`npm run measure` iterates the trims in `src/catalog/levels.ts` until each sound reaches its target (within 1.5 dB). CI fails if a change pushes a sound off target or into clipping.

## 6. Why it does not sound like a game

A short, non-exhaustive list of choices that were deliberately avoided:

- Square and sawtooth oscillators (buzzy, 8-bit association).
- Stepped pitch changes; all melodic movement glides exponentially.
- Perfect fifths played as fast, even 16th-note arpeggios (coin/level-up language).
- Bit-crushing, sample-rate reduction or hard clipping.
- Very short (under 0.5 ms) attacks on tonal layers, which read as "beep".
- High-register square-wave error buzzers; errors here are low and rounded.
- Loud, dry sounds with no room; every sound has a small, dark space around it.

## 7. Testing

The test suite enforces the aesthetic and the engineering:

- Catalog integrity: unique ids, metadata, aliases, category coverage, a guard against `square`/`sawtooth` oscillator types.
- Offline rendering of every sound at 22.05 kHz: no NaNs, no clipping, audible peak and RMS, declared length within 50 ms of measured.
- Determinism: same seed → identical samples; different seeds → different variation.
- WAV encoder: valid RIFF header, PCM format, stereo 16-bit, non-silent payload.
- Engine: playback, throttling, mute/volume/enable, voice stealing, sequences, WAV export, clean destroy, SSR safety.
- Demo smoke test in a DOM without Web Audio or canvas: all 61 cards render, filters and search work, the detail dialog opens.

The full peak/RMS/LUFS table for the current catalog is in [`audio-report.md`](audio-report.md).

## 8. Performance

- A typical UI sound creates 4–10 nodes; the largest cinematic cue about 30. All are disconnected and released when the tail ends.
- One shared white-noise and one shared pink-noise buffer are generated per context (2 s each), not per play.
- Reverb uses a single convolver on the master bus; per-voice sends are plain gain nodes.
- Voices are capped (`maxVoices`, default 24) with oldest-first stealing.
- Sound lookup is O(1) via a normalised map; aliases are resolved once at module load.
- The package has no runtime dependencies.
