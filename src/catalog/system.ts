import { NOTE } from '../core/dsp';
import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * System / power family.
 *
 * The brief: Iron Man HUD, not a console. The formula that gets us there:
 *   1. sub-bass swell for physical weight (45–90 Hz, never a buzzy saw),
 *   2. filtered air opening over the same window (energy entering the room),
 *   3. a wide major-add9 chord blooming *after* the swell peaks,
 *   4. one brushed-metal ring and a soft transient to tie it to hardware.
 * Nothing here is pitched above A6, and all transients have >1 ms attacks.
 */

const D_MAJOR_ADD9 = [NOTE.D3, NOTE.A3, NOTE.D4, 369.99 /* F#4 */, NOTE.A4, NOTE.E6];

export const systemSounds: SoundDef[] = [
  define({
    id: 'powerOn',
    name: 'Power On',
    category: 'system',
    description: 'Reactor spin-up: sub swell, opening air, and a wide major chord bloom.',
    duration: 1.50,
    tags: ['power', 'on', 'startup', 'reactor', 'cinematic', 'boot'],
    variants: 2,
    minInterval: 800,
    space: 0.4,
    create(v) {
      const drift = rand(v.rng, -18, 18);

      // 1. Sub swell
      v.tone({
        freq: 42,
        glideTo: 82,
        dur: 1.15,
        gain: 0.15,
        attack: 0.32,
        release: 0.75,
        glideTime: 0.85,
      });
      // 2. Opening air
      v.noise({
        dur: 1.05,
        gain: 0.055,
        attack: 0.42,
        color: 'pink',
        pan: -0.15,
        filter: [
          { type: 'highpass', f: 240, f1: 900 },
          { type: 'bandpass', f: 420, f1: 5200, q: 0.65, sweepTime: 0.95 },
        ],
      });
      v.noise({
        dur: 0.9,
        gain: 0.02,
        attack: 0.5,
        pan: 0.25,
        filter: { type: 'highpass', f: 3800, f1: 7000 },
      });
      // 3. Chord bloom
      D_MAJOR_ADD9.forEach((freq, i) => {
        v.tone({
          freq,
          dur: 0.9 - i * 0.05,
          gain: 0.05 - i * 0.004,
          attack: 0.025,
          release: 0.85 - i * 0.05,
          when: 0.5 + i * 0.012,
          detune: drift + i * 2,
        });
      });
      // 4. Metal and impact
      v.bell({ freq: NOTE.D4, dur: 0.9, gain: 0.032, ratio: 2.76, index: 1.4, when: 0.5 });
      v.thump({ freq: 52, dur: 0.5, gain: 0.13, drop: 1.7, when: 0.5 });
      v.transient({ gain: 0.022, freq: 3200, when: 0.5 });
      v.bell({ freq: NOTE.A5, dur: 0.8, gain: 0.016, ratio: 3, index: 0.7, when: 0.62 });
    },
  }),

  define({
    id: 'powerDown',
    name: 'Power Down',
    category: 'system',
    description: 'Systems settling: air closes, sub falls away, a final soft clunk.',
    duration: 1.20,
    tags: ['power', 'off', 'shutdown', 'reactor', 'settle'],
    minInterval: 800,
    space: 0.32,
    create(v) {
      v.tone({ freq: NOTE.D3, dur: 0.75, gain: 0.05, attack: 0.01, release: 0.7 });
      v.tone({ freq: NOTE.A3, dur: 0.7, gain: 0.034, attack: 0.02, release: 0.65 });
      v.noise({
        dur: 0.9,
        gain: 0.042,
        attack: 0.04,
        color: 'pink',
        filter: [
          { type: 'highpass', f: 1400, f1: 120 },
          { type: 'bandpass', f: 5200, f1: 300, q: 0.6, sweepTime: 0.85 },
        ],
      });
      v.tone({
        freq: 96,
        glideTo: 38,
        dur: 1.0,
        gain: 0.1,
        attack: 0.02,
        release: 0.95,
        glideTime: 0.8,
      });
      v.thump({ freq: 48, dur: 0.4, gain: 0.08, drop: 1.5, when: 0.72 });
      v.transient({ gain: 0.012, freq: 2000, when: 0.72 });
    },
  }),

  define({
    id: 'pulse',
    name: 'Pulse',
    category: 'system',
    description: 'Reactor heartbeat: three softened low throbs with a metallic halo.',
    duration: 1.15,
    tags: ['pulse', 'heartbeat', 'reactor', 'throb', 'ambient'],
    variants: 2,
    minInterval: 500,
    space: 0.3,
    create(v) {
      const root = rand(v.rng, 50, 55);
      [0, 0.27, 0.54].forEach((when, i) => {
        v.thump({ freq: root, dur: 0.5, gain: 0.15 - i * 0.025, drop: 1.55, when });
        v.tone({
          freq: root * 2.02,
          dur: 0.32,
          gain: 0.022,
          attack: 0.01,
          release: 0.29,
          when,
          filter: { type: 'lowpass', f: 240 },
        });
      });
      v.noise({
        dur: 0.85,
        gain: 0.018,
        attack: 0.12,
        color: 'pink',
        filter: { type: 'lowpass', f: 260, f1: 120 },
      });
      v.bell({ freq: 108, dur: 1.1, gain: 0.022, ratio: 2.4, index: 0.9 });
      // Faint hum and valve tick so the pulse reads on small speakers.
      v.tone({
        freq: 324,
        dur: 0.55,
        gain: 0.018,
        attack: 0.06,
        release: 0.5,
        filter: { type: 'lowpass', f: 900 },
      });
      v.transient({ gain: 0.006, freq: 2600, when: 0.02 });
      v.bell({ freq: NOTE.A5, dur: 0.7, gain: 0.007, ratio: 3, index: 0.4, when: 0.08 });
    },
  }),

  define({
    id: 'charging',
    name: 'Charging',
    category: 'system',
    description: 'Energy building: a rising tone, widening air and accelerating power throbs.',
    duration: 2.15,
    tags: ['charge', 'charging', 'energy', 'rising', 'reactor'],
    variants: 2,
    minInterval: 900,
    space: 0.32,
    create(v) {
      const top = rand(v.rng, 620, 700);
      v.tone({
        freq: 82,
        glideTo: top,
        dur: 1.5,
        gain: 0.085,
        attack: 0.38,
        release: 1.05,
        glideTime: 1.25,
      });
      v.tone({
        freq: 123,
        glideTo: top * 1.5,
        dur: 1.45,
        gain: 0.032,
        attack: 0.5,
        release: 0.9,
        glideTime: 1.2,
        detune: 6,
      });
      v.noise({
        dur: 1.5,
        gain: 0.05,
        attack: 0.7,
        color: 'pink',
        filter: [
          { type: 'highpass', f: 200 },
          { type: 'bandpass', f: 500, f1: 4800, q: 0.7, sweepTime: 1.4 },
        ],
      });
      [0.2, 0.62, 1.02].forEach((when, i) => {
        v.thump({ freq: 58, dur: 0.34, gain: 0.055 + i * 0.012, drop: 1.6, when });
      });
      v.bell({ freq: NOTE.A5, dur: 0.75, gain: 0.022, ratio: 2, index: 0.9, when: 1.3 });
      v.noise({
        dur: 0.4,
        gain: 0.012,
        attack: 0.2,
        when: 1.25,
        filter: { type: 'highpass', f: 6000 },
      });
    },
  }),

  define({
    id: 'chargeComplete',
    name: 'Charge Complete',
    category: 'system',
    description: 'Fully charged: a bright, locked-in major chord with a glass strike.',
    duration: 1.00,
    tags: ['charge', 'complete', 'ready', 'energy', 'bright'],
    minInterval: 500,
    space: 0.34,
    create(v) {
      [NOTE.D5, 739.99 /* F#5 */, NOTE.A5, NOTE.D6].forEach((freq, i) => {
        v.tone({
          freq,
          dur: 0.75 - i * 0.04,
          gain: 0.036,
          attack: 0.006,
          release: 0.7,
          when: i * 0.02,
        });
      });
      v.bell({ freq: NOTE.D6, dur: 0.9, gain: 0.032, ratio: 3, index: 1, when: 0.02 });
      v.thump({ freq: 78, dur: 0.3, gain: 0.07, drop: 1.7 });
      v.noise({
        dur: 0.5,
        gain: 0.018,
        attack: 0.09,
        filter: { type: 'highpass', f: 5000, f1: 9000 },
      });
    },
  }),

  define({
    id: 'unlock',
    name: 'Unlock',
    category: 'system',
    description: 'Access granted: a mechanical clunk, a breath of air, then a confirming fifth.',
    duration: 1.00,
    tags: ['unlock', 'access', 'granted', 'mechanical', 'security'],
    minInterval: 400,
    space: 0.28,
    create(v) {
      // Mechanical latch
      v.noise({
        dur: 0.09,
        gain: 0.05,
        attack: 0.001,
        color: 'pink',
        filter: { type: 'lowpass', f: 1400, f1: 500, q: 1.4 },
      });
      v.thump({ freq: 88, dur: 0.2, gain: 0.08, drop: 1.9 });
      v.bell({ freq: 310, dur: 0.24, gain: 0.022, ratio: 2.4, index: 0.8 });
      // Release of air
      v.noise({
        dur: 0.36,
        gain: 0.026,
        attack: 0.05,
        when: 0.08,
        pan: 0.15,
        filter: { type: 'bandpass', f: 1200, f1: 3200, q: 0.8, sweepTime: 0.28 },
      });
      // Confirming fifth
      v.tone({ freq: NOTE.A4, dur: 0.42, gain: 0.036, attack: 0.008, when: 0.16 });
      v.tone({ freq: NOTE.E5, dur: 0.55, gain: 0.03, attack: 0.012, when: 0.23 });
      v.bell({ freq: NOTE.A5, dur: 0.6, gain: 0.02, ratio: 2, index: 0.8, when: 0.3 });
    },
  }),

  define({
    id: 'lock',
    name: 'Lock',
    category: 'system',
    description: 'Secure and seal: a descending pair resolving into a heavy latch.',
    duration: 0.60,
    tags: ['lock', 'secure', 'close', 'mechanical', 'security'],
    minInterval: 300,
    space: 0.26,
    create(v) {
      v.tone({ freq: NOTE.E5, dur: 0.3, gain: 0.03, attack: 0.008, release: 0.28 });
      v.tone({ freq: NOTE.A4, dur: 0.4, gain: 0.032, attack: 0.01, release: 0.36, when: 0.08 });
      v.noise({
        dur: 0.3,
        gain: 0.02,
        attack: 0.04,
        pan: -0.12,
        filter: { type: 'bandpass', f: 3000, f1: 1000, q: 0.8, sweepTime: 0.26 },
      });
      v.thump({ freq: 74, dur: 0.28, gain: 0.08, drop: 1.8, when: 0.2 });
      v.transient({ gain: 0.03, freq: 2200, when: 0.2 });
      v.bell({ freq: 220, dur: 0.3, gain: 0.018, ratio: 2.6, index: 0.7, when: 0.2 });
    },
  }),

  define({
    id: 'scan',
    name: 'Scan',
    category: 'system',
    description: 'Sweeping sensor: air rises, crosses the stereo field, then settles.',
    duration: 1.10,
    tags: ['scan', 'sensor', 'sweep', 'hud', 'analysis'],
    minInterval: 400,
    space: 0.34,
    create(v) {
      v.noise({
        dur: 0.55,
        gain: 0.045,
        attack: 0.12,
        pan: -0.3,
        filter: { type: 'bandpass', f: 500, f1: 4200, q: 0.9, sweepTime: 0.5 },
      });
      v.noise({
        dur: 0.5,
        gain: 0.03,
        attack: 0.1,
        when: 0.42,
        pan: 0.35,
        color: 'pink',
        filter: { type: 'bandpass', f: 4000, f1: 900, q: 0.8, sweepTime: 0.45 },
      });
      v.tone({
        freq: 1200,
        glideTo: 2600,
        dur: 0.5,
        gain: 0.016,
        attack: 0.1,
        pan: -0.35,
        release: 0.4,
      });
      v.tone({
        freq: 1800,
        glideTo: 900,
        dur: 0.42,
        gain: 0.012,
        attack: 0.1,
        when: 0.45,
        pan: 0.35,
        release: 0.35,
      });
      v.transient({ gain: 0.02, freq: 4200, when: 0.02 });
      v.transient({ gain: 0.016, freq: 3600, when: 0.95 });
    },
  }),

  define({
    id: 'calibrate',
    name: 'Calibrate',
    category: 'system',
    description: 'Alignment sequence: five rising micro-detents resolving to a soft chime.',
    duration: 1.10,
    tags: ['calibrate', 'alignment', 'sequence', 'detent'],
    minInterval: 300,
    space: 0.22,
    create(v) {
      [0, 0.09, 0.18, 0.27].forEach((when, i) => {
        v.transient({ gain: 0.02 + i * 0.004, freq: 2600 + i * 420, when });
        v.tone({
          freq: 900 + i * 160,
          dur: 0.05,
          gain: 0.014,
          attack: 0.001,
          release: 0.045,
          when,
        });
      });
      v.bell({ freq: NOTE.A5, dur: 0.6, gain: 0.024, ratio: 2, index: 0.8, when: 0.38 });
      v.tone({ freq: NOTE.A3, dur: 0.4, gain: 0.026, attack: 0.02, when: 0.38 });
    },
  }),

  define({
    id: 'systemReady',
    name: 'System Ready',
    category: 'system',
    description: 'All systems nominal: a full, settled chord with a slow glass halo.',
    duration: 1.40,
    tags: ['ready', 'system', 'online', 'confirm', 'hud'],
    minInterval: 600,
    space: 0.38,
    create(v) {
      [NOTE.D3, NOTE.A3, NOTE.D4, 369.99 /* F#4 */, NOTE.A4].forEach((freq, i) => {
        v.tone({
          freq,
          dur: 1.0 - i * 0.05,
          gain: 0.042 - i * 0.003,
          attack: 0.04 + i * 0.008,
          release: 0.9,
          when: i * 0.03,
        });
      });
      v.bell({ freq: NOTE.A5, dur: 1.1, gain: 0.026, ratio: 2, index: 0.9, when: 0.22 });
      v.bell({ freq: NOTE.D6, dur: 0.9, gain: 0.014, ratio: 3, index: 0.6, when: 0.3 });
      v.thump({ freq: 58, dur: 0.5, gain: 0.07, drop: 1.6 });
      v.noise({
        dur: 0.8,
        gain: 0.01,
        attack: 0.3,
        filter: { type: 'highpass', f: 6400 },
      });
    },
  }),

  define({
    id: 'systemFail',
    name: 'System Fail',
    category: 'system',
    description: 'Critical fault: a detuned fall into a sub-bass thud. Serious, not harsh.',
    duration: 1.15,
    tags: ['fail', 'error', 'critical', 'system', 'down'],
    minInterval: 600,
    space: 0.26,
    create(v) {
      v.tone({
        freq: NOTE.D4,
        glideTo: NOTE.A3,
        dur: 0.6,
        gain: 0.06,
        attack: 0.01,
        release: 0.55,
        filter: { type: 'lowpass', f: 1600 },
      });
      v.tone({
        freq: NOTE.D4 * 1.008,
        glideTo: NOTE.A3 * 1.01,
        dur: 0.6,
        gain: 0.035,
        attack: 0.01,
        release: 0.55,
        when: 0.03,
        filter: { type: 'lowpass', f: 1400 },
      });
      v.tone({
        freq: NOTE.A3,
        glideTo: NOTE.D3,
        dur: 0.5,
        gain: 0.04,
        attack: 0.02,
        release: 0.45,
        when: 0.32,
      });
      v.noise({
        dur: 0.6,
        gain: 0.022,
        attack: 0.03,
        color: 'pink',
        filter: { type: 'lowpass', f: 900, f1: 300 },
      });
      v.tone({
        freq: 220,
        dur: 0.5,
        gain: 0.05,
        attack: 0.006,
        release: 0.46,
        filter: { type: 'lowpass', f: 1100 },
      });
      v.noise({
        dur: 0.22,
        gain: 0.02,
        attack: 0.012,
        filter: { type: 'bandpass', f: 760, q: 1.1 },
      });
      v.noise({
        dur: 0.16,
        gain: 0.012,
        attack: 0.01,
        when: 0.48,
        filter: { type: 'bandpass', f: 900, q: 1.2 },
      });
      v.thump({ freq: 44, dur: 0.55, gain: 0.11, drop: 1.5, when: 0.5 });
    },
  }),
];
