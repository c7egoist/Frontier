//============================================================================================================================================
//                                                      CANDYVILLAGESEQUENCE.JS
//============================================================================================================================================
// 🍬 Candy Village · Sugar Siege ("candy") — Overhauled Real-Time 2.5D Refractive Fluid, Skinned Jelly Worms & Siege Gauntlet:
//    • High-Resolution 128 × 64 Refractive 2.5D Saint-Venant Shallow-Water Solver (49,152 live-streamed vertices, Transmission = 1.0):
//      - Low-dissipation gravity wave propagation + 3 continuous Soda-Waterfall plunge inflows + dynamic capillary liquid ripples!
//      - Strong hydrodynamic wading drag, Archimedes buoyancy & cross-current wave push — plus Fizz-Wash cleansing!
//    • 6 Continuous Skinned Refractive-Jelly Worms (7,920 live-streamed vertices, Transmission = 1.0):
//      - Seamless Bishop-frame ringed annelid tubes with two-tone sour gummy coloration, peristaltic squeeze waves & impact jelly wobble!
//    • 5 Heavy Torsion Onager Catapults with True Physically-Coupled Parabolic Projectile Arcs:
//      - Flaming Gummy Boulder rides visibly inside the cupped spoon during wind-up & violent 80° whip, detaching from exact spoon
//        world coordinates into an exact 2nd-order Verlet parabola P(t) = P_0 + V_0 t - ½ g t² onto glowing road target rings!
//    • 6 Recoiling Old-School Naval Candy Cannons + 5 Active Candy Gauntlet Obstacles:
//      1. Swinging Jawbreaker Wrecking Pendulums   2. Slamming Peppermint Crusher Hammers   3. Rolling Giant Peppermint Pinwheels
//      4. Stretchy Viscoelastic Saltwater-Taffy Snares   5. Bubbling & Erupting Cola-Mentos Vertical Geysers!

import { OccupantRole, VertexStride } from "./FacetStructure.js";
import { CourseMaterial } from "./MaterialSpecification.js";
import {
    ClampScalar,
    ConstructAxisQuaternion,
    ConstructRigidTransform,
    MultiplyQuaternion,
    RotateVector
} from "./TransformProjection.js";
import { LightType } from "./LightingSystem.js";
import {
    CandyCannonSites,
    CandyCatapultSites,
    CandyCrusherSites,
    CandyGeyserSites,
    CandyGoalX,
    CandyGummyBumpers,
    CandyPendulumSites,
    CandyPinwheelLanes,
    CandySpawn,
    CandyTaffyStrips,
    CandyWaferBridges,
    CandyWaterfallSites,
    CandyWaterGridSpec,
    CandyWormMeshSpec,
    CandyWormPatrols,
    QueryCandyTerrainHeight
} from "./CandyVillageStructure.js";

export const CandyWaterVertexCapacity = CandyWaterGridSpec.NX * CandyWaterGridSpec.NY * 6; // 49,152 vertices
const CatapultGravity  = 15.5;                   // [m/s²] exact projectile gravity shared by solver & integrator
const CatapultPivotOff = [1.05, 0.0, 2.38];      // [m] local torsion axle pivot in CandyCatapultBase
const CatapultBowlOff  = [-4.35, 0.0, 0.54];     // [m] local boulder center inside cupped spoon of CandyCatapultArm

function AngleDelta(From, To)
{
    let D = (To - From) % (Math.PI * 2.0);
    if (D >  Math.PI) D -= Math.PI * 2.0;
    if (D < -Math.PI) D += Math.PI * 2.0;
    return D;
}

function SmoothStep01(T)
{
    const C = Math.max(0.0, Math.min(1.0, T));
    return C * C * (3.0 - 2.0 * C);
}

//------------------------------------------------------------------------------------------------------------------------
//        HIGH-RESOLUTION 128 × 64 REFRACTIVE 2.5D SAINT-VENANT SHALLOW-WATER SOLVER + CAPILLARY LIQUID RIPPLES
//------------------------------------------------------------------------------------------------------------------------

export class CandyWaterSolver
{
    constructor()
    {
        this.NX   = CandyWaterGridSpec.NX;
        this.NY   = CandyWaterGridSpec.NY;
        this.XMin = CandyWaterGridSpec.XMin;
        this.XMax = CandyWaterGridSpec.XMax;
        this.YMin = CandyWaterGridSpec.YMin;
        this.YMax = CandyWaterGridSpec.YMax;
        this.DX   = (this.XMax - this.XMin) / this.NX;
        this.DY   = (this.YMax - this.YMin) / this.NY;
        this.RestSurfaceZ = CandyWaterGridSpec.RestSurfaceZ;

        const CCols = (this.NX + 1) * (this.NY + 1);
        this.Cols   = CCols;
        this.Stride = this.NY + 1;

        this.Bed      = new Float32Array(CCols);
        this.RestH    = new Float32Array(CCols);
        this.Depth    = new Float32Array(CCols);
        this.NextH    = new Float32Array(CCols);
        this.VelU     = new Float32Array(CCols);
        this.VelV     = new Float32Array(CCols);
        this.Foam     = new Float32Array(CCols);
        this.SurfaceZ = new Float32Array(CCols);
        this.NormX    = new Float32Array(CCols);
        this.NormY    = new Float32Array(CCols);
        this.NormZ    = new Float32Array(CCols);

        this.VertexCount = CandyWaterVertexCapacity;
        const RawBytes   = new ArrayBuffer(this.VertexCount * VertexStride);
        this.VertexF32   = new Float32Array(RawBytes);
        this.VertexU32   = new Uint32Array(RawBytes);

        this.SimClock   = 0.0;
        this.WaveEnergy = 0.0;
        this.Reset();
    }

    Reset()
    {
        this.SimClock = 0.0;
        for (let IX = 0; IX <= this.NX; ++IX)
        {
            const X = this.XMin + IX * this.DX;
            for (let IY = 0; IY <= this.NY; ++IY)
            {
                const Y   = this.YMin + IY * this.DY;
                const Idx = IX * this.Stride + IY;
                const B   = QueryCandyTerrainHeight(X, Y);
                const H0  = Math.max(0.0, this.RestSurfaceZ - B);
                this.Bed[Idx]   = B;
                this.RestH[Idx] = H0;
                // Seed live gentle standing slosh so water is visibly undulating from frame 0!
                const InitWave  = H0 > 0.15 ? (0.06 * Math.sin(X * 0.14 + Y * 0.18)) : 0.0;
                this.Depth[Idx] = Math.max(0.0, H0 + InitWave);
                this.NextH[Idx] = this.Depth[Idx];
                this.VelU[Idx]  = 0.0;
                this.VelV[Idx]  = H0 > 0.25 ? -0.35 : 0.0;
                this.Foam[Idx]  = 0.0;
            }
        }
        this.RebuildMeshVertices();
    }

    InjectDisturbance(WorldX, WorldY, Radius, DepthDelta, ImpulseU = 0.0, ImpulseV = 0.0, FoamBoost = 0.65)
    {
        if (WorldX < this.XMin - Radius || WorldX > this.XMax + Radius ||
            WorldY < this.YMin - Radius || WorldY > this.YMax + Radius)
            return false;

        const IX0 = Math.max(1, Math.floor((WorldX - Radius - this.XMin) / this.DX));
        const IX1 = Math.min(this.NX - 1, Math.ceil((WorldX + Radius - this.XMin) / this.DX));
        const IY0 = Math.max(1, Math.floor((WorldY - Radius - this.YMin) / this.DY));
        const IY1 = Math.min(this.NY - 1, Math.ceil((WorldY + Radius - this.YMin) / this.DY));

        let TouchedWet = false;
        for (let IX = IX0; IX <= IX1; ++IX)
        {
            const X = this.XMin + IX * this.DX;
            for (let IY = IY0; IY <= IY1; ++IY)
            {
                const Y = this.YMin + IY * this.DY;
                const R = Math.hypot(X - WorldX, Y - WorldY);
                if (R >= Radius)
                    continue;
                const Idx = IX * this.Stride + IY;
                if (this.RestH[Idx] <= 0.01 && this.Depth[Idx] <= 0.01)
                    continue;
                TouchedWet = true;
                const W = 0.5 * (1.0 + Math.cos(Math.PI * R / Radius));
                const RadDirX = R > 0.12 ? (X - WorldX) / R : 0.0;
                const RadDirY = R > 0.12 ? (Y - WorldY) / R : 0.0;
                const RingWave = DepthDelta * Math.cos(Math.PI * 0.90 * R / Radius);
                this.Depth[Idx] = ClampScalar(this.Depth[Idx] + RingWave * W, 0.0, 3.10);
                this.VelU[Idx]  = ClampScalar(this.VelU[Idx] + (ImpulseU + RadDirX * Math.abs(DepthDelta) * 6.2) * W, -14.0, 14.0);
                this.VelV[Idx]  = ClampScalar(this.VelV[Idx] + (ImpulseV + RadDirY * Math.abs(DepthDelta) * 6.2) * W, -14.0, 14.0);
                this.Foam[Idx]  = Math.min(1.0, this.Foam[Idx] + FoamBoost * W);
            }
        }
        return TouchedWet;
    }

    TriggerTidalSurge(FromNorth = true)
    {
        const TargetIY = FromNorth ? (this.NY - 4) : 4;
        const FlowSign = FromNorth ? -1.0 : 1.0;
        for (let IX = 2; IX < this.NX - 1; ++IX)
        {
            for (let Off = -2; Off <= 2; ++Off)
            {
                const IY  = TargetIY + Off;
                const Idx = IX * this.Stride + IY;
                if (this.RestH[Idx] > 0.12)
                {
                    this.Depth[Idx] = Math.min(2.85, this.Depth[Idx] + 0.92);
                    this.VelV[Idx]  = FlowSign * 7.8;
                    this.Foam[Idx]  = 1.0;
                }
            }
        }
    }

    Sample(X, Y)
    {
        if (X <= this.XMin || X >= this.XMax || Y <= this.YMin || Y >= this.YMax)
            return { Depth: 0.0, SurfaceZ: -99.0, U: 0.0, V: 0.0 };

        const FX = (X - this.XMin) / this.DX;
        const FY = (Y - this.YMin) / this.DY;
        const IX = Math.min(this.NX - 1, Math.max(0, Math.floor(FX)));
        const IY = Math.min(this.NY - 1, Math.max(0, Math.floor(FY)));
        const TX = FX - IX, TY = FY - IY;

        const I00 = IX * this.Stride + IY;
        const I10 = (IX + 1) * this.Stride + IY;
        const I01 = I00 + 1;
        const I11 = I10 + 1;

        const Bilerp = (Arr) =>
            (Arr[I00] * (1 - TX) + Arr[I10] * TX) * (1 - TY) +
            (Arr[I01] * (1 - TX) + Arr[I11] * TX) * TY;

        const D = Bilerp(this.Depth);
        const B = Bilerp(this.Bed);
        return { Depth: D, SurfaceZ: B + D, U: Bilerp(this.VelU), V: Bilerp(this.VelV) };
    }

    Advance(FrameStep)
    {
        const ClampedStep = Math.min(FrameStep, 0.04);
        this.SimClock += ClampedStep;

        // ① Continuous Waterfall Plunge-Pool Inflows keep rolling wave trains & cross-currents alive across all 3 basins!
        for (let W = 0; W < CandyWaterfallSites.length; ++W)
        {
            const WF    = CandyWaterfallSites[W];
            const Pulse = 0.10 * Math.sin(this.SimClock * 5.8 + W * 2.1);
            this.InjectDisturbance(WF.PlungePos[0], WF.PlungePos[1], 4.6, Pulse, 0.0, WF.FlowV * ClampedStep * 5.5, 0.55 * ClampedStep * 6.0);
        }

        const SubSteps = 4;
        const Dt       = ClampedStep / SubSteps;
        const G        = 9.81;
        const InvDX    = 1.0 / this.DX;
        const InvDY    = 1.0 / this.DY;
        const Damping  = Math.exp(-0.18 * Dt); // Low dissipation -> crisp long-range propagating waves!
        const S        = this.Stride;

        for (let Sub = 0; Sub < SubSteps; ++Sub)
        {
            for (let IX = 1; IX < this.NX; ++IX)
            {
                const Row = IX * S;
                for (let IY = 1; IY < this.NY; ++IY)
                {
                    const Idx = Row + IY;
                    const H   = this.Depth[Idx];
                    if (H <= 0.012)
                    {
                        this.VelU[Idx] = 0.0;
                        this.VelV[Idx] = 0.0;
                        continue;
                    }
                    const EtaC = this.Bed[Idx] + H;
                    const HR   = this.Depth[Idx + S], HL = this.Depth[Idx - S];
                    const HU   = this.Depth[Idx + 1], HD = this.Depth[Idx - 1];

                    const DEtaDX = (HR > 0.012 && HL > 0.012)
                        ? ((this.Bed[Idx + S] + HR) - (this.Bed[Idx - S] + HL)) * 0.5 * InvDX
                        : (HR > 0.012 ? ((this.Bed[Idx + S] + HR) - EtaC) * InvDX : (HL > 0.012 ? (EtaC - (this.Bed[Idx - S] + HL)) * InvDX : 0.0));
                    const DEtaDY = (HU > 0.012 && HD > 0.012)
                        ? ((this.Bed[Idx + 1] + HU) - (this.Bed[Idx - 1] + HD)) * 0.5 * InvDY
                        : (HU > 0.012 ? ((this.Bed[Idx + 1] + HU) - EtaC) * InvDY : (HD > 0.012 ? (EtaC - (this.Bed[Idx - 1] + HD)) * InvDY : 0.0));

                    this.VelU[Idx] = ClampScalar((this.VelU[Idx] - G * DEtaDX * Dt) * Damping, -14.0, 14.0);
                    this.VelV[Idx] = ClampScalar((this.VelV[Idx] - G * DEtaDY * Dt) * Damping, -14.0, 14.0);
                }
            }

            for (let IX = 1; IX < this.NX; ++IX)
            {
                const Row = IX * S;
                for (let IY = 1; IY < this.NY; ++IY)
                {
                    const Idx = Row + IY;
                    if (this.RestH[Idx] <= 0.0 && this.Depth[Idx] <= 0.005 &&
                        this.Depth[Idx + S] <= 0.02 && this.Depth[Idx - S] <= 0.02 &&
                        this.Depth[Idx + 1] <= 0.02 && this.Depth[Idx - 1] <= 0.02)
                    {
                        this.NextH[Idx] = 0.0;
                        continue;
                    }

                    const UEast  = 0.5 * (this.VelU[Idx] + this.VelU[Idx + S]);
                    const UWest  = 0.5 * (this.VelU[Idx - S] + this.VelU[Idx]);
                    const VNorth = 0.5 * (this.VelV[Idx] + this.VelV[Idx + 1]);
                    const VSouth = 0.5 * (this.VelV[Idx - 1] + this.VelV[Idx]);

                    const FluxEast  = UEast  * (UEast  >= 0.0 ? this.Depth[Idx]     : this.Depth[Idx + S]);
                    const FluxWest  = UWest  * (UWest  >= 0.0 ? this.Depth[Idx - S] : this.Depth[Idx]);
                    const FluxNorth = VNorth * (VNorth >= 0.0 ? this.Depth[Idx]     : this.Depth[Idx + 1]);
                    const FluxSouth = VSouth * (VSouth >= 0.0 ? this.Depth[Idx - 1] : this.Depth[Idx]);

                    const Div = (FluxEast - FluxWest) * InvDX + (FluxNorth - FluxSouth) * InvDY;
                    let NewH  = ClampScalar(this.Depth[Idx] - Dt * Div, 0.0, 3.10);

                    if (IY <= 2 || IY >= this.NY - 2)
                        NewH += (this.RestH[Idx] - NewH) * (3.5 * Dt);
                    else if (this.RestH[Idx] > 0.05)
                        NewH += (this.RestH[Idx] - NewH) * (0.10 * Dt);

                    this.NextH[Idx] = NewH;
                }
            }
            this.Depth.set(this.NextH);
        }

        // ② Superpose Multi-Octave Travelling Capillary Liquid Wavelets onto 2.5D SWE Elevation -> Crisp Shimmering Normals!
        let TotalEnergy = 0.0;
        const FoamDecay = Math.exp(-1.75 * ClampedStep);
        const T = this.SimClock;
        for (let IX = 0; IX <= this.NX; ++IX)
        {
            const X   = this.XMin + IX * this.DX;
            const Row = IX * S;
            for (let IY = 0; IY <= this.NY; ++IY)
            {
                const Y   = this.YMin + IY * this.DY;
                const Idx = Row + IY;
                const H   = this.Depth[Idx];
                const Spd = Math.hypot(this.VelU[Idx], this.VelV[Idx]);
                TotalEnergy += Spd * H;
                this.Foam[Idx] = Math.min(1.0, this.Foam[Idx] * FoamDecay + (Spd > 3.0 ? (Spd - 3.0) * ClampedStep * 1.1 : 0.0));

                if (H > 0.022)
                {
                    const CapMask = SmoothStep01((H - 0.02) / 0.22);
                    const Capillary = CapMask * (
                        0.042 * Math.sin(X * 0.62 + Y * 0.48 - T * 3.4) +
                        0.028 * Math.cos(X * 0.45 - Y * 0.82 + T * 2.7) +
                        0.018 * Math.sin(X * 1.15 + Y * 1.05 + T * 4.6)
                    );
                    this.SurfaceZ[Idx] = this.Bed[Idx] + H + Capillary;
                }
                else
                {
                    this.SurfaceZ[Idx] = this.Bed[Idx] - 0.14;
                }
            }
        }
        this.WaveEnergy = TotalEnergy;

        for (let IX = 0; IX <= this.NX; ++IX)
        {
            const IX0 = Math.max(0, IX - 1), IX1 = Math.min(this.NX, IX + 1);
            const SpanX = (IX1 - IX0) * this.DX || 1.0;
            for (let IY = 0; IY <= this.NY; ++IY)
            {
                const IY0 = Math.max(0, IY - 1), IY1 = Math.min(this.NY, IY + 1);
                const SpanY = (IY1 - IY0) * this.DY || 1.0;
                const Idx   = IX * S + IY;
                const DZDX  = (this.SurfaceZ[IX1 * S + IY] - this.SurfaceZ[IX0 * S + IY]) / SpanX;
                const DZDY  = (this.SurfaceZ[IX * S + IY1] - this.SurfaceZ[IX * S + IY0]) / SpanY;
                const InvL  = 1.0 / Math.hypot(DZDX, DZDY, 1.0);
                this.NormX[Idx] = -DZDX * InvL;
                this.NormY[Idx] = -DZDY * InvL;
                this.NormZ[Idx] =  InvL;
            }
        }

        this.RebuildMeshVertices();
    }

    RebuildMeshVertices()
    {
        const F32 = this.VertexF32;
        const U32 = this.VertexU32;
        const S   = this.Stride;
        let VCursor = 0;

        const WriteVert = (X, Y, Idx, Mat) =>
        {
            const Off = VCursor * 8;
            F32[Off + 0] = X;
            F32[Off + 1] = Y;
            F32[Off + 2] = this.SurfaceZ[Idx];
            U32[Off + 3] = Mat;
            F32[Off + 4] = this.NormX[Idx];
            F32[Off + 5] = this.NormY[Idx];
            F32[Off + 6] = this.NormZ[Idx];
            U32[Off + 7] = 0;
            VCursor++;
        };

        for (let IX = 0; IX < this.NX; ++IX)
        {
            const X0 = this.XMin + IX * this.DX, X1 = X0 + this.DX;
            const R0 = IX * S, R1 = (IX + 1) * S;
            for (let IY = 0; IY < this.NY; ++IY)
            {
                const Y0  = this.YMin + IY * this.DY, Y1 = Y0 + this.DY;
                const I00 = R0 + IY, I10 = R1 + IY, I11 = R1 + IY + 1, I01 = R0 + IY + 1;

                const AvgH    = 0.25 * (this.Depth[I00] + this.Depth[I10] + this.Depth[I11] + this.Depth[I01]);
                const AvgFoam = 0.25 * (this.Foam[I00]  + this.Foam[I10]  + this.Foam[I11]  + this.Foam[I01]);
                const IsCaramelCanal = (X0 > 8.0 && X0 < 56.0);

                // Depth-graded refractive liquid: frothy whitecap peaks -> aquamarine crystal shallows -> deep sapphire soda!
                let Mat = CourseMaterial.BerrySodaWater;
                if (AvgFoam > 0.68)
                    Mat = CourseMaterial.FrostingCream;
                else if (IsCaramelCanal && AvgH > 0.26)
                    Mat = CourseMaterial.CaramelSyrup;
                else if (AvgH < 0.36)
                    Mat = CourseMaterial.WaterShallowCrystal;

                WriteVert(X0, Y0, I00, Mat);
                WriteVert(X1, Y0, I10, Mat);
                WriteVert(X1, Y1, I11, Mat);

                WriteVert(X0, Y0, I00, Mat);
                WriteVert(X1, Y1, I11, Mat);
                WriteVert(X0, Y1, I01, Mat);
            }
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//      CONTINUOUS SKINNED REFRACTIVE-JELLY WORM MESH BUILDER (RINGED ANNELID TUBES + PERISTALTIC WOBBLE!)
//------------------------------------------------------------------------------------------------------------------------

export class CandyWormSkinBuilder
{
    constructor()
    {
        this.WormCount   = CandyWormMeshSpec.WormCount;
        this.Rings       = CandyWormMeshSpec.RingsPerWorm;
        this.Sides       = CandyWormMeshSpec.RadialSides;
        this.VertexCount = this.WormCount * ((this.Rings - 1) * this.Sides * 6 + this.Sides * 6);
        const RawBytes   = new ArrayBuffer(this.VertexCount * VertexStride);
        this.VertexF32   = new Float32Array(RawBytes);
        this.VertexU32   = new Uint32Array(RawBytes);
    }

    Build(Worms, Clock)
    {
        const F32 = this.VertexF32;
        const U32 = this.VertexU32;
        const RCount = this.Rings;
        const SCount = this.Sides;
        let VCursor  = 0;

        const EmitVert = (P, N, Mat) =>
        {
            const Off = VCursor * 8;
            F32[Off + 0] = P[0]; F32[Off + 1] = P[1]; F32[Off + 2] = P[2];
            U32[Off + 3] = Mat;
            F32[Off + 4] = N[0]; F32[Off + 5] = N[1]; F32[Off + 6] = N[2];
            U32[Off + 7] = 0;
            VCursor++;
        };

        for (let WI = 0; WI < this.WormCount; ++WI)
        {
            const Worm   = Worms[WI];
            const Spine  = Worm.Spine;
            const BaseR  = Worm.Spec.Radius;
            const RingPts   = new Array(RCount);
            const RingNorms = new Array(RCount);

            for (let RI = 0; RI < RCount; ++RI)
            {
                const U   = RI / (RCount - 1); // 0 = oral head tip -> 1 = tapered tail tip
                const Pos = Spine[RI];
                const PPrev = Spine[Math.max(0, RI - 1)];
                const PNext = Spine[Math.min(RCount - 1, RI + 1)];
                let TX = PNext[0] - PPrev[0], TY = PNext[1] - PPrev[1], TZ = PNext[2] - PPrev[2];
                const TL = Math.hypot(TX, TY, TZ) || 1.0;
                TX /= TL; TY /= TL; TZ /= TL;

                // Orthonormal Bishop/Up frame (N1 = Side, N2 = Up)
                let N1X = -TY, N1Y = TX, N1Z = 0.0;
                const N1L = Math.hypot(N1X, N1Y, N1Z) || 1.0;
                N1X /= N1L; N1Y /= N1L;
                const N2X = TY * N1Z - TZ * N1Y;
                const N2Y = TZ * N1X - TX * N1Z;
                const N2Z = TX * N1Y - TY * N1X;

                // Realistic segmented gummy-worm profile: rounded head + ribbed annelid rings + clitellum saddle + peristalsis + jelly jiggle!
                const EndTaper    = Math.pow(Math.sin(Math.PI * ClampScalar(U * 0.94 + 0.03, 0.02, 0.98)), 0.42);
                const AnnelidRibs = 1.0 + 0.13 * Math.sin(U * 15.0 * Math.PI * 2.0);
                const Clitellum   = (U > 0.22 && U < 0.34) ? 1.14 : 1.0;
                const Peristalsis = 1.0 + 0.16 * Math.sin(U * 7.5 - Worm.Phase * 4.2);
                const JellyWobble = 1.0 + Worm.Jiggle * Math.sin(Clock * 38.0 + U * 16.0);
                const Rad         = Math.max(0.14, BaseR * EndTaper * AnnelidRibs * Clitellum * Peristalsis * JellyWobble);

                const Pts = new Array(SCount);
                const Nms = new Array(SCount);
                for (let SI = 0; SI < SCount; ++SI)
                {
                    const Ang = (SI / SCount) * Math.PI * 2.0;
                    const CA  = Math.cos(Ang), SA = Math.sin(Ang);
                    // Slightly flattened ventral belly (0.86 vertical aspect) so it hugs terrain like a real heavy jelly worm!
                    const NX  = CA * N1X + SA * N2X;
                    const NY  = CA * N1Y + SA * N2Y;
                    const NZ  = CA * N1Z + SA * N2Z;
                    Nms[SI]   = [NX, NY, NZ];
                    Pts[SI]   = [Pos[0] + NX * Rad, Pos[1] + NY * Rad, Pos[2] + NZ * Rad * 0.86];
                }
                RingPts[RI]   = Pts;
                RingNorms[RI] = Nms;
            }

            // Head Cap (RI = 0)
            const HeadTip = Spine[0];
            const HNext   = Spine[1];
            const HeadN   = Normalize3([HeadTip[0] - HNext[0], HeadTip[1] - HNext[1], HeadTip[2] - HNext[2]]);
            for (let SI = 0; SI < SCount; ++SI)
            {
                const SJ = (SI + 1) % SCount;
                EmitVert(HeadTip,       HeadN,             Worm.Spec.MatA);
                EmitVert(RingPts[0][SJ], RingNorms[0][SJ], Worm.Spec.MatA);
                EmitVert(RingPts[0][SI], RingNorms[0][SI], Worm.Spec.MatA);
            }

            // Seamless Skinned Tubular Body Bands (classic two-tone sour gummy worm transition at U = 0.5!)
            for (let RI = 0; RI < RCount - 1; ++RI)
            {
                const U   = (RI + 0.5) / (RCount - 1);
                const Mat = (U > 0.24 && U < 0.33)
                    ? CourseMaterial.GummyOrange
                    : (U < 0.52 ? Worm.Spec.MatA : Worm.Spec.MatB);

                for (let SI = 0; SI < SCount; ++SI)
                {
                    const SJ = (SI + 1) % SCount;
                    EmitVert(RingPts[RI][SI],     RingNorms[RI][SI],     Mat);
                    EmitVert(RingPts[RI][SJ],     RingNorms[RI][SJ],     Mat);
                    EmitVert(RingPts[RI + 1][SJ], RingNorms[RI + 1][SJ], Mat);

                    EmitVert(RingPts[RI][SI],     RingNorms[RI][SI],     Mat);
                    EmitVert(RingPts[RI + 1][SJ], RingNorms[RI + 1][SJ], Mat);
                    EmitVert(RingPts[RI + 1][SI], RingNorms[RI + 1][SI], Mat);
                }
            }

            // Tail Cap (RI = RCount - 1)
            const TailTip = Spine[RCount - 1];
            const TPrev   = Spine[RCount - 2];
            const TailN   = Normalize3([TailTip[0] - TPrev[0], TailTip[1] - TPrev[1], TailTip[2] - TPrev[2]]);
            const Last    = RCount - 1;
            for (let SI = 0; SI < SCount; ++SI)
            {
                const SJ = (SI + 1) % SCount;
                EmitVert(TailTip,           TailN,                Worm.Spec.MatB);
                EmitVert(RingPts[Last][SI], RingNorms[Last][SI],  Worm.Spec.MatB);
                EmitVert(RingPts[Last][SJ], RingNorms[Last][SJ],  Worm.Spec.MatB);
            }
        }
    }
}

function Normalize3(V)
{
    const L = Math.hypot(V[0], V[1], V[2]) || 1.0;
    return [V[0] / L, V[1] / L, V[2] / L];
}

//------------------------------------------------------------------------------------------------------------------------
//                                            CANDY VILLAGE SEQUENCE
//------------------------------------------------------------------------------------------------------------------------

export class CandyVillageSequence
{
    constructor(Host)
    {
        this.Host          = Host;
        this.Scene         = Host.Scene;
        this.Enabled       = (Host.LevelKey === "candy") && Boolean(this.Scene?.CandyBlock);

        this.Clock         = 0.0;
        this.RunTimer      = 0.0;
        this.BestRunSec    = null;
        this.Finished      = false;
        this.CandyCoatHp   = 100.0;
        this.StickyTimer   = 0.0;
        this.InTaffySnare  = false;
        this.WaterDepthNow = 0.0;
        this.SurgeTimer    = 6.0;
        this.SplashTimer   = 0.0;
        this.BannerMessage = "";
        this.BannerTimer   = 0.0;

        this.Water         = this.Enabled ? new CandyWaterSolver()     : null;
        this.WormSkinner   = this.Enabled ? new CandyWormSkinBuilder() : null;
        this.Worms         = [];
        this.Catapults     = [];
        this.Cannons       = [];
        this.FlamingBalls  = [];
        this.Jawbreakers   = [];
        this.StickyPuddles = [];
        this.Pendulums     = [];
        this.Crushers      = [];
        this.Pinwheels     = [];
        this.Geysers       = [];

        this.Stats = {
            WormBoings:      0,
            GummyBumperHits: 0,
            CatapultShots:   0,
            CannonShots:     0,
            PuddlesCreated:  0,
            SurgesTriggered: 0,
            FizzWashes:      0,
            PendulumHits:    0,
            CrusherSlams:    0,
            PinwheelHits:    0,
            TaffySnags:      0,
            GeyserLaunches:  0,
            Finishes:        0
        };

        if (this.Enabled)
        {
            this.InitializeVillage();
            this.MountQuickControls();
            this.BannerMessage = "🍬 SUGAR SIEGE — DODGE CRUSHERS, JAWBREAKER PENDULUMS, PARABOLIC CATAPULTS & JELLY WORMS!";
            this.BannerTimer   = 5.2;
        }
    }

    InitializeVillage()
    {
        this.Water.Reset();

        // ① 6 Continuous Skinned Refractive-Jelly Worms!
        const RCount = CandyWormMeshSpec.RingsPerWorm;
        this.Worms = CandyWormPatrols.map((Spec, WI) => ({
            Index:  WI,
            Spec,
            Phase:  Spec.Phase,
            Jiggle: 0.0,
            WasSubmerged: false,
            Spine:  Array.from({ length: RCount }, () => [Spec.Center[0], Spec.Center[1], 2.0])
        }));

        const Block = this.Scene.CandyBlock;
        this.FlamingBalls = Array.from({ length: Block.FlamingBalls.length }, () => ({
            Active:     false,
            State:      "idle", // "idle" | "in_spoon" | "ballistic"
            OwnerCat:   -1,
            Pos:        [0, 0, -200],
            Vel:        [0, 0, 0],
            TargetPos:  [0, 0, 0],
            FlightTime: 0.0,
            Elapsed:    0.0,
            Bounces:    0,
            Spin:       0.0
        }));

        // ② 5 Heavy Torsion Onager Catapults (4-phase coupled spoon -> exact Verlet parabola!)
        this.Catapults = CandyCatapultSites.map((Site, I) =>
        {
            const GZ = QueryCandyTerrainHeight(Site.Pos[0], Site.Pos[1]);
            return {
                Index:      I,
                Pos:        [Site.Pos[0], Site.Pos[1], GZ],
                Yaw:        Site.Yaw,
                ArmPitch:   0.35,       // winds down to -0.22 rad -> whips up to +1.14 rad!
                State:      "cocking",  // "cocking" | "aiming" | "whipping" | "cooldown"
                Timer:      0.35 * I,
                LoadedBall: -1,
                TargetPos:  [Site.Pos[0] - 25.0, 0.0, 2.2],
                ShowRing:   false
            };
        });

        // ③ 6 Wheeled Old-School Candy Cannons
        this.Cannons = CandyCannonSites.map((Site, I) => ({
            Index:    I,
            BasePos:  [Site.Pos[0], Site.Pos[1], QueryCandyTerrainHeight(Site.Pos[0], Site.Pos[1])],
            Yaw:      Site.Yaw,
            Recoil:   0.0,
            Cooldown: 0.65 + I * 0.45
        }));

        // ④ 4 Swinging Jawbreaker Wrecking Pendulums!
        this.Pendulums = CandyPendulumSites.map((S, I) =>
        {
            const BaseZ = I < 2
                ? QueryCandyTerrainHeight(CandyWaferBridges[I].CX - CandyWaferBridges[I].HalfRun, S.Pos[1]) + CandyWaferBridges[I].DeckLift
                : QueryCandyTerrainHeight(S.Pos[0], S.Pos[1]);
            return {
                Index:    I,
                Spec:     S,
                PivotPos: [S.Pos[0], S.Pos[1], BaseZ + S.PivotHeight],
                Angle:    0.0,
                AngVel:   0.0,
                BallPos:  [S.Pos[0], S.Pos[1], BaseZ + 2.2]
            };
        });

        // ⑤ 4 Slamming Overhead Peppermint Crusher Hammers!
        this.Crushers = CandyCrusherSites.map((S, I) => ({
            Index:   I,
            Spec:    S,
            GroundZ: QueryCandyTerrainHeight(S.Pos[0], S.Pos[1]),
            LiftZ:   4.6,
            State:   "up", // "up" | "telegraph" | "slamming" | "down" | "rising"
            Timer:   S.PhaseOffset
        }));

        // ⑥ 6 Downhill Rolling Giant Peppermint Pinwheel Boulders!
        this.Pinwheels = CandyPinwheelLanes.map((L, I) => this.SpawnPinwheelInLane(L, I, true));

        // ⑦ 8 Bubbling & Erupting Cola-Mentos Geyser Vents!
        this.Geysers = CandyGeyserSites.map((S, I) => ({
            Index:   I,
            Pos:     [S.Pos[0], S.Pos[1], QueryCandyTerrainHeight(S.Pos[0], S.Pos[1])],
            State:   "dormant", // "dormant" | "bubbling" | "erupting"
            Timer:   S.PhaseOffset,
            Height:  0.0
        }));

        this.Jawbreakers   = Array.from({ length: Block.Jawbreakers.length },   () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Bounces: 0, Spin: 0 }));
        this.StickyPuddles = Array.from({ length: Block.StickyPuddles.length }, () => ({ Active: false, Pos: [0, 0, -200], Age: 0, Duration: 6.5 }));

        this.AdvanceWorms(0.016, false);
        this.WormSkinner.Build(this.Worms, this.Clock);
        this.SyncGpuOccupants(true);
        this.PushWormMeshToGpu(true);
        this.PushWaterMeshToGpu(true);
    }

    SpawnPinwheelInLane(Lane, Index, Stagger = false)
    {
        const StartY = Lane.FromNorth ? (Stagger ? 34.0 - Index * 6.0 : 38.0) : (Stagger ? -34.0 + Index * 6.0 : -38.0);
        const GZ     = QueryCandyTerrainHeight(Lane.X, StartY);
        return {
            Index,
            Lane,
            Pos:   [Lane.X, StartY, GZ + 1.82],
            DirY:  Lane.FromNorth ? -1.0 : 1.0,
            Spin:  Index * 0.9
        };
    }

    RestartRun()
    {
        if (!this.Enabled)
            return;
        this.RunTimer     = 0.0;
        this.Finished     = false;
        this.CandyCoatHp  = 100.0;
        this.StickyTimer  = 0.0;
        this.InTaffySnare = false;
        const GZ = QueryCandyTerrainHeight(CandySpawn.Position[0], CandySpawn.Position[1]);
        this.Host.Vehicle.Respawn([CandySpawn.Position[0], CandySpawn.Position[1], GZ + 0.63], CandySpawn.Yaw);
        this.InitializeVillage();
        this.BannerMessage = "🍬 NEW SUGAR GAUNTLET — TIME THE CRUSHERS, BRIDGES & PARABOLIC CATAPULTS!";
        this.BannerTimer   = 3.5;
    }

    MountQuickControls()
    {
        if (typeof document === "undefined")
            return;
        const HostBar  = document.getElementById("hud-bar") || document.body;
        const Existing = document.getElementById("candy-controls");
        if (Existing)
            Existing.remove();

        const Wrap = document.createElement("div");
        Wrap.id = "candy-controls";
        Wrap.style.cssText = [
            "position:fixed", "top:54px", "right:16px", "z-index:26",
            "display:flex", "align-items:center", "gap:6px", "pointer-events:auto",
            "font-family:'DM Sans',system-ui,sans-serif"
        ].join(";");

        const MakePill = (Label, Accent, OnClick) =>
        {
            const Btn = document.createElement("button");
            Btn.type = "button";
            Btn.textContent = Label;
            Btn.style.cssText = [
                "padding:5px 11px", "border-radius:999px", `border:1px solid ${Accent}`,
                "background:rgba(24, 14, 28, 0.45)", "backdrop-filter:blur(6px)",
                "color:#fff5fa", "font-size:11px", "font-weight:700", "letter-spacing:0.04em",
                "cursor:pointer", "text-shadow:0 1px 3px rgba(0,0,0,0.85)"
            ].join(";");
            Btn.addEventListener("click", (Ev) => { Ev.preventDefault(); Ev.stopPropagation(); OnClick(); });
            Wrap.appendChild(Btn);
        };

        MakePill("🔄 NEW SUGAR RUN",   "rgba(255, 132, 188, 0.72)", () => this.RestartRun());
        MakePill("🌊 2.5D SODA SURGE", "rgba(88, 232, 255, 0.75)",  () =>
        {
            this.Water.TriggerTidalSurge((this.Stats.SurgesTriggered & 1) === 0);
            this.Stats.SurgesTriggered++;
            this.BannerMessage = "🌊 2.5D DAM-BREAK SODA SURGE — CROSS-CURRENTS RISING!";
            this.BannerTimer   = 2.6;
        });
        MakePill("🔥 CATAPULT SALVO",  "rgba(255, 168, 72, 0.75)",  () => this.TriggerCatapultSalvo());
        MakePill("🧼 FIZZ WASH +100%", "rgba(120, 248, 190, 0.72)", () =>
        {
            this.StickyTimer = 0.0;
            this.CandyCoatHp = 100.0;
            this.BannerMessage = "🧼 TIRES CLEANSED & SUGAR-GLAZE RESTORED TO 100%!";
            this.BannerTimer   = 2.2;
        });

        HostBar.appendChild(Wrap);
        this.ControlStrip = Wrap;
    }

    PushDynamicVertexStream(Block, FloatData, VertCount, FirstUpload = false)
    {
        if (!Block)
            return;
        const Set = this.Scene.FacetSets[Block.FacetSet];
        const Occ = this.Scene.Occupants[Block.Occupant];
        if (!Set || !Occ)
            return;

        Set.Vertices    = FloatData;
        Set.VertexCount = VertCount;
        if (Occ.Inactive)
        {
            Occ.Inactive = false;
            Occ.Roles   |= OccupantRole.Raster;
            this.Scene.ConstructDrawRuns?.();
        }

        const Device       = this.Host?.Exchange?.Device;
        const VertexBuffer = this.Host?.VertexRecords;
        if (Device && VertexBuffer && Number.isInteger(Set.FirstVertex))
        {
            Device.queue.writeBuffer(
                VertexBuffer,
                Set.FirstVertex * VertexStride,
                FloatData.buffer,
                FloatData.byteOffset,
                VertCount * VertexStride
            );
            if (FirstUpload && this.Host)
                this.Host.PriorValid = false;
        }
    }

    PushWaterMeshToGpu(FirstUpload = false)
    {
        if (this.Water)
            this.PushDynamicVertexStream(this.Scene?.CandyWaterBlock, this.Water.VertexF32, this.Water.VertexCount, FirstUpload);
    }

    PushWormMeshToGpu(FirstUpload = false)
    {
        if (this.WormSkinner)
            this.PushDynamicVertexStream(this.Scene?.CandyWormBlock, this.WormSkinner.VertexF32, this.WormSkinner.VertexCount, FirstUpload);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //     EXACT CATAPULT SPOON WORLD POSITION & EXACT NEWTONIAN PARABOLIC LAUNCH SOLVER (ZERO TELEPORTING!)
    //--------------------------------------------------------------------------------------------------------------------

    ComputeCatapultSpoonWorldPos(Cat)
    {
        const QBase      = ConstructAxisQuaternion([0, 0, 1], Cat.Yaw);
        const PivotWorld = RotateVector(QBase, CatapultPivotOff);
        const QArm       = MultiplyQuaternion(QBase, ConstructAxisQuaternion([0, 1, 0], Cat.ArmPitch));
        const BowlWorld  = RotateVector(QArm, CatapultBowlOff);
        return [
            Cat.Pos[0] + PivotWorld[0] + BowlWorld[0],
            Cat.Pos[1] + PivotWorld[1] + BowlWorld[1],
            Cat.Pos[2] + PivotWorld[2] + BowlWorld[2]
        ];
    }

    ChooseCatapultTarget(Cat, Car)
    {
        const AimX = ClampScalar(Car.Position[0] + Car.LinearVelocity[0] * 1.15 + (Cat.Index % 2 === 0 ? 6.0 : -4.0), -188.0, 184.0);
        const AimY = ClampScalar(Car.Position[1] + Car.LinearVelocity[1] * 0.75 + Math.sin(this.Clock * 2.1 + Cat.Index) * 3.5, -24.0, 24.0);
        const WS   = this.Water.Sample(AimX, AimY);
        const AimZ = WS.Depth > 0.16 ? WS.SurfaceZ : QueryCandyTerrainHeight(AimX, AimY);
        return [AimX, AimY, AimZ];
    }

    ReleaseCatapultBoulderFromSpoon(Cat)
    {
        const BallIdx = Cat.LoadedBall;
        const Ball    = BallIdx >= 0 ? this.FlamingBalls[BallIdx] : this.FlamingBalls.find((B) => !B.Active);
        if (!Ball)
            return false;

        // Exact world release point right inside the cupped spoon at crossbar impact!
        const P0     = this.ComputeCatapultSpoonWorldPos(Cat);
        const Target = Cat.TargetPos;
        const HorizD = Math.hypot(Target[0] - P0[0], Target[1] - P0[1]);
        const FlightT = ClampScalar(HorizD / 27.0, 0.95, 2.05);

        Ball.Active     = true;
        Ball.State      = "ballistic";
        Ball.OwnerCat   = Cat.Index;
        Ball.Pos        = [...P0];
        Ball.TargetPos  = [...Target];
        Ball.FlightTime = FlightT;
        Ball.Elapsed    = 0.0;
        Ball.Bounces    = 0;
        Ball.Spin       = 0.0;
        // Exact analytical initial velocity so boulder center P(t) = P0 + V0*t - 0.5*G*t² hits Target + R_ball at t = FlightT!
        const ImpactCenterZ = Target[2] + 0.65;
        Ball.Vel = [
            (Target[0] - P0[0]) / FlightT,
            (Target[1] - P0[1]) / FlightT,
            (ImpactCenterZ - P0[2] + 0.5 * CatapultGravity * FlightT * FlightT) / FlightT
        ];

        Cat.LoadedBall = -1;
        this.Stats.CatapultShots++;

        // Crossbar impact puff & sparks!
        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: P0,
            Radius:   0.62,
            Velocity: [Ball.Vel[0] * 0.16, Ball.Vel[1] * 0.16, 3.4],
            Smoke:    20.0, Heat: 52.0, Flame: 55.0, Soot: 14.0, Seconds: 0.36
        });
        this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.42);
        return true;
    }

    TriggerCatapultSalvo()
    {
        const Car = this.Host?.Vehicle;
        if (!Car)
            return 0;
        let Triggered = 0;
        for (const Cat of this.Catapults)
        {
            if (Cat.LoadedBall < 0)
            {
                const Slot = this.FlamingBalls.findIndex((B) => !B.Active);
                if (Slot < 0)
                    continue;
                Cat.LoadedBall = Slot;
            }
            Cat.TargetPos = this.ChooseCatapultTarget(Cat, Car);
            Cat.ShowRing  = true;
            Cat.ArmPitch  = -0.22;
            Cat.State     = "whipping"; // visibly whips through the full 80° throwing arc!
            const B       = this.FlamingBalls[Cat.LoadedBall];
            B.Active      = true;
            B.State       = "in_spoon";
            B.OwnerCat    = Cat.Index;
            B.Pos         = this.ComputeCatapultSpoonWorldPos(Cat);
            Triggered++;
        }
        return Triggered;
    }

    FireOldSchoolCandyCannon(Cannon, Car)
    {
        const Shot = this.Jawbreakers.find((J) => !J.Active);
        if (!Shot)
            return false;

        const MuzzleX = Cannon.BasePos[0] + Math.cos(Cannon.Yaw) * 3.25;
        const MuzzleY = Cannon.BasePos[1] + Math.sin(Cannon.Yaw) * 3.25;
        const MuzzleZ = Cannon.BasePos[2] + 1.38;

        const Dist    = Math.hypot(Car.Position[0] - MuzzleX, Car.Position[1] - MuzzleY);
        const FlightT = ClampScalar(Dist / 50.0, 0.42, 1.35);
        const AimX    = Car.Position[0] + Car.LinearVelocity[0] * (FlightT * 0.65);
        const AimY    = Car.Position[1] + Car.LinearVelocity[1] * (FlightT * 0.65);
        const DestZ   = QueryCandyTerrainHeight(AimX, AimY) + 0.50;
        const G       = 14.5;

        Shot.Active  = true;
        Shot.Bounces = 0;
        Shot.Spin    = 0.0;
        Shot.Pos     = [MuzzleX, MuzzleY, MuzzleZ];
        Shot.Vel     = [
            (AimX - MuzzleX) / FlightT,
            (AimY - MuzzleY) / FlightT,
            (DestZ - MuzzleZ) / FlightT + 0.5 * G * FlightT
        ];
        Cannon.Recoil = 0.62;
        this.Stats.CannonShots++;

        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [MuzzleX, MuzzleY, MuzzleZ],
            Radius:   0.54,
            Velocity: [Math.cos(Cannon.Yaw) * 11.0, Math.sin(Cannon.Yaw) * 11.0, 1.8],
            Smoke:    30.0, Heat: 38.0, Flame: 34.0, Soot: 6.0, Seconds: 0.34
        });
        this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.45);
        return true;
    }

    SpawnStickyPuddle(X, Y, Z)
    {
        let Slot = this.StickyPuddles.find((P) => !P.Active);
        if (!Slot)
            Slot = this.StickyPuddles[this.Stats.PuddlesCreated % this.StickyPuddles.length];
        Slot.Active   = true;
        Slot.Pos      = [X, Y, Z + 0.02];
        Slot.Age      = 0.0;
        Slot.Duration = 7.0;
        this.Stats.PuddlesCreated++;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //       CONTINUOUS SKINNED REFRACTIVE-JELLY WORM KINEMATICS & SQUISHY COLLISION BOUNCE
    //--------------------------------------------------------------------------------------------------------------------

    AdvanceWorms(Step, InjectWaterWaves = true)
    {
        const Car    = this.Host?.Vehicle;
        const RCount = CandyWormMeshSpec.RingsPerWorm;

        for (const W of this.Worms)
        {
            const S   = W.Spec;
            W.Phase  += S.Speed * Step;
            W.Jiggle *= Math.exp(-3.8 * Step);

            // Slither S-curve sweeping ACROSS the road (Y ∈ [-SpanY .. +SpanY]) with raised dorsal arches!
            const HeadDirSign = Math.cos(W.Phase) >= 0 ? 1.0 : -1.0;
            for (let RI = 0; RI < RCount; ++RI)
            {
                const U        = RI / (RCount - 1);
                const ArcLag   = W.Phase - U * (S.Length / Math.max(8.0, S.SpanY)) * 1.15;
                const WY       = S.Center[1] + Math.sin(ArcLag) * S.SpanY;
                const LateralS = Math.sin(ArcLag * 3.0 - U * 4.5) * 3.2;
                const WX       = S.Center[0] + Math.cos(ArcLag * 2.0) * S.SpanX * 0.55 + LateralS;

                const GroundZ  = QueryCandyTerrainHeight(WX, WY);
                const WS       = this.Water.Sample(WX, WY);
                const BaseZ    = WS.Depth > 0.18 ? (WS.SurfaceZ - 0.35) : GroundZ;
                // Undulating vertical inchworm/sea-serpent arch!
                const ArchLift = Math.max(0.0, Math.sin(W.Phase * 3.1 - U * 5.2)) * 1.45;
                const Z        = BaseZ + S.Radius * 0.72 + ArchLift;

                W.Spine[RI] = [WX, WY, Z];

                if (RI === 2 && InjectWaterWaves)
                {
                    const Sub = WS.Depth > 0.22 && Z < WS.SurfaceZ + 0.35;
                    if (Sub !== W.WasSubmerged)
                        this.Water.InjectDisturbance(WX, WY, 4.4, Sub ? -0.34 : 0.36, 0.0, HeadDirSign * 2.5, 0.70);
                    W.WasSubmerged = Sub;
                }

                // Squishy Jelly Collision along every spine station -> triggers 15 Hz Jelly Wobble + Elastic Boing + Sticky Tires!
                if (Car && (RI % 2 === 0))
                {
                    const DX   = Car.Position[0] - WX, DY = Car.Position[1] - WY;
                    const Dist = Math.hypot(DX, DY);
                    const HitR = S.Radius + 1.55;
                    if (Dist < HitR && Math.abs(Car.Position[2] - Z) < 1.85)
                    {
                        const NX = Dist > 1e-3 ? DX / Dist : 1.0;
                        const NY = Dist > 1e-3 ? DY / Dist : 0.0;
                        Car.Position[0] = WX + NX * (HitR + 0.10);
                        Car.Position[1] = WY + NY * (HitR + 0.10);
                        const VDotN = Car.LinearVelocity[0] * NX + Car.LinearVelocity[1] * NY;
                        if (VDotN < 5.5)
                        {
                            Car.LinearVelocity[0] += (7.8 - VDotN * 1.5) * NX;
                            Car.LinearVelocity[1] += (7.8 - VDotN * 1.5) * NY;
                            Car.LinearVelocity[2]  = Math.max(Car.LinearVelocity[2], 2.8);
                        }
                        W.Jiggle = 0.34; // Whole translucent jelly worm visibly wobbles on impact!
                        if (this.WaterDepthNow < 0.18)
                            this.StickyTimer = Math.max(this.StickyTimer, 3.2);
                        this.Stats.WormBoings++;
                        this.BannerMessage = "🪱 BOINGED BY GIANT JELLY WORM — TIRES COATED IN STICKY JELLY!";
                        this.BannerTimer   = 2.5;
                    }
                }
            }
        }

        this.WormSkinner.Build(this.Worms, this.Clock);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                 MAIN PER-FRAME CANDY GAUNTLET SIMULATION
    //--------------------------------------------------------------------------------------------------------------------

    Advance(FrameStep)
    {
        if (!this.Enabled)
            return false;

        const Step = Math.min(FrameStep, 0.05);
        this.Clock += Step;
        if (this.BannerTimer > 0.0)
            this.BannerTimer = Math.max(0.0, this.BannerTimer - Step);

        const Car = this.Host.Vehicle;
        if (!this.Finished)
            this.RunTimer += Step;

        if (!this.Finished && Car.Position[0] >= CandyGoalX && Math.abs(Car.Position[1]) <= 9.0)
        {
            this.Finished = true;
            this.Stats.Finishes++;
            if (this.BestRunSec === null || this.RunTimer < this.BestRunSec)
                this.BestRunSec = this.RunTimer;
            this.BannerMessage = `🏆 SWEET-GATE CITADEL BREACHED IN ${this.RunTimer.toFixed(1)}s!`;
            this.BannerTimer   = 7.0;
        }

        // ① Periodic 2.5D Dam-Break Soda Surges!
        this.SurgeTimer -= Step;
        if (this.SurgeTimer <= 0.0)
        {
            this.Water.TriggerTidalSurge((this.Stats.SurgesTriggered & 1) === 0);
            this.Stats.SurgesTriggered++;
            this.SurgeTimer = 8.8;
        }

        // ② Two-Way Car <-> 2.5D Refractive Shallow-Water Coupling (Strong Hydrodynamic Slowdown + Buoyancy + Cross-Current Sweep!)
        const WSamp        = this.Water.Sample(Car.Position[0], Car.Position[1]);
        const OnHighBridge = Car.Position[2] > WSamp.SurfaceZ + 0.62;
        this.WaterDepthNow = (!OnHighBridge && WSamp.Depth > 0.04) ? WSamp.Depth : 0.0;

        if (this.WaterDepthNow > 0.04)
        {
            if (this.StickyTimer > 0.05)
            {
                this.StickyTimer = 0.0;
                this.Stats.FizzWashes++;
                this.BannerMessage = "🫧 FIZZY 2.5D LAGOON WASHED STICKY JELLY OFF YOUR TIRES!";
                this.BannerTimer   = 2.0;
            }

            const SubDepth = ClampScalar(this.WaterDepthNow, 0.0, 1.45);
            const RelVX    = Car.LinearVelocity[0] - WSamp.U * 1.25;
            const RelVY    = Car.LinearVelocity[1] - WSamp.V * 1.25;
            const RelSpd   = Math.hypot(RelVX, RelVY);
            const DragRate = (1.18 + 0.19 * RelSpd) * SubDepth;
            const DragMul  = Math.exp(-DragRate * Step);
            Car.LinearVelocity[0] = WSamp.U * 1.25 + RelVX * DragMul;
            Car.LinearVelocity[1] = WSamp.V * 1.25 + RelVY * DragMul;

            // Gentle Archimedes buoyancy & wave-crest pitch rock when wading deep channels!
            if (SubDepth > 0.55)
            {
                Car.LinearVelocity[2]  += (SubDepth - 0.55) * 3.8 * Step;
                Car.AngularVelocity[1] -= 0.35 * SubDepth * Step;
            }

            const CarSpd = Math.hypot(Car.LinearVelocity[0], Car.LinearVelocity[1]);
            if (CarSpd > 1.0)
            {
                this.Water.InjectDisturbance(
                    Car.Position[0] + Car.LinearVelocity[0] * 0.10,
                    Car.Position[1] + Car.LinearVelocity[1] * 0.10,
                    3.6,
                    -0.22 * ClampScalar(CarSpd / 16.0, 0.25, 1.35),
                    Car.LinearVelocity[0] * 0.42,
                    Car.LinearVelocity[1] * 0.42,
                    0.65
                );
                this.SplashTimer -= Step;
                if (this.SplashTimer <= 0.0 && CarSpd > 4.5)
                {
                    this.SplashTimer = 0.14;
                    this.Host?.Sparks?.Emit?.([
                        { Point: [Car.Position[0], Car.Position[1] - 0.95, WSamp.SurfaceZ + 0.15], Velocity: [-Car.LinearVelocity[0] * 0.2, -3.5, 4.2], Normal: [0, 0, 1], Strength: 1.8, Rim: null },
                        { Point: [Car.Position[0], Car.Position[1] + 0.95, WSamp.SurfaceZ + 0.15], Velocity: [-Car.LinearVelocity[0] * 0.2,  3.5, 4.2], Normal: [0, 0, 1], Strength: 1.8, Rim: null }
                    ], 1.0 / 60.0);
                }
            }
        }

        // ③ Stretchy Viscoelastic Saltwater-Taffy Snare Strips (rubber-bands reckless slow/mid-speed drivers backward!)
        this.InTaffySnare = false;
        for (const TStrip of CandyTaffyStrips)
        {
            const DX = Car.Position[0] - TStrip.Pos[0], DY = Car.Position[1] - TStrip.Pos[1];
            if (Math.abs(DX) < TStrip.HalfX && Math.abs(DY) < TStrip.HalfY)
            {
                const GroundT = QueryCandyTerrainHeight(TStrip.Pos[0], TStrip.Pos[1]);
                if (Car.Position[2] < GroundT + 1.45)
                {
                    this.InTaffySnare = true;
                    const Speed = Math.hypot(Car.LinearVelocity[0], Car.LinearVelocity[1]);
                    // Unless blasting through > 23 m/s (~83 km/h), viscoelastic taffy stretches & yanks car back toward trap center!
                    const EscapeFactor = Speed > 23.0 ? 0.35 : 1.0;
                    Car.LinearVelocity[0] -= (DX * 3.8 + Car.LinearVelocity[0] * 2.4) * EscapeFactor * Step;
                    Car.LinearVelocity[1] -= (DY * 3.8 + Car.LinearVelocity[1] * 2.4) * EscapeFactor * Step;
                    this.StickyTimer = Math.max(this.StickyTimer, 1.8);
                    if (this.BannerTimer <= 0.1)
                    {
                        this.Stats.TaffySnags++;
                        this.BannerMessage = "🍮 SNARED IN STRETCHY SALTWATER TAFFY — STEER CLEAR OR HIT AT 85+ KM/H!";
                        this.BannerTimer   = 2.1;
                    }
                }
            }
        }

        // ④ Sticky Puddles & Sticky Tire Drag
        for (const P of this.StickyPuddles)
        {
            if (!P.Active)
                continue;
            P.Age += Step;
            if (P.Age >= P.Duration) { P.Active = false; continue; }
            if (Math.hypot(Car.Position[0] - P.Pos[0], Car.Position[1] - P.Pos[1]) < 3.65 && Math.abs(Car.Position[2] - P.Pos[2]) < 1.5)
            {
                this.StickyTimer = Math.max(this.StickyTimer, 3.2);
                this.CandyCoatHp = Math.max(5.0, this.CandyCoatHp - 8.5 * Step);
            }
        }
        if (this.StickyTimer > 0.0)
        {
            this.StickyTimer = Math.max(0.0, this.StickyTimer - Step);
            const SyrupDrag  = Math.exp(-1.45 * Step);
            Car.LinearVelocity[0] *= SyrupDrag;
            Car.LinearVelocity[1] *= SyrupDrag;
        }

        // ⑤ Refractive Jelly Pinball Bumpers
        for (const B of CandyGummyBumpers)
        {
            const DX   = Car.Position[0] - B.Pos[0], DY = Car.Position[1] - B.Pos[1];
            const Dist = Math.hypot(DX, DY);
            const HitR = B.Radius + 1.15;
            if (Dist < HitR && Dist > 1e-3 && Car.Position[2] < QueryCandyTerrainHeight(B.Pos[0], B.Pos[1]) + 2.4)
            {
                const NX = DX / Dist, NY = DY / Dist;
                Car.Position[0] = B.Pos[0] + NX * (HitR + 0.06);
                Car.Position[1] = B.Pos[1] + NY * (HitR + 0.06);
                const VDotN = Car.LinearVelocity[0] * NX + Car.LinearVelocity[1] * NY;
                if (VDotN < 2.0)
                {
                    const Bounce = Math.max(9.0, -VDotN * 0.90 + 4.5);
                    Car.LinearVelocity[0] += (Bounce - VDotN) * NX;
                    Car.LinearVelocity[1] += (Bounce - VDotN) * NY;
                    this.Stats.GummyBumperHits++;
                }
            }
        }

        // ⑥ Swinging Giant Jawbreaker Wrecking Pendulums (knock reckless bridge-crossers into the 2.5D Lagoon!)
        for (const Pend of this.Pendulums)
        {
            const S      = Pend.Spec;
            Pend.Angle   = Math.sin(this.Clock * S.Speed + S.Phase) * S.MaxAngle;
            Pend.AngVel  = Math.cos(this.Clock * S.Speed + S.Phase) * S.Speed * S.MaxAngle;
            const BallY  = Pend.PivotPos[1] + Math.sin(Pend.Angle) * S.ChainLen;
            const BallZ  = Pend.PivotPos[2] - Math.cos(Pend.Angle) * S.ChainLen;
            Pend.BallPos = [Pend.PivotPos[0], BallY, BallZ];

            const DX   = Car.Position[0] - Pend.BallPos[0];
            const DY   = Car.Position[1] - Pend.BallPos[1];
            const DZ   = Car.Position[2] - Pend.BallPos[2];
            const Dist = Math.hypot(DX, DY, DZ);
            if (Dist < 2.55)
            {
                const TangVelY = Math.cos(Pend.Angle) * Pend.AngVel * S.ChainLen;
                const PushSign = TangVelY >= 0 ? 1.0 : -1.0;
                Car.Position[1]       += PushSign * 1.25;
                Car.LinearVelocity[1] += PushSign * 14.5;
                Car.LinearVelocity[0] -= 6.5;
                Car.LinearVelocity[2]  = Math.max(Car.LinearVelocity[2], 4.2);
                Car.AngularVelocity[0] += PushSign * 1.8;
                this.CandyCoatHp       = Math.max(0.0, this.CandyCoatHp - 18.0);
                this.Stats.PendulumHits++;
                this.BannerMessage = "🍭 SMASHED BY SWINGING JAWBREAKER WRECKING PENDULUM!";
                this.BannerTimer   = 2.5;
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.65);
            }
        }

        // ⑦ Overhead Slamming Peppermint Crusher Hammers!
        for (const Cr of this.Crushers)
        {
            Cr.Timer += Step;
            if (Cr.State === "up")
            {
                Cr.LiftZ = 4.6;
                if (Cr.Timer >= Cr.Spec.Period * 0.45) { Cr.State = "telegraph"; Cr.Timer = 0.0; }
            }
            else if (Cr.State === "telegraph")
            {
                // Visible warning shudder before slam!
                Cr.LiftZ = 4.45 + Math.sin(this.Clock * 55.0) * 0.14;
                if (Cr.Timer >= 0.48) { Cr.State = "slamming"; Cr.Timer = 0.0; }
            }
            else if (Cr.State === "slamming")
            {
                Cr.LiftZ -= 28.0 * Step;
                if (Cr.LiftZ <= 0.0)
                {
                    Cr.LiftZ = 0.0;
                    Cr.State = "down";
                    Cr.Timer = 0.0;
                    this.Stats.CrusherSlams++;
                    this.Host?.Sparks?.Emit?.([
                        { Point: [Cr.Spec.Pos[0], Cr.Spec.Pos[1] - 2.2, Cr.GroundZ + 0.15], Velocity: [-3.5, -5.0, 4.0], Normal: [0, 0, 1], Strength: 2.6, Rim: null },
                        { Point: [Cr.Spec.Pos[0], Cr.Spec.Pos[1] + 2.2, Cr.GroundZ + 0.15], Velocity: [ 3.5,  5.0, 4.0], Normal: [0, 0, 1], Strength: 2.6, Rim: null }
                    ], 1.0 / 60.0);
                    if (Math.hypot(Car.Position[0] - Cr.Spec.Pos[0], Car.Position[1] - Cr.Spec.Pos[1]) < 45.0)
                        this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.50);
                }
            }
            else if (Cr.State === "down")
            {
                Cr.LiftZ = 0.0;
                if (Cr.Timer >= 0.80) { Cr.State = "rising"; Cr.Timer = 0.0; }
            }
            else
            {
                Cr.LiftZ = Math.min(4.6, Cr.LiftZ + 4.8 * Step);
                if (Cr.LiftZ >= 4.58) { Cr.State = "up"; Cr.Timer = 0.0; }
            }

            // Solid block / crush knockback when hammer head is low (< 1.65 m)!
            if (Cr.LiftZ < 1.65 && Math.abs(Car.Position[0] - Cr.Spec.Pos[0]) < 2.25 && Math.abs(Car.Position[1] - Cr.Spec.Pos[1]) < 3.95)
            {
                const PushSign = Car.Position[0] <= Cr.Spec.Pos[0] ? -1.0 : 1.0;
                Car.Position[0]       = Cr.Spec.Pos[0] + PushSign * 2.45;
                Car.LinearVelocity[0] = PushSign * 13.5;
                Car.LinearVelocity[2] = 3.5;
                this.CandyCoatHp      = Math.max(0.0, this.CandyCoatHp - (Cr.State === "slamming" ? 26.0 : 10.0));
                this.BannerMessage    = "🔨 REJECTED BY SLAMMING PEPPERMINT CRUSHER HAMMER!";
                this.BannerTimer      = 2.4;
            }
        }

        // ⑧ Downhill Rolling Giant Peppermint Pinwheel Boulders!
        for (let PI = 0; PI < this.Pinwheels.length; ++PI)
        {
            const PW   = this.Pinwheels[PI];
            PW.Pos[1] += PW.DirY * PW.Lane.Speed * Step;
            PW.Spin   += (PW.Lane.Speed / 1.82) * Step;
            const GZ   = QueryCandyTerrainHeight(PW.Pos[0], PW.Pos[1]);
            PW.Pos[2]  = GZ + 1.82 + Math.abs(Math.sin(PW.Spin * 2.0)) * 0.16;

            // Carve wake if rolling through a 2.5D waterway!
            const WS = this.Water.Sample(PW.Pos[0], PW.Pos[1]);
            if (WS.Depth > 0.20)
                this.Water.InjectDisturbance(PW.Pos[0], PW.Pos[1], 3.4, -0.20, 0.0, PW.DirY * 3.5, 0.55);

            if (Math.hypot(Car.Position[0] - PW.Pos[0], Car.Position[1] - PW.Pos[1]) < 2.85 && Math.abs(Car.Position[2] - PW.Pos[2]) < 2.2)
            {
                Car.LinearVelocity[0] = -12.5; // Punts reckless driver backward!
                Car.LinearVelocity[1] += PW.DirY * 10.5;
                Car.LinearVelocity[2]  = 4.0;
                this.CandyCoatHp       = Math.max(0.0, this.CandyCoatHp - 16.0);
                this.Stats.PinwheelHits++;
                this.BannerMessage = "🛞 FLATTENED BY ROLLING GIANT PEPPERMINT PINWHEEL!";
                this.BannerTimer   = 2.4;
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.55);
            }

            if (Math.abs(PW.Pos[1]) > 42.0)
                this.Pinwheels[PI] = this.SpawnPinwheelInLane(PW.Lane, PI, false);
        }

        // ⑨ Bubbling & Erupting Cola-Mentos Vertical Geyser Vents!
        for (const Gy of this.Geysers)
        {
            Gy.Timer += Step;
            if (Gy.State === "dormant")
            {
                Gy.Height = 0.0;
                if (Gy.Timer >= 3.2) { Gy.State = "bubbling"; Gy.Timer = 0.0; }
            }
            else if (Gy.State === "bubbling")
            {
                Gy.Height = 0.18 + 0.08 * Math.sin(this.Clock * 30.0);
                if (Gy.Timer >= 0.95)
                {
                    Gy.State  = "erupting";
                    Gy.Timer  = 0.0;
                    Gy.Height = 1.0;
                    this.Host?.Smoke?.Sources?.QueueBurst?.({
                        Position: [Gy.Pos[0], Gy.Pos[1], Gy.Pos[2] + 0.6],
                        Radius:   1.05, Velocity: [0.0, 0.0, 14.0],
                        Smoke:    42.0, Heat: 18.0, Flame: 0.0, Soot: 4.0, Seconds: 0.95
                    });
                }
            }
            else
            {
                Gy.Height = 1.0;
                if (Math.hypot(Car.Position[0] - Gy.Pos[0], Car.Position[1] - Gy.Pos[1]) < 2.65 && Car.Position[2] < Gy.Pos[2] + 6.5)
                {
                    Car.LinearVelocity[2]  = Math.max(Car.LinearVelocity[2], 10.8);
                    Car.LinearVelocity[0] *= 0.65;
                    Car.AngularVelocity[0] += 0.9;
                    this.Stats.GeyserLaunches++;
                    this.BannerMessage = "🫧 BLASTED SKYWARD BY ERUPTING COLA-MENTOS GEYSER!";
                    this.BannerTimer   = 2.3;
                }
                if (Gy.Timer >= 1.15) { Gy.State = "dormant"; Gy.Timer = 0.0; Gy.Height = 0.0; }
            }
        }

        // ⑩ Advance the 6 Continuous Skinned Refractive-Jelly Worms!
        this.AdvanceWorms(Step, true);

        // ⑪ Advance the 5 Physically-Coupled Heavy Torsion Catapults & Exact Verlet Parabolic Boulders!
        for (const Cat of this.Catapults)
        {
            const DesiredYaw = Math.atan2(Car.Position[1] - Cat.Pos[1], Car.Position[0] - Cat.Pos[0]);
            if (Cat.State !== "whipping")
                Cat.Yaw += ClampScalar(AngleDelta(Cat.Yaw, DesiredYaw), -1.35 * Step, 1.35 * Step);

            if (Cat.State === "cocking")
            {
                Cat.ShowRing = false;
                Cat.ArmPitch = Math.max(-0.22, Cat.ArmPitch - 0.95 * Step);
                if (Cat.ArmPitch <= -0.215)
                {
                    const Slot = this.FlamingBalls.findIndex((B) => !B.Active);
                    if (Slot >= 0)
                    {
                        Cat.LoadedBall = Slot;
                        const B        = this.FlamingBalls[Slot];
                        B.Active       = true;
                        B.State        = "in_spoon";
                        B.OwnerCat     = Cat.Index;
                        B.Pos          = this.ComputeCatapultSpoonWorldPos(Cat);
                        Cat.TargetPos  = this.ChooseCatapultTarget(Cat, Car);
                        Cat.ShowRing   = true;
                        Cat.State      = "aiming";
                        Cat.Timer      = 0.38;
                    }
                }
            }
            else if (Cat.State === "aiming")
            {
                Cat.TargetPos = this.ChooseCatapultTarget(Cat, Car);
                if (Cat.LoadedBall >= 0)
                    this.FlamingBalls[Cat.LoadedBall].Pos = this.ComputeCatapultSpoonWorldPos(Cat);
                Cat.Timer -= Step;
                const Range = Math.hypot(Car.Position[0] - Cat.Pos[0], Car.Position[1] - Cat.Pos[1]);
                if (Cat.Timer <= 0.0 && Range < 175.0)
                    Cat.State = "whipping";
            }
            else if (Cat.State === "whipping")
            {
                // High-torque visible swing through the 80° throwing arc; boulder rides INSIDE the spoon!
                Cat.ArmPitch += 8.2 * Step;
                if (Cat.LoadedBall >= 0)
                    this.FlamingBalls[Cat.LoadedBall].Pos = this.ComputeCatapultSpoonWorldPos(Cat);
                if (Cat.ArmPitch >= 1.14)
                {
                    Cat.ArmPitch = 1.14;
                    this.ReleaseCatapultBoulderFromSpoon(Cat);
                    Cat.State = "cooldown";
                    Cat.Timer = 0.65;
                }
            }
            else
            {
                Cat.Timer -= Step;
                if (Cat.Timer <= 0.0)
                    Cat.State = "cocking";
            }
        }

        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active || Ball.State !== "ballistic")
                continue;

            // Exact 2nd-Order Velocity-Verlet Ballistic Parabola Integration: P(t + dt) = P(t) + V(t)*dt - ½ g dt²!
            Ball.Pos[0] += Ball.Vel[0] * Step;
            Ball.Pos[1] += Ball.Vel[1] * Step;
            Ball.Pos[2] += Ball.Vel[2] * Step - 0.5 * CatapultGravity * Step * Step;
            Ball.Vel[2] -= CatapultGravity * Step;
            Ball.Elapsed += Step;
            Ball.Spin    += 8.0 * Step;

            const WS = this.Water.Sample(Ball.Pos[0], Ball.Pos[1]);
            if (WS.Depth > 0.16 && Ball.Pos[2] <= WS.SurfaceZ + 0.35)
            {
                Ball.Active = false;
                Ball.State  = "idle";
                if (Ball.OwnerCat >= 0 && this.Catapults[Ball.OwnerCat])
                    this.Catapults[Ball.OwnerCat].ShowRing = false;
                this.Water.InjectDisturbance(Ball.Pos[0], Ball.Pos[1], 6.8, -0.75, Ball.Vel[0] * 0.15, Ball.Vel[1] * 0.15, 1.0);
                this.Host?.Smoke?.Sources?.QueueBurst?.({
                    Position: [Ball.Pos[0], Ball.Pos[1], WS.SurfaceZ + 0.3],
                    Radius:   0.92, Velocity: [0, 0, 6.2],
                    Smoke:    42.0, Heat: 34.0, Flame: 20.0, Soot: 6.0, Seconds: 0.75
                });
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.55);
                continue;
            }

            const TerrZ = QueryCandyTerrainHeight(Ball.Pos[0], Ball.Pos[1]);
            if (Ball.Pos[2] <= TerrZ + 0.65)
            {
                if (Ball.Bounces < 1)
                {
                    Ball.Bounces++;
                    if (Ball.OwnerCat >= 0 && this.Catapults[Ball.OwnerCat])
                        this.Catapults[Ball.OwnerCat].ShowRing = false;
                    Ball.Pos[2]  = TerrZ + 0.66;
                    Ball.Vel[0] *= 0.58;
                    Ball.Vel[1] *= 0.58;
                    Ball.Vel[2]  = Math.max(5.6, Math.abs(Ball.Vel[2]) * 0.48);
                    this.Host?.Sparks?.Emit?.([
                        { Point: [...Ball.Pos], Velocity: [Ball.Vel[0] * 0.3, Ball.Vel[1] * 0.3, 4.4], Normal: [0, 0, 1], Strength: 2.6, Rim: null }
                    ], 1.0 / 60.0);
                }
                else
                {
                    Ball.Active = false;
                    Ball.State  = "idle";
                    this.SpawnStickyPuddle(Ball.Pos[0], Ball.Pos[1], TerrZ);
                    this.Host?.Smoke?.Sources?.QueueBurst?.({
                        Position: [Ball.Pos[0], Ball.Pos[1], TerrZ + 0.35],
                        Radius:   0.82, Velocity: [0, 0, 5.4],
                        Smoke:    30.0, Heat: 58.0, Flame: 54.0, Soot: 26.0, Seconds: 0.68
                    });
                    this.Host?.Effects?.BurstTyre?.(
                        ConstructRigidTransform([Ball.Pos[0], Ball.Pos[1], TerrZ + 0.35], [0, 0, 0, 1]),
                        [0.80, 0.80, 0.48], [0, 0, 4.8], CourseMaterial.GummyOrange
                    );
                    this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.68);

                    const DCar = Math.hypot(Car.Position[0] - Ball.Pos[0], Car.Position[1] - Ball.Pos[1]);
                    if (DCar < 7.0)
                    {
                        this.StickyTimer = Math.max(this.StickyTimer, 3.4);
                        Car.LinearVelocity[2]  += 3.2 * (1.0 - DCar / 7.0);
                        Car.AngularVelocity[0] += 0.65;
                        this.CandyCoatHp = Math.max(0.0, this.CandyCoatHp - 18.0 * (1.0 - DCar / 7.0));
                    }
                }
            }
        }

        // ⑫ Advance the 6 Recoiling Old-School Candy Cannons & Skipping Jawbreakers!
        for (const Can of this.Cannons)
        {
            Can.Recoil *= Math.exp(-4.8 * Step);
            const DesiredYaw = Math.atan2(Car.Position[1] - Can.BasePos[1], Car.Position[0] - Can.BasePos[0]);
            Can.Yaw += ClampScalar(AngleDelta(Can.Yaw, DesiredYaw), -1.7 * Step, 1.7 * Step);
            Can.Cooldown -= Step;
            const Range = Math.hypot(Car.Position[0] - Can.BasePos[0], Car.Position[1] - Can.BasePos[1]);
            if (Can.Cooldown <= 0.0 && Range > 14.0 && Range < 158.0 && Math.abs(AngleDelta(Can.Yaw, DesiredYaw)) < 0.45)
            {
                this.FireOldSchoolCandyCannon(Can, Car);
                Can.Cooldown = 2.55 + (Can.Index % 3) * 0.50;
            }
        }

        for (const J of this.Jawbreakers)
        {
            if (!J.Active)
                continue;
            J.Pos[0] += J.Vel[0] * Step;
            J.Pos[1] += J.Vel[1] * Step;
            J.Pos[2] += J.Vel[2] * Step - 0.5 * 14.5 * Step * Step;
            J.Vel[2] -= 14.5 * Step;
            J.Spin   += 11.0 * Step;

            if (Math.hypot(Car.Position[0] - J.Pos[0], Car.Position[1] - J.Pos[1]) < 2.35 && Math.abs(Car.Position[2] - J.Pos[2]) < 1.40)
            {
                J.Active = false;
                Car.LinearVelocity[0]  += J.Vel[0] * 0.26;
                Car.LinearVelocity[1]  += J.Vel[1] * 0.26;
                Car.LinearVelocity[2]  += 3.0;
                Car.AngularVelocity[0] += 0.75;
                this.CandyCoatHp = Math.max(0.0, this.CandyCoatHp - 15.0);
                this.Host?.Effects?.BurstTyre?.(
                    ConstructRigidTransform([...J.Pos], [0, 0, 0, 1]),
                    [0.58, 0.58, 0.58], [0, 0, 4.2], CourseMaterial.PeppermintRed
                );
                this.BannerMessage = "💣 BROADSIDE HIT BY OLD-SCHOOL CANDY CANNON JAWBREAKER!";
                this.BannerTimer   = 2.1;
                continue;
            }

            const WS = this.Water.Sample(J.Pos[0], J.Pos[1]);
            if (WS.Depth > 0.16 && J.Pos[2] <= WS.SurfaceZ + 0.25)
            {
                J.Active = false;
                this.Water.InjectDisturbance(J.Pos[0], J.Pos[1], 5.4, -0.58, J.Vel[0] * 0.14, J.Vel[1] * 0.14, 0.95);
                continue;
            }

            const TerrZ = QueryCandyTerrainHeight(J.Pos[0], J.Pos[1]);
            if (J.Pos[2] <= TerrZ + 0.48)
            {
                if (J.Bounces < 2)
                {
                    J.Bounces++;
                    J.Pos[2]  = TerrZ + 0.50;
                    J.Vel[0] *= 0.76;
                    J.Vel[1] *= 0.76;
                    J.Vel[2]  = Math.max(3.6, Math.abs(J.Vel[2]) * 0.48);
                    this.Host?.Sparks?.Emit?.([
                        { Point: [...J.Pos], Velocity: [J.Vel[0] * 0.2, J.Vel[1] * 0.2, 3.2], Normal: [0, 0, 1], Strength: 2.1, Rim: null }
                    ], 1.0 / 60.0);
                }
                else
                {
                    J.Active = false;
                    this.Host?.Effects?.BurstTyre?.(
                        ConstructRigidTransform([J.Pos[0], J.Pos[1], TerrZ + 0.35], [0, 0, 0, 1]),
                        [0.50, 0.50, 0.40], [0, 0, 3.6], CourseMaterial.FrostingCream
                    );
                }
            }
        }

        if (this.CandyCoatHp <= 0.0)
            this.RestartRun();

        // ⑬ Step 128×64 Refractive 2.5D Water & Stream Both Live Meshes (Water + Skinned Jelly Worms) to WebGPU!
        this.Water.Advance(Step);
        this.PushWaterMeshToGpu(false);
        this.PushWormMeshToGpu(false);
        this.SyncGpuOccupants(false);
        return true;
    }

    QueryPlumeEmissions()
    {
        if (!this.Enabled)
            return [];
        const Out = [];

        // ① Both Spoon-Loaded & Parabolic-Flight Flaming Gummy Boulders trail continuous 3D Navier-Stokes fire!
        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active)
                continue;
            Out.push({
                Active: true,
                Position: [Ball.Pos[0], Ball.Pos[1], Ball.Pos[2] + 0.28],
                Radius:   0.65,
                Velocity: Ball.State === "ballistic"
                    ? [-Ball.Vel[0] * 0.12, -Ball.Vel[1] * 0.12, 3.8]
                    : [0.0, 0.0, 3.2],
                SmokeRate: 22.0, HeatRate: 54.0, FlameRate: 50.0, SootRate: 18.0
            });
        }

        // ② Erupting Cola-Mentos Geysers blast tall volumetric white fizz columns!
        for (const Gy of this.Geysers)
        {
            if (Gy.State !== "erupting")
                continue;
            Out.push({
                Active: true,
                Position: [Gy.Pos[0], Gy.Pos[1], Gy.Pos[2] + 0.8],
                Radius:   0.85,
                Velocity: [0.0, 0.0, 11.5],
                SmokeRate: 30.0, HeatRate: 16.0, FlameRate: 0.0, SootRate: 2.0
            });
        }

        // ③ Waterfall plunge mist + sizzling sticky molten puddles
        for (const WF of CandyWaterfallSites)
        {
            Out.push({
                Active: true,
                Position: [WF.PlungePos[0], WF.PlungePos[1], this.Water.RestSurfaceZ + 0.25],
                Radius:   0.95,
                Velocity: [0.0, WF.FlowV * 0.25, 2.4],
                SmokeRate: 12.0, HeatRate: 8.0, FlameRate: 0.0, SootRate: 0.0
            });
        }

        for (const P of this.StickyPuddles)
        {
            if (!P.Active || P.Age > 3.5)
                continue;
            const Fade = 1.0 - P.Age / 3.5;
            Out.push({
                Active: true,
                Position: [P.Pos[0], P.Pos[1], P.Pos[2] + 0.28],
                Radius:   0.68,
                Velocity: [0.0, 0.0, 2.8 * Fade],
                SmokeRate: 14.0 * Fade, HeatRate: 30.0 * Fade, FlameRate: 26.0 * Fade, SootRate: 12.0 * Fade
            });
        }
        return Out.slice(0, 14);
    }

    QueryDynamicLightRecords()
    {
        if (!this.Enabled)
            return [];
        const GateZ = QueryCandyTerrainHeight(188.0, 0.0);
        const Out = [
            {
                X: 187.0, Y: -8.5, Z: GateZ + 5.2,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [1.0, 0.82, 0.55], Intensity: 115.0, Reach: 40.0, Params: [0.1, -0.5, 0, 1]
            },
            {
                X: 187.0, Y:  8.5, Z: GateZ + 5.2,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [1.0, 0.82, 0.55], Intensity: 115.0, Reach: 40.0, Params: [0.1, -0.5, 0, 1]
            }
        ];

        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active)
                continue;
            Out.push({
                X: Ball.Pos[0], Y: Ball.Pos[1], Z: Ball.Pos[2] + 0.8,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [1.0, 0.48, 0.12], Intensity: 175.0, Reach: 38.0, Params: [0.1, -0.5, 0, 1]
            });
        }
        return Out.slice(0, 10);
    }

    SyncGpuOccupants(ResetHistory = false)
    {
        const Block = this.Scene?.CandyBlock;
        if (!Block)
            return;

        const SetOcc = (Idx, Xform, Visible = true) =>
        {
            if (Idx === undefined || Idx < 0 || !this.Scene.Occupants[Idx])
                return false;
            const Occ = this.Scene.Occupants[Idx];
            const VisChanged = Boolean(Occ.Inactive) !== !Visible;
            Occ.Inactive = !Visible;
            if (ResetHistory || VisChanged)
                Occ.PreviousTransform.set(Xform);
            else
                Occ.PreviousTransform.set(Occ.Transform);
            Occ.Transform = Xform;
            Occ.Moving    = Visible;
            return VisChanged;
        };

        let DrawChanged = false;
        const Parked = ConstructRigidTransform([0.0, 0.0, -320.0], [0.0, 0.0, 0.0, 1.0]);

        // ① 5 Heavy Torsion Catapults + Articulated Spoon Arms + Parabolic Road Target Rings!
        for (let I = 0; I < this.Catapults.length; ++I)
        {
            const Cat   = this.Catapults[I];
            const QBase = ConstructAxisQuaternion([0, 0, 1], Cat.Yaw);
            DrawChanged = SetOcc(Block.CatapultBases[I], ConstructRigidTransform(Cat.Pos, QBase), true) || DrawChanged;

            const PivotWorld = RotateVector(QBase, CatapultPivotOff);
            const QArm       = MultiplyQuaternion(QBase, ConstructAxisQuaternion([0, 1, 0], Cat.ArmPitch));
            DrawChanged = SetOcc(
                Block.CatapultArms[I],
                ConstructRigidTransform([Cat.Pos[0] + PivotWorld[0], Cat.Pos[1] + PivotWorld[1], Cat.Pos[2] + PivotWorld[2]], QArm),
                true
            ) || DrawChanged;

            const RingXf = Cat.ShowRing
                ? ConstructRigidTransform([Cat.TargetPos[0], Cat.TargetPos[1], Cat.TargetPos[2] + 0.03], ConstructAxisQuaternion([0, 0, 1], this.Clock * 1.8))
                : Parked;
            DrawChanged = SetOcc(Block.TargetRings[I], RingXf, Cat.ShowRing) || DrawChanged;
        }

        // ② 6 Recoiling Old-School Candy Cannons
        for (let I = 0; I < this.Cannons.length; ++I)
        {
            const Can = this.Cannons[I];
            const Pos = [
                Can.BasePos[0] - Math.cos(Can.Yaw) * Can.Recoil,
                Can.BasePos[1] - Math.sin(Can.Yaw) * Can.Recoil,
                Can.BasePos[2]
            ];
            DrawChanged = SetOcc(Block.Cannons[I], ConstructRigidTransform(Pos, ConstructAxisQuaternion([0, 0, 1], Can.Yaw)), true) || DrawChanged;
        }

        // ③ 4 Swinging Jawbreaker Wrecking Pendulums!
        for (let I = 0; I < this.Pendulums.length; ++I)
        {
            const P  = this.Pendulums[I];
            const QP = ConstructAxisQuaternion([1, 0, 0], P.Angle);
            DrawChanged = SetOcc(Block.PendulumArms[I], ConstructRigidTransform(P.PivotPos, QP), true) || DrawChanged;
        }

        // ④ 4 Overhead Slamming Peppermint Crusher Hammers!
        for (let I = 0; I < this.Crushers.length; ++I)
        {
            const Cr = this.Crushers[I];
            const Xf = ConstructRigidTransform([Cr.Spec.Pos[0], Cr.Spec.Pos[1], Cr.GroundZ + Cr.LiftZ], [0, 0, 0, 1]);
            DrawChanged = SetOcc(Block.CrusherHeads[I], Xf, true) || DrawChanged;
        }

        // ⑤ 6 Rolling Giant Peppermint Pinwheel Boulders!
        for (let I = 0; I < this.Pinwheels.length; ++I)
        {
            const PW = this.Pinwheels[I];
            const Q  = MultiplyQuaternion(
                ConstructAxisQuaternion([0, 0, 1], Math.PI * 0.5),
                ConstructAxisQuaternion([1, 0, 0], PW.Spin * PW.DirY)
            );
            DrawChanged = SetOcc(Block.PinwheelDiscs[I], ConstructRigidTransform(PW.Pos, Q), true) || DrawChanged;
        }

        // ⑥ 8 Cola-Mentos Erupting Geyser Columns!
        for (let I = 0; I < this.Geysers.length; ++I)
        {
            const Gy  = this.Geysers[I];
            const Vis = Gy.Height > 0.05;
            const Z   = Gy.State === "erupting" ? Gy.Pos[2] : (Gy.Pos[2] - 6.8);
            const Xf  = Vis ? ConstructRigidTransform([Gy.Pos[0], Gy.Pos[1], Z], ConstructAxisQuaternion([0, 0, 1], this.Clock * 4.0)) : Parked;
            DrawChanged = SetOcc(Block.GeyserColumns[I], Xf, Vis) || DrawChanged;
        }

        // ⑦ Flaming Gummy Boulders, Jawbreakers & Sticky Puddles
        for (let I = 0; I < this.FlamingBalls.length; ++I)
        {
            const B  = this.FlamingBalls[I];
            const Xf = B.Active ? ConstructRigidTransform(B.Pos, ConstructAxisQuaternion([0, 1, 0], B.Spin)) : Parked;
            DrawChanged = SetOcc(Block.FlamingBalls[I], Xf, B.Active) || DrawChanged;
        }
        for (let I = 0; I < this.Jawbreakers.length; ++I)
        {
            const J  = this.Jawbreakers[I];
            const Xf = J.Active ? ConstructRigidTransform(J.Pos, ConstructAxisQuaternion([0, 1, 0], J.Spin)) : Parked;
            DrawChanged = SetOcc(Block.Jawbreakers[I], Xf, J.Active) || DrawChanged;
        }
        for (let I = 0; I < this.StickyPuddles.length; ++I)
        {
            const P  = this.StickyPuddles[I];
            const Xf = P.Active ? ConstructRigidTransform(P.Pos, [0, 0, 0, 1]) : Parked;
            DrawChanged = SetOcc(Block.StickyPuddles[I], Xf, P.Active) || DrawChanged;
        }

        if (DrawChanged)
            this.Scene.ConstructDrawRuns?.();
    }

    RenderHudOverlay(Ctx, W, H, Cam)
    {
        if (!this.Enabled)
            return;
        const Hud = this.Host.DrivingHud;
        const Car = this.Host.Vehicle;
        if (!Hud || !Car)
            return;

        // ① Draw live parabolic trajectory preview arcs for incoming ballistic Flaming Gummy Boulders!
        Ctx.save();
        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active || Ball.State !== "ballistic" || Ball.Bounces > 0)
                continue;
            Ctx.strokeStyle = "rgba(255, 146, 52, 0.72)";
            Ctx.lineWidth   = 2.0;
            Ctx.setLineDash([5, 5]);
            Ctx.beginPath();
            let Started = false;
            const RemT = Math.max(0.15, Ball.FlightTime - Ball.Elapsed);
            for (let S = 0; S <= 10; ++S)
            {
                const T  = (S / 10) * RemT;
                const PX = Ball.Pos[0] + Ball.Vel[0] * T;
                const PY = Ball.Pos[1] + Ball.Vel[1] * T;
                const PZ = Ball.Pos[2] + Ball.Vel[2] * T - 0.5 * CatapultGravity * T * T;
                const SP = Hud.ProjectWorld([PX, PY, PZ], W, H, Cam);
                if (!SP)
                    continue;
                if (!Started) { Ctx.moveTo(SP[0], SP[1]); Started = true; }
                else Ctx.lineTo(SP[0], SP[1]);
            }
            if (Started)
                Ctx.stroke();
        }
        Ctx.restore();

        // ② Sweet-Gate Citadel Beacon
        const DistToGoal = Math.max(0, Math.round(CandyGoalX - Car.Position[0]));
        const GateZ      = QueryCandyTerrainHeight(188.0, 0.0);
        const GateScreen = Hud.ProjectWorld([188.0, 0.0, GateZ + 8.5], W, H, Cam);
        if (GateScreen)
        {
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
            Ctx.shadowBlur  = 8;
            Ctx.fillStyle   = "#ff9ed2";
            Ctx.font        = "800 12.5px 'DM Sans', system-ui, sans-serif";
            Ctx.textAlign   = "center";
            Ctx.fillText(`🏰 SWEET-GATE CITADEL (${DistToGoal}m)`, GateScreen[0], GateScreen[1]);
            Ctx.restore();
        }

        // ③ Nearby Skinned Jelly Worm Callouts
        for (const Worm of this.Worms)
        {
            const Mid = Worm.Spine[4];
            if (Math.hypot(Mid[0] - Car.Position[0], Mid[1] - Car.Position[1]) > 68.0)
                continue;
            const WP = Hud.ProjectWorld([Mid[0], Mid[1], Mid[2] + 1.9], W, H, Cam);
            if (WP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0,0,0,0.88)";
                Ctx.shadowBlur  = 6;
                Ctx.fillStyle   = "#7efcb8";
                Ctx.font        = "700 10.5px 'JetBrains Mono', monospace";
                Ctx.textAlign   = "center";
                Ctx.fillText("🪱 GIANT JELLY WORM", WP[0], WP[1]);
                Ctx.restore();
            }
        }

        // ④ Top Optical Header
        Ctx.save();
        Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
        Ctx.shadowBlur  = 7;
        Ctx.textAlign   = "center";
        Ctx.fillStyle   = this.Finished ? "#7efcb8" : "#ffd6ec";
        Ctx.font        = "800 15px 'DM Sans', system-ui, sans-serif";
        const Header    = this.Finished
            ? `🏆 SWEET-GATE BREACHED · ${this.RunTimer.toFixed(1)}s${this.BestRunSec !== null ? ` (BEST ${this.BestRunSec.toFixed(1)}s)` : ""}`
            : `🍬 CANDY GAUNTLET · ${DistToGoal}m TO SWEET-GATE · ${this.RunTimer.toFixed(1)}s`;
        Ctx.fillText(Header, W * 0.5, 24);

        let SurfaceState = "⚡ SUGAR COBBLES";
        if (this.InTaffySnare)              SurfaceState = "🍮 SALTWATER TAFFY SNARE — FULL THROTTLE TO RIP FREE!";
        else if (this.StickyTimer > 0.05)   SurfaceState = `🍯 STICKY JELLY DRAG (${this.StickyTimer.toFixed(1)}s — HIT 2.5D WATER TO WASH!)`;
        else if (this.WaterDepthNow > 0.05) SurfaceState = `🌊 2.5D REFRACTIVE LAGOON (DEPTH ${this.WaterDepthNow.toFixed(2)}m)`;

        Ctx.fillStyle = (this.InTaffySnare || this.StickyTimer > 0.05) ? "#ffb347" : (this.WaterDepthNow > 0.05 ? "#6be8ff" : "#9effc8");
        Ctx.font      = "700 12px 'JetBrains Mono', monospace";
        Ctx.fillText(`🍬 GLAZE ${Math.round(this.CandyCoatHp)}%   |   ${SurfaceState}`, W * 0.5, 42);

        if (this.BannerTimer > 0.0 && this.BannerMessage)
        {
            Ctx.fillStyle = "#fff4fa";
            Ctx.font      = "800 15px 'DM Sans', system-ui, sans-serif";
            Ctx.fillText(this.BannerMessage, W * 0.5, 70);
        }
        Ctx.restore();
    }

    Dispose()
    {
        if (this.ControlStrip)
            this.ControlStrip.remove();
    }
}
