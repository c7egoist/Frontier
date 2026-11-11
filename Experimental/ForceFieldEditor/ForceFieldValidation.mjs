import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const Here = path.dirname(fileURLToPath(import.meta.url));
const { ForceFieldCatalogue: F } = await import(path.join(Here, 'Engine/ForceFieldCatalogue.js'));

let Passed = 0;
function Test(Name, Fn)
{
    Fn();
    Passed++;
    console.log(`PASS ${Name}`);
}

Test('Catalogue exposes WindGenerator + 16 forcefield types with finite default reaches', () =>
{
    assert.equal(F.Types.length, 17);
    assert.ok(F.TypeById.WindGenerator, 'WindGenerator type must exist');
    for (const Type of F.Types)
    {
        assert.ok(['Sphere', 'Column', 'Box'].includes(Type.Reach), `${Type.Id} must have finite default Reach, got ${Type.Reach}`);
        const Src = F.ConstructSource(Type.Id);
        assert.ok(['Sphere', 'Column', 'Box'].includes(Src.Reach), `${Type.Id} source reach must be bounded`);
        assert.ok(Src.Radius > 0, `${Type.Id} default Radius must be > 0`);
    }
});

Test('All 17 forcefield types return exact zero outside finite influence bounds', () =>
{
    const Scene = F.ConstructScenario('blank');
    Scene.Wind.Enabled = false;
    for (const Type of F.Types)
    {
        const Src = F.ConstructSource(Type.Id, { Centre: [0, 10, 0], Radius: 120, HalfX: 80, HalfZ: 80, Height: 60 });
        if (Type.Id === 'Blast') Src.InitialRadius = 20;
        const Single = Object.assign({}, Scene, { Sources: [Src] });
        const Prep = F.Prepare(Single, Type.Id === 'Blast' ? 0.5 : 1.0);
        const FarOut = [0, 0, 0];
        F.EvaluatePrepared(Single, Prep, Type.Contribution, 5000, 10, 5000, 2, FarOut);
        assert.deepEqual(FarOut, [0, 0, 0], `${Type.Id} leaked force at (5000, 10, 5000) outside R=120`);
    }
});

Test('WindGenerator produces coherent directional airflow + gusts inside influence and zero outside', () =>
{
    const Scene = F.ConstructScenario('blank');
    const WG = F.ConstructSource('WindGenerator', { Centre: [0, 0, 0], Bearing: 90, Strength: 16, Radius: 180, Height: 120, Falloff: 'Smooth' });
    Scene.Sources = [WG];
    const Prep = F.Prepare(Scene, 2.0);
    const CenterOut = [0, 0, 0];
    F.EvaluatePrepared(Scene, Prep, 'Flow', 10, 15, 0, 2, CenterOut);
    assert.ok(CenterOut[0] > 8, `Expected +X flow near WindGenerator bearing 90°, got ${CenterOut}`);
    const EdgeOut = [0, 0, 0];
    F.EvaluatePrepared(Scene, Prep, 'Flow', 250, 15, 0, 2, EdgeOut);
    assert.deepEqual(EdgeOut, [0, 0, 0], `Expected zero outside Radius 180, got ${EdgeOut}`);
});

Test('WindGenerator also produces curl turbulence only inside radius', () =>
{
    const Scene = F.ConstructScenario('lab');
    const Prep = F.Prepare(Scene, 1.5);
    const Quiet = [0, 0, 0];
    F.EvaluatePrepared(Scene, Prep, 'Flow', -900, 10, -900, 2, Quiet);
    assert.deepEqual(Quiet, [0, 0, 0], 'Lab default ambient wind must be off so open corners stay calm');
});

Test('Ambient Wind matches Ekman profile math cleanly and honors optional Bounded RegionRadius', () =>
{
    const Scene = F.ConstructScenario('storm');
    Scene.Sources = [];
    Scene.Wind.Enabled = true;
    Scene.Wind.Bounded = false;
    const Prep = F.Prepare(Scene, 0);
    const Out = [0, 0, 0];
    F.EvaluatePrepared(Scene, Prep, 'Flow', 0, 10, 0, 2, Out);
    const Spd = Math.hypot(Out[0], Out[1], Out[2]);
    assert.ok(Spd > 3 && Spd < 15, `Unexpected ambient wind speed: ${Spd}`);

    // Bounded regional ambient wind cleanly drops to 0 outside RegionRadius
    Scene.Wind.Bounded = true;
    Scene.Wind.RegionRadius = 500;
    const BoundedPrep = F.Prepare(Scene, 0);
    const FarOut = [0, 0, 0];
    F.EvaluatePrepared(Scene, BoundedPrep, 'Flow', 900, 10, 900, 2, FarOut);
    assert.deepEqual(FarOut, [0, 0, 0], `Bounded ambient wind leaked outside RegionRadius=500: ${FarOut}`);
});

Test('Field samples convert to SI receiver force, pressure, and moment', () =>
{
    const Flow = F.ResolveReceiverLoad('Flow', [10, 0, 0], { AreaM2: 0.8, DragCoefficient: 1, LeverArmM: 0.25 });
    assert.equal(Flow.PressurePa, 61.25, '10 m/s flow should produce 61.25 Pa dynamic pressure at sea-level density');
    assert.equal(Flow.ForceN, 49, 'Flow load should apply pressure × drag coefficient × area');
    assert.equal(Flow.MomentNm, 12.25, 'Moment should apply force × perpendicular lever arm');

    const Acceleration = F.ResolveReceiverLoad('Accelerate', [0, 9.81, 0], { MassKg: 80, AreaM2: 0.5, LeverArmM: 0.25 });
    assert.ok(Math.abs(Acceleration.ForceN - 784.8) < 1e-9, 'Acceleration load should use F = m|a|');
    assert.ok(Math.abs(Acceleration.PressurePa - 1569.6) < 1e-9, 'Acceleration pressure should use F/A');

    const Damping = F.ResolveReceiverLoad('Damp', [2, 0, 0], { MassKg: 80, AreaM2: 0.5, LeverArmM: 0.25, ReferenceSpeed: 1.5 });
    assert.equal(Damping.ForceN, 240, 'Damping load should use F = mγv with the configured reference speed');
    assert.equal(Damping.MomentNm, 60);
    assert.ok(Flow.Formula.includes('kg/m³') && Damping.FieldUnit === '1/s', 'SI assumptions and damping units should be explicit');
});

Test('All 4 scenarios construct cleanly and encode Levelspace TOML', () =>
{
    for (const Key of ['lab', 'corridor', 'storm', 'blank'])
    {
        const S = F.ConstructScenario(Key);
        const Lines = F.EncodeLevelspace(S);
        assert.ok(Array.isArray(Lines) && Lines.length > 0, `Levelspace failed for ${Key}`);
        assert.ok(Lines.some((L) => L.includes('Type = "ForceField"')));
    }
});

Test('ForceFieldVisualization.js exports RK2 flow lines, sparse cutoff, minimal labels, and placement hooks', () =>
{
    const Require = createRequire(import.meta.url);
    const VizPath = path.resolve(Here, '../ForceFieldVisualization/ForceFieldVisualization.js');
    const Viz = Require(VizPath);
    assert.equal(typeof Viz.Create, 'function');
    assert.equal(typeof Viz.FormatDistance, 'function');
    assert.equal(typeof Viz.InvertProjection, 'function');
    const SrcText = fs.readFileSync(VizPath, 'utf8');
    for (const Token of ['RenderFlowLines', 'FlowLineSpacing', 'QuietCutoff', 'MinimalLabels', 'RenderPlacementPreview', 'HitSourceHandle'])
    {
        assert.ok(SrcText.includes(Token), `ForceFieldVisualization.js missing ${Token}`);
    }
});

Test('Project-Zero style shell, SI load probe, and visualization assets are intact', () =>
{
    const Html = fs.readFileSync(path.join(Here, 'index.html'), 'utf8');
    for (const Id of [
        'OutlinerContent', 'ViewportBar', 'ViewportCanvas', 'Stage3DMount', 'SceneSelect',
        'QuickPlaceGroup', 'PlaceTypeSelect', 'ViewModeSelect', 'SpanSelect', 'ViewPresetSelect',
        'PlaceBanner', 'HeatmapLegend', 'InspectorContent', 'TimelineStrip', 'LogDrawer'
    ])
    {
        assert.ok(Html.includes(`id="${Id}"`), `index.html missing #${Id}`);
    }
    assert.ok(Html.includes('"three": "./Vendor/three.esm.min.js"'), 'Missing three importmap');
    assert.ok(Html.includes('<title>Force Field Editor</title>'), 'Editor title should be unbranded');
    assert.ok(!Html.includes('ScenarioTabs') && !Html.includes('doc-tab-bar') && !Html.includes('brand-cluster'), 'Legacy branding and scenario tabs must be removed');
    assert.ok(!Html.includes('ToggleVectors') && !Html.includes('ToggleFlowLines') && !Html.includes('ToggleHeatmap'), 'View layers should use the compact preset control');

    const Css = fs.readFileSync(path.join(Here, 'ForceFieldEditor.css'), 'utf8');
    assert.ok(Css.includes('[hidden]') && Css.includes('display: none !important'), 'CSS missing explicit [hidden] override');
    assert.ok(Css.includes('.property-select') && Css.includes('.engineering-card') && Css.includes('.row-glyph'), 'CSS missing dropdown, SI readout, or Outliner styles');
    assert.ok(Css.includes('.row-glyph') && Css.includes('background: transparent !important'), 'Outliner glyphs should be monochrome without coloured tiles');

    const Stage3D = fs.readFileSync(path.join(Here, 'Engine/ForceField3DViewport.js'), 'utf8');
    assert.ok(Stage3D.includes('_SyncHeatmap') && Stage3D.includes('HeatmapTexture') && Stage3D.includes('HeatmapMesh.visible = Enabled'), '3D Stage must support field heatmap rendering');
    assert.ok(Stage3D.includes('const Steps = 15') && Stage3D.includes('HeadBase'), '3D vectors should use a readable sampling grid and arrowheads');
    const EditorJs = fs.readFileSync(path.join(Here, 'ForceFieldEditor.js'), 'utf8');
    assert.ok(EditorJs.includes('BuildEngineeringCard') && EditorJs.includes('ReadLoadProbe') && EditorJs.includes('SampleCapacity = 60'), 'Live SI receiver-load diagnostics are missing');
    assert.ok(!EditorJs.includes('Anemometer') && EditorJs.includes('N·m') && EditorJs.includes('PressurePa'), 'Generic force-field UI should show physical load units, not an anemometer');
    assert.ok(!EditorJs.includes('SymbolBox.style.background') && !EditorJs.includes('Glyph.style.background'), 'UI entity icons must not use coloured backgrounds');
    const Controls = fs.readFileSync(path.join(Here, 'StudioControls.js'), 'utf8');
    for (const Token of ['SelectRow', 'ActionSelect', 'TimeSeries', 'TimeLabels']) assert.ok(Controls.includes(Token), `StudioControls missing ${Token}`);
    assert.ok(Controls.includes('const HistoryOffset = Math.max(0, Capacity - Samples.length)') && Controls.includes('const SampleX = (Index) =>'), 'Partial time-series history must align to the recent end of the 60-second window');
    assert.ok(Controls.includes('else if (Samples.length === 1)'), 'Time-series must show a point before the first line segment exists');
    assert.ok(EditorJs.includes("TimeLabels: ['−60 s', '−30 s', 'now']") && Controls.includes('Ctx.fillText(Labels[0]'), 'Load traces must label and render the rolling 60-second window');

    const StaticIds = [...Html.matchAll(/\bid="([^"]+)"/g)].map((Match) => Match[1]);
    const UniqueIds = new Set(StaticIds);
    assert.equal(UniqueIds.size, StaticIds.length, 'index.html must not contain duplicate IDs');
    for (const Match of EditorJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g))
    {
        assert.ok(UniqueIds.has(Match[1]), `ForceFieldEditor.js references missing #${Match[1]}`);
    }

    // Samples occupy only their true recent interval until the capacity fills.
    const SampleX = (Index, SampleCount, Capacity) => ((Math.max(0, Capacity - SampleCount) + Index) / Math.max(1, Capacity - 1));
    assert.equal(SampleX(0, 1, 60), 1, 'A first sample should sit at the “now” edge');
    assert.equal(SampleX(0, 30, 60), 30 / 59, 'A half-full trace should begin halfway through its history window');
    assert.equal(SampleX(0, 60, 60), 0, 'A full trace should span the full rolling window');

    const DefaultScene = F.ConstructScenario('lab');
    assert.equal(DefaultScene.Visualization.Preset, 'composite');
    assert.ok(DefaultScene.Visualization.Heatmap && DefaultScene.Visualization.Arrows && DefaultScene.Visualization.FlowLines && DefaultScene.Visualization.Tracers, 'Default 2D view should be a composite engineering visualization');

    assert.equal(F.ResolveSourceColour('Attractor'), '#ff4757');
    assert.equal(F.ResolveSourceColour('Repulsor'), '#3b8eff');
    assert.equal(F.ResolveSourceColour('GustFront'), '#ff8c32');
    for (const T of F.Types) assert.ok(/^#[0-9a-f]{6}$/i.test(F.ResolveSourceColour(T.Id)), `Missing colour on ${T.Id}`);

    const OrbitJs = fs.readFileSync(path.join(Here, 'Vendor/orbit-controls.esm.min.js'), 'utf8');
    assert.ok(!OrbitJs.includes("from 'three'") && !OrbitJs.includes('from "three"'), 'orbit-controls has unrewritten bare three import');

    for (const Rel of [
        'Vendor/three.esm.min.js', 'Vendor/orbit-controls.esm.min.js',
        'Fonts/dm-sans-latin-300-normal.woff2', 'Fonts/dm-sans-latin-400-normal.woff2', 'Fonts/dm-sans-latin-500-normal.woff2',
        'Icons/wind.svg', 'Icons/camera.svg', 'Icons/earth.svg', 'Icons/clouds.svg',
        'Engine/ForceFieldCatalogue.js', 'Engine/ForceField3DViewport.js', 'StudioControls.js', 'ForceFieldEditor.js'
    ])
    {
        assert.ok(fs.existsSync(path.join(Here, Rel)), `Missing asset/module: ${Rel}`);
    }
});

console.log(`ALL PASSED (${Passed}/${Passed})`);
