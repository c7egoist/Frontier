import { NOTE } from '../core/dsp';
import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Status / ambience.
 *
 * Slow, low and spacious. These are the sounds that make an interface feel
 * alive while the user is doing nothing — and the ones most likely to become
 * annoying if overused, so they are mixed conservatively.
 */
export const statusSounds: SoundDef[] = [
  define({
    id: 'heartbeat',
    name: 'Heartbeat',
    category: 'status',
    description: 'Reactor idle: a lub-dub pair of sub thumps with a faint metal halo.',
    duration: 1.00,
    tags: ['heartbeat', 'idle', 'reactor', 'ambient', 'low'],
    variants: 2,
    minInterval: 900,
    space: 0.32,
    create(v) {
      const root = rand(v.rng, 46, 52);
      v.thump({ freq: root, dur: 0.45, gain: 0.14, drop: 1.5 });
      v.thump({ freq: root * 0.96, dur: 0.5, gain: 0.1, drop: 1.5, when: 0.16 });
      v.tone({
        freq: root * 2,
        dur: 0.5,
        gain: 0.02,
        attack: 0.01,
        release: 0.46,
        filter: { type: 'lowpass', f: 220 },
      });
      v.bell({ freq: 96, dur: 1.0, gain: 0.012, ratio: 2.4, index: 0.6, when: 0.03 });
      v.tone({
        freq: 232,
        dur: 0.4,
        gain: 0.03,
        attack: 0.01,
        release: 0.36,
        filter: { type: 'lowpass', f: 800 },
      });
      v.transient({ gain: 0.011, freq: 2400, when: 0.01 });
      v.noise({
        dur: 0.8,
        gain: 0.012,
        attack: 0.15,
        color: 'pink',
        filter: { type: 'lowpass', f: 300, f1: 120 },
      });
    },
  }),

  define({
    id: 'sonar',
    name: 'Sonar',
    category: 'status',
    description: 'Long-range ping: a clean bell sent out into a wide, dark space.',
    duration: 1.55,
    tags: ['sonar', 'ping', 'range', 'space', 'scan'],
    minInterval: 900,
    space: 0.5,
    create(v) {
      v.bell({ freq: NOTE.A5, dur: 1.6, gain: 0.05, ratio: 2.0, index: 0.5 });
      v.tone({
        freq: NOTE.A5,
        dur: 1.4,
        gain: 0.018,
        attack: 0.004,
        release: 1.35,
        filter: { type: 'lowpass', f: 4200 },
      });
      v.tone({ freq: NOTE.A4, dur: 1.2, gain: 0.012, attack: 0.01, release: 1.1 });
      v.thump({ freq: 65, dur: 0.4, gain: 0.04, drop: 1.6 });
      v.noise({
        dur: 1.2,
        gain: 0.006,
        attack: 0.3,
        filter: { type: 'highpass', f: 7000 },
      });
    },
  }),

  define({
    id: 'shieldUp',
    name: 'Shield Up',
    category: 'status',
    description: 'Protective field forming: a rising chord with air wrapping around it.',
    duration: 1.35,
    tags: ['shield', 'protect', 'up', 'power', 'rising'],
    minInterval: 600,
    space: 0.36,
    create(v) {
      [NOTE.A3, NOTE.E4, NOTE.A4].forEach((freq, i) => {
        v.tone({
          freq,
          glideTo: freq * 1.02,
          dur: 0.9,
          gain: 0.045 - i * 0.006,
          attack: 0.35,
          release: 0.6,
          when: i * 0.04,
        });
      });
      v.noise({
        dur: 0.8,
        gain: 0.04,
        attack: 0.4,
        filter: [
          { type: 'highpass', f: 300 },
          { type: 'bandpass', f: 700, f1: 4200, q: 0.7, sweepTime: 0.75 },
        ],
      });
      v.bell({ freq: NOTE.A5, dur: 0.8, gain: 0.02, ratio: 2, index: 0.8, when: 0.5 });
      v.thump({ freq: 60, dur: 0.35, gain: 0.05, drop: 1.7, when: 0.45 });
    },
  }),

  define({
    id: 'shieldDown',
    name: 'Shield Down',
    category: 'status',
    description: 'Protective field collapsing: the same chord folds back into low air.',
    duration: 0.95,
    tags: ['shield', 'down', 'collapse', 'power'],
    minInterval: 600,
    space: 0.32,
    create(v) {
      [NOTE.A4, NOTE.E4, NOTE.A3].forEach((freq, i) => {
        v.tone({
          freq,
          glideTo: freq * 0.98,
          dur: 0.8,
          gain: 0.04 - i * 0.004,
          attack: 0.02,
          release: 0.75,
          when: i * 0.05,
        });
      });
      v.noise({
        dur: 0.75,
        gain: 0.032,
        attack: 0.03,
        filter: [
          { type: 'highpass', f: 900, f1: 150 },
          { type: 'bandpass', f: 4000, f1: 600, q: 0.7, sweepTime: 0.7 },
        ],
      });
      v.thump({ freq: 52, dur: 0.4, gain: 0.06, drop: 1.6, when: 0.4 });
    },
  }),

  define({
    id: 'targetLock',
    name: 'Target Lock',
    category: 'status',
    description: 'Acquisition: three accelerating ticks snapping into a settled chord.',
    duration: 1.05,
    tags: ['target', 'lock', 'hud', 'acquire', 'mechanical'],
    minInterval: 400,
    space: 0.26,
    create(v) {
      [0, 0.14, 0.25].forEach((when, i) => {
        v.transient({ gain: 0.024, freq: 2800 + i * 500, when });
        v.tone({
          freq: 1100 + i * 220,
          dur: 0.05,
          gain: 0.014,
          attack: 0.001,
          release: 0.045,
          when,
        });
      });
      v.tone({ freq: NOTE.A4, dur: 0.4, gain: 0.028, attack: 0.006, when: 0.34 });
      v.tone({ freq: NOTE.E5, dur: 0.5, gain: 0.022, attack: 0.008, when: 0.4 });
      v.bell({ freq: NOTE.A5, dur: 0.5, gain: 0.018, ratio: 2, index: 0.8, when: 0.44 });
      v.thump({ freq: 80, dur: 0.2, gain: 0.04, drop: 1.8, when: 0.34 });
    },
  }),

  define({
    id: 'hudOpen',
    name: 'HUD Open',
    category: 'status',
    description: 'Heads-up display deploying: air unfolds, metal locks into place.',
    duration: 0.80,
    tags: ['hud', 'open', 'display', 'deploy'],
    minInterval: 300,
    space: 0.3,
    create(v) {
      v.noise({
        dur: 0.4,
        gain: 0.04,
        attack: 0.09,
        filter: [
          { type: 'highpass', f: 400 },
          { type: 'bandpass', f: 1200, f1: 4800, q: 0.7, sweepTime: 0.38 },
        ],
      });
      v.tone({
        freq: NOTE.A4,
        glideTo: NOTE.E5,
        dur: 0.35,
        gain: 0.028,
        attack: 0.05,
        release: 0.3,
      });
      v.bell({ freq: NOTE.A5, dur: 0.5, gain: 0.018, ratio: 2.4, index: 0.8, when: 0.2 });
      v.transient({ gain: 0.022, freq: 3000, when: 0.22 });
    },
  }),

  define({
    id: 'hudClose',
    name: 'HUD Close',
    category: 'status',
    description: 'Heads-up display retracting: metal releases, air folds away.',
    duration: 0.55,
    tags: ['hud', 'close', 'display', 'retract'],
    minInterval: 300,
    space: 0.26,
    create(v) {
      v.transient({ gain: 0.02, freq: 2800 });
      v.tone({
        freq: NOTE.E5,
        glideTo: NOTE.A4,
        dur: 0.3,
        gain: 0.024,
        attack: 0.01,
        release: 0.28,
      });
      v.noise({
        dur: 0.36,
        gain: 0.03,
        attack: 0.04,
        when: 0.06,
        filter: { type: 'bandpass', f: 4200, f1: 1000, q: 0.7, sweepTime: 0.32 },
      });
      v.bell({ freq: NOTE.A4, dur: 0.3, gain: 0.012, ratio: 2.4, index: 0.5, when: 0.1 });
    },
  }),

  define({
    id: 'standby',
    name: 'Standby',
    category: 'status',
    description: 'Idle acknowledgement: two low notes and a breath, almost below notice.',
    duration: 1.15,
    tags: ['standby', 'idle', 'ambient', 'low', 'subtle'],
    minInterval: 1200,
    space: 0.34,
    create(v) {
      v.tone({ freq: NOTE.D3, dur: 0.8, gain: 0.04, attack: 0.08, release: 0.72 });
      v.tone({ freq: NOTE.A3, dur: 1.0, gain: 0.026, attack: 0.12, release: 0.88, when: 0.12 });
      v.noise({
        dur: 0.9,
        gain: 0.01,
        attack: 0.3,
        color: 'pink',
        filter: { type: 'lowpass', f: 800, f1: 300 },
      });
      v.bell({ freq: NOTE.D5, dur: 0.8, gain: 0.008, ratio: 2, index: 0.4, when: 0.2 });
    },
  }),
];
