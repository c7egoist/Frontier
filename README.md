# Frontier Audio

**A procedural cinematic UI sound system for the web.** Sixty-one calibrated interface sounds, synthesised in the Web Audio graph at call time — zero samples, zero downloads, zero decode latency.

The design brief: the quiet confidence of a high-end heads-up display. Machined transients, glass harmonics, filtered air and real low-end weight. Not chiptune, not 8-bit, not "alien UI" bleeps.

```ts
import { createAudio } from './src';

const audio = createAudio({ volume: 0.72 });

button.addEventListener('pointerdown', () => audio.play('click'));
saveButton.addEventListener('pointerdown', () => audio.play('save'));
await audio.unlock(); // call once inside a user gesture (iOS / Safari)
```

---

## Highlights

- **61 sounds / 7 categories** — core interaction, navigation, feedback, system power, cinematic transitions, data transfer, ambient status.
- **Procedurally generated** — every sound is a small signal graph (oscillators, shaped noise, biquads, FM bells, envelopes). No `.mp3`, no `.wav`, no base64 blobs.
- **Designed, not guessed** — each sound is rendered offline and measured (peak / RMS / K-weighted loudness). Per-sound trims live in `src/catalog/levels.ts`; the numbers are in [`docs/audio-report.md`](docs/audio-report.md).
- **Humanised** — ±6 cents of pitch drift, ±3 % level drift and small stereo placement changes per play, so repeated clicks never sound stamped.
- **Deterministic when needed** — pass a `seed` to `play()` or `render()` for reproducible variation.
- **Offline rendering + WAV export** — the exact same graph runs in an `OfflineAudioContext` for waveform previews, tests and downloadable assets.
- **Framework agnostic, SSR safe** — tree-shakeable ESM, TypeScript types, no browser globals touched at import time.
- **Thoughtful defaults** — per-sound throttling, voice stealing, master limiter, generated reverb, autoplay unlock handling.
- **Audition UI included** — `npm run dev` opens a HUD with searchable cards, live waveforms, spectrum visualiser, boot sequence and WAV export.

## Quick start

```bash
npm install
npm run dev        # audition UI → http://localhost:5173
npm run build      # library → dist/frontier-audio.js + .d.ts
npm test           # 34 tests, including an offline render of all 61 sounds
```

The library is dependency-free at runtime. Until it is published, import it from this repository:

```ts
import { createAudio, SOUNDS, searchSounds } from './src';
```

A prebuilt UMD bundle is also produced by `npm run build`:

```html
<script src="./dist/frontier-audio.umd.cjs"></script>
<script>
  const audio = FrontierAudio.createAudio();
  audio.play('powerOn');
</script>
```

## The catalog

| Category | Count | What it is for | Signature sounds |
| --- | ---: | --- | --- |
| **Core** | 10 | Direct manipulation: clicks, taps, hovers, keys, toggles | `click`, `press`, `keypress`, `toggleOn` |
| **Navigation** | 7 | Focus moves, gestures, view and menu transitions | `navigate`, `swipe`, `menuOpen`, `forward` |
| **Feedback** | 9 | Confirmations, completion, errors, alerts, notifications | `confirm`, `complete`, `error`, `notify` |
| **System** | 11 | Power, reactor pulses, charging, locks, scans | `powerOn`, `pulse`, `charging`, `unlock` |
| **Cinematic** | 5 | Scene-level transitions and hero moments | `whoosh`, `impact`, `riser`, `shimmer` |
| **Data** | 11 | Saves, transfers, syncs, progress, messages | `save`, `sync`, `upload`, `message` |
| **Status** | 8 | Ambient system state: heartbeat, sonar, shields | `heartbeat`, `sonar`, `shieldUp`, `standby` |

The full list with descriptions, tags and lengths lives in [`docs/SOUNDS.md`](docs/SOUNDS.md).

```ts
audio.play('powerOn');
audio.play('pulse');
audio.play('charging');
audio.play('unlock');
audio.play('complete');
```

IDs are forgiving: `powerOn`, `power-on`, `power_on` and `Power On` all resolve, and friendly aliases such as `boot`, `charge`, `charged`, `saved`, `notification` and `done` are included.

```ts
audio.play('boot');       // → powerOn
audio.play('success');    // → complete
audio.play('notification'); // → notify
```

## API

### `createAudio(options?)` / `new FrontierAudio(options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `volume` | `number` | `0.8` | Master volume, `0..1`. |
| `muted` | `boolean` | `false` | Start muted. |
| `maxVoices` | `number` | `24` | Concurrent voice ceiling; oldest voices are stolen. |
| `autoUnlock` | `boolean` | `true` | Resume the context on the first pointer/key gesture. |
| `context` | `BaseAudioContext` | — | Reuse a host application's context. |
| `space` | `number` | `1` | Global reverb send multiplier. |
| `enabled` | `boolean` | `true` | Hard kill switch for "interface sounds off" settings. |
| `seed` | `number` | random | Base seed for the humaniser. |

### Playback

```ts
const handle = audio.play('click', {
  volume: 0.8,     // per-voice gain
  rate: 1.05,      // pitch multiplier (does not stretch time)
  pan: -0.2,       // stereo placement -1..1
  space: 0.3,      // reverb send override
  when: 0.1,       // schedule 100 ms from now
  humanize: true,  // subtle per-play drift (default)
  force: true,     // bypass the per-sound throttle
  seed: 42,        // deterministic variation
});

handle?.stop();    // fade out a single voice
audio.stop('click');
audio.stopAll();
```

`play()` returns `null` for unknown ids, muted/disabled engines, throttled repeats, or environments without Web Audio. A handle exposes `id`, `duration`, `stopped` and `stop()`.

Sequences are choreographed with explicit gaps and scheduled ahead of time:

```ts
audio.sequence([
  { id: 'powerOn', gap: 1.15 },
  { id: 'pulse', gap: 0.85 },
  { id: 'scan', gap: 0.9 },
  { id: 'systemReady', gap: 1.3 },
]);
```

Mixer and lifecycle:

```ts
audio.setVolume(0.6);
audio.mute();
audio.unmute();
audio.setSpace(0.4);
audio.setEnabled(false);
await audio.unlock();   // true once the context is running
audio.analyser;         // AnalyserNode | null, for visualisers
audio.state;            // 'uninitialized' | 'suspended' | 'running' | 'closed' | 'unsupported'
audio.destroy();        // disconnects everything and closes owned contexts
```

### Static metadata

```ts
FrontierAudio.sounds('system');  // SoundMeta[] for one category
FrontierAudio.get('boot');       // SoundMeta for powerOn
searchSounds('mechanical');      // search names, descriptions, tags
SOUND_CATEGORIES;                // display metadata for menus
```

### Offline rendering & export

```ts
// Same graph, rendered offline. Useful for waveform previews and tests.
const rendered = await audio.render('complete', { sampleRate: 44100 });
rendered?.duration; // audible length in seconds
rendered?.buffer;   // AudioBuffer

// 16-bit PCM stereo WAV Blob, ready for download or analysis.
const wav = await audio.exportWav('powerOn');
```

In Node, pass a `contextFactory` that returns an `OfflineAudioContext` implementation (the test suite uses `web-audio-engine`):

```ts
const rendered = await renderSound(SOUNDS[0], {
  contextFactory: (channels, length, sampleRate) =>
    new OfflineAudioContext(channels, length, sampleRate),
});
```

## Framework integration

**React**

```tsx
import { useEffect, useRef } from 'react';
import { createAudio, type FrontierAudio } from './src';

export function useUiAudio() {
  const ref = useRef<FrontierAudio | null>(null);
  if (!ref.current) ref.current = createAudio({ volume: 0.6 });

  useEffect(() => {
    const unlock = () => void ref.current?.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      ref.current?.destroy();
    };
  }, []);

  return ref.current;
}

// <button onPointerDown={() => audio.play('click')} />
```

**Vue / Svelte** work the same way — create one engine per app, unlock inside the first gesture, and call `destroy()` when the app tears down.

## Sound design notes

The catalog follows a few hard rules that keep it away from game-console territory:

1. **No retro waveforms.** No square or sawtooth oscillators, no bit-crushing, no stepped arpeggios. The palette is sine, triangle, filtered noise and FM.
2. **Two layers minimum.** A click is a 1 ms filtered noise transient (the surface) plus a pitched body (the mechanism) and, sometimes, a low thump (the mass).
3. **Attacks are finite.** Even "sharp" sounds use 0.5–4 ms attacks; nothing starts on a hard sample discontinuity. The result reads as precision hardware, not a beep.
4. **Harmony is warm.** Confirmations use major/add9 voicings with staggered entries so they bloom; errors sit low (130–200 Hz) and use gentle detuning instead of shrill buzzes.
5. **Space is synthetic but real.** A short impulse response is generated in code (damped noise with early reflections) and shared by all voices. Reverb amount is per-sound.
6. **The mix is measured.** Each sound has a designed peak target (hover −28 dBFS, clicks −13, power-on −6). `npm run measure` renders the whole catalog offline and reports peak, RMS and K-weighted loudness.

More detail, including the exact recipes for power-on, pulse, charging and unlock, is in [`docs/DESIGN.md`](docs/DESIGN.md).

## Extending the catalog

Add a definition in the relevant file under `src/catalog/` and the registry, aliases, docs, demo and tests pick it up automatically.

```ts
import { define } from './define';

export const mySounds = [
  define({
    id: 'dockingClamp',
    name: 'Docking Clamp',
    category: 'system',
    description: 'Heavy clamp engaging with a short servo whine.',
    duration: 0.7,
    tags: ['mechanical', 'clamp', 'servo'],
    space: 0.22,
    create(v) {
      v.thump({ freq: 82, dur: 0.3, gain: 0.09, drop: 1.8 });
      v.transient({ gain: 0.03, freq: 2400 });
      v.noise({
        dur: 0.35, gain: 0.02, attack: 0.06,
        filter: { type: 'bandpass', f: 900, f1: 2200, q: 1.2 },
      });
      v.bell({ freq: 320, dur: 0.4, gain: 0.02, ratio: 2.6, index: 0.7 });
    },
  }),
];
```

`Voice` primitives:

| Method | Purpose |
| --- | --- |
| `tone(opts)` | Oscillator with envelope, glide, optional vibrato and filter chain |
| `noise(opts)` | White/pink noise through biquads; the air/hiss layer |
| `bell(opts)` | FM bell — glass at ratio 2, metal at 2.4–3.5 |
| `thump(opts)` | Pitch-dropping sine for physical weight |
| `pluck(opts)` | Soft plucked harmonic |
| `sweep(opts)` | Noise + tone rising together for power/charge gestures |
| `transient(opts)` | One-millisecond filtered click layer |
| `chord(freqs, opts)` | Level-compensated stack of tones |

After adding sounds:

```bash
npm run measure:write   # measure new sounds and write level trims
npm run docs            # regenerate docs/SOUNDS.md + audio report
npm test
```

## Browser support

- Chrome/Edge 88+, Firefox 90+, Safari 14.1+ (Web Audio API).
- Autoplay policies require a user gesture; `autoUnlock` handles this by resuming on the first pointer/key event. For iOS, call `await audio.unlock()` directly inside your tap handler before playing a critical first sound.
- `OfflineAudioContext` is required only for `render()` / `exportWav()`.
- Safe to import in SSR: no `window`, `document` or `AudioContext` is touched at module load.

## Accessibility & UX guidance

Sound should confirm, not decorate. A few defaults that work well:

- Hover only on pointer devices, and only at very low volume; never on every mouse move.
- Avoid sounds on scroll, typing and progress if the user is already in flow — `scroll` and `progressTick` exist but are intentionally quiet.
- Respect a user setting: `audio.setEnabled(false)` is wired to a global kill switch and stops all voices.
- Pair every sound with a visual state change; never use audio as the only feedback channel.
- The demo honours `prefers-reduced-motion` for its animations.

## Project structure

```
src/
  core/       engine, voice synthesis, DSP, reverb, offline render, WAV
  catalog/    sounds by category, level table, registry + aliases
  types.ts    public type surface
demo/         audition HUD (search, waveforms, visualiser, export)
scripts/      measure.ts · render-wavs.ts · docs.ts
tests/        catalog integrity, offline rendering, engine, demo smoke test
docs/         generated sound catalog + measured audio report + design notes
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Audition UI with hot reload. |
| `npm run build` | ESM + UMD library and TypeScript declarations. |
| `npm run build:demo` | Static build of the audition UI. |
| `npm test` | Unit + integration + offline-render tests. |
| `npm run typecheck` | Strict TypeScript check. |
| `npm run measure` | Render all sounds and print peak/RMS/LUFS. |
| `npm run measure:write` | Recompute level trims from the measurement. |
| `npm run render:wavs` | Render every sound to `out/*.wav`. |
| `npm run docs` | Regenerate `docs/SOUNDS.md` and the audio report. |

## License

MIT. The sounds are generated at runtime, so anything you build with them ships without audio assets or licensing obligations.
