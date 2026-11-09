import test from "node:test";
import assert from "node:assert/strict";

import {
    CityPursuitShapes,
    CityPursuitZones,
    ResolveCitySurfaces
} from "../Source/CityPursuitStructure.js";
import { ConstructMaterialSpecification, CourseMaterial } from "../Source/MaterialSpecification.js";
import {
    DDayStaticShapes,
    DDayCombatShapes,
    DDayShellCraters,
    DDaySpawn,
    DDayWallGoalX,
    EmitDDayGroundFacets,
    QueryDDayTerrainHeight,
    QueryDDayTrenchDepth
} from "../Source/DDayStructure.js";
import { AssignCustomTerrainHeight, ResolveCourseHeight, ResolveCourseNormal } from "../Source/CourseStructure.js";
import { RecoveryDirector } from "../Source/RecoveryDirector.js";
import { SceneStructure } from "../Source/FacetStructure.js";
import { ResolveLevelDescriptor } from "../Source/LevelStructure.js";
import { VehicleSolver } from "../Source/VehicleSolver.js";
import { CastSurfaceRay } from "../Source/RampSurfaceProjection.js";
import { PolicePursuitSequence } from "../Source/PolicePursuitSequence.js";
import { DDayCombatSequence } from "../Source/DDayCombatSequence.js";

async function BuildHeadlessScene(LevelKey)
{
    const Fs   = await import("node:fs/promises");
    const Path = await import("node:path");
    const Root = Path.resolve(import.meta.dirname, "..");
    const PrevFetch = globalThis.fetch;
    globalThis.fetch = async (Url) =>
    {
        const Rel   = String(Url).replace(/^\.\//, "").split("?")[0];
        const Bytes = await Fs.readFile(Path.join(Root, Rel));
        return { ok: true, arrayBuffer: async () => Bytes.buffer.slice(Bytes.byteOffset, Bytes.byteOffset + Bytes.byteLength) };
    };
    try
    {
        const Scene = new SceneStructure();
        await Scene.ConstructScene("Archive", 0, LevelKey);
        return Scene;
    }
    finally
    {
        globalThis.fetch = PrevFetch;
    }
}

// Exact topological 2-manifold & signed-volume verifier (mirrors InversionArena.test.mjs)
function MeasureSolidIntegrity(Facets)
{
    const Key = (P) => `${Math.round(P[0] * 1e4)},${Math.round(P[1] * 1e4)},${Math.round(P[2] * 1e4)}`;
    const DirectedEdges = new Map();
    let SignedVolume6 = 0.0;
    let MinZ = Infinity, MaxZ = -Infinity;

    for (const F of Facets)
    {
        const [A, B, C] = F.Corners;
        for (const P of F.Corners)
        {
            if (P[2] < MinZ) MinZ = P[2];
            if (P[2] > MaxZ) MaxZ = P[2];
        }
        const KA = Key(A), KB = Key(B), KC = Key(C);
        if (KA === KB || KB === KC || KC === KA)
            continue;
        for (const [U, V] of [[KA, KB], [KB, KC], [KC, KA]])
        {
            const E = `${U}->${V}`;
            DirectedEdges.set(E, (DirectedEdges.get(E) || 0) + 1);
        }
        SignedVolume6 += (
            A[0] * (B[1] * C[2] - B[2] * C[1]) -
            A[1] * (B[0] * C[2] - B[2] * C[0]) +
            A[2] * (B[0] * C[1] - B[1] * C[0])
        );
    }

    let Boundary = 0, NonManifold = 0;
    for (const [E, Count] of DirectedEdges.entries())
    {
        if (Count !== 1)
            NonManifold += Count;
        const [U, V] = E.split("->");
        if (!DirectedEdges.has(`${V}->${U}`))
            Boundary++;
    }
    return { Boundary, NonManifold, Volume: SignedVolume6 / 6.0, MinZ, MaxZ };
}

test("City buildings sit grounded at Z = 0.0, all alley & pedestrian curb ramps are watertight, and zones carry Note labels", () =>
{
    for (const Zone of CityPursuitZones)
        assert.ok(typeof Zone.Note === "string" && Zone.Note.length >= 6, `Zone ${Zone.Name} missing Note`);

    const GroundedShapes = [
        "CityBlockLow",
        "CityBlockMid",
        "CityBlockTall",
        "CityBlockTower",
        "CityAlleyDrivewayRamp",
        "CityAlleyPavedCorridor",
        "CityPedestrianCurbRamp"
    ];
    for (const Name of GroundedShapes)
    {
        const Facets = CityPursuitShapes[Name].Emit();
        const M = MeasureSolidIntegrity(Facets);
        assert.equal(M.Boundary,    0, `${Name} has ${M.Boundary} open boundary edges`);
        assert.equal(M.NonManifold, 0, `${Name} has ${M.NonManifold} non-manifold edges`);
        assert.ok(M.Volume > 0.01,     `${Name} must enclose positive outward volume (got ${M.Volume})`);
        assert.ok(Math.abs(M.MinZ) < 1.0e-4, `${Name} must sit flush on Z=0 ground (got MinZ=${M.MinZ})`);
    }

    // Verify all 16 smooth C¹ Alley Driveway Apron Physics Surfaces resolve smooth curb transitions
    const Surfaces = ResolveCitySurfaces();
    assert.equal(Surfaces.length, 16);
    const HitCrown = CastSurfaceRay(Surfaces, [-102.5, 85.5, 1.0], [0.0, 0.0, -1.0], 2.0);
    assert.ok(HitCrown, "Alley driveway ramp surface must answer vertical suspension ray");
    assert.ok(HitCrown.Point[2] > 0.16 && HitCrown.Point[2] < 0.21, `Expected curb crown ~0.19m, got ${HitCrown.Point[2]}`);
});

test("Smart Police Drones avoid City building AABBs, maintain alley Recon lock, sprint ahead on Cut-Off, and fire EMP pulse", async () =>
{
    const Scene = await BuildHeadlessScene("city");
    const Desc  = ResolveLevelDescriptor("city");
    const Vehicle = new VehicleSolver(Scene.QueryObstacleBounds());
    Vehicle.Surfaces = [...(Desc.Surfaces || []), ...(Scene.RoadEditor?.Surfaces || [])];
    Vehicle.Respawn([-120.0, 47.0, 0.63], 0.0); // Inside NW Covered Escape Alley!

    const Host = {
        Scene,
        LevelKey: "city",
        Vehicle,
        Bodies: null,
        Sparks: { Emit() {} },
        TrafficLights: Scene.TrafficLights
    };
    const Pursuit = new PolicePursuitSequence(Host);
    Pursuit.StartPursuit("TEST SMART DRONE SWARM");

    // Place Drone 0 outside the building corner so it has to navigate around the building into the alley!
    Pursuit.DroneStates[0].Pos = [-145.0, 22.0, 2.8];
    // Place Drone 2 right behind the car in the open alley so it charges & discharges EMP!
    Pursuit.DroneStates[2].Pos = [-124.5, 47.0, 2.2];
    Vehicle.LinearVelocity = [18.0, 0.0, 0.0];

    const Boxes = Pursuit.FlatObstacleBoxes;
    let EmpFired = false;
    for (let Step = 0; Step < 140; ++Step)
    {
        Pursuit.AdvanceAerialUnits(1.0 / 60.0, Vehicle);
        if (Pursuit.DroneStates[2].Cooldown > 0.0)
            EmpFired = true;

        // Verify NO drone ever penetrates inside any City building AABB!
        for (const D of Pursuit.DroneStates)
        {
            for (let B = 0; B < Boxes.length; B += 4)
            {
                const Inside = D.Pos[0] > Boxes[B] + 0.2 && D.Pos[0] < Boxes[B + 2] - 0.2 &&
                               D.Pos[1] > Boxes[B + 1] + 0.2 && D.Pos[1] < Boxes[B + 3] - 0.2;
                assert.equal(Inside, false, `Drone ${D.Role} clipped inside obstacle box [${Boxes.slice(B, B + 4)}] at ${D.Pos}`);
            }
        }
    }

    assert.equal(EmpFired, true, "EMP Disruptor Drone must charge to 100% and fire EMP pulse when holding close LOS");
    assert.ok(Pursuit.DroneStates[1].Pos[0] > Vehicle.Position[0] + 4.0, "CUTOFF Drone must sprint ahead of Evader");
});

test("Every D-Day fortification, wall, tank, turret, cannon, aircraft, wire, craft, bomb, shell & mine is a watertight 2-manifold with valid WWII PBR materials", () =>
{
    const Materials     = ConstructMaterialSpecification();
    const AllDDayShapes = { ...DDayStaticShapes, ...DDayCombatShapes };
    for (const [Name, Spec] of Object.entries(AllDDayShapes))
    {
        const Facets = Spec.Emit();
        assert.ok(Facets.length >= 12, `${Name} should emit valid triangles`);
        const M = MeasureSolidIntegrity(Facets);
        assert.equal(M.Boundary,    0, `DDay shape ${Name} has ${M.Boundary} open boundary edges`);
        assert.equal(M.NonManifold, 0, `DDay shape ${Name} has ${M.NonManifold} non-manifold edges`);
        assert.ok(M.Volume > 0.001,    `DDay shape ${Name} must have positive outward volume (got ${M.Volume})`);

        // Guard against undefined CourseMaterial keys (which silently coerce to 0 = CheckerLight snow-white!)
        for (const F of Facets)
        {
            assert.equal(typeof F.Family, "number", `${Name} has undefined/non-numeric material ID`);
            assert.ok(Materials[F.Family] !== undefined, `${Name} references out-of-range material ID ${F.Family}`);
        }
    }

    // Verify D-Day Ground Mesh uses valid Normandy beach/mud/water materials (ZERO undefined / snow-white CheckerLight!)
    const GroundFacets = EmitDDayGroundFacets();
    for (const F of GroundFacets)
    {
        assert.equal(typeof F.Family, "number", "DDayGround triangle has undefined material");
        assert.notEqual(F.Family, CourseMaterial.CheckerLight, "DDayGround must never fall back to CheckerLight (0)");
        assert.ok(Materials[F.Family] !== undefined, `DDayGround references invalid material ${F.Family}`);
    }

    // Verify Sherman Tank uses authentic WWII OD#9 OliveDrab (NOT shipping-container green!)
    const HullMats = new Set(DDayCombatShapes.DDayTankHull.Emit().map((F) => F.Family));
    assert.equal(HullMats.has(CourseMaterial.OliveDrab), true, "Sherman Tank Hull must use WWII OliveDrab");
    assert.equal(HullMats.has(CourseMaterial.ContainerGreen), false, "Sherman Tank Hull must NOT use ContainerGreen");

    // Verify Tellermine is subtle weathered olive/mud/brass (NOT bright neon red!)
    const MineMats = new Set(DDayCombatShapes.DDayLandmine.Emit().map((F) => F.Family));
    assert.equal(MineMats.has(CourseMaterial.KerbRed), false, "Tellermine must NOT use obvious bright KerbRed");
    assert.equal(MineMats.has(CourseMaterial.TrafficRed), false, "Tellermine must NOT use obvious neon TrafficRed");
});

test("D-Day Omaha Beach: 5-tier topography, sunken trenches, barbed wire, Sherman tank cover, subtle mines & natural skidding plane crashes", async () =>
{
    const Scene = await BuildHeadlessScene("dday");
    const Desc  = ResolveLevelDescriptor("dday");
    assert.ok(Scene.DDayBlock, "SceneStructure('dday') must allocate Scene.DDayBlock");
    assert.equal("DDayExplosionFireball" in DDayCombatShapes, false, "Fake box explosion shape must NOT exist");
    assert.equal("Explosions" in Scene.DDayBlock, false, "DDayBlock must NOT allocate fake explosion box instances");
    assert.equal(Scene.DDayBlock.BarbedWire.length, 24, "DDayBlock must allocate 24 interactive Barbed Wire instances");
    assert.ok(Scene.Occupants.length < 1850, `DDay occupant count (${Scene.Occupants.length}) must stay well within 2044 ceiling`);

    // ① Verify 5-Tier Omaha Beach Topography: Shingle Bangalore Breaches, -1.4m Sunken Trenches, Bluffs & Chalk Spur!
    const BeachZ        = QueryDDayTerrainHeight(DDaySpawn.Position[0], DDaySpawn.Position[1]);
    const ShingleCrestZ = QueryDDayTerrainHeight(-140.0, -10.0);
    const ShingleGapZ   = QueryDDayTerrainHeight(-140.0,   5.5); // Center Bangalore Breach!
    const TrenchFloorZ  = QueryDDayTerrainHeight(-88.0,  -19.25); // Dog-Green Sunken Trench centerline!
    const PlateauNearZ  = QueryDDayTerrainHeight(-88.0,   -8.0);
    const NorthBluffZ   = QueryDDayTerrainHeight(-46.0,   48.0);
    const ChalkSpurZ    = QueryDDayTerrainHeight( 94.0,    1.0);
    const SouthDrawZ    = QueryDDayTerrainHeight( 94.0,  -24.0);
    const GlacisZ       = QueryDDayTerrainHeight(175.0,    0.0);

    assert.ok(ShingleCrestZ > ShingleGapZ + 0.75, "Shingle Seawall must have blasted lower Bangalore Breaches for vehicles");
    assert.ok(QueryDDayTrenchDepth(-88.0, -19.25) > 1.30, "Dog-Green Zig-Zag Trench must be sunken > 1.30 m below plateau");
    assert.ok(PlateauNearZ - TrenchFloorZ > 1.0, "Sunken Trench floor must sit > 1.0 m below open kill-zone plateau");
    assert.ok(NorthBluffZ > PlateauNearZ + 4.5, "Normandy coastal bluffs must rise steeply above the beach plateau");
    assert.ok(ChalkSpurZ > SouthDrawZ + 2.2, "Central Chalk Spur must rise between Vierville South Draw and North Defile");
    assert.ok(GlacisZ > BeachZ + 2.5, "Battlefield must climb from surf beachhead up to the inland Atlantic Wall");

    const Crater0 = DDayShellCraters[0];
    const CraterCenterZ = QueryDDayTerrainHeight(Crater0[0], Crater0[1]);
    const CraterRimZ    = QueryDDayTerrainHeight(Crater0[0] + Crater0[2] * 0.92, Crater0[1]);
    assert.ok(CraterRimZ - CraterCenterZ > 0.50, "Shell crater must have raised blast rim & concave bowl");
    assert.equal(ResolveCourseHeight(Crater0[0], Crater0[1]), CraterCenterZ, "ResolveCourseHeight must sample D-Day terrain");
    const SlopeNormal = ResolveCourseNormal(Crater0[0] + Crater0[2] * 0.45, Crater0[1]);
    assert.ok(Math.hypot(SlopeNormal[0], SlopeNormal[1]) > 0.05, "ResolveCourseNormal must reflect uneven crater wall slope");

    const Vehicle = new VehicleSolver(Scene.QueryObstacleBounds());
    Vehicle.Surfaces = Desc.Surfaces;
    Vehicle.Respawn([DDaySpawn.Position[0], DDaySpawn.Position[1], BeachZ + 0.63], DDaySpawn.Yaw);

    // ② Verify RecoveryDirector allows smooth driving off the surf foreshore without OutOfBounds derez!
    const RecoveryHost = {
        LevelDescriptor: Desc,
        Vehicle,
        Spawn: Desc.Spawn,
        Effects: { Derez() {}, Rez() {}, Clear() {} },
        RestoreTyres() {},
        AfterVehicleMoved() {},
        Shell: { Announce() {} }
    };
    const Recovery = new RecoveryDirector(RecoveryHost);
    const StartDriveX = Vehicle.Position[0];
    for (let S = 0; S < 90; ++S)
    {
        Vehicle.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
        Recovery.Watch(Vehicle, 1.0 / 60.0);
    }
    assert.equal(Recovery.Busy, false, "D-Day surf spawn must NOT trigger OutOfBounds derez");
    assert.equal(Boolean(Vehicle.Hidden), false, "Player vehicle must remain visible and drivable on D-Day");
    assert.ok(Vehicle.Position[0] > StartDriveX + 2.5, "Throttle on D-Day must accelerate car forward across foreshore");

    let ExplosionSounds = 0, PlumeBursts = 0, DebrisBursts = 0, SparkBursts = 0;
    const Host = {
        Scene,
        LevelKey: "dday",
        Vehicle,
        Bodies: null,
        Smoke:   { Sources: { QueueBurst() { PlumeBursts++; } } },
        Effects: { BurstTyre() { DebrisBursts++; } },
        Sparks:  { Emit() { SparkBursts++; } },
        DrivingHud: { Audio: { PlayExplosionBoom() { ExplosionSounds++; } } }
    };

    const Combat = new DDayCombatSequence(Host);
    assert.equal(Combat.Enabled, true);
    assert.equal(Combat.Tanks.length, 5);
    assert.equal(Combat.Mines.length, 28);
    assert.equal(Combat.BarbedWires.length, 24);

    // ③ Sherman Tank Armored Lee: shields car & draws 100% of Casemate MG aggro!
    const T0 = Combat.Tanks[0];
    const StartTankX = T0.Pos[0];
    Vehicle.Position[0] = T0.Pos[0] - Math.cos(T0.Yaw) * 7.0;
    Vehicle.Position[1] = T0.Pos[1] - Math.sin(T0.Yaw) * 7.0;
    Vehicle.Position[2] = QueryDDayTerrainHeight(Vehicle.Position[0], Vehicle.Position[1]) + 0.63;
    Combat.Advance(1.0 / 30.0);
    assert.ok(T0.Pos[0] > StartTankX, "Sherman Tank must advance along its winding route");
    assert.equal(Combat.InTankCover, true, "Car tucked in Sherman lee must register InTankCover === true");
    assert.equal(Combat.MgTurrets.filter((M) => M.TargetingCar).length, 0, "Zero Casemate MGs should target a car in Tank Cover");

    // ④ Sunken Zig-Zag Trench Defilade & Interactive Barbed Wire Snagging!
    Vehicle.Position[0] = -88.0;
    Vehicle.Position[1] = -19.25;
    Vehicle.Position[2] = TrenchFloorZ + 0.60;
    Combat.Advance(1.0 / 30.0);
    assert.equal(Combat.InTrenchCover, true, "Car inside sunken Dog-Green Trench must register InTrenchCover === true");
    assert.equal(Combat.MgTurrets.filter((M) => M.TargetingCar).length, 0, "Casemate MGs must NOT target car hull-down in Sunken Trench");

    const FirstWire = Combat.BarbedWires.find((W) => W.Intact);
    Vehicle.Position[0] = FirstWire.Pos[0];
    Vehicle.Position[1] = FirstWire.Pos[1];
    Vehicle.Position[2] = FirstWire.Pos[2] + 0.65;
    Vehicle.LinearVelocity = [18.0, 0.0, 0.0];
    Combat.Advance(1.0 / 30.0);
    assert.equal(FirstWire.Intact, false, "Driving through Barbed Wire must tear & flatten the wire section");
    assert.ok(Vehicle.LinearVelocity[0] < 12.0, "Snagging Barbed Wire must drag down vehicle speed");
    assert.ok(Combat.Stats.WireCrushed >= 1);

    // ⑤ Sherman ammo cook-off & catastrophic turret blow-off + subtle buried Tellermine detonation!
    Combat.DamageTank(1, 105.0, false);
    Combat.DamageTank(0, 55.0);
    Combat.DamageTank(0, 55.0);
    assert.equal(T0.CookingOff, true, "Repeated cannon hits must trigger 1.55s Sherman ammo cook-off warning");
    Combat.DamageTank(0, 110.0, true);
    assert.equal(T0.Alive, false);
    assert.ok(T0.TurretVel[2] > 8.0, "Catastrophic Sherman explosion must blow turret upward");
    assert.ok(PlumeBursts >= 1 && DebrisBursts >= 1 && SparkBursts >= 1);
    assert.ok(Combat.QueryPlumeEmissions().length >= 1);

    const ArmedMine = Combat.Mines.find((M) => M.Armed);
    Vehicle.Position[0] = ArmedMine.Pos[0];
    Vehicle.Position[1] = ArmedMine.Pos[1];
    Vehicle.Position[2] = ArmedMine.Pos[2] + 0.55;
    Vehicle.LinearVelocity = [12.0, 0.0, 0.0];
    Combat.Advance(1.0 / 30.0);
    assert.equal(ArmedMine.Armed, false, "Buried Tellermine must detonate when driven over");
    assert.ok(Vehicle.LinearVelocity[2] > 2.5, "Tellermine blast must launch chassis upward");
    assert.ok(ExplosionSounds >= 1);

    // ⑥ Natural Multi-Stage Aircraft Crash: "diving" -> high-speed ground "skidding" (propeller shears off, slides > 15 m!) -> "wreck"!
    Vehicle.Position = [-60.0, 0.0, QueryDDayTerrainHeight(-60.0, 0.0) + 0.63];
    const StrickenPlane = Combat.TriggerAircraftCrashDive();
    assert.ok(StrickenPlane && StrickenPlane.State === "diving", "Flak hit must enter gravity-driven 'diving' spiral");
    let SawSkidding = false;
    let TouchdownPos = null;
    let EndSkidPos   = null;
    for (let Step = 0; Step < 150; ++Step)
    {
        Combat.Advance(1.0 / 30.0);
        if (StrickenPlane.State === "skidding")
        {
            if (!SawSkidding)
            {
                SawSkidding  = true;
                TouchdownPos = [...StrickenPlane.Pos];
                assert.equal(StrickenPlane.PropAttached, false, "Propeller must shear off cleanly upon belly impact");
            }
            EndSkidPos = [...StrickenPlane.Pos];
        }
    }
    assert.equal(SawSkidding, true, "Crashing aircraft must belly-skid across the terrain instead of freezing nose-in");
    const SkidDistance = Math.hypot(EndSkidPos[0] - TouchdownPos[0], EndSkidPos[1] - TouchdownPos[1]);
    assert.ok(SkidDistance > 15.0, `Belly-skidding aircraft must plough > 15 m across the beach (skidded ${SkidDistance.toFixed(1)} m)`);
    assert.ok(Combat.Stats.PlanesCrashed >= 1, "Skidding aircraft must finish with fuel-tank cook-off into 'wreck'");
    assert.ok(Combat.Stats.BombsDropped >= 1);
    assert.ok(Combat.Stats.ShellsFired >= 1);
    assert.ok(Combat.Stats.TankShotsFired >= 1);

    // ⑦ Sprint through THE ATLANTIC WALL Breach Gate -> Victory!
    Combat.KnockedOut   = false;
    Combat.VehicleArmor = 80.0;
    Vehicle.Position[0] = DDayWallGoalX + 1.5;
    Vehicle.Position[1] = 0.0;
    Combat.Advance(1.0 / 30.0);
    assert.equal(Combat.Breached, true, "Crossing The Atlantic Wall Breach Gate must trigger Victory");
    assert.ok(Combat.BestBreachSec > 0.0);
    AssignCustomTerrainHeight(null);
});
