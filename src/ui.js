// ---------------------------------------------------------------------------
// ui.js — Slate-style editor chrome (vanilla DOM): menu bar, trapezoid tab
// strip, outliner, inspector (black-pill sliders, round checks, pill segs),
// status bar, split-view divider + labels, view tools, hint bar.
// ---------------------------------------------------------------------------

const ICONS = {
  cursor: '<path d="M4 3l7 17 2.5-6.5L20 11z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  hand: '<path d="M8 13V5a2 2 0 114 0v6"/><path d="M12 11V4a2 2 0 114 0v7"/><path d="M16 11V6a2 2 0 114 0v8a7 7 0 01-7 7h-1a7 7 0 01-7-7v-2a2 2 0 114 0"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  top: '<path d="M12 3v18"/><path d="M8 7l4-4 4 4"/>',
  front: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  focus: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 10.6a2.5 2.5 0 003.4 3.4"/><path d="M9.9 5.2A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a17.4 17.4 0 01-3 3.9"/><path d="M6.1 7.6A16.7 16.7 0 002 12s3.5 7 10 7a10 10 0 004.7-1.2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  rail: '<path d="M4 15h16"/><path d="M4 9h16"/><path d="M7 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/>',
  road: '<path d="M7 3L3 21"/><path d="M17 3l4 18"/><path d="M12 4v3"/><path d="M12 10v3"/><path d="M12 16v3"/>',
  arch: '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M3 18h18"/>',
  undo: '<path d="M3 8v5h5"/><path d="M3.5 13a8.5 8.5 0 102-6.5L3 8"/>',
  redo: '<path d="M21 8v5h-5"/><path d="M20.5 13a8.5 8.5 0 11-2-6.5L21 8"/>',
};

function icon(name, cls = 'ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------------------
// control library
// ---------------------------------------------------------------------------

function slider(parent, label, value, min, max, step, fmt, onInput) {
  const row = el('div', 'fw-slider');
  row.appendChild(el('label', null, label));
  const track = el('div', 'track');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const val = el('span', 'val');
  const paint = () => { val.textContent = fmt ? fmt(Number(input.value)) : input.value; };
  paint();
  input.addEventListener('input', () => { paint(); onInput(Number(input.value)); });
  track.appendChild(input);
  track.appendChild(val);
  row.appendChild(track);
  parent.appendChild(row);
  return { row, input, val, paint };
}

function check(parent, label, checked, onChange, sub) {
  const row = el('label', 'fw-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  const box = el('span', 'box');
  box.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
  const ct = el('span', 'ct');
  ct.appendChild(el('span', null, label));
  if (sub) ct.appendChild(el('small', null, sub));
  input.addEventListener('change', () => onChange(input.checked));
  row.appendChild(input);
  row.appendChild(box);
  row.appendChild(ct);
  parent.appendChild(row);
  return row;
}

function selectField(parent, label, value, options, onChange) {
  if (label) parent.appendChild(el('div', 'fw-fieldlab', label));
  const wrap = el('div', 'fw-select');
  const sel = el('select');
  for (const [val, lab] of options) {
    const o = el('option', null, lab);
    o.value = val;
    if (val === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  parent.appendChild(wrap);
  return sel;
}

function seg(parent, options, value, onChange) {
  const row = el('div', 'fw-seg');
  for (const [val, lab] of options) {
    const b = el('button', val === value ? 'active' : '', lab);
    b.addEventListener('click', () => onChange(val));
    row.appendChild(b);
  }
  parent.appendChild(row);
  return row;
}

function section(parent, title, open, iconName) {
  const sec = el('details', 'fw-sec');
  if (open) sec.open = true;
  const sum = el('summary');
  sum.appendChild(el('span', 'caret', icon('chevron')));
  if (iconName) sum.appendChild(el('span', null, icon(iconName)));
  sum.appendChild(el('span', null, title));
  sec.appendChild(sum);
  const body = el('div', 'fw-sec-body');
  sec.appendChild(body);
  parent.appendChild(sec);
  return body;
}

function xyz(parent, pos, onChange) {
  const row = el('div', 'fw-xyz');
  const labs = ['X', 'Y', 'Z'];
  for (let i = 0; i < 3; i++) {
    const cell = el('div');
    cell.appendChild(el('label', null, labs[i]));
    const input = el('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = Number(pos[i]).toFixed(2);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) {
        const np = [...pos];
        np[i] = v;
        onChange(np);
      }
    });
    cell.appendChild(input);
    row.appendChild(cell);
  }
  parent.appendChild(row);
  return row;
}

function kv(parent, k, v) {
  const row = el('div', 'fw-kv');
  row.appendChild(el('span', null, k));
  row.appendChild(el('span', null, v));
  parent.appendChild(row);
}

// ---------------------------------------------------------------------------
// UI shell
// ---------------------------------------------------------------------------

export function mountUI(root) {
  const app = el('div', 'fw-app');
  app.addEventListener('contextmenu', (e) => e.preventDefault());
  root.appendChild(app);

  // --- menu bar ---
  const menubar = el('header', 'fw-menubar');
  menubar.appendChild(el('span', 'fw-brand', 'Frontier <span>road editor</span>'));
  const menuHost = el('div', null);
  menubar.appendChild(menuHost);
  const spacer = el('span', 'spacer');
  menubar.appendChild(spacer);
  const docName = el('input', 'fw-docname');
  docName.spellcheck = false;
  menubar.appendChild(docName);
  const dirtyTag = el('span', 'fw-dirty clean');
  dirtyTag.innerHTML = '<span class="dot"></span>saved';
  menubar.appendChild(dirtyTag);
  app.appendChild(menubar);

  // --- tab strip ---
  const tabstrip = el('div', 'fw-tabstrip');
  const tabs = el('div', 'fw-tabs');
  tabstrip.appendChild(tabs);
  tabstrip.appendChild(el('span', 'spacer'));
  const stripNote = el('span', 'fw-strip-note');
  tabstrip.appendChild(stripNote);
  app.appendChild(tabstrip);

  // --- main ---
  const main = el('div', 'fw-main');
  const outliner = el('div', 'fw-outliner');
  const viewportCell = el('div', 'rw-viewport');
  const inspector = el('div', 'fw-inspector');
  main.appendChild(outliner);
  main.appendChild(viewportCell);
  main.appendChild(inspector);
  app.appendChild(main);

  // outliner chrome (built once so the search box keeps focus across re-renders)
  const outHead = el('div', 'fw-panehead');
  outHead.appendChild(el('span', null, 'Outliner'));
  const outCount = el('span', 'count', '');
  outHead.appendChild(outCount);
  const outStats = el('div', 'fw-stats');
  const outSearch = el('div', 'fw-search');
  const outSearchInput = el('input');
  outSearchInput.placeholder = 'Filter…';
  outSearch.appendChild(outSearchInput);
  const outTree = el('div', 'fw-tree');
  const outFoot = el('div', 'fw-outfoot');
  outliner.appendChild(outHead);
  outliner.appendChild(outStats);
  outliner.appendChild(outSearch);
  outliner.appendChild(outTree);
  outliner.appendChild(outFoot);
  outSearchInput.addEventListener('input', () => renderOutliner(editorRef.getState()));

  // viewport overlays: labels, divider, tools, caption, hintbar, junction tag
  const label2d = el('div', 'rw-viewlabel');
  label2d.style.left = '12px';
  label2d.innerHTML = '<b>2D</b> · PLAN';
  viewportCell.appendChild(label2d);
  const label3d = el('div', 'rw-viewlabel');
  label3d.style.right = '12px';
  label3d.innerHTML = '<b>3D</b> · PERSPECTIVE';
  viewportCell.appendChild(label3d);
  const divider = el('div', 'rw-divider');
  viewportCell.appendChild(divider);
  const tools = el('div', 'rw-viewtools');
  viewportCell.appendChild(tools);
  const caption = el('div', 'rw-caption-tag');
  viewportCell.appendChild(caption);
  const hintbar = el('div', 'rw-hintbar');
  viewportCell.appendChild(hintbar);
  const junctionTag = el('div', 'rw-junction-tag');
  junctionTag.style.display = 'none';
  viewportCell.appendChild(junctionTag);

  // --- status bar ---
  const statusbar = el('footer', 'fw-statusbar');
  app.appendChild(statusbar);

  // hidden file input for JSON import
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,.road.json,application/json';
  fileInput.style.display = 'none';
  app.appendChild(fileInput);

  const api = {
    viewportHost: viewportCell,
    refresh(state, ev) { refreshUI(state, ev); },
    bind(editor, viewport) { bindUI(editor, viewport); },
  };

  // --- state captured by closures ---
  let editorRef = null;
  let viewportRef = null;
  let menuOpen = -1;
  let lastState = null;

  function menus(state) {
    const selSpline = state.selection.kind === 'spline' || state.selection.kind === 'node'
      ? state.project.splines.find((s) => s.id === state.selection.splineId) ?? null
      : null;
    return [
      {
        label: 'File',
        items: [
          { label: 'New empty', action: () => editorRef.newProject(false) },
          { label: 'Demo: diamond interchange', action: () => editorRef.newProject('interchange') },
          { label: 'Demo: harbour crossing', action: () => editorRef.newProject('harbour') },
          'sep',
          { label: 'Save', shortcut: 'Ctrl+S', action: () => editorRef.save() },
          'sep',
          { label: 'Import JSON…', action: () => fileInput.click() },
          { label: 'Export OBJ', action: () => editorRef.exportObj() },
          { label: 'Export JSON', action: () => editorRef.exportJson() },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !state.canUndo, action: () => editorRef.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !state.canRedo, action: () => editorRef.redo() },
          'sep',
          {
            label: 'Delete selected',
            shortcut: 'Del',
            disabled: state.selection.kind !== 'node' && state.selection.kind !== 'spline',
            action: () => editorRef.deleteSelected(),
          },
        ],
      },
      {
        label: 'Spline',
        items: [
          { label: 'New road', shortcut: 'P', action: () => editorRef.addSpline('road') },
          { label: 'New beam bridge', action: () => editorRef.addSpline('beam') },
          { label: 'New arch bridge', action: () => editorRef.addSpline('arch') },
          { label: 'Add diamond interchange', action: () => editorRef.addInterchangeHere() },
          'sep',
          {
            label: 'Close loop',
            disabled: !selSpline || selSpline.closed || selSpline.nodes.length < 3,
            action: () => editorRef.closeSelectedLoop(),
          },
          {
            label: 'Delete spline',
            disabled: !selSpline,
            action: () => { if (selSpline) { editorRef.select({ kind: 'spline', splineId: selSpline.id }); editorRef.deleteSelected(); } },
          },
        ],
      },
      {
        label: 'View',
        items: [
          { label: 'Frame all', shortcut: 'F', action: () => editorRef.frameAll() },
          { label: 'Isometric', shortcut: '1', action: () => editorRef.frameIso() },
          { label: 'Top', shortcut: '2', action: () => editorRef.frameTop() },
          { label: 'Front', shortcut: '3', action: () => editorRef.frameFront() },
          'sep',
          {
            label: 'Grid', shortcut: 'G',
            action: () => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } })),
          },
          {
            label: 'Water',
            action: () => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showWater: !p.scene.showWater } })),
          },
          'sep',
          { label: 'Split 50 / 50', action: () => { viewportRef.setSplit(0.5); layoutOverlays(); } },
          { label: '2D only', action: () => { viewportRef.setSplit(0.98); layoutOverlays(); } },
          { label: '3D only', action: () => { viewportRef.setSplit(0.02); layoutOverlays(); } },
        ],
      },
      {
        label: 'Help',
        items: [
          {
            label: 'Shortcuts',
            action: () => window.alert(
              'V select · P draw · H pan\n'
              + 'F frame all · 1 iso · 2 top · 3 front · G grid\n'
              + 'Del delete · Esc deselect\n'
              + 'Ctrl+Z / Ctrl+Y undo/redo · Ctrl+S save\n'
              + 'Gizmo: drag axis / plane / ring · Ctrl = snap 0.25\n'
              + 'Select a junction and drag its single handle to move the whole joint.',
            ),
          },
        ],
      },
    ];
  }

  function renderMenubar(state) {
    menuHost.innerHTML = '';
    const defs = menus(state);
    defs.forEach((m, i) => {
      const wrap = el('div', `fw-menu ${menuOpen === i ? 'open' : ''}`);
      const btn = el('button', null, m.label);
      btn.addEventListener('click', () => { menuOpen = menuOpen === i ? -1 : i; renderMenubar(editorRef.getState()); });
      wrap.appendChild(btn);
      if (menuOpen === i) {
        const dd = el('div', 'fw-dropdown');
        m.items.forEach((it) => {
          if (it === 'sep') { dd.appendChild(el('div', 'fw-msep')); return; }
          const item = el('button', 'fw-item', it.label);
          if (it.disabled) item.disabled = true;
          if (it.shortcut) item.appendChild(el('span', 'key', it.shortcut));
          item.addEventListener('click', () => { menuOpen = -1; renderMenubar(editorRef.getState()); it.action && it.action(); });
          dd.appendChild(item);
        });
        wrap.appendChild(dd);
      }
      wrap.addEventListener('mouseenter', () => {
        if (menuOpen !== -1 && menuOpen !== i) { menuOpen = i; renderMenubar(editorRef.getState()); }
      });
      menuHost.appendChild(wrap);
    });
    if (menuOpen !== -1) {
      const closer = el('div');
      closer.style.cssText = 'position:fixed;inset:0;z-index:55';
      closer.addEventListener('click', () => { menuOpen = -1; renderMenubar(editorRef.getState()); });
      closer.addEventListener('contextmenu', (e) => { e.preventDefault(); menuOpen = -1; renderMenubar(editorRef.getState()); });
      menuHost.appendChild(closer);
    }
    docName.value = state.project.name;
  }

  function renderTabs(state) {
    tabs.innerHTML = '';
    const selTabId = state.selection.kind === 'spline' || state.selection.kind === 'node' ? state.selection.splineId : null;
    const sceneTab = el('button', `fw-tab ${state.selection.kind === 'scene' || state.selection.kind === 'junction' ? 'active' : ''}`);
    sceneTab.appendChild(el('span', 'tab-name', 'Scene'));
    sceneTab.addEventListener('click', () => editorRef.select({ kind: 'scene' }));
    tabs.appendChild(sceneTab);
    state.project.splines.forEach((s) => {
      const tab = el('button', `fw-tab ${s.id === selTabId ? 'active' : ''}`);
      tab.appendChild(el('span', 'tab-dot'));
      tab.firstChild.style.background = s.color;
      tab.appendChild(el('span', 'tab-name', s.name));
      tab.appendChild(el('span', 'tab-sub', String(s.nodes.length)));
      tab.addEventListener('click', () => editorRef.select({ kind: 'spline', splineId: s.id }));
      tabs.appendChild(tab);
    });
    const add = el('button', 'fw-tab-add', '+');
    add.title = 'Add spline (road / bridge) — see Spline menu';
    add.addEventListener('click', () => { menuOpen = 2; renderMenubar(editorRef.getState()); });
    tabs.appendChild(add);
    stripNote.textContent = `${state.project.splines.length} splines · ${state.network.junctions.length} junctions`;
  }

  function renderOutliner(state) {
    outCount.textContent = String(state.project.splines.length);
    outStats.innerHTML = '';
    const mk = (v, l) => { const d = el('div'); d.appendChild(el('b', null, v)); d.appendChild(el('span', null, l)); return d; };
    outStats.appendChild(mk(String(state.stats.spans), 'SPANS'));
    outStats.appendChild(mk(String(state.stats.junctions), 'JUNCTIONS'));
    outStats.appendChild(mk(`${(state.stats.triangles / 1000).toFixed(1)}k`, 'TRIS'));

    outTree.innerHTML = '';
    const tree = outTree;
    const q = outSearchInput.value.trim().toLowerCase();
    const visSplines = state.project.splines.filter((s) => !q || s.name.toLowerCase().includes(q));

    const g1 = el('div', 'fw-group', 'SPLINES');
    g1.appendChild(el('span', 'n', String(visSplines.length)));
    tree.appendChild(g1);
    visSplines.forEach((s) => {
      const row = el('div', `fw-row ${s.id === (state.selection.kind === 'spline' || state.selection.kind === 'node' ? state.selection.splineId : null) ? 'selected' : ''} ${s.visible ? '' : 'dimmed'}`);
      const mainBtn = el('button', 'main');
      mainBtn.addEventListener('click', () => editorRef.select({ kind: 'spline', splineId: s.id }));
      const chip = el('span', 'chip');
      chip.style.background = s.color;
      mainBtn.appendChild(chip);
      const txt = el('span', 'txt');
      txt.appendChild(el('strong', null, s.name));
      const sub = s.bridge.enabled ? `${s.bridge.type} bridge · ${s.nodes.length} nodes` : `${s.nodes.length} nodes`;
      txt.appendChild(el('small', null, sub));
      mainBtn.appendChild(txt);
      if (s.bridge.enabled) mainBtn.appendChild(el('span', 'tag', s.bridge.type.toUpperCase()));
      row.appendChild(mainBtn);
      const eye = el('button', 'eye');
      eye.innerHTML = icon(s.visible ? 'eye' : 'eyeOff');
      eye.title = s.visible ? 'Hide' : 'Show';
      eye.addEventListener('click', () => editorRef.toggleSplineVisibility(s.id));
      row.appendChild(eye);
      tree.appendChild(row);
    });
    if (state.project.splines.length === 0) {
      tree.appendChild(el('div', 'fw-emptynote', 'No roads yet. <b>Press P</b> and click in the 2D plan to draw, or add a <b>diamond interchange</b> from the Spline menu.'));
    }

    if (state.network.junctions.length > 0) {
      const g2 = el('div', 'fw-group', 'JUNCTIONS');
      g2.appendChild(el('span', 'n', String(state.network.junctions.length)));
      tree.appendChild(g2);
      state.network.junctions.forEach((j) => {
        const row = el('div', `fw-row ${state.selection.kind === 'junction' && state.selection.junctionId === j.id ? 'selected' : ''}`);
        const mainBtn = el('button', 'main');
        mainBtn.addEventListener('click', () => editorRef.select({ kind: 'junction', junctionId: j.id }));
        const chip = el('span', 'chip');
        chip.style.background = '#e8b65f';
        mainBtn.appendChild(chip);
        const txt = el('span', 'txt');
        txt.appendChild(el('strong', null, j.topology));
        txt.appendChild(el('small', null, `${j.arms.length} arms · ${j.kind}`));
        mainBtn.appendChild(txt);
        mainBtn.appendChild(el('span', 'tag', `${j.position[0].toFixed(0)}, ${j.position[2].toFixed(0)}`));
        row.appendChild(mainBtn);
        tree.appendChild(row);
      });
    }

    outFoot.innerHTML = '';
    outFoot.appendChild(el('div', 'cap', 'QUICK ADD'));
    const row1 = el('div', 'fw-btnrow');
    const b1 = el('button', 'fw-btn', `${icon('road')} Road`);
    b1.addEventListener('click', () => editorRef.addSpline('road'));
    const b2 = el('button', 'fw-btn', `${icon('arch')} Bridge`);
    b2.addEventListener('click', () => editorRef.addSpline('beam'));
    row1.appendChild(b1); row1.appendChild(b2);
    outFoot.appendChild(row1);
    const b3 = el('button', 'fw-btn block', `${icon('split')} Diamond interchange`);
    b3.title = 'Insert a grade-separated diamond interchange at the origin';
    b3.addEventListener('click', () => editorRef.addInterchangeHere());
    outFoot.appendChild(b3);
  }

  function renderInspector(state) {
    inspector.innerHTML = '';
    const sel = state.selection;
    const head = el('div', 'fw-objhead');
    const type = el('div', 'type');
    let title = 'Scene';
    let chipColor = '#8a8a8a';
    let kindLabel = 'PROJECT';
    if (sel.kind === 'spline' || sel.kind === 'node') {
      const s = state.project.splines.find((x) => x.id === sel.splineId);
      if (s) {
        title = sel.kind === 'spline' ? s.name : `${s.name} · Node`;
        chipColor = s.color;
        kindLabel = s.bridge.enabled ? `${s.bridge.type.toUpperCase()} BRIDGE` : 'SPLINE';
      }
    } else if (sel.kind === 'junction') {
      const j = state.network.junctions.find((x) => x.id === sel.junctionId);
      title = j ? j.topology : 'Junction';
      kindLabel = 'JUNCTION';
      chipColor = '#e8b65f';
    }
    type.appendChild(el('span', 'chip'));
    type.firstChild.style.background = chipColor;
    type.appendChild(el('span', null, kindLabel));
    head.appendChild(type);
    head.appendChild(el('h1', null, title));
    inspector.appendChild(head);

    const scroll = el('div', 'fw-scroll');
    inspector.appendChild(scroll);

    if (sel.kind === 'node') {
      const s = state.project.splines.find((x) => x.id === sel.splineId);
      const n = s && s.nodes.find((x) => x.id === sel.nodeId);
      if (n) {
        const b = section(scroll, 'Node', true, 'cursor');
        xyz(b, n.position, (np) => editorRef.updateNode(sel.splineId, sel.nodeId, np));
        slider(b, 'Height', n.position[1], -20, 60, 0.05, (v) => v.toFixed(2), (v) => {
          editorRef.updateNode(sel.splineId, sel.nodeId, [n.position[0], v, n.position[2]]);
        });
        const b2 = section(scroll, 'Spline', false, 'road');
        renderSplineBody(b2, s, state);
      }
    } else if (sel.kind === 'spline') {
      const s = state.project.splines.find((x) => x.id === sel.splineId);
      if (s) renderSplineBody(scroll, s, state);
    } else if (sel.kind === 'junction') {
      renderJunctionBody(scroll, state);
    } else {
      renderSceneBody(scroll, state);
    }

    const foot = el('div', 'fw-foot');
    const meta = el('div', 'meta');
    meta.appendChild(el('span', null, `v2 · ${state.stats.patches} patches`));
    meta.appendChild(el('span', 'right', `${(state.stats.length).toFixed(1)} m of road`));
    foot.appendChild(meta);
    const srow = el('div', 'fw-btnrow');
    const saveBtn = el('button', 'fw-btn', `${icon('save')} Save`);
    saveBtn.addEventListener('click', () => editorRef.save());
    const objBtn = el('button', 'fw-btn', `${icon('download')} OBJ`);
    objBtn.title = 'Export the built network as a world-space OBJ for the game engine';
    objBtn.addEventListener('click', () => editorRef.exportObj());
    srow.appendChild(saveBtn); srow.appendChild(objBtn);
    foot.appendChild(srow);
    inspector.appendChild(foot);
  }

  function renderSplineBody(parent, s, state) {
    const head = section(parent, 'Identity', true, 'road');
    const nameRow = el('div', 'fw-xyz');
    // name field (single)
    const nameCell = el('div');
    const nameInput = el('input');
    nameInput.value = s.name;
    nameInput.style.width = '100%';
    nameInput.addEventListener('change', () => editorRef.updateSpline(s.id, (x) => ({ ...x, name: nameInput.value })));
    nameCell.appendChild(nameInput);
    nameRow.appendChild(nameCell);
    head.appendChild(nameRow);
    check(head, 'Visible', s.visible, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, visible: v })), 'Show/hide in both views');
    check(head, 'Closed loop', s.closed, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, closed: v }))), 'Roundabout-style ring';
    const del = el('button', 'fw-btn danger block', `${icon('trash')} Delete spline`);
    del.addEventListener('click', () => { editorRef.select({ kind: 'spline', splineId: s.id }); editorRef.deleteSelected(); });
    head.appendChild(del);

    const xs = section(parent, 'Cross-section', true, 'layers');
    seg(xs, [['single', 'Single'], ['two-lane', '2-lane'], ['three-lane', '3-lane'], ['four-lane', '4-lane'], ['highway', 'Hwy']], s.cross.preset,
      (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, preset: v } })));
    slider(xs, 'Width', s.cross.width, 3, 30, 0.5, (v) => `${v.toFixed(1)} m`, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, width: v } })));
    slider(xs, 'Lanes', s.cross.lanes, 1, 6, 1, String, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, lanes: Math.round(v) } })));
    slider(xs, 'Pavement L', s.cross.paveLeft, 0, 6, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, paveLeft: v } })));
    slider(xs, 'Pavement R', s.cross.paveRight, 0, 6, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, paveRight: v } })));
    slider(xs, 'Curb height', s.cross.curbHeight, 0, 0.4, 0.01, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, curbHeight: v } })));
    slider(xs, 'Crossfall', s.cross.crossfall, 0, 0.08, 0.005, (v) => v.toFixed(3), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, crossfall: v } })));

    const pv = section(parent, 'Paving pattern', false, 'grid');
    selectField(pv, 'Pattern', s.cross.pavePattern,
      [['none', 'None'], ['slabs', 'Concrete slabs'], ['pavers', 'Pavers (running bond)'], ['gravel', 'Gravel stipple']],
      (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, pavePattern: v } })));
    slider(pv, 'Pattern scale', s.cross.patternScale ?? 1, 0.5, 2, 0.1, (v) => `×${v.toFixed(1)}`, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, patternScale: v } })));

    const mk = section(parent, 'Markings', false, 'road');
    const m = s.cross.markings;
    check(mk, 'Center line', m.centerLine, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, markings: { ...x.cross.markings, centerLine: v } } })), 'Dashed amber centerline');
    check(mk, 'Edge lines', m.edgeLines, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, markings: { ...x.cross.markings, edgeLines: v } } })));
    check(mk, 'Lane lines', m.laneLines, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, markings: { ...x.cross.markings, laneLines: v } } })));
    check(mk, 'Crosswalks', m.crosswalks, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, markings: { ...x.cross.markings, crosswalks: v } } })), 'Zebra stripes at junctions');
    check(mk, 'Stop bars', m.stopBars, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, cross: { ...x.cross, markings: { ...x.cross.markings, stopBars: v } } })));

    const dr = section(parent, 'Drainage', false, 'droplet');
    check(dr, 'Drainage', s.drainage.enabled, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, enabled: v } })), 'Gutter channel + inlet grates');
    check(dr, 'Gutter', s.drainage.gutter, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, gutter: v } })), 'Sloped channel at the carriageway edge');
    slider(dr, 'Gutter width', s.drainage.gutterWidth, 0.1, 1.2, 0.05, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, gutterWidth: v } })));
    slider(dr, 'Gutter depth', s.drainage.gutterDepth, 0.01, 0.15, 0.01, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, gutterDepth: v } })));
    check(dr, 'Inlet grates', s.drainage.grates, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, grates: v } })));
    slider(dr, 'Grate spacing', s.drainage.grateSpacing, 4, 40, 1, (v) => `${v.toFixed(0)} m`, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, drainage: { ...x.drainage, grateSpacing: v } })));

    const gr = section(parent, 'Guardrails', false, 'rail');
    check(gr, 'Guardrails', s.rails.enabled, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, enabled: v } })), 'W-beam rail on the pavement edge');
    slider(gr, 'Rail height', s.rails.height, 0.2, 1.4, 0.05, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, height: v } })));
    slider(gr, 'Rail thickness', s.rails.thickness, 0.05, 0.4, 0.01, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, thickness: v } })));
    check(gr, 'Posts', s.rails.posts, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, posts: v } })));
    slider(gr, 'Post spacing', s.rails.postSpacing, 1, 6, 0.2, (v) => v.toFixed(1), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, postSpacing: v } })));
    check(gr, 'End terminals', s.rails.terminals, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, rails: { ...x.rails, terminals: v } })), 'Turned-down rail ends at dead ends');

    const br = section(parent, 'Bridge', false, 'arch');
    check(br, 'Bridge', s.bridge.enabled, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, enabled: v } })), 'Elevated structure with piers');
    seg(br, [['beam', 'Beam'], ['arch', 'Arch']], s.bridge.type, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, type: v } })));
    slider(br, 'Deck depth', s.bridge.deckDepth, 0.15, 1.0, 0.05, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, deckDepth: v } })));
    slider(br, 'Girder depth', s.bridge.girderDepth, 0.3, 3, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, girderDepth: v } })));
    slider(br, 'Girders', s.bridge.girderCount, 1, 6, 1, String, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, girderCount: Math.round(v) } })));
    check(br, 'Diaphragms', s.bridge.diaphragms, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, diaphragms: v } })));
    slider(br, 'Pier spacing', s.bridge.pierSpacing, 6, 40, 1, (v) => `${v.toFixed(0)} m`, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, pierSpacing: v } })));
    selectField(br, 'Pier style', s.bridge.pierStyle,
      [['single', 'Single column'], ['bent', 'Bent (2 columns)'], ['wall', 'Wall']],
      (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, pierStyle: v } })));
    selectField(br, 'Column shape', s.bridge.columnShape,
      [['round', 'Round'], ['square', 'Square']],
      (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, columnShape: v } })));
    slider(br, 'Pier size', s.bridge.pierSize, 0.3, 1.6, 0.05, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, pierSize: v } })));
    selectField(br, 'Parapet', s.bridge.parapet,
      [['parapet', 'Concrete parapet'], ['rail', 'W-beam rail']],
      (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, parapet: v } })));
    slider(br, 'Parapet height', s.bridge.parapetHeight, 0.4, 2, 0.05, (v) => v.toFixed(2), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, parapetHeight: v } })));
    check(br, 'Scuppers', s.bridge.scuppers, (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, scuppers: v } })), 'Deck drainage outlets');
    slider(br, 'Arch rise', s.bridge.archRise, 1.5, 14, 0.5, (v) => v.toFixed(1), (v) => editorRef.updateSpline(s.id, (x) => ({ ...x, bridge: { ...x.bridge, archRise: v } })));
  }

  function renderJunctionBody(parent, state) {
    const j = state.network.junctions.find((x) => x.id === state.selection.junctionId);
    if (!j) return;
    const b = section(parent, 'Joint', true, 'split');
    kv(b, 'Topology', j.topology);
    kv(b, 'Kind', j.kind);
    kv(b, 'Arms', String(j.arms.length));
    kv(b, 'Anchors', String(j.anchors.length));
    const hint = el('p', 'fw-muted', 'Drag the single gizmo handle at the junction to move the whole joint — every connected road end follows and the geometry regenerates cleanly.');
    b.appendChild(hint);
    const arms = section(parent, 'Arms', true, 'road');
    j.arms.forEach((a) => {
      const row = el('div', 'fw-arm');
      const chip = el('span', 'chip');
      chip.style.background = a.color;
      row.appendChild(chip);
      row.appendChild(el('span', null, a.splineName));
      row.appendChild(el('small', null, `${a.angleDeg.toFixed(0)}°`));
      arms.appendChild(row);
    });
    const js = section(parent, 'Junction settings', false, 'focus');
    slider(js, 'Corner radius', state.project.junctions.cornerRadius, 2, 20, 0.5, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, cornerRadius: v } })));
    slider(js, 'Fillet steps', state.project.junctions.filletSteps, 4, 24, 1, String, (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, filletSteps: Math.round(v) } })));
    slider(js, 'Tub depth', state.project.junctions.depth, 0.3, 4, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, depth: v } })));
    slider(js, 'Side inset', state.project.junctions.inset, 0.5, 4, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, inset: v } })));
  }

  function renderSceneBody(parent, state) {
    const b = section(parent, 'Scene', true, 'box');
    slider(b, 'Ground height', state.project.scene.groundZ, -10, 10, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, groundZ: v } })));
    slider(b, 'Water level', state.project.scene.waterLevel, -10, 5, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, waterLevel: v } })));
    check(b, 'Show ground', state.project.scene.showGround, (v) => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showGround: v } })));
    check(b, 'Show water', state.project.scene.showWater, (v) => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showWater: v } })));
    check(b, 'Show grid', state.project.scene.showGrid, (v) => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: v } })));
    slider(b, 'Draw height', state.project.scene.drawHeight, -5, 30, 0.05, (v) => v.toFixed(2), (v) => editorRef.setDrawHeight(v));

    const js = section(parent, 'Junctions (global)', false, 'split');
    slider(js, 'Corner radius', state.project.junctions.cornerRadius, 2, 20, 0.5, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, cornerRadius: v } })));
    slider(js, 'Fillet steps', state.project.junctions.filletSteps, 4, 24, 1, String, (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, filletSteps: Math.round(v) } })));
    slider(js, 'Tub depth', state.project.junctions.depth, 0.3, 4, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, depth: v } })));
    slider(js, 'Side inset', state.project.junctions.inset, 0.5, 4, 0.1, (v) => v.toFixed(1), (v) => editorRef.updateProject((p) => ({ ...p, junctions: { ...p.junctions, inset: v } })));

    const st = section(parent, 'Statistics', false, 'layers');
    kv(st, 'Patches', String(state.stats.patches));
    kv(st, 'Triangles', String(state.stats.triangles));
    kv(st, 'Spans', String(state.stats.spans));
    kv(st, 'Junctions', String(state.stats.junctions));
    kv(st, 'Road length', `${state.stats.length.toFixed(1)} m`);
  }

  function renderStatusbar(state) {
    statusbar.innerHTML = '';
    const put = (html, cls) => { const s = el('span', cls, html); statusbar.appendChild(s); return s; };
    put(`<b>${state.stats.patches}</b> patches · <b>${(state.stats.triangles / 1000).toFixed(1)}k</b> tris`);
    put('|', 'sep');
    put(`<b>${state.network.spans.length}</b> spans · <b>${state.network.junctions.length}</b> junctions`);
    put('|', 'sep');
    // selection label
    let label = 'Scene';
    if (state.selection.kind === 'junction') {
      const j = state.network.junctions.find((x) => x.id === state.selection.junctionId);
      label = j ? `Junction · ${j.topology}` : 'Junction';
    } else if (state.selection.kind === 'spline' || state.selection.kind === 'node') {
      const s = state.project.splines.find((x) => x.id === state.selection.splineId);
      if (s) label = state.selection.kind === 'spline' ? s.name : `${s.name} · Node`;
    }
    put(label);
    if (state.snapHint) {
      put('|', 'sep');
      put(`◇ ${state.snapHint}`, 'snap');
    }
    statusbar.appendChild(el('span', 'spacer'));
    put('<kbd>V</kbd> select · <kbd>P</kbd> draw · <kbd>H</kbd> pan · <kbd>F</kbd> frame · <kbd>Del</kbd> delete');
    dirtyTag.className = `fw-dirty ${state.saved ? 'clean' : ''}`;
    dirtyTag.innerHTML = `<span class="dot"></span>${state.saved ? 'saved' : 'unsaved'}`;
  }

  const MODE_DOT = { select: '#b9b9b9', draw: '#f0f0f0', pan: '#717171' };
  const MODE_HINT = {
    select: '<b>Click</b> node/junction · <b>drag</b> gizmo or node, snaps on release · <b>Left-drag</b> orbit · <b>Right-drag</b> pan · <b>Wheel</b> zoom',
    draw: '<b>Click</b> ground to extend · <b>Click</b> a road to join it · snap to nodes/curves · <b>Right-drag</b> pan · <kbd>Esc</kbd> finish',
    pan: '<b>Left-drag</b> pan · <b>Right-drag</b> orbit · <b>Wheel</b> zoom',
  };

  function renderTools(state) {
    tools.innerHTML = '';
    const btn = (label, ic, title, active, action) => {
      const b = el('button', active ? 'active' : '', `${icon(ic)} ${label}`);
      b.title = title;
      b.addEventListener('click', action);
      tools.appendChild(b);
      return b;
    };
    btn('Select', 'cursor', 'Select (V)', state.mode === 'select', () => editorRef.setMode('select'));
    btn('Draw', 'pen', 'Draw (P)', state.mode === 'draw', () => editorRef.setMode('draw'));
    btn('Pan', 'hand', 'Pan (H)', state.mode === 'pan', () => editorRef.setMode('pan'));
    tools.appendChild(el('div', 'vt-sep'));
    btn('Grid', 'grid', 'Toggle grid (G)', state.project.scene.showGrid, () => editorRef.updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: !p.scene.showGrid } })));
    tools.appendChild(el('div', 'vt-sep'));
    btn('Iso', 'box', 'Isometric (1)', false, () => editorRef.frameIso());
    btn('Top', 'top', 'Top (2)', false, () => editorRef.frameTop());
    btn('Front', 'front', 'Front (3)', false, () => editorRef.frameFront());
    btn('Frame', 'focus', 'Frame all (F)', false, () => editorRef.frameAll());
    if (state.mode === 'draw') {
      tools.appendChild(el('div', 'vt-sep'));
      tools.appendChild(el('span', 'vt-label', 'Height'));
      const h = el('input');
      h.type = 'number';
      h.step = '0.5';
      h.value = String(state.project.scene.drawHeight);
      h.addEventListener('change', () => {
        const v = Number(h.value);
        if (Number.isFinite(v)) editorRef.setDrawHeight(v);
      });
      tools.appendChild(h);
    }
  }

  function renderOverlays(state) {
    caption.innerHTML = `<b>${state.project.name}</b> · ${state.project.splines.length} splines · <span class="amber">${state.network.junctions.length} junctions</span>`;
    hintbar.innerHTML = '';
    const dot = el('span', 'mode-dot');
    dot.style.background = MODE_DOT[state.mode] || '#888';
    hintbar.appendChild(dot);
    hintbar.appendChild(el('span', null, MODE_HINT[state.mode] || ''));
    layoutOverlays();
    // junction tag follows the selected junction
    if (state.selection.kind === 'junction') {
      const j = state.network.junctions.find((x) => x.id === state.selection.junctionId);
      if (j && viewportRef) {
        junctionTag.style.display = '';
        junctionTag.innerHTML = `<small>JUNCTION · DRAG THE HANDLE</small>${j.topology}`;
        positionJunctionTag(j.position);
      } else {
        junctionTag.style.display = 'none';
      }
    } else {
      junctionTag.style.display = 'none';
    }
  }

  function layoutOverlays() {
    if (!viewportRef) return;
    const split = viewportRef.getSplit();
    divider.style.left = `${split * 100}%`;
    label2d.style.display = split > 0.12 ? '' : 'none';
    label3d.style.display = split < 0.88 ? '' : 'none';
    const sel = lastState && lastState.selection;
    if (sel && sel.kind === 'junction') {
      const j = lastState.network.junctions.find((x) => x.id === sel.junctionId);
      if (j) positionJunctionTag(j.position);
    }
  }

  function positionJunctionTag(worldPos) {
    // place the tag at the junction in whichever view it is visible; use the 3D view
    const p = viewportRef.projectToScreen('3d', worldPos);
    junctionTag.style.left = `${p.x}px`;
    junctionTag.style.top = `${p.y - 10}px`;
  }

  function refreshUI(state, ev) {
    lastState = state;
    if (!ev || ev.rerenderPanels !== false) {
      renderMenubar(state);
      renderTabs(state);
      renderOutliner(state);
      renderInspector(state);
      renderTools(state);
    }
    renderStatusbar(state);
    renderOverlays(state);
  }

  function bindUI(editor, viewport) {
    editorRef = editor;
    viewportRef = viewport;
    docName.addEventListener('change', () => editorRef.renameProject(docName.value));
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) editorRef.importJsonFile(f);
      fileInput.value = '';
    });
    // split divider drag
    let dragging = false;
    divider.addEventListener('pointerdown', (e) => {
      dragging = true;
      e.preventDefault();
      e.stopPropagation();
      const onMove = (ev) => {
        const rect = viewportCell.getBoundingClientRect();
        viewportRef.setSplit((ev.clientX - rect.left) / Math.max(1, rect.width));
        layoutOverlays();
      };
      const onUp = () => {
        dragging = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    window.addEventListener('resize', () => layoutOverlays());
    // keep the junction tag glued while rendering
    const tick = () => {
      if (editorRef) {
        const st = editorRef.getState();
        if (st.selection && st.selection.kind === 'junction') {
          const j = st.network.junctions.find((x) => x.id === st.selection.junctionId);
          if (j) positionJunctionTag(j.position);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return api;
}
