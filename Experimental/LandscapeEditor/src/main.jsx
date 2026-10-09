// Frontier landscape editor. Layer stack on the left, satmap viewport in the centre, inspector on the right.
// The terrain is computed in a Web Worker; this file owns project state, undo, persistence and exports.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../style.css';
import '../landscape.css';
import Outliner from './components/Outliner.jsx';
import Viewport from './components/Viewport.jsx';
import { LayerInspector, MaskInspector, WorldInspector } from './components/Inspector.jsx';
import { PRESET_BY_ID, PRESETS } from './terrain/presets.js';
import { createLayer, createMask, uid } from './terrain/catalog.js';
import { renderSatmap } from './satmap.js';
import { EROSIONS } from './terrain/erosion.js';
import { GENERATORS } from './terrain/generators.js';
import { MODIFIERS } from './terrain/modifiers.js';
import { MASKS } from './terrain/masks.js';

const STORE_KEY = 'frontier-landscape-project';
const DEFAULT_PRESET = 'canyons';

const clone = (value) => JSON.parse(JSON.stringify(value));

function presetProject(id) {
  const preset = PRESET_BY_ID[id] || PRESETS[0];
  return {
    presetId: preset.id,
    settings: { ...preset.settings },
    layers: clone(preset.layers),
    palette: { ...preset.palette },
    view: { mode: '2d', satmap: 'composite', stylise: 0.35, hillshade: 0.55, snowLine: preset.snowLine, exaggeration: 1.4 },
  };
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.layers) && saved.settings) {
      return { ...presetProject(DEFAULT_PRESET), ...saved, view: { ...presetProject(DEFAULT_PRESET).view, ...(saved.view || {}) } };
    }
  } catch {
    // A corrupt save falls back to the default preset.
  }
  return presetProject(DEFAULT_PRESET);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [project, setProject] = useState(loadProject);
  const [selected, setSelected] = useState({ kind: 'world' });
  const [terrain, setTerrain] = useState({ result: null, computing: true, progress: null, error: null });
  const projectRef = useRef(project);
  projectRef.current = project;
  const pastRef = useRef([]);
  const lastKeyRef = useRef({ key: null, time: 0 });
  const [, forceUndoRefresh] = useState(0);
  const workerRef = useRef(null);
  const requestRef = useRef(0);

  // --- History: every edit is recorded, but a drag on the same control collapses into one step.
  const commit = (updater, key) => {
    const prev = projectRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (next === prev) return;
    const now = Date.now();
    if (!(key && lastKeyRef.current.key === key && now - lastKeyRef.current.time < 900)) {
      pastRef.current = [...pastRef.current.slice(-79), prev];
    }
    lastKeyRef.current = { key, time: now };
    projectRef.current = next;
    setProject(next);
    forceUndoRefresh((n) => n + 1);
  };
  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    lastKeyRef.current = { key: null, time: 0 };
    projectRef.current = prev;
    setProject(prev);
    forceUndoRefresh((n) => n + 1);
  };
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Persistence.
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(project));
    } catch {
      // Storage can be full or disabled. The project still works in memory.
    }
  }, [project]);

  // --- Worker: terrain evaluation runs off the UI thread. Only the newest request may update the view.
  useEffect(() => {
    const worker = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.id !== requestRef.current) return;
      if (data.progress) {
        setTerrain((t) => ({ ...t, progress: data.progress }));
      } else if (data.error) {
        setTerrain((t) => ({ ...t, computing: false, progress: null, error: data.error.split('\n')[0] }));
      } else {
        setTerrain({ result: data.result, computing: false, progress: null, error: null });
      }
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    setTerrain((t) => ({ ...t, computing: true }));
    const timer = setTimeout(() => {
      const id = requestRef.current + 1;
      requestRef.current = id;
      workerRef.current?.postMessage({ id, layers: project.layers, settings: project.settings });
    }, 220);
    return () => clearTimeout(timer);
  }, [project.layers, project.settings]);

  const { result } = terrain;
  const rgba = useMemo(() => {
    if (!result) return null;
    return renderSatmap(result, {
      mode: project.view.satmap,
      palette: project.palette,
      stylise: project.view.stylise,
      hillshadeAmount: project.view.hillshade,
      snowLine: project.view.snowLine,
    });
  }, [result, project.view.satmap, project.view.stylise, project.view.hillshade, project.view.snowLine, project.palette]);

  // --- Layer operations.
  const { layers } = project;
  const findLayer = (id) => layers.find((l) => l.id === id);
  const updateLayer = (id, patch, key) => commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), key);
  const setLayerParam = (id, paramKey, value) =>
    commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, params: { ...l.params, [paramKey]: value } } : l)) }), `param:${id}:${paramKey}`);

  const setLayerType = (id, type) =>
    commit((p) => ({
      ...p,
      layers: p.layers.map((l) => {
        if (l.id !== id) return l;
        const registry = { generator: GENERATORS, modifier: MODIFIERS, erosion: EROSIONS }[l.kind];
        const def = registry[type];
        const oldLabel = registry[l.type]?.label;
        const params = Object.fromEntries(def.params.map((p2) => [p2.key, p2.default]));
        return { ...l, type, params, name: !oldLabel || l.name === oldLabel ? def.label : l.name };
      }),
    }));

  const toggleLayer = (id) => commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, enabled: l.enabled === false } : l)) }));

  const moveLayer = (id, dir) =>
    commit((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.layers.length) return p;
      const next = [...p.layers];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, layers: next };
    });

  const removeLayer = (id) => {
    commit((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
    if (selected.layerId === id || selected.id === id) setSelected({ kind: 'world' });
  };

  const duplicateLayer = (id) => {
    const source = findLayer(id);
    if (!source) return;
    const copy = { ...clone(source), id: uid('L'), name: `${source.name} copy`, masks: (source.masks || []).map((m) => ({ ...clone(m), id: uid('m') })) };
    commit((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      const next = [...p.layers];
      next.splice(i + 1, 0, copy);
      return { ...p, layers: next };
    });
    setSelected({ kind: 'layer', id: copy.id });
  };

  const addLayer = (kind, type) => {
    const layer = createLayer(kind, type);
    if (kind === 'generator') layer.blend = layers.length ? 'add' : 'replace';
    commit((p) => {
      const selectedIndex = selected.kind === 'layer' ? p.layers.findIndex((l) => l.id === selected.id) : -1;
      const next = [...p.layers];
      next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, layer);
      return { ...p, layers: next };
    });
    setSelected({ kind: 'layer', id: layer.id });
  };

  // --- Mask operations.
  const addMask = (layerId, type) => {
    const mask = createMask(type);
    commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === layerId ? { ...l, masks: [...(l.masks || []), mask] } : l)) }));
    setSelected({ kind: 'mask', layerId, maskId: mask.id });
  };
  const updateMask = (layerId, maskId, patch, key) =>
    commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === layerId ? { ...l, masks: (l.masks || []).map((m) => (m.id === maskId ? { ...m, ...patch } : m)) } : l)),
    }), key);
  const setMaskParam = (layerId, maskId, paramKey, value) => {
    commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === layerId
        ? { ...l, masks: (l.masks || []).map((m) => (m.id === maskId ? { ...m, params: { ...m.params, [paramKey]: value } } : m)) }
        : l)),
    }), `mparam:${maskId}:${paramKey}`);
  };
  const removeMask = (layerId, maskId) => {
    commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === layerId ? { ...l, masks: (l.masks || []).filter((m) => m.id !== maskId) } : l)) }));
    if (selected.maskId === maskId) setSelected({ kind: 'layer', id: layerId });
  };

  // --- Presets, settings and view.
  const applyPreset = (id) => {
    const fresh = presetProject(id);
    commit((p) => ({
      ...p,
      presetId: id,
      layers: fresh.layers,
      palette: fresh.palette,
      settings: { ...fresh.settings, resolution: p.settings.resolution },
      view: { ...p.view, snowLine: fresh.view.snowLine },
    }));
    setSelected({ kind: 'world' });
  };
  const setSettings = (patch, key) => commit((p) => ({ ...p, settings: { ...p.settings, ...patch } }), key);
  // View settings are not part of the undo history and do not trigger a recompute.
  const setView = (patch) => {
    const prev = projectRef.current;
    const next = { ...prev, view: { ...prev.view, ...patch } };
    projectRef.current = next;
    setProject(next);
  };

  // --- Exports.
  const exportHeight = () => {
    if (!result) return;
    const h = result.height;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < h.length; i++) {
      if (h[i] < lo) lo = h[i];
      if (h[i] > hi) hi = h[i];
    }
    const span = hi - lo || 1;
    const out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = Math.round(((h[i] - lo) / span) * 65535);
    download(new Blob([out.buffer], { type: 'application/octet-stream' }), `landscape-${result.n}x${result.n}.r16`);
    const meta = { format: 'r16, 16-bit unsigned, little-endian, row-major', width: result.n, height: result.n, cellSizeMetres: result.cs, minMetres: lo, maxMetres: hi, seaLevelMetres: result.seaLevel };
    download(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), `landscape-${result.n}x${result.n}.json`);
  };
  const exportSatmap = () => {
    if (!rgba || !result) return;
    const canvas = document.createElement('canvas');
    canvas.width = result.n;
    canvas.height = result.n;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), result.n, result.n), 0, 0);
    canvas.toBlob((blob) => blob && download(blob, `satmap-${project.view.satmap}.png`), 'image/png');
  };

  // --- Selection resolution.
  const selectedLayer = selected.kind === 'layer' ? findLayer(selected.id) : selected.kind === 'mask' ? findLayer(selected.layerId) : null;
  const selectedMask = selected.kind === 'mask' && selectedLayer ? (selectedLayer.masks || []).find((m) => m.id === selected.maskId) : null;
  const layerIndex = selectedLayer ? layers.indexOf(selectedLayer) : -1;
  const logIndex = selectedLayer && result ? result.log.findIndex((e) => e.id === selectedLayer.id) : -1;
  const logEntry = logIndex >= 0 ? result.log[logIndex] : null;
  const before = logIndex > 0 ? result.log[logIndex - 1].profile : null;
  const after = logEntry ? logEntry.profile : null;
  const totalWorldLabel = PRESET_BY_ID[project.presetId]?.name || 'Custom landscape';

  const inspector = (() => {
    if (selectedMask) {
      return (
        <MaskInspector
          layer={selectedLayer}
          mask={selectedMask}
          onPatch={(patch) => updateMask(selectedLayer.id, selectedMask.id, patch)}
          onParam={(k, v) => setMaskParam(selectedLayer.id, selectedMask.id, k, v)}
          onDelete={() => removeMask(selectedLayer.id, selectedMask.id)}
          onToggle={(on) => updateMask(selectedLayer.id, selectedMask.id, { enabled: on })}
          onBack={() => setSelected({ kind: 'layer', id: selectedLayer.id })}
        />
      );
    }
    if (selectedLayer) {
      return (
        <LayerInspector
          key={selectedLayer.id}
          layer={selectedLayer}
          index={layerIndex}
          count={layers.length}
          logEntry={logEntry}
          before={before}
          after={after}
          seaLevel={project.settings.seaLevel}
          onPatch={(patch) => updateLayer(selectedLayer.id, patch, `patch:${selectedLayer.id}:${Object.keys(patch).join()}`)}
          onParam={(k, v) => setLayerParam(selectedLayer.id, k, v)}
          onType={(t) => setLayerType(selectedLayer.id, t)}
          onToggle={() => toggleLayer(selectedLayer.id)}
          onDelete={() => removeLayer(selectedLayer.id)}
          onDuplicate={() => duplicateLayer(selectedLayer.id)}
          onMove={(dir) => moveLayer(selectedLayer.id, dir)}
          onReset={() => commit((p) => ({ ...p, layers: p.layers.map((l) => {
            if (l.id !== selectedLayer.id) return l;
            const registry = { generator: GENERATORS, modifier: MODIFIERS, erosion: EROSIONS }[l.kind];
            return { ...l, params: Object.fromEntries(registry[l.type].params.map((p2) => [p2.key, p2.default])) };
          }) }))}
          onSelectMask={(maskId) => setSelected({ kind: 'mask', layerId: selectedLayer.id, maskId })}
          onAddMask={(type) => addMask(selectedLayer.id, type)}
          onRemoveMask={(maskId) => removeMask(selectedLayer.id, maskId)}
          onToggleMask={(maskId) => {
            const m = (selectedLayer.masks || []).find((x) => x.id === maskId);
            updateMask(selectedLayer.id, maskId, { enabled: m?.enabled === false });
          }}
        />
      );
    }
    return (
      <WorldInspector
        project={project}
        result={result}
        log={result?.log}
        rgbaReady={!!rgba}
        onSettings={setSettings}
        onView={setView}
        onApplyPreset={applyPreset}
        onExportHeight={exportHeight}
        onExportSatmap={exportSatmap}
      />
    );
  })();

  return (
    <main className="shell landscape-shell">
      <Outliner
        layers={layers}
        selected={selected}
        onSelect={setSelected}
        onToggleLayer={toggleLayer}
        onToggleMask={(layerId, maskId) => {
          const l = findLayer(layerId);
          const m = (l?.masks || []).find((x) => x.id === maskId);
          updateMask(layerId, maskId, { enabled: m?.enabled === false });
        }}
        onMove={moveLayer}
        onRemoveLayer={removeLayer}
        onDuplicateLayer={duplicateLayer}
        onAddLayer={addLayer}
        onAddMask={addMask}
        onRemoveMask={removeMask}
        onApplyPreset={applyPreset}
        presetId={project.presetId}
        worldLabel={totalWorldLabel}
        computing={terrain.computing}
        progress={terrain.progress}
      />
      <Viewport
        result={result}
        rgba={rgba}
        view={project.view}
        onView={setView}
        computing={terrain.computing}
        progress={terrain.progress}
        error={terrain.error}
        onUndo={undo}
        canUndo={pastRef.current.length > 0}
        onExportHeight={exportHeight}
        onExportSatmap={exportSatmap}
        worldSize={project.settings.worldSize}
        seaLevel={project.settings.seaLevel}
      />
      {inspector}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
