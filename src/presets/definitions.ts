/**
 * Frontier UI Audio — Preset Definitions
 * 40+ procedurally generated sounds, Iron Man / Stark HUD inspired.
 * Categories: navigation, state, feedback, motion, system, tactile
 *
 * Design principles:
 * - No square waves, no raw saw, no 8-bit arps
 * - All tones use sine/triangle/sine-tri blend with filtering
 * - Envelopes are exponential, not linear (premium feel)
 * - Every sound has: transient (filtered noise) + body (tonal) + tail (reverb)
 * - Pitch variations are small (0.7x–2x), not alien 5-octave sweeps
 * - FM index kept low (<15) for glass, not dissonance
 */

import type { SoundDefinition } from '../types.js';
import {
  glassTick,
  confirmBlip,
  denyBlip,
  whoosh,
  scanPulse,
  powerOn,
  powerOff
} from '../synthesis/Primitives.js';

function jitter(base: number, amt = 0.025) {
  return base * (1 + (Math.random() * 2 - 1) * amt);
}

export const SOUNDS: Record<string, SoundDefinition> = {
  // ── NAVIGATION ──────────────────────────────────────────────
  hover: {
    description: 'Ultra-light hover tick — tactile but not clicky',
    category: 'navigation',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const f = 1600 * opts.pitch;
      engine.playTone(
        {
          freq: jitter(f, 0.03),
          waveform: 'sine',
          attack: 0.001,
          decay: 0.055,
          gain: 0.18 * opts.volume * opts.velocity,
          filterType: 'highpass',
          filterFreq: 1200
        },
        t
      );
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 6200,
          bandQ: 1.6,
          attack: 0.0005,
          decay: 0.018,
          gain: 0.06 * opts.volume
        },
        t
      );
    }
  },

  hoverSoft: {
    description: 'Even softer hover for dense UIs',
    category: 'navigation',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 2100 * opts.pitch,
          waveform: 'sine',
          attack: 0.002,
          decay: 0.04,
          gain: 0.12 * opts.volume * opts.velocity,
          filterFreq: 8000
        },
        t
      );
    }
  },

  focus: {
    description: 'Focus ring — gentle glass ping',
    category: 'navigation',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playFMTone(
        {
          carrierFreq: 1400 * opts.pitch,
          modFreq: 2800 * opts.pitch,
          modIndex: 2.2,
          modIndexEnd: 0.1,
          attack: 0.003,
          decay: 0.16,
          gain: 0.32 * opts.volume,
          filterFreq: 5500
        },
        t
      );
    }
  },

  select: {
    description: 'Selection — slightly weightier than hover',
    category: 'navigation',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      glassTick(engine, 1100 * opts.pitch, 0.38 * opts.volume, { at: t });
      engine.playTone(
        {
          freq: 2200 * opts.pitch,
          waveform: 'sine',
          attack: 0.001,
          decay: 0.09,
          gain: 0.18 * opts.volume,
          filterFreq: 7000
        },
        t + 0.015
      );
    }
  },

  click: {
    description: 'Primary click — Stark HUD standard',
    category: 'tactile',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 950 * opts.pitch;

      // Transient
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 5800,
          bandQ: 1.4,
          attack: 0.0003,
          decay: 0.022,
          gain: 0.22 * opts.volume
        },
        t
      );

      // Body — descending blip for tactile drop
      engine.playTone(
        {
          freq: base * 1.35,
          freqEnd: base * 0.85,
          glideTime: 0.09,
          waveform: 'sine-tri',
          attack: 0.001,
          decay: 0.11,
          gain: 0.52 * opts.volume * opts.velocity,
          filterFreq: 6500
        },
        t
      );

      // Sub weight
      engine.playTone(
        {
          freq: base * 0.18,
          waveform: 'sine',
          attack: 0.001,
          decay: 0.14,
          gain: 0.14 * opts.volume,
          filterFreq: 350
        },
        t
      );
    }
  },

  clickSoft: {
    description: 'Soft click for secondary actions',
    category: 'tactile',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      glassTick(engine, 1300 * opts.pitch, 0.28 * opts.volume, { at: t });
    }
  },

  tap: {
    description: 'Mobile tap — round, quick',
    category: 'tactile',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 1100 * opts.pitch,
          freqEnd: 700 * opts.pitch,
          glideTime: 0.07,
          waveform: 'sine-tri',
          attack: 0.001,
          decay: 0.08,
          gain: 0.42 * opts.volume,
          filterFreq: 5000
        },
        t
      );
    }
  },

  // ── STATE ───────────────────────────────────────────────────
  toggleOn: {
    description: 'Toggle ON — rising, affirmative',
    category: 'state',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 700 * opts.pitch;
      engine.playTone(
        {
          freq: base,
          freqEnd: base * 1.6,
          glideTime: 0.12,
          waveform: 'sine-tri',
          attack: 0.005,
          decay: 0.16,
          gain: 0.48 * opts.volume,
          filterFreq: 6000
        },
        t
      );
      engine.playTone(
        {
          freq: base * 2.02,
          waveform: 'sine',
          attack: 0.003,
          decay: 0.18,
          gain: 0.32 * opts.volume,
          filterFreq: 8000
        },
        t + 0.07
      );
    }
  },

  toggleOff: {
    description: 'Toggle OFF — descending, soft',
    category: 'state',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 900 * opts.pitch;
      engine.playTone(
        {
          freq: base,
          freqEnd: base * 0.62,
          glideTime: 0.14,
          waveform: 'sine-tri',
          attack: 0.004,
          decay: 0.18,
          gain: 0.42 * opts.volume,
          filterFreq: 4000
        },
        t
      );
    }
  },

  activate: {
    description: 'Activate / Enable — energetic rise',
    category: 'state',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      confirmBlip(engine, 650 * opts.pitch, 0.55 * opts.volume, t);
    }
  },

  deactivate: {
    description: 'Deactivate / Disable — gentle fall',
    category: 'state',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 800 * opts.pitch,
          freqEnd: 380 * opts.pitch,
          glideTime: 0.18,
          waveform: 'triangle',
          attack: 0.005,
          decay: 0.24,
          gain: 0.4 * opts.volume,
          filterFreq: 3500
        },
        t
      );
    }
  },

  // ── MOTION ──────────────────────────────────────────────────
  open: {
    description: 'Panel open — whoosh in + glass tick',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.28, 0.32 * opts.volume, 'out', t);
      glassTick(engine, 1400 * opts.pitch, 0.3 * opts.volume, { at: t + 0.14 });
    }
  },

  close: {
    description: 'Panel close — whoosh out + soft tick',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.24, 0.28 * opts.volume, 'in', t);
      glassTick(engine, 900 * opts.pitch, 0.26 * opts.volume, { at: t + 0.08 });
    }
  },

  expand: {
    description: 'Expand — rising air',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 500 * opts.pitch,
          freqEnd: 1400 * opts.pitch,
          glideTime: 0.22,
          waveform: 'sine-tri',
          attack: 0.02,
          decay: 0.26,
          gain: 0.38 * opts.volume,
          filterFreq: 5500
        },
        t
      );
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 4200,
          bandQ: 0.9,
          attack: 0.015,
          decay: 0.2,
          gain: 0.12 * opts.volume
        },
        t
      );
    }
  },

  collapse: {
    description: 'Collapse — falling air',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 1200 * opts.pitch,
          freqEnd: 400 * opts.pitch,
          glideTime: 0.2,
          waveform: 'sine-tri',
          attack: 0.01,
          decay: 0.24,
          gain: 0.36 * opts.volume,
          filterFreq: 4000
        },
        t
      );
    }
  },

  slideIn: {
    description: 'Slide in — short whoosh',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.22, 0.3 * opts.volume, 'out', t);
    }
  },

  slideOut: {
    description: 'Slide out',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.2, 0.28 * opts.volume, 'in', t);
    }
  },

  swipe: {
    description: 'Swipe gesture — tactile flick',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 3800,
          bandQ: 0.8,
          attack: 0.002,
          decay: 0.09,
          gain: 0.2 * opts.volume
        },
        t
      );
      engine.playTone(
        {
          freq: 900 * opts.pitch,
          freqEnd: 1400 * opts.pitch,
          glideTime: 0.07,
          waveform: 'sine',
          attack: 0.002,
          decay: 0.08,
          gain: 0.22 * opts.volume
        },
        t + 0.01
      );
    }
  },

  whooshShort: {
    description: 'Short cinematic whoosh',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.25, 0.4 * opts.volume, 'out', t);
    }
  },

  whooshLong: {
    description: 'Long cinematic whoosh',
    category: 'motion',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      whoosh(engine, 0.65, 0.42 * opts.volume, 'out', t);
    }
  },

  // ── FEEDBACK ────────────────────────────────────────────────
  success: {
    description: 'Success — major triad, glassy',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 600 * opts.pitch;
      const vol = 0.55 * opts.volume;

      // Arpeggiated major: root, major third, fifth, octave
      engine.playTone(
        { freq: base, waveform: 'sine-tri', attack: 0.008, decay: 0.22, gain: vol * 0.5, filterFreq: 6000 },
        t
      );
      engine.playTone(
        { freq: base * 1.25, waveform: 'sine', attack: 0.005, decay: 0.28, gain: vol * 0.6, filterFreq: 6500 },
        t + 0.08
      );
      engine.playTone(
        { freq: base * 1.5, waveform: 'sine', attack: 0.004, decay: 0.32, gain: vol * 0.65, filterFreq: 7000 },
        t + 0.16
      );
      engine.playFMTone(
        {
          carrierFreq: base * 2,
          modFreq: base * 4,
          modIndex: 1.5,
          modIndexEnd: 0.05,
          attack: 0.003,
          decay: 0.45,
          gain: vol * 0.5
        },
        t + 0.18
      );
    }
  },

  successSoft: {
    description: 'Soft success — single glassy fifth',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 880 * opts.pitch,
          freqEnd: 1320 * opts.pitch,
          glideTime: 0.15,
          waveform: 'sine',
          attack: 0.008,
          decay: 0.28,
          gain: 0.42 * opts.volume,
          filterFreq: 6000
        },
        t
      );
    }
  },

  error: {
    description: 'Error — firm but not harsh',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      denyBlip(engine, 520 * opts.pitch, 0.55 * opts.volume, t);
      // second hit for emphasis
      engine.playTone(
        {
          freq: 480 * opts.pitch,
          freqEnd: 320 * opts.pitch,
          glideTime: 0.18,
          waveform: 'triangle',
          attack: 0.004,
          decay: 0.26,
          gain: 0.35 * opts.volume,
          filterFreq: 2800
        },
        t + 0.18
      );
    }
  },

  errorSoft: {
    description: 'Soft error — single descending tone',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 650 * opts.pitch,
          freqEnd: 380 * opts.pitch,
          glideTime: 0.22,
          waveform: 'sine-tri',
          attack: 0.006,
          decay: 0.32,
          gain: 0.38 * opts.volume,
          filterFreq: 3500
        },
        t
      );
    }
  },

  warning: {
    description: 'Warning — two-pulse attention',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const f = 900 * opts.pitch;
      engine.playTone(
        { freq: f, waveform: 'sine-tri', attack: 0.005, decay: 0.14, gain: 0.45 * opts.volume, filterFreq: 5000 },
        t
      );
      engine.playTone(
        { freq: f, waveform: 'sine-tri', attack: 0.005, decay: 0.22, gain: 0.42 * opts.volume, filterFreq: 5000 },
        t + 0.16
      );
    }
  },

  info: {
    description: 'Info — neutral glass ping',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playFMTone(
        {
          carrierFreq: 1200 * opts.pitch,
          modFreq: 2400 * opts.pitch,
          modIndex: 1.2,
          attack: 0.004,
          decay: 0.24,
          gain: 0.38 * opts.volume,
          filterFreq: 6000
        },
        t
      );
    }
  },

  confirm: {
    description: 'Confirm — crisp affirmative',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      confirmBlip(engine, 750 * opts.pitch, 0.52 * opts.volume, t);
    }
  },

  deny: {
    description: 'Deny — soft negative',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      denyBlip(engine, 600 * opts.pitch, 0.48 * opts.volume, t);
    }
  },

  notification: {
    description: 'Notification — gentle chime',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 1000 * opts.pitch;
      engine.playFMTone(
        {
          carrierFreq: base,
          modFreq: base * 2.01,
          modIndex: 3,
          modIndexEnd: 0.1,
          attack: 0.008,
          decay: 0.55,
          gain: 0.42 * opts.volume
        },
        t
      );
      engine.playTone(
        {
          freq: base * 1.5,
          waveform: 'sine',
          attack: 0.01,
          decay: 0.6,
          gain: 0.22 * opts.volume,
          filterFreq: 7000
        },
        t + 0.06
      );
    }
  },

  alert: {
    description: 'Alert — urgent but sleek',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const f = 1100 * opts.pitch;
      for (let i = 0; i < 3; i++) {
        engine.playTone(
          {
            freq: f,
            waveform: 'sine-tri',
            attack: 0.003,
            decay: 0.12,
            gain: 0.4 * opts.volume,
            filterFreq: 6000
          },
          t + i * 0.13
        );
      }
    }
  },

  beacon: {
    description: 'Beacon — subtle pulse for markers',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 1600 * opts.pitch,
          waveform: 'sine',
          attack: 0.015,
          decay: 0.35,
          gain: 0.3 * opts.volume,
          filterFreq: 5000
        },
        t
      );
    }
  },

  // ── SYSTEM ──────────────────────────────────────────────────
  scan: {
    description: 'Scan — data sweeping',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      scanPulse(engine, 1100 * opts.pitch, 0.38 * opts.volume, t);
      scanPulse(engine, 1400 * opts.pitch, 0.32 * opts.volume, t + 0.09);
      scanPulse(engine, 1800 * opts.pitch, 0.28 * opts.volume, t + 0.18);
    }
  },

  processing: {
    description: 'Processing — rhythmic ticks',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      for (let i = 0; i < 4; i++) {
        engine.playTone(
          {
            freq: (900 + i * 120) * opts.pitch,
            waveform: 'sine',
            attack: 0.002,
            decay: 0.07,
            gain: 0.22 * opts.volume,
            filterFreq: 6000
          },
          t + i * 0.08
        );
      }
    }
  },

  typing: {
    description: 'Typing — micro ticks, varied',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 1800 * opts.pitch;
      glassTick(engine, jitter(base, 0.15), 0.22 * opts.volume, { at: t, bright: true });
    }
  },

  powerOn: {
    description: 'Power on — boot sequence',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      powerOn(engine, 0.6 * opts.volume, t);
    }
  },

  powerOff: {
    description: 'Power off — shutdown',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      powerOff(engine, 0.55 * opts.volume, t);
    }
  },

  lock: {
    description: 'Lock — secure clunk, sleek',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 500 * opts.pitch,
          freqEnd: 220 * opts.pitch,
          glideTime: 0.12,
          waveform: 'sine-tri',
          attack: 0.002,
          decay: 0.18,
          gain: 0.48 * opts.volume,
          filterFreq: 2500
        },
        t
      );
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 3200,
          bandQ: 1.2,
          attack: 0.001,
          decay: 0.05,
          gain: 0.18 * opts.volume
        },
        t + 0.02
      );
    }
  },

  unlock: {
    description: 'Unlock — bright release',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 400 * opts.pitch,
          freqEnd: 1100 * opts.pitch,
          glideTime: 0.14,
          waveform: 'sine-tri',
          attack: 0.003,
          decay: 0.2,
          gain: 0.46 * opts.volume,
          filterFreq: 5500
        },
        t
      );
      glassTick(engine, 1800 * opts.pitch, 0.3 * opts.volume, { at: t + 0.1, bright: true });
    }
  },

  deploy: {
    description: 'Deploy — cinematic launch',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      // Charge
      engine.playTone(
        {
          freq: 200 * opts.pitch,
          freqEnd: 800 * opts.pitch,
          glideTime: 0.35,
          waveform: 'sine-tri',
          attack: 0.05,
          decay: 0.4,
          gain: 0.4 * opts.volume,
          filterFreq: 4000
        },
        t
      );
      // Release
      engine.playTone(
        {
          freq: 1200 * opts.pitch,
          freqEnd: 2200 * opts.pitch,
          glideTime: 0.2,
          waveform: 'sine',
          attack: 0.005,
          decay: 0.35,
          gain: 0.5 * opts.volume,
          filterFreq: 8000
        },
        t + 0.32
      );
      whoosh(engine, 0.4, 0.35 * opts.volume, 'out', t + 0.3);
    }
  },

  complete: {
    description: 'Complete — success with shimmer',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      const base = 700 * opts.pitch;
      engine.playTone(
        { freq: base, waveform: 'sine-tri', attack: 0.01, decay: 0.3, gain: 0.45 * opts.volume, filterFreq: 6000 },
        t
      );
      engine.playTone(
        { freq: base * 1.5, waveform: 'sine', attack: 0.008, decay: 0.4, gain: 0.42 * opts.volume, filterFreq: 7000 },
        t + 0.1
      );
      engine.playFMTone(
        { carrierFreq: base * 2, modFreq: base * 4, modIndex: 1.8, attack: 0.005, decay: 0.6, gain: 0.35 * opts.volume },
        t + 0.12
      );
    }
  },

  charging: {
    description: 'Charging pulse — low energy hum',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 120 * opts.pitch,
          freqEnd: 180 * opts.pitch,
          glideTime: 0.4,
          waveform: 'sine',
          attack: 0.08,
          decay: 0.5,
          gain: 0.25 * opts.volume,
          filterFreq: 600
        },
        t
      );
      engine.playTone(
        {
          freq: 1200 * opts.pitch,
          waveform: 'sine',
          attack: 0.02,
          decay: 0.25,
          gain: 0.12 * opts.volume,
          filterFreq: 4000
        },
        t + 0.15
      );
    }
  },

  pulse: {
    description: 'Pulse — heartbeat of system',
    category: 'system',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 60 * opts.pitch,
          waveform: 'sine',
          attack: 0.01,
          decay: 0.25,
          gain: 0.35 * opts.volume,
          filterFreq: 300
        },
        t
      );
      engine.playTone(
        {
          freq: 1400 * opts.pitch,
          waveform: 'sine',
          attack: 0.005,
          decay: 0.12,
          gain: 0.18 * opts.volume,
          filterFreq: 5000
        },
        t + 0.04
      );
    }
  },

  // ── TACTILE / SPECIAL ───────────────────────────────────────
  glitchSoft: {
    description: 'Soft glitch — digital artifact, not alien',
    category: 'tactile',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      // Two quick micro slices
      for (let i = 0; i < 2; i++) {
        engine.playTone(
          {
            freq: (1200 + Math.random() * 600) * opts.pitch,
            waveform: 'sine',
            attack: 0.001,
            decay: 0.04,
            gain: 0.22 * opts.volume,
            filterFreq: 6000
          },
          t + i * 0.03
        );
      }
      engine.playNoise(
        {
          type: 'band',
          bandFreq: 4500,
          bandQ: 2.5,
          attack: 0.0005,
          decay: 0.02,
          gain: 0.12 * opts.volume
        },
        t + 0.015
      );
    }
  },

  pop: {
    description: 'Pop — rounded, friendly',
    category: 'tactile',
    render: (ctx, engine, opts) => {
      const t = ctx.currentTime + (opts.delay || 0);
      engine.playTone(
        {
          freq: 800 * opts.pitch,
          freqEnd: 300 * opts.pitch,
          glideTime: 0.1,
          waveform: 'sine-tri',
          attack: 0.001,
          decay: 0.12,
          gain: 0.48 * opts.volume,
          filterFreq: 5000
        },
        t
      );
    }
  }
};
