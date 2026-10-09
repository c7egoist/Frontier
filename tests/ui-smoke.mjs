// ---------------------------------------------------------------------------
// ui-smoke.mjs — executes the REAL src/ui.js headlessly with a stub DOM and a
// recording fake editor/viewport: mounts the shell, renders every inspector
// variant (scene / spline / node / junction), fires events on every control,
// and checks the Slate chrome wiring. Run: node tests/ui-smoke.mjs
// ---------------------------------------------------------------------------
import { installGlobals, makeTester, StubEl } from './stubdom.mjs';

const G = installGlobals();
const { win } = G;

const { demoInterchange } = await import('../src/model.js');
const { buildNetwork } = await import('../src/network.js');
const { mountUI } = await import('../src/ui.js');

const { t, eq, group, summary } = makeTester('ui-smoke');

function makeState(overrides = {}) {
  const project = demoInterchange();
  const network = buildNetwork(project);
  return {
    project,
    mode: 'select',
    selection: { kind: 'scene' },
    activeSplineId: null,
    network,
    saved: true,
    snapHint: null,
    canUndo: true,
    canRedo: false,
    stats: network.stats,
    ...overrides,
  };
}

// --- recording fake editor (explicit surface: missing methods throw) ----------
const calls = [];
const rec = (name) => (...args) => { calls.push([name, ...args]); };
let current = makeState();
const editor = {
  getState: () => current,
  setMode: (m) => { current = { ...current, mode: m }; calls.push(['setMode', m]); },
  select: (s) => { current = { ...current, selection: s }; calls.push(['select', s]); },
  updateSpline: rec('updateSpline'),
  updateProject: rec('updateProject'),
  updateNode: rec('updateNode'),
  moveSpline: rec('moveSpline'),
  addSpline: rec('addSpline'),
  addInterchangeHere: rec('addInterchangeHere'),
  deleteSelected: rec('deleteSelected'),
  closeSelectedLoop: rec('closeSelectedLoop'),
  undo: rec('undo'),
  redo: rec('redo'),
  save: rec('save'),
  newProject: rec('newProject'),
  exportObj: rec('exportObj'),
  exportJson: rec('exportJson'),
  importJsonFile: rec('importJsonFile'),
  frameAll: rec('frameAll'),
  frameIso: rec('frameIso'),
  frameTop: rec('frameTop'),
  frameFront: rec('frameFront'),
  toggleSplineVisibility: rec('toggleSplineVisibility'),
  setDrawHeight: rec('setDrawHeight'),
  renameProject: rec('renameProject'),
  setSplit: rec('setSplit'),
};
const called = (name) => calls.some((c) => c[0] === name);

// --- fake viewport -------------------------------------------------------------
const splits = [];
const viewport = {
  getSplit: () => 0.5,
  setSplit: (f) => { splits.push(f); },
  projectToScreen: () => ({ x: 120, y: 80 }),
  resize() {},
};

// --- mount ---------------------------------------------------------------------
const root = new StubEl('div');
const ui = mountUI(root);
group('mount');
t('returns a viewport host cell', ui.viewportHost && ui.viewportHost.className === 'rw-viewport');
t('shell has menubar / tabstrip / main / statusbar', (() => {
  const classes = [];
  root.walk((e) => classes.push(e.className));
  return classes.includes('fw-menubar') && classes.includes('fw-tabstrip')
    && classes.includes('fw-main') && classes.includes('fw-statusbar');
})());
t('viewport cell has divider, labels, tools, hintbar', (() => {
  const classes = [];
  ui.viewportHost.walk((e) => classes.push(e.className));
  return ['rw-divider', 'rw-viewlabel', 'rw-viewtools', 'rw-hintbar', 'rw-caption-tag'].every((c) => classes.includes(c));
})());

ui.bind(editor, viewport);
ui.refresh(editor.getState(), { rerenderPanels: true });

const countClass = (cls, host = root) => {
  let n = 0;
  host.walk((e) => { if (e.className.split(' ').includes(cls)) n++; });
  return n;
};
const findAll = (pred, host = root) => {
  const out = [];
  host.walk((e) => { if (pred(e)) out.push(e); });
  return out;
};

// --- scene inspector -------------------------------------------------------------
group('scene selection');
eq('tab strip: scene tab + 6 splines', countClass('fw-tab'), 7);
eq('tab strip has an add button', countClass('fw-tab-add'), 1);
t('outliner lists 6 splines + 8 junctions', countClass('fw-row') === 14, countClass('fw-row'));
t('scene inspector has sections', countClass('fw-sec') >= 3, countClass('fw-sec'));
t('scene inspector has sliders', countClass('fw-slider') >= 5, countClass('fw-slider'));
t('status bar shows patch stats', (() => {
  const sb = findAll((e) => e.className === 'fw-statusbar')[0];
  return sb && sb.children.some((c) => String(c.innerHTML).includes('patches'));
})());
t('menubar shows the project name field', findAll((e) => e.className === 'fw-docname').length === 1);
t('saved indicator shows saved', (() => {
  const d = findAll((e) => e.className.startsWith('fw-dirty'))[0];
  return d && d.innerHTML.includes('saved');
})());

// --- spline inspector --------------------------------------------------------------
group('spline selection');
const spline = current.project.splines[0];
current = { ...current, selection: { kind: 'spline', splineId: spline.id }, activeSplineId: spline.id };
ui.refresh(current, { rerenderPanels: true });
t('spline inspector shows identity + cross-section + features', countClass('fw-sec') >= 6, countClass('fw-sec'));
t('spline inspector has paving/markings/drainage/rails/bridge sections', (() => {
  const heads = findAll((e) => e.tagName === 'SUMMARY').map((e) => e.text);
  return ['Cross-section', 'Paving pattern', 'Markings', 'Drainage', 'Guardrails', 'Bridge']
    .every((h) => heads.some((x) => x.includes(h)));
})());
t('spline tab is active', (() => {
  const tabs = findAll((e) => e.className.split(' ').includes('fw-tab'));
  return tabs.some((tb) => tb.className.includes('active') && tb.text.includes(spline.name));
})());

// --- node inspector ------------------------------------------------------------------
group('node selection');
const node = spline.nodes[0];
current = { ...current, selection: { kind: 'node', splineId: spline.id, nodeId: node.id } };
ui.refresh(current, { rerenderPanels: true });
t('node inspector shows a Node section with xyz', (() => {
  const heads = findAll((e) => e.tagName === 'SUMMARY').map((e) => e.text);
  return heads.some((x) => x.includes('Node')) && countClass('fw-xyz') >= 1;
})());

// --- junction inspector -----------------------------------------------------------------
group('junction selection');
const junction = current.network.junctions[0];
current = { ...current, selection: { kind: 'junction', junctionId: junction.id } };
ui.refresh(current, { rerenderPanels: true });
t('junction inspector lists arms', (() => {
  const arms = findAll((e) => e.className === 'fw-arm');
  return arms.length === junction.arms.length;
})(), junction.arms.length);
t('junction tag is visible and positioned', (() => {
  const tag = findAll((e) => e.className === 'rw-junction-tag')[0];
  return tag && tag.style.display !== 'none' && tag.style.left === '120px';
})());

// --- draw mode ---------------------------------------------------------------------------
group('draw mode');
current = { ...current, mode: 'draw', selection: { kind: 'scene' }, activeSplineId: null };
ui.refresh(current, { rerenderPanels: true });
t('view tools include a draw-height field in draw mode', (() => {
  const tools = findAll((e) => e.className === 'rw-viewtools')[0];
  return tools && tools.children.some((c) => c.tagName === 'INPUT' && c.type === 'number');
})());
t('hint bar explains draw mode', (() => {
  const hb = findAll((e) => e.className === 'rw-hintbar')[0];
  return hb && String(hb.children.map((c) => c.innerHTML).join(' ')).includes('Click');
})());

// --- event storm: fire every control -------------------------------------------------------
group('control wiring');
calls.length = 0;
// show the spline inspector so the storm exercises spline controls too
current = { ...current, mode: 'select', selection: { kind: 'spline', splineId: spline.id }, activeSplineId: spline.id };
ui.refresh(current, { rerenderPanels: true });
const snapshot = [];
root.walk((e) => snapshot.push(e));
for (const e of snapshot) {
  if (e.tagName === 'BUTTON') e.fire('click', { target: e });
  if (e.tagName === 'INPUT') {
    if (e.type === 'range') e.fire('input', { target: e });
    e.fire('change', { target: e });
  }
  if (e.tagName === 'SELECT') e.fire('change', { target: e });
}
ui.refresh(editor.getState(), { rerenderPanels: true });
t('slider/checkbox wiring calls updateSpline', called('updateSpline'), calls.filter((c) => c[0] === 'updateSpline').length);
t('scene controls call updateProject', called('updateProject'));
t('quick-add buttons call addSpline', called('addSpline'));
t('interchange button calls addInterchangeHere', called('addInterchangeHere'));
t('save button calls save', called('save'));
t('OBJ button calls exportObj', called('exportObj'));
t('eye buttons call toggleSplineVisibility', called('toggleSplineVisibility'));
t('view tools call setMode', called('setMode'));
t('framing buttons call frameAll/frameIso/frameTop/frameFront',
  called('frameAll') && called('frameIso') && called('frameTop') && called('frameFront'));
t('tabs call select', called('select'));
t('no control threw (event storm completed)', true);

// --- menubar dropdown -------------------------------------------------------------------------
group('menubar');
calls.length = 0;
const fileBtn = findAll((e) => e.tagName === 'BUTTON' && e.text === 'File')[0];
t('File menu exists', !!fileBtn);
fileBtn.fire('click', { target: fileBtn });
ui.refresh(editor.getState(), { rerenderPanels: true });
const fileItems = findAll((e) => e.className === 'fw-item');
t('File dropdown shows its items', fileItems.length >= 7, fileItems.length);
const saveItem = fileItems.find((i) => i.text.includes('Save'));
saveItem.fire('click', { target: saveItem });
t('Save menu item calls save', called('save'));
const exportItem = fileItems.find((i) => i.text.includes('Export OBJ'));
exportItem.fire('click', { target: exportItem });
t('Export OBJ menu item calls exportObj', called('exportObj'));

// Edit menu: Undo enabled (canUndo), Delete disabled (scene selection)
current = { ...current, selection: { kind: 'scene' } };
ui.refresh(current, { rerenderPanels: true });
const editBtn = findAll((e) => e.tagName === 'BUTTON' && e.text === 'Edit')[0];
editBtn.fire('click', { target: editBtn });
ui.refresh(editor.getState(), { rerenderPanels: true });
const editItems = findAll((e) => e.className === 'fw-item');
const undoItem = editItems.find((i) => i.text.includes('Undo'));
t('Undo item enabled when canUndo', undoItem && !undoItem.disabled);
const delItem = editItems.find((i) => i.text.includes('Delete selected'));
t('Delete item disabled with scene selection', delItem && delItem.disabled === true);
undoItem.fire('click', { target: undoItem });
t('Undo menu item calls undo', called('undo'));

// project name field
const docName = findAll((e) => e.className === 'fw-docname')[0];
docName.value = 'My Layout';
docName.fire('change', { target: docName });
t('renaming the document calls renameProject', called('renameProject'));

// --- divider drag --------------------------------------------------------------------------------
group('split divider');
splits.length = 0;
const divider = findAll((e) => e.className === 'rw-divider')[0];
divider.fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
win.fire('pointermove', { clientX: 700, clientY: 300 });
win.fire('pointerup', {});
eq('divider drag sets the split fraction', splits[splits.length - 1], 0.7);
t('divider is positioned at the split', divider.style.left === '50%');

// --- light refresh (slider drag path) ---------------------------------------------------------------
group('light refresh');
current = makeState({ selection: { kind: 'spline', splineId: current.project.splines[0].id } });
ui.refresh(current, { rerenderPanels: true });
const inspector = findAll((e) => e.className === 'fw-inspector')[0];
const kidsBefore = inspector.children.length;
current = { ...current, saved: false, snapHint: 'Snap: node · Overpass A' };
ui.refresh(current, { rerenderPanels: false });
eq('light refresh keeps the inspector DOM', inspector.children.length, kidsBefore);
t('light refresh still updates the status bar', (() => {
  const d = findAll((e) => e.className.startsWith('fw-dirty'))[0];
  const sb = findAll((e) => e.className === 'fw-statusbar')[0];
  return d.innerHTML.includes('unsaved')
    && sb.children.some((c) => String(c.innerHTML).includes('Snap: node'));
})());

// --- search filter ------------------------------------------------------------------------------------
group('outliner filter');
const search = findAll((e) => e.tagName === 'INPUT' && e.placeholder === 'Filter…')[0];
t('search box exists', !!search);
search.value = 'overpass';
search.fire('input', { target: search });
const rowsAfter = countClass('fw-row');
t('filter narrows the spline list', rowsAfter < 14 && rowsAfter >= 1, rowsAfter);

summary();
