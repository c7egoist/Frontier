/*==========================================================================================================================================
                                                      SOFTWAREPREVIEWENGINE.JS
==========================================================================================================================================*/
// 🧩 Software 2D/3D-projected fallback simulation engine matching PE.Engine's exact host interface.
//    Active ONLY when browser WebGPU is unavailable (e.g. headless/mobile/non-WebGPU context); WebGPU browsers
//    run the unmodified eos Engine/engine.js compute + render pipelines directly.

import { PE } from './Engine/pe.js';
import './Engine/forcefields.js';

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

// Fast smooth 3D analytic curl velocity ∇ × A for Software Preview curl fields
function AnalyticCurl3(X, Y, Z)
{
    // A = [sin(y*1.3 + z*0.9) + 0.5*cos(z*2.4 - x*1.7), sin(z*1.2 + x*0.95) + 0.5*cos(x*2.3 - y*1.8), sin(x*1.1 + y*1.15) + 0.5*cos(y*2.2 - z*1.6)]
    const dAz_dy = 1.15 * Math.cos(X * 1.1 + Y * 1.15) - 1.1 * Math.sin(Y * 2.2 - Z * 1.6);
    const dAy_dz = 1.2 * Math.cos(Z * 1.2 + X * 0.95);
    const dAx_dz = 0.9 * Math.cos(Y * 1.3 + Z * 0.9) - 1.2 * Math.sin(Z * 2.4 - X * 1.7);
    const dAz_dx = 1.1 * Math.cos(X * 1.1 + Y * 1.15);
    const dAy_dx = 0.95 * Math.cos(Z * 1.2 + X * 0.95) - 1.15 * Math.sin(X * 2.3 - Y * 1.8);
    const dAx_dy = 1.3 * Math.cos(Y * 1.3 + Z * 0.9);
    return [dAz_dy - dAy_dz, dAx_dz - dAz_dx, dAy_dx - dAx_dy];
}

function StreamRibbonVel(X, Y, Z, T, Freq, Amp, OrgX, OrgY, OrgZ, ExtX, ExtY, ExtZ)
{
    const Rx = X - OrgX, Ry = Y - OrgY, Rz = Z - OrgZ;
    const F = Math.max(0.08, Freq);
    const DrX = T * 0.22, DrY = -T * 0.14, DrZ = T * 0.18;
    const C1 = AnalyticCurl3(X * F * 0.52 + DrX, Y * F * 0.52 + DrY, Z * F * 0.52 + DrZ);
    const C2 = AnalyticCurl3(X * F * 1.12 - DrX * 0.75 + 2.4, Y * F * 1.12 - DrY * 0.75 - 1.3, Z * F * 1.12 - DrZ * 0.75 + 0.9);
    const Sx = 0.45 * Math.cos(Rz * F * 0.75 + 0.5 * Math.sin(Ry * F + T * 0.25));
    const Sy = 0.34 * Math.sin(Rx * F * 0.85 - Rz * F * 0.45 + T * 0.18);
    const Sz = 0.45 * Math.sin(Rx * F * 0.75 + 0.5 * Math.cos(Rz * F - T * 0.22));
    const Pull = Amp * 0.38;
    return [
        (C1[0] * 0.85 + C2[0] * 0.32 + Sx * 0.68) * Amp - (Rx / Math.max(ExtX * ExtX, 1.2)) * Pull,
        (C1[1] * 0.85 + C2[1] * 0.32 + Sy * 0.68) * Amp - (Ry / Math.max(ExtY * ExtY, 1.2)) * Pull,
        (C1[2] * 0.85 + C2[2] * 0.32 + Sz * 0.68) * Amp - (Rz / Math.max(ExtZ * ExtZ, 1.2)) * Pull
    ];
}

function ProjectObjSurface(Rx, Ry, Rz, ObjSh, Ex, Ey, Ez)
{
    if (ObjSh === 1)
    {
        const R = Math.max(Ex, 0.35) * 1.02;
        const D = Math.hypot(Rx, Ry, Rz) || 1e-4;
        return [(Rx / D) * R, (Ry / D) * R, (Rz / D) * R];
    }
    if (ObjSh === 2)
    {
        const R = Math.max(Ex, 0.35) * 1.02, Hy = Math.max(Ey, 0.35);
        const Rxz = Math.hypot(Rx, Rz);
        if (Ry >= Hy * 0.98 && Rxz < R * 0.96) return [Rx, Hy * 1.01, Rz];
        const Dx = Rxz > 1e-4 ? Rx / Rxz : 1, Dz = Rxz > 1e-4 ? Rz / Rxz : 0;
        return [Dx * R, Math.max(-Hy, Math.min(Hy, Ry)), Dz * R];
    }
    const Cx = Math.max(-Ex, Math.min(Ex, Rx));
    const Cy = Math.max(-Ey, Math.min(Ey, Ry));
    const Cz = Math.max(-Ez, Math.min(Ez, Rz));
    const Qx = Math.abs(Cx / Math.max(Ex, 0.1)), Qy = Math.abs(Cy / Math.max(Ey, 0.1)), Qz = Math.abs(Cz / Math.max(Ez, 0.1));
    if (Qy >= Qx && Qy >= Qz) return [Cx, (Cy >= 0 ? Ey : -Ey) * 1.015, Cz];
    if (Qx >= Qz) return [(Cx >= 0 ? Ex : -Ex) * 1.015, Cy, Cz];
    return [Cx, Cy, (Cz >= 0 ? Ez : -Ez) * 1.015];
}

function ObjSurfaceNormal(Rx, Ry, Rz, ObjSh, Ex, Ey, Ez)
{
    if (ObjSh === 1)
    {
        const D = Math.hypot(Rx, Ry, Rz) || 1e-4;
        return [Rx / D, Ry / D, Rz / D];
    }
    if (ObjSh === 2)
    {
        const Rxz = Math.hypot(Rx, Rz);
        if (Ry >= Ey * 0.98 && Rxz < Math.max(Ex, 0.35) * 0.96) return [0, 1, 0];
        const D = Rxz || 1e-4;
        return [Rx / D, 0, Rz / D];
    }
    const Qx = Math.abs(Rx / Math.max(Ex, 0.1)), Qy = Math.abs(Ry / Math.max(Ey, 0.1)), Qz = Math.abs(Rz / Math.max(Ez, 0.1));
    if (Qy >= Qx && Qy >= Qz) return [0, Ry >= 0 ? 1 : -1, 0];
    if (Qx >= Qz) return [Rx >= 0 ? 1 : -1, 0, 0];
    return [0, 0, Rz >= 0 ? 1 : -1];
}

function SurfacePourVel(Px, Py, Pz, Ox, Oy, Oz, Ex, Ey, Ez, ObjSh, AxIdx, T, Freq, Amp, Seed)
{
    const PD = AxIdx === 0 ? [1, 0, 0] : (AxIdx === 2 ? [0, 0, 1] : [0, -1, 0]);
    const Rx = Px - Ox, Ry = Py - Oy, Rz = Pz - Oz;
    const N = ObjSurfaceNormal(Rx, Ry, Rz, ObjSh, Ex, Ey, Ez);
    const DrX = T * 0.20, DrY = -T * 0.16, DrZ = T * 0.18;
    const C = AnalyticCurl3(Px * Math.max(0.1, Freq) + DrX, Py * Math.max(0.1, Freq) + DrY, Pz * Math.max(0.1, Freq) + DrZ);
    const DotRP = Rx * PD[0] + Ry * PD[1] + Rz * PD[2];
    let RadX = Rx - PD[0] * DotRP, RadY = Ry - PD[1] * DotRP, RadZ = Rz - PD[2] * DotRP;
    let RL = Math.hypot(RadX, RadY, RadZ);
    if (RL < 0.04)
    {
        const A = Seed * 0.0173, B = BasisFrom(PD);
        RadX = B[0][0] * Math.cos(A) + B[1][0] * Math.sin(A);
        RadY = B[0][1] * Math.cos(A) + B[1][1] * Math.sin(A);
        RadZ = B[0][2] * Math.cos(A) + B[1][2] * Math.sin(A);
    }
    else { RadX /= RL; RadY /= RL; RadZ /= RL; }
    const DotNP = N[0] * -PD[0] + N[1] * -PD[1] + N[2] * -PD[2];
    const NearTop = Math.min(1, Math.max(0, (DotNP - 0.65) / 0.34));
    const RadialBoost = Amp * (0.35 + 0.95 * NearTop * NearTop * (3 - 2 * NearTop));
    const Dx = PD[0] * Amp + C[0] * Amp * 0.45 + RadX * RadialBoost;
    const Dy = PD[1] * Amp + C[1] * Amp * 0.45 + RadY * RadialBoost;
    const Dz = PD[2] * Amp + C[2] * Amp * 0.45 + RadZ * RadialBoost;
    const DotDN = Dx * N[0] + Dy * N[1] + Dz * N[2];
    return [Dx - N[0] * DotDN, Dy - N[1] * DotDN, Dz - N[2] * DotDN];
}

// Deterministic 1:1 CPU parity helpers for Spiderweb (webMode 1 = Orb-Weave, 2 = Messy Cobwebs)
function WebHash(Seed, K)
{
    const S = Math.sin(Seed * 12.9898 + K * 78.233) * 43758.5453123;
    return S - Math.floor(S);
}

function WebSwayAt(Px, Py, Pz, WindT, WindScale, Amp, Freq, WindCoupling, FieldScene, Prepared, Solo, WindFactor)
{
    let Wx = 0, Wy = 0, Wz = 0;
    if (FieldScene && Prepared && PE.Forces?.EvaluateAllPrepared)
    {
        const F = PE.Forces.EvaluateAllPrepared(FieldScene, Prepared, Px, Py, Pz, 0.5, Solo, 'Particles');
        Wx = F.Velocity[0] * WindFactor * WindCoupling * WindScale * 0.045 + F.Acceleration[0] * 0.025 * 0.42;
        Wy = F.Velocity[1] * WindFactor * WindCoupling * WindScale * 0.045 + F.Acceleration[1] * 0.025 * 0.42;
        Wz = F.Velocity[2] * WindFactor * WindCoupling * WindScale * 0.045 + F.Acceleration[2] * 0.025 * 0.42;
    }
    const C = AnalyticCurl3(Px * Freq * 0.45 + WindT * 0.58, Py * Freq * 0.45 - WindT * 0.36, Pz * Freq * 0.45 + WindT * 0.46);
    const GScale = Amp * 0.16 * WindScale;
    let Ox = Wx + C[0] * GScale, Oy = Wy + C[1] * GScale, Oz = Wz + C[2] * GScale;
    const M = Math.hypot(Ox, Oy, Oz);
    if (M > 0.38) { const S = 0.38 / M; Ox *= S; Oy *= S; Oz *= S; }
    return [Ox, Oy, Oz];
}

const ORB_ANCHOR_ANGS = [0.14, 1.12, 2.28, 3.32, 4.34, 5.42];
const ORB_ANCHOR_RADS = [1.28, 1.14, 1.32, 1.16, 1.26, 1.18];

function OrbFrameEdgeLocal(Theta, R)
{
    const Dx = Math.cos(Theta), Dy = Math.sin(Theta);
    let BestT = R * 1.15;
    for (let G = 0; G < 6; G++)
    {
        const G1 = (G + 1) % 6;
        const Ax = Math.cos(ORB_ANCHOR_ANGS[G]) * R * ORB_ANCHOR_RADS[G];
        const Ay = Math.sin(ORB_ANCHOR_ANGS[G]) * R * ORB_ANCHOR_RADS[G];
        const Bx = Math.cos(ORB_ANCHOR_ANGS[G1]) * R * ORB_ANCHOR_RADS[G1];
        const By = Math.sin(ORB_ANCHOR_ANGS[G1]) * R * ORB_ANCHOR_RADS[G1];
        const Ex = Bx - Ax, Ey = By - Ay;
        const Den = Dx * Ey - Dy * Ex;
        if (Math.abs(Den) > 1e-4)
        {
            const TRay = (Ax * Ey - Ay * Ex) / Den;
            const UEdge = (Ax * Dy - Ay * Dx) / Den;
            if (TRay > 0 && UEdge >= -0.02 && UEdge <= 1.02 && TRay < BestT) BestT = TRay;
        }
    }
    return [Dx * BestT, Dy * BestT, 0];
}

function CobwebPocketPoint(SeedVal, Pocket, Role, Org, BR, BU, BF, Ext)
{
    let Px = 0, Py = 0, Pz = 0;
    if (Pocket === 0) { Px = -Ext[0] * 0.52; Py = Ext[1] * 0.36; Pz = -Ext[2] * 0.28; }
    else if (Pocket === 1) { Px = Ext[0] * 0.08; Py = Ext[1] * 0.46; Pz = 0.08 * Ext[2]; }
    else { Px = Ext[0] * 0.56; Py = Ext[1] * 0.22; Pz = -Ext[2] * 0.20; }
    const U0 = WebHash(SeedVal, 1), U1 = WebHash(SeedVal, 2), U2 = WebHash(SeedVal, 3);
    let Lx, Ly, Lz;
    if (Role === 0)
    {
        Lx = Px + (U0 - 0.5) * Ext[0] * 0.88;
        Ly = Py + Ext[1] * (0.42 + 0.28 * U1);
        Lz = Pz + (U2 - 0.5) * Ext[2] * 0.65;
    }
    else if (Role === 1)
    {
        Lx = Px - Ext[0] * (0.38 + 0.38 * U0);
        Ly = Py + (U1 * 1.15 - 0.68) * Ext[1];
        Lz = Pz + (U2 - 0.5) * Ext[2] * 0.72;
    }
    else
    {
        Lx = Px + Ext[0] * (0.28 + 0.44 * U0);
        Ly = Py + (U1 * 1.05 - 0.58) * Ext[1];
        Lz = Pz + (U2 - 0.5) * Ext[2] * 0.72;
    }
    return [
        Org[0] + BR[0] * Lx + BU[0] * Ly + BF[0] * Lz,
        Org[1] + BR[1] * Lx + BU[1] * Ly + BF[1] * Lz,
        Org[2] + BR[2] * Lx + BU[2] * Ly + BF[2] * Lz
    ];
}

function EvalCobwebChord(CIdx, Org, BR, BU, BF, Ext, SagBase)
{
    const Sd = CIdx * 37 + 13;
    const Pocket = CIdx % 3;
    const RA = Math.floor(WebHash(Sd, 5) * 3) % 3;
    const RB = (RA + 1 + Math.floor(WebHash(Sd, 6) * 2)) % 3;
    const A = CobwebPocketPoint(Sd + 1.1, Pocket, RA, Org, BR, BU, BF, Ext);
    const B = CobwebPocketPoint(Sd + 7.9, Pocket, RB, Org, BR, BU, BF, Ext);
    const Len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const Sag = SagBase * (0.55 + 1.25 * WebHash(Sd, 8)) * Math.min(1.55, Math.max(0.45, Len / 2.2));
    return { a: A, b: B, sag: Sag };
}

function EvalSpiderwebStrandCPU(P, Slot, Cap, WebMode, TWeb, WindT, FieldScene, Prepared, Solo, WindFactor)
{
    const Org = P.origin || [0, 2, 0];
    const [BR, BU, BF] = BasisFrom(P.dir || [0, 0, 1]);
    const Amp = P.curlAmp ?? 0.36;
    const Freq = Math.max(0.2, P.curlFreq ?? 1.1);
    const WindC = P.windCoupling ?? 1.0;
    const Spokes = Math.min(32, Math.max(8, Math.round(P.webSpokes ?? 18)));
    const RingsT = Math.min(22, Math.max(6, P.webRings ?? 14));
    const SagBase = Math.max(0, P.webSag ?? 0.14);
    const SwayFn = (Q, Ws, A = Amp, F = Freq) => WebSwayAt(Q[0], Q[1], Q[2], WindT, Ws, A, F, WindC, FieldScene, Prepared, Solo, WindFactor);

    if (WebMode === 1)
    {
        const R = Math.max(0.45, P.radius || 2.05);
        const HubBase = [Org[0] + BU[0] * (-0.05 * R), Org[1] + BU[1] * (-0.05 * R), Org[2] + BU[2] * (-0.05 * R)];
        const HS = SwayFn(HubBase, 0.24);
        const Hub = [HubBase[0] + HS[0], HubBase[1] + HS[1], HubBase[2] + HS[2]];
        if (Slot < 6)
        {
            const T0 = 0.03 + Slot * 0.06, Dur = 0.24;
            if (TWeb < T0) return { visible: false };
            const S1 = (Slot + 1) % 6;
            const Ax = Math.cos(ORB_ANCHOR_ANGS[Slot]) * R * ORB_ANCHOR_RADS[Slot], Ay = Math.sin(ORB_ANCHOR_ANGS[Slot]) * R * ORB_ANCHOR_RADS[Slot];
            const Bx = Math.cos(ORB_ANCHOR_ANGS[S1]) * R * ORB_ANCHOR_RADS[S1], By = Math.sin(ORB_ANCHOR_ANGS[S1]) * R * ORB_ANCHOR_RADS[S1];
            const RawA = [Org[0] + BR[0] * Ax + BU[0] * Ay, Org[1] + BR[1] * Ax + BU[1] * Ay, Org[2] + BR[2] * Ax + BU[2] * Ay];
            const RawB = [Org[0] + BR[0] * Bx + BU[0] * By, Org[1] + BR[1] * Bx + BU[1] * By, Org[2] + BR[2] * Bx + BU[2] * By];
            const SA = SwayFn(RawA, 0.08), SB = SwayFn(RawB, 0.08);
            const PA = [RawA[0] + SA[0], RawA[1] + SA[1], RawA[2] + SA[2]], PB = [RawB[0] + SB[0], RawB[1] + SB[1], RawB[2] + SB[2]];
            const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
            const Tip = [PA[0] + (PB[0] - PA[0]) * Grow, PA[1] + (PB[1] - PA[1]) * Grow, PA[2] + (PB[2] - PA[2]) * Grow];
            const Len = Math.hypot(PB[0] - PA[0], PB[1] - PA[1], PB[2] - PA[2]);
            const HFrac = Math.min(1, Math.max(0.15, Math.hypot(PB[0] - PA[0], PB[2] - PA[2]) / Math.max(Len, 1e-4)));
            return { visible: true, pA: PA, pB: Tip, tip: Tip, sag: SagBase * 0.42 * HFrac * Grow, windScale: 0.12, tipWhip: 0, grow: Grow, bead: Grow < 0.99 ? 1 : 0, role: 0.12 };
        }
        if (Slot < 12)
        {
            const G = Slot - 6;
            const T0 = 0.25 + G * 0.04, Dur = 0.18;
            if (TWeb < T0) return { visible: false };
            const Ax = Math.cos(ORB_ANCHOR_ANGS[G]) * R * ORB_ANCHOR_RADS[G], Ay = Math.sin(ORB_ANCHOR_ANGS[G]) * R * ORB_ANCHOR_RADS[G];
            const RawA = [Org[0] + BR[0] * Ax + BU[0] * Ay, Org[1] + BR[1] * Ax + BU[1] * Ay, Org[2] + BR[2] * Ax + BU[2] * Ay];
            const SA = SwayFn(RawA, 0.08);
            const PA = [RawA[0] + SA[0], RawA[1] + SA[1], RawA[2] + SA[2]];
            const PB = [Org[0] + BR[0] * Ax * 1.18 + BU[0] * Ay * 1.18, Org[1] + BR[1] * Ax * 1.18 + BU[1] * Ay * 1.18, Org[2] + BR[2] * Ax * 1.18 + BU[2] * Ay * 1.18];
            const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
            const Tip = [PA[0] + (PB[0] - PA[0]) * Grow, PA[1] + (PB[1] - PA[1]) * Grow, PA[2] + (PB[2] - PA[2]) * Grow];
            return { visible: true, pA: PA, pB: Tip, tip: Tip, sag: SagBase * 0.15 * Grow, windScale: 0.08, tipWhip: 0, grow: Grow, bead: Grow < 0.99 ? 1 : 0, role: 0.08 };
        }
        if (Slot < 12 + Spokes)
        {
            const SIdx = Slot - 12;
            const T0 = 0.42 + SIdx * 0.030, Dur = 0.22;
            if (TWeb < T0) return { visible: false };
            const Jit = (WebHash(SIdx * 19 + 3, 1) - 0.5) * 0.032;
            const Theta = (SIdx / Spokes) * Math.PI * 2 + Jit;
            const Loc = OrbFrameEdgeLocal(Theta, R);
            const RawB = [Org[0] + BR[0] * Loc[0] + BU[0] * Loc[1], Org[1] + BR[1] * Loc[0] + BU[1] * Loc[1], Org[2] + BR[2] * Loc[0] + BU[2] * Loc[1]];
            const SB = SwayFn(RawB, 0.08);
            const PB = [RawB[0] + SB[0], RawB[1] + SB[1], RawB[2] + SB[2]];
            const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
            const Tip = [Hub[0] + (PB[0] - Hub[0]) * Grow, Hub[1] + (PB[1] - Hub[1]) * Grow, Hub[2] + (PB[2] - Hub[2]) * Grow];
            const Len = Math.hypot(PB[0] - Hub[0], PB[1] - Hub[1], PB[2] - Hub[2]);
            const HFrac = Math.min(1, Math.max(0.12, Math.hypot(PB[0] - Hub[0], PB[2] - Hub[2]) / Math.max(Len, 1e-4)));
            return { visible: true, pA: Hub, pB: Tip, tip: Tip, sag: SagBase * 0.20 * HFrac * Grow, windScale: 0.16, tipWhip: 0, grow: Grow, bead: Grow < 0.99 ? 1 : 0, role: 0.22 };
        }
        const SpiralIdx = Slot - 12 - Spokes;
        const MaxAvail = Math.max(1, Cap - 12 - Spokes);
        const TargetSegs = Math.min(MaxAvail, Spokes * Math.round(RingsT));
        if (SpiralIdx >= TargetSegs) return { visible: false };
        const T0 = 1.05 + SpiralIdx * (6.2 / Math.max(1, TargetSegs)), Dur = 0.028;
        if (TWeb < T0) return { visible: false };
        const S0 = SpiralIdx % Spokes, S1 = (SpiralIdx + 1) % Spokes;
        const HubSegs = Spokes * 2;
        const UTotal0 = Math.min(1, SpiralIdx / TargetSegs);
        const RF0 = SpiralIdx < HubSegs ? (0.035 + 0.07 * (SpiralIdx / Math.max(1, HubSegs))) : (0.20 + 0.72 * Math.pow(Math.max(0, (SpiralIdx - HubSegs) / Math.max(1, TargetSegs - HubSegs)), 0.92));
        const RF1 = (SpiralIdx + 1) < HubSegs ? (0.035 + 0.07 * ((SpiralIdx + 1) / Math.max(1, HubSegs))) : (0.20 + 0.72 * Math.pow(Math.max(0, (SpiralIdx + 1 - HubSegs) / Math.max(1, TargetSegs - HubSegs)), 0.92));
        const Th0 = (S0 / Spokes) * Math.PI * 2 + (WebHash(S0 * 19 + 3, 1) - 0.5) * 0.032;
        const Th1 = (S1 / Spokes) * Math.PI * 2 + (WebHash(S1 * 19 + 3, 1) - 0.5) * 0.032;
        const L0 = OrbFrameEdgeLocal(Th0, R), L1 = OrbFrameEdgeLocal(Th1, R);
        const R0 = [Org[0] + BR[0] * L0[0] + BU[0] * L0[1], Org[1] + BR[1] * L0[0] + BU[1] * L0[1], Org[2] + BR[2] * L0[0] + BU[2] * L0[1]];
        const R1 = [Org[0] + BR[0] * L1[0] + BU[0] * L1[1], Org[1] + BR[1] * L1[0] + BU[1] * L1[1], Org[2] + BR[2] * L1[0] + BU[2] * L1[1]];
        const SW0 = SwayFn(R0, 0.08), SW1 = SwayFn(R1, 0.08);
        const E0 = [R0[0] + SW0[0], R0[1] + SW0[1], R0[2] + SW0[2]];
        const E1 = [R1[0] + SW1[0], R1[1] + SW1[1], R1[2] + SW1[2]];
        const SpLen0 = Math.hypot(E0[0] - Hub[0], E0[1] - Hub[1], E0[2] - Hub[2]);
        const SpLen1 = Math.hypot(E1[0] - Hub[0], E1[1] - Hub[1], E1[2] - Hub[2]);
        const SpH0 = Math.min(1, Math.max(0.12, Math.hypot(E0[0] - Hub[0], E0[2] - Hub[2]) / Math.max(SpLen0, 1e-4)));
        const SpH1 = Math.min(1, Math.max(0.12, Math.hypot(E1[0] - Hub[0], E1[2] - Hub[2]) / Math.max(SpLen1, 1e-4)));
        const PA = [Hub[0] + (E0[0] - Hub[0]) * RF0, Hub[1] + (E0[1] - Hub[1]) * RF0 - 4 * SagBase * 0.20 * SpH0 * RF0 * (1 - RF0), Hub[2] + (E0[2] - Hub[2]) * RF0];
        const PB = [Hub[0] + (E1[0] - Hub[0]) * RF1, Hub[1] + (E1[1] - Hub[1]) * RF1 - 4 * SagBase * 0.20 * SpH1 * RF1 * (1 - RF1), Hub[2] + (E1[2] - Hub[2]) * RF1];
        const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
        const Tip = [PA[0] + (PB[0] - PA[0]) * Grow, PA[1] + (PB[1] - PA[1]) * Grow, PA[2] + (PB[2] - PA[2]) * Grow];
        const LenSeg = Math.hypot(PB[0] - PA[0], PB[1] - PA[1], PB[2] - PA[2]);
        const HSeg = Math.min(1, Math.max(0.12, Math.hypot(PB[0] - PA[0], PB[2] - PA[2]) / Math.max(LenSeg, 1e-4)));
        const SagSeg = SagBase * (0.22 + 0.55 * UTotal0) * HSeg * Math.min(1.25, Math.max(0.35, LenSeg / Math.max(0.28, R * 0.36))) * Grow;
        const Bead = Grow < 0.99 ? 1.0 : ((SpiralIdx % 3) === 0 ? 0.42 : 0.0);
        return { visible: true, pA: PA, pB: Tip, tip: Tip, sag: SagSeg, windScale: 0.07, tipWhip: 0, grow: Grow, bead: Bead, role: 0.45 + 0.50 * UTotal0 };
    }

    const Ext = [Math.max(0.65, P.boxHalf?.[0] || 2.05), Math.max(0.65, P.boxHalf?.[1] || 1.55), Math.max(0.65, P.boxHalf?.[2] || 1.65)];
    const NChords = Math.min(Math.floor(Cap / 2), Math.max(16, Math.floor(Cap * Math.min(0.38, Math.max(0.24, Spokes * 0.020)))));
    const NTangle = Math.min(Cap - 16, Math.max(NChords + 1, NChords + Math.floor(Cap * Math.min(0.42, Math.max(0.28, RingsT * 0.032)))));
    if (Slot < NChords)
    {
        const T0 = 0.04 + (Slot / NChords) * 1.45, Dur = 0.28;
        if (TWeb < T0) return { visible: false };
        const Ch = EvalCobwebChord(Slot, Org, BR, BU, BF, Ext, SagBase);
        const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
        const Tip = [Ch.a[0] + (Ch.b[0] - Ch.a[0]) * Grow, Ch.a[1] + (Ch.b[1] - Ch.a[1]) * Grow, Ch.a[2] + (Ch.b[2] - Ch.a[2]) * Grow];
        return { visible: true, pA: Ch.a, pB: Tip, tip: Tip, sag: Ch.sag * Grow, windScale: 0.22, tipWhip: 0, grow: Grow, bead: Grow < 0.99 ? 0.85 : 0, role: 0.2 };
    }
    if (Slot < NTangle)
    {
        const IdxT = Slot - NChords, SpanT = Math.max(1, NTangle - NChords);
        const T0 = 1.25 + (IdxT / SpanT) * 2.85, Dur = 0.16;
        if (TWeb < T0) return { visible: false };
        const Sd = Slot * 53 + 19;
        const CA = Math.floor(WebHash(Sd, 1) * NChords) % NChords;
        const Pocket = CA % 3;
        const Step3 = 1 + Math.floor(WebHash(Sd, 2) * Math.max(2, NChords / 4));
        const CB = (Pocket + (Math.floor((CA - Pocket) / 3) + Step3) * 3) % NChords;
        const UA = 0.10 + 0.80 * WebHash(Sd, 3), UB = 0.10 + 0.80 * WebHash(Sd, 4);
        const ChA = EvalCobwebChord(CA, Org, BR, BU, BF, Ext, SagBase);
        const ChB = EvalCobwebChord(CB, Org, BR, BU, BF, Ext, SagBase);
        const RawA = [ChA.a[0] + (ChA.b[0] - ChA.a[0]) * UA, ChA.a[1] + (ChA.b[1] - ChA.a[1]) * UA - 4 * ChA.sag * UA * (1 - UA), ChA.a[2] + (ChA.b[2] - ChA.a[2]) * UA];
        const RawB = [ChB.a[0] + (ChB.b[0] - ChB.a[0]) * UB, ChB.a[1] + (ChB.b[1] - ChB.a[1]) * UB - 4 * ChB.sag * UB * (1 - UB), ChB.a[2] + (ChB.b[2] - ChB.a[2]) * UB];
        const SA = SwayFn(RawA, 0.24 * 4 * UA * (1 - UA)), SB = SwayFn(RawB, 0.24 * 4 * UB * (1 - UB));
        const PA = [RawA[0] + SA[0], RawA[1] + SA[1], RawA[2] + SA[2]], PB = [RawB[0] + SB[0], RawB[1] + SB[1], RawB[2] + SB[2]];
        const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
        const Tip = [PA[0] + (PB[0] - PA[0]) * Grow, PA[1] + (PB[1] - PA[1]) * Grow, PA[2] + (PB[2] - PA[2]) * Grow];
        const Len = Math.hypot(PB[0] - PA[0], PB[1] - PA[1], PB[2] - PA[2]);
        const Sag = SagBase * (0.45 + 0.95 * WebHash(Sd, 5)) * Math.min(1.4, Math.max(0.3, Len / 1.8)) * Grow;
        return { visible: true, pA: PA, pB: Tip, tip: Tip, sag: Sag, windScale: 0.38, tipWhip: 0, grow: Grow, bead: Grow < 0.99 ? 0.85 : ((IdxT % 4) === 0 ? 0.3 : 0), role: 0.55 };
    }
    const IdxD = Slot - NTangle, SpanD = Math.max(1, Cap - NTangle);
    const T0 = 3.15 + (IdxD / SpanD) * 1.95, Dur = 0.22;
    if (TWeb < T0) return { visible: false };
    const Sd = Slot * 71 + 41;
    const CP = Math.floor(WebHash(Sd, 1) * NChords) % NChords;
    const UP = 0.16 + 0.68 * WebHash(Sd, 2);
    const ChP = EvalCobwebChord(CP, Org, BR, BU, BF, Ext, SagBase);
    const RawP = [ChP.a[0] + (ChP.b[0] - ChP.a[0]) * UP, ChP.a[1] + (ChP.b[1] - ChP.a[1]) * UP - 4 * ChP.sag * UP * (1 - UP), ChP.a[2] + (ChP.b[2] - ChP.a[2]) * UP];
    const SP = SwayFn(RawP, 0.24 * 4 * UP * (1 - UP));
    const PA = [RawP[0] + SP[0], RawP[1] + SP[1], RawP[2] + SP[2]];
    const DLen = 0.55 + 0.90 * WebHash(Sd, 3);
    const Dr = [(WebHash(Sd, 4) - 0.5) * 0.26, -DLen, (WebHash(Sd, 5) - 0.5) * 0.26];
    const SD = SwayFn([PA[0] + Dr[0], PA[1] + Dr[1], PA[2] + Dr[2]], 0.85, Amp * 1.25, Freq * 1.2);
    const PB = [PA[0] + Dr[0] + SD[0], PA[1] + Dr[1] + SD[1], PA[2] + Dr[2] + SD[2]];
    const Grow = Math.min(1, Math.max(0, (TWeb - T0) / Dur));
    const Tip = [PA[0] + (PB[0] - PA[0]) * Grow, PA[1] + (PB[1] - PA[1]) * Grow, PA[2] + (PB[2] - PA[2]) * Grow];
    return { visible: true, pA: PA, pB: Tip, tip: Tip, sag: 0.05 * DLen * Grow, windScale: 0.22, tipWhip: 1.15, grow: Grow, bead: Grow < 0.99 ? 0.85 : 0.24, role: 0.85 };
}

function EvalDynStrandCPU(P, Slot, Cap, DynMode, Time, WindT, FieldScene, Prepared, Solo, WindFactor)
{
    const Org = P.origin || [0, 2, 0];
    const [BR, BU, BF] = BasisFrom(P.dir || [0, 0, 1]);
    const Amp = P.curlAmp ?? 1.6;
    const Freq = Math.max(0.2, P.curlFreq ?? 0.95);
    const Stiff = Math.max(0.15, P.dynStiff ?? 1.0);
    const Rows = Math.max(4, Math.round(P.dynRows ?? 28));
    const Hgt = Math.max(0.35, P.dynHeight ?? 2.4);
    const Sag = P.dynSag ?? 0.35;
    const Sub = P.dynSub ?? 0;
    const WaveSpd = P.dynWaveSpeed ?? 2.2;
    const Ext = [Math.max(0.5, P.boxHalf?.[0] || 2.4), Math.max(0.5, P.boxHalf?.[1] || 2.0), Math.max(0.5, P.boxHalf?.[2] || 2.4)];
    const SwayFn = (Q, Ws, A = Amp, F = Freq) => WebSwayAt(Q[0], Q[1], Q[2], WindT, Ws, A, F, P.windCoupling ?? 1.0, FieldScene, Prepared, Solo, WindFactor);

    if (DynMode === 1)
    {
        const NStrands = Math.min(Cap, Math.max(12, Rows * 2));
        if (Slot >= NStrands) return { visible: false };
        const Tier = Slot % 3;
        const Lane = Math.floor(Slot / 3) / Math.max(1, Math.floor(NStrands / 3) - 1);
        const YTier = Org[1] + Hgt * (0.56 + 0.19 * Tier);
        const ZOff = (-Ext[2] + 2 * Ext[2] * Lane) + (WebHash(Slot * 41 + 19, 1) - 0.5) * 0.22;
        const XJit = (WebHash(Slot * 41 + 19, 2) - 0.5) * 0.18;
        const PA = [Org[0] - Ext[0] + XJit, YTier, Org[2] + ZOff];
        const PB = [Org[0] + Ext[0] - XJit, YTier + (WebHash(Slot * 41 + 19, 3) - 0.5) * 0.18, Org[2] + ZOff + (WebHash(Slot * 41 + 19, 4) - 0.5) * 0.16];
        return { visible: true, kind: 1, pA: PA, pB: PB, sag: Sag * (0.65 + 0.72 * WebHash(Slot * 41 + 19, 5)), windScale: 0.35 / Stiff, pinnedEnd: true, radius: (P.sizeStart || 0.045) * (Sub > 0.5 ? 1.3 : 1.0) };
    }
    if (DynMode === 2)
    {
        const NVines = Math.min(Math.floor(Cap / 2), Math.max(8, Rows));
        if (Slot < NVines)
        {
            const Sd = Slot * 41 + 19;
            const UX = WebHash(Sd, 1) * 2 - 1;
            const UZ = WebHash(Sd, 2) * 2 - 1;
            const YTop = Org[1] + Hgt * (0.86 + 0.18 * WebHash(Sd, 3));
            const Len = Math.max(0.75, Math.min(Math.max(0.95, YTop - 0.25), Sag * (0.62 + 0.53 * WebHash(Sd, 4))));
            const PA = [Org[0] + UX * Ext[0], YTop, Org[2] + UZ * Ext[2]];
            const PB = [PA[0] + (WebHash(Sd, 5) - 0.5) * 0.28, Math.max(0.25, PA[1] - Len), PA[2] + (WebHash(Sd, 6) - 0.5) * 0.28];
            return { visible: true, kind: 2, isLeaf: false, pA: PA, pB: PB, sag: Sag * 0.04, windScale: 0.65 / Stiff, pinnedEnd: false, radius: P.sizeStart || 0.036 };
        }
        const LIdx = Slot - NVines;
        const VIdx = LIdx % NVines;
        const UPin = 0.14 + 0.80 * WebHash(Slot * 31 + 3, 2);
        return { visible: true, kind: 2, isLeaf: true, parentSlot: VIdx, uPin: UPin, offAngle: WebHash(Slot * 31, 4) * Math.PI * 2, radius: (P.sizeStart || 0.036) * 2.6 };
    }
    if (DynMode === 3)
    {
        const NRows = Math.min(Cap, Math.max(10, Math.min(44, Rows)));
        if (Slot >= NRows) return { visible: false };
        const RowV = NRows > 1 ? Slot / (NRows - 1) : 0.5;
        const YTop = Org[1] + Hgt;
        if (Sub < 0.5)
        {
            const MastX = Org[0] - Ext[0];
            const FH = Math.max(0.65, Ext[1] * 1.75);
            const YRow = Math.max(0.35, YTop - FH) + (YTop - Math.max(0.35, YTop - FH)) * RowV;
            const FDirX = BR[0] !== undefined ? ((P.dir?.[0] ?? 1) / (Math.hypot(P.dir?.[0] ?? 1, P.dir?.[2] ?? 0) || 1)) : 1;
            const FDirZ = (P.dir?.[2] ?? 0) / (Math.hypot(P.dir?.[0] ?? 1, P.dir?.[2] ?? 0) || 1);
            const FLen = Math.max(0.8, Ext[0] * 2.0);
            const PA = [MastX, YRow, Org[2]];
            const PB = [MastX + FDirX * FLen, YRow, Org[2] + FDirZ * FLen];
            return { visible: true, kind: 3, rowV: RowV, nRows: NRows, waveSpd: WaveSpd, pA: PA, pB: PB, sag: 0.04, windScale: 0.65 / Stiff, pinnedEnd: false, radius: (FH / Math.max(1, NRows - 1)) * 0.60 };
        }
        const SH = Math.max(0.8, Ext[1] * 1.85);
        const YRow = Math.max(0.45, YTop - SH) + (YTop - Math.max(0.45, YTop - SH)) * RowV;
        const HalfW = Ext[0] * (1.06 - 0.16 * RowV);
        const PA = [Org[0] - HalfW, YRow, Org[2]];
        const PB = [Org[0] + HalfW, YRow, Org[2]];
        const BellySag = -Sag * Math.sin(RowV * Math.PI);
        return { visible: true, kind: 3, rowV: RowV, nRows: NRows, waveSpd: WaveSpd, pA: PA, pB: PB, sag: BellySag, windScale: 0.55 / Stiff, pinnedEnd: true, radius: (SH / Math.max(1, NRows - 1)) * 0.60 };
    }
    if (DynMode === 4 || DynMode === 5)
    {
        const Sd = Slot * 41 + 17;
        const Ax = (WebHash(Sd, 1) * 2 - 1) * Ext[0];
        const Az = (WebHash(Sd, 2) * 2 - 1) * Ext[2];
        const PA = [Org[0] + Ax, Math.max(0, Org[1]), Org[2] + Az];
        const BladeH = Hgt * (0.62 + 0.58 * WebHash(Sd, 3));
        const Lean = (WebHash(Sd, 4) - 0.5) * (DynMode === 5 ? 0.28 : 0.45) * BladeH;
        const LeanZ = (WebHash(Sd, 5) - 0.5) * (DynMode === 5 ? 0.28 : 0.45) * BladeH;
        const Bend = DynMode === 4 ? (0.18 + 0.14 * WebHash(Sd, 6)) : 0.05;
        const WindG = SwayFn([PA[0], PA[1] + BladeH * 0.7, PA[2]], 0.9 / Stiff, Amp, Freq);
        const PB = [PA[0] + Lean + WindG[0] * 0.72, PA[1] + BladeH * (1 - Bend * 0.35), PA[2] + LeanZ + WindG[2] * 0.72];
        return { visible: true, kind: DynMode, sub: Sub, hasTip: DynMode === 5 ? (Slot % 3 !== 0) : (Sub > 0.5 && (Slot % 2 === 0)), pA: PA, pB: PB, sag: -BladeH * Bend * 0.45, windScale: (DynMode === 5 ? 0.45 : 0.75) / Stiff, radius: (P.sizeStart || 0.025) * (0.75 + 0.55 * WebHash(Sd, 7)) };
    }
    if (DynMode === 6)
    {
        const NFronds = Math.min(Cap, Math.max(10, Rows));
        if (Slot >= NFronds) return { visible: false };
        const Ring = Slot < Math.floor(NFronds * 0.35) ? 0 : (Slot < Math.floor(NFronds * 0.72) ? 1 : 2);
        const Az = (Slot / NFronds) * Math.PI * 2 + WebHash(Slot * 29, 1) * 0.22;
        const Elev = Ring === 0 ? 1.05 : (Ring === 1 ? 0.62 : 0.28);
        const FLen = Hgt * (Ring === 0 ? 0.78 : (Ring === 1 ? 1.05 : 1.18)) * (0.85 + 0.28 * WebHash(Slot * 29, 2));
        const ClumpJit = ((Slot % 3) - 1) * 0.12;
        const PA = [Org[0] + ClumpJit, Math.max(0.05, Org[1]), Org[2] + (WebHash(Slot * 29, 3) - 0.5) * 0.14];
        const RadR = Math.cos(Elev) * FLen, TopY = Math.sin(Elev) * FLen;
        const WindG = SwayFn([PA[0] + Math.cos(Az) * RadR, PA[1] + TopY, PA[2] + Math.sin(Az) * RadR], 0.55 / Stiff, Amp, Freq);
        const PB = [PA[0] + Math.cos(Az) * RadR + WindG[0] * 0.55, Math.max(0.18, PA[1] + TopY - Sag * FLen * 0.18), PA[2] + Math.sin(Az) * RadR + WindG[2] * 0.55];
        return { visible: true, kind: 6, pA: PA, pB: PB, sag: -Sag * FLen * 0.32, windScale: 0.48 / Stiff, radius: (P.sizeStart || 0.16) * (0.85 + 0.3 * WebHash(Slot * 29, 4)) };
    }
    const NLimbs = Math.max(8, Math.min(28, Rows));
    const TrunkBase = [Org[0], Math.max(0, Org[1]), Org[2]];
    const TrunkTop = [Org[0] + 0.08, TrunkBase[1] + Hgt * 0.62, Org[2] - 0.05];
    if (Slot === 0)
        return { visible: true, kind: 7, role: 'trunk', pA: TrunkBase, pB: TrunkTop, sag: 0.04, windScale: 0.06 / Stiff, radius: Math.max(0.14, (P.sizeStart || 0.22) * 1.4) };
    if (Slot <= NLimbs)
    {
        const LIdx = Slot - 1;
        const Tier = LIdx / Math.max(1, NLimbs - 1);
        const Az = LIdx * 2.39996 + WebHash(Slot * 37, 1) * 0.35;
        const AnchU = 0.42 + 0.56 * Tier;
        const PA = [TrunkBase[0] + (TrunkTop[0] - TrunkBase[0]) * AnchU, TrunkBase[1] + (TrunkTop[1] - TrunkBase[1]) * AnchU, TrunkBase[2] + (TrunkTop[2] - TrunkBase[2]) * AnchU];
        const Reach = Hgt * (0.58 - 0.24 * Tier) * (0.82 + 0.35 * WebHash(Slot * 37, 2));
        const Lift = Hgt * (0.18 + 0.34 * Tier);
        const PB = [PA[0] + Math.cos(Az) * Reach, PA[1] + Lift, PA[2] + Math.sin(Az) * Reach];
        return { visible: true, kind: 7, role: 'limb', anchU: AnchU, pA: PA, pB: PB, sag: -Reach * 0.14, windScale: 0.22 / Stiff, radius: Math.max(0.032, (P.sizeStart || 0.22) * (0.55 - 0.28 * Tier)) };
    }
    const LeafIdx = Slot - 1 - NLimbs;
    const ParentLimb = 1 + (LeafIdx % NLimbs);
    const UBranch = 0.38 + 0.62 * WebHash(Slot * 43, 1);
    const OffA = WebHash(Slot * 43, 2) * Math.PI * 2;
    const OffR = 0.18 + 0.55 * WebHash(Slot * 43, 3);
    const OffY = (WebHash(Slot * 43, 4) - 0.32) * 0.52;
    return {
        visible: true, kind: 7, role: 'leaf', parentSlot: ParentLimb, uBranch: UBranch,
        off: [Math.cos(OffA) * OffR, OffY, Math.sin(OffA) * OffR],
        radius: Math.max(0.055, (P.sizeStart || 0.22) * (0.34 + 0.22 * WebHash(Slot * 43, 5)))
    };
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
            stats_: { alive: 0, energy: 0, A: 0, B: 0, C: 0 },
            readbackMs: 0.14,
            readbackCount: 0,
            particles: [],
            splashes: [],
            cpu: new Float32Array(64),
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

    render({ glob, fields, comps, fieldScene, preparedField, clear, floor, arrows, lines, lineCount, meshes, meshCount, arcSegs, arcFlashes, jobs, probe })
    {
        if (!this.ctx && this.canvas) this.ctx = this.canvas.getContext('2d');
        const Ctx = this.ctx;
        if (!Ctx) return;
        const W = this.canvas.width, H = this.canvas.height;
        const VP = glob.subarray(0, 16);
        const CamX = glob[24], CamY = glob[25], CamZ = glob[26];
        const Time = glob[40], GlobalDt = glob[41];
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

        // Domain, Origin & 3D Force Wireframes / Flowlines / Lightning & Static Arc Filaments
        if (lines && lineCount > 0)
        {
            Ctx.lineCap = 'round';
            for (let I = 0; I < lineCount - 1; I += 2)
            {
                const O0 = I * 7, O1 = (I + 1) * 7;
                const A = ProjectPoint(VP, lines[O0], lines[O0 + 1], lines[O0 + 2], W, H);
                const B = ProjectPoint(VP, lines[O1], lines[O1 + 1], lines[O1 + 2], W, H);
                if (!A || !B) continue;
                const R0 = lines[O0 + 3], G0 = lines[O0 + 4], B0 = lines[O0 + 5], A0 = lines[O0 + 6];
                Ctx.lineWidth = (R0 > 0.88 && G0 > 0.88 && B0 > 0.90 && A0 >= 0.94) ? 2.1 : (A0 >= 0.94 && B0 > 0.82 ? 1.5 : 1.2);
                Ctx.strokeStyle = `rgba(${Math.round(R0 * 255)}, ${Math.round(G0 * 255)}, ${Math.round(B0 * 255)}, ${A0})`;
                Ctx.beginPath(); Ctx.moveTo(A[0], A[1]); Ctx.lineTo(B[0], B[1]); Ctx.stroke();
            }
        }

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
                const R = U < 0.58 ? 0.72 + 0.20 * (U / 0.58) : 0.92 + 0.08 * ((U - 0.58) / 0.42);
                const G = U < 0.58 ? 0.24 + 0.28 * (U / 0.58) : 0.52 + 0.46 * ((U - 0.58) / 0.42);
                const B = U < 0.58 ? 0.16 + 0.24 * (U / 0.58) : 0.40 + 0.56 * ((U - 0.58) / 0.42);
                return `rgba(${Math.round(R * 255)},${Math.round(G * 255)},${Math.round(B * 255)},0.96)`;
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
                        const Len = Style === 2
                            ? Math.min(CellX, CellZ) * (0.62 + 0.36 * T)
                            : Math.min(CellX, CellZ) * (0.68 + 0.95 * T);
                        const A = Style === 2
                            ? ProjectPoint(VP, Wx - Dx * Len * 0.44, Wy - Dy * Len * 0.44, Wz - Dz * Len * 0.44, W, H)
                            : ProjectPoint(VP, Wx - Dx * Len * 0.35, Wy - Dy * Len * 0.35, Wz - Dz * Len * 0.35, W, H);
                        const B = Style === 2
                            ? ProjectPoint(VP, Wx + Dx * Len * 0.44, Wy + Dy * Len * 0.44, Wz + Dz * Len * 0.44, W, H)
                            : ProjectPoint(VP, Wx + Dx * Len * 0.25, Wy + Dy * Len * 0.25, Wz + Dz * Len * 0.25, W, H);
                        const Tip = Style === 2 ? B : ProjectPoint(VP, Wx + Dx * Len * 0.64, Wy + Dy * Len * 0.64, Wz + Dz * Len * 0.64, W, H);
                        if (!A || !B || !Tip) continue;
                        const Col = Style === 1 ? EngCss(T) : Style === 2 ? DashCss(T) : DirCss(Dx, Dy, Dz, T);
                        ArrowsDraw.push({ D: Tip[2], A, B, Tip, Col, T });
                    }
                }
            }
            ArrowsDraw.sort((P, Q) => Q.D - P.D);
            Ctx.lineCap = Style === 2 ? 'butt' : 'round';
            for (const Ar of ArrowsDraw)
            {
                Ctx.strokeStyle = Ar.Col;
                Ctx.lineWidth = Style === 2
                    ? Math.max(1.15, (1.15 + Math.pow(Ar.T, 1.45) * 5.4) * Math.min(1.4, 9.5 / Math.max(3, Ar.D)))
                    : 1.55;
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

        const BallX = glob[52] || 0, BallY = glob[53] || 0, BallZ = glob[54] || 0, BallR = glob[55] || 0;
        const BallVx = glob[56] || 0, BallVy = glob[57] || 0, BallVz = glob[58] || 0;
        const BallSpd = Math.hypot(BallVx, BallVy, BallVz);

        // Advance and draw software preview particles
        for (const Job of jobs)
        {
            const Sys = Job.gpu, P = Sys.P;
            const Dt = GlobalDt > 0 ? GlobalDt : ((Job.simulate && Job.emitN > 0) ? (Job.cpu?.[28] || 1 / 60) : 0);
            const Tr = P.kind === 5 ? (P.transition || null) : null;
            const DynMode = !Tr && P.arcMode !== 0 && P.arcMode !== 1 && !(P.beamMode > 0) && P.kind !== 6 ? Math.max(0, Math.min(7, P.dynMode | 0)) : 0;
            const WebMode = !Tr && DynMode === 0 && P.arcMode !== 0 && P.arcMode !== 1 && !(P.beamMode > 0) && P.kind !== 6 ? Math.max(0, Math.min(2, P.webMode | 0)) : 0;
            const CurlMode = DynMode > 0 ? (5 + DynMode) : (WebMode > 0 ? (3 + WebMode) : (P.curlMode || 0));
            if (Job.simulate && Dt > 0)
            {
                const MaxSoft = (WebMode > 0 || DynMode > 0) ? Sys.cap : (Tr ? Math.min(Sys.cap, 384) : (CurlMode === 3 ? Math.min(Sys.cap, 520) : (CurlMode > 0 ? Math.min(Sys.cap, 1250) : Math.min(Sys.cap, 360))));
                const BHx = P.boxHalf?.[0] || 0.8, BHy = P.boxHalf?.[1] || BHx, BHz = P.boxHalf?.[2] || BHx;
                {
                    if (Job.emitN > 0)
                    {
                        if (Job.preseedCurtain || (CurlMode > 0 && WebMode === 0 && DynMode === 0 && Sys.particles.length < 24)) Sys.preseedCurtain = true;
                        const Basis = BasisFrom(P.dir || [0, 1, 0]);
                        const [Bu, Bv, Bw] = Basis;
                        const PerStepMax = (WebMode > 0 || DynMode > 0) ? MaxSoft : (Tr ? MaxSoft : (CurlMode > 0 ? (Sys.preseedCurtain ? (CurlMode === 3 ? 520 : 1100) : 120) : (P.arcMode === 0 || P.arcMode === 1 ? 80 : (Sys.preseedCurtain ? 260 : 28))));
                        const SpawnCap = (WebMode > 0 || DynMode > 0)
                            ? Math.max(0, MaxSoft - Sys.particles.length)
                            : Math.min(PerStepMax, Sys.preseedCurtain && CurlMode > 0 ? MaxSoft : Job.emitN, Math.max(0, MaxSoft - Sys.particles.length));
                        const CosMax = Math.cos(P.spread ?? 0.6);
                        const EmitSh = P.emitShape ?? 0;
                        const Rad = P.radius || 0.25;
                        const CurlFreq = P.curlFreq || 0.85, CurlAmp = P.curlAmp || 2.2, CurlRate = P.curlRate || 0.24;
                        const DriftX = Time * CurlRate, DriftY = -Time * CurlRate * 0.65, DriftZ = Time * CurlRate * 0.8;
                        const SurfaceCell = (Idx, Tot) => {
                            const G = Math.max(1, Math.floor(Math.sqrt(Math.max(6, Tot) / 6)));
                            const Cells = G * G, Face = Idx % 6, Cell = Math.floor(Idx / 6) % Cells;
                            const Cu = ((Cell % G) + 0.5) / G * 2 - 1, Cv = (Math.floor(Cell / G) + 0.5) / G * 2 - 1;
                            const Ax = Math.floor(Face / 2), Sg = (Face % 2 === 0) ? 1 : -1;
                            const Lp = [0, 0, 0];
                            Lp[Ax] = Sg; Lp[(Ax + 1) % 3] = Cu; Lp[(Ax + 2) % 3] = Cv;
                            return Lp;
                        };
                        const EOrig = Job.origin || P.origin;
                        for (let I = 0; I < SpawnCap; I++)
                        {
                            let Px = EOrig[0], Py = EOrig[1], Pz = EOrig[2];
                            if (CurlMode === 2)
                            {
                                const SR = Math.max(0.25, P.shellRadius || P.radius || 1.65);
                                const U1 = Math.random() * 2 - 1, A1 = Math.random() * Math.PI * 2;
                                const Sr = Math.sqrt(Math.max(0, 1 - U1 * U1));
                                const Rm = SR * (0.97 + 0.06 * Math.random());
                                Px += Sr * Math.cos(A1) * Rm; Py += U1 * Rm; Pz += Sr * Math.sin(A1) * Rm;
                            }
                            else if (EmitSh === 1)
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
                                const Lp = SurfaceCell(I, SpawnCap);
                                Px += Lp[0] * BHx; Py += Lp[1] * BHy; Pz += Lp[2] * BHz;
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

                            let SpawnY = Py;
                            let SpawnAge = 0;
                            let Crest = 0.4;
                            let Trail = null;
                            let SlotIdx = Sys.particles.length;
                            let DynMeta = null;
                            if (DynMode > 0)
                            {
                                const StDyn = EvalDynStrandCPU(P, SlotIdx, Math.max(16, Sys.cap), DynMode, Time, Time, fieldScene, Prepared, Solo, WindScale);
                                DynMeta = StDyn;
                                Life = 1e9;
                                Vx = 0; Vy = 0; Vz = 0;
                                Trail = [];
                                if (StDyn.visible && StDyn.pA && StDyn.pB)
                                {
                                    for (let K = 0; K < 20; K++)
                                    {
                                        const U = K / 19;
                                        Trail.push([
                                            StDyn.pA[0] + (StDyn.pB[0] - StDyn.pA[0]) * U,
                                            StDyn.pA[1] + (StDyn.pB[1] - StDyn.pA[1]) * U - 4 * (StDyn.sag || 0) * U * (1 - U),
                                            StDyn.pA[2] + (StDyn.pB[2] - StDyn.pA[2]) * U
                                        ]);
                                    }
                                    Px = Trail[19][0]; SpawnY = Trail[19][1]; Pz = Trail[19][2];
                                }
                                else
                                {
                                    Px = EOrig[0]; SpawnY = EOrig[1]; Pz = EOrig[2];
                                    for (let K = 0; K < 20; K++) Trail.push([Px, SpawnY, Pz]);
                                }
                            }
                            else if (WebMode > 0)
                            {
                                Px = EOrig[0]; SpawnY = EOrig[1]; Pz = EOrig[2];
                                Vx = 0; Vy = 0; Vz = 0;
                                Life = 1e9;
                                Trail = [];
                                for (let K = 0; K < 20; K++) Trail.push([Px, SpawnY, Pz]);
                            }
                            else if (CurlMode === 3)
                            {
                                const FR = Time * CurlRate;
                                const PMode = P.pulseMode || 0;
                                const ObjSh = P.objectShape ?? 0;
                                const ExtX = Math.max(0.45, BHx), ExtY = Math.max(0.45, BHy), ExtZ = Math.max(0.45, BHz);
                                const AxI = (P.pulseAxis ?? 1) % 3;
                                const PtSeed = Math.random() * 65536;
                                if (PMode > 0)
                                {
                                    const PD = AxI === 0 ? [1, 0, 0] : (AxI === 2 ? [0, 0, 1] : [0, -1, 0]);
                                    const B = BasisFrom(PD);
                                    const Phi = Math.random() * Math.PI * 2;
                                    const UFrac = Sys.preseedCurtain ? (0.04 + Math.random() * 0.84) : (0.04 + Math.random() * 0.16);
                                    let Rel = [0, 0, 0];
                                    if (ObjSh === 1)
                                    {
                                        const R = Math.max(ExtX, 0.35) * 1.02;
                                        const Theta = Math.max(0.08, Math.min(3.04, UFrac * 2.95 + 0.08));
                                        const Ct = Math.cos(Theta), St = Math.sin(Theta), Cp = Math.cos(Phi), Sp = Math.sin(Phi);
                                        Rel = [
                                            (-PD[0] * Ct + (B[0][0] * Cp + B[1][0] * Sp) * St) * R,
                                            (-PD[1] * Ct + (B[0][1] * Cp + B[1][1] * Sp) * St) * R,
                                            (-PD[2] * Ct + (B[0][2] * Cp + B[1][2] * Sp) * St) * R
                                        ];
                                    }
                                    else if (ObjSh === 2)
                                    {
                                        const R = Math.max(ExtX, 0.35) * 1.02, Hy = Math.max(ExtY, 0.35);
                                        if (Sys.preseedCurtain && UFrac > 0.2)
                                            Rel = [Math.cos(Phi) * R, Hy - ((UFrac - 0.2) / 0.8) * 1.85 * Hy, Math.sin(Phi) * R];
                                        else
                                        {
                                            const Rr = R * (0.12 + 0.86 * Math.sqrt(Math.random()));
                                            Rel = [Math.cos(Phi) * Rr, Hy * 1.01, Math.sin(Phi) * Rr];
                                        }
                                    }
                                    else
                                    {
                                        const ExA = AxI === 0 ? ExtX : (AxI === 1 ? ExtY : ExtZ);
                                        let Bx = -PD[0] * ExA, By = -PD[1] * ExA, Bz = -PD[2] * ExA;
                                        if (Sys.preseedCurtain && UFrac > 0.22)
                                        {
                                            const Fr = (UFrac - 0.22) / 0.78;
                                            Bx += PD[0] * Fr * 1.85 * ExA; By += PD[1] * Fr * 1.85 * ExA; Bz += PD[2] * Fr * 1.85 * ExA;
                                            const Side = I % 4, W1 = (Math.random() * 2 - 1), S1 = (Side % 2 === 0 ? 1 : -1);
                                            const P1 = Side < 2 ? S1 * ExtX : W1 * ExtX, P2 = Side < 2 ? W1 * ExtZ : S1 * ExtZ;
                                            Bx += B[0][0] * P1 + B[1][0] * P2; By += B[0][1] * P1 + B[1][1] * P2; Bz += B[0][2] * P1 + B[1][2] * P2;
                                        }
                                        else
                                        {
                                            const SpR = (0.15 + 0.72 * Math.sqrt(Math.random())) * Math.min(ExtX, ExtZ);
                                            Bx += (B[0][0] * Math.cos(Phi) + B[1][0] * Math.sin(Phi)) * SpR;
                                            By += (B[0][1] * Math.cos(Phi) + B[1][1] * Math.sin(Phi)) * SpR;
                                            Bz += (B[0][2] * Math.cos(Phi) + B[1][2] * Math.sin(Phi)) * SpR;
                                        }
                                        Rel = ProjectObjSurface(Bx, By, Bz, 0, ExtX, ExtY, ExtZ);
                                    }
                                    Px = P.origin[0] + Rel[0]; SpawnY = P.origin[1] + Rel[1]; Pz = P.origin[2] + Rel[2];
                                    const Rv = SurfacePourVel(Px, SpawnY, Pz, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ, ObjSh, AxI, FR, CurlFreq, CurlAmp, PtSeed);
                                    Vx = Rv[0]; Vy = Rv[1]; Vz = Rv[2];
                                    Crest = Math.min(1, Math.hypot(Vx, Vy, Vz) / Math.max(CurlAmp * 1.25, 0.2));
                                    if (Sys.preseedCurtain) SpawnAge = Math.random() * Life * 0.72;
                                    Trail = [];
                                    let Tx = Px, Ty = SpawnY, Tz = Pz;
                                    const StepDt = 0.036;
                                    for (let K = 0; K < 18; K++)
                                    {
                                        const Prj = ProjectObjSurface(Tx - P.origin[0], Ty - P.origin[1], Tz - P.origin[2], ObjSh, ExtX, ExtY, ExtZ);
                                        Tx = P.origin[0] + Prj[0]; Ty = P.origin[1] + Prj[1]; Tz = P.origin[2] + Prj[2];
                                        Trail.push([Tx, Ty, Tz]);
                                        const Bv = SurfacePourVel(Tx, Ty, Tz, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ, ObjSh, AxI, FR - K * StepDt * CurlRate, CurlFreq, CurlAmp, PtSeed);
                                        Tx -= Bv[0] * StepDt; Ty -= Bv[1] * StepDt; Tz -= Bv[2] * StepDt;
                                    }
                                }
                                else
                                {
                                    const Rv = StreamRibbonVel(Px, SpawnY, Pz, FR, CurlFreq, CurlAmp, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ);
                                    Vx = Rv[0]; Vy = Rv[1]; Vz = Rv[2];
                                    Crest = Math.min(1, Math.hypot(Vx, Vy, Vz) / Math.max(CurlAmp * 1.4, 0.2));
                                    if (Sys.preseedCurtain) SpawnAge = Math.random() * Life * 0.78;
                                    Trail = [];
                                    let Tx = Px, Ty = SpawnY, Tz = Pz;
                                    const StepDt = 0.044;
                                    for (let K = 0; K < 18; K++)
                                    {
                                        Trail.push([Tx, Ty, Tz]);
                                        const Bv = StreamRibbonVel(Tx, Ty, Tz, FR - K * StepDt * CurlRate, CurlFreq, CurlAmp, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ);
                                        Tx -= Bv[0] * StepDt;
                                        Ty = Math.max(0.08, Ty - Bv[1] * StepDt);
                                        Tz -= Bv[2] * StepDt;
                                    }
                                }
                            }
                            else if (CurlMode > 0)
                            {
                                const Qx = Px * CurlFreq + DriftX, Qy = SpawnY * CurlFreq + DriftY, Qz = Pz * CurlFreq + DriftZ;
                                const C1 = AnalyticCurl3(Qx, Qy, Qz);
                                const C2 = AnalyticCurl3(Qx * 2.2 - DriftX, Qy * 2.2 + DriftY, Qz * 2.2 - DriftZ);
                                let Cvx = (C1[0] + 0.45 * C2[0]) * CurlAmp * 0.55;
                                let Cvy = (C1[1] + 0.45 * C2[1]) * CurlAmp * 0.55;
                                let Cvz = (C1[2] + 0.45 * C2[2]) * CurlAmp * 0.55;
                                if (CurlMode === 2)
                                {
                                    const Rx = Px - P.origin[0], Ry = SpawnY - P.origin[1], Rz = Pz - P.origin[2];
                                    const Rl = Math.hypot(Rx, Ry, Rz) || 1;
                                    const Nx = Rx / Rl, Ny = Ry / Rl, Nz = Rz / Rl;
                                    const Dd = Cvx * Nx + Cvy * Ny + Cvz * Nz;
                                    Cvx -= Nx * Dd; Cvy -= Ny * Dd; Cvz -= Nz * Dd;
                                }
                                Vx = Cvx; Vy = Cvy; Vz = Cvz;
                                Crest = Math.min(1, Math.hypot(Vx, Vy, Vz) / Math.max(CurlAmp * 1.15, 0.2));
                                if (Sys.preseedCurtain) SpawnAge = Math.random() * Life * 0.82;
                            }
                            else if (Sys.preseedCurtain && I < SpawnCap - 1)
                            {
                                SpawnY = 0.65 + Math.random() * Math.max(1, P.origin[1] - 0.65);
                                SpawnAge = Math.random() * Life * 0.42;
                            }
                            if (P.arcMode === 0 || P.arcMode === 1)
                            {
                                const Tp = P.targetPos || [P.origin[0] + 4, P.origin[1], P.origin[2]];
                                const RadA = Math.max(0.08, P.radius || 0.45);
                                const RadB = Math.max(0.08, P.targetRadius || 0.45);
                                let Dx = Tp[0] - P.origin[0], Dy = Tp[1] - P.origin[1], Dz = Tp[2] - P.origin[2];
                                const DL = Math.hypot(Dx, Dy, Dz) || 1;
                                Dx /= DL; Dy /= DL; Dz /= DL;
                                const Uu = Math.random() * 2 - 1, Aa = Math.random() * Math.PI * 2;
                                const Sr = Math.sqrt(Math.max(0, 1 - Uu * Uu));
                                const Jx = Sr * Math.cos(Aa), Jy = Uu, Jz = Sr * Math.sin(Aa);
                                const Sp = (P.speedMin || 1) + Math.random() * Math.max(0.1, (P.speedMax || 3) - (P.speedMin || 1));
                                if (Math.random() < 0.64)
                                {
                                    let Sx = -Dx * 0.94 + Jx * 0.34, Sy = -Dy * 0.94 + Jy * 0.34, Sz = -Dz * 0.94 + Jz * 0.34;
                                    const SL = Math.hypot(Sx, Sy, Sz) || 1;
                                    Sx /= SL; Sy /= SL; Sz /= SL;
                                    const DotJ = Jx * Sx + Jy * Sy + Jz * Sz;
                                    let Tx = Jx - Sx * DotJ, Ty = Jy - Sy * DotJ, Tz = Jz - Sz * DotJ;
                                    const TL = Math.hypot(Tx, Ty, Tz) || 1;
                                    Tx /= TL; Ty /= TL; Tz /= TL;
                                    Px = Tp[0] + Sx * (RadB * 1.01); SpawnY = Tp[1] + Sy * (RadB * 1.01); Pz = Tp[2] + Sz * (RadB * 1.01);
                                    Vx = (Tx * 0.72 + Sx * 0.46) * Sp; Vy = (Ty * 0.72 + Sy * 0.46) * Sp; Vz = (Tz * 0.72 + Sz * 0.46) * Sp;
                                }
                                else
                                {
                                    let Sx = Dx * 0.94 + Jx * 0.34, Sy = Dy * 0.94 + Jy * 0.34, Sz = Dz * 0.94 + Jz * 0.34;
                                    const SL = Math.hypot(Sx, Sy, Sz) || 1;
                                    Sx /= SL; Sy /= SL; Sz /= SL;
                                    const DotJ = Jx * Sx + Jy * Sy + Jz * Sz;
                                    let Tx = Jx - Sx * DotJ, Ty = Jy - Sy * DotJ, Tz = Jz - Sz * DotJ;
                                    const TL = Math.hypot(Tx, Ty, Tz) || 1;
                                    Tx /= TL; Ty /= TL; Tz /= TL;
                                    Px = P.origin[0] + Sx * (RadA * 1.01); SpawnY = P.origin[1] + Sy * (RadA * 1.01); Pz = P.origin[2] + Sz * (RadA * 1.01);
                                    Vx = (Tx * 0.72 + Sx * 0.46) * Sp; Vy = (Ty * 0.72 + Sy * 0.46) * Sp; Vz = (Tz * 0.72 + Sz * 0.46) * Sp;
                                }
                            }
                            if ((P.beamMode || 0) > 0)
                            {
                                const Tp = P.targetPos || [P.origin[0] + 4, P.origin[1], P.origin[2]];
                                let Dx = Tp[0] - P.origin[0], Dy = Tp[1] - P.origin[1], Dz = Tp[2] - P.origin[2];
                                const DL = Math.hypot(Dx, Dy, Dz) || 1;
                                Dx /= DL; Dy /= DL; Dz /= DL;
                                const Uu = Math.random() * 2 - 1, Aa = Math.random() * Math.PI * 2;
                                const Sr = Math.sqrt(Math.max(0, 1 - Uu * Uu));
                                const Jx = Sr * Math.cos(Aa), Jy = Uu, Jz = Sr * Math.sin(Aa);
                                const Sp = (P.speedMin || 2) + Math.random() * Math.max(0.2, (P.speedMax || 8) - (P.speedMin || 2));
                                const Sel = Math.random();
                                if (Sel < 0.48)
                                {
                                    let Sx = -Dx * 0.78 + Jx * 0.62, Sy = -Dy * 0.78 + Jy * 0.62, Sz = -Dz * 0.78 + Jz * 0.62;
                                    const SL = Math.hypot(Sx, Sy, Sz) || 1;
                                    Px = Tp[0] + (Sx / SL) * 0.04; SpawnY = Tp[1] + (Sy / SL) * 0.04; Pz = Tp[2] + (Sz / SL) * 0.04;
                                    Vx = (Sx / SL) * Sp; Vy = (Sy / SL) * Sp; Vz = (Sz / SL) * Sp;
                                }
                                else if (Sel < 0.74)
                                {
                                    let Mx = Dx * 0.68 + Jx * 0.72, My = Dy * 0.68 + Jy * 0.72, Mz = Dz * 0.68 + Jz * 0.72;
                                    const ML = Math.hypot(Mx, My, Mz) || 1;
                                    Px = P.origin[0] + (Mx / ML) * 0.04; SpawnY = P.origin[1] + (My / ML) * 0.04; Pz = P.origin[2] + (Mz / ML) * 0.04;
                                    Vx = (Mx / ML) * Sp * 0.72; Vy = (My / ML) * Sp * 0.72; Vz = (Mz / ML) * Sp * 0.72;
                                    Life *= 0.65;
                                }
                                else
                                {
                                    const Fr = Math.random() * 0.85;
                                    Px = P.origin[0] + (Tp[0] - P.origin[0]) * Fr + Jx * 0.035;
                                    SpawnY = P.origin[1] + (Tp[1] - P.origin[1]) * Fr + Jy * 0.035;
                                    Pz = P.origin[2] + (Tp[2] - P.origin[2]) * Fr + Jz * 0.035;
                                    Vx = Dx * Sp * 1.45; Vy = Dy * Sp * 1.45; Vz = Dz * Sp * 1.45;
                                    Life *= 0.36;
                                }
                            }
                            if (CurlMode === 0 && (P.trailMode || 0) > 0 && !Tr)
                            {
                                Trail = [];
                                for (let K = 0; K < 16; K++) Trail.push([Px, SpawnY, Pz]);
                            }
                            let Hold = 0, AsmMode = 0, TargetPos = null, FlatCoin = false;
                            if (Tr && (Tr.holdBase || 0) + (Tr.holdSpread || 0) > 0)
                            {
                                AsmMode = Tr.assemble | 0;
                                const LpSurf = SurfaceCell(I, SpawnCap);
                                const Ux = AsmMode === 1 ? (LpSurf[0] * 0.5 + 0.5) : (EmitSh === 4 ? ((Px - P.origin[0]) / Math.max(1e-4, BHx) * 0.5 + 0.5) : 0.5);
                                const Uy = AsmMode === 1 ? (LpSurf[1] * 0.5 + 0.5) : (EmitSh === 4 ? ((SpawnY - P.origin[1]) / Math.max(1e-4, BHy) * 0.5 + 0.5) : 0.5);
                                const Uz = AsmMode === 1 ? (LpSurf[2] * 0.5 + 0.5) : (EmitSh === 4 ? ((Pz - P.origin[2]) / Math.max(1e-4, BHz) * 0.5 + 0.5) : 0.5);
                                let Tc = (EmitSh === 4 || AsmMode === 1)
                                    ? (Tr.wave === 'glitch'
                                        ? Math.min(1, Math.max(0, 0.6 * ((((Math.sin(Math.floor(Ux * 7) * 12.9898 + Math.floor(Uy * 5) * 78.233 + Math.floor(Uz * 7) * 37.719) * 43758.5453) % 1) + 1) % 1) + 0.4 * Uy))
                                        : (Tr.wave === 'melt'
                                            ? Math.min(1, Math.max(0, 0.5 + 0.3 * Math.sin(Ux * 5 + Uy * 3 + 0.7) + 0.2 * Math.sin(Uy * 7 - Uz * 4 + 2.1)))
                                            : (Ux + Uy + Uz) / 3))
                                    : Math.random();
                                if (AsmMode === 2) Tc = I / Math.max(1, SpawnCap);
                                Hold = (Tr.holdBase || 0) + (Tr.holdSpread || 0) * (Tc + (AsmMode === 2 ? 0 : 0.15 * Math.random()));
                                if (AsmMode === 0)
                                {
                                    Life += Hold;
                                    if (Math.random() < (Tr.burstShare ?? 0.5))
                                    {
                                        const Ox = Px - P.origin[0], Oy = SpawnY - P.origin[1] + 0.35, Oz = Pz - P.origin[2];
                                        const Ol = Math.hypot(Ox, Oy, Oz) || 1;
                                        const BSp = (P.speedMin || 0.5) + Math.random() * Math.max(0.1, (P.speedMax || 2) - (P.speedMin || 0.5));
                                        Vx = (Ox / Ol) * BSp; Vy = (Oy / Ol) * BSp; Vz = (Oz / Ol) * BSp;
                                    }
                                    else { Vx = 0; Vy = 0; Vz = 0; }
                                }
                                else
                                {
                                    Life = Math.max(Life, Hold + 4.5);
                                    const ShDist = Tr.shell ?? 3.0;
                                    if (AsmMode === 1)
                                    {
                                        TargetPos = [P.origin[0] + LpSurf[0] * BHx, P.origin[1] + LpSurf[1] * BHy, P.origin[2] + LpSurf[2] * BHz];
                                        const Dx = Math.random() * 2 - 1, Dy = Math.random() * 2 - 1, Dz = Math.random() * 2 - 1;
                                        const Dl = Math.hypot(Dx, Dy, Dz) || 1;
                                        const Rs = ShDist * (0.8 + 0.4 * Math.random());
                                        Px = P.origin[0] + (Dx / Dl) * Rs; SpawnY = P.origin[1] + (Dy / Dl) * Rs; Pz = P.origin[2] + (Dz / Dl) * Rs;
                                    }
                                    else
                                    {
                                        const Sz = (P.sizeStart || 0.4) * (P.sizeScale || 1);
                                        TargetPos = [P.origin[0], P.origin[1] + (I + 0.5) * 0.2 * Sz, P.origin[2]];
                                        Px = P.origin[0] + (Math.random() - 0.5) * 0.12; SpawnY = P.origin[1] + ShDist; Pz = P.origin[2] + (Math.random() - 0.5) * 0.12;
                                        FlatCoin = true;
                                    }
                                    Vx = Px; Vy = SpawnY; Vz = Pz;
                                }
                            }
                            Sys.particles.push({
                                x: Px, y: SpawnY, z: Pz,
                                x1: Px - Vx * 0.032, y1: SpawnY - Vy * 0.032, z1: Pz - Vz * 0.032,
                                x2: Px - Vx * 0.068, y2: SpawnY - Vy * 0.068, z2: Pz - Vz * 0.068,
                                trail: Trail, bokeh: Math.random(),
                                slotIdx: SlotIdx, visibleStrand: WebMode === 0 && (DynMode === 0 || !!DynMeta?.visible), grow: 1, bead: 0, role: 0, wx: 0, wy: 0, wz: 0,
                                snapU: 1.0, tearPt: -1, detachAge: -1, dynMeta: DynMeta, velTrail: null,
                                hold: Hold, asm: AsmMode, startPos: TargetPos ? [Px, SpawnY, Pz] : null, targetPos: TargetPos, flatCoin: FlatCoin, shatHit: false,
                                vx: Vx, vy: Vy, vz: Vz, crest: Crest, splatted: false,
                                age: SpawnAge, life: Life, ang: Tr ? 0 : Math.random() * Math.PI * 2,
                                spin: (Math.random() - 0.5) * 4, seed: Math.random() * 65536
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
                    const Shatters = Sys.shatters || (Sys.shatters = []);
                    for (let ShI = Shatters.length - 1; ShI >= 0; ShI--)
                    {
                        const C = Shatters[ShI];
                        C.age += Dt;
                        if (C.age >= C.life) { Shatters.splice(ShI, 1); continue; }
                        C.vy -= (P.gravity ?? 1) * 9.81 * Dt;
                        C.x += C.vx * Dt; C.y = Math.max(0.025, C.y + C.vy * Dt); C.z += C.vz * Dt;
                        if (C.y <= 0.026 && C.vy < 0) { C.vy = 0; C.vx *= 0.6; C.vz *= 0.6; }
                    }

                    const PShape = P.shape ?? 3;
                    const NSoft = Sys.particles.length;
                    const Mag = P.magneticField || null;
                    const Att = P.attractor?.enabled ? P.attractor : null;

                    const CurlFreq = P.curlFreq || 0.85, CurlAmp = P.curlAmp || 2.2, CurlRate = P.curlRate || 0.24;
                    const DriftX = Time * CurlRate, DriftY = -Time * CurlRate * 0.65, DriftZ = Time * CurlRate * 0.8;
                    const ShellR = Math.max(0.25, P.shellRadius || P.radius || 1.65);

                    if (DynMode > 0)
                    {
                        const TearThresh = Math.max(0, P.dynTearThresh || 0);
                        const Stiff = Math.max(0.15, P.dynStiff ?? 1.0);
                        const Sub = P.dynSub ?? 0;
                        const CapN = Math.max(16, Sys.cap);
                        let TrunkShake = 0;
                        for (let I = 0; I < NSoft; I++)
                        {
                            const Pt = Sys.particles[I];
                            Pt.age += Dt;
                            const St = EvalDynStrandCPU(P, Pt.slotIdx ?? I, CapN, DynMode, Time, Time, fieldScene, Prepared, Solo, WindScale);
                            Pt.dynMeta = St;
                            if (!St.visible) { Pt.visibleStrand = false; continue; }
                            Pt.visibleStrand = true;
                            if (!Pt.trail || Pt.trail.length !== 20) Pt.trail = Array.from({ length: 20 }, () => [St.pA ? St.pA[0] : 0, St.pA ? St.pA[1] : 0, St.pA ? St.pA[2] : 0]);
                            if (!Pt.velTrail || Pt.velTrail.length !== 20) Pt.velTrail = Array.from({ length: 20 }, () => [0, 0, 0]);

                            if (DynMode === 2 && St.isLeaf)
                            {
                                const Par = Sys.particles[St.parentSlot];
                                const KNode = Math.min(19, Math.max(0, Math.round(St.uPin * 19)));
                                const ParentTorn = Par && Par.tearPt >= 0 && KNode >= Par.tearPt;
                                if (Pt.detachAge >= 0)
                                {
                                    Pt.detachAge += Dt;
                                    Pt.vy -= 4.2 * Dt;
                                    Pt.vx += (Math.sin(Time * 4.5 + Pt.seed) * 1.4 - Pt.vx * 1.6) * Dt;
                                    Pt.vz += (Math.cos(Time * 3.8 + Pt.seed * 1.3) * 1.4 - Pt.vz * 1.6) * Dt;
                                    Pt.x += Pt.vx * Dt;
                                    Pt.y = Math.max(0.04, Pt.y + Pt.vy * Dt);
                                    Pt.z += Pt.vz * Dt;
                                    if (Pt.y <= 0.045) { Pt.vy = 0; Pt.vx *= 0.4; Pt.vz *= 0.4; }
                                    if (Pt.detachAge > 4.5 && !ParentTorn) Pt.detachAge = -1;
                                }
                                else if (Par && Par.trail)
                                {
                                    const Np = Par.trail[KNode];
                                    const Ang = St.offAngle;
                                    Pt.x = Np[0] + Math.cos(Ang) * 0.14;
                                    Pt.y = Np[1] - 0.04;
                                    Pt.z = Np[2] + Math.sin(Ang) * 0.14;
                                    if (ParentTorn || (BallR > 0 && Math.hypot(Pt.x - BallX, Pt.y - BallY, Pt.z - BallZ) < BallR + 0.24 && BallSpd > Math.max(1.8, TearThresh * 0.55)))
                                    {
                                        Pt.detachAge = 0;
                                        Pt.vx = BallVx * 0.45 + (Math.random() - 0.5) * 1.4;
                                        Pt.vy = Math.max(0.4, BallVy * 0.3 + 0.9);
                                        Pt.vz = BallVz * 0.45 + (Math.random() - 0.5) * 1.4;
                                    }
                                }
                                continue;
                            }

                            if (DynMode === 7 && St.role === 'leaf')
                            {
                                const Limb = Sys.particles[St.parentSlot];
                                const KNode = Math.min(19, Math.max(0, Math.round(St.uBranch * 19)));
                                if (Pt.detachAge >= 0)
                                {
                                    Pt.detachAge += Dt;
                                    Pt.vy -= 3.6 * Dt;
                                    Pt.vx += (Math.sin(Time * 4.8 + Pt.seed) * 1.6 - Pt.vx * 1.45) * Dt;
                                    Pt.vz += (Math.cos(Time * 4.1 + Pt.seed * 1.2) * 1.6 - Pt.vz * 1.45) * Dt;
                                    Pt.x += Pt.vx * Dt;
                                    Pt.y = Math.max(0.04, Pt.y + Pt.vy * Dt);
                                    Pt.z += Pt.vz * Dt;
                                    if (Pt.y <= 0.045) { Pt.vy = 0; Pt.vx *= 0.35; Pt.vz *= 0.35; }
                                    if (Pt.detachAge > 5.0) Pt.detachAge = -1;
                                }
                                else if (Limb && Limb.trail)
                                {
                                    const Np = Limb.trail[KNode];
                                    const Rustle = Math.sin(Time * 2.8 + Pt.seed) * 0.035;
                                    Pt.x = Np[0] + St.off[0] + Rustle;
                                    Pt.y = Np[1] + St.off[1];
                                    Pt.z = Np[2] + St.off[2] - Rustle * 0.5;
                                    const DistB = BallR > 0 ? Math.hypot(Pt.x - BallX, Pt.y - BallY, Pt.z - BallZ) : 99;
                                    const TrunkShed = TrunkShake > 0.14 && WebHash(Pt.slotIdx * 7 + Math.floor(Time * 4), 1) < Math.min(0.45, TrunkShake * 1.4);
                                    if ((DistB < BallR + 0.30 && BallSpd > Math.max(1.8, TearThresh * 0.55)) || TrunkShed)
                                    {
                                        Pt.detachAge = 0;
                                        Pt.vx = BallVx * 0.4 + (Math.random() - 0.5) * 1.8;
                                        Pt.vy = Math.max(0.35, BallVy * 0.25 + 0.6);
                                        Pt.vz = BallVz * 0.4 + (Math.random() - 0.5) * 1.8;
                                    }
                                }
                                continue;
                            }

                            let AnchorA = St.pA, AnchorB = St.pB;
                            if (DynMode === 7 && St.role === 'limb')
                            {
                                const Trunk = Sys.particles[0];
                                if (Trunk && Trunk.trail)
                                {
                                    const KT = Math.min(19, Math.max(0, Math.round(St.anchU * 19)));
                                    const TrNode = Trunk.trail[KT];
                                    const Dx = TrNode[0] - St.pA[0], Dy = TrNode[1] - St.pA[1], Dz = TrNode[2] - St.pA[2];
                                    AnchorA = [TrNode[0], TrNode[1], TrNode[2]];
                                    AnchorB = [St.pB[0] + Dx * 1.35, St.pB[1] + Dy * 1.35, St.pB[2] + Dz * 1.35];
                                    TrunkShake = Math.max(TrunkShake, Math.hypot(Dx, Dy, Dz));
                                }
                            }

                            const NodeStiff = Stiff * (DynMode === 7 && St.role === 'trunk' ? 2.8 : 1.0);
                            const SpringK = Math.min(1, (DynMode === 7 ? 11.0 : (DynMode === 3 ? 9.5 : 7.5)) * NodeStiff * Dt);
                            const DampK = Math.exp(-(DynMode === 3 ? 4.8 : 3.6) * Dt);
                            const TotalLen = Math.hypot(AnchorB[0] - AnchorA[0], AnchorB[1] - AnchorA[1], AnchorB[2] - AnchorA[2]) || 0.2;
                            const RestStep = TotalLen / 19;

                            for (let K = 0; K < 20; K++)
                            {
                                const U = K / 19;
                                const Cur = Pt.trail[K];
                                const Vel = Pt.velTrail[K];
                                const TornSide = Pt.tearPt >= 0 && K >= Pt.tearPt;

                                let Tx = AnchorA[0] + (AnchorB[0] - AnchorA[0]) * U;
                                let Ty = AnchorA[1] + (AnchorB[1] - AnchorA[1]) * U - 4 * (St.sag || 0) * U * (1 - U);
                                let Tz = AnchorA[2] + (AnchorB[2] - AnchorA[2]) * U;

                                if (DynMode === 3)
                                {
                                    const WPhase = U * 6.5 - Time * (St.waveSpd || 2.2) + St.rowV * 1.5;
                                    const FlapAmp = (0.14 + 0.34 * U) * (Sub > 0.5 ? 0.85 : 1.0);
                                    Tz += Math.sin(WPhase) * FlapAmp + Math.cos(WPhase * 1.9 + Time) * FlapAmp * 0.28;
                                    Ty += Math.sin(WPhase * 0.8 + 0.5) * FlapAmp * 0.22;
                                }
                                else if (DynMode === 1 || DynMode === 2 || DynMode === 4 || DynMode === 5 || DynMode === 6 || DynMode === 7)
                                {
                                    const WindS = WebSwayAt(Tx, Ty, Tz, Time, St.windScale || 0.4, CurlAmp, CurlFreq, P.windCoupling ?? 1.0, fieldScene, Prepared, Solo, WindScale);
                                    const FlexW = (DynMode === 1 || (DynMode === 3 && St.pinnedEnd)) ? 4 * U * (1 - U) : Math.pow(U, 1.35);
                                    const WaveGust = (DynMode === 4 || DynMode === 5) ? (0.35 + 0.65 * Math.sin(Tx * 0.85 * CurlFreq + Tz * 0.52 * CurlFreq - Time * (P.dynWaveSpeed || 2.2))) * 0.14 : 0;
                                    Tx += (WindS[0] + WaveGust) * FlexW;
                                    Ty += WindS[1] * FlexW * 0.45;
                                    Tz += (WindS[2] + WaveGust * 0.45) * FlexW;
                                }

                                if (TornSide)
                                {
                                    if (St.pinnedEnd && K === 19)
                                    {
                                        Cur[0] = AnchorB[0]; Cur[1] = AnchorB[1]; Cur[2] = AnchorB[2]; Vel[0] = Vel[1] = Vel[2] = 0;
                                    }
                                    else
                                    {
                                        Vel[1] -= 8.5 * Dt;
                                        Cur[0] += Vel[0] * Dt;
                                        Cur[1] = Math.max(0.03, Cur[1] + Vel[1] * Dt);
                                        Cur[2] += Vel[2] * Dt;
                                        Vel[0] *= 0.96; Vel[1] *= 0.96; Vel[2] *= 0.96;
                                    }
                                }
                                else
                                {
                                    const PinStart = K === 0;
                                    const PinEnd = K === 19 && St.pinnedEnd && Pt.tearPt < 0;
                                    if (PinStart) { Cur[0] = AnchorA[0]; Cur[1] = AnchorA[1]; Cur[2] = AnchorA[2]; Vel[0] = Vel[1] = Vel[2] = 0; }
                                    else if (PinEnd) { Cur[0] = AnchorB[0]; Cur[1] = AnchorB[1]; Cur[2] = AnchorB[2]; Vel[0] = Vel[1] = Vel[2] = 0; }
                                    else
                                    {
                                        Vel[0] = (Vel[0] + (Tx - Cur[0]) * SpringK * 24.0 * Dt) * DampK;
                                        Vel[1] = (Vel[1] + (Ty - Cur[1]) * SpringK * 24.0 * Dt) * DampK;
                                        Vel[2] = (Vel[2] + (Tz - Cur[2]) * SpringK * 24.0 * Dt) * DampK;
                                        Cur[0] += Vel[0] * Dt + (Tx - Cur[0]) * SpringK;
                                        Cur[1] += Vel[1] * Dt + (Ty - Cur[1]) * SpringK;
                                        Cur[2] += Vel[2] * Dt + (Tz - Cur[2]) * SpringK;
                                    }
                                }

                                if (BallR > 0 && !(K === 0) && !(K === 19 && St.pinnedEnd))
                                {
                                    const RadMargin = BallR + (St.radius || 0.05) + (DynMode >= 4 ? 0.14 : 0.05);
                                    const Dx = Cur[0] - BallX, Dy = Cur[1] - BallY, Dz = Cur[2] - BallZ;
                                    const D = Math.hypot(Dx, Dy, Dz);
                                    if (D < RadMargin)
                                    {
                                        const Nx = D > 1e-4 ? Dx / D : 0, Ny = D > 1e-4 ? Dy / D : 1, Nz = D > 1e-4 ? Dz / D : 0;
                                        const Push = Math.min(RadMargin, RadMargin - D);
                                        const BScale = Math.min(4.0, BallSpd * 0.45) / Math.max(0.01, BallSpd);
                                        Cur[0] += Nx * Push + BallVx * BScale * Dt * 0.45;
                                        Cur[1] += Ny * Push + BallVy * BScale * Dt * 0.45;
                                        Cur[2] += Nz * Push + BallVz * BScale * Dt * 0.45;
                                        const Imp = Math.min(5.0, BallSpd * 0.55);
                                        Vel[0] = Vel[0] * 0.5 + Nx * Imp + BallVx * BScale * 0.35;
                                        Vel[1] = Vel[1] * 0.5 + Ny * Imp + BallVy * BScale * 0.35;
                                        Vel[2] = Vel[2] * 0.5 + Nz * Imp + BallVz * BScale * 0.35;
                                        if (TearThresh > 0 && Pt.tearPt < 0 && BallSpd >= TearThresh && (DynMode === 1 || DynMode === 2 || DynMode === 3))
                                        {
                                            Pt.tearPt = Math.max(2, Math.min(18, K));
                                            Pt.snapU = Pt.tearPt / 19;
                                        }
                                    }
                                }
                                if (DynMode >= 4) Cur[1] = Math.max(0.02, Cur[1]);
                            }

                            if (DynMode >= 1 && DynMode <= 7)
                            {
                                const MaxSegLen = RestStep * 1.08;
                                for (let Pass = 0; Pass < 5; Pass++)
                                {
                                    Pt.trail[0][0] = AnchorA[0]; Pt.trail[0][1] = AnchorA[1]; Pt.trail[0][2] = AnchorA[2];
                                    for (let K = 0; K < 19; K++)
                                    {
                                        if (Pt.tearPt >= 0 && K === Pt.tearPt - 1) continue;
                                        const A = Pt.trail[K], B = Pt.trail[K + 1];
                                        const Dx = B[0] - A[0], Dy = B[1] - A[1], Dz = B[2] - A[2];
                                        const D = Math.hypot(Dx, Dy, Dz) || 1e-4;
                                        if (D > MaxSegLen || (!St.pinnedEnd && Pt.tearPt < 0))
                                        {
                                            const TargetD = D > MaxSegLen ? MaxSegLen : (D + (RestStep - D) * 0.72);
                                            const Scale = TargetD / D;
                                            if (!((K + 1 === 19) && St.pinnedEnd))
                                            {
                                                B[0] = A[0] + Dx * Scale;
                                                B[1] = Math.max(DynMode >= 4 ? 0.02 : 0.01, A[1] + Dy * Scale);
                                                B[2] = A[2] + Dz * Scale;
                                            }
                                        }
                                    }
                                    if (St.pinnedEnd)
                                    {
                                        Pt.trail[19][0] = AnchorB[0]; Pt.trail[19][1] = AnchorB[1]; Pt.trail[19][2] = AnchorB[2];
                                        for (let K = 18; K >= 0; K--)
                                        {
                                            if (Pt.tearPt >= 0 && K === Pt.tearPt - 1) continue;
                                            const A = Pt.trail[K], B = Pt.trail[K + 1];
                                            const Dx = A[0] - B[0], Dy = A[1] - B[1], Dz = A[2] - B[2];
                                            const D = Math.hypot(Dx, Dy, Dz) || 1e-4;
                                            if (D > MaxSegLen && K > 0)
                                            {
                                                const Scale = MaxSegLen / D;
                                                A[0] = B[0] + Dx * Scale;
                                                A[1] = Math.max(0.01, B[1] + Dy * Scale);
                                                A[2] = B[2] + Dz * Scale;
                                            }
                                        }
                                    }
                                }
                            }
                            if (DynMode === 7 && St.role === 'trunk')
                                TrunkShake = Math.max(TrunkShake, Math.hypot(Pt.trail[19][0] - AnchorB[0], Pt.trail[19][1] - AnchorB[1], Pt.trail[19][2] - AnchorB[2]));

                            Pt.x = Pt.trail[19][0]; Pt.y = Pt.trail[19][1]; Pt.z = Pt.trail[19][2];
                            Pt.vx = Pt.trail[19][0] - Pt.trail[17][0];
                            Pt.vy = Pt.trail[19][1] - Pt.trail[17][1];
                            Pt.vz = Pt.trail[19][2] - Pt.trail[17][2];
                        }
                    }

                    for (let I = DynMode > 0 ? -1 : NSoft - 1; I >= 0; I--)
                    {
                        const Pt = Sys.particles[I];
                        Pt.age += Dt;
                        if (Pt.age >= Pt.life) { Sys.particles.splice(I, 1); continue; }

                        if (Tr && Pt.asm > 0 && Pt.targetPos && Pt.startPos)
                        {
                            if (Pt.asm === 1)
                            {
                                const U = Math.min(1, Math.max(0, Pt.age / Math.max(1e-4, Pt.hold)));
                                const E = U * U * (3 - 2 * U);
                                Pt.x = Pt.startPos[0] + (Pt.targetPos[0] - Pt.startPos[0]) * E;
                                Pt.y = Pt.startPos[1] + (Pt.targetPos[1] - Pt.startPos[1]) * E + 0.5 * Math.sin(Math.PI * U) * (1 - E);
                                Pt.z = Pt.startPos[2] + (Pt.targetPos[2] - Pt.startPos[2]) * E;
                            }
                            else
                            {
                                const G = 9.81, Tf = Math.sqrt(2 * Math.max(0, Pt.startPos[1] - Pt.targetPos[1]) / G);
                                const Tau = Math.max(0, Pt.age - (Pt.hold - Tf));
                                if (Tau < Tf)
                                {
                                    const K = Math.min(1, Tau / Math.max(1e-4, Tf));
                                    Pt.x = Pt.startPos[0] + (Pt.targetPos[0] - Pt.startPos[0]) * K;
                                    Pt.y = Pt.startPos[1] - 0.5 * G * Tau * Tau;
                                    Pt.z = Pt.startPos[2] + (Pt.targetPos[2] - Pt.startPos[2]) * K;
                                }
                                else
                                {
                                    const B = Math.max(0, Pt.age - Pt.hold);
                                    Pt.x = Pt.targetPos[0];
                                    Pt.y = Pt.targetPos[1] + 0.02 * Math.exp(-8 * B) * Math.abs(Math.sin(25 * B));
                                    Pt.z = Pt.targetPos[2];
                                }
                            }
                            continue;
                        }
                        if (Tr && Pt.age < (Pt.hold || 0)) { Pt.ang = 0; continue; }
                        if (Tr && Tr.wave === 'glitch' && Pt.age >= (Pt.hold || 0))
                        {
                            const GTick = Math.floor(Pt.age * 12);
                            const GH = Math.sin(Pt.seed + GTick * 19.7) * 43758.5453;
                            if ((GH - Math.floor(GH)) > 0.72) Pt.x += (Math.sin(Pt.seed + GTick * 5) * 0.025);
                        }

                        if (WebMode > 0)
                        {
                            const TWeb = Math.max(0, Pt.age) * Math.max(0.05, P.webSpinRate ?? 1.0);
                            const StWeb = EvalSpiderwebStrandCPU(P, Pt.slotIdx ?? I, Math.max(16, Sys.cap), WebMode, TWeb, Time, fieldScene, Prepared, Solo, WindScale);
                            if (!StWeb.visible)
                            {
                                Pt.visibleStrand = false;
                                Pt.grow = 0;
                                Pt.bead = 0;
                                continue;
                            }
                            Pt.visibleStrand = true;
                            Pt.grow = StWeb.grow;
                            Pt.bead = StWeb.bead;
                            Pt.role = StWeb.role;
                            const Mid = [0.5 * (StWeb.pA[0] + StWeb.pB[0]), 0.5 * (StWeb.pA[1] + StWeb.pB[1]), 0.5 * (StWeb.pA[2] + StWeb.pB[2])];
                            const TgtD = WebSwayAt(Mid[0], Mid[1], Mid[2], Time, StWeb.windScale, CurlAmp, CurlFreq, P.windCoupling ?? 1.0, fieldScene, Prepared, Solo, WindScale);
                            const KBlend = Math.min(1, 7.5 * Dt);
                            Pt.wx = (Pt.wx || 0) + (TgtD[0] - (Pt.wx || 0)) * KBlend;
                            Pt.wy = (Pt.wy || 0) + (TgtD[1] - (Pt.wy || 0)) * KBlend;
                            Pt.wz = (Pt.wz || 0) + (TgtD[2] - (Pt.wz || 0)) * KBlend;
                            if (!Pt.trail || Pt.trail.length !== 20) Pt.trail = Array.from({ length: 20 }, () => [StWeb.pA[0], StWeb.pA[1], StWeb.pA[2]]);
                            if (!Pt.velTrail || Pt.velTrail.length !== 20) Pt.velTrail = Array.from({ length: 20 }, () => [0, 0, 0]);
                            const TearThresh = Math.max(0, P.dynTearThresh || 8.2);
                            const WebK = Math.min(1, 10.5 * Dt);
                            for (let K = 0; K < 20; K++)
                            {
                                const U = K / 19;
                                const Belly = 4 * U * (1 - U);
                                const TipMix = StWeb.tipWhip > 0.01 ? (Belly * 0.5 + Math.pow(U, 1.45) * StWeb.tipWhip) : Belly;
                                const Rx = StWeb.pA[0] + (StWeb.pB[0] - StWeb.pA[0]) * U + Pt.wx * TipMix;
                                const Ry = StWeb.pA[1] + (StWeb.pB[1] - StWeb.pA[1]) * U - 4 * StWeb.sag * U * (1 - U) + Pt.wy * TipMix;
                                const Rz = StWeb.pA[2] + (StWeb.pB[2] - StWeb.pA[2]) * U + Pt.wz * TipMix;
                                const Cur = Pt.trail[K];
                                const Vel = Pt.velTrail[K];
                                if (Pt.tearPt >= 0 && K >= Pt.tearPt)
                                {
                                    Vel[1] -= 4.8 * Dt;
                                    Cur[0] += Vel[0] * Dt;
                                    Cur[1] = Math.max(0.03, Cur[1] + Vel[1] * Dt);
                                    Cur[2] += Vel[2] * Dt;
                                    Vel[0] *= 0.94; Vel[1] *= 0.94; Vel[2] *= 0.94;
                                }
                                else if (BallR > 0 || (Cur[0] === 0 && Cur[1] === 0 && Cur[2] === 0))
                                {
                                    Cur[0] += (Rx - Cur[0]) * WebK;
                                    Cur[1] += (Ry - Cur[1]) * WebK;
                                    Cur[2] += (Rz - Cur[2]) * WebK;
                                }
                                else
                                {
                                    Cur[0] = Rx; Cur[1] = Ry; Cur[2] = Rz;
                                }
                                if (BallR > 0 && K > 0 && (K < 19 || StWeb.tipWhip > 0.01))
                                {
                                    const Dx = Cur[0] - BallX, Dy = Cur[1] - BallY, Dz = Cur[2] - BallZ;
                                    const D = Math.hypot(Dx, Dy, Dz);
                                    const Marg = BallR + 0.045;
                                    if (D < Marg)
                                    {
                                        const Nx = D > 1e-4 ? Dx / D : 0, Ny = D > 1e-4 ? Dy / D : 1, Nz = D > 1e-4 ? Dz / D : 0;
                                        const Push = Marg - D;
                                        Cur[0] += Nx * Push + BallVx * Dt * 0.55;
                                        Cur[1] += Ny * Push + BallVy * Dt * 0.55;
                                        Cur[2] += Nz * Push + BallVz * Dt * 0.55;
                                        Vel[0] += BallVx * 0.75 + Nx * Push * 8.0;
                                        Vel[1] += BallVy * 0.75 + Ny * Push * 8.0;
                                        Vel[2] += BallVz * 0.75 + Nz * Push * 8.0;
                                        if (TearThresh > 0 && Pt.tearPt < 0 && BallSpd >= TearThresh)
                                        {
                                            Pt.tearPt = Math.max(2, Math.min(18, K));
                                            Pt.snapU = Pt.tearPt / 19;
                                        }
                                    }
                                }
                            }
                            if (StWeb.grow < 0.99)
                            {
                                Pt.x = StWeb.tip[0]; Pt.y = StWeb.tip[1]; Pt.z = StWeb.tip[2];
                            }
                            else
                            {
                                Pt.x = Mid[0] + Pt.wx; Pt.y = Mid[1] - StWeb.sag + Pt.wy; Pt.z = Mid[2] + Pt.wz;
                            }
                            continue;
                        }

                        if (CurlMode === 3)
                        {
                            const ExtX = Math.max(0.45, BHx), ExtY = Math.max(0.45, BHy), ExtZ = Math.max(0.45, BHz);
                            const PMode = P.pulseMode || 0;
                            const ObjSh = P.objectShape ?? 0;
                            const AxI = (P.pulseAxis ?? 1) % 3;
                            if (PMode > 0)
                            {
                                const PD = AxI === 0 ? [1, 0, 0] : (AxI === 2 ? [0, 0, 1] : [0, -1, 0]);
                                let CvS = SurfacePourVel(Pt.x, Pt.y, Pt.z, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ, ObjSh, AxI, Time * CurlRate, CurlFreq, CurlAmp, Pt.seed || 17);
                                let ExtraDamp = 0;
                                if (fieldScene && Prepared && PE.Forces?.EvaluateAllPrepared)
                                {
                                    const F = PE.Forces.EvaluateAllPrepared(fieldScene, Prepared, Pt.x, Pt.y, Pt.z, 0.5, Solo, 'Particles');
                                    CvS[0] += F.Velocity[0] * WindScale * (P.windCoupling || 0) * 0.25 + F.Acceleration[0] * 0.35;
                                    CvS[1] += F.Velocity[1] * WindScale * (P.windCoupling || 0) * 0.25 + F.Acceleration[1] * 0.35;
                                    CvS[2] += F.Velocity[2] * WindScale * (P.windCoupling || 0) * 0.25 + F.Acceleration[2] * 0.35;
                                    ExtraDamp = F.Damping || 0;
                                }
                                const Nrm = ObjSurfaceNormal(Pt.x - P.origin[0], Pt.y - P.origin[1], Pt.z - P.origin[2], ObjSh, ExtX, ExtY, ExtZ);
                                const DotCN = CvS[0] * Nrm[0] + CvS[1] * Nrm[1] + CvS[2] * Nrm[2];
                                CvS[0] -= Nrm[0] * DotCN; CvS[1] -= Nrm[1] * DotCN; CvS[2] -= Nrm[2] * DotCN;
                                const Blend = Math.min(1, 8.0 * Dt), Keep = Math.exp(-ExtraDamp * Dt);
                                Pt.vx = (Pt.vx + (CvS[0] - Pt.vx) * Blend) * Keep;
                                Pt.vy = (Pt.vy + (CvS[1] - Pt.vy) * Blend) * Keep;
                                Pt.vz = (Pt.vz + (CvS[2] - Pt.vz) * Blend) * Keep;
                                const DotVN = Pt.vx * Nrm[0] + Pt.vy * Nrm[1] + Pt.vz * Nrm[2];
                                Pt.vx -= Nrm[0] * DotVN; Pt.vy -= Nrm[1] * DotVN; Pt.vz -= Nrm[2] * DotVN;
                                const NextRel = ProjectObjSurface((Pt.x + Pt.vx * Dt) - P.origin[0], (Pt.y + Pt.vy * Dt) - P.origin[1], (Pt.z + Pt.vz * Dt) - P.origin[2], ObjSh, ExtX, ExtY, ExtZ);
                                Pt.x = P.origin[0] + NextRel[0]; Pt.y = P.origin[1] + NextRel[1]; Pt.z = P.origin[2] + NextRel[2];
                                const HalfSpan = Math.max(0.35, ObjSh === 1 ? Math.max(ExtX, 0.35) : (AxI === 0 ? ExtX : (AxI === 1 ? ExtY : ExtZ)));
                                const USurf = Math.min(1, Math.max(0, 0.5 + (NextRel[0] * PD[0] + NextRel[1] * PD[1] + NextRel[2] * PD[2]) / (2 * HalfSpan)));
                                if (USurf >= 0.97) { Sys.particles.splice(I, 1); continue; }
                                let PulseB = 1.0;
                                if (PMode === 2)
                                {
                                    const Ph = Time * Math.max(0.04, P.pulseSpeed ?? 0.36);
                                    const WaveU = (Ph - Math.floor(Ph)) * 1.24 - 0.12;
                                    const Dw = (USurf - WaveU) / Math.max(0.06, P.pulseWidth ?? 0.24);
                                    PulseB = Math.min(1.2, Math.max(0.18, 0.28 + 0.92 * Math.exp(-Dw * Dw * 1.85)));
                                }
                                const EdgeFade = Smooth(0, 0.08, USurf) * (1 - Smooth(0.84, 1.0, USurf));
                                Pt.pulse = PulseB;
                                Pt.wake = Math.min(1.15, Math.max(0.05, PulseB * EdgeFade));
                                Pt.crest = Math.min(1, Math.hypot(Pt.vx, Pt.vy, Pt.vz) / Math.max(CurlAmp * 1.25, 0.2));
                                if (Pt.trail && Pt.trail.length)
                                {
                                    const KLerp = Math.min(1, 24.0 * Dt);
                                    for (let K = Pt.trail.length - 1; K >= 1; K--)
                                    {
                                        const Prev = Pt.trail[K - 1], Cur = Pt.trail[K];
                                        const Prj = ProjectObjSurface(
                                            Cur[0] + (Prev[0] - Cur[0]) * KLerp - P.origin[0],
                                            Cur[1] + (Prev[1] - Cur[1]) * KLerp - P.origin[1],
                                            Cur[2] + (Prev[2] - Cur[2]) * KLerp - P.origin[2],
                                            ObjSh, ExtX, ExtY, ExtZ
                                        );
                                        Cur[0] = P.origin[0] + Prj[0]; Cur[1] = P.origin[1] + Prj[1]; Cur[2] = P.origin[2] + Prj[2];
                                    }
                                    Pt.trail[0][0] = Pt.x; Pt.trail[0][1] = Pt.y; Pt.trail[0][2] = Pt.z;
                                }
                                continue;
                            }
                            const Rv = StreamRibbonVel(Pt.x, Pt.y, Pt.z, Time * CurlRate, CurlFreq, CurlAmp, P.origin[0], P.origin[1], P.origin[2], ExtX, ExtY, ExtZ);
                            let Cvx = Rv[0], Cvy = Rv[1], Cvz = Rv[2], ExtraDamp = 0;
                            Pt.pulse = 1;
                            Pt.wake = 1;
                            if (fieldScene && Prepared && PE.Forces?.EvaluateAllPrepared)
                            {
                                const F = PE.Forces.EvaluateAllPrepared(fieldScene, Prepared, Pt.x, Pt.y, Pt.z, 0.5, Solo, 'Particles');
                                Cvx += F.Velocity[0] * WindScale * (P.windCoupling || 0) * 0.38 + F.Acceleration[0] * 0.48;
                                Cvy += F.Velocity[1] * WindScale * (P.windCoupling || 0) * 0.38 + F.Acceleration[1] * 0.48;
                                Cvz += F.Velocity[2] * WindScale * (P.windCoupling || 0) * 0.38 + F.Acceleration[2] * 0.48;
                                ExtraDamp = F.Damping || 0;
                            }
                            const Blend = Math.min(1, 5.5 * Dt);
                            const Keep = Math.exp(-ExtraDamp * Dt);
                            Pt.vx = (Pt.vx + (Cvx - Pt.vx) * Blend) * Keep;
                            Pt.vy = (Pt.vy + (Cvy - Pt.vy) * Blend) * Keep;
                            Pt.vz = (Pt.vz + (Cvz - Pt.vz) * Blend) * Keep;
                            Pt.x += Pt.vx * Dt;
                            Pt.y = Math.max(0.08, Pt.y + Pt.vy * Dt);
                            Pt.z += Pt.vz * Dt;
                            Pt.crest = Math.min(1, Math.hypot(Pt.vx, Pt.vy, Pt.vz) / Math.max(CurlAmp * 1.4, 0.2));
                            if (Pt.trail && Pt.trail.length)
                            {
                                const KLerp = Math.min(1, 22.0 * Dt);
                                for (let K = Pt.trail.length - 1; K >= 1; K--)
                                {
                                    const Prev = Pt.trail[K - 1], Cur = Pt.trail[K];
                                    Cur[0] += (Prev[0] - Cur[0]) * KLerp;
                                    Cur[1] += (Prev[1] - Cur[1]) * KLerp;
                                    Cur[2] += (Prev[2] - Cur[2]) * KLerp;
                                }
                                Pt.trail[0][0] = Pt.x; Pt.trail[0][1] = Pt.y; Pt.trail[0][2] = Pt.z;
                            }
                            continue;
                        }

                        if (CurlMode > 0)
                        {
                            Pt.x2 = Pt.x1; Pt.y2 = Pt.y1; Pt.z2 = Pt.z1;
                            Pt.x1 = Pt.x; Pt.y1 = Pt.y; Pt.z1 = Pt.z;
                            const Qx = Pt.x * CurlFreq + DriftX, Qy = Pt.y * CurlFreq + DriftY, Qz = Pt.z * CurlFreq + DriftZ;
                            const C1 = AnalyticCurl3(Qx, Qy, Qz);
                            const C2 = AnalyticCurl3(Qx * 2.25 - DriftX * 1.35, Qy * 2.25 + DriftY, Qz * 2.25 - DriftZ * 1.2);
                            let Cvx = (C1[0] + 0.48 * C2[0]) * CurlAmp * 0.6;
                            let Cvy = (C1[1] + 0.48 * C2[1]) * CurlAmp * 0.6;
                            let Cvz = (C1[2] + 0.48 * C2[2]) * CurlAmp * 0.6;
                            let ExtraDamp = 0;
                            if (fieldScene && Prepared && PE.Forces?.EvaluateAllPrepared)
                            {
                                const F = PE.Forces.EvaluateAllPrepared(fieldScene, Prepared, Pt.x, Pt.y, Pt.z, 0.5, Solo, 'Particles');
                                Cvx += F.Velocity[0] * WindScale * (P.windCoupling || 0) * 0.35 + F.Acceleration[0] * 0.45;
                                Cvy += F.Velocity[1] * WindScale * (P.windCoupling || 0) * 0.35 + F.Acceleration[1] * 0.45;
                                Cvz += F.Velocity[2] * WindScale * (P.windCoupling || 0) * 0.35 + F.Acceleration[2] * 0.45;
                                ExtraDamp = F.Damping || 0;
                            }
                            if (CurlMode === 1)
                            {
                                const RelX = Pt.x - P.origin[0], RelY = Pt.y - P.origin[1], RelZ = Pt.z - P.origin[2];
                                Cvy -= RelY * 1.4;
                                Cvx -= (RelX / Math.max(BHx * BHx, 0.25)) * 0.55;
                                Cvz -= (RelZ / Math.max(BHz * BHz, 0.25)) * 0.55;
                                const Blend = Math.min(1, 6.5 * Dt);
                                const Keep = Math.exp(-ExtraDamp * Dt);
                                Pt.vx = (Pt.vx + (Cvx - Pt.vx) * Blend) * Keep;
                                Pt.vy = (Pt.vy + (Cvy - Pt.vy) * Blend) * Keep;
                                Pt.vz = (Pt.vz + (Cvz - Pt.vz) * Blend) * Keep;
                                Pt.x += Pt.vx * Dt; Pt.y = Math.max(0.04, Pt.y + Pt.vy * Dt); Pt.z += Pt.vz * Dt;
                                const Sp = Math.hypot(Pt.vx, Pt.vy, Pt.vz);
                                const WaveB = 0.5 + 0.5 * Math.sin(Pt.x * CurlFreq * 1.4 + Pt.z * CurlFreq * 1.1 + Time * 0.9);
                                Pt.crest = Math.min(1, Math.max(0, (Sp / Math.max(CurlAmp * 1.15, 0.2)) * 0.65 + WaveB * 0.35));
                            }
                            else
                            {
                                const Rx = Pt.x - P.origin[0], Ry = Pt.y - P.origin[1], Rz = Pt.z - P.origin[2];
                                const Rl = Math.hypot(Rx, Ry, Rz) || 1;
                                const Nx = Rx / Rl, Ny = Ry / Rl, Nz = Rz / Rl;
                                // Tilted axis rotation [0.26, 0.93, 0.22] x nrm
                                const SpinX = (0.93 * Nz - 0.22 * Ny) * CurlAmp * 0.34;
                                const SpinY = (0.22 * Nx - 0.26 * Nz) * CurlAmp * 0.34;
                                const SpinZ = (0.26 * Ny - 0.93 * Nx) * CurlAmp * 0.34;
                                let TanX = Cvx + SpinX, TanY = Cvy + SpinY, TanZ = Cvz + SpinZ;
                                const DotN = TanX * Nx + TanY * Ny + TanZ * Nz;
                                TanX -= Nx * DotN; TanY -= Ny * DotN; TanZ -= Nz * DotN;
                                const Blend = Math.min(1, 7.0 * Dt);
                                const Keep = Math.exp(-ExtraDamp * Dt);
                                Pt.vx = (Pt.vx + (TanX - Pt.vx) * Blend) * Keep;
                                Pt.vy = (Pt.vy + (TanY - Pt.vy) * Blend) * Keep;
                                Pt.vz = (Pt.vz + (TanZ - Pt.vz) * Blend) * Keep;
                                const NDot = Pt.vx * Nx + Pt.vy * Ny + Pt.vz * Nz;
                                Pt.vx -= Nx * NDot; Pt.vy -= Ny * NDot; Pt.vz -= Nz * NDot;
                                Pt.x += Pt.vx * Dt; Pt.y += Pt.vy * Dt; Pt.z += Pt.vz * Dt;
                                const Nrx = Pt.x - P.origin[0], Nry = Pt.y - P.origin[1], Nrz = Pt.z - P.origin[2];
                                const Nrl = Math.hypot(Nrx, Nry, Nrz) || 1;
                                const TargetR = ShellR * (1 + 0.03 * Math.sin(Nrx * CurlFreq * 2.1 + Time * 1.4));
                                const OutR = Nrl + (TargetR - Nrl) * Math.min(0.92, 14.0 * Dt);
                                Pt.x = P.origin[0] + (Nrx / Nrl) * OutR;
                                Pt.y = P.origin[1] + (Nry / Nrl) * OutR;
                                Pt.z = P.origin[2] + (Nrz / Nrl) * OutR;
                                Pt.crest = Math.min(1, Math.hypot(Pt.vx, Pt.vy, Pt.vz) / Math.max(CurlAmp * 1.1, 0.2));
                            }
                            continue;
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

                        if (Att)
                        {
                            const Rx = P.origin[0] - Pt.x, Ry = P.origin[1] - Pt.y, Rz = P.origin[2] - Pt.z;
                            const D = Math.hypot(Rx, Ry, Rz);
                            if (Att.swallow > 0 && D < Att.swallow) { Sys.particles.splice(I, 1); continue; }
                            if (D > 1e-3 && D < (Att.radius || 16))
                            {
                                const Fall = 1 - Smooth(0, Att.radius || 16, D);
                                const DirX = Rx / D, DirY = Ry / D, DirZ = Rz / D;
                                const Tx = -DirZ, Tz = DirX, Tl = Math.hypot(Tx, Tz) || 1;
                                const Str = (Att.strength || 7) * Fall;
                                const Sw = (Att.swirl || 3.5) * Fall;
                                Pt.vx += (DirX * Str + (Tx / Tl) * Sw) * Dt;
                                Pt.vy += DirY * Str * Dt;
                                Pt.vz += (DirZ * Str + (Tz / Tl) * Sw) * Dt;
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

                        if (P.flutter > 0)
                        {
                            const Ph = Pt.age * 2.7 + Pt.seed * 0.013;
                            Pt.vx += Math.sin(Ph) * P.flutter * Dt;
                            Pt.vy += 0.25 * Math.cos(Ph * 1.3) * P.flutter * Dt;
                            Pt.vz += Math.cos(Ph * 0.8 + 1) * P.flutter * Dt;
                        }

                        Pt.x += Pt.vx * Dt; Pt.y += Pt.vy * Dt; Pt.z += Pt.vz * Dt;
                        Pt.ang += Pt.spin * Dt;

                        if (P.kind === 6)
                        {
                            const SwR = Math.max(0.3, P.swarmRadius ?? 1.4), SwR2 = SwR * SwR;
                            const WSep = P.boidsSeparate ?? 2.85, WCoh = P.boidsCohere ?? 1.15, WAli = P.boidsAlign ?? 1.65;
                            const Vmax = Math.max(0.5, P.boidsSpeed ?? 3.4);
                            let Sx = 0, Sy = 0, Sz = 0, Ax = 0, Ay = 0, Az = 0, Cx = 0, Cy = 0, Cz = 0, N = 0;
                            for (let J = 0; J < NSoft; J++)
                            {
                                if (J === I) continue;
                                const O = Sys.particles[J];
                                const Dx = Pt.x - O.x, Dy = Pt.y - O.y, Dz = Pt.z - O.z;
                                const D2 = Dx * Dx + Dy * Dy + Dz * Dz;
                                if (D2 > SwR2) continue;
                                const D = Math.sqrt(Math.max(D2, 1e-5));
                                const W = (1 - D / SwR) / D;
                                Sx += Dx * W; Sy += Dy * W; Sz += Dz * W;
                                Ax += O.vx; Ay += O.vy; Az += O.vz;
                                Cx += O.x; Cy += O.y; Cz += O.z;
                                N++;
                            }
                            if (N > 0)
                            {
                                Pt.vx += (Sx * WSep + (Ax / N - Pt.vx) * WAli + (Cx / N - Pt.x) * WCoh) * Dt;
                                Pt.vy += (Sy * WSep + (Ay / N - Pt.vy) * WAli + (Cy / N - Pt.y) * WCoh) * Dt;
                                Pt.vz += (Sz * WSep + (Az / N - Pt.vz) * WAli + (Cz / N - Pt.z) * WCoh) * Dt;
                            }
                            const Gx = P.origin[0] + Math.cos(Time * 0.45) * 2.4;
                            const Gy = P.origin[1] + Math.sin(Time * 0.70) * 0.55;
                            const Gz = P.origin[2] + Math.sin(Time * 0.90) * 1.8;
                            Pt.vx += (Gx - Pt.x) * 0.32 * Dt;
                            Pt.vy += (Gy - Pt.y) * 0.32 * Dt;
                            Pt.vz += (Gz - Pt.z) * 0.32 * Dt;
                            const SpNow = Math.hypot(Pt.vx, Pt.vy, Pt.vz) || 0.01;
                            if (SpNow > WSep * 0 + Vmax) { const Sc = Vmax / SpNow; Pt.vx *= Sc; Pt.vy *= Sc; Pt.vz *= Sc; }
                            else if (SpNow < Vmax * 0.42) { const Sc = (Vmax * 0.42) / SpNow; Pt.vx *= Sc; Pt.vy *= Sc; Pt.vz *= Sc; }
                            const MinY = (P.leafMode || 0) >= 2 ? 0.25 : 0.55;
                            if (Pt.y < MinY) { Pt.y = MinY; Pt.vy = Math.abs(Pt.vy) * 0.65 + 0.4; }
                            if (Pt.y > 5.8) { Pt.y = 5.8; Pt.vy = -Math.abs(Pt.vy) * 0.65 - 0.3; }
                        }

                        if (PShape === 12)
                        {
                            const Tick = Math.floor(Time * Math.max(2, P.glitchRate ?? 14));
                            const GHash = Math.sin(Pt.seed + Tick * 19.7) * 43758.5453;
                            if ((GHash - Math.floor(GHash)) > 0.88)
                                Pt.x += (((Math.sin(Pt.seed * 3.1 + Tick) * 43758.5453) % 1) - 0.5) * 0.08;
                        }

                        if (Pt.y < 0.02)
                        {
                            if (Tr && Tr.fragment && !Pt.shatHit)
                            {
                                Pt.shatHit = true;
                                for (let K = 0; K < 8 && Shatters.length < 480; K++)
                                {
                                    Shatters.push({
                                        x: Pt.x + (Math.random() - 0.5) * 0.08, y: 0.06, z: Pt.z + (Math.random() - 0.5) * 0.08,
                                        vx: (Math.random() - 0.5) * 3.4, vy: 1.2 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 3.4,
                                        age: 0, life: Tr.childLife || 1.2, sz: (P.sizeStart || 0.075) * 0.5
                                    });
                                }
                                Sys.particles.splice(I, 1);
                                continue;
                            }
                            if (PShape === 14 && (P.bounce || 0) < 0.08)
                            {
                                Pt.y = 0.018;
                                Pt.vx = 0; Pt.vy = 0; Pt.vz = 0;
                                Pt.splatted = true;
                                continue;
                            }
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
                            else if (P.bounce > 0)
                            {
                                Pt.vy = Math.abs(Pt.vy) * P.bounce;
                                Pt.vx *= 0.72; Pt.vz *= 0.72;
                                if (P.bounce >= 0.55) { Pt.vx += (Math.random() - 0.5) * 2.8; Pt.vz += (Math.random() - 0.5) * 2.8; }
                            }
                        }
                        if (Pt.splatted) { Pt.y = 0.018; Pt.vx = 0; Pt.vy = 0; Pt.vz = 0; }
                        if (CurlMode === 0 && (P.trailMode || 0) > 0 && Pt.trail)
                        {
                            const KLerp = Math.min(1, 28 * Dt);
                            for (let K = Pt.trail.length - 1; K >= 1; K--)
                            {
                                Pt.trail[K][0] += (Pt.trail[K - 1][0] - Pt.trail[K][0]) * KLerp;
                                Pt.trail[K][1] += (Pt.trail[K - 1][1] - Pt.trail[K][1]) * KLerp;
                                Pt.trail[K][2] += (Pt.trail[K - 1][2] - Pt.trail[K][2]) * KLerp;
                            }
                            Pt.trail[0][0] = Pt.x; Pt.trail[0][1] = Pt.y; Pt.trail[0][2] = Pt.z;
                        }
                    }
                }
                if (WebMode > 0 || DynMode > 0)
                {
                    let VisCount = 0;
                    for (const Pt of Sys.particles) if (Pt.visibleStrand) VisCount++;
                    Sys.stats_ = { alive: VisCount, energy: 0, A: 0, B: 0, C: 0 };
                }
                else
                {
                    const Ratio = Math.min(1, Sys.particles.length / 360);
                    const EstAlive = Math.round(Ratio * Math.min(Sys.cap, (P.rate || 120) * ((P.lifeMin + P.lifeMax) * 0.5) + Sys.particles.length));
                    Sys.stats_ = { alive: Math.max(Sys.particles.length, Math.min(Sys.cap, EstAlive)), energy: 0, A: 0, B: 0, C: 0 };
                }
                Sys.readbackCount++;
            }

            if (Job.draw)
            {
                const Additive = !Job.alpha;
                if (Additive) Ctx.globalCompositeOperation = 'lighter';
                const Shape = P.shape ?? 3;
                const SmoothT = (A, B, X) => { const U = Math.min(1, Math.max(0, (X - A) / Math.max(1e-5, B - A))); return U * U * (3 - 2 * U); };

                if (BallR > 0 && BallY > 0 && BallY < 5.0)
                {
                    const ShSc = ProjectPoint(VP, BallX, 0.015, BallZ, W, H);
                    const ShEd = ProjectPoint(VP, BallX + BallR * (1 + BallY * 0.14), 0.015, BallZ, W, H);
                    if (ShSc && ShEd)
                    {
                        const SR = Math.max(4, Math.hypot(ShEd[0] - ShSc[0], ShEd[1] - ShSc[1]));
                        const SA = Math.max(0.08, 0.42 - BallY * 0.07);
                        Ctx.save();
                        Ctx.globalCompositeOperation = 'source-over';
                        Ctx.fillStyle = `rgba(0,0,0,${SA.toFixed(3)})`;
                        Ctx.beginPath();
                        Ctx.ellipse(ShSc[0], ShSc[1], SR, SR * 0.48, 0, 0, Math.PI * 2);
                        Ctx.fill();
                        Ctx.restore();
                        if (Additive) Ctx.globalCompositeOperation = 'lighter';
                    }
                }

                if (DynMode > 0)
                {
                    const ColC = P.colC || P.colB;
                    const MixRgb = (A, B, U) => [A[0] + (B[0] - A[0]) * U, A[1] + (B[1] - A[1]) * U, A[2] + (B[2] - A[2]) * U];
                    const Sub = P.dynSub ?? 0;

                    if (DynMode === 3)
                    {
                        const Quads = [];
                        for (let R = 0; R < Sys.particles.length - 1; R++)
                        {
                            const R0 = Sys.particles[R], R1 = Sys.particles[R + 1];
                            if (!R0.visibleStrand || !R1.visibleStrand || !R0.trail || !R1.trail) continue;
                            if (R0.dynMeta?.kind !== 3 || R1.dynMeta?.kind !== 3) continue;
                            const RowU = R0.dynMeta.rowV ?? (R / Math.max(1, Sys.particles.length - 1));
                            for (let K = 0; K < 19; K++)
                            {
                                if (Sub > 0.5) { if ((R0.tearPt >= 0 && K === R0.tearPt - 1) || (R1.tearPt >= 0 && K === R1.tearPt - 1)) continue; }
                                else { if ((R0.tearPt >= 0 && K >= R0.tearPt - 1) || (R1.tearPt >= 0 && K >= R1.tearPt - 1)) continue; }
                                const A3 = R0.trail[K], B3 = R0.trail[K + 1], C3 = R1.trail[K + 1], D3 = R1.trail[K];
                                const A = ProjectPoint(VP, A3[0], A3[1], A3[2], W, H);
                                const B = ProjectPoint(VP, B3[0], B3[1], B3[2], W, H);
                                const C = ProjectPoint(VP, C3[0], C3[1], C3[2], W, H);
                                const D = ProjectPoint(VP, D3[0], D3[1], D3[2], W, H);
                                if (!A || !B || !C || !D) continue;
                                const Ux = B3[0] - A3[0], Uy = B3[1] - A3[1], Uz = B3[2] - A3[2];
                                const Vx = D3[0] - A3[0], Vy = D3[1] - A3[1], Vz = D3[2] - A3[2];
                                let Nx = Uy * Vz - Uz * Vy, Ny = Uz * Vx - Ux * Vz, Nz = Ux * Vy - Uy * Vx;
                                const Nl = Math.hypot(Nx, Ny, Nz) || 1;
                                Nx /= Nl; Ny /= Nl; Nz /= Nl;
                                const Sun = Math.abs(Nx * 0.42 + Ny * 0.58 + Nz * 0.69);
                                const Lit = 0.48 + 0.58 * Sun;
                                const UFrac = K / 19;
                                let BaseRgb = MixRgb(P.colA, ColC, Math.min(1, UFrac * 1.15));
                                if (Sub < 0.5 && Math.cos(RowU * Math.PI * 4) > 0) BaseRgb = MixRgb(BaseRgb, P.colB, 0.32);
                                Quads.push({ D: (A[2] + B[2] + C[2] + D[2]) * 0.25, A, B, C, Dp: D, Fill: LinearToCss([BaseRgb[0] * Lit, BaseRgb[1] * Lit, BaseRgb[2] * Lit], 0.96) });
                            }
                        }
                        Quads.sort((Q1, Q2) => Q2.D - Q1.D);
                        for (const Q of Quads)
                        {
                            Ctx.fillStyle = Q.Fill;
                            Ctx.strokeStyle = Q.Fill;
                            Ctx.lineWidth = 0.6;
                            Ctx.beginPath();
                            Ctx.moveTo(Q.A[0], Q.A[1]); Ctx.lineTo(Q.B[0], Q.B[1]); Ctx.lineTo(Q.C[0], Q.C[1]); Ctx.lineTo(Q.Dp[0], Q.Dp[1]);
                            Ctx.closePath();
                            Ctx.fill(); Ctx.stroke();
                        }
                        continue;
                    }

                    const DrawList = [];
                    for (let I = 0; I < Sys.particles.length; I++)
                    {
                        const Pt = Sys.particles[I];
                        if (!Pt.visibleStrand) continue;
                        const St = Pt.dynMeta;
                        const Sc = ProjectPoint(VP, Pt.x, Pt.y, Pt.z, W, H);
                        const MidW = Pt.trail && Pt.trail.length >= 10 ? Pt.trail[9] : [Pt.x, Pt.y, Pt.z];
                        const MidSc = ProjectPoint(VP, MidW[0], MidW[1], MidW[2], W, H);
                        const Depth = (MidSc || Sc)?.[2] || 99;
                        DrawList.push({ Pt, St, Depth });
                    }
                    DrawList.sort((A, B) => B.Depth - A.Depth);

                    for (const Item of DrawList)
                    {
                        const Pt = Item.Pt, St = Item.St || {};
                        if ((DynMode === 2 && St.isLeaf) || (DynMode === 7 && St.role === 'leaf'))
                        {
                            const Sc = ProjectPoint(VP, Pt.x, Pt.y, Pt.z, W, H);
                            if (!Sc) continue;
                            const LRad = Math.max(3.2, (St.radius || 0.08) * 195 / Math.max(1.8, Sc[2]));
                            const LeafCol = MixRgb(ColC, P.colB, 0.25 + 0.55 * WebHash(Pt.slotIdx + 3, 2));
                            const Ang = (Pt.detachAge >= 0 ? Time * 4.5 + Pt.seed : Pt.seed * 0.01);
                            Ctx.save();
                            Ctx.translate(Sc[0], Sc[1]);
                            Ctx.rotate(Math.sin(Ang) * 0.85);
                            Ctx.fillStyle = LinearToCss(LeafCol, 0.92);
                            Ctx.beginPath();
                            Ctx.moveTo(0, -LRad);
                            Ctx.quadraticCurveTo(LRad * 0.85, 0, 0, LRad);
                            Ctx.quadraticCurveTo(-LRad * 0.85, 0, 0, -LRad);
                            Ctx.fill();
                            Ctx.restore();
                            continue;
                        }

                        if (!Pt.trail || Pt.trail.length < 2) continue;
                        const DrawChainRange = (FromK, ToK) => {
                            const Pts2 = [];
                            for (let K = FromK; K <= ToK; K++)
                            {
                                const Wp = Pt.trail[K];
                                const Pr = ProjectPoint(VP, Wp[0], Wp[1], Wp[2], W, H);
                                if (Pr) Pts2.push({ p: Pr, u: K / 19 });
                            }
                            if (Pts2.length < 2) return;
                            const ZAvg = Pts2[Math.floor(Pts2.length * 0.5)].p[2];
                            const BasePx = Math.max(1.0, (St.radius || 0.04) * (P.sizeScale || 1) * 260 / Math.max(1.8, ZAvg));

                            if (DynMode === 1 && Sub > 0.5)
                            {
                                Ctx.lineCap = 'round';
                                for (let K = 0; K < Pts2.length - 1; K++)
                                {
                                    const A = Pts2[K].p, B = Pts2[K + 1].p;
                                    const Mx = 0.5 * (A[0] + B[0]), My = 0.5 * (A[1] + B[1]);
                                    const Ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
                                    const Len = Math.max(3.0, Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.62);
                                    Ctx.save();
                                    Ctx.translate(Mx, My);
                                    Ctx.rotate(Ang);
                                    Ctx.strokeStyle = LinearToCss(K % 2 === 0 ? P.colB : ColC, 0.95);
                                    Ctx.lineWidth = Math.max(1.6, BasePx * 0.42);
                                    Ctx.beginPath();
                                    Ctx.ellipse(0, 0, Len, Math.max(1.8, BasePx * 0.55), 0, 0, Math.PI * 2);
                                    Ctx.stroke();
                                    Ctx.restore();
                                }
                                return;
                            }

                            if (DynMode === 6)
                            {
                                Ctx.lineCap = 'round';
                                Ctx.strokeStyle = LinearToCss(P.colA, 0.94);
                                Ctx.lineWidth = Math.max(1.4, BasePx * 0.14);
                                Ctx.beginPath();
                                Ctx.moveTo(Pts2[0].p[0], Pts2[0].p[1]);
                                for (let K = 1; K < Pts2.length; K++) Ctx.lineTo(Pts2[K].p[0], Pts2[K].p[1]);
                                Ctx.stroke();
                                for (let K = 1; K < Pts2.length - 1; K++)
                                {
                                    const Prev = Pts2[K - 1].p, Cur = Pts2[K].p, Next = Pts2[K + 1].p;
                                    const Tx = Next[0] - Prev[0], Ty = Next[1] - Prev[1];
                                    const Tl = Math.hypot(Tx, Ty) || 1;
                                    const Nx = -Ty / Tl, Ny = Tx / Tl;
                                    const U = Pts2[K].u;
                                    const PinLen = BasePx * Math.sin(Math.min(1, U) * Math.PI) * (1.15 - 0.35 * U);
                                    const PinCol = MixRgb(ColC, P.colB, U);
                                    Ctx.fillStyle = LinearToCss(PinCol, 0.92);
                                    for (const Sgn of [-1, 1])
                                    {
                                        const TipX = Cur[0] + Nx * Sgn * PinLen + (Tx / Tl) * PinLen * 0.35;
                                        const TipY = Cur[1] + Ny * Sgn * PinLen + (Ty / Tl) * PinLen * 0.35;
                                        const WPin = Math.max(1.8, PinLen * 0.24);
                                        Ctx.beginPath();
                                        Ctx.moveTo(Cur[0], Cur[1]);
                                        Ctx.quadraticCurveTo(Cur[0] + Nx * Sgn * PinLen * 0.55 + (Tx / Tl) * WPin, Cur[1] + Ny * Sgn * PinLen * 0.55 + (Ty / Tl) * WPin, TipX, TipY);
                                        Ctx.quadraticCurveTo(Cur[0] + Nx * Sgn * PinLen * 0.55 - (Tx / Tl) * WPin, Cur[1] + Ny * Sgn * PinLen * 0.55 - (Ty / Tl) * WPin, Cur[0], Cur[1]);
                                        Ctx.fill();
                                    }
                                }
                                return;
                            }

                            Ctx.lineCap = 'round';
                            Ctx.lineJoin = 'round';
                            for (let K = 0; K < Pts2.length - 1; K++)
                            {
                                const U = Pts2[K].u;
                                const WFrac = (DynMode === 4 || DynMode === 5) ? (1 - U * 0.86) : (DynMode === 7 ? (1 - U * 0.65) : 1.0);
                                const SegCol = DynMode === 7
                                    ? MixRgb(P.colA, ColC, U * 0.45)
                                    : MixRgb(P.colA, ColC, Math.min(1, U * 1.15));
                                Ctx.strokeStyle = LinearToCss(SegCol, 0.95);
                                Ctx.lineWidth = Math.max(1.0, BasePx * WFrac);
                                Ctx.beginPath();
                                Ctx.moveTo(Pts2[K].p[0], Pts2[K].p[1]);
                                Ctx.lineTo(Pts2[K + 1].p[0], Pts2[K + 1].p[1]);
                                Ctx.stroke();
                            }

                            if ((DynMode === 4 || DynMode === 5) && St.hasTip && Pts2.length >= 4)
                            {
                                const PTop = Pts2[Pts2.length - 1].p;
                                const PPrev = Pts2[Pts2.length - 3].p;
                                const Ang = Math.atan2(PTop[1] - PPrev[1], PTop[0] - PPrev[0]);
                                Ctx.save();
                                Ctx.translate(PTop[0], PTop[1]);
                                Ctx.rotate(Ang + Math.PI * 0.5);
                                if (DynMode === 4)
                                {
                                    const EarH = Math.max(5, BasePx * 4.8);
                                    const EarW = Math.max(2.2, BasePx * 1.35);
                                    Ctx.fillStyle = LinearToCss(P.colB, 0.96);
                                    Ctx.beginPath();
                                    Ctx.ellipse(0, EarH * 0.25, EarW, EarH * 0.55, 0, 0, Math.PI * 2);
                                    Ctx.fill();
                                }
                                else
                                {
                                    const CatH = Math.max(7, BasePx * 4.2);
                                    const CatW = Math.max(3.2, BasePx * 1.45);
                                    Ctx.fillStyle = LinearToCss(P.colB, 0.98);
                                    Ctx.beginPath();
                                    Ctx.roundRect(-CatW * 0.5, -CatH * 0.15, CatW, CatH, CatW * 0.45);
                                    Ctx.fill();
                                }
                                Ctx.restore();
                            }
                        };

                        if (Pt.tearPt >= 1 && Pt.tearPt <= 18)
                        {
                            DrawChainRange(0, Pt.tearPt - 1);
                            DrawChainRange(Pt.tearPt, 19);
                        }
                        else DrawChainRange(0, 19);
                    }
                    continue;
                }

                for (const Pt of Sys.particles)
                {
                    if (WebMode > 0)
                    {
                        if (!Pt.visibleStrand || !Pt.trail || Pt.trail.length < 2) continue;
                        const DrawWebSpan = (FromK, ToK) => {
                            const Pts2 = [];
                            for (let K = FromK; K <= ToK; K++)
                            {
                                const Wp = Pt.trail[K];
                                const Pr = ProjectPoint(VP, Wp[0], Wp[1], Wp[2], W, H);
                                if (Pr) Pts2.push(Pr);
                            }
                            if (Pts2.length < 2) return;
                            const MidSc = Pts2[Math.floor(Pts2.length * 0.5)];
                            const ColC = P.colC || P.colB;
                            const RRole = Pt.role ?? 0.5;
                            const SCol = RRole < 0.55
                                ? [0, 1, 2, 3].map(K => P.colA[K] * (1 - RRole / 0.55) + ColC[K] * (RRole / 0.55))
                                : [0, 1, 2, 3].map(K => ColC[K] * (1 - (RRole - 0.55) / 0.45) + P.colB[K] * ((RRole - 0.55) / 0.45));
                            const Alpha = 0.72 * (0.72 + 0.28 * (Pt.grow ?? 1));
                            const SilkW = Math.max(0.55, (P.sizeStart || 0.018) * (P.sizeScale || 1) * (P.streakThin || 0.5) * 195 / Math.max(2.2, MidSc[2]));
                            Ctx.strokeStyle = LinearToCss(SCol, Alpha);
                            Ctx.lineWidth = SilkW;
                            Ctx.lineCap = 'round';
                            Ctx.lineJoin = 'round';
                            Ctx.beginPath();
                            Ctx.moveTo(Pts2[0][0], Pts2[0][1]);
                            for (let K = 1; K < Pts2.length; K++) Ctx.lineTo(Pts2[K][0], Pts2[K][1]);
                            Ctx.stroke();
                            return SilkW;
                        };
                        let SilkW = 0.8;
                        if (Pt.tearPt >= 1 && Pt.tearPt <= 18)
                        {
                            SilkW = DrawWebSpan(0, Pt.tearPt - 1) || SilkW;
                            DrawWebSpan(Pt.tearPt, 19);
                        }
                        else SilkW = DrawWebSpan(0, 19) || SilkW;

                        const ScTip = ProjectPoint(VP, Pt.x, Pt.y, Pt.z, W, H);
                        if (ScTip && (Pt.bead || 0) > 0.05)
                        {
                            if ((Pt.grow ?? 1) < 0.99)
                            {
                                const SpinR = Math.max(2.4, SilkW * 3.1);
                                Ctx.fillStyle = `rgba(235,248,255,0.92)`;
                                Ctx.beginPath(); Ctx.arc(ScTip[0], ScTip[1], SpinR, 0, Math.PI * 2); Ctx.fill();
                            }
                            else if ((P.webDew ?? 0.8) > 0.05)
                            {
                                const DewR = Math.max(0.85, SilkW * 1.15);
                                Ctx.fillStyle = LinearToCss([0.92, 0.97, 1.0], Math.min(0.85, (Pt.bead || 0) * (P.webDew ?? 0.8)));
                                Ctx.beginPath(); Ctx.arc(ScTip[0], ScTip[1], DewR, 0, Math.PI * 2); Ctx.fill();
                            }
                        }
                        continue;
                    }

                    const Sc = ProjectPoint(VP, Pt.x, Pt.y, Pt.z, W, H);
                    if (!Sc) continue;
                    const T = Math.min(1, Pt.age / Math.max(0.01, Pt.life));

                    if (CurlMode === 3)
                    {
                        const PulseScale = (P.pulseMode || 0) > 0 ? Math.min(1.18, 0.16 + 0.96 * (Pt.wake ?? 0.5)) : 1.0;
                        const HeadScale = (P.pulseMode || 0) > 0 ? (0.55 + 0.95 * (Pt.pulse ?? 0.5)) : 1.0;
                        const Alpha = SmoothT(0, 0.12, T) * (1 - SmoothT(0.76, 1, T)) * 0.88 * PulseScale;
                        if (Alpha <= 0.005) continue;
                        const ColC = P.colC || P.colB;
                        const BaseW = Math.max(0.6, (P.sizeStart * (1 - T) + P.sizeEnd * T) * (P.sizeScale || 1) * (P.streakThin || 0.34) * 280 / Math.max(2.0, Sc[2])) * (0.75 + 0.45 * HeadScale);
                        if (Pt.trail && Pt.trail.length >= 3)
                        {
                            const Pts2 = [];
                            for (let K = Pt.trail.length - 1; K >= 0; K--)
                            {
                                const Wp = Pt.trail[K];
                                const Pr = ProjectPoint(VP, Wp[0], Wp[1], Wp[2], W, H);
                                if (Pr) Pts2.push(Pr);
                            }
                            if (Pts2.length >= 3)
                            {
                                const TailPt = Pts2[0], HeadPt = Pts2[Pts2.length - 1];
                                const Grad = Ctx.createLinearGradient(TailPt[0], TailPt[1], HeadPt[0], HeadPt[1]);
                                Grad.addColorStop(0.00, LinearToCss(P.colA, 0.0));
                                Grad.addColorStop(0.45, LinearToCss(ColC, Alpha * 0.34));
                                Grad.addColorStop(1.00, LinearToCss(P.colB, Alpha * 0.82));
                                Ctx.strokeStyle = Grad;
                                Ctx.lineWidth = Math.max(0.65, BaseW * 1.05);
                                Ctx.lineCap = 'round';
                                Ctx.beginPath();
                                Ctx.moveTo(Pts2[0][0], Pts2[0][1]);
                                for (let K = 1; K < Pts2.length - 1; K++)
                                {
                                    const Mx = 0.5 * (Pts2[K][0] + Pts2[K + 1][0]);
                                    const My = 0.5 * (Pts2[K][1] + Pts2[K + 1][1]);
                                    Ctx.quadraticCurveTo(Pts2[K][0], Pts2[K][1], Mx, My);
                                }
                                Ctx.lineTo(HeadPt[0], HeadPt[1]);
                                Ctx.stroke();
                                const LeadStart = Math.max(0, Math.floor(Pts2.length * 0.56));
                                Ctx.strokeStyle = LinearToCss(P.colB, Alpha * 0.52);
                                Ctx.lineWidth = Math.max(0.45, BaseW * 0.52);
                                Ctx.beginPath();
                                Ctx.moveTo(Pts2[LeadStart][0], Pts2[LeadStart][1]);
                                for (let K = LeadStart + 1; K < Pts2.length; K++) Ctx.lineTo(Pts2[K][0], Pts2[K][1]);
                                Ctx.stroke();
                            }
                        }
                        const Dof = Pt.bokeh ?? 0.35;
                        const HeadR = Math.max(1.0, ((Dof > 0.62 ? (4.0 + (Dof - 0.62) * 24.0) : (1.1 + Dof * 1.9)) * 7.5) / Math.max(2.4, Sc[2])) * HeadScale;
                        if (Dof > 0.62 && Ctx.createRadialGradient)
                        {
                            const BG = Ctx.createRadialGradient(Sc[0], Sc[1], 0, Sc[0], Sc[1], HeadR);
                            BG.addColorStop(0.0, LinearToCss(P.colB, Alpha * 0.55));
                            BG.addColorStop(0.72, LinearToCss(P.colB, Alpha * 0.36));
                            BG.addColorStop(0.90, LinearToCss(P.colB, Alpha * 0.44));
                            BG.addColorStop(1.0, LinearToCss(P.colB, 0));
                            Ctx.fillStyle = BG;
                            Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], HeadR, 0, Math.PI * 2); Ctx.fill();
                        }
                        else
                        {
                            if (HeadR > 1.3 && Ctx.createRadialGradient)
                            {
                                const HG = Ctx.createRadialGradient(Sc[0], Sc[1], 0, Sc[0], Sc[1], HeadR * 2.6);
                                HG.addColorStop(0.0, LinearToCss(P.colB, Alpha * 0.55));
                                HG.addColorStop(1.0, LinearToCss(P.colB, 0));
                                Ctx.fillStyle = HG;
                                Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], HeadR * 2.6, 0, Math.PI * 2); Ctx.fill();
                            }
                            Ctx.fillStyle = `rgba(255,255,255,${Math.min(1, Alpha * 0.96).toFixed(3)})`;
                            Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], Math.max(0.9, HeadR * 0.68), 0, Math.PI * 2); Ctx.fill();
                        }
                        continue;
                    }

                    if (CurlMode > 0)
                    {
                        const Cr = Pt.crest ?? 0.5;
                        const ColC = P.colC || P.colB;
                        const Col = Cr < 0.52
                            ? [0, 1, 2, 3].map(K => P.colA[K] * (1 - Cr / 0.52) + ColC[K] * (Cr / 0.52))
                            : [0, 1, 2, 3].map(K => ColC[K] * (1 - (Cr - 0.52) / 0.48) + P.colB[K] * ((Cr - 0.52) / 0.48));
                        let Alpha = SmoothT(0, 0.10, T) * (1 - SmoothT(0.72, 1, T)) * (CurlMode === 1 ? 0.52 : 0.62);
                        if (CurlMode === 2)
                        {
                            const Rx = Pt.x - P.origin[0], Ry = Pt.y - P.origin[1], Rz = Pt.z - P.origin[2];
                            const Tx = CamX - Pt.x, Ty = CamY - Pt.y, Tz = CamZ - Pt.z;
                            const DotCam = Rx * Tx + Ry * Ty + Rz * Tz;
                            if (DotCam < 0) Alpha *= 0.36;
                            else Alpha *= (0.72 + 0.52 * Cr);
                        }
                        if (Alpha <= 0.005) continue;
                        const Mid = ProjectPoint(VP, Pt.x1 ?? Pt.x, Pt.y1 ?? Pt.y, Pt.z1 ?? Pt.z, W, H);
                        const Tail = ProjectPoint(VP, Pt.x2 ?? (Pt.x - Pt.vx * 0.06), Pt.y2 ?? (Pt.y - Pt.vy * 0.06), Pt.z2 ?? (Pt.z - Pt.vz * 0.06), W, H);
                        const Lw = CurlMode === 1 ? (0.85 + 1.05 * Cr) : (0.75 + 1.25 * Cr);
                        if (Tail && Mid && Math.hypot(Sc[0] - Tail[0], Sc[1] - Tail[1]) > 0.8)
                        {
                            Ctx.strokeStyle = LinearToCss(Col, Alpha);
                            Ctx.lineWidth = Lw;
                            Ctx.lineCap = 'round';
                            Ctx.beginPath();
                            Ctx.moveTo(Tail[0], Tail[1]);
                            Ctx.quadraticCurveTo(Mid[0], Mid[1], Sc[0], Sc[1]);
                            Ctx.stroke();
                            if (Cr > 0.65)
                            {
                                Ctx.strokeStyle = `rgba(218, 250, 255, ${(Alpha * (CurlMode === 2 ? 0.62 : 0.32)).toFixed(3)})`;
                                Ctx.lineWidth = Math.max(0.5, Lw * 0.45);
                                Ctx.beginPath();
                                Ctx.moveTo(Mid[0], Mid[1]);
                                Ctx.lineTo(Sc[0], Sc[1]);
                                Ctx.stroke();
                            }
                        }
                        else
                        {
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.9);
                            Ctx.beginPath();
                            Ctx.arc(Sc[0], Sc[1], Math.max(0.85, Lw * 0.8), 0, Math.PI * 2);
                            Ctx.fill();
                        }
                        continue;
                    }

                    const ColC = P.colC || P.colB;
                    const Col = ColC && ColC[3] > 0.01
                        ? (T < 0.38
                            ? [0, 1, 2, 3].map(I => P.colA[I] * (1 - T / 0.38) + ColC[I] * (T / 0.38))
                            : [0, 1, 2, 3].map(I => ColC[I] * (1 - (T - 0.38) / 0.62) + P.colB[I] * ((T - 0.38) / 0.62)))
                        : [0, 1, 2, 3].map(I => P.colA[I] * (1 - T) + P.colB[I] * T);
                    const BaseWorldSize = (P.sizeStart * (1 - T) + P.sizeEnd * T) * (P.sizeScale || 1);
                    const R = Math.max(1.8, Math.min(Shape === 10 || Shape === 11 || Shape === 15 || Shape === 16 || Shape === 17 ? 340 : 22, (BaseWorldSize * 180) / Sc[2]));
                    const PulseMul = (P.kind === 6 && (P.pulseDepth || 0) > 0)
                        ? (1 - P.pulseDepth + P.pulseDepth * (0.5 + 0.5 * Math.sin(Time * (P.pulseHz || 1) * Math.PI * 2 + (Pt.seed || 0))))
                        : 1;
                    const IsFlyMorph = !!(P.transition?.after === 'butterfly' && Pt.age >= (Pt.hold || 0));
                    const Alpha = (P.transition ? (1 - SmoothT(0.75, 1, T)) : SmoothT(0, 0.08, T) * (1 - SmoothT(0.7, 1, T))) * (Col[3] ?? 1) * PulseMul;
                    if (Alpha <= 0.005) continue;

                    if (IsFlyMorph)
                    {
                        const Flap = Math.cos(Pt.age * (9 + (Pt.seed % 5)) + Pt.seed);
                        const WingW = Math.max(0.22, Math.abs(Flap));
                        const Sz = Math.max(4, R * 3.8);
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.92);
                        for (const Sgn of [-1, 1])
                        {
                            Ctx.beginPath();
                            Ctx.ellipse(Sgn * Sz * 0.45 * WingW, -Sz * 0.24, Sz * 0.46 * WingW, Sz * 0.34, Sgn * 0.25, 0, Math.PI * 2);
                            Ctx.ellipse(Sgn * Sz * 0.35 * WingW, Sz * 0.24, Sz * 0.34 * WingW, Sz * 0.24, -Sgn * 0.25, 0, Math.PI * 2);
                            Ctx.fill();
                        }
                        Ctx.restore();
                        continue;
                    }

                    if ((P.trailMode || 0) > 0 && Pt.trail && Pt.trail.length >= 3)
                    {
                        const Pts2 = [];
                        for (let K = Pt.trail.length - 1; K >= 0; K--)
                        {
                            const Pr = ProjectPoint(VP, Pt.trail[K][0], Pt.trail[K][1], Pt.trail[K][2], W, H);
                            if (Pr) Pts2.push(Pr);
                        }
                        if (Pts2.length >= 2)
                        {
                            const T0 = Pts2[0], T1 = Pts2[Pts2.length - 1];
                            const Grad = Ctx.createLinearGradient(T0[0], T0[1], T1[0], T1[1]);
                            Grad.addColorStop(0.0, LinearToCss(P.colA, 0.0));
                            Grad.addColorStop(0.5, LinearToCss(ColC, Alpha * 0.42));
                            Grad.addColorStop(1.0, LinearToCss(P.colB, Alpha * 0.88));
                            Ctx.strokeStyle = Grad;
                            Ctx.lineWidth = Math.max(1.1, R * (P.streakThin || 0.45) * 0.72);
                            Ctx.lineCap = 'round';
                            Ctx.beginPath();
                            Ctx.moveTo(Pts2[0][0], Pts2[0][1]);
                            for (let K = 1; K < Pts2.length; K++) Ctx.lineTo(Pts2[K][0], Pts2[K][1]);
                            Ctx.stroke();
                        }
                    }

                    if (Shape === 0)
                    {
                        const ScTail = ProjectPoint(VP, Pt.x - Pt.vx * 0.055, Pt.y - Pt.vy * 0.055, Pt.z - Pt.vz * 0.055, W, H);
                        if (ScTail && Math.hypot(Sc[0] - ScTail[0], Sc[1] - ScTail[1]) > 1.2)
                        {
                            const Thin = Math.max(0.15, P.streakThin ?? 1.0);
                            Ctx.save();
                            Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.85);
                            Ctx.lineWidth = Math.max(0.85, R * 0.52 * Thin);
                            Ctx.lineCap = 'round';
                            Ctx.beginPath(); Ctx.moveTo(ScTail[0], ScTail[1]); Ctx.lineTo(Sc[0], Sc[1]); Ctx.stroke();
                            Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.45).toFixed(3)})`;
                            Ctx.lineWidth = Math.max(0.45, R * 0.22 * Thin);
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
                        const SpinW = Pt.flatCoin ? Math.max(2, R * 0.98) : Math.max(1.2, R * (0.25 + 0.75 * Math.abs(Math.cos(Pt.ang || 0))));
                        const CoinH = Pt.flatCoin ? Math.max(1.4, R * 0.36) : R * 0.95;
                        Ctx.fillStyle = LinearToCss(Col, Alpha * 0.95);
                        Ctx.beginPath();
                        if (Ctx.ellipse) Ctx.ellipse(Sc[0], Sc[1], SpinW, CoinH, 0, 0, Math.PI * 2);
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
                    else if (Shape === 10)
                    {
                        const RadW = BaseWorldSize * 0.5;
                        const RingPts = [];
                        const Segs = 28;
                        for (let S = 0; S < Segs; S++)
                        {
                            const A = (S / Segs) * Math.PI * 2;
                            const J = P.leafMode ? (1 + 0.08 * Math.sin(A * 5 + (Pt.seed || 0))) : 1;
                            const Pr = ProjectPoint(VP, Pt.x + Math.cos(A) * RadW * J, Pt.y, Pt.z + Math.sin(A) * RadW * J, W, H);
                            if (Pr) RingPts.push(Pr);
                        }
                        if (RingPts.length >= 8)
                        {
                            Ctx.save();
                            if (P.leafMode)
                            {
                                Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.65);
                                Ctx.lineWidth = Math.max(3, R * 0.14);
                                Ctx.beginPath();
                                RingPts.forEach((Pt2, K) => K === 0 ? Ctx.moveTo(Pt2[0], Pt2[1]) : Ctx.lineTo(Pt2[0], Pt2[1]));
                                Ctx.closePath();
                                Ctx.stroke();
                            }
                            else
                            {
                                Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.92);
                                Ctx.lineWidth = Math.max(1.8, 3.2 * (1 - T));
                                Ctx.beginPath();
                                RingPts.forEach((Pt2, K) => K === 0 ? Ctx.moveTo(Pt2[0], Pt2[1]) : Ctx.lineTo(Pt2[0], Pt2[1]));
                                Ctx.closePath();
                                Ctx.stroke();
                                Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.62).toFixed(3)})`;
                                Ctx.lineWidth = Math.max(0.9, 1.5 * (1 - T));
                                Ctx.stroke();
                            }
                            Ctx.restore();
                        }
                        continue;
                    }
                    else if (Shape === 11)
                    {
                        const RadD = Math.max(8, R * 0.52);
                        Ctx.save();
                        if (Ctx.createRadialGradient)
                        {
                            const DG = Ctx.createRadialGradient(Sc[0], Sc[1], RadD * 0.2, Sc[0], Sc[1], RadD);
                            DG.addColorStop(0.0, LinearToCss(Col, 0));
                            DG.addColorStop(0.68, LinearToCss(Col, Alpha * 0.24));
                            DG.addColorStop(0.92, LinearToCss(Col, Alpha * 0.85));
                            DG.addColorStop(1.0, LinearToCss(Col, 0));
                            Ctx.fillStyle = DG;
                            Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], RadD, 0, Math.PI * 2); Ctx.fill();
                        }
                        Ctx.strokeStyle = `rgba(255,255,255,${(Alpha * 0.72).toFixed(3)})`;
                        Ctx.lineWidth = 1.6;
                        Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], RadD * 0.94, 0, Math.PI * 2); Ctx.stroke();
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 12)
                    {
                        const IsScan = (P.leafMode || 0) > 0 || (((Pt.seed || 0) * 0.618) % 1) > 0.74;
                        const Tick = Math.floor(Time * Math.max(2, P.glitchRate ?? 14));
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        if (IsScan)
                        {
                            const Wbar = Math.max(10, R * 2.4), Hbar = Math.max(1.5, R * 0.22);
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.85);
                            Ctx.fillRect(-Wbar * 0.5, -Hbar * 0.5, Wbar, Hbar);
                            Ctx.fillStyle = `rgba(255,255,255,${(Alpha * 0.45).toFixed(3)})`;
                            Ctx.fillRect(-Wbar * 0.25, -Hbar * 0.25, Wbar * 0.5, Hbar * 0.5);
                        }
                        else
                        {
                            const GSize = Math.max(4, R * 1.1), Cell = GSize / 5;
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.95);
                            for (let Gy = 0; Gy < 5; Gy++)
                            {
                                for (let Gx = 0; Gx < 5; Gx++)
                                {
                                    const H = Math.sin((Pt.seed || 1) + Tick * 13.7 + (Gx * 5 + Gy) * 31.3) * 43758.5453;
                                    if ((H - Math.floor(H)) > 0.46)
                                        Ctx.fillRect(-GSize * 0.5 + Gx * Cell, -GSize * 0.5 + Gy * Cell, Cell * 0.78, Cell * 0.78);
                                }
                            }
                        }
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 13)
                    {
                        const BMode = P.leafMode || 0;
                        const Flap = Math.sin(Time * (BMode === 1 ? 13.5 : 9.5) + (Pt.seed || 0));
                        const Sz = Math.max(3.5, R * 1.25);
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        if (BMode === 1)
                        {
                            const WingW = Math.max(0.22, Math.abs(Flap));
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.92);
                            for (const Sgn of [-1, 1])
                            {
                                Ctx.beginPath();
                                Ctx.ellipse(Sgn * Sz * 0.46 * WingW, -Sz * 0.24, Sz * 0.48 * WingW, Sz * 0.34, Sgn * 0.25, 0, Math.PI * 2);
                                Ctx.ellipse(Sgn * Sz * 0.36 * WingW, Sz * 0.24, Sz * 0.35 * WingW, Sz * 0.24, -Sgn * 0.25, 0, Math.PI * 2);
                                Ctx.fill();
                            }
                        }
                        else if (BMode >= 2)
                        {
                            const TailW = Flap * Sz * 0.28;
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.94);
                            Ctx.beginPath();
                            Ctx.ellipse(0, 0, Sz * 0.72, Sz * 0.24, 0, 0, Math.PI * 2);
                            Ctx.moveTo(-Sz * 0.55, 0);
                            Ctx.lineTo(-Sz * 1.0, -Sz * 0.30 + TailW);
                            Ctx.lineTo(-Sz * 1.0, Sz * 0.30 + TailW);
                            Ctx.closePath();
                            Ctx.fill();
                        }
                        else
                        {
                            const TipY = Flap * Sz * 0.58 - Sz * 0.16;
                            Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.96);
                            Ctx.lineWidth = Math.max(1.4, Sz * 0.18);
                            Ctx.lineCap = 'round';
                            Ctx.beginPath();
                            Ctx.moveTo(-Sz * 0.95, TipY);
                            Ctx.quadraticCurveTo(-Sz * 0.45, TipY * 0.35 - Sz * 0.22, 0, 0);
                            Ctx.quadraticCurveTo(Sz * 0.45, TipY * 0.35 - Sz * 0.22, Sz * 0.95, TipY);
                            Ctx.stroke();
                        }
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 14)
                    {
                        Ctx.save();
                        if (Pt.splatted)
                        {
                            const Rx = Math.max(3, R * 1.55), Ry = Math.max(1.4, R * 0.62);
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.88);
                            Ctx.beginPath();
                            if (Ctx.ellipse) Ctx.ellipse(Sc[0], Sc[1], Rx, Ry, 0, 0, Math.PI * 2);
                            else Ctx.arc(Sc[0], Sc[1], Rx, 0, Math.PI * 2);
                            Ctx.fill();
                            Ctx.fillStyle = `rgba(255,255,255,${(Alpha * 0.55).toFixed(3)})`;
                            Ctx.beginPath(); Ctx.arc(Sc[0] - Rx * 0.25, Sc[1] - Ry * 0.25, Math.max(0.8, Rx * 0.18), 0, Math.PI * 2); Ctx.fill();
                        }
                        else
                        {
                            const DropR = Math.max(2.2, R * 0.86);
                            Ctx.fillStyle = LinearToCss(Col, Alpha * 0.94);
                            Ctx.beginPath();
                            Ctx.moveTo(Sc[0], Sc[1] - DropR * 1.55);
                            Ctx.bezierCurveTo(Sc[0] + DropR * 0.95, Sc[1] - DropR * 0.3, Sc[0] + DropR, Sc[1] + DropR * 0.95, Sc[0], Sc[1] + DropR);
                            Ctx.bezierCurveTo(Sc[0] - DropR, Sc[1] + DropR * 0.95, Sc[0] - DropR * 0.95, Sc[1] - DropR * 0.3, Sc[0], Sc[1] - DropR * 1.55);
                            Ctx.fill();
                            Ctx.fillStyle = `rgba(255,255,255,${(Alpha * 0.68).toFixed(3)})`;
                            Ctx.beginPath(); Ctx.arc(Sc[0] - DropR * 0.26, Sc[1] + DropR * 0.22, Math.max(0.75, DropR * 0.24), 0, Math.PI * 2); Ctx.fill();
                        }
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 15)
                    {
                        const RadW = BaseWorldSize * 0.5;
                        const D = P.dir || [0, 1, 0];
                        const DL = Math.hypot(D[0], D[1], D[2]) || 1;
                        const Dn = [D[0] / DL, D[1] / DL, D[2] / DL];
                        const Ref = Math.abs(Dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
                        const U0 = [Ref[1] * Dn[2] - Ref[2] * Dn[1], Ref[2] * Dn[0] - Ref[0] * Dn[2], Ref[0] * Dn[1] - Ref[1] * Dn[0]];
                        const UL = Math.hypot(U0[0], U0[1], U0[2]) || 1;
                        const Bu = [U0[0] / UL, U0[1] / UL, U0[2] / UL];
                        const Bv = [Dn[1] * Bu[2] - Dn[2] * Bu[1], Dn[2] * Bu[0] - Dn[0] * Bu[2], Dn[0] * Bu[1] - Dn[1] * Bu[0]];
                        const PtOnPlane = (u, v) => ProjectPoint(VP, Pt.x + (Bu[0] * u + Bv[0] * v) * RadW, Pt.y + (Bu[1] * u + Bv[1] * v) * RadW, Pt.z + (Bu[2] * u + Bv[2] * v) * RadW, W, H);
                        const DrawRing3D = (Frac, ColCss, Lw) => {
                            const Pts3 = [];
                            for (let S = 0; S <= 36; S++) {
                                const A = (S / 36) * Math.PI * 2;
                                const Pr = PtOnPlane(Math.cos(A) * Frac, Math.sin(A) * Frac);
                                if (Pr) Pts3.push(Pr);
                            }
                            if (Pts3.length >= 12) {
                                Ctx.strokeStyle = ColCss; Ctx.lineWidth = Lw;
                                Ctx.beginPath();
                                Pts3.forEach((Pt2, K) => K === 0 ? Ctx.moveTo(Pt2[0], Pt2[1]) : Ctx.lineTo(Pt2[0], Pt2[1]));
                                Ctx.stroke();
                            }
                        };
                        Ctx.save();
                        if ((P.leafMode || 0) >= 1)
                        {
                            DrawRing3D(0.90, LinearToCss(Col, Alpha * 0.92), Math.max(1.8, 3.0 * (1 - T)));
                            DrawRing3D(0.62, LinearToCss(Col, Alpha * 0.52), 1.4);
                            DrawRing3D(0.34, LinearToCss(Col, Alpha * 0.28), 1.0);
                            const P0 = PtOnPlane(-0.92, 0), P1 = PtOnPlane(0.92, 0), P2 = PtOnPlane(0, -0.92), P3 = PtOnPlane(0, 0.92);
                            Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.24); Ctx.lineWidth = 1.0;
                            Ctx.beginPath();
                            if (P0 && P1) { Ctx.moveTo(P0[0], P0[1]); Ctx.lineTo(P1[0], P1[1]); }
                            if (P2 && P3) { Ctx.moveTo(P2[0], P2[1]); Ctx.lineTo(P3[0], P3[1]); }
                            Ctx.stroke();
                        }
                        else
                        {
                            for (const Rf of [0.25, 0.50, 0.75, 0.95])
                                DrawRing3D(Rf, LinearToCss(Col, Alpha * (Rf > 0.9 ? 0.72 : 0.34)), Rf > 0.9 ? 1.8 : 1.0);
                            const P0 = PtOnPlane(-0.95, 0), P1 = PtOnPlane(0.95, 0), P2 = PtOnPlane(0, -0.95), P3 = PtOnPlane(0, 0.95);
                            Ctx.strokeStyle = LinearToCss(Col, Alpha * 0.28); Ctx.lineWidth = 1.0;
                            Ctx.beginPath();
                            if (P0 && P1) { Ctx.moveTo(P0[0], P0[1]); Ctx.lineTo(P1[0], P1[1]); }
                            if (P2 && P3) { Ctx.moveTo(P2[0], P2[1]); Ctx.lineTo(P3[0], P3[1]); }
                            Ctx.stroke();

                            // Rotating phosphor sweep wedge & leading beam arm
                            const SweepAng = Time * Math.max(0, P.curlRate ?? 2.2);
                            const Ctr2 = PtOnPlane(0, 0);
                            if (Ctr2)
                            {
                                for (let Wk = 0; Wk < 6; Wk++)
                                {
                                    const A0 = SweepAng - (Wk + 1) * 0.16, A1 = SweepAng - Wk * 0.16;
                                    const Q0 = PtOnPlane(Math.cos(A0) * 0.95, Math.sin(A0) * 0.95);
                                    const Q1 = PtOnPlane(Math.cos(A1) * 0.95, Math.sin(A1) * 0.95);
                                    if (Q0 && Q1)
                                    {
                                        Ctx.fillStyle = LinearToCss(Col, Alpha * (0.22 * (1 - Wk / 6)));
                                        Ctx.beginPath(); Ctx.moveTo(Ctr2[0], Ctr2[1]); Ctx.lineTo(Q0[0], Q0[1]); Ctx.lineTo(Q1[0], Q1[1]); Ctx.closePath(); Ctx.fill();
                                    }
                                }
                                const Tip2 = PtOnPlane(Math.cos(SweepAng) * 0.95, Math.sin(SweepAng) * 0.95);
                                if (Tip2)
                                {
                                    Ctx.strokeStyle = `rgba(235, 255, 248, ${(Alpha * 0.95).toFixed(3)})`;
                                    Ctx.lineWidth = 2.2;
                                    Ctx.beginPath(); Ctx.moveTo(Ctr2[0], Ctr2[1]); Ctx.lineTo(Tip2[0], Tip2[1]); Ctx.stroke();
                                }
                            }
                            // 6 procedural contact blips flaring when sweep passes
                            for (let K = 0; K < 6; K++)
                            {
                                const H1 = (((Math.sin((K + 1) * 127.1 + 91.0) * 43758.5453) % 1) + 1) % 1;
                                const H2 = (((Math.sin((K + 1) * 311.7 + 97.0) * 43758.5453) % 1) + 1) % 1;
                                const Br = 0.22 + 0.66 * H1, Ba = -Math.PI + Math.PI * 2 * H2;
                                const Lag = (((SweepAng - Ba) / (Math.PI * 2)) % 1 + 1) % 1;
                                const Ping = Math.exp(-Lag * 3.8);
                                const Bp = PtOnPlane(Math.cos(Ba) * Br, Math.sin(Ba) * Br);
                                if (Bp)
                                {
                                    const BlipR = 2.4 + 2.6 * Ping;
                                    Ctx.fillStyle = `rgba(235, 255, 245, ${(Alpha * (0.28 + 0.72 * Ping)).toFixed(3)})`;
                                    Ctx.beginPath(); Ctx.arc(Bp[0], Bp[1], BlipR, 0, Math.PI * 2); Ctx.fill();
                                    if (Ping > 0.15)
                                    {
                                        Ctx.strokeStyle = LinearToCss(Col, Alpha * Ping * 0.75);
                                        Ctx.lineWidth = 1.2;
                                        Ctx.beginPath(); Ctx.arc(Bp[0], Bp[1], BlipR + Lag * 14, 0, Math.PI * 2); Ctx.stroke();
                                    }
                                }
                            }
                        }
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 16)
                    {
                        const RadS = Math.max(14, R * 0.52);
                        Ctx.save();
                        if (Ctx.createRadialGradient)
                        {
                            const SG = Ctx.createRadialGradient(Sc[0], Sc[1], RadS * 0.12, Sc[0], Sc[1], RadS);
                            SG.addColorStop(0.0, LinearToCss(Col, Alpha * 0.08));
                            SG.addColorStop(0.72, LinearToCss(Col, Alpha * 0.28));
                            SG.addColorStop(0.95, LinearToCss(P.colC || Col, Alpha * 0.85));
                            SG.addColorStop(1.0, LinearToCss(Col, 0));
                            Ctx.fillStyle = SG;
                            Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], RadS, 0, Math.PI * 2); Ctx.fill();
                        }
                        // Honeycomb hex lattice nodes projected inside the barrier disc + geodesic impact ripples
                        Ctx.strokeStyle = LinearToCss(P.colC || Col, Alpha * 0.42);
                        Ctx.lineWidth = 1.0;
                        const HexScale = 2.1 / Math.max(0.3, P.curlFreq ?? 2.1);
                        const HexR = Math.max(5, RadS * 0.24 * HexScale);
                        const HexSpan = Math.min(8, Math.ceil((RadS * 0.86) / Math.max(2, HexR * 1.45)));
                        for (let Hy = -HexSpan; Hy <= HexSpan; Hy++)
                        {
                            for (let Hx = -HexSpan; Hx <= HexSpan; Hx++)
                            {
                                const Cx0 = (Hx + (Hy & 1) * 0.5) * HexR * 1.68;
                                const Cy0 = Hy * HexR * 1.45;
                                if (Math.hypot(Cx0, Cy0) > RadS * 0.86) continue;
                                Ctx.beginPath();
                                for (let S = 0; S < 6; S++)
                                {
                                    const Ha = (S * Math.PI) / 3;
                                    const Px2 = Sc[0] + Cx0 + Math.cos(Ha) * (HexR * 0.82);
                                    const Py2 = Sc[1] + Cy0 + Math.sin(Ha) * (HexR * 0.82);
                                    if (S === 0) Ctx.moveTo(Px2, Py2); else Ctx.lineTo(Px2, Py2);
                                }
                                Ctx.closePath();
                                Ctx.stroke();
                            }
                        }
                        // Expanding geodesic impact ripple arcs
                        const RippleRate = Math.max(0.05, P.curlRate ?? 0.55);
                        for (let K = 0; K < 2; K++)
                        {
                            const Phase = Time * RippleRate + K * 0.5;
                            const Cyc = Phase % 1;
                            const ImpX = Sc[0] + Math.cos(K * 2.4 + Math.floor(Phase) * 1.9) * RadS * 0.36;
                            const ImpY = Sc[1] - Math.sin(K * 1.7 + Math.floor(Phase) * 1.3) * RadS * 0.28;
                            const RipR = Cyc * RadS * 1.15;
                            const FadeR = (1 - SmoothT(0.5, 1.0, Cyc)) * Alpha;
                            if (FadeR > 0.02)
                            {
                                Ctx.strokeStyle = `rgba(225, 255, 255, ${(FadeR * 0.88).toFixed(3)})`;
                                Ctx.lineWidth = 2.0;
                                Ctx.beginPath(); Ctx.arc(ImpX, ImpY, RipR, 0, Math.PI * 2); Ctx.stroke();
                            }
                        }
                        Ctx.strokeStyle = `rgba(215, 252, 255, ${(Alpha * 0.78).toFixed(3)})`;
                        Ctx.lineWidth = 1.6;
                        Ctx.beginPath(); Ctx.arc(Sc[0], Sc[1], RadS * 0.96, 0, Math.PI * 2); Ctx.stroke();
                        Ctx.restore();
                        continue;
                    }
                    else if (Shape === 17)
                    {
                        const Cw = Math.max(24, R * 1.85), Ch = Math.max(22, R * 0.98);
                        const AurRate = Math.max(0.02, P.curlRate ?? 0.52);
                        const AurFreq = Math.max(0.25, Math.min(4.0, P.curlFreq ?? 1.0));
                        Ctx.save();
                        Ctx.translate(Sc[0], Sc[1]);
                        if (Ctx.createLinearGradient)
                        {
                            const AG = Ctx.createLinearGradient(0, Ch * 0.5, 0, -Ch * 0.55);
                            AG.addColorStop(0.0, LinearToCss(P.colA, 0));
                            AG.addColorStop(0.18, LinearToCss(P.colA, Alpha * 0.85));
                            AG.addColorStop(0.55, LinearToCss(P.colC || P.colA, Alpha * 0.52));
                            AG.addColorStop(1.0, LinearToCss(P.colB, 0));
                            Ctx.fillStyle = AG;
                        }
                        else Ctx.fillStyle = LinearToCss(Col, Alpha * 0.65);
                        Ctx.beginPath();
                        const Fold = Math.sin(Time * (AurRate * 1.4423) + (Pt.seed || 0) * 0.01) * Ch * 0.14;
                        Ctx.moveTo(-Cw * 0.5, Ch * 0.48);
                        Ctx.quadraticCurveTo(0, Ch * 0.48 + Fold, Cw * 0.5, Ch * 0.48);
                        Ctx.lineTo(Cw * 0.44, -Ch * 0.52);
                        Ctx.quadraticCurveTo(0, -Ch * 0.52 + Fold * 0.5, -Cw * 0.44, -Ch * 0.52);
                        Ctx.closePath();
                        Ctx.fill();
                        // Shimmering vertical geomagnetic rays inside curtain
                        Ctx.strokeStyle = LinearToCss(P.colA, Alpha * 0.42);
                        Ctx.lineWidth = 1.6;
                        const RayCount = Math.max(2, Math.round(3 * AurFreq));
                        for (let Rk = -RayCount; Rk <= RayCount; Rk++)
                        {
                            const Rx = (Rk / Math.max(1, RayCount)) * (Cw * 0.36) + Math.sin(Time * (AurRate * 2.6923) + Rk + (Pt.seed || 0)) * 4;
                            Ctx.beginPath(); Ctx.moveTo(Rx, Ch * 0.42); Ctx.lineTo(Rx + 3, -Ch * 0.36); Ctx.stroke();
                        }
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
                if (Sys.shatters?.length)
                {
                    for (const C of Sys.shatters)
                    {
                        const Sc2 = ProjectPoint(VP, C.x, C.y, C.z, W, H);
                        if (!Sc2) continue;
                        const Side = Math.max(1.5, ((C.sz * 180) / Sc2[2]) * 1.15);
                        const Fade = 1 - SmoothT(0.6, 1, C.age / Math.max(0.01, C.life));
                        Ctx.fillStyle = LinearToCss(P.colA, Fade * 0.9);
                        Ctx.fillRect(Sc2[0] - Side * 0.5, Sc2[1] - Side * 0.5, Side, Side);
                    }
                }
                if (P.blackHole)
                {
                    const Bh = ProjectPoint(VP, P.origin[0], P.origin[1], P.origin[2], W, H);
                    if (Bh)
                    {
                        const HorR = Math.max(12, ((P.blackHole.horizon * 180) / Bh[2]) * 1.45);
                        Ctx.save();
                        Ctx.globalCompositeOperation = 'lighter';
                        if (Ctx.createRadialGradient)
                        {
                            const EG = Ctx.createRadialGradient(Bh[0], Bh[1], HorR * 0.95, Bh[0], Bh[1], HorR * 2.1);
                            EG.addColorStop(0.0, 'rgba(255, 195, 105, 0)');
                            EG.addColorStop(0.28, 'rgba(255, 205, 120, 0.85)');
                            EG.addColorStop(0.55, 'rgba(255, 120, 42, 0.32)');
                            EG.addColorStop(1.0, 'rgba(255, 90, 20, 0)');
                            Ctx.fillStyle = EG;
                            Ctx.beginPath(); Ctx.arc(Bh[0], Bh[1], HorR * 2.1, 0, Math.PI * 2); Ctx.fill();
                        }
                        Ctx.globalCompositeOperation = 'source-over';
                        Ctx.fillStyle = 'rgba(2, 3, 6, 0.98)';
                        Ctx.beginPath(); Ctx.arc(Bh[0], Bh[1], HorR, 0, Math.PI * 2); Ctx.fill();
                        Ctx.restore();
                    }
                }
                if (P.heatShimmer)
                {
                    const Hs = ProjectPoint(VP, P.origin[0], P.origin[1] + 0.8, P.origin[2], W, H);
                    if (Hs)
                    {
                        const ShR = Math.max(18, ((P.heatShimmer.radius * 135) / Hs[2]));
                        Ctx.save();
                        Ctx.globalCompositeOperation = 'lighter';
                        for (let Wk = 0; Wk < 5; Wk++)
                        {
                            const OffY = ((Time * (P.heatShimmer.rate || 1.5) * 32 + Wk * ShR * 0.42) % (ShR * 1.6)) - ShR * 0.8;
                            const WaveW = ShR * (0.85 - Math.abs(OffY) / (ShR * 1.4));
                            if (WaveW <= 4) continue;
                            Ctx.strokeStyle = `rgba(210, 235, 255, ${(0.12 * (1 - Math.abs(OffY) / ShR)).toFixed(3)})`;
                            Ctx.lineWidth = 1.6;
                            Ctx.beginPath();
                            Ctx.moveTo(Hs[0] - WaveW, Hs[1] - OffY);
                            Ctx.quadraticCurveTo(Hs[0] + Math.sin(Time * 8 + Wk) * 14, Hs[1] - OffY - 7, Hs[0] + WaveW, Hs[1] - OffY);
                            Ctx.stroke();
                        }
                        Ctx.restore();
                    }
                }
                Ctx.globalCompositeOperation = 'source-over';
            }
        }

        // HDR Additive Plasma Spark & Dielectric Arc Channels (outer UV corona -> plasma sheath -> white-hot core + contact flares)
        if ((arcSegs && arcSegs.length) || (arcFlashes && arcFlashes.length))
        {
            Ctx.save();
            Ctx.globalCompositeOperation = 'lighter';
            Ctx.lineCap = 'round';
            Ctx.lineJoin = 'round';
            if (arcSegs && arcSegs.length)
            {
                const ProjSegs = [];
                for (let S = 0; S < arcSegs.length; S += 12)
                {
                    const Inten = arcSegs[S + 11];
                    if (Inten <= 0.002) continue;
                    const A = ProjectPoint(VP, arcSegs[S], arcSegs[S + 1], arcSegs[S + 2], W, H);
                    const B = ProjectPoint(VP, arcSegs[S + 4], arcSegs[S + 5], arcSegs[S + 6], W, H);
                    if (!A || !B) continue;
                    const AvgW = 0.5 * (arcSegs[S + 3] + arcSegs[S + 7]);
                    const Depth = Math.max(1.5, 0.5 * (A[2] + B[2]));
                    const PxW = Math.max(0.45, (AvgW * 380) / Depth);
                    const Cr = Math.round(arcSegs[S + 8] * 255), Cg = Math.round(arcSegs[S + 9] * 255), Cb = Math.round(arcSegs[S + 10] * 255);
                    ProjSegs.push({ A, B, PxW, Inten, Cr, Cg, Cb });
                }
                // Pass 1: Soft outer UV ionization halo
                for (const Seg of ProjSegs)
                {
                    const A1 = Math.min(0.45, Seg.Inten * 0.14);
                    if (A1 <= 0.003) continue;
                    Ctx.strokeStyle = `rgba(${Math.round(Seg.Cr * 0.55 + 75)},${Math.round(Seg.Cg * 0.55 + 50)},255,${A1.toFixed(3)})`;
                    Ctx.lineWidth = Math.max(2.0, Seg.PxW * 4.4);
                    Ctx.beginPath(); Ctx.moveTo(Seg.A[0], Seg.A[1]); Ctx.lineTo(Seg.B[0], Seg.B[1]); Ctx.stroke();
                }
                // Pass 2: Inner electric plasma sheath
                for (const Seg of ProjSegs)
                {
                    const A2 = Math.min(0.92, Seg.Inten * 0.48);
                    if (A2 <= 0.004) continue;
                    Ctx.strokeStyle = `rgba(${Seg.Cr},${Seg.Cg},${Seg.Cb},${A2.toFixed(3)})`;
                    Ctx.lineWidth = Math.max(1.0, Seg.PxW * 1.85);
                    Ctx.beginPath(); Ctx.moveTo(Seg.A[0], Seg.A[1]); Ctx.lineTo(Seg.B[0], Seg.B[1]); Ctx.stroke();
                }
                // Pass 3: Razor-sharp white-hot arc core
                for (const Seg of ProjSegs)
                {
                    const A3 = Math.min(1.0, Seg.Inten * 0.96);
                    if (A3 <= 0.006) continue;
                    Ctx.strokeStyle = `rgba(255,255,255,${A3.toFixed(3)})`;
                    Ctx.lineWidth = Math.max(0.65, Seg.PxW * 0.52);
                    Ctx.beginPath(); Ctx.moveTo(Seg.A[0], Seg.A[1]); Ctx.lineTo(Seg.B[0], Seg.B[1]); Ctx.stroke();
                }
            }
            if (arcFlashes && arcFlashes.length && Ctx.createRadialGradient)
            {
                for (let F = 0; F < arcFlashes.length; F += 8)
                {
                    const Inten = arcFlashes[F + 7];
                    if (Inten <= 0.004) continue;
                    const Pt = ProjectPoint(VP, arcFlashes[F], arcFlashes[F + 1], arcFlashes[F + 2], W, H);
                    if (!Pt) continue;
                    const RadPx = Math.max(6, (arcFlashes[F + 3] * 380) / Math.max(1.5, Pt[2]));
                    const Cr = Math.round(arcFlashes[F + 4] * 255), Cg = Math.round(arcFlashes[F + 5] * 255), Cb = Math.round(arcFlashes[F + 6] * 255);
                    const FG = Ctx.createRadialGradient(Pt[0], Pt[1], 0, Pt[0], Pt[1], RadPx);
                    FG.addColorStop(0.0, `rgba(255,255,255,${Math.min(1, Inten * 0.95).toFixed(3)})`);
                    FG.addColorStop(0.24, `rgba(${Cr},${Cg},${Cb},${Math.min(0.85, Inten * 0.55).toFixed(3)})`);
                    FG.addColorStop(1.0, `rgba(${Cr},${Cg},${Cb},0)`);
                    Ctx.fillStyle = FG;
                    Ctx.beginPath(); Ctx.arc(Pt[0], Pt[1], RadPx, 0, Math.PI * 2); Ctx.fill();
                }
            }
            Ctx.restore();
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
