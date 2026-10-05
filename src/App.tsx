import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Mode, Point3D, Project, Selection, Spline, SplineNode } from './lib/model';
import {
  makeNode, makeSpline, defaultProject, demoProject, migrateProject, SPLINE_COLORS,
} from './lib/model';
import { buildNetwork, type BuiltNetwork } from './lib/network';
import { countTriangles } from './lib/roadGeometry';
import { findSnapTarget } from './lib/editing';
import { Viewport, type ViewPreset, type ViewRequest, type FrameBounds } from './components/Viewport';
import { Outliner, type NewSplineKind } from './components/Outliner';
import { Inspector } from './components/Inspector';

const STORAGE_KEY = 'roadworks-editor:v1';
const LEGACY_STORAGE_KEY = 'frontier-road-bridge:v1';
const EMPTY_NETWORK: BuiltNetwork = { junctions: [], spans: [] };

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = migrateProject(JSON.parse(raw));
      if (parsed.splines.length > 0) return parsed;
    }
  } catch {
    /* fall through to demo */
  }
  return demoProject();
}

function nextColor(existing: number): string {
  return SPLINE_COLORS[existing % SPLINE_COLORS.length];
}

export default function App() {
  const [project, setProject] = useState<Project>(loadInitial);
  const [mode, setMode] = useState<Mode>('select');
  const [selection, setSelection] = useState<Selection>({ kind: 'scene' });
  const [activeSplineId, setActiveSplineId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ preset: 'iso', nonce: 0 });
  const [menuNonce, setMenuNonce] = useState(0);
  const [snapHint, setSnapHint] = useState<string | null>(null);

  const dirty = useCallback(() => setSaved(false), []);

  // deferred rebuild keeps node-dragging smooth; meshes catch up a frame later
  const deferredProject = useDeferredValue(project);
  const network = useMemo<BuiltNetwork>(() => {
    try {
      return buildNetwork(deferredProject);
    } catch (e) {
      console.error('network build failed', e);
      return EMPTY_NETWORK;
    }
  }, [deferredProject]);

  // drop stale junction selections after rebuilds (ids are positional)
  useEffect(() => {
    if (selection.kind === 'junction' && !network.junctions.some((j) => j.id === selection.junctionId)) {
      setSelection({ kind: 'scene' });
    }
  }, [network, selection]);

  const stats = useMemo(() => {
    const visible = new Set(project.splines.filter((s) => s.visible).map((s) => s.id));
    let patches = 0;
    let tris = 0;
    for (const sp of network.spans) {
      if (!visible.has(sp.splineId)) continue;
      patches += sp.patches.length;
      tris += countTriangles(sp.patches);
    }
    for (const j of network.junctions) {
      if (!j.arms.some((a) => visible.has(a.splineId))) continue;
      patches += j.patches.length;
      tris += countTriangles(j.patches);
    }
    return { patches, tris };
  }, [network, project.splines]);

  const frameBounds = useMemo<FrameBounds | null>(() => {
    let min: Point3D | null = null;
    let max: Point3D | null = null;
    for (const s of project.splines) {
      for (const n of s.nodes) {
        for (const p of [n.position, n.handleIn, n.handleOut]) {
          if (!min || !max) { min = [...p] as Point3D; max = [...p] as Point3D; continue; }
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], p[i]);
            max[i] = Math.max(max[i], p[i]);
          }
        }
      }
    }
    return min && max ? { min, max } : null;
  }, [project.splines]);

  // --- mutations ------------------------------------------------------------

  const updateSpline = useCallback((id: string, fn: (s: Spline) => Spline) => {
    setProject((p) => ({ ...p, splines: p.splines.map((s) => (s.id === id ? fn(s) : s)) }));
    dirty();
  }, [dirty]);

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => fn(p));
    dirty();
  }, [dirty]);

  const updateNode = useCallback((splineId: string, nodeId: string, updates: Partial<SplineNode>) => {
    setProject((p) => ({
      ...p,
      splines: p.splines.map((s) => (s.id === splineId
        ? { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)) }
        : s)),
    }));
    dirty();
  }, [dirty]);

  const shiftNode = useCallback((splineId: string, nodeId: string, pos: Point3D) => {
    setProject((p) => ({
      ...p,
      splines: p.splines.map((s) => {
        if (s.id !== splineId) return s;
        return {
          ...s,
          nodes: s.nodes.map((n) => {
            if (n.id !== nodeId) return n;
            const dx = pos[0] - n.position[0];
            const dy = pos[1] - n.position[1];
            const dz = pos[2] - n.position[2];
            return {
              ...n,
              position: pos,
              handleIn: [n.handleIn[0] + dx, n.handleIn[1] + dy, n.handleIn[2] + dz] as Point3D,
              handleOut: [n.handleOut[0] + dx, n.handleOut[1] + dy, n.handleOut[2] + dz] as Point3D,
            };
          }),
        };
      }),
    }));
    dirty();
  }, [dirty]);

  /** Gizmo drag path: magnetic snap onto nearby nodes/curves + status hint. */
  const moveNodeSnapped = useCallback((splineId: string, nodeId: string, updates: Partial<SplineNode>) => {
    const pos = updates.position;
    if (!pos) {
      updateNode(splineId, nodeId, updates);
      return;
    }
    const target = findSnapTarget(project, pos as Point3D, {
      excludeNodeId: nodeId, nodeRadius: 1.5, curveRadius: 1.0,
    });
    if (target) {
      const nm = project.splines.find((s) => s.id === target.splineId)?.name ?? '';
      setSnapHint(target.kind === 'node' ? `Snapped to node · ${nm}` : `Snapped to curve · ${nm}`);
      shiftNode(splineId, nodeId, target.point);
    } else {
      setSnapHint(null);
      shiftNode(splineId, nodeId, pos as Point3D);
    }
  }, [project, updateNode, shiftNode]);

  const updateNodeHeight = useCallback((splineId: string, nodeId: string, y: number) => {
    const s = project.splines.find((x) => x.id === splineId);
    const n = s?.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    shiftNode(splineId, nodeId, [n.position[0], y, n.position[2]]);
  }, [project.splines, shiftNode]);

  const deleteNode = useCallback((splineId: string, nodeId: string) => {
    setProject((p) => ({
      ...p,
      splines: p.splines
        .map((s) => (s.id === splineId ? { ...s, nodes: s.nodes.filter((n) => n.id !== nodeId) } : s))
        .filter((s) => s.nodes.length > 0),
    }));
    setSelection((sel) => (sel.kind === 'node' && sel.nodeId === nodeId ? { kind: 'scene' } : sel));
    dirty();
  }, [dirty]);

  const deleteSpline = useCallback((id: string) => {
    setProject((p) => ({ ...p, splines: p.splines.filter((s) => s.id !== id) }));
    setSelection({ kind: 'scene' });
    setActiveSplineId((a) => (a === id ? null : a));
    dirty();
  }, [dirty]);

  const moveSpline = useCallback((splineId: string, dx: number, dy: number, dz: number) => {
    setProject((p) => ({
      ...p,
      splines: p.splines.map((s) => {
        if (s.id !== splineId) return s;
        const shift = (pt: Point3D): Point3D => [pt[0] + dx, pt[1] + dy, pt[2] + dz];
        return {
          ...s,
          nodes: s.nodes.map((n) => ({
            ...n,
            position: shift(n.position),
            handleIn: shift(n.handleIn),
            handleOut: shift(n.handleOut),
          })),
        };
      }),
    }));
    dirty();
  }, [dirty]);

  // --- draw -----------------------------------------------------------------

  const smoothAppend = useCallback((
    nodes: SplineNode[], point: Point3D, toFront: boolean, snapped: boolean,
  ): SplineNode[] => {
    const created = makeNode(point);
    if (nodes.length === 0 || snapped) return toFront ? [created, ...nodes] : [...nodes, created];
    const anchor = toFront ? nodes[0] : nodes[nodes.length - 1];
    const dx = point[0] - anchor.position[0];
    const dz = point[2] - anchor.position[2];
    const dy = point[1] - anchor.position[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return toFront ? [created, ...nodes] : [...nodes, created];
    const k = Math.min(4, len * 0.35);
    const ux = dx / len;
    const uz = dz / len;
    const out = [...nodes];
    if (toFront) {
      out[0] = {
        ...anchor,
        handleIn: [anchor.position[0] + ux * k, anchor.position[1] + dy * 0.3, anchor.position[2] + uz * k],
      };
      created.handleOut = [point[0] - ux * k, point[1] - dy * 0.3, point[2] - uz * k];
      return [created, ...out];
    }
    out[out.length - 1] = {
      ...anchor,
      handleOut: [anchor.position[0] + ux * k, anchor.position[1] + dy * 0.3, anchor.position[2] + uz * k],
    };
    created.handleIn = [point[0] - ux * k, point[1] - dy * 0.3, point[2] - uz * k];
    return [...out, created];
  }, []);

  const appendDrawNode = useCallback((point: Point3D, snapped: boolean) => {
    const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;
    if (!activeSplineId) {
      const s = makeSpline(`Road ${project.splines.length + 1}`, nextColor(project.splines.length));
      s.nodes = [makeNode(point)];
      setProject((p) => ({ ...p, splines: [...p.splines, s] }));
      setActiveSplineId(s.id);
      setSelection({ kind: 'node', splineId: s.id, nodeId: s.nodes[0].id });
      dirty();
      return;
    }
    let createdId = '';
    setProject((p) => ({
      ...p,
      splines: p.splines.map((s) => {
        if (s.id !== activeSplineId) return s;
        const toFront = s.nodes.length > 0 && s.nodes[0].id === selectedNodeId;
        const nodes = smoothAppend(s.nodes, point, toFront, snapped);
        createdId = toFront ? nodes[0].id : nodes[nodes.length - 1].id;
        return { ...s, nodes };
      }),
    }));
    if (createdId) setSelection({ kind: 'node', splineId: activeSplineId, nodeId: createdId });
    dirty();
  }, [activeSplineId, project.splines.length, selection, smoothAppend, dirty]);

  const handleGroundPointerDown = useCallback((e: any) => {
    if (mode !== 'draw') return;
    const raw: Point3D = [e.point.x, e.point.y, e.point.z];
    const target = findSnapTarget(project, raw, { nodeRadius: 2.0, curveRadius: 1.0 });
    if (target) {
      const nm = project.splines.find((s) => s.id === target.splineId)?.name ?? '';
      setSnapHint(target.kind === 'node' ? `Snapped to node · ${nm}` : `Snapped to curve · ${nm}`);
      appendDrawNode(target.point, true);
    } else {
      setSnapHint(null);
      appendDrawNode(raw, false);
    }
  }, [mode, project, appendDrawNode]);

  const handleGroundClick = useCallback(() => {
    if (mode === 'select') {
      setSelection({ kind: 'scene' });
      setActiveSplineId(null);
    }
  }, [mode]);

  const handleNodePointerDown = useCallback((splineId: string, nodeId: string, isEndpoint: boolean) => {
    if (mode === 'pan') return;
    const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;

    if (mode === 'draw') {
      const target = project.splines.find((s) => s.id === splineId)?.nodes.find((n) => n.id === nodeId);
      if (!target) return;

      if (!activeSplineId) {
        // start a new spline sharing this node (future junction)
        const point = [...target.position] as Point3D;
        const s = makeSpline(`Road ${project.splines.length + 1}`, nextColor(project.splines.length));
        s.nodes = [makeNode(point)];
        setProject((p) => ({ ...p, splines: [...p.splines, s] }));
        setActiveSplineId(s.id);
        setSelection({ kind: 'node', splineId: s.id, nodeId: s.nodes[0].id });
        dirty();
        return;
      }
      if (activeSplineId === splineId) {
        if (isEndpoint && selectedNodeId !== nodeId) {
          setProject((p) => ({
            ...p,
            splines: p.splines.map((s) => (s.id === splineId ? { ...s, closed: true } : s)),
          }));
          setMode('select');
          dirty();
        }
        return;
      }
      if (isEndpoint) {
        // join the two splines
        setProject((p) => {
          const active = p.splines.find((s) => s.id === activeSplineId);
          const targetSpline = p.splines.find((s) => s.id === splineId);
          if (!active || !targetSpline) return p;
          const activeIsFirst = active.nodes[0]?.id === selectedNodeId;
          const activeIsLast = active.nodes[active.nodes.length - 1]?.id === selectedNodeId;
          if (!activeIsFirst && !activeIsLast) return p;
          const targetIsFirst = targetSpline.nodes[0]?.id === nodeId;
          const activeNodes = activeIsFirst ? [...active.nodes].reverse() : [...active.nodes];
          const targetNodes = targetIsFirst ? [...targetSpline.nodes] : [...targetSpline.nodes].reverse();
          const merged = [...activeNodes, ...targetNodes];
          return {
            ...p,
            splines: p.splines
              .filter((s) => s.id !== activeSplineId && s.id !== splineId)
              .concat({ ...targetSpline, nodes: merged }),
          };
        });
        setActiveSplineId(splineId);
        setSelection({ kind: 'node', splineId, nodeId });
        setMode('select');
        dirty();
        return;
      }
      // snap onto a mid-spline node without joining (shared node → junction)
      appendDrawNode([...target.position] as Point3D, true);
      return;
    }

    setSelection({ kind: 'node', splineId, nodeId });
    setActiveSplineId(splineId);
  }, [mode, selection, activeSplineId, project.splines, appendDrawNode, dirty]);

  // --- outliner / project actions --------------------------------------------

  const handleAddSpline = useCallback((kind: NewSplineKind) => {
    const n = project.splines.length;
    const s = makeSpline(
      kind === 'road' ? `Road ${n + 1}` : `Bridge ${n + 1}`,
      nextColor(n),
    );
    if (kind !== 'road') {
      s.bridge = { ...s.bridge, enabled: true, type: kind };
    }
    setProject((p) => ({
      ...p,
      splines: [...p.splines, s],
      scene: kind === 'road' ? p.scene : { ...p.scene, drawHeight: 4 },
    }));
    setActiveSplineId(s.id);
    setSelection({ kind: 'spline', splineId: s.id });
    setMode('draw');
    dirty();
  }, [project.splines.length, dirty]);

  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setSaved(true);
    } catch {
      window.alert('Unable to save locally — browser storage may be full.');
    }
  }, [project]);

  const loadProject = useCallback((raw: any) => {
    const p = migrateProject(raw);
    setProject(p);
    setSelection({ kind: 'scene' });
    setActiveSplineId(null);
    dirty();
  }, [dirty]);

  const newProject = useCallback((demo: boolean) => {
    setProject(demo ? demoProject() : defaultProject());
    setSelection({ kind: 'scene' });
    setActiveSplineId(null);
    setMode('select');
    setSnapHint(null);
    dirty();
  }, [dirty]);

  const requestView = useCallback((preset: ViewPreset) => {
    setViewRequest((r) => ({ preset, nonce: r.nonce + 1 }));
  }, []);

  const changeMode = useCallback((m: Mode) => {
    if (m === 'draw') {
      setActiveSplineId(null);
      setSelection({ kind: 'scene' });
    }
    setSnapHint(null);
    setMode(m);
  }, []);

  const selectFromPanel = useCallback((s: Selection) => {
    setSelection(s);
    if (s.kind === 'spline' || s.kind === 'node') setActiveSplineId(s.splineId);
    setMode('select');
  }, []);

  // --- keyboard ---------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return;
      if (e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        setMenuNonce((n) => n + 1);
        return;
      }
      switch (e.key) {
        case 'Escape':
          setSelection({ kind: 'scene' });
          setActiveSplineId(null);
          setSnapHint(null);
          setMode('select');
          break;
        case 'Delete':
        case 'Backspace':
          if (selection.kind === 'node') {
            deleteNode(selection.splineId, selection.nodeId);
          }
          break;
        case 'v':
        case 'V':
          setMode('select');
          break;
        case 'p':
        case 'P':
          setActiveSplineId(null);
          setSelection({ kind: 'scene' });
          setSnapHint(null);
          setMode('draw');
          break;
        case 'h':
        case 'H':
          setMode('pan');
          break;
        case 'g':
        case 'G':
          updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } }));
          break;
        case 'f':
        case 'F':
          requestView('frame');
          break;
        case '1':
          requestView('iso');
          break;
        case '2':
          requestView('top');
          break;
        case '3':
          requestView('front');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, save, deleteNode, updateProject, requestView]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (!saved) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [saved]);

  // --- chrome labels ------------------------------------------------------------

  const selectionLabel = (() => {
    if (selection.kind === 'scene') return 'Scene';
    if (selection.kind === 'junction') {
      const j = network.junctions.find((x) => x.id === selection.junctionId);
      return j ? `Junction · ${j.topology}` : 'Junction';
    }
    const s = project.splines.find((x) => x.id === selection.splineId);
    if (!s) return '—';
    if (selection.kind === 'spline') return s.name;
    const idx = s.nodes.findIndex((n) => n.id === (selection as { nodeId: string }).nodeId);
    return `${s.name} · Node ${idx + 1}`;
  })();
  const selTabId = selection.kind === 'spline' || selection.kind === 'node' ? selection.splineId : null;

  // --- render -----------------------------------------------------------------

  return (
    <div className="rw-app" onContextMenu={(e) => e.preventDefault()}>
      <header className="rw-menubar">
        <span className="rw-brand">RoadWorks<small>EDITOR</small></span>
        <span className="rw-menu-sep" />
        <input
          className="rw-project-name"
          value={project.name}
          onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))}
          spellCheck={false}
          title="Project name"
        />
        <span className="spacer" />
        <button className={`rw-save-state ${saved ? 'saved' : ''}`} onClick={save} title="Save to browser (Ctrl+S)">
          <span className="dot" />{saved ? 'Saved' : 'Unsaved'}
        </button>
        <span className="rw-live">LIVE</span>
        <span className="rw-build">v2 · graphite</span>
      </header>

      <div className="rw-docbar">
        <div className="rw-tabs">
          <button
            className={`rw-tab ${selection.kind === 'scene' || selection.kind === 'junction' ? 'active' : ''}`}
            onClick={() => setSelection({ kind: 'scene' })}
            title="Scene"
          >
            <span className="tab-dot" style={{ background: saved ? '#5c6068' : '#d6a665' }} />
            Scene
          </button>
          {project.splines.map((s) => (
            <button
              key={s.id}
              className={`rw-tab ${s.id === selTabId ? 'active' : ''}`}
              onClick={() => selectFromPanel({ kind: 'spline', splineId: s.id })}
              title={s.name}
            >
              <span className="tab-dot" style={{ background: s.color }} />
              {s.name}
              <span className="tab-sub">{s.nodes.length} pts</span>
            </button>
          ))}
          <button className="rw-tab-add" title="Add spline (Shift+A)" onClick={() => setMenuNonce((n) => n + 1)}>+</button>
        </div>
        <span className="spacer" />
        <span className="rw-doc-note">{project.splines.length} splines · {network.junctions.length} junctions</span>
      </div>

      <div className="rw-main">
        <Outliner
          project={project}
          network={network}
          selection={selection}
          menuNonce={menuNonce}
          onSelect={selectFromPanel}
          onToggleVisibility={(id) => updateSpline(id, (s) => ({ ...s, visible: !s.visible }))}
          onAddSpline={handleAddSpline}
          onRename={(name) => updateProject((p) => ({ ...p, name }))}
        />
        <Viewport
          project={project}
          network={network}
          mode={mode}
          selection={selection}
          activeSplineId={activeSplineId}
          viewRequest={viewRequest}
          frameBounds={frameBounds}
          onModeChange={changeMode}
          onSelect={setSelection}
          onGroundPointerDown={handleGroundPointerDown}
          onGroundClick={handleGroundClick}
          onNodePointerDown={handleNodePointerDown}
          onNodeUpdate={moveNodeSnapped}
          onSplineUpdate={moveSpline}
          onToggleGrid={() => updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } }))}
          onViewPreset={requestView}
          onDrawHeight={(h) => updateProject((p) => ({ ...p, scene: { ...p.scene, drawHeight: h } }))}
          onPointerUp={() => { if (mode === 'select') setSnapHint(null); }}
        />
        <Inspector
          project={project}
          network={network}
          selection={selection}
          saved={saved}
          onSave={save}
          onSelect={selectFromPanel}
          updateSpline={updateSpline}
          updateProject={updateProject}
          deleteSpline={deleteSpline}
          deleteNode={deleteNode}
          updateNodeHeight={updateNodeHeight}
          updateNodePosition={shiftNode}
          onLoadProject={loadProject}
          onNewProject={newProject}
        />
      </div>

      <footer className="rw-statusbar">
        <span className="stat"><b>{stats.patches}</b> patches · <b>{(stats.tris / 1000).toFixed(1)}k</b> tris</span>
        <span className="sep">|</span>
        <span className="stat"><b>{network.spans.length}</b> spans · <b>{network.junctions.length}</b> junctions</span>
        <span className="sep">|</span>
        <span className="stat">{selectionLabel}</span>
        {snapHint && (
          <>
            <span className="sep">|</span>
            <span className="snap-hint">◇ {snapHint}</span>
          </>
        )}
        <span className="spacer" />
        <span><kbd>V</kbd> select · <kbd>P</kbd> draw · <kbd>F</kbd> frame · <kbd>Del</kbd> delete</span>
      </footer>
    </div>
  );
}
