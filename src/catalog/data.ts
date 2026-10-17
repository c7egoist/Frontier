import { NOTE } from '../core/dsp';
import { rand } from '../core/rng';
import { define } from './define';
import type { SoundDef } from '../core/defs';

/**
 * Data and workflow sounds.
 *
 * These are micro-sized by design: they run while the user is reading,
 * dragging or typing, so each one is short, band-limited and polite.
 */
export const dataSounds: SoundDef[] = [
  define({
    id: 'progressTick',
    name: 'Progress Tick',
    category: 'data',
    description: 'Fine-grained progress detent. Use sparingly while a value advances.',
    duration: 0.15,
    tags: ['progress', 'tick', 'loading', 'micro'],
    variants: 4,
    minInterval: 45,
    space: 0.08,
    create(v) {
      const f = rand(v.rng, 1600, 2200);
      v.transient({ gain: 0.014, freq: 4200 });
      v.tone({ freq: f, dur: 0.04, gain: 0.012, attack: 0.001, release: 0.035 });
    },
  }),

  define({
    id: 'sync',
    name: 'Sync',
    category: 'data',
    description: 'Two-part data handshake: soft low pulse, bright answer.',
    duration: 0.70,
    tags: ['sync', 'data', 'handshake', 'cloud'],
    minInterval: 220,
    space: 0.26,
    create(v) {
      v.thump({ freq: 92, dur: 0.2, gain: 0.05, drop: 1.8 });
      v.tone({ freq: NOTE.E5, dur: 0.3, gain: 0.03, attack: 0.006, release: 0.28, when: 0.12 });
      v.tone({ freq: NOTE.B5, dur: 0.4, gain: 0.02, attack: 0.008, release: 0.36, when: 0.2 });
      v.noise({
        dur: 0.25,
        gain: 0.01,
        attack: 0.06,
        filter: { type: 'highpass', f: 5500 },
      });
    },
  }),

  define({
    id: 'refresh',
    name: 'Refresh',
    category: 'data',
    description: 'Circular reload: a short orbit of air closing on a crisp detent.',
    duration: 0.80,
    tags: ['refresh', 'reload', 'orbit', 'update'],
    minInterval: 300,
    space: 0.24,
    create(v) {
      v.noise({
        dur: 0.42,
        gain: 0.034,
        attack: 0.08,
        pan: -0.25,
        filter: { type: 'bandpass', f: 800, f1: 3000, q: 0.8, sweepTime: 0.38 },
      });
      v.noise({
        dur: 0.3,
        gain: 0.02,
        attack: 0.06,
        when: 0.26,
        pan: 0.3,
        filter: { type: 'bandpass', f: 3000, f1: 1200, q: 0.8, sweepTime: 0.26 },
      });
      v.transient({ gain: 0.025, freq: 3200, when: 0.44 });
      v.tone({ freq: NOTE.A5, dur: 0.24, gain: 0.016, attack: 0.002, when: 0.44 });
    },
  }),

  define({
    id: 'copy',
    name: 'Copy',
    category: 'data',
    description: 'Content duplicated: two quick, identical soft detents.',
    duration: 0.30,
    tags: ['copy', 'duplicate', 'clipboard', 'confirm'],
    minInterval: 120,
    space: 0.16,
    create(v) {
      [0, 0.085].forEach((when, i) => {
        v.transient({ gain: 0.022 - i * 0.004, freq: 3000, when });
        v.tone({
          freq: 1400 - i * 120,
          dur: 0.06,
          gain: 0.016,
          attack: 0.002,
          release: 0.055,
          when,
        });
      });
    },
  }),

  define({
    id: 'delete',
    name: 'Delete',
    category: 'data',
    description: 'Removal: a muted low thud with a short downward tail. Final, not aggressive.',
    duration: 0.40,
    tags: ['delete', 'remove', 'destructive', 'low'],
    minInterval: 150,
    space: 0.15,
    create(v) {
      v.thump({ freq: 78, dur: 0.3, gain: 0.08, drop: 1.9 });
      v.tone({
        freq: 520,
        glideTo: 300,
        dur: 0.18,
        gain: 0.026,
        attack: 0.004,
        release: 0.16,
        filter: { type: 'lowpass', f: 1400 },
      });
      v.noise({
        dur: 0.16,
        gain: 0.014,
        attack: 0.004,
        color: 'pink',
        filter: { type: 'lowpass', f: 900, f1: 300 },
      });
    },
  }),

  define({
    id: 'save',
    name: 'Save',
    category: 'data',
    description: 'Committed to storage: a warm chord with a solid mechanical close.',
    duration: 0.70,
    tags: ['save', 'commit', 'write', 'confirm'],
    minInterval: 180,
    space: 0.24,
    create(v) {
      v.tone({ freq: NOTE.D4, dur: 0.4, gain: 0.034, attack: 0.008 });
      v.tone({ freq: NOTE.A4, dur: 0.5, gain: 0.03, attack: 0.01, when: 0.06 });
      v.bell({ freq: NOTE.D5, dur: 0.5, gain: 0.018, ratio: 2, index: 0.7, when: 0.1 });
      v.thump({ freq: 88, dur: 0.24, gain: 0.06, drop: 1.8, when: 0.02 });
      v.transient({ gain: 0.018, freq: 2600, when: 0.24 });
    },
  }),

  define({
    id: 'send',
    name: 'Send',
    category: 'data',
    description: 'Outgoing transfer: air leaves the field and ends on a bright ping.',
    duration: 0.90,
    tags: ['send', 'transmit', 'upload', 'message'],
    minInterval: 180,
    space: 0.28,
    create(v) {
      v.noise({
        dur: 0.4,
        gain: 0.036,
        attack: 0.1,
        pan: rand(v.rng, -0.1, 0.25),
        filter: { type: 'bandpass', f: 900, f1: 4200, q: 0.7, sweepTime: 0.36 },
      });
      v.tone({ freq: NOTE.E5, dur: 0.28, gain: 0.022, attack: 0.005, when: 0.3 });
      v.bell({ freq: NOTE.B5, dur: 0.4, gain: 0.02, ratio: 2, index: 0.8, when: 0.36 });
    },
  }),

  define({
    id: 'receive',
    name: 'Receive',
    category: 'data',
    description: 'Incoming transfer: a bell lands first, then air settles around it.',
    duration: 0.70,
    tags: ['receive', 'download', 'incoming', 'message'],
    minInterval: 160,
    space: 0.3,
    create(v) {
      v.bell({ freq: NOTE.A5, dur: 0.6, gain: 0.036, ratio: 2, index: 1 });
      v.tone({ freq: NOTE.A4, dur: 0.3, gain: 0.018, attack: 0.006 });
      v.noise({
        dur: 0.5,
        gain: 0.018,
        attack: 0.14,
        when: 0.06,
        filter: { type: 'bandpass', f: 4200, f1: 1400, q: 0.7, sweepTime: 0.45 },
      });
    },
  }),

  define({
    id: 'download',
    name: 'Download',
    category: 'data',
    description: 'Payload arriving: descending air with a soft landing detent.',
    duration: 0.90,
    tags: ['download', 'transfer', 'incoming', 'arrive'],
    minInterval: 200,
    space: 0.26,
    create(v) {
      v.noise({
        dur: 0.5,
        gain: 0.034,
        attack: 0.12,
        filter: { type: 'bandpass', f: 3600, f1: 900, q: 0.7, sweepTime: 0.45 },
      });
      v.tone({
        freq: 720,
        glideTo: 420,
        dur: 0.45,
        gain: 0.02,
        attack: 0.06,
        release: 0.38,
      });
      v.transient({ gain: 0.02, freq: 2400, when: 0.46 });
      v.tone({ freq: NOTE.D5, dur: 0.3, gain: 0.016, attack: 0.004, when: 0.46 });
    },
  }),

  define({
    id: 'upload',
    name: 'Upload',
    category: 'data',
    description: 'Payload departing: rising air that thins out into the distance.',
    duration: 0.90,
    tags: ['upload', 'transfer', 'outgoing', 'depart'],
    minInterval: 200,
    space: 0.26,
    create(v) {
      v.noise({
        dur: 0.55,
        gain: 0.032,
        attack: 0.1,
        filter: { type: 'bandpass', f: 900, f1: 3800, q: 0.7, sweepTime: 0.5 },
      });
      v.tone({
        freq: 420,
        glideTo: 760,
        dur: 0.45,
        gain: 0.02,
        attack: 0.06,
        release: 0.38,
      });
      v.bell({ freq: NOTE.A5, dur: 0.4, gain: 0.014, ratio: 2, index: 0.6, when: 0.4 });
    },
  }),

  define({
    id: 'message',
    name: 'Message',
    category: 'data',
    description: 'Chat message: two-note glass motif, friendly and short.',
    duration: 0.85,
    tags: ['message', 'chat', 'notification', 'incoming'],
    minInterval: 150,
    space: 0.3,
    create(v) {
      v.bell({ freq: NOTE.E5, dur: 0.5, gain: 0.042, ratio: 2, index: 1.0 });
      v.bell({ freq: NOTE.A5, dur: 0.65, gain: 0.034, ratio: 3, index: 0.8, when: 0.09 });
      v.tone({ freq: NOTE.A3, dur: 0.25, gain: 0.014, attack: 0.01 });
    },
  }),
];
