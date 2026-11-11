/*==========================================================================================================================================
                                                           FORCEFIELDEDITOR.JS
==========================================================================================================================================*/
// Force Field Editor: bounded sources, live engineering diagnostics, and 2D/3D vector-field views.

import { ForceFieldCatalogue as F, Radian, ResolveReceiverLoad, AirDensityAtSeaLevel } from './Engine/ForceFieldCatalogue.js';
import { StudioControls as C } from './StudioControls.js';
import { ForceField3DViewport } from './Engine/ForceField3DViewport.js';

const V = globalThis.ForceFieldVisualization;
const StorageKey = 'frontier-remastered-forcefield-v1';
const SampleCapacity = 60;

const DefaultReceiverModel = Object.freeze({ MassKg: 80, AreaM2: 0.75, LeverArmM: 0.25, ReferenceSpeed: 1.5, DragCoefficient: 1 });
const Scene = RestoreScene();
const Clock = { Time: 0, Playing: true, LastTick: 0 };
const ForceSamples = [], WindSamples = [];
const LiveRefreshers = [];
const LiveOutlinerRows = [];
let PageScope = null, OutlinerScope = null;
let Selected = 'Field';
let PlacementType = null;
let PlacementDragPreview = null;
let ViewMode = 'Map'; // 'Map' | 'Stage3D'
let Visualization = null;
let Stage3D = null;
let HoverPoint = null;
let OutlinerQuery = '';
let SceneRevision = 0, PreparedRevision = -1;
let Prepared = F.Prepare(Scene, 0);
let PlayButton = null, ClockReading = null, PlayheadMark = null, TimelineSignature = '';

const Clamp = (Val, Lo, Hi) => Math.min(Hi, Math.max(Lo, Val));
const Wrap360 = (Deg) => ((Deg % 360) + 360) % 360;
const FormatDistance = (M) => V ? V.FormatDistance(M) : `${Math.round(M)} m`;
const FormatCount = (N) => N >= 1e6 ? (N / 1e6).toFixed(1) + ' M' : N >= 1e4 ? (N / 1e3).toFixed(0) + ' k' : N.toLocaleString('en-US');
const SourceByToken = (Token) => Scene.Sources.find((S) => S.Token === Token) || null;

//------------------------------------------------------------------------------------------------------------------------
//                                                 PERSISTENCE & SCENARIOS
//------------------------------------------------------------------------------------------------------------------------

function RestoreScene()
{
    const Defaults = F.ConstructScenario('lab');
    Defaults.Probe = Object.assign({}, DefaultReceiverModel);
    try
    {
        const Stored = JSON.parse(localStorage.getItem(StorageKey) || 'null');
        if (!Stored || !Array.isArray(Stored.Sources)) return Defaults;
        const StoredVisualization = Object.assign(Defaults.Visualization, Stored.Visualization, { Solo: null });
        if (!Stored.Visualization?.Preset) StoredVisualization.Preset = 'custom';
        return {
            Scenario: Stored.Scenario || 'lab',
            Wind: Object.assign(Defaults.Wind, Stored.Wind),
            Field: Object.assign(Defaults.Field, Stored.Field),
            Sources: Stored.Sources.filter((S) => F.TypeById[S.Type]).map((S) => F.ConstructSource(S.Type, S)),
            Visualization: StoredVisualization,
            Timeline: Object.assign(Defaults.Timeline, Stored.Timeline),
            Probe: Object.assign({}, Defaults.Probe, Stored.Probe)
        };
    }
    catch { return Defaults; }
}

let PersistTimer = 0;
function Persist()
{
    clearTimeout(PersistTimer);
    PersistTimer = setTimeout(() => { try { localStorage.setItem(StorageKey, JSON.stringify(Scene)); } catch {} }, 300);
}

function LoadScenario(Key)
{
    const Fresh = F.ConstructScenario(Key);
    Object.assign(Scene, Fresh);
    Selected = Scene.Sources[0]?.Token || 'Field';
    Clock.Time = 0;
    ForceSamples.length = 0;
    WindSamples.length = 0;
    CancelPlacement();
    if (Visualization)
    {
        Visualization.View.CentreX = 0;
        Visualization.View.CentreZ = 0;
        Visualization.View.Span = Scene.Visualization.Span || 1400;
        Visualization.Invalidate();
    }
    ConstructOutliner();
    ConstructInspectorPage();
    ConstructTimeline();
    SyncTopUi();
    SceneRevision++;
    C.Broadcast();
    AppendLog('SCENARIO', `Loaded preset: ${Key}`, `${Scene.Sources.length} bounded forcefields`);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      LOG STREAM
//------------------------------------------------------------------------------------------------------------------------

const LogEntries = [];
let LogPaused = false;

function AppendLog(Channel, Message, Detail, Key)
{
    if (LogPaused) return;
    const Now = new Date();
    const Last = LogEntries[0];
    if (Key && Last && Last.Key === Key && Now - Last.When < 1400) Object.assign(Last, { Message, Detail, When: Now });
    else LogEntries.unshift({ Channel, Message, Detail, Key, When: Now });
    if (LogEntries.length > 80) LogEntries.pop();
    RefreshLog();
}

function RefreshLog()
{
    const Content = document.getElementById('LogContent');
    if (!Content) return;
    Content.textContent = '';
    for (const Entry of LogEntries)
    {
        Content.append(C.Construct('div', 'log-row', [
            C.Construct('span', 'when', Entry.When.toTimeString().slice(0, 8)),
            C.Construct('span', 'channel', Entry.Channel),
            C.Construct('span', 'message', [C.Construct('b', null, Entry.Message), Entry.Detail ? C.Construct('span', null, ' · ' + Entry.Detail) : null])
        ]));
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   BINDING HELPERS
//------------------------------------------------------------------------------------------------------------------------

function Bind(Target, Key, Extra = {}, Channel = 'FORCES', Owner = 'Force Field')
{
    const Label = Extra.Label || Key;
    return Object.assign({
        Read: () => Target[Key],
        Write: (Value) =>
        {
            Target[Key] = Value;
            if (Target === Scene.Probe || (Target === Scene.Visualization && Key === 'Contribution')) ForceSamples.length = 0;
            if (Target === Scene.Visualization && Key !== 'Preset') Target.Preset = 'custom';
            SceneRevision++;
            Visualization?.Invalidate();
            const Shown = typeof Value === 'boolean' ? (Value ? 'on' : 'off')
                : typeof Value === 'number' ? (Extra.Distance ? FormatDistance(Value) : `${Number(Value.toFixed(Extra.Digits ?? 2))}${Extra.Unit ? ' ' + Extra.Unit : ''}`)
                : Array.isArray(Value) ? `[${Value.map((V) => Number(Number(V).toFixed(1))).join(', ')}]` : String(Value);
            AppendLog(Channel, `${Owner}: ${Label} → ${Shown}`, null, `${Owner}.${Key}`);
            Sync3DIfVisible();
            if (Target === Scene.Visualization) SyncTopUi();
        }
    }, Extra);
}

const DistanceFormat = (Q) => Q >= 1000 ? [(Q / 1000).toFixed(Q >= 10000 ? 1 : 2), 'km'] : [Q.toFixed(Q < 10 ? 1 : 0), 'm'];
function DistanceParse(Text, Unit)
{
    const M = /(-?[\d.,]+)\s*(km|m)?/i.exec(Text.trim());
    if (!M) return NaN;
    return parseFloat(M[1].replace(',', '.')) * ((M[2] || Unit || 'm').toLowerCase() === 'km' ? 1000 : 1);
}

function DistanceBinding(Target, Key, Extra, Channel, Owner)
{
    return Bind(Target, Key, Object.assign({ Scale: 'Logarithmic', Format: DistanceFormat, Parse: DistanceParse, Step: 1, Distance: true }, Extra), Channel, Owner);
}

function ParameterBinding(Source, Param)
{
    const Extra = { Label: Param.Label, Minimum: Param.Minimum, Maximum: Param.Maximum, Step: Param.Step, Unit: Param.Unit, Digits: Param.Digits ?? 1 };
    return Param.Distance ? DistanceBinding(Source, Param.Key, Extra, 'FORCES', Source.Name) : Bind(Source, Param.Key, Extra, 'FORCES', Source.Name);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 PLACEMENT & MUTATIONS
//------------------------------------------------------------------------------------------------------------------------

function StartPlacement(TypeId)
{
    if (!F.TypeById[TypeId]) return;
    PlacementType = TypeId;
    PlacementDragPreview = null;
    ApplyVisualization();
    SyncTopUi();
    Sync3DIfVisible();
    const Type = F.TypeById[TypeId];
    const Banner = document.getElementById('PlaceBanner');
    const Text = document.getElementById('PlaceBannerText');
    if (Banner && Text)
    {
        Text.textContent = `Place ${Type.Name} · Click or drag in viewport to aim & size influence`;
        Banner.hidden = false;
    }
    AppendLog('PLACE', `Placement armed: ${Type.Name}`, 'click viewport to drop', 'Place');
}

function CancelPlacement()
{
    PlacementType = null;
    PlacementDragPreview = null;
    const Banner = document.getElementById('PlaceBanner');
    if (Banner) Banner.hidden = true;
    ApplyVisualization();
    SyncTopUi();
    Sync3DIfVisible();
}

function PlaceSourceAt(TypeId, X, Z, BearingDeg = null, RadiusMetres = null)
{
    const Type = F.TypeById[TypeId] || F.TypeById.WindGenerator;
    const CountSame = Scene.Sources.filter((S) => S.Type === TypeId).length + 1;
    const Overrides = {
        Name: `${Type.Name} ${CountSame}`,
        Centre: [Number(X.toFixed(1)), Type.Defaults.CentreY ?? (TypeId === 'WindGenerator' ? 0 : 10), Number(Z.toFixed(1))]
    };
    if (BearingDeg !== null && BearingDeg !== undefined) Overrides.Bearing = Math.round(BearingDeg);
    if (RadiusMetres !== null && RadiusMetres !== undefined)
    {
        const ClampedR = Math.round(Clamp(RadiusMetres, 15, 25000));
        Overrides.Radius = ClampedR;
        if (Type.Reach === 'Box') { Overrides.HalfX = Math.round(ClampedR * 0.75); Overrides.HalfZ = Math.round(ClampedR * 0.75); }
    }
    const Src = F.ConstructSource(TypeId, Overrides);
    Scene.Sources.push(Src);
    Selected = Src.Token;
    SceneRevision++;
    Visualization?.Invalidate();
    CancelPlacement();
    ConstructOutliner();
    ConstructInspectorPage();
    ConstructTimeline();
    Sync3DIfVisible();
    C.Broadcast();
    C.Toast(`Placed ${Src.Name} (${FormatDistance(Src.Radius)} influence)`);
    AppendLog('PLACE', `Placed ${Src.Name}`, `(${Math.round(X)}, ${Math.round(Z)}) m · ${FormatDistance(Src.Radius)}`, Src.Token);
}

function RemoveSource(Token)
{
    const Index = Scene.Sources.findIndex((S) => S.Token === Token);
    if (Index < 0) return;
    const [Removed] = Scene.Sources.splice(Index, 1);
    if (Scene.Visualization.Solo === Token) Scene.Visualization.Solo = null;
    Selected = Scene.Sources[Math.min(Index, Scene.Sources.length - 1)]?.Token || 'Field';
    SceneRevision++;
    Visualization?.Invalidate();
    ConstructOutliner();
    ConstructInspectorPage();
    ConstructTimeline();
    Sync3DIfVisible();
    C.Broadcast();
    AppendLog('FORCES', `Removed ${Removed.Name}`, null, 'Remove');
}

function DuplicateSource(Source)
{
    const Copy = F.ConstructSource(Source.Type, Object.assign({}, JSON.parse(JSON.stringify(Source)), {
        Token: undefined,
        Name: `${Source.Name} copy`,
        Centre: [Source.Centre[0] + Math.max(40, Source.Radius * 0.35), Source.Centre[1], Source.Centre[2] + Math.max(40, Source.Radius * 0.35)]
    }));
    Scene.Sources.push(Copy);
    Selected = Copy.Token;
    SceneRevision++;
    Visualization?.Invalidate();
    ConstructOutliner();
    ConstructInspectorPage();
    ConstructTimeline();
    Sync3DIfVisible();
    C.Broadcast();
    AppendLog('FORCES', `Duplicated ${Copy.Name}`, null, Copy.Token);
}

function FireSource(Source)
{
    Source.TriggeredAt = Clock.Time;
    Source.Enabled = true;
    SceneRevision++;
    Visualization?.Invalidate();
    ConstructTimeline();
    Sync3DIfVisible();
    C.Broadcast();
    AppendLog('TRIGGER', `Fired ${Source.Name}`, `at t = ${Clock.Time.toFixed(1)} s`, Source.Token + '.Fire');
}

function FrameSource(Source)
{
    const R = Math.max(80, Source.Radius || 160);
    if (Visualization)
    {
        Visualization.View.CentreX = Source.Centre[0];
        Visualization.View.CentreZ = Source.Centre[2];
        Visualization.View.Span = Clamp(R * 4.2, 160, 120000);
        Visualization.Invalidate();
    }
    if (Stage3D && ViewMode === 'Stage3D')
    {
        Stage3D.Controls?.target?.set(Source.Centre[0] * Stage3D.ScaleFactor, Source.Centre[1] * Stage3D.ScaleFactor, Source.Centre[2] * Stage3D.ScaleFactor);
    }
    C.Broadcast();
}

function JumpToSpan(Span)
{
    Scene.Visualization.Span = Span;
    if (Visualization) { Visualization.View.Span = Span; Visualization.Invalidate(); }
    SyncTopUi();
    Sync3DIfVisible();
    C.Broadcast();
}

function SwitchViewMode(Mode)
{
    ViewMode = Mode;
    const Canvas2D = document.getElementById('ViewportCanvas');
    const Mount3D = document.getElementById('Stage3DMount');
    const Minimap = document.getElementById('MinimapInset');
    if (Mode === 'Stage3D')
    {
        Canvas2D.hidden = true;
        Mount3D.hidden = false;
        Minimap.classList.remove('shown');
        if (!Stage3D)
        {
            Stage3D = new ForceField3DViewport(Mount3D, {
                OnSourcePick: (Token) => { if (Selected !== Token) { Selected = Token; ConstructInspectorPage(); C.Broadcast(); Sync3DIfVisible(); } },
                OnPlace: (X, Z) => { if (PlacementType) PlaceSourceAt(PlacementType, X, Z); }
            });
        }
        Stage3D.Resize();
        Sync3DIfVisible();
    }
    else
    {
        Mount3D.hidden = true;
        Canvas2D.hidden = false;
        Minimap.classList.add('shown');
        Scene.Visualization.Mode = 'Map';
        ViewMode = 'Map';
        if (Visualization) { Visualization.View.Mode = 'Map'; Visualization.Resize(); Visualization.Invalidate(); }
    }
    SyncTopUi();
    C.Broadcast();
}

function Sync3DIfVisible()
{
    if (Stage3D && ViewMode === 'Stage3D')
    {
        Stage3D.SyncScene(Scene, Selected, Clock.Time, {
            PlacementMode: Boolean(PlacementType),
            PlacementType: PlacementType || 'WindGenerator',
            Span: Visualization?.View?.Span || Scene.Visualization.Span || 1400
        });
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   VISUALIZATION WIREUP
//------------------------------------------------------------------------------------------------------------------------

function SampleField(Contribution, X, Y, Z, Time, CellSpan, Out)
{
    if (Prepared.Time !== Time || PreparedRevision !== SceneRevision)
    {
        Prepared = F.Prepare(Scene, Time);
        PreparedRevision = SceneRevision;
    }
    return F.EvaluatePrepared(Scene, Prepared, Contribution, X, Y, Z, CellSpan, Out, Scene.Visualization.Solo);
}

const ViewPresets = {
    composite: {
        Heatmap: true, Opacity: 0.38, Arrows: true, ArrowSpacing: 58, QuietCutoff: 0.035,
        FlowLines: true, FlowLineSpacing: 62, FlowLineLength: 24, FlowLinePulse: true,
        Tracers: true, TracerCount: 144, ShowInfluence: true, Labels: true, MinimalLabels: false
    },
    vectors: {
        Heatmap: false, Arrows: true, ArrowSpacing: 52, QuietCutoff: 0.025,
        FlowLines: false, Tracers: false, ShowInfluence: true, Labels: true, MinimalLabels: false
    },
    streamlines: {
        Heatmap: false, Arrows: false, FlowLines: true, FlowLineSpacing: 48,
        FlowLineLength: 28, FlowLinePulse: true, Tracers: true, TracerCount: 180,
        ShowInfluence: true, Labels: true, MinimalLabels: false
    },
    magnitude: {
        Heatmap: true, Opacity: 0.62, Arrows: false, FlowLines: false, Tracers: false,
        ShowInfluence: false, Labels: false, MinimalLabels: true
    },
    minimal: {
        Heatmap: false, Arrows: true, ArrowSpacing: 76, QuietCutoff: 0.06,
        FlowLines: true, FlowLineSpacing: 76, FlowLineLength: 18, FlowLinePulse: false,
        Tracers: false, ShowInfluence: false, Labels: false, MinimalLabels: true
    }
};

function ApplyViewPreset(Key)
{
    const Preset = ViewPresets[Key];
    if (!Preset) return;
    Object.assign(Scene.Visualization, Preset, { Preset: Key });
    SceneRevision++;
    Visualization?.Invalidate();
    SyncTopUi();
    Sync3DIfVisible();
    C.Broadcast();
    AppendLog('VIEW', `Field display: ${Key}`, 'preset applied', 'ViewPreset');
}

function ResolveProbePosition()
{
    let X = Visualization?.View?.CentreX ?? 0;
    let Z = Visualization?.View?.CentreZ ?? 0;
    if (HoverPoint && Visualization && ViewMode !== 'Stage3D')
    {
        const Hover = Visualization.ProbeAt(HoverPoint.ScreenX, HoverPoint.ScreenY, Clock.Time);
        if (Hover) { X = Hover.X; Z = Hover.Z; }
    }
    return { X, Z, Y: Number(Scene.Visualization.SliceHeight) || 10 };
}

function ReadLoadProbe()
{
    const { X, Z, Y } = ResolveProbePosition();
    const Contribution = Scene.Visualization.Contribution || 'Flow';
    if (Prepared.Time !== Clock.Time || PreparedRevision !== SceneRevision)
    {
        Prepared = F.Prepare(Scene, Clock.Time);
        PreparedRevision = SceneRevision;
    }
    const Vector = new Float64Array(3);
    F.EvaluatePrepared(Scene, Prepared, Contribution, X, Y, Z, 2, Vector, Scene.Visualization.Solo);
    const Load = ResolveReceiverLoad(Contribution, Vector, Scene.Probe);
    const FieldSymbol = Contribution === 'Flow' ? 'u' : Contribution === 'Accelerate' ? 'a' : 'γ';
    const FieldVectorText = Contribution === 'Damp'
        ? `γ = ${Load.FieldMagnitude.toFixed(3)} s⁻¹ · reference speed ${Load.ReferenceSpeed.toFixed(1)} m/s`
        : `${FieldSymbol} = [${Vector.map((Value) => Value.toFixed(2)).join(', ')}] ${Load.FieldUnit}`;
    return {
        ...Load,
        Enabled: Scene.Field.Enabled,
        Position: `X ${X.toFixed(0)} m · Y ${Y.toFixed(0)} m · Z ${Z.toFixed(0)} m`,
        FieldVectorText,
        Formula: `${Load.Formula} · ℓ perpendicular to force`
    };
}

function ReadAmbientWind()
{
    const Y = Scene.Wind.GroundHeight + 10;
    const Vector = new Float64Array(3);
    F.EvaluateWind(Scene.Wind, Scene.Field, 0, Y, 0, Clock.Time, 2, Vector);
    const Speed = Math.hypot(Vector[0], Vector[1], Vector[2]);
    const Bearing = Math.hypot(Vector[0], Vector[2]) > 1e-9
        ? Wrap360(Math.atan2(Vector[0], -Vector[2]) * 180 / Math.PI)
        : Wrap360(Scene.Wind.Bearing || 0);
    const PeakSpeed = WindSamples.length ? Math.max(...WindSamples) : Speed;
    const LullSpeed = WindSamples.length ? Math.min(...WindSamples) : Speed;
    return {
        Enabled: Scene.Wind.Enabled,
        Speed,
        PressurePa: 0.5 * AirDensityAtSeaLevel * Speed * Speed,
        PeakSpeed,
        LullSpeed,
        Position: `Origin · Y ${Y.toFixed(0)} m · ${Math.round(Bearing)}° ${C.ResolveCompassPoint(Bearing)}`
    };
}

function DescribeSources()
{
    const Shown = Scene.Visualization.Contribution;
    const Now = F.Prepare(Scene, Clock.Time);
    return Now.Entries.map((Entry) =>
    {
        const Source = Entry.Source;
        const Dec = {
            Id: Source.Token, X: Entry.Centre[0], Y: Entry.Centre[1], Z: Entry.Centre[2],
            Contribution: Entry.Contribution, Colour: F.ResolveSourceColour(Source), Label: Source.Name, Active: Entry.Envelope,
            Selected: Selected === Source.Token, Dim: Entry.Contribution !== Shown,
            Shape: Source.Reach === 'Box' ? 'Box' : 'Circle', Radius: Source.Radius
        };
        if (Source.Reach === 'Box' || Source.Type === 'GustFront')
        {
            const Ext = F.ResolveBoxExtents(Source);
            const Turn = (Source.Bearing || 0) * Radian;
            Object.assign(Dec, {
                Shape: 'Box', HalfX: Ext.HalfX, HalfZ: Ext.HalfZ, Rotation: Source.Bearing || 0,
                OutlineX: Entry.Centre[0] + Math.sin(Turn) * Ext.OffsetZ,
                OutlineZ: Entry.Centre[2] - Math.cos(Turn) * Ext.OffsetZ,
                Bearing: Source.Type === 'Drag' ? undefined : Source.Bearing
            });
        }
        if (Source.Type === 'Blast' && Entry.Envelope > 0.001) Dec.Radius = Math.min(Source.Radius, Source.InitialRadius + Source.Expansion * Entry.Age);
        if (Source.Type === 'Tornado' || Source.Type === 'Thermal' || Source.Type === 'Microburst') { Dec.InnerRadius = Source.InnerRadius; Dec.Height = Source.Height; }
        if (Source.Type === 'WindGenerator' || Source.Type === 'Puff') Dec.Bearing = Source.Bearing;
        if (Source.Type === 'Tornado' && Source.TrackSpeed > 0)
        {
            const Turn = Source.TrackBearing * Radian, Travel = Source.TrackSpeed * Scene.Timeline.Duration;
            Dec.Track = [[Source.Centre[0], Source.Centre[2]], [Source.Centre[0] + Math.sin(Turn) * Travel, Source.Centre[2] - Math.cos(Turn) * Travel]];
        }
        return Dec;
    });
}

function ApplyVisualization()
{
    if (!Visualization) return;
    const Settings = Scene.Visualization;
    let Preview = null;
    if (PlacementType && PlacementDragPreview)
    {
        const T = F.TypeById[PlacementType] || F.TypeById.WindGenerator;
        Preview = {
            X: PlacementDragPreview.X, Z: PlacementDragPreview.Z,
            Radius: PlacementDragPreview.Radius || T.Defaults.Radius || 200,
            Shape: T.Reach === 'Box' ? 'Box' : 'Circle',
            HalfX: T.Defaults.HalfX || T.Defaults.Radius || 140,
            HalfZ: T.Defaults.HalfZ || T.Defaults.Radius || 140,
            Bearing: PlacementDragPreview.Bearing ?? T.Defaults.Bearing,
            Contribution: T.Contribution,
            Colour: F.ResolveSourceColour(PlacementType),
            Label: T.Name
        };
    }

    Visualization.Configure({
        AllowOblique: false,
        Quantity: Settings.Quantity,
        Contribution: Settings.Contribution,
        ScaleMode: Settings.ScaleMode,
        FixedScale: Settings.FixedScale,
        Heatmap: Settings.Heatmap,
        HeatmapStyle: Settings.HeatmapStyle,
        Opacity: Settings.Opacity,
        Arrows: Settings.Arrows,
        ArrowSpacing: Settings.ArrowSpacing,
        QuietCutoff: Settings.QuietCutoff ?? 0.03,
        FlowLines: Settings.FlowLines !== false,
        FlowLineSpacing: Settings.FlowLineSpacing ?? 46,
        FlowLineLength: Settings.FlowLineLength ?? 22,
        FlowLinePulse: Settings.FlowLinePulse !== false,
        Tracers: Boolean(Settings.Tracers),
        TracerCount: Settings.TracerCount,
        SliceHeight: Settings.SliceHeight,
        CellPixels: Settings.CellPixels,
        ShowSources: Settings.ShowInfluence !== false,
        ShowLabels: Settings.Labels,
        MinimalLabels: Boolean(Settings.MinimalLabels),
        ShowCascades: Settings.Cascades,
        ShowGroundGrid: true,
        ShowScaleBar: true,
        ShowLegend: Boolean(Settings.Heatmap),
        Background: '#07090c',
        RefreshInterval: 96,
        Cascades: F.ResolveBudget(Scene).Levels.map((L, I) => ({ Extent: L.Extent, Cell: L.Cell, Label: `C${I} · ${FormatDistance(L.Extent)}` })),
        CascadeFocus: [Visualization.View.CentreX, Visualization.View.CentreZ],
        Sources: DescribeSources(),
        PlacementMode: Boolean(PlacementType),
        PlacementPreview: Preview
    });
}

function ConstructVisualization()
{
    if (!V) return;
    const Canvas = document.getElementById('ViewportCanvas');
    const Extent = Scene.Field.Extent / 2;
    Visualization = V.Create(Canvas, {
        Sample: SampleField, MinimumSpan: 40, MaximumSpan: 2.4e5,
        OnSourcePick: (Token) => { if (Selected !== Token) { Selected = Token; ConstructInspectorPage(); C.Broadcast(); } },
        OnSourceMove: (Token, X, Z) =>
        {
            const Source = SourceByToken(Token);
            if (!Source) return;
            const Entry = F.PrepareSource(Source, Scene.Wind, Clock.Time);
            const DX = Entry.Centre[0] - Source.Centre[0], DZ = Entry.Centre[2] - Source.Centre[2];
            Source.Centre = [Number((X - DX).toFixed(1)), Source.Centre[1], Number((Z - DZ).toFixed(1))];
            SceneRevision++;
            Visualization.Invalidate();
            AppendLog('FORCES', `${Source.Name}: moved`, `(${Math.round(Source.Centre[0])}, ${Math.round(Source.Centre[2])}) m`, Token + '.Move');
            C.Broadcast();
        },
        OnSourceRadiusChange: (Token, NewR) =>
        {
            const Source = SourceByToken(Token);
            if (!Source) return;
            Source.Radius = Math.round(Clamp(NewR, 10, 50000));
            if (Source.Reach === 'Box') { Source.HalfX = Math.round(Source.Radius * 0.8); Source.HalfZ = Math.round(Source.Radius * 0.8); }
            SceneRevision++;
            Visualization.Invalidate();
            AppendLog('INFLUENCE', `${Source.Name}: influence ${FormatDistance(Source.Radius)}`, null, Token + '.Radius');
            C.Broadcast();
        },
        OnSourceBearingChange: (Token, Deg) =>
        {
            const Source = SourceByToken(Token);
            if (!Source) return;
            if (Source.Type === 'Tornado') Source.TrackBearing = Math.round(Deg);
            else Source.Bearing = Math.round(Deg);
            SceneRevision++;
            Visualization.Invalidate();
            AppendLog('FORCES', `${Source.Name}: bearing ${Math.round(Deg)}°`, null, Token + '.Bearing');
            C.Broadcast();
        },
        OnPlacementHover: (X, Z, DragSpec) =>
        {
            PlacementDragPreview = Object.assign({ X, Z }, DragSpec || {});
        },
        OnPlace: (X, Z, DragBearing, DragRadius) =>
        {
            if (PlacementType) PlaceSourceAt(PlacementType, X, Z, DragBearing, DragRadius);
        },
        OnHover: (Point) => { HoverPoint = Point; },
        OnViewChange: () => { SyncTopUi(); }
    });
    Visualization.Configure({
        Extent: { MinimumX: -Extent, MinimumZ: -Extent, MaximumX: Extent, MaximumZ: Extent },
        Minimap: document.getElementById('MinimapCanvas')
    });
    Object.assign(Visualization.View, { Mode: 'Map', CentreX: 0, CentreZ: 0, Span: Scene.Visualization.Span || 1400, Yaw: Math.PI / 4, Pitch: 0.62 });
    Visualization.AttachNavigation();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        OUTLINER
//------------------------------------------------------------------------------------------------------------------------

function DescribeSourceMeta(Source)
{
    const Type = F.TypeById[Source.Type] || F.TypeById.WindGenerator;
    const Unit = F.Contributions[Type.Contribution].Unit;
    return `${Type.Contribution} · ${Number(Source.Strength.toFixed(1))} ${Unit} · R ${FormatDistance(Source.Radius)}`;
}

function ConstructTreeRow(Host, Row)
{
    const Meta = C.Construct('div', 'row-meta');
    const Glyph = C.Construct('div', 'row-glyph', C.ConstructGlyph(Row.Glyph));
    const Status = C.Construct('span', 'row-status');
    const Toggle = C.Construct('button', 'row-toggle', C.ConstructGlyph('Eye'));
    Toggle.type = 'button';
    const TreeRow = C.Construct('div', 'tree-row' + (Row.Depth === 1 ? ' nested' : ''), [
        Glyph,
        C.Construct('div', 'row-text', [C.Construct('div', 'row-name', Row.Name()), Meta]),
        Row.Status ? Status : null,
        Toggle
    ]);
    TreeRow.addEventListener('click', () => { Selected = Row.Id; ConstructInspectorPage(); C.Broadcast(); Sync3DIfVisible(); });
    Toggle.addEventListener('click', (E) => { E.stopPropagation(); Row.Flip(); C.Broadcast(); Sync3DIfVisible(); });
    C.Register(() =>
    {
        TreeRow.querySelector('.row-name').textContent = Row.Name();
        Meta.textContent = Row.Meta();
        const Enabled = Row.Enabled();
        TreeRow.classList.toggle('selected', Selected === Row.Id);
        TreeRow.classList.toggle('muted-row', !Enabled);
        Toggle.textContent = '';
        Toggle.append(C.ConstructGlyph(Enabled ? 'Eye' : 'EyeOff'));
        const Hidden = OutlinerQuery && !Row.Name().toLowerCase().includes(OutlinerQuery) && Row.Depth > 0 && Row.Id !== 'Wind';
        TreeRow.style.display = Hidden ? 'none' : '';
    });
    if (Row.Status) LiveOutlinerRows.push(() => { const St = Row.Status(); Status.textContent = St; Status.className = 'row-status ' + St.toLowerCase(); });
    Host.append(TreeRow);
}

function ConstructOutliner()
{
    if (OutlinerScope) C.ReleaseScope(OutlinerScope);
    OutlinerScope = C.OpenScope();
    LiveOutlinerRows.length = 0;
    const Host = document.getElementById('OutlinerContent');
    if (!Host) return;
    Host.textContent = '';

    const ActiveEl = C.Construct('strong', null, '0');
    const WaitingEl = C.Construct('strong', null, '0');
    Host.append(C.Construct('div', 'outliner-metrics', [
        C.Construct('div', 'mini-card', [ActiveEl, C.Construct('span', null, 'Acting now')]),
        C.Construct('div', 'mini-card', [WaitingEl, C.Construct('span', null, 'Waiting or off')])
    ]));

    const Search = C.Construct('input', 'search-box');
    Search.placeholder = 'Search forcefields & wind…';
    Search.value = OutlinerQuery;
    Search.addEventListener('input', () => { OutlinerQuery = Search.value.trim().toLowerCase(); C.Broadcast(); });
    Host.append(Search);

    Host.append(C.Construct('div', 'outliner-group', 'Master & Ambient Wind'));
    ConstructTreeRow(Host, {
        Id: 'Field', Depth: 0, Glyph: 'Field', Colour: '#8fd3c4',
        Name: () => 'Field system',
        Meta: () => `${Scene.Sources.length} bounded fields · ${Scene.Visualization.FlowLines !== false ? 'Flow lines' : 'Vectors'}`,
        Enabled: () => Scene.Field.Enabled,
        Flip: () => { Scene.Field.Enabled = !Scene.Field.Enabled; SceneRevision++; Visualization?.Invalidate(); }
    });
    ConstructTreeRow(Host, {
        Id: 'Wind', Depth: 1, Glyph: 'Wind', Colour: '#8fd3c4',
        Name: () => 'Ambient Wind',
        Meta: () => Scene.Wind.Enabled ? `${Scene.Wind.Speed.toFixed(1)} m/s @ ${Math.round(Scene.Wind.Bearing)}°${Scene.Wind.Bounded ? ' (bounded)' : ''}` : 'Off · Placed generators only',
        Enabled: () => Scene.Wind.Enabled,
        Flip: () => { Scene.Wind.Enabled = !Scene.Wind.Enabled; SceneRevision++; Visualization?.Invalidate(); }
    });

    const FlowSources = Scene.Sources.filter((S) => F.TypeById[S.Type]?.Contribution === 'Flow');
    const OtherSources = Scene.Sources.filter((S) => F.TypeById[S.Type]?.Contribution !== 'Flow');

    if (FlowSources.length)
    {
        Host.append(C.Construct('div', 'outliner-group', `Wind & Flow Generators (${FlowSources.length})`));
        for (const S of FlowSources)
        {
            const Type = F.TypeById[S.Type];
            ConstructTreeRow(Host, {
                Id: S.Token, Depth: 1, Glyph: Type.Glyph, Colour: F.ResolveSourceColour(S),
                Name: () => S.Name,
                Meta: () => DescribeSourceMeta(S),
                Enabled: () => S.Enabled,
                Status: () => (Prepared.Entries.find((E) => E.Source === S)?.Status || F.ResolveActivation(S, Clock.Time).Status),
                Flip: () => { S.Enabled = !S.Enabled; SceneRevision++; Visualization?.Invalidate(); }
            });
        }
    }

    if (OtherSources.length)
    {
        Host.append(C.Construct('div', 'outliner-group', `Accelerate & Damp Zones (${OtherSources.length})`));
        for (const S of OtherSources)
        {
            const Type = F.TypeById[S.Type];
            const Col = F.ResolveSourceColour(S);
            ConstructTreeRow(Host, {
                Id: S.Token, Depth: 1, Glyph: Type.Glyph, Colour: Col,
                Name: () => S.Name,
                Meta: () => DescribeSourceMeta(S),
                Enabled: () => S.Enabled,
                Status: () => (Prepared.Entries.find((E) => E.Source === S)?.Status || F.ResolveActivation(S, Clock.Time).Status),
                Flip: () => { S.Enabled = !S.Enabled; SceneRevision++; Visualization?.Invalidate(); }
            });
        }
    }

    LiveOutlinerRows.push(() =>
    {
        let Active = Scene.Wind.Enabled ? 1 : 0, Wait = Scene.Wind.Enabled ? 0 : 1;
        for (const S of Scene.Sources)
        {
            const St = F.ResolveActivation(S, Clock.Time).Status;
            if (St === 'Active') Active++; else Wait++;
        }
        ActiveEl.textContent = String(Active);
        WaitingEl.textContent = String(Wait);
        const StatusFooter = document.getElementById('OutlinerStatus');
        if (StatusFooter) StatusFooter.textContent = `${Scene.Sources.length} bounded fields · zero infinite leakage`;
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      TIMELINE
//------------------------------------------------------------------------------------------------------------------------

function ConstructTimeline()
{
    const Strip = document.getElementById('TimelineStrip');
    if (!Strip) return;
    Strip.textContent = '';

    const Transport = C.Construct('div', 'timeline-transport');
    PlayButton = C.Construct('button', 'round-btn' + (Clock.Playing ? ' on' : ''), C.ConstructGlyph(Clock.Playing ? 'Pause' : 'Play'));
    PlayButton.type = 'button';
    PlayButton.addEventListener('click', TogglePlay);
    ClockReading = C.Construct('div', 'timeline-clock');

    const SpeedRow = C.Construct('div', 'transport-row');
    const RateSelect = C.Construct('select', 'timeline-rate-select');
    RateSelect.setAttribute('aria-label', 'Simulation playback rate');
    for (const Rate of [0.25, 0.5, 1, 2, 5, 10])
    {
        const Option = C.Construct('option');
        Option.value = String(Rate);
        Option.textContent = `${Rate}×`;
        RateSelect.append(Option);
    }
    RateSelect.value = String(Scene.Timeline.Rate || 1);
    RateSelect.addEventListener('change', () => { Scene.Timeline.Rate = Number(RateSelect.value) || 1; C.Broadcast(); });
    SpeedRow.append(PlayButton, ClockReading, RateSelect);
    Transport.append(SpeedRow);
    Strip.append(Transport);

    const Tracks = C.Construct('div', 'timeline-tracks');
    const Ruler = C.Construct('div', 'timeline-ruler');
    const Duration = Scene.Timeline.Duration || 60;
    for (let P = 0; P <= 4; ++P)
    {
        const Tick = C.Construct('div', 'tick', C.Construct('span', null, `${Math.round((P / 4) * Duration)}s`));
        Tick.style.left = `${(P / 4) * 100}%`;
        Ruler.append(Tick);
    }
    const Scrub = (E) =>
    {
        const R = Ruler.getBoundingClientRect();
        Clock.Time = Clamp((E.clientX - R.left) / Math.max(1, R.width), 0, 1) * Duration;
        SceneRevision++;
        Visualization?.Invalidate();
        RefreshPlayhead();
        Sync3DIfVisible();
    };
    let DragRuler = false;
    Ruler.addEventListener('pointerdown', (E) => { DragRuler = true; Ruler.setPointerCapture(E.pointerId); Scrub(E); });
    Ruler.addEventListener('pointermove', (E) => { if (DragRuler) Scrub(E); });
    Ruler.addEventListener('pointerup', () => { DragRuler = false; });

    const Lanes = C.Construct('div', 'timeline-lanes');
    const Timed = Scene.Sources.filter((S) => S.Activation !== 'Always');
    for (const S of Timed)
    {
        const Track = C.Construct('div', 'lane-track');
        const Contrib = (F.TypeById[S.Type]?.Contribution || 'Flow').toLowerCase();
        const Windows = [];
        if (S.Activation === 'Window')
        {
            const Len = S.Lasts > 0 ? S.Lasts : Duration;
            const Rep = S.Repeats > 0 ? S.Repeats : Duration * 2;
            for (let T = S.Begins; T < Duration; T += Rep) Windows.push([T, Math.min(Duration, T + Len)]);
        }
        else if (S.TriggeredAt !== null && S.TriggeredAt !== undefined)
        {
            Windows.push([S.TriggeredAt, S.Lasts > 0 ? Math.min(Duration, S.TriggeredAt + S.Lasts) : Duration]);
        }
        for (const [A, B] of Windows)
        {
            const Win = C.Construct('i', 'lane-window ' + Contrib);
            Win.style.left = `${(A / Duration) * 100}%`;
            Win.style.width = `${Math.max(1, ((B - A) / Duration) * 100)}%`;
            Track.append(Win);
        }
        const Fire = C.Construct('button', 'lane-fire', S.Activation === 'Trigger' ? 'FIRE' : '');
        Fire.type = 'button';
        Fire.addEventListener('click', (E) => { E.stopPropagation(); FireSource(S); });
        const Lane = C.Construct('div', 'timeline-lane' + (Selected === S.Token ? ' selected' : ''), [C.Construct('span', 'lane-name', S.Name), Track, Fire]);
        Lane.addEventListener('click', () => { Selected = S.Token; ConstructInspectorPage(); C.Broadcast(); });
        Lanes.append(Lane);
    }
    if (!Timed.length) Lanes.append(C.Construct('div', 'timeline-hint', 'All active forcefields are steady · assign Window or Trigger timing in Inspector.'));

    PlayheadMark = C.Construct('div', 'timeline-playhead');
    Tracks.append(Ruler, Lanes, PlayheadMark);
    Strip.append(Tracks);
    RefreshPlayhead();
}

function RefreshPlayhead()
{
    if (!PlayheadMark || !ClockReading) return;
    const Duration = Scene.Timeline.Duration || 60;
    const Ruler = PlayheadMark.parentElement?.querySelector('.timeline-ruler');
    if (Ruler) PlayheadMark.style.left = `${(Clock.Time / Duration) * 100}%`;
    ClockReading.textContent = '';
    ClockReading.append(document.createTextNode(`${Clock.Time.toFixed(1)} s`), C.Construct('small', null, ` / ${Duration}s`));
}

function TogglePlay()
{
    Clock.Playing = !Clock.Playing;
    if (PlayButton) { PlayButton.classList.toggle('on', Clock.Playing); PlayButton.textContent = ''; PlayButton.append(C.ConstructGlyph(Clock.Playing ? 'Pause' : 'Play')); }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    INSPECTOR PAGES
//------------------------------------------------------------------------------------------------------------------------

function ConstructInspectorPage()
{
    if (PageScope) C.ReleaseScope(PageScope);
    PageScope = C.OpenScope();
    LiveRefreshers.length = 0;

    const Page = document.getElementById('InspectorContent');
    if (!Page) return;
    Page.textContent = '';

    if (Selected === 'Field') ConstructFieldPage(Page);
    else if (Selected === 'Wind') ConstructWindPage(Page);
    else
    {
        const Source = SourceByToken(Selected);
        if (Source) ConstructSourcePage(Page, Source);
        else { Selected = 'Field'; ConstructFieldPage(Page); }
    }
}

function FormatEngineeringValue(Value)
{
    const Numeric = Number(Value);
    return Number.isFinite(Numeric) ? Numeric.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : '—';
}

function BuildEngineeringCard(Host, Spec)
{
    const Card = C.Construct('section', 'engineering-card');
    const Status = C.Construct('span', 'engineering-live', 'LIVE');
    const Header = C.Construct('div', 'engineering-card-head', [
        C.Construct('div', 'engineering-title-stack', [
            C.Construct('span', 'engineering-eyebrow', Spec.Eyebrow || 'LIVE FIELD READOUT'),
            C.Construct('h3', null, Spec.Title)
        ]),
        Status
    ]);
    const Position = C.Construct('div', 'engineering-position');
    const Entries = (Spec.Metrics || []).map((Metric) =>
    {
        const Label = C.Construct('span', 'engineering-metric-label', typeof Metric.Label === 'function' ? '' : Metric.Label);
        const Value = C.Construct('strong', 'engineering-metric-value', '—');
        const Unit = C.Construct('small', 'engineering-metric-unit', typeof Metric.Unit === 'function' ? '' : Metric.Unit || '');
        return { Metric, Label, Value, Unit, Cell: C.Construct('div', 'engineering-metric', [Label, C.Construct('div', 'engineering-metric-reading', [Value, Unit])]) };
    });
    const Grid = C.Construct('div', 'engineering-metrics', Entries.map((Entry) => Entry.Cell));
    const Formula = C.Construct('p', 'engineering-formula');
    const TraceLabel = C.Construct('div', 'engineering-trace-label', Spec.TraceLabel || 'Rolling 60-second trace');
    Card.append(Header, Position, Grid, Formula, TraceLabel);
    Host.append(Card);

    const Trace = C.TimeSeries(Card, {
        Samples: Spec.Samples,
        Capacity: SampleCapacity,
        Target: null,
        Height: Spec.Height || 68,
        TimeLabels: ['−60 s', '−30 s', 'now']
    });
    const Refresh = () =>
    {
        const Reading = Spec.Resolve?.() || {};
        Position.textContent = Reading.Position || 'Position unavailable';
        Status.textContent = Reading.Enabled === false ? 'OFF' : 'LIVE';
        Status.classList.toggle('is-off', Reading.Enabled === false);
        Formula.textContent = Reading.Formula || (typeof Spec.Note === 'function' ? Spec.Note(Reading) : Spec.Note || '');
        for (const Entry of Entries)
        {
            const { Metric } = Entry;
            const Raw = Metric.Read ? Metric.Read(Reading) : Reading[Metric.Key];
            const Label = typeof Metric.Label === 'function' ? Metric.Label(Reading) : Metric.Label;
            const Unit = typeof Metric.Unit === 'function' ? Metric.Unit(Reading) : Metric.Unit;
            Entry.Label.textContent = Label || '';
            Entry.Value.textContent = Metric.Format ? Metric.Format(Raw, Reading) : FormatEngineeringValue(Raw);
            Entry.Unit.textContent = Unit || '';
        }
        Trace.Refresh();
    };
    Refresh();
    return { Card, Refresh };
}

function ConstructFieldPage(Page)
{
    const Viz = Scene.Visualization;
    Page.append(
        C.Construct('div', 'breadcrumb-row', 'Scene / Field system'),
        C.Construct('div', 'page-title', [C.Construct('h2', null, 'Field system'), C.Construct('span', 'live-pill', 'LIVE')]),
        C.Construct('div', 'page-subtitle', 'Field outputs are converted to SI receiver loads: newtons, pascals, and newton-metres.')
    );

    C.SelectRow(Page, Bind(Scene.Visualization, 'Contribution', {
        Label: 'Field output',
        Options: [['Flow velocity · m/s', 'Flow'], ['Acceleration · m/s²', 'Accelerate'], ['Damping rate · 1/s', 'Damp']]
    }, 'VIEW', 'Field'));

    const LoadCard = BuildEngineeringCard(Page, {
        Eyebrow: 'RECEIVER LOAD · SI UNITS',
        Title: 'Field-to-load probe',
        Samples: ForceSamples,
        Height: 68,
        TraceLabel: 'Resultant force · N · rolling 60 s',
        Resolve: ReadLoadProbe,
        Metrics: [
            { Label: (Reading) => Reading.ForceLabel, Key: 'ForceN', Unit: 'N' },
            { Label: (Reading) => Reading.PressureLabel, Key: 'PressurePa', Unit: 'Pa' },
            { Label: 'Moment about lever arm', Key: 'MomentNm', Unit: 'N·m' },
            { Label: (Reading) => Reading.FieldLabel, Key: 'FieldMagnitude', Unit: (Reading) => Reading.FieldUnit }
        ]
    });
    LiveRefreshers.push(LoadCard.Refresh);

    const ReceiverSec = C.SectionCard(Page, {
        Id: 'receiver-model', Title: 'Receiver model', Glyph: 'Target',
        Status: () => `${Scene.Probe.MassKg.toFixed(1)} kg · ${Scene.Probe.AreaM2.toFixed(2)} m²`
    });
    ReceiverSec.Card.classList.add('folded');
    C.SliderRow(ReceiverSec.Inner, Bind(Scene.Probe, 'MassKg', { Label: 'Receiver mass', Minimum: 0.1, Maximum: 10000, Step: 0.1, Digits: 1, Unit: 'kg' }, 'VIEW', 'Receiver'));
    C.SliderRow(ReceiverSec.Inner, Bind(Scene.Probe, 'AreaM2', { Label: 'Projected area', Minimum: 0.01, Maximum: 100, Step: 0.01, Digits: 2, Unit: 'm²' }, 'VIEW', 'Receiver'));
    C.SliderRow(ReceiverSec.Inner, Bind(Scene.Probe, 'LeverArmM', { Label: 'Perpendicular lever arm', Minimum: 0, Maximum: 10, Step: 0.05, Digits: 2, Unit: 'm' }, 'VIEW', 'Receiver'));
    C.SliderRow(ReceiverSec.Inner, Bind(Scene.Probe, 'DragCoefficient', {
        Label: 'Drag coefficient Cᴅ', Minimum: 0.1, Maximum: 3, Step: 0.05, Digits: 2,
        Availability: () => ({ Enabled: Scene.Visualization.Contribution === 'Flow' })
    }, 'VIEW', 'Receiver'));
    C.SliderRow(ReceiverSec.Inner, Bind(Scene.Probe, 'ReferenceSpeed', {
        Label: 'Reference object speed', Minimum: 0, Maximum: 120, Step: 0.5, Digits: 1, Unit: 'm/s',
        Availability: () => ({ Enabled: Scene.Visualization.Contribution === 'Damp' })
    }, 'VIEW', 'Receiver'));

    const DisplaySec = C.SectionCard(Page, {
        Id: 'display-layers', Title: 'Field display layers', Glyph: 'Layers',
        Status: () => `${Viz.Preset || 'custom'} · ${Viz.Heatmap ? 'magnitude' : 'vectors'}`
    });
    C.SelectRow(DisplaySec.Inner, Bind(Viz, 'Quantity', {
        Label: 'Mapped scalar',
        Options: [
            ['Speed magnitude', 'Speed'], ['East component · uₓ', 'AlongX'], ['South component · u_z', 'AlongZ'],
            ['Vertical component · uᵧ', 'Vertical'], ['Vorticity · ω', 'Vorticity'], ['Divergence · ∇·u', 'Divergence']
        ]
    }, 'VIEW', 'View'));
    C.SelectRow(DisplaySec.Inner, Bind(Viz, 'ScaleMode', {
        Label: 'Scalar normalization', Options: [['Automatic range', 'Automatic'], ['Fixed range', 'Fixed']]
    }, 'VIEW', 'View'));
    C.SliderRow(DisplaySec.Inner, Bind(Viz, 'FixedScale', {
        Label: 'Fixed scalar range', Minimum: 1, Maximum: 200, Step: 1, Digits: 0, Unit: 'm/s',
        Availability: () => ({ Enabled: Viz.ScaleMode === 'Fixed' })
    }, 'VIEW', 'View'));
    C.SliderRow(DisplaySec.Inner, Bind(Viz, 'Opacity', {
        Label: 'Magnitude layer opacity', Minimum: 0.1, Maximum: 0.8, Step: 0.01, Digits: 2, Unit: 'α',
        Availability: () => ({ Enabled: Boolean(Viz.Heatmap) })
    }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'Heatmap', { Label: 'Magnitude heatmap' }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'Arrows', { Label: 'Vector arrows' }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'FlowLines', { Label: 'Streamlines' }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'Tracers', { Label: 'Animated tracers' }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'ShowInfluence', { Label: 'Finite influence contours' }, 'VIEW', 'View'));
    C.SwitchRow(DisplaySec.Inner, Bind(Viz, 'MinimalLabels', { Label: 'Minimal source labels' }, 'VIEW', 'View'));

    const SamplingSec = C.SectionCard(Page, {
        Id: 'sampling', Title: 'Sampling & declutter', Glyph: 'Lattice',
        Status: () => `${Viz.ArrowSpacing}px vectors · ${Viz.FlowLineSpacing ?? 46}px lines`
    });
    SamplingSec.Card.classList.add('folded');
    C.SliderRow(SamplingSec.Inner, Bind(Viz, 'ArrowSpacing', { Label: 'Vector spacing', Minimum: 30, Maximum: 96, Step: 2, Digits: 0, Unit: 'px', Labels: ['dense', 'sparse'] }, 'VIEW', 'View'));
    C.SliderRow(SamplingSec.Inner, Bind(Viz, 'FlowLineSpacing', { Label: 'Streamline separation', Minimum: 24, Maximum: 88, Step: 2, Digits: 0, Unit: 'px', Labels: ['dense', 'sparse'] }, 'VIEW', 'View'));
    C.SliderRow(SamplingSec.Inner, Bind(Viz, 'FlowLineLength', { Label: 'Streamline arc length', Minimum: 10, Maximum: 40, Step: 2, Digits: 0, Unit: 'steps' }, 'VIEW', 'View'));
    C.SliderRow(SamplingSec.Inner, Bind(Viz, 'QuietCutoff', { Label: 'Quiet-field cutoff', Minimum: 0, Maximum: 0.2, Step: 0.005, Digits: 3, Unit: '×' }, 'VIEW', 'View'));
    C.SliderRow(SamplingSec.Inner, DistanceBinding(Viz, 'SliceHeight', { Label: 'Slice elevation Y', Minimum: 1, Maximum: 2000 }, 'VIEW', 'View'));
    C.SwitchRow(SamplingSec.Inner, Bind(Viz, 'FlowLinePulse', { Label: 'Directional streamline pulses' }, 'VIEW', 'View'));
    C.SwitchRow(SamplingSec.Inner, Bind(Viz, 'Cascades', { Label: 'Cascade boundaries' }, 'VIEW', 'View'));

    const ChSec = C.SectionCard(Page, { Id: 'receivers', Title: 'Receivers & runtime budget', Glyph: 'Sparkles', Status: () => `${Scene.Field.Channels.length} channels` });
    ChSec.Card.classList.add('folded');
    C.ChipToggles(ChSec.Inner, Bind(Scene.Field, 'Channels', {
        Label: 'Coupled receivers', Options: F.Channels,
        Detail: (Channels) => `${Channels.length} receiver types sample this field.`
    }, 'FORCES', 'Field'));
    C.StatGrid(ChSec.Inner, [
        ['Baked flow slots', () => `${F.ResolveBudget(Scene).Baked.length} / 16`],
        ['Live accel / damp', () => `${F.ResolveBudget(Scene).Live.length + F.ResolveBudget(Scene).Damp.length}`],
        ['Active sources', () => `${Scene.Sources.filter((Source) => Source.Enabled).length}`],
        ['Bounded sources', () => `${Scene.Sources.filter((Source) => ['Sphere', 'Column', 'Box'].includes(Source.Reach)).length} / ${Scene.Sources.length}`]
    ]);

    const ExportSec = C.SectionCard(Page, { Id: 'lvl', Title: 'Levelspace export', Glyph: 'Copy', Status: () => 'TOML' });
    ExportSec.Card.classList.add('folded');
    const Pre = C.Construct('pre', 'levelspace-pre');
    C.ActionSelect(ExportSec.Inner, [
        { Label: 'Copy Levelspace records', Act: () => { navigator.clipboard?.writeText(F.EncodeLevelspace(Scene).join('\n')); C.Toast('Copied Levelspace records'); } },
        { Label: 'Reset current scene preset', Act: () => LoadScenario(Scene.Scenario || 'lab') }
    ], 'Export / reset…');
    ExportSec.Inner.append(Pre);
    C.Register(() => { Pre.textContent = F.EncodeLevelspace(Scene).join('\n'); });
}

function ConstructWindPage(Page)
{
    const Wind = Scene.Wind;
    Page.append(
        C.Construct('div', 'breadcrumb-row', 'Scene / Ambient wind'),
        C.Construct('div', 'page-title', [C.Construct('h2', null, 'Ambient wind'), C.Construct('span', 'live-pill', 'PROFILE')]),
        C.Construct('div', 'page-subtitle', 'Regional background flow measured independently from placed generators and forcefields.')
    );

    const AmbientCard = BuildEngineeringCard(Page, {
        Eyebrow: 'BACKGROUND FLOW · LIVE',
        Title: 'Ambient flow at 10 m',
        Samples: WindSamples,
        Height: 68,
        TraceLabel: 'Ambient speed · m/s · rolling 60 s',
        Note: `Dynamic pressure q = ½ρv² (ρ = ${AirDensityAtSeaLevel} kg/m³). Ambient profile only; excludes placed sources.`,
        Resolve: ReadAmbientWind,
        Metrics: [
            { Label: 'Current speed', Key: 'Speed', Unit: 'm/s' },
            { Label: 'Dynamic pressure q', Key: 'PressurePa', Unit: 'Pa' },
            { Label: '60 s peak gust', Key: 'PeakSpeed', Unit: 'm/s' },
            { Label: '60 s lull', Key: 'LullSpeed', Unit: 'm/s' }
        ]
    });
    LiveRefreshers.push(AmbientCard.Refresh);

    const FlowSec = C.SectionCard(Page, {
        Id: 'wflow', Title: 'Direction & bounded region', Glyph: 'Compass',
        Status: () => Wind.Enabled ? `${Wind.Speed.toFixed(1)} m/s · ${Math.round(Wind.Bearing)}°` : 'Off'
    });
    C.SwitchRow(FlowSec.Inner, Bind(Wind, 'Enabled', { Label: 'Enable ambient wind', Detail: 'Disable to isolate placed forcefields.' }, 'WIND', 'Wind'));
    C.SwitchRow(FlowSec.Inner, Bind(Wind, 'Bounded', { Label: 'Finite regional radius', Detail: 'Smoothly returns the background wind to zero at its boundary.' }, 'WIND', 'Wind'));
    C.SliderRow(FlowSec.Inner, DistanceBinding(Wind, 'RegionRadius', {
        Label: 'Regional radius', Minimum: 100, Maximum: 50000,
        Availability: () => ({ Enabled: Boolean(Wind.Bounded) })
    }, 'WIND', 'Wind'));
    C.PolarDial(FlowSec.Inner, Bind(Wind, 'Bearing', { Label: 'Travel bearing', Digits: 0, Unit: '°' }, 'WIND', 'Wind'));
    C.SliderRow(FlowSec.Inner, Bind(Wind, 'Speed', { Label: 'Reference speed', Minimum: 0, Maximum: 40, Step: 0.5, Digits: 1, Unit: 'm/s' }, 'WIND', 'Wind'));

    const GustSec = C.SectionCard(Page, {
        Id: 'wgst', Title: 'Gusts & vertical profile', Glyph: 'Activity',
        Status: () => `${(Wind.GustStrength * 100).toFixed(0)}% gust amplitude`
    });
    C.SliderRow(GustSec.Inner, Bind(Wind, 'GustStrength', { Label: 'Gust amplitude', Minimum: 0, Maximum: 1, Step: 0.02, Digits: 2, Unit: '×' }, 'WIND', 'Wind'));
    C.SliderRow(GustSec.Inner, Bind(Wind, 'GustFrequency', { Label: 'Gust frequency', Minimum: 0.01, Maximum: 1.5, Step: 0.01, Digits: 2, Unit: 'Hz' }, 'WIND', 'Wind'));
    C.SliderRow(GustSec.Inner, Bind(Wind, 'Turbulence', { Label: 'Curl eddies', Minimum: 0, Maximum: 1.5, Step: 0.02, Digits: 2 }, 'WIND', 'Wind'));
    C.SliderRow(GustSec.Inner, Bind(Wind, 'Shear', { Label: 'Ekman shear', Minimum: 0, Maximum: 0.8, Step: 0.02, Digits: 2, Unit: '/km' }, 'WIND', 'Wind'));
    C.SliderRow(GustSec.Inner, Bind(Wind, 'Veer', { Label: 'Ekman veer', Minimum: -30, Maximum: 30, Step: 1, Digits: 0, Unit: '°/km' }, 'WIND', 'Wind'));
}

function ConstructSourcePage(Page, Source)
{
    const Type = F.TypeById[Source.Type] || F.TypeById.WindGenerator;
    const Col = F.ResolveSourceColour(Source);

    Page.append(C.Construct('div', 'breadcrumb-row', `Inspector / ${Type.Contribution} / ${Type.Native}`));

    const SymbolBox = C.Construct('div', 'object-symbol', C.ConstructGlyph(Type.Glyph));

    const NameInput = C.Construct('input', 'object-name-input');
    NameInput.type = 'text';
    NameInput.value = Source.Name;
    NameInput.addEventListener('change', () => { Source.Name = NameInput.value.trim() || Type.Name; ConstructOutliner(); ConstructTimeline(); C.Broadcast(); });

    const ObjectCard = C.Construct('div', 'object-heading', [
        SymbolBox,
        C.Construct('div', 'object-heading-copy', [NameInput, C.Construct('span', null, `${Type.Native} · ${Type.Contribution} · ${Source.Reach}`)]),
        C.Construct('span', 'entity-glow-pill', 'BOUNDED')
    ]);
    Page.append(ObjectCard, C.Construct('div', 'page-subtitle', Type.Blurb));

    // Live radial influence profile plot (clearly drops to 0.00 at influence boundary!)
    const Metric = C.Construct('div', 'metric-big');
    const Side = C.Construct('div', 'metric-side');
    const Card = C.Construct('div', 'hero-card', [
        C.Construct('div', 'hero-top', [C.Construct('div', 'budget-chip', [C.Construct('span', null, 'Bounded Spatial Influence Profile')]), C.Construct('div', 'estimate-tag', `${Source.Reach} · ${Source.Falloff}`)]),
        C.Construct('div', 'hero-metrics', [Metric, Side])
    ]);
    Page.append(Card);

    C.CurvePlot(Card, {
        Height: 112,
        Resolve: () =>
        {
            const Prof = F.ResolveProfile(Scene, Source, Scene.Visualization.SliceHeight);
            const MaxY = Math.max(1, ...Prof.Points.map((P) => P[1])) * 1.15;
            return {
                XRange: [0, Prof.Reach],
                YRange: [0, MaxY],
                Curves: [{ Points: Prof.Points, Stroke: Col, Fill: Col + '26' }],
                Guides: [{ Y: 0, Text: `0 outside R = ${FormatDistance(Source.Radius)}` }],
                XTicks: [[0, '0'], [Prof.Reach * 0.5, FormatDistance(Prof.Reach * 0.5)], [Prof.Reach, FormatDistance(Prof.Reach)]],
                YTicks: [[0, '0'], [MaxY * 0.5, (MaxY * 0.5).toFixed(1)], [MaxY, MaxY.toFixed(1)]],
                Caption: `Finite reach: strictly 0 ${Prof.Unit} beyond boundary`
            };
        }
    });

    LiveRefreshers.push(() =>
    {
        C.ConstructMetric(Metric, Source.Strength, Source.Strength < 10 ? 2 : 1, F.Contributions[Type.Contribution].Unit);
        Side.textContent = `R ${FormatDistance(Source.Radius)} · ${Source.Falloff}`;
    });

    const StateSec = C.SectionCard(Page, { Id: 'source-state', Title: 'Source state', Glyph: 'Check', Status: () => Source.Enabled ? 'Enabled' : 'Disabled' });
    C.SwitchRow(StateSec.Inner, Bind(Source, 'Enabled', { Label: 'Enable source' }, 'FORCES', Source.Name));
    C.SwitchRow(StateSec.Inner, {
        Label: 'Solo this contribution',
        Read: () => Scene.Visualization.Solo === Source.Token,
        Write: (On) => { Scene.Visualization.Solo = On ? Source.Token : null; Scene.Visualization.Preset = 'custom'; SceneRevision++; Visualization?.Invalidate(); SyncTopUi(); Sync3DIfVisible(); }
    });
    C.SwitchRow(StateSec.Inner, {
        Label: 'Follow source',
        Read: () => Scene.Visualization.Follow === Source.Token,
        Write: (On) => { Scene.Visualization.Follow = On ? Source.Token : null; }
    });

    C.ActionSelect(Page, [
        { Label: 'Frame source in viewport', Act: () => FrameSource(Source) },
        { Label: 'Duplicate source', Act: () => DuplicateSource(Source) },
        { Label: 'Remove source', Act: () => RemoveSource(Source.Token) }
    ], 'Source actions…');

    // Section 1: Placement & Finite Spatial Influence
    const PlaceSec = C.SectionCard(Page, { Id: 'place', Title: 'Placement & Finite Influence', Glyph: 'Target', Status: () => `${Source.Reach} · ${FormatDistance(Source.Radius)}` });
    C.VectorRow(PlaceSec.Inner, Bind(Source, 'Centre', { Label: 'Centre position (m)', Step: 5, Digits: 1 }, 'FORCES', Source.Name));
    C.SelectRow(PlaceSec.Inner, Bind(Source, 'Reach', { Label: 'Influence shape (finite only)', Options: F.Reaches }, 'INFLUENCE', Source.Name));
    C.SliderRow(PlaceSec.Inner, DistanceBinding(Source, 'Radius', { Label: 'Influence radius', Minimum: 10, Maximum: 40000 }, 'INFLUENCE', Source.Name));
    if (Source.Reach === 'Column' || Source.Reach === 'Box')
    {
        C.SliderRow(PlaceSec.Inner, DistanceBinding(Source, 'Height', { Label: 'Vertical height', Minimum: 5, Maximum: 15000 }, 'INFLUENCE', Source.Name));
    }
    if (Source.Reach === 'Box' && Source.Type !== 'Jet' && Source.Type !== 'Wake')
    {
        C.SliderRow(PlaceSec.Inner, DistanceBinding(Source, 'HalfX', { Label: 'Box half-width X', Minimum: 5, Maximum: 30000 }, 'INFLUENCE', Source.Name));
        C.SliderRow(PlaceSec.Inner, DistanceBinding(Source, 'HalfZ', { Label: 'Box half-length Z', Minimum: 5, Maximum: 30000 }, 'INFLUENCE', Source.Name));
    }
    C.SelectRow(PlaceSec.Inner, Bind(Source, 'Falloff', { Label: 'Boundary falloff', Options: F.Falloffs }, 'INFLUENCE', Source.Name));

    // Section 2: Strength & Bearing
    const StrSec = C.SectionCard(Page, { Id: 'strength', Title: 'Field strength & direction', Glyph: Type.Glyph, Status: () => `${Number(Source.Strength.toFixed(1))} ${F.Contributions[Type.Contribution].Unit}` });
    StrSec.Inner.append(C.Construct('div', 'field-unit-note', 'This is the source’s native field value. Select Field system to convert it into receiver force (N), pressure (Pa), and moment (N·m).'));
    for (const [BKey, BLabel] of Type.Bearings || [])
    {
        C.PolarDial(StrSec.Inner, Bind(Source, BKey, { Label: BLabel, Digits: 0, Unit: '°' }, 'FORCES', Source.Name));
    }
    if (Type.Spin)
    {
        C.SelectRow(StrSec.Inner, Bind(Source, 'Spin', { Label: 'Rotation', Options: [['Cyclonic (+)', 1], ['Anticyclonic (−)', -1]] }, 'FORCES', Source.Name));
    }
    for (const Param of Type.Parameters) C.SliderRow(StrSec.Inner, ParameterBinding(Source, Param));

    // Section 3: Timing & Receivers
    const TimeSec = C.SectionCard(Page, { Id: 'timing', Title: 'Timing & Receivers', Glyph: 'Clock', Status: () => Source.Activation });
    C.SelectRow(TimeSec.Inner, Bind(Source, 'Activation', { Label: 'Activation mode', Options: F.Activations }, 'TIMELINE', Source.Name));
    if (Source.Activation !== 'Always')
    {
        if (Source.Activation === 'Window')
        {
            C.SliderRow(TimeSec.Inner, Bind(Source, 'Begins', { Label: 'Begins', Minimum: 0, Maximum: 120, Step: 0.5, Digits: 1, Unit: 's' }, 'TIMELINE', Source.Name));
            C.SliderRow(TimeSec.Inner, Bind(Source, 'Repeats', { Label: 'Repeats (0 = once)', Minimum: 0, Maximum: 180, Step: 1, Digits: 0, Unit: 's' }, 'TIMELINE', Source.Name));
        }
        C.SliderRow(TimeSec.Inner, Bind(Source, 'Lasts', { Label: 'Duration (0 = forever)', Minimum: 0, Maximum: 120, Step: 0.5, Digits: 1, Unit: 's' }, 'TIMELINE', Source.Name));
        C.SliderRow(TimeSec.Inner, Bind(Source, 'RampIn', { Label: 'Ramp in', Minimum: 0, Maximum: 10, Step: 0.1, Digits: 2, Unit: 's' }, 'TIMELINE', Source.Name));
        C.SliderRow(TimeSec.Inner, Bind(Source, 'RampOut', { Label: 'Ramp out', Minimum: 0, Maximum: 10, Step: 0.1, Digits: 2, Unit: 's' }, 'TIMELINE', Source.Name));
        if (Source.Activation === 'Trigger')
        {
            C.ActionRow(TimeSec.Inner, [{ Label: 'FIRE PULSE NOW', Glyph: 'Zap', Tone: 'accent', Act: () => FireSource(Source) }]);
        }
    }
    C.ChipToggles(TimeSec.Inner, Bind(Source, 'Acts', { Label: 'Filter receivers (empty = all enabled)', Options: F.Channels, Detail: (K) => K.length ? `Restricted to ${K.join(', ')}` : 'Acts on all enabled receivers within influence.' }, 'FORCES', Source.Name));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  LIBRARY SHEET MODAL
//------------------------------------------------------------------------------------------------------------------------

function OpenLibrary()
{
    // The 17-type library moved out to the shared Asset Browser.
    location.href = '../AssetBrowser/?ws=Force%20Fields';
}

/* Asset Browser deep link: ?asset=forcefield/<TypeId> arms placement for that type. */
function HandleAssetDeepLink()
{
    const Raw = new URLSearchParams(location.search).get('asset') || '';
    const M = Raw.match(/^forcefield\/([A-Za-z]+)$/);
    if (!M) return;
    if (F.TypeById[M[1]]) StartPlacement(M[1]);
    else AppendLog('PLACE', `Asset \u201C${Raw}\u201D is not a forcefield type`, null, 'Place');
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    TOP HUD & BOOT
//------------------------------------------------------------------------------------------------------------------------

function PopulateTypeSelect()
{
    const Select = document.getElementById('PlaceTypeSelect');
    if (!Select) return;
    for (const [Contribution, Label] of [['Flow', 'Flow fields'], ['Accelerate', 'Acceleration fields'], ['Damp', 'Damping fields']])
    {
        const Group = C.Construct('optgroup');
        Group.label = Label;
        for (const Type of F.Types.filter((Entry) => Entry.Contribution === Contribution))
        {
            const Option = C.Construct('option');
            Option.value = Type.Id;
            Option.textContent = Type.Name;
            Group.append(Option);
        }
        Select.append(Group);
    }
    const LibraryOption = C.Construct('option');
    LibraryOption.value = '__library';
    LibraryOption.textContent = 'Browse field library…';
    Select.append(LibraryOption);
}

function SyncTopUi()
{
    const SceneSelect = document.getElementById('SceneSelect');
    if (SceneSelect) SceneSelect.value = Scene.Scenario;
    const PlaceSelect = document.getElementById('PlaceTypeSelect');
    if (PlaceSelect) PlaceSelect.value = PlacementType || '';
    const ViewSelect = document.getElementById('ViewModeSelect');
    if (ViewSelect) ViewSelect.value = ViewMode;

    const CurSpan = Visualization?.View?.Span || Scene.Visualization.Span || 1400;
    const SpanSelect = document.getElementById('SpanSelect');
    if (SpanSelect)
    {
        const Presets = [250, 1400, 6000, 100000];
        const Nearest = Presets.reduce((Best, Span) => Math.abs(Span - CurSpan) < Math.abs(Best - CurSpan) ? Span : Best, Presets[0]);
        SpanSelect.value = Math.abs(Nearest - CurSpan) <= Math.max(12, Nearest * 0.14) ? String(Nearest) : 'custom';
    }

    const V = Scene.Visualization;
    const ViewPresetSelect = document.getElementById('ViewPresetSelect');
    if (ViewPresetSelect) ViewPresetSelect.value = ViewPresets[V.Preset] ? V.Preset : 'custom';
    const HeatmapLegend = document.getElementById('HeatmapLegend');
    if (HeatmapLegend) HeatmapLegend.hidden = !(ViewMode === 'Stage3D' && V.Heatmap);
    document.querySelector('[data-key-layer="vectors"]')?.classList.toggle('muted', V.Arrows === false || V.Contribution === 'Damp');
    document.querySelector('[data-key-layer="streamlines"]')?.classList.toggle('muted', V.FlowLines === false || V.Contribution === 'Damp');
    document.querySelector('[data-key-layer="influence"]')?.classList.toggle('muted', V.ShowInfluence === false);
    const MinLabel = document.getElementById('MinimapLabel');
    if (MinLabel) MinLabel.textContent = `${FormatDistance(Scene.Field.Extent)}`;

    const Status = document.getElementById('ViewportStatus');
    if (Status)
    {
        Status.textContent = ViewMode === 'Map'
            ? `XZ plan · Y ${Number(V.SliceHeight || 10).toFixed(0)} m · ${FormatDistance(CurSpan)} extent`
            : `3D field stage · ${Scene.Sources.length} bounded sources · ${FormatDistance(CurSpan)} extent`;
    }
    const LogButton = document.getElementById('BtnToggleLog');
    const Drawer = document.getElementById('LogDrawer');
    if (LogButton && Drawer) LogButton.setAttribute('aria-expanded', String(!Drawer.hidden));
}

function UpdateHoverReadout()
{
    const El = document.getElementById('ViewportReadout');
    if (!El) return;
    if (!HoverPoint || !Visualization || ViewMode === 'Stage3D') { El.innerHTML = ''; return; }
    const P = Visualization.ProbeAt(HoverPoint.ScreenX, HoverPoint.ScreenY, Clock.Time);
    if (!P) { El.innerHTML = ''; return; }
    const Load = ResolveReceiverLoad(Scene.Visualization.Contribution, P.Vector, Scene.Probe);
    const FieldText = Scene.Visualization.Contribution === 'Flow'
        ? `v ${P.Speed.toFixed(1)} m/s · ${Math.round(P.Bearing)}° ${C.ResolveCompassPoint(P.Bearing)}`
        : `${Scene.Visualization.Contribution === 'Accelerate' ? 'a' : 'γ'} ${P.Speed.toFixed(2)} ${P.Unit}`;
    El.innerHTML = `<b>F ${FormatEngineeringValue(Load.ForceN)} N</b> · p ${FormatEngineeringValue(Load.PressurePa)} Pa · M ${FormatEngineeringValue(Load.MomentNm)} N·m<br>`
        + `${FieldText} · (${FormatDistance(P.X)}, ${FormatDistance(P.Z)})`;
}

function SetupEvents()
{
    PopulateTypeSelect();

    document.getElementById('SceneSelect')?.addEventListener('change', (E) => LoadScenario(E.currentTarget.value));
    document.getElementById('PlaceTypeSelect')?.addEventListener('change', (E) =>
    {
        const TypeId = E.currentTarget.value;
        if (TypeId === '__library')
        {
            E.currentTarget.value = '';
            OpenLibrary();
        }
        else if (TypeId) StartPlacement(TypeId);
        else CancelPlacement();
    });
    document.getElementById('ViewModeSelect')?.addEventListener('change', (E) => SwitchViewMode(E.currentTarget.value));
    document.getElementById('SpanSelect')?.addEventListener('change', (E) =>
    {
        if (E.currentTarget.value !== 'custom') JumpToSpan(Number(E.currentTarget.value));
    });
    document.getElementById('ViewPresetSelect')?.addEventListener('change', (E) =>
    {
        if (E.currentTarget.value === 'custom')
        {
            Scene.Visualization.Preset = 'custom';
            C.Broadcast();
        }
        else ApplyViewPreset(E.currentTarget.value);
    });
    document.getElementById('BtnCancelPlace')?.addEventListener('click', CancelPlacement);

    const Drawer = document.getElementById('LogDrawer');
    document.getElementById('BtnToggleLog')?.addEventListener('click', () =>
    {
        if (!Drawer) return;
        Drawer.hidden = !Drawer.hidden;
        SyncTopUi();
        Visualization?.Resize();
        Stage3D?.Resize();
    });

    const LogHead = document.getElementById('LogHead');
    if (LogHead)
    {
        const Clear = C.Construct('button', 'toolbar-log', 'Clear');
        Clear.type = 'button';
        Clear.addEventListener('click', () => { LogEntries.length = 0; RefreshLog(); });
        LogHead.append(Clear);
    }

    window.addEventListener('keydown', (E) =>
    {
        if (E.target.matches?.('input, textarea, select') && E.key !== 'Escape') return;
        if (E.key === 'Escape') CancelPlacement();
        else if (E.code === 'Space') { E.preventDefault(); TogglePlay(); }
        else if (E.key === '1') JumpToSpan(250);
        else if (E.key === '2') JumpToSpan(1400);
        else if (E.key === '3') JumpToSpan(6000);
        else if (E.key === '4') JumpToSpan(100000);
        else if ((E.key === 'Delete' || E.key === 'Backspace') && Selected !== 'Field' && Selected !== 'Wind') RemoveSource(Selected);
    });
}

let LastLiveCheck = 0, LastTraceSample = 0, LastStageSync = 0;
function Tick(Now)
{
    requestAnimationFrame(Tick);
    const Delta = Clock.LastTick ? Math.min(0.05, (Now - Clock.LastTick) / 1000) : 0;
    Clock.LastTick = Now;
    if (Clock.Playing)
    {
        Clock.Time += Delta * (Scene.Timeline.Rate || 1);
        const Dur = Scene.Timeline.Duration || 60;
        if (Clock.Time > Dur) Clock.Time = Scene.Timeline.Loop ? (Clock.Time % Dur) : Dur;
    }

    if (Visualization && ViewMode !== 'Stage3D')
    {
        ApplyVisualization();
        Visualization.Render(Clock.Time);
    }
    RefreshPlayhead();
    UpdateHoverReadout();

    if (Now - LastTraceSample >= 1000)
    {
        LastTraceSample = Now;
        const Load = ReadLoadProbe();
        const Ambient = ReadAmbientWind();
        ForceSamples.push(Load.ForceN); if (ForceSamples.length > SampleCapacity) ForceSamples.shift();
        WindSamples.push(Ambient.Speed); if (WindSamples.length > SampleCapacity) WindSamples.shift();
    }

    if (Now - LastLiveCheck > 140)
    {
        LastLiveCheck = Now;
        for (const Fn of LiveRefreshers) Fn();
        for (const Fn of LiveOutlinerRows) Fn();

        const Sig = JSON.stringify([Scene.Timeline, Scene.Sources.map((S) => [S.Token, S.Name, S.Activation, S.Begins, S.Lasts, S.Repeats, S.TriggeredAt, S.Enabled]), Selected]);
        if (Sig !== TimelineSignature) { TimelineSignature = Sig; ConstructTimeline(); }
    }
    if (Stage3D && ViewMode === 'Stage3D' && Clock.Playing && Now - LastStageSync > 220)
    {
        LastStageSync = Now;
        Sync3DIfVisible();
    }
}

ConstructVisualization();
ConstructOutliner();
ConstructInspectorPage();
ConstructTimeline();
SetupEvents();
SyncTopUi();
C.Register(Persist);
AppendLog('SYSTEM', 'Field editor ready', `${Scene.Sources.length} bounded sources loaded`, 'Boot');
HandleAssetDeepLink();
requestAnimationFrame(Tick);
