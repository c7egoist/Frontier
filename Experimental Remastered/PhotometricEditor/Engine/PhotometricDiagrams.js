/*==========================================================================================================================================
                                                        PHOTOMETRICDIAGRAMS.JS
==========================================================================================================================================*/
// Analytical photometric, goniometric, and environment-light canvas plots matching Project Zero LightProjection.js + Native Cards.

import {
    Clamp,
    ResolveEmissionRgb,
    EvaluateIesIntensity,
    MoonCatalogue,
    SolveMoonMetrics,
    KelvinToRgb
} from './PhotometryEngine.js';

import {
    EvaluateSolarEphemeris,
    EvaluateSkyRayRadiance,
    ToneMapReinhardSrgb,
    CreateDefaultAtmosphereParameters
} from './CelestialAtmosphereModel.js';

const Rgb = (C, A = 1) => `rgba(${C[0]},${C[1]},${C[2]},${A})`;

function FitCanvas(Canvas, LogicalW, LogicalH)
{
    if (!Canvas) return null;
    const Dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    const W = Math.round(LogicalW * Dpr);
    const H = Math.round(LogicalH * Dpr);
    if (Canvas.width !== W || Canvas.height !== H) {
        Canvas.width = W;
        Canvas.height = H;
    }
    const Ctx = Canvas.getContext('2d');
    if (!Ctx) return null;
    Ctx.save();
    Ctx.scale(Dpr, Dpr);
    Ctx.clearRect(0, 0, LogicalW, LogicalH);
    return { Ctx, W: LogicalW, H: LogicalH };
}

function GridFloor(Ctx, W, H)
{
    Ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    Ctx.lineWidth = 1;
    const Mid = W / 2;
    for (let x = Mid % 28; x < W; x += 28) {
        Ctx.beginPath();
        Ctx.moveTo(x, H * 0.72);
        Ctx.lineTo(Mid + (x - Mid) * 3.1, H);
        Ctx.stroke();
    }
    for (let r = 0; r < 5; r++) {
        const y = H * 0.72 + Math.pow(r / 4, 1.45) * H * 0.28;
        Ctx.beginPath();
        Ctx.moveTo(0, y);
        Ctx.lineTo(W, y);
        Ctx.stroke();
    }
}

function LightBadge(Ctx, X, Y, R, Col, Intensity)
{
    const G = Ctx.createRadialGradient(X, Y, 1, X, Y, R * 3.8);
    G.addColorStop(0, Rgb(Col, Math.min(0.95, 0.35 + Intensity * 0.2)));
    G.addColorStop(0.28, Rgb(Col, 0.28));
    G.addColorStop(1, 'rgba(0,0,0,0)');
    Ctx.fillStyle = G;
    Ctx.beginPath();
    Ctx.arc(X, Y, R * 3.8, 0, Math.PI * 2);
    Ctx.fill();

    Ctx.fillStyle = '#fff';
    Ctx.beginPath();
    Ctx.arc(X, Y, R * 0.55, 0, Math.PI * 2);
    Ctx.fill();
}

//------------------------------------------------------------------------------------------------------------------------
//                                  HERO PROJECTOR STUDY CANVAS (260px HIGH — 7 LIGHT TYPES)
//------------------------------------------------------------------------------------------------------------------------

export function DrawHeroLightCanvas(Canvas, Type, Props, LoadedProfiles)
{
    const Width = Canvas?.clientWidth || 340;
    const Height = Canvas?.clientHeight || 228;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    const Bg = Ctx.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.5, W * 0.75);
    Bg.addColorStop(0, '#14171d');
    Bg.addColorStop(1, '#090b0f');
    Ctx.fillStyle = Bg;
    Ctx.fillRect(0, 0, W, H);
    GridFloor(Ctx, W, H);

    const Col = ResolveEmissionRgb(Props);
    const CX = W * 0.5;
    const CY = H * 0.28;
    const Num = (K, D) => Number.isFinite(Number(Props[K])) ? Number(Props[K]) : D;

    if (Type === 'pointlight') {
        const Reach = Num('distance', 25);
        const Dec = Num('decay', 2);
        const Int = Num('intensity', 14);
        const MaxR = H * 0.62;
        const Grad = Ctx.createRadialGradient(CX, CY + 18, 2, CX, CY + 18, MaxR);
        Grad.addColorStop(0, Rgb(Col, 0.92));
        Grad.addColorStop(0.24, Rgb(Col, 0.42 * Clamp(1 / (0.6 + Dec * 0.2), 0.1, 1)));
        Grad.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = Grad;
        Ctx.beginPath();
        Ctx.arc(CX, CY + 18, MaxR, 0, Math.PI * 2);
        Ctx.fill();
        Ctx.setLineDash([3, 4]);
        [0.35, 0.65, 0.95].forEach((F, Idx) => {
            Ctx.strokeStyle = Rgb(Col, 0.32 - Idx * 0.08);
            Ctx.beginPath();
            Ctx.arc(CX, CY + 18, MaxR * F, 0, Math.PI * 2);
            Ctx.stroke();
        });
        Ctx.setLineDash([]);
        LightBadge(Ctx, CX, CY + 18, 10, Col, Int / 20);
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`OMNIDIRECTIONAL · DECAY ${Dec.toFixed(1)} · R ${Reach.toFixed(0)} m`, 12, H - 10);
    } else if (Type === 'spotlight') {
        const Angle = (Num('angle', 30) * Math.PI) / 180;
        const Pen = Num('penumbra', 0.42);
        const ConeLen = H * 0.68;
        const OuterX = Math.tan(Angle) * ConeLen;
        const InnerX = OuterX * (1 - Pen);
        const FloorY = CY + ConeLen;
        const Gr = Ctx.createLinearGradient(CX, CY, CX, FloorY);
        Gr.addColorStop(0, Rgb(Col, 0.56));
        Gr.addColorStop(1, Rgb(Col, 0.04));
        Ctx.fillStyle = Gr;
        Ctx.beginPath();
        Ctx.moveTo(CX, CY);
        Ctx.lineTo(CX - OuterX, FloorY);
        Ctx.lineTo(CX + OuterX, FloorY);
        Ctx.closePath();
        Ctx.fill();

        const InnerGr = Ctx.createLinearGradient(CX, CY, CX, FloorY);
        InnerGr.addColorStop(0, Rgb(Col, 0.72));
        InnerGr.addColorStop(1, Rgb(Col, 0.14));
        Ctx.fillStyle = InnerGr;
        Ctx.beginPath();
        Ctx.moveTo(CX, CY);
        Ctx.lineTo(CX - InnerX, FloorY);
        Ctx.lineTo(CX + InnerX, FloorY);
        Ctx.closePath();
        Ctx.fill();

        Ctx.strokeStyle = Rgb(Col, 0.5);
        Ctx.setLineDash([4, 3]);
        Ctx.beginPath();
        Ctx.moveTo(CX, CY);
        Ctx.lineTo(CX - OuterX, FloorY);
        Ctx.moveTo(CX, CY);
        Ctx.lineTo(CX + OuterX, FloorY);
        Ctx.stroke();
        Ctx.setLineDash([]);

        Ctx.fillStyle = Rgb(Col, 0.34);
        Ctx.beginPath();
        Ctx.ellipse(CX, FloorY, Math.max(8, OuterX), 11, 0, 0, Math.PI * 2);
        Ctx.fill();
        LightBadge(Ctx, CX, CY, 8, Col, Num('intensity', 32) / 40);
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`CONE ${(Num('angle', 30) * 2).toFixed(0)} deg · PENUMBRA ${Math.round(Pen * 100)}%`, 12, H - 10);
    } else if (Type === 'ieslight') {
        const MaxR = H * 0.68;
        const Cutoff = ((Num('cutoff', 0) * Math.PI) / 180) * 1.4;
        const DrawPlane = (AzimuthDeg, Alpha, Fill) => {
            Ctx.beginPath();
            for (let Step = 0; Step <= 180; Step++) {
                const Theta = -Math.PI + (Step / 180) * Math.PI * 2;
                const PolarDeg = Math.abs(Theta) * (180 / Math.PI);
                const SampleAz = Theta < 0 ? (AzimuthDeg + 180) % 360 : AzimuthDeg;
                const Val = EvaluateIesIntensity(Props, LoadedProfiles, SampleAz, Clamp(PolarDeg, 0, 180));
                const R = Val * MaxR;
                const X = CX + Math.sin(Theta + Cutoff) * R;
                const Y = CY + Math.cos(Theta + Cutoff) * R;
                if (Step === 0) Ctx.moveTo(X, Y);
                else Ctx.lineTo(X, Y);
            }
            Ctx.closePath();
            if (Fill) {
                const G = Ctx.createRadialGradient(CX, CY, 2, CX, CY, MaxR);
                G.addColorStop(0, Rgb(Col, 0.56));
                G.addColorStop(0.55, Rgb(Col, 0.18));
                G.addColorStop(1, Rgb(Col, 0.03));
                Ctx.fillStyle = G;
                Ctx.fill();
            }
            Ctx.strokeStyle = Rgb(Col, Alpha);
            Ctx.lineWidth = Fill ? 1.6 : 1.05;
            if (!Fill) Ctx.setLineDash([4, 3]);
            Ctx.stroke();
            Ctx.setLineDash([]);
        };
        // Concentric goniometer rings
        Ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        Ctx.lineWidth = 1;
        [0.25, 0.5, 0.75, 1].forEach(R => {
            Ctx.beginPath();
            Ctx.arc(CX, CY, MaxR * R, 0, Math.PI * 2);
            Ctx.stroke();
        });
        DrawPlane(90, 0.48, false);
        DrawPlane(0, 0.92, true);
        LightBadge(Ctx, CX, CY, 7, Col, Num('multiplier', 1));
        const ActiveName = Props.customIesKey
            ? `IES FILE: ${Props.customIesKey}`
            : Props.useMeasuredIes
                ? `LM-63 ${Props.measuredProfile?.toUpperCase() || 'MEASURED'}`
                : (Props.profile || 'Downlight').toUpperCase();
        Ctx.fillStyle = 'rgba(255,255,255,0.58)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`${ActiveName} · C0 SOLID / C90 DASHED`, 12, H - 10);
    } else if (Type === 'arealight') {
        const AW = Num('width', 2);
        const AH = Num('height', 1);
        const Scale = Math.min(180 / Math.max(AW, 0.4), 76 / Math.max(AH, 0.4));
        const W2 = Clamp(AW * Scale, 28, W * 0.62);
        const H2 = Clamp(AH * Scale, 18, H * 0.38);
        const BoxY = H * 0.34;
        const Spread = ((Num('spread', 120) / 180) * H) * 0.35;
        const FloorG = Ctx.createLinearGradient(0, BoxY + H2 / 2, 0, H * 0.92);
        FloorG.addColorStop(0, Rgb(Col, 0.44));
        FloorG.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = FloorG;
        Ctx.beginPath();
        Ctx.moveTo(CX - W2 / 2, BoxY + H2 / 2);
        Ctx.lineTo(CX + W2 / 2, BoxY + H2 / 2);
        Ctx.lineTo(CX + W2 / 2 + Spread, H * 0.92);
        Ctx.lineTo(CX - W2 / 2 - Spread, H * 0.92);
        Ctx.closePath();
        Ctx.fill();

        const Face = Ctx.createRadialGradient(CX, BoxY, 4, CX, BoxY, Math.max(W2, H2));
        Face.addColorStop(0, '#fff');
        Face.addColorStop(0.55, Rgb(Col, 0.85));
        Face.addColorStop(1, Rgb(Col, 0.25));
        Ctx.fillStyle = Face;
        Ctx.strokeStyle = Rgb(Col, 0.95);
        Ctx.lineWidth = 1.5;
        if (Props.aperture === 'Disk') {
            Ctx.beginPath();
            Ctx.ellipse(CX, BoxY, W2 * 0.5, H2 * 0.5, 0, 0, Math.PI * 2);
            Ctx.fill();
            Ctx.stroke();
        } else {
            Ctx.fillRect(CX - W2 / 2, BoxY - H2 / 2, W2, H2);
            Ctx.strokeRect(CX - W2 / 2, BoxY - H2 / 2, W2, H2);
            Ctx.strokeStyle = 'rgba(0,0,0,0.28)';
            for (let gx = 1; gx < 5; gx++) {
                const X = CX - W2 / 2 + (W2 * gx) / 5;
                Ctx.beginPath();
                Ctx.moveTo(X, BoxY - H2 / 2);
                Ctx.lineTo(X, BoxY + H2 / 2);
                Ctx.stroke();
            }
        }
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`${(Props.aperture || 'RECTANGLE').toUpperCase()} · ${AW.toFixed(1)} x ${AH.toFixed(1)} m · SPREAD ${Num('spread', 120)} deg`, 12, H - 10);
    } else if (Type === 'tubelight') {
        const TL = Clamp(Num('length', 1.8) * 90, 64, W * 0.72);
        const Rad = Clamp(Num('radius', 0.04) * 180, 4, 18);
        const Ty = H * 0.45;
        const Halo = Ctx.createRadialGradient(CX, Ty, Rad, CX, Ty, TL * 0.65);
        Halo.addColorStop(0, Rgb(Col, 0.55));
        Halo.addColorStop(0.5, Rgb(Col, 0.14));
        Halo.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = Halo;
        Ctx.fillRect(0, 0, W, H);
        Ctx.lineCap = 'round';
        Ctx.strokeStyle = Rgb(Col, 0.35);
        Ctx.lineWidth = Rad * 2 + 12;
        Ctx.beginPath();
        Ctx.moveTo(CX - TL / 2, Ty);
        Ctx.lineTo(CX + TL / 2, Ty);
        Ctx.stroke();
        Ctx.strokeStyle = '#fff';
        Ctx.lineWidth = Math.max(3, Rad * 1.1);
        Ctx.beginPath();
        Ctx.moveTo(CX - TL / 2, Ty);
        Ctx.lineTo(CX + TL / 2, Ty);
        Ctx.stroke();
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`LINEAR FLUORESCENT · ${Num('length', 1.8).toFixed(2)} m · ${Math.round(Num('radius', 0.04) * 1000)} mm`, 12, H - 10);
    } else if (Type === 'ledlight') {
        const Diam = Num('diameter', 40);
        const Ang = (Num('angle', 110) * Math.PI) / 180;
        const DieR = Clamp(Diam * 0.42, 10, 32);
        const LY = H * 0.36;
        const SpreadX = Math.tan(Math.min(Math.PI * 0.46, Ang * 0.5)) * (H * 0.48);
        const ConeG = Ctx.createLinearGradient(CX, LY, CX, H * 0.9);
        ConeG.addColorStop(0, Rgb(Col, 0.5));
        ConeG.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = ConeG;
        Ctx.beginPath();
        Ctx.moveTo(CX - DieR, LY + 6);
        Ctx.lineTo(CX + DieR, LY + 6);
        Ctx.lineTo(CX + SpreadX, H * 0.9);
        Ctx.lineTo(CX - SpreadX, H * 0.9);
        Ctx.closePath();
        Ctx.fill();

        Ctx.fillStyle = '#262b34';
        Ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        Ctx.lineWidth = 1.5;
        Ctx.fillRect(CX - DieR - 8, LY - 12, (DieR + 8) * 2, 22);
        Ctx.strokeRect(CX - DieR - 8, LY - 12, (DieR + 8) * 2, 22);
        for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 4; dx++) {
                Ctx.fillStyle = '#f3b749';
                Ctx.fillRect(CX - DieR + dx * (DieR * 0.48) + 2, LY - 7 + dy * 5, DieR * 0.34, 3);
            }
        }
        LightBadge(Ctx, CX, LY + 12, 6, Col, Num('dimmer', 1));
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`COB PHOSPHOR ARRAY · ${Num('watts', 18).toFixed(1)} W · ${Diam} mm`, 12, H - 10);
    } else if (Type === 'ledstrip') {
        const Len = Num('length', 3.6);
        const Lpm = Num('ledsPerMetre', 60);
        const Diff = Boolean(Props.diffuser);
        const BarW = Clamp(Len * 64, 110, W * 0.8);
        const Sy = H * 0.46;
        const Halo = Ctx.createLinearGradient(0, Sy - 36, 0, Sy + 46);
        Halo.addColorStop(0, 'rgba(0,0,0,0)');
        Halo.addColorStop(0.5, Rgb(Col, Diff ? 0.56 : 0.36));
        Halo.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = Halo;
        Ctx.fillRect(CX - BarW / 2 - 20, Sy - 36, BarW + 40, 82);
        Ctx.fillStyle = '#2c2214';
        Ctx.fillRect(CX - BarW / 2, Sy - 6, BarW, 12);
        if (Diff) {
            Ctx.fillStyle = Rgb(Col, 0.94);
            Ctx.fillRect(CX - BarW / 2, Sy - 4, BarW, 8);
        } else {
            const Count = Math.min(48, Math.max(6, Math.round((Lpm * Len) / 8)));
            for (let idx = 0; idx < Count; idx++) {
                const Dx = CX - BarW / 2 + ((idx + 0.5) / Count) * BarW;
                Ctx.fillStyle = Rgb(Col, 0.96);
                Ctx.fillRect(Dx - 2, Sy - 3, 4, 6);
            }
        }
        Ctx.fillStyle = 'rgba(255,255,255,0.52)';
        Ctx.font = '500 10px "DM Sans", sans-serif';
        Ctx.fillText(`PCB RIBBON · ${Math.round(Lpm * Len)} LEDS · ${Diff ? 'OPAL DIFFUSER' : 'EXPOSED DIES'}`, 12, H - 10);
    }
    Ctx.restore();
}

//------------------------------------------------------------------------------------------------------------------------
//                                      ANALYTICAL OUTPUT RESPONSE PLOTS (EMBEDDED CARD)
//------------------------------------------------------------------------------------------------------------------------

export function DrawResponseCurveCanvas(Canvas, Type, Props, LoadedProfiles)
{
    const Width = Canvas?.clientWidth || 310;
    const Height = Canvas?.clientHeight || 110;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return { Kind: 'Response', Rows: [] };
    const { Ctx, W, H } = Frame;
    const Col = ResolveEmissionRgb(Props);
    const Num = (K, D) => Number.isFinite(Number(Props[K])) ? Number(Props[K]) : D;

    Ctx.fillStyle = 'rgba(255,255,255,0.02)';
    Ctx.fillRect(0, 0, W, H);
    Ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    Ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const Y = (H * i) / 4;
        Ctx.beginPath();
        Ctx.moveTo(0, Y);
        Ctx.lineTo(W, Y);
        Ctx.stroke();
    }

    const PadX = 10;
    const PadY = 10;
    const PW = W - PadX * 2;
    const PH = H - PadY * 2;

    if (Type === 'pointlight') {
        const Int = Num('intensity', 14);
        const Dec = Num('decay', 2);
        const Reach = Num('distance', 25);
        const Samples = [1, 2, 5, 10];
        Ctx.strokeStyle = Rgb(Col, 0.95);
        Ctx.lineWidth = 2;
        Ctx.beginPath();
        for (let s = 0; s <= 40; s++) {
            const D = 0.5 + (s / 40) * Math.max(12, Reach);
            const Atten = Clamp(1 - Math.pow(D / Math.max(1, Reach), 4), 0, 1);
            const Lux = (Int / Math.pow(Math.max(0.5, D), Dec)) * Atten;
            const YNorm = Clamp(Lux / Math.max(0.1, Int), 0, 1);
            const X = PadX + (s / 40) * PW;
            const Y = PadY + (1 - Math.sqrt(YNorm)) * PH;
            if (s === 0) Ctx.moveTo(X, Y);
            else Ctx.lineTo(X, Y);
        }
        Ctx.stroke();
        Ctx.restore();
        return {
            Kind: 'Distance response',
            Rows: Samples.map(D => ({
                Label: `${D} m`,
                Value: `${((Int / Math.pow(D, Dec)) * Clamp(1 - Math.pow(D / Math.max(1, Reach), 4), 0, 1)).toFixed(2)} lx`
            }))
        };
    }

    if (Type === 'spotlight') {
        const AngleRad = (Num('angle', 30) * Math.PI) / 180;
        const Pen = Num('penumbra', 0.42);
        const Int = Num('intensity', 88);
        const HalfW = Math.tan(AngleRad) * 5;
        Ctx.strokeStyle = Rgb(Col, 0.96);
        Ctx.lineWidth = 2;
        Ctx.beginPath();
        for (let s = 0; s <= 60; s++) {
            const U = (s / 60) * 2 - 1;
            const AbsU = Math.abs(U);
            const Inner = 1 - Pen;
            const Falloff = AbsU <= Inner ? 1 : AbsU >= 1 ? 0 : Math.pow(1 - (AbsU - Inner) / Math.max(1e-4, 1 - Inner), 1.6);
            const X = PadX + (s / 60) * PW;
            const Y = PadY + (1 - Falloff) * PH;
            if (s === 0) Ctx.moveTo(X, Y);
            else Ctx.lineTo(X, Y);
        }
        Ctx.stroke();
        Ctx.restore();
        return {
            Kind: 'Beam section @ 5 m',
            Rows: [
                { Label: 'Core Ø', Value: `${(HalfW * (1 - Pen) * 2).toFixed(2)} m` },
                { Label: 'Full Ø', Value: `${(HalfW * 2).toFixed(2)} m` },
                { Label: '5m Axis', Value: `${(Int / 25).toFixed(2)} lx` }
            ]
        };
    }

    if (Type === 'ieslight') {
        const Mult = Num('multiplier', 1);
        const Lumens = Num('lumens', 1650);
        const DrawPlaneCurve = (AzDeg, Stroke, Fill) => {
            Ctx.beginPath();
            for (let s = 0; s <= 72; s++) {
                const Deg = -90 + (s / 72) * 180;
                const UseAz = Deg < 0 ? (AzDeg + 180) % 360 : AzDeg;
                const Val = EvaluateIesIntensity(Props, LoadedProfiles, UseAz, Math.abs(Deg));
                const X = PadX + (s / 72) * PW;
                const Y = PadY + (1 - Clamp(Val, 0, 1)) * PH;
                if (s === 0) Ctx.moveTo(X, Y);
                else Ctx.lineTo(X, Y);
            }
            Ctx.strokeStyle = Stroke;
            Ctx.lineWidth = Fill ? 2 : 1.3;
            if (!Fill) Ctx.setLineDash([4, 3]);
            Ctx.stroke();
            Ctx.setLineDash([]);
        };
        DrawPlaneCurve(90, 'rgba(130, 195, 255, 0.72)', false);
        DrawPlaneCurve(0, Rgb(Col, 0.96), true);
        Ctx.restore();
        const Peak0 = EvaluateIesIntensity(Props, LoadedProfiles, 0, 0) * Lumens * Mult * 0.32;
        return {
            Kind: 'Angular response (-90..+90 deg)',
            Rows: [
                { Label: 'Nadir 0°', Value: `${Peak0.toFixed(0)} cd` },
                { Label: 'C0 @ 30°', Value: `${(EvaluateIesIntensity(Props, LoadedProfiles, 0, 30) * 100).toFixed(0)} %` },
                { Label: 'C90 @ 30°', Value: `${(EvaluateIesIntensity(Props, LoadedProfiles, 90, 30) * 100).toFixed(0)} %` }
            ]
        };
    }

    // Area, Tube, LED, Strip cosine / linear / efficiency curve
    Ctx.strokeStyle = Rgb(Col, 0.95);
    Ctx.lineWidth = 2;
    Ctx.beginPath();
    for (let s = 0; s <= 48; s++) {
        const T = s / 48;
        const Rad = (T - 0.5) * Math.PI;
        const V = Type === 'arealight'
            ? Math.pow(Math.max(0, Math.cos(Rad)), Math.max(0.4, 180 / Math.max(15, Num('spread', 120))))
            : Math.cos(Rad * 0.85);
        const X = PadX + T * PW;
        const Y = PadY + (1 - Clamp(V, 0, 1)) * PH;
        if (s === 0) Ctx.moveTo(X, Y);
        else Ctx.lineTo(X, Y);
    }
    Ctx.stroke();
    Ctx.restore();

    if (Type === 'arealight') {
        const W = Num('width', 2);
        const H_ = Num('height', 1);
        const Area = Props.aperture === 'Disk' ? Math.PI * (W * 0.5) * (H_ * 0.5) : W * H_;
        const Exit = Num('lumens', 2400) / Math.max(0.01, Area);
        return {
            Kind: 'Aperture balance',
            Rows: [
                { Label: 'Area', Value: `${Area.toFixed(2)} m²` },
                { Label: 'Exitance', Value: `${Exit.toFixed(0)} lm/m²` }
            ]
        };
    }
    if (Type === 'tubelight') {
        const Len = Math.max(0.1, Num('length', 1.8));
        return {
            Kind: 'Linear output',
            Rows: [
                { Label: 'Density', Value: `${(Num('lumens', 1800) / Len).toFixed(0)} lm/m` },
                { Label: 'Reach', Value: `${Num('distance', 24).toFixed(0)} m` }
            ]
        };
    }
    if (Type === 'ledlight') {
        const Flux = Num('watts', 18) * Num('efficacy', 125) * Num('dimmer', 1);
        return {
            Kind: 'Conversion budget',
            Rows: [
                { Label: 'Flux', Value: `${Flux.toFixed(0)} lm` },
                { Label: 'Drive', Value: `${(Num('watts', 18) * Num('dimmer', 1)).toFixed(1)} W` }
            ]
        };
    }
    const Len = Num('length', 3.6);
    const Watts = Num('wattsPerMetre', 14.4) * Len * Num('dimmer', 0.9);
    const Amps = Watts / Math.max(5, Num('voltage', 24));
    return {
        Kind: 'Electrical budget',
        Rows: [
            { Label: 'Load', Value: `${Watts.toFixed(1)} W` },
            { Label: 'Current', Value: `${Amps.toFixed(2)} A` }
        ]
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                         DEDICATED GONIOMETRIC POLAR WEB (MODAL / INSPECTOR)
//------------------------------------------------------------------------------------------------------------------------

export function DrawIesPolarWebCanvas(Canvas, Props, LoadedProfiles)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 220;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;
    const CX = W * 0.5;
    const CY = H * 0.42;
    const RMax = Math.min(W * 0.36, H * 0.48);
    const Col = ResolveEmissionRgb(Props);

    Ctx.fillStyle = '#0c0d10';
    Ctx.fillRect(0, 0, W, H);
    Ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    Ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(R => {
        Ctx.beginPath();
        Ctx.arc(CX, CY, RMax * R, 0, Math.PI * 2);
        Ctx.stroke();
    });
    for (let deg = 0; deg < 360; deg += 30) {
        const A = (deg * Math.PI) / 180;
        Ctx.beginPath();
        Ctx.moveTo(CX, CY);
        Ctx.lineTo(CX + Math.sin(A) * RMax, CY + Math.cos(A) * RMax);
        Ctx.stroke();
    }

    const Plot = (Az, Color, Dashed) => {
        Ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
            const Signed = -Math.PI + (i / 180) * Math.PI * 2;
            const Polar = Math.abs(Signed) * (180 / Math.PI);
            const Plane = Signed < 0 ? (Az + 180) % 360 : Az;
            const V = EvaluateIesIntensity(Props, LoadedProfiles, Plane, Clamp(Polar, 0, 180));
            const X = CX + Math.sin(Signed) * RMax * V;
            const Y = CY + Math.cos(Signed) * RMax * V;
            if (i === 0) Ctx.moveTo(X, Y);
            else Ctx.lineTo(X, Y);
        }
        Ctx.closePath();
        Ctx.strokeStyle = Color;
        Ctx.lineWidth = Dashed ? 1.4 : 2.1;
        if (Dashed) Ctx.setLineDash([4, 3]);
        Ctx.stroke();
        Ctx.setLineDash([]);
    };

    Plot(90, 'rgba(130, 195, 255, 0.85)', true);
    Plot(0, Rgb(Col, 0.96), false);

    Ctx.fillStyle = 'rgba(239,244,207,0.72)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText('0 deg NADIR', CX - 28, CY + RMax + 14);
    Ctx.fillText('C0°', 12, 18);
    Ctx.fillStyle = 'rgba(130,195,255,0.85)';
    Ctx.fillText('C90°', 42, 18);
    Ctx.restore();
}

//------------------------------------------------------------------------------------------------------------------------
//                                  ENVIRONMENT LIGHT CANVASES (HDR DOME, MOON, STARS, FLARE, FOG)
//------------------------------------------------------------------------------------------------------------------------

export function DrawHdrDomeCanvas(Canvas, EnvDome, SunDir)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 160;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    const G = Ctx.createLinearGradient(0, 0, 0, H);
    G.addColorStop(0.0, EnvDome.ZenithColor);
    G.addColorStop(0.52, EnvDome.HorizonColor);
    G.addColorStop(0.54, EnvDome.GroundColor);
    G.addColorStop(1.0, '#101112');
    Ctx.fillStyle = G;
    Ctx.fillRect(0, 0, W, H);

    // Sun lobe hot spot in equirectangular projection
    const Az = Math.atan2(SunDir[0], -SunDir[2]);
    const El = Math.asin(Clamp(SunDir[1], -1, 1));
    const SX = (((Az / (Math.PI * 2) + EnvDome.RotationDeg / 360 + 1.5) % 1) * W);
    const SY = Clamp((0.5 - El / Math.PI) * H, 8, H * 0.52);
    const SunGlow = Ctx.createRadialGradient(SX, SY, 2, SX, SY, 56);
    SunGlow.addColorStop(0, 'rgba(255, 250, 228, 0.96)');
    SunGlow.addColorStop(0.35, 'rgba(255, 224, 156, 0.42)');
    SunGlow.addColorStop(1, 'rgba(0,0,0,0)');
    Ctx.fillStyle = SunGlow;
    Ctx.beginPath();
    Ctx.arc(SX, SY, 56, 0, Math.PI * 2);
    Ctx.fill();

    // Horizon line & calibration spheres (chrome mirror + matte Lambert)
    Ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    Ctx.beginPath();
    Ctx.moveTo(0, H * 0.53);
    Ctx.lineTo(W, H * 0.53);
    Ctx.stroke();

    const Probe = (X, Y, R, Mirror) => {
        const P = Ctx.createRadialGradient(X - R * 0.35, Y - R * 0.35, 2, X, Y, R);
        if (Mirror) {
            P.addColorStop(0, '#ffffff');
            P.addColorStop(0.45, EnvDome.HorizonColor);
            P.addColorStop(0.7, '#222428');
            P.addColorStop(1, '#0d0e11');
        } else {
            P.addColorStop(0, '#f2eee6');
            P.addColorStop(0.6, '#75757a');
            P.addColorStop(1, '#1e1f22');
        }
        Ctx.fillStyle = P;
        Ctx.beginPath();
        Ctx.arc(X, Y, R, 0, Math.PI * 2);
        Ctx.fill();
        Ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        Ctx.stroke();
    };
    Probe(W * 0.72, H * 0.76, 17, true);
    Probe(W * 0.86, H * 0.76, 17, false);

    Ctx.fillStyle = 'rgba(255,255,255,0.72)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`2:1 IBL EQUIRECTANGULAR · ${EnvDome.CubemapResolution} px · ROT ${Math.round(EnvDome.RotationDeg)}°`, 10, 16);
    Ctx.restore();
}

export function DrawMoonPreviewAndDialCanvas(Canvas, Moon)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;
    const Body = MoonCatalogue[Clamp(Moon.Slot | 0, 0, MoonCatalogue.length - 1)];
    const Metrics = SolveMoonMetrics(Moon);

    Ctx.fillStyle = '#090b10';
    Ctx.fillRect(0, 0, W, H);

    // Left: Lunar Phase Disc
    const DiscX = W * 0.28;
    const DiscY = H * 0.48;
    const R = Math.min(46, H * 0.34);
    const Halo = Ctx.createRadialGradient(DiscX, DiscY, R * 0.5, DiscX, DiscY, R * 1.9);
    Halo.addColorStop(0, `${Body.Tint}33`);
    Halo.addColorStop(1, 'rgba(0,0,0,0)');
    Ctx.fillStyle = Halo;
    Ctx.beginPath();
    Ctx.arc(DiscX, DiscY, R * 1.9, 0, Math.PI * 2);
    Ctx.fill();

    // Moon base disc + craters + phase terminator
    Ctx.save();
    Ctx.beginPath();
    Ctx.arc(DiscX, DiscY, R, 0, Math.PI * 2);
    Ctx.clip();
    Ctx.fillStyle = Body.Core;
    Ctx.fillRect(DiscX - R, DiscY - R, R * 2, R * 2);

    // Phase illumination half
    const Theta = Metrics.PhaseFrac * Math.PI * 2;
    const CosT = Math.cos(Theta);
    Ctx.fillStyle = Body.Tint;
    Ctx.beginPath();
    for (let y = -R; y <= R; y += 2) {
        const Edge = Math.sqrt(Math.max(0, R * R - y * y));
        const Term = Edge * CosT;
        const X0 = Theta <= Math.PI ? DiscX - Term : DiscX - Edge;
        const X1 = Theta <= Math.PI ? DiscX + Edge : DiscX + Term;
        if (X1 > X0) Ctx.rect(X0, DiscY + y, X1 - X0, 2.2);
    }
    Ctx.fill();

    // Subtle procedural crater rings
    Ctx.strokeStyle = Body.Cr;
    Ctx.globalAlpha = 0.32;
    [[-0.32, -0.22, 0.16], [0.22, -0.18, 0.22], [-0.14, 0.28, 0.2], [0.35, 0.24, 0.12]].forEach(([cx, cy, cr]) => {
        Ctx.beginPath();
        Ctx.arc(DiscX + cx * R, DiscY + cy * R, cr * R, 0, Math.PI * 2);
        Ctx.stroke();
    });
    Ctx.restore();

    // Right: Spherical Horizon Azimuth / Elevation Dial
    const DialX = W * 0.74;
    const DialY = H * 0.48;
    const DialR = Math.min(54, H * 0.38);
    Ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    Ctx.lineWidth = 1;
    Ctx.beginPath();
    Ctx.arc(DialX, DialY, DialR, 0, Math.PI * 2);
    Ctx.stroke();
    Ctx.beginPath();
    Ctx.arc(DialX, DialY, DialR * 0.5, 0, Math.PI * 2);
    Ctx.stroke();

    ['N', 'E', 'S', 'W'].forEach((Dir, idx) => {
        const A = (idx * Math.PI) / 2 - Math.PI / 2;
        Ctx.fillStyle = 'rgba(255,255,255,0.42)';
        Ctx.font = '500 9px "DM Sans", sans-serif';
        Ctx.fillText(Dir, DialX + Math.cos(A) * (DialR + 8) - 3, DialY + Math.sin(A) * (DialR + 8) + 3);
    });
    const AzR = ((Moon.AzimuthDeg - 90) * Math.PI) / 180;
    const Radial = (1 - Clamp(Moon.ElevationDeg, 0, 90) / 90) * DialR;
    const MX = DialX + Math.cos(AzR) * Radial;
    const MY = DialY + Math.sin(AzR) * Radial;
    Ctx.fillStyle = Body.Tint;
    Ctx.beginPath();
    Ctx.arc(MX, MY, 5.5, 0, Math.PI * 2);
    Ctx.fill();

    Ctx.fillStyle = 'rgba(255,255,255,0.58)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`${Body.Name} · ${Metrics.PhaseLabel} (${Metrics.IlluminationPct.toFixed(0)}%)`, 10, H - 8);
    Ctx.restore();
}

export function DrawStarsAndTwinkleCanvas(Canvas, Stars, TimeSec = 0)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    Ctx.fillStyle = '#07090e';
    Ctx.fillRect(0, 0, W, H);
    const StarW = W * 0.66;
    const PoleX = StarW * 0.5;
    const PoleY = H * 0.5;
    const RotRad = (Stars.CelestialRotationDeg * Math.PI) / 180;

    // 260 deterministic catalog stars filtered by LimitingMagnitude
    for (let i = 0; i < 260; i++) {
        const S1 = Math.sin(i * 12.9898) * 43758.5453;
        const S2 = Math.sin(i * 78.233) * 29831.231;
        const S3 = Math.sin(i * 39.425) * 19283.719;
        const F1 = S1 - Math.floor(S1);
        const F2 = S2 - Math.floor(S2);
        const F3 = S3 - Math.floor(S3);
        const Mag = F3 * 7.8;
        if (Mag > Stars.LimitingMagnitude) continue;
        const R = Math.sqrt(F1) * Math.min(StarW * 0.48, H * 0.48);
        const A = F2 * Math.PI * 2 + RotRad;
        const X = PoleX + Math.cos(A) * R;
        const Y = PoleY + Math.sin(A) * R;
        const Twinkle = Stars.TwinkleEnabled
            ? 1 - (Stars.TwinkleDepthPct / 100) * (0.5 + 0.5 * Math.sin(TimeSec * Stars.TwinkleRateHz * 6.28 + i))
            : 1;
        const Alpha = Clamp((1 - Mag / 8.5) * Stars.Brightness * Twinkle, 0.08, 1);
        const Kelvin = 3400 + ((i % 7) / 6) * 7000;
        const KCol = KelvinToRgb(Kelvin);
        Ctx.fillStyle = Rgb(KCol, Alpha);
        const Size = Math.max(0.7, (1.9 - Mag * 0.18) * Stars.PointSize);
        Ctx.beginPath();
        Ctx.arc(X, Y, Size, 0, Math.PI * 2);
        Ctx.fill();
    }

    // Right column: Twinkle waveform & pole compass
    const RX = W * 0.68;
    Ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    Ctx.strokeRect(RX, 12, W - RX - 10, H * 0.42);
    Ctx.strokeStyle = '#9ecfff';
    Ctx.lineWidth = 1.5;
    Ctx.beginPath();
    for (let s = 0; s <= 40; s++) {
        const T = s / 40;
        const Amp = Stars.TwinkleEnabled ? (Stars.TwinkleDepthPct / 100) * 0.42 : 0;
        const Y = 12 + H * 0.21 - Math.sin(T * Math.PI * 2 * Stars.TwinkleRateHz + TimeSec * 4) * (H * 0.18) * Amp;
        const X = RX + 4 + T * (W - RX - 18);
        if (s === 0) Ctx.moveTo(X, Y);
        else Ctx.lineTo(X, Y);
    }
    Ctx.stroke();

    Ctx.fillStyle = 'rgba(255,255,255,0.6)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`LIMIT ${Stars.LimitingMagnitude.toFixed(1)} mag · POLE ${Math.round(Stars.CelestialRotationDeg)}°`, 10, H - 8);
    Ctx.restore();
}

export function DrawLensFlareCanvas(Canvas, Flare)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    Ctx.fillStyle = '#07090d';
    Ctx.fillRect(0, 0, W, H);
    const SX = W * Flare.PreviewX;
    const SY = H * Flare.PreviewY;
    const CX = W * 0.5;
    const CY = H * 0.5;

    // Halo ring
    if (Flare.HaloBrightness > 0.01) {
        const HR = Flare.HaloRadius * Math.min(W, H) * 1.1;
        Ctx.strokeStyle = `rgba(180,220,255,${Clamp(Flare.HaloBrightness * 0.28, 0, 0.7)})`;
        Ctx.lineWidth = Math.max(2, Flare.HaloWidth * 180);
        Ctx.beginPath();
        Ctx.arc(CX, CY, HR, 0, Math.PI * 2);
        Ctx.stroke();
    }

    // Ghosts across optical axis
    const DX = CX - SX;
    const DY = CY - SY;
    for (let g = 1; g <= Flare.GhostCount; g++) {
        const Step = ((g / Flare.GhostCount) * 2 - 0.4) * Flare.GhostSpacing;
        const GX = SX + DX * Step;
        const GY = SY + DY * Step;
        const GR = 8 + (g % 3) * 6 * Flare.Spread;
        const Hue = 180 + g * 28 * Flare.Chromatic;
        Ctx.fillStyle = `hsla(${Hue}, 75%, 72%, ${Clamp(Flare.GhostBrightness * 0.35, 0.04, 0.55)})`;
        Ctx.beginPath();
        if (Flare.GhostShape === 'Round') {
            Ctx.arc(GX, GY, GR, 0, Math.PI * 2);
        } else {
            const Sides = Flare.GhostShape === 'Octagon' ? 8 : 6;
            for (let s = 0; s <= Sides; s++) {
                const A = (s / Sides) * Math.PI * 2;
                const PX = GX + Math.cos(A) * GR;
                const PY = GY + Math.sin(A) * GR;
                if (s === 0) Ctx.moveTo(PX, PY);
                else Ctx.lineTo(PX, PY);
            }
        }
        Ctx.fill();
    }

    // Anamorphic cyan bar
    if (Flare.Anamorphic) {
        const BarG = Ctx.createLinearGradient(0, SY, W, SY);
        BarG.addColorStop(0, 'rgba(90,175,255,0)');
        BarG.addColorStop(Flare.PreviewX, `rgba(140,210,255,${Clamp(Flare.Intensity * 0.65, 0, 0.9)})`);
        BarG.addColorStop(1, 'rgba(90,175,255,0)');
        Ctx.fillStyle = BarG;
        Ctx.fillRect(0, SY - 2.5, W, 5);
    }

    // Starburst rays
    if (Flare.Starburst) {
        const Pairs = Math.max(2, Flare.RayPairs | 0);
        const Rot = (Flare.RotationDeg * Math.PI) / 180;
        Ctx.strokeStyle = `rgba(255,244,210,${Clamp(Flare.Intensity * 0.55, 0.1, 0.85)})`;
        Ctx.lineWidth = 1.25;
        for (let r = 0; r < Pairs; r++) {
            const A = Rot + (r / Pairs) * Math.PI;
            const Len = 28 + (r % 2) * 16 * Flare.Spread;
            Ctx.beginPath();
            Ctx.moveTo(SX - Math.cos(A) * Len, SY - Math.sin(A) * Len);
            Ctx.lineTo(SX + Math.cos(A) * Len, SY + Math.sin(A) * Len);
            Ctx.stroke();
        }
    }

    // Primary glare core
    const Core = Ctx.createRadialGradient(SX, SY, 1, SX, SY, 24);
    Core.addColorStop(0, '#fff');
    Core.addColorStop(0.35, 'rgba(255,236,196,0.6)');
    Core.addColorStop(1, 'rgba(0,0,0,0)');
    Ctx.fillStyle = Core;
    Ctx.beginPath();
    Ctx.arc(SX, SY, 24, 0, Math.PI * 2);
    Ctx.fill();
    Ctx.restore();
}

export function DrawHeightFogBeamCanvas(Canvas, Fog)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    Ctx.fillStyle = '#0b0e13';
    Ctx.fillRect(0, 0, W, H);
    const HorizonY = H * 0.65;
    const FogGrad = Ctx.createLinearGradient(0, 0, 0, HorizonY);
    FogGrad.addColorStop(0, 'rgba(0,0,0,0)');
    FogGrad.addColorStop(1, Fog.Tint);
    Ctx.globalAlpha = Clamp(Fog.Density * 28, 0.15, 0.82);
    Ctx.fillStyle = FogGrad;
    Ctx.fillRect(0, 0, W, HorizonY);
    Ctx.globalAlpha = 1;

    // Volumetric scatter beam rays inside beam chamber
    for (let r = 0; r < 5; r++) {
        const StartX = W * (0.2 + r * 0.14);
        const RG = Ctx.createLinearGradient(StartX, 0, StartX + 60, HorizonY);
        RG.addColorStop(0, `rgba(255,244,210,${Clamp(Fog.SunScatter * 0.25, 0.04, 0.45)})`);
        RG.addColorStop(1, 'rgba(0,0,0,0)');
        Ctx.fillStyle = RG;
        Ctx.beginPath();
        Ctx.moveTo(StartX, 0);
        Ctx.lineTo(StartX + 26, 0);
        Ctx.lineTo(StartX + 94, HorizonY);
        Ctx.lineTo(StartX + 36, HorizonY);
        Ctx.closePath();
        Ctx.fill();
    }

    // Transmission curve bottom strip
    const Trans = Math.exp(-Fog.Density * Fog.ProbeDistanceM);
    Ctx.strokeStyle = '#d8e8ff';
    Ctx.lineWidth = 1.6;
    Ctx.beginPath();
    for (let s = 0; s <= 40; s++) {
        const D = (s / 40) * 1000;
        const T = Math.exp(-Fog.Density * D);
        const X = 10 + (s / 40) * (W - 20);
        const Y = H - 14 - T * (H * 0.25);
        if (s === 0) Ctx.moveTo(X, Y);
        else Ctx.lineTo(X, Y);
    }
    Ctx.stroke();

    Ctx.fillStyle = 'rgba(255,255,255,0.68)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`T(${Fog.ProbeDistanceM} m) = ${(Trans * 100).toFixed(1)}% · FALLOFF ${Fog.FalloffHeightM} m`, 10, 16);
    Ctx.restore();
}

export function DrawSunDiscChromaticityCanvas(Canvas, Sun)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;

    const ElNorm = Clamp((Sun.ElevationDeg + 8) / 70, 0, 1);
    const SkyGrad = Ctx.createLinearGradient(0, 0, 0, H);
    SkyGrad.addColorStop(0, ElNorm < 0.2 ? '#0b1020' : '#183254');
    SkyGrad.addColorStop(0.75, ElNorm < 0.25 ? '#4c2d2e' : '#537396');
    SkyGrad.addColorStop(1, '#121317');
    Ctx.fillStyle = SkyGrad;
    Ctx.fillRect(0, 0, W, H);

    const Col = Sun.ColorMode === 'RGB'
        ? [1, 3, 5].map(i => parseInt((Sun.TintHex || '#fff5e4').slice(i, i + 2), 16))
        : KelvinToRgb(Sun.TemperatureK || 5600);
    const CX = W * 0.5;
    const CY = H * (0.72 - ElNorm * 0.42);
    const DiscR = Clamp((Sun.DiameterDeg || 0.53) * 14, 8, 34);

    const Corona = Ctx.createRadialGradient(CX, CY, DiscR * 0.5, CX, CY, DiscR * 3.8);
    Corona.addColorStop(0, Rgb(Col, 0.96));
    Corona.addColorStop(0.28, Rgb(Col, 0.35));
    Corona.addColorStop(1, 'rgba(0,0,0,0)');
    Ctx.fillStyle = Corona;
    Ctx.beginPath();
    Ctx.arc(CX, CY, DiscR * 3.8, 0, Math.PI * 2);
    Ctx.fill();

    Ctx.fillStyle = '#fff';
    Ctx.beginPath();
    Ctx.arc(CX, CY, DiscR * 0.72, 0, Math.PI * 2);
    Ctx.fill();

    Ctx.fillStyle = 'rgba(255,255,255,0.72)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`SOLAR DISC ${Number(Sun.DiameterDeg).toFixed(2)}° · ${Sun.TemperatureK || 5600} K · ${Number(Sun.Intensity).toFixed(1)}x`, 10, H - 8);
    Ctx.restore();
}

export function DrawSolarArcCanvas(Canvas, Params)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;
    const Ephem = EvaluateSolarEphemeris(Params);

    Ctx.fillStyle = '#090b0f';
    Ctx.fillRect(0, 0, W, H);
    const HorizonY = H * 0.68;
    Ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    Ctx.setLineDash([4, 3]);
    Ctx.beginPath();
    Ctx.moveTo(10, HorizonY);
    Ctx.lineTo(W - 10, HorizonY);
    Ctx.stroke();
    Ctx.setLineDash([]);

    Ctx.strokeStyle = '#f3c46c';
    Ctx.lineWidth = 1.8;
    Ctx.beginPath();
    Ephem.DiurnalCurve.forEach((Pt, idx) => {
        const X = 12 + (Pt.Hour / 24) * (W - 24);
        const Y = HorizonY - (Pt.ElevationDeg / 90) * (H * 0.56);
        if (idx === 0) Ctx.moveTo(X, Y);
        else Ctx.lineTo(X, Y);
    });
    Ctx.stroke();

    const CurX = 12 + (Params.LocalHours / 24) * (W - 24);
    const CurY = HorizonY - (Ephem.ElevationDeg / 90) * (H * 0.56);
    Ctx.fillStyle = '#eff4cf';
    Ctx.beginPath();
    Ctx.arc(CurX, CurY, 5, 0, Math.PI * 2);
    Ctx.fill();

    Ctx.fillStyle = 'rgba(255,255,255,0.68)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`${Ephem.PhaseLabel} · Az ${Ephem.AzimuthDeg.toFixed(0)}° · AM ${Ephem.AirMass.toFixed(1)}`, 10, H - 8);
    Ctx.restore();
}

export function DrawAtmosphereScatteringCanvas(Canvas, AtmosInput)
{
    const Width = Canvas?.clientWidth || 320;
    const Height = Canvas?.clientHeight || 168;
    const Frame = FitCanvas(Canvas, Width, Height);
    if (!Frame) return;
    const { Ctx, W, H } = Frame;
    const Atmos = {
        ...CreateDefaultAtmosphereParameters(),
        RayleighMultiplier: AtmosInput.Rayleigh ?? 1,
        MieMultiplier: AtmosInput.Mie ?? 1,
        MiePhaseG: AtmosInput.MieAnisotropy ?? 0.78,
        OzoneMultiplier: AtmosInput.Ozone ?? 1.2
    };
    const ElRad = ((AtmosInput.ElevationDeg ?? 25) * Math.PI) / 180;
    const SunDir = [0, Math.sin(ElRad), -Math.cos(ElRad)];

    const Bands = 24;
    for (let b = 0; b < Bands; b++) {
        const Mu = 0.96 - (b / (Bands - 1)) * 1.1;
        const ViewDir = [0, Mu, -Math.sqrt(Math.max(0, 1 - Mu * Mu))];
        const Rad = EvaluateSkyRayRadiance(Atmos, ViewDir, SunDir, [1, 0.96, 0.9], 1.0);
        const Srgb = ToneMapReinhardSrgb(Rad);
        Ctx.fillStyle = `rgb(${Srgb[0]},${Srgb[1]},${Srgb[2]})`;
        const Y0 = (b / Bands) * H;
        Ctx.fillRect(0, Y0, W, H / Bands + 1);
    }

    Ctx.fillStyle = 'rgba(255,255,255,0.82)';
    Ctx.font = '500 10px "DM Sans", sans-serif';
    Ctx.fillText(`BRUNETON-HILLAIRE LUT · R ${Atmos.RayleighMultiplier.toFixed(2)}x · M ${Atmos.MieMultiplier.toFixed(2)}x · O3 ${Atmos.OzoneMultiplier.toFixed(2)}x`, 10, 16);
    Ctx.restore();
}
