//============================================================================================================================================
//                                                       DDAYCOMBATSEQUENCE.JS
//============================================================================================================================================
// ⚔️ Real-Time Battlefield Simulation for the "D-Day: Race to The Wall" ("dday") Gauntlet:
//    • 5 Advancing Assault Tanks moving toward The Wall — solid mobile cover that shields players from Machine Gun & Cannon fire,
//      detonates mines ahead, and takes heavy Cannon hits until cooking off in a catastrophic turret-popping explosion!
//    • 6 Rotating Bunker Machine Gun Turrets firing 3D glowing tracer salvos
//    • 6 Heavy 155mm Fortress Cannons bombarding Tanks & leading the player's car with incoming target reticles
//    • 4 Overhead Attack Aircraft dropping 500-lb bombs and getting shot down into flaming crash-dives toward the cars!
//    • 28 Armed Landmines that detonate on proximity/contact with upward blast physics, 3D fireballs & dynamic clustered lights.

import {
    ClampScalar,
    ConstructAxisQuaternion,
    ConstructRigidTransform,
    MultiplyQuaternion,
    RotateVector
} from "./TransformProjection.js";
import { LightType } from "./LightingSystem.js";
import {
    DDayCannonMounts,
    DDayMgMounts,
    DDayMineCoordinates,
    DDaySpawn,
    DDayWallGoalX
} from "./DDayStructure.js";

function ConstructScaledTransform(Position, Quaternion, Scale)
{
    const M = ConstructRigidTransform(Position, Quaternion);
    M[0] *= Scale; M[1] *= Scale; M[2]  *= Scale;
    M[4] *= Scale; M[5] *= Scale; M[6]  *= Scale;
    M[8] *= Scale; M[9] *= Scale; M[10] *= Scale;
    return M;
}

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
        this.Host          = Host;
        this.Scene         = Host.Scene;
        this.Enabled       = (Host.LevelKey === "dday") && Boolean(this.Scene?.DDayBlock);

        this.Clock         = 0.0;
        this.RunTimer      = 0.0;
        this.BestBreachSec = null;
        this.Breached      = false;
        this.VehicleArmor  = 100.0;
        this.KnockedOut    = false;
        this.KnockoutTimer = 0.0;
        this.InTankCover   = false;
        this.CoverTankIdx  = -1;

        this.BannerMessage = "";
        this.BannerTimer   = 0.0;
        this.NextCrashSortieClock = 4.2;

        // Dynamic Battlefield State Pools (mapped 1:1 to Scene.DDayBlock GPU occupants)
        this.Tanks      = [];
        this.MgTurrets  = [];
        this.Cannons    = [];
        this.Aircraft   = [];
        this.Mines      = [];
        this.Bombs      = [];
        this.Shells     = [];
        this.Tracers    = [];
        this.Explosions = [];

        this.Stats = {
            MinesDetonated:  0,
            TanksExploded:   0,
            BombsDropped:    0,
            PlanesCrashed:   0,
            ShellsFired:     0,
            Breaches:        0
        };

        if (this.Enabled)
        {
            this.InitializeBattlefield();
            this.MountQuickControls();
            this.BannerMessage = "⚔️ OPERATION BREACH: USE ADVANCING TANKS FOR COVER — REACH THE WALL!";
            this.BannerTimer   = 4.5;
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                 BATTLEFIELD INITIALIZATION & RESET
    //--------------------------------------------------------------------------------------------------------------------

    InitializeBattlefield()
    {
        // ① 5 Advancing Assault Tanks along staggered lanes toward The Wall (X = +188 m)
        const Lanes = [
            { StartX: -168.0, Y:  -8.5, Speed: 8.8 },
            { StartX: -116.0, Y:   8.5, Speed: 8.4 },
            { StartX:  -62.0, Y:   0.0, Speed: 8.0 },
            { StartX:   -8.0, Y: -16.5, Speed: 8.6 },
            { StartX:   46.0, Y:  16.5, Speed: 7.9 }
        ];
        this.Tanks = Lanes.map((L, I) => ({
            Index:       I,
            Pos:         [L.StartX, L.Y, 0.0],
            LaneY:       L.Y,
            BaseSpeed:   L.Speed,
            Speed:       L.Speed,
            Yaw:         0.0,
            TurretYaw:   (I & 1) ? 0.28 : -0.28,
            Hp:          100.0,
            Alive:       true,
            WreckTimer:  0.0,
            TurretPos:   [L.StartX, L.Y, 1.52],
            TurretVel:   [0.0, 0.0, 0.0],
            TurretPitch: 0.0,
            TurretRoll:  0.0
        }));

        // ② 6 Rotating Bunker Machine Gun Turrets
        this.MgTurrets = DDayMgMounts.map((Pos, I) => ({
            Pos:      [...Pos],
            Yaw:      Math.PI,
            Cooldown: 0.18 * I,
            BurstRem: 4
        }));

        // ③ 6 Heavy 155mm Fortress Artillery Cannons
        this.Cannons = DDayCannonMounts.map((Pos, I) => ({
            Pos:      [...Pos],
            Yaw:      Math.PI,
            Cooldown: 0.65 + I * 0.55,
            SalvoIdx: I
        }));

        // ④ 4 Low-Altitude Attack Aircraft (bombing runs + shot-down crash dives toward cars!)
        this.Aircraft = [0, 1, 2, 3].map((I) => this.CreateFreshAircraftSortie(I, true));

        // ⑤ 28 Armed Anti-Tank Landmines
        this.Mines = DDayMineCoordinates.map(([X, Y], I) => ({
            Index: I,
            Pos:   [X, Y, 0.01],
            Armed: true
        }));

        // ⑥ Projectile & Explosion Pools
        const Block = this.Scene.DDayBlock;
        this.Bombs      = Array.from({ length: Block.Bombs.length },      () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0] }));
        this.Shells     = Array.from({ length: Block.Shells.length },     () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Target: [0, 0] }));
        this.Tracers    = Array.from({ length: Block.Tracers.length },    () => ({ Active: false, Pos: [0, 0, -200], Vel: [0, 0, 0], Life: 0 }));
        this.Explosions = Array.from({ length: Block.Explosions.length }, () => ({ Active: false, Pos: [0, 0, -200], Age: 0, Duration: 0.85, MaxScale: 1.5 }));

        this.SyncGpuOccupants(true);
    }

    CreateFreshAircraftSortie(Slot, Initial = false)
    {
        const CarX = this.Host?.Vehicle?.Position?.[0] ?? -180.0;
        // Fly Westward (-X) from behind The Wall directly over the advancing column, or diagonal strafing passes!
        const FromEast = (Slot % 2) === 0;
        const StartX = FromEast ? (Initial ? 190.0 - Slot * 85.0 : Math.min(265.0, CarX + 210.0)) : (CarX - 180.0);
        const StartY = ((Slot - 1.5) * 16.0) + Math.sin(this.Clock * 1.7 + Slot) * 8.0;
        const Alt    = 24.0 + (Slot % 3) * 4.5;
        const DirX   = FromEast ? -1.0 : 1.0;
        const DirY   = (Slot & 1) ? 0.10 : -0.10;
        const Norm   = Math.hypot(DirX, DirY);
        const Speed  = 56.0 + Slot * 3.5;

        return {
            Slot,
            State:      "flying", // "flying" | "crashing" | "wreck"
            Pos:        [StartX, StartY, Alt],
            Vel:        [(DirX / Norm) * Speed, (DirY / Norm) * Speed, 0.0],
            Yaw:        Math.atan2(DirY, DirX),
            Pitch:      0.0,
            Roll:       0.0,
            PropAngle:  Slot * 1.1,
            BombTimer:  Initial ? (0.8 + Slot * 0.7) : 1.1,
            BombsLeft:  3,
            WreckTimer: 0.0,
            CrashTarget:[0.0, 0.0]
        };
    }

    RestartGauntlet()
    {
        if (!this.Enabled)
            return;
        this.RunTimer      = 0.0;
        this.Breached      = false;
        this.VehicleArmor  = 100.0;
        this.KnockedOut    = false;
        this.KnockoutTimer = 0.0;
        this.Host.Vehicle.Respawn([...DDaySpawn.Position], DDaySpawn.Yaw);
        this.InitializeBattlefield();
        this.BannerMessage = "⚔️ GAUNTLET RESET — STAY IN TANK SHADOWS & SPRINT FOR THE WALL!";
        this.BannerTimer   = 3.5;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                               INTERACTIVE VIEWPORT CONTROLS FOR D-DAY
    //--------------------------------------------------------------------------------------------------------------------

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
        MakePill("✈️ TRIGGER CRASH DIVE", "rgba(255, 112, 92, 0.72)", () => this.TriggerAircraftCrashDive());
        MakePill("🛡️ FIELD ARMOR +100%", "rgba(255, 198, 82, 0.65)", () =>
        {
            this.VehicleArmor = 100.0;
            this.KnockedOut   = false;
            this.BannerMessage = "🛡️ FIELD ENGINEER REPAIR — ARMOR RESTORED TO 100%!";
            this.BannerTimer   = 2.2;
        });

        HostBar.appendChild(Wrap);
        this.ControlStrip = Wrap;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       EXPLOSIONS, SHOCKWAVE PHYSICS, COVER & TANK DESTRUCTION
    //--------------------------------------------------------------------------------------------------------------------

    SpawnExplosion(X, Y, Z, MaxScale = 1.6, BlastRadius = 9.0, BlastImpulse = 8.5, MaxArmorDamage = 26.0)
    {
        // ① Allocate 3D Fireball Slot
        let Chosen = this.Explosions.find((E) => !E.Active);
        if (!Chosen)
            Chosen = this.Explosions[0];
        if (Chosen)
        {
            Chosen.Active   = true;
            Chosen.Pos      = [X, Y, Math.max(0.05, Z)];
            Chosen.Age      = 0.0;
            Chosen.Duration = 0.68 + 0.18 * MaxScale;
            Chosen.MaxScale = MaxScale;
        }

        // ② Emit GPU Debris Sparks
        this.Host?.Sparks?.Emit?.([
            { Point: [X, Y, Z + 0.5], Velocity: [ 5.5,  3.2, 8.5], Normal: [0, 0, 1], Strength: 4.5, Rim: null },
            { Point: [X, Y, Z + 0.5], Velocity: [-5.2, -3.8, 7.8], Normal: [0, 0, 1], Strength: 4.2, Rim: null }
        ], 1.0 / 60.0);

        // ③ Synthesize Battlefield Explosion Boom
        const Car = this.Host?.Vehicle;
        if (Car)
        {
            const DistToCar = Math.hypot(Car.Position[0] - X, Car.Position[1] - Y);
            if (DistToCar < 130.0)
                this.Host?.DrivingHud?.Audio?.PlayExplosionBoom?.(ClampScalar(1.0 - DistToCar / 130.0, 0.12, 1.0) * ClampScalar(MaxScale * 0.6, 0.5, 1.3));

            // ④ Radial Blast Wave & Upward Stunt Launch on Player Car (unless shielded by an intact Tank!)
            if (DistToCar < BlastRadius && !this.KnockedOut)
            {
                const ShieldTank = this.FindBlockingTankAlongSegment(X, Y, Car.Position[0], Car.Position[1], -1);
                if (ShieldTank < 0)
                {
                    const Falloff = 1.0 - (DistToCar / BlastRadius);
                    const DirX = DistToCar > 0.2 ? (Car.Position[0] - X) / DistToCar : -1.0;
                    const DirY = DistToCar > 0.2 ? (Car.Position[1] - Y) / DistToCar :  0.3;
                    Car.LinearVelocity[0] += DirX * BlastImpulse * Falloff;
                    Car.LinearVelocity[1] += DirY * BlastImpulse * Falloff;
                    Car.LinearVelocity[2] += BlastImpulse * 0.72 * Falloff;
                    Car.AngularVelocity[2] += (DirY >= 0 ? 1 : -1) * 1.15 * Falloff;
                    this.ApplyCarDamage(MaxArmorDamage * Falloff, "BLAST WAVE");
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
            this.KnockoutTimer = 2.4;
            this.BannerMessage = `💥 VEHICLE KNOCKED OUT BY ${SourceLabel} — REDEPLOYING ON BEACHHEAD!`;
            this.BannerTimer   = 2.6;
            const P = this.Host.Vehicle.Position;
            this.SpawnExplosion(P[0], P[1], 0.3, 1.9, 4.0, 4.0, 0.0);
        }
    }

    // Checks if any Tank's solid armored hull (6.9 m × 3.8 m) blocks the 2D line segment A -> B!
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
            // Even a smoking tank hull still blocks low-angle shrapnel, though intact tanks have full height!
            const MinX = T.Pos[0] - 3.55, MaxX = T.Pos[0] + 3.55;
            const MinY = T.Pos[1] - 1.95, MaxY = T.Pos[1] + 1.95;
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

    DamageTank(TankIdx, Damage)
    {
        const T = this.Tanks[TankIdx];
        if (!T || !T.Alive)
            return;
        T.Hp = Math.max(0.0, T.Hp - Damage);
        if (T.Hp <= 0.0)
        {
            // 💥 CATASTROPHIC TANK AMMO COOK-OFF & TURRET POP-OFF EXPLOSION!
            T.Alive      = false;
            T.Speed      = 0.0;
            T.WreckTimer = 8.0;
            T.TurretPos  = [T.Pos[0], T.Pos[1], 1.60];
            T.TurretVel  = [
                (Math.sin(this.Clock * 13.0 + TankIdx) * 4.2),
                (TankIdx % 2 === 0 ? 3.8 : -3.8),
                11.8
            ];
            this.Stats.TanksExploded++;
            this.SpawnExplosion(T.Pos[0], T.Pos[1], 0.9, 2.25, 10.5, 9.5, 30.0);
            if (this.CoverTankIdx === TankIdx)
            {
                this.BannerMessage = "💥 YOUR COVER TANK EXPLODED — SPRINT TO ANOTHER TANK!";
                this.BannerTimer   = 2.8;
            }
        }
    }

    ResolveCarTankCollisions(Car)
    {
        this.InTankCover  = false;
        this.CoverTankIdx = -1;

        const CX = Car.Position[0], CY = Car.Position[1];
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            // Check tactical cover shadow directly behind or tucked tight beside an advancing Tank!
            const RelX = CX - T.Pos[0];
            const RelY = CY - T.Pos[1];
            if (T.Alive && RelX >= -14.5 && RelX <= -3.6 && Math.abs(RelY) <= 3.15)
            {
                this.InTankCover  = true;
                this.CoverTankIdx = I;
            }

            // Solid 2D AABB push-out between Car (half-size ~2.2 × 1.05 m) & Tank Hull (half-size 3.45 × 1.82 m)
            const HalfX = 5.55, HalfY = 2.86;
            if (Math.abs(RelX) < HalfX && Math.abs(RelY) < HalfY && Car.Position[2] < 2.25)
            {
                const PenX = HalfX - Math.abs(RelX);
                const PenY = HalfY - Math.abs(RelY);
                if (PenX < PenY)
                {
                    const S = RelX >= 0 ? 1.0 : -1.0;
                    Car.Position[0] = T.Pos[0] + S * HalfX;
                    if (S < 0)
                        Car.LinearVelocity[0] = Math.min(Car.LinearVelocity[0], T.Speed - 1.0);
                    else
                        Car.LinearVelocity[0] = Math.max(Car.LinearVelocity[0], T.Speed + 2.0);
                }
                else
                {
                    const S = RelY >= 0 ? 1.0 : -1.0;
                    Car.Position[1] = T.Pos[1] + S * HalfY;
                    Car.LinearVelocity[1] = S * Math.max(2.5, Math.abs(Car.LinearVelocity[1]) * 0.5);
                }
                this.Host?.Sparks?.Emit?.([{
                    Point:    [Car.Position[0], Car.Position[1], Car.Position[2] + 0.3],
                    Velocity: [T.Speed, 0.0, 2.5],
                    Normal:   [0.0, 0.0, 1.0],
                    Strength: 1.8,
                    Rim:      null
                }], 1.0 / 60.0);
            }
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       AIRCRAFT BOMBING RUNS & SHOT-DOWN CRASH DIVES TOWARD CARS!
    //--------------------------------------------------------------------------------------------------------------------

    TriggerAircraftCrashDive()
    {
        const Car = this.Host?.Vehicle;
        if (!Car)
            return null;
        // Pick an airborne plane closest to uprange of the player
        let Candidate = this.Aircraft.find((A) => A.State === "flying");
        if (!Candidate)
            return null;

        Candidate.State = "crashing";
        // Position the stricken plane at dramatic visible forward-high altitude diving toward the car's lead corridor!
        const LeadX = ClampScalar(Car.Position[0] + Car.LinearVelocity[0] * 1.15 + 14.0, -185.0, 186.0);
        const DodgeOffset = (Math.sin(this.Clock * 9.3) >= 0 ? 1 : -1) * 4.2;
        const LeadY = ClampScalar(Car.Position[1] + Car.LinearVelocity[1] * 0.85 + DodgeOffset, -22.0, 22.0);
        Candidate.CrashTarget = [LeadX, LeadY];

        // Start 85 m uprange & 28 m up so the player sees the flaming plane corkscrewing straight down toward them!
        Candidate.Pos = [LeadX + 68.0, LeadY + (Candidate.Slot % 2 === 0 ? 22.0 : -22.0), 29.0];
        const FlightTime = 1.45;
        Candidate.Vel = [
            (LeadX - Candidate.Pos[0]) / FlightTime,
            (LeadY - Candidate.Pos[1]) / FlightTime,
            (0.6 - Candidate.Pos[2])   / FlightTime
        ];
        Candidate.Yaw   = Math.atan2(Candidate.Vel[1], Candidate.Vel[0]);
        Candidate.Pitch = 0.38;

        this.BannerMessage = "⚠️ AIRCRAFT HIT — FLAMING PLANE CRASHING AHEAD, SWERVE!";
        this.BannerTimer   = 2.4;
        return Candidate;
    }

    DropAerialBomb(Plane)
    {
        const Slot = this.Bombs.find((B) => !B.Active);
        if (!Slot)
            return;
        Slot.Active = true;
        Slot.Pos    = [Plane.Pos[0], Plane.Pos[1], Plane.Pos[2] - 0.8];
        Slot.Vel    = [Plane.Vel[0] * 0.42, Plane.Vel[1] * 0.42, -3.0];
        // Estimate ground impact point under z(t) = z0 + vz0*t - 0.5*g*t^2 (g = 18.0 m/s^2)
        const G = 18.0;
        const TImpact = (Slot.Vel[2] + Math.sqrt(Slot.Vel[2] * Slot.Vel[2] + 2.0 * G * Math.max(1.0, Slot.Pos[2]))) / G;
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

        // Handle post-knockout beachhead auto-redeploy
        if (this.KnockedOut)
        {
            this.KnockoutTimer -= Step;
            if (this.KnockoutTimer <= 0.0)
                this.RestartGauntlet();
        }

        // Check Victory at THE WALL Breach Gate (X >= 188 m, |Y| <= 12.5 m)!
        if (!this.Breached && !this.KnockedOut && Car.Position[0] >= DDayWallGoalX && Math.abs(Car.Position[1]) <= 12.5)
        {
            this.Breached = true;
            this.Stats.Breaches++;
            if (this.BestBreachSec === null || this.RunTimer < this.BestBreachSec)
                this.BestBreachSec = this.RunTimer;
            this.BannerMessage = `🏆 THE WALL BREACHED IN ${this.RunTimer.toFixed(1)}s! PRESS [NEW ASSAULT RUN] TO RACE AGAIN!`;
            this.BannerTimer   = 8.0;
        }

        // ① Advance the 5 Assault Tanks toward The Wall + Turret Pop-Off Wreck Physics!
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            if (T.Alive)
            {
                T.Pos[0] += T.Speed * Step;
                T.TurretYaw = Math.sin(this.Clock * 0.9 + I * 1.4) * 0.34;
                T.TurretPos = [T.Pos[0], T.Pos[1], 1.52];
                // Once a Tank reaches The Wall gate apron (X = 180 m), cycle reinforcement wave from Beachhead!
                if (T.Pos[0] > 180.0)
                {
                    T.Pos[0] = -198.0;
                    T.Hp     = 100.0;
                }
            }
            else
            {
                // Popped-off turret ballistic arc & bounce!
                if (T.TurretPos[2] > 0.18 || T.TurretVel[2] > 0.0)
                {
                    T.TurretPos[0] += T.TurretVel[0] * Step;
                    T.TurretPos[1] += T.TurretVel[1] * Step;
                    T.TurretPos[2] += T.TurretVel[2] * Step;
                    T.TurretVel[2] -= 19.5 * Step;
                    T.TurretPitch  += 4.2 * Step;
                    T.TurretRoll   += 3.1 * Step;
                    if (T.TurretPos[2] <= 0.18)
                    {
                        T.TurretPos[2] = 0.18;
                        T.TurretVel    = [0.0, 0.0, 0.0];
                    }
                }
                T.WreckTimer -= Step;
                if (T.WreckTimer <= 0.0)
                {
                    // Fresh reinforcement Tank rolls onto the Beachhead!
                    T.Alive       = true;
                    T.Hp          = 100.0;
                    T.Speed       = T.BaseSpeed;
                    T.Pos         = [-198.0, T.LaneY, 0.0];
                    T.TurretPos   = [-198.0, T.LaneY, 1.52];
                    T.TurretPitch = 0.0;
                    T.TurretRoll  = 0.0;
                }
            }
        }

        // Solid Tank-Car Collision + Cover Shadow Evaluation
        this.ResolveCarTankCollisions(Car);

        // ② Landmines: Detonate on Car (< 2.55 m) OR Advancing Tank (< 2.85 m)!
        for (const M of this.Mines)
        {
            if (!M.Armed)
                continue;
            const CarDist = Math.hypot(Car.Position[0] - M.Pos[0], Car.Position[1] - M.Pos[1]);
            if (!this.KnockedOut && CarDist < 2.55 && Car.Position[2] < 1.8)
            {
                M.Armed = false;
                this.Stats.MinesDetonated++;
                this.BannerMessage = "💥 LANDMINE DETONATED — WATCH FOR RED ARMED FUZE DISCS!";
                this.BannerTimer   = 2.2;
                this.SpawnExplosion(M.Pos[0], M.Pos[1], 0.15, 1.55, 7.5, 10.2, 28.0);
                continue;
            }
            for (let TI = 0; TI < this.Tanks.length; ++TI)
            {
                const T = this.Tanks[TI];
                if (T.Alive && Math.hypot(T.Pos[0] - M.Pos[0], T.Pos[1] - M.Pos[1]) < 2.85)
                {
                    M.Armed = false;
                    this.Stats.MinesDetonated++;
                    this.SpawnExplosion(M.Pos[0], M.Pos[1], 0.15, 1.45, 6.5, 6.0, 12.0);
                    this.DamageTank(TI, 24.0);
                    break;
                }
            }
        }

        // ③ 6 Bunker Machine Gun Turrets + 3D Tracer Salvage
        for (const MG of this.MgTurrets)
        {
            const DX = (Car.Position[0] + Car.LinearVelocity[0] * 0.25) - MG.Pos[0];
            const DY = (Car.Position[1] + Car.LinearVelocity[1] * 0.25) - MG.Pos[1];
            const Dist = Math.hypot(DX, DY);
            const DesiredYaw = Math.atan2(DY, DX);
            MG.Yaw += ClampScalar(AngleDelta(MG.Yaw, DesiredYaw), -2.8 * Step, 2.8 * Step);

            MG.Cooldown -= Step;
            if (MG.Cooldown <= 0.0 && Dist < 125.0)
            {
                const Tracer = this.Tracers.find((Tr) => !Tr.Active);
                if (Tracer)
                {
                    const Spread = (Math.sin(this.Clock * 37.0 + MG.Pos[0]) * 0.035);
                    const AimYaw = MG.Yaw + Spread;
                    const Spd    = 112.0;
                    const ZDir   = ((Car.Position[2] + 0.35) - (MG.Pos[2] + 0.28)) / Math.max(12.0, Dist);
                    Tracer.Active = true;
                    Tracer.Pos    = [MG.Pos[0] + Math.cos(AimYaw) * 2.2, MG.Pos[1] + Math.sin(AimYaw) * 2.2, MG.Pos[2] + 0.28];
                    Tracer.Vel    = [Math.cos(AimYaw) * Spd, Math.sin(AimYaw) * Spd, ZDir * Spd];
                    Tracer.Life   = 1.15;
                }
                MG.BurstRem--;
                if (MG.BurstRem <= 0)
                {
                    MG.BurstRem = 5;
                    MG.Cooldown = 0.92;
                }
                else
                {
                    MG.Cooldown = 0.11;
                }
            }
        }

        // Advance 3D Tracer Bolts (blocked by Tanks!! Chips Car Armor if unshielded!)
        for (const Tr of this.Tracers)
        {
            if (!Tr.Active)
                continue;
            const PrevX = Tr.Pos[0], PrevY = Tr.Pos[1];
            Tr.Pos[0] += Tr.Vel[0] * Step;
            Tr.Pos[1] += Tr.Vel[1] * Step;
            Tr.Pos[2] += Tr.Vel[2] * Step;
            Tr.Life   -= Step;
            if (Tr.Life <= 0.0 || Tr.Pos[2] <= 0.02)
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
                    Velocity: [-Tr.Vel[0] * 0.08, -Tr.Vel[1] * 0.08, 3.2],
                    Normal:   [0, 0, 1],
                    Strength: 1.6,
                    Rim:      null
                }], 1.0 / 60.0);
                continue;
            }
            if (!this.KnockedOut && Math.hypot(Tr.Pos[0] - Car.Position[0], Tr.Pos[1] - Car.Position[1]) < 2.25 && Tr.Pos[2] < 2.0)
            {
                Tr.Active = false;
                this.ApplyCarDamage(2.4, "MACHINE GUN FIRE");
                this.Host?.Sparks?.Emit?.([{
                    Point:    [...Tr.Pos],
                    Velocity: [Car.LinearVelocity[0], Car.LinearVelocity[1], 3.5],
                    Normal:   [0, 0, 1],
                    Strength: 2.2,
                    Rim:      null
                }], 1.0 / 60.0);
            }
        }

        // ④ 6 Heavy 155mm Fortress Cannons (Alternate shooting Advancing Tanks & Player Car!)
        for (let CI = 0; CI < this.Cannons.length; ++CI)
        {
            const C = this.Cannons[CI];
            C.Cooldown -= Step;

            // Choose target: odd salvos shoot live Advancing Tanks (making Tanks explode!), even salvos lead the Player!
            let TargetX = Car.Position[0] + Car.LinearVelocity[0] * 0.85;
            let TargetY = Car.Position[1] + Car.LinearVelocity[1] * 0.85;
            const LiveTanks = this.Tanks.filter((T) => T.Alive && T.Pos[0] < C.Pos[0] - 12.0);
            if ((C.SalvoIdx % 2 === 1) && LiveTanks.length > 0)
            {
                const Pick = LiveTanks[C.SalvoIdx % LiveTanks.length];
                TargetX = Pick.Pos[0] + Pick.Speed * 1.05;
                TargetY = Pick.Pos[1];
            }

            const DesiredYaw = Math.atan2(TargetY - C.Pos[1], TargetX - C.Pos[0]);
            C.Yaw += ClampScalar(AngleDelta(C.Yaw, DesiredYaw), -1.6 * Step, 1.6 * Step);

            const Range = Math.hypot(TargetX - C.Pos[0], TargetY - C.Pos[1]);
            if (C.Cooldown <= 0.0 && Range > 18.0 && Range < 245.0)
            {
                const Shell = this.Shells.find((S) => !S.Active);
                if (Shell)
                {
                    const FlightT = ClampScalar(Range / 86.0, 0.45, 1.65);
                    const G = 16.0;
                    const StartZ = C.Pos[2] + 0.62;
                    Shell.Active = true;
                    Shell.Pos    = [C.Pos[0] + Math.cos(C.Yaw) * 6.5, C.Pos[1] + Math.sin(C.Yaw) * 6.5, StartZ];
                    Shell.Target = [TargetX, TargetY];
                    Shell.Vel    = [
                        (TargetX - Shell.Pos[0]) / FlightT,
                        (TargetY - Shell.Pos[1]) / FlightT,
                        (0.25 - StartZ) / FlightT + 0.5 * G * FlightT
                    ];
                    this.Stats.ShellsFired++;
                }
                C.SalvoIdx++;
                C.Cooldown = 2.55 + (CI % 3) * 0.45;
            }
        }

        // Advance 155mm Artillery Shells
        for (const S of this.Shells)
        {
            if (!S.Active)
                continue;
            const PrevX = S.Pos[0], PrevY = S.Pos[1];
            S.Pos[0] += S.Vel[0] * Step;
            S.Pos[1] += S.Vel[1] * Step;
            S.Pos[2] += S.Vel[2] * Step;
            S.Vel[2] -= 16.0 * Step;

            // Direct hit on a Tank hull!
            let HitTank = -1;
            if (S.Pos[2] < 2.45)
                HitTank = this.FindBlockingTankAlongSegment(PrevX, PrevY, S.Pos[0], S.Pos[1]);

            if (HitTank >= 0)
            {
                S.Active = false;
                this.SpawnExplosion(S.Pos[0], S.Pos[1], 1.3, 1.65, 6.5, 5.5, 10.0);
                this.DamageTank(HitTank, 36.0);
                continue;
            }

            if (S.Pos[2] <= 0.15)
            {
                S.Active = false;
                this.SpawnExplosion(S.Pos[0], S.Pos[1], 0.2, 1.75, 9.2, 8.8, 26.0);
                for (let TI = 0; TI < this.Tanks.length; ++TI)
                {
                    const T = this.Tanks[TI];
                    if (T.Alive && Math.hypot(T.Pos[0] - S.Pos[0], T.Pos[1] - S.Pos[1]) < 4.8)
                        this.DamageTank(TI, 34.0);
                }
            }
        }

        // ⑤ 4 Attack Aircraft: Bombing Runs + Periodic Flaming Crash-Dives Toward Cars!
        if (this.Clock >= this.NextCrashSortieClock)
        {
            this.TriggerAircraftCrashDive();
            this.NextCrashSortieClock = this.Clock + 6.4;
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

                // Drop 500-lb Aerial Bombs when sweeping over the Gauntlet!
                A.BombTimer -= Step;
                if (A.BombTimer <= 0.0 && A.BombsLeft > 0 && A.Pos[0] > -175.0 && A.Pos[0] < 185.0)
                {
                    this.DropAerialBomb(A);
                    A.BombsLeft--;
                    A.BombTimer = 0.72;
                }

                if (A.Pos[0] < -280.0 || A.Pos[0] > 300.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
            else if (A.State === "crashing")
            {
                A.Pos[0] += A.Vel[0] * Step;
                A.Pos[1] += A.Vel[1] * Step;
                A.Pos[2] += A.Vel[2] * Step;
                A.Vel[2] -= 5.5 * Step;
                A.Roll   += 6.4 * Step;
                A.Pitch   = 0.46;

                // Trail fire sparks on the way down!
                if ((Math.floor(this.Clock * 30) + AI) % 2 === 0)
                {
                    this.Host?.Sparks?.Emit?.([{
                        Point:    [A.Pos[0], A.Pos[1], A.Pos[2]],
                        Velocity: [-A.Vel[0] * 0.15, -A.Vel[1] * 0.15, 4.0],
                        Normal:   [0, 0, 1],
                        Strength: 2.8,
                        Rim:      null
                    }], 1.0 / 60.0);
                }

                // Crash impact with ground or car!
                const HitCar = !this.KnockedOut && Math.hypot(A.Pos[0] - Car.Position[0], A.Pos[1] - Car.Position[1]) < 4.2 && A.Pos[2] < 2.8;
                if (A.Pos[2] <= 0.65 || HitCar)
                {
                    A.Pos[2]     = 0.55;
                    A.State      = "wreck";
                    A.WreckTimer = 2.8;
                    this.Stats.PlanesCrashed++;
                    this.SpawnExplosion(A.Pos[0], A.Pos[1], 0.6, 2.45, 12.0, 11.5, 38.0);
                }
            }
            else
            {
                A.WreckTimer -= Step;
                if (A.WreckTimer <= 0.0)
                    this.Aircraft[AI] = this.CreateFreshAircraftSortie(AI, false);
            }
        }

        // Advance Falling Aerial Bombs
        for (const B of this.Bombs)
        {
            if (!B.Active)
                continue;
            B.Pos[0] += B.Vel[0] * Step;
            B.Pos[1] += B.Vel[1] * Step;
            B.Pos[2] += B.Vel[2] * Step;
            B.Vel[2] -= 18.0 * Step;
            if (B.Pos[2] <= 0.20)
            {
                B.Active = false;
                this.SpawnExplosion(B.Pos[0], B.Pos[1], 0.2, 1.95, 10.0, 9.8, 30.0);
            }
        }

        // ⑥ Advance 3D Expanding Fireball Animations
        for (const E of this.Explosions)
        {
            if (!E.Active)
                continue;
            E.Age += Step;
            if (E.Age >= E.Duration)
                E.Active = false;
        }

        this.SyncGpuOccupants(false);
        return true;
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

        // ① 5 Tanks (Hull + Rotating / Popped-Off Turret)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            const QHull = MultiplyQuaternion(
                ConstructAxisQuaternion([0, 0, 1], T.Yaw),
                ConstructAxisQuaternion([1, 0, 0], T.Alive ? 0.0 : 0.14)
            );
            DrawChanged = SetOcc(Block.TankHulls[I], ConstructRigidTransform(T.Pos, QHull), true) || DrawChanged;

            let QTurret = ConstructAxisQuaternion([0, 0, 1], T.Yaw + T.TurretYaw);
            if (!T.Alive)
            {
                QTurret = MultiplyQuaternion(
                    QTurret,
                    MultiplyQuaternion(
                        ConstructAxisQuaternion([0, 1, 0], T.TurretPitch),
                        ConstructAxisQuaternion([1, 0, 0], T.TurretRoll)
                    )
                );
            }
            DrawChanged = SetOcc(Block.TankTurrets[I], ConstructRigidTransform(T.TurretPos, QTurret), true) || DrawChanged;
        }

        // ② 6 Bunker MG Turrets & 6 Heavy Cannons
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

        // ③ 4 Aircraft + Spinning Propellers
        for (let I = 0; I < this.Aircraft.length; ++I)
        {
            const A = this.Aircraft[I];
            const QYawPitch = MultiplyQuaternion(
                ConstructAxisQuaternion([0, 0, 1], A.Yaw),
                ConstructAxisQuaternion([0, 1, 0], A.Pitch)
            );
            const QPlane = MultiplyQuaternion(QYawPitch, ConstructAxisQuaternion([1, 0, 0], A.Roll));
            DrawChanged = SetOcc(Block.Aircraft[I], ConstructRigidTransform(A.Pos, QPlane), true) || DrawChanged;

            const NoseOff = RotateVector(QPlane, [3.85, 0.0, 0.58]);
            const NosePos = [A.Pos[0] + NoseOff[0], A.Pos[1] + NoseOff[1], A.Pos[2] + NoseOff[2]];
            const QProp   = MultiplyQuaternion(QPlane, ConstructAxisQuaternion([1, 0, 0], A.PropAngle));
            DrawChanged = SetOcc(Block.Propellers[I], ConstructRigidTransform(NosePos, QProp), A.State !== "wreck") || DrawChanged;
        }

        // ④ 28 Armed Landmines
        for (let I = 0; I < this.Mines.length; ++I)
        {
            const M = this.Mines[I];
            DrawChanged = SetOcc(Block.Mines[I], M.Armed ? ConstructRigidTransform(M.Pos, [0, 0, 0, 1]) : Parked, M.Armed) || DrawChanged;
        }

        // ⑤ Falling Bombs, Artillery Shells & Tracer Bolts
        for (let I = 0; I < this.Bombs.length; ++I)
        {
            const B = this.Bombs[I];
            if (!B.Active)
                DrawChanged = SetOcc(Block.Bombs[I], Parked, false) || DrawChanged;
            else
            {
                const Spd = Math.hypot(B.Vel[0], B.Vel[1], B.Vel[2]) || 1.0;
                const Yaw = Math.atan2(B.Vel[1], B.Vel[0]);
                const Pitch = Math.asin(ClampScalar(-B.Vel[2] / Spd, -0.98, 0.98));
                const Q = MultiplyQuaternion(ConstructAxisQuaternion([0, 0, 1], Yaw), ConstructAxisQuaternion([0, 1, 0], Pitch));
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
                const Yaw = Math.atan2(S.Vel[1], S.Vel[0]);
                const Pitch = Math.asin(ClampScalar(-S.Vel[2] / Spd, -0.98, 0.98));
                const Q = MultiplyQuaternion(ConstructAxisQuaternion([0, 0, 1], Yaw), ConstructAxisQuaternion([0, 1, 0], Pitch));
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

        // ⑥ 3D Expanding Explosion Fireballs!
        for (let I = 0; I < this.Explosions.length; ++I)
        {
            const E = this.Explosions[I];
            if (!E.Active)
                DrawChanged = SetOcc(Block.Explosions[I], Parked, false) || DrawChanged;
            else
            {
                const U = E.Age / E.Duration;
                const Scale = E.MaxScale * Math.sin(Math.min(1.0, U * 1.35) * Math.PI * 0.72 + 0.18);
                const Q = ConstructAxisQuaternion([0, 0, 1], E.Age * 4.5 + I);
                DrawChanged = SetOcc(Block.Explosions[I], ConstructScaledTransform(E.Pos, Q, Math.max(0.25, Scale)), true) || DrawChanged;
            }
        }

        if (DrawChanged)
            this.Scene.ConstructDrawRuns?.();
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       REAL-TIME CLUSTERED EXPLOSION FLASHES & BREACH GATE BEACONS
    //--------------------------------------------------------------------------------------------------------------------

    QueryDynamicLightRecords()
    {
        if (!this.Enabled)
            return [];
        const Out = [
            // Twin Emerald Breach Beacons framing THE WALL Gate at X = +190 m!
            {
                X: 189.5, Y:  10.5, Z: 4.5,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [0.18, 1.0, 0.58], Intensity: 115.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
            },
            {
                X: 189.5, Y: -10.5, Z: 4.5,
                Type: LightType.StreetLamp, Direction: [0, 0, -1],
                Colour: [0.18, 1.0, 0.58], Intensity: 115.0, Reach: 42.0, Params: [0.1, -0.5, 0, 1]
            }
        ];

        // Dynamic Fiery Blast Lights on Active Explosions
        for (const E of this.Explosions)
        {
            if (!E.Active)
                continue;
            const Fade = 1.0 - (E.Age / E.Duration);
            Out.push({
                X: E.Pos[0], Y: E.Pos[1], Z: E.Pos[2] + 2.2,
                Type:      LightType.StreetLamp,
                Direction: [0.0, 0.0, -1.0],
                Colour:    [1.0, 0.52, 0.14],
                Intensity: 210.0 * Fade * E.MaxScale,
                Reach:     48.0 * E.MaxScale,
                Params:    [0.1, -0.5, 0.0, 1.0]
            });
        }

        // Flickering Fire Light on Crashing Aircraft & Burning Tank Wrecks
        for (const A of this.Aircraft)
        {
            if (A.State !== "flying")
            {
                Out.push({
                    X: A.Pos[0], Y: A.Pos[1], Z: A.Pos[2] + 1.2,
                    Type: LightType.StreetLamp, Direction: [0, 0, -1],
                    Colour: [1.0, 0.36, 0.08], Intensity: 130.0, Reach: 38.0, Params: [0.1, -0.5, 0, 1]
                });
            }
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

        // ① 3D Objective Beacon on THE WALL — Central Breach Gate!
        const DistToWall = Math.max(0, Math.round(DDayWallGoalX - Car.Position[0]));
        const GateScreen = Hud.ProjectWorld([191.0, 0.0, 7.2], W, H, Cam);
        if (GateScreen)
        {
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
            Ctx.shadowBlur  = 8;
            Ctx.strokeStyle = "#5cf7b8";
            Ctx.lineWidth   = 2.6;
            const GX = GateScreen[0], GY = GateScreen[1];
            Ctx.beginPath();
            Ctx.moveTo(GX, GY - 11);
            Ctx.lineTo(GX + 11, GY);
            Ctx.lineTo(GX, GY + 11);
            Ctx.lineTo(GX - 11, GY);
            Ctx.closePath();
            Ctx.stroke();

            Ctx.fillStyle = "#6ef7c8";
            Ctx.font      = "800 13px 'DM Sans', system-ui, sans-serif";
            Ctx.textAlign = "center";
            Ctx.fillText(`🎯 THE WALL · BREACH GATE (${DistToWall}m)`, GX, GY - 18);
            Ctx.restore();
        }

        // ② 3D Tactical Tank Cover Callouts (Green = Safe Cover, Red = Critical About to Explode!)
        for (let I = 0; I < this.Tanks.length; ++I)
        {
            const T = this.Tanks[I];
            if (!T.Alive)
                continue;
            const Dist = Math.hypot(T.Pos[0] - Car.Position[0], T.Pos[1] - Car.Position[1]);
            if (Dist > 95.0)
                continue;
            const TP = Hud.ProjectWorld([T.Pos[0], T.Pos[1], 2.95], W, H, Cam);
            if (!TP)
                continue;
            const Critical = T.Hp <= 36.0;
            const Col = Critical ? "#ff5264" : (this.CoverTankIdx === I ? "#6ef7c8" : "#ffd26a");
            Ctx.save();
            Ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
            Ctx.shadowBlur  = 6;
            Ctx.fillStyle   = Col;
            Ctx.font        = "700 11px 'JetBrains Mono', monospace";
            Ctx.textAlign   = "center";
            const Tag = Critical
                ? `⚠️ TANK CRITICAL ${Math.round(T.Hp)}% — CLEAR BLAST!`
                : (this.CoverTankIdx === I ? `🛡️ COVER ACTIVE · TANK ${Math.round(T.Hp)}%` : `🛡️ COVER TANK · ${Math.round(T.Hp)}%`);
            Ctx.fillText(Tag, TP[0], TP[1]);
            Ctx.restore();
        }

        // ③ 3D Warning Callout on Shot-Down Crashing Aircraft + Incoming Shell/Bomb Ground Rings!
        for (const A of this.Aircraft)
        {
            if (A.State !== "crashing")
                continue;
            const AP = Hud.ProjectWorld([A.Pos[0], A.Pos[1], A.Pos[2] + 1.8], W, H, Cam);
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
            if (Math.hypot(TX - Car.Position[0], TY - Car.Position[1]) > 95.0)
                return;
            Ctx.beginPath();
            let Started = false;
            for (let K = 0; K <= 16; ++K)
            {
                const Ang = (K / 16) * Math.PI * 2.0;
                const P = Hud.ProjectWorld([TX + Math.cos(Ang) * Radius, TY + Math.sin(Ang) * Radius, 0.14], W, H, Cam);
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
            if (S.Active) DrawDangerRing(S.Target[0], S.Target[1], 4.8, "rgba(255, 76, 92, 0.78)");
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

        Ctx.fillStyle = ArmorCol;
        Ctx.font      = "700 12px 'JetBrains Mono', monospace";
        const SubLine = `🛡️ ARMOR ${Math.round(this.VehicleArmor)}%   |   ${this.InTankCover ? "🛡️ IN TANK COVER (SHIELDED)" : "⚠️ EXPOSED TO TURRET & CANNON FIRE"}   |   MINES ${this.Mines.filter((M) => M.Armed).length}/28`;
        Ctx.fillText(SubLine, W * 0.5, 42);

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
