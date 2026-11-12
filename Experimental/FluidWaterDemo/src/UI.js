// Project Zero Editor-styled UI controller for the 2.5D Fluid & Physical Foam Demo.

import {
  OUTLINER_ROWS,
  SCENE_PRESETS,
  DEBUG_VIEWS,
  BOUNDARY_MODES,
  BOAT_MODES,
  OutlinerMetadata,
  DeepClone,
} from './SceneModel.js';
import { FluidWaterEngine } from './FluidWaterEngine.js';

function SvgIcon(kind, size = 14) {
  const paths = {
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    waterbody: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 11c2.5-1.4 4.5-1.4 6 0s3.5 1.4 6 0 4-1.4 6 0"/>',
    boat: '<path d="M3 15h18l-2.2 4H5.2L3 15Z"/><path d="M6 15V9h8l3 6"/><path d="M11 5v4"/>',
    camera: '<path d="M4 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="m17 10 5-3v10l-5-3Z"/>',
    post: '<circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/>',
    atmosphere: '<path d="M4 16a5 5 0 0 1 9.5-2A4 4 0 1 1 18 18H6"/>',
    shore: '<path d="M2 18c4-3 8-2 12 0s6 1 8-1"/><path d="M4 13c5-4 10-4 16 1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    wind: '<path d="M3 8h12a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 18h9"/>',
    seabed: '<path d="M2 17c3-1.5 6-1.5 9 0s6 1.5 11 0"/><path d="M3 12l4-4 5 5 4-3 5 4"/>',
    folder: '<path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
  };
  const body = paths[kind] || paths.folder;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export class FluidWaterApp {
  constructor(root) {
    this.root = root;
    this.activePresetIdx = 0;
    this.values = SCENE_PRESETS[0].Build();
    this.hidden = {};
    this.collapsed = {};
    this.selectedId = 'waterbody';
    this.searchQuery = '';
    this.leftWidth = 304;
    this.rightWidth = 376;
    this.runMode = 'SIM'; // 'EDIT' | 'SIM' | 'PLAY'

    this._buildShell();
    this.engine = new FluidWaterEngine(this.canvas, this.values, this.hidden);
    this.engine.selectedId = this.selectedId;
    const vpBox = this.root.querySelector('#viewport-box');
    if (vpBox) {
      this.engine.Resize(vpBox.clientWidth || 960, vpBox.clientHeight || 640);
    }

    this._renderSceneTabs();
    this._renderOutliner();
    this._renderInspector();
    this._syncToolbarState();
    this._startLoop();
  }

  _buildShell() {
    this.root.innerHTML = `
      <div class="top-notch-shell" role="region" aria-label="Project Zero Simulation Notch">
        <span class="notch-dot"></span>
        <strong>PROJECT-ZERO</strong>
        <span style="color:#888">2.5D Fluid &amp; Cellular Foam</span>
        <span class="notch-sep"></span>
        <button id="notch-play-btn" title="Pause or resume simulation">Live</button>
        <button id="notch-bounds-btn" class="active" title="Toggle WaterBody bounds box">Bounds</button>
        <button id="notch-follow-btn" title="Follow Boat with Editor Camera">Follow Boat</button>
        <button id="notch-foam-view-btn" title="Inspect Foam Continuum channels">Foam Channels</button>
      </div>

      <main class="workspace" id="workspace" style="--left:${this.leftWidth}px; --right:${this.rightWidth}px;">
        <section class="dock left" aria-label="Outliner dock">
          <div class="tab-strip" id="scene-tabs"></div>
          <div class="outliner-heading">
            <h1>Outliner</h1>
            <small>${OUTLINER_ROWS.length} nodes</small>
            <button class="head-pill" id="btn-show-all" title="Show all nodes">Show All</button>
          </div>
          <div class="stats">
            <button id="stat-visible-btn">
              <span class="status-disc">${SvgIcon('check', 13)}</span>
              <small>Visible</small>
              <strong id="stat-visible-count">0</strong>
            </button>
            <button id="stat-hidden-btn">
              <span class="muted-disc">△</span>
              <small>Hidden</small>
              <strong id="stat-hidden-count">0</strong>
            </button>
          </div>
          <div class="outliner-search">
            <label>
              ${SvgIcon('search', 14)}
              <input id="outliner-search-input" placeholder="Search Outliner…" value="" />
            </label>
          </div>
          <div class="outliner-rows" id="outliner-rows" role="tree" aria-label="Scene outliner"></div>
          <footer class="outliner-footer">
            <span><small>REALTIME</small><b id="foot-fps">60 fps</b></span>
            <span><small>GRID</small><b id="foot-grid">256²</b></span>
            <span><small>FOAM</small><b id="foot-foam">24%</b></span>
            <span><small>BOAT</small><b id="foot-boat">0.0 m/s</b></span>
            <span><small>STEP</small><b id="foot-step">0.8 ms</b></span>
          </footer>
          <div class="divider left" id="divider-left" role="separator" aria-label="Resize Outliner"></div>
        </section>

        <section class="dock centre" aria-label="3D Viewport dock">
          <div class="tab-strip">
            <div class="document-tab active"><span>Viewport</span></div>
            <span class="tab-studio-badge">GPU SWE + Continuum Foam</span>
          </div>
          <div class="viewport-toolbar" role="toolbar">
            <div class="viewport-heading-row">
              <div class="viewport-identity">
                <span class="row-icon waterbody">${SvgIcon('waterbody', 14)}</span>
                <div>
                  <strong id="scene-title">${SCENE_PRESETS[0].Name}</strong>
                  <span id="scene-subtitle">${SCENE_PRESETS[0].Subtitle}</span>
                </div>
                <span class="viewport-preview-badge" id="backend-badge">WEBGL2 GPU</span>
              </div>
              <div class="viewport-modes" role="group" aria-label="Simulation mode">
                <button data-mode="EDIT">Edit</button>
                <button data-mode="SIM" class="active">Sim</button>
                <button data-mode="PLAY">Play</button>
              </div>
            </div>
            <div class="viewport-action-row">
              <button class="viewport-construct" id="btn-impulse" title="Drop a physical wave impulse into the center of WaterBody">Wave Impulse</button>
              <button class="viewport-tool-btn" id="btn-reset-waves">Reset Waves</button>
              <button class="viewport-tool-btn" id="btn-follow-boat" aria-pressed="false">Follow Boat</button>
              <button class="viewport-tool-btn" id="btn-toggle-bounds" aria-pressed="true">Bounds</button>
              <button class="viewport-tool-btn" id="btn-frame-sel">Frame Selected</button>
              <span class="viewport-tool-divider"></span>
              <label class="viewport-select-wrap" title="Camera Projection">
                Proj
                <select id="select-proj">
                  <option value="PERSP">Perspective</option>
                  <option value="TOP">Top</option>
                  <option value="FRONT">Front</option>
                  <option value="RIGHT">Right</option>
                </select>
              </label>
              <label class="viewport-select-wrap" title="Inspect Shaded Water or Physical Foam Buffers">
                View
                <select id="select-debug-view">
                  ${DEBUG_VIEWS.map((v) => `<option value="${v.id}">${v.label}</option>`).join('')}
                </select>
              </label>
            </div>
          </div>
          <div class="scene-viewport-box" id="viewport-box">
            <canvas id="fluid-canvas"></canvas>
            <div class="viewport-hud-pill" id="hud-pill">
              <b id="hud-fps">60 fps</b>
              <span>·</span>
              <span id="hud-bounds">WaterBody 48×48×4.6m</span>
              <span>·</span>
              <span id="hud-boat">Boat 0.0 m/s</span>
            </div>
            <div class="viewport-controls-hint" id="controls-hint">
              Left-drag water: inject wake &amp; foam · Right-drag: orbit · Scroll: zoom · Shift-drag: pan
            </div>
          </div>
          <footer class="viewport-footer">
            <b>LIVE CONTINUUM</b> · Zero textures · Zero fake particles · Dual-phase advected Plateau-border cellular foam · <b id="vfoot-mode">Absorbing Sponge</b>
          </footer>
        </section>

        <section class="dock right" aria-label="Inspector dock">
          <div class="tab-strip">
            <div class="document-tab active"><span>Inspector</span></div>
          </div>
          <div class="inspector-scroll" id="inspector-scroll"></div>
          <footer class="inspector-footer">
            <span id="inspector-desc">Select an entity in Outliner</span>
            <span>Project-Zero UI</span>
          </footer>
          <div class="divider right" id="divider-right" role="separator" aria-label="Resize Inspector"></div>
        </section>
      </main>
    `;

    this.canvas = this.root.querySelector('#fluid-canvas');
    this.workspace = this.root.querySelector('#workspace');

    this._bindChromeEvents();
    this._bindDividers();
    this._bindResizeObserver();
  }

  _bindChromeEvents() {
    this.root.querySelector('#outliner-search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this._renderOutliner();
    });

    this.root.querySelector('#btn-show-all').addEventListener('click', () => {
      for (const k of Object.keys(this.hidden)) delete this.hidden[k];
      this._renderOutliner();
    });
    this.root.querySelector('#stat-visible-btn').addEventListener('click', () => {
      for (const k of Object.keys(this.hidden)) delete this.hidden[k];
      this._renderOutliner();
    });
    this.root.querySelector('#stat-hidden-btn').addEventListener('click', () => {
      for (const r of OUTLINER_ROWS) {
        if (r.Id !== 'camera' && r.Panel !== 'group') this.hidden[r.Id] = true;
      }
      this._renderOutliner();
    });

    this.root.querySelectorAll('.viewport-modes button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.runMode = btn.dataset.mode;
        this.engine.paused = this.runMode === 'EDIT';
        this._syncToolbarState();
      });
    });

    this.root.querySelector('#btn-impulse').addEventListener('click', () => {
      this.engine.TriggerCenterSplash();
    });
    this.root.querySelector('#btn-reset-waves').addEventListener('click', () => {
      this.engine.ResetWaves();
    });
    this.root.querySelector('#btn-frame-sel').addEventListener('click', () => {
      this.engine.FrameSelected(this.selectedId);
      if (this.selectedId === 'camera') this._renderInspector();
    });

    const toggleBounds = () => {
      this.values.waterbody.ShowBounds = !this.values.waterbody.ShowBounds;
      this._syncToolbarState();
      if (this.selectedId === 'waterbody') this._renderInspector();
    };
    const toggleFollow = () => {
      this.values.boat.FollowBoat = !this.values.boat.FollowBoat;
      this._syncToolbarState();
      if (this.selectedId === 'boat') this._renderInspector();
    };

    this.root.querySelector('#btn-toggle-bounds').addEventListener('click', toggleBounds);
    this.root.querySelector('#notch-bounds-btn').addEventListener('click', toggleBounds);
    this.root.querySelector('#btn-follow-boat').addEventListener('click', toggleFollow);
    this.root.querySelector('#notch-follow-btn').addEventListener('click', toggleFollow);

    this.root.querySelector('#notch-play-btn').addEventListener('click', () => {
      this.engine.paused = !this.engine.paused;
      this.runMode = this.engine.paused ? 'EDIT' : 'SIM';
      this._syncToolbarState();
    });

    this.root.querySelector('#notch-foam-view-btn').addEventListener('click', () => {
      this.engine.debugView = this.engine.debugView === 1 ? 0 : 1;
      this.root.querySelector('#select-debug-view').value = String(this.engine.debugView);
      this._syncToolbarState();
    });

    this.root.querySelector('#select-proj').addEventListener('change', (e) => {
      this.engine.projectionMode = e.target.value;
    });

    this.root.querySelector('#select-debug-view').addEventListener('change', (e) => {
      this.engine.debugView = Number(e.target.value);
      this._syncToolbarState();
    });
  }

  _bindDividers() {
    let dragSide = null;
    let startX = 0;
    let startW = 0;

    this.root.querySelector('#divider-left').addEventListener('pointerdown', (e) => {
      dragSide = 'left';
      startX = e.clientX;
      startW = this.leftWidth;
      document.body.classList.add('resizing');
    });
    this.root.querySelector('#divider-right').addEventListener('pointerdown', (e) => {
      dragSide = 'right';
      startX = e.clientX;
      startW = this.rightWidth;
      document.body.classList.add('resizing');
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragSide) return;
      if (dragSide === 'left') {
        this.leftWidth = Math.max(230, Math.min(440, startW + (e.clientX - startX)));
        this.workspace.style.setProperty('--left', this.leftWidth + 'px');
      } else {
        this.rightWidth = Math.max(290, Math.min(520, startW - (e.clientX - startX)));
        this.workspace.style.setProperty('--right', this.rightWidth + 'px');
      }
    });

    window.addEventListener('pointerup', () => {
      if (!dragSide) return;
      dragSide = null;
      document.body.classList.remove('resizing');
    });
  }

  _bindResizeObserver() {
    const box = this.root.querySelector('#viewport-box');
    const ro = new ResizeObserver((entries) => {
      if (!this.engine) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.engine.Resize(width, height);
      }
    });
    ro.observe(box);
  }

  _renderSceneTabs() {
    const strip = this.root.querySelector('#scene-tabs');
    strip.innerHTML = SCENE_PRESETS.map(
      (preset, idx) => `
      <button class="document-tab ${idx === this.activePresetIdx ? 'active' : ''}" data-preset="${idx}">
        <span>${preset.Name}</span>
      </button>
    `,
    ).join('');

    strip.querySelectorAll('.document-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.preset);
        this.activePresetIdx = idx;
        this.values = DeepClone(SCENE_PRESETS[idx].Build());
        this.hidden = {};
        this.engine.SetScene(this.values, this.hidden);
        this.root.querySelector('#scene-title').textContent = SCENE_PRESETS[idx].Name;
        this.root.querySelector('#scene-subtitle').textContent = SCENE_PRESETS[idx].Subtitle;
        this._renderSceneTabs();
        this._renderOutliner();
        this._renderInspector();
        this._syncToolbarState();
      });
    });
  }

  _syncToolbarState() {
    this.root.querySelectorAll('.viewport-modes button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.runMode);
    });
    const showBounds = !!this.values.waterbody.ShowBounds;
    const followBoat = !!this.values.boat.FollowBoat;
    this.root.querySelector('#btn-toggle-bounds').setAttribute('aria-pressed', String(showBounds));
    this.root.querySelector('#notch-bounds-btn').classList.toggle('active', showBounds);
    this.root.querySelector('#btn-follow-boat').setAttribute('aria-pressed', String(followBoat));
    this.root.querySelector('#notch-follow-btn').classList.toggle('active', followBoat);

    const playBtn = this.root.querySelector('#notch-play-btn');
    playBtn.textContent = this.engine.paused ? 'Paused' : 'Live';
    playBtn.classList.toggle('active', !this.engine.paused);

    this.root.querySelector('#notch-foam-view-btn').classList.toggle('active', this.engine.debugView === 1);
    this.root.querySelector('#backend-badge').textContent = this.engine.isWebGL2 ? 'WEBGL2 GPU' : 'SOFTWARE 2.5D';
    this.root.querySelector('#vfoot-mode').textContent = BOUNDARY_MODES[this.values.waterbody.BoundaryMode]?.label || 'Absorbing Sponge';

    const hint = this.root.querySelector('#controls-hint');
    if (this.values.boat.ControlMode === 'manual') {
      hint.textContent = 'WASD / Arrows: drive & steer Boat · Left-drag water: stir wake · Right-drag: orbit';
    } else {
      hint.textContent = 'Left-drag water: inject wake & foam · Right-drag: orbit · Scroll: zoom · Shift-drag: pan';
    }
  }

  _renderOutliner() {
    const q = this.searchQuery.trim().toLowerCase();
    const rowsEl = this.root.querySelector('#outliner-rows');

    const visibleCount = OUTLINER_ROWS.filter((r) => !this.hidden[r.Id]).length;
    const hiddenCount = OUTLINER_ROWS.filter((r) => this.hidden[r.Id]).length;
    this.root.querySelector('#stat-visible-count').textContent = String(visibleCount);
    this.root.querySelector('#stat-hidden-count').textContent = String(hiddenCount);

    const hasChildren = (id) => OUTLINER_ROWS.some((r) => r.Parent === id);
    const filtered = OUTLINER_ROWS.filter((row) => {
      if (row.Parent && this.collapsed[row.Parent] && !q) return false;
      if (!q) return true;
      if (row.Name.toLowerCase().includes(q) || row.Description.toLowerCase().includes(q)) return true;
      if (row.Panel === 'group') {
        return OUTLINER_ROWS.some((c) => c.Parent === row.Id && c.Name.toLowerCase().includes(q));
      }
      return false;
    });

    rowsEl.innerHTML = filtered
      .map((row) => {
        const isSel = row.Id === this.selectedId;
        const isHid = !!this.hidden[row.Id];
        const meta = OutlinerMetadata(row, this.values, this.engine?.telemetry);
        const iconKey = row.Panel === 'group' ? 'folder' : row.Icon;
        return `
        <div
          class="outliner-row ${isSel ? 'selected' : ''} ${isHid ? 'hidden-row' : ''}"
          style="--depth:${row.Depth}"
          data-row-id="${row.Id}"
          role="treeitem"
          aria-selected="${isSel}"
          tabindex="0"
        >
          <button
            class="row-disclosure ${hasChildren(row.Id) ? '' : 'empty'}"
            data-collapse-id="${row.Id}"
            style="${this.collapsed[row.Id] ? 'transform:rotate(-90deg)' : ''}"
            aria-label="Toggle ${row.Name}"
          >${SvgIcon('chevron', 11)}</button>
          <span class="row-icon ${row.Panel}">${SvgIcon(iconKey, 13)}</span>
          <div class="row-identity">
            <span class="row-name">${row.Name}</span>
            <small data-meta-id="${row.Id}">${meta}</small>
          </div>
          ${row.Panel !== 'group' ? `<span class="row-status">${SvgIcon('check', 10)}</span>` : ''}
          <button
            class="visibility"
            data-vis-id="${row.Id}"
            ${row.Id === 'camera' ? 'disabled title="Editor Camera stays active"' : 'title="Toggle visibility"'}
          >${SvgIcon('eye', 13)}</button>
        </div>
      `;
      })
      .join('');

    rowsEl.querySelectorAll('.outliner-row').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.rowId;
        this.selectedId = id;
        this.engine.selectedId = id;
        this._renderOutliner();
        this._renderInspector();
      });
    });

    rowsEl.querySelectorAll('[data-collapse-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.collapseId;
        this.collapsed[id] = !this.collapsed[id];
        this._renderOutliner();
      });
    });

    rowsEl.querySelectorAll('[data-vis-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.visId;
        if (id === 'camera') return;
        this.hidden[id] = !this.hidden[id];
        this._renderOutliner();
      });
    });
  }

  _makeSlider(sectionKey, propKey, label, min, max, step, unit = '', decimals = 2) {
    const val = Number(this.values[sectionKey][propKey]);
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `
      <span><span>${label}</span></span>
      <div class="slider-pill">
        <div class="split-value">
          <input type="number" min="${min}" max="${max}" step="${step}" value="${val.toFixed(decimals)}" />
          <small>${unit || '·'}</small>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--fill:${pct.toFixed(1)}%" />
      </div>
    `;
    const numEl = wrap.querySelector('input[type="number"]');
    const rngEl = wrap.querySelector('input[type="range"]');

    const update = (next) => {
      const clamped = Math.max(min, Math.min(max, Number(next)));
      if (!Number.isFinite(clamped)) return;
      this.values[sectionKey][propKey] = clamped;
      numEl.value = clamped.toFixed(decimals);
      rngEl.value = clamped;
      const p = ((clamped - min) / (max - min)) * 100;
      rngEl.style.setProperty('--fill', `${Math.max(0, Math.min(100, p)).toFixed(1)}%`);
      this._syncToolbarState();
    };

    rngEl.addEventListener('input', () => update(rngEl.value));
    numEl.addEventListener('change', () => update(numEl.value));
    return wrap;
  }

  _makeSwitch(sectionKey, propKey, label, onToggle) {
    const on = !!this.values[sectionKey][propKey];
    const row = document.createElement('div');
    row.className = 'switch-row';
    row.innerHTML = `
      <span>${label}</span>
      <button type="button" class="toggle ${on ? 'on' : ''}" aria-pressed="${on}"><i></i></button>
    `;
    const btn = row.querySelector('button');
    btn.addEventListener('click', () => {
      const next = !this.values[sectionKey][propKey];
      this.values[sectionKey][propKey] = next;
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-pressed', String(next));
      this._syncToolbarState();
      if (onToggle) onToggle(next);
    });
    return row;
  }

  _makeSelect(sectionKey, propKey, label, options, isNumeric = false) {
    const cur = this.values[sectionKey][propKey];
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `
      <span><span>${label}</span></span>
      <select>
        ${options.map(([v, txt]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${txt}</option>`).join('')}
      </select>
    `;
    wrap.querySelector('select').addEventListener('change', (e) => {
      this.values[sectionKey][propKey] = isNumeric ? Number(e.target.value) : e.target.value;
      this._syncToolbarState();
    });
    return wrap;
  }

  _makeColor(sectionKey, propKey, label) {
    const cur = this.values[sectionKey][propKey];
    const row = document.createElement('div');
    row.className = 'color-row';
    row.innerHTML = `
      <span>${label}</span>
      <input type="color" value="${cur}" />
    `;
    row.querySelector('input').addEventListener('input', (e) => {
      this.values[sectionKey][propKey] = e.target.value;
    });
    return row;
  }

  _makeCard(title, children) {
    const card = document.createElement('section');
    card.className = 'property-card';
    card.innerHTML = `<h3>${title}</h3>`;
    for (const ch of children) {
      if (ch) card.appendChild(ch);
    }
    return card;
  }

  _renderInspector() {
    const scroll = this.root.querySelector('#inspector-scroll');
    const row = OUTLINER_ROWS.find((r) => r.Id === this.selectedId) || OUTLINER_ROWS[1];
    this.root.querySelector('#inspector-desc').textContent = row.Description;

    const parent = row.Parent ? OUTLINER_ROWS.find((r) => r.Id === row.Parent)?.Name : 'Scene';
    const rootDiv = document.createElement('div');
    rootDiv.className = 'specialized-inspector';
    rootDiv.innerHTML = `
      <header class="inspector-heading">
        <div class="breadcrumbs">${parent} / ${row.Name}</div>
        <h1>${row.Name}</h1>
        <p class="eyebrow">${row.Description}</p>
      </header>
    `;

    if (row.Panel === 'group') {
      const children = OUTLINER_ROWS.filter((r) => r.Parent === row.Id);
      const wrap = document.createElement('div');
      for (const ch of children) {
        const btn = document.createElement('button');
        btn.className = 'group-child-card';
        btn.innerHTML = `
          <span><strong>${ch.Name}</strong><br><small>${ch.Description}</small></span>
          <small style="color:#ffb454">Select →</small>
        `;
        btn.addEventListener('click', () => {
          this.selectedId = ch.Id;
          this.engine.selectedId = ch.Id;
          this._renderOutliner();
          this._renderInspector();
        });
        wrap.appendChild(btn);
      }
      rootDiv.appendChild(this._makeCard('Entities In Group', [wrap]));
    } else if (row.Panel === 'waterbody') {
      const metrics = document.createElement('div');
      metrics.className = 'metric-row';
      metrics.innerHTML = `
        <div class="metric-block">
          <small>Domain Bounds</small>
          <div class="metric" data-live="wb-dims">${this.values.waterbody.BoundWidth}×${this.values.waterbody.BoundLength}<small>m</small></div>
        </div>
        <div class="metric-block">
          <small>Foam Activity</small>
          <div class="metric" data-live="wb-foam">24<small>%</small></div>
        </div>
      `;
      rootDiv.appendChild(this._makeCard('Continuum Telemetry', [metrics]));

      rootDiv.appendChild(
        this._makeCard('WaterBody Bounds & Grid', [
          this._makeSwitch('waterbody', 'ShowBounds', 'Render Bounds Wireframe'),
          this._makeSwitch('waterbody', 'ShowTankWalls', 'Render Cutaway Tank Sides'),
          this._makeSlider('waterbody', 'BoundWidth', 'Bound Width (X)', 18, 90, 1, 'm', 0),
          this._makeSlider('waterbody', 'BoundLength', 'Bound Length (Z)', 18, 90, 1, 'm', 0),
          this._makeSlider('waterbody', 'WaterDepth', 'Water Depth', 1.2, 12.0, 0.1, 'm', 1),
          this._makeSlider('waterbody', 'BoundsHeight', 'Bounds Box Top Height', 0.8, 6.0, 0.1, 'm', 1),
          this._makeSelect('waterbody', 'SimResolution', 'GPU Grid Resolution', [
            [128, '128 × 128 (Fast)'],
            [192, '192 × 192 (Balanced)'],
            [256, '256 × 256 (High)'],
            [384, '384 × 384 (Ultra)'],
          ], true),
          this._makeSelect('waterbody', 'BoundaryMode', 'Boundary Condition', BOUNDARY_MODES.map((m) => [m.id, m.label]), true),
        ]),
      );

      rootDiv.appendChild(
        this._makeCard('2.5D Shallow-Water & Swell', [
          this._makeSlider('waterbody', 'WaveSpeed', 'Wave Speed (c)', 4.0, 14.0, 0.2, 'm/s', 1),
          this._makeSlider('waterbody', 'SwellAmplitude', 'Swell Amplitude', 0.0, 1.1, 0.02, 'm', 2),
          this._makeSlider('waterbody', 'SwellFrequency', 'Swell Frequency', 0.4, 2.5, 0.05, 'Hz', 2),
          this._makeSlider('waterbody', 'CrossChop', 'Cross-Wave Chop', 0.0, 1.2, 0.02, '', 2),
          this._makeSlider('waterbody', 'WaveDamping', 'Viscous Damping', 0.02, 0.6, 0.01, '', 2),
          this._makeSlider('waterbody', 'VorticityConfinement', 'Wake Eddy Vorticity', 0.0, 3.0, 0.05, '', 2),
          this._makeSlider('waterbody', 'BrushStrength', 'Pointer Wake Strength', 0.2, 3.5, 0.05, '', 2),
        ]),
      );

      rootDiv.appendChild(
        this._makeCard('Physical Foam Continuum', [
          this._makeSlider('waterbody', 'BreakingThreshold', 'Breaking Slope Threshold', 0.08, 0.75, 0.01, '', 2),
          this._makeSlider('waterbody', 'BreakingRate', 'Crest Aeration Rate', 0.0, 4.0, 0.05, '', 2),
          this._makeSlider('waterbody', 'ConvergenceRate', 'Convergence Compression', 0.0, 4.0, 0.05, '', 2),
          this._makeSlider('waterbody', 'HullFoamChurn', 'Hull Bow & Chine Churn', 0.0, 4.0, 0.05, '', 2),
          this._makeSlider('waterbody', 'ThickDrainageRate', 'Thick → Lace Drainage', 0.15, 2.5, 0.02, '/s', 2),
          this._makeSlider('waterbody', 'LaceRuptureRate', 'Lace Film Rupture', 0.1, 2.0, 0.02, '/s', 2),
          this._makeSlider('waterbody', 'SubsurfaceDecay', 'Bubble Rise Rate', 0.15, 2.2, 0.02, '/s', 2),
          this._makeSlider('waterbody', 'MaxFoamBudget', 'Max Foam Saturation', 0.35, 1.2, 0.02, '', 2),
          this._makeSlider('waterbody', 'FoamAdvectSlip', 'Surface Flow Coupling', 0.4, 1.3, 0.02, '', 2),
        ]),
      );

      rootDiv.appendChild(
        this._makeCard('Analytical Cellular Microstructure', [
          this._makeSlider('waterbody', 'CellScale', 'Bubble Cell Density', 1.2, 6.5, 0.1, '', 1),
          this._makeSlider('waterbody', 'FilamentStretch', 'Streamline Shear Stretch', 0.0, 3.0, 0.05, '', 2),
          this._makeSlider('waterbody', 'LaceCrispness', 'Plateau Border Crispness', 0.2, 1.0, 0.02, '', 2),
          this._makeSlider('waterbody', 'FoamRelief', 'Micro-Bubble Sun Relief', 0.0, 2.5, 0.05, '', 2),
          this._makeSlider('waterbody', 'SubsurfaceTintStrength', 'Subsurface Bubble Glow', 0.0, 2.0, 0.05, '', 2),
        ]),
      );

      rootDiv.appendChild(
        this._makeCard('Water Optics & Absorption', [
          this._makeSlider('waterbody', 'AbsorptionDepth', 'Beer-Lambert Clarity', 0.8, 10.0, 0.1, 'm', 1),
          this._makeColor('waterbody', 'ShallowColor', 'Shallow Scatter Colour'),
          this._makeColor('waterbody', 'DeepColor', 'Deep Absorption Colour'),
          this._makeSlider('waterbody', 'FresnelStrength', 'Fresnel Sky Reflection', 0.2, 1.3, 0.02, '', 2),
          this._makeSlider('waterbody', 'RoughnessBase', 'Base Water Roughness', 0.005, 0.14, 0.002, '', 3),
        ]),
      );
    } else if (row.Panel === 'boat') {
      const metrics = document.createElement('div');
      metrics.className = 'metric-row';
      metrics.innerHTML = `
        <div class="metric-block">
          <small>Forward Speed</small>
          <div class="metric" data-live="boat-speed">0.0<small>m/s</small></div>
        </div>
        <div class="metric-block">
          <small>Heave</small>
          <div class="metric" data-live="boat-heave">0.00<small>m</small></div>
        </div>
        <div class="metric-block">
          <small>Pitch</small>
          <div class="metric" data-live="boat-pitch">0.0<small>°</small></div>
        </div>
        <div class="metric-block">
          <small>Roll</small>
          <div class="metric" data-live="boat-roll">0.0<small>°</small></div>
        </div>
      `;
      rootDiv.appendChild(this._makeCard('6-DOF Hull Telemetry', [metrics]));

      const tiles = document.createElement('div');
      tiles.className = 'quick-tile-grid';
      tiles.innerHTML = `
        <button class="quick-tile ${this.values.boat.FollowBoat ? '' : 'off'}" id="tile-follow-boat">
          <strong>Follow Boat</strong>
          <small>${this.values.boat.FollowBoat ? 'ACTIVE' : 'OFF'}</small>
        </button>
        <button class="quick-tile" id="tile-reset-boat">
          <strong>Center Vessel</strong>
          <small>RESET POSE</small>
        </button>
      `;
      tiles.querySelector('#tile-follow-boat').addEventListener('click', () => {
        this.values.boat.FollowBoat = !this.values.boat.FollowBoat;
        this._syncToolbarState();
        this._renderInspector();
      });
      tiles.querySelector('#tile-reset-boat').addEventListener('click', () => {
        this.engine.ResetBoat();
      });

      rootDiv.appendChild(
        this._makeCard('Helm & Propulsion', [
          this._makeSelect('boat', 'ControlMode', 'Helm Control Mode', BOAT_MODES.map((m) => [m.id, m.label])),
          this._makeSlider('boat', 'ThrottleSpeed', 'Target Cruise Speed', 0.5, 13.5, 0.2, 'm/s', 1),
          this._makeSlider('boat', 'TurnAgility', 'Rudder Agility', 0.3, 2.5, 0.05, '', 2),
          tiles,
        ]),
      );

      rootDiv.appendChild(
        this._makeCard('Hull Geometry & Wake Coupling', [
          this._makeSlider('boat', 'HullLength', 'Hull Length', 3.5, 11.0, 0.1, 'm', 1),
          this._makeSlider('boat', 'HullBeam', 'Hull Beam', 1.4, 4.2, 0.05, 'm', 2),
          this._makeSlider('boat', 'DraftDepth', 'Keel Draft', 0.3, 1.4, 0.02, 'm', 2),
          this._makeSlider('boat', 'BuoyancyStiffness', 'Archimedes Stiffness', 6.0, 32.0, 0.5, '', 1),
          this._makeSlider('boat', 'PitchRollDamping', 'Hydrodynamic Damping', 1.0, 8.0, 0.1, '', 1),
          this._makeSlider('boat', 'WakeCoupling', 'Kelvin Wake Coupling', 0.2, 2.6, 0.05, '', 2),
          this._makeSlider('boat', 'PropWashIntensity', 'Stern Propeller Wash', 0.0, 3.2, 0.05, '', 2),
        ]),
      );
    } else if (row.Panel === 'camera') {
      rootDiv.appendChild(
        this._makeCard('Editor Orbit & Lens', [
          this._makeSlider('camera', 'FovDeg', 'Vertical FOV', 22, 78, 1, '°', 0),
          this._makeSlider('camera', 'Distance', 'Orbit Distance', 6, 110, 0.5, 'm', 1),
          this._makeSlider('camera', 'YawDeg', 'Orbit Azimuth', 0, 360, 1, '°', 0),
          this._makeSlider('camera', 'PitchDeg', 'Orbit Pitch', 4, 84, 1, '°', 0),
        ]),
      );
    } else if (row.Panel === 'post') {
      rootDiv.appendChild(
        this._makeCard('ACES Tone & Glint Stack', [
          this._makeSlider('post', 'ExposureEV', 'Exposure Compensation', -2.5, 2.5, 0.05, 'EV', 2),
          this._makeSlider('post', 'Contrast', 'Filmic Contrast', 0.75, 1.35, 0.01, '', 2),
          this._makeSlider('post', 'Saturation', 'Color Saturation', 0.6, 1.5, 0.02, '', 2),
          this._makeSlider('post', 'Bloom', 'Sun Glint Bloom', 0.0, 1.0, 0.02, '', 2),
          this._makeSlider('post', 'Vignette', 'Optical Vignette', 0.0, 0.8, 0.02, '', 2),
        ]),
      );
    } else if (row.Panel === 'shore') {
      rootDiv.appendChild(
        this._makeCard('Coastal Shore & Surf Zone', [
          this._makeSwitch('shore', 'ShoreEnabled', 'Enable Sandy Cove Shore'),
          this._makeSlider('shore', 'ShoreWidth', 'Beach Shelf Width', 6.0, 26.0, 0.5, 'm', 1),
          this._makeSlider('shore', 'ShoreSlope', 'Beach Gradient', 0.1, 0.45, 0.01, '', 2),
          this._makeSlider('shore', 'ShoreCurve', 'Cove Curvature', 0.0, 6.0, 0.1, 'm', 1),
          this._makeSlider('shore', 'SurfBreakStrength', 'Surf-Zone Breaking Foam', 0.0, 2.2, 0.05, '', 2),
          this._makeSlider('shore', 'SandWetness', 'Wet Swash Sand Sheen', 0.0, 1.0, 0.02, '', 2),
          this._makeColor('shore', 'BeachColor', 'Dry Beach Sand Colour'),
        ]),
      );
    } else if (row.Panel === 'atmosphere') {
      rootDiv.appendChild(
        this._makeCard('Sky Dome & Scattering', [
          this._makeColor('atmosphere', 'ZenithColor', 'Sky Zenith Colour'),
          this._makeColor('atmosphere', 'HorizonColor', 'Horizon Scatter Colour'),
          this._makeSlider('atmosphere', 'HazeDensity', 'Atmospheric Haze', 0.0, 0.9, 0.02, '', 2),
          this._makeSlider('atmosphere', 'SkyBrightness', 'Sky Radiance', 0.4, 1.8, 0.05, '', 2),
        ]),
      );
    } else if (row.Panel === 'sun') {
      rootDiv.appendChild(
        this._makeCard('Solar Direction & Glint', [
          this._makeSlider('sun', 'ElevationDeg', 'Sun Elevation', 4, 85, 1, '°', 0),
          this._makeSlider('sun', 'AzimuthDeg', 'Sun Azimuth', 0, 360, 1, '°', 0),
          this._makeSlider('sun', 'Intensity', 'Solar Intensity', 0.5, 6.5, 0.1, '', 1),
          this._makeSlider('sun', 'GlintPower', 'Specular Sharpness', 80, 900, 10, '', 0),
          this._makeColor('sun', 'SunColor', 'Solar Chromaticity'),
        ]),
      );
    } else if (row.Panel === 'wind') {
      rootDiv.appendChild(
        this._makeCard('Surface Wind Shear & Chop', [
          this._makeSlider('wind', 'Speed', 'Wind Speed', 0.0, 22.0, 0.2, 'm/s', 1),
          this._makeSlider('wind', 'DirectionDeg', 'Wind Bearing', 0, 360, 1, '°', 0),
          this._makeSlider('wind', 'SurfaceDrift', 'Foam Wind Drift', 0.0, 1.0, 0.02, '', 2),
          this._makeSlider('wind', 'CapillaryChop', 'Capillary Micro-Ripples', 0.0, 1.5, 0.02, '', 2),
        ]),
      );
    } else if (row.Panel === 'seabed') {
      rootDiv.appendChild(
        this._makeCard('Basin Floor & Cutaway Tank', [
          this._makeColor('seabed', 'SandColor', 'Basin Bed Albedo'),
          this._makeSlider('seabed', 'CausticIntensity', 'Optical Caustics', 0.0, 2.5, 0.05, '', 2),
          this._makeSlider('seabed', 'CausticScale', 'Caustic Frequency', 0.4, 2.5, 0.05, '', 2),
          this._makeSlider('seabed', 'TankGlassOpacity', 'Tank Wall Opacity', 0.05, 0.8, 0.02, '', 2),
          this._makeSlider('seabed', 'StudioGridOpacity', 'Studio Grid Opacity', 0.0, 0.8, 0.02, '', 2),
        ]),
      );
    }

    scroll.innerHTML = '';
    scroll.appendChild(rootDiv);
  }

  _updateLiveTelemetry() {
    const t = this.engine.telemetry;
    const w = this.values.waterbody;
    this.root.querySelector('#foot-fps').textContent = `${t.fps} fps`;
    this.root.querySelector('#foot-grid').textContent = `${t.simRes}²`;
    this.root.querySelector('#foot-foam').textContent = `${Math.round(t.foamActivity * 100)}%`;
    this.root.querySelector('#foot-boat').textContent = `${t.boatSpeed.toFixed(1)} m/s`;
    this.root.querySelector('#foot-step').textContent = `${t.simStepMs.toFixed(1)} ms`;

    this.root.querySelector('#hud-fps').textContent = `${t.fps} fps`;
    this.root.querySelector('#hud-bounds').textContent = `WaterBody ${w.BoundWidth}×${w.BoundLength}×${Number(w.WaterDepth).toFixed(1)}m`;
    this.root.querySelector('#hud-boat').textContent = `Boat ${t.boatSpeed.toFixed(1)} m/s`;

    for (const r of OUTLINER_ROWS) {
      const mEl = this.root.querySelector(`[data-meta-id="${r.Id}"]`);
      if (mEl) mEl.textContent = OutlinerMetadata(r, this.values, t);
    }

    const elDims = this.root.querySelector('[data-live="wb-dims"]');
    if (elDims) elDims.innerHTML = `${w.BoundWidth}×${w.BoundLength}<small>m</small>`;
    const elFoam = this.root.querySelector('[data-live="wb-foam"]');
    if (elFoam) elFoam.innerHTML = `${Math.round(t.foamActivity * 100)}<small>%</small>`;

    const bSpd = this.root.querySelector('[data-live="boat-speed"]');
    if (bSpd) bSpd.innerHTML = `${t.boatSpeed.toFixed(1)}<small>m/s</small>`;
    const bH = this.root.querySelector('[data-live="boat-heave"]');
    if (bH) bH.innerHTML = `${t.boatHeaveM.toFixed(2)}<small>m</small>`;
    const bP = this.root.querySelector('[data-live="boat-pitch"]');
    if (bP) bP.innerHTML = `${t.boatPitchDeg.toFixed(1)}<small>°</small>`;
    const bR = this.root.querySelector('[data-live="boat-roll"]');
    if (bR) bR.innerHTML = `${t.boatRollDeg.toFixed(1)}<small>°</small>`;
  }

  _startLoop() {
    let lastUiSync = 0;
    const frame = (now) => {
      this.engine.Tick(now);
      if (now - lastUiSync > 120) {
        lastUiSync = now;
        this._updateLiveTelemetry();
      }
      this._rafId = requestAnimationFrame(frame);
    };
    this._rafId = requestAnimationFrame(frame);
  }
}
