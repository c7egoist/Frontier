import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Card, ParamForm, Select, Slider, Toggle } from "./Controls.jsx";
import {
  HEIGHT_TYPES, BLEND_HEIGHT, TERRAIN_PARAMS, SUN_PARAMS, MASK_LIST, GENERATOR_LIST,
  EROSION_LIST, MODIFIER_LIST, PALETTE_LIST, makeLayer, makeMask, layerInfo, normalizeDocument, emptyDocument,
} from "../engine/document.js";
import { MASKS, MASK_OPS } from "../engine/masks.js";
import { BLEND_MODES, CHANNELS, SATMAP_TYPE } from "../engine/satmap.js";
import { VIEW_MODES, renderView, renderVoxel } from "../engine/render.js";
import { PRESET_LIST, buildPreset } from "../engine/presets.js";

const CATEGORY_ICON = {
  generator: "icons/terrain.svg",
  erosion: "icons/fluid.svg",
  modifier: "icons/mesh.svg",
  satmap: "icons/editor-texture.svg",
};
const CATEGORY_NAME = { generator: "Base shape", erosion: "Erosion", modifier: "Modifier", satmap: "Satmap" };
const HEIGHT_GROUPS = [
  ["Base shape (generators)", GENERATOR_LIST],
  ["Erosion", EROSION_LIST],
  ["Modifiers", MODIFIER_LIST],
];

function typeCategory(type) {
  return layerInfo(type)?.category;
}

function App() {
  const [state, setState] = useState(() => ({ doc: buildPreset("alps"), past: [], future: [], key: null }));
  const doc = state.doc;
  const [selId, setSelId] = useState(null);
  const [viewMode, setViewMode] = useState("shaded");
  const [dim, setDim] = useState("2d");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const workerRef = useRef(null);
  const reqRef = useRef(0);

  // Every edit goes through here so undo and redo see the whole document.
  const commit = useCallback((mutate, coalesce) => {
    setState((s) => {
      const next = mutate(structuredClone(s.doc));
      if (!next) return s;
      const past = coalesce && s.key === coalesce ? s.past : [...s.past, s.doc].slice(-80);
      return { doc: next, past, future: [], key: coalesce || null };
    });
  }, []);
  const undo = () =>
    setState((s) => (s.past.length ? { doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc, ...s.future], key: null } : s));
  const redo = () =>
    setState((s) => (s.future.length ? { doc: s.future[0], past: [...s.past, s.doc], future: s.future.slice(1), key: null } : s));

  useEffect(() => {
    const w = new Worker("worker.js");
    w.onmessage = (e) => {
      if (e.data.id !== reqRef.current) return;
      if (e.data.error) setError(e.data.error);
      else {
        setError(null);
        setResult(e.data.result);
      }
      setBusy(false);
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const id = ++reqRef.current;
    setBusy(true);
    const t = setTimeout(() => workerRef.current.postMessage({ id, doc, maskLayerId: selId }), 140);
    return () => clearTimeout(t);
  }, [doc, selId]);

  const selected = doc.layers.find((l) => l.id === selId) || null;

  const updateLayer = (id, patch, key) =>
    commit((d) => {
      d.layers = d.layers.map((l) => (l.id === id ? { ...l, ...(typeof patch === "function" ? patch(l) : patch) } : l));
      return d;
    }, key);
  const setParam = (id, k, v) => updateLayer(id, (l) => ({ params: { ...l.params, [k]: v } }), `${id}.${k}`);

  const addLayer = (type) => {
    const layer = makeLayer(type);
    commit((d) => {
      const kind = layer.kind;
      const idx = d.layers.map((l, i) => (l.kind === kind ? i : -1)).filter((i) => i >= 0);
      const at = idx.length ? idx[idx.length - 1] + 1 : d.layers.length;
      d.layers.splice(at, 0, layer);
      return d;
    });
    setSelId(layer.id);
  };
  const removeLayer = (id) => {
    commit((d) => {
      d.layers = d.layers.filter((l) => l.id !== id);
      return d;
    });
    if (selId === id) setSelId(null);
  };
  const duplicateLayer = (id) => {
    const src = doc.layers.find((l) => l.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: makeLayer(src.type).id, name: src.name + " copy" };
    copy.masks = copy.masks.map((m) => ({ ...m, id: makeMask(m.type).id }));
    commit((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      d.layers.splice(i + 1, 0, copy);
      return d;
    });
    setSelId(copy.id);
  };
  const moveLayer = (id, dir) =>
    commit((d) => {
      const kind = d.layers.find((l) => l.id === id)?.kind;
      const same = d.layers.map((l, i) => (l.kind === kind ? i : -1)).filter((i) => i >= 0);
      const pos = same.findIndex((i) => d.layers[i].id === id);
      const target = same[pos + dir];
      if (target === undefined) return null;
      const from = d.layers.findIndex((l) => l.id === id);
      [d.layers[from], d.layers[target]] = [d.layers[target], d.layers[from]];
      return d;
    });

  const changeType = (id, type) =>
    commit((d) => {
      const info = layerInfo(type);
      d.layers = d.layers.map((l) => {
        if (l.id !== id) return l;
        const fresh = makeLayer(type, { id: l.id, name: info.label });
        return { ...l, type, kind: fresh.kind, name: info.label, params: fresh.params, blend: "replace" };
      });
      return d;
    });

  const addMask = (layerId, type) =>
    commit((d) => {
      d.layers = d.layers.map((l) => (l.id === layerId ? { ...l, masks: [...l.masks, makeMask(type)] } : l));
      return d;
    });
  const updateMask = (layerId, maskId, patch, key) =>
    commit(
      (d) => {
        d.layers = d.layers.map((l) => {
          if (l.id !== layerId) return l;
          return {
            ...l,
            masks: l.masks.map((m) => (m.id === maskId ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)),
          };
        });
        return d;
      },
      key,
    );
  const removeMask = (layerId, maskId) =>
    commit((d) => {
      d.layers = d.layers.map((l) => (l.id === layerId ? { ...l, masks: l.masks.filter((m) => m.id !== maskId) } : l));
      return d;
    });
  const changeMaskType = (layerId, maskId, type) =>
    commit((d) => {
      d.layers = d.layers.map((l) => {
        if (l.id !== layerId) return l;
        return { ...l, masks: l.masks.map((m) => (m.id === maskId ? makeMask(type, { id: m.id, op: m.op }) : m)) };
      });
      return d;
    });

  const exportHeight = () => {
    if (!result) return;
    const buf = new Uint16Array(result.height.length);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.round(Math.min(1, Math.max(0, result.height[i])) * 65535);
    download(`${doc.name.replace(/\s+/g, "-").toLowerCase()}-${result.N}.r16`, new Blob([buf.buffer], { type: "application/octet-stream" }));
  };
  const exportSatmap = () => {
    if (!result) return;
    const c = document.createElement("canvas");
    c.width = result.N;
    c.height = result.N;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.N, result.N), 0, 0);
    c.toBlob((b) => b && download(`${doc.name.replace(/\s+/g, "-").toLowerCase()}-satmap.png`, b), "image/png");
  };
  const saveDoc = () => download(`${doc.name.replace(/\s+/g, "-").toLowerCase()}.landscape.json`, new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
  const loadDoc = async (file) => {
    if (!file) return;
    const text = await file.text();
    commit(() => normalizeDocument(JSON.parse(text)));
    setSelId(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▲</span>
          <span>Landscape</span>
        </div>
        <input className="doc-name" value={doc.name} onChange={(e) => commit((d) => ({ ...d, name: e.target.value }), "name")} />
        <div className="top-group">
          <Select
            label="Preset"
            value=""
            options={[["", "Load a preset…"], ...PRESET_LIST]}
            onChange={(id) => {
              if (!id) return;
              commit(() => buildPreset(id));
              setSelId(null);
            }}
          />
        </div>
        <div className="top-group">
          <button onClick={undo} disabled={!state.past.length} title="Undo">↶ Undo</button>
          <button onClick={redo} disabled={!state.future.length} title="Redo">↷ Redo</button>
        </div>
        <div className="top-group">
          <label className="file-button">
            Open JSON
            <input type="file" accept=".json,application/json" onChange={(e) => loadDoc(e.target.files[0])} />
          </label>
          <button onClick={saveDoc}>Save JSON</button>
          <button onClick={exportHeight} disabled={!result}>Export .r16</button>
          <button onClick={exportSatmap} disabled={!result}>Export satmap</button>
        </div>
        <span className={`status-disc ${busy ? "busy" : ""}`} title={busy ? "Evaluating" : "Up to date"} />
      </header>

      <div className="workspace">
        <aside className="dock left-dock">
          <LayerStack
            doc={doc}
            selId={selId}
            onSelect={setSelId}
            onAdd={addLayer}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onMove={moveLayer}
            onToggle={(id) => updateLayer(id, (l) => ({ enabled: !(l.enabled !== false) }))}
            stats={result?.stats}
          />
        </aside>

        <main className="dock viewport-dock">
          <div className="viewport-toolbar">
            <div className="viewport-modes" role="group" aria-label="Viewport mode">
              <button className={dim === "2d" ? "active" : ""} onClick={() => setDim("2d")}>Map</button>
              <button className={dim === "3d" ? "active" : ""} onClick={() => setDim("3d")}>Perspective</button>
            </div>
            {dim === "2d" && (
              <Select label="View" value={viewMode} options={VIEW_MODES} onChange={setViewMode} />
            )}
          </div>
          <Viewport result={result} dim={dim} viewMode={viewMode} sun={doc.sun} />
          <footer className="viewport-footer">
            {result ? (
              <>
                <span>{result.N} × {result.N} cells</span>
                <span>{((result.N * result.cell) / 1000).toFixed(1)} km × {((result.N * result.cell) / 1000).toFixed(1)} km</span>
                <span>altitude {result.stats.minM.toFixed(0)} – {result.stats.maxM.toFixed(0)} m</span>
                <span>{result.stats.ms.toFixed(0)} ms</span>
                {result.stats.errors.length > 0 && <span className="err">{result.stats.errors.length} layer error(s)</span>}
              </>
            ) : (
              <span>Evaluating…</span>
            )}
            {error && <span className="err">{error}</span>}
          </footer>
        </main>

        <aside className="dock right-dock">
          <Inspector
            doc={doc}
            layer={selected}
            result={result}
            commit={commit}
            setParam={setParam}
            updateLayer={updateLayer}
            changeType={changeType}
            addMask={addMask}
            updateMask={updateMask}
            removeMask={removeMask}
            changeMaskType={changeMaskType}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </aside>
      </div>
    </div>
  );
}

function LayerStack({ doc, selId, onSelect, onAdd, onRemove, onDuplicate, onMove, onToggle, stats }) {
  const addGroups = [
    ["Base shape", GENERATOR_LIST.map(([k, l]) => [k, l])],
    ["Erosion", EROSION_LIST],
    ["Modifiers", MODIFIER_LIST],
    ["Satmap", [["satmap", SATMAP_TYPE.label]]],
  ];
  const height = doc.layers.filter((l) => l.kind === "height");
  const satmap = doc.layers.filter((l) => l.kind === "satmap");
  const timeOf = (id) => stats?.layers?.find((x) => x.id === id);
  const row = (layer, i, count) => {
    const info = layerInfo(layer.type);
    const err = stats?.errors?.some((e) => e.id === layer.id);
    const t = timeOf(layer.id);
    return (
      <div
        key={layer.id}
        className={`layer-row ${selId === layer.id ? "selected" : ""} ${layer.enabled === false ? "off" : ""} ${err ? "error" : ""}`}
        onClick={() => onSelect(layer.id)}
      >
        <button
          className="eye"
          title={layer.enabled === false ? "Show" : "Hide"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(layer.id);
          }}
        >
          {layer.enabled === false ? "○" : "●"}
        </button>
        <img className="layer-icon" src={CATEGORY_ICON[info.category]} alt="" />
        <div className="layer-id">
          <span className="layer-name">{layer.name}</span>
          <span className="layer-sub">
            {CATEGORY_NAME[info.category]}
            {layer.masks.length ? ` · ${layer.masks.length} mask${layer.masks.length > 1 ? "s" : ""}` : ""}
            {t && t.ms > 0 ? ` · ${t.ms.toFixed(0)} ms` : ""}
          </span>
        </div>
        <div className="row-ops" onClick={(e) => e.stopPropagation()}>
          <button title="Move up" disabled={i === 0} onClick={() => onMove(layer.id, -1)}>↑</button>
          <button title="Move down" disabled={i === count - 1} onClick={() => onMove(layer.id, 1)}>↓</button>
          <button title="Duplicate" onClick={() => onDuplicate(layer.id)}>⧉</button>
          <button title="Delete" onClick={() => onRemove(layer.id)}>✕</button>
        </div>
      </div>
    );
  };
  return (
    <div className="layerstack">
      <div className="panel-heading">
        <div>
          <h2>Layer stack</h2>
          <p>Top runs first. Height builds the land, satmaps colour it.</p>
        </div>
      </div>
      <div className="add-row">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">+ Add layer…</option>
          {addGroups.map(([g, items]) => (
            <optgroup key={g} label={g}>
              {items.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="layer-list">
        <div className="group-caption">Height</div>
        {height.length === 0 && <p className="empty">No height layers. Add a base shape.</p>}
        {height.map((l, i) => row(l, i, height.length))}
        <div className="group-caption">Satmap</div>
        {satmap.length === 0 && <p className="empty">No satmap layers. Add one to colour the terrain.</p>}
        {satmap.map((l, i) => row(l, i, satmap.length))}
      </div>
    </div>
  );
}

function Viewport({ result, dim, viewMode, sun }) {
  const canvasRef = useRef(null);
  const camRef = useRef({ x: 0.5, y: 0.92, height: 260, angle: Math.PI, fov: 62, horizon: 0.42 });
  const [, bump] = useState(0);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!result || !canvasRef.current) return;
    const cv = canvasRef.current;
    if (dim === "2d") {
      cv.width = result.N;
      cv.height = result.N;
      const data = renderView(result, viewMode, sun);
      cv.getContext("2d").putImageData(new ImageData(data, result.N, result.N), 0, 0);
    } else {
      const w = 960;
      const h = 540;
      cv.width = w;
      cv.height = h;
      const data = renderVoxel(result, sun, camRef.current, w, h);
      cv.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
    }
  });

  const onDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, angle: camRef.current.angle };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragRef.current) return;
    camRef.current = { ...camRef.current, angle: dragRef.current.angle - (e.clientX - dragRef.current.x) * 0.008 };
    camRef.current.horizon = Math.min(0.7, Math.max(0.2, camRef.current.horizon + (e.clientY - dragRef.current.y) * 0.001));
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    dragRef.current.angle = camRef.current.angle;
    bump((n) => n + 1);
  };
  const onWheel = (e) => {
    camRef.current = { ...camRef.current, height: Math.max(20, camRef.current.height * (e.deltaY > 0 ? 1.1 : 0.9)) };
    bump((n) => n + 1);
  };

  return (
    <div className="viewport">
      {!result && <div className="viewport-empty">Evaluating terrain…</div>}
      {dim === "2d" ? (
        <canvas ref={canvasRef} className="terrain-canvas" />
      ) : (
        <canvas
          ref={canvasRef}
          className="terrain-canvas perspective"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (dragRef.current = null)}
          onWheel={onWheel}
          title="Drag to orbit and tilt. Scroll to change camera height."
        />
      )}
    </div>
  );
}

function Inspector({ doc, layer, result, commit, setParam, updateLayer, changeType, addMask, updateMask, removeMask, changeMaskType, viewMode, setViewMode }) {
  if (!layer) {
    return (
      <div className="inspector">
        <div className="panel-heading">
          <div>
            <h2>{doc.name}</h2>
            <p>Select a layer to inspect it. Terrain and light are below.</p>
          </div>
        </div>
        <Card caption="Terrain" title="Scale and relief">
          <ParamForm
            schema={TERRAIN_PARAMS}
            values={doc.terrain}
            onChange={(k, v) => commit((d) => ({ ...d, terrain: { ...d.terrain, [k]: v } }), `terrain.${k}`)}
          />
          <p className="card-note">
            Sea level is in metres above the datum. Coastal masks and island generators key off it.
          </p>
        </Card>
        <Card caption="Light" title="Sun">
          <ParamForm
            schema={SUN_PARAMS}
            values={doc.sun}
            onChange={(k, v) => commit((d) => ({ ...d, sun: { ...d.sun, [k]: v } }), `sun.${k}`)}
          />
          <p className="card-note">The sun shades the relief and drives sun-exposure satmaps.</p>
        </Card>
        {result && (
          <Card caption="Readout" title="Terrain">
            <div className="metrics">
              <div><span>Min</span><b>{result.stats.minM.toFixed(0)} m</b></div>
              <div><span>Max</span><b>{result.stats.maxM.toFixed(0)} m</b></div>
              <div><span>Mean</span><b>{result.stats.meanM.toFixed(0)} m</b></div>
              <div><span>Sediment</span><b>{result.stats.sedM.toFixed(2)} m</b></div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  const info = layerInfo(layer.type);
  const isSatmap = layer.kind === "satmap";
  const timing = result?.stats?.layers?.find((x) => x.id === layer.id);
  const errs = result?.stats?.errors?.filter((e) => e.id === layer.id) || [];
  const groups = isSatmap
    ? [["Satmap", [["satmap", SATMAP_TYPE.label]]]]
    : HEIGHT_GROUPS;

  return (
    <div className="inspector" key={layer.id}>
      <div className="panel-heading">
        <div>
          <p className="kicker">{CATEGORY_NAME[info.category]}</p>
          <input className="name-input" value={layer.name} onChange={(e) => updateLayer(layer.id, { name: e.target.value }, `${layer.id}.name`)} />
        </div>
      </div>
      <Card caption="Type" title={info.label} note={info.blurb}>
        <Select
          label="Layer type"
          value={layer.type}
          grouped={isSatmap ? groups : HEIGHT_GROUPS.map(([g, items]) => [g, items])}
          onChange={(t) => changeType(layer.id, t)}
        />
        <Toggle label="Enabled" checked={layer.enabled !== false} onChange={(v) => updateLayer(layer.id, { enabled: v })} />
      </Card>

      <Card caption="Source" title={isSatmap ? "Colour source" : "Parameters"}>
        <ParamForm
          schema={info.params}
          values={layer.params}
          onChange={(k, v) => setParam(layer.id, k, v)}
        />
      </Card>

      <Card caption="Blend" title="Output">
        {!isSatmap && info.category === "generator" && (
          <Select
            label="Combine with layers below"
            value={layer.blend || "replace"}
            options={BLEND_HEIGHT}
            onChange={(v) => updateLayer(layer.id, { blend: v }, `${layer.id}.blend`)}
          />
        )}
        {isSatmap && (
          <Select
            label="Blend mode"
            value={layer.params.blend || "over"}
            options={BLEND_MODES}
            onChange={(v) => setParam(layer.id, "blend", v)}
          />
        )}
        <Slider
          def={{ label: "Opacity", min: 0, max: 1, step: 0.01, def: 1, unit: "×" }}
          value={layer.opacity ?? 1}
          onChange={(v) => updateLayer(layer.id, { opacity: v }, `${layer.id}.opacity`)}
        />
      </Card>

      <Card caption="Masks" title="Where this layer acts" note="Masks multiply the layer's effect. Several masks combine with each mask's operator. No mask means everywhere.">
        {layer.masks.length === 0 && <p className="empty">No masks. The layer applies everywhere.</p>}
        {layer.masks.map((m) => (
          <MaskCard
            key={m.id}
            mask={m}
            onType={(t) => changeMaskType(layer.id, m.id, t)}
            onPatch={(patch, key) => updateMask(layer.id, m.id, patch, key)}
            onParam={(k, v) => updateMask(layer.id, m.id, (mm) => ({ params: { ...mm.params, [k]: v } }), `${m.id}.${k}`)}
            onRemove={() => removeMask(layer.id, m.id)}
          />
        ))}
        <div className="add-row">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addMask(layer.id, e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">+ Add mask…</option>
            {MASK_LIST.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card caption="Output" title="Layer readout">
        <div className="metrics">
          <div><span>Time</span><b>{timing ? `${timing.ms.toFixed(0)} ms` : "—"}</b></div>
          <div><span>Cached</span><b>{timing?.cached ? "yes" : "no"}</b></div>
        </div>
        {errs.map((e, i) => (
          <p key={i} className="err">{e.message}</p>
        ))}
        {viewMode === "mask" && <p className="card-note">The viewport is showing this layer's combined mask.</p>}
        {!isSatmap && (
          <button className="wide" onClick={() => setViewMode("mask")}>
            Show this layer's mask in the viewport
          </button>
        )}
      </Card>
    </div>
  );
}

function MaskCard({ mask, onType, onPatch, onParam, onRemove }) {
  const def = MASKS[mask.type];
  return (
    <div className={`mask-card ${mask.enabled === false ? "off" : ""}`}>
      <div className="mask-head">
        <Select value={mask.type} options={MASK_LIST} onChange={onType} />
        <button title="Remove mask" onClick={onRemove}>✕</button>
      </div>
      <div className="mask-toggles">
        <Toggle label="On" checked={mask.enabled !== false} onChange={(v) => onPatch({ enabled: v })} />
        <Toggle label="Invert" checked={!!mask.invert} onChange={(v) => onPatch({ invert: v })} />
      </div>
      <Select label="Combine" value={mask.op || "multiply"} options={MASK_OPS} onChange={(v) => onPatch({ op: v })} />
      <Slider
        def={{ label: "Strength", min: 0, max: 1, step: 0.01, def: 1, unit: "×" }}
        value={mask.strength ?? 1}
        onChange={(v) => onPatch({ strength: v }, `${mask.id}.strength`)}
      />
      <p className="card-note">{def?.blurb}</p>
      <ParamForm schema={def.params} values={mask.params} onChange={onParam} />
    </div>
  );
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

createRoot(document.getElementById("root")).render(<App />);
