import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Aperture, BoxSelect, ChevronDown, ChevronRight, CircleHelp, CloudRain, Copy,
  Download, Droplets, Eye, EyeOff, FileDown, Focus, FolderOpen, Gauge,
  GripVertical, Layers3, Lock, Map, Maximize2, Mountain, Move3D, PanelLeft,
  Play, Plus, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles,
  Sun, Undo2, Waves, X, ZoomIn, ZoomOut, Route, Wind, Snowflake, ScanLine,
  Check, MoreHorizontal, ArrowDownToLine, Upload, Shuffle, Image as ImageIcon
} from 'lucide-react';
import './styles.css';

const Icon = ({ children, title, className = '', onClick, active = false, disabled = false }) => (
  <button className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick} title={title} disabled={disabled}>{children}</button>
);

const LAYER_TEMPLATES = {
  base: { title: 'Base shape', kind: 'Height', icon: Mountain, tint: '#d8aa77', generator: 'Ridged multifractal', mask: 'Mountain falloff', opacity: 100, enabled: true, height: 760, scale: 1.18, detail: 6, roughness: .58, seed: 428, warp: .34 },
  peaks: { title: 'Alpine ridges', kind: 'Height', icon: Mountain, tint: '#e0be91', generator: 'Ridged noise', mask: 'Altitude gate', opacity: 74, enabled: true, height: 470, scale: .58, detail: 7, roughness: .73, seed: 190, warp: .21 },
  glacier: { title: 'Glacial erosion', kind: 'Erosion', icon: Snowflake, tint: '#a6d7ec', erosion: 'Glacial', mask: 'Slope & altitude', opacity: 68, enabled: true, iterations: 42, strength: .63, talus: 31, rainfall: 36, sediment: .46, channel: .48, freeze: .72 },
  rivers: { title: 'River network', kind: 'Rivers', icon: Route, tint: '#75c2d8', generator: 'Flow accumulation', mask: 'Drainage basin', opacity: 83, enabled: true, source: 690, branching: .62, incision: .48, width: 14, meander: .32, moisture: .68 },
  sediment: { title: 'Alluvial sediment', kind: 'Sedimentation', icon: Layers3, tint: '#d9aa70', generator: 'Flow deposition', mask: 'Lowland collector', opacity: 76, enabled: true, amount: .68, grain: .44, terrace: .32, cohesion: .55, wetness: .61, spread: .38 },
  weathering: { title: 'Thermal weathering', kind: 'Erosion', icon: Wind, tint: '#d0a56f', erosion: 'Thermal', mask: 'Cliff faces', opacity: 52, enabled: true, iterations: 24, strength: .35, talus: 38, rainfall: 14, sediment: .36, channel: .21, freeze: .18 },
  surface: { title: 'Surface signals', kind: 'Satmap', icon: ImageIcon, tint: '#a4c684', generator: 'Terrain synthesis', mask: 'Slope / height / flow', opacity: 100, enabled: true, vegetation: .56, rock: .62, snow: .72, waterline: .18, contrast: 1.12, macro: .38 }
};

const INITIAL_LAYERS = [
  { id: 'surface', ...LAYER_TEMPLATES.surface },
  { id: 'sediment', ...LAYER_TEMPLATES.sediment },
  { id: 'rivers', ...LAYER_TEMPLATES.rivers },
  { id: 'glacier', ...LAYER_TEMPLATES.glacier },
  { id: 'peaks', ...LAYER_TEMPLATES.peaks },
  { id: 'base', ...LAYER_TEMPLATES.base }
];

const PRESETS = [
  { id: 'canyon', name: 'Sandstone canyons', blurb: 'Incised mesas, dry fans, warm strata', colors: ['#bf7248', '#e4ad6a', '#563327'], layers: ['base', 'rivers', 'sediment', 'surface'], values: { base: { generator: 'Multifractal', height: 480, scale: .72, roughness: .47, warp: .58, mask: 'Stratified basin' }, rivers: { incision: .82, width: 9, branching: .44, moisture: .21 }, sediment: { amount: .76, grain: .74, terrace: .66, wetness: .18 }, surface: { vegetation: .08, rock: .48, snow: .02, macro: .66 } } },
  { id: 'sandstone', name: 'Sandstone cliffs', blurb: 'Layered escarpments and talus aprons', colors: ['#d4a36d', '#84513a', '#f1cc90'], layers: ['base', 'weathering', 'sediment', 'surface'], values: { base: { generator: 'Ridged multifractal', height: 570, scale: .84, detail: 5, roughness: .38, mask: 'Cliff shelf' }, weathering: { erosion: 'Thermal', iterations: 42, strength: .65, talus: 44 }, sediment: { amount: .52, terrace: .71 }, surface: { vegetation: .13, rock: .71, snow: .02 } } },
  { id: 'coastal', name: 'Coastal cliffs', blurb: 'Sea-carved shelves and wind-cut headlands', colors: ['#789db1', '#d4c09a', '#304856'], layers: ['base', 'weathering', 'rivers', 'surface'], values: { base: { generator: 'Coastal shelf', height: 370, scale: 1.08, mask: 'Coastal falloff' }, weathering: { erosion: 'Coastal', iterations: 31, strength: .61, rainfall: 54 }, rivers: { moisture: .75, incision: .31 }, surface: { vegetation: .42, rock: .53, waterline: .32 } } },
  { id: 'himalayan', name: 'Himalayan range', blurb: 'High relief, glacial horns, snow-loaded ridges', colors: ['#e5edf2', '#7b8f9e', '#464d49'], layers: ['base', 'peaks', 'glacier', 'rivers', 'surface'], values: { base: { generator: 'Mountain noise', height: 980, scale: 1.32, detail: 8, roughness: .66, mask: 'Mountain falloff' }, peaks: { height: 760, scale: .44, roughness: .86 }, glacier: { iterations: 68, strength: .82, freeze: .91, rainfall: 51 }, rivers: { source: 820, incision: .68 }, surface: { vegetation: .31, rock: .74, snow: .68 } } },
  { id: 'iceland', name: 'Icelandic', blurb: 'Basalt plateaus, glacial outwash, wet black rock', colors: ['#829594', '#303b3d', '#bad8d8'], layers: ['base', 'glacier', 'rivers', 'sediment', 'surface'], values: { base: { generator: 'Volcanic multifractal', height: 620, scale: .94, roughness: .64, mask: 'Rift field' }, glacier: { iterations: 49, strength: .69, freeze: .74 }, rivers: { moisture: .84, width: 18 }, sediment: { amount: .48, wetness: .82 }, surface: { vegetation: .36, rock: .84, snow: .39 } } },
  { id: 'alps', name: 'Alps', blurb: 'Carved valleys, green foothills, hard summits', colors: ['#e7ece0', '#588054', '#7d786c'], layers: ['base', 'peaks', 'glacier', 'rivers', 'surface'], values: { base: { generator: 'Ridged multifractal', height: 780, scale: 1.08, roughness: .59 }, peaks: { height: 470, scale: .61 }, glacier: { strength: .45, freeze: .53 }, rivers: { width: 13, moisture: .64 }, surface: { vegetation: .65, rock: .52, snow: .42 } } },
  { id: 'snowy', name: 'Snowy mountains', blurb: 'Wind-blown crests above a cold snow line', colors: ['#edf4f5', '#aec2ca', '#596a69'], layers: ['base', 'peaks', 'glacier', 'surface'], values: { base: { generator: 'Mountain noise', height: 830, scale: 1.14, mask: 'Mountain falloff' }, peaks: { height: 610, roughness: .78 }, glacier: { freeze: .96, strength: .41 }, surface: { vegetation: .18, rock: .49, snow: .83 } } },
  { id: 'outcrop', name: 'Rugged outcrops', blurb: 'Broken rock, rifts, and sharp exposure', colors: ['#9a8268', '#3e3b36', '#c1ad8e'], layers: ['base', 'weathering', 'surface'], values: { base: { generator: 'Rifted ridges', height: 560, scale: .59, detail: 8, roughness: .91, mask: 'Rift field' }, weathering: { iterations: 17, strength: .28, talus: 51 }, surface: { vegetation: .12, rock: .91, snow: .04 } } },
  { id: 'dunes', name: 'Desert dunes', blurb: 'Wind-aligned dunes and sparse interdunes', colors: ['#e8be75', '#a96f3e', '#f5d991'], layers: ['base', 'sediment', 'surface'], values: { base: { generator: 'Dune field', height: 170, scale: .42, detail: 4, roughness: .28, mask: 'Basin falloff' }, sediment: { amount: .89, grain: .87, terrace: .12, cohesion: .16, spread: .72 }, surface: { vegetation: .02, rock: .09, snow: .0, macro: .79 } } },
  { id: 'rocky', name: 'Rocky desert', blurb: 'Dry gullies, exposed stone, broad piedmont', colors: ['#c88d55', '#685143', '#e4b979'], layers: ['base', 'weathering', 'rivers', 'sediment', 'surface'], values: { base: { generator: 'Multifractal', height: 460, scale: .78, roughness: .72, mask: 'Basin falloff' }, weathering: { erosion: 'Thermal', strength: .56, talus: 43 }, rivers: { moisture: .13, incision: .61, width: 8 }, sediment: { amount: .61, wetness: .16 }, surface: { vegetation: .07, rock: .74, snow: 0 } } }
];

const GENERATOR_OPTIONS = ['Ridged multifractal', 'Multifractal', 'Mountain noise', 'Ridged noise', 'Volcanic multifractal', 'Rifted ridges', 'Dune field', 'Coastal shelf', 'Flow accumulation', 'Flow deposition', 'Terrain synthesis'];
const MASK_OPTIONS = ['Mountain falloff', 'Coastal falloff', 'Altitude gate', 'Slope & altitude', 'Drainage basin', 'Lowland collector', 'Cliff faces', 'Stratified basin', 'Cliff shelf', 'Rift field', 'Basin falloff', 'Slope / height / flow'];
const EROSION_TYPES = ['Hydraulic', 'Thermal', 'Aeolian', 'Glacial', 'Coastal'];

function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function fract(v) { return v - Math.floor(v); }
function rand2(x, y, seed) { return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 19.19) * 43758.5453123); }
function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rand2(ix, iy, seed), b = rand2(ix + 1, iy, seed), c = rand2(ix, iy + 1, seed), d = rand2(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
function fbm(x, y, seed, octaves = 5, gain = .5, lacunarity = 2) {
  let sum = 0, amp = .5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += valueNoise(x * f, y * f, seed + i * 23) * amp; norm += amp; amp *= gain; f *= lacunarity; }
  return sum / norm;
}
function ridged(x, y, seed, octaves = 5, gain = .5) {
  let sum = 0, amp = .5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += (1 - Math.abs(valueNoise(x * f, y * f, seed + i * 29) * 2 - 1)) * amp; norm += amp; amp *= gain; f *= 2.04; }
  return sum / norm;
}
function hexToRgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function rgb(c) { return `rgb(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')})`; }

function useTerrainRenderer(ref, layers, settings, view) {
  const cache = useRef({ key: '', grid: null });
  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    if (!W || !H) return;

    const byId = Object.fromEntries(layers.map(l => [l.id, l]));
    const base = byId.base || LAYER_TEMPLATES.base;
    const peaks = byId.peaks;
    const glacier = byId.glacier;
    const rivers = byId.rivers;
    const sediment = byId.sediment;
    const weathering = byId.weathering;
    const surface = byId.surface || LAYER_TEMPLATES.surface;
    const enabled = id => byId[id]?.enabled !== false;
    const key = JSON.stringify({ layers: layers.map(l => ({ id: l.id, ...l })), quality: settings.quality, tick: settings.tick });
    const N = settings.quality === 'draft' ? 54 : 72;
    let grid;
    if (cache.current.key === key) grid = cache.current.grid;
    else {
      grid = Array.from({ length: N }, () => Array(N));
      let min = Infinity, max = -Infinity;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let x = i / (N - 1) - .5, y = j / (N - 1) - .5;
        const seed = Number(base.seed || 428);
        const scale = Number(base.scale || 1);
        const detail = Number(base.detail || 6);
        const rough = Number(base.roughness || .58);
        let xx = x * 5.7 / scale, yy = y * 5.7 / scale;
        const warping = Number(base.warp || .3);
        xx += (fbm(xx + 19, yy - 4, seed + 45, 3) - .5) * warping * 2;
        yy += (fbm(xx - 12, yy + 17, seed + 91, 3) - .5) * warping * 2;
        let h;
        const generator = base.generator || '';
        if (generator === 'Dune field') h = Math.pow(Math.max(0, Math.sin(xx * 3.7 + yy * .8) * .5 + .5), 3) * .62 + fbm(xx * 1.4, yy * 1.4, seed, 3) * .18;
        else if (generator === 'Coastal shelf') h = fbm(xx * .9, yy * .9, seed, detail - 1, .52) * .55 + smoothstep(-.43, -.12, y) * .46 + ridged(xx * .65, yy * .65, seed + 88, 3) * .12;
        else if (generator === 'Rifted ridges') h = ridged(xx * 1.35, yy * 1.35, seed, detail, rough) * .78 + Math.abs(Math.sin(xx * 2.1 - yy * .6)) * .23;
        else if (generator === 'Volcanic multifractal') h = fbm(xx, yy, seed, detail, rough) * .46 + ridged(xx * .7, yy * .7, seed + 7, detail - 1, rough) * .58;
        else if (generator === 'Multifractal') h = fbm(xx, yy, seed, detail, rough) * .9 + ridged(xx * .5, yy * .5, seed + 15, 3) * .16;
        else if (generator === 'Mountain noise') h = ridged(xx, yy, seed, detail, rough) * .96 + fbm(xx * .42, yy * .42, seed + 88, 3) * .27;
        else h = ridged(xx, yy, seed, detail, rough) * .82 + fbm(xx * .6, yy * .6, seed + 3, 4, rough) * .32;
        const dist = Math.sqrt(x * x + y * y);
        const mask = base.mask || '';
        if (mask.includes('Mountain')) h *= 1 - smoothstep(.31, .76, dist) * .65;
        else if (mask.includes('Coastal')) h *= 1 - smoothstep(.28, .72, Math.abs(y + .18)) * .75;
        else if (mask.includes('Basin')) h *= .7 + smoothstep(.1, .74, dist) * .22;
        else if (mask.includes('Rift')) h += Math.sin((x * 10 - y * 2.4) + fbm(xx, yy, seed + 17, 3) * 3) * .08;
        if (peaks && enabled('peaks')) {
          const ph = ridged(xx / Math.max(.1, peaks.scale || .6), yy / Math.max(.1, peaks.scale || .6), peaks.seed || 190, peaks.detail || 6, peaks.roughness || .7);
          h += Math.pow(ph, 3.1) * (peaks.height || 400) / 980 * (peaks.opacity || 70) / 100 * .86;
        }
        if (weathering && enabled('weathering')) h = h * (1 - (weathering.strength || .3) * .08) + fbm(xx * 2.4, yy * 2.4, seed + 231, 3) * .035;
        grid[j][i] = { h, wet: 0, flow: 0, sed: 0 };
        min = Math.min(min, h); max = Math.max(max, h);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j][i].h = (grid[j][i].h - min) / (max - min || 1);
      // A small flow accumulation solver turns the height field into drainage signals.
      if (rivers && enabled('rivers')) {
        const cells = [];
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { grid[j][i].flow = .002 + Math.max(0, grid[j][i].h - .16) * .006; cells.push([i, j]); }
        cells.sort((a, b) => grid[b[1]][b[0]].h - grid[a[1]][a[0]].h);
        for (const [i, j] of cells) {
          let ni = i, nj = j, low = grid[j][i].h;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
            const candidate = grid[j + dy]?.[i + dx]; if (candidate && candidate.h < low) { low = candidate.h; ni = i + dx; nj = j + dy; }
          }
          if (ni !== i || nj !== j) grid[nj][ni].flow += grid[j][i].flow;
        }
        let maxFlow = .001;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) maxFlow = Math.max(maxFlow, grid[j][i].flow);
        const incision = (rivers.incision || .5) * (rivers.opacity || 80) / 100;
        const moisture = rivers.moisture || .6;
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N -1; i++) {
          const c = grid[j][i]; c.flow = Math.pow(c.flow / maxFlow, .58); c.wet = c.flow * moisture;
          if (c.flow > .08 && c.h > .08) c.h = clamp(c.h - Math.pow(c.flow, 1.2) * incision * .15);
        }
      }
      if (glacier && enabled('glacier')) {
        const ice = (glacier.freeze || .6) * (glacier.strength || .5);
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const c = grid[j][i]; if (c.h > .58) c.h = clamp(c.h - (c.h - .58) * ice * .12); }
      }
      if (sediment && enabled('sediment')) {
        const amt = (sediment.amount || .6) * (sediment.opacity || 70) / 100;
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const c = grid[j][i]; c.sed = clamp((1 - c.h) * .42 + c.wet * .88) * amt; c.h = clamp(c.h + c.sed * .025); }
      }
      cache.current = { key, grid };
    }

    // Sky and haze.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#15212a'); sky.addColorStop(.48, '#48606a'); sky.addColorStop(.75, '#9c9987'); sky.addColorStop(1, '#1b2020');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(W * .72, H * .19, 2, W * .72, H * .19, W * .4); halo.addColorStop(0, 'rgba(255,229,175,.42)'); halo.addColorStop(1, 'rgba(255,229,175,0)'); ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

    const yaw = view.yaw, zoom = view.zoom;
    const scale = Math.min(W / 1.6, H / .86) * zoom;
    const project = (i, j, h) => {
      const x = i / (N - 1) - .5, y = j / (N - 1) - .5;
      const rx = x * Math.cos(yaw) - y * Math.sin(yaw);
      const ry = x * Math.sin(yaw) + y * Math.cos(yaw);
      return [W * .51 + rx * scale, H * .62 + ry * scale * .43 - h * scale * .37];
    };
    const sun = [-.55, -.65, .7];
    const vegetation = surface.vegetation ?? .55, rock = surface.rock ?? .6, snow = surface.snow ?? .55, waterline = surface.waterline ?? .18;
    const showHeight = settings.channel === 'Heightmap';
    const showErosion = settings.channel === 'Erosion';
    const showFlow = settings.channel === 'Flow & sediment';
    const cells = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) cells.push([i, j]);
    cells.sort((a, b) => (a[0] * Math.sin(yaw) + a[1] * Math.cos(yaw)) - (b[0] * Math.sin(yaw) + b[1] * Math.cos(yaw)));
    for (const [i, j] of cells) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      const dhx = (b.h + c.h - a.h - d.h) * .5, dhy = (d.h + c.h - a.h - b.h) * .5;
      const nx = -dhx * 3.6, ny = -dhy * 3.6, nz = 1, nl = Math.hypot(nx, ny, nz);
      const light = clamp((nx * sun[0] + ny * sun[1] + nz * sun[2]) / nl * .62 + .48, .17, 1.08);
      const h = (a.h + b.h + c.h + d.h) * .25;
      const wet = (a.wet + b.wet + c.wet + d.wet) * .25;
      const sed = (a.sed + b.sed + c.sed + d.sed) * .25;
      const slope = clamp(Math.hypot(dhx, dhy) * 4.5);
      let col;
      if (showHeight) col = [h * 215 + 16, h * 215 + 16, h * 215 + 18];
      else if (showErosion) col = wet > .1 ? mix([22, 80, 98], [139, 219, 224], wet) : mix([37, 31, 28], [218, 135, 75], clamp(slope * 1.2));
      else if (showFlow) col = mix([57, 53, 43], [172, 127, 73], sed * 1.2), col = wet > .09 ? mix(col, [81, 181, 202], wet * 1.4) : col;
      else {
        const low = [62, 83, 68], meadow = [90, 116, 75], stone = [112, 101, 83], snowCol = [220, 229, 226], sand = [173, 132, 77];
        col = h < waterline ? [43, 113, 136] : h < waterline + .055 ? mix(sand, meadow, vegetation * .25) : mix(low, meadow, vegetation);
        if (sed > .25) col = mix(col, sand, sed * .6);
        col = mix(col, stone, clamp((slope - .22) * rock * 1.35));
        if (h > .66) col = mix(col, snowCol, smoothstep(.66, .92, h) * snow * (1 - slope * .34));
        if (wet > .20 && h > waterline) col = mix(col, [42, 117, 132], clamp(wet * 1.25));
      }
      col = col.map(v => v * light);
      const p1 = project(i, j, a.h), p2 = project(i + 1, j, b.h), p3 = project(i + 1, j + 1, c.h), p4 = project(i, j + 1, d.h);
      ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath(); ctx.fillStyle = rgb(col); ctx.fill();
      if (settings.wireframe) { ctx.strokeStyle = 'rgba(225,239,232,.09)'; ctx.lineWidth = .35; ctx.stroke(); }
    }
    // A blue water plane binds river deltas and coastal presets together.
    if (waterline > .17 && settings.channel === 'Terrain') {
      const waterY = waterline; const p1 = project(0, 0, waterY), p2 = project(N - 1, 0, waterY), p3 = project(N - 1, N - 1, waterY), p4 = project(0, N - 1, waterY);
      ctx.globalAlpha = .13; ctx.fillStyle = '#8bd6e4'; ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    // Frame information is painted in canvas so exports match what the user sees.
    ctx.fillStyle = 'rgba(7,11,12,.42)'; ctx.roundRect(18, H - 42, 196, 25, 7); ctx.fill();
    ctx.fillStyle = 'rgba(233,245,239,.76)'; ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillText(`${N}² terrain cells  ·  ${settings.channel.toUpperCase()}`, 29, H - 26);
  }, [layers, settings, view, ref]);
  useEffect(() => { draw(); const onResize = () => draw(); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, [draw]);
  return draw;
}

function TerrainViewport({ layers, settings, setSettings }) {
  const canvasRef = useRef(null);
  const [view, setView] = useState({ yaw: -.78, zoom: 1.02 });
  const drag = useRef(null);
  const draw = useTerrainRenderer(canvasRef, layers, settings, view);
  const pointerDown = e => { drag.current = { x: e.clientX, yaw: view.yaw }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const pointerMove = e => { if (!drag.current) return; setView(v => ({ ...v, yaw: drag.current.yaw + (e.clientX - drag.current.x) * .008 })); };
  const pointerUp = () => { drag.current = null; };
  const exportPng = () => { const link = document.createElement('a'); link.download = 'frontier-heightfield-preview.png'; link.href = canvasRef.current.toDataURL('image/png'); link.click(); };
  useEffect(() => draw(), [draw]);
  return <main className="viewport">
    <div className="viewport-toolbar">
      <div className="segmented">
        {['Terrain', 'Heightmap', 'Flow & sediment', 'Erosion'].map(channel => <button key={channel} className={settings.channel === channel ? 'selected' : ''} onClick={() => setSettings(s => ({ ...s, channel }))}>{channel}</button>)}
      </div>
      <div className="toolbar-spacer" />
      <button className="mini-control"><Sun size={14} /><span>Afternoon</span><ChevronDown size={13} /></button>
      <button className="mini-control"><Map size={14} /><span>Perspective</span><ChevronDown size={13} /></button>
      <div className="toolbar-divider" />
      <Icon title="Toggle terrain grid" active={settings.wireframe} onClick={() => setSettings(s => ({ ...s, wireframe: !s.wireframe }))}><ScanLine size={16} /></Icon>
      <Icon title="Frame terrain" onClick={() => setView({ yaw: -.78, zoom: 1.02 })}><Focus size={16} /></Icon>
      <Icon title="Export preview PNG" onClick={exportPng}><Download size={16} /></Icon>
    </div>
    <div className="canvas-wrap" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp}>
      <canvas ref={canvasRef} aria-label="Procedural terrain preview. Drag to orbit." />
      <div className="viewport-badge"><span className="live-dot"></span><span>Live terrain synthesis</span><span className="subtle-dot">•</span><b>{settings.quality === 'draft' ? 'Draft' : 'High'} fidelity</b></div>
      <div className="viewport-help"><Move3D size={15} /><span>Drag to orbit</span><span>⌘ scroll to zoom</span></div>
      <div className="navigation-orbit"><button onClick={() => setView(v => ({ ...v, yaw: v.yaw - .18 }))}>↶</button><div className="axis">Z</div><button onClick={() => setView(v => ({ ...v, yaw: v.yaw + .18 }))}>↷</button><button onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom + .08, .65, 1.6) }))}><ZoomIn size={14} /></button><button onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom - .08, .65, 1.6) }))}><ZoomOut size={14} /></button></div>
    </div>
    <div className="viewport-footer">
      <div><span>WORLD</span><b>8.0 × 8.0 km</b></div><div><span>RESOLUTION</span><b>{settings.quality === 'draft' ? '1,024' : '4,096'} × {settings.quality === 'draft' ? '1,024' : '4,096'}</b></div><div><span>HEIGHT RANGE</span><b>0 — {Math.round((layers.find(l => l.id === 'base')?.height || 760) * 1.82)} m</b></div>
      <div className="footer-spacer" /><div className="memory"><span className="memory-bar"><i style={{ width: `${settings.quality === 'draft' ? 38 : 67}%` }} /></span>GPU terrain cache · {settings.quality === 'draft' ? '184' : '612'} MB</div>
    </div>
  </main>;
}

function LayerRow({ layer, selected, onSelect, onToggle, onDuplicate }) {
  const LayerIcon = layer.icon;
  return <div className={`layer-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(layer.id)}>
    <span className="drag"><GripVertical size={15} /></span><span className="layer-swatch" style={{ '--swatch': layer.tint }}><LayerIcon size={14} /></span>
    <div className="layer-name"><b>{layer.title}</b><small>{layer.kind}{layer.erosion ? ` · ${layer.erosion}` : ''}</small></div>
    <span className="layer-opacity">{layer.opacity}%</span>
    <Icon title={layer.enabled ? 'Hide layer' : 'Show layer'} className="row-action" onClick={e => { e.stopPropagation(); onToggle(layer.id); }}><>{layer.enabled ? <Eye size={14} /> : <EyeOff size={14} />}</></Icon>
    <Icon title="Duplicate layer" className="row-action duplicate" onClick={e => { e.stopPropagation(); onDuplicate(layer.id); }}><Copy size={13} /></Icon>
  </div>;
}

function LayerStack({ layers, selectedId, setSelectedId, setLayers, activePreset, setPresetOpen }) {
  const [adding, setAdding] = useState(false);
  const toggle = id => setLayers(rows => rows.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l));
  const duplicate = id => setLayers(rows => { const at = rows.findIndex(l => l.id === id), original = rows[at]; const copy = { ...original, id: `${id}-${Date.now()}`, title: `${original.title} copy` }; return [...rows.slice(0, at), copy, ...rows.slice(at)]; });
  const addLayer = type => { const key = { Height: 'peaks', Erosion: 'weathering', Rivers: 'rivers', Sedimentation: 'sediment', Satmap: 'surface' }[type]; const base = LAYER_TEMPLATES[key]; const next = { ...base, id: `${key}-${Date.now()}`, title: `New ${base.title}` }; setLayers(rows => [next, ...rows]); setSelectedId(next.id); setAdding(false); };
  return <aside className="layer-panel">
    <div className="brand-row"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>FRONTIER</strong><small>TERRAIN LAB <i>β</i></small></div><button className="workspace-switch">TERRAIN <ChevronDown size={12} /></button></div>
    <div className="project-row"><FolderOpen size={15} /><div><b>Highland study</b><span>terrain.frontier</span></div><Icon title="Project settings"><MoreHorizontal size={16} /></Icon></div>
    <div className="panel-heading"><div><Layers3 size={15} /><span>Layer stack</span><em>{layers.length}</em></div><Icon title="Layer stack options"><Settings2 size={15} /></Icon></div>
    <div className="stack-toolbar"><button className="add-layer" onClick={() => setAdding(v => !v)}><Plus size={15} />Add layer</button><Icon title="Layer stack menu"><ChevronDown size={15} /></Icon></div>
    {adding && <div className="add-layer-menu"><span>CREATE TERRAIN LAYER</span>{['Height', 'Erosion', 'Rivers', 'Sedimentation', 'Satmap'].map(type => <button key={type} onClick={() => addLayer(type)}><span>{type === 'Height' ? <Mountain size={15} /> : type === 'Erosion' ? <Droplets size={15} /> : type === 'Rivers' ? <Route size={15} /> : type === 'Sedimentation' ? <Layers3 size={15} /> : <ImageIcon size={15} />}</span>{type}<Plus size={13} /></button>)}</div>}
    <div className="layers-scroll">{layers.map(layer => <LayerRow key={layer.id} layer={layer} selected={layer.id === selectedId} onSelect={setSelectedId} onToggle={toggle} onDuplicate={duplicate} />)}</div>
    <div className="layer-panel-bottom"><button className="preset-selector" onClick={() => setPresetOpen(true)}><span className="preset-mini"><i /><i /><i /></span><div><small>ACTIVE TERRAIN</small><b>{activePreset.name}</b></div><ChevronRight size={16} /></button><div className="compile-state"><span className="check-dot"><Check size={10} /></span><span>Stack is up to date</span><b>2.4 ms</b></div></div>
  </aside>;
}

function Slider({ label, value, min = 0, max = 1, step = .01, suffix = '', onChange, accent = false, helper }) {
  const pct = ((Number(value) - min) / (max - min)) * 100;
  return <label className={`slider-control ${accent ? 'accent' : ''}`}><div className="slider-label"><span>{label}{helper && <span className="info-tip" title={helper}><CircleHelp size={12} /></span>}</span><output>{typeof value === 'number' && step < 1 ? Number(value).toFixed(step < .1 ? 2 : 1) : value}{suffix}</output></div><input type="range" min={min} max={max} step={step} value={value} style={{ '--value': `${pct}%` }} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function SelectControl({ label, value, values, onChange, helper }) { return <label className="select-control"><div className="slider-label"><span>{label}{helper && <span className="info-tip" title={helper}><CircleHelp size={12} /></span>}</span></div><div className="select-wrap"><select value={value} onChange={e => onChange(e.target.value)}>{values.map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={14} /></div></label>; }
function Toggle({ label, checked, onChange, description }) { return <button className={`toggle-row ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span><b>{label}</b>{description && <small>{description}</small>}</span><i><i /></i></button>; }

function GeneratorSection({ layer, update }) {
  const generic = layer.kind === 'Height';
  return <section className="inspector-section generator-section"><div className="section-caption"><span><Sparkles size={14} />{generic ? 'Generator' : layer.kind === 'Satmap' ? 'Signal synthesis' : 'Process source'}</span><button title="Randomize seed" onClick={() => update({ seed: Math.round(Math.random() * 9999) })}><Shuffle size={14} /></button></div>
    <SelectControl label={generic ? 'Generator' : 'Method'} value={layer.generator || (layer.kind === 'Erosion' ? layer.erosion : 'Flow accumulation')} values={generic || layer.kind === 'Satmap' ? GENERATOR_OPTIONS : ['Flow accumulation', 'Flow deposition', 'Hydraulic transport']} onChange={v => update({ generator: v })} />
    {generic && <><div className="two-up"><Slider label="Amplitude" value={layer.height} min={10} max={1200} step={10} suffix=" m" onChange={height => update({ height })} /><Slider label="Scale" value={layer.scale} min={.15} max={2.4} step={.01} suffix=" km" onChange={scale => update({ scale })} /></div><div className="two-up"><Slider label="Detail" value={layer.detail} min={1} max={10} step={1} suffix=" oct" onChange={detail => update({ detail })} /><Slider label="Roughness" value={layer.roughness} min={.1} max={.95} step={.01} onChange={roughness => update({ roughness })} /></div><Slider label="Domain warp" value={layer.warp} min={0} max={1} step={.01} onChange={warp => update({ warp })} /><div className="seed-field"><span>SEED</span><input value={layer.seed} onChange={e => update({ seed: Number(e.target.value) || 0 })} /><button onClick={() => update({ seed: Math.round(Math.random() * 9999) })}><Shuffle size={13} /></button></div></>}
    {layer.kind === 'Rivers' && <><div className="two-up"><Slider label="Source altitude" value={layer.source} min={100} max={1100} step={10} suffix=" m" onChange={source => update({ source })} /><Slider label="Branching" value={layer.branching} min={0} max={1} step={.01} onChange={branching => update({ branching })} /></div><div className="two-up"><Slider label="Incision" value={layer.incision} min={0} max={1} step={.01} onChange={incision => update({ incision })} /><Slider label="Bank width" value={layer.width} min={2} max={40} step={1} suffix=" m" onChange={width => update({ width })} /></div><Slider label="Meander" value={layer.meander} min={0} max={1} step={.01} onChange={meander => update({ meander })} /></>}
    {layer.kind === 'Sedimentation' && <><div className="two-up"><Slider label="Deposition" value={layer.amount} min={0} max={1} step={.01} onChange={amount => update({ amount })} /><Slider label="Grain size" value={layer.grain} min={0} max={1} step={.01} onChange={grain => update({ grain })} /></div><div className="two-up"><Slider label="Terracing" value={layer.terrace} min={0} max={1} step={.01} onChange={terrace => update({ terrace })} /><Slider label="Cohesion" value={layer.cohesion} min={0} max={1} step={.01} onChange={cohesion => update({ cohesion })} /></div><Slider label="Transport spread" value={layer.spread} min={0} max={1} step={.01} onChange={spread => update({ spread })} /></>}
    {layer.kind === 'Satmap' && <><div className="signal-preview"><div className="signal-art"><i /><i /><i /><i /></div><div><b>Protrusion-aware surface</b><small>Material is resolved from height, slope, flow and deposited sediment.</small></div></div><div className="two-up"><Slider label="Vegetation" value={layer.vegetation} min={0} max={1} step={.01} onChange={vegetation => update({ vegetation })} /><Slider label="Rock exposure" value={layer.rock} min={0} max={1} step={.01} onChange={rock => update({ rock })} /></div><div className="two-up"><Slider label="Snow response" value={layer.snow} min={0} max={1} step={.01} onChange={snow => update({ snow })} /><Slider label="Waterline" value={layer.waterline} min={0} max={.45} step={.01} onChange={waterline => update({ waterline })} /></div></>}
  </section>;
}

function ErosionSection({ layer, update, isRunning, runSimulation }) {
  const erosion = layer.erosion || 'Hydraulic';
  const typeInfo = {
    Hydraulic: ['Rain-driven incision and suspended load.', CloudRain], Thermal: ['Talus redistribution on steep exposed faces.', Mountain], Aeolian: ['Wind transport and dune migration.', Wind], Glacial: ['Ice abrasion and valley broadening.', Snowflake], Coastal: ['Wave undercutting at the shore band.', Waves]
  };
  const [copy, TypeIcon] = typeInfo[erosion];
  return <section className="inspector-section erosion-section"><div className="section-caption"><span><Droplets size={14} />Erosion model</span><button className="run-mini" onClick={runSimulation}>{isRunning ? <><span className="spinner" />Solving</> : <><Play size={12} />Preview pass</>}</button></div><SelectControl label="Process type" value={erosion} values={EROSION_TYPES} onChange={v => update({ erosion: v })} /><div className="erosion-type-card"><TypeIcon size={18} /><div><b>{erosion} erosion</b><small>{copy}</small></div><span>ACTIVE</span></div><div className="two-up"><Slider label="Iterations" value={layer.iterations} min={1} max={96} step={1} suffix=" passes" onChange={iterations => update({ iterations })} accent /><Slider label="Strength" value={layer.strength} min={0} max={1} step={.01} onChange={strength => update({ strength })} accent /></div>
  {erosion === 'Hydraulic' && <><div className="two-up"><Slider label="Rainfall" value={layer.rainfall} min={0} max={120} step={1} suffix=" mm" onChange={rainfall => update({ rainfall })} /><Slider label="Channel depth" value={layer.channel} min={0} max={1} step={.01} onChange={channel => update({ channel })} /></div><Slider label="Suspended sediment" value={layer.sediment} min={0} max={1} step={.01} onChange={sediment => update({ sediment })} /></>}
  {erosion === 'Thermal' && <><div className="two-up"><Slider label="Talus angle" value={layer.talus} min={15} max={55} step={1} suffix="°" onChange={talus => update({ talus })} /><Slider label="Freeze–thaw" value={layer.freeze} min={0} max={1} step={.01} onChange={freeze => update({ freeze })} /></div><Slider label="Rock cohesion" value={layer.sediment} min={0} max={1} step={.01} onChange={sediment => update({ sediment })} /></>}
  {erosion === 'Aeolian' && <><div className="two-up"><Slider label="Wind energy" value={layer.rainfall} min={0} max={100} step={1} suffix=" km/h" onChange={rainfall => update({ rainfall })} /><Slider label="Abrasion" value={layer.channel} min={0} max={1} step={.01} onChange={channel => update({ channel })} /></div><Slider label="Sand availability" value={layer.sediment} min={0} max={1} step={.01} onChange={sediment => update({ sediment })} /></>}
  {erosion === 'Glacial' && <><div className="two-up"><Slider label="Ice coverage" value={layer.freeze} min={0} max={1} step={.01} onChange={freeze => update({ freeze })} /><Slider label="Basal slip" value={layer.channel} min={0} max={1} step={.01} onChange={channel => update({ channel })} /></div><Slider label="Debris load" value={layer.sediment} min={0} max={1} step={.01} onChange={sediment => update({ sediment })} /></>}
  {erosion === 'Coastal' && <><div className="two-up"><Slider label="Wave energy" value={layer.rainfall} min={0} max={100} step={1} suffix="%" onChange={rainfall => update({ rainfall })} /><Slider label="Sea-level band" value={layer.channel} min={0} max={1} step={.01} onChange={channel => update({ channel })} /></div><Slider label="Cliff resistance" value={layer.sediment} min={0} max={1} step={.01} onChange={sediment => update({ sediment })} /></>}
</section>;
}

function MaskSection({ layer, update }) {
  return <section className="inspector-section mask-section"><div className="section-caption"><span><BoxSelect size={14} />Mask</span><button title="Invert mask" onClick={() => update({ invertMask: !layer.invertMask })} className={layer.invertMask ? 'inverted' : ''}>Invert</button></div><SelectControl label="Mask source" value={layer.mask || MASK_OPTIONS[0]} values={MASK_OPTIONS} onChange={mask => update({ mask })} /><div className="mask-visual"><div className={`mask-shape ${layer.mask?.includes('Coastal') ? 'coastal' : layer.mask?.includes('Rift') ? 'rift' : layer.mask?.includes('Strat') ? 'strata' : ''}`}><i /><i /><i /><i /></div><div className="mask-legend"><span><i />0</span><span><i />.5</span><span><i />1</span></div></div><div className="two-up"><Slider label="Falloff" value={layer.falloff ?? .36} min={0} max={1} step={.01} onChange={falloff => update({ falloff })} /><Slider label="Influence" value={layer.opacity} min={0} max={100} step={1} suffix="%" onChange={opacity => update({ opacity })} /></div><Toggle label="Use local space" checked={!!layer.localSpace} onChange={localSpace => update({ localSpace })} description="Anchor the mask to the terrain tile." /></section>;
}

function Inspector({ layer, updateLayer, isRunning, runSimulation, settings, setSettings }) {
  if (!layer) return <aside className="inspector"><div className="empty-inspector">Select a layer to inspect its terrain process.</div></aside>;
  const LayerIcon = layer.icon;
  return <aside className="inspector"><div className="inspector-top"><div><SlidersHorizontal size={16} /><span>Inspector</span></div><Icon title="Inspector options"><MoreHorizontal size={16} /></Icon></div><div className="inspect-scroll"><div className="layer-inspect-title"><span className="large-layer-icon" style={{ '--swatch': layer.tint }}><LayerIcon size={21} /></span><div><small>{layer.kind.toUpperCase()} LAYER</small><h1>{layer.title}</h1><span>{layer.enabled ? 'Contributes to terrain output' : 'Disabled from terrain output'}</span></div><Icon title="Layer menu"><MoreHorizontal size={16} /></Icon></div><div className="enabled-control"><Toggle label="Enabled" checked={layer.enabled} onChange={enabled => updateLayer(layer.id, { enabled })} /><button className="reset-button" onClick={() => updateLayer(layer.id, LAYER_TEMPLATES[layer.id.split('-')[0]] || {})}><RotateCcw size={13} />Reset</button></div>
    {layer.kind === 'Erosion' && <ErosionSection layer={layer} update={changes => updateLayer(layer.id, changes)} isRunning={isRunning} runSimulation={runSimulation} />}
    {layer.kind !== 'Erosion' && <GeneratorSection layer={layer} update={changes => updateLayer(layer.id, changes)} />}
    {layer.kind === 'Erosion' && <section className="inspector-section climate-section"><div className="section-caption"><span><CloudRain size={14} />Climate coupling</span><span className="linked">LINKED</span></div><div className="two-up"><Slider label="Rainfall" value={layer.rainfall} min={0} max={120} step={1} suffix=" mm" onChange={rainfall => updateLayer(layer.id, { rainfall })} /><Slider label="Flow bias" value={layer.channel} min={0} max={1} step={.01} onChange={channel => updateLayer(layer.id, { channel })} /></div></section>}
    <MaskSection layer={layer} update={changes => updateLayer(layer.id, changes)} />
    <section className="inspector-section output-section"><div className="section-caption"><span><ArrowDownToLine size={14} />Layer output</span></div><div className="output-grid"><div><span>BLEND</span><b>{layer.kind === 'Satmap' ? 'Surface resolve' : 'Additive height'}</b></div><div><span>BOUNDS</span><b>{layer.kind === 'Height' ? 'Full terrain' : 'Masked region'}</b></div></div></section>
  </div><div className="inspector-foot"><span><i />Auto-compose</span><span>Last solved now</span></div></aside>;
}

function PresetDrawer({ onClose, activePreset, applyPreset }) { return <div className="preset-overlay" onMouseDown={onClose}><section className="preset-drawer" onMouseDown={e => e.stopPropagation()}><header><div><small>TERRAIN LIBRARY</small><h2>Start from a landscape</h2><p>Preset stacks remain fully editable after they are applied.</p></div><Icon title="Close terrain library" onClick={onClose}><X size={19} /></Icon></header><div className="preset-filter"><SearchIcon /><input placeholder="Filter landscapes" /><span>{PRESETS.length} presets</span></div><div className="preset-list">{PRESETS.map(preset => <button className={`preset-card ${activePreset.id === preset.id ? 'active' : ''}`} key={preset.id} onClick={() => applyPreset(preset)}><div className="preset-image" style={{ '--c1': preset.colors[0], '--c2': preset.colors[1], '--c3': preset.colors[2] }}><i /><i /><i /></div><div className="preset-copy"><b>{preset.name}</b><span>{preset.blurb}</span><small><Layers3 size={12} />{preset.layers.length} terrain processes</small></div>{activePreset.id === preset.id && <span className="applied"><Check size={13} />Applied</span>}</button>)}</div></section></div>; }
function SearchIcon(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>}

function App() {
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [selectedId, setSelectedId] = useState('glacier');
  const [activePreset, setActivePreset] = useState(PRESETS[3]);
  const [presetOpen, setPresetOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState({ channel: 'Terrain', wireframe: false, quality: 'high', tick: 0 });
  const selectedLayer = layers.find(l => l.id === selectedId) || layers[0];
  const updateLayer = (id, changes) => setLayers(rows => rows.map(row => row.id === id ? { ...row, ...changes } : row));
  const runSimulation = () => { if (isRunning) return; setIsRunning(true); let n = 0; const interval = setInterval(() => { n++; setSettings(s => ({ ...s, tick: s.tick + 1 })); if (n >= 7) { clearInterval(interval); setIsRunning(false); setToast('Erosion preview solved across active layers'); setTimeout(() => setToast(''), 2600); } }, 155); };
  const applyPreset = preset => { const ordered = preset.layers.map(id => ({ id, ...LAYER_TEMPLATES[id], ...(preset.values[id] || {}) })); setLayers(ordered); setSelectedId(ordered.find(l => l.kind === 'Erosion')?.id || ordered[0].id); setActivePreset(preset); setPresetOpen(false); setToast(`${preset.name} layer stack applied`); setTimeout(() => setToast(''), 2600); };
  const saveProject = () => { localStorage.setItem('frontier-terrain-lab', JSON.stringify({ layers, activePreset: activePreset.id })); setToast('Terrain study saved locally'); setTimeout(() => setToast(''), 2200); };
  return <div className="app-shell"><header className="global-header"><div className="header-left"><Icon title="Toggle left panel" active><PanelLeft size={17} /></Icon><div className="crumb"><b>Frontier</b><ChevronRight size={13} /><span>Worlds</span><ChevronRight size={13} /><strong>Highland study</strong></div></div><div className="header-center"><button className="mode-chip selected"><span />Edit terrain</button><button className="mode-chip"><Play size={12} />Simulate</button></div><div className="header-right"><button className="quality-chip" onClick={() => setSettings(s => ({ ...s, quality: s.quality === 'high' ? 'draft' : 'high' }))}><Gauge size={14} /><span>{settings.quality === 'high' ? 'High' : 'Draft'} fidelity</span><ChevronDown size={13} /></button><Icon title="Undo"><Undo2 size={16} /></Icon><button className="save-button" onClick={saveProject}><Save size={14} />Save</button><div className="user-avatar">SA</div></div></header><div className="editor-grid"><LayerStack layers={layers} selectedId={selectedId} setSelectedId={setSelectedId} setLayers={setLayers} activePreset={activePreset} setPresetOpen={setPresetOpen} /><TerrainViewport layers={layers} settings={settings} setSettings={setSettings} /><Inspector layer={selectedLayer} updateLayer={updateLayer} isRunning={isRunning} runSimulation={runSimulation} settings={settings} setSettings={setSettings} /></div>{presetOpen && <PresetDrawer onClose={() => setPresetOpen(false)} activePreset={activePreset} applyPreset={applyPreset} />}{toast && <div className="toast"><Check size={15} />{toast}</div>}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
