import test from "node:test";
import assert from "node:assert/strict";

import { ConstructMaterialSpecification, CourseMaterial } from "../Source/MaterialSpecification.js";
import {
    CandyCombatShapes,
    CandyGoalX,
    CandyGummyBumpers,
    CandySpawn,
    CandyStaticShapes,
    EmitCandyGroundFacets,
    QueryCandyTerrainHeight
} from "../Source/CandyVillageStructure.js";
import { CandyVillageSequence, CandyWaterSolver } from "../Source/CandyVillageSequence.js";
import { AssignCustomTerrainHeight } from "../Source/CourseStructure.js";
import { RecoveryDirector } from "../Source/RecoveryDirector.js";
import { SceneStructure } from "../Source/FacetStructure.js";
import { LevelCatalog, ResolveLevelDescriptor } from "../Source/LevelStructure.js";
import { VehicleSolver } from "../Source/VehicleSolver.js";

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

function MeasureSolidIntegrity(Facets)
{
    const Quantize = (V) => `${Math.round(V[0] * 1e5)},${Math.round(V[1] * 1e5)},${Math.round(V[2] * 1e5)}`;
    const Directed = new Map();
    const Undirected = new Map();
    let SignedVolume6 = 0.0;

    for (const F of Facets)
    {
        const [A, B, C] = F.Corners;
        SignedVolume6 += A[0] * (B[1] * C[2] - B[2] * C[1])
                       - A[1] * (B[0] * C[2] - B[2] * C[0])
                       + A[2] * (B[0] * C[1] - B[1] * C[0]);

        const KA = Quantize(A), KB = Quantize(B), KC = Quantize(C);
        for (const [U, V] of [[KA, KB], [KB, KC], [KC, KA]])
        {
            const DirKey = `${U}->${V}`;
            Directed.set(DirKey, (Directed.get(DirKey) || 0) + 1);
            const UndirKey = U < V ? `${U}|${V}` : `${V}|${U}`;
            Undirected.set(UndirKey, (Undirected.get(UndirKey) || 0) + 1);
        }
    }

    let Boundary = 0, NonManifold = 0;
    for (const [Key, Count] of Undirected.entries())
    {
        if (Count === 1) Boundary++;
        else if (Count !== 2) NonManifold++;
        else
        {
            const [U, V] = Key.split("|");
            if ((Directed.get(`${U}->${V}`) || 0) !== 1 || (Directed.get(`${V}->${U}`) || 0) !== 1)
                NonManifold++;
        }
    }
    return { Boundary, NonManifold, Volume: SignedVolume6 / 6.0 };
}

test("Every Candy Village building, bridge, Gummy-Bear worm, catapult, old-school cannon & projectile is a watertight 2-manifold with valid PBR materials", () =>
{
    assert.equal(LevelCatalog.some((L) => L.Key === "candy"), true, "LevelCatalog must expose 'candy'");
    const Materials = ConstructMaterialSpecification();
    const AllShapes = { ...CandyStaticShapes, ...CandyCombatShapes };

    for (const [Name, Spec] of Object.entries(AllShapes))
    {
        const Facets = Spec.Emit();
        assert.ok(Facets.length >= 12, `${Name} should emit valid triangles`);
        const M = MeasureSolidIntegrity(Facets);
        assert.equal(M.Boundary,    0, `Candy shape ${Name} has ${M.Boundary} open boundary edges`);
        assert.equal(M.NonManifold, 0, `Candy shape ${Name} has ${M.NonManifold} non-manifold edges`);
        assert.ok(M.Volume > 0.001,    `Candy shape ${Name} must have positive outward volume (got ${M.Volume})`);

        for (const F of Facets)
        {
            assert.equal(typeof F.Family, "number", `${Name} has undefined material`);
            assert.ok(Materials[F.Family] !== undefined, `${Name} references invalid material ${F.Family}`);
        }
    }

    const GroundFacets = EmitCandyGroundFacets();
    for (const F of GroundFacets)
    {
        assert.equal(typeof F.Family, "number");
        assert.notEqual(F.Family, CourseMaterial.CheckerLight);
        assert.ok(Materials[F.Family] !== undefined);
    }
});

test("2.5D Saint-Venant Shallow-Water Solver propagates gravity waves, handles wet/dry banks & streams finite smooth normals", () =>
{
    const Solver = new CandyWaterSolver();

    // Dry Waffle Square bank vs Deep 2.5D Fizzy Lagoon channel vs Wadeable Central Ford
    const DryBank    = Solver.Sample(-185.0,   0.0);
    const DeepLagoon = Solver.Sample( -86.0, -20.0);
    const FordBar    = Solver.Sample( -86.0,   0.0);
    assert.equal(DryBank.Depth, 0.0, "Elevated Waffle Square cobbles must be dry (Depth === 0)");
    assert.ok(DeepLagoon.Depth > 0.90, `Lagoon channel under bridges must hold > 0.90 m of 2.5D water (got ${DeepLagoon.Depth.toFixed(2)})`);
    assert.ok(FordBar.Depth > 0.30 && FordBar.Depth < DeepLagoon.Depth - 0.30, "Central Lagoon Ford must be shallower & wadeable");

    // Inject radial splash + Tidal Surge -> verify wave propagation across neighboring cells & finite smooth normals!
    const NeighborBefore = Solver.Sample(-80.0, -20.0).Depth;
    Solver.InjectDisturbance(-86.0, -20.0, 5.5, -0.55, 0.0, 0.0, 1.0);
    Solver.TriggerTidalSurge(true);
    for (let Step = 0; Step < 25; ++Step)
        Solver.Advance(1.0 / 60.0);

    const NeighborAfter = Solver.Sample(-80.0, -20.0);
    assert.notEqual(NeighborAfter.Depth.toFixed(4), NeighborBefore.toFixed(4), "2.5D Shallow-Water gravity waves must propagate to neighboring cells");
    assert.ok(Solver.WaveEnergy > 1.0, "Active 2.5D shallow-water waves must carry positive momentum energy");

    for (let V = 0; V < Solver.VertexCount; ++V)
    {
        const Off = V * 8;
        assert.ok(Number.isFinite(Solver.VertexF32[Off + 2]), "Water vertex Z must be finite");
        const NLen = Math.hypot(Solver.VertexF32[Off + 4], Solver.VertexF32[Off + 5], Solver.VertexF32[Off + 6]);
        assert.ok(Math.abs(NLen - 1.0) < 1.0e-3, "Water vertex analytic normal must be unit length");
    }
});

test("Candy Village Gameplay: 2.5D water slowdown & fizz-wash, Gummy-Bear worms, flaming gummy catapults, old-school candy cannons & bouncy gummy pads", async () =>
{
    const Scene = await BuildHeadlessScene("candy");
    const Desc  = ResolveLevelDescriptor("candy");
    assert.ok(Scene.CandyBlock, "SceneStructure('candy') must allocate Scene.CandyBlock");
    assert.ok(Scene.CandyWaterBlock, "SceneStructure('candy') must allocate live-streamed Scene.CandyWaterBlock");
    assert.ok(Scene.Occupants.length < 750, `Candy occupant count (${Scene.Occupants.length}) must stay lightweight & well below 2044`);

    const StartZ  = QueryCandyTerrainHeight(CandySpawn.Position[0], CandySpawn.Position[1]);
    const Vehicle = new VehicleSolver(Scene.QueryObstacleBounds());
    Vehicle.Surfaces = Desc.Surfaces;
    Vehicle.Respawn([CandySpawn.Position[0], CandySpawn.Position[1], StartZ + 0.63], CandySpawn.Yaw);

    const Recovery = new RecoveryDirector({
        LevelDescriptor: Desc, Vehicle, Spawn: Desc.Spawn,
        Effects: { Derez() {}, Rez() {}, Clear() {} }, RestoreTyres() {}, AfterVehicleMoved() {}, Shell: { Announce() {} }
    });
    for (let S = 0; S < 60; ++S)
    {
        Vehicle.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
        Recovery.Watch(Vehicle, 1.0 / 60.0);
    }
    assert.equal(Recovery.Busy, false, "Candy Village spawn must drive cleanly without OutOfBounds derez");
    assert.ok(Vehicle.Position[0] > CandySpawn.Position[0] + 1.5);

    let PlumeBursts = 0, DebrisBursts = 0, SparkBursts = 0;
    const Host = {
        Scene, LevelKey: "candy", Vehicle, Bodies: null,
        Smoke:   { Sources: { QueueBurst() { PlumeBursts++; } } },
        Effects: { BurstTyre() { DebrisBursts++; } },
        Sparks:  { Emit() { SparkBursts++; } },
        DrivingHud: { Audio: { PlayExplosionBoom() {} } }
    };

    const Village = new CandyVillageSequence(Host);
    assert.equal(Village.Enabled, true);
    assert.equal(Village.Worms.length, 4);
    assert.equal(Village.Catapults.length, 5);
    assert.equal(Village.Cannons.length, 6);

    // ① Gummy-Bear Worm Collision on dry Crossroads -> Elastic Squishy Boing + Sticky Gummy Tire Slowdown!
    const Worm1Head = Village.Worms[1].Segments[0];
    Vehicle.Position = [Worm1Head.Pos[0] + 1.2, Worm1Head.Pos[1], Worm1Head.Pos[2] + 0.4];
    Vehicle.LinearVelocity = [-8.0, 0.0, 0.0];
    Village.Advance(1.0 / 30.0);
    assert.ok(Village.Stats.WormBoings >= 1, "Colliding with a Gummy-Bear Worm must trigger squishy elastic bounce");
    assert.ok(Village.StickyTimer > 2.0, "Gummy-Bear Worm hit must coat tires in Sticky Gummy Residue");

    // ② Driving into the 2.5D Fizzy Lagoon washes off Sticky Residue AND applies physical hydrodynamic water slowdown!
    Vehicle.Position = [-102.0, -8.0, QueryCandyTerrainHeight(-102.0, -8.0) + 0.55];
    Vehicle.LinearVelocity = [22.0, 0.0, 0.0];
    Village.Advance(1.0 / 30.0);
    assert.equal(Village.StickyTimer, 0.0, "Wading into 2.5D Fizzy Soda Water must wash off Sticky Syrup residue");
    assert.ok(Village.Stats.FizzWashes >= 1);
    assert.ok(Village.WaterDepthNow > 0.30, "Car in Lagoon Ford must measure positive 2.5D water depth");
    assert.ok(Vehicle.LinearVelocity[0] < 21.5, "2.5D Shallow-Water hydrodynamic drag must slow wading car");

    // Verify high Wafer Arch Bridge keeps car DRY above the 2.5D Lagoon!
    Vehicle.Position = [-86.0, -21.5, 3.65];
    Village.Advance(1.0 / 30.0);
    assert.equal(Village.WaterDepthNow, 0.0, "Driving across elevated Wafer Arch Bridge must stay dry above 2.5D water");

    // ③ Bouncy Gummy Pinball Bumper ricochets car elastically!
    const Bumper0 = CandyGummyBumpers[0];
    Vehicle.Position = [Bumper0.Pos[0] - 2.0, Bumper0.Pos[1], QueryCandyTerrainHeight(Bumper0.Pos[0], Bumper0.Pos[1]) + 0.6];
    Vehicle.LinearVelocity = [14.0, 0.0, 0.0];
    Village.Advance(1.0 / 30.0);
    assert.ok(Village.Stats.GummyBumperHits >= 1, "Hitting a Gummy Bumper must trigger high-restitution pinball bounce");
    assert.ok(Vehicle.LinearVelocity[0] < -4.0, "Gummy Bumper must rebound car backward/outward");

    // ④ Gummy-Bear Catapults hurl Flaming Gummy Balls (volumetric fire plumes -> bounce -> Sticky Molten Puddle) & Old-School Cannons recoil!
    Vehicle.Position = [70.0, 0.0, QueryCandyTerrainHeight(70.0, 0.0) + 0.63];
    const Launched = Village.TriggerCatapultSalvo();
    assert.ok(Launched >= 3, "Gummy-Bear Catapult salvo must launch Flaming Gummy Balls");
    assert.ok(Village.QueryPlumeEmissions().length >= 1, "Airborne Flaming Gummy Balls must emit 3D Navier-Stokes fire plumes");

    let SawCannonRecoil = false;
    for (let Step = 0; Step < 110; ++Step)
    {
        Village.Advance(1.0 / 30.0);
        if (Village.Cannons.some((C) => C.Recoil > 0.2))
            SawCannonRecoil = true;
    }
    assert.ok(Village.Stats.PuddlesCreated >= 1, "Flaming Gummy Balls must bounce and burst into Sticky Molten Puddles");
    assert.ok(Village.Stats.CannonShots >= 1, "Old-School Candy Cannons must fire skipping Jawbreakers");
    assert.equal(SawCannonRecoil, true, "Old-School Candy Cannons must physically recoil on their wheeled carriages");
    assert.ok(PlumeBursts >= 1 && DebrisBursts >= 1 && SparkBursts >= 1);

    // ⑤ Cross Grand Citadel Sweet-Gate -> Victory!
    Vehicle.Position = [CandyGoalX + 1.5, 0.0, QueryCandyTerrainHeight(CandyGoalX + 1.5, 0.0) + 0.63];
    Village.Advance(1.0 / 30.0);
    assert.equal(Village.Finished, true, "Crossing Grand Citadel Sweet-Gate must trigger Victory");
    AssignCustomTerrainHeight(null);
});
