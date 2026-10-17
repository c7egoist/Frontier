import { NOTE } from '../core/dsp';
import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Navigation.
 *
 * Movement is expressed as filtered air plus a single smooth tonal centre.
 * No stepped arpeggios, no square waves — motion should feel like sliding
 * through a polished surface, not hopping between tiles.
 */
export const navigationSounds: SoundDef[] = [
  define({
    id: 'navigate',
    name: 'Navigate',
    category: 'navigation',
    description: 'Neutral focus move. Airy, directional and easy to repeat.',
    duration: 0.35,
    tags: ['focus', 'move', 'direction', 'air'],
    variants: 3,
    minInterval: 40,
    space: 0.15,
    create(v) {
      v.noise({
        dur: 0.14,
        gain: 0.026,
        attack: 0.012,
        pan: rand(v.rng, -0.2, 0.2),
        filter: [
          { type: 'highpass', f: 500 },
          { type: 'bandpass', f: 1500, f1: 3200, q: 0.75 },
        ],
      });
      v.tone({
        freq: NOTE.A4,
        glideTo: NOTE.E5,
        dur: 0.16,
        gain: 0.038,
        attack: 0.014,
        release: 0.14,
      });
      v.bell({ freq: NOTE.A5, dur: 0.2, gain: 0.012, ratio: 2, index: 0.5, when: 0.04 });
    },
  }),

  define({
    id: 'swipe',
    name: 'Swipe',
    category: 'navigation',
    description: 'Lateral gesture: a short breath of air travelling across the stereo field.',
    duration: 0.35,
    tags: ['gesture', 'swipe', 'touch', 'movement'],
    variants: 2,
    minInterval: 90,
    space: 0.18,
    create(v) {
      const right = rand(v.rng, 0.35, 0.55);
      v.noise({
        dur: 0.24,
        gain: 0.045,
        attack: 0.03,
        pan: -right,
        filter: { type: 'bandpass', f: 900, f1: 2600, q: 0.8, sweepTime: 0.2 },
      });
      v.noise({
        dur: 0.2,
        gain: 0.024,
        attack: 0.04,
        when: 0.05,
        pan: right,
        filter: { type: 'bandpass', f: 1400, f1: 3600, q: 0.9, sweepTime: 0.18 },
      });
      v.tone({
        freq: NOTE.E4,
        glideTo: NOTE.B4,
        dur: 0.18,
        gain: 0.018,
        attack: 0.03,
        release: 0.15,
      });
    },
  }),

  define({
    id: 'pageTurn',
    name: 'Page Turn',
    category: 'navigation',
    description: 'View transition with air movement and a soft landing.',
    duration: 0.65,
    tags: ['transition', 'page', 'view', 'whoosh'],
    variants: 2,
    minInterval: 120,
    space: 0.25,
    create(v) {
      const dir = v.rng() < 0.5 ? -1 : 1;
      v.noise({
        dur: 0.34,
        gain: 0.055,
        attack: 0.07,
        pan: -0.25 * dir,
        color: 'pink',
        filter: [
          { type: 'highpass', f: 300 },
          { type: 'bandpass', f: 700, f1: 2600, q: 0.6, sweepTime: 0.3 },
        ],
      });
      v.noise({
        dur: 0.2,
        gain: 0.03,
        attack: 0.02,
        when: 0.2,
        pan: 0.3 * dir,
        filter: { type: 'bandpass', f: 2600, f1: 1100, q: 0.9, sweepTime: 0.18 },
      });
      v.noise({
        dur: 0.2,
        gain: 0.018,
        attack: 0.02,
        when: 0.28,
        filter: { type: 'bandpass', f: 1500, f1: 2600, q: 1.1, sweepTime: 0.16 },
      });
      v.thump({ freq: 95, dur: 0.22, gain: 0.03, drop: 1.8, when: 0.3 });
    },
  }),

  define({
    id: 'menuOpen',
    name: 'Menu Open',
    category: 'navigation',
    description: 'Panel reveal: a rising, confident two-note bloom.',
    duration: 0.65,
    tags: ['menu', 'open', 'panel', 'reveal'],
    minInterval: 120,
    space: 0.22,
    create(v) {
      v.tone({
        freq: NOTE.D4,
        glideTo: NOTE.A4,
        dur: 0.3,
        gain: 0.045,
        attack: 0.03,
        release: 0.26,
      });
      v.tone({
        freq: NOTE.A4,
        glideTo: NOTE.E5,
        dur: 0.34,
        gain: 0.03,
        attack: 0.04,
        release: 0.3,
        when: 0.07,
      });
      v.noise({
        dur: 0.3,
        gain: 0.02,
        attack: 0.12,
        filter: { type: 'highpass', f: 4500, f1: 7500 },
      });
      v.bell({ freq: NOTE.D6, dur: 0.4, gain: 0.013, ratio: 2, index: 0.6, when: 0.12 });
    },
  }),

  define({
    id: 'menuClose',
    name: 'Menu Close',
    category: 'navigation',
    description: 'Panel conceal: the mirror image of Menu Open, settling inwards.',
    duration: 0.50,
    tags: ['menu', 'close', 'panel', 'reveal'],
    minInterval: 120,
    space: 0.2,
    create(v) {
      v.tone({
        freq: NOTE.E5,
        glideTo: NOTE.A4,
        dur: 0.3,
        gain: 0.04,
        attack: 0.02,
        release: 0.27,
      });
      v.tone({
        freq: NOTE.A4,
        glideTo: NOTE.D4,
        dur: 0.32,
        gain: 0.028,
        attack: 0.03,
        release: 0.28,
        when: 0.06,
      });
      v.noise({
        dur: 0.3,
        gain: 0.018,
        attack: 0.05,
        filter: { type: 'highpass', f: 6500, f1: 3000 },
      });
    },
  }),

  define({
    id: 'forward',
    name: 'Forward',
    category: 'navigation',
    description: 'Move deeper into the interface with a rising perfect fifth.',
    duration: 0.45,
    tags: ['forward', 'next', 'direction', 'fifth'],
    minInterval: 60,
    space: 0.17,
    create(v) {
      v.tone({
        freq: NOTE.A4,
        dur: 0.16,
        gain: 0.04,
        attack: 0.006,
        release: 0.15,
      });
      v.tone({
        freq: NOTE.E5,
        dur: 0.26,
        gain: 0.034,
        attack: 0.008,
        release: 0.24,
        when: 0.075,
      });
      v.noise({
        dur: 0.18,
        gain: 0.015,
        attack: 0.02,
        filter: { type: 'bandpass', f: 1800, f1: 3400, q: 1 },
      });
    },
  }),

  define({
    id: 'back',
    name: 'Back',
    category: 'navigation',
    description: 'Return to the previous layer with a falling perfect fifth.',
    duration: 0.45,
    tags: ['back', 'previous', 'return', 'direction'],
    minInterval: 60,
    space: 0.17,
    create(v) {
      v.tone({
        freq: NOTE.E5,
        dur: 0.15,
        gain: 0.036,
        attack: 0.005,
        release: 0.14,
      });
      v.tone({
        freq: NOTE.A4,
        dur: 0.24,
        gain: 0.038,
        attack: 0.008,
        release: 0.22,
        when: 0.07,
      });
      v.noise({
        dur: 0.16,
        gain: 0.013,
        attack: 0.02,
        filter: { type: 'bandpass', f: 2600, f1: 1200, q: 1 },
      });
    },
  }),
];
