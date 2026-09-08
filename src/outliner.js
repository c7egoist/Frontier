/* ════════════════════════════════════════════════════════════════════════════════════════════
   OUTLINER
   Search, type filters, animated twirls, multi-select, solo/lock/visibility, inline rename and
   drag-to-reparent. A node survives the filter if it matches OR one of its descendants does, so
   searching never collapses the tree into an unreadable flat list.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { scene, flat, reflatten, TYPES, typeOf, isFolder, effectiveVis } from './world.js';
import { ic } from './icons.js';
import { el, dropdown, beginRename } from './kit.js';
import { bus } from './bus.js';

export function createOutliner(host, app) {
  let query = '';
  const filters = new Set();

  /* chrome ------------------------------------------------------------------------------- */
  host.innerHTML = `
    <div class="panel-header">
      <div class="ph-icon">${ic('layers', { size: 15 })}</div>
      <div><div class="ph-title">Outliner</div><div class="ph-sub" id="olSub"></div></div>
      <div class="spacer"></div>
      <button class="iconbtn ghost" id="olExpand" title="Expand all">${ic('plus', { size: 13 })}</button>
      <button class="iconbtn ghost" id="olCollapse" title="Collapse all">${ic('chevdown', { size: 13 })}</button>
    </div>
    <div class="search-row">
      <div class="field">
        <span class="ic">${ic('search', { size: 13 })}</span>
        <input id="olSearch" type="text" placeholder="Search world…" autocomplete="off" spellcheck="false">
        <button class="clr" id="olClear" title="Clear" style="display:none">✕</button>
      </div>
      <div id="olFilter"></div>
    </div>
    <div class="filter-row" id="olChips"></div>
    <div class="tree" id="olTree"></div>
    <div class="panel-footer"><span id="olFoot">—</span><div class="spacer"></div><span id="olHits"></span></div>`;

  const treeEl = host.querySelector('#olTree');
  const subEl = host.querySelector('#olSub');
  const chipRow = host.querySelector('#olChips');
  const searchEl = host.querySelector('#olSearch');
  const clearEl = host.querySelector('#olClear');

  const FILTER_TYPES = Object.keys(TYPES).filter(k => k !== 'folder').map(k => TYPES[k].label);
  const filterDD = dropdown(['All types', ...FILTER_TYPES], 'All types', label => {
    if (label === 'All types') filters.clear();
    else filters.has(label) ? filters.delete(label) : filters.add(label);
    filterDD._set(filters.size === 0 ? 'All types' : filters.size === 1 ? [...filters][0] : `${filters.size} types`);
    render();
  }, { width: 118 });
  host.querySelector('#olFilter').appendChild(filterDD);

  searchEl.addEventListener('input', () => { query = searchEl.value.trim().toLowerCase(); render(); });
  searchEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { searchEl.value = ''; query = ''; render(); }
  });
  clearEl.onclick = () => { searchEl.value = ''; query = ''; render(); searchEl.focus(); };
  host.querySelector('#olExpand').onclick = () => { flat.forEach(n => n.open = true); render(); };
  host.querySelector('#olCollapse').onclick = () => { flat.forEach(n => { if (n.depth === 0) n.open = false; }); render(); };

  /* matching ------------------------------------------------------------------------------ */
  const selfMatch = n => {
    const q = !query || n.name.toLowerCase().includes(query) || typeOf(n).label.toLowerCase().includes(query);
    const t = !filters.size || filters.has(typeOf(n).label);
    return q && t;
  };
  const subtreeMatch = n => selfMatch(n) || n.kids.some(subtreeMatch);
  const highlight = name => {
    if (!query) return escapeHtml(name);
    const i = name.toLowerCase().indexOf(query);
    if (i < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, i)) + '<mark>' + escapeHtml(name.slice(i, i + query.length)) + '</mark>' + escapeHtml(name.slice(i + query.length));
  };
  const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* twirl ---------------------------------------------------------------------------------- */
  function toggleBranch(n, row) {
    const kids = row.nextElementSibling;
    if (!kids || !kids.classList.contains('kids')) return;
    const tw = row.querySelector('.tw');
    n.open = !n.open;
    tw.classList.toggle('open', n.open);
    const h = kids.scrollHeight;
    if (n.open) {
      kids.classList.remove('shut'); kids.style.height = h + 'px';
      setTimeout(() => { if (n.open) kids.style.height = 'auto'; }, 270);
    } else {
      kids.style.height = h + 'px';
      requestAnimationFrame(() => { kids.style.height = '0px'; kids.classList.add('shut'); });
    }
  }

  /* drag to re-parent ---------------------------------------------------------------------- */
  let drag = null;
  const indicator = el('div');
  indicator.style.cssText = 'position:fixed;height:2px;background:var(--hi);border-radius:2px;z-index:400;display:none;box-shadow:0 0 8px rgba(108,119,255,.9);pointer-events:none;';
  document.body.appendChild(indicator);
  const ghost = el('div');
  ghost.style.cssText = 'position:fixed;z-index:401;pointer-events:none;display:none;background:rgba(20,20,20,.92);border:1px solid var(--stroke-strong);border-radius:999px;padding:5px 12px;font-size:11.5px;box-shadow:var(--shadow-pop);';
  document.body.appendChild(ghost);

  const isAncestor = (a, b) => { let c = b; while (c) { if (c === a) return true; c = c.parent; } return false; };
  const detach = n => {
    const list = n.parent ? n.parent.kids : scene;
    list.splice(list.indexOf(n), 1);
  };

  function startDrag(node, e) {
    drag = { node, target: null, mode: null };
    ghost.textContent = node.name;
    ghost.style.display = 'block';
    const move = ev => {
      ghost.style.left = (ev.clientX + 12) + 'px';
      ghost.style.top = (ev.clientY + 10) + 'px';
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.row');
      indicator.style.display = 'none';
      treeEl.querySelectorAll('.row').forEach(r => r.style.background = '');
      drag.target = null;
      if (!row || !row.dataset.id) return;
      const target = flat.find(n => n.id === +row.dataset.id);
      if (!target || isAncestor(node, target)) return;
      const r = row.getBoundingClientRect();
      const rel = (ev.clientY - r.top) / r.height;
      const mode = isFolder(target) ? (rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'inside')
        : (rel < 0.5 ? 'before' : 'after');
      drag.target = target; drag.mode = mode;
      if (mode === 'inside') { row.style.background = 'rgba(108,119,255,.18)'; }
      else {
        indicator.style.display = 'block';
        indicator.style.left = r.left + 'px';
        indicator.style.width = r.width + 'px';
        indicator.style.top = (mode === 'before' ? r.top : r.bottom) - 1 + 'px';
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      ghost.style.display = 'none'; indicator.style.display = 'none';
      treeEl.querySelectorAll('.row').forEach(r => r.style.background = '');
      if (drag?.target) {
        const { node: n, target, mode } = drag;
        detach(n);
        if (mode === 'inside') { target.kids.push(n); target.open = true; }
        else {
          const list = target.parent ? target.parent.kids : scene;
          const i = list.indexOf(target);
          list.splice(mode === 'before' ? i : i + 1, 0, n);
        }
        reflatten();
        app.toast(`Moved <b>${n.name}</b>`);
        bus.emit('treechange');
      }
      drag = null;
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    move(e);
  }

  /* render --------------------------------------------------------------------------------- */
  function render() {
    reflatten();
    treeEl.innerHTML = '';
    let shown = 0;

    const build = (list, hostEl) => list.forEach(n => {
      if (!subtreeMatch(n)) return;
      shown++;
      const t = typeOf(n);
      const row = el('div', 'row');
      row.dataset.id = n.id;
      if (app.selection.has(n.id)) row.classList.add('sel');
      if (app.cursorId === n.id) row.classList.add('cursor');
      if (!n.vis || !effectiveVis(n)) row.classList.add('hidden-node');
      if (n.locked) row.classList.add('locked');
      row.style.paddingLeft = (7 + n.depth * 15) + 'px';
      const leaf = !n.kids.length;
      const open = query || filters.size ? true : n.open;
      const tint = isFolder(n) ? (n.props.tint || t.color) : t.color;
      row.innerHTML =
        `<span class="tw ${leaf ? 'leaf' : ''} ${open ? 'open' : ''}">${ic('chev', { size: 12 })}</span>
         <span class="ni">${ic(t.icon, { size: 14, color: tint })}</span>
         <span class="nm">${highlight(n.name)}</span>
         ${isFolder(n) ? `<span class="badge count">${n.kids.length}</span>` : ''}
         ${n.dynamic ? '<span class="badge dyn">dyn</span>' : ''}
         <button class="st ${n.solo ? 'solo' : ''}" data-a="solo" title="Isolate  (I)">${ic('solo', { size: 12 })}</button>
         ${isFolder(n) ? '' : `<button class="st ${n.locked ? 'act' : ''}" data-a="lock" title="Lock">${ic(n.locked ? 'lock' : 'unlock', { size: 12 })}</button>`}
         <button class="st ${n.vis ? '' : 'off'}" data-a="vis" title="Visibility">${ic(n.vis ? 'eye' : 'eyeoff', { size: 12 })}</button>`;

      if (!leaf) row.querySelector('.tw').onclick = e => { e.stopPropagation(); toggleBranch(n, row); };
      row.querySelectorAll('.st').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const a = b.dataset.a;
        if (a === 'vis') n.vis = !n.vis;
        if (a === 'lock') n.locked = !n.locked;
        if (a === 'solo') { app.toggleIsolateNode(n); return; }
        bus.emit('treechange');
      });
      row.onclick = e => app.select(n.id, { additive: e.ctrlKey || e.metaKey, range: e.shiftKey });
      row.ondblclick = e => {
        e.stopPropagation();
        if (isFolder(n)) { toggleBranch(n, row); return; }
        app.focus(n);
      };
      row.oncontextmenu = e => { e.preventDefault(); app.contextMenu(n, e); };
      row.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.st') || e.target.closest('.tw')) return;
        const x0 = e.clientX, y0 = e.clientY;
        const watch = ev => {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
            removeEventListener('pointermove', watch); removeEventListener('pointerup', stop);
            startDrag(n, ev);
          }
        };
        const stop = () => { removeEventListener('pointermove', watch); removeEventListener('pointerup', stop); };
        addEventListener('pointermove', watch); addEventListener('pointerup', stop);
      });
      /* F2 / slow second click renames in place */
      row.querySelector('.nm').addEventListener('dblclick', e => {
        e.stopPropagation();
        beginRename(n, row.querySelector('.nm'), () => { bus.emit('treechange'); });
      });

      hostEl.appendChild(row);
      if (!leaf) {
        const kids = el('div', 'kids' + (open ? '' : ' shut'));
        if (!open) kids.style.height = '0px';
        hostEl.appendChild(kids);
        build(n.kids, kids);
      }
    });

    build(scene, treeEl);
    if (!shown) treeEl.innerHTML = `<div class="nohits">Nothing matches “${escapeHtml(query)}”</div>`;
    treeEl.querySelectorAll('.kids:not(.shut)').forEach(k => k.style.height = 'auto');

    const total = flat.filter(n => !isFolder(n)).length;
    const hits = flat.filter(n => !isFolder(n) && selfMatch(n)).length;
    subEl.textContent = `${total} entities · ${scene.length} groups`;
    host.querySelector('#olHits').textContent = (query || filters.size) ? `${hits} of ${total}` : '';
    host.querySelector('#olFoot').textContent =
      app.selection.size === 0 ? 'Nothing selected'
        : app.selection.size === 1 ? `${flat.find(n => n.id === [...app.selection][0])?.name ?? ''} selected`
          : `${app.selection.size} selected`;
    clearEl.style.display = query ? 'grid' : 'none';

    chipRow.innerHTML = [...filters].map(t => `<span class="pill">${t}<button class="px" data-t="${t}">✕</button></span>`).join('');
    chipRow.querySelectorAll('.px').forEach(b => b.onclick = () => {
      filters.delete(b.dataset.t);
      filterDD._set(filters.size === 0 ? 'All types' : filters.size === 1 ? [...filters][0] : `${filters.size} types`);
      render();
    });
  }

  function revealNode(node) {
    let p = node.parent;
    while (p) { p.open = true; p = p.parent; }
    render();
    const row = treeEl.querySelector(`.row[data-id="${node.id}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { render, revealNode, get query() { return query; } };
}
