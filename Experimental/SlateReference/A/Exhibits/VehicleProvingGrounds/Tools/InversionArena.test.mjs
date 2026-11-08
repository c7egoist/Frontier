//============================================================================================================================================
//                                                        INVERSIONARENA.TEST.MJS
//============================================================================================================================================
// 🧩 Verification of the Grand Prix Stunt Race Circuit: watertight 2-manifold solids across all 8 ramp architectures, 3D ray/hull queries,
//    480 Hz hands-free 360° loop -> camelback waves -> tabletop jump, 180° velodrome bowl, heartline S-bridge, 360° pipe corkscrew & camera.

import test from "node:test";
import assert from "node:assert/strict";

import { ConstructBasisQuaternion, CastSurfaceRay, QuerySurfaceHullContact } from "../Source/RampSurfaceProjection.js";
import { InversionArenaSurfaces, InversionArenaShapes, InversionArenaZones,
         InversionArenaTracks, InversionPhysicsCutouts } from "../Source/InversionArenaStructure.js";
import { LevelCatalog, ResolveLevelDescriptor } from "../Source/LevelStructure.js";
import { AssignCourseReliefEnabled, AssignExcavationCutouts, ResolveCourseHeight } from "../Source/CourseStructure.js";
import { BollardSequence } from "../Source/BollardSequence.js";
import { SceneStructure } from "../Source/FacetStructure.js";
import { VehicleSolver } from "../Source/VehicleSolver.js";
import { ChaseCameraSolver } from "../Source/ChaseCameraSolver.js";
import { SweepSpark } from "../Source/SparkCollision.js";
import { RotateVector, CrossVector, DotVector, SubtractVector } from "../Source/TransformProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                                            MANIFOLD & BASIS VERIFICATION
//------------------------------------------------------------------------------------------------------------------------

test("ConstructBasisQuaternion matches orthonormal axes across arbitrary 3D orientations", () =>
{
    for (const Angles of [[0.4, 0.7, -0.9], [1.9, -1.1, 2.4], [Math.PI, 0.0, 0.5]])
    {
        const [Roll, Pitch, Yaw] = Angles;
        const Cr = Math.cos(Roll), Sr = Math.sin(Roll);
        const Cp = Math.cos(Pitch), Sp = Math.sin(Pitch);
        const Cy = Math.cos(Yaw), Sy = Math.sin(Yaw);
        const AxisX = [Cy * Cp, Sy * Cp, -Sp];
        const AxisY = [Cy * Sp * Sr - Sy * Cr, Sy * Sp * Sr + Cy * Cr, Cp * Sr];
        const AxisZ = CrossVector(AxisX, AxisY);
        const Quaternion = ConstructBasisQuaternion(AxisX, AxisY, AxisZ);
        const Rx = RotateVector(Quaternion, [1.0, 0.0, 0.0]);
        const Ry = RotateVector(Quaternion, [0.0, 1.0, 0.0]);
        const Rz = RotateVector(Quaternion, [0.0, 0.0, 1.0]);
        for (let Axis = 0; Axis < 3; ++Axis)
        {
            assert.ok(Math.abs(Rx[Axis] - AxisX[Axis]) < 1.0e-5);
            assert.ok(Math.abs(Ry[Axis] - AxisY[Axis]) < 1.0e-5);
            assert.ok(Math.abs(Rz[Axis] - AxisZ[Axis]) < 1.0e-5);
        }
    }
});

test("Every InversionArena circuit & stunt solid is a closed 2-manifold with positive outward signed volume", () =>
{
    const Quantize = (Point) => Point.map((Coord) => Math.round(Coord * 1.0e4)).join(",");

    for (const [ShapeName, Definition] of Object.entries(InversionArenaShapes))
    {
        const Facets = Definition.Emit();
        assert.ok(Facets.length >= 6, `${ShapeName} must emit at least 6 facets`);

        const DirectedEdges = new Set();
        let SignedSixVolume = 0.0;

        for (const Facet of Facets)
        {
            const Corners = Facet.Corners;
            for (let Index = 0; Index < Corners.length; ++Index)
            {
                const KeyA = Quantize(Corners[Index]);
                const KeyB = Quantize(Corners[(Index + 1) % Corners.length]);
                if (KeyA === KeyB)
                    continue;
                const EdgeTag = `${KeyA}->${KeyB}`;
                assert.ok(!DirectedEdges.has(EdgeTag), `${ShapeName} has duplicate directed edge ${EdgeTag}`);
                DirectedEdges.add(EdgeTag);
            }
            for (let Tri = 1; Tri + 1 < Corners.length; ++Tri)
            {
                const A = Corners[0], B = Corners[Tri], C = Corners[Tri + 1];
                const NormalOut = CrossVector(SubtractVector(B, A), SubtractVector(C, A));
                SignedSixVolume += DotVector(A, NormalOut);
            }
        }
        for (const EdgeTag of DirectedEdges)
        {
            const [From, To] = EdgeTag.split("->");
            assert.ok(DirectedEdges.has(`${To}->${From}`), `${ShapeName} has open boundary edge ${EdgeTag}`);
        }
        assert.ok(SignedSixVolume > 1.0e-2, `${ShapeName} must have positive outward signed volume, got ${SignedSixVolume}`);
    }
});

//------------------------------------------------------------------------------------------------------------------------
//                                           3D RAY & HULL SURFACE QUERIES
//------------------------------------------------------------------------------------------------------------------------

test("CastSurfaceRay resolves all unique circuit ramp architectures (Loop, Pipe, Waves, Tabletop, Bowl, Heartline, Twin-Wing)", () =>
{
    // ① Crown of the 18 m Helical Loop (X = −20, Y = −34, Z = 17.6): strut points UP (+Z) into inverted ceiling (−Z normal)
    const LoopCrownHit = CastSurfaceRay(InversionArenaSurfaces, [-20.0, -34.0, 16.5], [0.0, 0.0, 1.0], 2.5);
    assert.ok(LoopCrownHit, "Upward strut ray must hit inverted loop crown");
    assert.ok(LoopCrownHit.Normal[2] < -0.98);
    assert.ok(Math.abs(LoopCrownHit.Point[2] - 17.6) < 0.06);

    // ② Triple Camelback Wave crest & Skyline Tabletop elevated deck
    const WaveCrestHit = CastSurfaceRay(InversionArenaSurfaces, [42.0, -29.7, 2.0], [0.0, 0.0, -1.0], 2.5);
    assert.ok(WaveCrestHit && WaveCrestHit.Point[2] > 0.85, "Downward ray must hit Camelback Wave crest");
    const TabletopHit = CastSurfaceRay(InversionArenaSurfaces, [114.0, -29.7, 4.2], [0.0, 0.0, -1.0], 2.0);
    assert.ok(TabletopHit && Math.abs(TabletopHit.Point[2] - 3.30) < 0.05, "Downward ray must hit Skyline Tabletop sky-deck");

    // ③ East Turn 1 Superelevated Velodrome Bowl apex (X = 200, Y = 0, R = 36 m -> banked inward toward −X/+Z)
    const BowlApexHit = CastSurfaceRay(InversionArenaSurfaces, [198.0, 0.0, 8.0], [0.6, 0.0, -0.8], 8.0);
    assert.ok(BowlApexHit && BowlApexHit.Normal[0] < -0.45, "Strut ray must resolve inward banking on Velodrome Bowl");

    // ④ Heartline S-Twist Sky-Bridge elevated banked deck
    const HeartlineHit = CastSurfaceRay(InversionArenaSurfaces, [130.0, 35.0, 5.0], [0.0, 0.0, -1.0], 3.0);
    assert.ok(HeartlineHit && Math.abs(HeartlineHit.Normal[1]) > 0.45, "Strut ray must resolve Heartline S-Bridge banking");

    // ⑤ Ceiling of the 13.2 m Full-Pipe Tunnel (X = 26, Y = 35, Z = 13.2): normal is (0, 0, −1)
    const PipeCrownHit = CastSurfaceRay(InversionArenaSurfaces, [26.0, 35.0, 12.0], [0.0, 0.0, 1.0], 2.0);
    assert.ok(PipeCrownHit && PipeCrownHit.Normal[2] < -0.99);

    // ⑥ Hull contact pushes downward out of the inverted loop crown slab
    const HullHit = QuerySurfaceHullContact(InversionArenaSurfaces, [-20.0, -34.0, 17.62], 0.08);
    assert.ok(HullHit && HullHit.Depth > 0.0 && HullHit.Normal[2] < -0.95);
});

//------------------------------------------------------------------------------------------------------------------------
//                                       480 HZ CIRCUIT STUNT & INVERSION RUNS
//------------------------------------------------------------------------------------------------------------------------

test("ControlVehicle launches off Start Grid hands-free through 360° Loop, Camelback Waves, and Tabletop Mega-Jump", () =>
{
    AssignCourseReliefEnabled(false);
    try
    {
        const Car = new VehicleSolver([]);
        Car.Surfaces = InversionArenaSurfaces;
        Car.AeroGripScale = 1.0;
        const GridZone = InversionArenaZones[0];
        Car.Respawn([GridZone.Position[0], GridZone.Position[1], 0.63], 0.0);

        let MinimumUpZ = 1.0;
        let InvertedWithWheelContact = false;
        let ClearedWaves = false;
        for (let Step = 0; Step < 860; ++Step)
        {
            Car.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            const Upward = RotateVector(Car.Orientation, [0.0, 0.0, 1.0]);
            MinimumUpZ = Math.min(MinimumUpZ, Upward[2]);
            if (Upward[2] < -0.85 && Car.Wheels.some((Wheel) => Wheel.Contact))
                InvertedWithWheelContact = true;
            if (Car.Position[0] > 76.0)
                ClearedWaves = true;
        }
        const FinalUpward = RotateVector(Car.Orientation, [0.0, 0.0, 1.0]);
        assert.ok(MinimumUpZ < -0.90, `Vehicle must invert upside-down at loop crown, got UpZ=${MinimumUpZ}`);
        assert.ok(InvertedWithWheelContact, "Vehicle must maintain tyre contact while upside down");
        assert.ok(ClearedWaves, `Vehicle must flow straight from Loop across Triple Camelback Waves, got X=${Car.Position[0]}`);
        assert.ok(FinalUpward[2] > 0.85, `Vehicle must stay upright along outbound straight, got UpZ=${FinalUpward[2]}`);
    }
    finally
    {
        AssignCourseReliefEnabled(true);
    }
});

test("ControlVehicle carves the Heartline S-Bridge (+35°/−35°), Velodrome Bowl, and 360° Full-Pipe Corkscrew", () =>
{
    AssignCourseReliefEnabled(false);
    try
    {
        // ① Heartline S-Twist Sky-Bridge (+Roll -> 0 -> −Roll)
        const HeartCar = new VehicleSolver([]);
        HeartCar.Surfaces = InversionArenaSurfaces;
        HeartCar.AeroGripScale = 1.0;
        const HeartZone = InversionArenaZones[3];
        HeartCar.Respawn([HeartZone.Position[0], HeartZone.Position[1], 0.63], Math.PI);
        let MinSignedRoll = 0.0, MaxSignedRoll = 0.0;
        for (let Step = 0; Step < 560; ++Step)
        {
            const Up = RotateVector(HeartCar.Orientation, [0.0, 0.0, 1.0]);
            const Fwd = RotateVector(HeartCar.Orientation, [1.0, 0.0, 0.0]);
            const YErr = HeartCar.Position[1] - 35.0;
            const YawErr = Math.atan2(-Fwd[1], -Fwd[0]);
            const Steer = Math.max(-1.0, Math.min(1.0, -(YErr * 0.08 + YawErr * 1.8) + Up[1] * 0.22));
            HeartCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer, Handbrake: false }, 1.0 / 60.0);
            const RollDeg = Math.asin(Math.max(-1.0, Math.min(1.0, Up[1]))) * (180.0 / Math.PI);
            MinSignedRoll = Math.min(MinSignedRoll, RollDeg);
            MaxSignedRoll = Math.max(MaxSignedRoll, RollDeg);
            if (HeartCar.Position[0] < 62.0)
                break;
        }
        assert.ok(MaxSignedRoll > 28.0 && MinSignedRoll < -28.0,
                  `Expected bilateral +/− banking across Heartline S-Bridge, got [${MinSignedRoll.toFixed(1)}°, +${MaxSignedRoll.toFixed(1)}°]`);

        // ② 360° Full-Pipe Ceiling Corkscrew (Westbound)
        const PipeCar = new VehicleSolver([]);
        PipeCar.Surfaces = InversionArenaSurfaces;
        PipeCar.AeroGripScale = 1.0;
        const PipeZone = InversionArenaZones[4];
        PipeCar.Respawn([PipeZone.Position[0], PipeZone.Position[1], 0.63], (PipeZone.Yaw * Math.PI) / 180.0);
        let PipeMinUpZ = 1.0;
        for (let Step = 0; Step < 560; ++Step)
        {
            PipeCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            PipeMinUpZ = Math.min(PipeMinUpZ, RotateVector(PipeCar.Orientation, [0.0, 0.0, 1.0])[2]);
        }
        assert.ok(PipeMinUpZ < -0.92, `Expected Full-Pipe ceiling inversion (UpZ < -0.92), got ${PipeMinUpZ}`);
        assert.ok(PipeCar.Position[0] < -2.0, `Expected Full-Pipe West exit past X=-2, got X=${PipeCar.Position[0]}`);
    }
    finally
    {
        AssignCourseReliefEnabled(true);
    }
});

//------------------------------------------------------------------------------------------------------------------------
//                                        3D CHASE CAMERA, SPARKS & DESCRIPTORS
//------------------------------------------------------------------------------------------------------------------------

test("ChaseCameraSolver tracks 90° vertical and 180° inverted orientations without gimbal flip or roof clipping", () =>
{
    const Chase = new ChaseCameraSolver();
    Chase.SnapTo([-20.0, -38.3, 0.6], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0], true);
    for (let Step = 1; Step <= 60; ++Step)
    {
        const θ = (Math.PI * Step) / 60;
        const Position = [-20.0 + 8.8 * Math.sin(θ), -38.3 + 4.3 * (θ / Math.PI), 8.8 * (1.0 - Math.cos(θ)) + 0.5];
        const Forward = [Math.cos(θ), 0.0, Math.sin(θ)];
        const Upward = [-Math.sin(θ), 0.0, Math.cos(θ)];
        Chase.AdvanceChase(Position, Forward, 22.0, 1.0 / 60.0, Upward, true);
        assert.ok(Chase.Eye.every(Number.isFinite));
        assert.ok(Chase.Up.every(Number.isFinite));
    }
    assert.ok(Chase.Eye[2] < 17.6, `Camera eye must remain inside loop below crown (Z < 17.6), got ${Chase.Eye[2]}`);
    assert.ok(Chase.Up[2] < -0.7, `Camera Up must invert smoothly with loop crown, got ${Chase.Up[2]}`);
});

test("LevelCatalog exposes multi-track Inversion Arena (Tracks A, B, C) and Proving Grounds descriptors cleanly", () =>
{
    assert.equal(LevelCatalog.length, 2);
    const Inversion = ResolveLevelDescriptor("inversion");
    const Proving = ResolveLevelDescriptor("proving");
    assert.equal(Inversion.Title, "Inversion Arena");
    assert.equal(Inversion.Relief, false);
    assert.equal(Inversion.Tracks.length, 3);
    assert.deepEqual(Inversion.Tracks.map((T) => T.Id), ["trackA", "trackB", "trackC"]);
    assert.equal(Inversion.Surfaces.length, 25);
    assert.equal(Inversion.Zones.length, 14);
    assert.ok(Inversion.PhysicsCutouts.length >= 2);
    assert.ok(Inversion.DistanceCutouts.length >= 2);
    assert.equal(Inversion.Bollards().length, 2);
    assert.equal(Proving.Title, "Proving Grounds");
    assert.equal(Proving.Relief, true);
    assert.equal(Proving.Surfaces.length, 0);
});

test("Track B Split Over/Under: car drives -5.2 m underground through Subway Tunnel, +5.0 m over Sky-Bridge, and across Z=0 Underpass Road", () =>
{
    AssignCourseReliefEnabled(false);
    AssignExcavationCutouts(InversionPhysicsCutouts);
    try
    {
        // ① Lower Split Fork:Subterranean Subway Tunnel (-5.2 m beneath ground + concrete roof overhead)
        const TunnelCar = new VehicleSolver([]);
        TunnelCar.Surfaces = InversionArenaSurfaces;
        TunnelCar.AeroGripScale = 1.0;
        TunnelCar.Respawn([-44.0, 84.0, 0.63], 0.0);
        const Chase = new ChaseCameraSolver();
        Chase.Surfaces = InversionArenaSurfaces;
        Chase.SnapTo(TunnelCar.Position, [1.0, 0.0, 0.0], [0.0, 0.0, 1.0], true);

        let MinTunnelZ = 10.0;
        let MinCameraZ = 10.0;
        for (let Step = 0; Step < 420; ++Step)
        {
            TunnelCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            const Fwd = RotateVector(TunnelCar.Orientation, [1.0, 0.0, 0.0]);
            const Up  = RotateVector(TunnelCar.Orientation, [0.0, 0.0, 1.0]);
            const Speed = Math.hypot(TunnelCar.LinearVelocity[0], TunnelCar.LinearVelocity[1], TunnelCar.LinearVelocity[2]);
            Chase.AdvanceChase(TunnelCar.Position, Fwd, Speed, 1.0 / 60.0, Up, true);
            MinTunnelZ = Math.min(MinTunnelZ, TunnelCar.Position[2]);
            if (TunnelCar.Position[0] > -2.0 && TunnelCar.Position[0] < 28.0)
            {
                MinCameraZ = Math.min(MinCameraZ, Chase.Eye[2]);
                assert.ok(Chase.Eye[2] < -0.80, `Subway chase camera must stay below -0.78 m tunnel ceiling, got Z=${Chase.Eye[2]}`);
            }
            if (TunnelCar.Position[0] > 62.0)
                break;
        }
        assert.ok(MinTunnelZ < -4.3, `Expected car to descend below Z=-4.3 m inside Subway Tunnel, got ${MinTunnelZ}`);
        assert.ok(MinCameraZ < -2.0, `Expected chase camera to follow car underground (Z < -2.0 m), got ${MinCameraZ}`);
        assert.ok(TunnelCar.Position[0] > 60.0 && TunnelCar.Position[2] > 0.3,
                  `Expected car to climb cleanly back to ground daylight past X=60, got X=${TunnelCar.Position[0]}, Z=${TunnelCar.Position[2]}`);

        // ② Upper Split Fork: +5.0 m Sky-Bridge Overpass
        const SkyCar = new VehicleSolver([]);
        SkyCar.Surfaces = InversionArenaSurfaces;
        SkyCar.AeroGripScale = 1.0;
        SkyCar.Respawn([-50.0, 104.0, 0.63], 0.0);
        let MaxBridgeZ = 0.0;
        for (let Step = 0; Step < 360; ++Step)
        {
            SkyCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            MaxBridgeZ = Math.max(MaxBridgeZ, SkyCar.Position[2]);
        }
        assert.ok(MaxBridgeZ > 5.3, `Expected car to crest +5.0 m Sky-Bridge (Z > 5.3 m), got ${MaxBridgeZ}`);

        // ③ Intersecting North Boulevard at X = +12: drives at Z ≈ 0 OVER the -5.2 m Subway Tunnel & UNDER the +5.0 m Sky-Bridge!
        assert.equal(ResolveCourseHeight(12.0, 84.0, 0.5), 0.0, "Ground roadway over Subway Tunnel roof must remain intact for Z >= -0.45 m");
        assert.ok(ResolveCourseHeight(12.0, 84.0, -4.5) < -40.0, "Subterranean cavity below Z = -0.45 m must suppress Z=0 ground plane");
        const UnderpassCar = new VehicleSolver([]);
        UnderpassCar.Surfaces = InversionArenaSurfaces;
        UnderpassCar.Respawn([12.0, 62.0, 0.63], 0.5 * Math.PI);
        for (let Step = 0; Step < 330; ++Step)
            UnderpassCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
        assert.ok(UnderpassCar.Position[1] > 118.0 && Math.abs(UnderpassCar.Position[2] - 0.63) < 0.35,
                  `Expected Underpass Boulevard car to pass cleanly over Subway & under Sky-Bridge to Y>118, got Y=${UnderpassCar.Position[1]}, Z=${UnderpassCar.Position[2]}`);
    }
    finally
    {
        AssignExcavationCutouts([]);
        AssignCourseReliefEnabled(true);
    }
});

test("Track C Over/Under Canyon Crossover & Serpentine Waves: -5.2 m underpass clears +5.0 m viaduct by >9.5 m", () =>
{
    AssignCourseReliefEnabled(false);
    AssignExcavationCutouts(InversionPhysicsCutouts);
    try
    {
        // Vertical ray at the (X = 78, Y = -94) crossover hits BOTH +5.0 m Viaduct Bridge AND -5.2 m Canyon Underpass floor
        const BridgeHit = CastSurfaceRay(InversionArenaSurfaces, [78.0, -94.0, 8.0], [0.0, 0.0, -1.0], 6.0);
        const CanyonHit = CastSurfaceRay(InversionArenaSurfaces, [78.0, -94.0, 2.0], [0.0, 0.0, -1.0], 10.0);
        assert.ok(BridgeHit && Math.abs(BridgeHit.Point[2] - 5.0) < 0.05, `Expected +5.0 m Viaduct deck at crossover, got ${BridgeHit?.Point[2]}`);
        assert.ok(CanyonHit && Math.abs(CanyonHit.Point[2] - (-5.2)) < 0.05, `Expected -5.2 m Canyon floor at crossover, got ${CanyonHit?.Point[2]}`);
        assert.ok(BridgeHit.Point[2] - CanyonHit.Point[2] > 10.0, "Over/Under vertical separation must exceed 10.0 m");

        // Serpentine Wave alternating-camber ray hits left & right banked crests
        const SerpA = CastSurfaceRay(InversionArenaSurfaces, [-29.0, -166.0, 5.0], [0.0, 0.0, -1.0], 10.0);
        const SerpB = CastSurfaceRay(InversionArenaSurfaces, [-41.0, -166.0, 5.0], [0.0, 0.0, -1.0], 10.0);
        assert.ok(SerpA && SerpB && SerpA.Normal[1] * SerpB.Normal[1] < -0.04,
                  `Expected opposite lateral banking normals on Serpentine Wave, got ${SerpA?.Normal[1]} vs ${SerpB?.Normal[1]}`);
    }
    finally
    {
        AssignExcavationCutouts([]);
        AssignCourseReliefEnabled(true);
    }
});

test("Proximity-triggered BollardSequence opens Linear Strip sequentially and drives counter-phased Travelling Wave Strip", async () =>
{
    const fs = await import("node:fs/promises");
    const PreviousFetch = globalThis.fetch;
    globalThis.fetch = async (Url) =>
    {
        const Buffer = await fs.readFile(new URL(`../${Url}`, import.meta.url));
        return { ok: true, arrayBuffer: async () => Buffer.buffer.slice(Buffer.byteOffset, Buffer.byteOffset + Buffer.byteLength) };
    };
    try
    {
        const Scene = new SceneStructure();
        await Scene.ConstructScene("Archive", 0, "inversion");
        const Vehicle = {
            Position:       [0.0, 0.0, 0.63],
            LinearVelocity: [0.0, 0.0, 0.0],
            Obstacles:      Scene.QueryObstacleBounds(),
            AssignObstacles(List) { this.Obstacles = List; }
        };
        const HostStub = {
            Scene,
            Vehicle,
            Bodies:   null,
            Shell:    null,
            Renderer: { OccupantBuffer: null },
            Device:   { queue: { writeBuffer() {} } }
        };
        const Bollards = new BollardSequence(HostStub);
        assert.equal(Bollards.Zones.length, 2);

        const LinearZone = Bollards.Zones.find((Z) => Z.Id === "linearStrip");
        const WaveZone   = Bollards.Zones.find((Z) => Z.Id === "waveStrip");
        for (let Step = 0; Step < 20; ++Step)
            Bollards.Advance(1.0 / 60.0);
        assert.equal(LinearZone.Triggered, false);
        assert.equal(WaveZone.Triggered, false);
        const StandbyObstacleCount = Vehicle.Obstacles.length;
        assert.ok(StandbyObstacleCount >= 60, "Standby bollards must register blocking obstacles");

        // ① Drive into Proximity Trigger #1 (Track B Linear Bollard Strip)
        Vehicle.Position = [48.0, 166.0, 0.63];
        Vehicle.LinearVelocity = [-22.0, 0.0, 0.0];
        for (let Step = 0; Step < 8; ++Step)
            Bollards.Advance(1.0 / 60.0);
        assert.equal(LinearZone.Triggered, true, "Linear bollard strip must trigger on proximity");

        // Mid-transition: front row (u = 0) drops deeper than back row (u = 1)
        const FrontZMid = Scene.Occupants[LinearZone.Posts[0].OccupantIndex].Transform[14];
        const BackZMid  = Scene.Occupants[LinearZone.Posts[LinearZone.Posts.length - 1].OccupantIndex].Transform[14];
        assert.ok(FrontZMid < BackZMid - 0.15, `Linear strip must retract front-to-back (${FrontZMid} < ${BackZMid})`);

        // Fully open: every post in Linear Strip retracts flush below ground and releases its collider
        for (let Step = 0; Step < 60; ++Step)
            Bollards.Advance(1.0 / 60.0);
        for (const Post of LinearZone.Posts)
        {
            assert.ok(Scene.Occupants[Post.OccupantIndex].Transform[14] <= -Post.Height + 0.05, "Linear bollard must retract flush into socket");
            assert.equal(Post.Solid, false, "Retracted linear bollard must release its obstacle collider");
        }
        assert.equal(Vehicle.Obstacles.length, StandbyObstacleCount - LinearZone.Posts.length,
                     "Opening Linear Strip must remove all 28 retracted bollards from active Vehicle.Obstacles");

        // ② Drive into Proximity Trigger #2 (Track C 84 m Counter-Phased Travelling Wave Bollard Strip)
        Vehicle.Position = [-84.0, -94.0, 0.63];
        Vehicle.LinearVelocity = [20.0, 0.0, 0.0];
        for (let Step = 0; Step < 45; ++Step)
            Bollards.Advance(1.0 / 60.0);
        assert.equal(WaveZone.Triggered, true, "Wave bollard strip must trigger on proximity");

        // Verify counter-phased wave: Left vs Right at same station AND Entry (u=0) vs Far End (u=1) move in opposite vertical directions!
        const EntryLeftZ  = Scene.Occupants[WaveZone.Posts[0].OccupantIndex].Transform[14];
        const EntryRightZ = Scene.Occupants[WaveZone.Posts[1].OccupantIndex].Transform[14];
        const ExitLeftZ   = Scene.Occupants[WaveZone.Posts[WaveZone.Posts.length - 2].OccupantIndex].Transform[14];
        assert.ok(Math.abs(EntryLeftZ - EntryRightZ) > 0.35,
                  `Wave strip Left vs Right ranks must be counter-phased (one up while opposite down): ${EntryLeftZ} vs ${EntryRightZ}`);
        assert.ok(Math.abs(EntryLeftZ - ExitLeftZ) > 0.35,
                  `Wave strip Entry end vs Exit end must be counter-phased (one end up while other end down): ${EntryLeftZ} vs ${ExitLeftZ}`);
    }
    finally
    {
        globalThis.fetch = PreviousFetch;
    }
});

test("SweepSpark detects 3D stunt-ramp ceiling and banked ribbon shells", () =>
{
    AssignCourseReliefEnabled(false);
    const Hit = SweepSpark([26.0, 35.0, 12.4], [26.0, 35.0, 13.8], [], [], InversionArenaSurfaces);
    assert.ok(Hit, "Spark thrown toward Full-Pipe ceiling must hit the 3D shell");
    assert.ok(Hit.Normal[2] < -0.95, `Expected downward ceiling normal, got ${Hit.Normal[2]}`);
    AssignCourseReliefEnabled(true);
});
