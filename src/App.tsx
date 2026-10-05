import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Mode, Point3D, Project, Selection, Spline, SplineNode } from './lib/model';
import {
  generateId, makeNode, makeSpline, defaultProject, demoProject, migrateProject, SPLINE_COLORS,
} from './lib/model';
import { buildNetwork, type BuiltNetwork } from './lib/network';
import { countTriangles } from './lib/roadGeometry';
import { Viewport } from './components/Viewport';
import { Outliner, type NewSplineKind } from './components/Outliner';
import { Inspector } from './components/Inspector';

const STORAGE_KEY = 'frontier-road-bridge:v1';
const EMPTY_NETWORK: BuiltNetwork = { junctions: [], spans: [] };

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  const [viewNonce, setViewNonce] = useState(0);
  const [menuNonce, setMenuNonce] = useState(0);

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
    if (mode !== 'draw' || e.button !== 0) return;
    e.stopPropagation();
    const raw: Point3D = [e.point.x, e.point.y, e.point.z];
    let point = raw;
    let snapped = false;
    let best = 2.0;
    for (const s of project.splines) {
      for (const n of s.nodes) {
        const d = Math.hypot(n.position[0] - raw[0], n.position[1] - raw[1], n.position[2] - raw[2]);
        if (d < best) {
          best = d;
          point = [...n.position] as Point3D;
          snapped = true;
        }
      }
    }
    appendDrawNode(point, snapped);
  }, [mode, project.splines, appendDrawNode]);

  const handleGroundClick = useCallback(() => {
    if (mode === 'select') {
      setSelection({ kind: 'scene' });
      setActiveSplineId(null);
    }
  }, [mode]);

  const handleNodePointerDown = useCallback((e: any, splineId: string, nodeId: string, isEndpoint: boolean) => {
    e.stopPropagation();
    if (mode === 'pan') return;
    const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;

    if (mode === 'draw') {
      if (e.button !== 0) return;
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

    if (e.button === 0) {
      setSelection({ kind: 'node', splineId, nodeId });
      setActiveSplineId(splineId);
    }
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
    dirty();
  }, [dirty]);

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
          setViewNonce((n) => n + 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, save, deleteNode, updateProject]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (!saved) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [saved]);

  // --- render -----------------------------------------------------------------

  return (
    <div className="shell" onContextMenu={(e) => e.preventDefault()}>
      <Outliner
        project={project}
        network={network}
        selection={selection}
        menuNonce={menuNonce}
        onSelect={(s) => {
          setSelection(s);
          if (s.kind === 'spline' || s.kind === 'node') setActiveSplineId(s.splineId);
          setMode('select');
        }}
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
        viewNonce={viewNonce}
        stats={stats}
        onModeChange={(m) => {
          if (m === 'draw') {
            setActiveSplineId(null);
            setSelection({ kind: 'scene' });
          }
          setMode(m);
        }}
        onSelect={setSelection}
        onGroundPointerDown={handleGroundPointerDown}
        onGroundClick={handleGroundClick}
        onNodePointerDown={handleNodePointerDown}
        onNodeUpdate={updateNode}
        onSplineUpdate={moveSpline}
        onToggleGrid={() => updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } }))}
        onFrameAll={() => setViewNonce((n) => n + 1)}
        onDrawHeight={(h) => updateProject((p) => ({ ...p, scene: { ...p.scene, drawHeight: h } }))}
      />
      <Inspector
        project={project}
        network={network}
        selection={selection}
        saved={saved}
        onSave={save}
        onSelect={(s) => {
          setSelection(s);
          if (s.kind === 'spline' || s.kind === 'node') setActiveSplineId(s.splineId);
        }}
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
  );
}
