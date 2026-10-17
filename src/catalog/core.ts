import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Core micro-interactions.
 *
 * Recipe notes:
 * - every click is two layers: a 1 ms filtered transient (the "surface") and a
 *   quiet pitched body (the "mechanism"). Real hardware clicks never contain
 *   only noise.
 * - pitches live in the 1.4–6 kHz region with a low-passed 200 Hz body, which
 *   reads as machined metal and glass rather than plastic game buttons.
 */
export const coreSounds: SoundDef[] = [
  define({
    id: 'tick',
    name: 'Tick',
    category: 'core',
    description: 'Micro glass tick for fine selection changes and steppers.',
    duration: 0.20,
    tags: ['micro', 'glass', 'selector', 'subtle'],
    variants: 6,
    minInterval: 22,
    space: 0.08,
    create(v) {
      const pitch = rand(v.rng, 2900, 3900);
      v.transient({ gain: 0.05, freq: rand(v.rng, 3800, 5200) });
      v.tone({
        freq: pitch,
        dur: 0.05,
        gain: 0.032,
        attack: 0.0008,
        release: 0.045,
        type: 'sine',
      });
      v.noise({
        dur: 0.018,
        gain: 0.02,
        filter: { type: 'bandpass', f: 5400, q: 2.4 },
      });
    },
  }),

  define({
    id: 'click',
    name: 'Click',
    category: 'core',
    description: 'Primary interface click. Crisp surface, soft mechanism underneath.',
    duration: 0.20,
    tags: ['primary', 'button', 'press', 'crisp'],
    variants: 4,
    minInterval: 28,
    space: 0.1,
    create(v) {
      const body = rand(v.rng, 210, 260);
      v.transient({ gain: 0.075, freq: rand(v.rng, 3000, 4200) });
      v.tone({
        freq: body,
        glideTo: body * 0.72,
        dur: 0.085,
        gain: 0.055,
        attack: 0.001,
        release: 0.08,
      });
      v.tone({
        freq: rand(v.rng, 2350, 2750),
        dur: 0.032,
        gain: 0.022,
        attack: 0.001,
        release: 0.03,
      });
      // Mid body: without this the click is only surface and air.
      v.tone({
        freq: rand(v.rng, 600, 700),
        dur: 0.055,
        gain: 0.014,
        attack: 0.002,
        release: 0.05,
        filter: { type: 'lowpass', f: 2200 },
      });
      v.noise({
        dur: 0.035,
        gain: 0.026,
        filter: { type: 'bandpass', f: 2700, q: 1.1 },
      });
    },
  }),

  define({
    id: 'tap',
    name: 'Tap',
    category: 'core',
    description: 'Warmer touchscreen tap with a little more physical weight.',
    duration: 0.25,
    tags: ['touch', 'button', 'soft', 'mobile'],
    variants: 4,
    minInterval: 35,
    space: 0.12,
    create(v) {
      v.thump({ freq: 135, dur: 0.13, gain: 0.07, drop: 2.1 });
      v.transient({ gain: 0.045, freq: 2200 });
      v.tone({
        freq: rand(v.rng, 1500, 1900),
        dur: 0.06,
        gain: 0.024,
        attack: 0.002,
        release: 0.055,
      });
      v.noise({
        dur: 0.05,
        gain: 0.02,
        color: 'pink',
        filter: { type: 'lowpass', f: 2400, f1: 900 },
      });
    },
  }),

  define({
    id: 'press',
    name: 'Press',
    category: 'core',
    description: 'Machined button travel: a metallic bite with a low detent.',
    duration: 0.30,
    tags: ['button', 'metal', 'hardware', 'detent'],
    variants: 3,
    minInterval: 40,
    space: 0.14,
    create(v) {
      const base = rand(v.rng, 1600, 1850);
      v.transient({ gain: 0.06, freq: 2600 });
      v.tone({ freq: base, dur: 0.12, gain: 0.035, attack: 0.001, release: 0.11 });
      v.bell({ freq: base * 1.5, dur: 0.16, gain: 0.016, ratio: 2.4, index: 0.8 });
      v.thump({ freq: 105, dur: 0.16, gain: 0.05, drop: 1.9 });
    },
  }),

  define({
    id: 'release',
    name: 'Release',
    category: 'core',
    description: 'Button release. Softer and slightly lower than Press.',
    duration: 0.25,
    tags: ['button', 'metal', 'hardware'],
    variants: 3,
    minInterval: 40,
    space: 0.14,
    create(v) {
      v.transient({ gain: 0.03, freq: 3400 });
      v.tone({
        freq: rand(v.rng, 1200, 1400),
        glideTo: 900,
        dur: 0.1,
        gain: 0.022,
        attack: 0.002,
        release: 0.09,
      });
      v.noise({
        dur: 0.07,
        gain: 0.014,
        color: 'pink',
        filter: { type: 'bandpass', f: 2200, f1: 1400, q: 0.8 },
      });
      v.tone({
        freq: 720,
        dur: 0.06,
        gain: 0.01,
        attack: 0.002,
        release: 0.055,
        filter: { type: 'lowpass', f: 2000 },
      });
      v.thump({ freq: 90, dur: 0.12, gain: 0.025, drop: 1.7 });
    },
  }),

  define({
    id: 'hover',
    name: 'Hover',
    category: 'core',
    description: 'The quietest possible acknowledgement: a breath of glass.',
    duration: 0.20,
    tags: ['hover', 'subtle', 'ambient', 'pointer'],
    variants: 5,
    minInterval: 70,
    space: 0.1,
    create(v) {
      const pitch = rand(v.rng, 5200, 6800);
      v.noise({
        dur: 0.035,
        gain: 0.012,
        attack: 0.004,
        filter: { type: 'bandpass', f: pitch, q: 1.8 },
      });
      v.tone({
        freq: pitch * 0.5,
        dur: 0.05,
        gain: 0.008,
        attack: 0.004,
        release: 0.045,
      });
    },
  }),

  define({
    id: 'toggleOn',
    name: 'Toggle On',
    category: 'core',
    description: 'Switch engaging: tiny mechanical snap plus a rising confirmation.',
    duration: 0.30,
    tags: ['toggle', 'switch', 'on', 'settings'],
    variants: 3,
    minInterval: 45,
    space: 0.13,
    create(v) {
      v.transient({ gain: 0.05, freq: 3000 });
      v.tone({
        freq: 470,
        dur: 0.07,
        gain: 0.016,
        attack: 0.002,
        release: 0.065,
        filter: { type: 'lowpass', f: 1800 },
      });
      v.tone({
        freq: 520,
        glideTo: 780,
        dur: 0.11,
        gain: 0.035,
        attack: 0.002,
        release: 0.1,
      });
      v.bell({ freq: 1560, dur: 0.18, gain: 0.018, ratio: 2, index: 0.7 });
      v.thump({ freq: 120, dur: 0.1, gain: 0.03, drop: 1.6 });
    },
  }),

  define({
    id: 'toggleOff',
    name: 'Toggle Off',
    category: 'core',
    description: 'Switch disengaging: the same snap, falling instead of rising.',
    duration: 0.30,
    tags: ['toggle', 'switch', 'off', 'settings'],
    variants: 3,
    minInterval: 45,
    space: 0.13,
    create(v) {
      v.transient({ gain: 0.045, freq: 2800 });
      v.tone({
        freq: 700,
        glideTo: 460,
        dur: 0.1,
        gain: 0.03,
        attack: 0.002,
        release: 0.09,
      });
      v.bell({ freq: 980, dur: 0.15, gain: 0.014, ratio: 2, index: 0.6 });
      v.thump({ freq: 100, dur: 0.09, gain: 0.025, drop: 1.6 });
    },
  }),

  define({
    id: 'keypress',
    name: 'Keypress',
    category: 'core',
    description: 'Soft tactile keyboard key, tuned for rapid typing without fatigue.',
    duration: 0.20,
    tags: ['keyboard', 'typing', 'input', 'text'],
    variants: 5,
    minInterval: 28,
    space: 0.08,
    create(v) {
      const f = rand(v.rng, 1700, 2300);
      v.transient({ gain: 0.035, freq: 1900 });
      v.tone({
        freq: f,
        glideTo: f * 0.8,
        dur: 0.05,
        gain: 0.028,
        attack: 0.001,
        release: 0.045,
        filter: { type: 'lowpass', f: 3200 },
      });
      v.thump({ freq: 125, dur: 0.07, gain: 0.022, drop: 1.5 });
    },
  }),

  define({
    id: 'scroll',
    name: 'Scroll Step',
    category: 'core',
    description: 'Airy detent for scroll ticks. Nearly subliminal at high rates.',
    duration: 0.15,
    tags: ['scroll', 'micro', 'subtle', 'air'],
    variants: 5,
    minInterval: 40,
    space: 0.09,
    create(v) {
      v.noise({
        dur: 0.03,
        gain: 0.016,
        attack: 0.003,
        filter: {
          type: 'bandpass',
          f: rand(v.rng, 2800, 4200),
          q: 1.4,
        },
      });
      v.tone({
        freq: rand(v.rng, 1200, 1600),
        dur: 0.035,
        gain: 0.012,
        attack: 0.002,
        release: 0.03,
      });
    },
  }),
];
