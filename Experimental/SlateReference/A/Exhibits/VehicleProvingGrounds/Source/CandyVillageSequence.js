//============================================================================================================================================
//                                                      CANDYVILLAGESEQUENCE.JS
//============================================================================================================================================
// 🍬 Candy Village · Sugar Siege ("candy") Real-Time 2.5D Shallow-Water & Confectionery Siege Simulation:
//    • Real-Time 2.5D Saint-Venant Shallow-Water Equation (SWE) Fluid Solver (96 × 48 grid = 27,648 live-streamed vertices):
//      - Solves ∂h/∂t + ∇·(h u) = S and ∂u/∂t = -g ∇(B + h) - γ u + F_wake with wetting/drying shorelines & smooth normals!
//      - Two-way coupled: Car, breaching Gummy-Bear Worms, Flaming Gummy Balls & Jawbreaker Cannonballs carve real 2.5D
//        Kelvin wakes & circular tsunami splash rings; dynamic water depth h(x,y) + wave current (u,v) apply physical
//        hydrodynamic slowdown & lateral surge push — while splashing through fizzy water washes off sticky syrup!
//    • 4 Giant Multi-Segmented Gummy-Bear Worms (sculpted Gummy-Bear Head + 7 undulating translucent gummy body rings):
//      - Slither & breach out of the 2.5D lagoon/canals, boinging cars elastically & coating tires in Sticky Gummy Residue!
//    • 5 Articulated Gummy-Bear Catapults hurling Flaming Gummy Balls (3D Navier-Stokes fire trails + 1 gummy bounce ->
//      Sticky Molten Caramel-Fire Puddles that slow & sizzle cars!).
//    • 6 Recoiling Old-School Naval Candy Cannons firing fast skipping Jawbreaker Cannonballs!

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
    CandyGoalX,
    CandyGummyBumpers,
    CandySpawn,
    CandyWaterGridSpec,
    CandyWormPatrols,
    QueryCandyTerrainHeight
} from "./CandyVillageStructure.js";

export const CandyWaterVertexCapacity = CandyWaterGridSpec.NX * CandyWaterGridSpec.NY * 6; // 27,648 vertices

function AngleDelta(From, To)
{
    let D = (To - From) % (Math.PI * 2.0);
    if (D >  Math.PI) D -= Math.PI * 2.0;
    if (D < -Math.PI) D += Math.PI * 2.0;
    return D;
}

//------------------------------------------------------------------------------------------------------------------------
//                      REAL-TIME 2.5D SAINT-VENANT SHALLOW-WATER EQUATION (SWE) SOLVER
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

        // Pre-allocated interleaved GPU vertex buffer (8 × 4B = 32B per vertex)
        this.VertexCount = CandyWaterVertexCapacity;
        const RawBytes   = new ArrayBuffer(this.VertexCount * VertexStride);
        this.VertexF32   = new Float32Array(RawBytes);
        this.VertexU32   = new Uint32Array(RawBytes);

        this.WaveEnergy = 0.0;
        this.Reset();
    }

    Reset()
    {
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
                this.Depth[Idx] = H0;
                this.NextH[Idx] = H0;
                this.VelU[Idx]  = 0.0;
                this.VelV[Idx]  = 0.0;
                this.Foam[Idx]  = 0.0;
            }
        }
        this.RebuildMeshVertices();
    }

    // Injects a radial 2.5D crater/splash or directional wake into (Depth, VelU, VelV, Foam)!
    InjectDisturbance(WorldX, WorldY, Radius, DepthDelta, ImpulseU = 0.0, ImpulseV = 0.0, FoamBoost = 0.75)
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
                const Y   = this.YMin + IY * this.DY;
                const R   = Math.hypot(X - WorldX, Y - WorldY);
                if (R >= Radius)
                    continue;
                const Idx = IX * this.Stride + IY;
                if (this.RestH[Idx] <= 0.01 && this.Depth[Idx] <= 0.01)
                    continue;
                TouchedWet = true;
                const W = 0.5 * (1.0 + Math.cos(Math.PI * R / Radius));
                // Radial splash ring: depress center slightly and push radial outward momentum!
                const RadDirX = R > 0.15 ? (X - WorldX) / R : 0.0;
                const RadDirY = R > 0.15 ? (Y - WorldY) / R : 0.0;
                const RingWave = DepthDelta * Math.cos(Math.PI * 0.85 * R / Radius);
                this.Depth[Idx] = ClampScalar(this.Depth[Idx] + RingWave * W, 0.0, 2.85);
                this.VelU[Idx]  = ClampScalar(this.VelU[Idx] + (ImpulseU + RadDirX * Math.abs(DepthDelta) * 5.2) * W, -13.0, 13.0);
                this.VelV[Idx]  = ClampScalar(this.VelV[Idx] + (ImpulseV + RadDirY * Math.abs(DepthDelta) * 5.2) * W, -13.0, 13.0);
                this.Foam[Idx]  = Math.min(1.0, this.Foam[Idx] + FoamBoost * W);
            }
        }
        return TouchedWet;
    }

    // Launches a real 2.5D Dam-Break / Sluice-Gate Tidal Soda Surge down the lagoon & canals!
    TriggerTidalSurge(FromNorth = true)
    {
        const TargetIY = FromNorth ? (this.NY - 3) : 3;
        const FlowSign = FromNorth ? -1.0 : 1.0;
        for (let IX = 2; IX < this.NX - 1; ++IX)
        {
            for (let Off = -2; Off <= 2; ++Off)
            {
                const IY  = TargetIY + Off;
                const Idx = IX * this.Stride + IY;
                if (this.RestH[Idx] > 0.12)
                {
                    this.Depth[Idx] = Math.min(2.65, this.Depth[Idx] + 0.82);
                    this.VelV[Idx]  = FlowSign * 6.8;
                    this.Foam[Idx]  = 1.0;
                }
            }
        }
    }

    // Bilinear sample of dynamic 2.5D water state { Depth, SurfaceZ, U, V } at world (X, Y)
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
        return {
            Depth:    D,
            SurfaceZ: B + D,
            U:        Bilerp(this.VelU),
            V:        Bilerp(this.VelV)
        };
    }

    Advance(FrameStep)
    {
        const SubSteps = 3;
        const Dt       = Math.min(FrameStep, 0.04) / SubSteps;
        const G        = 9.81;
        const InvDX    = 1.0 / this.DX;
        const InvDY    = 1.0 / this.DY;
        const Damping  = Math.exp(-0.48 * Dt);
        const S        = this.Stride;

        for (let Sub = 0; Sub < SubSteps; ++Sub)
        {
            // ① 2.5D Shallow-Water Momentum Update: ∂u/∂t = -g ∂(B+h)/∂x - γu, ∂v/∂t = -g ∂(B+h)/∂y - γv
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

                    this.VelU[Idx] = ClampScalar((this.VelU[Idx] - G * DEtaDX * Dt) * Damping, -13.0, 13.0);
                    this.VelV[Idx] = ClampScalar((this.VelV[Idx] - G * DEtaDY * Dt) * Damping, -13.0, 13.0);
                }
            }

            // ② 2.5D Mass Continuity Update: ∂h/∂t + ∂(hu)/∂x + ∂(hv)/∂y = 0 (first-order upwind depth flux -> positivity-preserving!)
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
                    let NewH  = ClampScalar(this.Depth[Idx] - Dt * Div, 0.0, 2.95);

                    // Gentle sponge boundary relaxation at far Y inflow/outflow edges so channels stay filled at RestSurfaceZ
                    if (IY <= 2 || IY >= this.NY - 2)
                        NewH += (this.RestH[Idx] - NewH) * (3.2 * Dt);
                    else if (this.RestH[Idx] > 0.05)
                        NewH += (this.RestH[Idx] - NewH) * (0.22 * Dt);

                    this.NextH[Idx] = NewH;
                }
            }

            this.Depth.set(this.NextH);
        }

        // ③ Foam Decay & Generation from Breaking Wave Speed + Surface Elevation & Smooth Gradient Normals!
        let TotalEnergy = 0.0;
        const FoamDecay = Math.exp(-1.45 * FrameStep);
        for (let IX = 0; IX <= this.NX; ++IX)
        {
            const Row = IX * S;
            for (let IY = 0; IY <= this.NY; ++IY)
            {
                const Idx = Row + IY;
                const H   = this.Depth[Idx];
                const Spd = Math.hypot(this.VelU[Idx], this.VelV[Idx]);
                TotalEnergy += Spd * H;
                this.Foam[Idx] = Math.min(1.0, this.Foam[Idx] * FoamDecay + (Spd > 2.2 ? (Spd - 2.2) * FrameStep * 1.4 : 0.0));
                // Wetting/drying surface height: dry bank cells tuck 0.14 m under dry ground mesh!
                this.SurfaceZ[Idx] = H > 0.022 ? (this.Bed[Idx] + H) : (this.Bed[Idx] - 0.14);
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

                const MaxH = Math.max(this.Depth[I00], this.Depth[I10], this.Depth[I11], this.Depth[I01]);
                const AvgFoam = 0.25 * (this.Foam[I00] + this.Foam[I10] + this.Foam[I11] + this.Foam[I01]);

                // Sparkling BerrySodaWater in Lagoon & Moat, Golden Caramel-Swirl in Mid Canal, Whipped Foam on crests & shorelines!
                let Mat = (X0 > 5.0 && X0 < 60.0) ? CourseMaterial.CaramelSyrup : CourseMaterial.BerrySodaWater;
                if (AvgFoam > 0.42 || (MaxH > 0.025 && MaxH < 0.13))
                    Mat = CourseMaterial.FrostingCream;

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
        this.StickyTimer   = 0.0;   // Viscous Gummy/Caramel tire slowdown timer (washed off by 2.5D Fizzy Water!)
        this.WaterDepthNow = 0.0;   // Live 2.5D shallow-water depth at car [m]
        this.SurgeTimer    = 5.5;
        this.SplashTimer   = 0.0;
        this.BannerMessage = "";
        this.BannerTimer   = 0.0;

        this.Water         = this.Enabled ? new CandyWaterSolver() : null;
        this.Worms         = [];
        this.Catapults     = [];
        this.Cannons       = [];
        this.FlamingBalls  = [];
        this.Jawbreakers   = [];
        this.StickyPuddles = [];

        this.Stats = {
            WormBoings:        0,
            GummyBumperHits:   0,
            CatapultShots:     0,
            CannonShots:       0,
            PuddlesCreated:    0,
            SurgesTriggered:   0,
            FizzWashes:        0,
            Finishes:          0
        };

        if (this.Enabled)
        {
            this.InitializeVillage();
            this.MountQuickControls();
            this.BannerMessage = "🍬 CANDY VILLAGE — SMASH SUGAR-GLASS, BANK OFF GUMMY PADS & SPLASH THE 2.5D LAGOON TO WASH OFF SYRUP!";
            this.BannerTimer   = 5.2;
        }
    }

    InitializeVillage()
    {
        this.Water.Reset();

        // ① 4 Giant 8-Segment Gummy-Bear Worms!
        this.Worms = CandyWormPatrols.map((Spec, WI) => ({
            Index:    WI,
            Spec,
            Phase:    Spec.Phase,
            Segments: Array.from({ length: 8 }, () => ({ Pos: [Spec.Center[0], Spec.Center[1], 2.0], Yaw: 0.0, Pitch: 0.0, WasSubmerged: false }))
        }));

        // ② 5 Articulated Gummy-Bear Catapults (winding back & snapping forward to hurl Flaming Gummy Balls!)
        this.Catapults = CandyCatapultSites.map((Site, I) =>
        {
            const GZ = QueryCandyTerrainHeight(Site.Pos[0], Site.Pos[1]);
            return {
                Index:    I,
                Pos:      [Site.Pos[0], Site.Pos[1], GZ],
                Yaw:      Site.Yaw,
                ArmPitch: 0.25,     // radians: -0.22 cocked down -> +1.15 snapped forward!
                State:    "winding",// "winding" | "ready" | "recover"
                Timer:    0.55 * I
            };
        });

        // ③ 6 Wheeled Old-School Candy Cannons (slewing + physical carriage recoil!)
        this.Cannons = CandyCannonSites.map((Site, I) =>
        {
            const GZ = QueryCandyTerrainHeight(Site.Pos[0], Site.Pos[1]);
            return {
                Index:    I,
                BasePos:  [Site.Pos[0], Site.Pos[1], GZ],
                Yaw:      Site.Yaw,
                Recoil:   0.0,
                Cooldown: 0.65 + I * 0.48
            };
        });

        const Block = this.Scene.CandyBlock;
        this.FlamingBalls  = Array.from({ length: Block.FlamingBalls.length },  () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Bounces: 0, Spin: 0 }));
        this.Jawbreakers   = Array.from({ length: Block.Jawbreakers.length },   () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Bounces: 0, Spin: 0 }));
        this.StickyPuddles = Array.from({ length: Block.StickyPuddles.length }, () => ({ Active: false, Pos: [0, 0, -200], Age: 0, Duration: 6.5 }));

        this.AdvanceWorms(0.016, false);
        this.SyncGpuOccupants(true);
        this.PushWaterMeshToGpu(true);
    }

    RestartRun()
    {
        if (!this.Enabled)
            return;
        this.RunTimer    = 0.0;
        this.Finished    = false;
        this.CandyCoatHp = 100.0;
        this.StickyTimer = 0.0;
        const GZ = QueryCandyTerrainHeight(CandySpawn.Position[0], CandySpawn.Position[1]);
        this.Host.Vehicle.Respawn([CandySpawn.Position[0], CandySpawn.Position[1], GZ + 0.63], CandySpawn.Yaw);
        this.InitializeVillage();
        this.BannerMessage = "🍬 FRESH SUGAR SIEGE RUN — WATCH FOR BREACHING GUMMY WORMS & TIDAL SODA SURGES!";
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

        MakePill("🔄 NEW SUGAR RUN",    "rgba(255, 132, 188, 0.72)", () => this.RestartRun());
        MakePill("🌊 2.5D SODA SURGE",  "rgba(88, 232, 255, 0.75)",  () =>
        {
            this.Water.TriggerTidalSurge((this.Stats.SurgesTriggered & 1) === 0);
            this.Stats.SurgesTriggered++;
            this.BannerMessage = "🌊 2.5D TIDAL SODA SURGE RELEASED — WATCH THE RISING WAVE CURRENT!";
            this.BannerTimer   = 2.6;
        });
        MakePill("🔥 CATAPULT SALVO",   "rgba(255, 168, 72, 0.75)",  () => this.TriggerCatapultSalvo());
        MakePill("🧼 FIZZ WASH +100%",  "rgba(120, 248, 190, 0.72)", () =>
        {
            this.StickyTimer = 0.0;
            this.CandyCoatHp = 100.0;
            this.BannerMessage = "🧼 TIRES CLEANSED OF STICKY SYRUP & SUGAR-GLAZE RESTORED!";
            this.BannerTimer   = 2.2;
        });

        HostBar.appendChild(Wrap);
        this.ControlStrip = Wrap;
    }

    PushWaterMeshToGpu(FirstUpload = false)
    {
        const WBlock = this.Scene?.CandyWaterBlock;
        if (!WBlock || !this.Water)
            return;
        const Set = this.Scene.FacetSets[WBlock.FacetSet];
        const Occ = this.Scene.Occupants[WBlock.Occupant];
        if (!Set || !Occ)
            return;

        Set.Vertices    = this.Water.VertexF32;
        Set.VertexCount = this.Water.VertexCount;
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
                this.Water.VertexF32.buffer,
                this.Water.VertexF32.byteOffset,
                this.Water.VertexCount * VertexStride
            );
            if (FirstUpload && this.Host)
                this.Host.PriorValid = false;
        }
    }

    TriggerCatapultSalvo()
    {
        const Car = this.Host?.Vehicle;
        if (!Car)
            return 0;
        let Launched = 0;
        for (const Cat of this.Catapults)
        {
            if (this.LaunchFlamingGummyBall(Cat, Car))
            {
                Cat.ArmPitch = 1.15;
                Cat.State    = "recover";
                Cat.Timer    = 0.9;
                Launched++;
            }
        }
        return Launched;
    }

    LaunchFlamingGummyBall(Cat, Car)
    {
        const Ball = this.FlamingBalls.find((B) => !B.Active);
        if (!Ball)
            return false;

        // Release point at tip of snapped catapult spoon (+3.6 m up)
        const StartX = Cat.Pos[0] + Math.cos(Cat.Yaw) * 1.2;
        const StartY = Cat.Pos[1] + Math.sin(Cat.Yaw) * 1.2;
        const StartZ = Cat.Pos[2] + 3.85;

        const LeadT  = 1.35;
        const AimX   = ClampScalar(Car.Position[0] + Car.LinearVelocity[0] * 0.85 + Math.sin(this.Clock * 3.1 + Cat.Index) * 5.0, -185.0, 182.0);
        const AimY   = ClampScalar(Car.Position[1] + Car.LinearVelocity[1] * 0.65 + Math.cos(this.Clock * 2.3 + Cat.Index) * 4.5, -26.0, 26.0);
        const DestZ  = QueryCandyTerrainHeight(AimX, AimY) + 0.65;
        const G      = 15.0;

        Ball.Active  = true;
        Ball.Bounces = 0;
        Ball.Spin    = 0.0;
        Ball.Pos     = [StartX, StartY, StartZ];
        Ball.Vel     = [
            (AimX - StartX) / LeadT,
            (AimY - StartY) / LeadT,
            (DestZ - StartZ) / LeadT + 0.5 * G * LeadT
        ];
        this.Stats.CatapultShots++;

        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [StartX, StartY, StartZ],
            Radius:   0.55,
            Velocity: [Ball.Vel[0] * 0.15, Ball.Vel[1] * 0.15, 3.2],
            Smoke:    18.0, Heat: 45.0, Flame: 48.0, Soot: 14.0, Seconds: 0.35
        });
        return true;
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
        const FlightT = ClampScalar(Dist / 52.0, 0.42, 1.35);
        const AimX    = Car.Position[0] + Car.LinearVelocity[0] * (FlightT * 0.55);
        const AimY    = Car.Position[1] + Car.LinearVelocity[1] * (FlightT * 0.55);
        const DestZ   = QueryCandyTerrainHeight(AimX, AimY) + 0.48;
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
        Cannon.Recoil = 0.58; // Crisp physical naval carriage recoil!
        this.Stats.CannonShots++;

        // Powdered-sugar white smoke + muzzle flash boom!
        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [MuzzleX, MuzzleY, MuzzleZ],
            Radius:   0.52,
            Velocity: [Math.cos(Cannon.Yaw) * 10.5, Math.sin(Cannon.Yaw) * 10.5, 1.8],
            Smoke:    28.0, Heat: 36.0, Flame: 32.0, Soot: 6.0, Seconds: 0.34
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
        Slot.Duration = 6.5;
        this.Stats.PuddlesCreated++;
    }

    AdvanceWorms(Step, InjectWaterWaves = true)
    {
        const Car = this.Host?.Vehicle;
        for (const W of this.Worms)
        {
            const S = W.Spec;
            W.Phase += S.Speed * Step;

            for (let K = 0; K < W.Segments.length; ++K)
            {
                const Seg      = W.Segments[K];
                const LagPhase = W.Phase - K * 0.24;
                // Lissajous figure-8 slither path + vertical sea-serpent breach wave!
                const WX = S.Center[0] + Math.cos(LagPhase) * S.RadiusX;
                const WY = S.Center[1] + Math.sin(LagPhase * 2.0) * S.RadiusY * 0.65;
                const DX = -Math.sin(LagPhase) * S.RadiusX;
                const DY =  2.0 * Math.cos(LagPhase * 2.0) * S.RadiusY * 0.65;

                const GroundZ   = QueryCandyTerrainHeight(WX, WY);
                const WaterSamp = this.Water.Sample(WX, WY);
                const BaseZ     = WaterSamp.Depth > 0.15 ? (WaterSamp.SurfaceZ - 0.55) : GroundZ;
                const ArchLift  = Math.max(-0.35, Math.sin(W.Phase * 2.6 - K * 0.58) * 1.25);

                Seg.Pos   = [WX, WY, Math.max(GroundZ - 0.25, BaseZ + ArchLift)];
                Seg.Yaw   = Math.atan2(DY, DX);
                Seg.Pitch = ClampScalar(-Math.cos(W.Phase * 2.6 - K * 0.58) * 0.42, -0.55, 0.55);

                // Inject real 2.5D waves when the Gummy-Bear Worm head/body breaches or dives into the lagoon!
                const IsSubmerged = WaterSamp.Depth > 0.20 && Seg.Pos[2] < WaterSamp.SurfaceZ + 0.25;
                if (InjectWaterWaves && K <= 2 && IsSubmerged !== Seg.WasSubmerged)
                    this.Water.InjectDisturbance(WX, WY, 4.2, IsSubmerged ? -0.32 : 0.34, DX * 0.12, DY * 0.12, 0.75);
                Seg.WasSubmerged = IsSubmerged;

                // Elastic Squishy Bounce + Sticky Gummy Tire Residue if Car hits a Gummy-Bear Worm!
                if (Car && Math.hypot(Car.Position[0] - WX, Car.Position[1] - WY) < 2.65 && Math.abs(Car.Position[2] - Seg.Pos[2]) < 1.95)
                {
                    const OutX = Car.Position[0] - WX, OutY = Car.Position[1] - WY;
                    const OutL = Math.hypot(OutX, OutY) || 1.0;
                    const NX = OutX / OutL, NY = OutY / OutL;
                    Car.Position[0] = WX + NX * 2.75;
                    Car.Position[1] = WY + NY * 2.75;
                    const VDotN = Car.LinearVelocity[0] * NX + Car.LinearVelocity[1] * NY;
                    if (VDotN < 5.0)
                    {
                        Car.LinearVelocity[0] += (6.8 - VDotN * 1.45) * NX;
                        Car.LinearVelocity[1] += (6.8 - VDotN * 1.45) * NY;
                        Car.LinearVelocity[2]  = Math.max(Car.LinearVelocity[2], 2.4);
                    }
                    if (this.WaterDepthNow < 0.18)
                        this.StickyTimer = Math.max(this.StickyTimer, 3.0);
                    this.Stats.WormBoings++;
                    this.BannerMessage = this.WaterDepthNow < 0.18
                        ? "🐛 BOINGED BY GIANT GUMMY-BEAR WORM — TIRES STICKY! SPLASH LAGOON WATER TO WASH CLEAN!"
                        : "🐛 BOINGED BY LAGOON GUMMY-BEAR WORM!";
                    this.BannerTimer   = 2.6;
                }
            }
        }
    }

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

        // Victory Check at the Grand Gingerbread Citadel Sweet-Gate (X >= +186 m, |Y| <= 9.0 m)
        if (!this.Finished && Car.Position[0] >= CandyGoalX && Math.abs(Car.Position[1]) <= 9.0)
        {
            this.Finished = true;
            this.Stats.Finishes++;
            if (this.BestRunSec === null || this.RunTimer < this.BestRunSec)
                this.BestRunSec = this.RunTimer;
            this.BannerMessage = `🏆 GRAND CITADEL SWEET-GATE BREACHED IN ${this.RunTimer.toFixed(1)}s!`;
            this.BannerTimer   = 7.0;
        }

        // ① Periodic 2.5D Dam-Break Tidal Soda Surges!
        this.SurgeTimer -= Step;
        if (this.SurgeTimer <= 0.0)
        {
            this.Water.TriggerTidalSurge((this.Stats.SurgesTriggered & 1) === 0);
            this.Stats.SurgesTriggered++;
            this.SurgeTimer = 9.2;
        }

        // ② Two-Way Car <-> 2.5D Shallow-Water Hydrodynamics (Slowdown + Wave Current Push + Kelvin Bow Wake + Fizz Wash!)
        const WSamp = this.Water.Sample(Car.Position[0], Car.Position[1]);
        const OnHighBridge = Car.Position[2] > WSamp.SurfaceZ + 0.62;
        this.WaterDepthNow = (!OnHighBridge && WSamp.Depth > 0.04) ? WSamp.Depth : 0.0;

        if (this.WaterDepthNow > 0.04)
        {
            // Wash off Sticky Gummy/Caramel tire residue when splashing through clean 2.5D Fizzy Soda Water!
            if (this.StickyTimer > 0.05)
            {
                this.StickyTimer = 0.0;
                this.Stats.FizzWashes++;
                this.BannerMessage = "🫧 FIZZY LAGOON WASHED STICKY SYRUP OFF YOUR TIRES!";
                this.BannerTimer   = 2.0;
            }

            // Physical Hydrodynamic Drag + 2.5D Wave Current Push (u, v)!
            const SubDepth = ClampScalar(this.WaterDepthNow, 0.0, 1.35);
            const RelVX    = Car.LinearVelocity[0] - WSamp.U;
            const RelVY    = Car.LinearVelocity[1] - WSamp.V;
            const RelSpd   = Math.hypot(RelVX, RelVY);
            const DragRate = (0.55 + 0.11 * RelSpd) * SubDepth;
            const DragMul  = Math.exp(-DragRate * Step);
            Car.LinearVelocity[0] = WSamp.U + RelVX * DragMul;
            Car.LinearVelocity[1] = WSamp.V + RelVY * DragMul;

            // Carve real 2.5D Kelvin Bow-Wave Wake into the Shallow-Water Solver!
            const CarSpd = Math.hypot(Car.LinearVelocity[0], Car.LinearVelocity[1]);
            if (CarSpd > 1.2)
            {
                this.Water.InjectDisturbance(
                    Car.Position[0] + Car.LinearVelocity[0] * 0.12,
                    Car.Position[1] + Car.LinearVelocity[1] * 0.12,
                    3.8,
                    -0.16 * ClampScalar(CarSpd / 18.0, 0.2, 1.2),
                    Car.LinearVelocity[0] * 0.32,
                    Car.LinearVelocity[1] * 0.32,
                    0.55
                );
                this.SplashTimer -= Step;
                if (this.SplashTimer <= 0.0 && CarSpd > 5.5)
                {
                    this.SplashTimer = 0.16;
                    this.Host?.Sparks?.Emit?.([
                        { Point: [Car.Position[0], Car.Position[1] - 0.9, WSamp.SurfaceZ + 0.15], Velocity: [-Car.LinearVelocity[0] * 0.2, -3.2, 3.8], Normal: [0, 0, 1], Strength: 1.6, Rim: null },
                        { Point: [Car.Position[0], Car.Position[1] + 0.9, WSamp.SurfaceZ + 0.15], Velocity: [-Car.LinearVelocity[0] * 0.2,  3.2, 3.8], Normal: [0, 0, 1], Strength: 1.6, Rim: null }
                    ], 1.0 / 60.0);
                }
            }
        }

        // ③ Viscous Sticky Syrup / Gummy Slowdown Mechanic (from Gummy Worms or Molten Flaming Gummy Puddles!)
        for (const P of this.StickyPuddles)
        {
            if (!P.Active)
                continue;
            P.Age += Step;
            if (P.Age >= P.Duration)
            {
                P.Active = false;
                continue;
            }
            if (Math.hypot(Car.Position[0] - P.Pos[0], Car.Position[1] - P.Pos[1]) < 3.65 && Math.abs(Car.Position[2] - P.Pos[2]) < 1.5)
            {
                this.StickyTimer = Math.max(this.StickyTimer, 3.2);
                this.CandyCoatHp = Math.max(10.0, this.CandyCoatHp - 6.5 * Step);
            }
        }

        if (this.StickyTimer > 0.0)
        {
            this.StickyTimer = Math.max(0.0, this.StickyTimer - Step);
            // Viscous syrup rolling resistance slows car down noticeably (like D-Day barbed wire / craters) without freezing steering!
            const SyrupDrag = Math.exp(-1.28 * Step);
            Car.LinearVelocity[0] *= SyrupDrag;
            Car.LinearVelocity[1] *= SyrupDrag;
        }

        // ④ Elastic Gummy Pinball Corner Bumpers (ricochet around hairpins at full speed!)
        for (const B of CandyGummyBumpers)
        {
            const DX = Car.Position[0] - B.Pos[0], DY = Car.Position[1] - B.Pos[1];
            const Dist = Math.hypot(DX, DY);
            const HitR = B.Radius + 1.15;
            if (Dist < HitR && Dist > 1.0e-3)
            {
                const GroundB = QueryCandyTerrainHeight(B.Pos[0], B.Pos[1]);
                if (Car.Position[2] < GroundB + 2.4)
                {
                    const NX = DX / Dist, NY = DY / Dist;
                    Car.Position[0] = B.Pos[0] + NX * (HitR + 0.06);
                    Car.Position[1] = B.Pos[1] + NY * (HitR + 0.06);
                    const VDotN = Car.LinearVelocity[0] * NX + Car.LinearVelocity[1] * NY;
                    if (VDotN < 2.0)
                    {
                        const Bounce = Math.max(8.5, -VDotN * 0.88 + 4.2);
                        Car.LinearVelocity[0] += (Bounce - VDotN) * NX;
                        Car.LinearVelocity[1] += (Bounce - VDotN) * NY;
                        this.Stats.GummyBumperHits++;
                    }
                }
            }
        }

        // ⑤ Advance the 4 Giant Undulating Gummy-Bear Worms!
        this.AdvanceWorms(Step, true);

        // ⑥ Advance the 5 Articulated Gummy-Bear Catapults & Flaming Gummy Balls!
        for (const Cat of this.Catapults)
        {
            const DesiredYaw = Math.atan2(Car.Position[1] - Cat.Pos[1], Car.Position[0] - Cat.Pos[0]);
            Cat.Yaw += ClampScalar(AngleDelta(Cat.Yaw, DesiredYaw), -1.2 * Step, 1.2 * Step);

            if (Cat.State === "winding")
            {
                Cat.ArmPitch = Math.max(-0.22, Cat.ArmPitch - 0.68 * Step);
                if (Cat.ArmPitch <= -0.21)
                {
                    Cat.State = "ready";
                    Cat.Timer = 0.30;
                }
            }
            else if (Cat.State === "ready")
            {
                Cat.Timer -= Step;
                const Range = Math.hypot(Car.Position[0] - Cat.Pos[0], Car.Position[1] - Cat.Pos[1]);
                if (Cat.Timer <= 0.0 && Range < 165.0)
                {
                    this.LaunchFlamingGummyBall(Cat, Car);
                    Cat.ArmPitch = 1.18; // SNAP throwing spoon upward!
                    Cat.State    = "recover";
                    Cat.Timer    = 0.85;
                }
            }
            else
            {
                Cat.Timer -= Step;
                if (Cat.Timer <= 0.0)
                    Cat.State = "winding";
            }
        }

        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active)
                continue;
            Ball.Pos[0] += Ball.Vel[0] * Step;
            Ball.Pos[1] += Ball.Vel[1] * Step;
            Ball.Pos[2] += Ball.Vel[2] * Step;
            Ball.Vel[2] -= 15.0 * Step;
            Ball.Spin   += 7.5 * Step;

            const WS = this.Water.Sample(Ball.Pos[0], Ball.Pos[1]);
            if (WS.Depth > 0.16 && Ball.Pos[2] <= WS.SurfaceZ + 0.35)
            {
                // Flaming Gummy Ball splashes into the 2.5D Lagoon -> huge concentric tsunami ring + steam/fizz plume!
                Ball.Active = false;
                this.Water.InjectDisturbance(Ball.Pos[0], Ball.Pos[1], 6.8, -0.68, Ball.Vel[0] * 0.15, Ball.Vel[1] * 0.15, 1.0);
                this.Host?.Smoke?.Sources?.QueueBurst?.({
                    Position: [Ball.Pos[0], Ball.Pos[1], WS.SurfaceZ + 0.3],
                    Radius:   0.85, Velocity: [0, 0, 5.8],
                    Smoke:    38.0, Heat: 32.0, Flame: 18.0, Soot: 6.0, Seconds: 0.72
                });
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.55);
                continue;
            }

            const TerrZ = QueryCandyTerrainHeight(Ball.Pos[0], Ball.Pos[1]);
            if (Ball.Pos[2] <= TerrZ + 0.62)
            {
                if (Ball.Bounces < 1)
                {
                    // First impact: squishy flaming gummy bounce!
                    Ball.Bounces++;
                    Ball.Pos[2]  = TerrZ + 0.64;
                    Ball.Vel[0] *= 0.62;
                    Ball.Vel[1] *= 0.62;
                    Ball.Vel[2]  = Math.max(5.8, Math.abs(Ball.Vel[2]) * 0.52);
                    this.Host?.Sparks?.Emit?.([
                        { Point: [...Ball.Pos], Velocity: [Ball.Vel[0] * 0.3, Ball.Vel[1] * 0.3, 4.2], Normal: [0, 0, 1], Strength: 2.5, Rim: null }
                    ], 1.0 / 60.0);
                }
                else
                {
                    // Second impact: bursts into a Sticky Molten Caramel-Fire Puddle + 216-chunk gummy burst!
                    Ball.Active = false;
                    this.SpawnStickyPuddle(Ball.Pos[0], Ball.Pos[1], TerrZ);
                    this.Host?.Smoke?.Sources?.QueueBurst?.({
                        Position: [Ball.Pos[0], Ball.Pos[1], TerrZ + 0.35],
                        Radius:   0.78, Velocity: [0, 0, 5.2],
                        Smoke:    28.0, Heat: 56.0, Flame: 52.0, Soot: 26.0, Seconds: 0.65
                    });
                    this.Host?.Effects?.BurstTyre?.(
                        ConstructRigidTransform([Ball.Pos[0], Ball.Pos[1], TerrZ + 0.35], [0, 0, 0, 1]),
                        [0.75, 0.75, 0.45], [0, 0, 4.5], CourseMaterial.GummyOrange
                    );
                    this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.65);

                    const DCar = Math.hypot(Car.Position[0] - Ball.Pos[0], Car.Position[1] - Ball.Pos[1]);
                    if (DCar < 6.5)
                    {
                        this.StickyTimer = Math.max(this.StickyTimer, 3.2);
                        Car.AngularVelocity[0] += 0.55;
                        this.CandyCoatHp = Math.max(0.0, this.CandyCoatHp - 14.0 * (1.0 - DCar / 6.5));
                    }
                }
            }
        }

        // ⑦ Advance the 6 Recoiling Old-School Candy Cannons & Skipping Jawbreaker Cannonballs!
        for (const Can of this.Cannons)
        {
            Can.Recoil *= Math.exp(-4.8 * Step);
            const DesiredYaw = Math.atan2(Car.Position[1] - Can.BasePos[1], Car.Position[0] - Can.BasePos[0]);
            Can.Yaw += ClampScalar(AngleDelta(Can.Yaw, DesiredYaw), -1.65 * Step, 1.65 * Step);
            Can.Cooldown -= Step;
            const Range = Math.hypot(Car.Position[0] - Can.BasePos[0], Car.Position[1] - Can.BasePos[1]);
            if (Can.Cooldown <= 0.0 && Range > 14.0 && Range < 155.0 && Math.abs(AngleDelta(Can.Yaw, DesiredYaw)) < 0.45)
            {
                this.FireOldSchoolCandyCannon(Can, Car);
                Can.Cooldown = 2.65 + (Can.Index % 3) * 0.55;
            }
        }

        for (const J of this.Jawbreakers)
        {
            if (!J.Active)
                continue;
            J.Pos[0] += J.Vel[0] * Step;
            J.Pos[1] += J.Vel[1] * Step;
            J.Pos[2] += J.Vel[2] * Step;
            J.Vel[2] -= 14.5 * Step;
            J.Spin   += 11.0 * Step;

            // Direct or glancing Jawbreaker hit rocks & nudges the car!
            if (Math.hypot(Car.Position[0] - J.Pos[0], Car.Position[1] - J.Pos[1]) < 2.25 && Math.abs(Car.Position[2] - J.Pos[2]) < 1.35)
            {
                J.Active = false;
                Car.LinearVelocity[0]  += J.Vel[0] * 0.22;
                Car.LinearVelocity[1]  += J.Vel[1] * 0.22;
                Car.LinearVelocity[2]  += 2.8;
                Car.AngularVelocity[0] += 0.65;
                this.CandyCoatHp = Math.max(0.0, this.CandyCoatHp - 12.0);
                this.Host?.Effects?.BurstTyre?.(
                    ConstructRigidTransform([...J.Pos], [0, 0, 0, 1]),
                    [0.55, 0.55, 0.55], [0, 0, 4.0], CourseMaterial.PeppermintRed
                );
                this.BannerMessage = "💣 CLIPPED BY OLD-SCHOOL CANDY CANNON JAWBREAKER!";
                this.BannerTimer   = 2.1;
                continue;
            }

            const WS = this.Water.Sample(J.Pos[0], J.Pos[1]);
            if (WS.Depth > 0.16 && J.Pos[2] <= WS.SurfaceZ + 0.25)
            {
                J.Active = false;
                this.Water.InjectDisturbance(J.Pos[0], J.Pos[1], 5.2, -0.52, J.Vel[0] * 0.12, J.Vel[1] * 0.12, 0.9);
                continue;
            }

            const TerrZ = QueryCandyTerrainHeight(J.Pos[0], J.Pos[1]);
            if (J.Pos[2] <= TerrZ + 0.46)
            {
                if (J.Bounces < 2)
                {
                    // Old-school cannonball skips & rolls across village cobblestones!
                    J.Bounces++;
                    J.Pos[2]  = TerrZ + 0.48;
                    J.Vel[0] *= 0.76;
                    J.Vel[1] *= 0.76;
                    J.Vel[2]  = Math.max(3.4, Math.abs(J.Vel[2]) * 0.46);
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

        // ⑧ Step the 2.5D Saint-Venant Shallow-Water Solver & Stream Updated Smooth Fluid Mesh to WebGPU!
        this.Water.Advance(Step);
        this.PushWaterMeshToGpu(false);
        this.SyncGpuOccupants(false);
        return true;
    }

    QueryPlumeEmissions()
    {
        if (!this.Enabled)
            return [];
        const Out = [];

        // Airborne Flaming Gummy Balls trail real 3D Navier-Stokes fire & caramelized smoke!
        for (const Ball of this.FlamingBalls)
        {
            if (!Ball.Active)
                continue;
            Out.push({
                Active: true,
                Position: [Ball.Pos[0], Ball.Pos[1], Ball.Pos[2] + 0.25],
                Radius:   0.62,
                Velocity: [-Ball.Vel[0] * 0.14, -Ball.Vel[1] * 0.14, 3.8],
                SmokeRate: 22.0, HeatRate: 52.0, FlameRate: 48.0, SootRate: 20.0
            });
        }

        // Fresh Sticky Molten Gummy Puddles sizzle with caramel flame & sweet steam!
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
        return Out.slice(0, 12);
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
                Colour: [1.0, 0.48, 0.12], Intensity: 165.0, Reach: 36.0, Params: [0.1, -0.5, 0, 1]
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

        // ① 4 Giant Gummy-Bear Worms × 8 Segments (Head + 7 Body Rings)
        let SegSlot = 0;
        for (const W of this.Worms)
        {
            for (let K = 0; K < W.Segments.length; ++K)
            {
                const Seg = W.Segments[K];
                const Q = MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 0, 1], Seg.Yaw),
                    ConstructAxisQuaternion([0, 1, 0], Seg.Pitch)
                );
                const OccIdx = K === 0 ? Block.WormHeads[W.Index] : Block.WormSegments[SegSlot++];
                DrawChanged = SetOcc(OccIdx, ConstructRigidTransform(Seg.Pos, Q), true) || DrawChanged;
            }
        }

        // ② 5 Gummy-Bear Catapult Bases + Articulated Throwing Arms!
        for (let I = 0; I < this.Catapults.length; ++I)
        {
            const Cat   = this.Catapults[I];
            const QBase = ConstructAxisQuaternion([0, 0, 1], Cat.Yaw);
            DrawChanged = SetOcc(Block.CatapultBases[I], ConstructRigidTransform(Cat.Pos, QBase), true) || DrawChanged;

            const PivotWorld = RotateVector(QBase, [0.55, 0.0, 2.25]);
            const QArm = MultiplyQuaternion(QBase, ConstructAxisQuaternion([0, 1, 0], Cat.ArmPitch));
            DrawChanged = SetOcc(
                Block.CatapultArms[I],
                ConstructRigidTransform([Cat.Pos[0] + PivotWorld[0], Cat.Pos[1] + PivotWorld[1], Cat.Pos[2] + PivotWorld[2]], QArm),
                true
            ) || DrawChanged;
        }

        // ③ 6 Recoiling Old-School Candy Cannons!
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

        // ④ Flaming Gummy Balls, Jawbreaker Cannonballs & Sticky Molten Puddles
        for (let I = 0; I < this.FlamingBalls.length; ++I)
        {
            const B = this.FlamingBalls[I];
            const Xf = B.Active ? ConstructRigidTransform(B.Pos, ConstructAxisQuaternion([1, 1, 0], B.Spin)) : Parked;
            DrawChanged = SetOcc(Block.FlamingBalls[I], Xf, B.Active) || DrawChanged;
        }
        for (let I = 0; I < this.Jawbreakers.length; ++I)
        {
            const J = this.Jawbreakers[I];
            const Xf = J.Active ? ConstructRigidTransform(J.Pos, ConstructAxisQuaternion([0, 1, 0], J.Spin)) : Parked;
            DrawChanged = SetOcc(Block.Jawbreakers[I], Xf, J.Active) || DrawChanged;
        }
        for (let I = 0; I < this.StickyPuddles.length; ++I)
        {
            const P = this.StickyPuddles[I];
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

        // Callout nearby Gummy-Bear Worms (< 75 m)
        for (const Worm of this.Worms)
        {
            const Head = Worm.Segments[0];
            if (Math.hypot(Head.Pos[0] - Car.Position[0], Head.Pos[1] - Car.Position[1]) > 75.0)
                continue;
            const WP = Hud.ProjectWorld([Head.Pos[0], Head.Pos[1], Head.Pos[2] + 2.8], W, H, Cam);
            if (WP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0,0,0,0.88)";
                Ctx.shadowBlur  = 6;
                Ctx.fillStyle   = "#7efcb8";
                Ctx.font        = "700 10.5px 'JetBrains Mono', monospace";
                Ctx.textAlign   = "center";
                Ctx.fillText("🐛 GUMMY-BEAR WORM", WP[0], WP[1]);
                Ctx.restore();
            }
        }

        Ctx.save();
        Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
        Ctx.shadowBlur  = 7;
        Ctx.textAlign   = "center";
        Ctx.fillStyle   = this.Finished ? "#7efcb8" : "#ffd6ec";
        Ctx.font        = "800 15px 'DM Sans', system-ui, sans-serif";
        const Header    = this.Finished
            ? `🏆 SWEET-GATE BREACHED · ${this.RunTimer.toFixed(1)}s${this.BestRunSec !== null ? ` (BEST ${this.BestRunSec.toFixed(1)}s)` : ""}`
            : `🍬 CANDY VILLAGE · ${DistToGoal}m TO SWEET-GATE · ${this.RunTimer.toFixed(1)}s`;
        Ctx.fillText(Header, W * 0.5, 24);

        let SurfaceState = "⚡ DRY SUGAR COBBLES";
        if (this.StickyTimer > 0.05)       SurfaceState = `🍯 STICKY SYRUP DRAG (${this.StickyTimer.toFixed(1)}s — HIT WATER TO WASH!)`;
        else if (this.WaterDepthNow > 0.05)SurfaceState = `🌊 2.5D FIZZY LAGOON (DEPTH ${this.WaterDepthNow.toFixed(2)}m)`;

        Ctx.fillStyle = this.StickyTimer > 0.05 ? "#ffb347" : (this.WaterDepthNow > 0.05 ? "#6be8ff" : "#9effc8");
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
