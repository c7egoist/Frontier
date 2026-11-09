//============================================================================================================================================
//                                                       DDAYCOMBATSEQUENCE.JS
//============================================================================================================================================
// ⚔️ Authentic Omaha Beach / Vierville Draw Combined-Arms Simulation ("dday"):
//    • 100% Real Engine Explosions: SmokeSequence 3D Navier-Stokes Volumetric Plumes + EffectSequence 216-chunk physical
//      shrapnel/earth bursts + swept-collision Sparks (ZERO fake box fireballs!).
//    • Natural 4-Stage Aircraft Shoot-Down & Belly-Skid Crash Physics:
//      AA flak airburst rocks an overhead Invasion-Striped Fighter-Bomber -> gravity-driven banking death-spiral trailing
//      engine fire & oil smoke -> high-speed belly impact shears off propeller & skids 35 m across uneven sand/craters
//      throwing dirt clods & sparks -> secondary fuel-tank detonation leaves a sloped, smouldering fuselage hulk!
//    • Winding Multi-Waypoint OD#9 Sherman Tanks: punch through Shingle Bangalore Breaches & Bluff Draws, recoil on 75mm
//      cannon fire, crush Barbed Wire entanglements, clear Tellermines, draw German Casemate aggro & suppress Bunkers!
//    • Tactical Cover & Kill-Zone Counterplay:
//      1. Sherman Tank Armored Lee   2. -1.42 m Sunken Zig-Zag Trenches (tracers fly overhead!)
//      3. Shingle Seawall / Craters  4. Enfilade Kill Zones with 0.7s stitched-sand warning bursts before chassis hits!

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
    DDayBarbedWirePlacements,
    DDayBunkerSites,
    DDayCannonMounts,
    DDayKillZones,
    DDayMgMounts,
    DDayMineCoordinates,
    DDaySpawn,
    DDayTankWaypoints,
    DDayWallGoalX,
    QueryDDayTerrainHeight,
    QueryDDayTrenchDepth
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
        this.Host              = Host;
        this.Scene             = Host.Scene;
        this.Enabled           = (Host.LevelKey === "dday") && Boolean(this.Scene?.DDayBlock);

        this.Clock             = 0.0;
        this.RunTimer          = 0.0;
        this.BestBreachSec     = null;
        this.Breached          = false;
        this.VehicleArmor      = 100.0;
        this.KnockedOut        = false;
        this.KnockoutTimer     = 0.0;

        // Tactical Cover & Kill-Zone State
        this.InTankCover       = false;
        this.InTrenchCover     = false;
        this.InDefiladeCover   = false; // Shingle seawall lee or deep shell crater
        this.CoverTankIdx      = -1;
        this.ActiveKillZone    = null;
        this.ExposedSeconds    = 0.0;
        this.NearMineDist      = 99.0;
        this.NearMinePos       = null;

        this.BannerMessage     = "";
        this.BannerTimer       = 0.0;
        this.NextFlakDownClock = 4.8;

        // Dynamic Battlefield Pools
        this.Tanks             = [];
        this.MgTurrets         = [];
        this.Cannons           = [];
        this.Aircraft          = [];
        this.Mines             = [];
        this.BarbedWires       = [];
        this.Bombs             = [];
        this.Shells            = [];
        this.Tracers           = [];
        this.CraterFires       = [];

        this.Stats = {
            MinesDetonated:    0,
            WireCrushed:       0,
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
            this.BannerMessage = "⚔️ OMAHA BEACH — USE SHERMAN TANKS, THE SHINGLE SEAWALL & SUNKEN TRENCHES TO BREACH THE WALL!";
            this.BannerTimer   = 5.2;
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                 BATTLEFIELD INITIALIZATION & RESET
    //--------------------------------------------------------------------------------------------------------------------

    InitializeBattlefield()
    {
        // ① 5 OD#9 M4 Sherman Assault Tanks steering along winding multi-waypoint beach-to-draw routes!
        const BaseSpeeds = [9.4, 8.9, 8.6, 8.8, 9.1];
        this.Tanks = DDayTankWaypoints.map((Route, I) =>
        {
            const [SX, SY] = Route[0];
            const [NX, NY] = Route[1];
            const InitYaw  = Math.atan2(NY - SY, NX - SX);
            const GZ       = QueryDDayTerrainHeight(SX, SY);
            return {
                Index:        I,
                Route,
                WpIndex:      1,
                Pos:          [SX, SY, GZ],
                BaseSpeed:    BaseSpeeds[I],
                Speed:        BaseSpeeds[I],
                Yaw:          InitYaw,
                Pitch:        0.0,
                Roll:         0.0,
                RecoilPitch:  0.0,
                HitRockRoll:  0.0,
                TurretYaw:    0.0,
                FireCooldown: 0.9 + I * 0.62,
                Hp:           100.0,
                Alive:        true,
                CookingOff:   false,
                CookTimer:    0.0,
                WreckTimer:   0.0,
                TurretPos:    [SX, SY, GZ + 1.52],
                TurretVel:    [0.0, 0.0, 0.0],
                TurretPitch:  0.0,
                TurretRoll:   0.0
            };
        });

        // ② 6 Elevated Enfilade Casemate MG-42 Cupolas
        this.MgTurrets = DDayMgMounts.map((Pos, I) => ({
            Index:           I,
            BunkerPos:       DDayBunkerSites[I].Pos,
            DefaultYaw:      DDayBunkerSites[I].Yaw,
            Pos:             [...Pos],
            Yaw:             DDayBunkerSites[I].Yaw,
            Cooldown:        0.18 * I,
            BurstRem:        6,
            SuppressedTimer: 0.0,
            TargetingCar:    false
        }));

        // ③ 6 Bluff & Headland 155mm Coastal Artillery Guns
        this.Cannons = DDayCannonMounts.map((Pos, I) => ({
            Index:    I,
            Pos:      [...Pos],
            Yaw:      Math.PI,
            Cooldown: 0.70 + I * 0.50,
            SalvoIdx: I
        }));

        // ④ 4 Invasion-Striped Fighter-Bombers on Sweeping Combat Sorties
        this.Aircraft = [0, 1, 2, 3].map((I) => this.CreateFreshAircraftSortie(I, true));

        // ⑤ 28 Subtle Partially-Buried Tellermines (flush in soil along un-cleared shoulders/shortcuts!)
        this.Mines = DDayMineCoordinates.map(([X, Y], I) => ({
            Index: I,
            Pos:   [X, Y, QueryDDayTerrainHeight(X, Y) + 0.005],
            Armed: true
        }));

        // ⑥ 24 Interactive Crushable/Snaggable Concertina Barbed Wire Entanglements!
        const WireCount = Math.min(DDayBarbedWirePlacements.length, this.Scene.DDayBlock.BarbedWire?.length || 0);
        this.BarbedWires = DDayBarbedWirePlacements.slice(0, WireCount).map(([X, Y, Yaw], I) => ({
            Index:  I,
            Pos:    [X, Y, QueryDDayTerrainHeight(X, Y) - 0.04],
            Yaw,
            Intact: true
        }));

        // ⑦ Ordnance & Volumetric Crater Fire Pools
        const Block = this.Scene.DDayBlock;
        this.Bombs   = Array.from({ length: Block.Bombs.length },   () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0] }));
        this.Shells  = Array.from({ length: Block.Shells.length },  () => ({ Active: false, Friendly: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0], TargetBunker: -1 }));
        this.Tracers = Array.from({ length: Block.Tracers.length }, () => ({ Active: false, Friendly: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Life: 0 }));
        this.CraterFires = [];

        this.SyncGpuOccupants(true);
    }

    CreateFreshAircraftSortie(Slot, Initial = false)
    {
        const FromEast = (Slot % 2) === 0;
        const StartX   = FromEast ? (Initial ? 165.0 - Slot * 75.0 : 272.0) : (Initial ? -215.0 + Slot * 55.0 : -268.0);
        const StartY   = ((Slot - 1.5) * 16.5) + Math.sin(this.Clock * 1.3 + Slot * 1.9) * 8.0;
        const Alt      = 27.0 + (Slot % 3) * 4.2;
        const DirX     = FromEast ? -1.0 : 1.0;
        const DirY     = (Slot & 1) ? 0.11 : -0.11;
        const Norm     = Math.hypot(DirX, DirY);
        const Speed    = 54.0 + Slot * 3.2;

        return {
            Slot,
            State:        "flying", // "flying" | "diving" | "skidding" | "wreck"
            PropAttached: true,
            Pos:          [StartX, StartY, Alt],
            Vel:          [(DirX / Norm) * Speed, (DirY / Norm) * Speed, 0.0],
            Yaw:          Math.atan2(DirY, DirX),
            Pitch:        0.02,
            Roll:         0.0,
            RollRate:     0.0,
            SkidYawRate:  0.0,
            SkidTimer:    0.0,
            ClodCooldown: 0.0,
            PropAngle:    Slot * 1.1,
            BombTimer:    Initial ? (0.85 + Slot * 0.65) : 1.1,
            BombsLeft:    3,
            WreckTimer:   0.0,
            CrashTarget:  [0.0, 0.0]
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
        this.BannerMessage = "⚔️ SECOND WAVE LANDED — THREAD THE SHINGLE GAP OR DIVE INTO THE DOG-GREEN TRENCH!";
        this.BannerTimer   = 3.8;
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

        MakePill("🔄 NEW WAVE ASSAULT", "rgba(110, 247, 200, 0.65)", () => this.RestartGauntlet());
        MakePill("💥 FLAK SHOOT-DOWN",  "rgba(255, 112, 92, 0.72)",  () => this.TriggerAircraftCrashDive());
        MakePill("🛡️ FIELD ARMOR +100%", "rgba(255, 198, 82, 0.65)", () =>
        {
            this.VehicleArmor = 100.0;
            this.KnockedOut   = false;
            this.BannerMessage = "🛡️ COMBAT ENGINEERS PATCHED HULL ARMOR TO 100%!";
            this.BannerTimer   = 2.2;
        });

        HostBar.appendChild(Wrap);
        this.ControlStrip = Wrap;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //          REAL ENGINE VOLUMETRIC PLUMES + 216-CHUNK DEBRIS + SPARKS + SUSPENSION CONCUSSION SHOCKWAVES
    //--------------------------------------------------------------------------------------------------------------------

    TriggerExplosion(X, Y, Z, Scale = 1.4, BlastRadius = 8.5, BlastImpulse = 8.0, MaxCarDamage = 22.0, DebrisMat = CourseMaterial.ScorchedMud)
    {
        const GroundZ = Math.max(Z, QueryDDayTerrainHeight(X, Y));

        // ① Real 3D Navier-Stokes Volumetric Fire + Heat + Soot + Smoke Burst!
        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [X, Y, GroundZ + 0.36],
            Radius:   0.62 * Scale,
            Velocity: [0.0, 0.0, 4.8 * Scale],
            Smoke:    34.0 * Scale,
            Heat:     62.0 * Scale,
            Flame:    54.0 * Scale,
            Soot:     44.0 * Scale,
            Seconds:  0.68 + 0.25 * Scale
        });

        // ② Lingering Volumetric Crater Smoke & Embers
        this.CraterFires.push({
            Pos:      [X, Y, GroundZ + 0.22],
            Age:      0.0,
            Duration: 2.4 + 0.65 * Scale,
            Scale
        });
        if (this.CraterFires.length > 10)
            this.CraterFires.shift();

        // ③ Real 216-Chunk Physical Earth/Shrapnel Fountain (EffectKind.Debris)
        this.Host?.Effects?.BurstTyre?.(
            ConstructRigidTransform([X, Y, GroundZ + 0.30], [0.0, 0.0, 0.0, 1.0]),
            [0.85 * Scale, 0.85 * Scale, 0.55 * Scale],
            [0.0, 0.0, 4.6 * Scale],
            DebrisMat
        );

        // ④ Swept-Collision Bouncing Sparks
        const SparkEvents = [];
        for (let K = 0; K < 8; ++K)
        {
            const Ang = (K / 8) * Math.PI * 2.0 + this.Clock * 3.1;
            const OutSpd = (5.5 + (K % 3) * 2.4) * Scale;
            SparkEvents.push({
                Point:    [X + Math.cos(Ang) * 0.35, Y + Math.sin(Ang) * 0.35, GroundZ + 0.44],
                Velocity: [Math.cos(Ang) * OutSpd, Math.sin(Ang) * OutSpd, (5.5 + (K % 2) * 3.0) * Scale],
                Normal:   [0.0, 0.0, 1.0],
                Strength: 3.1 * Scale,
                Rim:      null
            });
        }
        this.Host?.Sparks?.Emit?.(SparkEvents, 1.0 / 60.0);

        // ⑤ Procedural Sub-Bass Concussion + Tactile Chassis Suspension Shockwave!
        const Car = this.Host?.Vehicle;
        if (Car)
        {
            const DistToCar = Math.hypot(Car.Position[0] - X, Car.Position[1] - Y);
            if (DistToCar < 150.0)
            {
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(
                    ClampScalar(1.0 - DistToCar / 150.0, 0.12, 1.0) * ClampScalar(Scale * 0.65, 0.5, 1.35)
                );
            }

            // Near-miss artillery shockwave rocks the car's suspension roll/pitch so explosions FEEL physical!
            if (DistToCar < BlastRadius * 2.2 && !this.KnockedOut)
            {
                const Shock = ClampScalar(1.0 - DistToCar / (BlastRadius * 2.2), 0.0, 1.0) * Scale;
                const SideSign = (Car.Position[1] - Y) >= 0 ? 1.0 : -1.0;
                Car.AngularVelocity[0] += SideSign * 0.65 * Shock;
                Car.AngularVelocity[1] -= 0.42 * Shock;
            }

            if (DistToCar < BlastRadius && !this.KnockedOut && MaxCarDamage > 0.0)
            {
                const ShieldTank = this.FindBlockingTankAlongSegment(X, Y, Car.Position[0], Car.Position[1], -1);
                // Sunken Trench walls also halve blast wave from surface impacts outside the trench!
                const TrenchFactor = (this.InTrenchCover && DistToCar > 3.2) ? 0.35 : 1.0;
                if (ShieldTank < 0)
                {
                    const Falloff = (1.0 - (DistToCar / BlastRadius)) * TrenchFactor;
                    const DirX = DistToCar > 0.25 ? (Car.Position[0] - X) / DistToCar : -1.0;
                    const DirY = DistToCar > 0.25 ? (Car.Position[1] - Y) / DistToCar :  0.3;
                    Car.LinearVelocity[0] += DirX * BlastImpulse * Falloff;
                    Car.LinearVelocity[1] += DirY * BlastImpulse * Falloff;
                    Car.LinearVelocity[2] += BlastImpulse * 0.72 * Falloff;
                    Car.AngularVelocity[2] += (DirY >= 0 ? 1 : -1) * 0.95 * Falloff;
                    this.ApplyCarDamage(MaxCarDamage * Falloff, "ARTILLERY BLAST");
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
            this.BannerMessage = `💥 VEHICLE KNOCKED OUT BY ${SourceLabel} — REDEPLOYING AT LCVP RAMP!`;
            this.BannerTimer   = 2.8;
            const P = this.Host.Vehicle.Position;
            this.TriggerExplosion(P[0], P[1], P[2], 1.75, 3.0, 3.0, 0.0, CourseMaterial.SteelDark);
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                 SHERMAN TANK SHIELDING, BARBED WIRE CRUSHING, TRENCH DEFILADE & KILL ZONES
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
            const MinY = T.Pos[1] - 2.10, MaxY = T.Pos[1] + 2.10;
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
        T.HitRockRoll = (TankIdx % 2 === 0 ? 1.0 : -1.0) * 0.085;
        if (InstantDetonate || Damage >= 100.0)
        {
            this.DetonateTankCatastrophic(TankIdx);
            return;
        }
        if (T.Hp <= 0.0 && !T.CookingOff)
        {
            T.CookingOff = true;
            T.CookTimer  = 1.55;
            T.Speed      = T.BaseSpeed * 0.25;
            if (this.CoverTankIdx === TankIdx)
            {
                this.BannerMessage = "⚠️ SHERMAN AMMO COOKING OFF — BREAK COVER TO TRENCH OR NEXT TANK!";
                this.BannerTimer   = 2.3;
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
            Math.sin(this.Clock * 13.0 + TankIdx) * 4.2,
            (TankIdx % 2 === 0 ? 3.8 : -3.8),
            12.2
        ];
        this.Stats.TanksExploded++;
        this.TriggerExplosion(T.Pos[0], T.Pos[1], T.Pos[2] + 0.8, 2.25, 10.2, 9.2, 25.0, CourseMaterial.OliveDrabDark);
    }

    BreakBarbedWire(Wire, ByCar = false)
    {
        if (!Wire.Intact)
            return;
        Wire.Intact = false;
        this.Stats.WireCrushed++;
        this.Host?.Effects?.BurstTyre?.(
            ConstructRigidTransform([Wire.Pos[0], Wire.Pos[1], Wire.Pos[2] + 0.55], [0, 0, 0, 1]),
            [0.55, 1.85, 0.45],
            [2.0, 0.0, 2.8],
            CourseMaterial.Wood
        );
        this.Host?.Sparks?.Emit?.([
            { Point: [Wire.Pos[0], Wire.Pos[1] - 0.8, Wire.Pos[2] + 0.5], Velocity: [2.5, -2.2, 3.2], Normal: [0, 0, 1], Strength: 2.2, Rim: null },
            { Point: [Wire.Pos[0], Wire.Pos[1] + 0.8, Wire.Pos[2] + 0.5], Velocity: [2.5,  2.2, 3.2], Normal: [0, 0, 1], Strength: 2.2, Rim: null }
        ], 1.0 / 60.0);

        if (ByCar && this.Host?.Vehicle)
        {
            const Car = this.Host.Vehicle;
            Car.LinearVelocity[0] *= 0.56;
            Car.LinearVelocity[1] *= 0.56;
            this.ApplyCarDamage(5.5, "BARBED WIRE SNAG");
            if (this.BannerTimer <= 0.2)
            {
                this.BannerMessage = "🪡 BARBED WIRE SNAGGED CHASSIS — THREAD BANGALORE GAPS OR FOLLOW TANK RUTS!";
                this.BannerTimer   = 2.1;
            }
        }
    }

    ResolveCoverKillZonesAndWire(Car, Step)
    {
        this.InTankCover     = false;
        this.InTrenchCover   = false;
        this.InDefiladeCover = false;
        this.CoverTankIdx    = -1;
        this.ActiveKillZone  = null;

        const CX = Car.Position[0], CY = Car.Position[1];

        // ① Check Sherman Tank Armored Lee (oriented in the Tank's local frame so winding routes work cleanly!)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            const DX = CX - T.Pos[0], DY = CY - T.Pos[1];
            const CosY = Math.cos(T.Yaw), SinY = Math.sin(T.Yaw);
            const LocalX =  DX * CosY + DY * SinY;
            const LocalY = -DX * SinY + DY * CosY;

            if (T.Alive && ((LocalX >= -18.0 && LocalX <= -3.3 && Math.abs(LocalY) <= 4.5) || (Math.abs(LocalX) <= 5.0 && Math.abs(LocalY) <= 5.4)))
            {
                this.InTankCover  = true;
                this.CoverTankIdx = I;
            }

            // Solid Tank Hull Push-Out in Tank's oriented frame
            const HalfX = 5.55, HalfY = 2.90;
            if (Math.abs(LocalX) < HalfX && Math.abs(LocalY) < HalfY && Car.Position[2] < T.Pos[2] + 2.35)
            {
                const PenX = HalfX - Math.abs(LocalX);
                const PenY = HalfY - Math.abs(LocalY);
                if (PenX < PenY)
                {
                    const S = LocalX >= 0 ? 1.0 : -1.0;
                    const PushX = (LocalX + S * PenX) * CosY - LocalY * SinY;
                    const PushY = (LocalX + S * PenX) * SinY + LocalY * CosY;
                    Car.Position[0] = T.Pos[0] + PushX;
                    Car.Position[1] = T.Pos[1] + PushY;
                }
                else
                {
                    const S = LocalY >= 0 ? 1.0 : -1.0;
                    const PushX = LocalX * CosY - (LocalY + S * PenY) * SinY;
                    const PushY = LocalX * SinY + (LocalY + S * PenY) * CosY;
                    Car.Position[0] = T.Pos[0] + PushX;
                    Car.Position[1] = T.Pos[1] + PushY;
                }
            }
        }

        // ② Sunken Zig-Zag Trench Hull-Down Defilade (-1.42 m below surrounding plateau!)
        const TrenchDepth = QueryDDayTrenchDepth(CX, CY);
        if (TrenchDepth > 0.62)
            this.InTrenchCover = true;

        // ③ Shingle Seawall Lee (tucked right on the seaward slope X ∈ [-153..-142] outside gaps) or Deep Bomb Crater!
        const SurroundZ = 0.25 * (
            QueryDDayTerrainHeight(CX + 5.0, CY) + QueryDDayTerrainHeight(CX - 5.0, CY) +
            QueryDDayTerrainHeight(CX, CY + 5.0) + QueryDDayTerrainHeight(CX, CY - 5.0)
        );
        const LocalZ = QueryDDayTerrainHeight(CX, CY);
        if ((CX >= -153.5 && CX <= -141.5 && QueryDDayTerrainHeight(CX + 3.5, CY) - LocalZ > 0.45) || (SurroundZ - LocalZ > 0.36))
            this.InDefiladeCover = true;

        // ④ Check Active Interlocking Enfilade Kill Zones
        for (const KZ of DDayKillZones)
        {
            const NX = (CX - KZ.Center[0]) / KZ.RadiusX;
            const NY = (CY - KZ.Center[1]) / KZ.RadiusY;
            if (NX * NX + NY * NY <= 1.0)
            {
                this.ActiveKillZone = KZ.Name;
                break;
            }
        }

        if (this.InTankCover || this.InTrenchCover || this.InDefiladeCover)
            this.ExposedSeconds = Math.max(0.0, this.ExposedSeconds - Step * 2.6);
        else
            this.ExposedSeconds += Step * (this.ActiveKillZone ? 1.35 : 0.85);

        // ⑤ Interactive Barbed Wire Collisions (Sherman Tanks crush wire free; Player Car snags & rips through!)
        for (const W of this.BarbedWires)
        {
            if (!W.Intact)
                continue;
            if (!this.KnockedOut && Math.abs(CX - W.Pos[0]) < 1.65 && Math.abs(CY - W.Pos[1]) < 2.95)
            {
                this.BreakBarbedWire(W, true);
                continue;
            }
            for (const T of this.Tanks)
            {
                if (T.Alive && Math.abs(T.Pos[0] - W.Pos[0]) < 3.6 && Math.abs(T.Pos[1] - W.Pos[1]) < 3.2)
                {
                    this.BreakBarbedWire(W, false);
                    break;
                }
            }
        }

        // ⑥ Close-Range Metallic Mine Detector Warning (< 8.0 m)
        this.NearMineDist = 99.0;
        this.NearMinePos  = null;
        for (const M of this.Mines)
        {
            if (!M.Armed)
                continue;
            const D = Math.hypot(CX - M.Pos[0], CY - M.Pos[1]);
            if (D < this.NearMineDist)
            {
                this.NearMineDist = D;
                this.NearMinePos  = M.Pos;
            }
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //       NATURAL 4-STAGE AIRCRAFT FLAK HIT -> GRAVITY SPIRAL -> 35m BELLY SKID -> FUEL COOK-OFF BREAKUP!
    //--------------------------------------------------------------------------------------------------------------------

    TriggerAircraftCrashDive()
    {
        const Car = this.Host?.Vehicle;
        if (!Car)
            return null;

        // Pick an already-flying plane in the sky (never teleport instantaneously onto the car!)
        let Plane = this.Aircraft.find((A) => A.State === "flying" && Math.abs(A.Pos[0] - Car.Position[0]) < 165.0);
        if (!Plane)
            Plane = this.Aircraft.find((A) => A.State === "flying");
        if (!Plane)
            return null;

        // Position high on an authentic combat pass ahead/flanking the car if it was far off-screen at the horizon
        if (Math.abs(Plane.Pos[0] - Car.Position[0]) > 145.0)
        {
            Plane.Pos = [
                ClampScalar(Car.Position[0] + 95.0, -185.0, 205.0),
                ClampScalar(Car.Position[1] + (Plane.Slot % 2 === 0 ? 28.0 : -28.0), -36.0, 36.0),
                31.0
            ];
        }

        Plane.State = "diving";
        const AimX = ClampScalar(Car.Position[0] + Car.LinearVelocity[0] * 1.35 + 22.0, -185.0, 182.0);
        const AimY = ClampScalar(Car.Position[1] + (Plane.Slot % 2 === 0 ? -5.5 : 5.5), -24.0, 24.0);
        Plane.CrashTarget = [AimX, AimY];

        // Compute natural ballistic entry velocity under gravity (-13.5 m/s²) so it arcs smoothly into a shallow belly-skid angle!
        const ImpactZ = QueryDDayTerrainHeight(AimX, AimY) + 0.42;
        const Gravity = 13.5;
        const FlightT = 1.65;
        Plane.Vel = [
            (AimX - Plane.Pos[0]) / FlightT,
            (AimY - Plane.Pos[1]) / FlightT,
            (ImpactZ - Plane.Pos[2] + 0.5 * Gravity * FlightT * FlightT) / FlightT
        ];
        Plane.Yaw      = Math.atan2(Plane.Vel[1], Plane.Vel[0]);
        Plane.RollRate = (Plane.Slot % 2 === 0 ? 1.0 : -1.0) * 2.35;

        // Visible AA Flak Airburst Puff in the sky right off the wingtip!
        this.Host?.Smoke?.Sources?.QueueBurst?.({
            Position: [Plane.Pos[0], Plane.Pos[1] + 2.2, Plane.Pos[2] - 0.5],
            Radius:   1.35,
            Velocity: [Plane.Vel[0] * 0.2, Plane.Vel[1] * 0.2, 2.2],
            Smoke:    42.0, Heat: 55.0, Flame: 46.0, Soot: 48.0, Seconds: 0.55
        });
        this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(0.55);

        this.BannerMessage = "💥 FIGHTER-BOMBER HIT BY FLAK OVERHEAD — WATCH FOR SKIDDING WRECKAGE!";
        this.BannerTimer   = 2.6;
        return Plane;
    }

    DropAerialBomb(Plane)
    {
        const Slot = this.Bombs.find((B) => !B.Active);
        if (!Slot)
            return;
        Slot.Active = true;
        Slot.Pos    = [Plane.Pos[0], Plane.Pos[1], Plane.Pos[2] - 0.85];
        Slot.Vel    = [Plane.Vel[0] * 0.42, Plane.Vel[1] * 0.42, -3.2];
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
            this.BannerMessage = `🏆 ATLANTIC WALL BREACHED IN ${this.RunTimer.toFixed(1)}s! CLICK [NEW WAVE ASSAULT] TO RACE AGAIN!`;
            this.BannerTimer   = 8.0;
        }

        // ① Advance the 5 Winding OD#9 Sherman Assault Tanks (terrain pitch/roll + gun recoil + bunker suppression!)
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

                // Steer smoothly along winding tactical route waypoints!
                const TargetWP = T.Route[T.WpIndex];
                const WDX = TargetWP[0] - T.Pos[0], WDY = TargetWP[1] - T.Pos[1];
                const WDist = Math.hypot(WDX, WDY);
                if (WDist < 6.5)
                {
                    T.WpIndex++;
                    if (T.WpIndex >= T.Route.length)
                    {
                        T.WpIndex = 1;
                        T.Pos[0]  = T.Route[0][0];
                        T.Pos[1]  = T.Route[0][1];
                        T.Hp      = 100.0;
                    }
                }
                else
                {
                    const DesiredHullYaw = Math.atan2(WDY, WDX);
                    T.Yaw += ClampScalar(AngleDelta(T.Yaw, DesiredHullYaw), -0.85 * Step, 0.85 * Step);
                }

                T.Pos[0] += Math.cos(T.Yaw) * T.Speed * Step;
                T.Pos[1] += Math.sin(T.Yaw) * T.Speed * Step;

                // Decay physical gun-recoil pitch & shell-impact roll shudder
                T.RecoilPitch *= Math.exp(-5.5 * Step);
                T.HitRockRoll *= Math.exp(-6.0 * Step);

                // Sample 4 track corners in Tank's oriented frame for authentic terrain pitch & roll!
                const CosY = Math.cos(T.Yaw), SinY = Math.sin(T.Yaw);
                const ZF  = QueryDDayTerrainHeight(T.Pos[0] + CosY * 2.6, T.Pos[1] + SinY * 2.6);
                const ZR  = QueryDDayTerrainHeight(T.Pos[0] - CosY * 2.6, T.Pos[1] - SinY * 2.6);
                const ZL  = QueryDDayTerrainHeight(T.Pos[0] - SinY * 1.4, T.Pos[1] + CosY * 1.4);
                const ZRt = QueryDDayTerrainHeight(T.Pos[0] + SinY * 1.4, T.Pos[1] - CosY * 1.4);
                T.Pos[2]    = 0.25 * (ZF + ZR + ZL + ZRt);
                T.Pitch     = Math.atan2(ZR - ZF, 5.2) + T.RecoilPitch;
                T.Roll      = Math.atan2(ZL - ZRt, 2.8) + T.HitRockRoll;
                T.TurretPos = [T.Pos[0], T.Pos[1], T.Pos[2] + 1.52];

                // Slew 75mm Sherman Turret onto nearest German Bluff Casemate & fire suppressing HE shells!
                let BestBunker = -1, BestBDist = 122.0;
                for (let B = 0; B < DDayBunkerSites.length; ++B)
                {
                    const BP = DDayBunkerSites[B].Pos;
                    if (BP[0] < T.Pos[0] - 12.0)
                        continue;
                    const D = Math.hypot(BP[0] - T.Pos[0], BP[1] - T.Pos[1]);
                    if (D < BestBDist) { BestBDist = D; BestBunker = B; }
                }
                const DesiredWorldTYaw = BestBunker >= 0
                    ? Math.atan2(DDayBunkerSites[BestBunker].Pos[1] - T.Pos[1], DDayBunkerSites[BestBunker].Pos[0] - T.Pos[0])
                    : (T.Yaw + Math.sin(this.Clock * 0.8 + I) * 0.22);
                const DesiredRelTYaw = AngleDelta(T.Yaw, DesiredWorldTYaw);
                T.TurretYaw += ClampScalar(AngleDelta(T.TurretYaw, DesiredRelTYaw), -1.9 * Step, 1.9 * Step);

                T.FireCooldown -= Step;
                if (!T.CookingOff && BestBunker >= 0 && T.FireCooldown <= 0.0)
                {
                    T.FireCooldown = 3.2 + (I % 3) * 0.55;
                    const Shell = this.Shells.find((S) => !S.Active);
                    if (Shell)
                    {
                        const WorldAim = T.Yaw + T.TurretYaw;
                        const BP = DDayBunkerSites[BestBunker].Pos;
                        const MuzzleX = T.Pos[0] + Math.cos(WorldAim) * 5.1;
                        const MuzzleY = T.Pos[1] + Math.sin(WorldAim) * 5.1;
                        const MuzzleZ = T.Pos[2] + 1.92;
                        const FlightT = ClampScalar(BestBDist / 95.0, 0.35, 1.25);
                        Shell.Active       = true;
                        Shell.Friendly     = true;
                        Shell.TargetBunker = BestBunker;
                        Shell.Pos          = [MuzzleX, MuzzleY, MuzzleZ];
                        Shell.Target       = [BP[0], BP[1]];
                        Shell.Vel          = [
                            (BP[0] - MuzzleX) / FlightT,
                            (BP[1] - MuzzleY) / FlightT,
                            ((BP[2] + 2.0) - MuzzleZ) / FlightT + 0.5 * 16.0 * FlightT
                        ];
                        T.RecoilPitch = -0.078; // visible physical 75mm cannon recoil!
                        this.Stats.TankShotsFired++;
                        this.Host?.Smoke?.Sources?.QueueBurst?.({
                            Position: [MuzzleX, MuzzleY, MuzzleZ],
                            Radius:   0.46,
                            Velocity: [Math.cos(WorldAim) * 9.5, Math.sin(WorldAim) * 9.5, 1.5],
                            Smoke:    20.0, Heat: 34.0, Flame: 30.0, Soot: 14.0, Seconds: 0.28
                        });
                    }
                }
            }
            else
            {
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
                    const [SX, SY] = T.Route[0];
                    const StartZ   = QueryDDayTerrainHeight(SX, SY);
                    T.Alive        = true;
                    T.CookingOff   = false;
                    T.Hp           = 100.0;
                    T.WpIndex      = 1;
                    T.Speed        = T.BaseSpeed;
                    T.Pos          = [SX, SY, StartZ];
                    T.TurretPos    = [SX, SY, StartZ + 1.52];
                    T.TurretPitch  = 0.0;
                    T.TurretRoll   = 0.0;
                }
            }
        }

        // Update Cover, Sunken Trenches, Kill Zones & Barbed Wire
        this.ResolveCoverKillZonesAndWire(Car, Step);

        // ② Subtle Buried Tellermines: Detonate on Car (< 2.35 m) OR Sherman Plow (< 3.10 m)!
        for (const M of this.Mines)
        {
            if (!M.Armed)
                continue;
            const CarDist = Math.hypot(Car.Position[0] - M.Pos[0], Car.Position[1] - M.Pos[1]);
            if (!this.KnockedOut && CarDist < 2.35 && (Car.Position[2] - M.Pos[2]) < 1.70)
            {
                M.Armed = false;
                this.Stats.MinesDetonated++;
                this.BannerMessage = "💥 BURIED TELLERMINE DETONATED — WATCH FOR WOODEN 'ACHTUNG MINEN' STAKES ON SHOULDERS!";
                this.BannerTimer   = 2.6;
                this.TriggerExplosion(M.Pos[0], M.Pos[1], M.Pos[2], 1.45, 7.2, 9.6, 24.0, CourseMaterial.ScorchedMud);
                continue;
            }
            for (let TI = 0; TI < this.Tanks.length; ++TI)
            {
                const T = this.Tanks[TI];
                if (T.Alive && Math.hypot(T.Pos[0] - M.Pos[0], T.Pos[1] - M.Pos[1]) < 3.15)
                {
                    M.Armed = false;
                    this.Stats.MinesDetonated++;
                    this.TriggerExplosion(M.Pos[0], M.Pos[1], M.Pos[2], 1.30, 5.8, 4.8, 6.0, CourseMaterial.ScorchedMud);
                    this.DamageTank(TI, 16.0);
                    break;
                }
            }
        }

        // ③ Enfilade Bluff Casemate MG-42 Turrets:
        //    • Engage Advancing Sherman Tanks first!
        //    • If Car enters an open Kill Zone out of Tank/Trench/Seawall cover:
        //      - First 0.70 s (`ExposedSeconds < 0.95`): stitches a dramatic WARNING BURST in the sand 4.5 m ahead of the car!
        //      - Only after 0.95 s of ignoring cover does 1 nearest Casemate walk rounds onto the car!
        let AllowedCarMgIdx = -1;
        if (!this.InTankCover && !this.InTrenchCover && !this.InDefiladeCover && this.ExposedSeconds > 0.35 && !this.KnockedOut)
        {
            let NearestD = 88.0;
            for (let MI = 0; MI < this.MgTurrets.length; ++MI)
            {
                const MG = this.MgTurrets[MI];
                if (MG.SuppressedTimer > 0.0 || Car.Position[0] > MG.Pos[0] + 12.0)
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

            let TargetPos = null;
            MG.TargetingCar = false;
            if (MI === AllowedCarMgIdx)
            {
                MG.TargetingCar = true;
                // Warning sand-stitch burst ahead of bumper for first 0.65 s so player can reactively dive into a trench!
                const WarningLead = this.ExposedSeconds < 1.0 ? 4.8 : 0.24;
                const Fwd = Car.QueryForward();
                const AimX = Car.Position[0] + Fwd[0] * WarningLead + Car.LinearVelocity[0] * 0.18;
                const AimY = Car.Position[1] + Fwd[1] * WarningLead + Car.LinearVelocity[1] * 0.18;
                const AimZ = this.ExposedSeconds < 1.0 ? (QueryDDayTerrainHeight(AimX, AimY) + 0.08) : (Car.Position[2] + 0.36);
                TargetPos = [AimX, AimY, AimZ];
            }
            else
            {
                // Otherwise sweep enfilade fire onto nearest Sherman Tank (or across Sunken Trench lips overhead!)
                let BestTDist = 115.0;
                for (const T of this.Tanks)
                {
                    if (!T.Alive || T.Pos[0] > MG.Pos[0] + 15.0)
                        continue;
                    const D = Math.hypot(T.Pos[0] - MG.Pos[0], T.Pos[1] - MG.Pos[1]);
                    if (D < BestTDist)
                    {
                        BestTDist = D;
                        TargetPos = [T.Pos[0] + Math.cos(T.Yaw) * 1.5, T.Pos[1] + Math.sin(T.Yaw) * 1.5, T.Pos[2] + 1.08];
                    }
                }
            }

            if (!TargetPos)
                continue;

            const DX = TargetPos[0] - MG.Pos[0], DY = TargetPos[1] - MG.Pos[1];
            const Dist = Math.hypot(DX, DY) || 1.0;
            const DesiredYaw = Math.atan2(DY, DX);
            MG.Yaw += ClampScalar(AngleDelta(MG.Yaw, DesiredYaw), -2.1 * Step, 2.1 * Step);

            MG.Cooldown -= Step;
            if (MG.Cooldown <= 0.0 && Math.abs(AngleDelta(MG.Yaw, DesiredYaw)) < 0.36)
            {
                const Tracer = this.Tracers.find((Tr) => !Tr.Active);
                if (Tracer)
                {
                    const Spread = Math.sin(this.Clock * 43.0 + MI * 2.7) * 0.045;
                    const AimYaw = MG.Yaw + Spread;
                    const Spd    = 112.0;
                    const ZDir   = (TargetPos[2] - (MG.Pos[2] + 0.38)) / Math.max(12.0, Dist);
                    Tracer.Active   = true;
                    Tracer.Friendly = false;
                    Tracer.Pos      = [MG.Pos[0] + Math.cos(AimYaw) * 2.4, MG.Pos[1] + Math.sin(AimYaw) * 2.4, MG.Pos[2] + 0.38];
                    Tracer.Vel      = [Math.cos(AimYaw) * Spd, Math.sin(AimYaw) * Spd, ZDir * Spd];
                    Tracer.Life     = 1.15;
                }
                MG.BurstRem--;
                if (MG.BurstRem <= 0)
                {
                    MG.BurstRem = 6;
                    MG.Cooldown = 1.08;
                }
                else
                {
                    MG.Cooldown = 0.11;
                }
            }
        }

        // Advance MG-42 Tracer Streams (stitch sparks in sand, ricochet off Sherman armor, fly harmlessly over Sunken Trenches!)
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
            if (Tr.Pos[2] <= TerrZ)
            {
                Tr.Active = false;
                // Sand-stitch spark kickup when MG rounds chew into the beach!
                if (Math.hypot(Tr.Pos[0] - Car.Position[0], Tr.Pos[1] - Car.Position[1]) < 28.0)
                {
                    this.Host?.Sparks?.Emit?.([{
                        Point:    [Tr.Pos[0], Tr.Pos[1], TerrZ + 0.08],
                        Velocity: [Tr.Vel[0] * 0.04, Tr.Vel[1] * 0.04, 3.2],
                        Normal:   [0, 0, 1],
                        Strength: 1.5,
                        Rim:      null
                    }], 1.0 / 60.0);
                }
                continue;
            }
            if (Tr.Life <= 0.0)
            {
                Tr.Active = false;
                continue;
            }
            const HitTank = this.FindBlockingTankAlongSegment(PrevX, PrevY, Tr.Pos[0], Tr.Pos[1]);
            if (HitTank >= 0)
            {
                Tr.Active = false;
                this.Host?.Sparks?.Emit?.([{
                    Point:    [...Tr.Pos],
                    Velocity: [-Tr.Vel[0] * 0.10, -Tr.Vel[1] * 0.10, 3.8],
                    Normal:   [0, 0, 1],
                    Strength: 2.1,
                    Rim:      null
                }], 1.0 / 60.0);
                continue;
            }
            if (!this.KnockedOut && !this.InTankCover && !this.InTrenchCover && !this.InDefiladeCover &&
                Math.hypot(Tr.Pos[0] - Car.Position[0], Tr.Pos[1] - Car.Position[1]) < 2.0 &&
                Math.abs(Tr.Pos[2] - Car.Position[2]) < 1.05)
            {
                Tr.Active = false;
                this.ApplyCarDamage(1.8, "ENFILADE MG-42 CROSSFIRE");
                this.Host?.Sparks?.Emit?.([{
                    Point:    [...Tr.Pos],
                    Velocity: [Car.LinearVelocity[0], Car.LinearVelocity[1], 3.4],
                    Normal:   [0, 0, 1],
                    Strength: 2.0,
                    Rim:      null
                }], 1.0 / 60.0);
            }
        }

        // ④ 6 Bluff & Headland 155mm Coastal Cannons (shelling Advancing Shermans primarily!)
        for (let CI = 0; CI < this.Cannons.length; ++CI)
        {
            const C = this.Cannons[CI];
            C.Cooldown -= Step;

            const LiveTanksInArc = this.Tanks.filter((T) => T.Alive && T.Pos[0] < C.Pos[0] - 8.0 && Math.hypot(T.Pos[0] - C.Pos[0], T.Pos[1] - C.Pos[1]) < 225.0);
            const AimAtCar = (!this.InTankCover && !this.InTrenchCover && this.ExposedSeconds > 1.3 && (C.SalvoIdx % 4 === 0)) || LiveTanksInArc.length === 0;

            let TargetX, TargetY;
            if (!AimAtCar && LiveTanksInArc.length > 0)
            {
                const Pick = LiveTanksInArc[(C.SalvoIdx + CI) % LiveTanksInArc.length];
                const EstT = ClampScalar(Math.hypot(Pick.Pos[0] - C.Pos[0], Pick.Pos[1] - C.Pos[1]) / 90.0, 0.45, 1.65);
                TargetX = Pick.Pos[0] + Math.cos(Pick.Yaw) * Pick.Speed * EstT;
                TargetY = Pick.Pos[1] + Math.sin(Pick.Yaw) * Pick.Speed * EstT;
            }
            else
            {
                TargetX = Car.Position[0] + Car.LinearVelocity[0] * 0.95;
                TargetY = Car.Position[1] + Car.LinearVelocity[1] * 0.95;
            }

            const DesiredYaw = Math.atan2(TargetY - C.Pos[1], TargetX - C.Pos[0]);
            C.Yaw += ClampScalar(AngleDelta(C.Yaw, DesiredYaw), -1.4 * Step, 1.4 * Step);

            const Range = Math.hypot(TargetX - C.Pos[0], TargetY - C.Pos[1]);
            if (C.Cooldown <= 0.0 && Range > 20.0 && Range < 235.0)
            {
                const Shell = this.Shells.find((S) => !S.Active);
                if (Shell)
                {
                    const FlightT = ClampScalar(Range / 90.0, 0.45, 1.65);
                    const G = 16.0;
                    const StartX = C.Pos[0] + Math.cos(C.Yaw) * 7.1;
                    const StartY = C.Pos[1] + Math.sin(C.Yaw) * 7.1;
                    const StartZ = C.Pos[2] + 0.74;
                    const DestZ  = QueryDDayTerrainHeight(TargetX, TargetY) + 0.30;
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

        // Advance Friendly 75mm Sherman Shells & Enemy 155mm Coastal Shells
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
                const BP = DDayBunkerSites[S.TargetBunker]?.Pos;
                if (BP && Math.hypot(S.Pos[0] - BP[0], S.Pos[1] - BP[1]) < 4.8)
                {
                    S.Active = false;
                    if (this.MgTurrets[S.TargetBunker])
                    {
                        this.MgTurrets[S.TargetBunker].SuppressedTimer = 4.6;
                        this.Stats.BunkersSuppressed++;
                    }
                    this.TriggerExplosion(S.Pos[0], S.Pos[1], BP[2] + 2.0, 1.25, 4.0, 2.0, 0.0, CourseMaterial.Concrete);
                    continue;
                }
                if (S.Pos[2] <= QueryDDayTerrainHeight(S.Pos[0], S.Pos[1]))
                    S.Active = false;
                continue;
            }

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
                const GroundMat = S.Pos[0] < -150.0 ? CourseMaterial.WetBeachSand : CourseMaterial.ScorchedMud;
                this.TriggerExplosion(S.Pos[0], S.Pos[1], TerrZ, 1.65, 8.8, 8.2, 22.0, GroundMat);
                for (let TI = 0; TI < this.Tanks.length; ++TI)
                {
                    const T = this.Tanks[TI];
                    if (T.Alive && Math.hypot(T.Pos[0] - S.Pos[0], T.Pos[1] - S.Pos[1]) < 5.2)
                        this.DamageTank(TI, 34.0);
                }
            }
        }

        // ⑤ 4 Invasion-Striped Fighter-Bombers: Natural Combat Sorties -> AA Flak Hit -> Gravity Dive -> 35m Belly Skid -> Breakup!
        if (this.Clock >= this.NextFlakDownClock)
        {
            this.TriggerAircraftCrashDive();
            this.NextFlakDownClock = this.Clock + 7.2;
        }

        for (let AI = 0; AI < this.Aircraft.length; ++AI)
        {
            const A = this.Aircraft[AI];
            if (A.PropAttached)
                A.PropAngle = (A.PropAngle + Step * 58.0) % (Math.PI * 2.0);

            if (A.State === "flying")
            {
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Roll    = Math.sin(this.Clock * 1.35 + AI) * 0.22;
                A.Pitch   = 0.03;

                A.BombTimer -= Step;
                if (A.BombTimer <= 0.0 && A.BombsLeft > 0 && A.Pos[0] > -175.0 && A.Pos[0] < 182.0)
                {
                    this.DropAerialBomb(A);
                    A.BombsLeft--;
                    A.BombTimer = 0.78;
                }
                if (A.Pos[0] < -285.0 || A.Pos[0] > 295.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
            else if (A.State === "diving")
            {
                // Natural ballistic gravity arc + wounded aileron roll spiral!
                A.Vel[2] -= 13.5 * Step;
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Pos[2] += A.Vel[2] * Step;
                const HorizSpd = Math.hypot(A.Vel[0], A.Vel[1]) || 1.0;
                A.Yaw   = Math.atan2(A.Vel[1], A.Vel[0]);
                A.Pitch = ClampScalar(Math.atan2(-A.Vel[2], HorizSpd), -0.25, 0.72);
                A.Roll += A.RollRate * Step;

                if ((Math.floor(this.Clock * 30) + AI) % 2 === 0)
                {
                    this.Host?.Sparks?.Emit?.([{
                        Point:    [A.Pos[0], A.Pos[1], A.Pos[2]],
                        Velocity: [-A.Vel[0] * 0.14, -A.Vel[1] * 0.14, 3.4],
                        Normal:   [0, 0, 1],
                        Strength: 2.6,
                        Rim:      null
                    }], 1.0 / 60.0);
                }

                // Transition into HIGH-SPEED BELLY SKID on ground contact (NEVER freeze nose-in!)
                const TerrZ = QueryDDayTerrainHeight(A.Pos[0], A.Pos[1]);
                if (A.Pos[2] <= TerrZ + 0.42)
                {
                    A.Pos[2]       = TerrZ + 0.36;
                    A.State        = "skidding";
                    A.PropAttached = false; // propeller shears off on ground strike!
                    A.SkidTimer    = 0.0;
                    A.ClodCooldown = 0.0;
                    A.SkidYawRate  = (AI % 2 === 0 ? 1.0 : -1.0) * 1.45;
                    // Retain 68% horizontal momentum so it ploughs a 30–40 m furrow across the beach!
                    A.Vel[0]      *= 0.68;
                    A.Vel[1]      *= 0.68;
                    A.Vel[2]       = 0.0;
                    A.Roll         = ClampScalar(A.Roll, -0.35, 0.35);

                    this.TriggerExplosion(A.Pos[0], A.Pos[1], TerrZ + 0.25, 1.65, 8.5, 8.0, 22.0, CourseMaterial.ScorchedMud);
                }
            }
            else if (A.State === "skidding")
            {
                // High-speed belly-skid across uneven Normandy sand/craters with ground friction, yaw spin & dirt clods!
                A.SkidTimer += Step;
                const Drag = Math.exp(-1.25 * Step);
                A.Vel[0] *= Drag;
                A.Vel[1] *= Drag;
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Yaw    += A.SkidYawRate * Step;
                A.SkidYawRate *= Math.exp(-1.1 * Step);

                // Conform fuselage Pitch & Roll cleanly to the uneven ground slope so it slides flat on its belly!
                const CosY = Math.cos(A.Yaw), SinY = Math.sin(A.Yaw);
                const ZF  = QueryDDayTerrainHeight(A.Pos[0] + CosY * 2.5, A.Pos[1] + SinY * 2.5);
                const ZR  = QueryDDayTerrainHeight(A.Pos[0] - CosY * 2.5, A.Pos[1] - SinY * 2.5);
                const ZL  = QueryDDayTerrainHeight(A.Pos[0] - SinY * 1.8, A.Pos[1] + CosY * 1.8);
                const ZRt = QueryDDayTerrainHeight(A.Pos[0] + SinY * 1.8, A.Pos[1] - CosY * 1.8);
                A.Pos[2] = 0.25 * (ZF + ZR + ZL + ZRt) + 0.30;
                A.Pitch  = Math.atan2(ZR - ZF, 5.0);
                A.Roll   = Math.atan2(ZL - ZRt, 3.6) + 0.16;

                // Plough up continuous flying sand/mud clods & grinding belly sparks!
                A.ClodCooldown -= Step;
                if (A.ClodCooldown <= 0.0)
                {
                    A.ClodCooldown = 0.14;
                    this.Host?.Effects?.BurstTyre?.(
                        ConstructRigidTransform([A.Pos[0], A.Pos[1], A.Pos[2] + 0.15], [0, 0, 0, 1]),
                        [0.65, 0.65, 0.35],
                        [-A.Vel[0] * 0.22, -A.Vel[1] * 0.22, 3.6],
                        CourseMaterial.ScorchedMud
                    );
                    this.Host?.Sparks?.Emit?.([
                        { Point: [A.Pos[0], A.Pos[1], A.Pos[2] + 0.1], Velocity: [-A.Vel[0] * 0.25, -A.Vel[1] * 0.25, 4.2], Normal: [0, 0, 1], Strength: 3.0, Rim: null }
                    ], 1.0 / 60.0);
                }

                // Tear through Barbed Wire in the skidding plane's wake!
                for (const W of this.BarbedWires)
                    if (W.Intact && Math.hypot(A.Pos[0] - W.Pos[0], A.Pos[1] - W.Pos[1]) < 4.2)
                        this.BreakBarbedWire(W, false);

                // Push/damage Car if skidding burning fuselage slides into it
                if (!this.KnockedOut && Math.hypot(A.Pos[0] - Car.Position[0], A.Pos[1] - Car.Position[1]) < 4.0)
                {
                    Car.LinearVelocity[0] += A.Vel[0] * 0.45;
                    Car.LinearVelocity[1] += A.Vel[1] * 0.45;
                    Car.LinearVelocity[2] += 4.5;
                    this.ApplyCarDamage(18.0, "SKIDDING AIRCRAFT WRECK");
                }

                // Secondary wing fuel-tank detonation as airframe grinds to a halt!
                const RemSpeed = Math.hypot(A.Vel[0], A.Vel[1]);
                if (RemSpeed < 4.2 || A.SkidTimer >= 1.75)
                {
                    A.State      = "wreck";
                    A.WreckTimer = 3.2;
                    this.Stats.PlanesCrashed++;
                    this.TriggerExplosion(A.Pos[0], A.Pos[1], A.Pos[2], 2.20, 10.5, 9.8, 26.0, CourseMaterial.OliveDrabDark);
                }
            }
            else
            {
                A.WreckTimer -= Step;
                if (A.WreckTimer <= 0.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
        }

        // Advance Falling 500-lb Bombs
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
                this.TriggerExplosion(B.Pos[0], B.Pos[1], TerrZ, 1.85, 9.5, 9.0, 25.0, CourseMaterial.ScorchedMud);
            }
        }

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

        for (const T of this.Tanks)
        {
            if (!T.Alive)
            {
                Out.push({
                    Active: true, Position: [T.Pos[0] - 0.5, T.Pos[1], T.Pos[2] + 1.45],
                    Radius: 0.72, Velocity: [0.0, 0.0, 3.8],
                    SmokeRate: 22.0, HeatRate: 36.0, FlameRate: 28.0, SootRate: 34.0
                });
            }
            else if (T.CookingOff)
            {
                Out.push({
                    Active: true, Position: [T.Pos[0], T.Pos[1], T.Pos[2] + 1.65],
                    Radius: 0.65, Velocity: [0.0, 0.0, 5.2],
                    SmokeRate: 26.0, HeatRate: 48.0, FlameRate: 44.0, SootRate: 30.0
                });
            }
            else if (T.Hp < 68.0)
            {
                const DmgFrac = 1.0 - T.Hp / 68.0;
                Out.push({
                    Active: true, Position: [T.Pos[0] - Math.cos(T.Yaw) * 2.1, T.Pos[1] - Math.sin(T.Yaw) * 2.1, T.Pos[2] + 1.55],
                    Radius: 0.42, Velocity: [-1.2, 0.0, 2.6],
                    SmokeRate: 10.0 + 14.0 * DmgFrac, HeatRate: 12.0 + 18.0 * DmgFrac,
                    FlameRate: DmgFrac > 0.55 ? 12.0 : 0.0, SootRate: 14.0 + 16.0 * DmgFrac
                });
            }
        }

        for (const A of this.Aircraft)
        {
            if (A.State !== "flying")
            {
                Out.push({
                    Active: true, Position: [A.Pos[0], A.Pos[1], A.Pos[2] + 0.55],
                    Radius: 0.76,
                    Velocity: (A.State === "diving" || A.State === "skidding")
                        ? [-A.Vel[0] * 0.14, -A.Vel[1] * 0.14, 3.6]
                        : [0.0, 0.0, 4.2],
                    SmokeRate: 26.0, HeatRate: 44.0, FlameRate: 38.0, SootRate: 34.0
                });
            }
        }

        for (const CF of this.CraterFires)
        {
            const Fade = Math.max(0.0, 1.0 - CF.Age / CF.Duration);
            Out.push({
                Active: true, Position: CF.Pos, Radius: 0.58 * CF.Scale,
                Velocity: [0.0, 0.0, (2.2 + 2.8 * Fade) * CF.Scale],
                SmokeRate: 18.0 * Fade * CF.Scale, HeatRate: 28.0 * Fade * CF.Scale,
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

        // ① 5 Winding OD#9 Sherman Tanks
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

            const QTurret = T.Alive
                ? MultiplyQuaternion(QHull, ConstructAxisQuaternion([0, 0, 1], T.TurretYaw))
                : MultiplyQuaternion(
                    ConstructAxisQuaternion([0, 0, 1], T.Yaw + T.TurretYaw),
                    MultiplyQuaternion(ConstructAxisQuaternion([0, 1, 0], T.TurretPitch), ConstructAxisQuaternion([1, 0, 0], T.TurretRoll))
                );
            DrawChanged = SetOcc(Block.TankTurrets[I], ConstructRigidTransform(T.TurretPos, QTurret), true) || DrawChanged;
        }

        // ② 6 Casemate MG-42 Turrets & 6 Heavy 155mm Coastal Guns
        for (let I = 0; I < this.MgTurrets.length; ++I)
            DrawChanged = SetOcc(Block.MgTurrets[I], ConstructRigidTransform(this.MgTurrets[I].Pos, ConstructAxisQuaternion([0, 0, 1], this.MgTurrets[I].Yaw)), true) || DrawChanged;
        for (let I = 0; I < this.Cannons.length; ++I)
            DrawChanged = SetOcc(Block.Cannons[I], ConstructRigidTransform(this.Cannons[I].Pos, ConstructAxisQuaternion([0, 0, 1], this.Cannons[I].Yaw)), true) || DrawChanged;

        // ③ 4 Fighter-Bombers + Detachable Propellers (hidden during belly-skid/wreck!)
        for (let I = 0; I < this.Aircraft.length; ++I)
        {
            const A = this.Aircraft[I];
            const QPlane = MultiplyQuaternion(
                MultiplyQuaternion(ConstructAxisQuaternion([0, 0, 1], A.Yaw), ConstructAxisQuaternion([0, 1, 0], A.Pitch)),
                ConstructAxisQuaternion([1, 0, 0], A.Roll)
            );
            DrawChanged = SetOcc(Block.Aircraft[I], ConstructRigidTransform(A.Pos, QPlane), true) || DrawChanged;

            if (A.PropAttached)
            {
                const NoseOff = RotateVector(QPlane, [3.70, 0.0, 0.58]);
                const NosePos = [A.Pos[0] + NoseOff[0], A.Pos[1] + NoseOff[1], A.Pos[2] + NoseOff[2]];
                const QProp   = MultiplyQuaternion(QPlane, ConstructAxisQuaternion([1, 0, 0], A.PropAngle));
                DrawChanged = SetOcc(Block.Propellers[I], ConstructRigidTransform(NosePos, QProp), true) || DrawChanged;
            }
            else
            {
                DrawChanged = SetOcc(Block.Propellers[I], Parked, false) || DrawChanged;
            }
        }

        // ④ 28 Subtle Buried Tellermines & 24 Crushable Barbed Wire Entanglements
        for (let I = 0; I < this.Mines.length; ++I)
        {
            const M = this.Mines[I];
            DrawChanged = SetOcc(Block.Mines[I], M.Armed ? ConstructRigidTransform(M.Pos, [0, 0, 0, 1]) : Parked, M.Armed) || DrawChanged;
        }
        if (Block.BarbedWire)
        {
            for (let I = 0; I < this.BarbedWires.length; ++I)
            {
                const W = this.BarbedWires[I];
                const Xf = W.Intact ? ConstructRigidTransform(W.Pos, ConstructAxisQuaternion([0, 0, 1], W.Yaw)) : Parked;
                DrawChanged = SetOcc(Block.BarbedWire[I], Xf, W.Intact) || DrawChanged;
            }
        }

        // ⑤ Bombs, Shells & Tracers
        for (let I = 0; I < this.Bombs.length; ++I)
        {
            const B = this.Bombs[I];
            if (!B.Active) DrawChanged = SetOcc(Block.Bombs[I], Parked, false) || DrawChanged;
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
            if (!S.Active) DrawChanged = SetOcc(Block.Shells[I], Parked, false) || DrawChanged;
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
            if (!Tr.Active) DrawChanged = SetOcc(Block.Tracers[I], Parked, false) || DrawChanged;
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
                Colour: [1.0, 0.78, 0.42], Intensity: 110.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
            },
            {
                X: 189.5, Y: -10.5, Z: GateZ + 4.5,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [1.0, 0.78, 0.42], Intensity: 110.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
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
                Colour: [1.0, 0.52, 0.14], Intensity: 215.0 * Flash * CF.Scale, Reach: 48.0 * CF.Scale, Params: [0.1, -0.5, 0, 1]
            });
        }
        return Out;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                  TACTICAL D-DAY BATTLEFIELD HUD (ZERO BLACK BOXES · SUBTLE CLOSE-PROXIMITY CUES)
    //--------------------------------------------------------------------------------------------------------------------

    RenderHudOverlay(Ctx, W, H, Cam)
    {
        if (!this.Enabled)
            return;
        const Hud = this.Host.DrivingHud;
        const Car = this.Host.Vehicle;
        if (!Hud || !Car)
            return;

        // ① 3D Objective Beacon on THE ATLANTIC WALL Breach Gate
        const DistToWall = Math.max(0, Math.round(DDayWallGoalX - Car.Position[0]));
        const GateZ = QueryDDayTerrainHeight(191.0, 0.0);
        const GateScreen = Hud.ProjectWorld([191.0, 0.0, GateZ + 7.2], W, H, Cam);
        if (GateScreen)
        {
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
            Ctx.shadowBlur  = 8;
            Ctx.strokeStyle = "#ffd26a";
            Ctx.lineWidth   = 2.4;
            const GX = GateScreen[0], GY = GateScreen[1];
            Ctx.beginPath();
            Ctx.moveTo(GX, GY - 10); Ctx.lineTo(GX + 10, GY);
            Ctx.lineTo(GX, GY + 10); Ctx.lineTo(GX - 10, GY);
            Ctx.closePath();
            Ctx.stroke();

            Ctx.fillStyle = "#ffe298";
            Ctx.font      = "800 12.5px 'DM Sans', system-ui, sans-serif";
            Ctx.textAlign = "center";
            Ctx.fillText(`🎯 ATLANTIC WALL BREACH (${DistToWall}m)`, GX, GY - 16);
            Ctx.restore();
        }

        // ② Sherman Tank Tactical Callouts (only nearby within 85 m)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            if (!T.Alive)
                continue;
            const Dist = Math.hypot(T.Pos[0] - Car.Position[0], T.Pos[1] - Car.Position[1]);
            if (Dist > 85.0)
                continue;
            const TP = Hud.ProjectWorld([T.Pos[0], T.Pos[1], T.Pos[2] + 2.95], W, H, Cam);
            if (!TP)
                continue;
            const Col = T.CookingOff ? "#ff4d5e" : (this.CoverTankIdx === I ? "#6ef7c8" : "#d8e2b8");
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.86)";
            Ctx.shadowBlur  = 6;
            Ctx.fillStyle   = Col;
            Ctx.font        = "700 10.5px 'JetBrains Mono', monospace";
            Ctx.textAlign   = "center";
            const Tag = T.CookingOff
                ? "⚠️ AMMO COOK-OFF — CLEAR OUT!"
                : (this.CoverTankIdx === I ? `🛡️ SHERMAN LEE · ${Math.round(T.Hp)}%` : `🛡️ M4 SHERMAN · ${Math.round(T.Hp)}%`);
            Ctx.fillText(Tag, TP[0], TP[1]);
            Ctx.restore();
        }

        // ③ Close-Range Metallic Mine Detector Alert ONLY when < 7.8 m from a buried Tellermine! (Mines stay subtle at range!)
        if (this.NearMineDist < 7.8 && this.NearMinePos)
        {
            const MP = Hud.ProjectWorld([this.NearMinePos[0], this.NearMinePos[1], this.NearMinePos[2] + 0.45], W, H, Cam);
            if (MP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
                Ctx.shadowBlur  = 6;
                Ctx.fillStyle   = "#ffbe42";
                Ctx.font        = "800 11px 'JetBrains Mono', monospace";
                Ctx.textAlign   = "center";
                Ctx.fillText(`⚠️ BURIED MINE ${this.NearMineDist.toFixed(1)}m!`, MP[0], MP[1]);
                Ctx.restore();
            }
        }

        // ④ Diving / Skidding Aircraft Callout
        for (const A of this.Aircraft)
        {
            if (A.State !== "diving" && A.State !== "skidding")
                continue;
            const AP = Hud.ProjectWorld([A.Pos[0], A.Pos[1], A.Pos[2] + 1.8], W, H, Cam);
            if (AP)
            {
                Ctx.save();
                Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
                Ctx.shadowBlur  = 7;
                Ctx.fillStyle   = "#ff584e";
                Ctx.font        = "800 11.5px 'DM Sans', system-ui, sans-serif";
                Ctx.textAlign   = "center";
                Ctx.fillText(A.State === "skidding" ? "✈️ SKIDDING WRECK!" : "✈️ STRICKEN FIGHTER!", AP[0], AP[1]);
                Ctx.restore();
            }
        }

        // ⑤ Pure Optical Top Combat Header
        Ctx.save();
        Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
        Ctx.shadowBlur  = 7;
        Ctx.textAlign   = "center";

        const ArmorCol = this.VehicleArmor > 55 ? "#6ef7c8" : (this.VehicleArmor > 25 ? "#ffc858" : "#ff4d5e");
        Ctx.fillStyle = this.Breached ? "#6ef7c8" : "#f2dfa8";
        Ctx.font      = "800 15px 'DM Sans', system-ui, sans-serif";
        const Header  = this.Breached
            ? `🏆 ATLANTIC WALL BREACHED · ${this.RunTimer.toFixed(1)}s${this.BestBreachSec !== null ? ` (BEST ${this.BestBreachSec.toFixed(1)}s)` : ""}`
            : `⚔️ OMAHA BEACH · ${DistToWall}m TO ATLANTIC WALL · ${this.RunTimer.toFixed(1)}s`;
        Ctx.fillText(Header, W * 0.5, 24);

        let CoverState = "⚡ MANEUVERING";
        if (this.InTankCover)         CoverState = "🛡️ IN SHERMAN TANK COVER";
        else if (this.InTrenchCover)  CoverState = "🪖 SUNKEN TRENCH DEFILADE (SAFE FROM MG)";
        else if (this.InDefiladeCover)CoverState = "🪨 SHINGLE / CRATER DEFILADE";
        else if (this.ActiveKillZone) CoverState = `☠️ ${this.ActiveKillZone} — SEEK TANK OR TRENCH!`;

        Ctx.fillStyle = (this.ActiveKillZone && !this.InTankCover && !this.InTrenchCover && !this.InDefiladeCover) ? "#ff5e6c" : ArmorCol;
        Ctx.font      = "700 12px 'JetBrains Mono', monospace";
        Ctx.fillText(
            `🛡️ HULL ${Math.round(this.VehicleArmor)}%   |   ${CoverState}`,
            W * 0.5, 42
        );

        if (this.BannerTimer > 0.0 && this.BannerMessage)
        {
            Ctx.fillStyle = "#fff4d8";
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
