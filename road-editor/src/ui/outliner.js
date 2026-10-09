// Outliner: junctions, roads, interchanges and checks, with click-to-select.

import { el } from './controls.js';

function item(text, dot, active, onClick, sub = '') {
  return el('button', { class: `item ${active ? 'active' : ''}`, onClick, title: text }, [
    el('span', { class: `dot ${dot}` }),
    el('span', { class: 'item-name', text }),
    sub ? el('span', { class: 'item-sub', text: sub }) : null,
  ]);
}

export function renderOutliner(host, { project, net, selection, onSelect }) {
  host.innerHTML = '';
  const deg = new Map();
  for (const r of project.roads) {
    deg.set(r.from, (deg.get(r.from) || 0) + 1);
    deg.set(r.to, (deg.get(r.to) || 0) + 1);
  }
  const junctions = project.nodes.slice().sort((a, b) => a.name.localeCompare(b.name));
  const roads = project.roads;
  const groups = [
    ['Junctions', junctions.length, junctions.map((n) => {
      const d = deg.get(n.id) || 0;
      const sub = d >= 3 ? `${d}-way` : d === 2 ? 'bend' : d === 1 ? 'end' : 'free';
      return item(n.name, 'teal', selection?.type === 'node' && selection.id === n.id, () => onSelect({ type: 'node', id: n.id }), sub);
    })],
    ['Roads', roads.length, roads.map((r) => {
      const rb = net?.roads.find((x) => x.id === r.id);
      const sub = rb ? `${rb.L.toFixed(0)} m` : '';
      return item(r.name, 'amber', selection?.type === 'road' && selection.id === r.id, () => onSelect({ type: 'road', id: r.id }), sub);
    })],
    ['Interchanges', project.interchanges.length, project.interchanges.map((ix) => item(ix.name, 'violet', selection?.type === 'interchange' && selection.id === ix.id, () => onSelect({ type: 'interchange', id: ix.id }), `${ix.roads.length} parts`))],
  ];
  for (const [title, count, items] of groups) {
    host.append(el('div', { class: 'tree-head' }, [el('span', { text: title }), el('span', { class: 'count', text: String(count) })]));
    if (items.length) host.append(el('div', { class: 'tree-body' }, items));
    else host.append(el('div', { class: 'tree-empty', text: `No ${title.toLowerCase()} yet` }));
  }
  const warnings = [...(net?.warnings || [])];
  host.append(el('div', { class: 'tree-head' }, [el('span', { text: 'Checks' }), el('span', { class: `count ${warnings.length ? 'bad' : 'ok'}`, text: warnings.length ? String(warnings.length) : 'clear' })]));
  if (warnings.length) {
    host.append(el('div', { class: 'tree-body checks' }, warnings.slice(0, 12).map((w) => el('div', { class: 'check', text: w }))));
  } else {
    host.append(el('div', { class: 'tree-empty', text: 'No problems found' }));
  }
}
