/**
 * Basic usage — Frontier UI Audio
 * Sleek procedural Iron Man HUD sounds
 */

import { frontierAudio } from '../src/index.js';

// Init after user gesture
document.addEventListener('click', async () => {
  await frontierAudio.init({ masterVolume: 0.85, reverbAmount: 0.22 });

  // Simple
  frontierAudio.play('click');
  frontierAudio.play('hover', { volume: 0.5 });

  // With options
  frontierAudio.play('success', { pitch: 1.1, volume: 0.9, pan: -0.2 });

  // Themed variant for dense UI (higher, quieter)
  const compactUI = frontierAudio.createVariant(1.15, 0.7);
  compactUI.play('tap');

  // Sequence
  frontierAudio.playSequence([
    { name: 'scan', at: 0 },
    { name: 'processing', at: 0.25 },
    { name: 'success', at: 0.6 }
  ]);

  // Auto-bind data attributes
  // <button data-ui-sound="click" data-ui-sound-hover="hover">Save</button>
  frontierAudio.bindAutoSounds();

  // Custom procedural sound — glassy confirm
  frontierAudio.define('myConfirm', {
    description: 'Custom confirm',
    category: 'feedback',
    render: (ctx, engine, opts) => {
      engine.playTone({
        freq: 900 * opts.pitch,
        freqEnd: 1400 * opts.pitch,
        glideTime: 0.12,
        waveform: 'sine-tri',
        attack: 0.005,
        decay: 0.18,
        gain: 0.5 * opts.volume,
        filterFreq: 6000
      });
      engine.playTone({
        freq: 1800 * opts.pitch,
        waveform: 'sine',
        attack: 0.003,
        decay: 0.22,
        gain: 0.3 * opts.volume,
        filterFreq: 8000
      }, ctx.currentTime + 0.08);
    }
  });

  frontierAudio.play('myConfirm');
}, { once: true });
