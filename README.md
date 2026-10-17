# Frontier UI Audio

**Procedurally generated, sleek Iron Man HUD interface sounds.**

No samples. No chiptune. No alien blips.  
Pure Web Audio synthesis — glassy transients, filtered noise, FM shimmer, tiny plate reverb. Built for premium, tactile, cinematic UIs.

> Inspired by Stark HUD, Jarvis, and modern sci-fi interfaces — but grounded, not cheesy.

---

## ✨ Features

- **100% Procedural** — generates all audio at runtime with Web Audio API
- **Sleek, not Gameboy** — uses sine/triangle blends, FM with low index, band-passed noise, exponential envelopes
- **40+ Presets** — navigation, tactile, state, feedback, motion, system
- **Tiny** — <10KB gzipped, zero dependencies
- **Humanized** — subtle pitch/velocity randomization for organic feel
- **Auto-bind** — data-attribute binding for instant UI wiring
- **Theming** — pitch/volume variants, reverb control, custom definitions
- **Framework-agnostic** — vanilla JS, plus optional React hooks

## 🎧 Sound Design Philosophy

Iron Man UI sounds are:

- **Short** (40–400ms) — no lingering tails
- **Layered**: transient (filtered noise 2–20ms) + body (glassy tone) + air (tiny reverb 0.3–0.8s)
- **Consonant** — major thirds, perfect fifths, not atonal
- **Filtered** — always through lowpass/bandpass, never raw oscillator
- **Exponential** — natural decay, not linear
- **Weighty** — subtle sub (60–180Hz) under high glass (1.5–4kHz)

**We avoid:**
- Square waves, raw saw, 8-bit arpeggios
- 5-octave alien sweeps, dissonant FM, harsh white noise
- Long reverbs, cavernous spaces

## 📦 Install

```bash
npm install @frontier/ui-audio
# or copy src/ into your project — zero deps
```

## 🚀 Quick Start

```ts
import { frontierAudio } from '@frontier/ui-audio'

// Must be after user gesture (click/keypress) due to autoplay policy
await frontierAudio.init({ masterVolume: 0.85, reverbAmount: 0.22 })

frontierAudio.play('click')
frontierAudio.play('success', { pitch: 1.1, volume: 0.9 })
```

### Auto-bind HTML

```html
<button data-ui-sound="click" data-ui-sound-hover="hover">Save</button>
<button data-ui-sound="deploy">Launch</button>

<script type="module">
  import { frontierAudio } from '@frontier/ui-audio'
  await frontierAudio.init()
  frontierAudio.bindAutoSounds() // now data attributes work
</script>
```

### React

```tsx
import { useUISound, useSoundButton } from '@frontier/ui-audio/react'

function SaveButton() {
  const playClick = useUISound('click')
  const btnProps = useSoundButton('click', 'hover')
  
  return <button {...btnProps} onClick={() => { playClick(); save(); }}>Save</button>
}
```

## 🎛️ API

### `frontierAudio.init(opts)`

```ts
await frontierAudio.init({
  masterVolume: 0.85,   // 0..1
  reverbAmount: 0.22,   // 0..1 — tiny sleek plate
  enabled: true,
  warmup: true          // play silent tick to unlock
})
```

### `play(name, options)`

```ts
frontierAudio.play('click')
frontierAudio.play('hover', {
  volume: 0.5,      // 0..1
  pitch: 1.2,       // 0.5 = octave down, 2 = octave up
  pan: -0.3,        // -1..1
  velocity: 0.8,    // dynamic expression
  humanize: true,   // ±2.5% pitch randomization
  delay: 0.1,       // seconds
  dry: false        // disable reverb send
})
```

### Custom Sounds

Define your own procedural sound using primitives:

```ts
frontierAudio.define('myBlip', {
  description: 'My custom glass tick',
  category: 'tactile',
  render: (ctx, engine, opts) => {
    engine.playTone({
      freq: 1200 * opts.pitch,
      freqEnd: 1800 * opts.pitch,
      glideTime: 0.12,
      waveform: 'sine-tri', // 'sine' | 'triangle' | 'sine-tri'
      attack: 0.004,
      decay: 0.18,
      gain: 0.5 * opts.volume,
      filterType: 'lowpass',
      filterFreq: 6000
    })

    // Transient air
    engine.playNoise({
      type: 'band',
      bandFreq: 6200,
      bandQ: 1.4,
      attack: 0.001,
      decay: 0.02,
      gain: 0.15 * opts.volume
    })
  }
})

frontierAudio.play('myBlip')
```

### Theming / Variants

```ts
const compactUI = frontierAudio.createVariant(1.15, 0.7) // higher, quieter
compactUI.play('tap')

frontierAudio.setVolume(0.6)
frontierAudio.setReverb(0.35)
frontierAudio.setHumanize(false)
```

### Sequences

```ts
frontierAudio.playSequence([
  { name: 'scan', at: 0 },
  { name: 'processing', at: 0.25 },
  { name: 'success', at: 0.6 }
])
```

## 🔊 Sound Library

### Navigation
`hover`, `hoverSoft`, `focus`, `select`

### Tactile
`click`, `clickSoft`, `tap`, `pop`, `glitchSoft`

### State
`toggleOn`, `toggleOff`, `activate`, `deactivate`

### Feedback
`success`, `successSoft`, `error`, `errorSoft`, `warning`, `info`, `confirm`, `deny`, `notification`, `alert`, `beacon`

### Motion
`open`, `close`, `expand`, `collapse`, `slideIn`, `slideOut`, `swipe`, `whooshShort`, `whooshLong`

### System
`scan`, `processing`, `typing`, `powerOn`, `powerOff`, `lock`, `unlock`, `deploy`, `complete`, `charging`, `pulse`

> **40 sounds total**, each procedurally rendered with 2–4 layers.

## 🧪 Demo

```bash
npm install
npm run dev
# open http://localhost:5173
```

The demo shows all sounds with category grouping, volume/reverb controls, and live code preview. Stark HUD visual design included.

## 🏗️ Architecture

```
src/
  FrontierAudio.ts      # Main API, singleton
  types.ts              # All types
  core/
    Engine.ts           # AudioContext + master bus + primitives
    NoiseBuffer.ts      # White/pink noise generation
    Envelope.ts         # ADSR helpers
  synthesis/
    Primitives.ts       # High-level: glassTick, confirmBlip, whoosh, powerOn...
  presets/
    definitions.ts      # 40+ sound definitions
  effects/
    Reverb.ts           # Procedural tiny room / plate IR
  react.ts              # Optional React hooks
demo/
  index.html            # Stark HUD demo
  demo.ts
  style.css
```

### Synthesis Stack

- **Oscillators**: sine, triangle, sine-tri blend (never square)
- **FM**: low index (0.5–4) for glassy bell, not alien
- **Noise**: band-passed white/pink (2k–8k) for air/transients
- **Filters**: Biquad lowpass/bandpass/highpass, always present
- **Envelopes**: exponential decay, 1–15ms attack (no clicks)
- **Reverb**: procedural impulse — 0.35s tiny room, early reflections, high-freq damping
- **Compressor**: gentle glue (-18dB thresh, 2.5 ratio) prevents clipping on layered sounds

## 🔧 Why Procedural?

- No network requests, no sample loading
- Infinitely variable (humanize, pitch, velocity)
- Tiny bundle, works offline
- Consistent sleek aesthetic — no mismatched sample packs
- Easy to theme per brand

## 📄 License

MIT — use anywhere.

---

**Frontier** — built for interfaces that feel like Stark tech, not Gameboy.
