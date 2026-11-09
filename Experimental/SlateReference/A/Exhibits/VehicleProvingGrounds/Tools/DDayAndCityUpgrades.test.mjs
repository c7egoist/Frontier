import test from "node:test";
import assert from "node:assert/strict";

import {
    CityPursuitShapes,
    CityPursuitZones,
    ResolveCitySurfaces
} from "../Source/CityPursuitStructure.js";
import {
    DDayStaticShapes,
    DDayCombatShapes,
    DDayWallGoalX
} from "../Source/DDayStructure.js";
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

test("Every D-Day fortification, wall, tank, turret, cannon, aircraft, bomb, shell & mine is a watertight 2-manifold", () =>
{
    const AllDDayShapes = { ...DDayStaticShapes, ...DDayCombatShapes };
    for (const [Name, Spec] of Object.entries(AllDDayShapes))
    {
        const Facets = Spec.Emit();
        assert.ok(Facets.length >= 12, `${Name} should emit valid triangles`);
        const M = MeasureSolidIntegrity(Facets);
        assert.equal(M.Boundary,    0, `DDay shape ${Name} has ${M.Boundary} open boundary edges`);
        assert.equal(M.NonManifold, 0, `DDay shape ${Name} has ${M.NonManifold} non-manifold edges`);
        assert.ok(M.Volume > 0.001,    `DDay shape ${Name} must have positive outward volume (got ${M.Volume})`);
    }
});

test("D-Day Battlefield: advancing tank cover shields car, cannons blow up tanks, mines explode, aircraft drop bombs & crash, and The Wall breaches", async () =>
{
    const Scene = await BuildHeadlessScene("dday");
    const Desc  = ResolveLevelDescriptor("dday");
    assert.ok(Scene.DDayBlock, "SceneStructure('dday') must allocate Scene.DDayBlock");
    assert.ok(Scene.Occupants.length < 1800, `DDay occupant count (${Scene.Occupants.length}) must stay well within 2044 ceiling`);

    const Vehicle = new VehicleSolver(Scene.QueryObstacleBounds());
    Vehicle.Surfaces = Desc.Surfaces;
    Vehicle.Respawn([-194.0, 0.0, 0.63], 0.0);

    let ExplosionSounds = 0;
    const Host = {
        Scene,
        LevelKey: "dday",
        Vehicle,
        Bodies: null,
        Sparks: { Emit() {} },
        DrivingHud: { Audio: { PlayExplosionBoom() { ExplosionSounds++; } } }
    };

    const Combat = new DDayCombatSequence(Host);
    assert.equal(Combat.Enabled, true);
    assert.equal(Combat.Tanks.length, 5);
    assert.equal(Combat.Mines.length, 28);

    // ① Tuck car directly behind Tank #0 -> verify active Tank Cover & line-of-fire shielding!
    const T0 = Combat.Tanks[0];
    const StartTankX = T0.Pos[0];
    Vehicle.Position[0] = T0.Pos[0] - 6.5;
    Vehicle.Position[1] = T0.Pos[1];
    Combat.Advance(1.0 / 30.0);
    assert.ok(T0.Pos[0] > StartTankX, "Assault Tank must advance toward The Wall (+X)");
    assert.equal(Combat.InTankCover, true, "Car tucked behind advancing Tank must register InTankCover === true");
    assert.equal(
        Combat.FindBlockingTankAlongSegment(T0.Pos[0] + 40.0, T0.Pos[1], Vehicle.Position[0], Vehicle.Position[1]),
        0,
        "Tank #0 hull must block incoming fire from ahead of the Tank"
    );

    // ② Cannon hits destroy Tank -> catastrophic cook-off explosion & turret pop-off!
    Combat.DamageTank(0, 110.0);
    assert.equal(T0.Alive, false);
    assert.ok(Combat.Stats.TanksExploded >= 1);
    assert.ok(T0.TurretVel[2] > 8.0, "Exploding Tank must launch its turret upward");

    // ③ Landmine explodes when car drives over armed mine!
    const ArmedMine = Combat.Mines.find((M) => M.Armed);
    Vehicle.Position[0] = ArmedMine.Pos[0];
    Vehicle.Position[1] = ArmedMine.Pos[1];
    Vehicle.Position[2] = 0.63;
    Vehicle.LinearVelocity = [12.0, 0.0, 0.0];
    Combat.Advance(1.0 / 30.0);
    assert.equal(ArmedMine.Armed, false, "Landmine must detonate on car proximity");
    assert.ok(Combat.Stats.MinesDetonated >= 1);
    assert.ok(Vehicle.LinearVelocity[2] > 2.5, "Mine blast must apply upward impulse to car");
    assert.ok(ExplosionSounds >= 1, "Battlefield explosions must trigger procedural explosion audio");

    // ④ Aircraft drops bombs & executes flaming crash-dive into ground explosion!
    const CrashingPlane = Combat.TriggerAircraftCrashDive();
    assert.ok(CrashingPlane && CrashingPlane.State === "crashing");
    for (let Step = 0; Step < 150; ++Step)
        Combat.Advance(1.0 / 30.0);
    assert.ok(Combat.Stats.BombsDropped >= 1, "Attack aircraft must drop aerial bombs during gauntlet passes");
    assert.ok(Combat.Stats.PlanesCrashed >= 1, "Stricken aircraft must complete crash dive and explode");
    assert.ok(Combat.Stats.ShellsFired >= 1, "Heavy 155mm cannons must fire artillery shells");

    // ⑤ Sprint through THE WALL Central Breach Gate -> Victory!
    Combat.KnockedOut = false;
    Combat.VehicleArmor = 80.0;
    Vehicle.Position[0] = DDayWallGoalX + 1.5;
    Vehicle.Position[1] = 0.0;
    Combat.Advance(1.0 / 30.0);
    assert.equal(Combat.Breached, true, "Crossing The Wall Breach Gate must trigger Victory");
    assert.ok(Combat.BestBreachSec > 0.0);
});
