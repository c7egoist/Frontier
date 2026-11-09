//============================================================================================================================================
//                                                        CITYLEVELSTRUCTURE.JS
//============================================================================================================================================
// 🧩 The abandoned city, as the same level API the proving grounds exports (LevelShapes, placements, cones, breakables, ground,
//    zones). Built from CityLevelLayout.js. Terrain (kerbs, ramp, spawn) is CourseStructure.js's, unchanged.

import { CourseMaterial } from "./MaterialSpecification.js";
import { CourseConstants, KerbConstants, SpawnPoint, EmitQuad, EmitBoxFacets, EmitPrismFacets, EmitSphereFacets,
         EmitExtrusionFacets, EmitConeFacets, EmitRampFacets } from "./CourseStructure.js";
import { GenerateCityLayout, CityConstants, ResolveBlocks, IsRoad } from "./CityLevelLayout.js";

const Degrees = Math.PI / 180.0;
const PaintLift = 0.004;
const Layout = GenerateCityLayout(CityConstants.Seed);

//------------------------------------------------------------------------------------------------------------------------
//                                                    GEOMETRY HELPERS
//------------------------------------------------------------------------------------------------------------------------

const Sub = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
const Cross = (A, B) => [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
const Dot = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];

// 📝 A planar quad (corners in order around its boundary) emitted counter-clockwise seen from its outward Normal. Two triangles
//    split on the A–C diagonal; Family may be [first, second] to give the two halves different materials (a shattered pane).
function EmitOutwardQuad(Facets, Corners, Normal, Family)
{
    const [P0, P1, P2, P3] = Corners;
    const Flip = Dot(Cross(Sub(P1, P0), Sub(P2, P0)), Normal) < 0.0;
    const Q = Flip ? [P0, P3, P2, P1] : [P0, P1, P2, P3];
    const [F1, F2] = Array.isArray(Family) ? Family : [Family, Family];
    Facets.push({ Corners: [Q[0], Q[1], Q[2]], Family: F1 });
    Facets.push({ Corners: [Q[0], Q[2], Q[3]], Family: F2 });
}

// 📝 A triangle emitted counter-clockwise seen from its outward Normal.
function EmitOutwardTriangle(Facets, Corners, Normal, Family)
{
    const [P0, P1, P2] = Corners;
    const Flip = Dot(Cross(Sub(P1, P0), Sub(P2, P0)), Normal) < 0.0;
    Facets.push({ Corners: Flip ? [P0, P2, P1] : [P0, P1, P2], Family });
}

// 📝 A flat fan: a polygon around a centre, lying at height Z, facing up. Radius(Angle) makes it ragged or elliptic.
function EmitFlatFan(Facets, CentreX, CentreY, Z, Radius, Family, Segments = 10)
{
    const Centre = [CentreX, CentreY, Z];
    for (let Segment = 0; Segment < Segments; ++Segment)
    {
        const A0 = 2.0 * Math.PI * Segment / Segments, A1 = 2.0 * Math.PI * (Segment + 1) / Segments;
        const P0 = [CentreX + Radius(A0) * Math.cos(A0), CentreY + Radius(A0) * Math.sin(A0), Z];
        const P1 = [CentreX + Radius(A1) * Math.cos(A1), CentreY + Radius(A1) * Math.sin(A1), Z];
        EmitOutwardTriangle(Facets, [Centre, P0, P1], [0.0, 0.0, 1.0], Family);
    }
}

function Translate(Facets, Offset)
{
    return Facets.map((Facet) => ({ ...Facet, Corners: Facet.Corners.map((P) => [P[0] + Offset[0], P[1] + Offset[1], P[2] + Offset[2]]) }));
}

// 📝 Each lattice cell's family from its index: a stable hash, so the same cell always gets the same surface.
function CellHash(Row, Column, Salt)
{
    const Value = Math.sin(Row * 12.9898 + Column * 78.233 + Salt * 37.719) * 43758.5453;
    return Value - Math.floor(Value);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        BUILDINGS
//------------------------------------------------------------------------------------------------------------------------

// 📝 The family of one wall cell, from its face and the cell's centre (along the face, and height). A window is one cell of
//    glass (intact, cracked, or void); a cracked pane shatters on one diagonal; ivy fills the piers; the damp band is the lower
//    StainBand metre. (No frame: a frame needs breakpoints on every neighbouring face, and the grid cost is what it has to fit.)
function WallFamily(Building, FaceName, Along, Z)
{
    for (const W of Building.Windows)
    {
        if (W.Face !== FaceName || Along < W.A0 || Along > W.A1 || Z < W.Z0 || Z > W.Z1)
            continue;
        if (W.Broken)
            return [CourseMaterial.WindowVoid, CourseMaterial.WindowVoid];
        if (W.Cracked)
            return [CourseMaterial.WindowGlassDark, CourseMaterial.WindowVoid];
        return [CourseMaterial.WindowGlassDark, CourseMaterial.WindowGlassDark];
    }
    for (const I of Building.Ivy)
        if (I.Face === FaceName && Along >= I.A0 && Along <= I.A1 && Z <= I.Top)
            return CourseMaterial.Ivy;
    return Z < CityConstants.StainBand ? CourseMaterial.FacadeStained : CourseMaterial.Facade;
}

// 📝 One building, local to its base footprint centre. Both tiers share one set of breakpoints along each axis, so every
//    edge is shared by exactly two facets and nothing hangs (no T-junctions). The upper tier has no bottom face: it stands on
//    the base's top, and the base's top keeps only the ring it does not cover.
function EmitBuildingFacets(Building)
{
    const B = Building.Base, U = Building.Upper, K = CityConstants;
    const CentreX = 0.5 * (B.X0 + B.X1), CentreY = 0.5 * (B.Y0 + B.Y1);
    const Top = U ? B.H + U.H : B.H;

    const Xs = new Set([B.X0, B.X1]), Ys = new Set([B.Y0, B.Y1]), Zs = new Set([0.0, B.H, Top, K.StainBand]);
    if (U) { Xs.add(U.X0); Xs.add(U.X1); Ys.add(U.Y0); Ys.add(U.Y1); }
    for (const W of Building.Windows)
    {
        const Along = W.Face[1] === "X" ? Ys : Xs;
        Along.add(W.A0); Along.add(W.A1);
        Zs.add(W.Z0); Zs.add(W.Z1);
    }
    for (const I of Building.Ivy)
    {
        const Along = I.Face[1] === "X" ? Ys : Xs;
        Along.add(I.A0); Along.add(I.A1);
        Zs.add(I.Top);
    }
    const Breaks = { X: [...Xs].sort((A, C) => A - C), Y: [...Ys].sort((A, C) => A - C), Z: [...Zs].sort((A, C) => A - C) };
    const Inside = (Values, Low, High) => Values.filter((V) => V >= Low - 1e-9 && V <= High + 1e-9);

    const Facets = [];
    const Tiers = [{ X0: B.X0, X1: B.X1, Y0: B.Y0, Y1: B.Y1, Z0: 0.0, Z1: B.H, Base: true, Top: true, Cover: U }];
    if (U)
        Tiers.push({ X0: U.X0, X1: U.X1, Y0: U.Y0, Y1: U.Y1, Z0: B.H, Z1: Top, Base: false, Top: true, Cover: null });

    for (const T of Tiers)
    {
        const Xa = Inside(Breaks.X, T.X0, T.X1), Ya = Inside(Breaks.Y, T.Y0, T.Y1), Za = Inside(Breaks.Z, T.Z0, T.Z1);

        // ① the four walls
        for (const [Axis, Sign] of [[0, 1], [0, -1], [1, 1], [1, -1]])
        {
            const Plane = Axis === 0 ? (Sign > 0 ? T.X1 : T.X0) : (Sign > 0 ? T.Y1 : T.Y0);
            const Name = (Sign > 0 ? "+" : "-") + (Axis === 0 ? "X" : "Y");
            const Normal = Axis === 0 ? [Sign, 0, 0] : [0, Sign, 0];
            const Along = Axis === 0 ? Ya : Xa;
            for (let I = 0; I + 1 < Along.length; ++I)
            {
                for (let J = 0; J + 1 < Za.length; ++J)
                {
                    const A0 = Along[I], A1 = Along[I + 1], Z0 = Za[J], Z1 = Za[J + 1];
                    const Point = (A, Z) => (Axis === 0 ? [Plane, A, Z] : [A, Plane, Z]);
                    const Family = WallFamily(Building, Name, 0.5 * (A0 + A1), 0.5 * (Z0 + Z1));
                    EmitOutwardQuad(Facets, [Point(A0, Z0), Point(A1, Z0), Point(A1, Z1), Point(A0, Z1)], Normal, Family);
                }
            }
        }

        // ② the bottom: the ground-level base only (an upper tier's underside is the base's top, shared, not emitted)
        if (T.Base)
        {
            for (let I = 0; I + 1 < Xa.length; ++I)
                for (let J = 0; J + 1 < Ya.length; ++J)
                    EmitOutwardQuad(Facets, [[Xa[I], Ya[J], 0.0], [Xa[I + 1], Ya[J], 0.0], [Xa[I + 1], Ya[J + 1], 0.0], [Xa[I], Ya[J + 1], 0.0]],
                                    [0.0, 0.0, -1.0], CourseMaterial.FacadeStained);
        }

        // ③ the top: a roof, or (for the base under an upper tier) only the ring the upper tier does not cover
        if (T.Top)
        {
            for (let I = 0; I + 1 < Xa.length; ++I)
            {
                for (let J = 0; J + 1 < Ya.length; ++J)
                {
                    const Cx = 0.5 * (Xa[I] + Xa[I + 1]), Cy = 0.5 * (Ya[J] + Ya[J + 1]);
                    if (T.Cover && Cx > T.Cover.X0 && Cx < T.Cover.X1 && Cy > T.Cover.Y0 && Cy < T.Cover.Y1)
                        continue;
                    EmitOutwardQuad(Facets, [[Xa[I], Ya[J], T.Z1], [Xa[I + 1], Ya[J], T.Z1], [Xa[I + 1], Ya[J + 1], T.Z1], [Xa[I], Ya[J + 1], T.Z1]],
                                    [0.0, 0.0, 1.0], CourseMaterial.RoofTar);
                }
            }
        }
    }

    return Translate(Facets, [-CentreX, -CentreY, 0.0]);
}

// 📝 A broken tree in the lot or on a roof: a short trunk and a canopy. Raster only: it casts no distance shadow, so the trees
//    never intersect a closed building.
function EmitOvergrowthFacets()
{
    return [...EmitPrismFacets(0.14, 2.2, 6, CourseMaterial.TreeBark),
            ...Translate(EmitSphereFacets(1.5, 6, 10, CourseMaterial.Foliage), [0.0, 0.0, 2.0])];
}

// 📝 A heap of masonry at a kerb: one box, stained at the base, clean at the top. It is a collider.
function EmitRubbleFacets()
{
    return EmitBoxFacets(2.4, 1.6, 0.9, CourseMaterial.FacadeStained);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                          SHAPES
//------------------------------------------------------------------------------------------------------------------------

// 📝 Jersey barrier cross-section (y, z), counter-clockwise: 60 cm foot, 16 cm crown, 80 cm tall (as the proving grounds).
const JerseyProfile = [[-0.30, 0.0], [0.30, 0.0], [0.30, 0.08], [0.12, 0.30], [0.08, 0.80], [-0.08, 0.80], [-0.12, 0.30], [-0.30, 0.08]];

const BuildingShapes = Object.fromEntries(Layout.Buildings.map((Building) =>
    // 📝 Voxel 0.5 m: the distance volumes stack in one atlas of 2048 slices, and the buildings are the bulk of the city's slices.
    [`CityBuilding${Building.Id}`, { Emit: () => EmitBuildingFacets(Building), Voxel: 0.5, Cards: 8 }]));

export const LevelShapes = Object.freeze({
    Kerb:          { Emit: () => EmitBoxFacets(KerbConstants.SegmentLength, KerbConstants.Depth, KerbConstants.Height, CourseMaterial.KerbRed), Voxel: 0.04, Cards: 16 },
    Ramp:          { Emit: () => EmitRampFacets(), Voxel: 0.12, Cards: 20 },
    Cone:          { Emit: () => EmitConeFacets(), Voxel: 0.02, Cards: 24 },
    Jersey:        { Emit: () => EmitExtrusionFacets(JerseyProfile, 2.0, CourseMaterial.BarrierConcrete), Voxel: 0.05, Cards: 14 },
    CityRubble:    { Emit: () => EmitRubbleFacets(), Voxel: 0.08, Cards: 10 },
    CityOvergrowth: { Emit: () => EmitOvergrowthFacets(), Voxel: 0.1, Cards: 0, Distance: false },
    ...BuildingShapes
});

//------------------------------------------------------------------------------------------------------------------------
//                                                       PLACEMENTS
//------------------------------------------------------------------------------------------------------------------------

export function ResolveLevelPlacements()
{
    const List = [];
    const Place = (Shape, Name, X, Y, Z = 0.0, Yaw = 0.0, Collider = false) =>
        List.push({ Shape, Name, Position: [X, Y, Z], Yaw, Material: -1, Collider });

    // ① Boundary Jersey barriers, as the proving grounds: the pad is [-60..156] × [-60..60]; the barrier runs on [-58.5..154.5].
    for (let X = -58.0; X <= 154.0; X += 4.0)
    {
        Place("Jersey", `Boundary North ${X.toFixed(0)}`, X, 58.5, 0.0, 0.0, true);
        Place("Jersey", `Boundary South ${X.toFixed(0)}`, X, -58.5, 0.0, 0.0, true);
    }
    for (let Y = -54.0; Y <= 54.0; Y += 4.0)
    {
        Place("Jersey", `Boundary West ${Y.toFixed(0)}`, -58.5, Y, 0.0, 90.0 * Degrees, true);
        Place("Jersey", `Boundary East ${Y.toFixed(0)}`, 154.5, Y, 0.0, 90.0 * Degrees, true);
    }

    // ② The avenue kerbs and the rubble ramp: shared with the proving grounds through CourseStructure.
    KerbConstants.Strips.forEach(([X0, X1, Y0, Y1], Strip) =>
    {
        const Segments = Math.round((X1 - X0) / KerbConstants.SegmentLength);
        for (let Segment = 0; Segment < Segments; ++Segment)
            List.push({ Shape: "Kerb", Name: `Kerb ${Strip ? "south" : "north"} ${Segment}`,
                        Position: [X0 + (Segment + 0.5) * KerbConstants.SegmentLength, 0.5 * (Y0 + Y1), 0.0], Yaw: 0.0,
                        Material: (Segment & 1) ? CourseMaterial.PaintWhite : CourseMaterial.KerbRed, Collider: false });
    });
    Place("Ramp", "Jump ramp", 0.0, 0.0);

    // ③ The buildings: each one a single closed shell, a collider by its bounding box.
    for (const Building of Layout.Buildings)
    {
        const B = Building.Base;
        Place(`CityBuilding${Building.Id}`, `Building ${Building.Id}`, 0.5 * (B.X0 + B.X1), 0.5 * (B.Y0 + B.Y1), 0.0, 0.0, true);
    }

    // ④ Garden lots: broken trees and rubble heaps. The trees are raster-only overgrowth.
    for (const Plot of Layout.Empty)
    {
        Plot.Trees.forEach((Tree, Index) => Place("CityOvergrowth", `Tree ${Plot.Lot.X0.toFixed(0)},${Plot.Lot.Y0.toFixed(0)} ${Index}`, Tree.X, Tree.Y, 0.0, Tree.Yaw));
        if (Plot.Rubble)
            Place("CityRubble", `Rubble ${Plot.Lot.X0.toFixed(0)},${Plot.Lot.Y0.toFixed(0)}`, Plot.Rubble.X, Plot.Rubble.Y, 0.0, Plot.Rubble.Yaw, true);
    }

    // ⑤ Overgrowth on the flat roofs, inside each top tier's edge.
    for (const Building of Layout.Buildings)
        Building.Roof.forEach((Tree, Index) => Place("CityOvergrowth", `Roof tree ${Building.Id} ${Index}`, Tree.X, Tree.Y, Tree.Z, 0.0));

    return List;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                          CONES
//------------------------------------------------------------------------------------------------------------------------

// 📝 Roadworks: a ring of cones around a pothole cluster on the avenue. The only cones in the city.
export function ResolveConePlacements()
{
    const List = [];
    const Work = CityConstants.Roadworks;
    for (let Index = 0; Index < Work.Cones; ++Index)
    {
        const Angle = 2.0 * Math.PI * Index / Work.Cones;
        const X = Work.X + Work.Radius * Math.cos(Angle), Y = Work.Y + Work.Radius * Math.sin(Angle);
        List.push({ Name: `Cone roadworks ${Index}`, Position: [X, Y], Yaw: Angle, Group: "roadworks" });
    }
    return List;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      BREAKABLE PROPS
//------------------------------------------------------------------------------------------------------------------------

// 📝 Four props in the garden lots that have no building: a pane, a block, a crate, and a wall section.
export function ResolveBreakables()
{
    const Approach = [-1.0, 0.0, 0.0];
    const Crate = { Kind: "box", Extent: [0.9, 0.9, 0.9] };
    const Pane = { Kind: "box", Extent: [3.4, 0.05, 2.0] };
    const Block = { Kind: "box", Extent: [1.2, 0.6, 0.8] };
    const Wall = { Kind: "box", Extent: [3.6, 0.5, 1.2] };
    const Kinds = [
        { Name: "Garden pane",   Shape: Pane,  Material: "glass",    Options: { Capacity: 48 } },
        { Name: "Concrete block", Shape: Block, Material: "concrete", Options: { Capacity: 40 } },
        { Name: "Wooden crate",  Shape: Crate, Material: "wood",     Options: { DensityScale: 0.32, Capacity: 32 } },
        { Name: "Stone wall",    Shape: Wall,  Material: "rock",     Options: { Capacity: 40 } }
    ];
    return Layout.Breakables.map((Breakable) =>
    {
        const Kind = Kinds[Breakable.Index];
        const L = Breakable.Lot;
        return { Name: `${Kind.Name} ${Breakable.Index + 1}`, Shape: Kind.Shape, Material: Kind.Material,
                 Position: [0.5 * (L.X0 + L.X1), 0.5 * (L.Y0 + L.Y1), 0.0], Yaw: Breakable.Yaw,
                 Approach, Capacity: Kind.Options.Capacity || 40, DensityScale: Kind.Options.DensityScale || 1.0,
                 Mode: "dynamic", Energy: 6000 };
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    GROUND AND WATER
//------------------------------------------------------------------------------------------------------------------------

// 📝 The city's ground, raster only: 4 m cells of asphalt (cracked on some), concrete pavement, lots of dead grass, broken paving,
//    grass tufts and the cracks, potholes and pools; the flood sheet covers everything outside the pad. Pads and roads are
//    flat at height zero, as CourseStructure's terrain expects.
export function EmitLevelGroundFacets()
{
    const C = CourseConstants;
    const Facets = [];
    const Outer = 240.0;
    const CentreX = 0.5 * (C.PadMinimum[0] + C.PadMaximum[0]);
    const PadX0 = C.PadMinimum[0], PadY0 = C.PadMinimum[1], PadX1 = C.PadMaximum[0], PadY1 = C.PadMaximum[1];
    const Up = [0.0, 0.0, 1.0];

    // ① the grass beyond the pad, and the flood sheet over it (dark, below the pad's top)
    EmitOutwardQuad(Facets, [[CentreX - Outer, -Outer, C.SurroundHeight], [CentreX + Outer, -Outer, C.SurroundHeight],
                             [CentreX + Outer, Outer, C.SurroundHeight], [CentreX - Outer, Outer, C.SurroundHeight]], Up, CourseMaterial.Grass);
    const Sheet = (X0, Y0, X1, Y1) => EmitOutwardQuad(Facets, [[X0, Y0, -0.012], [X1, Y0, -0.012], [X1, Y1, -0.012], [X0, Y1, -0.012]],
                                                      Up, CourseMaterial.FloodWater);
    Sheet(CentreX - Outer, PadY1, CentreX + Outer, Outer);
    Sheet(CentreX - Outer, -Outer, CentreX + Outer, PadY0);
    Sheet(CentreX - Outer, PadY0, PadX0, PadY1);
    Sheet(PadX1, PadY0, CentreX + Outer, PadY1);

    // ② the pad: one family per cell, from where the cell is and a hash of its index
    const CellsX = Math.round((PadX1 - PadX0) / C.GroundCell), CellsY = Math.round((PadY1 - PadY0) / C.GroundCell);
    const Blocks = ResolveBlocks();
    const InBlock = (X, Y) => Blocks.find(([X0, X1, Y0, Y1]) => X >= X0 && X <= X1 && Y >= Y0 && Y <= Y1);
    const Margin = 2.2;
    for (let Row = 0; Row < CellsX; ++Row)
    {
        for (let Column = 0; Column < CellsY; ++Column)
        {
            const X0 = PadX0 + Row * C.GroundCell, X1 = X0 + C.GroundCell;
            const Y0 = PadY0 + Column * C.GroundCell, Y1 = Y0 + C.GroundCell;
            const Cx = 0.5 * (X0 + X1), Cy = 0.5 * (Y0 + Y1);
            const Hash = CellHash(Row, Column, CityConstants.Seed);
            let Family;
            if (IsRoad(Cx, Cy))
                Family = Hash < 0.45 ? CourseMaterial.AsphaltCracked : CourseMaterial.Asphalt;
            else if (InBlock(Cx, Cy))
            {
                const [BX0, BX1, BY0, BY1] = InBlock(Cx, Cy);
                const Inner = Cx > BX0 + Margin && Cx < BX1 - Margin && Cy > BY0 + Margin && Cy < BY1 - Margin;
                Family = !Inner ? CourseMaterial.ApronConcrete
                       : Hash < 0.25 ? CourseMaterial.ApronConcrete
                       : Hash < 0.6 ? CourseMaterial.GrassDry : CourseMaterial.Grass;
            }
            else
                Family = CourseMaterial.Asphalt;
            EmitQuad(Facets, [X0, Y0, 0.0], [X1, Y0, 0.0], [X1, Y1, 0.0], [X0, Y1, 0.0], Family);
        }
    }

    // ③ worn centre dashes on the avenue (some missing), the paint lifted above the tarmac
    const PaintQuad = (X0, Y0, X1, Y1, Family) => EmitOutwardQuad(Facets, [[X0, Y0, PaintLift], [X1, Y0, PaintLift], [X1, Y1, PaintLift],
                                                                       [X0, Y1, PaintLift]], Up, Family);
    for (let X = -50.0, Index = 0; X < 150.0; X += 6.0, ++Index)
        if (CellHash(Index, 9, 3) > 0.3)
            PaintQuad(X, -0.08, X + 3.2, 0.08, CourseMaterial.PaintYellow);

    // ④ cracks: thin dark zigzags along the roads
    for (const Crack of Layout.Cracks)
    {
        for (let Index = 0; Index + 1 < Crack.Points.length; ++Index)
        {
            const [X0, Y0] = Crack.Points[Index], [X1, Y1] = Crack.Points[Index + 1];
            const Length = Math.hypot(X1 - X0, Y1 - Y0) || 1.0;
            const Nx = -(Y1 - Y0) / Length * 0.5 * Crack.Width, Ny = (X1 - X0) / Length * 0.5 * Crack.Width;
            const Z = 0.005;
            EmitOutwardQuad(Facets, [[X0 + Nx, Y0 + Ny, Z], [X1 + Nx, Y1 + Ny, Z], [X1 - Nx, Y1 - Ny, Z], [X0 - Nx, Y0 - Ny, Z]],
                            Up, CourseMaterial.Pothole);
        }
    }

    // ⑤ potholes: dark floors, ragged rims; the flooded ones carry a pool of standing water
    for (const Hole of Layout.Potholes)
    {
        const Rim = (Angle) => Hole.R * (0.85 + 0.15 * CellHash(Math.round(Hole.X * 10), Math.round(Angle * 10), 17));
        EmitFlatFan(Facets, Hole.X, Hole.Y, 0.006, Rim, CourseMaterial.Pothole, 10);
        if (Hole.Pool)
            EmitFlatFan(Facets, Hole.X, Hole.Y, 0.009, (Angle) => 0.78 * Rim(Angle), CourseMaterial.FloodWater, 10);
    }

    // ⑥ dips in the road: a floor and a pool over it
    for (const Dip of Layout.Dips)
    {
        const Ellipse = (Angle) => 1.0 / Math.hypot(Math.cos(Angle - Dip.Yaw) / Dip.Rx, Math.sin(Angle - Dip.Yaw) / Dip.Ry);
        EmitFlatFan(Facets, Dip.X, Dip.Y, 0.006, Ellipse, CourseMaterial.Pothole, 16);
        EmitFlatFan(Facets, Dip.X, Dip.Y, 0.009, (Angle) => 0.8 * Ellipse(Angle), CourseMaterial.FloodWater, 16);
    }

    // ⑦ broken grass: ragged clumps in the lots
    for (const Tuft of Layout.Tufts)
    {
        const Family = CellHash(Math.round(Tuft.X * 7), Math.round(Tuft.Y * 7), 29) < 0.5 ? CourseMaterial.Grass : CourseMaterial.GrassDry;
        EmitFlatFan(Facets, Tuft.X, Tuft.Y, 0.003, (Angle) => Tuft.Size * (0.55 + 0.45 * CellHash(Math.round(Angle * 20), 3, Tuft.X)), Family, 6);
    }

    return Facets;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   DRILLS AND ZONES
//------------------------------------------------------------------------------------------------------------------------

// 📝 No timed drill stations in the city: the proving grounds' drills are its own track (see LevelStructure.js).
export const TrainingDrills = Object.freeze([]);

// 📝 The zones teleport onto the avenue: a building's frontage (kept off the ramp), the cracked cross street, the flood.
const Frontage = Layout.Buildings.find((Building) => Building.Ivy.length > 0 && Building.Roof.length > 0
                                                   && (0.5 * (Building.Base.X0 + Building.Base.X1)) < 15.0) || Layout.Buildings[0];
const Flooded = Layout.Dips[0] || Layout.Potholes.find((Hole) => Hole.Pool);

export const ArenaZones = Object.freeze([
    { Name: "Avenue",          Position: [SpawnPoint.Position[0], SpawnPoint.Position[1]], Yaw: 0.0,  Note: "Start of the avenue" },
    { Name: "Crossroads",      Position: [-24.0, 0.0],                                     Yaw: 0.0,  Note: "Cracked cross street" },
    { Name: "Overgrown block", Position: [0.5 * (Frontage.Base.X0 + Frontage.Base.X1), 0.0], Yaw: 90.0, Note: "Ivy, broken glass, rooftop trees" },
    { Name: "Flood",           Position: [Flooded.X, Flooded.Y],                           Yaw: 0.0,  Note: "Standing water" }
]);

// 📝 Rectangles [MinimumX, MinimumY, MaximumX, MaximumY] the stress scatter must not touch: the avenue and every block.
export const LevelClearZones = Object.freeze([
    [-60.0, -9.0, 156.0, 9.0],
    ...ResolveBlocks().map(([X0, X1, Y0, Y1]) => [X0, Y0, X1, Y1])
]);

export { SpawnPoint };
