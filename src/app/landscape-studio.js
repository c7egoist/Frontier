/**
 * Landscape Studio — planet-scale SDF landmass authoring workspace.
 *
 * Deliberately scoped to the base layer the user asked for first:
 *   - author landmasses (stamps) and sculpt them in the SDF
 *   - a planet-scale, camera-following ocean with surf and foam
 *   - non-destructive document, kilobyte saves, tiled LOD evaluation
 *
 * Erosion, sediment beds, chemical weathering and mesh-crack generation are
 * listed in the outliner as planned layers with their pipeline position, so the
 * port of the Terrain Studio simulations can slot in without reshuffling the
 * UI. See Docs/PlanetLandmassPlan.md for that sequence.
 */

import {
  LANDSCAPE_LAYER_KINDS,
  WORLD_SIZE_MAX_METERS,
  WORLD_SIZE_MIN_METERS,
  createLandscapeDocument,
  deserializeLandscapeDocument,
  documentStats,
  findLayer,
  moveLayer,
  removeLayer,
  removeOp,
  serializeLandscapeDocumentText,
  touchDocument,
} from '../core/landscape-document.js';
import { createLandscapeField } from '../core/landscape-field.js';
import { LandscapeToolbar } from './landscape-toolbar.js';
import { LandscapeViewport } from './landscape-viewport.js';

const STORAGE_KEY = 'frontier.landscape.document.v3';

function byId(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDistance(meters) {
  const value = Number(meters) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mm`;
  if (value >= 10_000) return `${Math.round(value / 1_000)} km`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

/** One-line summary of what a layer currently holds. */
function layerMetaText(layer, spec) {
  const count = layer.ops?.length || 0;
  if (spec?.id === 'base') {
    return `${(layer.params.landCoverage * 100).toFixed(0)}% land · relief ${(layer.params.continentHeightMeters / 1000).toFixed(1)} km`;
  }
  if (!count) return spec?.description || 'empty';
  if (spec?.id === 'sculpt') return `${count} stroke${count === 1 ? '' : 's'}`;
  if (spec?.id === 'landform') {
    const stamps = layer.ops.filter((op) => op.type === 'stamp');
    const counts = new Map();
    for (const stamp of stamps) counts.set(stamp.kind, (counts.get(stamp.kind) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return `${count} op${count === 1 ? '' : 's'}`;
    return `${top[0]}${top[1] > 1 ? ` ×${top[1]}` : ''}${stamps.length > top[1] ? ` +${stamps.length - top[1]}` : ''}`;
  }
  return `${count} op${count === 1 ? '' : 's'}`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

export class LandscapeWorkspace {
  constructor(viewportContainer, options = {}) {
    this.container = viewportContainer;
    this.refs = options.refs || {};
    this._storage = options.storage || null;
    this.doc = this._loadDocument();
    this.selectedLayerId = this.doc.layers.find((layer) => layer.kind === 'base')?.id || this.doc.layers[0]?.id;
    this.selectedOpId = null;
    this.inspectorTab = 'layer';
    this.active = false;
    this._dirtySaveTimer = null;
    this._statsRaf = 0;

    const createViewport = options.createViewport
      || ((container, doc, hooks) => new LandscapeViewport(container, doc, hooks));
    this.viewport = createViewport(this.container, this.doc, {
      createRenderer: options.createRenderer,
      onStats: (stats) => this._onStats(stats),
      onPick: (pick) => this._onPick(pick),
      onDocChanged: () => this._onDocChanged(),
    });

    this.toolbar = new LandscapeToolbar(this.refs.toolbar, {
      onToolChange: (tool, stamp) => this._onToolChange(tool, stamp),
      onBrushChange: (brush) => this.viewport.setBrush(brush),
      onStampChange: (stamp) => {
        this.viewport.setStampScale(stamp.scale);
        this.toolbar.setStampScale(stamp.scale);
      },
    });

    this._bindChrome();
    this._renderOutliner();
    this._renderInspector();
    this._renderHeaderStats();
    this._restoreViewSettings();
  }

  // -------------------------------------------------------------------------
  // Document persistence
  // -------------------------------------------------------------------------

  _loadDocument() {
    try {
      const store = this._storage || (typeof window !== 'undefined' ? window.localStorage : null);
      const raw = store?.getItem?.(STORAGE_KEY);
      if (raw) return deserializeLandscapeDocument(raw);
    } catch (error) {
      console.warn('Landscape document could not be restored:', error);
    }
    return createLandscapeDocument({ name: 'Aurelia', spanMeters: 3_200_000 });
  }

  _scheduleSave() {
    if (this._dirtySaveTimer) clearTimeout(this._dirtySaveTimer);
    this._dirtySaveTimer = setTimeout(() => {
      this._dirtySaveTimer = null;
      try {
        const store = this._storage || (typeof window !== 'undefined' ? window.localStorage : null);
        store?.setItem?.(STORAGE_KEY, serializeLandscapeDocumentText(this.doc));
      } catch (error) {
        console.warn('Landscape document could not be saved:', error);
      }
    }, 600);
  }

  setInspectorTab(tab) {
    if (!tab || tab === this.inspectorTab) {
      this.inspectorTab = tab || this.inspectorTab;
      this._renderInspector();
      return;
    }
    this.inspectorTab = tab;
    for (const button of this.refs.inspectorTabs?.querySelectorAll?.('[data-inspector-tab]') || []) {
      button.classList.toggle('active', button.dataset.inspectorTab === tab);
    }
    this._renderInspector();
  }

  setActive(flag) {
    this.active = Boolean(flag);
    // A frame loop is not required outside a browser; keep it tidy either way.
    if (this.active && !this.viewport.active) this.viewport.setActive(true);
    this.viewport.setActive(this.active);
    if (this.active) {
      this._renderHeaderStats();
    }
  }

  // -------------------------------------------------------------------------
  // Chrome wiring
  // -------------------------------------------------------------------------

  _bindChrome() {
    const refs = this.refs;
    refs.cameraOverview?.addEventListener('click', () => this.viewport.frameCamera('overview'));
    refs.cameraTop?.addEventListener('click', () => this.viewport.frameCamera('top'));
    refs.cameraCoast?.addEventListener('click', () => this.viewport.frameCamera('coast'));
    refs.cameraSurface?.addEventListener('click', () => this.viewport.frameCamera('surface'));

    refs.wireframeToggle?.addEventListener('change', (event) => {
      this.viewport.setWireframe(event.target.checked);
    });
    refs.oceanToggle?.addEventListener('change', (event) => {
      this.viewport.setOceanVisible(event.target.checked);
      this._renderInspector();
    });

    refs.regenBase?.addEventListener('click', () => {
      const base = this.doc.layers.find((layer) => layer.kind === 'base');
      if (!base) return;
      base.params.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      this.doc.seed = base.params.seed;
      touchDocument(this.doc);
      this.viewport.notifyDocumentChanged(null);
      this._renderInspector();
      this._renderOutliner();
      this._scheduleSave();
    });

    refs.exportJson?.addEventListener('click', () => this._exportDocument());
    refs.importJson?.addEventListener('click', () => refs.importFile?.click());
    refs.importFile?.addEventListener('change', (event) => this._importDocument(event));
    refs.exportMesh?.addEventListener('click', () => this._exportMesh());
    refs.newDocument?.addEventListener('click', () => this._resetDocument());

    refs.inspectorTabs?.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-inspector-tab]');
      if (!button) return;
      this.setInspectorTab(button.dataset.inspectorTab);
    });
    // Bound per button too: the tabs may be spread across the panel header, and
    // a click on one should work even if the container listener is bypassed.
    for (const tab of refs.inspectorTabs?.querySelectorAll?.('[data-inspector-tab]') || []) {
      tab.addEventListener('click', () => this.setInspectorTab(tab.dataset.inspectorTab));
    }
  }

  _onToolChange(tool) {
    this.viewport.setTool(tool);
    const hint = byId('lm-tool-hint');
    if (hint) {
      if (tool === 'navigate') hint.textContent = 'Drag to orbit · Right-drag or middle-drag to pan · Wheel to zoom';
      else if (tool.startsWith('stamp:')) hint.textContent = 'Click to stamp a landmass into the SDF · drag the rail to size it';
      else hint.textContent = 'Drag on the terrain to sculpt · strokes are stored, not baked';
    }
  }

  _onPick(pick) {
    const readout = byId('lm-pick-readout');
    if (!readout) return;
    if (!pick) {
      readout.textContent = '—';
      return;
    }
    const elevation = pick.y;
    const above = elevation - this.viewport._seaLevel();
    readout.textContent = `x ${formatDistance(pick.x)}  z ${formatDistance(pick.z)}  ·  ${
      above >= 0 ? `${formatDistance(above)} above sea` : `${formatDistance(-above)} below sea`
    }`;
  }

  _onDocChanged() {
    this._renderOutliner();
    this._renderHeaderStats();
    this._scheduleSave();
    if (this.selectedOpId) this._renderInspector();
  }

  _onStats(stats) {
    const refs = this.refs;
    if (refs.statFps) refs.statFps.textContent = `${Math.round(stats.fps)}`;
    if (refs.statTiles) refs.statTiles.textContent = `${stats.tiles}${stats.queued ? ` +${stats.queued}` : ''}`;
    if (refs.statTris) refs.statTris.textContent = stats.triangles >= 1_000_000
      ? `${(stats.triangles / 1_000_000).toFixed(2)} M`
      : `${Math.round(stats.triangles / 1000)} k`;
    if (refs.statMemory) refs.statMemory.textContent = `${stats.residentMb.toFixed(1)}/${Math.round(stats.budgetMb)} MB`;
    if (refs.statAltitude) refs.statAltitude.textContent = formatDistance(stats.altitude);
    if (refs.hudCoords) {
      refs.hudCoords.textContent = `${formatDistance(stats.focusX)} E · ${formatDistance(stats.focusZ)} S`;
    }
    if (refs.oceanFrame) {
      refs.oceanFrame.textContent = `ocean bed ${stats.oceanSimMs.toFixed(0)} ms · span ${formatDistance(this.viewport.oceanSpan)}`;
    }
  }

  // -------------------------------------------------------------------------
  // Outliner
  // -------------------------------------------------------------------------

  _renderOutliner() {
    const list = this.refs.layerList;
    if (!list) return;
    list.innerHTML = '';

    const planned = [];
    for (const layer of this.doc.layers) {
      list.appendChild(this._layerRow(layer));
    }
    for (const spec of Object.values(LANDSCAPE_LAYER_KINDS)) {
      if (spec.available) continue;
      if (this.doc.layers.some((layer) => layer.kind === spec.id)) continue;
      planned.push(spec);
    }
    if (planned.length) {
      const header = el('div', 'lm-outliner-group', 'PLANNED — ported after sculpting');
      list.appendChild(header);
      for (const spec of planned) {
        const row = el('div', 'lm-layer-row planned');
        row.appendChild(el('span', 'lm-layer-glyph', '⋯'));
        const body = el('div', 'lm-layer-body');
        body.appendChild(el('span', 'lm-layer-name', spec.label));
        body.appendChild(el('span', 'lm-layer-meta', spec.description));
        row.appendChild(body);
        row.appendChild(el('span', 'lm-layer-pill', 'soon'));
        list.appendChild(row);
      }
    }

    const count = this.refs.layerCount;
    if (count) count.textContent = String(this.doc.layers.length);
  }

  _layerRow(layer) {
    const spec = LANDSCAPE_LAYER_KINDS[layer.kind];
    const row = el('div', 'lm-layer-row');
    row.dataset.layerId = layer.id;
    if (layer.id === this.selectedLayerId) row.classList.add('selected');
    if (!layer.visible) row.classList.add('hidden-layer');

    const eye = el('button', 'lm-layer-eye', layer.visible ? '◉' : '○');
    eye.type = 'button';
    eye.title = layer.visible ? 'Hide layer' : 'Show layer';
    eye.addEventListener('click', (event) => {
      event.stopPropagation();
      layer.visible = !layer.visible;
      touchDocument(this.doc);
      this.viewport.notifyDocumentChanged(null);
      this._renderOutliner();
      this._scheduleSave();
    });
    row.appendChild(eye);

    const body = el('div', 'lm-layer-body');
    body.appendChild(el('span', 'lm-layer-name', layer.name));
    const meta = el('span', 'lm-layer-meta', layerMetaText(layer, spec));
    body.appendChild(meta);
    row.appendChild(body);

    const pill = el('span', 'lm-layer-pill', String(layer.ops.length));
    row.appendChild(pill);

    row.addEventListener('click', () => {
      this.selectedLayerId = layer.id;
      this.selectedOpId = null;
      this.inspectorTab = 'layer';
      if (layer.kind === 'sculpt') this.viewport.strokeLayerId = layer.id;
      this._renderOutliner();
      this._renderInspector();
    });

    return row;
  }

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------

  _renderInspector() {
    const host = this.refs.inspector;
    if (!host) return;
    host.innerHTML = '';
    if (this.inspectorTab === 'world') {
      this._renderWorldInspector(host);
      return;
    }
    if (this.inspectorTab === 'ocean') {
      this._renderOceanInspector(host);
      return;
    }
    if (this.inspectorTab === 'ops') {
      this._renderOpsInspector(host);
      return;
    }
    this._renderLayerInspector(host);
  }

  _renderLayerInspector(host) {
    const layer = findLayer(this.doc, this.selectedLayerId);
    if (!layer) {
      host.appendChild(el('p', 'lm-empty', 'Select a layer in the outliner.'));
      return;
    }
    const spec = LANDSCAPE_LAYER_KINDS[layer.kind];
    const head = el('div', 'lm-inspector-head');
    head.appendChild(el('div', 'lm-inspector-title', layer.name));
    head.appendChild(el('div', 'lm-inspector-sub', `${spec.category} · ${spec.description}`));
    host.appendChild(head);

    host.appendChild(this._section('Layer', [
      this._textField('Name', layer.name, (value) => {
        layer.name = value || spec.label;
        this._renderOutliner();
      }),
      this._sliderField('Opacity', layer.opacity, 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`, (value) => {
        layer.opacity = value;
        touchDocument(this.doc);
        this.viewport.notifyDocumentChanged(null);
      }),
      this._toggleField('Visible', layer.visible, (value) => {
        layer.visible = value;
        touchDocument(this.doc);
        this.viewport.notifyDocumentChanged(null);
        this._renderOutliner();
      }),
      this._row('Order', [
        this._button('Move up', () => this._moveLayer(layer, -1)),
        this._button('Move down', () => this._moveLayer(layer, 1)),
        this._button('Delete', () => this._deleteLayer(layer), 'danger'),
      ]),
    ]));

    if (layer.kind === 'base') {
      const p = layer.params;
      host.appendChild(this._section('Planetary Base', [
        this._sliderField('Continent spacing', p.continentCellMeters, 120_000, 4_000_000, 10_000, (v) => formatDistance(v), (v) => {
          p.continentCellMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Land chance', p.continentChance, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.continentChance = v;
          this._applyBaseChange();
        }),
        this._sliderField('Craton radius', p.continentRadiusMeters, 60_000, 2_400_000, 10_000, (v) => formatDistance(v), (v) => {
          p.continentRadiusMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Continent relief', p.continentHeightMeters, 200, 6_000, 50, (v) => `${Math.round(v)} m`, (v) => {
          p.continentHeightMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Coast roughness', p.coastRoughness, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.coastRoughness = v;
          this._applyBaseChange();
        }),
        this._sliderField('Shelf width', p.shelfWidthMeters, 1_000, 240_000, 1_000, (v) => formatDistance(v), (v) => {
          p.shelfWidthMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Slope drop', p.shelfSlopeDepthMeters, 100, 3_000, 25, (v) => `${Math.round(v)} m`, (v) => {
          p.shelfSlopeDepthMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Abyssal depth', p.abyssalDepthMeters, 500, 10_000, 100, (v) => `${Math.round(v)} m`, (v) => {
          p.abyssalDepthMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Macro relief', p.macroRelief, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.macroRelief = v;
          this._applyBaseChange();
        }),
        this._sliderField('Mountain belts', p.orogeny, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.orogeny = v;
          this._applyBaseChange();
        }),
        this._sliderField('Belt cell size', p.orogenyCellMeters, 100_000, 3_000_000, 10_000, (v) => formatDistance(v), (v) => {
          p.orogenyCellMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Detail relief', p.detailRelief, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.detailRelief = v;
          this._applyBaseChange();
        }),
        this._sliderField('Detail scale', p.detailScaleMeters, 2_000, 120_000, 500, (v) => formatDistance(v), (v) => {
          p.detailScaleMeters = v;
          this._applyBaseChange();
        }),
        this._sliderField('Basin carving', p.basinCarving, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
          p.basinCarving = v;
          this._applyBaseChange();
        }),
        this._textField('Seed', String(p.seed), (value) => {
          p.seed = Math.round(Number(value) || 0) >>> 0;
          this._applyBaseChange();
        }, 'number'),
      ]));
    }

    if (layer.kind === 'landform' || layer.kind === 'sculpt') {
      const list = el('div', 'lm-op-list');
      if (!layer.ops.length) {
        list.appendChild(el('p', 'lm-empty', layer.kind === 'sculpt'
          ? 'Pick an SDF sculpt tool and drag on the landscape.'
          : 'Pick a landmass tool and click to stamp an island, canyon or strait.'));
      }
      for (const op of [...layer.ops].reverse().slice(0, 40)) {
        const row = el('div', 'lm-op-row');
        if (op.id === this.selectedOpId) row.classList.add('selected');
        row.appendChild(el('span', 'lm-op-glyph', op.type === 'stamp' ? '⬍' : '✎'));
        const label = op.type === 'stamp'
          ? `${op.kind} · ${formatDistance(op.radius)}`
          : `${op.tool} · ${formatDistance(op.radius)} · ${op.points.length} pts`;
        row.appendChild(el('span', 'lm-op-label', label));
        const remove = el('button', 'lm-op-remove', '×');
        remove.type = 'button';
        remove.title = 'Delete this operation';
        remove.addEventListener('click', (event) => {
          event.stopPropagation();
          removeOp(this.doc, layer.id, op.id);
          if (this.selectedOpId === op.id) this.selectedOpId = null;
          this.viewport.notifyDocumentChanged(null);
          this._renderInspector();
        });
        row.appendChild(remove);
        row.addEventListener('click', () => {
          this.selectedOpId = op.id;
          this._renderInspector();
        });
        list.appendChild(row);
      }
      host.appendChild(this._section('Operations', [list]));
      if (layer.ops.length) {
        host.appendChild(this._section('Bulk', [
          this._row(null, [
            this._button('Clear layer', () => {
              layer.ops.length = 0;
              touchDocument(this.doc);
              this.viewport.notifyDocumentChanged(null);
              this._renderInspector();
            }, 'danger'),
          ]),
        ]));
      }
    }
  }

  _moveLayer(layer, delta) {
    moveLayer(this.doc, layer.id, delta);
    touchDocument(this.doc);
    this.viewport.notifyDocumentChanged(null);
    this._renderOutliner();
    this._scheduleSave();
  }

  _deleteLayer(layer) {
    if (layer.kind === 'base') return;
    removeLayer(this.doc, layer.id);
    this.selectedLayerId = this.doc.layers[0]?.id || null;
    touchDocument(this.doc);
    this.viewport.setDocument(this.doc);
    this._renderOutliner();
    this._renderInspector();
    this._scheduleSave();
  }

  _applyBaseChange() {
    // Global field change: every resident tile is stale.
    touchDocument(this.doc);
    this.viewport.field = createLandscapeField(this.doc);
    this.viewport.scheduler.clear();
    this.viewport._queueOceanRefresh(260);
    this.viewport._terrainGroup.clear();
    this.viewport._tileGeometry.clear();
    this._scheduleSave();
  }

  _renderWorldInspector(host) {
    const stats = documentStats(this.doc);
    host.appendChild(this._section('World', [
      this._sliderField('Span', this.doc.world.spanMeters, WORLD_SIZE_MIN_METERS, WORLD_SIZE_MAX_METERS, 10_000, (v) => formatDistance(v), (v) => {
        this.doc.world.spanMeters = v;
        this.viewport.notifyDocumentChanged(null);
        this._renderHeaderStats();
      }),
      this._sliderField('Preview cell', this.doc.world.previewCellMeters, 1, 512, 1, (v) => `${Math.round(v)} m`, (v) => {
        this.doc.world.previewCellMeters = v;
        this.viewport.scheduler.clear();
      }),
      this._sliderField('Sculpt voxel', this.doc.world.sculptVoxelMeters, 0.25, 32, 0.25, (v) => `${v.toFixed(2)} m`, (v) => {
        this.doc.world.sculptVoxelMeters = v;
      }),
    ]));

    host.appendChild(this._section('Document', [
      this._readout('Layers', String(stats.layers)),
      this._readout('Landmass stamps', String(stats.stamps)),
      this._readout('Sculpt strokes', `${stats.strokes} (${stats.points} points)`),
      this._readout('Document size', formatBytes(stats.bytes)),
      this._readout('Mesh mode', this.doc.world.meshMode === 'sdf' ? 'Chunked SDF → mesh' : 'Analytic field → mesh'),
      el('p', 'lm-note', 'The document stores authored operations only. Terrain is derived, so a 3,000 km world is still a few KB of JSON — nothing is streamed from disk while you fly around.'),
    ]));
  }

  _renderOceanInspector(host) {
    const ocean = this.doc.ocean;
    host.appendChild(this._section('Ocean', [
      this._toggleField('Enabled', ocean.enabled, (value) => {
        ocean.enabled = value;
        this.viewport.setOceanVisible(value);
      }),
      this._sliderField('Sea level', ocean.seaLevel, -500, 500, 1, (v) => `${Math.round(v)} m`, (v) => {
        ocean.seaLevel = v;
        this.viewport._sharedTerrainUniforms.uSeaLevel.value = this.viewport._seaLevel();
        this.viewport._queueOceanRefresh(120);
      }),
      this._sliderField('Swell height', ocean.waveHeight, 0, 12, 0.05, (v) => `${v.toFixed(2)} m`, (v) => {
        ocean.waveHeight = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._sliderField('Swell wavelength', ocean.waveLength, 12, 900, 2, (v) => `${Math.round(v)} m`, (v) => {
        ocean.waveLength = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._sliderField('Swell direction', ocean.swellDirectionDeg, -180, 180, 1, (v) => `${Math.round(v)}°`, (v) => {
        ocean.swellDirectionDeg = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._sliderField('Foam / surf', ocean.foam, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
        ocean.foam = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._sliderField('Wave speed', ocean.speed, 0, 3, 0.05, (v) => `${v.toFixed(2)}×`, (v) => {
        ocean.speed = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._sliderField('Clarity', ocean.clarity, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => {
        ocean.clarity = v;
        this.viewport._queueOceanRefresh(260);
      }),
      this._readout('Near domain', `${formatDistance(this.viewport.oceanSpan)} · ${this.viewport.oceanSim?.resolution || 0}² cells`),
      this._readout('Far ocean', 'analytic swell shell to 900 km'),
      el('p', 'lm-note', 'The near domain follows the camera and is re-seeded from the analytic bed, so surf only ever exists where the simulation is actually running — it never smears across the whole planet.'),
    ]));
    // Stats readout lives in HUD (index.html); no duplicate element here.
  }

  _renderOpsInspector(host) {
    const layer = this.doc.layers.find((entry) => entry.id === this.selectedLayerId);
    const op = layer?.ops.find((entry) => entry.id === this.selectedOpId);
    if (!op) {
      host.appendChild(el('p', 'lm-empty', 'Select a stamp or stroke in the layer inspector.'));
      return;
    }
    host.appendChild(el('div', 'lm-inspector-head', op.type === 'stamp' ? `${op.kind} stamp` : `${op.tool} stroke`));
    if (op.type === 'stamp') {
      host.appendChild(this._section('Position', [
        this._sliderField('X', op.x, -2_000_000, 2_000_000, 10, (v) => formatDistance(v), (v) => this._editOp(op, () => { op.x = v; })),
        this._sliderField('Z', op.z, -2_000_000, 2_000_000, 10, (v) => formatDistance(v), (v) => this._editOp(op, () => { op.z = v; })),
        this._sliderField('Radius', op.radius, 50, 1_500_000, 10, (v) => formatDistance(v), (v) => this._editOp(op, () => { op.radius = v; })),
        this._sliderField('Height', op.height, 5, 8_000, 5, (v) => `${Math.round(v)} m`, (v) => this._editOp(op, () => { op.height = v; })),
        this._sliderField('Rotation', (op.angle * 180) / Math.PI, -180, 180, 1, (v) => `${Math.round(v)}°`, (v) => this._editOp(op, () => { op.angle = (v * Math.PI) / 180; })),
        this._sliderField('Stretch', op.stretch, 0.3, 4, 0.02, (v) => `${v.toFixed(2)}×`, (v) => this._editOp(op, () => { op.stretch = v; })),
        this._sliderField('Sharpness', op.sharpness, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => this._editOp(op, () => { op.sharpness = v; })),
        this._sliderField('Roughness', op.roughness, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => this._editOp(op, () => { op.roughness = v; })),
        this._toggleField('Carve (negative)', op.negative, (v) => this._editOp(op, () => { op.negative = v; })),
      ]));
    } else {
      host.appendChild(this._section('Stroke', [
        this._sliderField('Radius', op.radius, 10, 100_000, 5, (v) => formatDistance(v), (v) => this._editOp(op, () => { op.radius = v; })),
        this._sliderField('Strength', op.strength, 0.01, 3, 0.01, (v) => `${v.toFixed(2)}×`, (v) => this._editOp(op, () => { op.strength = v; })),
        this._readout('Tool', op.tool),
        this._readout('Points', String(op.points.length)),
      ]));
    }
  }

  _editOp(op, mutate) {
    mutate();
    if (op.type === 'stamp') {
      const scale = op.radius * 3.2;
      op.bounds = {
        minX: op.x - scale * op.stretch * 1.6,
        maxX: op.x + scale * op.stretch * 1.6,
        minZ: op.z - scale * 1.6,
        maxZ: op.z + scale * 1.6,
      };
    }
    touchDocument(this.doc);
    this.viewport.notifyDocumentChanged(op.bounds || null);
  }

  // -------------------------------------------------------------------------
  // Inspector primitives
  // -------------------------------------------------------------------------

  _section(title, children) {
    const section = el('section', 'lm-panel-section');
    if (title) section.appendChild(el('div', 'lm-section-header', title));
    for (const child of children) if (child) section.appendChild(child);
    return section;
  }

  _row(label, children) {
    const row = el('div', 'lm-row');
    if (label) row.appendChild(el('span', 'lm-row-label', label));
    const group = el('div', 'lm-row-actions');
    for (const child of children) group.appendChild(child);
    row.appendChild(group);
    return row;
  }

  _readout(label, value) {
    const row = el('div', 'lm-readout-row');
    row.appendChild(el('span', 'lm-readout-label', label));
    row.appendChild(el('span', 'lm-readout-value', value));
    return row;
  }

  _button(label, onClick, variant = '') {
    const button = el('button', `lm-inline-btn ${variant}`.trim(), label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  _toggleField(label, value, onChange) {
    const row = el('label', 'lm-toggle-row');
    row.appendChild(el('span', null, label));
    const input = el('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);
    return row;
  }

  _textField(label, value, onChange, type = 'text') {
    const row = el('label', 'lm-text-row');
    row.appendChild(el('span', null, label));
    const input = el('input');
    input.type = type;
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(input);
    return row;
  }

  _sliderField(label, value, min, max, step, format, onChange) {
    const wrap = el('div', 'lm-slider-field');
    const row = el('div', 'lm-slider-label');
    row.appendChild(el('span', null, label));
    const out = el('output', null, format(value));
    row.appendChild(out);
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    let pending = null;
    input.addEventListener('input', () => {
      const next = Number(input.value);
      out.textContent = format(next);
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        pending = null;
        onChange(next);
      });
    });
    wrap.appendChild(row);
    wrap.appendChild(input);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Header / readouts
  // -------------------------------------------------------------------------

  _renderHeaderStats() {
    const stats = documentStats(this.doc);
    const refs = this.refs;
    if (refs.docTitle) refs.docTitle.textContent = this.doc.name;
    if (refs.docSize) refs.docSize.textContent = `${formatBytes(stats.bytes)} doc · ${formatDistance(this.doc.world.spanMeters)} span`;
    if (refs.landFraction) {
      refs.landFraction.textContent = this.active ? `${Math.round(this.viewport.stats.landFraction * 100)}% land` : '';
    }
    if (refs.opCount) refs.opCount.textContent = `${stats.stamps + stats.strokes} ops`;
  }

  _restoreViewSettings() {
    if (this.refs.wireframeToggle) this.refs.wireframeToggle.checked = false;
    if (this.refs.oceanToggle) this.refs.oceanToggle.checked = this.doc.ocean.enabled;
    this.viewport.setSun(128, 34);
    const readout = this.refs.worldReadout || byId('lm-world-readout');
    if (readout) readout.textContent = `${formatDistance(this.doc.world.spanMeters)} across`;
  }

  // -------------------------------------------------------------------------
  // Import / export
  // -------------------------------------------------------------------------

  _exportDocument() {
    const text = serializeLandscapeDocumentText(this.doc);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.doc.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'landscape'}.landscape.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  _importDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = deserializeLandscapeDocument(String(reader.result));
        this.doc = next;
        this.selectedLayerId = next.layers[0]?.id || null;
        this.selectedOpId = null;
        this.viewport.setDocument(this.doc);
        this._renderOutliner();
        this._renderInspector();
        this._renderHeaderStats();
        this._scheduleSave();
      } catch (error) {
        console.error('Landscape import failed', error);
        window.alert('That file is not a valid Frontier landscape document.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  /**
   * Mesh export. Two honest modes:
   *   - Region mesh (default): the authored field sampled over the current view
   *     into a watertight tile grid, written as OBJ.
   *   - Chunk SDF: hands the chunk to the engine's own brick-sparse dual
   *     contouring so caves/overhangs authored later come out as real geometry.
   * Both are bounded by an explicit triangle budget so export cannot hang a
   * browser tab on a continent.
   */
  _exportMesh() {
    const budget = 400_000;
    const focused = this.viewport.focus;
    const span = Math.min(this.doc.world.spanMeters, this.viewport.viewDistance * 2.2);
    const cells = Math.max(32, Math.min(384, Math.round(Math.sqrt(budget / 2))));
    const step = span / cells;
    const originX = focused.x - span * 0.5;
    const originZ = focused.y - span * 0.5;

    const lines = ['# Frontier Landscape Studio export', `# ${formatDistance(span)} region · ${cells}×${cells} cells · ${step.toFixed(2)} m step`];
    const nx = cells + 1;
    const positions = new Float32Array(nx * nx * 3);
    for (let iz = 0; iz < nx; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = originX + ix * step;
        const z = originZ + iz * step;
        const index = iz * nx + ix;
        positions[index * 3] = x;
        positions[index * 3 + 1] = this.viewport.field.elevationAt(x, z, step);
        positions[index * 3 + 2] = z;
      }
    }

    for (let i = 0; i < positions.length; i += 3) {
      lines.push(`v ${positions[i].toFixed(3)} ${positions[i + 1].toFixed(3)} ${positions[i + 2].toFixed(3)}`);
    }
    for (let iz = 0; iz < nx; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        lines.push(`vt ${(ix / cells).toFixed(5)} ${(iz / cells).toFixed(5)}`);
      }
    }
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const a = iz * nx + ix + 1;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        lines.push(`f ${a}/${a} ${c}/${c} ${b}/${b}`);
        lines.push(`f ${b}/${b} ${c}/${c} ${d}/${d}`);
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.doc.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'landscape'}-region.obj`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  _resetDocument() {
    if (this.doc.layers.some((layer) => layer.ops.length) && !window.confirm?.('Discard the authored landmasses and start a new planet?')) {
      return;
    }
    this.doc = createLandscapeDocument({ name: 'Untitled Planet', spanMeters: this.doc.world.spanMeters });
    this.selectedLayerId = this.doc.layers[0]?.id || null;
    this.selectedOpId = null;
    this.viewport.setDocument(this.doc);
    this._renderOutliner();
    this._renderInspector();
    this._renderHeaderStats();
    this._scheduleSave();
  }
}
