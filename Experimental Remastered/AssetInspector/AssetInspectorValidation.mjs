import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecodeFacetStream } from '../../Experimental/VehicleProvingGrounds/Source/FacetCodec.js';
import { ControlVehicleSockets, VehicleGeometry, EngineSheet, TurbochargerSheet, PacejkaParameters } from '../../Experimental/VehicleProvingGrounds/Source/VehicleSpecification.js';
const Dir=path.dirname(fileURLToPath(import.meta.url));
const Read=name=>fs.readFileSync(path.join(Dir,name),'utf8');
const Html=Read('index.html'),Js=Read('AssetInspector.js'),Css=Read('AssetInspector.css');
let Passed=0;function test(name,fn){fn();Passed++;console.log(`PASS ${name}`)}
function decode(name){const data=fs.readFileSync(path.join(Dir,'../../Experimental/VehicleProvingGrounds/Archive',name));return DecodeFacetStream(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),name)}
test('Vehicle Lab is a standalone Outliner / Stage / Inspector studio',()=>{
 for(const id of ['ComponentSearch','VehicleCanvas','InspectorContent','InspectorTabs','CurveCanvas','CurveTabs','ExportBtn','ResetBtn','LoadStatus'])assert.ok(Html.includes(`id="${id}"`),`missing #${id}`);
 assert.ok(Html.includes('Vehicle Lab'));assert.ok(Html.includes('VEHICLE INSPECTOR'));assert.ok(!Html.includes('GraphCanvas')&&!Html.includes('data-node='),'the node graph should not dominate this vehicle inspection studio');
 assert.ok(fs.readFileSync(path.join(Dir,'../index.html'),'utf8').includes('./AssetInspector/'));
});
test('The Stage loads the actual Vehicle HMI ControlVehicle body, tyre, and rim facet archives',()=>{
 const body=decode('ControlVehicleBody.facet'),tyre=decode('ControlVehicleTyre.facet'),rim=decode('ControlVehicleRim.facet');
 assert.equal(body.VertexCount,1492);assert.equal(body.FacetCount,2924);assert.equal(tyre.FacetCount,3968);assert.equal(rim.FacetCount,1568);
 assert.equal(ControlVehicleSockets.AxleMount.length,4);assert.equal(VehicleGeometry.Mass,1300);
 for(const file of ['ControlVehicleBody.facet','ControlVehicleTyre.facet','ControlVehicleRim.facet'])assert.ok(Js.includes(file),`missing source mesh ${file}`);
 assert.ok(Js.includes('new THREE.WebGLRenderer')&&Js.includes('wheelMeshes')&&Js.includes('bodyMesh'));
});
test('Outliner inspector exposes authored chassis, powertrain, suspension, tyre and MF6.1 parameters',()=>{
 for(const token of ['ControlVehicleSockets','VehicleGeometry','EngineSheet','TurbochargerSheet','TransmissionSheet','ChassisSheet','PacejkaParameters','ThermalSpecification','springHz','dampingRatio','coldPressure','surfaceHeat'])assert.ok(Js.includes(token),`missing control/spec ${token}`);
 assert.equal(EngineSheet.TorqueCurve.length,18);assert.equal(TurbochargerSheet.TorqueMultiplierCurve.length,4);assert.equal(PacejkaParameters.pDy1,1.85);
});
test('The response dock has editable torque, turbo and Pacejka curves',()=>{
 for(const token of ['data-curve="Torque"','data-curve="Boost"','data-curve="Pacejka"','CurveCanvas','ResetCurve','ExportCurve'])assert.ok(Html.includes(token),`missing curve control ${token}`);
 for(const token of ['pointerdown','pointermove','dblclick','samplePacejka','EngineSheet.TorqueCurve','TurbochargerSheet.TorqueMultiplierCurve'])assert.ok(Js.includes(token),`missing curve behavior ${token}`);
});
test('Ten selectable inspection channels have distinct Stage overlays',()=>{
 const channels=['Thermal','Contact','Slip','Suspension','Normals','BrakeTemp','WheelLoad','RideHeight','AeroLoad','Drivetrain'];
 for(const channel of channels){assert.ok(Html.includes(`data-channel="${channel}"`),`missing Outliner channel ${channel}`);assert.ok(Js.includes(`'${channel}'`),`missing Stage overlay ${channel}`)}
 assert.ok(Js.includes('DebugChannels.map(channel=>channel.id)'));assert.ok(Js.includes('function addDebugObject'));
});
test('Vehicle components can be attached, tuned, toggled, saved and removed',()=>{
 for(const id of ['AddComponentDialog','AddComponentForm','NewComponentType','NewComponentAttach','NewComponentParent','UserComponentTree'])assert.ok(Html.includes(`id="${id}"`),`missing component control ${id}`);
 for(const token of ['createUserComponent','updateUserComponentMesh','removeUserComponent','componentAnchor','makeUserComponentObject','components:state.components'])assert.ok(Js.includes(token),`missing component action ${token}`);
 for(const type of ['Sensor','Camera','Ballast','Aero Surface','Light'])assert.ok(Html.includes(`value="${type}"`),`missing addable type ${type}`);
});
test('Flat SVG studio icons, no 2D viewport grid, and the shared charcoal-card slider styling are present',()=>{
 for(const token of ['--bg-canvas:#0b0b0b','--radius-column:22px','.property-card','.pill-range','.value-pill','.outliner-column','.inspector-column','.tree-glyph svg','.component-dialog'])assert.ok(Css.includes(token),`missing studio style ${token}`);
 assert.ok(!Css.includes('.viewport-stage-wrap::before'),'the flat CSS grid overlay should stay removed');
 assert.ok(Js.includes('const IconPaths='));assert.ok(Read('README.md').includes('Ten selectable Stage inspection channels'));
});
console.log(`ALL PASSED (${Passed}/${Passed})`);
