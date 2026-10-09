// ---------------------------------------------------------------------------
// editor.js — application state + interaction logic for the road editor.
//
//   • modes: select / draw / pan (V / P / H)
//   • selection: scene / spline / node / junction
//   • gizmo: one Slate translate handle per selection — a node's handle moves
//     the node, a spline's handle moves the whole spline, and a junction's
//     SINGLE handle moves the whole joint (all of its anchor nodes at once)
//   • snapping: dragged/drawn points magnet onto nodes and centerlines so
//     joins land exactly and fuse into junctions
//   • history: undo/redo with throttled snapshots during drags
//   • network rebuilds are throttled to one per animation frame
// ---------------------------------------------------------------------------

import {
  makeNode, makeSpline, defaultProject, demoInterchange, demoHarbour,
  migrateProject, addInterchange, SPLINE_COLORS, generateId,
} from './model.js';
import { buildNetwork } from './network.js';
import { findSnapTarget } from './editing.js';
import { networkToObj, downloadText } from './exportObj.js';

const STORAGE_KEY = 'frontier-road-editor:v2';
const HISTORY_CAP = 100;

function emptyHistory() {
  return { past: [], future: [] };
}

function cloneProject(p) {
  return structuredClone(p);
}

export function createEditor(viewport, { onState } = {}) {
  let project = loadInitial();
  let mode = 'select';
  let selection = { kind: 'scene' };
  let activeSplineId = null;
  let saved = true;
  let snapHint = null;
  let network = { junctions: [], spans: [], stats: { patches: 0, triangles: 0, spans: 0, junctions: 0, length: 0 } };

  const history = emptyHistory();
  let lastPush = 0;
  let rebuildScheduled = false;

  // --- change notification ---------------------------------------------------
  function notify(rerenderPanels = true) {
    viewport.setProject(project, selection, activeSplineId, mode, network);
    viewport.setSceneSettings(project.scene);
    updateGizmo();
    onState && onState({ rerenderPanels });
  }

  /**
   * Apply a new project state. History snapshots capture the state BEFORE
   * the change (throttled to one per 800 ms during drags), so undo/redo
   * restore exactly what was on screen when the change began.
   */
  function setProject(p, structural = true) {
    if (p === project) return;
    const prev = project;
    project = p;
    const now = Date.now();
    if (structural || now - lastPush > 800) {
      lastPush = now;
      history.past.push(cloneProject(prev));
      if (history.past.length > HISTORY_CAP) history.past.shift();
      history.future.length = 0;
    }
    saved = false;
    scheduleRebuild();
    notify(false);
  }

  // --- network rebuild (throttled to one per frame) ---------------------------
  function rebuildNow() {
    try {
      network = buildNetwork(project);
    } catch (e) {
      console.error('network build failed', e);
      network = { junctions: [], spans: [], stats: network.stats };
    }
    viewport.setNetwork(network);
    // drop stale junction selections (ids are positional)
    if (selection.kind === 'junction' && !network.junctions.some((j) => j.id === selection.junctionId)) {
      selection = { kind: 'scene' };
    }
  }

  function scheduleRebuild() {
    if (rebuildScheduled) return;
    rebuildScheduled = true;
    requestAnimationFrame(() => {
      rebuildScheduled = false;
      rebuildNow();
      notify(false);
    });
  }

  // --- gizmo -------------------------------------------------------------------
  function splineCentroid(s) {
    let cx = 0; let cy = 0; let cz = 0;
    s.nodes.forEach((n) => { cx += n.position[0]; cy += n.position[1]; cz += n.position[2]; });
    const len = Math.max(1, s.nodes.length);
    return [cx / len, cy / len + 0.5, cz / len];
  }

  // persistent drag state for the gizmo's total-delta callback
  const drag = {
    kind: null, // 'gizmo' | 'node' | 'handle' | 'camera'
    view: null,
    part: null,
    gizmo: null,
    starts: null, // Map key -> [x,y,z]
  };

  function gizmoTargetFor(sel) {
    if (sel.kind === 'node') {
      const s = project.splines.find((x) => x.id === sel.splineId);
      const n = s && s.nodes.find((x) => x.id === sel.nodeId);
      if (!n) return null;
      return { position: [...n.position] };
    }
    if (sel.kind === 'spline') {
      const s = project.splines.find((x) => x.id === sel.splineId);
      if (!s || s.nodes.length === 0) return null;
      return { position: splineCentroid(s) };
    }
    if (sel.kind === 'junction') {
      const j = network.junctions.find((x) => x.id === sel.junctionId);
      if (!j) return null;
      return { position: [...j.position] };
    }
    return null;
  }

  function captureDragStarts(sel) {
    const starts = new Map();
    if (sel.kind === 'node') {
      const s = project.splines.find((x) => x.id === sel.splineId);
      const n = s && s.nodes.find((x) => x.id === sel.nodeId);
      if (n) {
        starts.set('node', [...n.position]);
        starts.set('handleIn', [...n.handleIn]);
        starts.set('handleOut', [...n.handleOut]);
      }
    } else if (sel.kind === 'spline') {
      const s = project.splines.find((x) => x.id === sel.splineId);
      if (s) for (const n of s.nodes) starts.set(n.id, [...n.position]);
    } else if (sel.kind === 'junction') {
      const j = network.junctions.find((x) => x.id === sel.junctionId);
      if (j) {
        for (const a of j.anchors) {
          const s = project.splines.find((x) => x.id === a.splineId);
          const n = s && s.nodes.find((x) => x.id === a.nodeId);
          if (n) {
            starts.set(`${a.splineId}:${a.nodeId}`, [...n.position]);
            starts.set(`${a.splineId}:${a.nodeId}:in`, [...n.handleIn]);
            starts.set(`${a.splineId}:${a.nodeId}:out`, [...n.handleOut]);
          }
        }
      }
    }
    return starts;
  }

  function onGizmoDeltaTotal(dx, dy, dz) {
    if (!drag.starts) return;
    const d = [dx, dy, dz];
    const sel = selection;
    if (sel.kind === 'node' && drag.starts.has('node')) {
      const s0 = drag.starts.get('node');
      const hIn = drag.starts.get('handleIn');
      const hOut = drag.starts.get('handleOut');
      const np = [s0[0] + d[0], s0[1] + d[1], s0[2] + d[2]];
      updateNodeRaw(sel.splineId, sel.nodeId, {
        position: np,
        handleIn: [hIn[0] + d[0], hIn[1] + d[1], hIn[2] + d[2]],
        handleOut: [hOut[0] + d[0], hOut[1] + d[1], hOut[2] + d[2]],
      });
    } else if (sel.kind === 'spline') {
      setProject({
        ...project,
        splines: project.splines.map((s) => {
          if (s.id !== sel.splineId) return s;
          return {
            ...s,
            nodes: s.nodes.map((n) => {
              const st = drag.starts.get(n.id);
              if (!st) return n;
              return {
                ...n,
                position: [st[0] + d[0], st[1] + d[1], st[2] + d[2]],
                handleIn: [n.handleIn[0] + d[0], n.handleIn[1] + d[1], n.handleIn[2] + d[2]],
                handleOut: [n.handleOut[0] + d[0], n.handleOut[1] + d[1], n.handleOut[2] + d[2]],
              };
            }),
          };
        }),
      }, false);
      return; // setProject already notified
    } else if (sel.kind === 'junction') {
      // THE single handle: move every anchor node of the joint together
      setProject({
        ...project,
        splines: project.splines.map((s) => ({
          ...s,
          nodes: s.nodes.map((n) => {
            const key = `${s.id}:${n.id}`;
            const st = drag.starts.get(key);
            if (!st) return n;
            const hin = drag.starts.get(`${key}:in`);
            const hout = drag.starts.get(`${key}:out`);
            return {
              ...n,
              position: [st[0] + d[0], st[1] + d[1], st[2] + d[2]],
              handleIn: hin ? [hin[0] + d[0], hin[1] + d[1], hin[2] + d[2]] : n.handleIn,
              handleOut: hout ? [hout[0] + d[0], hout[1] + d[1], hout[2] + d[2]] : n.handleOut,
            };
          }),
        })),
      }, false);
      return;
    }
    scheduleRebuild();
    notify(false);
  }

  function updateGizmo() {
    const target = gizmoTargetFor(selection);
    if (target) {
      viewport.setGizmo({
        position: target.position,
        onDeltaTotal: onGizmoDeltaTotal,
      });
    } else {
      viewport.setGizmo(null);
    }
  }

  // --- mutations ---------------------------------------------------------------
  function updateSpline(id, fn) {
    setProject({ ...project, splines: project.splines.map((s) => (s.id === id ? fn(s) : s)) }, false);
  }

  function updateProject(fn) {
    setProject(fn(project), false);
  }

  function updateNodeRaw(splineId, nodeId, updates) {
    setProject({
      ...project,
      splines: project.splines.map((s) => (s.id === splineId
        ? { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)) }
        : s)),
    }, false);
  }

  function shiftNode(splineId, nodeId, pos) {
    setProject({
      ...project,
      splines: project.splines.map((s) => {
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
              position: [...pos],
              handleIn: [n.handleIn[0] + dx, n.handleIn[1] + dy, n.handleIn[2] + dz],
              handleOut: [n.handleOut[0] + dx, n.handleOut[1] + dy, n.handleOut[2] + dz],
            };
          }),
        };
      }),
    }, false);
  }

  function moveSpline(splineId, dx, dy, dz) {
    setProject({
      ...project,
      splines: project.splines.map((s) => {
        if (s.id !== splineId) return s;
        const shift = (pt) => [pt[0] + dx, pt[1] + dy, pt[2] + dz];
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
    }, false);
  }

  function deleteNode(splineId, nodeId) {
    setProject({
      ...project,
      splines: project.splines
        .map((s) => (s.id === splineId ? { ...s, nodes: s.nodes.filter((n) => n.id !== nodeId) } : s))
        .filter((s) => s.nodes.length > 0),
    }, true);
    if (selection.kind === 'node' && selection.nodeId === nodeId) selection = { kind: 'scene' };
  }

  function deleteSpline(id) {
    setProject({ ...project, splines: project.splines.filter((s) => s.id !== id) }, true);
    selection = { kind: 'scene' };
    if (activeSplineId === id) activeSplineId = null;
  }

  // --- draw ----------------------------------------------------------------------
  function smoothAppend(nodes, point, toFront, snapped) {
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
      out[0] = { ...anchor, handleIn: [anchor.position[0] + ux * k, anchor.position[1] + dy * 0.3, anchor.position[2] + uz * k] };
      created.handleOut = [point[0] - ux * k, point[1] - dy * 0.3, point[2] - uz * k];
      return [created, ...out];
    }
    out[out.length - 1] = { ...anchor, handleOut: [anchor.position[0] + ux * k, anchor.position[1] + dy * 0.3, anchor.position[2] + uz * k] };
    created.handleIn = [point[0] - ux * k, point[1] - dy * 0.3, point[2] - uz * k];
    return [...out, created];
  }

  function appendDrawNode(point, snapped) {
    const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;
    if (!activeSplineId) {
      const s = makeSpline(`Road ${project.splines.length + 1}`, nextColor(project.splines.length));
      s.nodes = [makeNode(point)];
      setProject({ ...project, splines: [...project.splines, s] }, true);
      activeSplineId = s.id;
      selection = { kind: 'node', splineId: s.id, nodeId: s.nodes[0].id };
      notify();
      return;
    }
    let createdId = '';
    setProject({
      ...project,
      splines: project.splines.map((s) => {
        if (s.id !== activeSplineId) return s;
        // extend from the selected endpoint; a fresh single-node road grows
        // in click order (append), longer roads can be extended at either end
        const toFront = s.nodes.length > 1 && s.nodes[0].id === selectedNodeId;
        const nodes = smoothAppend(s.nodes, point, toFront, snapped);
        createdId = toFront ? nodes[0].id : nodes[nodes.length - 1].id;
        return { ...s, nodes };
      }),
    }, true);
    if (createdId) selection = { kind: 'node', splineId: activeSplineId, nodeId: createdId };
    notify();
  }

  function handleNodePointerDown(splineId, nodeId, isEndpoint) {
    if (mode === 'pan') return;
    const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;

    if (mode === 'draw') {
      const target = project.splines.find((s) => s.id === splineId)?.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      if (!activeSplineId) {
        // start a new spline sharing this node (future junction)
        const point = [...target.position];
        const s = makeSpline(`Road ${project.splines.length + 1}`, nextColor(project.splines.length));
        s.nodes = [makeNode(point)];
        setProject({ ...project, splines: [...project.splines, s] }, true);
        activeSplineId = s.id;
        selection = { kind: 'node', splineId: s.id, nodeId: s.nodes[0].id };
        notify();
        return;
      }
      if (activeSplineId === splineId) {
        if (isEndpoint && selectedNodeId !== nodeId) {
          setProject({
            ...project,
            splines: project.splines.map((s) => (s.id === splineId ? { ...s, closed: true } : s)),
          }, true);
          setMode('select');
        }
        return;
      }
      if (isEndpoint) {
        // join the two splines end-to-end
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
        }, true);
        activeSplineId = splineId;
        selection = { kind: 'node', splineId, nodeId };
        setMode('select');
        notify();
        return;
      }
      // snap onto a mid-spline node without joining (shared node -> junction)
      appendDrawNode([...target.position], true);
      return;
    }

    selection = { kind: 'node', splineId, nodeId };
    activeSplineId = splineId;
    notify();
  }

  // --- modes / selection -----------------------------------------------------------
  function setMode(m) {
    if (m === 'draw') {
      activeSplineId = null;
      selection = { kind: 'scene' };
    }
    snapHint = null;
    mode = m;
    notify();
  }

  function select(sel) {
    selection = sel;
    if (sel.kind === 'spline' || sel.kind === 'node') activeSplineId = sel.splineId;
    mode = 'select';
    snapHint = null;
    notify();
  }

  function nextColor(existing) {
    return SPLINE_COLORS[existing % SPLINE_COLORS.length];
  }

  function addSpline(kind) {
    const n = project.splines.length;
    const s = makeSpline(kind === 'road' ? `Road ${n + 1}` : `Bridge ${n + 1}`, nextColor(n));
    if (kind !== 'road') s.bridge = { ...s.bridge, enabled: true, type: kind };
    setProject({
      ...project,
      splines: [...project.splines, s],
      scene: kind === 'road' ? project.scene : { ...project.scene, drawHeight: 4 },
    }, true);
    activeSplineId = s.id;
    selection = { kind: 'spline', splineId: s.id };
    setMode('draw');
  }

  function addInterchangeHere() {
    setProject(addInterchange(project, 0, 0), true);
  }

  function deleteSelected() {
    if (selection.kind === 'node') deleteNode(selection.splineId, selection.nodeId);
    else if (selection.kind === 'spline') deleteSpline(selection.splineId);
  }

  function closeSelectedLoop() {
    const id = selection.kind === 'spline' || selection.kind === 'node' ? selection.splineId : null;
    if (!id) return;
    updateSpline(id, (s) => (s.closed || s.nodes.length < 3 ? s : { ...s, closed: true }));
  }

  // --- undo / redo -------------------------------------------------------------------
  function undo() {
    if (history.past.length === 0) return;
    history.future.push(cloneProject(project));
    project = history.past.pop();
    selection = { kind: 'scene' };
    activeSplineId = null;
    saved = false;
    rebuildNow();
    notify();
  }

  function redo() {
    if (history.future.length === 0) return;
    history.past.push(cloneProject(project));
    project = history.future.pop();
    selection = { kind: 'scene' };
    activeSplineId = null;
    saved = false;
    rebuildNow();
    notify();
  }

  // --- persistence / export -------------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      saved = true;
      onState && onState({ rerenderPanels: false });
    } catch {
      window.alert('Unable to save locally — browser storage may be full.');
    }
  }

  function newProject(demo) {
    project = demo === 'interchange' ? demoInterchange() : demo === 'harbour' ? demoHarbour() : defaultProject();
    history.past.length = 0;
    history.future.length = 0;
    lastPush = 0;
    selection = { kind: 'scene' };
    activeSplineId = null;
    mode = 'select';
    snapHint = null;
    saved = false;
    rebuildNow();
    notify();
  }

  function exportObj() {
    downloadText(
      `${project.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.obj`,
      networkToObj(network, project.name),
      'text/plain',
    );
  }

  function exportJson() {
    downloadText(
      `${project.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.road.json`,
      JSON.stringify(project, null, 2),
      'application/json',
    );
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setProject(migrateProject(JSON.parse(String(reader.result))), true);
        selection = { kind: 'scene' };
        activeSplineId = null;
        rebuildNow();
        notify();
      } catch {
        window.alert('Could not parse that project file.');
      }
    };
    reader.readAsText(file);
  }

  // --- pointer interaction ---------------------------------------------------------------
  const down = { x: 0, y: 0, moved: false, button: 0 };
  let pendingDeselect = false;

  function viewPlaneDrag(clientX, clientY, startPos) {
    // total delta of a view-plane drag from drag start
    const { ray, camera } = viewport.rayFromClient(clientX, clientY);
    const normal = new (ray.direction.constructor)(0, 0, 0);
    camera.getWorldDirection(normal);
    const n = [normal.x, normal.y, normal.z];
    const o = [ray.origin.x, ray.origin.y, ray.origin.z];
    const d = [ray.direction.x, ray.direction.y, ray.direction.z];
    // touch of the ray with the plane through startPos perpendicular to view
    const denom = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
    if (Math.abs(denom) < 1e-8) return null;
    const t = ((startPos[0] - o[0]) * n[0] + (startPos[1] - o[1]) * n[1] + (startPos[2] - o[2]) * n[2]) / denom;
    if (t < 0) return null;
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    return p;
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.button !== 2) return;
    down.x = e.clientX; down.y = e.clientY; down.moved = false; down.button = e.button;
    const hit = viewport.pick(e.clientX, e.clientY);

    if (hit.kind === 'gizmo') {
      const g = viewport.gizmoAt(e.clientX, e.clientY);
      if (g && g.gizmo.beginDrag(g.part, g.ray, viewport.rayFromClient(e.clientX, e.clientY).camera)) {
        drag.kind = 'gizmo';
        drag.view = g.view;
        drag.part = g.part;
        drag.gizmo = g.gizmo;
        drag.starts = captureDragStarts(selection);
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
        window.addEventListener('pointercancel', onWindowPointerUp, { once: true });
        return;
      }
    }

    if (hit.kind === 'node' && mode !== 'pan') {
      handleNodePointerDown(hit.splineId, hit.nodeId, hit.isEndpoint);
      // direct node drag (left button, select mode)
      if (mode === 'select' && e.button === 0) {
        const s = project.splines.find((x) => x.id === hit.splineId);
        const n = s && s.nodes.find((x) => x.id === hit.nodeId);
        if (n) {
          drag.kind = 'node';
          drag.view = hit.view;
          drag.nodeRef = { splineId: hit.splineId, nodeId: hit.nodeId };
          drag.starts = new Map([['pos', [...n.position]], ['in', [...n.handleIn]], ['out', [...n.handleOut]]]);
          window.addEventListener('pointermove', onWindowPointerMove);
          window.addEventListener('pointerup', onWindowPointerUp, { once: true });
          window.addEventListener('pointercancel', onWindowPointerUp, { once: true });
        }
      }
      return;
    }

    if (hit.kind === 'junction') {
      selection = { kind: 'junction', junctionId: hit.junctionId };
      notify();
      return;
    }

    if (hit.kind === 'handle' && mode === 'select' && e.button === 0) {
      const s = project.splines.find((x) => x.id === hit.splineId);
      const n = s && s.nodes.find((x) => x.id === hit.nodeId);
      if (n) {
        selection = { kind: 'node', splineId: hit.splineId, nodeId: hit.nodeId };
        activeSplineId = hit.splineId;
        drag.kind = 'handle';
        drag.view = hit.view;
        drag.handleRef = { splineId: hit.splineId, nodeId: hit.nodeId, which: hit.which };
        const hp = hit.which === 'in' ? n.handleIn : n.handleOut;
        drag.starts = new Map([['pos', [...hp]]]);
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
        window.addEventListener('pointercancel', onWindowPointerUp, { once: true });
        notify();
      }
      return;
    }

    if (hit.kind === 'ground') {
      if (mode === 'draw' && e.button === 0) {
        const raw = hit.point;
        const target = findSnapTarget(project, raw, { nodeRadius: 2.0, curveRadius: 1.0 });
        if (target) {
          const nm = project.splines.find((s) => s.id === target.splineId)?.name ?? '';
          snapHint = target.kind === 'node' ? `Snapped to node · ${nm}` : `Snapped to curve · ${nm}`;
          appendDrawNode(target.point, true);
        } else {
          snapHint = null;
          appendDrawNode(raw, false);
        }
        return;
      }
      // camera drag: right button anywhere; left button in pan mode or
      // left-drag orbit in select mode (a clean click still deselects)
      const wantCamera = e.button === 2 || (mode === 'pan' && e.button === 0) || (mode === 'select' && e.button === 0);
      if (wantCamera) {
        viewport.startCameraDrag(e.clientX, e.clientY, e.button === 2 && mode !== 'pan' ? 2 : 0);
        drag.kind = 'camera';
        drag.view = hit.view;
        pendingDeselect = mode === 'select' && e.button === 0;
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
        window.addEventListener('pointercancel', onWindowPointerUp, { once: true });
      }
      return;
    }

    // empty space: deselect on clean click in select mode
    if (mode === 'select' && e.button === 0) {
      selection = { kind: 'scene' };
      activeSplineId = null;
      notify();
    }
  }

  function onPointerMove(e) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
    if (drag.kind === 'camera') {
      viewport.moveCameraDrag(e.clientX, e.clientY);
      return;
    }
    if (drag.kind === 'gizmo') {
      const { ray, camera } = viewport.rayFromClient(e.clientX, e.clientY);
      const total = drag.gizmo.dragMove(ray, e.ctrlKey);
      if (total) onGizmoDeltaTotal(total[0], total[1], total[2]);
      return;
    }
    if (drag.kind === 'node' || drag.kind === 'handle') {
      const ref = drag.kind === 'node' ? drag.nodeRef : drag.handleRef;
      const s = project.splines.find((x) => x.id === ref.splineId);
      const n = s && s.nodes.find((x) => x.id === ref.nodeId);
      if (!n) return;
      const startPos = drag.starts.get('pos');
      const touch = viewPlaneDrag(e.clientX, e.clientY, startPos);
      if (!touch) return;
      const newPos = [touch[0], touch[1], touch[2]];
      if (drag.kind === 'node') {
        const hIn = drag.starts.get('in');
        const hOut = drag.starts.get('out');
        const d = [newPos[0] - startPos[0], newPos[1] - startPos[1], newPos[2] - startPos[2]];
        updateNodeRaw(ref.splineId, ref.nodeId, {
          position: newPos,
          handleIn: [hIn[0] + d[0], hIn[1] + d[1], hIn[2] + d[2]],
          handleOut: [hOut[0] + d[0], hOut[1] + d[1], hOut[2] + d[2]],
        });
      } else {
        const key = drag.handleRef.which === 'in' ? 'handleIn' : 'handleOut';
        updateNodeRaw(ref.splineId, ref.nodeId, { [key]: newPos });
      }
      return;
    }
    // hover: cursor + snap hint
    const hit = viewport.pick(e.clientX, e.clientY);
    const interactive = hit.kind === 'node' || hit.kind === 'junction' || hit.kind === 'gizmo' || hit.kind === 'handle';
    document.body.style.cursor = interactive ? 'pointer' : (mode === 'pan' ? 'grab' : 'auto');
    if (mode === 'draw' && hit.kind === 'ground') {
      const target = findSnapTarget(project, hit.point, { nodeRadius: 2.0, curveRadius: 1.0 });
      snapHint = target
        ? (target.kind === 'node'
          ? `Snap: node · ${project.splines.find((s) => s.id === target.splineId)?.name ?? ''}`
          : `Snap: curve · ${project.splines.find((s) => s.id === target.splineId)?.name ?? ''}`)
        : null;
      onState && onState({ rerenderPanels: false });
    }
  }

  function onWindowPointerMove(e) { onPointerMove(e); }

  function onWindowPointerUp() {
    window.removeEventListener('pointermove', onWindowPointerMove);
    if (drag.kind === 'gizmo') {
      drag.gizmo.endDrag();
      finishDragSnap();
    } else if (drag.kind === 'node') {
      finishDragSnap();
    } else if (drag.kind === 'camera') {
      viewport.endCameraDrag();
      // a clean left click on empty ground in select mode deselects
      if (pendingDeselect && !down.moved) {
        selection = { kind: 'scene' };
        activeSplineId = null;
        notify();
      }
    }
    pendingDeselect = false;
    drag.kind = null;
    drag.starts = null;
    document.body.style.cursor = 'auto';
  }

  function onPointerUpLocal() {
    if (drag.kind === 'camera') {
      viewport.endCameraDrag();
      drag.kind = null;
    }
  }

  /** Snap the dragged node onto a nearby node/curve on release (exact joins). */
  function finishDragSnap() {
    if (selection.kind !== 'node') return;
    const s = project.splines.find((x) => x.id === selection.splineId);
    const n = s && s.nodes.find((x) => x.id === selection.nodeId);
    if (!n) return;
    const target = findSnapTarget(project, n.position, {
      excludeNodeId: n.id, nodeRadius: 1.5, curveRadius: 1.0,
    });
    if (target) {
      shiftNode(selection.splineId, selection.nodeId, target.point);
      snapHint = target.kind === 'node' ? `Snapped to node` : `Snapped to curve`;
    }
    rebuildNow();
    notify();
  }

  function onWheel(e) {
    e.preventDefault();
    viewport.zoomAt(e.clientX, e.clientY, e.deltaY);
  }

  // --- keyboard -----------------------------------------------------------------------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      if (typing) return;
      e.preventDefault();
      redo();
      return;
    }
    if (typing) return;
    switch (e.key) {
      case 'Escape':
        selection = { kind: 'scene' };
        activeSplineId = null;
        snapHint = null;
        setMode('select');
        break;
      case 'Delete':
      case 'Backspace':
        deleteSelected();
        break;
      case 'v': case 'V': setMode('select'); break;
      case 'p': case 'P': setMode('draw'); break;
      case 'h': case 'H': setMode('pan'); break;
      case 'g': case 'G':
        updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } }));
        notify();
        break;
      case 'f': case 'F': frameAll(); break;
      case '1': frameIso(); break;
      case '2': frameTop(); break;
      case '3': frameFront(); break;
    }
  }

  // --- view framing ----------------------------------------------------------------------
  function computeBounds() {
    let min = null;
    let max = null;
    for (const s of project.splines) {
      for (const n of s.nodes) {
        for (const p of [n.position, n.handleIn, n.handleOut]) {
          if (!min || !max) { min = [...p]; max = [...p]; continue; }
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], p[i]);
            max[i] = Math.max(max[i], p[i]);
          }
        }
      }
    }
    return min && max ? { min, max } : null;
  }

  function frameAll() { viewport.frameAll(computeBounds()); }
  function frameIso() { viewport.frameIso(); frameAll(); }
  function frameTop() { viewport.frameTop(); }
  function frameFront() { viewport.frameFront(); }

  function setSplit(f) { viewport.setSplit(f); }

  // --- initial state -----------------------------------------------------------------------
  function loadInitial() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = migrateProject(JSON.parse(raw));
        if (parsed.splines.length > 0) return parsed;
      }
    } catch { /* fall through to demo */ }
    return demoInterchange();
  }

  // wire DOM events
  const el = viewport.domElement;
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerup', onPointerUpLocal);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => viewport.resize());

  // first paint
  rebuildNow();
  viewport.setSceneSettings(project.scene);
  notify();

  return {
    // state accessors
    getState: () => ({
      project, mode, selection, activeSplineId, network, saved, snapHint,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      stats: network.stats,
    }),
    // actions
    setMode, select, setSplit,
    updateSpline, updateProject, updateNode: shiftNode, moveSpline,
    addSpline, addInterchangeHere, deleteSelected, closeSelectedLoop,
    undo, redo, save, newProject, exportObj, exportJson, importJsonFile,
    frameAll, frameIso, frameTop, frameFront,
    toggleSplineVisibility: (id) => updateSpline(id, (s) => ({ ...s, visible: !s.visible })),
    setDrawHeight: (h) => updateProject((p) => ({ ...p, scene: { ...p.scene, drawHeight: h } })),
    renameProject: (name) => updateProject((p) => ({ ...p, name })),
  };
}
