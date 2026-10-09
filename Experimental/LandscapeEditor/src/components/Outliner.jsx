// Left column: the layer stack (generators, modifiers, erosion and their masks), the add menu, and presets.
import React, { useState } from 'react';
import { Mountain, Layers, Droplets, Waves, Wind, Snowflake, Shapes, ChevronDown, ChevronRight, Eye, EyeOff, Plus, X, Filter, ChevronUp, Trash2, Copy, Sparkles, Map as MapIcon } from 'lucide-react';
import { GENERATORS } from '../terrain/generators.js';
import { MODIFIERS } from '../terrain/modifiers.js';
import { EROSIONS } from '../terrain/erosion.js';
import { MASKS } from '../terrain/masks.js';
import { KINDS, typesOf } from '../terrain/catalog.js';
import { PRESETS } from '../terrain/presets.js';

const TYPE_ICON = {
  fbm: Waves, multifractal: Sparkles, ridge: Mountain, mountain: Mountain, voronoi: Shapes, dunes: Wind,
  mesa: Layers, hills: Mountain, shield: Mountain, ramp: Layers,
  stratify: Layers, terrace: Layers, cliff: Shapes, rift: Droplets, smooth: Waves, sharpen: Shapes, remap: Sparkles,
  hydraulic: Droplets, fluvial: Waves, thermal: Layers, aeolian: Wind, glacial: Snowflake,
};
const KIND_ICON = { generator: Mountain, modifier: Shapes, erosion: Droplets };

export function iconFor(layer) {
  return TYPE_ICON[layer.type] || KIND_ICON[layer.kind] || Layers;
}

export function typeLabel(layer) {
  const registry = { generator: GENERATORS, modifier: MODIFIERS, erosion: EROSIONS }[layer.kind];
  return registry?.[layer.type]?.label || layer.type;
}

export default function Outliner({
  layers, selected, onSelect, onToggleLayer, onToggleMask, onMove, onRemoveLayer, onDuplicateLayer,
  onAddLayer, onAddMask, onRemoveMask, onApplyPreset, presetId, worldLabel, computing, progress,
}) {
  const [adding, setAdding] = useState(false);
  const [maskMenu, setMaskMenu] = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(true);
  const worldSelected = selected.kind === 'world';

  return (
    <aside className="outliner landscape-outliner">
      <div className="brand">
        <div className="brand-symbol"><Layers size={24} strokeWidth={1.5} /></div>
        <span>frontier<span className="brand-dot">.</span></span>
        <span className="version">LANDSCAPE / 01</span>
      </div>
      <div className="scene-label">WORKSPACE <span className={`status-dot ${computing ? 'busy' : ''}`} /></div>
      <div className="scene-title"><span>{worldLabel}</span><span className="scene-extension">.terrain</span></div>

      <div className="outliner-heading">
        <h2>Layer stack <span>{String(layers.length).padStart(2, '0')}</span></h2>
        <button className="icon-button" aria-label="Add layer" title="Add layer" onClick={() => setAdding(!adding)}>
          {adding ? <X size={17} /> : <Plus size={17} />}
        </button>
      </div>

      {adding && (
        <div className="add-menu" role="menu">
          {KINDS.map((kind) => (
            <div key={kind.id} className="add-group">
              <div className="add-group-title">{kind.label} <span>{kind.hint}</span></div>
              {typesOf(kind.id).map((def) => {
                const Icon = TYPE_ICON[def.id] || KIND_ICON[kind.id];
                return (
                  <button
                    key={def.id}
                    role="menuitem"
                    className="add-item"
                    title={def.description}
                    onClick={() => {
                      onAddLayer(kind.id, def.id);
                      setAdding(false);
                    }}
                  >
                    <Icon size={14} />
                    <span>{def.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="stack-scroll">
        <div className={`tree-row world-row ${worldSelected ? 'selected' : ''}`} onClick={() => onSelect({ kind: 'world' })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect({ kind: 'world' })}>
          <div className="row-icon"><MapIcon size={16} /></div>
          <div className="row-text"><strong>Landscape</strong><span>World · satmaps · export</span></div>
        </div>

        <div className="stack-hint">Applied top to bottom</div>

        {layers.length === 0 && <div className="ls-empty pad">No layers. Use + to add a generator.</div>}

        {layers.map((layer, index) => {
          const Icon = iconFor(layer);
          const rowSelected = selected.kind === 'layer' && selected.id === layer.id;
          return (
            <div key={layer.id} className="stack-item">
              <div
                className={`tree-row layer-row ${rowSelected ? 'selected' : ''} ${layer.enabled === false ? 'hidden-object' : ''}`}
                onClick={() => onSelect({ kind: 'layer', id: layer.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect({ kind: 'layer', id: layer.id })}
                style={{ '--row-accent': layerAccent(layer) }}
              >
                <button
                  className="visibility"
                  aria-label={layer.enabled === false ? `Enable ${layer.name}` : `Disable ${layer.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLayer(layer.id);
                  }}
                >
                  {layer.enabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <div className="row-icon kind-icon"><Icon size={16} /></div>
                <div className="row-text">
                  <strong>{layer.name}</strong>
                  <span>{KIND_TAG[layer.kind]} · {typeLabel(layer)}{layer.masks?.length ? ` · ${layer.masks.length} mask${layer.masks.length > 1 ? 's' : ''}` : ''}</span>
                </div>
                <div className="row-actions">
                  <button aria-label="Move up" title="Move up" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMove(layer.id, -1); }}><ChevronUp size={13} /></button>
                  <button aria-label="Move down" title="Move down" disabled={index === layers.length - 1} onClick={(e) => { e.stopPropagation(); onMove(layer.id, 1); }}><ChevronDown size={13} /></button>
                  <button aria-label="Duplicate layer" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicateLayer(layer.id); }}><Copy size={12} /></button>
                  <button aria-label="Delete layer" title="Delete" onClick={(e) => { e.stopPropagation(); onRemoveLayer(layer.id); }}><Trash2 size={12} /></button>
                </div>
              </div>

              {(layer.masks || []).map((mask) => {
                const MaskIcon = mask.type && MASKS[mask.type] ? Filter : Filter;
                const maskSelected = selected.kind === 'mask' && selected.maskId === mask.id;
                return (
                  <div
                    key={mask.id}
                    className={`tree-row mask-row ${maskSelected ? 'selected' : ''} ${mask.enabled === false ? 'hidden-object' : ''}`}
                    onClick={() => onSelect({ kind: 'mask', layerId: layer.id, maskId: mask.id })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelect({ kind: 'mask', layerId: layer.id, maskId: mask.id })}
                  >
                    <button
                      className="visibility"
                      aria-label={mask.enabled === false ? 'Enable mask' : 'Disable mask'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMask(layer.id, mask.id);
                      }}
                    >
                      {mask.enabled === false ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <div className="row-icon mask-icon"><MaskIcon size={13} /></div>
                    <div className="row-text">
                      <strong>{mask.name}</strong>
                      <span>Mask{mask.invert ? ' · inverted' : ''}{mask.breakup && mask.breakup !== 'none' ? ' · broken up' : ''}</span>
                    </div>
                    <div className="row-actions">
                      <button aria-label="Remove mask" title="Remove mask" onClick={(e) => { e.stopPropagation(); onRemoveMask(layer.id, mask.id); }}><X size={12} /></button>
                    </div>
                  </div>
                );
              })}

              <div className="mask-add-line">
                {maskMenu === layer.id ? (
                  <div className="mask-menu">
                    {Object.values(MASKS).map((m) => (
                      <button
                        key={m.id}
                        className="add-item"
                        title={m.description}
                        onClick={() => {
                          onAddMask(layer.id, m.id);
                          setMaskMenu(null);
                        }}
                      >
                        <span>{m.label}</span>
                      </button>
                    ))}
                    <button className="add-item muted-item" onClick={() => setMaskMenu(null)}>Cancel</button>
                  </div>
                ) : (
                  <button className="mask-add" onClick={() => setMaskMenu(layer.id)}><Plus size={11} /> Mask</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="presets-block">
        <button className="presets-toggle" onClick={() => setPresetsOpen(!presetsOpen)} aria-expanded={presetsOpen}>
          {presetsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>Presets</span>
          <small>{PRESETS.length}</small>
        </button>
        {presetsOpen && (
          <div className="preset-list">
            {PRESETS.map((p) => (
              <button key={p.id} className={`preset-item ${presetId === p.id ? 'active' : ''}`} onClick={() => onApplyPreset(p.id)} title={p.description}>
                <span className="preset-swatch" style={{ background: `linear-gradient(90deg, ${p.palette.rock}, ${p.palette.soil}, ${p.palette.veg})` }} />
                <span className="preset-text"><strong>{p.name}</strong><small>{p.subtitle}</small></span>
              </button>
            ))}
          </div>
        )}
        {computing && progress && <div className="compute-line">Computing {progress.step}/{progress.total} · {progress.name}</div>}
      </div>

      <div className="outliner-bottom">
        <div className="world-icon"><Mountain size={18} /></div>
        <div><strong>{worldLabel}</strong><span>Local project</span></div>
        <span className="little-dot" />
      </div>
    </aside>
  );
}

const KIND_TAG = { generator: 'Shape', modifier: 'Sculpt', erosion: 'Erosion' };

function layerAccent(layer) {
  return { generator: '#d6a078', modifier: '#c2b783', erosion: '#81b8c8' }[layer.kind];
}
