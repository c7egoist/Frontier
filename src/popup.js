/* ════════════════════════════════════════════════════════════════════════════════════════════
   FLOATING SETTINGS POPUPS
   Opened from a billboard, tethered to it, and made of exactly the same property sheet the dock
   uses. Unpinned popups track their billboard as the camera moves; pinned ones stay put. Several
   can be open at once so two entities can be tuned against each other.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { typeOf, isIsolated } from './world.js';
import { buildSheet } from './inspector.js';
import { el, beginRename } from './kit.js';
import { bus } from './bus.js';
import { ic } from './icons.js';

export function createPopups(host, app, getBounds = () => ({ left: 8, top: 8, right: innerWidth - 8, bottom: innerHeight - 8 })) {
  const open = new Map(); // node.id → record

  function close(id) {
    const rec = open.get(id);
    if (!rec) return;
    rec.elm.classList.add('closing');
    rec.sheet._dispose && rec.sheet._dispose();
    rec.tether.remove();
    setTimeout(() => rec.elm.remove(), 160);
    open.delete(id);
  }
  const closeAll = () => [...open.keys()].forEach(close);

  function toggle(node) {
    if (open.has(node.id)) { close(node.id); return null; }
    return openFor(node);
  }

  function openFor(node) {
    if (open.has(node.id)) { flash(open.get(node.id)); return open.get(node.id); }
    const t = typeOf(node);
    const elm = el('div', 'pop');
    const tether = el('div');
    tether.style.cssText = 'position:absolute;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.45),rgba(255,255,255,.12));transform-origin:0 50%;pointer-events:none;z-index:-1;';
    host.appendChild(tether);

    const head = el('div', 'pop-head',
      `<div class="glyph">${ic(t.icon, { size: 14, color: t.color })}</div>
       <div style="min-width:0;flex:1">
         <div class="t"></div><div class="s">${t.label}</div>
       </div>`);
    const titleEl = head.querySelector('.t');
    titleEl.textContent = node.name;
    titleEl.title = 'Double click to rename';
    titleEl.style.cursor = 'text';
    titleEl.ondblclick = () => beginRename(node, titleEl, () => { titleEl.textContent = node.name; app.refreshChrome(); });
    const visBtn = el('button', 'iconbtn ghost', ic(node.vis ? 'eye' : 'eyeoff', { size: 12 }));
    visBtn.title = 'Visibility  (H)';
    visBtn.onclick = () => {
      node.vis = !node.vis;
      visBtn.innerHTML = ic(node.vis ? 'eye' : 'eyeoff', { size: 12 });
      visBtn.classList.toggle('on', !node.vis);
      bus.emit('treechange');
    };
    const pinBtn = el('button', 'iconbtn ghost', ic('pin', { size: 12 }));
    pinBtn.title = 'Pin in place';
    const focusBtn = el('button', 'iconbtn ghost', ic('focus', { size: 12 }));
    focusBtn.title = 'Frame in viewport  (F)';
    const closeBtn = el('button', 'iconbtn ghost', ic('close', { size: 12 }));
    closeBtn.title = 'Close  (Esc)';
    head.append(visBtn, focusBtn, pinBtn, closeBtn);

    const body = el('div', 'pop-body');
    const sheet = buildSheet(node, { compact: true, onDirty: () => { head.querySelector('.t').textContent = node.name; app.refreshChrome(); } });
    body.appendChild(sheet);

    const foot = el('div', 'pop-foot');
    const inspectBtn = el('button', 'btn sm ghost', `${ic('panelR', { size: 12 })} Inspector`);
    inspectBtn.onclick = () => { app.select(node.id); app.showInspector(); };
    const isoBtn = el('button', 'btn sm ghost', `${ic('solo', { size: 12 })} Isolate`);
    const paintIso = () => {
      isoBtn.classList.toggle('on', isIsolated(node));
      isoBtn.lastChild.textContent = isIsolated(node) ? ' Leave' : ' Isolate';
    };
    isoBtn.onclick = () => { app.toggleIsolateNode(node); paintIso(); };
    paintIso();
    foot.append(inspectBtn, isoBtn);

    elm.append(head, body, foot);
    host.appendChild(elm);

    const rec = { node, elm, tether, sheet, pinned: false, detached: false, pos: { x: 0, y: 0 } };
    open.set(node.id, rec);

    closeBtn.onclick = () => close(node.id);
    focusBtn.onclick = () => app.focus(node);
    pinBtn.onclick = () => {
      rec.pinned = !rec.pinned;
      rec.detached = rec.detached || rec.pinned;
      pinBtn.classList.toggle('on', rec.pinned);
      tether.style.display = rec.pinned ? 'none' : '';
    };

    /* drag by the header */
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      head.classList.add('grabbing');
      head.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, px: rec.pos.x, py: rec.pos.y };
      rec.detached = true;
      const mv = ev => {
        rec.pos.x = start.px + (ev.clientX - start.x);
        rec.pos.y = start.py + (ev.clientY - start.y);
        place(rec);
      };
      const up = () => { head.classList.remove('grabbing'); head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });

    elm.addEventListener('pointerdown', () => {
      [...open.values()].forEach(r => r.elm.style.zIndex = '1');
      elm.style.zIndex = '2';
    });

    return rec;
  }

  const flash = rec => { rec.elm.style.animation = 'none'; void rec.elm.offsetWidth; rec.elm.style.animation = 'popIn .22s var(--ease)'; };

  /* popups live over the viewport, never over the docks — they are clamped to the stage rect */
  function place(rec) {
    const b = getBounds();
    const w = rec.elm.offsetWidth || 318, h = rec.elm.offsetHeight || 320;
    const x = Math.min(Math.max(rec.pos.x, b.left + 10), Math.max(b.right - w - 10, b.left + 10));
    const y = Math.min(Math.max(rec.pos.y, b.top + 10), Math.max(b.bottom - h - 10, b.top + 10));
    rec.elm.style.left = x + 'px';
    rec.elm.style.top = y + 'px';
    return { x, y, w, h };
  }

  /* called every frame — unpinned popups ride along with their billboard */
  function update(billboards) {
    open.forEach(rec => {
      const bb = billboards.screenPos(rec.node.id);
      if (!rec.detached) {
        const b = getBounds();
        const w = rec.elm.offsetWidth || 318;
        if (bb) {
          /* flip to the other side of the marker when the right edge is close */
          const right = bb.x + 46;
          rec.pos.x = (right + w + 12 > b.right) ? bb.x - w - 16 : right;
          rec.pos.y = bb.y - 14;
        } else if (!rec.pinned) { rec.pos.x = b.right - w - 20; rec.pos.y = b.top + 70; }
      }
      const r = place(rec);
      if (bb && !rec.pinned) {
        const ax = bb.x + bb.w / 2, ay = bb.y + bb.h / 2;
        const edge = r.x > ax ? r.x : r.x + r.w;
        const dx = edge - ax, dy = r.y + 22 - ay;
        const len = Math.hypot(dx, dy);
        rec.tether.style.display = len > 8 && len < 900 ? 'block' : 'none';
        rec.tether.style.left = ax + 'px';
        rec.tether.style.top = ay + 'px';
        rec.tether.style.width = len + 'px';
        rec.tether.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      } else {
        rec.tether.style.display = 'none';
      }
    });
  }

  return { openFor, toggle, close, closeAll, update, has: id => open.has(id), count: () => open.size };
}
