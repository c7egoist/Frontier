/* ============================================================
   FRONTIER · OUTLINER — core engine (no dependencies)
   Model: flat list of nodes with `level`; collapse hides
   descendants, zoom scopes the view to one subtree.
   ============================================================ */

"use strict";

/* ---------- constants ---------- */

const LS_KEY = "frontier.outliner.v1";
const THEME_KEY = "frontier.theme";
const STEP = 24;      // px per indent level (mirrors .gutter width)
const BASE_X = 20;    // px: bullet center of a level-0 row (8 pad + 12)
const MAX_LEVEL = 12;

/* ---------- state ---------- */

let state = { title: "Untitled", nodes: [], zoomId: null };
let pendingFocus = null; // { id, offset } applied after render

const $ = (sel) => document.querySelector(sel);
const outlineEl = $("#outline");
const crumbsEl = $("#crumbs");
const countsEl = $("#counts");
const titleEl = $("#docTitle");
const collapseBtn = $("#collapseBtn");
const themeBtn = $("#themeBtn");
const shortcutsBtn = $("#shortcutsBtn");
const modalBackdrop = $("#modalBackdrop");
const modalClose = $("#modalClose");

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function mk(text, level) {
  return { id: uid(), text: text || "", level: level || 0, collapsed: false };
}

function defaultNodes() {
  return [
    mk("Welcome to Frontier — a calm place to think", 0),
    mk("Everything here is a bullet — click any line and just type", 1),
    mk("Press Enter for a new bullet, Tab to indent, Shift+Tab to outdent", 1),
    mk("Click a bullet to collapse its children", 1),
    mk("Try it: click the bullet on this line's parent above", 2),
    mk("Double-click a bullet to zoom in, Esc to zoom out", 1),
    mk("Keep it fast", 0),
    mk("Alt + ↑ / ↓ moves a bullet (with its children)", 1),
    mk("Ctrl + / shows every shortcut", 1),
    mk("Make it yours", 0),
    mk("Delete these lines and start thinking", 1),
  ];
}

/* ---------- persistence ---------- */

let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ title: state.title, nodes: state.nodes }));
    } catch (_) { /* storage unavailable — keep running in memory */ }
  }, 150);
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.nodes)) return false;
    state.title = typeof data.title === "string" ? data.title : "Untitled";
    state.nodes = data.nodes.filter(
      (n) => n && typeof n.id === "string" && typeof n.text === "string" && Number.isFinite(n.level)
    ).map((n) => ({ id: n.id, text: n.text, level: Math.max(0, Math.min(MAX_LEVEL, n.level | 0)), collapsed: !!n.collapsed }));
    return state.nodes.length > 0;
  } catch (_) {
    return false;
  }
}

/* ---------- tree queries (flat-list model) ---------- */

function hasChildren(index) {
  const nodes = state.nodes;
  return index + 1 < nodes.length && nodes[index + 1].level > nodes[index].level;
}

/** [start, end] indices of node + all descendants. */
function blockRange(index) {
  const nodes = state.nodes;
  let end = index;
  while (end + 1 < nodes.length && nodes[end + 1].level > nodes[index].level) end++;
  return [index, end];
}

function countDescendants(index) {
  const [s, e] = blockRange(index);
  return e - s;
}

/** Index range + base level for the current zoom scope. */
function zoomRange() {
  const nodes = state.nodes;
  if (!state.zoomId) return [0, nodes.length - 1, 0];
  const z = nodes.findIndex((n) => n.id === state.zoomId);
  if (z < 0) return [0, nodes.length - 1, 0];
  const [, end] = blockRange(z);
  return [z, end, nodes[z].level];
}

/** Visible rows in zoom scope, minus collapsed descendants. */
function visibleRows() {
  const nodes = state.nodes;
  const [zs, ze, base] = zoomRange();
  const rows = [];
  const hidden = []; // stack of collapsed ancestor levels
  for (let i = zs; i <= ze && i < nodes.length; i++) {
    const n = nodes[i];
    while (hidden.length && n.level <= hidden[hidden.length - 1]) hidden.pop();
    if (hidden.length) continue; // a collapsed ancestor hides this row
    rows.push({ node: n, index: i, rel: n.level - base });
    if (n.collapsed) hidden.push(n.level);
  }
  return rows;
}

/** Path of indices from document root down to `index` (inclusive). */
function pathTo(index) {
  const nodes = state.nodes;
  const stack = [];
  for (let i = 0; i <= index; i++) {
    while (stack.length && nodes[stack[stack.length - 1]].level >= nodes[i].level) stack.pop();
    stack.push(i);
  }
  return stack;
}

function parentIndex(index) {
  const nodes = state.nodes;
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i].level < nodes[index].level) return i;
  }
  return -1;
}

function ensureZoomValid() {
  if (state.zoomId && !state.nodes.some((n) => n.id === state.zoomId)) state.zoomId = null;
}

/* ---------- caret ---------- */

function getCaret(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaret(el, offset) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = null, pos = 0;
  while ((n = walker.nextNode())) {
    const len = n.textContent.length;
    if (pos + len >= offset) {
      range.setStart(n, Math.min(offset - pos, len));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    pos += len;
  }
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function rowTextEl(id) {
  return outlineEl.querySelector('[data-id="' + id + '"] .text');
}

function focusRow(id, offset) {
  const el = rowTextEl(id);
  if (!el) return;
  const off = Math.max(0, Math.min(offset == null ? 0 : offset, el.textContent.length));
  setCaret(el, off);
}

/* ---------- render ---------- */

function render() {
  ensureZoomValid();
  const rows = visibleRows();

  outlineEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  rows.forEach((r) => frag.appendChild(createRow(r)));
  outlineEl.appendChild(frag);

  renderCrumbs();
  updateCounts();
  updateCollapseBtn();

  if (pendingFocus) {
    const p = pendingFocus;
    pendingFocus = null;
    focusRow(p.id, p.offset);
  }
}

function createRow({ node, index, rel }) {
  const kids = hasChildren(index);

  const row = document.createElement("div");
  row.className = "node";
  row.dataset.id = node.id;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(rel + 1));
  if (kids) row.setAttribute("aria-expanded", String(!node.collapsed));

  // indent guides for each ancestor level
  for (let d = 0; d < rel; d++) {
    const g = document.createElement("i");
    g.className = "guide";
    g.style.left = BASE_X + d * STEP + "px";
    g.setAttribute("aria-hidden", "true");
    row.appendChild(g);
  }

  const gutter = document.createElement("span");
  gutter.className = "gutter";
  gutter.style.marginLeft = rel * STEP + "px";

  const bullet = document.createElement("button");
  bullet.className = "bullet" + (kids ? " has-children" : "") + (node.collapsed ? " collapsed" : "");
  bullet.type = "button";
  bullet.tabIndex = -1;
  bullet.title = kids ? (node.collapsed ? "Expand" : "Collapse") + " · double-click to zoom" : "Zoom in (double-click)";
  bullet.setAttribute("aria-label", kids ? (node.collapsed ? "Expand" : "Collapse") : "Bullet");
  bullet.innerHTML = '<span class="dot"></span>' +
    '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 1.5L6.5 5l-3 3.5"/></svg>';
  bullet.addEventListener("click", (e) => {
    if (e.detail > 1) return; // handled by dblclick
    if (e.altKey || e.metaKey || e.ctrlKey) { zoomToggle(node.id); return; }
    if (kids) toggleCollapse(index);
    else zoomToggle(node.id);
  });
  bullet.addEventListener("dblclick", (e) => {
    e.preventDefault();
    zoomToggle(node.id);
  });
  gutter.appendChild(bullet);
  row.appendChild(gutter);

  const text = document.createElement("div");
  text.className = "text";
  text.contentEditable = "true";
  text.spellcheck = true;
  text.dataset.placeholder = rel === 0 && state.nodes.length === 1 && !node.text ? "Start typing…" : "Type something";
  text.textContent = node.text;
  text.addEventListener("input", () => onInput(index, text));
  text.addEventListener("keydown", (e) => onKeyDown(e, index, text));
  text.addEventListener("paste", (e) => onPaste(e, index, text));
  text.addEventListener("focus", () => row.classList.add("active"));
  text.addEventListener("blur", () => {
    row.classList.remove("active");
    node.text = text.textContent.replace(/\n+$/, "");
    save();
  });
  row.appendChild(text);

  if (kids && node.collapsed) {
    const badge = document.createElement("span");
    badge.className = "child-count";
    badge.textContent = countDescendants(index);
    badge.title = "Expand";
    badge.addEventListener("click", () => toggleCollapse(index));
    row.appendChild(badge);
  }

  return row;
}

function renderCrumbs() {
  const nodes = state.nodes;
  if (!state.zoomId) { crumbsEl.hidden = true; crumbsEl.innerHTML = ""; return; }
  const z = nodes.findIndex((n) => n.id === state.zoomId);
  if (z < 0) { crumbsEl.hidden = true; crumbsEl.innerHTML = ""; return; }

  crumbsEl.innerHTML = "";
  crumbsEl.hidden = false;

  const root = document.createElement("button");
  root.className = "crumb";
  root.type = "button";
  root.textContent = state.title || "Untitled";
  root.title = "Zoom out to document";
  root.addEventListener("click", () => { state.zoomId = null; render(); });
  crumbsEl.appendChild(root);

  pathTo(z).forEach((idx) => {
    const sep = document.createElement("span");
    sep.className = "crumb-sep";
    sep.textContent = "›";
    crumbsEl.appendChild(sep);

    const c = document.createElement("button");
    c.className = "crumb" + (idx === z ? " current" : "");
    c.type = "button";
    c.textContent = nodes[idx].text || "Untitled";
    if (idx !== z) {
      c.addEventListener("click", () => { state.zoomId = nodes[idx].id; render(); });
    }
    crumbsEl.appendChild(c);
  });
}

let countTimer = null;
function updateCounts() {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    const n = state.nodes.length;
    const words = state.nodes.reduce((acc, node) => {
      const w = node.text.trim().split(/\s+/).filter(Boolean).length;
      return acc + w;
    }, 0);
    countsEl.textContent = n + (n === 1 ? " bullet · " : " bullets · ") + words + (words === 1 ? " word" : " words");
  }, 200);
}

function updateCollapseBtn() {
  const anyOpen = state.nodes.some((n, i) => hasChildren(i) && !n.collapsed);
  collapseBtn.title = anyOpen ? "Collapse all" : "Expand all";
  collapseBtn.setAttribute("aria-label", collapseBtn.title);
}

/* ---------- editing ---------- */

function onInput(index, el) {
  state.nodes[index].text = el.textContent;
  save();
  updateCounts();
}

function onKeyDown(e, index, el) {
  const node = state.nodes[index];
  const mod = e.metaKey || e.ctrlKey;
  const off = getCaret(el);
  const atStart = off === 0;
  const atEnd = off === el.textContent.length;

  // ---- structural shortcuts with modifiers first ----
  if (mod && e.key === "Enter") { e.preventDefault(); zoomToggle(node.id); return; }
  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    moveBlock(index, e.key === "ArrowUp" ? -1 : 1, off);
    return;
  }
  if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    moveBlock(index, e.key === "ArrowUp" ? -1 : 1, off);
    return;
  }
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); setCollapsed(index, true, off); return; }
  if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); setCollapsed(index, false, off); return; }
  if (mod && (e.key === "[" || e.key === "]")) {
    e.preventDefault();
    if (e.key === "[") outdent(index, off); else indent(index, off);
    return;
  }
  if (mod) return; // let copy/paste/select/bold etc. pass through

  switch (e.key) {
    case "Enter":
      e.preventDefault();
      splitNode(index, off);
      break;
    case "Tab":
      e.preventDefault();
      if (e.shiftKey) outdent(index, off); else indent(index, off);
      break;
    case "Backspace":
      if (atStart) { e.preventDefault(); backspaceAtStart(index); }
      break;
    case "Delete":
      if (atEnd) { e.preventDefault(); deleteAtEnd(index, off); }
      break;
    case "ArrowUp":
      e.preventDefault();
      focusSibling(index, -1, off);
      break;
    case "ArrowDown":
      e.preventDefault();
      focusSibling(index, 1, off);
      break;
    case "ArrowLeft":
      if (atStart) { e.preventDefault(); focusSibling(index, -1, Infinity); }
      break;
    case "ArrowRight":
      if (atEnd) { e.preventDefault(); focusSibling(index, 1, 0); }
      break;
    case "Escape":
      if (state.zoomId) zoomOut();
      else el.blur();
      break;
  }
}

function onPaste(e, index, el) {
  e.preventDefault();
  const clip = (e.clipboardData || window.clipboardData);
  const raw = clip ? clip.getData("text/plain") : "";
  if (!raw) return;

  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const off = getCaret(el);
  const node = state.nodes[index];
  const before = node.text.slice(0, off);
  const after = node.text.slice(off);

  if (lines.length === 1) {
    node.text = before + lines[0] + after;
    el.textContent = node.text;
    setCaret(el, (before + lines[0]).length);
    save(); updateCounts();
    return;
  }

  // multi-line paste → one bullet per line
  const trailingEmpty = lines.length && lines[lines.length - 1] === "";
  const payload = trailingEmpty ? lines.slice(0, -1) : lines;
  node.text = before + payload[0];
  const [, blockEnd] = blockRange(index);
  const fresh = payload.slice(1).map((t) => mk(t, node.level));
  if (fresh.length) fresh[fresh.length - 1].text += after;
  else node.text += after;
  state.nodes.splice(blockEnd + 1, 0, ...fresh);
  const lastId = fresh.length ? fresh[fresh.length - 1].id : node.id;
  pendingFocus = { id: lastId, offset: fresh.length ? fresh[fresh.length - 1].text.length : node.text.length };
  save(); render();
}

/* ---------- structural operations ---------- */

function splitNode(index, offset) {
  const nodes = state.nodes;
  const node = nodes[index];
  const left = node.text.slice(0, offset);
  const right = node.text.slice(offset);
  node.text = left;

  // Enter at the end of an open parent → first child; otherwise sibling.
  const endOfOpenParent =
    offset === (left + right).length && hasChildren(index) && !node.collapsed;
  const level = endOfOpenParent ? node.level + 1 : node.level;
  const at = endOfOpenParent ? index + 1 : blockRange(index)[1] + 1;

  const fresh = mk(right, level);
  nodes.splice(at, 0, fresh);
  pendingFocus = { id: fresh.id, offset: 0 };
  save(); render();
}

function indent(index, caret) {
  const nodes = state.nodes;
  if (index === 0) return;
  if (nodes[index].level > nodes[index - 1].level) return; // already max relative
  if (nodes[index].level >= MAX_LEVEL) return;
  const [s, e] = blockRange(index);
  for (let i = s; i <= e; i++) nodes[i].level++;
  pendingFocus = { id: nodes[index].id, offset: caret };
  save(); render();
}

function outdent(index, caret) {
  const nodes = state.nodes;
  if (nodes[index].level === 0) return;
  const [s, e] = blockRange(index);
  for (let i = s; i <= e; i++) nodes[i].level--;
  pendingFocus = { id: nodes[index].id, offset: caret };
  save(); render();
}

function backspaceAtStart(index) {
  const nodes = state.nodes;
  const node = nodes[index];

  if (node.text === "") {
    // empty bullet → remove it, promote its children
    const [, e] = blockRange(index);
    for (let i = index + 1; i <= e; i++) nodes[i].level = Math.max(0, nodes[i].level - 1);
    const [removed] = nodes.splice(index, 1);
    if (state.zoomId === removed.id) state.zoomId = null;
    if (!nodes.length) nodes.push(mk("", 0));
    const rows = visibleRows();
    let pos = rows.findIndex((r) => r.index >= index);
    if (pos === -1) pos = rows.length; // removed from the end → focus new last row
    const target = rows[Math.max(0, pos - 1)] || rows[0];
    pendingFocus = { id: target.node.id, offset: target.node.text.length };
    save(); render();
    return;
  }

  // merge into previous visible bullet
  const rows = visibleRows();
  const pos = rows.findIndex((r) => r.index === index);
  if (pos <= 0) return; // first visible row: nothing to merge into
  const prev = rows[pos - 1];
  const boundary = prev.node.text.length;
  prev.node.text += node.text;

  const [, e] = blockRange(index);
  const delta = prev.node.level - node.level;
  const orphans = nodes.splice(index + 1, e - index);
  orphans.forEach((o) => { o.level = Math.max(0, o.level + delta); });
  const prevEnd = blockRange(prev.index)[1];
  nodes.splice(prevEnd + 1, 0, ...orphans);
  nodes.splice(nodes.indexOf(node), 1);
  if (state.zoomId === node.id) state.zoomId = prev.node.id;

  pendingFocus = { id: prev.node.id, offset: boundary };
  save(); render();
}

function deleteAtEnd(index, caret) {
  const rows = visibleRows();
  const pos = rows.findIndex((r) => r.index === index);
  if (pos < 0 || pos + 1 >= rows.length) return;
  const next = rows[pos + 1];
  if (next.node.level < state.nodes[index].level) return;

  const node = state.nodes[index];
  node.text += next.node.text;
  const [, e] = blockRange(next.index);
  const delta = node.level - next.node.level;
  const orphans = state.nodes.splice(next.index + 1, e - next.index);
  orphans.forEach((o) => { o.level = Math.max(0, o.level + delta); });
  const nodeEnd = blockRange(index)[1];
  state.nodes.splice(nodeEnd + 1, 0, ...orphans);
  state.nodes.splice(state.nodes.indexOf(next.node), 1);
  if (state.zoomId === next.node.id) state.zoomId = node.id;

  pendingFocus = { id: node.id, offset: caret };
  save(); render();
}

function focusSibling(index, dir, caret) {
  const rows = visibleRows();
  const pos = rows.findIndex((r) => r.index === index);
  const target = rows[pos + dir];
  if (!target) return;
  const off = caret === Infinity ? target.node.text.length : Math.min(caret, target.node.text.length);
  focusRow(target.node.id, off);
}

function moveBlock(index, dir, caret) {
  const nodes = state.nodes;
  const id = nodes[index].id;
  const level = nodes[index].level;
  const [s, e] = blockRange(index);

  if (dir < 0) {
    if (s === 0) return;
    let t = s - 1;
    while (t > 0 && nodes[t].level > level) t--;
    if (nodes[t].level < level) return; // first child: nowhere to go
    const moving = nodes.splice(s, e - s + 1);
    nodes.splice(t, 0, ...moving);
  } else {
    if (e >= nodes.length - 1) return;
    const n = e + 1;
    if (nodes[n].level < level) return;
    let nEnd = n;
    while (nEnd + 1 < nodes.length && nodes[nEnd + 1].level > nodes[n].level) nEnd++;
    const moving = nodes.splice(s, e - s + 1);
    const shift = nEnd - e;
    nodes.splice(s + shift, 0, ...moving);
  }
  pendingFocus = { id, offset: caret };
  save(); render();
}

function toggleCollapse(index) {
  const node = state.nodes[index];
  node.collapsed = !node.collapsed;
  const el = rowTextEl(node.id);
  pendingFocus = { id: node.id, offset: el ? getCaret(el) : 0 };
  save(); render();
}

function setCollapsed(index, value, caret) {
  if (!hasChildren(index)) return;
  state.nodes[index].collapsed = value;
  pendingFocus = { id: state.nodes[index].id, offset: caret };
  save(); render();
}

/* ---------- zoom ---------- */

function zoomToggle(id) {
  if (state.zoomId === id) { zoomOut(); return; }
  state.zoomId = id;
  pendingFocus = { id, offset: 0 };
  render();
}

function zoomOut() {
  const nodes = state.nodes;
  const z = nodes.findIndex((n) => n.id === state.zoomId);
  if (z < 0) { state.zoomId = null; render(); return; }
  const p = parentIndex(z);
  const outId = p >= 0 ? nodes[p].id : null;
  state.zoomId = outId;
  pendingFocus = { id: state.nodes[z].id, offset: 0 };
  render();
}

/* ---------- chrome: title, buttons, modal, theme ---------- */

titleEl.addEventListener("input", () => {
  state.title = titleEl.value;
  document.title = (state.title || "Untitled") + " — Frontier Outliner";
  save();
});

titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    const rows = visibleRows();
    if (rows.length) focusRow(rows[0].node.id, 0);
  }
  if (e.key === "Escape") titleEl.blur();
});

collapseBtn.addEventListener("click", () => {
  const anyOpen = state.nodes.some((n, i) => hasChildren(i) && !n.collapsed);
  state.nodes.forEach((n, i) => { if (hasChildren(i)) n.collapsed = anyOpen; });
  save(); render();
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
}

themeBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

function openModal() { modalBackdrop.hidden = false; modalClose.focus(); }
function closeModal() { modalBackdrop.hidden = true; shortcutsBtn.focus(); }

shortcutsBtn.addEventListener("click", openModal);
modalClose.addEventListener("click", () => { modalBackdrop.hidden = true; });
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    if (modalBackdrop.hidden) openModal();
    else modalBackdrop.hidden = true;
  } else if (e.key === "Escape" && !modalBackdrop.hidden) {
    modalBackdrop.hidden = true;
  }
});

// clicking empty page space focuses the last bullet
$("#page").addEventListener("click", (e) => {
  if (e.target.closest(".node") || e.target.closest("button") || e.target.closest(".crumbs")) return;
  const rows = visibleRows();
  if (!rows.length) return;
  const last = rows[rows.length - 1];
  focusRow(last.node.id, last.node.text.length);
});

/* ---------- boot ---------- */

(function init() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (_) {}

  if (!load()) {
    state.title = "Untitled";
    state.nodes = defaultNodes();
  }
  if (!state.nodes.length) state.nodes = [mk("", 0)];

  titleEl.value = state.title || "";
  document.title = (state.title || "Untitled") + " — Frontier Outliner";
  render();
})();
