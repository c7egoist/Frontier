/*==========================================================================================================================================
                                                      SOFTWAREPREVIEWENGINE.JS
==========================================================================================================================================*/
// 🧩 Software 2D/3D-projected fallback simulation engine matching PE.Engine's exact host interface.
//    Active ONLY when browser WebGPU is unavailable (e.g. headless/mobile/non-WebGPU context); WebGPU browsers
//    run the unmodified eos Engine/engine.js compute + render pipelines directly.

import { PE } from './Engine/pe.js';
import './Engine/forcefields.js';
import { SampleVehicleSurface } from './VehicleStage.js';

function LinearToCss(Linear, Alpha = 1)
{
    const ToByte = C => Math.round(Math.min(1, Math.max(0, Math.pow(Math.max(0, C), 1 / 2.2))) * 255);
    return `rgba(${ToByte(Linear[0])}, ${ToByte(Linear[1])}, ${ToByte(Linear[2])}, ${Math.min(1, Math.max(0, Alpha)).toFixed(3)})`;
}

function ProjectPoint(VP, X, Y, Z, W, H)
{
    const Cx = VP[0] * X + VP[4] * Y + VP[8] * Z + VP[12];
    const Cy = VP[1] * X + VP[5] * Y + VP[9] * Z + VP[13];
    const Cw = VP[3] * X + VP[7] * Y + VP[11] * Z + VP[15];
    if (Cw <= 0.08) return null;
    return [((Cx / Cw) * 0.5 + 0.5) * W, (0.5 - (Cy / Cw) * 0.5) * H, Cw];
}

const Smooth = (A, B, X) => { const T = Math.min(1, Math.max(0, (X - A) / Math.max(1e-5, B - A))); return T * T * (3 - 2 * T); };

function BasisFrom(Dir)
{
    const Dl = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
    const Wx = Dir[0] / Dl, Wy = Dir[1] / Dl, Wz = Dir[2] / Dl;
    const Up = Math.abs(Wy) < 0.99 ? [0, 1, 0] : [1, 0, 0];
    let Ux = Up[1] * Wz - Up[2] * Wy;
    let Uy = Up[2] * Wx - Up[0] * Wz;
    let Uz = Up[0] * Wy - Up[1] * Wx;
    const Ul = Math.hypot(Ux, Uy, Uz) || 1;
    Ux /= Ul; Uy /= Ul; Uz /= Ul;
    const Vx = Wy * Uz - Wz * Uy;
    const Vy = Wz * Ux - Wx * Uz;
    const Vz = Wx * Uy - Wy * Ux;
    return [[Ux, Uy, Uz], [Vx, Vy, Vz], [Wx, Wy, Wz]];
}

function SurfaceLocal(Idx, Cap)
{
    const G = Math.max(1, Math.floor(Math.sqrt(Math.max(6, Cap) / 6)));
    const Cells = G * G;
    const Face = Idx % 6;
    const Cell = Math.floor(Idx / 6) % Cells;
    const Cu = ((Cell % G) + 0.5) / G * 2 - 1;
    const Cv = (Math.floor(Cell / G) + 0.5) / G * 2 - 1;
    const Ax = Math.floor(Face / 2);
    const Sg = (Face % 2) === 0 ? -1 : 1;
    const Out = [0, 0, 0];
    Out[Ax] = Sg;
    Out[(Ax + 1) % 3] = Cu;
    Out[(Ax + 2) % 3] = Cv;
    return Out;
}

function TransitionWaveT(U01, Wave)
{
    if (Wave === 'glitch')
    {
        const Cx = Math.floor(U01[0] * 7), Cy = Math.floor(U01[1] * 5), Cz = Math.floor(U01[2] * 7);
        const D = Cx * 12.9898 + Cy * 78.233 + Cz * 37.719;
        const H = (Math.sin(D) * 43758.5453) % 1;
        return Math.min(1, Math.max(0, 0.6 * (H < 0 ? H + 1 : H) + 0.4 * U01[1]));
    }
    if (Wave === 'melt')
    {
        return Math.min(1, Math.max(0,
            0.5 + 0.3 * Math.sin(U01[0] * 5 + U01[1] * 3 + 0.7) + 0.2 * Math.sin(U01[1] * 7 - U01[2] * 4 + 2.1)));
    }
    return (U01[0] + U01[1] + U01[2]) / 3;
}

export class SoftwarePreviewEngine
{
    constructor(Canvas)
    {
        this.canvas = Canvas;
        this.ctx = Canvas.getContext('2d');
        this.adapterName = 'Software 3D Fallback (WebGPU unavailable)';
        this.probePending = false;
        this.probeResult = null;
        this.systems = [];
        this.onLost = null;
        this._bloomCanvas = null;
        this._bloomCtx = null;
    }

    async init()
    {
        return { adapter: this.adapterName, fallback: true };
    }

    resize(Width, Height)
    {
        this.canvas.width = Width;
        this.canvas.height = Height;
    }

    createSystem(P)
    {
        const Sys = {
            P,
            cap: Math.max(64, Math.floor(P.capacity || 512)),
            stats_: { alive: P.kind === 7 ? (P.fibre?.strands || 32) : 0, energy: 0, A: 0, B: 0, C: 0 },
            readbackMs: 0.14,
            readbackCount: 0,
            particles: [],
            splashes: [],
            cpu: new Float32Array(64),
            fibreCpu: new Float32Array(128),
            pathKey: null,
            destroy() { this.particles.length = 0; this.splashes.length = 0; }
        };
        this.systems.push(Sys);
        return Sys;
    }

    destroySystem(Sys)
    {
        this.systems = this.systems.filter(S => S !== Sys);
    }

    async benchmarkFullReadback(Sys)
    {
        return { bytes: Sys.cap * 80, ms: 0.12, mbPerSecond: 680, alive: Sys.stats_?.alive || 0 };
    }

    _drawMeshTris(Ctx, VP, W, H, CamX, CamY, CamZ, meshBuf, vertCount, frontFaceOnly = false)
    {
        if (!meshBuf || vertCount < 3) return;
        const Tris = [];
        for (let I = 0; I < vertCount - 2; I += 3)
        {
            const O0 = I * 10, O1 = (I + 1) * 10, O2 = (I + 2) * 10;
            const A = ProjectPoint(VP, meshBuf[O0], meshBuf[O0 + 1], meshBuf[O0 + 2], W, H);
            const B = ProjectPoint(VP, meshBuf[O1], meshBuf[O1 + 1], meshBuf[O1 + 2], W, H);
            const C = ProjectPoint(VP, meshBuf[O2], meshBuf[O2 + 1], meshBuf[O2 + 2], W, H);
            if (!A || !B || !C) continue;
            const Mx = (meshBuf[O0] + meshBuf[O1] + meshBuf[O2]) / 3;
            const My = (meshBuf[O0 + 1] + meshBuf[O1 + 1] + meshBuf[O2 + 1]) / 3;
            const Mz = (meshBuf[O0 + 2] + meshBuf[O1 + 2] + meshBuf[O2 + 2]) / 3;
            let Nx = (meshBuf[O0 + 3] + meshBuf[O1 + 3] + meshBuf[O2 + 3]) / 3;
            let Ny = (meshBuf[O0 + 4] + meshBuf[O1 + 4] + meshBuf[O2 + 4]) / 3;
            let Nz = (meshBuf[O0 + 5] + meshBuf[O1 + 5] + meshBuf[O2 + 5]) / 3;
            const Nl = Math.hypot(Nx, Ny, Nz) || 1;
            Nx /= Nl; Ny /= Nl; Nz /= Nl;
            const Vx = CamX - Mx, Vy = CamY - My, Vz = CamZ - Mz;
            const Vl = Math.hypot(Vx, Vy, Vz) || 1;
            const Vux = Vx / Vl, Vuy = Vy / Vl, Vuz = Vz / Vl;
            const Facing = Nx * Vux + Ny * Vuy + Nz * Vuz;
            if (frontFaceOnly && Facing < -0.05) continue;
            if (Facing < 0) { Nx = -Nx; Ny = -Ny; Nz = -Nz; }
            const D1 = Math.max(0, Nx * 0.45 + Ny * 0.85 + Nz * 0.35);
            const D2 = Math.max(0, Nx * -0.62 + Ny * 0.35 + Nz * -0.52);
            const Rim = Math.pow(1 - Math.max(0, Nx * Vux + Ny * Vuy + Nz * Vuz), 2.4) * 0.14;
            const Lit = 0.52 + 0.38 * D1 + 0.18 * D2;
            const Cr = Math.min(255, Math.round((meshBuf[O0 + 6] * Lit + Rim * 0.35 * meshBuf[O0 + 6]) * 255));
            const Cg = Math.min(255, Math.round((meshBuf[O0 + 7] * Lit + Rim * 0.35 * meshBuf[O0 + 7]) * 255));
            const Cb = Math.min(255, Math.round((meshBuf[O0 + 8] * Lit + Rim * 0.35 * meshBuf[O0 + 8]) * 255));
            const Alpha = Math.min(1, meshBuf[O0 + 9]);
            Tris.push({
                D: (A[2] + B[2] + C[2]) / 3,
                A, B, C,
                Fill: `rgba(${Cr},${Cg},${Cb},${Alpha.toFixed(3)})`
            });
        }
        Tris.sort((P, Q) => Q.D - P.D);
        for (const T of Tris)
        {
            Ctx.fillStyle = T.Fill;
            Ctx.beginPath();
            Ctx.moveTo(T.A[0], T.A[1]);
            Ctx.lineTo(T.B[0], T.B[1]);
            Ctx.lineTo(T.C[0], T.C[1]);
            Ctx.closePath();
            Ctx.fill();
        }
    }

    render({ glob, fields, comps, fieldScene, preparedField, clear, floor, arrows, lines, lineCount, meshes, meshCount, segCount, segData, jobs, probe, lensCount, lens, vehicle })
    {
        if (!this.ctx && this.canvas) this.ctx = this.canvas.getContext('2d');
        const Ctx = this.ctx;
        if (!Ctx) return;
        const W = this.canvas.width, H = this.canvas.height;
        const VP = glob.subarray(0, 16);
        const CamX = glob[24], CamY = glob[25], CamZ = glob[26];
        const Time = glob[40], Dt = glob[41];
        const WindScale = glob[43] || 1;
        const Solo = fieldScene?.Visualization?.Solo || null;
        const Prepared = preparedField || (fieldScene && PE.Forces?.Prepare ? PE.Forces.Prepare(fieldScene, Time) : null);

        const BgR = Math.round(Math.min(1, clear[0] * 1.4) * 255);
        const BgG = Math.round(Math.min(1, clear[1] * 1.4) * 255);
        const BgB = Math.round(Math.min(1, clear[2] * 1.4) * 255);
        Ctx.fillStyle = `rgb(${BgR}, ${BgG}, ${BgB})`;
        Ctx.fillRect(0, 0, W, H);

        // Subtle atmospheric horizon glow
        const Glow = Ctx.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.45, Math.max(W, H) * 0.65);
        Glow.addColorStop(0, 'rgba(38, 44, 58, 0.28)');
        Glow.addColorStop(1, 'rgba(10, 11, 13, 0)');
        Ctx.fillStyle = Glow;
        Ctx.fillRect(0, 0, W, H);

        // Perspective grid floor
        if (floor)
        {
            Ctx.lineWidth = 1;
            Ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            Ctx.beginPath();
            for (let I = -6; I <= 6; I += 2)
            {
                const A = ProjectPoint(VP, -6, 0, I, W, H), B = ProjectPoint(VP, 6, 0, I, W, H);
                if (A && B) { Ctx.moveTo(A[0], A[1]); Ctx.lineTo(B[0], B[1]); }
                const C = ProjectPoint(VP, I, 0, -6, W, H), D = ProjectPoint(VP, I, 0, 6, W, H);
                if (C && D) { Ctx.moveTo(C[0], C[1]); Ctx.lineTo(D[0], D[1]); }
            }
            Ctx.stroke();
        }

        // Shaded 3D equipment & emitter meshes (Wind Generator shroud/blades, Emitter Cones, Vortex Funnel)
        if (meshes && meshCount >= 3)
            this._drawMeshTris(Ctx, VP, W, H, CamX, CamY, CamZ, meshes, meshCount, false);

        // Domain, Origin & 3D Force Wireframes / Flowlines
        if (lines && lineCount > 0)
        {
            Ctx.lineWidth = 1.25;
            for (let I = 0; I < lineCount - 1; I += 2)
            {
                const O0 = I * 7, O1 = (I + 1) * 7;
                const A = ProjectPoint(VP, lines[O0], lines[O0 + 1], lines[O0 + 2], W, H);
                const B = ProjectPoint(VP, lines[O1], lines[O1 + 1], lines[O1 + 2], W, H);
                if (!A || !B) continue;
                Ctx.strokeStyle = `rgba(${Math.round(lines[O0 + 3] * 255)}, ${Math.round(lines[O0 + 4] * 255)}, ${Math.round(lines[O0 + 5] * 255)}, ${lines[O0 + 6]})`;
                Ctx.beginPath(); Ctx.moveTo(A[0], A[1]); Ctx.lineTo(B[0], B[1]); Ctx.stroke();
            }
        }

        // ControlVehicle (Solid, Ghost 45%, Wireframe, X-Ray Scan Sweep + Expanding Material Ripple)
        if (vehicle && vehicle.enabled && vehicle.mesh && vehicle.uniform)
            this._renderVehicle(Ctx, VP, W, H, CamX, CamY, CamZ, vehicle);

        // Sample exact ForceFieldCatalogue Flow velocity at world (X, Y, Z)
        const SampleWind = (X, Y, Z) =>
        {
            const Out = [0, 0, 0];
            if (fieldScene && Prepared && PE.Forces?.EvaluatePrepared)
            {
                PE.Forces.EvaluatePrepared(fieldScene, Prepared, 'Flow', X, Y, Z, 0.5, Out, Solo, 'Particles');
                return [Out[0] * WindScale, Out[1] * WindScale, Out[2] * WindScale];
            }
            return Out;
        };

        // 3D Vector Field Lattice (VectorayGen / VectorFieldVisualizer / FlowDashes style)
        if (arrows)
        {
            const Min = PE.WIND?.min || [-6, 0, -6], Size = PE.WIND?.size || [12, 8, 12], Dim = PE.WIND?.dim || [24, 12, 24];
            const Stride = Math.max(1, Math.round(glob[51] || 3));
            const RefSpeed = Math.max(1, glob[44] || 12);
            const Style = Math.round(glob[45] || 0);
            const CellX = Size[0] / Dim[0], CellY = Size[1] / Dim[1], CellZ = Size[2] / Dim[2];
            const EngStops = [[15, 28, 38], [46, 110, 125], [89, 166, 110], [212, 181, 102], [232, 107, 79]];
            const EngCss = T => {
                const U = Math.max(0.20, Math.min(1, T)) * 4;
                const I = Math.min(3, Math.floor(U)), F = U - I;
                const A = EngStops[I], B = EngStops[I + 1];
                return `rgba(${Math.round(A[0] + (B[0] - A[0]) * F)},${Math.round(A[1] + (B[1] - A[1]) * F)},${Math.round(A[2] + (B[2] - A[2]) * F)},0.92)`;
            };
            const DirCss = (Dx, Dy, Dz, T) => {
                const H = ((Math.atan2(Dz, Dx) / (Math.PI * 2) + 0.5 + Dy * 0.16) % 1 + 1) % 1;
                const K = [1, 2 / 3, 1 / 3];
                const Rgb = K.map(Off => {
                    const P = Math.abs((((H + Off) % 1 + 1) % 1) * 6 - 3);
                    const C = Math.max(0, Math.min(1, P - 1));
                    return Math.round((0.86 * 0.22 + C * 0.78) * (0.58 + 0.38 * T) * 255);
                });
                return `rgba(${Rgb[0]},${Rgb[1]},${Rgb[2]},0.92)`;
            };
            const DashCss = T => {
                const U = Math.max(0, Math.min(1, T));
                const R = U < 0.55 ? 0.62 + 0.26 * (U / 0.55) : 0.88 + 0.09 * ((U - 0.55) / 0.45);
                const G = U < 0.55 ? 0.22 + 0.30 * (U / 0.55) : 0.52 + 0.39 * ((U - 0.55) / 0.45);
                const B = U < 0.55 ? 0.16 + 0.22 * (U / 0.55) : 0.38 + 0.49 * ((U - 0.55) / 0.45);
                return `rgba(${Math.round(R * 255)},${Math.round(G * 255)},${Math.round(B * 255)},0.92)`;
            };

            const ArrowsDraw = [];
            for (let Z = 0; Z < Dim[2]; Z += Stride)
            {
                const Wz = Min[2] + (Z + 0.5) * CellZ;
                for (let Y = 0; Y < Dim[1]; Y += Stride)
                {
                    const Wy = Min[1] + (Y + 0.5) * CellY;
                    for (let X = 0; X < Dim[0]; X += Stride)
                    {
                        const Wx = Min[0] + (X + 0.5) * CellX;
                        const V = SampleWind(Wx, Wy, Wz);
                        const Mag = Math.hypot(V[0], V[1], V[2]);
                        if (Mag < 0.05) continue;
                        const Dx = V[0] / Mag, Dy = V[1] / Mag, Dz = V[2] / Mag;
                        const T = Math.min(1, Mag / RefSpeed);
                        const Len = Math.min(CellX, CellZ) * (0.68 + 0.95 * T);
                        const A = ProjectPoint(VP, Wx - Dx * Len * 0.35, Wy - Dy * Len * 0.35, Wz - Dz * Len * 0.35, W, H);
                        const B = ProjectPoint(VP, Wx + Dx * Len * (Style === 2 ? 0.35 : 0.25), Wy + Dy * Len * (Style === 2 ? 0.35 : 0.25), Wz + Dz * Len * (Style === 2 ? 0.35 : 0.25), W, H);
                        const Tip = ProjectPoint(VP, Wx + Dx * Len * 0.64, Wy + Dy * Len * 0.64, Wz + Dz * Len * 0.64, W, H);
                        if (!A || !B || !Tip) continue;
                        const Col = Style === 1 ? EngCss(T) : Style === 2 ? DashCss(T) : DirCss(Dx, Dy, Dz, T);
                        ArrowsDraw.push({ D: Tip[2], A, B, Tip, Col, T });
                    }
                }
            }
            ArrowsDraw.sort((P, Q) => Q.D - P.D);
            Ctx.lineCap = 'round';
            for (const Ar of ArrowsDraw)
            {
                Ctx.strokeStyle = Ar.Col;
                Ctx.lineWidth = Style === 2 ? 2.4 : 1.55;
                Ctx.beginPath();
                Ctx.moveTo(Ar.A[0], Ar.A[1]);
                Ctx.lineTo(Ar.B[0], Ar.B[1]);
                Ctx.stroke();
                if (Style !== 2)
                {
                    const Ang = Math.atan2(Ar.Tip[1] - Ar.A[1], Ar.Tip[0] - Ar.A[0]);
                    const Wg = 3.8 + Ar.T * 1.6;
                    const Nx = -Math.sin(Ang) * Wg, Ny = Math.cos(Ang) * Wg;
                    Ctx.fillStyle = Ar.Col;
                    Ctx.beginPath();
                    Ctx.moveTo(Ar.Tip[0], Ar.Tip[1]);
                    Ctx.lineTo(Ar.B[0] + Nx, Ar.B[1] + Ny);
                    Ctx.lineTo(Ar.B[0] - Nx, Ar.B[1] - Ny);
                    Ctx.closePath();
                    Ctx.fill();
                }
            }
        }

        if (probe)
        {
            const Min = PE.WIND.min, Size = PE.WIND.size, Dim = PE.WIND.dim;
            const Px = Min[0] + ((probe.ix + 0.5) / Dim[0]) * Size[0];
            const Py = Min[1] + ((probe.iy + 0.5) / Dim[1]) * Size[1];
            const Pz = Min[2] + ((probe.iz + 0.5) / Dim[2]) * Size[2];
            const V = SampleWind(Px, Py, Pz);
            this.probeResult = { at: [probe.ix, probe.iy, probe.iz], value: V, mag: Math.hypot(V[0], V[1], V[2]), ms: 0.08, bytes: 8 };
        }

        // Advance and draw software preview particles
        for (const Job of jobs)
        {
            const Sys = Job.gpu, P = Sys.P;
            if (Job.fibre)
            {
                const F = P.fibre || {};
                const Shape = F.shape || 'streak';
                const TotalStrands = Math.max(4, Math.round(F.strands || 48));
                const DrawCount = Math.min(720, TotalStrands);
                const RawSegs = Math.max(6, Math.round(F.segments || 24));
                const Segs = DrawCount > 360 ? Math.min(18, RawSegs) : Math.min(44, RawSegs);
                const Seed = F.seed || 11;
                const LoopSec = Math.max(0.5, F.loopSeconds || 10);
                const Lf = (Time / LoopSec) % 1;
                const Wt = Math.PI * 2 * Lf * (F.harmonic || 1);
                const Sc = F.scale || 1;
                const WindMix = F.windMix || 0;
                const Stops = (F.stops && F.stops.length) ? F.stops : [{ pos: 0, col: P.colA || [0.2, 0.8, 1, 1] }, { pos: 1, col: P.colB || [0.6, 0.4, 1, 1] }];
                const ColC = F.colC || [0.92, 1, 1, 1];
                const Win = Math.min(0.95, Math.max(0.04, F.window ?? 0.40));
                const Cycles = Math.max(1, F.windowCycles || 1);
                const Baseline = Math.min(1, Math.max(0, F.baseline ?? 0.12));
                const Taper = Math.min(1, Math.max(0, F.taper ?? 0.45));
                const AccentMix = Math.min(1, Math.max(0, F.accentMix ?? 0.25));
                const PulseRate = F.pulseRate ?? 1;
                const PulseDepth = F.pulseDepth ?? 0;
                const PulseIdx = Math.max(0, (PE.PULSE_SHAPES || ['Breathe', 'Heartbeat', 'Ripple', 'Sweep']).indexOf(F.pulseShape || 'Breathe'));
                const PeriodicGap = (A, B) => { const G = Math.abs(((A % 1 + 1) % 1) - ((B % 1 + 1) % 1)); return Math.min(G, 1 - G); };
                const PulseAt = Along =>
                {
                    if (PulseRate === 0 || PulseDepth <= 0) return 1;
                    const Cyc = (PulseRate * Lf) % 1;
                    if (PulseIdx === 3)
                    {
                        const Front = -0.03 + 1.06 * Math.min(Cyc / 0.45, 1);
                        const Done = Smooth(1.0, 1.01, Front - 0.02);
                        const Origin = Smooth(0.0, 0.04, Along) * (1 - Done) + Done;
                        const Body = Origin * (1 - Smooth(Front - 0.02, Front + 0.005, Along));
                        const Off = (Along - (Front - 0.012)) / 0.012;
                        const Ridge = Origin * Math.exp(-0.5 * Off * Off) * Smooth(0, 0.04, Cyc) * (1 - Smooth(0.85, 1.0, Front - 0.012));
                        const Hold = 1 - Smooth(0.75, 1.0, Cyc);
                        return 1 - PulseDepth + PulseDepth * Math.min(1, Math.max(0, Hold * Math.min(1, 0.65 * Body + 0.35 * Ridge)));
                    }
                    const Ph = ((PulseRate * Lf - (PulseIdx === 2 ? Along : 0)) % 1 + 1) % 1;
                    if (PulseIdx === 1)
                    {
                        const First = Math.exp(-Math.pow(PeriodicGap(Ph, 0.10) / 0.045, 2));
                        const Second = 0.55 * Math.exp(-Math.pow(PeriodicGap(Ph, 0.27) / 0.055, 2));
                        return 1 - PulseDepth + PulseDepth * Math.min(1, First + Second);
                    }
                    return 1 - PulseDepth + PulseDepth * (0.5 - 0.5 * Math.cos(Math.PI * 2 * Ph));
                };
                const Pulse = PulseAt(0.5);
                const CurlFreq = Math.max(0.3, F.waves || 0.85);
                let PathTable = null;
                if (Shape === 'trail' && PE.samplePath)
                {
                    const Key = `${F.pathShape || 'Ring'}|${F.pathSize || 5}`;
                    if (Sys.pathKey !== Key || !Sys._softPath)
                    {
                        Sys.pathKey = Key;
                        Sys._softPath = PE.samplePath(F.pathShape || 'Ring', F.pathSize || 5, PE.PATH_SAMPLES || 512);
                    }
                    PathTable = Sys._softPath;
                }
                const SampleTrailPt = Frac =>
                {
                    const N = (PathTable?.length || 0) / 4;
                    if (!N) return [0, 0, 0];
                    const U = ((Frac % 1) + 1) % 1;
                    const Pos = U * N;
                    const I0 = Math.min(N - 1, Math.max(0, Math.floor(Pos)));
                    const I1 = (I0 + 1) >= N ? 0 : I0 + 1;
                    const R = Pos - I0;
                    return [
                        PathTable[I0 * 4] + (PathTable[I1 * 4] - PathTable[I0 * 4]) * R,
                        PathTable[I0 * 4 + 1] + (PathTable[I1 * 4 + 1] - PathTable[I0 * 4 + 1]) * R,
                        0
                    ];
                };

                const Unit = (Id, Salt) =>
                {
                    let K = ((Id * 747796405) ^ (Salt * 2891336453) ^ (Seed * 196613)) >>> 0;
                    K ^= K >>> 16; K = Math.imul(K, 0x7feb352d) >>> 0;
                    K ^= K >>> 15; K = Math.imul(K, 0x846ca68b) >>> 0;
                    K ^= K >>> 16;
                    return (K >>> 0) / 4294967296;
                };

                const CurlSample = (Px, Py, Pz) =>
                {
                    const Qx = Px * CurlFreq, Qy = Py * CurlFreq, Qz = Pz * CurlFreq;
                    const Dy = Math.cos(Qy * 1.1) * 1.1 - Math.sin(Qy * 1.9 - Qz * 0.7) * 0.6;
                    const Dz = -Math.sin(Qz * 1.3) * 1.1 + Math.cos(Qz * 1.7 + Qx * 0.8) * 0.6;
                    const Dx = Math.cos(Qx * 1.2) * 1.1 + Math.sin(Qx * 1.8 - Qy * 0.6) * 0.6;
                    return [Dy - Dz, Dz - Dx, Dx - Dy];
                };

                const RampCol = T =>
                {
                    if (Stops.length === 1) return Stops[0].col;
                    const U = Math.min(1, Math.max(0, T));
                    for (let K = 0; K + 1 < Stops.length; K++)
                    {
                        const P0 = Stops[K].pos ?? (K / Math.max(1, Stops.length - 1));
                        const P1 = Stops[K + 1].pos ?? ((K + 1) / Math.max(1, Stops.length - 1));
                        if (U <= P1 || K + 2 === Stops.length)
                        {
                            const R = Math.min(1, Math.max(0, (U - P0) / Math.max(1e-4, P1 - P0)));
                            const A = Stops[K].col, B = Stops[K + 1].col;
                            return [A[0] + (B[0] - A[0]) * R, A[1] + (B[1] - A[1]) * R, A[2] + (B[2] - A[2]) * R, 1];
                        }
                    }
                    return Stops[Stops.length - 1].col;
                };

                const ColourAt = (T, Id) =>
                {
                    const Base = F.colourMode === 'solid'
                        ? Stops[0].col
                        : F.colourMode === 'palette'
                            ? Stops[Math.min(Stops.length - 1, Math.floor(Unit(Id, 14) * Stops.length))].col
                            : RampCol(T);
                    const Mix = AccentMix * Unit(Id, 12);
                    return [
                        Base[0] + (ColC[0] - Base[0]) * Mix,
                        Base[1] + (ColC[1] - Base[1]) * Mix,
                        Base[2] + (ColC[2] - Base[2]) * Mix,
                        1
                    ];
                };

                // Stationary sculptural topologies (curl-noise folds without synthetic time wobble).
                const CurveLocal = (S, Id) =>
                {
                    if (Shape === 'blossom')
                    {
                        const Role = Unit(Id, 19);
                        const Spread = Math.max(0.2, F.spread || 3.4);
                        const Amp = F.amplitude || 1.55;
                        const CurlAmt = Math.max(0, F.ripple ?? 1.18);
                        if (Role < 0.28)
                        {
                            const Theta = Id * 2.39996323 + Unit(Id, 20) * 0.55;
                            const Flare = 0.04 + 0.34 * Math.pow(Unit(Id, 21), 0.72);
                            const R = Spread * Flare * Math.pow(S, 1.18);
                            const H = Amp * (0.98 + 0.44 * Unit(Id, 22)) * (S + 0.14 * Math.sin(S * Math.PI));
                            const Bx = Math.cos(Theta) * R, By = Math.sin(Theta) * R, Bz = H;
                            const [Cx, Cy, Cz] = CurlSample(Bx * 0.75 + 1.2, By * 0.75 + 2.3, Bz * 0.75 + 0.7);
                            const W = 0.14 * CurlAmt * Math.pow(S, 1.4);
                            return [Bx + Cx * W, By + Cy * W, Bz + Cz * W];
                        }
                        const IsGhost = Role < 0.44;
                        const Petals = Math.min(12, Math.max(3, Math.round(F.frequency || 5)));
                        const U = (Id + 0.5) / TotalStrands;
                        const Tier = Math.floor(Unit(Id, 21) * 3) - 1;
                        const Theta = U * Math.PI * 2 + 0.24 * Math.sin(U * Math.PI * 2 * Petals + Unit(Id, 20) * 0.2);
                        const Pw = Math.cos(Petals * Theta + 0.62 * S);
                        const Scallop = 0.055 * Math.sin(Petals * 3 * Theta) * S * S;
                        const R = Spread * (IsGhost ? 1.18 : 1.0) * (0.68 + 0.28 * Pw + Scallop) * (0.86 + 0.20 * Unit(Id, 22)) * Math.pow(S, 0.76);
                        const Cup = Amp * (IsGhost ? 0.62 : 1.0) * (Math.sin(S * 2.30) * 0.54 + 0.34 * Pw * S * S + 0.14 * Tier * S - 0.18 * S * S * S);
                        const Bx = Math.cos(Theta) * R, By = Math.sin(Theta) * R, Bz = Cup;
                        const [C1x, C1y, C1z] = CurlSample(Bx * 0.58 + 0.5, By * 0.58 - 1.1, Bz * 0.58 + 0.8);
                        const [C2x, C2y, C2z] = CurlSample(Bx * 1.28 + 3.7, By * 1.28 - 1.9, Bz * 1.28 + 5.1);
                        const W = 0.28 * CurlAmt * Math.pow(S, 1.35);
                        return [Bx + (C1x * 0.68 + C2x * 0.32) * W * 0.72, By + (C1y * 0.68 + C2y * 0.32) * W * 0.72, Bz + (C1z * 0.68 + C2z * 0.32) * W * 0.58];
                    }
                    if (Shape === 'stream')
                    {
                        const U = (Id + 0.5) / TotalStrands - 0.5;
                        const Len = F.length || 6.4;
                        const Along = (S - 0.42) * Len;
                        const Sweep = (F.amplitude || 2.35) * Math.pow(Math.max(0, S - 0.12) / 0.88, 2.25);
                        const Flare = Smooth(0.45, 1.0, S);
                        const Curl = (F.ripple || 1.1) * Math.sin(S * 4.6 + U * 2.6) * Flare;
                        const Width = (F.spread || 1.05) * (0.24 + (1.45 - 0.24) * Math.pow(S, 1.25)) * (0.76 + 0.24 * Math.cos(U * 10));
                        const Tw = (F.phaseSpread || 1.65) * S * S;
                        const Fork = Math.sign(U) * Smooth(0.68, 1.0, S) * (F.ripple || 1.1) * 0.52;
                        const Lat = U * Width + (Unit(Id, 23) - 0.5) * 0.12 * (F.spread || 1.05) * S;
                        return [Along + Curl * 0.42 + Math.sin(S * 3.1) * 0.18 * (F.ripple || 1.1), Math.cos(Tw) * Lat + Fork * 0.38, Sweep + Math.sin(Tw) * Lat * 0.82 + Curl];
                    }
                    if (Shape === 'burst')
                    {
                        const Theta = Id * 2.39996323 + Unit(Id, 1) * 0.42;
                        const Cone = Math.min(2.8, Math.max(0.2, F.spread || 0.95));
                        const Elev = (0.04 + 0.96 * Math.pow(Unit(Id, 2), 1.32)) * Cone;
                        const Len = (F.length || 4.4) * (0.68 + 0.52 * Unit(Id, 3));
                        const R = Math.sin(Elev) * Len * Math.pow(S, 0.92);
                        const Up = Math.cos(Elev) * Len * S;
                        const Ph = Unit(Id, 5) * Math.PI * 2;
                        const B1 = (F.amplitude || 0.42) * S * S * Math.sin(S * 2.3 + Ph);
                        const B2 = (F.amplitude || 0.42) * S * S * Math.cos(S * 2.1 + Ph * 1.3);
                        return [Math.cos(Theta) * R + B1 * 0.45, Math.sin(Theta) * R + B2 * 0.45, Up];
                    }
                    if (Shape === 'curl')
                    {
                        const Band = Math.floor(Unit(Id, 15) * 5);
                        const A = (Band / 5) * Math.PI * 2 + (Unit(Id, 16) - 0.5) * 0.65;
                        const Rad = (F.spread || 2.2) * (0.25 + 0.75 * Math.sqrt(Unit(Id, 17)));
                        let Px = Math.cos(A) * Rad, Py = Math.sin(A) * Rad, Pz = (Unit(Id, 18) - 0.5) * (F.amplitude || 1.6);
                        const StepLen = ((F.length || 5.2) / 6) * S;
                        const CurlAmt = Math.max(0.25, F.ripple || 1.15);
                        for (let K = 0; K < 6; K++)
                        {
                            const [Cx, Cy, Cz] = CurlSample(Px, Py, Pz);
                            const Vx = Cx + 0.18, Vy = Cy + 0.08, Vz = Cz + 0.12;
                            const L = Math.hypot(Vx, Vy, Vz) || 1;
                            Px += (Vx / L) * StepLen * CurlAmt * 0.45;
                            Py += (Vy / L) * StepLen * CurlAmt * 0.45;
                            Pz += (Vz / L) * StepLen * CurlAmt * 0.45;
                        }
                        return [Px, Py, Pz];
                    }
                    if (Shape === 'void')
                    {
                        const Rv = Math.max(0.32, (F.sheetWidth || 2.4) * 0.36);
                        const U = (Id + 0.5) / TotalStrands;
                        const Theta = U * Math.PI * 2 + (Unit(Id, 1) - 0.5) * (Math.PI * 2 / TotalStrands) * 0.7;
                        const Tilt = (Unit(Id, 2) - 0.5) * Math.min(1.8, Math.max(0.15, F.spread || 1.15));
                        const R = Rv + S * (F.length || 3.8);
                        const Sw = (F.amplitude || 0.65) * Math.sin(S * 4.4 + Theta * 2) * Smooth(0, 0.35, S) * 0.45;
                        const Phi = Theta + Sw / Math.max(R, 0.25);
                        return [Math.cos(Phi) * Math.cos(Tilt) * R, Math.sin(Phi) * Math.cos(Tilt) * R, Math.sin(Tilt) * R + Sw * 0.28];
                    }
                    if (Shape === 'ribbon')
                    {
                        const Across = (Id + 0.5) / TotalStrands - 0.5;
                        const Along = (S - 0.5) * (F.length || 10);
                        const Lift = (F.ripple || 1) * (
                            Math.sin(Along * (F.waves || 0.8) + Wt + Across * (F.phaseSpread || 1.2) * Math.PI * 2) * 0.7
                            + Math.sin(Across * (F.sheetWidth || 6) * (F.waves || 0.8) * 0.5 - 2 * Wt + Along * 0.35) * 0.3
                        );
                        return [Along, Across * (F.sheetWidth || 6), Lift];
                    }
                    if (Shape === 'trail' && PathTable)
                    {
                        const Harm = F.harmonic || 1;
                        const PhaseSw = F.phaseSpread || 1.2;
                        const Head = (((Unit(Id, 9) * PhaseSw) / (Math.PI * 2) + Lf * Harm) % 1 + 1) % 1;
                        const Arc = ((Head - (F.trailLength || 0.3) * (1 - S)) % 1 + 1) % 1;
                        const Step = 1 / Math.max(16, (PE.PATH_SAMPLES || 512));
                        const P0 = SampleTrailPt(Arc);
                        const Pm = SampleTrailPt(Arc - Step);
                        const Pp = SampleTrailPt(Arc + Step);
                        let Tx = Pp[0] - Pm[0], Ty = Pp[1] - Pm[1];
                        const Tl = Math.hypot(Tx, Ty) || 1;
                        Tx /= Tl; Ty /= Tl;
                        const Sx = Ty, Sy = -Tx;
                        const Ang = Math.PI * 2 * Unit(Id, 3);
                        const Rad = (F.spread || 0.35) * Math.sqrt(Unit(Id, 4));
                        const K = Math.max(1, Math.round(F.frequency || 1));
                        const Wob = (F.amplitude || 0) * S * Math.sin(Math.PI * 2 * K * S + Math.PI * 2 * Unit(Id, 5) + Wt);
                        return [
                            P0[0] + Sx * Math.cos(Ang) * Rad + Sx * Wob,
                            P0[1] + Sy * Math.cos(Ang) * Rad + Sy * Wob,
                            Math.sin(Ang) * Rad
                        ];
                    }
                    // 'streak' (Bezier cone aligned along P.dir)
                    const D = P.dir || [0, 1, 0];
                    const [Lat, Norm, Ax] = BasisFrom([D[0], D[2], D[1]]);
                    const Len = F.length || 6;
                    const Spread = F.spread || 1.2;
                    const Amp = F.amplitude || 1.4;
                    const K = Math.max(1, Math.round(F.frequency || 1));
                    const Ang = Math.PI * 2 * Unit(Id, 1);
                    const R0 = Spread * Math.sqrt(Unit(Id, 2));
                    const Rx = (Lat[0] * Math.cos(Ang) + Norm[0] * Math.sin(Ang)) * R0;
                    const Ry = (Lat[1] * Math.cos(Ang) + Norm[1] * Math.sin(Ang)) * R0;
                    const Rz = (Lat[2] * Math.cos(Ang) + Norm[2] * Math.sin(Ang)) * R0;
                    const Tang = Math.PI * 2 * Unit(Id, 3);
                    const TR = Spread * 1.6 * Math.sqrt(Unit(Id, 4));
                    const Ex = Ax[0] * Len + (Lat[0] * Math.cos(Tang) + Norm[0] * Math.sin(Tang)) * TR;
                    const Ey = Ax[1] * Len + (Lat[1] * Math.cos(Tang) + Norm[1] * Math.sin(Tang)) * TR;
                    const Ez = Ax[2] * Len + (Lat[2] * Math.cos(Tang) + Norm[2] * Math.sin(Tang)) * TR;
                    const P5 = Math.sin(K * Wt + Math.PI * 2 * Unit(Id, 5)), P6 = Math.cos(2 * K * Wt + Math.PI * 2 * Unit(Id, 6));
                    const P7 = Math.sin(K * Wt + Math.PI * 2 * Unit(Id, 7)), P8 = Math.sin(2 * K * Wt + Math.PI * 2 * Unit(Id, 8));
                    const C1x = Rx + Ax[0] * Len * 0.34 + (Lat[0] * P5 + Norm[0] * P6) * Amp;
                    const C1y = Ry + Ax[1] * Len * 0.34 + (Lat[1] * P5 + Norm[1] * P6) * Amp;
                    const C1z = Rz + Ax[2] * Len * 0.34 + (Lat[2] * P5 + Norm[2] * P6) * Amp;
                    const C2x = Ex - Ax[0] * Len * 0.34 + (Lat[0] * P7 + Norm[0] * P8) * Amp;
                    const C2y = Ey - Ax[1] * Len * 0.34 + (Lat[1] * P7 + Norm[1] * P8) * Amp;
                    const C2z = Ez - Ax[2] * Len * 0.34 + (Lat[2] * P7 + Norm[2] * P8) * Amp;
                    const U = 1 - S, U2 = U * U, S2 = S * S;
                    const W0 = U2 * U, W1 = 3 * U2 * S, W2 = 3 * U * S2, W3 = S2 * S;
                    return [
                        W0 * Rx + W1 * C1x + W2 * C2x + W3 * Ex,
                        W0 * Ry + W1 * C1y + W2 * C2y + W3 * Ey,
                        W0 * Rz + W1 * C1z + W2 * C2z + W3 * Ez
                    ];
                };

                const WorldAt = (S, Id) =>
                {
                    const [Lx, Ly, Lz] = CurveLocal(S, Id);
                    let Wx = P.origin[0] + Lx * Sc, Wy = P.origin[1] + Lz * Sc, Wz = P.origin[2] + Ly * Sc;
                    if (Math.abs(WindMix) > 1e-4)
                    {
                        const Vel = SampleWind(Wx, Wy, Wz);
                        const K = 0.28 * WindMix * S * S;
                        Wx += Vel[0] * K; Wy += Vel[1] * K; Wz += Vel[2] * K;
                    }
                    return [Wx, Wy, Wz];
                };

                const ProjectAt = (S, Id) =>
                {
                    const [Wx, Wy, Wz] = WorldAt(S, Id);
                    return ProjectPoint(VP, Wx, Wy, Wz, W, H);
                };

                Ctx.save();
                Ctx.globalCompositeOperation = 'lighter';
                Ctx.lineCap = 'round';
                Ctx.lineJoin = 'round';
                const BaseWidth = Math.max(0.26, (F.thickness || 0.5) * 0.48);
                const Intensity = (F.intensity ?? 1.0) * Pulse;
                const Halo = F.halo ?? 0.14;
                const Bands = 3;

                for (let S = 0; S < DrawCount; S++)
                {
                    const Id = DrawCount === TotalStrands ? S : Math.floor((S / DrawCount) * TotalStrands);
                    const Role = Unit(Id, 19);
                    const IsGhost = Shape === 'blossom' && Role >= 0.28 && Role < 0.44;
                    const GhostMul = IsGhost ? 0.24 : 1.0;
                    const Vary = (0.45 + 0.85 * Unit(Id, 13)) * GhostMul;
                    const Pts = [];
                    for (let T = 0; T <= Segs; T++) Pts.push(ProjectAt(T / Segs, Id));

                    // 1. Subtle sculptural filament hairline (when baseline > 0.015)
                    if (Baseline > 0.015)
                    {
                        for (let B = 0; B < Bands; B++)
                        {
                            const T0 = Math.floor((B / Bands) * Segs);
                            const T1 = Math.min(Segs, Math.ceil(((B + 1) / Bands) * Segs));
                            const MidU = (B + 0.5) / Bands;
                            const RimMul = (Shape === 'blossom' && Role >= 0.44) ? (1 + 0.95 * Smooth(0.82, 0.99, MidU)) : 1.0;
                            const Fade = 1 - Taper + Taper * Math.pow(Math.max(0.05, Math.sin(MidU * Math.PI)), 0.5);
                            const BaseCol = ColourAt(MidU, Id);
                            const BandInt = (F.intensity ?? 1.0) * PulseAt(MidU);
                            Ctx.strokeStyle = LinearToCss(BaseCol, Math.min(0.42, BandInt * Baseline * Vary * RimMul * Fade * 1.35));
                            Ctx.lineWidth = Math.max(0.26, BaseWidth * 0.78);
                            Ctx.beginPath();
                            let Started = false;
                            for (let T = T0; T <= T1; T++)
                            {
                                const Pt = Pts[T];
                                if (!Pt) continue;
                                if (!Started) { Ctx.moveTo(Pt[0], Pt[1]); Started = true; } else Ctx.lineTo(Pt[0], Pt[1]);
                            }
                            if (Started) Ctx.stroke();
                        }
                    }

                    // 2. Luminous thin light streak traveling smoothly from curve start (0) to end (1)
                    const Cyc = (Unit(Id, 9) + Cycles * Lf) % 1;
                    const HeadS = Cyc * (1 + Win);
                    const SStart = Math.max(0, HeadS - Win);
                    const SEnd = Math.min(1, HeadS);
                    if (SEnd > SStart + 0.015)
                    {
                        const StreakSlices = 4;
                        const Span = SEnd - SStart;
                        for (let Sl = 0; Sl < StreakSlices; Sl++)
                        {
                            const A0 = SStart + (Sl / StreakSlices) * Span;
                            const A1 = SStart + ((Sl + 1) / StreakSlices) * Span;
                            const AMid = 0.5 * (A0 + A1);
                            const RimMul = (Shape === 'blossom' && Role >= 0.44) ? (1 + 0.95 * Smooth(0.82, 0.99, AMid)) : 1.0;
                            const TailFrac = Math.max(0, Math.min(1, 1 - (HeadS - AMid) / Math.max(Win, 0.01)));
                            const TaperFade = 1 - Taper + Taper * Math.pow(Math.max(0.05, Math.sin(AMid * Math.PI)), 0.5);
                            const StreakGain = Math.pow(TailFrac, 1.55) * TaperFade * (F.intensity ?? 1.0) * PulseAt(AMid) * Vary * RimMul;
                            const Col = ColourAt(AMid, Id);
                            const P0 = ProjectAt(A0, Id), P1 = ProjectAt(0.5 * (A0 + A1), Id), P2 = ProjectAt(A1, Id);
                            if (!P0 || !P1 || !P2) continue;

                            if (Halo > 0.02)
                            {
                                Ctx.strokeStyle = LinearToCss(Col, Math.min(0.40, StreakGain * Halo * 0.55));
                                Ctx.lineWidth = Math.max(0.75, BaseWidth * 2.0);
                                Ctx.beginPath();
                                Ctx.moveTo(P0[0], P0[1]); Ctx.lineTo(P1[0], P1[1]); Ctx.lineTo(P2[0], P2[1]);
                                Ctx.stroke();
                            }
                            Ctx.strokeStyle = LinearToCss(Col, Math.min(0.95, StreakGain * 0.85));
                            Ctx.lineWidth = Math.max(0.30, BaseWidth * (0.75 + 0.45 * TailFrac));
                            Ctx.beginPath();
                            Ctx.moveTo(P0[0], P0[1]); Ctx.lineTo(P1[0], P1[1]); Ctx.lineTo(P2[0], P2[1]);
                            Ctx.stroke();
                        }
                    }

                    // 3. Very small pinpoint particles & whisper-soft bokeh orbs gliding smoothly along the strand (0 -> 1)
                    if (Unit(Id, 11) <= (F.sparks ?? 0.8))
                    {
                        const RPick = Unit(Id, 24);
                        const SpMul = 0.65 + 0.70 * Unit(Id, 26);
                        const DriftS = (Unit(Id, 25) + Cycles * Lf * SpMul) % 1;
                        const Su = (RPick < 0.62 && HeadS <= 1) ? Math.max(0, Math.min(1, HeadS)) : DriftS;
                        const EndFade = Smooth(0, 0.04, Su) * (1 - Smooth(0.985, 1.0, Su));
                        if (EndFade > 0.01)
                        {
                            const IsBokeh = Unit(Id, 30) < (F.bokeh ?? 0);
                            const ScPt = ProjectAt(Su, Id);
                            if (ScPt)
                            {
                                const RawR = Math.max(0.50, Math.min(1.55, ((F.sparkSize || 0.012) * 78 * Sc) / ScPt[2]));
                                const R = IsBokeh ? Math.min(9.0, RawR * (2.6 + 1.8 * Unit(Id, 31))) : RawR;
                                const SpCol = (Shape === 'blossom' && !IsBokeh && Unit(Id, 33) < 0.18) ? [0.95, 0.24, 0.85, 1] : ColourAt(Su, Id);
                                const TipFlare = Shape === 'blossom' ? (1 + 0.9 * Smooth(0.75, 0.99, Su) * (Role < 0.28 ? 1.1 : 0.5)) : 1.0;
                                const Gain = Math.min(1, (F.sparkBrightness || 3) * PulseAt(Su) * TipFlare * (IsGhost && !IsBokeh ? 0.25 : 1.0) * EndFade * (0.24 + 0.25 * Unit(Id, 10)));
                                if (IsBokeh && Ctx.createRadialGradient)
                                {
                                    const Gr = Ctx.createRadialGradient(ScPt[0], ScPt[1], 0, ScPt[0], ScPt[1], R);
                                    Gr.addColorStop(0, LinearToCss(ColC, Gain * 0.06));
                                    Gr.addColorStop(0.7, LinearToCss(SpCol, Gain * 0.09));
                                    Gr.addColorStop(1, LinearToCss(SpCol, 0));
                                    Ctx.fillStyle = Gr;
                                }
                                else
                                {
                                    Ctx.fillStyle = LinearToCss(Unit(Id, 33) < 0.18 && Shape === 'blossom' ? SpCol : ColC, Gain * 0.92);
                                }
                                Ctx.beginPath();
                                Ctx.arc(ScPt[0], ScPt[1], R, 0, Math.PI * 2);
                                Ctx.fill();
                            }
                        }
                    }
                }
                Ctx.restore();
                Sys.stats_ = { alive: F.strands || 0, energy: 0, A: 0, B: 0, C: 0 };
                continue;
            }

            if (Job.simulate && Dt > 0)
            {
                const MaxSoft = Math.min(Sys.cap, 360);
                const Tr = P.transition;
                const AMode = Tr ? (Tr.assemble || 0) : 0;
                const BHx = P.boxHalf?.[0] || 0.8, BHy = P.boxHalf?.[1] || BHx, BHz = P.boxHalf?.[2] || BHx;

                if (Job.mol)
                {
                    if (Sys.particles.length < MaxSoft)
                    {
                        const InitSpd = Math.sqrt(12 * (P.temperature ?? 0.6)) * 0.45;
                        while (Sys.particles.length < MaxSoft)
                        {
                            Sys.particles.push({
                                x: P.origin[0] + (Math.random() * 2 - 1) * BHx * 0.9,
                                y: P.origin[1] + (Math.random() * 2 - 1) * BHy * 0.9,
                                z: P.origin[2] + (Math.random() * 2 - 1) * BHz * 0.9,
                                vx: (Math.random() - 0.5) * InitSpd, vy: (Math.random() - 0.5) * InitSpd, vz: (Math.random() - 0.5) * InitSpd,
                                age: 0, life: 1e9, seed: Math.random() * 65536, ang: 0, spin: 0, hold: 0, slotIdx: Sys.particles.length,
                                species: P.kind === 4 ? (Math.random() < (P.fracA ?? 0.5) ? 0 : 1) : 0
                            });
                        }
                    }
                    const Sig = P.sigma || 0.13;
                    const Eps = P.epsilon ?? 0.65;
                    const Gamma = P.damping ?? 1.5;
                    const Temp = P.temperature ?? 0.6;
                    const ReactR2 = Math.pow(P.reactRadius || (Sig * 1.45), 2);
                    const ReactP = Math.min(1, (P.reactRate || 0) * Dt * 0.45);
                    const DissocP = Math.min(1, (P.dissociation || 0) * Dt);
                    const N = Sys.particles.length;
                    const NoiseAmp = Math.sqrt(Math.max(0, 24 * Gamma * Temp * Dt)) * 0.35;

                    for (let I = 0; I < N; I++)
                    {
                        const A = Sys.particles[I];
                        let Fx = 0, Fy = 0, Fz = 0;
                        // Local neighbor interactions (LJ repulsion/attraction or chemical bond formation)
                        for (let J = I + 1; J < N; J++)
                        {
                            const B = Sys.particles[J];
                            const Dx = A.x - B.x, Dy = A.y - B.y, Dz = A.z - B.z;
                            const D2 = Dx * Dx + Dy * Dy + Dz * Dz;
                            if (D2 > (Sig * 2.5) ** 2 || D2 < 1e-8) continue;
                            const D = Math.sqrt(D2);
                            if (P.kind === 3)
                            {
                                const Sr2 = (Sig * Sig) / Math.max(D2, 0.16 * Sig * Sig);
                                const Sr6 = Sr2 * Sr2 * Sr2;
                                const Fm = Math.max(-90, Math.min(90, (24 * Eps * (2 * Sr6 * Sr6 - Sr6)) / Math.max(D2, 1e-4)));
                                Fx += Dx * Fm; Fy += Dy * Fm; Fz += Dz * Fm;
                                B.vx -= (Dx * Fm * Dt) * 0.08; B.vy -= (Dy * Fm * Dt) * 0.08; B.vz -= (Dz * Fm * Dt) * 0.08;
                            }
                            else
                            {
                                if (D < Sig)
                                {
                                    const KRep = ((Sig - D) / D) * 80;
                                    Fx += Dx * KRep; Fy += Dy * KRep; Fz += Dz * KRep;
                                }
                                if (D2 < ReactR2 && ((A.species === 0 && B.species === 1) || (A.species === 1 && B.species === 0)))
                                {
                                    if (Math.random() < ReactP) { A.species = 2; }
                                }
                            }
                        }
                        if (P.kind === 4 && A.species === 2 && Math.random() < DissocP)
                            A.species = Math.random() < 0.5 ? 0 : 1;

                        const DragKeep = Math.max(0, 1 - Gamma * Dt);
                        A.vx = A.vx * DragKeep + Fx * Dt * 0.08 + (Math.random() - 0.5) * NoiseAmp;
                        A.vy = A.vy * DragKeep + Fy * Dt * 0.08 + (Math.random() - 0.5) * NoiseAmp;
                        A.vz = A.vz * DragKeep + Fz * Dt * 0.08 + (Math.random() - 0.5) * NoiseAmp;
                        const VMag = Math.hypot(A.vx, A.vy, A.vz);
                        if (VMag > 6) { A.vx *= 6 / VMag; A.vy *= 6 / VMag; A.vz *= 6 / VMag; }
                        A.x += A.vx * Dt; A.y += A.vy * Dt; A.z += A.vz * Dt;
                        const Lx = A.x - P.origin[0], Ly = A.y - P.origin[1], Lz = A.z - P.origin[2];
                        if (Math.abs(Lx) > BHx) { A.x = P.origin[0] + Math.sign(Lx) * (2 * BHx - Math.abs(Lx)); A.vx *= -1; }
                        if (Math.abs(Ly) > BHy) { A.y = P.origin[1] + Math.sign(Ly) * (2 * BHy - Math.abs(Ly)); A.vy *= -1; }
                        if (Math.abs(Lz) > BHz) { A.z = P.origin[2] + Math.sign(Lz) * (2 * BHz - Math.abs(Lz)); A.vz *= -1; }
                        A.age += Dt;
                    }
                }
                else
                {
                    if (Job.emitN > 0)
                    {
                        if (Job.preseedCurtain) Sys.preseedCurtain = true;
                        const Basis = BasisFrom(P.dir || [0, 1, 0]);
                        const [Bu, Bv, Bw] = Basis;
                        const PerStepMax = Sys.preseedCurtain ? 260 : 28;
                        const SpawnCap = P.transition ? Math.min(MaxSoft - Sys.particles.length, Job.emitN) : Math.min(PerStepMax, Job.emitN, Math.max(0, MaxSoft - Sys.particles.length));
                        const CosMax = Math.cos(P.spread ?? 0.6);
                        const EmitSh = P.emitShape ?? 0;
                        const Rad = P.radius || 0.25;
                        for (let I = 0; I < SpawnCap; I++)
                        {
                            let Px = P.origin[0], Py = P.origin[1], Pz = P.origin[2];
                            if (EmitSh === 1)
                            {
                                const U1 = Math.random() * 2 - 1, A1 = Math.random() * Math.PI * 2;
                                const Sr = Math.sqrt(Math.max(0, 1 - U1 * U1));
                                const R = Rad * Math.cbrt(Math.random());
                                Px += Sr * Math.cos(A1) * R; Py += U1 * R; Pz += Sr * Math.sin(A1) * R;
                            }
                            else if (EmitSh === 2)
                            {
                                const A1 = Math.random() * Math.PI * 2, R = Rad * Math.sqrt(Math.random());
                                Px += Math.cos(A1) * R; Pz += Math.sin(A1) * R;
                            }
                            else if (EmitSh === 3)
                            {
                                Px += (Math.random() * 2 - 1) * BHx;
                                Py += (Math.random() * 2 - 1) * BHy;
                                Pz += (Math.random() * 2 - 1) * BHz;
                            }
                            else if (EmitSh === 4)
                            {
                                const SLoc = SurfaceLocal(I, MaxSoft);
                                Px += SLoc[0] * BHx; Py += SLoc[1] * BHy; Pz += SLoc[2] * BHz;
                            }

                            const CosT = 1 - Math.random() * (1 - CosMax);
                            const SinT = Math.sqrt(Math.max(0, 1 - CosT * CosT));
                            const Phi = Math.random() * Math.PI * 2;
                            const Lx = SinT * Math.cos(Phi), Ly = SinT * Math.sin(Phi), Lz = CosT;
                            const Spd = (P.speedMin || 0) + Math.random() * Math.max(0, (P.speedMax || 0) - (P.speedMin || 0));
                            let Vx = (Bu[0] * Lx + Bv[0] * Ly + Bw[0] * Lz) * Spd;
                            let Vy = (Bu[1] * Lx + Bv[1] * Ly + Bw[1] * Lz) * Spd;
                            let Vz = (Bu[2] * Lx + Bv[2] * Ly + Bw[2] * Lz) * Spd;
                            let Life = (P.lifeMin || 1) + Math.random() * Math.max(0.05, (P.lifeMax || 2) - (P.lifeMin || 1));
                            let Hold = 0, Sx0 = Px, Sy0 = Py, Sz0 = Pz;

                            if (P.kind === 5 && Tr && ((Tr.holdBase || 0) + (Tr.holdSpread || 0) > 0))
                            {
                                const SlotU = AMode === 1
                                    ? SurfaceLocal(I, MaxSoft).map(C => C * 0.5 + 0.5)
                                    : EmitSh === 4
                                        ? [Math.min(1, Math.max(0, ((Px - P.origin[0]) / Math.max(BHx, 1e-4)) * 0.5 + 0.5)),
                                           Math.min(1, Math.max(0, ((Py - P.origin[1]) / Math.max(BHy, 1e-4)) * 0.5 + 0.5)),
                                           Math.min(1, Math.max(0, ((Pz - P.origin[2]) / Math.max(BHz, 1e-4)) * 0.5 + 0.5))]
                                        : [0.5, 0.5, 0.5];
                                let Tc = AMode === 2 ? (I / Math.max(1, SpawnCap)) : ((EmitSh === 4 || AMode === 1) ? TransitionWaveT(SlotU, Tr.wave || 'corner') : Math.random());
                                const Jit = AMode === 2 ? 0 : 0.15 * Math.random();
                                Hold = (Tr.holdBase || 0) + (Tr.holdSpread || 0) * (Tc + Jit);
                                if (AMode === 0)
                                {
                                    Life = Hold + Life;
                                    if (Math.random() < (Tr.burstFrac ?? 1))
                                    {
                                        const Ox = Px - P.origin[0], Oy = Py - P.origin[1] + 0.35, Oz = Pz - P.origin[2];
                                        const Ol = Math.hypot(Ox, Oy, Oz) || 1;
                                        Vx = (Ox / Ol) * Spd; Vy = (Oy / Ol) * Spd; Vz = (Oz / Ol) * Spd;
                                    }
                                    else { Vx = Vy = Vz = 0; }
                                }
                                else
                                {
                                    Life = 10000;
                                    const ARad = Tr.assembleRadius || 3.5;
                                    if (AMode === 1)
                                    {
                                        const Dx = Math.random() * 2 - 1, Dy = Math.random() * 2 - 1 + 0.001, Dz = Math.random() * 2 - 1;
                                        const Dl = Math.hypot(Dx, Dy, Dz) || 1;
                                        const ScaleR = ARad * (0.8 + 0.4 * Math.random());
                                        Sx0 = P.origin[0] + (Dx / Dl) * ScaleR;
                                        Sy0 = P.origin[1] + (Dy / Dl) * ScaleR;
                                        Sz0 = P.origin[2] + (Dz / Dl) * ScaleR;
                                    }
                                    else
                                    {
                                        Sx0 = P.origin[0] + (Math.random() - 0.5) * 0.12;
                                        Sy0 = P.origin[1] + ARad;
                                        Sz0 = P.origin[2] + (Math.random() - 0.5) * 0.12;
                                    }
                                    Px = Sx0; Py = Sy0; Pz = Sz0;
                                    Vx = Sx0; Vy = Sy0; Vz = Sz0;
                                }
                            }

                            let SpawnY = Py;
                            let SpawnAge = 0;
                            if (Sys.preseedCurtain && I < SpawnCap - 1)
                            {
                                SpawnY = 0.65 + Math.random() * Math.max(1, P.origin[1] - 0.65);
                                SpawnAge = Math.random() * Life * 0.42;
                            }
                            Sys.particles.push({
                                x: Px, y: SpawnY, z: Pz, vx: Vx, vy: Vy, vz: Vz, sx0: Sx0, sy0: Sy0, sz0: Sz0,
                                age: SpawnAge, life: Life, hold: Hold, ang: Hold > 0 ? 0 : Math.random() * Math.PI * 2,
                                spin: (Math.random() - 0.5) * 4, seed: Math.random() * 65536, slotIdx: I, species: 0
                            });
                        }
                        if (Sys.preseedCurtain) Sys.preseedCurtain = false;
                    }

                    const Splashes = Sys.splashes || (Sys.splashes = []);
                    for (let SIdx = Splashes.length - 1; SIdx >= 0; SIdx--)
                    {
                        Splashes[SIdx].age += Dt;
                        if (Splashes[SIdx].age >= Splashes[SIdx].life) Splashes.splice(SIdx, 1);
                    }

                    const PShape = P.shape ?? 3;
                    const CheckVeh = !!(vehicle?.enabled && vehicle?.mesh && P.kind === 0 && !P.transition);
                    const NSoft = Sys.particles.length;
                    const Attr = P.attractor?.enabled ? P.attractor : null;
                    const Mag = P.magneticField || null;
                    const SwarmR = Math.max(0.1, P.swarmRadius || 0.8);
                    const SwarmMax = Math.max(0.05, P.swarmMaxSpeed || 2.0);

                    for (let I = NSoft - 1; I >= 0; I--)
                    {
                        const Pt = Sys.particles[I];
                        Pt.age += Dt;
                        if (Pt.age >= Pt.life) { Sys.particles.splice(I, 1); continue; }

                        if (P.kind === 5 && AMode > 0)
                        {
                            const Tgt = AMode === 2
                                ? [P.origin[0], P.origin[1] + (Pt.slotIdx + 0.5) * 0.2 * (P.sizeStart || 0.1) * (P.sizeScale || 1), P.origin[2]]
                                : (() => { const S = SurfaceLocal(Pt.slotIdx, MaxSoft); return [P.origin[0] + S[0] * BHx, P.origin[1] + S[1] * BHy, P.origin[2] + S[2] * BHz]; })();
                            if (AMode === 1)
                            {
                                const U = Math.min(1, Math.max(0, Pt.age / Math.max(Pt.hold, 1e-4)));
                                const E = U * U * (3 - 2 * U);
                                Pt.x = Pt.sx0 + (Tgt[0] - Pt.sx0) * E;
                                Pt.y = Pt.sy0 + (Tgt[1] - Pt.sy0) * E + 0.5 * Math.sin(Math.PI * U) * (1 - E);
                                Pt.z = Pt.sz0 + (Tgt[2] - Pt.sz0) * E;
                            }
                            else
                            {
                                const G = 9.81;
                                const Tf = Math.sqrt((2 * Math.max((Pt.sy0 ?? Pt.y) - Tgt[1], 0)) / G);
                                const Tau = Math.max(Pt.age - (Pt.hold - Tf), 0);
                                if (Tau < Tf)
                                {
                                    const K = Math.min(1, Math.max(0, Tau / Math.max(Tf, 1e-4)));
                                    Pt.x = Pt.sx0 + (Tgt[0] - Pt.sx0) * K;
                                    Pt.y = Pt.sy0 - 0.5 * G * Tau * Tau;
                                    Pt.z = Pt.sz0 + (Tgt[2] - Pt.sz0) * K;
                                }
                                else
                                {
                                    const B = Math.max(Pt.age - Pt.hold, 0);
                                    Pt.x = Tgt[0]; Pt.z = Tgt[2];
                                    Pt.y = Tgt[1] + 0.02 * Math.exp(-8 * B) * Math.abs(Math.sin(25 * B));
                                }
                            }
                            continue;
                        }

                        if (Pt.age < Pt.hold) { continue; }

                        if (P.kind === 6)
                        {
                            // Swarm boids (separation + alignment + cohesion + wander + leash + wind/forces)
                            let Sx = 0, Sy = 0, Sz = 0, Ax = 0, Ay = 0, Az = 0, Cx = 0, Cy = 0, Cz = 0, Nb = 0;
                            for (let J = 0; J < NSoft; J++)
                            {
                                if (J === I) continue;
                                const O = Sys.particles[J];
                                const Dx = Pt.x - O.x, Dy = Pt.y - O.y, Dz = Pt.z - O.z;
                                const D2 = Dx * Dx + Dy * Dy + Dz * Dz;
                                if (D2 > SwarmR * SwarmR || D2 < 1e-8) continue;
                                const D = Math.sqrt(D2);
                                const Rep = (1 - D / SwarmR) / D;
                                Sx += Dx * Rep; Sy += Dy * Rep; Sz += Dz * Rep;
                                Ax += O.vx; Ay += O.vy; Az += O.vz;
                                Cx += O.x; Cy += O.y; Cz += O.z;
                                Nb++;
                            }
                            let AccX = -(Pt.x - P.origin[0]) * 0.12, AccY = -(Pt.y - P.origin[1]) * 0.12, AccZ = -(Pt.z - P.origin[2]) * 0.12;
                            if (Nb > 0)
                            {
                                AccX += Sx * 3.0 + (Ax / Nb - Pt.vx) * 1.5 + (Cx / Nb - Pt.x) * 0.8;
                                AccY += Sy * 3.0 + (Ay / Nb - Pt.vy) * 1.5 + (Cy / Nb - Pt.y) * 0.8;
                                AccZ += Sz * 3.0 + (Az / Nb - Pt.vz) * 1.5 + (Cz / Nb - Pt.z) * 0.8;
                            }
                            const Tt = Time * 0.9 + Pt.seed * 0.37;
                            const Flut = P.flutter || 0;
                            AccX += Math.sin(Tt * 1.3 + Pt.seed) * Flut;
                            AccY += 0.5 * Math.sin(Tt * 0.7 + Pt.seed * 2.1) * Flut;
                            AccZ += Math.cos(Tt * 1.1 + Pt.seed * 0.7) * Flut;
                            Pt.vx += AccX * Dt; Pt.vy += AccY * Dt; Pt.vz += AccZ * Dt;
                            const Sp = Math.hypot(Pt.vx, Pt.vy, Pt.vz);
                            if (Sp > SwarmMax) { Pt.vx *= SwarmMax / Sp; Pt.vy *= SwarmMax / Sp; Pt.vz *= SwarmMax / Sp; }
                        }

                        let ForceMag = 0;
                        let ForceUp = 0;
                        if (fieldScene && Prepared && PE.Forces?.EvaluateAllPrepared)
                        {
                            const F = PE.Forces.EvaluateAllPrepared(fieldScene, Prepared, Pt.x, Pt.y, Pt.z, 0.5, Solo, 'Particles');
                            const FlowMag = Math.hypot(F.Velocity[0], F.Velocity[1], F.Velocity[2]) * WindScale;
                            const AccMag = Math.hypot(F.Acceleration[0], F.Acceleration[1], F.Acceleration[2]);
                            ForceMag = FlowMag + AccMag;
                            ForceUp = F.Velocity[1] * WindScale + F.Acceleration[1];
                            const CGain = PShape === 7 ? 1.35 : 1.0;
                            const Coup = Math.min(1, (P.windCoupling || 0) * CGain * Dt);
                            const CoupEff = (FlowMag > 0.05 || P.kind !== 0) ? Coup : Coup * 0.12;
                            const AccelGain = PShape === 7 ? 2.4 : (PShape === 0 && (P.gravity || 0) > 0.4 ? 1.35 : 1.0);
                            Pt.vx += (F.Velocity[0] * WindScale - Pt.vx) * CoupEff + F.Acceleration[0] * AccelGain * Dt;
                            Pt.vy += (F.Velocity[1] * WindScale - Pt.vy) * CoupEff + (F.Acceleration[1] * AccelGain + (P.buoyancy || 0) - (P.gravity || 0) * 9.81) * Dt;
                            Pt.vz += (F.Velocity[2] * WindScale - Pt.vz) * CoupEff + F.Acceleration[2] * AccelGain * Dt;
                            const Keep = Math.exp(-(P.drag || 0) * Dt) * Math.exp(-(F.Damping || 0) * Dt);
                            Pt.vx *= Keep; Pt.vy *= Keep; Pt.vz *= Keep;
                        }
                        else
                        {
                            const Wind = SampleWind(Pt.x, Pt.y, Pt.z);
                            ForceMag = Math.hypot(Wind[0], Wind[1], Wind[2]);
                            ForceUp = Wind[1];
                            const CGain = PShape === 7 ? 1.35 : 1.0;
                            const Coup = Math.min(1, (P.windCoupling || 0) * CGain * Dt);
                            Pt.vx += (Wind[0] - Pt.vx) * Coup;
                            Pt.vy += (Wind[1] - Pt.vy) * Coup + ((P.buoyancy || 0) - (P.gravity || 0) * 9.81) * Dt;
                            Pt.vz += (Wind[2] - Pt.vz) * Coup;
                            const Damp = Math.exp(-(P.drag || 0) * Dt);
                            Pt.vx *= Damp; Pt.vy *= Damp; Pt.vz *= Damp;
                        }

                        if (Attr)
                        {
                            const Rx = P.origin[0] - Pt.x, Ry = P.origin[1] - Pt.y, Rz = P.origin[2] - Pt.z;
                            const D = Math.hypot(Rx, Ry, Rz);
                            if (D < (Attr.swallow || 0)) { Sys.particles.splice(I, 1); continue; }
                            if (D > 1e-4 && D < (Attr.radius || 16))
                            {
                                const SmoothW = 1 - Smooth(0, Attr.radius || 16, D);
                                const Fall = SmoothW * SmoothW * (3 - 2 * SmoothW);
                                const Pull = ((Attr.strength || 7) * Fall) / Math.max(D, 0.25);
                                Pt.vx += (Rx / D) * Pull * Dt; Pt.vy += (Ry / D) * Pull * Dt; Pt.vz += (Rz / D) * Pull * Dt;
                                const Tx = -Rz, Tz = Rx, Tl = Math.hypot(Tx, Tz) || 1;
                                Pt.vx += (Tx / Tl) * (Attr.swirl || 0) * Fall * Dt;
                                Pt.vz += (Tz / Tl) * (Attr.swirl || 0) * Fall * Dt;
                            }
                        }

                        if (Mag)
                        {
                            const Rx = Pt.x - P.origin[0], Ry = Pt.y - P.origin[1], Rz = Pt.z - P.origin[2];
                            const R2 = Rx * Rx + Ry * Ry + Rz * Rz;
                            const R = Math.sqrt(R2);
                            if (R > 1e-4 && R < (Mag.radius || 6))
                            {
                                const SmoothW = 1 - Smooth(0, Mag.radius || 6, R);
                                const Fall = SmoothW * SmoothW * (3 - 2 * SmoothW);
                                const InvR3 = 1 / Math.max(R2 * R, 0.08);
                                const Coef = 3 * Ry * InvR3 / Math.max(R2, 0.08);
                                const Bx = Coef * Rx, By = (3 * Ry * Ry / Math.max(R2, 0.08) - 1) * InvR3, Bz = Coef * Rz;
                                const Bl = Math.hypot(Bx, By, Bz) || 1;
                                const Guide = Mag.guide ?? 2;
                                Pt.vx += ((Bx / Bl) * (Mag.strength || 3) * Fall - Pt.vx * Guide * 0.25 * Fall) * Dt;
                                Pt.vy += ((By / Bl) * (Mag.strength || 3) * Fall - Pt.vy * Guide * 0.25 * Fall) * Dt;
                                Pt.vz += ((Bz / Bl) * (Mag.strength || 3) * Fall - Pt.vz * Guide * 0.25 * Fall) * Dt;
                            }
                        }

                        if (P.flutter > 0 && P.kind !== 6)
                        {
                            const Ph = Pt.age * 2.7 + Pt.seed * 0.013;
                            Pt.vx += Math.sin(Ph) * P.flutter * Dt;
                            Pt.vy += 0.25 * Math.cos(Ph * 1.3) * P.flutter * Dt;
                            Pt.vz += Math.cos(Ph * 0.8 + 1) * P.flutter * Dt;
                        }

                        Pt.x += Pt.vx * Dt; Pt.y += Pt.vy * Dt; Pt.z += Pt.vz * Dt;
                        Pt.ang += Pt.spin * Dt;

                        if (CheckVeh && Pt.vy < 0 && Pt.y < 2.2)
                        {
                            const Surf = SampleVehicleSurface(vehicle.mesh, vehicle.state, Pt.x, Pt.y, Pt.z);
                            if (Surf)
                            {
                                Pt.y = Surf.worldY + 0.015;
                                const [Nx, Ny, Nz] = Surf.normal;
                                if (PShape === 7)
                                {
                                    if (ForceUp > 0.35 || ForceMag > 1.8)
                                    {
                                        Pt.y += 0.03;
                                        Pt.vy = Math.max(0.15, Math.min(3.5, ForceUp * 0.45 + ForceMag * 0.12));
                                    }
                                    else
                                    {
                                        const Slip = ForceMag >= 0.35 ? 0.96 : 0.80;
                                        Pt.vx *= Slip; Pt.vy = 0; Pt.vz *= Slip; Pt.spin *= 0.35;
                                    }
                                }
                                else
                                {
                                    const Vn = Pt.vx * Nx + Pt.vy * Ny + Pt.vz * Nz;
                                    if (Vn < 0)
                                    {
                                        if (PShape === 0 && Splashes.length < 96 && Pt.vy < -2.4 && Math.random() < 0.32)
                                            Splashes.push({ x: Pt.x, y: Surf.worldY + 0.014, z: Pt.z, age: 0, life: 0.22, r: 0.13 });
                                        const Rest = PShape === 8 ? Math.max(0.38, P.bounce || 0.58) : Math.max(0.20, P.bounce || 0.25);
                                        Pt.vx = (Pt.vx - (1 + Rest) * Vn * Nx) * 0.86;
                                        Pt.vy = Math.max(0.22, (Pt.vy - (1 + Rest) * Vn * Ny) * 0.86);
                                        Pt.vz = (Pt.vz - (1 + Rest) * Vn * Nz) * 0.86;
                                    }
                                }
                            }
                        }

                        if (Pt.y < 0.02)
                        {
                            Pt.y = 0.02;
                            if (PShape === 0 && (P.gravity || 0) > 0.4 && Pt.vy < -2.4 && Splashes.length < 96 && Math.random() < 0.35)
                                Splashes.push({ x: Pt.x, y: 0.014, z: Pt.z, age: 0, life: 0.28, r: 0.18 });
                            if (PShape === 7)
                            {
                                if (ForceUp > 0.35 || ForceMag > 1.8)
                                {
                                    Pt.y = 0.035;
                                    Pt.vy = Math.max(0.15, Math.min(3.5, ForceUp * 0.45 + ForceMag * 0.12));
                                }
                                else
                                {
                                    const Slip = ForceMag >= 0.35 ? 0.96 : 0.80;
                                    Pt.vx *= Slip; Pt.vy = 0; Pt.vz *= Slip; Pt.spin *= 0.35;
                                }
                            }
                            else if (P.kind === 1) { Pt.vx *= 0.55; Pt.vy = 0; Pt.vz *= 0.55; }
                            else if (P.bounce > 0) { Pt.vy = Math.abs(Pt.vy) * P.bounce; Pt.vx *= 0.72; Pt.vz *= 0.72; }
                            else if (P.transition) { Pt.vx *= 0.5; Pt.vy = 0; Pt.vz *= 0.5; }
                        }
                    }
                }
                const Ratio = Math.min(1, Sys.particles.length / 360);
                const EstAlive = Job.mol ? Sys.cap : Math.round(Ratio * Math.min(Sys.cap, (P.rate || 120) * ((P.lifeMin + P.lifeMax) * 0.5) + Sys.particles.length));
                const SpecCounts = Job.mol ? Sys.particles.reduce((Acc, S) => { Acc[S.species || 0]++; return Acc; }, [0, 0, 0]) : [0, 0, 0];
                const ScaleMol = Job.mol && Sys.particles.length ? Sys.cap / Sys.particles.length : 1;
                Sys.stats_ = {
                    alive: Math.max(Sys.particles.length, Math.min(Sys.cap, EstAlive)),
                    energy: (P.temperature || 0.6) * 3 * Sys.cap,
                    A: Job.mol ? Math.round(SpecCounts[0] * ScaleMol) : 0,
                    B: Job.mol ? Math.round(SpecCounts[1] * ScaleMol) : 0,
                    C: Job.mol ? Math.round(SpecCounts[2] * ScaleMol) : 0
                };
                Sys.readbackCount++;
            }

            if (Job.draw)
            {
                const Additive = !Job.alpha;
                if (Additive) Ctx.globalCompositeOperation = 'lighter';
                const Shape = P.shape ?? 3;
                const SmoothT = (A, B, X) => { const U = Math.min(1, Math.max(0, (X - A) / Math.max(1e-5, B - A))); return U * U * (3 - 2 * U); };
                for (const Pt of Sys.particles)
                {
                    const Sc = ProjectPoint(VP, Pt.x, Pt.y, Pt.z, W, H);
                    if (!Sc) continue;
                    const T = Job.mol ? 0 : Math.min(1, Pt.age / Math.max(0.01, Pt.life));
                    let Col;
                    if (P.kind === 3)
                    {
                        const VNorm = Math.min(1, Math.hypot(Pt.vx, Pt.vy, Pt.vz) / 1.2);
                        Col = [0, 1, 2, 3].map(I => P.colA[I] * (1 - VNorm) + P.colB[I] * VNorm);
                    }
                    else if (P.kind === 4)
                    {
                        Col = Pt.species === 2 ? (P.colC || P.colB) : (Pt.species === 1 ? P.colB : P.colA);
                    }
                    else
                    {
                        Col = [0, 1, 2, 3].map(I => P.colA[I] * (1 - T) + P.colB[I] * T);
                    }
                    const BaseWorldSize = Job.mol
                        ? (P.sigma || 0.13) * (P.sizeScale || 1)
                        : ((P.sizeStart * (1 - T) + P.sizeEnd * T) * (P.sizeScale || 1));
                    const R = Math.max(1.8, Math.min(22, (BaseWorldSize * 180) / Sc[2]));
                    let Alpha = Job.mol ? 0.92 : (SmoothT(0, 0.08, T) * (1 - SmoothT(0.7, 1, T)) * (Col[3] ?? 1));
                    if (P.kind === 6 && (P.pulseDepth || 0) > 0)
                    {
                        const Pulse = 1 - (P.pulseDepth || 0) + (P.pulseDepth || 0) * (0.5 + 0.5 * Math.sin(Time * (P.pulseHz || 0.8) * Math.PI * 2 + (Pt.seed || 0)));
                        Alpha *= Pulse;
                    }
                    if (Pt.hold > 0 && Pt.age < Pt.hold) Alpha = Col[3] ?? 1;
                    if (Alpha <= 0.005) continue;

                    if (P.transition?.after === 'butterfly' && Pt.age >= Pt.hold && Ctx.ellipse)
                    {
                        const Flap = 0.25 + 0.75 * Math.abs(Math.cos(Pt.age * 11 + Pt.seed));
                        Ctx.fillStyle = LinearToCss(Col, Alpha);
                        Ctx.beginPath();
                        Ctx.ellipse(Sc[0] - R * 0.45 * Flap, Sc[1], Math.max(1, R * 0.65 * Flap), R * 0.85, -0.35, 0, Math.PI * 2);
                        Ctx.ellipse(Sc[0] + R * 0.45 * Flap, Sc[1], Math.max(1, R * 0.65 * Flap), R * 0.85, 0.35, 0, Math.PI * 2);
                        Ctx.fill();
                        continue;
                    }

                    if (Shape === 0)
                    {
                        const ScTail = ProjectPoint(VP, Pt.x - Pt.vx * 0.055, Pt.y - Pt.vy * 0.055, Pt.z - Pt.vz * 0.055, W, H);
                        if (ScTail && Math.hypot(Sc[0] - ScTail[0], Sc[1] - ScTail[1]) > 1.2)
                        {
                            Ctx.save();
                            Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.85);
                            Ctx.lineWidth = Math.max(1.1, R * 0.52);
                            Ctx.lineCap = 'round';
                            Ctx.beginPath(); Ctx.moveTo(ScTail[0], ScTail[1]); Ctx.lineTo(Sc[0], Sc[1]); Ctx.stroke();
                            Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.45).toFixed(3)})`;
                            Ctx.lineWidth = Math.max(0.55, R * 0.22);
                            Ctx.beginPath(); Ctx.moveTo(ScTail[0], ScTail[1]); Ctx.lineTo(Sc[0], Sc[1]); Ctx.stroke();
                            Ctx.restore();
                            continue;
                        }
                    }
                    else if (Shape === 2)
                    {
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        Ctx.rotate(Pt.ang || 0);
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.92);
                        Ctx.fillRect(-R * 0.7, -R * 0.38, R * 1.4, R * 0.76);
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 4)
                    {
                        const Side = Math.max(2.5, R * 1.15);
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        Ctx.rotate(Pt.ang || 0);
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.95);
                        Ctx.fillRect(-Side * 0.5, -Side * 0.5, Side, Side);
                        Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.25).toFixed(3)})`;
                        Ctx.lineWidth = 0.8;
                        Ctx.strokeRect(-Side * 0.5, -Side * 0.5, Side, Side);
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 5)
                    {
                        const SpinW = Math.max(1.2, R * (0.25 + 0.75 * Math.abs(Math.cos(Pt.ang || 0))));
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.95);
                        Ctx.beginPath();
                        if (Ctx.ellipse) Ctx.ellipse(Sc[0], Sc[1], SpinW, R * 0.95, 0, 0, Math.PI * 2);
                        else Ctx.arc(Sc[0], Sc[1], R * 0.9, 0, Math.PI * 2);
                        Ctx.fill();
                        Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.45).toFixed(3)})`;
                        Ctx.lineWidth = 1;
                        Ctx.stroke();
                        continue;
                    }
                    else if (Shape === 6)
                    {
                        Ctx.strokeStyle = LinearToCss(Col, Math.min(1, Alpha * 0.9));
                        Ctx.lineWidth = 1.25;
                        Ctx.beginPath();
                        Ctx.arc(Sc[0], Sc[1], R, 0, Math.PI * 2);
                        Ctx.stroke();
                        Ctx.fillStyle = `rgba(255,255,255,${(Alpha * 0.55).toFixed(3)})`;
                        Ctx.beginPath();
                        Ctx.arc(Sc[0] - R * 0.35, Sc[1] - R * 0.35, Math.max(1, R * 0.2), 0, Math.PI * 2);
                        Ctx.fill();
                        continue;
                    }
                    else if (Shape === 7)
                    {
                        const Rad = Math.max(2.2, R * 1.15);
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        Ctx.rotate(Pt.ang || 0);
                        Ctx.strokeStyle = LinearToCss(Col, Math.min(1, Alpha * 0.96));
                        Ctx.lineWidth = Math.max(0.9, Rad * 0.20);
                        Ctx.lineCap = 'round';
                        Ctx.beginPath();
                        for (let K = 0; K < 3; K++)
                        {
                            const A = (K * Math.PI) / 3;
                            const Cx = Math.cos(A) * Rad, Cy = Math.sin(A) * Rad;
                            Ctx.moveTo(-Cx, -Cy); Ctx.lineTo(Cx, Cy);
                            if (Rad >= 3.4)
                            {
                                const Bx0 = Math.cos(A) * Rad * 0.56, By0 = Math.sin(A) * Rad * 0.56;
                                const A1 = A + 0.65, A2 = A - 0.65, BLen = Rad * 0.36;
                                Ctx.moveTo(Bx0, By0); Ctx.lineTo(Bx0 + Math.cos(A1) * BLen, By0 + Math.sin(A1) * BLen);
                                Ctx.moveTo(Bx0, By0); Ctx.lineTo(Bx0 + Math.cos(A2) * BLen, By0 + Math.sin(A2) * BLen);
                                Ctx.moveTo(-Bx0, -By0); Ctx.lineTo(-Bx0 - Math.cos(A1) * BLen, -By0 - Math.sin(A1) * BLen);
                                Ctx.moveTo(-Bx0, -By0); Ctx.lineTo(-Bx0 - Math.cos(A2) * BLen, -By0 - Math.sin(A2) * BLen);
                            }
                        }
                        Ctx.stroke();
                        Ctx.fillStyle = `rgba(255,255,255,${(Alpha * 0.65).toFixed(3)})`;
                        Ctx.beginPath();
                        Ctx.arc(0, 0, Math.max(0.8, Rad * 0.24), 0, Math.PI * 2);
                        Ctx.fill();
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 8)
                    {
                        const Rad = Math.max(2.0, R * 0.96);
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        Ctx.rotate(Pt.ang || 0);
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.84);
                        Ctx.beginPath();
                        for (let S = 0; S < 6; S++)
                        {
                            const A = (S * Math.PI) / 3;
                            const FacR = Rad * (S % 2 === 0 ? 1.0 : 0.88);
                            const Vx = Math.cos(A) * FacR, Vy = Math.sin(A) * FacR;
                            if (S === 0) Ctx.moveTo(Vx, Vy); else Ctx.lineTo(Vx, Vy);
                        }
                        Ctx.closePath();
                        Ctx.fill();
                        Ctx.strokeStyle = `rgba(215, 242, 255, ${(Alpha * 0.82).toFixed(3)})`;
                        Ctx.lineWidth = 0.95;
                        Ctx.stroke();
                        Ctx.fillStyle = `rgba(255, 255, 255, ${(Alpha * 0.88).toFixed(3)})`;
                        Ctx.beginPath();
                        Ctx.arc(-Rad * 0.28, -Rad * 0.30, Math.max(0.75, Rad * 0.24), 0, Math.PI * 2);
                        Ctx.fill();
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 3 && Ctx.createRadialGradient)
                    {
                        const Grad = Ctx.createRadialGradient(Sc[0], Sc[1], 0, Sc[0], Sc[1], R);
                        Grad.addColorStop(0, LinearToCss(Col, Alpha * 0.95));
                        Grad.addColorStop(1, LinearToCss(Col, 0));
                        Ctx.fillStyle = Grad;
                        Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], R, 0, Math.PI * 2); Ctx.fill();
                        continue;
                    }

                    Ctx.fillStyle = LinearToCss(Col, Alpha);
                    Ctx.beginPath();
                    Ctx.arc(Sc[0], Sc[1], R, 0, Math.PI * 2);
                    Ctx.fill();
                }

                // Ground & vehicle roof splash rings for Rain streaks
                if (Sys.splashes?.length)
                {
                    for (const Sp of Sys.splashes)
                    {
                        const Prog = Math.min(1, Sp.age / Math.max(0.01, Sp.life));
                        const Ctr = ProjectPoint(VP, Sp.x, Sp.y, Sp.z, W, H);
                        if (!Ctr) continue;
                        const Rx = Math.max(1.5, ((Sp.r * (0.25 + 0.95 * Prog)) * 180) / Ctr[2]);
                        const Fade = (1 - Prog) * 0.65;
                        Ctx.strokeStyle = `rgba(196, 232, 255, ${Fade.toFixed(3)})`;
                        Ctx.lineWidth = 1.05;
                        Ctx.beginPath();
                        if (Ctx.ellipse) Ctx.ellipse(Ctr[0], Ctr[1], Rx, Rx * 0.42, 0, 0, Math.PI * 2);
                        else Ctx.arc(Ctr[0], Ctr[1], Rx, 0, Math.PI * 2);
                        Ctx.stroke();
                    }
                }
                Ctx.globalCompositeOperation = 'source-over';
            }
        }

        // Draw Lightning bolts when active
        if (segCount > 0 && segData)
        {
            Ctx.globalCompositeOperation = 'lighter';
            Ctx.strokeStyle = 'rgba(182, 214, 255, 0.92)';
            Ctx.lineWidth = 2.1;
            Ctx.beginPath();
            for (let I = 0; I < segCount; I++)
            {
                const O = I * 8;
                const A = ProjectPoint(VP, segData[O], segData[O + 1], segData[O + 2], W, H);
                const B = ProjectPoint(VP, segData[O + 4], segData[O + 5], segData[O + 6], W, H);
                if (A && B) { Ctx.moveTo(A[0], A[1]); Ctx.lineTo(B[0], B[1]); }
            }
            Ctx.stroke();
            Ctx.globalCompositeOperation = 'source-over';
        }

        // Camera Visual Effects & Lens Distortion fallback (Black Hole, Heat Distortion, Exposure/Contrast, Bloom, Vignette, Glitch)
        if (lensCount > 0 && lens && lens.length >= 64)
        {
            const Holes = Math.round(lens[8] || 0);
            const Shimmers = Math.round(lens[11] || 0);
            const RingGlow = lens[10] || 0.35;
            const ExpGain = lens[44] ?? 1.0;
            const Contrast = lens[45] ?? 1.0;
            const Sat = lens[46] ?? 1.0;
            const Vignette = lens[47] ?? 0;
            const Chromatic = lens[48] ?? 0;
            const Bloom = lens[49] ?? 0;
            const GlobalHeatStr = lens[50] ?? 0;
            const GlobalHeatPhase = lens[51] ?? 0;
            const GlobalHeatFreq = lens[52] ?? 14;
            const GlobalHeatHorizon = lens[53] ?? 0;
            const GlobalGlitchAmt = lens[54] ?? 0;
            const FxTime = lens[55] ?? Time;

            // Up to 4 Localized Heat Shimmer plumes (sh0..sh7) around heat/fire particles
            for (let K = 0; K < Math.min(4, Shimmers); K++)
            {
                const Base = 12 + K * 8;
                const Cx = lens[Base] * W, Cy = lens[Base + 1] * H;
                const RadPx = Math.max(18, lens[Base + 2] * H);
                const Str = lens[Base + 3] || 0.02;
                const Phase = lens[Base + 4] || 0;
                const Freq = lens[Base + 5] || 14;
                Ctx.save();
                Ctx.strokeStyle = `rgba(255, 198, 132, ${Math.min(0.45, Str * 8).toFixed(3)})`;
                Ctx.lineWidth = 1.25;
                for (let Band = -3; Band <= 3; Band++)
                {
                    const Y0 = Cy + (Band / 4) * RadPx * 0.72;
                    const SpanX = Math.sqrt(Math.max(0, RadPx * RadPx - (Y0 - Cy) * (Y0 - Cy))) * 0.85;
                    Ctx.beginPath();
                    for (let S = 0; S <= 14; S++)
                    {
                        const U = S / 14;
                        const X = Cx - SpanX + U * SpanX * 2;
                        const Y = Y0 + Math.sin(U * Freq * 0.5 + Phase * 3.0 + Band) * (3 + Str * 180);
                        if (S === 0) Ctx.moveTo(X, Y);
                        else Ctx.lineTo(X, Y);
                    }
                    Ctx.stroke();
                }
                Ctx.restore();
            }

            // Global / Horizon Heat Distortion atmospheric convective shimmer lines
            if (GlobalHeatStr > 0.0005)
            {
                Ctx.save();
                Ctx.strokeStyle = `rgba(255, 210, 152, ${Math.min(0.28, GlobalHeatStr * 6.5).toFixed(3)})`;
                Ctx.lineWidth = 1.1;
                const TopY = H * Math.max(0.08, GlobalHeatHorizon * 0.65);
                for (let Row = 0; Row < 10; Row++)
                {
                    const T = Row / 9;
                    const YBase = TopY + T * (H - TopY - 12);
                    const Amp = (2 + GlobalHeatStr * 220) * (0.35 + 0.65 * T);
                    Ctx.beginPath();
                    for (let C = 0; C <= 24; C++)
                    {
                        const U = C / 24;
                        const X = U * W;
                        const Y = YBase + Math.sin(U * GlobalHeatFreq * 0.8 + GlobalHeatPhase * 2.4 + Row * 1.3) * Amp;
                        if (C === 0) Ctx.moveTo(X, Y);
                        else Ctx.lineTo(X, Y);
                    }
                    Ctx.stroke();
                }
                Ctx.restore();
            }

            // Black Hole singularities: Einstein distortion ring + photon ring + black event horizon
            for (let K = 0; K < Math.min(2, Holes); K++)
            {
                const Base = K * 4;
                const Cx = lens[Base] * W, Cy = lens[Base + 1] * H;
                const E = Math.max(0, lens[Base + 2] * H);
                const HorizonR = Math.max(8, lens[Base + 3] * H);
                const EinsteinR = Math.max(HorizonR * 1.45, HorizonR + E * 0.55);
                const Ring = Ctx.createRadialGradient(Cx, Cy, HorizonR * 0.85, Cx, Cy, EinsteinR * 1.45);
                Ring.addColorStop(0, 'rgba(0, 0, 0, 1)');
                Ring.addColorStop(0.25, `rgba(255, 184, 102, ${Math.min(0.9, RingGlow).toFixed(2)})`);
                Ring.addColorStop(0.55, 'rgba(255, 138, 66, 0.22)');
                Ring.addColorStop(1, 'rgba(0, 0, 0, 0)');
                Ctx.fillStyle = Ring;
                Ctx.beginPath();
                Ctx.arc(Cx, Cy, EinsteinR * 1.45, 0, Math.PI * 2);
                Ctx.fill();

                Ctx.fillStyle = '#030305';
                Ctx.beginPath();
                Ctx.arc(Cx, Cy, HorizonR, 0, Math.PI * 2);
                Ctx.fill();

                Ctx.strokeStyle = `rgba(255, 196, 118, ${Math.min(0.95, 0.35 + RingGlow).toFixed(2)})`;
                Ctx.lineWidth = 1.6;
                Ctx.beginPath();
                Ctx.arc(Cx, Cy, HorizonR * 1.28, 0, Math.PI * 2);
                Ctx.stroke();
            }

            // Localized Glitch particle regions (gl0, gl1) + optional Full-Frame Glitch & Chromatic aberration
            const Step = Math.floor(FxTime * 14);
            for (let G = 0; G < 2; G++)
            {
                const Base = 56 + G * 4;
                const Amt = lens[Base + 3] || 0;
                if (Amt <= 0.005) continue;
                const Cx = lens[Base] * W, Cy = lens[Base + 1] * H;
                const RadPx = Math.max(22, (lens[Base + 2] || 0.12) * H);
                for (let B = 0; B < 5; B++)
                {
                    const Hash = Math.abs(Math.sin((B + 1 + G * 7) * 73.1 + Step * 13.7));
                    const BandY = Cy + (Hash - 0.5) * RadPx * 1.6;
                    const BandW = RadPx * (0.8 + Hash * 0.9);
                    const BandX = Cx - BandW * 0.5 + (Hash - 0.5) * 28 * Amt;
                    Ctx.fillStyle = B % 2 ? `rgba(0, 255, 208, ${(Amt * 0.24).toFixed(3)})` : `rgba(255, 45, 111, ${(Amt * 0.24).toFixed(3)})`;
                    Ctx.fillRect(BandX, BandY, BandW, 3 + Hash * 5);
                }
            }
            if (GlobalGlitchAmt > 0.01)
            {
                for (let B = 0; B < 5; B++)
                {
                    const Hash = Math.abs(Math.sin((B + 1) * 91.7 + Step * 17.3));
                    if (Hash > 1 - GlobalGlitchAmt * 0.6)
                    {
                        const Gy = ((Hash * 19.7) % 1) * H;
                        Ctx.fillStyle = B % 2 ? `rgba(0, 255, 208, ${(GlobalGlitchAmt * 0.16).toFixed(3)})` : `rgba(255, 45, 111, ${(GlobalGlitchAmt * 0.16).toFixed(3)})`;
                        Ctx.fillRect(0, Gy, W, 3 + (Hash * 8));
                    }
                }
            }
            if (Chromatic > 0.01)
            {
                Ctx.strokeStyle = `rgba(255, 82, 118, ${(Chromatic * 0.24).toFixed(3)})`;
                Ctx.lineWidth = 4 + Chromatic * 6;
                Ctx.strokeRect(2, 2, W - 4, H - 4);
            }

            // Multi-scale optical Bloom composite (threshold-gated multi-radius Canvas2D blur passes + headless fallback)
            const BloomThreshold = lens.length >= 68 ? (lens[64] ?? 0.42) : 0.42;
            const BloomRadius = lens.length >= 68 ? Math.max(0.3, lens[65] ?? 1.15) : 1.15;
            const BloomOn = lens.length >= 68 ? (lens[67] ?? 1) > 0.1 : true;
            if (BloomOn && Bloom > 0.005)
            {
                if (typeof document !== 'undefined' && typeof Ctx.drawImage === 'function' && W > 8 && H > 8)
                {
                    const BW = Math.max(64, Math.floor(W * 0.5));
                    const BH = Math.max(64, Math.floor(H * 0.5));
                    if (!this._bloomCanvas)
                    {
                        this._bloomCanvas = document.createElement('canvas');
                        this._bloomCtx = this._bloomCanvas?.getContext?.('2d') || null;
                    }
                    const BCtx = this._bloomCtx;
                    if (BCtx && typeof BCtx.drawImage === 'function' && typeof BCtx.clearRect === 'function')
                    {
                        if (this._bloomCanvas.width !== BW || this._bloomCanvas.height !== BH)
                        {
                            this._bloomCanvas.width = BW;
                            this._bloomCanvas.height = BH;
                        }
                        BCtx.clearRect(0, 0, BW, BH);
                        const GainB = Math.max(0.32, 1.18 - BloomThreshold * 0.72);
                        const ContrastB = (1.12 + BloomThreshold * 1.35).toFixed(2);
                        BCtx.filter = `brightness(${GainB.toFixed(2)}) contrast(${ContrastB})`;
                        BCtx.drawImage(this.canvas, 0, 0, BW, BH);
                        BCtx.filter = 'none';

                        Ctx.save();
                        Ctx.globalCompositeOperation = 'lighter';
                        Ctx.filter = `blur(${Math.max(2, Math.round(3 * BloomRadius))}px)`;
                        Ctx.globalAlpha = Math.min(0.92, Bloom * 0.62);
                        Ctx.drawImage(this._bloomCanvas, 0, 0, W, H);
                        Ctx.filter = `blur(${Math.max(4, Math.round(9 * BloomRadius))}px)`;
                        Ctx.globalAlpha = Math.min(0.85, Bloom * 0.52);
                        Ctx.drawImage(this._bloomCanvas, 0, 0, W, H);
                        Ctx.filter = `blur(${Math.max(8, Math.round(22 * BloomRadius))}px)`;
                        Ctx.globalAlpha = Math.min(0.75, Bloom * 0.38);
                        Ctx.drawImage(this._bloomCanvas, 0, 0, W, H);
                        Ctx.restore();
                    }
                }
                else
                {
                    Ctx.save();
                    Ctx.globalCompositeOperation = 'lighter';
                    const Bl = Ctx.createRadialGradient(W * 0.5, H * 0.48, 20, W * 0.5, H * 0.48, Math.max(W, H) * 0.55);
                    Bl.addColorStop(0, `rgba(255, 232, 205, ${(Bloom * 0.14).toFixed(3)})`);
                    Bl.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    Ctx.fillStyle = Bl;
                    Ctx.fillRect(0, 0, W, H);
                    Ctx.restore();
                }
            }

            if (Math.abs(ExpGain - 1) > 0.02 || Math.abs(Contrast - 1) > 0.02 || Math.abs(Sat - 1) > 0.02)
            {
                if (typeof document !== 'undefined' && typeof Ctx.drawImage === 'function' && W > 8 && H > 8)
                {
                    if (!this._gradeCanvas)
                    {
                        this._gradeCanvas = document.createElement('canvas');
                        this._gradeCtx = this._gradeCanvas?.getContext?.('2d') || null;
                    }
                    const GCtx = this._gradeCtx;
                    if (GCtx && typeof GCtx.drawImage === 'function')
                    {
                        if (this._gradeCanvas.width !== W || this._gradeCanvas.height !== H)
                        {
                            this._gradeCanvas.width = W;
                            this._gradeCanvas.height = H;
                        }
                        GCtx.clearRect(0, 0, W, H);
                        GCtx.drawImage(this.canvas, 0, 0, W, H);
                        Ctx.save();
                        Ctx.filter = `brightness(${ExpGain.toFixed(3)}) contrast(${Contrast.toFixed(3)}) saturate(${Sat.toFixed(3)})`;
                        Ctx.globalCompositeOperation = 'copy';
                        Ctx.drawImage(this._gradeCanvas, 0, 0, W, H);
                        Ctx.restore();
                    }
                }
                else
                {
                    if (ExpGain > 1.02)
                    {
                        Ctx.save();
                        Ctx.globalCompositeOperation = 'screen';
                        Ctx.fillStyle = `rgba(255, 252, 245, ${Math.min(0.55, (ExpGain - 1) * 0.28).toFixed(3)})`;
                        Ctx.fillRect(0, 0, W, H);
                        Ctx.restore();
                    }
                    else if (ExpGain < 0.98)
                    {
                        Ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.78, (1 - ExpGain) * 0.85).toFixed(3)})`;
                        Ctx.fillRect(0, 0, W, H);
                    }
                    if (Sat < 0.96)
                    {
                        Ctx.save();
                        Ctx.globalCompositeOperation = 'saturation';
                        Ctx.fillStyle = `rgba(128, 128, 128, ${(1 - Sat).toFixed(3)})`;
                        Ctx.fillRect(0, 0, W, H);
                        Ctx.restore();
                    }
                }
            }

            // Optical Vignette
            if (Vignette > 0.005)
            {
                const Vig = Ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
                Vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
                Vig.addColorStop(1, `rgba(4, 5, 8, ${Math.min(0.92, Vignette * 0.88).toFixed(3)})`);
                Ctx.fillStyle = Vig;
                Ctx.fillRect(0, 0, W, H);
            }
        }
    }

    _ensureVehScratch(Cap)
    {
        if (this._vehScratchCap >= Cap) return;
        this._vehScratchCap = Cap;
        this._vOrder = new Int32Array(Cap);
        this._vDepth = new Float32Array(Cap);
        this._vAx = new Float32Array(Cap); this._vAy = new Float32Array(Cap);
        this._vBx = new Float32Array(Cap); this._vBy = new Float32Array(Cap);
        this._vCx = new Float32Array(Cap); this._vCy = new Float32Array(Cap);
        this._vR = new Uint8Array(Cap); this._vG = new Uint8Array(Cap); this._vB = new Uint8Array(Cap);
        this._vA = new Float32Array(Cap);
    }

    _renderVehicle(Ctx, VP, W, H, CamX, CamY, CamZ, Vehicle)
    {
        const Mesh = Vehicle.mesh;
        const VU = Vehicle.uniform;
        const State = Vehicle.state;
        const Mode = Math.round(VU[4] || 0); // 0 solid, 1 ghost, 2 wireframe, 3 scan
        const ScanX = VU[5];
        const HoloAmt = VU[6];
        const GhostOpacity = Math.min(0.95, Math.max(0.08, VU[7] || 0.45));
        const ScanRev = VU[43] > 0;
        const Yaw = VU[2] || 0;
        const CosY = Math.cos(Yaw), SinY = Math.sin(Yaw);
        const WheelSpin = VU[38] || 0;
        const CosSp = Math.cos(WheelSpin), SinSp = Math.sin(WheelSpin);
        const SpinWheels = Math.abs(WheelSpin) > 1e-4;
        const Time = VU[39] || 0;
        const PosX = VU[44] || 0, PosY = VU[45] || 0, PosZ = VU[46] || 0;
        const Sc = Math.max(0.05, VU[47] || 1);
        const WireOp = Math.min(1, Math.max(0.1, VU[51] || 0.78));
        const AcR = VU[40], AcG = VU[41], AcB = VU[42];

        const PaintCur = [VU[8], VU[9], VU[10], VU[11]];
        const PaintNext = [VU[12], VU[13], VU[14], VU[15]];
        const PaintRipR = VU[19];
        const PaintRipX = VU[16], PaintRipY = VU[17], PaintRipZ = VU[18];
        const CoatCur = VU[22], CoatNext = VU[23];

        const RimCur = [VU[24], VU[25], VU[26], VU[27]];
        const RimNext = [VU[28], VU[29], VU[30], VU[31]];
        const RimBaseCur = State?.RimCurBaseCol || [RimCur[0] * 0.42, RimCur[1] * 0.42, RimCur[2] * 0.42];
        const RimBaseNext = State?.RimNextBaseCol || [RimNext[0] * 0.42, RimNext[1] * 0.42, RimNext[2] * 0.42];
        const RimRipR = VU[35];
        const RimRipX = VU[32], RimRipY = VU[33], RimRipZ = VU[34];

        const ToByte = V => Math.min(255, Math.max(0, Math.round(Math.pow(Math.max(0, V), 1 / 2.2) * 255)));

        // Ground contact AO footprint shadow underneath vehicle chassis
        {
            const S = [[-3.15, -1.28], [3.15, -1.28], [3.15, 1.28], [-3.15, 1.28]];
            const Pts = [];
            let Ok = true;
            for (const [Lx, Lz] of S)
            {
                const Wx = PosX + (Lx * CosY + Lz * SinY) * Sc;
                const Wz = PosZ + (-Lx * SinY + Lz * CosY) * Sc;
                const P = ProjectPoint(VP, Wx, PosY + 0.012, Wz, W, H);
                if (!P) { Ok = false; break; }
                Pts.push(P);
            }
            if (Ok)
            {
                Ctx.save();
                Ctx.fillStyle = Mode === 0 ? 'rgba(0, 0, 0, 0.36)' : 'rgba(18, 48, 66, 0.22)';
                Ctx.beginPath();
                Ctx.moveTo(Pts[0][0], Pts[0][1]);
                for (let K = 1; K < 4; K++) Ctx.lineTo(Pts[K][0], Pts[K][1]);
                Ctx.closePath();
                Ctx.fill();
                Ctx.restore();
            }
        }

        const ScanXScaled = ScanX * Sc;
        const ScanBehindFactor = Lx => ScanRev
            ? (1 - Smooth(ScanXScaled - 0.16 * Sc, ScanXScaled + 0.16 * Sc, Lx))
            : Smooth(ScanXScaled - 0.16 * Sc, ScanXScaled + 0.16 * Sc, Lx);

        // 1. Shaded Vehicle Hull + Wheels + Material Ripple + X-Ray Scan Clipping
        if (Mode !== 2 && Mesh.softVerts && Mesh.softTriCount > 0)
        {
            const SVerts = Mesh.softVerts;
            const TriCount = Mesh.softTriCount;
            this._ensureVehScratch(TriCount);

            const Order = this._vOrder, Depth = this._vDepth;
            const AxA = this._vAx, AyA = this._vAy, BxA = this._vBx, ByA = this._vBy, CxA = this._vCx, CyA = this._vCy;
            const ColR = this._vR, ColG = this._vG, ColB = this._vB, ColA = this._vA;
            const Axles = Mesh.bounds.axleMounts;
            let Kept = 0;

            const L1x = 0.45, L1y = 0.85, L1z = 0.35;
            const L2x = -0.62, L2y = 0.38, L2z = -0.52;

            for (let T = 0; T < TriCount; T++)
            {
                const O = T * 18;
                const Part = SVerts[O + 16];
                const WheelIdx = SVerts[O + 17];
                let P0x = SVerts[O],     P0y = SVerts[O + 1], P0z = SVerts[O + 2];
                let P1x = SVerts[O + 3], P1y = SVerts[O + 4], P1z = SVerts[O + 5];
                let P2x = SVerts[O + 6], P2y = SVerts[O + 7], P2z = SVerts[O + 8];
                let Nx = SVerts[O + 9],  Ny = SVerts[O + 10], Nz = SVerts[O + 11];

                if (SpinWheels && WheelIdx >= 0)
                {
                    const Ax = Axles[WheelIdx | 0];
                    const AxX = Ax[0], AxY = Ax[1];
                    const R0x = P0x - AxX, R0y = P0y - AxY; P0x = AxX + R0x * CosSp + R0y * SinSp; P0y = AxY - R0x * SinSp + R0y * CosSp;
                    const R1x = P1x - AxX, R1y = P1y - AxY; P1x = AxX + R1x * CosSp + R1y * SinSp; P1y = AxY - R1x * SinSp + R1y * CosSp;
                    const R2x = P2x - AxX, R2y = P2y - AxY; P2x = AxX + R2x * CosSp + R2y * SinSp; P2y = AxY - R2x * SinSp + R2y * CosSp;
                    const Rnx = Nx, Rny = Ny; Nx = Rnx * CosSp + Rny * SinSp; Ny = -Rnx * SinSp + Rny * CosSp;
                }

                const LxMid = ((P0x + P1x + P2x) / 3) * Sc;
                const LyMid = ((P0y + P1y + P2y) / 3) * Sc;
                const LzMid = ((P0z + P1z + P2z) / 3) * Sc;

                const W0x = PosX + (P0x * CosY + P0z * SinY) * Sc, W0y = PosY + P0y * Sc, W0z = PosZ + (-P0x * SinY + P0z * CosY) * Sc;
                const W1x = PosX + (P1x * CosY + P1z * SinY) * Sc, W1y = PosY + P1y * Sc, W1z = PosZ + (-P1x * SinY + P1z * CosY) * Sc;
                const W2x = PosX + (P2x * CosY + P2z * SinY) * Sc, W2y = PosY + P2y * Sc, W2z = PosZ + (-P2x * SinY + P2z * CosY) * Sc;

                let Wnx = Nx * CosY + Nz * SinY, Wny = Ny, Wnz = -Nx * SinY + Nz * CosY;
                const NLen = Math.hypot(Wnx, Wny, Wnz) || 1;
                Wnx /= NLen; Wny /= NLen; Wnz /= NLen;

                const Mx = (W0x + W1x + W2x) / 3, My = (W0y + W1y + W2y) / 3, Mz = (W0z + W1z + W2z) / 3;
                const Vx = CamX - Mx, Vy = CamY - My, Vz = CamZ - Mz;
                const VLen = Math.hypot(Vx, Vy, Vz) || 1;
                const Vux = Vx / VLen, Vuy = Vy / VLen, Vuz = Vz / VLen;
                let NdotV = Wnx * Vux + Wny * Vuy + Wnz * Vuz;

                const Behind = Mode === 3 ? ScanBehindFactor(LxMid) : 0;
                const Holo = Mode === 3 ? Behind * HoloAmt : 0;

                // ControlVehicle uses DoubleSide material geometry across mixed-winding body sub-meshes
                if (NdotV < 0) { Wnx = -Wnx; Wny = -Wny; Wnz = -Wnz; NdotV = -NdotV; }

                const A = ProjectPoint(VP, W0x, W0y, W0z, W, H);
                const B = ProjectPoint(VP, W1x, W1y, W1z, W, H);
                const C = ProjectPoint(VP, W2x, W2y, W2z, W, H);
                if (!A || !B || !C) continue;

                // Base PBR color + expanding sphere ripple morphing
                let Cr = SVerts[O + 12], Cg = SVerts[O + 13], Cb = SVerts[O + 14], Alpha = SVerts[O + 15];
                let Rough = 0.48, Coat = 0.0, Emit = 0.0, RingBoost = 0.0;
                let RingColR = AcR, RingColG = AcG, RingColB = AcB;

                if (Part === 0)
                {
                    Cr = PaintCur[0]; Cg = PaintCur[1]; Cb = PaintCur[2]; Rough = PaintCur[3]; Coat = CoatCur;
                    if (PaintRipR >= 0)
                    {
                        const D = Math.hypot(LxMid - PaintRipX * Sc, LyMid - PaintRipY * Sc, LzMid - PaintRipZ * Sc);
                        const M = 1 - Smooth(PaintRipR - 0.18, PaintRipR + 0.05, D);
                        Cr = PaintCur[0] + (PaintNext[0] - PaintCur[0]) * M;
                        Cg = PaintCur[1] + (PaintNext[1] - PaintCur[1]) * M;
                        Cb = PaintCur[2] + (PaintNext[2] - PaintCur[2]) * M;
                        Rough = PaintCur[3] + (PaintNext[3] - PaintCur[3]) * M;
                        Coat = CoatCur + (CoatNext - CoatCur) * M;
                        const Ring = Smooth(PaintRipR - 0.24, PaintRipR - 0.03, D) * (1 - Smooth(PaintRipR - 0.01, PaintRipR + 0.12, D));
                        RingBoost = Ring * 0.72;
                        RingColR = PaintNext[0] * 0.55 + 0.45; RingColG = PaintNext[1] * 0.55 + 0.45; RingColB = PaintNext[2] * 0.55 + 0.45;
                    }
                }
                else if (Part === 3 || Part === 4)
                {
                    const SrcCur = Part === 3 ? RimBaseCur : RimCur;
                    const SrcNext = Part === 3 ? RimBaseNext : RimNext;
                    Cr = SrcCur[0]; Cg = SrcCur[1]; Cb = SrcCur[2]; Rough = RimCur[3]; Coat = 0.35;
                    if (RimRipR >= 0)
                    {
                        const D = Math.hypot(LxMid - RimRipX * Sc, LyMid - RimRipY * Sc, LzMid - RimRipZ * Sc);
                        const M = 1 - Smooth(RimRipR - 0.16, RimRipR + 0.05, D);
                        Cr = SrcCur[0] + (SrcNext[0] - SrcCur[0]) * M;
                        Cg = SrcCur[1] + (SrcNext[1] - SrcCur[1]) * M;
                        Cb = SrcCur[2] + (SrcNext[2] - SrcCur[2]) * M;
                        Rough = RimCur[3] + (RimNext[3] - RimCur[3]) * M;
                        const Ring = Smooth(RimRipR - 0.22, RimRipR - 0.03, D) * (1 - Smooth(RimRipR - 0.01, RimRipR + 0.10, D));
                        RingBoost = Ring * 0.78;
                        RingColR = RimNext[0] * 0.5 + 0.5; RingColG = RimNext[1] * 0.5 + 0.5; RingColB = RimNext[2] * 0.5 + 0.5;
                    }
                }
                else if (Part === 1) { Rough = 0.04; Coat = 0.95; Alpha = 0.55; }
                else if (Part === 6) { Emit = 1.15; Rough = 0.12; }
                else if (Part === 7) { Emit = 0.95; Rough = 0.14; }

                const D1 = Math.max(0, Wnx * L1x + Wny * L1y + Wnz * L1z);
                const D2 = Math.max(0, Wnx * L2x + Wny * L2y + Wnz * L2z);
                const H1x = L1x + Vux, H1y = L1y + Vuy, H1z = L1z + Vuz;
                const HL = Math.hypot(H1x, H1y, H1z) || 1;
                const NDotH = Math.max(0, (Wnx * H1x + Wny * H1y + Wnz * H1z) / HL);
                const SpecPow = 82 - Rough * 66;
                const Spec = Math.pow(NDotH, SpecPow) * (0.12 + (1 - Rough) * 0.45 + Coat * 0.34);
                const Fres = Math.pow(1 - Math.max(0, Math.min(1, NdotV)), 2.5);
                const EnvRef = Fres * (0.10 + Coat * 0.36);
                const Diff = 0.30 + 0.65 * D1 + 0.24 * D2;

                let Lr = Cr * Diff + Spec + EnvRef * 0.45 + Cr * Emit + RingColR * RingBoost;
                let Lg = Cg * Diff + Spec + EnvRef * 0.56 + Cg * Emit + RingColG * RingBoost;
                let Lb = Cb * Diff + Spec + EnvRef * 0.72 + Cb * Emit + RingColB * RingBoost;

                if (Mode === 1)
                {
                    const GhostRim = Math.pow(1 - Math.max(0, Math.min(1, NdotV)), 1.9) * 0.72;
                    Lr = Lr * 0.38 + AcR * (0.34 + GhostRim);
                    Lg = Lg * 0.38 + AcG * (0.34 + GhostRim);
                    Lb = Lb * 0.38 + AcB * (0.34 + GhostRim);
                    Alpha = Math.min(0.88, GhostOpacity * (0.72 + GhostRim * 0.55));
                }
                else if (Mode === 3 && Holo > 0.01)
                {
                    const Delta = Math.abs(LxMid - ScanX);
                    const Beam = Math.exp(-(Delta * Delta) * 85) * HoloAmt;
                    const ScanLines = 0.56 + 0.44 * Math.sin(My * 40 - Time * 7.5);
                    const HolRim = Math.pow(1 - Math.max(0, Math.min(1, NdotV)), 1.75);
                    const HolGain = (0.14 + HolRim * 0.78) * ScanLines;
                    Lr = Lr * (1 - Holo) + (AcR * HolGain + 0.75 * Beam) * Holo;
                    Lg = Lg * (1 - Holo) + (AcG * HolGain + 0.96 * Beam) * Holo;
                    Lb = Lb * (1 - Holo) + (AcB * HolGain + 1.00 * Beam) * Holo;
                    Alpha = Alpha * (1 - Holo) + Math.min(0.85, 0.06 + HolRim * 0.42 + Beam * 0.65) * Holo;
                }

                Order[Kept] = Kept;
                Depth[Kept] = (A[2] + B[2] + C[2]) / 3;
                AxA[Kept] = A[0]; AyA[Kept] = A[1];
                BxA[Kept] = B[0]; ByA[Kept] = B[1];
                CxA[Kept] = C[0]; CyA[Kept] = C[1];
                ColR[Kept] = ToByte(Lr); ColG[Kept] = ToByte(Lg); ColB[Kept] = ToByte(Lb);
                ColA[Kept] = Math.min(1, Math.max(0, Alpha));
                Kept++;
            }

            const ViewOrder = Order.subarray(0, Kept);
            ViewOrder.sort((P, Q) => Depth[Q] - Depth[P]);
            Ctx.save();
            Ctx.lineJoin = 'round';
            for (let K = 0; K < Kept; K++)
            {
                const Idx = ViewOrder[K];
                const Alpha = ColA[Idx];
                if (Alpha < 0.01) continue;
                Ctx.fillStyle = `rgba(${ColR[Idx]},${ColG[Idx]},${ColB[Idx]},${Alpha.toFixed(3)})`;
                Ctx.beginPath();
                Ctx.moveTo(AxA[Idx], AyA[Idx]);
                Ctx.lineTo(BxA[Idx], ByA[Idx]);
                Ctx.lineTo(CxA[Idx], CyA[Idx]);
                Ctx.closePath();
                Ctx.fill();
            }
            Ctx.restore();
        }

        // 2. Architectural CAD Crease Wireframe (Ghost interior creases, Wireframe mode, Clipped X-Ray Scan edges)
        if (Mode !== 0 && Mesh.edgeVerts && Mesh.edgeCount > 1)
        {
            const EVerts = Mesh.edgeVerts;
            const ECnt = Mesh.edgeCount;
            const Axles = Mesh.bounds.axleMounts;
            const CyanR = ToByte(AcR * 0.72 + 0.16), CyanG = ToByte(AcG * 0.72 + 0.22), CyanB = ToByte(AcB * 0.72 + 0.26);
            Ctx.save();
            if (Mode === 3) Ctx.globalCompositeOperation = 'lighter';
            Ctx.lineWidth = Mode === 2 ? 1.05 : Mode === 3 ? 1.15 : 0.75;
            for (let I = 0; I < ECnt - 1; I += 2)
            {
                const O0 = I * 9, O1 = (I + 1) * 9;
                const Wi = EVerts[O0 + 8];
                let X0 = EVerts[O0], Y0 = EVerts[O0 + 1], Z0 = EVerts[O0 + 2];
                let X1 = EVerts[O1], Y1 = EVerts[O1 + 1], Z1 = EVerts[O1 + 2];
                if (SpinWheels && Wi >= 0)
                {
                    const Ax = Axles[Wi | 0];
                    const R0x = X0 - Ax[0], R0y = Y0 - Ax[1]; X0 = Ax[0] + R0x * CosSp + R0y * SinSp; Y0 = Ax[1] - R0x * SinSp + R0y * CosSp;
                    const R1x = X1 - Ax[0], R1y = Y1 - Ax[1]; X1 = Ax[0] + R1x * CosSp + R1y * SinSp; Y1 = Ax[1] - R1x * SinSp + R1y * CosSp;
                }
                const LxMid = ((X0 + X1) * 0.5) * Sc;
                let A = Mode === 1 ? WireOp * 0.34 : WireOp;
                if (Mode === 3)
                {
                    const Beh = ScanBehindFactor(LxMid);
                    A = WireOp * (0.08 + Beh * 0.88) * Math.max(0.25, HoloAmt);
                    if (A < 0.05) continue;
                }
                const W0x = PosX + (X0 * CosY + Z0 * SinY) * Sc, W0y = PosY + Y0 * Sc, W0z = PosZ + (-X0 * SinY + Z0 * CosY) * Sc;
                const W1x = PosX + (X1 * CosY + Z1 * SinY) * Sc, W1y = PosY + Y1 * Sc, W1z = PosZ + (-X1 * SinY + Z1 * CosY) * Sc;
                const P0 = ProjectPoint(VP, W0x, W0y, W0z, W, H);
                const P1 = ProjectPoint(VP, W1x, W1y, W1z, W, H);
                if (!P0 || !P1) continue;
                const Delta = Mode === 3 ? Math.abs(LxMid - ScanX) : 99;
                if (Delta < 0.18)
                    Ctx.strokeStyle = `rgba(215, 250, 255, ${Math.min(1, A * 1.15).toFixed(3)})`;
                else
                    Ctx.strokeStyle = `rgba(${CyanR}, ${CyanG}, ${CyanB}, ${A.toFixed(3)})`;
                Ctx.beginPath();
                Ctx.moveTo(P0[0], P0[1]);
                Ctx.lineTo(P1[0], P1[1]);
                Ctx.stroke();
            }
            Ctx.restore();
        }

        // 3. Expanding Material Ripple Frontier Rings (3D surface glow driven by RingBoost above; keep subtle pulse ring close to car hull only)
        const DrawRippleRing = (Ox, Oy, Oz, Rad, Rgb) =>
        {
            if (Rad <= 0.02 || Rad > 1.8) return;
            const Fade = Math.max(0, 1 - Rad / 1.8) * 0.55;
            const Cr = ToByte(Rgb[0] * 0.65 + 0.35), Cg = ToByte(Rgb[1] * 0.65 + 0.35), Cb = ToByte(Rgb[2] * 0.65 + 0.35);
            Ctx.save();
            Ctx.globalCompositeOperation = 'lighter';
            Ctx.strokeStyle = `rgba(${Cr}, ${Cg}, ${Cb}, ${Fade.toFixed(3)})`;
            Ctx.lineWidth = 1.6;
            Ctx.beginPath();
            let PenDown = false;
            for (let S = 0; S <= 24; S++)
            {
                const Ang = (S / 24) * Math.PI * 2;
                const Wx = Ox + Math.cos(Ang) * Rad;
                const Wy = Math.max(0.03, Oy);
                const Wz = Oz + Math.sin(Ang) * Rad;
                const Pt = ProjectPoint(VP, Wx, Wy, Wz, W, H);
                if (!Pt) { PenDown = false; continue; }
                if (!PenDown) { Ctx.moveTo(Pt[0], Pt[1]); PenDown = true; } else Ctx.lineTo(Pt[0], Pt[1]);
            }
            Ctx.stroke();
            Ctx.restore();
        };
        if (PaintRipR >= 0)
        {
            const Wx = PosX + (PaintRipX * CosY + PaintRipZ * SinY) * Sc, Wy = PosY + PaintRipY * Sc, Wz = PosZ + (-PaintRipX * SinY + PaintRipZ * CosY) * Sc;
            DrawRippleRing(Wx, Wy, Wz, PaintRipR, PaintNext);
        }
        if (RimRipR >= 0)
        {
            const Wx = PosX + (RimRipX * CosY + RimRipZ * SinY) * Sc, Wy = PosY + RimRipY * Sc, Wz = PosZ + (-RimRipX * SinY + RimRipZ * CosY) * Sc;
            DrawRippleRing(Wx, Wy, Wz, RimRipR, RimNext);
        }

        // 4. Additive Vertical Laser Scan Curtain Quad at local X = ScanX
        if (Mode === 3 && HoloAmt > 0.02)
        {
            const Corners = [[0.03, -1.52], [2.05, -1.52], [2.05, 1.52], [0.03, 1.52]].map(([Ly, Lz]) =>
            {
                const Wx = PosX + (ScanX * CosY + Lz * SinY) * Sc;
                const Wy = PosY + Ly * Sc;
                const Wz = PosZ + (-ScanX * SinY + Lz * CosY) * Sc;
                return ProjectPoint(VP, Wx, Wy, Wz, W, H);
            });
            if (Corners.every(Boolean))
            {
                const Ar = ToByte(AcR), Ag = ToByte(AcG), Ab = ToByte(AcB);
                Ctx.save();
                Ctx.globalCompositeOperation = 'lighter';
                if (Ctx.createLinearGradient)
                {
                    const Gr = Ctx.createLinearGradient(Corners[0][0], Corners[0][1], Corners[1][0], Corners[1][1]);
                    Gr.addColorStop(0, `rgba(${Ar}, ${Ag}, ${Ab}, ${(0.08 * HoloAmt).toFixed(3)})`);
                    Gr.addColorStop(0.5, `rgba(${Ar}, ${Ag}, ${Ab}, ${(0.28 * HoloAmt).toFixed(3)})`);
                    Gr.addColorStop(1, `rgba(${Ar}, ${Ag}, ${Ab}, ${(0.04 * HoloAmt).toFixed(3)})`);
                    Ctx.fillStyle = Gr;
                }
                else
                {
                    Ctx.fillStyle = `rgba(${Ar}, ${Ag}, ${Ab}, ${(0.18 * HoloAmt).toFixed(3)})`;
                }
                Ctx.beginPath();
                Ctx.moveTo(Corners[0][0], Corners[0][1]);
                Ctx.lineTo(Corners[1][0], Corners[1][1]);
                Ctx.lineTo(Corners[2][0], Corners[2][1]);
                Ctx.lineTo(Corners[3][0], Corners[3][1]);
                Ctx.closePath();
                Ctx.fill();

                Ctx.strokeStyle = `rgba(215, 250, 255, ${(0.82 * HoloAmt).toFixed(3)})`;
                Ctx.lineWidth = 1.6;
                Ctx.beginPath();
                Ctx.moveTo(Corners[0][0], Corners[0][1]);
                Ctx.lineTo(Corners[1][0], Corners[1][1]);
                Ctx.lineTo(Corners[2][0], Corners[2][1]);
                Ctx.lineTo(Corners[3][0], Corners[3][1]);
                Ctx.closePath();
                Ctx.stroke();
                Ctx.restore();
            }
        }
    }
}

export class SoftwareLatticeReadback
{
    constructor(FieldScene, Wind, GetTime = null)
    {
        this.FieldScene = FieldScene;
        this.Wind = Wind;
        this.GetTime = GetTime;
        this.Status = { Count: 0, Bytes: PE.WIND.dim[0] * PE.WIND.dim[1] * PE.WIND.dim[2] * 8, Milliseconds: 0.4 };
    }

    Request()
    {
        this.Status.Count++;
    }

    Sample(X, Y, Z, Out)
    {
        Out[0] = 0; Out[1] = 0; Out[2] = 0;
        const Min = PE.WIND.min, Size = PE.WIND.size;
        const Inside = X >= Min[0] && X <= Min[0] + Size[0] && Z >= Min[2] && Z <= Min[2] + Size[2];
        if (!Inside) return false;
        const FS = typeof this.FieldScene === 'function' ? this.FieldScene() : this.FieldScene;
        if (FS && PE.Forces?.Evaluate)
        {
            const Time = this.GetTime ? this.GetTime() : 0;
            PE.Forces.Evaluate(FS, 'Flow', X, Y, Z, Time, 0.5, Out, FS.Visualization?.Solo, 'Particles');
            const Scale = this.Wind?.windScale ?? 1;
            Out[0] *= Scale; Out[1] *= Scale; Out[2] *= Scale;
            return true;
        }
        return true;
    }
}
