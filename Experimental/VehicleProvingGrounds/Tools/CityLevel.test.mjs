import test from "node:test";
import assert from "node:assert/strict";
import { CreateRandom, GenerateCityLayout, CityConstants, ResolveBlocks, IsRoad } from "../Source/CityLevelLayout.js";
import * as City from "../Source/CityLevelStructure.js";
import { CourseMaterial, ConstructMaterialSpecification } from "../Source/MaterialSpecification.js";
import { CourseConstants } from "../Source/CourseStructure.js";

const Layout = GenerateCityLayout(CityConstants.Seed);
const BuildingKeys = Object.keys(City.LevelShapes).filter((Key) => Key.startsWith("CityBuilding"));
const Key = (P) => P.map((V) => Math.round(V * 1e6)).join(",");

// 📝 Directed-edge check: every triangle edge a→b must be matched by an edge b→a. A closed, consistently wound mesh has no
//    unpaired edges and no T-junctions (a T-junction leaves a long edge unmatched).
function UnpairedEdges(Facets)
{
    const Count = new Map();
    for (const Facet of Facets)
    {
        const C = Facet.Corners.map(Key);
        for (let I = 0; I < 3; ++I)
        {
            const Edge = `${C[I]}|${C[(I + 1) % 3]}`;
            Count.set(Edge, (Count.get(Edge) || 0) + 1);
        }
    }
    let Unpaired = 0;
    for (const [Edge, N] of Count)
    {
        const [A, B] = Edge.split("|");
        if (Count.get(`${B}|${A}`) !== N)
            ++Unpaired;
    }
    return Unpaired;
}

// 📝 Signed volume by the divergence theorem: positive when the triangles face outward.
function SignedVolume(Facets)
{
    let Sum = 0.0;
    for (const { Corners: [A, B, C] } of Facets)
        Sum += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
    return Sum / 6.0;
}

test("the generator is deterministic for a seed, and different seeds give different cities", () => {
    const A = JSON.stringify(GenerateCityLayout(55)), B = JSON.stringify(GenerateCityLayout(55)), C = JSON.stringify(GenerateCityLayout(56));
    assert.equal(A, B);
    assert.notEqual(A, C);
});

test("mulberry32 is in [0, 1) and repeatable", () => {
    const First = CreateRandom(7), Second = CreateRandom(7);
    for (let Index = 0; Index < 1000; ++Index)
    {
        const V = First();
        assert.ok(V >= 0 && V < 1, `draw ${Index} = ${V}`);
        assert.equal(V, Second());
    }
});

test("the city has the pieces it promises", () => {
    assert.ok(Layout.Buildings.length >= 30, `buildings: ${Layout.Buildings.length}`);
    assert.ok(Layout.Buildings.some((B) => B.Upper), "some buildings have stacked tiers");
    assert.ok(Layout.Buildings.some((B) => B.Ivy.length > 0), "some buildings carry ivy");
    assert.ok(Layout.Buildings.some((B) => B.Windows.some((W) => W.Broken)), "some windows are void");
    assert.ok(Layout.Buildings.some((B) => B.Windows.some((W) => W.Cracked)), "some windows are cracked");
    assert.ok(Layout.Buildings.some((B) => B.Roof.length > 0), "some roofs carry trees");
    assert.ok(Layout.Potholes.length >= 40 && Layout.Potholes.some((P) => P.Pool), "potholes, some flooded");
    assert.ok(Layout.Cracks.length >= 60, "cracked roads");
    assert.ok(Layout.Tufts.length > 0, "broken grass");
    assert.ok(Layout.Dips.length > 0, "dips with pools");
    assert.equal(Layout.Breakables.length, 4);
});

test("buildings sit inside their lots, the lots inside the blocks, and nothing sits on a road", () => {
    const Blocks = ResolveBlocks();
    for (const B of Layout.Buildings)
    {
        const Footprint = B.Base;
        assert.ok(Footprint.X1 - Footprint.X0 >= 7.0 - 1e-9 && Footprint.Y1 - Footprint.Y0 >= 7.0 - 1e-9, `${B.Id} is too small`);
        assert.ok(Footprint.X0 >= B.Lot.X0 - 1e-9 && Footprint.X1 <= B.Lot.X1 + 1e-9, `${B.Id} overruns its lot in X`);
        assert.ok(Footprint.Y0 >= B.Lot.Y0 - 1e-9 && Footprint.Y1 <= B.Lot.Y1 + 1e-9, `${B.Id} overruns its lot in Y`);
        assert.ok(Blocks.some(([X0, X1, Y0, Y1]) => B.Lot.X0 >= X0 - 1e-9 && B.Lot.X1 <= X1 + 1e-9 && B.Lot.Y0 >= Y0 - 1e-9 && B.Lot.Y1 <= Y1 + 1e-9),
                  `${B.Id} is outside every block`);
        for (const [X, Y] of [[Footprint.X0, Footprint.Y0], [Footprint.X1, Footprint.Y0], [Footprint.X1, Footprint.Y1], [Footprint.X0, Footprint.Y1]])
            assert.equal(IsRoad(X, Y), false, `${B.Id} corner (${X.toFixed(1)}, ${Y.toFixed(1)}) is on a road`);
    }
});

test("buildings do not overlap one another", () => {
    const Boxes = Layout.Buildings.map((B) => B.Base);
    for (let I = 0; I < Boxes.length; ++I)
        for (let J = I + 1; J < Boxes.length; ++J)
        {
            const A = Boxes[I], C = Boxes[J];
            const Overlap = A.X0 < C.X1 && C.X0 < A.X1 && A.Y0 < C.Y1 && C.Y0 < A.Y1;
            assert.equal(Overlap, false, `buildings ${I} and ${J} overlap`);
        }
});

test("the upper tier sits inside its base, and windows and ivy sit on their faces", () => {
    for (const B of Layout.Buildings)
    {
        if (B.Upper)
        {
            assert.ok(B.Upper.X0 > B.Base.X0 && B.Upper.X1 < B.Base.X1 && B.Upper.Y0 > B.Base.Y0 && B.Upper.Y1 < B.Base.Y1, `${B.Id} upper tier`);
            assert.equal(B.Upper.Base, B.Base.H);
        }
        for (const W of B.Windows)
        {
            const Along = W.Face[1] === "X" ? [B.Base.Y0, B.Base.Y1] : [B.Base.X0, B.Base.X1];
            const Top = W.Tier === "upper" && B.Upper ? B.Base.H + B.Upper.H : B.Base.H;
            assert.ok(W.A0 >= Along[0] && W.A1 <= Along[1], `${B.Id} window along the face`);
            assert.ok(W.Z0 >= 0 && W.Z1 <= Top, `${B.Id} window height`);
        }
    }
});

test("every building is a closed, consistently wound shell with the right volume", () => {
    for (const Layout1 of Layout.Buildings)
    {
        const Shape = City.LevelShapes[`CityBuilding${Layout1.Id}`];
        const Facets = Shape.Emit();
        assert.ok(Facets.length > 0, `${Layout1.Id} has facets`);
        for (const Facet of Facets)
        {
            const [A, B, C] = Facet.Corners;
            const Area2 = Math.hypot(...[0, 1, 2].map((Axis) => (B[(Axis + 1) % 3] - A[(Axis + 1) % 3]) * (C[(Axis + 2) % 3] - A[(Axis + 2) % 3])
                                                                 - (B[(Axis + 2) % 3] - A[(Axis + 2) % 3]) * (C[(Axis + 1) % 3] - A[(Axis + 1) % 3])));
            assert.ok(Area2 > 1e-9, `${Layout1.Id} has a degenerate facet`);
            assert.ok(Facet.Corners.every((P) => P.every(Number.isFinite)), `${Layout1.Id} has a finite corner`);
        }
        assert.equal(UnpairedEdges(Facets), 0, `${Layout1.Id}: every edge has an opposite partner (closed, no T-junctions)`);
        const Base = Layout1.Base;
        const Expected = (Base.X1 - Base.X0) * (Base.Y1 - Base.Y0) * Base.H
                       + (Layout1.Upper ? (Layout1.Upper.X1 - Layout1.Upper.X0) * (Layout1.Upper.Y1 - Layout1.Upper.Y0) * Layout1.Upper.H : 0);
        const Volume = SignedVolume(Facets);
        assert.ok(Math.abs(Volume - Expected) < 1e-6 * Math.max(1, Expected), `${Layout1.Id}: volume ${Volume} vs ${Expected}`);
    }
});

test("buildings are built in local coordinates centred on their base footprint", () => {
    for (const B of Layout.Buildings.slice(0, 6))
    {
        const Facets = City.LevelShapes[`CityBuilding${B.Id}`].Emit();
        const Min = [Infinity, Infinity, Infinity], Max = [-Infinity, -Infinity, -Infinity];
        for (const Facet of Facets)
            for (const P of Facet.Corners)
                for (let Axis = 0; Axis < 3; ++Axis) { Min[Axis] = Math.min(Min[Axis], P[Axis]); Max[Axis] = Math.max(Max[Axis], P[Axis]); }
        assert.ok(Math.abs(Min[0] + 0.5 * (B.Base.X1 - B.Base.X0)) < 1e-9 && Math.abs(Max[0] - 0.5 * (B.Base.X1 - B.Base.X0)) < 1e-9, `${B.Id} X extent`);
        assert.ok(Math.abs(Min[1] + 0.5 * (B.Base.Y1 - B.Base.Y0)) < 1e-9 && Math.abs(Max[1] - 0.5 * (B.Base.Y1 - B.Base.Y0)) < 1e-9, `${B.Id} Y extent`);
        assert.ok(Math.abs(Min[2]) < 1e-9, `${B.Id} rests on the ground`);
    }
});

test("ground and every shape use only families the material table defines", () => {
    const Ground = City.EmitLevelGroundFacets();
    assert.ok(Ground.length > 3000, `ground facets: ${Ground.length}`);
    const Table = ConstructMaterialSpecification();
    const Families = new Set();
    const Add = (Facet) => (Array.isArray(Facet.Family) ? Facet.Family : [Facet.Family]).forEach((F) => Families.add(F));
    for (const Shape of Object.values(City.LevelShapes))
        for (const Facet of Shape.Emit())
            Add(Facet);
    for (const Facet of Ground)
        Add(Facet);
    for (const Family of Families)
    {
        assert.ok(Number.isInteger(Family), `family ${Family} is an integer`);
        assert.ok(Family >= 0 && Family < Table.length && Table[Family], `family ${Family} is defined`);
    }
    for (const Name of ["Facade", "FacadeStained", "WindowGlassDark", "WindowVoid", "Ivy", "RoofTar", "AsphaltCracked", "Pothole", "FloodWater", "GrassDry", "Foliage", "TreeBark", "RustMetal"])
        assert.ok(CourseMaterial[Name] >= 86 && CourseMaterial[Name] <= 98, `${Name} sits in the appended city range`);
});

test("placements: every shape is known, no dead-pole lamps, and raster-only overgrowth casts no distance shadow", () => {
    const Placements = City.ResolveLevelPlacements();
    for (const P of Placements)
        assert.ok(City.LevelShapes[P.Shape], `unknown shape ${P.Shape}`);
    assert.equal(Placements.some((P) => P.Shape === "PoleHead"), false, "no street lamps: StreetLampPoles stays empty");
    assert.equal(Placements.filter((P) => P.Shape.startsWith("CityBuilding")).length, Layout.Buildings.length);
    assert.equal(City.LevelShapes.CityOvergrowth.Distance, false, "overgrowth is raster only");
    assert.ok(Placements.some((P) => P.Shape === "CityOvergrowth"), "overgrowth exists");
});

test("the occupant budget: buildings, props and cones together stay under the identity ceiling", () => {
    // 📝 FacetStructure: occupants = 5 vehicle + placements + cones + breakables (1 + capacity each); ground takes 1 + 180 + 4 more.
    const Placements = City.ResolveLevelPlacements();
    const Cones = City.ResolveConePlacements();
    const Breakables = City.ResolveBreakables();
    const Occupants = 5 + Placements.length + Cones.length + Breakables.reduce((Sum, B) => Sum + 1 + B.Capacity, 0);
    assert.ok(Occupants + 185 <= 2044, `occupants ${Occupants} + ground 185 exceed IdentityCeiling 2044`);
});

test("windows come in three states: intact, cracked, and void", () => {
    const Cracked = Layout.Buildings.flatMap((B) => B.Windows).filter((W) => W.Cracked && !W.Broken).length;
    const Void = Layout.Buildings.flatMap((B) => B.Windows).filter((W) => W.Broken).length;
    assert.ok(Cracked > 0 && Void > 0, `cracked ${Cracked}, void ${Void}`);
});

test("no timed drill stations; arena zones and clear zones are defined", () => {
    assert.equal(City.TrainingDrills.length, 0);
    assert.ok(City.ArenaZones.length >= 3);
    for (const Zone of City.ArenaZones)
        assert.ok(Zone.Position.every(Number.isFinite), `${Zone.Name} has a position`);
    assert.ok(City.LevelClearZones.length >= 2);
    for (const [X0, Y0, X1, Y1] of City.LevelClearZones)
        assert.ok(X1 > X0 && Y1 > Y0, "clear zone is a rectangle");
});

test("the spawn and the crossroads sit on the road network, inside the pad", () => {
    const C = CourseConstants;
    assert.ok(C.PadMinimum[0] <= -58.0 && C.PadMaximum[0] >= 154.0);
    assert.ok(IsRoad(-40.0, 0.0), "the spawn is on the avenue");
    assert.ok(IsRoad(-24.0, 0.0), "the crossroads is a road");
});
