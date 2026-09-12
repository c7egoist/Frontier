import { SketchKernel, KernelError, Geometry } from './cad-kernel.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'frontier.sketch.v2';
const MAX_HISTORY = 100;

let kernel = new SketchKernel();
const state = {
  tool: 'select',
  phase: null,
  preview: null,
  hover: null,
  cursor: { x: 0, y: 0 },
  view: { center: { x: 0, y: 0 }, zoom: 12 },
  grid: true,
  snap: true,
  selection: { entities: new Set(), points: new Set() },
  undo: [], redo: [], drag: null,
  status: 'Ready — topological 2D sketch kernel',
};

const toolCopy = {
  select: ['Select', 'Click curves or vertices. Shift-click adds to the selection.'],
  line: ['Line', 'Click a start point, then click an endpoint. Continue to chain lines.'],
  polyline: ['Polyline', 'Click vertices. Click the first vertex again to close; Enter finishes.'],
  rectangle: ['Rectangle', 'Click two opposite corners. Horizontal and vertical constraints are added.'],
  circle: ['Circle', 'Click centre, then click a point on the circumference.'],
  arc: ['Arc', 'Click centre, start point, then end point.'],
  move: ['Move', 'Drag the selected geometry. Partial selections detach cleanly from unselected topology.'],
  scale: ['Scale', 'Drag away from or toward the selection centre for uniform analytical scaling.'],
  trim: ['Trim', 'Click a line near a crossing. The clicked side is removed.'],
};
const entitySymbols = { line: '╱', circle: '○', arc: '◜' };
const entityColor = { line: '#4fd8e0', circle: '#4fd8e0', arc: '#4fd8e0' };

function format(n, digits = 2) { return Number(n).toFixed(digits); }
function eventPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function worldToScreen(point) {
  const rect = canvas.getBoundingClientRect();
  return { x: (point.x - state.view.center.x) * state.view.zoom + rect.width / 2, y: (state.view.center.y - point.y) * state.view.zoom + rect.height / 2 };
}
function screenToWorld(point) {
  const rect = canvas.getBoundingClientRect();
  return { x: (point.x - rect.width / 2) / state.view.zoom + state.view.center.x, y: state.view.center.y - (point.y - rect.height / 2) / state.view.zoom };
}
function gridStep() {
  const desired = 72 / state.view.zoom;
  const power = 10 ** Math.floor(Math.log10(Math.max(desired, 1e-9)));
  const fraction = desired / power;
  return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power;
}
function canvasSize() {
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return rect;
}
function lineDash(construction) { ctx.setLineDash(construction ? [5, 5] : []); }
function selected(id) { return state.selection.entities.has(id); }
function pointSelected(id) { return state.selection.points.has(id); }
function selectionEntityIds() { return [...state.selection.entities]; }
function selectedSingleEntity() { return state.selection.entities.size === 1 ? kernel.entity(selectionEntityIds()[0]) : null; }
function setStatus(message, level = 'good') {
  state.status = message;
  $('#operationStatus').textContent = message;
  $('#bottomBar .bottom-center .led').className = `led ${level}`;
}
function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(message, 'error');
  console.warn('[Frontier Sketch]', error);
}
function persist() { try { localStorage.setItem(STORAGE_KEY, kernel.toJSON(false)); } catch (_) { /* local storage is optional */ } }

function historySnapshot(label, before) {
  state.undo.push({ label, sketch: before });
  if (state.undo.length > MAX_HISTORY) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}
function commit(label, operation) {
  const before = kernel.snapshot();
  try {
    const result = operation();
    kernel.assertValid();
    historySnapshot(label, before);
    persist(); setStatus(label);
    render();
    return result;
  } catch (error) {
    kernel.restore(before); showError(error); render(); return null;
  }
}
function undo() {
  const entry = state.undo.pop(); if (!entry) return;
  state.redo.push({ label: entry.label, sketch: kernel.snapshot() });
  kernel.restore(entry.sketch); clearSelection(); persist(); setStatus(`Undid ${entry.label}`); render();
}
function redo() {
  const entry = state.redo.pop(); if (!entry) return;
  state.undo.push({ label: entry.label, sketch: kernel.snapshot() });
  kernel.restore(entry.sketch); clearSelection(); persist(); setStatus(`Redid ${entry.label}`); render();
}
function updateHistoryButtons() { $('#undo').disabled = !state.undo.length; $('#redo').disabled = !state.redo.length; }

function clearSelection() { state.selection.entities.clear(); state.selection.points.clear(); }
function selectedBounds() {
  const ids = selectionEntityIds(); if (!ids.length) return null;
  return kernel.bounds(ids);
}
function selectionPivot() {
  const box = selectedBounds();
  if (!box) return null;
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}
function entityName(entity) { return entity.name || `${entity.type[0].toUpperCase()}${entity.type.slice(1)} ${entity.id.replace('e_', '')}`; }
function setTool(tool) {
  state.tool = tool; state.phase = null; state.preview = null; state.drag = null;
  $$('#floatingToolbar [data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  const [name, prompt] = toolCopy[tool] || ['Action', ''];
  $('#modeName').textContent = name; $('#modePill kbd').textContent = shortcutFor(tool); $('#promptText').textContent = prompt;
  setStatus(`${name} tool active`); render();
}
function shortcutFor(tool) { return ({ select: 'V', line: 'L', polyline: 'P', rectangle: 'R', circle: 'C', arc: 'A', move: 'M', scale: 'S', trim: 'T' })[tool] || ''; }

function draw() {
  const rect = canvasSize();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawGrid(rect);
  for (const entity of kernel.entities) drawEntity(entity);
  drawDimensions();
  drawPreview();
  drawVertices();
  drawHover();
  drawSelectionPivot();
}
function drawGrid(rect) {
  if (!state.grid) return;
  const step = gridStep();
  const topLeft = screenToWorld({ x: 0, y: 0 }); const bottomRight = screenToWorld({ x: rect.width, y: rect.height });
  const minX = Math.floor(Math.min(topLeft.x, bottomRight.x) / step) * step;
  const maxX = Math.ceil(Math.max(topLeft.x, bottomRight.x) / step) * step;
  const minY = Math.floor(Math.min(topLeft.y, bottomRight.y) / step) * step;
  const maxY = Math.ceil(Math.max(topLeft.y, bottomRight.y) / step) * step;
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.beginPath();
  for (let x = minX; x <= maxX + step * .5; x += step) { const p = worldToScreen({ x, y: 0 }); ctx.moveTo(Math.round(p.x) + .5, 0); ctx.lineTo(Math.round(p.x) + .5, rect.height); }
  for (let y = minY; y <= maxY + step * .5; y += step) { const p = worldToScreen({ x: 0, y }); ctx.moveTo(0, Math.round(p.y) + .5); ctx.lineTo(rect.width, Math.round(p.y) + .5); }
  ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.beginPath();
  const xAxis = worldToScreen({ x: 0, y: 0 }).y, yAxis = worldToScreen({ x: 0, y: 0 }).x;
  if (xAxis >= 0 && xAxis <= rect.height) { ctx.moveTo(0, Math.round(xAxis) + .5); ctx.lineTo(rect.width, Math.round(xAxis) + .5); }
  if (yAxis >= 0 && yAxis <= rect.width) { ctx.moveTo(Math.round(yAxis) + .5, 0); ctx.lineTo(Math.round(yAxis) + .5, rect.height); }
  ctx.stroke();
}
function strokeEntity(entity, options = {}) {
  const isSelected = selected(entity.id);
  const isHover = state.hover?.kind === 'entity' && state.hover.id === entity.id;
  ctx.save(); lineDash(entity.construction); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = options.color || (isSelected ? '#ffffff' : entity.construction ? '#b99af8' : '#4fd8e0');
  ctx.globalAlpha = options.alpha ?? (entity.construction ? .78 : .94); ctx.lineWidth = options.width || (isSelected ? 2.5 : isHover ? 2.1 : 1.45);
  if (entity.type === 'line') {
    const [a, b] = kernel.endpoints(entity).map(worldToScreen); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else {
    const samples = kernel.entitySample(entity, entity.type === 'circle' ? 72 : 48).map(worldToScreen);
    ctx.beginPath(); samples.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
    if (entity.type === 'arc') {
      const ends = kernel.arcEnds(entity).map(worldToScreen); ctx.fillStyle = ctx.strokeStyle; ends.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); });
    }
  }
  ctx.restore();
}
function drawEntity(entity) { strokeEntity(entity); }
function drawVertices() {
  const show = new Set();
  for (const id of state.selection.entities) kernel.entityPointIds(id).forEach(pointId => show.add(pointId));
  state.selection.points.forEach(id => show.add(id));
  if (state.hover?.kind === 'point') show.add(state.hover.id);
  ctx.save();
  for (const id of show) {
    let point; try { point = kernel.point(id); } catch (_) { continue; }
    const p = worldToScreen(point); const active = pointSelected(id) || state.hover?.id === id;
    ctx.fillStyle = active ? '#f4d85b' : '#101214'; ctx.strokeStyle = active ? '#fff3a4' : '#4fd8e0'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function drawHover() {
  if (!state.snap || !state.hover?.snapPoint) return;
  const p = worldToScreen(state.hover.snapPoint); ctx.save(); ctx.strokeStyle = '#f4d85b'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function drawSelectionPivot() {
  if (!['move', 'scale'].includes(state.tool) || !state.selection.entities.size) return;
  const p = worldToScreen(selectionPivot()); ctx.save(); ctx.strokeStyle = '#f4d85b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8); ctx.stroke(); ctx.restore();
}
function drawPreview() {
  const preview = state.preview; if (!preview) return;
  ctx.save(); ctx.strokeStyle = '#f4d85b'; ctx.fillStyle = '#f4d85b'; ctx.globalAlpha = .94; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
  if (preview.type === 'line') {
    const a = worldToScreen(preview.a), b = worldToScreen(preview.b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else if (preview.type === 'rectangle') {
    const a = worldToScreen(preview.a), b = worldToScreen(preview.b); ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
  } else if (preview.type === 'circle' || preview.type === 'arc') {
    const c = worldToScreen(preview.center); const r = preview.radius * state.view.zoom; ctx.beginPath();
    if (preview.type === 'circle') ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    else ctx.arc(c.x, c.y, r, -preview.startAngle, -preview.endAngle, preview.clockwise);
    ctx.stroke();
  } else if (preview.type === 'polyline') {
    const points = preview.points.map(worldToScreen); ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  }
  ctx.restore();
}
function drawDimensions() {
  for (const constraint of kernel.constraints.filter(c => ['length', 'radius'].includes(c.type))) {
    let entity; try { entity = kernel.entity(constraint.entity); } catch (_) { continue; }
    let at, text;
    if (constraint.type === 'length' && entity.type === 'line') { const [a, b] = kernel.endpoints(entity); at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; text = `↔ ${format(constraint.value)} mm`; }
    else if (constraint.type === 'radius' && ['circle', 'arc'].includes(entity.type)) { const c = kernel.point(entity.center); at = { x: c.x + entity.radius * .72, y: c.y + entity.radius * .72 }; text = `R ${format(constraint.value)} mm`; }
    else continue;
    const p = worldToScreen(at); ctx.save(); ctx.font = '10px "DM Mono", monospace'; const width = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(20,18,9,.85)'; ctx.strokeStyle = 'rgba(244,216,91,.65)'; ctx.lineWidth = 1; roundedRect(ctx, p.x - width / 2, p.y - 10, width, 20, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f4d85b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, p.x, p.y); ctx.restore();
  }
}
function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (context.roundRect) { context.roundRect(x, y, width, height, radius); return; }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y); context.lineTo(x + width - r, y); context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r); context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height); context.quadraticCurveTo(x, y + height, x, y + height - r); context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}

function renderTree() {
  const query = $('#search').value.trim().toLowerCase();
  const entities = kernel.entities.filter(e => !query || entityName(e).toLowerCase().includes(query) || e.type.includes(query));
  const byType = { line: [], circle: [], arc: [] }; entities.forEach(e => byType[e.type].push(e));
  $('#tree').innerHTML = entities.length ? Object.entries(byType).filter(([, items]) => items.length).map(([type, items]) => `
    <div class="tree-group"><div class="tree-group-head"><span>${type}s · ${items.length}</span><i class="line"></i></div>
      ${items.map(entity => `<button class="tree-row ${selected(entity.id) ? 'selected' : ''}" data-entity="${entity.id}" style="--entity-color:${entityColor[entity.type]}">
        <span class="entity-mark">${entitySymbols[entity.type]}</span><span class="tree-copy"><span class="tree-name">${escapeHTML(entityName(entity))}</span><span class="tree-meta">${entityMeta(entity)}</span></span>${entity.construction ? '<span class="construction">◇</span>' : ''}
      </button>`).join('')}
    </div>`).join('') : '<div class="placeholder"><span class="placeholder-icon">⌁</span><strong>No geometry</strong><p>Draw your first analytical curve in the viewport.</p></div>';
  $$('#tree [data-entity]').forEach(button => button.addEventListener('click', event => selectEntity(button.dataset.entity, event.shiftKey)));
  $('#geometryCount').textContent = kernel.entities.length;
  $('#geometryMeta').textContent = `${kernel.entities.filter(e => !e.construction).length} visible curves`;
  const selectedCount = state.selection.entities.size + state.selection.points.size;
  $('#selectionCount').textContent = selectedCount;
  $('#selectionMeta').textContent = selectedCount ? selectionDescription() : 'Nothing selected';
  $('#pointCount').textContent = `${kernel.points.length} vertices`;
  $('#topologyStatus').textContent = `Analytical topology · ${kernel.constraints.length} constraints`;
  $('#emptyHint').classList.toggle('show', !kernel.entities.length);
  $('#documentName').textContent = kernel.sketch.name;
}
function entityMeta(entity) {
  if (entity.type === 'line') return `${format(kernel.lineLength(entity))} mm · ${entity.id}`;
  if (entity.type === 'circle') return `R ${format(entity.radius)} mm · ${entity.id}`;
  return `R ${format(entity.radius)} mm · ${format(Math.abs(kernel.arcSweep(entity)) * 180 / Math.PI, 0)}°`;
}
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function selectionDescription() {
  if (state.selection.points.size === 1 && !state.selection.entities.size) return '1 vertex';
  if (state.selection.entities.size === 1) return entityName(selectedSingleEntity());
  return `${state.selection.entities.size} curves`;
}
function selectEntity(id, additive = false) {
  if (!additive) clearSelection();
  state.selection.points.clear();
  if (additive && state.selection.entities.has(id)) state.selection.entities.delete(id); else state.selection.entities.add(id);
  state.tool = state.tool === 'select' ? 'select' : state.tool; render();
}
function selectPoint(id, additive = false) {
  if (!additive) clearSelection();
  state.selection.entities.clear();
  if (additive && state.selection.points.has(id)) state.selection.points.delete(id); else state.selection.points.add(id);
  render();
}

function inputRow(label, value, options = {}) {
  const unit = options.unit || 'mm';
  return `<div class="property"><label>${label}</label><input data-property="${options.property || ''}" type="number" step="${options.step || '.01'}" value="${Number(value)}"><span class="read">${unit}</span></div>`;
}
function renderInspector() {
  const host = $('#inspectorContent');
  const pointIds = [...state.selection.points], entityIds = selectionEntityIds();
  $('#inspectorBadge').textContent = !pointIds.length && !entityIds.length ? 'Nothing selected' : selectionDescription();
  if (pointIds.length === 1 && !entityIds.length) { renderPointInspector(host, kernel.point(pointIds[0])); return; }
  if (!entityIds.length) {
    host.innerHTML = `<div class="placeholder"><span class="placeholder-icon">⌁</span><strong>2D sketch workbench</strong><p>Lines, circles and arcs are stored analytically with shared topological vertices—not viewport polygons.</p></div>
      <div class="card"><div class="card-title"><strong>Document</strong><span class="type-chip">${kernel.sketch.units}</span></div>${inputRow('Name', '', { property: 'name', unit: '' }).replace('type="number"', 'type="text"').replace('value="0"', `value="${escapeHTML(kernel.sketch.name)}"`)}<div class="property"><span>Geometry</span><span class="read">${kernel.entities.length} curves</span></div><div class="property"><span>Constraints</span><span class="read">${kernel.constraints.length}</span></div></div>`;
    const name = host.querySelector('[data-property="name"]'); name.value = kernel.sketch.name; name.addEventListener('change', () => commit('Rename document', () => { kernel.sketch.name = name.value || 'Untitled sketch'; })); return;
  }
  if (entityIds.length > 1) { renderMultiInspector(host, entityIds); return; }
  renderEntityInspector(host, kernel.entity(entityIds[0]));
}
function renderPointInspector(host, point) {
  host.innerHTML = `<div class="card"><div class="card-title"><strong>Vertex</strong><span class="type-chip">${point.id}</span></div>${inputRow('X', point.x, { property: 'x' })}${inputRow('Y', point.y, { property: 'y' })}<div class="property"><span>Topological use</span><span class="read">${kernel.pointUsers(point.id).length} curves</span></div></div>
    <div class="section-caption">Vertex actions</div><div class="action-grid"><button data-point-action="fix">${point.fixed ? 'Unfix' : 'Fix'} vertex</button><button data-point-action="delete">Delete connected</button></div>`;
  host.querySelectorAll('[data-property]').forEach(input => input.addEventListener('change', () => commit('Move vertex', () => kernel.movePoint(point.id, { x: Number(host.querySelector('[data-property="x"]').value), y: Number(host.querySelector('[data-property="y"]').value) }))));
  host.querySelector('[data-point-action="fix"]').onclick = () => commit(point.fixed ? 'Unfix vertex' : 'Fix vertex', () => { kernel.point(point.id).fixed = !point.fixed; });
  host.querySelector('[data-point-action="delete"]').onclick = () => commit('Delete connected geometry', () => kernel.deletePoints([point.id]));
}
function renderMultiInspector(host, ids) {
  const lines = ids.map(id => kernel.entity(id)).filter(e => e.type === 'line');
  host.innerHTML = `<div class="card"><div class="card-title"><strong>${ids.length} curves selected</strong><span class="type-chip">multi</span></div><div class="selection-list">${ids.map(id => `<span class="selection-pill">${escapeHTML(entityName(kernel.entity(id)))}</span>`).join('')}</div></div>
  <div class="section-caption">Relations</div><div class="action-grid"><button data-constraint="equal" ${ids.length !== 2 ? 'disabled' : ''}>Equal</button><button data-constraint="parallel" ${lines.length !== 2 ? 'disabled' : ''}>Parallel</button><button data-constraint="perpendicular" ${lines.length !== 2 ? 'disabled' : ''}>Perpendicular</button><button data-action="delete">Delete</button></div>
  <div class="section-caption">Transform</div><button class="wide-action" data-action="move">Move selected</button><button class="wide-action" data-action="scale">Uniform scale selected</button>`;
  host.querySelectorAll('[data-constraint]').forEach(button => button.onclick = () => addRelationship(button.dataset.constraint));
  host.querySelector('[data-action="delete"]').onclick = deleteSelection;
  host.querySelector('[data-action="move"]').onclick = () => setTool('move'); host.querySelector('[data-action="scale"]').onclick = () => setTool('scale');
}
function renderEntityInspector(host, entity) {
  let properties = '';
  if (entity.type === 'line') {
    const [a, b] = kernel.endpoints(entity);
    properties = `${inputRow('Start X', a.x, { property: 'a.x' })}${inputRow('Start Y', a.y, { property: 'a.y' })}${inputRow('End X', b.x, { property: 'b.x' })}${inputRow('End Y', b.y, { property: 'b.y' })}<div class="property"><span>Length</span><span class="read">${format(kernel.lineLength(entity))} mm</span></div>`;
  } else {
    const center = kernel.point(entity.center);
    properties = `${inputRow('Centre X', center.x, { property: 'center.x' })}${inputRow('Centre Y', center.y, { property: 'center.y' })}${inputRow('Radius', entity.radius, { property: 'radius' })}${entity.type === 'arc' ? `<div class="property"><span>Sweep</span><span class="read">${format(Math.abs(kernel.arcSweep(entity)) * 180 / Math.PI, 1)}°</span></div>` : ''}`;
  }
  const related = kernel.constraints.filter(c => c.entity === entity.id || c.other === entity.id);
  host.innerHTML = `<div class="card"><div class="card-title"><strong>${escapeHTML(entityName(entity))}</strong><span class="type-chip">${entity.type}</span></div>${properties}<div class="property"><span>Entity ID</span><span class="read">${entity.id}</span></div></div>
  <div class="section-caption">Constraints</div><div class="card constraint-card">${related.length ? related.map(constraintRow).join('') : '<div class="constraint"><span class="constraint-label">No constraints on this curve</span></div>'}</div>
  <div class="action-grid">${constraintActions(entity)}</div>
  <div class="section-caption">Edit</div><div class="action-grid"><button data-action="toggle-construction">${entity.construction ? 'Make geometry' : 'Construction'}</button><button data-action="rename">Rename</button><button data-action="delete">Delete</button><button data-action="move">Move</button></div>`;
  host.querySelectorAll('[data-property]').forEach(input => input.addEventListener('change', () => applyPropertyEdit(entity.id, input.dataset.property, Number(input.value))));
  host.querySelectorAll('[data-dimension]').forEach(input => input.addEventListener('change', () => commit('Edit driving dimension', () => kernel.updateConstraintValue(input.dataset.dimension, Number(input.value)))));
  host.querySelectorAll('[data-remove-constraint]').forEach(button => button.onclick = () => commit('Remove constraint', () => kernel.removeConstraint(button.dataset.removeConstraint)));
  host.querySelectorAll('[data-constraint]').forEach(button => button.onclick = () => addConstraint(button.dataset.constraint));
  host.querySelector('[data-action="toggle-construction"]').onclick = () => commit('Toggle construction', () => { entity.construction = !entity.construction; });
  host.querySelector('[data-action="rename"]').onclick = () => { const name = prompt('Curve name', entityName(entity)); if (name !== null) commit('Rename curve', () => { entity.name = name.trim(); }); };
  host.querySelector('[data-action="delete"]').onclick = deleteSelection; host.querySelector('[data-action="move"]').onclick = () => setTool('move');
}
function constraintRow(c) {
  const symbols = { horizontal: '—', vertical: '│', length: '↔', radius: 'R', equal: '=', parallel: '∥', perpendicular: '⟂', coincident: '•', fixed: '⌗' };
  if (c.type === 'length' || c.type === 'radius') {
    return `<div class="constraint"><span class="constraint-symbol">${symbols[c.type]}</span><span class="constraint-label">${c.type === 'length' ? 'Length' : 'Radius'}</span><input class="dimension-edit" data-dimension="${c.id}" type="number" min="0.000001" step=".01" value="${Number(c.value)}" aria-label="${c.type} dimension"><span class="dimension-value">mm</span><button data-remove-constraint="${c.id}" title="Remove constraint">×</button></div>`;
  }
  const label = c.type[0].toUpperCase() + c.type.slice(1);
  return `<div class="constraint"><span class="constraint-symbol">${symbols[c.type] || '•'}</span><span class="constraint-label">${label}</span><button data-remove-constraint="${c.id}" title="Remove constraint">×</button></div>`;
}
function constraintActions(entity) {
  if (entity.type === 'line') return '<button data-constraint="horizontal">Horizontal</button><button data-constraint="vertical">Vertical</button><button data-constraint="length">Length dimension</button><button data-constraint="fixed">Fix curve</button>';
  return '<button data-constraint="radius">Radius dimension</button><button data-constraint="fixed">Fix curve</button>';
}
function applyPropertyEdit(entityId, property, value) {
  if (!Number.isFinite(value)) return;
  commit('Edit geometry', () => {
    const entity = kernel.entity(entityId);
    if (property === 'radius') { if (value <= 0) throw new KernelError('Radius must be greater than zero.'); entity.radius = value; kernel.solveConstraints(); return; }
    const [owner, axis] = property.split('.'); let point;
    if (owner === 'a') point = kernel.point(entity.a); else if (owner === 'b') point = kernel.point(entity.b); else point = kernel.point(entity.center);
    kernel.movePoint(point.id, { x: axis === 'x' ? value : point.x, y: axis === 'y' ? value : point.y });
  });
}
function addConstraint(type) {
  const entity = selectedSingleEntity(); if (!entity) return;
  const data = { entity: entity.id };
  if (type === 'length') { const value = askNumber('Driving length (mm)', kernel.lineLength(entity), 0); if (value === null) return; data.value = value; }
  if (type === 'radius') { const value = askNumber('Driving radius (mm)', entity.radius, 0); if (value === null) return; data.value = value; }
  commit(`Add ${type} constraint`, () => kernel.addConstraint(type, data));
}
function addRelationship(type) {
  const ids = selectionEntityIds(); if (ids.length !== 2) return showError(new KernelError('Select exactly two entities for that relation.'));
  commit(`Add ${type} constraint`, () => kernel.addConstraint(type, { entity: ids[0], other: ids[1] }));
}

function snapped(world) {
  const grid = gridStep(); let position = { ...world }, pointId = null, source = 'free';
  if (state.snap) {
    const near = kernel.findPointNear(world, 10 / state.view.zoom);
    if (near) { position = { x: near.x, y: near.y }; pointId = near.id; source = 'vertex'; }
    else { position = { x: Math.round(world.x / grid) * grid, y: Math.round(world.y / grid) * grid }; source = 'grid'; }
  }
  return { position, pointId, source };
}
function referenceFromSnap(snap) { return snap.pointId || snap.position; }
function toolPointerDown(world, event) {
  const snap = snapped(world); const point = snap.position;
  if (state.tool === 'select') { selectAt(world, event.shiftKey); return; }
  if (state.tool === 'move' || state.tool === 'scale') { beginTransform(world, event.shiftKey); return; }
  if (state.tool === 'trim') { trimAt(world); return; }
  if (state.tool === 'line') {
    if (!state.phase) { state.phase = { ref: referenceFromSnap(snap), position: point }; setStatus('Line: choose endpoint'); }
    else {
      const entity = commit('Add line', () => kernel.addLine(state.phase.ref, referenceFromSnap(snap)));
      if (entity) state.phase = { ref: entity.b, position: point };
    }
  }
  if (state.tool === 'polyline') {
    if (!state.phase) { state.phase = { refs: [referenceFromSnap(snap)], points: [point] }; setStatus('Polyline: choose next vertex'); }
    else {
      const first = state.phase.refs[0]; const closing = snap.pointId && typeof first === 'string' && snap.pointId === first && state.phase.refs.length >= 3;
      if (closing) { commit('Close polyline', () => kernel.addLine(state.phase.refs.at(-1), first)); state.phase = null; setStatus('Closed polyline'); }
      else { const entity = commit('Add polyline segment', () => kernel.addLine(state.phase.refs.at(-1), referenceFromSnap(snap))); if (entity) { state.phase.refs.push(entity.b); state.phase.points.push(point); } }
    }
  }
  if (state.tool === 'rectangle') {
    if (!state.phase) { state.phase = { ref: referenceFromSnap(snap), position: point }; setStatus('Rectangle: choose opposite corner'); }
    else { commit('Add rectangle', () => kernel.addRectangle(state.phase.ref, referenceFromSnap(snap))); state.phase = null; }
  }
  if (state.tool === 'circle') {
    if (!state.phase) { state.phase = { ref: referenceFromSnap(snap), position: point }; setStatus('Circle: choose radius'); }
    else { const radius = Geometry.dist(state.phase.position, point); if (radius > 1e-8) commit('Add circle', () => kernel.addCircle(state.phase.ref, radius)); state.phase = null; }
  }
  if (state.tool === 'arc') {
    if (!state.phase) { state.phase = { step: 'centre', ref: referenceFromSnap(snap), center: point }; setStatus('Arc: choose start point'); }
    else if (state.phase.step === 'centre') { const radius = Geometry.dist(state.phase.center, point); if (radius > 1e-8) { state.phase = { ...state.phase, step: 'end', radius, startAngle: Geometry.angle(Geometry.sub(point, state.phase.center)) }; setStatus('Arc: choose end point'); } }
    else { const end = Geometry.angle(Geometry.sub(point, state.phase.center)); commit('Add arc', () => kernel.addArc(state.phase.ref, state.phase.radius, state.phase.startAngle, end)); state.phase = null; }
  }
  render();
}
function previewFor(world) {
  const point = snapped(world).position;
  if (state.tool === 'line' && state.phase) return { type: 'line', a: state.phase.position, b: point };
  if (state.tool === 'polyline' && state.phase) return { type: 'polyline', points: [...state.phase.points, point] };
  if (state.tool === 'rectangle' && state.phase) return { type: 'rectangle', a: state.phase.position, b: point };
  if (state.tool === 'circle' && state.phase) return { type: 'circle', center: state.phase.position, radius: Geometry.dist(state.phase.position, point) };
  if (state.tool === 'arc' && state.phase?.step === 'centre') return { type: 'line', a: state.phase.center, b: point };
  if (state.tool === 'arc' && state.phase?.step === 'end') return { type: 'arc', center: state.phase.center, radius: state.phase.radius, startAngle: state.phase.startAngle, endAngle: Geometry.angle(Geometry.sub(point, state.phase.center)), clockwise: false };
  return null;
}
function selectAt(world, additive = false) {
  const hit = kernel.nearest(world, 9 / state.view.zoom);
  if (!hit) { if (!additive) clearSelection(); render(); return; }
  if (hit.kind === 'point') selectPoint(hit.id, additive); else selectEntity(hit.id, additive);
}
function bestLineAt(world) {
  const candidates = kernel.entities.filter(e => e.type === 'line').map(entity => {
    const [a, b] = kernel.endpoints(entity); const ab = Geometry.sub(b, a); const t = Math.max(0, Math.min(1, Geometry.dot(Geometry.sub(world, a), ab) / Geometry.dot(ab, ab)));
    return { entity, point: Geometry.add(a, Geometry.mul(ab, t)), distance: Geometry.dist(world, Geometry.add(a, Geometry.mul(ab, t))) };
  }).sort((a, b) => a.distance - b.distance);
  return candidates[0]?.distance <= 12 / state.view.zoom ? candidates[0] : null;
}
function trimAt(world) {
  const line = bestLineAt(world); if (!line) return showError(new KernelError('Click a line segment to trim.'));
  commit('Trim line', () => kernel.trimLine(line.entity.id, world));
}
function beginTransform(world, additive) {
  if (!state.selection.entities.size && !state.selection.points.size) selectAt(world, additive);
  if (!state.selection.entities.size && !state.selection.points.size) return showError(new KernelError('Select geometry before transforming.'));
  const pivot = selectionPivot() || [...state.selection.points].map(id => kernel.point(id))[0];
  state.drag = { type: state.tool, base: kernel.snapshot(), start: world, pivot, entityIds: selectionEntityIds(), pointIds: [...state.selection.points], changed: false };
  setStatus(`${state.tool === 'move' ? 'Moving' : 'Scaling'} — release to commit`);
}
function updateTransform(world) {
  const drag = state.drag; if (!drag || !['move', 'scale'].includes(drag.type)) return;
  try {
    kernel.restore(drag.base);
    if (drag.type === 'move') {
      const dx = world.x - drag.start.x, dy = world.y - drag.start.y;
      if (drag.pointIds.length) drag.pointIds.forEach(id => { const p = kernel.point(id); kernel.movePoint(id, { x: p.x + dx, y: p.y + dy }, false); });
      else kernel.translateEntities(drag.entityIds, dx, dy);
      drag.changed = Math.abs(dx) > 1e-8 || Math.abs(dy) > 1e-8;
    } else {
      const initial = Geometry.dist(drag.start, drag.pivot); const current = Geometry.dist(world, drag.pivot); const scale = initial < 1e-8 ? 1 : Math.max(.02, current / initial);
      if (drag.entityIds.length) kernel.scaleEntities(drag.entityIds, drag.pivot, scale);
      drag.changed = Math.abs(scale - 1) > 1e-6;
    }
    render();
  } catch (error) { kernel.restore(drag.base); showError(error); state.drag = null; }
}
function endTransform() {
  const drag = state.drag; if (!drag) return;
  if (['move', 'scale'].includes(drag.type) && drag.changed) { historySnapshot(drag.type === 'move' ? 'Move geometry' : 'Scale geometry', drag.base); persist(); setStatus(drag.type === 'move' ? 'Moved geometry' : 'Scaled geometry'); }
  state.drag = null; render();
}

function deleteSelection() {
  const entityIds = selectionEntityIds(), pointIds = [...state.selection.points]; if (!entityIds.length && !pointIds.length) return;
  commit('Delete geometry', () => { if (entityIds.length) kernel.deleteEntities(entityIds); if (pointIds.length) kernel.deletePoints(pointIds); clearSelection(); });
}
function askNumber(label, defaultValue, min = -Infinity) {
  const value = prompt(label, Number(defaultValue).toString()); if (value === null) return null;
  const number = Number(value); if (!Number.isFinite(number) || number <= min) { showError(new KernelError(`${label} must be greater than ${min}.`)); return null; } return number;
}
function offsetSelected(value = null) {
  const entity = selectedSingleEntity(); if (!entity) return showError(new KernelError('Select one line or circle to offset.'));
  const amount = value ?? askNumber('Offset distance (mm; negative offsets to the other side)', 5, -Infinity); if (amount === null || Math.abs(amount) < 1e-8) return;
  const result = commit('Offset curve', () => kernel.offsetEntity(entity.id, amount)); if (result) { clearSelection(); state.selection.entities.add(result.id); render(); }
}
function filletSelected(value = null) {
  const ids = selectionEntityIds(); if (ids.length !== 2) return showError(new KernelError('Select two line segments to fillet.'));
  const radius = value ?? askNumber('Fillet radius (mm)', 3, 0); if (radius === null) return;
  const result = commit('Fillet corner', () => kernel.fillet(ids[0], ids[1], radius)); if (result) { clearSelection(); state.selection.entities.add(result.id); render(); }
}
function chamferSelected(value = null) {
  const ids = selectionEntityIds(); if (ids.length !== 2) return showError(new KernelError('Select two line segments to chamfer.'));
  const setback = value ?? askNumber('Chamfer setback (mm)', 3, 0); if (setback === null) return;
  const result = commit('Chamfer corner', () => kernel.chamfer(ids[0], ids[1], setback)); if (result) { clearSelection(); state.selection.entities.add(result.id); render(); }
}
function mirrorSelected() {
  const ids = selectionEntityIds(); if (!ids.length) return showError(new KernelError('Select curves to mirror.'));
  const degrees = askNumber('Mirror axis angle (degrees; 0 is horizontal)', 90, -Infinity); if (degrees === null) return;
  const pivot = selectionPivot(); const rad = degrees * Math.PI / 180;
  const result = commit('Mirror geometry', () => kernel.mirrorEntities(ids, { x: pivot.x - Math.cos(rad) * 100, y: pivot.y - Math.sin(rad) * 100 }, { x: pivot.x + Math.cos(rad) * 100, y: pivot.y + Math.sin(rad) * 100 }));
  if (result) { clearSelection(); result.forEach(e => state.selection.entities.add(e.id)); render(); }
}
function toggleGrid() { state.grid = !state.grid; $('[data-view="grid"]').classList.toggle('on', state.grid); draw(); }
function toggleSnap() { state.snap = !state.snap; $('[data-view="snap"]').classList.toggle('on', state.snap); setStatus(`Snap ${state.snap ? 'on' : 'off'}`); draw(); }
function fitView() {
  const box = kernel.bounds(); const rect = canvas.getBoundingClientRect();
  if (!box) { state.view.center = { x: 0, y: 0 }; state.view.zoom = 12; draw(); return; }
  const width = Math.max(box.maxX - box.minX, 10), height = Math.max(box.maxY - box.minY, 10);
  state.view.center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }; state.view.zoom = Math.max(.05, Math.min((rect.width - 150) / width, (rect.height - 100) / height));
  setStatus('Fit geometry'); draw();
}

function exportSketch() {
  const blob = new Blob([kernel.toJSON(true)], { type: 'application/json' }); downloadBlob(blob, `${safeName(kernel.sketch.name)}.frontier-sketch.json`); setStatus('Exported Frontier sketch');
}
function exportDXF() {
  const parts = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const e of kernel.entities) {
    if (e.type === 'line') { const [a, b] = kernel.endpoints(e); parts.push('0', 'LINE', '8', e.layer || 'Geometry', '10', String(a.x), '20', String(a.y), '30', '0', '11', String(b.x), '21', String(b.y), '31', '0'); }
    else if (e.type === 'circle') { const c = kernel.point(e.center); parts.push('0', 'CIRCLE', '8', e.layer || 'Geometry', '10', String(c.x), '20', String(c.y), '30', '0', '40', String(e.radius)); }
    else if (e.type === 'arc') { const c = kernel.point(e.center); const start = e.clockwise ? e.endAngle : e.startAngle, end = e.clockwise ? e.startAngle : e.endAngle; parts.push('0', 'ARC', '8', e.layer || 'Geometry', '10', String(c.x), '20', String(c.y), '30', '0', '40', String(e.radius), '50', String(start * 180 / Math.PI), '51', String(end * 180 / Math.PI)); }
  }
  parts.push('0', 'ENDSEC', '0', 'EOF'); downloadBlob(new Blob([parts.join('\n')], { type: 'application/dxf' }), `${safeName(kernel.sketch.name)}.dxf`); setStatus('Exported DXF curves');
}
function safeName(name) { return (name || 'frontier-sketch').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'frontier-sketch'; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 100); }
function importText(text, fileName = 'Imported sketch') {
  let imported;
  try { imported = text.trim().startsWith('{') ? SketchKernel.fromJSON(text) : importDXF(text, fileName); } catch (error) { showError(error); return; }
  const before = kernel.snapshot(); kernel = imported; clearSelection(); state.undo.push({ label: 'Import document', sketch: before }); state.redo = []; fitView(); persist(); setStatus(`Imported ${kernel.entities.length} analytical curves`); render();
}
function importDXF(text, fileName) {
  const values = text.replace(/\r/g, '').split('\n'); const pairs = [];
  for (let i = 0; i + 1 < values.length; i += 2) pairs.push([values[i].trim(), values[i + 1].trim()]);
  const sketch = new SketchKernel(); sketch.sketch.name = fileName.replace(/\.[^.]+$/, '') || 'Imported DXF'; let type = null, fields = {};
  const flush = () => {
    if (!type) return;
    const num = code => Number(fields[code]);
    try {
      if (type === 'LINE' && [10, 20, 11, 21].every(code => Number.isFinite(num(code)))) sketch.addLine({ x: num(10), y: num(20) }, { x: num(11), y: num(21) }, { layer: fields[8] || 'Geometry' });
      if (type === 'CIRCLE' && [10, 20, 40].every(code => Number.isFinite(num(code)))) sketch.addCircle({ x: num(10), y: num(20) }, num(40), { layer: fields[8] || 'Geometry' });
      if (type === 'ARC' && [10, 20, 40, 50, 51].every(code => Number.isFinite(num(code)))) sketch.addArc({ x: num(10), y: num(20) }, num(40), num(50) * Math.PI / 180, num(51) * Math.PI / 180, false, { layer: fields[8] || 'Geometry' });
    } catch (_) { /* ignore malformed individual DXF entities */ }
  };
  for (const [code, value] of pairs) { if (code === '0') { flush(); type = value; fields = {}; } else if (type) fields[code] = value; }
  flush(); if (!sketch.entities.length) throw new KernelError('The DXF contains no supported LINE, CIRCLE, or ARC entities.'); return sketch;
}

function runCommand(raw) {
  const tokens = raw.trim().split(/\s+/); if (!tokens[0]) return; const command = tokens.shift().toLowerCase(); const nums = tokens.map(Number);
  const geometry = tokens.length && nums.every(Number.isFinite);
  if (command === 'line' && geometry && nums.length === 4) return commit('Add line', () => kernel.addLine({ x: nums[0], y: nums[1] }, { x: nums[2], y: nums[3] }));
  if ((command === 'circle' || command === 'c') && geometry && nums.length === 3) return commit('Add circle', () => kernel.addCircle({ x: nums[0], y: nums[1] }, nums[2]));
  if ((command === 'rect' || command === 'rectangle') && geometry && nums.length === 4) return commit('Add rectangle', () => kernel.addRectangle({ x: nums[0], y: nums[1] }, { x: nums[2], y: nums[3] }));
  if (['select', 'line', 'polyline', 'rectangle', 'rect', 'circle', 'arc', 'move', 'scale', 'trim'].includes(command)) return setTool(command === 'rect' ? 'rectangle' : command);
  if (command === 'fit') return fitView(); if (command === 'grid') return toggleGrid(); if (command === 'snap') return toggleSnap(); if (command === 'delete') return deleteSelection(); if (command === 'undo') return undo(); if (command === 'redo') return redo();
  if (command === 'offset') return offsetSelected(Number.isFinite(nums[0]) ? nums[0] : null); if (command === 'fillet') return filletSelected(Number.isFinite(nums[0]) ? nums[0] : null); if (command === 'chamfer') return chamferSelected(Number.isFinite(nums[0]) ? nums[0] : null); if (command === 'mirror') return mirrorSelected();
  if (command === 'export') return exportSketch(); if (command === 'dxf') return exportDXF(); if (command === 'new') return newDocument();
  showError(new KernelError(`Unknown command “${command}”.`));
}
function newDocument() {
  if (kernel.entities.length && !confirm('Start a new sketch? The current sketch remains in your browser history until this page is closed.')) return;
  const before = kernel.snapshot(); kernel = new SketchKernel(); clearSelection(); state.undo.push({ label: 'New document', sketch: before }); state.redo = []; state.view = { center: { x: 0, y: 0 }, zoom: 12 }; persist(); setStatus('New sketch'); render();
}

canvas.addEventListener('pointerdown', event => {
  canvas.focus?.(); const screen = eventPoint(event); const world = screenToWorld(screen);
  if (event.button === 1 || event.button === 2 || event.altKey || event.spaceKey) { event.preventDefault(); state.drag = { type: 'pan', start: screen, center: { ...state.view.center } }; canvas.setPointerCapture(event.pointerId); return; }
  if (event.button !== 0) return; canvas.setPointerCapture(event.pointerId); toolPointerDown(world, event);
});
canvas.addEventListener('pointermove', event => {
  const screen = eventPoint(event); const world = screenToWorld(screen); state.cursor = world;
  $('#cursorX').textContent = `X ${format(world.x)}`; $('#cursorY').textContent = `Y ${format(world.y)}`; $('#snapReadout').textContent = `${state.snap ? 'Snap' : 'Grid'} ${format(gridStep(), 3)} mm`;
  if (state.drag?.type === 'pan') { state.view.center = { x: state.drag.center.x - (screen.x - state.drag.start.x) / state.view.zoom, y: state.drag.center.y + (screen.y - state.drag.start.y) / state.view.zoom }; draw(); return; }
  if (state.drag && ['move', 'scale'].includes(state.drag.type)) { updateTransform(world); return; }
  const snap = snapped(world); const hit = kernel.nearest(world, 9 / state.view.zoom); state.hover = hit ? { ...hit, snapPoint: snap.source === 'vertex' ? snap.position : null } : (snap.source === 'vertex' ? { snapPoint: snap.position } : null);
  state.preview = previewFor(world); draw();
});
canvas.addEventListener('pointerup', event => { if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId); if (state.drag?.type === 'pan') state.drag = null; else endTransform(); });
canvas.addEventListener('wheel', event => {
  event.preventDefault(); const before = screenToWorld(eventPoint(event)); const factor = Math.exp(-event.deltaY * .0012); state.view.zoom = Math.max(.03, Math.min(300, state.view.zoom * factor)); const after = screenToWorld(eventPoint(event)); state.view.center.x += before.x - after.x; state.view.center.y += before.y - after.y; draw();
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());

window.addEventListener('keydown', event => {
  const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName); if (inField) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelection(); return; }
  if (key === 'escape') { state.phase = null; state.preview = null; state.drag = null; if (state.tool !== 'select') setTool('select'); else { clearSelection(); render(); } return; }
  if (key === 'enter' && state.tool === 'polyline' && state.phase) { state.phase = null; state.preview = null; setStatus('Finished polyline'); render(); return; }
  if (key === 'f') return fitView(); if (key === 'g') return toggleGrid(); if (key === 'o') return offsetSelected();
  if (key === 'b') return chamferSelected(); if (key === 'q') return filletSelected();
  const keyTools = { v: 'select', l: 'line', p: 'polyline', r: 'rectangle', c: 'circle', a: 'arc', m: 'move', s: 'scale', t: 'trim' }; if (keyTools[key]) { event.preventDefault(); setTool(keyTools[key]); }
});

$('[data-view="fit"]').onclick = fitView; $('[data-view="grid"]').onclick = toggleGrid; $('[data-view="snap"]').onclick = toggleSnap;
$$('#floatingToolbar [data-tool]').forEach(button => button.onclick = () => setTool(button.dataset.tool));
$('[data-action="offset"]').onclick = () => offsetSelected(); $('[data-action="fillet"]').onclick = () => filletSelected(); $('[data-action="chamfer"]').onclick = () => chamferSelected(); $('[data-action="mirror"]').onclick = mirrorSelected;
$('#undo').onclick = undo; $('#redo').onclick = redo; $('#newDocument').onclick = newDocument; $('#exportDocument').onclick = exportSketch;
$('#importDocument').onclick = () => $('#fileInput').click(); $('#fileInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => importText(reader.result, file.name); reader.readAsText(file); event.target.value = ''; });
$('#newLayer').onclick = () => setStatus('Layers are retained as entity metadata; type a layer-aware DXF to import layers.'); $('#search').addEventListener('input', renderTree);
$('#commandForm').addEventListener('submit', event => { event.preventDefault(); const input = $('#commandInput'); runCommand(input.value); input.value = ''; });
$('#helpButton').onclick = () => $('#helpDialog').showModal(); $('#helpDialog .close-dialog').onclick = () => $('#helpDialog').close();
window.addEventListener('resize', () => { draw(); });

function render() { updateHistoryButtons(); renderTree(); renderInspector(); draw(); }
function restoreAutosave() {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (!saved) return; const candidate = SketchKernel.fromJSON(saved); if (candidate.entities.length) { kernel = candidate; setStatus('Restored local sketch'); requestAnimationFrame(fitView); } } catch (_) { /* invalid saved documents must never prevent startup */ }
}
restoreAutosave();
setTool('select');
render();
