/*==========================================================================================================================================
                                                           PARTICLEEDITOR.JS
==========================================================================================================================================*/
// 🧩 Frontier · Particle & Force Studio:
//    eos WebGPU compute particles, light fibres, molecular physics & lightning seamlessly driven by the unified
//    17-type ForceFieldCatalogue & shared ForceFieldVisualization library (3D Camera overlay + Inspector Map debug canvas).

import { PE } from './Engine/pe.js';
import './Engine/fibres.js';
import './Engine/presets.js';
import './Engine/shaders.js';
import './Engine/engine.js';
import './Engine/lightning.js';
import './Engine/forcefields.js';
import './Engine/edits.js';
import './Engine/handoff.js';
import { ConstructLatticeReadback } from './ParticleFieldReadback.js';
import { SoftwarePreviewEngine, SoftwareLatticeReadback } from './SoftwarePreviewEngine.js';
import * as C from './StudioControls.js';
import {
    INSPECTION_MODES, PAINT_OPTIONS, RIM_OPTIONS,
    CreateVehicleState, TriggerPaintRipple, TriggerRimRipple,
    SetInspectionMode, CycleInspectionMode, RetriggerScanSweep,
    StepVehicleState, PackVehicleUniform, LoadControlVehicle,
    UnprojectViewportRay, RaycastVehicle
} from './VehicleStage.js';

const SampleCapacity = 40;
const FV = () => window.ForceFieldVisualization;
const FC = () => PE.Forces;

const Dot3 = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
const Subtract3 = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
const Cross3 = (A, B) => [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
const Normalize3 = A => { const L = Math.hypot(A[0], A[1], A[2]) || 1; return [A[0] / L, A[1] / L, A[2] / L]; };
const Clamp = (V, Lo, Hi) => Math.min(Hi, Math.max(Lo, V));
const FormatInteger = N => Math.round(N).toLocaleString('en-US');
const Wrap360 = D => ((D % 360) + 360) % 360;

function MultiplyProjection(A, B)
{
    const Out = new Float32Array(16);
    for (let CIdx = 0; CIdx < 4; CIdx++)
        for (let R = 0; R < 4; R++)
        {
            let Sum = 0;
            for (let I = 0; I < 4; I++) Sum += A[I * 4 + R] * B[CIdx * 4 + I];
            Out[CIdx * 4 + R] = Sum;
        }
    return Out;
}

function ConstructLookAt(Eye, Centre, Up)
{
    const F = Normalize3(Subtract3(Centre, Eye));
    const S = Normalize3(Cross3(F, Up));
    const U = Cross3(S, F);
    return Float32Array.of(S[0], U[0], -F[0], 0, S[1], U[1], -F[1], 0, S[2], U[2], -F[2], 0, -Dot3(S, Eye), -Dot3(U, Eye), Dot3(F, Eye), 1);
}

function ConstructPerspective(Fov, Aspect, Near, Far)
{
    const K = 1 / Math.tan(Fov / 2);
    return Float32Array.of(K / Aspect, 0, 0, 0, 0, K, 0, 0, 0, 0, Far / (Near - Far), -1, 0, 0, (Near * Far) / (Near - Far), 0);
}

const CategoryLabels = { 0: 'Streak', 1: 'Wind-driven', 3: 'Molecular · LJ', 4: 'Molecular · reactive', 5: 'VFX', 6: 'Swarm · flocking', 7: 'Light fibres' };
const GroupGlyphs = {
    Transitions: 'Boxes', VFX: 'Flame', 'Wind-blown': 'Leaf', 'Light fibres': 'Zap',
    'Silk & Streaks': 'Sparkles',
    Water: 'Drop', Ambient: 'Sparkles', Effects: 'Sparkles', Weather: 'CloudRain',
    Fields: 'Magnet', Ground: 'Layers', Physics: 'Atom', Storms: 'Tornado', Aircraft: 'Rays', Space: 'Planet'
};
const PRECIP_IDS = ['snow', 'rain', 'hail'];
const GlyphForPreset = Preset => Preset?.id === 'snow' ? 'Snowflake' : Preset?.id === 'rain' ? 'CloudRain' : Preset?.id === 'hail' ? 'CloudHail' : (GroupGlyphs[Preset?.group] || 'Sparkles');
const ContributionColours = { Flow: '#8fd3c4', Accelerate: '#e8c27a', Damp: '#b9a3e8' };
const ContributionUnits = { Flow: 'm/s', Accelerate: 'm/s²', Damp: '1/s' };
const StatusText = { Active: 'active', Waiting: 'waiting', Armed: 'armed', Spent: 'spent', Off: 'off' };
const ParameterBounds = (P, FieldScene) =>
{
    const IsChamber = (FieldScene?.Field?.Extent ?? 12) <= 40;
    return {
        Min: IsChamber && P.ChamberMin !== undefined ? P.ChamberMin : P.Min,
        Max: IsChamber && P.ChamberMax !== undefined ? P.ChamberMax : P.Max
    };
};

const DisplayColour = Linear =>
    '#' + [0, 1, 2].map(Ch => Math.round(Clamp(C.LinearToDisplay(Clamp(Linear[Ch], 0, 1)), 0, 1) * 255).toString(16).padStart(2, '0')).join('');

// Curated scene presets for the slanted Fluid document dock
const SceneTabs = [
    { Id: 'default', Name: 'Blank Scene', Presets: [], Scenario: 'blank' },
    { Id: 'vehicle', Name: 'Vehicle HMI', Presets: [], Scenario: 'lab', VehicleFocus: true },
    { Id: 'weather', Name: 'Weather · Snow / Rain / Hail', Presets: ['rain', 'snow', 'hail'], Scenario: 'storm' },
    { Id: 'silk', Name: 'Silk & Streaks', Presets: ['luminous-blossom', 'prism-silk-stream', 'anemone-burst', 'curl-streamlines', 'void-filaments'], Scenario: 'lab' },
    { Id: 'lab', Name: 'Studio Lab', Presets: ['sparks', 'leaves', 'atoms', 'chemicals'], Scenario: 'lab' },
    { Id: 'vfx', Name: 'Heat, Black Hole & Glitch', Presets: ['heat-shimmer', 'fire', 'black-hole', 'glitch-dissolve'], Scenario: 'corridor' },
    { Id: 'storm', Name: 'Storm & Lightning', Presets: ['strikeSparks', 'tornado', 'leaves', 'fireflies'], Scenario: 'storm' },
    { Id: 'molecular', Name: 'Molecular Lab', Presets: ['atoms', 'chemicals', 'magnetic-lines', 'magnetic-particles'], Scenario: 'lab' }
];

const Scene = {
    Engine: null,
    IsFallback: false,
    Lightning: null,
    Readback: null,
    Effects: [],
    Vehicle: CreateVehicleState(),
    FieldScene: FC().ConstructChamberScenario('blank'),
    get Forces() { return this.FieldScene.Sources; },
    Wind: Object.assign(PE.defaultWind(), { showArrows: false, arrowRef: 12, arrowStride: 2, arrowStyle: 0 }),
    Camera: {
        Yaw: 0.72, Pitch: 0.28, Distance: 8.8, Target: [0, 0.88, 0],
        Focal: 29, SensorWidth: 36, Aperture: 2.8, SubjectDistance: 8.8
    },
    CameraComponents: {
        Exposure: {
            Enabled: true,
            EV: 0.0,
            Saturation: 1.0,
            Contrast: 1.0,
            BloomEnabled: true,
            Bloom: 0.35,
            BloomThreshold: 0.42,
            BloomRadius: 1.15,
            BloomKnee: 0.25,
            Vignette: 0.0
        },
        Heat: {
            Enabled: false,
            IncludeFireParticles: true,
            IncludeThermalFields: true,
            HorizonMirage: false,
            StrengthScale: 1.0,
            FrequencyScale: 1.0,
            RateScale: 1.0,
            RadiusScale: 1.0,
            HorizonCutoff: 0.28
        },
        BlackHole: {
            Enabled: false,
            TrackParticleHoles: true,
            CameraSingularity: false,
            Centre: [0, 2.2, 0],
            HorizonScale: 1.0,
            EinsteinScale: 1.0,
            Glow: 0.35
        },
        Glitch: {
            Enabled: false,
            TrackGlitchParticles: true,
            FullFrame: false,
            Intensity: 0.65,
            Chromatic: 0.35,
            RadiusScale: 1.0
        }
    },
    Playing: true,
    TimeScale: 1,
    Time: 0,
    Step: 0,
    Rate: 0,
    CpuMilliseconds: 0,
    ProbeEnabled: false,
    Probe: [0, 1.5, 0],
    AnemometerPlacing: false,
    AnemometerDragging: false,
    AnemometerHover: false,
    LastCamera: null,
    Turntable: false,
    Web: { Enabled: false, Interval: 0.6, NextAt: 0, Links: 2 },
    Overlay: {
        Enabled: false,
        Contribution: 'Flow',
        Heatmap: false,
        HeatmapStyle: 'Smooth',
        Opacity: 0.30,
        Minimap: false,
        Bounds: false,
        Streamlines3D: false
    },
    PreparedField: null,
    PackedFields: null,
    AdapterName: '—',
    NextNumber: 1,
    Revisions: 0,
    ActiveTab: 'default'
};

const Domain = { Minimum: PE.WIND.min, Size: PE.WIND.size, Dimensions: PE.WIND.dim };
const ClearColour = [0.035, 0.037, 0.045];
const LiveRefreshers = [];
const PersistentRefreshers = [];
const ProbeSamples = [];
const AnemHistory = [];
const LogEntries = [];

let Selected = 'fx_1';
let InspectorTab = 'overview';
let OutlinerFilter = 'all';
let OutlinerQuery = '';
let AddMenuAssetQuery = '';
let ModalGroup = 'All';
let ModalQuery = '';
let LogChannel = 'All';
let LogOpen = false;
let Visualization = null;
let InspectorViz = null;
let InspectorDebugCanvas = null;
let PageScope = null;
let OutlinerScope = null;
let InspectorScroller = null;
let OutlinerScroller = null;
let LastTick = 0, LiveTimer = 0, CpuAccumulated = 0, CpuTicks = 0, Held = false, ReadbackTimer = 0;

//------------------------------------------------------------------------------------------------------------------------
//                                                 EFFECTS & FIELD HELPERS
//------------------------------------------------------------------------------------------------------------------------

const EffectByToken = Token => Scene.Effects.find(E => E.Token === Token) || null;
const SourceByToken = Token => Token && Token.startsWith('src:') ? Scene.FieldScene.Sources.find(S => S.Token === Token.slice(4)) || null : null;

function ApplyWindLink(Preset)
{
    const Link = Preset.windLink;
    if (!Link) return;
    const MapType = ['WindGenerator', 'GustFront', 'Tornado', 'Blast'];
    const Type = MapType[Link.type];
    if (!Type) return;
    const Ch = Link.set || {};
    if (Link.type === 0 && !Link.local)
    {
        Scene.FieldScene.Wind.Enabled = true;
        if (Ch.strength !== undefined) Scene.FieldScene.Wind.Speed = Math.max(0.5, Ch.strength);
        if (Ch.bearing !== undefined) Scene.FieldScene.Wind.Bearing = Wrap360(Ch.bearing);
        return;
    }
    let Source = Scene.FieldScene.Sources.find(S => S.Type === Type && S.Name === (Link.name || Type));
    if (!Source)
    {
        Source = FC().ConstructSource(Type, {
            Name: Link.name || FC().TypeById[Type].Name,
            Centre: Link.local ? [Preset.p.origin[0], Math.max(0.0, Preset.p.origin[1]), Preset.p.origin[2]] : [0, 0.4, 0],
            Radius: Ch.radius !== undefined ? Clamp(Ch.radius, 0.8, 6.0) : 3.2
        });
        Scene.FieldScene.Sources.push(Source);
    }
    if (Ch.radius !== undefined) Source.Radius = Clamp(Ch.radius, 0.8, 6.0);
    if (Ch.strength !== undefined) Source.Strength = Ch.strength * (Type === 'Tornado' ? 2.2 : 1.5);
    if (Ch.bearing !== undefined && 'Bearing' in Source) Source.Bearing = Wrap360(Ch.bearing);
    if (Link.local) { Source.Centre[0] = Preset.p.origin[0]; Source.Centre[2] = Preset.p.origin[2]; }
    Source.Enabled = true;
}

function ConstructEffect(PresetId, Name)
{
    const Preset = PE.presetById(PresetId);
    ApplyWindLink(Preset);
    const IsWeather = PRECIP_IDS.includes(PresetId);
    const Effect = {
        Token: 'fx_' + Scene.NextNumber,
        Number: Scene.NextNumber++,
        PresetId,
        Name: Name || Preset.name,
        P: JSON.parse(JSON.stringify(Preset.p)),
        Gpu: null,
        Accumulated: 0,
        PendingBurst: IsWeather ? Math.min(240, Math.round((Preset.p?.capacity || 1000) * 0.14)) : 0,
        PreseedCurtain: IsWeather,
        OverrideOrigin: null,
        NeedFill: true,
        Head: 0,
        BurstTimer: undefined,
        AliveSamples: []
    };
    Effect.Gpu = Scene.Engine.createSystem(Effect.P);
    return Effect;
}

function RebuildGpu(Effect)
{
    if (Effect.Gpu) Scene.Engine.destroySystem(Effect.Gpu);
    Effect.Gpu = Scene.Engine.createSystem(Effect.P);
    const IsWeather = PRECIP_IDS.includes(Effect.PresetId);
    Object.assign(Effect, {
        NeedFill: true,
        Head: 0,
        Accumulated: 0,
        PendingBurst: IsWeather ? Math.min(240, Math.round((Effect.P?.capacity || 1000) * 0.14)) : 0,
        PreseedCurtain: IsWeather
    });
}

function SyncPrecipitationPills()
{
    const Host = document.getElementById('precip-pills');
    if (!Host) return;
    for (const Btn of Host.querySelectorAll('button[data-precip]'))
    {
        const Id = Btn.dataset.precip;
        const Active = Scene.Effects.some(E => E.PresetId === Id && E.P.visible);
        Btn.classList.toggle('active', Active);
        Btn.setAttribute('aria-pressed', String(Active));
    }
}

function TogglePrecipitation(PresetId, Layer = false)
{
    const Matches = Scene.Effects.filter(E => E.PresetId === PresetId);
    const OtherPrecip = Scene.Effects.filter(E => PRECIP_IDS.includes(E.PresetId) && E.PresetId !== PresetId);
    const OnlyThisActive = Matches.length > 0 && Matches.every(E => E.P.visible) && OtherPrecip.length === 0;

    if (!Layer)
    {
        for (const E of OtherPrecip)
        {
            Scene.Engine.destroySystem(E.Gpu);
        }
        Scene.Effects = Scene.Effects.filter(E => !PRECIP_IDS.includes(E.PresetId) || E.PresetId === PresetId);
        if (OnlyThisActive)
        {
            for (const E of Matches) Scene.Engine.destroySystem(E.Gpu);
            Scene.Effects = Scene.Effects.filter(E => E.PresetId !== PresetId);
            SelectNode(Scene.Effects[0]?.Token || (Scene.Vehicle?.Enabled ? 'Vehicle' : 'Field'));
            AppendLog('WEATHER', `Cleared ${PresetId} precipitation`, null, 'warm');
        }
        else
        {
            if (Matches.length === 0) AddEffect(PresetId);
            else
            {
                for (const E of Matches)
                {
                    E.P.visible = true;
                    E.PreseedCurtain = true;
                    E.PendingBurst += Math.min(240, Math.round((E.P.capacity || 1000) * 0.14));
                }
                SelectNode(Matches[0].Token);
            }
            if (!Scene.Playing) TogglePlay();
            const Label = { snow: 'Snow (Crystalline)', rain: 'Rain (Streaks & Splashes)', hail: 'Hail (Ice Pellets)' }[PresetId] || PresetId;
            AppendLog('WEATHER', `Active precipitation -> ${Label}`, null, 'live');
            C.Toast(`Precipitation: ${Label}`);
        }
    }
    else
    {
        if (Matches.length > 0)
        {
            for (const E of Matches) Scene.Engine.destroySystem(E.Gpu);
            Scene.Effects = Scene.Effects.filter(E => E.PresetId !== PresetId);
            AppendLog('WEATHER', `Removed ${PresetId} layer`, null, 'warm');
        }
        else
        {
            AddEffect(PresetId);
            if (!Scene.Playing) TogglePlay();
            AppendLog('WEATHER', `Layered ${PresetId} precipitation`, null, 'live');
        }
    }
    ConstructOutliner();
    ConstructAddMenuAssets();
    SyncPrecipitationPills();
    C.Broadcast();
}

function AddEffect(PresetId)
{
    const Preset = PE.presetById(PresetId);
    if (!Preset) return null;
    const Same = Scene.Effects.filter(E => E.PresetId === PresetId).length;
    const Effect = ConstructEffect(PresetId, Same ? `${Preset.name} ${Same + 1}` : Preset.name);
    Scene.Effects.push(Effect);
    if (Effect.P.blackHole) Scene.CameraComponents.BlackHole.Enabled = true;
    if (Effect.P.heatShimmer) Scene.CameraComponents.Heat.Enabled = true;
    if (Effect.P.transition?.wave === 'glitch' || /glitch/i.test(Preset.id)) Scene.CameraComponents.Glitch.Enabled = true;
    SelectNode(Effect.Token);
    const VfxCat = PE.vfxCategoryOf ? PE.vfxCategoryOf(Preset) : Preset.group;
    AppendLog('PARTICLES', `Added ${Effect.Name}`, `${VfxCat} · ${PE.vfxSublabelOf ? PE.vfxSublabelOf(Preset) : (CategoryLabels[Effect.P.kind] || 'Particles')}`, 'live');
    ConstructAddMenuAssets();
    C.Broadcast();
    return Effect;
}

function RemoveEffect(Effect)
{
    Scene.Engine.destroySystem(Effect.Gpu);
    Scene.Effects = Scene.Effects.filter(E => E !== Effect);
    SelectNode(Scene.Effects[0]?.Token || 'Field');
    AppendLog('PARTICLES', `Removed ${Effect.Name}`, null, 'warm');
    ConstructAddMenuAssets();
    SyncPrecipitationPills();
    C.Broadcast();
}

function DuplicateEffect(Effect)
{
    const Copy = {
        Token: 'fx_' + Scene.NextNumber,
        Number: Scene.NextNumber++,
        PresetId: Effect.PresetId,
        Name: `${Effect.Name} copy`,
        P: JSON.parse(JSON.stringify(Effect.P)),
        Gpu: null,
        Accumulated: 0,
        PendingBurst: 0,
        OverrideOrigin: null,
        NeedFill: true,
        Head: 0,
        BurstTimer: undefined,
        AliveSamples: []
    };
    Copy.Gpu = Scene.Engine.createSystem(Copy.P);
    Scene.Effects.push(Copy);
    SelectNode(Copy.Token);
    AppendLog('PARTICLES', `Duplicated ${Effect.Name}`, null, 'live');
    C.Broadcast();
}

function AddForceSource(Type, CentreX = 0, CentreZ = 0)
{
    const IsFormula = Type === '__Formula__';
    const BaseType = IsFormula ? 'Attractor' : Type;
    const Meta = FC().TypeById[BaseType];
    if (!Meta) return null;
    const Same = Scene.FieldScene.Sources.filter(S => IsFormula ? S.UseFormula : (S.Type === BaseType && !S.UseFormula)).length;
    const Fresh = FC().ConstructSource(BaseType, {
        Name: IsFormula ? (Same ? `Custom Formula ${Same + 1}` : 'Custom Formula Field') : (Same ? `${Meta.Name} ${Same + 1}` : Meta.Name),
        Centre: [CentreX, Meta.ChamberDefaults?.CentreY ?? (Meta.Reach === 'Sphere' ? 1.6 : 0), CentreZ],
        Activation: BaseType === 'Blast' ? 'Trigger' : 'Always',
        TriggeredAt: BaseType === 'Blast' ? Scene.Time : null,
        Radius: IsFormula ? 3.4 : undefined,
        Strength: IsFormula ? 6.5 : undefined,
        Swirl: IsFormula ? 2.5 : undefined,
        UseFormula: IsFormula,
        FormulaCode: FC().DEFAULT_FORMULA_CODE
    });
    Scene.FieldScene.Sources.push(Fresh);
    AppendLog('FORCES', `Added ${Fresh.Name}`, IsFormula ? 'Symbolic fx(GPU/CPU)' : `${Meta.Contribution} · ${Fresh.Reach}`, 'live');
    InspectorTab = IsFormula ? 'formula' : 'field';
    SelectNode('src:' + Fresh.Token, false);
    C.Broadcast();
    return Fresh;
}

function DuplicateForceSource(Source)
{
    const Raw = JSON.parse(JSON.stringify(Source));
    delete Raw.Token;
    const Copy = FC().ConstructSource(Source.Type, {
        ...Raw,
        Name: `${Source.Name} copy`,
        Centre: [Source.Centre[0] + 1.2, Source.Centre[1], Source.Centre[2] + 0.8]
    });
    Scene.FieldScene.Sources.push(Copy);
    AppendLog('FORCES', `Duplicated ${Source.Name}`, null, 'live');
    SelectNode('src:' + Copy.Token);
    C.Broadcast();
}

function RemoveForceSource(Source)
{
    Scene.FieldScene.Sources = Scene.FieldScene.Sources.filter(S => S !== Source);
    if (Scene.FieldScene.Visualization.Solo === Source.Token) Scene.FieldScene.Visualization.Solo = null;
    AppendLog('FORCES', `Removed ${Source.Name}`, null, 'warm');
    SelectNode('Field');
    C.Broadcast();
}

function LoadSceneTab(TabDef)
{
    Scene.ActiveTab = TabDef.Id;
    for (const E of Scene.Effects) Scene.Engine.destroySystem(E.Gpu);
    Scene.Effects = [];
    Scene.FieldScene = FC().ConstructChamberScenario(TabDef.Scenario || 'lab');
    Scene.NextNumber = 1;
    const Query = new URLSearchParams(location.search).get('scene');
    const Ids = TabDef.Presets || (Query !== null && TabDef.Id === 'default'
        ? (Query === 'none' || Query === '' ? [] : Query.split(','))
        : PE.defaultScene);
    for (const Id of Ids) if (PE.presetById(Id)) Scene.Effects.push(ConstructEffect(Id));
    Scene.CameraComponents.BlackHole.Enabled = Scene.Effects.some(E => !!E.P.blackHole);
    Scene.CameraComponents.Heat.Enabled = Scene.Effects.some(E => !!E.P.heatShimmer);
    Scene.CameraComponents.Glitch.Enabled = Scene.Effects.some(E => E.P.transition?.wave === 'glitch' || /glitch/i.test(E.PresetId));

    if (TabDef.VehicleFocus && Scene.Vehicle)
    {
        Scene.Vehicle.Enabled = true;
        Object.assign(Scene.Camera, { Yaw: 0.72, Pitch: 0.28, Distance: 8.6, Target: [0, 0.88, 0] });
        Selected = 'Vehicle';
    }
    else
    {
        Selected = Scene.Effects[0]?.Token || (Scene.Vehicle?.Enabled ? 'Vehicle' : (Scene.FieldScene.Sources.length ? 'Field' : 'Camera'));
    }
    InspectorTab = IsVehicleNode(Selected) ? 'inspection' : (IsForceNode(Selected) ? 'field' : 'overview');
    ConstructSceneTabs();
    ConstructOutliner();
    ConstructAddMenuAssets();
    ConstructInspectorPage();
    SyncVehicleHmiDock();
    SyncPrecipitationPills();
    AppendLog('PARTICLES', `Loaded scene '${TabDef.Name}'`, `${Scene.Effects.length} effects · ${Scene.FieldScene.Sources.length} force sources`, 'live');
    C.Broadcast();
}

function ResetAll()
{
    for (const Effect of Scene.Effects) RebuildGpu(Effect);
    Scene.Lightning.bolts = [];
    Scene.Lightning.flash = 0;
    Scene.Time = 0;
    Scene.Step = 0;
    if (Scene.Vehicle) Scene.Vehicle.ScanTime = 0;
    for (const Src of Scene.FieldScene.Sources)
        if (Src.Activation === 'Trigger') Src.TriggeredAt = Src.Type === 'Blast' ? 0 : null;
    AppendLog('PARTICLES', 'Every effect & force timing reset', null, 'warm');
}

function ReceiveStrike(Point)
{
    for (const Effect of Scene.Effects)
        if (Effect.PresetId === 'strikeSparks') { Effect.PendingBurst += 160; Effect.OverrideOrigin = Point; }
}

function StrikeNow()
{
    const Hit = Scene.Lightning.strike(Scene.Time);
    ReceiveStrike(Hit);
    AppendLog('LIGHTNING', 'Lightning strike', `at (${Hit.map(P => P.toFixed(1)).join(', ')}) m`, 'warm');
}

function BurstAll()
{
    for (const Effect of Scene.Effects)
    {
        if (Effect.P.kind === 7) continue;
        Effect.PendingBurst += Effect.P.transition ? Effect.Gpu.cap : Math.max(80, Math.round(Effect.Gpu.cap * 0.45));
    }
    AppendLog('PARTICLES', 'Triggered burst on active effects', null, 'live');
}

const FORCE_TABS = new Set(['field', 'formula', 'layers', 'cache']);
const VEHICLE_TABS = new Set(['inspection', 'materials', 'stage', 'assets']);
const IsForceNode = Token => Token === 'Field' || Token === 'Wind' || String(Token || '').startsWith('src:');
const IsCameraNode = Token => Token === 'Camera' || String(Token || '').startsWith('Camera:');
const IsVehicleNode = Token => Token === 'Vehicle';

function SelectNode(Token, ResetTab = true)
{
    Selected = Token;
    if (IsCameraNode(Token))
    {
        InspectorTab = 'camera';
    }
    else if (IsVehicleNode(Token))
    {
        if (!VEHICLE_TABS.has(InspectorTab)) InspectorTab = 'inspection';
    }
    else if (IsForceNode(Token))
    {
        if (!FORCE_TABS.has(InspectorTab)) InspectorTab = 'field';
    }
    else if (ResetTab || FORCE_TABS.has(InspectorTab) || VEHICLE_TABS.has(InspectorTab) || InspectorTab === 'camera')
    {
        InspectorTab = 'overview';
    }
    ConstructOutliner();
    ConstructInspectorPage();
    SyncVehicleHmiDock();
    C.Broadcast();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   CAMERA & 3D LINES
//------------------------------------------------------------------------------------------------------------------------

function ResolveCamera(Aspect)
{
    const Cam = Scene.Camera;
    const Cos = Math.cos(Cam.Pitch), Sin = Math.sin(Cam.Pitch);
    const Eye = [
        Cam.Target[0] + Cam.Distance * Cos * Math.sin(Cam.Yaw),
        Cam.Target[1] + Cam.Distance * Sin,
        Cam.Target[2] + Cam.Distance * Cos * Math.cos(Cam.Yaw)
    ];
    const View = ConstructLookAt(Eye, Cam.Target, [0, 1, 0]);
    const SensorH = Math.max(8, (Cam.SensorWidth || 36) / 1.5);
    const VFov = 2 * Math.atan(SensorH / (2 * Math.max(8, Cam.Focal || 29)));
    const Proj = ConstructPerspective(VFov, Aspect, 0.05, 400);
    const Fwd = Normalize3(Subtract3(Cam.Target, Eye));
    const Right = Normalize3(Cross3(Fwd, [0, 1, 0]));
    return { ViewProjection: MultiplyProjection(Proj, View), Eye, Target: Cam.Target, Fwd, Right, Up: Cross3(Right, Fwd), VFov };
}

let Stream3DCache = { Key: '', Mesh: [] };

function ConstructGeometry()
{
    const Out = [];
    const Mesh = [];
    const Line = (A, B, Col) => Out.push(A[0], A[1], A[2], ...Col, B[0], B[1], B[2], ...Col);
    const Tri = (P0, P1, P2, N, Col) =>
    {
        Mesh.push(P0[0], P0[1], P0[2], N[0], N[1], N[2], ...Col);
        Mesh.push(P1[0], P1[1], P1[2], N[0], N[1], N[2], ...Col);
        Mesh.push(P2[0], P2[1], P2[2], N[0], N[1], N[2], ...Col);
    };
    const Face = (A, B, C, Col) =>
    {
        const N = Normalize3(Cross3(Subtract3(B, A), Subtract3(C, A)));
        Tri(A, B, C, N, Col);
    };
    const QuadMesh = (A, B, C, D, N, Col) =>
    {
        Tri(A, B, C, N, Col);
        Tri(A, C, D, N, Col);
    };
    const OctahedronBeacon = (C, R, Col) =>
    {
        const Top = [C[0], C[1] + R * 1.15, C[2]], Bot = [C[0], C[1] - R * 1.15, C[2]];
        const Px = [C[0] + R, C[1], C[2]], Nx = [C[0] - R, C[1], C[2]];
        const Pz = [C[0], C[1], C[2] + R], Nz = [C[0], C[1], C[2] - R];
        Face(Top, Px, Nz, Col); Face(Top, Nz, Nx, Col); Face(Top, Nx, Pz, Col); Face(Top, Pz, Px, Col);
        Face(Bot, Nz, Px, Col); Face(Bot, Nx, Nz, Col); Face(Bot, Pz, Nx, Col); Face(Bot, Px, Pz, Col);
    };
    const Orthonormal = Axis =>
    {
        const F = Normalize3(Axis);
        const UpRef = Math.abs(F[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
        const U = Normalize3(Cross3(UpRef, F));
        const V = Normalize3(Cross3(F, U));
        return [U, V, F];
    };
    const Cross = (C, S, Col) =>
    {
        Line([C[0] - S, C[1], C[2]], [C[0] + S, C[1], C[2]], Col);
        Line([C[0], C[1] - S, C[2]], [C[0], C[1] + S, C[2]], Col);
        Line([C[0], C[1], C[2] - S], [C[0], C[1], C[2] + S], Col);
    };
    const RingXZ = (Cx, Cy, Cz, R, Segs, Col) =>
    {
        for (let I = 0; I < Segs; I++)
        {
            const A0 = (I / Segs) * Math.PI * 2, A1 = ((I + 1) / Segs) * Math.PI * 2;
            Line([Cx + Math.cos(A0) * R, Cy, Cz + Math.sin(A0) * R], [Cx + Math.cos(A1) * R, Cy, Cz + Math.sin(A1) * R], Col);
        }
    };
    const Box = (Lo, Hi, Col) =>
    {
        const Pts = [
            [Lo[0], Lo[1], Lo[2]], [Hi[0], Lo[1], Lo[2]], [Hi[0], Lo[1], Hi[2]], [Lo[0], Lo[1], Hi[2]],
            [Lo[0], Hi[1], Lo[2]], [Hi[0], Hi[1], Lo[2]], [Hi[0], Hi[1], Hi[2]], [Lo[0], Hi[1], Hi[2]]
        ];
        for (const [A, B] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) Line(Pts[A], Pts[B], Col);
    };
    const HexToRgb01 = Hex =>
    {
        const Clean = (Hex || '#78d2c6').replace('#', '');
        const Num = parseInt(Clean.length === 6 ? Clean : '78d2c6', 16);
        return [((Num >> 16) & 255) / 255, ((Num >> 8) & 255) / 255, (Num & 255) / 255];
    };

    if (Scene.Wind.showDomain)
        Box(Domain.Minimum, [Domain.Minimum[0] + Domain.Size[0], Domain.Minimum[1] + Domain.Size[1], Domain.Minimum[2] + Domain.Size[2]], [0.68, 0.31, 0.19, 0.72]);

    // 1. Minimal Emitter Origin Markers (no bulky cone meshes)
    for (const E of Scene.Effects)
    {
        if (!E.P.visible) continue;
        const P = E.P, O = P.origin, Chosen = Selected === E.Token;
        Cross(O, Chosen ? 0.14 : 0.08, Chosen ? [0.95, 0.78, 0.35, 0.92] : [0.65, 0.70, 0.78, 0.45]);
        if (!Chosen) continue;
        if (P.kind === 3 || P.kind === 4)
        {
            const H = P.boxHalf[0];
            Box([O[0] - H, O[1] - H, O[2] - H], [O[0] + H, O[1] + H, O[2] + H], [0.95, 0.78, 0.35, 0.52]);
        }
        else if (P.kind !== 7)
        {
            RingXZ(O[0], O[1], O[2], 0.22, 24, [0.95, 0.78, 0.35, 0.75]);
            const RawDir = P.velDir || [0, 1, 0];
            const DirMag = Math.hypot(RawDir[0], RawDir[1], RawDir[2]);
            if (DirMag > 1e-4)
            {
                const Dir = [RawDir[0] / DirMag, RawDir[1] / DirMag, RawDir[2] / DirMag];
                Line(O, [O[0] + Dir[0] * 0.45, O[1] + Dir[1] * 0.45, O[2] + Dir[2] * 0.45], [0.95, 0.78, 0.35, 0.85]);
            }
        }
    }

    // 2. Clean Force Markers: Sleek Architectural Fan (WindGenerator), +/− Badges (Attractors/Repulsors), Compact Beacons
    const PoleTypes = new Set(['Attractor', 'Repulsor', 'Gravity', 'Blast', 'Magnetic']);
    for (const Src of Scene.FieldScene.Sources)
    {
        const Meta = FC().TypeById[Src.Type];
        if (!Meta || !Src.Enabled) continue;
        const SelectedSrc = Selected === ('src:' + Src.Token);
        const Rgb = Src.UseFormula ? [1.0, 0.71, 0.33] : HexToRgb01(Meta.Colour);
        const P = Src.Centre, R = Math.max(0.2, Src.Radius || 3);

        if (Src.Type === 'WindGenerator')
        {
            const Turn = ((Src.Bearing || 0) * Math.PI) / 180;
            const Fwd = [Math.sin(Turn), 0, -Math.cos(Turn)];
            const Right = [Math.cos(Turn), 0, Math.sin(Turn)];
            const Up = [0, 1, 0];
            const HubY = P[1] < 0.35 ? 1.02 : P[1];
            const Hub = [P[0], HubY, P[2]];
            const LocalPt = (Lx, Ly, Lz) => [
                Hub[0] + Right[0] * Lx + Up[0] * Ly + Fwd[0] * Lz,
                Hub[1] + Right[1] * Lx + Up[1] * Ly + Fwd[1] * Lz,
                Hub[2] + Right[2] * Lx + Up[2] * Ly + Fwd[2] * Lz
            ];

            // Sleek 32-segment chamfered airfoil shroud ring (no blocky cylinder or plume cone)
            const Segs = 32;
            const ShroudProfile = [
                [0.37, -0.09], [0.40, -0.05], [0.405, 0.04], [0.38, 0.11],
                [0.355, 0.11], [0.35, 0.0], [0.355, -0.09], [0.37, -0.09]
            ];
            const ShroudCol = SelectedSrc ? [0.30, 0.40, 0.48, 0.94] : [0.22, 0.27, 0.33, 0.92];
            const RimCol = SelectedSrc ? [0.96, 0.78, 0.36, 0.95] : [0.46, 0.80, 0.78, 0.88];
            for (let S = 0; S < Segs; S++)
            {
                const A0 = (S / Segs) * Math.PI * 2, A1 = ((S + 1) / Segs) * Math.PI * 2;
                const C0 = Math.cos(A0), S0 = Math.sin(A0), C1 = Math.cos(A1), S1 = Math.sin(A1);
                for (let K = 0; K < ShroudProfile.length - 1; K++)
                {
                    const [R0, Z0] = ShroudProfile[K], [R1, Z1] = ShroudProfile[K + 1];
                    const Q0 = LocalPt(C0 * R0, S0 * R0, Z0), Q1 = LocalPt(C1 * R0, S1 * R0, Z0);
                    const Q2 = LocalPt(C1 * R1, S1 * R1, Z1), Q3 = LocalPt(C0 * R1, S0 * R1, Z1);
                    const Col = (K === 2 || K === 3) ? RimCol : ShroudCol;
                    Face(Q0, Q1, Q2, Col); Face(Q0, Q2, Q3, Col);
                }
            }

            // Smooth parabolic nose spinner + 7 curved swept scimitar rotor blades
            const SpinSegs = 16;
            const SpinProf = [[0.088, -0.04], [0.082, 0.03], [0.052, 0.095], [0.008, 0.135]];
            const HubCol = [0.56, 0.62, 0.68, 0.96];
            for (let S = 0; S < SpinSegs; S++)
            {
                const A0 = (S / SpinSegs) * Math.PI * 2, A1 = ((S + 1) / SpinSegs) * Math.PI * 2;
                const C0 = Math.cos(A0), S0 = Math.sin(A0), C1 = Math.cos(A1), S1 = Math.sin(A1);
                for (let K = 0; K < SpinProf.length - 1; K++)
                {
                    const [R0, Z0] = SpinProf[K], [R1, Z1] = SpinProf[K + 1];
                    const Q0 = LocalPt(C0 * R0, S0 * R0, Z0), Q1 = LocalPt(C1 * R0, S1 * R0, Z0);
                    const Q2 = LocalPt(C1 * R1, S1 * R1, Z1), Q3 = LocalPt(C0 * R1, S0 * R1, Z1);
                    Face(Q0, Q1, Q2, HubCol); Face(Q0, Q2, Q3, HubCol);
                }
            }
            const BladeSpin = Scene.Time * (2.6 + Math.abs(Src.Strength || 6) * 0.72);
            const BladeCol = [0.76, 0.82, 0.86, 0.95];
            const Stations = [
                { r: 0.085, wLead: -0.022, wTrail: 0.028, zLead: 0.028, zTrail: -0.018, sweep: 0.0 },
                { r: 0.185, wLead: -0.036, wTrail: 0.042, zLead: 0.024, zTrail: -0.022, sweep: 0.14 },
                { r: 0.275, wLead: -0.030, wTrail: 0.034, zLead: 0.018, zTrail: -0.018, sweep: 0.28 },
                { r: 0.340, wLead: -0.014, wTrail: 0.016, zLead: 0.010, zTrail: -0.010, sweep: 0.38 }
            ];
            for (let B = 0; B < 7; B++)
            {
                const BaseAng = BladeSpin + (B * Math.PI * 2) / 7;
                const RingPts = Stations.map(St =>
                {
                    const A = BaseAng + St.sweep;
                    const Ca = Math.cos(A), Sa = Math.sin(A);
                    const Tx = -Sa, Ty = Ca;
                    const Cx = Ca * St.r, Cy = Sa * St.r;
                    return [
                        LocalPt(Cx + Tx * St.wLead, Cy + Ty * St.wLead, St.zLead),
                        LocalPt(Cx + Tx * St.wTrail, Cy + Ty * St.wTrail, St.zTrail)
                    ];
                });
                for (let K = 0; K < RingPts.length - 1; K++)
                {
                    const [L0, T0] = RingPts[K], [L1, T1] = RingPts[K + 1];
                    Face(L0, L1, T1, BladeCol); Face(L0, T1, T0, BladeCol);
                }
            }

            // Slim architectural hairline floor strut + base ring
            Line([P[0], 0.02, P[2]], [P[0], HubY - 0.38, P[2]], [0.46, 0.52, 0.60, SelectedSrc ? 0.85 : 0.45]);
            RingXZ(P[0], 0.03, P[2], 0.24, 24, SelectedSrc ? [0.96, 0.78, 0.36, 0.85] : [0.46, 0.52, 0.60, 0.38]);
        }
        else if (PoleTypes.has(Src.Type))
        {
            // Pole sources use crisp 2D circle-with-(+/−) badges rendered in RenderSourceDebugMarkers(); keep 3D clean
            if (SelectedSrc)
            {
                const Y0 = Math.max(0.04, P[1]);
                RingXZ(P[0], Y0, P[2], 0.32, 28, [1.0, 0.74, 0.32, 0.88]);
                if (P[1] > 0.2) Line([P[0], 0.03, P[2]], P, [...Rgb, 0.48]);
            }
        }
        else
        {
            const BeaconPos = [P[0], Math.max(0.18, P[1]), P[2]];
            OctahedronBeacon(BeaconPos, SelectedSrc ? 0.16 : 0.11, [...Rgb, 0.90]);
            if (SelectedSrc)
            {
                RingXZ(BeaconPos[0], Math.max(0.04, P[1]), BeaconPos[2], 0.30, 28, [1.0, 0.71, 0.33, 0.88]);
                if (Meta.Bearings?.length)
                {
                    const Key = Meta.Bearings[0][0];
                    const Rad = ((Src[Key] || 0) * Math.PI) / 180;
                    const Tip = [P[0] + Math.sin(Rad) * Math.min(R * 0.5, 1.4), BeaconPos[1], P[2] - Math.cos(Rad) * Math.min(R * 0.5, 1.4)];
                    Line(BeaconPos, Tip, [1.0, 0.71, 0.33, 0.85]);
                }
            }
        }

        if (Scene.Overlay.Bounds)
        {
            const BoundCol = [...Rgb, SelectedSrc ? 0.65 : 0.22];
            if (Src.Reach === 'Sphere' || Src.Reach === 'Column')
            {
                RingXZ(P[0], Math.max(0.04, P[1]), P[2], R, 40, BoundCol);
            }
            else
            {
                const Ext = FC().ResolveBoxExtents(Src);
                const Rad = ((Src.Bearing || 0) * Math.PI) / 180;
                const Rot = (Lx, Lz) => [P[0] + Lx * Math.cos(Rad) - (Lz - Ext.OffsetZ) * Math.sin(Rad), P[2] + Lx * Math.sin(Rad) + (Lz - Ext.OffsetZ) * Math.cos(Rad)];
                const C0 = Rot(-Ext.HalfX, -Ext.HalfZ), C1 = Rot(Ext.HalfX, -Ext.HalfZ), C2 = Rot(Ext.HalfX, Ext.HalfZ), C3 = Rot(-Ext.HalfX, Ext.HalfZ);
                const Y0 = Math.max(0.04, P[1]);
                for (const [A, B] of [[C0, C1], [C1, C2], [C2, C3], [C3, C0]]) Line([A[0], Y0, A[1]], [B[0], Y0, B[1]], BoundCol);
            }
        }
    }

    // 3. Volumetric 3D Bidirectional RK4 Streamlines (VectorFieldVisualizer Dual-Crossed 3D Ribbons + Arrowheads, Engineering palette, zero glow)
    if (Scene.Overlay.Enabled && Scene.Overlay.Streamlines3D && Scene.PreparedField)
    {
        const Chan = Scene.Overlay.Contribution === 'Damp' ? 'Flow' : Scene.Overlay.Contribution;
        const SliceY = Scene.FieldScene.Visualization.SliceHeight ?? 1.5;
        const Solo = Scene.FieldScene.Visualization.Solo || '';
        const HasDynamic = Scene.FieldScene.Sources.some(S => S.Enabled && S.Activation !== 'Always');
        const TimeBucket = HasDynamic ? Math.round(Scene.Time * 6) : 0;
        const SrcSig = Scene.FieldScene.Sources.map(S => `${S.Token}:${S.Enabled}:${S.Type}:${S.Strength}:${S.Swirl}:${S.Bearing}:${S.Centre.join(',')}:${S.Radius}:${S.UseFormula}:${S.FormulaCode}`).join('|');
        const StreamKey = `${Chan}:${SliceY.toFixed(2)}:${Solo}:${Scene.Wind.windScale.toFixed(2)}:${TimeBucket}:${SrcSig}`;

        if (Stream3DCache.Key !== StreamKey)
        {
            const VBuf = [0, 0, 0];
            const StepSize = 0.24, HalfSteps = 13;
            const EngStops = [[15, 28, 38], [46, 110, 125], [89, 166, 110], [212, 181, 102], [232, 107, 79]];
            const EngRgb = Mag =>
            {
                const T = Math.max(0.22, Clamp(Mag / 14, 0, 1)) * (EngStops.length - 1);
                const I = Math.min(EngStops.length - 2, Math.floor(T)), F = T - I;
                const A = EngStops[I], B = EngStops[I + 1];
                return [(A[0] + (B[0] - A[0]) * F) / 255, (A[1] + (B[1] - A[1]) * F) / 255, (A[2] + (B[2] - A[2]) * F) / 255];
            };
            const SampleUnit = (Px, Py, Pz) =>
            {
                VBuf[0] = VBuf[1] = VBuf[2] = 0;
                FC().EvaluatePrepared(Scene.FieldScene, Scene.PreparedField, Chan, Px, Py, Pz, 0.5, VBuf, Scene.FieldScene.Visualization.Solo, 'Particles');
                const Gain = Chan === 'Flow' ? (Scene.Wind?.windScale ?? 1) : 1;
                VBuf[0] *= Gain; VBuf[1] *= Gain; VBuf[2] *= Gain;
                const M = Math.hypot(VBuf[0], VBuf[1], VBuf[2]);
                return M >= 0.12 ? [VBuf[0] / M, VBuf[1] / M, VBuf[2] / M, M] : null;
            };
            const TraceDir = (Sx, Sy, Sz, Sign) =>
            {
                const Pts = [];
                let X = Sx, Y = Sy, Z = Sz, PrevDx = 0, PrevDy = 0, PrevDz = 0;
                for (let S = 0; S < HalfSteps; S++)
                {
                    const K1 = SampleUnit(X, Y, Z); if (!K1) break;
                    const Ds = Sign * StepSize, Half = Ds * 0.5;
                    const K2 = SampleUnit(X + K1[0] * Half, Y + K1[1] * Half, Z + K1[2] * Half); if (!K2) break;
                    const K3 = SampleUnit(X + K2[0] * Half, Y + K2[1] * Half, Z + K2[2] * Half); if (!K3) break;
                    const K4 = SampleUnit(X + K3[0] * Ds, Y + K3[1] * Ds, Z + K3[2] * Ds); if (!K4) break;
                    const Dx = (K1[0] + 2 * K2[0] + 2 * K3[0] + K4[0]) / 6;
                    const Dy = (K1[1] + 2 * K2[1] + 2 * K3[1] + K4[1]) / 6;
                    const Dz = (K1[2] + 2 * K2[2] + 2 * K3[2] + K4[2]) / 6;
                    if (Math.hypot(Dx, Dy, Dz) < 0.25) break;
                    if (S > 2 && (Dx * PrevDx + Dy * PrevDy + Dz * PrevDz) < -0.35) break;
                    PrevDx = Dx; PrevDy = Dy; PrevDz = Dz;
                    const Nx = X + Dx * Ds, Ny = Clamp(Y + Dy * Ds, 0.08, 7.6), Nz = Z + Dz * Ds;
                    if (Math.abs(Nx) > 5.8 || Math.abs(Nz) > 5.8) break;
                    X = Nx; Y = Ny; Z = Nz;
                    Pts.push([X, Y, Z, K2[3]]);
                }
                return Pts;
            };

            const Seeds = [];
            const Seen = new Set();
            const PushSeed = (X, Y, Z, Force = false) =>
            {
                if (Math.abs(X) > 5.6 || Math.abs(Z) > 5.6 || Y < 0.25 || Y > 7.4) return;
                const Key = `${Math.round(X / 1.15)},${Math.round(Y / 1.15)},${Math.round(Z / 1.15)}`;
                if (!Force && Seen.has(Key)) return;
                Seen.add(Key);
                Seeds.push([X, Y, Z]);
            };

            for (const Src of Scene.FieldScene.Sources)
            {
                if (!Src.Enabled || (Solo && Src.Token !== Solo)) continue;
                const RingR = Clamp((Src.Radius || 2.5) * 0.44, 0.55, 2.2);
                const Cy = Clamp(Src.Centre[1] < 0.35 ? SliceY : Src.Centre[1], 0.45, 5.8);
                for (let K = 0; K < 6; K++)
                {
                    const A = (K / 6) * Math.PI * 2 + 0.2;
                    PushSeed(Src.Centre[0] + Math.cos(A) * RingR, Cy, Src.Centre[2] + Math.sin(A) * RingR, true);
                }
                const UpY = Clamp(Cy + RingR * Math.sin(0.68), 0.6, 6.8), UpR = RingR * Math.cos(0.68);
                for (let K = 0; K < 4; K++)
                {
                    const A = (K / 4) * Math.PI * 2 + 0.5;
                    PushSeed(Src.Centre[0] + Math.cos(A) * UpR, UpY, Src.Centre[2] + Math.sin(A) * UpR, true);
                }
            }
            const StrataY = [SliceY, Clamp(SliceY + 1.6, 0.5, 5.8), Clamp(SliceY + 3.2, 0.8, 6.8)];
            const GridCoords = [-4.4, -2.2, 0.0, 2.2, 4.4];
            for (let Li = 0; Li < StrataY.length && Seeds.length < 76; Li++)
            {
                const Sy = StrataY[Li];
                for (let RIdx = 0; RIdx < GridCoords.length && Seeds.length < 76; RIdx++)
                {
                    const Stag = (RIdx % 2) * 0.9 + Li * 0.45;
                    for (const Sx of GridCoords)
                    {
                        if (Seeds.length >= 76) break;
                        PushSeed(Sx + (Stag - 0.9) * 0.45, Sy, GridCoords[RIdx]);
                    }
                }
            }

            const Built = [];
            const PushTri = (P0, P1, P2, N, Col) =>
            {
                Built.push(P0[0], P0[1], P0[2], N[0], N[1], N[2], ...Col);
                Built.push(P1[0], P1[1], P1[2], N[0], N[1], N[2], ...Col);
                Built.push(P2[0], P2[1], P2[2], N[0], N[1], N[2], ...Col);
            };
            const PushQuad = (A0, B0, A1, B1, N, Col) =>
            {
                PushTri(A0, B0, A1, N, Col);
                PushTri(B0, B1, A1, N, Col);
            };

            const HalfWidth = 0.015;
            for (const [Sx, Sy, Sz] of Seeds)
            {
                const Seed = SampleUnit(Sx, Sy, Sz);
                if (!Seed) continue;
                const Back = TraceDir(Sx, Sy, Sz, -1).reverse();
                const Fwd = TraceDir(Sx, Sy, Sz, 1);
                const Curve = [...Back, [Sx, Sy, Sz, Seed[3]], ...Fwd];
                if (Curve.length < 4) continue;

                const L1 = [], R1 = [], L2 = [], R2 = [], Cols = [], Frames = [];
                for (let I = 0; I < Curve.length; I++)
                {
                    const P = Curve[I];
                    const Prev = Curve[Math.max(0, I - 1)];
                    const Next = Curve[Math.min(Curve.length - 1, I + 1)];
                    const Tan = Normalize3([Next[0] - Prev[0], Next[1] - Prev[1], Next[2] - Prev[2]]);
                    const [Side, Norm] = Orthonormal(Tan);
                    const Pr = I / (Curve.length - 1);
                    const W = HalfWidth * (0.58 + 0.42 * Math.sin(Pr * Math.PI));
                    L1.push([P[0] - Side[0] * W, P[1] - Side[1] * W, P[2] - Side[2] * W]);
                    R1.push([P[0] + Side[0] * W, P[1] + Side[1] * W, P[2] + Side[2] * W]);
                    L2.push([P[0] - Norm[0] * W, P[1] - Norm[1] * W, P[2] - Norm[2] * W]);
                    R2.push([P[0] + Norm[0] * W, P[1] + Norm[1] * W, P[2] + Norm[2] * W]);
                    Cols.push([...EngRgb(P[3]), 0.86]);
                    Frames.push([Tan, Side, Norm]);
                }

                for (let I = 0; I < Curve.length - 1; I++)
                {
                    const [Tan, Side, Norm] = Frames[I];
                    const Col = Cols[I];
                    PushQuad(L1[I], R1[I], L1[I + 1], R1[I + 1], Norm, Col);
                    PushQuad(L2[I], R2[I], L2[I + 1], R2[I + 1], Side, Col);

                    if (I > 2 && I < Curve.length - 3 && I % 9 === 4)
                    {
                        const P = Curve[I];
                        const TipW = HalfWidth * 3.1, TipL = HalfWidth * 5.6;
                        const Tip = [P[0] + Tan[0] * TipL * 0.78, P[1] + Tan[1] * TipL * 0.78, P[2] + Tan[2] * TipL * 0.78];
                        const Bx = P[0] - Tan[0] * TipL * 0.35, By = P[1] - Tan[1] * TipL * 0.35, Bz = P[2] - Tan[2] * TipL * 0.35;
                        const ACol = [Math.min(1, Col[0] + 0.14), Math.min(1, Col[1] + 0.14), Math.min(1, Col[2] + 0.14), 0.94];
                        PushTri([Bx - Side[0] * TipW, By - Side[1] * TipW, Bz - Side[2] * TipW], [Bx + Side[0] * TipW, By + Side[1] * TipW, Bz + Side[2] * TipW], Tip, Norm, ACol);
                        PushTri([Bx - Norm[0] * TipW, By - Norm[1] * TipW, Bz - Norm[2] * TipW], [Bx + Norm[0] * TipW, By + Norm[1] * TipW, Bz + Norm[2] * TipW], Tip, Side, ACol);
                    }
                }
            }
            Stream3DCache = { Key: StreamKey, Mesh: Built };
        }
        for (let I = 0; I < Stream3DCache.Mesh.length; I++) Mesh.push(Stream3DCache.Mesh[I]);
    }

    // 4. Placed 3D Meteorological Cup Anemometer & Wind Vane Station
    if (Scene.ProbeEnabled)
    {
        const [Px, Py, Pz] = Scene.Probe;
        const Prep = Scene.PreparedField || FC().Prepare(Scene.FieldScene, Scene.Time);
        const Vz = Scene.FieldScene.Visualization;
        const ProbeAll = FC().EvaluateAllPrepared(Scene.FieldScene, Prep, Px, Py, Pz, 0.5, Vz.Solo, 'Particles');
        const ActiveProbe = Scene.AnemometerDragging || Scene.AnemometerHover || Scene.AnemometerPlacing;
        const MastCol = ActiveProbe ? [0.64, 0.94, 0.84, 0.98] : [0.40, 0.46, 0.54, 0.96];
        const HousingCol = [0.22, 0.27, 0.33, 0.96];
        const AccentCol = ActiveProbe ? [0.98, 0.80, 0.38, 0.98] : [0.46, 0.84, 0.74, 0.95];
        const CupCol = [0.84, 0.89, 0.93, 0.97];

        const CylinderY = (Cx, Y0, Y1, Cz, R0, R1, Segs, Col) =>
        {
            for (let I = 0; I < Segs; I++)
            {
                const A0 = (I / Segs) * Math.PI * 2, A1 = ((I + 1) / Segs) * Math.PI * 2;
                const C0 = Math.cos(A0), S0 = Math.sin(A0), C1 = Math.cos(A1), S1 = Math.sin(A1);
                const P00 = [Cx + C0 * R0, Y0, Cz + S0 * R0], P10 = [Cx + C1 * R0, Y0, Cz + S1 * R0];
                const P01 = [Cx + C0 * R1, Y1, Cz + S0 * R1], P11 = [Cx + C1 * R1, Y1, Cz + S1 * R1];
                Face(P00, P10, P11, Col); Face(P00, P11, P01, Col);
            }
        };

        // Tripod ground feet & slim tapered mast
        const FootR = 0.16;
        RingXZ(Px, 0.025, Pz, FootR, 24, [0.48, 0.84, 0.74, ActiveProbe ? 0.85 : 0.42]);
        for (let T = 0; T < 3; T++)
        {
            const A = (T * Math.PI * 2) / 3 + 0.35;
            Line([Px + Math.cos(A) * FootR, 0.025, Pz + Math.sin(A) * FootR], [Px, Math.min(Py * 0.28, 0.24), Pz], [0.44, 0.50, 0.58, 0.88]);
        }
        if (Py > 0.12) CylinderY(Px, 0.025, Py - 0.04, Pz, 0.020, 0.013, 8, MastCol);

        // Anemometer sensor housing hub & accent collar
        CylinderY(Px, Py - 0.045, Py + 0.045, Pz, 0.036, 0.034, 12, HousingCol);
        CylinderY(Px, Py + 0.028, Py + 0.048, Pz, 0.039, 0.039, 12, AccentCol);
        CylinderY(Px, Py + 0.048, Py + 0.095, Pz, 0.014, 0.010, 8, CupCol);

        // 3-Cup Meteorological Rotor with 3D conical cups
        const RotorTheta = Scene.Time * (1.2 + ProbeAll.FlowMag * 1.45);
        const ArmR = 0.165, RotorY = Py + 0.082;
        for (let K = 0; K < 3; K++)
        {
            const Ang = RotorTheta + (K * Math.PI * 2) / 3;
            const Ca = Math.cos(Ang), Sa = Math.sin(Ang);
            const Tx = Px + Ca * ArmR, Tz = Pz + Sa * ArmR;
            Line([Px, RotorY, Pz], [Tx, RotorY, Tz], CupCol);
            // Tangential cup axis
            const Ax = -Sa, Az = Ca;
            const Up = [0, 1, 0];
            const Rad = [Ca, 0, Sa];
            const CupR = 0.034, CupD = 0.046;
            const RimC = [Tx + Ax * 0.012, RotorY, Tz + Az * 0.012];
            const Apex = [Tx - Ax * CupD, RotorY, Tz - Az * CupD];
            for (let S = 0; S < 6; S++)
            {
                const B0 = (S / 6) * Math.PI * 2, B1 = ((S + 1) / 6) * Math.PI * 2;
                const R0 = [
                    RimC[0] + (Rad[0] * Math.cos(B0) + Up[0] * Math.sin(B0)) * CupR,
                    RimC[1] + (Rad[1] * Math.cos(B0) + Up[1] * Math.sin(B0)) * CupR,
                    RimC[2] + (Rad[2] * Math.cos(B0) + Up[2] * Math.sin(B0)) * CupR
                ];
                const R1 = [
                    RimC[0] + (Rad[0] * Math.cos(B1) + Up[0] * Math.sin(B1)) * CupR,
                    RimC[1] + (Rad[1] * Math.cos(B1) + Up[1] * Math.sin(B1)) * CupR,
                    RimC[2] + (Rad[2] * Math.cos(B1) + Up[2] * Math.sin(B1)) * CupR
                ];
                Face(R0, R1, Apex, S % 2 ? AccentCol : CupCol);
            }
        }

        // Aerodynamic Wind Vane Boom & Swept Delta Tail Fin
        const Horiz = Math.hypot(ProbeAll.Velocity[0], ProbeAll.Velocity[2]);
        const Dx = Horiz > 0.05 ? ProbeAll.Velocity[0] / Horiz : 1;
        const Dz = Horiz > 0.05 ? ProbeAll.Velocity[2] / Horiz : 0;
        const Rx = -Dz, Rz = Dx;
        const VaneY = Py - 0.025;
        const Nose = [Px + Dx * 0.16, VaneY, Pz + Dz * 0.16];
        const TailEnd = [Px - Dx * 0.21, VaneY, Pz - Dz * 0.21];
        Line(TailEnd, Nose, [0.76, 0.82, 0.88, 0.96]);
        // Forward counterweight pointer cone
        const NBase = [Px + Dx * 0.10, VaneY, Pz + Dz * 0.10];
        const N0 = [NBase[0] + Rx * 0.018, VaneY, NBase[2] + Rz * 0.018];
        const N1 = [NBase[0] - Rx * 0.018, VaneY, NBase[2] - Rz * 0.018];
        const N2 = [NBase[0], VaneY + 0.018, NBase[2]];
        const N3 = [NBase[0], VaneY - 0.018, NBase[2]];
        Face(N0, N2, Nose, [0.95, 0.78, 0.36, 0.98]);
        Face(N2, N1, Nose, [0.95, 0.78, 0.36, 0.98]);
        Face(N1, N3, Nose, [0.95, 0.78, 0.36, 0.98]);
        Face(N3, N0, Nose, [0.95, 0.78, 0.36, 0.98]);
        // Swept tail fin
        const F0 = [Px - Dx * 0.08, VaneY, Pz - Dz * 0.08];
        const F1 = [Px - Dx * 0.20, VaneY, Pz - Dz * 0.20];
        const F2 = [Px - Dx * 0.23, VaneY + 0.085, Pz - Dz * 0.23];
        const F3 = [Px - Dx * 0.13, VaneY + 0.068, Pz - Dz * 0.13];
        Face(F0, F1, F2, AccentCol);
        Face(F0, F2, F3, AccentCol);
    }
    return { Lines: new Float32Array(Out), Meshes: new Float32Array(Mesh) };
}

function InvertMatrix4(M)
{
    const Inv = new Float32Array(16);
    Inv[0] = M[5] * M[10] * M[15] - M[5] * M[11] * M[14] - M[9] * M[6] * M[15] + M[9] * M[7] * M[14] + M[13] * M[6] * M[11] - M[13] * M[7] * M[10];
    Inv[4] = -M[4] * M[10] * M[15] + M[4] * M[11] * M[14] + M[8] * M[6] * M[15] - M[8] * M[7] * M[14] - M[12] * M[6] * M[11] + M[12] * M[7] * M[10];
    Inv[8] = M[4] * M[9] * M[15] - M[4] * M[11] * M[13] - M[8] * M[5] * M[15] + M[8] * M[7] * M[13] + M[12] * M[5] * M[11] - M[12] * M[7] * M[9];
    Inv[12] = -M[4] * M[9] * M[14] + M[4] * M[10] * M[13] + M[8] * M[5] * M[14] - M[8] * M[6] * M[13] - M[12] * M[5] * M[10] + M[12] * M[6] * M[9];
    Inv[1] = -M[1] * M[10] * M[15] + M[1] * M[11] * M[14] + M[9] * M[2] * M[15] - M[9] * M[3] * M[14] - M[13] * M[2] * M[11] + M[13] * M[3] * M[10];
    Inv[5] = M[0] * M[10] * M[15] - M[0] * M[11] * M[14] - M[8] * M[2] * M[15] + M[8] * M[3] * M[14] + M[12] * M[2] * M[11] - M[12] * M[3] * M[10];
    Inv[9] = -M[0] * M[9] * M[15] + M[0] * M[11] * M[13] + M[8] * M[1] * M[15] - M[8] * M[3] * M[13] - M[12] * M[1] * M[11] + M[12] * M[3] * M[9];
    Inv[13] = M[0] * M[9] * M[14] - M[0] * M[10] * M[13] - M[8] * M[1] * M[14] + M[8] * M[2] * M[13] + M[12] * M[1] * M[10] - M[12] * M[2] * M[9];
    Inv[2] = M[1] * M[6] * M[15] - M[1] * M[7] * M[14] - M[5] * M[2] * M[15] + M[5] * M[3] * M[14] + M[13] * M[2] * M[7] - M[13] * M[3] * M[6];
    Inv[6] = -M[0] * M[6] * M[15] + M[0] * M[7] * M[14] + M[4] * M[2] * M[15] - M[4] * M[3] * M[14] - M[12] * M[2] * M[7] + M[12] * M[3] * M[6];
    Inv[10] = M[0] * M[5] * M[15] - M[0] * M[7] * M[13] - M[4] * M[1] * M[15] + M[4] * M[3] * M[13] + M[12] * M[1] * M[7] - M[12] * M[3] * M[5];
    Inv[14] = -M[0] * M[5] * M[14] + M[0] * M[6] * M[13] + M[4] * M[1] * M[14] - M[4] * M[2] * M[13] - M[12] * M[1] * M[6] + M[12] * M[2] * M[5];
    Inv[3] = -M[1] * M[6] * M[11] + M[1] * M[7] * M[10] + M[5] * M[2] * M[11] - M[5] * M[3] * M[10] - M[9] * M[2] * M[7] + M[9] * M[3] * M[6];
    Inv[7] = M[0] * M[6] * M[11] - M[0] * M[7] * M[10] - M[4] * M[2] * M[11] + M[4] * M[3] * M[10] + M[8] * M[2] * M[7] - M[8] * M[3] * M[6];
    Inv[11] = -M[0] * M[5] * M[11] + M[0] * M[7] * M[9] + M[4] * M[1] * M[11] - M[4] * M[3] * M[9] - M[8] * M[1] * M[7] + M[8] * M[3] * M[5];
    Inv[15] = M[0] * M[5] * M[10] - M[0] * M[6] * M[9] - M[4] * M[1] * M[10] + M[4] * M[2] * M[9] + M[8] * M[1] * M[6] - M[8] * M[2] * M[5];
    const Det = M[0] * Inv[0] + M[1] * Inv[4] + M[2] * Inv[8] + M[3] * Inv[12];
    if (Math.abs(Det) < 1e-8) return null;
    for (let I = 0; I < 16; I++) Inv[I] /= Det;
    return Inv;
}

function ProjectWorldToCss(VP, X, Y, Z, W, H)
{
    const Cx = VP[0] * X + VP[4] * Y + VP[8] * Z + VP[12];
    const Cy = VP[1] * X + VP[5] * Y + VP[9] * Z + VP[13];
    const Cw = VP[3] * X + VP[7] * Y + VP[11] * Z + VP[15];
    if (Cw <= 0.05) return null;
    return { X: ((Cx / Cw) * 0.5 + 0.5) * W, Y: (0.5 - (Cy / Cw) * 0.5) * H };
}

function ScreenToWorldPlane(Cam, ClientX, ClientY, Canvas, PlaneY)
{
    if (!Cam || !Canvas) return null;
    const Inv = InvertMatrix4(Cam.ViewProjection);
    if (!Inv) return null;
    const Rect = Canvas.getBoundingClientRect();
    if (Rect.width < 4 || Rect.height < 4) return null;
    const NdcX = ((ClientX - Rect.left) / Rect.width) * 2 - 1;
    const NdcY = 1 - ((ClientY - Rect.top) / Rect.height) * 2;
    const Unproj = NdcZ =>
    {
        const Ox = Inv[0] * NdcX + Inv[4] * NdcY + Inv[8] * NdcZ + Inv[12];
        const Oy = Inv[1] * NdcX + Inv[5] * NdcY + Inv[9] * NdcZ + Inv[13];
        const Oz = Inv[2] * NdcX + Inv[6] * NdcY + Inv[10] * NdcZ + Inv[14];
        const Ow = Inv[3] * NdcX + Inv[7] * NdcY + Inv[11] * NdcZ + Inv[15] || 1;
        return [Ox / Ow, Oy / Ow, Oz / Ow];
    };
    const Near = Unproj(-1), Far = Unproj(1);
    const Dir = [Far[0] - Near[0], Far[1] - Near[1], Far[2] - Near[2]];
    if (Math.abs(Dir[1]) < 1e-4) return null;
    const T = (PlaneY - Near[1]) / Dir[1];
    if (T <= 0 || T > 400) return null;
    return [Near[0] + Dir[0] * T, PlaneY, Near[2] + Dir[2] * T];
}

function HitTestAnemometer(Cam, ClientX, ClientY, Canvas)
{
    if (!Scene.ProbeEnabled || !Cam || !Canvas) return false;
    const Rect = Canvas.getBoundingClientRect();
    const Mx = ClientX - Rect.left, My = ClientY - Rect.top;
    const Head = ProjectWorldToCss(Cam.ViewProjection, Scene.Probe[0], Scene.Probe[1], Scene.Probe[2], Rect.width, Rect.height);
    const Base = ProjectWorldToCss(Cam.ViewProjection, Scene.Probe[0], 0.02, Scene.Probe[2], Rect.width, Rect.height);
    if (Head && Math.hypot(Mx - Head.X, My - Head.Y) <= 24) return true;
    if (Base && Math.hypot(Mx - Base.X, My - Base.Y) <= 18) return true;
    return false;
}

function SyncAnemometerToolState()
{
    const Surface = document.getElementById('ViewportSurface');
    if (Surface)
    {
        Surface.classList.toggle('is-placing-probe', !!Scene.AnemometerPlacing);
        Surface.classList.toggle('is-drag-probe', !!Scene.AnemometerDragging);
        Surface.classList.toggle('is-hover-probe', !Scene.AnemometerPlacing && !Scene.AnemometerDragging && !!Scene.AnemometerHover);
    }
    const Banner = document.getElementById('ViewportPlaceBanner');
    if (Banner) Banner.classList.toggle('shown', !!Scene.AnemometerPlacing || !!Scene.AnemometerDragging);
    const BannerText = document.getElementById('ViewportPlaceText');
    if (BannerText)
    {
        BannerText.textContent = Scene.AnemometerDragging
            ? `Moving Anemometer (${Scene.Probe.map(V => V.toFixed(1)).join(', ')}) m · Hold Shift to adjust altitude Y`
            : 'Click anywhere in the viewport to place the Anemometer · Drag pin anytime · Esc cancel';
    }
    const ProbeTool = document.querySelector('#ViewportTools [data-vtool="probe"]');
    if (ProbeTool) ProbeTool.classList.toggle('active', !!Scene.AnemometerPlacing || !!Scene.ProbeEnabled);
    const OrbitTool = document.querySelector('#ViewportTools [data-vtool="orbit"]');
    if (OrbitTool) OrbitTool.classList.toggle('active', !Scene.AnemometerPlacing);
    const PlaceBtn = document.getElementById('btn-place-anemometer');
    if (PlaceBtn)
    {
        PlaceBtn.classList.toggle('active', !!Scene.AnemometerPlacing);
        PlaceBtn.textContent = Scene.AnemometerPlacing ? 'Click Viewport…' : 'Place in Viewport';
    }
    const ToggleBtn = document.getElementById('btn-toggle-anemometer');
    if (ToggleBtn)
    {
        ToggleBtn.classList.toggle('active', !!Scene.ProbeEnabled);
        ToggleBtn.textContent = Scene.ProbeEnabled ? 'In Viewport' : 'Hidden';
    }
}

function DrawAnemometerTrace(Canvas, History)
{
    if (!Canvas || !History || History.length < 2) return;
    const W = Canvas.clientWidth || 310;
    const H = Canvas.clientHeight || 78;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    if (Canvas.width !== Math.round(W * DPR) || Canvas.height !== Math.round(H * DPR))
    {
        Canvas.width = Math.round(W * DPR);
        Canvas.height = Math.round(H * DPR);
    }
    const Ctx = Canvas.getContext('2d');
    Ctx.save();
    Ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    Ctx.clearRect(0, 0, W, H);

    const MaxV = Math.max(20, Math.ceil(Math.max(...History, 18) / 10) * 10);
    const PadTop = 6, PadBot = 6;
    const PlotH = H - PadTop - PadBot;

    Ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    Ctx.lineWidth = 1;
    Ctx.fillStyle = 'rgba(255,255,255,0.32)';
    Ctx.font = '10px "DM Sans", sans-serif';
    for (let Step = 10; Step < MaxV; Step += 10)
    {
        const Y = PadTop + PlotH * (1 - Step / MaxV);
        Ctx.beginPath();
        Ctx.moveTo(0, Math.round(Y) + 0.5);
        Ctx.lineTo(W, Math.round(Y) + 0.5);
        Ctx.stroke();
        Ctx.fillText(String(Step), 4, Y - 2);
    }

    const MapX = I => (I / Math.max(1, History.length - 1)) * (W - 6) + 2;
    const MapY = V => PadTop + PlotH * (1 - Clamp(V / MaxV, 0, 1));

    const Grad = Ctx.createLinearGradient(0, PadTop, 0, H);
    Grad.addColorStop(0, 'rgba(88, 153, 121, 0.30)');
    Grad.addColorStop(1, 'rgba(88, 153, 121, 0.01)');
    Ctx.beginPath();
    Ctx.moveTo(MapX(0), H);
    for (let I = 0; I < History.length; I++) Ctx.lineTo(MapX(I), MapY(History[I]));
    Ctx.lineTo(MapX(History.length - 1), H);
    Ctx.closePath();
    Ctx.fillStyle = Grad;
    Ctx.fill();

    Ctx.beginPath();
    for (let I = 0; I < History.length; I++)
    {
        const X = MapX(I), Y = MapY(History[I]);
        if (I === 0) Ctx.moveTo(X, Y);
        else Ctx.lineTo(X, Y);
    }
    Ctx.strokeStyle = '#92d8c2';
    Ctx.lineWidth = 1.65;
    Ctx.lineJoin = 'round';
    Ctx.stroke();

    const LastX = MapX(History.length - 1);
    const LastY = MapY(History[History.length - 1]);
    Ctx.beginPath();
    Ctx.arc(LastX, LastY, 3.2, 0, Math.PI * 2);
    Ctx.fillStyle = '#ffffff';
    Ctx.fill();
    Ctx.restore();
}

function ResolveProbeVoxel()
{
    const Cell = Domain.Size.map((S, I) => S / Domain.Dimensions[I]);
    return {
        ix: Clamp(Math.floor((Scene.Probe[0] - Domain.Minimum[0]) / Cell[0]), 0, Domain.Dimensions[0] - 1),
        iy: Clamp(Math.floor((Scene.Probe[1] - Domain.Minimum[1]) / Cell[1]), 0, Domain.Dimensions[1] - 1),
        iz: Clamp(Math.floor((Scene.Probe[2] - Domain.Minimum[2]) / Cell[2]), 0, Domain.Dimensions[2] - 1)
    };
}

const HEAT_PRESET_TOKENS = new Set(['heat-shimmer', 'fire', 'explosion', 'embers', 'flares', 'lapilli', 'fireworks']);

function DetectHeatSources()
{
    const Comp = Scene.CameraComponents.Heat;
    const List = [];
    for (const E of Scene.Effects)
    {
        if (!E.P.visible) continue;
        if (E.P.heatShimmer)
        {
            const Sh = E.P.heatShimmer;
            List.push({
                Kind: 'heatShimmer', Label: E.Name, Origin: E.P.origin,
                Radius: Sh.radius || 1.6, Strength: Sh.strength || 0.03, Freq: Sh.freq || 14, Rate: Sh.rate || 1.5
            });
            continue;
        }
        if (Comp.IncludeFireParticles)
        {
            const IsHeatPreset = HEAT_PRESET_TOKENS.has(E.PresetId) || /heat|fire|flame|ember|lava/i.test(`${E.PresetId} ${E.Name}`);
            const IsHotBuoyant = (E.P.buoyancy >= 1.1 && E.P.blend === 'add' && (E.P.colA?.[0] || 0) > 0.65);
            if (IsHeatPreset || IsHotBuoyant)
            {
                const BaseR = Math.max(1.35, ((E.P.radius || 0.35) + (E.P.boxHalf?.[0] || 0)) * 2.2);
                const Pos = [E.P.origin[0], E.P.origin[1] + 0.55, E.P.origin[2]];
                List.push({
                    Kind: 'fireParticle', Label: E.Name, Origin: Pos,
                    Radius: BaseR, Strength: 0.024, Freq: 15, Rate: 1.7
                });
            }
        }
    }
    if (Comp.IncludeThermalFields)
    {
        for (const S of Scene.FieldScene.Sources)
        {
            if (!S.Enabled) continue;
            if (S.Type !== 'Thermal') continue;
            const Act = FC().ResolveActivation(S, Scene.Time);
            if (Act.Status !== 'Active') continue;
            List.push({
                Kind: 'thermalField', Label: S.Name, Origin: S.Centre,
                Radius: Math.max(1.2, S.Radius || 2.0), Strength: 0.022, Freq: 13, Rate: 1.5
            });
        }
    }
    return List;
}

function DetectBlackHoleSources()
{
    const Comp = Scene.CameraComponents.BlackHole;
    const List = [];
    if (Comp.TrackParticleHoles)
    {
        for (const E of Scene.Effects)
        {
            if (!E.P.visible || !E.P.blackHole) continue;
            const Hole = E.P.blackHole;
            List.push({
                Kind: 'particleHole', Label: E.Name, Origin: E.P.origin,
                Horizon: Hole.horizon || 0.45, Einstein: Hole.einstein || 3.0
            });
        }
    }
    if (Comp.CameraSingularity)
    {
        List.push({
            Kind: 'cameraSingularity', Label: 'Camera Singularity', Origin: Comp.Centre,
            Horizon: 0.42, Einstein: 2.6
        });
    }
    return List;
}

function DetectGlitchSources()
{
    const Comp = Scene.CameraComponents.Glitch;
    const List = [];
    if (Comp.TrackGlitchParticles)
    {
        for (const E of Scene.Effects)
        {
            if (!E.P.visible) continue;
            const IsGlitch = E.P.transition?.wave === 'glitch' || /glitch/i.test(`${E.PresetId} ${E.Name}`);
            if (!IsGlitch) continue;
            const BaseR = Math.max(1.15, (E.P.radius || 0.4) + (E.P.boxHalf?.[0] || 0.75) * 1.65);
            List.push({ Kind: 'glitchParticle', Label: E.Name, Origin: E.P.origin, Radius: BaseR });
        }
    }
    return List;
}

function PackLens(Camera, Aspect)
{
    const Out = new Float32Array(68);
    const Cmp = Scene.CameraComponents;
    const Exp = Cmp.Exposure;
    const Heat = Cmp.Heat;
    const BH = Cmp.BlackHole;
    const Glitch = Cmp.Glitch;

    let Holes = 0, Shimmers = 0, Glitches = 0;
    const VP = Camera.ViewProjection;
    const Scale = 0.5 / Math.tan((Camera.VFov || Math.PI / 4) * 0.5);
    const Project = Origin =>
    {
        const Clip = [0, 1, 2, 3].map(R => VP[R] * Origin[0] + VP[4 + R] * Origin[1] + VP[8 + R] * Origin[2] + VP[12 + R]);
        if (Clip[3] <= 0.01) return null;
        const Dist = Math.hypot(Origin[0] - Camera.Eye[0], Origin[1] - Camera.Eye[1], Origin[2] - Camera.Eye[2]);
        return { U: (Clip[0] / Clip[3]) * 0.5 + 0.5, V: 0.5 - (Clip[1] / Clip[3]) * 0.5, K: Scale / Math.max(Dist, 0.01) };
    };

    if (BH.Enabled)
    {
        for (const Src of DetectBlackHoleSources())
        {
            if (Holes >= 2) break;
            const Pt = Project(Src.Origin);
            if (!Pt) continue;
            const H = Src.Horizon * BH.HorizonScale * Pt.K;
            const E = Src.Horizon * Src.Einstein * BH.EinsteinScale * Pt.K;
            Out.set([Pt.U, Pt.V, E, H], Holes * 4);
            Holes++;
        }
    }

    if (Heat.Enabled)
    {
        for (const Src of DetectHeatSources())
        {
            if (Shimmers >= 4) break;
            const Pt = Project(Src.Origin);
            if (!Pt) continue;
            Out.set([Pt.U, Pt.V, Src.Radius * Heat.RadiusScale * Pt.K, Src.Strength * Heat.StrengthScale], 12 + Shimmers * 8);
            Out.set([Scene.Time * Src.Rate * Heat.RateScale, Src.Freq * Heat.FrequencyScale, 0, 0], 16 + Shimmers * 8);
            Shimmers++;
        }
    }

    if (Glitch.Enabled)
    {
        for (const Src of DetectGlitchSources())
        {
            if (Glitches >= 2) break;
            const Pt = Project(Src.Origin);
            if (!Pt) continue;
            Out.set([Pt.U, Pt.V, Src.Radius * Glitch.RadiusScale * Pt.K, Glitch.Intensity], 56 + Glitches * 4);
            Glitches++;
        }
    }

    const GlobalHeatStr = (Heat.Enabled && Heat.HorizonMirage) ? (0.022 * Heat.StrengthScale) : 0;
    const GlobalGlitch = (Glitch.Enabled && Glitch.FullFrame) ? Glitch.Intensity : 0;
    const Chromatic = (Glitch.Enabled && (Glitches > 0 || Glitch.FullFrame)) ? Glitch.Chromatic : 0;
    const ExpGain = Exp.Enabled ? Math.pow(2, Exp.EV || 0) : 1.0;
    const Contrast = Exp.Enabled ? Exp.Contrast : 1.0;
    const Saturation = Exp.Enabled ? Exp.Saturation : 1.0;
    const Vignette = Exp.Enabled ? Exp.Vignette : 0.0;
    const BloomOn = Exp.Enabled && Exp.BloomEnabled !== false;
    const Bloom = BloomOn ? (Exp.Bloom ?? 0) : 0.0;
    const BloomThreshold = Exp.BloomThreshold ?? 0.42;
    const BloomRadius = Exp.BloomRadius ?? 1.15;
    const BloomKnee = Exp.BloomKnee ?? 0.25;

    Out[8] = Holes; Out[9] = Aspect; Out[10] = BH.Enabled ? BH.Glow : 0.0; Out[11] = Shimmers;
    Out[44] = ExpGain; Out[45] = Contrast; Out[46] = Saturation; Out[47] = Vignette;
    Out[48] = Chromatic; Out[49] = Bloom; Out[50] = GlobalHeatStr; Out[51] = Scene.Time * Heat.RateScale * 1.5;
    Out[52] = 14 * Heat.FrequencyScale; Out[53] = Heat.HorizonCutoff; Out[54] = GlobalGlitch; Out[55] = Scene.Time;
    Out[64] = BloomThreshold; Out[65] = BloomRadius; Out[66] = BloomKnee; Out[67] = Bloom > 0.002 ? 1.0 : 0.0;

    const Active = (Holes + Shimmers + Glitches > 0) || GlobalHeatStr > 0.0001 || GlobalGlitch > 0.005 || Chromatic > 0.005
        || (Exp.Enabled && (Math.abs(Exp.EV) > 0.005 || Math.abs(Exp.Contrast - 1) > 0.005 || Math.abs(Exp.Saturation - 1) > 0.005 || Exp.Vignette > 0.005 || Bloom > 0.002));
    return { Count: Holes, ShimmerCount: Shimmers, GlitchCount: Glitches, Active, Packed: Out };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    FRAME LOOP
//------------------------------------------------------------------------------------------------------------------------

let LastTickErrorAt = 0;

function Tick(Now)
{
    if (Held) return;
    requestAnimationFrame(Tick);
    if (document.hidden) { LastTick = 0; return; }
    try
    {
        Advance(Now);
    }
    catch (Err)
    {
        if (Now - LastTickErrorAt > 2000)
        {
            LastTickErrorAt = Now;
            console.error('ParticleWorkspace frame error:', Err);
            AppendLog('PARTICLES', 'Frame render error', Err?.message || String(Err), 'warm');
        }
    }
}

function Advance(Now)
{
    const Started = performance.now();
    const RealDelta = LastTick ? Math.min(0.05, (Now - LastTick) / 1000) : 0.016;
    LastTick = Now;
    if (RealDelta > 0) Scene.Rate = Scene.Rate * 0.9 + (1 / RealDelta) * 0.1;
    const Delta = Scene.Playing ? RealDelta * Scene.TimeScale : 0;
    Scene.Time += Delta;
    Scene.Step++;
    if (Scene.Turntable && Scene.Playing) Scene.Camera.Yaw += RealDelta * 0.28;

    if (Scene.Vehicle)
    {
        const VehDelta = Scene.Playing
            ? Delta
            : (Scene.Vehicle.PaintRipActive || Scene.Vehicle.RimRipActive || Scene.Vehicle.Mode === 'scan' || (Scene.Vehicle.HoloFade > 0.002 && Scene.Vehicle.HoloFade < 0.998) ? RealDelta * Scene.TimeScale : 0);
        if (!Scene.Playing)
        {
            const KeepRot = Scene.Vehicle.AutoRotate;
            const KeepSpin = Scene.Vehicle.WheelSpinRate;
            Scene.Vehicle.AutoRotate = false;
            Scene.Vehicle.WheelSpinRate = 0;
            StepVehicleState(Scene.Vehicle, VehDelta);
            Scene.Vehicle.AutoRotate = KeepRot;
            Scene.Vehicle.WheelSpinRate = KeepSpin;
        }
        else
        {
            StepVehicleState(Scene.Vehicle, VehDelta);
        }
        SyncVehicleScanHud();
    }

    for (const Hit of Scene.Lightning.update(Delta, Scene.Time)) ReceiveStrike(Hit);
    if (Scene.Web.Enabled && Scene.Time >= Scene.Web.NextAt)
    {
        const Origins = Scene.Effects.filter(E => E.P.visible).map(E => [E.P.origin[0], E.P.origin[1], E.P.origin[2]]);
        if (Origins.length >= 2) Scene.Lightning.web(Scene.Time, Origins, { k: Scene.Web.Links, life: Scene.Web.Interval * 0.9 });
        Scene.Web.NextAt = Scene.Time + Scene.Web.Interval;
    }

    const Engine = Scene.Engine;
    const Canvas = Engine.canvas;
    const Aspect = Canvas.width / Math.max(1, Canvas.height);
    const Camera = ResolveCamera(Aspect);
    const Solo = Scene.FieldScene.Visualization.Solo;

    Scene.PreparedField = FC().Prepare(Scene.FieldScene, Scene.Time);
    Scene.PackedFields = FC().PackForceEntries(Scene.FieldScene, Scene.PreparedField, Scene.Effects, null, Solo);

    const WindTexData = Scene.IsFallback
        ? null
        : FC().SampleWindTexData(Scene.FieldScene, Scene.PreparedField, PE.WIND, Scene.Wind.windScale, Solo);

    const VehOn = Scene.Vehicle?.Enabled && Scene.Vehicle?.Loaded && Scene.Vehicle?.Mesh;
    const VehSc = VehOn ? Math.max(0.05, Scene.Vehicle.Scale || 1) : 0;
    const VehPx = VehOn ? (Scene.Vehicle.Position?.[0] || 0) : 0;
    const VehPz = VehOn ? (Scene.Vehicle.Position?.[2] || 0) : 0;
    const VehYw = VehOn ? (Scene.Vehicle.Yaw || 0) : 0;

    const Global = new Float32Array(52);
    const Off = PE.GLOB_OFF;
    Global.set(Camera.ViewProjection, Off.viewProj);
    Global.set([Camera.Right[0], Camera.Right[1], Camera.Right[2], VehPz], Off.camRight);
    Global.set([Camera.Up[0], Camera.Up[1], Camera.Up[2], VehYw], Off.camUp);
    Global.set([Camera.Eye[0], Camera.Eye[1], Camera.Eye[2], 1], Off.camPos);
    Global.set([Domain.Minimum[0], Domain.Minimum[1], Domain.Minimum[2], VehSc], Off.windMin);
    Global.set([Domain.Size[0], Domain.Size[1], Domain.Size[2], VehPx], Off.windSize);
    Global.set([Domain.Dimensions[0], Domain.Dimensions[1], Domain.Dimensions[2], Scene.FieldScene.Sources.length], Off.windDim);
    Global.set([Scene.Time, Delta, Scene.Step, Scene.Wind.windScale], Off.timing);
    Global.set([Scene.Wind.arrowRef, Scene.Wind.arrowStyle ?? 0, Scene.Lightning.flash, Scene.Wind.turbulence], Off.viz);
    Global.set([Scene.Wind.swirl, 0.45, 0.22, Scene.Wind.arrowStride ?? 2], Off.swirl);

    const Components = new Float32Array(PE.WIND.maxComps * 8);

    const Jobs = [];
    for (const E of Scene.Effects)
    {
        if (!E.P.visible || !E.Gpu) continue;
        const P = E.P, Gpu = E.Gpu;
        if (P.kind === 7)
        {
            const Fibre = P.fibre;
            const Key = Fibre.pathShape + '|' + Fibre.pathSize;
            let Path = null;
            if (Gpu.pathKey !== Key) { Gpu.pathKey = Key; Path = PE.samplePath(Fibre.pathShape, Fibre.pathSize, PE.PATH_SAMPLES); }
            PE.fillFibre(Gpu.fibreCpu, P, { lf: (Scene.Time / Fibre.loopSeconds) % 1, projScale: (0.5 * Canvas.height) / Math.tan((Camera.VFov || (Math.PI / 4)) * 0.5), viewW: Canvas.width, viewH: Canvas.height });
            Jobs.push({ gpu: Gpu, cpu: Gpu.fibreCpu, path: Path, fibre: true, simulate: false, draw: false, strands: Fibre.strands, segments: Fibre.segments, sparks: Fibre.sparks > 0, alpha: false, mol: false, emitN: 0, steps: 0, gd: 1 });
            continue;
        }
        const Molecular = P.kind === 3 || P.kind === 4;
        const Simulate = Scene.Playing && Delta > 0;
        let Release = 0, Steps = 0, StepDelta = Delta, Head = E.Head, Origin = P.origin;
        if (Simulate)
        {
            if (P.burstEvery > 0)
            {
                E.BurstTimer = (E.BurstTimer ?? 0) - Delta;
                if (E.BurstTimer <= 0)
                {
                    E.BurstTimer = P.burstEvery * (0.7 + 0.6 * Math.random());
                    E.PendingBurst += P.burstCount;
                    E.OverrideOrigin = P.burstAtOrigin ? null : [-3 + 6 * Math.random(), 3.5 + 2.5 * Math.random(), -3 + 6 * Math.random()];
                }
            }
            if (E.OverrideOrigin) { Origin = E.OverrideOrigin; E.OverrideOrigin = null; }
            if (Molecular)
            {
                Steps = Clamp(Math.round(Delta / P.simDt), 1, 8);
                StepDelta = Math.min(Delta / Steps, P.simDt * 1.25);
                if (E.NeedFill) { Release = Gpu.cap; E.NeedFill = false; Head = 0; }
            }
            else
            {
                E.Accumulated += P.rate * Delta;
                Release = Math.floor(E.Accumulated);
                E.Accumulated -= Release;
                Release = Math.min(Gpu.cap, Release + E.PendingBurst);
                E.PendingBurst = 0;
                E.Head = (Head + Release) % Gpu.cap;
            }
        }
        const Half = P.boxHalf[0];
        const Cutoff = 2.5 * P.sigma;
        const GridDim = Molecular ? Clamp(Math.floor((2 * Half) / Cutoff), 1, PE.MAX_GD) : 1;
        const PreseedCurtain = !!E.PreseedCurtain;
        E.PreseedCurtain = false;
        PE.fillSys(Gpu.cpu, P, {
            origin: Origin, dt: StepDelta, time: Scene.Time, frame: Scene.Step, cap: Gpu.cap, emitN: Release, head: Head,
            seed: (Scene.Step * 7919 + E.Number * 104729) >>> 0, mol: Molecular, gd: GridDim, cellSize: Molecular ? (2 * Half) / GridDim : 1,
            preseedCurtain: PreseedCurtain
        });
        Jobs.push({
            gpu: Gpu, cpu: Gpu.cpu, simulate: Simulate, mol: Molecular, emitN: Release, steps: Steps, gd: GridDim, swarm: P.kind === 6,
            preseedCurtain: PreseedCurtain,
            readStats: Simulate && Scene.Step % 3 === 0, draw: true, alpha: P.blend === 'alpha', cube: P.shape === 4,
            shatter: !!(P.transition && P.transition.fragment), fly: !!(P.transition && P.transition.after === 'butterfly')
        });
    }

    const Segments = Scene.Lightning.pack(Scene.Time);
    const Geo = ConstructGeometry();
    const Probe = Scene.ProbeEnabled && !Engine.probePending && Scene.Step % 4 === 0 ? ResolveProbeVoxel() : null;
    const Lens = PackLens(Camera, Aspect);

    const VehFrame = Scene.Vehicle?.Enabled && Scene.Vehicle?.Loaded && Scene.Vehicle?.Mesh
        ? { enabled: true, mesh: Scene.Vehicle.Mesh, state: Scene.Vehicle, uniform: PackVehicleUniform(Scene.Vehicle, Scene.Time) }
        : null;

    Engine.render({
        glob: Global, fields: Scene.PackedFields, lensCount: Lens.Active ? 1 : 0, lens: Lens.Packed,
        comps: Components, windTexData: WindTexData, fieldScene: Scene.FieldScene, preparedField: Scene.PreparedField,
        clear: ClearColour.map(Ch => Ch + Scene.Lightning.flash * 0.22), floor: Scene.Wind.showFloor, arrows: Scene.Wind.showArrows,
        lines: Geo.Lines, lineCount: Geo.Lines.length / 7, meshes: Geo.Meshes, meshCount: Geo.Meshes.length / 10,
        segCount: Segments, segData: Scene.Lightning.dataBuf, jobs: Jobs, probe: Probe, vehicle: VehFrame
    });

    if (Now - ReadbackTimer > 150 && Scene.Overlay.Enabled && Scene.Readback) { ReadbackTimer = Now; Scene.Readback.Request(); }
    RenderOverlay(Camera);

    UpdateLiveTransport();
    CpuAccumulated += performance.now() - Started;
    CpuTicks++;
    if (Now - LiveTimer > 250)
    {
        LiveTimer = Now;
        Scene.CpuMilliseconds = CpuTicks ? CpuAccumulated / CpuTicks : 0;
        CpuAccumulated = 0; CpuTicks = 0;
        RefreshLive();
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                       FORCEFIELDVISUALIZATION OVERLAY & INSPECTOR MAP
//------------------------------------------------------------------------------------------------------------------------

const InsideDomain = (X, Y, Z) => X >= Domain.Minimum[0] && X <= Domain.Minimum[0] + Domain.Size[0] && Z >= Domain.Minimum[2] && Z <= Domain.Minimum[2] + Domain.Size[2];

function SampleParticleField(Contribution, X, Y, Z, Time, CellSpan, Out)
{
    Out[0] = 0; Out[1] = 0; Out[2] = 0;
    const T = Number.isFinite(Time) ? Time : Scene.Time;
    const Prepared = T === Scene.Time && Scene.PreparedField ? Scene.PreparedField : FC().Prepare(Scene.FieldScene, T);
    FC().EvaluatePrepared(Scene.FieldScene, Prepared, Contribution, X, Y, Z, CellSpan, Out, Scene.FieldScene.Visualization.Solo, 'Particles');
    const Gain = Contribution === 'Flow' ? (Scene.Wind?.windScale ?? 1) : 1;
    Out[0] *= Gain; Out[1] *= Gain; Out[2] *= Gain;
    return InsideDomain(X, Y, Z);
}

function DescribeSources()
{
    const Sources = [];
    for (const S of Scene.FieldScene.Sources)
    {
        const Info = FC().TypeById[S.Type];
        if (!Info) continue;
        const Token = 'src:' + S.Token;
        const ActiveFlag = FC().ResolveActivation(S, Scene.Time).Status === 'Active' ? 1 : 0;
        const Ext = S.Reach === 'Box' ? FC().ResolveBoxExtents(S) : null;
        const Turn = ((S.Bearing || 0) * Math.PI) / 180;
        const OutlineX = Ext && Ext.OffsetZ ? S.Centre[0] + Ext.OffsetZ * Math.sin(Turn) : undefined;
        const OutlineZ = Ext && Ext.OffsetZ ? S.Centre[2] - Ext.OffsetZ * Math.cos(Turn) : undefined;
        Sources.push({
            Id: Token, X: S.Centre[0], Y: S.Centre[1], Z: S.Centre[2],
            Radius: S.Radius, Height: S.Height, HalfX: Ext ? Ext.HalfX : S.HalfX, HalfZ: Ext ? Ext.HalfZ : S.HalfZ,
            OutlineX, OutlineZ, Rotation: S.Bearing || 0,
            Shape: S.Reach === 'Box' ? 'Box' : 'Circle',
            Point3D: S.Reach === 'Sphere',
            Contribution: Info.Contribution,
            Colour: Info.Colour,
            Label: S.Name,
            Active: ActiveFlag,
            Selected: Selected === Token,
            Dim: Scene.Overlay.Contribution && Info.Contribution !== Scene.Overlay.Contribution,
            Bearing: Info.Bearings?.length ? S[Info.Bearings[0][0]] : undefined
        });
    }
    for (const E of Scene.Effects)
    {
        if (!E.P.visible) continue;
        if (E.P.attractor && E.P.attractor.enabled)
            Sources.push({ Id: E.Token, X: E.P.origin[0], Y: E.P.origin[1], Z: E.P.origin[2], Radius: E.P.attractor.radius, Shape: 'Circle',
                           Contribution: 'Accelerate', Label: `${E.Name} · pull`, Active: 1, Selected: Selected === E.Token,
                           Dim: Scene.Overlay.Contribution !== 'Accelerate' });
        if (E.P.magneticField)
            Sources.push({ Id: E.Token, X: E.P.origin[0], Y: E.P.origin[1], Z: E.P.origin[2], Radius: E.P.magneticField.radius, Shape: 'Circle',
                           Contribution: 'Accelerate', Label: `${E.Name} · dipole`, Active: 1, Selected: Selected === E.Token,
                           Dim: Scene.Overlay.Contribution !== 'Accelerate' });
    }
    return Sources;
}

function ConstructOverlay()
{
    const Lib = FV();
    if (!Lib) return;
    const Canvas = document.getElementById('OverlayCanvas');
    Visualization = Lib.Create(Canvas, {
        Sample: SampleParticleField,
        MinimumSpan: 2,
        MaximumSpan: 80,
        OnMinimapPick: (X, Z) =>
        {
            Scene.Camera.Target[0] = Clamp(X, -6, 6);
            Scene.Camera.Target[2] = Clamp(Z, -6, 6);
            AppendLog('VIEW', 'Camera focused via minimap', `(${X.toFixed(1)}, ${Z.toFixed(1)}) m`, 'live');
        }
    });
    Visualization.Configure({
        Extent: { MinimumX: Domain.Minimum[0], MinimumZ: Domain.Minimum[2], MaximumX: Domain.Minimum[0] + Domain.Size[0], MaximumZ: Domain.Minimum[2] + Domain.Size[2], MinimumY: 0, MaximumY: 7.5 },
        ClipToExtent: true, CameraCells: 48, ShowScaleBar: false, ShowGroundGrid: false,
        Minimap: document.getElementById('MinimapCanvas'), RefreshInterval: 50
    });
    Visualization.View.Mode = 'Camera';
}

function SyncOverlayOptions()
{
    if (!Visualization) return;
    const Vz = Scene.FieldScene.Visualization;
    Visualization.Configure({
        Contribution: Scene.Overlay.Contribution,
        Quantity: Vz.Quantity || 'Speed',
        Heatmap: !!Vz.Heatmap,
        HeatmapStyle: Scene.Overlay.HeatmapStyle || 'Smooth',
        Opacity: Scene.Overlay.Opacity,
        FlowLines: !!Vz.FlowLines,
        FlowLineSpacing: Vz.FlowLineSpacing || 32,
        FlowLineLength: Vz.FlowLineLength || 28,
        FlowLinePulse: false,
        QuietCutoff: Vz.QuietCutoff ?? 0.02,
        Arrows: !!Vz.Arrows,
        ArrowSpacing: Vz.ArrowSpacing || 42,
        ArrowWeight: 1,
        Tracers: !!Vz.Tracers,
        TracerCount: Vz.TracerCount || 160,
        ShowSources: !!Vz.ShowInfluence,
        ShowLabels: !!Vz.Labels,
        ShowLegend: !!Vz.ShowLegend !== false,
        ShowScaleBar: false,
        SliceHeight: Vz.SliceHeight ?? 1.5,
        Sources: DescribeSources(),
        ProbePoint: Scene.ProbeEnabled ? [Scene.Probe[0], Scene.Probe[2]] : null,
        Minimap: Scene.Overlay.Minimap ? document.getElementById('MinimapCanvas') : null
    });
}

function RenderAnemometerPin(Camera, Canvas)
{
    if (!Scene.ProbeEnabled || !Camera || !Canvas) return;
    const CssW = Canvas.clientWidth || Canvas.width, CssH = Canvas.clientHeight || Canvas.height;
    if (CssW < 8 || CssH < 8) return;
    const Head = ProjectWorldToCss(Camera.ViewProjection, Scene.Probe[0], Scene.Probe[1] + 0.04, Scene.Probe[2], CssW, CssH);
    if (!Head) return;

    const RatioX = Canvas.width / CssW, RatioY = Canvas.height / CssH;
    const Ctx = Canvas.getContext('2d');
    const Prep = Scene.PreparedField || FC().Prepare(Scene.FieldScene, Scene.Time);
    const All = FC().EvaluateAllPrepared(Scene.FieldScene, Prep, Scene.Probe[0], Scene.Probe[1], Scene.Probe[2], 0.5, Scene.FieldScene.Visualization.Solo, 'Particles');
    const Active = Scene.AnemometerDragging || Scene.AnemometerHover || Scene.AnemometerPlacing;

    Ctx.save();
    Ctx.setTransform(RatioX, 0, 0, RatioY, 0, 0);
    Ctx.shadowBlur = 0;

    if (Active)
    {
        Ctx.beginPath();
        Ctx.arc(Head.X, Head.Y, 16, 0, Math.PI * 2);
        Ctx.strokeStyle = 'rgba(180, 245, 218, 0.78)';
        Ctx.lineWidth = 1.4;
        Ctx.stroke();
    }

    // Precision callout badge offset cleanly from the 3D cup-anemometer head
    const Bearing = Wrap360(Math.atan2(All.Velocity[0], -All.Velocity[2]) * 180 / Math.PI);
    const Label = `${All.FlowMag.toFixed(1)} m/s · ${C.ResolveCompassPoint(Bearing)} · ${Scene.Probe[1].toFixed(1)}m`;
    Ctx.font = '500 10.5px "DM Sans", sans-serif';
    const Tw = Ctx.measureText(Label).width;
    const Px = Math.min(CssW - Tw - 20, Math.max(8, Head.X + 20));
    const Py = Math.max(12, Math.min(CssH - 28, Head.Y - 26));

    Ctx.strokeStyle = Active ? 'rgba(180, 245, 218, 0.7)' : 'rgba(146, 216, 194, 0.42)';
    Ctx.lineWidth = 1.0;
    Ctx.beginPath();
    Ctx.moveTo(Head.X + 4, Head.Y - 4);
    Ctx.lineTo(Px, Py + 10.5);
    Ctx.stroke();

    Ctx.fillStyle = 'rgba(13, 17, 22, 0.84)';
    Ctx.strokeStyle = Active ? 'rgba(150, 222, 192, 0.68)' : 'rgba(146, 216, 194, 0.32)';
    Ctx.lineWidth = 1;
    Ctx.beginPath();
    if (Ctx.roundRect) Ctx.roundRect(Px, Py, Tw + 14, 21, 999);
    else Ctx.rect(Px, Py, Tw + 14, 21);
    Ctx.fill();
    Ctx.stroke();
    Ctx.fillStyle = '#e8f5ef';
    Ctx.fillText(Label, Px + 7, Py + 14);
    Ctx.restore();
}

function RenderSourceDebugMarkers(Camera, Canvas)
{
    if (!Camera || !Canvas) return;
    const CssW = Canvas.clientWidth || Canvas.width, CssH = Canvas.clientHeight || Canvas.height;
    if (CssW < 8 || CssH < 8) return;
    const Solo = Scene.FieldScene.Visualization.Solo;
    const PoleSources = Scene.FieldScene.Sources.filter(S => S.Enabled && (!Solo || S.Token === Solo) && (S.Type === 'Attractor' || S.Type === 'Repulsor' || S.Type === 'Gravity' || S.Type === 'Blast'));
    if (!PoleSources.length) return;

    const RatioX = Canvas.width / CssW, RatioY = Canvas.height / CssH;
    const Ctx = Canvas.getContext('2d');
    Ctx.save();
    Ctx.setTransform(RatioX, 0, 0, RatioY, 0, 0);
    Ctx.shadowBlur = 0;

    for (const Src of PoleSources)
    {
        const P = Src.Centre;
        const Pt = ProjectWorldToCss(Camera.ViewProjection, P[0], P[1], P[2], CssW, CssH);
        if (!Pt || Pt.X < -24 || Pt.X > CssW + 24 || Pt.Y < -24 || Pt.Y > CssH + 24) continue;
        const IsPlus = Src.Type === 'Repulsor' || Src.Type === 'Blast';
        const SelectedSrc = Selected === ('src:' + Src.Token);
        const R = SelectedSrc ? 13 : 11;

        Ctx.beginPath();
        Ctx.arc(Pt.X, Pt.Y, R, 0, Math.PI * 2);
        Ctx.fillStyle = SelectedSrc ? 'rgba(18, 24, 30, 0.92)' : 'rgba(14, 19, 24, 0.84)';
        Ctx.fill();

        Ctx.lineWidth = SelectedSrc ? 2.0 : 1.5;
        Ctx.strokeStyle = SelectedSrc
            ? '#f5c45a'
            : (IsPlus ? 'rgba(242, 134, 96, 0.92)' : 'rgba(120, 210, 198, 0.92)');
        Ctx.stroke();

        // Crisp + (outward Repulsor/Blast) or − (inward Attractor/Gravity) sign
        const Bar = R * 0.48;
        Ctx.strokeStyle = '#f3f7fa';
        Ctx.lineWidth = 2.0;
        Ctx.lineCap = 'round';
        Ctx.beginPath();
        Ctx.moveTo(Pt.X - Bar, Pt.Y);
        Ctx.lineTo(Pt.X + Bar, Pt.Y);
        if (IsPlus)
        {
            Ctx.moveTo(Pt.X, Pt.Y - Bar);
            Ctx.lineTo(Pt.X, Pt.Y + Bar);
        }
        Ctx.stroke();
    }
    Ctx.restore();
}

let DragSwatch = null;

function RenderVehicleOverlayEffects(Camera, Canvas)
{
    const Veh = Scene.Vehicle;
    if (!Veh || !Camera || !Canvas) return;
    const CssW = Canvas.clientWidth || Canvas.width, CssH = Canvas.clientHeight || Canvas.height;
    if (CssW < 8 || CssH < 8) return;
    const RatioX = Canvas.width / CssW, RatioY = Canvas.height / CssH;
    const Ctx = Canvas.getContext('2d');
    Ctx.save();
    Ctx.setTransform(RatioX, 0, 0, RatioY, 0, 0);

    // 1. LiDAR Corner Brackets when X-Ray Scan Sweep is active
    if (Veh.Enabled && Veh.Mode === 'scan' && Veh.HoloFade > 0.05)
    {
        const A = Clamp(0.55 * Veh.HoloFade, 0, 0.72);
        const Pad = 18, Len = 18;
        Ctx.strokeStyle = `rgba(82, 220, 255, ${A.toFixed(3)})`;
        Ctx.lineWidth = 1.6;
        const Corners = [
            [Pad, Pad, 1, 1],
            [CssW - Pad, Pad, -1, 1],
            [Pad, CssH - Pad, 1, -1],
            [CssW - Pad, CssH - Pad, -1, -1]
        ];
        Ctx.beginPath();
        for (const [X, Y, Sx, Sy] of Corners)
        {
            Ctx.moveTo(X + Sx * Len, Y); Ctx.lineTo(X, Y); Ctx.lineTo(X, Y + Sy * Len);
        }
        Ctx.stroke();
    }

    // 2. Interactive Drag-and-Drop 3D Surface Reticle when dragging a Paint or Rim swatch over ControlVehicle
    if (DragSwatch)
    {
        const Hit = DragSwatch.hit;
        const Pt = Hit ? ProjectWorldToCss(Camera.ViewProjection, Hit.point[0], Hit.point[1], Hit.point[2], CssW, CssH) : null;
        if (Pt)
        {
            const ColourHex = DragSwatch.opt?.hex || '#52dcff';
            Ctx.strokeStyle = ColourHex;
            Ctx.lineWidth = 2.2;
            Ctx.beginPath();
            Ctx.arc(Pt.X, Pt.Y, 17, 0, Math.PI * 2);
            Ctx.stroke();

            Ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            Ctx.lineWidth = 1.2;
            Ctx.beginPath();
            Ctx.arc(Pt.X, Pt.Y, 10, 0, Math.PI * 2);
            Ctx.moveTo(Pt.X - 22, Pt.Y); Ctx.lineTo(Pt.X - 13, Pt.Y);
            Ctx.moveTo(Pt.X + 13, Pt.Y); Ctx.lineTo(Pt.X + 22, Pt.Y);
            Ctx.moveTo(Pt.X, Pt.Y - 22); Ctx.lineTo(Pt.X, Pt.Y - 13);
            Ctx.moveTo(Pt.X, Pt.Y + 13); Ctx.lineTo(Pt.X, Pt.Y + 22);
            Ctx.stroke();

            const Tag = DragSwatch.kind === 'rim'
                ? `Drop ${DragSwatch.opt.name} · Rim Ripple`
                : `Drop ${DragSwatch.opt.name} · Paint Ripple`;
            Ctx.font = '500 10.5px "DM Sans", sans-serif';
            const Tw = Ctx.measureText(Tag).width;
            const Bx = Clamp(Pt.X + 20, 10, CssW - Tw - 24);
            const By = Clamp(Pt.Y - 26, 12, CssH - 30);
            Ctx.fillStyle = 'rgba(11, 15, 21, 0.88)';
            Ctx.strokeStyle = 'rgba(82, 220, 255, 0.55)';
            Ctx.beginPath();
            if (Ctx.roundRect) Ctx.roundRect(Bx, By, Tw + 14, 21, 999);
            else Ctx.rect(Bx, By, Tw + 14, 21);
            Ctx.fill();
            Ctx.stroke();
            Ctx.fillStyle = '#edf8ff';
            Ctx.fillText(Tag, Bx + 7, By + 14);
        }
    }

    Ctx.restore();
}

function RenderOverlay(Camera)
{
    Scene.LastCamera = Camera;
    const Overlay = Scene.Overlay;
    const Canvas = document.getElementById('OverlayCanvas');
    document.getElementById('MinimapInset').classList.toggle('shown', Overlay.Enabled && Overlay.Minimap);
    const HasVehHud = !!(Scene.Vehicle?.Enabled && (Scene.Vehicle.Mode === 'scan' || Scene.Vehicle.HoloFade > 0.05 || DragSwatch));
    const HasMarkers = HasVehHud || Scene.ProbeEnabled || Scene.FieldScene.Sources.some(S => S.Enabled && (S.Type === 'Attractor' || S.Type === 'Repulsor' || S.Type === 'Gravity' || S.Type === 'Blast'));
    if (!Overlay.Enabled || !Visualization)
    {
        if (HasMarkers || Canvas.dataset.cleared !== 'yes')
        {
            const Ctx = Canvas.getContext('2d');
            Ctx.setTransform(1, 0, 0, 1, 0, 0);
            Ctx.clearRect(0, 0, Canvas.width, Canvas.height);
            Canvas.dataset.cleared = HasMarkers ? '' : 'yes';
        }
    }
    else
    {
        Canvas.dataset.cleared = '';
        Visualization.View.ViewProjection = Camera.ViewProjection;
        SyncOverlayOptions();
        Visualization.Render(Scene.Time);
    }

    RenderSourceDebugMarkers(Camera, Canvas);
    RenderAnemometerPin(Camera, Canvas);
    RenderVehicleOverlayEffects(Camera, Canvas);

    if (InspectorViz && InspectorDebugCanvas && document.body.contains(InspectorDebugCanvas))
        RenderInspectorViz();
}

function RenderInspectorViz()
{
    if (!InspectorViz) return;
    const Vz = Scene.FieldScene.Visualization;
    const Src = SourceByToken(Selected);
    const Meta = Src ? FC().TypeById[Src.Type] : null;
    const Cont = Meta ? Meta.Contribution : Scene.Overlay.Contribution;
    InspectorViz.Configure({
        Contribution: Cont,
        Quantity: Vz.Quantity || 'Speed',
        Heatmap: !!Vz.Heatmap,
        HeatmapStyle: 'Smooth',
        Opacity: 0.85,
        FlowLines: true,
        FlowLineSpacing: 28,
        FlowLineLength: 18,
        FlowLinePulse: false,
        QuietCutoff: 0.02,
        Arrows: true,
        ArrowSpacing: 28,
        ArrowWeight: 1,
        Tracers: !!Vz.Tracers,
        TracerCount: 90,
        ShowSources: true,
        ShowLabels: false,
        ShowLegend: false,
        ShowScaleBar: true,
        ShowGroundGrid: true,
        SliceHeight: Src ? Math.max(0.1, Src.Centre[1] + (Src.Reach === 'Sphere' ? 0 : Math.min(1.0, (Src.Height || 2) * 0.45))) : (Vz.SliceHeight ?? 1.5),
        Extent: { MinimumX: Domain.Minimum[0], MinimumZ: Domain.Minimum[2], MaximumX: Domain.Minimum[0] + Domain.Size[0], MaximumZ: Domain.Minimum[2] + Domain.Size[2] },
        Sources: DescribeSources(),
        ProbePoint: Scene.ProbeEnabled ? [Scene.Probe[0], Scene.Probe[2]] : null
    });
    InspectorViz.Invalidate();
    InspectorViz.Render(Scene.Time);
}

//------------------------------------------------------------------------------------------------------------------------
//                                               LOG STREAM DRAWER
//------------------------------------------------------------------------------------------------------------------------

function AppendLog(Channel, Message, Detail, Tone = 'live')
{
    const D = new Date();
    const Time = [D.getHours(), D.getMinutes(), D.getSeconds()].map(N => String(N).padStart(2, '0')).join(':');
    LogEntries.unshift({ Time, Channel, Message, Detail, Tone });
    if (LogEntries.length > 80) LogEntries.length = 80;
    const Badge = document.getElementById('nav-log-count');
    if (Badge) Badge.textContent = String(LogEntries.length);
    RefreshLogDrawer();
}

function RefreshLogDrawer()
{
    const Head = document.getElementById('LogHead');
    const Content = document.getElementById('LogContent');
    if (!Head || !Content) return;
    Head.textContent = '';
    for (const Ch of ['All', 'STAGE', 'PARTICLES', 'FORCES', 'WIND', 'LIGHTNING', 'VIEW'])
    {
        const Btn = C.Construct('button', 'log-pill' + (LogChannel === Ch ? ' active' : ''), Ch === 'All' ? `All (${LogEntries.length})` : Ch);
        Btn.type = 'button';
        Btn.addEventListener('click', () => { LogChannel = Ch; RefreshLogDrawer(); });
        Head.append(Btn);
    }
    Content.textContent = '';
    const Filtered = LogEntries.filter(E => LogChannel === 'All' || E.Channel === LogChannel);
    for (const E of Filtered.slice(0, 40))
    {
        Content.append(C.Construct('div', 'log-row', [
            C.Construct('span', 'log-time tabular', E.Time),
            C.Construct('span', 'log-chan ' + (E.Tone || ''), E.Channel),
            C.Construct('span', null, E.Detail ? `${E.Message} — ${E.Detail}` : E.Message)
        ]));
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                              SLANTED SCENE TABS & HEADER
//------------------------------------------------------------------------------------------------------------------------

function ConstructSceneTabs()
{
    const Host = document.getElementById('scene-tabs');
    Host.textContent = '';
    for (const TabDef of SceneTabs)
    {
        const Btn = C.Construct('button', 'document-tab' + (Scene.ActiveTab === TabDef.Id ? ' active' : ''), [
            C.Construct('span', 'document-label', TabDef.Name)
        ]);
        Btn.type = 'button';
        Btn.addEventListener('click', () => LoadSceneTab(TabDef));
        Host.append(Btn);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                         OUTLINER + EMBEDDED PRESET LIBRARY
//------------------------------------------------------------------------------------------------------------------------

function SourceMetaSummary(Src)
{
    const Info = FC().TypeById[Src.Type];
    const Unit = ContributionUnits[Info.Contribution];
    const Reach = Src.Reach === 'Box'
        ? `${Src.HalfX.toFixed(1)}×${Src.HalfZ.toFixed(1)}m`
        : `${Src.Radius.toFixed(1)} m`;
    const Mode = Src.UseFormula ? 'fx(Formula)' : `${Math.abs(Src.Strength).toFixed(1)} ${Unit}`;
    return `${Info.Name} · ${Mode} · ${Reach}`;
}

function ComputeCameraOptics(Cam)
{
    const Focal = Math.max(8, Cam?.Focal || 29);
    const SensorW = Math.max(12, Cam?.SensorWidth || 36);
    const Aspect = 16 / 9;
    const F = Math.max(1.2, Cam?.Aperture || 2.8);
    const Focus = Math.max(0.5, Cam?.SubjectDistance || 12);
    const H = (Focal * Focal) / (F * 0.03) + Focal;
    const S = Focus * 1000;
    const Rad = Math.PI / 180;
    const Hfov = (2 * Math.atan(SensorW / (2 * Focal))) / Rad;
    const Vfov = (2 * Math.atan((SensorW / Aspect) / (2 * Focal))) / Rad;
    return {
        horizontalFov: Hfov,
        verticalFov: Vfov,
        pupil: Focal / F,
        near: (H * S) / (H + S - Focal) / 1000,
        far: H - (S - Focal) > 0 ? (H * S) / (H - S + Focal) / 1000 : Infinity,
        hyperfocal: H / 1000,
        frameWidth: (Focus * SensorW) / Focal,
        frameHeight: (Focus * SensorW) / Aspect / Focal,
        aspect: Aspect
    };
}

function CountActiveCameraFX()
{
    const Cmp = Scene.CameraComponents;
    let N = 0;
    if (Cmp.Exposure.Enabled && (Math.abs(Cmp.Exposure.EV) > 0.01 || Math.abs(Cmp.Exposure.Contrast - 1) > 0.01 || Math.abs(Cmp.Exposure.Saturation - 1) > 0.01 || Cmp.Exposure.Bloom > 0.005 || Cmp.Exposure.Vignette > 0.005)) N++;
    if (Cmp.Heat.Enabled && (DetectHeatSources().length > 0 || Cmp.Heat.HorizonMirage)) N++;
    if (Cmp.BlackHole.Enabled && DetectBlackHoleSources().length > 0) N++;
    if (Cmp.Glitch.Enabled && (DetectGlitchSources().length > 0 || Cmp.Glitch.FullFrame)) N++;
    return N;
}

function ConstructOutliner()
{
    if (OutlinerScope) C.ReleaseScope(OutlinerScope);
    OutlinerScope = C.OpenScope();
    const Content = document.getElementById('OutlinerContent');
    Content.textContent = '';

    const MakeGroup = (Title, Count) => C.Construct('div', 'tree-group', [
        C.Construct('div', 'tree-group-title', [C.ConstructGlyph('Chevron'), C.Construct('span', null, Title), C.Construct('span', 'group-count tabular', String(Count))])
    ]);

    const AddRow = (Host, Row) =>
    {
        const El = C.Construct('div', 'tree-row' + (Row.Depth ? ' nested' : '') + (Row.ExtraClass ? ` ${Row.ExtraClass}` : ''));
        El.style.setProperty('--row-accent', Row.Colour());
        const GlyphBox = C.Construct('div', 'row-glyph', C.ConstructGlyph(Row.Glyph));
        const NameEl = C.Construct('div', 'row-name', Row.Name());
        const MetaEl = C.Construct('div', 'row-meta', Row.Meta());
        const Btn = C.Construct('button', 'row-select', [GlyphBox, C.Construct('div', 'row-copy', [NameEl, MetaEl])]);
        Btn.type = 'button';
        Btn.addEventListener('click', () => SelectNode(Row.Id));

        const StatusEl = Row.Status ? C.Construct('span', 'row-status') : null;
        const Dot = C.Construct('span', 'row-state-dot');
        const EyeBtn = C.Construct('button', 'row-eye' + (Row.Locked ? ' locked' : ''), C.ConstructGlyph('Eye'));
        EyeBtn.type = 'button';
        EyeBtn.title = Row.Locked ? 'Permanent scene camera (cannot be hidden or deleted)' : 'Toggle visibility / active';
        EyeBtn.addEventListener('click', Ev => { Ev.stopPropagation(); Row.Flip(); C.Broadcast(); });

        El.append(Btn);
        if (StatusEl) El.append(StatusEl);
        El.append(Dot, EyeBtn);
        Host.append(El);

        C.Register(() =>
        {
            const On = Row.Enabled();
            El.classList.toggle('selected', Selected === Row.Id);
            El.classList.toggle('is-off', !On);
            Dot.classList.toggle('live', On);
            NameEl.textContent = Row.Name();
            MetaEl.textContent = Row.Meta();
            if (StatusEl && Row.Status)
            {
                const St = Row.Status();
                StatusEl.textContent = StatusText[St] || 'off';
                StatusEl.className = 'row-status ' + (StatusText[St] || 'off');
            }
            EyeBtn.textContent = '';
            if (Row.Locked) EyeBtn.append(C.ConstructGlyph('Eye'), C.ConstructGlyph('Lock'));
            else EyeBtn.append(C.ConstructGlyph(On ? 'Eye' : 'EyeOff'));
            const Match = !OutlinerQuery || `${Row.Name()} ${Row.Meta()}`.toLowerCase().includes(OutlinerQuery);
            El.hidden = !Match;
        });
    };

    const Sources = Scene.FieldScene.Sources;
    const FlowSources = Sources.filter(S => FC().TypeById[S.Type]?.Contribution === 'Flow');
    const ZoneSources = Sources.filter(S => FC().TypeById[S.Type]?.Contribution !== 'Flow');
    const TotalCount = Scene.Effects.length + Sources.length + 9;
    document.getElementById('outliner-subtitle').textContent = `Particle & force scene · ${TotalCount} nodes`;

    if (OutlinerFilter === 'all' || OutlinerFilter === 'vehicle')
    {
        const VehGroup = MakeGroup('Stage & Vehicle', 1);
        AddRow(VehGroup, {
            Id: 'Vehicle',
            Name: () => 'ControlVehicle · Coupe',
            Glyph: 'Car',
            Colour: () => Scene.Vehicle?.PaintOpt?.hex || '#c5d41a',
            Depth: 0,
            Meta: () =>
            {
                const V = Scene.Vehicle;
                if (!V) return 'ControlVehicle';
                const M = INSPECTION_MODES.find(X => X.id === V.Mode)?.label || 'Solid';
                const Fin = V.Matte ? 'Matte' : 'Gloss';
                return `${M} · ${V.PaintOpt.name} (${Fin}) · ${V.RimOpt.name}`;
            },
            Enabled: () => !!Scene.Vehicle?.Enabled,
            Flip: () =>
            {
                Scene.Vehicle.Enabled = !Scene.Vehicle.Enabled;
                SyncVehicleHmiDock();
                AppendLog('STAGE', `ControlVehicle ${Scene.Vehicle.Enabled ? 'shown' : 'hidden'}`, null, 'live');
            }
        });
        Content.append(VehGroup);
    }

    if (OutlinerFilter === 'all' || OutlinerFilter === 'camera')
    {
        const CamGroup = MakeGroup('Cameras', 5);
        AddRow(CamGroup, {
            Id: 'Camera',
            Name: () => 'Editor Camera',
            Glyph: 'Camera',
            Colour: () => '#b9a5cd',
            Depth: 0,
            Locked: true,
            Meta: () =>
            {
                const Cam = Scene.Camera;
                const Opt = ComputeCameraOptics(Cam);
                return `${Cam.Focal.toFixed(0)}mm · f/${Cam.Aperture.toFixed(1)} · ${Opt.horizontalFov.toFixed(0)}° FOV`;
            },
            Enabled: () => true,
            Flip: () => C.Toast('Editor Camera is permanent and always active')
        });

        const Cmp = Scene.CameraComponents;
        AddRow(CamGroup, {
            Id: 'Camera:Exposure',
            Name: () => 'Exposure',
            Glyph: 'Exposure',
            Colour: () => '#e2d0b4',
            Depth: 1,
            ExtraClass: 'cam-comp',
            Meta: () => Cmp.Exposure.Enabled
                ? `Post Process · ${Cmp.Exposure.EV >= 0 ? '+' : ''}${Cmp.Exposure.EV.toFixed(1)} EV · Sat ${Cmp.Exposure.Saturation.toFixed(1)}`
                : 'Exposure disabled',
            Enabled: () => Cmp.Exposure.Enabled,
            Flip: () => { Cmp.Exposure.Enabled = !Cmp.Exposure.Enabled; AppendLog('VIEW', `Exposure ${Cmp.Exposure.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
        });
        AddRow(CamGroup, {
            Id: 'Camera:Heat',
            Name: () => 'Heat Distortion',
            Glyph: 'HeatLens',
            Colour: () => '#f5a65b',
            Depth: 1,
            ExtraClass: 'cam-comp',
            Meta: () =>
            {
                if (!Cmp.Heat.Enabled) return 'Heat distortion off';
                const N = DetectHeatSources().length;
                return N ? `Active · ${N} heat emitter${N > 1 ? 's' : ''}` : 'Enabled · no heat in viewport';
            },
            Enabled: () => Cmp.Heat.Enabled,
            Flip: () => { Cmp.Heat.Enabled = !Cmp.Heat.Enabled; AppendLog('VIEW', `Heat Distortion ${Cmp.Heat.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
        });
        AddRow(CamGroup, {
            Id: 'Camera:BlackHole',
            Name: () => 'Black Hole',
            Glyph: 'BlackHoleLens',
            Colour: () => '#f5b855',
            Depth: 1,
            ExtraClass: 'cam-comp',
            Meta: () =>
            {
                if (!Cmp.BlackHole.Enabled) return 'Black hole lens off';
                const N = DetectBlackHoleSources().length;
                return N ? `Active · ${N} singularity` : 'Enabled · no black hole in viewport';
            },
            Enabled: () => Cmp.BlackHole.Enabled,
            Flip: () => { Cmp.BlackHole.Enabled = !Cmp.BlackHole.Enabled; AppendLog('VIEW', `Black Hole Distortion ${Cmp.BlackHole.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
        });
        AddRow(CamGroup, {
            Id: 'Camera:Glitch',
            Name: () => 'Glitch',
            Glyph: 'GlitchLens',
            Colour: () => '#72e8cf',
            Depth: 1,
            ExtraClass: 'cam-comp',
            Meta: () =>
            {
                if (!Cmp.Glitch.Enabled) return 'Glitch off';
                const N = DetectGlitchSources().length;
                return N ? `Active · ${N} glitch emitter${N > 1 ? 's' : ''}` : (Cmp.Glitch.FullFrame ? 'Full-frame glitch active' : 'Enabled · no glitch in viewport');
            },
            Enabled: () => Cmp.Glitch.Enabled,
            Flip: () => { Cmp.Glitch.Enabled = !Cmp.Glitch.Enabled; AppendLog('VIEW', `Glitch ${Cmp.Glitch.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
        });
        Content.append(CamGroup);
    }

    if (OutlinerFilter === 'all' || OutlinerFilter === 'forces' || OutlinerFilter === 'lightning')
    {
        const EnvGroup = MakeGroup('Environment', Sources.length + 3);
        if (OutlinerFilter === 'all' || OutlinerFilter === 'forces')
        {
            AddRow(EnvGroup, {
                Id: 'Field', Name: () => 'Force Field', Glyph: 'Field', Colour: () => '#8fd3c4', Depth: 0,
                Meta: () => `${Sources.length} bounded forces · ${Scene.Overlay.Enabled ? Scene.Overlay.Contribution : 'overlay off'}`,
                Enabled: () => Scene.Overlay.Enabled,
                Flip: () => { Scene.Overlay.Enabled = !Scene.Overlay.Enabled; AppendLog('VIEW', `Field overlay ${Scene.Overlay.Enabled ? 'on' : 'off'}`, null, 'live'); }
            });
            AddRow(EnvGroup, {
                Id: 'Wind', Name: () => 'Ambient Wind', Glyph: 'Wind', Colour: () => '#9fc7e8', Depth: 1,
                Meta: () =>
                {
                    const W = Scene.FieldScene.Wind;
                    return W.Enabled ? `${W.Speed.toFixed(1)} m/s at ${Math.round(W.Bearing)}° (${FC().ResolveBeaufort(W.Speed).Name})` : 'Ambient wind off';
                },
                Enabled: () => Scene.FieldScene.Wind.Enabled,
                Flip: () => { Scene.FieldScene.Wind.Enabled = !Scene.FieldScene.Wind.Enabled; AppendLog('WIND', `Ambient wind ${Scene.FieldScene.Wind.Enabled ? 'on' : 'off'}`, null, 'live'); }
            });

            if (FlowSources.length)
            {
                EnvGroup.append(C.Construct('div', 'outliner-subgroup', `Wind & Flow Generators (${FlowSources.length})`));
                for (const S of FlowSources)
                {
                    const Info = FC().TypeById[S.Type];
                    AddRow(EnvGroup, {
                        Id: 'src:' + S.Token, Name: () => S.Name, Glyph: Info?.Glyph || 'Wind',
                        Colour: () => Info?.Colour || ContributionColours.Flow, Depth: 1,
                        Meta: () => SourceMetaSummary(S),
                        Status: () => FC().ResolveActivation(S, Scene.Time).Status,
                        Enabled: () => S.Enabled,
                        Flip: () => { S.Enabled = !S.Enabled; AppendLog('FORCES', `${S.Name} ${S.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
                    });
                }
            }
            if (ZoneSources.length)
            {
                EnvGroup.append(C.Construct('div', 'outliner-subgroup', `Accelerate & Damp Zones (${ZoneSources.length})`));
                for (const S of ZoneSources)
                {
                    const Info = FC().TypeById[S.Type];
                    AddRow(EnvGroup, {
                        Id: 'src:' + S.Token, Name: () => S.Name, Glyph: Info?.Glyph || 'Target',
                        Colour: () => Info?.Colour || ContributionColours[Info.Contribution], Depth: 1,
                        Meta: () => SourceMetaSummary(S),
                        Status: () => FC().ResolveActivation(S, Scene.Time).Status,
                        Enabled: () => S.Enabled,
                        Flip: () => { S.Enabled = !S.Enabled; AppendLog('FORCES', `${S.Name} ${S.Enabled ? 'enabled' : 'disabled'}`, null, 'live'); }
                    });
                }
            }
        }
        if (OutlinerFilter === 'all' || OutlinerFilter === 'lightning')
        {
            AddRow(EnvGroup, {
                Id: 'Lightning', Name: () => 'Lightning & Storm', Glyph: 'Zap', Colour: () => '#c9b8f0', Depth: 0,
                Meta: () => `${FormatInteger(Scene.Lightning.strikes)} strikes · ${Scene.Lightning.auto ? 'auto' : 'manual'}`,
                Enabled: () => Scene.Lightning.auto,
                Flip: () => { Scene.Lightning.auto = !Scene.Lightning.auto; AppendLog('LIGHTNING', `Auto strikes ${Scene.Lightning.auto ? 'on' : 'off'}`, null, 'live'); }
            });
        }
        Content.append(EnvGroup);
    }

    const VfxCatEntries = (PE.VFX_CATEGORIES || [
        { id: 'Particles', label: 'Particles' },
        { id: 'Spline / Streaks', label: 'Spline / Streaks' },
        { id: 'Transitions', label: 'Transitions & Mesh' },
        { id: 'Physics & Swarms', label: 'Physics & Swarms' },
        { id: 'Optical & Lens', label: 'Optical & Lens' }
    ]).map(V => typeof V === 'string' ? { id: V, label: V } : V);

    const FilterVfxCat = OutlinerFilter.startsWith('vfx:') ? OutlinerFilter.slice(4) : null;
    if (OutlinerFilter === 'all' || OutlinerFilter === 'effects' || FilterVfxCat)
    {
        const CategoryOf = E => PE.vfxCategoryOf ? PE.vfxCategoryOf(PE.presetById(E.PresetId) || { p: E.P }) : 'Particles';
        const SublabelOf = E => PE.vfxSublabelOf ? PE.vfxSublabelOf(PE.presetById(E.PresetId) || { p: E.P }) : (CategoryLabels[E.P.kind] || 'Particles');
        const FilteredEffects = FilterVfxCat ? Scene.Effects.filter(E => CategoryOf(E) === FilterVfxCat) : Scene.Effects;
        const FxTitle = FilterVfxCat ? `VFX · ${(VfxCatEntries.find(C => C.id === FilterVfxCat)?.label || FilterVfxCat)}` : 'Particle Effects';
        const FxGroup = MakeGroup(FxTitle, FilteredEffects.length);

        for (const Cat of VfxCatEntries)
        {
            const CatEffects = FilteredEffects.filter(E => CategoryOf(E) === Cat.id);
            if (!CatEffects.length) continue;
            FxGroup.append(C.Construct('div', 'outliner-subgroup', `${Cat.label} (${CatEffects.length})`));
            for (const Effect of CatEffects)
            {
                const Preset = PE.presetById(Effect.PresetId);
                AddRow(FxGroup, {
                    Id: Effect.Token,
                    Name: () => Effect.Name,
                    Glyph: GlyphForPreset(Preset),
                    Colour: () => DisplayColour(Effect.P.colA),
                    Depth: 1,
                    Meta: () => Effect.P.kind === 7
                        ? `${SublabelOf(Effect)} · ${FibreSummary(Effect)} strands`
                        : `${SublabelOf(Effect)} · ${FormatInteger(Effect.Gpu?.stats_?.alive || 0)} alive`,
                    Enabled: () => Effect.P.visible,
                    Flip: () => { Effect.P.visible = !Effect.P.visible; AppendLog('PARTICLES', `${Effect.Name} ${Effect.P.visible ? 'shown' : 'hidden'}`, null, 'live'); }
                });
            }
        }
        Content.append(FxGroup);
    }

    C.Register(() =>
    {
        const VehVis = Scene.Vehicle?.Enabled ? 1 : 0;
        const Vis = VehVis + Scene.Effects.filter(E => E.P.visible).length + Scene.FieldScene.Sources.filter(S => S.Enabled).length;
        const Tot = 1 + Scene.Effects.length + Scene.FieldScene.Sources.length;
        document.getElementById('visible-count').textContent = String(Vis);
        document.getElementById('hidden-count').textContent = String(Tot - Vis);
        document.getElementById('status-effects').textContent = `${Scene.Effects.length} effects · ${Scene.FieldScene.Sources.length} force sources`;
    });

    C.CloseScope(OutlinerScope);
}

const FibreSummary = Effect => FormatInteger(Effect.P.fibre?.strands || 0);

//------------------------------------------------------------------------------------------------------------------------
//                                       + MENU & MODAL 53-ASSET LIBRARY
//------------------------------------------------------------------------------------------------------------------------

function ConstructAddMenuAssets()
{
    const ListHost = document.getElementById('add-menu-assets');
    const Badge = document.getElementById('nav-preset-total');
    if (Badge) Badge.textContent = String(PE.Presets.length);
    if (!ListHost) return;

    const Q = AddMenuAssetQuery.trim().toLowerCase();
    const CatOf = P => PE.vfxCategoryOf ? PE.vfxCategoryOf(P) : 'Particles';
    const SubOf = P => PE.vfxSublabelOf ? PE.vfxSublabelOf(P) : (CategoryLabels[P.p.kind] || 'Particles');
    const Matches = PE.Presets.filter(P =>
        !Q || `${P.name} ${P.group} ${CatOf(P)} ${SubOf(P)} ${P.blurb || ''}`.toLowerCase().includes(Q)
    );
    ListHost.textContent = '';

    const Cats = (PE.VFX_CATEGORIES || ['Particles', 'Spline / Streaks', 'Transitions', 'Physics & Swarms', 'Optical & Lens'])
        .map(V => typeof V === 'string' ? { id: V, label: V } : V);
    for (const Cat of Cats)
    {
        const Bucket = Matches.filter(P => CatOf(P) === Cat.id);
        if (!Bucket.length) continue;
        ListHost.append(C.Construct('div', 'add-menu-group', [
            C.Construct('span', null, Cat.label),
            C.Construct('small', null, String(Bucket.length))
        ]));
        for (const Preset of Bucket)
        {
            const InScene = Scene.Effects.some(E => E.PresetId === Preset.id);
            const Swatch = C.Construct('span', 'add-menu-asset-swatch');
            Swatch.style.background = `linear-gradient(135deg, ${DisplayColour(Preset.p.colA)}, ${DisplayColour(Preset.p.colB || Preset.p.colA)})`;
            const Btn = C.Construct('button', 'add-menu-asset-btn' + (InScene ? ' in-scene' : ''), [
                Swatch,
                C.Construct('span', 'add-menu-asset-copy', [
                    C.Construct('span', null, Preset.name),
                    C.Construct('small', null, `${SubOf(Preset)} · ${Preset.group}`)
                ]),
                C.Construct('span', 'add-menu-asset-state', InScene ? '✓' : '+')
            ]);
            Btn.type = 'button';
            Btn.title = Preset.blurb || Preset.name;
            Btn.addEventListener('click', () =>
            {
                const Menu = document.getElementById('add-menu');
                if (Menu) Menu.hidden = true;
                document.getElementById('add-button')?.setAttribute('aria-expanded', 'false');
                AddEffect(Preset.id);
            });
            ListHost.append(Btn);
        }
    }
    if (!Matches.length)
        ListHost.append(C.Construct('div', 'add-menu-empty', 'No matching particle assets.'));
}

function OpenFullLibrary()
{
    const Veil = document.getElementById('LibraryVeil');
    const Sheet = document.getElementById('LibrarySheet');
    if (!Veil || !Sheet) return;

    const CatOf = P => PE.vfxCategoryOf ? PE.vfxCategoryOf(P) : 'Particles';
    const SubOf = P => PE.vfxSublabelOf ? PE.vfxSublabelOf(P) : (CategoryLabels[P.p.kind] || 'Particles');
    const CatEntries = (PE.VFX_CATEGORIES || ['Particles', 'Spline / Streaks', 'Transitions', 'Physics & Swarms', 'Optical & Lens'])
        .map(V => typeof V === 'string' ? { id: V, label: V } : V);
    const Groups = [{ id: 'All', label: 'All' }, ...CatEntries];
    if (!Groups.some(G => G.id === ModalGroup)) ModalGroup = 'All';

    const RenderGrid = (GridHost) =>
    {
        const Q = ModalQuery.trim().toLowerCase();
        const Matches = PE.Presets.filter(P =>
            (ModalGroup === 'All' || CatOf(P) === ModalGroup) &&
            (!Q || `${P.name} ${P.group} ${CatOf(P)} ${SubOf(P)} ${P.blurb || ''}`.toLowerCase().includes(Q))
        );
        GridHost.textContent = '';
        for (const Preset of Matches)
        {
            const InScene = Scene.Effects.some(E => E.PresetId === Preset.id);
            const ColA = DisplayColour(Preset.p.colA);
            const ColB = DisplayColour(Preset.p.colB || Preset.p.colA);
            const GlyphEl = C.Construct('div', 'card-glyph', C.ConstructGlyph(GlyphForPreset(Preset)));
            GlyphEl.style.background = `${ColA}22`;
            GlyphEl.style.color = ColA;
            const Swatch = C.Construct('div', 'card-swatch');
            Swatch.style.background = `linear-gradient(90deg, ${ColA}, ${ColB})`;
            const Card = C.Construct('button', 'library-card', [
                C.Construct('div', 'card-top', [
                    GlyphEl,
                    C.Construct('div', null, [
                        C.Construct('div', 'card-name', Preset.name),
                        C.Construct('div', 'card-native', `${CatOf(Preset).toUpperCase()} · ${SubOf(Preset).toUpperCase()} · ${Preset.group.toUpperCase()}`)
                    ])
                ]),
                C.Construct('div', 'card-blurb', Preset.blurb || ''),
                Swatch,
                InScene ? C.Construct('span', 'card-badge', 'In Scene') : null
            ].filter(Boolean));
            Card.type = 'button';
            Card.addEventListener('click', () => { AddEffect(Preset.id); RenderGrid(GridHost); });
            GridHost.append(Card);
        }
    };

    Sheet.textContent = '';
    const CloseBtn = C.Construct('button', 'icon-button', C.ConstructGlyph('Close'));
    CloseBtn.type = 'button';
    CloseBtn.addEventListener('click', () => { Veil.classList.remove('shown'); SyncTopNav(); });

    const SearchInput = document.createElement('input');
    SearchInput.type = 'search';
    SearchInput.placeholder = `Search ${PE.Presets.length} particle & VFX presets…`;
    SearchInput.value = ModalQuery;
    const SearchBox = C.Construct('label', 'search library-search', [C.ConstructGlyph('Search'), SearchInput]);

    const Head = C.Construct('div', 'library-head', [
        C.Construct('h2', null, `Particle & VFX Asset Library · ${PE.Presets.length} Presets`),
        SearchBox,
        CloseBtn
    ]);

    const Tabs = C.Construct('div', 'library-tabs');
    const Grid = C.Construct('div', 'library-grid');

    const RebuildTabs = () =>
    {
        Tabs.textContent = '';
        for (const G of Groups)
        {
            const Count = G.id === 'All' ? PE.Presets.length : PE.Presets.filter(P => CatOf(P) === G.id).length;
            const Tab = C.Construct('button', 'library-tab' + (ModalGroup === G.id ? ' active' : ''), [
                G.label, C.Construct('small', null, String(Count))
            ]);
            Tab.type = 'button';
            Tab.addEventListener('click', () => { ModalGroup = G.id; RebuildTabs(); RenderGrid(Grid); });
            Tabs.append(Tab);
        }
    };

    SearchInput.addEventListener('input', () => { ModalQuery = SearchInput.value; RenderGrid(Grid); });
    RebuildTabs();
    RenderGrid(Grid);
    Sheet.append(Head, Tabs, Grid);

    if (!Veil._BoundBackdrop)
    {
        Veil._BoundBackdrop = true;
        Veil.addEventListener('click', Ev => { if (Ev.target === Veil) { Veil.classList.remove('shown'); SyncTopNav(); } });
    }
    Veil.classList.add('shown');
    SyncTopNav();
    SearchInput.focus();
}

function HandleAssetDeepLink()
{
    const Raw = new URLSearchParams(location.search).get('asset') || '';
    const M = Raw.match(/^particle\/([A-Za-z0-9-]+)$/);
    if (!M) return;
    if (PE.presetById(M[1])) AddEffect(M[1]);
    else AppendLog('PARTICLES', `Asset \u201C${Raw}\u201D is not a particle preset`, null, 'warn');
}

const BindEffect = (Effect, Target, Key, Extra = {}) => ({
    Read: () => Target[Key],
    Write: Value =>
    {
        const Label = Extra.Label || Key;
        Target[Key] = Value;
        PE.Edits.Announce(Label, Value);
        if (Extra.Rebuild) RebuildGpu(Effect);
        AppendLog('PARTICLES', `${Effect.Name}: ${Label}`, String(typeof Value === 'number' ? Number(Value.toFixed(3)) : Value), 'live');
    },
    ...Extra
});

const BindScene = (Target, Key, Extra = {}, Channel = 'PARTICLES', Owner = 'Scene') => ({
    Read: () => Target[Key],
    Write: Value =>
    {
        Target[Key] = Value;
        Visualization?.Invalidate();
        InspectorViz?.Invalidate();
        AppendLog(Channel, `${Owner}: ${Extra.Label || Key}`, String(typeof Value === 'number' ? Number(Value.toFixed(3)) : Value), 'live');
    },
    ...Extra
});

const Range = (Host, Binding, Min, Max, Step, Digits, Unit, Extra) =>
    C.SliderRow(Host, Object.assign(Binding, { Minimum: Min, Maximum: Max, Step, Digits, Unit }, Extra || {}));

function RenderInspectorTabs(Defs)
{
    const Bar = document.getElementById('inspector-tabs');
    Bar.textContent = '';
    if (!Defs || !Defs.length)
    {
        Bar.hidden = true;
        return;
    }
    Bar.hidden = false;
    if (!Defs.some(D => D[0] === InspectorTab)) InspectorTab = Defs[0][0];
    for (const [Id, Label] of Defs)
    {
        const Btn = C.Construct('button', InspectorTab === Id ? 'active' : '', Label);
        Btn.type = 'button';
        Btn.addEventListener('click', () => { InspectorTab = Id; ConstructInspectorPage(); C.Broadcast(); });
        Bar.append(Btn);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                          EMBEDDED INTERACTIVE FORCEFIELDVISUALIZATION INSPECTOR WIDGET
//------------------------------------------------------------------------------------------------------------------------

function MountInspectorVectorPreview(Parent, FocusSource = null)
{
    const Lib = FV();
    if (!Lib) return;
    const Vz = Scene.FieldScene.Visualization;
    const Card = C.Construct('div', 'inspector-debug-viz');
    const Canvas = document.createElement('canvas');
    Canvas.className = 'inspector-debug-canvas';
    const Badge = C.Construct('div', 'inspector-debug-badge', FocusSource
        ? `ForceFieldVisualization · ${FocusSource.Name}`
        : 'ForceFieldVisualization · Chamber Map');

    const Bar = C.Construct('div', 'inspector-debug-bar');
    const MakeChip = (Label, Read, Toggle, ClassName = 'debug-chip') =>
    {
        const Btn = C.Construct('button', ClassName, Label);
        Btn.type = 'button';
        Btn.addEventListener('click', () => { Toggle(); C.Broadcast(); RenderInspectorViz(); });
        Bar.append(Btn);
        C.Register(() => Btn.classList.toggle('active', !!Read()));
        return Btn;
    };

    MakeChip('Flow lines', () => Vz.FlowLines, () => { Vz.FlowLines = !Vz.FlowLines; });
    MakeChip('Arrows', () => Vz.Arrows, () => { Vz.Arrows = !Vz.Arrows; });
    MakeChip('Heatmap', () => Vz.Heatmap, () => { Vz.Heatmap = !Vz.Heatmap; });
    if (FocusSource)
    {
        MakeChip('Solo this source', () => Vz.Solo === FocusSource.Token, () =>
        {
            Vz.Solo = Vz.Solo === FocusSource.Token ? null : FocusSource.Token;
        }, 'debug-chip solo');
    }

    Card.append(Canvas, Badge, Bar);
    Parent.append(Card);

    InspectorDebugCanvas = Canvas;
    InspectorViz = Lib.Create(Canvas, {
        Sample: (Contribution, X, Y, Z, Time, CellSpan, Out) =>
        {
            Out[0] = 0; Out[1] = 0; Out[2] = 0;
            if (FocusSource && Vz.Solo === FocusSource.Token)
            {
                const Prep = FC().Prepare(Scene.FieldScene, Time);
                FC().EvaluatePrepared(Scene.FieldScene, Prep, Contribution, X, Y, Z, CellSpan, Out, FocusSource.Token, 'Particles');
                return true;
            }
            return SampleParticleField(Contribution, X, Y, Z, Time, CellSpan, Out);
        },
        MinimumSpan: 2,
        MaximumSpan: 48,
        OnSourcePick: Token =>
        {
            if (Token && Token.startsWith('src:')) SelectNode(Token, false);
        },
        OnSourceMove: (Token, X, Z) =>
        {
            if (!Token || !Token.startsWith('src:')) return;
            const S = Scene.FieldScene.Sources.find(Item => Item.Token === Token.slice(4));
            if (S) { S.Centre[0] = Clamp(X, -8, 8); S.Centre[2] = Clamp(Z, -8, 8); C.Broadcast(); }
        }
    });
    InspectorViz.View.Mode = 'Map';
    InspectorViz.View.CentreX = FocusSource ? FocusSource.Centre[0] : 0;
    InspectorViz.View.CentreZ = FocusSource ? FocusSource.Centre[2] : 0;
    InspectorViz.View.Span = FocusSource ? Clamp((FocusSource.Radius || 3) * 3.2, 4, 20) : 13;

    // Allow dragging the Anemometer probe dot directly (or Shift+click/drag) on the 2D Inspector Map
    let DragMapAnem = false;
    Canvas.addEventListener('pointerdown', Ev =>
    {
        if (Ev.button !== 0 || !InspectorViz.ScreenToPlane) return;
        const Rect = Canvas.getBoundingClientRect();
        const Pt = InspectorViz.ScreenToPlane(Ev.clientX - Rect.left, Ev.clientY - Rect.top);
        if (!Pt) return;
        const NearProbe = Scene.ProbeEnabled && Math.hypot(Pt[0] - Scene.Probe[0], Pt[1] - Scene.Probe[2]) <= Math.max(0.45, InspectorViz.View.Span * 0.065);
        if (NearProbe || Ev.shiftKey || Scene.AnemometerPlacing)
        {
            Ev.stopImmediatePropagation();
            Ev.preventDefault();
            DragMapAnem = true;
            Scene.ProbeEnabled = true;
            Scene.Probe[0] = Clamp(Pt[0], -6, 6);
            Scene.Probe[2] = Clamp(Pt[1], -6, 6);
            Scene.AnemometerPlacing = false;
            Canvas.setPointerCapture(Ev.pointerId);
            SyncAnemometerToolState();
            RefreshLive();
            RenderInspectorViz();
            C.Broadcast();
        }
    }, true);
    Canvas.addEventListener('pointermove', Ev =>
    {
        if (!DragMapAnem || !InspectorViz.ScreenToPlane) return;
        Ev.stopImmediatePropagation();
        const Rect = Canvas.getBoundingClientRect();
        const Pt = InspectorViz.ScreenToPlane(Ev.clientX - Rect.left, Ev.clientY - Rect.top);
        if (!Pt) return;
        Scene.Probe[0] = Clamp(Pt[0], -6, 6);
        Scene.Probe[2] = Clamp(Pt[1], -6, 6);
        RefreshLive();
        RenderInspectorViz();
        C.Broadcast();
    }, true);
    const EndMapAnem = Ev =>
    {
        if (!DragMapAnem) return;
        Ev.stopImmediatePropagation();
        DragMapAnem = false;
        AppendLog('WIND', 'Anemometer moved via Chamber Map', `(${Scene.Probe.map(V => V.toFixed(1)).join(', ')}) m`, 'live');
    };
    Canvas.addEventListener('pointerup', EndMapAnem, true);
    Canvas.addEventListener('pointercancel', EndMapAnem, true);

    InspectorViz.AttachNavigation?.();
    RenderInspectorViz();
}

//------------------------------------------------------------------------------------------------------------------------
//                                              EFFECT INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

function ConstructEffectInspector(Page, Effect)
{
    const P = Effect.P;
    const Preset = PE.presetById(Effect.PresetId);
    const Molecular = P.kind === 3 || P.kind === 4, Fibre = P.kind === 7;
    PE.Edits.For(Effect);

    const TabDefs = [
        ['overview', 'Overview'],
        ['source', Fibre ? 'Form & Path' : 'Source'],
        ['motion', Fibre ? 'Glow & Colour' : 'Motion & FX'],
        ['readback', Fibre ? 'Sparks & Record' : 'Modules & Record']
    ];
    RenderInspectorTabs(TabDefs);

    if (InspectorTab === 'overview')
    {
        const Mark = C.Construct('div', 'mark live', C.ConstructGlyph('Check'));
        const MarkText = C.Construct('span');
        const Metric = C.Construct('div', 'metric-big');
        const Rate = C.Construct('div', 'rate');
        const Low = C.Construct('div', 'low');
        const Card = C.Construct('div', 'hero-card', [
            C.Construct('div', 'hero-top', [
                C.Construct('div', 'budget-chip', [Mark, MarkText]),
                C.Construct('div', 'estimate-tag', Fibre ? 'ANALYTIC FIBRE' : '01 / LIVE SOLVER')
            ]),
            C.Construct('div', 'hero-title', Fibre ? 'Strands rendered' : 'Particles alive'),
            C.Construct('div', 'hero-metrics', [Metric, C.Construct('div', 'metric-side', [Rate, Low])])
        ]);
        Page.append(Card);

        const Series = C.TimeSeries(Card, {
            Samples: Effect.AliveSamples, Capacity: SampleCapacity,
            Target: () => Fibre ? P.fibre.strands : Effect.Gpu.cap, Height: 96, Unit: '',
            TargetLabel: Fibre ? 'Strands' : 'Capacity', TargetDigits: 0, Headroom: 1.12
        });
        LiveRefreshers.push(Series.Refresh);
        LiveRefreshers.push(() =>
        {
            const Alive = Fibre ? P.fibre.strands : (Effect.Gpu?.stats_?.alive ?? 0);
            Metric.textContent = FormatInteger(Alive);
            Rate.textContent = Fibre ? `${P.fibre.loopSeconds.toFixed(0)} s` : Molecular ? 'fill' : `${FormatInteger(P.rate)}`;
            Rate.append(C.Construct('small', null, Fibre ? 'loop' : Molecular ? 'locked' : '/s'));
            Low.textContent = Fibre ? `${FormatInteger(P.fibre.segments)} segs` : `of ${FormatInteger(Effect.Gpu?.cap || P.capacity)} cap`;
            const Full = !Molecular && !Fibre && (Alive / Math.max(1, Effect.Gpu?.cap || 1)) >= 0.98;
            Mark.className = 'mark ' + (!P.visible ? 'warm' : Full ? 'warm' : 'live');
            Mark.textContent = '';
            Mark.append(C.ConstructGlyph(!P.visible ? 'EyeOff' : Full ? 'Alert' : 'Check'));
            MarkText.textContent = !P.visible ? 'Hidden' : !Scene.Playing ? 'Paused' : Full ? 'At capacity' : Molecular ? 'Conservation locked' : Fibre ? 'Analytic curve' : 'Within capacity';
        });

        C.MetricTrio(Page, [
            { Label: 'Shape', Resolve: () => [['Streak', 'Sphere', 'Leaf', 'Glow', 'Cube', 'Coin', 'Bubble', 'Snowflake', 'Hailstone'][P.shape] || 'Strand', P.blend === 'alpha' ? 'alpha blend' : 'additive glow'] },
            { Label: Molecular ? 'Box half' : 'Gravity', Resolve: () => Molecular ? [`${P.boxHalf[0].toFixed(2)} m`, 'container'] : [`${P.gravity.toFixed(2)} g`, `${P.drag.toFixed(2)} drag`] },
            { Label: Fibre ? 'Loop speed' : 'Wind coupling', Highlight: true, Resolve: () => Fibre ? [`${P.fibre.loopSeconds.toFixed(1)} s`, 'analytic phase'] : [`${P.windCoupling.toFixed(2)} /s`, 'lattice coupling'] }
        ]);

        Page.append(C.Construct('div', 'section-subhead', [C.Construct('span', null, 'Quick controls'), C.Construct('span', null, Preset?.group || 'Particles')]));
        const Grid = C.Construct('div', 'property-switches');
        C.ToggleTile(Grid, BindEffect(Effect, P, 'visible', { Label: 'Visible', Glyph: 'Eye' }));
        C.ToggleTile(Grid, {
            Label: 'Wind-driven', Glyph: 'Wind',
            Read: () => Fibre ? (P.fibre.windMix || 0) > 0 : P.windCoupling > 0,
            Write: PE.Edits.Through('Wind coupling', On =>
            {
                if (Fibre) P.fibre.windMix = On ? (Effect.StoredWindMix || 0.7) : (Effect.StoredWindMix = P.fibre.windMix || 0.7, 0);
                else P.windCoupling = On ? (Effect.StoredCoupling || 1) : (Effect.StoredCoupling = P.windCoupling, 0);
            }),
            Availability: () => Molecular ? { Enabled: false, Reason: 'Molecular gas ignores wind' } : { Enabled: true }
        });
        C.ToggleTile(Grid, {
            Label: 'Additive glow', Glyph: 'Sparkles',
            Read: () => P.blend === 'add',
            Write: PE.Edits.Through('Blend', On => { P.blend = On ? 'add' : 'alpha'; }),
            Availability: () => Fibre ? { Enabled: false, Reason: 'Fibres glow analytically' } : { Enabled: true }
        });
        C.ToggleTile(Grid, {
            Label: 'Floor bounce', Glyph: 'Activity',
            Read: () => P.bounce > 0,
            Write: PE.Edits.Through('Bounce', On => { P.bounce = On ? (Effect.StoredBounce || 0.4) : (Effect.StoredBounce = P.bounce, 0); }),
            Availability: () => (Molecular || Fibre) ? { Enabled: false, Reason: 'No floor plane collision' } : { Enabled: true }
        });
        Page.append(Grid);

        C.ActionRow(Page, [
            { Label: 'Burst', Glyph: 'Sparkles', Tone: 'accent', Act: () => { Effect.PendingBurst += P.transition ? Effect.Gpu.cap : Math.max(60, Math.round(Effect.Gpu.cap * 0.4)); }, Availability: () => Fibre ? { Enabled: false, Reason: 'Analytic' } : { Enabled: true } },
            { Label: Molecular ? 'Re-seed' : 'Clear', Glyph: 'Reset', Act: () => RebuildGpu(Effect) },
            { Label: 'Duplicate', Glyph: 'Copy', Act: () => DuplicateEffect(Effect) },
            { Label: 'Delete', Glyph: 'Trash', Tone: 'danger', Act: () => RemoveEffect(Effect) }
        ]);

        if (!Fibre)
        {
            const Opt = C.SectionCard(Page, { Title: 'Emitter cone & spectrum', Glyph: 'Aperture', Badge: '02 / OPTICS', Hint: 'Live launch direction, spread cone angle, speed band and colour ramp.' });
            C.EmitterInstrument(Opt.Inner, Effect, DisplayColour);
            const Ribbon = C.Construct('div', 'gradient-ribbon');
            Opt.Inner.append(Ribbon);
            C.Register(() => { Ribbon.style.background = `linear-gradient(90deg, ${DisplayColour(P.colA)}, ${DisplayColour(P.colC || P.colB)}, ${DisplayColour(P.colB)})`; });
        }
        return;
    }

    if (InspectorTab === 'source')
    {
        if (Fibre) { ConstructFibreFormAndPlacement(Page, Effect); return; }
        const Src = C.SectionCard(Page, {
            Title: 'Emission source', Glyph: 'Target', Badge: '01 / SOURCE',
            Hint: Molecular ? 'Molecular systems fill once at initialization and conserve total count inside the box.' : 'Birth rate, emitter volume geometry and spawn origin.'
        }).Inner;
        const Capacities = [...new Set([384, 512, 1024, 1536, 2048, 4096, 8192, P.capacity])].sort((A, B) => A - B);
        C.SelectRow(Src, BindEffect(Effect, P, 'capacity', { Label: 'Pool capacity', Options: Capacities.map(K => [FormatInteger(K), K]), Rebuild: true }));
        if (!Molecular) Range(Src, BindEffect(Effect, P, 'rate', { Label: 'Spawn rate' }), 0, 2000, 1, 0, '/s');
        const EmitShapeB = BindEffect(Effect, P, 'emitShape', { Label: 'Volume shape', Options: [['Point', 0], ['Sphere volume', 1], ['Disc', 2], ['Box', 3], ['Box surface grid', 4]] });
        const OrigEmitWrite = EmitShapeB.Write;
        EmitShapeB.Write = V => { OrigEmitWrite(V); ConstructInspectorPage(); };
        C.SelectRow(Src, EmitShapeB);
        C.VectorRow(Src, BindEffect(Effect, P, 'origin', { Label: 'Emitter origin', Unit: 'm', Step: 0.05, Digits: 2, Minimum: -20, Maximum: 20 }));
        const EmitSh = Molecular ? 3 : (P.emitShape ?? 0);
        if (EmitSh === 1 || EmitSh === 2)
            Range(Src, BindEffect(Effect, P, 'radius', { Label: 'Emitter radius' }), 0, 8, 0.01, 2, 'm');
        if (EmitSh === 3 || EmitSh === 4)
        {
            if (Molecular)
                Range(Src, Object.assign(BindEffect(Effect, P, 'boxHalf', { Label: 'Box half extent' }), { Read: () => P.boxHalf[0], Write: PE.Edits.Through('Box half', R => { P.boxHalf = [R, R, R]; }) }), 0.2, 4, 0.01, 2, 'm');
            else
                C.VectorRow(Src, BindEffect(Effect, P, 'boxHalf', { Label: 'Box half extents', Unit: 'm', Step: 0.05, Digits: 2, Minimum: 0, Maximum: 10 }));
        }

        const AssembleMode = P.transition?.assemble || 0;
        if (!Molecular && AssembleMode === 0)
        {
            const Vel = C.SectionCard(Page, { Title: 'Launch velocity & lifetime', Glyph: 'Rays', Badge: '02 / KINEMATICS' }).Inner;
            C.VectorRow(Vel, BindEffect(Effect, P, 'dir', { Label: 'Launch direction', Step: 0.01, Digits: 2, Minimum: -1, Maximum: 1 }));
            Range(Vel, BindEffect(Effect, P, 'spread', { Label: 'Cone spread' }), 0, 3.1416, 0.01, 2, 'rad');
            Range(Vel, Object.assign(BindEffect(Effect, P, 'speedMin', { Label: 'Speed minimum' }), { Write: PE.Edits.Through('Speed min', V => { P.speedMin = Math.min(V, P.speedMax); }) }), 0, 20, 0.05, 2, 'm/s');
            Range(Vel, Object.assign(BindEffect(Effect, P, 'speedMax', { Label: 'Speed maximum' }), { Write: PE.Edits.Through('Speed max', V => { P.speedMax = Math.max(V, P.speedMin); }) }), 0, 20, 0.05, 2, 'm/s');
            Range(Vel, Object.assign(BindEffect(Effect, P, 'lifeMin', { Label: 'Life minimum' }), { Write: PE.Edits.Through('Life min', V => { P.lifeMin = Math.min(V, P.lifeMax); }) }), 0.05, 20, 0.05, 2, 's');
            Range(Vel, Object.assign(BindEffect(Effect, P, 'lifeMax', { Label: 'Life maximum' }), { Write: PE.Edits.Through('Life max', V => { P.lifeMax = Math.max(V, P.lifeMin); }) }), 0.05, 20, 0.05, 2, 's');
        }
        else if (!Molecular && AssembleMode > 0)
        {
            const InfoCard = C.SectionCard(Page, { Title: 'Assembly trajectory', Glyph: 'Rays', Badge: '02 / ASSEMBLY' }).Inner;
            InfoCard.append(C.Construct('p', 'property-hint', 'Assembly transition mode places particles on outer/column anchor tracks and ignores cone launch speed. Configure assembly options in Modules & Record.'));
        }
        return;
    }

    if (InspectorTab === 'motion')
    {
        if (Fibre) { ConstructFibreLookAndColour(Page, Effect); return; }
        const Look = C.SectionCard(Page, { Title: 'Particle appearance', Glyph: 'Palette', Badge: '01 / SHADING' }).Inner;
        const Ribbon = C.Construct('div', 'gradient-ribbon');
        Look.append(Ribbon);
        C.Register(() => { Ribbon.style.background = `linear-gradient(90deg, ${DisplayColour(P.colA)}, ${DisplayColour(P.colC || P.colB)}, ${DisplayColour(P.colB)})`; });

        if (!Molecular) C.SelectRow(Look, BindEffect(Effect, P, 'shape', { Label: 'Billboard / mesh shape', Options: [['Streak', 0], ['Sphere', 1], ['Leaf / paper', 2], ['Soft glow', 3], ['Chip cube', 4], ['Coin', 5], ['Bubble', 6], ['Snowflake', 7], ['Hailstone', 8]] }));
        C.SegmentedRow(Look, BindEffect(Effect, P, 'blend', { Label: 'Compositing blend', Options: [['Additive glow', 'add'], ['Alpha · premultiplied', 'alpha']] }));
        if (!Molecular)
        {
            Range(Look, BindEffect(Effect, P, 'sizeStart', { Label: 'Size at birth' }), 0.002, 2, 0.002, 3, 'm');
            Range(Look, BindEffect(Effect, P, 'sizeEnd', { Label: 'Size at death' }), 0.002, 3, 0.002, 3, 'm');
        }
        Range(Look, BindEffect(Effect, P, 'sizeScale', { Label: 'Size multiplier' }), 0.1, 4, 0.02, 2, '×');
        C.ColourRow(Look, BindEffect(Effect, P, 'colA', { Label: Molecular ? 'Species / birth colour A' : 'Birth colour', Alpha: true }));
        C.ColourRow(Look, BindEffect(Effect, P, 'colB', { Label: Molecular ? 'Species / death colour B' : 'Death colour', Alpha: true }));
        if (P.kind === 4) C.ColourRow(Look, BindEffect(Effect, P, 'colC', { Label: 'Reaction product colour C', Alpha: true }));

        if (!Molecular)
        {
            const Mot = C.SectionCard(Page, { Title: 'Forces & motion response', Glyph: 'Wind', Badge: '02 / DYNAMICS' }).Inner;
            Range(Mot, BindEffect(Effect, P, 'windCoupling', { Label: 'Wind lattice coupling' }), 0, 5, 0.02, 2, '1/s');
            Range(Mot, BindEffect(Effect, P, 'drag', { Label: 'Aerodynamic drag' }), 0, 5, 0.02, 2, '1/s');
            Range(Mot, BindEffect(Effect, P, 'gravity', { Label: 'Gravity factor' }), -1, 2, 0.02, 2, 'g');
            Range(Mot, BindEffect(Effect, P, 'buoyancy', { Label: 'Thermal buoyancy' }), -4, 6, 0.05, 2, 'm/s²');
            Range(Mot, BindEffect(Effect, P, 'bounce', {
                Label: 'Floor restitution',
                Availability: () => P.kind === 1 ? { Enabled: false, Reason: 'Wind-driven particles settle cleanly on floor' } : { Enabled: true }
            }), 0, 1, 0.01, 2, '');
            Range(Mot, BindEffect(Effect, P, 'flutter', { Label: 'Flutter turbulence' }), 0, 5, 0.05, 2, 'm/s²');
            if (P.kind === 6)
            {
                const Sw = C.SectionCard(Page, { Title: 'Swarm flocking & pulse', Glyph: 'Sparkles', Badge: '03 / BOIDS' }).Inner;
                Range(Sw, BindEffect(Effect, P, 'swarmRadius', { Label: 'Neighbor flock radius' }), 0.2, 4.0, 0.05, 2, 'm');
                Range(Sw, BindEffect(Effect, P, 'swarmMaxSpeed', { Label: 'Maximum cruise speed' }), 0.2, 10.0, 0.05, 2, 'm/s');
                Range(Sw, BindEffect(Effect, P, 'pulseHz', { Label: 'Glow pulse frequency' }), 0.0, 5.0, 0.05, 2, 'Hz');
                Range(Sw, BindEffect(Effect, P, 'pulseDepth', { Label: 'Glow pulse depth' }), 0.0, 1.0, 0.02, 2, '');
            }
        }
        else
        {
            const Phy = C.SectionCard(Page, { Title: 'Molecular physics', Glyph: 'Atom', Badge: '02 / THERMOSTAT' }).Inner;
            Range(Phy, BindEffect(Effect, P, 'temperature', { Label: 'Temperature kT' }), 0.02, 3, 0.01, 2, 'ε');
            Range(Phy, BindEffect(Effect, P, 'damping', { Label: 'Thermostat γ' }), 0, 10, 0.05, 2, '1/s');
            Range(Phy, BindEffect(Effect, P, 'sigma', { Label: 'Particle diameter σ' }), 0.03, 0.2, 0.002, 3, 'm');
            if (P.kind === 3) Range(Phy, BindEffect(Effect, P, 'epsilon', { Label: 'Well depth ε' }), 0, 1, 0.01, 2, '');
            else
            {
                Range(Phy, BindEffect(Effect, P, 'reactRate', { Label: 'Forward rate A+B→C' }), 0, 30, 0.1, 1, '1/s');
                Range(Phy, BindEffect(Effect, P, 'dissociation', { Label: 'Dissociation C→A+B' }), 0, 5, 0.05, 2, '1/s');
                Range(Phy, BindEffect(Effect, P, 'reactRadius', { Label: 'Reaction bond radius' }), 0.05, 0.45, 0.005, 3, 'm');
                Range(Phy, BindEffect(Effect, P, 'fracA', { Label: 'Initial A fraction', Rebuild: true }), 0.1, 0.9, 0.02, 2, '');
            }
        }
        return;
    }

    if (Fibre) { ConstructFibreSparksAndRecord(Page, Effect); return; }

    if (P.transition)
    {
        const Tr = P.transition;
        if (Tr.burstFrac === undefined) Tr.burstFrac = 1.0;
        if (Tr.assembleRadius === undefined) Tr.assembleRadius = 3.5;
        const Sec = C.SectionCard(Page, { Title: 'Derez / assembly wave', Glyph: 'Boxes', Badge: 'TRANSITION' }).Inner;
        C.SelectRow(Sec, BindEffect(Effect, Tr, 'wave', { Label: 'Release wave pattern', Options: [['Corner (derez)', 'corner'], ['Melt (patchy)', 'melt'], ['Glitch (blocky)', 'glitch']] }));
        const AsmBind = BindEffect(Effect, Tr, 'assemble', { Label: 'Flight mode', Options: [['Burst or fall', 0], ['Rebuild from outside', 1], ['Stack in column', 2]] });
        const OrigAsmWrite = AsmBind.Write;
        AsmBind.Write = V => { OrigAsmWrite(V); ConstructInspectorPage(); };
        C.SelectRow(Sec, AsmBind);
        Range(Sec, BindEffect(Effect, Tr, 'holdBase', { Label: 'Hold duration' }), 0, 10, 0.05, 2, 's');
        Range(Sec, BindEffect(Effect, Tr, 'holdSpread', { Label: 'Wave spread' }), 0, 10, 0.05, 2, 's');
        Range(Sec, BindEffect(Effect, Tr, 'burstFrac', {
            Label: 'Outward burst fraction',
            Availability: () => (Tr.assemble || 0) === 0 ? { Enabled: true } : { Enabled: false, Reason: 'Used in Burst or fall mode' }
        }), 0, 1, 0.02, 2, '');
        Range(Sec, BindEffect(Effect, Tr, 'assembleRadius', {
            Label: 'Assembly spawn radius',
            Availability: () => (Tr.assemble || 0) > 0 ? { Enabled: true } : { Enabled: false, Reason: 'Used in Rebuild / Stack assembly modes' }
        }), 0.5, 10, 0.05, 2, 'm');
        C.SwitchRow(Sec, {
            Label: 'Cube fragment mode',
            Read: () => !!Tr.fragment,
            Write: V => { Tr.fragment = V; PE.Edits.Announce('Fragment', V); }
        });
    }
    if (P.blackHole && P.attractor)
    {
        const BH = P.blackHole, A = P.attractor;
        const Sec = C.SectionCard(Page, { Title: 'Black hole lensing & well', Glyph: 'Planet', Badge: 'RELATIVITY' }).Inner;
        Range(Sec, BindEffect(Effect, BH, 'horizon', { Label: 'Event horizon radius' }), 0.1, 2, 0.01, 2, 'm');
        Range(Sec, BindEffect(Effect, BH, 'einstein', { Label: 'Einstein ring lensing' }), 0, 6, 0.05, 2, '×');
        Range(Sec, BindEffect(Effect, A, 'strength', { Label: 'Gravity pull strength' }), 0, 30, 0.1, 1, 'm/s²');
        Range(Sec, BindEffect(Effect, A, 'swirl', { Label: 'Accretion swirl' }), 0, 12, 0.05, 2, 'm/s²');
        Range(Sec, BindEffect(Effect, A, 'radius', { Label: 'Gravity well reach' }), 1, 24, 0.25, 2, 'm');
        Range(Sec, BindEffect(Effect, A, 'swallow', { Label: 'Event swallow radius' }), 0, 2, 0.02, 2, 'm');
    }
    else if (P.attractor && P.attractor.enabled)
    {
        const A = P.attractor;
        const Sec = C.SectionCard(Page, { Title: 'Attractor gravity well', Glyph: 'Target', Badge: 'ATTRACTOR' }).Inner;
        Range(Sec, BindEffect(Effect, A, 'strength', { Label: 'Pull strength' }), 0, 30, 0.1, 1, 'm/s²');
        Range(Sec, BindEffect(Effect, A, 'swirl', { Label: 'Swirl spin' }), 0, 12, 0.05, 2, 'm/s²');
        Range(Sec, BindEffect(Effect, A, 'radius', { Label: 'Well radius' }), 1, 24, 0.25, 2, 'm');
        Range(Sec, BindEffect(Effect, A, 'swallow', { Label: 'Swallow core radius' }), 0, 2, 0.02, 2, 'm');
    }
    if (P.heatShimmer)
    {
        const Sh = P.heatShimmer;
        const Sec = C.SectionCard(Page, { Title: 'Heat shimmer distortion', Glyph: 'Flame', Badge: 'OPTICAL' }).Inner;
        Range(Sec, BindEffect(Effect, Sh, 'radius', { Label: 'Refraction radius' }), 0.2, 6, 0.05, 2, 'm');
        Range(Sec, BindEffect(Effect, Sh, 'strength', { Label: 'Distortion amplitude' }), 0, 0.05, 0.001, 3, '');
        Range(Sec, BindEffect(Effect, Sh, 'freq', { Label: 'Wave frequency' }), 2, 36, 0.5, 1, 'Hz');
        Range(Sec, BindEffect(Effect, Sh, 'rate', { Label: 'Convection speed' }), 0.2, 5, 0.05, 2, '×');
    }
    if (P.magneticField)
    {
        const M = P.magneticField;
        const Sec = C.SectionCard(Page, { Title: 'Magnetic dipole field', Glyph: 'Magnet', Badge: 'DIPOLE' }).Inner;
        Range(Sec, BindEffect(Effect, M, 'strength', { Label: 'Drive strength' }), 0, 10, 0.05, 2, 'm/s²');
        Range(Sec, BindEffect(Effect, M, 'guide', { Label: 'Field-line guide' }), 0, 12, 0.05, 2, '1/s');
        Range(Sec, BindEffect(Effect, M, 'radius', { Label: 'Dipole field reach' }), 1, 16, 0.1, 1, 'm');
    }

    const Rb = C.SectionCard(Page, { Title: 'Async GPU reduction readback', Glyph: 'Activity', Badge: '32 B MAP' }).Inner;
    const AliveCell = C.Construct('b', null, '0');
    const LatCell = C.Construct('b', null, '—');
    const CountCell = C.Construct('b', null, '0');
    Rb.append(C.Construct('div', 'stat-grid', [
        C.Construct('div', 'stat-cell', [AliveCell, C.Construct('span', null, 'Particles alive')]),
        C.Construct('div', 'stat-cell', [LatCell, C.Construct('span', null, 'Map latency')]),
        C.Construct('div', 'stat-cell', [CountCell, C.Construct('span', null, 'Completed maps')])
    ]));
    const BenchMsg = C.Construct('p', 'property-hint', 'Run an async 80-byte-per-particle full-buffer DMA readback test on the active adapter.');
    Rb.append(BenchMsg);
    C.ActionRow(Rb, [{
        Label: 'Benchmark Full Buffer Readback', Glyph: 'Gauge', Tone: 'accent',
        Act: async () =>
        {
            const M = await Scene.Engine.benchmarkFullReadback(Effect.Gpu);
            BenchMsg.textContent = `${FormatInteger(M.bytes / 1024)} KiB in ${M.ms.toFixed(2)} ms (${M.mbPerSecond.toFixed(0)} MiB/s) · ${FormatInteger(M.alive)} alive.`;
        }
    }]);
    LiveRefreshers.push(() =>
    {
        AliveCell.textContent = FormatInteger(Effect.Gpu?.stats_?.alive ?? 0);
        LatCell.textContent = Effect.Gpu?.readbackMs ? `${Effect.Gpu.readbackMs.toFixed(2)} ms` : '—';
        CountCell.textContent = FormatInteger(Effect.Gpu?.readbackCount ?? 0);
    });

    RenderRecordCard(Page, 'ParticleEffect (.levelspace)', () => EncodeEffect(Effect));
}

function ConstructFibreFormAndPlacement(Page, Effect)
{
    const P = Effect.P, F = P.fibre;
    const Form = C.SectionCard(Page, { Title: 'Particles & streaks curve form', Glyph: 'Zap', Badge: '01 / FORM' }).Inner;
    const ShapeBind = BindEffect(Effect, F, 'shape', {
        Label: 'Curve topology',
        Options: [
            ['Luminous Blossom (flower dome)', 'blossom'],
            ['Prism Silk Stream (curled ribbon)', 'stream'],
            ['Anemone Starburst (tendrils)', 'burst'],
            ['Curl Streamlines (3D vortex)', 'curl'],
            ['Void Core Filaments (radial void)', 'void'],
            ['Streak (Bezier head)', 'streak'],
            ['Ribbon (wave sheet)', 'ribbon'],
            ['Trail (closed path)', 'trail']
        ]
    });
    const OrigShapeWrite = ShapeBind.Write;
    ShapeBind.Write = V => { OrigShapeWrite(V); ConstructInspectorPage(); };
    C.SelectRow(Form, ShapeBind);

    const Topology = F.shape || 'streak';
    Range(Form, BindEffect(Effect, F, 'strands', { Label: 'Strand count' }), 1, 1200, 1, 0, '');
    Range(Form, BindEffect(Effect, F, 'segments', { Label: 'Curve segments' }), 8, 160, 1, 0, '');

    if (Topology === 'blossom')
    {
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Dome radius' }), 0.2, 10, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Cup dome lift' }), 0, 5, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'frequency', { Label: 'Petal lobe count' }), 3, 12, 1, 0, '');
        Range(Form, BindEffect(Effect, F, 'ripple', { Label: 'Curl drift' }), 0, 3, 0.02, 2, '');
        Range(Form, BindEffect(Effect, F, 'waves', { Label: 'Curl frequency' }), 0.2, 3.0, 0.02, 2, '');
    }
    else if (Topology === 'stream')
    {
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Stream length' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Ribbon width' }), 0.1, 6, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Swoop arc' }), 0, 5, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'ripple', { Label: 'Curl ruffle' }), 0, 3, 0.02, 2, '');
        Range(Form, BindEffect(Effect, F, 'phaseSpread', { Label: 'Ribbon twist' }), 0, 4, 0.05, 2, 'rad');
    }
    else if (Topology === 'burst')
    {
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Tendril reach' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Burst cone spread' }), 0.2, 2.8, 0.02, 2, 'rad');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Tendril arc bend' }), 0, 4, 0.02, 2, 'm');
    }
    else if (Topology === 'curl')
    {
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Vortex path reach' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Seed shell radius' }), 0.2, 8, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Vertical spread' }), 0, 5, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'ripple', { Label: 'Curl advection speed' }), 0.25, 3, 0.02, 2, '×');
        Range(Form, BindEffect(Effect, F, 'waves', { Label: 'Vortex spatial frequency' }), 0.2, 3.0, 0.02, 2, '');
    }
    else if (Topology === 'void')
    {
        Range(Form, BindEffect(Effect, F, 'sheetWidth', { Label: 'Inner void core diameter' }), 0.3, 10, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Filament radial length' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Fan tilt spread' }), 0.15, 2.0, 0.02, 2, 'rad');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Harmonic swirl' }), 0, 4, 0.02, 2, 'm');
    }
    else if (Topology === 'ribbon')
    {
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Sheet length' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'sheetWidth', { Label: 'Sheet width' }), 0.3, 12, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'ripple', { Label: 'Wave crest height' }), 0, 3, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'waves', { Label: 'Wave frequency' }), 0.2, 3.0, 0.02, 2, '');
        Range(Form, BindEffect(Effect, F, 'phaseSpread', { Label: 'Across phase shift' }), 0, 4, 0.05, 2, 'rad');
        Range(Form, Object.assign(BindEffect(Effect, F, 'harmonic', { Label: 'Wave speed harmonic' }), { Write: V => { F.harmonic = Math.max(1, Math.round(V)); PE.Edits.Announce('Wave speed harmonic', F.harmonic); } }), 1, 6, 1, 0, '×');
    }
    else if (Topology === 'trail')
    {
        const PathOpts = (PE.FIBRE_PATHS || ['Ring', 'Figure eight', 'Rose', 'Weave', 'Loop', 'Stadium', 'Dipole field line']).map((Name, Idx) => [Name, Idx]);
        C.SelectRow(Form, BindEffect(Effect, F, 'pathShape', { Label: 'Closed path curve', Options: PathOpts }));
        Range(Form, BindEffect(Effect, F, 'pathSize', { Label: 'Path radius / size' }), 0.3, 10, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'trailLength', { Label: 'Trail tail length' }), 0.05, 0.95, 0.01, 2, '');
        Range(Form, BindEffect(Effect, F, 'phaseSpread', { Label: 'Phase scatter' }), 0, 6.28, 0.05, 2, 'rad');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Bundle tube radius' }), 0.02, 3, 0.01, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Helical wobble' }), 0, 2, 0.02, 2, 'm');
        Range(Form, Object.assign(BindEffect(Effect, F, 'frequency', { Label: 'Wobble turns' }), { Write: V => { F.frequency = Math.max(1, Math.round(V)); PE.Edits.Announce('Wobble turns', F.frequency); } }), 1, 12, 1, 0, '');
        Range(Form, Object.assign(BindEffect(Effect, F, 'harmonic', { Label: 'Orbit harmonic' }), { Write: V => { F.harmonic = Math.max(1, Math.round(V)); PE.Edits.Announce('Orbit harmonic', F.harmonic); } }), 1, 6, 1, 0, '×');
    }
    else
    {
        // 'streak' (Bezier cone along P.dir)
        C.VectorRow(Form, BindEffect(Effect, P, 'dir', { Label: 'Streak axis direction', Step: 0.01, Digits: 2, Minimum: -1, Maximum: 1 }));
        Range(Form, BindEffect(Effect, F, 'length', { Label: 'Streak length' }), 0.5, 16, 0.05, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'spread', { Label: 'Cone spread radius' }), 0.1, 8, 0.02, 2, 'm');
        Range(Form, BindEffect(Effect, F, 'amplitude', { Label: 'Bezier wander' }), 0, 5, 0.02, 2, 'm');
        Range(Form, Object.assign(BindEffect(Effect, F, 'frequency', { Label: 'Motion harmonic k' }), { Write: V => { F.frequency = Math.max(1, Math.round(V)); PE.Edits.Announce('Motion harmonic', F.frequency); } }), 1, 8, 1, 0, '');
        Range(Form, Object.assign(BindEffect(Effect, F, 'harmonic', { Label: 'Loop harmonic' }), { Write: V => { F.harmonic = Math.max(1, Math.round(V)); PE.Edits.Announce('Loop harmonic', F.harmonic); } }), 1, 6, 1, 0, '×');
    }

    Range(Form, BindEffect(Effect, F, 'windMix', { Label: 'Force field coupling' }), 0, 2, 0.02, 2, '×');

    const Place = C.SectionCard(Page, { Title: 'Placement & timing', Glyph: 'Move', Badge: '02 / MOTION' }).Inner;
    C.VectorRow(Place, BindEffect(Effect, P, 'origin', { Label: 'Origin', Unit: 'm', Step: 0.05, Digits: 2, Minimum: -20, Maximum: 20 }));
    Range(Place, BindEffect(Effect, F, 'scale', { Label: 'Geometry scale' }), 0.05, 10, 0.02, 2, '×');
    Range(Place, BindEffect(Effect, F, 'loopSeconds', { Label: 'Loop duration' }), 1, 24, 0.1, 1, 's');
}

function ConstructFibreLookAndColour(Page, Effect)
{
    const F = Effect.P.fibre;
    const Look = C.SectionCard(Page, { Title: 'Optical glow & streak profile', Glyph: 'Sparkles', Badge: '01 / OPTICS' }).Inner;
    Range(Look, BindEffect(Effect, F, 'thickness', { Label: 'Filament thickness' }), 0.2, 8, 0.02, 2, 'px');
    Range(Look, BindEffect(Effect, F, 'intensity', { Label: 'Emissive intensity' }), 0, 12, 0.05, 2, '');
    Range(Look, BindEffect(Effect, F, 'halo', { Label: 'Outer halo' }), 0, 2, 0.02, 2, '');
    Range(Look, BindEffect(Effect, F, 'baseline', { Label: 'Skeleton baseline' }), 0, 1, 0.01, 2, '');
    Range(Look, BindEffect(Effect, F, 'window', { Label: 'Streak tail length' }), 0.05, 0.95, 0.01, 2, '');
    Range(Look, Object.assign(BindEffect(Effect, F, 'windowCycles', { Label: 'Streak cycles / loop' }), { Write: V => { F.windowCycles = Math.round(V); PE.Edits.Announce('Streak cycles / loop', F.windowCycles); } }), 1, 6, 1, 0, '×');
    Range(Look, BindEffect(Effect, F, 'taper', { Label: 'End taper' }), 0, 1, 0.02, 2, '');

    const Col = C.SectionCard(Page, { Title: 'Gradient stops', Glyph: 'Palette', Badge: '02 / COLOUR' }).Inner;
    C.SelectRow(Col, BindEffect(Effect, F, 'colourMode', { Label: 'Colouring mode', Options: [['Solid', 'solid'], ['Ramp along fibre', 'ramp'], ['Palette per strand', 'palette']] }));
    Range(Col, BindEffect(Effect, F, 'accentMix', {
        Label: 'Accent colour mix',
        Availability: () => F.colourMode === 'palette' ? { Enabled: true } : { Enabled: false, Reason: 'Active in Palette per strand mode' }
    }), 0, 1, 0.02, 2, '');
    F.stops.forEach((Stop, I) => C.ColourRow(Col, BindEffect(Effect, Stop, 'col', { Label: `Gradient stop ${I + 1}` })));
}

function ConstructFibreSparksAndRecord(Page, Effect)
{
    const F = Effect.P.fibre;
    if (!F.colC) F.colC = [1, 1, 1, 1];
    const Sp = C.SectionCard(Page, { Title: 'Moving sparks & optical bokeh', Glyph: 'Sparkles', Badge: 'PARTICLES + BOKEH' }).Inner;
    Range(Sp, BindEffect(Effect, F, 'sparks', { Label: 'Particle / spark density' }), 0, 1, 0.01, 2, '');
    Range(Sp, BindEffect(Effect, F, 'bokeh', { Label: 'Soft bokeh orb share' }), 0, 1, 0.01, 2, '');
    Range(Sp, BindEffect(Effect, F, 'sparkSize', { Label: 'Particle radius' }), 0.004, 0.4, 0.002, 3, 'm');
    Range(Sp, BindEffect(Effect, F, 'sparkBrightness', { Label: 'Particle bloom glow' }), 0, 12, 0.05, 2, '');
    C.SelectRow(Sp, BindEffect(Effect, F, 'pulseShape', {
        Label: 'Pulse waveform',
        Options: (PE.PULSE_SHAPES || ['Breathe', 'Heartbeat', 'Ripple', 'Sweep']).map((N, I) => [N, I])
    }));
    Range(Sp, BindEffect(Effect, F, 'pulseRate', { Label: 'Pulse rate' }), 0, 4, 0.1, 1, 'Hz');
    Range(Sp, BindEffect(Effect, F, 'pulseDepth', { Label: 'Pulse depth' }), 0, 1, 0.02, 2, '');
    C.ColourRow(Sp, BindEffect(Effect, F, 'colC', { Label: 'Spark highlight colour', Alpha: false }));
    RenderRecordCard(Page, 'ParticleEffect (.levelspace)', () => EncodeEffect(Effect));
}

//------------------------------------------------------------------------------------------------------------------------
//                                      UNIFIED FORCES INSPECTOR (FIELD + FORMULA + LAYERS + CACHE)
//------------------------------------------------------------------------------------------------------------------------

let CacheRecordScope = 'system'; // 'system' | 'source'

function ResolveFormulaTarget(Src)
{
    if (Src) return Src;
    const Match = Scene.FieldScene.Sources.find(S => S.Token === Selected.replace(/^src:/, ''));
    return Match || Scene.FieldScene.Sources[0] || null;
}

function ConstructForcesInspector(Page, FocusMode, Src)
{
    if (!FORCE_TABS.has(InspectorTab)) InspectorTab = 'field';
    RenderInspectorTabs([
        ['field', 'Field'],
        ['formula', 'Formula'],
        ['layers', 'Layers'],
        ['cache', 'Cache']
    ]);

    if (InspectorTab === 'field') ConstructForcesFieldTab(Page, FocusMode, Src);
    else if (InspectorTab === 'formula') ConstructForcesFormulaTab(Page, Src);
    else if (InspectorTab === 'layers') ConstructForcesLayersTab(Page);
    else ConstructForcesCacheTab(Page, Src);
}

function ConstructForcesFieldTab(Page, FocusMode, Src)
{
    const Vz = Scene.FieldScene.Visualization;
    const W = Scene.FieldScene.Wind;

    if (FocusMode === 'field')
    {
        // Card 1: Full Beaufort Wind Anemometer (.pcard.wf-trace) replacing the old composite hero card
        const AnemBadge = C.Construct('span', 'mp-badge', 'Bft 0 · Calm');
        AnemBadge.id = 'AnemBeaufortBadge';
        const PlaceBtn = C.Construct('button', 'mp-place-btn', Scene.AnemometerPlacing ? 'Click Viewport…' : 'Place in Viewport');
        PlaceBtn.type = 'button';
        PlaceBtn.id = 'btn-place-anemometer';
        PlaceBtn.title = 'Click anywhere in the 3D viewport to place the Anemometer, or drag the pin anytime';
        PlaceBtn.classList.toggle('active', !!Scene.AnemometerPlacing);
        PlaceBtn.addEventListener('click', () =>
        {
            Scene.ProbeEnabled = true;
            Scene.AnemometerPlacing = !Scene.AnemometerPlacing;
            SyncAnemometerToolState();
            C.Broadcast();
        });

        const ToggleBtn = C.Construct('button', 'mp-place-btn', Scene.ProbeEnabled ? 'In Viewport' : 'Hidden');
        ToggleBtn.type = 'button';
        ToggleBtn.id = 'btn-toggle-anemometer';
        ToggleBtn.classList.toggle('active', !!Scene.ProbeEnabled);
        ToggleBtn.addEventListener('click', () =>
        {
            Scene.ProbeEnabled = !Scene.ProbeEnabled;
            if (!Scene.ProbeEnabled) Scene.AnemometerPlacing = false;
            SyncAnemometerToolState();
            C.Broadcast();
        });

        const AnemNum = C.Construct('div', 'mp-num');
        AnemNum.id = 'AnemSpeedDisplay';
        const AnemDirPill = C.Construct('div', 'mp-dir-pill', 'N · 0°');
        AnemDirPill.id = 'AnemDirPill';
        const AnemDialSvg = SvgNode('svg', { viewBox: '0 0 42 42', width: 38, height: 38, style: 'flex-shrink:0' });
        const DialRing = SvgNode('circle', { cx: 21, cy: 21, r: 18, fill: 'rgba(13,18,24,0.85)', stroke: 'rgba(146,216,194,0.34)', 'stroke-width': 1.2 });
        const DialVane = SvgNode('g', { transform: 'translate(21 21)' }, [
            SvgNode('polygon', { points: '0,-16 -3,-4 3,-4', fill: '#f5c451' }),
            SvgNode('polygon', { points: '0,15 -2.2,5 2.2,5', fill: 'rgba(146,216,194,0.55)' })
        ]);
        const DialRotor = SvgNode('g', { transform: 'translate(21 21)' }, [
            SvgNode('line', { x1: 0, y1: 0, x2: 0, y2: -9, stroke: '#e8f5ef', 'stroke-width': 1.1 }),
            SvgNode('circle', { cx: 0, cy: -9, r: 2.1, fill: '#92d8c2' }),
            SvgNode('line', { x1: 0, y1: 0, x2: 7.8, y2: 4.5, stroke: '#e8f5ef', 'stroke-width': 1.1 }),
            SvgNode('circle', { cx: 7.8, cy: 4.5, r: 2.1, fill: '#92d8c2' }),
            SvgNode('line', { x1: 0, y1: 0, x2: -7.8, y2: 4.5, stroke: '#e8f5ef', 'stroke-width': 1.1 }),
            SvgNode('circle', { cx: -7.8, cy: 4.5, r: 2.1, fill: '#92d8c2' }),
            SvgNode('circle', { cx: 0, cy: 0, r: 2.4, fill: '#1e2832', stroke: '#f5c451', 'stroke-width': 1 })
        ]);
        AnemDialSvg.append(DialRing, DialVane, DialRotor);
        const AnemCanvas = document.createElement('canvas');
        AnemCanvas.id = 'AnemometerCanvas';
        AnemCanvas.height = 78;
        const AnemDesc = C.Construct('div', 'mp-spec');
        AnemDesc.id = 'AnemDescText';

        const AnemKnots = C.Construct('b', null, '0.0 kt'); AnemKnots.id = 'AnemKnots';
        const AnemKmh = C.Construct('b', null, '0.0'); AnemKmh.id = 'AnemKmh';
        const AnemDynQ = C.Construct('b', null, '0 Pa'); AnemDynQ.id = 'AnemDynQ';
        const AnemAlt = C.Construct('b', null, `${Scene.Probe[1].toFixed(1)} m`); AnemAlt.id = 'AnemAlt';
        const AnemPeak = C.Construct('b', null, '0.0 m/s'); AnemPeak.id = 'AnemPeak';
        const AnemLull = C.Construct('b', null, '0.0 m/s'); AnemLull.id = 'AnemLull';
        const BeaufortPin = C.Construct('span', 'wf-scale-pin');
        BeaufortPin.id = 'BeaufortPin';

        const AnemCard = C.Construct('div', 'pcard wf-trace', [
            C.Construct('div', 'mp-hd', [
                C.Construct('span', 'mp-k', 'Anemometer · Probe Wind'),
                C.Construct('div', 'mp-hd-actions', [PlaceBtn, ToggleBtn, AnemBadge])
            ]),
            C.Construct('div', 'mp-num-row', [AnemNum, AnemDialSvg, AnemDirPill]),
            AnemCanvas,
            C.Construct('div', 'mp-axis', [
                C.Construct('span', null, '-30 s'),
                C.Construct('span', null, '-15 s'),
                C.Construct('span', null, 'now')
            ]),
            AnemDesc,
            C.Construct('div', 'mp-rail', [
                C.Construct('div', 'mp-rail-cell', [C.Construct('small', null, 'Knots'), AnemKnots]),
                C.Construct('div', 'mp-rail-cell', [C.Construct('small', null, 'km/h'), AnemKmh]),
                C.Construct('div', 'mp-rail-cell', [C.Construct('small', null, 'Dyn q'), AnemDynQ]),
                C.Construct('div', 'mp-rail-cell', [C.Construct('small', null, 'Altitude'), AnemAlt])
            ]),
            C.Construct('div', 'mp-duo', [
                C.Construct('div', 'mp-duo-box', [C.Construct('small', null, 'Gusting to (peak)'), AnemPeak]),
                C.Construct('div', 'mp-duo-box', [C.Construct('small', null, 'Lulling to (lull)'), AnemLull])
            ]),
            C.Construct('div', 'wf-scale-bar', BeaufortPin),
            C.Construct('div', 'wf-scale-ticks', [
                C.Construct('span', null, '0 Calm'), C.Construct('span', null, '5 Fresh'),
                C.Construct('span', null, '8 Gale'), C.Construct('span', null, '12 Hurricane')
            ])
        ]);
        Page.append(AnemCard);

        // Card 2: Probe Coordinates, Differential Tensor Readout & Overlay Contribution
        const FlowVal = C.Construct('b', null, '0.0 m/s');
        const AccelVal = C.Construct('b', null, '0.0 m/s²');
        const CurlVal = C.Construct('b', null, '0.000 /s');
        const DivVal = C.Construct('b', null, '+0.000 /s');
        const ProbeSec = C.SectionCard(Page, { Title: 'Anemometer placement & probe tensor', Glyph: 'Crosshair', Badge: '3D PIN · DRAGGABLE' }).Inner;
        C.PillTabs(ProbeSec, {
            Options: [['Flow · m/s', 'Flow'], ['Accelerate · m/s²', 'Accelerate'], ['Damp · 1/s', 'Damp']],
            Read: () => Scene.Overlay.Contribution,
            Write: Cont =>
            {
                Scene.Overlay.Contribution = Cont;
                Scene.Overlay.Enabled = true;
                const Sel = document.getElementById('overlay-channel-select');
                if (Sel) Sel.value = Cont;
                AppendLog('VIEW', `Overlay set to ${Cont}`, null, 'live');
            }
        });
        C.VectorRow(ProbeSec, BindScene(Scene, 'Probe', { Label: 'Anemometer position (X, Y, Z) · Drag pin in viewport', Unit: 'm', Step: 0.05, Digits: 2, Minimum: -6, Maximum: 8 }, 'WIND', 'Probe'));
        ProbeSec.append(C.Construct('div', 'probe-tensor-grid', [
            C.Construct('div', 'probe-tensor-cell', [C.Construct('small', null, 'Flow Velocity'), FlowVal]),
            C.Construct('div', 'probe-tensor-cell', [C.Construct('small', null, 'Acceleration'), AccelVal]),
            C.Construct('div', 'probe-tensor-cell', [C.Construct('small', null, 'Vorticity |∇×F|'), CurlVal]),
            C.Construct('div', 'probe-tensor-cell', [C.Construct('small', null, 'Divergence ∇·F'), DivVal])
        ]));

        LiveRefreshers.push(() =>
        {
            const [Px, Py, Pz] = Scene.Probe;
            const Prep = Scene.PreparedField || FC().Prepare(Scene.FieldScene, Scene.Time);
            const All = FC().EvaluateAllPrepared(Scene.FieldScene, Prep, Px, Py, Pz, 0.5, Vz.Solo, 'Particles');
            const Cont = Scene.Overlay.Contribution;
            const Diff = FC().SampleDifferential(Scene.FieldScene, Prep, Cont === 'Damp' ? 'Flow' : Cont, Px, Py, Pz, 0.25, Vz.Solo, 'Particles');

            if (AnemHistory.length < 2)
            {
                while (AnemHistory.length < 24) AnemHistory.push(All.FlowMag);
            }

            let Peak = 0, Lull = Infinity, Sum = 0;
            for (const S of AnemHistory) { Sum += S; if (S > Peak) Peak = S; if (S < Lull) Lull = S; }
            const Mean = AnemHistory.length ? Sum / AnemHistory.length : All.FlowMag;
            const Bf = FC().ResolveBeaufort(Mean);

            const Str = All.FlowMag.toFixed(1);
            const [IntPart, DecPart] = Str.split('.');
            AnemNum.innerHTML = `${IntPart}<span class="mp-dec">.${DecPart}</span><span class="mp-unit">m/s</span>`;

            const Horiz = Math.hypot(All.Velocity[0], All.Velocity[2]);
            const Bearing = Horiz > 0.05 ? Wrap360(Math.atan2(All.Velocity[0], -All.Velocity[2]) * 180 / Math.PI) : 0;
            AnemDirPill.textContent = `${C.ResolveCompassPoint(Bearing)} · ${Math.round(Bearing)}°`;
            DialVane.setAttribute('transform', `translate(21 21) rotate(${Bearing.toFixed(1)})`);
            const SpinDeg = ((Scene.Time * (1.2 + All.FlowMag * 1.45) * 180) / Math.PI) % 360;
            DialRotor.setAttribute('transform', `translate(21 21) rotate(${SpinDeg.toFixed(1)})`);

            AnemBadge.textContent = `Bft ${Bf.Force} · ${Bf.Name}`;
            AnemDesc.innerHTML = `<strong>Beaufort ${Bf.Force}</strong> — ${Bf.Land}.`;
            AnemKnots.textContent = `${(All.FlowMag * 1.94384).toFixed(1)} kt`;
            AnemKmh.textContent = `${(All.FlowMag * 3.6).toFixed(1)}`;
            const DynQ = 0.5 * 1.225 * All.FlowMag * All.FlowMag;
            AnemDynQ.textContent = `${Math.round(DynQ)} Pa`;
            AnemAlt.textContent = `${Py.toFixed(1)} m`;
            AnemPeak.textContent = `${Peak.toFixed(1)} m/s`;
            AnemLull.textContent = `${(Lull === Infinity ? All.FlowMag : Lull).toFixed(1)} m/s`;
            BeaufortPin.style.left = `${(Clamp(All.FlowMag / 36, 0, 0.99) * 100).toFixed(1)}%`;

            DrawAnemometerTrace(AnemCanvas, AnemHistory);

            FlowVal.textContent = `${All.FlowMag.toFixed(2)} m/s`;
            AccelVal.textContent = `${All.AccelMag.toFixed(2)} m/s²`;
            CurlVal.textContent = `${Diff.Curl.toFixed(3)} /s`;
            DivVal.textContent = `${Diff.Div >= 0 ? '+' : ''}${Diff.Div.toFixed(3)} /s`;
            SyncAnemometerToolState();
        });

        MountInspectorVectorPreview(Page, null);

        const ActiveSec = C.SectionCard(Page, { Title: 'Placed force sources', Glyph: 'Target', Badge: `${Scene.FieldScene.Sources.length} IN SCENE` }).Inner;
        if (!Scene.FieldScene.Sources.length)
        {
            ActiveSec.append(C.Construct('p', 'property-hint', 'No force sources placed yet. Click + in the Outliner header to add a Flow, Accelerate, Damp, or Formula source.'));
        }
        else
        {
            const List = C.Construct('div', 'force-list');
            for (const S of Scene.FieldScene.Sources)
            {
                const Info = FC().TypeById[S.Type];
                if (!Info) continue;
                const Dot = C.Construct('div', 'row-glyph', C.ConstructGlyph(Info.Glyph || 'Target'));
                Dot.style.color = S.UseFormula ? '#ffb454' : (Info.Colour || ContributionColours[Info.Contribution]);
                const St = FC().ResolveActivation(S, Scene.Time).Status;
                const Item = C.Construct('button', 'force-item', [
                    Dot,
                    C.Construct('div', null, [
                        C.Construct('div', 'row-name', S.Name),
                        C.Construct('div', 'force-item-meta', SourceMetaSummary(S))
                    ]),
                    C.Construct('div', 'force-item-val', (StatusText[St] || 'off').toUpperCase())
                ]);
                Item.type = 'button';
                Item.addEventListener('click', () => SelectNode('src:' + S.Token, false));
                List.append(Item);
            }
            ActiveSec.append(List);
        }
        return;
    }

    if (FocusMode === 'wind')
    {
        C.MetricTrio(Page, [
            { Label: 'Base speed', Resolve: () => [`${W.Speed.toFixed(1)} m/s`, FC().ResolveBeaufort(W.Speed).Name] },
            { Label: 'Heading', Resolve: () => [`${Math.round(W.Bearing)}°`, C.ResolveCompassPoint(W.Bearing)] },
            { Label: 'Lattice gain', Highlight: true, Resolve: () => [`×${Scene.Wind.windScale.toFixed(2)}`, '24·12·24 grid'] }
        ]);
        MountInspectorVectorPreview(Page, null);

        const Sec = C.SectionCard(Page, { Title: 'Direction, speed & bounded region', Glyph: 'Wind', Badge: W.Enabled ? 'ACTIVE' : 'OFF' }).Inner;
        C.SwitchRow(Sec, BindScene(W, 'Enabled', { Label: 'Ambient wind enabled' }, 'WIND', 'AmbientWind'));
        C.PolarDial(Sec, {
            Label: 'Heading (blow toward azimuth)',
            Read: () => W.Bearing,
            Write: Deg => { W.Bearing = Deg; AppendLog('WIND', 'Ambient heading', `${Deg.toFixed(0)}°`, 'live'); },
            Resolve: () => ({ Caption: `Heading ${Math.round(W.Bearing)}° · ${C.ResolveCompassPoint(W.Bearing)}` })
        });
        Range(Sec, BindScene(W, 'Speed', { Label: 'Base speed' }, 'WIND', 'AmbientWind'), 0, 20, 0.1, 1, 'm/s');
        Range(Sec, BindScene(W, 'Turbulence', { Label: 'Eddy turbulence' }, 'WIND', 'AmbientWind'), 0, 1, 0.02, 2, '');
        C.SwitchRow(Sec, BindScene(W, 'Bounded', { Label: 'Bounded inside chamber region' }, 'WIND', 'AmbientWind'));
        Range(Sec, BindScene(W, 'RegionRadius', {
            Label: 'Chamber region radius',
            Availability: () => W.Bounded ? { Enabled: true } : { Enabled: false, Reason: 'Enable bounded chamber region first' }
        }, 'WIND', 'AmbientWind'), 3, 24, 0.25, 2, 'm');

        const ProfSec = C.SectionCard(Page, { Title: 'Gusting & vertical altitude profile', Glyph: 'Activity', Badge: 'HEIGHT LAW' }).Inner;
        Range(ProfSec, BindScene(W, 'GustStrength', { Label: 'Gust amplitude' }, 'WIND', 'AmbientWind'), 0, 1, 0.02, 2, '×');
        Range(ProfSec, BindScene(W, 'GustFrequency', { Label: 'Gust frequency' }, 'WIND', 'AmbientWind'), 0.02, 1.5, 0.02, 2, 'Hz');
        Range(ProfSec, BindScene(W, 'TurbulenceScale', { Label: 'Turbulence length scale' }, 'WIND', 'AmbientWind'), 0.4, 8, 0.1, 1, 'm');
        Range(ProfSec, BindScene(W, 'Shear', { Label: 'Shear per km altitude' }, 'WIND', 'AmbientWind'), 0, 0.8, 0.02, 2, '');
        Range(ProfSec, BindScene(W, 'Veer', { Label: 'Veer degrees per km' }, 'WIND', 'AmbientWind'), -45, 45, 1, 0, '°');
        return;
    }

    if (!Src) return;
    const Info = FC().TypeById[Src.Type];
    if (!Info) return;
    const EffectiveContrib = Src.UseFormula
        ? (FC().EnsureCompiledFormula(Src)?.OutputChannel === 'Flow' ? 'Flow' : 'Accelerate')
        : Info.Contribution;
    const Unit = ContributionUnits[EffectiveContrib];

    const Metric = C.Construct('div', 'metric-big');
    const Rate = C.Construct('div', 'rate');
    const Low = C.Construct('div', 'low');
    const Card = C.Construct('div', 'hero-card', [
        C.Construct('div', 'hero-top', [
            C.Construct('div', 'budget-chip', [C.Construct('div', 'mark live', C.ConstructGlyph('Check')), C.Construct('span', null, `${EffectiveContrib} · ${Src.UseFormula ? 'Symbolic Formula' : Info.Name}`)]),
            C.Construct('div', 'estimate-tag', Src.UseFormula ? 'FX(GPU/CPU)' : Info.Native.toUpperCase())
        ]),
        C.Construct('div', 'hero-title', Src.UseFormula ? (Src.FormulaCode || FC().DEFAULT_FORMULA_CODE) : Info.Blurb),
        C.Construct('div', 'hero-metrics', [Metric, C.Construct('div', 'metric-side', [Rate, Low])])
    ]);
    Page.append(Card);

    C.CurvePlot(Card, {
        Height: 86,
        Resolve: () =>
        {
            const Prof = FC().ResolveProfile(Scene.FieldScene, Src, Scene.FieldScene.Visualization.SliceHeight ?? 1.5);
            const Pts = Prof.Points;
            const Peak = Math.max(1e-4, ...Pts.map(P => P[1]));
            const Stroke = Src.UseFormula ? '#ffb454' : (Info.Colour || ContributionColours[EffectiveContrib]);
            return {
                XRange: [0, Prof.Reach], YRange: [0, Peak * 1.18],
                Curves: [{ Points: Pts, Stroke, Fill: Stroke + '26' }],
                XTicks: [[0, '0'], [Src.Radius, `${Src.Radius.toFixed(1)}m`]],
                Caption: `Bounded envelope: strictly 0 beyond R=${Src.Radius.toFixed(1)}m (${Src.Reach} · ${Src.Falloff})`
            };
        }
    });

    LiveRefreshers.push(() =>
    {
        const St = FC().ResolveActivation(Src, Scene.Time).Status;
        C.ConstructMetric(Metric, Math.abs(Src.Strength), 2, Unit);
        Rate.textContent = `${Src.Radius.toFixed(1)} m`;
        Low.textContent = `${Src.Reach} · ${StatusText[St]}`;
    });

    MountInspectorVectorPreview(Page, Src);

    const Acts = [
        { Label: 'Solo', Glyph: 'Focus', Act: () => { Scene.FieldScene.Visualization.Solo = Scene.FieldScene.Visualization.Solo === Src.Token ? null : Src.Token; C.Broadcast(); } },
        { Label: Src.UseFormula ? 'Edit fx' : 'Formula', Glyph: 'Zap', Act: () => { InspectorTab = 'formula'; ConstructInspectorPage(); } },
        { Label: 'Duplicate', Glyph: 'Copy', Act: () => DuplicateForceSource(Src) },
        { Label: 'Delete', Glyph: 'Trash', Tone: 'danger', Act: () => RemoveForceSource(Src) }
    ];
    if (Src.Activation === 'Trigger')
        Acts.unshift({ Label: 'Trigger', Glyph: 'Zap', Tone: 'accent', Act: () => { Src.TriggeredAt = Scene.Time; Src.Enabled = true; AppendLog('FORCES', `Triggered ${Src.Name}`, null, 'live'); } });
    C.ActionRow(Page, Acts);

    const StrSec = C.SectionCard(Page, { Title: 'Strength & direction', Glyph: Info.Glyph || 'Target', Badge: EffectiveContrib.toUpperCase() }).Inner;
    for (const [Key, Label] of Info.Bearings || [])
    {
        C.PolarDial(StrSec, {
            Label,
            Read: () => Src[Key] || 0,
            Write: Deg => { Src[Key] = Deg; AppendLog('FORCES', `${Src.Name}: ${Label}`, `${Math.round(Deg)}°`, 'live'); },
            Resolve: () => ({ Caption: `Heading ${Math.round(Src[Key] || 0)}° · ${C.ResolveCompassPoint(Src[Key] || 0)}` })
        });
    }
    if (Info.Spin)
    {
        C.SegmentedRow(StrSec, {
            Label: 'Rotation sense',
            Options: [['Cyclonic (+)', 1], ['Anticyclonic (−)', -1]],
            Read: () => Src.Spin < 0 ? -1 : 1,
            Write: V => { Src.Spin = V; }
        });
    }
    for (const P of Info.Parameters)
    {
        const B = ParameterBounds(P, Scene.FieldScene);
        Range(StrSec, BindScene(Src, P.Key, { Label: P.Label }, 'FORCES', Src.Name), B.Min, B.Max, P.Step, P.Digits, P.Unit);
    }

    const ReachSec = C.SectionCard(Page, { Title: 'Placement & finite influence', Glyph: 'Target', Badge: `${Src.Reach.toUpperCase()} · ${Src.Falloff.toUpperCase()}` }).Inner;
    C.VectorRow(ReachSec, BindScene(Src, 'Centre', { Label: 'World centre (X, Y, Z)', Unit: 'm', Step: 0.05, Digits: 2, Minimum: -12, Maximum: 12 }, 'FORCES', Src.Name));
    C.SegmentedRow(ReachSec, {
        Label: 'Bounded shape',
        Options: FC().Reaches.map(R => [R, R]),
        Read: () => Src.Reach,
        Write: R => { Src.Reach = R; ConstructInspectorPage(); }
    });
    if (Src.Reach === 'Box')
    {
        Range(ReachSec, BindScene(Src, 'HalfX', { Label: 'Half extent X' }, 'FORCES', Src.Name), 0.3, 12, 0.05, 2, 'm');
        Range(ReachSec, BindScene(Src, 'HalfZ', { Label: 'Half extent Z' }, 'FORCES', Src.Name), 0.3, 12, 0.05, 2, 'm');
        Range(ReachSec, BindScene(Src, 'Height', { Label: 'Box height' }, 'FORCES', Src.Name), 0.5, 16, 0.05, 2, 'm');
    }
    else
    {
        Range(ReachSec, BindScene(Src, 'Radius', { Label: 'Influence radius' }, 'FORCES', Src.Name), 0.3, 14, 0.05, 2, 'm');
        if (Src.Reach === 'Column')
            Range(ReachSec, BindScene(Src, 'Height', { Label: 'Column height' }, 'FORCES', Src.Name), 0.5, 16, 0.05, 2, 'm');
    }
    C.SegmentedRow(ReachSec, {
        Label: 'Falloff law',
        Options: [['Smooth', 'Smooth'], ['Linear', 'Linear'], ['Inv²', 'InverseSquare'], ['None', 'None']],
        Read: () => Src.Falloff,
        Write: F => { Src.Falloff = F; }
    });

    const TimeSec = C.SectionCard(Page, { Title: 'Timing & target channels', Glyph: 'Clock', Badge: Src.Activation.toUpperCase() }).Inner;
    C.SegmentedRow(TimeSec, {
        Label: 'Activation mode',
        Options: FC().Activations.map(A => [A, A]),
        Read: () => Src.Activation,
        Write: A => { Src.Activation = A; ConstructInspectorPage(); }
    });
    if (Src.Activation === 'Window')
    {
        Range(TimeSec, BindScene(Src, 'Begins', { Label: 'Window opens at' }, 'FORCES', Src.Name), 0, 60, 0.1, 1, 's');
        Range(TimeSec, BindScene(Src, 'Lasts', { Label: 'Active duration (0=forever)' }, 'FORCES', Src.Name), 0, 60, 0.1, 1, 's');
        Range(TimeSec, BindScene(Src, 'Repeats', { Label: 'Repeat period (0=once)' }, 'FORCES', Src.Name), 0, 60, 0.1, 1, 's');
        Range(TimeSec, BindScene(Src, 'RampIn', { Label: 'Ramp-in time' }, 'FORCES', Src.Name), 0, 5, 0.05, 2, 's');
        Range(TimeSec, BindScene(Src, 'RampOut', { Label: 'Ramp-out time' }, 'FORCES', Src.Name), 0, 5, 0.05, 2, 's');
    }
    else if (Src.Activation === 'Trigger')
    {
        Range(TimeSec, BindScene(Src, 'Lasts', { Label: 'Pulse duration' }, 'FORCES', Src.Name), 0.2, 30, 0.1, 1, 's');
        C.ActionRow(TimeSec, [{ Label: 'Fire Trigger Now', Glyph: 'Zap', Tone: 'accent', Act: () => { Src.TriggeredAt = Scene.Time; Src.Enabled = true; AppendLog('FORCES', `Triggered ${Src.Name}`, null, 'live'); } }]);
    }
    C.ChipToggles(TimeSec, {
        Label: 'Applies to channels (empty = all)',
        Options: FC().Channels,
        Read: () => Src.Acts,
        Write: List => { Src.Acts = List; },
        Detail: List => List.length ? `${List.length} selective channel(s)` : 'Affects all 7 particle & world channels'
    });
}

function ConstructForcesFormulaTab(Page, Src)
{
    const Target = ResolveFormulaTarget(Src);
    if (!Target)
    {
        const Empty = C.SectionCard(Page, { Title: 'Symbolic Vector Language', Glyph: 'Zap', Badge: 'NO SOURCE' }).Inner;
        Empty.append(C.Construct('p', 'property-hint', 'No force source exists yet. Use the Outliner + button to add a Custom Formula Field or any force type, then edit its equation here.'));
        return;
    }
    if (!Number.isFinite(Target.Strength)) Target.Strength = 8;
    if (!Number.isFinite(Target.Swirl)) Target.Swirl = 2.5;

    if (!Src && Scene.FieldScene.Sources.length > 1)
    {
        const Picker = C.Construct('div', 'formula-target-row');
        for (const Item of Scene.FieldScene.Sources)
        {
            const Pill = C.Construct('button', 'formula-target-pill' + (Item === Target ? ' active' : ''), Item.Name);
            Pill.type = 'button';
            Pill.addEventListener('click', () => { SelectNode('src:' + Item.Token, false); });
            Picker.append(Pill);
        }
        Page.append(Picker);
    }

    const Sec = C.SectionCard(Page, { Title: 'Symbolic GPU / CPU language', Glyph: 'Zap', Badge: Target.Name }).Inner;
    C.SwitchRow(Sec, {
        Label: 'Evaluate custom formula',
        Read: () => !!Target.UseFormula,
        Write: On =>
        {
            Target.UseFormula = !!On;
            if (!Target.FormulaCode) Target.FormulaCode = FC().DEFAULT_FORMULA_CODE;
            FC().EnsureCompiledFormula(Target);
            AppendLog('FORCES', `${Target.Name}: formula ${On ? 'active' : 'off'}`, null, 'live');
            ConstructOutliner();
            ConstructInspectorPage();
        }
    });

    const PresetRow = C.Construct('div', 'vfl-preset-row');
    for (const P of FC().FORMULA_PRESETS)
    {
        const Btn = C.Construct('button', 'vfl-preset-btn', P.Name);
        Btn.type = 'button';
        Btn.addEventListener('click', () =>
        {
            Target.FormulaCode = P.Code;
            Target.UseFormula = true;
            Ta.value = P.Code;
            ApplyCode(P.Code);
            ConstructOutliner();
            AppendLog('FORCES', `${Target.Name}: loaded preset '${P.Name}'`, null, 'live');
        });
        PresetRow.append(Btn);
    }
    Sec.append(C.Construct('div', 'section-subhead', [C.Construct('span', null, 'Presets'), C.Construct('span', null, 'VectorFieldLang')]), PresetRow);

    const QuickSymbols = [
        ['·', ' · '], ['×', ' × '], ['r̂', 'r̂'], ['x̂', 'x̂'], ['ŷ', 'ŷ'], ['ẑ', 'ẑ'],
        ['θ̂', 'θ̂'], ['ω_swirl', 'ω_swirl'], ['A(r)', 'A(r)'], ['S', 'S'], ['R', 'R'], ['curlNoise', 'curlNoise(p, 4.0)']
    ];
    const Palette = C.Construct('div', 'vfl-palette-bar');
    for (const [Label, Ins] of QuickSymbols)
    {
        const B = C.Construct('button', 'vfl-sym-btn', Label);
        B.type = 'button';
        B.addEventListener('click', () =>
        {
            const S0 = Ta.selectionStart ?? Ta.value.length;
            const S1 = Ta.selectionEnd ?? Ta.value.length;
            Ta.value = Ta.value.slice(0, S0) + Ins + Ta.value.slice(S1);
            Ta.focus();
            Ta.setSelectionRange(S0 + Ins.length, S0 + Ins.length);
            ApplyCode(Ta.value);
        });
        Palette.append(B);
    }
    Sec.append(Palette);

    const Code = Target.FormulaCode || FC().DEFAULT_FORMULA_CODE;
    const Res = FC().CompileFieldProgram(Code, 0);

    const Wrap = C.Construct('div', 'vfl-editor-wrap' + (Res.Ok ? '' : ' has-err'));
    const Pre = C.Construct('pre', 'vfl-code-highlight');
    Pre.setAttribute('aria-hidden', 'true');
    Pre.innerHTML = Res.HighlightHtml;
    const Ta = document.createElement('textarea');
    Ta.className = 'vfl-code-input';
    Ta.spellcheck = false;
    Ta.rows = 5;
    Ta.value = Code;
    Wrap.append(Pre, Ta);
    Sec.append(Wrap);

    const Diag = C.Construct('div', 'vfl-diag-box ' + (Res.Ok ? 'ok' : 'err'));
    const GlslPre = C.Construct('pre', 'vfl-glsl-pre', Res.Ok ? Res.GlslCode : '// Fix syntax error above to emit GPU kernel');
    const SyncDiag = Compiled =>
    {
        Pre.innerHTML = Compiled.HighlightHtml;
        Wrap.classList.toggle('has-err', !Compiled.Ok);
        if (Compiled.Ok)
        {
            Diag.className = 'vfl-diag-box ok';
            Diag.innerHTML = `✓ Compiled cleanly · Output: <b>${Compiled.OutputChannel}</b> (vec3) · Bound live across visualizer &amp; solver`;
            GlslPre.textContent = Compiled.GlslCode;
        }
        else
        {
            const D = Compiled.Diagnostics[0] || { Line: 1, Col: 1, Message: 'Invalid syntax' };
            Diag.className = 'vfl-diag-box err';
            Diag.textContent = `✗ Error (Ln ${D.Line}, Col ${D.Col}): ${D.Message}`;
        }
    };
    SyncDiag(Res);
    Sec.append(Diag);

    const ApplyCode = NextCode =>
    {
        Target.FormulaCode = NextCode;
        const Compiled = FC().EnsureCompiledFormula(Target, 0);
        SyncDiag(Compiled);
        C.Broadcast();
    };
    Ta.addEventListener('input', () => ApplyCode(Ta.value));
    Ta.addEventListener('scroll', () => { Pre.scrollTop = Ta.scrollTop; Pre.scrollLeft = Ta.scrollLeft; });

    Range(Sec, BindScene(Target, 'Strength', { Label: 'Strength (S)' }, 'FORCES', Target.Name), -30, 30, 0.25, 2, '');
    Range(Sec, BindScene(Target, 'Swirl', { Label: 'Swirl (ω_swirl)' }, 'FORCES', Target.Name), -25, 25, 0.25, 2, '');

    const Det = document.createElement('details');
    Det.className = 'vfl-details';
    const Sum = document.createElement('summary');
    Sum.textContent = 'View Emitted GPU GLSL ES 3.00 Kernel';
    Det.append(Sum, GlslPre);
    Sec.append(Det);
}

function ConstructForcesLayersTab(Page)
{
    const Vz = Scene.FieldScene.Visualization;

    C.PillTabs(Page, {
        Options: [['Flow · m/s', 'Flow'], ['Accelerate · m/s²', 'Accelerate'], ['Damp · 1/s', 'Damp']],
        Read: () => Scene.Overlay.Contribution,
        Write: Cont =>
        {
            Scene.Overlay.Contribution = Cont;
            Scene.Overlay.Enabled = true;
            const Sel = document.getElementById('overlay-channel-select');
            if (Sel) Sel.value = Cont;
            AppendLog('VIEW', `Layer contribution: ${Cont}`, null, 'live');
        }
    });

    const MapSec = C.SectionCard(Page, { Title: 'Slice, heatmap & colorimetry', Glyph: 'Layers', Badge: Scene.Overlay.Contribution.toUpperCase() }).Inner;
    C.SelectRow(MapSec, BindScene(Vz, 'Quantity', {
        Label: 'Evaluated scalar quantity',
        Options: [['Speed magnitude', 'Speed'], ['East component (+X)', 'AlongX'], ['South component (+Z)', 'AlongZ'], ['Vertical (+Y)', 'Vertical'], ['Vorticity (curl ω)', 'Vorticity'], ['Divergence (∇·v)', 'Divergence']]
    }, 'VIEW', 'Heatmap'));
    C.SegmentedRow(MapSec, BindScene(Scene.Overlay, 'HeatmapStyle', { Label: 'Heatmap style', Options: [['Smooth LUT', 'Smooth'], ['Contour isolines', 'Contour']] }, 'VIEW', 'Heatmap'));
    Range(MapSec, BindScene(Vz, 'SliceHeight', { Label: 'Slice plane elevation Y' }, 'VIEW', 'SliceY'), 0.05, 7.5, 0.05, 2, 'm');
    Range(MapSec, BindScene(Scene.Overlay, 'Opacity', { Label: 'Heatmap opacity' }, 'VIEW', 'Opacity'), 0.08, 0.95, 0.02, 2, '');
    Range(MapSec, BindScene(Vz, 'QuietCutoff', { Label: 'Quiet cutoff threshold' }, 'VIEW', 'Layers'), 0, 0.25, 0.005, 3, '×');

    const FlowSec = C.SectionCard(Page, { Title: '3D Vector field & volumetric flow lines', Glyph: 'FlowLine', Badge: '3D FIELD' }).Inner;
    C.SwitchRow(FlowSec, Object.assign(BindScene(Scene.Wind, 'showArrows', { Label: '3D Vector field arrows' }, 'VIEW', 'Lattice'), {
        Write: On => { Scene.Wind.showArrows = !!On; document.getElementById('toggle-arrows-btn')?.classList.toggle('active', !!On); }
    }));
    C.SelectRow(FlowSec, BindScene(Scene.Wind, 'arrowStyle', {
        Label: 'Vector field style',
        Options: [['Direction spectrum (VectorayGen)', 0], ['Engineering magnitude (Teal–Coral)', 1], ['Geometric flow dashes (Holst)', 2]]
    }, 'VIEW', 'Lattice'));
    Range(FlowSec, Object.assign(BindScene(Scene.Wind, 'arrowStride', { Label: 'Lattice grid stride' }, 'VIEW', 'Lattice'), {
        Write: V => { Scene.Wind.arrowStride = Math.round(V); }
    }), 1, 4, 1, 0, 'cells');
    Range(FlowSec, BindScene(Scene.Wind, 'arrowRef', { Label: 'Color scale ceiling' }, 'VIEW', 'Lattice'), 4, 28, 0.5, 1, 'm/s');
    C.SwitchRow(FlowSec, BindScene(Scene.Overlay, 'Streamlines3D', { Label: '3D RK4 volumetric ribbons' }, 'VIEW', 'Streamlines3D'));
    C.SwitchRow(FlowSec, BindScene(Vz, 'FlowLines', { Label: '2D ground slice flow lines' }, 'VIEW', 'FlowLines'));
    Range(FlowSec, Object.assign(BindScene(Vz, 'FlowLineSpacing', { Label: 'Slice line separation' }, 'VIEW', 'FlowLines'), { Write: V => { Vz.FlowLineSpacing = Math.round(V); Visualization?.Invalidate(); InspectorViz?.Invalidate(); } }), 18, 96, 1, 0, 'px');
    C.SwitchRow(FlowSec, BindScene(Vz, 'Arrows', { Label: '2D ground slice arrows' }, 'VIEW', 'Arrows'));

    Page.append(C.Construct('div', 'section-subhead', [C.Construct('span', null, 'Stage & chamber layers'), C.Construct('span', null, 'ForceFieldVisualization')]));
    const Grid = C.Construct('div', 'property-switches');
    C.ToggleTile(Grid, BindScene(Scene.Overlay, 'Enabled', { Label: 'Field overlay', Glyph: 'Layers' }, 'VIEW', 'Overlay'));
    C.ToggleTile(Grid, BindScene(Vz, 'Heatmap', { Label: 'Heatmap', Glyph: 'Palette' }, 'VIEW', 'Heatmap'));
    C.ToggleTile(Grid, BindScene(Vz, 'Tracers', { Label: 'Flow tracers', Glyph: 'Sparkles' }, 'VIEW', 'Tracers'));
    C.ToggleTile(Grid, BindScene(Vz, 'ShowInfluence', { Label: 'Influence rings', Glyph: 'Target' }, 'VIEW', 'Sources'));
    C.ToggleTile(Grid, BindScene(Vz, 'Labels', { Label: 'Source labels', Glyph: 'Check' }, 'VIEW', 'Labels'));
    C.ToggleTile(Grid, BindScene(Scene.Overlay, 'Bounds', { Label: '3D Envelopes', Glyph: 'Boxes' }, 'VIEW', 'Bounds'));
    C.ToggleTile(Grid, BindScene(Scene.Overlay, 'Streamlines3D', { Label: '3D Flow lines', Glyph: 'Rays' }, 'VIEW', 'Streamlines3D'));
    C.ToggleTile(Grid, Object.assign(BindScene(Scene.Wind, 'showArrows', { Label: '3D Vector field', Glyph: 'Wind' }, 'VIEW', 'Lattice'), {
        Write: On => { Scene.Wind.showArrows = !!On; document.getElementById('toggle-arrows-btn')?.classList.toggle('active', !!On); }
    }));
    Page.append(Grid);

    const ChSec = C.SectionCard(Page, { Title: 'Chamber grid & coupling', Glyph: 'Lattice', Badge: '12×8×12 m' }).Inner;
    Range(ChSec, BindScene(Scene.Wind, 'windScale', { Label: 'Particle wind coupling gain' }, 'WIND', 'Wind'), 0, 3, 0.02, 2, '×');
    C.SwitchRow(ChSec, BindScene(Scene.Wind, 'showFloor', { Label: 'Ground reference grid' }, 'VIEW', 'Lattice'));
    C.SwitchRow(ChSec, BindScene(Scene.Wind, 'showDomain', { Label: 'Domain wire bounding box' }, 'VIEW', 'Lattice'));
}

function ConstructForcesCacheTab(Page, Src)
{
    const Budget = FC().ResolveBudget(Scene.FieldScene);
    const CacheSec = C.SectionCard(Page, { Title: 'Cascade clipmap & GPU cache', Glyph: 'Boxes', Badge: `${(Budget.TotalBytes / 1024).toFixed(0)} KiB` }).Inner;

    C.MetricTrio(CacheSec, [
        { Label: 'Lattice f16 windTex', Resolve: () => [`${Budget.Baked.length} baked`, '110.6 KiB rgba16f'] },
        { Label: 'GPU accel / damp', Resolve: () => [`${Budget.Live.length + Budget.Damp.length} / ${Budget.GpuSlots}`, 'fieldBuf 1040 B'] },
        { Label: 'Cascade tiers', Highlight: true, Resolve: () => [`${Budget.Levels.length} tiers`, `${(Budget.CascadeBytes / 1024).toFixed(0)} KiB/tier`] }
    ]);

    const Tiers = C.Construct('div', 'cache-tiers-grid');
    Budget.Levels.forEach((Lv, Idx) =>
    {
        Tiers.append(C.Construct('div', 'cache-tier-cell', [
            C.Construct('small', null, `Cascade ${Idx} (${Lv.Refresh}× frame)`),
            C.Construct('b', null, `${Lv.Cell.toFixed(2)}m cell · ${Lv.Extent.toFixed(1)}m span`)
        ]));
    });
    CacheSec.append(Tiers);

    C.ActionRow(CacheSec, [{
        Label: 'Re-bake Lattice & Invalidate Cache', Glyph: 'Reset', Tone: 'accent',
        Act: () =>
        {
            for (const S of Scene.FieldScene.Sources) delete S._CompiledFormula;
            Scene.PreparedField = null;
            Visualization?.Invalidate();
            InspectorViz?.Invalidate();
            AppendLog('FORCES', 'Re-baked windTex & invalidated visualization cache', null, 'live');
            C.Toast('Re-baked wind lattice & cache');
        }
    }]);

    if (Src)
    {
        C.SegmentedRow(CacheSec, {
            Label: 'TOML record scope',
            Options: [['Full ForceFieldSystem', 'system'], ['Selected Source only', 'source']],
            Read: () => CacheRecordScope,
            Write: Mode => { CacheRecordScope = Mode; ConstructInspectorPage(); }
        });
    }

    const LinesFn = () => (Src && CacheRecordScope === 'source')
        ? FC().EncodeLevelspace(Scene.FieldScene, Src.Token)
        : FC().EncodeLevelspace(Scene.FieldScene);

    const TomlSec = C.SectionCard(Page, { Title: '.levelspace TOML Cache', Glyph: 'Copy', Badge: 'TOML RECORD', Open: true }).Inner;
    const Block = C.Construct('pre', 'levelspace');
    C.ActionRow(TomlSec, [{
        Label: 'Copy TOML Record', Glyph: 'Copy',
        Act: () => { navigator.clipboard?.writeText(LinesFn().join('\n')).then(() => C.Toast('TOML record copied')); }
    }]);
    TomlSec.append(Block);
    C.Register(() => { Block.textContent = LinesFn().join('\n'); });
}

function ConstructLightningInspector(Page)
{
    const L = Scene.Lightning;
    RenderInspectorTabs([
        ['overview', 'Overview'],
        ['strikes', 'Strikes'],
        ['bolt', 'Bolt & Web'],
        ['telemetry', 'Audio & Stats']
    ]);

    if (InspectorTab === 'overview')
    {
        C.MetricTrio(Page, [
            { Label: 'Strikes fired', Resolve: () => [FormatInteger(L.strikes), L.auto ? 'auto active' : 'manual'] },
            { Label: 'Bolt detail', Resolve: () => [`${L.levels} lvl`, `${L.amp.toFixed(1)} m rough`] },
            { Label: 'Distance', Highlight: true, Resolve: () => [`${L.distance} m`, `${(L.distance / 343).toFixed(1)} s delay`] }
        ]);
        Page.append(C.Construct('div', 'section-subhead', [C.Construct('span', null, 'Quick controls'), C.Construct('span', null, 'Storm')]));
        const Grid = C.Construct('div', 'property-switches');
        C.ToggleTile(Grid, BindScene(L, 'auto', { Label: 'Auto strikes', Glyph: 'Zap' }, 'LIGHTNING', 'Lightning'));
        C.ToggleTile(Grid, BindScene(Scene.Web, 'Enabled', { Label: 'Lightning web', Glyph: 'Lattice' }, 'LIGHTNING', 'Web'));
        C.ToggleTile(Grid, {
            Label: 'Thunder audio', Glyph: 'Activity',
            Read: () => L.thunder.enabled,
            Write: On => { if (On) L.thunder.enable(); else L.thunder.disable(); }
        });
        C.ToggleTile(Grid, BindScene(Scene.Overlay, 'Enabled', { Label: 'Field overlay', Glyph: 'Layers' }, 'VIEW', 'Overlay'));
        Page.append(Grid);
        C.ActionRow(Page, [{ Label: 'Strike Lightning Bolt (L)', Glyph: 'Zap', Tone: 'accent', Act: StrikeNow }]);
        return;
    }
    if (InspectorTab === 'strikes')
    {
        const Sec = C.SectionCard(Page, { Title: 'Strike frequency', Glyph: 'Zap', Badge: 'INTERVAL' }).Inner;
        C.SwitchRow(Sec, BindScene(L, 'auto', { Label: 'Automatic periodic strikes' }, 'LIGHTNING', 'Lightning'));
        Range(Sec, BindScene(L, 'intervalMin', { Label: 'Minimum interval' }, 'LIGHTNING', 'Lightning'), 0.2, 30, 0.1, 1, 's');
        Range(Sec, BindScene(L, 'intervalMax', { Label: 'Maximum interval' }, 'LIGHTNING', 'Lightning'), 0.2, 60, 0.1, 1, 's');
        Range(Sec, BindScene(L, 'distance', { Label: 'Storm distance (thunder delay)' }, 'LIGHTNING', 'Lightning'), 50, 6000, 20, 0, 'm');
        return;
    }
    if (InspectorTab === 'bolt')
    {
        const Sec = C.SectionCard(Page, { Title: 'Procedural fractal bolt', Glyph: 'Activity', Badge: 'GEOMETRY' }).Inner;
        Range(Sec, BindScene(L, 'amp', { Label: 'Jagged roughness' }, 'LIGHTNING', 'Lightning'), 0.2, 5, 0.05, 2, 'm');
        Range(Sec, Object.assign(BindScene(L, 'levels', { Label: 'Subdivision depth' }, 'LIGHTNING', 'Lightning'), { Write: V => { L.levels = Math.round(V); } }), 3, 7, 1, 0, '');
        Range(Sec, BindScene(L, 'branchChance', { Label: 'Secondary branching probability' }, 'LIGHTNING', 'Lightning'), 0, 1, 0.02, 2, '');
        const WebSec = C.SectionCard(Page, { Title: 'Inter-effect lightning arcs', Glyph: 'Lattice', Badge: 'WEB' }).Inner;
        C.SwitchRow(WebSec, BindScene(Scene.Web, 'Enabled', { Label: 'Link active emitters with arcs' }, 'LIGHTNING', 'Web'));
        Range(WebSec, BindScene(Scene.Web, 'Interval', { Label: 'Re-arc interval' }, 'LIGHTNING', 'Web'), 0.1, 3, 0.05, 2, 's');
        Range(WebSec, Object.assign(BindScene(Scene.Web, 'Links', { Label: 'Arcs per node' }, 'LIGHTNING', 'Web'), { Write: V => { Scene.Web.Links = Math.round(V); } }), 1, 4, 1, 0, '');
        return;
    }
    const Sec = C.SectionCard(Page, { Title: 'Strike telemetry', Glyph: 'Clock', Badge: 'LIVE' }).Inner;
    const Hit = C.Construct('b', null, L.lastStrike ? `(${L.lastStrike.at.map(X => X.toFixed(1)).join(', ')})` : 'None yet');
    Sec.append(C.Construct('div', 'stat-grid', [
        C.Construct('div', 'stat-cell', [C.Construct('b', null, FormatInteger(L.strikes)), C.Construct('span', null, 'Total strikes')]),
        C.Construct('div', 'stat-cell', [Hit, C.Construct('span', null, 'Last impact')]),
        C.Construct('div', 'stat-cell', [C.Construct('b', null, L.thunder.enabled ? 'Active' : 'Muted'), C.Construct('span', null, 'Thunder synth')])
    ]));
}

function RenderRecordCard(Page, Title, LinesFn)
{
    const Sec = C.SectionCard(Page, { Title, Glyph: 'Boxes', Badge: 'TOML RECORD', Open: false }).Inner;
    const Block = C.Construct('pre', 'levelspace');
    C.ActionRow(Sec, [{
        Label: 'Copy TOML Record', Glyph: 'Copy',
        Act: () => { navigator.clipboard?.writeText(LinesFn().join('\n')).then(() => C.Toast('TOML record copied')); }
    }]);
    Sec.append(Block);
    C.Register(() => { Block.textContent = LinesFn().join('\n'); });
}

function EncodeEffect(Effect)
{
    const Preset = PE.presetById(Effect.PresetId);
    const Lines = ['[[Records]]', `Identity = "${Effect.Token}"`, 'Type = "ParticleEffect"', `Name = "${Effect.Name}"`, '[Records.Configuration]', `Enabled = ${Effect.P.visible}`, `Preset = "${Effect.PresetId}"`];
    for (const [K, V] of Object.entries(Effect.P))
    {
        if (K === 'visible' || (typeof V === 'object' && !Array.isArray(V))) continue;
        if (JSON.stringify(V) === JSON.stringify(Preset.p[K])) continue;
        const Fmt = Array.isArray(V) ? `[${V.map(N => Number(N.toFixed(3))).join(', ')}]` : typeof V === 'string' ? `"${V}"` : String(Number(V.toFixed(4)));
        const PascalKey = K.charAt(0).toUpperCase() + K.slice(1);
        Lines.push(`${PascalKey} = ${Fmt}`);
    }
    return Lines;
}

function SvgNode(Tag, Attrs = {}, Children = [])
{
    const El = document.createElementNS('http://www.w3.org/2000/svg', Tag);
    for (const [K, V] of Object.entries(Attrs))
    {
        if (V !== undefined && V !== null) El.setAttribute(K, String(V));
    }
    for (const Ch of Children) El.append(Ch);
    return El;
}

let LensGraphicId = 0;

function ConstructCameraInspector(Page)
{
    RenderInspectorTabs([]);
    const Cam = Scene.Camera;

    Page.append(C.Construct('div', 'editor-camera-note',
        'Editor navigation camera · always present. Cannot be deleted or hidden. Components below Editor Camera in the Outliner control Exposure, Heat Distortion, Black Hole & Glitch.'
    ));

    // Quick component jump strip
    const CompStrip = C.Construct('div', 'camera-preset-strip');
    for (const [Cid, CLabel] of [
        ['Camera:Exposure', 'Exposure'],
        ['Camera:Heat', 'Heat Distortion'],
        ['Camera:BlackHole', 'Black Hole'],
        ['Camera:Glitch', 'Glitch']
    ])
    {
        const Btn = C.Construct('button', 'cam-fx-pill', CLabel);
        Btn.type = 'button';
        Btn.addEventListener('click', () => SelectNode(Cid));
        CompStrip.append(Btn);
    }
    Page.append(CompStrip);

    // Card 1: Lens + field of view (exact ProjectZeroEditor / OpticalGraphic.jsx SensorField)
    const LensCard = C.SectionCard(Page, { Title: 'Lens + field of view', Glyph: 'Camera', Badge: 'OPTICS' }).Inner;
    const FocalBig = C.Construct('strong', null, `${Cam.Focal.toFixed(1)}`);
    LensCard.append(C.Construct('div', 'pz-metric', [FocalBig, C.Construct('span', null, 'mm')]));

    const GradId = `sf_${++LensGraphicId}`;
    const SfWrap = C.Construct('div', 'sensor-field');
    const SfSvg = SvgNode('svg', { viewBox: '0 0 640 290', role: 'img' });
    const Defs = SvgNode('defs', {}, [
        SvgNode('linearGradient', { id: GradId }, [
            SvgNode('stop', { 'stop-color': '#b59acc', 'stop-opacity': '.02' }),
            SvgNode('stop', { offset: '1', 'stop-color': '#b59acc', 'stop-opacity': '.12' })
        ])
    ]);
    const SfAxis = SvgNode('path', { d: 'M30 141 H610', stroke: '#b3a5bf25', 'stroke-dasharray': '3 6' });
    const SfEnv = SvgNode('path', { class: 'optical-envelope', fill: `url(#${GradId})`, stroke: '#ae98c7', 'stroke-width': 1 });
    const SfRays = SvgNode('path', { fill: 'none', stroke: '#b79dd0', 'stroke-opacity': '.36', 'stroke-width': '.8' });
    const SfPlate = SvgNode('rect', { x: 68, y: 100, width: 12, height: 82, rx: 3, fill: '#a4b6c51f', stroke: '#b9c7d6', 'stroke-width': 1.2 });
    const SfTicks = [0, 1, 2, 3, 4, 5].map(I => SvgNode('path', { d: `M71 ${108 + I * 13} H77`, stroke: '#d0dae2', 'stroke-width': '.6' }));
    const SfBracket = SvgNode('path', { d: 'M64 94 H57 V187 H64', stroke: '#6d7b8a', fill: 'none', 'stroke-width': '.6' });
    const SfPupilGate = SvgNode('path', { class: 'pupil-gate', stroke: '#b9a5cd', 'stroke-width': 7, 'stroke-linecap': 'round' });
    const SfPupilCaps = SvgNode('path', { stroke: '#e2d0f4', 'stroke-width': 1.2 });
    const SfPlane = SvgNode('path', { stroke: '#d6c6e8', 'stroke-width': 2 });
    const SfPlaneCaps = SvgNode('path', { stroke: '#d6c6e8', 'stroke-width': 1 });
    const SfArc = SvgNode('path', { d: 'M320 111 Q328 141 320 171', stroke: '#a68abb', fill: 'none', 'stroke-width': '.7' });
    const SfFovTxt = SvgNode('text', { x: 342, y: 134, fill: '#ddcbea', 'font-size': 21, 'font-weight': 300 });
    const SfFovSub = SvgNode('text', { x: 343, y: 152, fill: '#8f829d', 'font-size': 8, 'letter-spacing': 1 }, []);
    SfFovSub.textContent = 'HORIZONTAL FOV';
    const SfSensorSizeTxt = SvgNode('text', { x: 75, y: 254, fill: '#737b85', 'font-size': 9 });
    const SfApTxt = SvgNode('text', { x: 235, y: 236, fill: '#c5afd9', 'font-size': 10 });
    const SfPupilTxt = SvgNode('text', { x: 235, y: 254, fill: '#8a7c97', 'font-size': 9 });
    const SfFocusTxt = SvgNode('text', { x: 553, y: 270, fill: '#b5a5c4', 'font-size': 9 });
    const SfLabels = SvgNode('g', { 'text-anchor': 'middle' }, [
        (() => { const T = SvgNode('text', { x: 75, y: 236, fill: '#afbbc8', 'font-size': 10 }); T.textContent = 'Sensor'; return T; })(),
        SfSensorSizeTxt, SfApTxt, SfPupilTxt, SfFocusTxt
    ]);
    const SfFlBar = SvgNode('path', { d: 'M84 211 H225', stroke: '#5d5267', 'stroke-width': '.6' });
    const SfFlTxt = SvgNode('text', { x: 154, y: 206, fill: '#8f819b', 'font-size': 9, 'text-anchor': 'middle' });
    SfSvg.append(Defs, SfAxis, SfEnv, SfRays, SfPlate, ...SfTicks, SfBracket, SfPupilGate, SfPupilCaps, SfPlane, SfPlaneCaps, SfArc, SfFovTxt, SfFovSub, SfLabels, SfFlBar, SfFlTxt);
    SfWrap.append(SfSvg, C.Construct('div', 'sensor-field-caption', [
        C.Construct('span', null, 'Optical schematic · not to scale'),
        C.Construct('span', null, 'Full-frame / 3:2')
    ]));
    LensCard.append(SfWrap);
    Range(LensCard, BindScene(Cam, 'Focal', { Label: 'Focal Length' }, 'VIEW', 'Camera'), 12, 120, 0.5, 1, ' mm');
    const LensFoot = C.Construct('p', 'pz-footnote');
    LensCard.append(LensFoot);

    // Card 2 & 3: Aperture study (Iris) + Subject plane + sharpness (DepthOfField)
    const Grid = C.Construct('div', 'pz-card-grid');

    const ApCard = C.SectionCard(Grid, { Title: 'Aperture study', Glyph: 'Aperture', Badge: 'IRIS' }).Inner;
    const ApMetric = C.Construct('strong', null, `f / ${Cam.Aperture.toFixed(1)}`);
    ApCard.append(C.Construct('div', 'pz-metric', [ApMetric]));
    ApCard.append(C.Construct('p', 'pz-footnote', 'Entrance pupil and acceptable-sharpness limits update together.'));
    const IrisGradId = `ir_${++LensGraphicId}`;
    const IrisWrap = C.Construct('div', 'iris-wrap');
    const IrisSvg = SvgNode('svg', { class: 'iris-graphic', viewBox: '0 0 220 220', role: 'img' });
    const IrisDefs = SvgNode('defs', {}, [
        SvgNode('radialGradient', { id: IrisGradId }, [
            SvgNode('stop', { 'stop-color': '#434047' }),
            SvgNode('stop', { offset: '1', 'stop-color': '#232225' })
        ])
    ]);
    const IrisOuter = SvgNode('circle', { cx: 110, cy: 110, r: 97, fill: '#171717', stroke: '#525052' });
    const IrisInner = SvgNode('circle', { cx: 110, cy: 110, r: 88, fill: `url(#${IrisGradId})`, stroke: '#454247' });
    const IrisTicks = Array.from({ length: 48 }, (_, I) => SvgNode('path', { d: 'M110 16 V20', transform: `rotate(${I * 7.5} 110 110)`, stroke: '#7a747e', 'stroke-width': '.6' }));
    const IrisBlades = Array.from({ length: 8 }, (_, I) => SvgNode('path', { fill: I % 2 ? '#39363e' : '#343238', stroke: '#79717e', 'stroke-width': '.65' }));
    const IrisPoly = SvgNode('polygon', { fill: '#101014', stroke: '#b7a7c4', 'stroke-width': 1 });
    const IrisGlow = SvgNode('circle', { cx: 110, cy: 110, r: 20, fill: '#9690b607' });
    const IrisDot = SvgNode('circle', { cx: 110, cy: 110, r: 2, fill: '#c1b6cd', opacity: '.6' });
    IrisSvg.append(IrisDefs, IrisOuter, IrisInner, ...IrisTicks, ...IrisBlades, IrisPoly, IrisGlow, IrisDot);
    IrisWrap.append(IrisSvg);
    ApCard.append(IrisWrap);
    Range(ApCard, BindScene(Cam, 'Aperture', { Label: 'Aperture' }, 'VIEW', 'Camera'), 1.4, 16.0, 0.1, 1, ' f/');
    const ApFoot = C.Construct('p', 'pz-footnote');
    ApCard.append(ApFoot);

    const DofCard = C.SectionCard(Grid, { Title: 'Subject plane + sharpness', Glyph: 'Target', Badge: 'DOF' }).Inner;
    const DofMetric = C.Construct('strong', null, `${Cam.SubjectDistance.toFixed(1)}`);
    DofCard.append(C.Construct('div', 'pz-metric', [DofMetric, C.Construct('span', null, 'm')]));
    DofCard.append(C.Construct('p', 'pz-footnote', 'Drag the subject plane. Thin-lens diagnostic · circle of confusion 0.03 mm.'));
    const DofWrap = C.Construct('div', 'depth-of-field');
    const DofSvg = SvgNode('svg', { viewBox: '0 0 360 174', role: 'img' });
    const DofBg = SvgNode('rect', { x: 22, y: 31, width: 316, height: 90, rx: 9, fill: '#18191c', stroke: '#ffffff08' });
    const DofSharp = SvgNode('rect', { class: 'dof-sharp-region', y: 32, height: 88, fill: '#8eacd323' });
    const DofBounds = SvgNode('path', { stroke: '#a3badb', 'stroke-opacity': '.55', 'stroke-dasharray': '3 5' });
    const DofScaleX = M => 22 + (Math.log1p(Math.min(100, Math.max(0, M))) / Math.log1p(100)) * 316;
    const DofScaleNodes = [1, 3, 10, 30, 100].map(M =>
    {
        const T = SvgNode('text', { x: DofScaleX(M), y: 144, 'text-anchor': 'middle', 'font-size': 9, fill: '#7e899b' });
        T.textContent = `${M} m`;
        return SvgNode('g', {}, [SvgNode('path', { d: `M${DofScaleX(M)} 120 V125`, stroke: '#6e788a' }), T]);
    });
    const DofPins = Array.from({ length: 17 }, (_, I) =>
    {
        const Xx = 30 + I * 18.5;
        return { Xx, El: SvgNode('path', { d: `M${Xx - 3} 62 H${Xx + 3} M${Xx} 55 V93 M${Xx - 3} 86 H${Xx + 3}`, stroke: '#aabbd1', 'stroke-width': '.7' }) };
    });
    const DofPlaneLine = SvgNode('path', { stroke: '#d2dff1', 'stroke-width': 1.2 });
    const DofPlaneTri = SvgNode('path', { fill: '#d2dff1' });
    const DofKnobCircle = SvgNode('circle', { cy: 76, r: 9, fill: '#1f2937', stroke: '#c4d7ee' });
    const DofKnobCross = SvgNode('path', { stroke: '#e3edf7' });
    const DofScaleLbl = SvgNode('text', { x: 22, y: 168, fill: '#7e899b', 'font-size': 8, 'letter-spacing': 1 });
    DofScaleLbl.textContent = 'DISTANCE · LOG SCALE';
    DofSvg.append(DofBg, DofSharp, DofBounds, ...DofScaleNodes, ...DofPins.map(P => P.El), DofPlaneLine, DofPlaneTri, DofKnobCircle, DofKnobCross, DofScaleLbl);
    DofWrap.append(DofSvg);
    DofCard.append(DofWrap);

    let DragDof = false;
    const UpdateDof = Ev =>
    {
        const Box = DofSvg.getBoundingClientRect();
        const Scale = Math.min(Box.width / 360, Box.height / 174);
        if (!Scale) return;
        const Px = (Ev.clientX - Box.left - (Box.width - 360 * Scale) / 2) / Scale;
        Cam.SubjectDistance = Math.round(Clamp(Math.expm1(((Px - 22) / 316) * Math.log1p(100)), 1, 100));
        C.Broadcast();
    };
    DofSvg.addEventListener('pointerdown', Ev => { DofSvg.setPointerCapture?.(Ev.pointerId); DragDof = true; UpdateDof(Ev); });
    DofSvg.addEventListener('pointermove', Ev => { if (DragDof) UpdateDof(Ev); });
    DofSvg.addEventListener('pointerup', () => { DragDof = false; });
    DofSvg.addEventListener('pointercancel', () => { DragDof = false; });

    Range(DofCard, BindScene(Cam, 'SubjectDistance', { Label: 'Subject Distance' }, 'VIEW', 'Camera'), 1, 100, 0.5, 1, ' m');
    const DofFoot = C.Construct('p', 'pz-footnote');
    DofCard.append(DofFoot);
    Page.append(Grid);

    // Card 4: Optical Bloom (directly adjustable on Editor Camera & synced with Exposure Lens Effects)
    const Exp = Scene.CameraComponents.Exposure;
    const BloomCard = C.SectionCard(Page, { Title: 'Bloom', Glyph: 'Sparkles', Badge: 'OPTICAL GLOW' }).Inner;
    C.SwitchRow(BloomCard, BindScene(Exp, 'BloomEnabled', { Label: 'Bloom enabled' }, 'VIEW', 'Bloom'));
    Range(BloomCard, BindScene(Exp, 'Bloom', { Label: 'Bloom intensity' }, 'VIEW', 'Bloom'), 0.0, 2.0, 0.02, 2, '');
    Range(BloomCard, BindScene(Exp, 'BloomThreshold', { Label: 'Luminance threshold' }, 'VIEW', 'Bloom'), 0.0, 1.0, 0.02, 2, '');
    Range(BloomCard, BindScene(Exp, 'BloomRadius', { Label: 'Halo spread radius' }, 'VIEW', 'Bloom'), 0.3, 3.0, 0.05, 2, '×');
    Range(BloomCard, BindScene(Exp, 'BloomKnee', { Label: 'Soft knee falloff' }, 'VIEW', 'Bloom'), 0.05, 0.8, 0.02, 2, '');

    // Card 5: Sensor / support
    const SensorCard = C.SectionCard(Page, { Title: 'Sensor / support', Glyph: 'Sliders', Badge: 'FULL FRAME' }).Inner;
    Range(SensorCard, BindScene(Cam, 'SensorWidth', { Label: 'Sensor Width' }, 'VIEW', 'Camera'), 16, 70, 0.5, 1, ' mm');
    const SensorFoot = C.Construct('p', 'pz-footnote');
    SensorCard.append(SensorFoot);

    // Card 6: Viewport orbit rig
    const RigCard = C.SectionCard(Page, { Title: 'Viewport orbit rig', Glyph: 'Compass', Badge: 'RIG', Open: false }).Inner;
    Range(RigCard, BindScene(Cam, 'Distance', { Label: 'Orbit distance' }, 'VIEW', 'Camera'), 2.2, 34, 0.2, 1, ' m');
    Range(RigCard, {
        Label: 'Pitch elevation', Minimum: -75, Maximum: 82, Step: 1, Digits: 0, Unit: '°',
        Read: () => (Cam.Pitch * 180) / Math.PI,
        Write: V => { Cam.Pitch = Clamp((V * Math.PI) / 180, -1.32, 1.44); }
    }, -75, 82, 1, 0, '°');
    Range(RigCard, {
        Label: 'Yaw azimuth', Minimum: -180, Maximum: 180, Step: 1, Digits: 0, Unit: '°',
        Read: () => (((Cam.Yaw * 180) / Math.PI + 540) % 360) - 180,
        Write: V => { Cam.Yaw = (V * Math.PI) / 180; }
    }, -180, 180, 1, 0, '°');
    C.ActionRow(RigCard, [{
        Label: 'Reset Framing & Optics', Glyph: 'Reset',
        Act: () =>
        {
            Object.assign(Cam, { Yaw: 0.62, Pitch: 0.34, Distance: 12.2, Target: [0, 1.5, 0], Focal: 29, SensorWidth: 36, Aperture: 2.8, SubjectDistance: 12 });
            AppendLog('VIEW', 'Reset Editor Camera optics & framing', null, 'live');
            C.Broadcast();
        }
    }]);

    C.Register(() =>
    {
        const Opt = ComputeCameraOptics(Cam);
        FocalBig.textContent = Cam.Focal.toFixed(1);
        ApMetric.textContent = `f / ${Cam.Aperture.toFixed(1)}`;
        DofMetric.textContent = Cam.SubjectDistance.toFixed(1);

        // SensorField update
        const Extent = 34 + Opt.horizontalFov * 0.85;
        const Gap = 8 + Math.min(38, Opt.pupil * 0.75);
        SfEnv.setAttribute('d', `M235 141 L553 ${(141 - Extent).toFixed(1)} V${(141 + Extent).toFixed(1)} Z`);
        SfRays.setAttribute('d', `M78 107 L235 141 L553 ${(141 + Extent).toFixed(1)} M78 175 L235 141 L553 ${(141 - Extent).toFixed(1)}`);
        SfPupilGate.setAttribute('d', `M235 72 V${(141 - Gap).toFixed(1)} M235 ${(141 + Gap).toFixed(1)} V210`);
        SfPupilCaps.setAttribute('d', `M225 ${(141 - Gap).toFixed(1)} H245 M225 ${(141 + Gap).toFixed(1)} H245`);
        SfPlane.setAttribute('d', `M553 ${(141 - Extent).toFixed(1)} V${(141 + Extent).toFixed(1)}`);
        SfPlaneCaps.setAttribute('d', `M545 ${(141 - Extent).toFixed(1)} H562 M545 ${(141 + Extent).toFixed(1)} H562`);
        SfFovTxt.textContent = `${Opt.horizontalFov.toFixed(1)}°`;
        SfSensorSizeTxt.textContent = `${Cam.SensorWidth.toFixed(1)} × ${(Cam.SensorWidth / 1.5).toFixed(1)} mm`;
        SfApTxt.textContent = `ƒ/${Cam.Aperture.toFixed(1)}`;
        SfPupilTxt.textContent = `Ø ${Opt.pupil.toFixed(1)} mm pupil`;
        SfFocusTxt.textContent = `Focus plane · ${Cam.SubjectDistance.toFixed(1)} m`;
        SfFlTxt.textContent = `${Cam.Focal.toFixed(0)} mm`;
        LensFoot.textContent = `Vertical FOV ${Opt.verticalFov.toFixed(1)}° · frame at subject ${Opt.frameWidth.toFixed(2)} × ${Opt.frameHeight.toFixed(2)} m`;
        ApFoot.textContent = `Pupil diameter ${Opt.pupil.toFixed(1)} mm`;

        // Iris 8-blade update (FrontierEditor property-graphics.jsx)
        const Opening = Clamp((16 / Cam.Aperture - 1) / (16 / 1.4 - 1), 0, 1);
        const Rad = 10 + Opening * 47;
        const Pt = (A, R) => [110 + Math.cos(A) * R, 110 + Math.sin(A) * R];
        const PolyPts = [];
        for (let I = 0; I < 8; I++)
        {
            const A = (I * Math.PI) / 4;
            const P = Pt(A, Rad), Q = Pt(A + Math.PI / 4, Rad), O = Pt(A + 1.07, 86), N = Pt(A + 0.29, 86);
            IrisBlades[I].setAttribute('d', `M${P[0].toFixed(1)},${P[1].toFixed(1)} L${Q[0].toFixed(1)},${Q[1].toFixed(1)} L${O[0].toFixed(1)},${O[1].toFixed(1)} A86 86 0 0 0 ${N[0].toFixed(1)},${N[1].toFixed(1)}Z`);
            PolyPts.push(`${P[0].toFixed(1)},${P[1].toFixed(1)}`);
        }
        IrisPoly.setAttribute('points', PolyPts.join(' '));
        IrisGlow.setAttribute('r', (Rad * 0.55).toFixed(1));

        // DepthOfField log scale update
        const NearX = DofScaleX(Opt.near);
        const FarX = Number.isFinite(Opt.far) ? DofScaleX(Opt.far) : 338;
        const PlaneX = DofScaleX(Cam.SubjectDistance);
        DofSharp.setAttribute('x', NearX.toFixed(1));
        DofSharp.setAttribute('width', Math.max(1, FarX - NearX).toFixed(1));
        DofBounds.setAttribute('d', `M${NearX.toFixed(1)} 32 V120 M${FarX.toFixed(1)} 32 V120`);
        for (const Pin of DofPins)
        {
            const Sharp = Pin.Xx >= NearX && Pin.Xx <= FarX;
            Pin.El.setAttribute('opacity', Sharp ? '0.75' : '0.2');
            Pin.El.style.filter = Sharp ? 'none' : 'blur(1.7px)';
        }
        DofPlaneLine.setAttribute('d', `M${PlaneX.toFixed(1)} 21 V121`);
        DofPlaneTri.setAttribute('d', `M${(PlaneX - 5).toFixed(1)} 16 L${(PlaneX + 5).toFixed(1)} 16 L${PlaneX.toFixed(1)} 23Z`);
        DofKnobCircle.setAttribute('cx', PlaneX.toFixed(1));
        DofKnobCross.setAttribute('d', `M${(PlaneX - 3).toFixed(1)} 76 H${(PlaneX + 3).toFixed(1)} M${PlaneX.toFixed(1)} 73 V79`);
        DofFoot.textContent = `Near ${Opt.near.toFixed(1)} m / far ${Number.isFinite(Opt.far) ? `${Opt.far.toFixed(1)} m` : 'infinity'}`;
        SensorFoot.textContent = `Aspect ${Opt.aspect.toFixed(3)} · hyperfocal ${Opt.hyperfocal.toFixed(1)} m · pinhole renderer`;
    });
}

function ConstructExposureInspector(Page)
{
    RenderInspectorTabs([]);
    const Exp = Scene.CameraComponents.Exposure;

    Page.append(C.Construct('div', 'editor-camera-note',
        'Post Process / Exposure · child component of Editor Camera. Controls EV compensation, saturation, contrast, highlight bloom, and optical vignette.'
    ));

    // Group 1: Exposure (ProjectZeroEditor NativePanels.json `post`)
    const EvSec = C.SectionCard(Page, { Title: 'Exposure', Glyph: 'Exposure', Badge: 'EV' }).Inner;
    const EvBox = C.Construct('div', 'cam-graphic-box');
    const EvSvg = SvgNode('svg', { viewBox: '0 0 260 88' });
    const EvBg = SvgNode('rect', { x: 0, y: 0, width: 260, height: 88, rx: 6, fill: 'rgba(10, 14, 20, 0.45)' });
    const EvDiag = SvgNode('line', { x1: 14, y1: 74, x2: 246, y2: 14, stroke: 'rgba(255,255,255,0.12)', 'stroke-dasharray': '3 3' });
    const EvCurve = SvgNode('path', { fill: 'none', stroke: '#f5c451', 'stroke-width': 2, 'stroke-linecap': 'round' });
    const EvBadge = SvgNode('text', { x: 246, y: 20, 'text-anchor': 'end', fill: '#f5c451', 'font-size': 10.5, 'font-family': 'var(--mono)' });
    EvSvg.append(EvBg, EvDiag, EvCurve, EvBadge);
    EvBox.append(EvSvg);
    EvSec.append(EvBox);
    Range(EvSec, BindScene(Exp, 'EV', { Label: 'EV Compensation' }, 'VIEW', 'Exposure'), -4.0, 4.0, 0.05, 2, ' EV');

    // Group 2: Tone Mapping
    const ToneSec = C.SectionCard(Page, { Title: 'Tone Mapping', Glyph: 'Palette', Badge: 'GRADE' }).Inner;
    Range(ToneSec, BindScene(Exp, 'Saturation', { Label: 'Saturation' }, 'VIEW', 'Exposure'), 0.0, 2.0, 0.02, 2, '');
    Range(ToneSec, BindScene(Exp, 'Contrast', { Label: 'Contrast' }, 'VIEW', 'Exposure'), 0.5, 2.0, 0.02, 2, '');

    // Group 3: Lens Effects
    const LensSec = C.SectionCard(Page, { Title: 'Lens Effects', Glyph: 'Aperture', Badge: 'OPTICAL' }).Inner;
    C.SwitchRow(LensSec, BindScene(Exp, 'BloomEnabled', { Label: 'Bloom enabled' }, 'VIEW', 'Exposure'));
    Range(LensSec, BindScene(Exp, 'Bloom', { Label: 'Bloom Intensity' }, 'VIEW', 'Exposure'), 0.0, 2.0, 0.02, 2, '');
    Range(LensSec, BindScene(Exp, 'BloomThreshold', { Label: 'Bloom Threshold' }, 'VIEW', 'Exposure'), 0.0, 1.0, 0.02, 2, '');
    Range(LensSec, BindScene(Exp, 'BloomRadius', { Label: 'Bloom Radius' }, 'VIEW', 'Exposure'), 0.3, 3.0, 0.05, 2, '×');
    Range(LensSec, BindScene(Exp, 'BloomKnee', { Label: 'Bloom Soft Knee' }, 'VIEW', 'Exposure'), 0.05, 0.8, 0.02, 2, '');
    Range(LensSec, BindScene(Exp, 'Vignette', { Label: 'Vignette' }, 'VIEW', 'Exposure'), 0.0, 1.0, 0.02, 2, '');

    C.Register(() =>
    {
        const Gain = Exp.Enabled ? Math.pow(2, Exp.EV || 0) : 1.0;
        const Ctr = Exp.Enabled ? (Exp.Contrast || 1) : 1.0;
        let D = '';
        for (let I = 0; I <= 24; I++)
        {
            const X = I / 24;
            const Y = Clamp((X * Gain - 0.5) * Ctr + 0.5, 0, 1);
            const Sx = 14 + X * 232;
            const Sy = 74 - Y * 60;
            D += (I === 0 ? `M ${Sx.toFixed(1)} ${Sy.toFixed(1)}` : ` L ${Sx.toFixed(1)} ${Sy.toFixed(1)}`);
        }
        EvCurve.setAttribute('d', D);
        EvCurve.setAttribute('opacity', Exp.Enabled ? '1' : '0.3');
        EvBadge.textContent = Exp.Enabled ? `${Exp.EV >= 0 ? '+' : ''}${Exp.EV.toFixed(2)} EV` : 'BYPASSED';
    });
}

function RenderActiveSourceChips(Host, List, EmptyText)
{
    const Wrap = C.Construct('div', 'vfx-chip-list');
    Host.append(Wrap);
    C.Register(() =>
    {
        Wrap.textContent = '';
        const Items = List();
        if (!Items.length)
        {
            Wrap.append(C.Construct('span', 'vfx-source-chip empty', [C.Construct('i'), C.Construct('span', null, EmptyText)]));
            return;
        }
        for (const Item of Items)
        {
            Wrap.append(C.Construct('span', 'vfx-source-chip', [C.Construct('i'), C.Construct('span', null, Item.Label)]));
        }
    });
}

function ConstructHeatComponentInspector(Page)
{
    RenderInspectorTabs([]);
    const Heat = Scene.CameraComponents.Heat;

    Page.append(C.Construct('div', 'editor-camera-note',
        'Heat Distortion component · drives thermal air-refraction ripples automatically wherever heat shimmer, fire/explosion particles, or thermal fields exist in the scene.'
    ));

    const AutoEnableBind = (Comp, TargetKey, Label, Sub = 'Heat') =>
    {
        const B = BindScene(Comp, TargetKey, { Label }, 'VIEW', Sub);
        const Prev = B.Write;
        B.Write = V => { if (V !== false) Comp.Enabled = true; Prev(V); };
        return B;
    };

    const SrcCard = C.SectionCard(Page, { Title: 'Scene heat sources', Glyph: 'HeatLens', Badge: 'ACTIVE TARGETS' }).Inner;
    C.SwitchRow(SrcCard, BindScene(Heat, 'Enabled', { Label: 'Heat distortion enabled' }, 'VIEW', 'Heat'));
    C.SwitchRow(SrcCard, BindScene(Heat, 'IncludeFireParticles', { Label: 'Track fire, embers & hot particles' }, 'VIEW', 'Heat'));
    C.SwitchRow(SrcCard, BindScene(Heat, 'IncludeThermalFields', { Label: 'Track Thermal & Blast force zones' }, 'VIEW', 'Heat'));
    C.SwitchRow(SrcCard, AutoEnableBind(Heat, 'HorizonMirage', 'Global desert horizon mirage', 'Heat'));
    RenderActiveSourceChips(SrcCard, DetectHeatSources, 'No heat emitters in scene — spawn Heat Shimmer or Fire');
    C.ActionRow(SrcCard, [{
        Label: 'Add Heat Shimmer Emitter', Glyph: 'Plus', Tone: 'accent',
        Act: () => { AddEffect('heat-shimmer'); }
    }]);

    const ParamCard = C.SectionCard(Page, { Title: 'Refraction parameters', Glyph: 'Sliders', Badge: 'SHIMMER' }).Inner;
    const HeatBox = C.Construct('div', 'cam-graphic-box');
    const HeatSvg = SvgNode('svg', { viewBox: '0 0 260 88' });
    const HeatBg = SvgNode('rect', { x: 0, y: 0, width: 260, height: 88, rx: 6, fill: 'rgba(10, 14, 20, 0.45)' });
    const HeatWaves = [0, 1, 2, 3].map(() => SvgNode('path', { fill: 'none', stroke: '#f5a65b', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
    const HeatStatus = SvgNode('text', { x: 248, y: 18, 'text-anchor': 'end', fill: '#f5a65b', 'font-size': 10, 'font-family': 'var(--mono)' });
    HeatSvg.append(HeatBg, ...HeatWaves, HeatStatus);
    HeatBox.append(HeatSvg);
    ParamCard.append(HeatBox);

    Range(ParamCard, AutoEnableBind(Heat, 'StrengthScale', 'Refraction intensity', 'Heat'), 0.1, 3.0, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(Heat, 'FrequencyScale', 'Wave frequency', 'Heat'), 0.25, 2.5, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(Heat, 'RateScale', 'Convection speed', 'Heat'), 0.2, 3.0, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(Heat, 'RadiusScale', 'Thermal plume radius', 'Heat'), 0.4, 3.0, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(Heat, 'HorizonCutoff', 'Horizon cutoff', 'Heat'), 0.0, 0.95, 0.02, 2, '');

    C.Register(() =>
    {
        const Active = Heat.Enabled;
        const Amp = Active ? Clamp(Heat.StrengthScale * 5.2, 1.5, 11) : 1.2;
        const Cycles = Clamp(Heat.FrequencyScale * 2.5, 1.2, 6.5);
        HeatWaves.forEach((W, Idx) =>
        {
            const Y0 = 20 + Idx * 16;
            let D = '';
            for (let S = 0; S <= 28; S++)
            {
                const T = S / 28;
                const Px = 14 + T * 232;
                const Py = Y0 + Math.sin(T * Math.PI * 2 * Cycles + Idx * 1.1) * Amp;
                D += (S === 0 ? `M ${Px.toFixed(1)} ${Py.toFixed(1)}` : ` L ${Px.toFixed(1)} ${Py.toFixed(1)}`);
            }
            W.setAttribute('d', D);
            W.setAttribute('opacity', Active ? '0.88' : '0.25');
        });
        const Cnt = DetectHeatSources().length;
        HeatStatus.textContent = Active ? `${Cnt} HEAT ZONE${Cnt === 1 ? '' : 'S'} · ${Heat.StrengthScale.toFixed(2)}×` : 'DISABLED';
    });
}

function ConstructBlackHoleComponentInspector(Page)
{
    RenderInspectorTabs([]);
    const BH = Scene.CameraComponents.BlackHole;

    Page.append(C.Construct('div', 'editor-camera-note',
        'Black Hole Distortion component · applies gravitational ray-bending and photon-ring lensing around black-hole particle systems or a camera singularity.'
    ));

    const AutoEnableBind = (Comp, TargetKey, Label, Sub = 'BlackHole') =>
    {
        const B = BindScene(Comp, TargetKey, { Label }, 'VIEW', Sub);
        const Prev = B.Write;
        B.Write = V => { if (V !== false) Comp.Enabled = true; Prev(V); };
        return B;
    };

    const SrcCard = C.SectionCard(Page, { Title: 'Gravitational lensing targets', Glyph: 'BlackHoleLens', Badge: 'RELATIVITY' }).Inner;
    C.SwitchRow(SrcCard, BindScene(BH, 'Enabled', { Label: 'Black hole distortion enabled' }, 'VIEW', 'BlackHole'));
    C.SwitchRow(SrcCard, BindScene(BH, 'TrackParticleHoles', { Label: 'Track Black Hole particle emitters' }, 'VIEW', 'BlackHole'));
    C.SwitchRow(SrcCard, AutoEnableBind(BH, 'CameraSingularity', 'Additional camera-anchored singularity', 'BlackHole'));
    RenderActiveSourceChips(SrcCard, DetectBlackHoleSources, 'No black-hole emitters in scene — spawn Black Hole preset');
    C.ActionRow(SrcCard, [{
        Label: 'Add Black Hole Emitter', Glyph: 'Plus', Tone: 'accent',
        Act: () => { AddEffect('black-hole'); }
    }]);

    const ParamCard = C.SectionCard(Page, { Title: 'Schwarzschild lens optics', Glyph: 'Sliders', Badge: 'METRIC' }).Inner;
    const BhBox = C.Construct('div', 'cam-graphic-box');
    const BhSvg = SvgNode('svg', { viewBox: '0 0 260 102' });
    const BhBg = SvgNode('rect', { x: 0, y: 0, width: 260, height: 102, rx: 6, fill: 'rgba(10, 14, 20, 0.55)' });
    const BhRays = [-3, -2, -1, 1, 2, 3].map(() => SvgNode('path', { fill: 'none', stroke: 'rgba(122, 168, 232, 0.52)', 'stroke-width': 1.1 }));
    const BhRing = SvgNode('circle', { cx: 130, cy: 51, r: 22, fill: 'none', stroke: '#f5b855', 'stroke-width': 3.5 });
    const BhCore = SvgNode('circle', { cx: 130, cy: 51, r: 12, fill: '#05070a', stroke: 'rgba(255, 224, 150, 0.85)', 'stroke-width': 1 });
    const BhTxt = SvgNode('text', { x: 248, y: 18, 'text-anchor': 'end', fill: '#f5b855', 'font-size': 10, 'font-family': 'var(--mono)' });
    BhSvg.append(BhBg, ...BhRays, BhRing, BhCore, BhTxt);
    BhBox.append(BhSvg);
    ParamCard.append(BhBox);

    Range(ParamCard, AutoEnableBind(BH, 'HorizonScale', 'Event horizon scale', 'BlackHole'), 0.25, 2.5, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(BH, 'EinsteinScale', 'Einstein deflection', 'BlackHole'), 0.3, 2.5, 0.05, 2, '×');
    Range(ParamCard, AutoEnableBind(BH, 'Glow', 'Photon ring glow', 'BlackHole'), 0.0, 1.2, 0.02, 2, '');

    const OriginSec = C.SectionCard(Page, { Title: 'Camera singularity anchor', Glyph: 'Target', Badge: 'OVERRIDE', Open: false }).Inner;
    const SetBhAxis = (Idx, Name) => ({ Label: Name, Read: () => BH.Centre[Idx], Write: V => { BH.Centre[Idx] = V; } });
    Range(OriginSec, SetBhAxis(0, 'Anchor X'), -6, 6, 0.1, 1, ' m');
    Range(OriginSec, SetBhAxis(1, 'Anchor Y'), 0.2, 6, 0.1, 1, ' m');
    Range(OriginSec, SetBhAxis(2, 'Anchor Z'), -6, 6, 0.1, 1, ' m');

    C.Register(() =>
    {
        const Active = BH.Enabled;
        const CoreR = Clamp(BH.HorizonScale * 11, 5, 22);
        const EinR = Clamp(CoreR * (1.2 + BH.EinsteinScale * 0.45), CoreR + 4, 42);
        BhCore.setAttribute('r', CoreR.toFixed(1));
        BhRing.setAttribute('r', EinR.toFixed(1));
        BhRing.setAttribute('stroke-opacity', Active ? Clamp(0.25 + BH.Glow * 0.75, 0.2, 1) : 0.2);
        BhCore.setAttribute('opacity', Active ? '1' : '0.35');
        const Deflect = Active ? Clamp(BH.EinsteinScale * 12, 4, 24) : 2.5;
        const Offsets = [-3, -2, -1, 1, 2, 3];
        BhRays.forEach((Ray, Idx) =>
        {
            const By = 51 + Offsets[Idx] * 11;
            const Sign = Offsets[Idx] > 0 ? 1 : -1;
            const Bend = Deflect / (0.6 + Math.abs(Offsets[Idx]));
            Ray.setAttribute('d', `M 14 ${By} Q 130 ${(By + Sign * Bend).toFixed(1)} 246 ${By}`);
            Ray.setAttribute('opacity', Active ? '0.85' : '0.25');
        });
        const Cnt = DetectBlackHoleSources().length;
        BhTxt.textContent = Active ? `${Cnt} LENS · ${BH.EinsteinScale.toFixed(2)}×` : 'DISABLED';
    });
}

function ConstructGlitchComponentInspector(Page)
{
    RenderInspectorTabs([]);
    const Gl = Scene.CameraComponents.Glitch;

    Page.append(C.Construct('div', 'editor-camera-note',
        'Glitch component · applies horizontal scanline tearing and RGB chromatic split around active glitch particle systems (or across the full frame).'
    ));

    const AutoEnableBind = (Comp, TargetKey, Label, Sub = 'Glitch') =>
    {
        const B = BindScene(Comp, TargetKey, { Label }, 'VIEW', Sub);
        const Prev = B.Write;
        B.Write = V => { if (V !== false) Comp.Enabled = true; Prev(V); };
        return B;
    };

    const SrcCard = C.SectionCard(Page, { Title: 'Glitch targets & scope', Glyph: 'GlitchLens', Badge: 'SIGNAL' }).Inner;
    C.SwitchRow(SrcCard, BindScene(Gl, 'Enabled', { Label: 'Glitch distortion enabled' }, 'VIEW', 'Glitch'));
    C.SwitchRow(SrcCard, BindScene(Gl, 'TrackGlitchParticles', { Label: 'Track Glitch particle emitters' }, 'VIEW', 'Glitch'));
    C.SwitchRow(SrcCard, AutoEnableBind(Gl, 'FullFrame', 'Full-frame glitch scanlines', 'Glitch'));
    RenderActiveSourceChips(SrcCard, DetectGlitchSources, 'No glitch emitters in scene — spawn Glitch Dissolve');
    C.ActionRow(SrcCard, [{
        Label: 'Add Glitch Dissolve Emitter', Glyph: 'Plus', Tone: 'accent',
        Act: () => { AddEffect('glitch-dissolve'); }
    }]);

    const ParamCard = C.SectionCard(Page, { Title: 'Scanline & chromatic parameters', Glyph: 'Sliders', Badge: 'TEAR' }).Inner;
    const GlBox = C.Construct('div', 'cam-graphic-box');
    const GlSvg = SvgNode('svg', { viewBox: '0 0 260 84' });
    const GlFrame = SvgNode('rect', { x: 14, y: 10, width: 232, height: 64, rx: 6, fill: 'rgba(10, 14, 20, 0.55)', stroke: 'rgba(255,255,255,0.12)' });
    const GlBarC = SvgNode('rect', { x: 40, y: 26, width: 120, height: 6, rx: 2, fill: '#00ffd0' });
    const GlBarM = SvgNode('rect', { x: 90, y: 40, width: 132, height: 6, rx: 2, fill: '#ff2d6f' });
    const GlBarW = SvgNode('rect', { x: 52, y: 54, width: 110, height: 5, rx: 2, fill: '#e6edf6' });
    const GlTxt = SvgNode('text', { x: 238, y: 24, 'text-anchor': 'end', fill: '#72e8cf', 'font-size': 10, 'font-family': 'var(--mono)' });
    GlSvg.append(GlFrame, GlBarC, GlBarM, GlBarW, GlTxt);
    GlBox.append(GlSvg);
    ParamCard.append(GlBox);

    Range(ParamCard, AutoEnableBind(Gl, 'Intensity', 'Glitch intensity', 'Glitch'), 0.0, 1.0, 0.02, 2, '');
    Range(ParamCard, AutoEnableBind(Gl, 'Chromatic', 'Chromatic split', 'Glitch'), 0.0, 1.0, 0.02, 2, '');
    Range(ParamCard, AutoEnableBind(Gl, 'RadiusScale', 'Particle zone radius', 'Glitch'), 0.4, 3.0, 0.05, 2, '×');

    C.Register(() =>
    {
        const Active = Gl.Enabled;
        const Op = Active ? Clamp(0.25 + Gl.Intensity * 0.7, 0.2, 0.95) : 0.18;
        GlBarC.setAttribute('opacity', Op.toFixed(2));
        GlBarM.setAttribute('opacity', Op.toFixed(2));
        GlBarW.setAttribute('opacity', Op.toFixed(2));
        GlBarC.setAttribute('x', (40 - Gl.Chromatic * 14).toFixed(1));
        GlBarM.setAttribute('x', (90 + Gl.Chromatic * 14).toFixed(1));
        const Cnt = DetectGlitchSources().length;
        GlTxt.textContent = Active ? `${Cnt} ZONE${Cnt === 1 ? '' : 'S'} · ${Math.round(Gl.Intensity * 100)}%` : 'DISABLED';
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                          CONTROLVEHICLE HMI, INSPECTION MODES & DRAG-AND-DROP RIPPLE
//------------------------------------------------------------------------------------------------------------------------

function SyncVehicleScanHud()
{
    const Hud = document.getElementById('XrayScanHud');
    const CoordEl = document.getElementById('XrayScanCoord');
    const FillEl = document.getElementById('XrayScanFill');
    if (!Hud) return;
    const V = Scene.Vehicle;
    const Show = !!(V?.Enabled && V.Mode === 'scan');
    Hud.hidden = !Show;
    if (!Show) return;
    const T = Clamp((V.ScanTime % Math.max(0.2, V.ScanPeriod)) / Math.max(0.2, V.ScanPeriod), 0, 1);
    const P = Math.min(1, T / 0.85);
    const PlaneX = V.ScanReverse ? (-3.35 + (3.25 - -3.35) * P) : (3.25 + (-3.35 - 3.25) * P);
    if (CoordEl) CoordEl.textContent = `X = ${PlaneX >= 0 ? '+' : ''}${PlaneX.toFixed(2)} m`;
    if (FillEl) FillEl.style.width = `${Math.round(P * 100)}%`;
}

function SyncVehicleHmiDock()
{
    const Dock = document.getElementById('VehicleHmiDock');
    if (!Dock) return;
    const V = Scene.Vehicle;
    Dock.hidden = !V?.Enabled;
    if (!V?.Enabled) return;

    const SelBtn = document.getElementById('veh-dock-select');
    if (SelBtn) SelBtn.classList.toggle('active', Selected === 'Vehicle');

    const ModeHost = document.getElementById('veh-mode-pills');
    if (ModeHost)
    {
        for (const Btn of ModeHost.querySelectorAll('button[data-veh-mode]'))
            Btn.classList.toggle('active', Btn.dataset.vehMode === V.Mode);
    }

    const FinHost = document.getElementById('veh-finish-pills');
    if (FinHost)
    {
        for (const Btn of FinHost.querySelectorAll('button[data-veh-finish]'))
            Btn.classList.toggle('active', (Btn.dataset.vehFinish === 'matte') === !!V.Matte);
    }

    const PaintHost = document.getElementById('veh-paint-swatches');
    if (PaintHost)
    {
        for (const Btn of PaintHost.querySelectorAll('[data-paint-id]'))
            Btn.classList.toggle('active', Btn.dataset.paintId === V.PaintOpt.id);
    }

    const RimHost = document.getElementById('veh-rim-swatches');
    if (RimHost)
    {
        for (const Btn of RimHost.querySelectorAll('[data-rim-id]'))
            Btn.classList.toggle('active', Btn.dataset.rimId === V.RimOpt.id);
    }

    const AeroBtn = document.getElementById('veh-dock-aero');
    if (AeroBtn)
    {
        const HasAero = Scene.Effects.some(E => E.PresetId === 'curl-streamlines' || E.PresetId === 'wind-dust');
        AeroBtn.classList.toggle('active', HasAero);
    }
    SyncVehicleScanHud();
}

function ApplyVehicleMaterialDrop(Kind, Opt, ClientX, ClientY, IsDrop)
{
    const V = Scene.Vehicle;
    if (!V) return;
    let HitPoint = null;
    if (IsDrop && Scene.LastCamera && V.Enabled && V.Mesh)
    {
        const Canvas = document.getElementById('ViewportCanvas');
        const Ray = UnprojectViewportRay(Scene.LastCamera, ClientX, ClientY, Canvas);
        if (Ray)
        {
            const Hit = RaycastVehicle(Ray.origin, Ray.dir, V, V.Mesh);
            if (Hit) HitPoint = Hit.localPoint || Hit.point;
        }
    }
    if (Kind === 'rim')
    {
        TriggerRimRipple(V, Opt.id, HitPoint || null);
        AppendLog('STAGE', `Rim finish -> ${Opt.name}`, HitPoint ? `raycast drop (${HitPoint.map(N => N.toFixed(2)).join(', ')}) m` : 'swatch select', 'live');
        C.Toast(`Rim: ${Opt.name} ripple`);
    }
    else
    {
        TriggerPaintRipple(V, Opt.id, V.Matte ? 'matte' : 'gloss', HitPoint || null);
        AppendLog('STAGE', `Body paint -> ${Opt.name}`, HitPoint ? `raycast drop (${HitPoint.map(N => N.toFixed(2)).join(', ')}) m` : 'swatch select', 'live');
        C.Toast(`Paint: ${Opt.name} ripple`);
    }
    SyncVehicleHmiDock();
    C.Broadcast();
}

function AttachSwatchInteraction(El, Kind, Opt)
{
    El.addEventListener('pointerdown', Ev =>
    {
        if (Ev.button !== 0) return;
        Ev.preventDefault();
        const StartX = Ev.clientX, StartY = Ev.clientY;
        let Dragging = false;
        let Ghost = null;

        const UpdateDrag = (Cx, Cy) =>
        {
            if (Ghost)
            {
                Ghost.style.left = `${Cx}px`;
                Ghost.style.top = `${Cy}px`;
            }
            const Canvas = document.getElementById('ViewportCanvas');
            const Rect = Canvas?.getBoundingClientRect();
            const OverCanvas = !!(Rect && Cx >= Rect.left && Cx <= Rect.right && Cy >= Rect.top && Cy <= Rect.bottom);
            let Hit = null;
            if (OverCanvas && Scene.LastCamera && Scene.Vehicle?.Mesh && Scene.Vehicle?.Enabled)
            {
                const Ray = UnprojectViewportRay(Scene.LastCamera, Cx, Cy, Canvas);
                if (Ray) Hit = RaycastVehicle(Ray.origin, Ray.dir, Scene.Vehicle, Scene.Vehicle.Mesh);
            }
            DragSwatch = OverCanvas ? { kind: Kind, opt: Opt, hit: Hit, clientX: Cx, clientY: Cy } : null;
        };

        const OnMove = Mv =>
        {
            const Dist = Math.hypot(Mv.clientX - StartX, Mv.clientY - StartY);
            if (!Dragging && Dist > 6)
            {
                Dragging = true;
                Ghost = document.createElement('div');
                Ghost.className = 'veh-drag-pill';
                const Dot = document.createElement('i');
                Dot.style.background = Opt.hex;
                const Txt = document.createElement('span');
                Txt.textContent = `${Kind === 'rim' ? 'Rim' : 'Paint'}: ${Opt.name}`;
                Ghost.append(Dot, Txt);
                document.body.append(Ghost);
            }
            if (Dragging) UpdateDrag(Mv.clientX, Mv.clientY);
        };

        const OnUp = Up =>
        {
            window.removeEventListener('pointermove', OnMove);
            window.removeEventListener('pointerup', OnUp);
            window.removeEventListener('pointercancel', OnUp);
            if (Ghost) Ghost.remove();
            const WasDragging = Dragging;
            DragSwatch = null;

            if (!WasDragging)
            {
                ApplyVehicleMaterialDrop(Kind, Opt, Up.clientX, Up.clientY, false);
                return;
            }
            const Canvas = document.getElementById('ViewportCanvas');
            const Rect = Canvas?.getBoundingClientRect();
            const OverCanvas = !!(Rect && Up.clientX >= Rect.left && Up.clientX <= Rect.right && Up.clientY >= Rect.top && Up.clientY <= Rect.bottom);
            if (OverCanvas) ApplyVehicleMaterialDrop(Kind, Opt, Up.clientX, Up.clientY, true);
        };

        window.addEventListener('pointermove', OnMove);
        window.addEventListener('pointerup', OnUp);
        window.addEventListener('pointercancel', OnUp);
    });
}

function SpawnVehicleAeroTunnel()
{
    Scene.Vehicle.Enabled = true;
    const HasTunnelWind = Scene.FieldScene.Sources.some(S => S.Name === 'Aero Wind Tunnel');
    if (!HasTunnelWind)
    {
        const Src = FC().CreateSource('WindGenerator', {
            Name: 'Aero Wind Tunnel',
            Centre: [4.5, 1.0, 0.0],
            Direction: [-1, 0.05, 0],
            Strength: 16,
            Radius: 5.2,
            Reach: 'Box',
            HalfX: 5.5,
            HalfY: 2.2,
            HalfZ: 2.4
        });
        Scene.FieldScene.Sources.push(Src);
    }
    const HasShell = Scene.FieldScene.Sources.some(S => S.Name === 'ControlVehicle Aero Envelope');
    if (!HasShell)
    {
        const Rep = FC().CreateSource('Repulsor', {
            Name: 'ControlVehicle Aero Envelope',
            Centre: [0, 0.85, 0],
            Strength: 7.5,
            Radius: 2.35,
            Reach: 'Sphere'
        });
        Scene.FieldScene.Sources.push(Rep);
    }
    const Stream = Scene.Effects.find(E => E.PresetId === 'curl-streamlines') || AddEffect('curl-streamlines');
    if (Stream)
    {
        Stream.Name = 'Aero Tunnel Streamlines';
        Stream.P.emitterPos = [4.2, 0.9, 0.0];
        Stream.P.spawnShape = 1;
        Stream.P.spawnR = 1.1;
        Stream.P.windInfluence = 1.65;
        Stream.P.speed = 6.5;
        Stream.P.life = 2.2;
        Stream.P.rate = 320;
        RebuildGpu(Stream);
    }
    ConstructOutliner();
    SyncVehicleHmiDock();
    AppendLog('STAGE', 'Spawned aerodynamic wind tunnel streamlines over ControlVehicle', null, 'live');
    C.Toast('Aero wind tunnel streamlines active');
    C.Broadcast();
}

function ConstructVehicleHmiDock()
{
    const SelBtn = document.getElementById('veh-dock-select');
    if (SelBtn) SelBtn.addEventListener('click', () => SelectNode('Vehicle'));

    const AeroBtn = document.getElementById('veh-dock-aero');
    if (AeroBtn) AeroBtn.addEventListener('click', SpawnVehicleAeroTunnel);

    const CollapseBtn = document.getElementById('veh-dock-collapse');
    const Dock = document.getElementById('VehicleHmiDock');
    if (CollapseBtn && Dock)
    {
        CollapseBtn.addEventListener('click', () =>
        {
            const Collapsed = Dock.classList.toggle('collapsed');
            CollapseBtn.setAttribute('aria-expanded', String(!Collapsed));
            CollapseBtn.textContent = Collapsed ? '▸' : '▾';
        });
    }

    const ModeHost = document.getElementById('veh-mode-pills');
    if (ModeHost)
    {
        ModeHost.textContent = '';
        for (const M of INSPECTION_MODES)
        {
            const Btn = document.createElement('button');
            Btn.type = 'button';
            Btn.dataset.vehMode = M.id;
            Btn.textContent = M.label;
            Btn.title = `${M.detail} (X to cycle)`;
            Btn.addEventListener('click', () =>
            {
                SetInspectionMode(Scene.Vehicle, M.id);
                SyncVehicleHmiDock();
                AppendLog('STAGE', `Inspection mode -> ${M.label}`, M.detail, 'live');
                C.Toast(`Inspection: ${M.label}`);
                C.Broadcast();
            });
            ModeHost.append(Btn);
        }
    }

    const FinHost = document.getElementById('veh-finish-pills');
    if (FinHost)
    {
        for (const Btn of FinHost.querySelectorAll('button[data-veh-finish]'))
        {
            Btn.addEventListener('click', () =>
            {
                const Matte = Btn.dataset.vehFinish === 'matte';
                if (Scene.Vehicle.Matte !== Matte)
                {
                    Scene.Vehicle.Matte = Matte;
                    TriggerPaintRipple(Scene.Vehicle, Scene.Vehicle.PaintOpt, null);
                }
                SyncVehicleHmiDock();
                AppendLog('STAGE', `Finish -> ${Matte ? 'Matte Satin' : 'Gloss Clearcoat'}`, null, 'live');
                C.Broadcast();
            });
        }
    }

    const PaintHost = document.getElementById('veh-paint-swatches');
    if (PaintHost)
    {
        PaintHost.textContent = '';
        for (const Opt of PAINT_OPTIONS)
        {
            const Sw = document.createElement('button');
            Sw.type = 'button';
            Sw.className = 'veh-swatch-btn';
            Sw.dataset.paintId = Opt.id;
            Sw.title = `${Opt.name} (${Opt.hex}) · Click or drag onto ControlVehicle`;
            Sw.style.background = Opt.hex;
            AttachSwatchInteraction(Sw, 'paint', Opt);
            PaintHost.append(Sw);
        }
    }

    const RimHost = document.getElementById('veh-rim-swatches');
    if (RimHost)
    {
        RimHost.textContent = '';
        for (const Opt of RIM_OPTIONS)
        {
            const Sw = document.createElement('button');
            Sw.type = 'button';
            Sw.className = 'veh-swatch-btn rim';
            Sw.dataset.rimId = Opt.id;
            Sw.title = `${Opt.name} (${Opt.hex}) · Click or drag onto Wheel / Body`;
            Sw.style.background = Opt.hex;
            AttachSwatchInteraction(Sw, 'rim', Opt);
            RimHost.append(Sw);
        }
    }

    SyncVehicleHmiDock();
}

function ConstructVehicleInspector(Page)
{
    RenderInspectorTabs([
        ['inspection', 'Inspection'],
        ['materials', 'Paint & Rims'],
        ['stage', 'Stage & Aero'],
        ['assets', 'FCT1 Spec']
    ]);

    const V = Scene.Vehicle;
    const BindVeh = (Key, Extra = {}) => ({
        Read: () => V[Key],
        Write: Val =>
        {
            V[Key] = Val;
            SyncVehicleHmiDock();
            AppendLog('STAGE', `Vehicle: ${Extra.Label || Key}`, String(typeof Val === 'number' ? Number(Val.toFixed(3)) : Val), 'live');
        },
        ...Extra
    });

    if (InspectorTab === 'inspection')
    {
        const ModeCard = C.SectionCard(Page, { Title: 'Frontier inspection mode', Glyph: 'Car', Badge: '4 MODES' }).Inner;
        const Grid = C.Construct('div', 'veh-mode-grid');
        for (const M of INSPECTION_MODES)
        {
            const Card = document.createElement('button');
            Card.type = 'button';
            Card.className = 'veh-mode-card';
            const Strong = document.createElement('strong');
            Strong.textContent = M.label;
            const Span = document.createElement('span');
            Span.textContent = M.detail;
            Card.append(Strong, Span);
            Card.addEventListener('click', () =>
            {
                SetInspectionMode(V, M.id);
                SyncVehicleHmiDock();
                AppendLog('STAGE', `Inspection mode -> ${M.label}`, M.detail, 'live');
                C.Broadcast();
            });
            C.Register(() => Card.classList.toggle('active', V.Mode === M.id));
            Grid.append(Card);
        }
        ModeCard.append(Grid);
        C.ActionRow(ModeCard, [
            { Label: 'Cycle Mode (X)', Glyph: 'Refresh', Act: () => { const M = CycleInspectionMode(V); SyncVehicleHmiDock(); C.Toast(`Inspection: ${M.label}`); C.Broadcast(); } },
            { Label: 'Re-trigger X-Ray Scan', Glyph: 'Play', Tone: 'accent', Act: () => { RetriggerScanSweep(V); SyncVehicleHmiDock(); C.Toast('X-Ray Scan sweep started'); C.Broadcast(); } }
        ]);

        const OptCard = C.SectionCard(Page, { Title: 'Hologram & scan wavefront', Glyph: 'Sliders', Badge: 'SHADER' }).Inner;
        Range(OptCard, BindVeh('GhostOpacity', { Label: 'Ghost opacity' }), 0.15, 0.85, 0.01, 2, '');
        Range(OptCard, BindVeh('WireOpacity', { Label: 'Wireframe opacity' }), 0.15, 1.0, 0.01, 2, '');
        Range(OptCard, BindVeh('ScanPeriod', { Label: 'Scan sweep period' }), 1.5, 12.0, 0.1, 1, ' s');
        C.SwitchRow(OptCard, BindVeh('ScanReverse', { Label: 'Reverse sweep (tail to nose)' }));
        C.SwitchRow(OptCard, BindVeh('ScanLoop', { Label: 'Continuous scan loop' }));
        Range(OptCard, {
            Read: () => Clamp((V.ScanTime % Math.max(0.2, V.ScanPeriod)) / Math.max(0.2, V.ScanPeriod), 0, 1),
            Write: P => { V.Mode = 'scan'; V.HoloFade = 1; V.ScanTime = P * V.ScanPeriod * 0.85; StepVehicleState(V, 0); SyncVehicleHmiDock(); SyncVehicleScanHud(); },
            Label: 'Manual scan position'
        }, 0.0, 1.0, 0.01, 2, '');
    }
    else if (InspectorTab === 'materials')
    {
        const PaintCard = C.SectionCard(Page, { Title: 'Body paint (click or drag onto car)', Glyph: 'Palette', Badge: '9 COATS' }).Inner;
        C.SwitchRow(PaintCard, {
            Read: () => V.Matte,
            Write: Val =>
            {
                V.Matte = Val;
                TriggerPaintRipple(V, V.PaintOpt, null);
                SyncVehicleHmiDock();
                AppendLog('STAGE', `Finish -> ${Val ? 'Matte Satin' : 'Gloss Clearcoat'}`, null, 'live');
            },
            Label: 'Matte satin clearcoat off (Rough 0.70)'
        });
        const PaintGrid = C.Construct('div', 'veh-inspector-swatches');
        for (const Opt of PAINT_OPTIONS)
        {
            const Tile = document.createElement('button');
            Tile.type = 'button';
            Tile.className = 'veh-swatch-tile';
            Tile.title = `${Opt.name} (${Opt.hex}) · Click or drag onto ControlVehicle`;
            const Dot = document.createElement('i'); Dot.style.background = Opt.hex;
            const Name = document.createElement('span'); Name.textContent = Opt.name;
            Tile.append(Dot, Name);
            AttachSwatchInteraction(Tile, 'paint', Opt);
            C.Register(() => Tile.classList.toggle('active', V.PaintOpt.id === Opt.id));
            PaintGrid.append(Tile);
        }
        PaintCard.append(PaintGrid);

        const RimCard = C.SectionCard(Page, { Title: 'Wheel rims (click or drag onto wheel)', Glyph: 'Sparkles', Badge: '4 ALLOYS' }).Inner;
        const RimGrid = C.Construct('div', 'veh-inspector-swatches');
        for (const Opt of RIM_OPTIONS)
        {
            const Tile = document.createElement('button');
            Tile.type = 'button';
            Tile.className = 'veh-swatch-tile';
            Tile.title = `${Opt.name} (${Opt.hex}) · Click or drag onto ControlVehicle wheel`;
            const Dot = document.createElement('i'); Dot.style.background = Opt.hex;
            const Name = document.createElement('span'); Name.textContent = Opt.name;
            Tile.append(Dot, Name);
            AttachSwatchInteraction(Tile, 'rim', Opt);
            C.Register(() => Tile.classList.toggle('active', V.RimOpt.id === Opt.id));
            RimGrid.append(Tile);
        }
        RimCard.append(RimGrid);

        const RipCard = C.SectionCard(Page, { Title: 'Expanding sphere transition', Glyph: 'Sliders', Badge: 'RIPPLE' }).Inner;
        Range(RipCard, BindVeh('RippleDuration', { Label: 'Ripple wave duration' }), 0.35, 3.0, 0.05, 2, ' s');
        C.ActionRow(RipCard, [
            { Label: 'Replay Paint Ripple', Glyph: 'Refresh', Act: () => { TriggerPaintRipple(V, V.PaintOpt, V.PaintRipOrigin); SyncVehicleHmiDock(); C.Broadcast(); } },
            { Label: 'Replay Rim Ripple', Glyph: 'Refresh', Act: () => { TriggerRimRipple(V, V.RimOpt, V.RimRipOrigin); SyncVehicleHmiDock(); C.Broadcast(); } }
        ]);
    }
    else if (InspectorTab === 'stage')
    {
        const PoseCard = C.SectionCard(Page, { Title: 'Chassis pose & turntable', Glyph: 'Move', Badge: 'STAGE' }).Inner;
        Range(PoseCard, {
            Read: () => ((V.Yaw * 180 / Math.PI) % 360 + 360) % 360,
            Write: Deg => { V.Yaw = Deg * Math.PI / 180; },
            Label: 'Heading yaw'
        }, 0, 360, 1, 0, '°');
        Range(PoseCard, BindVeh('Scale', { Label: 'Vehicle scale' }), 0.45, 1.6, 0.01, 2, '×');
        C.SwitchRow(PoseCard, BindVeh('AutoRotate', { Label: 'Auto-rotate turntable' }));
        Range(PoseCard, BindVeh('WheelSpinRate', { Label: 'Wheel spin rate' }), 0.0, 24.0, 0.2, 1, ' rad/s');

        const AeroCard = C.SectionCard(Page, { Title: 'Particle & force-field coupling', Glyph: 'Wind', Badge: 'AERO' }).Inner;
        C.ActionRow(AeroCard, [
            { Label: 'Spawn Aero Wind Tunnel', Glyph: 'Wind', Tone: 'accent', Act: SpawnVehicleAeroTunnel },
            {
                Label: 'Impact Sparks Burst', Glyph: 'Flame', Act: () =>
                {
                    const Sp = AddEffect('sparks');
                    if (Sp)
                    {
                        Sp.Name = 'Vehicle Hood Sparks';
                        Sp.P.emitterPos = [1.8, 0.85, 0];
                        Sp.PendingBurst += 260;
                        RebuildGpu(Sp);
                    }
                    C.Toast('Spawned hood spark burst');
                    C.Broadcast();
                }
            },
            { Label: 'Frame Car Camera', Glyph: 'Focus', Act: () => { Object.assign(Scene.Camera, { Yaw: 0.72, Pitch: 0.28, Distance: 8.6, Target: [0, 0.88, 0] }); } }
        ]);
    }
    else
    {
        const SpecCard = C.SectionCard(Page, { Title: 'ControlVehicle FCT1 binary telemetry', Glyph: 'Info', Badge: 'FCT1' }).Inner;
        const Stats = V.Mesh?.stats || { bodyVerts: 0, bodyTris: 0, rimTris: 0, tyreTris: 0, totalTris: 0, edgeCount: 0 };
        const Grid = C.Construct('div', 'cam-stats-grid');
        for (const [Lbl, Val] of [
            ['Body facets', FormatInteger(Stats.bodyTris)],
            ['4× Rim facets', FormatInteger(Stats.rimTris)],
            ['4× Tyre facets', FormatInteger(Stats.tyreTris)],
            ['Total triangles', FormatInteger(Stats.totalTris)],
            ['Crease edges', FormatInteger(Stats.edgeCount)],
            ['Wheelbase', '3.396 m']
        ])
        {
            const Cell = C.Construct('div', 'cam-stat-cell');
            Cell.append(C.Construct('span', null, Lbl), C.Construct('b', null, Val));
            Grid.append(Cell);
        }
        SpecCard.append(Grid);
    }
}

function ConstructInspectorPage()
{
    InspectorViz = null;
    InspectorDebugCanvas = null;
    if (PageScope) C.ReleaseScope(PageScope);
    PageScope = C.OpenScope();
    LiveRefreshers.length = 0;

    const Content = document.getElementById('InspectorContent');
    Content.textContent = '';
    const Page = C.Construct('div', 'inspector-page');
    Content.append(Page);

    const NameInput = document.getElementById('object-name');
    const TypeLabel = document.getElementById('object-type');
    const SymEl = document.getElementById('object-symbol');
    const EnabledEl = document.getElementById('object-enabled');
    const Crumb = document.getElementById('inspector-crumb');
    const VpObj = document.getElementById('viewport-object');
    const VpSub = document.getElementById('viewport-subtitle');

    const Effect = EffectByToken(Selected);
    const Source = SourceByToken(Selected);
    EnabledEl.disabled = false;

    if (Selected === 'Vehicle')
    {
        const V = Scene.Vehicle;
        const ModeInfo = INSPECTION_MODES.find(M => M.id === V.Mode);
        Crumb.textContent = 'Inspector / Stage & Vehicle';
        NameInput.value = 'ControlVehicle · Coupe'; NameInput.disabled = true;
        TypeLabel.textContent = `FCT1 COUPÉ · ${(ModeInfo?.label || 'SOLID').toUpperCase()}`;
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Car')); SymEl.style.color = V.PaintOpt.hex;
        EnabledEl.checked = !!V.Enabled;
        EnabledEl.onchange = () => { V.Enabled = EnabledEl.checked; SyncVehicleHmiDock(); C.Broadcast(); };
        VpObj.textContent = 'ControlVehicle · Coupe';
        VpSub.textContent = `${ModeInfo?.label || 'Solid'} · ${V.PaintOpt.name} · ${V.RimOpt.name}`;
        ConstructVehicleInspector(Page);
    }
    else if (Selected === 'Camera')
    {
        Crumb.textContent = 'Inspector / Scene / Cameras';
        NameInput.value = 'Editor Camera'; NameInput.disabled = true;
        TypeLabel.textContent = 'PERMANENT EDITOR NAVIGATION CAMERA';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Camera')); SymEl.style.color = '#b9a5cd';
        EnabledEl.checked = true;
        EnabledEl.disabled = true;
        VpObj.textContent = 'Editor Camera';
        const Opt = ComputeCameraOptics(Scene.Camera);
        VpSub.textContent = `${Scene.Camera.Focal.toFixed(1)}mm · f/${Scene.Camera.Aperture.toFixed(1)} · ${Opt.horizontalFov.toFixed(1)}° FOV`;
        ConstructCameraInspector(Page);
    }
    else if (Selected === 'Camera:Exposure')
    {
        const Exp = Scene.CameraComponents.Exposure;
        Crumb.textContent = 'Inspector / Cameras / Editor Camera / Exposure';
        NameInput.value = 'Exposure'; NameInput.disabled = true;
        TypeLabel.textContent = 'POST PROCESS · EXPOSURE, TONE & LENS';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Exposure')); SymEl.style.color = '#e2d0b4';
        EnabledEl.checked = !!Exp.Enabled;
        EnabledEl.onchange = () => { Exp.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Exposure';
        VpSub.textContent = `${Exp.EV >= 0 ? '+' : ''}${Exp.EV.toFixed(2)} EV · Contrast ${Exp.Contrast.toFixed(2)}`;
        ConstructExposureInspector(Page);
    }
    else if (Selected === 'Camera:Heat')
    {
        const Heat = Scene.CameraComponents.Heat;
        Crumb.textContent = 'Inspector / Cameras / Editor Camera / Heat Distortion';
        NameInput.value = 'Heat Distortion'; NameInput.disabled = true;
        TypeLabel.textContent = 'CAMERA COMPONENT · THERMAL AIR REFRACTION';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('HeatLens')); SymEl.style.color = '#f5a65b';
        EnabledEl.checked = !!Heat.Enabled;
        EnabledEl.onchange = () => { Heat.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Heat Distortion';
        VpSub.textContent = `${DetectHeatSources().length} heat sources tracked`;
        ConstructHeatComponentInspector(Page);
    }
    else if (Selected === 'Camera:BlackHole')
    {
        const BH = Scene.CameraComponents.BlackHole;
        Crumb.textContent = 'Inspector / Cameras / Editor Camera / Black Hole';
        NameInput.value = 'Black Hole'; NameInput.disabled = true;
        TypeLabel.textContent = 'CAMERA COMPONENT · GRAVITATIONAL LENSING';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('BlackHoleLens')); SymEl.style.color = '#f5b855';
        EnabledEl.checked = !!BH.Enabled;
        EnabledEl.onchange = () => { BH.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Black Hole';
        VpSub.textContent = `${DetectBlackHoleSources().length} singularity lens tracked`;
        ConstructBlackHoleComponentInspector(Page);
    }
    else if (Selected === 'Camera:Glitch')
    {
        const Gl = Scene.CameraComponents.Glitch;
        Crumb.textContent = 'Inspector / Cameras / Editor Camera / Glitch';
        NameInput.value = 'Glitch'; NameInput.disabled = true;
        TypeLabel.textContent = 'CAMERA COMPONENT · SCANLINE & RGB TEARING';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('GlitchLens')); SymEl.style.color = '#72e8cf';
        EnabledEl.checked = !!Gl.Enabled;
        EnabledEl.onchange = () => { Gl.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Glitch';
        VpSub.textContent = `${DetectGlitchSources().length} glitch emitter tracked`;
        ConstructGlitchComponentInspector(Page);
    }
    else if (Effect)
    {
        const Preset = PE.presetById(Effect.PresetId);
        Crumb.textContent = `Inspector / Effects / ${Preset?.group || 'Particles'}`;
        NameInput.value = Effect.Name;
        NameInput.disabled = false;
        NameInput.onchange = () => { Effect.Name = NameInput.value.trim() || Effect.Name; ConstructOutliner(); C.Broadcast(); };
        TypeLabel.textContent = `${(CategoryLabels[Effect.P.kind] || 'Particles').toUpperCase()} · ${Effect.P.blend.toUpperCase()}`;
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph(GlyphForPreset(Preset)));
        SymEl.style.color = DisplayColour(Effect.P.colA);
        EnabledEl.checked = !!Effect.P.visible;
        EnabledEl.onchange = () => { Effect.P.visible = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = Effect.Name;
        VpSub.textContent = `${CategoryLabels[Effect.P.kind] || 'Particles'} · eos engine`;
        ConstructEffectInspector(Page, Effect);
    }
    else if (Source)
    {
        const Info = FC().TypeById[Source.Type];
        Crumb.textContent = `Inspector / Environment / ${Info.Contribution}`;
        NameInput.value = Source.Name;
        NameInput.disabled = false;
        NameInput.onchange = () => { Source.Name = NameInput.value.trim() || Source.Name; ConstructOutliner(); C.Broadcast(); };
        TypeLabel.textContent = `${Info.Contribution.toUpperCase()} · ${Info.Name.toUpperCase()}`;
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph(Info.Glyph || 'Target'));
        SymEl.style.color = Info.Colour || ContributionColours[Info.Contribution];
        EnabledEl.checked = !!Source.Enabled;
        EnabledEl.onchange = () => { Source.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = Source.Name;
        VpSub.textContent = `${Info.Name} · ${Source.Reach} (${Source.Radius.toFixed(1)} m)`;
        ConstructForcesInspector(Page, 'source', Source);
    }
    else if (Selected === 'Wind')
    {
        Crumb.textContent = 'Inspector / Environment / Ambient Wind';
        NameInput.value = 'Ambient Wind'; NameInput.disabled = true;
        TypeLabel.textContent = 'CONTINUOUS DOMAIN BREEZE & TURBULENCE';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Wind')); SymEl.style.color = '#9fc7e8';
        EnabledEl.checked = !!Scene.FieldScene.Wind.Enabled;
        EnabledEl.onchange = () => { Scene.FieldScene.Wind.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Ambient Wind';
        VpSub.textContent = `${Scene.FieldScene.Wind.Speed.toFixed(1)} m/s · ${Math.round(Scene.FieldScene.Wind.Bearing)}°`;
        ConstructForcesInspector(Page, 'wind', null);
    }
    else if (Selected === 'Lightning')
    {
        Crumb.textContent = 'Inspector / Environment / Storm';
        NameInput.value = 'Lightning & Storm'; NameInput.disabled = true;
        TypeLabel.textContent = 'FRACTAL RIBBON BOLTS · THUNDER';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Zap')); SymEl.style.color = '#c9b8f0';
        EnabledEl.checked = !!Scene.Lightning.auto;
        EnabledEl.onchange = () => { Scene.Lightning.auto = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Lightning & Storm';
        VpSub.textContent = `${Scene.Lightning.strikes} strikes fired`;
        ConstructLightningInspector(Page);
    }
    else
    {
        Selected = 'Field';
        Crumb.textContent = 'Inspector / Environment';
        NameInput.value = 'Force Field'; NameInput.disabled = true;
        TypeLabel.textContent = 'MASTER FORCE FIELD & VISUALIZATION';
        SymEl.textContent = ''; SymEl.append(C.ConstructGlyph('Field')); SymEl.style.color = '#8fd3c4';
        EnabledEl.checked = !!Scene.Overlay.Enabled;
        EnabledEl.onchange = () => { Scene.Overlay.Enabled = EnabledEl.checked; C.Broadcast(); };
        VpObj.textContent = 'Force Field';
        VpSub.textContent = `${Scene.FieldScene.Sources.length} bounded force sources · ForceFieldVisualization`;
        ConstructForcesInspector(Page, 'field', null);
    }

    C.CloseScope(PageScope);
    document.getElementById('InspectorScroll').scrollTop = 0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                          VIEWPORT, TRANSPORT & LIVE REFRESH
//------------------------------------------------------------------------------------------------------------------------

function UpdateLiveTransport()
{
    const Tc = document.getElementById('timecode');
    const S = Scene.Time;
    const Mins = Math.floor(S / 60), Secs = Math.floor(S % 60), Ms = Math.floor((S * 1000) % 1000);
    Tc.textContent = `${String(Mins).padStart(2, '0')}:${String(Secs).padStart(2, '0')}.${String(Ms).padStart(3, '0')}`;
    document.getElementById('frame-counter').textContent = `FRAME ${String(Scene.Step).padStart(4, '0')}`;
    document.getElementById('playhead').style.left = `${((S % 30) / 30) * 100}%`;
    document.getElementById('live-pill').classList.toggle('paused', !Scene.Playing);
    document.getElementById('live-pill-label').textContent = Scene.Playing ? 'LIVE' : 'PAUSED';
}

function RefreshLive()
{
    for (const E of Scene.Effects)
    {
        E.AliveSamples.push(E.P.kind === 7 ? E.P.fibre.strands : (E.Gpu?.stats_?.alive ?? 0));
        if (E.AliveSamples.length > SampleCapacity) E.AliveSamples.shift();
    }
    const Prep = Scene.PreparedField || FC().Prepare(Scene.FieldScene, Scene.Time);
    const ProbeAll = FC().EvaluateAllPrepared(Scene.FieldScene, Prep, Scene.Probe[0], Scene.Probe[1], Scene.Probe[2], 0.5, Scene.FieldScene.Visualization.Solo, 'Particles');
    ProbeSamples.push(ProbeAll.FlowMag);
    if (ProbeSamples.length > SampleCapacity) ProbeSamples.shift();
    AnemHistory.push(ProbeAll.FlowMag);
    if (AnemHistory.length > 72) AnemHistory.shift();

    LiveRefreshers.forEach(Fn => Fn());
    PersistentRefreshers.forEach(Fn => Fn());

    const Hud = document.getElementById('ViewportHud');
    const Total = Scene.Effects.filter(E => E.P.visible).reduce((S, E) => S + (E.Gpu?.stats_?.alive ?? 0), 0);
    const Cap = Scene.Effects.filter(E => E.P.visible && E.P.kind !== 7).reduce((S, E) => S + (E.Gpu?.cap || 0), 0);
    Hud.textContent = '';
    Hud.append(
        C.Construct('div', 'hud-pill', ['PARTICLES', C.Construct('b', null, `${FormatInteger(Total)} / ${FormatInteger(Cap)}`)]),
        C.Construct('div', 'hud-pill', ['RATE', C.Construct('b', null, `${Math.round(Scene.Rate)} fps`)]),
        C.Construct('div', 'hud-pill', ['CPU', C.Construct('b', null, `${Scene.CpuMilliseconds.toFixed(2)} ms`)])
    );

    const Readout = document.getElementById('ViewportReadout');
    Readout.classList.toggle('shown', Scene.ProbeEnabled);
    if (Scene.ProbeEnabled)
    {
        Readout.textContent =
            `PROBE (${Scene.Probe.map(V => V.toFixed(1)).join(', ')}) m\n` +
            `flow ${ProbeAll.Velocity.map(V => V.toFixed(2)).join('  ')} m/s\n` +
            `acc  ${ProbeAll.Acceleration.map(V => V.toFixed(2)).join('  ')} m/s²`;
    }

    const Rb = Scene.Readback?.Status;
    document.getElementById('status-readback').textContent = Rb?.Count
        ? `Lattice readback ${(Rb.Bytes / 1024).toFixed(0)} KB · ${Rb.Milliseconds.toFixed(1)} ms · ${FormatInteger(Rb.Count)}×`
        : 'Lattice readback active';
}

function ResizeCanvas()
{
    const Canvas = document.getElementById('ViewportCanvas');
    const Bounds = Canvas.parentElement.getBoundingClientRect();
    const Ratio = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(64, Math.round(Bounds.width * Ratio)), H = Math.max(64, Math.round(Bounds.height * Ratio));
    if (Canvas.width !== W || Canvas.height !== H)
    {
        Canvas.width = W; Canvas.height = H;
        Scene.Engine?.resize(W, H);
    }
    const Ov = document.getElementById('OverlayCanvas');
    if (Ov && (Ov.width !== W || Ov.height !== H)) { Ov.width = W; Ov.height = H; }
    const Mm = document.getElementById('MinimapCanvas');
    if (Mm && (Mm.width !== 156 || Mm.height !== 156)) { Mm.width = 156; Mm.height = 156; }
}

function TogglePlay()
{
    Scene.Playing = !Scene.Playing;
    const PlayBtn = document.getElementById('play-button');
    PlayBtn.textContent = '';
    PlayBtn.append(C.ConstructGlyph(Scene.Playing ? 'Pause' : 'Play'));
    AppendLog('VIEW', Scene.Playing ? 'Simulation resumed' : 'Simulation paused', `t=${Scene.Time.toFixed(1)}s`, Scene.Playing ? 'live' : 'warm');
}

function SyncTopNav()
{
    const VeilOpen = document.getElementById('LibraryVeil').classList.contains('shown');
    document.getElementById('nav-workspace').classList.toggle('active', !VeilOpen && !LogOpen);
    document.getElementById('nav-library').classList.toggle('active', VeilOpen);
    document.getElementById('nav-log').classList.toggle('active', !VeilOpen && LogOpen);
}

function WireStaticIconsAndControls()
{
    const SetGlyph = (Id, Name) => { const El = document.getElementById(Id); if (El) { El.textContent = ''; El.append(C.ConstructGlyph(Name)); } };
    SetGlyph('help-button', 'Help');
    SetGlyph('compact-outliner', 'Compact');
    SetGlyph('add-button', 'Plus');
    SetGlyph('stat-visible-icon', 'Check');
    SetGlyph('stat-hidden-icon', 'EyeOff');
    SetGlyph('search-icon-slot', 'Search');
    SetGlyph('preset-search-icon-slot', 'Search');
    SetGlyph('viewport-title-icon', 'Sparkles');
    SetGlyph('toggle-arrows-btn', 'Wind');
    SetGlyph('toggle-minimap-btn', 'Map');
    SetGlyph('toggle-log-btn', 'Terminal');
    SetGlyph('focus-btn', 'Focus');
    SetGlyph('maximize-btn', 'Maximize');
    SetGlyph('reset-button', 'Reset');
    SetGlyph('play-button', 'Pause');
    SetGlyph('step-button', 'Step');
    SetGlyph('close-export', 'Close');
    SetGlyph('close-help', 'Close');

    const PrecipHost = document.getElementById('precip-pills');
    if (PrecipHost)
    {
        const PrecipIcons = { snow: 'Snowflake', rain: 'CloudRain', hail: 'CloudHail' };
        for (const Btn of PrecipHost.querySelectorAll('button[data-precip]'))
        {
            const Kind = Btn.dataset.precip;
            const Slot = Btn.querySelector('.precip-ico');
            if (Slot) { Slot.textContent = ''; Slot.append(C.ConstructGlyph(PrecipIcons[Kind] || 'CloudRain')); }
            Btn.addEventListener('click', Ev => TogglePrecipitation(Kind, Ev.shiftKey));
        }
        C.Register(SyncPrecipitationPills);
        SyncPrecipitationPills();
    }

    const VTools = document.querySelectorAll('#ViewportTools [data-vtool]');
    const VToolIcons = { orbit: 'Orbit', probe: 'Crosshair', strike: 'Zap', turntable: 'Reset' };
    VTools.forEach(Btn =>
    {
        Btn.append(C.ConstructGlyph(VToolIcons[Btn.dataset.vtool]));
        Btn.addEventListener('click', () =>
        {
            const T = Btn.dataset.vtool;
            if (T === 'strike') { StrikeNow(); return; }
            if (T === 'probe')
            {
                Scene.ProbeEnabled = true;
                Scene.AnemometerPlacing = !Scene.AnemometerPlacing;
                SyncAnemometerToolState();
                C.Broadcast();
                return;
            }
            if (T === 'orbit')
            {
                Scene.AnemometerPlacing = false;
                SyncAnemometerToolState();
                return;
            }
            if (T === 'turntable') { Scene.Turntable = !Scene.Turntable; Btn.classList.toggle('active', Scene.Turntable); return; }
        });
    });

    document.getElementById('play-button').addEventListener('click', TogglePlay);
    document.getElementById('reset-button').addEventListener('click', ResetAll);
    document.getElementById('step-button').addEventListener('click', () =>
    {
        Scene.Playing = false;
        const PlayBtn = document.getElementById('play-button');
        PlayBtn.textContent = '';
        PlayBtn.append(C.ConstructGlyph('Play'));
        Scene.Playing = true;
        Advance((LastTick || performance.now()) + 16.6);
        Scene.Playing = false;
        UpdateLiveTransport();
    });
    document.getElementById('strike-button').addEventListener('click', StrikeNow);
    document.getElementById('burst-button').addEventListener('click', BurstAll);
    document.getElementById('speed-select').addEventListener('change', Ev => { Scene.TimeScale = Number(Ev.target.value); });

    document.getElementById('camera-view-select').addEventListener('change', Ev =>
    {
        const Mode = Ev.target.value;
        if (Mode === 'top') Object.assign(Scene.Camera, { Pitch: 1.45, Yaw: 0, Distance: 13.5, Target: [0, 0.8, 0] });
        else if (Mode === 'front') Object.assign(Scene.Camera, { Pitch: 0.08, Yaw: 0, Distance: 12.2, Target: [0, 1.5, 0] });
        else if (Mode === 'side') Object.assign(Scene.Camera, { Pitch: 0.1, Yaw: Math.PI * 0.5, Distance: 12.2, Target: [0, 1.5, 0] });
        else Object.assign(Scene.Camera, { Pitch: 0.34, Yaw: 0.62, Distance: 12.2, Target: [0, 1.5, 0] });
    });

    const OverlaySel = document.getElementById('overlay-channel-select');
    OverlaySel.value = Scene.Overlay.Enabled ? Scene.Overlay.Contribution : 'off';
    OverlaySel.addEventListener('change', Ev =>
    {
        const V = Ev.target.value;
        if (V === 'off') Scene.Overlay.Enabled = false;
        else { Scene.Overlay.Enabled = true; Scene.Overlay.Contribution = V; }
        document.getElementById('toggle-overlay-btn').classList.toggle('active', Scene.Overlay.Enabled);
        C.Broadcast();
    });

    document.getElementById('toggle-overlay-btn').classList.toggle('active', !!Scene.Overlay.Enabled);
    document.getElementById('toggle-overlay-btn').addEventListener('click', () =>
    {
        Scene.Overlay.Enabled = !Scene.Overlay.Enabled;
        document.getElementById('toggle-overlay-btn').classList.toggle('active', Scene.Overlay.Enabled);
        OverlaySel.value = Scene.Overlay.Enabled ? Scene.Overlay.Contribution : 'off';
        C.Broadcast();
    });

    document.getElementById('toggle-arrows-btn').classList.toggle('active', !!Scene.Wind.showArrows);
    document.getElementById('toggle-arrows-btn').addEventListener('click', Ev =>
    {
        Scene.Wind.showArrows = !Scene.Wind.showArrows;
        Ev.currentTarget.classList.toggle('active', Scene.Wind.showArrows);
        C.Broadcast();
    });

    document.getElementById('toggle-minimap-btn').classList.toggle('active', !!Scene.Overlay.Minimap);
    document.getElementById('toggle-minimap-btn').addEventListener('click', Ev =>
    {
        Scene.Overlay.Minimap = !Scene.Overlay.Minimap;
        Ev.currentTarget.classList.toggle('active', Scene.Overlay.Minimap);
        C.Broadcast();
    });

    document.getElementById('toggle-log-btn').addEventListener('click', () =>
    {
        LogOpen = !LogOpen;
        document.getElementById('log-drawer').hidden = !LogOpen;
        document.getElementById('toggle-log-btn').classList.toggle('active', LogOpen);
        SyncTopNav();
        setTimeout(ResizeCanvas, 20);
    });

    document.getElementById('focus-btn').addEventListener('click', () => Object.assign(Scene.Camera, { Yaw: 0.62, Pitch: 0.34, Distance: 12.2, Target: [0, 1.5, 0] }));
    document.getElementById('maximize-btn').addEventListener('click', Ev =>
    {
        const Max = document.getElementById('studio-workspace').classList.toggle('maximized');
        Ev.currentTarget.classList.toggle('active', Max);
        setTimeout(ResizeCanvas, 20);
    });

    document.getElementById('compact-outliner').addEventListener('click', Ev =>
    {
        const Compact = document.getElementById('left-panel').classList.toggle('compact');
        Ev.currentTarget.setAttribute('aria-pressed', String(Compact));
        Ev.currentTarget.classList.toggle('active', Compact);
    });
    document.getElementById('scene-search').addEventListener('input', Ev => { OutlinerQuery = Ev.target.value.trim().toLowerCase(); C.Broadcast(); });
    document.getElementById('add-menu-preset-search')?.addEventListener('input', Ev => { AddMenuAssetQuery = Ev.target.value.trim().toLowerCase(); ConstructAddMenuAssets(); });
    document.querySelectorAll('#scene-filters button').forEach(Btn =>
    {
        Btn.addEventListener('click', () =>
        {
            OutlinerFilter = Btn.dataset.filter;
            document.querySelectorAll('#scene-filters button').forEach(B => B.classList.toggle('active', B === Btn));
            ConstructOutliner();
            C.Broadcast();
        });
    });

    const AddBtn = document.getElementById('add-button'), AddMenu = document.getElementById('add-menu');
    AddBtn.addEventListener('click', () =>
    {
        const Open = AddMenu.hidden;
        if (Open)
        {
            ConstructAddMenuAssets();
            const R = AddBtn.getBoundingClientRect();
            AddMenu.style.left = `${Math.max(8, Math.min(R.left, window.innerWidth - 304))}px`;
            AddMenu.style.top = `${R.bottom + 6}px`;
            AddMenu.style.maxHeight = `${Math.max(240, window.innerHeight - R.bottom - 18)}px`;
        }
        AddMenu.hidden = !Open;
        AddBtn.setAttribute('aria-expanded', String(Open));
        if (Open) document.getElementById('add-menu-preset-search')?.focus();
    });
    AddMenu.querySelectorAll('[data-add-force]').forEach(B => B.addEventListener('click', () => { AddMenu.hidden = true; AddForceSource(B.dataset.addForce); }));
    AddMenu.querySelectorAll('[data-add-viz]').forEach(B => B.addEventListener('click', () =>
    {
        AddMenu.hidden = true;
        const Layer = B.dataset.addViz;
        const Vz = Scene.FieldScene.Visualization;
        if (Layer === 'Arrows')
        {
            Scene.Wind.showArrows = !Scene.Wind.showArrows;
            document.getElementById('toggle-arrows-btn')?.classList.toggle('active', Scene.Wind.showArrows);
        }
        else
        {
            Scene.Overlay.Enabled = true;
            if (Layer === 'FlowLines') Scene.Overlay.Streamlines3D = !Scene.Overlay.Streamlines3D;
            else if (Layer === 'ShowInfluence') { Scene.Overlay.Bounds = !Scene.Overlay.Bounds; Vz.ShowInfluence = !Vz.ShowInfluence; }
            else if (Layer in Vz) Vz[Layer] = !Vz[Layer];
        }
        document.getElementById('toggle-overlay-btn').classList.toggle('active', Scene.Overlay.Enabled);
        OverlaySel.value = Scene.Overlay.Enabled ? Scene.Overlay.Contribution : 'off';
        AppendLog('VIEW', `Toggled visualization layer: ${Layer}`, null, 'live');
        ConstructInspectorPage();
        C.Broadcast();
    }));
    AddMenu.querySelector('[data-action="open-library"]').addEventListener('click', () => { AddMenu.hidden = true; OpenFullLibrary(); });
    window.addEventListener('pointerdown', Ev => { if (!AddMenu.hidden && !AddMenu.contains(Ev.target) && !AddBtn.contains(Ev.target)) AddMenu.hidden = true; });

    document.getElementById('nav-workspace').addEventListener('click', () =>
    {
        document.getElementById('LibraryVeil').classList.remove('shown');
        LogOpen = false;
        document.getElementById('log-drawer').hidden = true;
        document.getElementById('toggle-log-btn').classList.remove('active');
        SyncTopNav();
        setTimeout(ResizeCanvas, 20);
    });
    document.getElementById('nav-library').addEventListener('click', OpenFullLibrary);
    document.getElementById('nav-log').addEventListener('click', () =>
    {
        document.getElementById('LibraryVeil').classList.remove('shown');
        LogOpen = !LogOpen;
        document.getElementById('log-drawer').hidden = !LogOpen;
        document.getElementById('toggle-log-btn').classList.toggle('active', LogOpen);
        SyncTopNav();
        setTimeout(ResizeCanvas, 20);
    });
    document.getElementById('new-scene-btn').addEventListener('click', () => LoadSceneTab({ Id: 'default', Name: 'New Blank Scene', Presets: [], Scenario: 'blank' }));
    document.getElementById('reset-selection-btn').addEventListener('click', () =>
    {
        const Eff = EffectByToken(Selected);
        if (Eff) { const Pr = PE.presetById(Eff.PresetId); if (Pr) { Eff.P = JSON.parse(JSON.stringify(Pr.p)); RebuildGpu(Eff); ConstructInspectorPage(); C.Broadcast(); C.Toast(`Reset ${Eff.Name}`); } }
        else if (Selected === 'Camera')
        {
            Object.assign(Scene.Camera, { Yaw: 0.62, Pitch: 0.34, Distance: 12.2, Target: [0, 1.5, 0], Focal: 29, SensorWidth: 36, Aperture: 2.8, SubjectDistance: 12 });
            Object.assign(Scene.CameraComponents.Exposure, { BloomEnabled: true, Bloom: 0.35, BloomThreshold: 0.42, BloomRadius: 1.15, BloomKnee: 0.25 });
            ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset Editor Camera & Bloom');
        }
        else if (Selected === 'Camera:Exposure')
        {
            Object.assign(Scene.CameraComponents.Exposure, { Enabled: true, EV: 0, Saturation: 1, Contrast: 1, BloomEnabled: true, Bloom: 0.35, BloomThreshold: 0.42, BloomRadius: 1.15, BloomKnee: 0.25, Vignette: 0 });
            ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset Exposure');
        }
        else if (Selected === 'Camera:Heat')
        {
            Object.assign(Scene.CameraComponents.Heat, { Enabled: true, IncludeFireParticles: true, IncludeThermalFields: true, HorizonMirage: false, StrengthScale: 1, FrequencyScale: 1, RateScale: 1, RadiusScale: 1, HorizonCutoff: 0.28 });
            ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset Heat Distortion');
        }
        else if (Selected === 'Camera:BlackHole')
        {
            Object.assign(Scene.CameraComponents.BlackHole, { Enabled: true, TrackParticleHoles: true, CameraSingularity: false, Centre: [0, 2.2, 0], HorizonScale: 1, EinsteinScale: 1, Glow: 0.35 });
            ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset Black Hole');
        }
        else if (Selected === 'Vehicle')
        {
            Object.assign(Scene.Vehicle, {
                Enabled: true, GhostOpacity: 0.45, WireOpacity: 0.78, ScanPeriod: 4.8,
                ScanLoop: true, ScanReverse: false, Yaw: 0, Scale: 1,
                AutoRotate: false, WheelSpinRate: 0, Matte: false
            });
            SetInspectionMode(Scene.Vehicle, 'solid');
            TriggerPaintRipple(Scene.Vehicle, PAINT_OPTIONS[0].id, 'gloss');
            TriggerRimRipple(Scene.Vehicle, RIM_OPTIONS[0].id);
            SyncVehicleHmiDock(); ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset ControlVehicle HMI');
        }
        else if (Selected === 'Camera:Glitch')
        {
            Object.assign(Scene.CameraComponents.Glitch, { Enabled: true, TrackGlitchParticles: true, FullFrame: false, Intensity: 0.65, Chromatic: 0.35, RadiusScale: 1 });
            ConstructInspectorPage(); C.Broadcast(); C.Toast('Reset Glitch');
        }
        else ResetAll();
    });

    const ExportDlg = document.getElementById('export-dialog');
    document.getElementById('export-button').addEventListener('click', () =>
    {
        const Toml = [...Scene.Effects.map(E => EncodeEffect(E).join('\n')), FC().EncodeLevelspace(Scene.FieldScene).join('\n')].join('\n\n');
        document.getElementById('export-preview').textContent = Toml;
        ExportDlg.showModal();
    });
    document.getElementById('close-export').addEventListener('click', () => ExportDlg.close());
    document.getElementById('copy-export-btn').addEventListener('click', () =>
        navigator.clipboard?.writeText(document.getElementById('export-preview').textContent).then(() => C.Toast('Copied scene TOML')));
    document.getElementById('download-export-btn').addEventListener('click', () =>
    {
        const BlobOut = new Blob([document.getElementById('export-preview').textContent], { type: 'text/plain' });
        const Url = URL.createObjectURL(BlobOut);
        const A = document.createElement('a'); A.href = Url; A.download = 'particle-scene.levelspace'; A.click();
        URL.revokeObjectURL(Url);
    });

    const HelpDlg = document.getElementById('help-dialog');
    document.getElementById('help-button').addEventListener('click', () => HelpDlg.showModal());
    document.getElementById('close-help').addEventListener('click', () => HelpDlg.close());
}

function AttachOrbit()
{
    const Canvas = document.getElementById('ViewportCanvas');
    let Drag = null;
    Canvas.addEventListener('contextmenu', E => E.preventDefault());
    Canvas.addEventListener('pointerdown', E =>
    {
        const Cam = Scene.LastCamera;
        if (E.button === 0 && Cam && Scene.AnemometerPlacing)
        {
            const Pt = ScreenToWorldPlane(Cam, E.clientX, E.clientY, Canvas, Scene.Probe[1]);
            Scene.ProbeEnabled = true;
            if (Pt)
            {
                Scene.Probe[0] = Clamp(Pt[0], -6, 6);
                Scene.Probe[2] = Clamp(Pt[2], -6, 6);
            }
            Scene.AnemometerDragging = true;
            Drag = { Mode: 'anem', X: E.clientX, Y: E.clientY, PlacedNow: true, ShiftAlt: E.shiftKey || E.altKey };
            Canvas.setPointerCapture(E.pointerId);
            SyncAnemometerToolState();
            RefreshLive();
            C.Broadcast();
            return;
        }
        if (E.button === 0 && Cam && HitTestAnemometer(Cam, E.clientX, E.clientY, Canvas))
        {
            Scene.AnemometerDragging = true;
            Drag = { Mode: 'anem', X: E.clientX, Y: E.clientY, PlacedNow: false, ShiftAlt: E.shiftKey || E.altKey };
            Canvas.setPointerCapture(E.pointerId);
            SyncAnemometerToolState();
            return;
        }
        Drag = { Mode: (E.button === 2 || E.shiftKey || E.button === 1) ? 'pan' : 'orbit', X: E.clientX, Y: E.clientY, StartX: E.clientX, StartY: E.clientY };
        Canvas.setPointerCapture(E.pointerId);
    });
    Canvas.addEventListener('pointermove', E =>
    {
        if (!Drag)
        {
            const Hover = !!(Scene.LastCamera && Scene.ProbeEnabled && !Scene.AnemometerPlacing && HitTestAnemometer(Scene.LastCamera, E.clientX, E.clientY, Canvas));
            if (Hover !== Scene.AnemometerHover)
            {
                Scene.AnemometerHover = Hover;
                SyncAnemometerToolState();
            }
            return;
        }
        const Dx = E.clientX - Drag.X, Dy = E.clientY - Drag.Y;
        Drag.X = E.clientX; Drag.Y = E.clientY;
        if (Drag.Mode === 'anem')
        {
            if (E.shiftKey || E.altKey || Drag.ShiftAlt)
            {
                Scene.Probe[1] = Clamp(Scene.Probe[1] - Dy * 0.025, 0.1, 7.5);
            }
            else
            {
                const Pt = ScreenToWorldPlane(Scene.LastCamera, E.clientX, E.clientY, Canvas, Scene.Probe[1]);
                if (Pt)
                {
                    Scene.Probe[0] = Clamp(Pt[0], -6, 6);
                    Scene.Probe[2] = Clamp(Pt[2], -6, 6);
                }
            }
            SyncAnemometerToolState();
            RefreshLive();
            C.Broadcast();
            return;
        }
        const Cam = Scene.Camera;
        if (Drag.Mode === 'pan')
        {
            const S = Cam.Distance * 0.0015;
            Cam.Target[0] += -Dx * Math.cos(Cam.Yaw) * S;
            Cam.Target[2] += Dx * Math.sin(Cam.Yaw) * S;
            Cam.Target[1] += Dy * S;
        }
        else
        {
            Cam.Yaw -= Dx * 0.005;
            Cam.Pitch = Clamp(Cam.Pitch + Dy * 0.005, -1.45, 1.45);
        }
    });
    const Release = Ev =>
    {
        if (Drag?.Mode === 'anem')
        {
            const WasPlace = !!Drag.PlacedNow;
            Scene.AnemometerDragging = false;
            if (WasPlace)
            {
                Scene.AnemometerPlacing = false;
                C.Toast(`Anemometer placed at (${Scene.Probe.map(V => V.toFixed(1)).join(', ')}) m`);
            }
            AppendLog('WIND', WasPlace ? 'Anemometer placed in viewport' : 'Anemometer moved in viewport', `(${Scene.Probe.map(V => V.toFixed(2)).join(', ')}) m`, 'live');
            SyncAnemometerToolState();
            C.Broadcast();
        }
        else if (Drag?.Mode === 'orbit' && Ev && Math.hypot(Ev.clientX - Drag.StartX, Ev.clientY - Drag.StartY) < 4)
        {
            if (Scene.LastCamera && Scene.Vehicle?.Enabled && Scene.Vehicle?.Mesh)
            {
                const Ray = UnprojectViewportRay(Scene.LastCamera, Ev.clientX, Ev.clientY, Canvas);
                if (Ray && RaycastVehicle(Ray.origin, Ray.dir, Scene.Vehicle, Scene.Vehicle.Mesh))
                    SelectNode('Vehicle');
            }
        }
        Drag = null;
    };
    Canvas.addEventListener('pointerup', Release);
    Canvas.addEventListener('pointercancel', Release);
    Canvas.addEventListener('wheel', E => { E.preventDefault(); Scene.Camera.Distance = Clamp(Scene.Camera.Distance * Math.exp(E.deltaY * 0.001), 2, 60); }, { passive: false });
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    INITIALIZATION
//------------------------------------------------------------------------------------------------------------------------

async function Boot()
{
    WireStaticIconsAndControls();
    ResizeCanvas();

    let Canvas = document.getElementById('ViewportCanvas');
    try
    {
        const GpuEngine = new PE.Engine(Canvas);
        const Facts = await GpuEngine.init();
        Scene.Engine = GpuEngine;
        Scene.AdapterName = Facts.adapter || 'WebGPU GPU';
        Scene.Readback = ConstructLatticeReadback(Scene.Engine);
        Scene.Engine.onLost = Lost => AppendLog('PARTICLES', 'WebGPU device lost', Lost.message || Lost.reason, 'warm');
        document.getElementById('engine-pill-text').textContent = 'WEBGPU · LIVE';
        document.getElementById('status-ready').innerHTML = '<i></i>WebGPU ready';
    }
    catch (GpuTrouble)
    {
        console.info('WebGPU unavailable, engaging interactive software 3D preview engine:', GpuTrouble?.message);
        Scene.IsFallback = true;
        // WebGPU getContext('webgpu') permanently locks a canvas from getContext('2d'); replace cleanly if locked
        if (!Canvas.getContext('2d'))
        {
            const FreshCanvas = Canvas.cloneNode(false);
            Canvas.replaceWith(FreshCanvas);
            Canvas = FreshCanvas;
            ResizeCanvas();
        }
        Scene.Engine = new SoftwarePreviewEngine(Canvas);
        const Facts = await Scene.Engine.init();
        Scene.AdapterName = Facts.adapter;
        Scene.Readback = new SoftwareLatticeReadback(() => Scene.FieldScene, Scene.Wind, () => Scene.Time);
        const Pill = document.getElementById('engine-pill');
        Pill.classList.add('software');
        document.getElementById('engine-pill-text').textContent = 'PREVIEW · SOFTWARE 3D';
        document.getElementById('status-ready').innerHTML = '<i></i>Software 3D preview active (open in WebGPU Chrome/Edge for GPU compute)';
    }

    document.getElementById('status-adapter').textContent = Scene.AdapterName;
    Scene.Lightning = new PE.Lightning();

    const Query = new URLSearchParams(location.search).get('scene');
    const InitialIds = Query === null ? PE.defaultScene : (Query === 'none' || Query === '' ? [] : Query.split(','));
    for (const Id of InitialIds) if (PE.presetById(Id)) Scene.Effects.push(ConstructEffect(Id));
    Selected = Scene.Effects[0]?.Token || 'Vehicle';

    ConstructSceneTabs();
    ConstructOverlay();
    ConstructOutliner();
    ConstructAddMenuAssets();
    ConstructVehicleHmiDock();
    ConstructInspectorPage();

    LoadControlVehicle().then(Mesh =>
    {
        Scene.Vehicle.Mesh = Mesh;
        Scene.Vehicle.Loaded = true;
        if (!Scene.IsFallback && Scene.Engine?.uploadVehicle)
            Scene.Engine.uploadVehicle(Mesh);
        SyncVehicleHmiDock();
        ConstructOutliner();
        if (Selected === 'Vehicle') ConstructInspectorPage();
        C.Broadcast();
        AppendLog('STAGE', 'Loaded ControlVehicle FCT1 asset', `${FormatInteger(Mesh.stats.totalTris)} tris · ${FormatInteger(Mesh.stats.edgeCount)} crease edges`, 'live');
    }).catch(Err =>
    {
        AppendLog('STAGE', 'ControlVehicle load failed', Err?.message || String(Err), 'warn');
    });

    OutlinerScroller = C.SmoothScroll(document.getElementById('OutlinerScroll'), document.getElementById('OutlinerContent'));
    InspectorScroller = C.SmoothScroll(document.getElementById('InspectorScroll'), document.getElementById('InspectorContent'));

    PE.Edits.Subscribe(() =>
    {
        document.getElementById('inspector-revision').textContent = `Parameters · Revision ${++Scene.Revisions}`;
    });

    const HandoffView = {
        get selection() { const E = EffectByToken(Selected); return E ? { type: 'system', id: E.Number } : { type: 'other' }; },
        get systems() { return Scene.Effects.map(E => ({ id: E.Number, presetId: E.PresetId, name: E.Name, p: E.P })); }
    };
    PE.Handoff.Install(HandoffView, {
        Open: (PresetId, Name) =>
        {
            const Ex = Scene.Effects.find(E => E.PresetId === PresetId);
            const E = Ex || (PE.presetById(PresetId) ? AddEffect(PresetId) : null);
            if (!E) return null;
            if (Name) E.Name = Name;
            Selected = E.Token;
            return { p: E.P, Effect: E };
        },
        Rebuild: Opened => RebuildGpu(Opened.Effect),
        Refresh: () => { ConstructOutliner(); ConstructInspectorPage(); C.Broadcast(); }
    });

    AttachOrbit();
    window.addEventListener('resize', ResizeCanvas);
    new ResizeObserver(ResizeCanvas).observe(Canvas.parentElement);

    window.addEventListener('keydown', Ev =>
    {
        if (Ev.target.matches('input, select, textarea')) return;
        if ((Ev.ctrlKey || Ev.metaKey) && Ev.key.toLowerCase() === 'f') { Ev.preventDefault(); document.getElementById('scene-search').focus(); }
        else if (Ev.code === 'Space') { Ev.preventDefault(); TogglePlay(); }
        else if (Ev.key === 'l' || Ev.key === 'L') StrikeNow();
        else if (Ev.key === 'b' || Ev.key === 'B') BurstAll();
        else if (Ev.key === 'r' || Ev.key === 'R') ResetAll();
        else if (Ev.key === 's' || Ev.key === 'S') { document.getElementById('step-button').click(); }
        else if (Ev.key === 'p' || Ev.key === 'P') { Scene.ProbeEnabled = true; Scene.AnemometerPlacing = !Scene.AnemometerPlacing; SyncAnemometerToolState(); C.Broadcast(); }
        else if (Ev.key === 'x' || Ev.key === 'X') { const M = CycleInspectionMode(Scene.Vehicle); SyncVehicleHmiDock(); AppendLog('STAGE', `Inspection mode -> ${M.label}`, M.detail, 'live'); C.Toast(`Inspection: ${M.label}`); C.Broadcast(); }
        else if (Ev.key === 'v' || Ev.key === 'V') { document.getElementById('toggle-overlay-btn').click(); }
        else if (Ev.key === '/') { Ev.preventDefault(); const M = document.getElementById('add-menu'); if (M?.hidden) document.getElementById('add-button')?.click(); else document.getElementById('add-menu-preset-search')?.focus(); }
        else if (Ev.key === 'Escape') { Scene.AnemometerPlacing = false; SyncAnemometerToolState(); document.getElementById('add-menu').hidden = true; document.getElementById('LibraryVeil').classList.remove('shown'); SyncTopNav(); }
    });

    SyncAnemometerToolState();
    AppendLog('PARTICLES', `Engine ready · ${Scene.AdapterName}`, `${Scene.Effects.length} effects · ${PE.Presets.length} presets`, 'live');
    AppendLog('FORCES', 'ForceFieldVisualization active', `${Scene.FieldScene.Sources.length} bounded sources + Ambient Wind`, 'live');
    HandleAssetDeepLink();

    C.Broadcast();
    window.ParticleEditorScene = Scene;
    window.ParticleEditorView = Visualization;
    window.ParticleEditorHold = En => { Held = !!En; if (!Held) { LastTick = 0; requestAnimationFrame(Tick); } else { Advance(performance.now()); RefreshLive(); } return Held; };
    requestAnimationFrame(Tick);
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', Boot);
else Boot();
