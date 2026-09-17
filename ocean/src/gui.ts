// Hand-rolled HTML control panel + FPS meter (no dependencies).

export interface GuiState {
  tier: string;
  amr: boolean;
  wind: number;      // 0..1 sea state
  spray: boolean;
  minimap: boolean;
  waveview: boolean;
}

export interface Stats {
  fps: number;
  frameMs: number;
  simMs: number;
  refinedBlocks: number;
  blocksTotal: number;
  cellsSim: number;
  cellsUniform: number;
  sprayCap: number;
}

export class Gui {
  readonly state: GuiState;
  onTier: (t: string) => void = () => {};
  onAmr: (v: boolean) => void = () => {};
  onSpray: (v: boolean) => void = () => {};
  onMinimap: (v: boolean) => void = () => {};
  onWaveview: (v: boolean) => void = () => {};

  private statsEl: HTMLElement;
  private stats: Stats = {
    fps: 0, frameMs: 0, simMs: 0, refinedBlocks: 0, blocksTotal: 0,
    cellsSim: 0, cellsUniform: 0, sprayCap: 0,
  };

  constructor(initial: Partial<GuiState>) {
    this.state = {
      tier: initial.tier ?? 'high',
      amr: initial.amr ?? true,
      wind: initial.wind ?? 0.55,
      spray: initial.spray ?? true,
      minimap: initial.minimap ?? true,
      waveview: initial.waveview ?? false,
    };
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

    const tierSel = $<HTMLSelectElement>('tier');
    tierSel.value = this.state.tier;
    tierSel.onchange = () => { this.state.tier = tierSel.value; this.onTier(tierSel.value); };

    const amr = $<HTMLInputElement>('amr');
    amr.checked = this.state.amr;
    amr.onchange = () => { this.state.amr = amr.checked; this.onAmr(amr.checked); };

    const wind = $<HTMLInputElement>('wind');
    wind.value = String(Math.round(this.state.wind * 100));
    wind.oninput = () => { this.state.wind = Number(wind.value) / 100; };

    const spray = $<HTMLInputElement>('spray');
    spray.checked = this.state.spray;
    spray.onchange = () => { this.state.spray = spray.checked; this.onSpray(spray.checked); };

    const minimap = $<HTMLInputElement>('minimap');
    minimap.checked = this.state.minimap;
    minimap.onchange = () => { this.state.minimap = minimap.checked; this.onMinimap(minimap.checked); };

    const waveview = $<HTMLInputElement>('waveview');
    waveview.checked = this.state.waveview;
    waveview.onchange = () => { this.state.waveview = waveview.checked; this.onWaveview(waveview.checked); };

    this.statsEl = $('stats');
  }

  setStats(s: Partial<Stats>): void {
    Object.assign(this.stats, s);
  }

  render(): void {
    const s = this.stats;
    const savings = s.cellsUniform > 0 ? (1 - s.cellsSim / s.cellsUniform) * 100 : 0;
    this.statsEl.innerHTML =
      `<b>${s.fps.toFixed(0)}</b> fps · frame <b>${s.frameMs.toFixed(1)}</b> ms · sim <b>${s.simMs.toFixed(2)}</b> ms\n` +
      `AMR blocks: <b>${s.refinedBlocks}/${s.blocksTotal}</b>\n` +
      `sim cells: <b>${fmt(s.cellsSim)}</b> of ${fmt(s.cellsUniform)} (<b>${savings.toFixed(0)}%</b> saved)\n` +
      `spray capacity: <b>${fmt(s.sprayCap)}</b>`;
  }
}

function fmt(n: number): string {
  return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
}

export class FpsMeter {
  private last = performance.now();
  private emaFrame = 16.7;
  private accum = 0;

  tick(): { dt: number; fps: number; frameMs: number } {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000));
    this.emaFrame = this.emaFrame * 0.92 + (now - this.last) * 0.08;
    this.last = now;
    this.accum += dt;
    return { dt, fps: 1000 / this.emaFrame, frameMs: this.emaFrame };
  }
}
