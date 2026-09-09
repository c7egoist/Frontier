/* ============================================================
   FRONTIER · SCENE OUTLINER — game-engine entity hierarchy
   Model: flat list of nodes with `level`; collapse hides
   descendants, isolate (zoom) scopes the view to one subtree.
   Selection + rename flow mirrors Unity/Unreal outliners.
   ============================================================ */

"use strict";

/* ---------- constants ---------- */

const LS_KEY = "frontier.outliner.v1";
const THEME_KEY = "frontier.theme";
const STEP = 24;      // px per indent level (mirrors .gutter width)
const BASE_X = 20;    // px: bullet center of a level-0 row (8 pad + 12)
const MAX_LEVEL = 12;

const svgWrap = (inner) =>
  '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor"' +
  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";

/* Entity types: id, category, menu label, default name, icon (svg inner). */
const TYPES = [
  // ----- Atmosphere (Unreal-style sky & celestial) -----
  { id: "sky", cat: "Atmosphere", label: "Sky Atmosphere", def: "Sky Atmosphere",
    icon: '<path d="M1.5 10.5h11"/><path d="M4 10.5a3 3 0 0 1 6 0"/><path d="M7 1.6v1.3M3.7 2.9l.9.9M10.3 2.9l-.9.9"/>' },
  { id: "skylight", cat: "Atmosphere", label: "Sky Light", def: "Sky Light",
    icon: '<path d="M2 10a5 5 0 0 1 10 0"/><path d="M1.5 10.5h11"/><path d="M4.5 10a2.5 2.5 0 0 1 5 0"/>' },
  { id: "sun", cat: "Atmosphere", label: "Directional Light", def: "Sun",
    icon: '<circle cx="7" cy="7" r="2.4"/><path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M11.1 2.9L10 4M4 10l-1.1 1.1"/>' },
  { id: "moon", cat: "Atmosphere", label: "Moon", def: "Moon",
    icon: '<path d="M12.2 7.5A5.2 5.2 0 1 1 6.5 1.8 4.1 4.1 0 0 0 12.2 7.5z"/>' },
  { id: "fog", cat: "Atmosphere", label: "Fog", def: "Height Fog",
    icon: '<path d="M1.5 4.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.3-1 3.5 0"/><path d="M1.5 7.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.3-1 3.5 0"/><path d="M1.5 10.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.3-1 3.5 0"/>' },
  // ----- Lights -----
  { id: "light", cat: "Lights", label: "Point Light", def: "Point Light",
    icon: '<circle cx="7" cy="5.6" r="2.6"/><path d="M5.8 9.6h2.4M6.3 11.4h1.4M2.4 2.4l.9.9M11.6 2.4l-.9.9"/>' },
  { id: "spot", cat: "Lights", label: "Spot Light", def: "Spot Light",
    icon: '<path d="M5.6 1.5h2.8L11 9H3z"/><path d="M2.5 11.5h9"/>' },
  // ----- Scene -----
  { id: "folder", cat: "Scene", label: "Folder", def: "New Folder",
    icon: '<path d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h2.9l1.3 1.6h4.4c.7 0 1.2.5 1.2 1.2V10c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2z"/>' },
  { id: "mesh", cat: "Scene", label: "Mesh", def: "Cube",
    icon: '<path d="M7 1.4l5.3 3v4.2L7 11.6 1.7 8.6V4.4z"/><path d="M1.7 4.4L7 7.4l5.3-3M7 7.4v4.2"/>' },
  { id: "camera", cat: "Scene", label: "Camera", def: "Camera",
    icon: '<rect x="1.4" y="4.6" width="11.2" height="6.8" rx="1.6"/><circle cx="7" cy="8" r="2"/><path d="M4.4 4.6l1-1.6h3.2l1 1.6"/>' },
  { id: "particles", cat: "Scene", label: "Particles", def: "Particle System",
    icon: '<path d="M6.6 1c.5 2.2 1.2 2.9 3.4 3.4-2.2.5-2.9 1.2-3.4 3.4-.5-2.2-1.2-2.9-3.4-3.4 2.2-.5 2.9-1.2 3.4-3.4z"/><path d="M11.3 8.2c.3 1.2.7 1.6 1.9 1.9-1.2.3-1.6.7-1.9 1.9-.3-1.2-.7-1.6-1.9-1.9 1.2-.3 1.6-.7 1.9-1.9z"/>' },
  { id: "physics", cat: "Scene", label: "Physics", def: "Rigid Body",
    icon: '<circle cx="7" cy="7" r="1.7"/><ellipse cx="7" cy="7" rx="5.6" ry="2.2"/>' },
  // ----- Audio & Logic -----
  { id: "audio", cat: "Audio & Logic", label: "Audio", def: "Audio Source",
    icon: '<path d="M2 5.4v3.2h2.6L8.2 11V3L4.6 5.4z"/><path d="M9.7 5a2.8 2.8 0 0 1 0 4M11.2 3.5a5 5 0 0 1 0 7"/>' },
  { id: "script", cat: "Audio & Logic", label: "Script", def: "New Script",
    icon: '<path d="M5.2 4.2L2.6 7l2.6 2.8M8.8 4.2L11.4 7l-2.6 2.8"/>' },
  { id: "post", cat: "Audio & Logic", label: "Post Process", def: "Post Process Volume",
    icon: '<path d="M1.5 4.5h11M1.5 9.5h11"/><circle cx="5.2" cy="4.5" r="1.4"/><circle cx="8.8" cy="9.5" r="1.4"/>' },
];
const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.id, t]));

const EYE = '<path d="M1.4 7S3.2 3.9 7 3.9 12.6 7 12.6 7 10.8 10.1 7 10.1 1.4 7 1.4 7z"/><circle cx="7" cy="7" r="1.6"/>';
const EYE_OFF = '<path d="M2.6 2.6l8.8 8.8M5.2 4.2A5.4 5.4 0 0 1 7 4c3.8 0 5.6 3 5.6 3a8.4 8.4 0 0 1-1.5 1.9M8.6 10A1.9 1.9 0 0 1 6 8.3M3.2 5.5C2.1 6.2 1.4 7 1.4 7s1.8 3.1 5.6 3.1c.6 0 1.2-.1 1.7-.3"/>';

/* ---------- state ---------- */

let state = { title: "Level 01", nodes: [], zoomId: null, selectedId: null };
let editingId = null;
let originalText = "";
let filterQuery = "";
let pendingSel = null;   // row id to focus after render
let pendingScroll = false;
let pendingEdit = null;  // row id to enter rename mode after render

const $ = (sel) => document.querySelector(sel);
const outlineEl = $("#outline");
const crumbsEl = $("#crumbs");
const countsEl = $("#counts");
const titleEl = $("#docTitle");
const collapseBtn = $("#collapseBtn");
const themeBtn = $("#themeBtn");
const shortcutsBtn = $("#shortcutsBtn");
const addBtn = $("#addBtn");
const addMenu = $("#addMenu");
const searchBtn = $("#searchBtn");
const searchbar = $("#searchbar");
const searchInput = $("#searchInput");
const searchClear = $("#searchClear");
const ctxMenu = $("#ctxMenu");
const ctxToggleLabel = $("#ctxToggleLabel");
const modalBackdrop = $("#modalBackdrop");
const modalClose = $("#modalClose");

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function mk(text, level, type, visible) {
  return {
    id: uid(),
    text: text || "",
    level: level || 0,
    collapsed: false,
    type: TYPE_MAP[type] ? type : "mesh",
    visible: visible !== false,
  };
}

function defaultNodes() {
  return [
    mk("Environment", 0, "folder"),
    mk("Directional Light", 1, "light"),
    mk("Sky Dome", 1, "mesh"),
    mk("Ground", 1, "mesh"),
    mk("Ambience", 1, "audio"),
    mk("Player", 0, "folder"),
    mk("Player Capsule", 1, "mesh"),
    mk("Player Camera", 1, "camera"),
    mk("Footsteps", 1, "audio"),
    mk("Player Controller", 1, "script"),
    mk("Gameplay", 0, "folder"),
    mk("Coin Pickup", 1, "mesh"),
    mk("Pickup Burst", 2, "particles"),
    mk("Enemy Spawner", 1, "script"),
    mk("Trigger Volume", 1, "physics"),
    mk("Debug Grid", 0, "mesh", false),
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
    state.title = typeof data.title === "string" ? data.title : "Level 01";
    const nodes = data.nodes.filter(
      (n) => n && typeof n.id === "string" && typeof n.text === "string" && Number.isFinite(n.level)
    ).map((n) => ({
      id: n.id,
      text: n.text,
      level: Math.max(0, Math.min(MAX_LEVEL, n.level | 0)),
      collapsed: !!n.collapsed,
      type: typeof n.type === "string" ? n.type : "",
      visible: n.visible !== false,
    }));
    // migrate typeless saves: parents → folder, leaves → mesh
    nodes.forEach((n, i) => {
      if (!TYPE_MAP[n.type]) {
        n.type = (i + 1 < nodes.length && nodes[i + 1].level > n.level) ? "folder" : "mesh";
      }
    });
    state.nodes = nodes;
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

/** Index range + base level for the current isolate scope. */
function zoomRange() {
  const nodes = state.nodes;
  if (!state.zoomId) return [0, nodes.length - 1, 0];
  const z = nodes.findIndex((n) => n.id === state.zoomId);
  if (z < 0) return [0, nodes.length - 1, 0];
  const [, end] = blockRange(z);
  return [z, end, nodes[z].level];
}

/** Visible rows in scope, minus collapsed descendants; search shows matches + ancestors. */
function visibleRows() {
  const nodes = state.nodes;
  const [zs, ze, base] = zoomRange();
  const q = filterQuery.trim().toLowerCase();
  let showSet = null;

  if (q) {
    showSet = new Set();
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].text.toLowerCase().includes(q)) {
        showSet.add(i);
        let p = i;
        while ((p = parentIndex(p)) >= 0) showSet.add(p);
      }
    }
  }

  const rows = [];
  const hidden = []; // stack of collapsed ancestor levels
  for (let i = zs; i <= ze && i < nodes.length; i++) {
    const n = nodes[i];
    if (showSet) {
      if (!showSet.has(i)) continue;
    } else {
      while (hidden.length && n.level <= hidden[hidden.length - 1]) hidden.pop();
      if (hidden.length) continue;
      if (n.collapsed) hidden.push(n.level);
    }
    rows.push({ node: n, index: i, rel: n.level - base });
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

function ensureSelectionValid() {
  if (state.selectedId && !state.nodes.some((n) => n.id === state.selectedId)) state.selectedId = null;
}

/* ---------- selection helpers ---------- */

function rowEl(id) {
  return outlineEl.querySelector('[data-id="' + id + '"]');
}

function rowTextEl(id) {
  const row = rowEl(id);
  return row ? row.querySelector(".text") : null;
}

function select(id, scroll) {
  state.selectedId = id;
  pendingSel = id;
  pendingScroll = !!scroll;
  render();
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- render ---------- */

function render() {
  ensureZoomValid();
  ensureSelectionValid();
  hideCtx();
  const rows = visibleRows();

  outlineEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  rows.forEach((r) => frag.appendChild(createRow(r)));
  if (filterQuery.trim() && rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-note";
    empty.textContent = 'No entities match "' + filterQuery.trim() + '"';
    frag.appendChild(empty);
  }
  outlineEl.appendChild(frag);

  renderCrumbs();
  updateCounts(rows.length);
  updateCollapseBtn();

  if (pendingEdit) {
    const id = pendingEdit;
    pendingEdit = null;
    pendingSel = null;
    const el = rowTextEl(id);
    if (el) {
      el.focus();
      selectAll(el);
      el.scrollIntoView({ block: "nearest" });
    }
  } else if (pendingSel) {
    const id = pendingSel;
    pendingSel = null;
    const row = rowEl(id);
    if (row) {
      row.focus({ preventScroll: !pendingScroll });
      if (pendingScroll) {
        pendingScroll = false;
        row.scrollIntoView({ block: "nearest" });
      }
    } else {
      pendingScroll = false;
    }
  }
}

function createRow({ node, index, rel }) {
  const kids = hasChildren(index);
  const editing = editingId === node.id;
  const selected = state.selectedId === node.id;
  const type = TYPE_MAP[node.type] || TYPE_MAP.mesh;

  const row = document.createElement("div");
  row.className = "node" + (selected ? " selected" : "") + (editing ? " editing" : "") + (node.visible ? "" : " hidden-entity");
  row.dataset.id = node.id;
  row.tabIndex = selected ? 0 : -1;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(rel + 1));
  row.setAttribute("aria-selected", String(selected));
  if (kids) row.setAttribute("aria-expanded", String(!node.collapsed));

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
  bullet.title = kids ? (node.collapsed ? "Expand" : "Collapse") + " · double-click to isolate" : "Double-click to isolate";
  bullet.setAttribute("aria-label", kids ? (node.collapsed ? "Expand" : "Collapse") : "Entity");
  bullet.innerHTML = '<span class="dot"></span>' +
    '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 1.5L6.5 5l-3 3.5"/></svg>';
  bullet.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.detail > 1) return; // handled by dblclick
    if (e.altKey || e.metaKey || e.ctrlKey) { zoomToggle(node.id); return; }
    if (kids) toggleCollapse(index);
    else if (!selected) select(node.id);
  });
  bullet.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomToggle(node.id);
  });
  gutter.appendChild(bullet);
  row.appendChild(gutter);

  const icon = document.createElement("span");
  icon.className = "type-icon";
  icon.title = type.label;
  icon.innerHTML = svgWrap(type.icon);
  row.appendChild(icon);

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = node.text;
  if (editing) {
    text.contentEditable = "true";
    text.spellcheck = false;
    text.addEventListener("keydown", (e) => onEditKeyDown(e, index, text));
    text.addEventListener("blur", () => commitEditing(index));
    text.addEventListener("paste", (e) => {
      // plain-text, single line names
      e.preventDefault();
      const clip = e.clipboardData || window.clipboardData;
      const t = clip ? clip.getData("text/plain").split("\n")[0] : "";
      document.execCommand("insertText", false, t);
    });
  }
  row.appendChild(text);

  if (kids && node.collapsed) {
    const badge = document.createElement("span");
    badge.className = "child-count";
    badge.textContent = countDescendants(index);
    badge.title = "Expand";
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCollapse(index);
    });
    row.appendChild(badge);
  }

  const eye = document.createElement("button");
  eye.className = "eye";
  eye.type = "button";
  eye.tabIndex = -1;
  eye.title = node.visible ? "Hide (V)" : "Show (V)";
  eye.setAttribute("aria-label", node.visible ? "Hide entity" : "Show entity");
  eye.innerHTML = svgWrap(node.visible ? EYE : EYE_OFF);
  eye.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleVisible(index);
  });
  row.appendChild(eye);

  row.addEventListener("click", () => {
    if (editingId) return; // commit via blur; keep selection
    if (!selected) select(node.id);
    else row.focus();
  });
  row.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    startEditing(node.id);
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!selected) {
      state.selectedId = node.id;
      render();
    }
    showCtx(e.clientX, e.clientY);
  });
  row.addEventListener("keydown", (e) => onRowKeyDown(e, index));

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
  root.textContent = state.title || "Scene";
  root.title = "Back to scene";
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

function updateCounts(visibleCount) {
  const n = state.nodes.length;
  const hiddenCount = state.nodes.filter((x) => !x.visible).length;
  let label = n + (n === 1 ? " entity" : " entities");
  if (filterQuery.trim()) label = visibleCount + " of " + n;
  else if (hiddenCount) label += " · " + hiddenCount + " hidden";
  countsEl.textContent = label;
}

function updateCollapseBtn() {
  const anyOpen = state.nodes.some((n, i) => hasChildren(i) && !n.collapsed);
  collapseBtn.title = anyOpen ? "Collapse all" : "Expand all";
  collapseBtn.setAttribute("aria-label", collapseBtn.title);
}

/* ---------- row keyboard flow ---------- */

function onRowKeyDown(e, index) {
  const node = state.nodes[index];
  const mod = e.metaKey || e.ctrlKey;

  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateBlock(index); return; }
  if (mod && e.key === "Enter") { e.preventDefault(); zoomToggle(node.id); return; }
  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    moveBlock(index, e.key === "ArrowUp" ? -1 : 1);
    return;
  }
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); setCollapsed(index, true); return; }
  if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); setCollapsed(index, false); return; }
  if (mod) return;

  switch (e.key) {
    case "Enter":
    case "F2":
      e.preventDefault();
      startEditing(node.id);
      break;
    case "Tab":
      e.preventDefault();
      if (e.shiftKey) outdent(index); else indent(index);
      break;
    case "Delete":
    case "Backspace":
      e.preventDefault();
      deleteBlock(index);
      break;
    case "ArrowUp":
      e.preventDefault();
      selectSibling(index, -1);
      break;
    case "ArrowDown":
      e.preventDefault();
      selectSibling(index, 1);
      break;
    case "ArrowLeft": {
      e.preventDefault();
      if (hasChildren(index) && !node.collapsed) setCollapsed(index, true);
      else {
        const p = parentIndex(index);
        if (p >= 0) select(state.nodes[p].id, true);
      }
      break;
    }
    case "ArrowRight": {
      e.preventDefault();
      if (hasChildren(index) && node.collapsed) setCollapsed(index, false);
      else if (index + 1 < state.nodes.length && state.nodes[index + 1].level > node.level) {
        select(state.nodes[index + 1].id, true);
      }
      break;
    }
    case "Home":
      e.preventDefault();
      selectFirstLast(-1);
      break;
    case "End":
      e.preventDefault();
      selectFirstLast(1);
      break;
    case "Insert":
      e.preventDefault();
      toggleAddMenu(true);
      break;
    case "Escape":
      if (!modalBackdrop.hidden || !addMenu.hidden || !ctxMenu.hidden) return; // global closes menus
      if (state.zoomId) zoomOut();
      break;
    default:
      if (e.key.toLowerCase() === "v" && !e.altKey) {
        e.preventDefault();
        toggleVisible(index);
      }
  }
}

/* ---------- rename flow ---------- */

function startEditing(id) {
  const node = state.nodes.find((n) => n.id === id);
  if (!node) return;
  editingId = id;
  originalText = node.text;
  state.selectedId = id;
  pendingEdit = id;
  render();
}

function onEditKeyDown(e, index, el) {
  e.stopPropagation(); // editing owns every keystroke
  if (e.key === "Enter") {
    e.preventDefault();
    el.blur(); // blur commits
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEditing();
  } else if (e.key === "Tab") {
    e.preventDefault();
    el.blur();
  }
}

function commitEditing(index) {
  if (!editingId) return;
  const node = state.nodes[index];
  const el = rowTextEl(editingId);
  if (node && el) {
    const name = el.textContent.split("\n")[0];
    node.text = name.trim() ? name : originalText;
  }
  const id = editingId;
  editingId = null;
  originalText = "";
  state.selectedId = id;
  pendingSel = id;
  save();
  render();
}

function cancelEditing() {
  if (!editingId) return;
  const id = editingId;
  editingId = null;
  originalText = "";
  state.selectedId = id;
  pendingSel = id;
  render();
}

/* ---------- structural operations ---------- */

function addEntity(typeId) {
  const type = TYPE_MAP[typeId] || TYPE_MAP.mesh;
  const nodes = state.nodes;
  let level = 0;
  let at = nodes.length;

  const selIdx = state.selectedId ? nodes.findIndex((n) => n.id === state.selectedId) : -1;
  if (selIdx >= 0) {
    level = nodes[selIdx].level;
    at = blockRange(selIdx)[1] + 1;
  } else if (state.zoomId) {
    const z = nodes.findIndex((n) => n.id === state.zoomId);
    if (z >= 0) {
      level = Math.min(MAX_LEVEL, nodes[z].level + 1);
      at = blockRange(z)[1] + 1;
    }
  }

  const fresh = mk(type.def, level, type.id);
  nodes.splice(at, 0, fresh);
  save();
  startEditing(fresh.id); // select + rename immediately
}

function duplicateBlock(index) {
  const nodes = state.nodes;
  const [s, e] = blockRange(index);
  const copies = nodes.slice(s, e + 1).map((n, k) => ({
    id: uid(),
    text: k === 0 ? n.text + " Copy" : n.text,
    level: n.level,
    collapsed: n.collapsed,
    type: n.type,
    visible: n.visible,
  }));
  nodes.splice(e + 1, 0, ...copies);
  save();
  select(copies[0].id, true);
}

function deleteBlock(index) {
  const nodes = state.nodes;
  const [s, e] = blockRange(index);
  const rows = visibleRows();
  const removed = new Set(nodes.slice(s, e + 1).map((n) => n.id));

  // neighbor to select afterwards: next visible survivor, else previous
  let nextId = null;
  const after = rows.find((r) => r.index > e);
  if (after) nextId = after.node.id;
  else {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!removed.has(rows[i].node.id)) { nextId = rows[i].node.id; break; }
    }
  }

  if (state.zoomId && removed.has(state.zoomId)) {
    const p = parentIndex(s);
    state.zoomId = p >= 0 ? nodes[p].id : null;
  }
  nodes.splice(s, e - s + 1);
  if (!nodes.length) {
    const fresh = mk("New Folder", 0, "folder");
    nodes.push(fresh);
    nextId = fresh.id;
  }
  state.selectedId = nextId;
  pendingSel = nextId;
  pendingScroll = true;
  save();
  render();
}

function toggleVisible(index) {
  const node = state.nodes[index];
  node.visible = !node.visible;
  state.selectedId = node.id;
  pendingSel = node.id;
  save();
  render();
}

function indent(index) {
  const nodes = state.nodes;
  if (index === 0) return;
  if (nodes[index].level > nodes[index - 1].level) return;
  if (nodes[index].level >= MAX_LEVEL) return;
  const [s, e] = blockRange(index);
  for (let i = s; i <= e; i++) nodes[i].level++;
  state.selectedId = nodes[index].id;
  pendingSel = nodes[index].id;
  save(); render();
}

function outdent(index) {
  const nodes = state.nodes;
  if (nodes[index].level === 0) return;
  const [s, e] = blockRange(index);
  for (let i = s; i <= e; i++) nodes[i].level--;
  state.selectedId = nodes[index].id;
  pendingSel = nodes[index].id;
  save(); render();
}

function selectSibling(index, dir) {
  const rows = visibleRows();
  const pos = rows.findIndex((r) => r.index === index);
  const target = rows[pos + dir];
  if (!target) return;
  select(target.node.id, true);
}

function selectFirstLast(dir) {
  const rows = visibleRows();
  if (!rows.length) return;
  select((dir < 0 ? rows[0] : rows[rows.length - 1]).node.id, true);
}

function moveBlock(index, dir) {
  const nodes = state.nodes;
  const id = nodes[index].id;
  const level = nodes[index].level;
  const [s, e] = blockRange(index);

  if (dir < 0) {
    if (s === 0) return;
    let t = s - 1;
    while (t > 0 && nodes[t].level > level) t--;
    if (nodes[t].level < level) return;
    const moving = nodes.splice(s, e - s + 1);
    nodes.splice(t, 0, ...moving);
  } else {
    if (e >= nodes.length - 1) return;
    const n = e + 1;
    if (nodes[n].level < level) return;
    let nEnd = n;
    while (nEnd + 1 < nodes.length && nodes[nEnd + 1].level > nodes[n].level) nEnd++;
    const moving = nodes.splice(s, e - s + 1);
    nodes.splice(s + (nEnd - e), 0, ...moving);
  }
  state.selectedId = id;
  pendingSel = id;
  pendingScroll = true;
  save(); render();
}

function toggleCollapse(index) {
  const node = state.nodes[index];
  node.collapsed = !node.collapsed;
  if (state.selectedId) pendingSel = state.selectedId;
  save(); render();
}

function setCollapsed(index, value) {
  if (!hasChildren(index)) return;
  state.nodes[index].collapsed = value;
  state.selectedId = state.nodes[index].id;
  pendingSel = state.selectedId;
  save(); render();
}

/* ---------- isolate (zoom) ---------- */

function zoomToggle(id) {
  if (state.zoomId === id) { zoomOut(); return; }
  state.zoomId = id;
  state.selectedId = id;
  pendingSel = id;
  render();
}

function zoomOut() {
  const nodes = state.nodes;
  const z = nodes.findIndex((n) => n.id === state.zoomId);
  if (z < 0) { state.zoomId = null; render(); return; }
  const p = parentIndex(z);
  state.zoomId = p >= 0 ? nodes[p].id : null;
  state.selectedId = nodes[z].id;
  pendingSel = nodes[z].id;
  render();
}

/* ---------- add menu ---------- */

function buildAddMenu() {
  addMenu.innerHTML = "";
  let lastCat = null;
  TYPES.forEach((t) => {
    if (t.cat !== lastCat) {
      lastCat = t.cat;
      const head = document.createElement("div");
      head.className = "add-head";
      head.textContent = t.cat;
      addMenu.appendChild(head);
    }
    const b = document.createElement("button");
    b.className = "add-item";
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.innerHTML = '<span class="add-icon">' + svgWrap(t.icon) + "</span>" +
      '<span class="add-label">' + t.label + "</span>" +
      '<span class="add-def">' + t.def + "</span>";
    b.addEventListener("click", () => {
      toggleAddMenu(false);
      addEntity(t.id);
    });
    addMenu.appendChild(b);
  });
}

function toggleAddMenu(force) {
  const open = force !== undefined ? force : addMenu.hidden;
  addMenu.hidden = !open;
  addBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = addMenu.querySelector(".add-item");
    if (first) first.focus();
  } else if (state.selectedId) {
    pendingSel = state.selectedId;
  }
}

addBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleAddMenu();
});

addMenu.addEventListener("keydown", (e) => {
  const items = [...addMenu.querySelectorAll(".add-item")];
  const pos = items.indexOf(document.activeElement);
  if (e.key === "Escape") { toggleAddMenu(false); if (state.selectedId) select(state.selectedId); }
  else if (e.key === "ArrowDown") { e.preventDefault(); (items[pos + 1] || items[0]).focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); (items[pos - 1] || items[items.length - 1]).focus(); }
});

/* ---------- context menu ---------- */

let ctxIndex = -1;

function showCtx(x, y) {
  const idx = state.selectedId ? state.nodes.findIndex((n) => n.id === state.selectedId) : -1;
  if (idx < 0) return;
  ctxIndex = idx;
  ctxToggleLabel.textContent = state.nodes[idx].visible ? "Hide" : "Show";
  ctxMenu.hidden = false;
  const w = 210, h = 170;
  ctxMenu.style.left = Math.min(x, window.innerWidth - w - 8) + "px";
  ctxMenu.style.top = Math.min(y, window.innerHeight - h - 8) + "px";
}

function hideCtx() {
  ctxMenu.hidden = true;
  ctxIndex = -1;
}

ctxMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".ctx-item");
  if (!item || ctxIndex < 0) { hideCtx(); return; }
  const act = item.dataset.act;
  const id = state.nodes[ctxIndex] ? state.nodes[ctxIndex].id : null;
  hideCtx();
  if (act === "rename" && id) startEditing(id);
  else if (act === "duplicate") duplicateBlock(ctxIndex);
  else if (act === "toggle") toggleVisible(ctxIndex);
  else if (act === "delete") deleteBlock(ctxIndex);
});

/* ---------- search ---------- */

function setSearch(open) {
  searchbar.hidden = !open;
  searchBtn.classList.toggle("on", open);
  if (open) {
    searchInput.focus();
    searchInput.select();
  } else {
    filterQuery = "";
    searchInput.value = "";
    searchClear.hidden = true;
    render();
    if (state.selectedId) {
      pendingSel = state.selectedId;
      const row = rowEl(state.selectedId);
      if (row) row.focus();
    }
  }
}

searchBtn.addEventListener("click", () => setSearch(searchbar.hidden));

searchInput.addEventListener("input", () => {
  filterQuery = searchInput.value;
  searchClear.hidden = !searchInput.value;
  render();
});

searchInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Escape") { setSearch(false); }
  else if (e.key === "ArrowDown" || e.key === "Enter") {
    e.preventDefault();
    const rows = visibleRows();
    if (rows.length) select(rows[0].node.id, true);
  }
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  filterQuery = "";
  searchClear.hidden = true;
  searchInput.focus();
  render();
});

/* ---------- chrome: title, buttons, modal, theme ---------- */

titleEl.addEventListener("input", () => {
  state.title = titleEl.value;
  document.title = (state.title || "Scene") + " — Frontier";
  save();
});

titleEl.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    const rows = visibleRows();
    if (rows.length) select(rows[0].node.id, true);
  }
  if (e.key === "Escape") titleEl.blur();
});

collapseBtn.addEventListener("click", () => {
  const anyOpen = state.nodes.some((n, i) => hasChildren(i) && !n.collapsed);
  state.nodes.forEach((n, i) => { if (hasChildren(i)) n.collapsed = anyOpen; });
  if (state.selectedId) pendingSel = state.selectedId;
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

shortcutsBtn.addEventListener("click", openModal);
modalClose.addEventListener("click", () => { modalBackdrop.hidden = true; });
$("#resetScene").addEventListener("click", () => {
  modalBackdrop.hidden = true;
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  state.title = "Level 01";
  state.nodes = defaultNodes();
  state.zoomId = null;
  editingId = null;
  originalText = "";
  filterQuery = "";
  searchInput.value = "";
  searchClear.hidden = true;
  setSearch(false);
  titleEl.value = state.title;
  document.title = state.title + " — Frontier";
  save();
  select(state.nodes[0].id, true);
});
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.hidden = true;
});

document.addEventListener("click", (e) => {
  if (!addMenu.hidden && !e.target.closest("#addMenu") && !e.target.closest("#addBtn")) {
    toggleAddMenu(false);
  }
  if (!ctxMenu.hidden && !e.target.closest("#ctxMenu")) hideCtx();
});

window.addEventListener("scroll", () => { if (!ctxMenu.hidden) hideCtx(); }, true);

document.addEventListener("keydown", (e) => {
  const typing = editingId || e.target.closest("input, textarea");
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    modalBackdrop.hidden = !modalBackdrop.hidden;
    if (!modalBackdrop.hidden) modalClose.focus();
    return;
  }
  if (e.key === "Escape") {
    if (!modalBackdrop.hidden) { modalBackdrop.hidden = true; return; }
    if (!addMenu.hidden) { toggleAddMenu(false); return; }
    if (!ctxMenu.hidden) { hideCtx(); return; }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") {
    e.preventDefault();
    setSearch(true);
  }
});

// clicking empty page space deselects
$("#page").addEventListener("click", (e) => {
  if (e.target.closest(".node") || e.target.closest("button") || e.target.closest(".crumbs") || e.target.closest("input")) return;
  if (state.selectedId) {
    state.selectedId = null;
    render();
  }
});

/* ---------- boot ---------- */

(function init() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (_) {}

  if (!load()) {
    state.title = "Level 01";
    state.nodes = defaultNodes();
  }
  if (!state.nodes.length) state.nodes = [mk("New Folder", 0, "folder")];

  titleEl.value = state.title || "";
  document.title = (state.title || "Scene") + " — Frontier";
  buildAddMenu();
  state.selectedId = state.nodes[0].id;
  render();
})();
