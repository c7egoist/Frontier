/**
 * Frontier Utils — helpers for custom procedural sound design
 */

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteToFreq(note: string): number {
  const map: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
  };
  const m = note.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!m) throw new Error(`Invalid note: ${note}`);
  const [, n, oct] = m;
  const midi = parseInt(oct) * 12 + 12 + (map[n] ?? 0);
  return midiToFreq(midi);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Generate a major triad frequencies
 */
export function majorTriad(rootFreq: number): [number, number, number] {
  return [rootFreq, rootFreq * 1.25, rootFreq * 1.5];
}

export function minorTriad(rootFreq: number): [number, number, number] {
  return [rootFreq, rootFreq * 1.189, rootFreq * 1.5];
}

/**
 * Randomize slightly for human feel
 */
export function humanizeFreq(freq: number, amount = 0.02): number {
  return freq * (1 + (Math.random() * 2 - 1) * amount);
}

/**
 * Easing for exponential pitch glides
 */
export function expRamp(start: number, end: number, t: number): number {
  // t 0..1
  return start * Math.pow(end / start, t);
}
