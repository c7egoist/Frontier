// Declarative wiring for every control in the left panel. Kept separate from main.ts so the
// boot path reads as a sequence rather than a wall of getElementById calls.

import type { OrbitCamera } from '../app/camera.ts';
import type { BrushKind } from '../core/terrain.ts';

export interface ControlHost {
  state: {
    settings: object;
    tool: BrushKind | 'city' | 'none';
    brushRadius: number;
    strength: number;
    paused: boolean;
    mode: '3d' | 'map';
    world: { params: { gridSize: number; peakHeight: number; shelfWidth: number; seed: number } };
  };
}

export interface ControlActions {
  camera: OrbitCamera;
  regenerateSpectrum: () => void;
  scheduleBake: (ms?: number) => void;
  rebake: () => void;
  updateHud: () => void;
}

type El = HTMLInputElement | HTMLSelectElement;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export function wireControls(host: ControlHost, actions: ControlActions) {
  const s = host.state.settings as Record<string, number | boolean>;

  // Numeric sliders -> settings + label
  const bind = (id: string, key: string, format: (v: number) => string, apply?: (v: number) => void) => {
    const el = $<HTMLInputElement>(id);
    const label = document.getElementById(`${id}-val`);
    if (!el) return;
    const update = () => {
      const v = Number(el.value);
      s[key] = v;
      if (label) label.textContent = format(v);
      apply?.(v);
    };
    el.addEventListener('input', update);
    update();
  };

  bind('wind', 'windSpeed', v => `${v.toFixed(1)} m/s`, () => actions.regenerateSpectrum());
  bind('winddir', 'windDirection', v => `${v.toFixed(0)}°`, (v) => { s.windDirection = (v * Math.PI) / 180; actions.regenerateSpectrum(); });
  bind('chop', 'choppiness', v => v.toFixed(2));
  bind('extent', 'simExtent', v => `${(v * 2 / 1000).toFixed(1)} km across`);
  bind('pixel', 'pixelErrorBudget', v => `${v.toFixed(1)} px`);
  bind('exposure', 'exposure', v => v.toFixed(2));
  bind('sun', 'sunElevation', v => `${v.toFixed(0)}°`, v => { s.sunElevation = (v * Math.PI) / 180; });
  bind('sunaz', 'sunAzimuth', v => `${v.toFixed(0)}°`, v => { s.sunAzimuth = (v * Math.PI) / 180; });
  bind('terrain-detail', 'terrainDetail', v => v.toFixed(2));

  // Brush radius / strength live on the host, not in render settings
  const brush = $<HTMLInputElement>('brush');
  const brushVal = document.getElementById('brush-val');
  const brushUpdate = () => {
    if (!brush) return;
    const km = Number(brush.value);
    host.state.brushRadius = km * 1000;
    if (brushVal) brushVal.textContent = `${km} km`;
  };
  brush?.addEventListener('input', brushUpdate);
  brushUpdate();

  const strength = $<HTMLInputElement>('strength');
  const strengthVal = document.getElementById('strength-val');
  const strengthUpdate = () => {
    if (!strength) return;
    host.state.strength = Number(strength.value);
    if (strengthVal) strengthVal.textContent = Number(strength.value).toFixed(2);
  };
  strength?.addEventListener('input', strengthUpdate);
  strengthUpdate();

  // Tools
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tools button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      host.state.tool = (btn.dataset.tool ?? 'none') as BrushKind | 'city' | 'none';
    });
  });

  // Modes
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modes button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      host.state.mode = (btn.dataset.mode ?? '3d') as '3d' | 'map';
    });
  });

  // Bake resolution rebuilds the world at a new grid size
  const res = $<HTMLSelectElement>('bake-res');
  res?.addEventListener('change', () => {
    host.state.world.params.gridSize = Number(res.value);
    actions.rebake();
  });

  // Peak / shelf sliders modify the field then rebake (throttled)
  const peak = $<HTMLInputElement>('peak');
  peak?.addEventListener('input', () => {
    host.state.world.params.peakHeight = Number(peak.value);
    const el = document.getElementById('peak-val');
    if (el) el.textContent = `${peak.value} m`;
    actions.scheduleBake(220);
  });
  const shelf = $<HTMLInputElement>('shelf');
  shelf?.addEventListener('input', () => {
    host.state.world.params.shelfWidth = Number(shelf.value) * 1000;
    const el = document.getElementById('shelf-val');
    if (el) el.textContent = `${shelf.value} km`;
    actions.scheduleBake(220);
  });

  const seed = $<HTMLInputElement>('seed');
  $('btn-generate')?.addEventListener('click', () => {
    if (seed) host.state.world.params.seed = Number(seed.value) || 1;
    actions.rebake();
  });

  // View toggles
  const toggle = (id: string, key: string) => {
    const el = $<HTMLInputElement>(id);
    if (!el) return;
    const apply = () => { s[key] = el.checked; };
    el.addEventListener('change', apply);
    apply();
  };
  toggle('show-cities', 'showCities');
  toggle('show-slice', 'showWaterSlice');
  toggle('show-rings', 'showLodRings');

  // Keyboard-free buttons
  const pause = $<HTMLButtonElement>('btn-pause');
  pause?.addEventListener('click', () => {
    host.state.paused = !host.state.paused;
    pause.textContent = host.state.paused ? 'Resume time' : 'Pause time';
  });
  $('btn-reset')?.addEventListener('click', () => {
    actions.camera.target = [0, 0];
    actions.camera.distance = 9000;
    actions.camera.pitch = 0.45;
    actions.camera.yaw = 0.7;
  });

  const specRes = $<HTMLSelectElement>('spec-res');
  specRes?.addEventListener('change', () => {
    (host.state.settings as unknown as Record<string, number>).spectrumSize = Number(specRes.value);
    actions.regenerateSpectrum();
  });

  const simRes = $<HTMLSelectElement>('sim-res');
  simRes?.addEventListener('change', () => {
    (host.state.settings as unknown as Record<string, number>).simResolution = Number(simRes.value);
  });
}
