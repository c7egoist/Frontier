// Verifies the GLB exporter works on generated buildings (the Blender handoff).
import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
import fs from 'node:fs';
import * as THREE from 'three';
const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');

const gen = new BuildingGenerator(new MaterialLibrary());
const cases = [['machiya', 'machiya'], ['temple', 'temple'], ['konbini', 'citypop'], ['pagoda', 'lacquer']];
for (const [type, theme] of cases) {
  const { group, info } = gen.generate(paramsFor(type, { seed: `glb-${type}`, theme, detail: 2 }));
  const exporter = new GLTFExporter();
  const t0 = performance.now();
  const buf = await new Promise((resolve, reject) => {
    exporter.parse(group, (res) => resolve(res), (e) => reject(e), { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  });
  const file = `shots/test/${type}.glb`;
  fs.writeFileSync(file, Buffer.from(buf));
  // sanity: parse the GLB header + JSON chunk
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(Buffer.from(buf, 20, jsonLen).toString('utf8'));
  console.log(
    `  ${type.padEnd(8)} ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB  magic=${magic}  ` +
      `meshes=${json.meshes.length} materials=${json.materials.length} nodes=${json.nodes.length} ` +
      `images=${(json.images || []).length} tris=${info.triangles}  ${(performance.now() - t0).toFixed(0)}ms`
  );
  if (magic !== 'glTF') throw new Error('bad GLB magic');
  if (!json.meshes?.length) throw new Error('no meshes in GLB');
}
console.log('✅ GLB export verified');
