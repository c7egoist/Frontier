// Level Designer: the editor around the Lobby level, in the Component Viewer's language.
//   left     Outliner (Environment · Lobby · Hotspots · Premium) and Content (primitives, lights, compiled assets,
//            imports); Add is a Premium feature, Basic shows the tier lock
//   centre   the level viewport: Design / Preview, Basic / Premium, the gizmo bar (Select / Move / Rotate / Scale, snap,
//            world / local), undo / redo, frame, dot floor; the hotspot strip lives in the drawer
//   right    Details for the selection: transform, entity properties, hotspot view / target / options, environment
//   preview  every dock hidden; only the hotspot dots and the open hotspot's swatches remain (Esc returns)
import { THREE, Stage } from '../Shared/Studio/Render.js';
import { addHalo } from '../Shared/Studio/Visuals.js';
import { createCameraHud } from '../Shared/Studio/Camera.js';
import { $, el, iconEl, section, panel, rangeField, numberField, segmented, toggle, selectField, vec3Field, colorField, textField, rows, metrics, toast, download } from '../Shared/Studio/Ui.js';
import { icon, hydrateIcons } from '../Shared/Studio/Icons.js';
import * as Doc from './LevelDocument.js';
import { LobbyEnvironment } from './LobbyEnvironment.js';
import { buildEntity, paintVehicle, applyTransform, HotspotLayer } from './LobbyScene.js';
import { Gizmo } from './Gizmo.js';

const DEG = Math.PI / 180;
const ENV_ROWS = [
  { id: 'env:sky', name: 'Sky', icon: 'sky', sub: 'Gradient · fog' },
  { id: 'env:sun', name: 'Sun', icon: 'sun', sub: 'Key light · shadows' },
  { id: 'env:studio', name: 'Studio', icon: 'viewport', sub: 'Cyclorama · glossy floor' },
];
const GIZMO_MODES = [
  { id: 'select', icon: 'pointer', label: 'Select', title: 'Select (Q)' },
  { id: 'move', icon: 'move', label: 'Move', title: 'Move (W)' },
  { id: 'rotate', icon: 'rotate', label: 'Rotate', title: 'Rotate (E)' },
  { id: 'scale', icon: 'scale', label: 'Scale', title: 'Scale (R)' },
];

export function createLevelDesigner({ level: initial, assets, compileImport }) {
  document.body.classList.add('level');
  let level = Doc.normaliseLevel(initial || Doc.createLobbyLevel());
  let history = Doc.createHistory(level);
  let role = 'premium';
  let selectedId = null;
  let preview = false;
  let openId = null;
  let parts = null;
  let leftTab = 'outliner';
  let spinAngle = 0;
  let restoreHalo = null;
  let haloNode = null;
  const nodes = new Map();          // entity id → { node, key }
  const thumbs = new Map();         // hotspot id → data URL (runtime only)
  const contentAssets = [];         // compiled assets offered in Content (vehicle parts, imports)

  // ------------------------------------------------------------------------------------------------------ stage
  const canvas = $('Viewport');
  const stage = new Stage(canvas, { background: '#dfe6ee', grid: false, shadows: true });
  const env = new LobbyEnvironment(stage);
  const hotspots = new HotspotLayer(stage);
  hotspots.frameOf = (h) => { const n = nodes.get(h.target.entity); return n ? n.node.matrixWorld : null; };
  const anchorProxy = new THREE.Object3D();
  anchorProxy.name = 'HotspotAnchor';
  stage.overlay.add(anchorProxy);
  const gizmo = new Gizmo(stage, {
    onDrag: (object) => liveDrag(object),
    onCommit: (object) => commitTransform(object),
    onRefused: () => toast(Doc.refusal(level, selectedId, role) || 'Locked'),
  });

  // --------------------------------------------------------------------------------------------- scene sync
  function entityKey(r) {
    const props = { ...r.props };
    delete props.colours; delete props.spin; delete props.wing;
    return JSON.stringify([r.type, props, r.type === 'Vehicle' ? !!parts : 0]);
  }

  function syncScene() {
    const keep = new Set();
    for (const r of level.entities) {
      keep.add(r.id);
      let rec = nodes.get(r.id);
      const key = entityKey(r);
      if (!rec || rec.key !== key) {
        if (rec && rec.node === haloNode) dropHalo();
        if (rec) stage.content.remove(rec.node);
        rec = { node: buildEntity(r, { parts, assets }), key };
        nodes.set(r.id, rec);
        stage.content.add(rec.node);
      }
      applyTransform(rec.node, r.transform);
      if (spinAngle && (r.type === 'Vehicle' || r.type === 'Turntable')) rec.node.rotation.y += spinAngle;
      if (r.type === 'Vehicle' && rec.node.userData.painted !== JSON.stringify(r.props.colours)) {
        if (rec.node === haloNode) dropHalo();      // the halo swaps in material clones; paint the originals
        paintVehicle(rec.node, r.props.colours);
        rec.node.userData.painted = JSON.stringify(r.props.colours);
      }
      if (r.type === 'Vehicle') {
        if (rec.node.userData.wing) rec.node.userData.wing.visible = r.props.wing !== false;
      }
      rec.node.visible = Doc.queryShown(r, role);
    }
    for (const [id, rec] of nodes) if (!keep.has(id)) { if (rec.node === haloNode) dropHalo(); stage.content.remove(rec.node); nodes.delete(id); }
    env.apply(level.environment, role);
    env.showDesignVisuals(!preview);
    hotspots.sync(level.hotspots);
    hotspots.design = !preview;
    stage.content.updateMatrixWorld(true);
    applySelection();
  }

  function dropHalo() { if (restoreHalo) { restoreHalo(); restoreHalo = null; haloNode = null; } }

  // Halo and gizmo follow the selection (hotspots move as a point; locked records show a grey gizmo that refuses).
  function applySelection() {
    const sort = Doc.recordSort(level, selectedId);
    hotspots.selected = sort === 'hotspot' ? selectedId : null;
    const n = sort === 'entity' ? nodes.get(selectedId) : null;
    const haloTarget = !preview && n && n.node.visible ? n.node : null;
    if (haloNode !== haloTarget) { dropHalo(); if (haloTarget) { restoreHalo = addHalo(haloTarget); haloNode = haloTarget; } }
    if (preview || !sort) { gizmo.detach(); return; }
    const locked = !Doc.queryEditable(level, selectedId, role);
    if (sort === 'entity') {
      if (!haloTarget) { gizmo.detach(); return; }
      gizmo.attach(n.node, { locked });
    } else if (sort === 'light') {
      const rec = env.lightObjects.get(selectedId);
      if (rec && rec.root.visible) gizmo.attach(rec.root, { locked }); else gizmo.detach();
    } else {
      placeAnchorProxy(Doc.findRecord(level, selectedId));
      gizmo.attach(anchorProxy, { moveOnly: true });
    }
  }

  function placeAnchorProxy(h) {
    anchorProxy.position.copy(hotspots.anchorWorld(h));
    anchorProxy.quaternion.identity();
    anchorProxy.updateMatrixWorld(true);
  }

  // Gizmo results back into the document. Hotspot anchors are stored in the target entity's frame.
  function transformFrom(object) {
    const r3 = (n) => Math.round(n * 10000) / 10000;
    const e = new THREE.Euler().setFromQuaternion(object.quaternion, 'XYZ');
    return { location: object.position.toArray().map(r3), rotation: [e.x, e.y, e.z].map((a) => r3(a / DEG)), scale: object.scale.toArray().map(r3) };
  }

  function anchorLocal(world, h) {
    const n = nodes.get(h.target.entity);
    if (!n) return world.toArray();
    n.node.updateMatrixWorld(true);
    return world.clone().applyMatrix4(n.node.matrixWorld.clone().invert()).toArray().map((v) => Math.round(v * 1000) / 1000);
  }

  function liveDrag(object) {
    const sort = Doc.recordSort(level, selectedId);
    if (sort === 'hotspot') { const h = Doc.findRecord(level, selectedId); h.anchor = anchorLocal(object.position, h); }
    updateReadout();
  }

  function commitTransform(object) {
    const sort = Doc.recordSort(level, selectedId);
    const next = sort === 'hotspot' ? { location: anchorLocal(object.position, Doc.findRecord(level, selectedId)) } : transformFrom(object);
    const res = Doc.writeTransform(level, selectedId, role, next);
    if (!res.ok) { toast(res.reason); syncScene(); return; }
    commit({ details: true });
  }

  // ------------------------------------------------------------------------------------------- commit · history
  function commit({ details = false, tree = true } = {}) {
    history.push(level);
    syncScene();
    if (tree) renderTree();
    renderDrawer();
    renderStats();
    if (details) renderDetails();
    renderHistory();
    updateReadout();
  }

  // Live edits (slider drags): scene only; the matching change event commits.
  function live() { syncScene(); updateReadout(); }

  function replaceLevel(next, note) {
    level = Doc.normaliseLevel(next);
    if (!Doc.findRecord(level, selectedId) && !String(selectedId).startsWith('env:')) selectedId = null;
    if (openId && !level.hotspots.some((h) => h.id === openId)) closeHotspot({ fly: false });
    syncScene();
    renderAll();
    if (note) toast(note);
  }

  function undo() { const s = history.undo(); if (s) replaceLevel(s, 'Undo'); else toast('Nothing to undo'); }
  function redo() { const s = history.redo(); if (s) replaceLevel(s, 'Redo'); else toast('Nothing to redo'); }

  // ------------------------------------------------------------------------------------------------- hotspots
  const yawOf = (node) => new THREE.Euler().setFromQuaternion(node.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;

  function worldPose(h) {
    const p = Doc.hotspotPose(h);
    const n = nodes.get(h.target.entity);
    const target = new THREE.Vector3().fromArray(p.target);
    if (!n) return { ...p, target };
    n.node.updateMatrixWorld(true);
    return { ...p, target: target.applyMatrix4(n.node.matrixWorld), yaw: p.yaw + yawOf(n.node) };
  }

  function localPose(h) {
    const rig = stage.rig;
    const n = nodes.get(h.target.entity);
    if (!n) return { target: rig.target.toArray(), yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance, focal: rig.focal };
    n.node.updateMatrixWorld(true);
    const t = rig.target.clone().applyMatrix4(n.node.matrixWorld.clone().invert());
    return { target: t.toArray(), yaw: rig.yaw - yawOf(n.node), pitch: rig.pitch, distance: rig.distance, focal: rig.focal };
  }

  // instant: cut instead of the eased flight (tests, screenshots).
  function flyHotspot(id, { open = true, instant = false } = {}) {
    const h = level.hotspots.find((x) => x.id === id);
    if (!h) return false;
    if (instant) stage.rig.setNow(worldPose(h)); else stage.rig.flyTo(worldPose(h), { duration: 0.95 });
    if (open) { openId = id; hotspots.openHotspot(id); }
    clearTimeout(flyHotspot.timer);
    flyHotspot.timer = setTimeout(() => { if (!thumbs.has(id)) captureThumb(id); }, 1150);
    renderDrawer();
    updateReadout();
    return true;
  }

  function closeHotspot({ fly = true } = {}) {
    openId = null;
    hotspots.close();
    if (fly && preview) flyStart();
    renderDrawer();
    updateReadout();
  }

  function flyStart({ instant = false } = {}) {
    const s = level.start;
    const pose = { target: new THREE.Vector3().fromArray(s.target), yaw: s.yaw * DEG, pitch: s.pitch * DEG, distance: s.distance, focal: s.focal };
    if (instant) stage.rig.setNow(pose); else stage.rig.flyTo(pose, { duration: 1.0 });
  }

  function applySwatch(id, index) {
    const color = Doc.applyOption(level, id, index);
    if (!color) return;
    commit({ details: Doc.recordSort(level, selectedId) === 'hotspot' || selectedId === (level.hotspots.find((h) => h.id === id) || {}).target?.entity });
  }

  // Thumbnail of the current frame without the overlay (dots, gizmo), for the hotspot strip.
  function captureThumb(id) {
    try {
      const was = stage.overlay.visible;
      stage.overlay.visible = false;
      stage.renderer.render(stage.scene, stage.camera);
      stage.overlay.visible = was;
      const c = document.createElement('canvas');
      c.width = 304; c.height = 168;
      const g = c.getContext('2d');
      const src = stage.renderer.domElement;
      const aspect = c.width / c.height, sw = Math.min(src.width, src.height * aspect), sh = sw / aspect;
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.8);
      if (url && url.length > 64) { thumbs.set(id, url); renderDrawer(); }
    } catch (error) { /* thumbnails are a nicety */ }
  }

  // ---------------------------------------------------------------------------------------------- selection
  function select(id) {
    selectedId = id || null;
    applySelection();
    renderTree();
    renderDetails();
    renderDrawer();
    updateReadout();
  }

  function frameSelected() {
    const sort = Doc.recordSort(level, selectedId);
    if (sort === 'hotspot') { flyHotspot(selectedId); return; }
    let box = null;
    if (sort === 'entity') { const n = nodes.get(selectedId); if (n) box = new THREE.Box3().setFromObject(n.node, true); }
    if (sort === 'light') { const rec = env.lightObjects.get(selectedId); if (rec) box = new THREE.Box3().setFromCenterAndSize(rec.root.position.clone(), new THREE.Vector3(1.5, 1.5, 1.5)); }
    if (box && !box.isEmpty()) stage.rig.frame(box, { keepAngle: true, animate: true, fill: 1.4 });
    else flyStart();
  }

  // ----------------------------------------------------------------------------------------------------- edits
  function placementPoint() {
    const t = stage.rig.target.clone();
    t.y = 0;
    if (Math.hypot(t.x, t.z) < 4.2) {
      const cam = stage.camera.position.clone().setY(0);
      const side = new THREE.Vector3(cam.z, 0, -cam.x).normalize();
      t.copy(side.lengthSq() ? side : new THREE.Vector3(1, 0, 0)).multiplyScalar(4.6);
    }
    const r = (n) => Math.round(n * 4) / 4;
    return [r(t.x), 0, r(t.z)];
  }

  function addObject(spec) {
    const [sortKey, which] = spec.split(':');
    const at = placementPoint();
    let res;
    if (sortKey === 'shape') res = Doc.addPrimitive(level, role, which, { location: at });
    else if (sortKey === 'light') res = Doc.addLight(level, role, which, { location: [at[0], 3, at[2]] });
    else if (sortKey === 'asset') res = Doc.addMesh(level, role, assets.get(which), { location: at });
    else if (sortKey === 'hotspot') return addHotspotFromView();
    else res = { ok: false, reason: `Unknown object ${spec}` };
    if (!res.ok) { toast(res.reason); return null; }
    $('AddMenu').hidden = true;
    commit();
    select(res.record.id);
    toast(`${res.record.name} added to the premium layer`);
    return res.record;
  }

  function addHotspotFromView() {
    const vehicle = level.entities.find((e) => e.type === 'Vehicle');
    const draft = { target: { entity: vehicle ? vehicle.id : '', slot: 'paint' } };
    const pose = localPose(draft);
    const res = Doc.addHotspot(level, { target: pose.target, yaw: pose.yaw / DEG, pitch: pose.pitch / DEG, distance: pose.distance, focal: pose.focal }, { name: 'Hotspot', anchor: pose.target, target: draft.target });
    commit();
    select(res.record.id);
    toast(`${res.record.name} placed at the view's pivot · move its dot with the gizmo`);
    return res.record;
  }

  function removeSelected() {
    if (!selectedId || String(selectedId).startsWith('env:')) return;
    const res = Doc.removeRecord(level, selectedId, role);
    if (!res.ok) { toast(res.reason); return; }
    if (openId === selectedId) closeHotspot({ fly: false });
    selectedId = null;
    commit({ details: true });
    toast(`${res.record.name} removed`);
  }

  function duplicateSelected() {
    if (!selectedId || String(selectedId).startsWith('env:')) return;
    const res = Doc.duplicateRecord(level, selectedId, role);
    if (!res.ok) { toast(res.reason); return; }
    commit();
    select(res.record.id);
  }

  function assignRole(next) {
    role = next;
    $('RoleBar').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === role));
    syncScene();
    if (selectedId && !String(selectedId).startsWith('env:') && !Doc.queryShown(Doc.findRecord(level, selectedId) || {}, role) && Doc.recordSort(level, selectedId) !== 'hotspot') selectedId = null;
    renderAll();
    toast(role === 'premium' ? 'Premium tier · add and edit your own objects' : 'Basic tier · the Lobby as authored; premium objects hidden');
  }

  function assignPreview(on) {
    preview = !!on;
    document.body.classList.toggle('preview', preview);
    $('CentreModes').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === (preview ? 'preview' : 'design')));
    spinAngle = 0;
    if (preview) {
      $('AddMenu').hidden = true;
      if (openId) closeHotspot({ fly: false });   // Preview opens on the start view with every dot showing
      flyStart();
      const hint = $('PreviewHint');
      hint.hidden = false; hint.classList.add('show');
      clearTimeout(assignPreview.timer);
      assignPreview.timer = setTimeout(() => hint.classList.remove('show'), 2400);
    } else {
      $('PreviewHint').hidden = true;
      if (openId) closeHotspot({ fly: false });
    }
    syncScene();
    requestAnimationFrame(() => stage.resize());
    updateReadout();
  }

  // Turntable spin in Preview (paused while a hotspot is open, so its view holds still).
  stage.frameCallbacks.add((dt) => {
    if (!preview || openId) return;
    const t = level.entities.find((e) => e.type === 'Turntable' && e.props.spin);
    if (!t) return;
    spinAngle += t.props.spin * DEG * dt;
    for (const r of level.entities) {
      if (r.type !== 'Vehicle' && r.type !== 'Turntable') continue;
      const n = nodes.get(r.id);
      if (n) { applyTransform(n.node, r.transform); n.node.rotation.y += spinAngle; }
    }
  });

  // --------------------------------------------------------------------------------------------------- left
  function assignLeftTab(tab) {
    leftTab = tab;
    for (const t of document.querySelectorAll('[data-left]')) t.classList.toggle('active', t.dataset.left === tab);
    $('LeftOutliner').hidden = tab !== 'outliner';
    $('LeftContent').hidden = tab !== 'content';
    if (tab === 'content') renderContent();
  }

  function renderStats() {
    const s = Doc.levelStats(level, role);
    $('StatEntities').textContent = String(s.entities + s.lights);
    $('StatHotspots').textContent = String(s.hotspots);
    $('LevelCaption').textContent = `${level.name} · ${role === 'premium' ? 'Premium' : 'Basic'} tier`;
    $('LevelTitle').textContent = level.name;
    $('LevelTabName').textContent = level.name;
    const tag = $('RoleTag');
    tag.textContent = role === 'premium' ? 'PREMIUM' : 'BASIC';
    tag.className = `state-tag ${role === 'premium' ? 'premium' : 'live'}`;
    $('AddBtn').classList.toggle('stale', false);
    $('AddBtn').title = role === 'premium' ? 'Add an object or light (premium layer)' : 'Adding objects is a Premium feature';
  }

  function collection(title, note, count, iconName = 'folder') {
    return el('div', { class: 'collection' }, iconEl(iconName, 16), el('div', {}, el('b', {}, title), el('small', {}, note)), el('span', { class: 'count' }, String(count)));
  }

  function treeRow({ id, name, sub, iconName, record = null, sort = null }) {
    const editable = record && Doc.queryEditable(level, id, role);
    const premium = record && record.layer === 'premium';
    const row = el('div', {
      class: `entity comp-row tree-row ${id === selectedId ? 'active' : ''} ${premium ? 'premium-row' : ''} ${record && record.visible === false ? 'hidden-row' : ''}`,
      role: 'treeitem', tabindex: 0, dataset: { id, search: `${name} ${sub}`.toLowerCase() },
    }, iconEl(iconName, 16, 'entity-icon'), el('div', {}, el('b', {}, name), el('small', {}, sub)));
    if (record && sort !== 'hotspot') {
      if (record.layer === 'base') {
        const lock = el('button', { type: 'button', class: `row-lock ${record.locked ? 'on' : ''}`, title: record.locked ? 'Locked lobby item (click to unlock for authoring)' : 'Unlocked (click to lock)', html: icon(record.locked ? 'lock' : 'unlink', 13) });
        lock.addEventListener('click', (e) => { e.stopPropagation(); const res = Doc.toggleLock(level, id); if (res.ok) commit({ details: id === selectedId }); });
        row.append(lock);
      }
      const eye = el('button', { type: 'button', class: `eye ${record.visible === false ? 'off' : ''}`, title: editable ? 'Visibility' : Doc.refusal(level, id, role), html: icon(record.visible === false ? 'eyeOff' : 'eye', 14) });
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!Doc.queryEditable(level, id, role)) { toast(Doc.refusal(level, id, role)); return; }
        record.visible = record.visible === false; commit();
      });
      row.append(eye);
    }
    if (sort === 'hotspot') {
      const fly = el('button', { type: 'button', class: 'eye', title: 'Fly to this view', html: icon('camera', 14) });
      fly.addEventListener('click', (e) => { e.stopPropagation(); select(id); flyHotspot(id); });
      row.append(fly);
    }
    row.addEventListener('click', () => select(id));
    row.addEventListener('dblclick', () => { select(id); if (sort === 'hotspot') flyHotspot(id); else frameSelected(); });
    return row;
  }

  function renderTree() {
    const box = $('LevelTree');
    const scroll = box.scrollTop;
    box.replaceChildren();
    const q = $('OutlinerSearch').value.trim().toLowerCase();
    const keep = (name, sub = '') => !q || `${name} ${sub}`.toLowerCase().includes(q);
    const lights = level.environment.lights.filter((l) => Doc.queryShown({ ...l, visible: true }, role));
    box.append(collection('Environment', 'Sky, sun, studio and lights', ENV_ROWS.length + lights.length, 'sun'));
    for (const r of ENV_ROWS) if (keep(r.name, r.sub)) box.append(treeRow({ id: r.id, name: r.name, sub: r.sub, iconName: r.icon }));
    for (const l of lights) {
      const sub = `${Doc.LIGHT_TYPES[l.type].label} · ${l.layer}${l.locked ? ' · locked' : ''}`;
      if (keep(l.name, sub)) box.append(treeRow({ id: l.id, name: l.name, sub, iconName: Doc.LIGHT_TYPES[l.type].icon, record: l, sort: 'light' }));
    }
    const base = level.entities.filter((e) => e.layer === 'base');
    box.append(collection('Lobby', 'Authored lobby items', base.length, 'layers'));
    for (const e of base) {
      const sub = `${Doc.ENTITY_TYPES[e.type].label}${e.locked ? ' · locked' : ' · unlocked'}`;
      if (keep(e.name, sub)) box.append(treeRow({ id: e.id, name: e.name, sub, iconName: Doc.ENTITY_TYPES[e.type].icon, record: e, sort: 'entity' }));
    }
    box.append(collection('Hotspots', 'Configurator dots and their views', level.hotspots.length, 'hotspot'));
    level.hotspots.forEach((h, i) => {
      const sub = `${Doc.VEHICLE_SLOTS[h.target.slot].label} · ${h.options.length} options · ${i + 1}`;
      if (keep(h.name, sub)) box.append(treeRow({ id: h.id, name: h.name, sub, iconName: 'hotspot', record: h, sort: 'hotspot' }));
    });
    const premium = level.entities.filter((e) => e.layer === 'premium');
    box.append(collection('Premium', 'Objects Premium users add', premium.length, 'sparkle'));
    if (role !== 'premium') box.append(el('p', { class: 'tier-note' }, iconEl('lock', 13), premium.length ? `${premium.length} premium object${premium.length === 1 ? '' : 's'} hidden on the Basic tier.` : 'Premium users add their own objects here.'));
    else if (!premium.length) box.append(el('p', { class: 'tier-note' }, 'Empty. Use Add or the Content tab to place primitives, lights and imported objects.'));
    else for (const e of premium) {
      const sub = `${e.type === 'Primitive' ? Doc.PRIMITIVE_SHAPES[e.props.shape].label : Doc.ENTITY_TYPES[e.type].label} · premium`;
      if (keep(e.name, sub)) box.append(treeRow({ id: e.id, name: e.name, sub, iconName: e.type === 'Primitive' ? Doc.PRIMITIVE_SHAPES[e.props.shape].icon : Doc.ENTITY_TYPES[e.type].icon, record: e, sort: 'entity' }));
    }
    box.scrollTop = scroll;
  }

  // Catalogue shared by the Add menu and the Content tab.
  function catalogue() {
    return [
      { group: 'Primitives', list: Object.entries(Doc.PRIMITIVE_SHAPES).map(([id, s]) => ({ spec: `shape:${id}`, label: s.label, note: `${s.size.join(' × ')} m`, icon: s.icon })) },
      { group: 'Lights', list: Object.entries(Doc.LIGHT_TYPES).map(([id, s]) => ({ spec: `light:${id}`, label: s.label, note: id === 'area' ? 'Soft panel' : id === 'spot' ? 'Cone along +X' : 'Omni', icon: s.icon })) },
      { group: 'Assets', list: contentAssets.map((a) => ({ spec: `asset:${a.id}`, label: a.name, note: `${Math.round(a.out.geometry.indices.length / 3).toLocaleString()} tris · ${a.origin === 'sample' ? 'ControlVehicle part' : 'import'}`, icon: 'box', thumb: a.out.icon })) },
    ];
  }

  function renderAddMenu() {
    const list = $('AddList');
    list.replaceChildren();
    const q = $('AddSearch').value.trim().toLowerCase();
    for (const g of catalogue()) {
      const items = g.list.filter((x) => !q || x.label.toLowerCase().includes(q));
      if (!items.length) continue;
      list.append(el('div', { class: 'menu-group' }, g.group));
      for (const x of items) {
        const b = el('button', { type: 'button', class: 'menu-item', dataset: { spec: x.spec } }, x.thumb ? el('img', { src: x.thumb, alt: '' }) : iconEl(x.icon, 16), el('span', {}, x.label), el('small', {}, x.note));
        b.addEventListener('click', () => addObject(x.spec));
        list.append(b);
      }
    }
    list.append(el('div', { class: 'menu-group' }, 'Configurator'));
    const hs = el('button', { type: 'button', class: 'menu-item', dataset: { spec: 'hotspot:view' } }, iconEl('hotspot', 16), el('span', {}, 'Hotspot from view'), el('small', {}, 'any tier'));
    hs.addEventListener('click', () => { $('AddMenu').hidden = true; addHotspotFromView(); });
    list.append(hs);
  }

  function renderContent() {
    const box = $('ContentScroll');
    box.replaceChildren();
    const locked = role !== 'premium';
    $('TierChips').replaceChildren(el('span', { class: `chip ${locked ? 'warn' : 'ok'}` }, locked ? 'Basic · view only' : 'Premium · add enabled'), el('span', { class: 'chip dim' }, 'OBJ · glTF · STL · PLY · FCT1'));
    $('ContentCount').textContent = String(level.entities.filter((e) => e.layer === 'premium').length);
    if (locked) box.append(el('p', { class: 'tier-note' }, iconEl('lock', 13), 'Switch to Premium (top bar) to place your own objects in the Lobby.'));
    for (const g of catalogue()) {
      box.append(collection(g.group, g.group === 'Assets' ? 'Compiled meshes · imports appear here' : 'Placed beside the car on the premium layer', g.list.length, g.group === 'Lights' ? 'bulb' : g.group === 'Assets' ? 'folder' : 'cube'));
      for (const x of g.list) {
        const add = el('button', { type: 'button', class: 'tool round', title: locked ? 'Premium feature' : 'Add to the Lobby', html: icon(locked ? 'lock' : 'plus', 14) });
        add.addEventListener('click', () => addObject(x.spec));
        const thumb = el('div', { class: 'content-thumb sm' }, x.thumb ? el('img', { src: x.thumb, alt: '' }) : iconEl(x.icon, 18));
        box.append(el('div', { class: `content-row ${locked ? 'locked' : ''}`, dataset: { spec: x.spec } }, thumb, el('div', { class: 'content-meta' }, el('b', {}, x.label), el('small', {}, x.note)), el('div', { class: 'content-actions' }, add)));
      }
    }
  }

  // ------------------------------------------------------------------------------------------------- drawer
  function renderDrawer() {
    const body = $('DrawerBody');
    body.replaceChildren();
    level.hotspots.forEach((h, i) => {
      const thumb = el('div', { class: 'hotspot-thumb' }, thumbs.has(h.id) ? el('img', { src: thumbs.get(h.id), alt: '' }) : iconEl('hotspot', 22));
      const swatches = el('div', { class: 'swatch-row' }, ...h.options.map((o, k) => {
        const s = el('button', { type: 'button', class: `swatch ${k === h.choice ? 'on' : ''}`, title: o.label, style: { background: o.color } });
        s.addEventListener('click', (e) => { e.stopPropagation(); applySwatch(h.id, k); });
        return s;
      }));
      const card = el('button', { type: 'button', class: `hotspot-card ${h.id === openId ? 'active' : ''}`, dataset: { hotspot: h.id } }, thumb, el('b', {}, el('span', {}, h.name), el('kbd', {}, String(i + 1))), swatches);
      card.addEventListener('click', () => { select(h.id); flyHotspot(h.id); });
      body.append(card);
    });
  }

  // ------------------------------------------------------------------------------------------------ details
  function detailSection(name, ...children) {
    return el('div', { class: 'detail-section', dataset: { search: name.toLowerCase(), section: name.toLowerCase() } }, section(name.toUpperCase()), panel(...children));
  }

  function lockPanel(pnl, editable, reason) {
    if (editable) return pnl;
    for (const x of pnl.querySelectorAll('input, select, button')) x.disabled = true;
    pnl.querySelector('.panel')?.prepend(el('div', { class: 'locked-note' }, iconEl('lock', 12), reason));
    return pnl;
  }

  function header(iconName, name, subtitle, { rename = null, actions = [] } = {}) {
    const title = rename ? el('input', { class: 'name-input', value: name, spellcheck: 'false', 'aria-label': 'Name' }) : el('h1', {}, name);
    if (rename) title.addEventListener('change', () => rename(title.value.trim()));
    return el('div', { class: 'detail-head' }, el('span', { class: 'detail-glyph', html: icon(iconName, 20) }), el('div', { class: 'detail-title' }, title, el('div', { class: 'subtitle' }, subtitle)), el('div', { class: 'detail-actions' }, ...actions));
  }

  function actionButton(iconName, title, fn) {
    const b = el('button', { type: 'button', class: 'tool round', title, html: icon(iconName, 14) });
    b.addEventListener('click', fn);
    return b;
  }

  function renderDetails() {
    const box = $('Details');
    const scroll = box.scrollTop;
    box.replaceChildren();
    const sort = Doc.recordSort(level, selectedId);
    if (String(selectedId).startsWith('env:')) renderEnvironment(box);
    else if (sort === 'entity') renderEntity(box, Doc.findRecord(level, selectedId));
    else if (sort === 'light') renderLight(box, Doc.findRecord(level, selectedId));
    else if (sort === 'hotspot') renderHotspot(box, Doc.findRecord(level, selectedId));
    else renderLevel(box);
    const search = el('input', { type: 'search', class: 'detail-search', placeholder: 'Search details' });
    const head = box.querySelector('.detail-head');
    if (head) head.after(el('div', { class: 'search-wrap' }, iconEl('search', 14), search));
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const s of box.querySelectorAll('.detail-section')) {
        let any = !q || s.dataset.search.includes(q);
        for (const f of s.querySelectorAll('[data-search]')) { const hit = !q || any || f.dataset.search.includes(q); f.hidden = !hit; any ||= f.dataset.search.includes(q); }
        s.hidden = !any;
      }
    });
    hydrateIcons(box);
    box.scrollTop = scroll;
  }

  function renameRecord(r) {
    return (name) => { if (!name) return; r.name = name; commit(); };
  }

  function transformSection(r, editable) {
    const t = r.transform;
    const write = (key) => (v) => { const res = Doc.writeTransform(level, r.id, role, { [key]: v }); if (!res.ok) { toast(res.reason); renderDetails(); return; } commit(); };
    return lockPanel(detailSection('Transform',
      tagged(vec3Field({ label: 'Location', value: t.location, step: 0.05, unit: 'm', onChange: write('location') }), 'location'),
      tagged(vec3Field({ label: 'Rotation', value: t.rotation, step: 1, unit: 'deg', onChange: write('rotation') }), 'rotation'),
      tagged(vec3Field({ label: 'Scale', value: t.scale, step: 0.05, linkable: true, onChange: write('scale') }), 'scale'),
    ), editable, Doc.refusal(level, r.id, role));
  }

  const tagged = (node, search, bind = null) => { node.dataset.search = search; if (bind) node.dataset.bind = bind; return node; };
  const bound = (field, bind) => { const input = field.querySelector('input, select'); if (input) input.dataset.bind = bind; return field; };

  function renderEntity(box, r) {
    const editable = Doc.queryEditable(level, r.id, role);
    const cls = Doc.ENTITY_TYPES[r.type];
    box.append(
      el('div', { class: 'crumbs' }, `${level.name} / ${r.layer === 'premium' ? 'Premium' : 'Lobby'} / ${r.name}`),
      header(r.type === 'Primitive' ? Doc.PRIMITIVE_SHAPES[r.props.shape].icon : cls.icon, r.name, `${cls.label} · ${r.layer} layer${r.locked ? ' · locked' : ''}`, {
        rename: editable ? renameRecord(r) : null,
        actions: [
          actionButton('frame', 'Frame (F)', frameSelected),
          actionButton('copy', 'Duplicate (Ctrl+D)', duplicateSelected),
          actionButton('trash', 'Delete (Del)', removeSelected),
        ],
      }),
    );
    box.append(transformSection(r, editable));
    if (r.type === 'Vehicle') {
      // colours are configurator choices, so they stay editable on a locked vehicle (the hotspots write them too)
      const fields = Object.entries(Doc.VEHICLE_SLOTS).map(([slot, s]) => tagged(bound(colorField({ label: s.label, value: r.props.colours[slot], onChange: (v) => { r.props.colours[slot] = v; live(); clearTimeout(renderEntity.t); renderEntity.t = setTimeout(() => commit(), 250); } }), `colour-${slot}`), `colours ${s.label.toLowerCase()}`));
      box.append(detailSection('Colours', ...fields, el('p', {}, 'Configurator choices. Hotspot swatches write these slots; the vehicle stays locked in place.')));
      box.append(lockPanel(detailSection('Vehicle',
        toggle({ label: 'Rear wing', value: r.props.wing !== false, onChange: (v) => { r.props.wing = v; commit(); } }),
        rows([['Source', 'ControlVehicle · FCT1'], ['Parts', parts ? 'Body · 4 tyres · 4 rims · wing' : 'compiling…']]),
      ), editable, Doc.refusal(level, r.id, role)));
    }
    if (r.type === 'Turntable') {
      box.append(lockPanel(detailSection('Turntable',
        rangeField({ label: 'Radius', value: r.props.radius, min: 1, max: 6, step: 0.1, unit: 'm', onInput: (v) => { r.props.radius = v; live(); }, onChange: () => commit() }),
        colorField({ label: 'Colour', value: r.props.color, onChange: (v) => { r.props.color = v; live(); } }),
        rangeField({ label: 'Spin in Preview', value: r.props.spin, min: 0, max: 30, step: 1, unit: '°/s', onInput: (v) => { r.props.spin = v; }, onChange: () => commit() }),
      ), editable, Doc.refusal(level, r.id, role)));
    }
    if (r.type === 'Primitive') {
      box.append(lockPanel(detailSection('Primitive',
        selectField({ label: 'Shape', value: r.props.shape, options: Object.entries(Doc.PRIMITIVE_SHAPES).map(([id, s]) => ({ id, label: s.label })), onChange: (v) => { r.props.shape = v; commit({ tree: true }); } }),
        bound(colorField({ label: 'Colour', value: r.props.color, onChange: (v) => { r.props.color = v; syncScene(); clearTimeout(renderEntity.t); renderEntity.t = setTimeout(() => commit(), 250); } }), 'prim-colour'),
        rangeField({ label: 'Roughness', value: r.props.roughness, onInput: (v) => { r.props.roughness = v; live(); }, onChange: () => commit() }),
        rangeField({ label: 'Metalness', value: r.props.metalness, onInput: (v) => { r.props.metalness = v; live(); }, onChange: () => commit() }),
      ), editable, Doc.refusal(level, r.id, role)));
    }
    if (r.type === 'StaticMesh') {
      const a = assets.get(r.props.asset);
      box.append(detailSection('Static mesh', rows([['Asset', a ? a.name : `${r.props.assetName || r.props.asset} (not loaded)`], ['Triangles', a ? Math.round(a.out.geometry.indices.length / 3).toLocaleString() : '—']])));
    }
  }

  function renderLight(box, l) {
    const editable = Doc.queryEditable(level, l.id, role);
    const why = Doc.refusal(level, l.id, role);
    const touch = (key) => (v) => { l[key] = v; live(); };
    box.append(
      el('div', { class: 'crumbs' }, `${level.name} / Environment / ${l.name}`),
      header(Doc.LIGHT_TYPES[l.type].icon, l.name, `${Doc.LIGHT_TYPES[l.type].label} · ${l.layer} layer${l.locked ? ' · locked' : ''}`, {
        rename: editable ? renameRecord(l) : null,
        actions: [actionButton('frame', 'Frame (F)', frameSelected), actionButton('copy', 'Duplicate (Ctrl+D)', duplicateSelected), actionButton('trash', 'Delete (Del)', removeSelected)],
      }),
      transformSection(l, editable),
    );
    const fields = [
      colorField({ label: 'Colour', value: l.color, onChange: touch('color') }),
      rangeField({ label: 'Intensity', value: l.intensity, min: 0, max: l.type === 'spot' ? 200 : l.type === 'area' ? 10 : 60, step: 0.1, onInput: touch('intensity'), onChange: () => commit() }),
      rangeField({ label: 'Range', value: l.range, min: 0, max: 60, step: 0.5, unit: 'm', onInput: touch('range'), onChange: () => commit() }),
    ];
    if (l.type === 'spot') fields.push(rangeField({ label: 'Cone angle', value: l.angle, min: 2, max: 80, step: 1, unit: '°', onInput: touch('angle'), onChange: () => commit() }));
    if (l.type === 'area') fields.push(rangeField({ label: 'Width', value: l.width, min: 0.2, max: 10, step: 0.1, unit: 'm', onInput: touch('width'), onChange: () => commit() }), rangeField({ label: 'Height', value: l.height, min: 0.2, max: 6, step: 0.1, unit: 'm', onInput: touch('height'), onChange: () => commit() }));
    box.append(lockPanel(detailSection('Light', ...fields, el('p', {}, l.type === 'point' ? 'Omni light.' : 'Shines along its local +X; rotate it with the gizmo (E).')), editable, why));
  }

  function renderHotspot(box, h) {
    const v = h.view;
    const vehicles = level.entities.filter((e) => e.type === 'Vehicle' || e.layer === 'premium' || e.type === 'Turntable');
    box.append(
      el('div', { class: 'crumbs' }, `${level.name} / Hotspots / ${h.name}`),
      header('hotspot', h.name, `Hotspot · ${Doc.VEHICLE_SLOTS[h.target.slot].label} · key ${level.hotspots.indexOf(h) + 1}`, {
        rename: renameRecord(h),
        actions: [actionButton('camera', 'Fly to view', () => flyHotspot(h.id)), actionButton('copy', 'Duplicate (Ctrl+D)', duplicateSelected), actionButton('trash', 'Delete (Del)', removeSelected)],
      }),
    );
    const capture = el('button', { type: 'button', class: 'primary wide', dataset: { action: 'capture' } }, iconEl('camera', 14), 'Capture current view');
    capture.addEventListener('click', () => {
      Doc.captureView(h, localPose(h));
      thumbs.delete(h.id);
      captureThumb(h.id);
      commit({ details: true });
      toast(`${h.name}: view captured`);
    });
    const fly = el('button', { type: 'button', class: 'tool', dataset: { action: 'fly' } }, iconEl('play', 13), el('span', { class: 'label' }, 'Fly to view'));
    fly.addEventListener('click', () => flyHotspot(h.id));
    box.append(detailSection('View',
      rows([['Pivot', v.target.map((n) => n.toFixed(2)).join(', ')], ['Yaw · pitch', `${v.yaw.toFixed(1)}° · ${v.pitch.toFixed(1)}°`], ['Distance', `${v.distance.toFixed(2)} m`], ['Lens', `${Math.round(v.focal)} mm`]]),
      el('div', { class: 'button-row' }, fly), capture,
      el('p', {}, 'Frame the shot in the viewport, then capture it. Views are stored in the target\'s frame, so they follow the car.'),
    ));
    box.append(detailSection('Dot',
      tagged(vec3Field({ label: 'Anchor', value: h.anchor, step: 0.02, unit: 'm · target frame', onChange: (a) => { h.anchor = a; commit(); } }), 'anchor'),
      el('p', {}, 'Where the tiny dot sits on the car. Drag it with the gizmo (W) or type it here.'),
    ));
    box.append(detailSection('Target',
      selectField({ label: 'Entity', value: h.target.entity, options: [{ id: '', label: '—' }, ...vehicles.map((e) => ({ id: e.id, label: e.name }))], onChange: (val) => { h.target.entity = val; commit({ details: true }); } }),
      selectField({ label: 'Slot', value: h.target.slot, options: Object.entries(Doc.VEHICLE_SLOTS).map(([id, s]) => ({ id, label: s.label })), onChange: (val) => { h.target.slot = val; commit({ details: true }); } }),
    ));
    const list = el('div', { class: 'option-list' });
    h.options.forEach((o, k) => {
      const pick = el('button', { type: 'button', class: `pick ${k === h.choice ? 'on' : ''}`, title: 'Apply', style: { background: o.color } });
      pick.addEventListener('click', () => applySwatch(h.id, k));
      const label = el('input', { type: 'text', value: o.label, 'aria-label': 'Option name' });
      label.addEventListener('change', () => { o.label = label.value.trim() || o.label; commit(); });
      const color = el('input', { type: 'color', value: o.color, 'aria-label': 'Option colour' });
      color.addEventListener('input', () => { o.color = color.value; pick.style.background = o.color; if (k === h.choice) { Doc.applyOption(level, h.id, k); live(); } });
      color.addEventListener('change', () => commit());
      const del = el('button', { type: 'button', class: 'mini', title: 'Remove option', html: icon('x', 11) });
      del.addEventListener('click', () => { if (h.options.length <= 1) { toast('A hotspot keeps at least one option'); return; } h.options.splice(k, 1); h.choice = Math.min(h.choice, h.options.length - 1); commit({ details: true }); });
      list.append(el('div', { class: 'option-row', dataset: { search: `options ${o.label.toLowerCase()}` } }, pick, label, color, del));
    });
    const addOpt = el('button', { type: 'button', class: 'tool wide' }, iconEl('plus', 13), el('span', { class: 'label' }, 'Add option'));
    addOpt.addEventListener('click', () => {
      const target = level.entities.find((e) => e.id === h.target.entity);
      const c = target && target.props.colours ? target.props.colours[h.target.slot] : '#ffffff';
      h.options.push({ label: `Option ${h.options.length + 1}`, color: c });
      commit({ details: true });
    });
    box.append(detailSection('Options', list, addOpt, el('p', {}, 'The swatches shown when a buyer picks this dot. The ringed one is applied.')));
  }

  function renderEnvironment(box) {
    const e = level.environment;
    box.append(
      el('div', { class: 'crumbs' }, `${level.name} / Environment`),
      header('sun', 'Environment', `Neutral studio · ${e.preset === 'custom' ? 'custom' : Doc.ENVIRONMENT_PRESETS[e.preset].label} preset`),
    );
    const presetBar = segmented({ options: Object.entries(Doc.ENVIRONMENT_PRESETS).map(([id, p]) => ({ id, label: p.label })), value: e.preset, onChange: (id) => { Doc.applyPreset(level, id); commit({ details: true }); } });
    box.append(detailSection('Preset', el('div', { class: 'field-wide' }, presetBar), el('p', {}, 'Neutral looks for the configurator. Any edit below turns the preset into a custom environment.')));
    const custom = () => { e.preset = 'custom'; };
    const sky = (key) => (v) => { e.sky[key] = v; custom(); live(); };
    const sun = (key) => (v) => { e.sun[key] = v; custom(); live(); };
    const studio = (key) => (v) => { e.studio[key] = v; custom(); live(); };
    const done = () => commit();
    const settle = () => { clearTimeout(renderEnvironment.t); renderEnvironment.t = setTimeout(done, 300); };
    const colour = (label, fn, value, bind) => bound(colorField({ label, value, onChange: (v) => { fn(v); settle(); } }), bind);
    box.append(detailSection('Sky',
      colour('Zenith', sky('top'), e.sky.top, 'sky-top'), colour('Horizon', sky('horizon'), e.sky.horizon, 'sky-horizon'), colour('Ground', sky('ground'), e.sky.ground, 'sky-ground'),
      bound(rangeField({ label: 'Exposure', value: e.sky.exposure, min: 0.4, max: 1.8, step: 0.01, onInput: sky('exposure'), onChange: done }), 'sky-exposure'),
    ));
    box.append(detailSection('Sun',
      bound(rangeField({ label: 'Azimuth', value: e.sun.azimuth, min: 0, max: 360, step: 1, unit: '°', onInput: sun('azimuth'), onChange: done }), 'sun-azimuth'),
      bound(rangeField({ label: 'Elevation', value: e.sun.elevation, min: -5, max: 90, step: 1, unit: '°', onInput: sun('elevation'), onChange: done }), 'sun-elevation'),
      bound(rangeField({ label: 'Intensity', value: e.sun.intensity, min: 0, max: 6, step: 0.05, onInput: sun('intensity'), onChange: done }), 'sun-intensity'),
      bound(rangeField({ label: 'Shadow softness', value: e.sun.softness, min: 0, max: 1, step: 0.01, onInput: sun('softness'), onChange: done }), 'sun-softness'),
      colour('Colour', sun('color'), e.sun.color, 'sun-colour'),
    ));
    box.append(detailSection('Studio',
      colour('Wall', studio('wall'), e.studio.wall, 'studio-wall'), colour('Floor', studio('floor'), e.studio.floor, 'studio-floor'),
      bound(rangeField({ label: 'Floor gloss', value: e.studio.gloss, min: 0, max: 1, step: 0.01, onInput: studio('gloss'), onChange: done }), 'studio-gloss'),
      bound(rangeField({ label: 'Sky fill', value: e.studio.fill, min: 0, max: 2, step: 0.01, onInput: studio('fill'), onChange: done }), 'studio-fill'),
      rangeField({ label: 'Wall radius', value: e.studio.radius, min: 8, max: 24, step: 0.5, unit: 'm', onInput: studio('radius'), onChange: done }),
      rangeField({ label: 'Wall height', value: e.studio.height, min: 2.5, max: 10, step: 0.1, unit: 'm', onInput: studio('height'), onChange: done }),
      rangeField({ label: 'Top wave', value: e.studio.wave, min: 0, max: 3, step: 0.05, unit: 'm', onInput: studio('wave'), onChange: done }),
      rangeField({ label: 'Cove', value: e.studio.cove, min: 0.5, max: 4, step: 0.05, unit: 'm', onInput: studio('cove'), onChange: done }),
    ));
    const lightRows = e.lights.filter((l) => Doc.queryShown({ ...l, visible: true }, role)).map((l) => {
      const b = el('button', { type: 'button', class: 'entity comp-row tree-row' }, iconEl(Doc.LIGHT_TYPES[l.type].icon, 16, 'entity-icon'), el('div', {}, el('b', {}, l.name), el('small', {}, `${Doc.LIGHT_TYPES[l.type].label} · ${l.layer}`)));
      b.addEventListener('click', () => select(l.id));
      return b;
    });
    const addRow = el('div', { class: 'button-row' }, ...Object.entries(Doc.LIGHT_TYPES).map(([id, s]) => {
      const b = el('button', { type: 'button', class: 'tool', title: role === 'premium' ? `Add ${s.label}` : 'Premium feature', dataset: { addLight: id } }, iconEl(role === 'premium' ? s.icon : 'lock', 13), el('span', { class: 'label' }, s.label.replace(' Light', '')));
      b.addEventListener('click', () => addObject(`light:${id}`));
      return b;
    }));
    box.append(detailSection('Lights', ...lightRows, addRow, el('p', {}, `${e.lights.length} of ${Doc.MAX_LIGHTS} lights. Authored lights are locked; Premium users add theirs.`)));
    const focus = { 'env:sky': 'sky', 'env:sun': 'sun', 'env:studio': 'studio' }[selectedId];
    const target = box.querySelector(`[data-section="${focus}"]`);
    if (target) requestAnimationFrame(() => target.scrollIntoView?.({ block: 'start' }));
  }

  function renderLevel(box) {
    const s = Doc.levelStats(level, role);
    const issues = Doc.checkLevel(level);
    box.append(
      el('div', { class: 'crumbs' }, `Levels / ${level.name}`),
      header('viewport', level.name, `Level · ${Doc.LEVEL_SCHEMA}`, { rename: (name) => { if (name) { level.name = name; commit(); } } }),
    );
    box.append(detailSection('Level',
      metrics([[String(s.entities), 'ENTITIES'], [String(s.lights), 'LIGHTS'], [String(s.hotspots), 'HOTSPOTS'], [String(s.premium), 'PREMIUM']]),
      rows([['Tier', role === 'premium' ? 'Premium · adds on' : 'Basic · as authored'], ['Undo depth', String(history.depth)]]),
    ));
    const save = el('button', { type: 'button', class: 'tool', dataset: { action: 'save' } }, iconEl('download', 13), el('span', { class: 'label' }, 'Save JSON'));
    save.addEventListener('click', saveLevel);
    const load = el('button', { type: 'button', class: 'tool', dataset: { action: 'load' } }, iconEl('upload', 13), el('span', { class: 'label' }, 'Open JSON'));
    load.addEventListener('click', () => $('LevelInput').click());
    const reset = el('button', { type: 'button', class: 'tool', dataset: { action: 'reset' } }, iconEl('reset', 13), el('span', { class: 'label' }, 'Reset Lobby'));
    reset.addEventListener('click', () => { level = Doc.createLobbyLevel(); commit({ details: true }); toast('Lobby reset to the authored defaults'); });
    box.append(detailSection('File', el('div', { class: 'button-row' }, save, load, reset)));
    const start = el('button', { type: 'button', class: 'primary wide', dataset: { action: 'capture-start' } }, iconEl('camera', 14), 'Capture start view');
    start.addEventListener('click', () => { level.start = captureStart(); commit({ details: true }); toast('Start view captured'); });
    box.append(detailSection('Start view', rows([['Yaw · pitch', `${level.start.yaw.toFixed(1)}° · ${level.start.pitch.toFixed(1)}°`], ['Distance', `${level.start.distance.toFixed(2)} m`]]), start, el('p', {}, 'Where Preview opens, and where it returns when a hotspot closes.')));
    const issueList = issues.length ? el('div', { class: 'issue-list' }, ...issues.map((i) => {
      const b = el('button', { type: 'button', class: 'issue' }, iconEl('warn', 13), el('span', {}, i.text));
      if (i.id) b.addEventListener('click', () => select(i.id));
      return b;
    })) : el('p', { class: 'verdict ok' }, 'No issues. Every hotspot has a target and options.');
    box.append(el('div', { class: 'detail-section', dataset: { search: 'issues checks' } }, section('CHECKS'), issueList));
  }

  function captureStart() {
    const r = stage.rig, r3 = (n) => Math.round(n * 1000) / 1000;
    return { target: r.target.toArray().map(r3), yaw: r3(r.yaw / DEG), pitch: r3(r.pitch / DEG), distance: r3(r.distance), focal: r3(r.focal) };
  }

  function saveLevel() {
    download(`${level.name.replace(/[^\w]+/g, '') || 'Level'}.level.json`, Doc.exportLevel(level), 'application/json');
    toast(`${level.name} saved · ${Doc.LEVEL_SCHEMA}`);
  }

  async function openLevelFile(file) {
    try {
      const next = Doc.importLevel(await file.text());
      level = next;
      selectedId = null;
      commit({ details: true });
      toast(`${level.name} opened`);
    } catch (error) {
      toast(`Could not open ${file.name}: ${error.message}`);
    }
  }

  // ------------------------------------------------------------------------------------------------ readout
  function renderHistory() {
    $('UndoBtn').disabled = history.depth === 0;
    $('RedoBtn').disabled = history.depth >= history.size - 1;
  }

  function updateReadout() {
    const r = Doc.findRecord(level, selectedId);
    const envRow = ENV_ROWS.find((x) => x.id === selectedId);
    const sel = envRow ? envRow.name : r ? `${r.name}${Doc.recordSort(level, selectedId) !== 'hotspot' && !Doc.queryEditable(level, selectedId, role) ? '  (locked)' : ''}` : '—';
    const open = openId ? (level.hotspots.find((h) => h.id === openId) || {}).name : null;
    $('Readout').textContent = [
      `${level.name.toUpperCase()} · ${role.toUpperCase()} · ${preview ? 'PREVIEW' : 'DESIGN'}`,
      `selection  ${sel}`,
      `gizmo      ${gizmo.mode}${gizmo.snap ? ' · snap' : ''} · ${gizmo.space}`,
      open ? `hotspot    ${open}` : `hotspots   ${level.hotspots.length} · lights ${level.environment.lights.length}`,
      `${Math.round(stage.stats.fps)} fps`,
    ].join('\n');
  }
  setInterval(updateReadout, 600);

  function renderAll() {
    renderStats(); renderTree(); renderAddMenu(); renderDetails(); renderDrawer(); renderHistory(); updateReadout();
    if (leftTab === 'content') renderContent();
  }

  // ------------------------------------------------------------------------------------------- toolbar wiring
  $('CentreModes').append(segmented({ options: [{ id: 'design', label: 'Design', icon: 'hammer' }, { id: 'preview', label: 'Preview', icon: 'play' }], value: 'design', onChange: (id) => assignPreview(id === 'preview') }));
  $('RoleBar').append(segmented({ options: [{ id: 'basic', label: 'Basic' }, { id: 'premium', label: 'Premium', icon: 'sparkle' }], value: role, cls: 'small', onChange: (id) => assignRole(id) }));
  const gizmoBar = segmented({ options: GIZMO_MODES, value: gizmo.mode, onChange: (id) => assignGizmoMode(id) });
  $('GizmoBar').append(gizmoBar);
  function assignGizmoMode(mode) {
    gizmo.assignMode(mode);
    for (const b of gizmoBar.children) b.classList.toggle('active', b.dataset.value === mode);
    updateReadout();
  }
  function toggleSnap() { gizmo.snap = !gizmo.snap; $('SnapBtn').classList.toggle('active', gizmo.snap); updateReadout(); }
  function toggleSpace() { gizmo.space = gizmo.space === 'world' ? 'local' : 'world'; $('SpaceLabel').textContent = gizmo.space === 'world' ? 'World' : 'Local'; updateReadout(); }
  function toggleGrid() { stage.grid.visible = !stage.grid.visible; $('GridBtn').classList.toggle('active', stage.grid.visible); }
  $('SnapBtn').addEventListener('click', toggleSnap);
  $('SpaceBtn').addEventListener('click', toggleSpace);
  $('UndoBtn').addEventListener('click', undo);
  $('RedoBtn').addEventListener('click', redo);
  $('FrameBtn').addEventListener('click', frameSelected);
  $('GridBtn').addEventListener('click', toggleGrid);
  $('SaveBtn').addEventListener('click', saveLevel);
  $('AddHotspotBtn').addEventListener('click', addHotspotFromView);
  $('AddBtn').addEventListener('click', () => {
    if (role !== 'premium') { toast('Adding objects is a Premium feature'); return; }
    const m = $('AddMenu'); m.hidden = !m.hidden;
    if (!m.hidden) { renderAddMenu(); $('AddSearch').focus(); }
  });
  $('AddSearch').addEventListener('input', renderAddMenu);
  $('OutlinerSearch').addEventListener('input', renderTree);
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#AddMenu, #AddBtn')) $('AddMenu').hidden = true; });
  for (const t of document.querySelectorAll('[data-left]')) t.addEventListener('click', () => assignLeftTab(t.dataset.left));
  $('ImportBtn').addEventListener('click', () => { if (role !== 'premium') { toast('Importing objects is a Premium feature'); return; } $('FileInput').click(); });
  $('FileInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
  $('LevelInput').addEventListener('change', (e) => { if (e.target.files[0]) openLevelFile(e.target.files[0]); e.target.value = ''; });
  $('DrawerHandle').addEventListener('click', () => toggleDrawer());
  function toggleDrawer(force) {
    const d = $('Drawer');
    const open = force ?? !d.classList.contains('open');
    d.classList.toggle('open', open);
    $('DrawerHandle').setAttribute('aria-expanded', String(open));
  }
  addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (/\.json$/i.test(f.name)) openLevelFile(f); else importFiles(e.dataTransfer.files); } });

  async function importFiles(files) {
    if (role !== 'premium') { toast('Importing objects is a Premium feature'); return; }
    const file = files && files[0];
    if (!file) return;
    try {
      toast(`Compiling ${file.name}…`);
      const asset = await compileImport(file);
      registerAsset(asset);
      addObject(`asset:${asset.id}`);
    } catch (error) {
      toast(String(error.message || error));
    }
  }

  function registerAsset(asset) {
    assets.set(asset.id, asset);
    if (!contentAssets.includes(asset)) contentAssets.push(asset);
    renderAddMenu();
    if (leftTab === 'content') renderContent();
  }

  // Camera HUD (dial, lens, turntable) and a start-view chip.
  const homeChip = el('button', { type: 'button', class: 'cam-chip', title: 'Start view (H)' }, 'Start');
  homeChip.addEventListener('click', () => flyStart());
  createCameraHud(stage.rig, $('ViewportWell'), { extra: [homeChip] });

  // ------------------------------------------------------------------------------------------ viewport input
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, e.button]; });
  canvas.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d[2] !== 0 || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;
    clickAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('dblclick', () => { if (!preview) frameSelected(); });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const hit = hotspots.pick(e.clientX, e.clientY);
    hotspots.hover = hit && hit.hotspotId ? hit.hotspotId : null;
    hotspots.hoverSwatch = hit && hit.swatch !== undefined ? hit.swatch : null;
    if (hit) canvas.style.cursor = 'pointer';
    else if (canvas.style.cursor === 'pointer') canvas.style.cursor = '';
  });

  function clickAt(x, y) {
    const hit = hotspots.pick(x, y);
    if (hit && hit.swatch !== undefined && openId) { applySwatch(openId, hit.swatch); return; }
    if (hit && hit.hotspotId) {
      if (!preview) select(hit.hotspotId);
      flyHotspot(hit.hotspotId);
      return;
    }
    if (preview) { if (openId) closeHotspot(); return; }
    if (openId) closeHotspot({ fly: false });
    const pick = stage.pick(x, y, [stage.content, env.lights]);
    select(pick ? pick.componentId : null);
  }

  addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveLevel(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod || e.altKey) return;
    if (e.key === 'Escape') {
      if (openId) closeHotspot();
      else if (preview) assignPreview(false);
      else if ($('Notch').classList.contains('open')) $('NotchHandle').click();
      else select(null);
      return;
    }
    if (/^[1-9]$/.test(e.key)) { const h = level.hotspots[+e.key - 1]; if (h) { if (!preview) select(h.id); flyHotspot(h.id); } return; }
    if (k === 'h') { if (openId) closeHotspot({ fly: false }); flyStart(); return; }
    if (k === 'p') { assignPreview(!preview); return; }
    if (preview) return;
    if (k === 'q') assignGizmoMode('select');
    else if (k === 'w') assignGizmoMode('move');
    else if (k === 'e') assignGizmoMode('rotate');
    else if (k === 'r') assignGizmoMode('scale');
    else if (k === 'x') toggleSpace();
    else if (k === 'f') frameSelected();
    else if (k === 'g') toggleGrid();
    else if (k === 't') document.querySelector('.cam-hud .cam-chip:nth-child(2)')?.click();
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  });

  // ------------------------------------------------------------------------------------------------------ boot
  syncScene();
  const s0 = level.start;
  stage.rig.setNow({ target: new THREE.Vector3().fromArray(s0.target), yaw: s0.yaw * DEG, pitch: s0.pitch * DEG, distance: s0.distance, focal: s0.focal });
  stage.framed = true;
  renderAll();
  hydrateIcons(document);

  return {
    stage, env, gizmo, hotspots,
    get level() { return level; },
    get role() { return role; },
    get selectedId() { return selectedId; },
    get openId() { return openId; },
    get preview() { return preview; },
    get history() { return history; },
    nodeOf: (id) => (nodes.get(id) || {}).node || null,
    // The ControlVehicle arrives after its parts compile; the vehicle entity rebuilds with real meshes.
    attachVehicle(compiled) {
      parts = compiled;
      for (const key of ['tyre', 'rim', 'wing']) if (compiled[key]) registerAsset(compiled[key]);
      syncScene();
      renderDetails();
    },
    select, flyHotspot, closeHotspot, applySwatch, assignPreview, assignRole, addObject, addHotspotFromView, removeSelected, duplicateSelected, undo, redo, assignGizmoMode, frameSelected, flyStart, toggleDrawer, saveLevel,
    exportJson: () => Doc.exportLevel(level),
    importJson: (text) => { level = Doc.importLevel(text); selectedId = null; commit({ details: true }); },
    clickAt,
  };
}
