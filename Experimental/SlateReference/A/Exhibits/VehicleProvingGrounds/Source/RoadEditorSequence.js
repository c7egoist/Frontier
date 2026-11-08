//============================================================================================================================================
//                                                        ROADEDITORSEQUENCE.JS
//============================================================================================================================================
// 🧩 Live Cubic Bézier Spline Road Editor & Sun-UI-Styled Interactive Spline Instrument for VehicleProvingGrounds / VehicleHMI:
//    - Real-time GPU VertexRecords streaming + 480 Hz VehicleSolver & SweepSpark surface rebuilds (< 1 ms per edit!)
//    - Interactive Select / Draw / Split / Delete tools with draggable junction nodes & cubic Bézier tangent handles (H1, H2)
//    - Pre-authored Track / Interchange templates (Cloverleaf, Trumpet Flyover, Roundabout, Banked S-Curve) + JSON Export/Import

import {
    CreateDefaultSplineProject,
    CreateRoadNode,
    CreateSplineRoad,
    ResolveRoadControlPoints,
    QueryClosestOnRoad,
    AutoSmoothNodeTangents,
    SplitSplineRoadAt,
    DeleteSelectionFromProject,
    BuildSplineNetworkGeometry,
    RoadPresetTemplates
} from "./RoadSplineBuilder.js";
import { CrossVector, NormalizeVector, SubtractVector } from "./TransformProjection.js";

const VertexStrideBytes = 32;
export const RoadEditorVertexCapacity = 196608; // 65,536 triangles (~6.2 MB GPU vertex pool)
const LocalStoragePrefix = "Frontier.VehicleProvingGrounds.SplineRoads.v1.";

function CloneProject(Project)
{
    return JSON.parse(JSON.stringify(Project));
}

export class RoadEditorSequence
{
    constructor(Scene, LevelKey = "inversion")
    {
        this.Scene               = Scene;
        this.LevelKey            = LevelKey;
        this.Enabled             = true;
        this.ToolMode            = "select";    // "select" | "draw" | "split" | "delete"
        this.SnapEnabled         = true;
        this.ViewportPickEnabled = false;
        this.NewRoadStyle        = "motorway";  // "motorway" | "race" | "urban" | "bridge"
        this.NewRoadWidth        = 11.0;

        this.Project             = this.LoadInitialProject(LevelKey);
        this.Selection           = this.Project.Roads[0]
            ? { Kind: "road", Id: this.Project.Roads[0].Id }
            : (this.Project.Nodes[0] ? { Kind: "node", Id: this.Project.Nodes[0].Id } : null);

        this.DrawChainNodeId     = null;
        this.HoverWorld          = null;
        this.UndoStack           = [];
        this.RedoStack           = [];

        this.Alignments          = [];
        this.PhysicsSurface      = null;
        this.BaseSurfaces        = [];
        this.Host                = null;

        // Interactive 2D Spline Instrument View State (centered on the starter network)
        this.ViewCenter          = LevelKey === "inversion" ? [164.0, 406.0] : [116.0, -36.0];
        this.ViewHalfSpan        = 68.0; // [m]
        this.FloatingOpen        = false;

        this.RebuildNetwork(null, null);
    }

    LoadInitialProject(LevelKey)
    {
        try
        {
            if (typeof localStorage !== "undefined")
            {
                const Saved = localStorage.getItem(LocalStoragePrefix + LevelKey);
                if (Saved)
                {
                    const Parsed = JSON.parse(Saved);
                    if (Parsed && Array.isArray(Parsed.Nodes) && Array.isArray(Parsed.Roads))
                        return Parsed;
                }
            }
        }
        catch
        {
            // Ignore storage errors in headless/private environments
        }
        return CreateDefaultSplineProject(LevelKey);
    }

    PersistProject()
    {
        try
        {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(LocalStoragePrefix + this.LevelKey, JSON.stringify(this.Project));
        }
        catch
        {
            // Ignore storage quota errors
        }
    }

    AttachHost(Host)
    {
        this.Host = Host;
        this.BaseSurfaces = (Host.LevelDescriptor?.Surfaces || []).slice();
        this.SyncHostSystems();
    }

    PushUndoSnapshot()
    {
        this.UndoStack.push(JSON.stringify(this.Project));
        if (this.UndoStack.length > 32)
            this.UndoStack.shift();
        this.RedoStack.length = 0;
    }

    Undo()
    {
        if (this.UndoStack.length === 0)
            return false;
        this.RedoStack.push(JSON.stringify(this.Project));
        this.Project = JSON.parse(this.UndoStack.pop());
        this.ValidateSelection();
        this.CommitChanges("Undo spline edit");
        return true;
    }

    Redo()
    {
        if (this.RedoStack.length === 0)
            return false;
        this.UndoStack.push(JSON.stringify(this.Project));
        this.Project = JSON.parse(this.RedoStack.pop());
        this.ValidateSelection();
        this.CommitChanges("Redo spline edit");
        return true;
    }

    ResetToDefault()
    {
        this.PushUndoSnapshot();
        this.Project = CreateDefaultSplineProject(this.LevelKey);
        this.DrawChainNodeId = null;
        this.ValidateSelection();
        this.FitViewToNetwork();
        this.CommitChanges("Spline road network reset to default");
    }

    ClearAllRoads()
    {
        this.PushUndoSnapshot();
        this.Project = { Nodes: [], Roads: [] };
        this.Selection = null;
        this.DrawChainNodeId = null;
        this.CommitChanges("Cleared custom spline roads");
    }

    ValidateSelection()
    {
        if (!this.Selection)
            return;
        if (this.Selection.Kind === "road" && !this.Project.Roads.some((R) => R.Id === this.Selection.Id))
            this.Selection = this.Project.Roads[0] ? { Kind: "road", Id: this.Project.Roads[0].Id } : null;
        else if (this.Selection.Kind === "node" && !this.Project.Nodes.some((N) => N.Id === this.Selection.Id))
            this.Selection = this.Project.Nodes[0] ? { Kind: "node", Id: this.Project.Nodes[0].Id } : null;
    }

    GetSelectedRoad()
    {
        if (this.Selection?.Kind === "road")
            return this.Project.Roads.find((R) => R.Id === this.Selection.Id) || null;
        if (this.Selection?.Kind === "node")
            return this.Project.Roads.find((R) => R.Start === this.Selection.Id || R.End === this.Selection.Id) || null;
        return this.Project.Roads[0] || null;
    }

    GetSelectedNode()
    {
        if (this.Selection?.Kind === "node")
            return this.Project.Nodes.find((N) => N.Id === this.Selection.Id) || null;
        const Road = this.GetSelectedRoad();
        if (Road)
            return this.Project.Nodes.find((N) => N.Id === Road.End) || null;
        return this.Project.Nodes[0] || null;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                    GPU STREAMING & LIVE 480 HZ PHYSICS SYNC
    //--------------------------------------------------------------------------------------------------------------------

    CommitChanges(Notice = null)
    {
        const Device = this.Host?.Exchange?.Device || null;
        const VertexRecords = this.Host?.VertexRecords || null;
        this.RebuildNetwork(Device, VertexRecords);
        this.SyncHostSystems();
        this.PersistProject();
        if (Notice && this.Host?.Shell)
            this.Host.Shell.Announce(Notice);
        this.Host?.Shell?.Controls?.Synchronise();
    }

    RebuildNetwork(Device = null, VertexRecords = null)
    {
        const Built = this.Enabled
            ? BuildSplineNetworkGeometry(this.Project)
            : { Facets: [], Alignments: [], PhysicsSurface: null };

        this.Alignments     = Built.Alignments;
        this.PhysicsSurface = Built.PhysicsSurface;

        const Block = this.Scene?.RoadEditorBlock;
        if (!Block)
            return;
        const Set = this.Scene.FacetSets[Block.FacetSet];
        const Capacity = Set.VertexCapacity || RoadEditorVertexCapacity;
        const MaxTris = Math.min(Built.Facets.length, Math.floor(Capacity / 3));
        const ClampedFacets = Built.Facets.slice(0, MaxTris);
        const VertexCount = ClampedFacets.length * 3;

        Set.Facets = ClampedFacets;
        Set.VertexCount = VertexCount;

        if (Device && VertexRecords)
        {
            const Bytes = new ArrayBuffer(Math.max(1, VertexCount) * VertexStrideBytes);
            const Scalars = new Float32Array(Bytes);
            const Integers = new Uint32Array(Bytes);
            let Cursor = 0;
            for (let Index = 0; Index < ClampedFacets.length; ++Index)
            {
                const Facet = ClampedFacets[Index];
                const [A, B, C] = Facet.Corners;
                const Normal = NormalizeVector(CrossVector(SubtractVector(B, A), SubtractVector(C, A)));
                for (const Corner of [A, B, C])
                {
                    const Off = Cursor * 8;
                    Scalars[Off + 0]  = Corner[0];
                    Scalars[Off + 1]  = Corner[1];
                    Scalars[Off + 2]  = Corner[2];
                    Integers[Off + 3] = Facet.Family;
                    Scalars[Off + 4]  = Normal[0];
                    Scalars[Off + 5]  = Normal[1];
                    Scalars[Off + 6]  = Normal[2];
                    Integers[Off + 7] = 0;
                    ++Cursor;
                }
            }
            if (VertexCount > 0)
                Device.queue.writeBuffer(VertexRecords, Set.FirstVertex * VertexStrideBytes, Bytes, 0, VertexCount * VertexStrideBytes);
            this.Host.PriorValid = false;
        }
    }

    SyncHostSystems()
    {
        if (!this.Host)
            return;
        // ① Live 480 Hz VehicleSolver & SweepSpark surface array!
        if (this.Host.Vehicle)
        {
            this.Host.Vehicle.Surfaces = (this.Enabled && this.PhysicsSurface)
                ? [...this.BaseSurfaces, this.PhysicsSurface]
                : this.BaseSurfaces.slice();
        }
        // ② Station Hovering Robotic Intersection Traffic Lights above any spline junction with TrafficLight === true!
        if (this.Host.TrafficLights)
        {
            const JunctionSignals = this.Project.Nodes
                .filter((N) => N.TrafficLight)
                .map((N) =>
                {
                    const Incident = this.Project.Roads.find((R) => R.Start === N.Id || R.End === N.Id);
                    let Yaw = 0.0;
                    if (Incident)
                    {
                        const H = Incident.Start === N.Id ? Incident.H1 : Incident.H2;
                        Yaw = Math.atan2(H[1], H[0]);
                    }
                    return { Name: N.Name, Position: N.Position, Yaw };
                });
            this.Host.TrafficLights.SyncEditorJunctionSignals(JunctionSignals);
            this.Host.UploadTrafficLightOccupants?.();
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                  SPLINE EDITING ACTIONS & PRESET INSERTION
    //--------------------------------------------------------------------------------------------------------------------

    AddPresetTemplate(TemplateId)
    {
        const Template = RoadPresetTemplates.find((T) => T.Id === TemplateId);
        if (!Template)
            return false;
        this.PushUndoSnapshot();
        const Anchor = [this.ViewCenter[0], this.ViewCenter[1]];
        const EntryNode = Template.Build(this.Project, Anchor);
        const LastRoad = this.Project.Roads[this.Project.Roads.length - 1];
        this.Selection = LastRoad ? { Kind: "road", Id: LastRoad.Id } : { Kind: "node", Id: EntryNode.Id };
        this.FitViewToNetwork();
        this.CommitChanges(`Added ${Template.Label.replace(/^\+\s*/, "")}`);
        return true;
    }

    AddQuickStraightOrCurve(Curved = true)
    {
        this.PushUndoSnapshot();
        const BaseNode = (this.Selection?.Kind === "node")
            ? this.Project.Nodes.find((N) => N.Id === this.Selection.Id)
            : null;
        const StartNode = BaseNode || CreateRoadNode([this.ViewCenter[0] - 20.0, this.ViewCenter[1], 0.0], `Node ${this.Project.Nodes.length + 1}`);
        if (!BaseNode)
            this.Project.Nodes.push(StartNode);
        const EndPos = [
            StartNode.Position[0] + 38.0,
            StartNode.Position[1] + (Curved ? 18.0 : 0.0),
            StartNode.Position[2]
        ];
        const EndNode = CreateRoadNode(EndPos, `Node ${this.Project.Nodes.length + 1}`);
        this.Project.Nodes.push(EndNode);
        const NewRoad = CreateSplineRoad(this.Project, StartNode.Id, EndNode.Id, {
            Name:    `Spline ${this.Project.Roads.length + 1}`,
            Width:   this.NewRoadWidth,
            Style:   this.NewRoadStyle,
            H1:      Curved ? [18.0,  0.0, 0.0] : [12.6, 0.0, 0.0],
            H2:      Curved ? [-18.0, 0.0, 0.0] : [-12.6, 0.0, 0.0],
            BankDeg: Curved && this.NewRoadStyle === "race" ? 10.0 : 0.0
        });
        this.Project.Roads.push(NewRoad);
        if (BaseNode)
            AutoSmoothNodeTangents(this.Project, BaseNode.Id);
        this.Selection = { Kind: "road", Id: NewRoad.Id };
        this.CommitChanges(`Added ${NewRoad.Name}`);
        return NewRoad;
    }

    SmoothSelectedTangents()
    {
        const Node = this.GetSelectedNode();
        const Road = this.GetSelectedRoad();
        this.PushUndoSnapshot();
        if (Node)
            AutoSmoothNodeTangents(this.Project, Node.Id);
        if (Road)
        {
            AutoSmoothNodeTangents(this.Project, Road.Start);
            AutoSmoothNodeTangents(this.Project, Road.End);
        }
        this.CommitChanges("Smoothed C¹ spline tangents");
    }

    SplitSelectedRoadMidpoint()
    {
        const Road = this.GetSelectedRoad();
        if (!Road)
            return null;
        this.PushUndoSnapshot();
        const Mid = SplitSplineRoadAt(this.Project, Road.Id, 0.5);
        if (Mid)
        {
            this.Selection = { Kind: "node", Id: Mid.Id };
            this.CommitChanges(`Split ${Road.Name} at midpoint`);
        }
        return Mid;
    }

    DeleteSelected()
    {
        if (!this.Selection)
            return false;
        this.PushUndoSnapshot();
        const Removed = DeleteSelectionFromProject(this.Project, this.Selection);
        this.Selection = null;
        this.ValidateSelection();
        if (Removed)
            this.CommitChanges("Deleted selected spline element");
        return Removed;
    }

    DriveOnSelectedRoad()
    {
        if (!this.Host)
            return;
        const Road = this.GetSelectedRoad();
        if (Road)
        {
            const Align = this.Alignments.find((A) => A.Road.Id === Road.Id);
            if (Align && Align.Stations.length > 1)
            {
                const St = Align.Stations[Math.min(1, Align.Stations.length - 1)];
                const YawDeg = Math.atan2(St.Tangent[1], St.Tangent[0]) * 180.0 / Math.PI;
                this.Host.Vehicle.Respawn([St.P[0], St.P[1], St.P[2] + 0.68], YawDeg * Math.PI / 180.0);
                this.Host.AfterVehicleMoved();
                this.Host.Shell?.Announce(`Driving on ${Road.Name}`);
                return;
            }
        }
        const Node = this.GetSelectedNode();
        if (Node)
        {
            this.Host.Vehicle.Respawn([Node.Position[0], Node.Position[1], Node.Position[2] + 0.68], 0.0);
            this.Host.AfterVehicleMoved();
            this.Host.Shell?.Announce(`Teleported to ${Node.Name}`);
        }
    }

    FitViewToNetwork()
    {
        if (this.Project.Nodes.length === 0)
            return;
        let MinX = Infinity, MaxX = -Infinity, MinY = Infinity, MaxY = -Infinity;
        for (const N of this.Project.Nodes)
        {
            MinX = Math.min(MinX, N.Position[0]);
            MaxX = Math.max(MaxX, N.Position[0]);
            MinY = Math.min(MinY, N.Position[1]);
            MaxY = Math.max(MaxY, N.Position[1]);
        }
        this.ViewCenter = [0.5 * (MinX + MaxX), 0.5 * (MinY + MaxY)];
        this.ViewHalfSpan = Math.max(36.0, 0.68 * Math.max(MaxX - MinX, MaxY - MinY) + 18.0);
    }

    FocusViewOnCar()
    {
        const Pos = this.Host?.Vehicle?.Position;
        if (!Pos)
            return;
        this.ViewCenter = [Pos[0], Pos[1]];
        this.ViewHalfSpan = 64.0;
    }

    ExportJson()
    {
        return JSON.stringify(this.Project, null, 2);
    }

    ImportJson(Text)
    {
        const Parsed = JSON.parse(Text);
        if (!Parsed || !Array.isArray(Parsed.Nodes) || !Array.isArray(Parsed.Roads))
            throw new Error("Invalid spline road JSON");
        this.PushUndoSnapshot();
        this.Project = Parsed;
        this.ValidateSelection();
        this.FitViewToNetwork();
        this.CommitChanges(`Imported ${Parsed.Roads.length} spline roads`);
    }

    QuerySummary()
    {
        let TotalLength = 0.0;
        let MinRadius = Infinity;
        for (const A of this.Alignments)
        {
            TotalLength += A.Length;
            MinRadius = Math.min(MinRadius, A.MinRadius);
        }
        const ActiveRoad = this.GetSelectedRoad();
        const ActiveAlign = ActiveRoad ? this.Alignments.find((A) => A.Road.Id === ActiveRoad.Id) : null;
        return {
            RoadCount:    this.Project.Roads.length,
            NodeCount:    this.Project.Nodes.length,
            TotalLength,
            ActiveLength: ActiveAlign ? ActiveAlign.Length : TotalLength,
            MinRadius:    Number.isFinite(ActiveAlign?.MinRadius) ? ActiveAlign.MinRadius : (Number.isFinite(MinRadius) ? MinRadius : 0.0)
        };
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                 HIT-TESTING & WORLD-SPACE POINTER INTERACTION
    //--------------------------------------------------------------------------------------------------------------------

    FindSnapTarget(WorldXY, SnapRadius = 5.5)
    {
        if (!this.SnapEnabled)
            return null;
        let BestNode = null;
        let BestDist = SnapRadius;
        for (const Node of this.Project.Nodes)
        {
            const Dist = Math.hypot(WorldXY[0] - Node.Position[0], WorldXY[1] - Node.Position[1]);
            if (Dist < BestDist)
            {
                BestDist = Dist;
                BestNode = Node;
            }
        }
        if (BestNode)
            return { Kind: "node", Node: BestNode, Point: BestNode.Position.slice() };
        return null;
    }

    HitTestWorld(WorldXY, PickRadiusMeters = 4.5)
    {
        // ① Check active road's Cubic Bézier Tangent Handles (H1 & H2) first so sculpting curves feels effortless!
        const SelRoad = this.GetSelectedRoad();
        if (SelRoad)
        {
            const Ctrl = ResolveRoadControlPoints(this.Project, SelRoad);
            if (Ctrl)
            {
                if (Math.hypot(WorldXY[0] - Ctrl[1][0], WorldXY[1] - Ctrl[1][1]) <= PickRadiusMeters * 1.1)
                    return { Kind: "h1", Road: SelRoad, Point: Ctrl[1] };
                if (Math.hypot(WorldXY[0] - Ctrl[2][0], WorldXY[1] - Ctrl[2][1]) <= PickRadiusMeters * 1.1)
                    return { Kind: "h2", Road: SelRoad, Point: Ctrl[2] };
            }
        }

        // ② Check Junction Nodes
        for (const Node of this.Project.Nodes)
        {
            if (Math.hypot(WorldXY[0] - Node.Position[0], WorldXY[1] - Node.Position[1]) <= PickRadiusMeters * 1.15)
                return { Kind: "node", Node, Point: Node.Position };
        }

        // ③ Check Spline Road Alignments
        let BestRoadHit = null;
        for (const Align of this.Alignments)
        {
            const Hit = QueryClosestOnRoad(Align, WorldXY);
            const Threshold = Math.max(PickRadiusMeters, 0.55 * Align.Road.Width);
            if (Hit.Distance <= Threshold && (!BestRoadHit || Hit.Distance < BestRoadHit.Distance))
                BestRoadHit = { Kind: "road", Road: Align.Road, T: Hit.T, Point: Hit.Point, Distance: Hit.Distance };
        }
        return BestRoadHit;
    }

    HandleWorldClick(WorldXY, PickRadiusMeters = 4.5)
    {
        const Hit = this.HitTestWorld(WorldXY, PickRadiusMeters);

        if (this.ToolMode === "delete")
        {
            if (Hit && (Hit.Kind === "road" || Hit.Kind === "node"))
            {
                this.Selection = { Kind: Hit.Kind, Id: Hit.Kind === "road" ? Hit.Road.Id : Hit.Node.Id };
                return this.DeleteSelected();
            }
            return false;
        }

        if (this.ToolMode === "split")
        {
            if (Hit && Hit.Kind === "road")
            {
                this.PushUndoSnapshot();
                const MidNode = SplitSplineRoadAt(this.Project, Hit.Road.Id, Hit.T);
                if (MidNode)
                {
                    this.Selection = { Kind: "node", Id: MidNode.Id };
                    this.CommitChanges(`Inserted spline anchor on ${Hit.Road.Name}`);
                    return true;
                }
            }
            return false;
        }

        if (this.ToolMode === "draw")
        {
            this.PushUndoSnapshot();
            const Snap = this.FindSnapTarget(WorldXY, PickRadiusMeters * 1.4);
            let TargetNode = Snap ? Snap.Node : null;
            if (!TargetNode)
            {
                const DefaultZ = this.NewRoadStyle === "bridge" && this.DrawChainNodeId ? 4.2 : 0.0;
                TargetNode = CreateRoadNode([WorldXY[0], WorldXY[1], DefaultZ], `Junction ${this.Project.Nodes.length + 1}`);
                this.Project.Nodes.push(TargetNode);
            }

            if (this.DrawChainNodeId && this.DrawChainNodeId !== TargetNode.Id)
            {
                const PrevExists = this.Project.Nodes.some((N) => N.Id === this.DrawChainNodeId);
                if (PrevExists)
                {
                    const Road = CreateSplineRoad(this.Project, this.DrawChainNodeId, TargetNode.Id, {
                        Name:       `Spline Road ${this.Project.Roads.length + 1}`,
                        Width:      this.NewRoadWidth,
                        Style:      this.NewRoadStyle,
                        Guardrails: this.NewRoadStyle === "bridge"
                    });
                    this.Project.Roads.push(Road);
                    AutoSmoothNodeTangents(this.Project, this.DrawChainNodeId);
                    this.Selection = { Kind: "road", Id: Road.Id };
                }
            }
            else
            {
                this.Selection = { Kind: "node", Id: TargetNode.Id };
            }
            this.DrawChainNodeId = TargetNode.Id;
            this.CommitChanges(Snap ? `Connected spline to ${TargetNode.Name}` : `Placed ${TargetNode.Name}`);
            return true;
        }

        // Select mode
        this.DrawChainNodeId = null;
        if (Hit)
        {
            if (Hit.Kind === "node")
                this.Selection = { Kind: "node", Id: Hit.Node.Id };
            else if (Hit.Kind === "road" || Hit.Kind === "h1" || Hit.Kind === "h2")
                this.Selection = { Kind: "road", Id: Hit.Road.Id };
            this.Host?.Shell?.Controls?.Synchronise();
            return true;
        }
        return false;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       SUN-UI-STYLED INTERACTIVE SPLINE INSTRUMENT CANVAS (2D PLAN + HANDLES)
    //--------------------------------------------------------------------------------------------------------------------

    DrawSunStyleSplineInstrument(Context, Width, Height)
    {
        if (!Context || !Context.beginPath)
            return;

        const Aspect = Width / Math.max(1.0, Height);
        const SpanY  = this.ViewHalfSpan;
        const SpanX  = SpanY * Aspect;
        const [CX, CY] = this.ViewCenter;

        const ToScreen = (WX, WY) => [
            ((WX - CX) / SpanX * 0.5 + 0.5) * Width,
            (0.5 - (WY - CY) / SpanY * 0.5) * Height
        ];

        // ① Sun-UI Crisp Dark Slate Background & Subtle Engineering Grid (#141414 + #262626 rules)
        Context.fillStyle = "#141414";
        Context.fillRect(0, 0, Width, Height);

        const GridStep = SpanY > 120 ? 50.0 : (SpanY > 55 ? 25.0 : 10.0);
        Context.strokeStyle = "#232323";
        Context.lineWidth = 1;
        Context.beginPath();
        const StartGX = Math.floor((CX - SpanX) / GridStep) * GridStep;
        for (let GX = StartGX; GX <= CX + SpanX; GX += GridStep)
        {
            const [SX] = ToScreen(GX, CY);
            Context.moveTo(SX, 0);
            Context.lineTo(SX, Height);
        }
        const StartGY = Math.floor((CY - SpanY) / GridStep) * GridStep;
        for (let GY = StartGY; GY <= CY + SpanY; GY += GridStep)
        {
            const [, SY] = ToScreen(CX, GY);
            Context.moveTo(0, SY);
            Context.lineTo(Width, SY);
        }
        Context.stroke();

        // ② Context Reference Track Corridors (Tracks A–H subtle silhouettes so connecting roads is intuitive!)
        if (this.LevelKey === "inversion")
        {
            Context.strokeStyle = "#2b2b2e";
            Context.lineWidth = 3;
            const Corridors = [
                [-140, -36, 200, -36], [-140, 36, 200, 36],     // Track A
                [-140, 84, 200, 84],   [-140, 166, 200, 166],   // Track B
                [-140, -94, 200, -94], [-140, -250, 200, -250], // Track C & D
                [-140, 256, 200, 256], [-140, 325, 200, 325],   // Track E & F
                [-140, -386, 200, -386], [-140, 408, 124, 408]  // Track G & H Factory
            ];
            for (const [X0, Y0, X1, Y1] of Corridors)
            {
                const [S0X, S0Y] = ToScreen(X0, Y0);
                const [S1X, S1Y] = ToScreen(X1, Y1);
                Context.beginPath();
                Context.moveTo(S0X, S0Y);
                Context.lineTo(S1X, S1Y);
                Context.stroke();
            }
            // Factory Hall footprint outline
            const [FX0, FY1] = ToScreen(12.0, 436.0);
            const [FX1, FY0] = ToScreen(124.0, 380.0);
            Context.strokeStyle = "#323846";
            Context.strokeRect(FX0, FY1, FX1 - FX0, FY0 - FY1);
        }

        // ③ Draw Spline Road Ribbons (accurate metric carriageway width + dashed centerlines!)
        const PixelsPerMeter = (0.5 * Height) / SpanY;
        const SelectedRoad = this.GetSelectedRoad();

        for (const Align of this.Alignments)
        {
            const IsSel = SelectedRoad && Align.Road.Id === SelectedRoad.Id;
            const RoadPx = Math.max(4.0, Align.Road.Width * PixelsPerMeter);

            // Outer kerb / selection halo
            Context.lineCap = "round";
            Context.lineJoin = "round";
            Context.strokeStyle = IsSel ? "rgba(255, 210, 122, 0.55)" : (Align.Road.Style === "bridge" ? "#5c6b82" : "#3f3f44");
            Context.lineWidth = RoadPx + (IsSel ? 5.0 : 2.0);
            Context.beginPath();
            Align.Stations.forEach((St, Idx) =>
            {
                const [SX, SY] = ToScreen(St.P[0], St.P[1]);
                if (Idx === 0) Context.moveTo(SX, SY);
                else           Context.lineTo(SX, SY);
            });
            Context.stroke();

            // Asphalt carriageway core
            Context.strokeStyle = Align.Road.Style === "race" ? "#2e2a2c" : "#28292d";
            Context.lineWidth = Math.max(2.5, RoadPx - 2.0);
            Context.stroke();

            // Sun-UI dashed centerline
            if (Align.Road.Markings)
            {
                Context.save();
                Context.setLineDash([7, 7]);
                Context.strokeStyle = IsSel ? "#ffd27a" : "#9a8650";
                Context.lineWidth = 1.6;
                Context.stroke();
                Context.restore();
            }
        }

        // ④ Draw Active Road's Cubic Bézier Tangent Arms & Glowing Sun-Gold Handle Orbs (identical visual language to DrawSunArc!)
        if (SelectedRoad)
        {
            const Ctrl = ResolveRoadControlPoints(this.Project, SelectedRoad);
            if (Ctrl)
            {
                const [S0, S1, S2, S3] = Ctrl.map((P) => ToScreen(P[0], P[1]));
                Context.save();
                Context.setLineDash([6, 7]);
                Context.strokeStyle = "#d9a95b";
                Context.lineWidth = 2.0;
                Context.beginPath();
                Context.moveTo(S0[0], S0[1]); Context.lineTo(S1[0], S1[1]);
                Context.moveTo(S3[0], S3[1]); Context.lineTo(S2[0], S2[1]);
                Context.stroke();
                Context.restore();

                for (const HandlePt of [S1, S2])
                {
                    const Glow = Context.createRadialGradient(HandlePt[0], HandlePt[1], 2, HandlePt[0], HandlePt[1], 20);
                    Glow.addColorStop(0, "rgba(255, 227, 160, 0.85)");
                    Glow.addColorStop(1, "rgba(0, 0, 0, 0)");
                    Context.fillStyle = Glow;
                    Context.beginPath();
                    Context.arc(HandlePt[0], HandlePt[1], 20, 0, 2.0 * Math.PI);
                    Context.fill();

                    Context.fillStyle = "#ffd27a";
                    Context.beginPath();
                    Context.arc(HandlePt[0], HandlePt[1], 6.5, 0, 2.0 * Math.PI);
                    Context.fill();
                }
            }
        }

        // ⑤ Draw Junction Anchor Nodes (+ Traffic Signal indicator ring!)
        for (const Node of this.Project.Nodes)
        {
            const [NX, NY] = ToScreen(Node.Position[0], Node.Position[1]);
            const IsSelNode = this.Selection?.Kind === "node" && this.Selection.Id === Node.Id;
            const IsChain   = this.ToolMode === "draw" && this.DrawChainNodeId === Node.Id;

            if (IsSelNode || IsChain)
            {
                const Glow = Context.createRadialGradient(NX, NY, 2, NX, NY, 24);
                Glow.addColorStop(0, "#ffe3a0");
                Glow.addColorStop(1, "rgba(0,0,0,0)");
                Context.fillStyle = Glow;
                Context.beginPath();
                Context.arc(NX, NY, 24, 0, 2.0 * Math.PI);
                Context.fill();
            }

            Context.fillStyle = Node.TrafficLight ? "#3ec46d" : (IsSelNode || IsChain ? "#ffd27a" : "#dcdcdc");
            Context.strokeStyle = "#141414";
            Context.lineWidth = 2.5;
            Context.beginPath();
            Context.arc(NX, NY, IsSelNode ? 8.0 : 6.2, 0, 2.0 * Math.PI);
            Context.fill();
            Context.stroke();
        }

        // ⑥ Draw rubber-band preview when in Draw mode
        if (this.ToolMode === "draw" && this.DrawChainNodeId && this.HoverWorld)
        {
            const ChainNode = this.Project.Nodes.find((N) => N.Id === this.DrawChainNodeId);
            if (ChainNode)
            {
                const [AX, AY] = ToScreen(ChainNode.Position[0], ChainNode.Position[1]);
                const [BX, BY] = ToScreen(this.HoverWorld[0], this.HoverWorld[1]);
                Context.save();
                Context.setLineDash([5, 6]);
                Context.strokeStyle = "#3ec46d";
                Context.lineWidth = 2.2;
                Context.beginPath();
                Context.moveTo(AX, AY);
                Context.lineTo(BX, BY);
                Context.stroke();
                Context.restore();
            }
        }

        // ⑦ Live ControlVehicle Marker
        const CarPos = this.Host?.Vehicle?.Position;
        if (CarPos)
        {
            const [VX, VY] = ToScreen(CarPos[0], CarPos[1]);
            Context.fillStyle = "#3ec46d";
            Context.beginPath();
            Context.arc(VX, VY, 5.5, 0, 2.0 * Math.PI);
            Context.fill();
        }

        // ⑧ Crisp Sun-UI Caption Footer
        Context.fillStyle = "#8a8a8a";
        Context.font = "20px DM Sans, sans-serif";
        const ModeCaption = {
            select: "drag nodes & gold Bézier handles · wheel zoom",
            draw:   "click to place & connect spline road · right-click finish",
            split:  "click any road curve to insert a spline junction",
            delete: "click any road or junction to remove"
        }[this.ToolMode] || "";
        Context.fillText(`${this.ToolMode.toUpperCase()} · ${ModeCaption}`, 20, Height - 14);
    }

    AttachInteractiveCanvas(Canvas, OnRedraw = null)
    {
        if (!Canvas || !Canvas.addEventListener)
            return;

        let DragState = null;

        const EventToWorld = (Event) =>
        {
            const Rect = Canvas.getBoundingClientRect();
            const U = (Event.clientX - Rect.left) / Math.max(1.0, Rect.width);
            const V = (Event.clientY - Rect.top)  / Math.max(1.0, Rect.height);
            const Aspect = Rect.width / Math.max(1.0, Rect.height);
            const SpanY = this.ViewHalfSpan;
            const SpanX = SpanY * Aspect;
            return {
                World: [
                    this.ViewCenter[0] + (U - 0.5) * 2.0 * SpanX,
                    this.ViewCenter[1] + (0.5 - V) * 2.0 * SpanY
                ],
                PickRadius: Math.max(2.5, (14.0 / Math.max(60.0, Rect.height)) * 2.0 * SpanY),
                SpanX,
                SpanY,
                Rect
            };
        };

        Canvas.addEventListener("contextmenu", (E) =>
        {
            E.preventDefault();
            this.DrawChainNodeId = null;
            OnRedraw?.();
        });

        Canvas.addEventListener("pointerdown", (Event) =>
        {
            const Info = EventToWorld(Event);
            if (Canvas.setPointerCapture)
                Canvas.setPointerCapture(Event.pointerId);

            // Middle-click, Right-click, or Alt+drag pans the plan view!
            if (Event.button === 1 || Event.button === 2 || Event.altKey)
            {
                DragState = {
                    Kind:       "pan",
                    StartX:     Event.clientX,
                    StartY:     Event.clientY,
                    StartCenter:this.ViewCenter.slice(),
                    SpanX:      Info.SpanX,
                    SpanY:      Info.SpanY,
                    RectW:      Math.max(1.0, Info.Rect.width),
                    RectH:      Math.max(1.0, Info.Rect.height)
                };
                return;
            }

            if (this.ToolMode === "select")
            {
                const Hit = this.HitTestWorld(Info.World, Info.PickRadius);
                if (Hit && (Hit.Kind === "h1" || Hit.Kind === "h2"))
                {
                    this.PushUndoSnapshot();
                    this.Selection = { Kind: "road", Id: Hit.Road.Id };
                    DragState = { Kind: Hit.Kind, Road: Hit.Road };
                    OnRedraw?.();
                    return;
                }
                if (Hit && Hit.Kind === "node")
                {
                    this.PushUndoSnapshot();
                    this.Selection = { Kind: "node", Id: Hit.Node.Id };
                    DragState = { Kind: "node", Node: Hit.Node };
                    this.Host?.Shell?.Controls?.Synchronise();
                    OnRedraw?.();
                    return;
                }
                if (Hit && Hit.Kind === "road")
                {
                    this.Selection = { Kind: "road", Id: Hit.Road.Id };
                    this.Host?.Shell?.Controls?.Synchronise();
                    OnRedraw?.();
                    return;
                }
                // Dragging empty background in Select mode smoothly pans!
                DragState = {
                    Kind:       "pan",
                    StartX:     Event.clientX,
                    StartY:     Event.clientY,
                    StartCenter:this.ViewCenter.slice(),
                    SpanX:      Info.SpanX,
                    SpanY:      Info.SpanY,
                    RectW:      Math.max(1.0, Info.Rect.width),
                    RectH:      Math.max(1.0, Info.Rect.height)
                };
                return;
            }

            this.HandleWorldClick(Info.World, Info.PickRadius);
            OnRedraw?.();
        });

        Canvas.addEventListener("pointermove", (Event) =>
        {
            const Info = EventToWorld(Event);
            this.HoverWorld = Info.World;

            if (!DragState)
            {
                if (this.ToolMode === "draw" && this.DrawChainNodeId)
                    OnRedraw?.();
                return;
            }

            if (DragState.Kind === "pan")
            {
                const DX = ((Event.clientX - DragState.StartX) / DragState.RectW) * 2.0 * DragState.SpanX;
                const DY = ((Event.clientY - DragState.StartY) / DragState.RectH) * 2.0 * DragState.SpanY;
                this.ViewCenter = [DragState.StartCenter[0] - DX, DragState.StartCenter[1] + DY];
                OnRedraw?.();
                return;
            }

            if (DragState.Kind === "node")
            {
                DragState.Node.Position[0] = Info.World[0];
                DragState.Node.Position[1] = Info.World[1];
                this.CommitChanges(null);
                OnRedraw?.();
                return;
            }

            if (DragState.Kind === "h1" || DragState.Kind === "h2")
            {
                const AnchorId = DragState.Kind === "h1" ? DragState.Road.Start : DragState.Road.End;
                const Anchor = this.Project.Nodes.find((N) => N.Id === AnchorId);
                if (Anchor)
                {
                    const Rel = [Info.World[0] - Anchor.Position[0], Info.World[1] - Anchor.Position[1], 0.0];
                    if (DragState.Kind === "h1") DragState.Road.H1 = Rel;
                    else                         DragState.Road.H2 = Rel;
                    this.CommitChanges(null);
                    OnRedraw?.();
                }
            }
        });

        const FinishDrag = () => { DragState = null; };
        Canvas.addEventListener("pointerup", FinishDrag);
        Canvas.addEventListener("pointercancel", FinishDrag);

        Canvas.addEventListener("wheel", (Event) =>
        {
            Event.preventDefault();
            const Factor = Event.deltaY > 0 ? 1.14 : 0.88;
            this.ViewHalfSpan = Math.max(16.0, Math.min(480.0, this.ViewHalfSpan * Factor));
            OnRedraw?.();
        }, { passive: false });
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                     EXPANDABLE SUN-UI FLOATING SPLINE STUDIO OVERLAY (INSIDE #overlay-dock)
    //--------------------------------------------------------------------------------------------------------------------

    ToggleFloatingStudio()
    {
        if (typeof document === "undefined")
            return false;
        const Dock = document.getElementById("overlay-dock");
        if (!Dock)
            return false;

        this.FloatingOpen = !this.FloatingOpen;
        if (!this.FloatingOpen)
        {
            Dock.classList.add("hidden");
            if (Dock.replaceChildren) Dock.replaceChildren();
            return false;
        }

        Dock.classList.remove("hidden");
        if (Dock.replaceChildren) Dock.replaceChildren();
        Dock.style.cssText = [
            "position:absolute", "left:18px", "bottom:18px", "width:min(540px, calc(100% - 36px))",
            "background:linear-gradient(180deg,#222 0%,#1a1a1c 100%)", "border:1px solid #323236",
            "border-radius:18px", "padding:14px 16px", "box-shadow:0 18px 48px rgba(0,0,0,0.62)",
            "z-index:30", "display:flex", "flex-direction:column", "gap:10px"
        ].join(";");

        // Clean Sun-UI Header Bar
        const Top = document.createElement("div");
        Top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
        const Title = document.createElement("div");
        Title.style.cssText = "font-weight:500;font-size:13px;color:#ececec;display:flex;align-items:center;gap:8px;";
        Title.textContent = "Spline Road Studio · Live 3D Curve & Bridge Sculptor";
        const CloseBtn = document.createElement("button");
        CloseBtn.textContent = "×";
        CloseBtn.title = "Close floating studio (E)";
        CloseBtn.style.cssText = "width:26px;height:26px;border-radius:8px;background:#2b2b2e;color:#dcdcdc;font-size:16px;";
        CloseBtn.addEventListener("click", () => this.ToggleFloatingStudio());
        Top.append(Title, CloseBtn);
        Dock.appendChild(Top);

        // Clean 4-Mode Segmented Pill Strip (Select · Draw · Split · Delete) + Quick Actions
        const Bar = document.createElement("div");
        Bar.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
        const ModeBtns = [];
        const RefreshBar = () =>
        {
            for (const [Btn, M] of ModeBtns)
            {
                const Active = this.ToolMode === M;
                Btn.style.background = Active ? "#ffd27a" : "#28282c";
                Btn.style.color      = Active ? "#141414" : "#cfcfcf";
                Btn.style.fontWeight = Active ? "600" : "400";
            }
        };
        for (const [Label, Mode] of [["Select", "select"], ["Draw Road", "draw"], ["Split", "split"], ["Delete", "delete"]])
        {
            const Btn = document.createElement("button");
            Btn.textContent = Label;
            Btn.style.cssText = "padding:5px 11px;border-radius:9px;font-size:12px;";
            Btn.addEventListener("click", () =>
            {
                this.ToolMode = Mode;
                this.DrawChainNodeId = null;
                RefreshBar();
                RedrawFloating();
                this.Host?.Shell?.Controls?.Synchronise();
            });
            ModeBtns.push([Btn, Mode]);
            Bar.appendChild(Btn);
        }

        const QuickBtn = (Text, Fn) =>
        {
            const B = document.createElement("button");
            B.textContent = Text;
            B.style.cssText = "padding:5px 10px;border-radius:9px;background:#26262a;border:1px solid #35353a;color:#dcdcdc;font-size:12px;";
            B.addEventListener("click", () => { Fn(); RedrawFloating(); });
            Bar.appendChild(B);
        };
        QuickBtn("Smooth C¹", () => this.SmoothSelectedTangents());
        QuickBtn("Fit", () => this.FitViewToNetwork());
        QuickBtn("Car", () => this.FocusViewOnCar());
        QuickBtn("Drive Here", () => this.DriveOnSelectedRoad());
        Dock.appendChild(Bar);
        RefreshBar();

        // Large Interactive Sun-UI Spline Canvas
        const Canvas = document.createElement("canvas");
        Canvas.width = 1040;
        Canvas.height = 560;
        Canvas.style.cssText = "width:100%;height:280px;border-radius:12px;border:1px solid #2e2e32;cursor:crosshair;touch-action:none;";
        Dock.appendChild(Canvas);

        const Ctx = Canvas.getContext("2d");
        const RedrawFloating = () =>
        {
            if (!Ctx || !Ctx.beginPath)
                return;
            Ctx.clearRect(0, 0, Canvas.width, Canvas.height);
            this.DrawSunStyleSplineInstrument(Ctx, Canvas.width, Canvas.height);
        };
        this.AttachInteractiveCanvas(Canvas, RedrawFloating);
        this.FloatingRedraw = RedrawFloating;
        RedrawFloating();
        return true;
    }
}
