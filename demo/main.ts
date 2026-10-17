import { FrontierAudio, SOUND_CATEGORIES, SOUNDS, searchSounds } from '../src/index';
import type { SoundCategory, SoundMeta } from '../src/types';
import { computePeaks, drawPeaks, fitCanvas } from './waveform';
import type { PeakData } from './waveform';

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

const engine = new FrontierAudio({ volume: 0.72, maxVoices: 20 });
const byId = new Map(SOUNDS.map((sound) => [sound.id, sound]));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 * Elements
 * ------------------------------------------------------------------ */

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

const grid = $('#grid');
const filters = $('#filters');
const searchInput = $<HTMLInputElement>('#search');
const emptyState = $('#empty');
const statusPill = $('#status-pill');
const statusText = $('#status-text');
const muteBtn = $<HTMLButtonElement>('#btn-mute');
const volume = $<HTMLInputElement>('#volume');
const volumeOut = $<HTMLOutputElement>('#volume-out');
const space = $<HTMLInputElement>('#space');
const spaceOut = $<HTMLOutputElement>('#space-out');
const notice = $('#audio-notice');
const nowPlaying = $('#now-playing');
const detail = $<HTMLDialogElement>('#detail');
const detailWave = $<HTMLCanvasElement>('#detail-wave');
const detailRate = $<HTMLInputElement>('#detail-rate');
const detailRateOut = $<HTMLOutputElement>('#detail-rate-out');

/* ------------------------------------------------------------------ *
 * Online/offline waveform rendering (lazy + throttled)
 * ------------------------------------------------------------------ */

const peakCache = new Map<string, PeakData>();
const renderQueue: Array<() => void> = [];
let rendering = 0;
const MAX_PARALLEL_RENDERS = 2;

function enqueueRender(task: () => void): void {
  renderQueue.push(task);
  pumpRenderQueue();
}

function pumpRenderQueue(): void {
  while (rendering < MAX_PARALLEL_RENDERS && renderQueue.length) {
    const task = renderQueue.shift()!;
    rendering++;
    Promise.resolve()
      .then(task)
      .catch(() => undefined)
      .finally(() => {
        rendering--;
        pumpRenderQueue();
      });
  }
}

async function getPeaks(id: string, buckets = 200): Promise<PeakData | null> {
  const cached = peakCache.get(id);
  if (cached) return cached;
  const rendered = await engine.render(id, { sampleRate: 32000, duration: (byId.get(id)?.duration ?? 1.5) + 0.35 });
  if (!rendered) return null;
  const peaks = computePeaks(rendered.buffer, buckets);
  peakCache.set(id, peaks);
  return peaks;
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

interface CardState {
  id: string;
  def: SoundMeta;
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  playButton: HTMLButtonElement;
  peaks: PeakData | null;
  progress?: number;
  raf?: number;
  triggered: boolean;
}

const cards = new Map<string, CardState>();
const cardObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = cards.get((entry.target as HTMLElement).dataset.id ?? '');
      if (!card || card.triggered) continue;
      card.triggered = true;
      cardObserver.unobserve(card.element);
      enqueueRender(async () => {
        const peaks = await getPeaks(card.id);
        if (!peaks) return;
        card.peaks = peaks;
        redrawCard(card);
      });
    }
  },
  { rootMargin: '240px' },
);

const playIcon = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 1.4v9.2c0 .5.55.8.97.54l7.2-4.6a.64.64 0 0 0 0-1.08L3.17.86a.64.64 0 0 0-.97.54z"/></svg>`;

function createCard(def: SoundMeta): CardState {
  const element = document.createElement('article');
  element.className = 'card';
  element.dataset.id = def.id;
  element.tabIndex = 0;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `${def.name} sound. ${def.description} Press Enter to play.`);

  element.innerHTML = `
    <div class="card-top">
      <span class="card-cat">${def.category}</span>
      <span class="card-dur">${def.duration.toFixed(2)}s</span>
    </div>
    <h3>${def.name}</h3>
    <p>${def.description}</p>
    <canvas class="card-wave" aria-hidden="true"></canvas>
    <div class="card-foot">
      <button class="card-play" type="button">${playIcon}<span>PLAY</span></button>
      <div class="card-meta">
        <span class="tag">${def.tags[0] ?? def.category}</span>
        <button class="card-more" type="button" aria-label="Details for ${def.name}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
  `;

  const canvas = element.querySelector('canvas') as HTMLCanvasElement;
  const playButton = element.querySelector('.card-play') as HTMLButtonElement;
  const moreButton = element.querySelector('.card-more') as HTMLButtonElement;
  const state: CardState = { id: def.id, def, element, canvas, playButton, peaks: null, triggered: false };
  cards.set(def.id, state);

  const trigger = (event: Event) => {
    event.stopPropagation();
    element.focus({ preventScroll: true });
    playSound(def.id);
  };

  playButton.addEventListener('click', trigger);
  moreButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openDetail(def.id);
  });
  element.addEventListener('click', () => playSound(def.id));
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      playSound(def.id);
    }
  });

  cardObserver.observe(element);
  return state;
}

function redrawCard(card: CardState): void {
  const rect = card.canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const ctx = fitCanvas(card.canvas, rect.width, 46);
  if (!ctx) return;
  if (card.peaks) {
    drawPeaks(ctx, card.peaks, rect.width, 46, { progress: card.progress, dimOpacity: 0.75 });
  } else {
    drawPlaceholder(ctx, rect.width, 46);
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(126, 190, 255, 0.08)';
  const mid = height / 2;
  for (let x = 0; x < width; x += 4) {
    const h = 1 + Math.sin(x * 0.08) * 1.2;
    ctx.fillRect(x, mid - h, 2, h * 2);
  }
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

let stopAnimation = () => undefined;

function playSound(id: string, options: { rate?: number; volume?: number } = {}): void {
  const def = byId.get(id);
  if (!def) return;
  const handle = engine.play(id, { rate: options.rate, volume: options.volume });
  if (!handle) return;

  stopAnimation();
  void unlockAudio();

  const card = cards.get(id);
  if (card) {
    setPlaying(card);
    animateCard(card, handle.duration);
  }

  nowPlaying.textContent = def.name.toUpperCase();
  setStatus('active', def.name.toUpperCase());
  window.setTimeout(() => {
    if (nowPlaying.textContent === def.name.toUpperCase()) {
      nowPlaying.textContent = 'STANDBY';
      setStatus(engine.state === 'running' ? 'ready' : 'idle');
    }
  }, Math.max(600, handle.duration * 1000));
}

function setPlaying(card: CardState): void {
  for (const other of cards.values()) {
    if (other !== card) other.element.classList.remove('playing');
  }
  card.element.classList.add('playing');
}

function animateCard(card: CardState, duration: number): void {
  if (card.raf) cancelAnimationFrame(card.raf);
  const start = performance.now();
  const total = Math.max(200, duration * 1000);
  const tick = (now: number) => {
    card.progress = Math.min(1, (now - start) / total);
    redrawCard(card);
    if (card.progress < 1) {
      card.raf = requestAnimationFrame(tick);
    } else {
      card.raf = undefined;
      card.element.classList.remove('playing');
      window.setTimeout(() => {
        card.progress = undefined;
        redrawCard(card);
      }, 180);
    }
  };
  card.raf = requestAnimationFrame(tick);
  stopAnimation = () => {
    if (card.raf) cancelAnimationFrame(card.raf);
    card.raf = undefined;
    card.progress = undefined;
    card.element.classList.remove('playing');
    redrawCard(card);
  };
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

let activeCategory: SoundCategory | 'all' = 'all';
let query = '';
let visible: CardState[] = [];

function buildFilters(): void {
  const all = document.createElement('button');
  all.className = 'chip';
  all.type = 'button';
  all.setAttribute('aria-pressed', 'true');
  all.innerHTML = `All<span class="count">${SOUNDS.length}</span>`;
  all.addEventListener('click', () => {
    activeCategory = 'all';
    updateFilters();
  });
  filters.appendChild(all);

  for (const category of SOUND_CATEGORIES) {
    const button = document.createElement('button');
    button.className = 'chip';
    button.type = 'button';
    button.dataset.category = category.id;
    button.setAttribute('aria-pressed', 'false');
    button.title = category.description;
    button.innerHTML = `${category.name}<span class="count">${SOUNDS.filter((s) => s.category === category.id).length}</span>`;
    button.addEventListener('click', () => {
      activeCategory = category.id;
      updateFilters();
    });
    filters.appendChild(button);
  }
}

function updateFilters(): void {
  for (const chip of Array.from(filters.querySelectorAll<HTMLButtonElement>('.chip'))) {
    const selected =
      activeCategory === 'all'
        ? !('category' in chip.dataset)
        : chip.dataset.category === activeCategory;
    chip.setAttribute('aria-pressed', String(selected));
  }
  applyFilter();
}

function applyFilter(): void {
  const results = new Set(
    (query ? searchSounds(query) : SOUNDS.map((sound) => sound)).map((sound) => sound.id),
  );
  visible = [];
  for (const [id, card] of cards) {
    const show = results.has(id) && (activeCategory === 'all' || card.def.category === activeCategory);
    card.element.hidden = !show;
    if (show) {
      visible.push(card);
      if (!card.peaks && !card.triggered) {
        card.triggered = true;
        enqueueRender(async () => {
          const peaks = await getPeaks(id);
          if (peaks) {
            card.peaks = peaks;
            redrawCard(card);
          }
        });
      } else if (card.peaks) {
        redrawCard(card);
      }
    }
  }
  emptyState.hidden = visible.length > 0;
  grid.dataset.count = String(visible.length);
}

/* ------------------------------------------------------------------ *
 * Detail dialog
 * ------------------------------------------------------------------ */

let detailId = 'powerOn';

function openDetail(id: string): void {
  const def = byId.get(id);
  if (!def) return;
  detailId = id;
  $('#detail-cat').textContent = def.category.toUpperCase();
  $('#detail-name').textContent = def.name;
  $('#detail-desc').textContent = def.description;
  $('#detail-id').textContent = def.id;
  $('#detail-duration').textContent = `${def.duration.toFixed(2)} s`;
  $('#detail-variants').textContent = `${def.variants ?? 1} micro-variations`;
  const tags = $('#detail-tags');
  tags.innerHTML = '';
  for (const tag of def.tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tags.appendChild(span);
  }
  detailRate.value = '100';
  detailRateOut.textContent = '1.00×';
  if (typeof detail.showModal === 'function') detail.showModal();
  else detail.setAttribute('open', '');
  requestAnimationFrame(() => void drawDetailWave(def.id));
  $('#detail-play').focus({ preventScroll: true });
}

async function drawDetailWave(id: string): Promise<void> {
  const def = byId.get(id);
  if (!def) return;
  const width = Math.max(280, detailWave.getBoundingClientRect().width);
  const ctx = fitCanvas(detailWave, width, 160);
  if (!ctx) return;
  drawPlaceholder(ctx, width, 160);
  const peaks = await getPeaks(id, 420);
  if (!peaks) return;
  drawPeaks(ctx, peaks, width, 160, { dimOpacity: 0.95 });
}

detailRate.addEventListener('input', () => {
  detailRateOut.textContent = `${(Number(detailRate.value) / 100).toFixed(2)}×`;
});

$('#detail-play').addEventListener('click', () => {
  playSound(detailId, { rate: Number(detailRate.value) / 100 });
});

$('#detail-download').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('#detail-download');
  const label = button.textContent;
  button.textContent = 'Rendering…';
  button.disabled = true;
  try {
    const blob = await engine.exportWav(detailId, { sampleRate: 44100 });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${detailId}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    button.textContent = label;
    button.disabled = false;
  }
});

$('#detail-close').addEventListener('click', () => detail.close());
detail.addEventListener('click', (event) => {
  if (event.target === detail) detail.close();
});
detail.addEventListener('close', () => {
  const card = cards.get(detailId);
  card?.element.focus({ preventScroll: true });
});

/* ------------------------------------------------------------------ *
 * Reactor visualizer
 * ------------------------------------------------------------------ */

function startVisualizer(): void {
  const canvas = $<HTMLCanvasElement>('#visualizer');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = 420;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let analyser: AnalyserNode | null = null;
  let bins = new Uint8Array(64);
  const bars = 72;
  let smoothed = new Float32Array(bars);
  let last = 0;
  const fps = reducedMotion ? 12 : 50;

  const render = (time: number) => {
    requestAnimationFrame(render);
    if (time - last < 1000 / fps) return;
    last = time;

    if (!analyser && engine.state === 'running') {
      analyser = engine.analyser;
      if (analyser) bins = new Uint8Array(analyser.frequencyBinCount);
    }
    if (analyser) analyser.getByteFrequencyData(bins);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.29;
    const idle = 0.5 + Math.sin(time / 1400) * 0.5;

    ctx.clearRect(0, 0, size, size);

    // Outer tick ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((time / 60000) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.22)';
    for (let i = 0; i < 90; i++) {
      const angle = (i / 90) * Math.PI * 2;
      const long = i % 10 === 0;
      const inner = radius + 34;
      const outer = inner + (long ? 10 : 4);
      ctx.globalAlpha = long ? 0.7 : 0.28;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Energy bars
    let energy = 0;
    for (let i = 0; i < bars; i++) {
      // Log-ish frequency mapping, mirrored around the circle.
      const binIndex = Math.floor((i / bars) ** 1.7 * (bins.length * 0.55));
      const raw = (bins[binIndex] ?? 0) / 255;
      energy += raw;
      const target = Math.max(raw, 0.05 + idle * 0.03);
      smoothed[i] += (target - smoothed[i]) * (raw > smoothed[i] ? 0.5 : 0.13);
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const length = 12 + smoothed[i] * 92;
      const x1 = cx + Math.cos(angle) * (radius + 8);
      const y1 = cy + Math.sin(angle) * (radius + 8);
      const x2 = cx + Math.cos(angle) * (radius + 8 + length);
      const y2 = cy + Math.sin(angle) * (radius + 8 + length);
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, 'rgba(111, 211, 255, 0.85)');
      gradient.addColorStop(1, 'rgba(111, 211, 255, 0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    energy /= bars;

    // Core
    const pulse = 0.35 + energy * 1.5 + idle * 0.06;
    const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.9);
    coreGlow.addColorStop(0, `rgba(180, 235, 255, ${0.45 + energy * 0.4})`);
    coreGlow.addColorStop(0.35, `rgba(111, 211, 255, ${0.16 + energy * 0.3})`);
    coreGlow.addColorStop(1, 'rgba(111, 211, 255, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(111, 211, 255, ${0.35 + energy * 0.5})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.42 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#d9f4ff';
    ctx.shadowColor = '#6fd3ff';
    ctx.shadowBlur = 24 + energy * 40;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Orbit arc
    ctx.strokeStyle = 'rgba(255, 180, 92, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 62, time / 3000, time / 3000 + 0.6);
    ctx.stroke();
  };
  requestAnimationFrame(render);
}

/* ------------------------------------------------------------------ *
 * Status + controls
 * ------------------------------------------------------------------ */

let statusTimer: number | undefined;

function setStatus(state: 'idle' | 'ready' | 'active' | 'muted', text?: string): void {
  statusPill.dataset.state = state;
  const labels: Record<string, string> = {
    idle: 'STANDBY',
    ready: 'SYSTEMS ONLINE',
    active: 'TRANSMITTING',
    muted: 'MUTED',
  };
  statusText.textContent = text ?? labels[state];
  if (statusTimer) window.clearTimeout(statusTimer);
  if (state !== 'active') return;
  statusTimer = window.setTimeout(() => {
    if (engine.muted) setStatus('muted');
    else setStatus(engine.state === 'running' ? 'ready' : 'idle');
  }, 2600);
}

async function unlockAudio(): Promise<void> {
  const running = await engine.unlock();
  if (running) {
    notice.classList.add('gone');
    window.setTimeout(() => notice.setAttribute('hidden', ''), 420);
    if (!engine.muted) setStatus('ready');
  }
}

async function bootSequence(): Promise<void> {
  await unlockAudio();
  engine.stopAll();
  setStatus('active', 'BOOT SEQUENCE');
  nowPlaying.textContent = 'REACTOR SPIN-UP';
  engine.sequence(
    [
      { id: 'powerOn', gap: 1.15 },
      { id: 'pulse', gap: 0.85 },
      { id: 'scan', gap: 0.9 },
      { id: 'systemReady', gap: 1.3 },
    ],
    { volume: 0.9 },
  );
  window.setTimeout(() => {
    nowPlaying.textContent = 'STANDBY';
    if (engine.muted) setStatus('muted');
    else setStatus('ready');
  }, 5200);
}

function randomSound(): void {
  const pool = visible.length
    ? visible
    : Array.from(cards.values());
  const card = pool[Math.floor(Math.random() * pool.length)];
  if (!card) return;
  playSound(card.id);
  card.element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}

function toggleMute(): void {
  if (engine.muted) {
    engine.unmute();
    muteBtn.setAttribute('aria-pressed', 'false');
    volume.value = String(Math.round(engine.volume * 100));
    volumeOut.value = volume.value;
    setStatus(engine.state === 'running' ? 'ready' : 'idle');
  } else {
    engine.mute();
    muteBtn.setAttribute('aria-pressed', 'true');
    setStatus('muted');
  }
  engine.play(engine.muted ? 'toggleOff' : 'toggleOn', { volume: 0.6 });
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function init(): void {
  // Build every card once so waveforms stay cached while filtering.
  for (const def of SOUNDS) grid.appendChild(createCard(def).element);
  buildFilters();
  applyFilter();
  startVisualizer();

  $('#stat-count').textContent = String(SOUNDS.length);

  volume.addEventListener('input', () => {
    const value = Number(volume.value);
    volumeOut.value = String(value);
    engine.setVolume(value / 100);
    if (value > 0 && engine.muted) {
      engine.unmute();
      muteBtn.setAttribute('aria-pressed', 'false');
    }
    if (value === 0) setStatus('muted');
  });

  space.addEventListener('input', () => {
    spaceOut.value = space.value;
    engine.setSpace(Number(space.value) / 100);
  });

  muteBtn.addEventListener('click', toggleMute);
  $('#btn-boot').addEventListener('click', bootSequence);
  $('#btn-random').addEventListener('click', randomSound);
  $('#btn-stop').addEventListener('click', () => {
    engine.stopAll();
    stopAnimation();
    setStatus(engine.state === 'running' ? 'ready' : 'idle');
    nowPlaying.textContent = 'STANDBY';
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    applyFilter();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      query = '';
      applyFilter();
      searchInput.blur();
    }
  });

  document.addEventListener('pointerdown', () => void unlockAudio(), { once: true });
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      searchInput.focus();
      return;
    }
    if (typing) return;

    const key = event.key.toLowerCase();
    if (key === 'm') {
      toggleMute();
      return;
    }
    if (key === 'b') {
      void bootSequence();
      return;
    }
    if (key === 'r') {
      randomSound();
      return;
    }
    if (event.key === ' ') {
      const focused = document.activeElement as HTMLElement | null;
      if (focused && (focused.tagName === 'BUTTON' || focused.tagName === 'A')) return;
      const cardId = focused?.closest('.card')?.getAttribute('data-id');
      event.preventDefault();
      if (cardId) playSound(cardId);
      else if (visible[0]) playSound(visible[0].id);
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      const card = visible[Number(event.key) - 1];
      if (card) playSound(card.id);
    }
  });

  window.addEventListener('resize', debounce(() => {
    for (const card of visible) redrawCard(card);
    if (detail.open) void drawDetailWave(detailId);
  }, 140));

  // Keep the status pill honest as the context state changes.
  window.setInterval(() => {
    if (engine.muted) {
      setStatus('muted');
      return;
    }
    if (engine.state === 'running') {
      if (statusPill.dataset.state === 'idle') setStatus('ready');
    } else if (engine.state === 'suspended') {
      if (statusPill.dataset.state === 'ready') setStatus('idle');
    }
  }, 1200);

  // Deep links: #sound=powerOn opens the detail view.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const deep = hash.get('sound');
  if (deep && byId.has(deep)) openDetail(deep);

  // Expose the engine for console tinkering.
  (window as unknown as Record<string, unknown>).frontierAudio = engine;
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer = 0;
  return ((...args: never[]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

init();
