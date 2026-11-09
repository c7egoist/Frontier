//============================================================================================================================================
//                                                          CITYLEVELLAYOUT.JS
//============================================================================================================================================
// 🧩 The abandoned city's layout: one seeded, deterministic description of roads, lots, buildings, potholes, cracks, broken grass,
//    flood pools and overgrowth. Pure data — no GPU, no DOM — so the geometry (CityLevelStructure.js) and the Node tests read one truth.

// 📝 mulberry32: a small, fast, well-mixed 32-bit generator. The same seed gives the same city on every machine.
export function CreateRandom(Seed)
{
    let State = Seed >>> 0;
    return () =>
    {
        State = (State + 0x6D2B79F5) >>> 0;
        let Mixed = State;
        Mixed = Math.imul(Mixed ^ (Mixed >>> 15), Mixed | 1);
        Mixed ^= Mixed + Math.imul(Mixed ^ (Mixed >>> 7), Mixed | 61);
        return ((Mixed ^ (Mixed >>> 14)) >>> 0) / 4294967296;
    };
}

// 📝 Metres, +X along the avenue, +Y left, +Z up (as the proving grounds). The city sits on the same 216 × 120 m pad and keeps
//    the avenue kerbs and the rubble ramp of CourseStructure.js; everything else here is the city's own.
export const CityConstants = Object.freeze({
    Seed:            55,
    FloorHeight:     3.2,     // [m] storey pitch
    WindowSill:      0.9,     // [m] sill above the floor
    WindowHeight:    1.6,     // [m]
    WindowWidth:     1.4,     // [m]
    WindowPitch:     3.2,     // [m] column spacing along a face
    WindowMargin:    0.6,     // [m] clear wall at each end of a face
    StainBand:       1.1,     // [m] damp, darker lower band of every wall
    IvyHeight:       6.0,     // [m] ivy climbs the lower two storeys
    EmptyChance:     0.22,    // [-] a lot left as garden instead of a building
    LotLength:       13.0,    // [m] target lot width along a block
    Avenue:          Object.freeze([-58.0, 154.0, -6.0, 6.0]),      // [x₀, x₁, y₀, y₁] the driven road between the kerbs
    CrossStreets:    Object.freeze([Object.freeze([-30.0, -18.0]), Object.freeze([40.0, 52.0]), Object.freeze([100.0, 112.0])]),
    BlockX:          Object.freeze([Object.freeze([-56.0, -32.0]), Object.freeze([-16.0, 36.0]), Object.freeze([56.0, 96.0]),
                                    Object.freeze([116.0, 152.0])]),
    BlockY:          Object.freeze([Object.freeze([8.0, 56.0]), Object.freeze([-56.0, -8.0])]),
    Roadworks:       Object.freeze({ X: 80.0, Y: -3.0, Radius: 3.2, Cones: 8 }),
    Spawn:           Object.freeze({ X0: -48.0, X1: -32.0 })          // [m] keep potholes off the grid box
});

// 📝 Every block as a rectangle [X0, X1, Y0, Y1].
export function ResolveBlocks()
{
    const Blocks = [];
    for (const [X0, X1] of CityConstants.BlockX)
        for (const [Y0, Y1] of CityConstants.BlockY)
            Blocks.push([X0, X1, Y0, Y1]);
    return Blocks;
}

// 📝 Is (X, Y) on a road? The avenue or one of the cross streets (which run the full pad north–south).
export function IsRoad(X, Y)
{
    const [AX0, AX1, AY0, AY1] = CityConstants.Avenue;
    if (X >= AX0 && X <= AX1 && Y >= AY0 && Y <= AY1)
        return true;
    return CityConstants.CrossStreets.some(([X0, X1]) => X >= X0 && X <= X1 && Y >= -58.0 && Y <= 58.0);
}

// 📝 A building's ground plan (base tier, plus an optional smaller upper tier stacked on it) with the windows and ivy it carries.
//    Faces are named '+X', '-X', '+Y', '-Y'. A window or ivy span is [A0, A1] along its face (X for ±Y faces, Y for ±X faces).
function GenerateBuilding(Random, Id, Lot)
{
    const Between = (Low, High) => Low + (High - Low) * Random();
    const K = CityConstants;

    const Inset = () => Between(1.5, 3.0);
    let X0 = Lot.X0 + Inset(), X1 = Lot.X1 - Inset(), Y0 = Lot.Y0 + Inset(), Y1 = Lot.Y1 - Inset();
    if (X1 - X0 < 7.0) { const Mid = 0.5 * (X0 + X1); X0 = Mid - 3.5; X1 = Mid + 3.5; }
    if (Y1 - Y0 < 7.0) { const Mid = 0.5 * (Y0 + Y1); Y0 = Mid - 3.5; Y1 = Mid + 3.5; }

    const BaseFloors = [2, 3, 3, 4][Math.floor(Random() * 4)];
    const Base = { X0, X1, Y0, Y1, H: BaseFloors * K.FloorHeight };
    const Broken = Random() < 0.4;   // a building whose windows were broken more thoroughly

    let Upper = null;
    if (Random() < 0.55)
    {
        const Setback = () => Between(1.2, 2.2);
        const UpperFloors = Random() < 0.5 ? 1 : 2;
        Upper = { X0: X0 + Setback(), X1: X1 - Setback(), Y0: Y0 + Setback(), Y1: Y1 - Setback(), H: UpperFloors * K.FloorHeight, Base: Base.H };
        if (Upper.X1 - Upper.X0 < 3.5 || Upper.Y1 - Upper.Y0 < 3.5)
            Upper = null;
    }

    const Windows = [];
    const Tiers = Upper ? [{ Name: "base", Box: Base, Z0: 0.0, Z1: Base.H }, { Name: "upper", Box: Upper, Z0: Base.H, Z1: Base.H + Upper.H }]
                        : [{ Name: "base", Box: Base, Z0: 0.0, Z1: Base.H }];
    for (const Tier of Tiers)
    {
        const B = Tier.Box;
        const Faces = [
            { Name: "+X", Along: [B.Y0, B.Y1] }, { Name: "-X", Along: [B.Y0, B.Y1] },
            { Name: "+Y", Along: [B.X0, B.X1] }, { Name: "-Y", Along: [B.X0, B.X1] }
        ];
        for (const Face of Faces)
        {
            const [A0, A1] = Face.Along;
            const Columns = [];
            for (let S = A0 + K.WindowMargin; S + K.WindowWidth <= A1 - K.WindowMargin + 1e-9; S += K.WindowPitch)
                Columns.push(S);
            const Kept = Columns.filter(() => Random() > 0.12);
            for (let Floor = 0; (Floor + 1) * K.FloorHeight <= Tier.Z1 - Tier.Z0 + 1e-9; ++Floor)
            {
                const Z0 = Tier.Z0 + Floor * K.FloorHeight + K.WindowSill;
                const Z1 = Z0 + K.WindowHeight;
                if (Z1 > Tier.Z1 - 0.4)
                    continue;
                for (const S of Kept)
                {
                    // 📝 Three states: intact glass, cracked (one triangle of the pane is shattered), or void (the pane is gone).
                    const Shattered = Random() < (Broken ? 0.6 : 0.3);
                    const Void = Shattered && Random() < 0.6;
                    const Cracked = !Void && (Shattered || Random() < 0.12);
                    Windows.push({ Face: Face.Name, Tier: Tier.Name, A0: S, A1: S + K.WindowWidth, Z0, Z1, Broken: Void, Cracked });
                }
            }
        }
    }

    // 📝 Ivy climbs the pier between two windows on one or two lower faces (never across glass).
    const Ivy = [];
    for (const Face of ["+X", "-X", "+Y", "-Y"])
    {
        if (Random() > 0.45)
            continue;
        const Here = Windows.filter((W) => W.Face === Face && W.Tier === "base" && W.Z0 < K.WindowSill + K.FloorHeight);
        const Starts = [...new Set(Here.map((W) => W.A0))].sort((A, B) => A - B);
        if (Starts.length < 2)
            continue;
        const Pier = Math.floor(Random() * (Starts.length - 1));
        Ivy.push({ Face, A0: Starts[Pier] + K.WindowWidth, A1: Starts[Pier + 1], Top: K.IvyHeight });
    }

    // 📝 Rooftop trees: the overgrowth that took the flat roofs. Placed on the top tier, inside its edge.
    const Top = Upper || Base;
    const Roof = [];
    if (Random() < 0.6)
    {
        const Count = 1 + Math.floor(Random() * 2);
        for (let Index = 0; Index < Count; ++Index)
            Roof.push({ X: Between(Top.X0 + 1.6, Top.X1 - 1.6), Y: Between(Top.Y0 + 1.6, Top.Y1 - 1.6), Z: Upper ? Base.H + Upper.H : Base.H });
    }

    return { Id, Lot, Base, Upper, Windows, Ivy, Roof, Broken };
}

// 📝 Overgrowth, potholes, cracks and grass in and around the lots. Pure data; positions are decided, not drawn, by the renderer.
export function GenerateCityLayout(Seed = CityConstants.Seed)
{
    const Random = CreateRandom(Seed);
    const Between = (Low, High) => Low + (High - Low) * Random();
    const K = CityConstants;

    const Buildings = [];
    const Empty = [];
    const Lots = [];
    for (const [X0, X1, Y0, Y1] of ResolveBlocks())
    {
        const Columns = Math.max(1, Math.round((X1 - X0) / K.LotLength));
        const Rows = 2;
        const LotWidth = (X1 - X0) / Columns, LotDepth = (Y1 - Y0) / Rows;
        for (let Column = 0; Column < Columns; ++Column)
        {
            for (let Row = 0; Row < Rows; ++Row)
            {
                const Lot = { X0: X0 + Column * LotWidth, X1: X0 + (Column + 1) * LotWidth, Y0: Y0 + Row * LotDepth, Y1: Y0 + (Row + 1) * LotDepth };
                Lots.push(Lot);
                if (Random() < K.EmptyChance)
                {
                    Empty.push({ Lot, Trees: [], Rubble: null, Breakable: null });
                    continue;
                }
                Buildings.push(GenerateBuilding(Random, `B${String(Buildings.length).padStart(2, "0")}`, Lot));
            }
        }
    }

    // 📝 Garden lots: trees at the corners, a rubble heap at an edge, and (for the first few) a breakable prop at the centre.
    const Breakables = [];
    for (const Plot of Empty)
    {
        const L = Plot.Lot;
        for (const [FX, FY] of [[0.12, 0.12], [0.88, 0.88], [0.88, 0.12], [0.12, 0.88]])
        {
            if (Random() < 0.5)
                Plot.Trees.push({ X: L.X0 + FX * (L.X1 - L.X0), Y: L.Y0 + FY * (L.Y1 - L.Y0), Yaw: Between(0, 2 * Math.PI) });
        }
        if (Random() < 0.6)
            Plot.Rubble = { X: L.X0 + 0.5 * (L.X1 - L.X0) + Between(-2.0, 2.0), Y: L.Y0 + 1.2, Yaw: Between(0, Math.PI) };
        if (Breakables.length < 4 && Random() < 0.75)
        {
            Plot.Breakable = Breakables.length;
            Breakables.push({ Lot: L, Index: Breakables.length, Yaw: Between(-0.3, 0.3) });
        }
    }

    // 📝 Broken grass: a scatter of tufts inside the garden lots, off any building.
    const Tufts = [];
    for (const Lot of Lots)
    {
        for (let Tuft = 0; Tuft < 4; ++Tuft)
        {
            const X = Between(Lot.X0 + 0.8, Lot.X1 - 0.8), Y = Between(Lot.Y0 + 0.8, Lot.Y1 - 0.8);
            const Clear = !Buildings.some((B) => B.Lot === Lot && X > B.Base.X0 - 0.5 && X < B.Base.X1 + 0.5 && Y > B.Base.Y0 - 0.5 && Y < B.Base.Y1 + 0.5);
            if (Clear)
                Tufts.push({ X, Y, Yaw: Between(0, 2 * Math.PI), Size: Between(0.5, 1.1) });
        }
    }

    // 📝 Potholes on the roads, some of them standing in water. Cracks: short zigzags along each road.
    const Potholes = [];
    const RoadPoint = () =>
    {
        const OnAvenue = Random() < 0.6;
        if (OnAvenue)
            return [Between(-56.0, 150.0), Between(-5.0, 5.0)];
        const [X0, X1] = K.CrossStreets[Math.floor(Random() * K.CrossStreets.length)];
        return [Between(X0 + 1.0, X1 - 1.0), Between(-54.0, 54.0)];
    };
    while (Potholes.length < 42)
    {
        const [X, Y] = RoadPoint();
        if (X > K.Spawn.X0 && X < K.Spawn.X1 && Math.abs(Y) < 4.0)
            continue;
        if (X > 20.0 && X < 30.0 && Math.abs(Y) < 4.0)   // the rubble ramp
            continue;
        if (Math.hypot(X - K.Roadworks.X, Y - K.Roadworks.Y) < K.Roadworks.Radius + 2.0)
            continue;
        Potholes.push({ X, Y, R: Between(0.45, 1.25), Pool: Random() < 0.35 });
    }

    const Cracks = [];
    for (let Index = 0; Index < 64; ++Index)
    {
        let [X, Y] = RoadPoint();
        const Along = Math.abs(Y) < 6.5 && X > -58.0 && X < 154.0 ? [1.0, 0.0] : [0.0, 1.0];
        const Points = [[X, Y]];
        const Steps = 2 + Math.floor(Random() * 3);
        for (let Step = 0; Step < Steps; ++Step)
        {
            const Length = Between(1.2, 2.8), Wander = Between(-0.7, 0.7);
            X += (Along[0] * Length) + Wander * Along[1] * Length;
            Y += (Along[1] * Length) + Wander * Along[0] * Length;
            Points.push([X, Y]);
        }
        Cracks.push({ Points, Width: Between(0.05, 0.09) });
    }

    // 📝 Dips in the tarmac where water stands on dry days: in the road, not in a lot.
    const Dips = [];
    for (let Index = 0; Index < 5; ++Index)
    {
        const [X, Y] = RoadPoint();
        if (X > K.Spawn.X0 && X < K.Spawn.X1 && Math.abs(Y) < 4.0)
            continue;
        if (X > 20.0 && X < 30.0 && Math.abs(Y) < 4.0)
            continue;
        Dips.push({ X, Y, Rx: Between(2.0, 3.6), Ry: Between(1.2, 2.2), Yaw: Between(0.0, Math.PI) });
    }

    return { Seed, Lots, Buildings, Empty, Breakables, Tufts, Potholes, Cracks, Dips, Roadworks: K.Roadworks };
}
