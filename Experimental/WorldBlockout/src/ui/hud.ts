// Right-hand readouts + top bar stats. Deliberately shows *decisions* (why a ring got its
// spacing, which cascades are alive) rather than only numbers, because that is what makes the
// adaptivity reviewable.

import type { SpectrumCascade } from '../core/oceanSpectrum.ts';
import type { WaterLOD } from '../core/lod.ts';
import type { WaterStats } from '../gpu/renderer.ts';
import type { RenderSettings } from '../gpu/renderer.ts';
import type { BrushOp } from '../core/terrain.ts';
import type { CityPlot } from '../world/presets.ts';

export interface HudState {
  seed: number;
  gridSize: number;
  landFraction: number;
  ops: BrushOp[];
  cities: (CityPlot & { onLand?: boolean; padHeight?: number })[];
  cascades: SpectrumCascade[];
  settings: RenderSettings;
  lod: WaterLOD | null;
  stats: WaterStats | null;
  gpuError: string | null;
  fps: number;
  bakeMs: number;
  tool: string;
}

const regionColor = (regime: string) =>
  regime === 'simulated' ? '#5fb3f0' : regime === 'displaced' ? '#4f8bc4' : regime === 'flat' ? '#3c6b9a' : '#2a4a6b';

export function buildHud(s: HudState) {
  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('stat-gpu', s.gpuError ? 'GPU unavailable' : (document.getElementById('stat-gpu')?.textContent ?? 'GPU ready'));
  setText('land-fraction', `${(s.landFraction * 100).toFixed(1)}%`);
  setText('bake-info', `${s.gridSize}² in ${s.bakeMs.toFixed(0)} ms`);
  setText('tool-info', s.tool);

  const plan = s.lod;
  const lodEl = document.getElementById('lod-plan');
  if (lodEl && plan) {
    const rows = plan.rings.map(r =>
      `<div style="display:flex;gap:8px;align-items:center">` +
      `<span style="width:14px;height:8px;border-radius:2px;background:${regionColor(r.regime)}"></span>` +
      `<span style="width:18px;color:#7c8b9e">${r.index}</span>` +
      `<span style="width:56px;text-align:right">${r.spacing} m</span>` +
      `<span style="flex:1;color:#8fa1b5">${r.regime}</span>` +
      `<span style="width:54px;text-align:right;color:#6d7a8b">${r.errorPx.toFixed(1)} px</span></div>`
    ).join('');
    lodEl.innerHTML =
      `<div class="muted" style="margin-bottom:6px">${plan.reason}</div>${rows}` +
      `<div class="muted" style="margin-top:6px">${plan.tris.toLocaleString()} triangles · largest error ${plan.maxErrorPx.toFixed(1)} px</div>`;
  }

  const casEl = document.getElementById('cascade-list');
  if (casEl) {
    casEl.innerHTML = s.cascades.length
      ? '<div class="muted" style="margin:6px 0 4px">spectral cascades</div>' + s.cascades.map(c => {
        const texel = c.cfg.tile / c.cfg.size;
        return `${String(c.cfg.tile).padStart(4)} m tile · texel ${texel.toFixed(2)} m · Hs ${c.targetHs.toFixed(2)} m`;
      }).join('\n')
      : '<span class="muted">no cascades yet</span>';
  }

  const simEl = document.getElementById('sim-readout');
  if (simEl && s.stats) {
    simEl.innerHTML = `<div class="muted" style="margin:6px 0 4px">near-field sim</div>` +
      `${s.stats.simResolution}² grid · ${s.settings.simExtent * 2} m across\n` +
      `dt ${s.stats.simDtMs.toFixed(1)} ms · ${s.stats.simSteps} substep(s)\n` +
      `frame ${s.stats.frameMs.toFixed(1)} ms · ${s.fps.toFixed(0)} fps`;
  }
}

export function hudStatsLine(fps: number, tris: number, hs: number): string {
  return `${fps.toFixed(0)} fps · ${(tris / 1000).toFixed(0)}k tris · Hs ${hs.toFixed(1)} m`;
}
