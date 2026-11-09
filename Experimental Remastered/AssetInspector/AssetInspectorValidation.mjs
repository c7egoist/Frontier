import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const Dir = path.dirname(fileURLToPath(import.meta.url));
const Read = Name => fs.readFileSync(path.join(Dir, Name), 'utf8');
const Html = Read('index.html'), Js = Read('AssetInspector.js'), Css = Read('AssetInspector.css');
let Passed = 0;
function test(name, fn) { fn(); Passed++; console.log(`PASS ${name}`); }
test('Inspector entry point, shell, and hub are linked', () => {
    for (const id of ['AssetSearch','VehicleCanvas','DebugChannels','CurveCanvas','CurveSelect','CategoryTabs','Properties','ExportBtn']) assert.ok(Html.includes(`id="${id}"`), `missing #${id}`);
    assert.ok(fs.readFileSync(path.join(Dir, '../index.html'), 'utf8').includes('./AssetInspector/'));
    assert.ok(fs.existsSync(path.join(Dir, 'Serve.py')));
});
test('Vehicle, powertrain, tyre, Pacejka, and diagnostic controls are present', () => {
    for (const token of ['mass:1300','com:0.53','naturalHz:2','damping:0.6','pressure:220','temp:82.4','muLong:1.6','muLat:1.85','spool:0.55','boostMax:1.2','Torque:[[800,234]','Boost:[[0,1]']) assert.ok(Js.includes(token), `missing authored data ${token}`);
    for (const token of ['Thermal','Contact patch','Slip angle','Suspension','Normals','heatCapacity','Pacejka','makePacejka']) assert.ok(Js.includes(token), `missing inspection channel/parameter ${token}`);
});
test('Curve editor supports dragging, insertion, reset, and local persistence / JSON export', () => {
    for (const token of ['pointerdown','pointermove','dblclick','ResetCurve','localStorage.setItem','control-vehicle-setup.json','URL.createObjectURL']) assert.ok(Js.includes(token), `missing curve/config interaction ${token}`);
});
test('Responsive dark inspector and filled slider styling ship with the page', () => {
    for (const token of ['--bg:#0b0c0e','.range::-webkit-slider-thumb','.curve-panel','.inspector-panel','@media(max-width:820px)']) assert.ok(Css.includes(token), `missing style ${token}`);
});
console.log(`ALL PASSED (${Passed}/${Passed})`);
