//============================================================================================================================================
//                                                             SMOKETEST.JS
//============================================================================================================================================
// 📦 Node.js CLI Smoke Test suite for Voxel Cliffs.
// Validates 3D SDF mathematics, Surface Nets meshing, overhang detection (>90°),
// Gaea-style Stacks strata, satmap synthesis, and OBJ/PLY exporter formatting without browser DOM.

import { CliffField } from './VoxelField.js';
import { SurfaceNetsMesher } from './SurfaceNets.js';
import { CliffPresets, CliffStageInfo } from './CliffPresets.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

console.log('=================================================================');
console.log('🧪 CLIFFVOXELS PROCEDURAL VOXEL CLIFF ENGINE SMOKE TEST');
console.log('=================================================================\n');

// 1. Test Presets & SDF Evaluation
console.log('--- 1. Testing Presets & 3D SDF Field Evaluation ---');
for (const [key, preset] of Object.entries(CliffPresets)) {
    const field = new CliffField(preset.spec);
    const d0 = field.evaluate(0, 0, 0, 5);
    const n0 = field.normal(0, 0, 0, 0.05, 5);
    const sat = field.getSatmap(0, 0, 0, n0, 5);

    assert(Number.isFinite(d0), `Preset [${preset.label}] SDF evaluation returns finite float (${d0.toFixed(3)})`);
    const nLen = Math.sqrt(n0.x * n0.x + n0.y * n0.y + n0.z * n0.z);
    assert(Math.abs(nLen - 1.0) < 0.05, `Preset [${preset.label}] analytical normal is unit length (${nLen.toFixed(3)})`);
    assert(Number.isFinite(sat.slope) && Number.isFinite(sat.cavity), `Preset [${preset.label}] satmaps evaluated`);
}

// 2. Test 5-Stage Progressive Pipeline
console.log('\n--- 2. Testing 5-Stage Progressive Pipeline ---');
const testSpec = CliffPresets.sandstone_canyon.spec;
const testField = new CliffField(testSpec);

for (let s = 1; s <= 5; s++) {
    const mesh = SurfaceNetsMesher.generateMesh(testField, {
        stage: s,
        resX: 40,
        resY: 34,
        resZ: 40
    });
    assert(mesh.vertexCount > 0, `Stage 0${s} [${CliffStageInfo[s - 1].name}] generated ${mesh.vertexCount} vertices, ${mesh.triangleCount} triangles`);
}

// 3. Test True 3D Overhangs (>90° / \ / profiles)
console.log('\n--- 3. Testing True 3D Overhangs (>90° acute undercuts) ---');
const coastalField = new CliffField(CliffPresets.coastal_cliff.spec);
const coastalMesh = SurfaceNetsMesher.generateMesh(coastalField, {
    stage: 5,
    resX: 48,
    resY: 40,
    resZ: 48
});

assert(coastalMesh.overhangCount > 0, `Coastal cliff contains ${coastalMesh.overhangCount} overhang vertices (${coastalMesh.overhangPercent.toFixed(1)}%) with normal.y < -0.05`);
assert(coastalMesh.overhangPercent > 2.0, `Overhang percentage is significant (${coastalMesh.overhangPercent.toFixed(1)}% > 2.0%), confirming non-heightfield 3D geometry`);

// 4. Test OBJ & PLY Exporters
console.log('\n--- 4. Testing OBJ & PLY File Exporters ---');
const objOutput = SurfaceNetsMesher.toOBJ(coastalMesh, 'CoastalCliff_Test');
assert(objOutput.includes('v ') && objOutput.includes('vn ') && objOutput.includes('f '), `OBJ exporter produces standard vertices, normals, and face elements (${objOutput.length} bytes)`);

const plyOutput = SurfaceNetsMesher.toPLY(coastalMesh, 'CoastalCliff_Test');
assert(plyOutput.includes('property uchar red') && plyOutput.includes('element vertex') && plyOutput.includes('element face'), `PLY exporter produces valid ASCII PLY header with RGB vertex colors (${plyOutput.length} bytes)`);

console.log('\n=================================================================');
console.log(`SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('=================================================================\n');

if (failed > 0) {
    process.exit(1);
}
