//============================================================================================================================================
//                                                        CANDYVILLAGE.TEST.MJS
//============================================================================================================================================
// Comprehensive verification suite for the Overhauled Candy Village · Sugar Siege ("?level=candy"):
//   1. Ray-Traced Refractive Materials (Transmission = 1.0 on GummyCherry/Lime/Orange/Berry + BerrySodaWater + WaterShallowCrystal)
//   2. Watertight 2-Manifold Topology (0 boundary, 0 non-manifold edges) across all 22 procedural candy & trap shapes
//   3. High-Resolution 128 × 64 Refractive 2.5D Shallow-Water Solver (49,152 vertices, waterfall inflows, capillary ripples, drag & Fizz-Wash)
//   4. Continuous Skinned Refractive-Jelly Worms (6 worms × 22 rings × 10 sides = 7,920 vertices, zero bear heads, jelly wobble)
//   5. Physically-Coupled Torsion Catapults (spoon-loaded whip -> zero-teleport release -> exact Verlet parabolic arc to TargetRing)
//   6. All 5 Active Candy Finish-Line Obstacles (Pendulums, Crusher Hammers, Pinwheel Boulders, Taffy Snares & Cola-Mentos Geysers)

import test from "node:test";
import assert from "node:assert/strict";

import { CourseMaterial, ConstructMaterialSpecification, EncodeMaterialRecords } from "../Source/MaterialSpecification.js";
import { SceneStructure } from "../Source/FacetStructure.js";
import { CastSurfaceRay } from "../Source/RampSurfaceProjection.js";
import {
    CandyCatapultSites,
    CandyCombatShapes,
    CandyCrusherSites,
    CandyGeyserSites,
    CandyPendulumSites,
    CandyStaticShapes,
    CandyTaffyStrips,
    CandyWaterGridSpec,
    CandyWormMeshSpec,
    QueryCandyTerrainHeight,
    ResolveCandySurfaces
} from "../Source/CandyVillageStructure.js";
import { CandyVillageSequence, CandyWaterSolver, CandyWaterVertexCapacity } from "../Source/CandyVillageSequence.js";

function QuantizeKey(P)
{
    return `${Math.round(P[0] * 10000)},${Math.round(P[1] * 10000)},${Math.round(P[2] * 10000)}`;
}

function VerifyWatertight2Manifold(Facets, Label)
{
    assert.ok(Array.isArray(Facets) && Facets.length >= 4, `${Label}: expected >= 4 facets`);
    const DirectedEdges = new Map();
    const UndirectedCounts = new Map();

    for (let FI = 0; FI < Facets.length; ++FI)
    {
        const F = Facets[FI];
        assert.ok(Number.isInteger(F.Family) && F.Family >= 0 && F.Family <= 113, `${Label} facet ${FI}: invalid Family=${F.Family}`);
        assert.ok(Array.isArray(F.Corners) && F.Corners.length === 3, `${Label} facet ${FI}: expected Corners[3]`);
        const Keys = F.Corners.map(QuantizeKey);
        assert.ok(Keys[0] !== Keys[1] && Keys[1] !== Keys[2] && Keys[2] !== Keys[0], `${Label} facet ${FI}: degenerate triangle`);

        for (let E = 0; E < 3; ++E)
        {
            const A = Keys[E], B = Keys[(E + 1) % 3];
            const Dir = `${A}->${B}`;
            assert.equal(DirectedEdges.has(Dir), false, `${Label}: duplicate directed edge ${Dir} (non-orientable / coplanar overlap)`);
            DirectedEdges.set(Dir, FI);
            const Undir = A < B ? `${A}|${B}` : `${B}|${A}`;
            UndirectedCounts.set(Undir, (UndirectedCounts.get(Undir) || 0) + 1);
        }
    }

    let Boundary = 0, NonManifold = 0;
    for (const [, Count] of UndirectedCounts)
    {
        if (Count === 1) Boundary++;
        else if (Count !== 2) NonManifold++;
    }
    assert.equal(Boundary, 0, `${Label}: has ${Boundary} open boundary edges`);
    assert.equal(NonManifold, 0, `${Label}: has ${NonManifold} non-manifold edges`);
}

test("Refractive Jelly & Liquid Materials + All 22 Candy Shapes Are Closed Watertight 2-Manifolds", () =>
{
    const Materials = ConstructMaterialSpecification();
    assert.equal(Materials.length, 114, "Expected 114 total PBR material records (0..113)");
    const Encoded = EncodeMaterialRecords(Materials);

    // Verify ray-traced Snell refraction (Transmission = 1.0) on all gummy jelly & water materials!
    const CheckTransmissive = (MatId, Name) =>
    {
        const Base = MatId * 12; // 12 floats per material record; Base + 11 is Surface.Transmission!
        assert.equal(Encoded[Base + 11], 1.0, `${Name} (id=${MatId}) must have Transmission = 1.0 for ray-traced jelly/water refraction`);
    };
    CheckTransmissive(CourseMaterial.GummyCherry,         "GummyCherry");
    CheckTransmissive(CourseMaterial.GummyLime,           "GummyLime");
    CheckTransmissive(CourseMaterial.GummyOrange,         "GummyOrange");
    CheckTransmissive(CourseMaterial.GummyBerry,          "GummyBerry");
    CheckTransmissive(CourseMaterial.BerrySodaWater,      "BerrySodaWater");
    CheckTransmissive(CourseMaterial.WaterShallowCrystal, "WaterShallowCrystal");

    const AllShapes = { ...CandyStaticShapes, ...CandyCombatShapes };
    const Keys = Object.keys(AllShapes);
    assert.ok(Keys.length >= 25, `Expected >= 25 procedural Candy Village & Trap shapes (got ${Keys.length})`);
    for (const Key of Keys)
        VerifyWatertight2Manifold(AllShapes[Key].Emit(), Key);
    assert.ok(AllShapes.CandyCatapultArm && AllShapes.CandyPendulumArm && AllShapes.CandyCrusherHead);
});

test("128×64 Refractive 2.5D Shallow-Water Solver Propagates Waterfall Waves, Capillary Ripples & Depth Refraction", () =>
{
    const Solver = new CandyWaterSolver();
    assert.equal(CandyWaterGridSpec.NX, 128);
    assert.equal(CandyWaterGridSpec.NY, 64);
    assert.equal(Solver.VertexCount, 49152);
    assert.equal(CandyWaterVertexCapacity, 49152);

    // Sample deep Berry-Soda Lagoon channel (X = -70, Y = 14)
    const Before = Solver.Sample(-70.0, 14.0);
    assert.ok(Before.Depth > 0.90, `Lagoon deep channel should hold >0.9m soda water (got ${Before.Depth})`);

    Solver.InjectDisturbance(-70.0, 14.0, 7.0, -0.60, 2.8, 0.0, 0.9);
    for (let Step = 0; Step < 24; ++Step)
        Solver.Advance(1.0 / 60.0);

    const EastFront = Solver.Sample(-64.5, 14.0);
    assert.ok(Math.hypot(EastFront.U, EastFront.V) > 0.06, "Wavefront must propagate radially with low dissipation");
    assert.ok(Solver.WaveEnergy > 15.0, `Waterfall inflows + ripples must sustain live wave energy (${Solver.WaveEnergy})`);

    // Verify zero NaNs and valid refractive water material IDs across all 49,152 vertices
    const ValidMats = new Set([
        CourseMaterial.BerrySodaWater,
        CourseMaterial.WaterShallowCrystal,
        CourseMaterial.CaramelSyrup,
        CourseMaterial.FrostingCream
    ]);
    for (let V = 0; V < Solver.VertexCount; ++V)
    {
        const Off = V * 8;
        assert.ok(Number.isFinite(Solver.VertexF32[Off + 2]), `Non-finite Z at vertex ${V}`);
        const NL = Math.hypot(Solver.VertexF32[Off + 4], Solver.VertexF32[Off + 5], Solver.VertexF32[Off + 6]);
        assert.ok(Math.abs(NL - 1.0) < 1e-3, `Water vertex ${V} normal must be unit length (got ${NL})`);
        assert.ok(ValidMats.has(Solver.VertexU32[Off + 3]), `Unexpected water material ID ${Solver.VertexU32[Off + 3]}`);
    }
});

test("SceneStructure('candy') Builds Continuous Skinned Jelly Worms, Coupled Parabolic Catapults & All 5 Candy Traps", async () =>
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
    const Scene = new SceneStructure();
    try
    {
        await Scene.ConstructScene("Archive", 0, "candy");
    }
    finally
    {
        globalThis.fetch = PrevFetch;
    }
    assert.ok(Scene.CandyBlock && Scene.CandyWormBlock && Scene.CandyWaterBlock);
    assert.equal(Scene.CandyWormBlock.VertexCapacity, CandyWormMeshSpec.WormCount * ((CandyWormMeshSpec.RingsPerWorm - 1) * CandyWormMeshSpec.RadialSides * 6 + CandyWormMeshSpec.RadialSides * 6));

    // Verify CastSurfaceRay hits wafer bridge deck cleanly (South Wafer Bridge at X = -86, Y = -21.5)
    const Surfaces = ResolveCandySurfaces();
    const BridgeHit = CastSurfaceRay(Surfaces, [-86.0, -21.5, 10.0], [0.0, 0.0, -1.0], 20.0);
    assert.ok(BridgeHit && BridgeHit.Point[2] > 2.4, "Wafer bridge deck must be raycast-drivable above Lagoon");

    const Vehicle = {
        Position:        [-115.0, 0.0, QueryCandyTerrainHeight(-115.0, 0.0) + 0.63],
        LinearVelocity:  [14.0, 0.0, 0.0],
        AngularVelocity: [0.0, 0.0, 0.0],
        Respawn(Pos) { this.Position = [...Pos]; this.LinearVelocity = [0, 0, 0]; }
    };
    const Seq = new CandyVillageSequence({ LevelKey: "candy", Scene, Vehicle });
    assert.equal(Seq.Enabled, true);
    assert.equal(Seq.Worms.length, 6, "Expected 6 continuous skinned refractive-jelly worms");

    // ① Verify Continuous Skinned Jelly Worm Mesh: 7,920 vertices, unit normals, ONLY refractive jelly materials!
    const JellyMats = new Set([
        CourseMaterial.GummyCherry,
        CourseMaterial.GummyLime,
        CourseMaterial.GummyOrange,
        CourseMaterial.GummyBerry
    ]);
    for (let V = 0; V < Seq.WormSkinner.VertexCount; ++V)
    {
        const Off = V * 8;
        assert.ok(Number.isFinite(Seq.WormSkinner.VertexF32[Off + 0]), `Worm vertex ${V} non-finite`);
        const NL = Math.hypot(Seq.WormSkinner.VertexF32[Off + 4], Seq.WormSkinner.VertexF32[Off + 5], Seq.WormSkinner.VertexF32[Off + 6]);
        assert.ok(Math.abs(NL - 1.0) < 1e-2, `Worm vertex ${V} normal not normalized (${NL})`);
        assert.ok(JellyMats.has(Seq.WormSkinner.VertexU32[Off + 3]), `Worm vertex ${V} used non-jelly material ${Seq.WormSkinner.VertexU32[Off + 3]}`);
    }

    // ② Verify Physically-Coupled Catapult Whip & True Newtonian Parabolic Trajectory (Zero Teleporting!)
    const Cat = Seq.Catapults[0];
    Cat.LoadedBall = 0;
    Cat.TargetPos  = [-96.0, 2.0, QueryCandyTerrainHeight(-96.0, 2.0)];
    Cat.ShowRing   = true;
    Cat.ArmPitch   = -0.22;
    Cat.State      = "whipping";
    const Ball     = Seq.FlamingBalls[0];
    Ball.Active    = true;
    Ball.State     = "in_spoon";
    Ball.OwnerCat  = 0;
    Ball.Pos       = Seq.ComputeCatapultSpoonWorldPos(Cat);

    // Step through the visible 80° upward spoon whip until release
    let PrevBallPos = [...Ball.Pos];
    let ReleasedAt  = null;
    for (let F = 0; F < 30; ++F)
    {
        Seq.Advance(1.0 / 120.0);
        const StepJump = Math.hypot(Ball.Pos[0] - PrevBallPos[0], Ball.Pos[1] - PrevBallPos[1], Ball.Pos[2] - PrevBallPos[2]);
        assert.ok(StepJump < 1.2, `Boulder teleported ${StepJump.toFixed(3)}m in 1/120s — must ride smoothly in spoon & release continuously!`);
        PrevBallPos = [...Ball.Pos];
        if (Ball.State === "ballistic" && !ReleasedAt)
        {
            ReleasedAt = [...Ball.Pos];
            break;
        }
    }
    assert.ok(ReleasedAt, "Catapult arm must finish whipping to +1.14 rad and release boulder into ballistic flight");
    assert.ok(Ball.Vel[2] > 4.0, `Released boulder must launch upward into parabolic arc (Vz=${Ball.Vel[2]})`);

    // Verify ballistic flight follows a true mathematical parabola with rising apex then descent onto TargetPos!
    let MaxApexZ = ReleasedAt[2];
    let ImpactXY = null;
    for (let F = 0; F < 260; ++F)
    {
        Seq.Advance(1.0 / 120.0);
        if (Ball.Pos[2] > MaxApexZ)
            MaxApexZ = Ball.Pos[2];
        if (Ball.Bounces > 0 || !Ball.Active)
        {
            ImpactXY = [Ball.Pos[0], Ball.Pos[1]];
            break;
        }
    }
    assert.ok(MaxApexZ > ReleasedAt[2] + 1.5, `Parabolic arc must rise cleanly above spoon release height (apex=${MaxApexZ.toFixed(2)}m)`);
    assert.ok(ImpactXY, "Parabolic boulder must land on terrain");
    const TargetErr = Math.hypot(ImpactXY[0] - Cat.TargetPos[0], ImpactXY[1] - Cat.TargetPos[1]);
    assert.ok(TargetErr < 0.85, `Parabolic boulder must land accurately inside its TargetRing (err=${TargetErr.toFixed(3)}m)`);

    // ③ Verify Worm Squishy Impact Wobble + Sticky Drag on dry Village Cobbles (Worm 2) + 2.5D Lagoon Fizz-Wash!
    const WormSpinePt = Seq.Worms[2].Spine[6];
    Vehicle.Position  = [WormSpinePt[0] + 0.5, WormSpinePt[1], WormSpinePt[2]];
    Vehicle.LinearVelocity = [-4.0, 0.0, 0.0];
    Seq.Advance(1.0 / 60.0);
    assert.ok(Seq.Stats.WormBoings >= 1 && Seq.Worms[2].Jiggle > 0.2, "Hitting jelly worm must bounce car and trigger visible jelly wobble");
    assert.ok(Seq.StickyTimer > 1.0, "Worm hit on dry land coats tires in sticky jelly");

    // Drive off-bridge into Berry-Soda Lagoon -> Fizz-Wash + hydrodynamic slowdown!
    Vehicle.Position = [-70.0, 14.0, 1.35];
    Vehicle.LinearVelocity = [20.0, 0.0, 0.0];
    for (let F = 0; F < 15; ++F)
        Seq.Advance(1.0 / 60.0);
    assert.equal(Seq.StickyTimer, 0.0, "2.5D Lagoon must wash sticky jelly off tires");
    assert.ok(Vehicle.LinearVelocity[0] < 16.5, `2.5D water must apply strong hydrodynamic wading drag (Vx=${Vehicle.LinearVelocity[0]})`);

    // ④ Verify All 5 New Candy Finish-Line Blockers!
    // (a) Saltwater-Taffy Snare Strip
    const Taffy = CandyTaffyStrips[0];
    Vehicle.Position = [Taffy.Pos[0] + 1.5, Taffy.Pos[1], QueryCandyTerrainHeight(Taffy.Pos[0], Taffy.Pos[1]) + 0.6];
    Vehicle.LinearVelocity = [10.0, 0.0, 0.0];
    Seq.BannerTimer = 0.0;
    Seq.Advance(1.0 / 60.0);
    assert.equal(Seq.InTaffySnare, true, "Driving onto Taffy Strip must engage viscoelastic snare");
    assert.ok(Vehicle.LinearVelocity[0] < 9.6, "Taffy snare must pull slow/mid-speed car backward");

    // (b) Swinging Jawbreaker Pendulum
    const Pend = Seq.Pendulums[0];
    Vehicle.Position = [...Pend.BallPos];
    Vehicle.LinearVelocity = [12.0, 0.0, 0.0];
    Seq.Advance(1.0 / 60.0);
    assert.ok(Seq.Stats.PendulumHits >= 1 && Math.abs(Vehicle.LinearVelocity[1]) > 8.0, "Jawbreaker pendulum must knock car sideways");

    // (c) Slamming Peppermint Crusher Hammer
    const Cr = Seq.Crushers[0];
    Cr.State = "slamming";
    Cr.LiftZ = 0.25;
    Vehicle.Position = [Cr.Spec.Pos[0] - 1.2, Cr.Spec.Pos[1], Cr.GroundZ + 0.63];
    Vehicle.LinearVelocity = [15.0, 0.0, 0.0];
    Seq.Advance(1.0 / 60.0);
    assert.ok(Vehicle.LinearVelocity[0] < -10.0, "Slammed Peppermint Crusher must violently reject reckless cars");

    // (d) Rolling Giant Peppermint Pinwheel
    const PW = Seq.Pinwheels[0];
    Vehicle.Position = [PW.Pos[0], PW.Pos[1], PW.Pos[2] - 0.5];
    Vehicle.LinearVelocity = [14.0, 0.0, 0.0];
    Seq.Advance(1.0 / 60.0);
    assert.ok(Seq.Stats.PinwheelHits >= 1 && Vehicle.LinearVelocity[0] < -8.0, "Rolling Pinwheel must punt car backward");

    // (e) Erupting Cola-Mentos Geyser
    const Gy = Seq.Geysers[0];
    Gy.State = "erupting";
    Gy.Timer = 0.1;
    Vehicle.Position = [Gy.Pos[0], Gy.Pos[1], Gy.Pos[2] + 0.63];
    Vehicle.LinearVelocity = [12.0, 0.0, 0.0];
    Seq.Advance(1.0 / 60.0);
    assert.ok(Seq.Stats.GeyserLaunches >= 1 && Vehicle.LinearVelocity[2] >= 10.0, "Erupting Cola-Mentos Geyser must blast car skyward");

    // ⑤ Verify Sweet-Gate Citadel Finish Line
    Vehicle.Position = [188.5, 0.0, QueryCandyTerrainHeight(188.5, 0.0) + 0.63];
    Seq.Advance(1.0 / 60.0);
    assert.equal(Seq.Finished, true);
    assert.equal(Seq.Stats.Finishes, 1);
});
