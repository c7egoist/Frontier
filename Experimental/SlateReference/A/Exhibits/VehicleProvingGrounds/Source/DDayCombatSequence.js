//============================================================================================================================================
//                                                       DDAYCOMBATSEQUENCE.JS
//============================================================================================================================================
// ⚔️ Real-Time Combined-Arms Battlefield Simulation for "D-Day · Race to The Wall" ("dday"):
//    • Uses the engine's REAL 3D Navier-Stokes Volumetric Plume Solver (SmokeSequence.Sources.QueueBurst + QueryPlumeEmissions),
//      EffectSequence 216-chunk physical debris bursts, and swept-collision Sparks — ZERO fake box explosions!
//    • Terrain-conforming Assault Tanks pitch & roll across the uneven 3D shell-cratered battlefield toward THE WALL,
//      drawing enemy Bunker MG & 155mm Cannon aggro, physically shielding players in their armored lee, and firing 105mm
//      shells back at Enemy Bunkers to suppress MG fire — until repeated Cannon hits cook off a Tank and pop its turret!
//    • Sectorized Threat Rules: Enemy MG Turrets & Cannons engage Advancing Tanks first; at most 1 nearby MG + 1 Cannon
//      swing onto a player who breaks Tank Cover into open ground.
//    • Overhead Fighter-Bombers drop 500-lb bombs and take AA flak hits into flaming, smoking crash-dives toward the gauntlet!
//    • 28 Armed Teller Landmines detonate on car or tank contact with real volumetric fire/soot plumes & stunt impulse.

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
    DDayBunkerSites,
    DDayCannonMounts,
    DDayMgMounts,
    DDayMineCoordinates,
    DDaySpawn,
    DDayWallGoalX,
    QueryDDayTerrainHeight
} from "./DDayStructure.js";

function AngleDelta(From, To)
{
    let D = (To - From) % (Math.PI * 2.0);
    if (D >  Math.PI) D -= Math.PI * 2.0;
    if (D < -Math.PI) D += Math.PI * 2.0;
    return D;
}

//------------------------------------------------------------------------------------------------------------------------
//                                              DDAY COMBAT SEQUENCE
//------------------------------------------------------------------------------------------------------------------------

export class DDayCombatSequence
{
    constructor(Host)
    {
        this.Host           = Host;
        this.Scene          = Host.Scene;
        this.Enabled        = (Host.LevelKey === "dday") && Boolean(this.Scene?.DDayBlock);

        this.Clock          = 0.0;
        this.RunTimer       = 0.0;
        this.BestBreachSec  = null;
        this.Breached       = false;
        this.VehicleArmor   = 100.0;
        this.KnockedOut     = false;
        this.KnockoutTimer  = 0.0;
        this.InTankCover    = false;
        this.InCraterCover  = false;
        this.CoverTankIdx   = -1;
        this.ExposedSeconds = 0.0;

        this.BannerMessage  = "";
        this.BannerTimer    = 0.0;
        this.NextCrashSortieClock = 4.6;

        // Dynamic Combat Pools (mapped to Scene.DDayBlock) + Real Volumetric Plume & Flash Light Emitters
        this.Tanks        = [];
        this.MgTurrets    = [];
        this.Cannons      = [];
        this.Aircraft     = [];
        this.Mines        = [];
        this.Bombs        = [];
        this.Shells       = [];
        this.Tracers      = [];
        this.CraterFires  = []; // Lingering real volumetric smoke/flame vents & flash lights (NO fake meshes!)

        this.Stats = {
            MinesDetonated:    0,
            TanksExploded:     0,
            TankShotsFired:    0,
            BunkersSuppressed: 0,
            BombsDropped:      0,
            PlanesCrashed:     0,
            ShellsFired:       0,
            Breaches:          0
        };

        if (this.Enabled)
        {
            this.InitializeBattlefield();
            this.MountQuickControls();
            this.BannerMessage = "⚔️ RACE TO THE WALL — TUCK BEHIND ADVANCING TANKS WHILE THEY DRAW ENEMY FIRE!";
            this.BannerTimer   = 4.8;
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                 BATTLEFIELD INITIALIZATION & RESET
    //--------------------------------------------------------------------------------------------------------------------

    InitializeBattlefield()
    {
        // ① 5 Advancing Allied Assault Tanks along staggered lanes (Tank #0 starts right ahead of Beachhead spawn at X = -172 m!)
        const Lanes = [
            { StartX: -172.0, Y:  -6.5, Speed: 9.2 },
            { StartX: -124.0, Y:   7.5, Speed: 8.8 },
            { StartX:  -68.0, Y:  -1.0, Speed: 8.5 },
            { StartX:  -10.0, Y: -15.5, Speed: 8.9 },
            { StartX:   48.0, Y:  14.5, Speed: 8.3 }
        ];
        this.Tanks = Lanes.map((L, I) =>
        {
            const GZ = QueryDDayTerrainHeight(L.StartX, L.Y);
            return {
                Index:        I,
                Pos:          [L.StartX, L.Y, GZ],
                LaneY:        L.Y,
                BaseSpeed:    L.Speed,
                Speed:        L.Speed,
                Yaw:          0.0,
                Pitch:        0.0,
                Roll:         0.0,
                TurretYaw:    0.0,
                FireCooldown: 1.0 + I * 0.65,
                Hp:           100.0,
                Alive:        true,
                CookingOff:   false,
                CookTimer:    0.0,
                WreckTimer:   0.0,
                TurretPos:    [L.StartX, L.Y, GZ + 1.52],
                TurretVel:    [0.0, 0.0, 0.0],
                TurretPitch:  0.0,
                TurretRoll:   0.0
            };
        });

        // ② 6 Rotating Bunker Machine Gun Turrets (engage Tanks first; suppressible by Allied Tank fire!)
        this.MgTurrets = DDayMgMounts.map((Pos, I) => ({
            Index:           I,
            BunkerPos:       DDayBunkerSites[I].Pos,
            Pos:             [...Pos],
            Yaw:             Math.PI,
            Cooldown:        0.22 * I,
            BurstRem:        5,
            SuppressedTimer: 0.0,
            TargetingCar:    false
        }));

        // ③ 6 Heavy 155mm Fortress Coastal Cannons (engage Advancing Tanks primarily!)
        this.Cannons = DDayCannonMounts.map((Pos, I) => ({
            Index:    I,
            Pos:      [...Pos],
            Yaw:      Math.PI,
            Cooldown: 0.75 + I * 0.52,
            SalvoIdx: I
        }));

        // ④ 4 Low-Altitude Fighter-Bomber Attack Aircraft
        this.Aircraft = [0, 1, 2, 3].map((I) => this.CreateFreshAircraftSortie(I, true));

        // ⑤ 28 Terrain-Grounded Armed Teller Landmines
        this.Mines = DDayMineCoordinates.map(([X, Y], I) => ({
            Index: I,
            Pos:   [X, Y, QueryDDayTerrainHeight(X, Y) + 0.02],
            Armed: true
        }));

        // ⑥ Ordnance Pools
        const Block = this.Scene.DDayBlock;
        this.Bombs   = Array.from({ length: Block.Bombs.length },   () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0] }));
        this.Shells  = Array.from({ length: Block.Shells.length },  () => ({ Active: false, Friendly: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0], TargetBunker: -1 }));
        this.Tracers = Array.from({ length: Block.Tracers.length }, () => ({ Active: false, Friendly: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Life: 0 }));
        this.CraterFires = [];

        this.SyncGpuOccupants(true);
    }

    CreateFreshAircraftSortie(Slot, Initial = false)
    {
        const CarX = this.Host?.Vehicle?.Position?.[0] ?? -180.0;
        const FromEast = (Slot % 2) === 0;
        const StartX = FromEast ? (Initial ? 185.0 - Slot * 82.0 : Math.min(265.0, CarX + 205.0)) : (CarX - 175.0);
        const StartY = ((Slot - 1.5) * 15.0) + Math.sin(this.Clock * 1.7 + Slot) * 7.5;
        const Alt    = 26.0 + (Slot % 3) * 4.5;
        const DirX   = FromEast ? -1.0 : 1.0;
        const DirY   = (Slot & 1) ? 0.09 : -0.09;
        const Norm   = Math.hypot(DirX, DirY);
        const Speed  = 56.0 + Slot * 3.5;

        return {
            Slot,
            State:       "flying", // "flying" | "crashing" | "wreck"
            Pos:         [StartX, StartY, Alt],
            Vel:         [(DirX / Norm) * Speed, (DirY / Norm) * Speed, 0.0],
            Yaw:         Math.atan2(DirY, DirX),
            Pitch:       0.0,
            Roll:        0.0,
            PropAngle:   Slot * 1.1,
            BombTimer:   Initial ? (0.8 + Slot * 0.65) : 1.0,
            BombsLeft:   3,
            WreckTimer:  0.0,
            CrashTarget: [0.0, 0.0]
        };
    }

    RestartGauntlet()
    {
        if (!this.Enabled)
            return;
        this.RunTimer       = 0.0;
        this.Breached       = false;
        this.VehicleArmor   = 100.0;
        this.KnockedOut     = false;
        this.KnockoutTimer  = 0.0;
        this.ExposedSeconds = 0.0;
        const GZ = QueryDDayTerrainHeight(DDaySpawn.Position[0], DDaySpawn.Position[1]);
        this.Host.Vehicle.Respawn([DDaySpawn.Position[0], DDaySpawn.Position[1], GZ + 0.63], DDaySpawn.Yaw);
        this.InitializeBattlefield();
        this.BannerMessage = "⚔️ ASSAULT RELAUNCHED — STAY WITH THE ARMORED SPEARHEAD TO THE WALL!";
        this.BannerTimer   = 3.5;
    }

    MountQuickControls()
    {
        if (typeof document === "undefined")
            return;
        const HostBar = document.getElementById("hud-bar") || document.body;
        const Existing = document.getElementById("dday-controls");
        if (Existing)
            Existing.remove();

        const Wrap = document.createElement("div");
        Wrap.id = "dday-controls";
        Wrap.style.cssText = [
            "position:fixed",
            "top:54px",
            "right:16px",
            "z-index:26",
            "display:flex",
            "align-items:center",
            "gap:6px",
            "pointer-events:auto",
            "font-family:'DM Sans',system-ui,sans-serif"
        ].join(";");

        const MakePill = (Label, Accent, OnClick) =>
        {
            const Btn = document.createElement("button");
            Btn.type = "button";
            Btn.textContent = Label;
            Btn.style.cssText = [
                "padding:5px 11px",
                "border-radius:999px",
                `border:1px solid ${Accent}`,
                "background:rgba(16, 18, 24, 0.42)",
                "backdrop-filter:blur(6px)",
                "color:#f4f8fb",
                "font-size:11px",
                "font-weight:700",
                "letter-spacing:0.04em",
                "cursor:pointer",
                "text-shadow:0 1px 3px rgba(0,0,0,0.85)"
            ].join(";");
            Btn.addEventListener("click", (Ev) =>
            {
                Ev.preventDefault();
                Ev.stopPropagation();
                OnClick();
            });
            Wrap.appendChild(Btn);
            return Btn;
        };

        MakePill("🔄 NEW ASSAULT RUN", "rgba(110, 247, 200, 0.65)", () => this.RestartGauntlet());
        MakePill("✈️ CRASH-DIVE AIRCRAFT", "rgba(255, 112, 92, 0.72)", () => this.TriggerAircraftCrashDive());
        MakePill("🛡️ FIELD ARMOR +100%", "rgba(255, 198, 82, 0.65)", () =>
        {
            this.VehicleArmor = 100.0;
            this.KnockedOut   = false;
            this.BannerMessage = "🛡️ ENGINEER REPAIR — ARMOR RESTORED TO 100%!";
            this.BannerTimer   = 2.2;
        });

        HostBar.appendChild(Wrap);
        this.ControlStrip = Wrap;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //             REAL ENGINE VOLUMETRIC PLUME + 216-CHUNK DEBRIS + SPARK EXPLOSIONS (ZERO FAKE BOXES!)
    //--------------------------------------------------------------------------------------------------------------------

    TriggerExplosion(X, Y, Z, Scale = 1.4, BlastRadius = 8.5, BlastImpulse = 8.0, MaxCarDamage = 22.0, DebrisMat = CourseMaterial.Dirt)
    {
        const GroundZ = Math.max(Z, QueryDDayTerrainHeight(X, Y));

        // ① REAL 3D Navier-Stokes Volumetric Blackbody Fire + Heat + Soot + Smoke Burst in PlumeSpace!
        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [X, Y, GroundZ + 0.38],
            Radius:   0.62 * Scale,
            Velocity: [0.0, 0.0, 4.8 * Scale],
            Smoke:    34.0 * Scale,
            Heat:     62.0 * Scale,
            Flame:    54.0 * Scale,
            Soot:     42.0 * Scale,
            Seconds:  0.65 + 0.25 * Scale
        });

        // ② Lingering Volumetric Crater Fire & Rising Black Soot Column (fed into SmokeSequence Emissions!)
        this.CraterFires.push({
            Pos:      [X, Y, GroundZ + 0.25],
            Age:      0.0,
            Duration: 2.2 + 0.6 * Scale,
            Scale
        });
        if (this.CraterFires.length > 10)
            this.CraterFires.shift();

        // ③ REAL 216-Chunk Physical Shrapnel & Earth Clod Burst via EffectSequence (EffectKind.Debris)!
        this.Host?.Effects?.BurstTyre?.(
            ConstructRigidTransform([X, Y, GroundZ + 0.32], [0.0, 0.0, 0.0, 1.0]),
            [0.85 * Scale, 0.85 * Scale, 0.55 * Scale],
            [0.0, 0.0, 4.5 * Scale],
            DebrisMat
        );

        // ④ Radial Fountain of Swept-Collision Incandescent Sparks Bouncing Across Uneven Terrain!
        const SparkEvents = [];
        for (let K = 0; K < 8; ++K)
        {
            const Ang = (K / 8) * Math.PI * 2.0 + this.Clock * 3.1;
            const OutSpd = (5.5 + (K % 3) * 2.4) * Scale;
            SparkEvents.push({
                Point:    [X + Math.cos(Ang) * 0.35, Y + Math.sin(Ang) * 0.35, GroundZ + 0.45],
                Velocity: [Math.cos(Ang) * OutSpd, Math.sin(Ang) * OutSpd, (5.5 + (K % 2) * 3.0) * Scale],
                Normal:   [0.0, 0.0, 1.0],
                Strength: 3.2 * Scale,
                Rim:      null
            });
        }
        this.Host?.Sparks?.Emit?.(SparkEvents, 1.0 / 60.0);

        // ⑤ Procedural Sub-Bass Concussion Audio + Shielded Radial Shockwave Impulse on Player Car
        const Car = this.Host?.Vehicle;
        if (Car)
        {
            const DistToCar = Math.hypot(Car.Position[0] - X, Car.Position[1] - Y);
            if (DistToCar < 145.0)
            {
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(
                    ClampScalar(1.0 - DistToCar / 145.0, 0.12, 1.0) * ClampScalar(Scale * 0.65, 0.5, 1.35)
                );
            }

            if (DistToCar < BlastRadius && !this.KnockedOut && MaxCarDamage > 0.0)
            {
                const ShieldTank = this.FindBlockingTankAlongSegment(X, Y, Car.Position[0], Car.Position[1], -1);
                if (ShieldTank < 0)
                {
                    const Falloff = 1.0 - (DistToCar / BlastRadius);
                    const DirX = DistToCar > 0.25 ? (Car.Position[0] - X) / DistToCar : -1.0;
                    const DirY = DistToCar > 0.25 ? (Car.Position[1] - Y) / DistToCar :  0.3;
                    Car.LinearVelocity[0] += DirX * BlastImpulse * Falloff;
                    Car.LinearVelocity[1] += DirY * BlastImpulse * Falloff;
                    Car.LinearVelocity[2] += BlastImpulse * 0.72 * Falloff;
                    Car.AngularVelocity[2] += (DirY >= 0 ? 1 : -1) * 0.95 * Falloff;
                    this.ApplyCarDamage(MaxCarDamage * Falloff, "EXPLOSION BLAST");
                }
            }
        }
    }

    ApplyCarDamage(Amount, SourceLabel)
    {
        if (this.Breached || this.KnockedOut || Amount <= 0.0)
            return;
        this.VehicleArmor = Math.max(0.0, this.VehicleArmor - Amount);
        if (this.VehicleArmor <= 0.0)
        {
            this.KnockedOut    = true;
            this.KnockoutTimer = 2.6;
            this.BannerMessage = `💥 VEHICLE KNOCKED OUT BY ${SourceLabel} — REDEPLOYING ON BEACHHEAD!`;
            this.BannerTimer   = 2.8;
            const P = this.Host.Vehicle.Position;
            this.TriggerExplosion(P[0], P[1], P[2], 1.75, 3.0, 3.0, 0.0, CourseMaterial.SteelDark);
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       COMBINED-ARMS TANK SHIELDING, COOK-OFF & DESTRUCTION
    //--------------------------------------------------------------------------------------------------------------------

    FindBlockingTankAlongSegment(AX, AY, BX, BY, IgnoreTankIdx = -1)
    {
        const DX = BX - AX, DY = BY - AY;
        if (Math.hypot(DX, DY) < 1.0e-3)
            return -1;
        const InvX = Math.abs(DX) > 1.0e-6 ? (1.0 / DX) : 1.0e6;
        const InvY = Math.abs(DY) > 1.0e-6 ? (1.0 / DY) : 1.0e6;

        let BestIdx = -1, BestT = 1.0;
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            if (I === IgnoreTankIdx)
                continue;
            const T = this.Tanks[I];
            const MinX = T.Pos[0] - 3.65, MaxX = T.Pos[0] + 3.65;
            const MinY = T.Pos[1] - 2.05, MaxY = T.Pos[1] + 2.05;
            const T1 = (MinX - AX) * InvX, T2 = (MaxX - AX) * InvX;
            const T3 = (MinY - AY) * InvY, T4 = (MaxY - AY) * InvY;
            const TMin = Math.max(Math.min(T1, T2), Math.min(T3, T4));
            const TMax = Math.min(Math.max(T1, T2), Math.max(T3, T4));
            if (TMax >= 0.0 && TMin <= TMax && TMin >= 0.0 && TMin < BestT)
            {
                BestT   = TMin;
                BestIdx = I;
            }
        }
        return BestIdx;
    }

    DamageTank(TankIdx, Damage, InstantDetonate = false)
    {
        const T = this.Tanks[TankIdx];
        if (!T || !T.Alive)
            return;
        T.Hp = Math.max(0.0, T.Hp - Damage);
        if (InstantDetonate || Damage >= 100.0)
        {
            this.DetonateTankCatastrophic(TankIdx);
            return;
        }
        if (T.Hp <= 0.0 && !T.CookingOff)
        {
            // 1.5 s dramatic ammo cook-off fire warning so player in cover can floor it to the next Tank!
            T.CookingOff = true;
            T.CookTimer  = 1.50;
            T.Speed      = T.BaseSpeed * 0.28;
            if (this.CoverTankIdx === TankIdx)
            {
                this.BannerMessage = "⚠️ COVER TANK AMMO COOKING OFF — BREAK COVER NOW!";
                this.BannerTimer   = 2.2;
            }
        }
    }

    DetonateTankCatastrophic(TankIdx)
    {
        const T = this.Tanks[TankIdx];
        if (!T || !T.Alive)
            return;
        T.Alive      = false;
        T.CookingOff = false;
        T.Speed      = 0.0;
        T.WreckTimer = 8.5;
        T.TurretPos  = [T.Pos[0], T.Pos[1], T.Pos[2] + 1.62];
        T.TurretVel  = [
            Math.sin(this.Clock * 13.0 + TankIdx) * 4.4,
            (TankIdx % 2 === 0 ? 4.0 : -4.0),
            12.4
        ];
        this.Stats.TanksExploded++;
        this.TriggerExplosion(T.Pos[0], T.Pos[1], T.Pos[2] + 0.8, 2.25, 10.2, 9.2, 26.0, CourseMaterial.SteelDark);
        if (this.CoverTankIdx === TankIdx)
        {
            this.BannerMessage = "💥 COVER TANK EXPLODED — SPRINT TO THE NEXT ALLIED TANK!";
            this.BannerTimer   = 2.8;
        }
    }

    ResolveCarTankCollisionsAndCover(Car, Step)
    {
        this.InTankCover   = false;
        this.InCraterCover = false;
        this.CoverTankIdx  = -1;

        const CX = Car.Position[0], CY = Car.Position[1];
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            const RelX = CX - T.Pos[0];
            const RelY = CY - T.Pos[1];

            // Generous tactical Tank Cover envelope: behind (-17.5 .. -3.5 m) OR tucked alongside (±4.8 m) a live Tank!
            if (T.Alive && ((RelX >= -17.5 && RelX <= -3.4 && Math.abs(RelY) <= 4.2) || (Math.abs(RelX) <= 4.8 && Math.abs(RelY) <= 5.2)))
            {
                this.InTankCover  = true;
                this.CoverTankIdx = I;
            }

            // Solid 2D chassis push-out against Tank hull (3.55 m × 1.88 m)
            const HalfX = 5.60, HalfY = 2.92;
            if (Math.abs(RelX) < HalfX && Math.abs(RelY) < HalfY && Car.Position[2] < T.Pos[2] + 2.35)
            {
                const PenX = HalfX - Math.abs(RelX);
                const PenY = HalfY - Math.abs(RelY);
                if (PenX < PenY)
                {
                    const S = RelX >= 0 ? 1.0 : -1.0;
                    Car.Position[0] = T.Pos[0] + S * HalfX;
                    Car.LinearVelocity[0] = S < 0
                        ? Math.min(Car.LinearVelocity[0], T.Speed - 0.8)
                        : Math.max(Car.LinearVelocity[0], T.Speed + 1.8);
                }
                else
                {
                    const S = RelY >= 0 ? 1.0 : -1.0;
                    Car.Position[1] = T.Pos[1] + S * HalfY;
                    Car.LinearVelocity[1] = S * Math.max(2.2, Math.abs(Car.LinearVelocity[1]) * 0.45);
                }
                this.Host?.Sparks?.Emit?.([{
                    Point:    [Car.Position[0], Car.Position[1], Car.Position[2] + 0.3],
                    Velocity: [T.Speed, 0.0, 2.4],
                    Normal:   [0.0, 0.0, 1.0],
                    Strength: 1.6,
                    Rim:      null
                }], 1.0 / 60.0);
            }
        }

        // Natural Terrain Defilade: hunkering deep inside a sunken 3D shell crater (< 1.12 m elevation) also gives low-angle MG cover!
        const LocalGround = QueryDDayTerrainHeight(CX, CY);
        if (CX > -150.0 && CX < 175.0 && LocalGround < 1.12)
            this.InCraterCover = true;

        if (this.InTankCover || this.InCraterCover)
            this.ExposedSeconds = Math.max(0.0, this.ExposedSeconds - Step * 2.4);
        else
            this.ExposedSeconds += Step;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       AIRCRAFT BOMBING RUNS & SHOT-DOWN CRASH DIVES TOWARD CARS
    //--------------------------------------------------------------------------------------------------------------------

    TriggerAircraftCrashDive()
    {
        const Car = this.Host?.Vehicle;
        if (!Car)
            return null;
        const Candidate = this.Aircraft.find((A) => A.State === "flying");
        if (!Candidate)
            return null;

        Candidate.State = "crashing";
        const LeadX = ClampScalar(Car.Position[0] + Car.LinearVelocity[0] * 1.15 + 15.0, -185.0, 185.0);
        const DodgeOffset = (Math.sin(this.Clock * 9.3) >= 0 ? 1 : -1) * 4.5;
        const LeadY = ClampScalar(Car.Position[1] + Car.LinearVelocity[1] * 0.85 + DodgeOffset, -22.0, 22.0);
        Candidate.CrashTarget = [LeadX, LeadY];

        Candidate.Pos = [LeadX + 68.0, LeadY + (Candidate.Slot % 2 === 0 ? 22.0 : -22.0), 30.0];
        const ImpactZ = QueryDDayTerrainHeight(LeadX, LeadY) + 0.5;
        const FlightTime = 1.48;
        Candidate.Vel = [
            (LeadX - Candidate.Pos[0]) / FlightTime,
            (LeadY - Candidate.Pos[1]) / FlightTime,
            (ImpactZ - Candidate.Pos[2]) / FlightTime
        ];
        Candidate.Yaw   = Math.atan2(Candidate.Vel[1], Candidate.Vel[0]);
        Candidate.Pitch = 0.40;

        this.BannerMessage = "✈️ AIRCRAFT HIT BY FLAK — FLAMING PLANE CRASHING AHEAD, SWERVE!";
        this.BannerTimer   = 2.5;
        return Candidate;
    }

    DropAerialBomb(Plane)
    {
        const Slot = this.Bombs.find((B) => !B.Active);
        if (!Slot)
            return;
        Slot.Active = true;
        Slot.Pos    = [Plane.Pos[0], Plane.Pos[1], Plane.Pos[2] - 0.85];
        Slot.Vel    = [Plane.Vel[0] * 0.40, Plane.Vel[1] * 0.40, -3.2];
        const G = 18.0;
        const EstGround = QueryDDayTerrainHeight(Slot.Pos[0], Slot.Pos[1]);
        const DropH = Math.max(1.5, Slot.Pos[2] - EstGround);
        const TImpact = (Slot.Vel[2] + Math.sqrt(Slot.Vel[2] * Slot.Vel[2] + 2.0 * G * DropH)) / G;
        Slot.Target = [Slot.Pos[0] + Slot.Vel[0] * TImpact, Slot.Pos[1] + Slot.Vel[1] * TImpact];
        this.Stats.BombsDropped++;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                              MAIN PER-FRAME BATTLEFIELD SIMULATION STEP
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
        if (!this.Breached && !this.KnockedOut)
            this.RunTimer += Step;

        if (this.KnockedOut)
        {
            this.KnockoutTimer -= Step;
            if (this.KnockoutTimer <= 0.0)
                this.RestartGauntlet();
        }

        // Victory Check at THE WALL Central Breach Gate (X >= 188 m, |Y| <= 12.5 m)
        if (!this.Breached && !this.KnockedOut && Car.Position[0] >= DDayWallGoalX && Math.abs(Car.Position[1]) <= 12.5)
        {
            this.Breached = true;
            this.Stats.Breaches++;
            if (this.BestBreachSec === null || this.RunTimer < this.BestBreachSec)
                this.BestBreachSec = this.RunTimer;
            this.BannerMessage = `🏆 THE WALL BREACHED IN ${this.RunTimer.toFixed(1)}s! CLICK [NEW ASSAULT RUN] TO BEAT YOUR TIME!`;
            this.BannerTimer   = 8.0;
        }

        // ① Advance the 5 Allied Assault Tanks (conforming to 3D uneven terrain + firing 105mm shells at Enemy Bunkers!)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            if (T.Alive)
            {
                if (T.CookingOff)
                {
                    T.CookTimer -= Step;
                    if (T.CookTimer <= 0.0)
                    {
                        this.DetonateTankCatastrophic(I);
                        continue;
                    }
                }

                T.Pos[0] += T.Speed * Step;
                // Conform Tank hull Z, Pitch & Roll to the exact uneven 3D shell-cratered terrain!
                const ZF = QueryDDayTerrainHeight(T.Pos[0] + 2.6, T.Pos[1]);
                const ZR = QueryDDayTerrainHeight(T.Pos[0] - 2.6, T.Pos[1]);
                const ZL = QueryDDayTerrainHeight(T.Pos[0], T.Pos[1] + 1.4);
                const ZRt= QueryDDayTerrainHeight(T.Pos[0], T.Pos[1] - 1.4);
                T.Pos[2] = 0.25 * (ZF + ZR + ZL + ZRt);
                T.Pitch  = Math.atan2(ZR - ZF, 5.2);
                T.Roll   = Math.atan2(ZL - ZRt, 2.8);
                T.TurretPos = [T.Pos[0], T.Pos[1], T.Pos[2] + 1.52];

                // Aim Allied Tank 105mm Turret at nearest active Enemy Bunker ahead & fire return shells!
                let BestBunker = -1, BestBDist = 118.0;
                for (let B = 0; B < 6; ++B)
                {
                    const BP = DDayBunkerSites[B].Pos;
                    if (BP[0] < T.Pos[0] - 8.0)
                        continue;
                    const D = Math.hypot(BP[0] - T.Pos[0], BP[1] - T.Pos[1]);
                    if (D < BestBDist)
                    {
                        BestBDist  = D;
                        BestBunker = B;
                    }
                }
                const DesiredTYaw = BestBunker >= 0
                    ? Math.atan2(DDayBunkerSites[BestBunker].Pos[1] - T.Pos[1], DDayBunkerSites[BestBunker].Pos[0] - T.Pos[0])
                    : Math.sin(this.Clock * 0.8 + I) * 0.25;
                T.TurretYaw += ClampScalar(AngleDelta(T.TurretYaw, DesiredTYaw), -1.8 * Step, 1.8 * Step);

                T.FireCooldown -= Step;
                if (!T.CookingOff && BestBunker >= 0 && T.FireCooldown <= 0.0)
                {
                    T.FireCooldown = 3.3 + (I % 3) * 0.55;
                    const Shell = this.Shells.find((S) => !S.Active);
                    if (Shell)
                    {
                        const BP = DDayBunkerSites[BestBunker].Pos;
                        const MuzzleX = T.Pos[0] + Math.cos(T.TurretYaw) * 5.2;
                        const MuzzleY = T.Pos[1] + Math.sin(T.TurretYaw) * 5.2;
                        const MuzzleZ = T.Pos[2] + 1.94;
                        const FlightT = ClampScalar(BestBDist / 92.0, 0.35, 1.25);
                        Shell.Active       = true;
                        Shell.Friendly     = true;
                        Shell.TargetBunker = BestBunker;
                        Shell.Pos          = [MuzzleX, MuzzleY, MuzzleZ];
                        Shell.Target       = [BP[0], BP[1]];
                        Shell.Vel          = [
                            (BP[0] - MuzzleX) / FlightT,
                            (BP[1] - MuzzleY) / FlightT,
                            ((BP[2] + 2.1) - MuzzleZ) / FlightT + 0.5 * 16.0 * FlightT
                        ];
                        this.Stats.TankShotsFired++;
                        this.Host?.Smoke?.Sources?.QueueBurst?.({
                            Position: [MuzzleX, MuzzleY, MuzzleZ],
                            Radius:   0.45,
                            Velocity: [Math.cos(T.TurretYaw) * 9.0, Math.sin(T.TurretYaw) * 9.0, 1.5],
                            Smoke:    18.0, Heat: 32.0, Flame: 28.0, Soot: 14.0, Seconds: 0.28
                        });
                    }
                }

                if (T.Pos[0] > 180.0)
                {
                    T.Pos[0] = -198.0;
                    T.Hp     = 100.0;
                }
            }
            else
            {
                // Popped-off turret ballistic arc onto uneven terrain!
                const GroundUnderTurret = QueryDDayTerrainHeight(T.TurretPos[0], T.TurretPos[1]) + 0.16;
                if (T.TurretPos[2] > GroundUnderTurret || T.TurretVel[2] > 0.0)
                {
                    T.TurretPos[0] += T.TurretVel[0] * Step;
                    T.TurretPos[1] += T.TurretVel[1] * Step;
                    T.TurretPos[2] += T.TurretVel[2] * Step;
                    T.TurretVel[2] -= 19.5 * Step;
                    T.TurretPitch  += 4.2 * Step;
                    T.TurretRoll   += 3.1 * Step;
                    if (T.TurretPos[2] <= GroundUnderTurret)
                    {
                        T.TurretPos[2] = GroundUnderTurret;
                        T.TurretVel    = [0.0, 0.0, 0.0];
                    }
                }
                T.WreckTimer -= Step;
                if (T.WreckTimer <= 0.0)
                {
                    const StartZ = QueryDDayTerrainHeight(-198.0, T.LaneY);
                    T.Alive       = true;
                    T.CookingOff  = false;
                    T.Hp          = 100.0;
                    T.Speed       = T.BaseSpeed;
                    T.Pos         = [-198.0, T.LaneY, StartZ];
                    T.TurretPos   = [-198.0, T.LaneY, StartZ + 1.52];
                    T.TurretPitch = 0.0;
                    T.TurretRoll  = 0.0;
                }
            }
        }

        // Update Car-Tank collision & cover status
        this.ResolveCarTankCollisionsAndCover(Car, Step);

        // ② Landmines: Detonate on Car (< 2.50 m) OR Advancing Tank (< 2.85 m) with REAL Volumetric Explosion!
        for (const M of this.Mines)
        {
            if (!M.Armed)
                continue;
            const CarDist = Math.hypot(Car.Position[0] - M.Pos[0], Car.Position[1] - M.Pos[1]);
            if (!this.KnockedOut && CarDist < 2.50 && (Car.Position[2] - M.Pos[2]) < 1.75)
            {
                M.Armed = false;
                this.Stats.MinesDetonated++;
                this.BannerMessage = "💥 TELLER LANDMINE DETONATED — FOLLOW TANK TRACKS OR STEER CLEAR OF RED FUZES!";
                this.BannerTimer   = 2.4;
                this.TriggerExplosion(M.Pos[0], M.Pos[1], M.Pos[2], 1.45, 7.2, 9.8, 24.0, CourseMaterial.Dirt);
                continue;
            }
            for (let TI = 0; TI < this.Tanks.length; ++TI)
            {
                const T = this.Tanks[TI];
                if (T.Alive && Math.hypot(T.Pos[0] - M.Pos[0], T.Pos[1] - M.Pos[1]) < 2.90)
                {
                    M.Armed = false;
                    this.Stats.MinesDetonated++;
                    this.TriggerExplosion(M.Pos[0], M.Pos[1], M.Pos[2], 1.35, 6.2, 5.5, 8.0, CourseMaterial.Dirt);
                    this.DamageTank(TI, 20.0);
                    break;
                }
            }
        }

        // ③ Sectorized Bunker MG Turrets: ENGAGE ADVANCING TANKS FIRST!
        //    At most ONE nearest non-suppressed MG may swing onto the Player Car, and ONLY if Car is exposed (> 0.85 s out of cover)!
        let AllowedCarMgIdx = -1;
        if (!this.InTankCover && !this.InCraterCover && this.ExposedSeconds > 0.85 && !this.KnockedOut)
        {
            let NearestD = 84.0;
            for (let MI = 0; MI < this.MgTurrets.length; ++MI)
            {
                const MG = this.MgTurrets[MI];
                if (MG.SuppressedTimer > 0.0 || Car.Position[0] > MG.Pos[0] + 10.0)
                    continue;
                const D = Math.hypot(Car.Position[0] - MG.Pos[0], Car.Position[1] - MG.Pos[1]);
                if (D < NearestD) { NearestD = D; AllowedCarMgIdx = MI; }
            }
        }

        for (let MI = 0; MI < this.MgTurrets.length; ++MI)
        {
            const MG = this.MgTurrets[MI];
            if (MG.SuppressedTimer > 0.0)
            {
                MG.SuppressedTimer = Math.max(0.0, MG.SuppressedTimer - Step);
                MG.TargetingCar    = false;
                continue;
            }

            // Find nearest live Advancing Tank inside this Bunker's forward sector (Range <= 105 m)!
            let TargetPos = null;
            MG.TargetingCar = false;
            if (MI === AllowedCarMgIdx)
            {
                TargetPos = [Car.Position[0] + Car.LinearVelocity[0] * 0.22, Car.Position[1] + Car.LinearVelocity[1] * 0.22, Car.Position[2] + 0.38];
                MG.TargetingCar = true;
            }
            else
            {
                let BestTDist = 112.0;
                for (const T of this.Tanks)
                {
                    if (!T.Alive || T.Pos[0] > MG.Pos[0] + 14.0)
                        continue;
                    const D = Math.hypot(T.Pos[0] - MG.Pos[0], T.Pos[1] - MG.Pos[1]);
                    if (D < BestTDist)
                    {
                        BestTDist = D;
                        TargetPos = [T.Pos[0] + T.Speed * 0.20, T.Pos[1], T.Pos[2] + 1.05];
                    }
                }
            }

            if (!TargetPos)
                continue;

            const DX = TargetPos[0] - MG.Pos[0], DY = TargetPos[1] - MG.Pos[1];
            const Dist = Math.hypot(DX, DY) || 1.0;
            const DesiredYaw = Math.atan2(DY, DX);
            MG.Yaw += ClampScalar(AngleDelta(MG.Yaw, DesiredYaw), -2.0 * Step, 2.0 * Step);

            MG.Cooldown -= Step;
            if (MG.Cooldown <= 0.0 && Math.abs(AngleDelta(MG.Yaw, DesiredYaw)) < 0.35)
            {
                const Tracer = this.Tracers.find((Tr) => !Tr.Active);
                if (Tracer)
                {
                    const Spread = Math.sin(this.Clock * 41.0 + MI * 2.7) * 0.045;
                    const AimYaw = MG.Yaw + Spread;
                    const Spd    = 108.0;
                    const ZDir   = (TargetPos[2] - (MG.Pos[2] + 0.38)) / Math.max(12.0, Dist);
                    Tracer.Active   = true;
                    Tracer.Friendly = false;
                    Tracer.Pos      = [MG.Pos[0] + Math.cos(AimYaw) * 2.5, MG.Pos[1] + Math.sin(AimYaw) * 2.5, MG.Pos[2] + 0.38];
                    Tracer.Vel      = [Math.cos(AimYaw) * Spd, Math.sin(AimYaw) * Spd, ZDir * Spd];
                    Tracer.Life     = 1.15;
                }
                MG.BurstRem--;
                if (MG.BurstRem <= 0)
                {
                    MG.BurstRem = 5;
                    MG.Cooldown = 1.15;
                }
                else
                {
                    MG.Cooldown = 0.12;
                }
            }
        }

        // Advance 3D Tracer Bolts (ricochet off Tanks with sparks; chip Car Armor only if unshielded!)
        for (const Tr of this.Tracers)
        {
            if (!Tr.Active)
                continue;
            const PrevX = Tr.Pos[0], PrevY = Tr.Pos[1];
            Tr.Pos[0] += Tr.Vel[0] * Step;
            Tr.Pos[1] += Tr.Vel[1] * Step;
            Tr.Pos[2] += Tr.Vel[2] * Step;
            Tr.Life   -= Step;
            const TerrZ = QueryDDayTerrainHeight(Tr.Pos[0], Tr.Pos[1]);
            if (Tr.Life <= 0.0 || Tr.Pos[2] <= TerrZ)
            {
                Tr.Active = false;
                continue;
            }
            const HitTank = this.FindBlockingTankAlongSegment(PrevX, PrevY, Tr.Pos[0], Tr.Pos[1]);
            if (HitTank >= 0)
            {
                Tr.Active = false;
                // Armor ricochet sparks off the Tank hull!
                this.Host?.Sparks?.Emit?.([{
                    Point:    [...Tr.Pos],
                    Velocity: [-Tr.Vel[0] * 0.10, -Tr.Vel[1] * 0.10, 3.6],
                    Normal:   [0, 0, 1],
                    Strength: 2.0,
                    Rim:      null
                }], 1.0 / 60.0);
                continue;
            }
            if (!this.KnockedOut && !this.InTankCover &&
                Math.hypot(Tr.Pos[0] - Car.Position[0], Tr.Pos[1] - Car.Position[1]) < 2.05 &&
                Math.abs(Tr.Pos[2] - Car.Position[2]) < 1.15)
            {
                Tr.Active = false;
                this.ApplyCarDamage(1.8, "BUNKER MG BURST");
                this.Host?.Sparks?.Emit?.([{
                    Point:    [...Tr.Pos],
                    Velocity: [Car.LinearVelocity[0], Car.LinearVelocity[1], 3.4],
                    Normal:   [0, 0, 1],
                    Strength: 2.0,
                    Rim:      null
                }], 1.0 / 60.0);
            }
        }

        // ④ 6 Heavy 155mm Fortress Cannons: 80% of salvos shell Advancing Allied Tanks (blowing up Tanks!);
        //    only 1 Cannon salvo leads the Player when the Player sprints exposed ahead of cover!
        for (let CI = 0; CI < this.Cannons.length; ++CI)
        {
            const C = this.Cannons[CI];
            C.Cooldown -= Step;

            const LiveTanksInArc = this.Tanks.filter((T) => T.Alive && T.Pos[0] < C.Pos[0] - 10.0 && Math.hypot(T.Pos[0] - C.Pos[0], T.Pos[1] - C.Pos[1]) < 215.0);
            const AimAtCar = (!this.InTankCover && this.ExposedSeconds > 1.2 && (C.SalvoIdx % 4 === 0)) || LiveTanksInArc.length === 0;

            let TargetX, TargetY;
            if (!AimAtCar && LiveTanksInArc.length > 0)
            {
                const Pick = LiveTanksInArc[(C.SalvoIdx + CI) % LiveTanksInArc.length];
                const EstT = ClampScalar(Math.hypot(Pick.Pos[0] - C.Pos[0], Pick.Pos[1] - C.Pos[1]) / 88.0, 0.45, 1.65);
                TargetX = Pick.Pos[0] + Pick.Speed * EstT;
                TargetY = Pick.Pos[1];
            }
            else
            {
                TargetX = Car.Position[0] + Car.LinearVelocity[0] * 0.95;
                TargetY = Car.Position[1] + Car.LinearVelocity[1] * 0.95;
            }

            const DesiredYaw = Math.atan2(TargetY - C.Pos[1], TargetX - C.Pos[0]);
            C.Yaw += ClampScalar(AngleDelta(C.Yaw, DesiredYaw), -1.4 * Step, 1.4 * Step);

            const Range = Math.hypot(TargetX - C.Pos[0], TargetY - C.Pos[1]);
            if (C.Cooldown <= 0.0 && Range > 20.0 && Range < 225.0)
            {
                const Shell = this.Shells.find((S) => !S.Active);
                if (Shell)
                {
                    const FlightT = ClampScalar(Range / 88.0, 0.45, 1.65);
                    const G = 16.0;
                    const StartX = C.Pos[0] + Math.cos(C.Yaw) * 7.2;
                    const StartY = C.Pos[1] + Math.sin(C.Yaw) * 7.2;
                    const StartZ = C.Pos[2] + 0.74;
                    const DestZ  = QueryDDayTerrainHeight(TargetX, TargetY) + 0.35;
                    Shell.Active       = true;
                    Shell.Friendly     = false;
                    Shell.TargetBunker = -1;
                    Shell.Pos          = [StartX, StartY, StartZ];
                    Shell.Target       = [TargetX, TargetY];
                    Shell.Vel          = [
                        (TargetX - StartX) / FlightT,
                        (TargetY - StartY) / FlightT,
                        (DestZ - StartZ) / FlightT + 0.5 * G * FlightT
                    ];
                    this.Stats.ShellsFired++;
                    // Real 155mm Cannon Muzzle Smoke & Flame Puff!
                    this.Host?.Smoke?.Sources?.QueueBurst?.({
                        Position: [StartX, StartY, StartZ],
                        Radius:   0.55,
                        Velocity: [Math.cos(C.Yaw) * 11.0, Math.sin(C.Yaw) * 11.0, 2.0],
                        Smoke:    24.0, Heat: 38.0, Flame: 34.0, Soot: 18.0, Seconds: 0.34
                    });
                }
                C.SalvoIdx++;
                C.Cooldown = 2.85 + (CI % 3) * 0.55;
            }
        }

        // Advance Friendly 105mm Tank Shells & Enemy 155mm Coastal Artillery Shells
        for (const S of this.Shells)
        {
            if (!S.Active)
                continue;
            const PrevX = S.Pos[0], PrevY = S.Pos[1];
            S.Pos[0] += S.Vel[0] * Step;
            S.Pos[1] += S.Vel[1] * Step;
            S.Pos[2] += S.Vel[2] * Step;
            S.Vel[2] -= 16.0 * Step;

            if (S.Friendly)
            {
                // Friendly Allied Tank shell hitting an Enemy Bunker -> suppresses its MG Turret!
                const BP = DDayBunkerSites[S.TargetBunker]?.Pos;
                if (BP && Math.hypot(S.Pos[0] - BP[0], S.Pos[1] - BP[1]) < 4.5)
                {
                    S.Active = false;
                    if (this.MgTurrets[S.TargetBunker])
                    {
                        this.MgTurrets[S.TargetBunker].SuppressedTimer = 4.5;
                        this.Stats.BunkersSuppressed++;
                    }
                    this.TriggerExplosion(S.Pos[0], S.Pos[1], BP[2] + 2.0, 1.25, 4.0, 2.0, 0.0, CourseMaterial.Concrete);
                    continue;
                }
                if (S.Pos[2] <= QueryDDayTerrainHeight(S.Pos[0], S.Pos[1]))
                    S.Active = false;
                continue;
            }

            // Enemy 155mm Shell hitting an Advancing Allied Tank!
            const TerrZ = QueryDDayTerrainHeight(S.Pos[0], S.Pos[1]);
            let HitTank = -1;
            if (S.Pos[2] < TerrZ + 2.55)
                HitTank = this.FindBlockingTankAlongSegment(PrevX, PrevY, S.Pos[0], S.Pos[1]);

            if (HitTank >= 0)
            {
                S.Active = false;
                this.TriggerExplosion(S.Pos[0], S.Pos[1], S.Pos[2], 1.55, 6.0, 5.0, 0.0, CourseMaterial.SteelDark);
                this.DamageTank(HitTank, 35.0);
                continue;
            }

            if (S.Pos[2] <= TerrZ + 0.12)
            {
                S.Active = false;
                this.TriggerExplosion(S.Pos[0], S.Pos[1], TerrZ, 1.65, 8.8, 8.2, 22.0, CourseMaterial.Dirt);
                for (let TI = 0; TI < this.Tanks.length; ++TI)
                {
                    const T = this.Tanks[TI];
                    if (T.Alive && Math.hypot(T.Pos[0] - S.Pos[0], T.Pos[1] - S.Pos[1]) < 5.2)
                        this.DamageTank(TI, 34.0);
                }
            }
        }

        // ⑤ 4 Fighter-Bomber Aircraft: Bombing Runs + Flaming Crash-Dives Toward Cars!
        if (this.Clock >= this.NextCrashSortieClock)
        {
            this.TriggerAircraftCrashDive();
            this.NextCrashSortieClock = this.Clock + 6.8;
        }

        for (let AI = 0; AI < this.Aircraft.length; ++AI)
        {
            const A = this.Aircraft[AI];
            A.PropAngle = (A.PropAngle + Step * 58.0) % (Math.PI * 2.0);

            if (A.State === "flying")
            {
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Roll    = Math.sin(this.Clock * 1.4 + AI) * 0.18;
                A.Pitch   = 0.03;

                A.BombTimer -= Step;
                if (A.BombTimer <= 0.0 && A.BombsLeft > 0 && A.Pos[0] > -175.0 && A.Pos[0] < 182.0)
                {
                    this.DropAerialBomb(A);
                    A.BombsLeft--;
                    A.BombTimer = 0.76;
                }
                if (A.Pos[0] < -280.0 || A.Pos[0] > 300.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
            else if (A.State === "crashing")
            {
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Pos[2] += A.Vel[2] * Step;
                A.Vel[2] -= 5.2 * Step;
                A.Roll   += 6.2 * Step;
                A.Pitch   = 0.46;

                if ((Math.floor(this.Clock * 30) + AI) % 2 === 0)
                {
                    this.Host?.Sparks?.Emit?.([{
                        Point:    [A.Pos[0], A.Pos[1], A.Pos[2]],
                        Velocity: [-A.Vel[0] * 0.15, -A.Vel[1] * 0.15, 3.8],
                        Normal:   [0, 0, 1],
                        Strength: 2.8,
                        Rim:      null
                    }], 1.0 / 60.0);
                }

                const TerrZ  = QueryDDayTerrainHeight(A.Pos[0], A.Pos[1]);
                const HitCar = !this.KnockedOut && Math.hypot(A.Pos[0] - Car.Position[0], A.Pos[1] - Car.Position[1]) < 4.2 && A.Pos[2] < Car.Position[2] + 2.2;
                if (A.Pos[2] <= TerrZ + 0.55 || HitCar)
                {
                    A.Pos[2]     = TerrZ + 0.45;
                    A.State      = "wreck";
                    A.WreckTimer = 3.2;
                    this.Stats.PlanesCrashed++;
                    this.TriggerExplosion(A.Pos[0], A.Pos[1], TerrZ + 0.4, 2.35, 11.5, 10.8, 32.0, CourseMaterial.SteelDark);
                }
            }
            else
            {
                A.WreckTimer -= Step;
                if (A.WreckTimer <= 0.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
        }

        // Advance Falling 500-lb Bombs onto Uneven Terrain
        for (const B of this.Bombs)
        {
            if (!B.Active)
                continue;
            B.Pos[0] += B.Vel[0] * Step;
            B.Pos[1] += B.Vel[1] * Step;
            B.Pos[2] += B.Vel[2] * Step;
            B.Vel[2] -= 18.0 * Step;
            const TerrZ = QueryDDayTerrainHeight(B.Pos[0], B.Pos[1]);
            if (B.Pos[2] <= TerrZ + 0.18)
            {
                B.Active = false;
                this.TriggerExplosion(B.Pos[0], B.Pos[1], TerrZ, 1.85, 9.6, 9.2, 26.0, CourseMaterial.Dirt);
            }
        }

        // Age Lingering Volumetric Crater Smoke/Fire Vents
        for (let I = this.CraterFires.length - 1; I >= 0; --I)
        {
            this.CraterFires[I].Age += Step;
            if (this.CraterFires[I].Age >= this.CraterFires[I].Duration)
                this.CraterFires.splice(I, 1);
        }

        this.SyncGpuOccupants(false);
        return true;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                     REAL-TIME VOLUMETRIC PLUME EMISSIONS FOR SMOKESEQUENCE / PLUMESPACE
    //--------------------------------------------------------------------------------------------------------------------

    QueryPlumeEmissions()
    {
        if (!this.Enabled)
            return [];
        const Out = [];

        // ① Damaged, Cooking-Off & Destroyed Tank Volumetric Fire & Black Soot Columns
        for (const T of this.Tanks)
        {
            if (!T.Alive)
            {
                Out.push({
                    Active:    true,
                    Position:  [T.Pos[0] - 0.5, T.Pos[1], T.Pos[2] + 1.45],
                    Radius:    0.72,
                    Velocity:  [0.0, 0.0, 3.8],
                    SmokeRate: 22.0,
                    HeatRate:  36.0,
                    FlameRate: 28.0,
                    SootRate:  34.0
                });
            }
            else if (T.CookingOff)
            {
                Out.push({
                    Active:    true,
                    Position:  [T.Pos[0], T.Pos[1], T.Pos[2] + 1.65],
                    Radius:    0.65,
                    Velocity:  [0.0, 0.0, 5.2],
                    SmokeRate: 26.0,
                    HeatRate:  48.0,
                    FlameRate: 44.0,
                    SootRate:  30.0
                });
            }
            else if (T.Hp < 68.0)
            {
                const DmgFrac = 1.0 - T.Hp / 68.0;
                Out.push({
                    Active:    true,
                    Position:  [T.Pos[0] - 2.2, T.Pos[1], T.Pos[2] + 1.55],
                    Radius:    0.42,
                    Velocity:  [-1.5, 0.0, 2.6],
                    SmokeRate: 10.0 + 14.0 * DmgFrac,
                    HeatRate:  12.0 + 18.0 * DmgFrac,
                    FlameRate: DmgFrac > 0.55 ? 12.0 : 0.0,
                    SootRate:  14.0 + 16.0 * DmgFrac
                });
            }
        }

        // ② Flaming Shot-Down Crashing Aircraft & Wreck Plumes
        for (const A of this.Aircraft)
        {
            if (A.State !== "flying")
            {
                Out.push({
                    Active:    true,
                    Position:  [A.Pos[0], A.Pos[1], A.Pos[2] + 0.6],
                    Radius:    0.75,
                    Velocity:  A.State === "crashing" ? [-A.Vel[0] * 0.12, -A.Vel[1] * 0.12, 3.5] : [0.0, 0.0, 4.2],
                    SmokeRate: 24.0,
                    HeatRate:  42.0,
                    FlameRate: 36.0,
                    SootRate:  32.0
                });
            }
        }

        // ③ Lingering Volumetric Bomb / Mine / 155mm Shell Blast Plumes
        for (const CF of this.CraterFires)
        {
            const Fade = Math.max(0.0, 1.0 - CF.Age / CF.Duration);
            Out.push({
                Active:    true,
                Position:  CF.Pos,
                Radius:    0.58 * CF.Scale,
                Velocity:  [0.0, 0.0, (2.2 + 2.8 * Fade) * CF.Scale],
                SmokeRate: 18.0 * Fade * CF.Scale,
                HeatRate:  28.0 * Fade * CF.Scale,
                FlameRate: CF.Age < 0.55 ? (38.0 * (1.0 - CF.Age / 0.55) * CF.Scale) : 0.0,
                SootRate:  22.0 * Fade * CF.Scale
            });
        }

        return Out.slice(0, 14);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                              GPU OCCUPANT MATRIX STREAMING FOR DDAYBLOCK
    //--------------------------------------------------------------------------------------------------------------------

    SyncGpuOccupants(ResetHistory = false)
    {
        const Block = this.Scene?.DDayBlock;
        if (!Block)
            return;

        const SetOcc = (Idx, Xform, Visible = true) =>
        {
            if (Idx < 0 || !this.Scene.Occupants[Idx])
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

        // ① 5 Terrain-Conforming Tanks (Hull + Rotating / Popped-Off Turret)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            const QHull = MultiplyQuaternion(
                ConstructAxisQuaternion([0, 0, 1], T.Yaw),
                MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 1, 0], T.Pitch),
                    ConstructAxisQuaternion([1, 0, 0], T.Roll + (T.Alive ? 0.0 : 0.14))
                )
            );
            DrawChanged = SetOcc(Block.TankHulls[I], ConstructRigidTransform(T.Pos, QHull), true) || DrawChanged;

            let QTurret;
            if (T.Alive)
            {
                QTurret = MultiplyQuaternion(QHull, ConstructAxisQuaternion([0, 0, 1], T.TurretYaw));
            }
            else
            {
                QTurret = MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 0, 1], T.TurretYaw),
                    MultiplyQuaternion(
                        ConstructAxisQuaternion([0, 1, 0], T.TurretPitch),
                        ConstructAxisQuaternion([1, 0, 0], T.TurretRoll)
                    )
                );
            }
            DrawChanged = SetOcc(Block.TankTurrets[I], ConstructRigidTransform(T.TurretPos, QTurret), true) || DrawChanged;
        }

        // ② 6 Bunker MG Turrets & 6 Heavy Coastal Cannons
        for (let I = 0; I < this.MgTurrets.length; ++I)
        {
            const M = this.MgTurrets[I];
            DrawChanged = SetOcc(Block.MgTurrets[I], ConstructRigidTransform(M.Pos, ConstructAxisQuaternion([0, 0, 1], M.Yaw)), true) || DrawChanged;
        }
        for (let I = 0; I < this.Cannons.length; ++I)
        {
            const C = this.Cannons[I];
            DrawChanged = SetOcc(Block.Cannons[I], ConstructRigidTransform(C.Pos, ConstructAxisQuaternion([0, 0, 1], C.Yaw)), true) || DrawChanged;
        }

        // ③ 4 Aircraft + 4-Blade Spinning Propellers
        for (let I = 0; I < this.Aircraft.length; ++I)
        {
            const A = this.Aircraft[I];
            const QPlane = MultiplyQuaternion(
                MultiplyQuaternion(ConstructAxisQuaternion([0, 0, 1], A.Yaw), ConstructAxisQuaternion([0, 1, 0], A.Pitch)),
                ConstructAxisQuaternion([1, 0, 0], A.Roll)
            );
            DrawChanged = SetOcc(Block.Aircraft[I], ConstructRigidTransform(A.Pos, QPlane), true) || DrawChanged;

            const NoseOff = RotateVector(QPlane, [3.85, 0.0, 0.58]);
            const NosePos = [A.Pos[0] + NoseOff[0], A.Pos[1] + NoseOff[1], A.Pos[2] + NoseOff[2]];
            const QProp   = MultiplyQuaternion(QPlane, ConstructAxisQuaternion([1, 0, 0], A.PropAngle));
            DrawChanged = SetOcc(Block.Propellers[I], ConstructRigidTransform(NosePos, QProp), A.State !== "wreck") || DrawChanged;
        }

        // ④ 28 Armed Teller Landmines
        for (let I = 0; I < this.Mines.length; ++I)
        {
            const M = this.Mines[I];
            DrawChanged = SetOcc(Block.Mines[I], M.Armed ? ConstructRigidTransform(M.Pos, [0, 0, 0, 1]) : Parked, M.Armed) || DrawChanged;
        }

        // ⑤ Falling Bombs, 155mm/105mm Shells & Tracer Bolts
        for (let I = 0; I < this.Bombs.length; ++I)
        {
            const B = this.Bombs[I];
            if (!B.Active)
                DrawChanged = SetOcc(Block.Bombs[I], Parked, false) || DrawChanged;
            else
            {
                const Spd = Math.hypot(B.Vel[0], B.Vel[1], B.Vel[2]) || 1.0;
                const Q = MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 0, 1], Math.atan2(B.Vel[1], B.Vel[0])),
                    ConstructAxisQuaternion([0, 1, 0], Math.asin(ClampScalar(-B.Vel[2] / Spd, -0.98, 0.98)))
                );
                DrawChanged = SetOcc(Block.Bombs[I], ConstructRigidTransform(B.Pos, Q), true) || DrawChanged;
            }
        }

        for (let I = 0; I < this.Shells.length; ++I)
        {
            const S = this.Shells[I];
            if (!S.Active)
                DrawChanged = SetOcc(Block.Shells[I], Parked, false) || DrawChanged;
            else
            {
                const Spd = Math.hypot(S.Vel[0], S.Vel[1], S.Vel[2]) || 1.0;
                const Q = MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 0, 1], Math.atan2(S.Vel[1], S.Vel[0])),
                    ConstructAxisQuaternion([0, 1, 0], Math.asin(ClampScalar(-S.Vel[2] / Spd, -0.98, 0.98)))
                );
                DrawChanged = SetOcc(Block.Shells[I], ConstructRigidTransform(S.Pos, Q), true) || DrawChanged;
            }
        }

        for (let I = 0; I < this.Tracers.length; ++I)
        {
            const Tr = this.Tracers[I];
            if (!Tr.Active)
                DrawChanged = SetOcc(Block.Tracers[I], Parked, false) || DrawChanged;
            else
            {
                const Yaw = Math.atan2(Tr.Vel[1], Tr.Vel[0]);
                DrawChanged = SetOcc(Block.Tracers[I], ConstructRigidTransform(Tr.Pos, ConstructAxisQuaternion([0, 0, 1], Yaw)), true) || DrawChanged;
            }
        }

        if (DrawChanged)
            this.Scene.ConstructDrawRuns?.();
    }

    QueryDynamicLightRecords()
    {
        if (!this.Enabled)
            return [];
        const GateZ = QueryDDayTerrainHeight(191.0, 0.0);
        const Out = [
            {
                X: 189.5, Y:  10.5, Z: GateZ + 4.5,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [0.18, 1.0, 0.58], Intensity: 115.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
            },
            {
                X: 189.5, Y: -10.5, Z: GateZ + 4.5,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [0.18, 1.0, 0.58], Intensity: 115.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
            }
        ];

        for (const CF of this.CraterFires)
        {
            if (CF.Age > 0.55)
                continue;
            const Flash = 1.0 - CF.Age / 0.55;
            Out.push({
                X: CF.Pos[0], Y: CF.Pos[1], Z: CF.Pos[2] + 2.2,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [1.0, 0.54, 0.16], Intensity: 215.0 * Flash * CF.Scale, Reach: 48.0 * CF.Scale, Params: [0.1, -0.5, 0, 1]
            });
        }
        return Out;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                  ZERO-BLACK-BOX 3D + 2D HOLOGRAPHIC D-DAY BATTLEFIELD HUD OVERLAY
    //--------------------------------------------------------------------------------------------------------------------

    RenderHudOverlay(Ctx, W, H, Cam)
    {
        if (!this.Enabled)
            return;
        const Hud = this.Host.DrivingHud;
        const Car = this.Host.Vehicle;
        if (!Hud || !Car)
            return;

        // ① 3D Objective Beacon on THE WALL — Central Breach Gate
        const DistToWall = Math.max(0, Math.round(DDayWallGoalX - Car.Position[0]));
        const GateZ = QueryDDayTerrainHeight(191.0, 0.0);
        const GateScreen = Hud.ProjectWorld([191.0, 0.0, GateZ + 7.2], W, H, Cam);
        if (GateScreen)
        {
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
            Ctx.shadowBlur  = 8;
            Ctx.strokeStyle = "#5cf7b8";
            Ctx.lineWidth   = 2.6;
            const GX = GateScreen[0], GY = GateScreen[1];
            Ctx.beginPath();
            Ctx.moveTo(GX, GY - 11); Ctx.lineTo(GX + 11, GY);
            Ctx.lineTo(GX, GY + 11); Ctx.lineTo(GX - 11, GY);
            Ctx.closePath();
            Ctx.stroke();

            Ctx.fillStyle = "#6ef7c8";
            Ctx.font      = "800 13px 'DM Sans', system-ui, sans-serif";
            Ctx.textAlign = "center";
            Ctx.fillText(`🎯 THE WALL · BREACH GATE (${DistToWall}m)`, GX, GY - 18);
            Ctx.restore();
        }

        // ② 3D Allied Tank Cover Callouts + Suppressed Bunker Callouts
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            if (!T.Alive)
                continue;
            const Dist = Math.hypot(T.Pos[0] - Car.Position[0], T.Pos[1] - Car.Position[1]);
            if (Dist > 105.0)
                continue;
            const TP = Hud.ProjectWorld([T.Pos[0], T.Pos[1], T.Pos[2] + 3.05], W, H, Cam);
            if (!TP)
                continue;
            const Col = T.CookingOff ? "#ff4d5e" : (this.CoverTankIdx === I ? "#6ef7c8" : "#ffd26a");
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.86)";
            Ctx.shadowBlur  = 6;
            Ctx.fillStyle   = Col;
            Ctx.font        = "700 11px 'JetBrains Mono', monospace";
            Ctx.textAlign   = "center";
            const Tag = T.CookingOff
                ? "⚠️ COOKING OFF — BREAK COVER!"
                : (this.CoverTankIdx === I ? `🛡️ SHIELDED BY TANK · ${Math.round(T.Hp)}%` : `🛡️ COVER TANK · ${Math.round(T.Hp)}%`);
            Ctx.fillText(Tag, TP[0], TP[1]);
            Ctx.restore();
        }

        for (const MG of this.MgTurrets)
        {
            if (MG.SuppressedTimer <= 0.0)
                continue;
            const BP = Hud.ProjectWorld([MG.Pos[0], MG.Pos[1], MG.Pos[2] + 1.4], W, H, Cam);
            if (BP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
                Ctx.shadowBlur  = 5;
                Ctx.fillStyle   = "#7ce8ff";
                Ctx.font        = "700 10px 'JetBrains Mono', monospace";
                Ctx.textAlign   = "center";
                Ctx.fillText(`💥 BUNKER SUPPRESSED (${MG.SuppressedTimer.toFixed(1)}s)`, BP[0], BP[1]);
                Ctx.restore();
            }
        }

        // ③ Crashing Aircraft Warning & Terrain-Conforming Incoming Shell/Bomb Danger Rings
        for (const A of this.Aircraft)
        {
            if (A.State !== "crashing")
                continue;
            const AP = Hud.ProjectWorld([A.Pos[0], A.Pos[1], A.Pos[2] + 1.9], W, H, Cam);
            if (AP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
                Ctx.shadowBlur  = 7;
                Ctx.fillStyle   = "#ff4d5e";
                Ctx.font        = "800 12px 'DM Sans', system-ui, sans-serif";
                Ctx.textAlign   = "center";
                Ctx.fillText("✈️ CRASHING AIRCRAFT!", AP[0], AP[1]);
                Ctx.restore();
            }
        }

        const DrawDangerRing = (TX, TY, Radius, Color) =>
        {
            if (Math.hypot(TX - Car.Position[0], TY - Car.Position[1]) > 105.0)
                return;
            Ctx.beginPath();
            let Started = false;
            for (let K = 0; K <= 16; ++K)
            {
                const Ang = (K / 16) * Math.PI * 2.0;
                const RX = TX + Math.cos(Ang) * Radius;
                const RY = TY + Math.sin(Ang) * Radius;
                const RZ = QueryDDayTerrainHeight(RX, RY) + 0.14;
                const P  = Hud.ProjectWorld([RX, RY, RZ], W, H, Cam);
                if (!P) continue;
                if (!Started) { Ctx.moveTo(P[0], P[1]); Started = true; }
                else Ctx.lineTo(P[0], P[1]);
            }
            if (Started)
            {
                Ctx.strokeStyle = Color;
                Ctx.lineWidth   = 2.0;
                Ctx.setLineDash?.([6, 4]);
                Ctx.stroke();
                Ctx.setLineDash?.([]);
            }
        };

        for (const S of this.Shells)
            if (S.Active && !S.Friendly) DrawDangerRing(S.Target[0], S.Target[1], 4.8, "rgba(255, 76, 92, 0.78)");
        for (const B of this.Bombs)
            if (B.Active) DrawDangerRing(B.Target[0], B.Target[1], 5.6, "rgba(255, 192, 68, 0.78)");
        for (const A of this.Aircraft)
            if (A.State === "crashing") DrawDangerRing(A.CrashTarget[0], A.CrashTarget[1], 6.8, "rgba(255, 58, 72, 0.90)");

        // ④ Pure Optical Top Battlefield Header (ZERO black background boxes!)
        Ctx.save();
        Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
        Ctx.shadowBlur  = 7;
        Ctx.textAlign   = "center";

        const ArmorCol = this.VehicleArmor > 55 ? "#6ef7c8" : (this.VehicleArmor > 25 ? "#ffc858" : "#ff4d5e");
        Ctx.fillStyle = this.Breached ? "#6ef7c8" : "#ffcf6e";
        Ctx.font      = "800 15px 'DM Sans', system-ui, sans-serif";
        const Header  = this.Breached
            ? `🏆 THE WALL BREACHED! · TIME ${this.RunTimer.toFixed(1)}s${this.BestBreachSec !== null ? ` (BEST ${this.BestBreachSec.toFixed(1)}s)` : ""}`
            : `⚔️ OPERATION BREACH · ${DistToWall}m TO THE WALL · ${this.RunTimer.toFixed(1)}s`;
        Ctx.fillText(Header, W * 0.5, 24);

        const CoverState = this.InTankCover
            ? "🛡️ IN TANK COVER (TANKS DRAWING FIRE)"
            : (this.InCraterCover ? "🕳️ SHELL CRATER DEFILADE" : (this.ExposedSeconds > 0.85 ? "⚠️ EXPOSED IN OPEN — FLANK TO A TANK!" : "⚡ SPRINTING BETWEEN COVER"));
        Ctx.fillStyle = ArmorCol;
        Ctx.font      = "700 12px 'JetBrains Mono', monospace";
        Ctx.fillText(
            `🛡️ ARMOR ${Math.round(this.VehicleArmor)}%   |   ${CoverState}   |   MINES ${this.Mines.filter((M) => M.Armed).length}/28`,
            W * 0.5, 42
        );

        if (this.BannerTimer > 0.0 && this.BannerMessage)
        {
            Ctx.fillStyle = "#fff4d8";
            Ctx.font      = "800 16px 'DM Sans', system-ui, sans-serif";
            Ctx.fillText(this.BannerMessage, W * 0.5, 72);
        }
        Ctx.restore();
    }

    Dispose()
    {
        if (this.ControlStrip)
            this.ControlStrip.remove();
    }
}
