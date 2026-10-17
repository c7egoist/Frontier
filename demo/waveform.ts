import { encodeWavBlob } from '../src/core/render';

export interface PeakData {
  min: Float32Array;
  max: Float32Array;
  length: number;
}

/** Reduces a buffer to per-pixel min/max peaks for fast drawing. */
export function computePeaks(buffer: AudioBuffer, buckets: number): PeakData {
  const channels = Math.min(2, buffer.numberOfChannels);
  const data: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) data.push(buffer.getChannelData(ch));
  const bucketSize = Math.max(1, Math.floor(buffer.length / buckets));
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);

  let globalPeak = 0;
  for (const channel of data) {
    for (let i = 0; i < channel.length; i += 64) {
      globalPeak = Math.max(globalPeak, Math.abs(channel[i]));
    }
  }
  const norm = globalPeak > 0 ? 0.92 / globalPeak : 0;

  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(buffer.length, start + bucketSize);
    let lo = 0;
    let hi = 0;
    for (const channel of data) {
      for (let i = start; i < end; i += 2) {
        const v = channel[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo * norm;
    max[b] = hi * norm;
  }
  return { min, max, length: buffer.duration };
}

export interface DrawOptions {
  accent?: string;
  dimOpacity?: number;
  progress?: number;
  glow?: boolean;
  fill?: boolean;
}

/** Draws a mirrored waveform with an optional playhead / progress wash. */
export function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: PeakData,
  width: number,
  height: number,
  options: DrawOptions = {},
): void {
  const {
    accent = '#6fd3ff',
    dimOpacity = 0.85,
    progress,
    glow = true,
    fill = true,
  } = options;

  ctx.clearRect(0, 0, width, height);

  // Hairline centre axis.
  ctx.strokeStyle = 'rgba(126, 190, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2 + 0.5);
  ctx.lineTo(width, height / 2 + 0.5);
  ctx.stroke();

  const mid = height / 2;
  const amp = height * 0.42;
  const buckets = peaks.max.length;
  const step = width / buckets;

  const paint = (from: number, to: number, alpha: number, bright: boolean) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = bright ? accent : 'rgba(140, 190, 225, 0.9)';
    if (!fill) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
    }
    for (let i = from; i < to; i++) {
      const x = i * step;
      const top = mid - Math.max(peaks.max[i], 0.004) * amp;
      const bottom = mid - Math.min(peaks.min[i], -0.004) * amp;
      if (fill) {
        ctx.fillRect(x, top, Math.max(0.8, step * 0.72), bottom - top);
      } else {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  const playedBuckets =
    progress === undefined ? 0 : Math.max(0, Math.min(buckets, Math.round(progress * buckets)));

  if (glow) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
  }
  paint(0, playedBuckets || buckets, dimOpacity * (progress === undefined ? 1 : 0.42), false);
  ctx.shadowBlur = 0;

  if (progress !== undefined && playedBuckets > 0) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    paint(0, playedBuckets, 1, true);
    ctx.shadowBlur = 0;

    // Playhead
    const x = playedBuckets * step;
    const gradient = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
    gradient.addColorStop(0, 'rgba(111, 211, 255, 0)');
    gradient.addColorStop(0.5, 'rgba(111, 211, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(111, 211, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 12, 0, 24, height);
  }
}

/** Renders a buffer to a WAV download. */
export function downloadBuffer(buffer: AudioBuffer, filename: string): void {
  const blob = encodeWavBlob(buffer);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Sets up a canvas for crisp rendering on HiDPI displays. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
