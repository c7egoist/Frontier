export type Params = {
  windSpeed: number;
  windDir: number;
  choppiness: number;
  foam: number;
  waveScale: number;
  sunElev: number;
  sunAzim: number;
  exposure: number;
  spray: number;
  quality: 'gtx-low' | 'gtx' | 'balanced' | 'rtx' | 'rtx-ultra';
  paused: boolean;
  wireframe: boolean;
};

export const QUALITY: Record<Params['quality'], {
  grid: number; rings: number; radial: number; substeps: number; spray: number; label: string;
}> = {
  'gtx-low':  { grid: 128, rings: 96,  radial: 128, substeps: 1, spray: 0,     label: 'GTX 900/1050 · 128² · 1 substep' },
  'gtx':      { grid: 192, rings: 144, radial: 192, substeps: 2, spray: 8192,  label: 'GTX 1060/1660 · 192² · 2 substeps' },
  'balanced': { grid: 256, rings: 192, radial: 256, substeps: 2, spray: 16384, label: 'GTX 1080/2060 · 256² · 2 substeps' },
  'rtx':      { grid: 384, rings: 256, radial: 320, substeps: 3, spray: 32768, label: 'RTX 3060+ · 384² · 3 substeps' },
  'rtx-ultra':{ grid: 512, rings: 320, radial: 384, substeps: 4, spray: 65536, label: 'RTX 4070+ · 512² · 4 substeps' },
};

export function buildUI(p: Params, onChange: (key: keyof Params) => void) {
  const root = document.getElementById('ui')!;
  root.innerHTML = `
    <h1>Frontier Ocean</h1>
    <div class="sub">GPU shallow-water solver · no FFT</div>
    <div id="stats">—</div>
    <hr>
    <div class="row"><label>Quality</label>
      <select id="q">
        ${Object.entries(QUALITY).map(([k, v]) => `<option value="${k}" ${k === p.quality ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
    </div>
    <hr>`;

  const sliders: [keyof Params, string, number, number, number, number][] = [
    ['windSpeed', 'Wind speed (m/s)', 0, 28, 0.5, 1],
    ['windDir', 'Wind dir (°)', 0, 360, 1, 0],
    ['waveScale', 'Wave height', 0, 3, 0.02, 2],
    ['choppiness', 'Choppiness', 0, 2.5, 0.02, 2],
    ['foam', 'Foam', 0, 2, 0.02, 2],
    ['spray', 'Spray density', 0, 2, 0.02, 2],
    ['sunElev', 'Sun elevation (°)', -5, 88, 0.5, 0],
    ['sunAzim', 'Sun azimuth (°)', 0, 360, 1, 0],
    ['exposure', 'Exposure', 0.3, 3, 0.02, 2],
  ];

  for (const [key, label, min, max, step, dp] of sliders) {
    const row = document.createElement('div');
    row.innerHTML = `<div class="row"><label>${label}</label><output id="o_${key}"></output></div>
      <input class="full" id="i_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}">`;
    root.appendChild(row);
    const input = row.querySelector('input')! as HTMLInputElement;
    const out = row.querySelector('output')!;
    const sync = () => { out.textContent = Number(input.value).toFixed(dp); };
    sync();
    input.addEventListener('input', () => {
      (p as any)[key] = Number(input.value);
      sync();
      onChange(key);
    });
  }

  const extra = document.createElement('div');
  extra.innerHTML = `<hr>
    <div class="row"><button id="pause">Pause sim</button><button id="reset">Reset sea</button></div>
    <div class="hint">Drag to look · W A S D + Q/E to fly · Shift = boost · Scroll = FOV</div>`;
  root.appendChild(extra);

  (document.getElementById('q') as HTMLSelectElement).addEventListener('change', (e) => {
    p.quality = (e.target as HTMLSelectElement).value as Params['quality'];
    onChange('quality');
  });
  document.getElementById('pause')!.addEventListener('click', (e) => {
    p.paused = !p.paused;
    (e.target as HTMLButtonElement).textContent = p.paused ? 'Resume sim' : 'Pause sim';
  });
  document.getElementById('reset')!.addEventListener('click', () => onChange('quality'));
}

export function setStats(text: string) {
  const el = document.getElementById('stats');
  if (el) el.innerHTML = text;
}
