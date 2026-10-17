/**
 * Renders the entire catalog offline and reports objective audio metrics.
 *
 *   npx vite-node scripts/measure.ts            # whole catalog
 *   npx vite-node scripts/measure.ts click      # one sound (id or substring)
 *
 * The goal is not to flatten the design — it is to make sure nothing clips,
 * nothing is inaudibly quiet, and every `level` trim in the catalog is based
 * on a measurement instead of a guess.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Pure-JS Web Audio implementation, used only for CI/measurement.
// @ts-ignore - the package ships its own (non-DOM) typings.
import { OfflineAudioContext as NodeOfflineContext } from 'web-audio-engine';
import { SOUNDS } from '../src/catalog';
import { renderSound } from '../src/core/render';
import { dbToGain } from '../src/core/dsp';

const SAMPLE_RATE = 44100;
const args = process.argv.slice(2);
const write = args.includes('--write');
const filter = args.find((a) => !a.startsWith('--'))?.toLowerCase();

/**
 * Designed peak level per sound (dBFS at master volume 1).
 * This is the mix: micro-interactions stay out of the way while power and
 * impact lead. Measurements are iterated against this table.
 */
const TARGET_PEAKS: Record<string, number> = {
  // core
  tick: -20, click: -13, tap: -14, press: -14, release: -18, hover: -28,
  toggleOn: -15, toggleOff: -16, keypress: -19, scroll: -27,
  // navigation
  navigate: -19, swipe: -21, pageTurn: -17, menuOpen: -14, menuClose: -14,
  forward: -15, back: -15,
  // feedback
  confirm: -12, complete: -9, success: -10, error: -11, deny: -17,
  warning: -14, alert: -12, notify: -12, info: -20,
  // system
  powerOn: -6, powerDown: -8, pulse: -10, charging: -9, chargeComplete: -8,
  unlock: -12, lock: -12, scan: -19, calibrate: -17, systemReady: -8,
  systemFail: -9,
  // cinematic
  whoosh: -11, impact: -7, riser: -8, transition: -8, shimmer: -18,
  // data
  progressTick: -28, sync: -19, refresh: -20, copy: -20, delete: -16,
  save: -15, send: -20, receive: -18, download: -20, upload: -20, message: -14,
  // status
  heartbeat: -12, sonar: -18, shieldUp: -13, shieldDown: -13,
  targetLock: -17, hudOpen: -18, hudClose: -19, standby: -25,
};

const FALLBACK_TARGET: Record<string, number> = {
  core: -18,
  navigation: -16,
  feedback: -12,
  system: -10,
  cinematic: -10,
  data: -19,
  status: -16,
};

/** RBJ high-shelf +4 dB @ 1681 Hz (BS.1770 stage 1 approximation). */
function highShelf(x: Float32Array, fs: number, f0 = 1681.97, gainDb = 4) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = (Math.sin(w0) / 2) * Math.SQRT2;
  const b0 = A * (A + 1 + (A - 1) * cos + 2 * Math.sqrt(A) * alpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cos);
  const b2 = A * (A + 1 + (A - 1) * cos - 2 * Math.sqrt(A) * alpha);
  const a0 = A + 1 - (A - 1) * cos + 2 * Math.sqrt(A) * alpha;
  const a1 = 2 * (A - 1 - (A + 1) * cos);
  const a2 = A + 1 - (A - 1) * cos - 2 * Math.sqrt(A) * alpha;
  // Two passes forward/backward to approximate a zero-phase shelf.
  return [
    biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0),
    biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0),
  ];
}

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function highPass(x: Float32Array, fs: number, f0 = 38, q = 0.5) {
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = (1 + cos) / 2, b1 = -(1 + cos), b2 = (1 + cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  return biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function loudnessOf(buffer: any): { lufs: number; peakDb: number; rmsDb: number } {
  const fs: number = buffer.sampleRate;
  const left = buffer.getChannelData(0) as Float32Array;
  const right = buffer.numberOfChannels > 1 ? (buffer.getChannelData(1) as Float32Array) : left;

  const weightedL = highPass(highShelf(left, fs)[0], fs);
  const weightedR = highPass(highShelf(right, fs)[0], fs);
  let sum = 0;
  for (let i = 0; i < weightedL.length; i++) {
    sum += weightedL[i] * weightedL[i] + weightedR[i] * weightedR[i];
  }
  const mean = sum / (weightedL.length * 2);
  const lufs = -0.691 + 10 * Math.log10(Math.max(mean, 1e-12));

  let peak = 0;
  let raw = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    raw += left[i] * left[i] + right[i] * right[i];
  }
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));
  const rmsDb = 10 * Math.log10(Math.max(raw / (left.length * 2), 1e-12));
  return { lufs, peakDb, rmsDb };
}

interface Row {
  id: string;
  category: string;
  duration: number;
  measured: number;
  peakDb: number;
  rmsDb: number;
  lufs: number;
  dc: number;
  level: number;
  suggested: number;
}

async function main() {
  const rows: Row[] = [];
  const factory = (channels: number, length: number, sampleRate: number) =>
    new NodeOfflineContext(channels, length, sampleRate) as unknown as BaseAudioContext;

  const selected = SOUNDS.filter(
    (s) => !filter || s.id.toLowerCase().includes(filter) || s.category.includes(filter),
  );

  for (const def of selected) {
    const started = Date.now();
    const { buffer, duration } = await renderSound(def, {
      sampleRate: SAMPLE_RATE,
      contextFactory: factory,
      seed: 0xc0ffee,
      humanize: false,
    } as any);
    const { lufs, peakDb, rmsDb } = loudnessOf(buffer);
    const ch = buffer.getChannelData(0) as Float32Array;
    let dc = 0;
    for (let i = 0; i < ch.length; i++) dc += ch[i];
    dc /= ch.length;
    const target = TARGET_PEAKS[def.id] ?? FALLBACK_TARGET[def.category] ?? -15;
    const needed = TARGET_PEAKS[def.id] !== undefined ? target - peakDb : Math.min(target - peakDb, 9);
    // Never push past 1.5 dB of headroom.
    const suggested = Math.min(needed, -1.5 - peakDb);
    rows.push({
      id: def.id,
      category: def.category,
      duration: def.duration,
      measured: Number(duration.toFixed(2)),
      peakDb: Number(peakDb.toFixed(1)),
      rmsDb: Number(rmsDb.toFixed(1)),
      lufs: Number(lufs.toFixed(1)),
      dc: Number(dc.toFixed(5)),
      level: def.level ?? 0,
      suggested: Number(suggested.toFixed(1)),
    });
    console.log(
      `${def.id.padEnd(16)} ${def.category.padEnd(12)} dur ${String(def.duration).padEnd(5)}` +
        ` meas ${duration.toFixed(2).padStart(4)}  peak ${peakDb.toFixed(1).padStart(5)} dB` +
        `  rms ${rmsDb.toFixed(1).padStart(5)} dB  K ${lufs.toFixed(1).padStart(5)} LUFS` +
        `  +${suggested.toFixed(1)} dB  (${Date.now() - started} ms)`,
    );
  }

  const out = resolve(process.cwd(), 'scripts/audio-report.json');
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\n${rows.length} sounds → ${out}`);

  if (write) {
    const levelsPath = resolve(process.cwd(), 'src/catalog/levels.ts');
    const source = readFileSync(levelsPath, 'utf8');
    const next = new Map<string, number>();
    for (const row of rows) {
      const current = row.level;
      const delta = (TARGET_PEAKS[row.id] ?? FALLBACK_TARGET[row.category] ?? -15) - row.peakDb;
      const value = Math.max(-24, Math.min(18, current + delta));
      next.set(row.id, Math.round(value * 10) / 10);
    }
    const generated = source.replace(
      /export const LEVEL_TRIMS: Readonly<Record<string, number>> = \{[\s\S]*?\n\};/,
      `export const LEVEL_TRIMS: Readonly<Record<string, number>> = {\n${SOUNDS.map(
        (s) => `  ${s.id}: ${next.get(s.id) ?? 0},`,
      ).join('\n')}\n};`,
    );
    writeFileSync(levelsPath, generated);
    console.log(`\nUpdated ${levelsPath} (${rows.length} trims). Re-run to converge.`);
  }

  const warnings = rows.filter(
    (r) => r.peakDb > -0.1 || Math.abs(r.dc) > 0.01 || r.measured > r.duration + 0.05,
  );
  if (warnings.length) {
    console.warn('\nNeeds attention:');
    for (const w of warnings) {
      console.warn(`  ${w.id}: peak ${w.peakDb} dB, DC ${w.dc}, measured ${w.measured}s vs declared ${w.duration}s`);
    }
    process.exitCode = 1;
  }
  // Verify the level table still matches the measurement target.
  const mismatched = rows.filter((r) => Math.abs(r.peakDb - (TARGET_PEAKS[r.id] ?? FALLBACK_TARGET[r.category] ?? -15)) > 1.5);
  if (mismatched.length) {
    console.log(`\n${mismatched.length} sounds are >1.5 dB off target (run with --write to converge).`);
    if (!write) process.exitCode = 1;
  } else {
    console.log('\nAll sounds within 1.5 dB of their designed peak level.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
