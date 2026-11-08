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

test("LevelCatalog exposes multi-track Inversion Arena (Tracks A–G) and Proving Grounds descriptors cleanly", () =>
{
    assert.equal(LevelCatalog.length, 2);
    const Inversion = ResolveLevelDescriptor("inversion");
    const Proving = ResolveLevelDescriptor("proving");
    assert.equal(Inversion.Title, "Inversion Arena");
    assert.equal(Inversion.Relief, false);
    assert.equal(Inversion.Tracks.length, 7);
    assert.deepEqual(Inversion.Tracks.map((T) => T.Id), ["trackA", "trackB", "trackC", "trackD", "trackE", "trackF", "trackG"]);
    assert.equal(Inversion.Surfaces.length, 33);
    assert.equal(Inversion.Zones.length, 20);
    assert.ok(Inversion.PhysicsCutouts.length >= 8);
    assert.equal(Inversion.DistanceCutouts.length, 6);
    assert.equal(Inversion.Bollards().length, 2);
    assert.equal(Inversion.CollapseSpans().length, 2);
    assert.equal(Inversion.Trams().length, 6);
    assert.equal(Inversion.Drones().length, 14);
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

test("Track D Session-Baked CollapseSequence: unique movie cracks, 2-manifold shards, sand effects, and rear-to-front Bridge & Road escape", async () =>
{
    const fs = await import("node:fs/promises");
    const PreviousFetch = globalThis.fetch;
    globalThis.fetch = async (Url) =>
    {
        const Buffer = await fs.readFile(new URL(`../${Url}`, import.meta.url));
        return { ok: true, arrayBuffer: async () => Buffer.buffer.slice(Buffer.byteOffset, Buffer.byteOffset + Buffer.byteLength) };
    };
    AssignCourseReliefEnabled(false);
    AssignExcavationCutouts(InversionPhysicsCutouts);
    try
    {
        const Scene = new SceneStructure();
        await Scene.ConstructScene("Archive", 256, "inversion");
        const Collapse = Scene.Collapse;
        assert.ok(Collapse && Collapse.Spans.length === 2, "CollapseSequence must initialize both Bridge and Road spans");

        // ① Verify GPU IdentityCeiling (< 2044) AND exact OccupantDistanceSpace 3D SDF Slice Ceiling (< 2048) at 256 stress objects!
        assert.ok(Scene.DistanceCount <= 2044, `DistanceCount (${Scene.DistanceCount}) must fit within IdentityCeiling = 2044`);
        const RequiredSets = new Set();
        for (const Occupant of Scene.Occupants)
            if (Occupant.Roles & 2) // OccupantRole.Distance
                RequiredSets.add(Occupant.FacetSet);
        let AtlasW = 0, AtlasH = 0, StaticSlices = 0;
        for (const SetIdx of RequiredSets)
        {
            const Set = Scene.FacetSets[SetIdx];
            let Voxel = Set.DistanceVoxel;
            const Extent = [0, 1, 2].map((Axis) => Set.LocalMaximum[Axis] - Set.LocalMinimum[Axis]);
            const Margin = () => Math.max(4.0 * Voxel, 0.12);
            const Longest = Math.max(...Extent.map((L) => L + 2.0 * Margin()));
            if (Longest / Voxel > 128)
                Voxel = Longest / 128;
            const Res = Extent.map((L) => Math.max(8, Math.min(128, Math.ceil((L + 2.0 * Margin()) / Voxel))));
            AtlasW = Math.max(AtlasW, Res[0]);
            AtlasH = Math.max(AtlasH, Res[1]);
            StaticSlices += Res[2] + 1;
        }
        const FragPerRow = Math.floor(Math.max(AtlasW, 12) / 12);
        const FragPerCol = Math.floor(Math.max(AtlasH, 12) / 12);
        const FragLayers = Math.ceil(256 / (FragPerRow * FragPerCol));
        const TotalSlices = StaticSlices + FragLayers * 13;
        assert.ok(TotalSlices < 2048, `Total 3D SDF slices (${TotalSlices}) must stay strictly under WebGPU 2048 ceiling`);

        // ② Every session-baked Voronoi slab, crack prism, and sand clump must be a closed outward-wound 2-manifold!
        const Quantize = (P) => P.map((C) => Math.round(C * 1.0e4)).join(",");
        for (let PieceIdx = 0; PieceIdx < Collapse.Pieces.length; ++PieceIdx)
        {
            const Piece = Collapse.Pieces[PieceIdx];
            const Directed = new Set();
            let SixVol = 0.0;
            for (const Tri of Piece.Triangles)
            {
                const [A, B, C] = Tri.Corners;
                for (const [P, Q] of [[A, B], [B, C], [C, A]])
                {
                    const KP = Quantize(P), KQ = Quantize(Q);
                    if (KP === KQ) continue;
                    const Tag = `${KP}->${KQ}`;
                    assert.ok(!Directed.has(Tag), `Collapse piece ${PieceIdx} has duplicate edge ${Tag}`);
                    Directed.add(Tag);
                }
                SixVol += DotVector(A, CrossVector(SubtractVector(B, A), SubtractVector(C, A)));
            }
            for (const Tag of Directed)
            {
                const [From, To] = Tag.split("->");
                assert.ok(Directed.has(`${To}->${From}`), `Collapse piece ${PieceIdx} has open boundary edge ${Tag}`);
            }
            assert.ok(SixVol > 1.0e-5, `Collapse piece ${PieceIdx} must have positive outward volume, got ${SixVol}`);
        }

        // ③ Session-unique baking: distinct seeds produce genuinely distinct faultline crack & Voronoi shard layouts!
        Collapse.BakeAllSpans(0x13579BDF);
        const SnapshotA = Collapse.Spans[0].Bays.map((B) => B.Cracks[0].RelY.toFixed(4)).join(",");
        Collapse.BakeAllSpans(0x2468ACE0);
        const SnapshotB = Collapse.Spans[0].Bays.map((B) => B.Cracks[0].RelY.toFixed(4)).join(",");
        assert.notEqual(SnapshotA, SnapshotB, "Different session seeds must bake unique movie crack trajectories");
        Collapse.BakeAllSpans(0x13579BDF);
        assert.equal(Collapse.Spans[0].Bays.map((B) => B.Cracks[0].RelY.toFixed(4)).join(","), SnapshotA,
                     "Identical seed must reproduce exact deterministic fracture layout");

        // ④ Collapsing Sky-Bridge (+5.0 m): fast driver escapes across while rear bays collapse & emit sand/dust plumes!
        let SparkBursts = 0;
        const MockSparks = { EmitBurst() { SparkBursts++; } };
        const BridgeCar = new VehicleSolver([]);
        BridgeCar.Surfaces = InversionArenaSurfaces;
        BridgeCar.AeroGripScale = 1.0;
        BridgeCar.Respawn([-92.0, -250.0, 0.63], 0.0);

        let PeakSmokeEmitters = 0;
        let ActiveSandSeen = 0;
        for (let Step = 0; Step < 680; ++Step)
        {
            BridgeCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            Collapse.Advance(BridgeCar.Position, BridgeCar.LinearVelocity, 1.0 / 60.0, MockSparks);
            PeakSmokeEmitters = Math.max(PeakSmokeEmitters, Collapse.QuerySmokeEmissions().length);
            ActiveSandSeen = Math.max(ActiveSandSeen, Collapse.SandShards.filter((S) => S.Active).length);
            if (BridgeCar.Position[0] > 106.0)
                break;
        }
        const BridgeSpan = Collapse.Spans[0];
        assert.equal(BridgeSpan.Bays[0].Collapsed, true, "Rear bridge bay must have collapsed behind the escaping car");
        assert.equal(BridgeSpan.Surface.BayIntact[0], 0, "Collapsed rear bay must drop its analytical wheel support");
        assert.ok(BridgeSpan.CrackFrontU > BridgeSpan.DropFrontU || BridgeSpan.CrackFrontU >= 1.0,
                  "Movie faultline cracks must propagate ahead of the collapse drop front");
        assert.ok(PeakSmokeEmitters >= 1 && ActiveSandSeen >= 2 && SparkBursts > 5,
                  "Collapse must emit volumetric sand/dust plumes and cascading sand particles");
        assert.ok(BridgeCar.Position[0] > 100.0 && BridgeCar.Position[2] > 0.2,
                  `Fast driver must outrun rear-to-front bridge collapse to far ramp, got X=${BridgeCar.Position[0]}, Z=${BridgeCar.Position[2]}`);

        // ⑤ Collapsing Faultline Road (0.0 m over -5.2 m Sinkhole Chasm): fast driver escapes; lingering car plunges into sinkhole!
        Collapse.ResetAllPoses();
        const RoadCar = new VehicleSolver([]);
        RoadCar.Surfaces = InversionArenaSurfaces;
        RoadCar.AeroGripScale = 1.0;
        RoadCar.Respawn([82.0, -318.0, 0.63], Math.PI);
        for (let Step = 0; Step < 520; ++Step)
        {
            RoadCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            Collapse.Advance(RoadCar.Position, RoadCar.LinearVelocity, 1.0 / 60.0, MockSparks);
            if (RoadCar.Position[0] < -60.0)
                break;
        }
        const RoadSpan = Collapse.Spans[1];
        assert.equal(RoadSpan.Bays[0].Collapsed, true, "Rear bay of Collapsing Sinkhole Road must collapse behind car");
        assert.ok(RoadCar.Position[0] < -56.0 && RoadCar.Position[2] > -0.2,
                  `Fast driver must clear Collapsing Road to solid ground past X=-56, got X=${RoadCar.Position[0]}, Z=${RoadCar.Position[2]}`);

        // Verify a stationary car parked on Bay 1 of the Sinkhole Road physically plunges into the -5.2 m chasm when overtaken!
        Collapse.ResetAllPoses();
        const SlowCar = new VehicleSolver([]);
        SlowCar.Surfaces = InversionArenaSurfaces;
        SlowCar.Respawn([44.0, -318.0, 0.63], Math.PI);
        Collapse.TriggerSpan(RoadSpan);
        for (let Step = 0; Step < 180; ++Step)
        {
            Collapse.Advance(SlowCar.Position, SlowCar.LinearVelocity, 1.0 / 60.0);
            SlowCar.Advance({ Throttle: 0.0, Brake: 1.0, Steer: 0.0, Handbrake: true }, 1.0 / 60.0);
        }
        assert.ok(SlowCar.Position[2] < -2.5, `Stationary car overtaken by road collapse must plunge into sinkhole (Z < -2.5 m), got Z=${SlowCar.Position[2]}`);
    }
    finally
    {
        AssignExcavationCutouts([]);
        AssignCourseReliefEnabled(true);
        globalThis.fetch = PreviousFetch;
    }
});

test("Track E 3-Lane Subway ([road][tunnel down][road] -- [road][road][road] -- [road][tunnel up][road]) & Track F Trams/Trains", async () =>
{
    const fs = await import("node:fs/promises");
    const PreviousFetch = globalThis.fetch;
    globalThis.fetch = async (Url) =>
    {
        const Buffer = await fs.readFile(new URL(`../${Url}`, import.meta.url));
        return { ok: true, arrayBuffer: async () => Buffer.buffer.slice(Buffer.byteOffset, Buffer.byteOffset + Buffer.byteLength) };
    };
    AssignCourseReliefEnabled(false);
    AssignExcavationCutouts(InversionPhysicsCutouts);
    try
    {
        // ① Exact 3-Lane Subway topology checks:
        //    Entry portal (X = -56): Left [road] (Y = 268.5) & Right [road] (Y = 243.5) at Z = 0; Center (Y = 256.0) diving < 0!
        assert.equal(ResolveCourseHeight(-56.0, 268.5, 0.5), 0.0, "Left outer lane must remain Z=0 [road] alongside tunnel entry");
        assert.equal(ResolveCourseHeight(-56.0, 243.5, 0.5), 0.0, "Right outer lane must remain Z=0 [road] alongside tunnel entry");
        assert.ok(ResolveCourseHeight(-56.0, 256.0, 0.5) < -40.0, "Center portal entry must open downward into subway ramp");
        const EntryRampHit = CastSurfaceRay(InversionArenaSurfaces, [-56.0, 256.0, 2.0], [0.0, 0.0, -1.0], 10.0);
        assert.ok(EntryRampHit && EntryRampHit.Point[2] < -1.5 && EntryRampHit.Point[2] > -4.0,
                  `Center lane at X=-56 must be descending ramp, got Z=${EntryRampHit?.Point[2]}`);

        //    Middle section (X = 0): ALL THREE LANES [road][road][road] at Z = 0, AND -5.20 m subway station directly below center!
        assert.equal(ResolveCourseHeight(0.0, 268.5, 0.5), 0.0, "Middle section Left [road] at Z=0");
        assert.equal(ResolveCourseHeight(0.0, 256.0, 0.5), 0.0, "Middle section Center [road] over subway roof at Z=0");
        assert.equal(ResolveCourseHeight(0.0, 243.5, 0.5), 0.0, "Middle section Right [road] at Z=0");
        const SubwayFloorHit = CastSurfaceRay(InversionArenaSurfaces, [0.0, 256.0, -1.5], [0.0, 0.0, -1.0], 6.0);
        assert.ok(SubwayFloorHit && Math.abs(SubwayFloorHit.Point[2] - (-5.2)) < 0.05,
                  `Underground subway floor must sit at Z=-5.2 m beneath center [road], got ${SubwayFloorHit?.Point[2]}`);

        //    Exit portal (X = +56): Left [road] & Right [road] at Z = 0; Center climbing back up!
        assert.equal(ResolveCourseHeight(56.0, 268.5, 0.5), 0.0, "Left outer lane must remain Z=0 [road] alongside tunnel exit");
        assert.equal(ResolveCourseHeight(56.0, 243.5, 0.5), 0.0, "Right outer lane must remain Z=0 [road] alongside tunnel exit");
        const ExitRampHit = CastSurfaceRay(InversionArenaSurfaces, [56.0, 256.0, 2.0], [0.0, 0.0, -1.0], 10.0);
        assert.ok(ExitRampHit && ExitRampHit.Point[2] < -1.5 && ExitRampHit.Point[2] > -4.0,
                  `Center lane at X=+56 must be ascending exit ramp, got Z=${ExitRampHit?.Point[2]}`);

        //    Drive ControlVehicle straight down Center Subway Portal (-5.2 m) and back up between the outer [road] lanes!
        const SubwayCar = new VehicleSolver([]);
        SubwayCar.Surfaces = InversionArenaSurfaces;
        SubwayCar.AeroGripScale = 1.0;
        SubwayCar.Respawn([-84.0, 256.0, 0.63], 0.0);
        let MinSubwayZ = 10.0;
        for (let Step = 0; Step < 520; ++Step)
        {
            SubwayCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            MinSubwayZ = Math.min(MinSubwayZ, SubwayCar.Position[2]);
            if (SubwayCar.Position[0] > 76.0)
                break;
        }
        assert.ok(MinSubwayZ < -4.3, `Expected car to descend into -5.2 m 3-Lane Subway gallery, got ${MinSubwayZ}`);
        assert.ok(SubwayCar.Position[0] > 72.0 && SubwayCar.Position[2] > 0.3,
                  `Expected car to emerge up the far center ramp to Z>0.3 m, got X=${SubwayCar.Position[0]}, Z=${SubwayCar.Position[2]}`);

        // ② Separate Articulated Streetcar Trams & Express Commuter Trains (TramSequence.js)
        const Scene = new SceneStructure();
        await Scene.ConstructScene("Archive", 0, "inversion");
        const Trams = Scene.Trams;
        assert.ok(Trams, "TramSequence must be constructed separately on Scene");
        const Summary = Trams.QuerySummary();
        assert.equal(Summary.ConsistCount, 6, "Expected 4 articulated trams + 2 express trains");
        assert.equal(Summary.CarCount, 14, "Expected 8 tram cars + 6 express train coaches = 14 railcars");

        const Obstacles = Scene.QueryObstacleBounds();
        Trams.RegisterDynamicObstacles(Obstacles);
        const LeadTramCar = Trams.Consists[0].Cars[0];
        const StartTramX = LeadTramCar.WorldPosition[0];

        const DummyCar = {
            Position:       [StartTramX + 6.0, 314.0, 0.63],
            LinearVelocity: [-8.0, 0.0, 0.0]
        };
        for (let Step = 0; Step < 30; ++Step)
            Trams.Advance(DummyCar, 1.0 / 60.0);

        assert.ok(LeadTramCar.WorldPosition[0] > StartTramX + 1.0, "Eastbound streetcar tram must advance along rail track");
        assert.ok(DummyCar.LinearVelocity[0] > 0.0, "Colliding head-on with moving Eastbound tram must deflect vehicle velocity Eastward");
    }
    finally
    {
        AssignExcavationCutouts([]);
        AssignCourseReliefEnabled(true);
        globalThis.fetch = PreviousFetch;
    }
});

test("True Road Boolean Holes (Underground Portals & Wavy Bollard Shafts), Track G Construction Site (Through-Trench + Dead-End Pit), Waypoint Gantries, Railguards, 4 Cone Types & Floating Robot Drones", async () =>
{
    const fs = await import("node:fs/promises");
    const PreviousFetch = globalThis.fetch;
    globalThis.fetch = async (Url) =>
    {
        const Buffer = await fs.readFile(new URL(`../${Url}`, import.meta.url));
        return { ok: true, arrayBuffer: async () => Buffer.buffer.slice(Buffer.byteOffset, Buffer.byteOffset + Buffer.byteLength) };
    };
    AssignCourseReliefEnabled(false);
    AssignExcavationCutouts(InversionPhysicsCutouts);
    try
    {
        const Inversion = ResolveLevelDescriptor("inversion");
        const GroundFacets = Inversion.EmitGround();

        // ① True Road Boolean Cutouts: verify NO horizontal ground/turf/paint facet (Z in [-0.05, +0.05]) covers the center of
        //    ANY underground portal hole OR ANY Wavy/Linear Bollard shaft, while sunken -1.92 m bollard floors DO exist!
        const PointInTriangle2D = (PX, PY, A, B, C) =>
        {
            const D1 = (PX - B[0]) * (A[1] - B[1]) - (A[0] - B[0]) * (PY - B[1]);
            const D2 = (PX - C[0]) * (B[1] - C[1]) - (B[0] - C[0]) * (PY - C[1]);
            const D3 = (PX - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (PY - A[1]);
            const HasNeg = (D1 < -1e-5) || (D2 < -1e-5) || (D3 < -1e-5);
            const HasPos = (D1 >  1e-5) || (D2 >  1e-5) || (D3 >  1e-5);
            return !(HasNeg && HasPos);
        };
        const HasRoadSheetAt = (TestX, TestY) => GroundFacets.some((F) =>
        {
            const [A, B, C] = F.Corners;
            if (Math.abs(A[2]) > 0.06 || Math.abs(B[2]) > 0.06 || Math.abs(C[2]) > 0.06)
                return false;
            return PointInTriangle2D(TestX, TestY, A, B, C);
        });

        // Check Track B Subway portal, Track C Canyon, Track E 3-Lane Subway entry/exit, Track G Through-Trench, Track G Dead-End Pit!
        for (const [Label, X, Y] of [
            ["Track B Subway Entry",          -24.0,   84.0],
            ["Track C Canyon Underpass",       78.0,  -80.0],
            ["Track E 3-Lane Subway Entry",   -56.0,  256.0],
            ["Track E 3-Lane Subway Exit",     56.0,  256.0],
            ["Track G Construction Trench",     0.0, -386.0],
            ["Track G Construction Dead-End",   0.0, -418.0]
        ])
        {
            assert.equal(HasRoadSheetAt(X, Y), false, `${Label} at (${X}, ${Y}) must be a true open boolean hole with zero blocking grass/asphalt/paint facets`);
        }

        // Check Wavy Bollard & Linear Bollard recessed boolean shafts!
        const BollardZones = Inversion.Bollards();
        const WaveSamplePost = BollardZones[1].Posts[0];
        const LinearSamplePost = BollardZones[0].Posts[0];
        assert.equal(HasRoadSheetAt(WaveSamplePost.Position[0], WaveSamplePost.Position[1]), false,
                     "Wavy bollard must sit inside a true boolean hole cut through all Z=0/-0.02 road layers");
        assert.equal(HasRoadSheetAt(LinearSamplePost.Position[0], LinearSamplePost.Position[1]), false,
                     "Linear bollard must sit inside a true boolean hole cut through all Z=0/-0.02 road layers");
        const SunkenShaftFloors = GroundFacets.filter((F) => F.Corners.every((C) => Math.abs(C[2] - (-1.92)) < 0.02));
        assert.ok(SunkenShaftFloors.length >= 120, `Expected recessed -1.92 m mechanical shaft floors for all 60 bollards, got ${SunkenShaftFloors.length}`);

        // ② [Track G · ConstructionThroughTrench] (North Construction Lane, Y = -386): drives down -5.2 m AND comes back up!
        const TrenchCar = new VehicleSolver([]);
        TrenchCar.Surfaces = InversionArenaSurfaces;
        TrenchCar.AeroGripScale = 1.0;
        TrenchCar.Respawn([-84.0, -386.0, 0.63], 0.0);
        let MinTrenchZ = 10.0;
        for (let Step = 0; Step < 560; ++Step)
        {
            TrenchCar.Advance({ Throttle: 1.0, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            MinTrenchZ = Math.min(MinTrenchZ, TrenchCar.Position[2]);
            if (TrenchCar.Position[0] > 66.0)
                break;
        }
        assert.ok(MinTrenchZ < -4.3, `Expected Track G Through-Trench descent < -4.3 m, got ${MinTrenchZ}`);
        assert.ok(TrenchCar.Position[0] > 62.0 && TrenchCar.Position[2] > 0.3,
                  `Expected Track G Through-Trench to come cleanly back up onto surface road, got X=${TrenchCar.Position[0]}, Z=${TrenchCar.Position[2]}`);

        // ③ [Track G · ConstructionDeadEndPit] (South Construction Lane, Y = -418): drives down -5.2 m into Dead-End Pit & hits bulkhead wall at X = +32!
        const PitCar = new VehicleSolver([]);
        PitCar.Surfaces = InversionArenaSurfaces;
        PitCar.AeroGripScale = 1.0;
        PitCar.Respawn([-78.0, -418.0, 0.63], 0.0);
        let MinPitZ = 10.0;
        for (let Step = 0; Step < 420; ++Step)
        {
            PitCar.Advance({ Throttle: 0.85, Brake: 0.0, Steer: 0.0, Handbrake: false }, 1.0 / 60.0);
            MinPitZ = Math.min(MinPitZ, PitCar.Position[2]);
        }
        assert.ok(MinPitZ < -4.3, `Expected Track G Dead-End Pit descent < -4.3 m, got ${MinPitZ}`);
        assert.ok(PitCar.Position[0] > 18.0 && PitCar.Position[0] < 32.5,
                  `Dead-End Bulkhead Wall at X=+32 m must stop car underground without tunnelling, got X=${PitCar.Position[0]}`);

        // ④ Signage, Highway Waypoint Gantries, Construction Lights, Railguards, 4 Cone Types (incl. Lone Cones) & Floating Robot Drones!
        const Placements = Inversion.Placements();
        assert.ok(Placements.filter((P) => P.Shape.startsWith("WaypointBoard")).length >= 11, "Expected >= 11 overhead highway & construction waypoint boards");
        assert.ok(Placements.filter((P) => P.Shape === "WorkLightTower" || P.Shape === "AmberBeaconPost").length >= 28,
                  "Expected >= 28 construction floodlights & amber warning beacons");
        assert.ok(Placements.filter((P) => P.Shape === "GuardrailSection").length >= 80,
                  "Expected >= 80 corrugated steel W-beam highway railguard sections");

        const Cones = Inversion.Cones();
        const ConeShapes = new Set(Cones.map((C) => C.Shape || "Cone"));
        for (const Variant of ["Cone", "ConstructionDrum", "SlimPylonCone", "ShortWorkCone"])
            assert.ok(ConeShapes.has(Variant), `Expected cone variant ${Variant} in InversionArena`);
        assert.ok(Cones.filter((C) => C.Group === "lone").length >= 20, "Expected >= 20 scattered solitary lone cones");
        assert.ok(Cones.some((C) => (C.Position[2] ?? 0) < -4.5), "Expected knockable cones placed down inside the -5.2 m underground pits");

        const Scene = new SceneStructure();
        await Scene.ConstructScene("Archive", 0, "inversion");
        assert.ok(Scene.Drones && Scene.Drones.QuerySummary().DroneCount === 14, "Expected 14 floating midair robot drones");
        const NearCar = { Position: [-70.0, -402.0, 0.63], LinearVelocity: [0.0, 0.0, 0.0] };
        for (let Step = 0; Step < 20; ++Step)
            Scene.Drones.Advance(NearCar, 1.0 / 60.0);
        assert.ok(Scene.Drones.Units.every((D) => D.WorldPosition[2] > 2.4), "Every robot drone must float in midair above the roadway");
        assert.ok(Scene.Drones.QuerySummary().TrackingCount >= 1, "Nearby construction scout drone must optically lock onto ControlVehicle");
    }
    finally
    {
        AssignExcavationCutouts([]);
        AssignCourseReliefEnabled(true);
        globalThis.fetch = PreviousFetch;
    }
});
