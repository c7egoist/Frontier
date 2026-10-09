// Inspector: properties of the current selection, generated from schemas.

import { el, section, resetSections, rangeRow, toggleRow, selectRow, textRow, buttonRow, infoRow, getPath } from './controls.js';
import { SURFACE_CHOICES, SIDEWALK_CHOICES, MATERIALS } from '../model/materials.js';

const label = (k) => MATERIALS[k]?.label || k;

const ROAD_SCHEMA = [
  { section: 'Layout' },
  { t: 'range', key: 'lanes', label: 'Lanes', min: 1, max: 6, step: 1 },
  { t: 'range', key: 'laneWidth', label: 'Lane width', min: 2.5, max: 4.5, step: 0.05, unit: 'm' },
  { t: 'range', key: 'shoulder', label: 'Shoulder', min: 0, max: 3, step: 0.05, unit: 'm' },
  { t: 'range', key: 'crown', label: 'Crown', min: 0, max: 0.05, step: 0.001, fmt: (v) => `${(Number(v) * 100).toFixed(1)} %` },
  { t: 'toggle', key: 'oneWay', label: 'One-way' },
  { section: 'Kerbs and drainage' },
  { t: 'select', key: 'curb', label: 'Kerb', options: [['none', 'None'], ['low', 'Low (120 mm)'], ['high', 'High (200 mm)']] },
  { t: 'range', key: 'gutter', label: 'Gutter width', min: 0, max: 1.5, step: 0.05, unit: 'm' },
  { t: 'range', key: 'gutterDrop', label: 'Gutter drop', min: 0, max: 0.15, step: 0.005, unit: 'm' },
  { t: 'range', key: 'sidewalk', label: 'Footway', min: 0, max: 4, step: 0.1, unit: 'm' },
  { t: 'select', key: 'drainage.mode', label: 'Drainage', options: [['curbs', 'Kerb and gutter'], ['ditches', 'Ditches'], ['none', 'None']] },
  { t: 'range', key: 'drainage.ditchWidth', label: 'Ditch width', min: 0.4, max: 3, step: 0.05, unit: 'm' },
  { t: 'range', key: 'drainage.ditchDepth', label: 'Ditch depth', min: 0.1, max: 1.5, step: 0.05, unit: 'm' },
  { t: 'range', key: 'drainage.inletSpacing', label: 'Inlet spacing', min: 5, max: 60, step: 1, unit: 'm' },
  { section: 'Paving' },
  { t: 'select', key: 'surface.carriageway', label: 'Carriageway', options: SURFACE_CHOICES.map((k) => [k, label(k)]) },
  { t: 'select', key: 'surface.sidewalk', label: 'Footway', options: SIDEWALK_CHOICES.map((k) => [k, label(k)]) },
  { section: 'Markings' },
  { t: 'select', key: 'markings.centre', label: 'Centre line', options: [['none', 'None'], ['dashed', 'Dashed yellow'], ['solid', 'Solid yellow']] },
  { t: 'toggle', key: 'markings.edges', label: 'Edge lines' },
  { t: 'toggle', key: 'markings.laneLines', label: 'Lane lines' },
  { section: 'Bridges and guardrails' },
  { t: 'select', key: 'bridge.mode', label: 'Bridge', options: [['auto', 'Automatic'], ['on', 'Always'], ['off', 'Never']] },
  { t: 'range', key: 'bridge.threshold', label: 'Bridge above ground', min: 1, max: 8, step: 0.1, unit: 'm' },
  { t: 'range', key: 'bridge.deckThickness', label: 'Deck thickness', min: 0.4, max: 2, step: 0.05, unit: 'm' },
  { t: 'range', key: 'bridge.pierSpacing', label: 'Pier spacing', min: 8, max: 60, step: 1, unit: 'm' },
  { t: 'range', key: 'bridge.parapetHeight', label: 'Parapet height', min: 0, max: 1.5, step: 0.05, unit: 'm' },
  { t: 'select', key: 'guardrail.mode', label: 'Guardrail', options: [['auto', 'Automatic'], ['on', 'Always'], ['off', 'Never']] },
  { t: 'range', key: 'guardrail.embankHeight', label: 'Rail above embankment', min: 1, max: 5, step: 0.1, unit: 'm' },
];

const NODE_SCHEMA = [
  { section: 'Position' },
  { t: 'text', key: 'name', label: 'Name' },
  { t: 'number', key: 'x', label: 'X (east)', step: 0.5 },
  { t: 'number', key: 'y', label: 'Y (height)', step: 0.1 },
  { t: 'number', key: 'z', label: 'Z (south)', step: 0.5 },
  { section: 'Junction' },
  { t: 'range', key: 'radius', label: 'Corner radius', min: 0, max: 20, step: 0.5, unit: 'm' },
  { t: 'range', key: 'steps', label: 'Fillet steps', min: 2, max: 24, step: 1 },
];

const PROJECT_SCHEMA = [
  { section: 'Project' },
  { t: 'text', key: 'name', label: 'Name' },
  { t: 'range', key: 'clearance', label: 'Grade clearance', min: 3, max: 12, step: 0.1, unit: 'm' },
  { section: 'Terrain' },
  { t: 'select', key: 'terrain.mode', label: 'Terrain', options: [['flat', 'Flat'], ['rolling', 'Rolling']] },
  { t: 'range', key: 'terrain.amplitude', label: 'Relief', min: 0, max: 8, step: 0.1, unit: 'm' },
  { t: 'range', key: 'terrain.wavelength', label: 'Wavelength', min: 60, max: 400, step: 5, unit: 'm' },
  { t: 'number', key: 'terrain.seed', label: 'Seed', step: 1 },
  { t: 'number', key: 'terrain.base', label: 'Base height', step: 0.1 },
];

function build(schema, target, project, api) {
  const rows = [];
  for (const f of schema) {
    if (f.section) {
      rows.push(section(f.section));
      continue;
    }
    const val = () => getPath(getTarget(target, project), f.key);
    const set = (v, phase) => api.setField(target, f.key, v, phase);
    let row;
    if (f.t === 'range') {
      row = rangeRow({
        label: f.label,
        value: val() ?? f.min,
        min: f.min,
        max: f.max,
        step: f.step,
        unit: f.unit,
        fmt: f.fmt,
        onInput: (v) => set(v, 'live'),
        onCommit: (phase) => api.phase(phase),
      });
    } else if (f.t === 'toggle') {
      row = toggleRow({ label: f.label, value: !!val(), onChange: (v) => set(v, 'commit') });
    } else if (f.t === 'select') {
      row = selectRow({ label: f.label, value: val() ?? f.options[0][0], options: f.options.map(([v, l]) => ({ value: v, label: l })), onChange: (v) => set(v, 'commit') });
    } else if (f.t === 'number') {
      row = textRow({ label: f.label, value: val(), type: 'number', step: f.step, onChange: (v) => set(Number(v), 'commit') });
    } else if (f.t === 'text') {
      row = textRow({ label: f.label, value: val(), onChange: (v) => set(String(v), 'commit') });
    }
    if (row) {
      row.dataset.field = f.key;
      rows.push(row);
    }
  }
  return rows;
}

function getTarget(target, project) {
  if (target.type === 'project') return project;
  if (target.type === 'node') return project.nodes.find((n) => n.id === target.id) || {};
  if (target.type === 'road') return project.roads.find((r) => r.id === target.id) || {};
  return {};
}

// Render the inspector. Returns { sync() } to refresh values in place.
export function renderInspector(host, { project, net, selection, api }) {
  host.innerHTML = '';
  resetSections();
  if (!selection) {
    const schema = PROJECT_SCHEMA;
    const target = { type: 'project' };
    const rows = build(schema, target, project, api);
    host.append(
      el('div', { class: 'insp-head' }, [el('div', { class: 'insp-kind', text: 'Project' }), el('div', { class: 'insp-title', text: project.name })]),
      ...rows,
      section('Statistics'),
      infoRow('Junctions', String(project.nodes.length)),
      infoRow('Roads', String(project.roads.length)),
      infoRow('Interchanges', String(project.interchanges.length)),
      infoRow('Triangles', net ? net.stats.triangles.toLocaleString() : '-'),
      infoRow('Bridges', net ? String(net.stats.bridges) : '-'),
      section('Hints'),
      el('div', { class: 'hint', text: 'Select a junction or road to edit it. Drag junctions in the plan or with the gizmo in 3D. Double-click a road to add a point.' })
    );
    return syncer(host);
  }
  if (selection.type === 'node') {
    const n = project.nodes.find((x) => x.id === selection.id);
    if (!n) return renderInspector(host, { project, net, selection: null, api });
    const target = { type: 'node', id: n.id };
    const jn = net?.junctions.find((j) => j.id === n.id);
    const arms = jn ? jn.J.arms : [];
    host.append(el('div', { class: 'insp-head' }, [el('div', { class: 'insp-kind teal', text: arms.length >= 3 ? 'Junction' : arms.length === 2 ? 'Bend' : arms.length === 1 ? 'Dead end' : 'Node' }), el('div', { class: 'insp-title', text: n.name })]));
    host.append(...build(NODE_SCHEMA, target, project, api));
    host.append(
      section('Arms'),
      ...arms.map((a) => {
        const r = project.roads.find((x) => x.id === a.roadId);
        return infoRow(r ? r.name : a.roadId, `${a.end === 'from' ? 'leaves' : 'arrives'} · throat ${a.D.toFixed(1)} m · bearing ${((Math.atan2(a.dz, a.dx) * 180) / Math.PI + 360) % 360 | 0}°`);
      }),
      arms.length === 0 ? el('div', { class: 'hint', text: 'No roads meet here yet.' }) : null
    );
    if (jn && jn.warnings.length) host.append(section('Warnings'), ...jn.warnings.map((w) => el('div', { class: 'warn', text: w })));
    host.append(
      section('Actions'),
      buttonRow({
        label: 'Ground',
        buttons: [
          { text: 'Snap to ground', title: 'Set the height to the terrain under the junction', onClick: () => api.command('snapNode', n.id) },
        ],
      }),
      buttonRow({ label: 'Remove', buttons: [{ text: 'Delete junction and roads', danger: true, onClick: () => api.command('deleteNode', n.id) }] })
    );
    return syncer(host);
  }
  if (selection.type === 'road') {
    const r = project.roads.find((x) => x.id === selection.id);
    if (!r) return renderInspector(host, { project, net, selection: null, api });
    const target = { type: 'road', id: r.id };
    const rb = net?.roads.find((x) => x.id === r.id);
    host.append(el('div', { class: 'insp-head' }, [el('div', { class: 'insp-kind amber', text: 'Road' }), el('div', { class: 'insp-title', text: r.name })]));
    host.append(textRow({ label: 'Name', value: r.name, onChange: (v) => api.setField(target, 'name', String(v), 'commit') }));
    host.append(...build(ROAD_SCHEMA, target, project, api));
    host.append(
      section('Geometry'),
      infoRow('Length', rb ? `${rb.L.toFixed(1)} m` : '-'),
      infoRow('Interior points', String(r.points.length)),
      infoRow('Bridge spans', String(rb ? rb.body.runs.bridge.length : 0)),
      infoRow('Piers', String(rb ? rb.body.piers.length : 0)),
      infoRow('Rail runs', String(rb ? rb.body.runs.rail.length : 0))
    );
    if (rb && rb.body.warnings.length) host.append(...rb.body.warnings.map((w) => el('div', { class: 'warn', text: w })));
    host.append(
      section('Actions'),
      buttonRow({
        label: 'Edit',
        buttons: [
          { text: 'Add point at middle', onClick: () => api.command('addMidPoint', r.id) },
          { text: 'Remove last point', disabled: !r.points.length, onClick: () => api.command('removeLastPoint', r.id) },
          { text: 'Split at middle', title: 'Create a junction at the middle of the road', onClick: () => api.command('splitMiddle', r.id) },
        ],
      }),
      buttonRow({ label: 'Remove', buttons: [{ text: 'Delete road', danger: true, onClick: () => api.command('deleteRoad', r.id) }] })
    );
    return syncer(host);
  }
  if (selection.type === 'interchange') {
    const ix = project.interchanges.find((x) => x.id === selection.id);
    if (!ix) return renderInspector(host, { project, net, selection: null, api });
    host.append(el('div', { class: 'insp-head' }, [el('div', { class: 'insp-kind violet', text: 'Interchange' }), el('div', { class: 'insp-title', text: ix.name })]));
    host.append(
      textRow({ label: 'Name', value: ix.name, onChange: (v) => api.command('renameInterchange', ix.id, String(v)) }),
      section('Parts'),
      infoRow('Roads', String(ix.roads.length)),
      infoRow('Junctions', String(ix.nodes.length)),
      infoRow('Ramps', String(ix.roads.filter((id) => /^ramp /i.test((project.roads.find((r) => r.id === id) || {}).name || '')).length)),
      section('Actions'),
      buttonRow({ label: 'Record', buttons: [{ text: 'Forget interchange record', title: 'Keeps all roads and junctions', onClick: () => api.command('forgetInterchange', ix.id) }] })
    );
    return syncer(host);
  }
  return syncer(host);
}

// Returns an object whose sync() re-reads the model into the existing controls.
function syncer(host) {
  return {
    sync(project, selection) {
      const rows = host.querySelectorAll('[data-field]');
      rows.forEach((row) => {
        const target = selection ? (selection.type === 'node' ? { type: 'node', id: selection.id } : selection.type === 'road' ? { type: 'road', id: selection.id } : { type: 'project' }) : { type: 'project' };
        const v = getPath(getTarget(target, project), row.dataset.field);
        if (row._sync && v !== undefined) row._sync(v);
      });
    },
  };
}
