import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { StubElement, installStubDom } from './dom-stub.mjs';
import { LandscapeToolbar } from '../src/app/landscape-toolbar.js';
import { LandscapeWorkspace } from '../src/app/landscape-studio.js';
import { createLandscapeDocument, documentStats, serializeLandscapeDocumentText } from '../src/core/landscape-document.js';
import { createLandscapeField } from '../src/core/landscape-field.js';

/**
 * Headless renderer double. It exercises the real viewport code paths
 * (scene graph, geometry building, uniforms, ocean passes) without a GPU. Only
 * the draw call itself is a no-op.
 */
function makeRendererDouble(canvas = new StubElement('canvas')) {
  const renders = [];
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900 });
  return {
    renders,
    domElement: canvas,
    setPixelRatio() {},
    setSize() {},
    setClearColor() {},
    setRenderTarget() {},
    getRenderTarget: () => null,
    getPixelRatio: () => 1,
    getContext: () => ({ getExtension: () => ({}) }),
    compile() {},
    render(scene, camera) {
      renders.push({ scene, camera });
    },
    clear() {},
    dispose() {},
  };
}

/**
 * Runs `frames` real animation frames. The studio's frame loop only advances
 * tiles inside `_animate`, which the browser drives through rAF.
 */
function step(dom, workspace, frames = 3) {
  workspace.setActive(true);
  dom.flushFrames(frames);
  // Drain the tile queue without a full frame loop: keeps tests fast while
  // still exercising the scheduler's budget accounting.
  if (workspace.viewport.scheduler.queue.length) {
    workspace.viewport.scheduler.pump((descriptor) => workspace.viewport._buildTile(descriptor));
  }
}

const REF_IDS = [
  'lm-toolrail',
  'lm-layer-list',
  'lm-layer-count',
  'lm-inspector',
  'lm-inspector-tabs',
  'lm-doc-title',
  'lm-doc-size',
  'lm-world-readout',
  'lm-cam-overview',
  'lm-cam-top',
  'lm-cam-coast',
  'lm-cam-surface',
  'lm-ocean-toggle',
  'lm-wireframe-toggle',
  'lm-regen-base',
  'lm-new-document',
  'lm-export-json',
  'lm-import-json',
  'lm-import-file',
  'lm-export-mesh',
  'lm-stat-fps',
  'lm-stat-tiles',
  'lm-stat-tris',
  'lm-stat-memory',
  'lm-stat-altitude',
  'lm-stat-land',
  'lm-hud-coords',
  'oceanFrame',
  'lm-tool-hint',
  'lm-pick-readout',
];

const REF_MAP = {
  toolbar: 'lm-toolrail',
  layerList: 'lm-layer-list',
  layerCount: 'lm-layer-count',
  inspector: 'lm-inspector',
  inspectorTabs: 'lm-inspector-tabs',
  docTitle: 'lm-doc-title',
  docSize: 'lm-doc-size',
  worldReadout: 'lm-world-readout',
  cameraOverview: 'lm-cam-overview',
  cameraTop: 'lm-cam-top',
  cameraCoast: 'lm-cam-coast',
  cameraSurface: 'lm-cam-surface',
  oceanToggle: 'lm-ocean-toggle',
  wireframeToggle: 'lm-wireframe-toggle',
  regenBase: 'lm-regen-base',
  newDocument: 'lm-new-document',
  exportJson: 'lm-export-json',
  importJson: 'lm-import-json',
  importFile: 'lm-import-file',
  exportMesh: 'lm-export-mesh',
  statFps: 'lm-stat-fps',
  statTiles: 'lm-stat-tiles',
  statTris: 'lm-stat-tris',
  statMemory: 'lm-stat-memory',
  statAltitude: 'lm-stat-altitude',
  landFraction: 'lm-stat-land',
  hudCoords: 'lm-hud-coords',
  oceanFrame: 'oceanFrame',
};

function buildWorkspace() {
  const dom = installStubDom();
  for (const id of REF_IDS) dom.document.register(id);
  const tabs = dom.document.register('lm-inspector-tabs');
  for (const name of ['layer', 'world', 'ocean', 'ops']) {
    const button = dom.document.createElement('button');
    button.setAttribute('data-inspector-tab', name);
    if (name === 'layer') button.classList.add('active');
    tabs.appendChild(button);
  }
  const refs = {};
  for (const [key, id] of Object.entries(REF_MAP)) refs[key] = dom.document.getElementById(id);

  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, String(value));
    },
  };

  const viewportContainer = dom.document.register('landscape-viewport');
  viewportContainer.clientWidth = 1600;
  viewportContainer.clientHeight = 900;

  let rendererDouble = null;
  const workspace = new LandscapeWorkspace(viewportContainer, {
    refs,
    storage,
    createRenderer: () => {
      const canvas = new StubElement('canvas');
      canvas.ownerDocument = dom.document;
      rendererDouble = makeRendererDouble(canvas);
      return rendererDouble;
    },
  });
  return { dom, workspace, refs, storage, renderer: () => rendererDouble };
}

function buttonsIn(root, className) {
  return root.querySelectorAll(`.${className}`);
}

test('the toolbar exposes a working tool for every sculpt and landmass operation', () => {
  const dom = installStubDom();
  const root = dom.document.register('lm-toolrail');
  const tools = [];
  const toolbar = new LandscapeToolbar(root, {
    onToolChange: (tool) => tools.push(tool),
  });
  try {
    const buttons = buttonsIn(root, 'lm-rail-btn');
    // Navigate + every sculpt tool + every stamp kind.
    assert.ok(buttons.length >= 1 + 7 + 10, `expected a complete rail, saw ${buttons.length} buttons`);
    const ids = new Set(buttons.map((button) => button.dataset.tool));
    for (const expected of ['navigate', 'raise', 'lower', 'smooth', 'flatten', 'terrace', 'sharpen', 'noise']) {
      assert.ok(ids.has(expected), `missing sculpt tool ${expected}`);
    }
    for (const expected of ['stamp:island', 'stamp:continent', 'stamp:crater', 'stamp:basin', 'stamp:strait']) {
      assert.ok(ids.has(expected), `missing landmass tool ${expected}`);
    }

    buttons.find((button) => button.dataset.tool === 'stamp:island').click();
    assert.equal(toolbar.tool, 'stamp:island');
    assert.deepEqual(tools.at(-1), 'stamp:island');
    assert.ok(buttons.find((button) => button.dataset.tool === 'stamp:island').classList.contains('active'));

    buttons.find((button) => button.dataset.tool === 'raise').click();
    assert.equal(toolbar.tool, 'raise');
    assert.ok(!buttons.find((button) => button.dataset.tool === 'stamp:island').classList.contains('active'));

    // Brush sliders must drive the model, including the logarithmic radius.
    const sliders = buttonsIn(root, 'lm-rail-slider').map((wrap) => wrap.querySelectorAll('input')[0]);
    assert.equal(sliders.length, 3, 'radius, strength and stamp scale sliders are present');
    const [radiusSlider, strengthSlider] = sliders;
    const radiusBefore = toolbar.brush.radius;
    radiusSlider.value = '1000';
    radiusSlider.dispatch('input');
    assert.ok(toolbar.brush.radius > radiusBefore * 2, 'the log radius slider reaches far values');
    strengthSlider.value = '1.2';
    strengthSlider.dispatch('input');
    assert.equal(toolbar.brush.strength, 1.2);
    assert.match(root.textContent, /1\.2|120%/);
  } finally {
    dom.restore();
  }
});

test('the workspace boots, renders and reports live telemetry', () => {
  const { dom, workspace, refs, renderer } = buildWorkspace();
  try {
    assert.ok(workspace.doc, 'a document is loaded');
    assert.equal(workspace.doc.layers[0].kind, 'base');
    assert.ok(refs.layerList.children.length > 0, 'outliner is populated');

    step(dom, workspace, 4);
    assert.ok(renderer().renders.length > 0, 'the viewport renders frames');
    const stats = workspace.viewport.stats;
    assert.ok(Number.isFinite(stats.triangles) && stats.triangles > 0, 'tiles produced triangles');
    assert.ok(stats.tiles > 0, 'tiles are resident');
    assert.ok(stats.residentMb > 0 && stats.residentMb <= stats.budgetMb, 'memory stays inside its budget');
    assert.ok(stats.landFraction > 0 && stats.landFraction < 1, 'land fraction is measured from the field');
  } finally {
    dom.restore();
  }
});

test('LOD rings stay inside the memory budget as the camera moves across the planet', () => {
  const { dom, workspace } = buildWorkspace();
  try {
    workspace.setActive(true);
    const viewport = workspace.viewport;
    const budget = viewport.scheduler.budgetBytes;
    for (const [x, y, distance] of [[0, 40_000, 400], [180_000, 22_000, 250], [-90_000, 8_000, 120], [12_000, 90_000, 900]]) {
      for (let frame = 0; frame < 6; frame++) {
        viewport.camera.position.set(x + distance * 0.3, y, distance);
        viewport.controls.target.set(x, 0, 0);
        viewport._focusFromCamera();
        viewport._refreshTiles();
        viewport.scheduler.pump((descriptor) => viewport._buildTile(descriptor));
      }
      const report = viewport.scheduler.report();
      assert.ok(report.bytes <= budget, `budget exceeded at ${x}: ${report.bytes} > ${budget}`);
      assert.ok(report.tiles <= viewport.scheduler.maxTiles);
    }
    // Some tiles must have been regenerated for the new position, and old ones
    // released — otherwise a long flight would leak.
    assert.ok(viewport.scheduler.stats.generated > 0);
    assert.ok(viewport.scheduler.stats.evicted >= 0);
  } finally {
    dom.restore();
  }
});

test('stamping a landmass changes the field and only repaints the dirty tiles', () => {
  const { dom, workspace, refs } = buildWorkspace();
  try {
    workspace.setActive(true);
    const viewport = workspace.viewport;
    viewport.camera.position.set(0, 20_000, 20_000);
    viewport.controls.target.set(0, 0, 0);
    viewport._focusFromCamera();
    viewport._refreshTiles();

    const before = viewport.field.elevationAt(0, 0, 64);
    viewport.setTool('stamp:island');
    viewport.setStampScale(2);
    // Place directly, as a click would.
    const stamp = viewport._placeStamp({ x: 0, y: before, z: 0 });
    assert.ok(stamp, 'a stamp was authored');
    const after = viewport.field.elevationAt(0, 0, 64);
    assert.ok(after > before, `stamp should raise the surface (${before} -> ${after})`);

    const doc = workspace.doc;
    const landform = doc.layers.find((layer) => layer.kind === 'landform');
    assert.equal(landform.ops.length, 1);

    // The inspector lists the new operation and can delete it again.
    workspace.selectedLayerId = landform.id;
    workspace.selectedOpId = stamp.id;
    workspace.inspectorTab = 'layer';
    workspace._renderInspector();
    const op = refs.inspector.querySelectorAll('.lm-op-row')[0];
    assert.ok(op, 'the authored operation appears in the inspector');
    const remove = op.querySelectorAll('.lm-op-remove')[0];
    remove.click();
    assert.equal(doc.layers.find((layer) => layer.kind === 'landform').ops.length, 0);
    assert.ok(Math.abs(viewport.field.elevationAt(0, 0, 64) - before) < 1e-6, 'deleting the stamp restores the field');
  } finally {
    dom.restore();
  }
});

test('sculpting stores strokes instead of baking, and undo-by-delete restores the field', () => {
  const { dom, workspace } = buildWorkspace();
  try {
    workspace.setActive(true);
    const viewport = workspace.viewport;
    // Sculpting is only legal on land, so aim at a point that is above sea
    // level and frame the camera over it.
    const spot = viewport._findLandPoint();
    viewport.camera.position.set(spot.x, spot.y + 4_000, spot.z + 4_000);
    viewport.camera.updateMatrixWorld();
    viewport.controls.target.set(spot.x, spot.y, spot.z);
    // OrbitControls' damping makes `update()` interpolate towards the target, so
    // settle it explicitly before picking — the browser does this over frames.
    viewport.controls.update();
    viewport.camera.updateMatrixWorld();
    viewport.setTool('raise');
    viewport.setBrush({ radius: 500, strength: 0.9 });

    const before = viewport.field.elevationAt(spot.x, spot.z, 16);
    viewport._handlePointerDown({ button: 0, clientX: 800, clientY: 450 });
    viewport._handlePointerUp({});

    const sculpt = workspace.doc.layers.find((layer) => layer.kind === 'sculpt');
    assert.equal(sculpt.ops.length, 1, 'one stroke is stored');
    assert.equal(sculpt.ops[0].type, 'stroke');
    assert.ok(sculpt.ops[0].points.length >= 1);
    const strokePoint = sculpt.ops[0].points[0];
    const off = Math.hypot(strokePoint.x - spot.x, strokePoint.z - spot.z);
    assert.ok(off < 900, `the stroke lands under the cursor (off by ${off.toFixed(0)} m at ${spot.x.toFixed(0)},${spot.z.toFixed(0)} -> ${strokePoint.x.toFixed(0)},${strokePoint.z.toFixed(0)})`);
    const afterDown = viewport.field.elevationAt(strokePoint.x, strokePoint.z, 16);
    assert.ok(afterDown > before, 'the stroke raised the surface on land');

    // A click on the sky must not author anything.
    viewport.camera.position.set(spot.x, spot.y + 4_000, spot.z + 4_000);
    viewport.camera.updateMatrixWorld();
    viewport._handlePointerDown({ button: 0, clientX: 800, clientY: 4 });
    viewport._handlePointerUp({});
    assert.equal(sculpt.ops.length, 1, 'a click on the sky authors nothing');

    // Removing the stroke restores the pre-sculpt surface exactly.
    const sculpted = viewport.field.elevationAt(strokePoint.x, strokePoint.z, 16);
    sculpt.ops.length = 0;
    viewport.notifyDocumentChanged(null);
    assert.equal(viewport.field.elevationAt(spot.x, spot.z, 16), before, 'the pristine surface returns');
    assert.ok(Math.abs(viewport.field.elevationAt(strokePoint.x, strokePoint.z, 16) - sculpted) > 0.5,
      'the stroke had changed the surface where it landed');
  } finally {
    dom.restore();
  }
});

test('inspector tabs, layer toggles and base parameters are all wired', () => {
  const { dom, workspace, refs } = buildWorkspace();
  try {
    const tabs = refs.inspectorTabs;
    for (const name of ['world', 'ocean', 'layer']) {
      const button = tabs.querySelectorAll('[data-inspector-tab]').find((node) => node.attributes['data-inspector-tab'] === name);
      assert.ok(button, `tab ${name} exists`);
      button.click();
      assert.equal(workspace.inspectorTab, name);
      assert.ok(refs.inspector.children.length > 0, `${name} inspector renders content`);
    }

    // World tab reports the document, not derived geometry.
    tabs.querySelectorAll('[data-inspector-tab]').find((n) => n.attributes['data-inspector-tab'] === 'world').click();
    const text = refs.inspector.all().map((node) => node.textContent).join(' ');
    assert.match(text, /Document size/);
    assert.match(text, /derived/i);

    // Ocean tab exposes the physical controls.
    tabs.querySelectorAll('[data-inspector-tab]').find((n) => n.attributes['data-inspector-tab'] === 'ocean').click();
    const oceanText = refs.inspector.all().map((node) => node.textContent).join(' ');
    for (const label of ['Swell height', 'Swell wavelength', 'Foam / surf', 'Clarity']) {
      assert.ok(oceanText.includes(label), `ocean inspector must expose ${label}`);
    }

    // Base layer parameters mutate the document and invalidate the field.
    workspace.selectedLayerId = workspace.doc.layers[0].id;
    workspace.inspectorTab = 'layer';
    workspace._renderInspector();
    const before = workspace.doc.layers[0].params.landCoverage;
    const sliders = refs.inspector.querySelectorAll('input');
    assert.ok(sliders.length > 5, 'base layer exposes its parameter sliders');
    const coverageSlider = sliders.find((input) => input.type === 'range' && Number(input.value) === before);
    if (coverageSlider) {
      coverageSlider.value = String(before * 0.5);
      coverageSlider.dispatch('input');
    }
    // Render every load-bearing panel without throwing.
    for (const layer of workspace.doc.layers) {
      workspace.selectedLayerId = layer.id;
      for (const tab of ['layer', 'world', 'ocean', 'ops']) {
        workspace.inspectorTab = tab;
        workspace._renderInspector();
      }
    }
  } finally {
    dom.restore();
  }
});

test('header actions reseed, export and reset without touching derived geometry', () => {
  const { dom, workspace, refs } = buildWorkspace();
  try {
    const base = workspace.doc.layers[0];
    const oldSeed = base.params.seed;
    refs.regenBase.click();
    assert.notEqual(base.params.seed, oldSeed, 'reseed changes the planet');
    assert.equal(workspace.doc.seed, base.params.seed, 'document seed follows the base seed');

    const field = createLandscapeField(workspace.doc);
    assert.ok(Number.isFinite(field.elevationAt(0, 0, 128)));

    // A very large world must still produce a tiny document.
    workspace.doc.world.spanMeters = 4_000_000;
    const stats = documentStats(workspace.doc);
    assert.ok(stats.bytes < 32 * 1024, `document stayed small: ${stats.bytes} B`);

    refs.newDocument.click();
    assert.equal(documentStats(workspace.doc).stamps, 0, 'reset clears authored stamps');

    // Saved document round-trips through the injected storage.
    workspace._scheduleSave();
    const raw = serializeLandscapeDocumentText(workspace.doc);
    assert.ok(raw.includes('"version"'));
  } finally {
    dom.restore();
  }
});

test('a restored session reloads the authored document, not a cached mesh', () => {
  const dom = installStubDom();
  try {
    for (const id of REF_IDS) dom.document.register(id);
    const tabs = dom.document.register('lm-inspector-tabs');
    for (const name of ['layer', 'world', 'ocean', 'ops']) {
      const button = dom.document.createElement('button');
      button.setAttribute('data-inspector-tab', name);
      tabs.appendChild(button);
    }
    const refs = {};
    for (const [key, id] of Object.entries(REF_MAP)) refs[key] = dom.document.getElementById(id);
    const container = dom.document.register('landscape-viewport');
    container.clientWidth = 800;
    container.clientHeight = 600;

    const saved = createLandscapeDocument({ name: 'Persisted', spanMeters: 800_000, seed: 1234 });
    const landform = saved.layers.find((layer) => layer.kind === 'landform');
    landform.ops.push({
      type: 'stamp',
      id: 'stamp-round-trip',
      kind: 'island',
      x: 0,
      z: 0,
      seed: 4,
      radius: 4_000,
      height: 500,
      angle: 0.5,
      stretch: 1,
      sharpness: 0.5,
      roughness: 0.4,
      erosion: 0.3,
      negative: false,
      blend: 0.5,
    });
    const storage = {
      data: new Map([['frontier.landscape.document.v3', serializeLandscapeDocumentText(saved)]]),
      getItem(key) {
        return this.data.get(key) ?? null;
      },
      setItem(key, value) {
        this.data.set(key, String(value));
      },
    };

    const workspace = new LandscapeWorkspace(container, {
      refs,
      storage,
      createRenderer: () => makeRendererDouble(),
    });
    assert.equal(workspace.doc.name, 'Persisted');
    assert.equal(workspace.doc.world.spanMeters, 800_000);
    const restoredLayer = workspace.doc.layers.find((layer) => layer.kind === 'landform');
    assert.equal(restoredLayer.ops.length, 1);
    assert.equal(restoredLayer.ops[0].id, 'stamp-round-trip');
    // The field is derived from the restored document, so the island is back.
    assert.ok(workspace.viewport.field.elevationAt(0, 0, 32) > 0);
  } finally {
    dom.restore();
  }
});

test('viewport exposes the camera presets and ocean controls the chrome binds to', () => {
  const { dom, workspace, refs } = buildWorkspace();
  try {
    workspace.setActive(true);
    const viewport = workspace.viewport;
    for (const mode of ['overview', 'top', 'coast', 'surface']) {
      viewport.frameCamera(mode);
      for (let i = 0; i < 3; i++) {
        viewport.camera.updateMatrixWorld();
        viewport._focusFromCamera();
        viewport._refreshTiles();
      }
      assert.ok(Number.isFinite(viewport.camera.position.x));
      assert.ok(Number.isFinite(viewport.stats.focusX));
    }

    viewport.setSun(200, 60);
    assert.ok(Math.abs(viewport._sunDir.length() - 1) < 1e-6, 'sun direction stays normalised');

    refs.wireframeToggle.checked = true;
    refs.wireframeToggle.dispatch('change');
    assert.equal(viewport.terrainMaterial.wireframe, true);

    refs.oceanToggle.checked = false;
    refs.oceanToggle.dispatch('change');
    assert.equal(viewport.doc.ocean.enabled, false);
    assert.equal(viewport.oceanSimSurface.visible, false);
    refs.oceanToggle.checked = true;
    refs.oceanToggle.dispatch('change');
    assert.equal(viewport.oceanSimSurface.visible, true);
  } finally {
    dom.restore();
  }
});

test('the terrain, ocean and sky materials are the shared validated shader module', () => {
  const { dom, workspace } = buildWorkspace();
  try {
    const viewport = workspace.viewport;
    assert.ok(viewport.terrainMaterial.fragmentShader.includes('C_DEEPSEABED'), 'flat lithology palette is used');
    assert.ok(viewport.oceanSim.surfaceMaterial.fragmentShader.includes('transmittance'));
    assert.ok(viewport.oceanSim.surfaceMaterial.fragmentShader.includes('fresnel'));
    assert.ok(viewport.backgroundMaterial.fragmentShader.includes('skyRadiance'));
    assert.equal(viewport.scene.children.includes(viewport._terrainGroup), true);
    assert.ok(viewport.farOcean.geometry.type === 'RingGeometry', 'the far ocean carries the horizon');
    // Ocean simulation and rendering must agree on what a metre is.
    assert.equal(viewport.oceanSim.spanMeters, viewport.oceanSpan);
  } finally {
    dom.restore();
  }
});

test('every uniform a shader declares is actually bound by its material', () => {
  const { dom, workspace } = buildWorkspace();
  try {
    const viewport = workspace.viewport;
    // An unbound uniform is silently zero in GLSL, which turns water black or
    // terrain flat — exactly the class of bug a browser-only check misses.
    const builtins = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition']);
    const check = (name, material) => {
      for (const [stage, source] of [['vertex', material.vertexShader], ['fragment', material.fragmentShader]]) {
        const declared = new Set();
        for (const match of source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)) declared.add(match[1]);
        for (const uniform of declared) {
          if (builtins.has(uniform)) continue;
          assert.ok(material.uniforms?.[uniform], `${name} ${stage} declares ${uniform} but never binds it`);
        }
      }
      // And the reverse: a bound uniform nothing reads is dead weight.
      for (const uniform of Object.keys(material.uniforms || {})) {
        const used = material.vertexShader.includes(uniform) || material.fragmentShader.includes(uniform);
        assert.ok(used, `${name} binds ${uniform} but no stage reads it`);
      }
    };
    check('terrain', viewport.terrainMaterial);
    check('ocean-surface', viewport.oceanSim.surfaceMaterial);
    check('ocean-far', viewport.farOceanMaterial);
    check('sky', viewport.backgroundMaterial);
  } finally {
    dom.restore();
  }
});

test('three.js scene graph stays small and disposes cleanly', () => {
  const { dom, workspace } = buildWorkspace();
  try {
    workspace.setActive(true);
    const viewport = workspace.viewport;
    for (let i = 0; i < 5; i++) {
      viewport._focusFromCamera();
      viewport._refreshTiles();
    }
    const before = viewport._terrainGroup.children.length;
    assert.ok(before > 0 && before < 200, `tile meshes are bounded, saw ${before}`);
    viewport.scheduler.clear();
    assert.equal(viewport._terrainGroup.children.length, 0, 'eviction removes meshes from the scene');
    workspace.setActive(false);
    assert.equal(viewport.active, false);
    assert.ok(viewport.scene.children.every((child) => child !== undefined));
    // Materials are plain three.js objects the renderer can compile.
    assert.ok(viewport.terrainMaterial instanceof THREE.ShaderMaterial);
    assert.ok(viewport.oceanSim.surfaceMaterial instanceof THREE.ShaderMaterial);
  } finally {
    dom.restore();
  }
});
