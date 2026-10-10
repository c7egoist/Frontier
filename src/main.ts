import { insertConnectedBridge } from "./core/bridge-insertion";
import { railStyles, railNames } from "./core/model";
import { assetThumbnail } from "./render/thumbnails";
import { normaliseDetail, type GeometryDetail } from "./core/quality";
import { templateCatalog } from "./core/templates";
import {
  siteCatalog,
  makeSite,
  siteOutline,
  type Site,
  type SiteKind,
} from "./core/sites";
import { parkingLayout, parkingPlan } from "./core/site-geometry";
import "./style.css";
import "./ui/slate-editor.css";
import { zipSync, strToU8 } from "fflate";
import {
  makeDemo,
  makeTemplate,
  parseProject,
  validateGenerationBudget,
  presets,
  patterns,
  patternNames,
  roadDefaults,
  roadHalfWidth,
  uid,
  connected,
  getNode,
  controlPoints,
  type Project,
  type Selection,
  type Road,
  type RoadSettings,
  type Pattern,
} from "./core/model";
import { add, sub, cubic, polygonArea, type V3 } from "./core/math";
import { stationForParameter } from "./core/footways";
import { buildNetwork, type Network } from "./core/geometry";
import {
  insertRoad,
  moveNode,
  translateRoad,
  resolveCrossings,
  deleteSelection,
} from "./core/editing";
import { exportOBJ, exportMeshManifest } from "./core/export";
import { PlanView, type EditDrag, type ToolMode } from "./render/plan";
import { SceneView, type GizmoProjection } from "./render/scene";
import { patternCanvas, exportTexturePack } from "./render/materials";
import { refreshIcons, icon, escape, jointSketch } from "./ui/icons";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const STORAGE = "frontier.road-studio.v1";
let project = makeDemo(),
  restored = false;
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) {
    project = parseProject(JSON.parse(saved));
    restored = true;
  }
} catch {
  /* Corrupt storage never prevents opening the studio. */
}
let geometryDetail: GeometryDetail = "editing";
let network: Network = buildNetwork(project, { detail: geometryDetail });
let selection: Selection = {
  kind: "node",
  id: network.junctions[0]?.node.id ?? project.nodes[0]?.id,
};
if (!selection.id) selection = null;
let mode: ToolMode = "select",
  inspectorTab = "geometry",
  libraryTab = "roads",
  presetID = "urban";
let snapEnabled = true,
  gridEnabled = true,
  labelsEnabled = true,
  contextEnabled = true,
  night = false;
let draft: V3 | null = null,
  dirty = false,
  saveTimer: ReturnType<typeof setTimeout> | undefined,
  toastTimer: ReturnType<typeof setTimeout> | undefined;
const undo: string[] = [],
  redo: string[] = [];
const collapsedGroups = new Set<string>();
let activeDriveway = 0;
const hiddenLayers = new Set<string>();
let dragBefore: string | null = null,
  dragBase: Project | null = null,
  sliderBefore: string | null = null;
let scene: SceneView | undefined;
const patternPreviews = new Map<string, string>();
const templates = templateCatalog;
let placementKind: SiteKind = "parking";
const templatePreviews = new Map<string, string>();
const fmt = (n: number, decimals = 1) =>
  n.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const snapshot = () => JSON.stringify(project);
const clone = (p: Project) => JSON.parse(JSON.stringify(p)) as Project;
function selectedRoads(): Road[] {
  if (!selection || selection.kind === "site") return [];
  return selection.kind === "road"
    ? project.roads.filter((r) => r.id === selection!.id)
    : connected(project, selection.id);
}
function selectedPosition(): V3 | null {
  if (!selection) return null;
  if (selection.kind === "node")
    return getNode(project, selection.id)?.position ?? null;
  if (selection.kind === "site")
    return project.sites?.find((s) => s.id === selection!.id)?.position ?? null;
  const road = selectedRoads()[0];
  return road ? cubic(controlPoints(project, road), 0.5) : null;
}
function selectedName() {
  if (!selection) return "Road network";
  if (selection.kind === "site")
    return project.sites?.find((s) => s.id === selection!.id)?.name ?? "Site";
  return selection.kind === "node"
    ? (getNode(project, selection.id)?.name ?? "Control point")
    : (selectedRoads()[0]?.name ?? "Road");
}
function patternPreview(pattern: string) {
  if (!patternPreviews.has(pattern))
    patternPreviews.set(pattern, patternCanvas(pattern as Pattern).toDataURL());
  return patternPreviews.get(pattern)!;
}

const plan = new PlanView(
  $("plan-host"),
  setSelection,
  handleDrag,
  drawPoint,
  (n) => {
    $("zoom-reset").textContent = `${n}%`;
  },
  (p) => {
    if (p)
      $("plan-coordinate").innerHTML = `X ${fmt(p[0])} &nbsp; Z ${fmt(p[2])}`;
  },
);
try {
  scene = new SceneView($("scene-host"), setSelection, updateGizmo);
  scene.setNetwork(project, network, true);
} catch (error) {
  $("scene-host").innerHTML =
    `<div class="no-selection"><h2>3D preview unavailable</h2><p>This browser could not start WebGL. The 2D editor and OBJ export still work.</p></div>`;
  console.error(error);
}
plan.setProject(project, network);
plan.setSelection(selection);
scene?.setSelection(selection);
refreshIcons();
renderAll();
requestAnimationFrame(() => {
  plan.fit();
  scene?.fit(1.13);
  scene?.focusSelection(140);
});
document.fonts.ready.then(() => plan.render());
if (restored)
  $("save-state").innerHTML = '<span class="status-dot"></span>Saved locally';

function toast(message: string, error = false) {
  clearTimeout(toastTimer);
  const element = $("toast");
  element.classList.toggle("error", error);
  element.hidden = false;
  element.querySelector("span")!.textContent = message;
  toastTimer = setTimeout(() => (element.hidden = true), error ? 5500 : 3300);
}
function markDirty() {
  dirty = true;
  $("save-state").classList.add("dirty");
  $("save-state").innerHTML = '<span class="status-dot"></span>Saving locally…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(false), 700);
}
function saveProject(notify = true) {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE, snapshot());
    dirty = false;
    $("save-state").classList.remove("dirty", "error");
    $("save-state").innerHTML = '<span class="status-dot"></span>Saved locally';
    if (notify) toast("Project saved in this browser.");
  } catch {
    $("save-state").classList.add("error");
    $("save-state").innerHTML = '<span class="status-dot"></span>Not saved';
    toast(
      "Local storage is unavailable. Export JSON to keep your project.",
      true,
    );
  }
}
function remember(before: string) {
  if (before === snapshot()) return;
  undo.push(before);
  if (undo.length > 60) undo.shift();
  redo.length = 0;
  markDirty();
  updateHistory();
}
function commit(
  mutate: () => void,
  options: { resolve?: boolean; fit?: boolean } = {},
) {
  const before = snapshot(),
    beforeSelection = selection ? { ...selection } : null;
  try {
    mutate();
    if (options.resolve) resolveCrossings(project);
    rebuild(true, options.fit);
    if (options.fit) {
      plan.fit();
      scene?.fit();
    }
    remember(before);
    return true;
  } catch (error) {
    project = JSON.parse(before);
    selection = beforeSelection;
    rebuild(true);
    console.warn("Road edit failed:", error);
    toast(
      error instanceof Error ? error.message : "Unable to update this network.",
      true,
    );
    return false;
  }
}
function rebuild(inspector = true, context = false) {
  const start = performance.now();
  network = buildNetwork(project, { detail: geometryDetail });
  if (
    selection &&
    !(
      selection.kind === "node"
        ? project.nodes
        : selection.kind === "site"
          ? (project.sites ?? [])
          : project.roads
    ).some((item) => item.id === selection!.id)
  )
    selection = null;
  plan.setProject(project, network);
  plan.setSelection(selection);
  scene?.setNetwork(project, network, context);
  scene?.setSelection(selection);
  scene?.setStyle(($("shade-style") as HTMLSelectElement).value);
  for (const layer of hiddenLayers) {
    scene?.setDetailLayer(layer, false);
    plan.setDetailLayer(layer, false);
  }
  window.dispatchEvent(
    new CustomEvent("frontier:change", {
      detail: {
        project: clone(project),
        meshes: network.meshes,
        diagnostics: network.diagnostics,
        services: network.services,
        footways: network.footways,
        plantings: network.plantings,
        blocks: network.blocks,
        mobility: network.mobility,
        bridges: network.bridges,
        barriers: network.barriers,
        splitters: network.splitters,
        streetDetails: network.streetDetails,
      },
    }),
  );
  updateStats();
  const clearanceOwners = new Set(selectedRoads().map((r) => r.id)),
    currentClearances = network.clearances.filter(
      (c) => clearanceOwners.has(c.a) || clearanceOwners.has(c.b),
    );
  document
    .querySelectorAll<HTMLOutputElement>("[data-bridge-clearance]")
    .forEach((o) => {
      o.value = currentClearances.length
        ? `${fmt(Math.min(...currentClearances.map((c) => c.meters)), 2)} m`
        : "—";
    });
  const radiusOut =
      document.querySelector<HTMLOutputElement>("[data-radius-fit]"),
    joint = network.junctions.find((j) => j.node.id === selection?.id);
  if (radiusOut && joint) radiusOut.value = fmt(joint.radius, 2);
  const ownerIDs = new Set([
    selection?.id,
    ...selectedRoads().map((r) => r.id),
  ]);
  document
    .querySelectorAll<HTMLOutputElement>("[data-mobility-stat]")
    .forEach(
      (o) =>
        (o.value = String(
          network.mobility.filter((f) => ownerIDs.has(f.owner)).length,
        )),
    );
  document
    .querySelectorAll<HTMLOutputElement>("[data-planting-stat]")
    .forEach(
      (o) =>
        (o.value = String(
          network.plantings.filter((f) => ownerIDs.has(f.owner)).length,
        )),
    );
  const serviceOwners = new Set([
      selection?.id,
      ...selectedRoads().map((r) => r.id),
    ]),
    features = network.services.filter((s) => serviceOwners.has(s.owner));
  document
    .querySelectorAll<HTMLOutputElement>("[data-service-stat]")
    .forEach(
      (out) =>
        (out.value = String(
          features
            .filter((s) => s.kind === out.dataset.serviceStat)
            .reduce((n, s) => n + (s.ports ?? 1), 0),
        )),
    );
  document
    .querySelectorAll<HTMLOutputElement>("[data-footway-stat]")
    .forEach(
      (out) =>
        (out.value = String(
          network.footways.filter(
            (f) =>
              serviceOwners.has(f.owner) && f.kind === out.dataset.footwayStat,
          ).length,
        )),
    );
  document
    .querySelectorAll<HTMLOutputElement>("[data-footway-grade]")
    .forEach(
      (out) =>
        (out.value = fmt(
          Math.max(
            0,
            ...network.footways
              .filter(
                (f) =>
                  serviceOwners.has(f.owner) &&
                  f.kind === out.dataset.footwayGrade,
              )
              .map((f) => f.slope),
          ),
          1,
        )),
    );
  if (inspector) {
    renderOutliner();
    renderInspector();
    updateNames();
  } else syncPositionInputs();
  $("rebuild-button").title =
    `Last build: ${(performance.now() - start).toFixed(0)} ms · ${network.meshes.length} mesh groups`;
}
function renderAll() {
  updateNames();
  renderOutliner();
  renderInspector();
  renderLibrary();
  updateStats();
  updateHistory();
  refreshIcons();
}
function updateHistory() {
  ($("undo-button") as HTMLButtonElement).disabled = !undo.length;
  ($("redo-button") as HTMLButtonElement).disabled = !redo.length;
  document.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled =
    !undo.length;
  document.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled =
    !redo.length;
}
function undoProject() {
  if (!undo.length) return;
  redo.push(snapshot());
  project = JSON.parse(undo.pop()!);
  draft = null;
  plan.setDraft(null);
  rebuild(true, true);
  updateHistory();
  markDirty();
  toast("Undo applied.");
}
function redoProject() {
  if (!redo.length) return;
  undo.push(snapshot());
  project = JSON.parse(redo.pop()!);
  draft = null;
  plan.setDraft(null);
  rebuild(true, true);
  updateHistory();
  markDirty();
  toast("Redo applied.");
}
function updateNames() {
  $("project-title").textContent = project.name;
  $("scene-name").textContent = project.name;
  $("selected-annotation").innerHTML = selection
    ? `${escape(selectedName().split(" · ")[0])}<small>${selection.kind === "node" ? "SHARED JOINT PIVOT" : selection.kind === "site" ? "PROCEDURAL SURFACE" : "EDITABLE ROAD ALIGNMENT"}</small>`
    : "Road network<small>LIVE PROCEDURAL GEOMETRY</small>";
  $("scene-annotation").hidden = !selection;
}
function setGeometryDetail(value: GeometryDetail) {
  const before = geometryDetail;
  geometryDetail = normaliseDetail(value);
  try {
    rebuild(true);
    ($("geometry-detail") as HTMLSelectElement).value = geometryDetail;
    toast(
      `${geometryDetail === "production" ? "Production" : "Editing"} mesh · ${compact(network.triangles)} triangles. Road topology unchanged.`,
    );
  } catch (error) {
    geometryDetail = before;
    rebuild(true);
    ($("geometry-detail") as HTMLSelectElement).value = before;
    toast(
      error instanceof Error
        ? error.message
        : "Could not regenerate this mesh profile.",
      true,
    );
  }
}
function setSelection(s: Selection) {
  if (s?.id !== selection?.id) activeDriveway = 0;
  if (
    s &&
    !(
      s.kind === "node"
        ? project.nodes
        : s.kind === "site"
          ? (project.sites ?? [])
          : project.roads
    ).some((item) => item.id === s!.id)
  )
    s = null;
  selection = s;
  plan.setSelection(s);
  scene?.setSelection(s);
  renderOutliner();
  renderInspector();
  updateNames();
  updateHint();
}
function setMode(m: ToolMode) {
  mode = m;
  plan.setMode(m);
  draft = null;
  plan.setDraft(null);
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
    const active = b.dataset.tool === m;
    b.setAttribute("aria-pressed", String(active));
    b.classList.toggle("active", active);
  });
  if (
    (m === "draw" || m === "place") &&
    $("viewports").dataset.layout === "scene"
  )
    setLayout("split");
  renderInspector();
  updateHint();
}
function updateHint() {
  const hints: Record<ToolMode, string> = {
    select:
      selection?.kind === "site"
        ? "Drag the footprint pivot to reposition the procedural surface"
        : selection?.kind === "road"
          ? "Drag a Bézier handle or the shared road pivot to edit the alignment"
          : "Drag the joint pivot to move all connected roads",
    draw: draft
      ? "Click to extend the road · Esc to finish · Alt disables snapping"
      : "Click in the 2D plan to start a road · Existing curves and nodes snap",
    move: "Drag the shared pivot or an axis to move · Shift constrains movement",
    pan: "Drag to pan the plan · Scroll to zoom · Space temporarily pans",
    measure: "Click two points in the plan to measure their distance",
    place: `Click in plan to place ${siteCatalog.find((s) => s.id === placementKind)!.name.toLowerCase()} · Esc to cancel`,
  };
  $("interaction-hint").textContent = hints[mode];
}
function setLayout(layout: string) {
  $("viewports").dataset.layout = layout;
  document
    .querySelectorAll<HTMLButtonElement>("[data-layout]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.layout === layout)),
    );
}
function updateStats() {
  syncSiteMetrics();
  const error = network.diagnostics.some((d) => d.level === "error"),
    warn = network.diagnostics.length > 0;
  $("status-health").textContent = error
    ? "Check junction geometry"
    : warn
      ? "Review geometry warnings"
      : "Network valid";
  $("status-counts").textContent =
    `${project.roads.length} roads · ${network.junctions.length} joints${project.sites?.length ? ` · ${project.sites.length} sites` : ""}`;
  $("status-triangles").textContent = `${compact(network.triangles)} triangles`;
  $("status-length").textContent =
    `${Math.round(network.length).toLocaleString()} m`;
  $("object-count").textContent = String(
    project.roads.length +
      network.junctions.length +
      (project.sites?.length ?? 0),
  ).padStart(2, "0");
  $("health-card").classList.toggle("warning", warn);
  $("health-card").innerHTML =
    `${icon(warn ? "circle-alert" : "circle-check")}<div><strong>${error ? "Geometry needs attention" : warn ? "Review network" : "Clean topology"}</strong><p>${warn ? escape(network.diagnostics[0].message) : "Shared boundaries · Grade-aware"}</p></div>`;
  const relevant = network.diagnostics.filter(
    (d) =>
      !selection ||
      !d.owner ||
      d.owner === selection.id ||
      selectedRoads().some((r) => r.id === d.owner),
  );
  const text =
    selection?.kind === "site"
      ? (() => {
          const s = project.sites!.find((s) => s.id === selection!.id)!;
          return `${Math.round(Math.abs(polygonArea(siteOutline(s))))} m² surface${s.kind === "parking" ? ` · ${parkingLayout(s).length} stalls in this lot` : ""}`;
        })()
      : selection?.kind === "node"
        ? `${connected(project, selection.id).length} connected approaches`
        : selection
          ? `${fmt(network.spans.find((s) => s.road.id === selection!.id)?.alignment.length ?? 0)} m alignment`
          : "Linked 2D + 3D geometry";
  $("selection-health").innerHTML =
    `<div class="selection-health ${relevant.length ? "warning" : ""}">${icon(relevant.length ? "circle-alert" : "circle-check")}<span>${relevant.length ? "Geometry warning" : text}<small>${relevant.length ? escape(relevant[0].message) : selection?.kind === "node" ? "One pivot. Every connection follows." : "Meters · Y-up · Engine-ready mesh"}</small></span></div>`;
  refreshIcons();
}
function syncSiteMetrics() {
  if (selection?.kind !== "site") return;
  const site = project.sites?.find((s) => s.id === selection!.id);
  if (!site) return;
  document
    .querySelectorAll<HTMLOutputElement>("[data-site-area]")
    .forEach(
      (o) =>
        (o.value = String(
          Math.round(Math.abs(polygonArea(siteOutline(site)))),
        )),
    );
  if (site.kind !== "parking") return;
  const p = parkingPlan(site);
  document
    .querySelectorAll<HTMLElement>('[data-site-stat="capacity"]')
    .forEach((e) => (e.textContent = `${p.bays.length} stalls`));
  document
    .querySelectorAll<HTMLElement>('[data-site-stat="islands"]')
    .forEach((e) => (e.textContent = String(p.islands.length)));
  document
    .querySelectorAll<HTMLElement>('[data-site-stat="rows"]')
    .forEach((e) => (e.textContent = `${p.rows} rows`));
}
function renderOutliner() {
  const query = ($("scene-search") as HTMLInputElement).value.toLowerCase();
  const groups = [
    {
      id: "junctions",
      name: "Junctions",
      items: network.junctions.map((j) => ({
        id: j.node.id,
        name: j.node.name,
        kind: "node" as const,
        icon: "git-fork",
        meta: j.type,
      })),
    },
    {
      id: "roads",
      name: "Road alignments",
      items: project.roads.map((r) => ({
        id: r.id,
        name: r.name,
        kind: "road" as const,
        icon: r.bridge ? "cable" : "route",
        meta: r.bridge ? "BRG" : `${r.lanes}L`,
      })),
    },
    {
      id: "sites",
      name: "Parking & paving",
      items: (project.sites ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        kind: "site" as const,
        icon: siteCatalog.find((k) => k.id === s.kind)!.icon,
        meta:
          s.kind === "parking"
            ? `${parkingLayout(s).length} bays`
            : s.kind.toUpperCase(),
      })),
    },
  ];
  let html = "";
  for (const group of groups) {
    const items = group.items.filter((i) =>
      (i.name + " " + i.meta).toLowerCase().includes(query),
    );
    if (!items.length && query) continue;
    html += `<div class="tree-group"><button class="tree-group-heading" data-group="${group.id}" aria-expanded="${!collapsedGroups.has(group.id)}">${icon(collapsedGroups.has(group.id) ? "chevron-right" : "chevron-down")}${group.name}<span class="group-count">${String(items.length).padStart(2, "0")}</span></button><div class="tree-list ${collapsedGroups.has(group.id) && !query ? "collapsed" : ""}" role="tree" aria-label="${group.name}">${items.map((item) => `<div role="treeitem" tabindex="0" class="tree-row ${selection?.id === item.id && selection.kind === item.kind ? "selected" : ""}" aria-selected="${selection?.id === item.id && selection.kind === item.kind}" data-select="${escape(item.id)}" data-kind="${item.kind}" title="${escape(item.name)}">${icon(item.icon)}<span class="tree-name">${escape(item.name)}</span><span class="tree-meta">${item.meta}</span></div>`).join("")}</div></div>`;
  }
  $("scene-tree").innerHTML =
    html ||
    '<p class="empty-tree">No matching objects.<br>Try another name or clear the search.</p>';
  refreshIcons();
}
function range(
  prop: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit = "m",
) {
  return `<div class="control"><div class="control-line"><label for="control-${prop}">${label}</label><output data-output="${prop}">${fmt(value, step < 0.1 ? 2 : step < 1 ? 1 : 0)}${unit ? `<small>${unit}</small>` : ""}</output></div><input id="control-${prop}" type="range" data-prop="${prop}" min="${min}" max="${max}" step="${step}" value="${value}" style="--progress:${((value - min) / (max - min)) * 100}%"/></div>`;
}
function toggle(prop: string, label: string, value: boolean, description = "") {
  return `<div class="toggle-row"><div class="toggle-label">${label}${description ? `<small>${description}</small>` : ""}</div><label class="switch"><input type="checkbox" data-prop="${prop}" aria-label="${label}" ${value ? "checked" : ""}/><span></span></label></div>`;
}
function card(title: string, iconName: string, body: string, extraClass = "") {
  return `<section class="inspector-card ${extraClass}"><div class="card-heading"><span>${icon(iconName)}${title}</span>${icon("info")}</div>${body}</section>`;
}
function choice(
  prop: string,
  label: string,
  value: string,
  options: [string, string][],
) {
  return `<div class="profile-row"><label for="control-${prop}">${label}</label><div class="select-field"><select id="control-${prop}" data-prop="${prop}">${options.map(([key, name]) => `<option value="${key}" ${value === key ? "selected" : ""}>${name}</option>`).join("")}</select>${icon("chevron-down")}</div></div>`;
}
function patternControls(pattern: Pattern) {
  return `<div class="pattern-options">${patterns.map((p) => `<button class="pattern-option ${p === pattern ? "selected" : ""}" data-pattern="${p}"><span class="pattern-thumb" style="background-image:url('${patternPreview(p)}')"></span>${patternNames[p]}</button>`).join("")}</div>`;
}
function transformControls(position: V3, note: string) {
  return card(
    "Transform",
    "move",
    `<div class="transform-fields">${["X", "Y", "Z"].map((axis, i) => `<label class="transform-field"><span>${axis}</span><input type="number" data-position="${i}" value="${position[i].toFixed(1)}" step=".5" min="-10000" max="10000" aria-label="${axis} position"/></label>`).join("")}</div><p class="card-note">${icon("move")}${note}</p>`,
  );
}
function renderSiteInspector(site: Site) {
  const entry = siteCatalog.find((s) => s.id === site.kind)!,
    area = Math.round(Math.abs(polygonArea(siteOutline(site))));
  let body = `<div class="selected-object"><div class="object-icon">${icon(entry.icon)}</div><div class="object-title"><span class="eyebrow">${site.kind === "parking" ? "PROCEDURAL LAYOUT" : site.kind === "tree-pit" ? "EMPTY PLANTING OPENING" : site.kind === "urban-block" ? "BLOCK PERIMETER" : "PAVING GEOMETRY"}</span><h1>${escape(site.name)}</h1><span class="type-pill"><span></span><output data-site-area>${area}</output> m² / <output data-site-stat="capacity">${site.kind === "parking" ? `${parkingLayout(site).length} stalls` : "metric surface"}</output></span></div><button class="icon-button object-actions" data-inspector-action="rename" aria-label="Rename selected object">${icon("settings-2")}</button></div><nav class="inspector-tabs">${["geometry", "surface", "details"].map((t) => `<button data-inspector-tab="${t}" class="${inspectorTab === t ? "active" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</nav>`;
  if (inspectorTab === "geometry") {
    body += transformControls(
      site.position,
      "Independent footprint / metres, Y-up.",
    );
    body += card(
      "Footprint",
      entry.icon,
      (site.kind === "tree-pit"
        ? ""
        : choice("shape", "Boundary", site.shape, [
            ["rectangle", "Rounded rectangle"],
            ["triangle", "Triangle"],
            ["circle", "Ellipse"],
          ]) +
          range(
            "cornerRadius",
            "Corner rounding",
            site.cornerRadius,
            0.05,
            10,
            0.05,
          )) +
        range(
          "width",
          "Width",
          site.width,
          site.kind === "tree-pit" ? 0.8 : 8,
          site.kind === "tree-pit" ? 6 : 180,
          site.kind === "tree-pit" ? 0.1 : 1,
        ) +
        range(
          "depth",
          "Depth",
          site.depth,
          site.kind === "tree-pit" ? 0.8 : 8,
          site.kind === "tree-pit" ? 8 : 300,
          site.kind === "tree-pit" ? 0.1 : 1,
        ) +
        range("yaw", "Rotation", site.yaw, -180, 180, 5, "°"),
    );
    if (site.kind === "urban-block")
      body += card(
        "Block perimeter",
        "layout-template",
        range("blockBand", "Frontage band", site.blockBand, 1, 8, 0.1) +
          choice("blockInterior", "Courtyard / plot", site.blockInterior, [
            ["open", "Open — no surface / buildings"],
            ["paved", "Paved courtyard"],
          ]) +
          `<p class="card-note"><span>Metric perimeter ring with inset borders. Keep the interior open for a parking court or your own engine architecture. No buildings are generated.</span></p>`,
      );
    if (site.kind === "parking")
      body += card(
        "Module solver",
        "square-parking",
        choice("parkingLayout", "Row layout", site.parkingLayout, [
          ["automatic", "Automatic modules"],
          ["double", "Double-loaded aisle"],
          ["single", "Single-loaded aisle"],
        ]) +
          choice("parkingAngle", "Bay angle", String(site.parkingAngle), [
            ["90", "90°"],
            ["60", "60°"],
            ["45", "45°"],
          ]) +
          range("bayWidth", "Bay width", site.bayWidth, 2.4, 3.6, 0.1) +
          range("bayDepth", "Bay depth", site.bayDepth, 4.5, 6.5, 0.1) +
          range("aisleWidth", "Drive aisle", site.aisleWidth, 4, 9, 0.1) +
          `<div class="layout-metrics"><div><strong data-site-stat="capacity">${parkingLayout(site).length} stalls</strong><span>GENERATED CAPACITY</span></div><div><strong data-site-stat="rows">${parkingPlan(site).rows} rows</strong><span>CONNECTED MODULES</span></div></div><p class="card-note">Rows and capacity regenerate from the footprint. Entry and transfer clearances are excluded from stall placement.</p>`,
      );
  } else if (inspectorTab === "surface")
    body += card(
      "Paving material",
      "grid-2x2",
      (site.kind === "tree-pit"
        ? '<p class="material-note">Recessed soil, flush concrete rim and optional slotted iron grate. The opening is real geometry, not a soil decal.</p>'
        : patternControls(site.pattern)) +
        (site.kind === "parking"
          ? choice("bayFinish", "Parking bay finish", site.bayFinish, [
              ["asphalt", "Asphalt"],
              ["permeable", "Permeable pavers"],
              ["concrete", "Concrete slabs"],
            ])
          : "") +
        `<p class="material-note">World-scale UVs / albedo, normal and roughness channels. No buildings or decorative props.</p>`,
    );
  else {
    if (site.kind !== "tree-pit" && site.kind !== "urban-block")
      body += card(
        "Edge construction",
        "route",
        range(
          "perimeterWidth",
          "Perimeter paving",
          site.perimeterWidth,
          0.3,
          4,
          0.1,
        ),
      );
    if (site.kind === "parking")
      body += card(
        "Circulation & markings",
        "square-parking",
        choice("entrance", "Entry side", site.entrance, [
          ["north", "North"],
          ["south", "South"],
          ["east", "East"],
          ["west", "West"],
        ]) +
          range(
            "entryWidth",
            "Entry clearance",
            site.entryWidth,
            3.5,
            10,
            0.1,
          ) +
          range(
            "accessible",
            "Accessible stalls",
            site.accessible,
            0,
            6,
            1,
            "",
          ) +
          toggle(
            "numbering",
            "Bay numbering",
            site.numbering,
            "Optional stencil decals",
          ) +
          range("bays", "Row cap / 0 = auto", site.bays, 0, 70, 1, "") +
          range("paintWear", "Paint wear", site.paintWear, 0, 0.35, 0.05, ""),
      );
  }
  if (site.kind === "tree-pit")
    body += card(
      "Future tree growing space",
      "square-dashed",
      toggle(
        "pitGrate",
        "Slotted iron grate",
        site.pitGrate,
        "Root opening and real drainage slots; no tree",
      ) +
        `<p class="card-note"><span>160 mm soil recess below the frame. Place this independent piece outside an existing solid paving sheet; road pits automatically cut their footways.</span></p><button class="solver-badge" data-inspector-action="inspect-planting">${icon("search")}Inspect the opening</button>`,
    );
  if (site.kind === "urban-block" && inspectorTab === "details")
    body += card(
      "Vehicle gateway",
      "corner-up-right",
      choice("blockEntrySide", "Gateway side", site.blockEntrySide, [
        ["north", "North"],
        ["south", "South"],
        ["east", "East"],
        ["west", "West"],
      ]) +
        range(
          "blockEntryWidth",
          "Clear gate / 0 = closed",
          site.blockEntryWidth,
          0,
          12,
          0.5,
        ) +
        `<p class="card-note"><span>A real cut through the frontage ring and plinth. Align a road driveway/apron with a separate parking entry. The European mobility quarter includes four aligned examples.</span></p>`,
    );
  if (site.kind === "parking" && inspectorTab === "details")
    body += card(
      "Modern parking modules",
      "square-dashed",
      toggle(
        "parkingIslands",
        "Empty planting islands",
        site.parkingIslands,
        "Replace periodic normal bays; never an aisle / transfer zone",
      ) +
        (site.parkingIslands
          ? range(
              "islandEvery",
              "Island interval",
              site.islandEvery,
              3,
              12,
              1,
              "",
            )
          : "") +
        range("evBays", "EV-reserved bays", site.evBays, 0, 30, 1, "") +
        `<p class="card-note"><span><output data-site-stat="islands">${parkingPlan(site).islands.length}</output> recessed soil islands; no trees. Capacity counts usable bays only. EV spaces are reserved/marked, not charging equipment.</span></p>` +
        (site.parkingIslands
          ? `<button class="solver-badge" data-inspector-action="inspect-planting">${icon("search")}Inspect an island</button>`
          : ""),
    );
  if (site.kind === "parking" && inspectorTab === "details")
    body += card(
      "Drainage & covers",
      "droplets",
      toggle(
        "drainage",
        "Parking drainage",
        site.drainage,
        "Perimeter inlets; kept outside the entry throat",
      ) +
        (site.drainage
          ? `<button class="solver-badge" data-inspector-action="inspect-drain">${icon("search")}Inspect drainage</button>`
          : "") +
        toggle(
          "manholes",
          "Parking manholes",
          site.manholes,
          "Flush covers placed only in connected drive aisles",
        ) +
        (site.manholes
          ? range(
              "manholeDiameter",
              "Cover diameter",
              site.manholeDiameter,
              0.45,
              1,
              0.05,
            ) +
            `<button class="solver-badge" data-inspector-action="inspect-manhole">${icon("search")}Inspect a cover</button>`
          : ""),
    );
  $("inspector-content").innerHTML = body;
  refreshIcons();
  updateStats();
}
function networkPreview(id: string) {
  if (templatePreviews.has(id)) return templatePreviews.get(id)!;
  const p = makeTemplate(id),
    points = p.nodes.map((n) => n.position),
    minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0])),
    minZ = Math.min(...points.map((p) => p[2])),
    maxZ = Math.max(...points.map((p) => p[2])),
    scale = Math.min(164 / (maxX - minX + 40), 66 / (maxZ - minZ + 40));
  const map = (p: V3) =>
    `${90 + (p[0] - (minX + maxX) / 2) * scale},${38 + (p[2] - (minZ + maxZ) / 2) * scale}`;
  const path = (r: Road) => {
    const c = controlPoints(p, r);
    return `M${map(c[0])}C${map(c[1])} ${map(c[2])} ${map(c[3])}`;
  };
  if (id === "europe" || id === "city") {
    const boundary = (s: Site, inset = 0) =>
        `M${siteOutline(s, inset).map(map).join("L")}Z`,
      plots = (p.sites ?? [])
        .map((s) =>
          s.kind === "urban-block"
            ? `<path d="${boundary(s)}${boundary(s, s.blockBand)}" fill="#99999977" fill-rule="evenodd"/>`
            : `<polygon points="${siteOutline(s).map(map).join(" ")}" fill="#383838" stroke="#777" stroke-width=".3"/>`,
        )
        .join(""),
      roads = p.roads
        .map((r) => {
          const motor =
              (r.lanes * r.laneWidth + r.median) / 2 +
              (r.parking === "parallel" ? 2.3 : 0),
            buffer = r.cycleMode === "protected" ? r.cycleSeparator : 0,
            stroke = (color: string, width: number) =>
              `<path d="${path(r)}" stroke="${color}" stroke-width="${width * 2 * scale}" stroke-linecap="round"/>`;
          return (
            stroke("#999", roadHalfWidth(r) + r.sidewalk + 0.22) +
            stroke("#985950", roadHalfWidth(r)) +
            stroke("#bebdb7", motor + buffer) +
            stroke(
              r.sharedCycleStreet
                ? "#985950"
                : r.busLanes === "outer"
                  ? "#87534c"
                  : "#383b3c",
              motor,
            ) +
            (r.busLanes === "outer"
              ? stroke("#383b3c", Math.max(0.05, motor - r.laneWidth))
              : "") +
            `<path d="${path(r)}" stroke="#ccc" stroke-width=".35" stroke-dasharray="1.5 2"/>`
          );
        })
        .join("");
    const svg = `<svg viewBox="0 0 180 76" fill="none" aria-hidden="true">${plots}${roads}</svg>`;
    templatePreviews.set(id, svg);
    return svg;
  }
  const svg = `<svg viewBox="0 0 180 76" fill="none" aria-hidden="true">${(
    p.sites ?? []
  )
    .filter((s) => s.kind !== "water")
    .map(
      (s) =>
        `<polygon points="${siteOutline(s).map(map).join(" ")}" fill="#85858555" stroke="#aaa5" stroke-width=".4"/>`,
    )
    .join(
      "",
    )}${p.roads.map((r) => `<path d="${path(r)}" stroke="#929292" stroke-width="${Math.max(2, (r.lanes * r.laneWidth + 2) * scale)}" stroke-linecap="round"/><path d="${path(r)}" stroke="#363636" stroke-width="${Math.max(1.1, r.lanes * r.laneWidth * scale)}"/><path d="${path(r)}" stroke="#d6d6d6" stroke-width=".45" stroke-dasharray="2 2"/>`).join("")}</svg>`;
  templatePreviews.set(id, svg);
  return svg;
}
function beginPlace(kind: SiteKind) {
  if (!siteCatalog.some((s) => s.id === kind)) {
    toast("Unknown procedural surface.", true);
    return;
  }
  placementKind = kind;
  plan.placementKind = kind;
  setSelection(null);
  setMode("place");
  toast(
    `Click in plan to place a ${siteCatalog.find((s) => s.id === kind)!.name.toLowerCase()}.`,
  );
}
function mobilityControls(road: Road) {
  const owners = new Set(selectedRoads().map((r) => r.id));
  return card(
    "European mobility profile",
    "bike",
    toggle(
      "sharedCycleStreet",
      "Shared cycle street",
      road.sharedCycleStreet,
      "Red full-width carriageway with bicycle stencils; no extra bike lane",
    ) +
      choice("busLanes", "Bus reservation", road.busLanes, [
        ["none", "None"],
        ["outer", "Outer motor lanes"],
      ]) +
      (road.busLanes === "outer"
        ? choice("busSurface", "Bus-lane finish", road.busSurface, [
            ["asphalt", "Standard asphalt"],
            ["red", "Red aggregate"],
          ])
        : "") +
      choice("cycleMode", "Cycle infrastructure", road.cycleMode, [
        ["none", "None"],
        ["painted", "Painted lanes"],
        ["protected", "Protected tracks"],
      ]) +
      (road.cycleMode !== "none"
        ? range(
            "cycleWidth",
            "Cycle width / side",
            road.cycleWidth,
            1.2,
            3.5,
            0.1,
          ) +
          choice("cycleColor", "Cycle surfacing", road.cycleColor, [
            ["red", "Red aggregate"],
            ["green", "Green aggregate"],
            ["asphalt", "Standard asphalt"],
          ]) +
          (road.cycleMode === "protected"
            ? range(
                "cycleSeparator",
                "Protection buffer",
                road.cycleSeparator,
                0.3,
                1.5,
                0.05,
              )
            : "")
        : "") +
      `<p class="card-note"><span>Bus lanes reserve existing motor lanes. Cycle tracks and buffers add width on both sides; separators open at driveways and crossings. <output data-mobility-stat>${network.mobility.filter((m) => owners.has(m.owner)).length}</output> mobility runs on the selection.</span></p>` +
      (road.busLanes !== "none" || road.cycleMode !== "none"
        ? `<button class="solver-badge" data-inspector-action="inspect-mobility">${icon("search")}Inspect mobility detail</button>`
        : ""),
  );
}
function roadPlantingControls(road: Road) {
  const owners = new Set(selectedRoads().map((r) => r.id));
  return card(
    "Empty planting openings",
    "square-dashed",
    toggle(
      "treePits",
      "Footway planting pits",
      road.treePits,
      "Framed soil openings — no trees are generated",
    ) +
      (road.treePits
        ? range("pitWidth", "Pit width", road.pitWidth, 1, 2.5, 0.1) +
          range("pitLength", "Pit length", road.pitLength, 1.4, 4, 0.1) +
          range("pitSpacing", "Pit interval", road.pitSpacing, 8, 32, 1) +
          toggle(
            "pitGrate",
            "Slotted tree grates",
            road.pitGrate,
            "Physical slots and a central future-tree opening",
          ) +
          `<p class="card-note"><span><output data-planting-stat>${network.plantings.filter((p) => owners.has(p.owner)).length}</output> empty pits. Placement keeps at least 2 m through-walk, clears ramps/driveways and excludes bridges. Widen the footway if a pit cannot fit.</span></p><button class="solver-badge" data-inspector-action="inspect-planting">${icon("search")}Inspect a planting opening</button>`
        : ""),
  );
}
function profile(road: Road) {
  return card(
    "Approach profile",
    "route",
    `<div class="profile-row"><label for="control-lanes">Lane count</label><div class="select-field"><select id="control-lanes" data-prop="lanes" aria-label="Lane count">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === road.lanes ? "selected" : ""}>${n} ${n === 1 ? "lane" : "lanes"}</option>`).join("")}</select>${icon("chevron-down")}</div></div>${range("laneWidth", "Lane width", road.laneWidth, 2.5, 6, 0.1)}${road.markingStyle === "motorway" ? range("shoulderWidth", "Asphalt shoulder / side", road.shoulderWidth, 0, 3.5, 0.1) : ""}${range("sidewalk", "Sidewalk width", road.sidewalk, 0, 12, 0.1)}${selection?.kind === "node" ? toggle("crossings", "Pedestrian crossings", getNode(project, selection.id).crossings, "Striped crossings at each approach") : toggle("markings", "Road markings", road.markings, "Lane lines, edge lines and turn arrows")}`,
  );
}
function renderInspector() {
  if (selection?.kind === "site") {
    const site = project.sites?.find((s) => s.id === selection!.id);
    if (site) {
      renderSiteInspector(site);
      return;
    }
  }
  const roads = selectedRoads(),
    road = roads[0],
    node = selection?.kind === "node" ? getNode(project, selection.id) : null,
    joint =
      selection?.kind === "node"
        ? network.junctions.find((j) => j.node.id === selection!.id)
        : null;
  if (!selection || !road) {
    $("inspector-content").innerHTML =
      mode === "draw"
        ? `<div class="selected-object"><div class="object-icon">${icon("pen-tool")}</div><div class="object-title"><span class="eyebrow">ROAD ALIGNMENT</span><h1>Draw a road</h1></div></div><div class="draw-tip">Click a start point in the plan, then click to add connected segments. Crossing a road at the same height creates a shared junction automatically.</div><div class="section-heading">ACTIVE ROAD PRESET</div><div class="drawing-preset">${escape(presets.find((p) => p.id === presetID)!.name)}</div><p class="material-note">Choose a preset from the asset library below. Press Esc when finished.</p>`
        : `<div class="no-selection">${icon("mouse-pointer-2")}<h2>Make a connection.</h2><p>Select a road or a junction in either view to edit its geometry, surface and details.</p><button data-inspector-action="draw">${icon("pen-tool")}Draw your first road</button></div>`;
    refreshIcons();
    updateStats();
    return;
  }
  const title = selectedName(),
    position = selectedPosition()!,
    type =
      joint?.type ??
      (node ? "Endpoint" : road.bridge ? "Bridge deck" : "Cubic Bézier");
  const serviceOwners = new Set([selection.id, ...roads.map((r) => r.id)]),
    selectionServices = network.services.filter((s) =>
      serviceOwners.has(s.owner),
    );
  const header = `<div class="selected-object"><div class="object-icon">${icon(node ? "git-fork" : road.bridge ? "cable" : "route")}</div><div class="object-title"><span class="eyebrow">${node ? "SHARED JUNCTION" : "ROAD ALIGNMENT"}</span><h1 title="${escape(title)}">${escape(title.split(" · ")[0])}</h1><span class="type-pill"><span></span>${type} · ${node ? "Auto-welded" : road.lanes + " lanes"}</span></div><button class="icon-button object-actions" data-inspector-action="rename" title="Rename selected object" aria-label="Rename selected object">${icon("settings-2")}</button></div><nav class="inspector-tabs" aria-label="Inspector sections">${["geometry", "surface", "details"].map((tab) => `<button data-inspector-tab="${tab}" class="${tab === inspectorTab ? "active" : ""}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</nav>`;
  let body = "";
  if (inspectorTab === "geometry") {
    if (joint)
      body += card(
        "Joint geometry",
        "git-merge",
        `<div class="radius-overview"><div><div class="radius-metric"><span id="radius-value">${fmt(node!.radius)}</span><small>m</small></div><div class="metric-caption">Corner radius</div></div>${jointSketch(node!.radius)}</div><input aria-label="Corner radius" type="range" data-prop="radius" min="2" max="24" step=".5" value="${node!.radius}" style="--progress:${((node!.radius - 2) / 22) * 100}%"/><div class="range-labels"><span>2 m</span><span>24 m</span></div><p class="card-note"><span>Requested radius stays editable. Wide footways offset cleanly using an automatic radius floor of <output data-radius-fit>${fmt(joint.radius, 2)}</output> m. Short approaches taper with a warning instead of folding.</span></p><div class="solver-row"><span>Corner solver</span><span class="solver-badge">${icon("check")}Tangent fillet</span></div>${range("setback", "Paving / merge setback", node!.setback ?? 0, 0, 24, 1)}${joint.type === "Merge" ? `<p class="card-note">${icon("git-merge")}Adaptive runout recesses the rounded curb nose. Gores derive from that actual nose; crossings stay out of merge throats.</p><button class="solver-badge" data-inspector-action="inspect-splitter">${icon("search")}Inspect curb splitter</button>` : ""}${toggle("boxJunction", "Yellow box markings", node!.boxJunction ?? false, "Clipped to the actual junction surface")}${toggle("signals", "Traffic signals", node!.signals ?? false, "Physical poles and signal heads; static preview phase")}`,
        "radius-card",
      );
    else if (!node)
      body += card(
        "Road alignment",
        "spline",
        `<div class="radius-overview"><div><div class="radius-metric">${Math.round(network.spans.find((s) => s.road.id === road.id)?.alignment.length ?? 0)}<small>m</small></div><div class="metric-caption">Curve length</div></div>${icon("route")}</div><div class="solver-row"><span>Alignment type</span><span class="solver-badge">Cubic Bézier</span></div>`,
      );
    body += card(
      "Transform",
      "move",
      `<div class="transform-fields">${(["X", "Y", "Z"] as const).map((axis, i) => `<label class="transform-field"><span>${axis}</span><input type="number" data-position="${i}" value="${position[i].toFixed(1)}" step=".5" min="-10000" max="10000" aria-label="${axis} position"/></label>`).join("")}</div><p class="card-note">${icon("link-2")}${node ? "Connected approaches move together" : "Endpoints and attached roads follow the pivot"}</p>`,
    );
    body +=
      `<div class="section-heading"><span>${node ? "CONNECTED ROAD PROFILE" : "CARRIAGEWAY"}</span><small>${node ? roads.length + " approaches" : "Live cross-section"}</small></div>` +
      profile(road);
    body += mobilityControls(road);
    if (node)
      body += `<p class="material-note">Profile changes apply to all ${roads.length} connected approaches. Each road remains individually editable.</p>`;
  } else if (inspectorTab === "surface") {
    body += card(
      "Carriageway material",
      "layers",
      `<div class="material-options">${["asphalt", "concrete", "cobble", "pavers"].map((surface) => `<button class="material-option ${road.surface === surface ? "selected" : ""}" data-surface="${surface}"><span class="material-swatch ${surface}"></span>${surface[0].toUpperCase() + surface.slice(1)}</button>`).join("")}</div><p class="material-note">Procedural, locally generated materials. No external textures required.</p>`,
    );
    body += card(
      "Paving pattern",
      "grid-2x2",
      patternControls(road.pattern) +
        range("sidewalk", "Pavement width", road.sidewalk, 0, 12, 0.1) +
        choice("curbStyle", "Curb profile", road.curbStyle, [
          ["stone", "Stone curb"],
          ["flush", "Flush pedestrian edge"],
          ["race", "Racing rumble curb"],
        ]) +
        range("curbHeight", "Curb upstand", road.curbHeight, 0.04, 0.3, 0.01) +
        range(
          "sidewalkCrossfall",
          "Footway crossfall",
          road.sidewalkCrossfall,
          -3,
          3,
          0.1,
          "%",
        ) +
        `<p class="card-note"><span>Sidewalks follow the full alignment on both sides. Positive crossfall falls toward the road. Flush/racing profiles cap their upstand.</span></p>`,
    );
    body += card(
      "Cross-section",
      "droplets",
      `${range("crossfall", "Crossfall", road.crossfall, 0, 6, 0.5, "%")}<p class="card-note">${icon("droplets")}Crowned road surface drains toward both curbs.</p>${toggle("markings", "Road markings", road.markings, "Clipped before junctions and crossings")}`,
    );
  } else {
    body += roadPlantingControls(road);
    const footways = network.footways.filter((f) =>
      roads.some((r) => r.id === f.owner),
    );
    body += card(
      "Pedestrian corner ramps",
      "corner-up-right",
      toggle(
        "cornerRamps",
        "Corner curb ramps",
        road.cornerRamps,
        "Crossing-aligned dropped curbs with flared sides",
      ) +
        (road.cornerRamps
          ? range(
              "rampWidth",
              "Clear ramp width",
              road.rampWidth,
              1.4,
              3.4,
              0.1,
            ) +
            range("rampRun", "Ramp run", road.rampRun, 0.8, 6, 0.1) +
            toggle(
              "tactile",
              "Tactile warning paving",
              road.tactile,
              "400 mm modules with blister relief",
            ) +
            `<p class="card-note"><span><output data-footway-stat="corner-ramp">${footways.filter((f) => f.kind === "corner-ramp").length}</output> ramps on the selection · max cross-ramp grade <output data-footway-grade="corner-ramp">${fmt(Math.max(0, ...footways.filter((f) => f.kind === "corner-ramp").map((f) => f.slope)), 1)}</output>%. Wide footways retain a clear landing behind each ramp.</span></p><button class="solver-badge" data-inspector-action="inspect-ramp">${icon("search")}Inspect a corner ramp</button>`
          : ""),
    );
    if (!node) {
      activeDriveway = Math.min(
        activeDriveway,
        Math.max(0, road.driveways.length - 1),
      );
      const entry = road.driveways[activeDriveway];
      body += card(
        "Vehicle crossings",
        "corner-up-right",
        `<button class="solver-badge" data-inspector-action="add-driveway">${icon("plus")}Add driveway crossing</button>` +
          (entry
            ? choice(
                "activeDriveway",
                "Crossing",
                String(activeDriveway),
                road.driveways.map(
                  (d, i) =>
                    [
                      String(i),
                      `Entry ${i + 1} / ${d.side === 1 ? "right" : "left"}`,
                    ] as [string, string],
                ),
              ) +
              choice("drivewaySide", "Road side", String(entry.side), [
                ["1", "Right / + offset"],
                ["-1", "Left / − offset"],
              ]) +
              range(
                "drivewayAt",
                "Along curve",
                entry.at * 100,
                0,
                100,
                1,
                "%",
              ) +
              range(
                "drivewayWidth",
                "Vehicle opening",
                entry.width,
                3,
                12,
                0.1,
              ) +
              range(
                "drivewayApron",
                "Apron beyond sidewalk",
                entry.apron,
                0,
                12,
                0.1,
              ) +
              `<p class="card-note"><span>A low curb lip and flared transition preserve the continuous pedestrian landing. Rails and edge paint leave the access clear. Move entries away from intersections.</span></p><button class="solver-badge" data-inspector-action="inspect-driveway">${icon("search")}Inspect entry</button> <button class="solver-badge" data-inspector-action="delete-driveway">${icon("trash-2")}Remove entry</button>`
            : '<p class="card-note"><span>Author independent entries along this alignment. No driveway is auto-populated.</span></p>'),
      );
    }
    body += card(
      "Road markings & parking",
      "route",
      choice("trafficSide", "Traffic handedness", road.trafficSide, [
        ["right", "Keep right / European"],
        ["left", "Keep left"],
      ]) +
        choice("markingStyle", "Marking language", road.markingStyle, [
          ["urban", "City street"],
          ["motorway", "Motorway"],
          ["race", "Racing circuit"],
        ]) +
        range(
          "markingSetback",
          "Marking setback",
          road.markingSetback,
          0,
          16,
          1,
        ) +
        choice("parking", "Curbside parking", road.parking, [
          ["none", "None"],
          ["parallel", "Parallel bays"],
        ]) +
        toggle(
          "curbExtensions",
          "Parking-pocket curb extensions",
          road.curbExtensions,
          "Consume parking space at crossings, not travel lanes. Requires parallel bays and no separate cycle track.",
        ) +
        range("median", "Central median", road.median, 0, 3, 0.2) +
        `<p class="card-note"><span>Crosswalks share the curb-ramp station. Stop bars apply only to incoming lanes. Medians from 1.2 m receive level refuge passages.</span></p><button class="solver-badge" data-inspector-action="inspect-street">${icon("search")}Inspect crossing detail</button>` +
        toggle(
          "startingGrid",
          "Starting grid",
          road.startingGrid,
          "Grid boxes on this racing alignment",
        ),
    );
    body += card(
      "Signs & street lighting",
      "signpost",
      toggle(
        "signs",
        "Road signs",
        road.signs,
        "Speed limit, route and parking signs",
      ) +
        range(
          "speedLimit",
          "Posted speed",
          road.speedLimit,
          20,
          160,
          10,
          "km/h",
        ) +
        toggle(
          "streetLights",
          "Street lighting",
          road.streetLights,
          "Swept roadside poles and luminaire geometry",
        ),
    );
    body += card(
      "Roadside protection",
      "shield",
      `${toggle("guardrails", road.railStyle === "wbeam" ? "W-beam guardrails" : railNames[road.railStyle], road.guardrails, "Swept, continuous roadside protection")}<svg class="detail-art" viewBox="0 0 210 44"><path d="M0 36h210" stroke="currentColor" opacity=".2"/><path d="M15 14v23m36-23v23m36-23v23m36-23v23m36-23v23m36-23v23" stroke="currentColor" stroke-width="2"/><path d="M0 8h210v12H0Z" fill="currentColor" opacity=".3"/><path d="M0 14h210" stroke="currentColor" stroke-width="1"/></svg>${choice(
        "railStyle",
        "Barrier type",
        road.railStyle,
        railStyles.map((style) => [style, railNames[style]]),
      )}${road.guardrails ? range("railHeight", "Rail height", road.railHeight, 0.5, 1.4, 0.1) + (road.railStyle !== "concrete" ? range("postSpacing", "Post spacing", road.postSpacing, 1.5, 6, 0.1) : "") : ""}`,
    );
    body += card(
      "Drainage",
      "droplets",
      `${toggle("drainage", "Curb drainage", road.drainage, "Recessed iron grates, frames and continuous gutters")}${
        road.drainage
          ? choice("drainageType", "Construction", road.drainageType, [
              ["curb", "Curb inlets"],
              ["linear", "Linear channel"],
              ["both", "Inlets + channel"],
            ]) +
            choice("curbDrainType", "Curb inlet style", road.curbDrainType, [
              ["grate", "Road gully grate"],
              ["side-entry", "Side-entry + chamber lid"],
              ["hollow", "Hollow curb / arched ports"],
            ]) +
            range(
              "inletSpacing",
              road.curbDrainType === "hollow"
                ? "Top access grate spacing"
                : "Inlet spacing",
              road.inletSpacing,
              6,
              40,
              1,
            ) +
            `<p class="card-note"><span><output data-service-stat="curb-inlet">${selectionServices.filter((s) => s.kind === "curb-inlet").reduce((n, s) => n + (s.ports ?? 1), 0)}</output> curb inlets / ports · <output data-service-stat="channel-drain">${selectionServices.filter((s) => s.kind === "channel-drain").length}</output> linear channels on the selection.</span></p><button class="solver-badge" data-inspector-action="inspect-drain">${icon("search")}Inspect drainage</button>`
          : ""
      }<button class="solver-badge" style="margin-top:12px" data-inspector-action="flow">${icon("eye")}Flow overlay / 2D</button>`,
    );
    body += card(
      "Access covers",
      "circle",
      toggle(
        "manholes",
        "Manhole covers",
        road.manholes,
        "Procedural service corridor; bridge decks are excluded",
      ) +
        (road.manholes
          ? range(
              "manholeDiameter",
              "Cover diameter",
              road.manholeDiameter,
              0.45,
              1,
              0.05,
            ) +
            range(
              "manholeSpacing",
              "Cover interval",
              road.manholeSpacing,
              12,
              100,
              1,
            ) +
            range(
              "manholeOffset",
              "Lateral offset",
              road.manholeOffset,
              -8,
              8,
              0.05,
            ) +
            `<p class="card-note"><span><output data-service-stat="manhole">${selectionServices.filter((s) => s.kind === "manhole").length}</output> flush covers on the selection / follows grade and crossfall. Offset is constrained to the carriageway and kept clear of raised medians.</span></p><button class="solver-badge" data-inspector-action="inspect-manhole">${icon("search")}Inspect a cover</button>`
          : ""),
    );
    const clearances = network.clearances.filter(
      (c) => c.a === road.id || c.b === road.id,
    );
    if (!node)
      body += card(
        "Bridge structure",
        "cable",
        toggle(
          "bridge",
          "Elevated bridge deck",
          road.bridge,
          "Build a superstructure at the authored height; shared endpoints are not moved",
        ) +
          (road.bridge
            ? choice("structure", "Superstructure", road.structure, [
                ["concrete", "Concrete girder"],
                ["steel", "Steel I-girder"],
              ]) +
              range(
                "bridgeDepth",
                "Slab / girder depth",
                road.bridgeDepth,
                0.75,
                2.4,
                0.05,
              ) +
              range(
                "pierSpacing",
                "Pier bay spacing",
                road.pierSpacing,
                16,
                50,
                1,
              ) +
              `<p class="card-note"><span>Decks and beams stitch across elevated joints. Foundations clear lower roads, cycleways and footways; no end walls block a connected span.</span></p><button class="solver-badge" data-inspector-action="inspect-bridge">${icon("search")}Inspect bridge structure</button>` +
              (clearances.length
                ? `<div class="number-control"><span>Minimum clearance</span><output class="detail-value" data-bridge-clearance>${fmt(Math.min(...clearances.map((c) => c.meters)), 2)} m</output></div>`
                : "")
            : `<p class="card-note"><span>Insert a level deck with gradual, connected approaches on an alignment of at least 420 m. Existing shared endpoints stay in place.</span></p><button class="solver-badge" data-inspector-action="insert-bridge">${icon("cable")}Insert connected bridge section</button>`),
      );
    else
      body += `<p class="material-note">Select an individual alignment to add a bridge. Try the Diamond interchange template for connected, grade-separated ramps.</p>`;
  }
  $("inspector-content").innerHTML = header + body;
  refreshIcons();
  updateStats();
}
function syncPositionInputs() {
  const p = selectedPosition();
  if (p)
    document
      .querySelectorAll<HTMLInputElement>("[data-position]")
      .forEach((input) => {
        if (document.activeElement !== input)
          input.value = p[Number(input.dataset.position)].toFixed(1);
      });
}
function setRoadProperty(prop: string, value: unknown) {
  if (prop === "activeDriveway") {
    activeDriveway = Number(value);
    return;
  }
  if (prop.startsWith("driveway")) {
    const entry = selectedRoads()[0]?.driveways[activeDriveway];
    if (entry) {
      if (prop === "drivewayAt") entry.at = Number(value) / 100;
      if (prop === "drivewayWidth") entry.width = Number(value);
      if (prop === "drivewayApron") entry.apron = Number(value);
      if (prop === "drivewaySide") entry.side = Number(value) === -1 ? -1 : 1;
    }
    return;
  }
  if (selection?.kind === "site") {
    const site = project.sites!.find((s) => s.id === selection!.id)!;
    if (
      [
        "cornerRadius",
        "blockBand",
        "blockInterior",
        "blockEntrySide",
        "blockEntryWidth",
        "pitGrate",
        "parkingIslands",
        "islandEvery",
        "bayFinish",
        "evBays",
        "pattern",
        "shape",
        "width",
        "depth",
        "yaw",
        "bays",
        "accessible",
        "bayWidth",
        "bayDepth",
        "aisleWidth",
        "perimeterWidth",
        "entryWidth",
        "parkingAngle",
        "parkingLayout",
        "numbering",
        "paintWear",
        "entrance",
        "manholes",
        "manholeDiameter",
        "drainage",
      ].includes(prop)
    )
      (site as unknown as Record<string, unknown>)[prop] = value;
    return;
  }
  if (
    ["radius", "crossings", "setback", "boxJunction", "signals"].includes(prop)
  ) {
    if (selection?.kind === "node")
      (getNode(project, selection.id) as unknown as Record<string, unknown>)[
        prop
      ] = value;
    return;
  }
  for (const road of selectedRoads()) {
    (road as unknown as Record<string, unknown>)[prop] = value;
    if (prop === "bridge" && value === true) road.guardrails = true;
  }
}
function applyPreset(id: string) {
  if (selection?.kind === "site") {
    toast("Select an alignment or junction to apply a road preset.", true);
    return;
  }
  const preset = presets.find((p) => p.id === id)!;
  presetID = id;
  if (selection && mode !== "draw")
    commit(() => {
      const preserved = [
        "bridge",
        "structure",
        "bridgeDepth",
        "pierSpacing",
      ] as const;
      for (const road of selectedRoads()) {
        const bridge = road.bridge,
          structure = road.structure,
          bridgeDepth = road.bridgeDepth,
          pierSpacing = road.pierSpacing;
        Object.assign(road, roadDefaults, preset.settings);
        for (const prop of preserved)
          (road as unknown as Record<string, unknown>)[prop] =
            prop === "bridge"
              ? bridge
              : prop === "structure"
                ? structure
                : prop === "bridgeDepth"
                  ? bridgeDepth
                  : pierSpacing;
      }
    });
  renderLibrary();
  renderInspector();
  toast(
    mode === "draw"
      ? `${preset.name} selected for new roads.`
      : selection
        ? `${preset.name} applied to the selected ${selection.kind === "node" ? "approaches" : "road"}.`
        : `${preset.name} selected. Click Draw road to begin.`,
  );
}
function inspectPlanning(kind: "planting" | "mobility") {
  if (!scene?.inspectPlanning(kind)) {
    toast(
      "No matching detail on the selection. Enable it or choose a suitable road / planting piece.",
      true,
    );
    return false;
  }
  for (const layer of kind === "planting"
    ? ["planting", "curb"]
    : ["cycle", "bus"]) {
    hiddenLayers.delete(layer);
    scene.setDetailLayer(layer, true);
    plan.setDetailLayer(layer, true);
    const input = document.querySelector<HTMLInputElement>(
      `[data-layer="${layer}"]`,
    );
    if (input) input.checked = true;
  }
  if ($("viewports").dataset.layout === "plan") setLayout("split");
  return true;
}
function insertBridgeOnSelection(
  roadId = selection?.kind === "road" ? selection.id : undefined,
  rise = 8,
  structure: "steel" | "concrete" = "steel",
) {
  if (!roadId) {
    toast(
      "Select a ground road alignment, or load the Connected highway bridge template.",
      true,
    );
    return false;
  }
  const result = commit(() => {
    const inserted = insertConnectedBridge(project, roadId, {
      rise,
      structure,
    });
    selection = { kind: "road", id: inserted.bridge };
    inspectorTab = "details";
  });
  if (result) {
    scene?.focusSelection(180);
    toast(
      "Connected bridge inserted. Shared endpoints and XZ alignment preserved.",
    );
  }
  return result;
}
function inspectRoadDetail(kind: "bridge" | "splitter" | "street") {
  const found = scene?.inspectRoadDetail(kind) ?? false;
  if (!found)
    toast(
      `No ${kind} detail on this selection. Choose a connected template or enable the road feature.`,
      true,
    );
  else
    for (const layer of kind === "bridge"
      ? ["structure", "rail"]
      : kind === "splitter"
        ? ["curb", "paving", "marking"]
        : ["curb", "paving", "marking"]) {
      hiddenLayers.delete(layer);
      scene?.setDetailLayer(layer, true);
      plan.setDetailLayer(layer, true);
      const input = document.querySelector<HTMLInputElement>(
        `[data-layer="${layer}"]`,
      );
      if (input) input.checked = true;
    }
  return found;
}
function inspectInfrastructure(kind: "manhole" | "drainage") {
  const visible = scene?.inspectInfrastructure(kind);
  if (!visible) {
    toast(
      "No matching service detail on the selection. Enable it or select a non-bridge road/parking surface.",
      true,
    );
    return false;
  }
  const layer = kind === "manhole" ? "utility" : "drain";
  hiddenLayers.delete(layer);
  scene?.setDetailLayer(layer, true);
  plan.setDetailLayer(layer, true);
  const input = document.querySelector<HTMLInputElement>(
    `[data-layer="${layer}"]`,
  );
  if (input) input.checked = true;
  if ($("viewports").dataset.layout === "plan") setLayout("split");
  return true;
}
function addDriveway() {
  if (!selection || selection.kind === "site") {
    toast("Select a road to add a driveway crossing.", true);
    return false;
  }
  const road = selectedRoads()[0];
  if (!road) {
    toast("Select a connected road to add a driveway crossing.", true);
    return false;
  }
  if (selection.kind === "node") setSelection({ kind: "road", id: road.id });
  if (road.driveways.length >= 20) {
    toast(
      "Alignment limit: 20 vehicle entries. Split the alignment to author more.",
      true,
    );
    return false;
  }
  if (road.bridge) {
    toast("Vehicle entries cannot be placed on bridge decks.", true);
    return false;
  }
  inspectorTab = "details";
  return commit(() => {
    road.sidewalk = Math.max(road.sidewalk, 4.2);
    const span = network.spans.find((s) => s.road.id === road.id),
      candidates = [0.5, 0.3, 0.7, 0.18, 0.82, 0.4, 0.6, 0.24, 0.76],
      at = span
        ? candidates.find((t) => {
            const station = stationForParameter(span, t);
            return (
              station > span.frames[0].s + (span.startJoint ? 8.1 : 4.1) &&
              station < span.frames.at(-1)!.s - (span.endJoint ? 8.1 : 4.1) &&
              !(span.footway?.ramps ?? []).some(
                (r) =>
                  r.side === 1 &&
                  Math.abs(station - r.s) < 4 + r.width / 2 + r.flare + 0.1,
              )
            );
          })
        : undefined;
    if (at === undefined)
      throw new Error(
        "No clear 6 m entry fits on this alignment. Move existing entries or use a longer road.",
      );
    road.driveways.push({ id: uid("entry"), at, side: 1, width: 6, apron: 4 });
    activeDriveway = road.driveways.length - 1;
  });
}
function inspectFootway(kind: "corner-ramp" | "driveway") {
  const id =
    kind === "driveway"
      ? selectedRoads()[0]?.driveways[activeDriveway]?.id
      : undefined;
  if (!scene?.inspectFootway(kind, id)) {
    toast(
      "No matching ramp on the selection. Enable corner ramps and crossings, or add/move a driveway.",
      true,
    );
    return false;
  }
  hiddenLayers.delete("paving");
  scene?.setDetailLayer("paving", true);
  plan.setDetailLayer("paving", true);
  const layer = document.querySelector<HTMLInputElement>(
    '[data-layer="paving"]',
  );
  if (layer) layer.checked = true;
  if ($("viewports").dataset.layout === "plan") setLayout("split");
  return true;
}
function renderLibrary() {
  const query = ($("library-search") as HTMLInputElement).value.toLowerCase();
  let cards: {
    id: string;
    name: string;
    description: string;
    preview: string;
    action: string;
  }[] = [];
  if (libraryTab === "roads")
    cards = presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      preview: `<img class="asset-thumbnail" src="${assetThumbnail("road", p.id)}" alt="Generated ${escape(p.name)} road preview" loading="lazy"/>`,
      action: "preset",
    }));
  if (libraryTab === "materials")
    cards = patterns.map((p) => ({
      id: p,
      name: patternNames[p],
      description: "World-scaled stone · procedural relief",
      preview: `<div class="pattern-thumb" style="height:100%;width:100%;background-image:url('${patternPreview(p)}');background-size:120px"></div>`,
      action: "pattern",
    }));
  if (libraryTab === "sites")
    cards = siteCatalog.map((p) => ({
      ...p,
      preview: `<img class="asset-thumbnail" src="${assetThumbnail("site", p.id)}" alt="Generated ${escape(p.name)} preview" loading="lazy"/>`,
      action: "site",
    }));
  if (libraryTab === "structures")
    cards = [
      {
        id: "bridge",
        name: "Concrete viaduct",
        description: "Solid deck · concrete piers",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "bridge")}" alt="Generated bridge infrastructure preview" loading="lazy"/>`,
        action: "structure",
      },
      {
        id: "steel",
        name: "Steel overpass",
        description: "I-girders · clear-span bays",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "steel")}" alt="Generated steel infrastructure preview" loading="lazy"/>`,
        action: "structure",
      },
      {
        id: "rail",
        name: "W-beam barrier",
        description: "Corrugated beam · steel posts",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "rail")}" alt="Generated rail infrastructure preview" loading="lazy"/>`,
        action: "structure",
      },
      {
        id: "drain",
        name: "Curb drainage",
        description: "Runoff channel · grated inlets",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "drain")}" alt="Generated drain infrastructure preview" loading="lazy"/>`,
        action: "structure",
      },
      {
        id: "channel",
        name: "Linear channel drain",
        description: "Recessed grate · continuous frame",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "channel")}" alt="Channel drain mesh preview" loading="lazy"/>`,
        action: "structure",
      },
      {
        id: "manhole",
        name: "Manhole cover",
        description: "Cast-iron lid · rim · lifting pockets",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "manhole")}" alt="Manhole cover mesh preview" loading="lazy"/>`,
        action: "structure",
      },
    ];
  if (libraryTab === "structures")
    cards.push(
      {
        id: "bridge-kit",
        name: "Insert connected highway bridge",
        description: "420 m + alignment · level deck · linked approaches",
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", "bridge-kit")}" alt="Connected bridge approaches preview" loading="lazy"/>`,
        action: "structure",
      },
      ...railStyles
        .filter((s) => s !== "wbeam")
        .map((style) => ({
          id: `rail-${style}`,
          name: railNames[style],
          description:
            style === "parapet"
              ? "Concrete plinth · tubular rail · real vertical infill"
              : style === "cable"
                ? "Four swept steel cables · sockets · posts"
                : "Swept physical section · posts / end caps",
          preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", `rail-${style}`)}" alt="Generated ${railNames[style]} mesh preview" loading="lazy"/>`,
          action: "structure",
        })),
    );
  if (libraryTab === "structures")
    cards.push(
      ...[
        {
          id: "sidewalk",
          name: "Wide pedestrian sidewalk",
          description: "Full-length paving · 4.2 m minimum",
        },
        {
          id: "corner",
          name: "Corner curb ramp",
          description: "Low lip · flares · tactile warning",
        },
        {
          id: "driveway",
          name: "Vehicle driveway crossing",
          description: "Dropped curb · continuous landing",
        },
        {
          id: "kerb",
          name: "Side-entry curb drain",
          description: "Open throat · concrete chamber lid",
        },
        {
          id: "hollow",
          name: "Hollow drainage curb",
          description: "Arched face ports · continuous kerb",
        },
      ].map((a) => ({
        ...a,
        preview: `<img class="asset-thumbnail" src="${assetThumbnail("structure", a.id)}" alt="Generated ${a.name} mesh preview" loading="lazy"/>`,
        action: "structure",
      })),
    );
  if (libraryTab === "networks")
    cards = templates.map((t) => ({
      ...t,
      preview: networkPreview(t.id),
      action: "template",
    }));
  cards = cards.filter((p) =>
    (p.name + " " + p.description).toLowerCase().includes(query),
  );
  $("asset-cards").innerHTML =
    cards
      .map(
        (card, i) =>
          `<button class="asset-card ${card.action === "preset" && card.id === presetID ? "selected" : ""}" data-asset-action="${card.action}" data-asset="${card.id}" title="${card.action === "template" ? "Load template:" : "Apply:"} ${card.name} — ${card.description}"><div class="asset-preview"><span class="asset-index">${String(i + 1).padStart(2, "0")}</span>${card.preview}${icon("arrow-up-right")}</div><div class="asset-details"><strong>${card.name}</strong><small>${card.description}</small></div></button>`,
      )
      .join("") ||
    '<div class="library-empty">No assets match that search.</div>';
  document
    .querySelectorAll<HTMLButtonElement>("[data-library]")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.library === libraryTab)),
    );
  refreshIcons();
  $("asset-cards")
    .querySelectorAll(".asset-preview>.lucide")
    .forEach((i) => i.classList.add("asset-apply"));
}
function drawPoint(point: V3) {
  if (mode === "place") {
    const site = makeSite(placementKind, point);
    const placed = commit(() => {
      (project.sites ??= []).push(site);
      selection = { kind: "site", id: site.id };
      setMode("select");
    });

    if (placed)
      scene?.focusSelection(
        Math.max(70, Math.max(site.width, site.depth) * 2.5),
      );
    return;
  }
  if (!draft) {
    draft = [...point];
    plan.setDraft(draft);
    updateHint();
    return;
  }
  if (Math.hypot(point[0] - draft[0], point[2] - draft[2]) < 2) {
    toast("Roads need at least 2 meters between points.", true);
    return;
  }
  let id: string | null = null;
  commit(() => {
    const preset = presets.find((p) => p.id === presetID)!;
    id = insertRoad(project, draft!, point, {
      ...roadDefaults,
      ...preset.settings,
    });
    if (id) selection = { kind: "road", id };
  });
  draft = [...point];
  plan.setDraft(draft);
  updateHint();
}
function handleDrag(edit: EditDrag) {
  if (edit.phase === "start") {
    dragBefore = snapshot();
    dragBase = clone(project);
    return;
  }
  if (edit.phase === "move") {
    const previous = clone(project);
    try {
      if (edit.target === "node") moveNode(project, edit.id, edit.value);
      else if (edit.target === "site") {
        const site = project.sites!.find((s) => s.id === edit.id)!;
        site.position = [...edit.value];
      } else if (edit.target === "road") {
        const road = project.roads.find((r) => r.id === edit.id);
        if (road && dragBase)
          for (const id of [road.start, road.end])
            getNode(project, id).position = add(
              getNode(dragBase, id).position,
              edit.value,
            );
      } else {
        const road = project.roads.find((r) => r.id === edit.id)!;
        road[edit.target] = sub(
          edit.value,
          getNode(project, edit.target === "h1" ? road.start : road.end)
            .position,
        );
      }
      validateGenerationBudget(project);
    } catch (error) {
      project = previous;
      toast(
        error instanceof Error
          ? error.message
          : "Movement exceeds the editor tile limit.",
        true,
      );
      return;
    }
    rebuild(false);
    return;
  }
  if (dragBefore && dragBefore !== snapshot()) {
    resolveCrossings(project);
    remember(dragBefore);
    rebuild(true);
  }
  dragBefore = null;
  dragBase = null;
}
function updateGizmo(projection: GizmoProjection | null) {
  const svg = $("scene-gizmo");
  if (
    !projection ||
    !projection.visible ||
    !selection ||
    mode === "draw" ||
    mode === "measure" ||
    mode === "place"
  ) {
    svg.setAttribute("hidden", "");
    return;
  }
  svg.removeAttribute("hidden");
  for (const [axis, p] of Object.entries(projection.axes)) {
    const group = svg.querySelector(`.axis-${axis}`)!;
    group.querySelectorAll("line").forEach((line) => {
      line.setAttribute("x1", String(projection.origin[0]));
      line.setAttribute("y1", String(projection.origin[1]));
      line.setAttribute("x2", String(p[0]));
      line.setAttribute("y2", String(p[1]));
    });
    const text = group.querySelector("text")!;
    text.setAttribute(
      "x",
      String(p[0] + (p[0] > projection.origin[0] ? 8 : -8)),
    );
    text.setAttribute(
      "y",
      String(p[1] + (p[1] > projection.origin[1] ? 10 : -6)),
    );
    text.setAttribute("text-anchor", "middle");
  }
  svg.querySelector("circle")!.setAttribute("cx", String(projection.origin[0]));
  svg.querySelector("circle")!.setAttribute("cy", String(projection.origin[1]));
}
function toggleGrid() {
  gridEnabled = !gridEnabled;
  plan.setGrid(gridEnabled);
  scene?.setGrid(gridEnabled);
  $("grid-toggle").setAttribute("aria-pressed", String(gridEnabled));
}
function toggleLabels() {
  labelsEnabled = !labelsEnabled;
  plan.setLabels(labelsEnabled);
  $("plan-labels").setAttribute("aria-pressed", String(labelsEnabled));
}
function toggleContext() {
  contextEnabled = !contextEnabled;
  scene?.setContext(contextEnabled);
  $("context-toggle").setAttribute("aria-pressed", String(contextEnabled));
}
function deleteSelected() {
  if (!selection) return;
  const s = selection;
  commit(() => {
    deleteSelection(project, s.kind, s.id);
    selection = null;
  });
  toast(
    s.kind === "node"
      ? "Junction and connected roads removed."
      : s.kind === "site"
        ? "Site removed."
        : "Road removed.",
  );
}

function closeMenus() {
  document
    .querySelectorAll<HTMLElement>(".dropdown-menu")
    .forEach((m) => (m.hidden = true));
  document
    .querySelectorAll("[data-menu]")
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function openMenu(id: string, button: HTMLElement) {
  const menu = $(id),
    wasOpen = !menu.hidden;
  closeMenus();
  if (wasOpen) return;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  const r = button.getBoundingClientRect();
  menu.style.top = `${r.bottom + 7}px`;
  menu.style.left = `${Math.max(10, Math.min(window.innerWidth - menu.offsetWidth - 10, id === "export-menu" || id === "layers-menu" ? r.right - menu.offsetWidth : r.left))}px`;
}
function openModal(content: string) {
  closeMenus();
  $("modal-content").innerHTML = content;
  refreshIcons();
  ($("modal") as HTMLDialogElement).showModal();
}
const modalHeader = (eyebrow: string, title: string, description = "") =>
  `<div class="modal-header"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div><button class="icon-button" data-close-modal title="Close dialog" aria-label="Close dialog">${icon("x")}</button></div>`;
function openTemplates() {
  openModal(
    modalHeader(
      "NETWORK STARTING POINTS",
      "Every road starts somewhere.",
      "Choose a connected network. Your current design remains in undo history.",
    ) +
      `<div class="template-grid">${templates.map((t) => `<button class="template-card" data-template="${t.id}"><div class="asset-preview">${networkPreview(t.id)}</div><div class="asset-details"><strong>${t.name}</strong><small>${t.description}</small></div></button>`).join("")}</div><div class="modal-foot">${icon("git-merge")}Shared junction nodes. Height-aware crossings. No disconnected ramps.</div>`,
  );
}
function loadTemplate(id: string) {
  const loaded = commit(
    () => {
      project = makeTemplate(id);
      network = buildNetwork(project, { detail: geometryDetail });
      selection = ["diamond", "cloverleaf", "trumpet", "bridge"].includes(id)
        ? { kind: "road", id: project.roads.find((r) => r.bridge)!.id }
        : network.junctions[0]
          ? { kind: "node", id: network.junctions[0].node.id }
          : null;
      setMode("select");
      inspectorTab = "geometry";
    },
    { fit: true },
  );
  if (loaded) {
    if (id === "diamond" || id === "bridge") {
      const deck = project.roads.find(
        (r) =>
          r.bridge &&
          Math.abs(getNode(project, r.start).position[2]) <= 115 &&
          Math.abs(getNode(project, r.end).position[2]) <= 115,
      );
      if (deck) setSelection({ kind: "road", id: deck.id });
      scene?.focusSelection(380);
    } else if (id === "city") {
      const centre = project.nodes.find(
        (n) => Math.abs(n.position[0]) < 0.01 && Math.abs(n.position[2]) < 0.01,
      );
      if (centre) setSelection({ kind: "node", id: centre.id });
      scene?.focusSelection(1000);
    } else if (id === "cloverleaf" || id === "trumpet") {
      const centre = project.roads.find(
        (r) =>
          r.bridge &&
          r.lanes === 2 &&
          Math.abs(getNode(project, r.start).position[2]) <= 50 &&
          Math.abs(getNode(project, r.end).position[2]) <= 50,
      );
      if (centre) setSelection({ kind: "road", id: centre.id });
      scene?.focusSelection(850);
    } else if (id === "signal") scene?.focusSelection(230);
    else if (id === "roundabout") scene?.fit(1.25);
    else if (id === "district" || id === "tee")
      scene?.focusSelection(id === "district" ? 140 : 155);
    else if (id === "merge") scene?.focusSelection(180);
    else
      scene?.fit(
        ["cloverleaf", "trumpet", "waterfront"].includes(id) ? 1.35 : 1.45,
      );
    ($("modal") as HTMLDialogElement).close();
    toast(
      `${project.name} loaded. Your previous network is available with Undo.`,
    );
  }
}
function openHelp() {
  openModal(
    modalHeader(
      "FRONTIER ROAD STUDIO",
      "Design once. See it twice.",
      "A graph-based road editor with live, linked 2D and 3D geometry.",
    ) +
      `<div class="help-body"><h3>A quick way in</h3><p>Draw in the plan. Snap to an existing road to make a junction, or cross it at the same elevation. Select the shared joint and drag its center or an axis in either view. Connected roads and their Bézier handles follow the same pivot.</p><h3>Built for your game engine</h3><p>GLB includes triangulated geometry and embedded paving textures, in meters with Y up. OBJ includes MTL materials and PNG textures in a ZIP archive. JSON preserves the editable graph. Browser-local saves never leave this device.</p><div class="shortcut-grid">${[
        ["Select", "V"],
        ["Draw road", "D / P"],
        ["Move pivot", "W"],
        ["Pan", "H / Space"],
        ["Measure", "M"],
        ["Place procedural parking", "B"],
        ["Frame all", "F"],
        ["Toggle grid", "G"],
        ["Toggle snap", "S"],
        ["Finish drawing", "Esc"],
        ["Delete selected", "Del"],
        ["Save locally", "Ctrl + S"],
        ["Undo / redo", "Ctrl + Z / ⇧ Z"],
      ]
        .map(([name, key]) => `<div>${name}<kbd>${key}</kbd></div>`)
        .join("")}</div></div>`,
  );
}
function openRename() {
  if (!selection) return;
  openModal(
    modalHeader("SELECTED OBJECT", "Give it a name.") +
      `<form id="rename-form" class="help-body"><label for="rename-input" style="display:block;margin-bottom:12px">Object name</label><input id="rename-input" maxlength="80" required value="${escape(selectedName())}" style="width:100%;padding:12px;border:1px solid #3a3a3a;border-radius:5px;background:#242424"/><button type="submit" class="rebuild-button" style="margin-top:20px">${icon("check")}Rename object</button></form>`,
  );
  ($("rename-input") as HTMLInputElement).select();
}
function download(
  data: string | Uint8Array | ArrayBuffer,
  name: string,
  type: string,
) {
  const part =
    typeof data === "string"
      ? data
      : data instanceof Uint8Array
        ? (data.slice().buffer as ArrayBuffer)
        : data;
  const url = URL.createObjectURL(new Blob([part], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slug() {
  return (
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "frontier-network"
  );
}
let exportBusy = false;
async function exportProject(format: string, detail?: GeometryDetail) {
  if (format !== "json" && exportBusy) {
    toast("A geometry export is already being packaged.");
    return;
  }
  if (format !== "json") exportBusy = true;
  const exportName = slug(),
    exportDetail = normaliseDetail(
      detail ?? ($("export-detail") as HTMLSelectElement).value,
    );
  // Capture immutable authoring state; export detail never modifies live editing.
  const exportProjectSnapshot = clone(project);
  try {
    if (format === "json") {
      download(
        JSON.stringify(project, null, 2),
        `${slug()}.road.json`,
        "application/json",
      );
      toast("Editable road project exported.");
      return;
    }
    if (!network.meshes.length) {
      toast("Draw a road before exporting geometry.", true);
      return;
    }
    if (network.diagnostics.some((d) => d.level === "error")) {
      toast(
        "Fix invalid geometry before exporting a mesh. JSON project export is still available.",
        true,
      );
      return;
    }
    toast(`Building ${exportDetail} export geometry…`);
    const exportNetwork = buildNetwork(exportProjectSnapshot, {
      detail: exportDetail,
    });
    if (exportNetwork.diagnostics.some((d) => d.level === "error"))
      throw new Error(
        "Selected export tessellation produces invalid geometry. Review the approaches before exporting.",
      );
    if (format === "obj") {
      const base = exportName,
        { files, textures } = await exportTexturePack(
          exportNetwork.meshes.map((m) => m.material),
        ),
        { obj, mtl } = exportOBJ(exportNetwork, base, textures),
        archive = zipSync(
          {
            [`${base}.obj`]: strToU8(obj),
            [`${base}.mtl`]: strToU8(mtl),
            "mesh.json": strToU8(
              JSON.stringify(
                exportMeshManifest(exportNetwork, exportProjectSnapshot),
                null,
                2,
              ),
            ),
            ...files,
          },
          { level: 5 },
        );
      download(archive, `${base}-obj.zip`, "application/zip");
      toast(
        "OBJ + MTL + albedo/normal/roughness textures and material manifest exported.",
      );
      return;
    }
    if (!scene) {
      toast("GLB requires the 3D renderer. Use OBJ for this browser.", true);
      return;
    }
    toast("Packaging geometry and paving materials…");
    const buffer = await scene.exportGLB(exportNetwork);
    download(buffer, `${exportName}.glb`, "model/gltf-binary");
    toast(
      `GLB exported · ${compact(exportNetwork.triangles)} triangles · ${exportDetail} mesh · embedded materials.`,
    );
  } catch (error) {
    toast(
      error instanceof Error
        ? `Export failed: ${error.message}`
        : "Export failed.",
      true,
    );
  } finally {
    if (format !== "json") exportBusy = false;
  }
}
function doAction(action: string) {
  closeMenus();
  const actions: Record<string, () => void> = {
    templates: openTemplates,
    import: () => ($("project-file") as HTMLInputElement).click(),
    save: () => saveProject(),
    undo: undoProject,
    redo: redoProject,
    delete: deleteSelected,
    fit: () => {
      plan.fit();
      scene?.fit();
    },
    grid: toggleGrid,
    labels: toggleLabels,
    context: toggleContext,
    inspect: () => {
      if (!scene?.inspectSelection())
        toast("Select a road, junction or parking surface first.", true);
    },
    help: openHelp,
    json: () => void exportProject("json"),
    obj: () => void exportProject("obj"),
    glb: () => void exportProject("glb"),
  };
  actions[action]?.();
}

// Event delegation keeps every regenerated inspector and library control live.
document.addEventListener("click", (e) => {
  const target = e.target as Element;
  const menu = target.closest<HTMLElement>("[data-menu]");
  if (menu) {
    openMenu(menu.dataset.menu!, menu);
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]");
  if (action) {
    doAction(action.dataset.action!);
    return;
  }
  if (!target.closest(".dropdown-menu")) closeMenus();
  const tool = target.closest<HTMLElement>("[data-tool]");
  if (tool) {
    setMode(tool.dataset.tool as ToolMode);
    return;
  }
  const layout = target.closest<HTMLElement>("[data-layout]");
  if (layout?.tagName === "BUTTON") {
    setLayout(layout.dataset.layout!);
    return;
  }
  const select = target.closest<HTMLElement>("[data-select]");
  if (select) {
    setSelection({
      kind: select.dataset.kind as "node" | "road" | "site",
      id: select.dataset.select!,
    });
    return;
  }
  const group = target.closest<HTMLElement>("[data-group]");
  if (group) {
    const id = group.dataset.group!;
    if (collapsedGroups.has(id)) collapsedGroups.delete(id);
    else collapsedGroups.add(id);
    renderOutliner();
    return;
  }
  const tab = target.closest<HTMLElement>("[data-inspector-tab]");
  if (tab) {
    inspectorTab = tab.dataset.inspectorTab!;
    renderInspector();
    return;
  }
  const surface = target.closest<HTMLElement>("[data-surface]");
  if (surface) {
    commit(() => setRoadProperty("surface", surface.dataset.surface));
    return;
  }
  const pattern = target.closest<HTMLElement>("[data-pattern]");
  if (pattern) {
    commit(() => setRoadProperty("pattern", pattern.dataset.pattern));
    return;
  }
  const library = target.closest<HTMLElement>("[data-library]");
  if (library) {
    libraryTab = library.dataset.library!;
    ($("library-search") as HTMLInputElement).value = "";
    renderLibrary();
    return;
  }
  const asset = target.closest<HTMLElement>("[data-asset]");
  if (asset) {
    const id = asset.dataset.asset!,
      action = asset.dataset.assetAction;
    if (action === "site") {
      beginPlace(id as SiteKind);
      return;
    }
    if (action === "preset") applyPreset(id);
    if (action === "pattern") {
      if (!selection) {
        toast("Select a road or junction to apply a paving pattern.", true);
        return;
      }
      commit(() => setRoadProperty("pattern", id));
      toast("Paving pattern updated in both views.");
    }
    if (action === "template") loadTemplate(id);
    if (action === "structure") {
      if (id === "bridge-kit") {
        insertBridgeOnSelection();
        return;
      }
      if (id === "driveway") {
        addDriveway();
        return;
      }
      if (["sidewalk", "corner", "kerb", "hollow"].includes(id)) {
        if (!selection || selection.kind === "site") {
          toast(
            "Select a road or junction for this road-edge construction.",
            true,
          );
          return;
        }
        inspectorTab = id === "sidewalk" ? "surface" : "details";
        commit(() => {
          for (const r of selectedRoads()) {
            r.sidewalk = Math.max(r.sidewalk, 4.2);
            if (id === "sidewalk" || id === "corner") {
              r.cornerRamps = true;
              r.curbStyle = "stone";
            } else {
              r.drainage = true;
              r.drainageType = "curb";
              r.curbStyle = "stone";
              r.curbHeight = Math.max(0.16, r.curbHeight);
              r.curbDrainType = id === "kerb" ? "side-entry" : "hollow";
            }
          }
        });
        return;
      }
      if (
        !selection ||
        (selection.kind === "site" && !["manhole", "drain"].includes(id))
      ) {
        toast(
          "Select a road/junction, or a parking surface for covers and curb inlets.",
          true,
        );
        return;
      }
      if (
        selection.kind === "site" &&
        project.sites!.find((s) => s.id === selection!.id)!.kind !== "parking"
      ) {
        toast(
          "Covers and inlets can be applied to a parking surface, not a paving island.",
          true,
        );
        return;
      }
      if ((id === "bridge" || id === "steel") && selection.kind === "node")
        setSelection({ kind: "road", id: selectedRoads()[0].id });
      inspectorTab = "details";
      const applied = commit(() => {
        if (id === "bridge" || id === "steel") {
          setRoadProperty("bridge", true);
          setRoadProperty("structure", id === "steel" ? "steel" : "concrete");
        } else if (id === "rail" || id.startsWith("rail-")) {
          if (id.startsWith("rail-")) {
            const style = id.slice(5) as Road["railStyle"];
            setRoadProperty("railStyle", style);
            const height =
              style === "parapet" ? 1.2 : style === "railing" ? 1.05 : 0.95;
            for (const r of selectedRoads())
              r.railHeight = Math.max(height, r.railHeight);
          }
          setRoadProperty("guardrails", true);
        } else if (id === "manhole") setRoadProperty("manholes", true);
        else {
          setRoadProperty("drainage", true);
          if (id === "drain" && selection?.kind !== "site")
            setRoadProperty("curbDrainType", "grate");
          if (selection?.kind !== "site")
            setRoadProperty(
              "drainageType",
              id === "channel" ? "linear" : "curb",
            );
        }
      });
      if (applied)
        toast(
          `${id === "manhole" ? "Manhole covers" : id === "channel" ? "Linear channel drainage" : id === "rail" || id.startsWith("rail-") ? "Guardrails" : id === "drain" ? "Curb inlets" : "Bridge structure"} enabled on the selection. Inspect the detail from the inspector.`,
        );
    }
    return;
  }
  const template = target.closest<HTMLElement>("[data-template]");
  if (template) {
    loadTemplate(template.dataset.template!);
    return;
  }
  if (target.closest("[data-close-modal]")) {
    ($("modal") as HTMLDialogElement).close();
    return;
  }
  const inspectorAction = target.closest<HTMLElement>(
    "[data-inspector-action]",
  );
  if (inspectorAction) {
    const a = inspectorAction.dataset.inspectorAction;
    if (a === "add-driveway") addDriveway();
    if (a === "delete-driveway")
      commit(() => {
        selectedRoads()[0]?.driveways.splice(activeDriveway, 1);
        activeDriveway = Math.max(0, activeDriveway - 1);
      });
    if (a === "inspect-ramp" || a === "inspect-driveway")
      inspectFootway(a === "inspect-ramp" ? "corner-ramp" : "driveway");
    if (a === "inspect-planting" || a === "inspect-mobility")
      inspectPlanning(a === "inspect-planting" ? "planting" : "mobility");
    if (a === "insert-bridge") {
      insertBridgeOnSelection();
      return;
    }
    if (
      a === "inspect-bridge" ||
      a === "inspect-splitter" ||
      a === "inspect-street"
    ) {
      inspectRoadDetail(
        a === "inspect-bridge"
          ? "bridge"
          : a === "inspect-splitter"
            ? "splitter"
            : "street",
      );
      return;
    }
    if (a === "inspect-manhole" || a === "inspect-drain")
      inspectInfrastructure(a === "inspect-manhole" ? "manhole" : "drainage");
    if (a === "draw") setMode("draw");
    if (a === "rename") openRename();
    if (a === "flow") {
      const checkbox = $("drainage-overlay") as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
      plan.setDrainage(checkbox.checked);
      toast(
        checkbox.checked
          ? "Drainage flow overlay shown in plan view."
          : "Drainage flow overlay hidden.",
      );
    }
    return;
  }
});
$("scene-search").addEventListener("input", renderOutliner);
$("library-search").addEventListener("input", renderLibrary);
$("inspector-content").addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.type === "range" && target.dataset.prop) sliderBefore = snapshot();
});
$("inspector-content").addEventListener("focusin", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.type === "range" && target.dataset.prop && !sliderBefore)
    sliderBefore = snapshot();
});
$("inspector-content").addEventListener("focusout", (e) => {
  if ((e.target as HTMLInputElement).type === "range") sliderBefore = null;
});
$("inspector-content").addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.type !== "range" || !input.dataset.prop) return;
  if (!sliderBefore) sliderBefore = snapshot();
  setRoadProperty(input.dataset.prop, Number(input.value));
  input.style.setProperty(
    "--progress",
    `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
  );
  const out = document.querySelector<HTMLOutputElement>(
    `[data-output="${input.dataset.prop}"]`,
  );
  if (out) {
    const unit = out.querySelector("small")?.textContent;
    out.innerHTML = `${fmt(Number(input.value), Number(input.step) < 0.1 ? 2 : Number(input.step) < 1 ? 1 : 0)}${unit ? `<small>${unit}</small>` : ""}`;
  }
  if (input.dataset.prop === "radius") {
    $("radius-value").textContent = fmt(Number(input.value));
    const sketch = document.querySelector(".junction-sketch");
    if (sketch) sketch.outerHTML = jointSketch(Number(input.value));
  }
  rebuild(false);
});
$("inspector-content").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.position) {
    const index = Number(input.dataset.position),
      value = Number(input.value);
    if (!Number.isFinite(value) || Math.abs(value) > 10000) {
      renderInspector();
      return;
    }
    commit(
      () => {
        const current = selectedPosition()!;
        if (selection?.kind === "node") {
          const p = [...current] as V3;
          p[index] = value;
          moveNode(project, selection.id, p);
        } else if (selection?.kind === "site") {
          const site = project.sites!.find((s) => s.id === selection!.id)!;
          site.position[index] = value;
        } else if (selection) {
          const delta: V3 = [0, 0, 0];
          delta[index] = value - current[index];
          translateRoad(project, selection.id, delta);
        }
      },
      { resolve: true },
    );
    return;
  }
  if (!input.dataset.prop) return;
  if (input.type === "range") {
    if (sliderBefore) remember(sliderBefore);
    sliderBefore = null;
    renderOutliner();
    return;
  }
  const numeric = [
    "drivewaySide",
    "activeDriveway",
    "lanes",
    "laneWidth",
    "sidewalk",
    "crossfall",
    "inletSpacing",
    "railHeight",
    "postSpacing",
    "speedLimit",
    "parkingAngle",
    "manholeDiameter",
    "manholeSpacing",
    "manholeOffset",
  ];
  const value =
    input.type === "checkbox"
      ? input.checked
      : numeric.includes(input.dataset.prop)
        ? Number(input.value)
        : input.value;
  commit(() => setRoadProperty(input.dataset.prop!, value));
});
$("modal").addEventListener("submit", (e) => {
  if ((e.target as HTMLElement).id !== "rename-form") return;
  e.preventDefault();
  const name = ($("rename-input") as HTMLInputElement).value.trim();
  if (!name) return;
  commit(() => {
    if (selection?.kind === "node") getNode(project, selection.id).name = name;
    else if (selection?.kind === "site")
      project.sites!.find((s) => s.id === selection!.id)!.name = name;
    else if (selection) selectedRoads()[0].name = name;
  });
  ($("modal") as HTMLDialogElement).close();
});
$("modal").addEventListener("click", (e) => {
  if (e.target === $("modal")) {
    const r = $("modal").getBoundingClientRect(),
      p = e as MouseEvent;
    if (
      p.clientX < r.left ||
      p.clientX > r.right ||
      p.clientY < r.top ||
      p.clientY > r.bottom
    )
      ($("modal") as HTMLDialogElement).close();
  }
});
$("scene-tree").addEventListener("keydown", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-select]",
  );
  if (!target) return;
  const items = [
      ...$("scene-tree").querySelectorAll<HTMLElement>("[data-select]"),
    ],
    index = items.indexOf(target);
  if (e.key === "Enter")
    setSelection({
      kind: target.dataset.kind as "node" | "road" | "site",
      id: target.dataset.select!,
    });
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[
      Math.max(
        0,
        Math.min(items.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)),
      )
    ].focus();
  }
});
$("scene-tree").addEventListener("dblclick", () => {
  scene?.focusSelection();
});
$("project-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024)
      throw new Error("Project file is too large (maximum 8 MB).");
    const imported = parseProject(JSON.parse(await file.text()));
    const loaded = commit(
      () => {
        project = imported;
        resolveCrossings(project);
        network = buildNetwork(project, { detail: geometryDetail });
        selection = network.junctions[0]
          ? { kind: "node", id: network.junctions[0].node.id }
          : null;
        setMode("select");
      },
      { fit: true },
    );
    if (loaded) toast("Road project imported.");
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "Could not open the project file.",
      true,
    );
  }
  input.value = "";
});
$("save-button").addEventListener("click", () => saveProject());
$("undo-button").addEventListener("click", undoProject);
$("redo-button").addEventListener("click", redoProject);
$("templates-button").addEventListener("click", openTemplates);
$("outliner-add").addEventListener("click", openTemplates);
$("help-button").addEventListener("click", openHelp);
$("shortcuts-button").addEventListener("click", openHelp);
$("snap-button").addEventListener("click", () => {
  snapEnabled = !snapEnabled;
  plan.setSnap(snapEnabled);
  $("snap-button").setAttribute("aria-pressed", String(snapEnabled));
});
$("frame-all").addEventListener("click", () => {
  plan.fit();
  scene?.fit();
});
$("zoom-in").addEventListener("click", () => plan.zoom(1.22));
$("zoom-out").addEventListener("click", () => plan.zoom(1 / 1.22));
$("zoom-reset").addEventListener("click", () => plan.fit());
$("grid-toggle").addEventListener("click", toggleGrid);
$("plan-labels").addEventListener("click", toggleLabels);
$("context-toggle").addEventListener("click", toggleContext);
$("lighting-toggle").addEventListener("click", () => {
  night = !night;
  scene?.setNight(night);
  $("lighting-toggle").setAttribute("aria-pressed", String(night));
});
$("surface-inspect").addEventListener("click", () => {
  if (!scene?.inspectSelection())
    toast("Select a road, junction or parking surface first.", true);
});
$("geometry-detail").addEventListener("change", (e) =>
  setGeometryDetail((e.target as HTMLSelectElement).value as GeometryDetail),
);
$("scene-focus").addEventListener("click", () => scene?.focusSelection());
$("scene-fit").addEventListener("click", () => scene?.fit());
$("shade-style").addEventListener("change", (e) =>
  scene?.setStyle((e.target as HTMLSelectElement).value),
);
$("rebuild-button").addEventListener("click", () => {
  commit(() => resolveCrossings(project));
  toast(
    network.diagnostics.length
      ? `${network.diagnostics.length} geometry warnings. Review the inspector.`
      : `Rebuilt ${network.meshes.length} mesh groups. All junctions validated.`,
    network.diagnostics.some((d) => d.level === "error"),
  );
});
$("library-collapse").addEventListener("click", () => {
  const collapsed = $("asset-library").classList.toggle("collapsed");
  $("library-collapse").setAttribute(
    "aria-label",
    collapsed ? "Expand asset library" : "Collapse asset library",
  );
  $("library-collapse").setAttribute(
    "aria-expanded",
    String(
      !document
        .querySelector(".asset-library")!
        .classList.contains("collapsed"),
    ),
  );
});
$("toggle-outliner").addEventListener("click", () => {
  $("outliner").classList.toggle("open");
  $("inspector").classList.remove("open");
});
$("toggle-inspector").addEventListener("click", () => {
  $("inspector").classList.toggle("open");
  $("outliner").classList.remove("open");
});
$("inspector-close").addEventListener("click", () =>
  $("inspector").classList.remove("open"),
);
$("layers-menu").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.layer) {
    if (input.checked) hiddenLayers.delete(input.dataset.layer);
    else hiddenLayers.add(input.dataset.layer);
    scene?.setDetailLayer(input.dataset.layer, input.checked);
    plan.setDetailLayer(input.dataset.layer, input.checked);
  }
  if (input.id === "drainage-overlay") plan.setDrainage(input.checked);
});
$("scene-host").addEventListener("render-error", (e) =>
  toast((e as CustomEvent).detail, true),
);
(document.querySelector(".brand") as HTMLElement).addEventListener(
  "click",
  (e) => {
    e.preventDefault();
    openHelp();
  },
);

let gizmoDrag: {
  axis: string;
  start: [number, number];
  position: V3;
  world: V3 | null;
  meters: number;
  target: "node" | "road" | "site";
  id: string;
} | null = null;
$("scene-gizmo").addEventListener("pointerdown", (e) => {
  const target = (e.target as Element).closest<HTMLElement>("[data-axis]");
  if (!target || !selection || !scene) return;
  e.preventDefault();
  e.stopPropagation();
  const position = selectedPosition()!;
  gizmoDrag = {
    axis: target.dataset.axis!,
    start: [e.clientX, e.clientY],
    position: [...position],
    world: scene.worldOnPlane(e.clientX, e.clientY, position[1]),
    meters: scene.verticalMetersPerPixel(),
    target: selection.kind,
    id: selection.id,
  };
  scene.setEnabled(false);
  handleDrag({
    target: gizmoDrag.target,
    id: gizmoDrag.id,
    value: position,
    phase: "start",
  });
});
window.addEventListener("pointermove", (e) => {
  if (!gizmoDrag || !scene) return;
  const drag = gizmoDrag,
    delta: V3 = [0, 0, 0];
  if (drag.axis === "y") delta[1] = -(e.clientY - drag.start[1]) * drag.meters;
  else {
    const p = scene.worldOnPlane(e.clientX, e.clientY, drag.position[1]);
    if (p && drag.world) {
      delta[0] = p[0] - drag.world[0];
      delta[2] = p[2] - drag.world[2];
    }
    if (drag.axis === "x") delta[2] = 0;
    if (drag.axis === "z") delta[0] = 0;
  }
  let value = drag.target === "road" ? delta : add(drag.position, delta);
  if (snapEnabled && !e.altKey)
    value = value.map((v) => Math.round(v * 2) / 2) as V3;
  handleDrag({ target: drag.target, id: drag.id, value, phase: "move" });
});
window.addEventListener("pointerup", () => {
  if (!gizmoDrag) return;
  handleDrag({
    target: gizmoDrag.target,
    id: gizmoDrag.id,
    value: gizmoDrag.position,
    phase: "end",
  });
  gizmoDrag = null;
  scene?.setEnabled(true);
});
window.addEventListener("pointercancel", () => {
  if (!gizmoDrag) return;
  handleDrag({
    target: gizmoDrag.target,
    id: gizmoDrag.id,
    value: gizmoDrag.position,
    phase: "end",
  });
  gizmoDrag = null;
  scene?.setEnabled(true);
});
let libraryDragging = false,
  librarySize: number | null = null;
const libraryDock = document.querySelector<HTMLElement>(".asset-library")!;
function libraryHeightLimit() {
  return Math.max(
    160,
    document.querySelector<HTMLElement>(".workspace")!.clientHeight -
      (window.innerWidth < 700 ? 320 : 260),
  );
}
function setLibraryHeight(height: number) {
  librarySize = Math.round(
    Math.max(160, Math.min(libraryHeightLimit(), height)),
  );
  libraryDock.style.setProperty("--library-height", `${librarySize}px`);
  $("library-divider").setAttribute("aria-valuenow", String(librarySize));
}
$("library-divider").addEventListener("pointerdown", (e) => {
  libraryDragging = true;
  $("library-divider").setPointerCapture(e.pointerId);
  e.preventDefault();
});
$("library-divider").addEventListener("pointermove", (e) => {
  if (libraryDragging)
    setLibraryHeight(libraryDock.getBoundingClientRect().bottom - e.clientY);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  $("library-divider").addEventListener(event, () => {
    libraryDragging = false;
  });
$("library-divider").addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    const height = libraryDock.getBoundingClientRect().height;
    setLibraryHeight(
      e.key === "Home"
        ? 160
        : e.key === "End"
          ? libraryHeightLimit()
          : height + (e.key === "ArrowUp" ? 24 : -24),
    );
  }
});
new ResizeObserver(() => {
  if (librarySize !== null && librarySize > libraryHeightLimit())
    setLibraryHeight(librarySize);
  $("library-divider").setAttribute(
    "aria-valuenow",
    String(Math.round(libraryDock.getBoundingClientRect().height)),
  );
  $("library-divider").setAttribute(
    "aria-valuemax",
    String(libraryHeightLimit()),
  );
}).observe(document.querySelector<HTMLElement>(".workspace")!);

let dividerDragging = false;
const setSplit = (percent: number) => {
  const value = Math.max(26, Math.min(68, percent));
  $("viewports").style.setProperty("--split", `${value}%`);
  $("viewport-divider").setAttribute(
    "aria-valuenow",
    String(Math.round(value)),
  );
};
$("viewport-divider").addEventListener("pointerdown", (e) => {
  dividerDragging = true;
  ($("viewport-divider") as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
});
$("viewport-divider").addEventListener("pointermove", (e) => {
  if (!dividerDragging) return;
  const r = $("viewports").getBoundingClientRect();
  setSplit(((e.clientX - r.left) / r.width) * 100);
});
$("viewport-divider").addEventListener(
  "pointerup",
  () => (dividerDragging = false),
);
$("viewport-divider").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const value =
      parseFloat(
        getComputedStyle($("viewports")).getPropertyValue("--split"),
      ) || 46;
    setSplit(value + (e.key === "ArrowRight" ? 3 : -3));
  }
});
window.addEventListener("keydown", (e) => {
  const input = ["INPUT", "SELECT", "TEXTAREA"].includes(
    (e.target as HTMLElement).tagName,
  );
  if (($("modal") as HTMLDialogElement).open) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveProject();
    return;
  }
  if (e.key === "Escape") {
    closeMenus();
    setMode("select");
    return;
  }
  if (input) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redoProject() : undoProject();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redoProject();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
    e.preventDefault();
    ($("project-file") as HTMLInputElement).click();
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  const key = e.key.toLowerCase();
  if (key === "v") setMode("select");
  if (key === "d" || key === "p") setMode("draw");
  if (key === "w") setMode("move");
  if (key === "h") setMode("pan");
  if (key === "m") setMode("measure");
  if (key === "b") {
    libraryTab = "sites";
    renderLibrary();
    beginPlace("parking");
  }
  if (key === "g") toggleGrid();
  if (key === "s") $("snap-button").click();
  if (key === "f") {
    plan.fit();
    scene?.fit();
  }
  if (key === "delete" || key === "backspace") {
    e.preventDefault();
    deleteSelected();
  }
  if (key === "a" && e.shiftKey) {
    e.preventDefault();
    openTemplates();
  }
  if (key === "?") openHelp();
  if (key === "/") {
    e.preventDefault();
    ($("scene-search") as HTMLInputElement).focus();
  }
  if (key === "escape") {
    closeMenus();
    setMode("select");
    $("outliner").classList.remove("open");
    $("inspector").classList.remove("open");
  }
});
setInterval(() => {
  if (scene)
    $("status-fps").textContent = scene.getRenderStats().active
      ? `${scene.fps} fps`
      : "Idle";
}, 1200);
window.addEventListener("pagehide", () => {
  if (dirty) saveProject(false);
});

// Small, documented integration API: the HTML can be embedded in an engine tool
// and the host can inspect the graph or listen for generated meshes.
Object.defineProperty(window, "frontier", {
  value: {
    getProject: () => clone(project),
    getNetwork: () => network,
    getPreviewStats: () => scene?.getRenderStats() ?? null,
    getSelection: () => selection,
    worldToPlan: (point: V3) => plan.worldToScreen(point),
    select: setSelection,
    setMode,
    setGeometryDetail,
    inspectSelection: () => scene?.inspectSelection() ?? false,
    inspectInfrastructure,
    inspectRoadDetail,
    insertBridge: insertBridgeOnSelection,
    inspectPlanning,
    inspectFootway,
    addDriveway,
    loadTemplate,
    placeSite: beginPlace,
    exportProject,
    save: saveProject,
    undo: undoProject,
    redo: redoProject,
    moveJoint: (id: string, position: V3) =>
      commit(() => moveNode(project, id, position), { resolve: true }),
  },
  writable: false,
});
