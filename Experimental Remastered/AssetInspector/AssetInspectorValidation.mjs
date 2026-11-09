import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecodeFacetStream } from '../../Experimental/VehicleProvingGrounds/Source/FacetCodec.js';
import { CourseMaterial } from '../../Experimental/VehicleProvingGrounds/Source/MaterialSpecification.js';
import { ControlVehicleSockets, VehicleGeometry, EngineSheet, TurbochargerSheet, PacejkaParameters } from '../../Experimental/VehicleProvingGrounds/Source/VehicleSpecification.js';
const Dir = path.dirname(fileURLToPath(import.meta.url));
const Read = name => fs.readFileSync(path.join(Dir, name), 'utf8');
const Html = Read('index.html'), Js = Read('AssetInspector.js'), Css = Read('AssetInspector.css');
let Passed=0;function test(name,fn){fn();Passed++;console.log(`PASS ${name}`)}
function decode(name){const buffer=fs.readFileSync(path.join(Dir,'../../Experimental/VehicleProvingGrounds/Archive',name));const bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);return DecodeFacetStream(bytes,name)}
test('Standalone Blueprint Editor shell has viewport, hierarchy, graph, details, and asset controls',()=>{
 for(const id of ['ComponentTree','VehicleCanvas','EventGraphView','GraphCanvas','CurveView','CurveCanvas','TyreModelView','Properties','ExportBtn','CompileBtn'])assert.ok(Html.includes(`id="${id}"`),`missing #${id}`);
 assert.ok(Html.includes('Vehicle HMI · Drivable'));assert.ok(Html.includes('CONTROLVEHICLE_BLUEPRINT'));
 assert.ok(fs.readFileSync(path.join(Dir,'../index.html'),'utf8').includes('./AssetInspector/'));
});
test('The preview loads the actual Vehicle HMI ControlVehicle body, tyre, and rim facet archives',()=>{
 const body=decode('ControlVehicleBody.facet'),tyre=decode('ControlVehicleTyre.facet'),rim=decode('ControlVehicleRim.facet');
 assert.equal(body.VertexCount,1492);assert.equal(body.FacetCount,2924);assert.equal(tyre.FacetCount,3968);assert.equal(rim.FacetCount,1568);
 assert.equal(ControlVehicleSockets.AxleMount.length,4);assert.equal(VehicleGeometry.Mass,1300);
 for(const name of ['ControlVehicleBody.facet','ControlVehicleTyre.facet','ControlVehicleRim.facet'])assert.ok(Js.includes(name));
 assert.ok(Js.includes('../../Experimental/VehicleProvingGrounds/Archive/'));
});
test('Blueprint details expose authored chassis, powertrain, suspension, tyre, thermal, and MF6.1 settings',()=>{
 for(const token of ['ControlVehicleSockets','VehicleGeometry','EngineSheet','TurbochargerSheet','TransmissionSheet','ChassisSheet','PacejkaParameters','ThermalSpecification','springHz','dampingRatio','coldPressure','surfaceHeat'])assert.ok(Js.includes(token),`missing authored spec/control ${token}`);
 assert.equal(EngineSheet.TorqueCurve.length,18);assert.equal(TurbochargerSheet.TorqueMultiplierCurve.length,4);assert.equal(PacejkaParameters.pDy1,1.85);
});
test('Blueprint graph wires and draggable engine, turbo, and Pacejka curves are implemented',()=>{
 for(const token of ['drawWires','pointerdown','pointermove','dblclick','GraphScale','EventGraph','Pacejka'])assert.ok(Js.includes(token),`missing graph/curve function ${token}`);
 for(const token of ['data-node="Tick"','data-node="Torque"','data-node="Tyre"','data-node="Apply"'])assert.ok(Html.includes(token),`missing graph node ${token}`);
 for(const token of ['Event Tick','Calculate Engine Torque','Evaluate Tyre · MF6.1','Apply Drive Force'])assert.ok(Html.includes(token),`missing Blueprint node ${token}`);
});
test('Debug overlays, component selection, saving, compile validation, and JSON export are wired',()=>{
 for(const token of ['Thermal','Contact','Slip','Suspension','Normals','updateDebugGeometry','selectSceneComponent','localStorage.setItem','ControlVehicle.blueprint.json','function compile'])assert.ok(Js.includes(token),`missing editor interaction ${token}`);
 for(const token of ['#202123','.graph-node','.prop-section','.vehicle-stage','@media(max-width:850px)'])assert.ok(Css.includes(token),`missing editor styling ${token}`);
});
console.log(`ALL PASSED (${Passed}/${Passed})`);
