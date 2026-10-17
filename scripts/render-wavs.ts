/**
 * Renders catalog sounds to WAV files for auditioning or inspection.
 *
 *   npx vite-node scripts/render-wavs.ts out                  # everything
 *   npx vite-node scripts/render-wavs.ts /tmp/audio powerOn click
 *
 * Output is deliberately outside src/ and ignored by git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-ignore - pure-JS Web Audio implementation used for offline rendering.
import { OfflineAudioContext as NodeOfflineContext } from 'web-audio-engine';
import { SOUNDS } from '../src/catalog';
import { encodeWav, renderSound } from '../src/core/render';

const args = process.argv.slice(2);
const outDir = resolve(args[0] ?? 'out');
const filter = args.slice(1).map((s) => s.toLowerCase());

mkdirSync(outDir, { recursive: true });

async function main() {
  const factory = (channels: number, length: number, sampleRate: number) =>
    new NodeOfflineContext(channels, length, sampleRate) as unknown as BaseAudioContext;
  const selected = SOUNDS.filter(
    (s) =>
      filter.length === 0 ||
      filter.some((f) => s.id.toLowerCase().includes(f) || s.category === f),
  );

  for (const def of selected) {
    const { buffer } = await renderSound(def, {
      sampleRate: 44100,
      contextFactory: factory,
      seed: 0xc0ffee,
    });
    const wav = encodeWav(buffer);
    const file = join(outDir, `${def.id}.wav`);
    writeFileSync(file, Buffer.from(wav));
    console.log(`${file}  (${(buffer.duration).toFixed(2)}s)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
