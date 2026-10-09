// Centre column: the satmap (2D) or the perspective preview (3D), with the satmap dropdown and export actions.
import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Download, Image as ImageIcon, Map as Map2D, Box, LoaderCircle } from 'lucide-react';
import Terrain3D from './Terrain3D.jsx';
import { SATMAP_MODES, legendFor } from '../satmap.js';
import { Select } from './controls.jsx';

export default function Viewport({ result, rgba, view, onView, computing, progress, error, onUndo, canUndo, onExportHeight, onExportSatmap, worldSize, seaLevel }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const n = result?.n || 256;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rgba) return;
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    const img = new ImageData(new Uint8ClampedArray(rgba), n, n);
    ctx.putImageData(img, 0, 0);
  }, [rgba, n]);

  const onMove = (e) => {
    if (!result) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * n)));
    const y = Math.min(n - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * n)));
    const i = y * n + x;
    setHover({ x, y, h: result.height[i], s: result.slope[i], f: result.flow[i] * result.cs * result.cs });
  };

  const legend = legendFor(view.satmap, result);
  const mode = SATMAP_MODES.find((m) => m.id === view.satmap) || SATMAP_MODES[0];

  return (
    <section className="viewport" aria-label="Landscape viewport">
      <div className="viewport-bar">
        <div className="segmented" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view.mode === '2d'} className={view.mode === '2d' ? 'on' : ''} onClick={() => onView({ mode: '2d' })}><Map2D size={14} />Map</button>
          <button role="tab" aria-selected={view.mode === '3d'} className={view.mode === '3d' ? 'on' : ''} onClick={() => onView({ mode: '3d' })}><Box size={14} />Perspective</button>
        </div>
        <div className="satmap-select">
          <Select label="Satmap" value={view.satmap} options={SATMAP_MODES} onChange={(v) => onView({ satmap: v })} />
        </div>
        <div className="viewport-actions">
          <button className="ls-chip-button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={14} />Undo</button>
          <button className="ls-chip-button" onClick={onExportHeight} disabled={!result} title="Export 16-bit heightmap"><Download size={14} />.r16</button>
          <button className="ls-chip-button" onClick={onExportSatmap} disabled={!rgba} title="Export satmap PNG"><ImageIcon size={14} />.png</button>
        </div>
      </div>

      <div className="viewport-stage">
        {view.mode === '2d' ? (
          <div className="map-frame">
            {rgba ? (
              <canvas ref={canvasRef} className="map-canvas" onMouseMove={onMove} onMouseLeave={() => setHover(null)} aria-label={`Satmap: ${mode.label}`} />
            ) : (
              <div className="map-placeholder">{error ? 'The terrain failed to compute.' : 'Computing terrain…'}</div>
            )}
          </div>
        ) : (
          <div className="perspective-frame">
            {rgba && result ? <Terrain3D result={result} rgba={rgba} exaggeration={view.exaggeration} worldSize={worldSize} /> : <div className="map-placeholder">Computing terrain…</div>}
          </div>
        )}
        {computing && (
          <div className="compute-badge"><LoaderCircle size={14} className="spin" />{progress ? `${progress.name}` : 'Computing'}{progress ? ` · ${progress.step}/${progress.total}` : ''}</div>
        )}
        {error && <div className="error-badge">{error}</div>}
      </div>

      <div className="viewport-foot">
        <div className="legend">
          <span className="legend-bar" style={{ background: legendGradient(view.satmap) }} />
          <div className="legend-labels">
            {legend.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
        <div className="readout">
          {hover && view.mode === '2d' ? (
            <>
              <span>x {hover.x} · y {hover.y}</span>
              <strong>{Math.round(hover.h).toLocaleString()} m</strong>
              <span>slope {hover.s.toFixed(1)}°</span>
              <span>drainage {formatArea(hover.f)}</span>
            </>
          ) : result ? (
            <>
              <span>{Math.round(worldSize)} m square</span>
              <span>{result.n}×{result.n} cells · {Math.round(result.cs)} m</span>
              <span>sea {Math.round(seaLevel)} m</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
      </div>
    </section>
  );
}

function formatArea(m2) {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
  return `${Math.round(m2 / 1e3)} thousand m²`;
}

function legendGradient(mode) {
  const stops = {
    composite: ['#2f5a3e', '#8f7c52', '#6d6a64', '#f4f5f6'],
    rivers: ['#0a1838', '#4d7f8e', '#8fd2e0'],
    sediment: ['#37373d', '#8c7348', '#fad36f'],
    protrusions: ['#1f4088', '#8c8c8c', '#f7b351'],
    elevation: ['#1f4e6b', '#7f9d57', '#c4a36b', '#ffffff'],
    slope: ['#33733f', '#d1cc59', '#d86b33', '#b21f1f'],
    erosion: ['#2e1a4d', '#cc4d66', '#fff19a'],
    wetness: ['#b29b73', '#5a9a9a', '#14306a'],
  }[mode] || ['#444', '#888'];
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
