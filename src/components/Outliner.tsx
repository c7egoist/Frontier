import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Eye, EyeOff, Route, Landmark, Waypoints, X,
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
  project, network, selection, menuNonce, onSelect, onToggleVisibility, onAddSpline,
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
    <aside className="rw-outliner">
      <div className="rw-panel-header">
        <span>OUTLINER</span>
        <span className="count">{project.splines.length + network.junctions.length}</span>
      </div>

      <div className="rw-census">
        <div className="tile"><b>{project.splines.length}</b><span>SPLINES</span></div>
        <div className="tile"><b>{network.junctions.length}</b><span>JUNCTIONS</span></div>
      </div>

      <div className="rw-search">
        <Search size={14} />
        <input placeholder="Filter objects" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {addOpen && (
        <div className="rw-add-menu">
          <p>NEW SPLINE</p>
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

      <div className="rw-entries">
        <div>
          <button className="rw-group-label" onClick={() => setCollapsed((c) => ({ ...c, splines: !c.splines }))}>
            {collapsed.splines ? '▸' : '▾'} SPLINES
            <span className="group-count">{splines.length}</span>
          </button>
          {!collapsed.splines && splines.map((s) => {
            const isBridge = s.bridge.enabled;
            const Icon = isBridge ? Landmark : Route;
            const selected = s.id === selSplineId;
            return (
              <div key={s.id} className={`rw-entry ${selected ? 'selected' : ''} ${s.visible ? '' : 'hidden-object'}`}>
                <button
                  className="row-main"
                  onClick={() => onSelect({ kind: 'spline', splineId: s.id })}
                  title={`${s.name} — ${s.nodes.length} nodes`}
                >
                  <Icon size={15} style={{ color: s.color, flex: 'none' }} />
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
            <div className="rw-empty-note">No splines — press <b>P</b> and click the ground.</div>
          )}
        </div>

        <div>
          <button className="rw-group-label" onClick={() => setCollapsed((c) => ({ ...c, junctions: !c.junctions }))}>
            {collapsed.junctions ? '▸' : '▾'} JUNCTIONS
            <span className="group-count">{junctions.length}</span>
          </button>
          {!collapsed.junctions && junctions.map((j) => {
            const selected = selection.kind === 'junction' && selection.junctionId === j.id;
            return (
              <div key={j.id} className={`rw-entry ${selected ? 'selected' : ''}`}>
                <button
                  className="row-main"
                  onClick={() => onSelect({ kind: 'junction', junctionId: j.id })}
                  title={`${j.topology} — ${j.arms.length} arms`}
                >
                  <Waypoints size={15} style={{ color: '#93c779', flex: 'none' }} />
                  <span className="row-text">
                    <strong>{j.topology}</strong>
                    <small>{j.arms.length} arms · {j.kind === 'crossing' ? 'auto · crossing' : 'shared node'}</small>
                  </span>
                </button>
              </div>
            );
          })}
          {!collapsed.junctions && junctions.length === 0 && (
            <div className="rw-empty-note">Draw roads across each other — crossings fuse into junctions.</div>
          )}
        </div>
      </div>

      <div className="rw-outliner-bottom">
        <div className="rw-add-row">
          <button className="rw-btn block" title="Add spline (Shift+A)" onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? <X size={14} /> : <Plus size={14} />} Spline
          </button>
        </div>
        <div className="rw-caption">
          <span>RoadWorks scene · graphite</span>
          <span className="little-dot" />
        </div>
      </div>
    </aside>
  );
}
