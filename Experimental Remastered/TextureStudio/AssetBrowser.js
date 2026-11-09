/*==========================================================================================================================================
                                                          ASSETBROWSER.JS
==========================================================================================================================================*/
/* Shared Bottom Resizable Asset Browser Drawer for Frontier Texture Studio:
   - Draggable top notch (.cb-resize) to resize vertically between collapsed 38px bar and expanded grid (up to 62vh)
   - Automatically selects each workspace's matching asset category unless the user explicitly specifies another category
   - Drag-and-drop (application/x-frontier-asset) + click/apply onto Material, Pattern, Stamp, Paint, and Baking canvases
   - Surfaces all 36 African Patterns prominently under Patterns -> African Patterns ★ with crisp inline SVG thumbnails. */

import { materials as MATERIAL_CATALOG } from "./Engine/Materials/materials.js";
import {
  listPatternStarterCatalog,
  listStampStarterCatalog,
  getArtworkPreviewSvg,
} from "./Engine/Patterns/StarterCatalogBridge.js";
import { PAINT_MESH_LIST } from "./Engine/TexturePaintEngine.js";
import { BAKE_STUDY_SHAPES } from "./Engine/BakingEngine.js";
import { Construct, ConstructGlyph } from "./StudioControls.js";

export const WORKSPACE_ASSET_CATEGORY = {
  material: "materials",
  pattern: "patterns",
  stamp: "stamps",
  paint: "stamps",
  bake: "meshes",
};

const BRUSH_TIP_ASSETS = [
  { id: "round", name: "Soft Round Tip", group: "Natural Tips", tip: "round", color: "#eff4cf", hardness: 0.72 },
  { id: "chisel", name: "Flat Chisel Tip", group: "Hard Surface", tip: "chisel", color: "#e8c27a", hardness: 0.9 },
  { id: "chalk", name: "Textured Chalk", group: "Grainy & Dry", tip: "chalk", color: "#d6dce6", hardness: 0.52 },
  { id: "splatter", name: "Weathering Splatter", group: "Wear & Dirt", tip: "splatter", color: "#b68e5e", hardness: 0.6 },
  { id: "sponge", name: "Porous Sponge Dab", group: "Grainy & Dry", tip: "sponge", color: "#90b88f", hardness: 0.48 },
  { id: "tool-erase", name: "Soft Eraser", group: "Utility Tools", tool: "erase", color: "#8e94a0" },
  { id: "tool-fill", name: "Part / UV Flood Fill", group: "Utility Tools", tool: "fill", color: "#6ea8ff" },
];

function buildBrushTipSvg(item) {
  const col = item.color || "#eff4cf";
  if (item.tip === "chisel") {
    return `<svg viewBox="0 0 64 64"><rect x="14" y="22" width="36" height="20" rx="3" transform="rotate(-24 32 32)" fill="${col}"/></svg>`;
  }
  if (item.tip === "chalk") {
    return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="${col}" fill-opacity="0.72"/><circle cx="24" cy="24" r="5" fill="#111317" fill-opacity="0.45"/><circle cx="38" cy="35" r="4" fill="#111317" fill-opacity="0.4"/><circle cx="33" cy="21" r="3" fill="#111317" fill-opacity="0.35"/></svg>`;
  }
  if (item.tip === "splatter") {
    return `<svg viewBox="0 0 64 64"><circle cx="30" cy="33" r="10" fill="${col}"/><circle cx="46" cy="20" r="4.5" fill="${col}"/><circle cx="17" cy="22" r="3.5" fill="${col}"/><circle cx="44" cy="45" r="3" fill="${col}"/><circle cx="20" cy="46" r="2.5" fill="${col}"/><circle cx="36" cy="17" r="2" fill="${col}"/></svg>`;
  }
  if (item.tip === "sponge") {
    return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="17" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2" stroke-dasharray="3 3"/><circle cx="26" cy="28" r="3.5" fill="#111317"/><circle cx="37" cy="27" r="2.8" fill="#111317"/><circle cx="31" cy="38" r="3.2" fill="#111317"/></svg>`;
  }
  if (item.tool === "erase") {
    return `<svg viewBox="0 0 64 64"><path d="M18 44h28M21 38l16-16 9 9-16 16H21z" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (item.tool === "fill") {
    return `<svg viewBox="0 0 64 64"><path d="M16 32l14-14 16 16-14 14z" fill="${col}" fill-opacity="0.75"/><circle cx="46" cy="42" r="5" fill="${col}"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64"><defs><radialGradient id="rb"><stop offset="0%" stop-color="${col}"/><stop offset="70%" stop-color="${col}" stop-opacity="0.78"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="21" fill="url(#rb)"/></svg>`;
}

function buildMeshSvg(id) {
  const accent = id === "teapot" ? "#eff4cf" : id === "shaderball" ? "#e8c27a" : id === "torusknot" ? "#9ecfff" : "#a8d8a2";
  return `<svg viewBox="0 0 64 64"><path d="M32 10l18 10v24L32 54 14 44V20z" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-width="2.2" stroke-linejoin="round"/><path d="M32 32l18-12M32 32v22M32 32L14 20" stroke="${accent}" stroke-width="1.8"/></svg>`;
}

export function createAssetBrowser(mountEl, appBridge) {
  const patternCatalog = listPatternStarterCatalog();
  const stampCatalog = listStampStarterCatalog();

  const meshAssets = [];
  const seenMeshes = new Set();
  for (const m of BAKE_STUDY_SHAPES) {
    seenMeshes.add(m.id);
    meshAssets.push({ id: m.id, name: m.label, group: "Bake & Paint Studies", bakeId: m.id, paintId: PAINT_MESH_LIST.some((p) => p.id === m.id) ? m.id : "shaderball" });
  }
  for (const p of PAINT_MESH_LIST) {
    if (!seenMeshes.has(p.id)) {
      meshAssets.push({ id: p.id, name: p.label, group: "Paint Meshes", paintId: p.id, bakeId: "teapot" });
    }
  }

  const CATEGORIES = [
    { id: "materials", label: "Materials", count: MATERIAL_CATALOG.length },
    { id: "patterns", label: "Patterns", count: patternCatalog.length },
    { id: "stamps", label: "Stamps", count: stampCatalog.length },
    { id: "brushes", label: "Brush Tips", count: BRUSH_TIP_ASSETS.length },
    { id: "meshes", label: "3D Meshes", count: meshAssets.length },
  ];

  const state = {
    activeWorkspaceId: "material",
    activeCategory: "materials",
    userSpecifiedCategory: false,
    family: "All",
    search: "",
    collapsed: false,
    heightPx: 224,
    activeAssetKey: null,
  };

  const drawer = Construct("section", "asset-browser");
  drawer.setAttribute("aria-label", "Asset Browser");
  drawer.style.height = `${state.heightPx}px`;

  // Top draggable notch (.cb-resize)
  const resizeNotch = Construct("div", "cb-resize", document.createElement("i"));
  resizeNotch.setAttribute("role", "separator");
  resizeNotch.setAttribute("aria-orientation", "horizontal");
  resizeNotch.setAttribute("aria-label", "Drag to resize Asset Browser");
  resizeNotch.setAttribute("tabindex", "0");
  resizeNotch.title = "Drag up/down to resize · Double-click to collapse/expand";

  // Header bar
  const head = Construct("div", "cb-head");
  const titleEl = Construct("span", "cb-title", [ConstructGlyph("Grid"), Construct("span", null, "Asset Browser")]);
  const catTabsWrap = Construct("div", "cb-cat-tabs");

  const searchInp = Construct("input", "cb-search");
  searchInp.type = "search";
  searchInp.placeholder = "Filter assets (African, gold, denim…)";

  const autoBtn = Construct("button", "cb-auto-pill auto-on", [
    ConstructGlyph("Pin"),
    Construct("span", null, "Auto: Material"),
  ]);
  autoBtn.type = "button";
  autoBtn.title = "Automatically switch category when changing workspace (click to reset if manually pinned)";

  const toggleBtn = Construct("button", "cb-toggle-btn", ConstructGlyph("ChevronDown"));
  toggleBtn.type = "button";
  toggleBtn.title = "Collapse / Expand Asset Browser";

  const headRight = Construct("div", "cb-head-right", [searchInp, autoBtn, toggleBtn]);
  head.append(titleEl, catTabsWrap, headRight);

  // Body (Families sidebar + Card Grid)
  const body = Construct("div", "cb-body");
  const familyCol = Construct("div", "cb-families");
  const gridScroll = Construct("div", "cb-grid-scroll");
  const gridEl = Construct("div", "cb-grid");
  gridScroll.append(gridEl);
  body.append(familyCol, gridScroll);

  drawer.append(resizeNotch, head, body);
  mountEl.append(drawer);

  // ----------------------------------------------------------------- HEIGHT / COLLAPSE / DRAG NOTCH
  const MIN_H = 38;
  const DEFAULT_H = 224;
  function getMaxHeight() {
    return Math.max(260, Math.min(540, Math.round(window.innerHeight * 0.62)));
  }

  function applyDrawerGeometry() {
    drawer.classList.toggle("collapsed", state.collapsed || state.heightPx <= MIN_H + 2);
    drawer.style.height = state.collapsed ? `${MIN_H}px` : `${state.heightPx}px`;
    toggleBtn.innerHTML = "";
    toggleBtn.append(ConstructGlyph(drawer.classList.contains("collapsed") ? "ChevronUp" : "ChevronDown"));
  }

  function setDrawerHeight(nextH) {
    const maxH = getMaxHeight();
    const clamped = Math.max(MIN_H, Math.min(maxH, Math.round(nextH)));
    if (clamped <= 58) {
      state.collapsed = true;
    } else {
      state.collapsed = false;
      state.heightPx = clamped;
    }
    applyDrawerGeometry();
  }

  resizeNotch.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawer.classList.contains("collapsed") ? MIN_H : drawer.getBoundingClientRect().height;
    drawer.classList.add("resizing");
    resizeNotch.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      const deltaY = startY - ev.clientY;
      const next = Math.max(MIN_H, Math.min(getMaxHeight(), Math.round(startH + deltaY)));
      if (next <= 56) {
        state.collapsed = true;
      } else {
        state.collapsed = false;
        state.heightPx = next;
      }
      applyDrawerGeometry();
    };
    const onEnd = () => {
      drawer.classList.remove("resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  });

  resizeNotch.addEventListener("dblclick", () => {
    state.collapsed = !state.collapsed;
    if (!state.collapsed && state.heightPx < 120) state.heightPx = DEFAULT_H;
    applyDrawerGeometry();
  });

  resizeNotch.addEventListener("keydown", (e) => {
    const cur = state.collapsed ? MIN_H : state.heightPx;
    if (e.key === "ArrowUp") { e.preventDefault(); setDrawerHeight(cur + 28); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setDrawerHeight(cur - 28); }
    else if (e.key === "Home") { e.preventDefault(); state.collapsed = true; applyDrawerGeometry(); }
    else if (e.key === "End") { e.preventDefault(); state.collapsed = false; setDrawerHeight(getMaxHeight()); }
  });

  toggleBtn.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    if (!state.collapsed && state.heightPx < 120) state.heightPx = DEFAULT_H;
    applyDrawerGeometry();
  });

  // ----------------------------------------------------------------- DATA LISTING & RENDERING
  function getCategoryFamiliesAndItems(cat) {
    if (cat === "materials") {
      const fams = ["All", ...new Set(MATERIAL_CATALOG.map((m) => m.category || "Surface"))];
      const items = MATERIAL_CATALOG.map((m) => ({
        assetKind: "material",
        key: `mat:${m.id}`,
        id: m.id,
        name: m.name,
        family: m.category || "Surface",
        sub: `${Math.round((m.roughness ?? 0.5) * 100)}% R · ${Math.round((m.metalness ?? 0) * 100)}% M`,
        raw: m,
      }));
      return { families: fams, items };
    }
    if (cat === "patterns") {
      const all = patternCatalog;
      const counts = new Map();
      for (const p of all) {
        const fam = p.group || "Archive";
        counts.set(fam, (counts.get(fam) || 0) + 1);
      }
      // Prioritize African Patterns right at the top alongside Noise & Procedural!
      const priority = ["African Patterns", "Noise & Procedural", "Geometric designs", "African traditional", "Islamic geometry", "Fabric weaves", "Stitch patterns", "Originals"];
      const rest = [...counts.keys()].filter((k) => !priority.includes(k)).sort();
      const ordered = ["All", ...priority.filter((k) => counts.has(k)), ...rest];
      const items = all.map((p) => ({
        assetKind: "pattern",
        key: `pat:${p.id}`,
        id: p.id,
        name: p.name,
        family: p.group || "Archive",
        sub: p.subGroup && p.subGroup !== p.group ? p.subGroup : (p.group || "Pattern"),
        raw: p,
      }));
      return { families: ordered, items };
    }
    if (cat === "stamps") {
      const fams = ["All", ...new Set(stampCatalog.map((s) => s.group || "Stamps"))];
      const items = stampCatalog.map((s) => ({
        assetKind: "stamp",
        key: `stp:${s.id}`,
        id: s.id,
        name: s.name,
        family: s.group || "Stamps",
        sub: s.group || "Decal",
        raw: s,
      }));
      return { families: fams, items };
    }
    if (cat === "brushes") {
      const fams = ["All", ...new Set(BRUSH_TIP_ASSETS.map((b) => b.group))];
      const items = BRUSH_TIP_ASSETS.map((b) => ({
        assetKind: "brush",
        key: `br:${b.id}`,
        id: b.id,
        name: b.name,
        family: b.group,
        sub: b.tool ? `Tool: ${b.tool}` : `Tip: ${b.tip}`,
        raw: b,
      }));
      return { families: fams, items };
    }
    const fams = ["All", ...new Set(meshAssets.map((m) => m.group))];
    const items = meshAssets.map((m) => ({
      assetKind: "mesh",
      key: `mesh:${m.id}`,
      id: m.id,
      name: m.name,
      family: m.group,
      sub: m.bakeId ? "High/Low Pair" : "Paint Target",
      raw: m,
    }));
    return { families: fams, items };
  }

  function updateAutoPill() {
    const expected = WORKSPACE_ASSET_CATEGORY[state.activeWorkspaceId] || "materials";
    const expectedLabel = CATEGORIES.find((c) => c.id === expected)?.label || expected;
    autoBtn.innerHTML = "";
    autoBtn.append(ConstructGlyph("Pin"));
    if (state.userSpecifiedCategory && state.activeCategory !== expected) {
      autoBtn.className = "cb-auto-pill pinned";
      autoBtn.append(Construct("span", null, `Pinned · Reset (${expectedLabel})`));
    } else {
      autoBtn.className = "cb-auto-pill auto-on";
      autoBtn.append(Construct("span", null, `Auto: ${expectedLabel}`));
    }
  }

  function buildPayloadForItem(item) {
    return {
      assetKind: item.assetKind,
      id: item.id,
      name: item.name,
      family: item.family,
      raw: item.raw,
    };
  }

  function render() {
    // 1. Category tabs
    catTabsWrap.innerHTML = "";
    for (const c of CATEGORIES) {
      const btn = Construct("button", "cb-cat-tab" + (state.activeCategory === c.id ? " active" : ""), [
        Construct("span", null, c.label),
        Construct("span", "cb-count", String(c.count)),
      ]);
      btn.type = "button";
      btn.dataset.category = c.id;
      btn.addEventListener("click", () => {
        const expected = WORKSPACE_ASSET_CATEGORY[state.activeWorkspaceId];
        state.activeCategory = c.id;
        state.family = "All";
        state.userSpecifiedCategory = c.id !== expected;
        if (state.collapsed) {
          state.collapsed = false;
          applyDrawerGeometry();
        }
        render();
      });
      catTabsWrap.append(btn);
    }
    updateAutoPill();

    // 2. Family outliner
    const { families, items } = getCategoryFamiliesAndItems(state.activeCategory);
    if (!families.includes(state.family)) state.family = "All";

    const familyCounts = new Map([["All", items.length]]);
    for (const it of items) familyCounts.set(it.family, (familyCounts.get(it.family) || 0) + 1);

    familyCol.innerHTML = "";
    for (const fam of families) {
      const isAfrican = fam === "African Patterns" || fam === "African Motifs";
      const fb = Construct(
        "button",
        "cb-family-btn" + (state.family === fam ? " active" : "") + (isAfrican ? " featured" : ""),
        [
          Construct("span", null, isAfrican ? `${fam} ★` : fam),
          Construct("small", null, String(familyCounts.get(fam) || 0)),
        ],
      );
      fb.type = "button";
      fb.dataset.family = fam;
      fb.addEventListener("click", () => {
        state.family = fam;
        render();
      });
      familyCol.append(fb);
    }

    // 3. Filtered grid cards
    const q = state.search.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (state.family !== "All" && it.family !== state.family) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.family.toLowerCase().includes(q) ||
        it.sub.toLowerCase().includes(q)
      );
    }).slice(0, 120);

    gridEl.innerHTML = "";
    for (const item of filtered) {
      const card = Construct("button", "cb-card" + (state.activeAssetKey === item.key ? " active" : ""));
      card.type = "button";
      card.draggable = true;
      card.dataset.assetKind = item.assetKind;
      card.dataset.assetId = item.id;
      card.title = `${item.name} (${item.family}) — Click to apply or drag onto canvas`;

      const thumb = Construct("div", "cb-thumb");
      if (item.assetKind === "material") {
        const m = item.raw;
        const sphere = Construct("div", "cb-mat-sphere");
        const shine = Math.round((1 - Math.min(0.95, m.roughness ?? 0.5)) * 45 + (m.metalness ?? 0) * 28);
        sphere.style.background = `radial-gradient(circle at 34% 30%, rgba(255,255,255,${0.12 + shine / 140}) 0%, ${m.color || "#888"} 48%, #101216 100%)`;
        thumb.append(sphere);
      } else if (item.assetKind === "pattern") {
        thumb.innerHTML = getArtworkPreviewSvg(item.raw, "pattern", 60);
      } else if (item.assetKind === "stamp") {
        thumb.innerHTML = getArtworkPreviewSvg(item.raw, "stamp", 60);
      } else if (item.assetKind === "brush") {
        thumb.innerHTML = buildBrushTipSvg(item.raw);
      } else {
        thumb.innerHTML = buildMeshSvg(item.id);
      }

      card.append(
        thumb,
        Construct("span", "cb-card-name", item.name),
        Construct("span", "cb-card-sub", item.sub),
      );

      card.addEventListener("dragstart", (e) => {
        const payload = buildPayloadForItem(item);
        appBridge.activeDragAsset = payload;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copy";
          try {
            e.dataTransfer.setData("application/x-frontier-asset", JSON.stringify(payload));
            e.dataTransfer.setData("text/plain", JSON.stringify({ id: payload.id, assetKind: payload.assetKind, name: payload.name }));
          } catch {}
        }
      });
      card.addEventListener("dragend", () => {
        setTimeout(() => {
          if (appBridge.activeDragAsset?.id === item.id) appBridge.activeDragAsset = null;
        }, 60);
      });
      card.addEventListener("click", () => {
        state.activeAssetKey = item.key;
        render();
        appBridge.applyAssetToActiveWorkspace?.(buildPayloadForItem(item), { source: "click" });
      });

      gridEl.append(card);
    }
  }

  searchInp.addEventListener("input", () => {
    state.search = searchInp.value;
    render();
  });

  autoBtn.addEventListener("click", () => {
    state.userSpecifiedCategory = false;
    state.activeCategory = WORKSPACE_ASSET_CATEGORY[state.activeWorkspaceId] || "materials";
    state.family = "All";
    render();
  });

  render();
  applyDrawerGeometry();

  return {
    setActiveWorkspace(wsId) {
      state.activeWorkspaceId = wsId;
      if (!state.userSpecifiedCategory) {
        const nextCat = WORKSPACE_ASSET_CATEGORY[wsId] || "materials";
        if (state.activeCategory !== nextCat) {
          state.activeCategory = nextCat;
          state.family = "All";
        }
      }
      render();
    },
    setCategory(catId, { userSpecified = true, family = null } = {}) {
      if (!CATEGORIES.some((c) => c.id === catId)) return;
      state.activeCategory = catId;
      state.userSpecifiedCategory = userSpecified;
      if (family !== null) state.family = family;
      else state.family = "All";
      if (state.collapsed) {
        state.collapsed = false;
        applyDrawerGeometry();
      }
      render();
    },
    setFamily(familyName) {
      state.family = familyName;
      render();
    },
    setHeight(h) {
      setDrawerHeight(h);
    },
    getState() {
      return {
        activeWorkspaceId: state.activeWorkspaceId,
        activeCategory: state.activeCategory,
        userSpecifiedCategory: state.userSpecifiedCategory,
        family: state.family,
        collapsed: state.collapsed,
        heightPx: state.collapsed ? MIN_H : state.heightPx,
        renderedCount: gridEl.children.length,
        africanCount: patternCatalog.filter((p) => p.group === "African Patterns").length,
      };
    },
    getAssetPayload(kind, id) {
      const cat = kind === "material" ? "materials" : kind === "pattern" ? "patterns" : kind === "stamp" ? "stamps" : kind === "brush" ? "brushes" : "meshes";
      const { items } = getCategoryFamiliesAndItems(cat);
      const found = items.find((it) => it.id === id || it.name === id);
      return found ? buildPayloadForItem(found) : null;
    },
    dispose() {
      drawer.remove();
    },
  };
}
