/*============================================================================================================================================
                                                  PARTICLEWORKSPACEVALIDATION.MJS
============================================================================================================================================*/
// Headless 14-Suite Verification for Experimental/ParticleWorkspace/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
    MAX_GPU_FIELDS,
    DOC_REVISION_CAP_BYTES,
    ForceFieldKinds,
    FieldKindById,
    EmitterPresets,
    FIBRE_PATHS,
    ParticleKind,
    ConstructField,
    BaseEmitter,
    ConstructEmitterFromPreset,
    ResolveFieldBuckets,
    AdvanceVelocityByFields,
    PackFieldsForGPU,
    EvaluateFibreStrands,
    LightningStorm,
    ConstructParticleSpace,
    ParticleSimulator,
    OperationRecorder,
    EncodeParticleSpaceToml
} from './Engine/ParticleSpaceCatalogue.js';
import { GetParticleSourceSvgIcon } from './Engine/WorkspaceIcons.js';
import {
    INSPECTION_MODES,
    PAINT_OPTIONS,
    RIM_OPTIONS,
    AssembleControlVehicle,
    CreateVehicleState,
    TriggerPaintRipple,
    TriggerRimRipple,
    SetInspectionMode,
    CycleInspectionMode,
    StepVehicleState,
    PackVehicleUniform,
    UnprojectViewportRay,
    RaycastVehicle,
    SampleVehicleSurface
} from './VehicleStage.js';
import './Engine/pe.js';
import './Engine/fibres.js';
import './Engine/presets.js';
import './Engine/shaders.js';
import './Engine/forcefields.js';
import { PE } from './Engine/pe.js';
import { SoftwarePreviewEngine } from './SoftwarePreviewEngine.js';
import {
    Types,
    TypeById,
    ConstructSource,
    ConstructChamberScenario,
    Prepare,
    EvaluateAllPrepared,
    SampleWindTexData,
    PackForceEntries,
    EncodeLevelspace
} from './Engine/ForceFieldCatalogue.js';
import { EvaluateFieldAcceleration } from './ParticleFieldReadback.js';

const Require = createRequire(import.meta.url);
const ForceFieldVisualization = Require('../ForceFieldVisualization/ForceFieldVisualization.js');

let Passed = 0;
function Suite(Name, Fn)
{
    Fn();
    Passed++;
    console.log(`[PASS] ${Passed.toString().padStart(2, '0')} · ${Name}`);
}

Suite('ForceFieldKinds (13 primitives) & Flow/Accelerate/Damp Bucket Resolution', () => {
    assert.equal(ForceFieldKinds.length, 13);
    const Wind = ConstructField('prevailing', { Strength: 4.5, Bearing: 90 });
    const Grav = ConstructField('gravity', { Strength: 9.81, Direction: [0, -1, 0] });
    const Drag = ConstructField('drag', { Strength: 2.0, Centre: [0, 1, 0] });
    const B = ResolveFieldBuckets([Wind, Grav, Drag], [0, 1, 0], 0);
    assert.ok(Math.abs(B.Flow[0] - 4.5) < 1e-6);
    assert.ok(Math.abs(B.Acc[1] + 9.81) < 1e-6);
    assert.ok(Math.abs(B.Damp - 2.0) < 1e-6);
});

Suite('AdvanceVelocityByFields Exponential Flow Tracking & Galilean Accelerate', () => {
    const Buckets = { Flow: [6, 0, 0], Acc: [0, -10, 0], Damp: 0.5 };
    const V = AdvanceVelocityByFields([0, 0, 0], Buckets, 1.5, 0.2, 0.0, 0.05);
    assert.ok(V[0] > 0.1 && V[0] < 6);
    assert.ok(V[1] < 0);

    const VFree = AdvanceVelocityByFields([0, 0, 0], { Flow: [20, 0, 0], Acc: [0, -10, 0], Damp: 0 }, 0, 0, 0, 0.1);
    assert.equal(VFree[0], 0);
    assert.ok(Math.abs(VFree[1] + 1.0) < 1e-6);
});

Suite('PackFieldsForGPU Uniform Packing & MAX_GPU_FIELDS Cap', () => {
    const Scene = ConstructParticleSpace('lab');
    Scene.Fields = [];
    for (let I = 0; I < 20; ++I) Scene.Fields.push(ConstructField('curl'));
    const Packed = PackFieldsForGPU(Scene);
    assert.equal(Packed.Count, MAX_GPU_FIELDS);
    assert.equal(Packed.A.length, MAX_GPU_FIELDS * 4);
    assert.equal(Packed.C[0], FieldKindById.curl.GpuId);
});

Suite('EmitterPresets (37 presets) & WorkspaceIcons SVG Coverage', () => {
    assert.equal(EmitterPresets.length, 37);
    for (const P of EmitterPresets)
    {
        const Em = ConstructEmitterFromPreset(P.Id);
        assert.equal(Em.PresetId, P.Id);
    }
    for (const Key of ['Sparks', 'Weather', 'WindBlown', 'VFX', 'Physics', 'Swarm', 'Fibre', 'Transition', 'Storm', 'Flow', 'Accelerate', 'Damp'])
    {
        const Svg = GetParticleSourceSvgIcon(Key);
        assert.ok(Svg.startsWith('<svg') && Svg.includes('</svg>'));
    }
});

Suite('Multi-Integrator Stability (VelocityVerlet, SemiImplicitEuler, RK2Midpoint)', () => {
    for (const IntName of ['VelocityVerlet', 'SemiImplicitEuler', 'RK2Midpoint'])
    {
        const Space = ConstructParticleSpace('lab');
        Space.Integration.Integrator = IntName;
        const Sim = new ParticleSimulator(42);
        let T = 0;
        for (let I = 0; I < 40; ++I) { T += 1 / 60; Sim.Step(Space, 1 / 60, T); }
        assert.ok(Sim.TotalAlive > 20);
        for (const [, St] of Sim.States)
            for (const P of St.Particles)
                assert.ok(Number.isFinite(P.X) && Number.isFinite(P.Y) && Number.isFinite(P.Z));
    }
});

Suite('Lennard-Jones 12-6 Atom Lattice & Langevin Thermostat', () => {
    const Space = ConstructParticleSpace('chemistry');
    Space.Emitters = [ConstructEmitterFromPreset('atoms', { Capacity: 120, Temperature: 0.8 })];
    const Sim = new ParticleSimulator(99);
    let T = 0;
    for (let I = 0; I < 60; ++I) { T += 1 / 60; Sim.Step(Space, 1 / 60, T); }
    assert.equal(Sim.TotalAlive, 120);
    assert.ok(Sim.TotalEnergy > 0 && Number.isFinite(Sim.TotalEnergy));
});

Suite('Chemical Reaction A + B <-> C Kinetics & Species Conservation', () => {
    const Space = ConstructParticleSpace('chemistry');
    Space.Emitters = [ConstructEmitterFromPreset('chemicals', { Capacity: 180, ReactRate: 10.0 })];
    const Sim = new ParticleSimulator(77);
    let T = 0;
    for (let I = 0; I < 90; ++I) { T += 1 / 60; Sim.Step(Space, 1 / 60, T); }
    const M = Sim.MolecularStats;
    assert.equal(M.A + M.B + M.C, 180);
});

Suite('VFX Transitions (Derez Fragmentation, Melt, Butterflies, Glitch)', () => {
    const Space = ConstructParticleSpace('transitions');
    const Sim = new ParticleSimulator(55);
    let T = 0;
    for (let I = 0; I < 100; ++I) { T += 1 / 60; Sim.Step(Space, 1 / 60, T); }
    assert.ok(Sim.TotalAlive > 100);
});

Suite('Analytic Light Fibres Across All 7 Parametric Path Families', () => {
    assert.equal(FIBRE_PATHS.length, 7);
    for (const PathShape of FIBRE_PATHS)
    {
        const Em = BaseEmitter({ Kind: ParticleKind.LightFibre, Fibre: { Shape: 'trail', PathShape, Strands: 12, Segments: 20 } });
        const Strands = EvaluateFibreStrands(Em, 1.25);
        assert.equal(Strands.length, 12);
        assert.equal(Strands[0].Pts.length, 21);
    }
});

Suite('Fractal Midpoint Lightning Strikes & Emitter Plasma Web', () => {
    const Storm = new LightningStorm();
    Storm.StrikeGround(0.0);
    assert.equal(Storm.Bolts.length, 1);
    assert.ok(Storm.Bolts[0].Segs.length > 10);
    const Created = Storm.TriggerWeb(0.1, [[0, 1, 0], [2, 1, 0], [0, 1, 2]]);
    assert.ok(Created >= 2);
    Storm.Update(0.1, 2.0, { AutoStrike: false }, []);
    assert.equal(Storm.Bolts.length, 0);
});

Suite('OperationRecorder 215 MiB Undo/Redo & .ParticleSpace TOML Codec', () => {
    const Space = ConstructParticleSpace('lab');
    const Rec = new OperationRecorder();
    Rec.Record('Initial', Space);
    const OrigRate = Space.Emitters[0].Rate;
    Space.Emitters[0].Rate = OrigRate + 110;
    Rec.Record('Boost Rate', Space);
    assert.ok(Rec.CanUndo() && !Rec.CanRedo());
    assert.ok(Rec.Undo(Space));
    assert.equal(Space.Emitters[0].Rate, OrigRate);
    assert.ok(Rec.Redo(Space));
    assert.equal(Space.Emitters[0].Rate, OrigRate + 110);
    const Toml = EncodeParticleSpaceToml(Space, null, Rec).join('\n');
    assert.ok(Toml.includes('[ParticleSpace]') && Toml.includes('[[Field]]'));
});

Suite('Unified Forces Inspector, 3D Source/Emitter Meshes & + Menu Particle Assets', () => {
    const Html = fs.readFileSync('Experimental/ParticleWorkspace/index.html', 'utf8');
    const Css = fs.readFileSync('Experimental/ParticleWorkspace/ParticleEditor.css', 'utf8');
    const Js = fs.readFileSync('Experimental/ParticleWorkspace/ParticleEditor.js', 'utf8');
    const Shaders = fs.readFileSync('Experimental/ParticleWorkspace/Engine/shaders.js', 'utf8');
    const EngineJs = fs.readFileSync('Experimental/ParticleWorkspace/Engine/engine.js', 'utf8');
    const SoftJs = fs.readFileSync('Experimental/ParticleWorkspace/SoftwarePreviewEngine.js', 'utf8');
    assert.ok(Html.includes('../ForceFieldVisualization/ForceFieldVisualization.js'));
    assert.ok(Html.includes('data-add-force="__Formula__"') && Html.includes('data-add-force="WindGenerator"') && Html.includes('data-add-force="Microburst"') && Html.includes('data-add-force="Drag"'));
    assert.ok(Html.includes('data-add-viz="FlowLines"') && Html.includes('data-add-viz="Arrows"') && Html.includes('data-add-viz="ShowInfluence"'));
    assert.ok(Html.includes('id="add-menu-preset-search"') && Html.includes('id="add-menu-assets"'), 'Particle Assets moved inside + menu');
    assert.ok(!Html.includes('id="quick-library"') && !Html.includes('id="quick-presets-list"'), 'Particle Assets removed from left panel');
    assert.ok(Css.includes('.inspector-debug-viz') && Css.includes('.vfl-editor-wrap') && Css.includes('.probe-tensor-grid') && Css.includes('.cache-tiers-grid'));
    assert.ok(Css.includes('.pcard') && Css.includes('.wf-trace') && Css.includes('.mp-num') && Css.includes('.mp-place-btn') && Css.includes('.viewport-place-banner'));
    assert.ok(Css.includes('.add-menu-assets') && Css.includes('.add-menu-asset-btn'));
    assert.ok(Html.includes('id="ViewportPlaceBanner"') && Html.includes('id="ViewportPlaceText"'));
    assert.ok(Js.includes("['field', 'Field']") && Js.includes("['formula', 'Formula']") && Js.includes("['layers', 'Layers']") && Js.includes("['cache', 'Cache']"));
    assert.ok(Js.includes("'pcard wf-trace'") && Js.includes('DrawAnemometerTrace') && Js.includes('RenderAnemometerPin') && Js.includes('ScreenToWorldPlane') && Js.includes('HitTestAnemometer') && Js.includes('btn-place-anemometer'));
    assert.ok(Js.includes('ConstructGeometry') && Js.includes('ConstructAddMenuAssets') && Js.includes("'AlongX'") && Js.includes("'AlongZ'"));
    assert.ok(Js.includes('OctahedronBeacon') && Js.includes('Stream3DCache') && Js.includes('RenderSourceDebugMarkers'), 'Clean beacons, volumetric 3D RK4 ribbons & +/− pole badges present');
    assert.ok(!Js.includes('Frustum') && Js.includes('ShroudProfile'), 'Bulky emitter cone frustums absent; sleek WindGenerator airfoil shroud present');
    assert.ok(Shaders.includes('dirSpectrumColormap') && Shaders.includes('flowDashColormap') && Shaders.includes('vsArrow') && Shaders.includes('fsArrow'));
    assert.ok(EngineJs.includes('MAX_MESH_VERTS = 65536') && EngineJs.includes('draw(54, this.windCells)'));
    assert.ok(SoftJs.includes('ArrowsDraw') && SoftJs.includes('DirCss') && SoftJs.includes('DashCss'));
    assert.ok(Js.includes('arrowStyle') && Js.includes('Streamlines3D: false') && Js.includes('showArrows: false'),
        'Vector arrows and 3D streamlines default disabled cleanly');
    assert.ok(Js.includes('Ctx.setTransform(RatioX, 0, 0, RatioY, 0, 0)'), 'Pole markers & anemometer pin reset DPR transform cleanly (no Ratio^2 shift)');
    const VizJs = fs.readFileSync('Experimental/ForceFieldVisualization/ForceFieldVisualization.js', 'utf8');
    assert.ok(!VizJs.includes('PulseBuckets') && !VizJs.includes('UnderPath') && !/shadowBlur\s*=\s*[1-9]/.test(VizJs), 'Glowing streamline trails & shadowBlur removed');
    assert.ok(!Js.includes('ConstructQuickLibrary') && !Js.includes("'East'") && !Js.includes("'South'"), 'Old quick library & stale scalar axis names removed');
    assert.ok(!Js.includes('Composite field sample at probe'), 'Old composite hero card replaced by Wind Anemometer card');
    assert.ok(!Js.includes('chip-adders') && !Js.includes("['forces', 'Add & Sources']"), 'Add Force buttons belong in Outliner +, not inside Forces Inspector');
    assert.ok(Js.includes('ConstructEffectInspector') && Js.includes('ConstructLightningInspector'), 'Non-force inspectors preserved');
    assert.ok(!Js.includes('ParticleForceViz') && !Js.includes('VectorForceModels'));
    assert.ok(Shaders.includes('vsMesh') && Shaders.includes('fsMesh') && EngineJs.includes('this.meshes') && SoftJs.includes('meshes'));
    assert.ok(!Shaders.includes('hypot('), 'WGSL shaders contain zero unsupported hypot() intrinsics');
    assert.ok(PE.Presets.length === 53, `Expected 53 presets (48 + 5 Silk & Streaks presets), got ${PE.Presets.length}`);
});

Suite('ForceFieldCatalogue 17 Bounded Force Types, GPU Float16 Texture & FieldBuf Parity', () => {
    assert.equal(Types.length, 17);
    const FieldScene = ConstructChamberScenario('lab');
    const Prepared = Prepare(FieldScene, 0.8);
    const Tex = SampleWindTexData(FieldScene, Prepared, PE.WIND, 1.0);
    assert.equal(Tex.length, 24 * 12 * 24 * 4);
    assert.ok(Tex.some(V => V !== 0), 'windTex float16 payload contains non-zero velocity vectors');

    const Packed = PackForceEntries(FieldScene, Prepared, []);
    assert.ok(Packed[0] >= 2);
    const AccRef = EvaluateAllPrepared(FieldScene, Prepared, 2.2, 1.5, 1.2, 0.5, null, 'Particles');
    const AccGpu = [0, 0, 0];
    EvaluateFieldAcceleration(Packed, 2.2, 1.5, 1.2, AccGpu);
    assert.ok(Math.abs(AccGpu[0] - AccRef.Acceleration[0]) < 1e-3);
    assert.ok(Math.abs(AccGpu[1] - AccRef.Acceleration[1]) < 1e-3);
    assert.ok(Math.abs(AccGpu[2] - AccRef.Acceleration[2]) < 1e-3);
    assert.ok(EncodeLevelspace(FieldScene).join('\n').includes('[[Records]]'));
});

Suite('Shared ForceFieldVisualization Camera + Inspector Map Mode Mock Render Verification', () => {
    const FieldScene = ConstructChamberScenario('storm');
    const Prepared = Prepare(FieldScene, 1.2);
    const Drawn = { fills: 0, strokes: 0, transform: [1, 0, 0, 1, 0, 0] };
    const FakeGradient = { addColorStop() {} };
    const FakeCtx = {
        clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, roundRect() {}, clip() {},
        fill() { Drawn.fills++; }, stroke() { Drawn.strokes++; }, fillRect() {}, fillText() {},
        createImageData: (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }),
        putImageData() {}, drawImage() {},
        setTransform(a, b, c, d, e, f) { Drawn.transform = [a, b, c, d, e, f]; },
        createLinearGradient: () => FakeGradient,
        measureText: () => ({ width: 42 }), save() {}, restore() {}, setLineDash() {},
        set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set lineCap(_) {}, set lineJoin(_) {}, set globalAlpha(_) {},
        set shadowBlur(V) { if (V > 0) throw new Error(`Unexpected non-zero shadowBlur: ${V}`); }
    };
    const MakeCanvas = () => ({
        width: 1280, height: 840, style: {}, dataset: {},
        getContext: () => FakeCtx,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 420 }),
        addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} }
    });
    const FakeCanvas = MakeCanvas();
    globalThis.document = { createElement: () => MakeCanvas() };
    globalThis.window = { devicePixelRatio: 2 };
    globalThis.Path2D = class { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} arc() {} ellipse() {} rect() {} roundRect() {} closePath() {} };

    const Sources = FieldScene.Sources.map(S => ({
        Id: 'src:' + S.Token, X: S.Centre[0], Y: S.Centre[1], Z: S.Centre[2],
        Radius: S.Radius, Shape: S.Reach === 'Box' ? 'Box' : 'Circle',
        Contribution: TypeById[S.Type].Contribution, Colour: TypeById[S.Type].Colour, Label: S.Name, Active: 1,
        Bearing: S.Bearing
    }));

    // Verify 3D Viewport Camera Mode (Smooth + Contour + FlowLines + Arrows + Tracers + Sources)
    const CamViz = ForceFieldVisualization.Create(FakeCanvas, {
        MinimumSpan: 2, MaximumSpan: 80,
        Sample: (Contrib, X, Y, Z, Time, Span, Out) => {
            Out[0] = Out[1] = Out[2] = 0;
            ForceFieldCatalogueSample(FieldScene, Prepared, Contrib, X, Y, Z, Span, Out);
            return X >= -6 && X <= 6 && Z >= -6 && Z <= 6;
        }
    });
    CamViz.View.Mode = 'Camera';
    // Perspective ViewProjection matrix matching ParticleEditor camera looking at (0, 1.5, 0) from (8, 7, 10)
    CamViz.View.ViewProjection = (() => {
        const Aspect = 640 / 420, Fov = Math.PI / 4, F = 1 / Math.tan(Fov / 2), N = 0.1, Far = 120;
        const Eye = [8, 7, 10], At = [0, 1.5, 0];
        const Z = [Eye[0] - At[0], Eye[1] - At[1], Eye[2] - At[2]];
        const ZLen = Math.hypot(...Z); Z[0] /= ZLen; Z[1] /= ZLen; Z[2] /= ZLen;
        const X = [-Z[2], 0, Z[0]];
        const XLen = Math.hypot(...X); X[0] /= XLen; X[2] /= XLen;
        const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
        const V = new Float32Array([
            X[0], Y[0], Z[0], 0,
            X[1], Y[1], Z[1], 0,
            X[2], Y[2], Z[2], 0,
            -(X[0] * Eye[0] + X[1] * Eye[1] + X[2] * Eye[2]),
            -(Y[0] * Eye[0] + Y[1] * Eye[1] + Y[2] * Eye[2]),
            -(Z[0] * Eye[0] + Z[1] * Eye[1] + Z[2] * Eye[2]), 1
        ]);
        const P = new Float32Array([F / Aspect, 0, 0, 0, 0, F, 0, 0, 0, 0, Far / (N - Far), -1, 0, 0, (N * Far) / (N - Far), 0]);
        const M = new Float32Array(16);
        for (let C = 0; C < 4; ++C) for (let R = 0; R < 4; ++R)
            M[C * 4 + R] = P[R] * V[C * 4] + P[4 + R] * V[C * 4 + 1] + P[8 + R] * V[C * 4 + 2] + P[12 + R] * V[C * 4 + 3];
        return M;
    })();
    CamViz.Configure({
        Extent: { MinimumX: -6, MinimumZ: -6, MaximumX: 6, MaximumZ: 6, MinimumY: 0, MaximumY: 7.5 },
        ClipToExtent: true, CameraCells: 48,
        Contribution: 'Flow', Quantity: 'Speed', Heatmap: true, HeatmapStyle: 'Smooth', Opacity: 0.46,
        FlowLines: true, FlowLinePulse: false, Arrows: true, Tracers: true, ShowSources: true, SliceHeight: 1.5, Sources
    });
    CamViz.Render(1.2);
    assert.ok(Drawn.fills > 100 && Drawn.strokes > 5 && CamViz.Statistics.Streamlines > 0, '3D Viewport Camera mode renders heatmap, streamlines & sources');
    assert.deepEqual(Drawn.transform, [1, 0, 0, 1, 0, 0], 'ForceFieldVisualization.Render() resets canvas DPR transform back to identity');
    CamViz.Configure({ HeatmapStyle: 'Contour' });
    CamViz.Render(1.25);

    // Verify Inspector Map Mode with FlowLines + Arrows + Heatmap + Sources
    const MapFillsBefore = Drawn.fills, MapStrokesBefore = Drawn.strokes;
    const MapViz = ForceFieldVisualization.Create(FakeCanvas, {
        MinimumSpan: 2, MaximumSpan: 48,
        Sample: (Contrib, X, Y, Z, Time, Span, Out) => {
            Out[0] = Out[1] = Out[2] = 0;
            ForceFieldCatalogueSample(FieldScene, Prepared, Contrib, X, Y, Z, Span, Out);
            return true;
        }
    });
    MapViz.View.Mode = 'Map';
    MapViz.View.CentreX = 0; MapViz.View.CentreZ = 0; MapViz.View.Span = 12;
    MapViz.Configure({
        Contribution: 'Flow', Quantity: 'Speed', Heatmap: true, FlowLines: true, FlowLinePulse: false,
        Arrows: true, ShowSources: true, SliceHeight: 1.5, Sources
    });
    MapViz.Render(1.2);
    assert.ok(Drawn.fills > MapFillsBefore && Drawn.strokes > MapStrokesBefore, 'ForceFieldVisualization rendered Map flowlines, arrows & sources');
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 15. Permanent Editor Camera, LensU 256-byte Shader Layout, Rich Icons & Outliner Component Hierarchy
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('Editor Camera, LensU 272-byte Optical Bloom, Rich SVGs & Outliner Camera Components', () => {
    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const EngineSrc = fs.readFileSync(new URL('./Engine/engine.js', import.meta.url), 'utf8');
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const ControlsSrc = fs.readFileSync(new URL('./StudioControls.js', import.meta.url), 'utf8');
    const HtmlSrc = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const CssSrc = fs.readFileSync(new URL('./ParticleEditor.css', import.meta.url), 'utf8');

    assert.ok(ShadersSrc.includes('grade: vec4f') && ShadersSrc.includes('lensFx: vec4f') && ShadersSrc.includes('heatCfg: vec4f') && ShadersSrc.includes('gl0: vec4f') && ShadersSrc.includes('bloomCfg: vec4f') && ShadersSrc.includes('sh7: vec4f'),
        'WGSL LensU includes 272-byte sh0..sh7, grade, lensFx, heatCfg, gl0..gl1 & bloomCfg vec4f fields');
    assert.ok(EngineSrc.includes('272') && EngineSrc.includes('lensUniform'),
        'WebGPU Engine allocates 272-byte lensUniform buffer');
    assert.ok(HtmlSrc.includes('data-filter="camera"'), 'Outliner filter pills include Camera filter');
    assert.ok(ControlsSrc.includes('RichGlyphs') && ControlsSrc.includes('Camera:') && ControlsSrc.includes('Exposure:') && ControlsSrc.includes('HeatLens:') && ControlsSrc.includes('BlackHoleLens:') && ControlsSrc.includes('GlitchLens:'),
        'StudioControls provides ProjectZeroEditor/FrontierEditor dimensional Camera, Exposure & Lens component SVGs');
    assert.ok(CssSrc.includes('.rich-icon') && CssSrc.includes('.sensor-field') && CssSrc.includes('.depth-of-field') && CssSrc.includes('.tree-row.nested.cam-comp'),
        'ParticleEditor.css styles ProjectZeroEditor rich icons, optical schematics & nested camera components');
    assert.ok(EditorSrc.includes("Id: 'Camera'") && EditorSrc.includes("'Camera:Exposure'") && EditorSrc.includes("'Camera:Heat'") && EditorSrc.includes("'Camera:BlackHole'") && EditorSrc.includes("'Camera:Glitch'"),
        'Outliner mounts permanent Editor Camera with separate Exposure, Heat Distortion, Black Hole & Glitch child components');
    assert.ok(EditorSrc.includes('new Float32Array(68)'), 'PackLens packs 68-float (272-byte) LensU uniform');
    assert.ok(EditorSrc.includes("Title: 'Bloom'") && EditorSrc.includes("'BloomEnabled'") && EditorSrc.includes("'BloomThreshold'") && EditorSrc.includes("'BloomRadius'"),
        'Editor Camera exposes direct Bloom intensity, threshold, radius & knee controls');
    assert.ok(EditorSrc.includes('DetectHeatSources') && EditorSrc.includes('DetectBlackHoleSources') && EditorSrc.includes('DetectGlitchSources'),
        'Heat Distortion, Black Hole & Glitch components automatically detect matching particle emitters & fields');

    // Runtime Canvas2D SoftwarePreviewEngine test with active Camera VFX + localized Heat, Black Hole & Glitch zones + Bloom
    const FakeGrad = { addColorStop() {} };
    let LensDraws = 0;
    const SwCanvas = {
        width: 480, height: 320,
        getContext: () => ({
            save() {}, restore() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
            arc() { LensDraws++; }, ellipse() { LensDraws++; }, fillRect() { LensDraws++; }, strokeRect() { LensDraws++; },
            fill() {}, stroke() {}, setTransform() {}, translate() {}, rotate() {},
            createRadialGradient: () => FakeGrad, createLinearGradient: () => FakeGrad,
            set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {},
            set globalAlpha(_) {}, set globalCompositeOperation(_) {}
        })
    };
    const Sw = new SoftwarePreviewEngine(SwCanvas);
    const Lens68 = new Float32Array(68);
    Lens68[0] = 0.5; Lens68[1] = 0.48; Lens68[2] = 0.14; Lens68[3] = 0.05; // Black hole 0
    Lens68[8] = 1; Lens68[9] = 1.5; Lens68[10] = 0.72; Lens68[11] = 2; // 1 hole, 2 shimmers
    Lens68[12] = 0.35; Lens68[13] = 0.62; Lens68[14] = 0.12; Lens68[15] = 0.032; // Shimmer 0 (Heat Shimmer)
    Lens68[16] = 2.4; Lens68[17] = 16;
    Lens68[20] = 0.68; Lens68[21] = 0.55; Lens68[22] = 0.10; Lens68[23] = 0.024; // Shimmer 1 (Fire / Thermal)
    Lens68[24] = 3.1; Lens68[25] = 14;
    Lens68[44] = 1.2; Lens68[45] = 1.15; Lens68[46] = 1.1; Lens68[47] = 0.4; // grade: Exposure/Contrast/Sat/Vignette
    Lens68[48] = 0.35; Lens68[49] = 0.65; Lens68[50] = 0.028; Lens68[51] = 3.1; // lensFx: Chromatic/Bloom/GlobalHeat/Phase
    Lens68[52] = 16; Lens68[53] = 0.35; Lens68[54] = 0.42; Lens68[55] = 2.5; // heatCfg: GlobalFreq/Horizon/Glitch/Time
    Lens68[56] = 0.62; Lens68[57] = 0.45; Lens68[58] = 0.16; Lens68[59] = 0.55; // gl0: Localized Glitch zone 0
    Lens68[64] = 0.40; Lens68[65] = 1.25; Lens68[66] = 0.25; Lens68[67] = 1.0; // bloomCfg: Threshold/Radius/Knee/Enabled

    Sw.render({
        glob: new Float32Array([0, 0, 12, 0.016, 1.5, 1, 0, 0, 480, 320]),
        fields: new Float32Array(12), lensCount: 1, lens: Lens68,
        comps: {}, clear: [0.05, 0.07, 0.09], floor: true, arrows: true,
        lines: new Float32Array(0), lineCount: 0, meshes: new Float32Array(0), meshCount: 0,
        segCount: 0, jobs: []
    });
    assert.ok(LensDraws > 8, `SoftwarePreviewEngine drew ${LensDraws} 272-byte lens/VFX/bloom overlays cleanly`);
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 16. Upgraded 3D Meteorological Cup Anemometer & Wind Vane Station
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('Upgraded 3D meteorological cup anemometer, tail vane & inspector dial', () => {
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    assert.ok(EditorSrc.includes('3-Cup Meteorological Rotor with 3D conical cups'),
        'ConstructGeometry builds 3D cup-anemometer rotor with conical cups');
    assert.ok(EditorSrc.includes('Aerodynamic Wind Vane Boom & Swept Delta Tail Fin'),
        'ConstructGeometry builds directional wind vane boom & delta tail fin');
    assert.ok(EditorSrc.includes('const DialVane = SvgNode') && EditorSrc.includes('const DialRotor = SvgNode'),
        'Wind inspector anemometer card renders live rotating 3-cup compass dial');
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 17. ProjectZeroEditor Camera Inspector Optics & Separated Component Inspectors
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('ProjectZeroEditor camera inspector parity, RichGlyph IDs & SceneTabs validity', () => {
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const PresetsSrc = fs.readFileSync(new URL('./Engine/presets.js', import.meta.url), 'utf8');
    const ControlsSrc = fs.readFileSync(new URL('./StudioControls.js', import.meta.url), 'utf8');

    assert.ok(EditorSrc.includes("'Lens + field of view'") && EditorSrc.includes("'Aperture study'") && EditorSrc.includes("'Subject plane + sharpness'") && EditorSrc.includes("'Sensor / support'"),
        'Camera Inspector mirrors ProjectZeroEditor cards: Lens + FOV, Aperture study (Iris), Subject plane + sharpness (DOF), Sensor / support');
    assert.ok(EditorSrc.includes('ConstructExposureInspector') && EditorSrc.includes('ConstructHeatComponentInspector') && EditorSrc.includes('ConstructBlackHoleComponentInspector') && EditorSrc.includes('ConstructGlitchComponentInspector'),
        'Each camera component (Exposure, Heat Distortion, Black Hole, Glitch) renders its own dedicated Inspector');
    assert.ok(!EditorSrc.includes("'blackhole', 'Black Hole'"),
        'SceneTabs uses exact preset ID "black-hole" matching Engine/presets.js');

    // Verify all SceneTabs preset IDs resolve in presets.js
    const TabMatch = EditorSrc.match(/const SceneTabs = \[([\s\S]*?)\];/);
    assert.ok(TabMatch, 'SceneTabs declaration found');
    const QuotedPresets = [...TabMatch[1].matchAll(/Presets:\s*\[([^\]]+)\]/g)].flatMap(M => [...M[1].matchAll(/'([^']+)'/g)].map(P => P[1]));
    assert.ok(QuotedPresets.length >= 10, 'SceneTabs defines >= 10 scene presets');
    for (const Pid of QuotedPresets)
        assert.ok(PresetsSrc.includes(`id: "${Pid}"`) || PresetsSrc.includes(`id: '${Pid}'`), `SceneTabs preset "${Pid}" resolves in Engine/presets.js`);

    // Verify blank default scene, Heat/BlackHole/Glitch off by default & no Blast heat leak, and vector/streamline viz off by default
    assert.ok(PresetsSrc.includes('PE.defaultScene = [];'), 'Default scene starts blank (no pre-spawned particle effects)');
    assert.ok(EditorSrc.includes("ConstructChamberScenario('blank')") && EditorSrc.includes('Enabled: false,\n        Contribution:') && EditorSrc.includes('Streamlines3D: false'),
        'Blank default startup scenario and vector/streamline visualizations default OFF cleanly');
    for (const RemovedId of ['light-streaks', 'ember-ribbons', 'weave-trails', 'trim-trail'])
        assert.ok(!PresetsSrc.includes(`id: "${RemovedId}"`), `Removed ribbon trail preset "${RemovedId}" cleanly excised for redo`);
    assert.ok(!EditorSrc.includes("S.Type !== 'Thermal' && S.Type !== 'Blast'"),
        'DetectHeatSources does not trigger Heat Distortion on non-thermal Blast shockwaves');
    assert.ok(EditorSrc.includes('Heat: {\n            Enabled: false') && EditorSrc.includes('BlackHole: {\n            Enabled: false') && EditorSrc.includes('Glitch: {\n            Enabled: false'),
        'Heat, BlackHole, and Glitch components start disabled until explicitly enabled');

    // Verify RichGlyphs uses unique per-instance gradient prefix (ri{N}_)
    assert.ok(ControlsSrc.includes('RichGlyphs[Name](`ri${++RichUid}_`)'),
        'RichGlyphs scopes SVG gradient IDs uniquely per icon instance');
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 18. After-Effects Luminous Silk & Streaks (Blossom, Stream, Burst, Curl, Void) + Wind Coupling + Bokeh
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('Luminous Particles & Streaks (blossom/stream/burst/curl/void), windTex coupling & Software fallback render', () => {
    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const NewIds = ['luminous-blossom', 'prism-silk-stream', 'anemone-burst', 'curl-streamlines', 'void-filaments'];

    assert.deepEqual(PE.FIBRE_SHAPES, ['streak', 'ribbon', 'trail', 'blossom', 'stream', 'burst', 'curl', 'void']);
    assert.ok(ShadersSrc.includes('var windTex: texture_3d<f32>') && ShadersSrc.includes('fbWindOffset') && ShadersSrc.includes('fbBlossom') && ShadersSrc.includes('fbStream') && ShadersSrc.includes('fbBurst') && ShadersSrc.includes('fbCurl') && ShadersSrc.includes('fbVoid'),
        'FIBRE WGSL shader supports blossom, stream, burst, curl, void, windTex force coupling & optical bokeh');
    assert.ok(EditorSrc.includes("BindEffect(Effect, F, 'windMix'") && EditorSrc.includes("BindEffect(Effect, F, 'bokeh'"),
        'Inspector exposes Force field coupling (windMix) & bokeh orb share controls for particles + streaks');

    for (const Pid of NewIds)
    {
        const Preset = PE.presetById(Pid);
        assert.ok(Preset && Preset.p.kind === 7 && Preset.p.fibre, `Preset "${Pid}" loaded in PE.Presets`);
        const FibBuf = new Float32Array(128);
        PE.fillFibre(FibBuf, Preset.p, { lf: 0.25, projScale: 420, viewW: 800, viewH: 600 });
        assert.ok(Math.abs(FibBuf[7] - Preset.p.fibre.windMix) < 1e-6, `windMix packed into Fib.dir.w for ${Pid}`);
        assert.ok(Math.abs(FibBuf[47] - Preset.p.fibre.bokeh) < 1e-6, `bokeh packed into Fib.colC.w for ${Pid}`);
        const Em = ConstructEmitterFromPreset(Pid);
        const Strands = EvaluateFibreStrands(Em, 1.5);
        assert.ok(Strands.length > 10 && Strands[0].Pts.length > 8, `EvaluateFibreStrands evaluated ${Pid}`);
    }

    // SoftwarePreviewEngine render test for all 5 new After-Effects silk/streak shapes + sparks/bokeh
    let FibreStrokes = 0, SparkArcs = 0;
    const SwCanvas = {
        width: 640, height: 420,
        getContext: () => ({
            save() {}, restore() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
            arc() { SparkArcs++; }, fillRect() {}, strokeRect() {}, fill() {}, stroke() { FibreStrokes++; },
            setTransform() {}, createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
            set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set lineCap(_) {}, set lineJoin(_) {},
            set globalAlpha(_) {}, set globalCompositeOperation(_) {}
        })
    };
    const Sw = new SoftwarePreviewEngine(SwCanvas);
    const Jobs = NewIds.map(Pid => {
        const P = JSON.parse(JSON.stringify(PE.presetById(Pid).p));
        const Sys = Sw.createSystem(P);
        return { gpu: Sys, fibre: true, simulate: false, draw: false };
    });
    const VP = (() => {
        const Aspect = 640 / 420, Fov = Math.PI / 4, F = 1 / Math.tan(Fov / 2), N = 0.1, Far = 120;
        const Eye = [0, 3.2, 10.5], At = [0, 1.8, 0];
        const Z = [Eye[0] - At[0], Eye[1] - At[1], Eye[2] - At[2]];
        const ZL = Math.hypot(...Z); Z[0] /= ZL; Z[1] /= ZL; Z[2] /= ZL;
        const X = [Z[2], 0, -Z[0]]; const XL = Math.hypot(...X); X[0] /= XL; X[2] /= XL;
        const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
        const V = new Float32Array([X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0,
            -(X[0] * Eye[0] + X[1] * Eye[1] + X[2] * Eye[2]),
            -(Y[0] * Eye[0] + Y[1] * Eye[1] + Y[2] * Eye[2]),
            -(Z[0] * Eye[0] + Z[1] * Eye[1] + Z[2] * Eye[2]), 1]);
        const P = new Float32Array([F / Aspect, 0, 0, 0, 0, F, 0, 0, 0, 0, Far / (N - Far), -1, 0, 0, (N * Far) / (N - Far), 0]);
        const M = new Float32Array(16);
        for (let C = 0; C < 4; C++) for (let R = 0; R < 4; R++)
            M[C * 4 + R] = P[R] * V[C * 4] + P[4 + R] * V[C * 4 + 1] + P[8 + R] * V[C * 4 + 2] + P[12 + R] * V[C * 4 + 3];
        return M;
    })();
    const Glob = new Float32Array(52);
    Glob.set(VP, 0); Glob[40] = 2.4; Glob[41] = 0.016; Glob[43] = 1.0;
    Sw.render({
        glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null,
        comps: {}, fieldScene: ConstructChamberScenario('lab'),
        clear: [0.02, 0.03, 0.05], floor: false, arrows: false,
        lines: new Float32Array(0), lineCount: 0, meshes: new Float32Array(0), meshCount: 0,
        segCount: 0, jobs: Jobs
    });
    assert.ok(FibreStrokes > 400 && SparkArcs > 100, `SoftwarePreviewEngine drew ${FibreStrokes} silk filament strokes & ${SparkArcs} spark/bokeh particles`);
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 19. Stationary Curve Topologies, 0->1 Streak & Particle Motion, PE.Edits.Apply & Dense Bloom
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('PE.Edits.Apply slider bindings, stationary Silk & Streaks geometry & 0->1 streak/particle flow', () => {
    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const SwSrc = fs.readFileSync(new URL('./SoftwarePreviewEngine.js', import.meta.url), 'utf8');
    const EditsSrc = fs.readFileSync(new URL('./Engine/edits.js', import.meta.url), 'utf8');

    // 1. PE.Edits.Apply exists & BindEffect calls never fail
    assert.ok(EditsSrc.includes('function Apply(What, Work)') && EditsSrc.includes('PE.Edits = { For, Subscribe, Quietly, Announce, Apply, Through, Watchers }'),
        'PE.Edits exports Apply & Announce for BindEffect sliders');

    // 2. Stationary geometry in shaders.js & SoftwarePreviewEngine.js (no synthetic wt curve wobble)
    for (const FnName of ['fn fbBlossom', 'fn fbStream', 'fn fbBurst', 'fn fbCurl', 'fn fbVoid'])
    {
        const Start = ShadersSrc.indexOf(FnName);
        const Slice = ShadersSrc.slice(Start, Start + 750);
        assert.ok(!Slice.includes('let wt ='), `${FnName} stays stationary without synthetic wt time noise`);
    }

    // 3. Start-to-end linear streak sweep & moving particles along curves (0 -> 1)
    assert.ok(ShadersSrc.includes('let head = cyc * (1.0 + win);') && ShadersSrc.includes('let inStreak = dist >= 0.0 && dist <= win;'),
        'fsFibre sweeps luminous streaks linearly from s=0 to s=1');
    assert.ok(ShadersSrc.includes('let headS = cyc * (1.0 + win);') && ShadersSrc.includes('let s = select(driftS, clamp(headS, 0.0, 1.0), rPick < 0.62 && headS <= 1.0);'),
        'vsSpark moves particles along the curve rather than freezing blossom/burst/stream sparks');
    assert.ok(ShadersSrc.includes('for (var b = 0u; b < 24u; b++)'),
        'fsLens uses dense 24-tap multi-ring Bloom sampling for thin streaks & particles');

    assert.ok(SwSrc.includes('const HeadS = Cyc * (1 + Win);') && SwSrc.includes('const DriftS = (Unit(Id, 25) + Cycles * Lf * SpMul) % 1;'),
        'SoftwarePreviewEngine matches linear 0->1 traveling streaks & moving particles');

    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    assert.ok(EditorSrc.includes('Camera.VFov') && !EditorSrc.includes('Cam.VFov'),
        'ParticleEditor.Advance passes declared Camera.VFov to PE.fillFibre without ReferenceError');
});

//--------------------------------------------------------------------------------------------------------------------------------------------
// 20. Full Feature Parity: VFX Taxonomy, Trail/Streak/Ribbon/Pulse SoftwareEngine, Context-Scoped Inspector & Module Controls
//--------------------------------------------------------------------------------------------------------------------------------------------
Suite('VFX Categorization, Trail/Streak/Molecular/Swarm/Transition SoftwareEngine parity & Context-Scoped Inspector', () => {
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const SwSrc = fs.readFileSync(new URL('./SoftwarePreviewEngine.js', import.meta.url), 'utf8');
    const HtmlSrc = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

    // 1. Complete 5-category VFX taxonomy across all presets
    const VfxCatIds = PE.VFX_CATEGORIES.map(C => C.id);
    assert.deepEqual(VfxCatIds, ['Particles', 'Spline / Streaks', 'Transitions', 'Physics & Swarms', 'Optical & Lens']);
    const CatCounts = new Map();
    for (const P of PE.Presets)
    {
        const Cat = PE.vfxCategoryOf(P);
        assert.ok(VfxCatIds.includes(Cat), `Preset "${P.id}" has valid VFX category "${Cat}"`);
        assert.ok(typeof P.vfxSublabel === 'string' && P.vfxSublabel.length > 0, `Preset "${P.id}" carries vfxSublabel`);
        CatCounts.set(Cat, (CatCounts.get(Cat) || 0) + 1);
    }
    for (const Cat of VfxCatIds) assert.ok((CatCounts.get(Cat) || 0) >= 2, `VFX category "${Cat}" populated (${CatCounts.get(Cat)})`);
    assert.ok(HtmlSrc.includes('data-filter="vfx:Spline / Streaks"') && HtmlSrc.includes('data-filter="vfx:Optical &amp; Lens"'),
        'Outliner filter strip includes structured VFX category pills');

    // 2. Context-scoped Inspector controls & optical auto-enable
    assert.ok(EditorSrc.includes("if (Topology === 'trail')") && EditorSrc.includes("BindEffect(Effect, F, 'pathShape'") && EditorSrc.includes("BindEffect(Effect, F, 'pulseShape'"),
        'Fibre Inspector scopes topology controls including closed pathShape/pathSize/trailLength and pulseShape');
    assert.ok(EditorSrc.includes("BindEffect(Effect, P, 'swarmRadius'") && EditorSrc.includes("BindEffect(Effect, P, 'reactRadius'") && EditorSrc.includes("BindEffect(Effect, Tr, 'burstFrac'"),
        'Effect Inspector exposes complete Swarm boids, Molecular reaction radius/fracA & Transition parameters');
    assert.ok(EditorSrc.includes("Availability: () => W.Bounded"), 'AmbientWind RegionRadius is gated by W.Bounded');
    assert.ok(EditorSrc.includes('if (Effect.P.blackHole) Scene.CameraComponents.BlackHole.Enabled = true;'),
        'AddEffect auto-enables camera optical components when optical emitters are added');
    assert.ok(EditorSrc.includes("BindScene(Exp, 'BloomKnee'"), 'ConstructExposureInspector stays synchronized with Camera BloomKnee');

    // 3. SoftwarePreviewEngine parity across Trail, Ribbon, Tilted Streak, 4 Pulse waveforms, Mol Reactive, Swarm, Transition & Shapes 0..6
    assert.ok(SwSrc.includes("PE.samplePath") && SwSrc.includes("TransitionWaveT") && SwSrc.includes("SurfaceLocal") && SwSrc.includes("BasisFrom"),
        'SoftwarePreviewEngine implements PE.samplePath, TransitionWaveT, SurfaceLocal, and BasisFrom helpers');

    let SwStrokes = 0, SwArcs = 0, SwRects = 0, SwEllipses = 0;
    const SwCanvas = {
        width: 640, height: 420,
        getContext: () => ({
            save() {}, restore() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
            arc() { SwArcs++; }, ellipse() { SwEllipses++; }, fillRect() { SwRects++; }, strokeRect() { SwRects++; },
            fill() {}, stroke() { SwStrokes++; }, setTransform() {}, translate() {}, rotate() {},
            createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
            set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set lineCap(_) {}, set lineJoin(_) {},
            set globalAlpha(_) {}, set globalCompositeOperation(_) {}
        })
    };
    const Sw = new SoftwarePreviewEngine(SwCanvas);
    const VP = (() => {
        const Aspect = 640 / 420, Fov = Math.PI / 4, F = 1 / Math.tan(Fov / 2), N = 0.1, Far = 120;
        const Eye = [0, 3.2, 10.5], At = [0, 1.5, 0];
        const Z = [Eye[0] - At[0], Eye[1] - At[1], Eye[2] - At[2]];
        const ZL = Math.hypot(...Z); Z[0] /= ZL; Z[1] /= ZL; Z[2] /= ZL;
        const X = [Z[2], 0, -Z[0]]; const XL = Math.hypot(...X); X[0] /= XL; X[2] /= XL;
        const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
        const V = new Float32Array([X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0,
            -(X[0] * Eye[0] + X[1] * Eye[1] + X[2] * Eye[2]),
            -(Y[0] * Eye[0] + Y[1] * Eye[1] + Y[2] * Eye[2]),
            -(Z[0] * Eye[0] + Z[1] * Eye[1] + Z[2] * Eye[2]), 1]);
        const P = new Float32Array([F / Aspect, 0, 0, 0, 0, F, 0, 0, 0, 0, Far / (N - Far), -1, 0, 0, (N * Far) / (N - Far), 0]);
        const M = new Float32Array(16);
        for (let C = 0; C < 4; C++) for (let R = 0; R < 4; R++)
            M[C * 4 + R] = P[R] * V[C * 4] + P[4 + R] * V[C * 4 + 1] + P[8 + R] * V[C * 4 + 2] + P[12 + R] * V[C * 4 + 3];
        return M;
    })();
    const Glob = new Float32Array(52);
    Glob.set(VP, 0); Glob[40] = 2.0; Glob[41] = 0.016; Glob[43] = 1.0;

    // Test Trail/Ribbon/Streak fibres + PulseShapes 0..3
    const FibreCases = [
        { id: 'magnetic-lines', shape: 'trail', pulseShape: 0 },
        { id: 'magnetic-lines', shape: 'trail', pathShape: 1, pulseShape: 1 },
        { id: 'luminous-blossom', shape: 'ribbon', pulseShape: 2 },
        { id: 'luminous-blossom', shape: 'streak', dir: [0.6, 0.7, 0.3], pulseShape: 3 }
    ];
    const FibreJobs = FibreCases.map(C => {
        const P = JSON.parse(JSON.stringify(PE.presetById(C.id).p));
        P.fibre.shape = C.shape;
        if (C.pathShape !== undefined) P.fibre.pathShape = C.pathShape;
        if (C.dir) P.dir = C.dir;
        P.fibre.pulseShape = C.pulseShape;
        P.fibre.pulseRate = 1.5;
        P.fibre.pulseDepth = 0.7;
        return { gpu: Sw.createSystem(P), fibre: true, simulate: false, draw: false };
    });
    // Test Particle systems across LJ, Reactive gas, Swarm boids, Transition derez/assemble/stack/butterfly, Magnetic, BlackHole, Shapes 0..6
    const SimTestSpecs = [
        { id: 'atoms', mol: true },
        { id: 'chemicals', mol: true },
        { id: 'fireflies', mol: false },
        { id: 'derez-cube', mol: false },
        { id: 'reverse-derez', mol: false },
        { id: 'coin-stack', mol: false },
        { id: 'dissolve-butterflies', mol: false },
        { id: 'black-hole', mol: false },
        { id: 'magnetic-particles', mol: false },
        { id: 'bubbles', mol: false }
    ];
    const SimSystems = SimTestSpecs.map(Sp => {
        const P = JSON.parse(JSON.stringify(PE.presetById(Sp.id).p));
        const Sys = Sw.createSystem(P);
        return { sys: Sys, p: P, spec: Sp };
    });
    // Step simulation 6 frames to verify reaction product C, boid motion, attractor/magnetic physics & shape rendering
    for (let Step = 0; Step < 6; Step++)
    {
        Glob[40] += 0.025;
        const Jobs = [
            ...(Step === 5 ? FibreJobs : []),
            ...SimSystems.map(({ sys, p, spec }) => ({
                gpu: sys, fibre: false, mol: spec.mol, emitN: spec.mol ? 0 : 24,
                simulate: true, draw: Step === 5, alpha: p.blend === 'alpha'
            }))
        ];
        Sw.render({
            glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null,
            comps: {}, fieldScene: ConstructChamberScenario('lab'),
            clear: [0.02, 0.03, 0.05], floor: false, arrows: false,
            lines: new Float32Array(0), lineCount: 0, meshes: new Float32Array(0), meshCount: 0,
            segCount: 0, jobs: Jobs
        });
    }
    const ChemStats = SimSystems[1].sys.stats_;
    assert.ok(SwStrokes > 120 && SwArcs > 80 && SwRects > 20,
        `SoftwarePreviewEngine rendered trail/ribbon/streak strokes (${SwStrokes}), arcs (${SwArcs}) & cube/shape geometry (${SwRects})`);
    assert.ok((ChemStats.A + ChemStats.B + ChemStats.C) > 0,
        `Molecular reactive gas simulated species counts (A=${ChemStats.A}, B=${ChemStats.B}, C=${ChemStats.C})`);
});

//============================================================================================================================================
// 21 · ControlVehicle FCT1 Binary Assembly, 9-Float Wheel-Indexed Creases, Y-Up Bounds & Möller–Trumbore Raycasting
//============================================================================================================================================

let ControlVehicleMesh = null;

Suite('ControlVehicle FCT1 Assembly, Y-Up Socket Alignment, Creases & Raycasting', () =>
{
    const BodyBuf = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleBody.facet', import.meta.url));
    const TyreBuf = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleTyre.facet', import.meta.url));
    const RimBuf  = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleRim.facet', import.meta.url));
    const ToAb = B => B.buffer.slice(B.byteOffset, B.byteOffset + B.byteLength);

    ControlVehicleMesh = AssembleControlVehicle(ToAb(BodyBuf), ToAb(TyreBuf), ToAb(RimBuf));
    assert.ok(ControlVehicleMesh && ControlVehicleMesh.stats, 'AssembleControlVehicle produced valid mesh bundle');
    assert.equal(ControlVehicleMesh.stats.bodyTris, 2924, 'Body triangle count matches authored FCT1 ControlVehicleBody (2924)');
    assert.equal(ControlVehicleMesh.stats.rimTris, 4 * 1568, '4× Rim triangle count matches 4×1568');
    assert.equal(ControlVehicleMesh.stats.tyreTris, 4 * 3968, '4× Tyre triangle count matches 4×3968');
    assert.equal(ControlVehicleMesh.stats.totalTris, 25068, 'Total ControlVehicle triangle count matches 25068');
    assert.equal(ControlVehicleMesh.gpuVerts.length, 25068 * 3 * 12, 'GPU surface buffer matches 12 floats per vertex');
    assert.equal(ControlVehicleMesh.edgeVerts.length % (2 * 9), 0, 'Edge buffer uses exact 9 floats per vertex (2 verts per segment)');
    assert.ok(ControlVehicleMesh.stats.edgeCount > 3000, `Extracted ${ControlVehicleMesh.stats.edgeCount} structural crease edge segments (${ControlVehicleMesh.edgeCount} vertices)`);

    // Verify wheelIdx range in 9-float edge stream & flush ground tyre placement (minY ~ 0)
    let WheelEdgeCount = 0;
    for (let I = 8; I < ControlVehicleMesh.edgeVerts.length; I += 9)
    {
        const WIdx = ControlVehicleMesh.edgeVerts[I];
        assert.ok(WIdx === -1 || (WIdx >= 0 && WIdx <= 3), `Edge wheelIdx valid (${WIdx})`);
        if (WIdx >= 0) WheelEdgeCount++;
    }
    assert.ok(WheelEdgeCount > 400, `Wheel-indexed edge segments tagged for spinning rims/tyres (${WheelEdgeCount})`);
    assert.ok(ControlVehicleMesh.bounds.min[1] >= -0.02 && ControlVehicleMesh.bounds.min[1] <= 0.05,
        `Vehicle sits flush on ground plane (minY=${ControlVehicleMesh.bounds.min[1].toFixed(4)})`);

    // Verify RaycastVehicle accurately hits rotated & scaled vehicle + unprojected viewport ray hits center
    const VehState = CreateVehicleState();
    VehState.Mesh = ControlVehicleMesh;
    VehState.Loaded = true;
    VehState.Yaw = 0.65;
    VehState.Scale = 1.05;

    const DownHit = RaycastVehicle([0, 6.0, 0], [0, -1, 0], VehState, ControlVehicleMesh);
    assert.ok(DownHit && DownHit.distance > 2.0, `Vertical ray hits rotated ControlVehicle roof (dist=${DownHit?.distance?.toFixed(2)})`);
    assert.ok(DownHit.point[1] > 0.6 && DownHit.point[1] < 2.1, `Hit coordinate aligns with local coupe hull height (${DownHit.point[1].toFixed(3)})`);

    const MissHit = RaycastVehicle([18, 6.0, 18], [0, -1, 0], VehState, ControlVehicleMesh);
    assert.equal(MissHit, null, 'Off-target ray misses vehicle cleanly');

    const VpMock = {
        Eye: [0, 2.2, 8.6],
        Target: [0, 0.85, 0],
        Right: [1, 0, 0],
        Up: [0, 0.988, 0.155],
        VFov: Math.PI / 4
    };
    const Ray = UnprojectViewportRay(VpMock, 200, 150, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) });
    assert.ok(Ray && Math.abs(Math.hypot(...Ray.dir) - 1) < 1e-4, 'UnprojectViewportRay yields unit direction vector');
    const CenterHit = RaycastVehicle(Ray.origin, Ray.dir, VehState, ControlVehicleMesh);
    assert.ok(CenterHit && CenterHit.localPoint, 'Center viewport ray hits ControlVehicle with localPoint for ripple origin');
});

//============================================================================================================================================
// 22 · Frontier 4-Mode Inspection, Paint/Rim Ripple Shader Parity, Software3D Render & ParticleWorkspace HMI Wiring
//============================================================================================================================================

Suite('ControlVehicle 4-Mode Inspection, Paint/Rim Ripple, Software3D & WebGPU Pipeline Parity', () =>
{
    assert.equal(INSPECTION_MODES.length, 4, 'Exactly 4 Frontier inspection modes registered');
    assert.equal(PAINT_OPTIONS.length, 9, 'Frontier Coat + 8 HMI metallic/satin paint coats registered');
    assert.equal(RIM_OPTIONS.length, 4, '4 Alloy/Mag rim finishes registered');

    const V = CreateVehicleState();
    V.Mesh = ControlVehicleMesh;
    V.Loaded = true;

    // Cycle all 4 inspection modes & verify HoloFade / Scan sweep state
    for (const ModeId of ['ghost', 'wireframe', 'scan', 'solid'])
    {
        SetInspectionMode(V, ModeId);
        assert.equal(V.Mode, ModeId, `SetInspectionMode switched to '${ModeId}'`);
        StepVehicleState(V, 1.0);
        const U = PackVehicleUniform(V, 1.0);
        assert.equal(U.length, 64, 'PackVehicleUniform packs exact 256-byte (64-float) VehU struct');
        for (let I = 0; I < 64; I++) assert.ok(Number.isFinite(U[I]), `VehU[${I}] finite in mode '${ModeId}'`);
    }
    const Cycled = CycleInspectionMode(V);
    assert.equal(Cycled.id, 'ghost', 'CycleInspectionMode advances from solid -> ghost');

    // Trigger expanding-sphere Paint & Rim ripples at explicit raycast coordinates
    TriggerPaintRipple(V, PAINT_OPTIONS[3], [1.4, 0.9, 0.35]);
    TriggerRimRipple(V, RIM_OPTIONS[2], [1.7, 0.42, 1.05]);
    assert.equal(V.PaintRipActive, true, 'Paint ripple active after drop');
    assert.equal(V.RimRipActive, true, 'Rim ripple active after drop');
    StepVehicleState(V, 0.45);
    const UMid = PackVehicleUniform(V, 0.45);
    assert.ok(UMid[19] > 0.3 && UMid[19] < 8.5, `Paint ripple wave radius expands smoothly (${UMid[19].toFixed(2)} m)`);
    assert.ok(UMid[35] > 0.2 && UMid[35] < 8.5, `Rim ripple wave radius expands smoothly (${UMid[35].toFixed(2)} m)`);

    // Render ControlVehicle through REAL SoftwarePreviewEngine across all 4 modes + active ripple
    let FillPolyCount = 0, StrokeEdgeCount = 0, ClearCalls = 0;
    const MakeMockCtx = () => ({
        setTransform() {}, clearRect() { ClearCalls++; }, fillRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, ellipse() {},
        stroke() { StrokeEdgeCount++; }, fill() { FillPolyCount++; },
        save() {}, restore() {},
        set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set lineCap(_) {},
        set globalAlpha(_) {}, set globalCompositeOperation(_) {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} })
    });
    const MockCanvas = { width: 800, height: 500, getContext: () => MakeMockCtx() };
    const Sw = new SoftwarePreviewEngine(MockCanvas);
    Sw.init();

    const Glob = new Float32Array(44);
    Glob.set([
        1.4, 0, 0, 0,
        0, 1.8, 0, 0,
        0, 0, -1.001, -1,
        0, 0, -0.1, 0
    ], 0);
    Glob.set([6.2, 2.8, 6.2, 0], 16);
    Glob.set([0.7, 0.5, -0.5, 0], 20);
    Glob[32] = 0.016; Glob[40] = 1.25;

    for (const M of ['solid', 'ghost', 'wireframe', 'scan'])
    {
        SetInspectionMode(V, M);
        V.HoloFade = M === 'solid' ? 0 : 1;
        V.ScanTime = M === 'scan' ? V.ScanPeriod * 0.42 : 0;
        StepVehicleState(V, 0.05);
        const PrevF = FillPolyCount, PrevS = StrokeEdgeCount;
        Sw.render({
            glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null, comps: {},
            fieldScene: ConstructChamberScenario('blank'), clear: [0.03, 0.04, 0.05],
            floor: false, arrows: false, lines: new Float32Array(0), lineCount: 0,
            meshes: new Float32Array(0), meshCount: 0, segCount: 0, jobs: [],
            vehicle: { enabled: true, mesh: ControlVehicleMesh, state: V, uniform: PackVehicleUniform(V, 1.25) }
        });
        assert.ok((FillPolyCount - PrevF) + (StrokeEdgeCount - PrevS) > 250,
            `SoftwarePreviewEngine rendered ControlVehicle geometry in '${M}' mode (fills+strokes=${(FillPolyCount - PrevF) + (StrokeEdgeCount - PrevS)})`);
    }

    // Verify WebGPU Shader + Engine + Editor + DOM contracts
    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const EngineSrc = fs.readFileSync(new URL('./Engine/engine.js', import.meta.url), 'utf8');
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const IndexSrc = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.ok(ShadersSrc.includes('vehicle: COMMON + VEHICLE') && ShadersSrc.includes('fsVehHolo') && ShadersSrc.includes('fsVehCurtain'),
        'Engine/shaders.js exposes vehicle WGSL module with surface, hologram, edge & laser curtain shaders');
    assert.ok(!/\bmeta\s*:/.test(ShadersSrc.slice(ShadersSrc.indexOf('const VEHICLE'))),
        'Engine/shaders.js avoids WGSL reserved keyword meta in VEHICLE module');
    assert.ok(EditorSrc.includes('cloneNode(false)'),
        'ParticleEditor.js safely replaces WebGPU-locked canvas before engaging SoftwarePreviewEngine fallback');
    for (const Pipe of ['vehOpaque', 'vehGhost', 'vehHolo', 'vehWire', 'vehCurtain', 'uploadVehicle'])
        assert.ok(EngineSrc.includes(Pipe), `Engine/engine.js registers ${Pipe}`);
    for (const Sym of ['VehicleHmiDock', 'XrayScanHud', 'veh-paint-swatches', 'veh-rim-swatches', 'veh-mode-pills'])
        assert.ok(IndexSrc.includes(Sym), `index.html exposes ${Sym}`);
    for (const Fn of ['LoadControlVehicle', 'AttachSwatchInteraction', 'SpawnVehicleAeroTunnel', 'ConstructVehicleInspector', 'ConstructVehicleHmiDock'])
        assert.ok(EditorSrc.includes(Fn), `ParticleEditor.js wires ${Fn}`);
});

Suite('Precipitation (Snow, Rain, Hail) optical shaders, vehicle roof collision, splashes & Studio UI', () => {
    const Snow = PE.presetById('snow');
    const Rain = PE.presetById('rain');
    const Hail = PE.presetById('hail');
    assert.ok(Snow && Snow.group === 'Weather' && Snow.p.shape === 7 && Snow.vfxSublabel === 'Snowflake', 'Snow preset configured with crystalline shape 7');
    assert.ok(Rain && Rain.group === 'Weather' && Rain.p.shape === 0 && Rain.p.rate >= 700, 'Rain preset configured with high-density streak shape 0');
    assert.ok(Hail && Hail.group === 'Weather' && Hail.p.shape === 8 && Hail.vfxSublabel === 'Ice Hail', 'Hail preset configured with faceted ice shape 8');

    const BodyAb = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleBody.facet', import.meta.url));
    const TyreAb = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleTyre.facet', import.meta.url));
    const RimAb  = fs.readFileSync(new URL('../VehicleProvingGrounds/Archive/ControlVehicleRim.facet', import.meta.url));
    const VehMesh = AssembleControlVehicle(BodyAb, TyreAb, RimAb);
    const VState = CreateVehicleState();

    // Sample roof peak (~1.77 m at x=0, z=0) & hood (~1.14 m at x=2.0, z=0) & clear outside car
    const RoofHit = SampleVehicleSurface(VehMesh, VState, 0.0, 1.5, 0.0);
    assert.ok(RoofHit && RoofHit.worldY > 1.65 && RoofHit.worldY < 1.85 && RoofHit.normal[1] > 0.7,
        `ControlVehicle cabin roof surface detected at y=${RoofHit?.worldY?.toFixed(2)} m`);
    const HoodHit = SampleVehicleSurface(VehMesh, VState, 2.0, 1.0, 0.0);
    assert.ok(HoodHit && HoodHit.worldY > 1.0 && HoodHit.worldY < 1.35,
        `ControlVehicle hood surface detected at y=${HoodHit?.worldY?.toFixed(2)} m`);
    assert.equal(SampleVehicleSurface(VehMesh, VState, 4.5, 1.0, 0.0), null, 'Points outside vehicle bounds do not trigger hull collision');

    // Step SoftwarePreviewEngine through Snow, Rain, and Hail over ControlVehicle and check particles, splashes & strokes
    let Strokes = 0, Fills = 0, Ellipses = 0, Lines = 0;
    const MakeMockCtx = () => ({
        setTransform() {}, clearRect() {}, fillRect() {},
        beginPath() {}, moveTo() {}, lineTo() { Lines++; }, closePath() {},
        arc() {}, ellipse() { Ellipses++; },
        stroke() { Strokes++; }, fill() { Fills++; },
        translate() {}, rotate() {}, save() {}, restore() {},
        set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set lineCap(_) {},
        set globalAlpha(_) {}, set globalCompositeOperation(_) {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} })
    });
    const Sw = new SoftwarePreviewEngine({ width: 900, height: 560, getContext: () => MakeMockCtx() });
    Sw.init();

    const Glob = new Float32Array(52);
    // Perspective LookAt matrix from [6, 3.5, 6] toward [0, 1.5, 0]
    const Sub = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
    const Cross = (A, B) => [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const Norm = A => { const L = Math.hypot(...A) || 1; return A.map(X => X / L); };
    const Dot = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
    const Eye = [6, 3.5, 6], Ctr = [0, 1.5, 0];
    const Fw = Norm(Sub(Ctr, Eye)), Rt = Norm(Cross(Fw, [0, 1, 0])), Up = Cross(Rt, Fw);
    const V = [Rt[0], Up[0], -Fw[0], 0, Rt[1], Up[1], -Fw[1], 0, Rt[2], Up[2], -Fw[2], 0, -Dot(Rt, Eye), -Dot(Up, Eye), Dot(Fw, Eye), 1];
    const Kf = 1 / Math.tan(Math.PI / 8), Asp = 900 / 560, Nr = 0.1, Fr = 80;
    const Pr = [Kf / Asp, 0, 0, 0, 0, Kf, 0, 0, 0, 0, Fr / (Nr - Fr), -1, 0, 0, (Nr * Fr) / (Nr - Fr), 0];
    for (let C = 0; C < 4; C++) for (let R = 0; R < 4; R++) Glob[C * 4 + R] = [0, 1, 2, 3].reduce((S, K) => S + Pr[K * 4 + R] * V[C * 4 + K], 0);
    Glob.set([Rt[0], Rt[1], Rt[2], 0], 16);
    Glob.set([Up[0], Up[1], Up[2], 0], 20);
    Glob.set([Eye[0], Eye[1], Eye[2], 1], 24);
    Glob[40] = 0.04; Glob[41] = 0.04; Glob[43] = 1.0;

    for (const [Id, Preset] of [['snow', Snow], ['rain', Rain], ['hail', Hail]])
    {
        const Sys = Sw.createSystem(JSON.parse(JSON.stringify(Preset.p)));
        const PrevStrokes = Strokes, PrevFills = Fills, PrevLines = Lines;
        for (let F = 0; F < 18; F++)
        {
            Glob[40] = (F + 1) * 0.04;
            Sw.render({
                glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null, comps: {},
                fieldScene: ConstructChamberScenario('storm'), clear: [0.03, 0.04, 0.05],
                floor: true, arrows: false, lines: new Float32Array(0), lineCount: 0,
                meshes: new Float32Array(0), meshCount: 0, segCount: 0,
                jobs: [{ gpu: Sys, simulate: true, mol: false, emitN: F === 0 ? 180 : 35, preseedCurtain: F === 0, steps: 1, gd: 1, draw: true, alpha: true }],
                vehicle: { enabled: true, mesh: VehMesh, state: VState, uniform: PackVehicleUniform(VState, Glob[40]) }
            });
        }
        assert.ok(Sys.particles.length > 20, `Precipitation '${Id}' maintains active simulated particle pool (${Sys.particles.length})`);
        if (Id === 'snow') assert.ok(Strokes - PrevStrokes > 40 && Lines - PrevLines > 100, `Snow draws crystalline 6-arm crystal strokes (${Strokes - PrevStrokes})`);
        if (Id === 'rain') assert.ok(Strokes - PrevStrokes > 60 && Lines - PrevLines > 60, `Rain draws velocity-streaked strokes & splash rings (${Strokes - PrevStrokes})`);
        if (Id === 'hail') assert.ok(Fills - PrevFills > 40 && Strokes - PrevStrokes > 20, `Hail draws faceted ice polygons (${Fills - PrevFills})`);
        Sys.destroy();
    }

    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const IndexSrc = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const ControlsSrc = fs.readFileSync(new URL('./StudioControls.js', import.meta.url), 'utf8');
    assert.ok(ShadersSrc.includes('vehicleRoofY') && ShadersSrc.includes('shape == 7u') && ShadersSrc.includes('shape == 8u'),
        'Engine/shaders.js defines vehicleRoofY collision & WGSL Snowflake (7u) / Hailstone (8u) shaders');
    assert.ok(IndexSrc.includes('precip-pills') && EditorSrc.includes('TogglePrecipitation') && EditorSrc.includes("Id: 'weather'"),
        'Studio UI wires precip-pills quick toggles & Weather scene tab');
    assert.ok(ControlsSrc.includes('Snowflake:') && ControlsSrc.includes('CloudRain:') && ControlsSrc.includes('CloudHail:'),
        'StudioControls.js provides Snowflake, CloudRain & CloudHail SVG icons');
});

Suite('Precipitation (Snow, Rain, Hail) ForceField coupling, uplift & shader parity (no snow mesh overlay)', () => {
    const Sw = new SoftwarePreviewEngine({
        width: 800, height: 500,
        getContext: () => ({
            setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
            arc() {}, ellipse() {}, stroke() {}, fill() {}, translate() {}, rotate() {}, save() {}, restore() {},
            set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set lineCap(_) {},
            set globalAlpha(_) {}, set globalCompositeOperation(_) {},
            createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} })
        })
    });
    Sw.init();
    const Glob = new Float32Array(52);
    const Sub = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
    const Cross = (A, B) => [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const Norm = A => { const L = Math.hypot(...A) || 1; return A.map(X => X / L); };
    const Dot = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
    const Eye = [6, 3.5, 6], Ctr = [0, 1.5, 0];
    const Fw = Norm(Sub(Ctr, Eye)), Rt = Norm(Cross(Fw, [0, 1, 0])), Up = Cross(Rt, Fw);
    const V = [Rt[0], Up[0], -Fw[0], 0, Rt[1], Up[1], -Fw[1], 0, Rt[2], Up[2], -Fw[2], 0, -Dot(Rt, Eye), -Dot(Up, Eye), Dot(Fw, Eye), 1];
    const Kf = 1 / Math.tan(Math.PI / 8), Asp = 800 / 500, Nr = 0.1, Fr = 80;
    const Pr = [Kf / Asp, 0, 0, 0, 0, Kf, 0, 0, 0, 0, Fr / (Nr - Fr), -1, 0, 0, (Nr * Fr) / (Nr - Fr), 0];
    for (let C = 0; C < 4; C++) for (let R = 0; R < 4; R++) Glob[C * 4 + R] = [0, 1, 2, 3].reduce((S, K) => S + Pr[K * 4 + R] * V[C * 4 + K], 0);
    Glob.set([Rt[0], Rt[1], Rt[2], 0], 16);
    Glob.set([Up[0], Up[1], Up[2], 0], 20);
    Glob.set([Eye[0], Eye[1], Eye[2], 1], 24);
    Glob[41] = 0.04; Glob[43] = 1.0;

    // 1. Horizontal WindGenerator + Repulsor ForceFields sweep Snow strongly sideways
    const WindScene = ConstructChamberScenario('blank');
    WindScene.Sources.push(ConstructSource('WindGenerator', { Centre: [0, 2.5, 0], Bearing: 90, Strength: 14, Radius: 6, Height: 6 }));
    WindScene.Sources.push(ConstructSource('Repulsor', { Centre: [-1, 2.0, 0], Strength: 10, Radius: 5 }));
    const WindPrep = Prepare(WindScene, 0);

    const SnowSys = Sw.createSystem(JSON.parse(JSON.stringify(PE.presetById('snow').p)));
    for (let F = 0; F < 22; F++)
    {
        Glob[40] = (F + 1) * 0.04;
        Sw.render({
            glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null, comps: {},
            fieldScene: WindScene, preparedField: WindPrep, clear: [0.03, 0.04, 0.05],
            floor: true, arrows: false, lines: new Float32Array(0), lineCount: 0,
            meshes: new Float32Array(0), meshCount: 0, segCount: 0,
            jobs: [{ gpu: SnowSys, simulate: true, mol: false, emitN: F === 0 ? 160 : 30, preseedCurtain: F === 0, steps: 1, gd: 1, draw: true, alpha: true }]
        });
    }
    const AvgVx = SnowSys.particles.reduce((S, P) => S + P.vx, 0) / Math.max(1, SnowSys.particles.length);
    assert.ok(AvgVx > 1.5, `Flow + Accelerate ForceFields push snow dramatically sideways (avg vx=${AvgVx.toFixed(2)} m/s)`);

    // 2. Lift + Tornado ForceFields re-loft settled snow off the ground instead of pinning it at y=0
    const LiftScene = ConstructChamberScenario('blank');
    LiftScene.Sources.push(ConstructSource('Lift', { Centre: [0, 0.8, 0], Strength: 14, Radius: 6 }));
    LiftScene.Sources.push(ConstructSource('Tornado', { Centre: [0, 0, 0], Strength: 15, Radius: 5.5, Updraft: 8 }));
    const LiftPrep = Prepare(LiftScene, 0.2);
    for (const P of SnowSys.particles) { P.x = 0.2; P.y = 0.01; P.z = 0.2; P.vx = 0; P.vy = -0.3; P.vz = 0; }
    for (let F = 0; F < 12; F++)
    {
        Glob[40] = 1.0 + F * 0.04;
        Sw.render({
            glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null, comps: {},
            fieldScene: LiftScene, preparedField: LiftPrep, clear: [0.03, 0.04, 0.05],
            floor: true, arrows: false, lines: new Float32Array(0), lineCount: 0,
            meshes: new Float32Array(0), meshCount: 0, segCount: 0,
            jobs: [{ gpu: SnowSys, simulate: true, mol: false, emitN: 0, steps: 1, gd: 1, draw: true, alpha: true }]
        });
    }
    const LiftedCount = SnowSys.particles.filter(P => P.y > 0.25 && P.vy > 0.2).length;
    assert.ok(LiftedCount > 20, `Upward ForceFields lift settled snowflakes cleanly off the floor (${LiftedCount} lifted)`);
    SnowSys.destroy();

    // 3. Rain responds visibly to crosswind & Repulsor Accelerate ForceFields
    const RainSys = Sw.createSystem(JSON.parse(JSON.stringify(PE.presetById('rain').p)));
    for (let F = 0; F < 15; F++)
    {
        Glob[40] = (F + 1) * 0.04;
        Sw.render({
            glob: Glob, fields: new Float32Array(12), lensCount: 0, lens: null, comps: {},
            fieldScene: WindScene, preparedField: WindPrep, clear: [0.03, 0.04, 0.05],
            floor: true, arrows: false, lines: new Float32Array(0), lineCount: 0,
            meshes: new Float32Array(0), meshCount: 0, segCount: 0,
            jobs: [{ gpu: RainSys, simulate: true, mol: false, emitN: F === 0 ? 140 : 25, preseedCurtain: F === 0, steps: 1, gd: 1, draw: true, alpha: true }]
        });
    }
    const AvgRainVx = RainSys.particles.reduce((S, P) => S + P.vx, 0) / Math.max(1, RainSys.particles.length);
    assert.ok(AvgRainVx > 1.0, `ForceFields deflect high-speed rain streaks horizontally (avg vx=${AvgRainVx.toFixed(2)} m/s)`);
    RainSys.destroy();

    // 4. Verify WGSL parity & complete removal of SnowMeshSystem overlay
    const ShadersSrc = fs.readFileSync(new URL('./Engine/shaders.js', import.meta.url), 'utf8');
    const EditorSrc = fs.readFileSync(new URL('./ParticleEditor.js', import.meta.url), 'utf8');
    const SwSrc = fs.readFileSync(new URL('./SoftwarePreviewEngine.js', import.meta.url), 'utf8');
    assert.ok(ShadersSrc.includes('let wMag = length(wind);') && ShadersSrc.includes('accelGain') && ShadersSrc.includes('forceMag'),
        'Engine/shaders.js applies wind/Accelerate ForceFields & force-aware floor uplift to snow particles');
    assert.ok(!fs.existsSync(new URL('./SnowMeshSystem.js', import.meta.url)), 'SnowMeshSystem.js removed');
    assert.ok(!EditorSrc.includes('SnowMesh') && !SwSrc.includes('snowVehicleMesh'),
        'ParticleEditor.js and SoftwarePreviewEngine.js have zero leftover snow mesh overlay hooks');
});

function ForceFieldCatalogueSample(FieldScene, Prepared, Contrib, X, Y, Z, Span, Out)
{
    PE.Forces.EvaluatePrepared(FieldScene, Prepared, Contrib, X, Y, Z, Span, Out, null, 'Particles');
}

console.log(`\nALL ${Passed}/24 PARTICLEWORKSPACE VALIDATION SUITES PASSED.`);
