import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Eye, EyeOff } from 'lucide-react';
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
    <aside className="fw-outliner">
      <div className="fw-panehead">
        <span>Outliner</span>
        <span className="count">{project.splines.length + network.junctions.length}</span>
      </div>

      <div className="fw-stats">
        <div><b>{project.splines.length}</b><span>SPLINES</span></div>
        <div><b>{network.junctions.length}</b><span>JUNCTIONS</span></div>
      </div>

      <div className="fw-search">
        <Search size={13} />
        <input placeholder="Filter objects" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="fw-tree">
        <div>
          <button className="fw-group" onClick={() => setCollapsed((c) => ({ ...c, splines: !c.splines }))}>
            {collapsed.splines ? '▸' : '▾'} SPLINES
            <span className="n">{splines.length}</span>
          </button>
          {!collapsed.splines && splines.map((s) => {
            const isBridge = s.bridge.enabled;
            const selected = s.id === selSplineId;
            return (
              <div key={s.id} className={`fw-row ${selected ? 'selected' : ''}`}>
                <button
                  className={`main ${s.visible ? '' : ''}`}
                  onClick={() => onSelect({ kind: 'spline', splineId: s.id })}
                  title={`${s.name} — ${s.nodes.length} nodes`}
                  style={s.visible ? undefined : { opacity: 0.45 }}
                >
                  <span className="chip" style={{ background: s.color }} />
                  <span className="txt">
                    <strong>{s.name}</strong>
                    <small>
                      {s.nodes.length} pts · {isBridge ? (s.bridge.type === 'arch' ? 'arch bridge' : 'beam bridge') : `${s.cross.width.toFixed(0)} m road`}
                    </small>
                  </span>
                  {isBridge && <span className="tag">{s.bridge.type.toUpperCase()}</span>}
                </button>
                <button
                  className="eye"
                  title={s.visible ? 'Hide' : 'Show'}
                  onClick={() => onToggleVisibility(s.id)}
                >
                  {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            );
          })}
          {!collapsed.splines && splines.length === 0 && (
            <div className="fw-emptynote">No splines — press <b>P</b> and click the ground.</div>
          )}
          {!collapsed.splines && addOpen && (
            <div className="fw-row">
              <button className="main" onClick={() => { onAddSpline('road'); setAddOpen(false); }}>
                <span className="txt"><strong style={{ color: 'var(--txdim)' }}>+ Road spline</strong></span>
              </button>
            </div>
          )}
          {!collapsed.splines && addOpen && (
            <div className="fw-row">
              <button className="main" onClick={() => { onAddSpline('beam'); setAddOpen(false); }}>
                <span className="txt"><strong style={{ color: 'var(--txdim)' }}>+ Beam bridge</strong></span>
              </button>
            </div>
          )}
          {!collapsed.splines && addOpen && (
            <div className="fw-row">
              <button className="main" onClick={() => { onAddSpline('arch'); setAddOpen(false); }}>
                <span className="txt"><strong style={{ color: 'var(--txdim)' }}>+ Arch bridge</strong></span>
              </button>
            </div>
          )}
        </div>

        <div>
          <button className="fw-group" onClick={() => setCollapsed((c) => ({ ...c, junctions: !c.junctions }))}>
            {collapsed.junctions ? '▸' : '▾'} JUNCTIONS
            <span className="n">{junctions.length}</span>
          </button>
          {!collapsed.junctions && junctions.map((j) => {
            const selected = selection.kind === 'junction' && selection.junctionId === j.id;
            return (
              <div key={j.id} className={`fw-row ${selected ? 'selected' : ''}`}>
                <button
                  className="main"
                  onClick={() => onSelect({ kind: 'junction', junctionId: j.id })}
                  title={`${j.topology} — ${j.arms.length} arms`}
                >
                  <span className="chip" style={{ background: '#8a8a8a' }} />
                  <span className="txt">
                    <strong>{j.topology}</strong>
                    <small>{j.arms.length} arms · {j.kind === 'crossing' ? 'auto · crossing' : 'shared node'}</small>
                  </span>
                </button>
              </div>
            );
          })}
          {!collapsed.junctions && junctions.length === 0 && (
            <div className="fw-emptynote">Draw roads across each other — crossings fuse into junctions.</div>
          )}
        </div>
      </div>

      <div className="fw-outfoot">
        <button className="fw-btn block" title="Add spline (Shift+A)" onClick={() => setAddOpen((v) => !v)}>
          <Plus size={14} /> Spline
        </button>
        <div className="cap">RoadWorks scene · frontier seating</div>
      </div>
    </aside>
  );
}
