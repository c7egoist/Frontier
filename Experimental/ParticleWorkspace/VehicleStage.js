/*==========================================================================================================================================
                                                             VEHICLESTAGE.JS
==========================================================================================================================================*/
// 🧩 ControlVehicle FCT1 Loader, Expanding-Sphere Material Ripple, 4 Frontier Inspection Modes (Solid / Ghost 45% /
//    Wireframe / X-Ray Scan Sweep) & Raycast Drag-and-Drop Engine for Frontier Particle Studio.

import { DecodeFacetStream, RetrieveFacetStream } from '../VehicleProvingGrounds/Source/FacetCodec.js';
import { CourseMaterial, ConstructMaterialSpecification } from '../VehicleProvingGrounds/Source/MaterialSpecification.js';
import { ControlVehicleSockets, VehicleGeometry, ResolveAuthoredGroundOffset } from '../VehicleProvingGrounds/Source/VehicleSpecification.js';

export const INSPECTION_MODES = Object.freeze([
    { id: 'solid',     index: 0, label: 'Solid',      short: 'Solid',     detail: 'Full automotive PBR coat, clearcoat & glass' },
    { id: 'ghost',     index: 1, label: 'Ghost 45%',  short: 'Ghost 45%', detail: 'Translucent 45% X-ray shell with structural creases' },
    { id: 'wireframe', index: 2, label: 'Wireframe',  short: 'Wireframe', detail: 'Architectural CAD crease & silhouette wireframe' },
    { id: 'scan',      index: 3, label: 'X-Ray Scan', short: 'X-Ray Scan',detail: 'Animated laser wavefront sweeping nose-to-tail into hologram' }
]);

// Verbatim HMI paint swatches (VehicleAppearance.js + config.ts) plus ControlVehicle authored coat
export const PAINT_OPTIONS = Object.freeze([
    { id: 'authored',       name: 'Frontier Coat',  hex: '#c5d41a', finishDefault: 'gloss' },
    { id: 'nebula-silver',  name: 'Nebula Silver',  hex: '#c2c8d0', finishDefault: 'gloss' },
    { id: 'obsidian-black', name: 'Obsidian Black', hex: '#17191d', finishDefault: 'gloss' },
    { id: 'command-red',    name: 'Command Red',    hex: '#8a1a1d', finishDefault: 'gloss' },
    { id: 'tactical-blue',  name: 'Tactical Blue',  hex: '#1c3f73', finishDefault: 'gloss' },
    { id: 'moab-sand',      name: 'Moab Sand',      hex: '#b2946a', finishDefault: 'matte' },
    { id: 'recon-green',    name: 'Recon Green',    hex: '#33442f', finishDefault: 'matte' },
    { id: 'arctic-white',   name: 'Arctic White',   hex: '#e7ebef', finishDefault: 'gloss' },
    { id: 'copper-bronze',  name: 'Copper Bronze',  hex: '#8c5a2e', finishDefault: 'gloss' }
]);

export const RIM_OPTIONS = Object.freeze([
    { id: 'blue-mag',   name: 'Blue Forged Mag',   hex: '#1c4fa8', metalness: 1.00, roughness: 0.20, rimBaseHex: '#252930', emission: [0.00, 0.035, 0.14] },
    { id: 'matte-dark', name: 'Stealth Matte Dark',hex: '#1c1f24', metalness: 0.55, roughness: 0.42, rimBaseHex: '#15171b', emission: [0.00, 0.00, 0.00] },
    { id: 'alloy',      name: 'Machined Alloy',    hex: '#b8c0ca', metalness: 1.00, roughness: 0.18, rimBaseHex: '#9aa2ad', emission: [0.00, 0.00, 0.00] },
    { id: 'titanium',   name: 'Titanium Beadlock', hex: '#545d68', metalness: 0.92, roughness: 0.28, rimBaseHex: '#434a54', emission: [0.00, 0.00, 0.00] }
]);

// Part kinds packed per vertex for GPU & Software3D material transitions
export const PART_KIND = Object.freeze({
    PAINT:     0,
    GLASS:     1,
    CLADDING:  2,
    RIM:       3,
    HUB:       4,
    TYRE:      5,
    HEADLIGHT: 6,
    TAILLIGHT: 7
});

export function HexToLinear(Hex)
{
    const Clean = String(Hex || '#c2c8d0').replace('#', '');
    const Full = Clean.length === 3 ? Clean.split('').map(C => C + C).join('') : Clean.padEnd(6, '0').slice(0, 6);
    return [0, 2, 4].map(Off =>
    {
        const V = parseInt(Full.slice(Off, Off + 2), 16) / 255;
        return V <= 0.04045 ? V / 12.92 : ((V + 0.055) / 1.055) ** 2.4;
    });
}

export function EaseOutCubic(T)
{
    const U = Math.min(1, Math.max(0, T));
    return 1 - (1 - U) ** 3;
}

export function CreateVehicleState()
{
    const InitPaint = PAINT_OPTIONS[0];
    const InitRim = RIM_OPTIONS[0];
    return {
        Enabled: true,
        Loading: false,
        Loaded: false,
        Error: null,
        Mesh: null,

        // Transform on stage
        Position: [0, 0, 0],
        Yaw: 0,
        Scale: 1,
        AutoRotate: false,
        WheelSpin: 0,
        WheelSpinRate: 0,
        AeroCoupling: false,

        // 4 Frontier Inspection Modes ('solid' | 'ghost' | 'wireframe' | 'scan')
        Mode: 'solid',
        GhostOpacity: 0.45,
        WireOpacity: 0.78,
        ScanPeriod: 4.8,
        ScanLoop: true,
        ScanReverse: false,
        ScanTime: 0,
        ScanActive: true,
        ScanX: 3.30,
        ScanFraction: 0,
        HoloFade: 0,
        AccentHex: '#52dcff',

        // Paint material & expanding-sphere ripple transition
        PaintId: InitPaint.id,
        PaintOpt: InitPaint,
        Matte: false,
        Finish: 'gloss',
        PaintCurCol: HexToLinear(InitPaint.hex),
        PaintCurRough: 0.0775,
        PaintCurMetal: 0.08,
        PaintCurCoat: 1.0,
        PaintNextCol: HexToLinear(InitPaint.hex),
        PaintNextRough: 0.0775,
        PaintNextMetal: 0.08,
        PaintNextCoat: 1.0,
        PaintRipActive: false,
        PaintRipElapsed: 0,
        PaintRipDuration: 1.35,
        PaintRipMaxR: 6.8,
        PaintRipR: -1,
        PaintRipOrigin: [2.45, 0.82, 0.42],
        LastPaintOriginLabel: 'Nose default',

        // Rim / Wheel material & expanding-sphere ripple transition
        RimId: InitRim.id,
        RimOpt: InitRim,
        RimCurCol: HexToLinear(InitRim.hex),
        RimCurBaseCol: HexToLinear(InitRim.rimBaseHex),
        RimCurRough: InitRim.roughness,
        RimCurMetal: InitRim.metalness,
        RimNextCol: HexToLinear(InitRim.hex),
        RimNextBaseCol: HexToLinear(InitRim.rimBaseHex),
        RimNextRough: InitRim.roughness,
        RimNextMetal: InitRim.metalness,
        RimRipActive: false,
        RimRipElapsed: 0,
        RimRipDuration: 1.45,
        RimRipMaxR: 5.4,
        RimRipR: -1,
        RimRipOrigin: [ControlVehicleSockets.AxleMount[0][0], VehicleGeometry.TyreRadius, ControlVehicleSockets.AxleMount[0][1]],
        LastRimOriginLabel: 'Front-Left Hub'
    };
}

function PaintSpecFor(PaintId, Finish)
{
    const Opt = PAINT_OPTIONS.find(P => P.id === PaintId) || PAINT_OPTIONS[0];
    const Matte = Finish === 'matte';
    return {
        opt: Opt,
        col: HexToLinear(Opt.hex),
        rough: Matte ? 0.68 : 0.0775,
        metal: Matte ? 0.04 : 0.10,
        coat: Matte ? 0.0 : 1.0
    };
}

function RimSpecFor(RimId)
{
    const Opt = RIM_OPTIONS.find(R => R.id === RimId) || RIM_OPTIONS[0];
    return {
        opt: Opt,
        col: HexToLinear(Opt.hex),
        baseCol: HexToLinear(Opt.rimBaseHex),
        rough: Opt.roughness,
        metal: Opt.metalness
    };
}

export function TriggerPaintRipple(State, PaintIdOrOpt = State.PaintId, FinishOrOrigin = State.Finish, WorldOrigin = null, Label = null)
{
    if (!State) return;
    let PaintId = typeof PaintIdOrOpt === 'object' && PaintIdOrOpt ? PaintIdOrOpt.id : (PaintIdOrOpt || State.PaintId);
    let Finish = State.Matte ? 'matte' : 'gloss';
    if (Array.isArray(FinishOrOrigin))
    {
        Label = WorldOrigin;
        WorldOrigin = FinishOrOrigin;
    }
    else if (FinishOrOrigin === 'matte' || FinishOrOrigin === 'gloss')
    {
        Finish = FinishOrOrigin;
    }
    else if (typeof FinishOrOrigin === 'boolean')
    {
        Finish = FinishOrOrigin ? 'matte' : 'gloss';
    }
    // Commit current blended state first if an earlier ripple is mid-flight
    if (State.PaintRipActive)
    {
        const T = EaseOutCubic(State.PaintRipElapsed / Math.max(0.05, State.PaintRipDuration));
        if (T > 0.35)
        {
            State.PaintCurCol = [...State.PaintNextCol];
            State.PaintCurRough = State.PaintNextRough;
            State.PaintCurMetal = State.PaintNextMetal;
            State.PaintCurCoat = State.PaintNextCoat;
        }
    }
    const Next = PaintSpecFor(PaintId, Finish);
    State.PaintId = Next.opt.id;
    State.PaintOpt = Next.opt;
    State.Matte = Finish === 'matte';
    State.Finish = Finish;
    State.PaintNextCol = Next.col;
    State.PaintNextRough = Next.rough;
    State.PaintNextMetal = Next.metal;
    State.PaintNextCoat = Next.coat;
    State.PaintRipActive = true;
    State.PaintRipElapsed = 0;
    State.PaintRipR = 0.04;
    if (Array.isArray(WorldOrigin) && WorldOrigin.length >= 3)
    {
        State.PaintRipOrigin = [WorldOrigin[0], WorldOrigin[1], WorldOrigin[2]];
        State.LastPaintOriginLabel = Label || `Hit (${WorldOrigin.map(V => V.toFixed(2)).join(', ')})`;
    }
    else
    {
        const Pos = State.Position || [0, 0, 0];
        State.PaintRipOrigin = [Pos[0] + 2.45 * (State.Scale || 1), Pos[1] + 0.82 * (State.Scale || 1), Pos[2] + 0.38 * (State.Scale || 1)];
        State.LastPaintOriginLabel = Label || 'Nose crest';
    }
}

export function TriggerRimRipple(State, RimIdOrOpt = State.RimId, WorldOrigin = null, Label = null)
{
    if (!State) return;
    const RimId = typeof RimIdOrOpt === 'object' && RimIdOrOpt ? RimIdOrOpt.id : (RimIdOrOpt || State.RimId);
    if (State.RimRipActive)
    {
        const T = EaseOutCubic(State.RimRipElapsed / Math.max(0.05, State.RimRipDuration));
        if (T > 0.35)
        {
            State.RimCurCol = [...State.RimNextCol];
            State.RimCurBaseCol = [...State.RimNextBaseCol];
            State.RimCurRough = State.RimNextRough;
            State.RimCurMetal = State.RimNextMetal;
        }
    }
    const Next = RimSpecFor(RimId);
    State.RimId = Next.opt.id;
    State.RimOpt = Next.opt;
    State.RimNextCol = Next.col;
    State.RimNextBaseCol = Next.baseCol;
    State.RimNextRough = Next.rough;
    State.RimNextMetal = Next.metal;
    State.RimRipActive = true;
    State.RimRipElapsed = 0;
    State.RimRipR = 0.04;
    if (Array.isArray(WorldOrigin) && WorldOrigin.length >= 3)
    {
        State.RimRipOrigin = [WorldOrigin[0], WorldOrigin[1], WorldOrigin[2]];
        State.LastRimOriginLabel = Label || `Hit (${WorldOrigin.map(V => V.toFixed(2)).join(', ')})`;
    }
    else
    {
        const Pos = State.Position || [0, 0, 0];
        const Ax = ControlVehicleSockets.AxleMount[0];
        const Sc = State.Scale || 1;
        State.RimRipOrigin = [Pos[0] + Ax[0] * Sc, Pos[1] + VehicleGeometry.TyreRadius * Sc, Pos[2] + Ax[1] * Sc];
        State.LastRimOriginLabel = Label || 'Front-Left Hub';
    }
}

export function SetInspectionMode(State, ModeId)
{
    const Match = INSPECTION_MODES.find(M => M.id === ModeId || M.index === ModeId) || INSPECTION_MODES[0];
    const Changed = State.Mode !== Match.id;
    State.Mode = Match.id;
    if (Match.id === 'scan' && (Changed || !State.ScanActive))
    {
        State.ScanTime = 0;
        State.ScanActive = true;
    }
    return Match;
}

export function CycleInspectionMode(State)
{
    const Cur = INSPECTION_MODES.find(M => M.id === State.Mode) || INSPECTION_MODES[0];
    const Next = INSPECTION_MODES[(Cur.index + 1) % INSPECTION_MODES.length];
    return SetInspectionMode(State, Next.id);
}

export function RetriggerScanSweep(State)
{
    State.Mode = 'scan';
    State.ScanTime = 0;
    State.ScanActive = true;
}

export function StepVehicleState(State, Dt)
{
    if (!State || Dt < 0) return;

    if (State.AutoRotate && Dt > 0)
        State.Yaw = (State.Yaw + Dt * 0.35) % (Math.PI * 2);

    if (State.WheelSpinRate && Dt > 0)
        State.WheelSpin = (State.WheelSpin + State.WheelSpinRate * Dt) % (Math.PI * 2);

    // 1. Expanding sphere ripple — Paint
    if (State.PaintRipActive)
    {
        State.PaintRipElapsed += Dt;
        const U = Math.min(1, State.PaintRipElapsed / Math.max(0.05, State.PaintRipDuration));
        State.PaintRipR = EaseOutCubic(U) * State.PaintRipMaxR;
        if (U >= 1)
        {
            State.PaintRipActive = false;
            State.PaintRipR = -1;
            State.PaintCurCol = [...State.PaintNextCol];
            State.PaintCurRough = State.PaintNextRough;
            State.PaintCurMetal = State.PaintNextMetal;
            State.PaintCurCoat = State.PaintNextCoat;
        }
    }

    // 2. Expanding sphere ripple — Rim / Wheel
    if (State.RimRipActive)
    {
        State.RimRipElapsed += Dt;
        const U = Math.min(1, State.RimRipElapsed / Math.max(0.05, State.RimRipDuration));
        State.RimRipR = EaseOutCubic(U) * State.RimRipMaxR;
        if (U >= 1)
        {
            State.RimRipActive = false;
            State.RimRipR = -1;
            State.RimCurCol = [...State.RimNextCol];
            State.RimCurBaseCol = [...State.RimNextBaseCol];
            State.RimCurRough = State.RimNextRough;
            State.RimCurMetal = State.RimNextMetal;
        }
    }

    // 3. X-Ray Scan Sweep + Hologram Fade
    const IsScan = State.Mode === 'scan';
    const TargetHolo = IsScan ? 1 : 0;
    const K = 1 - Math.exp(-Math.max(Dt, 0.001) * 8);
    State.HoloFade += (TargetHolo - State.HoloFade) * K;
    if (Math.abs(TargetHolo - State.HoloFade) < 0.002) State.HoloFade = TargetHolo;

    if (IsScan)
    {
        const Period = Math.max(1.2, State.ScanPeriod || 4.8);
        if (State.ScanActive && Dt > 0)
        {
            State.ScanTime += Dt;
            if (State.ScanLoop)
                State.ScanTime = State.ScanTime % Period;
            else if (State.ScanTime >= Period)
            {
                State.ScanTime = Period;
                State.ScanActive = false;
            }
        }
        const Phase = Math.min(1, Math.max(0, State.ScanTime / Period));
        State.ScanFraction = Phase;
        const LoX = -3.35;
        const HiX = 3.35;
        State.ScanX = State.ScanReverse
            ? (LoX + Phase * (HiX - LoX))
            : (HiX - Phase * (HiX - LoX));
    }
    else
    {
        State.ScanFraction = 0;
        State.ScanX = State.ScanReverse ? -3.45 : 3.45;
    }
}

// Packs 256-byte VehicleU uniform (64 floats = 16 vec4f) matching shaders.js & SoftwarePreviewEngine
export function PackVehicleUniform(State, Time = 0)
{
    const Out = new Float32Array(64);
    const ModeRec = INSPECTION_MODES.find(M => M.id === State.Mode) || INSPECTION_MODES[0];
    const AccentRgb = HexToLinear(State.AccentHex || '#52dcff');
    const Pos = State.Position || [0, 0, 0];
    const Sc = State.Scale || 1;
    const Axles = ControlVehicleSockets.AxleMount;
    const GroundOffset = ResolveAuthoredGroundOffset();

    // 0: bounds (minX, maxX, yawRad, groundOffset)
    Out[0] = -3.15; Out[1] = 3.15; Out[2] = State.Yaw || 0; Out[3] = GroundOffset;
    // 1: modeCfg (modeIndex, scanX, holoAmt, ghostOpacity)
    Out[4] = ModeRec.index; Out[5] = State.ScanX; Out[6] = State.HoloFade; Out[7] = State.GhostOpacity ?? 0.45;
    // 2: paintCur (rgb, rough)
    Out.set([...State.PaintCurCol, State.PaintCurRough], 8);
    // 3: paintNext (rgb, rough)
    Out.set([...State.PaintNextCol, State.PaintNextRough], 12);
    // 4: paintRip (xyz origin, w radius; <0 inactive)
    Out.set([...State.PaintRipOrigin, State.PaintRipActive ? State.PaintRipR : -1], 16);
    // 5: paintFlags (curMetal, nextMetal, curCoat, nextCoat)
    Out.set([State.PaintCurMetal, State.PaintNextMetal, State.PaintCurCoat, State.PaintNextCoat], 20);
    // 6: rimCur (rgb, rough)
    Out.set([...State.RimCurCol, State.RimCurRough], 24);
    // 7: rimNext (rgb, rough)
    Out.set([...State.RimNextCol, State.RimNextRough], 28);
    // 8: rimRip (xyz origin, w radius; <0 inactive)
    Out.set([...State.RimRipOrigin, State.RimRipActive ? State.RimRipR : -1], 32);
    // 9: rimFlags (curMetal, nextMetal, wheelSpinRad, timeSec)
    Out.set([State.RimCurMetal, State.RimNextMetal, State.WheelSpin || 0, Time], 36);
    // 10: accent (rgb, scanDir: -1 nose->tail, +1 tail->nose)
    Out.set([...AccentRgb, State.ScanReverse ? 1.0 : -1.0], 40);
    // 11: posOff (xyz vehicle world origin, w scale)
    Out.set([Pos[0], Pos[1], Pos[2], Sc], 44);
    // 12..15: axleMounts in world-relative authored Y-up (for wheel spin pivot in vertex shader)
    for (let I = 0; I < 4; I++)
    {
        const A = Axles[I];
        Out.set([A[0], A[2] + GroundOffset, A[1], State.WireOpacity ?? 0.78], 48 + I * 4);
    }
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  FCT1 CONTROLVEHICLE MESH & CREASE EDGE BUILDER
//------------------------------------------------------------------------------------------------------------------------

function MapCourseFamilyToPart(Family, SourceType)
{
    if (Family === CourseMaterial.BodyCoat) return PART_KIND.PAINT;
    if (Family === CourseMaterial.VehicleGlass) return PART_KIND.GLASS;
    if (Family === CourseMaterial.Headlight) return PART_KIND.HEADLIGHT;
    if (Family === CourseMaterial.Taillight) return PART_KIND.TAILLIGHT;
    if (Family === CourseMaterial.Hub || Family === CourseMaterial.Brake) return PART_KIND.HUB;
    if (SourceType === 'rim') return PART_KIND.RIM;
    if (SourceType === 'tyre') return PART_KIND.TYRE;
    return PART_KIND.CLADDING;
}

function Sub3(A, B) { return [A[0] - B[0], A[1] - B[1], A[2] - B[2]]; }
function Cross3(A, B) { return [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]]; }
function Norm3(A) { const L = Math.hypot(A[0], A[1], A[2]) || 1; return [A[0] / L, A[1] / L, A[2] / L]; }
function Dot3(A, B) { return A[0] * B[0] + A[1] * B[1] + A[2] * B[2]; }

export function AssembleControlVehicle(Streams, OptTyreAb = null, OptRimAb = null)
{
    const IsAb = X => X instanceof ArrayBuffer || ArrayBuffer.isView(X);
    if (IsAb(Streams) && IsAb(OptTyreAb) && IsAb(OptRimAb))
    {
        const ToAb = B => B instanceof ArrayBuffer ? B : B.buffer.slice(B.byteOffset, B.byteOffset + B.byteLength);
        return DecodeControlVehicleBuffers(ToAb(Streams), ToAb(OptTyreAb), ToAb(OptRimAb));
    }
    const { body, tyre, rim } = Streams;
    const Materials = ConstructMaterialSpecification();
    const GroundOffset = ResolveAuthoredGroundOffset();

    // Estimate max triangle counts
    const TotalFacets = body.FacetCount + 4 * (rim.FacetCount + tyre.FacetCount);
    const TotalVerts = TotalFacets * 3;

    // Interleaved GPU vertex buffer: 12 floats per vertex
    // [px, py, pz, nx, ny, nz, r, g, b, a, partKind, wheelIdx]
    const GpuVerts = new Float32Array(TotalVerts * 12);
    // Compact Software-friendly triangle pool (also used for exact raycasting)
    const BodyTris = [];
    const WheelTris = [];
    const SoftVerts = []; // Packed triangles for fast Software3D rasterizer

    // Edge deduplication map for clean architectural CAD crease wireframe
    const EdgeMap = new Map();
    const SnapKey = P => `${Math.round(P[0] * 2000)}_${Math.round(P[1] * 2000)}_${Math.round(P[2] * 2000)}`;
    const RecordEdge = (P0, P1, N, PartKind, WheelIdx, ForceKeep = false) =>
    {
        const K0 = SnapKey(P0), K1 = SnapKey(P1);
        if (K0 === K1) return;
        const Key = K0 < K1 ? `${K0}|${K1}` : `${K1}|${K0}`;
        let E = EdgeMap.get(Key);
        if (!E)
        {
            E = { p0: P0, p1: P1, n0: N, n1: null, count: 1, part: PartKind, wheelIdx: WheelIdx, force: ForceKeep };
            EdgeMap.set(Key, E);
        }
        else
        {
            if (E.count === 1) E.n1 = N;
            E.count++;
            if (ForceKeep) E.force = true;
        }
    };

    let VCursor = 0;
    const PushTriangle = (P0, P1, P2, N0, N1, N2, BaseCol, Alpha, PartKind, WheelIdx, IncludeSoft, CollectEdges) =>
    {
        const FaceN = Norm3(Cross3(Sub3(P1, P0), Sub3(P2, P0)));
        const Pts = [P0, P1, P2];
        const Norms = [N0 || FaceN, N1 || FaceN, N2 || FaceN];
        for (let C = 0; C < 3; C++)
        {
            const P = Pts[C], N = Norms[C];
            const Off = VCursor * 12;
            GpuVerts[Off]     = P[0]; GpuVerts[Off + 1] = P[1]; GpuVerts[Off + 2] = P[2];
            GpuVerts[Off + 3] = N[0]; GpuVerts[Off + 4] = N[1]; GpuVerts[Off + 5] = N[2];
            GpuVerts[Off + 6] = BaseCol[0]; GpuVerts[Off + 7] = BaseCol[1]; GpuVerts[Off + 8] = BaseCol[2]; GpuVerts[Off + 9] = Alpha;
            GpuVerts[Off + 10] = PartKind;
            GpuVerts[Off + 11] = WheelIdx;
            VCursor++;
        }
        if (IncludeSoft)
        {
            SoftVerts.push(
                P0[0], P0[1], P0[2], P1[0], P1[1], P1[2], P2[0], P2[1], P2[2],
                FaceN[0], FaceN[1], FaceN[2],
                BaseCol[0], BaseCol[1], BaseCol[2], Alpha,
                PartKind, WheelIdx
            );
        }
        if (WheelIdx < 0)
            BodyTris.push({ p0: P0, p1: P1, p2: P2, part: PartKind });
        else
            WheelTris.push({ p0: P0, p1: P1, p2: P2, part: PartKind, wheelIdx: WheelIdx });

        if (CollectEdges)
        {
            RecordEdge(P0, P1, FaceN, PartKind, WheelIdx, PartKind === PART_KIND.GLASS);
            RecordEdge(P1, P2, FaceN, PartKind, WheelIdx, PartKind === PART_KIND.GLASS);
            RecordEdge(P2, P0, FaceN, PartKind, WheelIdx, PartKind === PART_KIND.GLASS);
        }
    };

    const MatInfo = (Family, SourceType) =>
    {
        const Spec = Materials[Family] || Materials[CourseMaterial.VehicleDefault] || Materials[CourseMaterial.BodyCoat];
        const PartKind = MapCourseFamilyToPart(Family, SourceType);
        let Col = [...(Spec.Albedo || [0.5, 0.5, 0.5])];
        let Alpha = 1.0;
        if (PartKind === PART_KIND.GLASS) { Col = [0.032, 0.052, 0.072]; Alpha = 0.86; }
        else if (PartKind === PART_KIND.HEADLIGHT) { Col = [0.95, 0.97, 1.0]; Alpha = 1.0; }
        else if (PartKind === PART_KIND.TAILLIGHT) { Col = [0.85, 0.04, 0.06]; Alpha = 1.0; }
        else if (PartKind === PART_KIND.CLADDING) { Col = [0.042, 0.048, 0.058]; Alpha = 1.0; }
        else if (PartKind === PART_KIND.TYRE) { Col = [0.038, 0.042, 0.048]; Alpha = 1.0; }
        return { PartKind, Col, Alpha };
    };

    // 1. Body shell — compute smooth vertex normals first just like THREE.BufferGeometry.computeVertexNormals
    const BodyPos = new Float32Array(body.VertexCount * 3);
    const BodyNormAcc = new Float32Array(body.VertexCount * 3);
    for (let I = 0; I < body.VertexCount; I++)
    {
        BodyPos[I * 3]     = body.Positions[I * 3];
        BodyPos[I * 3 + 1] = body.Positions[I * 3 + 2] + GroundOffset;
        BodyPos[I * 3 + 2] = body.Positions[I * 3 + 1];
    }
    for (let F = 0; F < body.FacetCount; F++)
    {
        const I0 = body.Facets[F * 3], I1 = body.Facets[F * 3 + 2], I2 = body.Facets[F * 3 + 1];
        const A = [BodyPos[I0 * 3], BodyPos[I0 * 3 + 1], BodyPos[I0 * 3 + 2]];
        const B = [BodyPos[I1 * 3], BodyPos[I1 * 3 + 1], BodyPos[I1 * 3 + 2]];
        const C = [BodyPos[I2 * 3], BodyPos[I2 * 3 + 1], BodyPos[I2 * 3 + 2]];
        const Fn = Cross3(Sub3(B, A), Sub3(C, A));
        for (const Idx of [I0, I1, I2])
        {
            BodyNormAcc[Idx * 3] += Fn[0];
            BodyNormAcc[Idx * 3 + 1] += Fn[1];
            BodyNormAcc[Idx * 3 + 2] += Fn[2];
        }
    }
    for (let F = 0; F < body.FacetCount; F++)
    {
        const Idxs = [body.Facets[F * 3], body.Facets[F * 3 + 2], body.Facets[F * 3 + 1]];
        const P0 = [BodyPos[Idxs[0] * 3], BodyPos[Idxs[0] * 3 + 1], BodyPos[Idxs[0] * 3 + 2]];
        const P1 = [BodyPos[Idxs[1] * 3], BodyPos[Idxs[1] * 3 + 1], BodyPos[Idxs[1] * 3 + 2]];
        const P2 = [BodyPos[Idxs[2] * 3], BodyPos[Idxs[2] * 3 + 1], BodyPos[Idxs[2] * 3 + 2]];
        const N0 = Norm3([BodyNormAcc[Idxs[0] * 3], BodyNormAcc[Idxs[0] * 3 + 1], BodyNormAcc[Idxs[0] * 3 + 2]]);
        const N1 = Norm3([BodyNormAcc[Idxs[1] * 3], BodyNormAcc[Idxs[1] * 3 + 1], BodyNormAcc[Idxs[1] * 3 + 2]]);
        const N2 = Norm3([BodyNormAcc[Idxs[2] * 3], BodyNormAcc[Idxs[2] * 3 + 1], BodyNormAcc[Idxs[2] * 3 + 2]]);
        const { PartKind, Col, Alpha } = MatInfo(body.Families[F], 'body');
        PushTriangle(P0, P1, P2, N0, N1, N2, Col, Alpha, PartKind, -1, true, true);
    }

    // 2. Four Wheel Assemblies (Rim + Tyre) anchored at ControlVehicleSockets.AxleMount
    for (let W = 0; W < 4; W++)
    {
        const Socket = ControlVehicleSockets.AxleMount[W];
        const Side = Math.sign(Socket[1]) || 1;
        const Mx = Socket[0], My = Socket[2] + GroundOffset, Mz = Socket[1];
        const Corners = [0, Side > 0 ? 2 : 1, Side > 0 ? 1 : 2];

        const EmitWheelStream = (Stream, SourceType, StrideSoft) =>
        {
            for (let F = 0; F < Stream.FacetCount; F++)
            {
                let Family = Stream.Families[F];
                if (SourceType === 'rim' && Family === CourseMaterial.Tyre) Family = CourseMaterial.RimBase;
                const Coords = [], Normals = [];
                for (let K = 0; K < 3; K++)
                {
                    const Corner = Corners[K];
                    const Vi = Stream.Facets[F * 3 + Corner];
                    const Px = Stream.Positions[Vi * 3] + Mx;
                    const Py = Stream.Positions[Vi * 3 + 2] + My;
                    const Pz = Stream.Positions[Vi * 3 + 1] * Side + Mz;
                    Coords.push([Px, Py, Pz]);
                    if (Stream.CornerNormals)
                    {
                        const Nx = Stream.CornerNormals[F * 9 + Corner * 3];
                        const Ny = Stream.CornerNormals[F * 9 + Corner * 3 + 2];
                        const Nz = Stream.CornerNormals[F * 9 + Corner * 3 + 1] * Side;
                        Normals.push(Norm3([Nx, Ny, Nz]));
                    }
                    else
                    {
                        Normals.push(null);
                    }
                }
                const { PartKind, Col, Alpha } = MatInfo(Family, SourceType);
                const IncludeSoft = (F % StrideSoft) === 0;
                const CollectEdges = SourceType === 'rim' ? ((F % 2) === 0) : ((F % 6) === 0);
                PushTriangle(
                    Coords[0], Coords[1], Coords[2],
                    Normals[0], Normals[1], Normals[2],
                    Col, Alpha, PartKind, W, IncludeSoft, CollectEdges
                );
            }
        };

        EmitWheelStream(rim, 'rim', 2);
        EmitWheelStream(tyre, 'tyre', 4);
    }

    // 3. Extract sharp crease & silhouette edges for Wireframe / Ghost / X-Ray Scan
    const EdgeList = [];
    let WheelThinIdx = 0;
    for (const E of EdgeMap.values())
    {
        if (E.part === PART_KIND.TYRE)
        {
            if (E.n1 && Dot3(E.n0, E.n1) < 0.58 && (WheelThinIdx++ % 3) === 0) EdgeList.push(E);
            else if (!E.n1 && (WheelThinIdx++ % 6) === 0) EdgeList.push(E);
            continue;
        }
        if (E.part === PART_KIND.RIM || E.part === PART_KIND.HUB)
        {
            if (E.n1 && Dot3(E.n0, E.n1) < 0.65 && (WheelThinIdx++ % 2) === 0) EdgeList.push(E);
            else if (!E.n1 && (WheelThinIdx++ % 5) === 0) EdgeList.push(E);
            continue;
        }
        const Sharp = E.force || !E.n1 || Dot3(E.n0, E.n1) < 0.89;
        if (Sharp) EdgeList.push(E);
    }
    const EdgeVerts = new Float32Array(EdgeList.length * 2 * 9);
    let EC = 0;
    for (const E of EdgeList)
    {
        const Col = E.part === PART_KIND.TYRE ? [0.36, 0.72, 0.86, 0.75] : [0.56, 0.86, 0.96, 0.92];
        for (const P of [E.p0, E.p1])
        {
            const O = EC * 9;
            EdgeVerts[O] = P[0]; EdgeVerts[O + 1] = P[1]; EdgeVerts[O + 2] = P[2];
            EdgeVerts[O + 3] = Col[0]; EdgeVerts[O + 4] = Col[1]; EdgeVerts[O + 5] = Col[2]; EdgeVerts[O + 6] = Col[3];
            EdgeVerts[O + 7] = E.part; EdgeVerts[O + 8] = E.wheelIdx ?? -1;
            EC++;
        }
    }

    return {
        bodyFacets: body.FacetCount,
        rimFacets: rim.FacetCount,
        tyreFacets: tyre.FacetCount,
        totalVerts: VCursor,
        gpuVerts: GpuVerts.subarray(0, VCursor * 12),
        edgeCount: EC,
        edgeVerts: EdgeVerts,
        softVerts: new Float32Array(SoftVerts),
        softTriCount: SoftVerts.length / 18,
        bodyTris: BodyTris,
        wheelTris: WheelTris,
        stats: {
            bodyVerts: body.VertexCount,
            bodyTris: body.FacetCount,
            rimTris: 4 * rim.FacetCount,
            tyreTris: 4 * tyre.FacetCount,
            totalTris: TotalFacets,
            totalVerts: VCursor,
            edgeCount: EdgeList.length,
            edgeVerts: EC
        },
        bounds: {
            min: [-3.12, 0.0, -1.26],
            max: [3.12, 1.35 + GroundOffset, 1.26],
            groundOffset: GroundOffset,
            axleMounts: ControlVehicleSockets.AxleMount.map(A => [A[0], A[2] + GroundOffset, A[1]])
        }
    };
}

export async function LoadControlVehicle(ArchiveBaseUrl)
{
    const Base = ArchiveBaseUrl || new URL('../VehicleProvingGrounds/Archive/', import.meta.url);
    const [body, tyre, rim] = await Promise.all([
        RetrieveFacetStream(new URL('ControlVehicleBody.facet', Base).href),
        RetrieveFacetStream(new URL('ControlVehicleTyre.facet', Base).href),
        RetrieveFacetStream(new URL('ControlVehicleRim.facet', Base).href)
    ]);
    return AssembleControlVehicle({ body, tyre, rim });
}

export function DecodeControlVehicleBuffers(BodyBuf, TyreBuf, RimBuf)
{
    return AssembleControlVehicle({
        body: DecodeFacetStream(BodyBuf, 'ControlVehicleBody.facet'),
        tyre: DecodeFacetStream(TyreBuf, 'ControlVehicleTyre.facet'),
        rim:  DecodeFacetStream(RimBuf,  'ControlVehicleRim.facet')
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                      RAYCAST ENGINE FOR DRAG-AND-DROP MATERIAL RIPPLE ORIGIN ON 3D CAR
//------------------------------------------------------------------------------------------------------------------------

function MollerTrumbore(Orig, Dir, P0, P1, P2)
{
    const E1 = Sub3(P1, P0), E2 = Sub3(P2, P0);
    const H = Cross3(Dir, E2);
    const A = Dot3(E1, H);
    if (Math.abs(A) < 1e-6) return -1;
    const F = 1 / A;
    const S = Sub3(Orig, P0);
    const U = F * Dot3(S, H);
    if (U < 0 || U > 1) return -1;
    const Q = Cross3(S, E1);
    const V = F * Dot3(Dir, Q);
    if (V < 0 || U + V > 1) return -1;
    const T = F * Dot3(E2, Q);
    return T > 0.05 ? T : -1;
}

export function UnprojectViewportRay(Camera, ClientX, ClientY, Canvas)
{
    if (!Camera || !Camera.Eye || !Camera.Right || !Camera.Up) return null;
    const Rect = Canvas.getBoundingClientRect();
    const W = Math.max(1, Rect.width), H = Math.max(1, Rect.height);
    const NdcX = ((ClientX - Rect.left) / W) * 2 - 1;
    const NdcY = 1 - ((ClientY - Rect.top) / H) * 2;
    const TanHalfFov = Math.tan((Camera.VFov || (Math.PI / 4)) * 0.5);
    const Aspect = W / H;
    const Right = Norm3(Camera.Right);
    const Up = Norm3(Camera.Up);
    const Fwd = Camera.Fwd
        ? Norm3(Camera.Fwd)
        : (Camera.Target ? Norm3(Sub3(Camera.Target, Camera.Eye)) : Norm3(Cross3(Up, Right)));
    const Rx = NdcX * Aspect * TanHalfFov;
    const Ry = NdcY * TanHalfFov;
    const Dir = Norm3([
        Fwd[0] + Right[0] * Rx + Up[0] * Ry,
        Fwd[1] + Right[1] * Rx + Up[1] * Ry,
        Fwd[2] + Right[2] * Rx + Up[2] * Ry
    ]);
    return { origin: Camera.Eye, dir: Dir };
}

export function RaycastVehicle(RayOrigin, RayDir, State)
{
    const Mesh = State?.Mesh;
    if (!State?.Enabled || !Mesh) return null;

    const Pos = State.Position || [0, 0, 0];
    const Sc = Math.max(0.05, State.Scale || 1);
    const Yaw = State.Yaw || 0;
    const CosY = Math.cos(-Yaw), SinY = Math.sin(-Yaw);

    // Transform world ray into local ControlVehicle space
    const Ox = (RayOrigin[0] - Pos[0]) / Sc, Oy = (RayOrigin[1] - Pos[1]) / Sc, Oz = (RayOrigin[2] - Pos[2]) / Sc;
    const LocalOrigin = [Ox * CosY + Oz * SinY, Oy, -Ox * SinY + Oz * CosY];
    const LocalDir = [RayDir[0] * CosY + RayDir[2] * SinY, RayDir[1], -RayDir[0] * SinY + RayDir[2] * CosY];

    // Fast AABB slab check against [-3.2, -0.05, -1.4] .. [3.2, 2.0, 1.4]
    const BMin = [-3.25, -0.05, -1.40], BMax = [3.25, 2.05, 1.40];
    let TMin = 0, TMax = 1e6;
    for (let Axis = 0; Axis < 3; Axis++)
    {
        const D = LocalDir[Axis];
        if (Math.abs(D) < 1e-7)
        {
            if (LocalOrigin[Axis] < BMin[Axis] || LocalOrigin[Axis] > BMax[Axis]) return null;
        }
        else
        {
            let T0 = (BMin[Axis] - LocalOrigin[Axis]) / D;
            let T1 = (BMax[Axis] - LocalOrigin[Axis]) / D;
            if (T0 > T1) { const Tmp = T0; T0 = T1; T1 = Tmp; }
            TMin = Math.max(TMin, T0);
            TMax = Math.min(TMax, T1);
            if (TMax < TMin) return null;
        }
    }

    let BestT = Infinity, BestTri = null;
    for (const Tri of Mesh.bodyTris)
    {
        const T = MollerTrumbore(LocalOrigin, LocalDir, Tri.p0, Tri.p1, Tri.p2);
        if (T > 0 && T < BestT) { BestT = T; BestTri = Tri; }
    }
    for (const Tri of Mesh.wheelTris)
    {
        const T = MollerTrumbore(LocalOrigin, LocalDir, Tri.p0, Tri.p1, Tri.p2);
        if (T > 0 && T < BestT) { BestT = T; BestTri = Tri; }
    }
    if (!BestTri) return null;

    const Lx = LocalOrigin[0] + LocalDir[0] * BestT;
    const Ly = LocalOrigin[1] + LocalDir[1] * BestT;
    const Lz = LocalOrigin[2] + LocalDir[2] * BestT;
    const Cw = Math.cos(Yaw), Sw = Math.sin(Yaw);
    const Wx = Pos[0] + (Lx * Cw + Lz * Sw) * Sc;
    const Wy = Pos[1] + Ly * Sc;
    const Wz = Pos[2] + (-Lx * Sw + Lz * Cw) * Sc;

    const Zone = (BestTri.part === PART_KIND.RIM || BestTri.part === PART_KIND.HUB || BestTri.part === PART_KIND.TYRE)
        ? 'rim'
        : 'paint';
    return {
        hit: true,
        distance: BestT * Sc,
        point: [Wx, Wy, Wz],
        localPoint: [Lx, Ly, Lz],
        partKind: BestTri.part,
        zone: Zone,
        wheelIdx: BestTri.wheelIdx ?? -1
    };
}

function EnsureVehicleHeightGrid(Mesh)
{
    if (!Mesh || Mesh.heightGrid) return Mesh?.heightGrid || null;
    const Nx = 52, Nz = 22;
    const MinX = -3.14, MaxX = 3.14;
    const MinZ = -1.28, MaxZ = 1.28;
    const Dx = (MaxX - MinX) / Nx;
    const Dz = (MaxZ - MinZ) / Nz;
    const Heights = new Float32Array(Nx * Nz);
    const Normals = new Float32Array(Nx * Nz * 3);
    for (let I = 0; I < Nx * Nz; I++)
    {
        Heights[I] = -1;
        Normals[I * 3 + 1] = 1;
    }

    const SampleList = List =>
    {
        if (!List) return;
        for (const Tri of List)
        {
            const P0 = Tri.p0, P1 = Tri.p1, P2 = Tri.p2;
            const E1x = P1[0] - P0[0], E1y = P1[1] - P0[1], E1z = P1[2] - P0[2];
            const E2x = P2[0] - P0[0], E2y = P2[1] - P0[1], E2z = P2[2] - P0[2];
            let NxV = E1y * E2z - E1z * E2y;
            let NyV = E1z * E2x - E1x * E2z;
            let NzV = E1x * E2y - E1y * E2x;
            const NL = Math.hypot(NxV, NyV, NzV);
            if (NL < 1e-6) continue;
            NxV /= NL; NyV /= NL; NzV /= NL;
            if (NyV < 0) { NxV = -NxV; NyV = -NyV; NzV = -NzV; }
            if (NyV < 0.14) continue; // skip near-vertical side panels so top envelope matches roof/hood/windshield

            // Sample centroid + 3 edge midpoints + vertices onto height grid
            const Samples = [
                P0, P1, P2,
                [(P0[0] + P1[0] + P2[0]) / 3, (P0[1] + P1[1] + P2[1]) / 3, (P0[2] + P1[2] + P2[2]) / 3],
                [(P0[0] + P1[0]) * 0.5, (P0[1] + P1[1]) * 0.5, (P0[2] + P1[2]) * 0.5],
                [(P1[0] + P2[0]) * 0.5, (P1[1] + P2[1]) * 0.5, (P1[2] + P2[2]) * 0.5],
                [(P2[0] + P0[0]) * 0.5, (P2[1] + P0[1]) * 0.5, (P2[2] + P0[2]) * 0.5]
            ];
            for (const S of Samples)
            {
                const Ix = Math.floor((S[0] - MinX) / Dx);
                const Iz = Math.floor((S[2] - MinZ) / Dz);
                if (Ix < 0 || Ix >= Nx || Iz < 0 || Iz >= Nz) continue;
                const Cell = Iz * Nx + Ix;
                if (S[1] > Heights[Cell])
                {
                    Heights[Cell] = S[1];
                    Normals[Cell * 3]     = NxV;
                    Normals[Cell * 3 + 1] = NyV;
                    Normals[Cell * 3 + 2] = NzV;
                }
            }
        }
    };

    SampleList(Mesh.bodyTris);
    SampleList(Mesh.wheelTris);
    Mesh.heightGrid = { nx: Nx, nz: Nz, minX: MinX, maxX: MaxX, minZ: MinZ, maxZ: MaxZ, dx: Dx, dz: Dz, heights: Heights, normals: Normals };
    return Mesh.heightGrid;
}

export function SampleVehicleSurface(Mesh, State, Wx, Wy, Wz)
{
    if (!Mesh || !State?.Enabled) return null;
    const Grid = EnsureVehicleHeightGrid(Mesh);
    if (!Grid) return null;

    const Pos = State.Position || [0, 0, 0];
    const Sc = Math.max(0.05, State.Scale || 1);
    const Yaw = State.Yaw || 0;
    const CosY = Math.cos(-Yaw), SinY = Math.sin(-Yaw);

    const Ox = (Wx - Pos[0]) / Sc, Oy = (Wy - Pos[1]) / Sc, Oz = (Wz - Pos[2]) / Sc;
    const Lx = Ox * CosY + Oz * SinY;
    const Lz = -Ox * SinY + Oz * CosY;
    if (Lx < Grid.minX || Lx >= Grid.maxX || Lz < Grid.minZ || Lz >= Grid.maxZ) return null;

    const Ix = Math.min(Grid.nx - 1, Math.max(0, Math.floor((Lx - Grid.minX) / Grid.dx)));
    const Iz = Math.min(Grid.nz - 1, Math.max(0, Math.floor((Lz - Grid.minZ) / Grid.dz)));
    const Cell = Iz * Grid.nx + Ix;
    const LocalY = Grid.heights[Cell];
    if (LocalY <= 0.15) return null;

    const WorldY = Pos[1] + LocalY * Sc;
    if (Oy > LocalY + 0.08) return null;
    if (Oy < 0.08) return null;

    const Lnx = Grid.normals[Cell * 3];
    const Lny = Grid.normals[Cell * 3 + 1];
    const Lnz = Grid.normals[Cell * 3 + 2];
    const Cw = Math.cos(Yaw), Sw = Math.sin(Yaw);
    return {
        worldY: WorldY,
        normal: [Lnx * Cw + Lnz * Sw, Lny, -Lnx * Sw + Lnz * Cw]
    };
}

