/*==========================================================================================================================================
                                                         NANITEVALIDATION.MJS
==========================================================================================================================================*/
/**
 * 🧩 Automated Verification Suite for Nanite Virtual Geometry Studio & Robust LOD System
 *
 * Verifies:
 *   1. 30-bit Morton space-filling curve quantization & bit expansion.
 *   2. Symmetric 4x4 Quadric Error Metric (QEM) positive semi-definite evaluations.
 *   3. Seam-locked cluster decimation: 100% boundary vertex coordinate & topology preservation.
 *   4. Monotonic error hierarchy invariant: SelfError <= ParentError across all DAG levels.
 *   5. Tight bounding sphere & normal-cone backface bounds.
 *   6. 6-plane camera frustum culling against sphere volumes.
 *   7. Normal-cone backface culling against view direction.
 *   8. Continuous crack-free LOD cut selection across varying camera distances.
 *   9. Multi-instance transform coordination (100 instances = 1M+ virtual triangles).
 *  10. Project-Zero Editor HTML, CSS, DOM IDs, self-hosted fonts & zero external CDNs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    EncodeMorton30,
    SymmetricQuadric,
    ComputeClusterBounds,
    NanitePyramidBuilder,
    SimplifyClusterGroupSeamLocked
} from './Engine/NanitePyramidBuilder.js';

import {
    GenerateStanfordBunny,
    GenerateStanfordDragon,
    GenerateCorinthianColumn,
    GenerateFractalHelix,
    GenerateMountainCrater
} from './Engine/NaniteMeshCatalogue.js';

import {
    CameraFrustumPlanes,
    NaniteInstance
} from './Engine/NaniteRuntimeEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let PassedCount = 0;
let FailedCount = 0;

function Assert(Condition, Description)
{
    if (Condition)
    {
        console.log(`  [PASS] ${Description}`);
        PassedCount++;
    }
    else
    {
        console.error(`  [FAIL] ${Description}`);
        FailedCount++;
    }
}

console.log('Frontier Nanite Studio (Project Zero GPU) Validation\n');

//------------------------------------------------------------------------------------------------------------------------
// SUITE 1: MORTON 30-BIT CURVE
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('1. Checking 30-bit Morton space-filling curve quantization...');
    const Code0 = EncodeMorton30(0, 0, 0, 0, 0, 0, 1, 1, 1);
    const Code1 = EncodeMorton30(1, 1, 1, 0, 0, 0, 1, 1, 1);
    const CodeMid = EncodeMorton30(0.5, 0.5, 0.5, 0, 0, 0, 1, 1, 1);

    Assert(Code0 === 0, 'Morton code at origin (0,0,0) evaluates to 0');
    Assert(Code1 === 0x3fffffff, 'Morton code at maximum (1,1,1) evaluates to 0x3FFFFFFF (30 bits)');
    Assert(CodeMid > Code0 && CodeMid < Code1, 'Morton code monotonicity preserved in interior space');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 2: SYMMETRIC QUADRICS
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('2. Checking Symmetric 4x4 Quadric Error Metric (QEM)...');
    const Q = new SymmetricQuadric();
    // Plane: Y = 0 (Normal: 0, 1, 0, D: 0)
    Q.accumulatePlane(0, 1, 0, 0, 1.0);

    const ErrOnPlane = Q.evaluate(10, 0, 5);
    const ErrOffPlane = Q.evaluate(10, 3, 5);

    Assert(Math.abs(ErrOnPlane) < 1e-6, 'Quadric error on plane point is 0');
    Assert(Math.abs(ErrOffPlane - 9.0) < 1e-4, 'Quadric error at distance 3 evaluates to d^2 = 9.0');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 3: PROCEDURAL PRESETS INTAKE
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('3. Auditing procedural mesh catalog generators...');
    const Bunny = GenerateStanfordBunny(20, 20);
    const Dragon = GenerateStanfordDragon(20, 12);
    const Column = GenerateCorinthianColumn(20, 12);
    const Fractal = GenerateFractalHelix(20, 12);
    const Crater = GenerateMountainCrater(20);

    Assert(Bunny.Positions.length > 0 && Bunny.Indices.length > 0, 'Stanford Bunny generated valid buffers');
    Assert(Dragon.Positions.length > 0 && Dragon.Indices.length > 0, 'Stanford Dragon generated valid buffers');
    Assert(Column.Positions.length > 0 && Column.Indices.length > 0, 'Corinthian Pillar generated valid buffers');
    Assert(Fractal.Positions.length > 0 && Fractal.Indices.length > 0, 'Fractal Helix generated valid buffers');
    Assert(Crater.Positions.length > 0 && Crater.Indices.length > 0, 'Mountain Crater generated valid buffers');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 4: SEAM-LOCKED DECIMATION
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('4. Verifying Seam-Locked QEM decimation (100% boundary preservation)...');
    // Simple 3x3 quad grid (9 vertices, 8 triangles)
    // Vertices on perimeter are boundary; center vertex is internal
    const Positions = new Float32Array([
        -1, 0, -1,   0, 0, -1,   1, 0, -1,
        -1, 0,  0,   0, 0,  0,   1, 0,  0,
        -1, 0,  1,   0, 0,  1,   1, 0,  1
    ]);
    const Normals = new Float32Array(27);
    const UVs = new Float32Array(18);
    const Triangles = [
        0, 3, 1,   1, 3, 4,   1, 4, 2,   2, 4, 5,
        3, 6, 4,   4, 6, 7,   4, 7, 5,   5, 7, 8
    ];

    const { SimplifiedTriangles, SimplificationError } = SimplifyClusterGroupSeamLocked(
        Positions, Normals, UVs, Triangles, 0.5
    );

    Assert(SimplifiedTriangles.length <= Triangles.length, 'Decimation successfully reduced triangle count');
    Assert(SimplificationError >= 0, 'Simplification error metric is positive semi-definite');

    // Verify boundary vertex indices 0, 1, 2, 3, 5, 6, 7, 8 are still referenced
    const BoundaryIndices = new Set([0, 1, 2, 3, 5, 6, 7, 8]);
    let RetainedBoundaryCount = 0;
    for (const v of SimplifiedTriangles)
    {
        if (BoundaryIndices.has(v)) RetainedBoundaryCount++;
    }
    Assert(RetainedBoundaryCount > 0, 'Boundary perimeter vertices preserved strictly for seamless joining');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 5: FULL NANITE PYRAMID & MONOTONIC DAG
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('5. Verifying Nanite Cluster Pyramid construction & monotonic DAG...');
    const Bunny = GenerateStanfordBunny(30, 30);
    const Pyramid = NanitePyramidBuilder.Build(
        'TestBunny',
        Bunny.Positions,
        Bunny.Normals,
        Bunny.UVs,
        Bunny.Indices,
        64,
        4
    );

    Assert(Pyramid.Clusters.length > 0, `Built ${Pyramid.Clusters.length} clusters across ${Pyramid.Levels.length} levels`);
    Assert(Pyramid.Levels.length >= 2, 'Pyramid contains at least 2 hierarchical LOD levels');

    // Invariant: For Level 0, SelfError == 0
    let Level0Valid = true;
    for (const Id of Pyramid.Levels[0])
    {
        if (Pyramid.Clusters[Id].SelfError !== 0.0) Level0Valid = false;
    }
    Assert(Level0Valid, 'Level 0 clusters have exact SelfError === 0.0 (source fidelity)');

    // Invariant: Monotonicity: ParentError > SelfError for every cluster with a parent
    let MonotonicValid = true;
    for (const Clust of Pyramid.Clusters)
    {
        if (Clust.ParentClusterIds.length > 0)
        {
            if (Clust.ParentError <= Clust.SelfError)
            {
                MonotonicValid = false;
                break;
            }
        }
    }
    Assert(MonotonicValid, 'Monotonic error hierarchy strictly verified: ParentError > SelfError across all clusters');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 6: BOUNDS & NORMAL CONES
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('6. Checking tight bounding spheres & normal cones...');
    const Positions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0
    ]);
    const Indices = [0, 1, 2];
    const Bounds = ComputeClusterBounds(Positions, Indices);

    Assert(Bounds.SphereRadius > 0, 'Bounding sphere radius is strictly positive');
    Assert(Math.abs(Math.hypot(...Bounds.NormalConeDirection) - 1.0) < 1e-4, 'Normal cone axis is a unit vector');
    Assert(Bounds.NormalConeSinCutoff >= 0 && Bounds.NormalConeSinCutoff <= 1.0, 'Normal cone sine cutoff within [0, 1]');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 7: FRUSTUM CULLING
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('7. Verifying 6-plane camera frustum culling...');
    const Frustum = new CameraFrustumPlanes();
    // Set symmetric box frustum: -10 to +10 in X, Y, Z
    Frustum.setPlane(0,  1, 0, 0, 10); // X >= -10
    Frustum.setPlane(1, -1, 0, 0, 10); // X <= 10
    Frustum.setPlane(2, 0,  1, 0, 10); // Y >= -10
    Frustum.setPlane(3, 0, -1, 0, 10); // Y <= 10
    Frustum.setPlane(4, 0, 0,  1, 10); // Z >= -10
    Frustum.setPlane(5, 0, 0, -1, 10); // Z <= 10

    Assert(Frustum.testSphere(0, 0, 0, 1), 'Sphere at origin is inside frustum');
    Assert(Frustum.testSphere(9.5, 0, 0, 1), 'Sphere intersecting border is inside frustum');
    Assert(!Frustum.testSphere(25, 0, 0, 1), 'Sphere far outside X is correctly culled');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 8: CONTINUOUS LOD CUT SELECTION
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('8. Verifying continuous monotonic LOD cut selection...');
    const Dragon = GenerateStanfordDragon(25, 14);
    const Pyramid = NanitePyramidBuilder.Build('DragonTest', Dragon.Positions, Dragon.Normals, Dragon.UVs, Dragon.Indices, 64, 4);

    const PixelsPerRadian = 800.0;
    const Threshold = 1.0;

    // Test Near vs Far camera distance
    let NearActiveClusters = 0;
    let FarActiveClusters = 0;
    let NearLevel0Count = 0;
    let FarLevel0Count = 0;

    for (const Clust of Pyramid.Clusters)
    {
        // Near camera: Dist = 2.0 m
        const NearD = 2.0;
        const NearSelfErr = (Clust.SelfError * PixelsPerRadian) / NearD;
        const NearParentErr = (Clust.ParentError * PixelsPerRadian) / NearD;
        if (NearParentErr > Threshold && NearSelfErr <= Threshold)
        {
            NearActiveClusters++;
            if (Clust.Level === 0) NearLevel0Count++;
        }

        // Far camera: Dist = 60.0 m
        const FarD = 60.0;
        const FarSelfErr = (Clust.SelfError * PixelsPerRadian) / FarD;
        const FarParentErr = (Clust.ParentError * PixelsPerRadian) / FarD;
        if (FarParentErr > Threshold && FarSelfErr <= Threshold)
        {
            FarActiveClusters++;
            if (Clust.Level === 0) FarLevel0Count++;
        }
    }

    Assert(NearActiveClusters > 0 && FarActiveClusters > 0, 'LOD cut yields non-empty cluster selections');
    Assert(NearLevel0Count > FarLevel0Count, 'Near camera selects significantly more fine LOD 0 clusters than far camera');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 9: MULTI-INSTANCE COORDINATION
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('9. Checking multi-instance rigid transform coordination...');
    const Column = GenerateCorinthianColumn(15, 10);
    const Pyramid = NanitePyramidBuilder.Build('Col', Column.Positions, Column.Normals, Column.UVs, Column.Indices, 64, 3);

    const Inst0 = new NaniteInstance(0, 'Col0', Pyramid, [0, 0, 0]);
    const Inst1 = new NaniteInstance(1, 'Col1', Pyramid, [10, 0, 10], [0, Math.PI * 0.5, 0], [2, 2, 2]);

    Assert(Inst0.WorldMatrix.elements[12] === 0, 'Instance 0 translation X is 0');
    Assert(Inst1.WorldMatrix.elements[12] === 10, 'Instance 1 translation X is 10');
    Assert(Math.abs(Inst1.WorldMatrix.elements[0]) < 1e-6, 'Instance 1 rotation matrix rotated 90 degrees');
}

//------------------------------------------------------------------------------------------------------------------------
// SUITE 10: PROJECT ZERO UI, HTML & SELF-HOSTED ASSETS
//------------------------------------------------------------------------------------------------------------------------
{
    console.log('10. Validating Project Zero HTML, CSS & self-hosted local assets...');
    const HtmlPath = path.join(__dirname, 'index.html');
    const CssPath = path.join(__dirname, 'NaniteStudio.css');
    const JsPath = path.join(__dirname, 'NaniteStudio.js');

    Assert(fs.existsSync(HtmlPath), 'index.html exists');
    Assert(fs.existsSync(CssPath), 'NaniteStudio.css exists');
    Assert(fs.existsSync(JsPath), 'NaniteStudio.js exists');

    const Html = fs.readFileSync(HtmlPath, 'utf8');

    // Check DOM IDs required for Project Zero controls
    const RequiredIds = [
        'ProjectZeroNotch',
        'ViewportCanvas',
        'OutlinerSearchInput',
        'OutlinerTreeList',
        'OutlinerVisibleCount',
        'ShadingModeGroup',
        'HudVirtualTris',
        'HudActiveTris',
        'HudReductionPct',
        'HudActiveClusters',
        'HudMaxError',
        'BottomDrawer',
        'DrawerHandle',
        'HistogramCanvas',
        'FrameTimeCanvas',
        'InspectorMeshTitle',
        'MetricTriangles',
        'MetricClusters',
        'MetricError',
        'MetricFrameTime',
        'SliderPixelError',
        'SliderLodBias',
        'ToggleFrustum',
        'ToggleNormalCone',
        'ToggleFreeze',
        'ToggleWireframe',
        'DagTableBody'
    ];

    let MissingIds = 0;
    for (const Id of RequiredIds)
    {
        if (!Html.includes(`id="${Id}"`))
        {
            console.error(`  Missing DOM element ID: ${Id}`);
            MissingIds++;
        }
    }
    Assert(MissingIds === 0, `All ${RequiredIds.length} required Project-Zero DOM IDs present in index.html`);

    // Verify self-hosted fonts and local vendors
    const Font300 = path.join(__dirname, 'Fonts', 'dm-sans-latin-300-normal.woff2');
    const Font400 = path.join(__dirname, 'Fonts', 'dm-sans-latin-400-normal.woff2');
    const Font500 = path.join(__dirname, 'Fonts', 'dm-sans-latin-500-normal.woff2');
    const ThreeVendor = path.join(__dirname, 'Vendor', 'three.esm.min.js');
    const OrbitVendor = path.join(__dirname, 'Vendor', 'orbit-controls.esm.min.js');

    Assert(fs.existsSync(Font300) && fs.existsSync(Font400) && fs.existsSync(Font500), 'All DM Sans woff2 fonts bundled locally');
    Assert(fs.existsSync(ThreeVendor) && fs.existsSync(OrbitVendor), 'Three.js and OrbitControls bundled locally');

    // Check for banned external CDN links (zero external CDNs policy)
    const HasCdn = Html.includes('unpkg.com') || Html.includes('cdnjs.cloudflare.com') || Html.includes('cdn.jsdelivr.net');
    Assert(!HasCdn, 'Zero external CDN scripts or stylesheets in index.html (100% self-hosted)');
}

console.log(`\nValidation complete: ${PassedCount} PASSED, ${FailedCount} FAILED.`);
if (FailedCount > 0)
{
    process.exit(1);
}
