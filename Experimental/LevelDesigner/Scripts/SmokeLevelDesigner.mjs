// UI smoke test: boots Main.js inside jsdom (Shared/Studio/Scripts/StudioHarness.mjs mocks WebGL, canvas, layout and
// runs the compile workers in-process) and drives the main paths: boot, Outliner and Details, locked lobby items, the
// gizmo, Add on Premium / refused on Basic, hotspot fly + swatch + capture, environment edits, Preview / Esc, undo /
// redo, save / open, hotspot from view, duplicate / delete.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/LevelDesigner/Scripts/SmokeLevelDesigner.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootStudio } from '../../Shared/Studio/Scripts/StudioHarness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') + '/';
const { w, $, click, key, sleep, step, errors, downloads, finish } = bootStudio({ htmlPath: ROOT + 'index.html', url: 'http://localhost:8100/Experimental/LevelDesigner/' });
const expect = (ok, text) => { if (!ok) throw new Error(text); };
const toastText = () => $('Toast').textContent;

await import(pathToFileURL(ROOT + 'Main.js'));
for (let i = 0; i < 300 && !w.FrontierLevelDesigner; i++) await sleep(20);
for (let i = 0; i < 300 && !$('Boot')?.classList.contains('done') && !$('Boot')?.classList.contains('failed'); i++) await sleep(100);
const D = w.FrontierLevelDesigner;
const L = () => D.level;
const premiumCount = () => L().entities.filter((e) => e.layer === 'premium').length;

await step('boot: Lobby level, vehicle compiled, Outliner and drawer filled', async () => {
  console.log('   boot:', $('Boot')?.className, '|', toastText());
  expect(D && L().name === 'Lobby', 'designer missing');
  expect($('LevelTitle').textContent === 'Lobby', 'title');
  expect($('StatHotspots').textContent === '6', `hotspots ${$('StatHotspots').textContent}`);
  const rows = $('LevelTree').querySelectorAll('.tree-row').length;
  console.log('   rows:', rows, '| cards:', $('DrawerBody').children.length, '| tag:', $('RoleTag').textContent);
  expect(rows >= 13, `rows ${rows}`);
  expect($('DrawerBody').querySelectorAll('.hotspot-card').length === 6, 'hotspot cards');
  const car = D.nodeOf('E2');
  let meshes = 0;
  car.traverse((o) => { if (o.isMesh) meshes++; });
  expect(meshes >= 10, `vehicle meshes ${meshes}`);
});

await step('Outliner rows select and render Details', async () => {
  for (const r of [...$('LevelTree').querySelectorAll('.tree-row')]) { click(r); await sleep(5); expect($('Details').querySelector('.detail-head'), `details for ${r.dataset.id}`); }
  click($('LevelTree').querySelector('[data-id="E2"]'));
  expect(D.selectedId === 'E2', 'vehicle selected');
  expect($('Details').querySelector('[data-bind="colour-paint"]'), 'paint colour field');
});

await step('locked vehicle: gizmo refuses, transform fields disabled', async () => {
  const before = JSON.stringify(L().entities[1].transform);
  expect(D.gizmo.locked, 'gizmo should be locked');
  expect(!D.gizmo.nudge('move-x', 1), 'nudge should refuse');
  expect(/locked/.test(toastText()), `toast: ${toastText()}`);
  expect(JSON.stringify(L().entities[1].transform) === before, 'transform changed');
  expect([...$('Details').querySelectorAll('[data-search="location"] input')].every((i) => i.disabled), 'location inputs enabled');
});

await step('Premium: Add menu places a plinth on the premium layer', async () => {
  click($('AddBtn'));
  expect(!$('AddMenu').hidden, 'add menu hidden');
  click($('AddList').querySelector('[data-spec="shape:plinth"]'));
  await sleep(10);
  expect(premiumCount() === 1, `premium ${premiumCount()}`);
  const r = L().entities.find((e) => e.layer === 'premium');
  expect(D.selectedId === r.id && !D.gizmo.locked, 'new object selected, gizmo live');
  expect($('LevelTree').querySelector(`[data-id="${r.id}"]`).classList.contains('premium-row'), 'premium row');
});

await step('gizmo: move / rotate / scale write back into the document (and undo)', async () => {
  const r = () => L().entities.find((e) => e.layer === 'premium');
  const x0 = r().transform.location[0];
  D.assignGizmoMode('move');
  expect(D.gizmo.nudge('move-x', 1.5), 'move');
  expect(Math.abs(r().transform.location[0] - (x0 + 1.5)) < 1e-3, `x ${r().transform.location[0]}`);
  D.assignGizmoMode('rotate');
  expect(D.gizmo.nudge('rotate-y', 30), 'rotate');
  expect(Math.abs(r().transform.rotation[1] - 30) < 1e-2, `rot ${r().transform.rotation}`);
  D.assignGizmoMode('scale');
  expect(D.gizmo.nudge('scale-all', 2), 'scale');
  expect(Math.abs(r().transform.scale[0] - 4.8) < 1e-3, `scale ${r().transform.scale}`);
  key('z', { ctrlKey: true });
  await sleep(5);
  expect(Math.abs(r().transform.scale[0] - 2.4) < 1e-3, 'undo scale');
  key('z', { ctrlKey: true, shiftKey: true });
  await sleep(5);
  expect(Math.abs(r().transform.scale[0] - 4.8) < 1e-3, 'redo scale');
  key('w');
  expect(D.gizmo.mode === 'move', 'W → move');
  key('q');
  expect(D.gizmo.mode === 'select' && !D.gizmo.root.visible, 'Q → select hides the gizmo');
  key('w');
  click($('SnapBtn'));
  expect(D.gizmo.snap, 'snap on');
  key('x');
  expect(D.gizmo.space === 'local' && $('SpaceLabel').textContent === 'Local', 'local space');
  click($('SnapBtn')); key('x');
});

await step('Basic tier: premium objects hidden, Add / import refused, Content locked', async () => {
  const id = L().entities.find((e) => e.layer === 'premium').id;
  click($('RoleBar').querySelector('[data-value="basic"]'));
  await sleep(5);
  expect(D.role === 'basic' && $('RoleTag').textContent === 'BASIC', 'role');
  expect(!D.nodeOf(id).visible, 'premium node visible on Basic');
  expect(D.selectedId !== id, 'hidden object still selected');
  click($('AddBtn'));
  expect($('AddMenu').hidden && /Premium/.test(toastText()), 'add should refuse');
  expect(D.addObject('shape:box') === null && premiumCount() === 1, 'addObject should refuse');
  click($('ImportBtn'));
  expect(/Premium/.test(toastText()), 'import should refuse');
  click(document.querySelector('[data-left="content"]'));
  expect($('ContentScroll').querySelectorAll('.content-row.locked').length >= 8, 'content rows locked');
  click(document.querySelector('[data-left="outliner"]'));
  expect(/hidden on the Basic tier/.test($('LevelTree').textContent), 'tier note');
  click($('RoleBar').querySelector('[data-value="premium"]'));
  expect(D.nodeOf(id).visible, 'premium node back');
});

await step('Content tab: add a compiled ControlVehicle part as a Static Mesh', async () => {
  click(document.querySelector('[data-left="content"]'));
  const rim = [...$('ContentScroll').querySelectorAll('.content-row')].find((r) => /Rim/.test(r.textContent));
  expect(rim, 'rim asset row');
  click(rim.querySelector('.content-actions .tool'));
  await sleep(10);
  expect(L().entities.some((e) => e.type === 'StaticMesh' && e.layer === 'premium'), 'static mesh added');
  click(document.querySelector('[data-left="outliner"]'));
});

await step('hotspot: key 2 flies to the front wheel, swatches show, a swatch recolours the rims', async () => {
  key('Escape');
  key('2');
  await sleep(5);
  expect(D.selectedId === 'H2' && D.openId === 'H2', `open ${D.openId}`);
  expect(D.hotspots.swatches.length === 5, `swatches ${D.hotspots.swatches.length}`);
  const card = $('DrawerBody').querySelector('[data-hotspot="H2"]');
  expect(card.classList.contains('active'), 'card active');
  click(card.querySelectorAll('.swatch')[2]);
  await sleep(5);
  const car = L().entities.find((e) => e.type === 'Vehicle');
  expect(car.props.colours.rim === '#8c6a3f', `rim ${car.props.colours.rim}`);
  let painted = false;
  D.nodeOf('E2').traverse((o) => { if (o.isMesh && o.userData.families) o.userData.families.forEach((f, i) => { if (f === 10 && ('#' + o.material[i].color.getHexString()) === '#8c6a3f') painted = true; }); });
  expect(painted, 'rim material not repainted');
  expect(L().hotspots[1].choice === 2, 'choice');
});

await step('hotspot: capture current view, move the dot, add from view, delete', async () => {
  D.stage.rig.setNow({ target: new D.stage.camera.position.constructor(1.7, 0.6, 1.1), yaw: 0.5, pitch: 0.2, distance: 3, focal: 85 });
  click($('Details').querySelector('[data-action="capture"]'));
  const v = L().hotspots[1].view;
  expect(Math.abs(v.yaw - 28.648) < 0.01 && v.focal === 85 && v.distance === 3, `view ${JSON.stringify(v)}`);
  expect(D.gizmo.moveOnly && D.gizmo.nudge('move-y', 0.2) && Math.abs(L().hotspots[1].anchor[1] - 0.71) < 1e-3, `anchor ${L().hotspots[1].anchor}`);
  expect(!D.gizmo.nudge('rotate-y', 10), 'hotspots do not rotate');
  click($('AddHotspotBtn'));
  expect(L().hotspots.length === 7 && D.selectedId === 'H7', 'hotspot from view');
  key('Delete');
  expect(L().hotspots.length === 6, 'delete hotspot');
});

await step('environment: sun sliders, preset, studio gloss, add light', async () => {
  click($('LevelTree').querySelector('[data-id="env:sun"]'));
  const elev = $('Details').querySelector('input[type="range"][data-bind="sun-elevation"]');
  elev.value = '60';
  elev.dispatchEvent(new w.Event('input', { bubbles: true }));
  elev.dispatchEvent(new w.Event('change', { bubbles: true }));
  expect(L().environment.sun.elevation === 60 && L().environment.preset === 'custom', 'elevation');
  expect(D.env.sun.position.y > 20, `sun y ${D.env.sun.position.y}`);
  const gloss = $('Details').querySelector('input[type="range"][data-bind="studio-gloss"]');
  gloss.value = '0.2';
  gloss.dispatchEvent(new w.Event('input', { bubbles: true }));
  gloss.dispatchEvent(new w.Event('change', { bubbles: true }));
  expect(Math.abs(D.env.mirror.mesh.material.uniforms.uStrength.value - 0.124) < 1e-6, 'mirror strength');
  click([...$('Details').querySelectorAll('.segmented button')].find((b) => b.dataset.value === 'dusk'));
  expect(L().environment.preset === 'dusk' && L().environment.sun.color === '#ffc58f', 'dusk preset');
  click($('Details').querySelector('[data-add-light="spot"]'));
  expect(L().environment.lights.length === 3 && D.env.lightObjects.size === 3, 'light added');
  key('z', { ctrlKey: true }); key('z', { ctrlKey: true });
  expect(L().environment.preset !== 'dusk' && L().environment.lights.length === 2, 'undo env');
});

await step('Preview: docks hidden, dots fly, Esc closes then returns', async () => {
  key('p');
  expect(w.document.body.classList.contains('preview') && D.preview, 'preview');
  expect(!D.gizmo.root.visible, 'gizmo hidden in preview');
  key('1');
  expect(D.openId === 'H1' && D.hotspots.swatches.length === 6, 'open paint');
  D.applySwatch('H1', 3);
  expect(L().entities.find((e) => e.type === 'Vehicle').props.colours.paint === '#e9c13b', 'paint applied');
  key('Escape');
  expect(D.openId === null && D.preview, 'Esc closes the hotspot first');
  key('Escape');
  expect(!D.preview && !w.document.body.classList.contains('preview'), 'Esc leaves preview');
});

await step('duplicate / delete premium object; locked delete refused', async () => {
  const r = L().entities.find((e) => e.type === 'Primitive');
  D.select(r.id);
  key('d', { ctrlKey: true });
  expect(L().entities.filter((e) => e.type === 'Primitive').length === 2, 'duplicate');
  key('Delete');
  expect(L().entities.filter((e) => e.type === 'Primitive').length === 1, 'delete');
  D.select('E2');
  key('Delete');
  expect(L().entities.some((e) => e.id === 'E2') && /locked/.test(toastText()), 'locked delete refused');
});

await step('lock toggle on an Outliner row unlocks the turntable for authoring', async () => {
  click($('LevelTree').querySelector('[data-id="E1"] .row-lock'));
  expect(!L().entities[0].locked, 'unlocked');
  D.select('E1');
  expect(!D.gizmo.locked && D.gizmo.nudge('move-z', 0.5), 'gizmo live');
  click($('LevelTree').querySelector('[data-id="E1"] .row-lock'));
  expect(L().entities[0].locked, 'locked again');
});

await step('save / open: Ctrl+S downloads JSON; import replaces the level', async () => {
  const n = downloads.length;
  key('s', { ctrlKey: true });
  expect(downloads.length === n + 1 && downloads[n] === 'Lobby.level.json', `downloads ${downloads}`);
  const json = D.exportJson();
  const parsed = JSON.parse(json);
  parsed.name = 'Lobby Copy';
  D.importJson(JSON.stringify(parsed));
  expect(L().name === 'Lobby Copy' && $('LevelTitle').textContent === 'Lobby Copy', 'imported');
  expect(JSON.parse(D.exportJson()).entities.length === parsed.entities.length, 'entities kept');
  key('z', { ctrlKey: true });
  expect(L().name === 'Lobby', 'undo import');
});

await step('Outliner search and details search filter', async () => {
  const s = $('OutlinerSearch');
  s.value = 'wheel';
  s.dispatchEvent(new w.Event('input', { bubbles: true }));
  const names = [...$('LevelTree').querySelectorAll('.tree-row b')].map((b) => b.textContent);
  expect(names.length === 2 && names.every((n) => /wheel/i.test(n)), `rows ${names}`);
  s.value = '';
  s.dispatchEvent(new w.Event('input', { bubbles: true }));
});

await finish();
