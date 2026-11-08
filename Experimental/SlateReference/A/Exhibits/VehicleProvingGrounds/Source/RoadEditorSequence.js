//============================================================================================================================================
//                                                        ROADEDITORSEQUENCE.JS
//============================================================================================================================================
// Manages the dedicated Frontier Road Studio Workspace (RoadStudio.html) AND live-streams its full engineering-grade
// road, junction, highway-bridge, girder, pier, barrier, embankment, and mobility network into Proving Grounds'
// WebGPU VertexRecords + 480 Hz CastSurfaceRay vehicle physics + Hovering Robotic Traffic Lights.

import { VertexStride, OccupantRole } from "./FacetStructure.js";
import {
    RoadStudioVertexCapacity,
    CreateStarterStudioProject,
    CompileStudioProjectForWorld,
    ResolveSpawnPoseForSelection,
    makeTemplate,
    parseProject,
    presets,
    templateCatalog,
    roadDefaults,
    insertRoad,
    moveNode,
    deleteSelection,
    insertConnectedBridge
} from "./RoadStudioAdapter.js";

export const RoadEditorVertexCapacity = RoadStudioVertexCapacity;

export class RoadEditorSequence
{
    constructor(Scene, LevelKey = "inversion")
    {
        this.Scene = Scene;
        this.LevelKey = LevelKey;
        this.Host = null;
        this.Enabled = true;
        this.ActiveWorkspace = "proving"; // "proving" | "roadstudio"
        this.FloatingOpen = false;

        this.Project = CreateStarterStudioProject(LevelKey);
        this.Selection = this.Project.roads[0]
            ? { kind: "road", id: this.Project.roads[0].id }
            : (this.Project.nodes[0] ? { kind: "node", id: this.Project.nodes[0].id } : null);

        this.UndoStack = [];
        this.RedoStack = [];
        this.Compiled = null;
        this.RegisteredSurfaces = [];
        this.StudioFrame = null;
        this.StudioBound = false;
        this.SyncTimer = null;
        this.SuppressStudioEcho = false;

        this.RebuildWorldNetwork();
    }

    AttachHost(Host)
    {
        this.Host = Host;
        this.PushGeometryToGpu();
        this.SyncPhysicsSurfaces();
        this.SyncTrafficSignals();
        this.BindWorkspaceDom();
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                              DEDICATED ROAD STUDIO WORKSPACE SWITCHER & IFRAME BRIDGE
    //--------------------------------------------------------------------------------------------------------------------

    BindWorkspaceDom()
    {
        if (typeof document === "undefined")
            return;

        const Bar = document.getElementById("workspace-bar");
        if (Bar && !Bar.dataset.bound)
        {
            Bar.dataset.bound = "1";
            Bar.addEventListener("click", (Event) =>
            {
                const Tab = Event.target.closest("[data-workspace-tab]");
                if (Tab)
                {
                    this.SetActiveWorkspace(Tab.dataset.workspaceTab);
                    return;
                }
                const Action = Event.target.closest("[data-workspace-action]");
                if (Action?.dataset.workspaceAction === "drive-network")
                {
                    this.SyncFromEmbeddedStudioNow();
                    this.SetActiveWorkspace("proving");
                    this.DriveOnSelectedRoad();
                }
                else if (Action?.dataset.workspaceAction === "open-studio")
                {
                    this.SetActiveWorkspace("roadstudio");
                }
            });
        }

        const Frame = document.getElementById("road-studio-frame");
        if (Frame && !this.StudioFrame)
        {
            this.StudioFrame = Frame;
            Frame.addEventListener("load", () => this.AttachStudioWindow());
            if (Frame.contentWindow && Frame.contentDocument?.readyState === "complete")
                this.AttachStudioWindow();
        }

        if (typeof window !== "undefined" && !this.MessageBound)
        {
            this.MessageBound = true;
            window.addEventListener("message", (Event) =>
            {
                if (Event.origin !== window.location.origin || !Event.data)
                    return;
                if (Event.data.type === "frontier:drive" && Event.data.project)
                {
                    this.SyncFromStudio(Event.data.project, Event.data.selection || null, true);
                    this.SetActiveWorkspace("proving");
                    this.DriveOnSelectedRoad();
                }
            });
        }

        this.UpdateWorkspaceBarUi();
    }

    AttachStudioWindow()
    {
        const Win = this.StudioFrame?.contentWindow;
        if (!Win || Win.__provingGroundsBound)
            return;
        Win.__provingGroundsBound = true;

        // Push current world project into Studio on initial attach so both workspaces share identical state
        if (Win.frontier && typeof Win.frontier.setProject === "function")
        {
            this.SuppressStudioEcho = true;
            try
            {
                Win.frontier.setProject(this.Project);
            }
            finally
            {
                this.SuppressStudioEcho = false;
            }
        }

        Win.addEventListener("frontier:change", (Event) =>
        {
            if (this.SuppressStudioEcho || !Event?.detail?.project)
                return;
            const NextProject = Event.detail.project;
            const NextSel = Win.frontier?.getSelection?.() ?? null;
            if (this.SyncTimer)
                clearTimeout(this.SyncTimer);
            this.SyncTimer = setTimeout(() =>
            {
                this.SyncTimer = null;
                this.SyncFromStudio(NextProject, NextSel, false);
            }, 90);
        });

        Win.addEventListener("frontier:drive", (Event) =>
        {
            if (this.SyncTimer)
            {
                clearTimeout(this.SyncTimer);
                this.SyncTimer = null;
            }
            if (Event?.detail?.project)
                this.SyncFromStudio(Event.detail.project, Event.detail.selection ?? null, true);
            this.SetActiveWorkspace("proving");
            this.DriveOnSelectedRoad();
        });
    }

    SyncFromEmbeddedStudioNow()
    {
        const Win = this.StudioFrame?.contentWindow;
        if (!Win?.frontier)
            return;
        if (this.SyncTimer)
        {
            clearTimeout(this.SyncTimer);
            this.SyncTimer = null;
        }
        const StudioProject = Win.frontier.getProject?.();
        const StudioSelection = Win.frontier.getSelection?.() ?? null;
        if (StudioProject)
            this.SyncFromStudio(StudioProject, StudioSelection, true);
    }

    PushProjectToEmbeddedStudio()
    {
        const Win = this.StudioFrame?.contentWindow;
        if (!Win?.frontier?.setProject)
            return;
        this.SuppressStudioEcho = true;
        try
        {
            Win.frontier.setProject(this.Project);
        }
        finally
        {
            this.SuppressStudioEcho = false;
        }
    }

    SetActiveWorkspace(Mode)
    {
        const Target = Mode === "roadstudio" ? "roadstudio" : "proving";
        if (Target === "roadstudio" && typeof document !== "undefined")
        {
            // Lazy-boot iframe src on first open if deferred, or ensure it is loaded
            if (this.StudioFrame && !this.StudioFrame.getAttribute("src"))
                this.StudioFrame.setAttribute("src", "RoadStudio.html?embedded=1");
            else
                this.PushProjectToEmbeddedStudio();
        }
        else if (Target === "proving" && this.ActiveWorkspace === "roadstudio")
        {
            this.SyncFromEmbeddedStudioNow();
        }

        this.ActiveWorkspace = Target;
        this.FloatingOpen = Target === "roadstudio";
        if (typeof document !== "undefined")
        {
            document.body.classList.toggle("workspace-road-studio", Target === "roadstudio");
            const Container = document.getElementById("road-studio-workspace");
            if (Container)
                Container.classList.toggle("hidden", Target !== "roadstudio");
        }
        this.UpdateWorkspaceBarUi();
        if (Target === "proving" && this.Host)
        {
            this.Host.Resize?.();
            this.Host.Shell?.Refresh?.();
        }
        return this.FloatingOpen;
    }

    OpenWorkspace()
    {
        return this.SetActiveWorkspace("roadstudio");
    }

    CloseWorkspace()
    {
        return this.SetActiveWorkspace("proving");
    }

    ToggleWorkspace()
    {
        return this.SetActiveWorkspace(this.ActiveWorkspace === "roadstudio" ? "proving" : "roadstudio");
    }

    // Alias preserved for keyboard shortcut E & viewport toolbar button
    ToggleFloatingStudio()
    {
        return this.ToggleWorkspace();
    }

    UpdateWorkspaceBarUi()
    {
        if (typeof document === "undefined")
            return;
        document.querySelectorAll("[data-workspace-tab]").forEach((Btn) =>
        {
            const Active = Btn.dataset.workspaceTab === this.ActiveWorkspace;
            Btn.classList.toggle("active", Active);
            Btn.setAttribute("aria-selected", String(Active));
        });
        const MetaEl = document.getElementById("workspace-network-meta");
        if (MetaEl)
        {
            const Summary = this.QuerySummary();
            MetaEl.textContent = `${Summary.ProjectName} · ${Summary.RoadCount} roads · ${Summary.BridgeCount} bridges`;
        }
        const DriveBtn = document.querySelector("[data-workspace-action='drive-network']");
        const StudioBtn = document.querySelector("[data-workspace-action='open-studio']");
        if (DriveBtn)
            DriveBtn.classList.toggle("hidden", this.ActiveWorkspace !== "roadstudio");
        if (StudioBtn)
            StudioBtn.classList.toggle("hidden", this.ActiveWorkspace === "roadstudio");
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                  WORLD COMPILATION, GPU STREAMING & 480 HZ PHYSICS
    //--------------------------------------------------------------------------------------------------------------------

    PushUndoSnapshot()
    {
        this.UndoStack.push(JSON.stringify(this.Project));
        if (this.UndoStack.length > 32)
            this.UndoStack.shift();
        this.RedoStack.length = 0;
    }

    RebuildWorldNetwork()
    {
        if (!this.Enabled)
        {
            this.Compiled = {
                Network:         { spans: [], junctions: [], bridges: [], barriers: [], diagnostics: [], length: 0, triangles: 0 },
                Anchor:          [360.0, 0.0, 0.0],
                Vertices:        new Float32Array(0),
                VertexCount:     0,
                TriangleCount:   0,
                PhysicsSurfaces: [],
                DynamicSignals:  []
            };
            return;
        }
        this.Compiled = CompileStudioProjectForWorld(this.Project, {
            LevelKey:       this.LevelKey,
            VertexCapacity: RoadEditorVertexCapacity
        });
    }

    PushGeometryToGpu()
    {
        const Block = this.Scene?.RoadEditorBlock;
        if (!Block)
            return;
        const Set = this.Scene.FacetSets[Block.FacetSet];
        const Occ = this.Scene.Occupants[Block.Occupant];
        const Compiled = this.Compiled;
        if (!Set || !Occ || !Compiled)
            return;

        const ClampedVerts = Math.min(Compiled.VertexCount, Set.VertexCapacity || RoadEditorVertexCapacity);
        Set.Vertices = Compiled.Vertices.subarray(0, ClampedVerts * 8);
        Set.VertexCount = ClampedVerts;

        if (ClampedVerts > 0 && this.Enabled)
        {
            Occ.Roles |= OccupantRole.Raster;
            Occ.Inactive = false;
        }
        else
        {
            Occ.Roles &= ~OccupantRole.Raster;
            Occ.Inactive = true;
        }

        const Device = this.Host?.Exchange?.Device;
        const VertexBuffer = this.Host?.VertexRecords;
        if (Device && VertexBuffer && Number.isInteger(Set.FirstVertex) && ClampedVerts > 0)
        {
            const ByteOffset = Set.FirstVertex * VertexStride;
            Device.queue.writeBuffer(
                VertexBuffer,
                ByteOffset,
                Set.Vertices.buffer,
                Set.Vertices.byteOffset,
                ClampedVerts * VertexStride
            );
        }
    }

    SyncPhysicsSurfaces()
    {
        const Vehicle = this.Host?.Vehicle;
        if (!Vehicle || !Array.isArray(Vehicle.Surfaces))
            return;

        const OldSet = new Set(this.RegisteredSurfaces);
        const BaseSurfaces = Vehicle.Surfaces.filter((S) => !OldSet.has(S));
        const NextStudio = (this.Enabled && this.Compiled?.PhysicsSurfaces?.length)
            ? this.Compiled.PhysicsSurfaces
            : [];

        this.RegisteredSurfaces = NextStudio.slice();
        const Combined = [...BaseSurfaces, ...NextStudio];
        Vehicle.Surfaces = Combined;
        if (this.Host?.Chase)
            this.Host.Chase.Surfaces = Combined;
    }

    SyncTrafficSignals()
    {
        const Traffic = this.Scene?.TrafficLights;
        if (!Traffic)
            return;
        Traffic.SyncEditorJunctionSignals(this.Enabled ? (this.Compiled?.DynamicSignals ?? []) : []);
        this.Host?.UploadTrafficLightOccupants?.();
    }

    CommitChanges(Announcement = null, PushToStudio = true)
    {
        this.RebuildWorldNetwork();
        this.PushGeometryToGpu();
        this.SyncPhysicsSurfaces();
        this.SyncTrafficSignals();
        if (PushToStudio)
            this.PushProjectToEmbeddedStudio();
        this.UpdateWorkspaceBarUi();
        if (Announcement && this.Host?.Shell)
            this.Host.Shell.Announce(Announcement);
        this.Host?.Shell?.Refresh?.();
    }

    SyncFromStudio(NextProject, NextSelection = null, Announce = false)
    {
        this.Project = parseProject(JSON.parse(JSON.stringify(NextProject)));
        if (NextSelection)
            this.Selection = { ...NextSelection };
        this.CommitChanges(Announce ? `Synced ${this.Project.name} (${this.Project.roads.length} roads)` : null, false);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                  PROGRAMMATIC ROAD, BRIDGE & TEMPLATE OPERATIONS
    //--------------------------------------------------------------------------------------------------------------------

    LoadTemplate(TemplateId)
    {
        this.PushUndoSnapshot();
        const Next = TemplateId === "district" ? CreateStarterStudioProject(this.LevelKey) : makeTemplate(TemplateId);
        this.Project = Next;
        const BridgeRoad = this.Project.roads.find((R) => R.bridge) || this.Project.roads[0];
        this.Selection = BridgeRoad ? { kind: "road", id: BridgeRoad.id } : null;
        this.CommitChanges(`Loaded ${this.Project.name}`);
        return this.Project;
    }

    // Alias retained for compatibility
    AddPresetTemplate(TemplateId)
    {
        return this.LoadTemplate(TemplateId);
    }

    ApplyRoadPreset(PresetId)
    {
        const Preset = presets.find((P) => P.id === PresetId);
        if (!Preset)
            return false;
        const TargetRoad = this.GetSelectedRoad() || this.Project.roads[0];
        if (!TargetRoad)
            return false;
        this.PushUndoSnapshot();
        const Preserved = {
            bridge:      TargetRoad.bridge,
            bridgeFrom:  TargetRoad.bridgeFrom,
            bridgeTo:    TargetRoad.bridgeTo,
            embankment:  TargetRoad.embankment,
            structure:   TargetRoad.structure,
            bridgeDepth: TargetRoad.bridgeDepth,
            pierSpacing: TargetRoad.pierSpacing
        };
        Object.assign(TargetRoad, roadDefaults, Preset.settings, Preserved);
        this.CommitChanges(`Applied ${Preset.name}`);
        return true;
    }

    AddRoadBetween(StartPos, EndPos, Settings = {})
    {
        this.PushUndoSnapshot();
        const CreatedId = insertRoad(this.Project, StartPos, EndPos, { ...roadDefaults, ...Settings });
        if (!CreatedId)
            return null;
        const Created = this.Project.roads.find((R) => R.id === CreatedId) || null;
        this.Selection = { kind: "road", id: CreatedId };
        this.CommitChanges(`Added ${Created?.name || CreatedId}`);
        return Created;
    }

    InsertBridgeOnRoad(RoadId = null, RiseMeters = 7.2, Structure = "steel")
    {
        const TargetId = RoadId || this.GetSelectedRoad()?.id || this.Project.roads[0]?.id;
        if (!TargetId)
            return null;
        this.PushUndoSnapshot();
        try
        {
            const Result = insertConnectedBridge(this.Project, TargetId, { rise: RiseMeters, structure: Structure });
            const DeckId = Result?.deck?.id || Result?.deckId || TargetId;
            this.Selection = { kind: "road", id: DeckId };
            this.CommitChanges(`Inserted ${Structure} highway bridge (${RiseMeters.toFixed(1)} m)`);
            return Result || true;
        }
        catch (_Err)
        {
            const Road = this.Project.roads.find((R) => R.id === TargetId);
            if (!Road)
                return null;
            Road.bridge = true;
            Road.structure = Structure;
            Road.bridgeFrom = 0.18;
            Road.bridgeTo = 0.82;
            Road.guardrails = true;
            const StartNode = this.Project.nodes.find((N) => N.id === Road.start);
            const EndNode = this.Project.nodes.find((N) => N.id === Road.end);
            if (StartNode && EndNode && StartNode.position[1] < 1.0 && EndNode.position[1] < 1.0)
            {
                Road.h1[1] = RiseMeters;
                Road.h2[1] = RiseMeters;
            }
            this.Selection = { kind: "road", id: Road.id };
            this.CommitChanges(`Converted ${Road.name} to ${Structure} bridge span`);
            return Road;
        }
    }

    MoveJunction(NodeId, Position)
    {
        if (!NodeId || !Array.isArray(Position))
            return false;
        this.PushUndoSnapshot();
        moveNode(this.Project, NodeId, Position);
        this.CommitChanges("Moved shared junction pivot");
        return true;
    }

    ExportJson()
    {
        return JSON.stringify(this.Project, null, 2);
    }

    ImportJson(JsonString)
    {
        const Data = typeof JsonString === "string" ? JSON.parse(JsonString) : JsonString;
        this.PushUndoSnapshot();
        this.Project = parseProject(Data);
        this.Selection = this.Project.roads[0] ? { kind: "road", id: this.Project.roads[0].id } : null;
        this.CommitChanges(`Imported ${this.Project.name}`);
        return true;
    }

    DeleteSelected()
    {
        if (!this.Selection)
            return false;
        this.PushUndoSnapshot();
        deleteSelection(this.Project, this.Selection.kind, this.Selection.id);
        this.Selection = this.Project.roads[0] ? { kind: "road", id: this.Project.roads[0].id } : null;
        this.CommitChanges("Removed selected element");
        return true;
    }

    Undo()
    {
        if (this.UndoStack.length === 0)
            return false;
        this.RedoStack.push(JSON.stringify(this.Project));
        this.Project = JSON.parse(this.UndoStack.pop());
        this.CommitChanges("Undo road network edit");
        return true;
    }

    Redo()
    {
        if (this.RedoStack.length === 0)
            return false;
        this.UndoStack.push(JSON.stringify(this.Project));
        this.Project = JSON.parse(this.RedoStack.pop());
        this.CommitChanges("Redo road network edit");
        return true;
    }

    ResetToDefault()
    {
        this.PushUndoSnapshot();
        this.Project = CreateStarterStudioProject(this.LevelKey);
        this.Selection = this.Project.roads[0] ? { kind: "road", id: this.Project.roads[0].id } : null;
        this.CommitChanges("Reset Road Studio network to Northbank district");
    }

    GetSelectedRoad()
    {
        if (this.Selection?.kind === "road")
            return this.Project.roads.find((R) => R.id === this.Selection.id) || null;
        return null;
    }

    DriveOnSelectedRoad(CustomSelection = null)
    {
        if (!this.Host || !this.Compiled)
            return null;
        const Pose = ResolveSpawnPoseForSelection(this.Compiled, this.Project, CustomSelection || this.Selection);
        this.Host.Vehicle.Respawn(Pose.Position, Pose.YawRad);
        if (this.Host.Recovery)
            this.Host.Recovery.Safe = { Position: [Pose.Position[0], Pose.Position[1]], Yaw: Pose.YawRad };
        this.Host.AfterVehicleMoved();
        this.Host.Shell?.Announce(`Driving on ${Pose.Name}`);
        return Pose;
    }

    QuerySummary()
    {
        const Net = this.Compiled?.Network;
        const Title = this.Project?.name || "Northbank district";
        return {
            Name:          Title,
            ProjectName:   Title,
            Workspace:     this.ActiveWorkspace,
            Enabled:       this.Enabled,
            NodeCount:     this.Project?.nodes?.length ?? 0,
            RoadCount:     this.Project?.roads?.length ?? 0,
            SpanCount:     Net?.spans?.length ?? 0,
            JunctionCount: Net?.junctions?.length ?? 0,
            BridgeCount:   Net?.bridges?.filter((B) => B.kind === "span").length ?? 0,
            PhysicsCount:  this.Compiled?.PhysicsSurfaces?.length ?? 0,
            SignalCount:   this.Compiled?.DynamicSignals?.length ?? 0,
            LengthMeters:  Math.round(Net?.length ?? 0),
            TriangleCount: this.Compiled?.TriangleCount ?? 0,
            VertexCount:   this.Compiled?.VertexCount ?? 0,
            Anchor:        this.Compiled?.Anchor ?? [360.0, 0.0, 0.0]
        };
    }
}
