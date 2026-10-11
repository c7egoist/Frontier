// ============================================================================================================================================
//                                                                 MAIN.JS
// ============================================================================================================================================
// Application controller for the Frontier AAA WebGPU Procedural Road & Urban Network Generator.
// Connects:
//   - Left Dock: Outliner, Telemetry Stats (Quads, Tris, Merged Junctions, AI Cars <= 25, FPS), Quick Actions
//   - Center Dock: Preset Document Tabs, WebGPU 3D Viewport + Optional 2D Plan Split, Interactive 3D Junction Gizmo & Curve Drawing
//   - Right Dock: Inspector (Top) + Dual LayerStack (Road Generation Stack L1-L10 & Texture/PBR Stack T1-T8)

import {
  clamp,
  vAdd,
  vScale,
  vDistXZ,
  screenToWorldRay,
  alongAxisUnderRay,
  touchPlaneUnderRay,
  pointSegXZ,
} from './math.js';
import {
  CURB_PROFILES,
  PAVING_PATTERNS,
  GUARDRAIL_DESIGNS,
  BOLLARD_DESIGNS,
  STREETLIGHT_DESIGNS,
  BILLBOARD_DESIGNS,
  createPresetProject,
  MAX_AI_VEHICLES,
} from './model.js';
import { buildCompleteRoadNetwork, exportNetworkQuadOBJ } from './network.js';
import { buildTrafficSimulation, stepAndEmitDynamicActors } from './traffic.js';
import { RoadViewportRenderer } from './webgpuRenderer.js';
import {
  drawViewportOverlay,
  moveMergedJunction,
  getSelectedGizmoOrigin,
  hitTest3DGizmo,
} from './viewportOverlay.js';

const EYE_OPEN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const CARET_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="6 9 12 15 18 9"/></svg>`;

export class FrontierRoadApp {
  constructor() {
    this.project = createPresetProject('metropolis');
    this.project.junctionOverrides = {};
    this.builtNetwork = null;
    this.trafficSim = null;

    // Camera spherical orbit state
    this.camera = {
      target: [0, 0, 0],
      yaw: 0.68,
      pitch: 0.56,
      distance: 155,
      eye: [95, 85, 115],
    };
    this.updateCameraEye();

    // 2D Plan Camera state (when Split View is active)
    this.planCamera = {
      panX: 0,
      panZ: 0,
      zoom: 1.85,
    };

    // UI & Tool State
    this.tool = 'select'; // 'select' | 'draw' | 'insert'
    this.selection = null; // { kind: 'junction' | 'spline' | 'node', id: string }
    this.hoveredJunctionId = null;
    this.activeGizmoPart = null;
    this.draggingGizmo = null;
    this.draggingCamera = null;
    this.draggingPlan = null;

    // Curve Drawing State
    this.activeDrawSplineId = null;
    this.drawHoverWorld = null;
    this.drawSnapTarget = null;

    // Viewport Display Flags (renderMode: 0=PBR, 1=PBR+QuadWire, 2=PureQuadCage, 3=TriWire, 4=Clay, 5=MaskHeatmap)
    this.renderMode = 0;
    this.splitView = false;
    this.cutawayUnderground = false;
    this.simulationPlaying = true;
    this.followActor = ''; // '' | 'car' | 'train' | 'subway' | 'robot'
    this.simTime = 0;

    // Right Dock LayerStack tab mode: 'road' | 'texture' | 'both'
    this.activeStackTab = 'both';
    this.inspectorCollapsed = false;
    this.soloLayerId = null;

    // FPS tracking
    this.fps = 60;
    this._frameCount = 0;
    this._lastFpsStamp = performance.now();
    this._lastFrameTime = performance.now();
  }

  updateCameraEye() {
    const cosP = Math.cos(this.camera.pitch);
    const sinP = Math.sin(this.camera.pitch);
    const sinY = Math.sin(this.camera.yaw);
    const cosY = Math.cos(this.camera.yaw);
    this.camera.eye = [
      this.camera.target[0] + this.camera.distance * cosP * sinY,
      this.camera.target[1] + this.camera.distance * sinP,
      this.camera.target[2] + this.camera.distance * cosP * cosY,
    ];
  }

  async init() {
    this.gpuCanvas = document.getElementById('gpu-canvas');
    this.overlayCanvas = document.getElementById('overlay-canvas');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    this.renderer = new RoadViewportRenderer(this.gpuCanvas);
    await this.renderer.init();

    const gpuBadge = document.getElementById('badge-gpu');
    if (gpuBadge) {
      gpuBadge.textContent =
        this.renderer.backend === 'webgpu' ? 'WebGPU Native WGSL' : 'WebGL2 PBR Fallback';
    }

    // Build initial road network & select primary merged intersection so the 3D gizmo is immediately visible
    this.rebuildNetwork(true);
    if (this.builtNetwork?.builtJunctions?.length > 0) {
      this.selection = { kind: 'junction', id: this.builtNetwork.builtJunctions[0].id };
    }

    this.bindUIEvents();
    this.bindViewportEvents();
    this.renderAllPanels();

    requestAnimationFrame((t) => this.frameLoop(t));
  }

  rebuildNetwork(rebuildTraffic = true) {
    if (!this.project.junctionOverrides) this.project.junctionOverrides = {};

    // Sync subsurface cutaway option into L7 ('layer-rail-tunnel')
    const lRail = this.project.roadLayers.find((l) => l.id === 'layer-rail-tunnel');
    if (lRail) {
      lRail.params.subwayCutaway = this.cutawayUnderground;
    }

    this.builtNetwork = buildCompleteRoadNetwork(this.project);
    this.renderer.uploadStaticBuffers(this.builtNetwork.staticBuffers);

    if (rebuildTraffic || !this.trafficSim) {
      this.trafficSim = buildTrafficSimulation(this.builtNetwork, this.project);
    }

    this.updateStatsDOM();
  }

  updateStatsDOM() {
    if (!this.builtNetwork) return;
    const st = this.builtNetwork.stats;
    const setEl = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    const quadTriCount = st.quadCount * 2;
    const quadPct =
      st.triangleCount > 0 ? Math.min(100, Math.round((quadTriCount / st.triangleCount) * 100)) : 100;

    setEl('stat-quads', st.quadCount.toLocaleString());
    setEl('stat-tris', `${st.triangleCount.toLocaleString()} (${quadPct}%)`);
    setEl('stat-junctions', `${st.junctionCount} Merged`);
    setEl('stat-blocks', `${st.blockCount} Parcels`);
    const vCount =
      (this.trafficSim?.vehicles?.length ?? 0) + (this.trafficSim?.parkedVehicles?.length ?? 0);
    setEl('stat-vehicles', `${Math.min(MAX_AI_VEHICLES, vCount)} / ${MAX_AI_VEHICLES}`);
    setEl('badge-quads', `${quadPct}% Quads · ${st.junctionCount} Merged Junctions`);
    setEl('badge-traffic', `AI Traffic: ${Math.min(MAX_AI_VEHICLES, vCount)}/${MAX_AI_VEHICLES}`);
  }

  getSelectedEntityId() {
    if (!this.selection || !this.builtNetwork) return 0;
    if (this.selection.kind === 'junction') {
      const jn = this.builtNetwork.builtJunctions.find((j) => j.id === this.selection.id);
      return jn ? jn.entityId : 0;
    }
    if (this.selection.kind === 'spline') {
      const run = this.builtNetwork.builtRuns.find((r) => r.run.spline.id === this.selection.id);
      return run ? run.entityId : 0;
    }
    return 0;
  }

  getHoveredEntityId() {
    if (!this.hoveredJunctionId || !this.builtNetwork) return 0;
    const jn = this.builtNetwork.builtJunctions.find((j) => j.id === this.hoveredJunctionId);
    return jn ? jn.entityId : 0;
  }

  // ==========================================================================================================================================
  //                                                    RENDER LEFT OUTLINER & RIGHT PANELS
  // ==========================================================================================================================================
  renderAllPanels() {
    this.renderPresetTabs();
    this.renderToolbarState();
    this.renderOutliner();
    this.renderInspector();
    this.renderLayerStack();
  }

  renderPresetTabs() {
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === this.project.presetId);
    });
  }

  renderToolbarState() {
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === this.tool);
    });
    const modeSel = document.getElementById('sel-render-mode');
    if (modeSel) modeSel.value = String(this.renderMode);
    const followSel = document.getElementById('sel-follow-actor');
    if (followSel) followSel.value = this.followActor;
    const splitBtn = document.getElementById('btn-split-view');
    if (splitBtn) splitBtn.classList.toggle('active', this.splitView);
    const cutBtn = document.getElementById('btn-cutaway');
    if (cutBtn) cutBtn.classList.toggle('active', this.cutawayUnderground);
    const simBtn = document.getElementById('btn-sim-toggle');
    if (simBtn) {
      simBtn.classList.toggle('active', this.simulationPlaying);
      simBtn.innerHTML = this.simulationPlaying
        ? `<span>AI Traffic Live</span><span class="kbd">Space</span>`
        : `<span>AI Traffic Paused</span><span class="kbd">Space</span>`;
    }

    const hudHint = document.getElementById('hud-hint-text');
    if (hudHint) {
      if (this.followActor) {
        hudHint.innerHTML = `<strong>Ride-Along Camera Active (${this.followActor.toUpperCase()}):</strong> Experiencing the procedural network in 3D. Select <strong>Cam: Free Orbit</strong> or press <strong>Esc</strong> to return to editing.`;
      } else if (this.tool === 'draw') {
        hudHint.innerHTML = `<strong>Curve Draw Mode (P):</strong> Click in 3D or 2D Plan to place spline points. Touch or cross any road to auto-merge into a single <strong>Y / T / + Quad Intersection</strong>. Press <strong>Enter</strong> or <strong>Esc</strong> to finish spline.`;
      } else if (this.tool === 'insert') {
        hudHint.innerHTML = `<strong>Insert / Split Mode (I):</strong> Click near any road curve to insert a new spline control vertex.`;
      } else {
        hudHint.innerHTML = `<strong>Select &amp; Gizmo Mode (V):</strong> Click any <strong>Merged Intersection (+ / Y / T)</strong> badge or gizmo axis to move the entire intersection at once, or drag its cyan <strong>Fillet Ring (R)</strong>.`;
      }
    }
  }

  getSplineProfileBadge(sp) {
    if (sp.bridge?.enabled) return sp.bridge.type || 'bridge';
    if (sp.tunnel?.enabled) return 'tunnel';
    if (sp.construction?.enabled) return 'roadwork';
    return 'ground';
  }

  renderOutliner() {
    const container = document.getElementById('outliner-list');
    if (!container || !this.builtNetwork) return;

    let html = '';

    // 1. Merged Intersections Group
    const junctions = this.builtNetwork.builtJunctions || [];
    html += `<div class="outliner-group-title"><span>Merged Intersections (${junctions.length})</span><span>1-Mesh Coons</span></div>`;
    for (const jn of junctions) {
      const isSel = this.selection?.kind === 'junction' && this.selection?.id === jn.id;
      html += `
        <div class="outliner-row ${isSel ? 'selected' : ''}" data-select-kind="junction" data-select-id="${jn.id}">
          <span class="outliner-icon">✚</span>
          <span class="outliner-name">${jn.id.toUpperCase()} (${jn.topologyShape})</span>
          <span class="outliner-tag junction">${jn.armCount}-Arm · R${(jn.cornerRadius ?? 6.5).toFixed(0)}m</span>
        </div>
      `;
    }

    // 2. Road Curve Splines Group
    const splines = (this.project.splines || []).filter(
      (s) => s.kind !== 'railway' && s.kind !== 'subway'
    );
    html += `<div class="outliner-group-title"><span>Road Curve Splines (${splines.length})</span><span>Catmull/Bezier</span></div>`;
    for (const sp of splines) {
      const isSel = this.selection?.kind === 'spline' && this.selection?.id === sp.id;
      const prof = this.getSplineProfileBadge(sp);
      const badgeClass = sp.bridge?.enabled ? 'bridge' : '';
      html += `
        <div class="outliner-row ${isSel ? 'selected' : ''}" data-select-kind="spline" data-select-id="${sp.id}">
          <span class="outliner-icon">∿</span>
          <span class="outliner-name">${sp.name}</span>
          <span class="outliner-tag ${badgeClass}">${sp.lanes || 2}L · ${prof}</span>
        </div>
      `;
    }

    // 3. Urban Infrastructure & Transit Entities
    html += `<div class="outliner-group-title"><span>Transit, Blocks &amp; AI Actors</span><span>LayerStack</span></div>`;
    const infraItems = [
      {
        label: `City Block Parcels (${this.builtNetwork.cityBlocks.length})`,
        tag: 'No Buildings',
        layerId: 'layer-paving',
      },
      {
        label: `Bridges & Interchanges`,
        tag: 'Box / Arch / Cable',
        layerId: 'layer-bridges',
      },
      {
        label: `Railways, Underpass & Subway`,
        tag: `${this.builtNetwork.railways.length} Rail / ${this.builtNetwork.subways.length} Metro`,
        layerId: 'layer-rail-tunnel',
      },
      { label: `Guardrails & Bollards`, tag: '6 Designs', layerId: 'layer-barriers' },
      {
        label: `Parking, Lamps, Billboards & Robots`,
        tag: 'Urban Props',
        layerId: 'layer-furniture',
      },
      { label: `AI Traffic (≤ ${MAX_AI_VEHICLES} Cars)`, tag: 'Lane AI', layerId: 'layer-traffic' },
    ];
    for (const item of infraItems) {
      const layer = this.project.roadLayers.find((l) => l.id === item.layerId);
      const enabled = layer ? layer.visible : true;
      html += `
        <div class="outliner-row" data-focus-layer="${item.layerId}">
          <span class="outliner-icon">${enabled ? '●' : '○'}</span>
          <span class="outliner-name">${item.label}</span>
          <span class="outliner-tag">${item.tag}</span>
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind click listeners
    container.querySelectorAll('[data-select-kind]').forEach((row) => {
      row.addEventListener('click', () => {
        this.selection = {
          kind: row.dataset.selectKind,
          id: row.dataset.selectId,
        };
        this.renderOutliner();
        this.renderInspector();
      });
    });

    container.querySelectorAll('[data-focus-layer]').forEach((row) => {
      row.addEventListener('click', () => {
        const lid = row.dataset.focusLayer;
        const layer = this.project.roadLayers.find((l) => l.id === lid);
        if (layer) {
          layer.expanded = true;
          this.activeStackTab = 'road';
          this.renderLayerStack();
        }
      });
    });
  }

  // ==========================================================================================================================================
  //                                                    RENDER RIGHT-SIDE INSPECTOR PANEL
  // ==========================================================================================================================================
  renderInspector() {
    const pane = document.getElementById('inspector-pane');
    const body = document.getElementById('inspector-body');
    const badge = document.getElementById('inspector-badge');
    if (!pane || !body) return;

    pane.classList.toggle('collapsed', this.inspectorCollapsed);
    if (this.inspectorCollapsed) return;

    // 1. Selected Merged Intersection ('junction')
    if (this.selection?.kind === 'junction') {
      const jn = (this.builtNetwork?.builtJunctions || []).find((j) => j.id === this.selection.id);
      if (jn) {
        if (badge) badge.textContent = `${jn.topologyShape} · ${jn.armCount} Arms`;
        const lJunc = this.project.roadLayers.find((l) => l.id === 'layer-junctions');
        const ov = this.project.junctionOverrides?.[jn.id] || {};
        const cRadius = ov.cornerRadius ?? jn.cornerRadius ?? lJunc?.params?.cornerRadius ?? 6.5;
        const fSteps = ov.filletSteps ?? jn.filletSteps ?? lJunc?.params?.filletSteps ?? 10;

        body.innerHTML = `
          <div class="inspector-card">
            <div class="inspector-card-title">
              <span>Merged Intersection Gizmo (${jn.id.toUpperCase()})</span>
              <span style="color:var(--accent-amber)">1 Watertight Mesh</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Center XYZ (m)</span>
              <div class="prop-control">
                <div class="xyz-grid">
                  <div class="xyz-pill"><span class="x">X</span><input type="number" step="0.5" id="jn-pos-x" value="${jn.center[0].toFixed(1)}"></div>
                  <div class="xyz-pill"><span class="y">Y</span><input type="number" step="0.5" id="jn-pos-y" value="${jn.center[1].toFixed(1)}"></div>
                  <div class="xyz-pill"><span class="z">Z</span><input type="number" step="0.5" id="jn-pos-z" value="${jn.center[2].toFixed(1)}"></div>
                </div>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Fillet Radius (R)</span>
              <div class="prop-control slider-combo">
                <input type="range" min="3.0" max="18.0" step="0.5" id="jn-fillet" value="${cRadius}">
                <span class="pill"><span class="pill-text">${cRadius.toFixed(1)}m</span></span>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Coons Subdivs</span>
              <div class="prop-control slider-combo">
                <input type="range" min="6" max="18" step="2" id="jn-steps" value="${fSteps}">
                <span class="pill"><span class="pill-text">${fSteps}×${fSteps}</span></span>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Features</span>
              <div class="prop-control" style="justify-content:space-between; font-size:10.5px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="jn-crosswalks" ${lJunc?.params?.crosswalks !== false ? 'checked' : ''}> Crosswalks
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="jn-signals" ${lJunc?.params?.trafficSignals !== false ? 'checked' : ''}> Signal Masts
                </label>
              </div>
            </div>
          </div>
        `;

        const onMoveInput = () => {
          const nx = parseFloat(document.getElementById('jn-pos-x')?.value) || 0;
          const ny = parseFloat(document.getElementById('jn-pos-y')?.value) || 0;
          const nz = parseFloat(document.getElementById('jn-pos-z')?.value) || 0;
          moveMergedJunction(this.project, jn, [nx, ny, nz]);
          this.rebuildNetwork(true);
          this.renderInspector();
        };
        ['jn-pos-x', 'jn-pos-y', 'jn-pos-z'].forEach((id) => {
          document.getElementById(id)?.addEventListener('change', onMoveInput);
        });
        document.getElementById('jn-fillet')?.addEventListener('input', (e) => {
          const rVal = parseFloat(e.target.value);
          if (!this.project.junctionOverrides[jn.id]) this.project.junctionOverrides[jn.id] = {};
          this.project.junctionOverrides[jn.id].cornerRadius = rVal;
          this.rebuildNetwork(false);
          this.renderInspector();
          this.renderOutliner();
        });
        document.getElementById('jn-steps')?.addEventListener('input', (e) => {
          const sVal = parseInt(e.target.value, 10);
          if (!this.project.junctionOverrides[jn.id]) this.project.junctionOverrides[jn.id] = {};
          this.project.junctionOverrides[jn.id].filletSteps = sVal;
          this.rebuildNetwork(false);
          this.renderInspector();
        });
        document.getElementById('jn-crosswalks')?.addEventListener('change', (e) => {
          if (lJunc) lJunc.params.crosswalks = e.target.checked;
          this.rebuildNetwork(false);
          this.renderLayerStack();
        });
        document.getElementById('jn-signals')?.addEventListener('change', (e) => {
          if (lJunc) lJunc.params.trafficSignals = e.target.checked;
          this.rebuildNetwork(false);
          this.renderLayerStack();
        });
        return;
      }
    }

    // 2. Selected Road Curve Spline ('spline')
    if (this.selection?.kind === 'spline') {
      const sp = (this.project.splines || []).find((s) => s.id === this.selection.id);
      if (sp) {
        if (badge) badge.textContent = `Spline · ${sp.nodes.length} Pts`;
        const curMode = sp.bridge?.enabled
          ? `bridge-${sp.bridge.type || 'box-girder'}`
          : sp.tunnel?.enabled
          ? 'tunnel'
          : 'ground';
        const curParking = sp.parking || 'none';
        const potholeCnt = (sp.potholes || []).length;
        const bumpCnt = (sp.speedBumps || []).length;

        body.innerHTML = `
          <div class="inspector-card">
            <div class="inspector-card-title">
              <span>${sp.name}</span>
              <button class="btn-action" id="btn-del-spline" style="height:20px; padding:0 6px; font-size:10px; color:#e05252;">Delete</button>
            </div>
            <div class="prop-row">
              <span class="prop-label">Lanes &amp; Width</span>
              <div class="prop-control slider-combo">
                <input type="range" min="1" max="6" step="1" id="sp-lanes" value="${sp.lanes || 2}">
                <span class="pill"><span class="pill-text">${sp.lanes || 2}L (${(sp.width || 10).toFixed(1)}m)</span></span>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Structure Mode</span>
              <div class="prop-control">
                <select class="select-drop" id="sp-struct">
                  <option value="ground" ${curMode === 'ground' ? 'selected' : ''}>Ground Road (Auto-Merge)</option>
                  <option value="bridge-box-girder" ${curMode === 'bridge-box-girder' ? 'selected' : ''}>Bridge: Box-Girder Overpass</option>
                  <option value="bridge-cable-stayed" ${curMode === 'bridge-cable-stayed' ? 'selected' : ''}>Bridge: Cable-Stayed Pylon</option>
                  <option value="bridge-arch" ${curMode === 'bridge-arch' ? 'selected' : ''}>Bridge: Tied Thru-Arch</option>
                  <option value="tunnel" ${curMode === 'tunnel' ? 'selected' : ''}>Underground Bored Tunnel</option>
                </select>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Curb &amp; Paving</span>
              <div class="prop-control">
                <select class="select-drop" id="sp-curb">
                  ${CURB_PROFILES.map((c) => `<option value="${c.id}" ${sp.curbProfile === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
                <select class="select-drop" id="sp-paving">
                  ${PAVING_PATTERNS.map((p) => `<option value="${p.id}" ${sp.pavingPattern === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Barrier &amp; Bollard</span>
              <div class="prop-control">
                <select class="select-drop" id="sp-guardrail">
                  ${GUARDRAIL_DESIGNS.map((g) => `<option value="${g.id}" ${sp.guardrailDesign === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
                </select>
                <select class="select-drop" id="sp-bollard">
                  ${BOLLARD_DESIGNS.map((b) => `<option value="${b.id}" ${sp.bollardDesign === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Parking &amp; Work</span>
              <div class="prop-control" style="justify-content:space-between; font-size:10.5px;">
                <select class="select-drop" id="sp-parking" style="width:54%;">
                  <option value="none" ${curParking === 'none' ? 'selected' : ''}>No Parking</option>
                  <option value="parallel" ${curParking === 'parallel' ? 'selected' : ''}>Parallel Parking</option>
                  <option value="angled" ${curParking === 'angled' ? 'selected' : ''}>45° Angled Bays</option>
                </select>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="sp-construct" ${sp.construction?.enabled ? 'checked' : ''}> Roadwork
                </label>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">3D Distress (${potholeCnt}P/${bumpCnt}B)</span>
              <div class="prop-control">
                <button class="btn-action" id="btn-add-pothole" style="flex:1;height:21px;font-size:10px;">+ Pothole</button>
                <button class="btn-action" id="btn-add-bump" style="flex:1;height:21px;font-size:10px;">+ Bump</button>
                <button class="btn-action" id="btn-clear-distress" style="height:21px;padding:0 6px;font-size:10px;">Clear</button>
              </div>
            </div>
          </div>
        `;

        document.getElementById('sp-lanes')?.addEventListener('input', (e) => {
          sp.lanes = parseInt(e.target.value, 10);
          sp.width = sp.lanes * 3.6 + 2.4;
          this.rebuildNetwork(true);
          this.renderInspector();
          this.renderOutliner();
        });
        document.getElementById('sp-struct')?.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v.startsWith('bridge-')) {
            const bType = v.replace('bridge-', '');
            sp.bridge = { enabled: true, type: bType, startT: 0.2, endT: 0.8, pierSpacing: 22 };
            sp.tunnel = { enabled: false };
            for (let i = 1; i < sp.nodes.length - 1; i++) {
              if (sp.nodes[i].position[1] < 4.5) sp.nodes[i].position[1] = 6.5;
            }
          } else if (v === 'tunnel') {
            sp.bridge = { enabled: false };
            sp.tunnel = { enabled: true, startS: 0.2, endS: 0.8 };
          } else {
            sp.bridge = { enabled: false };
            sp.tunnel = { enabled: false };
            for (let i = 0; i < sp.nodes.length; i++) {
              sp.nodes[i].position[1] = 0;
            }
          }
          this.rebuildNetwork(true);
          this.renderOutliner();
        });
        document.getElementById('sp-curb')?.addEventListener('change', (e) => {
          sp.curbProfile = e.target.value;
          this.rebuildNetwork(false);
        });
        document.getElementById('sp-paving')?.addEventListener('change', (e) => {
          sp.pavingPattern = e.target.value;
          this.rebuildNetwork(false);
        });
        document.getElementById('sp-guardrail')?.addEventListener('change', (e) => {
          sp.guardrailDesign = e.target.value;
          this.rebuildNetwork(false);
        });
        document.getElementById('sp-bollard')?.addEventListener('change', (e) => {
          sp.bollardDesign = e.target.value;
          this.rebuildNetwork(false);
        });
        document.getElementById('sp-parking')?.addEventListener('change', (e) => {
          sp.parking = e.target.value;
          this.rebuildNetwork(true);
        });
        document.getElementById('sp-construct')?.addEventListener('change', (e) => {
          sp.construction = e.target.checked
            ? { enabled: true, startS: 0.3, endS: 0.7, side: 'right' }
            : { enabled: false };
          this.rebuildNetwork(false);
          this.renderOutliner();
        });
        document.getElementById('btn-add-pothole')?.addEventListener('click', () => {
          if (!sp.potholes) sp.potholes = [];
          const nextS = 0.2 + ((sp.potholes.length * 0.23) % 0.6);
          const nextOff = (sp.potholes.length % 2 === 0 ? 1 : -1) * 1.4;
          sp.potholes.push({ s: nextS, offset: nextOff, radius: 1.15, depth: 0.11 });
          this.rebuildNetwork(false);
          this.renderInspector();
        });
        document.getElementById('btn-add-bump')?.addEventListener('click', () => {
          if (!sp.speedBumps) sp.speedBumps = [];
          const nextS = 0.22 + ((sp.speedBumps.length * 0.27) % 0.56);
          sp.speedBumps.push(nextS);
          this.rebuildNetwork(false);
          this.renderInspector();
        });
        document.getElementById('btn-clear-distress')?.addEventListener('click', () => {
          sp.potholes = [];
          sp.speedBumps = [];
          this.rebuildNetwork(false);
          this.renderInspector();
        });
        document.getElementById('btn-del-spline')?.addEventListener('click', () => {
          if (this.project.splines.length <= 1) return;
          this.project.splines = this.project.splines.filter((s) => s.id !== sp.id);
          this.selection = null;
          this.rebuildNetwork(true);
          this.renderAllPanels();
        });
        return;
      }
    }

    // 3. Default Inspector: Global Environment, Sun & AI Traffic Cap (<= 25)
    if (badge) badge.textContent = 'Scene & AI Traffic';
    const lTraffic = this.project.roadLayers.find((l) => l.id === 'layer-traffic');
    const env = this.project.environment;
    body.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-card-title">
          <span>Environment &amp; AI Traffic Cap</span>
          <span style="color:var(--accent-cyan)">Max ${MAX_AI_VEHICLES} Cars</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">AI Vehicles (≤25)</span>
          <div class="prop-control slider-combo">
            <input type="range" min="0" max="25" step="1" id="env-vehicles" value="${lTraffic?.params?.vehicleCount ?? 18}">
            <span class="pill"><span class="pill-text">${lTraffic?.params?.vehicleCount ?? 18} / 25</span></span>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Sun Azimuth</span>
          <div class="prop-control slider-combo">
            <input type="range" min="-180" max="180" step="1" id="env-azimuth" value="${env.sunAzimuth}">
            <span class="pill"><span class="pill-text">${env.sunAzimuth}°</span></span>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Sun Elevation</span>
          <div class="prop-control slider-combo">
            <input type="range" min="5" max="85" step="1" id="env-elev" value="${env.sunElevation}">
            <span class="pill"><span class="pill-text">${env.sunElevation}°</span></span>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Lighting Mode</span>
          <div class="prop-control">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;">
              <input type="checkbox" id="env-night" ${env.nightMode ? 'checked' : ''}> Night Streetlights &amp; Headlights
            </label>
          </div>
        </div>
      </div>
    `;

    document.getElementById('env-vehicles')?.addEventListener('input', (e) => {
      const count = clamp(parseInt(e.target.value, 10), 0, MAX_AI_VEHICLES);
      if (lTraffic) lTraffic.params.vehicleCount = count;
      this.rebuildNetwork(true);
      this.renderInspector();
      this.renderLayerStack();
    });
    document.getElementById('env-azimuth')?.addEventListener('input', (e) => {
      env.sunAzimuth = parseFloat(e.target.value);
      this.renderInspector();
    });
    document.getElementById('env-elev')?.addEventListener('input', (e) => {
      env.sunElevation = parseFloat(e.target.value);
      this.renderInspector();
    });
    document.getElementById('env-night')?.addEventListener('change', (e) => {
      env.nightMode = e.target.checked;
      this.renderInspector();
    });
  }

  // ==========================================================================================================================================
  //                                     RENDER SULTANALADIN / FRONTIER LAYERSTACK PANEL (ON RIGHT)
  // ==========================================================================================================================================
  renderLayerStack() {
    const scroll = document.getElementById('layerstack-scroll');
    if (!scroll) return;

    document.querySelectorAll('[data-stack-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.stackTab === this.activeStackTab);
    });

    let html = '';

    if (this.activeStackTab === 'road' || this.activeStackTab === 'both') {
      html += `<div class="stack-group-banner"><span>Road &amp; Infrastructure LayerStack</span><span>10 Procedural Passes</span></div>`;
      html += this.buildLayerEntriesHTML(this.project.roadLayers, 'road');
    }

    if (this.activeStackTab === 'texture' || this.activeStackTab === 'both') {
      html += `<div class="stack-group-banner" style="margin-top:12px;"><span>Procedural Texture &amp; PBR LayerStack</span><span>8 WGSL Passes</span></div>`;
      html += this.buildLayerEntriesHTML(this.project.textureLayers, 'texture');
    }

    scroll.innerHTML = html;
    this.bindLayerStackEvents(scroll);
  }

  buildLayerEntriesHTML(layers, stackKind) {
    let out = '';
    layers.forEach((layer, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === layers.length - 1;
      const cls = [
        'entry',
        isFirst ? 'first' : '',
        isLast ? 'last' : '',
        layer.visible ? 'enabled-entry' : '',
        layer.expanded ? 'open-entry active-entry' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const pct = Math.round(clamp(layer.weight ?? 100, 0, 100));
      const isSolo = this.soloLayerId === layer.id;

      out += `
        <div class="${cls}" draggable="true" data-stack-kind="${stackKind}" data-layer-id="${layer.id}">
          <div class="bubble-col">
            <div class="bubble" style="border-color:${layer.tagColor || '#2a2a2a'}; color:${layer.tagColor || '#888'}">${layer.code || idx + 1}</div>
          </div>
          <div class="timeline">
            <div class="seg-line"></div>
            <div class="knot"></div>
          </div>
          <div class="card-wrap">
            <div class="card ${layer.expanded ? 'open' : ''} ${!layer.visible ? 'disabled-card' : ''}">
              <div class="row" data-toggle-open="${layer.id}" data-stack="${stackKind}">
                <span class="name" title="${layer.subtitle || layer.name}">${layer.name}</span>
                <div class="pill" data-scrub-weight="${layer.id}" data-stack="${stackKind}" title="Drag horizontally to scrub layer weight/opacity">
                  <div class="pill-fill" style="width:${pct}%"></div>
                  <span class="pill-text">${pct}%</span>
                </div>
                <button class="solo-btn ${isSolo ? 'active' : ''}" data-solo-layer="${layer.id}" data-stack="${stackKind}" title="Solo this Layer Pass">S</button>
                <button class="icon-btn ${layer.visible ? '' : 'off'}" data-toggle-eye="${layer.id}" data-stack="${stackKind}" title="Toggle Layer Visibility">
                  ${layer.visible ? EYE_OPEN_SVG : EYE_OFF_SVG}
                </button>
                <span class="caret">${CARET_SVG}</span>
              </div>
              ${
                layer.expanded
                  ? `<div class="card-subrow">
                       <span>${layer.mask || layer.subtitle || ''}</span>
                       <span class="blend-tag">${layer.blend || 'Normal'}</span>
                     </div>` + this.buildLayerExpandHTML(layer, stackKind)
                  : ''
              }
            </div>
          </div>
        </div>
      `;
    });
    return out;
  }

  buildLayerExpandHTML(layer, stackKind) {
    const schema = this.getLayerControlSchema(layer.id);
    if (!schema || schema.length === 0) return '';

    let rows = '';
    for (const item of schema) {
      const val = layer.params[item.key];
      if (item.type === 'slider') {
        const min = item.min ?? 0;
        const max = item.max ?? 100;
        const step = item.step ?? 1;
        const pct = Math.round(clamp(((val - min) / Math.max(1e-6, max - min)) * 100, 0, 100));
        const formatted = step < 1 ? Number(val).toFixed(2) : `${Math.round(val)}`;
        rows += `
          <div class="ctrl">
            <span class="ctrl-label" title="${item.label}">${item.label}</span>
            <div class="ctrl-right slider-combo">
              <input type="range" min="${min}" max="${max}" step="${step}" value="${val}"
                data-param-slider="${item.key}" data-layer="${layer.id}" data-stack="${stackKind}">
              <div class="pill" style="min-width:48px;">
                <div class="pill-fill" style="width:${pct}%"></div>
                <span class="pill-text">${formatted}${item.unit || ''}</span>
              </div>
            </div>
          </div>
        `;
      } else if (item.type === 'select') {
        rows += `
          <div class="ctrl">
            <span class="ctrl-label">${item.label}</span>
            <div class="ctrl-right">
              <select class="select-drop" data-param-select="${item.key}" data-layer="${layer.id}" data-stack="${stackKind}">
                ${item.options
                  .map(
                    (opt) =>
                      `<option value="${opt.id}" ${val === opt.id ? 'selected' : ''}>${
                        opt.name || opt.label
                      }</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>
        `;
      } else if (item.type === 'toggle') {
        rows += `
          <div class="ctrl">
            <span class="ctrl-label">${item.label}</span>
            <div class="ctrl-right">
              <div class="toggle-switch ${val ? 'on' : ''}" data-param-toggle="${item.key}" data-layer="${layer.id}" data-stack="${stackKind}">
                <div class="toggle-knob"></div>
              </div>
            </div>
          </div>
        `;
      }
    }

    return `<div class="expand">${rows}</div>`;
  }

  getLayerControlSchema(layerId) {
    switch (layerId) {
      case 'layer-carriageway':
        return [
          {
            key: 'quadDensityLong',
            label: 'Longitudinal Quad Density',
            type: 'slider',
            min: 0.5,
            max: 2.0,
            step: 0.1,
            unit: 'x',
          },
          { key: 'quadSubdivLat', label: 'Lateral Quad Strips', type: 'slider', min: 4, max: 16, step: 2 },
          { key: 'crownSlope', label: 'Drainage Camber Slope', type: 'slider', min: 0.0, max: 0.06, step: 0.005 },
          { key: 'superelevation', label: 'Curve Banking', type: 'slider', min: 0.0, max: 0.08, step: 0.005 },
          { key: 'tubDepth', label: 'Roadbed Slab Depth', type: 'slider', min: 0.25, max: 1.2, step: 0.05, unit: 'm' },
        ];
      case 'layer-junctions':
        return [
          {
            key: 'cornerRadius',
            label: 'Intersection Fillet Radius',
            type: 'slider',
            min: 3.0,
            max: 18.0,
            step: 0.5,
            unit: 'm',
          },
          { key: 'filletSteps', label: 'Coons Patch Subdivisions', type: 'slider', min: 6, max: 18, step: 2 },
          { key: 'curbRamps', label: 'ADA Tactile Curb Ramps', type: 'toggle' },
          { key: 'crosswalks', label: 'Zebra / Continental Crosswalks', type: 'toggle' },
          { key: 'trafficSignals', label: 'Cantilevered Signal Masts', type: 'toggle' },
        ];
      case 'layer-curbs':
        return [
          { key: 'curbProfile', label: 'Granite Curb Profile', type: 'select', options: CURB_PROFILES },
          { key: 'curbHeight', label: 'Curb Reveal Height', type: 'slider', min: 0.06, max: 0.28, step: 0.01, unit: 'm' },
          { key: 'gutterEnabled', label: 'Concrete Gutter Channel', type: 'toggle' },
          { key: 'drainGrates', label: 'Cast-Iron Storm Grates', type: 'toggle' },
          { key: 'manholes', label: 'Utility Manhole Covers', type: 'toggle' },
        ];
      case 'layer-paving':
        return [
          { key: 'sidewalkWidth', label: 'Sidewalk Width', type: 'slider', min: 1.8, max: 6.0, step: 0.2, unit: 'm' },
          { key: 'pavingPattern', label: 'Sidewalk Paving Pattern', type: 'select', options: PAVING_PATTERNS },
          { key: 'cityBlocksEnabled', label: 'City Block Parcels (No Bldgs)', type: 'toggle' },
          { key: 'blockPavingPattern', label: 'City Block Plaza Paving', type: 'select', options: PAVING_PATTERNS },
          { key: 'treePits', label: 'Perimeter Cast-Iron Tree Pits', type: 'toggle' },
        ];
      case 'layer-distress':
        return [
          { key: 'speedBumpsEnabled', label: 'Parabolic Speed Bumps', type: 'toggle' },
          { key: 'speedBumpHeight', label: 'Speed Bump Height', type: 'slider', min: 0.04, max: 0.16, step: 0.01, unit: 'm' },
          { key: 'potholesEnabled', label: '3D Recessed Potholes', type: 'toggle' },
          { key: 'potholeDepth', label: 'Pothole Crater Depth', type: 'slider', min: 0.03, max: 0.22, step: 0.01, unit: 'm' },
          { key: 'constructionEnabled', label: 'Road Rebuilding Zone', type: 'toggle' },
          { key: 'constructionMachinery', label: 'Road-Roller & Excavators', type: 'toggle' },
        ];
      case 'layer-bridges':
        return [
          { key: 'girderDepth', label: 'Box-Girder Depth', type: 'slider', min: 0.8, max: 2.6, step: 0.1, unit: 'm' },
          { key: 'pierSpacing', label: 'Hammerhead Pier Span', type: 'slider', min: 14, max: 36, step: 2, unit: 'm' },
          { key: 'cableStayedPylon', label: 'A-Frame Cable-Stayed Pylon', type: 'toggle' },
          { key: 'abutments', label: 'Reinforced Concrete Abutments', type: 'toggle' },
        ];
      case 'layer-rail-tunnel':
        return [
          { key: 'railwayEnabled', label: 'Surface Railway Underpass', type: 'toggle' },
          { key: 'catenaryMasts', label: 'Overhead Catenary Masts', type: 'toggle' },
          { key: 'trainEnabled', label: 'Moving Express Passenger Train', type: 'toggle' },
          { key: 'roadTunnelEnabled', label: 'Underground Road Tunnel', type: 'toggle' },
          { key: 'subwayEnabled', label: 'Deep Underground Subway', type: 'toggle' },
          { key: 'subwayDepth', label: 'Subway Tunnel Elevation', type: 'slider', min: -12.0, max: -4.5, step: 0.5, unit: 'm' },
        ];
      case 'layer-barriers':
        return [
          { key: 'guardrailDesign', label: 'Guardrail / Railing Design', type: 'select', options: GUARDRAIL_DESIGNS },
          { key: 'bollardDesign', label: 'Sidewalk Bollard Design', type: 'select', options: BOLLARD_DESIGNS },
          { key: 'bollardSpacing', label: 'Bollard Spacing', type: 'slider', min: 2.5, max: 8.5, step: 0.5, unit: 'm' },
        ];
      case 'layer-furniture':
        return [
          { key: 'markingsEnabled', label: 'Lane Markings & Arrows', type: 'toggle' },
          { key: 'parkingEnabled', label: 'On-Street Parking Bays', type: 'toggle' },
          { key: 'streetlightDesign', label: 'Streetlight Design', type: 'select', options: STREETLIGHT_DESIGNS },
          { key: 'billboardDesign', label: 'Billboard Design', type: 'select', options: BILLBOARD_DESIGNS },
          { key: 'billboardsEnabled', label: 'Enable Roadside Billboards', type: 'toggle' },
          { key: 'robotsEnabled', label: 'Autonomous Sidewalk Robots', type: 'toggle' },
          { key: 'robotCount', label: 'Sidewalk Robot Count', type: 'slider', min: 0, max: 16, step: 1 },
        ];
      case 'layer-traffic':
        return [
          { key: 'trafficEnabled', label: 'Enable AI Traffic Simulation', type: 'toggle' },
          { key: 'vehicleCount', label: 'AI Vehicles Cap (≤ 25)', type: 'slider', min: 0, max: 25, step: 1 },
          { key: 'speedMultiplier', label: 'Traffic Flow Speed', type: 'slider', min: 0.2, max: 2.5, step: 0.1, unit: 'x' },
          { key: 'parkedCars', label: 'Curbside Parked Vehicles', type: 'toggle' },
        ];
      // Texture & PBR LayerStack (T1 - T8)
      case 'tex-bitumen':
        return [
          { key: 'albedoDarkness', label: 'Bitumen Albedo Darkness', type: 'slider', min: 0.08, max: 0.55, step: 0.02 },
          { key: 'aggregateScale', label: 'Basalt Aggregate Scale', type: 'slider', min: 6.0, max: 40.0, step: 1.0 },
          { key: 'roughness', label: 'Base Wearing Roughness', type: 'slider', min: 0.3, max: 0.98, step: 0.02 },
        ];
      case 'tex-wheelwear':
        return [
          { key: 'trackPolish', label: 'Wheel-Track Specular Polish', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
          { key: 'oilStreak', label: 'Center Lane Oil Darkening', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
        ];
      case 'tex-cracks':
        return [
          { key: 'crackDensity', label: 'Voronoi Alligator Cracks', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
          { key: 'tarSealGloss', label: 'Bitumen Overband Gloss', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
        ];
      case 'tex-distress':
        return [
          { key: 'gravelCoarseness', label: 'Pothole Sub-Base Gravel', type: 'slider', min: 0.1, max: 1.0, step: 0.05 },
          { key: 'millingGrooveFreq', label: 'Cold-Planer Groove Freq', type: 'slider', min: 8.0, max: 40.0, step: 1.0 },
        ];
      case 'tex-paving':
        return [
          { key: 'pavingScale', label: 'Paver Joint Frequency', type: 'slider', min: 0.4, max: 2.5, step: 0.05 },
          { key: 'mortarDepth', label: 'Mortar Recess Contrast', type: 'slider', min: 0.1, max: 1.0, step: 0.05 },
        ];
      case 'tex-gutter':
        return [
          { key: 'gutterGrime', label: 'Gutter Silt & Detritus', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
          { key: 'skidIntensity', label: 'Braking Tire Rubber', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
        ];
      case 'tex-markings':
        return [
          { key: 'paintWear', label: 'Thermoplastic Paint Wear', type: 'slider', min: 0.0, max: 0.9, step: 0.05 },
          { key: 'retroReflectivity', label: 'Glass-Bead Retro-Glow', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
        ];
      case 'tex-wetness':
        return [
          { key: 'wetness', label: 'Rain Wetness & Puddles', type: 'slider', min: 0.0, max: 1.0, step: 0.05 },
          { key: 'puddleThreshold', label: 'Puddle Basin Threshold', type: 'slider', min: 0.1, max: 0.9, step: 0.05 },
        ];
      default:
        return [];
    }
  }

  findLayer(stackKind, layerId) {
    const list = stackKind === 'texture' ? this.project.textureLayers : this.project.roadLayers;
    return list.find((l) => l.id === layerId);
  }

  bindLayerStackEvents(scroll) {
    // 1. Toggle Eye Visibility
    scroll.querySelectorAll('[data-toggle-eye]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const layer = this.findLayer(btn.dataset.stack, btn.dataset.toggleEye);
        if (!layer) return;
        layer.visible = !layer.visible;
        if (btn.dataset.stack === 'road') {
          this.rebuildNetwork(layer.id === 'layer-traffic' || layer.id === 'layer-furniture');
        }
        this.renderLayerStack();
        this.renderOutliner();
      });
    });

    // 1b. Solo Layer Button ('S')
    scroll.querySelectorAll('[data-solo-layer]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stackKind = btn.dataset.stack;
        const lid = btn.dataset.soloLayer;
        const list = stackKind === 'texture' ? this.project.textureLayers : this.project.roadLayers;
        if (this.soloLayerId === lid) {
          this.soloLayerId = null;
          list.forEach((l) => {
            l.visible = true;
          });
        } else {
          this.soloLayerId = lid;
          list.forEach((l) => {
            l.visible = l.id === lid || (stackKind === 'road' && l.id === 'layer-carriageway');
          });
        }
        if (stackKind === 'road') this.rebuildNetwork(true);
        this.renderLayerStack();
        this.renderOutliner();
      });
    });

    // 1c. Drag-and-drop Layer Reordering (LayerStackPanel.html workflow)
    let draggedEntry = null;
    scroll.querySelectorAll('.entry[draggable="true"]').forEach((entry) => {
      entry.addEventListener('dragstart', (e) => {
        draggedEntry = entry;
        e.dataTransfer.effectAllowed = 'move';
      });
      entry.addEventListener('dragover', (e) => {
        if (!draggedEntry || draggedEntry === entry) return;
        if (draggedEntry.dataset.stackKind !== entry.dataset.stackKind) return;
        e.preventDefault();
        entry.classList.add('drag-over-top');
      });
      entry.addEventListener('dragleave', () => {
        entry.classList.remove('drag-over-top');
      });
      entry.addEventListener('drop', (e) => {
        e.preventDefault();
        entry.classList.remove('drag-over-top');
        if (!draggedEntry || draggedEntry === entry) return;
        if (draggedEntry.dataset.stackKind !== entry.dataset.stackKind) return;
        const list =
          entry.dataset.stackKind === 'texture'
            ? this.project.textureLayers
            : this.project.roadLayers;
        const fromIdx = list.findIndex((l) => l.id === draggedEntry.dataset.layerId);
        const toIdx = list.findIndex((l) => l.id === entry.dataset.layerId);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          const [moved] = list.splice(fromIdx, 1);
          list.splice(toIdx, 0, moved);
          this.renderLayerStack();
        }
      });
    });

    // 2. Horizontal Drag-Scrub Weight/Opacity Pill
    scroll.querySelectorAll('[data-scrub-weight]').forEach((pill) => {
      pill.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const layer = this.findLayer(pill.dataset.stack, pill.dataset.scrubWeight);
        if (!layer) return;
        const startX = e.clientX;
        const startVal = layer.weight ?? 100;
        const onMove = (me) => {
          const dx = me.clientX - startX;
          layer.weight = clamp(Math.round(startVal + dx * 0.5), 0, 100);
          const fill = pill.querySelector('.pill-fill');
          const txt = pill.querySelector('.pill-text');
          if (fill) fill.style.width = `${layer.weight}%`;
          if (txt) txt.textContent = `${layer.weight}%`;
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (pill.dataset.stack === 'road') {
            this.rebuildNetwork(false);
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      pill.addEventListener('click', (e) => e.stopPropagation());
    });

    // 3. Toggle Card Open/Fold
    scroll.querySelectorAll('[data-toggle-open]').forEach((row) => {
      row.addEventListener('click', () => {
        const layer = this.findLayer(row.dataset.stack, row.dataset.toggleOpen);
        if (!layer) return;
        layer.expanded = !layer.expanded;
        this.renderLayerStack();
      });
    });

    // 4. Parameter Sliders inside Expanded Card
    scroll.querySelectorAll('[data-param-slider]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const layer = this.findLayer(input.dataset.stack, input.dataset.layer);
        if (!layer) return;
        const key = input.dataset.paramSlider;
        let val = parseFloat(e.target.value);
        if (key === 'vehicleCount') val = clamp(Math.round(val), 0, MAX_AI_VEHICLES);
        layer.params[key] = val;

        // Update pill text immediately
        const pill = input.parentElement?.querySelector('.pill');
        if (pill) {
          const min = parseFloat(input.min) || 0;
          const max = parseFloat(input.max) || 100;
          const step = parseFloat(input.step) || 1;
          const pct = Math.round(clamp(((val - min) / Math.max(1e-6, max - min)) * 100, 0, 100));
          const fill = pill.querySelector('.pill-fill');
          const txt = pill.querySelector('.pill-text');
          if (fill) fill.style.width = `${pct}%`;
          if (txt) txt.textContent = step < 1 ? val.toFixed(2) : `${Math.round(val)}`;
        }

        if (input.dataset.stack === 'road') {
          this.rebuildNetwork(layer.id === 'layer-traffic' || layer.id === 'layer-furniture');
          this.renderInspector();
        }
      });
    });

    // 5. Parameter Dropdown Selects
    scroll.querySelectorAll('[data-param-select]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const layer = this.findLayer(sel.dataset.stack, sel.dataset.layer);
        if (!layer) return;
        const key = sel.dataset.paramSelect;
        layer.params[key] = e.target.value;
        if (sel.dataset.stack === 'road') {
          this.rebuildNetwork(false);
        }
        this.renderLayerStack();
      });
    });

    // 6. Parameter Toggles
    scroll.querySelectorAll('[data-param-toggle]').forEach((tog) => {
      tog.addEventListener('click', () => {
        const layer = this.findLayer(tog.dataset.stack, tog.dataset.layer);
        if (!layer) return;
        const key = tog.dataset.paramToggle;
        layer.params[key] = !layer.params[key];
        if (tog.dataset.stack === 'road') {
          this.rebuildNetwork(layer.id === 'layer-traffic' || layer.id === 'layer-furniture');
        }
        this.renderLayerStack();
      });
    });
  }

  // ==========================================================================================================================================
  //                                                    TOP-LEVEL UI & KEYBOARD EVENTS
  // ==========================================================================================================================================
  bindUIEvents() {
    // Preset Document Tabs
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.project = createPresetProject(btn.dataset.preset);
        this.project.junctionOverrides = {};
        this.activeDrawSplineId = null;
        this.followActor = '';
        this.rebuildNetwork(true);
        if (this.builtNetwork?.builtJunctions?.length > 0) {
          this.selection = { kind: 'junction', id: this.builtNetwork.builtJunctions[0].id };
        } else if (this.project.splines.length > 0) {
          this.selection = { kind: 'spline', id: this.project.splines[0].id };
        }
        this.renderAllPanels();
      });
    });

    // Tool Buttons
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tool = btn.dataset.tool;
        this.followActor = '';
        if (this.tool !== 'draw') {
          this.activeDrawSplineId = null;
        }
        this.renderToolbarState();
      });
    });

    // Shading & Topology Mode Selector
    document.getElementById('sel-render-mode')?.addEventListener('change', (e) => {
      this.renderMode = parseInt(e.target.value, 10) || 0;
      this.renderToolbarState();
    });

    // Camera Ride-Along Selector
    document.getElementById('sel-follow-actor')?.addEventListener('change', (e) => {
      this.followActor = e.target.value;
      if (this.followActor === 'subway' && !this.cutawayUnderground) {
        this.cutawayUnderground = true;
        this.rebuildNetwork(false);
      }
      if (!this.followActor) {
        this.camera.target = [0, 0, 0];
        this.camera.distance = 155;
        this.camera.pitch = 0.56;
        this.updateCameraEye();
      }
      this.renderToolbarState();
    });

    // Split 2D/3D & Cutaway & Simulation Toggles
    document.getElementById('btn-split-view')?.addEventListener('click', () => {
      this.splitView = !this.splitView;
      this.renderToolbarState();
    });
    document.getElementById('btn-cutaway')?.addEventListener('click', () => {
      this.cutawayUnderground = !this.cutawayUnderground;
      this.rebuildNetwork(false);
      this.renderToolbarState();
    });
    document.getElementById('btn-sim-toggle')?.addEventListener('click', () => {
      this.simulationPlaying = !this.simulationPlaying;
      this.renderToolbarState();
    });

    // Outliner Quick Actions
    document.getElementById('btn-new-curve')?.addEventListener('click', () => {
      this.tool = 'draw';
      this.followActor = '';
      this.activeDrawSplineId = null;
      this.renderToolbarState();
    });
    document.getElementById('btn-frame-scene')?.addEventListener('click', () => {
      this.followActor = '';
      this.camera.target = [0, 0, 0];
      this.camera.distance = 155;
      this.camera.yaw = 0.68;
      this.camera.pitch = 0.56;
      this.updateCameraEye();
      this.renderToolbarState();
    });
    document.getElementById('btn-export-obj')?.addEventListener('click', () => {
      if (!this.builtNetwork) return;
      const objText = exportNetworkQuadOBJ(this.builtNetwork, true);
      const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frontier-road-network-${this.project.presetId}-quads.obj`;
      a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById('btn-add-crossing')?.addEventListener('click', () => {
      // Adds a new curved road spline that crosses the network, immediately creating a merged Y/+ quad intersection!
      const id = `road-custom-${Date.now().toString().slice(-4)}`;
      const angle = (this.project.splines.length * 1.15) % Math.PI;
      const dx = Math.cos(angle) * 75;
      const dz = Math.sin(angle) * 75;
      const newSp = {
        id,
        name: `Curved Connector ${this.project.splines.length + 1}`,
        kind: 'road',
        closed: false,
        lanes: 2,
        width: 9.8,
        sidewalkWidth: 3.0,
        curbProfile: 'granite-batter',
        pavingPattern: 'herringbone',
        guardrailDesign: 'w-beam',
        bollardDesign: 'heritage-bell',
        bridge: { enabled: false },
        tunnel: { enabled: false },
        construction: { enabled: false },
        speedBumps: [0.3],
        potholes: [],
        parking: 'parallel',
        nodes: [
          { id: `${id}-n0`, position: [Math.round(-dx), 0, Math.round(-dz)] },
          { id: `${id}-n1`, position: [Math.round(-dz * 0.22), 0, Math.round(dx * 0.22)] },
          { id: `${id}-n2`, position: [Math.round(dx), 0, Math.round(dz)] },
        ],
      };
      this.project.splines.push(newSp);
      this.rebuildNetwork(true);
      if (this.builtNetwork?.builtJunctions?.length > 0) {
        this.selection = {
          kind: 'junction',
          id: this.builtNetwork.builtJunctions[this.builtNetwork.builtJunctions.length - 1].id,
        };
      }
      this.renderAllPanels();
    });

    // Inspector Collapse Bar
    document.getElementById('inspector-header-bar')?.addEventListener('click', () => {
      this.inspectorCollapsed = !this.inspectorCollapsed;
      this.renderInspector();
    });

    // Right Dock LayerStack Switcher Tabs ('road' | 'texture' | 'both')
    document.querySelectorAll('[data-stack-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeStackTab = btn.dataset.stackTab;
        this.renderLayerStack();
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'v') {
        this.tool = 'select';
        this.activeDrawSplineId = null;
        this.renderToolbarState();
      } else if (k === 'p') {
        this.tool = 'draw';
        this.activeDrawSplineId = null;
        this.renderToolbarState();
      } else if (k === 'i') {
        this.tool = 'insert';
        this.renderToolbarState();
      } else if (k === 'w') {
        this.renderMode = (this.renderMode + 1) % 6;
        this.renderToolbarState();
      } else if (k === 's') {
        this.splitView = !this.splitView;
        this.renderToolbarState();
      } else if (k === 'u') {
        this.cutawayUnderground = !this.cutawayUnderground;
        this.rebuildNetwork(false);
        this.renderToolbarState();
      } else if (k === 'f') {
        document.getElementById('btn-frame-scene')?.click();
      } else if (k === ' ') {
        e.preventDefault();
        this.simulationPlaying = !this.simulationPlaying;
        this.renderToolbarState();
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (this.followActor) {
          this.followActor = '';
          this.renderToolbarState();
        }
        if (this.activeDrawSplineId) {
          this.activeDrawSplineId = null;
          this.tool = 'select';
          this.renderToolbarState();
        }
      }
    });
  }

  // ==========================================================================================================================================
  //                                           3D & 2D VIEWPORT POINTER / GIZMO / SPLINE INTERACTION
  // ==========================================================================================================================================
  bindViewportEvents() {
    const canvas = this.overlayCanvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      const planW = this.splitView ? Math.floor(w * 0.44) : 0;

      // Check if click is inside the 2D Plan Pane (left side in Split View)
      if (this.splitView && sx < planW) {
        this.handle2DPlanMouseDown(e, sx, sy, planW, h);
        return;
      }

      // 3D Viewport Coordinates
      const sx3D = sx - planW;
      const w3D = w - planW;

      // Orbit / Pan with Right-Click, Middle-Click, or Alt/Shift + Left-Click
      if (e.button === 2 || e.button === 1 || e.altKey || e.shiftKey) {
        this.followActor = '';
        this.renderToolbarState();
        this.draggingCamera = {
          mode: e.shiftKey || e.button === 1 ? 'pan' : 'orbit',
          startX: e.clientX,
          startY: e.clientY,
          startYaw: this.camera.yaw,
          startPitch: this.camera.pitch,
          startTarget: [...this.camera.target],
        };
        return;
      }

      if (!this.renderer.lastInvViewProj) return;
      const ray = screenToWorldRay(sx3D, sy, w3D, h, this.renderer.lastInvViewProj);

      // 1. If in Curve Draw Mode ('draw'), place or snap a spline control point on ground plane y = 0
      if (this.tool === 'draw') {
        const hitGround = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], ray.origin, ray.dir);
        if (hitGround) {
          this.placeCurveDrawPoint(hitGround);
        }
        return;
      }

      // 2. If in Insert Mode ('insert'), insert a node on closest spline segment
      if (this.tool === 'insert') {
        const hitGround = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], ray.origin, ray.dir);
        if (hitGround) {
          this.insertSplineNodeNear(hitGround);
        }
        return;
      }

      // 3. Hit-test 3D Transform Gizmo first if an Intersection or Node is selected
      const gizmoTarget = getSelectedGizmoOrigin(this);
      if (gizmoTarget && !this.followActor) {
        const part = hitTest3DGizmo(
          ray.origin,
          ray.dir,
          gizmoTarget.position,
          this.camera.eye,
          gizmoTarget
        );
        if (part) {
          this.activeGizmoPart = part;
          this.draggingGizmo = {
            part,
            target: gizmoTarget,
            startOrigin: [...gizmoTarget.position],
            startHitPlane: touchPlaneUnderRay([0, 1, 0], gizmoTarget.position, ray.origin, ray.dir),
            startAxisT:
              part === 'x'
                ? alongAxisUnderRay([1, 0, 0], gizmoTarget.position, ray.origin, ray.dir)
                : part === 'y'
                ? alongAxisUnderRay([0, 1, 0], gizmoTarget.position, ray.origin, ray.dir)
                : alongAxisUnderRay([0, 0, 1], gizmoTarget.position, ray.origin, ray.dir),
          };
          return;
        }
      }

      // 4. Hit-test Clickable Merged Intersection Badges & Hubs in 3D
      const pickedJunction = this.hitTestJunctionScreen(sx, sy, planW, w3D, h);
      if (pickedJunction) {
        this.selection = { kind: 'junction', id: pickedJunction.id };
        this.activeGizmoPart = 'xz';
        const hitXZ = touchPlaneUnderRay([0, 1, 0], pickedJunction.center, ray.origin, ray.dir);
        this.draggingGizmo = {
          part: 'xz',
          target: {
            kind: 'junction',
            id: pickedJunction.id,
            position: [...pickedJunction.center],
            junction: pickedJunction,
          },
          startOrigin: [...pickedJunction.center],
          startHitPlane: hitXZ || [...pickedJunction.center],
          startAxisT: 0,
        };
        this.renderOutliner();
        this.renderInspector();
        return;
      }

      // 5. Hit-test Spline Control Nodes in 3D
      const pickedNode = this.hitTestSplineNodeScreen(sx, sy, planW, w3D, h);
      if (pickedNode) {
        this.selection = { kind: 'node', id: pickedNode.node.id, splineId: pickedNode.spline.id };
        this.activeGizmoPart = 'xz';
        const hitXZ = touchPlaneUnderRay([0, 1, 0], pickedNode.node.position, ray.origin, ray.dir);
        this.draggingGizmo = {
          part: 'xz',
          target: {
            kind: 'node',
            id: pickedNode.node.id,
            splineId: pickedNode.spline.id,
            position: [...pickedNode.node.position],
            node: pickedNode.node,
          },
          startOrigin: [...pickedNode.node.position],
          startHitPlane: hitXZ || [...pickedNode.node.position],
          startAxisT: 0,
        };
        this.renderOutliner();
        this.renderInspector();
        return;
      }

      // 6. Hit-test Road Splines on the XZ ground plane, or fallback to Orbit
      const hitGround = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], ray.origin, ray.dir);
      if (hitGround) {
        const nearSp = this.findNearestSplineXZ(hitGround, 9.0);
        if (nearSp) {
          this.selection = { kind: 'spline', id: nearSp.spline.id };
          this.renderOutliner();
          this.renderInspector();
          return;
        }
      }

      // Otherwise Left-Drag on empty viewport orbits smoothly
      this.followActor = '';
      this.renderToolbarState();
      this.draggingCamera = {
        mode: 'orbit',
        startX: e.clientX,
        startY: e.clientY,
        startYaw: this.camera.yaw,
        startPitch: this.camera.pitch,
        startTarget: [...this.camera.target],
      };
    });

    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const planW = this.splitView ? Math.floor(w * 0.44) : 0;

      // 1. Handle 2D Plan Dragging
      if (this.draggingPlan) {
        this.handle2DPlanMouseMove(e, sx, sy, planW, h);
        return;
      }

      // 2. Handle 3D Camera Orbit / Pan
      if (this.draggingCamera) {
        const dx = e.clientX - this.draggingCamera.startX;
        const dy = e.clientY - this.draggingCamera.startY;
        if (this.draggingCamera.mode === 'orbit') {
          this.camera.yaw = this.draggingCamera.startYaw - dx * 0.0065;
          this.camera.pitch = clamp(this.draggingCamera.startPitch + dy * 0.0055, 0.08, 1.48);
          this.updateCameraEye();
        } else {
          const panScale = this.camera.distance * 0.0014;
          const right = [Math.cos(this.camera.yaw), 0, -Math.sin(this.camera.yaw)];
          const fwd = [-Math.sin(this.camera.yaw), 0, -Math.cos(this.camera.yaw)];
          this.camera.target = [
            this.draggingCamera.startTarget[0] - right[0] * dx * panScale + fwd[0] * dy * panScale,
            this.draggingCamera.startTarget[1],
            this.draggingCamera.startTarget[2] - right[2] * dx * panScale + fwd[2] * dy * panScale,
          ];
          this.updateCameraEye();
        }
        return;
      }

      const sx3D = sx - planW;
      const w3D = Math.max(1, w - planW);
      if (!this.renderer.lastInvViewProj) return;
      const ray = screenToWorldRay(sx3D, sy, w3D, h, this.renderer.lastInvViewProj);

      // 3. Handle Active 3D Gizmo Dragging (Moves Entire Merged Intersection, Scales Fillet Radius, or Moves Node!)
      if (this.draggingGizmo) {
        const dg = this.draggingGizmo;
        if (dg.part === 'radius' && dg.target.kind === 'junction') {
          const hit = touchPlaneUnderRay([0, 1, 0], dg.startOrigin, ray.origin, ray.dir);
          if (hit) {
            const newRad = clamp(
              Math.round(vDistXZ(hit, dg.startOrigin) * 2) / 2,
              3.0,
              18.0
            );
            if (!this.project.junctionOverrides[dg.target.id]) {
              this.project.junctionOverrides[dg.target.id] = {};
            }
            this.project.junctionOverrides[dg.target.id].cornerRadius = newRad;
            this.rebuildNetwork(false);
          }
          return;
        }

        let newPos = [...dg.startOrigin];
        if (dg.part === 'xz') {
          const hit = touchPlaneUnderRay([0, 1, 0], dg.startOrigin, ray.origin, ray.dir);
          if (hit && dg.startHitPlane) {
            newPos[0] = dg.startOrigin[0] + (hit[0] - dg.startHitPlane[0]);
            newPos[2] = dg.startOrigin[2] + (hit[2] - dg.startHitPlane[2]);
          }
        } else {
          const axis = dg.part === 'x' ? [1, 0, 0] : dg.part === 'y' ? [0, 1, 0] : [0, 0, 1];
          const t = alongAxisUnderRay(axis, dg.startOrigin, ray.origin, ray.dir);
          const dt = t - dg.startAxisT;
          newPos = vAdd(dg.startOrigin, vScale(axis, dt));
          if (dg.part === 'y') newPos[1] = clamp(newPos[1], -12, 28);
        }

        this.applyGizmoMove(dg.target, newPos);
        return;
      }

      // 4. Hover Preview for Curve Drawing or Gizmo Highlighting
      if (this.tool === 'draw' && sx >= planW) {
        const hitGround = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], ray.origin, ray.dir);
        if (hitGround) {
          const snap = this.findMagneticSnapPoint(hitGround);
          this.drawSnapTarget = snap;
          this.drawHoverWorld = snap ? snap.point : hitGround;
        }
      } else {
        const gizmoTarget = getSelectedGizmoOrigin(this);
        if (gizmoTarget && !this.followActor) {
          this.activeGizmoPart = hitTest3DGizmo(
            ray.origin,
            ray.dir,
            gizmoTarget.position,
            this.camera.eye,
            gizmoTarget
          );
        } else {
          this.activeGizmoPart = null;
        }
        const hovJn = this.hitTestJunctionScreen(sx, sy, planW, w3D, h);
        this.hoveredJunctionId = hovJn ? hovJn.id : null;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.draggingGizmo) {
        this.draggingGizmo = null;
        this.rebuildNetwork(true);
        this.renderInspector();
        this.renderOutliner();
      }
      this.draggingCamera = null;
      this.draggingPlan = null;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const planW = this.splitView ? Math.floor(rect.width * 0.44) : 0;

        if (this.splitView && sx < planW) {
          const factor = e.deltaY < 0 ? 1.12 : 0.89;
          this.planCamera.zoom = clamp(this.planCamera.zoom * factor, 0.45, 8.5);
          return;
        }

        const factor = e.deltaY < 0 ? 0.9 : 1.11;
        this.camera.distance = clamp(this.camera.distance * factor, 14.0, 520.0);
        this.updateCameraEye();
      },
      { passive: false }
    );
  }

  applyGizmoMove(target, newPos) {
    if (target.kind === 'junction') {
      const currentJn =
        (this.builtNetwork?.builtJunctions || []).find((j) => j.id === target.id) || target.junction;
      if (currentJn) {
        moveMergedJunction(this.project, currentJn, newPos);
        this.rebuildNetwork(false);
        const refreshed = (this.builtNetwork?.builtJunctions || []).find((j) => j.id === target.id);
        if (refreshed) target.junction = refreshed;
      }
    } else if (target.kind === 'node' && target.node) {
      target.node.position = [
        Math.round(newPos[0] * 100) / 100,
        Math.round(newPos[1] * 100) / 100,
        Math.round(newPos[2] * 100) / 100,
      ];
      this.rebuildNetwork(false);
    }
  }

  // ==========================================================================================================================================
  //                                    2D PLAN PANE INTERACTION (CLICK & DRAG MERGED INTERSECTIONS / NODES)
  // ==========================================================================================================================================
  handle2DPlanMouseDown(e, sx, sy, planW, h) {
    const wx = this.planCamera.panX + (sx - planW * 0.5) / this.planCamera.zoom;
    const wz = this.planCamera.panZ + (sy - h * 0.5) / this.planCamera.zoom;

    if (e.button === 2 || e.button === 1 || e.altKey || e.shiftKey) {
      this.draggingPlan = {
        mode: 'pan',
        startX: sx,
        startY: sy,
        startPanX: this.planCamera.panX,
        startPanZ: this.planCamera.panZ,
      };
      return;
    }

    if (this.tool === 'draw') {
      this.placeCurveDrawPoint([wx, 0, wz]);
      return;
    }

    // Hit-test Merged Intersections in 2D Plan
    const tolWorld = 10.0 / this.planCamera.zoom;
    for (const jn of this.builtNetwork?.builtJunctions || []) {
      if (vDistXZ([wx, 0, wz], jn.center) <= Math.max(4.5, tolWorld)) {
        this.selection = { kind: 'junction', id: jn.id };
        this.draggingPlan = { mode: 'junction', junction: jn };
        this.renderOutliner();
        this.renderInspector();
        return;
      }
    }

    // Hit-test Spline Control Nodes in 2D Plan
    for (const sp of this.project.splines || []) {
      for (const nd of sp.nodes) {
        if (vDistXZ([wx, 0, wz], nd.position) <= Math.max(3.5, tolWorld)) {
          this.selection = { kind: 'node', id: nd.id, splineId: sp.id };
          this.draggingPlan = { mode: 'node', node: nd };
          this.renderOutliner();
          this.renderInspector();
          return;
        }
      }
    }

    // Default to panning 2D Plan
    this.draggingPlan = {
      mode: 'pan',
      startX: sx,
      startY: sy,
      startPanX: this.planCamera.panX,
      startPanZ: this.planCamera.panZ,
    };
  }

  handle2DPlanMouseMove(e, sx, sy, planW, h) {
    if (!this.draggingPlan) return;
    if (this.draggingPlan.mode === 'pan') {
      const dx = sx - this.draggingPlan.startX;
      const dy = sy - this.draggingPlan.startY;
      this.planCamera.panX = this.draggingPlan.startPanX - dx / this.planCamera.zoom;
      this.planCamera.panZ = this.draggingPlan.startPanZ - dy / this.planCamera.zoom;
      return;
    }

    const wx = this.planCamera.panX + (sx - planW * 0.5) / this.planCamera.zoom;
    const wz = this.planCamera.panZ + (sy - h * 0.5) / this.planCamera.zoom;

    if (this.draggingPlan.mode === 'junction') {
      const jn = this.draggingPlan.junction;
      moveMergedJunction(this.project, jn, [wx, jn.center[1], wz]);
      this.rebuildNetwork(false);
    } else if (this.draggingPlan.mode === 'node') {
      const nd = this.draggingPlan.node;
      nd.position = [Math.round(wx * 100) / 100, nd.position[1], Math.round(wz * 100) / 100];
      this.rebuildNetwork(false);
    }
  }

  // ==========================================================================================================================================
  //                                    SPLINE / CURVE DRAWING WITH AUTO-SNAP & INTERSECTION MERGING
  // ==========================================================================================================================================
  findMagneticSnapPoint(worldPt) {
    const snapTol = 6.5;
    // 1. Snap to existing Merged Intersection center
    for (const jn of this.builtNetwork?.builtJunctions || []) {
      if (vDistXZ(worldPt, jn.center) < snapTol) {
        return { kind: 'junction', point: [...jn.center], id: jn.id };
      }
    }
    // 2. Snap to existing Spline Control Node
    for (const sp of this.project.splines || []) {
      for (const nd of sp.nodes) {
        if (vDistXZ(worldPt, nd.position) < snapTol) {
          return { kind: 'node', point: [...nd.position], id: nd.id };
        }
      }
    }
    // 3. Snap to nearest road curve segment (creates a T or Y intersection automatically!)
    const nearSeg = this.findNearestSplineXZ(worldPt, 5.5);
    if (nearSeg) {
      return { kind: 'curve', point: nearSeg.closest, spline: nearSeg.spline };
    }
    return null;
  }

  placeCurveDrawPoint(rawWorldPt) {
    const snap = this.findMagneticSnapPoint(rawWorldPt);
    const pt = snap
      ? [...snap.point]
      : [Math.round(rawWorldPt[0] * 10) / 10, 0, Math.round(rawWorldPt[2] * 10) / 10];

    if (!this.activeDrawSplineId) {
      const newId = `road-curve-${Date.now().toString().slice(-4)}`;
      const newSpline = {
        id: newId,
        name: `Curved Road ${this.project.splines.length + 1}`,
        kind: 'road',
        closed: false,
        lanes: 2,
        width: 9.8,
        sidewalkWidth: 3.0,
        curbProfile: 'granite-batter',
        pavingPattern: 'herringbone',
        guardrailDesign: 'w-beam',
        bollardDesign: 'heritage-bell',
        bridge: { enabled: false },
        tunnel: { enabled: false },
        construction: { enabled: false },
        speedBumps: [],
        potholes: [],
        parking: 'parallel',
        nodes: [{ id: `${newId}-n0`, position: pt }],
      };
      this.project.splines.push(newSpline);
      this.activeDrawSplineId = newId;
      this.selection = { kind: 'spline', id: newId };
    } else {
      const sp = this.project.splines.find((s) => s.id === this.activeDrawSplineId);
      if (sp) {
        sp.nodes.push({
          id: `${sp.id}-n${sp.nodes.length}`,
          position: pt,
        });
      }
    }

    this.rebuildNetwork(true);
    this.renderAllPanels();
  }

  insertSplineNodeNear(worldPt) {
    const near = this.findNearestSplineXZ(worldPt, 14.0);
    if (!near) return;
    const sp = near.spline;
    const newNode = {
      id: `${sp.id}-ins-${Date.now().toString().slice(-4)}`,
      position: [
        Math.round(near.closest[0] * 10) / 10,
        near.closest[1],
        Math.round(near.closest[2] * 10) / 10,
      ],
    };
    sp.nodes.splice(near.segIndex + 1, 0, newNode);
    this.selection = { kind: 'node', id: newNode.id, splineId: sp.id };
    this.tool = 'select';
    this.rebuildNetwork(true);
    this.renderAllPanels();
  }

  findNearestSplineXZ(worldPt, maxDist = 10.0) {
    let best = null;
    let bestD = maxDist;
    for (const sp of this.project.splines || []) {
      for (let i = 0; i < sp.nodes.length - 1; i++) {
        const res = pointSegXZ(worldPt, sp.nodes[i].position, sp.nodes[i + 1].position);
        if (res.dist < bestD) {
          bestD = res.dist;
          best = { spline: sp, segIndex: i, closest: res.closest, dist: res.dist };
        }
      }
    }
    return best;
  }

  hitTestJunctionScreen(sx, sy, planW, w3D, h) {
    if (!this.renderer.lastViewProj || !this.builtNetwork) return null;
    for (const jn of this.builtNetwork.builtJunctions) {
      const scr = this.renderer.project(
        [jn.center[0], jn.center[1] + 1.2, jn.center[2]],
        w3D,
        h
      );
      if (!scr) continue;
      const jx = scr.x + planW;
      const jy = scr.y;
      if (
        Math.hypot(sx - jx, sy - jy) <= 18 ||
        (Math.abs(sx - jx) <= 46 && Math.abs(sy - (jy - 22)) <= 13)
      ) {
        return jn;
      }
    }
    return null;
  }

  hitTestSplineNodeScreen(sx, sy, planW, w3D, h) {
    if (!this.renderer.lastViewProj) return null;
    for (const sp of this.project.splines || []) {
      for (const nd of sp.nodes) {
        const scr = this.renderer.project(
          [nd.position[0], nd.position[1] + 0.35, nd.position[2]],
          w3D,
          h
        );
        if (!scr) continue;
        if (Math.hypot(sx - (scr.x + planW), sy - scr.y) <= 10) {
          return { spline: sp, node: nd };
        }
      }
    }
    return null;
  }

  updateFollowCamera() {
    if (!this.followActor || !this.trafficSim) return;
    let pose = null;
    let backDist = 11.5;
    let heightOff = 4.2;

    if (this.followActor === 'car') {
      const v = this.trafficSim.vehicles?.[0];
      if (v?.worldPos && v?.worldFwd) pose = { pos: v.worldPos, fwd: v.worldFwd };
    } else if (this.followActor === 'train') {
      pose = this.trafficSim.trainPose;
      backDist = 18.0;
      heightOff = 6.5;
    } else if (this.followActor === 'subway') {
      pose = this.trafficSim.subwayPose;
      backDist = 14.0;
      heightOff = 3.2;
    } else if (this.followActor === 'robot') {
      const rb = this.trafficSim.robots?.[0];
      if (rb?.worldPos && rb?.worldFwd) {
        pose = { pos: rb.worldPos, fwd: rb.worldFwd };
        backDist = 4.8;
        heightOff = 2.0;
      }
    }

    if (pose) {
      const { pos, fwd } = pose;
      this.camera.target = [
        pos[0] + fwd[0] * 10,
        pos[1] + 1.2,
        pos[2] + fwd[2] * 10,
      ];
      this.camera.eye = [
        pos[0] - fwd[0] * backDist,
        pos[1] + heightOff,
        pos[2] - fwd[2] * backDist,
      ];
    }
  }

  // ==========================================================================================================================================
  //                                                    REALTIME RENDER & SIMULATION LOOP
  // ==========================================================================================================================================
  frameLoop(now) {
    const dt = Math.min(0.05, (now - this._lastFrameTime) * 0.001);
    this._lastFrameTime = now;

    this._frameCount++;
    if (now - this._lastFpsStamp >= 500) {
      this.fps = Math.round((this._frameCount * 1000) / (now - this._lastFpsStamp));
      this._frameCount = 0;
      this._lastFpsStamp = now;
      const fpsEl = document.getElementById('stat-fps');
      if (fpsEl) fpsEl.textContent = `${this.fps} FPS`;
    }

    // 1. Step AI Traffic (<= 25 cars), Trains, Subway Consists & Sidewalk Robots
    if (this.trafficSim) {
      const stepDt = this.simulationPlaying ? dt : 0;
      if (this.simulationPlaying) this.simTime += dt;
      const dynBuffers = stepAndEmitDynamicActors(this.trafficSim, this.project, stepDt);
      this.renderer.uploadDynamicBuffers(dynBuffers);
      this.updateFollowCamera();
    }

    // 2. Resize Overlay Canvas if needed
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.overlayCanvas.clientWidth || 1;
    const cssH = this.overlayCanvas.clientHeight || 1;
    const targetW = Math.floor(cssW * dpr);
    const targetH = Math.floor(cssH * dpr);
    if (this.overlayCanvas.width !== targetW || this.overlayCanvas.height !== targetH) {
      this.overlayCanvas.width = targetW;
      this.overlayCanvas.height = targetH;
    }

    // 3. Render 3D WebGPU / WebGL2 Scene with Active Entity Highlighting
    this.renderer.renderFrame({
      camera: this.camera,
      project: this.project,
      renderMode: this.renderMode,
      splitView: this.splitView,
      time: this.simTime,
      selectedEntityId: this.getSelectedEntityId(),
      hoveredEntityId: this.getHoveredEntityId(),
    });

    // 4. Render 2D Plan CAD View & 3D Transform Gizmo / Intersection Badges Overlay
    this.overlayCtx.save();
    this.overlayCtx.scale(dpr, dpr);
    drawViewportOverlay(this.overlayCtx, cssW, cssH, this);
    this.overlayCtx.restore();

    requestAnimationFrame((t) => this.frameLoop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new FrontierRoadApp();
  app.init();
  window.frontierRoadApp = app;
});
