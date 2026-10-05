import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Eye, EyeOff, Route, Landmark, Waypoints, Globe, X,
} from 'lucide-react';
import type { Project, Selection } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';

export type NewSplineKind = 'road' | 'beam' | 'arch';

interface OutlinerProps {
  project: Project;
  network: BuiltNetwork;
  selection: Selection;
  menuNonce: number;
  onSelect: (s: Selection) => void;
  onToggleVisibility: (splineId: string) => void;
  onAddSpline: (kind: NewSplineKind) => void;
  onRename: (name: string) => void;
}

export function Outliner({
  project, network, selection, menuNonce, onSelect, onToggleVisibility, onAddSpline, onRename,
}: OutlinerProps) {
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const firstMenu = useRef(true);
  useEffect(() => {
    if (firstMenu.current) {
      firstMenu.current = false;
      return;
    }
    setAddOpen(true);
  }, [menuNonce]);

  const q = query.trim().toLowerCase();
  const splines = useMemo(
    () => project.splines.filter((s) => !q || s.name.toLowerCase().includes(q)),
    [project.splines, q],
  );
  const junctions = useMemo(
    () => network.junctions.filter((j) => !q || j.topology.toLowerCase().includes(q)),
    [network.junctions, q],
  );

  const selSplineId = selection.kind === 'spline' || selection.kind === 'node' ? selection.splineId : null;

  return (
    <aside className="outliner">
      <div className="brand">
        <span className="brand-symbol">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19 L19 4" />
            <path d="M9 4 h10 v10" />
          </svg>
        </span>
        RoadWorks<span className="brand-dot">.</span>
        <span className="version">EDITOR</span>
      </div>

      <div className="scene-label">
        <span>SCENE</span>
        <span className="status-dot" />
      </div>
      <div className="scene-title">
        <input
          value={project.name}
          onChange={(e) => onRename(e.target.value)}
          spellCheck={false}
          style={{
            background: 'transparent', border: 0, color: 'inherit', font: 'inherit',
            width: '100%', letterSpacing: '-0.4px', padding: 0,
          }}
        />
        <span className="scene-extension">.road</span>
      </div>

      <div className="outliner-heading">
        <h2>
          Outliner
          <span>{project.splines.length + network.junctions.length}</span>
        </h2>
        <button className="icon-button" title="Add spline (Shift+A)" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      <div className="search">
        <Search size={14} />
        <input placeholder="Filter objects" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {addOpen && (
        <div className="add-menu">
          <p>New spline</p>
          <button onClick={() => { onAddSpline('road'); setAddOpen(false); }}>
            <Route size={14} style={{ color: '#a8bbeb' }} /> Road spline
          </button>
          <button onClick={() => { onAddSpline('beam'); setAddOpen(false); }}>
            <Landmark size={14} style={{ color: '#e8b65f' }} /> Beam bridge
          </button>
          <button onClick={() => { onAddSpline('arch'); setAddOpen(false); }}>
            <Landmark size={14} style={{ color: '#d5a4c4' }} /> Arch bridge
          </button>
        </div>
      )}

      <div className="tree-scroll">
        <div className="group">
          <button className="group-label" onClick={() => setCollapsed((c) => ({ ...c, splines: !c.splines }))}>
            {collapsed.splines ? '▸' : '▾'} SPLINES
            <span className="group-count">{splines.length}</span>
          </button>
          {!collapsed.splines && splines.map((s) => {
            const isBridge = s.bridge.enabled;
            const Icon = isBridge ? Landmark : Route;
            const selected = s.id === selSplineId;
            return (
              <div key={s.id} className={`tree-row ${selected ? 'selected' : ''} ${s.visible ? '' : 'hidden-object'}`}>
                <button
                  className="object-button"
                  onClick={() => onSelect({ kind: 'spline', splineId: s.id })}
                  title={`${s.name} — ${s.nodes.length} nodes`}
                >
                  <Icon size={15} style={{ color: s.color }} />
                  <span className="row-text">
                    <strong>{s.name}</strong>
                    <small>
                      {s.nodes.length} pts · {isBridge ? (s.bridge.type === 'arch' ? 'arch bridge' : 'beam bridge') : `${s.cross.width.toFixed(0)} m road`}
                    </small>
                  </span>
                  {isBridge && <span className="row-badge">{s.bridge.type.toUpperCase()}</span>}
                </button>
                <button
                  className="visibility"
                  title={s.visible ? 'Hide' : 'Show'}
                  onClick={() => onToggleVisibility(s.id)}
                >
                  {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            );
          })}
          {!collapsed.splines && splines.length === 0 && (
            <div className="empty-note">No splines — press <b>P</b> and click the ground.</div>
          )}
        </div>

        <div className="group">
          <button className="group-label" onClick={() => setCollapsed((c) => ({ ...c, junctions: !c.junctions }))}>
            {collapsed.junctions ? '▸' : '▾'} JUNCTIONS
            <span className="group-count">{junctions.length}</span>
          </button>
          {!collapsed.junctions && junctions.map((j) => {
            const selected = selection.kind === 'junction' && selection.junctionId === j.id;
            return (
              <div key={j.id} className={`tree-row ${selected ? 'selected' : ''}`}>
                <button
                  className="object-button"
                  onClick={() => onSelect({ kind: 'junction', junctionId: j.id })}
                  title={`${j.topology} — ${j.arms.length} arms`}
                >
                  <Waypoints size={15} style={{ color: '#93c779' }} />
                  <span className="row-text">
                    <strong>{j.topology}</strong>
                    <small>{j.arms.length} arms · auto</small>
                  </span>
                </button>
              </div>
            );
          })}
          {!collapsed.junctions && junctions.length === 0 && (
            <div className="empty-note">Share nodes between splines to form junctions.</div>
          )}
        </div>
      </div>

      <div className="outliner-bottom">
        <div className="world-icon">
          <Globe size={16} />
        </div>
        <div>
          <strong>Road &amp; Bridge Studio</strong>
          <span>v1.0 · graphite theme</span>
        </div>
        <span className="little-dot" />
      </div>
    </aside>
  );
}
