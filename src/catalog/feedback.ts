import { NOTE } from '../core/dsp';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Feedback / state confirmation.
 *
 * Confirmation chords are stacked as pure sines with staggered entries so they
 * bloom rather than beep. Errors stay low and rounded: a confident system
 * does not screech at its operator.
 */
export const feedbackSounds: SoundDef[] = [
  define({
    id: 'confirm',
    name: 'Confirm',
    category: 'feedback',
    description: 'A selection is accepted: glassy fifth with a warm pad beneath.',
    duration: 0.85,
    tags: ['confirm', 'accept', 'ok', 'glass'],
    variants: 2,
    minInterval: 90,
    space: 0.28,
    create(v) {
      v.bell({ freq: NOTE.A5, dur: 0.5, gain: 0.05, ratio: 2, index: 1.1 });
      v.bell({ freq: NOTE.E6, dur: 0.7, gain: 0.036, ratio: 3, index: 0.9, when: 0.07 });
      v.tone({ freq: NOTE.A3, dur: 0.34, gain: 0.04, attack: 0.01, release: 0.32 });
      v.tone({
        freq: NOTE.D4,
        dur: 0.38,
        gain: 0.02,
        attack: 0.012,
        release: 0.35,
        when: 0.03,
      });
      v.tone({
        freq: NOTE.E4,
        dur: 0.45,
        gain: 0.024,
        attack: 0.02,
        release: 0.42,
        when: 0.05,
      });
      v.noise({
        dur: 0.4,
        gain: 0.009,
        attack: 0.18,
        when: 0.05,
        filter: { type: 'highpass', f: 5500 },
      });
    },
  }),

  define({
    id: 'complete',
    name: 'Complete',
    category: 'feedback',
    description: 'Task finished: a four-note major bloom resolving onto a low bed.',
    duration: 1.45,
    tags: ['complete', 'success', 'done', 'finish', 'achievement'],
    minInterval: 180,
    space: 0.34,
    create(v) {
      const notes = [NOTE.D5, 739.99 /* F#5 */, NOTE.A5, NOTE.D6];
      notes.forEach((freq, i) => {
        v.tone({
          freq,
          dur: 0.5 + i * 0.12,
          gain: 0.042,
          attack: 0.01,
          release: 0.5 + i * 0.1,
          when: i * 0.085,
        });
      });
      v.tone({
        freq: NOTE.D3,
        dur: 1.1,
        gain: 0.045,
        attack: 0.16,
        release: 0.9,
        when: 0.22,
      });
      v.tone({
        freq: NOTE.A3,
        dur: 1.0,
        gain: 0.026,
        attack: 0.2,
        release: 0.8,
        when: 0.3,
      });
      v.bell({ freq: NOTE.A5, dur: 1.05, gain: 0.026, ratio: 2, index: 0.8, when: 0.3 });
      v.noise({
        dur: 0.7,
        gain: 0.013,
        attack: 0.25,
        when: 0.25,
        color: 'pink',
        filter: { type: 'highpass', f: 5200 },
      });
    },
  }),

  define({
    id: 'success',
    name: 'Success',
    category: 'feedback',
    description: 'Quick positive acknowledgement — shorter and lighter than Complete.',
    duration: 1.00,
    tags: ['success', 'positive', 'quick', 'confirm'],
    minInterval: 120,
    space: 0.28,
    create(v) {
      v.tone({ freq: NOTE.D5, dur: 0.32, gain: 0.038, attack: 0.008, when: 0 });
      v.tone({ freq: NOTE.D4, dur: 0.3, gain: 0.022, attack: 0.01, when: 0.01 });
      v.tone({ freq: NOTE.D3, dur: 0.34, gain: 0.024, attack: 0.02, when: 0.02 });
      v.tone({ freq: NOTE.A5, dur: 0.5, gain: 0.034, attack: 0.012, when: 0.08 });
      v.bell({ freq: NOTE.D6, dur: 0.7, gain: 0.024, ratio: 2, index: 0.9, when: 0.16 });
      v.noise({
        dur: 0.35,
        gain: 0.01,
        attack: 0.1,
        when: 0.14,
        filter: { type: 'highpass', f: 6200 },
      });
    },
  }),

  define({
    id: 'error',
    name: 'Error',
    category: 'feedback',
    description: 'Failure state. Low, rounded double pulse — firm, never shrill.',
    duration: 0.55,
    tags: ['error', 'failure', 'negative', 'low'],
    minInterval: 150,
    space: 0.18,
    create(v) {
      v.tone({
        freq: 138.59, // C#3
        glideTo: 130.81,
        dur: 0.24,
        gain: 0.11,
        attack: 0.006,
        release: 0.22,
        filter: { type: 'lowpass', f: 900, q: 0.8 },
      });
      v.tone({
        freq: 146.83, // D3, a semitone above — creates slow beating
        dur: 0.22,
        gain: 0.05,
        attack: 0.008,
        release: 0.2,
        filter: { type: 'lowpass', f: 760 },
      });
      v.tone({
        freq: 130.81,
        dur: 0.26,
        gain: 0.07,
        attack: 0.006,
        release: 0.24,
        when: 0.17,
        filter: { type: 'lowpass', f: 700 },
      });
      // A mid knock keeps the error legible on phone and laptop speakers.
      v.tone({
        freq: 330,
        dur: 0.24,
        gain: 0.044,
        attack: 0.004,
        release: 0.22,
        filter: { type: 'lowpass', f: 1500 },
      });
      v.thump({ freq: 62, dur: 0.3, gain: 0.1, drop: 1.8 });
      v.noise({
        dur: 0.16,
        gain: 0.012,
        attack: 0.02,
        color: 'pink',
        filter: { type: 'lowpass', f: 420 },
      });
    },
  }),

  define({
    id: 'deny',
    name: 'Deny',
    category: 'feedback',
    description: 'Action refused, softer than an error: a muted mechanical head-shake.',
    duration: 0.40,
    tags: ['deny', 'blocked', 'negative', 'soft'],
    minInterval: 120,
    space: 0.14,
    create(v) {
      v.tone({
        freq: 196,
        glideTo: 165,
        dur: 0.16,
        gain: 0.055,
        attack: 0.006,
        release: 0.15,
        filter: { type: 'lowpass', f: 1200 },
      });
      v.tone({
        freq: 185,
        dur: 0.14,
        gain: 0.03,
        attack: 0.008,
        release: 0.13,
        when: 0.13,
        filter: { type: 'lowpass', f: 1000 },
      });
      v.tone({
        freq: 430,
        dur: 0.14,
        gain: 0.018,
        attack: 0.004,
        release: 0.13,
        filter: { type: 'lowpass', f: 1400 },
      });
      v.thump({ freq: 85, dur: 0.18, gain: 0.045, drop: 1.7 });
      v.transient({ gain: 0.015, freq: 1800 });
    },
  }),

  define({
    id: 'warning',
    name: 'Warning',
    category: 'feedback',
    description: 'Attention needed: two soft alternating beeps, evenly weighted.',
    duration: 0.50,
    tags: ['warning', 'attention', 'alert', 'soft'],
    minInterval: 220,
    space: 0.2,
    create(v) {
      const beep = (freq: number, when: number, gain: number) => {
        v.tone({
          freq,
          dur: 0.16,
          gain,
          attack: 0.012,
          hold: 0.04,
          release: 0.12,
          when,
          filter: { type: 'lowpass', f: 2400 },
        });
      };
      beep(NOTE.A4, 0, 0.055);
      beep(NOTE.F4, 0.24, 0.05);
    },
  }),

  define({
    id: 'alert',
    name: 'Alert',
    category: 'feedback',
    description: 'Escalating three-pulse alert with a rising tonal centre.',
    duration: 0.85,
    tags: ['alert', 'urgent', 'attention', 'pulse'],
    minInterval: 400,
    space: 0.22,
    create(v) {
      [NOTE.E4, NOTE.A4, NOTE.E5].forEach((freq, i) => {
        v.tone({
          freq,
          dur: 0.2,
          gain: 0.045 - i * 0.004,
          attack: 0.01,
          release: 0.17,
          when: i * 0.18,
        });
      });
      v.thump({ freq: 70, dur: 0.4, gain: 0.05, drop: 1.7, when: 0.36 });
    },
  }),

  define({
    id: 'notify',
    name: 'Notify',
    category: 'feedback',
    description: 'Incoming information: a single bright bell with a glass tail.',
    duration: 1.00,
    tags: ['notification', 'message', 'bell', 'incoming'],
    minInterval: 160,
    space: 0.34,
    create(v) {
      v.bell({ freq: NOTE.A5, dur: 0.9, gain: 0.055, ratio: 2.01, index: 1.2 });
      v.bell({ freq: NOTE.E6, dur: 0.7, gain: 0.024, ratio: 3, index: 0.8, when: 0.02 });
      v.tone({ freq: NOTE.A4, dur: 0.4, gain: 0.014, attack: 0.01, release: 0.36 });
      v.noise({
        dur: 0.5,
        gain: 0.008,
        attack: 0.12,
        filter: { type: 'highpass', f: 6800 },
      });
    },
  }),

  define({
    id: 'info',
    name: 'Info',
    category: 'feedback',
    description: 'A soft upward pop for tooltips, hints and contextual help.',
    duration: 0.35,
    tags: ['info', 'hint', 'tooltip', 'pop'],
    variants: 2,
    minInterval: 70,
    space: 0.16,
    create(v) {
      v.tone({
        freq: 680,
        glideTo: 1080,
        dur: 0.11,
        gain: 0.035,
        attack: 0.004,
        release: 0.1,
      });
      v.bell({ freq: 1620, dur: 0.18, gain: 0.012, ratio: 2, index: 0.5, when: 0.03 });
      v.transient({ gain: 0.012, freq: 4200 });
    },
  }),
];
