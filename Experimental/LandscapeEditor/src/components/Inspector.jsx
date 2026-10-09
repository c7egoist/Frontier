// Right column: the inspector. Shows the selected layer, mask, or the landscape's world settings.
import React from 'react';
import { ChevronRight, RotateCcw, Trash2, Copy, ChevronUp, ChevronDown, Plus, Check, Layers, Sliders, Blend, Droplets, Map as MapIcon, Palette, Download, Eye, Sparkles, Wind, Shuffle, Mountain } from 'lucide-react';
import { GENERATORS } from '../terrain/generators.js';
import { MODIFIERS } from '../terrain/modifiers.js';
import { EROSIONS } from '../terrain/erosion.js';
import { MASKS, BREAKUP_OPTIONS } from '../terrain/masks.js';
import { BLEND_MODES } from '../terrain/pipeline.js';
import { KINDS, typesOf, defaultParams, createMask } from '../terrain/catalog.js';
import { SATMAP_MODES } from '../satmap.js';
import { Card, Slider, Select, Toggle, Pill } from './controls.jsx';
import { ProfileGraph, MaskCurve } from './graphics.jsx';
import { iconFor, typeLabel } from './Outliner.jsx';

const REGISTRY = { generator: GENERATORS, modifier: MODIFIERS, erosion: EROSIONS };
const ACCENT = { generator: '#d6a078', modifier: '#c2b783', erosion: '#81b8c8' };

function Params({ defs, values, onParam }) {
  return defs.map((p) => (
    <Slider key={p.key} label={p.label} value={values[p.key] ?? p.default} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={(v) => onParam(p.key, v)} />
  ));
}

function fmtVolume(m3) {
  if (!m3 || Math.abs(m3) < 1) return '0';
  if (Math.abs(m3) >= 1e9) return `${(m3 / 1e9).toFixed(2)} km³`;
  if (Math.abs(m3) >= 1e6) return `${(m3 / 1e6).toFixed(1)} Mm³`;
  return `${(m3 / 1e3).toFixed(0)} thousand m³`;
}

export function LayerInspector({ layer, index, count, logEntry, before, after, seaLevel, onPatch, onParam, onType, onToggle, onDelete, onDuplicate, onMove, onReset, onSelectMask, onAddMask, onRemoveMask, onToggleMask }) {
  const registry = REGISTRY[layer.kind];
  const def = registry[layer.type];
  const Icon = iconFor(layer);
  const accent = ACCENT[layer.kind];
  const enabled = layer.enabled !== false;
  const typeOptions = typesOf(layer.kind).map((d) => ({ id: d.id, label: d.label }));
  const kindLabel = KINDS.find((k) => k.id === layer.kind)?.label;
  const pct = (v) => `${v.toFixed(1)}`;

  return (
    <section className="inspector" style={{ '--accent': accent }}>
      <header className="inspector-top">
        <div>
          Inspector <ChevronRight size={13} />
          <span>{kindLabel}</span>
        </div>
        <span className="save-status saved"><Check size={13} />Saved locally</span>
      </header>
      <div className="inspector-content">
        <div className="object-header">
          <div className="object-title">
            <div>
              <div className="eyebrow">{kindLabel} · {typeLabel(layer)}</div>
              <input className="name-input" aria-label="Layer name" value={layer.name} onChange={(e) => onPatch({ name: e.target.value })} />
            </div>
          </div>
          <div className="object-actions">
            <button className="reset" title="Reset parameters to defaults" onClick={onReset}><RotateCcw size={14} />Reset</button>
            <button className="reset" title="Duplicate" onClick={onDuplicate}><Copy size={14} /></button>
            <button className="reset" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} /></button>
            <button className="reset" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><ChevronDown size={14} /></button>
            <button className="reset danger" title="Delete layer" onClick={onDelete}><Trash2 size={14} /></button>
            <Toggle label={enabled ? 'Enabled' : 'Disabled'} checked={enabled} onChange={onToggle} />
          </div>
        </div>
        <div className="section-label">
          <span>PROPERTIES</span>
          <span>{def.description.length > 60 ? def.label : def.label}</span>
        </div>

        <div className={`cards ${layer.kind}`}>
          <Card title="Operation" icon={Icon} accent={accent} wide>
            <Select label="Type" value={layer.type} options={typeOptions} onChange={onType} />
            <p className="muted">{def.description}</p>
            {layer.kind === 'generator' && (
              <div className="ls-two">
                <Slider label="Elevation range" value={layer.height ?? 900} min={0} max={8000} step={10} unit="m" onChange={(v) => onPatch({ height: v })} />
                <Slider label="Base elevation" value={layer.base ?? 0} min={-1000} max={4000} step={10} unit="m" onChange={(v) => onPatch({ base: v })} />
              </div>
            )}
          </Card>

          <Card title="Blend" icon={Blend} accent={accent}>
            {layer.kind === 'generator' ? (
              <Select label="Blend mode" value={layer.blend || 'replace'} options={BLEND_MODES} onChange={(v) => onPatch({ blend: v })} />
            ) : (
              <p className="muted">Sculpt and erosion layers replace the surface through their masks.</p>
            )}
            <Slider label="Opacity" value={layer.opacity ?? 1} min={0} max={1} step={0.01} onChange={(v) => onPatch({ opacity: v })} />
            <div className="range-labels"><span>Masked out</span><span>Full strength</span></div>
          </Card>

          {layer.kind === 'erosion' && (
            <Card title="Erosion result" icon={Droplets} accent={accent}>
              <div className="metric">{fmtVolume(logEntry?.eroded)}</div>
              <p className="muted">Removed from the surface · redeposited {fmtVolume(logEntry?.deposited)}</p>
              <div className="ls-stat-row">
                <span>Model runtime</span><strong>{logEntry ? `${logEntry.ms} ms` : '—'}</strong>
              </div>
            </Card>
          )}

          <Card title="Cross-section" icon={Mountain} accent={accent} wide>
            <ProfileGraph before={before} after={after} seaLevel={seaLevel} />
            <p className="muted">A north-south slice through the middle of the map, before and after this layer.</p>
          </Card>

          <Card title={`${def.label} parameters`} icon={Sliders} accent={accent} wide>
            <div className="ls-two">
              <Params defs={def.params} values={layer.params || {}} onParam={onParam} />
            </div>
          </Card>

          <Card title="Masks" icon={Layers} accent={accent} wide>
            {(layer.masks || []).length === 0 && <p className="muted">No masks. The layer applies everywhere.</p>}
            <div className="ls-mask-list">
              {(layer.masks || []).map((m) => (
                <div key={m.id} className={`ls-mask-chip ${m.enabled === false ? 'off' : ''}`}>
                  <button className="ls-chip-main" onClick={() => onSelectMask(m.id)}>
                    <Eye size={13} />
                    <span>{MASKS[m.type]?.label || m.type}</span>
                    {m.invert && <small>inverted</small>}
                    {m.breakup && m.breakup !== 'none' && <small>broken up</small>}
                  </button>
                  <button className="ls-chip-x" aria-label="Toggle mask" onClick={() => onToggleMask(m.id)}>{m.enabled === false ? 'off' : 'on'}</button>
                  <button className="ls-chip-x" aria-label="Remove mask" onClick={() => onRemoveMask(m.id)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <div className="ls-add-mask">
              <Select
                label="Add mask"
                value=""
                ariaLabel="Add mask"
                options={[{ id: '', label: 'Choose a mask…' }, ...Object.values(MASKS).map((m) => ({ id: m.id, label: m.label }))]}
                onChange={(v) => v && onAddMask(v)}
              />
            </div>
          </Card>
        </div>
        <footer className="inspector-footer">
          <span><span className="footer-dot" />Changes recompute the terrain in the background</span>
          <span>{layer.name} <span className="footer-slash">/</span> {def.label}</span>
        </footer>
      </div>
    </section>
  );
}

export function MaskInspector({ layer, mask, onPatch, onParam, onDelete, onToggle, onBack }) {
  const def = MASKS[mask.type] || MASKS.noise;
  const typeOptions = Object.values(MASKS).map((m) => ({ id: m.id, label: m.label }));
  const set = (key, value) => onPatch({ [key]: value });
  return (
    <section className="inspector" style={{ '--accent': '#a6c9b8' }}>
      <header className="inspector-top">
        <div>
          Inspector <ChevronRight size={13} /> <span>Mask</span>
        </div>
        <button className="reset" onClick={onBack}>Back to layer</button>
      </header>
      <div className="inspector-content">
        <div className="object-header">
          <div className="object-title">
            <div>
              <div className="eyebrow">Mask · {layer.name}</div>
              <h1>{def.label}</h1>
            </div>
          </div>
          <div className="object-actions">
            <button className="reset danger" onClick={onDelete}><Trash2 size={14} />Remove</button>
            <Toggle label={mask.enabled === false ? 'Disabled' : 'Enabled'} checked={mask.enabled !== false} onChange={onToggle} />
          </div>
        </div>
        <div className="section-label"><span>PROPERTIES</span><span>Gates the layer · 0 hides, 1 applies fully</span></div>
        <div className="cards mask">
          <Card title="Mask type" icon={Sparkles} accent="#a6c9b8" wide>
            <Select label="Type" value={mask.type} options={typeOptions} onChange={(v) => onPatch({ type: v, name: MASKS[v].label, params: defaultParams(MASKS[v]) })} />
            <p className="muted">{def.description}</p>
          </Card>

          <Card title="Response" icon={Blend} accent="#a6c9b8" wide>
            <MaskCurve type={mask.type} params={mask.params} />
          </Card>

          <Card title="Parameters" icon={Sliders} accent="#a6c9b8" wide>
            <div className="ls-two">
              {def.params.map((p) => (
                <Slider key={p.key} label={p.label} value={mask.params[p.key] ?? p.default} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={(v) => onParam(p.key, v)} />
              ))}
            </div>
          </Card>

          <Card title="Shaping" icon={Layers} accent="#a6c9b8">
            <Toggle label={mask.invert ? 'Inverted' : 'Normal'} checked={!!mask.invert} onChange={(v) => set('invert', v)} />
            <div className="ls-spacer" />
            <Slider label="Strength" value={mask.strength ?? 1} min={0} max={1} step={0.01} onChange={(v) => set('strength', v)} />
          </Card>

          <Card title="Breakup" icon={Sparkles} accent="#a6c9b8">
            <Select label="Generator" value={mask.breakup || 'none'} options={BREAKUP_OPTIONS} onChange={(v) => set('breakup', v)} />
            <Slider label="Breakup amount" value={mask.breakupAmount ?? 0.25} min={0} max={1} step={0.01} onChange={(v) => set('breakupAmount', v)} />
            <Slider label="Breakup scale" value={mask.breakupScale ?? 4} min={1} max={16} step={0.5} unit="tiles" onChange={(v) => set('breakupScale', v)} />
          </Card>
        </div>
        <footer className="inspector-footer"><span><span className="footer-dot" />Masks multiply together, then the layer's opacity applies</span><span>{mask.name}</span></footer>
      </div>
    </section>
  );
}

export function WorldInspector({ project, result, log, onSettings, onView, onApplyPreset, onExportHeight, onExportSatmap, rgbaReady }) {
  const { settings, view, palette, presetId } = project;
  const preset = presetId ? { name: presetId } : null;
  const satmap = SATMAP_MODES.find((m) => m.id === view.satmap) || SATMAP_MODES[0];
  return (
    <section className="inspector" style={{ '--accent': '#d6a078' }}>
      <header className="inspector-top">
        <div>Inspector <ChevronRight size={13} /> <span>Landscape</span></div>
        <span className="save-status saved"><Check size={13} />Saved locally</span>
      </header>
      <div className="inspector-content">
        <div className="object-header">
          <div className="object-title">
            <div>
              <div className="eyebrow">World · terrain settings</div>
              <h1>Landscape</h1>
            </div>
          </div>
        </div>
        <div className="section-label"><span>PROPERTIES</span><span>Grid, scale, sea level and the satellite look</span></div>
        <div className="cards world">
          <Card title="Scale" icon={MapIcon} accent="#d6a078" wide>
            <div className="ls-two">
              <Slider label="World size" value={settings.worldSize} min={1000} max={15000} step={100} unit="m" onChange={(v) => onSettings({ worldSize: v })} hint="Sets the cell size; erosion, slope and drainage use real metres." />
              <Slider label="Max elevation" value={settings.maxElevation} min={300} max={8000} step={50} unit="m" onChange={(v) => onSettings({ maxElevation: v })} hint="Used for the 16-bit export range and the elevation satmap." />
              <Slider label="Sea level" value={settings.seaLevel} min={-1000} max={800} step={5} unit="m" onChange={(v) => onSettings({ seaLevel: v })} hint="Below this height the terrain is water." />
              <Slider label="Grid resolution" value={settings.resolution} min={96} max={320} step={32} unit="cells" onChange={(v) => onSettings({ resolution: v })} hint="Higher is slower. 256 is the default." />
            </div>
            <div className="seed-row">
              <label className="ls-select-row">
                <span className="ls-select-label">Seed</span>
                <input className="seed-input" type="number" aria-label="Seed" value={settings.seed} onChange={(e) => onSettings({ seed: Number(e.target.value) || 0 })} />
              </label>
              <button className="seed-shuffle" onClick={() => onSettings({ seed: Math.floor(Math.random() * 99999) })}><Shuffle size={13} />New seed</button>
            </div>
          </Card>

          <Card title="Satmap" icon={Palette} accent="#a6c9b8" wide>
            <Select label="Satmap" value={view.satmap} options={SATMAP_MODES} onChange={(v) => onView({ satmap: v })} />
            <p className="muted">{satmap.hint}</p>
            <div className="ls-two">
              <Slider label="Stylise" value={view.stylise} min={0} max={1} step={0.01} onChange={(v) => onView({ stylise: v })} hint="0 is a naturalistic satellite read. 1 is a poster-like palette." />
              <Slider label="Hillshade" value={view.hillshade} min={0} max={1} step={0.01} onChange={(v) => onView({ hillshade: v })} />
              <Slider label="Snow line" value={Math.min(view.snowLine, 8000)} min={0} max={8000} step={10} unit="m" onChange={(v) => onView({ snowLine: v })} hint="Snow appears above this elevation on steep ground only." />
              <Slider label="3D exaggeration" value={view.exaggeration} min={0.2} max={4} step={0.05} unit="×" onChange={(v) => onView({ exaggeration: v })} />
            </div>
            {palette && (
              <div className="palette-row">
                {Object.entries(palette).map(([k, c]) => (
                  <span key={k} className="palette-chip" title={k} style={{ background: c }} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Export" icon={Download} accent="#a6c9b8">
            <p className="muted">16-bit heightmap for engine import, plus the satmap as an image.</p>
            <div className="ls-button-row">
              <button className="ls-button" onClick={onExportHeight} disabled={!result}>Heightmap .r16</button>
              <button className="ls-button" onClick={onExportSatmap} disabled={!rgbaReady}>Satmap .png</button>
            </div>
          </Card>

          <Card title="Pipeline" icon={Wind} accent="#a6c9b8" wide>
            {log && log.length ? (
              <div className="ls-log">
                {log.map((entry) => (
                  <div key={entry.id} className="ls-log-row">
                    <span>{entry.name}</span>
                    <strong>{entry.ms} ms</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Waiting for the first evaluation.</p>
            )}
          </Card>
        </div>
        <footer className="inspector-footer">
          <span><span className="footer-dot" />Saved locally · layers evaluate top to bottom</span>
          <span>{result ? `${result.n} × ${result.n} grid · ${Math.round(result.n * result.cs)} m` : 'Landscape'}</span>
        </footer>
      </div>
    </section>
  );
}
