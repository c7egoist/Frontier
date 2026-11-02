import { computeFieldStats } from '../core/analysis.js';
import { MODE_INDEX, sampleField, scalarSample, terrainHeight } from '../core/fields.js';
import { SCALAR_CHANNELS, colorAt, colorCss, clamp01 } from '../core/palettes.js';

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 240));
  const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 80));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function drawSparkline(canvas, history, options = {}) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const pad = 6;
  const values = history.length ? history : [0];
  const max = Math.max(1.5, ...values) * 1.18;
  const min = 0;
  const x = (index) => pad + index / Math.max(1, values.length - 1) * (width - pad * 2);
  const y = (value) => height - pad - (value - min) / (max - min) * (height - pad * 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.075)';
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y(max / 1.18 * 0.72));
  ctx.lineTo(width - pad, y(max / 1.18 * 0.72));
  ctx.stroke();
  ctx.setLineDash([]);

  const gradient = ctx.createLinearGradient(0, pad, 0, height);
  gradient.addColorStop(0, 'rgba(174, 240, 142, 0.22)');
  gradient.addColorStop(1, 'rgba(174, 240, 142, 0)');
  ctx.beginPath();
  ctx.moveTo(x(0), height - pad);
  values.forEach((value, index) => ctx.lineTo(x(index), y(value)));
  ctx.lineTo(x(values.length - 1), height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  values.forEach((value, index) => (index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))));
  ctx.strokeStyle = options.accent || '#b7ed91';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  if (values.length > 1) {
    const last = values.at(-1);
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(last), 2.7, 0, Math.PI * 2);
    ctx.fillStyle = '#d9f7bb';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(last), 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(183, 237, 145, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawHistogram(canvas, stats) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const bins = stats?.histogram || new Array(24).fill(0);
  const max = Math.max(1, ...bins);
  const gap = 2;
  const barWidth = (width - gap * (bins.length - 1)) / bins.length;
  bins.forEach((value, index) => {
    const h = Math.max(1, value / max * (height - 12));
    const x = index * (barWidth + gap);
    const y = height - h;
    ctx.fillStyle = colorCss('magnitude', index / (bins.length - 1), 0.35 + 0.55 * value / max);
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(1, barWidth), h, Math.min(2, barWidth / 2));
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
}

export function filmstripChannels(mode) {
  if (mode === MODE_INDEX.terrain) return [0, 4, 5, 6, 3];
  if (mode === MODE_INDEX.custom) return [0, 1, 2, 3, 4];
  return [0, 1, 2, 3, 4];
}

export function drawFilmstripCanvas(canvas, channel, options) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const gridW = 52;
  const gridH = 32;
  const image = ctx.createImageData(gridW, gridH);
  const bounds = options.mode === MODE_INDEX.custom && options.dataset?.bounds
    ? options.dataset.bounds
    : { min: [-14, 0, -14], max: [14, 12, 14] };
  const sliceY = options.mode === MODE_INDEX.terrain
    ? null
    : bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.52;
  const palette = SCALAR_CHANNELS[channel]?.id || 'magnitude';
  const channelOptions = { ...options, scalarMode: channel };
  for (let j = 0; j < gridH; j += 1) {
    const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * j / (gridH - 1);
    for (let i = 0; i < gridW; i += 1) {
      const x = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * i / (gridW - 1);
      const y = sliceY ?? terrainHeight(x, z, options.amplitude) + 0.35;
      const p = [x, y, z];
      const raw = sampleField(p, options);
      const normalized = scalarSample(p, raw, channelOptions).normalized;
      const [r, g, b] = colorAt(palette, normalized);
      const index = (j * gridW + i) * 4;
      const vignette = 0.72 + 0.28 * (1 - Math.hypot(i / gridW - 0.5, j / gridH - 0.5));
      image.data[index] = Math.round(r * vignette);
      image.data[index + 1] = Math.round(g * vignette);
      image.data[index + 2] = Math.round(b * vignette);
      image.data[index + 3] = 255;
    }
  }
  const offscreen = document.createElement('canvas');
  offscreen.width = gridW;
  offscreen.height = gridH;
  offscreen.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, 0, 0, width, height);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(4, 8, 9, 0.05)');
  shade.addColorStop(1, 'rgba(4, 8, 9, 0.38)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

export function drawCoherenceBar(canvas, value) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const normalized = clamp01(value);
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.beginPath();
  ctx.roundRect(0, height / 2 - 3, width, 6, 3);
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#3ea6b8');
  gradient.addColorStop(0.6, '#8edc83');
  gradient.addColorStop(1, '#d9f29a');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(0, height / 2 - 3, width * normalized, 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(width * normalized, height / 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

export function refreshAllAnalytics(canvases, state, options, stats, history) {
  drawSparkline(canvases.sparkline, history);
  drawHistogram(canvases.histogram, stats);
  drawCoherenceBar(canvases.coherence, stats.coherence);
  for (const [index, canvas] of canvases.filmstrip.entries()) {
    const channel = filmstripChannels(options.mode)[index];
    drawFilmstripCanvas(canvas, channel, options);
  }
}

export function quickStats(options) {
  return computeFieldStats(options);
}
