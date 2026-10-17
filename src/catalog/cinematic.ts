import { NOTE } from '../core/dsp';
import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Cinematic transitions.
 *
 * These are the big brush strokes for route changes, launches and hero
 * moments. They are built from shaped noise and sub-bass only — no distorted
 * synth stabs — so they sit under UI clicks without masking them.
 */
export const cinematicSounds: SoundDef[] = [
  define({
    id: 'whoosh',
    name: 'Whoosh',
    category: 'cinematic',
    description: 'Large transition sweep with a wide, moving stereo image.',
    duration: 1.00,
    tags: ['whoosh', 'transition', 'air', 'movement'],
    variants: 2,
    minInterval: 250,
    space: 0.38,
    create(v) {
      const dir = v.rng() < 0.5 ? 1 : -1;
      v.noise({
        dur: 0.85,
        gain: 0.085,
        attack: 0.28,
        color: 'pink',
        pan: -0.45 * dir,
        filter: [
          { type: 'highpass', f: 180, f1: 700 },
          { type: 'bandpass', f: 500, f1: 3200, q: 0.55, sweepTime: 0.5 },
          { type: 'lowpass', f: 9000, f1: 2500, sweepTime: 0.8 },
        ],
      });
      v.noise({
        dur: 0.55,
        gain: 0.032,
        attack: 0.12,
        when: 0.24,
        pan: 0.45 * dir,
        filter: { type: 'bandpass', f: 2400, f1: 800, q: 0.8, sweepTime: 0.5 },
      });
      v.tone({
        freq: 90,
        glideTo: 160,
        dur: 0.75,
        gain: 0.032,
        attack: 0.25,
        release: 0.5,
        glideTime: 0.6,
      });
      v.noise({
        dur: 0.6,
        gain: 0.014,
        attack: 0.25,
        when: 0.12,
        filter: { type: 'highpass', f: 6000, f1: 9000 },
      });
      v.thump({ freq: 60, dur: 0.35, gain: 0.05, drop: 1.6, when: 0.55 });
    },
  }),

  define({
    id: 'impact',
    name: 'Impact',
    category: 'cinematic',
    description: 'Soft cinematic impact: sub drop, low air and a long metallic ring.',
    duration: 1.15,
    tags: ['impact', 'hit', 'boom', 'weight'],
    variants: 2,
    minInterval: 500,
    space: 0.36,
    create(v) {
      v.tone({
        freq: 118,
        glideTo: 37,
        dur: 0.85,
        gain: 0.17,
        attack: 0.004,
        release: 0.82,
        glideTime: 0.55,
      });
      v.noise({
        dur: 0.5,
        gain: 0.06,
        attack: 0.002,
        color: 'pink',
        filter: { type: 'lowpass', f: 1400, f1: 180, q: 0.9, sweepTime: 0.4 },
      });
      v.bell({ freq: 72, dur: 1.1, gain: 0.028, ratio: 2.76, index: 1.2 });
      v.bell({ freq: NOTE.D5, dur: 0.6, gain: 0.01, ratio: 3.5, index: 0.5, when: 0.01 });
      v.noise({
        dur: 0.9,
        gain: 0.012,
        attack: 0.15,
        when: 0.08,
        filter: { type: 'highpass', f: 5800 },
      });
      v.thump({ freq: 48, dur: 0.5, gain: 0.12, drop: 1.4 });
    },
  }),

  define({
    id: 'riser',
    name: 'Riser',
    category: 'cinematic',
    description: 'Two-second tension lift with accelerating sub pulses and opening air.',
    duration: 3.05,
    tags: ['riser', 'build', 'tension', 'launch'],
    minInterval: 900,
    space: 0.34,
    create(v) {
      v.noise({
        dur: 2.1,
        gain: 0.06,
        attack: 1.5,
        color: 'pink',
        filter: [
          { type: 'highpass', f: 160, f1: 600 },
          { type: 'bandpass', f: 400, f1: 6200, q: 0.6, sweepTime: 2 },
        ],
      });
      v.tone({
        freq: 68,
        glideTo: 340,
        dur: 2.2,
        gain: 0.09,
        attack: 1.2,
        release: 0.9,
        glideTime: 2.05,
      });
      // Accelerating pulses: 0.5s spacing tightening to 0.16s.
      let t = 0.2;
      let gap = 0.42;
      for (let i = 0; i < 7; i++) {
        v.thump({ freq: 55, dur: 0.22, gain: 0.03 + i * 0.008, drop: 1.6, when: t });
        t += gap;
        gap *= 0.82;
      }
      v.bell({ freq: NOTE.A5, dur: 0.9, gain: 0.018, ratio: 2, index: 0.7, when: 2.05 });
      v.noise({
        dur: 0.5,
        gain: 0.028,
        attack: 0.3,
        when: 1.9,
        filter: { type: 'highpass', f: 5200, f1: 9000 },
      });
    },
  }),

  define({
    id: 'transition',
    name: 'Transition',
    category: 'cinematic',
    description: 'Riser into landing — a compact scene change in 1.5 seconds.',
    duration: 1.85,
    tags: ['transition', 'riser', 'impact', 'scene'],
    minInterval: 700,
    space: 0.36,
    create(v) {
      v.noise({
        dur: 0.9,
        gain: 0.05,
        attack: 0.6,
        color: 'pink',
        filter: { type: 'bandpass', f: 600, f1: 5200, q: 0.7, sweepTime: 0.85 },
      });
      v.tone({
        freq: 100,
        glideTo: 320,
        dur: 0.9,
        gain: 0.06,
        attack: 0.4,
        release: 0.5,
        glideTime: 0.8,
      });
      // Landing
      v.tone({
        freq: 110,
        glideTo: 40,
        dur: 0.7,
        gain: 0.12,
        attack: 0.003,
        release: 0.68,
        glideTime: 0.45,
        when: 0.82,
      });
      v.thump({ freq: 50, dur: 0.5, gain: 0.1, drop: 1.5, when: 0.82 });
      v.noise({
        dur: 0.7,
        gain: 0.018,
        attack: 0.06,
        when: 0.82,
        filter: { type: 'highpass', f: 4200, f1: 1800 },
      });
      v.bell({ freq: NOTE.D5, dur: 0.9, gain: 0.014, ratio: 2, index: 0.7, when: 0.88 });
    },
  }),

  define({
    id: 'shimmer',
    name: 'Shimmer',
    category: 'cinematic',
    description: 'Glass highlight — a wide, airy sparkle for hero moments and reveals.',
    duration: 1.40,
    tags: ['shimmer', 'sparkle', 'glass', 'highlight'],
    variants: 2,
    minInterval: 400,
    space: 0.45,
    create(v) {
      const ratios = [1, 1.5, 2.0, 2.52, 3.0];
      ratios.forEach((ratio, i) => {
        v.bell({
          freq: NOTE.D5 * ratio,
          dur: 0.8 + i * 0.1,
          gain: 0.02 - i * 0.002,
          ratio: 2.01 + i * 0.1,
          index: 0.7,
          when: i * 0.045,
          pan: -0.3 + i * 0.15,
        });
      });
      v.noise({
        dur: 0.9,
        gain: 0.016,
        attack: 0.2,
        filter: { type: 'highpass', f: 6500, f1: 9500 },
        pan: rand(v.rng, -0.2, 0.2),
      });
    },
  }),
];
