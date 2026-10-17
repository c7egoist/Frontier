# Frontier Sound Design — Why It Doesn't Sound Like Gameboy

## Problem with typical procedural UI libraries

Most "procedural UI sound" libraries do:

- `osc.type = 'square'` at 440Hz, 0.1s beep
- Raw white noise burst
- Linear ramp, no filter
- Result: 1989 Gameboy / Sega Genesis menu

Iron Man / Stark HUD is **not** that.

## Stark HUD Analysis

We analyzed Iron Man (2008), Avengers (2012), and real-world premium UIs (Linear, Stripe Dashboard, Apple Vision Pro):

### 1. Waveform
- **Never** square 50% duty. That's chiptune.
- Use **sine** for pure tone, **triangle** for soft harmonics, **sine-tri blend** (two oscillators, one sine at 100%, one triangle at 22% detuned +7 cents) for glassy body.
- Subtle **FM**: carrier sine, modulator sine 2:1 ratio, index 0.5–3 for shimmer. Index >10 = alien, we avoid.

### 2. Transient
- Every click has **two layers**:
  - Noise: band-passed white at 4–7kHz, Q 1.2–2.0, decay 12–25ms (air, not harsh)
  - Tone: sine/tri, 900–1400Hz, exponential decay 70–120ms
  - Sub: sine 80–180Hz, decay 120–200ms, gain 12–18% of main (adds mass)

### 3. Envelope
- **Attack**: 1–6ms linear (no click, but immediate)
- **Decay**: exponential to 0.0001, not linear (premium feel)
- Gameboy uses linear or gate — we use `exponentialRampToValueAtTime`

### 4. Filtering
- **Always filtered**, even if high (6–8kHz lowpass). Raw oscillator = cheap.
- Highpass at 600Hz for tick to remove mud, but sub layer separately.
- Bandpass for noise to avoid white harshness.

### 5. Space
- Tiny **plate** reverb: 0.35s decay, early reflections, high-freq damping
- Not hall, not cave — small glass room
- Reverb send 22–42%, not 100% wet

### 6. Pitch
- Small glides: 1x → 0.7x for tactile drop, 1x → 1.5x for affirmative
- Not 5-octave sweeps (alien UI trope)
- Consonant intervals: major third (1.25), perfect fifth (1.5), octave (2)

### 7. Dynamics
- Humanize: ±2.5% pitch, velocity 0.6–1.0
- No two hovers identical — subtle organic variation

## Example: click vs Gameboy click

**Gameboy:**
```js
osc.frequency = 440
osc.type = 'square'
gain.gain = 0.5; gain linear to 0 in 0.1s
```

**Frontier click:**
```js
// Transient air
playNoise({ bandFreq: 5800, Q: 1.4, decay: 0.022, gain: 0.22 })

// Body — descending blip
playTone({
  freq: 1280, freqEnd: 810, glide: 0.09,
  waveform: 'sine-tri', // sine + detuned triangle 22%
  attack: 0.001, decay: 0.11,
  gain: 0.52,
  filterFreq: 6500
})

// Sub weight
playTone({ freq: 230, decay: 0.14, gain: 0.14, lowpass: 350 })
```

Result: tactile, glassy, weighted — not beepy.

## Categories Tuned

- **Navigation** (hover): <60ms, very soft, high 1.6–2.1kHz
- **Tactile** (click): 80–140ms, transient + body + sub
- **Feedback** (success): arpeggiated major triad, FM shimmer at octave
- **Motion** (whoosh): bandpassed noise sweep 200Hz→7kHz, + tonal sheen
- **System** (powerOn): 3-layer rise: sub 80→160Hz, mid 300→1200Hz, high shimmer 1.8→2.4kHz + FM

All <1s, all exponential, all filtered.

## How to keep new sounds sleek

When adding custom sounds via `define()`:

1. Use `sine` or `sine-tri`, never `square` or raw `sawtooth`
2. Always set `filterFreq` (6k typical, 3k for soft, 8k for bright)
3. Attack 1–8ms, decay exponential
4. Add noise transient 15–25ms if tactile
5. Add sub if you want weight, but lowpass <400Hz
6. Keep FM index <5 for sleek, <15 max
7. Reverb send 0.25–0.4, not 0.8
8. Test: if it sounds like Mario coin, it's wrong. If it sounds like Jarvis confirming, it's right.
